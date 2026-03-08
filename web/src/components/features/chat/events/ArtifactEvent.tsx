/**
 * ArtifactEvent — inline display for captured artifacts (snapshots, console, network).
 */

import { useState } from 'react'
import type { AgentEvent } from '#api/types'

const ARTIFACT_ICONS: Record<string, string> = {
  snapshot: '📸',
  console: '🖥️',
  network: '🌐',
}

const PREVIEW_LEN = 300

type ArtifactCapturedEvent = Extract<AgentEvent, { type: 'artifact_captured' }>

export function ArtifactEvent({ event }: { event: ArtifactCapturedEvent }) {
  const [expanded, setExpanded] = useState(false)
  const icon = ARTIFACT_ICONS[event.artifactType] ?? '📦'
  const hasLongContent = event.content.length > PREVIEW_LEN

  return (
    <div className="py-0.5">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-1.5 text-[11px] font-mono text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
      >
        <span>{icon}</span>
        <span className="text-text-secondary">{event.name}</span>
        <span className="opacity-50">
          [{event.artifactType}]
        </span>
        {hasLongContent && (
          <span className="opacity-40">{expanded ? '▾' : '▸'}</span>
        )}
      </button>

      {(expanded || !hasLongContent) && event.content.length > 0 && (
        <pre className="mt-1 ml-5 text-[10px] font-mono text-text-muted bg-bg-tertiary rounded px-2 py-1.5 max-h-48 overflow-y-auto whitespace-pre-wrap break-all leading-relaxed">
          {expanded ? event.content : event.content.slice(0, PREVIEW_LEN)}
        </pre>
      )}
    </div>
  )
}
