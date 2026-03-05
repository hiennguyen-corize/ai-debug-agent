import { useInvestigationStore } from '#stores/investigation-store'
import { ProgressBar } from '#components/investigation/ProgressBar'
import { StatusDot } from '#components/ui/StatusDot'
import { Bug } from 'lucide-react'

export function Header() {
  const active = useInvestigationStore((s) => {
    const inv = s.investigations.find((i) => i.id === s.activeId)
    return inv ?? null
  })

  if (!active) return null

  let label = active.url
  try {
    const u = new URL(active.url)
    label = u.hostname + (u.pathname !== '/' ? u.pathname : '')
  } catch { /* keep raw url */ }

  const currentPhase = active.messages
    .filter((m) => m.event?.type === 'investigation_phase')
    .at(-1)?.event

  return (
    <header className="h-12 border-b border-border-subtle bg-bg-secondary/80 backdrop-blur-sm flex items-center px-4 gap-3">
      <Bug className="w-4 h-4 text-accent" />
      <span className="text-sm font-medium text-text-primary truncate max-w-xs">{label}</span>
      <StatusDot
        status={active.status === 'running' ? 'running' : active.status === 'done' ? 'done' : active.status === 'error' ? 'error' : 'pending'}
      />
      <div className="ml-auto">
        <ProgressBar
          currentPhase={currentPhase && 'phase' in currentPhase ? currentPhase.phase : null}
        />
      </div>
    </header>
  )
}
