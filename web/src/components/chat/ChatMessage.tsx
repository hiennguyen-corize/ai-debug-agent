import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import type { ChatMessage as ChatMessageType } from '#stores/investigation-store'
import { cn } from '#lib/utils'

import { PhaseEvent } from './events/PhaseEvent'
import { ReasoningEvent } from './events/ReasoningEvent'
import { ToolCallEvent, ToolResultEvent } from './events/ToolCallEvent'
import { HypothesisCreatedEvent, HypothesisUpdatedEvent } from './events/HypothesisEvent'
import { ErrorEvent } from './events/ErrorEvent'
import { SourceMapResolvedEvent, SourceMapFailedEvent } from './events/SourceMapEvent'
import { QuestionEvent } from './events/QuestionEvent'

const agentColors: Record<string, string> = {
  scout: 'text-emerald-400',
  investigator: 'text-indigo-400',
  explorer: 'text-amber-400',
  synthesis: 'text-purple-400',
}

function EventRouter({ event }: { event: ChatMessageType['event'] }) {
  if (!event) return null

  switch (event.type) {
    case 'investigation_phase':
      return <PhaseEvent event={event} />
    case 'reasoning':
      return <ReasoningEvent event={event} />
    case 'tool_call':
      return <ToolCallEvent event={event} />
    case 'tool_result':
      return <ToolResultEvent event={event} />
    case 'hypothesis_created':
      return <HypothesisCreatedEvent event={event} />
    case 'hypothesis_updated':
      return <HypothesisUpdatedEvent event={event} />
    case 'error':
      return <ErrorEvent event={event} />
    case 'sourcemap_resolved':
      return <SourceMapResolvedEvent event={event} />
    case 'sourcemap_failed':
      return <SourceMapFailedEvent event={event} />
    case 'user_question':
      return <QuestionEvent event={event} />
    default:
      return <p className="text-sm text-text-muted font-mono">{JSON.stringify(event)}</p>
  }
}

export function ChatMessage({ message }: { message: ChatMessageType }) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  const markdownComponents = useMemo(() => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    code({ className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || '')
      return match ? (
        <SyntaxHighlighter
          style={oneDark}
          language={match[1]}
          PreTag="div"
          customStyle={{
            borderRadius: '8px',
            fontSize: '13px',
            margin: '8px 0',
            fontFamily: 'var(--font-mono)',
            background: 'rgba(255,255,255,0.03)',
          }}
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      ) : (
        <code className="bg-bg-tertiary/60 px-1.5 py-0.5 rounded text-xs font-mono" {...props}>
          {children}
        </code>
      )
    },
  }), [])

  return (
    <div className={cn(
      'animate-fade-in px-4 py-3',
      isUser && 'bg-bg-secondary/50',
    )}>
      <div className="max-w-[800px] mx-auto">
        {message.agent && (
          <span className={cn(
            'text-xs font-semibold uppercase tracking-wider mb-1.5 block font-mono',
            agentColors[message.agent] ?? 'text-text-muted',
          )}>
            {message.agent}
          </span>
        )}

        {message.event ? (
          <EventRouter event={message.event} />
        ) : (
          <div className={cn(
            'text-sm leading-relaxed',
            isSystem && 'text-text-secondary italic',
          )}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  )
}
