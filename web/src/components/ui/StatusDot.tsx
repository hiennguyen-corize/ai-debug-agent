import { cn } from '#lib/utils'

type StatusDotVariant = 'running' | 'done' | 'error' | 'pending' | 'idle'

const dotColors: Record<StatusDotVariant, string> = {
  running: 'bg-warning',
  done: 'bg-cta',
  error: 'bg-error',
  pending: 'bg-text-muted',
  idle: 'bg-border',
}

interface StatusDotProps {
  status: StatusDotVariant
  pulse?: boolean
  size?: 'sm' | 'md'
  className?: string
}

export function StatusDot({ status, pulse, size = 'sm', className }: StatusDotProps) {
  const shouldPulse = pulse ?? status === 'running'

  return (
    <span
      className={cn(
        'rounded-full shrink-0',
        size === 'sm' ? 'w-2 h-2' : 'w-3 h-3',
        dotColors[status],
        shouldPulse && 'animate-pulse',
        className,
      )}
      aria-label={`Status: ${status}`}
    />
  )
}
