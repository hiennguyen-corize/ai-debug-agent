/**
 * MCP Server entry point.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { registerNavigateTool } from './tools/navigate.js';
import { registerGetDomTool } from './tools/get-dom.js';
import { registerClickTool } from './tools/click.js';
import { registerFillTool } from './tools/fill.js';
import { registerHoverTool } from './tools/hover.js';
import { registerSelectTool } from './tools/select.js';
import { registerWaitTool } from './tools/wait.js';
import { registerScreenshotTool } from './tools/screenshot.js';
import { registerGetConsoleLogsTool } from './tools/get-console-logs.js';
import { registerGetNetworkLogsTool } from './tools/get-network-logs.js';
import { registerGetNetworkPayloadTool } from './tools/get-network-payload.js';
import { registerFetchSourceMapTool } from './tools/fetch-source-map.js';
import { registerResolveErrorLocationTool } from './tools/resolve-error-location.js';
import { registerReadSourceFileTool } from './tools/read-source-file.js';
import { registerDispatchBrowserTaskTool } from './tools/dispatch-browser-task.js';
import { registerAskUserTool } from './tools/ask-user.js';
import { registerScrollTool } from './tools/scroll.js';
import { registerUploadFileTool } from './tools/upload-file.js';
import { registerFinishInvestigationTool } from './tools/finish-investigation.js';
import { registerInvestigateBugTool } from './tools/investigate-bug.js';

const server = new McpServer({
  name: 'ai-debug-mcp-server',
  version: '0.1.0',
});

registerNavigateTool(server);
registerGetDomTool(server);
registerClickTool(server);
registerFillTool(server);
registerHoverTool(server);
registerSelectTool(server);
registerWaitTool(server);
registerScreenshotTool(server);
registerGetConsoleLogsTool(server);
registerGetNetworkLogsTool(server);
registerGetNetworkPayloadTool(server);
registerFetchSourceMapTool(server);
registerResolveErrorLocationTool(server);
registerReadSourceFileTool(server);
registerDispatchBrowserTaskTool(server);
registerAskUserTool(server);
registerScrollTool(server);
registerUploadFileTool(server);
registerFinishInvestigationTool(server);
registerInvestigateBugTool(server);

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
