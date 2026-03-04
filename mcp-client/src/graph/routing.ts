/**
 * Graph routing — conditional edge functions.
 */

import { INVESTIGATION_STATUS } from '@ai-debug/shared';
import type { AgentState } from './state.js';

const ROUTE_NODES = {
  SCOUT: 'scout',
  INVESTIGATOR: 'investigator',
  EXPLORER: 'explorer',
  SOURCE_MAP: 'source_map',
  ASK_USER: 'ask_user',
  SYNTHESIS: 'synthesis',
  FORCE_SYNTHESIS: 'force_synthesis',
} as const;

export const routeFromPreflight = (state: AgentState): string => {
  if (state.status === INVESTIGATION_STATUS.NEEDS_USER_INPUT) return ROUTE_NODES.ASK_USER;
  return ROUTE_NODES.SCOUT;
};

export const routeFromInvestigator = (state: AgentState): string => {
  if (state.iterationCount >= state.maxIterations) return ROUTE_NODES.FORCE_SYNTHESIS;
  if (state.status === INVESTIGATION_STATUS.SOURCE_ANALYSIS) return ROUTE_NODES.SOURCE_MAP;
  if (state.status === INVESTIGATION_STATUS.SYNTHESIZING) return ROUTE_NODES.SYNTHESIS;
  if (state.status === INVESTIGATION_STATUS.WAITING_EXPLORER) return ROUTE_NODES.EXPLORER;

  if (state.status === INVESTIGATION_STATUS.NEEDS_USER_INPUT) {
    return state.investigationMode === 'interactive'
      ? ROUTE_NODES.ASK_USER
      : ROUTE_NODES.INVESTIGATOR;
  }

  return ROUTE_NODES.INVESTIGATOR;
};

export const routeFromExplorer = (_state: AgentState): string =>
  ROUTE_NODES.INVESTIGATOR;

export const routeFromSourceMap = (_state: AgentState): string =>
  ROUTE_NODES.INVESTIGATOR;

export const routeFromAskUser = (_state: AgentState): string =>
  ROUTE_NODES.INVESTIGATOR;
