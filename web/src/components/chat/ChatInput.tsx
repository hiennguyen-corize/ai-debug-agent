import { useState, useCallback } from 'react'
import { Search, Loader2, Globe, Zap, MessageSquare } from 'lucide-react'
import { useSettingsStore } from '#stores/settings-store'
import {
  useInvestigationStore,
  createMessageId,
  type Investigation,
} from '#stores/investigation-store'
import { startInvestigation } from '#api/investigate'
import { Button } from '#components/ui/Button'


export function ChatInput() {
  const [url, setUrl] = useState('')
  const [hint, setHint] = useState('')
  const [loading, setLoading] = useState(false)
  const { mode, setMode } = useSettingsStore()
  const { addInvestigation, updateInvestigation, addMessage, connectSSE } = useInvestigationStore()

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

      connectSSE(invId, result.threadId)
      setLoading(false)
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
  }, [url, hint, mode, loading, addInvestigation, updateInvestigation, addMessage, connectSSE])

  return (
    <div className="border-t border-border-subtle glass px-4 py-3">
      <div className="max-w-[800px] mx-auto">
        {/* Single card container */}
        <div className="rounded-xl border border-border-subtle bg-bg-secondary/50 overflow-hidden transition-all duration-200 focus-within:border-accent/40 focus-within:ring-1 focus-within:ring-accent/20">
          {/* URL row */}
          <div className="flex items-center gap-2 px-3 py-2.5">
            <Globe className="w-4 h-4 text-text-muted shrink-0" />
            <input
              type="url"
              placeholder="https://example.com/page-with-bug"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSubmit()}
              className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-muted focus:outline-none"
            />
          </div>

          {/* Divider + bottom toolbar */}
          <div className="flex items-center gap-2 px-3 py-2 border-t border-border-subtle/50 bg-bg-tertiary/30">
            <input
              type="text"
              placeholder="Describe the bug (optional)"
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSubmit()}
              className="flex-1 bg-transparent text-xs text-text-secondary placeholder-text-muted/60 focus:outline-none"
            />

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setMode(mode === 'autonomous' ? 'interactive' : 'autonomous')}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono font-medium border cursor-pointer transition-colors duration-200 bg-accent/10 text-accent border-accent/15 hover:bg-accent/20"
                title={`Switch to ${mode === 'autonomous' ? 'interactive' : 'autonomous'} mode`}
              >
                {mode === 'autonomous' ? <Zap className="w-3 h-3" /> : <MessageSquare className="w-3 h-3" />}
                {mode}
              </button>

              <Button
                onClick={handleSubmit}
                disabled={!url.trim() || loading}
                size="sm"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                Investigate
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
