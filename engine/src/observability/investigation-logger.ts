/**
 * Investigation logger — tracks token usage across an investigation.
 *
 * Subscribes to event bus for LLM usage tracking. File writing removed —
 * all evidence now stored in DB via artifact_captured events.
 */

import type { AgentEvent } from '@ai-debug/shared';
import type { EventBus } from '#observability/event-bus.js';

type InvestigationLogger = {
  unsubscribe: () => void;
  writeFooter: () => void;
};

const COST_PER_1M_INPUT = 0.15;
const COST_PER_1M_OUTPUT = 0.60;

export const createInvestigationLogger = (
  eventBus: EventBus,
  _url: string,
  _hint?: string,
): InvestigationLogger => {
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let llmCalls = 0;

  const unsubscribe = eventBus.subscribe((event: AgentEvent) => {
    if (event.type === 'llm_usage') {
      totalPromptTokens += event.promptTokens;
      totalCompletionTokens += event.completionTokens;
      llmCalls++;
    }
  });

  const writeFooter = (): void => {
    const totalTokens = totalPromptTokens + totalCompletionTokens;
    const inputCost = (totalPromptTokens / 1_000_000) * COST_PER_1M_INPUT;
    const outputCost = (totalCompletionTokens / 1_000_000) * COST_PER_1M_OUTPUT;
    const totalCost = inputCost + outputCost;

    process.stderr.write(
      `[Investigation] ${llmCalls.toString()} LLM calls | ${totalTokens.toLocaleString()} tokens | $${totalCost.toFixed(4)}\n`,
    );
  };

  return { unsubscribe, writeFooter };
};
