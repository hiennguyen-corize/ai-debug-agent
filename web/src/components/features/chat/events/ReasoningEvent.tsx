import { useState } from 'react'
import type { AgentEvent } from '#api/types'
import { MarkdownRenderer } from '../MarkdownRenderer'
import { cn } from '#lib/utils'

const MARKDOWN_THRESHOLD = 100
const COLLAPSE_THRESHOLD = 200

function isMarkdownContent(text: string): boolean {
  return text.length > MARKDOWN_THRESHOLD && (
    text.includes('```') || text.includes('## ') || text.includes('**')
  )
}

export function ReasoningEvent({ event }: { event: Extract<AgentEvent, { type: 'reasoning' }> }) {
  const isReport = isMarkdownContent(event.text)
  const isLong = event.text.length > COLLAPSE_THRESHOLD
  const [expanded, setExpanded] = useState(!isLong)

  if (isReport) {
    return (
      <div className="space-y-2">
        <span className="text-[10px] uppercase tracking-widest font-mono text-report font-semibold">
          Investigation Report
        </span>
        <div className="border border-border rounded p-4 bg-bg-secondary overflow-x-auto">
          <MarkdownRenderer content={event.text} />
        </div>
      </div>
    )
  }

  if (isLong) {
    return (
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
        >
          <span className={cn('transition-transform duration-150', expanded && 'rotate-90')}>▸</span>
          <span className="font-mono">{expanded ? 'Thinking' : 'Show thinking…'}</span>
        </button>
        {expanded && (
          <p className="text-sm text-text-secondary italic whitespace-pre-wrap leading-relaxed pl-4 border-l border-border-subtle animate-fade-in">
            {event.text}
          </p>
        )}
      </div>
    )
  }

  return (
    <p className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed pl-4 border-l border-border-subtle">
      {event.text}
    </p>
  )
}
