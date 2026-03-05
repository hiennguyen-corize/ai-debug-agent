import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '#lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs text-text-muted uppercase tracking-wide font-medium"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full glass-input rounded-lg px-4 py-2.5 text-sm text-text-primary',
            'placeholder-text-muted',
            'transition-colors duration-200',
            'focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30',
            error && 'border-error focus:border-error focus:ring-error/30',
            className,
          )}
          {...props}
        />
        {error && <p className="text-xs text-error">{error}</p>}
      </div>
    )
  },
)
Input.displayName = 'Input'
