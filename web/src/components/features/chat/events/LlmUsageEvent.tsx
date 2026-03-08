import type { AgentEvent } from '#api/types'

export function LlmUsageEvent({ event }: { event: Extract<AgentEvent, { type: 'llm_usage' }> }) {
  const total = event.promptTokens + event.completionTokens
  return (
    <span className="text-[10px] text-text-muted font-mono opacity-60">
      🪙 {total.toLocaleString()} tokens ({event.promptTokens.toLocaleString()}↑ {event.completionTokens.toLocaleString()}↓)
    </span>
  )
}
