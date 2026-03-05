import type { ChatMessage as ChatMessageType } from '#stores/investigation-store'
import { cn } from '#lib/utils'
import { MarkdownRenderer } from './MarkdownRenderer'

import { PhaseEvent } from './events/PhaseEvent'
import { ReasoningEvent } from './events/ReasoningEvent'
import { ToolCallEvent, ToolResultEvent } from './events/ToolCallEvent'
import { HypothesisCreatedEvent, HypothesisUpdatedEvent } from './events/HypothesisEvent'
import { ErrorEvent } from './events/ErrorEvent'
import { SourceMapResolvedEvent, SourceMapFailedEvent } from './events/SourceMapEvent'
import { QuestionEvent } from './events/QuestionEvent'
import { LlmUsageEvent } from './events/LlmUsageEvent'

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
    case 'llm_usage':
      return <LlmUsageEvent event={event} />
    default:
      return null
  }
}

type ChatMessageProps = {
  message: ChatMessageType
  hideAgent?: boolean
}

export function ChatMessage({ message, hideAgent }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  return (
    <div className={cn(
      'animate-fade-in px-4 py-2',
      isUser && 'bg-bg-secondary/50 py-3',
    )}>
      <div className="max-w-[800px] mx-auto">
        {!hideAgent && message.agent && (
          <span className="text-xs font-semibold uppercase tracking-wider mb-1.5 block font-mono text-text-muted">
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
            <MarkdownRenderer content={message.content} />
          </div>
        )}
      </div>
    </div>
  )
}
