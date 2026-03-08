import { useState, useMemo } from 'react'
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

import { extractTextContent, parseSections } from './result-parser'

const SHORT_CONTENT_THRESHOLD = 120
const RESULT_PREVIEW_LEN = 500

// --- Components ---

function CodeBlock({ content }: { content: string }) {
  return (
    <pre className="text-[11px] font-mono bg-bg-tertiary rounded px-2 py-1.5 my-1 overflow-x-auto whitespace-pre-wrap break-all text-text-secondary leading-relaxed">
      {content}
    </pre>
  )
}

function CollapsibleSnapshot({ content }: { content: string }) {
  const [open, setOpen] = useState(false)
  const lineCount = content.split('\n').length

  return (
    <div className="my-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[11px] font-mono text-text-muted hover:text-text-secondary cursor-pointer"
      >
        <span>{open ? '▾' : '▸'}</span>
        <span>Page Snapshot</span>
        <span className="opacity-50">({lineCount} lines)</span>
      </button>
      {open && (
        <pre className="text-[10px] font-mono bg-bg-tertiary rounded px-2 py-1.5 mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-all text-text-muted leading-relaxed animate-fade-in">
          {content}
        </pre>
      )}
    </div>
  )
}

function TextLine({ content }: { content: string }) {
  // Format "- Key: Value" lines
  const formatted = content.replace(
    /^- (.+?): (.+)$/gm,
    (_, key: string, val: string) => `  ${key}: ${val}`,
  )
  return (
    <div className="text-[11px] font-mono text-text-muted pl-2 leading-relaxed whitespace-pre-wrap">
      {formatted}
    </div>
  )
}

function SectionHeader({ content }: { content: string }) {
  return (
    <div className="text-[11px] font-semibold text-text-secondary mt-1.5 mb-0.5">
      {content}
    </div>
  )
}

function StructuredResult({ text }: { text: string }) {
  const sections = useMemo(() => parseSections(text), [text])

  return (
    <div className="pl-4 mt-1 space-y-0.5">
      {sections.map((section, i) => {
        const key = `${section.type}-${i.toString()}`
        switch (section.type) {
          case 'header':
            return <SectionHeader key={key} content={section.content} />
          case 'code':
            return <CodeBlock key={key} content={section.content} />
          case 'snapshot':
            return <CollapsibleSnapshot key={key} content={section.content} />
          case 'text':
            return <TextLine key={key} content={section.content} />
        }
      })}
    </div>
  )
}

// --- Main ---

export function ToolResultEvent({ event }: { event: Extract<AgentEvent, { type: 'tool_result' }> }) {
  const [expanded, setExpanded] = useState(false)
  const rawText = event.result ?? ''
  const hasContent = rawText.length > 0
  const textContent = useMemo(() => hasContent ? extractTextContent(rawText) : '', [rawText, hasContent])
  const isStructured = textContent.includes('###') || textContent.includes('```')
  const isLong = textContent.length > SHORT_CONTENT_THRESHOLD

  return (
    <div className="py-0.5">
      <div className="flex items-center gap-2 text-xs font-mono">
        <span className={event.success ? 'text-success' : 'text-error'}>
          {event.success ? '✓' : '✗'}
        </span>
        <span className="text-text-muted">{event.tool}</span>
        <span className="text-text-muted opacity-60">{event.durationMs}ms</span>
        {hasContent && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-text-muted hover:text-text-secondary cursor-pointer"
          >
            {expanded ? '▾' : '▸'}
          </button>
        )}
      </div>
      {expanded && hasContent && (
        <div className="animate-fade-in">
          {isStructured ? (
            <StructuredResult text={textContent} />
          ) : (
            <pre className={cn(
              'text-[11px] text-text-muted font-mono mt-1 pl-4 whitespace-pre-wrap break-all leading-relaxed',
              'max-h-48 overflow-y-auto',
            )}>
              {isLong ? textContent.slice(0, RESULT_PREVIEW_LEN) + '…' : textContent}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
