/**
 * Tool: browser_screenshot
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getPage } from '#browser/browser.js';
import { TOOL_SCREENSHOT } from '#constants/tools.js';
import { toolSuccess, toolError } from './helpers.js';

export const registerScreenshotTool = (server: McpServer): void => {
  server.registerTool(
    TOOL_SCREENSHOT.NAME,
    {
      description: TOOL_SCREENSHOT.DESCRIPTION,
      inputSchema: {
        sessionId: z.string().describe(TOOL_SCREENSHOT.PARAMS.SESSION_ID),
        fullPage: z.boolean().optional().describe(TOOL_SCREENSHOT.PARAMS.FULL_PAGE),
      },
    },
    async ({ sessionId, fullPage }) => {
      try {
        const page = getPage(sessionId);
        const buffer = await page.screenshot({ fullPage: fullPage ?? false, type: 'png' });
        const base64 = buffer.toString('base64');
        return toolSuccess({ screenshot: base64, format: 'png' });
      } catch (err) {
        return toolError(err);
      }
    },
  );
};
