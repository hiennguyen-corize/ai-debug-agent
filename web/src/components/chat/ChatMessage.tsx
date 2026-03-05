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
    case 'llm_usage':
      return <LlmUsageEvent event={event} />
    default:
      return null
  }
}

export function ChatMessage({ message }: { message: ChatMessageType }) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

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
            <MarkdownRenderer content={message.content} />
          </div>
        )}
      </div>
    </div>
  )
}
