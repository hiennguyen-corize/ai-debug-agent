/**
 * get_network_payload tool definition.
 */

export const TOOL_GET_NETWORK_PAYLOAD = {
  NAME: 'get_network_payload',
  DESCRIPTION: 'Get request/response body for a specific network request by URL pattern.',
  PARAMS: {
    SESSION_ID: 'Active session ID',
    URL_PATTERN: 'URL substring to match (e.g. "/api/cart/add")',
  },
} as const;
