import { useMemo, useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, EmptyState, Button } from '../../components/ui'
import { useDynasty } from '../../context/DynastyContext'
import { proxyImageUrl } from '../../utils/imageProxy'
import { getTargetStatus } from '../../utils/recruitingTargets'
import { getScoutScoresFor, headlinePercentile, predictRecruitOverall } from '../../utils/scoutScore'
import { POSITION_FILTER_OPTIONS, matchesPositionFilter } from '../../utils/recruitFilters'
import { GradeReportContent, getGradeTier, DevTraitPill } from '../../components/PlayerDatabase'
import { computeScore } from '../../components/archetypeWeights'
import { buildRevealedPool } from '../../utils/devTraitLearning'
import { buildAttributeQualityMap } from '../../utils/devPrediction'
import GemBustIcon from '../../components/GemBustIcon'
import ClearAllTargetsModal from '../../components/ClearAllTargetsModal'
import { shapeTargetForDatabase, positionBucket } from '../../utils/recruitAttributes'
import { useToast } from '../../components/ui/Toast'

// Scout Board (the Targets tab): tracked recruiting targets. Each compact
// row shows name, stars, ranks, and a grade + composite score (local Scout
// Staff score when available, else the ScoutScore percentile mapped through
// the same letter scale); expanding a row reveals archetype, Proj Ovr, and
// the same scouting report used in the Recruiting Database (GradeReportContent).

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

function Row({ r, rank, pathPrefix, scoutResult, scoring, localScore, useLocalScores, allPlayers, weightsMap, pool, draggable: isDraggable, onDragStart, onDragOver, onDrop, isDragOver, onToggleRemove, canEdit, isOpen, onToggleOpen }) {
  const { p, status } = r
  const navigate = useNavigate()
  const open = isOpen
  const lost = status === 'committed_elsewhere'
  const committed = status === 'committed_us'
  const removed = !!p.boardRemoved

  // National/state/position rank now live in the always-visible row itself
  // (alongside position); archetype + Proj Ovr stay in the expanded dropdown.
  const ranks = []
  if (p.nationalRank) ranks.push({ v: p.nationalRank, l: 'National' })
  if (p.stateRank && p.state) ranks.push({ v: p.stateRank, l: p.state })
  if (p.positionRank) ranks.push({ v: p.positionRank, l: p.rawPosition || p.position || 'Position' })

  const pct = scoutResult?.ok ? headlinePercentile(scoutResult.data) : null
  const proj = predictRecruitOverall(p)

  // Dragging is only meaningful for the collapsed row — once expanded, the
  // row is tall and full of its own interactive content (the embedded grade
  // report), and the drag handlers living on this same container would
  // hijack clicks/selection inside it. Collapse first, then reorder.
  const canDrag = isDraggable && !open

  // Compact "grade + composite" is always shown now, regardless of sort mode:
  // the local Scout Staff score when available, else the ScoutScore
  // percentile mapped through the same letter-tier scale, so every row shows
  // some grade+number consistently instead of swapping metric by sort choice.
  const compositeSource = useLocalScores ? localScore : pct
  const hasComposite = compositeSource != null
  // Same GRADE_TIERS the Recruiting Database grades against, so a given score
  // renders as the exact same letter + color in both places.
  const compositeTier = hasComposite ? getGradeTier(Math.round(compositeSource)) : null

  return (
    <div
      draggable={canDrag}
      onDragStart={canDrag ? onDragStart : undefined}
      onDragOver={canDrag ? onDragOver : undefined}
      onDrop={canDrag ? onDrop : undefined}
      onDragLeave={canDrag ? (e) => e.preventDefault() : undefined}
      className={canDrag ? 'cursor-grab active:cursor-grabbing' : undefined}
      style={{
        borderTop: isDragOver ? '2px solid #60a5fa' : rank > 1 ? '1px solid var(--surface-4)' : 'none',
        opacity: lost ? 0.55 : removed ? 0.4 : 1,
      }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onToggleOpen}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggleOpen() }}
        className={[
          'w-full flex items-center gap-3 sm:gap-3.5 px-4 py-3 transition-colors text-left hover:bg-surface-2',
          canDrag ? 'cursor-grab active:cursor-grabbing' : '',
        ].filter(Boolean).join(' ')}
      >
        {isDraggable && (
          <span className={`flex-shrink-0 text-txt-tertiary select-none ${canDrag ? '' : 'opacity-30'}`} style={{ fontSize: '0.65rem', letterSpacing: '-1px', lineHeight: 1 }}>⠿</span>
        )}
        <span className="w-5 text-right tabular-nums font-display flex-shrink-0 leading-none text-txt-tertiary" style={{ fontSize: '1rem', fontWeight: 700 }}>
          {rank}
        </span>

        <div className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center overflow-hidden border" style={{ backgroundColor: 'var(--surface-3)', borderColor: 'var(--surface-4)' }}>
          {p.pictureUrl
            ? <img src={proxyImageUrl(p.pictureUrl, 200)} alt="" className="w-full h-full object-cover" />
            : <span className={`font-black uppercase text-txt-secondary ${(p.rawPosition || p.position || 'ATH').length > 3 ? 'text-[8px]' : 'text-[10px]'}`} style={{ letterSpacing: '0.04em' }}>{p.rawPosition || p.position || 'ATH'}</span>}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="relative inline-block">
              <span
                role="link"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); navigate(`${pathPrefix}/player/${p.pid}`) }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); navigate(`${pathPrefix}/player/${p.pid}`) } }}
                className="text-[13px] sm:text-[15px] font-bold text-txt-primary truncate hover:underline cursor-pointer"
              >
                {p.name}
              </span>
              <GemBustIcon type={p.gemBust} />
            </span>
            {Number(p.stars) > 0 && <span className="text-[10px] flex-shrink-0 tracking-tight" style={{ color: 'var(--accent-warning)' }}>{STAR(p.stars)}</span>}
            {committed && <span className="text-[9px] font-bold uppercase text-txt-tertiary tracking-wide flex-shrink-0">· Committed</span>}
            {lost && <span className="text-[9px] font-bold uppercase text-txt-tertiary tracking-wide flex-shrink-0">· Lost</span>}
            {removed && (
              <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider text-slate-500 border border-slate-700 bg-slate-900 flex-shrink-0">Removed</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-2.5 sm:gap-x-3 gap-y-0.5 mt-1 text-[9px] sm:text-[11px] tabular-nums" style={{ letterSpacing: '0.3px' }}>
            <span className="uppercase text-txt-secondary font-semibold">{p.rawPosition || p.position || 'ATH'}</span>
            {ranks.map((rk) => (
              <span key={rk.l} className="inline-flex items-baseline gap-1 normal-case">
                <span className="font-bold text-txt-secondary">#{rk.v}</span>
                <span className="text-txt-tertiary uppercase">{rk.l}</span>
              </span>
            ))}
            {p.devTrait && <DevTraitPill devTrait={p.devTrait} />}
          </div>
        </div>

        {/* Always-visible: grade + composite score */}
        <div className="text-right flex-shrink-0 w-16">
          {hasComposite ? (
            <div className="flex flex-col items-end gap-0" title={useLocalScores ? 'Scout grade' : 'ScoutScore percentile, shown as a grade'}>
              <div className="font-display leading-none tabular-nums" style={{ fontSize: '1.35rem', fontWeight: 800, color: compositeTier.color }}>
                {compositeTier.grade}
              </div>
              <div className="tabular-nums text-txt-tertiary" style={{ fontSize: '0.7rem', fontWeight: 700 }}>
                {compositeSource.toFixed(1)}
              </div>
            </div>
          ) : <span className="text-txt-muted" style={{ fontSize: '1.35rem' }}>—</span>}
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

        <Chevron open={open} />
      </div>

      {open && (
        <div className="px-4 pb-4 pt-1 sm:pl-[4.5rem] sm:pr-6 space-y-3">
          {/* Archetype + Proj Ovr are added here specifically for the Targets
              board — the embedded report itself (GradeReportContent, shared
              verbatim with the Recruiting Database) doesn't include them in
              its own (wide) header, since this row already covers it. Dev
              trait lives on the always-visible row above instead (see the
              position/ranks line), not gated behind the dropdown. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] tabular-nums">
            {p.archetype && (
              <span className="normal-case"><span className="text-txt-tertiary uppercase">Archetype </span><span className="font-bold text-txt-secondary">{p.archetype}</span></span>
            )}
            {proj && (
              <span className="normal-case text-txt-tertiary">
                Proj. Ovr <span className="font-bold text-txt-secondary">{proj.overall}</span> ({proj.low}–{proj.high})
              </span>
            )}
          </div>
          <div className="bg-surface-2 border border-surface-4 rounded-2xl overflow-hidden">
            <GradeReportContent player={p} allPlayers={allPlayers} weightsMap={weightsMap} pool={pool} wide />
          </div>
        </div>
      )}
    </div>
  )
}

const SORT_OPTIONS = ['scoutscore', 'national', 'priority']

export default function ScoutBoard({ dynasty, year, userTid, pathPrefix, positionFilter = 'all', onPositionFilterChange = null, viewingOwnTeam = true, onResolveTargets = null, resolveCount = 0, scoutStaffEnabled = false }) {
  const { updateDynasty, updateRecruitingDatabasePlayers, isViewOnly } = useDynasty()
  const { toast } = useToast()
  const canEdit = viewingOwnTeam && !isViewOnly
  const handleToggleRemove = async (pl) => {
    if (!dynasty) return
    const players = dynasty.players || []
    const newPlayers = players.map(p => p.pid === pl.pid ? { ...p, boardRemoved: !p.boardRemoved } : p)
    await updateDynasty(dynasty.id, { players: newPlayers }, { changedPlayerPids: [pl.pid] })
  }

  const [showClearAll, setShowClearAll] = useState(false)
  // mode: 'keep' archives each cleared target into the Recruiting Database
  // first (skipping anyone already archived, e.g. from a prior Clear All)
  // before removing them from dynasty.players — 'full' removes them outright
  // with no archive step, so they disappear from the Database too.
  const handleClearAll = async (pids, mode) => {
    if (!dynasty || !pids.length) return
    const pidSet = new Set(pids.map(String))
    const playersArr = dynasty.players || []
    if (mode === 'keep') {
      const alreadyArchived = new Set((dynasty.recruitingDatabasePlayers || []).map(p => String(p.pid)))
      const toArchive = playersArr
        .filter(p => pidSet.has(String(p.pid)) && !alreadyArchived.has(String(p.pid)))
        .map(shapeTargetForDatabase)
      if (toArchive.length) {
        await updateRecruitingDatabasePlayers(dynasty.id, [...(dynasty.recruitingDatabasePlayers || []), ...toArchive])
      }
    }
    const nextPlayers = playersArr.filter(p => !pidSet.has(String(p.pid)))
    await updateDynasty(dynasty.id, { players: nextPlayers })
    toast.success(
      mode === 'keep'
        ? `Cleared ${pids.length} target${pids.length === 1 ? '' : 's'} — kept in the Recruiting Database.`
        : `Cleared ${pids.length} target${pids.length === 1 ? '' : 's'} completely.`
    )
  }
  const yearN = Number(year)
  // Only one row's dropdown can be expanded at a time — shared across both
  // the active Big Board list and the Removed list below it, since they're
  // both built from the same Row component.
  const [openPid, setOpenPid] = useState(null)
  const toggleOpenPid = (pid) => setOpenPid(cur => (cur === pid ? null : pid))
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
  //
  // rawPosition/position mirrors ScoutStaff.jsx's shapeRecruit: dynasty.players
  // stores a Target's specific raw position ("RT", "SAM", ...), but grading
  // (archetypeBaseScore's position+archetype key, GradeReportContent's own
  // position-based comp filtering) needs the BUCKETED position ("OT", "MIKE")
  // to line up with how the Recruiting Database keys the exact same recruits
  // — otherwise a Target's grade can't find its own comps under a mismatched
  // key, even when they exist. rawPosition keeps today's specific-position
  // display (badges, rank labels) unchanged.
  const targets = useMemo(() => {
    if (!viewingOwnTeam) return []
    const out = []
    for (const p of dynasty?.players || []) {
      if (!p.isTarget || Number(p.targetYear) !== yearN) continue
      const bucketed = { ...p, rawPosition: p.position, position: positionBucket(p.position) }
      out.push({ p: bucketed, status: getTargetStatus(p, userTid) })
    }
    return out
  }, [dynasty?.players, yearN, userTid, viewingOwnTeam])

  // Grading comp pool — every recruit the Recruiting Database itself grades
  // against (real Targets across every class year, bucketed the same way,
  // PLUS recruitingDatabasePlayers extras that were imported straight into
  // the Database and never became a Target), minus anything explicitly
  // excluded from the Database view. Mirrors PlayerDatabase.jsx's own
  // combinedPlayers/pool exactly, so a recruit grades identically whether
  // you're looking at him on the Targets board or in the Database — without
  // this, an archetype with plenty of comps in the Database could show
  // "can't grade yet" here just because none of those comps happen to be
  // real Targets in dynasty.players.
  const gradingPool = useMemo(() => {
    const excluded = new Set((dynasty?.recruitingDatabaseExcludedPids || []).map(String))
    const allTargets = (dynasty?.players || [])
      .filter(p => p?.isTarget && p.name && !excluded.has(String(p.pid)))
      .map(p => ({ ...p, rawPosition: p.position, position: positionBucket(p.position) }))
    const seen = new Set(allTargets.map(p => String(p.pid)))
    const extras = (dynasty?.recruitingDatabasePlayers || [])
      .filter(p => !seen.has(String(p.pid)) && !excluded.has(String(p.pid)))
    return [...allTargets, ...extras]
  }, [dynasty?.players, dynasty?.recruitingDatabasePlayers, dynasty?.recruitingDatabaseExcludedPids])

  // Revealed-devTrait HS recruit pool — nudges archetype grading once enough data exists.
  const revealedPool = useMemo(() => buildRevealedPool(gradingPool), [gradingPool])
  const weightsMap = useMemo(() => buildAttributeQualityMap(revealedPool, gradingPool), [revealedPool, gradingPool])

  // Local scores (Scout Staff mode) — computed synchronously, no API needed.
  const localScores = useMemo(() => {
    if (!scoutStaffEnabled) return new Map()
    const m = new Map()
    for (const { p } of targets) m.set(p.pid, computeScore(p, weightsMap, revealedPool))
    return m
  }, [scoutStaffEnabled, targets, weightsMap, revealedPool])

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
  const openTargetCount = useMemo(() => targets.filter((t) => t.status === 'open').length, [targets])

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
            {canEdit && (
              <Button
                variant="secondary"
                size="sm"
                className="flex-shrink-0 whitespace-nowrap !px-2.5"
                onClick={() => setShowClearAll(true)}
                disabled={openTargetCount === 0}
                title={openTargetCount === 0 ? 'No open targets to clear' : 'Clear all open targets'}
              >
                Clear All
              </Button>
            )}
          </div>
        </div>
        <div>
          {activeRanked.length === 0 ? (
            <div className="px-4 sm:px-5 py-8 text-center text-sm text-txt-tertiary">No targets at this position.</div>
          ) : activeRanked.map((r, i) => (
            <Row key={r.p.pid} r={r} rank={i + 1} pathPrefix={pathPrefix} scoutResult={scores.get(r.p.pid)} scoring={scoring} localScore={localScores.get(r.p.pid)} useLocalScores={scoutStaffEnabled} allPlayers={gradingPool} weightsMap={weightsMap} pool={revealedPool}
              isOpen={openPid === r.p.pid}
              onToggleOpen={() => toggleOpenPid(r.p.pid)}
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
                <Row key={r.p.pid} r={r} rank={i + 1} pathPrefix={pathPrefix} scoutResult={scores.get(r.p.pid)} scoring={scoring} localScore={localScores.get(r.p.pid)} useLocalScores={scoutStaffEnabled} allPlayers={gradingPool} weightsMap={weightsMap} pool={revealedPool}
                  isOpen={openPid === r.p.pid}
                  onToggleOpen={() => toggleOpenPid(r.p.pid)}
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

      {/* Guaranteed trailing space: an expanded row's embedded grade report can
          be tall, and whichever row happens to be LAST (in either section
          above) has nothing else below it to push the fixed bottom ticker out
          of the way. Without this, that row's own content — not just
          whitespace — is what ends up scrolled underneath the ticker. */}
      <div className="h-16" aria-hidden="true" />

      {showClearAll && (
        <ClearAllTargetsModal
          targets={targets}
          onClose={() => setShowClearAll(false)}
          onConfirm={handleClearAll}
        />
      )}
    </div>
  )
}
