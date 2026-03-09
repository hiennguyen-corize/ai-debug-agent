/**
 * Report builder — converts FinishResult to InvestigationReport DTO.
 */

import type { InvestigationReport } from '@ai-debug/shared';
import type { FinishResult } from '#agent/definitions/types.js';

export const buildReport = (result: FinishResult, url: string, startTime: number): InvestigationReport => ({
  summary: result.summary,
  rootCause: result.rootCause,
  severity: result.severity,
  reproSteps: result.stepsToReproduce,
  evidence: [
    ...result.evidence.consoleErrors.map((e) => ({
      type: 'console_error' as const,
      description: e,
      data: e,
    })),
    ...result.evidence.networkErrors.map((e) => ({
      type: 'network_error' as const,
      description: e,
      data: e,
    })),
    ...(result.networkFindings ?? []).map((f) => ({
      type: 'network_finding' as const,
      description: f,
      data: f,
    })),
  ],
  suggestedFix: result.suggestedFix !== undefined ? {
    file: 'unknown',
    line: 0,
    before: '',
    after: '',
    explanation: result.suggestedFix,
  } : null,
  codeLocation: result.codeLocation ?? null,
  networkFindings: result.networkFindings ?? [],
  timeline: result.timeline ?? [],
  dataFlow: '',
  hypotheses: (result.hypotheses ?? []).map(h => ({
    id: h.id,
    text: h.text,
    status: h.status as 'confirmed' | 'rejected' | 'plausible' | 'untested',
  })),
  conclusion: result.conclusion ?? '',
  cannotDetermine: false,
  assumptions: [],
  timestamp: new Date().toISOString(),
  url,
  durationMs: Date.now() - startTime,
});
