/**
 * Shared types — barrel re-export.
 */

export {
  InvestigationRequestSchema,
  UserMessageSchema,
} from './schemas.js';

export type {
  InvestigationRequest,
} from './schemas.js';

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
  REPORT_SEVERITY,
  THREAD_STATUS,
} from './domain.js';

export type {
  Evidence,
  SourceMapResolution,
  CodeAnalysis,
  CodeLocation,
  ReportSeverity,
  ThreadStatus,
  InvestigationReport,
  InvestigationMode,
} from './domain.js';

export { INVESTIGATION_MODE } from './domain.js';

export { CONSOLE_LOG_TYPE } from './browser.js';

export type {
  ConsoleLogType,
  CapturedLog,
  CapturedRequest,
  BrowserTask,
  BrowserTaskResult,
  CorrelatedEvidence,
} from './browser.js';
