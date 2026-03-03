/**
 * browser_wait tool definition.
 */

export const TOOL_WAIT = {
  NAME: 'browser_wait',
  DESCRIPTION: 'Wait for a selector to appear or a timeout to elapse.',
  PARAMS: {
    SESSION_ID: 'Active session ID',
    SELECTOR: 'CSS selector to wait for (optional if using timeout only)',
    TIMEOUT_MS: 'Max wait time in milliseconds (default: 5000)',
  },
} as const;
