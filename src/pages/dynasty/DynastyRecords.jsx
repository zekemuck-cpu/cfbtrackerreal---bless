import { useState, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { getTeamLogo, getTeamLogoByTid } from '../../data/teams'
import { getTeamName } from '../../data/teamAbbreviations'
import { getAbbrFromTeamName, getAbbrFromTid } from '../../data/teamRegistry'
import {
  PageHero,
  Card,
  Badge,
  EmptyState,
  Tabs,
} from '../../components/ui'

// Stat category definitions
const STAT_CATEGORIES = {
  passing: {
    name: 'Passing',
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
    stats: [
      { key: 'plays', label: 'All-Purpose Plays', abbr: 'PLY', calculated: true },
      { key: 'yards', label: 'All-Purpose Yards', abbr: 'YDS', calculated: true },
      { key: 'tds', label: 'All-Purpose TDs', abbr: 'TD', calculated: true }
    ]
  },
  defensive: {
    name: 'Defense',
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
    minNote: 'Min 50 punts (career) / 10 punts (season)',
    stats: [
      { key: 'punts', label: 'Punts', abbr: 'P', field: 'punts' },
      { key: 'yards', label: 'Punt Yards', abbr: 'YDS', field: 'yds' },
      { key: 'ypp', label: 'Yards/Punt', abbr: 'Y/P', calculated: true, minAtt: { career: 50, season: 10 }, format: 'avg' }
    ]
  },
  kickReturn: {
    name: 'Kick Returns',
    stats: [
      { key: 'returns', label: 'Kick Returns', abbr: 'RET', field: 'ret' },
      { key: 'yards', label: 'KR Yards', abbr: 'YDS', field: 'yds' },
      { key: 'avg', label: 'Yards/Return', abbr: 'AVG', calculated: true, minAtt: { career: 20, season: 5 }, format: 'avg' },
      { key: 'tds', label: 'KR TDs', abbr: 'TD', field: 'td' }
    ]
  },
  puntReturn: {
    name: 'Punt Returns',
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

  // Get player info. player.team may be a tid (modern format), an abbr
  // (legacy), or a full team name (older legacy). Resolve all three so the
  // leaderboard's team logo / name doesn't break for tid-stored players.
  const getPlayerInfo = (pid) => {
    const player = currentDynasty?.players?.find(p => p.pid === pid)
    const teamsSource = currentDynasty?.teams || currentDynasty?.customTeams
    const playerTeamRaw = player?.team || currentDynasty?.teamName

    // tid-first resolution. Numeric tid → abbr/name/logo via registry.
    let teamAbbr = null
    let teamFullName = null
    let teamLogo = null
    if (typeof playerTeamRaw === 'number' || (typeof playerTeamRaw === 'string' && /^\d+$/.test(playerTeamRaw))) {
      const tid = Number(playerTeamRaw)
      teamAbbr = getAbbrFromTid(teamsSource, tid)
      teamFullName = teamsSource?.[tid]?.name || (teamAbbr ? getTeamName(teamAbbr) : null)
      teamLogo = getTeamLogoByTid(tid, teamsSource)
    }
    // Fall back to abbr / team-name handling for legacy player records.
    if (!teamAbbr) {
      teamAbbr = getAbbrFromTeamName(playerTeamRaw) || playerTeamRaw
    }
    if (!teamFullName) {
      teamFullName = getTeamName(teamAbbr) || playerTeamRaw
    }
    if (!teamLogo) {
      teamLogo = getTeamLogo(teamFullName, teamsSource)
    }

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

  const modeTabs = (
    <Tabs
      variant="pill"
      value={mode}
      onChange={handleModeChange}
      options={[
        { value: 'career', label: 'Career' },
        { value: 'season', label: 'Season' },
      ]}
    />
  )

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Records"
        title="Dynasty Records"
        meta={
          <span>{mode === 'career' ? 'All-time career leaders' : 'Single season records'}</span>
        }
        actions={modeTabs}
      />

      {/* Category Navigation — editorial tab strip, neutral underline on active */}
      <div className="overflow-x-auto -mx-4 px-4 scrollbar-hide">
        <div
          className="flex gap-6 min-w-max"
          style={{ borderBottom: '1px solid var(--surface-4)' }}
        >
          {CATEGORY_ORDER.map(catKey => {
            const cat = STAT_CATEGORIES[catKey]
            const isActive = activeCategory === catKey
            return (
              <button
                key={catKey}
                onClick={() => handleCategoryChange(catKey)}
                className={`relative py-3 whitespace-nowrap transition-colors text-[11px] font-bold uppercase ${
                  isActive ? 'text-txt-primary' : 'text-txt-tertiary hover:text-txt-secondary'
                }`}
                style={{ letterSpacing: '2px' }}
              >
                {cat.name}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 right-0 -bottom-px h-[2px]"
                    style={{ backgroundColor: 'var(--text-primary)' }}
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Category Header — editorial banner */}
      <div className="flex items-end justify-between gap-4 border-b pb-3" style={{ borderColor: 'var(--surface-4)' }}>
        <div>
          <div className="text-[10px] font-bold uppercase text-txt-tertiary" style={{ letterSpacing: '2.5px' }}>
            {mode === 'career' ? 'Career' : 'Single Season'}
          </div>
          <h2
            className="font-black leading-none mt-1"
            style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(2rem, 4vw, 2.75rem)', letterSpacing: '1px' }}
          >
            {category.name} Leaders
          </h2>
        </div>
        {category.minNote && (
          <p className="text-[11px] text-txt-tertiary shrink-0 hidden sm:block" style={{ letterSpacing: '0.5px' }}>
            {category.minNote}
          </p>
        )}
      </div>

      {/* Stats Grid */}
      {!hasData ? (
        <Card>
          <EmptyState
            title={`No ${category.name.toLowerCase()} records yet`}
            message="Play some games to start tracking records."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 stagger-reveal">
          {category.stats.map(stat => {
            const statLeaderboard = catLeaderboards[stat.key] || []
            const isExpanded = selectedStat === stat.key

            return (
              <div
                key={stat.key}
                className="records-card rounded-xl overflow-hidden flex flex-col"
                style={{
                  backgroundColor: 'var(--surface-2)',
                  border: '1px solid var(--rule-soft)',
                  boxShadow: '0 1px 0 rgba(255,255,255,0.03) inset, 0 12px 30px -18px rgba(0,0,0,0.6)'
                }}
              >
                {/* Team-accent top rule — thin, decorative */}
                <div
                  aria-hidden="true"
                  className="h-[2px] w-full"
                  style={{
                    background: 'linear-gradient(90deg, var(--surface-5) 0%, color-mix(in srgb, var(--surface-5) 60%, transparent) 55%, transparent 100%)'
                  }}
                />

                {/* Card header: stat abbr eyebrow + name */}
                <div
                  className="flex items-baseline justify-between px-5 pt-4 pb-3 cursor-pointer select-none"
                  style={{
                    background: 'linear-gradient(180deg, color-mix(in srgb, var(--surface-3) 60%, var(--surface-2)) 0%, var(--surface-2) 100%)',
                    borderBottom: '1px solid var(--rule-soft)'
                  }}
                  onClick={() => setSelectedStat(isExpanded ? null : stat.key)}
                >
                  <div>
                    <div
                      className="text-[10px] font-bold uppercase text-txt-tertiary"
                      style={{ letterSpacing: '2px' }}
                    >
                      {stat.abbr}
                    </div>
                    <h3
                      className="font-black mt-0.5 leading-tight text-txt-primary"
                      style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.35rem', letterSpacing: '1px' }}
                    >
                      {stat.label}
                    </h3>
                  </div>
                </div>

                {/* Top 3 — podium treatment */}
                {statLeaderboard.length > 0 ? (
                  <div>
                    {statLeaderboard.slice(0, 3).map((entry, idx) => {
                      const rank = idx + 1
                      const isFirst = rank === 1

                      return (
                        <div
                          key={mode === 'career' ? entry.pid : `${entry.pid}-${entry.year}`}
                          className="relative flex items-center gap-3 transition-colors"
                          style={{
                            padding: isFirst ? '14px 16px 14px 18px' : '8px 16px 8px 18px',
                            borderTop: idx === 0 ? 'none' : '1px solid var(--rule-soft)',
                            background: isFirst
                              ? 'linear-gradient(90deg, var(--surface-3) 0%, var(--surface-2) 65%)'
                              : 'transparent'
                          }}
                        >
                          {/* Podium accent stripe on #1 */}
                          {isFirst && (
                            <span
                              aria-hidden="true"
                              className="absolute left-0 top-0 bottom-0 w-[3px]"
                              style={{ backgroundColor: 'var(--surface-5)' }}
                            />
                          )}

                          <div
                            className="text-right tabular flex-shrink-0"
                            style={{
                              fontFamily: "'Bebas Neue', sans-serif",
                              fontSize: isFirst ? '1.4rem' : '1rem',
                              letterSpacing: '0.5px',
                              lineHeight: 1,
                              width: isFirst ? '1.75rem' : '1.25rem',
                              color: isFirst ? 'var(--text-primary)' : 'var(--text-tertiary)',
                              opacity: isFirst ? 1 : 0.85
                            }}
                          >
                            {rank}
                          </div>

                          {entry.pictureUrl ? (
                            <img
                              src={entry.pictureUrl}
                              alt=""
                              className={`${isFirst ? 'w-11 h-11' : 'w-8 h-8'} rounded-full object-cover flex-shrink-0 transition-all`}
                              style={{
                                border: isFirst
                                  ? '2px solid var(--surface-5)'
                                  : '1px solid var(--surface-4)'
                              }}
                            />
                          ) : entry.teamLogo ? (
                            <img
                              src={entry.teamLogo}
                              alt=""
                              className={`${isFirst ? 'w-10 h-10' : 'w-7 h-7'} object-contain flex-shrink-0`}
                            />
                          ) : (
                            <div className={`${isFirst ? 'w-11 h-11' : 'w-8 h-8'} rounded-full bg-surface-4 flex-shrink-0`} />
                          )}

                          <div className="flex-1 min-w-0">
                            <Link
                              to={`${pathPrefix}/player/${entry.pid}`}
                              onClick={(e) => e.stopPropagation()}
                              className={`${isFirst ? 'text-[15px]' : 'text-sm'} font-semibold text-txt-primary hover:underline truncate block`}
                            >
                              {entry.name}
                            </Link>
                            <p className="text-[11px] text-txt-tertiary truncate">
                              {entry.position && `${entry.position} · `}
                              {mode === 'career' ? formatYears(entry.years) : entry.year}
                            </p>
                          </div>

                          <div
                            className="tabular flex-shrink-0 text-right text-txt-primary"
                            style={{
                              fontFamily: "'Bebas Neue', sans-serif",
                              fontSize: isFirst ? '2.25rem' : rank === 2 ? '1.35rem' : '1.15rem',
                              fontWeight: isFirst ? 900 : 700,
                              letterSpacing: '0.5px',
                              lineHeight: 1,
                              opacity: isFirst ? 1 : rank === 2 ? 0.8 : 0.65
                            }}
                          >
                            {formatValue(entry.value, stat.format)}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="px-5 py-5">
                    <p className="text-xs text-txt-tertiary">No qualifying players</p>
                  </div>
                )}

                {/* Expanded View - Ranks 4-10 */}
                {isExpanded && statLeaderboard.length > 3 && (
                  <div
                    className="records-expand"
                    style={{
                      borderTop: '1px solid var(--rule-soft)',
                      backgroundColor: 'var(--surface-1)'
                    }}
                  >
                    {statLeaderboard.slice(3, 10).map((entry, idx) => {
                      const rank = idx + 4
                      return (
                        <div
                          key={mode === 'career' ? entry.pid : `${entry.pid}-${entry.year}`}
                          className="flex items-center gap-3 px-5 py-1.5 hover:bg-surface-2 transition-colors"
                          style={idx > 0 ? { borderTop: '1px solid var(--rule-soft)' } : undefined}
                        >
                          <div
                            className="w-5 text-right tabular text-txt-tertiary flex-shrink-0"
                            style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '0.85rem' }}
                          >
                            {rank}
                          </div>

                          {entry.pictureUrl ? (
                            <img src={entry.pictureUrl} alt="" className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
                          ) : entry.teamLogo ? (
                            <img src={entry.teamLogo} alt="" className="w-5 h-5 object-contain flex-shrink-0" />
                          ) : null}

                          <div className="flex-1 min-w-0">
                            <Link
                              to={`${pathPrefix}/player/${entry.pid}`}
                              className="text-[13px] text-txt-secondary hover:text-txt-primary hover:underline truncate block transition-colors"
                            >
                              {entry.name}
                            </Link>
                          </div>

                          <div className="text-[13px] font-semibold text-txt-secondary tabular flex-shrink-0">
                            {formatValue(entry.value, stat.format)}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Expand/Collapse */}
                {statLeaderboard.length > 3 && (
                  <button
                    className="mt-auto w-full px-5 py-2.5 text-center text-[10px] font-bold uppercase text-txt-tertiary hover:text-txt-primary transition-colors"
                    style={{
                      borderTop: '1px solid var(--rule-soft)',
                      letterSpacing: '2.5px',
                      backgroundColor: 'color-mix(in srgb, var(--surface-1) 55%, var(--surface-2))'
                    }}
                    onClick={() => setSelectedStat(isExpanded ? null : stat.key)}
                  >
                    {isExpanded ? 'Show Less ↑' : `+${statLeaderboard.length - 3} More ↓`}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
