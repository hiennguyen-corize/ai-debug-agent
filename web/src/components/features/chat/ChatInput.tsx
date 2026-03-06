import { useState, useCallback } from 'react'
import { useSettingsStore } from '#stores/settings-store'
import {
  useInvestigationStore,
  createMessageId,
  type Investigation,
} from '#stores/investigation-store'
import { startInvestigation } from '#api/investigate'
import { Button } from '#components/primitives'

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
      isWaitingForInput: false,
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
    <div className="border-t border-border bg-bg-secondary px-4 py-3">
      <div className="max-w-3xl mx-auto">
        {/* Form card — both inputs equal weight */}
        <div className="rounded-md border border-border bg-bg-tertiary divide-y divide-border">
          {/* Row 1: URL */}
          <div className="flex items-center">
            <label className="text-[10px] uppercase tracking-widest font-mono text-text-muted px-3 w-16 shrink-0">
              URL
            </label>
            <input
              type="url"
              placeholder="https://example.com/page-with-bug"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSubmit()}
              className="flex-1 bg-transparent text-sm text-text-primary px-2 py-2.5 placeholder:text-text-muted focus:outline-none"
            />
          </div>

          {/* Row 2: Hint */}
          <div className="flex items-center">
            <label className="text-[10px] uppercase tracking-widest font-mono text-text-muted px-3 w-16 shrink-0">
              Hint
            </label>
            <input
              type="text"
              placeholder="Describe the bug you're seeing"
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSubmit()}
              className="flex-1 bg-transparent text-sm text-text-primary px-2 py-2.5 placeholder:text-text-muted focus:outline-none"
            />
          </div>
        </div>

        {/* Controls row */}
        <div className="flex items-center justify-between mt-2">
          <button
            onClick={() => setMode(mode === 'autonomous' ? 'interactive' : 'autonomous')}
            className="text-[11px] text-text-muted font-mono hover:text-text-secondary cursor-pointer transition-colors"
          >
            mode: {mode}
          </button>
          <Button
            onClick={handleSubmit}
            disabled={!url.trim() || loading}
            size="sm"
          >
            {loading ? '…' : 'Investigate'}
          </Button>
        </div>
      </div>
    </div>
  )
}
