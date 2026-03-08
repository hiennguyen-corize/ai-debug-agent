/**
 * Source map resolver — resolves minified location to original.
 *
 * Uses function-level extraction instead of fixed ±N lines.
 */

import type { SourceMapConsumer } from 'source-map';
import type { ResolvedLocation } from './types.js';
import { createConsumer } from './consumer.js';

const SURROUNDING_LINES = 7;
const MAX_FUNCTION_LINES = 50;

/**
 * Extract the enclosing function body around targetLine using brace matching.
 * Falls back to ±SURROUNDING_LINES if function is too large or detection fails.
 */
const FUNCTION_START_PATTERN = /^\s*(export\s+)?(async\s+)?(function\b|const\s+\w+\s*=|let\s+\w+\s*=|var\s+\w+\s*=|\w+\s*\()/;

const findFunctionStart = (lines: string[], fromIdx: number): number => {
  let braceDepth = 0;
  for (let i = fromIdx; i >= 0; i--) {
    const line = lines[i] ?? '';
    braceDepth += (line.match(/\}/g) ?? []).length;
    braceDepth -= (line.match(/\{/g) ?? []).length;
    if (braceDepth <= 0 && FUNCTION_START_PATTERN.test(line)) return i;
    if (i === 0) return 0;
  }
  return 0;
};

const findFunctionEnd = (lines: string[], fromIdx: number): number => {
  let braceDepth = 0;
  for (let i = fromIdx; i < lines.length; i++) {
    const line = lines[i] ?? '';
    braceDepth += (line.match(/\{/g) ?? []).length;
    braceDepth -= (line.match(/\}/g) ?? []).length;
    if (braceDepth <= 0 && i > fromIdx) return i;
    if (i === lines.length - 1) return i;
  }
  return fromIdx;
};

const extractFunctionBody = (content: string, targetLine: number): string => {
  const lines = content.split('\n');
  const idx = targetLine - 1;
  if (idx < 0 || idx >= lines.length) return '';

  let start = findFunctionStart(lines, idx);
  let end = findFunctionEnd(lines, start);

  if (end - start + 1 > MAX_FUNCTION_LINES) {
    start = Math.max(0, idx - SURROUNDING_LINES);
    end = Math.min(lines.length - 1, idx + SURROUNDING_LINES);
  }

  return lines.slice(start, end + 1).join('\n');
};

const extractCode = (
  consumer: SourceMapConsumer,
  file: string,
  line: number,
): string => {
  const content = consumer.sourceContentFor(file);
  if (content === null) return '';

  const body = extractFunctionBody(content, line);
  if (body !== '') return body;

  // Final fallback: ±SURROUNDING_LINES
  const lines = content.split('\n');
  const start = Math.max(0, line - SURROUNDING_LINES - 1);
  const end = Math.min(lines.length, line + SURROUNDING_LINES);
  return lines.slice(start, end).join('\n');
};

export const resolveLocation = async (
  rawMap: unknown,
  line: number,
  column: number,
): Promise<ResolvedLocation | null> => {
  const consumer = await createConsumer(rawMap);
  try {
    const pos = consumer.originalPositionFor({ line, column });
    if (pos.source === null || pos.line === null) return null;
    return {
      originalFile: pos.source,
      originalLine: pos.line,
      originalColumn: pos.column ?? 0,
      surroundingCode: extractCode(consumer, pos.source, pos.line),
      functionName: pos.name ?? null,
    };
  } finally {
    consumer.destroy();
  }
};
