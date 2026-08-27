import { useMemo, useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, EmptyState } from '../../components/ui'
import { useDynasty } from '../../context/DynastyContext'
import { proxyImageUrl } from '../../utils/imageProxy'
import { getTargetStatus } from '../../utils/recruitingTargets'
import { getScoutScoresFor, headlinePercentile, predictRecruitOverall, ordinal } from '../../utils/scoutScore'
import { getEditionKey, isPcAutoDynasty } from '../../editions'
import { POSITION_FILTER_OPTIONS, matchesPositionFilter } from '../../utils/recruitFilters'
import { GradeReportContent, getGradeTier, DevTraitPill } from '../../components/PlayerDatabase'
import ScoutScorePanel from '../../components/ScoutScorePanel'
import { computeScore, isHiddenDev } from '../../components/archetypeWeights'
import { buildRevealedPool } from '../../utils/devTraitLearning'
import { buildAttributeQualityMap } from '../../utils/devPrediction'
import GemBustIcon from '../../components/GemBustIcon'
import ClearAllTargetsModal from '../../components/ClearAllTargetsModal'
import { shapeTargetForDatabase, positionBucket } from '../../utils/recruitAttributes'
import { useToast } from '../../components/ui/Toast'
import { getTeamLogoByTid, getMascotName } from '../../data/teams'
import nilBadge from '../../assets/nilBadge.png'
import scoutedBadge from '../../assets/scoutedBadge.png'

// Scout Board (the Targets tab): tracked recruiting targets. Each compact
// row shows name, stars, ranks, and a grade + composite score (local Scout
// Staff score when available, else the ScoutScore percentile mapped through
// the same letter scale); expanding a row reveals archetype, Proj Ovr, and
// the same scouting report used in the Recruiting Database (GradeReportContent).

const STAR = (n) => '★'.repeat(Math.max(0, Math.min(5, Number(n) || 0)))

// Display labels for `p.commitmentTier` (see cfb27SaveSync.js's
// reconcileRecruitingBoard for the full funnel this mirrors: Open -> Top5 ->
// Top3 -> Battle -> SoftCommitted -> HardCommitted -> Signed).
const TIER_LABEL = {
  Open: 'Open',
  Top5: 'Top 5',
  Top3: 'Top 3',
  Battle: 'Battle',
  SoftCommitted: 'Verbally Committed',
  HardCommitted: 'Hard Committed',
}

const Chevron = ({ open }) => (
  <svg
    className="w-3.5 h-3.5 flex-shrink-0 transition-transform text-txt-tertiary"
    style={{ transform: open ? 'rotate(180deg)' : 'none' }}
    fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
)

function Row({ r, rank, pathPrefix, scoutResult, scoring, localScore, useLocalScores, allPlayers, weightsMap, pool, draggable: isDraggable, onDragStart, onDragOver, onDrop, isDragOver, onToggleRemove, onHide, dynastyTeams, canEdit, isOpen, onToggleOpen }) {
  const { p, status } = r
  const navigate = useNavigate()
  const open = isOpen
  const lost = status === 'committed_elsewhere'
  const committed = status === 'committed_us'
  // A SoftCommitted (verbal) commit elsewhere is still reversible — worth
  // distinguishing from a Hard/Signed commit, same "Verbal" language used
  // on the Commitments tab's own tag (RecruitCard.jsx).
  const lostIsVerbal = lost && p.commitmentTier === 'SoftCommitted'
  // The sync flags a commit-to-us boardRemoved (see reconcileRecruitingBoard)
  // so it drops out of the Removed section, not so it reads as "removed" —
  // that treatment (dimmed opacity, "Removed" pill, restore button) is only
  // for genuinely removed/still-open targets.
  const removed = !!p.boardRemoved && !committed
  // Which school actually landed this recruit — resolved from the same
  // commitmentTid the "Lost" status itself is computed from, so the logo
  // always matches (never guessed from name text). Reused for `committed`
  // too (commitmentTid is our own tid there), so it's always our own team's logo.
  const landedTeamName = (lost || committed) && p.commitmentTid != null ? getMascotName(p.commitmentTid, dynastyTeams) : null
  const landedTeamLogo = (lost || committed) && p.commitmentTid != null ? getTeamLogoByTid(p.commitmentTid, dynastyTeams) : null

  // National/state/position rank now live in the always-visible row itself
  // (alongside position); archetype + Proj Ovr stay in the expanded dropdown.
  const ranks = []
  if (p.nationalRank) ranks.push({ v: p.nationalRank, l: 'National' })
  if (p.stateRank && p.state) ranks.push({ v: p.stateRank, l: p.state })
  if (p.positionRank) ranks.push({ v: p.positionRank, l: p.rawPosition || p.position || 'Position' })
  // Where the user's own team currently ranks in THIS recruit's interest
  // list — the in-game "Int: 6th" label — synced from CFB27 saves only.
  // Rendered separately below (after the tier pill), not bundled into
  // `ranks`, per explicit placement request. Always shown (falls back to
  // "-" when there's no interest data at all) rather than only appearing
  // when a rank is known — see cfb27SaveSync.js's reconcileRecruitingBoard
  // for why `interestRank` itself is already floored to the bottom of the
  // recruit's tracked list rather than staying blank whenever the user's
  // team isn't literally one of the 10 tracked schools.
  const intRank = p.interestRank ?? null

  const pct = scoutResult?.ok ? headlinePercentile(scoutResult.data) : null
  const proj = predictRecruitOverall(p)

  // A recruit's pictureUrl is resolved once at sync time and cached on the
  // player record — it's never re-derived once the recruit falls off the
  // save's tracked board (signed elsewhere, no longer synced), so a later
  // portrait-asset rename/migration can leave a stale link pointing at a
  // file that no longer exists. Falls back to the position-abbreviation
  // placeholder instead of a blank broken image.
  const [imgError, setImgError] = useState(false)

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
        opacity: committed ? 1 : lost ? 0.55 : removed ? 0.4 : 1,
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

        <div className="relative flex-shrink-0 w-9 h-9">
          <div className="w-9 h-9 rounded-full flex items-center justify-center overflow-hidden border" style={{ backgroundColor: 'var(--surface-3)', borderColor: 'var(--surface-4)' }}>
            {p.pictureUrl && !imgError
              ? <img src={proxyImageUrl(p.pictureUrl, 200)} alt="" className="w-full h-full object-cover" onError={() => setImgError(true)} />
              : landedTeamLogo
              ? <img src={landedTeamLogo} alt="" className="w-full h-full object-contain p-1" />
              : <span className={`font-black uppercase text-txt-secondary ${(p.rawPosition || p.position || 'ATH').length > 3 ? 'text-[8px]' : 'text-[10px]'}`} style={{ letterSpacing: '0.04em' }}>{p.rawPosition || p.position || 'ATH'}</span>}
          </div>
          {p.scoutedFully && (
            <img
              src={scoutedBadge}
              alt="Fully scouted"
              title="Fully scouted — all attributes revealed"
              className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full"
            />
          )}
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
            {!committed && !lost && p.nilOffered > 0 && (
              <span className="inline-flex items-center gap-1 normal-case font-bold text-txt-secondary flex-shrink-0" style={{ fontSize: '14px' }}>
                <img src={nilBadge} alt="NIL" className="flex-shrink-0" style={{ width: '14px', height: '14px' }} />
                {p.nilOffered}
              </span>
            )}
            {committed && (
              <span className="inline-flex items-center gap-1 flex-shrink-0">
                <span className="text-[9px] font-bold uppercase text-txt-tertiary tracking-wide">· Committed</span>
                {landedTeamLogo && (
                  <img
                    src={landedTeamLogo}
                    alt={landedTeamName || 'Committed'}
                    title={landedTeamName ? `Committed to ${landedTeamName}` : undefined}
                    className="w-4 h-4 object-contain flex-shrink-0"
                  />
                )}
              </span>
            )}
            {lost && (
              <span className="inline-flex items-center gap-1 flex-shrink-0">
                <span className="text-[9px] font-bold uppercase text-txt-tertiary tracking-wide">{lostIsVerbal ? '· Verbal' : '· Lost'}</span>
                {landedTeamLogo && (
                  <img
                    src={landedTeamLogo}
                    alt={landedTeamName || 'Committed elsewhere'}
                    title={landedTeamName ? `${lostIsVerbal ? 'Verbally committed to' : 'Committed to'} ${landedTeamName}` : undefined}
                    className="w-4 h-4 object-contain flex-shrink-0"
                  />
                )}
              </span>
            )}
            {removed && (
              <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider text-slate-500 border border-slate-700 bg-slate-900 flex-shrink-0">Removed</span>
            )}
            {!committed && !lost && p.lockedOut && (
              <span className="text-[9px] font-bold uppercase tracking-wide flex-shrink-0" style={{ color: 'var(--accent-error)' }} title="This recruit has narrowed their list and your team didn't make the cut">
                · Locked Out
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-2.5 sm:gap-x-3 gap-y-0.5 mt-1 text-[9px] sm:text-[11px] tabular-nums" style={{ letterSpacing: '0.3px' }}>
            <span className="uppercase text-txt-secondary font-semibold">{p.rawPosition || p.position || 'ATH'}</span>
            {p.jucoClassLabel && (
              <span className="uppercase font-bold" style={{ color: 'var(--accent-warning)' }}>{p.jucoClassLabel}</span>
            )}
            {ranks.map((rk) => (
              <span key={rk.l} className="inline-flex items-baseline gap-1 normal-case">
                <span className="font-bold text-txt-secondary">#{rk.v}</span>
                <span className="text-txt-tertiary uppercase">{rk.l}</span>
              </span>
            ))}
            {/* Dev trait is a Scout Staff concept; in MaxPlays mode the reveal
                mechanic doesn't apply, so a "HIDDEN" pill is just noise. Show it
                in Scout Staff mode, or in MaxPlays mode only when the trait is
                actually known. */}
            {p.devTrait && (useLocalScores || !isHiddenDev(p.devTrait)) && <DevTraitPill devTrait={p.devTrait} />}
            {!committed && !lost && p.commitmentTier && (
              <span
                className="px-1.5 py-0.5 rounded border font-black uppercase tracking-wide normal-case"
                style={p.lockedOut
                  ? { color: 'var(--accent-error)', borderColor: 'var(--accent-error)' }
                  : { color: 'var(--text-primary)', borderColor: 'var(--text-primary)' }}
              >
                {TIER_LABEL[p.commitmentTier] || p.commitmentTier}
              </span>
            )}
            <span className="inline-flex items-baseline gap-1 normal-case">
              <span className="font-bold text-txt-secondary">{intRank != null ? `#${intRank}` : '-'}</span>
              <span className="text-txt-tertiary uppercase">Int</span>
            </span>
          </div>
        </div>

        {/* Always-visible headline. The metric must match the League
            Preferences toggle: Scout Staff mode shows the archetype letter
            grade + composite score; MaxPlays mode shows the ScoutScore
            PERCENTILE as a percentile (e.g. "98th"), not a letter grade —
            a letter grade there reads as a Scout Staff grade, which is the
            wrong engine for MaxPlays dynasties. */}
        <div className="text-right flex-shrink-0 w-16">
          {/* When expanded in MaxPlays mode the ScoutScore panel's ring already
              shows this percentile, so drop the duplicate here (keep the w-16
              slot for alignment). Scout Staff mode keeps its grade. */}
          {(open && !useLocalScores) ? null : hasComposite ? (
            useLocalScores ? (
              <div className="flex flex-col items-end gap-0" title="Scout grade">
                <div className="font-display leading-none tabular-nums" style={{ fontSize: '1.35rem', fontWeight: 800, color: compositeTier.color }}>
                  {compositeTier.grade}
                </div>
                <div className="tabular-nums text-txt-tertiary" style={{ fontSize: '0.7rem', fontWeight: 700 }}>
                  {compositeSource.toFixed(1)}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-end gap-0" title="ScoutScore percentile">
                <div className="font-display leading-none tabular-nums" style={{ fontSize: '1.2rem', fontWeight: 800, color: compositeTier.color }}>
                  {ordinal(compositeSource)}
                </div>
                <div className="tabular-nums text-txt-tertiary" style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.5px' }}>
                  PCTILE
                </div>
              </div>
            )
          ) : <span className="text-txt-muted" style={{ fontSize: '1.35rem' }}>—</span>}
        </div>

        {canEdit && onToggleRemove && !committed && (
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

        {canEdit && onHide && !committed && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onHide(p) }}
            className="flex-shrink-0 p-1.5 rounded transition text-slate-600 hover:text-red-500 hover:bg-red-950/40"
            title="Hide from this page completely (kept in the Recruiting Database)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
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
          {/* The detailed breakdown MUST match the League Preferences toggle:
              Scout Staff mode → the archetype GradeReportContent; MaxPlays mode
              → MaxPlaysCFB's own ScoutScore (self-fetches from his API). Before,
              this always showed the Scout Staff report, so MaxPlays dynasties saw
              a Scout Staff grade where Max's ScoutScore belonged. */}
          {useLocalScores ? (
            <div className="bg-surface-2 border border-surface-4 rounded-2xl overflow-hidden">
              <GradeReportContent player={p} allPlayers={allPlayers} weightsMap={weightsMap} pool={pool} wide />
            </div>
          ) : (
            <div className="bg-surface-2 border border-surface-4 rounded-2xl overflow-hidden p-4">
              <ScoutScorePanel recruit={p} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const SORT_OPTIONS = ['scoutscore', 'national', 'priority']

export default function ScoutBoard({ dynasty, year, userTid, pathPrefix, positionFilter = 'all', recruitTypeFilter = 'both', viewingOwnTeam = true, scoutStaffEnabled = false, boardActionsRef = null, onBoardReady = null }) {
  const { updateDynasty, updateRecruitingDatabasePlayers, isViewOnly } = useDynasty()
  const { toast } = useToast()
  const canEdit = viewingOwnTeam && !isViewOnly
  // Which MaxPlays cohort to score against (cfb26 vs cfb27) — the dynasty's
  // edition. Stable per dynasty, so it's safe in the scoring effect's deps.
  const sourceGame = getEditionKey(dynasty)
  const handleToggleRemove = async (pl) => {
    if (!dynasty) return
    const players = dynasty.players || []
    const newPlayers = players.map(p => p.pid === pl.pid ? { ...p, boardRemoved: !p.boardRemoved } : p)
    await updateDynasty(dynasty.id, { players: newPlayers }, { changedPlayerPids: [pl.pid] })
  }

  // Hide a recruit from THIS page entirely (Big Board and Removed) without
  // touching the underlying player record — isTarget stays true, so the
  // Recruiting Database / Scout Staff grading pool (which reads dynasty.players
  // directly, not this list) is completely unaffected. Mirrors the existing
  // recruitingDatabaseExcludedPids pattern (PlayerDatabase.jsx), just scoped to
  // this page's board instead of the Database view.
  const handleHideFromBoard = async (pl) => {
    if (!dynasty) return
    const hidden = new Set((dynasty.recruitingBoardHiddenPids || []).map(String))
    hidden.add(String(pl.pid))
    await updateDynasty(dynasty.id, { recruitingBoardHiddenPids: [...hidden] })
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
  const targetsBeforeTypeFilter = useMemo(() => {
    if (!viewingOwnTeam) return []
    const hiddenPids = new Set((dynasty?.recruitingBoardHiddenPids || []).map(String))
    const out = []
    for (const p of dynasty?.players || []) {
      if (!p.isTarget || Number(p.targetYear) !== yearN) continue
      // Hidden from THIS page only (see handleHideFromBoard) — isTarget is
      // untouched, so the Recruiting Database / Scout Staff grading pool
      // below still sees this recruit exactly as before.
      if (hiddenPids.has(String(p.pid))) continue
      const status = getTargetStatus(p, userTid)
      const bucketed = { ...p, rawPosition: p.position, position: positionBucket(p.position) }
      out.push({ p: bucketed, status })
    }
    return out
  }, [dynasty?.players, dynasty?.recruitingBoardHiddenPids, yearN, userTid, viewingOwnTeam])

  // Both / High School / Portal — mirrors Recruiting.jsx's Commitments tab
  // toggle exactly (same `p.previousTeam` truthy/falsy test), so "Portal"
  // means the same thing on both tabs.
  const targets = useMemo(() => {
    if (recruitTypeFilter === 'hs') return targetsBeforeTypeFilter.filter((t) => !t.p.previousTeam)
    if (recruitTypeFilter === 'portal') return targetsBeforeTypeFilter.filter((t) => !!t.p.previousTeam)
    return targetsBeforeTypeFilter
  }, [targetsBeforeTypeFilter, recruitTypeFilter])

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
  // A CFB27 dynasty's recruits get benchmarked against MaxPlaysCFB's CFB27
  // cohort instead of the cfb26 default — see utils/scoutScore.js.
  const scoutScoreGame = getEditionKey(dynasty) === 'cfb27' ? 'cfb27' : 'cfb26'

  useEffect(() => {
    if (scoutStaffEnabled) return
    let alive = true
    if (targets.length === 0) { setScores(new Map()); return }
    setScoring(true)
    getScoutScoresFor(targets.map((t) => t.p), { sourceGame: scoutScoreGame }).then((map) => {
      if (!alive) return
      setScores(map)
      setScoring(false)
    })
    return () => { alive = false }
  }, [targets, scoutStaffEnabled, scoutScoreGame])

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

  // A commit to OUR OWN team stays visible on the active Big Board (with the
  // user's team logo, see Row's `committed` branch) even though the sync
  // flags it boardRemoved — that flag exists to sink recruits committed
  // elsewhere or manually removed, not to hide our own commits.
  const activeRanked = useMemo(() => ranked.filter((r) => !r.p.boardRemoved || r.status === 'committed_us'), [ranked])
  const removedRanked = useMemo(() => ranked.filter((r) => r.p.boardRemoved && r.status !== 'committed_us'), [ranked])
  const openTargetCount = useMemo(() => targets.filter((t) => t.status === 'open').length, [targets])

  // The Big Board's toolbar (title/count/sort/Clear All) now renders inside
  // Recruiting.jsx's own hero section so it's the exact same DOM element as
  // Commitments' toolbar (no separate card/texture = no seam at the
  // attachment point). This ref exposes the actions Recruiting.jsx's buttons
  // need to trigger, and the effect below keeps it informed of live counts —
  // assigned directly in the render body (not an effect) so it's always
  // fresh, matching the analysisActionsRef pattern used elsewhere.
  if (boardActionsRef) {
    boardActionsRef.current.setSortBy = changeSortBy
    boardActionsRef.current.openClearAll = () => setShowClearAll(true)
  }
  // On PC, the save enforces a hard 35-slot recruiting board, so the header
  // counts should mirror activeRanked (above) and only count targets still
  // actually occupying a slot — a boardRemoved target (committed elsewhere,
  // or manually dropped) already freed its slot on the save's board. Console
  // boards have no such cap, so unremoved history stays in the count there.
  const isPc = isPcAutoDynasty(dynasty)
  const countableTargets = useMemo(
    () => (isPc ? targetsBeforeTypeFilter.filter((t) => !t.p.boardRemoved || t.status === 'committed_us') : targetsBeforeTypeFilter),
    [targetsBeforeTypeFilter, isPc]
  )
  useEffect(() => {
    onBoardReady?.({
      total: targets.length,
      openCount: openTargetCount,
      sortBy,
      bothCount: countableTargets.length,
      hsCount: countableTargets.filter((t) => !t.p.previousTeam).length,
      portalCount: countableTargets.filter((t) => !!t.p.previousTeam).length,
    })
  }, [targets.length, openTargetCount, sortBy, countableTargets])

  if (targets.length === 0) {
    // Distinguish "nothing tracked at all" from "nothing of the type the
    // view toggle is currently showing" — the latter shouldn't tell the
    // user to go add targets they may well already have.
    const noneAtAll = targetsBeforeTypeFilter.length === 0
    return (
      <Card>
        <EmptyState
          title={!viewingOwnTeam
            ? 'Another team’s recruiting class'
            : noneAtAll
              ? 'No Targets to Scout'
              : recruitTypeFilter === 'portal' ? 'No Transfer Portal Targets' : 'No High School Targets'}
          message={!viewingOwnTeam
            ? 'Targets are your own team\'s board. Switch back to your team\'s recruiting page to see them.'
            : noneAtAll
              ? `Track prospects via the recruiting sheet (set their Commitment to “Uncommitted” and fill in attributes), and they'll be ranked here by ${scoutStaffEnabled ? 'your Staff' : 'ScoutScore'}.`
              : 'Switch the view toggle back to “Both” to see the rest of your board.'}
        />
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <section className="card overflow-hidden">
        <div>
          {activeRanked.length === 0 ? (
            <div className="px-4 sm:px-5 py-8 text-center text-sm text-txt-tertiary">No targets at this position.</div>
          ) : activeRanked.map((r, i) => (
            <Row key={r.p.pid} r={r} rank={i + 1} pathPrefix={pathPrefix} scoutResult={scores.get(r.p.pid)} scoring={scoring} localScore={localScores.get(r.p.pid)} useLocalScores={scoutStaffEnabled} allPlayers={gradingPool} weightsMap={weightsMap} pool={revealedPool}
              isOpen={openPid === r.p.pid}
              onToggleOpen={() => toggleOpenPid(r.p.pid)}
              canEdit={canEdit}
              onToggleRemove={handleToggleRemove}
              onHide={handleHideFromBoard}
              dynastyTeams={dynasty?.teams}
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
                  onHide={handleHideFromBoard}
                  dynastyTeams={dynasty?.teams}
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
