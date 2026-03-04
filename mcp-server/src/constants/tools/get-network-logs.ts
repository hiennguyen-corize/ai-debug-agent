/**
 * get_network_logs tool definition.
 */

export const TOOL_GET_NETWORK_LOGS = {
  NAME: 'get_network_logs',
  DESCRIPTION: 'Get captured network requests: method, URL, status, duration.',
  PARAMS: {
    SESSION_ID: 'Active session ID',
    ERRORS_ONLY: 'Only return 4xx/5xx (default: false)',
  },
} as const;
