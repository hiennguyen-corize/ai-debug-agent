import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format elapsed time as `[MM:SS]` relative to a start timestamp. */
export function formatElapsed(timestampMs: number, startMs: number): string {
  const elapsed = Math.max(0, Math.floor((timestampMs - startMs) / 1000))
  const mins = Math.floor(elapsed / 60).toString().padStart(2, '0')
  const secs = (elapsed % 60).toString().padStart(2, '0')
  return `${mins}:${secs}`
}

/** Smart duration: `45s` → `4m 23s` → `1h 12m` */
export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  if (s >= 60) return `${Math.floor(s / 60)}m ${(s % 60).toString().padStart(2, '0')}s`
  return `${s}s`
}

/** Relative time: "just now", "2m ago", "1h ago", "3d ago" */
export function relativeTime(timestampMs: number): string {
  const diff = Math.max(0, Math.floor((Date.now() - timestampMs) / 1000))
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}
