/**
 * Investigator node — central reasoning loop with function calling.
 */

import {
  INVESTIGATION_STATUS,
  AGENT_NAME,
  TOOL_NAME,
  EVIDENCE_CATEGORY,
  EVIDENCE_TYPE,
} from '@ai-debug/shared';
import type { AgentState } from '#graph/state.js';
import type { EventBus } from '#observability/event-bus.js';
import type { LLMClient } from '#agent/llm-client.js';
import type { SkillRegistry } from '#agent/skill-registry.js';
import { INVESTIGATOR_SYSTEM_PROMPT } from '#agent/prompts.js';
import { parseToolCalls, hasToolCalls, getTextContent } from '#agent/tool-parser.js';
import type OpenAI from 'openai';

type InvestigatorDeps = {
  llmClient: LLMClient;
  eventBus: EventBus;
  mcpCall: (tool: string, args: Record<string, unknown>) => Promise<unknown>;
  skillRegistry?: SkillRegistry | undefined;
};

// --- Tool definitions for OpenAI function calling ---

const INVESTIGATOR_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: TOOL_NAME.DISPATCH_BROWSER_TASK,
      description: 'Send a browser task to the Explorer agent for execution. Use this to interact with the page (click, fill, navigate, inspect elements).',
      parameters: {
        type: 'object',
        properties: {
          task: { type: 'string', description: 'What the Explorer should do (e.g., "Click the login button and observe network requests")' },
          stopCondition: { type: 'string', description: 'When to stop (e.g., "When the response is received")' },
          collectEvidence: { type: 'array', items: { type: 'string' }, description: 'Evidence types to collect: "console", "network", "dom", "screenshot"' },
        },
        required: ['task'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: TOOL_NAME.FETCH_SOURCE_MAP,
      description: 'Fetch and parse the source map for a JavaScript bundle URL. Returns the original source files and mappings.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL of the JavaScript bundle to fetch the source map for' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: TOOL_NAME.RESOLVE_ERROR_LOCATION,
      description: 'Resolve a minified error location (line:column) to the original source file and line using a previously fetched source map.',
      parameters: {
        type: 'object',
        properties: {
          bundleUrl: { type: 'string', description: 'The URL of the bundle that was previously fetched' },
          line: { type: 'number', description: 'Line number in the minified bundle' },
          column: { type: 'number', description: 'Column number in the minified bundle' },
        },
        required: ['bundleUrl', 'line', 'column'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: TOOL_NAME.READ_SOURCE_FILE,
      description: 'Read lines from a source file (original, not minified) by line range.',
      parameters: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'Path to the source file' },
          startLine: { type: 'number', description: 'Start line (1-indexed)' },
          endLine: { type: 'number', description: 'End line (1-indexed)' },
        },
        required: ['file', 'startLine', 'endLine'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: TOOL_NAME.FINISH_INVESTIGATION,
      description: 'Finish the investigation and trigger synthesis of the final report. Call this when you have gathered enough evidence to identify the root cause.',
      parameters: {
        type: 'object',
        properties: {
          rootCause: { type: 'string', description: 'Brief root cause statement' },
          confidence: { type: 'number', description: 'Confidence score 0-1' },
          summary: { type: 'string', description: 'Summary of evidence gathered' },
        },
        required: ['rootCause', 'confidence'],
      },
    },
  },
];

// --- Message building ---

const buildMessages = (state: AgentState, deps: InvestigatorDeps): OpenAI.Chat.ChatCompletionMessageParam[] => {
  let systemPrompt: string = INVESTIGATOR_SYSTEM_PROMPT;
  if (deps.skillRegistry !== undefined && state.activeSkills.length > 0) {
    const skillContext = deps.skillRegistry.buildPromptContext(state.activeSkills);
    systemPrompt = `${INVESTIGATOR_SYSTEM_PROMPT}\n\n# Active Skills\n\n${skillContext}`;
  }

  const msgs: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
  ];
  if (state.initialObservations !== null) msgs.push({ role: 'user', content: `Scout observations:\n${JSON.stringify(state.initialObservations, null, 2)}` });
  if (state.hint !== null) msgs.push({ role: 'user', content: `User hint: ${state.hint}` });
  if (state.hypotheses.length > 0) msgs.push({ role: 'assistant', content: `Current hypotheses:\n${JSON.stringify(state.hypotheses, null, 2)}` });
  if (state.browserTaskResults.length > 0) {
    const latest = state.browserTaskResults[state.browserTaskResults.length - 1];
    msgs.push({ role: 'user', content: `Explorer result:\n${JSON.stringify(latest, null, 2)}` });
  }
  if (state.codeAnalysis !== null) msgs.push({ role: 'user', content: `Code analysis:\n${JSON.stringify(state.codeAnalysis, null, 2)}` });

  // Feed previous tool results so model doesn't repeat calls
  const toolEvidence = state.evidence
    .filter((e) => e.type === EVIDENCE_TYPE.SOURCE_CODE && typeof e.data === 'string')
    .slice(-5); // Last 5 tool results to stay within context limits
  if (toolEvidence.length > 0) {
    const toolContext = toolEvidence.map((e) => e.data).join('\n---\n');
    msgs.push({ role: 'user', content: `Previous tool results (do NOT repeat these calls):\n${toolContext}` });
  }

  return msgs;
};

// --- Tool call deduplication ---

const MAX_DUPLICATE_CALLS = 3;

class ToolCallTracker {
  private readonly cache = new Map<string, { result: unknown; count: number }>();

  private makeKey(name: string, args: Record<string, unknown>): string {
    return `${name}::${JSON.stringify(args, Object.keys(args).sort())}`;
  }

  getCached(name: string, args: Record<string, unknown>): { result: unknown; count: number } | undefined {
    const entry = this.cache.get(this.makeKey(name, args));
    if (entry === undefined) return undefined;
    entry.count++;
    return entry;
  }

  store(name: string, args: Record<string, unknown>, result: unknown): void {
    this.cache.set(this.makeKey(name, args), { result, count: 1 });
  }

  reset(): void {
    this.cache.clear();
  }
}

const toolTracker = new ToolCallTracker();

// --- Tool result enrichment ---

const NEXT_STEP_HINTS: Partial<Record<string, string>> = {
  [TOOL_NAME.FETCH_SOURCE_MAP]: '\n\n→ NEXT STEP: Call resolve_error_location with the line and column from the console error to find the original source file.',
  [TOOL_NAME.RESOLVE_ERROR_LOCATION]: '\n\n→ NEXT STEP: Call read_source_file with the file path and line range from above to read the buggy code.',
  [TOOL_NAME.READ_SOURCE_FILE]: '\n\n→ NEXT STEP: You now have the source code. Call finish_investigation with your root cause analysis.',
};

// --- Tool call execution ---

type ToolCallResult = { result: unknown; nextStatus: string | null; isDuplicate: boolean; dupCount: number };

const executeToolCall = async (name: string, args: Record<string, unknown>, deps: InvestigatorDeps): Promise<ToolCallResult> => {
  const cached = toolTracker.getCached(name, args);
  if (cached !== undefined) {
    deps.eventBus.emit({ type: 'tool_call', agent: AGENT_NAME.INVESTIGATOR, tool: name, args });
    deps.eventBus.emit({ type: 'tool_result', agent: AGENT_NAME.INVESTIGATOR, tool: name, success: true, durationMs: 0 });
    return { result: cached.result, nextStatus: null, isDuplicate: true, dupCount: cached.count };
  }

  const start = Date.now();
  deps.eventBus.emit({ type: 'tool_call', agent: AGENT_NAME.INVESTIGATOR, tool: name, args });

  try {
    const result = await deps.mcpCall(name, args);
    deps.eventBus.emit({ type: 'tool_result', agent: AGENT_NAME.INVESTIGATOR, tool: name, success: true, durationMs: Date.now() - start });
    toolTracker.store(name, args, result);

    const nextStatus = name === TOOL_NAME.DISPATCH_BROWSER_TASK ? INVESTIGATION_STATUS.WAITING_EXPLORER
      : name === TOOL_NAME.FINISH_INVESTIGATION ? INVESTIGATION_STATUS.SYNTHESIZING
      : null;
    return { result, nextStatus, isDuplicate: false, dupCount: 1 };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    deps.eventBus.emit({ type: 'tool_result', agent: AGENT_NAME.INVESTIGATOR, tool: name, success: false, durationMs: Date.now() - start });
    deps.eventBus.emit({ type: 'error', agent: AGENT_NAME.INVESTIGATOR, message: `Tool ${name} failed: ${message}` });
    return { result: { error: message }, nextStatus: null, isDuplicate: false, dupCount: 0 };
  }
};

// --- Main investigator logic ---

const emitUsage = (deps: InvestigatorDeps, usage: { prompt_tokens: number; completion_tokens: number }): void => {
  deps.eventBus.emit({
    type: 'llm_usage', agent: AGENT_NAME.INVESTIGATOR,
    promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens,
  });
};

const FORCE_SYNTHESIS_ITERATION = 10;

const invokeInvestigator = async (state: AgentState, deps: InvestigatorDeps): Promise<Partial<AgentState>> => {
  // Safety net: force synthesis if too many iterations
  if (state.iterationCount >= FORCE_SYNTHESIS_ITERATION) {
    deps.eventBus.emit({ type: 'reasoning', agent: AGENT_NAME.INVESTIGATOR, text: `Force synthesis: reached ${state.iterationCount.toString()} iterations` });
    return { status: INVESTIGATION_STATUS.SYNTHESIZING, iterationCount: state.iterationCount + 1 };
  }

  deps.eventBus.emit({ type: 'investigation_phase', phase: 'investigating' });

  const response = await deps.llmClient.client.chat.completions.create({
    model: deps.llmClient.model,
    messages: buildMessages(state, deps),
    tools: INVESTIGATOR_TOOLS,
    temperature: 0.2,
  });

  const message = response.choices[0]?.message;
  if (message === undefined) return { status: INVESTIGATION_STATUS.ERROR };

  // Emit reasoning text
  const reasoning = getTextContent(message);
  if (reasoning !== '') deps.eventBus.emit({ type: 'reasoning', agent: AGENT_NAME.INVESTIGATOR, text: reasoning });
  if (response.usage) emitUsage(deps, response.usage);

  // Process tool calls if present
  if (hasToolCalls(message)) {
    const toolCalls = parseToolCalls(message);
    let nextStatus: string | null = null;
    let pendingBrowserTask = state.pendingBrowserTask;
    const toolResults: string[] = [];
    let forceSynthesis = false;

    for (const call of toolCalls) {
      const { result, nextStatus: status, isDuplicate, dupCount } = await executeToolCall(call.name, call.args, deps);
      if (status !== null) nextStatus = status;

      // Force synthesis if same tool called too many times
      if (isDuplicate && dupCount >= MAX_DUPLICATE_CALLS) {
        deps.eventBus.emit({ type: 'reasoning', agent: AGENT_NAME.INVESTIGATOR, text: `Force synthesis: ${call.name} called ${dupCount.toString()} times with same args` });
        forceSynthesis = true;
        break;
      }

      if (call.name === TOOL_NAME.DISPATCH_BROWSER_TASK) {
        pendingBrowserTask = {
          task: call.args['task'] as string,
          lookFor: (call.args['collectEvidence'] as string[] | undefined) ?? [],
          stopCondition: (call.args['stopCondition'] as string | undefined) ?? 'Task complete',
        };
      }

      const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      const prefix = isDuplicate ? `⚠️ DUPLICATE CALL #${dupCount.toString()} — ` : '';
      const hint = isDuplicate ? '' : (NEXT_STEP_HINTS[call.name] ?? '');
      toolResults.push(`${prefix}[${call.name}] ${resultStr}${hint}`);
    }

    if (forceSynthesis) {
      return { status: INVESTIGATION_STATUS.SYNTHESIZING, iterationCount: state.iterationCount + 1 };
    }

    // Add tool results as evidence entries
    const newEvidence = toolResults.map((r, i) => ({
      id: `investigator-tool-${state.iterationCount.toString()}-${i.toString()}`,
      hypothesisId: '',
      category: EVIDENCE_CATEGORY.SOURCE,
      type: EVIDENCE_TYPE.SOURCE_CODE,
      description: r.slice(0, 200),
      data: r,
      timestamp: Date.now(),
    }));

    return {
      iterationCount: state.iterationCount + 1,
      evidence: [...state.evidence, ...newEvidence],
      ...(nextStatus !== null ? { status: nextStatus as AgentState['status'] } : {}),
      ...(pendingBrowserTask !== state.pendingBrowserTask ? { pendingBrowserTask } : {}),
    };
  }

  // No tool calls — just increment iteration (model only produced text)
  return { iterationCount: state.iterationCount + 1 };
};

export const createInvestigatorNode = (deps: InvestigatorDeps) =>
  async (state: AgentState): Promise<Partial<AgentState>> =>
    invokeInvestigator(state, deps);
