import type { AgentEvent } from '#api/types'

export function QuestionEvent({ event }: { event: Extract<AgentEvent, { type: 'user_question' }> }) {
  return (
    <div className="py-2 pl-4 border-l-2 border-info">
      <span className="text-[10px] uppercase tracking-widest font-mono text-info font-semibold">
        Question
      </span>
      <p className="text-sm text-text-primary mt-1 leading-relaxed">{event.question}</p>
    </div>
  )
}
