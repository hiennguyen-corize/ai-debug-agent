/**
 * Source file reader — reads source content from source map or filesystem.
 */

import { readFile } from 'node:fs/promises';
import type { SourceMapConsumer } from 'source-map';
import { createConsumer } from './consumer.js';

const sliceLines = (fullContent: string, lineFrom: number, lineTo: number): { content: string; totalLines: number } => {
  const lines = fullContent.split('\n');
  const start = Math.max(0, lineFrom - 1);
  const end = Math.min(lines.length, lineTo);
  return { content: lines.slice(start, end).join('\n'), totalLines: lines.length };
};

const readFromConsumer = (consumer: SourceMapConsumer, filePath: string): string | null =>
  consumer.sourceContentFor(filePath);

export const readSourceFromMap = async (
  rawMap: unknown,
  filePath: string,
  lineFrom: number,
  lineTo: number,
): Promise<{ content: string; totalLines: number } | null> => {
  const consumer = await createConsumer(rawMap);
  try {
    const fullContent = readFromConsumer(consumer, filePath);
    if (fullContent === null) return null;
    return sliceLines(fullContent, lineFrom, lineTo);
  } finally {
    consumer.destroy();
  }
};

export const readSourceFromFile = async (
  filePath: string,
  lineFrom: number,
  lineTo: number,
): Promise<{ content: string; totalLines: number } | null> => {
  try {
    const fullContent = await readFile(filePath, 'utf-8');
    return sliceLines(fullContent, lineFrom, lineTo);
  } catch { return null; }
};
