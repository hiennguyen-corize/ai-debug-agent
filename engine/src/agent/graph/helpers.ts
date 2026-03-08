/**
 * Graph helpers — pure utility functions for the investigation graph.
 *
 * Concerns: config access, serialization, action tracking,
 * context compression, budget injection.
 */

import { HumanMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { TriedAction, InvestigationConfigurable } from '#graph/state.js';
import {
  MAX_STALL_COUNT,
  CIRCULAR_DETECTION_WINDOW,
  MIN_ACTIONS_FOR_PATTERN,
  MIN_PATTERN_LEN,
  MAX_PATTERN_LEN,
  CIRCULAR_RATIO_THRESHOLD,
  MAX_NETWORK_LINES,
  MAX_CONSOLE_LINES,
  MAX_CONTENT_LEN,
  TRUNCATE_PREVIEW_LEN,
  MIN_COMPRESS_LENGTH,
  MAX_FAILED_DISPLAY,
} from '#graph/constants.js';

// ── Config Access ────────────────────────────────────────────────────────

export const getConfigurable = (config: RunnableConfig): InvestigationConfigurable =>
  config.configurable as InvestigationConfigurable;

// ── Serialization ────────────────────────────────────────────────────────

export const stringifyResult = (raw: unknown): string => {
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) {
    const parts: string[] = [];
    for (const item of raw) {
      if (typeof item !== 'object' || item === null) continue;
      const obj = item as Record<string, unknown>;

      if (obj['type'] === 'text' && typeof obj['text'] === 'string') {
        parts.push(obj['text']);
      }

      // Resource content — Playwright MCP stores large outputs (console, snapshot, network) here
      if (obj['type'] === 'resource' && typeof obj['resource'] === 'object' && obj['resource'] !== null) {
        const res = obj['resource'] as Record<string, unknown>;
        if (typeof res['text'] === 'string') parts.push(res['text']);
        else if (typeof res['blob'] === 'string') parts.push(`[binary: ${typeof res['uri'] === 'string' ? res['uri'] : 'data'}]`);
      }

      // Image content — note existence without dumping binary
      if (obj['type'] === 'image') {
        parts.push('[screenshot captured]');
      }
    }
    if (parts.length > 0) return parts.join('\n');
  }
  try { return JSON.stringify(raw, null, 2); } catch { return String(raw); }
};

// ── Action Tracking ──────────────────────────────────────────────────────

export const extractArgsKey = (args: Record<string, unknown>): string =>
  Object.keys(args).sort().map((k) => `${k}=${JSON.stringify(args[k])}`).join('&');

export const extractSig = (toolName: string, args: Record<string, unknown>): string => {
  const key = (args['url'] ?? args['bundleUrl'] ?? args['selector'] ?? toolName) as string;
  return `${toolName}:${key}`;
};

export const getConsecutiveSigFailures = (triedActions: TriedAction[], sig: string): number => {
  let count = 0;
  for (let i = triedActions.length - 1; i >= 0; i--) {
    const a = triedActions[i];
    if (a?.sig !== sig) break;
    if (!a.success) count++;
    else break;
  }
  return count;
};

export const detectCircularPattern = (triedActions: TriedAction[]): boolean => {
  const recent = triedActions.slice(-CIRCULAR_DETECTION_WINDOW);
  if (recent.length < MIN_ACTIONS_FOR_PATTERN) return false;

  const sigs = recent.map((a) => a.sig);
  const uniqueRatio = new Set(sigs).size / sigs.length;

  for (let patternLen = MIN_PATTERN_LEN; patternLen <= MAX_PATTERN_LEN; patternLen++) {
    const tail = sigs.slice(-patternLen);
    const prev = sigs.slice(-patternLen * 2, -patternLen);
    if (prev.length === tail.length && prev.every((s, i) => s === tail[i])) return true;
  }

  return uniqueRatio < CIRCULAR_RATIO_THRESHOLD;
};

// ── Context Compression ──────────────────────────────────────────────────

const classifyContent = (content: string): string => {
  if (content.startsWith('```yaml')) return 'snapshot';
  if ((/\b(GET|POST|PUT|DELETE|PATCH)\b/).test(content) && (/\b\d{3}\b/).test(content)) return 'network';
  if ((/console|error|TypeError|ReferenceError/i).test(content)) return 'console';
  return 'other';
};

const compressOldResult = (content: string): string => {
  const type = classifyContent(content);
  const lines = content.split('\n');
  if (type === 'snapshot') return '[compressed: page snapshot — see recent snapshots for current state]';
  if (type === 'network' && lines.length > MAX_NETWORK_LINES) {
    return `[compressed: ${lines.length.toString()} network lines] ${lines.slice(0, 3).join(' | ')}`;
  }
  if (type === 'console' && lines.length > MAX_CONSOLE_LINES) {
    return `[compressed: ${lines.length.toString()} console lines] ${lines[0] ?? ''}`;
  }
  if (content.length > MAX_CONTENT_LEN) return `${content.slice(0, TRUNCATE_PREVIEW_LEN)}… [truncated ${content.length.toString()} chars]`;
  return content;
};

/**
 * Trim old tool results to reduce context window usage.
 * Mutates messages array IN-PLACE — intentional. Callers pass a spread copy
 * and the overwrite reducer replaces the entire array in state.
 */
export const trimOldToolResults = (messages: BaseMessage[], keepRecent: number): void => {
  let toolCount = 0;
  const toolIndices: number[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg instanceof ToolMessage) {
      toolCount++;
      if (toolCount > keepRecent) toolIndices.push(i);
    }
  }
  for (const idx of toolIndices) {
    const msg = messages[idx];
    if (msg instanceof ToolMessage && typeof msg.content === 'string' && msg.content.length > MIN_COMPRESS_LENGTH) {
      messages[idx] = new ToolMessage({
        content: compressOldResult(msg.content),
        tool_call_id: msg.tool_call_id,
      });
    }
  }
};

// ── Budget Injection ─────────────────────────────────────────────────────

/** Inject or replace <!--budget--> context message at position 1. */
export const injectBudgetMessage = (
  messages: BaseMessage[],
  promptTokens: number,
  contextWindow: number,
  triedActions: TriedAction[],
  stallCount: number,
): void => {
  const usagePct = contextWindow > 0 ? Math.round((promptTokens / contextWindow) * 100) : 0;
  const failedList = [...new Set(triedActions.filter((a) => !a.success).map((a) => a.sig))].slice(0, MAX_FAILED_DISPLAY);

  let text = `[Context: ${promptTokens.toString()}/${contextWindow.toString()} tokens (${usagePct.toString()}%)]`;
  if (failedList.length > 0) text += ` [Failed tools: ${failedList.join(', ')}]`;
  if (stallCount >= MAX_STALL_COUNT) text += ` [⚠ STALLED — finish immediately]`;

  const budgetMsg = new HumanMessage({ content: `<!--budget-->${text}` });
  const budgetIdx = messages.findIndex(
    (m) => typeof m.content === 'string' && m.content.startsWith('<!--budget-->'),
  );
  if (budgetIdx >= 0) messages[budgetIdx] = budgetMsg;
  else if (messages.length > 1) messages.splice(1, 0, budgetMsg);
};
