/**
 * Conditional edges — routing decisions for the investigation graph.
 */

import { AIMessage } from '@langchain/core/messages';
import type { InvestigationStateType } from '#graph/state.js';
import { MAX_NO_TOOL_RETRIES, MAX_STALL_COUNT } from '#graph/constants.js';

export const shouldContinue = (state: InvestigationStateType): string => {
  if (state.result !== null) return 'end';

  const lastMsg = state.messages[state.messages.length - 1];
  if (lastMsg === undefined) return 'emergency';

  if (lastMsg instanceof AIMessage) {
    const toolCalls = lastMsg.tool_calls ?? [];
    if (toolCalls.length === 0) {
      return state.noToolCount >= MAX_NO_TOOL_RETRIES ? 'emergency' : 'no_tools';
    }
    return 'tools';
  }

  return 'agent';
};

export const shouldContinueAfterTools = (state: InvestigationStateType): string => {
  if (state.result !== null) return 'end';
  if (state.stallCount >= MAX_STALL_COUNT) return 'force_finish';
  if (state.iteration >= state.maxIterations - 1) return 'force_finish';
  return 'agent';
};
