/**
 * Investigator node — central reasoning loop.
 */

import {
  INVESTIGATION_STATUS,
  AGENT_NAME,
} from '@ai-debug/shared';
import type { AgentState } from '../state.js';
import type { EventBus } from '../../observability/event-bus.js';
import type { LLMClient } from '../../agent/llm-client.js';
import { INVESTIGATOR_SYSTEM_PROMPT } from '../../agent/prompts.js';
import { getTextContent } from '../../agent/tool-parser.js';

type InvestigatorDeps = {
  llmClient: LLMClient;
  eventBus: EventBus;
  mcpCall: (tool: string, args: Record<string, unknown>) => Promise<unknown>;
};

const buildMessages = (state: AgentState): Array<{ role: string; content: string }> => {
  const msgs: Array<{ role: string; content: string }> = [
    { role: 'system', content: INVESTIGATOR_SYSTEM_PROMPT },
  ];
  if (state.initialObservations !== null) msgs.push({ role: 'user', content: `Scout:\n${JSON.stringify(state.initialObservations, null, 2)}` });
  if (state.hint !== null) msgs.push({ role: 'user', content: `Hint: ${state.hint}` });
  if (state.hypotheses.length > 0) msgs.push({ role: 'assistant', content: `Hypotheses:\n${JSON.stringify(state.hypotheses, null, 2)}` });
  if (state.browserTaskResults.length > 0) {
    const latest = state.browserTaskResults[state.browserTaskResults.length - 1];
    msgs.push({ role: 'user', content: `Explorer:\n${JSON.stringify(latest, null, 2)}` });
  }
  if (state.codeAnalysis !== null) msgs.push({ role: 'user', content: `Code:\n${JSON.stringify(state.codeAnalysis, null, 2)}` });
  return msgs;
};

const emitUsage = (deps: InvestigatorDeps, usage: { prompt_tokens: number; completion_tokens: number }): void => {
  deps.eventBus.emit({
    type: 'llm_usage', agent: AGENT_NAME.INVESTIGATOR,
    promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens,
  });
};

const invokeInvestigator = async (state: AgentState, deps: InvestigatorDeps): Promise<Partial<AgentState>> => {
  deps.eventBus.emit({ type: 'investigation_phase', phase: 'investigating' });

  const response = await deps.llmClient.client.chat.completions.create({
    model: deps.llmClient.model,
    messages: buildMessages(state) as Parameters<typeof deps.llmClient.client.chat.completions.create>[0]['messages'],
    temperature: 0.2,
  });

  const message = response.choices[0]?.message;
  if (message === undefined) return { status: INVESTIGATION_STATUS.ERROR };

  const reasoning = getTextContent(message);
  if (reasoning !== '') deps.eventBus.emit({ type: 'reasoning', agent: AGENT_NAME.INVESTIGATOR, text: reasoning });
  if (response.usage !== undefined && response.usage !== null) emitUsage(deps, response.usage);

  return { iterationCount: state.iterationCount + 1 };
};

export const createInvestigatorNode = (deps: InvestigatorDeps) =>
  async (state: AgentState): Promise<Partial<AgentState>> =>
    invokeInvestigator(state, deps);
