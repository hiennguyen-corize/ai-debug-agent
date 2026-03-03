/**
 * Source map resolver — resolves minified location to original.
 */

import type { SourceMapConsumer } from 'source-map';
import type { ResolvedLocation } from '../types/index.js';
import { createConsumer } from './consumer.js';

const SURROUNDING_LINES = 7;

const extractSurroundingCode = (
  consumer: SourceMapConsumer,
  file: string,
  line: number,
): string => {
  const content = consumer.sourceContentFor(file);
  if (content === null) return '';
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
      surroundingCode: extractSurroundingCode(consumer, pos.source, pos.line),
      functionName: pos.name ?? null,
    };
  } finally {
    consumer.destroy();
  }
};
