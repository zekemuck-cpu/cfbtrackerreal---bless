import { useMemo, useState, useRef, useCallback } from 'react'
import { getTeamLogoByAbbr } from '../data/teams'
import { getTeamColorsByAbbr } from '../data/teamColors'

// Top 25 Movement — a bump chart of every team's poll rank across a season.
//
// COLOR NOTE: this deliberately does NOT use a validated categorical palette.
// A season routinely puts 35+ teams on this chart, far past the ~8 slots a
// categorical scheme can keep separable, and in this domain the color IS the
// entity — a reader looking for Michigan looks for maize, not "series 4".
// The rule that survives is the one that matters: color follows the ENTITY,
// never its rank, so a team keeps its hue as it moves up and down.
//
// Because team colors collide by nature (a dozen schools wear near-identical
// red), color alone can NEVER be the identity channel here. Two things carry
// it instead: each team's LOGO is drawn at every plotted point, and the strip
// below the chart is both legend and control — hover or focus a chip and that
// team's line lifts while the rest recede. The Top 25 table on the same page
// is the table-view twin, so every value is readable without hovering at all.

const ROW_H = 21          // px per rank row — 25 rows plus padding
const COL_W = 92          // px per poll column
const PAD_T = 22
const PAD_B = 40          // must fit the x-axis band; never clip it
const PAD_L = 34          // rank gutter
const PAD_R = 22
const LOGO = 17
const DIM = 0.16          // context lines: present as a field, never competing

export default function Top25MovementChart({ dynasty, year, weeks, weekLabel }) {
  const [hoverTid, setHoverTid] = useState(null)
  // Default to the user's OWN team, not "everything at once". Rendered with
  // every line at full strength this is a 30-line hairball that carries no
  // signal — the same tangle the request's own mockup showed. Anchoring on
  // one team turns it into a season arc read against the field, and the
  // dynasty always has a team to anchor on. "All teams" is one click away
  // for whoever actually wants the overview.
  const [pinTid, setPinTid] = useState(() => {
    const t = Number(dynasty?.currentTid)
    return Number.isFinite(t) ? t : null
  })
  const [cursor, setCursor] = useState(null) // { xi, tid, rank, clientX, clientY }
  const svgRef = useRef(null)


  // One series per team that was ranked in at least one of these weeks.
  // `segments` splits on gaps: a team that falls out of the poll and later
  // returns must NOT get a line drawn across the weeks it was unranked —
  // that would draw a rank it never held.
  const series = useMemo(() => {
    const teams = dynasty?.teams || {}
    const out = []
    for (const [tidKey, team] of Object.entries(teams)) {
      const byYear = team?.byYear?.[year] ?? team?.byYear?.[String(year)]
      if (!byYear) continue
      const media = byYear.rankByWeek || {}
      const cfp = byYear.cfpRankByWeek || {}
      const points = []
      weeks.forEach((w, xi) => {
        // Same poll-precedence rule the Top 25 table on this page uses (CFP
        // from week 10, each falling back to the other) — sourcing it any
        // differently would let the chart contradict the table beside it.
        const usesCfp = Number(w) >= 10
        let v = usesCfp ? (cfp[w] ?? cfp[String(w)]) : (media[w] ?? media[String(w)])
        if (typeof v !== 'number' || v < 1 || v > 25) {
          v = usesCfp ? (media[w] ?? media[String(w)]) : (cfp[w] ?? cfp[String(w)])
        }
        if (typeof v !== 'number' || v < 1 || v > 25) return
        points.push({ xi, week: w, rank: v })
      })
      if (points.length === 0) continue
      const segments = []
      let run = []
      for (const p of points) {
        if (run.length && p.xi !== run[run.length - 1].xi + 1) { segments.push(run); run = [] }
        run.push(p)
      }
      if (run.length) segments.push(run)
      const abbr = team.abbr
      out.push({
        tid: Number(tidKey),
        abbr,
        name: team.name || abbr,
        logo: getTeamLogoByAbbr(abbr, teams),
        color: getTeamColorsByAbbr(abbr, teams)?.primary || '#6e6e78',
        points,
        segments,
        best: Math.min(...points.map(p => p.rank)),
      })
    }
    // Best finish first so the strip reads like a leaderboard.
    return out.sort((a, b) => a.best - b.best || a.abbr.localeCompare(b.abbr))
  }, [dynasty, year, weeks])

  // A pin that matches no plotted team would dim every line and highlight
  // nothing — exactly what happens to a dynasty whose own team never cracked
  // the poll. Fall back to the all-teams view in that case.
  const hasPinned = pinTid != null && series.some(s => s.tid === pinTid)
  const activeTid = hoverTid ?? (hasPinned ? pinTid : null)

  const plotW = Math.max(560, weeks.length * COL_W)
  const width = PAD_L + plotW + PAD_R
  const height = PAD_T + ROW_H * 25 + PAD_B
  const x = useCallback((xi) => PAD_L + (weeks.length === 1 ? plotW / 2 : (xi / (weeks.length - 1)) * plotW), [weeks.length, plotW])
  const y = (rank) => PAD_T + (rank - 0.5) * ROW_H

  // Nearest-point hover: the pointer only has to be CLOSEST, never dead-on a
  // 2px line or a 17px logo. Without this the chart is unusable at 25 lines.
  const onMove = useCallback((e) => {
    const svg = svgRef.current
    if (!svg) return
    const box = svg.getBoundingClientRect()
    const scale = box.width / width
    const px = (e.clientX - box.left) / scale
    const py = (e.clientY - box.top) / scale
    let best = null, bestD = Infinity
    for (const s of series) {
      for (const p of s.points) {
        const dx = x(p.xi) - px
        const dy = y(p.rank) - py
        const d = dx * dx + dy * dy
        if (d < bestD) { bestD = d; best = { s, p } }
      }
    }
    // ~34px capture radius, comfortably past the 24px hit-target floor.
    if (!best || bestD > 34 * 34) { setCursor(null); setHoverTid(null); return }
    setHoverTid(best.s.tid)
    setCursor({ xi: best.p.xi, tid: best.s.tid, rank: best.p.rank, week: best.p.week, name: best.s.name, color: best.s.color, logo: best.s.logo })
  }, [series, x, width])

  const clearHover = () => { setHoverTid(null); setCursor(null) }

  if (series.length === 0) return null

  // Movement vs the team's previous ranked week, for the tooltip.
  const delta = (() => {
    if (!cursor) return null
    const s = series.find(v => v.tid === cursor.tid)
    if (!s) return null
    const i = s.points.findIndex(p => p.xi === cursor.xi)
    if (i <= 0) return null
    const prev = s.points[i - 1]
    if (prev.xi !== cursor.xi - 1) return null // returned after a gap, not a move
    return prev.rank - cursor.rank
  })()

  return (
    <div>
      <div className="overflow-x-auto">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="img"
          aria-label={`Top 25 rank movement by week for ${year}. ${series.length} teams. The Top 25 table below lists the same rankings.`}
          onPointerMove={onMove}
          onPointerLeave={clearHover}
          style={{ maxWidth: 'none', touchAction: 'pan-x' }}
        >
          {/* Recessive hairline grid — solid, one shade off the surface. */}
          {Array.from({ length: 25 }, (_, i) => i + 1).map(r => (
            (r === 1 || r % 5 === 0) && (
              <g key={r}>
                <line x1={PAD_L} x2={PAD_L + plotW} y1={y(r)} y2={y(r)} stroke="var(--surface-4)" strokeWidth="1" />
                <text x={PAD_L - 9} y={y(r)} textAnchor="end" dominantBaseline="middle"
                  className="tabular" style={{ fontSize: 10, fill: 'var(--text-tertiary)' }}>{r}</text>
              </g>
            )
          ))}

          {/* Crosshair: readers aim at a week, not at a line. */}
          {cursor && (
            <line x1={x(cursor.xi)} x2={x(cursor.xi)} y1={PAD_T} y2={PAD_T + ROW_H * 25}
              stroke="var(--surface-5)" strokeWidth="1" />
          )}

          {weeks.map((w, xi) => (
            <text key={w} x={x(xi)} y={height - PAD_B + 22} textAnchor="middle"
              style={{ fontSize: 10, fill: 'var(--text-tertiary)' }}>{shortWeek(w, weekLabel)}</text>
          ))}

          {/* Lines. Active team drawn last so it sits above the pack. */}
          {[...series].sort((a, b) => (a.tid === activeTid ? 1 : 0) - (b.tid === activeTid ? 1 : 0)).map(s => {
            const isActive = activeTid === s.tid
            const op = activeTid == null ? 0.85 : (isActive ? 1 : DIM)
            return (
              <g key={s.tid} style={{ pointerEvents: 'none' }}>
                {s.segments.map((seg, i) => (
                  <polyline
                    key={i}
                    points={seg.map(p => `${x(p.xi)},${y(p.rank)}`).join(' ')}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={isActive ? 3 : (activeTid == null ? 2 : 1.5)}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={op}
                  />
                ))}
                {/* The logo is what actually identifies the team — color alone
                    can't, with this many near-identical school reds. */}
                {(activeTid == null || isActive) && s.points.map(p => (
                  <g key={p.xi} opacity={op}>
                    <circle cx={x(p.xi)} cy={y(p.rank)} r={LOGO / 2 + 1}
                      fill="var(--surface-2)" stroke="var(--surface-2)" strokeWidth="2" />
                    {s.logo
                      ? <image href={s.logo} x={x(p.xi) - LOGO / 2} y={y(p.rank) - LOGO / 2}
                          width={LOGO} height={LOGO} preserveAspectRatio="xMidYMid meet" />
                      : <circle cx={x(p.xi)} cy={y(p.rank)} r={LOGO / 2 - 2} fill={s.color} />}
                  </g>
                ))}
              </g>
            )
          })}
        </svg>
      </div>

      {cursor && (
        <div className="mt-2 flex items-center gap-2 text-sm" aria-live="polite">
          {cursor.logo && <img src={cursor.logo} alt="" className="w-5 h-5 object-contain" />}
          <span className="font-bold tabular text-txt-primary">#{cursor.rank}</span>
          <span className="text-txt-secondary">{cursor.name}</span>
          <span className="text-txt-tertiary">· {weekLabel(cursor.week)}</span>
          {delta != null && delta !== 0 && (
            <span className="tabular" style={{ color: delta > 0 ? 'var(--accent-success)' : 'var(--accent-error)' }}>
              {delta > 0 ? `up ${delta}` : `down ${-delta}`}
            </span>
          )}
        </div>
      )}

      {/* Legend AND control. Identity never rests on color: every chip pairs
          the swatch with a logo and the team's abbreviation. */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setPinTid(null)}
          aria-pressed={!hasPinned}
          className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold"
          style={{
            backgroundColor: !hasPinned ? 'var(--surface-4)' : 'var(--surface-3)',
            color: !hasPinned ? 'var(--text-primary)' : 'var(--text-secondary)',
            border: '1px solid transparent',
          }}
        >
          All teams
        </button>
        {series.map(s => {
          const on = activeTid === s.tid
          return (
            <button
              key={s.tid}
              type="button"
              onMouseEnter={() => setHoverTid(s.tid)}
              onMouseLeave={() => setHoverTid(null)}
              onFocus={() => setHoverTid(s.tid)}
              onBlur={() => setHoverTid(null)}
              onClick={() => setPinTid(pinTid === s.tid ? null : s.tid)}
              aria-pressed={pinTid === s.tid}
              title={`${s.name} — best #${s.best}`}
              className="inline-flex items-center gap-1 pl-1 pr-1.5 py-0.5 rounded text-[11px] font-semibold transition-opacity"
              style={{
                backgroundColor: on ? 'var(--surface-4)' : 'var(--surface-3)',
                color: 'var(--text-secondary)',
                opacity: activeTid == null || on ? 1 : 0.45,
                border: `1px solid ${on ? s.color : 'transparent'}`,
              }}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
              {s.logo && <img src={s.logo} alt="" className="w-3.5 h-3.5 object-contain" />}
              {s.abbr}
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-txt-tertiary">
        Hover the chart or a team below to follow one line. Click a team to keep it highlighted.
        A line breaks where a team dropped out of the poll.
      </p>
    </div>
  )
}

// Compact axis labels — the full weekLabel ("National Championship") is far
// too wide for a 92px column, so the axis gets an abbreviation and the
// tooltip carries the full name.
function shortWeek(w, weekLabel) {
  if (w === 0) return 'Pre'
  if (w === 16) return 'CCG'
  if (w === 17) return 'B1'
  if (w === 18) return 'B2'
  if (w === 19) return 'B3'
  if (w === 20) return 'NC'
  if (w === 101) return 'CFP R1'
  if (w === 102) return 'CFP QF'
  if (w === 103) return 'CFP SF'
  if (w === 104) return 'CFP NC'
  if (w === 105) return 'Final'
  return typeof w === 'number' ? `Wk ${w}` : weekLabel(w)
}
