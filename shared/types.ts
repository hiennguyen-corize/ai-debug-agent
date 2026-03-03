/**
 * Shared types — barrel re-export.
 */

export {
  InvestigationRequestSchema,
  FinishInvestigationSchema,
} from './schemas.js';

export type {
  InvestigationRequest,
  FinishInvestigation,
} from './schemas.js';

export {
  CONSOLE_LOG_TYPE,
} from './browser.js';

export type {
  BrowserTask,
  BrowserTaskResult,
  CapturedRequest,
  CapturedLog,
  ConsoleLogType,
  CorrelatedEvidence,
} from './browser.js';

export {
  HYPOTHESIS_STATUS,
  EVIDENCE_CATEGORY,
  EVIDENCE_TYPE,
} from './hypothesis.js';

export type {
  HypothesisStatus,
  Hypothesis,
  EvidenceCategory,
  EvidenceType,
  Evidence,
} from './hypothesis.js';

export {
  AGENT_NAME,
  STREAM_LEVEL,
  INVESTIGATION_PHASE,
  STEP_TYPE,
} from './agent.js';

export type {
  AgentName,
  StreamLevel,
  InvestigationPhase,
  StepType,
  AgentEvent,
  InvestigationStep,
} from './agent.js';

export {
  INVESTIGATION_STATUS,
} from './investigation.js';

export type {
  InvestigationStatus,
} from './investigation.js';

export {
  MODEL_TIER,
} from './model.js';

export type {
  ModelTier,
  ModelProfile,
} from './model.js';

export {
  REPORT_SEVERITY,
} from './domain.js';

export type {
  NetworkError,
  ScoutObservation,
  UserClarification,
  SourceMapResolution,
  CodeAnalysis,
  ReportSeverity,
  InvestigationReport,
} from './domain.js';
