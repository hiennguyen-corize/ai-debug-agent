/**
 * Graph routing — conditional edge functions.
 */

import { INVESTIGATION_STATUS } from '@ai-debug/shared';
import type { AgentState } from './state.js';

const MAX_PLANNER_ROUNDS = 3;

export const routeFromPreflight = (state: AgentState): string => {
  if (state.status === INVESTIGATION_STATUS.NEEDS_USER_INPUT) return 'ask_user';
  return 'scout';
};

export const routeFromPlanner = (state: AgentState): string => {
  // Force synthesis after max rounds
  if (state.plannerRound >= MAX_PLANNER_ROUNDS) return 'force_synthesis';
  // Planner decided to synthesize
  if (state.status === INVESTIGATION_STATUS.SYNTHESIZING) return 'synthesis';
  // Planner decided to analyze source maps
  if (state.status === INVESTIGATION_STATUS.SOURCE_ANALYSIS) return 'source_map';
  // Planner wrote a brief → dispatch to executor
  if (state.investigationBrief !== null) return 'executor';
  // Fallback
  return 'force_synthesis';
};

export const routeFromExecutor = (_state: AgentState): string =>
  'planner';

export const routeFromSourceMap = (_state: AgentState): string =>
  'planner';

export const routeFromAskUser = (_state: AgentState): string =>
  'planner';
