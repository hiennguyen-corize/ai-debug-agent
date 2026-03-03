/**
 * Tool: ask_user
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { TOOL_ASK_USER } from '../constants/tools.js';
import { toolSuccess } from './helpers.js';

export const registerAskUserTool = (server: McpServer): void => {
  server.registerTool(
    TOOL_ASK_USER.NAME,
    {
      description: TOOL_ASK_USER.DESCRIPTION,
      inputSchema: {
        question: z.string().describe(TOOL_ASK_USER.PARAMS.QUESTION),
        context: z.string().describe(TOOL_ASK_USER.PARAMS.CONTEXT),
        attempts: z.number().describe(TOOL_ASK_USER.PARAMS.ATTEMPTS),
      },
    },
    async ({ question, context, attempts }) =>
      toolSuccess({
        status: 'question_emitted',
        question,
        context,
        attempts,
      }),
  );
};
