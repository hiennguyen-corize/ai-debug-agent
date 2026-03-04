/**
 * Action result types.
 */

export type ActionResult = {
  success: boolean;
  error?: string;
  blockedByGuardrail?: boolean;
};
