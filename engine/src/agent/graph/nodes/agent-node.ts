/**
 * Agent node — LLM invocation with context window management.
 */

import type { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import { AGENT_NAME } from '@ai-debug/shared';
import type { InvestigationStateType, LangChainTool } from '#graph/state.js';
import {
  MAX_REASONING_REPROMPT_ITERATION,
  SLIDING_WINDOW_SIZE,
  HIGH_USAGE_PCT,
  MED_USAGE_PCT,
  HIGH_USAGE_WINDOW,
  MED_USAGE_WINDOW,
} from '#graph/constants.js';
import { getConfigurable, trimOldToolResults, injectBudgetMessage } from '#graph/helpers.js';

const REPROMPT_MESSAGE = 'You MUST include OBSERVE and PLAN text before tool calls. What did you observe from the last result? What is your hypothesis and plan?';

type RepromptDeps = {
  boundModel: ReturnType<ChatOpenAI['bindTools']>;
  eventBus: ReturnType<typeof getConfigurable>['eventBus'];
};

const handleReasoningReprompt = async (
  deps: RepromptDeps,
  workingMessages: BaseMessage[],
  response: Awaited<ReturnType<RepromptDeps['boundModel']['invoke']>>,
): Promise<typeof response> => {
  workingMessages.push(response);
  workingMessages.push(new HumanMessage({ content: REPROMPT_MESSAGE }));
  const retried = await deps.boundModel.invoke(workingMessages);
  workingMessages.pop();
  workingMessages.pop();

  if ((retried.tool_calls ?? []).length > 0) return retried;

  if (typeof retried.content === 'string' && retried.content.length > 0) {
    deps.eventBus.emit({ type: 'reasoning', agent: AGENT_NAME.AGENT, text: retried.content });
  }
  return response;
};

export const createAgentNode = (model: ChatOpenAI, tools: LangChainTool[]) => {
  const boundModel = model.bindTools(tools);

  return async (state: InvestigationStateType, config: RunnableConfig): Promise<Partial<InvestigationStateType>> => {
    const { messages, lastPromptTokens, contextWindow, triedActions, stallCount, iteration } = state;
    const { eventBus } = getConfigurable(config);

    const workingMessages = [...messages];
    injectBudgetMessage(workingMessages, lastPromptTokens, contextWindow, triedActions, stallCount);

    const usagePct = contextWindow > 0 ? Math.round((lastPromptTokens / contextWindow) * 100) : 0;
    const dynamicWindow = usagePct > HIGH_USAGE_PCT ? HIGH_USAGE_WINDOW : usagePct > MED_USAGE_PCT ? MED_USAGE_WINDOW : SLIDING_WINDOW_SIZE;
    trimOldToolResults(workingMessages, dynamicWindow);

    let response = await boundModel.invoke(workingMessages);

    const hasToolCalls = (response.tool_calls ?? []).length > 0;
    const hasText = typeof response.content === 'string' && response.content.length > 0;

    if (hasToolCalls && !hasText && iteration > 0 && iteration <= MAX_REASONING_REPROMPT_ITERATION) {
      response = await handleReasoningReprompt({ boundModel, eventBus }, workingMessages, response);
    }

    const usageMeta = response.usage_metadata as { input_tokens?: number; total_tokens?: number; output_tokens?: number } | undefined;
    const newPromptTokens = usageMeta?.input_tokens ?? usageMeta?.total_tokens ?? lastPromptTokens;

    if (typeof response.content === 'string' && response.content.length > 0) {
      eventBus.emit({ type: 'reasoning', agent: AGENT_NAME.AGENT, text: response.content });
    }
    eventBus.emit({
      type: 'llm_usage',
      agent: AGENT_NAME.AGENT,
      promptTokens: usageMeta?.input_tokens ?? 0,
      completionTokens: usageMeta?.output_tokens ?? 0,
    });

    return {
      messages: [...workingMessages, response],
      lastPromptTokens: newPromptTokens,
      iteration: iteration + 1,
    };
  };
};
