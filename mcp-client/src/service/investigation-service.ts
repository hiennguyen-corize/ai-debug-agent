/**
 * InvestigationService — Facade pattern.
 * Single orchestration entry point for all investigation consumers.
 */

import { loadConfig } from '#agent/config-loader.js';
import { createLLMClient } from '#agent/llm-client.js';
import { createEventBus, type EventBus } from '#observability/event-bus.js';
import { createInvestigationGraph } from '#graph/index.js';
import { saveReport } from '#reporter/report.js';
import { addToRegistry, isDuplicate } from '#reporter/registry.js';
import { AGENT_NAME, type InvestigationRequest, type InvestigationReport, type AgentEvent } from '@ai-debug/shared';
import type { McpCall } from '#agent/mcp-bridge.js';

export type InvestigationDeps = {
  mcpCall: McpCall;
  onEvent?: (event: AgentEvent) => void;
  promptUser?: (q: string) => Promise<string>;
  configOverrides?: Record<string, unknown> | undefined;
};

const defaultPromptUser = (q: string): Promise<string> =>
  Promise.resolve(`[AUTONOMOUS] Skipped: ${q}`);

const buildGraph = async (
  config: Awaited<ReturnType<typeof loadConfig>>,
  eventBus: EventBus,
  deps: InvestigationDeps,
): ReturnType<typeof createInvestigationGraph> =>
  createInvestigationGraph({
    investigatorLLM: createLLMClient(AGENT_NAME.INVESTIGATOR, config),
    explorerLLM: createLLMClient(AGENT_NAME.EXPLORER, config),
    scoutLLM: createLLMClient(AGENT_NAME.SCOUT, config),
    synthesisLLM: createLLMClient(AGENT_NAME.SYNTHESIS, config),
    eventBus,
    mcpCall: deps.mcpCall,
    promptUser: deps.promptUser ?? defaultPromptUser,
  });

const handleReport = async (
  report: InvestigationReport | null,
  reportsDir: string,
): Promise<void> => {
  if (report === null) return;
  if (await isDuplicate(report)) return;
  const path = await saveReport(report, reportsDir);
  await addToRegistry(report, path, reportsDir);
};

export const runInvestigationPipeline = async (
  request: InvestigationRequest,
  deps: InvestigationDeps,
): Promise<InvestigationReport | null> => {
  const config = await loadConfig(deps.configOverrides);
  const eventBus = createEventBus();

  if (deps.onEvent !== undefined) eventBus.subscribe(deps.onEvent);

  const graph = await buildGraph(config, eventBus, deps);
  const result = await graph.invoke({
    url: request.url,
    hint: request.hint ?? null,
    investigationMode: request.mode,
  });

  await handleReport(result.finalReport, config.output.reportsDir);
  return result.finalReport ?? null;
};
