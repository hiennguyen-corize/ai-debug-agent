import { cn } from '#lib/utils'

type BadgeVariant = 'running' | 'done' | 'error' | 'pending' | 'info' | 'warning'

const variants: Record<BadgeVariant, string> = {
  running: 'bg-warning/15 text-warning border-warning/20',
  done: 'bg-cta/15 text-cta border-cta/20',
  error: 'bg-error/15 text-error border-error/20',
  pending: 'bg-text-muted/15 text-text-muted border-text-muted/20',
  info: 'bg-info/15 text-info border-info/20',
  warning: 'bg-warning/15 text-warning border-warning/20',
}

interface BadgeProps {
  variant: BadgeVariant
  children: React.ReactNode
  className?: string
}

export function Badge({ variant, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono font-medium border',
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  )
}
