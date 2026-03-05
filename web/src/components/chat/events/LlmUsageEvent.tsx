import type { AgentEvent } from '#api/types'
import { Cpu } from 'lucide-react'

export function LlmUsageEvent({ event }: { event: Extract<AgentEvent, { type: 'llm_usage' }> }) {
  const total = event.promptTokens + event.completionTokens

  return (
    <div className="flex items-center gap-2 py-0.5">
      <Cpu className="w-3.5 h-3.5 text-text-muted/50 shrink-0" />
      <span className="text-[11px] text-text-muted/60 font-mono">
        {event.promptTokens.toLocaleString()} prompt + {event.completionTokens.toLocaleString()} completion = {total.toLocaleString()} tokens
      </span>
    </div>
  )
}
