/**
 * Tool: browser_wait
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getPage } from '#browser/browser.js';
import { waitForCondition } from '#browser/actions.js';
import { TOOL_WAIT } from '#constants/tools.js';
import { toolSuccess, toolError } from './helpers.js';

export const registerWaitTool = (server: McpServer): void => {
  server.registerTool(
    TOOL_WAIT.NAME,
    {
      description: TOOL_WAIT.DESCRIPTION,
      inputSchema: {
        sessionId: z.string().describe(TOOL_WAIT.PARAMS.SESSION_ID),
        selector: z.string().optional().describe(TOOL_WAIT.PARAMS.SELECTOR),
        timeoutMs: z.number().optional().describe(TOOL_WAIT.PARAMS.TIMEOUT_MS),
      },
    },
    async ({ sessionId, selector, timeoutMs }) => {
      try {
        const page = getPage(sessionId);
        const result = await waitForCondition(page, selector, timeoutMs);
        return { ...toolSuccess(result), isError: !result.success };
      } catch (err) {
        return toolError(err);
      }
    },
  );
};
