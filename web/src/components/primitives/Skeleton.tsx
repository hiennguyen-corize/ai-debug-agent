export function SkeletonCard() {
  return (
    <div className="space-y-2 animate-pulse">
      <div className="h-3 bg-bg-tertiary rounded w-1/3" />
      <div className="h-3 bg-bg-tertiary rounded w-full" />
      <div className="h-3 bg-bg-tertiary rounded w-4/5" />
    </div>
  )
}
