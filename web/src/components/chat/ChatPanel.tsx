import { useEffect, useRef } from 'react'
import { useInvestigationStore } from '#stores/investigation-store'
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

export function ChatPanel() {
  const active = useInvestigationStore((s) => {
    const inv = s.investigations.find((i) => i.id === s.activeId)
    return inv ?? null
  })
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [active?.messages.length])

  if (!active) return <EmptyState />

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="divide-y divide-border-subtle/20">
        {active.messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
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
