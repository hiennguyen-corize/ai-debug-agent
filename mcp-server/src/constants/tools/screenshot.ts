/**
 * browser_screenshot tool definition.
 */

export const TOOL_SCREENSHOT = {
  NAME: 'browser_screenshot',
  DESCRIPTION: 'Take a screenshot of the current page. Returns base64-encoded PNG.',
  PARAMS: {
    SESSION_ID: 'Active session ID',
    FULL_PAGE: 'Capture full scrollable page (default: false)',
  },
} as const;
