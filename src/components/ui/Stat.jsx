/**
 * Stat primitive. A label + big tabular number, with optional delta/subtext.
 *
 * Sizes:
 *   hero — 4.5rem digit, for the one giant number on a page (OVR, final score).
 *   lg   — 2.5rem, for dashboard / hero card stats.
 *   md   — 1rem, for table cells.
 *   sm   — 0.875rem inline, for compact stat rows.
 *
 * Alignment: left (default) | center | right.
 *
 * Delta: optional { value: number, direction: 'up'|'down', label?: string }.
 * Positive delta → success color, negative → danger.
 */
export default function Stat({
  label,
  value,
  sub,
  delta,
  size = 'md',
  align = 'left',
  className = '',
  labelClassName = '',
  valueClassName = '',
  ...rest
}) {
  const numberClass = {
    hero: 'stat-hero',
    lg: 'stat-lg',
    md: 'stat-md',
    sm: 'text-base font-semibold tabular',
  }[size] || 'stat-md'

  const labelClass = {
    hero: 'label-md text-txt-tertiary',
    lg: 'label-sm text-txt-tertiary',
    md: 'label-xs text-txt-tertiary',
    sm: 'label-xs text-txt-tertiary',
  }[size] || 'label-xs text-txt-tertiary'

  const alignClass = {
    left: 'text-left items-start',
    center: 'text-center items-center',
    right: 'text-right items-end',
  }[align] || 'text-left items-start'

  return (
    <div className={`flex flex-col ${alignClass} ${className}`.trim()} {...rest}>
      {label && (
        <span className={`${labelClass} ${labelClassName}`.trim()}>{label}</span>
      )}
      <span className={`${numberClass} text-txt-primary leading-none ${valueClassName}`.trim()}>
        {value}
      </span>
      {sub && (
        <span className="text-xs text-txt-tertiary mt-1">{sub}</span>
      )}
      {delta && <Delta {...delta} />}
    </div>
  )
}

function Delta({ value, direction, label }) {
  const color =
    direction === 'up' ? 'var(--accent-success)' :
    direction === 'down' ? 'var(--accent-error)' :
    'var(--text-tertiary)'
  const symbol = direction === 'up' ? '▲' : direction === 'down' ? '▼' : ''
  return (
    <span
      className="text-xs mt-1 tabular font-medium"
      style={{ color }}
    >
      {symbol} {value}{label ? ` ${label}` : ''}
    </span>
  )
}
