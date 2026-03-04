/**
 * Import chain tracer — trace callers up the import chain.
 */

import type { BasicSourceMapConsumer, IndexedSourceMapConsumer } from 'source-map';
import type { ImportChainLink } from '#types/index.js';
import { createConsumer, getConsumerSources } from './consumer.js';

type ConcreteConsumer = BasicSourceMapConsumer | IndexedSourceMapConsumer;

const FILE_ROLE_PATTERN = {
  COMPONENT: /component|page|view|screen/i,
  SERVICE: /service|api|client/i,
  HOOK: /hook|use[A-Z]/i,
  STORE: /slice|store|reducer|state/i,
  UTIL: /util|helper|lib/i,
} as const;

const MAX_TRACE_DEPTH = 4;
const SNIPPET_HALF = 2;

const inferFileRole = (filePath: string): string => {
  if (FILE_ROLE_PATTERN.COMPONENT.test(filePath)) return 'component';
  if (FILE_ROLE_PATTERN.SERVICE.test(filePath)) return 'service';
  if (FILE_ROLE_PATTERN.HOOK.test(filePath)) return 'hook';
  if (FILE_ROLE_PATTERN.STORE.test(filePath)) return 'store';
  if (FILE_ROLE_PATTERN.UTIL.test(filePath)) return 'util';
  return 'unknown';
};

const extractSnippet = (consumer: ConcreteConsumer, file: string, line: number): string => {
  const content = consumer.sourceContentFor(file);
  if (content === null) return '';
  const lines = content.split('\n');
  const start = Math.max(0, line - SNIPPET_HALF - 1);
  const end = Math.min(lines.length, line + SNIPPET_HALF);
  return lines.slice(start, end).join('\n');
};

const findImportLine = (lines: string[], targetBasename: string): number => {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line !== undefined && line.includes(targetBasename) && /import|require|from/.test(line)) {
      return i + 1;
    }
  }
  return -1;
};

const findCallers = (
  targetFile: string,
  consumer: ConcreteConsumer,
  allSources: string[],
): { file: string; line: number }[] => {
  const targetBasename = targetFile.replace(/.*\//, '').replace(/\.\w+$/, '');
  const callers: { file: string; line: number }[] = [];

  for (const source of allSources) {
    if (source === targetFile) continue;
    const content = consumer.sourceContentFor(source);
    if (content?.includes(targetBasename) !== true) continue;

    const importLine = findImportLine(content.split('\n'), targetBasename);
    if (importLine > 0) callers.push({ file: source, line: importLine });
  }
  return callers;
};

const traceOneLevel = (
  currentFile: string,
  consumer: ConcreteConsumer,
  allSources: string[],
): ImportChainLink | null => {
  const callers = findCallers(currentFile, consumer, allSources);
  const caller = callers[0];
  if (caller === undefined) return null;
  return {
    file: caller.file,
    callerLine: caller.line,
    callerCode: extractSnippet(consumer, caller.file, caller.line),
    role: inferFileRole(caller.file),
  };
};

const buildChain = (
  errorFile: string,
  consumer: ConcreteConsumer,
  allSources: string[],
): ImportChainLink[] => {
  const chain: ImportChainLink[] = [];
  let currentFile = errorFile;
  for (let depth = 0; depth < MAX_TRACE_DEPTH; depth++) {
    const link = traceOneLevel(currentFile, consumer, allSources);
    if (link === null) break;
    chain.push(link);
    currentFile = link.file;
    if (link.role === 'component') break;
  }
  return chain;
};

export const traceImportChain = async (
  errorFile: string,
  rawMap: unknown,
): Promise<ImportChainLink[]> => {
  const consumer = await createConsumer(rawMap);
  try {
    return buildChain(errorFile, consumer, getConsumerSources(consumer));
  } finally {
    consumer.destroy();
  }
};

