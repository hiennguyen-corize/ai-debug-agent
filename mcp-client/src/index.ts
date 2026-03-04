/**
 * MCP Client entry point — load config, create graph, run investigation.
 */

import { loadConfig } from './agent/config-loader.js';
import { createLLMClient, type LLMClient } from './agent/llm-client.js';
import { createEventBus } from './observability/event-bus.js';
import { createLogger } from './observability/logger.js';
import { createInvestigationGraph } from './graph/index.js';
import { saveReport } from './reporter/report.js';
import { addToRegistry, isDuplicate } from './reporter/registry.js';
import { AGENT_NAME, type InvestigationRequest, type InvestigationReport } from '@ai-debug/shared';
import { createInterface } from 'node:readline/promises';

const createPromptUser = (): ((question: string) => Promise<string>) => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return async (question: string): Promise<string> => rl.question(`\n❓ ${question}\n> `);
};

const createMcpCall = (): ((tool: string, args: Record<string, unknown>) => Promise<unknown>) =>
  // eslint-disable-next-line @typescript-eslint/require-await
  async (tool: string, args: Record<string, unknown>): Promise<unknown> => {
    // eslint-disable-next-line no-console
    console.log(`[MCP] ${tool}(${JSON.stringify(args).slice(0, 100)})`);
    return {};
  };

type LLMClients = {
  investigatorLLM: LLMClient;
  explorerLLM: LLMClient;
  scoutLLM: LLMClient;
  synthesisLLM: LLMClient;
};

const buildLLMClients = (config: Awaited<ReturnType<typeof loadConfig>>): LLMClients => ({
  investigatorLLM: createLLMClient(AGENT_NAME.INVESTIGATOR, config),
  explorerLLM: createLLMClient(AGENT_NAME.EXPLORER, config),
  scoutLLM: createLLMClient(AGENT_NAME.SCOUT, config),
  synthesisLLM: createLLMClient(AGENT_NAME.SYNTHESIS, config),
});

const handleReport = async (
  report: InvestigationReport | null,
  config: Awaited<ReturnType<typeof loadConfig>>,
): Promise<void> => {
  if (report === null) return;
  const duplicate = await isDuplicate(report);
  if (!duplicate) {
    const reportPath = await saveReport(report, config.output.reportsDir);
    await addToRegistry(report, reportPath, config.output.reportsDir);
    // eslint-disable-next-line no-console
    console.log(`\n✅ Report saved: ${reportPath}`);
  } else {
    // eslint-disable-next-line no-console
    console.log('\n⚠️ Duplicate report — skipped');
  }
};

export const runInvestigation = async (request: InvestigationRequest): Promise<void> => {
  const config = await loadConfig(request.config);
  const eventBus = createEventBus();
  const logger = createLogger(eventBus);

  const graph = await createInvestigationGraph({
    ...buildLLMClients(config),
    eventBus,
    mcpCall: createMcpCall(),
    promptUser: createPromptUser(),
  });

  const result = await graph.invoke({
    url: request.url,
    hint: request.hint ?? null,
    investigationMode: request.mode,
  });

  await handleReport(result.finalReport, config);
  logger.detach();
};
