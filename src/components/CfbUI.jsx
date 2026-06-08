import { useRef, useState, useEffect, useLayoutEffect } from 'react'

// Shared "CFB 27" broadcast-style UI primitives used across the team page
// (TeamYear) and player page (Player). Extracted so both surfaces share the
// exact same tab bar and rating-ring treatment instead of drifting apart.

// Tab bar with a single sliding underline in the team accent color and a
// gentle team-color wash behind the active tab. The underline measures the
// active button and animates to it on change (no slide on first paint).
export function TabBar({ tabs, activeKey, onSelect, accentColor }) {
  const containerRef = useRef(null)
  const buttonRefs = useRef({})
  const [indicator, setIndicator] = useState({ left: 0, width: 0, ready: false })

  const measure = () => {
    const btn = buttonRefs.current[activeKey]
    const container = containerRef.current
    if (!btn || !container) return
    setIndicator({ left: btn.offsetLeft, width: btn.offsetWidth, ready: true })
  }

  useLayoutEffect(() => {
    measure()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, tabs.length])

  useEffect(() => {
    const onResize = () => measure()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey])

  return (
    <div ref={containerRef} className="relative border-b border-surface-4 flex overflow-x-auto no-scrollbar">
      {tabs.map(tab => {
        const isActive = activeKey === tab.key
        return (
          <button
            key={tab.key}
            ref={el => { if (el) buttonRefs.current[tab.key] = el; else delete buttonRefs.current[tab.key] }}
            onClick={() => onSelect(tab.key)}
            className={`relative px-2 sm:px-3 md:px-4 lg:px-6 py-3 font-bold uppercase tracking-wide whitespace-nowrap transition-colors ${
              isActive ? 'text-txt-primary' : 'text-txt-tertiary hover:text-txt-secondary'
            }`}
            style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem' }}
          >
            {/* Always-present accent wash — opacity fades it in/out on select so
                the active tab "lights up" instead of popping (gradients can't
                CSS-transition, opacity can). */}
            <span
              aria-hidden="true"
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: `linear-gradient(to top, ${accentColor}30, transparent 70%)`,
                opacity: isActive ? 1 : 0,
                transition: 'opacity 380ms ease-out',
              }}
            />
            <span className="relative">{tab.label}</span>
          </button>
        )
      })}
      <span
        className="absolute bottom-0 h-[2px] pointer-events-none"
        style={{
          backgroundColor: accentColor,
          transform: `translateX(${indicator.left}px)`,
          width: `${indicator.width}px`,
          transition: indicator.ready ? 'transform 300ms ease-out, width 300ms ease-out' : 'none',
          opacity: indicator.ready ? 1 : 0,
        }}
        aria-hidden="true"
      />
    </div>
  )
}

// Card section header — the team-color accent bar + uppercase display title
// used at the top of every card/section on the team and player pages. Pass an
// `accent` (team primary color); optional `right` renders a meta/action on the
// far right (e.g. a "Full Timeline →" link or a week label).
export function CardSectionHeader({ label, accent, right, className = '' }) {
  return (
    <div
      className={`relative px-4 py-3 bg-surface-2 border-b border-surface-4 border-l-[3px] flex items-center justify-between gap-3 ${className}`}
      style={{
        borderLeftColor: accent,
        // Faint team-color wash fading off the left accent + a subtle top
        // highlight so the bar reads as a lit broadcast strip, not flat fill.
        backgroundImage: accent
          ? `linear-gradient(90deg, ${accent}26 0%, ${accent}0d 16%, transparent 38%), linear-gradient(180deg, rgba(255,255,255,0.04) 0%, transparent 40%)`
          : undefined,
      }}
    >
      <h3
        className="font-display font-bold uppercase leading-none text-txt-primary truncate"
        style={{ fontSize: '0.98rem', letterSpacing: '0.05em' }}
      >
        {label}
      </h3>
      {right != null && <div className="flex-shrink-0">{right}</div>}
    </div>
  )
}

// CFB-broadcast-style rating rings: a labeled set of team-color outlined
// circles (e.g. OVR / OFF / DEF, or any single rating). `items` is an array
// of { label, value }. ringColor outlines the circle; textColor fills the
// number + label (both usually the contrast text of the team banner).
export function StatRings({ items, ringColor, textColor, size = 'md' }) {
  if (!items || items.length === 0) return null
  const dims = {
    xs: { dim: 'w-9 h-9', num: 'text-[11px]', lab: 'text-[6px]' },
    sm: { dim: 'w-11 h-11', num: 'text-sm', lab: 'text-[7px]' },
    md: { dim: 'w-11 h-11 sm:w-[3.25rem] sm:h-[3.25rem]', num: 'text-sm sm:text-base', lab: 'text-[7px] sm:text-[8px]' },
    lg: { dim: 'w-16 h-16 sm:w-20 sm:h-20', num: 'text-2xl sm:text-3xl', lab: 'text-[9px] sm:text-[10px]' },
  }
  const { dim, num, lab } = dims[size] || dims.md
  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      {items.map(it => (
        <div
          key={it.label}
          className={`${dim} rounded-full flex flex-col items-center justify-center shrink-0`}
          style={{
            border: `2px solid ${ringColor}`,
            background: 'radial-gradient(circle at 50% 30%, rgba(255,255,255,0.12), rgba(255,255,255,0.02) 70%)',
            boxShadow: `0 0 14px ${ringColor}40, inset 0 1px 1px rgba(255,255,255,0.12)`,
          }}
        >
          <span className={`font-display font-extrabold leading-none tabular-nums ${num}`} style={{ color: textColor }}>
            {it.value ?? '—'}
          </span>
          <span className={`font-bold tracking-[0.12em] mt-0.5 ${lab}`} style={{ color: textColor, opacity: 0.65 }}>
            {it.label}
          </span>
        </div>
      ))}
    </div>
  )
}
