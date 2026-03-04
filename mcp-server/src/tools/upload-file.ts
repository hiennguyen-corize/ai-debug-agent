/**
 * Tool: browser_upload_file
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getPage } from '#browser/browser.js';
import { uploadFile } from '#browser/actions.js';
import { TOOL_UPLOAD_FILE } from '#constants/tools.js';
import { toolSuccess, toolError } from './helpers.js';

export const registerUploadFileTool = (server: McpServer): void => {
  server.registerTool(
    TOOL_UPLOAD_FILE.NAME,
    {
      description: TOOL_UPLOAD_FILE.DESCRIPTION,
      inputSchema: {
        sessionId: z.string().describe(TOOL_UPLOAD_FILE.PARAMS.SESSION_ID),
        selector: z.string().describe(TOOL_UPLOAD_FILE.PARAMS.SELECTOR),
        filePath: z.string().describe(TOOL_UPLOAD_FILE.PARAMS.FILE_PATH),
      },
    },
    async ({ sessionId, selector, filePath }) => {
      try {
        const page = getPage(sessionId);
        const result = await uploadFile(page, selector, filePath);
        return { ...toolSuccess(result), isError: !result.success };
      } catch (err) {
        return toolError(err);
      }
    },
  );
};
