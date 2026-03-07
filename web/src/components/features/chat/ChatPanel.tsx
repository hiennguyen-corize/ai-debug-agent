import { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import { useInvestigationStore } from '#stores/investigation-store'
import type { ChatMessage as ChatMessageType } from '#stores/investigation-store'
import { SkeletonCard, Button } from '#components/primitives'
import { PhaseGroup, type PhaseGroupData } from './PhaseGroup'
import { ChatMessage } from './ChatMessage'
import { ReportPanel } from './ReportPanel'

function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-6 max-w-md px-4 animate-fade-in">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-text-primary font-mono">Debug Agent</h2>
          <p className="text-sm text-text-muted leading-relaxed">
            Enter a URL to start investigating. The agent will analyze console errors,
            network issues, and DOM state to find the root cause.
          </p>
        </div>

        <div className="flex justify-center gap-6 text-xs text-text-muted font-mono">
          <span>Navigate</span>
          <span>→</span>
          <span>Investigate</span>
          <span>→</span>
          <span>Report</span>
        </div>

        <div className="space-y-2">
          <p className="text-[10px] text-text-muted uppercase tracking-widest font-mono">Try an example</p>
          <div className="flex flex-wrap gap-2 justify-center">
            <ExampleChip label="crashed-website.pages.dev" />
          </div>
        </div>

        <p className="text-[10px] text-text-muted font-mono">
          Paste a URL above and press Enter to start
        </p>
      </div>
    </div>
  )
}

function ExampleChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono bg-bg-tertiary text-text-secondary border border-border hover:border-accent-primary/30 transition-colors cursor-default select-all">
      {label}
    </span>
  )
}

function InteractiveInput({ investigationId }: { investigationId: string }) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const sendMessage = useInvestigationStore((s) => s.sendMessage)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSend = useCallback(async () => {
    const trimmed = message.trim()
    if (!trimmed || sending) return
    setSending(true)
    await sendMessage(investigationId, trimmed)
    setMessage('')
    setSending(false)
  }, [message, sending, investigationId, sendMessage])

  return (
    <div className="py-3 px-4 mx-auto max-w-3xl animate-fade-in">
      <div className="rounded-md border border-accent-primary/30 bg-bg-tertiary p-3">
        <p className="text-xs text-accent-primary font-mono mb-2">⏸️ Agent is waiting for your guidance</p>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            placeholder="Tell the agent what to investigate next..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            className="flex-1 bg-transparent text-sm text-text-primary px-2 py-1.5 border border-border rounded placeholder:text-text-muted focus:outline-none focus:border-accent-primary"
          />
          <Button onClick={handleSend} disabled={!message.trim() || sending} size="sm">
            {sending ? '…' : 'Send'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function groupByPhase(messages: ChatMessageType[]): PhaseGroupData[] {
  const groups: PhaseGroupData[] = []
  let current: PhaseGroupData = { phase: null, messages: [] }

  for (const msg of messages) {
    // Phase event starts a new group
    if (msg.event?.type === 'investigation_phase') {
      if (current.messages.length > 0) groups.push(current)
      const phase = (msg.event as { phase: string }).phase
      current = { phase, messages: [msg] }
    } else {
      current.messages.push(msg)
    }
  }
  if (current.messages.length > 0) groups.push(current)

  return groups
}

export function ChatPanel() {
  const active = useInvestigationStore((s) => {
    const inv = s.investigations.find((i) => i.id === s.activeId)
    return inv ?? null
  })
  const bottomRef = useRef<HTMLDivElement>(null)

  const groups = useMemo(
    () => (active ? groupByPhase(active.messages) : []),
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
          group.phase ? (
            <PhaseGroup
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

        {active.status === 'queued' && (
          <div className="py-4 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <span className="text-amber-400 animate-pulse">⏳</span>
              <span className="text-sm text-amber-400 font-mono">Queued — waiting for current investigation to finish</span>
            </div>
          </div>
        )}

        {active.status === 'running' && !active.isWaitingForInput && (
          <div className="py-4">
            <SkeletonCard />
          </div>
        )}

        {active.isWaitingForInput && (
          <InteractiveInput investigationId={active.id} />
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

