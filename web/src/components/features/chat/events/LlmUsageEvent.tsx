import type { AgentEvent } from '#api/types'

export function LlmUsageEvent({ event }: { event: Extract<AgentEvent, { type: 'llm_usage' }> }) {
  const total = event.promptTokens + event.completionTokens
  return (
    <div className="flex justify-end py-0.5">
      <span className="text-[10px] text-text-muted font-mono">
        {total.toLocaleString()} tok
      </span>
    </div>
  )
}
