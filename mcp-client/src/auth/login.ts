/**
 * Auth login — form-based login strategy.
 */

import { TOOL_NAME } from '@ai-debug/shared';

type LoginConfig = {
  loginUrl: string;
  credentials: { email: string; password: string };
  successIndicator: string;
  timeoutMs: number;
};

type McpCall = (tool: string, args: Record<string, unknown>) => Promise<unknown>;

const LOGIN_SELECTORS = {
  EMAIL: 'input[type="email"], input[name="email"], #email',
  PASSWORD: 'input[type="password"], input[name="password"], #password',
  SUBMIT: 'button[type="submit"], input[type="submit"]',
} as const;

const WAIT_CONDITION = 'networkidle';

const fillCredentials = async (config: LoginConfig, mcpCall: McpCall): Promise<void> => {
  await mcpCall(TOOL_NAME.BROWSER_FILL, {
    sessionId: '', selector: LOGIN_SELECTORS.EMAIL,
    value: config.credentials.email,
  });
  await mcpCall(TOOL_NAME.BROWSER_FILL, {
    sessionId: '', selector: LOGIN_SELECTORS.PASSWORD,
    value: config.credentials.password,
  });
};

const submitAndWait = async (config: LoginConfig, mcpCall: McpCall): Promise<void> => {
  await mcpCall(TOOL_NAME.BROWSER_CLICK, {
    sessionId: '', selector: LOGIN_SELECTORS.SUBMIT,
  });
  await mcpCall(TOOL_NAME.BROWSER_WAIT, {
    sessionId: '', condition: WAIT_CONDITION, timeoutMs: config.timeoutMs,
  });
};

export const formLogin = async (config: LoginConfig, mcpCall: McpCall): Promise<boolean> => {
  try {
    await mcpCall(TOOL_NAME.BROWSER_NAVIGATE, { url: config.loginUrl });
    await fillCredentials(config, mcpCall);
    await submitAndWait(config, mcpCall);
    return true;
  } catch {
    return false;
  }
};
