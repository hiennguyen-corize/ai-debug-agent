/**
 * Shared tool utilities — DRY error handling.
 */

const textContent = (text: string): [{ type: 'text'; text: string }] => [{ type: 'text', text }];

export const toolSuccess = (data: unknown): { content: [{ type: 'text'; text: string }] } => ({
  content: textContent(JSON.stringify(data, null, 2)),
});

export const toolError = (err: unknown): { content: [{ type: 'text'; text: string }]; isError: true } => ({
  content: textContent(`Error: ${err instanceof Error ? err.message : String(err)}`),
  isError: true,
});
