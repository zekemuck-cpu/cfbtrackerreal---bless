import { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { getTeamLogo, getTeamLogoByTid, stripMascotFromName } from '../../data/teams'
import { PageHero, Card, EmptyState, Select, DataTable } from '../../components/ui'

const TIMEFRAMES = [
  { key: 'career', label: 'Career' },
  { key: 'game', label: 'Game' },
  { key: 'season', label: 'Season' },
]
const TIMEFRAME_KEYS = new Set(TIMEFRAMES.map((t) => t.key))

// Fixed display order + labels — matches the in-game "CFB Records" screen's
// own row order exactly (Passing Yards, Rushing Yards, Receiving Yards,
// Receptions, Passing TDs, Rushing TDs, Receiving TDs, Sacks, Interceptions).
const STAT_TYPES = [
  { key: 'PassYards', label: 'Passing Yards' },
  { key: 'RushYards', label: 'Rushing Yards' },
  { key: 'ReceiveYards', label: 'Receiving Yards' },
  { key: 'ReceiveCatches', label: 'Receptions' },
  { key: 'PassTds', label: 'Passing Touchdowns' },
  { key: 'RushTds', label: 'Rushing Touchdowns' },
  { key: 'ReceiveTDs', label: 'Receiving Touchdowns' },
  { key: 'DefensiveSacks', label: 'Sacks' },
  { key: 'DefensiveInts', label: 'Interceptions' },
]

// Team-scoped records live on team.statRecords directly (a flat field, not
// nested under byYear[year]) — it's the save's CURRENT record-book state,
// same as leagueStatRecords at the dynasty level, so it's just overwritten
// wholesale on every sync rather than duplicated into every season's slot.
function getTeamStatRecords(team, timeframe) {
  return team?.statRecords?.[timeframe] || []
}

export default function Records() {
  const { timeframe: timeframeParam } = useParams()
  const { currentDynasty } = useDynasty()
  const pathPrefix = usePathPrefix()
  const navigate = useNavigate()

  const resolveTimeframe = (param) => {
    const key = (param || '').toLowerCase()
    if (TIMEFRAME_KEYS.has(key)) return key
    const stored = localStorage.getItem('records-timeframe')
    if (stored && TIMEFRAME_KEYS.has(stored)) return stored
    return 'career'
  }

  const [activeTimeframe, setActiveTimeframe] = useState(() => resolveTimeframe(timeframeParam))
  // Persisted (not just in-memory) because switching Career/Game/Season
  // navigates between two different <Route> matches (records vs
  // records/:timeframe) — React Router remounts the component on that
  // transition, which would otherwise wipe the scope pick back to
  // National on every single tab click.
  const [scope, setScope] = useState(() => localStorage.getItem('records-scope') || 'national')
  const handleScopeChange = (value) => {
    setScope(value)
    localStorage.setItem('records-scope', value)
  }

  useEffect(() => {
    const next = resolveTimeframe(timeframeParam)
    if (next !== activeTimeframe) setActiveTimeframe(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeframeParam])

  const teamsSource = currentDynasty?.teams || currentDynasty?.customTeams || {}

  const conferenceNames = useMemo(() => {
    const names = new Set()
    for (const tf of TIMEFRAMES) {
      const confObj = currentDynasty?.leagueStatRecords?.[tf.key]?.conference
      if (confObj) Object.keys(confObj).forEach((n) => names.add(n))
    }
    return Array.from(names).sort()
  }, [currentDynasty?.leagueStatRecords])

  const teamOptions = useMemo(() => {
    return Object.entries(teamsSource)
      .filter(([, t]) => t && t.name && !t.isFCS)
      .map(([tid, t]) => ({ tid: Number(tid), name: t.name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [teamsSource])

  // Synced record entries store the raw short school name (e.g. "Houston"),
  // not the app's full "Houston Cougars" display name, so logo lookup has to
  // go through tid: match either form against each dynasty team, then use
  // the tid-based logo helper per the app's tid-based team convention.
  const teamNameToTid = useMemo(() => {
    const map = new Map()
    for (const [tid, team] of Object.entries(teamsSource)) {
      if (!team?.name) continue
      map.set(team.name.toLowerCase(), Number(tid))
      const school = stripMascotFromName(team.name)
      if (school) map.set(school.toLowerCase(), Number(tid))
    }
    return map
  }, [teamsSource])

  const getRecordTeamLogo = (teamName) => {
    if (!teamName) return null
    const tid = teamNameToTid.get(teamName.trim().toLowerCase())
    if (tid != null) return getTeamLogoByTid(tid, teamsSource)
    return getTeamLogo(teamName, teamsSource)
  }

  const entriesByType = useMemo(() => {
    let list = []
    if (scope === 'national') {
      list = currentDynasty?.leagueStatRecords?.[activeTimeframe]?.national || []
    } else if (scope.startsWith('conf:')) {
      const confName = scope.slice(5)
      list = currentDynasty?.leagueStatRecords?.[activeTimeframe]?.conference?.[confName] || []
    } else if (scope.startsWith('team:')) {
      const tid = scope.slice(5)
      const team = teamsSource[tid] || teamsSource[Number(tid)]
      list = getTeamStatRecords(team, activeTimeframe)
    }
    const byType = {}
    for (const e of list) byType[e.statType] = e
    return byType
  }, [currentDynasty?.leagueStatRecords, activeTimeframe, scope, teamsSource])

  const handleTimeframeChange = (key) => {
    setActiveTimeframe(key)
    localStorage.setItem('records-timeframe', key)
    navigate(`${pathPrefix}/records/${key}`)
  }

  if (!currentDynasty) return null

  const hasAnyData = !!currentDynasty?.leagueStatRecords
    || teamOptions.some((t) => TIMEFRAMES.some((tf) => getTeamStatRecords(teamsSource[t.tid], tf.key).length))

  const rows = STAT_TYPES.map((st) => ({ ...st, entry: entriesByType[st.key] || null }))

  const columns = [
    { key: 'stat', header: 'Stat', align: 'left', render: (r) => r.label },
    {
      key: 'player',
      header: 'Player',
      align: 'left',
      render: (r) => {
        if (!r.entry) return '-'
        return <span className="font-medium text-txt-primary">{r.entry.first_name} {r.entry.last_name}</span>
      },
    },
    {
      key: 'team',
      header: 'Team',
      align: 'left',
      render: (r) => {
        if (!r.entry?.team_name) return '-'
        const logo = getRecordTeamLogo(r.entry.team_name)
        return (
          <div className="flex items-center gap-2">
            {logo && <img src={logo} alt="" className="w-5 h-5 object-contain flex-shrink-0" />}
            <span>{r.entry.team_name}</span>
          </div>
        )
      },
    },
    { key: 'pos', header: 'Pos', align: 'center', render: (r) => r.entry?.position || '-' },
    { key: 'year', header: 'Year', align: 'center', render: (r) => r.entry?.year ?? '-' },
    {
      key: 'value',
      header: 'Value',
      align: 'right',
      render: (r) => (r.entry?.value != null ? Number(r.entry.value).toLocaleString() : '-'),
    },
  ]

  const heroTabs = TIMEFRAMES.map((t) => ({ key: t.key, label: t.label }))

  return (
    <div className="space-y-6 page-enter">
      <PageHero
        title="Records"
        actions={
          <Select
            size="sm"
            value={scope}
            onChange={(e) => handleScopeChange(e.target.value)}
            aria-label="Scope"
          >
            <option value="national">National</option>
            {conferenceNames.length > 0 && (
              <optgroup label="Conferences">
                {conferenceNames.map((name) => (
                  <option key={name} value={`conf:${name}`}>{name}</option>
                ))}
              </optgroup>
            )}
            {teamOptions.length > 0 && (
              <optgroup label="Teams">
                {teamOptions.map((t) => (
                  <option key={t.tid} value={`team:${t.tid}`}>{t.name}</option>
                ))}
              </optgroup>
            )}
          </Select>
        }
        tabs={heroTabs}
        activeTab={activeTimeframe}
        onTabChange={handleTimeframeChange}
      />

      {!hasAnyData ? (
        <Card>
          <EmptyState
            title="No records synced yet"
            message="Run Sync from Save to pull the record book from your save file."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <DataTable
            columns={columns}
            rows={rows}
            rowKey="key"
            emptyTitle="No records for this scope yet"
          />
        </Card>
      )}
    </div>
  )
}
