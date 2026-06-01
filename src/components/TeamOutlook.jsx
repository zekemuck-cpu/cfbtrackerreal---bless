import { useState, useMemo, useEffect, useRef, useLayoutEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor, TouchSensor,
  useSensor, useSensors, closestCorners, useDroppable,
} from '@dnd-kit/core'
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useDynasty } from '../context/DynastyContext'
import { usePathPrefix } from '../hooks/usePathPrefix'
import { Card, Badge, Select, EmptyState, Tabs } from './ui'
import { proxyImageUrl } from '../utils/imageProxy'
import { projectRoster, projectDepartures, projectNflCandidates } from '../utils/rosterProjection'
import { buildBoard, SIDE_OPTIONS, ST_ROLE_SLOTS } from '../utils/outlookBoard'

const EMPTY_ARR = []
const EMPTY_OBJ = {}
const PEN = 'PEN'
const DEV_TRAIT_COLORS = {
  Elite: { bg: '#fbbf24' }, Star: { bg: '#a855f7' }, Impact: { bg: '#3b82f6' }, Normal: { bg: '#6b7280' },
}

const findIn = (map, id) => (id in map ? id : Object.keys(map).find(c => map[c].includes(id)))

export default function TeamOutlook({ tid }) {
  const { id: dynastyId } = useParams()
  const pathPrefix = usePathPrefix()
  const { currentDynasty, isViewOnly, saveTeamFuture } = useDynasty()
  const currentYear = Number(currentDynasty?.currentYear)

  const [side, setSide] = useState('offense')
  const [year, setYear] = useState(currentYear + 1)
  const [showGrades, setShowGrades] = useState(false)
  const [openKey, setOpenKey] = useState(null)
  const [noteEditKey, setNoteEditKey] = useState(null)
  useEffect(() => {
    setYear(currentYear + 1); setSide('offense'); setOpenKey(null)
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [tid])

  const tidData = currentDynasty?.teamFuture?.[tid] || EMPTY_OBJ
  const placements = tidData.placements || EMPTY_OBJ
  const order = tidData.order || EMPTY_OBJ
  const notes = tidData.notes || EMPTY_OBJ
  const stRoles = tidData.stRoles || EMPTY_OBJ
  const leaveFlags = tidData.leaveFlags || EMPTY_ARR
  const nflDismissArr = tidData.nflDismissFlags || EMPTY_ARR
  const fbEnabled = !!tidData.fbEnabled

  const isFuture = year > currentYear
  const canEdit = !isViewOnly && tid != null
  const leaveSet = useMemo(() => new Set(leaveFlags), [leaveFlags])
  const nflDismissSet = useMemo(() => new Set(nflDismissArr), [nflDismissArr])

  const years = useMemo(() => {
    if (!Number.isFinite(currentYear)) return []
    const out = []
    for (let y = currentYear; y <= currentYear + 4; y++) out.push(y)
    return out
  }, [currentYear])

  const players = useMemo(() => {
    if (!currentDynasty || tid == null || !Number.isFinite(year)) return []
    return projectRoster(currentDynasty, tid, year, { leaveFlags: leaveSet })
  }, [currentDynasty, tid, year, leaveSet])

  const nflPids = useMemo(() => {
    if (!isFuture) return new Set()
    return new Set(projectNflCandidates(currentDynasty, tid, year, { leaveFlags: leaveSet, nflDismissFlags: nflDismissSet }).map(c => c.pid))
  }, [currentDynasty, tid, year, isFuture, leaveSet, nflDismissSet])

  const board = useMemo(
    () => buildBoard(players, side, { placements, order, notes, stRoles, nflPids, fbEnabled, lastYear: currentYear }),
    [players, side, placements, order, notes, stRoles, nflPids, fbEnabled, currentYear],
  )

  const departures = useMemo(
    () => (isFuture ? projectDepartures(currentDynasty, tid, year, { leaveFlags: leaveSet }) : []),
    [currentDynasty, tid, year, isFuture, leaveSet],
  )

  const teamLogo = currentDynasty?.teams?.[tid]?.logo || null

  // tile data by key (data is stable regardless of which container holds it)
  const byKey = useMemo(() => {
    const m = {}
    for (const sl of board.slots) for (const t of sl.tiles) m[t.key] = t
    for (const t of board.pen) m[t.key] = t
    return m
  }, [board])

  // ── DnD container state (live arrangement during a drag) ────────────────────
  const deriveContainers = (b) => {
    const map = {}
    for (const sl of b.slots) if (!ST_ROLE_SLOTS.includes(sl.id)) map[sl.id] = sl.tiles.map(t => t.key)
    map[PEN] = b.pen.map(t => t.key)
    return map
  }
  const [containers, setContainers] = useState(() => deriveContainers(board))
  const [activeId, setActiveId] = useState(null)
  const containersRef = useRef(containers)
  useEffect(() => { containersRef.current = containers }, [containers])
  // Resync local arrangement ONLY when the projected board actually changes
  // (side/year switch, or our own save landing) — never merely because a drag
  // ended. Resyncing on drag-end would reset to the pre-save board and snap the
  // tile back before the persisted arrangement arrives.
  const lastBoardRef = useRef(board)
  useEffect(() => {
    if (activeId) return
    if (lastBoardRef.current === board) return
    lastBoardRef.current = board
    setContainers(deriveContainers(board))
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [board, activeId])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 140, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  )

  const save = (patch) => saveTeamFuture(dynastyId, tid, { ...tidData, ...patch })

  // Persist the full arrangement of the CURRENT side; merge with other sides'
  // existing placements so switching sides never wipes the other.
  const persistArrangement = (map) => {
    if (!canEdit) return
    const sideKeys = Object.values(map).flat()
    const np = { ...placements }
    for (const k of sideKeys) delete np[k]
    const no = { ...order }
    for (const [cid, keys] of Object.entries(map)) {
      if (cid === PEN) continue
      for (const k of keys) np[k] = cid
      no[cid] = keys
    }
    save({ placements: np, order: no })
  }

  const onDragStart = ({ active }) => { setActiveId(active.id); setOpenKey(null) }
  const onDragCancel = () => setActiveId(null)

  const onDragOver = ({ active, over }) => {
    if (!over) return
    setContainers(prev => {
      const a = findIn(prev, active.id)
      const o = findIn(prev, over.id)
      if (!a || !o || a === o) return prev
      const overIsContainer = over.id in prev
      const oItems = prev[o]
      const overIndex = overIsContainer ? oItems.length : oItems.indexOf(over.id)
      const insertAt = overIndex < 0 ? oItems.length : overIndex
      return {
        ...prev,
        [a]: prev[a].filter(id => id !== active.id),
        [o]: [...oItems.slice(0, insertAt), active.id, ...oItems.slice(insertAt)],
      }
    })
  }

  const onDragEnd = ({ active, over }) => {
    const prev = containersRef.current
    const a = findIn(prev, active.id)
    if (!a) { setActiveId(null); return }
    let next = prev
    const o = over ? findIn(prev, over.id) : a
    if (o && a === o) {
      const items = prev[a]
      const oldIndex = items.indexOf(active.id)
      const overIsContainer = over && over.id in prev
      const newIndex = (!over || overIsContainer) ? items.length - 1 : items.indexOf(over.id)
      if (oldIndex !== newIndex && newIndex >= 0) next = { ...prev, [a]: arrayMove(items, oldIndex, newIndex) }
    }
    setContainers(next)
    persistArrangement(next)
    setActiveId(null)
  }

  // ── Per-tile actions ────────────────────────────────────────────────────────
  const toggleLeave = (pid) => {
    if (!canEdit || !pid) return
    const set = new Set(leaveFlags); set.has(pid) ? set.delete(pid) : set.add(pid)
    save({ leaveFlags: [...set] })
  }
  const toggleNflDismiss = (pid) => {
    if (!canEdit || !pid) return
    const set = new Set(nflDismissArr); set.has(pid) ? set.delete(pid) : set.add(pid)
    save({ nflDismissFlags: [...set] })
  }
  const setNote = (key, text) => {
    const next = { ...notes }
    if (text && text.trim()) next[key] = text.trim(); else delete next[key]
    save({ notes: next }); setNoteEditKey(null)
  }
  const addStRole = (slotId, key) => {
    if (!canEdit || !key) return
    const cur = stRoles[slotId] || []
    if (!cur.includes(key)) save({ stRoles: { ...stRoles, [slotId]: [...cur, key] } })
  }
  const removeStRole = (slotId, key) => {
    if (!canEdit) return
    save({ stRoles: { ...stRoles, [slotId]: (stRoles[slotId] || []).filter(id => id !== key) } })
  }

  if (!currentDynasty || tid == null) {
    return <EmptyState title="No team" message="No team to project." />
  }

  const tileActions = {
    canEdit, pathPrefix, teamLogo, openKey, leaveSet,
    onToggleOpen: (k) => setOpenKey(prev => (prev === k ? null : k)),
    onToggleLeave: toggleLeave, onToggleNfl: toggleNflDismiss,
    noteEditKey, onEditNote: setNoteEditKey, onSaveNote: setNote,
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Tabs variant="pill" value={side} onChange={setSide} options={SIDE_OPTIONS} />
        <div className="flex items-center gap-3 flex-wrap">
          {side === 'offense' && (
            <label className="flex items-center gap-1.5 text-xs text-txt-tertiary cursor-pointer">
              <input type="checkbox" checked={fbEnabled} disabled={!canEdit} onChange={(e) => save({ fbEnabled: e.target.checked })} />
              FB slot
            </label>
          )}
          <label className="flex items-center gap-1.5 text-xs text-txt-tertiary cursor-pointer">
            <input type="checkbox" checked={showGrades} onChange={(e) => setShowGrades(e.target.checked)} />
            Grades
          </label>
          <label className="flex items-center gap-2 text-xs text-txt-tertiary">Season
            <Select size="sm" value={String(year)} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map(y => <option key={y} value={String(y)}>{y === currentYear ? `${y} — Now` : y}</option>)}
            </Select>
          </label>
        </div>
      </div>

      <SummaryStrip summary={board.summary} side={side} />

      <DndContext sensors={sensors} collisionDetection={closestCorners}
        onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={onDragCancel}>

        {isFuture && (
          <HoldingPen items={containers[PEN] || EMPTY_ARR} byKey={byKey} activeId={activeId} {...tileActions} />
        )}

        <div className="space-y-3">
          {board.rows.map((rowIds, ri) => (
            <div key={ri} className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {rowIds.map(id => {
                const slot = board.slots.find(s => s.id === id)
                if (!slot) return null
                if (ST_ROLE_SLOTS.includes(id)) {
                  return <RoleColumn key={id} slot={slot} players={players}
                    current={stRoles[id] || EMPTY_ARR} onAdd={(k) => addStRole(id, k)} onRemove={(k) => removeStRole(id, k)}
                    {...tileActions} />
                }
                return <SlotColumn key={id} slot={slot} items={containers[id] || EMPTY_ARR}
                  byKey={byKey} showGrades={showGrades} activeId={activeId} {...tileActions} />
              })}
            </div>
          ))}
        </div>

        <DragOverlay>
          {activeId && byKey[activeId]
            ? <TileView tile={byKey[activeId]} inPen={(containers[PEN] || EMPTY_ARR).includes(activeId)} dragging teamLogo={teamLogo} />
            : null}
        </DragOverlay>
      </DndContext>

      {isFuture && departures.length > 0 && (
        <Card padding="sm">
          <div className="label-sm text-txt-tertiary mb-2">Marked leaving ({departures.length})</div>
          <div className="flex flex-wrap gap-2">
            {departures.map(d => (
              <span key={d.pid} className="inline-flex items-center gap-2 text-xs bg-surface-3 rounded px-2 py-1">
                <span className="text-txt-secondary">{d.name}</span>
                <span className="text-txt-muted">{d.position} · {d.projectedClass}</span>
                {canEdit && <button onClick={() => toggleLeave(d.pid)} className="text-txt-tertiary hover:text-txt-primary font-semibold">Undo</button>}
              </span>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

// ── Summary ───────────────────────────────────────────────────────────────────
function SummaryStrip({ summary, side }) {
  const label = side === 'st' ? 'Special teams' : side === 'defense' ? 'Defense' : 'Offense'
  return (
    <div className="flex items-center gap-4 text-xs">
      <span className="text-txt-tertiary uppercase tracking-wider font-semibold">{label}</span>
      <span className="text-txt-secondary">Unit OVR <b className="text-txt-primary tabular-nums">{summary.unitOvr ?? '—'}</b></span>
      <span className="text-txt-secondary">Holes <b className={`tabular-nums ${summary.holes ? 'text-[color:var(--accent-error)]' : 'text-txt-primary'}`}>{summary.holes}</b></span>
      {summary.toPlace > 0 && <span className="text-txt-secondary">To place <b className="text-[color:var(--accent-warning)] tabular-nums">{summary.toPlace}</b></span>}
    </div>
  )
}

// ── Holding pen (a horizontal sortable container) ─────────────────────────────
function HoldingPen({ items, byKey, ...rest }) {
  const { setNodeRef, isOver } = useDroppable({ id: PEN })
  return (
    <Card padding="sm" className={isOver ? 'border-dashed border-surface-5' : ''}>
      <div className="label-sm text-txt-tertiary mb-2">Incoming to place ({items.length})</div>
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="flex gap-2 overflow-x-auto no-scrollbar pb-1 min-h-[3rem]">
          {items.length === 0
            ? <div className="text-xs text-txt-tertiary italic self-center">All incoming players placed.</div>
            : items.map(key => byKey[key]
              ? <div key={key} className="w-40 shrink-0"><SortableTile tile={byKey[key]} inPen {...rest} /></div>
              : null)}
        </div>
      </SortableContext>
    </Card>
  )
}

// ── Slot column (sortable container) ──────────────────────────────────────────
function SlotColumn({ slot, items, byKey, showGrades, ...rest }) {
  const { setNodeRef, isOver } = useDroppable({ id: slot.id })
  const hole = slot.isHole
  return (
    <div className="w-40 shrink-0">
      <Card padding="none" className={`h-full ${isOver ? 'border-dashed border-surface-5' : ''} ${hole ? 'border-[color:var(--accent-error)]' : ''}`}>
        <div className="flex items-center justify-between gap-1 px-2 py-1.5 border-b border-surface-4">
          <span className="font-bold text-txt-primary text-sm">{slot.label}</span>
          <div className="flex items-center gap-1">
            {showGrades && <Badge variant="outline">{slot.grade}</Badge>}
            <span className="text-[10px] text-txt-muted tabular-nums">{items.length}</span>
          </div>
        </div>
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          <div ref={setNodeRef} className="p-1.5 space-y-1.5 min-h-[3.25rem]">
            {items.length === 0
              ? <div className="text-[11px] text-txt-tertiary italic px-1 py-2 text-center">{hole ? 'Hole' : '—'}</div>
              : items.map((key, idx) => byKey[key]
                ? <SortableTile key={key} tile={byKey[key]} isStarter={idx === 0} {...rest} />
                : null)}
          </div>
        </SortableContext>
      </Card>
    </div>
  )
}

// ── Special-teams role column (KR/PR) — picker-based, not draggable ────────────
function RoleColumn({ slot, players, current, onAdd, onRemove, canEdit, pathPrefix, teamLogo }) {
  return (
    <div className="w-40 shrink-0">
      <Card padding="none" className="h-full">
        <div className="flex items-center justify-between gap-1 px-2 py-1.5 border-b border-surface-4">
          <span className="font-bold text-txt-primary text-sm">{slot.label}</span>
          <span className="text-[10px] text-txt-muted tabular-nums">{slot.tiles.length}</span>
        </div>
        <div className="p-1.5 space-y-1.5 min-h-[3.25rem]">
          {slot.tiles.map(t => (
            <div key={t.key} className="rounded border border-surface-4 bg-surface-2 px-1.5 py-1">
              <div className="flex items-center justify-between gap-1">
                <TileView tile={t} inline teamLogo={teamLogo} />
                {canEdit && <button onPointerDown={(e) => e.stopPropagation()} onClick={() => onRemove(t.key)} className="text-[11px] text-txt-tertiary hover:text-txt-primary font-semibold">×</button>}
              </div>
            </div>
          ))}
          {canEdit && (
            <Select size="sm" value="" onChange={(e) => { onAdd(e.target.value) }}>
              <option value="">+ add…</option>
              {players.filter(p => !current.includes(p.key)).map(p => <option key={p.key} value={p.key}>{p.name} ({p.position})</option>)}
            </Select>
          )}
        </div>
      </Card>
    </div>
  )
}

// ── Sortable wrapper around a tile ────────────────────────────────────────────
function SortableTile({ tile, inPen, isStarter, canEdit, openKey, onToggleOpen, teamLogo, ...rest }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tile.key, disabled: !canEdit })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }
  const open = openKey === tile.key
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
      onClick={(e) => { e.stopPropagation(); if (canEdit) onToggleOpen(tile.key) }}>
      <TileView tile={tile} inPen={inPen} isStarter={isStarter} grab={canEdit} teamLogo={teamLogo} />
      {open && canEdit && <TileActions tile={tile} inPen={inPen} {...rest} />}
    </div>
  )
}

// ── Tile presentation ─────────────────────────────────────────────────────────
function TileView({ tile, inPen, isStarter, grab, dragging, inline, teamLogo }) {
  return (
    <div className={`rounded border px-1.5 py-1 ${inline ? '' : 'bg-surface-2'} ${dragging ? 'shadow-lg border-[color:var(--accent-info)] bg-surface-3' : isStarter ? 'border-surface-4 bg-surface-3' : 'border-surface-4'} ${grab ? 'cursor-grab active:cursor-grabbing' : ''}`}>
      <div className="flex items-center gap-1.5 min-w-0">
        <Avatar url={tile.player?.pictureUrl} fallback={teamLogo} />
        <div className="min-w-0 flex-1">
          <PlayerName pid={tile.pid} name={tile.name} />
          <div className="flex items-center gap-1 text-[10px] text-txt-tertiary">
            <span>{tile.position}</span><span>·</span><span>{tile.projectedClass}</span>
            <DevChip trait={tile.devTrait} />
          </div>
        </div>
        <div className="text-right shrink-0">
          {inPen
            ? <StarRating stars={tile.stars} isPortal={tile.isPortal} />
            : <span className="tabular-nums font-semibold text-txt-primary text-sm">{tile.projectedOvr ?? '—'}</span>}
        </div>
      </div>
      {(tile.isNfl || tile.portalRisk || (inPen && tile.isPortal) || tile.note) && (
        <div className="flex flex-wrap items-center gap-1 mt-1">
          {tile.isNfl && <Badge variant="info">NFL</Badge>}
          {tile.portalRisk && <Badge variant="warning">Portal risk</Badge>}
          {inPen && tile.isPortal && <Badge variant="info">Transfer</Badge>}
          {tile.note && <span className="text-[10px] text-txt-secondary italic truncate">“{tile.note}”</span>}
        </div>
      )}
    </div>
  )
}

function TileActions({ tile, inPen, leaveSet, onToggleLeave, onToggleNfl, noteEditKey, onEditNote, onSaveNote, pathPrefix }) {
  const stop = (e) => { e.stopPropagation() }
  const editing = noteEditKey === tile.key
  return (
    <div className="flex flex-wrap items-center gap-2 mt-1 px-1" onClick={stop} onPointerDown={stop}>
      <TileBtn onClick={() => onEditNote(tile.key)}>Note</TileBtn>
      {tile.pid && <Link to={`${pathPrefix}/player/${tile.pid}`} onClick={stop} onPointerDown={stop}
        className="text-[11px] font-semibold px-1.5 py-0.5 rounded text-txt-tertiary hover:text-txt-primary hover:bg-surface-3">View</Link>}
      {tile.pid && tile.isNfl && <TileBtn onClick={() => onToggleNfl(tile.pid)}>Keep</TileBtn>}
      {tile.pid && !inPen && <TileBtn onClick={() => onToggleLeave(tile.pid)}>{leaveSet.has(tile.pid) ? 'Stay' : 'Out'}</TileBtn>}
      {editing && (
        <input autoFocus defaultValue={tile.note} placeholder="note…"
          className="w-full text-[11px] bg-surface-1 border border-surface-4 rounded px-1.5 py-1 text-txt-primary mt-1"
          onClick={stop} onPointerDown={stop}
          onKeyDown={(e) => { if (e.key === 'Enter') onSaveNote(tile.key, e.currentTarget.value); if (e.key === 'Escape') onEditNote(null) }}
          onBlur={(e) => onSaveNote(tile.key, e.currentTarget.value)} />
      )}
    </div>
  )
}

function TileBtn({ children, onClick }) {
  return (
    <button onPointerDown={(e) => e.stopPropagation()} onClick={onClick}
      className="text-[11px] font-semibold px-1.5 py-0.5 rounded text-txt-tertiary hover:text-txt-primary hover:bg-surface-3">
      {children}
    </button>
  )
}

function StarRating({ stars, isPortal }) {
  if (stars) return <span className="tabular-nums text-txt-secondary font-semibold text-sm">{stars}★</span>
  return <span className="text-txt-tertiary text-[10px]">{isPortal ? '—' : 'HS'}</span>
}

function DevChip({ trait }) {
  if (!trait) return null
  const t = String(trait).trim()
  const key = t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()
  const c = DEV_TRAIT_COLORS[key]
  if (!c) return null
  return <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.bg }} title={key} />
}

function Avatar({ url, fallback }) {
  const [errored, setErrored] = useState(false)
  const hasUrl = url && !errored
  const src = hasUrl ? proxyImageUrl(url, 80) : fallback || null
  return (
    <div className="w-6 h-6 rounded-full bg-surface-4 overflow-hidden flex-shrink-0 flex items-center justify-center">
      {src ? <img src={src} alt="" draggable={false} onError={() => setErrored(true)} className={`w-full h-full ${hasUrl ? 'object-cover' : 'object-contain p-0.5'}`} /> : null}
    </div>
  )
}

function shortName(name) {
  if (!name) return name
  const parts = String(name).trim().split(/\s+/)
  if (parts.length < 2) return name
  return `${parts[0][0].toUpperCase()}. ${parts.slice(1).join(' ')}`
}

function PlayerName({ pid, name }) {
  const ref = useRef(null)
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
  const cls = 'relative block min-w-0 truncate font-medium text-txt-primary text-xs'
  if (pid) return <span ref={ref} title={name} className={cls}>{content}</span>
  return <span ref={ref} title={name} className={cls}>{content}</span>
}
