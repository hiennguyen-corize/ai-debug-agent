/**
 * Explorer node — LLM-driven browser task execution with real browser tools.
 */

import {
  INVESTIGATION_STATUS,
  AGENT_NAME,
  TOOL_NAME,
  type BrowserTaskResult,
  type Evidence,
  EVIDENCE_TYPE,
  EVIDENCE_CATEGORY,
} from '@ai-debug/shared';
import type { AgentState } from '#graph/state.js';
import type { EventBus } from '#observability/event-bus.js';
import type { LLMClient } from '#agent/llm-client.js';
import { EXPLORER_SYSTEM_PROMPT } from '#agent/prompts.js';
import { parseToolCalls, hasToolCalls } from '#agent/tool-parser.js';
import type OpenAI from 'openai';

type ExplorerDeps = {
  llmClient: LLMClient;
  eventBus: EventBus;
  mcpCall: (tool: string, args: Record<string, unknown>) => Promise<unknown>;
};

// --- Browser tool definitions for function calling ---

const EXPLORER_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: TOOL_NAME.BROWSER_NAVIGATE,
      description: 'Navigate to a URL in the browser.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to navigate to' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: TOOL_NAME.BROWSER_GET_DOM,
      description: 'Get the DOM snapshot of the current page.',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Browser session ID' },
        },
        required: ['sessionId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: TOOL_NAME.GET_CONSOLE_LOGS,
      description: 'Fetch console logs (errors, warnings, info) from the browser.',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Browser session ID' },
        },
        required: ['sessionId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: TOOL_NAME.GET_NETWORK_LOGS,
      description: 'Fetch network request logs (API calls, status codes, URLs).',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Browser session ID' },
        },
        required: ['sessionId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: TOOL_NAME.BROWSER_SCREENSHOT,
      description: 'Take a screenshot of the current page.',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Browser session ID' },
        },
        required: ['sessionId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: TOOL_NAME.BROWSER_CLICK,
      description: 'Click an element on the page by CSS selector.',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Browser session ID' },
          selector: { type: 'string', description: 'CSS selector of element to click' },
        },
        required: ['sessionId', 'selector'],
      },
    },
  },
];

// --- Evidence helpers ---

const taskResultToEvidence = (result: BrowserTaskResult): Evidence[] =>
  result.observations.map((obs) => ({
    id: `explorer-${crypto.randomUUID().slice(0, 8)}`,
    hypothesisId: '',
    category: EVIDENCE_CATEGORY.DOM,
    type: EVIDENCE_TYPE.DOM_ANOMALY,
    description: obs,
    data: obs,
    timestamp: Date.now(),
  }));

// --- Build messages for LLM ---

const buildMessages = (state: AgentState): OpenAI.Chat.ChatCompletionMessageParam[] => {
  const task = state.pendingBrowserTask;
  if (task === null) return [];

  return [
    { role: 'system', content: EXPLORER_SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        `TASK: ${task.task}`,
        `STOP CONDITION: ${task.stopCondition}`,
        `COLLECT: ${task.lookFor.join(', ')}`,
        `TARGET URL: ${state.url}`,
        state.currentSessionId !== null
          ? `SESSION ID (use this for browser tools): ${state.currentSessionId}`
          : 'No session yet — call browser_navigate first to get a session.',
      ].join('\n'),
    },
  ];
};

// --- Execute a single tool call ---

const executeToolCall = async (
  name: string,
  args: Record<string, unknown>,
  deps: ExplorerDeps,
): Promise<unknown> => {
  const start = Date.now();
  deps.eventBus.emit({ type: 'tool_call', agent: AGENT_NAME.EXPLORER, tool: name, args });

  try {
    const result = await deps.mcpCall(name, args);
    const durationMs = Date.now() - start;
    deps.eventBus.emit({ type: 'tool_result', agent: AGENT_NAME.EXPLORER, tool: name, success: true, durationMs });
    return result;
  } catch (err) {
    const durationMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    deps.eventBus.emit({ type: 'tool_result', agent: AGENT_NAME.EXPLORER, tool: name, success: false, durationMs });
    deps.eventBus.emit({ type: 'error', agent: AGENT_NAME.EXPLORER, message: `Tool ${name} failed: ${message}` });
    return { error: message };
  }
};

// --- Main Explorer LLM loop ---

const MAX_EXPLORER_ITERATIONS = 5;

const executeTask = async (state: AgentState, deps: ExplorerDeps): Promise<BrowserTaskResult> => {
  const observations: string[] = [];
  const messages = buildMessages(state);
  if (messages.length === 0) return { observations: ['No pending task'], networkActivity: [], consoleActivity: [], screenshotPaths: [] };

  for (let i = 0; i < MAX_EXPLORER_ITERATIONS; i++) {
    const response = await deps.llmClient.client.chat.completions.create({
      model: deps.llmClient.model,
      messages,
      tools: EXPLORER_TOOLS,
      temperature: 0.1,
    });

    const message = response.choices[0]?.message;
    if (message === undefined) break;

    if (!hasToolCalls(message)) {
      // Model stopped calling tools — collect any text as observation
      if (message.content !== null) {
        observations.push(message.content);
      }
      break;
    }

    const toolCalls = parseToolCalls(message);
    for (const call of toolCalls) {
      const result = await executeToolCall(call.name, call.args, deps);
      const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2);

      // Collect observations from each tool result
      observations.push(`[${call.name}] ${resultStr.slice(0, 500)}`);

      // Feed tool result back to LLM for next iteration
      messages.push({
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: call.id,
          type: 'function' as const,
          function: { name: call.name, arguments: JSON.stringify(call.args) },
        }],
      });
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: resultStr.slice(0, 2000),
      });
    }
  }

  return {
    observations,
    networkActivity: [],
    consoleActivity: [],
    screenshotPaths: [],
  };
};

// --- Node export ---

export const createExplorerNode = (deps: ExplorerDeps) =>
  async (state: AgentState): Promise<Partial<AgentState>> => {
    if (state.pendingBrowserTask === null) return { status: INVESTIGATION_STATUS.INVESTIGATING };

    deps.eventBus.emit({ type: 'investigation_phase', phase: 'investigating' });
    const result = await executeTask(state, deps);

    return {
      browserTaskResults: [...state.browserTaskResults, result],
      evidence: [...state.evidence, ...taskResultToEvidence(result)],
      pendingBrowserTask: null,
      status: INVESTIGATION_STATUS.INVESTIGATING,
    };
  };
