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

export default function TeamOutlook({ tid }) {
  const { id: dynastyId } = useParams()
  const pathPrefix = usePathPrefix()
  const { currentDynasty, isViewOnly, saveTeamFuture } = useDynasty()
  const currentYear = Number(currentDynasty?.currentYear)

  const [posTab, setPosTab] = useState('offense')
  const [year, setYear] = useState(currentYear + 1)
  useEffect(() => { setYear(currentYear + 1); setPosTab('offense') /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tid])

  const tidData       = currentDynasty?.teamFuture?.[tid] || {}
  const flagsArr      = tidData.leaveFlags       || EMPTY_ARR
  const nflDismissArr = tidData.nflDismissFlags  || EMPTY_ARR
  const posOverridesObj = tidData.positionOverrides || {}
  const groupOrderObj   = tidData.groupOrder        || {}
  const leaveFlags      = useMemo(() => new Set(flagsArr),      [flagsArr])
  const nflDismissFlags = useMemo(() => new Set(nflDismissArr), [nflDismissArr])
  const isFuture = year > currentYear
  const canEdit  = !isViewOnly && tid != null
  const canFlag  = canEdit && isFuture
  const teamLogo = currentDynasty?.teams?.[tid]?.logo || null

  // ── Drag state ──────────────────────────────────────────────────────────────
  const [dragPid,    setDragPid]    = useState(null)
  const [dropTarget, setDropTarget] = useState(null) // { toGroup, beforePid }
  const dropTargetRef = useRef(null)
  const dragRef       = useRef(null)  // active drag metadata
  const ghostRef      = useRef(null)  // ghost DOM element

  const setDropBoth = useCallback((v) => {
    const next = typeof v === 'function' ? v(dropTargetRef.current) : v
    dropTargetRef.current = next
    setDropTarget(next)
  }, [])

  // Always-fresh snapshot for async pointer handlers (avoids stale closures).
  const liveRef = useRef({})

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
    const roster        = applyOverrides(projectRoster(currentDynasty, tid, year, { leaveFlags }))
    const departures    = isFuture ? applyOverrides(projectDepartures(currentDynasty, tid, year, { leaveFlags })) : []
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
      if (total === 0)           health = { label: 'Empty',    variant: 'danger' }
      else if (ret.length === 0) health = { label: 'Unproven', variant: 'warning' }
      else if (total < min)      health = { label: 'Thin',     variant: 'warning' }
      else                       health = null
      const grade = isFuture ? posGroupGrade(g, ret) : null
      return { g, label: GROUP_LABELS[g] || g, ret, inc, lv, nfl, health, grade }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDynasty, tid, year, posTab, leaveFlags, nflDismissFlags, isFuture, posOverridesObj, groupOrderObj])

  liveRef.current = { groups, posOverridesObj, groupOrderObj, tidData, currentDynasty, currentYear }

  const saveTidData = (patch) => saveTeamFuture(dynastyId, tid, { ...tidData, ...patch })

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

  // ── Drop executor ───────────────────────────────────────────────────────────
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
    const storedOrder = nextOrder[toGroup] || []
    const currentPids = (groups.find(grp => grp.g === toGroup)?.ret || []).map(en => en.pid).filter(p => p && p !== pid)
    const merged      = [...storedOrder, ...currentPids.filter(p => !storedOrder.includes(p))]
    const insertIdx   = beforePid != null ? merged.indexOf(beforePid) : -1
    if (insertIdx >= 0) merged.splice(insertIdx, 0, pid)
    else merged.push(pid)
    nextOrder[toGroup] = merged

    saveTeamFuture(dynastyId, tid, { ...tidData, positionOverrides: nextOverrides, groupOrder: nextOrder })
  }, [dynastyId, tid, saveTeamFuture])

  // ── Unified pointer-events drag (desktop + mobile, single code path) ────────
  //
  // Strategy: onPointerDown records where the user grabbed, then document-level
  // pointermove/pointerup listeners handle the rest.  The ghost has
  // pointer-events:none, so document.elementsFromPoint(x, y) sees through it
  // to the real rows underneath — no coordinate offset guessing required.

  const handlePointerDown = useCallback((e, entry) => {
    if (!canEdit || !isFuture) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (e.target.closest('button')) return

    const rect = e.currentTarget.getBoundingClientRect()
    const d = {
      pid:      entry.pid,
      name:     entry.name,
      position: entry.position || '',
      ovr:      entry.projectedOvr ?? '',
      startX:   e.clientX,
      startY:   e.clientY,
      offsetX:  e.clientX - rect.left,
      offsetY:  e.clientY - rect.top,
      rowWidth: rect.width,
      pointerId: e.pointerId,
      started:  false,
    }
    dragRef.current = d

    const onMove = (ev) => {
      const dd = dragRef.current
      if (!dd || ev.pointerId !== dd.pointerId) return

      if (!dd.started) {
        if (Math.hypot(ev.clientX - dd.startX, ev.clientY - dd.startY) < 8) return
        dd.started = true
        setDragPid(dd.pid)

        const ghost = document.createElement('div')
        ghost.style.cssText = [
          'position:fixed',
          'pointer-events:none',
          'z-index:9999',
          `width:${dd.rowWidth}px`,
          'background:#1e293b',
          'border:2px solid #3b82f6',
          'border-radius:8px',
          'padding:6px 10px',
          'box-shadow:0 8px 28px rgba(0,0,0,0.5)',
          'opacity:0.95',
          'left:-9999px',
          'top:-9999px',
        ].join(';')
        ghost.innerHTML = `<div style="display:flex;align-items:center;gap:6px;font-size:13px;color:#f1f5f9">` +
          `<span style="color:#94a3b8;font-size:11px;flex-shrink:0">${dd.position}</span>` +
          `<span style="font-weight:600;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${dd.name}</span>` +
          `<span style="font-weight:700;flex-shrink:0">${dd.ovr}</span>` +
          `</div>`
        document.body.appendChild(ghost)
        ghostRef.current = ghost
      }

      if (!dragRef.current.started) return
      ev.preventDefault()

      // Position ghost at the exact grab offset so it "sticks" to the cursor.
      const ghost = ghostRef.current
      if (ghost) {
        ghost.style.left = (ev.clientX - dragRef.current.offsetX) + 'px'
        ghost.style.top  = (ev.clientY - dragRef.current.offsetY) + 'px'
      }

      // elementsFromPoint queries by geometry/stacking order, not pointer-events.
      // The ghost will appear in the list but has no data-outlook-* attributes,
      // so the filter skips it and finds the real row underneath.
      const els     = document.elementsFromPoint(ev.clientX, ev.clientY)
      const rowEl   = els.find(el => el.dataset && 'outlookRow'   in el.dataset)
      const groupEl = els.find(el => el.dataset && 'outlookGroup' in el.dataset)

      let newTarget = null
      if (rowEl) {
        const toGroup = rowEl.closest('[data-outlook-group]')?.dataset.outlookGroup
                     || groupEl?.dataset.outlookGroup
        if (toGroup) {
          const rowPid = rowEl.dataset.outlookRow
          const r      = rowEl.getBoundingClientRect()
          const topHalf = ev.clientY < r.top + r.height / 2
          if (topHalf) {
            newTarget = { toGroup, beforePid: rowPid }
          } else {
            const grpRet = liveRef.current.groups?.find(g => g.g === toGroup)?.ret || []
            const idx    = grpRet.findIndex(en => en.pid === rowPid)
            const next   = (idx >= 0 && idx < grpRet.length - 1) ? grpRet[idx + 1].pid : null
            newTarget = { toGroup, beforePid: next }
          }
        }
      } else if (groupEl) {
        newTarget = { toGroup: groupEl.dataset.outlookGroup, beforePid: null }
      }

      setDropBoth(prev => {
        if (!newTarget) return null
        if (prev?.toGroup === newTarget.toGroup && prev?.beforePid === newTarget.beforePid) return prev
        return newTarget
      })
    }

    const onUp = (ev) => {
      const dd = dragRef.current
      if (!dd) return
      if (ev && dd.pointerId != null && ev.pointerId !== dd.pointerId) return

      document.removeEventListener('pointermove',   onMove)
      document.removeEventListener('pointerup',     onUp)
      document.removeEventListener('pointercancel', onUp)

      const ghost = ghostRef.current
      if (ghost) { ghost.remove(); ghostRef.current = null }
      dragRef.current = null

      if (dd.started) {
        const dt = dropTargetRef.current
        if (dt?.toGroup) executeDrop(dd.pid, dt.toGroup, dt.beforePid ?? null)
      }

      setDragPid(null)
      setDropBoth(null)
    }

    document.addEventListener('pointermove',   onMove, { passive: false })
    document.addEventListener('pointerup',     onUp)
    document.addEventListener('pointercancel', onUp)
  }, [canEdit, isFuture, setDropBoth, executeDrop])

  // Clean up ghost if component unmounts mid-drag.
  useEffect(() => () => {
    if (ghostRef.current) { ghostRef.current.remove(); ghostRef.current = null }
  }, [])

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
            onPointerDown={handlePointerDown}
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
  onPointerDown,
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
            onPointerDown={canDrag ? (ev) => onPointerDown(ev, e) : undefined}
            className={`select-none transition-opacity ${canDrag ? 'cursor-grab active:cursor-grabbing' : ''} ${dragPid === e.pid ? 'opacity-25' : ''}`}
          >
            <Row
              dragHandle={canDrag ? <DragHandle /> : null}
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

      <div
        data-outlook-group={g}
        className={`p-3 space-y-3 min-h-[2.5rem] transition-colors ${isDropTarget ? 'bg-blue-500/5 ring-1 ring-inset ring-blue-500/25 rounded-b-lg' : ''}`}
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

function DragHandle() {
  return (
    <span
      className="text-txt-muted hover:text-txt-secondary select-none shrink-0 px-0.5 text-base leading-none"
      aria-hidden="true"
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
