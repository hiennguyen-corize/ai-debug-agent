/**
 * MCP Server entry point.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { registerNavigateTool } from './tools/navigate.js';
import { registerGetDomTool } from './tools/get-dom.js';
import { registerClickTool } from './tools/click.js';
import { registerFillTool } from './tools/fill.js';
import { registerGetConsoleLogsTool } from './tools/get-console-logs.js';
import { registerGetNetworkLogsTool } from './tools/get-network-logs.js';

const server = new McpServer({
  name: 'ai-debug-mcp-server',
  version: '0.1.0',
});

registerNavigateTool(server);
registerGetDomTool(server);
registerClickTool(server);
registerFillTool(server);
registerGetConsoleLogsTool(server);
registerGetNetworkLogsTool(server);

const main = async (): Promise<void> => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // eslint-disable-next-line no-console
  console.error('AI Debug MCP Server running on stdio');
};

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error:', err);
  process.exit(1);
});

export { server };
