import { describe, it, expect } from 'vitest';
import { matchPatterns, type PatternSignals } from '../../mcp-client/src/agent/pattern-matcher.js';

describe('pattern-matcher', () => {
  it('returns empty array for empty signals', () => {
    const signals: PatternSignals = { consoleErrors: [], networkErrors: [], domObservations: [] };
    expect(matchPatterns(signals)).toEqual([]);
  });

  it('matches api-error pattern for network 4xx signals', () => {
    const signals: PatternSignals = {
      consoleErrors: [],
      networkErrors: ['network 4xx', 'response error message'],
      domObservations: [],
    };
    const matches = matchPatterns(signals);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].pattern.id).toBe('api-error');
    expect(matches[0].confidence).toBeGreaterThan(0);
  });

  it('matches js-exception pattern for TypeError signals', () => {
    const signals: PatternSignals = {
      consoleErrors: ['TypeError', 'Cannot read property'],
      networkErrors: [],
      domObservations: [],
    };
    const matches = matchPatterns(signals);
    const jsException = matches.find((m) => m.pattern.id === 'js-exception');
    expect(jsException).toBeDefined();
    expect(jsException?.confidence).toBeGreaterThan(0);
  });

  it('ranks matches by confidence descending', () => {
    const signals: PatternSignals = {
      consoleErrors: ['TypeError'],
      networkErrors: ['network 4xx'],
      domObservations: [],
    };
    const matches = matchPatterns(signals);
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i - 1].confidence).toBeGreaterThanOrEqual(matches[i].confidence);
    }
  });

  it('includes matched signals in result', () => {
    const signals: PatternSignals = {
      consoleErrors: [],
      networkErrors: ['network 5xx'],
      domObservations: [],
    };
    const matches = matchPatterns(signals);
    const apiMatch = matches.find((m) => m.pattern.id === 'api-error');
    expect(apiMatch?.matchedSignals.length).toBeGreaterThan(0);
  });

  it('filters out patterns with zero matches', () => {
    const signals: PatternSignals = {
      consoleErrors: ['spinner persists'],
      networkErrors: [],
      domObservations: [],
    };
    const matches = matchPatterns(signals);
    expect(matches.every((m) => m.confidence > 0)).toBe(true);
  });
});
