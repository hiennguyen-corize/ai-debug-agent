/**
 * Browser task and correlation tracing types.
 */

export type BrowserTask = {
  task: string;
  lookFor: string[];
  stopCondition: string;
  maxActions?: number;
};

export type CapturedRequest = {
  actionId: string;
  method: string;
  url: string;
  status: number;
  requestStart: number;
  responseEnd: number;
  durationMs: number;
  initiator: string;
};

export const CONSOLE_LOG_TYPE = {
  LOG: 'log',
  WARNING: 'warning',
  ERROR: 'error',
  INFO: 'info',
} as const;

export type ConsoleLogType = (typeof CONSOLE_LOG_TYPE)[keyof typeof CONSOLE_LOG_TYPE];

export type CapturedLog = {
  actionId: string;
  type: ConsoleLogType;
  text: string;
  timestamp: number;
};

export type CorrelatedEvidence = {
  actionId: string;
  action: string;
  timestamp: number;
  networkEvents: CapturedRequest[];
  consoleEvents: CapturedLog[];
};

export type BrowserTaskResult = {
  observations: string[];
  networkActivity: CapturedRequest[];
  consoleActivity: CapturedLog[];
  screenshotPaths: string[];
  error?: string;
};
