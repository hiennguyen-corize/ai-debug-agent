import { cn } from '#lib/utils'

type StatusDotProps = {
  status: 'pending' | 'running' | 'done' | 'error'
  className?: string
}

const statusStyles: Record<StatusDotProps['status'], string> = {
  pending: 'bg-text-muted',
  running: 'bg-worker',
  done: 'bg-success',
  error: 'bg-error',
}

export function StatusDot({ status, className }: StatusDotProps) {
  return (
    <span className={cn(
      'inline-block w-1.5 h-1.5 rounded-full shrink-0',
      statusStyles[status],
      status === 'running' && 'animate-pulse',
      className,
    )} />
  )
}
