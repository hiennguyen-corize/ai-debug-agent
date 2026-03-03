/**
 * Scout node — navigate, observe, collect baseline data.
 */

import { INVESTIGATION_STATUS, AGENT_NAME, type ScoutObservation, type Evidence, EVIDENCE_TYPE, EVIDENCE_CATEGORY } from '@ai-debug/shared';
import type { AgentState } from '../state.js';
import type { EventBus } from '../../observability/event-bus.js';
import type { LLMClient } from '../../agent/llm-client.js';
import { SCOUT_SYSTEM_PROMPT } from '../../agent/prompts.js';
import {
  NavigateResponseSchema,
  ConsoleLogsResponseSchema,
  NetworkLogsResponseSchema,
  DomResponseSchema,
} from '../../schemas/responses.js';

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

  const navResult = NavigateResponseSchema.parse(await deps.mcpCall('browser_navigate', { url }));
  const sessionId = navResult.sessionId ?? crypto.randomUUID();

  const consoleLogs = ConsoleLogsResponseSchema.parse(await deps.mcpCall('get_console_logs', { sessionId }));
  const networkLogs = NetworkLogsResponseSchema.parse(await deps.mcpCall('get_network_logs', { sessionId }));
  const dom = DomResponseSchema.parse(await deps.mcpCall('browser_get_dom', { sessionId }));

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
