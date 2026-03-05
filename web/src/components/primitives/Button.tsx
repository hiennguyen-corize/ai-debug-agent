import { cn } from '#lib/utils'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost'
  size?: 'sm' | 'md'
  children: ReactNode
}

export function Button({ variant = 'primary', size = 'md', className, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 font-medium transition-colors duration-150 cursor-pointer',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        size === 'sm' && 'text-xs px-3 py-1.5 rounded',
        size === 'md' && 'text-sm px-4 py-2 rounded',
        variant === 'primary' && 'bg-bg-inverse text-bg-primary hover:bg-text-secondary',
        variant === 'ghost' && 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
