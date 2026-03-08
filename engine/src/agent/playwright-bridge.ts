/**
 * PlaywrightBridge — Spawn official @playwright/mcp as subprocess.
 *
 * Provides accessibility-tree-based browser tools with ref-based element selection.
 * Replaces custom browser tools (CSS selector approach) with @playwright/mcp.
 *
 * Error handling: transport pipe errors (EPIPE, ECONNRESET) are caught and logged
 * instead of crashing the process. This prevents the entire API server from dying
 * when the MCP subprocess exits unexpectedly (e.g., during server restart).
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

type OpenAITool = {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

const ALLOWED_PLAYWRIGHT_TOOLS = new Set([
  'browser_navigate',
  'browser_snapshot',
  'browser_click',
  'browser_type',
  'browser_select_option',
  'browser_scroll',
  'browser_hover',
  'browser_console_messages',
  'browser_network_requests',
  'browser_evaluate',
  'browser_wait_for',
]);

export type PlaywrightBridgeHandle = {
  call: (tool: string, args: Record<string, unknown>) => Promise<unknown>;
  tools: OpenAITool[];
  close: () => Promise<void>;
};

export const createPlaywrightBridge = async (headless = true): Promise<PlaywrightBridgeHandle> => {
  // Write temp config to redirect Playwright MCP output files to OS temp dir
  const outputDir = path.join(os.tmpdir(), 'playwright-mcp-output');
  const configPath = path.join(os.tmpdir(), `pw-mcp-config-${Date.now().toString()}.json`);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({ outputDir, outputMode: 'stdout' }));

  const args = ['-y', '@playwright/mcp@latest', '--config', configPath];
  if (headless) args.push('--headless');

  const transport = new StdioClientTransport({
    command: 'npx',
    args,
    env: Object.fromEntries(
      Object.entries(process.env).filter(([, v]) => v !== undefined),
    ) as Record<string, string>,
  });

  // Handle stdio pipe errors — prevent EPIPE from crashing the process.
  // This can happen when the subprocess exits before we finish writing,
  // or during server restarts when the process is killed mid-communication.
  transport.onerror = (err) => {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EPIPE' || code === 'ECONNRESET' || code === 'ERR_STREAM_DESTROYED') {
      process.stderr.write(`[PlaywrightBridge] Transport pipe error (${code}) — subprocess likely exited\n`);
    } else {
      process.stderr.write(`[PlaywrightBridge] Transport error: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  };

  const client = new Client({ name: 'ai-debug-playwright', version: '1.0.0' });
  await client.connect(transport);

  const { tools: mcpTools } = await client.listTools();

  const tools: OpenAITool[] = mcpTools
    .filter((t) => ALLOWED_PLAYWRIGHT_TOOLS.has(t.name))
    .map((t) => {
      // Strip 'filename' from schemas — prevent LLM from requesting file output
      const params = structuredClone(t.inputSchema) as Record<string, unknown>;
      const props = params['properties'] as Record<string, unknown> | undefined;
      if (props) delete props['filename'];
      const req = params['required'] as string[] | undefined;
      if (req) params['required'] = req.filter((r) => r !== 'filename');
      return {
        type: 'function' as const,
        function: { name: t.name, description: t.description ?? '', parameters: params },
      };
    });

  let closed = false;

  /**
   * Resolve markdown file references in Playwright MCP output.
   * Playwright MCP writes large outputs (console, snapshot, network) to files
   * and returns markdown links like `[Console](console.txt)`. The LLM can't
   * follow those links, so we read the files and inline their content.
   */
  const resolveFileReferences = (content: unknown): unknown => {
    if (!Array.isArray(content)) return content;
    return content.map((item: unknown) => {
      if (typeof item !== 'object' || item === null) return item;
      const obj = item as Record<string, unknown>;
      if (obj['type'] !== 'text' || typeof obj['text'] !== 'string') return item;

      const text = obj['text'];
      // Match markdown links like [Console](console.txt) or [Snapshot](snap.txt) or [Network](network.txt)
      const resolved = text.replace(
        /- \[(\w+)\]\(([^)]+\.txt)\)/g,
        (_match: string, _label: string, filename: string) => {
          const filePath = path.join(outputDir, filename);
          try {
            if (fs.existsSync(filePath)) {
              const fileContent = fs.readFileSync(filePath, 'utf-8');
              return fileContent;
            }
          } catch { /* file not found — keep original link */ }
          return _match;
        },
      );
      return { ...obj, text: resolved };
    });
  };

  const call = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    if (closed) throw new Error('PlaywrightBridge is closed');
    // Strip filename arg — force inline content, never write to disk
    const { filename: _dropped, ...cleanArgs } = args;
    try {
      const result = await client.callTool({ name, arguments: cleanArgs });
      return resolveFileReferences(result.content);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'EPIPE' || code === 'ECONNRESET') {
        throw new Error(`Playwright subprocess disconnected (${code})`);
      }
      throw err;
    }
  };

  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    try {
      await client.close();
    } catch {
      // Subprocess may already be dead — swallow close errors
    }
  };

  return { call, tools, close };
};
