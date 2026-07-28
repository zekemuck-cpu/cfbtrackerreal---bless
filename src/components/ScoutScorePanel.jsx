import { useEffect, useState, useMemo } from 'react'
import { getScoutScore, ordinal, defaultLensKey } from '../utils/scoutScore'
import { useDynasty } from '../context/DynastyContext'
import { getEditionKey } from '../editions'

// A percentile's accent color: strong (green) high, muted mid, weak (red) low.
function pctColor(pct) {
  if (pct == null) return 'var(--text-muted)'
  if (pct >= 80) return '#34d399'
  if (pct >= 60) return '#a3e635'
  if (pct >= 40) return 'var(--text-secondary)'
  if (pct >= 20) return '#fbbf24'
  return '#f87171'
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

// Circular percentile gauge.
function Gauge({ pct }) {
  const r = 33
  const circ = 2 * Math.PI * r
  const p = Math.max(0, Math.min(100, pct ?? 0))
  const dash = (p / 100) * circ
  const color = pctColor(pct)
  return (
    <svg width="84" height="84" viewBox="0 0 84 84" className="shrink-0">
      <circle cx="42" cy="42" r={r} fill="none" stroke="var(--surface-4)" strokeWidth="7" />
      <circle
        cx="42" cy="42" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`} transform="rotate(-90 42 42)"
        style={{ transition: 'stroke-dasharray 500ms ease' }}
      />
      <text x="42" y="40" textAnchor="middle" style={{ fontSize: '19px', fontWeight: 800, fill: 'var(--text-primary)' }}>
        {pct == null ? '—' : ordinal(pct)}
      </text>
      <text x="42" y="54" textAnchor="middle" style={{ fontSize: '7.5px', letterSpacing: '1.5px', fill: 'var(--text-muted)' }}>
        PCTILE
      </text>
    </svg>
  )
}

function Bar({ pct }) {
  return (
    <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--surface-4)' }}>
      <div
        className="h-full rounded-full"
        style={{ width: `${Math.max(2, Math.min(100, Math.round(pct ?? 0)))}%`, backgroundColor: pctColor(pct), transition: 'width 400ms ease' }}
      />
    </div>
  )
}

// Inline ScoutScore result for a single recruit. Self-fetching (cached), so it
// renders the same whether on the Scout Board card or a player page.
//
// `collapsible` (default false, preserving the Player-page card's existing
// always-expanded behavior): when true, only the headline gauge/tier shows
// initially — sized to match a compact host box (e.g. the Score Breakdown
// card on the Targets board) — with a chevron to expand the lens selector/
// group summaries/per-attribute bars on demand.
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
    getScoutScore({ ...recruit, sourceGame }).then((r) => {
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
  // order follows the order categories first appear in the stat list — this is
  // the canonical top-to-bottom order the summary cards mirror left-to-right.
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

  // Summary cards ordered to match the per-attribute sections below.
  const groups = useMemo(() => {
    const available = (data?.groupSummaries?.[activeLens] || []).filter((g) => g.available)
    const order = groupedStats.map(([label]) => label)
    const idx = (label) => { const i = order.indexOf(label); return i < 0 ? 999 : i }
    return [...available].sort((a, b) => idx(a.label) - idx(b.label))
  }, [data, activeLens, groupedStats])

  const overallPct = overall?.percentile

  return (
    <div>
      {state.status === 'loading' && (
        <p className="text-sm text-txt-secondary py-6 text-center animate-pulse">Benchmarking against the ScoutScore database…</p>
      )}
      {state.status === 'error' && (
        <p className="text-sm text-txt-secondary py-4 text-center">{state.reason}</p>
      )}

      {state.status === 'done' && (<>
      {/* Headline — gauge + tier. Clickable to expand/collapse when
          collapsible; otherwise a plain (non-interactive) header, exactly
          the Player-page card's original look. */}
      <div
        className={`flex items-center gap-4 rounded-xl border border-surface-4 p-4 ${expanded ? 'mb-4' : ''} ${collapsible ? 'cursor-pointer select-none' : 'justify-center'}`}
        style={{ background: 'linear-gradient(180deg, var(--surface-2), var(--surface-1))' }}
        onClick={collapsible ? () => setExpanded((v) => !v) : undefined}
        role={collapsible ? 'button' : undefined}
        tabIndex={collapsible ? 0 : undefined}
        aria-expanded={collapsible ? expanded : undefined}
        onKeyDown={collapsible ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded((v) => !v) } } : undefined}
      >
        <Gauge pct={overallPct} />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wider text-txt-muted">Overall percentile</div>
          <div className="text-xl sm:text-2xl font-bold leading-tight" style={{ color: pctColor(overallPct) }}>{tierLabel(overallPct)}</div>
          {lensMeta && (
            <div className="text-[11px] text-txt-tertiary mt-0.5 truncate">
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

      {expanded && (<>
        {/* Lens selector — segmented */}
        {lenses.length > 1 && (
          <div className="inline-flex flex-wrap gap-1 p-1 rounded-lg mb-4" style={{ backgroundColor: 'var(--surface-2)' }}>
            {lenses.map((l) => (
              <button
                key={l.key}
                onClick={() => setLens(l.key)}
                title={l.scopeLabel}
                className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${
                  l.key === activeLens ? 'bg-surface-4 text-txt-primary font-semibold' : 'text-txt-tertiary hover:text-txt-primary'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        )}

        {/* Group summaries — centered so a 3-group profile doesn't hug the left */}
        {groups.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2 sm:gap-2.5 mb-5">
            {groups.map((g) => (
              <div key={g.groupKey} className="rounded-lg border border-surface-4 p-2 sm:p-2.5 grow shrink basis-[30%] min-w-0 sm:grow-0 sm:basis-40">
                <div className="flex items-baseline justify-between gap-1 mb-1.5">
                  <span className="text-[9px] uppercase tracking-wide text-txt-muted truncate">{g.label}</span>
                  <span className="text-xs sm:text-sm font-bold tabular-nums leading-none flex-shrink-0" style={{ color: pctColor(g.percentile) }}>{ordinal(g.percentile)}</span>
                </div>
                <Bar pct={g.percentile} />
              </div>
            ))}
          </div>
        )}

        {/* Per-attribute, grouped by category */}
        <div className="space-y-3.5">
          {groupedStats.map(([groupLabel, stats]) => (
            <div key={groupLabel}>
              <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-txt-muted mb-1.5">{groupLabel}</div>
              <div className="space-y-1.5">
                {stats.map((s) => {
                  const p = s.lenses?.[activeLens]?.percentile
                  return (
                    <div key={s.statKey} className="flex items-center gap-3">
                      <span className="text-xs text-txt-secondary w-28 shrink-0 truncate" title={s.label}>{s.label}</span>
                      <span className="text-xs tabular-nums font-bold text-txt-primary w-7 text-right shrink-0">{s.value}</span>
                      <div className="flex-1"><Bar pct={p} /></div>
                      <span className="text-[11px] tabular-nums font-semibold w-9 text-right shrink-0" style={{ color: pctColor(p) }}>{ordinal(p) || '—'}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </>)}
      </>)}

      {/* Attribution — always shown, even collapsed */}
      <div className="mt-4 pt-3 border-t border-surface-4 text-[10px] text-txt-muted text-center">
        Benchmarks &amp; projections by{' '}
        <a href="https://maxplayscfb.com/tools/" target="_blank" rel="noopener noreferrer" className="text-txt-tertiary hover:text-txt-primary underline">
          MaxPlaysCFB
        </a>
      </div>
    </div>
  )
}
