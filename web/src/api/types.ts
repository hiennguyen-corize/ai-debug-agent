export type {
  AgentEvent,
  InvestigationReport,
  Evidence,
  CodeLocation,
  InvestigationPhase,
  InvestigationMode,
  ReportSeverity,
  ThreadStatus,
} from '@ai-debug/shared'

export type ThreadResponse = {
  threadId: string
  status: import('@ai-debug/shared').ThreadStatus
  request: { url: string; hint?: string; mode: import('@ai-debug/shared').InvestigationMode }
  report: import('@ai-debug/shared').InvestigationReport | null
  error: string | null
}
