/**
 * Explorer evidence extraction tests.
 *
 * Tests the logic for extracting console errors and screenshot paths from tool results.
 * All types inlined to avoid cross-package resolution issues.
 */

import { describe, it, expect } from 'vitest';

// --- Inline types ---

type CapturedLog = { actionId: string; type: string; text: string; timestamp: number };

// --- Extracted logic (mirrors explorer.ts extraction) ---

const extractConsoleLogs = (
  toolName: string,
  result: unknown,
  iteration: number,
): CapturedLog[] => {
  if (toolName !== 'get_console_logs' || typeof result !== 'object' || result === null) return [];
  const logs = (result as { logs?: { type: string; text: string }[] }).logs ?? [];
  return logs
    .filter((l) => l.type === 'error')
    .map((l) => ({
      actionId: `explorer-${iteration.toString()}`,
      type: 'error',
      text: l.text,
      timestamp: Date.now(),
    }));
};

const extractScreenshot = (
  toolName: string,
  result: unknown,
): string | null => {
  if (toolName !== 'browser_screenshot' || typeof result !== 'object' || result === null) return null;
  const data = (result as { data?: string }).data;
  return data !== undefined ? data : null;
};

// --- Tests ---

describe('Explorer — evidence extraction', () => {
  describe('console log extraction', () => {
    it('extracts error logs from get_console_logs result', () => {
      const result = {
        logs: [
          { type: 'error', text: 'TypeError: Cannot read weight' },
          { type: 'log', text: 'App loaded' },
          { type: 'error', text: 'Uncaught ReferenceError: x is not defined' },
        ],
      };

      const logs = extractConsoleLogs('get_console_logs', result, 0);
      expect(logs).toHaveLength(2);
      expect(logs[0]?.text).toBe('TypeError: Cannot read weight');
      expect(logs[1]?.text).toBe('Uncaught ReferenceError: x is not defined');
      expect(logs[0]?.type).toBe('error');
    });

    it('returns empty for non-console tool calls', () => {
      expect(extractConsoleLogs('browser_click', {}, 0)).toEqual([]);
      expect(extractConsoleLogs('browser_navigate', {}, 0)).toEqual([]);
    });

    it('returns empty when no error logs', () => {
      const result = { logs: [{ type: 'log', text: 'info' }] };
      expect(extractConsoleLogs('get_console_logs', result, 0)).toEqual([]);
    });

    it('handles missing logs field gracefully', () => {
      expect(extractConsoleLogs('get_console_logs', {}, 0)).toEqual([]);
      expect(extractConsoleLogs('get_console_logs', null, 0)).toEqual([]);
    });
  });

  describe('screenshot capture', () => {
    it('extracts base64 data from screenshot result', () => {
      const result = { data: 'iVBORw0KGgoAAAA...' };
      expect(extractScreenshot('browser_screenshot', result)).toBe('iVBORw0KGgoAAAA...');
    });

    it('returns null for non-screenshot tools', () => {
      expect(extractScreenshot('browser_click', { data: 'x' })).toBeNull();
    });

    it('returns null when no data field', () => {
      expect(extractScreenshot('browser_screenshot', {})).toBeNull();
      expect(extractScreenshot('browser_screenshot', null)).toBeNull();
    });
  });
});
