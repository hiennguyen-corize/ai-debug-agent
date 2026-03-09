/**
 * Normalize LLM finish_investigation output into FinishResult.
 * Handles various shapes the LLM might produce.
 */

import type { FinishResult } from '#agent/definitions/types.js';
import { REPORT_SEVERITY, type ReportSeverity } from '@ai-debug/shared';

const VALID_SEVERITIES = new Set<string>(Object.values(REPORT_SEVERITY));

const asSeverity = (v: unknown): ReportSeverity =>
  typeof v === 'string' && VALID_SEVERITIES.has(v)
    ? v as ReportSeverity
    : REPORT_SEVERITY.MEDIUM;

const asString = (v: unknown, fallback: string): string =>
  typeof v === 'string' ? v : fallback;

const extractEvidence = (raw: unknown, args: Record<string, unknown>): { consoleErrors: string[]; networkErrors: string[] } => {
  let consoleErrors: string[] = [];
  let networkErrors: string[] = [];

  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    const ev = raw as Record<string, unknown>;
    consoleErrors = Array.isArray(ev['consoleErrors']) ? (ev['consoleErrors'] as string[]) : [];
    networkErrors = Array.isArray(ev['networkErrors']) ? (ev['networkErrors'] as string[]) : [];
  } else if (typeof raw === 'string' && raw.trim().length > 2) {
    consoleErrors = raw.split('\n').filter((l) => (/error|typeerror|referenceerror|uncaught/i).test(l));
  } else if (Array.isArray(raw)) {
    consoleErrors = raw.map((e) => String(e));
  }

  if (consoleErrors.length === 0 && Array.isArray(args['consoleErrors'])) {
    consoleErrors = args['consoleErrors'] as string[];
  }
  if (networkErrors.length === 0 && Array.isArray(args['networkErrors'])) {
    networkErrors = args['networkErrors'] as string[];
  }

  return { consoleErrors, networkErrors };
};

const normalizeSuggestedFix = (raw: unknown): string | undefined => {
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>;
    if (typeof obj['explanation'] === 'string') return obj['explanation'];
    return JSON.stringify(raw);
  }
  return undefined;
};

const normalizeCodeLocation = (raw: unknown): FinishResult['codeLocation'] => {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const obj = raw as Record<string, unknown>;
  const file = typeof obj['file'] === 'string' ? obj['file'] : undefined;
  const line = typeof obj['line'] === 'number' ? obj['line'] : undefined;
  if (file === undefined || line === undefined) return undefined;
  return {
    file,
    line,
    column: typeof obj['column'] === 'number' ? obj['column'] : undefined,
    snippet: typeof obj['snippet'] === 'string' ? obj['snippet'] : undefined,
  };
};

export const normalizeFinishResult = (args: Record<string, unknown>): FinishResult => ({
  summary: asString(args['summary'], 'No summary provided'),
  rootCause: asString(args['rootCause'], 'Unknown'),
  severity: asSeverity(args['severity']),
  stepsToReproduce: (args['stepsToReproduce'] as string[] | undefined) ?? [],
  evidence: extractEvidence(args['evidence'], args),
  suggestedFix: normalizeSuggestedFix(args['suggestedFix']),
  codeLocation: normalizeCodeLocation(args['codeLocation']),
  networkFindings: Array.isArray(args['networkFindings']) ? (args['networkFindings'] as string[]) : undefined,
  timeline: Array.isArray(args['timeline']) ? (args['timeline'] as string[]) : undefined,
  hypotheses: Array.isArray(args['hypotheses'])
    ? (args['hypotheses'] as { id: string; text: string; status: string }[])
    : undefined,
  conclusion: typeof args['conclusion'] === 'string' ? args['conclusion'] : undefined,
});
