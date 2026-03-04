/**
 * Tool: investigate_bug — main MCP entry point.
 *
 * Orchestrates the full investigation pipeline via InvestigationService.
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
        const { createBridgeForServer } = await import('@ai-debug/mcp-client/agent/bridge-factory');
        const { runInvestigationPipeline } = await import('@ai-debug/mcp-client/service/investigation-service');
        const { aggregateEvent } = await import('@ai-debug/mcp-client/observability/step-aggregator');

        const bridge = await createBridgeForServer(server);

        try {
          const report = await runInvestigationPipeline(
            { url: input.url, hint: input.hint, mode: input.mode },
            {
              mcpCall: bridge.call,
              onEvent: (event) => {
                const step = aggregateEvent(event);
                void sendNotification({
                  method: 'notifications/message',
                  params: {
                    level: step.type === 'error' ? 'error' : 'info',
                    logger: `ai-debug.${step.agent}`,
                    data: step,
                  },
                });
              },
            },
          );
          return toolSuccess(report ?? { status: 'no_report' });
        } finally {
          await bridge.close();
        }
      } catch (err) {
        return toolError(err);
      }
    },
  );
};
