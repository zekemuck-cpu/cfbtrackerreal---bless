import { useRef, useState, useLayoutEffect } from 'react'

// Shows a player's full name, but collapses to "F. Lastname" when the full name
// would overflow its container (instead of CSS-truncating mid-last-name, e.g.
// "Rich Beav…"). Measures the rendered width against the container, so it adapts
// to whatever width it's given. Falls back to a final ellipsis only if even the
// abbreviated form doesn't fit.
//
// Usage: <FittedPlayerName name={player.name} className="..." style={...} />
export default function FittedPlayerName({ name, className = '', style }) {
  const ref = useRef(null)
  const measureRef = useRef(null)
  const [abbrev, setAbbrev] = useState(false)

  useLayoutEffect(() => {
    const c = ref.current, m = measureRef.current
    if (!c || !m) return
    const check = () => setAbbrev(m.offsetWidth > c.clientWidth)
    check()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null
    ro?.observe(c)
    return () => ro?.disconnect()
  }, [name])

  return (
    <span ref={ref} title={name} className={`relative block min-w-0 truncate ${className}`.trim()} style={style}>
      {abbrev ? shortName(name) : name}
      {/* hidden full-width measurer */}
      <span ref={measureRef} aria-hidden="true" className="invisible absolute left-0 top-0 whitespace-nowrap">{name}</span>
    </span>
  )
}

function shortName(name) {
  if (!name) return name
  const parts = String(name).trim().split(/\s+/)
  if (parts.length < 2) return name
  return `${parts[0][0].toUpperCase()}. ${parts.slice(1).join(' ')}`
}
