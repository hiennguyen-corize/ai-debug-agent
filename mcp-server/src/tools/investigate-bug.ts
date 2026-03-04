/**
 * Tool: investigate_bug — main MCP entry point.
 *
 * Orchestrates the full investigation pipeline:
 * preflight → scout → investigator ⇄ explorer → synthesis → report.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { TOOL_INVESTIGATE_BUG } from '#constants/tools.js';
import { toolSuccess, toolError } from './helpers.js';

export const registerInvestigateBugTool = (server: McpServer): void => {
  server.registerTool(
    TOOL_INVESTIGATE_BUG.NAME,
    {
      description: TOOL_INVESTIGATE_BUG.DESCRIPTION,
      inputSchema: {
        url: z.string().url().describe(TOOL_INVESTIGATE_BUG.PARAMS.URL),
        hint: z.string().optional().describe(TOOL_INVESTIGATE_BUG.PARAMS.HINT),
        mode: z.enum(['interactive', 'autonomous']).default('autonomous').describe(TOOL_INVESTIGATE_BUG.PARAMS.MODE),
        sourcemapDir: z.string().optional().describe(TOOL_INVESTIGATE_BUG.PARAMS.SOURCEMAP_DIR),
      },
    },
    async (input, { sendNotification }) => {
      try {
        // Lazy-load mcp-client to avoid circular dependency at module level
        const { createInvestigationGraph } = await import('@ai-debug/mcp-client/graph');
        const { createLLMClient } = await import('@ai-debug/mcp-client/agent/llm-client');
        const { createEventBus } = await import('@ai-debug/mcp-client/observability/event-bus');
        const { loadConfig } = await import('@ai-debug/mcp-client/agent/config-loader');
        const { aggregateEvent } = await import('@ai-debug/mcp-client/observability/step-aggregator');
        const { saveReport } = await import('@ai-debug/mcp-client/reporter/report');
        const { AGENT_NAME } = await import('@ai-debug/shared');

        const config = await loadConfig();

        const eventBus = createEventBus();
        const investigatorLLM = createLLMClient(AGENT_NAME.INVESTIGATOR, config);
        const explorerLLM = createLLMClient(AGENT_NAME.EXPLORER, config);
        const scoutLLM = createLLMClient(AGENT_NAME.SCOUT, config);
        const synthesisLLM = createLLMClient(AGENT_NAME.SYNTHESIS, config);

        // Stream progress via MCP notifications
        const unsubscribe = eventBus.subscribe((event) => {
          const step = aggregateEvent(event);
          void sendNotification({
            method: 'notifications/message',
            params: {
              level: step.type === 'error' ? 'error' : 'info',
              logger: `ai-debug.${step.agent}`,
              data: step,
            },
          });
        });

        // Self-referencing mcpCall for internal tool invocation
        const mcpCall = (tool: string, args: Record<string, unknown>): Promise<unknown> =>
          Promise.resolve({ tool, args, status: 'dispatched' });

        // Prompt user stub — autonomous mode doesn't use this
        const promptUser = (question: string): Promise<string> =>
          Promise.resolve(`[AUTONOMOUS] Skipped question: ${question}`);

        const graph = await createInvestigationGraph({
          investigatorLLM,
          explorerLLM,
          scoutLLM,
          synthesisLLM,
          eventBus,
          mcpCall,
          promptUser,
        });

        const result = await graph.invoke({
          url: input.url,
          hint: input.hint ?? '',
          investigationMode: input.mode,
        });

        unsubscribe();

        // Persist report
        if (result.finalReport) {
          await saveReport(result.finalReport, input.url);
        }

        return toolSuccess(result.finalReport ?? { status: 'no_report', reason: 'Investigation did not produce a report' });
      } catch (err) {
        return toolError(err);
      }
    },
  );
};
