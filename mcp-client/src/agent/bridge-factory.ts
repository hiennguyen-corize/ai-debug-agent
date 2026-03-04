/**
 * BridgeFactory — centralized MCP bridge creation.
 * Eliminates hardcoded server paths across consumers.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createSubprocessBridge, createInProcessBridge, type McpBridgeHandle } from '#agent/mcp-bridge.js';
import { resolve } from 'node:path';

const MCP_SERVER_CMD = 'node';
const MCP_SERVER_ENTRY = resolve(process.cwd(), 'mcp-server', 'dist', 'index.js');

export const createDefaultBridge = (): Promise<McpBridgeHandle> =>
  createSubprocessBridge(MCP_SERVER_CMD, [MCP_SERVER_ENTRY]);

export const createBridgeForServer = (server: McpServer): Promise<McpBridgeHandle> =>
  createInProcessBridge(server);
