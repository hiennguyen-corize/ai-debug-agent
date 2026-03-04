/**
 * Preflight node — check hint presence, ask user if needed.
 */

import { INVESTIGATION_STATUS } from '@ai-debug/shared';
import type { AgentState } from '#graph/state.js';

const DEFAULT_HINT = 'general bug investigation — scan for any errors or anomalies';

export const preflightNode = (state: AgentState): Partial<AgentState> => {
  if (state.hint !== null && state.hint.trim() !== '') {
    return { status: INVESTIGATION_STATUS.SCOUTING };
  }

  if (state.investigationMode === 'autonomous') {
    return { hint: DEFAULT_HINT, status: INVESTIGATION_STATUS.SCOUTING };
  }

  return {
    status: INVESTIGATION_STATUS.NEEDS_USER_INPUT,
    pendingQuestion: 'What issue are you experiencing on this page?\n(e.g. "add to cart crashes", "page won\'t load", "form submit does nothing")',
  };
};
