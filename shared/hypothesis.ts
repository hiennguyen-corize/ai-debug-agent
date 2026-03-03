/**
 * Hypothesis and evidence types.
 */

export const HYPOTHESIS_STATUS = {
  UNTESTED: 'untested',
  TESTING: 'testing',
  CONFIRMED: 'confirmed',
  REFUTED: 'refuted',
  PARTIAL: 'partial',
} as const;

export type HypothesisStatus = (typeof HYPOTHESIS_STATUS)[keyof typeof HYPOTHESIS_STATUS];

export type Hypothesis = {
  id: string;
  statement: string;
  confidence: number;
  status: HypothesisStatus;
  testStrategy: string;
};

export const EVIDENCE_CATEGORY = {
  NETWORK: 'network',
  CONSOLE: 'console',
  DOM: 'dom',
  SOURCE: 'source',
  USER_INPUT: 'user_input',
} as const;

export type EvidenceCategory = (typeof EVIDENCE_CATEGORY)[keyof typeof EVIDENCE_CATEGORY];

export const EVIDENCE_TYPE = {
  NETWORK_ERROR: 'network_error',
  NETWORK_SUCCESS: 'network_success',
  CONSOLE_ERROR: 'console_error',
  CONSOLE_LOG: 'console_log',
  DOM_ANOMALY: 'dom_anomaly',
  SOURCE_CODE: 'source_code',
  USER_CLARIFICATION: 'user_clarification',
} as const;

export type EvidenceType = (typeof EVIDENCE_TYPE)[keyof typeof EVIDENCE_TYPE];

export type Evidence = {
  id: string;
  hypothesisId: string;
  category: EvidenceCategory;
  type: EvidenceType;
  description: string;
  data: unknown;
  timestamp: number;
};
