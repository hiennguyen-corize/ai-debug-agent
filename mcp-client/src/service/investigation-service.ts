/**
 * InvestigationService — Facade pattern.
 * Single orchestration entry point for all investigation consumers.
 */

import { loadConfig } from '#agent/config-loader.js';
import { createLLMClient } from '#agent/llm-client.js';
import { createEventBus, type EventBus } from '#observability/event-bus.js';
import { createInvestigationLogger } from '#observability/investigation-logger.js';
import { createInvestigationGraph } from '#graph/index.js';
import { saveReport } from '#reporter/report.js';
import { addToRegistry, isDuplicate } from '#reporter/registry.js';
import { AGENT_NAME, type InvestigationRequest, type InvestigationReport, type AgentEvent } from '@ai-debug/shared';
import type { McpCall } from '#agent/mcp-bridge.js';
import { createPromptUser } from '#agent/prompt-user-factory.js';

export type InvestigationDeps = {
  mcpCall: McpCall;
  onEvent?: (event: AgentEvent) => void;
  promptUser?: (q: string) => Promise<string>;
  callbackUrl?: string | undefined;
  configOverrides?: Record<string, unknown> | undefined;
};

const resolvePromptUser = (deps: InvestigationDeps): ((q: string) => Promise<string>) =>
  deps.promptUser ?? createPromptUser({
    mode: 'autonomous',
    callbackUrl: deps.callbackUrl,
  });

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
    promptUser: resolvePromptUser(deps),
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

  const logger = await createInvestigationLogger(
    eventBus,
    request.url,
    request.hint,
    config.output.reportsDir,
  );

  try {
    const graph = await buildGraph(config, eventBus, deps);
    const result = await graph.invoke({
      url: request.url,
      hint: request.hint ?? null,
      investigationMode: request.mode,
    }, { recursionLimit: 100 });

    await handleReport(result.finalReport, config.output.reportsDir);
    return result.finalReport ?? null;
  } finally {
    await logger.writeFooter();
    logger.unsubscribe();
  }
};
