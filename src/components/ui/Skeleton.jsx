/**
 * Skeleton / loading primitive. Wraps the existing `.shimmer` utility.
 *
 * Usage:
 *   <Skeleton className="h-4 w-32" />
 *   <Skeleton variant="text" lines={3} />
 *   <Skeleton variant="circle" className="w-10 h-10" />
 *
 * <LoadingState message="Loading roster..." /> — for page-level loading shells.
 */
export function Skeleton({ variant = 'rect', lines = 1, className = '', style, ...rest }) {
  if (variant === 'text') {
    return (
      <div className={`flex flex-col gap-2 ${className}`.trim()}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="shimmer rounded-sm"
            style={{ height: '0.75rem', width: i === lines - 1 ? '60%' : '100%' }}
          />
        ))}
      </div>
    )
  }

  const shape = variant === 'circle' ? 'rounded-full' : 'rounded-sm'
  return (
    <div
      className={`shimmer ${shape} ${className}`.trim()}
      style={style}
      {...rest}
    />
  )
}

export function LoadingState({ message = 'Loading…', className = '' }) {
  return (
    <div
      className={`flex flex-col items-center justify-center py-12 px-6 text-center ${className}`.trim()}
    >
      <div className="label-sm text-txt-tertiary animate-pulse-subtle">{message}</div>
    </div>
  )
}

export default Skeleton
