/**
 * InvestigationService — LangGraph-based investigation pipeline.
 */

import { randomUUID } from 'node:crypto';
import { loadConfig } from '#agent/config-loader.js';
import { createChatModel } from '#agent/llm-client.js';
import { createEventBus } from '#observability/event-bus.js';
import { createInvestigationLogger } from '#observability/investigation-logger.js';
import { sourceMapCall } from '#agent/tools/sourcemap-tools.js';
import { createPlaywrightBridge } from '#agent/playwright-bridge.js';
import { createInvestigationGraph } from '#agent/graph/investigation-graph.js';
import { GRAPH_RECURSION_LIMIT } from '#graph/constants.js';
import { buildSystemPrompt } from '#agent/loop/prompts.js';
import { fetchJsSnippet } from '#agent/tools/fetch-js-snippet.js';
import {
  FINISH_TOOL,
  SOURCE_MAP_TOOLS,
  ASK_USER_TOOL,
  FETCH_JS_SNIPPET_TOOL,
} from '#agent/loop/tools.js';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import type { InvestigationRequest, InvestigationReport, AgentEvent } from '@ai-debug/shared';
import type { MessageQueue } from '#agent/message-queue.js';
import type { FinishResult } from '#agent/loop/types.js';
import type { InvestigationConfigurable, LangChainTool } from '#graph/state.js';

export type InvestigationDeps = {
  onEvent?: (event: AgentEvent) => void;
  configOverrides?: Record<string, unknown> | undefined;
  messageQueue?: MessageQueue | undefined;
  threadId?: string;
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
  hypotheses: (result.hypotheses ?? []).map(h => ({
    id: h.id,
    text: h.text,
    status: h.status as 'confirmed' | 'rejected' | 'plausible' | 'untested',
  })),
  conclusion: result.conclusion ?? '',
  cannotDetermine: false,
  assumptions: [],
  timestamp: new Date().toISOString(),
  url,
  durationMs: Date.now() - startTime,
});

type OpenAIToolFormat = {
  type: 'function';
  function: { name: string; description?: string; parameters?: Record<string, unknown> };
};

/** Convert OpenAI tool format to LangChain's bindTools format. */
const convertTools = (openAiTools: OpenAIToolFormat[]): LangChainTool[] =>
  openAiTools.map((t) => ({
    name: t.function.name,
    description: t.function.description ?? '',
    schema: t.function.parameters ?? {},
  }));

export const runInvestigationPipeline = async (
  request: InvestigationRequest,
  deps: InvestigationDeps,
): Promise<InvestigationReport | null> => {
  const config = await loadConfig(deps.configOverrides);
  const eventBus = createEventBus();

  if (deps.onEvent !== undefined) eventBus.subscribe(deps.onEvent);


  const logger = createInvestigationLogger(eventBus, request.url, request.hint);

  const headless = config.browser.headless;
  const playwrightBridge = await createPlaywrightBridge(headless);
  const startTime = Date.now();

  try {
    const model = createChatModel(config);

    // Build tool list — Playwright (dynamic) + static tools
    const allTools = convertTools([
      ...playwrightBridge.tools,
      ...SOURCE_MAP_TOOLS,
      FETCH_JS_SNIPPET_TOOL,
      FINISH_TOOL,
      ...(request.mode === 'interactive' ? [ASK_USER_TOOL] : []),
    ]);

    // Compile graph
    const graph = createInvestigationGraph({
      model,
      tools: allTools,
      fetchJsSnippet,
    });

    // Build initial messages
    const systemPrompt = buildSystemPrompt(request.mode);
    const hintText = request.hint !== undefined && request.hint !== ''
      ? `\n\nHint: ${request.hint}`
      : '';
    const userMessage = `Investigate this URL for bugs: ${request.url}${hintText}`;

    // Configurable deps — non-serializable, passed via RunnableConfig
    const configurable: InvestigationConfigurable & { thread_id: string } = {
      thread_id: `inv-${randomUUID()}`,
      eventBus,
      playwrightCall: playwrightBridge.call,
      sourceMapCall,
    };

    // Run graph
    const finalState = await graph.invoke(
      {
        messages: [
          new SystemMessage({ content: systemPrompt }),
          new HumanMessage({ content: userMessage }),
        ],
        url: request.url,
        /* eslint-disable @typescript-eslint/no-unnecessary-condition -- hint/mode are optional in schema */
        hint: request.hint ?? '',
        mode: request.mode ?? 'autonomous',
        /* eslint-enable @typescript-eslint/no-unnecessary-condition */
        maxIterations: config.agent.maxIterations,
        contextWindow: config.agent.contextWindow,
      },
      { configurable, recursionLimit: GRAPH_RECURSION_LIMIT },
    );

    const result = finalState.result;
    if (result === null) return null;
    const report = buildReport(result, request.url, startTime);
    return report;
  } finally {
    await playwrightBridge.close();
    logger.writeFooter();
    logger.unsubscribe();
  }
};
