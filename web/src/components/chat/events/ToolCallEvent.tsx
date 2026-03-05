import { useState } from 'react'
import type { AgentEvent } from '#api/types'
import { Wrench, CheckCircle, XCircle, ChevronRight, ChevronDown } from 'lucide-react'
import { Badge } from '#components/ui/Badge'

function CollapsibleJson({ data }: { data: unknown }) {
  const [open, setOpen] = useState(false)
  const json = typeof data === 'object' && data !== null ? data : null
  if (json === null) return null

  const preview = JSON.stringify(json)
  const isShort = preview.length < 60

  if (isShort) {
    return <span className="text-text-muted/60 text-xs font-mono truncate max-w-sm">{preview}</span>
  }

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-text-muted/50 hover:text-text-muted text-xs cursor-pointer transition-colors"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <span className="font-mono">{open ? 'collapse' : 'args'}</span>
      </button>
      {open && (
        <pre className="mt-1 text-[11px] font-mono text-text-muted/70 bg-bg-tertiary/50 rounded-md px-3 py-2 overflow-x-auto border border-border-subtle/20">
          {JSON.stringify(json, null, 2)}
        </pre>
      )}
    </div>
  )
}

export function ToolCallEvent({ event }: { event: Extract<AgentEvent, { type: 'tool_call' }> }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-sm">
        <Wrench className="w-4 h-4 text-amber-400 shrink-0" />
        <code className="bg-bg-tertiary px-2 py-0.5 rounded text-xs font-mono text-text-primary font-medium">
          {event.tool}
        </code>
      </div>
      <div className="pl-6">
        <CollapsibleJson data={event.args} />
      </div>
    </div>
  )
}

export function ToolResultEvent({ event }: { event: Extract<AgentEvent, { type: 'tool_result' }> }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {event.success
        ? <CheckCircle className="w-4 h-4 text-cta shrink-0" />
        : <XCircle className="w-4 h-4 text-error shrink-0" />}
      <code className="text-xs font-mono text-text-muted">{event.tool}</code>
      <Badge variant={event.success ? 'done' : 'error'}>
        {event.durationMs}ms
      </Badge>
    </div>
  )
}
