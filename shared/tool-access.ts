/**
 * Tool Access Control — typed registry per agent role.
 * Runtime enforcement: assertToolAccess throws if agent calls unauthorized tool.
 */

import type { AgentName } from './agent.js';
import { TOOL_NAME, type ToolName } from './tool-names.js';

const T = TOOL_NAME;

const BROWSER_TOOLS: readonly ToolName[] = [
  T.BROWSER_NAVIGATE, T.BROWSER_GET_DOM, T.BROWSER_CLICK, T.BROWSER_FILL,
  T.BROWSER_HOVER, T.BROWSER_SELECT, T.BROWSER_WAIT, T.BROWSER_SCREENSHOT,
  T.BROWSER_SCROLL, T.BROWSER_UPLOAD_FILE,
  T.GET_CONSOLE_LOGS, T.GET_NETWORK_LOGS, T.GET_NETWORK_PAYLOAD,
] as const;

const ANALYSIS_TOOLS: readonly ToolName[] = [
  T.DISPATCH_BROWSER_TASK, T.FETCH_SOURCE_MAP, T.RESOLVE_ERROR_LOCATION,
  T.READ_SOURCE_FILE, T.ASK_USER, T.FINISH_INVESTIGATION,
] as const;

const SCOUT_TOOLS: readonly ToolName[] = [
  T.BROWSER_NAVIGATE, T.BROWSER_GET_DOM, T.BROWSER_CLICK,
  T.GET_CONSOLE_LOGS, T.GET_NETWORK_LOGS, T.BROWSER_SCREENSHOT,
] as const;

export const TOOL_ACCESS: Record<AgentName, readonly ToolName[]> = {
  investigator: ANALYSIS_TOOLS,
  explorer: BROWSER_TOOLS,
  scout: SCOUT_TOOLS,
  synthesis: [],
} as const;

export class ToolAccessDeniedError extends Error {
  constructor(agent: AgentName, tool: string) {
    super(`[403] Agent "${agent}" is not permitted to call tool "${tool}"`);
    this.name = 'ToolAccessDeniedError';
  }
}

export const assertToolAccess = (agent: AgentName, tool: string): void => {
  const allowed = TOOL_ACCESS[agent];
  if (!allowed.includes(tool as ToolName)) {
    throw new ToolAccessDeniedError(agent, tool);
  }
};
