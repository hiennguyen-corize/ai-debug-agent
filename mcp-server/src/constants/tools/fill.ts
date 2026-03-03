/**
 * browser_fill tool definition.
 */

export const TOOL_FILL = {
  NAME: 'browser_fill',
  DESCRIPTION: 'Fill a text input field with a value.',
  PARAMS: {
    SESSION_ID: 'Active session ID',
    SELECTOR: 'CSS selector of input element',
    VALUE: 'Value to fill',
  },
} as const;
