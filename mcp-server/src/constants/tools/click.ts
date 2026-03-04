/**
 * browser_click tool definition.
 */

export const TOOL_CLICK = {
  NAME: 'browser_click',
  DESCRIPTION: 'Click an element. Blocked by guardrails if dangerous (payment, delete, logout).',
  PARAMS: {
    SESSION_ID: 'Active session ID',
    SELECTOR: 'CSS selector of element to click',
  },
} as const;
