import { useState, useMemo, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useDynasty } from '../context/DynastyContext'
import { usePathPrefix } from '../hooks/usePathPrefix'
import { Card, Badge, Tabs, Select, EmptyState } from './ui'
import { proxyImageUrl } from '../utils/imageProxy'
import { projectRoster, projectDepartures } from '../utils/rosterProjection'
import { isPortalRisk } from '../utils/depthChart'
import { finePositionGroup, TAB_GROUPS, GROUP_LABELS } from '../data/positionGroups'

const TAB_OPTIONS = [
  { value: 'offense', label: 'Offense' },
  { value: 'defense', label: 'Defense' },
  { value: 'st', label: 'Special Teams' },
]
// Healthy two-deep-ish body count per group — drives the THIN/EMPTY signal.
const MIN_DEPTH = { QB: 2, RB: 3, WR: 4, TE: 2, OT: 3, OG: 3, C: 2, DT: 3, EDGE: 3, OLB: 3, MIKE: 2, CB: 4, Safety: 3, K: 1, P: 1 }
const byOvr = (a, b) => (b.projectedOvr ?? -1) - (a.projectedOvr ?? -1)
// Matches the player editor's palette so the trait reads consistently and
// escalates Normal → Impact → Star → Elite (gray → blue → purple → gold).
const DEV_TRAIT_COLORS = {
  Elite: { bg: '#fbbf24', text: '#000' },
  Star: { bg: '#a855f7', text: '#fff' },
  Impact: { bg: '#3b82f6', text: '#fff' },
  Normal: { bg: '#6b7280', text: '#fff' },
}
const EMPTY_ARR = []

// Forward-looking roster outlook for one team, embedded as the team page's
// "Outlook" tab. Has its own season selector (current → +4); it ignores the
// team page's year, which is historical/contextual.
export default function TeamOutlook({ tid }) {
  const { id: dynastyId } = useParams()
  const pathPrefix = usePathPrefix()
  const { currentDynasty, isViewOnly, saveTeamFuture } = useDynasty()
  const currentYear = Number(currentDynasty?.currentYear)

  const [posTab, setPosTab] = useState('offense')
  const [year, setYear] = useState(currentYear + 1)
  useEffect(() => { setYear(currentYear + 1); setPosTab('offense') /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tid])

  const flagsArr = currentDynasty?.teamFuture?.[tid]?.leaveFlags || EMPTY_ARR
  const leaveFlags = useMemo(() => new Set(flagsArr), [flagsArr])
  const isFuture = year > currentYear
  const canEdit = !isViewOnly && tid != null
  const canFlag = canEdit && isFuture

  const years = useMemo(() => {
    if (!Number.isFinite(currentYear)) return []
    const out = []
    for (let y = currentYear; y <= currentYear + 4; y++) out.push(y)
    return out
  }, [currentYear])

  const groups = useMemo(() => {
    if (!currentDynasty || tid == null || !Number.isFinite(year)) return []
    // projectRoster already drops manually-flagged players for future years, so
    // the roster here is "who you actually have"; flagged players come back
    // separately as the Likely-to-depart list.
    const roster = projectRoster(currentDynasty, tid, year, { leaveFlags })
    const departures = isFuture ? projectDepartures(currentDynasty, tid, year, { leaveFlags }) : []
    return (TAB_GROUPS[posTab] || []).map(g => {
      const inGroup = (pos) => finePositionGroup(pos) === g
      const ret = roster.filter(e => !e.isIncoming && inGroup(e.position)).sort(byOvr)
      const inc = roster.filter(e => e.isIncoming && inGroup(e.position)).sort(byOvr)
      const lv = departures.filter(d => inGroup(d.position)).sort(byOvr)
      const total = ret.length + inc.length
      const min = MIN_DEPTH[g] ?? 2
      let health
      if (total === 0) health = { label: 'Empty', variant: 'danger' }
      else if (ret.length === 0) health = { label: 'Unproven', variant: 'warning' } // only recruits
      else if (total < min) health = { label: 'Thin', variant: 'warning' }
      else health = null
      return { g, label: GROUP_LABELS[g] || g, ret, inc, lv, health }
    })
  }, [currentDynasty, tid, year, posTab, leaveFlags, isFuture])

  const toggleFlag = (pid) => {
    if (!canFlag || !pid) return
    const set = new Set(flagsArr)
    if (set.has(pid)) set.delete(pid); else set.add(pid)
    saveTeamFuture(dynastyId, tid, { leaveFlags: [...set] })
  }

  if (!currentDynasty || tid == null) {
    return <EmptyState title="No team" message="No team to project." />
  }

  const labelForYear = (y) => y === currentYear ? `${y} — Now` : `${y} (+${y - currentYear})`

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

      {canEdit && (
        <p className="text-xs text-txt-tertiary">
          {isFuture
            ? 'Returners carry their last-known OVR forward (developed by dev trait); recruits are shown by stars. Mark a player “Likely transfer” to drop them from the projection.'
            : 'Showing the real roster for this season. Pick a future season to see departures, recruits, and projected holes.'}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {groups.map(grp => (
          <GroupBlock key={grp.g} grp={grp} isFuture={isFuture} canFlag={canFlag} flags={leaveFlags}
            onToggleFlag={toggleFlag} currentYear={currentYear} pathPrefix={pathPrefix} />
        ))}
      </div>
    </div>
  )
}

function GroupBlock({ grp, isFuture, canFlag, flags, onToggleFlag, currentYear, pathPrefix }) {
  const { label, ret, inc, lv, health } = grp

  const returningRows = ret.length === 0
    ? <EmptyLine text={isFuture ? 'No returning players' : 'No players'} />
    : ret.map(e => {
      const risk = e.player && isPortalRisk(e.player, currentYear, e.projectedClass)
      return (
        <Row key={e.key}
          avatar={<Avatar url={e.player?.pictureUrl} />}
          left={<>
            <PlayerName pid={e.pid} name={e.name} pathPrefix={pathPrefix} />
            <span className="text-txt-tertiary text-xs shrink-0">{e.projectedClass}</span>
            <DevBadge trait={e.devTrait} />
            {risk ? <Badge variant="warning">Portal risk</Badge> : null}
          </>}
          right={<span className="tabular-nums font-semibold text-txt-primary">{e.projectedOvr ?? '—'}</span>}
          action={canFlag ? <FlagButton flagged={false} onClick={() => onToggleFlag(e.pid)} /> : null}
        />
      )
    })

  return (
    <Card padding="none">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-surface-4">
        <span className="font-bold text-txt-primary truncate">{label}</span>
        {health ? <Badge variant={health.variant}>{health.label}</Badge> : null}
      </div>

      <div className="p-3 space-y-3">
        {isFuture
          ? <GroupSection label={`Returning (${ret.length})`}>{returningRows}</GroupSection>
          : <div className="space-y-1">{returningRows}</div>}

        {isFuture && lv.length > 0 && (
          <GroupSection label={`Likely to depart (${lv.length})`}>
            {lv.map(d => (
              <Row key={d.pid}
                avatar={<Avatar url={d.player?.pictureUrl} />}
                left={<>
                  <PlayerName pid={d.pid} name={d.name} pathPrefix={pathPrefix} />
                  <span className="text-txt-tertiary text-xs shrink-0">{d.projectedClass}</span>
                  <DevBadge trait={d.devTrait} />
                </>}
                right={<span className="tabular-nums text-txt-tertiary">{d.projectedOvr ?? '—'}</span>}
                action={canFlag ? <FlagButton flagged onClick={() => onToggleFlag(d.pid)} /> : null}
              />
            ))}
          </GroupSection>
        )}

        {isFuture && inc.length > 0 && (
          <GroupSection label={`Incoming (${inc.length})`}>
            {inc.map(e => (
              <Row key={e.key}
                avatar={<Avatar />}
                left={<>
                  <span className="font-medium text-txt-primary truncate">{e.name}</span>
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

function StarRating({ stars, isPortal }) {
  if (stars) return <span className="tabular-nums text-txt-secondary font-semibold shrink-0">{stars}★</span>
  return <span className="text-txt-tertiary text-xs shrink-0">{isPortal ? '—' : 'HS'}</span>
}

function Avatar({ url }) {
  return (
    <div className="w-7 h-7 rounded-full bg-surface-4 overflow-hidden flex-shrink-0">
      {url ? <img src={proxyImageUrl(url, 80)} alt="" className="w-full h-full object-cover" /> : null}
    </div>
  )
}

function PlayerName({ pid, name, pathPrefix }) {
  if (!pid) return <span className="font-medium text-txt-primary truncate">{name}</span>
  return (
    <Link to={`${pathPrefix}/player/${pid}`} className="font-medium text-txt-primary hover:underline truncate">
      {name}
    </Link>
  )
}

function DevBadge({ trait }) {
  if (!trait) return null
  const c = DEV_TRAIT_COLORS[trait]
  if (!c) return <Badge variant="outline" className="shrink-0">{trait}</Badge>
  return <Badge variant="solid" color={c.bg} textColor={c.text} className="shrink-0">{trait}</Badge>
}

function FlagButton({ flagged, onClick }) {
  return (
    <button
      onClick={onClick}
      className="text-[11px] font-semibold px-1.5 py-0.5 rounded transition-colors text-txt-tertiary hover:text-txt-primary hover:bg-surface-3"
    >
      {flagged ? 'Undo' : 'Likely transfer'}
    </button>
  )
}

function GroupSection({ label, children }) {
  return (
    <div>
      <div className="label-sm text-txt-tertiary mb-1">{label}</div>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function Row({ avatar, left, right, action }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <div className="flex items-center gap-2 min-w-0">
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
