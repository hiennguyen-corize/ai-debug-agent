/**
 * Source map tools — direct function calls replacing MCP tool wrappers.
 */

import { fetchSourceMap } from '#sourcemap/fetcher.js';
import { resolveLocation } from '#sourcemap/resolver.js';
import { readSourceFromFile } from '#sourcemap/reader.js';
import type { SourceMapConfig } from '#sourcemap/types.js';

type ToolResult = { success: true; data: unknown } | { success: false; error: string };

const ok = (data: unknown): ToolResult => ({ success: true, data });
const fail = (msg: string): ToolResult => ({ success: false, error: msg });

const handleFetchSourceMap = async (args: Record<string, unknown>): Promise<ToolResult> => {
  const bundleUrl = typeof args['bundleUrl'] === 'string' ? args['bundleUrl'] : '';
  const localMapPath = typeof args['localMapPath'] === 'string' ? args['localMapPath'] : undefined;
  const config: SourceMapConfig | undefined = localMapPath !== undefined ? { localPath: localMapPath } : undefined;
  const result = await fetchSourceMap(bundleUrl, config);
  return ok({ success: result.success, origin: result.origin, mapUrl: result.mapUrl, sourcesCount: result.sourcesCount });
};

const handleResolveErrorLocation = async (args: Record<string, unknown>): Promise<ToolResult> => {
  const bundleUrl = typeof args['bundleUrl'] === 'string' ? args['bundleUrl'] : '';
  const line = typeof args['line'] === 'number' ? args['line'] : 1;
  const column = typeof args['column'] === 'number' ? args['column'] : 0;

  const mapResult = await fetchSourceMap(bundleUrl);
  if (!mapResult.success) return fail(`Source map not found for ${bundleUrl}`);

  const resolved = await resolveLocation(mapResult.rawMap, line, column);
  if (resolved === null) return fail(`Could not resolve ${line.toString()}:${column.toString()}`);

  return ok(resolved);
};

const handleReadSourceFile = async (args: Record<string, unknown>): Promise<ToolResult> => {
  const filePath = typeof args['filePath'] === 'string' ? args['filePath'] : '';
  const lineFrom = typeof args['lineFrom'] === 'number' ? args['lineFrom'] : 1;
  const lineTo = typeof args['lineTo'] === 'number' ? args['lineTo'] : lineFrom + 20;

  const result = await readSourceFromFile(filePath, lineFrom, lineTo);
  if (result === null) return fail(`File not found: ${filePath}`);

  return ok(result);
};

export const sourceMapCall = async (
  tool: string,
  args: Record<string, unknown>,
): Promise<unknown> => {
  switch (tool) {
    case 'fetch_source_map':
      return handleFetchSourceMap(args);
    case 'resolve_error_location':
      return handleResolveErrorLocation(args);
    case 'read_source_file':
      return handleReadSourceFile(args);
    default:
      throw new Error(`Unknown source map tool: ${tool}`);
  }
};
