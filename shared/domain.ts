/**
 * Investigation domain types — scout observations, reports, code analysis.
 */

import type { Evidence, Hypothesis } from './hypothesis.js';
import type { ParsedError } from './stack-frame.js';

export type NetworkError = {
  url: string;
  method: string;
  status: number;
  statusText: string;
};

export type ScoutObservation = {
  url: string;
  pageTitle: string;
  consoleErrors: string[];
  parsedErrors: ParsedError[];
  networkErrors: NetworkError[];
  suspiciousPatterns: string[];
  domSnapshot: string;
  bundleUrls: string[];
  interactiveElements: string[];
  timestamp: string;
};

export type UserClarification = {
  question: string;
  answer: string;
  timestamp: string;
};

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

export type InvestigationReport = {
  summary: string;
  rootCause: string;
  codeLocation: SourceMapResolution | null;
  dataFlow: string;
  suggestedFix: CodeAnalysis['suggestedFix'];
  reproSteps: string[];
  evidence: Evidence[];
  hypotheses: Hypothesis[];
  severity: ReportSeverity;
  cannotDetermine: boolean;
  assumptions: string[];
  timestamp: string;
  url: string;
  durationMs: number;
};
