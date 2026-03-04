/**
 * Tool: get_network_payload
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { TOOL_GET_NETWORK_PAYLOAD } from '#constants/tools.js';
import { getCollector } from './navigate.js';
import { toolSuccess, toolError } from './helpers.js';

export const registerGetNetworkPayloadTool = (server: McpServer): void => {
  server.registerTool(
    TOOL_GET_NETWORK_PAYLOAD.NAME,
    {
      description: TOOL_GET_NETWORK_PAYLOAD.DESCRIPTION,
      inputSchema: {
        sessionId: z.string().describe(TOOL_GET_NETWORK_PAYLOAD.PARAMS.SESSION_ID),
        urlPattern: z.string().describe(TOOL_GET_NETWORK_PAYLOAD.PARAMS.URL_PATTERN),
      },
    },
    async ({ sessionId, urlPattern }) => {
      try {
        const collector = getCollector(sessionId);
        const payloads = await collector.getPayloadForUrl(urlPattern);
        return toolSuccess(payloads);
      } catch (err) {
        return toolError(err);
      }
    },
  );
};
