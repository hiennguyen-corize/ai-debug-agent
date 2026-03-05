import type { AgentEvent } from '#api/types'

export function ErrorEvent({ event }: { event: Extract<AgentEvent, { type: 'error' }> }) {
  return (
    <div className="flex gap-2 py-1 pl-3 border-l-2 border-error">
      <span className="text-xs text-error font-mono">✗</span>
      <p className="text-sm text-error leading-relaxed">{event.message}</p>
    </div>
  )
}
