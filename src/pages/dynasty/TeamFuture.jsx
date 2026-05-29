import { useState, useMemo, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable, pointerWithin,
} from '@dnd-kit/core'
import { useDynasty } from '../../context/DynastyContext'
import { PageHero, Card, EmptyState, Select } from '../../components/ui'
import { proxyImageUrl } from '../../utils/imageProxy'
import { projectRoster } from '../../utils/rosterProjection'
import { buildDepthChart } from '../../utils/depthChart'
import { TAB_FORMATIONS } from '../../data/positionGroups'

const TABS = [
  { key: 'offense', label: 'Offense' },
  { key: 'defense', label: 'Defense' },
  { key: 'st', label: 'Special Teams' },
]
const DEV_BORDER = { Elite: '#f5c518', Star: '#ef4444', Impact: '#3b82f6', Normal: '#5b6472' }
const GRADE_COLOR = (g) => g[0] === 'A' ? '#4ade80' : g[0] === 'B' ? '#86efac' : g[0] === 'C' ? '#fde047' : g[0] === 'D' ? '#fb923c' : '#fca5a5'
const incomingTag = (p) => p.isPortal ? ' · PORTAL' : (p.stars ? ` ★${p.stars}` : '')
const EMPTY_OBJ = {}
const EMPTY_ARR = []
const CARD_W = 158

export default function TeamFuture() {
  const { id: dynastyId } = useParams()
  const { currentDynasty, isViewOnly, saveTeamFuture } = useDynasty()
  const tid = currentDynasty?.currentTid
  const currentYear = Number(currentDynasty?.currentYear)

  const [tab, setTab] = useState('offense')
  const [year, setYear] = useState(currentYear)

  // Draft (working) state — edits mutate it instantly; one Save commits all.
  const seed = () => {
    const tf = currentDynasty?.teamFuture?.[tid] || {}
    return { slotOf: tf.slotOf || {}, order: tf.order || {}, flags: tf.leaveFlags || [] }
  }
  const [draft, setDraft] = useState(seed)
  const [dirty, setDirty] = useState(false)
  const [activeDrag, setActiveDrag] = useState(null) // { pid, fromSlot, group, player, label }
  useEffect(() => { setDraft(seed()); setDirty(false) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tid])

  const slotOf = draft.slotOf || EMPTY_OBJ
  const order = draft.order || EMPTY_OBJ
  const flags = draft.flags || EMPTY_ARR
  const leaveFlags = useMemo(() => new Set(flags), [flags])

  const years = useMemo(() => {
    const ys = new Set()
    for (const p of currentDynasty?.players || []) {
      for (const y of Object.keys(p.teamsByYear || {})) ys.add(Number(y))
    }
    const min = ys.size ? Math.min(...ys, currentYear) : currentYear
    const out = []
    for (let y = min; y <= currentYear + 4; y++) out.push(y)
    return out
  }, [currentDynasty, currentYear])

  const chart = useMemo(() => {
    if (!currentDynasty || tid == null) return []
    const projected = projectRoster(currentDynasty, tid, year, { leaveFlags })
    return buildDepthChart(projected, { formation: TAB_FORMATIONS[tab], slotOf, order, lastYear: currentYear })
  }, [currentDynasty, tid, year, tab, leaveFlags, slotOf, order, currentYear])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  if (!currentDynasty) return null
  if (tid == null) {
    return <Card><EmptyState title="No team selected" message="Set your current team to use the depth chart." /></Card>
  }

  const editable = !isViewOnly && year >= currentYear

  // ── Draft mutations (batched until Save) ────────────────────────────────
  const moveToSlot = (pid, targetSlotId) => { setDraft(d => ({ ...d, slotOf: { ...d.slotOf, [pid]: targetSlotId } })); setDirty(true) }
  const reorderWithin = (slotId, slotPids, pid, dir) => {
    const arr = [...slotPids]
    const i = arr.indexOf(pid), j = i + dir
    if (i < 0 || j < 0 || j >= arr.length) return
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    setDraft(d => ({ ...d, order: { ...d.order, [slotId]: arr } })); setDirty(true)
  }
  const toggleLeave = (pid) => { setDraft(d => ({ ...d, flags: d.flags.includes(pid) ? d.flags.filter(x => x !== pid) : [...d.flags, pid] })); setDirty(true) }
  const onSave = () => { saveTeamFuture?.(dynastyId, tid, { slotOf: draft.slotOf, order: draft.order, leaveFlags: draft.flags }); setDirty(false) }
  const onReset = () => { setDraft(seed()); setDirty(false) }

  const onDragStart = ({ active }) => setActiveDrag(active.data.current || null)
  const onDragEnd = ({ active, over }) => {
    setActiveDrag(null)
    if (!over) return
    const a = active.data.current
    const overGroup = over.data.current?.group
    if (a && overGroup === a.group && over.id !== a.fromSlot) moveToSlot(a.pid, over.id)
  }

  return (
    <div className="space-y-5">
      <div>
        <PageHero title="Depth Chart" />
        <label className="flex items-center gap-2 text-xs text-txt-tertiary mt-1">Season
          <Select size="sm" value={String(year)} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map(y => <option key={y} value={String(y)}>{y < currentYear ? y : y === currentYear ? `${y} — Now` : `${y} (+${y - currentYear})`}</option>)}
          </Select>
        </label>
      </div>

      <div className="flex gap-1 border-b" style={{ borderColor: 'var(--surface-4)' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider"
            style={{ color: tab === t.key ? 'var(--text-primary)' : 'var(--text-tertiary)', borderBottom: tab === t.key ? '3px solid #22d3ee' : '3px solid transparent' }}>
            {t.label}
          </button>
        ))}
      </div>

      {editable && (
        <p className="text-[11px] text-txt-tertiary">Grab a card and drop it on another position in the same group to move that player; use ▲▼ to set depth within a position; ⚑ marks a likely departure. Changes save together.</p>
      )}

      {editable && dirty && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg sticky top-2 z-10" style={{ background: '#10233d', border: '1px solid #2b5fa8' }}>
          <span className="text-xs font-semibold" style={{ color: '#9cc2f5' }}>Unsaved depth-chart changes</span>
          <div className="flex gap-2">
            <button onClick={onReset} className="px-3 py-1.5 text-xs font-semibold rounded-md" style={{ color: '#cbd5e1', border: '1px solid #475569' }}>Reset</button>
            <button onClick={onSave} className="px-4 py-1.5 text-xs font-bold rounded-md" style={{ background: '#2563eb', color: '#fff' }}>Save changes</button>
          </div>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveDrag(null)}>
        <div className="flex flex-wrap gap-3 justify-center">
          {chart.map(slot => (
            <DepthCard key={slot.id} slot={slot} editable={editable} leaveFlagList={flags}
              onReorderWithin={reorderWithin} onToggleLeave={toggleLeave} />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeDrag ? <CardFace player={activeDrag.player} label={activeDrag.label} overlay /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

// The grabbable face of a card (header + photo + name). Reused inside the slot
// card and in the floating DragOverlay so the lifted card matches.
function CardFace({ player, label, flagged, overlay }) {
  const border = DEV_BORDER[player?.devTrait] || DEV_BORDER.Normal
  return (
    <div
      className="rounded-t-xl overflow-hidden"
      style={{
        width: overlay ? CARD_W : '100%',
        background: 'linear-gradient(160deg,#262a33,#14161b)',
        borderTop: `5px solid ${flagged ? '#dc2626' : border}`,
        boxShadow: overlay ? '0 18px 40px rgba(0,0,0,0.6)' : 'none',
        transform: overlay ? 'rotate(-2deg)' : 'none',
        cursor: 'grabbing',
      }}
    >
      <div className="flex items-center justify-between px-2.5 pt-2">
        <span className="text-[10px] font-extrabold tracking-widest text-txt-tertiary">{label}</span>
        <span className="flex items-center justify-center rounded-full font-black tabular-nums"
          style={{ width: 26, height: 26, fontSize: 12, color: '#fff', background: '#0c0e12', border: `2px solid ${border}` }}>
          {player?.projectedOvr ?? '—'}
        </span>
      </div>
      <div className="flex items-center justify-center mt-1" style={{ height: 60 }}>
        {player && !player.isIncoming && player.player?.pictureUrl
          ? <img src={proxyImageUrl(player.player.pictureUrl, 300)} alt="" className="w-14 h-14 rounded-full object-cover" style={{ border: '2px solid #5b6472' }} draggable={false} />
          : <div className="w-14 h-14 rounded-full" style={{ background: '#3a4150' }} />}
      </div>
      <div className="px-2 pb-2 pt-1 text-center">
        <div className="text-[12px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>
          {player ? player.name : ''}{player?.isIncoming ? incomingTag(player) : ''}
        </div>
        <div className="text-[10px] text-txt-tertiary">{player?.projectedClass || ''}{flagged ? ' · LIKELY OUT' : ''}</div>
      </div>
    </div>
  )
}

function DepthCard({ slot, editable, leaveFlagList, onReorderWithin, onToggleLeave }) {
  const { starter, backups, grade, isHole, group, slotPids, label } = slot
  const flagged = starter && leaveFlagList.includes(starter.pid)

  // The whole slot is a drop target (you can drop into an empty position too).
  const { setNodeRef: setDropRef, isOver, active } = useDroppable({
    id: slot.id, data: { group }, disabled: !editable,
  })
  const validOver = isOver && active?.data?.current?.group === group && active?.data?.current?.fromSlot !== slot.id

  const starterPid = starter && !starter.isIncoming ? starter.pid : null

  return (
    <div ref={setDropRef} style={{ width: CARD_W }}>
      <div
        className="rounded-xl overflow-hidden transition-shadow"
        style={{
          background: 'linear-gradient(160deg,#262a33,#14161b)',
          border: `1px solid ${validOver ? '#22d3ee' : (flagged ? '#dc2626' : '#2c2f37')}`,
          boxShadow: validOver ? '0 0 0 2px #22d3ee, 0 8px 24px rgba(34,211,238,0.18)' : '0 2px 6px rgba(0,0,0,0.4)',
        }}
      >
        {/* Starter — grabbable */}
        {starterPid
          ? <DraggablePlayer player={starter} slot={slot} label={label} flagged={flagged} />
          : <CardFace player={starter} label={label} flagged={flagged} />}

        {/* Controls */}
        {editable && starterPid && (
          <div className="flex justify-center gap-3 pb-1.5 text-[12px]">
            <button onClick={() => onReorderWithin(slot.id, slotPids, starterPid, -1)} title="Move up in this position" className="px-1 hover:text-white text-txt-tertiary">▲</button>
            <button onClick={() => onReorderWithin(slot.id, slotPids, starterPid, +1)} title="Move down in this position" className="px-1 hover:text-white text-txt-tertiary">▼</button>
            <button onClick={() => onToggleLeave(starterPid)} title="Flag likely to leave" className="px-1" style={{ color: flagged ? '#dc2626' : '#888' }}>⚑</button>
          </div>
        )}

        {/* Backups — each grabbable */}
        {backups.map(b => (
          <BackupRow key={b.key} player={b} slot={slot} editable={editable} risk={!!slot.risk?.[b.pid]} />
        ))}
      </div>
      <div className="flex items-center justify-center gap-2 mt-1 font-black text-sm">
        {label} <span className="font-mono text-[11px] px-1.5 rounded" style={{ background: '#161616', color: GRADE_COLOR(grade) }}>{grade}</span>
      </div>
    </div>
  )
}

function DraggablePlayer({ player, slot, label, flagged }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: player.pid,
    data: { pid: player.pid, fromSlot: slot.id, group: slot.group, player, label },
  })
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}
      style={{ cursor: 'grab', opacity: isDragging ? 0.4 : 1, touchAction: 'none' }}>
      <CardFace player={player} label={label} flagged={flagged} />
    </div>
  )
}

function BackupRow({ player, slot, editable, risk }) {
  const grabbable = editable && !player.isIncoming && player.pid
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: player.pid || `inc-${player.key}`,
    data: { pid: player.pid, fromSlot: slot.id, group: slot.group, player, label: slot.label },
    disabled: !grabbable,
  })
  return (
    <div ref={setNodeRef} {...(grabbable ? { ...listeners, ...attributes } : {})}
      className="flex justify-between items-center px-2.5 py-1 text-[11px]"
      style={{ borderTop: '1px solid #242424', background: player.isIncoming ? '#10233d' : 'transparent', cursor: grabbable ? 'grab' : 'default', opacity: isDragging ? 0.4 : 1, touchAction: grabbable ? 'none' : 'auto' }}>
      <span className="truncate mr-2" style={{ color: player.isIncoming ? '#7fb0f5' : (risk ? '#f87171' : '#cbd0d8') }}>
        {player.name}{player.isIncoming ? incomingTag(player) : ''}{risk ? ' ⚑' : ''}
      </span>
      <span className="tabular-nums font-bold">{player.projectedOvr ?? '—'}</span>
    </div>
  )
}
