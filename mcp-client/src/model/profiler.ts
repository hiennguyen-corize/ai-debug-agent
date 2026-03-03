/**
 * Model auto-profiler — detect tier from model name.
 */

import { MODEL_TIER, type ModelTier, type ModelProfile } from '@ai-debug/shared';

const TIER1_MODELS = /gpt-4o|gpt-4-turbo|claude-3.5-sonnet|claude-sonnet|gemini-1\.5-pro|gemini-2\.0-pro/i;
const TIER2_MODELS = /gpt-4o-mini|gpt-3\.5|claude-3\.5-haiku|claude-haiku|gemini-2\.0-flash|gemini-1\.5-flash/i;

const TIER_PROFILES: Record<ModelTier, ModelProfile> = {
  [MODEL_TIER.TIER1]: {
    tier: MODEL_TIER.TIER1,
    domElementLimit: 150,
    tokenBudgetRatio: 0.85,
    compressThreshold: 0.9,
    taskTimeoutMs: 90_000,
    spaWaitMs: 300,
    spaFillWaitMs: 100,
    maxHypotheses: 5,
    sourceMapEnabled: true,
  },
  [MODEL_TIER.TIER2]: {
    tier: MODEL_TIER.TIER2,
    domElementLimit: 80,
    tokenBudgetRatio: 0.75,
    compressThreshold: 0.85,
    taskTimeoutMs: 120_000,
    spaWaitMs: 400,
    spaFillWaitMs: 150,
    maxHypotheses: 3,
    sourceMapEnabled: true,
  },
  [MODEL_TIER.TIER3]: {
    tier: MODEL_TIER.TIER3,
    domElementLimit: 40,
    tokenBudgetRatio: 0.60,
    compressThreshold: 0.75,
    taskTimeoutMs: 180_000,
    spaWaitMs: 600,
    spaFillWaitMs: 250,
    maxHypotheses: 2,
    sourceMapEnabled: false,
  },
};

export const detectTier = (modelName: string): ModelTier => {
  if (TIER1_MODELS.test(modelName)) return MODEL_TIER.TIER1;
  if (TIER2_MODELS.test(modelName)) return MODEL_TIER.TIER2;
  return MODEL_TIER.TIER3;
};

export const getProfile = (modelName: string): ModelProfile =>
  TIER_PROFILES[detectTier(modelName)];
