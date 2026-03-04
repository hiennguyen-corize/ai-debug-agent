/**
 * dispatch_browser_task tool definition.
 */

export const TOOL_DISPATCH_BROWSER_TASK = {
  NAME: 'dispatch_browser_task',
  DESCRIPTION: 'Dispatch a browser task to Explorer subagent for execution.',
  PARAMS: {
    TASK: 'Self-contained task description for Explorer',
    STOP_CONDITION: 'When Explorer should stop and return results',
    COLLECT_EVIDENCE: 'Evidence types to collect (console_errors, network_logs, screenshot, dom_state)',
    HYPOTHESIS_ID: 'ID of hypothesis this task tests',
    TIMEOUT_MS: 'Task timeout in milliseconds',
  },
} as const;
