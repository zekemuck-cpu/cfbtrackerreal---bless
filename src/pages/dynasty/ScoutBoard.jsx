import { useMemo, useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, EmptyState, Button } from '../../components/ui'
import { useDynasty } from '../../context/DynastyContext'
import { proxyImageUrl } from '../../utils/imageProxy'
import { getTargetStatus } from '../../utils/recruitingTargets'
import { getScoutScoresFor, headlinePercentile, ordinal, predictRecruitOverall } from '../../utils/scoutScore'
import { POSITION_FILTER_OPTIONS, matchesPositionFilter } from '../../utils/recruitFilters'
import ScoutScorePanel from '../../components/ScoutScorePanel'
import { computeScore } from '../../components/archetypeWeights'
import { buildRevealedPool, buildWeightsMap } from '../../utils/devTraitLearning'

// Scout Board (the Targets tab): tracked recruiting targets benchmarked by
// MaxPlaysCFB ScoutScore. Each row shows the recruit's ScoutScore overall
// percentile; the board ranks by it, and expanding a row reveals the full
// ScoutScore breakdown (overall + group + per-attribute percentiles).

const STAR = (n) => '★'.repeat(Math.max(0, Math.min(5, Number(n) || 0)))

const Chevron = ({ open }) => (
  <svg
    className="w-3.5 h-3.5 flex-shrink-0 transition-transform text-txt-tertiary"
    style={{ transform: open ? 'rotate(180deg)' : 'none' }}
    fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
)

function pctColor(pct) {
  if (pct == null) return 'var(--text-muted)'
  if (pct >= 75) return 'var(--accent-success, #34d399)'
  if (pct >= 40) return 'var(--text-secondary)'
  return 'var(--accent-danger, #f87171)'
}

const SS_GRADE_TIERS = [
  { letter: 'A+', min: 95 }, { letter: 'A', min: 90 }, { letter: 'A-', min: 86 },
  { letter: 'B+', min: 82 }, { letter: 'B', min: 78 }, { letter: 'B-', min: 74 },
  { letter: 'C+', min: 70 }, { letter: 'C', min: 66 }, { letter: 'C-', min: 62 },
  { letter: 'D+', min: 58 }, { letter: 'D', min: 54 }, { letter: 'D-', min: 50 },
  { letter: 'F',  min: 0 },
]
function ssLetter(score) {
  return SS_GRADE_TIERS.find(g => score >= g.min)?.letter ?? 'F'
}
function ssColor(score) {
  if (score >= 86) return '#34d399'
  if (score >= 74) return '#60a5fa'
  if (score >= 62) return '#fbbf24'
  if (score >= 50) return '#f97316'
  return '#f87171'
}

function Row({ r, rank, pathPrefix, scoutResult, scoring, sortBy, localScore, useLocalScores, draggable: isDraggable, onDragStart, onDragOver, onDrop, isDragOver, onToggleRemove, canEdit }) {
  const { p, status } = r
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const lost = status === 'committed_elsewhere'
  const committed = status === 'committed_us'
  const removed = !!p.boardRemoved

  // Sub-line: the recruit's national / position / state recruiting ranks.
  const ranks = []
  if (p.nationalRank) ranks.push({ v: p.nationalRank, l: 'Nat' })
  if (p.positionRank) ranks.push({ v: p.positionRank, l: p.position || 'Pos' })
  if (p.stateRank && p.state) ranks.push({ v: p.stateRank, l: p.state })

  const pct = scoutResult?.ok ? headlinePercentile(scoutResult.data) : null
  const badge = scoutResult ? (pct != null ? ordinal(pct) : '—') : (scoring ? '··' : '—')
  const proj = predictRecruitOverall(p)

  // When Scout Staff grades are active, the row is non-expandable — all info is already visible.
  const expandable = !useLocalScores

  return (
    <div
      draggable={isDraggable}
      onDragStart={isDraggable ? onDragStart : undefined}
      onDragOver={isDraggable ? onDragOver : undefined}
      onDrop={isDraggable ? onDrop : undefined}
      onDragLeave={isDraggable ? (e) => e.preventDefault() : undefined}
      className={isDraggable ? 'cursor-grab active:cursor-grabbing' : undefined}
      style={{
        borderTop: isDragOver ? '2px solid #60a5fa' : rank > 1 ? '1px solid var(--surface-4)' : 'none',
        opacity: lost ? 0.55 : removed ? 0.4 : 1,
      }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => expandable && setOpen((o) => !o)}
        onKeyDown={(e) => { if (expandable && (e.key === 'Enter' || e.key === ' ')) setOpen((o) => !o) }}
        className={[
          'w-full flex items-center gap-3 sm:gap-3.5 px-4 py-3 transition-colors text-left',
          isDraggable ? 'cursor-grab active:cursor-grabbing' : expandable ? '' : 'cursor-default',
          expandable ? 'hover:bg-surface-2' : '',
        ].filter(Boolean).join(' ')}
      >
        {isDraggable && (
          <span className="flex-shrink-0 text-txt-tertiary select-none" style={{ fontSize: '0.65rem', letterSpacing: '-1px', lineHeight: 1 }}>⠿</span>
        )}
        <span className="w-5 text-right tabular-nums font-display flex-shrink-0 leading-none text-txt-tertiary" style={{ fontSize: '1rem', fontWeight: 700 }}>
          {rank}
        </span>

        <div className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center overflow-hidden border" style={{ backgroundColor: 'var(--surface-3)', borderColor: 'var(--surface-4)' }}>
          {p.pictureUrl
            ? <img src={proxyImageUrl(p.pictureUrl, 200)} alt="" className="w-full h-full object-cover" />
            : <span className={`font-black uppercase text-txt-secondary ${(p.position || 'ATH').length > 3 ? 'text-[8px]' : 'text-[10px]'}`} style={{ letterSpacing: '0.04em' }}>{p.position || 'ATH'}</span>}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span
              role="link"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); navigate(`${pathPrefix}/player/${p.pid}`) }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); navigate(`${pathPrefix}/player/${p.pid}`) } }}
              className="text-[13px] sm:text-[15px] font-bold text-txt-primary truncate hover:underline cursor-pointer"
            >
              {p.name}
            </span>
            {Number(p.stars) > 0 && <span className="text-[10px] flex-shrink-0 tracking-tight" style={{ color: 'var(--accent-warning)' }}>{STAR(p.stars)}</span>}
            {committed && <span className="text-[9px] font-bold uppercase text-txt-tertiary tracking-wide flex-shrink-0">· Committed</span>}
            {lost && <span className="text-[9px] font-bold uppercase text-txt-tertiary tracking-wide flex-shrink-0">· Lost</span>}
            {removed && (
              <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider text-slate-500 border border-slate-700 bg-slate-900 flex-shrink-0">Removed</span>
            )}
          </div>
          <div className="flex flex-wrap items-baseline gap-x-1.5 sm:gap-x-3 gap-y-0.5 mt-1 text-[9px] sm:text-[11px]" style={{ letterSpacing: '0.3px' }}>
            <span className="uppercase text-txt-secondary font-semibold flex-shrink-0">{p.position || 'ATH'}</span>
            {p.archetype && <span className="uppercase text-txt-tertiary flex-shrink-0">{p.archetype}</span>}
            {proj && (
              <span className="flex-shrink-0 tabular-nums text-txt-tertiary normal-case">
                Proj. Ovr <span className="font-bold text-txt-secondary">{proj.overall}</span> ({proj.low}–{proj.high})
              </span>
            )}
            {ranks.length > 0 && (
              <span className="inline-flex items-baseline gap-x-2.5 tabular-nums">
                {ranks.map((rk) => (
                  <span key={rk.l} className="inline-flex items-baseline gap-1">
                    <span className="font-bold text-txt-secondary">#{rk.v}</span>
                    <span className="text-txt-tertiary uppercase">{rk.l}</span>
                  </span>
                ))}
              </span>
            )}
          </div>
        </div>

        {/* Big metric — follows the active sort */}
        <div className="text-right flex-shrink-0 w-16">
          {sortBy === 'projected' ? (
            <div className="font-display leading-none tabular-nums text-txt-primary" style={{ fontSize: '1.35rem', fontWeight: 800 }} title="Projected day-1 overall">
              {proj ? proj.overall : '—'}
            </div>
          ) : sortBy === 'national' ? (
            <div className="font-display leading-none tabular-nums text-txt-primary" style={{ fontSize: '1.15rem', fontWeight: 800 }} title="National recruiting rank">
              {p.nationalRank ? `#${p.nationalRank}` : '—'}
            </div>
          ) : useLocalScores ? (
            localScore != null ? (
              <div className="flex flex-col items-end gap-0" title="Scout grade">
                <div className="font-display leading-none tabular-nums" style={{ fontSize: '1.35rem', fontWeight: 800, color: ssColor(Math.round(localScore)) }}>
                  {ssLetter(Math.round(localScore))}
                </div>
                <div className="tabular-nums text-txt-tertiary" style={{ fontSize: '0.7rem', fontWeight: 700 }}>
                  {Math.round(localScore)}
                </div>
              </div>
            ) : <span className="text-txt-muted" style={{ fontSize: '1.35rem' }}>—</span>
          ) : (
            <div className="font-display leading-none tabular-nums" style={{ fontSize: '1.35rem', fontWeight: 800, color: pctColor(pct) }} title="ScoutScore overall percentile">
              {badge}
            </div>
          )}
        </div>

        {canEdit && onToggleRemove && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleRemove(p) }}
            className={`flex-shrink-0 p-1.5 rounded transition ${removed ? 'text-slate-600 hover:text-emerald-400 hover:bg-emerald-950/40' : 'text-slate-600 hover:text-red-400 hover:bg-red-950/40'}`}
            title={removed ? 'Restore to board' : 'Remove from board'}
          >
            {removed ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/>
              </svg>
            )}
          </button>
        )}

        {expandable && <Chevron open={open} />}
      </div>

      {open && !useLocalScores && (
        <div className="px-4 pb-4 pt-1 sm:pl-[4.5rem] sm:pr-6">
          <ScoutScorePanel recruit={p} />
        </div>
      )}
    </div>
  )
}

const SORT_OPTIONS = ['scoutscore', 'projected', 'national', 'priority']

export default function ScoutBoard({ dynasty, year, userTid, pathPrefix, positionFilter = 'all', onPositionFilterChange = null, viewingOwnTeam = true, onResolveTargets = null, resolveCount = 0, scoutStaffEnabled = false }) {
  const { updateDynasty, isViewOnly } = useDynasty()
  const canEdit = viewingOwnTeam && !isViewOnly
  const handleToggleRemove = async (pl) => {
    if (!dynasty) return
    const players = dynasty.players || []
    const newPlayers = players.map(p => p.pid === pl.pid ? { ...p, boardRemoved: !p.boardRemoved } : p)
    await updateDynasty(dynasty.id, { players: newPlayers }, { changedPlayerPids: [pl.pid] })
  }
  const yearN = Number(year)
  // Sort choice persists per device.
  const [sortBy, setSortBy] = useState(() => {
    try {
      const saved = localStorage.getItem('scoutBoardSortBy')
      return SORT_OPTIONS.includes(saved) ? saved : 'scoutscore'
    } catch { return 'scoutscore' }
  })
  const changeSortBy = (v) => {
    setSortBy(v)
    try { localStorage.setItem('scoutBoardSortBy', v) } catch { /* ignore */ }
  }

  // Manual priority order — array of pids in coach's preferred order.
  const PRIORITY_KEY = dynasty?.id ? `targetPriority_${dynasty.id}_${yearN}` : null
  const [priorityOrder, setPriorityOrder] = useState(() => {
    if (!PRIORITY_KEY) return []
    try { return JSON.parse(localStorage.getItem(PRIORITY_KEY)) || [] } catch { return [] }
  })
  const savePriority = (order) => {
    setPriorityOrder(order)
    if (PRIORITY_KEY) try { localStorage.setItem(PRIORITY_KEY, JSON.stringify(order)) } catch {}
  }
  const dragPid = useRef(null)
  const dragFromRemoved = useRef(false)
  const [dragOverPid, setDragOverPid] = useState(null)
  const [dragOverRemoved, setDragOverRemoved] = useState(false)
  const reorderPriority = (fromPid, toPid) => {
    if (fromPid == null || fromPid === toPid) return
    // Build a full ordered list from current ranked rows, merging with any saved priority
    const allPids = ranked.map((r) => r.p.pid)
    const base = [...priorityOrder]
    for (const pid of allPids) { if (!base.includes(pid)) base.push(pid) }
    const fi = base.indexOf(fromPid)
    const ti = base.indexOf(toPid)
    if (fi === -1 || ti === -1) return
    base.splice(fi, 1)
    base.splice(ti, 0, fromPid)
    savePriority(base)
  }

  // The tracked targets for this recruiting year. Targets belong to the user's
  // own team, so they're only shown on that team's recruiting page — never on
  // another team's class.
  const targets = useMemo(() => {
    if (!viewingOwnTeam) return []
    const out = []
    for (const p of dynasty?.players || []) {
      if (!p.isTarget || Number(p.targetYear) !== yearN) continue
      out.push({ p, status: getTargetStatus(p, userTid) })
    }
    return out
  }, [dynasty?.players, yearN, userTid, viewingOwnTeam])

  // Revealed-devTrait HS recruit pool — nudges archetype grading once enough data exists.
  const revealedPool = useMemo(() => buildRevealedPool(dynasty?.players || []), [dynasty?.players])
  const weightsMap = useMemo(() => buildWeightsMap(revealedPool, dynasty?.players || []), [revealedPool, dynasty?.players])

  // Local scores (Scout Staff mode) — computed synchronously, no API needed.
  const localScores = useMemo(() => {
    if (!scoutStaffEnabled) return new Map()
    const m = new Map()
    for (const { p } of targets) m.set(p.pid, computeScore(p, weightsMap))
    return m
  }, [scoutStaffEnabled, targets, weightsMap])

  // Benchmark every target through ScoutScore (cached, concurrency-capped).
  // Skipped entirely when Scout Staff is enabled — we use local scores instead.
  const [scores, setScores] = useState(() => new Map())
  const [scoring, setScoring] = useState(false)

  useEffect(() => {
    if (scoutStaffEnabled) return
    let alive = true
    if (targets.length === 0) { setScores(new Map()); return }
    setScoring(true)
    getScoutScoresFor(targets.map((t) => t.p)).then((map) => {
      if (!alive) return
      setScores(map)
      setScoring(false)
    })
    return () => { alive = false }
  }, [targets, scoutStaffEnabled])

  // Rank by the chosen sort (committed-elsewhere always sink to the bottom),
  // filtered by the active position dropdown.
  const ranked = useMemo(() => {
    const rows = targets.filter((t) => matchesPositionFilter(positionFilter, t.p.position))
    const pctOf = (pid) => {
      if (scoutStaffEnabled) return localScores.get(pid) ?? null
      const res = scores.get(pid)
      return res?.ok ? headlinePercentile(res.data) : null
    }
    const natOf = (p) => {
      const n = Number(p.nationalRank)
      return Number.isFinite(n) && n > 0 ? n : Infinity
    }
    const projOf = (p) => predictRecruitOverall(p)?.overall ?? null
    if (sortBy === 'priority') {
      const idxOf = (pid) => priorityOrder.indexOf(pid)
      rows.sort((a, b) => {
        const aLost = a.status === 'committed_elsewhere' ? 1 : 0
        const bLost = b.status === 'committed_elsewhere' ? 1 : 0
        if (aLost !== bLost) return aLost - bLost
        const ai = idxOf(a.p.pid)
        const bi = idxOf(b.p.pid)
        const aNew = ai === -1
        const bNew = bi === -1
        // Targets never manually placed float to the top, newest first — drag
        // them into the ranked order below to "place" them permanently.
        if (aNew !== bNew) return aNew ? -1 : 1
        if (aNew && bNew) return (b.p.scoutedAt ?? 0) - (a.p.scoutedAt ?? 0)
        return ai - bi
      })
    } else {
      rows.sort((a, b) => {
        const aLost = a.status === 'committed_elsewhere' ? 1 : 0
        const bLost = b.status === 'committed_elsewhere' ? 1 : 0
        if (aLost !== bLost) return aLost - bLost
        if (sortBy === 'national') {
          const an = natOf(a.p)
          const bn = natOf(b.p)
          if (an !== bn) return an - bn
        } else if (sortBy === 'projected') {
          const ap = projOf(a.p) ?? -1
          const bp = projOf(b.p) ?? -1
          if (bp !== ap) return bp - ap
        }
        const av = pctOf(a.p.pid) ?? -1
        const bv = pctOf(b.p.pid) ?? -1
        if (bv !== av) return bv - av
        return (Number(b.p.stars) || 0) - (Number(a.p.stars) || 0)
      })
    }
    return rows
  }, [targets, scores, localScores, scoutStaffEnabled, sortBy, positionFilter, priorityOrder])

  const activeRanked = useMemo(() => ranked.filter((r) => !r.p.boardRemoved), [ranked])
  const removedRanked = useMemo(() => ranked.filter((r) => r.p.boardRemoved), [ranked])

  if (targets.length === 0) {
    return (
      <Card>
        <EmptyState
          title={viewingOwnTeam ? 'No Targets to Scout' : 'Another team’s recruiting class'}
          message={viewingOwnTeam
            ? `Track prospects via the recruiting sheet (set their Commitment to “Uncommitted” and fill in attributes), and they'll be ranked here by ${scoutStaffEnabled ? 'your Staff' : 'ScoutScore'}.`
            : 'Targets are your own team\'s board. Switch back to your team\'s recruiting page to see them.'}
        />
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <section className="media-card overflow-hidden">
        <div className="px-3 sm:px-5 py-3 flex items-center gap-2 border-b" style={{ borderColor: 'var(--surface-4)' }}>
          <h3 className="font-display font-black uppercase leading-none text-txt-primary flex-shrink-0 whitespace-nowrap" style={{ fontSize: '14px', letterSpacing: '0.02em' }}>Big Board</h3>
          <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
            {onPositionFilterChange && (
              <label className="flex items-center gap-1.5 text-[11px] text-txt-tertiary min-w-0 flex-1 max-w-[7.5rem]">
                <span className="uppercase tracking-wide hidden sm:inline flex-shrink-0">Pos</span>
                <select
                  value={positionFilter}
                  onChange={(e) => onPositionFilterChange(e.target.value)}
                  title="Filter by position"
                  className="w-full min-w-0 text-[11px] bg-surface-2 border border-surface-4 rounded-md px-1.5 py-1 text-txt-secondary hover:text-txt-primary focus:outline-none focus:border-surface-5"
                >
                  {POSITION_FILTER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex items-center gap-1.5 text-[11px] text-txt-tertiary min-w-0 flex-1 max-w-[7.5rem]">
              <span className="uppercase tracking-wide hidden sm:inline flex-shrink-0">Sort</span>
              <select
                value={sortBy}
                onChange={(e) => changeSortBy(e.target.value)}
                title="Sort targets"
                className="w-full min-w-0 text-[11px] bg-surface-2 border border-surface-4 rounded-md px-1.5 py-1 text-txt-secondary hover:text-txt-primary focus:outline-none focus:border-surface-5"
              >
                <option value="scoutscore">{scoutStaffEnabled ? 'Scout Grade' : 'ScoutScore'}</option>
                <option value="projected">Projected Overall</option>
                <option value="national">National Rank</option>
                <option value="priority">My Priority</option>
              </select>
            </label>
            {onResolveTargets && (
              <Button variant="secondary" size="sm" className="flex-shrink-0 whitespace-nowrap !px-2.5" onClick={onResolveTargets}>
                <span className="sm:hidden">Commits ({resolveCount})</span>
                <span className="hidden sm:inline">New commits? ({resolveCount})</span>
              </Button>
            )}
          </div>
        </div>
        <div>
          {activeRanked.length === 0 ? (
            <div className="px-4 sm:px-5 py-8 text-center text-sm text-txt-tertiary">No targets at this position.</div>
          ) : activeRanked.map((r, i) => (
            <Row key={r.p.pid} r={r} rank={i + 1} pathPrefix={pathPrefix} scoutResult={scores.get(r.p.pid)} scoring={scoring} sortBy={sortBy} localScore={localScores.get(r.p.pid)} useLocalScores={scoutStaffEnabled}
              canEdit={canEdit}
              onToggleRemove={handleToggleRemove}
              draggable
              onDragStart={() => { dragPid.current = r.p.pid; dragFromRemoved.current = false }}
              onDragOver={(e) => { e.preventDefault(); setDragOverPid(r.p.pid); setDragOverRemoved(false) }}
              onDrop={() => {
                if (dragFromRemoved.current) {
                  // Restore the dragged-from-removed player, then place it here
                  const pid = dragPid.current
                  const pl = targets.find(t => t.p.pid === pid)?.p
                  if (pl) handleToggleRemove(pl)
                  reorderPriority(pid, r.p.pid)
                } else {
                  reorderPriority(dragPid.current, r.p.pid)
                }
                dragPid.current = null
                dragFromRemoved.current = false
                setDragOverPid(null)
                if (sortBy !== 'priority') changeSortBy('priority')
              }}
              isDragOver={dragOverPid === r.p.pid}
            />
          ))}
        </div>
      </section>

      <section
        className={`media-card overflow-hidden transition-colors ${dragOverRemoved ? 'ring-1 ring-red-900/40' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOverRemoved(true) }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverRemoved(false) }}
        onDrop={(e) => {
          e.preventDefault()
          const pid = dragPid.current
          if (pid && !dragFromRemoved.current) {
            const pl = targets.find(t => t.p.pid === pid)?.p
            if (pl) handleToggleRemove(pl)
          }
          dragPid.current = null
          dragFromRemoved.current = false
          setDragOverRemoved(false)
          setDragOverPid(null)
        }}
      >
        <div className="px-3 sm:px-5 py-3 flex items-center gap-2 border-b" style={{ borderColor: 'var(--surface-4)' }}>
          <h3 className="font-display font-black uppercase leading-none text-txt-tertiary flex-shrink-0 whitespace-nowrap" style={{ fontSize: '14px', letterSpacing: '0.02em' }}>Removed</h3>
          <span className="text-[11px] text-txt-tertiary">Taken off the Big Board — drag back or use the restore button.</span>
        </div>
        <div>
          {removedRanked.length === 0 && !dragOverRemoved ? (
            <div className="px-4 sm:px-5 py-8 text-center text-sm text-txt-tertiary">No removed targets.</div>
          ) : (
            <>
              {removedRanked.map((r, i) => (
                <Row key={r.p.pid} r={r} rank={i + 1} pathPrefix={pathPrefix} scoutResult={scores.get(r.p.pid)} scoring={scoring} sortBy={sortBy} localScore={localScores.get(r.p.pid)} useLocalScores={scoutStaffEnabled}
                  canEdit={canEdit}
                  onToggleRemove={handleToggleRemove}
                  draggable
                  onDragStart={() => { dragPid.current = r.p.pid; dragFromRemoved.current = true }}
                  onDragEnd={() => { dragPid.current = null; dragFromRemoved.current = false; setDragOverRemoved(false) }}
                />
              ))}
              {dragOverRemoved && removedRanked.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-txt-tertiary">Drop here to remove</div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  )
}
