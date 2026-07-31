import { useState, useMemo, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { PageHero, Card, EmptyState, Select } from '../../components/ui'
import SortableStatsTable from '../../components/SortableStatsTable'
import { computeLeagueTeamStats } from '../../utils/leagueTeamStats'

const SIDES = [
  { key: 'offense', label: 'Offense', defaultSort: 'ppg', defaultDir: 'desc' },
  { key: 'defense', label: 'Defense', defaultSort: 'ppgAllowed', defaultDir: 'asc' },
]
const SIDE_BY_KEY = Object.fromEntries(SIDES.map((s) => [s.key, s]))

function pct(n, d) {
  return d > 0 ? (n / d) * 100 : 0
}

const fmt1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '0.0')
const fmtPct = (v) => (Number.isFinite(v) ? `${v.toFixed(1)}%` : '0.0%')
const fmtPoss = (v) => {
  const secs = Number.isFinite(v) ? v : 0
  const mm = Math.floor(secs / 60)
  const ss = Math.floor(secs % 60)
  return `${mm}:${String(ss).padStart(2, '0')}`
}

function statCol(key, label, { format } = {}) {
  return {
    key,
    label,
    align: 'center',
    tabular: true,
    sortValue: (r) => r[key] ?? 0,
    render: (r) => {
      const v = r[key] ?? 0
      if (format === 'pct') return fmtPct(v)
      if (format === 'avg') return fmt1(v)
      if (format === 'poss') return fmtPoss(v)
      return Math.round(v).toLocaleString()
    },
  }
}

const OFFENSE_COLUMNS = [
  statCol('gp', 'GP'),
  statCol('ppg', 'PPG', { format: 'avg' }),
  statCol('ydsPerG', 'YDS/G', { format: 'avg' }),
  statCol('passYdsPerG', 'PASS YDS/G', { format: 'avg' }),
  statCol('rushYdsPerG', 'RUSH YDS/G', { format: 'avg' }),
  statCol('compPct', 'CMP%', { format: 'pct' }),
  statCol('passTd', 'PASS TD'),
  statCol('rushTd', 'RUSH TD'),
  statCol('thirdPct', '3RD DOWN%', { format: 'pct' }),
  statCol('turnovers', 'TO'),
  statCol('penalties', 'PEN'),
  statCol('penaltyYards', 'PEN YDS'),
  statCol('possAvgSec', 'POSS', { format: 'poss' }),
]

const DEFENSE_COLUMNS = [
  statCol('gp', 'GP'),
  statCol('ppgAllowed', 'PPG', { format: 'avg' }),
  statCol('ydsAllowedPerG', 'YDS/G', { format: 'avg' }),
  statCol('passYdsAllowedPerG', 'PASS YDS/G', { format: 'avg' }),
  statCol('rushYdsAllowedPerG', 'RUSH YDS/G', { format: 'avg' }),
  statCol('firstDownsAllowed', '1ST DN'),
  statCol('thirdPctAllowed', '3RD DOWN%', { format: 'pct' }),
  statCol('takeaways', 'TO'),
  statCol('sacks', 'SACK'),
  statCol('ints', 'INT'),
  statCol('tfl', 'TFL'),
  statCol('ff', 'FF'),
]

// Neutral table accent — matches TeamYear.jsx's own Stats-tab tables
// exactly (SortableStatsTable interpolates this into border-alpha hex
// strings, so it must stay a literal hex value, not a CSS var()).
const ACCENT = '#f5f5f7'
const ACCENT_MUTED = '#a8a8b0'

export default function TeamStats() {
  const { side: sideParam } = useParams()
  const { currentDynasty } = useDynasty()
  const pathPrefix = usePathPrefix()
  const navigate = useNavigate()

  const resolveSide = (param) => {
    const key = (param || '').toLowerCase()
    if (SIDE_BY_KEY[key]) return key
    const stored = localStorage.getItem('team-stats-side')
    if (stored && SIDE_BY_KEY[stored]) return stored
    return 'offense'
  }

  const [activeSide, setActiveSide] = useState(() => resolveSide(sideParam))

  useEffect(() => {
    const next = resolveSide(sideParam)
    if (next !== activeSide) setActiveSide(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sideParam])

  const availableYears = useMemo(() => {
    const years = new Set()
    for (const g of currentDynasty?.games || []) {
      const n = parseInt(g.year)
      if (Number.isFinite(n)) years.add(n)
    }
    return Array.from(years).sort((a, b) => b - a)
  }, [currentDynasty?.games])

  const [yearChoice, setYearChoice] = useState(null)
  const effectiveYear = yearChoice ?? (
    currentDynasty?.currentYear != null && availableYears.includes(Number(currentDynasty.currentYear))
      ? Number(currentDynasty.currentYear)
      : (availableYears[0] ?? currentDynasty?.currentYear ?? null)
  )

  const teamsSource = currentDynasty?.teams || currentDynasty?.customTeams || {}

  const rows = useMemo(() => {
    if (!currentDynasty || effectiveYear == null) return []
    const totals = computeLeagueTeamStats(currentDynasty, effectiveYear)
    const out = []
    for (const [tid, t] of totals.entries()) {
      const meta = teamsSource[tid]
      if (!meta || !meta.name || meta.isFCS) continue
      if ((t.gamesPlayed || 0) === 0) continue

      const gp = t.gamesPlayed
      const dgp = t.defGames || 0
      out.push({
        tid,
        name: meta.name,
        abbr: meta.abbr,
        logo: meta.logo,
        gp,
        ppg: gp > 0 ? t.pointsFor / gp : 0,
        ydsPerG: gp > 0 ? t.totalOffense / gp : 0,
        passYdsPerG: gp > 0 ? t.passYards / gp : 0,
        rushYdsPerG: gp > 0 ? t.rushYards / gp : 0,
        compPct: pct(t.completions, t.passAttempts),
        passTd: t.passTds,
        rushTd: t.rushTds,
        thirdPct: pct(t.thirdDownConv, t.thirdDownAtt),
        turnovers: t.turnovers,
        penalties: t.penalties,
        penaltyYards: t.penaltyYards,
        possAvgSec: gp > 0 ? (t.possMinutes * 60 + t.possSeconds) / gp : 0,
        ppgAllowed: gp > 0 ? t.pointsAgainst / gp : 0,
        ydsAllowedPerG: dgp > 0 ? t.oppTotalYards / dgp : 0,
        passYdsAllowedPerG: dgp > 0 ? t.oppPassYards / dgp : 0,
        rushYdsAllowedPerG: dgp > 0 ? t.oppRushYards / dgp : 0,
        firstDownsAllowed: t.oppFirstDowns,
        thirdPctAllowed: pct(t.oppThirdDownConv, t.oppThirdDownAtt),
        takeaways: t.oppTurnovers,
        sacks: t.sacks,
        ints: t.ints,
        tfl: t.tfl,
        ff: t.ff,
      })
    }
    return out
  }, [currentDynasty, teamsSource, effectiveYear])

  const handleSideChange = (key) => {
    setActiveSide(key)
    localStorage.setItem('team-stats-side', key)
    navigate(`${pathPrefix}/team-stats/${key}`)
  }

  if (!currentDynasty) return null

  const side = SIDE_BY_KEY[activeSide]
  const columns = [
    {
      key: 'team',
      label: 'Team',
      align: 'left',
      sortValue: (r) => r.name || '',
      render: (r) => (
        <Link
          to={`${pathPrefix}/team/${r.tid}/${effectiveYear}`}
          className="flex items-center gap-2 font-medium hover:underline"
          style={{ color: ACCENT }}
        >
          {r.logo && <img src={r.logo} alt="" className="w-5 h-5 object-contain flex-shrink-0" />}
          <span>{r.name}</span>
        </Link>
      ),
    },
    ...(side.key === 'offense' ? OFFENSE_COLUMNS : DEFENSE_COLUMNS),
  ]

  const heroTabs = SIDES.map((s) => ({ key: s.key, label: s.label }))

  return (
    <div className="space-y-6 page-enter">
      <PageHero
        title="Team Stats"
        actions={availableYears.length > 0 && (
          <Select
            size="sm"
            value={String(effectiveYear ?? '')}
            onChange={(e) => setYearChoice(Number(e.target.value))}
            aria-label="Season"
          >
            {availableYears.map((y) => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
          </Select>
        )}
        tabs={heroTabs}
        activeTab={activeSide}
        onTabChange={handleSideChange}
      />

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            title={`No team stats yet${effectiveYear != null ? ` for ${effectiveYear}` : ''}`}
            message="Play some games to start tracking team stats."
          />
        </Card>
      ) : (
        <SortableStatsTable
          title={`${side.label}${effectiveYear != null ? ` — ${effectiveYear}` : ''}`}
          rows={rows}
          columns={columns}
          defaultSortKey={side.defaultSort}
          defaultSortDir={side.defaultDir}
          accentColor={ACCENT}
          accentColorMuted={ACCENT_MUTED}
          highlightRow={currentDynasty.currentTid != null ? (r) => r.tid === Number(currentDynasty.currentTid) : undefined}
        />
      )}
    </div>
  )
}
