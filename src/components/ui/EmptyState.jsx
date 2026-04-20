/**
 * EmptyState primitive. Replaces ad-hoc "no data" centered text.
 *
 * Structure:
 *   HEADLINE (display-md)
 *   body text (optional)
 *   [action button] (optional)
 *
 * Variants:
 *   default   — centered inside parent
 *   compact   — smaller, inline, left-aligned (for inside table body, etc)
 */
export default function EmptyState({
  title,
  message,
  action,
  variant = 'default',
  className = '',
  ...rest
}) {
  if (variant === 'compact') {
    return (
      <div className={`py-4 text-left ${className}`.trim()} {...rest}>
        {title && <div className="text-sm font-semibold text-txt-primary mb-0.5">{title}</div>}
        {message && <div className="text-xs text-txt-tertiary">{message}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    )
  }

  return (
    <div
      className={`flex flex-col items-center justify-center text-center py-12 px-6 ${className}`.trim()}
      {...rest}
    >
      {title && (
        <h3 className="text-display-md text-txt-primary leading-tight m-0">
          {title}
        </h3>
      )}
      {message && (
        <p className="mt-2 text-sm text-txt-secondary max-w-md m-0">{message}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
