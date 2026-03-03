/**
 * Tool: resolve_error_location
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { TOOL_RESOLVE_ERROR_LOCATION } from '../constants/tools.js';
import { fetchSourceMap } from '../sourcemap/fetcher.js';
import { resolveLocation } from '../sourcemap/resolver.js';
import { toolSuccess, toolError } from './helpers.js';

const handleResolve = async (
  bundleUrl: string,
  line: number,
  column: number,
): Promise<ReturnType<typeof toolSuccess> | ReturnType<typeof toolError>> => {
  const mapResult = await fetchSourceMap(bundleUrl);
  if (!mapResult.success) return toolError(new Error(`Source map not found for ${bundleUrl}`));

  const resolved = await resolveLocation(mapResult.rawMap, line, column);
  if (resolved === null) return toolError(new Error(`Could not resolve ${line.toString()}:${column.toString()}`));

  return toolSuccess(resolved);
};

export const registerResolveErrorLocationTool = (server: McpServer): void => {
  server.registerTool(
    TOOL_RESOLVE_ERROR_LOCATION.NAME,
    {
      description: TOOL_RESOLVE_ERROR_LOCATION.DESCRIPTION,
      inputSchema: {
        bundleUrl: z.string().url().describe(TOOL_RESOLVE_ERROR_LOCATION.PARAMS.BUNDLE_URL),
        line: z.number().describe(TOOL_RESOLVE_ERROR_LOCATION.PARAMS.LINE),
        column: z.number().describe(TOOL_RESOLVE_ERROR_LOCATION.PARAMS.COLUMN),
      },
    },
    async ({ bundleUrl, line, column }) => {
      try {
        return await handleResolve(bundleUrl, line, column);
      } catch (err) {
        return toolError(err);
      }
    },
  );
};
