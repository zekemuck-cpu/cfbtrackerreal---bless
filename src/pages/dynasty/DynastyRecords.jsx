import { useState, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { getTeamLogo } from '../../data/teams'
import { getTeamName } from '../../data/teamAbbreviations'
import { getAbbrFromTeamName } from '../../data/teamRegistry'

// Medal colors for top 3
const MEDAL_COLORS = {
  1: { bg: 'linear-gradient(135deg, #fbbf24, #f59e0b)', text: '#000', shadow: '0 4px 14px rgba(251, 191, 36, 0.4)' },
  2: { bg: 'linear-gradient(135deg, #e5e7eb, #9ca3af)', text: '#000', shadow: '0 4px 14px rgba(156, 163, 175, 0.4)' },
  3: { bg: 'linear-gradient(135deg, #d97706, #b45309)', text: '#fff', shadow: '0 4px 14px rgba(217, 119, 6, 0.4)' },
}

// Stat category definitions
const STAT_CATEGORIES = {
  passing: {
    name: 'Passing',
    color: '#3b82f6',
    minNote: 'Min 150 ATT (career) / 50 ATT (season)',
    stats: [
      { key: 'completions', label: 'Completions', abbr: 'CMP', field: 'cmp' },
      { key: 'attempts', label: 'Pass Attempts', abbr: 'ATT', field: 'att' },
      { key: 'compPct', label: 'Completion %', abbr: 'CMP%', calculated: true, minAtt: { career: 150, season: 50 }, format: 'pct' },
      { key: 'yards', label: 'Passing Yards', abbr: 'YDS', field: 'yds' },
      { key: 'ypa', label: 'Yards/Attempt', abbr: 'Y/A', calculated: true, minAtt: { career: 150, season: 50 }, format: 'avg' },
      { key: 'tds', label: 'Passing TDs', abbr: 'TD', field: 'td' },
      { key: 'ints', label: 'Interceptions', abbr: 'INT', field: 'int', lowerIsBetter: true },
      { key: 'rating', label: 'Passer Rating', abbr: 'RTG', calculated: true, minAtt: { career: 150, season: 50 }, format: 'rating' },
    ]
  },
  rushing: {
    name: 'Rushing',
    color: '#10b981',
    minNote: 'Min 100 ATT (career) / 25 ATT (season)',
    stats: [
      { key: 'attempts', label: 'Rush Attempts', abbr: 'ATT', field: 'car' },
      { key: 'yards', label: 'Rush Yards', abbr: 'YDS', field: 'yds' },
      { key: 'ypc', label: 'Yards/Carry', abbr: 'Y/C', calculated: true, minAtt: { career: 100, season: 25 }, format: 'avg' },
      { key: 'tds', label: 'Rush TDs', abbr: 'TD', field: 'td' }
    ]
  },
  receiving: {
    name: 'Receiving',
    color: '#8b5cf6',
    minNote: 'Min 50 REC (career) / 10 REC (season)',
    stats: [
      { key: 'receptions', label: 'Receptions', abbr: 'REC', field: 'rec' },
      { key: 'yards', label: 'Receiving Yards', abbr: 'YDS', field: 'yds' },
      { key: 'ypr', label: 'Yards/Reception', abbr: 'Y/R', calculated: true, minAtt: { career: 50, season: 10 }, format: 'avg' },
      { key: 'tds', label: 'Receiving TDs', abbr: 'TD', field: 'td' }
    ]
  },
  allPurpose: {
    name: 'All-Purpose',
    color: '#f59e0b',
    stats: [
      { key: 'plays', label: 'All-Purpose Plays', abbr: 'PLY', calculated: true },
      { key: 'yards', label: 'All-Purpose Yards', abbr: 'YDS', calculated: true },
      { key: 'tds', label: 'All-Purpose TDs', abbr: 'TD', calculated: true }
    ]
  },
  defensive: {
    name: 'Defense',
    color: '#ef4444',
    stats: [
      { key: 'totalTackles', label: 'Total Tackles', abbr: 'TOT', calculated: true },
      { key: 'soloTackles', label: 'Solo Tackles', abbr: 'SOLO', field: 'soloTkl' },
      { key: 'tfl', label: 'Tackles for Loss', abbr: 'TFL', field: 'tfl' },
      { key: 'sacks', label: 'Sacks', abbr: 'SCK', field: 'sacks' },
      { key: 'ints', label: 'Interceptions', abbr: 'INT', field: 'int' },
      { key: 'pdef', label: 'Passes Defensed', abbr: 'PD', field: 'pd' },
      { key: 'ff', label: 'Forced Fumbles', abbr: 'FF', field: 'ff' },
    ]
  },
  kicking: {
    name: 'Kicking',
    color: '#06b6d4',
    minNote: 'Min 25 FGA (career) / 5 FGA (season)',
    stats: [
      { key: 'fgm', label: 'FG Made', abbr: 'FGM', field: 'fgm' },
      { key: 'fga', label: 'FG Attempted', abbr: 'FGA', field: 'fga' },
      { key: 'fgPct', label: 'FG %', abbr: 'FG%', calculated: true, minAtt: { career: 25, season: 5 }, format: 'pct' },
      { key: 'xpm', label: 'XP Made', abbr: 'XPM', field: 'xpm' },
    ]
  },
  punting: {
    name: 'Punting',
    color: '#ec4899',
    minNote: 'Min 50 punts (career) / 10 punts (season)',
    stats: [
      { key: 'punts', label: 'Punts', abbr: 'P', field: 'punts' },
      { key: 'yards', label: 'Punt Yards', abbr: 'YDS', field: 'yds' },
      { key: 'ypp', label: 'Yards/Punt', abbr: 'Y/P', calculated: true, minAtt: { career: 50, season: 10 }, format: 'avg' }
    ]
  },
  kickReturn: {
    name: 'Kick Returns',
    color: '#14b8a6',
    stats: [
      { key: 'returns', label: 'Kick Returns', abbr: 'RET', field: 'ret' },
      { key: 'yards', label: 'KR Yards', abbr: 'YDS', field: 'yds' },
      { key: 'avg', label: 'Yards/Return', abbr: 'AVG', calculated: true, minAtt: { career: 20, season: 5 }, format: 'avg' },
      { key: 'tds', label: 'KR TDs', abbr: 'TD', field: 'td' }
    ]
  },
  puntReturn: {
    name: 'Punt Returns',
    color: '#a855f7',
    stats: [
      { key: 'returns', label: 'Punt Returns', abbr: 'RET', field: 'ret' },
      { key: 'yards', label: 'PR Yards', abbr: 'YDS', field: 'yds' },
      { key: 'avg', label: 'Yards/Return', abbr: 'AVG', calculated: true, minAtt: { career: 20, season: 5 }, format: 'avg' },
      { key: 'tds', label: 'PR TDs', abbr: 'TD', field: 'td' }
    ]
  }
}

const CATEGORY_ORDER = ['passing', 'rushing', 'receiving', 'allPurpose', 'defensive', 'kicking', 'punting', 'kickReturn', 'puntReturn']

export default function DynastyRecords() {
  const { id: dynastyId } = useParams()
  const { currentDynasty } = useDynasty()
  const pathPrefix = usePathPrefix()

  const [mode, setMode] = useState(() => localStorage.getItem('leaderboard-mode') || 'career')
  const [activeCategory, setActiveCategory] = useState(() => localStorage.getItem('leaderboard-category') || 'passing')
  const [selectedStat, setSelectedStat] = useState(null)

  // Get roster players
  const getRosterPlayers = () => {
    if (!currentDynasty?.players) return []
    return currentDynasty.players.filter(p => !p.isHonorOnly)
  }

  // Get player info
  const getPlayerInfo = (pid) => {
    const player = currentDynasty?.players?.find(p => p.pid === pid)
    const playerTeamRaw = player?.team || currentDynasty?.teamName
    const teamAbbr = getAbbrFromTeamName(playerTeamRaw) || playerTeamRaw
    const teamFullName = getTeamName(teamAbbr) || playerTeamRaw
    const teamLogo = getTeamLogo(teamFullName, currentDynasty?.teams || currentDynasty?.customTeams)
    return {
      name: player?.name || `Player ${pid}`,
      position: player?.position || '',
      team: teamFullName,
      teamAbbr,
      teamLogo,
      pictureUrl: player?.pictureUrl || null
    }
  }

  // Calculate leaderboards
  const leaderboards = useMemo(() => {
    const rosterPlayers = getRosterPlayers()
    if (rosterPlayers.length === 0) return {}

    const allPlayerStats = []

    rosterPlayers.forEach(player => {
      const playerOwnStats = player.statsByYear || {}

      Object.keys(playerOwnStats).forEach(yearStr => {
        const year = parseInt(yearStr)
        const yearStats = playerOwnStats[yearStr] || playerOwnStats[year]
        if (!yearStats) return

        const hasAnyStats = yearStats.gamesPlayed ||
          yearStats.passing || yearStats.rushing || yearStats.receiving ||
          yearStats.defense || yearStats.kicking || yearStats.punting ||
          yearStats.kickReturn || yearStats.puntReturn

        if (!hasAnyStats) return

        allPlayerStats.push({
          pid: player.pid,
          name: player.name,
          year,
          gamesPlayed: yearStats.gamesPlayed || 0,
          passing: yearStats.passing || null,
          rushing: yearStats.rushing || null,
          receiving: yearStats.receiving || null,
          defensive: yearStats.defense || null,
          kicking: yearStats.kicking || null,
          punting: yearStats.punting || null,
          kickReturn: yearStats.kickReturn || null,
          puntReturn: yearStats.puntReturn || null
        })
      })
    })

    if (allPlayerStats.length === 0) return {}

    const aggregateStats = (category) => {
      const playerTotals = {}

      allPlayerStats.forEach(ps => {
        const catStats = ps[category]
        if (!catStats) return

        const playerKey = mode === 'career' ? ps.pid : `${ps.pid}-${ps.year}`

        if (!playerTotals[playerKey]) {
          playerTotals[playerKey] = { pid: ps.pid, year: ps.year, years: [], gamesPlayed: 0 }
        }

        if (!playerTotals[playerKey].years.includes(ps.year)) {
          playerTotals[playerKey].years.push(ps.year)
        }

        if (ps.gamesPlayed) {
          playerTotals[playerKey].gamesPlayed += ps.gamesPlayed
        }

        Object.entries(catStats).forEach(([statKey, value]) => {
          if (typeof value === 'number') {
            if (mode === 'career') {
              playerTotals[playerKey][statKey] = (playerTotals[playerKey][statKey] || 0) + value
            } else {
              playerTotals[playerKey][statKey] = value
            }
          }
        })
      })

      return Object.values(playerTotals)
    }

    const calcAllPurposeStats = () => {
      const playerTotals = {}

      allPlayerStats.forEach(ps => {
        const playerKey = mode === 'career' ? ps.pid : `${ps.pid}-${ps.year}`

        if (!playerTotals[playerKey]) {
          playerTotals[playerKey] = { pid: ps.pid, year: ps.year, years: [], plays: 0, yards: 0, tds: 0 }
        }

        if (!playerTotals[playerKey].years.includes(ps.year)) {
          playerTotals[playerKey].years.push(ps.year)
        }

        if (ps.rushing) {
          playerTotals[playerKey].plays += ps.rushing.car || 0
          playerTotals[playerKey].yards += ps.rushing.yds || 0
          playerTotals[playerKey].tds += ps.rushing.td || 0
        }
        if (ps.receiving) {
          playerTotals[playerKey].plays += ps.receiving.rec || 0
          playerTotals[playerKey].yards += ps.receiving.yds || 0
          playerTotals[playerKey].tds += ps.receiving.td || 0
        }
        if (ps.kickReturn) {
          playerTotals[playerKey].plays += ps.kickReturn.ret || 0
          playerTotals[playerKey].yards += ps.kickReturn.yds || 0
          playerTotals[playerKey].tds += ps.kickReturn.td || 0
        }
        if (ps.puntReturn) {
          playerTotals[playerKey].plays += ps.puntReturn.ret || 0
          playerTotals[playerKey].yards += ps.puntReturn.yds || 0
          playerTotals[playerKey].tds += ps.puntReturn.td || 0
        }
      })

      return Object.values(playerTotals).filter(p => p.plays > 0 || p.yards > 0)
    }

    const result = {}

    Object.entries(STAT_CATEGORIES).forEach(([catKey, category]) => {
      let baseStats = catKey === 'allPurpose' ? calcAllPurposeStats() : aggregateStats(catKey)

      result[catKey] = {}

      category.stats.forEach(stat => {
        let leaderboard = baseStats.map(p => {
          let value

          if (stat.calculated) {
            switch (catKey) {
              case 'passing':
                const att = p.att || 0
                const cmp = p.cmp || 0
                const yds = p.yds || 0
                const tds = p.td || 0
                const ints = p.int || 0

                if (stat.key === 'compPct') value = att > 0 ? (cmp / att * 100) : 0
                else if (stat.key === 'ypa') value = att > 0 ? (yds / att) : 0
                else if (stat.key === 'rating') {
                  if (att > 0) {
                    const a = Math.max(0, Math.min(((cmp / att) - 0.3) * 20, 2.375))
                    const b = Math.max(0, Math.min(((yds / att) - 3) * 0.25, 2.375))
                    const c = Math.max(0, Math.min((tds / att) * 20, 2.375))
                    const d = Math.max(0, 2.375 - ((ints / att) * 25))
                    value = ((a + b + c + d) / 6) * 100
                  } else value = 0
                }

                if (stat.minAtt) {
                  const minReq = mode === 'career' ? stat.minAtt.career : stat.minAtt.season
                  if (att < minReq) value = null
                }
                break

              case 'rushing':
                const rushAtt = p.car || 0
                const rushYds = p.yds || 0
                if (stat.key === 'ypc') {
                  value = rushAtt > 0 ? (rushYds / rushAtt) : 0
                  if (stat.minAtt) {
                    const minReq = mode === 'career' ? stat.minAtt.career : stat.minAtt.season
                    if (rushAtt < minReq) value = null
                  }
                }
                break

              case 'receiving':
                const rec = p.rec || 0
                const recYds = p.yds || 0
                if (stat.key === 'ypr') {
                  value = rec > 0 ? (recYds / rec) : 0
                  if (stat.minAtt) {
                    const minReq = mode === 'career' ? stat.minAtt.career : stat.minAtt.season
                    if (rec < minReq) value = null
                  }
                }
                break

              case 'allPurpose':
                if (stat.key === 'plays') value = p.plays
                else if (stat.key === 'yards') value = p.yards
                else if (stat.key === 'tds') value = p.tds
                break

              case 'defensive':
                if (stat.key === 'totalTackles') {
                  value = (p.soloTkl || 0) + (p.astTkl || 0)
                }
                break

              case 'kicking':
                const fga = p.fga || 0
                const fgm = p.fgm || 0
                if (stat.key === 'fgPct') {
                  value = fga > 0 ? (fgm / fga * 100) : 0
                  if (stat.minAtt) {
                    const minReq = mode === 'career' ? stat.minAtt.career : stat.minAtt.season
                    if (fga < minReq) value = null
                  }
                }
                break

              case 'punting':
                const punts = p.punts || 0
                const puntYds = p.yds || 0
                if (stat.key === 'ypp') {
                  value = punts > 0 ? (puntYds / punts) : 0
                  if (stat.minAtt) {
                    const minReq = mode === 'career' ? stat.minAtt.career : stat.minAtt.season
                    if (punts < minReq) value = null
                  }
                }
                break

              case 'kickReturn':
              case 'puntReturn':
                const retAtt = p.ret || 0
                const retYds = p.yds || 0
                if (stat.key === 'avg') {
                  value = retAtt > 0 ? (retYds / retAtt) : 0
                  if (stat.minAtt) {
                    const minReq = mode === 'career' ? stat.minAtt.career : stat.minAtt.season
                    if (retAtt < minReq) value = null
                  }
                }
                break
            }
          } else {
            value = p[stat.field] || 0
          }

          const playerInfo = getPlayerInfo(p.pid)
          return {
            pid: p.pid,
            name: playerInfo.name,
            position: playerInfo.position,
            team: playerInfo.team,
            teamAbbr: playerInfo.teamAbbr,
            teamLogo: playerInfo.teamLogo,
            pictureUrl: playerInfo.pictureUrl,
            value,
            year: p.year,
            years: p.years?.sort((a, b) => a - b) || []
          }
        })

        const isRateStat = stat.format === 'pct' || stat.format === 'avg' || stat.format === 'rating'
        leaderboard = leaderboard
          .filter(p => {
            if (p.value === null || p.value === undefined) return false
            if (!isRateStat && p.value === 0) return false
            return true
          })
          .sort((a, b) => stat.lowerIsBetter ? a.value - b.value : b.value - a.value)
          .slice(0, 10)

        result[catKey][stat.key] = leaderboard
      })
    })

    return result
  }, [currentDynasty, mode])

  const handleCategoryChange = (catKey) => {
    setActiveCategory(catKey)
    setSelectedStat(null)
    localStorage.setItem('leaderboard-category', catKey)
  }

  const handleModeChange = (newMode) => {
    setMode(newMode)
    localStorage.setItem('leaderboard-mode', newMode)
  }

  const formatValue = (value, format) => {
    if (value === null || value === undefined) return '-'
    switch (format) {
      case 'pct': return value.toFixed(1) + '%'
      case 'avg': return value.toFixed(1)
      case 'rating': return value.toFixed(1)
      default: return value.toLocaleString()
    }
  }

  const formatYears = (years) => {
    if (!years || years.length === 0) return '-'
    if (years.length === 1) return years[0].toString()
    return `${years[0]}-${years[years.length - 1]}`
  }

  if (!currentDynasty) return null

  const category = STAT_CATEGORIES[activeCategory]
  const catLeaderboards = leaderboards[activeCategory] || {}
  const hasData = Object.values(catLeaderboards).some(lb => lb && lb.length > 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Dynasty Records</h1>
          <p className="text-sm text-gray-400">
            {mode === 'career' ? 'All-time career leaders' : 'Single season records'}
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="flex rounded-lg overflow-hidden bg-gray-800 p-1">
          <button
            onClick={() => handleModeChange('career')}
            className={`px-4 py-2 font-semibold text-sm rounded-md transition-all ${
              mode === 'career'
                ? 'bg-white text-gray-900'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Career
          </button>
          <button
            onClick={() => handleModeChange('season')}
            className={`px-4 py-2 font-semibold text-sm rounded-md transition-all ${
              mode === 'season'
                ? 'bg-white text-gray-900'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Season
          </button>
        </div>
      </div>

      {/* Category Navigation */}
      <div className="overflow-x-auto -mx-4 px-4 pb-2 scrollbar-hide">
        <div className="flex gap-2 min-w-max">
          {CATEGORY_ORDER.map(catKey => {
            const cat = STAT_CATEGORIES[catKey]
            const isActive = activeCategory === catKey
            return (
              <button
                key={catKey}
                onClick={() => handleCategoryChange(catKey)}
                className={`px-4 py-2.5 rounded-lg font-semibold text-sm whitespace-nowrap transition-all ${
                  isActive
                    ? 'text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                }`}
                style={isActive ? { backgroundColor: cat.color } : {}}
              >
                {cat.name}
              </button>
            )
          })}
        </div>
      </div>

      {/* Main Content */}
      <div className="space-y-4">
        {/* Category Header */}
        <div>
          <h2 className="text-xl font-bold text-white">{category.name} Leaders</h2>
          {category.minNote && (
            <p className="text-xs text-gray-500">{category.minNote}</p>
          )}
        </div>

        {/* Stats Grid */}
        {!hasData ? (
          <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-8 text-center">
            <p className="text-gray-400">No {category.name.toLowerCase()} stats recorded yet</p>
            <p className="text-gray-500 text-sm mt-1">Play some games to start tracking records.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {category.stats.map(stat => {
              const statLeaderboard = catLeaderboards[stat.key] || []
              const isExpanded = selectedStat === stat.key

              return (
                <div
                  key={stat.key}
                  className={`bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl border border-gray-700 overflow-hidden transition-all ${
                    isExpanded ? 'ring-2' : 'hover:border-gray-600'
                  }`}
                  style={isExpanded ? { borderColor: category.color, ringColor: `${category.color}50` } : {}}
                >
                  {/* Stat Header */}
                  <div
                    className="p-4 cursor-pointer"
                    onClick={() => setSelectedStat(isExpanded ? null : stat.key)}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-bold text-white">{stat.label}</h3>
                      <span
                        className="text-xs font-bold px-2.5 py-1 rounded-lg"
                        style={{ backgroundColor: `${category.color}25`, color: category.color }}
                      >
                        {stat.abbr}
                      </span>
                    </div>

                    {/* Top 3 Preview */}
                    {statLeaderboard.length > 0 ? (
                      <div className="space-y-2">
                        {statLeaderboard.slice(0, 3).map((entry, idx) => {
                          const rank = idx + 1
                          const medal = MEDAL_COLORS[rank]

                          return (
                            <div
                              key={mode === 'career' ? entry.pid : `${entry.pid}-${entry.year}`}
                              className={`flex items-center gap-3 p-2 rounded-xl transition-colors ${
                                rank === 1 ? 'bg-gradient-to-r from-yellow-500/10 to-amber-500/10' : 'hover:bg-gray-700/50'
                              }`}
                            >
                              {/* Rank Badge */}
                              <div
                                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0"
                                style={{
                                  background: medal.bg,
                                  color: medal.text,
                                  boxShadow: medal.shadow
                                }}
                              >
                                {rank}
                              </div>

                              {/* Player Photo */}
                              {entry.pictureUrl ? (
                                <img
                                  src={entry.pictureUrl}
                                  alt=""
                                  className="w-8 h-8 rounded-full object-cover flex-shrink-0 ring-2 ring-gray-700"
                                />
                              ) : entry.teamLogo ? (
                                <img
                                  src={entry.teamLogo}
                                  alt=""
                                  className="w-7 h-7 object-contain flex-shrink-0"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-gray-700 flex-shrink-0" />
                              )}

                              {/* Player Info */}
                              <div className="flex-1 min-w-0">
                                <Link
                                  to={`${pathPrefix}/player/${entry.pid}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className={`font-semibold truncate block hover:underline ${
                                    rank === 1 ? 'text-yellow-400' : 'text-white'
                                  }`}
                                >
                                  {entry.name}
                                </Link>
                                <p className="text-xs text-gray-500">
                                  {entry.position && `${entry.position} • `}
                                  {mode === 'career' ? formatYears(entry.years) : entry.year}
                                </p>
                              </div>

                              {/* Value */}
                              <div
                                className={`font-black text-lg flex-shrink-0 ${
                                  rank === 1 ? 'text-yellow-400' : 'text-white'
                                }`}
                              >
                                {formatValue(entry.value, stat.format)}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-4">
                        <p className="text-gray-500 text-sm">No qualifying players</p>
                      </div>
                    )}
                  </div>

                  {/* Expanded View - Rest of Leaderboard */}
                  {isExpanded && statLeaderboard.length > 3 && (
                    <div className="border-t border-gray-700 bg-gray-900/50">
                      {statLeaderboard.slice(3, 10).map((entry, idx) => {
                        const rank = idx + 4

                        return (
                          <div
                            key={mode === 'career' ? entry.pid : `${entry.pid}-${entry.year}`}
                            className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-800 last:border-0 hover:bg-gray-800/50 transition-colors"
                          >
                            <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-400 flex-shrink-0">
                              {rank}
                            </div>

                            {entry.pictureUrl ? (
                              <img src={entry.pictureUrl} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                            ) : entry.teamLogo ? (
                              <img src={entry.teamLogo} alt="" className="w-5 h-5 object-contain flex-shrink-0" />
                            ) : null}

                            <div className="flex-1 min-w-0">
                              <Link
                                to={`${pathPrefix}/player/${entry.pid}`}
                                className="text-sm text-gray-300 hover:text-white hover:underline truncate block"
                              >
                                {entry.name}
                              </Link>
                            </div>

                            <div className="text-sm font-semibold text-gray-400">
                              {formatValue(entry.value, stat.format)}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Expand/Collapse Indicator */}
                  {statLeaderboard.length > 3 && (
                    <div
                      className="px-4 py-2 text-center cursor-pointer hover:bg-gray-800/50 transition-colors border-t border-gray-700"
                      onClick={() => setSelectedStat(isExpanded ? null : stat.key)}
                    >
                      <span className="text-xs font-medium text-gray-500">
                        {isExpanded ? 'Show Less' : `+${statLeaderboard.length - 3} more`}
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
