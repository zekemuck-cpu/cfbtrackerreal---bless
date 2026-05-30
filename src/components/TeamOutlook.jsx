import { useState, useMemo, useEffect, useRef, useLayoutEffect, Fragment } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useDynasty } from '../context/DynastyContext'
import { usePathPrefix } from '../hooks/usePathPrefix'
import { Card, Badge, Tabs, Select, EmptyState } from './ui'
import { proxyImageUrl } from '../utils/imageProxy'
import { projectRoster, projectDepartures, projectNflCandidates } from '../utils/rosterProjection'
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

const GRADE_DEPTH = { QB: 1, RB: 2, WR: 3, TE: 1, OT: 2, OG: 2, C: 1, DT: 2, EDGE: 2, OLB: 2, MIKE: 1, CB: 2, Safety: 2, K: 1, P: 1 }

function posGroupGrade(group, returners) {
  const depth = GRADE_DEPTH[group] ?? 2
  const topN = [...returners].sort(byOvr).slice(0, depth)
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
  const leaveFlags      = useMemo(() => new Set(flagsArr),      [flagsArr])
  const nflDismissFlags = useMemo(() => new Set(nflDismissArr), [nflDismissArr])
  const isFuture = year > currentYear
  const canEdit  = !isViewOnly && tid != null
  const canFlag  = canEdit && isFuture
  const teamLogo = currentDynasty?.teams?.[tid]?.logo || null

  const years = useMemo(() => {
    if (!Number.isFinite(currentYear)) return []
    const out = []
    for (let y = currentYear; y <= currentYear + 4; y++) out.push(y)
    return out
  }, [currentYear])

  const groups = useMemo(() => {
    if (!currentDynasty || tid == null || !Number.isFinite(year)) return []
    const roster        = projectRoster(currentDynasty, tid, year, { leaveFlags })
    const departures    = isFuture ? projectDepartures(currentDynasty, tid, year, { leaveFlags }) : []
    const nflCandidates = isFuture ? projectNflCandidates(currentDynasty, tid, year, { leaveFlags, nflDismissFlags }) : []
    return (TAB_GROUPS[posTab] || []).map(g => {
      const inGroup = (pos) => finePositionGroup(pos) === g
      const nfl     = nflCandidates.filter(d => inGroup(d.position)).sort(byOvr)
      const nflPids = new Set(nfl.map(d => d.pid))
      const ret     = roster.filter(e => !e.isIncoming && inGroup(e.position) && !nflPids.has(e.pid)).sort(byOvr)
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
  }, [currentDynasty, tid, year, posTab, leaveFlags, nflDismissFlags, isFuture])

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
            isFuture={isFuture} canFlag={canFlag}
            onToggleFlag={toggleFlag} onToggleNflDismiss={toggleNflDismiss}
            currentYear={currentYear} pathPrefix={pathPrefix} teamLogo={teamLogo}
          />
        ))}
      </div>
    </div>
  )
}

function GroupBlock({ grp, isFuture, canFlag, onToggleFlag, onToggleNflDismiss, currentYear, pathPrefix, teamLogo }) {
  const { g, label, ret, inc, lv, nfl, health, grade } = grp

  return (
    <Card padding="none">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-surface-4">
        <span className="font-bold text-txt-primary truncate">{label}</span>
        {grade && <Badge variant="solid" color={grade.bg} textColor="#fff" className="shrink-0 font-bold">{grade.letter}</Badge>}
        {health ? <Badge variant={health.variant}>{health.label}</Badge> : null}
      </div>

      <div className="p-3 space-y-3 min-h-[2.5rem]">
        {isFuture
          ? (
            <GroupSection label={`Returning (${ret.length})`}>
              {ret.length === 0
                ? <EmptyLine text="No returning players" />
                : ret.map(e => {
                  const risk = e.player && isPortalRisk(e.player, currentYear, e.projectedClass)
                  return (
                    <Row key={e.key}
                      avatar={<Avatar url={e.player?.pictureUrl} fallback={teamLogo} />}
                      left={<>
                        <PlayerName pid={e.pid} name={e.name} pathPrefix={pathPrefix} />
                        <span className="text-txt-tertiary text-xs shrink-0">{e.projectedClass}</span>
                        <DevBadge trait={e.devTrait} />
                        {risk ? <Badge variant="warning">Portal risk</Badge> : null}
                      </>}
                      right={<>
                        <span className="text-[11px] shrink-0 text-txt-muted">{e.position}</span>
                        <span className="tabular-nums font-semibold text-txt-primary">{e.projectedOvr ?? '—'}</span>
                      </>}
                      action={canFlag ? <LeaveButton onClick={() => onToggleFlag(e.pid)} /> : null}
                    />
                  )
                })}
            </GroupSection>
          )
          : (
            <div className="space-y-1">
              {ret.length === 0
                ? <EmptyLine text="No players" />
                : ret.map(e => (
                  <Row key={e.key}
                    avatar={<Avatar url={e.player?.pictureUrl} fallback={teamLogo} />}
                    left={<>
                      <PlayerName pid={e.pid} name={e.name} pathPrefix={pathPrefix} />
                      <span className="text-txt-tertiary text-xs shrink-0">{e.projectedClass}</span>
                      <DevBadge trait={e.devTrait} />
                    </>}
                    right={<>
                      <span className="text-[11px] shrink-0 text-txt-muted">{e.position}</span>
                      <span className="tabular-nums font-semibold text-txt-primary">{e.projectedOvr ?? '—'}</span>
                    </>}
                  />
                ))}
            </div>
          )}

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
                  <span className="text-[11px] shrink-0 text-txt-muted">{d.position}</span>
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

function StarRating({ stars, isPortal }) {
  if (stars) return <span className="tabular-nums text-txt-secondary font-semibold shrink-0">{stars}★</span>
  return <span className="text-txt-tertiary text-xs shrink-0">{isPortal ? '—' : 'HS'}</span>
}

function Avatar({ url, fallback }) {
  const [errored, setErrored] = useState(false)
  const hasUrl = url && !errored
  const src = hasUrl ? proxyImageUrl(url, 80) : fallback || null
  return (
    <div className="w-7 h-7 rounded-full bg-surface-4 overflow-hidden flex-shrink-0 flex items-center justify-center">
      {src ? <img src={src} alt="" onError={() => setErrored(true)} className={`w-full h-full ${hasUrl ? 'object-cover' : 'object-contain p-0.5'}`} /> : null}
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
  // Normalize casing ("star" → "Star") so sheet imports with inconsistent case
  // still hit the color map.
  const t = String(trait).trim()
  const key = t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()
  const c = DEV_TRAIT_COLORS[key]
  if (!c) return <Badge variant="outline" className="shrink-0">{t}</Badge>
  return <Badge variant="solid" color={c.bg} textColor={c.text} className="shrink-0">{key}</Badge>
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

function Row({ avatar, left, right, action }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <div className="flex items-center gap-1.5 min-w-0">
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
