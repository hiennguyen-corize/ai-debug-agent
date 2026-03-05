import type { AgentEvent } from '#api/types'
import { Lightbulb } from 'lucide-react'
import { Badge } from '#components/ui/Badge'
import { GlassCard } from '#components/ui/GlassCard'

export function HypothesisCreatedEvent({ event }: { event: Extract<AgentEvent, { type: 'hypothesis_created' }> }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
        <Lightbulb className="w-4 h-4 text-warning" />
        Hypotheses
      </div>
      <div className="space-y-2 pl-2">
        {event.hypotheses.map((h) => (
          <GlassCard key={h.id} padding="sm" className="space-y-2">
            <p className="text-sm text-text-secondary leading-relaxed">{h.statement}</p>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-1.5 bg-bg-tertiary rounded-full overflow-hidden max-w-32">
                <div
                  className="h-full bg-gradient-to-r from-accent to-accent-hover rounded-full transition-all duration-500"
                  style={{ width: `${Math.round(h.confidence * 100)}%` }}
                />
              </div>
              <span className="text-xs text-text-muted font-mono">
                {Math.round(h.confidence * 100)}%
              </span>
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  )
}

export function HypothesisUpdatedEvent({ event }: { event: Extract<AgentEvent, { type: 'hypothesis_updated' }> }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Lightbulb className="w-4 h-4 text-warning" />
      <span className="font-mono text-xs text-text-secondary">
        {Math.round(event.oldConfidence * 100)}% → {Math.round(event.newConfidence * 100)}%
      </span>
      <Badge
        variant={
          event.status === 'confirmed' ? 'done'
            : event.status === 'refuted' ? 'error'
              : 'warning'
        }
      >
        {event.status}
      </Badge>
    </div>
  )
}
