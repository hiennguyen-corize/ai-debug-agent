import { cn } from '#lib/utils'

interface ProgressBarProps {
  currentPhase: string | null
  className?: string
}

const phases = [
  { id: 'scouting', label: 'Scout', icon: '🔍' },
  { id: 'hypothesizing', label: 'Hypothesize', icon: '💡' },
  { id: 'investigating', label: 'Investigate', icon: '🔬' },
  { id: 'source_analysis', label: 'Source', icon: '📄' },
  { id: 'synthesizing', label: 'Synthesize', icon: '✨' },
]

export function ProgressBar({ currentPhase, className }: ProgressBarProps) {
  const currentIndex = phases.findIndex((p) => p.id === currentPhase)

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {phases.map((phase, i) => {
        const isComplete = i < currentIndex
        const isCurrent = i === currentIndex
        const isPending = i > currentIndex

        return (
          <div key={phase.id} className="flex items-center gap-1">
            {i > 0 && (
              <div
                className={cn(
                  'w-6 h-0.5 rounded-full transition-colors duration-300',
                  isComplete ? 'bg-cta' : 'bg-border-subtle',
                )}
              />
            )}
            <div
              className={cn(
                'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-all duration-300',
                isComplete && 'text-cta',
                isCurrent && 'text-accent bg-accent/10',
                isPending && 'text-text-muted',
              )}
              title={phase.label}
            >
              <span className={cn(
                'w-5 h-5 rounded-full flex items-center justify-center text-[10px]',
                isComplete && 'bg-cta/20',
                isCurrent && 'bg-accent/20 animate-pulse',
                isPending && 'bg-bg-tertiary',
              )}>
                {isComplete ? '✓' : i + 1}
              </span>
              <span className="hidden lg:inline">{phase.label}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
