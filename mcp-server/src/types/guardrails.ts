/**
 * Guardrail types.
 */

export type GuardrailConfig = {
  allowPayment: boolean;
  allowDelete: boolean;
  allowLogout: boolean;
  customAllowList: string[];
};

export type GuardrailResult = {
  allowed: boolean;
  reason?: string;
};
