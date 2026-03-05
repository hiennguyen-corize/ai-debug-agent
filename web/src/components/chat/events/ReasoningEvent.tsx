import { useState } from 'react'
import type { AgentEvent } from '#api/types'
import { Brain, FileText, ChevronDown, ChevronRight } from 'lucide-react'
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
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-purple-400 shrink-0" />
          <span className="text-xs font-semibold text-purple-400 uppercase tracking-wider font-mono">Investigation Report</span>
        </div>
        <div className="rounded-lg border border-border-subtle/40 bg-bg-secondary/30 p-4 overflow-x-auto">
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
          onClick={() => { setExpanded(!expanded) }}
          className="flex items-center gap-2 text-xs text-text-muted hover:text-text-secondary transition-colors cursor-pointer group"
        >
          {expanded
            ? <ChevronDown className="w-3.5 h-3.5" />
            : <ChevronRight className="w-3.5 h-3.5" />
          }
          <Brain className="w-3.5 h-3.5 text-indigo-400/60 group-hover:text-indigo-400" />
          <span className="font-mono">
            {expanded ? 'Thinking' : 'Show thinking...'}
          </span>
        </button>
        <div className={cn(
          'pl-3 border-l-2 border-indigo-400/20 transition-all duration-200',
          expanded ? 'opacity-100 max-h-[2000px]' : 'opacity-0 max-h-0 overflow-hidden',
        )}>
          <p className="text-sm text-text-secondary/80 italic whitespace-pre-wrap leading-relaxed">
            {event.text}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3 pl-3 border-l-2 border-indigo-400/30">
      <Brain className="w-4 h-4 mt-0.5 text-indigo-400 shrink-0" />
      <p className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed">{event.text}</p>
    </div>
  )
}
