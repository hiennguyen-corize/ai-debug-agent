import type { AgentEvent } from '#api/types'
import { AlertTriangle } from 'lucide-react'

export function ErrorEvent({ event }: { event: Extract<AgentEvent, { type: 'error' }> }) {
  return (
    <div className="flex gap-3 p-3 rounded-lg bg-error/5 border border-error/20">
      <AlertTriangle className="w-4 h-4 text-error shrink-0 mt-0.5" />
      <p className="text-sm text-error leading-relaxed">{event.message}</p>
    </div>
  )
}
