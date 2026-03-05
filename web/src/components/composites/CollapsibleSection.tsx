import { useState, type ReactNode } from 'react'
import { cn } from '#lib/utils'

type CollapsibleSectionProps = {
  header: ReactNode
  defaultExpanded?: boolean
  expanded?: boolean
  onToggle?: () => void
  borderColor?: string
  children: ReactNode
  className?: string
}

export function CollapsibleSection({
  header,
  defaultExpanded = false,
  expanded: controlledExpanded,
  onToggle,
  borderColor = 'border-border',
  children,
  className,
}: CollapsibleSectionProps) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded)
  const isExpanded = controlledExpanded ?? internalExpanded

  const handleToggle = () => {
    onToggle !== undefined ? onToggle() : setInternalExpanded(!internalExpanded)
  }

  return (
    <div className={cn('border-l-4 transition-colors duration-150', borderColor, className)}>
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 text-left cursor-pointer',
          'hover:bg-bg-secondary transition-colors duration-100',
        )}
      >
        <span className={cn(
          'text-text-muted text-xs transition-transform duration-150',
          isExpanded && 'rotate-90',
        )}>
          ▸
        </span>
        {header}
      </button>

      {isExpanded && (
        <div className="animate-fade-in">
          {children}
        </div>
      )}
    </div>
  )
}
