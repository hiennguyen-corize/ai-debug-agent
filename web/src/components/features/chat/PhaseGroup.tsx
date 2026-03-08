import type { ChatMessage as ChatMessageType } from '#stores/investigation-store'
import { CollapsibleSection } from '#components/composites/CollapsibleSection'
import { ChatMessage } from './ChatMessage'
import { cn } from '#lib/utils'

const phaseConfig: Record<string, { emoji: string; label: string; color: string }> = {
  scouting:        { emoji: '🔍', label: 'Scouting',        color: 'var(--color-agent)' },
  investigating:   { emoji: '🐛', label: 'Investigating',   color: '#f59e0b' },
  source_analysis: { emoji: '📖', label: 'Source Analysis', color: '#06b6d4' },
  reflecting:      { emoji: '🤔', label: 'Reflecting',      color: '#a78bfa' },
  synthesizing:    { emoji: '✅', label: 'Synthesizing',     color: '#10b981' },
}

export type PhaseGroupData = {
  phase: string | null
  messages: ChatMessageType[]
}

type PhaseGroupProps = {
  group: PhaseGroupData
  isExpanded: boolean
  isActive: boolean
  onToggle: () => void
  startTime?: number
}

export function PhaseGroup({ group, isExpanded, isActive, onToggle, startTime }: PhaseGroupProps) {
  const cfg = group.phase ? phaseConfig[group.phase] : null

  // Non-phase messages (user/system) — render flat
  if (!cfg) {
    return (
      <div className="space-y-0.5 py-1">
        {group.messages.map((msg, i) => (
          <ChatMessage key={msg.id} message={msg} hideAgent startTime={startTime} isLast={i === group.messages.length - 1} isLive={isActive} />
        ))}
      </div>
    )
  }

  const stepCount = group.messages.filter(
    (m) => m.event?.type === 'tool_call' || m.event?.type === 'reasoning',
  ).length

  const header = (
    <div className="flex items-center gap-2 flex-1">
      <span className="text-sm select-none">{cfg.emoji}</span>
      <span className={cn('text-xs font-semibold uppercase tracking-widest font-mono')} style={{ color: cfg.color }}>
        {cfg.label}
      </span>
      {!isExpanded && stepCount > 0 && (
        <span className="text-[11px] text-text-muted font-mono">
          {stepCount} step{stepCount !== 1 ? 's' : ''}
        </span>
      )}
      {isActive && (
        <span className="w-1.5 h-1.5 rounded-full animate-pulse ml-1" style={{ backgroundColor: cfg.color }} />
      )}
    </div>
  )

  return (
    <CollapsibleSection
      header={header}
      expanded={isExpanded}
      onToggle={onToggle}
      borderColor={cfg.color}
    >
      <div className="pl-4 border-l border-border-subtle ml-[1px]">
        {group.messages.map((msg, i) => (
          <ChatMessage key={msg.id} message={msg} hideAgent compact startTime={startTime} isLast={i === group.messages.length - 1} isLive={isActive} />
        ))}
      </div>
    </CollapsibleSection>
  )
}
