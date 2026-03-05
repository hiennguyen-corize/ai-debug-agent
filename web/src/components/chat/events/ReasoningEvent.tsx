import type { AgentEvent } from '#api/types'
import { Brain } from 'lucide-react'

export function ReasoningEvent({ event }: { event: Extract<AgentEvent, { type: 'reasoning' }> }) {
  return (
    <div className="flex gap-3 pl-3 border-l-2 border-indigo-400/30">
      <Brain className="w-4 h-4 mt-0.5 text-indigo-400 shrink-0" />
      <p className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed">{event.text}</p>
    </div>
  )
}
