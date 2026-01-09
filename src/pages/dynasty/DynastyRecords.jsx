import { useState, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useTeamColors } from '../../hooks/useTeamColors'
import { getTeamLogo } from '../../data/teams'
import { teamAbbreviations, getAbbreviationFromDisplayName, getTeamName } from '../../data/teamAbbreviations'

// Stat category definitions using internal field names
const STAT_CATEGORIES = {
  passing: {
    name: 'Passing',
    minNote: 'Rate stats require minimum 150 pass attempts (career) / 50 attempts (season)',
    stats: [
      { key: 'completions', label: 'Completions', abbr: 'CMP', field: 'cmp' },
      { key: 'attempts', label: 'Pass Attempts', abbr: 'ATT', field: 'att' },
      { key: 'compPct', label: 'Completion %', abbr: 'CMP%', calculated: true, minAtt: { career: 150, season: 50 }, format: 'pct' },
      { key: 'yards', label: 'Passing Yards', abbr: 'YDS', field: 'yds' },
      { key: 'ypa', label: 'Yards/Attempt', abbr: 'Y/A', calculated: true, minAtt: { career: 150, season: 50 }, format: 'avg' },
      { key: 'aypa', label: 'Adj. Yards/Attempt', abbr: 'AY/A', calculated: true, minAtt: { career: 150, season: 50 }, format: 'avg' },
      { key: 'tds', label: 'Passing TDs', abbr: 'TD', field: 'td' },
      { key: 'ints', label: 'Interceptions', abbr: 'INT', field: 'int', lowerIsBetter: true },
      { key: 'rating', label: 'Passer Rating', abbr: 'RTG', calculated: true, minAtt: { career: 150, season: 50 }, format: 'rating' },
      { key: 'ypg', label: 'Yards/Game', abbr: 'Y/G', calculated: true, minAtt: { career: 150, season: 50 }, format: 'avg' },
      { key: 'tdPct', label: 'TD %', abbr: 'TD%', calculated: true, minAtt: { career: 150, season: 50 }, format: 'pct' },
      { key: 'intPct', label: 'INT %', abbr: 'INT%', calculated: true, minAtt: { career: 150, season: 50 }, format: 'pct', lowerIsBetter: true }
    ]
  },
  rushing: {
    name: 'Rushing',
    minNote: 'Rate stats require minimum 100 rush attempts (career) / 25 attempts (season)',
    stats: [
      { key: 'attempts', label: 'Rush Attempts', abbr: 'ATT', field: 'car' },
      { key: 'yards', label: 'Rush Yards', abbr: 'YDS', field: 'yds' },
      { key: 'ypc', label: 'Yards/Carry', abbr: 'Y/C', calculated: true, minAtt: { career: 100, season: 25 }, format: 'avg' },
      { key: 'tds', label: 'Rush TDs', abbr: 'TD', field: 'td' }
    ]
  },
  receiving: {
    name: 'Receiving',
    minNote: 'Rate stats require minimum 50 receptions (career) / 10 receptions (season)',
    stats: [
      { key: 'receptions', label: 'Receptions', abbr: 'REC', field: 'rec' },
      { key: 'yards', label: 'Receiving Yards', abbr: 'YDS', field: 'yds' },
      { key: 'ypr', label: 'Yards/Reception', abbr: 'Y/R', calculated: true, minAtt: { career: 50, season: 10 }, format: 'avg' },
      { key: 'tds', label: 'Receiving TDs', abbr: 'TD', field: 'td' }
    ]
  },
  allPurpose: {
    name: 'All-Purpose',
    minNote: 'Rate stats require minimum 1,500 yards (career) / 300 yards (season)',
    stats: [
      { key: 'plays', label: 'All-Purpose Plays', abbr: 'PLY', calculated: true },
      { key: 'yards', label: 'All-Purpose Yards', abbr: 'YDS', calculated: true },
      { key: 'ypp', label: 'Yards/Play', abbr: 'Y/P', calculated: true, minYds: { career: 1500, season: 300 }, format: 'avg' },
      { key: 'tds', label: 'All-Purpose TDs', abbr: 'TD', calculated: true }
    ]
  },
  defensive: {
    name: 'Defense',
    stats: [
      { key: 'soloTackles', label: 'Solo Tackles', abbr: 'SOLO', field: 'soloTkl' },
      { key: 'astTackles', label: 'Assisted Tackles', abbr: 'AST', field: 'astTkl' },
      { key: 'totalTackles', label: 'Total Tackles', abbr: 'TOT', calculated: true },
      { key: 'tfl', label: 'Tackles for Loss', abbr: 'TFL', field: 'tfl' },
      { key: 'sacks', label: 'Sacks', abbr: 'SCK', field: 'sacks' },
      { key: 'ints', label: 'Interceptions', abbr: 'INT', field: 'int' },
      { key: 'intYards', label: 'INT Return Yards', abbr: 'YDS', field: 'intYds' },
      { key: 'defTds', label: 'Defensive TDs', abbr: 'TD', field: 'td' },
      { key: 'pdef', label: 'Passes Defensed', abbr: 'PD', field: 'pd' },
      { key: 'ff', label: 'Forced Fumbles', abbr: 'FF', field: 'ff' },
      { key: 'fr', label: 'Fumble Recoveries', abbr: 'FR', field: 'fr' },
      { key: 'safeties', label: 'Safeties', abbr: 'SAF', field: 'sfty' }
    ]
  },
  kicking: {
    name: 'Kicking',
    minNote: 'FG% requires minimum 25 attempts (career) / 5 attempts (season)',
    stats: [
      { key: 'xpa', label: 'XP Attempted', abbr: 'XPA', field: 'xpa' },
      { key: 'xpm', label: 'XP Made', abbr: 'XPM', field: 'xpm' },
      { key: 'fga', label: 'FG Attempted', abbr: 'FGA', field: 'fga' },
      { key: 'fgm', label: 'FG Made', abbr: 'FGM', field: 'fgm' },
      { key: 'fgPct', label: 'FG %', abbr: 'FG%', calculated: true, minAtt: { career: 25, season: 5 }, format: 'pct' }
    ]
  },
  punting: {
    name: 'Punting',
    minNote: 'Rate stats require minimum 50 punts (career) / 10 punts (season)',
    stats: [
      { key: 'punts', label: 'Punts', abbr: 'P', field: 'punts' },
      { key: 'yards', label: 'Punt Yards', abbr: 'YDS', field: 'yds' },
      { key: 'ypp', label: 'Yards/Punt', abbr: 'Y/P', calculated: true, minAtt: { career: 50, season: 10 }, format: 'avg' }
    ]
  },
  kickReturn: {
    name: 'Kick Returns',
    minNote: 'Rate stats require minimum 20 returns (career) / 5 returns (season)',
    stats: [
      { key: 'returns', label: 'Kick Returns', abbr: 'RET', field: 'ret' },
      { key: 'yards', label: 'KR Yards', abbr: 'YDS', field: 'yds' },
      { key: 'avg', label: 'Yards/Return', abbr: 'AVG', calculated: true, minAtt: { career: 20, season: 5 }, format: 'avg' },
      { key: 'tds', label: 'KR TDs', abbr: 'TD', field: 'td' }
    ]
  },
  puntReturn: {
    name: 'Punt Returns',
    minNote: 'Rate stats require minimum 20 returns (career) / 5 returns (season)',
    stats: [
      { key: 'returns', label: 'Punt Returns', abbr: 'RET', field: 'ret' },
      { key: 'yards', label: 'PR Yards', abbr: 'YDS', field: 'yds' },
      { key: 'avg', label: 'Yards/Return', abbr: 'AVG', calculated: true, minAtt: { career: 20, season: 5 }, format: 'avg' },
      { key: 'tds', label: 'PR TDs', abbr: 'TD', field: 'td' }
    ]
  }
}

// Category order for tabs
const CATEGORY_ORDER = ['passing', 'rushing', 'receiving', 'allPurpose', 'defensive', 'kicking', 'punting', 'kickReturn', 'puntReturn']

export default function DynastyRecords() {
  const { id: dynastyId } = useParams()
  const { currentDynasty } = useDynasty()
  const pathPrefix = usePathPrefix()
  const teamColors = useTeamColors(currentDynasty?.teamName)

  const [mode, setMode] = useState(() => {
    return localStorage.getItem('leaderboard-mode') || 'career'
  })
  const [activeCategory, setActiveCategory] = useState(() => {
    return localStorage.getItem('leaderboard-category') || 'passing'
  })

  // Get user's roster players (not honor-only)
  const getRosterPlayers = () => {
    if (!currentDynasty?.players) return []
    return currentDynasty.players.filter(p => !p.isHonorOnly)
  }

  // Get player info by PID
  const getPlayerInfo = (pid) => {
    const player = currentDynasty?.players?.find(p => p.pid === pid)
    const playerTeamRaw = player?.team || currentDynasty?.teamName
    const teamAbbr = getAbbreviationFromDisplayName(playerTeamRaw) || playerTeamRaw
    const teamFullName = getTeamName(teamAbbr) || playerTeamRaw
    const teamLogo = getTeamLogo(teamFullName)
    return {
      name: player?.name || `Player ${pid}`,
      position: player?.position || '',
      team: teamFullName,
      teamAbbr,
      teamLogo,
      pictureUrl: player?.pictureUrl || null
    }
  }

  // Calculate leaderboards - reads only from player.statsByYear (internal format)
  const leaderboards = useMemo(() => {
    const rosterPlayers = getRosterPlayers()
    if (rosterPlayers.length === 0) return {}

    // Collect all player stats from player.statsByYear
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
          // Internal format keys: cmp, att, yds, td, int, lng, sacks
          passing: yearStats.passing || null,
          // Internal format keys: car, yds, td, lng, fum
          rushing: yearStats.rushing || null,
          // Internal format keys: rec, yds, td, lng, drops
          receiving: yearStats.receiving || null,
          // Internal format keys: soloTkl, astTkl, sacks, tfl, int, pd, ff, fr, td, sfty
          defensive: yearStats.defense || null,
          // Internal format keys: fgm, fga, xpm, xpa, lng
          kicking: yearStats.kicking || null,
          // Internal format keys: punts, yds, lng, in20, tb
          punting: yearStats.punting || null,
          // Internal format keys: ret, yds, td, lng
          kickReturn: yearStats.kickReturn || null,
          // Internal format keys: ret, yds, td, lng
          puntReturn: yearStats.puntReturn || null
        })
      })
    })

    if (allPlayerStats.length === 0) return {}

    // Aggregate stats for leaderboards
    const aggregateStats = (category) => {
      const playerTotals = {}

      allPlayerStats.forEach(ps => {
        const catStats = ps[category]
        if (!catStats) return

        const playerKey = mode === 'career' ? ps.pid : `${ps.pid}-${ps.year}`

        if (!playerTotals[playerKey]) {
          playerTotals[playerKey] = {
            pid: ps.pid,
            year: ps.year,
            years: [],
            gamesPlayed: 0
          }
        }

        if (!playerTotals[playerKey].years.includes(ps.year)) {
          playerTotals[playerKey].years.push(ps.year)
        }

        if (ps.gamesPlayed) {
          playerTotals[playerKey].gamesPlayed += ps.gamesPlayed
        }

        // Copy all numeric stats from catStats using internal field names
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

        // Internal format: rushing uses car, yds, td
        if (ps.rushing) {
          playerTotals[playerKey].plays += ps.rushing.car || 0
          playerTotals[playerKey].yards += ps.rushing.yds || 0
          playerTotals[playerKey].tds += ps.rushing.td || 0
        }
        // Internal format: receiving uses rec, yds, td
        if (ps.receiving) {
          playerTotals[playerKey].plays += ps.receiving.rec || 0
          playerTotals[playerKey].yards += ps.receiving.yds || 0
          playerTotals[playerKey].tds += ps.receiving.td || 0
        }
        // Internal format: kickReturn uses ret, yds, td
        if (ps.kickReturn) {
          playerTotals[playerKey].plays += ps.kickReturn.ret || 0
          playerTotals[playerKey].yards += ps.kickReturn.yds || 0
          playerTotals[playerKey].tds += ps.kickReturn.td || 0
        }
        // Internal format: puntReturn uses ret, yds, td
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
      let baseStats

      if (catKey === 'allPurpose') {
        baseStats = calcAllPurposeStats()
      } else {
        baseStats = aggregateStats(catKey)
      }

      result[catKey] = {}

      category.stats.forEach(stat => {
        let leaderboard = baseStats.map(p => {
          let value

          if (stat.calculated) {
            switch (catKey) {
              case 'passing':
                // Internal format: cmp, att, yds, td, int
                const att = p.att || 0
                const cmp = p.cmp || 0
                const yds = p.yds || 0
                const tds = p.td || 0
                const ints = p.int || 0

                if (stat.key === 'compPct') value = att > 0 ? (cmp / att * 100) : 0
                else if (stat.key === 'ypa') value = att > 0 ? (yds / att) : 0
                else if (stat.key === 'aypa') value = att > 0 ? ((yds + 20 * tds - 45 * ints) / att) : 0
                else if (stat.key === 'rating') {
                  if (att > 0) {
                    const a = Math.max(0, Math.min(((cmp / att) - 0.3) * 20, 2.375))
                    const b = Math.max(0, Math.min(((yds / att) - 3) * 0.25, 2.375))
                    const c = Math.max(0, Math.min((tds / att) * 20, 2.375))
                    const d = Math.max(0, 2.375 - ((ints / att) * 25))
                    value = ((a + b + c + d) / 6) * 100
                  } else value = 0
                }
                else if (stat.key === 'ypg') value = p.gamesPlayed > 0 ? (yds / p.gamesPlayed) : 0
                else if (stat.key === 'tdPct') value = att > 0 ? (tds / att * 100) : 0
                else if (stat.key === 'intPct') value = att > 0 ? (ints / att * 100) : 0

                if (stat.minAtt) {
                  const minReq = mode === 'career' ? stat.minAtt.career : stat.minAtt.season
                  if (att < minReq) value = null
                }
                break

              case 'rushing':
                // Internal format: car, yds, td
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
                // Internal format: rec, yds, td
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
                else if (stat.key === 'ypp') {
                  value = p.plays > 0 ? (p.yards / p.plays) : 0
                  if (stat.minYds) {
                    const minReq = mode === 'career' ? stat.minYds.career : stat.minYds.season
                    if (p.yards < minReq) value = null
                  }
                }
                break

              case 'defensive':
                // Internal format: soloTkl, astTkl
                if (stat.key === 'totalTackles') {
                  value = (p.soloTkl || 0) + (p.astTkl || 0)
                }
                break

              case 'kicking':
                // Internal format: fga, fgm
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
                // Internal format: punts, yds
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
                // Internal format: ret, yds
                const krRet = p.ret || 0
                const krYds = p.yds || 0
                if (stat.key === 'avg') {
                  value = krRet > 0 ? (krYds / krRet) : 0
                  if (stat.minAtt) {
                    const minReq = mode === 'career' ? stat.minAtt.career : stat.minAtt.season
                    if (krRet < minReq) value = null
                  }
                }
                break

              case 'puntReturn':
                // Internal format: ret, yds
                const prRet = p.ret || 0
                const prYds = p.yds || 0
                if (stat.key === 'avg') {
                  value = prRet > 0 ? (prYds / prRet) : 0
                  if (stat.minAtt) {
                    const minReq = mode === 'career' ? stat.minAtt.career : stat.minAtt.season
                    if (prRet < minReq) value = null
                  }
                }
                break
            }
          } else {
            // Use the internal field name directly
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
          .sort((a, b) => {
            if (stat.lowerIsBetter === true) {
              return a.value - b.value
            }
            return b.value - a.value
          })
          .slice(0, 10)

        result[catKey][stat.key] = leaderboard
      })
    })

    return result
  }, [currentDynasty, mode])

  const handleCategoryChange = (catKey) => {
    setActiveCategory(catKey)
    localStorage.setItem('leaderboard-category', catKey)
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
    <div className="space-y-4">
      {/* Header */}
      <div
        className="rounded-xl p-4 sm:p-6"
        style={{ backgroundColor: teamColors.primary }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white">
              Dynasty Leaderboards
            </h1>
            <p className="text-white/70 text-sm mt-1">
              All-time records and season bests
            </p>
          </div>

          {/* Mode Toggle */}
          <div className="flex rounded-lg overflow-hidden bg-black/20 p-1">
            <button
              onClick={() => { setMode('career'); localStorage.setItem('leaderboard-mode', 'career') }}
              className={`px-4 py-2 font-semibold text-sm rounded-md transition-all ${
                mode === 'career'
                  ? 'bg-white text-gray-900 shadow-md'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              Career
            </button>
            <button
              onClick={() => { setMode('season'); localStorage.setItem('leaderboard-mode', 'season') }}
              className={`px-4 py-2 font-semibold text-sm rounded-md transition-all ${
                mode === 'season'
                  ? 'bg-white text-gray-900 shadow-md'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              Season
            </button>
          </div>
        </div>
      </div>

      {/* Category Tabs - Scrollable on mobile */}
      <div className="overflow-x-auto -mx-4 px-4 pb-2">
        <div className="flex gap-2 min-w-max">
          {CATEGORY_ORDER.map(catKey => {
            const cat = STAT_CATEGORIES[catKey]
            const isActive = activeCategory === catKey
            return (
              <button
                key={catKey}
                onClick={() => handleCategoryChange(catKey)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-all ${
                  isActive
                    ? 'text-white shadow-lg'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
                }`}
                style={isActive ? { backgroundColor: teamColors.primary } : {}}
              >
                {cat.name}
              </button>
            )
          })}
        </div>
      </div>

      {/* Active Category Content */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        {/* Category Header */}
        <div
          className="px-4 py-3 border-b border-gray-700 flex items-center justify-between"
          style={{ backgroundColor: `${teamColors.primary}15` }}
        >
          <h2 className="text-lg font-bold text-white">{category.name}</h2>
          {category.minNote && (
            <p className="text-xs text-gray-400 hidden sm:block">
              {category.minNote}
            </p>
          )}
        </div>

        {/* Mobile min note */}
        {category.minNote && (
          <p className="text-xs text-gray-400 px-4 py-2 border-b border-gray-700 sm:hidden">
            {category.minNote}
          </p>
        )}

        {/* Stats Grid */}
        <div className="p-4">
          {!hasData ? (
            <div className="text-center py-12">
              <p className="text-gray-400">
                No {category.name.toLowerCase()} stats recorded yet
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {category.stats.map(stat => {
                const statLeaderboard = catLeaderboards[stat.key] || []
                const leader = statLeaderboard[0]

                return (
                  <div
                    key={stat.key}
                    className="bg-gray-900/50 rounded-lg border border-gray-700 overflow-hidden"
                  >
                    {/* Stat Header with Leader Highlight */}
                    <div className="p-3 border-b border-gray-700">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold text-gray-300">
                          {stat.label}
                        </h3>
                        <span
                          className="text-xs font-bold px-2 py-0.5 rounded"
                          style={{ backgroundColor: `${teamColors.primary}30`, color: teamColors.primary }}
                        >
                          {stat.abbr}
                        </span>
                      </div>

                      {/* Leader Card */}
                      {leader ? (
                        <div
                          className="rounded-lg p-3 flex items-center gap-3"
                          style={{ backgroundColor: `${teamColors.primary}15` }}
                        >
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
                            style={{ backgroundColor: teamColors.primary }}
                          >
                            1
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {(leader.pictureUrl || leader.teamLogo) && (
                                <img
                                  src={leader.pictureUrl || leader.teamLogo}
                                  alt={leader.pictureUrl ? leader.name : leader.teamAbbr}
                                  className={`flex-shrink-0 ${leader.pictureUrl ? 'w-6 h-6 rounded-full object-cover' : 'w-5 h-5 object-contain'}`}
                                />
                              )}
                              <Link
                                to={`${pathPrefix}/player/${leader.pid}`}
                                className="font-semibold text-white hover:underline truncate"
                              >
                                {leader.name}
                              </Link>
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              {mode === 'career' ? formatYears(leader.years) : (leader.year || 'N/A')}
                              {leader.position && ` • ${leader.position}`}
                            </div>
                          </div>
                          <div
                            className="text-xl font-bold flex-shrink-0"
                            style={{ color: teamColors.primary }}
                          >
                            {formatValue(leader.value, stat.format)}
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-3 text-gray-500 text-sm">
                          No qualifying players
                        </div>
                      )}
                    </div>

                    {/* Rest of Leaderboard */}
                    {statLeaderboard.length > 1 && (
                      <div className="divide-y divide-gray-700/50">
                        {statLeaderboard.slice(1, 5).map((entry, idx) => (
                          <div
                            key={mode === 'career' ? entry.pid : `${entry.pid}-${entry.year}`}
                            className="px-3 py-2 flex items-center gap-3 hover:bg-gray-800/50 transition-colors"
                          >
                            <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-gray-400 text-xs font-medium flex-shrink-0">
                              {idx + 2}
                            </div>
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              {(entry.pictureUrl || entry.teamLogo) && (
                                <img
                                  src={entry.pictureUrl || entry.teamLogo}
                                  alt={entry.pictureUrl ? entry.name : entry.teamAbbr}
                                  className={`flex-shrink-0 ${entry.pictureUrl ? 'w-5 h-5 rounded-full object-cover' : 'w-4 h-4 object-contain'}`}
                                />
                              )}
                              <div className="min-w-0">
                                <Link
                                  to={`${pathPrefix}/player/${entry.pid}`}
                                  className="text-sm text-gray-300 hover:text-white hover:underline truncate block"
                                >
                                  {entry.name}
                                </Link>
                                {mode === 'season' && (
                                  <span className="text-xs text-gray-500">{entry.year || 'N/A'}</span>
                                )}
                              </div>
                            </div>
                            <div className="text-sm font-semibold text-gray-300 flex-shrink-0">
                              {formatValue(entry.value, stat.format)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
