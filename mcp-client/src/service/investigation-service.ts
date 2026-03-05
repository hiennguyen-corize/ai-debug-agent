/**
 * InvestigationService — Facade pattern.
 * Single orchestration entry point for all investigation consumers.
 */

import { loadConfig } from '#agent/config-loader.js';
import { createLLMClient } from '#agent/llm-client.js';
import { createEventBus } from '#observability/event-bus.js';
import { createInvestigationLogger } from '#observability/investigation-logger.js';
import { createInvestigationGraph } from '#graph/index.js';
import { AGENT_NAME, type InvestigationRequest, type InvestigationReport, type AgentEvent, type InvestigationMode } from '@ai-debug/shared';
import type { McpCall } from '#agent/mcp-bridge.js';
import { createPromptUser } from '#agent/prompt-user-factory.js';
import { createPlaywrightBridge } from '#agent/playwright-bridge.js';

export type InvestigationDeps = {
  mcpCall: McpCall;
  onEvent?: (event: AgentEvent) => void;
  promptUser?: (q: string) => Promise<string>;
  callbackUrl?: string | undefined;
  configOverrides?: Record<string, unknown> | undefined;
};

const resolvePromptUser = (
  deps: InvestigationDeps,
  mode: InvestigationMode,
): ((q: string) => Promise<string>) =>
  deps.promptUser ?? createPromptUser({
    mode,
    callbackUrl: deps.callbackUrl,
  });

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

  const headless = config.browser.headless;
  const playwrightBridge = await createPlaywrightBridge(headless);

  try {
    const graph = createInvestigationGraph({
      plannerLLM: createLLMClient(AGENT_NAME.INVESTIGATOR, config),
      executorLLM: createLLMClient(AGENT_NAME.EXPLORER, config),
      scoutLLM: createLLMClient(AGENT_NAME.SCOUT, config),
      synthesisLLM: createLLMClient(AGENT_NAME.SYNTHESIS, config),
      eventBus,
      mcpCall: deps.mcpCall,
      playwrightCall: playwrightBridge.call,
      playwrightTools: playwrightBridge.tools,
      promptUser: resolvePromptUser(deps, request.mode),
    });

    const result = await graph.invoke({
      url: request.url,
      hint: request.hint ?? null,
      investigationMode: request.mode,
    }, { recursionLimit: 100 });

    return result.finalReport ?? null;
  } finally {
    await playwrightBridge.close();
    await logger.writeFooter();
    logger.unsubscribe();
  }
};
