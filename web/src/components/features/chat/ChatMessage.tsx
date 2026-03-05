import type { AgentEvent } from '#api/types'
import type { ChatMessage as ChatMessageType } from '#stores/investigation-store'
import { cn } from '#lib/utils'

// Event components
import { PhaseEvent } from './events/PhaseEvent'
import { ReasoningEvent } from './events/ReasoningEvent'
import { ToolCallEvent, ToolResultEvent } from './events/ToolCallEvent'
import { HypothesisCreatedEvent } from './events/HypothesisEvent'
import { ErrorEvent } from './events/ErrorEvent'
import { SourceMapResolvedEvent, SourceMapFailedEvent } from './events/SourceMapEvent'
import { QuestionEvent } from './events/QuestionEvent'
import { ScreenshotEvent } from './events/ScreenshotEvent'
import { LlmUsageEvent } from './events/LlmUsageEvent'

function EventRouter({ event }: { event: AgentEvent }) {
  switch (event.type) {
    case 'investigation_phase': return <PhaseEvent event={event} />
    case 'reasoning': return <ReasoningEvent event={event} />
    case 'tool_call': return <ToolCallEvent event={event} />
    case 'tool_result': return <ToolResultEvent event={event} />
    case 'hypothesis_created': return <HypothesisCreatedEvent event={event} />
    case 'error': return <ErrorEvent event={event} />
    case 'sourcemap_resolved': return <SourceMapResolvedEvent event={event} />
    case 'sourcemap_failed': return <SourceMapFailedEvent event={event} />
    case 'user_question': return <QuestionEvent event={event} />
    case 'screenshot_captured': return <ScreenshotEvent event={event} />
    case 'llm_usage': return <LlmUsageEvent event={event} />
    default: return null
  }
}

type ChatMessageProps = {
  message: ChatMessageType
  hideAgent?: boolean
  compact?: boolean
}

export function ChatMessage({ message, hideAgent, compact }: ChatMessageProps) {
  if (message.event) {
    return (
      <div className={cn('py-1', compact ? 'px-2' : 'px-3')}>
        <EventRouter event={message.event as AgentEvent} />
      </div>
    )
  }

  // Text messages (user / system)
  return (
    <div className={cn(
      'py-2',
      compact ? 'px-2' : 'px-4',
      message.role === 'user' && 'bg-bg-secondary border-b border-border-subtle',
    )}>
      {!hideAgent && (
        <span className="text-[10px] uppercase tracking-widest font-mono text-text-muted mr-2">
          {message.role}
        </span>
      )}
      <div className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
        {message.content}
      </div>
    </div>
  )
}
