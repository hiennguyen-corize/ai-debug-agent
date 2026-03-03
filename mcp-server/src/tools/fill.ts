/**
 * Tool: browser_fill
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getPage } from '../browser/browser.js';
import { fillInput } from '../browser/actions.js';
import { TOOL_FILL } from '../constants/tools.js';
import { toolSuccess, toolError } from './helpers.js';

export const registerFillTool = (server: McpServer): void => {
  server.registerTool(
    TOOL_FILL.NAME,
    {
      description: TOOL_FILL.DESCRIPTION,
      inputSchema: {
        sessionId: z.string().describe(TOOL_FILL.PARAMS.SESSION_ID),
        selector: z.string().describe(TOOL_FILL.PARAMS.SELECTOR),
        value: z.string().describe(TOOL_FILL.PARAMS.VALUE),
      },
    },
    async ({ sessionId, selector, value }) => {
      try {
        const page = getPage(sessionId);
        const result = await fillInput(page, selector, value);
        return { ...toolSuccess(result), isError: !result.success };
      } catch (err) {
        return toolError(err);
      }
    },
  );
};
