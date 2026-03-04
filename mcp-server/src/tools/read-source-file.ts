/**
 * Tool: read_source_file
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { TOOL_READ_SOURCE_FILE } from '#constants/tools.js';
import { readSourceFromFile } from '#sourcemap/reader.js';
import { toolSuccess, toolError } from './helpers.js';

const handleReadSource = async (
  filePath: string,
  lineFrom: number,
  lineTo: number,
): Promise<ReturnType<typeof toolSuccess> | ReturnType<typeof toolError>> => {
  const result = await readSourceFromFile(filePath, lineFrom, lineTo);
  return result === null ? toolError(new Error(`File not found: ${filePath}`)) : toolSuccess(result);
};

export const registerReadSourceFileTool = (server: McpServer): void => {
  server.registerTool(
    TOOL_READ_SOURCE_FILE.NAME,
    {
      description: TOOL_READ_SOURCE_FILE.DESCRIPTION,
      inputSchema: {
        filePath: z.string().describe(TOOL_READ_SOURCE_FILE.PARAMS.FILE_PATH),
        lineFrom: z.number().describe(TOOL_READ_SOURCE_FILE.PARAMS.LINE_FROM),
        lineTo: z.number().describe(TOOL_READ_SOURCE_FILE.PARAMS.LINE_TO),
      },
    },
    async ({ filePath, lineFrom, lineTo }) => {
      try {
        return await handleReadSource(filePath, lineFrom, lineTo);
      } catch (err) {
        return toolError(err);
      }
    },
  );
};
