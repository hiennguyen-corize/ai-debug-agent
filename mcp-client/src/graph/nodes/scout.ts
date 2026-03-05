/**
 * Scout node — navigate, observe, collect baseline data.
 */

import {
  INVESTIGATION_STATUS, AGENT_NAME, TOOL_NAME,
  type ScoutObservation, type Evidence,
} from '@ai-debug/shared';
import type { AgentState } from '#graph/state.js';
import type { EventBus } from '#observability/event-bus.js';
import type { LLMClient } from '#agent/llm-client.js';
import type { SkillRegistry } from '#agent/skill-registry.js';
import { detectFrameworks } from '#agent/framework-detector.js';
import { consoleErrorsToEvidence } from '#graph/nodes/evidence.js';
import { extractInteractiveElements } from '#graph/nodes/dom-parser.js';
import { parseStackTrace } from '#graph/nodes/stack-trace-parser.js';
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
  skillRegistry?: SkillRegistry | undefined;
};

const DOM_SNAPSHOT_MAX_LENGTH = 2000;

const collectRawData = async (url: string, deps: ScoutDeps): Promise<{
  sessionId: string;
  consoleLogs: { logs: { type: string; text: string }[] };
  networkLogs: { logs: { url: string; method: string; status: number }[] };
  dom: { title: string; elements: unknown[] };
}> => {
  const navResult = NavigateResponseSchema.parse(await deps.mcpCall(TOOL_NAME.BROWSER_NAVIGATE, { url }));
  const sessionId = navResult.sessionId ?? crypto.randomUUID();
  const consoleLogs = ConsoleLogsResponseSchema.parse(await deps.mcpCall(TOOL_NAME.GET_CONSOLE_LOGS, { sessionId }));
  const networkLogs = NetworkLogsResponseSchema.parse(await deps.mcpCall(TOOL_NAME.GET_NETWORK_LOGS, { sessionId }));
  const dom = DomResponseSchema.parse(await deps.mcpCall(TOOL_NAME.BROWSER_GET_DOM, { sessionId }));
  return { sessionId, consoleLogs, networkLogs, dom };
};

const buildObservations = (
  url: string,
  consoleLogs: { logs: { type: string; text: string }[] },
  networkLogs: { logs: { url: string; method: string; status: number }[] },
  dom: { title: string; elements: unknown[] },
): ScoutObservation => {
  const errorLogs = consoleLogs.logs.filter((l) => l.type === 'error').map((l) => l.text);
  return {
    url,
    pageTitle: dom.title,
    consoleErrors: errorLogs,
    parsedErrors: errorLogs.map(parseStackTrace),
    networkErrors: networkLogs.logs.filter((l) => l.status >= 400).map((l) => ({
      url: l.url, method: l.method, status: l.status, statusText: '',
    })),
    suspiciousPatterns: [],
    domSnapshot: JSON.stringify(dom.elements).slice(0, DOM_SNAPSHOT_MAX_LENGTH),
    bundleUrls: networkLogs.logs.filter((l) => l.url.endsWith('.js')).map((l) => l.url),
    interactiveElements: extractInteractiveElements(dom.elements),
    timestamp: new Date().toISOString(),
  };
};

const collectObservations = async (
  url: string,
  hint: string | null,
  deps: ScoutDeps,
): Promise<{ observations: ScoutObservation; sessionId: string; evidence: Evidence[] }> => {
  deps.eventBus.emit({ type: 'investigation_phase', phase: 'scouting' });
  const { sessionId, consoleLogs, networkLogs, dom } = await collectRawData(url, deps);
  const observations = buildObservations(url, consoleLogs, networkLogs, dom);
  const evidence = consoleErrorsToEvidence(observations.consoleErrors);
  deps.eventBus.emit({ type: 'reasoning', agent: AGENT_NAME.SCOUT, text: `Collected ${observations.consoleErrors.length.toString()} console errors, ${observations.networkErrors.length.toString()} network errors` });
  return { observations, sessionId, evidence };
};

export const createScoutNode = (deps: ScoutDeps) =>
  async (state: AgentState): Promise<Partial<AgentState>> => {
    const { observations, sessionId, evidence } = await collectObservations(state.url, state.hint, deps);

    const frameworkResults = detectFrameworks({
      domContent: observations.domSnapshot,
      networkUrls: observations.bundleUrls,
    });
    const detectedFrameworks = frameworkResults.map((f) => f.id);

    let activeSkills: string[] = [];
    if (deps.skillRegistry !== undefined) {
      const matches = deps.skillRegistry.resolveSkills({
        consoleErrors: observations.consoleErrors,
        networkErrors: observations.networkErrors.map((e) => `network ${e.status.toString()}`),
        domObservations: [],
        detectedFrameworks,
      });
      activeSkills = matches.map((m) => m.skill.id);
    }

    return {
      initialObservations: observations,
      currentSessionId: sessionId,
      status: INVESTIGATION_STATUS.HYPOTHESIZING,
      evidence: [...state.evidence, ...evidence],
      detectedFrameworks,
      activeSkills,
    };
  };
