/**
 * Tabs primitive. Controlled — parent owns the active value.
 *
 * Two visual styles:
 *   "underline" (default) — bottom-border accent on active tab. Used on Player, Game, Teams pages.
 *   "pill"                — filled accent chip. Used for filter bars (positions, years).
 *
 * Usage:
 *   <Tabs
 *     value={activeTab}
 *     onChange={setActiveTab}
 *     options={[{ value: 'stats', label: 'Stats' }, { value: 'career', label: 'Career' }]}
 *   />
 */
export default function Tabs({
  value,
  onChange,
  options,
  variant = 'underline',
  size = 'md',
  className = '',
  ...rest
}) {
  if (variant === 'pill') {
    return (
      <div
        role="tablist"
        className={`flex flex-wrap gap-1.5 ${className}`.trim()}
        {...rest}
      >
        {options.map((opt) => {
          const active = opt.value === value
          return (
            <button
              key={opt.value}
              role="tab"
              aria-selected={active}
              onClick={() => onChange(opt.value)}
              disabled={opt.disabled}
              className={`px-3 py-1 rounded-sm text-xs font-semibold uppercase tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                active
                  ? 'text-txt-primary'
                  : 'text-txt-secondary hover:text-txt-primary hover:bg-surface-3'
              }`}
              style={active
                ? { backgroundColor: 'var(--surface-3)' }
                : undefined
              }
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    )
  }

  // underline variant
  const paddingClass = size === 'sm' ? 'px-2 py-1.5 text-xs' : 'px-3 py-2 text-sm'
  return (
    <div
      role="tablist"
      className={`flex items-center gap-1 overflow-x-auto no-scrollbar ${className}`.trim()}
      style={{ borderBottom: '1px solid var(--surface-4)' }}
      {...rest}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            disabled={opt.disabled}
            className={`relative whitespace-nowrap font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${paddingClass} ${
              active ? 'text-txt-primary' : 'text-txt-tertiary hover:text-txt-secondary'
            }`}
          >
            {opt.label}
            {active && (
              <span
                aria-hidden="true"
                className="absolute left-0 right-0 bottom-0 h-[2px]"
                style={{ backgroundColor: 'var(--text-primary)' }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
