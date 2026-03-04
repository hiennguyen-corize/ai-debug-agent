/**
 * browser_get_dom tool definition.
 */

export const TOOL_GET_DOM = {
  NAME: 'browser_get_dom',
  DESCRIPTION: 'Extract interactive DOM elements with selector stability scores.',
  PARAMS: {
    SESSION_ID: 'Active session ID',
    MAX_ELEMENTS: 'Max elements to extract',
  },
} as const;
