import type { AgentEvent } from '#api/types'
import { MessageCircleQuestion } from 'lucide-react'
import { GlassCard } from '#components/ui/GlassCard'

export function QuestionEvent({ event }: { event: Extract<AgentEvent, { type: 'user_question' }> }) {
  return (
    <GlassCard padding="sm" className="border-accent/20">
      <div className="flex gap-3">
        <MessageCircleQuestion className="w-5 h-5 text-accent shrink-0 mt-0.5" />
        <div className="space-y-2 flex-1">
          <p className="text-sm text-text-primary font-medium">{event.question}</p>
          {/* TODO: Add input for interactive mode answers */}
        </div>
      </div>
    </GlassCard>
  )
}
