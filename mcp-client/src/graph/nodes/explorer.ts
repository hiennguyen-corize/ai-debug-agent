/**
 * Explorer node — execute BrowserTask, collect evidence.
 */

import {
  INVESTIGATION_STATUS,
  AGENT_NAME,
  type BrowserTaskResult,
  type Evidence,
  EVIDENCE_TYPE,
  EVIDENCE_CATEGORY,
} from '@ai-debug/shared';
import type { AgentState } from '../state.js';
import type { EventBus } from '../../observability/event-bus.js';
import type { LLMClient } from '../../agent/llm-client.js';
import { EXPLORER_SYSTEM_PROMPT } from '../../agent/prompts.js';

type ExplorerDeps = {
  llmClient: LLMClient;
  eventBus: EventBus;
  mcpCall: (tool: string, args: Record<string, unknown>) => Promise<unknown>;
};

const buildTaskResult = (raw: unknown): BrowserTaskResult => {
  const data = raw as Record<string, unknown>;
  const errorVal = data['error'];
  return {
    observations: (data['observations'] as string[]) ?? [],
    networkActivity: [],
    consoleActivity: [],
    screenshotPaths: [],
    ...(typeof errorVal === 'string' ? { error: errorVal } : {}),
  };
};

const taskResultToEvidence = (result: BrowserTaskResult, hypothesisId: string): Evidence[] => {
  const evidence: Evidence[] = [];
  for (const obs of result.observations) {
    evidence.push({
      id: `explorer-${crypto.randomUUID().slice(0, 8)}`,
      hypothesisId,
      category: EVIDENCE_CATEGORY.DOM,
      type: EVIDENCE_TYPE.DOM_ANOMALY,
      description: obs,
      data: obs,
      timestamp: Date.now(),
    });
  }
  return evidence;
};

const dispatchTask = async (state: AgentState, deps: ExplorerDeps): Promise<BrowserTaskResult> => {
  const task = state.pendingBrowserTask;
  if (task === null) throw new Error('No pending task');
  deps.eventBus.emit({ type: 'tool_call', agent: AGENT_NAME.EXPLORER, tool: 'browser_task', args: task });
  const result = buildTaskResult(
    await deps.mcpCall('dispatch_browser_task', {
      task: task.task, stopCondition: task.stopCondition,
      collectEvidence: task.lookFor, hypothesisId: '', timeoutMs: 90_000,
    }),
  );
  deps.eventBus.emit({ type: 'tool_result', agent: AGENT_NAME.EXPLORER, tool: 'browser_task', success: result.error === undefined, durationMs: 0 });
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

