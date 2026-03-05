import { useState } from 'react'
import { useInvestigationStore } from '#stores/investigation-store'
import { useSettingsStore } from '#stores/settings-store'
import { Button } from '#components/ui/Button'
import { StatusDot } from '#components/ui/StatusDot'
import { cn } from '#lib/utils'
import {
  Bug, Plus, Settings, Globe, Zap, MessageSquare,
  ChevronLeft, ChevronRight,
} from 'lucide-react'

function ModeSelector() {
  const { mode, setMode } = useSettingsStore()
  return (
    <div className="space-y-2">
      <label className="text-xs text-text-muted uppercase tracking-wide font-medium">Mode</label>
      <div className="flex gap-1 glass-input rounded-lg p-1">
        <button
          onClick={() => setMode('autonomous')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 cursor-pointer',
            mode === 'autonomous'
              ? 'bg-accent text-white shadow-glow-accent'
              : 'text-text-muted hover:text-text-primary',
          )}
        >
          <Zap className="w-3.5 h-3.5" />
          Auto
        </button>
        <button
          onClick={() => setMode('interactive')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 cursor-pointer',
            mode === 'interactive'
              ? 'bg-accent text-white shadow-glow-accent'
              : 'text-text-muted hover:text-text-primary',
          )}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Interactive
        </button>
      </div>
    </div>
  )
}



export function Sidebar() {
  const { investigations, activeId, setActive } = useInvestigationStore()
  const [showSettings, setShowSettings] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={cn(
        'glass border-r border-border-subtle flex flex-col h-full transition-all duration-300',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      {/* Header */}
      <div className="p-3 border-b border-border-subtle flex items-center gap-2">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 shadow-glow-accent">
          <Bug className="w-4.5 h-4.5 text-white" />
        </div>
        {!collapsed && (
          <span className="font-semibold text-sm text-text-primary font-mono">Debug Agent</span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto p-1 text-text-muted hover:text-text-primary cursor-pointer transition-colors duration-200"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* New button */}
      <div className="p-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => useInvestigationStore.getState().setActive('')}
          className={cn('w-full', collapsed ? 'px-0 justify-center' : 'justify-start')}
        >
          <Plus className="w-4 h-4 shrink-0" />
          {!collapsed && 'New Investigation'}
        </Button>
      </div>

      {/* Investigation list */}
      <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
        {investigations.map((inv) => {
          let label = inv.url
          try {
            const u = new URL(inv.url)
            label = u.hostname + (u.pathname !== '/' ? u.pathname : '')
          } catch { /* keep raw url */ }

          return (
            <button
              key={inv.id}
              onClick={() => setActive(inv.id)}
              className={cn(
                'w-full flex items-center gap-2 px-2.5 py-2 rounded-lg transition-all duration-200 text-left cursor-pointer',
                inv.id === activeId
                  ? 'glass-hover text-text-primary'
                  : 'text-text-muted glass-hover hover:text-text-secondary',
                collapsed && 'justify-center px-0',
              )}
              title={label}
            >
              <Globe className="w-3.5 h-3.5 shrink-0" />
              {!collapsed && <span className="truncate text-sm">{label}</span>}
              <StatusDot
                status={inv.status === 'running' ? 'running' : inv.status === 'done' ? 'done' : inv.status === 'error' ? 'error' : 'pending'}
                className={collapsed ? '' : 'ml-auto'}
              />
            </button>
          )
        })}
      </div>

      {/* Settings */}
      {!collapsed && (
        <div className="border-t border-border-subtle p-3 space-y-3">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary transition-colors duration-200 cursor-pointer w-full"
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>
          {showSettings && (
            <div className="space-y-4 animate-fade-in">
              <ModeSelector />

            </div>
          )}
        </div>
      )}
    </aside>
  )
}
