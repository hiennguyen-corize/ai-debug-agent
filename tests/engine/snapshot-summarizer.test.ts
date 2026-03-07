import { describe, it, expect } from 'vitest';
import { extractErrorSignature, summarizeToolResult } from '../../engine/src/agent/loop/snapshot-summarizer.js';

describe('extractErrorSignature', () => {
  it('normalizes quoted property names', () => {
    const input = "TypeError: Cannot read properties of null (reading 'percentage')";
    const sig = extractErrorSignature(input);
    expect(sig).toBe("TypeError: Cannot read properties of null (reading '*')");
  });

  it('normalizes different property names to same signature', () => {
    const a = extractErrorSignature("TypeError: Cannot read properties of null (reading 'percentage')");
    const b = extractErrorSignature("TypeError: Cannot read properties of null (reading 'discount')");
    expect(a).toBe(b);
  });

  it('normalizes URLs', () => {
    const input = 'Failed to fetch https://api.example.com/data?id=123';
    const sig = extractErrorSignature(input);
    expect(sig).toBe('Failed to fetch *');
  });

  it('normalizes different URLs to same signature', () => {
    const a = extractErrorSignature('Failed to fetch https://api.example.com/users');
    const b = extractErrorSignature('Failed to fetch https://other.domain.io/orders');
    expect(a).toBe(b);
  });

  it('normalizes long numeric IDs', () => {
    const input = 'Error processing order 123456';
    const sig = extractErrorSignature(input);
    expect(sig).toBe('Error processing order *');
  });

  it('normalizes hex hashes (8+ chars)', () => {
    const input = 'Error in app-abc12345.js:42:15';
    const sig = extractErrorSignature(input);
    expect(sig).toContain('*');
  });

  it('preserves short strings unchanged', () => {
    const input = 'ReferenceError: foo is not defined';
    const sig = extractErrorSignature(input);
    expect(sig).toBe('ReferenceError: foo is not defined');
  });
});

describe('summarizeToolResult (console error clustering)', () => {
  // summarizeToolResult routes to clustering when text contains 'console.' prefix
  it('clusters identical errors', () => {
    const input = [
      'console.error TypeError: Cannot read properties of null',
      'console.error TypeError: Cannot read properties of null',
      'console.error TypeError: Cannot read properties of null',
      'console.error TypeError: Cannot read properties of null',
    ].join('\n');

    const result = summarizeToolResult(input);
    expect(result).toContain('[×4]');
    expect(result).toContain('TypeError: Cannot read properties of null');
    // Should only appear once (clustered)
    const matches = result.match(/TypeError: Cannot read properties of null/g);
    expect(matches).toHaveLength(1);
  });

  it('clusters errors with different property names', () => {
    const input = [
      "console.error TypeError: Cannot read properties of null (reading 'percentage')",
      "console.error TypeError: Cannot read properties of null (reading 'discount')",
      "console.error TypeError: Cannot read properties of null (reading 'total')",
    ].join('\n');

    const result = summarizeToolResult(input);
    expect(result).toContain('[×3]');
  });

  it('keeps different error types as separate clusters', () => {
    const input = [
      'console.error TypeError: foo is not a function',
      'console.error ReferenceError: bar is not defined',
    ].join('\n');

    const result = summarizeToolResult(input);
    expect(result).toContain('TypeError: foo is not a function');
    expect(result).toContain('ReferenceError: bar is not defined');
    expect(result).not.toContain('[×');
  });

  it('truncates long stack traces', () => {
    const lines = [
      'console.error TypeError: test',
      '  at func1 (file.js:1:1)',
      '  at func2 (file.js:2:1)',
      '  at func3 (file.js:3:1)',
      '  at func4 (file.js:4:1)',
      '  at func5 (file.js:5:1)',
      '  at func6 (file.js:6:1)',
      '  at func7 (file.js:7:1)',
    ];

    const result = summarizeToolResult(lines.join('\n'));
    expect(result).toContain('func1');
    expect(result).toContain('…(stack truncated)');
    expect(result).not.toContain('func7');
  });

  it('passes through non-error console text', () => {
    const input = 'Console messages:\nSome log message\n[info] App started';
    const result = summarizeToolResult(input);
    expect(result).toContain('Some log message');
  });

  it('handles empty input', () => {
    const result = summarizeToolResult('');
    expect(result).toBe('');
  });
});
