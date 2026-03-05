/**
 * Scout node — navigate, observe, collect baseline data.
 * Uses @playwright/mcp for browser interaction.
 */

import {
  INVESTIGATION_STATUS, AGENT_NAME,
  type ScoutObservation, type Evidence,
} from '@ai-debug/shared';
import type { AgentState } from '#graph/state.js';
import type { EventBus } from '#observability/event-bus.js';
import type { LLMClient } from '#agent/llm-client.js';
import type { SkillRegistry } from '#agent/skill-registry.js';
import { detectFrameworks } from '#agent/framework-detector.js';
import { consoleErrorsToEvidence } from '#graph/nodes/evidence.js';
import { parseStackTrace } from '#graph/nodes/stack-trace-parser.js';

type ScoutDeps = {
  llmClient: LLMClient;
  eventBus: EventBus;
  playwrightCall: (tool: string, args: Record<string, unknown>) => Promise<unknown>;
  skillRegistry?: SkillRegistry | undefined;
};

const DOM_SNAPSHOT_MAX_LENGTH = 2000;

// --- Extract text from @playwright/mcp result content ---

const extractText = (result: unknown): string => {
  if (typeof result === 'string') return result;
  if (Array.isArray(result)) {
    return result
      .filter((item): item is { type: string; text: string } =>
        typeof item === 'object' && item !== null && 'text' in item)
      .map((item) => item.text)
      .join('\n');
  }
  return JSON.stringify(result, null, 2);
};

const collectRawData = async (url: string, deps: ScoutDeps): Promise<{
  snapshotText: string;
  consoleText: string;
  pageTitle: string;
}> => {
  // Navigate using @playwright/mcp
  await deps.playwrightCall('browser_navigate', { url });

  // Get accessibility snapshot (replaces browser_get_dom)
  const snapshotResult = await deps.playwrightCall('browser_snapshot', {});
  const snapshotText = extractText(snapshotResult);

  // Get console messages
  const consoleResult = await deps.playwrightCall('browser_console_messages', {});
  const consoleText = extractText(consoleResult);

  // Extract page title from snapshot
  const titleMatch = /title:\s*(.+)/i.exec(snapshotText);
  const pageTitle = titleMatch?.[1]?.trim() ?? 'Unknown';

  return { snapshotText, consoleText, pageTitle };
};

const parseConsoleErrors = (consoleText: string): string[] => {
  const lines = consoleText.split('\n');
  return lines.filter((l) => l.toLowerCase().includes('error'));
};

const buildObservations = (
  url: string,
  pageTitle: string,
  snapshotText: string,
  consoleErrors: string[],
): ScoutObservation => ({
  url,
  pageTitle,
  consoleErrors,
  parsedErrors: consoleErrors.map(parseStackTrace),
  networkErrors: [],
  suspiciousPatterns: [],
  domSnapshot: snapshotText.slice(0, DOM_SNAPSHOT_MAX_LENGTH),
  bundleUrls: [],
  interactiveElements: [],
  timestamp: new Date().toISOString(),
});

const collectObservations = async (
  url: string,
  _hint: string | null,
  deps: ScoutDeps,
): Promise<{ observations: ScoutObservation; sessionId: string; evidence: Evidence[] }> => {
  deps.eventBus.emit({ type: 'investigation_phase', phase: 'scouting' });
  const { snapshotText, consoleText, pageTitle } = await collectRawData(url, deps);
  const consoleErrors = parseConsoleErrors(consoleText);
  const observations = buildObservations(url, pageTitle, snapshotText, consoleErrors);
  const evidence = consoleErrorsToEvidence(observations.consoleErrors);

  // Generate session ID (playwright manages its own sessions)
  const sessionId = crypto.randomUUID();

  deps.eventBus.emit({ type: 'reasoning', agent: AGENT_NAME.SCOUT, text:
    `Navigated to ${url}. Page title: "${observations.pageTitle}". ` +
    `Found ${observations.consoleErrors.length.toString()} console errors. ` +
    `Snapshot length: ${snapshotText.length.toString()} chars.` +
    (observations.consoleErrors.length > 0 ? ` First error: ${(observations.consoleErrors[0] ?? '').slice(0, 150)}` : ''),
  });
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
