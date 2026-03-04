/**
 * Guardrails — block dangerous browser actions.
 */

import type { GuardrailConfig, GuardrailResult } from '#types/index.js';
import {
  PAYMENT_PATTERN,
  DELETE_PATTERN,
  LOGOUT_PATTERN,
  ACCOUNT_PATTERN,
} from '#constants/guardrails.js';

const DANGEROUS_PATTERNS: ReadonlyMap<string, RegExp> = new Map([
  ['payment', PAYMENT_PATTERN],
  ['delete', DELETE_PATTERN],
  ['logout', LOGOUT_PATTERN],
  ['account', ACCOUNT_PATTERN],
]);

const DEFAULT_GUARDRAILS: GuardrailConfig = {
  allowPayment: false,
  allowDelete: false,
  allowLogout: false,
  customAllowList: [],
};

const isCategoryAllowed = (category: string, config: GuardrailConfig): boolean => {
  if (category === 'payment') return config.allowPayment;
  if (category === 'delete') return config.allowDelete;
  if (category === 'logout') return config.allowLogout;
  return false;
};

export const checkGuardrails = (
  actionLabel: string,
  config?: Partial<GuardrailConfig>,
): GuardrailResult => {
  const merged = { ...DEFAULT_GUARDRAILS, ...config };

  const isCustomAllowed = merged.customAllowList.some((a) => actionLabel.includes(a));
  if (isCustomAllowed) return { allowed: true };

  for (const [category, pattern] of DANGEROUS_PATTERNS) {
    if (!pattern.test(actionLabel)) continue;
    if (isCategoryAllowed(category, merged)) continue;

    return {
      allowed: false,
      reason: `Blocked: "${actionLabel}" matches dangerous pattern (${category}). Configure guardrails to allow.`,
    };
  }

  return { allowed: true };
};
