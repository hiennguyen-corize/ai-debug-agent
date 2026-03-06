import type { AgentEvent } from '#api/types'

type WaitingEvent = Extract<AgentEvent, { type: 'waiting_for_input' }>

export function WaitingForInputEvent({ event }: { event: WaitingEvent }) {
  return (
    <span className="text-xs text-accent-primary font-mono">
      ⏸️ {event.prompt}
    </span>
  )
}
