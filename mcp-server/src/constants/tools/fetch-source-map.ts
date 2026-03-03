/**
 * fetch_source_map tool definition.
 */

export const TOOL_FETCH_SOURCE_MAP = {
  NAME: 'fetch_source_map',
  DESCRIPTION: 'Fetch and parse a source map for a JavaScript bundle URL.',
  PARAMS: {
    BUNDLE_URL: 'URL of the JavaScript bundle file',
    LOCAL_MAP_PATH: 'Local path to .map file (optional override)',
  },
} as const;
