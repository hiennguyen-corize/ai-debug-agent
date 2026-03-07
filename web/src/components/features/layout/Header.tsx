import { useState, useEffect } from 'react'
import { useInvestigationStore } from '#stores/investigation-store'
import { ProgressStepper } from '#components/composites'
import { StatusDot } from '#components/primitives'

const formatTime = (s: number): string => {
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  if (s >= 60) return `${Math.floor(s / 60)}m ${(s % 60).toString().padStart(2, '0')}s`
  return `${s}s`
}

export function Header() {
  const active = useInvestigationStore((s) => {
    const inv = s.investigations.find((i) => i.id === s.activeId)
    return inv ?? null
  })

  const isLive = active?.status === 'running' || active?.status === 'queued'
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!isLive) return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [isLive])

  // Reset tick when active investigation changes
  useEffect(() => { setTick(0) }, [active?.id])

  if (!active) return null

  let label = active.url
  try {
    const u = new URL(active.url)
    label = u.hostname + (u.pathname !== '/' ? u.pathname : '')
  } catch { /* keep raw url */ }

  const currentPhase = active.messages
    .filter((m) => m.event?.type === 'investigation_phase')
    .at(-1)?.event

  // Suppress unused var — tick forces re-render for live updates
  void tick
  const showElapsed = active.status === 'done' || isLive
  const elapsed = showElapsed ? Math.round((Date.now() - active.createdAt) / 1000) : null

  return (
    <header className="h-10 border-b border-border bg-bg-secondary flex items-center px-4 gap-4 text-xs">
      <span className="font-mono text-text-primary font-medium truncate max-w-xs">{label}</span>
      <StatusDot
        status={active.status}
      />
      <div className="ml-auto flex items-center gap-4">
        <ProgressStepper
          currentPhase={currentPhase && 'phase' in currentPhase ? currentPhase.phase : null}
        />
        {elapsed !== null && (
          <span className="text-text-muted font-mono tabular-nums">
            {isLive && <span className="text-worker animate-pulse mr-1">●</span>}
            {formatTime(elapsed)}
          </span>
        )}
      </div>
    </header>
  )
}
