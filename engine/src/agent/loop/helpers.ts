/**
 * Agent loop helpers — LLM retry, result parsing, smart context compression.
 */

import type OpenAI from 'openai';
import type { AgentLoopDeps } from '#agent/loop/types.js';
import { AGENT_NAME } from '@ai-debug/shared';

const LLM_MAX_RETRIES = 2;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const RETRYABLE_ERROR_PATTERNS = /timeout|econnreset|econnrefused|socket hang up|fetch failed/i;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });

const getStatusCode = (err: unknown): number | null => {
  if (typeof err !== 'object' || err === null) return null;
  if ('status' in err && typeof (err as { status: unknown }).status === 'number') {
    return (err as { status: number }).status;
  }
  return null;
};

export const callLLMWithRetry = async (
  deps: AgentLoopDeps,
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  tools: OpenAI.Chat.ChatCompletionTool[],
): Promise<OpenAI.Chat.ChatCompletion> => {
  for (let attempt = 0; attempt <= LLM_MAX_RETRIES; attempt++) {
    try {
      return await deps.llm.client.chat.completions.create({
        model: deps.llm.model,
        messages,
        tools,
      });
    } catch (err) {
      const statusCode = getStatusCode(err);
      const isRetryableStatus = statusCode !== null && RETRYABLE_STATUS_CODES.has(statusCode);
      const errorMsg = err instanceof Error ? err.message : String(err);
      const isRetryableError = RETRYABLE_ERROR_PATTERNS.test(errorMsg);

      if ((!isRetryableStatus && !isRetryableError) || attempt === LLM_MAX_RETRIES) throw err;

      const delayMs = 2000 * (attempt + 1);
      deps.eventBus.emit({
        type: 'error',
        agent: AGENT_NAME.AGENT,
        message: `LLM returned ${String(statusCode)}, retrying in ${String(delayMs / 1000)}s (attempt ${String(attempt + 1)}/${String(LLM_MAX_RETRIES)})...`,
      });
      await sleep(delayMs);
    }
  }
  throw new Error('LLM retry exhausted');
};

export const parseArgs = (raw: string): Record<string, unknown> => {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
};

/** Extract text from Playwright content arrays, otherwise stringify as-is. */
export const stringifyResult = (result: unknown): string => {
  if (typeof result === 'string') return result;
  if (Array.isArray(result)) {
    const texts = result
      .filter((item): item is { text: string } =>
        typeof item === 'object' && item !== null && 'text' in item && typeof (item as { text: unknown }).text === 'string')
      .map((item) => item.text);
    if (texts.length > 0) return texts.join('\n');
  }
  return JSON.stringify(result);
};

/**
 * Sliding window — replace old tool results with compressed summaries
 * to keep the messages array from growing unbounded.
 * Uses type-aware compression to preserve key signals.
 */
export const trimOldToolResults = (
  messages: { role: string; content?: string | null | undefined }[],
  windowSize: number,
): void => {
  let assistantCount = 0;
  for (const msg of messages) {
    if (msg.role === 'assistant') assistantCount++;
  }

  if (assistantCount <= windowSize) return;

  const trimBefore = assistantCount - windowSize;
  let seenAssistant = 0;

  for (const msg of messages) {
    if (msg.role === 'assistant') {
      seenAssistant++;
      if (seenAssistant > trimBefore) break;
    }

    if (msg.role === 'tool' && seenAssistant <= trimBefore) {
      const content = msg.content ?? '';
      if (content.length > 300) {
        msg.content = compressOldResult(content);
      }
    }
  }
};

/** Compress an old tool result to keep key signals while reducing size. */
export const compressOldResult = (content: string): string => {
  if (content.length <= 300) return content;

  const lines = content.split('\n');

  // Network results → keep status codes + URLs
  if (content.includes('HTTP/') || content.includes('Status:') || content.includes('status:')) {
    const kept = lines.filter(l =>
      (/status|url|error|failed|\d{3}/i).test(l),
    ).slice(0, 5);
    return kept.length > 0 ? kept.join('\n') + '\n…(compressed)' : content.slice(0, 200) + '\n…(compressed)';
  }

  // Console errors → already clustered, keep first 5 lines
  if (content.includes('console.') || content.includes('[error]') || content.includes('TypeError') || content.includes('Error:')) {
    return lines.slice(0, 5).join('\n') + '\n…(compressed)';
  }

  // Source code snippet → keep file:line + context lines
  if (content.includes('function ') || content.includes('const ') || content.includes('=>')) {
    return lines.slice(0, 6).join('\n') + '\n…(compressed)';
  }

  // Snapshot → keep summary line only
  if (content.includes('[snapshot:')) {
    return (lines[0] ?? content.slice(0, 200)) + '\n…(compressed)';
  }

  // Fallback
  return content.slice(0, 200) + '\n…(compressed)';
};
