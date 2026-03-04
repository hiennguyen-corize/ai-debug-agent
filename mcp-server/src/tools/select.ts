/**
 * Tool: browser_select
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getPage } from '#browser/browser.js';
import { selectOption } from '#browser/actions.js';
import { TOOL_SELECT } from '#constants/tools.js';
import { toolSuccess, toolError } from './helpers.js';

export const registerSelectTool = (server: McpServer): void => {
  server.registerTool(
    TOOL_SELECT.NAME,
    {
      description: TOOL_SELECT.DESCRIPTION,
      inputSchema: {
        sessionId: z.string().describe(TOOL_SELECT.PARAMS.SESSION_ID),
        selector: z.string().describe(TOOL_SELECT.PARAMS.SELECTOR),
        value: z.string().describe(TOOL_SELECT.PARAMS.VALUE),
      },
    },
    async ({ sessionId, selector, value }) => {
      try {
        const page = getPage(sessionId);
        const result = await selectOption(page, selector, value);
        return { ...toolSuccess(result), isError: !result.success };
      } catch (err) {
        return toolError(err);
      }
    },
  );
};
