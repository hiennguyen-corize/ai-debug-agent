/**
 * Explorer node — LLM-driven browser task execution with ReAct loop.
 */

import {
  INVESTIGATION_STATUS,
  AGENT_NAME,
  type BrowserTaskResult,
} from '@ai-debug/shared';
import type { AgentState } from '#graph/state.js';
import type { EventBus } from '#observability/event-bus.js';
import type { LLMClient } from '#agent/llm-client.js';
import { buildExplorerMessages } from '#agent/prompts.js';
import { parseToolCalls, hasToolCalls } from '#agent/tool-parser.js';
import { EXPLORER_TOOLS } from '#graph/nodes/explorer-tools.js';
import { taskResultToEvidence } from '#graph/nodes/evidence.js';

type ExplorerDeps = {
  llmClient: LLMClient;
  eventBus: EventBus;
  mcpCall: (tool: string, args: Record<string, unknown>) => Promise<unknown>;
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

const MAX_EXPLORER_ITERATIONS = 15;

const executeTask = async (state: AgentState, deps: ExplorerDeps): Promise<BrowserTaskResult> => {
  const task = state.pendingBrowserTask;
  if (task === null) return { observations: ['No pending task'], networkActivity: [], consoleActivity: [], screenshotPaths: [] };

  const observations: string[] = [];
  const messages = buildExplorerMessages(task.task, state.url, state.initialObservations, state.currentSessionId);

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
      if (message.content !== null) {
        observations.push(message.content);
      }
      break;
    }

    const toolCalls = parseToolCalls(message);
    for (const call of toolCalls) {
      const result = await executeToolCall(call.name, call.args, deps);
      const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2);

      observations.push(`[${call.name}] ${resultStr.slice(0, 500)}`);

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
