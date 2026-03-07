/**
 * InvestigationService — simplified for single-loop architecture.
 * No MCP bridge — calls source map functions directly.
 */

import { loadConfig } from '#agent/config-loader.js';
import { createLLMClient } from '#agent/llm-client.js';
import { createEventBus } from '#observability/event-bus.js';
import { createInvestigationLogger } from '#observability/investigation-logger.js';
import { runAgentLoop, type FinishResult } from '#agent/loop/agent-loop.js';
import { sourceMapCall } from '#agent/tools/sourcemap-tools.js';
import { createPlaywrightBridge } from '#agent/playwright-bridge.js';
import type { InvestigationRequest, InvestigationReport, AgentEvent } from '@ai-debug/shared';
import type { MessageQueue } from '#agent/message-queue.js';

export type InvestigationDeps = {
  onEvent?: (event: AgentEvent) => void;
  configOverrides?: Record<string, unknown> | undefined;
  messageQueue?: MessageQueue | undefined;
};

const buildReport = (result: FinishResult, url: string, startTime: number): InvestigationReport => ({
  summary: result.summary,
  rootCause: result.rootCause,
  severity: result.severity,
  reproSteps: result.stepsToReproduce,
  evidence: [
    ...result.evidence.consoleErrors.map((e) => ({
      type: 'console_error' as const,
      description: e,
      data: e,
    })),
    ...result.evidence.networkErrors.map((e) => ({
      type: 'network_error' as const,
      description: e,
      data: e,
    })),
    ...(result.networkFindings ?? []).map((f) => ({
      type: 'network_finding' as const,
      description: f,
      data: f,
    })),
  ],
  suggestedFix: result.suggestedFix !== undefined ? {
    file: 'unknown',
    line: 0,
    before: '',
    after: '',
    explanation: result.suggestedFix,
  } : null,
  codeLocation: result.codeLocation ?? null,
  networkFindings: result.networkFindings ?? [],
  timeline: result.timeline ?? [],
  dataFlow: '',
  hypotheses: [],
  cannotDetermine: false,
  assumptions: [],
  timestamp: new Date().toISOString(),
  url,
  durationMs: Date.now() - startTime,
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
  const startTime = Date.now();

  try {
    const llm = createLLMClient(config);

    const result = await runAgentLoop(request.url, request.hint ?? null, {
      llm,
      playwrightCall: playwrightBridge.call,
      playwrightTools: playwrightBridge.tools,
      sourceMapCall,
      eventBus,
      maxIterations: config.agent.maxIterations,
      contextWindow: config.agent.contextWindow,
      mode: request.mode,
      messageQueue: deps.messageQueue,
    });

    if (result === null) return null;
    return buildReport(result, request.url, startTime);
  } finally {
    await playwrightBridge.close();
    await logger.writeFooter();
    logger.unsubscribe();
  }
};
