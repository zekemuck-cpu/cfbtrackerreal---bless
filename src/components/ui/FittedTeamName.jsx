import { useRef, useState, useLayoutEffect } from 'react'

// Shows a team's full name, but swaps to its abbreviation when the full name
// would overflow its container (instead of CSS-truncating mid-word, e.g.
// "Appalachian …" → "APP"). Measures rendered width against the container, so
// it adapts to whatever width it's given. If no abbr is supplied it just
// truncates the full name as a last resort.
//
// Usage: <FittedTeamName name="Appalachian State" abbr="APP" className="..." />
export default function FittedTeamName({ name, abbr, className = '', style }) {
  const ref = useRef(null)
  const measureRef = useRef(null)
  const [useAbbr, setUseAbbr] = useState(false)

  useLayoutEffect(() => {
    const c = ref.current, m = measureRef.current
    if (!c || !m) return
    const check = () => setUseAbbr(!!abbr && m.offsetWidth > c.clientWidth)
    check()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null
    ro?.observe(c)
    return () => ro?.disconnect()
  }, [name, abbr])

  return (
    <span ref={ref} title={name} className={`relative block min-w-0 truncate ${className}`.trim()} style={style}>
      {useAbbr ? abbr : name}
      {/* hidden full-width measurer — always the full name */}
      <span ref={measureRef} aria-hidden="true" className="invisible absolute left-0 top-0 whitespace-nowrap">{name}</span>
    </span>
  )
}
