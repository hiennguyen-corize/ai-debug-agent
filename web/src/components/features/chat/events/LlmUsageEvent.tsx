import type { AgentEvent } from '#api/types'

export function LlmUsageEvent(_props: { event: Extract<AgentEvent, { type: 'llm_usage' }> }) {
  return null
}
