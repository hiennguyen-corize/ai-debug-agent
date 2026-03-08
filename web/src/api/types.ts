export type {
  AgentEvent,
  InvestigationReport,
  InvestigationMode,
  ThreadStatus,
} from '@ai-debug/shared'

import type { ThreadStatus, InvestigationMode, InvestigationReport } from '@ai-debug/shared'

export type ThreadResponse = {
  threadId: string
  status: ThreadStatus
  request: { url: string; hint?: string; mode: InvestigationMode }
  report: InvestigationReport | null
  error: string | null
}
