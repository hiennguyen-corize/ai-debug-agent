/**
 * Tool: browser_click
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getPage } from '../browser/browser.js';
import { clickElement } from '../browser/actions.js';
import { TOOL_CLICK } from '../constants/tools.js';
import { toolSuccess, toolError } from './helpers.js';

export const registerClickTool = (server: McpServer): void => {
  server.registerTool(
    TOOL_CLICK.NAME,
    {
      description: TOOL_CLICK.DESCRIPTION,
      inputSchema: {
        sessionId: z.string().describe(TOOL_CLICK.PARAMS.SESSION_ID),
        selector: z.string().describe(TOOL_CLICK.PARAMS.SELECTOR),
      },
    },
    async ({ sessionId, selector }) => {
      try {
        const page = getPage(sessionId);
        const result = await clickElement(page, selector);
        return { ...toolSuccess(result), isError: !result.success };
      } catch (err) {
        return toolError(err);
      }
    },
  );
};
