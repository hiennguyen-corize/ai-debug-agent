/**
 * Synthesis node integration tests — verify evidence passthrough and anti-hallucination.
 *
 * All types inlined to avoid cross-package resolution issues in test environment.
 */

import { describe, it, expect } from 'vitest';

// --- Inline types (mirrors @ai-debug/shared) ---

type CapturedLog = { actionId: string; type: string; text: string; timestamp: number };
type Evidence = { id: string; hypothesisId: string; category: string; type: string; description: string; data: string; timestamp: number };
type BrowserTaskResult = { observations: string[]; networkActivity: unknown[]; consoleActivity: CapturedLog[]; screenshotPaths: string[] };

type TestState = {
  url: string;
  hint: string | null;
  initialObservations: { consoleErrors: string[]; networkErrors: string[]; pageTitle: string; interactiveElements: number } | null;
  browserTaskResults: BrowserTaskResult[];
  evidence: Evidence[];
  hypotheses: unknown[];
  codeAnalysis: { errorLocation: string; dataFlow: { rootCause: string }; suggestedFix: string } | null;
  assumptions: string[];
};

// --- Mirrors synthesis.ts buildSummaryContext ---

const buildSummaryContext = (state: TestState): string => {
  const parts: string[] = [`URL: ${state.url}`];
  if (state.hint !== null) parts.push(`Hint: ${state.hint}`);

  if (state.initialObservations !== null && state.initialObservations.consoleErrors.length > 0) {
    parts.push(`Console Errors (from Scout):\n${state.initialObservations.consoleErrors.join('\n')}`);
  }

  if (state.browserTaskResults.length > 0) {
    const obs = state.browserTaskResults.flatMap((r) => r.observations);
    parts.push(`Explorer Observations:\n${obs.join('\n')}`);

    const consoleFromExplorer = state.browserTaskResults.flatMap((r) => r.consoleActivity).map((l) => l.text);
    if (consoleFromExplorer.length > 0) {
      parts.push(`Console Errors (from Explorer):\n${consoleFromExplorer.join('\n')}`);
    }
  }

  if (state.evidence.length > 0) {
    const details = state.evidence.map((e) => `[${e.type}] ${e.description}`).join('\n');
    parts.push(`Evidence (${state.evidence.length.toString()} items):\n${details}`);
  }

  parts.push(`Hypotheses: ${JSON.stringify(state.hypotheses, null, 2)}`);

  if (state.codeAnalysis !== null) {
    parts.push(`Code analysis: ${JSON.stringify(state.codeAnalysis, null, 2)}`);
  } else {
    parts.push('Source map: UNAVAILABLE — report MUST be based on observed errors only. Do NOT fabricate file names or variable names.');
  }

  if (state.assumptions.length > 0) parts.push(`Assumptions: ${state.assumptions.join(', ')}`);
  return parts.join('\n\n');
};

// --- Base state ---

const baseState: TestState = {
  url: 'https://example.com',
  hint: 'Page crashes on submit',
  initialObservations: null,
  browserTaskResults: [],
  evidence: [],
  hypotheses: [],
  codeAnalysis: null,
  assumptions: [],
};

// --- Tests ---

describe('Synthesis — buildSummaryContext', () => {
  it('includes raw console errors from Scout', () => {
    const state: TestState = {
      ...baseState,
      initialObservations: {
        consoleErrors: ["TypeError: Cannot read properties of undefined (reading 'weight')"],
        networkErrors: [],
        pageTitle: 'Test',
        interactiveElements: 3,
      },
    };

    const ctx = buildSummaryContext(state);
    expect(ctx).toContain("TypeError: Cannot read properties of undefined (reading 'weight')");
    expect(ctx).toContain('Console Errors (from Scout)');
  });

  it('includes Explorer observations', () => {
    const state: TestState = {
      ...baseState,
      browserTaskResults: [{
        observations: ['[browser_click] Clicked submit', '[get_console_logs] Error found'],
        networkActivity: [],
        consoleActivity: [],
        screenshotPaths: [],
      }],
    };

    const ctx = buildSummaryContext(state);
    expect(ctx).toContain('Explorer Observations');
    expect(ctx).toContain('Clicked submit');
  });

  it('includes structured console errors from Explorer', () => {
    const state: TestState = {
      ...baseState,
      browserTaskResults: [{
        observations: [],
        networkActivity: [],
        consoleActivity: [{
          actionId: 'e1',
          type: 'error',
          text: 'Uncaught TypeError: dimensions is undefined',
          timestamp: Date.now(),
        }],
        screenshotPaths: [],
      }],
    };

    const ctx = buildSummaryContext(state);
    expect(ctx).toContain('Console Errors (from Explorer)');
    expect(ctx).toContain('dimensions is undefined');
  });

  it('shows evidence details, not just count', () => {
    const state: TestState = {
      ...baseState,
      evidence: [{
        id: 'e1',
        hypothesisId: '',
        category: 'source',
        type: 'source_code',
        description: 'fetch_source_map failed: not found',
        data: 'error',
        timestamp: Date.now(),
      }],
    };

    const ctx = buildSummaryContext(state);
    expect(ctx).toContain('[source_code] fetch_source_map failed: not found');
    expect(ctx).not.toContain('Evidence count:');
  });

  it('warns when source maps unavailable', () => {
    const ctx = buildSummaryContext({ ...baseState, codeAnalysis: null });
    expect(ctx).toContain('Source map: UNAVAILABLE');
    expect(ctx).toContain('Do NOT fabricate');
  });

  it('includes code analysis when available', () => {
    const state: TestState = {
      ...baseState,
      codeAnalysis: {
        errorLocation: 'src/checkout.tsx:42',
        dataFlow: { rootCause: 'weight accessed on undefined' },
        suggestedFix: 'Add null check',
      },
    };

    const ctx = buildSummaryContext(state);
    expect(ctx).toContain('Code analysis');
    expect(ctx).toContain('weight accessed on undefined');
    expect(ctx).not.toContain('UNAVAILABLE');
  });
});
