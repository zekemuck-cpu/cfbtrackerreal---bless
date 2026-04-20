/**
 * SectionHeader primitive. Title + optional subtitle + optional right-aligned actions.
 * Used to break up a page body into sections without spending another Card.
 *
 * Sizes:
 *   md (default) — display-md title
 *   sm           — smaller, for sections within a card
 */
export default function SectionHeader({
  title,
  subtitle,
  eyebrow,
  actions,
  size = 'md',
  className = '',
  children,
  ...rest
}) {
  const titleClass = size === 'sm'
    ? 'text-lg font-semibold text-txt-primary leading-tight'
    : 'text-display-md text-txt-primary leading-tight'

  return (
    <div className={`mb-4 ${className}`.trim()} {...rest}>
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <div className="label-sm text-txt-tertiary mb-1">{eyebrow}</div>
          )}
          <h2 className={`${titleClass} m-0`}>{title}</h2>
          {subtitle && (
            <p className="mt-1 text-sm text-txt-secondary m-0">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  )
}
