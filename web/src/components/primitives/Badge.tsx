import { cn } from '#lib/utils'

type BadgeProps = {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'error' | 'warning'
  className?: string
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 text-xs font-mono px-1.5 py-0.5 rounded',
      variant === 'default' && 'text-text-secondary bg-bg-tertiary',
      variant === 'success' && 'text-success bg-success/8',
      variant === 'error' && 'text-error bg-error/8',
      variant === 'warning' && 'text-warning bg-warning/8',
      className,
    )}>
      {children}
    </span>
  )
}
