import { useState, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { getTeamLogoByTid } from '../../data/teams'
import { PageHero, Card, EmptyState, Select, Badge, Stat, Tabs } from '../../components/ui'

const US_STATES = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
  { code: 'DC', name: 'District of Columbia' }
]

const DEV_TRAIT_VARIANT = {
  'Elite': 'warning',
  'Star': 'accent',
  'Impact': 'default',
  'Normal': 'outline'
}

const GROUP_OPTIONS = [
  { value: 'hometown', label: 'City' },
  { value: 'position', label: 'Position' }
]

const SORT_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'overall', label: 'Rating' },
  { value: 'class', label: 'Class' }
]

export default function PlayersByState() {
  const { state } = useParams()
  const navigate = useNavigate()
  const pathPrefix = usePathPrefix()
  const { currentDynasty } = useDynasty()

  const [groupBy, setGroupBy] = useState('hometown')
  const [sortBy, setSortBy] = useState('name')

  const stateName = US_STATES.find(s => s.code === state?.toUpperCase())?.name || state

  const playersFromState = useMemo(() => {
    if (!currentDynasty?.players || !state) return []

    const filtered = Object.values(currentDynasty.players)
      .filter(player => {
        const playerState = player.state?.toUpperCase()
        return playerState === state.toUpperCase()
      })

    return filtered.sort((a, b) => {
      if (sortBy === 'overall') {
        return (b.overall || 0) - (a.overall || 0)
      } else if (sortBy === 'class') {
        const classOrder = { 'Senior': 4, 'Junior': 3, 'Sophomore': 2, 'Freshman': 1 }
        return (classOrder[b.class] || 0) - (classOrder[a.class] || 0)
      } else {
        return (a.name || '').localeCompare(b.name || '')
      }
    })
  }, [currentDynasty?.players, state, sortBy])

  const statePlayerCounts = useMemo(() => {
    if (!currentDynasty?.players) return {}

    const counts = {}
    Object.values(currentDynasty.players).forEach(player => {
      const playerState = player.state?.toUpperCase()
      if (playerState) {
        counts[playerState] = (counts[playerState] || 0) + 1
      }
    })
    return counts
  }, [currentDynasty?.players])

  const stateStats = useMemo(() => {
    if (!playersFromState.length) return null

    const positions = {}
    const hometowns = new Set()
    let totalOverall = 0
    let starPlayers = 0
    let topPlayer = null

    playersFromState.forEach(player => {
      const pos = player.position || 'Unknown'
      positions[pos] = (positions[pos] || 0) + 1

      if (player.hometown) hometowns.add(player.hometown)

      if (player.overall) {
        totalOverall += player.overall
        if (player.overall >= 85) starPlayers++
        if (!topPlayer || (player.overall > (topPlayer.overall || 0))) {
          topPlayer = player
        }
      }
    })

    const avgOverall = Math.round(totalOverall / playersFromState.length)
    const topPosition = Object.entries(positions).sort((a, b) => b[1] - a[1])[0]

    return {
      avgOverall,
      starPlayers,
      topPosition,
      hometownCount: hometowns.size,
      topPlayer
    }
  }, [playersFromState])

  const groupedPlayers = useMemo(() => {
    const groups = {}

    playersFromState.forEach(player => {
      const key = groupBy === 'hometown'
        ? (player.hometown || 'Unknown Location')
        : (player.position || 'Unknown Position')

      if (!groups[key]) {
        groups[key] = []
      }
      groups[key].push(player)
    })

    return Object.entries(groups).sort((a, b) => b[1].length - a[1].length)
  }, [playersFromState, groupBy])

  const getCurrentTeam = (player) => {
    const currentYear = currentDynasty?.currentYear
    const teamTid = player.teamsByYear?.[currentYear] || player.team
    return teamTid
  }

  const handleStateChange = (newState) => {
    navigate(`${pathPrefix}/players/state/${newState}`)
  }

  if (!currentDynasty) {
    return (
      <Card>
        <EmptyState title="Dynasty not found" />
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow="Players by State"
        title={stateName}
        meta={
          <>
            <span className="tabular">{playersFromState.length}</span>
            <span>{playersFromState.length === 1 ? 'player' : 'players'}</span>
          </>
        }
        actions={
          <Select
            size="sm"
            value={state?.toUpperCase() || ''}
            onChange={(e) => handleStateChange(e.target.value)}
          >
            {US_STATES.map(s => {
              const playerCount = statePlayerCounts[s.code] || 0
              return (
                <option key={s.code} value={s.code}>
                  {s.name} {playerCount > 0 ? `(${playerCount})` : ''}
                </option>
              )
            })}
          </Select>
        }
      />

      {stateStats && (
        <Card>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4">
            <Stat label="Avg OVR" value={stateStats.avgOverall} size="lg" align="left" />
            <Stat label="85+ OVR" value={stateStats.starPlayers} size="lg" align="left" />
            <Stat label="Top Pos" value={stateStats.topPosition?.[0] || '—'} size="lg" align="left" />
            <Stat label="Cities" value={stateStats.hometownCount} size="lg" align="left" />
            {stateStats.topPlayer && (
              <Link
                to={`${pathPrefix}/player/${stateStats.topPlayer.pid}`}
                className="flex flex-col items-start hover:opacity-80 transition-opacity"
              >
                <span className="label-xs text-txt-tertiary">Top Player</span>
                <span className="stat-lg text-txt-primary leading-none truncate max-w-full">
                  {stateStats.topPlayer.name}
                </span>
                <span className="text-xs text-txt-tertiary mt-1 tabular">
                  OVR {stateStats.topPlayer.overall}
                </span>
              </Link>
            )}
          </div>
        </Card>
      )}

      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="label-xs text-txt-tertiary">Group</span>
            <Tabs
              variant="pill"
              value={groupBy}
              onChange={setGroupBy}
              options={GROUP_OPTIONS}
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="label-xs text-txt-tertiary">Sort</span>
            <Tabs
              variant="pill"
              value={sortBy}
              onChange={setSortBy}
              options={SORT_OPTIONS}
            />
          </div>
        </div>
      </Card>

      {playersFromState.length === 0 ? (
        <Card>
          <EmptyState
            title="No players from this state"
            message={`No players from ${stateName} are currently in your dynasty.`}
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {groupedPlayers.map(([groupName, groupPlayers]) => (
            <div key={groupName}>
              <div className="flex items-baseline gap-2 mb-2">
                <h2 className="text-lg font-semibold text-txt-primary">{groupName}</h2>
                <span className="label-xs text-txt-tertiary tabular">
                  {groupPlayers.length} {groupPlayers.length === 1 ? 'player' : 'players'}
                </span>
              </div>

              <Card padding="none">
                {groupPlayers.map((player, idx) => {
                  const teamTid = getCurrentTeam(player)
                  const teamLogo = teamTid ? getTeamLogoByTid(teamTid, currentDynasty.teams) : null

                  return (
                    <Link
                      key={player.pid}
                      to={`${pathPrefix}/player/${player.pid}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-surface-3 transition-colors"
                      style={{
                        borderBottom: idx < groupPlayers.length - 1 ? '1px solid var(--surface-4)' : 'none'
                      }}
                    >
                      <div
                        className="flex-shrink-0 w-10 h-10 rounded flex items-center justify-center font-bold text-sm tabular"
                        style={{
                          backgroundColor: 'var(--surface-3)',
                          color: 'var(--text-primary)'
                        }}
                      >
                        {player.overall || '—'}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-txt-primary truncate">
                          {player.name}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-txt-tertiary mt-0.5">
                          {teamLogo && (
                            <img
                              src={teamLogo}
                              alt=""
                              className="w-4 h-4 object-contain"
                              onError={(e) => { e.target.style.display = 'none' }}
                            />
                          )}
                          <span className="font-medium">
                            {player.position}
                            {player.jerseyNumber ? ` · #${player.jerseyNumber}` : ''}
                          </span>
                        </div>
                      </div>

                      <div className="hidden sm:block flex-shrink-0 text-sm text-txt-secondary">
                        {player.hometown || '—'}
                      </div>

                      {player.class && (
                        <div className="hidden md:block flex-shrink-0">
                          <Badge variant="outline" size="sm">{player.class}</Badge>
                        </div>
                      )}

                      {player.devTrait && player.devTrait !== 'Normal' && (
                        <div className="flex-shrink-0">
                          <Badge variant={DEV_TRAIT_VARIANT[player.devTrait] || 'outline'} size="sm">
                            {player.devTrait}
                          </Badge>
                        </div>
                      )}
                    </Link>
                  )
                })}
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
