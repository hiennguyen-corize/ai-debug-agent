export type AgentEvent =
  | { type: 'reasoning'; agent: string; text: string }
  | { type: 'tool_call'; agent: string; tool: string; args: unknown }
  | { type: 'tool_result'; agent: string; tool: string; success: boolean; durationMs: number; result?: string }
  | { type: 'llm_usage'; agent: string; promptTokens: number; completionTokens: number }
  | { type: 'error'; agent: string; message: string }
  | { type: 'sourcemap_resolved'; bundleUrl: string; originalFile: string; line: number }
  | { type: 'sourcemap_failed'; bundleUrl: string; reason: string }
  | { type: 'investigation_phase'; phase: string }
  | { type: 'screenshot_captured'; agent: string; data: string }
  | { type: 'waiting_for_input'; agent: string; prompt: string }

export type Evidence = {
  type: string
  description: string
  data?: unknown
}

export type InvestigationReport = {
  url: string
  summary: string
  rootCause: string
  severity: string
  reproSteps: string[]
  evidence: Evidence[]
  suggestedFix?: { file: string; line: number; before: string; after: string; explanation: string } | null
  codeLocation?: { file: string; line: number; column?: number; snippet?: string } | null
  networkFindings?: string[]
  timeline?: string[]
  dataFlow?: string
  durationMs?: number
  timestamp?: string
}

export type ThreadResponse = {
  threadId: string
  status: 'running' | 'done' | 'error'
  request: { url: string; hint?: string; mode: string }
  report: InvestigationReport | null
  error: string | null
}
