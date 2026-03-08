/**
 * Source map tools — direct function calls replacing MCP tool wrappers.
 */

import { fetchSourceMap } from '#sourcemap/fetcher.js';
import { resolveLocation } from '#sourcemap/resolver.js';
import type { SourceMapConfig } from '#sourcemap/types.js';

const handleFetchSourceMap = async (args: Record<string, unknown>): Promise<unknown> => {
  const bundleUrl = typeof args['bundleUrl'] === 'string' ? args['bundleUrl'] : '';
  const localMapPath = typeof args['localMapPath'] === 'string' ? args['localMapPath'] : undefined;
  const config: SourceMapConfig | undefined = localMapPath !== undefined ? { localPath: localMapPath } : undefined;
  const result = await fetchSourceMap(bundleUrl, config);
  return { success: result.success, origin: result.origin, mapUrl: result.mapUrl, sourcesCount: result.sourcesCount };
};

const handleResolveErrorLocation = async (args: Record<string, unknown>): Promise<unknown> => {
  const bundleUrl = typeof args['bundleUrl'] === 'string' ? args['bundleUrl'] : '';
  const line = typeof args['line'] === 'number' ? args['line'] : 1;
  const column = typeof args['column'] === 'number' ? args['column'] : 0;

  const mapResult = await fetchSourceMap(bundleUrl);
  if (!mapResult.success) throw new Error(`Source map not found for ${bundleUrl}`);

  const resolved = await resolveLocation(mapResult.rawMap, line, column);
  if (resolved === null) throw new Error(`Could not resolve ${line.toString()}:${column.toString()}`);

  if (typeof resolved.originalFile === 'string' && resolved.originalFile.includes('node_modules')) {
    return {
      ...resolved,
      _frameworkHint: `⚠ This resolved to framework/library code (${resolved.originalFile}), NOT application code. Look at the stack trace for the NEXT frame that points to application source (src/, pages/, components/, app/). Call resolve_error_location again with that frame's line:column.`,
    };
  }

  return resolved;
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
    default:
      throw new Error(`Unknown source map tool: ${tool}`);
  }
};
