/**
 * browser_scroll tool definition.
 */

export const TOOL_SCROLL = {
  NAME: 'browser_scroll',
  DESCRIPTION: 'Scroll the page up or down by a specified number of pixels.',
  PARAMS: {
    SESSION_ID: 'Active session ID',
    DIRECTION: 'Scroll direction: "up" or "down"',
    PIXELS: 'Number of pixels to scroll (default: 500)',
  },
} as const;
