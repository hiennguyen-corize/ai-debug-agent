/**
 * MCP Bridge — connects mcp-client to mcp-server tool invocations.
 *
 * Two modes:
 * - subprocess: spawns mcp-server as child process (standard MCP pattern)
 * - in-process: uses InMemoryTransport for same-process tool calls
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export type McpCall = (tool: string, args: Record<string, unknown>) => Promise<unknown>;

export type McpBridgeHandle = {
  call: McpCall;
  close: () => Promise<void>;
};

const CLIENT_INFO = { name: 'ai-debug-client', version: '0.1.0' } as const;

const extractResult = (response: Awaited<ReturnType<Client['callTool']>>): unknown => {
  if ('toolResult' in response) return response.toolResult;
  const text = response.content[0];
  if (text !== undefined && 'text' in text) {
    try { return JSON.parse(text.text) as unknown; }
    catch { return text.text; }
  }
  return response;
};

const connectClient = async (client: Client, transport: StdioClientTransport | InMemoryTransport): Promise<void> => {
  await client.connect(transport);
};

const createCallFn = (client: Client): McpCall =>
  async (tool, args) => extractResult(await client.callTool({ name: tool, arguments: args }));

export const createSubprocessBridge = async (
  command: string,
  args: string[],
): Promise<McpBridgeHandle> => {
  const client = new Client(CLIENT_INFO);
  const transport = new StdioClientTransport({ command, args, stderr: 'pipe' });
  await connectClient(client, transport);
  return { call: createCallFn(client), close: () => client.close() };
};

export const createInProcessBridge = async (
  server: McpServer,
): Promise<McpBridgeHandle> => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client(CLIENT_INFO);
  await server.server.connect(serverTransport);
  await connectClient(client, clientTransport);
  return { call: createCallFn(client), close: () => client.close() };
};
