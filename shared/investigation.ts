/**
 * Investigation status types.
 */

export const INVESTIGATION_STATUS = {
  IDLE: 'idle',
  SCOUTING: 'scouting',
  HYPOTHESIZING: 'hypothesizing',
  INVESTIGATING: 'investigating',
  WAITING_EXPLORER: 'waiting_explorer',
  SOURCE_ANALYSIS: 'source_analysis',
  SYNTHESIZING: 'synthesizing',
  DONE: 'done',
  ERROR: 'error',
  CANNOT_DETERMINE: 'cannot_determine',
} as const;

export type InvestigationStatus = (typeof INVESTIGATION_STATUS)[keyof typeof INVESTIGATION_STATUS];
