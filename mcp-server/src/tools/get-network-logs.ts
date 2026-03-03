/**
 * Tool: get_network_logs
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { TOOL_GET_NETWORK_LOGS } from '../constants/tools.js';
import { getCollector } from './navigate.js';
import { toolSuccess, toolError } from './helpers.js';

export const registerGetNetworkLogsTool = (server: McpServer): void => {
  server.registerTool(
    TOOL_GET_NETWORK_LOGS.NAME,
    {
      description: TOOL_GET_NETWORK_LOGS.DESCRIPTION,
      inputSchema: {
        sessionId: z.string().describe(TOOL_GET_NETWORK_LOGS.PARAMS.SESSION_ID),
        errorsOnly: z.boolean().optional().describe(TOOL_GET_NETWORK_LOGS.PARAMS.ERRORS_ONLY),
      },
    },
    async ({ sessionId, errorsOnly }) => {
      try {
        const collector = getCollector(sessionId);
        const logs = (errorsOnly ?? false) ? collector.getNetworkErrors() : collector.getNetworkLogs();
        return toolSuccess(logs);
      } catch (err) {
        return toolError(err);
      }
    },
  );
};
