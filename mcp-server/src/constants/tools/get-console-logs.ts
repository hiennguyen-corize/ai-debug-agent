/**
 * get_console_logs tool definition.
 */

export const TOOL_GET_CONSOLE_LOGS = {
  NAME: 'get_console_logs',
  DESCRIPTION: 'Get captured console messages (errors, warnings, logs) since session start.',
  PARAMS: {
    SESSION_ID: 'Active session ID',
    ERRORS_ONLY: 'Only return errors (default: false)',
  },
} as const;
