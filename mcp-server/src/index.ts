/**
 * MCP Server entry point.
 * Browser tools removed — now handled by @playwright/mcp.
 * Only analysis and orchestration tools remain.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { logger } from '#lib/logger.js';

import { registerFetchSourceMapTool } from './tools/fetch-source-map.js';
import { registerResolveErrorLocationTool } from './tools/resolve-error-location.js';
import { registerReadSourceFileTool } from './tools/read-source-file.js';
import { registerDispatchBrowserTaskTool } from './tools/dispatch-browser-task.js';
import { registerAskUserTool } from './tools/ask-user.js';
import { registerFinishInvestigationTool } from './tools/finish-investigation.js';
import { registerInvestigateBugTool } from './tools/investigate-bug.js';

const server = new McpServer({
  name: 'ai-debug-mcp-server',
  version: '0.1.0',
});

// Analysis tools (kept — no @playwright/mcp equivalent)
registerFetchSourceMapTool(server);
registerResolveErrorLocationTool(server);
registerReadSourceFileTool(server);

// Orchestration tools
registerDispatchBrowserTaskTool(server);
registerAskUserTool(server);
registerFinishInvestigationTool(server);
registerInvestigateBugTool(server);

const main = async (): Promise<void> => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('AI Debug MCP Server running on stdio');
};

main().catch((err: unknown) => {
  logger.fatal({ err }, 'Fatal error');
  process.exit(1);
});

export { server };
