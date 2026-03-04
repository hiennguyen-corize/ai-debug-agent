/**
 * Tool: browser_navigate
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createSession } from '#browser/browser.js';
import { navigateTo } from '#browser/actions.js';
import { PageCollector } from '#browser/collector.js';
import { TOOL_NAVIGATE } from '#constants/tools.js';
import { toolSuccess, toolError } from './helpers.js';

const collectors = new Map<string, PageCollector>();

export const getCollector = (sessionId: string): PageCollector => {
  let collector = collectors.get(sessionId);
  if (collector === undefined) {
    collector = new PageCollector();
    collectors.set(sessionId, collector);
  }
  return collector;
};

const handleNavigation = async (
  url: string,
  sid: string,
): Promise<ReturnType<typeof toolSuccess> | ReturnType<typeof toolError>> => {
  const page = await createSession(sid);
  const collector = getCollector(sid);
  collector.start(page);

  const result = await navigateTo(page, url);
  if (!result.success) {
    return toolError(new Error(`Navigation failed: ${result.error ?? 'unknown'}`));
  }

  const title = await page.title();
  return toolSuccess({ sessionId: sid, url: page.url(), title, status: 'navigated' });
};

export const registerNavigateTool = (server: McpServer): void => {
  server.registerTool(
    TOOL_NAVIGATE.NAME,
    {
      description: TOOL_NAVIGATE.DESCRIPTION,
      inputSchema: {
        url: z.string().url().describe(TOOL_NAVIGATE.PARAMS.URL),
        sessionId: z.string().optional().describe(TOOL_NAVIGATE.PARAMS.SESSION_ID),
      },
    },
    async ({ url, sessionId }) => {
      try {
        return await handleNavigation(url, sessionId ?? `session-${Date.now().toString()}`);
      } catch (err) {
        return toolError(err);
      }
    },
  );
};
