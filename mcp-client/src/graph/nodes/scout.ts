/**
 * Scout node — navigate, observe, collect baseline data.
 */

import {
  INVESTIGATION_STATUS, AGENT_NAME, TOOL_NAME,
  type ScoutObservation, type Evidence, EVIDENCE_TYPE, EVIDENCE_CATEGORY,
} from '@ai-debug/shared';
import type { AgentState } from '#graph/state.js';
import type { EventBus } from '#observability/event-bus.js';
import type { LLMClient } from '#agent/llm-client.js';
import {
  NavigateResponseSchema,
  ConsoleLogsResponseSchema,
  NetworkLogsResponseSchema,
  DomResponseSchema,
} from '#schemas/responses.js';

type ScoutDeps = {
  llmClient: LLMClient;
  eventBus: EventBus;
  mcpCall: (tool: string, args: Record<string, unknown>) => Promise<unknown>;
};

const collectObservations = async (
  url: string,
  hint: string | null,
  deps: ScoutDeps,
): Promise<{ observations: ScoutObservation; sessionId: string; evidence: Evidence[] }> => {
  deps.eventBus.emit({ type: 'investigation_phase', phase: 'scouting' });

  const navResult = NavigateResponseSchema.parse(await deps.mcpCall(TOOL_NAME.BROWSER_NAVIGATE, { url }));
  const sessionId = navResult.sessionId ?? crypto.randomUUID();

  const consoleLogs = ConsoleLogsResponseSchema.parse(await deps.mcpCall(TOOL_NAME.GET_CONSOLE_LOGS, { sessionId }));
  const networkLogs = NetworkLogsResponseSchema.parse(await deps.mcpCall(TOOL_NAME.GET_NETWORK_LOGS, { sessionId }));
  const dom = DomResponseSchema.parse(await deps.mcpCall(TOOL_NAME.BROWSER_GET_DOM, { sessionId }));

  const consoleErrors = consoleLogs.logs.filter((l) => l.type === 'error').map((l) => l.text);
  const networkErrors = networkLogs.logs.filter((l) => l.status >= 400).map((l) => ({
    url: l.url, method: l.method, status: l.status, statusText: '',
  }));

  const observations: ScoutObservation = {
    url,
    pageTitle: dom.title,
    consoleErrors,
    networkErrors,
    suspiciousPatterns: [],
    domSnapshot: JSON.stringify(dom.elements).slice(0, 2000),
    bundleUrls: networkLogs.logs.filter((l) => l.url.endsWith('.js')).map((l) => l.url),
    timestamp: new Date().toISOString(),
  };

  const evidence: Evidence[] = consoleErrors.map((err, i) => ({
    id: `scout-console-${i.toString()}`,
    hypothesisId: '',
    category: EVIDENCE_CATEGORY.CONSOLE,
    type: EVIDENCE_TYPE.CONSOLE_ERROR,
    description: err,
    data: err,
    timestamp: Date.now(),
  }));

  deps.eventBus.emit({ type: 'reasoning', agent: AGENT_NAME.SCOUT, text: `Collected ${consoleErrors.length} console errors, ${networkErrors.length} network errors` });

  return { observations, sessionId, evidence };
};

export const createScoutNode = (deps: ScoutDeps) =>
  async (state: AgentState): Promise<Partial<AgentState>> => {
    const { observations, sessionId, evidence } = await collectObservations(state.url, state.hint, deps);
    return {
      initialObservations: observations,
      currentSessionId: sessionId,
      status: INVESTIGATION_STATUS.HYPOTHESIZING,
      evidence: [...state.evidence, ...evidence],
    };
  };
