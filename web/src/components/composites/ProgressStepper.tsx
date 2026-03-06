import { cn } from '#lib/utils'

type ProgressStepperProps = {
  currentPhase: string | null
  className?: string
}

const phases = [
  { id: 'scouting', label: 'Scout' },
  { id: 'investigating', label: 'Plan' },
  { id: 'source_analysis', label: 'Execute' },
  { id: 'reflecting', label: 'Reflect' },
  { id: 'synthesizing', label: 'Report' },
]

export function ProgressStepper({ currentPhase, className }: ProgressStepperProps) {
  const currentIndex = phases.findIndex((p) => p.id === currentPhase)

  return (
    <div className={cn('flex items-center gap-1 text-xs font-mono', className)}>
      {phases.map((phase, i) => {
        const isComplete = i < currentIndex
        const isCurrent = i === currentIndex

        return (
          <span key={phase.id} className="flex items-center gap-1">
            {i > 0 && <span className="text-text-muted">→</span>}
            <span className={cn(
              isComplete && 'text-success',
              isCurrent && 'text-text-primary font-semibold',
              !isComplete && !isCurrent && 'text-text-muted',
            )}>
              {isComplete ? '✓' : ''} {phase.label}
            </span>
          </span>
        )
      })}
    </div>
  )
}
