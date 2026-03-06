import type { ChatMessage as ChatMessageType } from '#stores/investigation-store'
import { CollapsibleSection } from '#components/composites/CollapsibleSection'
import { ChatMessage } from './ChatMessage'
import { cn } from '#lib/utils'

const agentConfig: Record<string, { label: string; color: string }> = {
  agent: { label: 'Agent', color: 'var(--color-agent)' },
  // backward compat — hydrated DB events may have old agent names
  orchestrator: { label: 'Agent', color: 'var(--color-agent)' },
  worker: { label: 'Agent', color: 'var(--color-agent)' },
  scout: { label: 'Agent', color: 'var(--color-agent)' },
  synthesis: { label: 'Agent', color: 'var(--color-agent)' },
  investigator: { label: 'Agent', color: 'var(--color-agent)' },
  explorer: { label: 'Agent', color: 'var(--color-agent)' },
  planner: { label: 'Agent', color: 'var(--color-agent)' },
  executor: { label: 'Agent', color: 'var(--color-agent)' },
}

export type MessageGroup = {
  agent: string | undefined
  messages: ChatMessageType[]
}

type AgentGroupProps = {
  group: MessageGroup
  isExpanded: boolean
  isActive: boolean
  onToggle: () => void
  startTime?: number
}

export function AgentGroup({ group, isExpanded, isActive, onToggle, startTime }: AgentGroupProps) {
  const cfg = group.agent ? agentConfig[group.agent] : null

  if (!cfg) {
    return (
      <div className="space-y-0.5 py-1">
        {group.messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} hideAgent startTime={startTime} />
        ))}
      </div>
    )
  }

  const stepCount = group.messages.filter(
    (m) => m.event?.type === 'tool_call' || m.event?.type === 'reasoning',
  ).length

  const header = (
    <div className="flex items-center gap-2 flex-1">
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
        {group.messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} hideAgent compact startTime={startTime} />
        ))}
      </div>
    </CollapsibleSection>
  )
}
