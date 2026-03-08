/**
 * EvidencePanel — tabbed display of investigation artifacts.
 */

import { useEffect, useState, useCallback } from 'react'
import { getArtifacts, type ArtifactRecord } from '#api/investigate'
import { cn } from '#lib/utils'

const TAB_CONFIG = [
  { key: 'snapshot', label: '📸 Snapshots', color: 'var(--color-accent)' },
  { key: 'console', label: '🖥️ Console', color: '#f59e0b' },
  { key: 'network', label: '🌐 Network', color: '#06b6d4' },
] as const

type TabKey = (typeof TAB_CONFIG)[number]['key']

const PREVIEW_LENGTH = 200

type EvidencePanelProps = {
  threadId: string
}

export function EvidencePanel({ threadId }: EvidencePanelProps) {
  const [artifacts, setArtifacts] = useState<ArtifactRecord[]>([])
  const [activeTab, setActiveTab] = useState<TabKey>('snapshot')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const data = await getArtifacts(threadId)
      setArtifacts(data)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [threadId])

  useEffect(() => { void load() }, [load])

  if (loading) return null
  if (artifacts.length === 0) return null

  const filtered = artifacts.filter((a) => a.type === activeTab)

  const counts = TAB_CONFIG.map((tab) => ({
    ...tab,
    count: artifacts.filter((a) => a.type === tab.key).length,
  }))

  return (
    <div className="border border-border-subtle rounded-lg bg-bg-secondary overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-border-subtle">
        {counts.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key) }}
            className={cn(
              'flex-1 px-3 py-2 text-xs font-mono transition-colors',
              activeTab === tab.key
                ? 'bg-bg-tertiary text-text-primary border-b-2'
                : 'text-text-muted hover:text-text-secondary',
            )}
            style={activeTab === tab.key ? { borderBottomColor: tab.color } : undefined}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-bg-tertiary text-[10px]">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="max-h-80 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-xs text-text-muted font-mono">
            No {activeTab} artifacts captured
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {filtered.map((artifact) => (
              <ArtifactItem key={artifact.id} artifact={artifact} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ArtifactItem({ artifact }: { artifact: ArtifactRecord }) {
  const [expanded, setExpanded] = useState(false)

  const preview = artifact.content.length > PREVIEW_LENGTH
    ? artifact.content.slice(0, PREVIEW_LENGTH) + '…'
    : artifact.content

  return (
    <div className="p-3">
      <button
        onClick={() => { setExpanded((e) => !e) }}
        className="w-full text-left flex items-center justify-between gap-2"
      >
        <span className="text-xs font-mono text-text-secondary">
          {artifact.name}
        </span>
        <span className="text-[10px] text-text-muted shrink-0">
          {expanded ? '▼' : '▶'}
        </span>
      </button>
      <pre className={cn(
        'mt-1 text-[11px] font-mono text-text-muted bg-bg-tertiary rounded p-2 overflow-x-auto whitespace-pre-wrap',
        !expanded && 'max-h-20 overflow-hidden',
      )}>
        {expanded ? artifact.content : preview}
      </pre>
    </div>
  )
}
