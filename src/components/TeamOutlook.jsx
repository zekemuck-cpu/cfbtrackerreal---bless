import { useState, useMemo, useEffect, useRef, useLayoutEffect, useCallback, Fragment } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useDynasty } from '../context/DynastyContext'
import { usePathPrefix } from '../hooks/usePathPrefix'
import { Card, Badge, Tabs, Select, EmptyState } from './ui'
import { proxyImageUrl } from '../utils/imageProxy'
import { projectRoster, projectDepartures, projectNflCandidates, resolveAthPosition } from '../utils/rosterProjection'
import { isPortalRisk } from '../utils/depthChart'
import { finePositionGroup, TAB_GROUPS, GROUP_LABELS } from '../data/positionGroups'

const TAB_OPTIONS = [
  { value: 'offense', label: 'Offense' },
  { value: 'defense', label: 'Defense' },
  { value: 'st', label: 'Special Teams' },
]
const MIN_DEPTH = { QB: 2, RB: 3, WR: 4, TE: 2, OT: 3, OG: 3, C: 2, DT: 3, EDGE: 3, OLB: 3, MIKE: 2, CB: 4, Safety: 3, K: 1, P: 1 }
const byOvr = (a, b) => (b.projectedOvr ?? -1) - (a.projectedOvr ?? -1)
const DEV_TRAIT_COLORS = {
  Elite: { bg: '#fbbf24', text: '#000' },
  Star:   { bg: '#a855f7', text: '#fff' },
  Impact: { bg: '#3b82f6', text: '#fff' },
  Normal: { bg: '#6b7280', text: '#fff' },
}
const EMPTY_ARR = []

const GROUP_TO_POSITION = {
  QB: 'QB', HB: 'HB', WR: 'WR', TE: 'TE',
  OT: 'OT', OG: 'OG', C: 'C',
  DT: 'DT', EDGE: 'EDGE', OLB: 'OLB', MIKE: 'MIKE',
  CB: 'CB', Safety: 'Safety', K: 'K', P: 'P',
}

const GRADE_DEPTH = { QB: 1, RB: 2, WR: 3, TE: 1, OT: 2, OG: 2, C: 1, DT: 2, EDGE: 2, OLB: 2, MIKE: 1, CB: 2, Safety: 2, K: 1, P: 1 }

function posGroupGrade(group, returners) {
  const depth = GRADE_DEPTH[group] ?? 2
  const topN = [...returners].sort((a, b) => (b.projectedOvr ?? -1) - (a.projectedOvr ?? -1)).slice(0, depth)
  const ovrs = topN.map(e => Number(e.projectedOvr)).filter(v => Number.isFinite(v))
  if (ovrs.length === 0) return null
  const avg = ovrs.reduce((a, b) => a + b, 0) / ovrs.length
  const GRADE_BG = { A: '#16a34a', B: '#2563eb', C: '#b45309', D: '#dc2626', F: '#7f1d1d' }
  let letter, mod
  if (avg >= 90)      { letter = 'A'; mod = avg >= 96 ? '+' : avg >= 93 ? '' : '-' }
  else if (avg >= 83) { letter = 'B'; mod = avg >= 88 ? '+' : avg >= 85 ? '' : '-' }
  else if (avg >= 75) { letter = 'C'; mod = avg >= 81 ? '+' : avg >= 78 ? '' : '-' }
  else if (avg >= 67) { letter = 'D'; mod = avg >= 73 ? '+' : avg >= 70 ? '' : '-' }
  else                { letter = 'F'; mod = '' }
  return { letter: letter + mod, bg: GRADE_BG[letter] }
}

function applyGroupOrder(entries, orderArr) {
  if (!orderArr || orderArr.length === 0) return entries
  const orderMap = new Map(orderArr.map((pid, i) => [pid, i]))
  return [...entries].sort((a, b) => {
    const ai = a.pid && orderMap.has(a.pid) ? orderMap.get(a.pid) : Infinity
    const bi = b.pid && orderMap.has(b.pid) ? orderMap.get(b.pid) : Infinity
    if (ai !== bi) return ai - bi
    return (b.projectedOvr ?? -1) - (a.projectedOvr ?? -1)
  })
}

// Scan all [data-outlook-group] / [data-outlook-row] elements by bounding rect
// to determine which group+row a touch coordinate falls inside.
// `detectY` should be the ghost's visual center, not the raw finger Y, so the
// insertion indicator matches what the user actually sees.
function findDropTargetByRect(clientX, detectY, liveGroups) {
  // Find which group the detection point is over.
  let toGroup = null
  let groupEl = null
  for (const el of document.querySelectorAll('[data-outlook-group]')) {
    const r = el.getBoundingClientRect()
    if (detectY >= r.top && detectY <= r.bottom && clientX >= r.left && clientX <= r.right) {
      toGroup = el.dataset.outlookGroup
      groupEl = el
      break
    }
  }
  if (!toGroup || !groupEl) return null

  // Collect rows in this group sorted top-to-bottom.
  const rows = []
  for (const rowEl of groupEl.querySelectorAll('[data-outlook-row]')) {
    const r = rowEl.getBoundingClientRect()
    if (r.height > 0) rows.push({ r, pid: rowEl.dataset.outlookRow })
  }
  rows.sort((a, b) => a.r.top - b.r.top)

  if (rows.length === 0) return { toGroup, beforePid: null }

  // Insert before the first row whose midpoint is below the detection Y.
  // This naturally handles inter-row gaps without needing exact rect containment.
  for (const { r, pid } of rows) {
    if (detectY <= r.top + r.height / 2) return { toGroup, beforePid: pid }
  }

  // Detection point is below all midpoints → append to end.
  return { toGroup, beforePid: null }
}

export default function TeamOutlook({ tid }) {
  const { id: dynastyId } = useParams()
  const pathPrefix = usePathPrefix()
  const { currentDynasty, isViewOnly, saveTeamFuture } = useDynasty()
  const currentYear = Number(currentDynasty?.currentYear)

  const [posTab, setPosTab] = useState('offense')
  const [year, setYear] = useState(currentYear + 1)
  useEffect(() => { setYear(currentYear + 1); setPosTab('offense') /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tid])

  const tidData     = currentDynasty?.teamFuture?.[tid] || {}
  const flagsArr    = tidData.leaveFlags       || EMPTY_ARR
  const nflDismissArr = tidData.nflDismissFlags || EMPTY_ARR
  const posOverridesObj = tidData.positionOverrides || {}
  const groupOrderObj   = tidData.groupOrder        || {}
  const leaveFlags      = useMemo(() => new Set(flagsArr),     [flagsArr])
  const nflDismissFlags = useMemo(() => new Set(nflDismissArr),[nflDismissArr])
  const isFuture  = year > currentYear
  const canEdit   = !isViewOnly && tid != null
  const canFlag   = canEdit && isFuture
  const teamLogo  = currentDynasty?.teams?.[tid]?.logo || null

  // Shared drag state — used by both the HTML5 DnD path (desktop) and the
  // touch path (mobile). A single dropTarget ref keeps both in sync without
  // stale-closure issues.
  const [dragPid,    setDragPid]    = useState(null)
  const [dropTarget, setDropTarget] = useState(null) // { toGroup, beforePid }
  const dropTargetRef = useRef(null)
  const setDropBoth = useCallback((v) => {
    const next = typeof v === 'function' ? v(dropTargetRef.current) : v
    dropTargetRef.current = next
    setDropTarget(next)
  }, [])

  // A ref that always holds the latest values needed by async touch handlers.
  const liveRef = useRef({})
  // (groups assigned below after useMemo)

  const years = useMemo(() => {
    if (!Number.isFinite(currentYear)) return []
    const out = []
    for (let y = currentYear; y <= currentYear + 4; y++) out.push(y)
    return out
  }, [currentYear])

  const applyOverrides = (entries) => entries.map(e =>
    e.pid && posOverridesObj[e.pid] ? { ...e, position: posOverridesObj[e.pid], positionOverridden: true } : e
  )

  const groups = useMemo(() => {
    if (!currentDynasty || tid == null || !Number.isFinite(year)) return []
    const roster      = applyOverrides(projectRoster(currentDynasty, tid, year, { leaveFlags }))
    const departures  = isFuture ? applyOverrides(projectDepartures(currentDynasty, tid, year, { leaveFlags })) : []
    const nflCandidates = isFuture ? applyOverrides(projectNflCandidates(currentDynasty, tid, year, { leaveFlags, nflDismissFlags })) : []
    return (TAB_GROUPS[posTab] || []).map(g => {
      const inGroup = (pos) => finePositionGroup(pos) === g
      const nfl     = nflCandidates.filter(d => inGroup(d.position)).sort(byOvr)
      const nflPids = new Set(nfl.map(d => d.pid))
      const rawRet  = roster.filter(e => !e.isIncoming && inGroup(e.position) && !nflPids.has(e.pid))
      const ret     = applyGroupOrder(rawRet, groupOrderObj[g])
      const inc     = roster.filter(e => e.isIncoming && inGroup(e.position)).sort(byOvr)
      const lv      = departures.filter(d => inGroup(d.position)).sort(byOvr)
      const total   = ret.length + inc.length
      const min     = MIN_DEPTH[g] ?? 2
      let health
      if (total === 0)        health = { label: 'Empty',    variant: 'danger' }
      else if (ret.length === 0)   health = { label: 'Unproven', variant: 'warning' }
      else if (total < min)        health = { label: 'Thin',     variant: 'warning' }
      else                         health = null
      const grade = isFuture ? posGroupGrade(g, ret) : null
      return { g, label: GROUP_LABELS[g] || g, ret, inc, lv, nfl, health, grade }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDynasty, tid, year, posTab, leaveFlags, nflDismissFlags, isFuture, posOverridesObj, groupOrderObj])

  // Keep liveRef current every render so touch handlers never see stale state.
  liveRef.current = { groups, posOverridesObj, groupOrderObj, tidData, currentDynasty, currentYear }

  const saveTidData = (patch) => {
    saveTeamFuture(dynastyId, tid, { ...tidData, ...patch })
  }

  const toggleFlag = (pid) => {
    if (!canFlag || !pid) return
    const set = new Set(flagsArr)
    if (set.has(pid)) set.delete(pid); else set.add(pid)
    saveTidData({ leaveFlags: [...set] })
  }

  const toggleNflDismiss = (pid) => {
    if (!canFlag || !pid) return
    const set = new Set(nflDismissArr)
    if (set.has(pid)) set.delete(pid); else set.add(pid)
    saveTidData({ nflDismissFlags: [...set] })
  }

  // ── Core drop executor ────────────────────────────────────────────────────
  // Reads from liveRef so it's safe to call from async touch handlers.

  const executeDrop = useCallback((pid, toGroup, beforePid) => {
    const { posOverridesObj, groupOrderObj, groups, tidData, currentDynasty, currentYear } = liveRef.current
    if (!pid || !toGroup || !groups) return

    const player = (currentDynasty?.players || []).find(p => p.pid === pid)
    const naturalGroup = (() => {
      if (!player) return null
      const pos = (player.positionByYear?.[currentYear] ?? player.positionByYear?.[String(currentYear)] ?? player.position ?? '').toUpperCase()
      return finePositionGroup(pos === 'ATH' ? resolveAthPosition(player) : pos)
    })()

    const nextOverrides = { ...posOverridesObj }
    if (toGroup === naturalGroup) delete nextOverrides[pid]
    else nextOverrides[pid] = GROUP_TO_POSITION[toGroup] || toGroup

    const nextOrder = {}
    for (const g of Object.keys(groupOrderObj)) {
      nextOrder[g] = (groupOrderObj[g] || []).filter(p => p !== pid)
    }
    const storedOrder  = nextOrder[toGroup] || []
    const currentPids  = (groups.find(grp => grp.g === toGroup)?.ret || []).map(en => en.pid).filter(p => p && p !== pid)
    const merged       = [...storedOrder, ...currentPids.filter(p => !storedOrder.includes(p))]
    const insertIdx    = beforePid != null ? merged.indexOf(beforePid) : -1
    if (insertIdx >= 0) merged.splice(insertIdx, 0, pid)
    else merged.push(pid)
    nextOrder[toGroup] = merged

    saveTeamFuture(dynastyId, tid, { ...tidData, positionOverrides: nextOverrides, groupOrder: nextOrder })
  }, [dynastyId, tid, saveTeamFuture])

  // ── HTML5 DnD — desktop (mouse / pointer) ────────────────────────────────

  const handleDragStart = (e, pid) => {
    if (!canEdit) { e.preventDefault(); return }
    // Buttons must stay clickable; everything else on the row is a valid grab point.
    if (e.target.closest('button')) { e.preventDefault(); return }
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', pid)
    setDragPid(pid)
  }

  const handleDragEnd = () => { setDragPid(null); setDropBoth(null) }

  // Called when the pointer moves over a specific row — computes before/after
  // insertion point from the cursor's vertical position within the row.
  const handleRowDragOver = (e, rowPid, toGroup) => {
    if (!dragPid) return
    e.preventDefault()
    // No stopPropagation — group container also needs dragover so it stays a
    // valid drop target, but we tell it not to update dropTarget (see below).
    const rect = e.currentTarget.getBoundingClientRect()
    const topHalf = e.clientY < rect.top + rect.height / 2
    const grpRet  = groups.find(g => g.g === toGroup)?.ret || []
    let beforePid
    if (topHalf) {
      beforePid = rowPid
    } else {
      const idx = grpRet.findIndex(en => en.pid === rowPid)
      beforePid = idx >= 0 && idx < grpRet.length - 1 ? grpRet[idx + 1].pid : null
    }
    setDropBoth(prev =>
      prev?.toGroup === toGroup && prev?.beforePid === beforePid ? prev : { toGroup, beforePid }
    )
  }

  // Called on the group container — only updates dropTarget when hovering over
  // empty space (the row handler already handled the precise position).
  const handleGroupDragOver = (e, toGroup) => {
    if (!dragPid) return
    e.preventDefault() // must always be called so the container accepts drops
    if (e.target.closest('[data-outlook-row]')) return // row handler owns this
    setDropBoth(prev =>
      prev?.toGroup === toGroup && prev?.beforePid == null ? prev : { toGroup, beforePid: null }
    )
  }

  // Only the group container handles drop — rows don't have onDrop so the event
  // bubbles up, avoiding double-execution.
  const handleDrop = (e, toGroup) => {
    e.preventDefault()
    const pid = dragPid
    if (!pid || !canEdit) { handleDragEnd(); return }
    executeDrop(pid, toGroup, dropTargetRef.current?.toGroup === toGroup ? dropTargetRef.current.beforePid : null)
    handleDragEnd()
  }

  // ── Touch DnD — mobile ────────────────────────────────────────────────────
  // Registers non-passive document listeners so we can call preventDefault()
  // to suppress scroll while dragging. Uses bounding-rect scanning (not
  // elementFromPoint) for reliable row detection across all mobile browsers.

  const handleTouchDragStart = useCallback((e, pid, playerName) => {
    if (!canEdit || !isFuture) return
    e.preventDefault() // suppress long-press menu / text selection

    const t0 = e.touches[0]
    const startX = t0.clientX, startY = t0.clientY
    let started = false
    let ghostEl = null

    const onMove = (ev) => {
      const t = ev.touches[0]
      const dist = Math.hypot(t.clientX - startX, t.clientY - startY)

      if (!started && dist > 8) {
        started = true
        setDragPid(pid)
        ghostEl = document.createElement('div')
        Object.assign(ghostEl.style, {
          position: 'fixed', pointerEvents: 'none', zIndex: '9999',
          background: '#1e293b', border: '1px solid #3b82f6', borderRadius: '6px',
          padding: '4px 10px', fontSize: '12px', color: '#f1f5f9',
          opacity: '0.92', whiteSpace: 'nowrap', boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        })
        ghostEl.textContent = playerName
        document.body.appendChild(ghostEl)
      }

      if (!started) return
      ev.preventDefault()

      ghostEl.style.left = t.clientX + 16 + 'px'
      ghostEl.style.top  = t.clientY - 36 + 'px'

      // Use bounding-rect scanning — far more reliable on mobile than
      // elementFromPoint, which can behave unexpectedly with z-index / transforms.
      // Ghost top = t.clientY - 36, height ≈ 24px → ghost center ≈ t.clientY - 24
      const dt = findDropTargetByRect(t.clientX, t.clientY - 24, liveRef.current.groups)
      setDropBoth(prev => {
        if (!dt) return null
        if (prev?.toGroup === dt.toGroup && prev?.beforePid === dt.beforePid) return prev
        return dt
      })
    }

    const onEnd = () => {
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend',  onEnd)
      if (ghostEl) ghostEl.remove()
      if (started) {
        const dt = dropTargetRef.current
        if (dt?.toGroup) executeDrop(pid, dt.toGroup, dt.beforePid ?? null)
      }
      setDragPid(null)
      setDropBoth(null)
    }

    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend',  onEnd)
  }, [canEdit, isFuture, setDropBoth, executeDrop])

  if (!currentDynasty || tid == null) {
    return <EmptyState title="No team" message="No team to project." />
  }

  const labelForYear = (y) => y === currentYear ? `${y} — Now` : `${y}`

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Tabs value={posTab} onChange={setPosTab} options={TAB_OPTIONS} />
        <label className="flex items-center gap-2 text-xs text-txt-tertiary">Season
          <Select size="sm" value={String(year)} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map(y => <option key={y} value={String(y)}>{labelForYear(y)}</option>)}
          </Select>
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {groups.map(grp => (
          <GroupBlock key={grp.g} grp={grp}
            isFuture={isFuture} canFlag={canFlag} canEdit={canEdit}
            onToggleFlag={toggleFlag} onToggleNflDismiss={toggleNflDismiss}
            dragPid={dragPid} dropTarget={dropTarget}
            onDragStart={handleDragStart} onDragEnd={handleDragEnd}
            onRowDragOver={handleRowDragOver} onGroupDragOver={handleGroupDragOver}
            onDrop={handleDrop}
            onTouchDragStart={handleTouchDragStart}
            currentYear={currentYear} pathPrefix={pathPrefix} teamLogo={teamLogo}
          />
        ))}
      </div>
    </div>
  )
}

function GroupBlock({
  grp, isFuture, canFlag, canEdit,
  onToggleFlag, onToggleNflDismiss,
  dragPid, dropTarget,
  onDragStart, onDragEnd, onRowDragOver, onGroupDragOver, onDrop,
  onTouchDragStart,
  currentYear, pathPrefix, teamLogo,
}) {
  const { g, label, ret, inc, lv, nfl, health, grade } = grp
  const isDropTarget = !!dragPid && dropTarget?.toGroup === g
  const canDrag = canEdit && isFuture

  const returningRows = ret.length === 0
    ? <EmptyLine text={isFuture ? 'No returning players' : 'No players'} />
    : ret.map((e, idx) => {
      const isDropBefore    = isDropTarget && dropTarget.beforePid === e.pid
      const isDropAfterLast = isDropTarget && dropTarget.beforePid == null && idx === ret.length - 1
      const risk = e.player && isPortalRisk(e.player, currentYear, e.projectedClass)
      return (
        <Fragment key={e.key}>
          {isDropBefore && <DropLine />}
          <div
            data-outlook-row={e.pid}
            draggable={canDrag}
            onDragStart={(ev) => onDragStart(ev, e.pid)}
            onDragEnd={onDragEnd}
            onDragOver={(ev) => onRowDragOver(ev, e.pid, g)}
            className={`select-none transition-opacity ${canDrag ? 'cursor-grab active:cursor-grabbing' : ''} ${dragPid === e.pid ? 'opacity-25' : ''}`}
          >
            <Row
              dragHandle={canDrag
                ? <DragHandle onTouchStart={(ev) => onTouchDragStart(ev, e.pid, e.name)} />
                : null}
              avatar={<Avatar url={e.player?.pictureUrl} fallback={teamLogo} />}
              left={<>
                <PlayerName pid={e.pid} name={e.name} pathPrefix={pathPrefix} />
                <span className="text-txt-tertiary text-xs shrink-0">{e.projectedClass}</span>
                <DevBadge trait={e.devTrait} />
                {risk ? <Badge variant="warning">Portal risk</Badge> : null}
              </>}
              right={<>
                <PosLabel position={e.position} overridden={!!e.positionOverridden} />
                <span className="tabular-nums font-semibold text-txt-primary">{e.projectedOvr ?? '—'}</span>
              </>}
              action={canFlag ? <LeaveButton onClick={() => onToggleFlag(e.pid)} /> : null}
            />
          </div>
          {isDropAfterLast && <DropLine />}
        </Fragment>
      )
    })

  return (
    <Card padding="none">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-surface-4">
        <span className="font-bold text-txt-primary truncate">{label}</span>
        {grade && <Badge variant="solid" color={grade.bg} textColor="#fff" className="shrink-0 font-bold">{grade.letter}</Badge>}
        {health ? <Badge variant={health.variant}>{health.label}</Badge> : null}
      </div>

      {/* The entire inner area is the drop zone for both desktop and touch. */}
      <div
        data-outlook-group={g}
        className={`p-3 space-y-3 min-h-[2.5rem] transition-colors ${isDropTarget ? 'bg-blue-500/5 ring-1 ring-inset ring-blue-500/25 rounded-b-lg' : ''}`}
        onDragOver={(ev) => onGroupDragOver(ev, g)}
        onDrop={(ev) => onDrop(ev, g)}
      >
        {isFuture
          ? <GroupSection label={`Returning (${ret.length})`}>{returningRows}</GroupSection>
          : <div className="space-y-1">{returningRows}</div>}

        {isFuture && ret.length === 0 && isDropTarget && <DropLine />}

        {isFuture && nfl.length > 0 && (
          <GroupSection label={`Likely NFL (${nfl.length})`}>
            {nfl.map(d => (
              <Row key={d.pid}
                avatar={<Avatar url={d.player?.pictureUrl} fallback={teamLogo} />}
                left={<>
                  <PlayerName pid={d.pid} name={d.name} pathPrefix={pathPrefix} />
                  <span className="text-txt-tertiary text-xs shrink-0">{d.projectedClass}</span>
                  <DevBadge trait={d.devTrait} />
                </>}
                right={<>
                  <PosLabel position={d.position} overridden={!!d.positionOverridden} />
                  <span className="tabular-nums text-txt-tertiary">{d.projectedOvr ?? '—'}</span>
                </>}
                action={canFlag ? <KeepButton onClick={() => onToggleNflDismiss(d.pid)} /> : null}
              />
            ))}
          </GroupSection>
        )}

        {isFuture && lv.length > 0 && (
          <GroupSection label={`Likely transfer (${lv.length})`}>
            {lv.map(d => (
              <Row key={d.pid}
                avatar={<Avatar url={d.player?.pictureUrl} fallback={teamLogo} />}
                left={<>
                  <PlayerName pid={d.pid} name={d.name} pathPrefix={pathPrefix} />
                  <span className="text-txt-tertiary text-xs shrink-0">{d.projectedClass}</span>
                  <DevBadge trait={d.devTrait} />
                </>}
                right={<span className="tabular-nums text-txt-tertiary">{d.projectedOvr ?? '—'}</span>}
                action={canFlag ? <UndoButton onClick={() => onToggleFlag(d.pid)} /> : null}
              />
            ))}
          </GroupSection>
        )}

        {isFuture && inc.length > 0 && (
          <GroupSection label={`Incoming (${inc.length})`}>
            {inc.map(e => (
              <Row key={e.key}
                avatar={<Avatar fallback={teamLogo} />}
                left={<>
                  <PlayerName name={e.name} />
                  {e.isPortal ? <Badge variant="info">Transfer</Badge> : null}
                  <span className="text-txt-tertiary text-xs shrink-0">{e.projectedClass}</span>
                  <DevBadge trait={e.devTrait} />
                </>}
                right={<StarRating stars={e.stars} isPortal={e.isPortal} />}
              />
            ))}
          </GroupSection>
        )}
      </div>
    </Card>
  )
}

// ── Small presentational components ──────────────────────────────────────────

function DragHandle({ onTouchStart }) {
  return (
    <span
      data-drag-handle="1"
      onTouchStart={onTouchStart}
      className="cursor-grab active:cursor-grabbing text-txt-muted hover:text-txt-secondary select-none shrink-0 px-0.5 text-base leading-none touch-none"
      title="Drag to reorder or move to a different position group"
    >≡</span>
  )
}

function DropLine() {
  return <div className="h-0.5 bg-blue-500 rounded-full mx-1 my-0.5 pointer-events-none" />
}

function PosLabel({ position, overridden }) {
  return (
    <span className={`text-[11px] shrink-0 ${overridden ? 'text-blue-400 font-medium' : 'text-txt-muted'}`}>
      {position}
    </span>
  )
}

function StarRating({ stars, isPortal }) {
  if (stars) return <span className="tabular-nums text-txt-secondary font-semibold shrink-0">{stars}★</span>
  return <span className="text-txt-tertiary text-xs shrink-0">{isPortal ? '—' : 'HS'}</span>
}

function Avatar({ url, fallback }) {
  const src = url ? proxyImageUrl(url, 80) : fallback || null
  return (
    <div className="w-7 h-7 rounded-full bg-surface-4 overflow-hidden flex-shrink-0 flex items-center justify-center">
      {src ? <img src={src} alt="" className={`w-full h-full ${url ? 'object-cover' : 'object-contain p-0.5'}`} /> : null}
    </div>
  )
}

function shortName(name) {
  if (!name) return name
  const parts = String(name).trim().split(/\s+/)
  if (parts.length < 2) return name
  return `${parts[0][0].toUpperCase()}. ${parts.slice(1).join(' ')}`
}

function PlayerName({ pid, name, pathPrefix }) {
  const ref        = useRef(null)
  const measureRef = useRef(null)
  const [abbrev, setAbbrev] = useState(false)
  useLayoutEffect(() => {
    const c = ref.current, m = measureRef.current
    if (!c || !m) return
    const check = () => setAbbrev(m.offsetWidth > c.clientWidth + 1)
    check()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null
    ro?.observe(c)
    return () => ro?.disconnect()
  }, [name])
  const content = (
    <>
      {abbrev ? shortName(name) : name}
      <span ref={measureRef} aria-hidden="true" className="invisible absolute left-0 top-0 whitespace-nowrap">{name}</span>
    </>
  )
  const cls = 'relative block min-w-0 truncate font-medium text-txt-primary'
  if (pid) return <Link ref={ref} to={`${pathPrefix}/player/${pid}`} title={name} className={`${cls} hover:underline`}>{content}</Link>
  return <span ref={ref} title={name} className={cls}>{content}</span>
}

function DevBadge({ trait }) {
  if (!trait) return null
  const c = DEV_TRAIT_COLORS[trait]
  if (!c) return <Badge variant="outline" className="shrink-0">{trait}</Badge>
  return <Badge variant="solid" color={c.bg} textColor={c.text} className="shrink-0">{trait}</Badge>
}

function ActionBtn({ children, onClick }) {
  return (
    <button onClick={onClick}
      className="text-[11px] font-semibold px-1.5 py-0.5 rounded transition-colors text-txt-tertiary hover:text-txt-primary hover:bg-surface-3 shrink-0">
      {children}
    </button>
  )
}
const LeaveButton = ({ onClick }) => <ActionBtn onClick={onClick}>Mark leaving</ActionBtn>
const UndoButton  = ({ onClick }) => <ActionBtn onClick={onClick}>Keep</ActionBtn>
const KeepButton  = ({ onClick }) => <ActionBtn onClick={onClick}>Keep</ActionBtn>

function GroupSection({ label, children }) {
  return (
    <div>
      <div className="label-sm text-txt-tertiary mb-1">{label}</div>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function Row({ dragHandle, avatar, left, right, action }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <div className="flex items-center gap-1.5 min-w-0">
        {dragHandle}
        {avatar}
        <div className="flex items-center gap-1.5 min-w-0">{left}</div>
      </div>
      <div className="flex items-center gap-2 shrink-0">{right}{action}</div>
    </div>
  )
}

function EmptyLine({ text }) {
  return <div className="text-xs text-txt-tertiary italic">{text}</div>
}
