/**
 * Agent loop — single LLM, single conversation, direct tool calls.
 *
 * Replaces the entire graph/ directory (Scout → Orchestrator → Worker → Synthesis)
 * with one continuous loop that has full browser context.
 */

import type OpenAI from 'openai';
import type { EventBus } from '#observability/event-bus.js';
import type { LLMClient } from '#agent/llm-client.js';
import type { McpCall } from '#agent/mcp-bridge.js';
import { SYSTEM_PROMPT } from '#agent/prompts.js';
import { summarizeToolResult } from '#agent/snapshot-summarizer.js';

const DEFAULT_MAX_ITERATIONS = 30;
const MAX_NO_TOOL_RETRIES = 3;
const SLIDING_WINDOW_SIZE = 5;
const AGENT_NAME = 'agent';

// --- Tool Definitions ---

const FINISH_TOOL: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'finish_investigation',
    description: 'STOP the investigation and submit your bug report NOW. Call this AS SOON AS you find a bug — do not continue testing.',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Brief summary of the bug found' },
        rootCause: { type: 'string', description: 'Technical root cause analysis' },
        severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
        stepsToReproduce: { type: 'array', items: { type: 'string' }, description: 'Steps to reproduce the bug' },
        evidence: {
          type: 'object',
          properties: {
            consoleErrors: { type: 'array', items: { type: 'string' } },
            networkErrors: { type: 'array', items: { type: 'string' } },
          },
        },
        suggestedFix: { type: 'string', description: 'Suggested fix (if determinable)' },
      },
      required: ['summary', 'rootCause', 'severity', 'stepsToReproduce', 'evidence'],
    },
  },
};

const SOURCE_MAP_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'fetch_source_map',
      description: 'Fetch and parse a JavaScript source map from a bundle URL',
      parameters: {
        type: 'object',
        properties: { bundleUrl: { type: 'string' } },
        required: ['bundleUrl'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'resolve_error_location',
      description: 'Map a minified line:column to original source using a fetched source map',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          line: { type: 'number' },
          column: { type: 'number' },
        },
        required: ['url', 'line', 'column'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_source_file',
      description: 'Read original source code from a source map',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          filePath: { type: 'string' },
          startLine: { type: 'number' },
          endLine: { type: 'number' },
        },
        required: ['url', 'filePath'],
      },
    },
  },
];

// --- Types ---

export type FinishResult = {
  summary: string;
  rootCause: string;
  severity: string;
  stepsToReproduce: string[];
  evidence: {
    consoleErrors: string[];
    networkErrors: string[];
  };
  suggestedFix?: string | undefined;
};

export type AgentLoopDeps = {
  llm: LLMClient;
  playwrightCall: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  playwrightTools: OpenAI.Chat.ChatCompletionTool[];
  mcpCall: McpCall;
  eventBus: EventBus;
  maxIterations?: number | undefined;
};

// --- Core Loop ---

export const runAgentLoop = async (
  url: string,
  hint: string | null,
  deps: AgentLoopDeps,
): Promise<FinishResult | null> => {
  const maxIterations = deps.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const allTools = [...deps.playwrightTools, FINISH_TOOL, ...SOURCE_MAP_TOOLS];

  const userMessage = hint !== null && hint !== ''
    ? `URL: ${url}\nHint: ${hint}`
    : `URL: ${url}`;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ];

  deps.eventBus.emit({ type: 'investigation_phase', phase: 'investigating' });

  let noToolCount = 0;

  for (let i = 0; i < maxIterations; i++) {
    // --- LLM Call (with retry) ---
    const response = await callLLMWithRetry(deps, messages, allTools);

    const choice = response.choices[0];
    if (choice === undefined) break;
    const message = choice.message;

    // Emit usage
    if (response.usage !== undefined) {
      deps.eventBus.emit({
        type: 'llm_usage',
        agent: AGENT_NAME,
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
      });
    }

    // --- No tool calls → nudge ---
    if (message.tool_calls === undefined || message.tool_calls.length === 0) {
      noToolCount++;
      if (message.content !== null && message.content !== '') {
        deps.eventBus.emit({ type: 'reasoning', agent: AGENT_NAME, text: message.content });
      }

      if (noToolCount >= MAX_NO_TOOL_RETRIES) {
        deps.eventBus.emit({ type: 'error', agent: AGENT_NAME, message: 'Agent stopped calling tools, ending investigation.' });
        break;
      }

      messages.push(message);
      messages.push({ role: 'user', content: 'Continue by calling the appropriate tools. Do not explain, just call tools.' });
      continue;
    }

    noToolCount = 0;

    // Emit reasoning text (LLM thinking alongside tool calls)
    if (message.content !== null && message.content !== '') {
      deps.eventBus.emit({ type: 'reasoning', agent: AGENT_NAME, text: message.content });
    }

    messages.push(message);

    // --- Process tool calls ---
    for (const toolCall of message.tool_calls) {
      const toolName = toolCall.function.name;
      const args = parseArgs(toolCall.function.arguments);

      deps.eventBus.emit({ type: 'tool_call', agent: AGENT_NAME, tool: toolName, args });

      // --- finish_investigation → return result ---
      if (toolName === 'finish_investigation') {
        deps.eventBus.emit({ type: 'investigation_phase', phase: 'synthesizing' });
        return normalizeFinishResult(args);
      }

      // --- Execute tool ---
      const toolStartMs = Date.now();
      let result: unknown;
      let success = true;

      try {
        if (isSourceMapTool(toolName)) {
          result = await deps.mcpCall(toolName, args);
        } else {
          result = await deps.playwrightCall(toolName, args);
        }
      } catch (err) {
        result = `Error: ${err instanceof Error ? err.message : String(err)}`;
        success = false;
      }

      const toolElapsed = Date.now() - toolStartMs;
      const resultStr = stringifyResult(result);

      deps.eventBus.emit({
        type: 'tool_result',
        agent: AGENT_NAME,
        tool: toolName,
        success,
        durationMs: toolElapsed,
        result: resultStr.length > 2000 ? resultStr.slice(0, 2000) + '\n…(truncated)' : resultStr,
      });

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: summarizeToolResult(resultStr),
      });
    }

    // --- Sliding window: trim old tool results ---
    trimOldToolResults(messages as { role: string; content?: string | null | undefined }[], SLIDING_WINDOW_SIZE);

    // --- Force finish on last iteration ---
    if (i === maxIterations - 1) {
      messages.push({
        role: 'user',
        content: 'You have reached the maximum iterations. You MUST call finish_investigation NOW. If you found a bug, report it. If not, report summary="No bug found", severity="low". Do NOT call any other tool — ONLY finish_investigation.',
      });
    }
  }

  return null;
};

// --- Helpers ---

const parseArgs = (raw: string): Record<string, unknown> => {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const isSourceMapTool = (name: string): boolean =>
  name === 'fetch_source_map' || name === 'resolve_error_location' || name === 'read_source_file';

const LLM_MAX_RETRIES = 2;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

const sleep = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });

const getStatusCode = (err: unknown): number | null => {
  if (typeof err !== 'object' || err === null) return null;
  // OpenAI SDK errors have .status
  if ('status' in err && typeof (err as { status: unknown }).status === 'number') {
    return (err as { status: number }).status;
  }
  return null;
};

const callLLMWithRetry = async (
  deps: AgentLoopDeps,
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  tools: OpenAI.Chat.ChatCompletionTool[],
): Promise<OpenAI.Chat.ChatCompletion> => {
  for (let attempt = 0; attempt <= LLM_MAX_RETRIES; attempt++) {
    try {
      return await deps.llm.client.chat.completions.create({
        model: deps.llm.model,
        messages,
        tools,
      });
    } catch (err) {
      const statusCode = getStatusCode(err);
      const isRetryable = statusCode !== null && RETRYABLE_STATUS_CODES.has(statusCode);

      if (!isRetryable || attempt === LLM_MAX_RETRIES) {
        throw err;
      }

      const delayMs = 2000 * (attempt + 1);
      deps.eventBus.emit({
        type: 'error',
        agent: AGENT_NAME,
        message: `LLM returned ${String(statusCode)}, retrying in ${String(delayMs / 1000)}s (attempt ${String(attempt + 1)}/${String(LLM_MAX_RETRIES)})...`,
      });
      await sleep(delayMs);
    }
  }
  throw new Error('LLM retry exhausted');
};

/** Extract text from Playwright content arrays, otherwise stringify as-is. */
const stringifyResult = (result: unknown): string => {
  if (typeof result === 'string') return result;
  // Playwright MCP returns [{type: "text", text: "..."}]
  if (Array.isArray(result)) {
    const texts = result
      .filter((item): item is { text: string } =>
        typeof item === 'object' && item !== null && 'text' in item && typeof (item as { text: unknown }).text === 'string')
      .map((item) => item.text);
    if (texts.length > 0) return texts.join('\n');
  }
  return JSON.stringify(result);
};

/**
 * Sliding window — replace old tool results with short summaries
 * to keep the messages array from growing unbounded.
 */
const trimOldToolResults = (
  messages: { role: string; content?: string | null | undefined }[],
  windowSize: number,
): void => {
  // Count assistant messages to determine iterations
  let assistantCount = 0;
  for (const msg of messages) {
    if (msg.role === 'assistant') assistantCount++;
  }

  if (assistantCount <= windowSize) return;

  const trimBefore = assistantCount - windowSize;
  let seenAssistant = 0;

  for (const msg of messages) {
    if (msg.role === 'assistant') {
      seenAssistant++;
      if (seenAssistant > trimBefore) break;
    }

    // Trim old tool results to 1 line
    if (msg.role === 'tool' && seenAssistant <= trimBefore) {
      const content = msg.content ?? '';
      if (content.length > 200) {
        msg.content = content.slice(0, 150) + '\n…(old result trimmed)';
      }
    }
  }
};

const asString = (v: unknown, fallback: string): string =>
  typeof v === 'string' ? v : fallback;

const normalizeFinishResult = (args: Record<string, unknown>): FinishResult => {
  const raw = args['evidence'];

  // Extract consoleErrors + networkErrors from whatever shape the LLM sends
  let consoleErrors: string[] = [];
  let networkErrors: string[] = [];

  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    // Expected shape: { consoleErrors: [...], networkErrors: [...] }
    const ev = raw as Record<string, unknown>;
    consoleErrors = Array.isArray(ev['consoleErrors']) ? (ev['consoleErrors'] as string[]) : [];
    networkErrors = Array.isArray(ev['networkErrors']) ? (ev['networkErrors'] as string[]) : [];
  } else if (typeof raw === 'string' && raw.trim().length > 2) {
    // LLM sent evidence as a string — extract error-like lines
    consoleErrors = raw.split('\n').filter((l) => (/error|typeerror|referenceerror|uncaught/i).test(l));
  } else if (Array.isArray(raw)) {
    // LLM sent evidence as flat array
    consoleErrors = raw.map((e) => String(e));
  }

  // Fallback: check top-level consoleErrors/networkErrors (LLM might skip nesting)
  if (consoleErrors.length === 0 && Array.isArray(args['consoleErrors'])) {
    consoleErrors = args['consoleErrors'] as string[];
  }
  if (networkErrors.length === 0 && Array.isArray(args['networkErrors'])) {
    networkErrors = args['networkErrors'] as string[];
  }

  return {
    summary: asString(args['summary'], 'No summary provided'),
    rootCause: asString(args['rootCause'], 'Unknown'),
    severity: asString(args['severity'], 'medium'),
    stepsToReproduce: (args['stepsToReproduce'] as string[] | undefined) ?? [],
    evidence: { consoleErrors, networkErrors },
    suggestedFix: normalizeSuggestedFix(args['suggestedFix']),
  };
};

const normalizeSuggestedFix = (raw: unknown): string | undefined => {
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>;
    // LLM might send { explanation: "...", file: "...", ... }
    if (typeof obj['explanation'] === 'string') return obj['explanation'];
    return JSON.stringify(raw);
  }
  return undefined;
};
