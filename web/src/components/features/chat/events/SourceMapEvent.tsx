import type { AgentEvent } from '#api/types'

export function SourceMapResolvedEvent({ event }: { event: Extract<AgentEvent, { type: 'sourcemap_resolved' }> }) {
  return (
    <div className="flex items-center gap-2 py-0.5 text-xs font-mono">
      <span className="text-success">✓</span>
      <span className="text-text-secondary">
        {event.originalFile}:{event.line}
      </span>
    </div>
  )
}

export function SourceMapFailedEvent({ event }: { event: Extract<AgentEvent, { type: 'sourcemap_failed' }> }) {
  return (
    <div className="flex items-center gap-2 py-0.5 text-xs font-mono text-text-muted">
      <span>✗</span>
      <span>sourcemap: {event.reason}</span>
    </div>
  )
}
