import { useState, useMemo } from 'react'
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

export default function TeamFuture() {
  const { id: dynastyId } = useParams()
  const { currentDynasty, isViewOnly, saveDepthOrder, saveLeaveFlags } = useDynasty()
  const tid = currentDynasty?.currentTid
  const currentYear = Number(currentDynasty?.currentYear)

  const [tab, setTab] = useState('offense')
  const [year, setYear] = useState(currentYear)

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

  const leaveFlagList = currentDynasty?.teamFuture?.leaveFlags?.[tid] || []
  const leaveFlags = useMemo(() => new Set(leaveFlagList), [leaveFlagList])
  const manualOrder = currentDynasty?.teamFuture?.depthOrder?.[tid] || {}

  const chart = useMemo(() => {
    if (!currentDynasty || tid == null) return []
    const projected = projectRoster(currentDynasty, tid, year, { leaveFlags })
    return buildDepthChart(projected, { formation: TAB_FORMATIONS[tab], manualOrder, lastYear: currentYear })
  }, [currentDynasty, tid, year, tab, leaveFlags, manualOrder, currentYear])

  if (!currentDynasty) return null
  if (tid == null) {
    return <Card><EmptyState title="No team selected" message="Set your current team to use Team Future." /></Card>
  }

  const yearLabel = year < currentYear ? `${year} (history)` : year === currentYear ? `${year} (now)` : `${year} (+${year - currentYear})`

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

      <CardGrid chart={chart} year={year} currentYear={currentYear} isViewOnly={isViewOnly}
        tid={tid} dynastyId={dynastyId} manualOrder={manualOrder} leaveFlagList={leaveFlagList}
        saveDepthOrder={saveDepthOrder} saveLeaveFlags={saveLeaveFlags} />
    </div>
  )
}

function CardGrid({ chart, year, currentYear, isViewOnly, tid, dynastyId, manualOrder, leaveFlagList, saveDepthOrder, saveLeaveFlags }) {
  const editable = !isViewOnly && year >= currentYear

  const reorder = (pos, slotPlayers, pid, dir) => {
    const current = (manualOrder[pos] && manualOrder[pos].length)
      ? manualOrder[pos].filter(p => slotPlayers.some(sp => sp.pid === p))
      : slotPlayers.map(p => p.pid).filter(Boolean)
    const i = current.indexOf(pid)
    const j = i + dir
    if (i < 0 || j < 0 || j >= current.length) return
    ;[current[i], current[j]] = [current[j], current[i]]
    saveDepthOrder?.(dynastyId, tid, pos, current)
  }

  const toggleLeave = (pid) => {
    const next = leaveFlagList.includes(pid) ? leaveFlagList.filter(p => p !== pid) : [...leaveFlagList, pid]
    saveLeaveFlags?.(dynastyId, tid, next)
  }

  return (
    <div className="flex flex-wrap gap-3 justify-center">
      {chart.map(slot => (
        <PositionCard key={slot.id} slot={slot} editable={editable}
          onUp={(pid) => reorder(slot.pos, [slot.starter, ...slot.backups].filter(Boolean), pid, -1)}
          onDown={(pid) => reorder(slot.pos, [slot.starter, ...slot.backups].filter(Boolean), pid, +1)}
          onToggleLeave={toggleLeave} leaveFlagList={leaveFlagList} />
      ))}
    </div>
  )
}

function PositionCard({ slot, editable, onUp, onDown, onToggleLeave, leaveFlagList }) {
  const { starter, backups, grade, isHole } = slot
  const border = starter ? (DEV_BORDER[starter.devTrait] || DEV_BORDER.Normal) : '#dc2626'
  const flagged = starter && leaveFlagList.includes(starter.pid)

  return (
    <div style={{ width: 150 }}>
      <div className="rounded-lg overflow-hidden" style={{ background: '#1b1b1b', border: `1px solid ${flagged ? '#dc2626' : '#333'}`, borderTopWidth: 4, borderTopColor: flagged ? '#dc2626' : border }}>
        <div className="flex items-center justify-between px-2 py-1" style={{ background: '#0f0f0f' }}>
          <span className="text-[10px] font-bold tracking-wide text-txt-tertiary">{slot.label}</span>
          <span className="text-xs font-black tabular-nums">{starter?.projectedOvr ?? '—'}</span>
        </div>
        <div className="h-[64px] flex items-center justify-center" style={{ background: isHole ? '#1a0f10' : 'radial-gradient(circle at 50% 30%,#33405a,#181d28)' }}>
          {starter && !starter.isIncoming && starter.player?.pictureUrl
            ? <img src={proxyImageUrl(starter.player.pictureUrl, 300)} alt="" className="w-12 h-12 rounded-full object-cover" style={{ border: '2px solid #61708a' }} />
            : <div className="w-12 h-12 rounded-full" style={{ background: isHole ? 'transparent' : '#46566f' }} />}
        </div>
        <div className="px-2 py-1 text-center">
          <div className="text-[12px] font-bold truncate" style={{ color: isHole ? '#f87171' : 'var(--text-primary)' }}>
            {isHole ? 'EMPTY' : starter.name}{starter?.isIncoming && starter.stars ? ` ★${starter.stars}` : ''}
          </div>
          <div className="text-[10px] text-txt-tertiary">{isHole ? 'no projected starter' : starter.projectedClass}{flagged ? ' · LIKELY OUT' : ''}</div>
          {editable && starter && !starter.isIncoming && (
            <div className="flex justify-center gap-2 mt-1 text-[10px]">
              <button onClick={() => onUp(starter.pid)} title="Move up">▲</button>
              <button onClick={() => onDown(starter.pid)} title="Move down">▼</button>
              <button onClick={() => onToggleLeave(starter.pid)} title="Flag likely to leave" style={{ color: flagged ? '#dc2626' : '#888' }}>⚑</button>
            </div>
          )}
        </div>
        {backups.map(b => (
          <div key={b.key} className="flex justify-between items-center px-2 py-1 text-[11px]" style={{ borderTop: '1px solid #242424', background: b.isIncoming ? '#10233d' : 'transparent' }}>
            <span className="truncate mr-2" style={{ color: b.isIncoming ? '#7fb0f5' : (slot.risk?.[b.pid] ? '#f87171' : '#bdbdbd') }}>
              {b.name}{b.isIncoming && b.stars ? ` ★${b.stars}` : ''}{slot.risk?.[b.pid] ? ' ⚑' : ''}
            </span>
            <span className="tabular-nums font-bold">{b.projectedOvr ?? '—'}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-2 mt-1 font-black text-sm">
        {slot.label} <span className="font-mono text-[11px] px-1.5 rounded" style={{ background: '#161616', color: GRADE_COLOR(grade) }}>{grade}</span>
      </div>
    </div>
  )
}
