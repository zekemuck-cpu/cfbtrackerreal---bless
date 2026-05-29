import { useState, useMemo, useEffect, useRef } from 'react'
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
// Label for an incoming player: portal transfers vs star-rated recruits.
const incomingTag = (p) => p.isPortal ? ' · PORTAL' : (p.stars ? ` ★${p.stars}` : '')
// Stable empty refs so the chart memo doesn't rebuild every render for a team
// with no saved depth order / leave flags.
const EMPTY_ARR = []
const EMPTY_OBJ = {}

export default function TeamFuture() {
  const { id: dynastyId } = useParams()
  const { currentDynasty, isViewOnly, saveTeamFuture } = useDynasty()
  const tid = currentDynasty?.currentTid
  const currentYear = Number(currentDynasty?.currentYear)

  const [tab, setTab] = useState('offense')
  const [year, setYear] = useState(currentYear)

  // Draft (working) depth-chart state — edits mutate the draft instantly so
  // cards move fluidly; a single Save commits the whole batch to storage.
  const [draftOrder, setDraftOrder] = useState(() => currentDynasty?.teamFuture?.depthOrder?.[tid] || {})
  const [draftFlags, setDraftFlags] = useState(() => currentDynasty?.teamFuture?.leaveFlags?.[tid] || [])
  const [dirty, setDirty] = useState(false)

  // Re-seed the draft from the persisted state when the active team changes.
  useEffect(() => {
    setDraftOrder(currentDynasty?.teamFuture?.depthOrder?.[tid] || {})
    setDraftFlags(currentDynasty?.teamFuture?.leaveFlags?.[tid] || [])
    setDirty(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tid])

  const leaveFlags = useMemo(() => new Set(draftFlags), [draftFlags])

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
    return buildDepthChart(projected, { formation: TAB_FORMATIONS[tab], manualOrder: draftOrder, lastYear: currentYear })
  }, [currentDynasty, tid, year, tab, leaveFlags, draftOrder, currentYear])

  if (!currentDynasty) return null
  if (tid == null) {
    return <Card><EmptyState title="No team selected" message="Set your current team to use Team Future." /></Card>
  }

  const editable = !isViewOnly && year >= currentYear
  const yearLabel = year < currentYear ? `${year} (history)` : year === currentYear ? `${year} (now)` : `${year} (+${year - currentYear})`

  // ── Draft mutations (no persistence — batched until Save) ───────────────
  const moveInGroup = (group, groupPool, draggedPid, targetPid) => {
    if (!draggedPid || !targetPid || draggedPid === targetPid) return
    const order = [...groupPool]
    const from = order.indexOf(draggedPid)
    const to = order.indexOf(targetPid)
    if (from < 0 || to < 0) return
    order.splice(from, 1)
    order.splice(to, 0, draggedPid)
    setDraftOrder(prev => ({ ...prev, [group]: order }))
    setDirty(true)
  }
  const bump = (group, groupPool, pid, dir) => {
    const order = [...groupPool]
    const i = order.indexOf(pid)
    const j = i + dir
    if (i < 0 || j < 0 || j >= order.length) return
    ;[order[i], order[j]] = [order[j], order[i]]
    setDraftOrder(prev => ({ ...prev, [group]: order }))
    setDirty(true)
  }
  const toggleLeave = (pid) => {
    setDraftFlags(prev => prev.includes(pid) ? prev.filter(x => x !== pid) : [...prev, pid])
    setDirty(true)
  }
  const onSave = () => { saveTeamFuture?.(dynastyId, tid, draftOrder, draftFlags); setDirty(false) }
  const onReset = () => {
    setDraftOrder(currentDynasty?.teamFuture?.depthOrder?.[tid] || {})
    setDraftFlags(currentDynasty?.teamFuture?.leaveFlags?.[tid] || [])
    setDirty(false)
  }

  return (
    <div className="space-y-6">
      <PageHero eyebrow="Outlook" title="Team Future" meta={<span>{yearLabel}</span>} />

      <div className="flex items-center justify-between gap-3 flex-wrap border-b" style={{ borderColor: 'var(--surface-4)' }}>
        <div className="flex gap-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="px-4 py-2 text-xs font-bold uppercase tracking-wider"
              style={{ color: tab === t.key ? 'var(--text-primary)' : 'var(--text-tertiary)', borderBottom: tab === t.key ? '3px solid #22d3ee' : '3px solid transparent' }}>
              {t.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-txt-tertiary pb-2">Season
          <Select size="sm" value={String(year)} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map(y => <option key={y} value={String(y)}>{y < currentYear ? y : y === currentYear ? `${y} — Now` : `${y} (+${y - currentYear})`}</option>)}
          </Select>
        </label>
      </div>

      {editable && (
        <p className="text-[11px] text-txt-tertiary">Drag a card onto another within the same position group to reorder depth, or use ▲▼. Mark a player ⚑ if they'll likely leave. Changes are saved together.</p>
      )}

      {editable && dirty && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg" style={{ background: '#10233d', border: '1px solid #2b5fa8' }}>
          <span className="text-xs font-semibold" style={{ color: '#9cc2f5' }}>Unsaved depth-chart changes</span>
          <div className="flex gap-2">
            <button onClick={onReset} className="px-3 py-1.5 text-xs font-semibold rounded-md" style={{ color: '#cbd5e1', border: '1px solid #475569' }}>Reset</button>
            <button onClick={onSave} className="px-4 py-1.5 text-xs font-bold rounded-md" style={{ background: '#2563eb', color: '#fff' }}>Save changes</button>
          </div>
        </div>
      )}

      <CardGrid chart={chart} editable={editable} leaveFlagList={draftFlags}
        onMove={moveInGroup} onBump={bump} onToggleLeave={toggleLeave} />
    </div>
  )
}

function CardGrid({ chart, editable, leaveFlagList, onMove, onBump, onToggleLeave }) {
  // Shared across cards so a drag started on one card can drop on another.
  const dragRef = useRef(null) // { group, pid }
  return (
    <div className="flex flex-wrap gap-3 justify-center">
      {chart.map(slot => (
        <PositionCard key={slot.id} slot={slot} editable={editable} leaveFlagList={leaveFlagList}
          dragRef={dragRef} onMove={onMove} onBump={onBump} onToggleLeave={onToggleLeave} />
      ))}
    </div>
  )
}

function PositionCard({ slot, editable, leaveFlagList, dragRef, onMove, onBump, onToggleLeave }) {
  const { starter, backups, grade, isHole, group, groupPool } = slot
  const border = starter ? (DEV_BORDER[starter.devTrait] || DEV_BORDER.Normal) : '#dc2626'
  const flagged = starter && leaveFlagList.includes(starter.pid)
  const [dropping, setDropping] = useState(false)

  // Native HTML5 drag-and-drop. Only real (non-incoming) players are draggable
  // and droppable; drops are constrained to the same position group.
  const dragProps = (pid) => (editable && pid) ? {
    draggable: true,
    onDragStart: (e) => {
      dragRef.current = { group, pid }
      e.dataTransfer.effectAllowed = 'move'
      try { e.dataTransfer.setData('text/plain', String(pid)) } catch { /* ignored */ }
      e.stopPropagation()
    },
    onDragEnd: () => { dragRef.current = null; setDropping(false) },
    onDragOver: (e) => {
      if (dragRef.current && dragRef.current.group === group && dragRef.current.pid !== pid) {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
      }
    },
    onDragEnter: (e) => { if (dragRef.current && dragRef.current.group === group && dragRef.current.pid !== pid) { e.preventDefault(); setDropping(true) } },
    onDragLeave: () => setDropping(false),
    onDrop: (e) => {
      e.preventDefault()
      setDropping(false)
      const d = dragRef.current
      if (d && d.group === group) onMove(group, groupPool, d.pid, pid)
      dragRef.current = null
    },
  } : {}

  const starterPid = starter && !starter.isIncoming ? starter.pid : null

  return (
    <div style={{ width: 150 }}>
      {/* Starter block — draggable + drop target */}
      <div
        className="rounded-lg overflow-hidden"
        style={{
          background: '#1b1b1b',
          border: `1px solid ${dropping ? '#22d3ee' : (flagged ? '#dc2626' : '#333')}`,
          borderTopWidth: 4, borderTopColor: flagged ? '#dc2626' : border,
          cursor: starterPid ? 'grab' : 'default',
        }}
        {...dragProps(starterPid)}
      >
        <div className="flex items-center justify-between px-2 py-1" style={{ background: '#0f0f0f' }}>
          <span className="text-[10px] font-bold tracking-wide text-txt-tertiary">{slot.label}</span>
          <span className="text-xs font-black tabular-nums">{starter?.projectedOvr ?? '—'}</span>
        </div>
        <div className="h-[64px] flex items-center justify-center" style={{ background: isHole ? '#1a0f10' : 'radial-gradient(circle at 50% 30%,#33405a,#181d28)' }}>
          {starter && !starter.isIncoming && starter.player?.pictureUrl
            ? <img src={proxyImageUrl(starter.player.pictureUrl, 300)} alt="" className="w-12 h-12 rounded-full object-cover" style={{ border: '2px solid #61708a' }} draggable={false} />
            : <div className="w-12 h-12 rounded-full" style={{ background: isHole ? 'transparent' : '#46566f' }} />}
        </div>
        <div className="px-2 py-1 text-center">
          <div className="text-[12px] font-bold truncate" style={{ color: isHole ? '#f87171' : 'var(--text-primary)' }}>
            {isHole ? 'EMPTY' : starter.name}{!isHole && starter.isIncoming ? incomingTag(starter) : ''}
          </div>
          <div className="text-[10px] text-txt-tertiary">{isHole ? 'no projected starter' : starter.projectedClass}{flagged ? ' · LIKELY OUT' : ''}</div>
          {editable && starterPid && (
            <div className="flex justify-center gap-2 mt-1 text-[11px]">
              <button onClick={() => onBump(group, groupPool, starterPid, -1)} title="Move up" className="px-1">▲</button>
              <button onClick={() => onBump(group, groupPool, starterPid, +1)} title="Move down" className="px-1">▼</button>
              <button onClick={() => onToggleLeave(starterPid)} title="Flag likely to leave" className="px-1" style={{ color: flagged ? '#dc2626' : '#888' }}>⚑</button>
            </div>
          )}
        </div>
        {/* Backup rows — each draggable + drop target */}
        {backups.map(b => {
          const bPid = !b.isIncoming ? b.pid : null
          return (
            <div key={b.key}
              className="flex justify-between items-center px-2 py-1 text-[11px]"
              style={{ borderTop: '1px solid #242424', background: b.isIncoming ? '#10233d' : 'transparent', cursor: (editable && bPid) ? 'grab' : 'default' }}
              {...dragProps(bPid)}>
              <span className="truncate mr-2" style={{ color: b.isIncoming ? '#7fb0f5' : (slot.risk?.[b.pid] ? '#f87171' : '#bdbdbd') }}>
                {b.name}{b.isIncoming ? incomingTag(b) : ''}{slot.risk?.[b.pid] ? ' ⚑' : ''}
              </span>
              <span className="tabular-nums font-bold">{b.projectedOvr ?? '—'}</span>
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-center gap-2 mt-1 font-black text-sm">
        {slot.label} <span className="font-mono text-[11px] px-1.5 rounded" style={{ background: '#161616', color: GRADE_COLOR(grade) }}>{grade}</span>
      </div>
    </div>
  )
}
