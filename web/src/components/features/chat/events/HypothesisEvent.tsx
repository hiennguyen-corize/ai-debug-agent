import type { AgentEvent } from '#api/types'

export function HypothesisCreatedEvent({ event }: { event: Extract<AgentEvent, { type: 'hypothesis_created' }> }) {
  return (
    <div className="py-1 pl-4 border-l border-planner/30 space-y-1">
      <div className="flex items-center gap-2 text-xs font-mono">
        <span className="text-planner font-semibold">Hypothesis</span>
        <span className="text-text-muted">[{event.confidence}]</span>
      </div>
      <p className="text-sm text-text-secondary leading-relaxed">{event.hypothesis}</p>
    </div>
  )
}
