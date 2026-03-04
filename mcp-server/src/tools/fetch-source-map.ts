/**
 * Tool: fetch_source_map
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { TOOL_FETCH_SOURCE_MAP } from '#constants/tools.js';
import { fetchSourceMap } from '#sourcemap/fetcher.js';
import { toolSuccess, toolError } from './helpers.js';

export const registerFetchSourceMapTool = (server: McpServer): void => {
  server.registerTool(
    TOOL_FETCH_SOURCE_MAP.NAME,
    {
      description: TOOL_FETCH_SOURCE_MAP.DESCRIPTION,
      inputSchema: {
        bundleUrl: z.string().url().describe(TOOL_FETCH_SOURCE_MAP.PARAMS.BUNDLE_URL),
        localMapPath: z.string().optional().describe(TOOL_FETCH_SOURCE_MAP.PARAMS.LOCAL_MAP_PATH),
      },
    },
    async ({ bundleUrl, localMapPath }) => {
      try {
        const config = localMapPath !== undefined ? { localPath: localMapPath } : undefined;
        const result = await fetchSourceMap(bundleUrl, config);
        const { rawMap: _raw, ...summary } = result;
        return toolSuccess(summary);
      } catch (err) {
        return toolError(err);
      }
    },
  );
};
