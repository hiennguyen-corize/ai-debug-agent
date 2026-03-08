import type { ReportSeverity } from '@ai-debug/shared';

export type SourceMapCall = (tool: string, args: Record<string, unknown>) => Promise<unknown>;

export type FinishResult = {
  summary: string;
  rootCause: string;
  severity: ReportSeverity;
  stepsToReproduce: string[];
  evidence: {
    consoleErrors: string[];
    networkErrors: string[];
  };
  suggestedFix?: string | undefined;
  codeLocation?: { file: string; line: number; column?: number | undefined; snippet?: string | undefined } | undefined;
  networkFindings?: string[] | undefined;
  timeline?: string[] | undefined;
  hypotheses?: { id: string; text: string; status: string }[] | undefined;
  conclusion?: string | undefined;
};
