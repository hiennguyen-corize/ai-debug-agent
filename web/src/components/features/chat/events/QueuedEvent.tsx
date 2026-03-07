import type { AgentEvent } from '#api/types'

type QueuedEventProps = {
  event: Extract<AgentEvent, { type: 'investigation_queued' }>
}

export function QueuedEvent({ event }: QueuedEventProps) {
  return (
    <div className="text-xs text-amber-400 font-mono">
      ⏳ Queued (position {event.position}) — {event.message}
    </div>
  )
}
