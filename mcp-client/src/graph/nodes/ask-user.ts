/**
 * Ask user node — interactive clarification.
 */

import { INVESTIGATION_STATUS, type UserClarification } from '@ai-debug/shared';
import type { AgentState } from '../state.js';

type AskUserDeps = {
  promptUser: (question: string) => Promise<string>;
};

export const createAskUserNode = (deps: AskUserDeps) =>
  async (state: AgentState): Promise<Partial<AgentState>> => {
    const question = state.pendingQuestion;
    if (question === null) return { status: INVESTIGATION_STATUS.INVESTIGATING };

    const answer = await deps.promptUser(question);
    const clarification: UserClarification = {
      question,
      answer,
      timestamp: new Date().toISOString(),
    };

    return {
      userClarifications: [...state.userClarifications, clarification],
      status: INVESTIGATION_STATUS.INVESTIGATING,
      pendingQuestion: null,
    };
  };
