/**
 * Tool: browser_hover
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getPage } from '#browser/browser.js';
import { hoverElement } from '#browser/actions.js';
import { TOOL_HOVER } from '#constants/tools.js';
import { toolSuccess, toolError } from './helpers.js';

export const registerHoverTool = (server: McpServer): void => {
  server.registerTool(
    TOOL_HOVER.NAME,
    {
      description: TOOL_HOVER.DESCRIPTION,
      inputSchema: {
        sessionId: z.string().describe(TOOL_HOVER.PARAMS.SESSION_ID),
        selector: z.string().describe(TOOL_HOVER.PARAMS.SELECTOR),
      },
    },
    async ({ sessionId, selector }) => {
      try {
        const page = getPage(sessionId);
        const result = await hoverElement(page, selector);
        return { ...toolSuccess(result), isError: !result.success };
      } catch (err) {
        return toolError(err);
      }
    },
  );
};
