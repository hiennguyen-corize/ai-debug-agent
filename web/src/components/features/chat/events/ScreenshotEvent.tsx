import { useState } from 'react'
import type { AgentEvent } from '#api/types'

export function ScreenshotEvent({ event }: { event: Extract<AgentEvent, { type: 'screenshot_captured' }> }) {
  const [fullscreen, setFullscreen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setFullscreen(true)}
        className="block mt-1 mb-1 cursor-pointer rounded overflow-hidden border border-border hover:border-text-muted transition-colors"
      >
        <img
          src={`data:image/png;base64,${event.data}`}
          alt="Screenshot"
          className="w-48 h-auto"
        />
      </button>

      {fullscreen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center cursor-pointer"
          onClick={() => setFullscreen(false)}
        >
          <img
            src={`data:image/png;base64,${event.data}`}
            alt="Screenshot (full)"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded"
          />
        </div>
      )}
    </>
  )
}
