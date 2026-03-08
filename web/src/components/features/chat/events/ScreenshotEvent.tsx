import { useState, useCallback, useEffect } from 'react'
import type { AgentEvent } from '#api/types'

const VALID_BASE64 = /^[A-Za-z0-9+/=\s]+$/

export function ScreenshotEvent({ event }: { event: Extract<AgentEvent, { type: 'screenshot_captured' }> }) {
  const [fullscreen, setFullscreen] = useState(false)
  const isValid = typeof event.data === 'string' && VALID_BASE64.test(event.data)
  const src = isValid ? `data:image/png;base64,${event.data}` : ''

  if (!isValid) return <span className="text-xs text-error font-mono">⚠ Invalid screenshot data</span>

  const close = useCallback(() => { setFullscreen(false) }, [])

  useEffect(() => {
    if (!fullscreen) return
    const handler = (e: KeyboardEvent): void => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', handler)
    return () => { window.removeEventListener('keydown', handler) }
  }, [fullscreen, close])

  return (
    <>
      <button
        type="button"
        onClick={() => setFullscreen(true)}
        className="block mt-1 mb-1 cursor-pointer rounded overflow-hidden border border-border hover:border-text-muted transition-colors"
        aria-label="View screenshot fullscreen"
      >
        <img
          src={src}
          alt="Screenshot captured during investigation"
          className="w-48 h-auto"
        />
      </button>

      {fullscreen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Screenshot preview"
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center cursor-pointer"
          onClick={close}
          onKeyDown={(e) => { if (e.key === 'Escape') close() }}
        >
          <img
            src={src}
            alt="Screenshot (full size)"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded"
          />
        </div>
      )}
    </>
  )
}

