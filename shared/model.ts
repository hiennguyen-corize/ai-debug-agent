/**
 * Model profile types.
 */

export const MODEL_TIER = {
  TIER1: 'tier1',
  TIER2: 'tier2',
  TIER3: 'tier3',
} as const;

export type ModelTier = (typeof MODEL_TIER)[keyof typeof MODEL_TIER];

export type ModelProfile = {
  tier: ModelTier;
  domElementLimit: number;
  tokenBudgetRatio: number;
  compressThreshold: number;
  spaWaitMs: number;
  spaFillWaitMs: number;
  sourceMapEnabled: boolean;
  maxHypotheses: number;
  taskTimeoutMs: number;
};
