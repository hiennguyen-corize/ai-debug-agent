import { useState, useEffect } from 'react'
import type { AgentEvent } from '#api/types'
import type { ChatMessage as ChatMessageType } from '#stores/investigation-store'
import { cn, formatElapsed } from '#lib/utils'

// Event components
import { PhaseEvent } from './events/PhaseEvent'
import { ReasoningEvent } from './events/ReasoningEvent'
import { ToolCallEvent, ToolResultEvent } from './events/ToolCallEvent'
import { ErrorEvent } from './events/ErrorEvent'
import { SourceMapResolvedEvent, SourceMapFailedEvent } from './events/SourceMapEvent'
import { ScreenshotEvent } from './events/ScreenshotEvent'
import { LlmUsageEvent } from './events/LlmUsageEvent'
import { WaitingForInputEvent } from './events/WaitingForInputEvent'
import { QueuedEvent } from './events/QueuedEvent'
import { ArtifactEvent } from './events/ArtifactEvent'

function EventRouter({ event }: { event: AgentEvent }) {
  switch (event.type) {
    case 'investigation_phase': return <PhaseEvent event={event} />
    case 'reasoning': return <ReasoningEvent event={event} />
    case 'tool_call': return <ToolCallEvent event={event} />
    case 'tool_result': return <ToolResultEvent event={event} />
    case 'error': return <ErrorEvent event={event} />
    case 'sourcemap_resolved': return <SourceMapResolvedEvent event={event} />
    case 'sourcemap_failed': return <SourceMapFailedEvent event={event} />
    case 'screenshot_captured': return <ScreenshotEvent event={event} />
    case 'llm_usage': return <LlmUsageEvent event={event} />
    case 'waiting_for_input': return <WaitingForInputEvent event={event} />
    case 'investigation_queued': return <QueuedEvent event={event} />
    case 'artifact_captured': return <ArtifactEvent event={event} />
    default: return null
  }
}

function ElapsedBadge({ startTime, timestamp, live }: { startTime: number; timestamp: number; live?: boolean }) {
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    if (!live) return
    const id = setInterval(() => { setNow(Date.now()) }, 1000)
    return () => clearInterval(id)
  }, [live])

  const display = live
    ? formatElapsed(now, startTime)
    : formatElapsed(timestamp, startTime)

  return (
    <span className={cn(
      'text-[10px] font-mono tabular-nums select-none shrink-0',
      live ? 'text-accent animate-pulse' : 'text-text-muted opacity-60',
    )}>
      {display}
    </span>
  )
}

type ChatMessageProps = {
  message: ChatMessageType
  hideAgent?: boolean | undefined
  compact?: boolean | undefined
  startTime?: number | undefined
  isLast?: boolean | undefined
  isLive?: boolean | undefined
}

export function ChatMessage({ message, hideAgent, compact, startTime, isLast, isLive }: ChatMessageProps) {
  const showElapsed = startTime != null && message.timestamp > 0
  const live = isLast === true && isLive === true

  if (message.event) {
    return (
      <div className={cn('flex items-start gap-2', 'py-1', compact ? 'px-2' : 'px-3')}>
        {showElapsed && <ElapsedBadge timestamp={message.timestamp} startTime={startTime} live={live} />}
        <div className="flex-1 min-w-0">
          <EventRouter event={message.event as AgentEvent} />
        </div>
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
      <div className="flex items-center gap-2">
        {showElapsed && <ElapsedBadge timestamp={message.timestamp} startTime={startTime} live={live} />}
        {!hideAgent && (
          <span className="text-[10px] uppercase tracking-widest font-mono text-text-muted">
            {message.role}
          </span>
        )}
      </div>
      <div className={cn('text-sm text-text-primary leading-relaxed whitespace-pre-wrap', showElapsed && 'pl-[3.5rem]')}>
        {message.content}
      </div>
    </div>
  )
}

