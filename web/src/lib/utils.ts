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
