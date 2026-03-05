import { useState } from 'react'
import type { AgentEvent } from '#api/types'
import { cn } from '#lib/utils'

export function ToolCallEvent({ event }: { event: Extract<AgentEvent, { type: 'tool_call' }> }) {
  return (
    <div className="flex items-center gap-2 py-0.5 text-xs font-mono">
      <span className="text-text-muted">→</span>
      <span className="text-text-secondary">{event.tool}</span>
    </div>
  )
}

export function ToolResultEvent({ event }: { event: Extract<AgentEvent, { type: 'tool_result' }> }) {
  const [expanded, setExpanded] = useState(false)
  const hasContent = event.result && event.result.length > 0
  const isLong = hasContent && event.result.length > 120

  return (
    <div className="py-0.5">
      <div className="flex items-center gap-2 text-xs font-mono">
        <span className={event.isError ? 'text-error' : 'text-success'}>
          {event.isError ? '✗' : '✓'}
        </span>
        <span className="text-text-muted">{event.tool}</span>
        {event.duration && (
          <span className="text-text-muted">{event.duration}ms</span>
        )}
        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-text-muted hover:text-text-secondary cursor-pointer"
          >
            {expanded ? '▾' : '▸'}
          </button>
        )}
      </div>
      {hasContent && (!isLong || expanded) && (
        <pre className={cn(
          'text-[11px] text-text-muted font-mono mt-1 pl-4 whitespace-pre-wrap break-all leading-relaxed',
          'max-h-48 overflow-y-auto',
          expanded && 'animate-fade-in',
        )}>
          {event.result}
        </pre>
      )}
    </div>
  )
}
