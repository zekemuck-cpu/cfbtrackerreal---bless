import { useState, useMemo, useEffect } from 'react'
import { useParams } from 'react-router-dom'
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
  const [selected, setSelected] = useState(null) // { pid, fromSlot, group, name }

  // Draft (working) state — edits mutate it instantly; one Save commits all.
  const seed = () => {
    const tf = currentDynasty?.teamFuture?.[tid] || {}
    return { slotOf: tf.slotOf || {}, order: tf.order || {}, flags: tf.leaveFlags || [] }
  }
  const [draft, setDraft] = useState(seed)
  const [dirty, setDirty] = useState(false)
  useEffect(() => { setDraft(seed()); setDirty(false); setSelected(null) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tid])

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
  const onReset = () => { setDraft(seed()); setDirty(false); setSelected(null) }

  const changeTab = (t) => { setTab(t); setSelected(null) }
  const changeYear = (y) => { setYear(y); setSelected(null) }

  // ── Tap-to-move ─────────────────────────────────────────────────────────
  // Tap a player to pick up / put down. If a player from THIS position is
  // already picked up, tapping a teammate reorders depth (insert before them);
  // tapping another position's card (the MOVE HERE target) changes position.
  const onPlayerTap = (pid, slotId, group, name, slotPids) => {
    if (!editable || !pid) return
    if (selected && selected.pid !== pid && selected.fromSlot === slotId && selected.group === group) {
      const arr = (slotPids || []).filter(p => p !== selected.pid)
      const ti = arr.indexOf(pid)
      if (ti >= 0) {
        arr.splice(ti, 0, selected.pid)
        setDraft(d => ({ ...d, order: { ...d.order, [slotId]: arr } }))
        setDirty(true)
      }
      setSelected(null)
      return
    }
    setSelected(s => (s && s.pid === pid) ? null : { pid, fromSlot: slotId, group, name })
  }
  const placeAt = (slotId) => {
    if (!selected) return
    if (slotId !== selected.fromSlot) moveToSlot(selected.pid, slotId)
    setSelected(null)
  }

  return (
    <div className="space-y-5">
      <div>
        <PageHero title="Depth Chart" />
        <label className="flex items-center gap-2 text-xs text-txt-tertiary mt-1">Season
          <Select size="sm" value={String(year)} onChange={(e) => changeYear(Number(e.target.value))}>
            {years.map(y => <option key={y} value={String(y)}>{y < currentYear ? y : y === currentYear ? `${y} — Now` : `${y} (+${y - currentYear})`}</option>)}
          </Select>
        </label>
      </div>

      <div className="flex gap-1 border-b" style={{ borderColor: 'var(--surface-4)' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => changeTab(t.key)}
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider"
            style={{ color: tab === t.key ? 'var(--text-primary)' : 'var(--text-tertiary)', borderBottom: tab === t.key ? '3px solid #22d3ee' : '3px solid transparent' }}>
            {t.label}
          </button>
        ))}
      </div>

      {editable && !selected && (
        <p className="text-[11px] text-txt-tertiary">Tap a player to pick them up, then tap a glowing position to move them — or tap a teammate in their own position to drop them at that depth. ⚑ marks a likely departure. Changes save together.</p>
      )}
      {editable && selected && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 rounded-lg" style={{ background: '#0f2a36', border: '1px solid #22d3ee' }}>
          <span className="text-xs font-semibold" style={{ color: '#67e8f9' }}>Moving <b>{selected.name}</b> — tap a glowing position to move them, a teammate to set their depth, or tap them again to cancel.</span>
          <button onClick={() => setSelected(null)} className="px-3 py-1 text-xs font-semibold rounded-md" style={{ color: '#cbd5e1', border: '1px solid #475569' }}>Cancel</button>
        </div>
      )}

      {editable && dirty && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg sticky top-2 z-20" style={{ background: '#10233d', border: '1px solid #2b5fa8' }}>
          <span className="text-xs font-semibold" style={{ color: '#9cc2f5' }}>Unsaved depth-chart changes</span>
          <div className="flex gap-2">
            <button onClick={onReset} className="px-3 py-1.5 text-xs font-semibold rounded-md" style={{ color: '#cbd5e1', border: '1px solid #475569' }}>Reset</button>
            <button onClick={onSave} className="px-4 py-1.5 text-xs font-bold rounded-md" style={{ background: '#2563eb', color: '#fff' }}>Save changes</button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3 justify-center">
        {chart.map(slot => (
          <DepthCard key={slot.id} slot={slot} editable={editable} leaveFlagList={flags}
            selected={selected} onPlayerTap={onPlayerTap} onPlace={placeAt}
            onReorderWithin={reorderWithin} onToggleLeave={toggleLeave} />
        ))}
      </div>
    </div>
  )
}

function DepthCard({ slot, editable, leaveFlagList, selected, onPlayerTap, onPlace, onReorderWithin, onToggleLeave }) {
  const { starter, backups, grade, isHole, group, slotPids, label } = slot
  const border = starter ? (DEV_BORDER[starter.devTrait] || DEV_BORDER.Normal) : '#dc2626'
  const flagged = starter && leaveFlagList.includes(starter.pid)
  const starterPid = starter && !starter.isIncoming ? starter.pid : null

  const isTarget = editable && selected && selected.group === group && selected.fromSlot !== slot.id
  const selRing = (pid) => selected && pid && selected.pid === pid
  // A teammate of the picked-up player in THIS position → tap to set depth.
  const reorderTarget = (pid) => editable && selected && pid && selected.fromSlot === slot.id && selected.pid !== pid

  return (
    <div className="relative" style={{ width: CARD_W }}>
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: 'linear-gradient(160deg,#262a33,#14161b)',
          border: `1px solid ${selRing(starterPid) ? '#22d3ee' : (flagged ? '#dc2626' : '#2c2f37')}`,
          borderTopWidth: 4, borderTopColor: flagged ? '#dc2626' : border,
          boxShadow: selRing(starterPid) ? '0 0 0 2px #22d3ee' : '0 2px 6px rgba(0,0,0,0.4)',
        }}
      >
        {/* Starter — tap to pick up (or, when a teammate is held, to place at top) */}
        <div
          onClick={() => onPlayerTap(starterPid, slot.id, group, starter?.name, slotPids)}
          style={{
            cursor: editable && starterPid ? 'pointer' : 'default',
            background: reorderTarget(starterPid) ? 'rgba(34,211,238,0.12)' : 'transparent',
            boxShadow: reorderTarget(starterPid) ? 'inset 0 0 0 2px #22d3ee' : 'none',
          }}
        >
          <div className="flex items-center justify-between px-2.5 pt-2">
            <span className="text-[10px] font-extrabold tracking-widest text-txt-tertiary">{label}</span>
            <span className="flex items-center justify-center rounded-full font-black tabular-nums"
              style={{ width: 26, height: 26, fontSize: 12, color: '#fff', background: '#0c0e12', border: `2px solid ${isHole ? '#dc2626' : border}` }}>
              {starter?.projectedOvr ?? '—'}
            </span>
          </div>
          <div className="flex items-center justify-center mt-1" style={{ height: 60 }}>
            {starter && !starter.isIncoming && starter.player?.pictureUrl
              ? <img src={proxyImageUrl(starter.player.pictureUrl, 300)} alt="" className="w-14 h-14 rounded-full object-cover" style={{ border: '2px solid #5b6472' }} />
              : <div className="w-14 h-14 rounded-full" style={{ background: isHole ? 'transparent' : '#3a4150', border: isHole ? '2px dashed #7f1d1d' : 'none' }} />}
          </div>
          <div className="px-2 pb-1 pt-1 text-center">
            <div className="text-[12px] font-bold truncate" style={{ color: isHole ? '#f87171' : 'var(--text-primary)' }}>
              {isHole ? 'EMPTY' : starter.name}{!isHole && starter.isIncoming ? incomingTag(starter) : ''}
            </div>
            <div className="text-[10px] text-txt-tertiary">{isHole ? 'no projected starter' : starter.projectedClass}{flagged ? ' · LIKELY OUT' : ''}</div>
          </div>
        </div>

        {/* Controls */}
        {editable && starterPid && (
          <div className="flex justify-center gap-3 pb-1.5 text-[12px]">
            <button onClick={(e) => { e.stopPropagation(); onReorderWithin(slot.id, slotPids, starterPid, -1) }} title="Move up in this position" className="px-1 text-txt-tertiary hover:text-white">▲</button>
            <button onClick={(e) => { e.stopPropagation(); onReorderWithin(slot.id, slotPids, starterPid, +1) }} title="Move down in this position" className="px-1 text-txt-tertiary hover:text-white">▼</button>
            <button onClick={(e) => { e.stopPropagation(); onToggleLeave(starterPid) }} title="Flag likely to leave" className="px-1" style={{ color: flagged ? '#dc2626' : '#888' }}>⚑</button>
          </div>
        )}

        {/* Backups — tap to pick up */}
        {backups.map(b => {
          const bPid = !b.isIncoming ? b.pid : null
          return (
            <div key={b.key}
              onClick={() => onPlayerTap(bPid, slot.id, group, b.name, slotPids)}
              className="flex justify-between items-center px-2.5 py-1 text-[11px]"
              style={{ borderTop: '1px solid #242424', background: selRing(bPid) ? '#0f2a36' : (reorderTarget(bPid) ? 'rgba(34,211,238,0.12)' : (b.isIncoming ? '#10233d' : 'transparent')), cursor: editable && bPid ? 'pointer' : 'default', boxShadow: (selRing(bPid) || reorderTarget(bPid)) ? 'inset 0 0 0 1px #22d3ee' : 'none' }}>
              <span className="truncate mr-2" style={{ color: b.isIncoming ? '#7fb0f5' : (slot.risk?.[b.pid] ? '#f87171' : '#cbd0d8') }}>
                {b.name}{b.isIncoming ? incomingTag(b) : ''}{slot.risk?.[b.pid] ? ' ⚑' : ''}
              </span>
              <span className="tabular-nums font-bold">{b.projectedOvr ?? '—'}</span>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-center gap-2 mt-1 font-black text-sm">
        {label} <span className="font-mono text-[11px] px-1.5 rounded" style={{ background: '#161616', color: GRADE_COLOR(grade) }}>{grade}</span>
      </div>

      {/* Tap-to-place target overlay (only valid same-group destinations) */}
      {isTarget && (
        <button
          onClick={() => onPlace(slot.id)}
          className="absolute inset-0 flex items-center justify-center rounded-xl"
          style={{ background: 'rgba(34,211,238,0.16)', border: '2px dashed #22d3ee', color: '#a5f3fc', fontWeight: 800, fontSize: 12, letterSpacing: '1px' }}
          title="Move the selected player here"
        >
          ↧ MOVE HERE
        </button>
      )}
    </div>
  )
}
