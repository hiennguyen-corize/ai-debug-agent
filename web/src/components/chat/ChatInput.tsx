import { useState, useCallback } from 'react'
import { Search, Loader2, Globe, Zap, MessageSquare } from 'lucide-react'
import { useSettingsStore } from '#stores/settings-store'
import {
  useInvestigationStore,
  createMessageId,
  type Investigation,
} from '#stores/investigation-store'
import { startInvestigation, createSSE } from '#api/investigate'
import type { AgentEvent } from '#api/types'
import { Button } from '#components/ui/Button'


export function ChatInput() {
  const [url, setUrl] = useState('')
  const [hint, setHint] = useState('')
  const [loading, setLoading] = useState(false)
  const { mode, setMode } = useSettingsStore()
  const { addInvestigation, updateInvestigation, addMessage } = useInvestigationStore()

  const handleSubmit = useCallback(async () => {
    const trimmedUrl = url.trim()
    if (!trimmedUrl || loading) return

    const invId = `inv-${Date.now()}`
    const investigation: Investigation = {
      id: invId,
      threadId: null,
      url: trimmedUrl,
      hint: hint.trim(),
      mode,
      status: 'pending',
      messages: [],
      report: null,
      error: null,
      createdAt: Date.now(),
    }

    addInvestigation(investigation)
    addMessage(invId, {
      id: createMessageId(),
      role: 'user',
      content: `Investigate **${trimmedUrl}**${hint.trim() ? `\n\n> Hint: ${hint.trim()}` : ''}\n\nMode: \`${mode}\``,
      timestamp: Date.now(),
    })

    setLoading(true)
    setUrl('')
    setHint('')

    try {
      const result = await startInvestigation(trimmedUrl, hint.trim(), mode)
      updateInvestigation(invId, { threadId: result.threadId, status: 'running' })
      addMessage(invId, {
        id: createMessageId(),
        role: 'system',
        content: `Investigation started. Thread: \`${result.threadId}\``,
        timestamp: Date.now(),
      })

      const sse = createSSE(result.threadId)
      sse.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as AgentEvent
          addMessage(invId, {
            id: createMessageId(),
            role: 'agent',
            content: '',
            timestamp: Date.now(),
            agent: 'agent' in event ? event.agent : undefined,
            event,
          })
        } catch {
          // ignore parse errors
        }
      }

      sse.onerror = () => {
        sse.close()
        updateInvestigation(invId, { status: 'done' })
        setLoading(false)
      }
    } catch (err) {
      updateInvestigation(invId, { status: 'error', error: String(err) })
      addMessage(invId, {
        id: createMessageId(),
        role: 'system',
        content: `Error: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: Date.now(),
      })
      setLoading(false)
    }
  }, [url, hint, mode, loading, addInvestigation, updateInvestigation, addMessage])

  return (
    <div className="border-t border-border-subtle glass p-4">
      <div className="max-w-[800px] mx-auto space-y-3">
        <div className="flex gap-3 items-center">
          <div className="flex-1 relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="url"
              placeholder="https://example.com/page-with-bug"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSubmit()}
              className="w-full glass-input rounded-lg pl-10 pr-4 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all duration-200"
            />
          </div>
          <Button
            onClick={handleSubmit}
            disabled={!url.trim() || loading}
            size="md"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Investigate
          </Button>
        </div>
        <div className="flex gap-3 items-center">
          <input
            type="text"
            placeholder="Hint: describe the bug (optional)"
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSubmit()}
            className="flex-1 glass-input rounded-lg px-4 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all duration-200"
          />
          <button
            onClick={() => setMode(mode === 'autonomous' ? 'interactive' : 'autonomous')}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-medium border cursor-pointer transition-colors duration-200 bg-accent/15 text-accent border-accent/20 hover:bg-accent/25"
            title={`Click to switch to ${mode === 'autonomous' ? 'interactive' : 'autonomous'} mode`}
          >
            {mode === 'autonomous' ? <Zap className="w-3 h-3" /> : <MessageSquare className="w-3 h-3" />}
            {mode}
          </button>
          <span className="text-xs text-text-muted hidden sm:inline">⏎ Enter</span>
        </div>
      </div>
    </div>
  )
}
