/**
 * Investigation domain types.
 */

export type InvestigationMode = 'interactive' | 'autonomous';

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

export type Evidence = {
  type: string;
  description: string;
  data?: unknown;
};

export type InvestigationReport = {
  summary: string;
  rootCause: string;
  codeLocation: SourceMapResolution | null;
  dataFlow: string;
  suggestedFix: CodeAnalysis['suggestedFix'];
  reproSteps: string[];
  evidence: Evidence[];
  hypotheses: never[];
  severity: ReportSeverity;
  cannotDetermine: boolean;
  assumptions: string[];
  timestamp: string;
  url: string;
  durationMs: number;
};
