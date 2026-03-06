/**
 * MCP Server logger — pino instance.
 */

import pino from 'pino';

export const logger = pino({ name: 'ai-debug-mcp-server' });
