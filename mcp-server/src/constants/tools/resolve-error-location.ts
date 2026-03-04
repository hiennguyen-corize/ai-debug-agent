/**
 * resolve_error_location tool definition.
 */

export const TOOL_RESOLVE_ERROR_LOCATION = {
  NAME: 'resolve_error_location',
  DESCRIPTION: 'Resolve a minified JS location to original file:line via source map.',
  PARAMS: {
    BUNDLE_URL: 'URL of the JavaScript bundle',
    LINE: 'Line number in minified bundle',
    COLUMN: 'Column number in minified bundle',
  },
} as const;
