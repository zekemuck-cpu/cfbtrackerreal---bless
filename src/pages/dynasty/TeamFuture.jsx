import { useState, useMemo, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { PageHero, Select, EmptyState } from '../../components/ui'
import { projectRoster, projectDepartures } from '../../utils/rosterProjection'
import { gradeForOvr, isPortalRisk } from '../../utils/depthChart'
import { groupForPosition, TAB_GROUPS, GROUP_LABELS } from '../../data/positionGroups'

const TABS = [
  { key: 'offense', label: 'Offense' },
  { key: 'defense', label: 'Defense' },
  { key: 'st', label: 'Special Teams' },
]
// Healthy two-deep-ish body count per group — drives the THIN/EMPTY signal.
const MIN_DEPTH = { QB: 2, RB: 3, WR: 4, TE: 2, OL: 7, DL: 5, LB: 4, DB: 5, K: 1, P: 1 }
const GRADE_COLOR = (g) => g[0] === 'A' ? '#4ade80' : g[0] === 'B' ? '#86efac' : g[0] === 'C' ? '#fde047' : g[0] === 'D' ? '#fb923c' : g[0] === 'F' ? '#fca5a5' : '#9ca3af'
const byOvr = (a, b) => (b.projectedOvr ?? -1) - (a.projectedOvr ?? -1)
const recruitTag = (e) => e.isPortal ? 'PORTAL' : (e.stars ? `${e.stars}-star` : 'HS')
const EMPTY_ARR = []

export default function TeamFuture() {
  const { id: dynastyId } = useParams()
  const { currentDynasty, isViewOnly, saveTeamFuture } = useDynasty()
  const tid = currentDynasty?.currentTid
  const currentYear = Number(currentDynasty?.currentYear)

  const [tab, setTab] = useState('offense')
  const [year, setYear] = useState(currentYear)
  // Seed the year once the team is known, and reset when switching dynasties.
  useEffect(() => { setYear(currentYear); setTab('offense') /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tid])

  const flagsArr = currentDynasty?.teamFuture?.[tid]?.leaveFlags || EMPTY_ARR
  const leaveFlags = useMemo(() => new Set(flagsArr), [flagsArr])
  const isFuture = year > currentYear
  const editable = !isViewOnly && tid != null && year >= currentYear

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

  const groups = useMemo(() => {
    if (!currentDynasty || tid == null || Number.isNaN(year)) return []
    const roster = projectRoster(currentDynasty, tid, year, { leaveFlags })
    const departures = projectDepartures(currentDynasty, tid, year, { leaveFlags })
    return (TAB_GROUPS[tab] || []).map(g => {
      const ret = roster.filter(e => !e.isIncoming && groupForPosition(e.position) === g).sort(byOvr)
      const inc = roster.filter(e => e.isIncoming && groupForPosition(e.position) === g).sort((a, b) => (b.stars ?? -1) - (a.stars ?? -1))
      const lv = departures.filter(d => groupForPosition(d.position) === g).sort(byOvr)
      const total = ret.length + inc.length
      const min = MIN_DEPTH[g] ?? 2
      let health
      if (total === 0) health = { label: 'EMPTY', color: '#dc2626' }
      else if (ret.length === 0) health = { label: 'UNPROVEN', color: '#f59e0b' }
      else if (total < min) health = { label: 'THIN', color: '#f59e0b' }
      else if (total >= min + 2) health = { label: 'LOADED', color: '#22c55e' }
      else health = { label: 'OK', color: '#6b7280' }
      const topOvr = ret[0]?.projectedOvr ?? null
      const grade = topOvr != null ? gradeForOvr(topOvr, { depth: total, topDev: ret[0]?.devTrait }) : (total === 0 ? 'F' : '—')
      return { g, label: GROUP_LABELS[g] || g, ret, inc, lv, total, health, grade }
    })
  }, [currentDynasty, tid, year, tab, leaveFlags, currentYear])

  const toggleFlag = (pid) => {
    if (!editable || !pid) return
    const set = new Set(flagsArr)
    if (set.has(pid)) set.delete(pid); else set.add(pid)
    saveTeamFuture(dynastyId, tid, { leaveFlags: [...set] })
  }

  if (!currentDynasty || tid == null) {
    return (
      <div className="space-y-5">
        <PageHero title="Team Future" />
        <EmptyState title="No team selected" message="Set your dynasty's current team to see its future outlook." />
      </div>
    )
  }

  const labelForYear = (y) => y < currentYear ? `${y}` : y === currentYear ? `${y} — Now` : `${y} (+${y - currentYear})`

  return (
    <div className="space-y-5">
      <div>
        <PageHero title="Team Future" />
        <p className="text-xs text-txt-tertiary mt-1">Roll the roster forward to see who's leaving, who's returning, who's coming in, and where the holes are.</p>
        <label className="flex items-center gap-2 text-xs text-txt-tertiary mt-2">Season
          <Select size="sm" value={String(year)} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map(y => <option key={y} value={String(y)}>{labelForYear(y)}</option>)}
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
        <p className="text-[11px] text-txt-tertiary">
          {isFuture
            ? 'Projection carries each returner’s last-known OVR forward; recruits show “—” until you rate them. Use “Flag out” to mark a player you expect to lose so the projection drops them.'
            : 'Showing the real roster for this season. Switch to a future season to see departures, recruits, and projected holes.'}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {groups.map(grp => (
          <GroupBlock key={grp.g} grp={grp} isFuture={isFuture} editable={editable} flags={leaveFlags} onToggleFlag={toggleFlag} currentYear={currentYear} />
        ))}
      </div>
    </div>
  )
}

function GroupBlock({ grp, isFuture, editable, flags, onToggleFlag, currentYear }) {
  const { label, ret, inc, lv, total, health, grade } = grp
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-2,#1a1d24)', border: '1px solid var(--surface-4,#2c2f37)' }}>
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--surface-4,#2c2f37)' }}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-extrabold truncate" style={{ color: 'var(--text-primary)' }}>{label}</span>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: health.color, color: '#0b0d11' }}>{health.label}</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-txt-tertiary shrink-0">
          <span>{total} {total === 1 ? 'body' : 'bodies'}</span>
          <span className="font-mono font-bold px-1.5 rounded" style={{ background: '#161616', color: GRADE_COLOR(grade) }}>{grade}</span>
        </div>
      </div>

      <div className="p-3 space-y-3">
        <Section title={isFuture ? `Returning (${ret.length})` : `On roster (${ret.length})`}>
          {ret.length === 0
            ? <Empty text={isFuture ? 'No returning players' : 'No players'} danger />
            : ret.map(e => {
              const flagged = e.pid && flags.has(e.pid)
              const risk = !flagged && e.player && isPortalRisk(e.player, currentYear, e.projectedClass)
              return (
                <Row key={e.key}
                  left={<>
                    <span className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{e.name}</span>
                    <span className="text-txt-tertiary shrink-0">{e.projectedClass}</span>
                    {flagged ? <span className="text-[10px] font-bold shrink-0" style={{ color: '#f87171' }}>FLAGGED OUT</span> : null}
                    {risk ? <span className="text-[10px] font-bold shrink-0" style={{ color: '#f59e0b' }}>PORTAL RISK</span> : null}
                  </>}
                  right={<span className="tabular-nums font-bold">{e.projectedOvr ?? '—'}</span>}
                  action={editable ? <FlagBtn flagged={flagged} onClick={() => onToggleFlag(e.pid)} /> : null}
                />
              )
            })}
        </Section>

        {isFuture && lv.length > 0 && (
          <Section title={`Leaving (${lv.length})`}>
            {lv.map(d => (
              <Row key={d.pid}
                left={<>
                  <span className="font-semibold truncate" style={{ color: '#f87171' }}>{d.name}</span>
                  <span className="text-txt-tertiary shrink-0">{d.classNow}</span>
                  <span className="text-[10px] shrink-0" style={{ color: '#f87171' }}>{d.reason}</span>
                </>}
                right={<span className="tabular-nums" style={{ color: '#9ca3af' }}>{d.projectedOvr ?? '—'}</span>}
                action={editable && d.isFlag ? <button onClick={() => onToggleFlag(d.pid)} className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color: '#93c5fd', border: '1px solid #2b5fa8' }}>Unflag</button> : null}
              />
            ))}
          </Section>
        )}

        {isFuture && inc.length > 0 && (
          <Section title={`Incoming (${inc.length})`}>
            {inc.map(e => (
              <Row key={e.key}
                left={<>
                  <span className="font-semibold truncate" style={{ color: '#7fb0f5' }}>{e.name}</span>
                  <span className="text-[10px] font-bold px-1 rounded shrink-0" style={{ background: '#10233d', color: '#7fb0f5' }}>{recruitTag(e)}</span>
                  <span className="text-txt-tertiary shrink-0">{e.projectedClass}</span>
                </>}
                right={<span className="tabular-nums" style={{ color: '#9ca3af' }}>—</span>}
              />
            ))}
          </Section>
        )}
      </div>
    </div>
  )
}

function FlagBtn({ flagged, onClick }) {
  return (
    <button onClick={onClick} className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
      style={flagged
        ? { color: '#fca5a5', border: '1px solid #b91c1c' }
        : { color: '#cbd5e1', border: '1px solid #475569' }}>
      {flagged ? 'Unflag' : 'Flag out'}
    </button>
  )
}

function Section({ title, children }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-txt-tertiary mb-1">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function Row({ left, right, action }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[12px]">
      <div className="flex items-center gap-1.5 min-w-0">{left}</div>
      <div className="flex items-center gap-2 shrink-0">{right}{action}</div>
    </div>
  )
}

function Empty({ text, danger }) {
  return <div className="text-[11px] italic" style={{ color: danger ? '#f87171' : 'var(--text-tertiary)' }}>{text}</div>
}
