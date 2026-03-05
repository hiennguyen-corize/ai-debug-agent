import { useInvestigationStore } from '#stores/investigation-store'
import { ProgressStepper } from '#components/composites'
import { StatusDot } from '#components/primitives'

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

  const elapsed = active.status === 'done' || active.status === 'running'
    ? Math.round((Date.now() - active.createdAt) / 1000)
    : null

  const formatTime = (s: number) => s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`

  return (
    <header className="h-10 border-b border-border bg-bg-secondary flex items-center px-4 gap-4 text-xs">
      <span className="font-mono text-text-primary font-medium truncate max-w-xs">{label}</span>
      <StatusDot
        status={active.status === 'running' ? 'running' : active.status === 'done' ? 'done' : active.status === 'error' ? 'error' : 'pending'}
      />
      <div className="ml-auto flex items-center gap-4">
        <ProgressStepper
          currentPhase={currentPhase && 'phase' in currentPhase ? currentPhase.phase : null}
        />
        {elapsed !== null && (
          <span className="text-text-muted font-mono">{formatTime(elapsed)}</span>
        )}
      </div>
    </header>
  )
}
