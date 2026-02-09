import { useState, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useCurrentTeamColors } from '../../hooks/useTeamColors'
import { getContrastTextColor } from '../../utils/colorUtils'
import { getTeamLogoByTid, getMascotName } from '../../data/teams'

// US States
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

export default function PlayersByState() {
  const { state } = useParams()
  const navigate = useNavigate()
  const pathPrefix = usePathPrefix()
  const { currentDynasty } = useDynasty()
  const teamColors = useCurrentTeamColors()

  const [groupBy, setGroupBy] = useState('hometown') // 'hometown' or 'position'
  const [sortBy, setSortBy] = useState('name') // 'name', 'overall', 'class'

  const primaryColor = teamColors?.primary || '#1f2937'
  const secondaryColor = teamColors?.secondary || '#f3f4f6'
  const primaryText = getContrastTextColor(primaryColor)
  const secondaryText = getContrastTextColor(secondaryColor)

  // Get state name from code
  const stateName = US_STATES.find(s => s.code === state?.toUpperCase())?.name || state

  // Filter and sort players from this state
  const playersFromState = useMemo(() => {
    if (!currentDynasty?.players || !state) return []

    const filtered = Object.values(currentDynasty.players)
      .filter(player => {
        const playerState = player.state?.toUpperCase()
        return playerState === state.toUpperCase()
      })

    // Sort based on selected option
    return filtered.sort((a, b) => {
      if (sortBy === 'overall') {
        return (b.overall || 0) - (a.overall || 0)
      } else if (sortBy === 'class') {
        const classOrder = { 'Senior': 4, 'Junior': 3, 'Sophomore': 2, 'Freshman': 1 }
        return (classOrder[b.class] || 0) - (classOrder[a.class] || 0)
      } else {
        // Sort by name
        return (a.name || '').localeCompare(b.name || '')
      }
    })
  }, [currentDynasty?.players, state, sortBy])

  // Calculate player counts for each state
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

  // Calculate statistics for current state
  const stateStats = useMemo(() => {
    if (!playersFromState.length) return null

    const positions = {}
    const hometowns = new Set()
    let totalOverall = 0
    let starPlayers = 0
    let topPlayer = null

    playersFromState.forEach(player => {
      // Position distribution
      const pos = player.position || 'Unknown'
      positions[pos] = (positions[pos] || 0) + 1

      // Hometown count
      if (player.hometown) hometowns.add(player.hometown)

      // Overall ratings
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

  // Group players by hometown or position
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

    // Sort groups by player count (descending)
    return Object.entries(groups).sort((a, b) => b[1].length - a[1].length)
  }, [playersFromState, groupBy])

  // Get current team for each player
  const getCurrentTeam = (player) => {
    const currentYear = currentDynasty?.currentYear
    const teamTid = player.teamsByYear?.[currentYear] || player.team
    return teamTid
  }

  const handleStateChange = (newState) => {
    navigate(`${pathPrefix}/players/state/${newState}`)
  }

  if (!currentDynasty) {
    return <div className="text-center py-12"><p style={{ color: secondaryText }}>Dynasty not found</p></div>
  }

  return (
    <div className="space-y-4">
      {/* Compact Header */}
      <div
        className="rounded-lg shadow-lg overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}dd 100%)` }}
      >
        <div className="p-4">
          {/* Title and State Selector */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
            <div>
              <h1 className="text-2xl font-bold mb-1" style={{ color: primaryText }}>
                {stateName}
              </h1>
              <p className="text-sm opacity-90" style={{ color: primaryText }}>
                {playersFromState.length} {playersFromState.length === 1 ? 'Player' : 'Players'}
              </p>
            </div>

            {/* State Selector */}
            <select
              value={state?.toUpperCase() || ''}
              onChange={(e) => handleStateChange(e.target.value)}
              className="px-3 py-2 rounded border-0 focus:outline-none focus:ring-2 focus:ring-white/50 text-gray-900 text-sm font-medium"
              style={{ backgroundColor: 'white' }}
            >
              {US_STATES.map(s => {
                const playerCount = statePlayerCounts[s.code] || 0
                return (
                  <option key={s.code} value={s.code}>
                    {s.name} {playerCount > 0 ? `(${playerCount})` : ''}
                  </option>
                )
              })}
            </select>
          </div>

          {/* Compact Statistics */}
          {stateStats && (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              <div className="rounded p-2 backdrop-blur-sm text-center" style={{ backgroundColor: 'rgba(255, 255, 255, 0.15)' }}>
                <div className="text-xl font-bold" style={{ color: primaryText }}>{stateStats.avgOverall}</div>
                <div className="text-xs opacity-90" style={{ color: primaryText }}>Avg OVR</div>
              </div>
              <div className="rounded p-2 backdrop-blur-sm text-center" style={{ backgroundColor: 'rgba(255, 255, 255, 0.15)' }}>
                <div className="text-xl font-bold" style={{ color: primaryText }}>{stateStats.starPlayers}</div>
                <div className="text-xs opacity-90" style={{ color: primaryText }}>85+ OVR</div>
              </div>
              <div className="rounded p-2 backdrop-blur-sm text-center" style={{ backgroundColor: 'rgba(255, 255, 255, 0.15)' }}>
                <div className="text-xl font-bold" style={{ color: primaryText }}>{stateStats.topPosition?.[0] || '-'}</div>
                <div className="text-xs opacity-90" style={{ color: primaryText }}>Top Pos</div>
              </div>
              <div className="rounded p-2 backdrop-blur-sm text-center" style={{ backgroundColor: 'rgba(255, 255, 255, 0.15)' }}>
                <div className="text-xl font-bold" style={{ color: primaryText }}>{stateStats.hometownCount}</div>
                <div className="text-xs opacity-90" style={{ color: primaryText }}>Cities</div>
              </div>
              {stateStats.topPlayer && (
                <Link
                  to={`${pathPrefix}/player/${stateStats.topPlayer.pid}`}
                  className="rounded p-2 backdrop-blur-sm hover:backdrop-blur-md transition-all text-center"
                  style={{ backgroundColor: 'rgba(255, 255, 255, 0.15)' }}
                >
                  <div className="text-lg font-bold truncate" style={{ color: primaryText }}>
                    {stateStats.topPlayer.name.split(' ').pop()}
                  </div>
                  <div className="text-xs opacity-90" style={{ color: primaryText }}>
                    Top ({stateStats.topPlayer.overall})
                  </div>
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Compact Controls Bar */}
      <div className="rounded-lg shadow p-3" style={{ backgroundColor: secondaryColor }}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          {/* Group By */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold" style={{ color: secondaryText }}>GROUP:</span>
            <div className="flex gap-1">
              <button
                onClick={() => setGroupBy('hometown')}
                className={`px-3 py-1 rounded text-sm font-medium transition-all ${
                  groupBy === 'hometown' ? 'shadow' : 'opacity-60 hover:opacity-100'
                }`}
                style={{
                  backgroundColor: groupBy === 'hometown' ? primaryColor : 'transparent',
                  color: groupBy === 'hometown' ? primaryText : secondaryText,
                  border: groupBy === 'hometown' ? 'none' : `1px solid ${secondaryText}30`
                }}
              >
                City
              </button>
              <button
                onClick={() => setGroupBy('position')}
                className={`px-3 py-1 rounded text-sm font-medium transition-all ${
                  groupBy === 'position' ? 'shadow' : 'opacity-60 hover:opacity-100'
                }`}
                style={{
                  backgroundColor: groupBy === 'position' ? primaryColor : 'transparent',
                  color: groupBy === 'position' ? primaryText : secondaryText,
                  border: groupBy === 'position' ? 'none' : `1px solid ${secondaryText}30`
                }}
              >
                Position
              </button>
            </div>
          </div>

          {/* Sort By */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold" style={{ color: secondaryText }}>SORT:</span>
            <div className="flex gap-1">
              <button
                onClick={() => setSortBy('name')}
                className={`px-3 py-1 rounded text-sm font-medium transition-all ${
                  sortBy === 'name' ? 'shadow' : 'opacity-60 hover:opacity-100'
                }`}
                style={{
                  backgroundColor: sortBy === 'name' ? primaryColor : 'transparent',
                  color: sortBy === 'name' ? primaryText : secondaryText,
                  border: sortBy === 'name' ? 'none' : `1px solid ${secondaryText}30`
                }}
              >
                Name
              </button>
              <button
                onClick={() => setSortBy('overall')}
                className={`px-3 py-1 rounded text-sm font-medium transition-all ${
                  sortBy === 'overall' ? 'shadow' : 'opacity-60 hover:opacity-100'
                }`}
                style={{
                  backgroundColor: sortBy === 'overall' ? primaryColor : 'transparent',
                  color: sortBy === 'overall' ? primaryText : secondaryText,
                  border: sortBy === 'overall' ? 'none' : `1px solid ${secondaryText}30`
                }}
              >
                Rating
              </button>
              <button
                onClick={() => setSortBy('class')}
                className={`px-3 py-1 rounded text-sm font-medium transition-all ${
                  sortBy === 'class' ? 'shadow' : 'opacity-60 hover:opacity-100'
                }`}
                style={{
                  backgroundColor: sortBy === 'class' ? primaryColor : 'transparent',
                  color: sortBy === 'class' ? primaryText : secondaryText,
                  border: sortBy === 'class' ? 'none' : `1px solid ${secondaryText}30`
                }}
              >
                Class
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Players - Grouped List Display */}
      {playersFromState.length === 0 ? (
        <div
          className="rounded-lg shadow p-8 text-center"
          style={{ backgroundColor: secondaryColor }}
        >
          <p className="text-lg font-semibold" style={{ color: secondaryText }}>
            No players from {stateName} are currently in your dynasty.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedPlayers.map(([groupName, groupPlayers]) => (
            <div key={groupName} className="space-y-2">
              {/* Group Header */}
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="px-3 py-1.5 rounded inline-block"
                  style={{ backgroundColor: primaryColor }}
                >
                  <h2 className="text-base font-bold" style={{ color: primaryText }}>
                    {groupName}
                  </h2>
                </div>
                <div
                  className="px-2 py-0.5 rounded-full text-xs font-bold"
                  style={{
                    backgroundColor: `${primaryColor}20`,
                    color: secondaryText
                  }}
                >
                  {groupPlayers.length}
                </div>
              </div>

              {/* Compact Player List */}
              <div
                className="rounded-lg overflow-hidden shadow"
                style={{ backgroundColor: secondaryColor }}
              >
                <div className="divide-y" style={{ borderColor: `${secondaryText}15` }}>
                  {groupPlayers.map(player => {
                    const teamTid = getCurrentTeam(player)
                    const teamLogo = teamTid ? getTeamLogoByTid(teamTid, currentDynasty.teams) : null

                    return (
                      <Link
                        key={player.pid}
                        to={`${pathPrefix}/player/${player.pid}`}
                        className="flex items-center gap-3 px-4 py-2.5 hover:opacity-80 transition-opacity"
                        style={{
                          backgroundColor: secondaryColor
                        }}
                      >
                        {/* Photo thumbnail */}
                        <div className="flex-shrink-0">
                          {player.pictureUrl ? (
                            <img
                              src={player.pictureUrl}
                              alt={player.name}
                              className="w-12 h-12 object-cover rounded"
                              onError={(e) => {
                                e.target.style.display = 'none'
                                e.target.nextSibling.style.display = 'flex'
                              }}
                            />
                          ) : (
                            <div
                              className="w-12 h-12 rounded flex items-center justify-center text-lg"
                              style={{ backgroundColor: `${primaryColor}15` }}
                            >
                              <span style={{ color: `${secondaryText}40` }}>🏈</span>
                            </div>
                          )}
                        </div>

                        {/* Overall badge */}
                        <div
                          className="flex-shrink-0 w-10 h-10 rounded flex items-center justify-center font-bold text-lg"
                          style={{
                            backgroundColor: primaryColor,
                            color: primaryText
                          }}
                        >
                          {player.overall || '??'}
                        </div>

                        {/* Player name and position */}
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-base truncate" style={{ color: secondaryText }}>
                            {player.name}
                          </div>
                          <div className="flex items-center gap-2 text-xs opacity-75" style={{ color: secondaryText }}>
                            {teamLogo && (
                              <img
                                src={teamLogo}
                                alt=""
                                className="w-4 h-4 object-contain"
                                onError={(e) => { e.target.style.display = 'none' }}
                              />
                            )}
                            <span className="font-semibold">
                              {player.position} {player.jerseyNumber ? `#${player.jerseyNumber}` : ''}
                            </span>
                          </div>
                        </div>

                        {/* Hometown */}
                        <div className="hidden sm:block flex-shrink-0 text-sm opacity-60" style={{ color: secondaryText }}>
                          {player.hometown || 'Unknown'}
                        </div>

                        {/* Class */}
                        {player.class && (
                          <div
                            className="hidden md:block flex-shrink-0 px-2 py-1 rounded text-xs font-bold"
                            style={{
                              backgroundColor: `${primaryColor}20`,
                              color: secondaryText
                            }}
                          >
                            {player.class}
                          </div>
                        )}

                        {/* Dev Trait */}
                        {player.devTrait && player.devTrait !== 'Normal' && (
                          <div
                            className="flex-shrink-0 px-2 py-1 rounded text-xs font-bold"
                            style={{
                              backgroundColor: player.devTrait === 'Elite' ? '#fbbf24' :
                                             player.devTrait === 'Star' ? '#8b5cf6' :
                                             player.devTrait === 'Impact' ? '#3b82f6' : '#9ca3af',
                              color: player.devTrait === 'Elite' ? '#78350f' : '#ffffff'
                            }}
                          >
                            {player.devTrait}
                          </div>
                        )}
                      </Link>
                    )
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
