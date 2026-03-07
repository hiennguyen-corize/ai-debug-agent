/**
 * Browser-related shared types used by engine.
 */

export const CONSOLE_LOG_TYPE = {
  LOG: 'log',
  WARN: 'warn',
  ERROR: 'error',
  INFO: 'info',
  DEBUG: 'debug',
} as const;

export type ConsoleLogType = (typeof CONSOLE_LOG_TYPE)[keyof typeof CONSOLE_LOG_TYPE];

export type CapturedLog = {
  type: ConsoleLogType;
  text: string;
  timestamp: number;
  url?: string | undefined;
};

export type CapturedRequest = {
  url: string;
  method: string;
  status: number;
  statusText: string;
  resourceType: string;
  timestamp: number;
  durationMs?: number | undefined;
  error?: string | undefined;
};

export type BrowserTask = {
  url: string;
  hint?: string | undefined;
};

export type BrowserTaskResult = {
  logs: CapturedLog[];
  requests: CapturedRequest[];
  screenshot?: string | undefined;
};

export type CorrelatedEvidence = {
  consoleErrors: CapturedLog[];
  networkErrors: CapturedRequest[];
  correlation: string;
};
