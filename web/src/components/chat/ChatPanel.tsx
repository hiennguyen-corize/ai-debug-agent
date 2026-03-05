import { useEffect, useRef, useMemo } from 'react'
import { useInvestigationStore } from '#stores/investigation-store'
import type { ChatMessage as ChatMessageType } from '#stores/investigation-store'
import { ChatMessage } from './ChatMessage'
import { SkeletonCard } from '#components/ui/Skeleton'
import { Bug, Sparkles, Search, Shield } from 'lucide-react'

function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-6 max-w-md px-4 animate-slide-up">
        <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center glass-card animate-glow">
          <Bug className="w-10 h-10 text-accent" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-text-primary font-mono">AI Debug Agent</h2>
          <p className="text-sm text-text-muted mt-2 leading-relaxed">
            Enter a URL to start investigating. The agent will analyze console errors,
            network issues, and DOM state to find the root cause.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            { icon: <Search className="w-5 h-5" />, label: 'Scout' },
            { icon: <Sparkles className="w-5 h-5" />, label: 'Analyze' },
            { icon: <Shield className="w-5 h-5" />, label: 'Report' },
          ].map((item) => (
            <div key={item.label} className="glass-card p-3 space-y-1.5">
              <div className="text-accent mx-auto w-fit">{item.icon}</div>
              <span className="text-xs text-text-muted font-medium">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// --- Group consecutive messages from the same agent ---

type MessageGroup = {
  agent: string | undefined
  messages: ChatMessageType[]
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

// --- Agent label display ---

const agentDisplayNames: Record<string, string> = {
  scout: '🔍 Scout',
  investigator: '🧠 Planner',
  explorer: '⚡ Executor',
  synthesis: '📋 Synthesis',
}

const agentColors: Record<string, string> = {
  scout: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/30',
  investigator: 'from-indigo-500/20 to-indigo-600/10 border-indigo-500/30',
  explorer: 'from-amber-500/20 to-amber-600/10 border-amber-500/30',
  synthesis: 'from-purple-500/20 to-purple-600/10 border-purple-500/30',
}

const agentTextColors: Record<string, string> = {
  scout: 'text-emerald-400',
  investigator: 'text-indigo-400',
  explorer: 'text-amber-400',
  synthesis: 'text-purple-400',
}

function AgentGroupHeader({ agent, count }: { agent: string; count: number }) {
  const displayName = agentDisplayNames[agent] ?? agent
  const colorClass = agentColors[agent] ?? 'from-gray-500/20 to-gray-600/10 border-gray-500/30'
  const textColor = agentTextColors[agent] ?? 'text-text-muted'

  return (
    <div className={`flex items-center gap-3 px-4 py-2 bg-gradient-to-r ${colorClass} border-l-2 rounded-r-lg`}>
      <span className={`text-xs font-bold uppercase tracking-widest font-mono ${textColor}`}>
        {displayName}
      </span>
      {count > 1 && (
        <span className="text-[10px] text-text-muted/60 font-mono">
          {count} steps
        </span>
      )}
    </div>
  )
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [active?.messages.length])

  if (!active) return <EmptyState />

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="space-y-1 py-2">
        {groups.map((group, gi) => (
          <div key={gi} className="space-y-0.5">
            {group.agent && (
              <AgentGroupHeader agent={group.agent} count={group.messages.length} />
            )}
            <div className="divide-y divide-border-subtle/10">
              {group.messages.map((msg) => (
                <ChatMessage key={msg.id} message={msg} hideAgent />
              ))}
            </div>
          </div>
        ))}
      </div>

      {active.status === 'running' && (
        <div className="px-4 py-4 space-y-3">
          <div className="max-w-[800px] mx-auto flex items-center gap-3">
            <span className="typing-dot w-2 h-2 bg-accent rounded-full" />
            <span className="typing-dot w-2 h-2 bg-accent rounded-full" />
            <span className="typing-dot w-2 h-2 bg-accent rounded-full" />
            <span className="text-sm text-text-muted ml-1">Agent is investigating...</span>
          </div>
          <div className="max-w-[800px] mx-auto">
            <SkeletonCard />
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}
