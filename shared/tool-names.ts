/**
 * MCP tool name constants — shared across mcp-server and mcp-client.
 */

export const TOOL_NAME = {
  BROWSER_NAVIGATE: 'browser_navigate',
  BROWSER_GET_DOM: 'browser_get_dom',
  BROWSER_CLICK: 'browser_click',
  BROWSER_FILL: 'browser_fill',
  BROWSER_HOVER: 'browser_hover',
  BROWSER_SELECT: 'browser_select',
  BROWSER_WAIT: 'browser_wait',
  BROWSER_SCREENSHOT: 'browser_screenshot',
  BROWSER_SCROLL: 'browser_scroll',
  BROWSER_UPLOAD_FILE: 'browser_upload_file',
  GET_CONSOLE_LOGS: 'get_console_logs',
  GET_NETWORK_LOGS: 'get_network_logs',
  GET_NETWORK_PAYLOAD: 'get_network_payload',
  FETCH_SOURCE_MAP: 'fetch_source_map',
  RESOLVE_ERROR_LOCATION: 'resolve_error_location',
  READ_SOURCE_FILE: 'read_source_file',
  DISPATCH_BROWSER_TASK: 'dispatch_browser_task',
  ASK_USER: 'ask_user',
  FINISH_INVESTIGATION: 'finish_investigation',
} as const;

export type ToolName = (typeof TOOL_NAME)[keyof typeof TOOL_NAME];
