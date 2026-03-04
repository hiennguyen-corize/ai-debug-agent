/**
 * browser_select tool definition.
 */

export const TOOL_SELECT = {
  NAME: 'browser_select',
  DESCRIPTION: 'Select an option from a dropdown/select element.',
  PARAMS: {
    SESSION_ID: 'Active session ID',
    SELECTOR: 'CSS selector of select element',
    VALUE: 'Option value to select',
  },
} as const;
