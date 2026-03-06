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

// --- Result parsing ---

type ParsedSection = {
  type: 'header' | 'code' | 'text' | 'snapshot'
  title?: string
  language?: string
  content: string
}

const extractTextContent = (raw: string): string => {
  // Playwright MCP returns [{"type":"text","text":"..."}]
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item): item is { type: string; text: string } =>
          typeof item === 'object' && item !== null && 'text' in item)
        .map((item) => item.text)
        .join('\n')
    }
  } catch {
    // not JSON, use as-is
  }
  return raw
}

const parseSections = (text: string): ParsedSection[] => {
  const sections: ParsedSection[] = []
  const lines = text.split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]!

    // ### Header
    if (line.startsWith('### ')) {
      sections.push({ type: 'header', content: line.slice(4) })
      i++
      continue
    }

    // ```code block```
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const isSnapshot = lang === 'yaml' || lang === 'accessibilitytree'
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i]!.startsWith('```')) {
        codeLines.push(lines[i]!)
        i++
      }
      i++ // skip closing ```
      sections.push({
        type: isSnapshot ? 'snapshot' : 'code',
        language: lang || undefined,
        title: isSnapshot ? 'Page Snapshot' : undefined,
        content: codeLines.join('\n'),
      })
      continue
    }

    // Regular text line (skip empty)
    if (line.trim().length > 0) {
      // Collect consecutive text lines
      const textLines: string[] = [line]
      i++
      while (i < lines.length && !lines[i]!.startsWith('###') && !lines[i]!.startsWith('```') && lines[i]!.trim().length > 0) {
        textLines.push(lines[i]!)
        i++
      }
      sections.push({ type: 'text', content: textLines.join('\n') })
      continue
    }

    i++
  }

  return sections
}

// --- Components ---

function CodeBlock({ language, content }: { language?: string; content: string }) {
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
        switch (section.type) {
          case 'header':
            return <SectionHeader key={i} content={section.content} />
          case 'code':
            return <CodeBlock key={i} language={section.language} content={section.content} />
          case 'snapshot':
            return <CollapsibleSnapshot key={i} content={section.content} />
          case 'text':
            return <TextLine key={i} content={section.content} />
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
  const isLong = textContent.length > 120

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
              {isLong ? textContent.slice(0, 500) + '…' : textContent}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
