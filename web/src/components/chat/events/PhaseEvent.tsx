import type { AgentEvent } from '#api/types'
import { Search, Brain, FileCode, Lightbulb, Sparkles } from 'lucide-react'
import { cn } from '#lib/utils'

const phaseConfig: Record<string, { icon: React.JSX.Element; color: string }> = {
  scouting: { icon: <Search className="w-4 h-4" />, color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' },
  hypothesizing: { icon: <Brain className="w-4 h-4" />, color: 'text-indigo-400 bg-indigo-400/10 border-indigo-400/20' },
  investigating: { icon: <FileCode className="w-4 h-4" />, color: 'text-amber-400 bg-amber-400/10 border-amber-400/20' },
  source_analysis: { icon: <FileCode className="w-4 h-4" />, color: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20' },
  synthesizing: { icon: <Sparkles className="w-4 h-4" />, color: 'text-purple-400 bg-purple-400/10 border-purple-400/20' },
}

export function PhaseEvent({ event }: { event: Extract<AgentEvent, { type: 'investigation_phase' }> }) {
  const config = phaseConfig[event.phase] ?? {
    icon: <Lightbulb className="w-4 h-4" />,
    color: 'text-text-muted bg-bg-tertiary border-border-subtle',
  }

  return (
    <div className={cn(
      'flex items-center gap-2.5 px-4 py-2 rounded-lg border text-sm font-semibold uppercase tracking-wider',
      config.color,
    )}>
      {config.icon}
      {event.phase.replace('_', ' ')}
    </div>
  )
}
