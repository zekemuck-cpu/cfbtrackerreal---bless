import { useState, useMemo, useEffect, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate } from 'react-router-dom'
import {
  DndContext, DragOverlay, MouseSensor, KeyboardSensor, TouchSensor,
  useSensor, useSensors, closestCorners, useDroppable,
} from '@dnd-kit/core'
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useDynasty } from '../context/DynastyContext'
import { usePathPrefix } from '../hooks/usePathPrefix'
import { Card, Badge, Select, EmptyState, Tabs, useConfirm } from './ui'
import { proxyImageUrl } from '../utils/imageProxy'
import { projectRoster, projectDepartures, projectNflCandidates } from '../utils/rosterProjection'
import { buildBoard, SIDE_OPTIONS, ST_ROLE_SLOTS, sideOfPosition } from '../utils/outlookBoard'

const EMPTY_ARR = []
const EMPTY_OBJ = {}
const DEV_TRAIT_COLORS = {
  Elite: { bg: '#fbbf24' }, Star: { bg: '#a855f7' }, Impact: { bg: '#3b82f6' }, Normal: { bg: '#6b7280' },
}

function devTraitKey(trait) {
  if (!trait) return null
  const t = String(trait).trim()
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()
}

// Hex → "r,g,b" so we can build rgba() gradient stops.
function hexRgb(hex) {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16)
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`
}

// Subtle left→right wash in the player's dev-trait color, layered over the
// tile surface so text stays readable. Brighter for the starter.
function devTraitGradient(trait, isStarter) {
  const c = DEV_TRAIT_COLORS[devTraitKey(trait)]
  if (!c) return undefined
  const rgb = hexRgb(c.bg)
  const a = isStarter ? 0.30 : 0.16
  return `linear-gradient(90deg, rgba(${rgb},${a}) 0%, rgba(${rgb},${a * 0.4}) 45%, rgba(${rgb},0) 100%)`
}

const findIn = (map, id) => (id in map ? id : Object.keys(map).find(c => map[c].includes(id)))

// ── Draft / dirty helpers ─────────────────────────────────────────────────────
const clonePlan = (p) => JSON.parse(JSON.stringify(p || {}))

// Canonical, empties-stripped view of a plan so "set a note then clear it" reads
// as unchanged. Used only for the dirty comparison.
function canonPlan(d) {
  const p = d || {}
  const pick = (m, keep) => {
    const out = {}
    for (const k of Object.keys(m || {})) if (keep(m[k])) out[k] = m[k]
    return out
  }
  return {
    placements: pick(p.placements, v => !!v),
    order: pick(p.order, v => Array.isArray(v) && v.length > 0),
    notes: pick(p.notes, v => !!v),
    stRoles: pick(p.stRoles, v => Array.isArray(v) && v.length > 0),
    leaveFlags: [...(p.leaveFlags || [])].sort(),
    nflDismissFlags: [...(p.nflDismissFlags || [])].sort(),
    fbEnabled: !!p.fbEnabled,
  }
}
// Order-stable stringify (sorts object keys at every depth; preserves array order).
function stableStr(o) {
  if (Array.isArray(o)) return '[' + o.map(stableStr).join(',') + ']'
  if (o && typeof o === 'object') return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stableStr(o[k])).join(',') + '}'
  return JSON.stringify(o)
}
const samePlan = (a, b) => stableStr(canonPlan(a)) === stableStr(canonPlan(b))

export default function TeamOutlook({ tid, guardRef, focusPid, focusSide, onFocusConsumed }) {
  const { id: dynastyId } = useParams()
  const navigate = useNavigate()
  const pathPrefix = usePathPrefix()
  const { currentDynasty, isViewOnly, saveTeamFuture } = useDynasty()
  const { confirm } = useConfirm()
  const currentYear = Number(currentDynasty?.currentYear)

  const VALID_SIDES = ['offense', 'defense', 'st']
  const [side, setSide] = useState(VALID_SIDES.includes(focusSide) ? focusSide : 'offense')
  const [year, setYear] = useState(currentYear)
  const [markMode, setMarkMode] = useState(false)
  const [highlightKey, setHighlightKey] = useState(null)

  // Last-saved plan (source of truth) and the editable working copy. All edits
  // mutate `draft` locally (instant — no Firestore round-trip per drag); the
  // user persists with the Save button. dirty = draft differs from persisted.
  const persisted = currentDynasty?.teamFuture?.[tid] || EMPTY_OBJ
  const [draft, setDraft] = useState(() => clonePlan(persisted))

  // `touched` = the user has unsaved edits. While UNtouched, the draft adopts
  // the latest persisted plan — this is the safety net: if the dynasty loads
  // async (so teamFuture[tid] arrives after mount) or is updated elsewhere, the
  // user's real saved plan appears instead of a blank/stale one we'd otherwise
  // overwrite on Save. Once touched, the draft is protected until save/discard.
  const touchedRef = useRef(false)
  const persistedStr = useMemo(() => stableStr(canonPlan(persisted)), [persisted])
  useEffect(() => {
    if (touchedRef.current) return
    setDraft(clonePlan(persisted))
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [persistedStr])

  useEffect(() => {
    setYear(currentYear)
    setSide(VALID_SIDES.includes(focusSide) ? focusSide : 'offense')
    setMarkMode(false)
    touchedRef.current = false
    setDraft(clonePlan(currentDynasty?.teamFuture?.[tid] || {}))
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [tid])

  const placements = draft.placements || EMPTY_OBJ
  const order = draft.order || EMPTY_OBJ
  const notes = draft.notes || EMPTY_OBJ
  const stRoles = draft.stRoles || EMPTY_OBJ
  const leaveFlags = draft.leaveFlags || EMPTY_ARR
  const nflDismissArr = draft.nflDismissFlags || EMPTY_ARR

  const dirty = useMemo(() => !samePlan(draft, persisted), [draft, persisted])

  const isFuture = year > currentYear
  const canEdit = !isViewOnly && tid != null
  const leaveSet = useMemo(() => new Set(leaveFlags), [leaveFlags])
  const nflDismissSet = useMemo(() => new Set(nflDismissArr), [nflDismissArr])

  // Departure-selection only applies to future projections.
  useEffect(() => { if (!isFuture && markMode) setMarkMode(false) }, [isFuture, markMode])

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
    () => buildBoard(players, side, { placements, order, notes, stRoles, nflPids, lastYear: currentYear }),
    [players, side, placements, order, notes, stRoles, nflPids, currentYear],
  )

  const departures = useMemo(
    () => (isFuture ? projectDepartures(currentDynasty, tid, year, { leaveFlags: leaveSet }) : []),
    [currentDynasty, tid, year, isFuture, leaveSet],
  )

  const teamLogo = currentDynasty?.teams?.[tid]?.logo || null

  // Deep-link focus: arrive from a player page with ?player=<pid>&side=<side>.
  // The side is already applied from the URL; once that player's tile is in the
  // DOM, scroll it into view and flash a highlight. Fall back to the player's
  // own side if the URL side somehow doesn't contain them.
  const focusedTileKey = `pid:${focusPid}`
  useEffect(() => {
    if (!focusPid) return
    const p = players.find(pl => pl.pid === focusPid)
    // Not on this year's roster for this team — clear the param so a stale
    // ?player= can't re-trigger on a later tab revisit, and bail.
    if (!p) { onFocusConsumed?.(); return }
    const targetSide = sideOfPosition(p.position)
    if (targetSide && targetSide !== side) { setSide(targetSide); return } // correct + re-run
    const id = requestAnimationFrame(() => {
      const el = document.getElementById(`dc-tile-${focusPid}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlightKey(focusedTileKey)
      onFocusConsumed?.()
    })
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPid, players, side])

  // Clear the highlight after it has flashed.
  useEffect(() => {
    if (!highlightKey) return
    const t = setTimeout(() => setHighlightKey(null), 2200)
    return () => clearTimeout(t)
  }, [highlightKey])

  // tile data by key (data is stable regardless of which container holds it)
  const byKey = useMemo(() => {
    const m = {}
    for (const sl of board.slots) for (const t of sl.tiles) m[t.key] = t
    return m
  }, [board])

  // ── DnD container state (live arrangement during a drag) ────────────────────
  const deriveContainers = (b) => {
    const map = {}
    for (const sl of b.slots) if (!ST_ROLE_SLOTS.includes(sl.id)) map[sl.id] = sl.tiles.map(t => t.key)
    return map
  }
  const [containers, setContainers] = useState(() => deriveContainers(board))
  const [activeId, setActiveId] = useState(null)
  const [activeWidth, setActiveWidth] = useState(null)
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

  // Mouse: small drag threshold. Touch: long-press to pick up so a normal swipe
  // still scrolls the page (the previous PointerSensor stole every touch as a
  // drag-or-scroll race, which on mobile just scrolled instead of moving).
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  )

  // Edits update the local draft only (instant). Firestore write happens on
  // commit(). Every existing caller of save(patch) keeps working unchanged.
  // Marking touched freezes the adopt-from-persisted safety net (above) so an
  // async/external update can't clobber edits in progress.
  const save = (patch) => { touchedRef.current = true; setDraft(prev => ({ ...prev, ...patch })) }

  // Await the Firestore write so a save that's still in flight when the user
  // navigates/closes can't be silently lost. On failure, keep touched so the
  // unsaved-changes guard still warns. pendingWriteRef lets the nav guard wait.
  const pendingWriteRef = useRef(null)
  const [saving, setSaving] = useState(false)
  const commit = async () => {
    if (!canEdit || !dirty) return
    // Keep the reset sentinels ('' / []) in the snapshot: the local-state merge
    // in updateDynasty can't delete keys, so these clearing values are what make
    // a reset/removal actually reflect after save. They read as default
    // everywhere (buildBoard treats '' as unplaced; canonPlan strips empties).
    const snapshot = clonePlan(draft)
    setSaving(true)
    try {
      const promise = Promise.resolve(saveTeamFuture(dynastyId, tid, snapshot))
      pendingWriteRef.current = promise
      await promise
      touchedRef.current = false
    } catch (err) {
      console.error('[DepthChart] save failed', err)
    } finally {
      pendingWriteRef.current = null
      setSaving(false)
    }
  }
  const discard = () => { touchedRef.current = false; setDraft(clonePlan(persisted)) }

  // Persist the full arrangement of the CURRENT side; merge with other sides'
  // existing placements so switching sides never wipes the other.
  const persistArrangement = (map) => {
    if (!canEdit) return
    const sideKeys = Object.values(map).flat()
    const np = { ...placements }
    for (const k of sideKeys) delete np[k]
    const no = { ...order }
    for (const [cid, keys] of Object.entries(map)) {
      for (const k of keys) np[k] = cid
      no[cid] = keys
    }
    save({ placements: np, order: no })
  }

  const onDragStart = ({ active }) => {
    setActiveId(active.id)
    setActiveWidth(active.rect.current.initial?.width ?? null)
  }
  const onDragCancel = () => { setActiveId(null); setActiveWidth(null) }

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
    setActiveWidth(null)
  }

  // ── Per-tile actions ────────────────────────────────────────────────────────
  const toggleLeave = (pid) => {
    if (!canEdit || !pid) return
    const set = new Set(leaveFlags); set.has(pid) ? set.delete(pid) : set.add(pid)
    save({ leaveFlags: [...set] })
  }
  // A tile click either opens the player's page or, in "select departures"
  // mode (future seasons), toggles whether they're projected to leave.
  const onTileClick = (tile) => {
    if (markMode && tile.pid) { toggleLeave(tile.pid); return }
    if (tile.pid) navigate(`${pathPrefix}/player/${tile.pid}`)
  }
  // Reset the CURRENT side back to the auto-suggested depth chart: drop any
  // custom placements into this side's slots, custom order on its slots, notes
  // on its tiles, and (ST) KR/PR roles. Other sides' customizations are kept.
  const sideSlotIds = useMemo(() => new Set(board.slots.map(s => s.id)), [board.slots])
  const sideTileKeys = useMemo(() => {
    const keys = new Set()
    for (const sl of board.slots) for (const t of sl.tiles) keys.add(t.key)
    return keys
  }, [board.slots])

  const isSideDefault = useMemo(() => {
    // A cleared customization is stored as a falsy/empty value (see resetSide),
    // which must read as "default" so the button disables after a reset.
    if (Object.keys(placements).some(k => placements[k] && sideSlotIds.has(placements[k]))) return false
    if (Object.keys(order).some(slotId => sideSlotIds.has(slotId) && (order[slotId] || []).length)) return false
    if (Object.keys(notes).some(k => notes[k] && sideTileKeys.has(k))) return false
    if (side === 'st' && ST_ROLE_SLOTS.some(r => (stRoles[r] || []).length)) return false
    return true
  }, [placements, order, notes, stRoles, side, sideSlotIds, sideTileKeys])

  const resetSide = () => {
    // NOTE: updateDynasty merges teamFuture into local state with a deepMerge
    // that can ADD/overwrite keys but never REMOVE them, so deleting keys here
    // wouldn't reflect in the UI. Instead write CLEARING values that survive the
    // merge and read as default: '' for placements/notes (falsy ⇒ auto-seed by
    // OVR) and [] for order/roles (arrays replace wholesale in the merge).
    const np = { ...placements }
    for (const k of Object.keys(np)) if (sideSlotIds.has(np[k])) np[k] = ''
    const no = { ...order }
    for (const slotId of Object.keys(no)) if (sideSlotIds.has(slotId)) no[slotId] = []
    const nn = { ...notes }
    for (const k of Object.keys(nn)) if (sideTileKeys.has(k)) nn[k] = ''
    const patch = { placements: np, order: no, notes: nn }
    if (side === 'st') {
      const ns = { ...stRoles }
      for (const r of ST_ROLE_SLOTS) ns[r] = []
      patch.stRoles = ns
    }
    save(patch)
  }

  const handleReset = async () => {
    if (!canEdit) return
    if (!isSideDefault) {
      const ok = await confirm({
        title: 'Reset depth chart',
        message: `Reset the ${side === 'st' ? 'special teams' : side} depth chart to the suggested order? Your manual moves and notes for this side will be cleared.`,
        confirmLabel: 'Reset',
        variant: 'danger',
      })
      if (!ok) return
    }
    resetSide()
  }

  // ── Unsaved-changes guard ─────────────────────────────────────────────────
  // Warn before leaving (browser close/refresh) while dirty.
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  // Parent (TeamYear) calls guardRef.current() before switching team-page tabs.
  // Returns true if it's OK to proceed (clean, or user chose discard/save).
  // Latest closure is kept in a ref so the parent always sees current `dirty`.
  const guardFn = async () => {
    // Wait out any in-flight save first so we don't double-prompt or lose it.
    if (pendingWriteRef.current) { try { await pendingWriteRef.current } catch { /* fall through */ } }
    if (!dirty || !canEdit) return true
    const choice = await confirm({
      title: 'Unsaved depth chart changes',
      message: 'You have unsaved changes to this depth chart. What would you like to do?',
      confirmLabel: 'Save & leave',
      cancelLabel: 'Stay',
      extraLabel: 'Discard & leave',
    })
    if (choice === 'extra') { discard(); return true }       // discard & leave
    if (choice === true)    { await commit(); return true }  // save & leave (awaited)
    return false                                             // stay
  }
  const guardFnRef = useRef(guardFn)
  guardFnRef.current = guardFn
  useEffect(() => {
    if (!guardRef) return
    guardRef.current = () => guardFnRef.current()
    return () => { if (guardRef) guardRef.current = null }
  }, [guardRef])

  if (!currentDynasty || tid == null) {
    return <EmptyState title="No team" message="No team to project." />
  }

  const tileActions = {
    canEdit, teamLogo, leaveSet, markMode, highlightKey,
    onTileClick,
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Tabs variant="pill" value={side} onChange={setSide} options={SIDE_OPTIONS} />
        <div className="flex items-center gap-3 flex-wrap">
          {canEdit && isFuture && (
            <button onClick={() => setMarkMode(m => !m)}
              className="text-xs font-semibold px-2.5 py-1 rounded border transition-colors"
              style={markMode
                ? { borderColor: 'var(--accent-warning)', color: 'var(--accent-warning)', background: 'color-mix(in srgb, var(--accent-warning) 12%, transparent)' }
                : { borderColor: 'var(--surface-5)' }}>
              {markMode ? 'Done selecting' : 'Likely departures'}
            </button>
          )}
          <label className="flex items-center gap-2 text-xs text-txt-tertiary">Season
            <Select size="sm" value={String(year)} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
            </Select>
          </label>
          {canEdit && (
            <button onClick={handleReset} disabled={isSideDefault}
              className="text-xs font-semibold px-2.5 py-1 rounded border border-surface-5 text-txt-secondary hover:text-txt-primary hover:bg-surface-3 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Reset
            </button>
          )}
          {canEdit && (
            <>
              <button onClick={discard} disabled={!dirty}
                className="text-xs font-semibold px-2.5 py-1 rounded border border-surface-5 text-txt-secondary hover:text-txt-primary hover:bg-surface-3 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                Discard
              </button>
              <button onClick={commit} disabled={!dirty || saving}
                className="text-xs font-bold px-3 py-1 rounded text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                style={{ backgroundColor: dirty ? 'var(--accent-info)' : 'var(--surface-4)' }}>
                {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
              </button>
            </>
          )}
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners}
        onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={onDragCancel}>

        <div className="overflow-x-auto no-scrollbar py-2">
          <div className="mx-auto flex flex-col gap-6 w-fit">
            {board.tiers.map((tier, ti) => (
              <div key={ti} className="flex gap-3 justify-center items-start">
                {tier.map(id => {
                  const slot = board.slots.find(s => s.id === id)
                  if (!slot) return null
                  return <SlotColumn key={id} slot={slot} items={containers[id] || EMPTY_ARR}
                    byKey={byKey} activeId={activeId} {...tileActions} />
                })}
              </div>
            ))}
          </div>
        </div>

        {createPortal(
          <DragOverlay dropAnimation={null} style={activeWidth ? { width: activeWidth } : undefined}>
            {activeId && byKey[activeId]
              ? <TileView tile={byKey[activeId]} dragging teamLogo={teamLogo} />
              : null}
          </DragOverlay>,
          document.body,
        )}
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

// ── Slot column (sortable container) ──────────────────────────────────────────
function SlotColumn({ slot, items, byKey, ...rest }) {
  const { setNodeRef, isOver } = useDroppable({ id: slot.id })
  const hole = slot.isHole
  return (
    <div className="w-[10.5rem] shrink-0 flex flex-col">
      {/* position header */}
      <div className="flex items-center justify-between gap-1 px-1 mb-1.5">
        <span className="font-bold text-txt-primary text-xs uppercase tracking-wider">{slot.label}</span>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline">{slot.grade}</Badge>
          <span className="text-[10px] text-txt-muted tabular-nums">{items.length}</span>
        </div>
      </div>
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef}
          className={`rounded-lg p-1 space-y-1 min-h-[3.5rem] transition-colors ${isOver ? 'bg-surface-4/60 ring-1 ring-[color:var(--accent-info)]' : 'bg-surface-1/50'} ${hole ? 'ring-1 ring-[color:var(--accent-error)]/60' : ''}`}>
          {items.length === 0
            ? <div className="text-[10px] text-txt-tertiary italic py-3 text-center">{hole ? 'no depth' : '—'}</div>
            : items.map((key, idx) => byKey[key]
              ? <SortableTile key={key} tile={byKey[key]} isStarter={idx === 0} {...rest} />
              : null)}
        </div>
      </SortableContext>
    </div>
  )
}

// ── Sortable wrapper around a tile ────────────────────────────────────────────
function SortableTile({ tile, isStarter, canEdit, teamLogo, leaveSet, markMode, highlightKey, onTileClick }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tile.key, disabled: !canEdit })
  // touchAction:'none' lets the TouchSensor long-press own the gesture once it
  // activates; without it the browser keeps scrolling and the tile never moves.
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1, touchAction: canEdit ? 'none' : undefined }
  const leaving = tile.pid && leaveSet?.has(tile.pid)
  const highlighted = highlightKey && tile.key === highlightKey
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
      id={tile.pid ? `dc-tile-${tile.pid}` : undefined}
      className={highlighted ? 'rounded-md ring-2 ring-[color:var(--accent-info)] ring-offset-2 ring-offset-surface-1 transition-shadow' : ''}
      onClick={(e) => { e.stopPropagation(); onTileClick?.(tile) }}>
      <TileView tile={tile} isStarter={isStarter} grab={canEdit}
        teamLogo={teamLogo} leaving={leaving} markMode={markMode} />
    </div>
  )
}

// ── Tile presentation ─────────────────────────────────────────────────────────
function ovrColor(ovr) {
  if (ovr == null) return 'var(--text-muted)'
  if (ovr >= 80) return 'var(--text-primary)'
  if (ovr >= 70) return 'var(--text-secondary)'
  return 'var(--text-tertiary)'
}

function TileView({ tile, isStarter, grab, dragging, teamLogo, leaving, markMode }) {
  const tint = leaving ? undefined : devTraitGradient(tile.devTrait, isStarter)
  const cursor = grab ? (markMode ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing') : 'cursor-pointer'
  return (
    <div className={`relative rounded-md pl-2 pr-1.5 py-1 overflow-hidden ${dragging ? 'shadow-xl bg-surface-3 ring-1 ring-[color:var(--accent-info)]' : isStarter ? 'bg-surface-3' : 'bg-surface-2'} ${cursor} ${leaving ? 'ring-1 ring-[color:var(--accent-error)] opacity-70' : ''}`}>
      {tint && <span aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ background: tint }} />}
      <div className="relative z-[1] flex items-center gap-1.5 min-w-0">
        <span className="text-xs font-bold tabular-nums text-txt-primary w-6 text-right shrink-0">{tile.jerseyNumber != null && tile.jerseyNumber !== '' ? `#${tile.jerseyNumber}` : ''}</span>
        <Avatar url={tile.player?.pictureUrl} fallback={teamLogo} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 min-w-0">
            <PlayerName name={tile.name} strike={leaving} />
          </div>
          <div className="text-[10px] text-txt-tertiary">{tile.position} · {tile.projectedClass}</div>
        </div>
        <div className="text-right shrink-0">
          <span className="tabular-nums font-bold text-sm" style={{ color: ovrColor(tile.projectedOvr) }}>{tile.projectedOvr ?? '—'}</span>
          {(leaving || tile.isNfl || tile.portalRisk) && (
            <div className="flex justify-end gap-0.5 mt-0.5">
              {leaving && <span className="text-[8px] font-bold uppercase tracking-wide text-[color:var(--accent-error)]">OUT</span>}
              {!leaving && tile.isNfl && <span className="text-[8px] font-bold uppercase tracking-wide text-[color:var(--accent-info)]">NFL</span>}
              {!leaving && tile.portalRisk && <span className="text-[8px] font-bold uppercase tracking-wide text-[color:var(--accent-warning)]">↗</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
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

function PlayerName({ name, strike }) {
  const ref = useRef(null)
  const measureRef = useRef(null)
  const [abbrev, setAbbrev] = useState(false)
  useLayoutEffect(() => {
    const c = ref.current, m = measureRef.current
    if (!c || !m) return
    // Abbreviate when the full name doesn't fit. No slack: a sub-pixel overflow
    // still gets ellipsized by CSS, so any overflow must trigger the "F. Last"
    // form. Re-check on the next frame too, since the avatar image / OVR can
    // shift the available width after the first synchronous measure.
    let raf = 0
    const check = () => setAbbrev(m.offsetWidth > c.clientWidth)
    check()
    raf = requestAnimationFrame(check)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null
    ro?.observe(c)
    return () => { cancelAnimationFrame(raf); ro?.disconnect() }
  }, [name])
  const content = (
    <>
      {abbrev ? shortName(name) : name}
      <span ref={measureRef} aria-hidden="true" className="invisible absolute left-0 top-0 whitespace-nowrap">{name}</span>
    </>
  )
  const cls = `relative block min-w-0 truncate font-medium text-txt-primary text-xs ${strike ? 'line-through opacity-70' : ''}`
  return <span ref={ref} title={name} className={cls}>{content}</span>
}
