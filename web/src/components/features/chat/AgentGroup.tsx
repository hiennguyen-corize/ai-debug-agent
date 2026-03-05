import type { ChatMessage as ChatMessageType } from '#stores/investigation-store'
import { CollapsibleSection } from '#components/composites/CollapsibleSection'
import { ChatMessage } from './ChatMessage'
import { cn } from '#lib/utils'

const agentConfig: Record<string, { label: string; border: string; text: string }> = {
  scout:        { label: 'Scout',    border: 'border-scout',    text: 'text-scout' },
  investigator: { label: 'Planner',  border: 'border-planner',  text: 'text-planner' },
  explorer:     { label: 'Executor', border: 'border-executor', text: 'text-executor' },
  synthesis:    { label: 'Report',   border: 'border-report',   text: 'text-report' },
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
}

export function AgentGroup({ group, isExpanded, isActive, onToggle }: AgentGroupProps) {
  const cfg = group.agent ? agentConfig[group.agent] : null

  if (!cfg) {
    return (
      <div className="space-y-0.5 py-1">
        {group.messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} hideAgent />
        ))}
      </div>
    )
  }

  const stepCount = group.messages.filter(
    (m) => m.event?.type === 'tool_call' || m.event?.type === 'reasoning',
  ).length

  const header = (
    <div className="flex items-center gap-2 flex-1">
      <span className={cn('text-xs font-semibold uppercase tracking-widest font-mono', cfg.text)}>
        {cfg.label}
      </span>
      {!isExpanded && stepCount > 0 && (
        <span className="text-[11px] text-text-muted font-mono">
          {stepCount} step{stepCount !== 1 ? 's' : ''}
        </span>
      )}
      {isActive && (
        <span className="w-1.5 h-1.5 rounded-full bg-executor animate-pulse ml-1" />
      )}
    </div>
  )

  return (
    <CollapsibleSection
      header={header}
      expanded={isExpanded}
      onToggle={onToggle}
      borderColor={cfg.border}
    >
      <div className="pl-4 border-l border-border-subtle ml-[1px]">
        {group.messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} hideAgent compact />
        ))}
      </div>
    </CollapsibleSection>
  )
}
