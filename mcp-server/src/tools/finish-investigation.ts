/**
 * Tool: finish_investigation
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { TOOL_FINISH_INVESTIGATION } from '#constants/tools.js';
import { toolSuccess } from './helpers.js';

export const registerFinishInvestigationTool = (server: McpServer): void => {
  server.registerTool(
    TOOL_FINISH_INVESTIGATION.NAME,
    {
      description: TOOL_FINISH_INVESTIGATION.DESCRIPTION,
      inputSchema: {
        reason: z.string().describe(TOOL_FINISH_INVESTIGATION.PARAMS.REASON),
        confident: z.boolean().describe(TOOL_FINISH_INVESTIGATION.PARAMS.CONFIDENT),
      },
    },
    ({ reason, confident }) =>
      toolSuccess({ status: 'finishing', reason, confident }),
  );
};
