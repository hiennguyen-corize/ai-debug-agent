/**
 * browser_hover tool definition.
 */

export const TOOL_HOVER = {
  NAME: 'browser_hover',
  DESCRIPTION: 'Hover over an element to trigger hover states, tooltips, or dropdowns.',
  PARAMS: {
    SESSION_ID: 'Active session ID',
    SELECTOR: 'CSS selector of element to hover',
  },
} as const;
