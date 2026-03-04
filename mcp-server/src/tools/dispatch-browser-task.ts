/**
 * Tool: dispatch_browser_task
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { TOOL_DISPATCH_BROWSER_TASK } from '#constants/tools.js';
import { toolSuccess } from './helpers.js';

type TaskInput = {
  task: string;
  stopCondition: string;
  collectEvidence: string[];
  hypothesisId: string;
  timeoutMs: number;
};

const buildTaskResponse = (input: TaskInput): ReturnType<typeof toolSuccess> =>
  toolSuccess({ taskId: crypto.randomUUID(), status: 'dispatched', ...input });

export const registerDispatchBrowserTaskTool = (server: McpServer): void => {
  server.registerTool(
    TOOL_DISPATCH_BROWSER_TASK.NAME,
    {
      description: TOOL_DISPATCH_BROWSER_TASK.DESCRIPTION,
      inputSchema: {
        task: z.string().describe(TOOL_DISPATCH_BROWSER_TASK.PARAMS.TASK),
        stopCondition: z.string().describe(TOOL_DISPATCH_BROWSER_TASK.PARAMS.STOP_CONDITION),
        collectEvidence: z.array(z.string()).describe(TOOL_DISPATCH_BROWSER_TASK.PARAMS.COLLECT_EVIDENCE),
        hypothesisId: z.string().describe(TOOL_DISPATCH_BROWSER_TASK.PARAMS.HYPOTHESIS_ID),
        timeoutMs: z.number().describe(TOOL_DISPATCH_BROWSER_TASK.PARAMS.TIMEOUT_MS),
      },
    },
    async (input) => buildTaskResponse(input),
  );
};
