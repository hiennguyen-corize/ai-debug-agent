/**
 * Tool: browser_get_dom
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getPage } from '../browser/browser.js';
import { extractDOM } from '../browser/dom.js';
import { DEFAULT_MAX_ELEMENTS } from '../constants.js';
import { TOOL_GET_DOM } from '../constants/tools.js';
import { toolSuccess, toolError } from './helpers.js';

export const registerGetDomTool = (server: McpServer): void => {
  server.registerTool(
    TOOL_GET_DOM.NAME,
    {
      description: TOOL_GET_DOM.DESCRIPTION,
      inputSchema: {
        sessionId: z.string().describe(TOOL_GET_DOM.PARAMS.SESSION_ID),
        maxElements: z.number().optional().describe(TOOL_GET_DOM.PARAMS.MAX_ELEMENTS),
      },
    },
    async ({ sessionId, maxElements }) => {
      try {
        const page = getPage(sessionId);
        const snapshot = await extractDOM(page, maxElements ?? DEFAULT_MAX_ELEMENTS);
        return toolSuccess(snapshot);
      } catch (err) {
        return toolError(err);
      }
    },
  );
};
