import { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import { useInvestigationStore } from '#stores/investigation-store'
import type { ChatMessage as ChatMessageType } from '#stores/investigation-store'
import { SkeletonCard } from '#components/primitives'
import { AgentGroup, type MessageGroup } from './AgentGroup'
import { ChatMessage } from './ChatMessage'
import { ReportPanel } from './ReportPanel'

function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-4 max-w-sm px-4 animate-fade-in">
        <h2 className="text-lg font-semibold text-text-primary font-mono">Debug Agent</h2>
        <p className="text-sm text-text-muted leading-relaxed">
          Enter a URL to start investigating. The agent will analyze console errors,
          network issues, and DOM state to find the root cause.
        </p>
        <div className="flex justify-center gap-6 text-xs text-text-muted font-mono">
          <span>Navigate</span>
          <span>→</span>
          <span>Investigate</span>
          <span>→</span>
          <span>Report</span>
        </div>
      </div>
    </div>
  )
}

function groupMessages(messages: ChatMessageType[]): MessageGroup[] {
  const groups: MessageGroup[] = []
  let current: MessageGroup | null = null

  for (const msg of messages) {
    if (current !== null && current.agent === msg.agent) {
      current.messages.push(msg)
    } else {
      current = { agent: msg.agent, messages: [msg] }
      groups.push(current)
    }
  }

  return groups
}

export function ChatPanel() {
  const active = useInvestigationStore((s) => {
    const inv = s.investigations.find((i) => i.id === s.activeId)
    return inv ?? null
  })
  const bottomRef = useRef<HTMLDivElement>(null)

  const groups = useMemo(
    () => (active ? groupMessages(active.messages) : []),
    [active?.messages.length],
  )

  const [manualExpanded, setManualExpanded] = useState<Set<number>>(new Set())
  const lastGroupIndex = groups.length - 1

  useEffect(() => {
    setManualExpanded(new Set())
  }, [groups.length])

  const isExpanded = useCallback((i: number) => {
    if (manualExpanded.has(i)) return true
    return i === lastGroupIndex && !manualExpanded.has(-i - 1)
  }, [groups, lastGroupIndex, manualExpanded])

  const onToggle = useCallback((i: number) => {
    setManualExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(i)) {
        next.delete(i)
        next.add(-i - 1)
      } else {
        next.add(i)
        next.delete(-i - 1)
      }
      return next
    })
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [active?.messages.length])

  if (!active) return <EmptyState />

  return (
    <div className="flex-1 overflow-y-auto bg-bg-primary">
      <div className="max-w-3xl mx-auto py-4 px-4 space-y-1">
        {groups.map((group, gi) => (
          group.agent ? (
            <AgentGroup
              key={gi}
              group={group}
              isExpanded={isExpanded(gi)}
              isActive={gi === lastGroupIndex && active.status === 'running'}
              onToggle={() => onToggle(gi)}
              startTime={active.createdAt}
            />
          ) : (
            <div key={gi}>
              {group.messages.map((msg) => (
                <ChatMessage key={msg.id} message={msg} hideAgent startTime={active.createdAt} />
              ))}
            </div>
          )
        ))}

        {active.status === 'running' && (
          <div className="py-4">
            <SkeletonCard />
          </div>
        )}

        {active.status === 'done' && active.report && (
          <div className="py-4">
            <ReportPanel report={active.report} />
          </div>
        )}
      </div>

      <div ref={bottomRef} />
    </div>
  )
}
