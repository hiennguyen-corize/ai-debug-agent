/**
 * MCP Client entry point — load config, create graph, run investigation.
 */

import { loadConfig } from './agent/config-loader.js';
import { createLLMClient } from './agent/llm-client.js';
import { createEventBus } from './observability/event-bus.js';
import { createLogger } from './observability/logger.js';
import { createInvestigationGraph } from './graph/index.js';
import { saveReport } from './reporter/report.js';
import { addToRegistry, isDuplicate } from './reporter/registry.js';
import { AGENT_NAME, type InvestigationRequest } from '@ai-debug/shared';
import { createInterface } from 'node:readline/promises';

const createPromptUser = (): ((question: string) => Promise<string>) => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return async (question: string): Promise<string> => rl.question(`\n❓ ${question}\n> `);
};

const createMcpCall = (): ((tool: string, args: Record<string, unknown>) => Promise<unknown>) =>
  async (tool: string, args: Record<string, unknown>): Promise<unknown> => {
    console.log(`[MCP] ${tool}(${JSON.stringify(args).slice(0, 100)})`);
    return {};
  };

const buildLLMClients = (config: Awaited<ReturnType<typeof loadConfig>>) => ({
  investigatorLLM: createLLMClient(AGENT_NAME.INVESTIGATOR, config),
  explorerLLM: createLLMClient(AGENT_NAME.EXPLORER, config),
  scoutLLM: createLLMClient(AGENT_NAME.SCOUT, config),
  synthesisLLM: createLLMClient(AGENT_NAME.SYNTHESIS, config),
});

const handleReport = async (
  result: { finalReport: unknown },
  config: Awaited<ReturnType<typeof loadConfig>>,
): Promise<void> => {
  const report = result.finalReport;
  if (report === null || report === undefined) return;
  const reportTyped = report as Awaited<ReturnType<typeof saveReport>> extends string ? never : Parameters<typeof isDuplicate>[0];
  const duplicate = await isDuplicate(reportTyped);
  if (!duplicate) {
    const reportPath = await saveReport(reportTyped, config.output.reportsDir);
    await addToRegistry(reportTyped, reportPath, config.output.reportsDir);
    console.log(`\n✅ Report saved: ${reportPath}`);
  } else {
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

  await handleReport(result, config);
  logger.detach();
};
