/**
 * Per-tool result truncation — prevents verbose tool outputs from burning context.
 *
 * Different tools produce different volumes of output. Snapshots and network
 * logs can be extremely large. This module applies tool-specific limits
 * before results enter the message history.
 */

const TOOL_RESULT_LIMITS: Readonly<Record<string, number>> = {
  browser_snapshot: 4000,
  browser_network_requests: 3000,
  browser_console_messages: 2000,
  browser_evaluate: 2000,
  fetch_source_map: 4000,
};

const DEFAULT_LIMIT = 4000;

export const truncateToolResult = (result: string, toolName: string): string => {
  const limit = TOOL_RESULT_LIMITS[toolName] ?? DEFAULT_LIMIT;
  if (result.length <= limit) return result;
  return `${result.slice(0, limit)}\n...[truncated ${(result.length - limit).toString()} chars]`;
};
