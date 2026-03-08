/**
 * Error clustering — deduplicates and summarizes console errors.
 */

const MAX_CONSOLE_ERRORS = 10;
const MAX_STACK_LINES = 5;

export const extractErrorSignature = (errorLine: string): string =>
  errorLine
    .replace(/\(reading '[\w.]+'\)/g, "(reading '*')")
    .replace(/https?:\/\/\S+/g, '*')
    .replace(/\b\d{3,}\b/g, '*')
    .replace(/[a-f0-9]{8,}/gi, '*')
    .replace(/\s+/g, ' ')
    .trim();

type ErrorCluster = {
  signature: string;
  firstOccurrence: string;
  count: number;
  index: number;
};

const clusterErrors = (errorEntries: string[]): ErrorCluster[] => {
  const clusters = new Map<string, ErrorCluster>();

  for (let i = 0; i < errorEntries.length; i++) {
    const entry = errorEntries[i];
    if (entry === undefined) continue;
    const firstLine = entry.split('\n')[0] ?? '';
    const signature = extractErrorSignature(firstLine);

    const existing = clusters.get(signature);
    if (existing !== undefined) {
      existing.count++;
    } else {
      clusters.set(signature, { signature, firstOccurrence: entry, count: 1, index: i });
    }
  }

  return [...clusters.values()].sort((a, b) => a.index - b.index);
};

export const summarizeConsoleErrors = (text: string): string => {
  const lines = text.split('\n');
  const errorEntries: string[] = [];
  const nonErrorLines: string[] = [];
  let currentError = '';
  let stackLineCount = 0;
  let inStack = false;

  for (const line of lines) {
    if ((/^\[?(error|warning|info)/i).test(line) || line.startsWith('console.')) {
      if (currentError !== '') errorEntries.push(currentError);
      currentError = line;
      stackLineCount = 0;
      inStack = false;
      continue;
    }

    if (line.trimStart().startsWith('at ') || line.trimStart().startsWith('Error:')) {
      inStack = true;
      stackLineCount++;
      if (stackLineCount <= MAX_STACK_LINES) {
        currentError += '\n' + line;
      } else if (stackLineCount === MAX_STACK_LINES + 1) {
        currentError += '\n  …(stack truncated)';
      }
      continue;
    }

    if (!inStack) {
      nonErrorLines.push(line);
    }
  }

  if (currentError !== '') errorEntries.push(currentError);

  const clusters = clusterErrors(errorEntries);

  for (let i = 0; i < clusters.length && i < MAX_CONSOLE_ERRORS; i++) {
    const cluster = clusters[i];
    if (cluster === undefined) continue;
    const prefix = cluster.count > 1 ? `[×${String(cluster.count)}] ` : '';
    nonErrorLines.push(prefix + cluster.firstOccurrence);
  }

  if (clusters.length > MAX_CONSOLE_ERRORS) {
    nonErrorLines.push(`…and ${String(clusters.length - MAX_CONSOLE_ERRORS)} more error clusters`);
  }

  return nonErrorLines.join('\n');
};
