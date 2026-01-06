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
        teamRecord: `${wins}-${losses}`,
        headerLink: `/schedule`,
        items: [
          { id: 'record', label: 'Record', text: `${wins}-${losses}` },
          { id: 'pf', label: 'PF', text: `${totalPF}` },
          { id: 'pa', label: 'PA', text: `${totalPA}` },
          { id: 'diff', label: 'Diff', text: totalPF - totalPA >= 0 ? `+${totalPF - totalPA}` : `${totalPF - totalPA}` }
        ]
      })
    }

    // === SECTION 2: Game Log - All games in one scrolling row ===
    if (seasonGames.length > 0) {
      const wins = seasonGames.filter(g => g.result === 'win').length
      const losses = seasonGames.filter(g => g.result === 'loss').length

      const gameLogItems = seasonGames.map((game, idx) => {
        const oppAbbr = getTeamAbbr(game.opponent)
        const isWin = game.result === 'win'
        const locationPrefix = game.location === 'away' ? '@' : 'vs'

        return {
          id: `game-${idx}`,
          team: oppAbbr, // Shows opponent logo
          label: isWin ? 'W' : 'L',
          labelColor: isWin ? '#22c55e' : '#ef4444',
          text: `${locationPrefix} ${oppAbbr} ${game.teamScore}-${game.opponentScore}`,
          link: game.id ? `/game/${game.id}` : null
        }
      })

      result.push({
        label: `${year} GAME LOG`,
        teamLogo: teamAbbr,
        teamRecord: `${wins}-${losses}`,
        headerLink: `/schedule`,
        items: gameLogItems
      })
    }

    // === SECTION 3: Individual Game Recaps with Stats ===
    // Each game with box score stats gets its own detailed section
    seasonGames.forEach((game, idx) => {
      const oppAbbr = getTeamAbbr(game.opponent)
      const isWin = game.result === 'win'

      // Check if user team is home or away based on game location
      const userStats = game.location === 'away' ? game.boxScore?.away : game.boxScore?.home

      // Skip games without box score stats
      if (!userStats) return

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

      // Top passer - show if any passing yards
      const passers = [...(userStats.passing || [])].sort((a, b) => (b.yards || 0) - (a.yards || 0))
      if (passers[0] && (passers[0].yards || 0) > 0) {
        const p = passers[0]
        items.push({
          id: `qb-${idx}`,
          label: p.playerName || 'QB',
          text: `${p.comp || 0}/${p.attempts || 0}, ${p.yards || 0} yds, ${p.tD || 0} TD`
        })
      }

      // Top rusher - show if any rushing yards
      const rushers = [...(userStats.rushing || [])].sort((a, b) => (b.yards || 0) - (a.yards || 0))
      if (rushers[0] && (rushers[0].yards || 0) > 0) {
        const p = rushers[0]
        items.push({
          id: `rb-${idx}`,
          label: p.playerName || 'RB',
          text: `${p.carries || 0} car, ${p.yards || 0} yds${p.tD > 0 ? `, ${p.tD} TD` : ''}`
        })
      }

      // Top receiver - show if any receiving yards
      const receivers = [...(userStats.receiving || [])].sort((a, b) => (b.yards || 0) - (a.yards || 0))
      if (receivers[0] && (receivers[0].yards || 0) > 0) {
        const p = receivers[0]
        items.push({
          id: `wr-${idx}`,
          label: p.playerName || 'WR',
          text: `${p.receptions || 0} rec, ${p.yards || 0} yds${p.tD > 0 ? `, ${p.tD} TD` : ''}`
        })
      }

      // Only add section if we have more than just the score (i.e., we have stats)
      if (items.length > 1) {
        // Get opponent record directly from game object (format: "5-2 (3-1)")
        // Extract just the overall record part (before the parentheses)
        const oppRecordStr = game.opponentRecord?.match(/^[\d]+-[\d]+/)?.[0] || game.opponentRecord || null

        // Calculate record at this point
        const gamesUpToThis = seasonGames.slice(0, idx + 1)
        const winsAtPoint = gamesUpToThis.filter(g => g.result === 'win').length
        const lossesAtPoint = gamesUpToThis.filter(g => g.result === 'loss').length

        result.push({
          label: weekLabel,
          teamLogo: teamAbbr,
          teamRecord: `${winsAtPoint}-${lossesAtPoint}`,
          opponentLogo: oppAbbr,
          opponentRecord: oppRecordStr,
          headerLink: game.id ? `/game/${game.id}` : `/schedule`,
          items
        })
      }
    })

    // === SECTION 4: Scoring Summary ===
    // Show points scored per quarter/half breakdown if we have scoring data
    if (seasonGames.length > 0) {
      const avgPF = Math.round(seasonGames.reduce((sum, g) => sum + (Number(g.teamScore) || 0), 0) / seasonGames.length)
      const avgPA = Math.round(seasonGames.reduce((sum, g) => sum + (Number(g.opponentScore) || 0), 0) / seasonGames.length)
      const biggestWin = seasonGames
        .filter(g => g.result === 'win')
        .sort((a, b) => (Number(b.teamScore) - Number(b.opponentScore)) - (Number(a.teamScore) - Number(a.opponentScore)))[0]
      const closestGame = seasonGames
        .sort((a, b) => Math.abs(Number(a.teamScore) - Number(a.opponentScore)) - Math.abs(Number(b.teamScore) - Number(b.opponentScore)))[0]

      const scoringItems = [
        { id: 'avg-pf', label: 'Avg PF', text: `${avgPF}` },
        { id: 'avg-pa', label: 'Avg PA', text: `${avgPA}` }
      ]

      if (biggestWin) {
        const margin = Number(biggestWin.teamScore) - Number(biggestWin.opponentScore)
        scoringItems.push({
          id: 'biggest-win',
          label: 'Biggest Win',
          text: `+${margin} vs ${getTeamAbbr(biggestWin.opponent)}`
        })
      }

      if (closestGame) {
        const margin = Math.abs(Number(closestGame.teamScore) - Number(closestGame.opponentScore))
        const result = closestGame.result === 'win' ? 'W' : 'L'
        scoringItems.push({
          id: 'closest',
          label: 'Closest',
          text: `${result} by ${margin} vs ${getTeamAbbr(closestGame.opponent)}`
        })
      }

      result.push({
        label: 'SCORING',
        teamLogo: teamAbbr,
        teamRecord: `${seasonGames.filter(g => g.result === 'win').length}-${seasonGames.filter(g => g.result === 'loss').length}`,
        headerLink: `/schedule`,
        items: scoringItems
      })
    }

    // === SECTION: Season Leaders (if we have stats) ===
    const totalWins = seasonGames.filter(g => g.result === 'win').length
    const totalLosses = seasonGames.filter(g => g.result === 'loss').length
    const finalRecord = `${totalWins}-${totalLosses}`
    const leadersSection = generateSeasonLeadersSection(dynasty, teamAbbr, year, finalRecord)
    if (leadersSection) result.push(leadersSection)

    // === SECTION: Awards (Heisman, etc.) ===
    const awardsByYear = dynasty.awardsByYear || {}
    const allAwards = []
    Object.entries(awardsByYear).forEach(([awardYear, yearAwards]) => {
      Object.entries(yearAwards || {}).forEach(([awardName, winner]) => {
        if (winner && typeof winner === 'object' && winner.name) {
          allAwards.push({ year: awardYear, award: awardName, player: winner.name })
        } else if (winner && typeof winner === 'string') {
          allAwards.push({ year: awardYear, award: awardName, player: winner })
        }
      })
    })
    if (allAwards.length > 0) {
      // Show most recent awards first
      const sortedAwards = allAwards.sort((a, b) => Number(b.year) - Number(a.year)).slice(0, 6)
      result.push({
        label: 'AWARDS',
        teamLogo: teamAbbr,
        headerLink: `/awards`,
        items: sortedAwards.map((a, idx) => ({
          id: `award-${idx}`,
          label: a.award,
          text: `${a.player} (${a.year})`
        }))
      })
    }

    // === SECTION: All-Americans ===
    const allAmericansByYear = dynasty.allAmericansByYear || {}
    const allAmericans = []
    Object.entries(allAmericansByYear).forEach(([aaYear, yearData]) => {
      const aaList = yearData?.allAmericans || []
      aaList.forEach(aa => {
        if (aa.name) {
          allAmericans.push({ year: aaYear, name: aa.name, team: aa.team || '1st', position: aa.position })
        }
      })
    })
    if (allAmericans.length > 0) {
      const sortedAA = allAmericans.sort((a, b) => Number(b.year) - Number(a.year)).slice(0, 6)
      result.push({
        label: 'ALL-AMERICANS',
        teamLogo: teamAbbr,
        headerLink: `/all-americans`,
        items: sortedAA.map((aa, idx) => ({
          id: `aa-${idx}`,
          label: aa.name,
          text: `${aa.team} Team ${aa.position} (${aa.year})`
        }))
      })
    }

    // === SECTION: Conference Championships ===
    const ccByYear = dynasty.conferenceChampionshipsByYear || {}
    const confChamps = []
    Object.entries(ccByYear).forEach(([ccYear, ccList]) => {
      if (Array.isArray(ccList)) {
        ccList.forEach(cc => {
          if (cc.winner === teamAbbr || cc.team === teamAbbr) {
            confChamps.push({ year: ccYear, opponent: cc.opponent || cc.loser, conference: cc.conference })
          }
        })
      }
    })
    if (confChamps.length > 0) {
      result.push({
        label: 'CONF CHAMPS',
        teamLogo: teamAbbr,
        headerLink: `/conference-championship-history`,
        items: confChamps.sort((a, b) => Number(b.year) - Number(a.year)).map((cc, idx) => ({
          id: `cc-${idx}`,
          label: cc.year,
          text: cc.conference ? `${cc.conference} Champion` : `vs ${cc.opponent}`
        }))
      })
    }

    // === SECTION: National Championships (CFP) ===
    const cfpByYear = dynasty.cfpResultsByYear || {}
    const nattyWins = []
    Object.entries(cfpByYear).forEach(([cfpYear, cfpData]) => {
      const championship = cfpData?.championship
      if (championship && championship.winner === teamAbbr) {
        nattyWins.push({
          year: cfpYear,
          opponent: championship.team1 === teamAbbr ? championship.team2 : championship.team1,
          score: `${championship.team1Score}-${championship.team2Score}`
        })
      }
    })
    if (nattyWins.length > 0) {
      result.push({
        label: 'NATIONAL CHAMPS',
        teamLogo: teamAbbr,
        headerLink: `/cfp-bracket`,
        items: nattyWins.sort((a, b) => Number(b.year) - Number(a.year)).map((n, idx) => ({
          id: `natty-${idx}`,
          label: n.year,
          labelColor: '#fcd34d',
          text: `vs ${n.opponent} ${n.score}`
        }))
      })
    }

    // === SECTION: Bowl History ===
    const bowlGames = (dynasty.games || []).filter(g =>
      (g.isBowlGame || g.gameType === 'bowl') && g.userTeam === teamAbbr && g.result
    )
    if (bowlGames.length > 0) {
      const sortedBowls = bowlGames.sort((a, b) => Number(b.year) - Number(a.year)).slice(0, 6)
      const bowlWins = bowlGames.filter(g => g.result === 'win').length
      const bowlLosses = bowlGames.filter(g => g.result === 'loss').length
      result.push({
        label: 'BOWL HISTORY',
        teamLogo: teamAbbr,
        teamRecord: `${bowlWins}-${bowlLosses}`,
        headerLink: `/bowl-history`,
        items: sortedBowls.map((b, idx) => ({
          id: `bowl-${idx}`,
          label: b.result === 'win' ? 'W' : 'L',
          labelColor: b.result === 'win' ? '#22c55e' : '#ef4444',
          text: `${b.bowlName || 'Bowl'} ${b.year} vs ${getTeamAbbr(b.opponent)}`
        }))
      })
    }

    // === SECTION: Final Rankings ===
    const finalPolls = dynasty.finalPollsByYear || {}
    const rankings = []
    Object.entries(finalPolls).forEach(([pollYear, pollData]) => {
      if (pollData?.apRank || pollData?.cfpRank) {
        rankings.push({
          year: pollYear,
          ap: pollData.apRank,
          cfp: pollData.cfpRank
        })
      }
    })
    if (rankings.length > 0) {
      const sortedRankings = rankings.sort((a, b) => Number(b.year) - Number(a.year)).slice(0, 6)
      result.push({
        label: 'FINAL RANKINGS',
        teamLogo: teamAbbr,
        headerLink: `/rankings`,
        items: sortedRankings.map((r, idx) => ({
          id: `rank-${idx}`,
          label: r.year,
          text: r.cfp ? `#${r.cfp} CFP${r.ap ? `, #${r.ap} AP` : ''}` : `#${r.ap} AP`
        }))
      })
    }

    // === SECTION: Upcoming Game (if in regular season) ===
    if (dynasty.currentPhase === 'regular_season') {
      const schedule = getCurrentSchedule(dynasty)
      const upcomingGame = schedule?.find(g => g.week === dynasty.currentWeek && !g.result)
      if (upcomingGame) {
        const oppAbbr = getTeamAbbr(upcomingGame.opponent)
        const locationText = upcomingGame.location === 'away' ? '@' : 'vs'
        // Calculate current record from season games
        const currentWins = seasonGames.filter(g => g.result === 'win').length
        const currentLosses = seasonGames.filter(g => g.result === 'loss').length
        result.unshift({
          label: `WEEK ${dynasty.currentWeek}`,
          teamLogo: teamAbbr,
          teamRecord: `${currentWins}-${currentLosses}`,
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
    dynasty?.teamName,
    dynasty?.awardsByYear,
    dynasty?.allAmericansByYear,
    dynasty?.conferenceChampionshipsByYear,
    dynasty?.cfpResultsByYear,
    dynasty?.finalPollsByYear
  ])

  return sections
}

// Season statistical leaders
function generateSeasonLeadersSection(dynasty, teamAbbr, year, teamRecord) {
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
      label: passLeader.name || 'QB',
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
      label: rushLeader.name || 'RB',
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
      label: recLeader.name || 'WR',
      text: `${stats.rec} rec, ${stats.yds.toLocaleString()} yds`,
      link: `/player/${recLeader.pid}`
    })
  }

  if (items.length === 0) return null

  return {
    label: 'SEASON LEADERS',
    teamLogo: teamAbbr,
    teamRecord: teamRecord,
    headerLink: `/team-stats/${teamAbbr}/${year}`,
    items
  }
}

export default useTickerSections
