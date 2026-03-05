/**
 * PromptUser factory — returns the right strategy based on context.
 *
 * Local CLI:               readline terminal input
 * Cloud + callbackUrl:     POST question → wait for answer (timeout 5m)
 * Cloud, no callbackUrl:   auto-assume
 * Autonomous mode:         auto-assume
 */

import type { InvestigationMode } from '@ai-debug/shared';
import * as readline from 'node:readline/promises';

const CALLBACK_TIMEOUT_MS = 300_000; // 5 minutes
const READLINE_TIMEOUT_MS = 300_000; // 5 minutes
const MAX_QUESTIONS_PER_INVESTIGATION = 3;

type PromptUserFn = (question: string) => Promise<string>;

type PromptUserConfig = {
  mode: InvestigationMode;
  callbackUrl?: string | undefined;
};

const autoAssume = (question: string): Promise<string> =>
  Promise.resolve(`[AUTO-ASSUMED] No user input available for: ${question}`);

const createCallbackPrompt = (callbackUrl: string): PromptUserFn =>
  async (question: string): Promise<string> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => { controller.abort(); }, CALLBACK_TIMEOUT_MS);

    try {
      const response = await fetch(callbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'question', question }),
        signal: controller.signal,
      });

      if (!response.ok) {
        return `[CALLBACK-FAILED] Status ${response.status.toString()} for: ${question}`;
      }

      const data = await response.json() as { answer?: string };
      return data.answer ?? `[NO-ANSWER] Callback returned no answer for: ${question}`;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return `[TIMEOUT] No response within 5 minutes for: ${question}`;
      }
      return `[CALLBACK-ERROR] ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      clearTimeout(timeout);
    }
  };

const createReadlinePrompt = (): PromptUserFn => {
  let questionCount = 0;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  return async (question: string): Promise<string> => {
    questionCount++;
    if (questionCount > MAX_QUESTIONS_PER_INVESTIGATION) {
      return `[AUTO-ASSUMED] Max ${MAX_QUESTIONS_PER_INVESTIGATION.toString()} questions reached: ${question}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => { controller.abort(); }, READLINE_TIMEOUT_MS);

    try {
      const answer = await rl.question(
        `\n🤔 Agent question (${questionCount.toString()}/${MAX_QUESTIONS_PER_INVESTIGATION.toString()}):\n${question}\n\n> `,
        { signal: controller.signal },
      );
      return answer.trim() !== '' ? answer.trim() : `[EMPTY] User provided no answer for: ${question}`;
    } catch {
      return `[TIMEOUT] No response within 5 minutes for: ${question}`;
    } finally {
      clearTimeout(timeout);
    }
  };
};

const isStdinTTY = (): boolean =>
  typeof process.stdin.isTTY === 'boolean' && process.stdin.isTTY;

export const createPromptUser = (config: PromptUserConfig): PromptUserFn => {
  if (config.mode === 'autonomous') return autoAssume;
  if (config.callbackUrl !== undefined && config.callbackUrl !== '') {
    return createCallbackPrompt(config.callbackUrl);
  }
  if (isStdinTTY()) return createReadlinePrompt();
  return autoAssume;
};
