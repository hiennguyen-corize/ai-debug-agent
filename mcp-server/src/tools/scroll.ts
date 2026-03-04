/**
 * Tool: browser_scroll
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getPage } from '#browser/browser.js';
import { scrollPage } from '#browser/actions.js';
import { TOOL_SCROLL } from '#constants/tools.js';
import { toolSuccess, toolError } from './helpers.js';

export const registerScrollTool = (server: McpServer): void => {
  server.registerTool(
    TOOL_SCROLL.NAME,
    {
      description: TOOL_SCROLL.DESCRIPTION,
      inputSchema: {
        sessionId: z.string().describe(TOOL_SCROLL.PARAMS.SESSION_ID),
        direction: z.enum(['up', 'down']).describe(TOOL_SCROLL.PARAMS.DIRECTION),
        pixels: z.number().optional().describe(TOOL_SCROLL.PARAMS.PIXELS),
      },
    },
    async ({ sessionId, direction, pixels }) => {
      try {
        const page = getPage(sessionId);
        const result = await scrollPage(page, direction, pixels);
        return { ...toolSuccess(result), isError: !result.success };
      } catch (err) {
        return toolError(err);
      }
    },
  );
};
