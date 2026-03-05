import type { AgentEvent } from '#api/types'
import { FileCode, Map } from 'lucide-react'

export function SourceMapResolvedEvent({ event }: { event: Extract<AgentEvent, { type: 'sourcemap_resolved' }> }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <FileCode className="w-4 h-4 text-cyan-400" />
      <span className="font-mono text-xs text-text-secondary">
        {event.originalFile}:{event.line}
      </span>
    </div>
  )
}

export function SourceMapFailedEvent({ event }: { event: Extract<AgentEvent, { type: 'sourcemap_failed' }> }) {
  return (
    <div className="flex items-center gap-2 text-sm text-text-muted">
      <Map className="w-4 h-4" />
      <span className="text-xs">Source map failed: {event.reason}</span>
    </div>
  )
}
