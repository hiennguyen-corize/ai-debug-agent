/**
 * Auth login — form-based login strategy.
 */

type LoginConfig = {
  loginUrl: string;
  credentials: { email: string; password: string };
  successIndicator: string;
  timeoutMs: number;
};

type McpCall = (tool: string, args: Record<string, unknown>) => Promise<unknown>;

const fillCredentials = async (config: LoginConfig, mcpCall: McpCall): Promise<void> => {
  await mcpCall('browser_fill', {
    sessionId: '', selector: 'input[type="email"], input[name="email"], #email',
    value: config.credentials.email,
  });
  await mcpCall('browser_fill', {
    sessionId: '', selector: 'input[type="password"], input[name="password"], #password',
    value: config.credentials.password,
  });
};

const submitAndWait = async (config: LoginConfig, mcpCall: McpCall): Promise<void> => {
  await mcpCall('browser_click', {
    sessionId: '', selector: 'button[type="submit"], input[type="submit"]',
  });
  await mcpCall('browser_wait', {
    sessionId: '', condition: 'networkidle', timeoutMs: config.timeoutMs,
  });
};

export const formLogin = async (config: LoginConfig, mcpCall: McpCall): Promise<boolean> => {
  try {
    await mcpCall('browser_navigate', { url: config.loginUrl });
    await fillCredentials(config, mcpCall);
    await submitAndWait(config, mcpCall);
    return true;
  } catch {
    return false;
  }
};
