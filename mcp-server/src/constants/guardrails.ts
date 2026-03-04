/**
 * Guardrail regex patterns — dangerous action detection.
 */

export const PAYMENT_PATTERN = /pay|checkout|purchase|buy\s*now|place\s*order|submit\s*payment/i;
export const DELETE_PATTERN = /delete|remove|destroy|purge|wipe|erase/i;
export const LOGOUT_PATTERN = /log\s*out|sign\s*out|disconnect/i;
export const ACCOUNT_PATTERN = /deactivate|close\s*account|cancel\s*subscription/i;
