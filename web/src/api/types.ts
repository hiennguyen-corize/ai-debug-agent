export type AgentEvent =
  | { type: 'reasoning'; agent: string; text: string }
  | { type: 'tool_call'; agent: string; tool: string; args: unknown }
  | { type: 'tool_result'; agent: string; tool: string; success: boolean; durationMs: number }
  | { type: 'llm_usage'; agent: string; promptTokens: number; completionTokens: number }
  | { type: 'error'; agent: string; message: string }
  | { type: 'hypothesis_created'; hypotheses: { id: string; statement: string; confidence: number; status: string }[] }
  | { type: 'hypothesis_updated'; id: string; oldConfidence: number; newConfidence: number; status: string }
  | { type: 'sourcemap_resolved'; bundleUrl: string; originalFile: string; line: number }
  | { type: 'sourcemap_failed'; bundleUrl: string; reason: string }
  | { type: 'user_question'; question: string; context: string }
  | { type: 'user_answered'; question: string }
  | { type: 'investigation_phase'; phase: string }
  | { type: 'screenshot_captured'; agent: string; data: string }

export type InvestigationReport = {
  url: string
  rootCause: string
  severity: string
  confidence: number
  codeLocation?: { file: string; line: number; snippet?: string }
  suggestedFix?: string
  reproSteps: string[]
  summary: string
}

export type ThreadResponse = {
  threadId: string
  status: 'running' | 'done' | 'error'
  request: { url: string; hint?: string; mode: string }
  report: InvestigationReport | null
  error: string | null
}
