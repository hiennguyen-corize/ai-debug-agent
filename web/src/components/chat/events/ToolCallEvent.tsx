import type { AgentEvent } from '#api/types'
import { Wrench, CheckCircle, XCircle } from 'lucide-react'
import { Badge } from '#components/ui/Badge'

export function ToolCallEvent({ event }: { event: Extract<AgentEvent, { type: 'tool_call' }> }) {
  const argsPreview = typeof event.args === 'object' && event.args !== null
    ? JSON.stringify(event.args).slice(0, 100)
    : ''

  return (
    <div className="flex items-center gap-2 text-sm">
      <Wrench className="w-4 h-4 text-amber-400 shrink-0" />
      <code className="bg-bg-tertiary px-2 py-0.5 rounded text-xs font-mono text-text-primary">
        {event.tool}
      </code>
      {argsPreview && (
        <span className="text-text-muted text-xs font-mono truncate max-w-md">{argsPreview}</span>
      )}
    </div>
  )
}

export function ToolResultEvent({ event }: { event: Extract<AgentEvent, { type: 'tool_result' }> }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {event.success
        ? <CheckCircle className="w-4 h-4 text-cta" />
        : <XCircle className="w-4 h-4 text-error" />}
      <code className="text-xs font-mono text-text-muted">{event.tool}</code>
      <Badge variant={event.success ? 'done' : 'error'}>
        {event.durationMs}ms
      </Badge>
    </div>
  )
}
