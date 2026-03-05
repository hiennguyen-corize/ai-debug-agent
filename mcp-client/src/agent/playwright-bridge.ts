/**
 * PlaywrightBridge — Spawn official @playwright/mcp as subprocess.
 *
 * Provides accessibility-tree-based browser tools with ref-based element selection.
 * Replaces custom browser tools (CSS selector approach) with @playwright/mcp.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type OpenAI from 'openai';

export type PlaywrightBridgeHandle = {
  call: (tool: string, args: Record<string, unknown>) => Promise<unknown>;
  tools: OpenAI.Chat.ChatCompletionTool[];
  close: () => Promise<void>;
};

export const createPlaywrightBridge = async (headless = true): Promise<PlaywrightBridgeHandle> => {
  const args = ['-y', '@playwright/mcp@latest'];
  if (headless) args.push('--headless');

  const transport = new StdioClientTransport({
    command: 'npx',
    args,
    env: Object.fromEntries(
      Object.entries(process.env).filter(([, v]) => v !== undefined),
    ) as Record<string, string>,
  });

  const client = new Client({ name: 'ai-debug-playwright', version: '1.0.0' });
  await client.connect(transport);

  const { tools: mcpTools } = await client.listTools();

  const tools: OpenAI.Chat.ChatCompletionTool[] = mcpTools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description ?? '',
      parameters: t.inputSchema as Record<string, unknown>,
    },
  }));

  const call = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    const result = await client.callTool({ name, arguments: args });
    return result.content;
  };

  return { call, tools, close: () => client.close() };
};
