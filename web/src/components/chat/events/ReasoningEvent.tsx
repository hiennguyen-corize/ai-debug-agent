import type { AgentEvent } from '#api/types'
import { Brain, FileText } from 'lucide-react'
import { MarkdownRenderer } from '../MarkdownRenderer'

const MARKDOWN_THRESHOLD = 100

function isMarkdownContent(text: string): boolean {
  return text.length > MARKDOWN_THRESHOLD && (
    text.includes('```') || text.includes('## ') || text.includes('**')
  )
}

export function ReasoningEvent({ event }: { event: Extract<AgentEvent, { type: 'reasoning' }> }) {
  const isReport = isMarkdownContent(event.text)

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

  return (
    <div className="flex gap-3 pl-3 border-l-2 border-indigo-400/30">
      <Brain className="w-4 h-4 mt-0.5 text-indigo-400 shrink-0" />
      <p className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed">{event.text}</p>
    </div>
  )
}
