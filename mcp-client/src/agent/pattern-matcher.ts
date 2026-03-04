/**
 * Pattern Matcher — matches observed signals to bug patterns.
 * Used by Scout node to seed initial hypotheses.
 */

import { BUG_PATTERNS, type BugPattern } from '@ai-debug/shared';

export type PatternSignals = {
  consoleErrors: string[];
  networkErrors: string[];
  domObservations: string[];
};

export type PatternMatch = {
  pattern: BugPattern;
  confidence: number;
  matchedSignals: string[];
};

const normalizeText = (text: string): string => text.toLowerCase().trim();

const findMatchingSignals = (observed: string[], patternSignals: string[]): string[] =>
  patternSignals.filter((signal) => {
    const normalized = normalizeText(signal);
    return observed.some((obs) => normalizeText(obs).includes(normalized));
  });

const scoreMatch = (matchedCount: number, totalSignals: number): number =>
  totalSignals === 0 ? 0 : matchedCount / totalSignals;

const flattenObservations = (signals: PatternSignals): string[] => [
  ...signals.consoleErrors,
  ...signals.networkErrors,
  ...signals.domObservations,
];

export const matchPatterns = (signals: PatternSignals): PatternMatch[] => {
  const allObservations = flattenObservations(signals);
  if (allObservations.length === 0) return [];

  return BUG_PATTERNS
    .map((pattern) => {
      const matchedSignals = findMatchingSignals(allObservations, pattern.signals);
      return {
        pattern,
        confidence: scoreMatch(matchedSignals.length, pattern.signals.length),
        matchedSignals,
      };
    })
    .filter((m) => m.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence);
};
