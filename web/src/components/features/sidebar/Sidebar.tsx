import { useState } from 'react'
import { useInvestigationStore } from '#stores/investigation-store'
import { useSettingsStore } from '#stores/settings-store'
import { StatusDot } from '#components/primitives'
import { cn, relativeTime } from '#lib/utils'

export function Sidebar() {
  const { investigations, activeId, setActive } = useInvestigationStore()
  const [collapsed, setCollapsed] = useState(false)
  const { mode } = useSettingsStore()

  return (
    <aside
      aria-label="Investigation sidebar"
      className={cn(
      'h-full border-r border-border bg-bg-secondary flex flex-col transition-[width] duration-200',
      collapsed ? 'w-12' : 'w-64',
    )}>
      {/* Header */}
      <div className="h-12 flex items-center px-3 border-b border-border">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="text-text-muted hover:text-text-primary transition-colors cursor-pointer"
          title={collapsed ? 'Expand' : 'Collapse'}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? '▸' : '◂'}
        </button>
        {!collapsed && (
          <span className="ml-2 text-sm font-semibold text-text-primary font-mono tracking-tight">
            Debug Agent
          </span>
        )}
      </div>

      {/* Investigation list */}
      {!collapsed && (
        <nav className="flex-1 overflow-y-auto py-2">
          {investigations.length === 0 && (
            <p className="px-3 py-4 text-xs text-text-muted">No investigations yet</p>
          )}
          {investigations.map((inv) => {
            const isActive = inv.id === activeId
            let label = inv.url
            try { label = new URL(inv.url).hostname } catch { /* keep raw */ }

            return (
              <button
                key={inv.id}
                onClick={() => setActive(inv.id)}
                className={cn(
                  'w-full text-left px-3 py-2 flex items-center gap-2 text-sm transition-colors cursor-pointer',
                  isActive
                    ? 'bg-bg-primary border-l-2 border-accent text-text-primary'
                    : 'text-text-secondary hover:bg-bg-tertiary border-l-2 border-transparent',
                )}
              >
                <StatusDot status={inv.status} />
                <div className="truncate">
                  <span className="font-mono text-xs block">{label}</span>
                  <span className="text-[10px] text-text-muted">{relativeTime(inv.createdAt)}</span>
                </div>
              </button>
            )
          })}
        </nav>
      )}

      {/* Footer */}
      {!collapsed && (
        <div className="p-3 border-t border-border">
          <div className="text-[10px] text-text-muted font-mono">
            Mode: {mode}
          </div>
        </div>
      )}
    </aside>
  )
}
