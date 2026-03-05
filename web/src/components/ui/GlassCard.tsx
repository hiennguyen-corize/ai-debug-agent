import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '#lib/utils'

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  hover?: boolean
  glow?: boolean
  padding?: 'sm' | 'md' | 'lg'
}

const paddings = {
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
}

export function GlassCard({
  children,
  hover = false,
  glow = false,
  padding = 'md',
  className,
  ...props
}: GlassCardProps) {
  return (
    <div
      className={cn(
        'glass-card',
        paddings[padding],
        hover && 'transition-all duration-200 glass-hover hover:shadow-lg cursor-pointer',
        glow && 'animate-glow',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
