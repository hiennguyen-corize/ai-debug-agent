import { describe, it, expect } from 'vitest';
import { stringifyResult } from '../../engine/src/agent/graph/helpers.js';

describe('stringifyResult', () => {
  it('returns string input as-is', () => {
    expect(stringifyResult('hello')).toBe('hello');
  });

  it('extracts text from single-item MCP content array', () => {
    const content = [{ type: 'text', text: '### Result\nTotal messages: 3' }];
    expect(stringifyResult(content)).toBe('### Result\nTotal messages: 3');
  });

  it('concatenates multiple text items', () => {
    const content = [
      { type: 'text', text: '### Page\n- URL: /cart' },
      { type: 'text', text: '### Snapshot\n- heading "Cart"' },
    ];
    const result = stringifyResult(content);
    expect(result).toContain('### Page');
    expect(result).toContain('### Snapshot');
  });

  it('extracts resource text — Playwright MCP file-referenced content', () => {
    const content = [
      { type: 'text', text: '### Result\n- [Console](console3.txt)' },
      { type: 'resource', resource: { uri: 'console3.txt', mimeType: 'text/plain', text: 'TypeError: f.value.toFixed is not a function\n    at O (index.js:43:87796)' } },
    ];
    const result = stringifyResult(content);
    expect(result).toContain('TypeError: f.value.toFixed is not a function');
    expect(result).toContain('at O (index.js:43:87796)');
  });

  it('handles multiple resources (snapshot + console)', () => {
    const content = [
      { type: 'text', text: '### Page\n- URL: /cart\n### Snapshot\n- [Snapshot](snap.txt)' },
      { type: 'resource', resource: { uri: 'snap.txt', text: '- heading "Shopping Cart"\n- button "Apply"' } },
      { type: 'resource', resource: { uri: 'console.txt', text: 'TypeError: x is not defined' } },
    ];
    const result = stringifyResult(content);
    expect(result).toContain('heading "Shopping Cart"');
    expect(result).toContain('TypeError: x is not defined');
  });

  it('handles image content gracefully', () => {
    const content = [
      { type: 'text', text: '### Screenshot' },
      { type: 'image', data: 'base64data...', mimeType: 'image/png' },
    ];
    const result = stringifyResult(content);
    expect(result).toContain('### Screenshot');
    expect(result).toContain('[screenshot captured]');
    expect(result).not.toContain('base64data');
  });

  it('handles binary resource with blob', () => {
    const content = [
      { type: 'resource', resource: { uri: 'screenshot.png', blob: 'base64...' } },
    ];
    const result = stringifyResult(content);
    expect(result).toContain('[binary: screenshot.png]');
  });

  it('falls back to JSON for non-array non-string input', () => {
    expect(stringifyResult({ foo: 'bar' })).toBe('{\n  "foo": "bar"\n}');
  });

  it('falls back to JSON for empty array', () => {
    expect(stringifyResult([])).toBe('[]');
  });

  it('falls back to JSON for array without recognized types', () => {
    const content = [{ unknown: true }];
    expect(stringifyResult(content)).toBe('[\n  {\n    "unknown": true\n  }\n]');
  });

  it('skips null/undefined items in array', () => {
    const content = [
      null,
      { type: 'text', text: 'valid' },
      undefined,
    ];
    expect(stringifyResult(content)).toBe('valid');
  });

  it('handles resource without text (missing text field)', () => {
    const content = [
      { type: 'resource', resource: { uri: 'empty.txt' } },
    ];
    const result = stringifyResult(content);
    // Falls through to JSON since no text parts extracted
    expect(result).toContain('empty.txt');
  });
});
