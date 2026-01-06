import { useMemo } from 'react'
import { teamAbbreviations, getAbbreviationFromDisplayName } from '../../data/teamAbbreviations'
import { getCurrentSchedule } from '../../context/DynastyContext'

// Get abbreviation - handles both full names and abbreviations
function getTeamAbbr(teamIdentifier) {
  if (!teamIdentifier) return null
  if (teamAbbreviations[teamIdentifier]) return teamIdentifier
  return getAbbreviationFromDisplayName(teamIdentifier) || teamIdentifier
}

export function useTickerSections(dynasty) {
  const sections = useMemo(() => {
    if (!dynasty) return []

    const result = []
    const teamAbbr = getTeamAbbr(dynasty.teamName)
    const year = dynasty.currentYear

    // Get all user games for this season, sorted by week (chronological order)
    const seasonGames = (dynasty.games || [])
      .filter(g => g.userTeam === teamAbbr && Number(g.year) === year && g.result)
      .sort((a, b) => {
        // Sort by game order: regular season weeks, then postseason
        const getOrder = (g) => {
          if (g.isConferenceChampionship || g.gameType === 'conference_championship') return 100
          if (g.isCFPFirstRound || g.gameType === 'cfp_first_round') return 101
          if (g.isCFPQuarterfinal || g.gameType === 'cfp_quarterfinal') return 102
          if (g.isCFPSemifinal || g.gameType === 'cfp_semifinal') return 103
          if (g.isCFPChampionship || g.gameType === 'cfp_championship') return 104
          if (g.isBowlGame || g.gameType === 'bowl') return 150 + (g.week || 0)
          return g.week || 0
        }
        return getOrder(a) - getOrder(b)
      })

    // === SECTION 1: Season Overview ===
    if (seasonGames.length > 0) {
      const wins = seasonGames.filter(g => g.result === 'win').length
      const losses = seasonGames.filter(g => g.result === 'loss').length
      const totalPF = seasonGames.reduce((sum, g) => sum + (Number(g.teamScore) || 0), 0)
      const totalPA = seasonGames.reduce((sum, g) => sum + (Number(g.opponentScore) || 0), 0)

      result.push({
        label: `${year} SEASON`,
        teamLogo: teamAbbr,
        headerLink: `/schedule`,
        items: [
          { id: 'record', label: 'Record', text: `${wins}-${losses}` },
          { id: 'pf', label: 'PF', text: `${totalPF}` },
          { id: 'pa', label: 'PA', text: `${totalPA}` },
          { id: 'diff', label: 'Diff', text: totalPF - totalPA >= 0 ? `+${totalPF - totalPA}` : `${totalPF - totalPA}` }
        ]
      })
    }

    // === SECTIONS 2+: Individual Game Recaps ===
    // Each game gets its own section showing score + key stats
    seasonGames.forEach((game, idx) => {
      const oppAbbr = getTeamAbbr(game.opponent)
      const isWin = game.result === 'win'
      const items = []

      // Get week label
      let weekLabel = `WK ${game.week}`
      if (game.isConferenceChampionship || game.gameType === 'conference_championship') {
        weekLabel = 'CONF CHAMP'
      } else if (game.isCFPFirstRound || game.gameType === 'cfp_first_round') {
        weekLabel = 'CFP RD 1'
      } else if (game.isCFPQuarterfinal || game.gameType === 'cfp_quarterfinal') {
        weekLabel = 'CFP QF'
      } else if (game.isCFPSemifinal || game.gameType === 'cfp_semifinal') {
        weekLabel = 'CFP SEMI'
      } else if (game.isCFPChampionship || game.gameType === 'cfp_championship') {
        weekLabel = 'NATL CHAMP'
      } else if (game.isBowlGame || game.gameType === 'bowl') {
        weekLabel = game.bowlName || 'BOWL'
      }

      // Score item - always first
      items.push({
        id: `score-${idx}`,
        label: isWin ? 'W' : 'L',
        labelColor: isWin ? '#22c55e' : '#ef4444',
        text: `${game.teamScore}-${game.opponentScore}`
      })

      // If box score exists, add player stats
      if (game.boxScore?.home) {
        const homeStats = game.boxScore.home

        // Top passer
        const passers = [...(homeStats.passing || [])].sort((a, b) => (b.yards || 0) - (a.yards || 0))
        if (passers[0] && (passers[0].yards || 0) > 50) {
          const p = passers[0]
          items.push({
            id: `qb-${idx}`,
            label: p.playerName?.split(' ').pop() || 'QB',
            labelColor: '#60a5fa',
            text: `${p.comp || 0}/${p.attempts || 0}, ${p.yards || 0} yds, ${p.tD || 0} TD`
          })
        }

        // Top rusher
        const rushers = [...(homeStats.rushing || [])].sort((a, b) => (b.yards || 0) - (a.yards || 0))
        if (rushers[0] && (rushers[0].yards || 0) > 20) {
          const p = rushers[0]
          items.push({
            id: `rb-${idx}`,
            label: p.playerName?.split(' ').pop() || 'RB',
            labelColor: '#a78bfa',
            text: `${p.carries || 0} car, ${p.yards || 0} yds${p.tD > 0 ? `, ${p.tD} TD` : ''}`
          })
        }

        // Top receiver
        const receivers = [...(homeStats.receiving || [])].sort((a, b) => (b.yards || 0) - (a.yards || 0))
        if (receivers[0] && (receivers[0].yards || 0) > 20) {
          const p = receivers[0]
          items.push({
            id: `wr-${idx}`,
            label: p.playerName?.split(' ').pop() || 'WR',
            labelColor: '#f472b6',
            text: `${p.receptions || 0} rec, ${p.yards || 0} yds${p.tD > 0 ? `, ${p.tD} TD` : ''}`
          })
        }
      }

      result.push({
        label: weekLabel,
        teamLogo: teamAbbr,
        opponentLogo: oppAbbr,
        headerLink: game.id ? `/game/${game.id}` : `/schedule`,
        items
      })
    })

    // === SECTION: Season Leaders (if we have stats) ===
    const leadersSection = generateSeasonLeadersSection(dynasty, teamAbbr, year)
    if (leadersSection) result.push(leadersSection)

    // === SECTION: Upcoming Game (if in regular season) ===
    if (dynasty.currentPhase === 'regular_season') {
      const schedule = getCurrentSchedule(dynasty)
      const upcomingGame = schedule?.find(g => g.week === dynasty.currentWeek && !g.result)
      if (upcomingGame) {
        const oppAbbr = getTeamAbbr(upcomingGame.opponent)
        const locationText = upcomingGame.location === 'away' ? '@' : 'vs'
        result.unshift({
          label: `WEEK ${dynasty.currentWeek}`,
          teamLogo: teamAbbr,
          opponentLogo: oppAbbr,
          headerLink: `/schedule`,
          items: [{
            id: 'upcoming',
            label: 'NEXT',
            labelColor: '#fcd34d',
            text: `${locationText} ${oppAbbr}`
          }]
        })
      }
    }

    return result
  }, [
    dynasty?.currentYear,
    dynasty?.currentPhase,
    dynasty?.currentWeek,
    dynasty?.games,
    dynasty?.players,
    dynasty?.teamName
  ])

  return sections
}

// Season statistical leaders
function generateSeasonLeadersSection(dynasty, teamAbbr, year) {
  if (!dynasty?.players) return null

  const playersWithStats = dynasty.players.filter(p =>
    p.teamsByYear?.[year] === teamAbbr && p.statsByYear?.[year]
  )

  if (playersWithStats.length === 0) return null

  const items = []

  // Passing leader
  const passLeader = playersWithStats
    .filter(p => (p.statsByYear[year]?.passing?.yds || 0) > 200)
    .sort((a, b) => (b.statsByYear[year]?.passing?.yds || 0) - (a.statsByYear[year]?.passing?.yds || 0))[0]

  if (passLeader) {
    const stats = passLeader.statsByYear[year].passing
    items.push({
      id: 'pass-leader',
      label: passLeader.name?.split(' ').pop() || 'QB',
      labelColor: '#60a5fa',
      text: `${stats.yds.toLocaleString()} yds, ${stats.td} TD`,
      link: `/player/${passLeader.pid}`
    })
  }

  // Rushing leader
  const rushLeader = playersWithStats
    .filter(p => (p.statsByYear[year]?.rushing?.yds || 0) > 100)
    .sort((a, b) => (b.statsByYear[year]?.rushing?.yds || 0) - (a.statsByYear[year]?.rushing?.yds || 0))[0]

  if (rushLeader && rushLeader.pid !== passLeader?.pid) {
    const stats = rushLeader.statsByYear[year].rushing
    items.push({
      id: 'rush-leader',
      label: rushLeader.name?.split(' ').pop() || 'RB',
      labelColor: '#a78bfa',
      text: `${stats.yds.toLocaleString()} yds, ${stats.td} TD`,
      link: `/player/${rushLeader.pid}`
    })
  }

  // Receiving leader
  const recLeader = playersWithStats
    .filter(p => (p.statsByYear[year]?.receiving?.yds || 0) > 100)
    .sort((a, b) => (b.statsByYear[year]?.receiving?.yds || 0) - (a.statsByYear[year]?.receiving?.yds || 0))[0]

  if (recLeader && recLeader.pid !== passLeader?.pid && recLeader.pid !== rushLeader?.pid) {
    const stats = recLeader.statsByYear[year].receiving
    items.push({
      id: 'rec-leader',
      label: recLeader.name?.split(' ').pop() || 'WR',
      labelColor: '#f472b6',
      text: `${stats.rec} rec, ${stats.yds.toLocaleString()} yds`,
      link: `/player/${recLeader.pid}`
    })
  }

  if (items.length === 0) return null

  return {
    label: 'SEASON LEADERS',
    teamLogo: teamAbbr,
    headerLink: `/team-stats/${teamAbbr}/${year}`,
    items
  }
}

export default useTickerSections
