import { useEffect, useState, useMemo } from 'react'
import { getScoutScore, ordinal, defaultLensKey } from '../utils/scoutScore'
import { useDynasty } from '../context/DynastyContext'
import { getEditionKey } from '../editions'

// Percentile → accent color. A smooth red → amber → green ramp aligned to the
// tier thresholds below, so the ring, section marks, and rows read one scale.
function pctColor(pct) {
  if (pct == null) return 'var(--text-muted)'
  if (pct >= 90) return '#34d399' // Elite
  if (pct >= 75) return '#86d472' // Excellent
  if (pct >= 60) return '#c3d24a' // Above average
  if (pct >= 40) return '#f2c14e' // Average
  if (pct >= 25) return '#ef9a5b' // Below average
  return '#ec6a6a'                 // Poor
}

// Same color at a given alpha, for glows and tints. Non-hex (the null/no-data
// case) fades to transparent so a missing value never paints a solid fill.
function withAlpha(color, a) {
  if (typeof color !== 'string' || !color.startsWith('#')) return 'transparent'
  const n = parseInt(color.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

// Qualitative tier for the headline percentile.
function tierLabel(pct) {
  if (pct == null) return '—'
  if (pct >= 90) return 'Elite'
  if (pct >= 75) return 'Excellent'
  if (pct >= 60) return 'Above average'
  if (pct >= 40) return 'Average'
  if (pct >= 25) return 'Below average'
  return 'Poor'
}

// Compact circular percentile gauge — crisp tier-colored arc over a track, the
// ordinal in the display face, a soft glow from a whole-SVG drop-shadow.
function Gauge({ pct }) {
  const r = 27, c = 36
  const circ = 2 * Math.PI * r
  const p = Math.max(0, Math.min(100, pct ?? 0))
  const dash = (p / 100) * circ
  const color = pctColor(pct)
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" className="shrink-0" style={{ filter: `drop-shadow(0 0 4px ${withAlpha(color, 0.45)})` }}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--surface-4)" strokeWidth="6" />
      <circle
        cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`} transform={`rotate(-90 ${c} ${c})`}
        style={{ transition: 'stroke-dasharray 600ms cubic-bezier(0.2, 0.8, 0.2, 1)' }}
      />
      <text x={c} y={c - 1} textAnchor="middle" style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 800, fill: 'var(--text-primary)' }}>
        {pct == null ? '—' : ordinal(pct)}
      </text>
      <text x={c} y={c + 11} textAnchor="middle" style={{ fontSize: '6px', letterSpacing: '1.5px', fill: 'var(--text-muted)' }}>
        PCTILE
      </text>
    </svg>
  )
}

// Inline ScoutScore result for a single recruit. Self-fetching (cached), so it
// renders the same whether on the Scout Board card or a player page.
//
// `collapsible` (default false, preserving the Player-page card's existing
// always-expanded behavior): when true, only the headline gauge/tier shows
// initially — sized to match a compact host box (e.g. the Score Breakdown
// card on the Targets board) — with a chevron to expand the lens selector
// and per-attribute rows on demand.
export default function ScoutScorePanel({ recruit, collapsible = false }) {
  const { currentDynasty } = useDynasty()
  // Benchmark against the recruit's own game's cohort — a CFB27 dynasty's
  // recruit shouldn't be silently scored against MaxPlaysCFB's CFB26 pool.
  // Falls back to cfb26 (today's existing behavior) for every other edition.
  const sourceGame = getEditionKey(currentDynasty) === 'cfb27' ? 'cfb27' : 'cfb26'
  const [state, setState] = useState({ status: 'loading', data: null, reason: null })
  const [lens, setLens] = useState(null)
  const [expanded, setExpanded] = useState(!collapsible)

  useEffect(() => {
    let alive = true
    setState({ status: 'loading', data: null, reason: null })
    setLens(null)
    getScoutScore(recruit, sourceGame).then((r) => {
      if (!alive) return
      if (!r.ok) { setState({ status: 'error', data: null, reason: r.reason }); return }
      setState({ status: 'done', data: r.data, reason: null })
      setLens(defaultLensKey(r.data))
    })
    return () => { alive = false }
  }, [recruit, sourceGame])

  const data = state.data
  const lenses = (data?.availableLenses || []).filter((l) => l.eligible)
  const activeLens = lens || lenses[0]?.key
  const lensMeta = lenses.find((l) => l.key === activeLens)
  const overall = data?.overallSummaries?.[activeLens]

  // Attributes grouped by category, each sorted by percentile descending. Group
  // order follows the order categories first appear in the stat list.
  const groupedStats = useMemo(() => {
    const m = new Map()
    for (const s of data?.statResults || []) {
      const k = s.groupLabel || 'Other'
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(s)
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => (b.lenses?.[activeLens]?.percentile ?? -1) - (a.lenses?.[activeLens]?.percentile ?? -1))
    }
    return [...m.entries()]
  }, [data, activeLens])

  // Per-group summary percentile, keyed by label for inline section marks.
  const groupPctByLabel = useMemo(() => {
    const m = new Map()
    for (const g of (data?.groupSummaries?.[activeLens] || [])) {
      if (g.available) m.set(g.label, g.percentile)
    }
    return m
  }, [data, activeLens])

  const overallPct = overall?.percentile

  return (
    <div className="max-w-2xl mx-auto">
      {state.status === 'loading' && (
        <p className="text-sm text-txt-secondary py-6 text-center animate-pulse">Benchmarking against the ScoutScore database…</p>
      )}
      {state.status === 'error' && (
        <p className="text-sm text-txt-secondary py-4 text-center">{state.reason}</p>
      )}

      {state.status === 'done' && (<>
      {/* Hero — compact verdict: ring + tier + percentile + pool, one tight row.
          Clickable to expand/collapse when `collapsible`; otherwise a plain,
          non-interactive header (the Player-page card's always-open look). */}
      <div
        className={`relative overflow-hidden rounded-xl border border-surface-4 px-3.5 py-2.5 ${expanded ? 'mb-3' : ''} ${collapsible ? 'cursor-pointer select-none' : ''}`}
        style={{ background: `radial-gradient(120% 160% at 10% -40%, ${withAlpha(pctColor(overallPct), 0.16)}, transparent 55%), linear-gradient(180deg, var(--surface-2), var(--surface-1))` }}
        onClick={collapsible ? () => setExpanded((v) => !v) : undefined}
        role={collapsible ? 'button' : undefined}
        tabIndex={collapsible ? 0 : undefined}
        aria-expanded={collapsible ? expanded : undefined}
        onKeyDown={collapsible ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded((v) => !v) } } : undefined}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Gauge pct={overallPct} />
          <div className="min-w-0 flex-1">
            {/* The ring already shows the percentile right beside this, so the
                verdict leads with the tier word, not the number again. */}
            <div className="font-display font-black leading-none" style={{ fontSize: 'clamp(1.3rem, 4vw, 1.75rem)', color: pctColor(overallPct) }}>{tierLabel(overallPct)}</div>
            {lensMeta && (
              <div className="text-[11px] text-txt-tertiary mt-1.5 truncate">
                vs {lensMeta.recruitCount?.toLocaleString()} {lensMeta.scopeLabel}
              </div>
            )}
          </div>
          {collapsible && (
            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-txt-tertiary"
              style={{ transition: 'transform 150ms ease', transform: expanded ? 'rotate(180deg)' : 'none' }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          )}
        </div>
      </div>

      {expanded && (<>
      {/* Lens selector — segmented pills */}
      {lenses.length > 1 && (
        <div className="inline-flex flex-wrap gap-1 p-1 rounded-xl mb-3" style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--surface-4)' }}>
          {lenses.map((l) => (
            <button
              key={l.key}
              onClick={() => setLens(l.key)}
              title={l.scopeLabel}
              className={`text-[11px] px-3 py-1 rounded-lg transition-colors ${
                l.key === activeLens ? 'bg-surface-4 text-txt-primary font-semibold' : 'text-txt-tertiary hover:text-txt-primary'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}

      {/* Attributes — a compact list per category. The group percentile lives on
          the section rule, and each attribute is a full-width row (subtly tinted
          by its own percentile) that fills the column at any count. No bars. */}
      <div className="space-y-3">
        {groupedStats.map(([groupLabel, stats]) => {
          const gp = groupPctByLabel.get(groupLabel)
          return (
            <div key={groupLabel}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-txt-muted">{groupLabel}</span>
                <span className="h-px flex-1" style={{ backgroundColor: 'var(--surface-4)' }} />
                {/* Group aggregate only earns a spot when it summarizes MORE than
                    one attribute — otherwise it just repeats the single row below. */}
                {gp != null && stats.length > 1 && (
                  <span className="font-display font-bold tabular-nums leading-none" style={{ fontSize: '0.78rem', color: pctColor(gp) }}>{ordinal(gp)}</span>
                )}
              </div>
              <div className="rounded-lg border border-surface-4 overflow-hidden">
                {stats.map((s, i) => {
                  const p = s.lenses?.[activeLens]?.percentile
                  const c = pctColor(p)
                  return (
                    <div
                      key={s.statKey}
                      className="flex items-center gap-3 px-3 py-1.5"
                      style={{ backgroundColor: withAlpha(c, 0.06), borderTop: i ? '1px solid var(--surface-4)' : 'none' }}
                    >
                      <span className="text-xs text-txt-secondary flex-1 truncate" title={s.label}>{s.label}</span>
                      <span className="font-display font-black tabular-nums text-txt-primary leading-none w-8 text-right" style={{ fontSize: '0.95rem' }}>{s.value}</span>
                      <span className="font-display font-bold tabular-nums leading-none w-10 text-right" style={{ fontSize: '0.8rem', color: c }}>{ordinal(p) || '—'}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      </>)}

      {/* Attribution — always shown, even collapsed */}
      <div className="mt-3 pt-2.5 border-t border-surface-4 text-[10px] text-txt-muted text-center">
        Benchmarks &amp; projections by{' '}
        <a href="https://maxplayscfb.com/tools/" target="_blank" rel="noopener noreferrer" className="text-txt-tertiary hover:text-txt-primary underline">
          MaxPlaysCFB
        </a>
      </div>
      </>)}
    </div>
  )
}
