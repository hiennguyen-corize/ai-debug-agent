/**
 * Explorer node — execute BrowserTask, collect evidence.
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
import { DispatchTaskResponseSchema } from '#schemas/responses.js';

type ExplorerDeps = {
  llmClient: LLMClient;
  eventBus: EventBus;
  mcpCall: (tool: string, args: Record<string, unknown>) => Promise<unknown>;
};

const buildTaskResult = (raw: unknown): BrowserTaskResult => {
  const data = DispatchTaskResponseSchema.parse(raw);
  return {
    observations: data.observations,
    networkActivity: [],
    consoleActivity: [],
    screenshotPaths: [],
    ...(data.error !== undefined ? { error: data.error } : {}),
  };
};

const taskResultToEvidence = (result: BrowserTaskResult, hypothesisId: string): Evidence[] =>
  result.observations.map((obs) => ({
    id: `explorer-${crypto.randomUUID().slice(0, 8)}`,
    hypothesisId,
    category: EVIDENCE_CATEGORY.DOM,
    type: EVIDENCE_TYPE.DOM_ANOMALY,
    description: obs,
    data: obs,
    timestamp: Date.now(),
  }));

const dispatchTask = async (state: AgentState, deps: ExplorerDeps): Promise<BrowserTaskResult> => {
  const task = state.pendingBrowserTask;
  if (task === null) throw new Error('No pending task');
  deps.eventBus.emit({ type: 'tool_call', agent: AGENT_NAME.EXPLORER, tool: TOOL_NAME.DISPATCH_BROWSER_TASK, args: task });
  const result = buildTaskResult(
    await deps.mcpCall(TOOL_NAME.DISPATCH_BROWSER_TASK, {
      task: task.task, stopCondition: task.stopCondition,
      collectEvidence: task.lookFor, hypothesisId: '', timeoutMs: 90_000,
    }),
  );
  deps.eventBus.emit({ type: 'tool_result', agent: AGENT_NAME.EXPLORER, tool: TOOL_NAME.DISPATCH_BROWSER_TASK, success: result.error === undefined, durationMs: 0 });
  return result;
};

const buildStateUpdate = (state: AgentState, result: BrowserTaskResult): Partial<AgentState> => ({
  browserTaskResults: [...state.browserTaskResults, result],
  evidence: [...state.evidence, ...taskResultToEvidence(result, '')],
  pendingBrowserTask: null,
  status: INVESTIGATION_STATUS.INVESTIGATING,
});

export const createExplorerNode = (deps: ExplorerDeps) =>
  async (state: AgentState): Promise<Partial<AgentState>> => {
    if (state.pendingBrowserTask === null) return { status: INVESTIGATION_STATUS.INVESTIGATING };
    const result = await dispatchTask(state, deps);
    return buildStateUpdate(state, result);
  };
