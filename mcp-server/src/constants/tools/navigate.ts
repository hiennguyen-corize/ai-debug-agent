/**
 * browser_navigate tool definition.
 */

export const TOOL_NAVIGATE = {
  NAME: 'browser_navigate',
  DESCRIPTION: 'Navigate to a URL. Creates a new browser session if needed.',
  PARAMS: {
    URL: 'URL to navigate to',
    SESSION_ID: 'Session ID (auto-generated if omitted)',
  },
} as const;
