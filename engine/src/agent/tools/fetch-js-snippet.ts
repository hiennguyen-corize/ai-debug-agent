/**
 * Fetch a snippet of JavaScript source around a specific line.
 * Used when source maps are unavailable — reads minified JS to give LLM context.
 */

const DEFAULT_CONTEXT_LINES = 10;
const MAX_LINE_LENGTH = 500;

type FetchJsSnippetArgs = {
  url: string;
  line: number;
  context?: number | undefined;
};

export const fetchJsSnippet = async (args: FetchJsSnippetArgs): Promise<string> => {
  const { url, line, context = DEFAULT_CONTEXT_LINES } = args;

  const res = await fetch(url);
  if (!res.ok) return `Failed to fetch ${url}: ${String(res.status)} ${res.statusText}`;

  const text = await res.text();
  const lines = text.split('\n');

  if (line < 1 || line > lines.length) {
    return `Line ${String(line)} out of range (file has ${String(lines.length)} lines)`;
  }

  const start = Math.max(0, line - 1 - context);
  const end = Math.min(lines.length, line + context);
  const snippet = lines.slice(start, end).map((l, i) => {
    const lineNum = start + i + 1;
    const marker = lineNum === line ? '>>>' : '   ';
    const truncated = l.length > MAX_LINE_LENGTH ? l.slice(0, MAX_LINE_LENGTH) + '…' : l;
    return `${marker} ${String(lineNum).padStart(6)}: ${truncated}`;
  });

  return `// ${url} (lines ${String(start + 1)}-${String(end)})\n${snippet.join('\n')}`;
};
