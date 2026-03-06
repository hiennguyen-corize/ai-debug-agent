/**
 * Snapshot summarizer — filters Playwright accessibility tree YAML
 * to keep only interactive and meaningful elements.
 *
 * Reduces ~50K char snapshots to ~2-5K while preserving agent-actionable info.
 */

const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'input', 'combobox', 'checkbox', 'radio',
  'menuitem', 'tab', 'switch', 'slider', 'spinbutton', 'searchbox',
  'option', 'listbox', 'menu', 'dialog', 'alertdialog',
]);

const STRUCTURAL_ROLES = new Set([
  'heading', 'alert', 'status', 'banner', 'navigation', 'main',
  'form', 'table', 'row', 'cell', 'columnheader',
]);

const ERROR_KEYWORDS = /error|warning|fail|invalid|crash|exception|denied/i;

type SnapshotLine = {
  indent: number;
  raw: string;
  role: string;
  text: string;
  hasRef: boolean;
};

const parseLine = (raw: string): SnapshotLine => {
  const indent = raw.search(/\S/);
  const role = (/- (?:<changed> )?(\w+)/).exec(raw)?.[1] ?? '';
  const text = (/"([^"]+)"/).exec(raw)?.[1] ?? '';
  const hasRef = raw.includes('[ref=');
  return { indent: indent === -1 ? 0 : indent, raw: raw.trimEnd(), role, text, hasRef };
};

const isKeepLine = (line: SnapshotLine): boolean => {
  // Interactive elements — always keep
  if (INTERACTIVE_ROLES.has(line.role)) return true;
  // Structural landmarks — keep for context
  if (STRUCTURAL_ROLES.has(line.role)) return true;
  // Changed elements — important for diff
  if (line.raw.includes('<changed>')) return true;
  // Error-related text — critical for debugging
  if (ERROR_KEYWORDS.test(line.text)) return true;
  // URL/path lines — keep for navigation context
  if (line.raw.includes('/url:') || line.raw.includes('/href:')) return true;
  return false;
};

/**
 * Summarize a Playwright accessibility tree YAML snapshot.
 * Keeps interactive elements, headings, errors, and structural landmarks.
 * Falls back to truncation if input doesn't look like YAML snapshot.
 */
export const summarizeSnapshot = (yaml: string, maxChars = 6000): string => {
  const lines = yaml.split('\n');

  // Not a YAML snapshot — return truncated
  if (lines.length < 5 || !yaml.includes('[ref=')) {
    return yaml.length > maxChars
      ? yaml.slice(0, maxChars) + '\n…(truncated)'
      : yaml;
  }

  const kept: string[] = [];
  let parentKept = false;
  let parentIndent = -1;

  for (const raw of lines) {
    const line = parseLine(raw);

    if (isKeepLine(line)) {
      kept.push(line.raw);
      parentKept = true;
      parentIndent = line.indent;
      continue;
    }

    // Keep child properties of kept elements (1 level deep)
    if (parentKept && line.indent > parentIndent && line.raw.trimStart().startsWith('-')) {
      // Only keep short attribute lines, not nested subtrees
      if (line.raw.length < 80) {
        kept.push(line.raw);
        continue;
      }
    }

    // Reset parent tracking when we go back to same or lower indent
    if (line.indent <= parentIndent) {
      parentKept = false;
    }
  }

  if (kept.length === 0) {
    // Fallback: nothing matched, just truncate
    return yaml.length > maxChars
      ? yaml.slice(0, maxChars) + '\n…(truncated)'
      : yaml;
  }

  const result = kept.join('\n');
  const stats = `[snapshot: ${String(lines.length)} lines → ${String(kept.length)} interactive elements]`;

  if (result.length > maxChars) {
    return stats + '\n' + result.slice(0, maxChars) + '\n…(truncated)';
  }

  return stats + '\n' + result;
};

/**
 * Process a full Playwright tool result — summarize snapshot sections
 * and deduplicate console errors.
 */
export const summarizeToolResult = (text: string, maxChars = 8000): string => {
  // Handle console messages — deduplicate and truncate stacks
  if (text.includes('Console messages:') || text.includes('console.error')) {
    const summarized = summarizeConsoleErrors(text);
    return summarized.length > maxChars
      ? summarized.slice(0, maxChars) + '\n…(truncated)'
      : summarized;
  }

  // Split by markdown sections
  const sections = text.split(/(?=^### )/m);
  const output: string[] = [];

  for (const section of sections) {
    // Snapshot section — summarize the YAML
    if (section.includes('### Snapshot') || section.includes('```yaml') || section.includes('```accessibilitytree')) {
      const yamlMatch = (/```(?:yaml|accessibilitytree)\n([\s\S]*?)(?:```|$)/).exec(section);
      if (yamlMatch?.[1] !== undefined) {
        const summarized = summarizeSnapshot(yamlMatch[1]);
        output.push('### Snapshot (summarized)\n' + summarized);
        continue;
      }
    }
    // Non-snapshot sections — keep as-is
    output.push(section);
  }

  const result = output.join('\n');
  return result.length > maxChars
    ? result.slice(0, maxChars) + '\n…(truncated)'
    : result;
};

const MAX_CONSOLE_ERRORS = 10;
const MAX_STACK_LINES = 5;

/**
 * Deduplicate and truncate console errors/warnings.
 * Groups identical error messages, truncates stack traces.
 */
const summarizeConsoleErrors = (text: string): string => {
  const lines = text.split('\n');
  const errors = new Map<string, number>();
  const output: string[] = [];
  let currentError = '';
  let stackLineCount = 0;
  let inStack = false;

  for (const line of lines) {
    // New error line (starts with [error], [warning], console.error, etc.)
    if ((/^\[?(error|warning|info)/i).test(line) || line.startsWith('console.')) {
      // Flush previous error
      if (currentError !== '') {
        const count = errors.get(currentError) ?? 0;
        errors.set(currentError, count + 1);
      }
      currentError = line;
      stackLineCount = 0;
      inStack = false;
      continue;
    }

    // Stack trace line (starts with whitespace + "at ")
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

    // Non-error, non-stack line — keep as-is
    if (!inStack) {
      output.push(line);
    }
  }

  // Flush last error
  if (currentError !== '') {
    const count = errors.get(currentError) ?? 0;
    errors.set(currentError, count + 1);
  }

  // Build deduplicated error list
  let errorCount = 0;
  for (const [error, count] of errors) {
    if (errorCount >= MAX_CONSOLE_ERRORS) {
      output.push(`…and ${String(errors.size - MAX_CONSOLE_ERRORS)} more errors`);
      break;
    }
    const prefix = count > 1 ? `(×${String(count)}) ` : '';
    output.push(prefix + error);
    errorCount++;
  }

  return output.join('\n');
};

