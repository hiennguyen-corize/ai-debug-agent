/**
 * Investigation domain types.
 */

export const INVESTIGATION_MODE = {
  INTERACTIVE: 'interactive',
  AUTONOMOUS: 'autonomous',
} as const;

export type InvestigationMode = (typeof INVESTIGATION_MODE)[keyof typeof INVESTIGATION_MODE];

export type SourceMapResolution = {
  bundleUrl: string;
  sourceMapUrl: string;
  originalFile: string;
  originalLine: number;
  originalColumn: number;
  codeSnippet: string;
};

export type CodeAnalysis = {
  errorLocation: SourceMapResolution;
  dataFlow: {
    uiComponent: string;
    apiCall: string;
    stateUpdate: string;
    rootCause: string;
  };
  suggestedFix: {
    file: string;
    line: number;
    before: string;
    after: string;
    explanation: string;
  } | null;
};

export const REPORT_SEVERITY = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
} as const;

export type ReportSeverity = (typeof REPORT_SEVERITY)[keyof typeof REPORT_SEVERITY];

export const THREAD_STATUS = {
  QUEUED: 'queued',
  RUNNING: 'running',
  DONE: 'done',
  ERROR: 'error',
} as const;

export type ThreadStatus = (typeof THREAD_STATUS)[keyof typeof THREAD_STATUS];

export type Evidence = {
  type: string;
  description: string;
  data?: unknown;
};

export type CodeLocation = {
  file: string;
  line: number;
  column?: number | undefined;
  snippet?: string | undefined;
};

export type InvestigationReport = {
  summary: string;
  rootCause: string;
  codeLocation: CodeLocation | null;
  dataFlow: string;
  suggestedFix: CodeAnalysis['suggestedFix'];
  reproSteps: string[];
  evidence: Evidence[];
  networkFindings: string[];
  timeline: string[];
  hypotheses: never[];
  severity: ReportSeverity;
  cannotDetermine: boolean;
  assumptions: string[];
  timestamp: string;
  url: string;
  durationMs: number;
};
