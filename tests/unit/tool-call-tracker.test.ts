/**
 * ToolCallTracker unit tests — deduplication, caching, and limits.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ToolCallTracker } from '../../mcp-client/src/graph/nodes/tool-call-tracker.js';

describe('ToolCallTracker', () => {
  let tracker: ToolCallTracker;

  beforeEach(() => {
    tracker = new ToolCallTracker();
  });

  it('returns undefined on first call', () => {
    const result = tracker.getCached('fetch_source_map', { url: 'https://x.js' });
    expect(result).toBeUndefined();
  });

  it('returns cached result on second call', () => {
    tracker.store('fetch_source_map', { url: 'https://x.js' }, { error: 'not found' });
    const cached = tracker.getCached('fetch_source_map', { url: 'https://x.js' });
    expect(cached).toBeDefined();
    expect(cached?.result).toEqual({ error: 'not found' });
  });

  it('increments count on repeated calls', () => {
    tracker.store('fetch_source_map', { url: 'https://x.js' }, 'ok');
    const first = tracker.getCached('fetch_source_map', { url: 'https://x.js' });
    expect(first?.count).toBe(2);
    const second = tracker.getCached('fetch_source_map', { url: 'https://x.js' });
    expect(second?.count).toBe(3);
  });

  it('isOverLimit returns true at MAX_DUPLICATE_CALLS', () => {
    expect(tracker.isOverLimit(1)).toBe(false);
    expect(tracker.isOverLimit(2)).toBe(true);
    expect(tracker.isOverLimit(3)).toBe(true);
  });

  it('differentiates calls with different args', () => {
    tracker.store('fetch_source_map', { url: 'a.js' }, 'result-a');
    tracker.store('fetch_source_map', { url: 'b.js' }, 'result-b');
    const a = tracker.getCached('fetch_source_map', { url: 'a.js' });
    const b = tracker.getCached('fetch_source_map', { url: 'b.js' });
    expect(a?.result).toBe('result-a');
    expect(b?.result).toBe('result-b');
  });

  it('reset clears all cached results', () => {
    tracker.store('fetch_source_map', { url: 'a.js' }, 'result');
    tracker.reset();
    expect(tracker.getCached('fetch_source_map', { url: 'a.js' })).toBeUndefined();
  });
});
