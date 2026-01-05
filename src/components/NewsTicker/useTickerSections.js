import { useMemo, useRef } from 'react'
import { teamAbbreviations, getAbbreviationFromDisplayName } from '../../data/teamAbbreviations'
import { getCurrentSchedule, GAME_TYPES } from '../../context/DynastyContext'

// Fisher-Yates shuffle
function shuffleArray(array) {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

// Get abbreviation - handles both full names and abbreviations
function getTeamAbbr(teamIdentifier) {
  if (!teamIdentifier) return null
  // Check if it's already an abbreviation
  if (teamAbbreviations[teamIdentifier]) return teamIdentifier
  // Try to get abbreviation from display name
  return getAbbreviationFromDisplayName(teamIdentifier) || teamIdentifier
}

// Get team name from abbreviation or name
function getTeamName(teamIdentifier) {
  if (!teamIdentifier) return 'Unknown'
  // If it's an abbreviation, get the full name
  if (teamAbbreviations[teamIdentifier]) {
    return teamAbbreviations[teamIdentifier].name
  }
  // Otherwise return as-is (it's already a name)
  return teamIdentifier
}

// Get short team name (just mascot)
function getShortName(teamIdentifier) {
  if (!teamIdentifier) return 'Unknown'
  // Get full name first
  const full = teamAbbreviations[teamIdentifier]?.name || teamIdentifier
  const parts = full.split(' ')
  return parts.length > 1 ? parts[parts.length - 1] : full
}

export function useTickerSections(dynasty) {
  // Store shuffle order in ref so it persists but is random on mount
  const shuffleOrderRef = useRef(null)

  const sections = useMemo(() => {
    if (!dynasty) return []

    const result = []
    const teamAbbr = getTeamAbbr(dynasty.teamName)
    const year = dynasty.currentYear

    // ===== SECTION: THIS WEEK / LATEST RESULT =====
    const thisWeekSection = generateThisWeekSection(dynasty, teamAbbr, year)
    if (thisWeekSection) result.push(thisWeekSection)

    // ===== SECTION: WIN STREAK =====
    const streakSection = generateStreakSection(dynasty, teamAbbr)
    if (streakSection) result.push(streakSection)

    // ===== SECTION: SEASON RECORD =====
    const seasonSection = generateSeasonSection(dynasty, teamAbbr, year)
    if (seasonSection) result.push(seasonSection)

    // ===== SECTION: THIS SEASON HIGHLIGHTS =====
    const highlightsSection = generateSeasonHighlightsSection(dynasty, teamAbbr, year)
    if (highlightsSection) result.push(highlightsSection)

    // ===== SECTION: HEAD-TO-HEAD =====
    const h2hSection = generateHeadToHeadSection(dynasty, teamAbbr, year)
    if (h2hSection) result.push(h2hSection)

    // ===== SECTION: SEASON LEADERS =====
    const leadersSection = generateSeasonLeadersSection(dynasty, teamAbbr, year)
    if (leadersSection) result.push(leadersSection)

    // ===== SECTION: RECENT GAMES =====
    const recentGamesSection = generateRecentGamesSection(dynasty, teamAbbr, year)
    if (recentGamesSection) result.push(recentGamesSection)

    // ===== SECTION: BIGGEST WINS =====
    const biggestWinsSection = generateBiggestWinsSection(dynasty, teamAbbr)
    if (biggestWinsSection) result.push(biggestWinsSection)

    // ===== SECTION: MILESTONE ALERTS =====
    const milestonesSection = generateMilestonesSection(dynasty, teamAbbr, year)
    if (milestonesSection) result.push(milestonesSection)

    // ===== SECTION: ALL-AMERICANS =====
    const allAmericansSection = generateAllAmericansSection(dynasty)
    if (allAmericansSection) result.push(allAmericansSection)

    // ===== SECTION: ALL-CONFERENCE =====
    const allConferenceSection = generateAllConferenceSection(dynasty)
    if (allConferenceSection) result.push(allConferenceSection)

    // ===== SECTION: CFP CHAMPIONS (historical) =====
    const cfpSection = generateCFPChampionsSection(dynasty)
    if (cfpSection) result.push(cfpSection)

    // ===== SECTION: CFP RESULTS (semis/quarters) =====
    const cfpResultsSection = generateCFPResultsSection(dynasty)
    if (cfpResultsSection) result.push(cfpResultsSection)

    // ===== SECTION: CONFERENCE CHAMPIONS =====
    const confChampSection = generateConferenceChampionsSection(dynasty)
    if (confChampSection) result.push(confChampSection)

    // ===== SECTION: BOWL RESULTS =====
    const bowlSection = generateBowlResultsSection(dynasty, year)
    if (bowlSection) result.push(bowlSection)

    // ===== SECTION: HEISMAN WINNERS =====
    const heismanSection = generateHeismanSection(dynasty)
    if (heismanSection) result.push(heismanSection)

    // ===== SECTION: NFL DRAFT =====
    const draftSection = generateDraftSection(dynasty)
    if (draftSection) result.push(draftSection)

    // ===== SECTION: RECRUITING =====
    const recruitingSection = generateRecruitingSection(dynasty, teamAbbr, year)
    if (recruitingSection) result.push(recruitingSection)

    // ===== SECTION: COACH CAREER =====
    const coachSection = generateCoachSection(dynasty)
    if (coachSection) result.push(coachSection)

    // ===== SECTION: DYNASTY RECORDS (multiple sections) =====
    const recordsSections = generateRecordsSections(dynasty)
    result.push(...recordsSections)

    // Shuffle the sections for random order on startup
    // Use stored shuffle order if available, otherwise create new one
    if (!shuffleOrderRef.current || shuffleOrderRef.current.length !== result.length) {
      shuffleOrderRef.current = shuffleArray(result.map((_, i) => i))
    }

    // Apply shuffle order
    return shuffleOrderRef.current.map(i => result[i]).filter(Boolean)
  }, [
    dynasty?.currentYear,
    dynasty?.currentPhase,
    dynasty?.currentWeek,
    dynasty?.games?.length,
    dynasty?.players?.length,
    dynasty?.awardsByYear,
    dynasty?.cfpResultsByYear,
    dynasty?.recruitsByTeamYear,
    dynasty?.teamName,
    dynasty?.draftResultsByYear,
    dynasty?.conferenceChampionshipsByYear
  ])

  return sections
}

// ===== SECTION GENERATORS =====

function generateThisWeekSection(dynasty, teamAbbr, year) {
  // Find current week's game or most recent game
  const schedule = getCurrentSchedule(dynasty)
  const games = (dynasty.games || []).filter(g =>
    g.userTeam === teamAbbr && Number(g.year) === year
  )

  // Check for upcoming game
  if (dynasty.currentPhase === 'regular_season') {
    const upcomingGame = schedule?.find(g => g.week === dynasty.currentWeek && !g.result)
    if (upcomingGame) {
      const oppAbbr = getTeamAbbr(upcomingGame.opponent)
      const locationText = upcomingGame.location === 'away' ? '@' : 'vs'
      return {
        label: `WEEK ${dynasty.currentWeek}`,
        teamLogo: teamAbbr,
        headerLink: `/schedule`,
        items: [{
          id: 'upcoming',
          team: oppAbbr,
          text: `${teamAbbr} ${locationText} ${oppAbbr}`,
          link: `/team/${oppAbbr}/${year}`
        }]
      }
    }
  }

  // Show most recent result
  const lastGame = games.sort((a, b) => (b.week || 0) - (a.week || 0))[0]
  if (lastGame) {
    const isWin = lastGame.result === 'win'
    const oppAbbr = getTeamAbbr(lastGame.opponent)
    return {
      label: 'LATEST',
      teamLogo: teamAbbr,
      headerLink: `/schedule`,
      items: [{
        id: 'latest',
        team: oppAbbr,
        label: isWin ? 'W' : 'L',
        labelColor: isWin ? '#4ade80' : '#f87171',
        text: `${teamAbbr} ${lastGame.teamScore}-${lastGame.opponentScore} ${oppAbbr}`,
        link: `/team/${oppAbbr}/${year}`
      }]
    }
  }

  return null
}

function generateStreakSection(dynasty, teamAbbr) {
  if (!dynasty?.games) return null

  // Get all user games sorted by year then week
  const userGames = dynasty.games
    .filter(g => g.userTeam === teamAbbr && g.result)
    .sort((a, b) => {
      if (a.year !== b.year) return Number(b.year) - Number(a.year)
      return (b.week || 0) - (a.week || 0)
    })

  if (userGames.length < 3) return null

  // Calculate current streak
  let streakType = userGames[0].result
  let streakCount = 0

  for (const game of userGames) {
    if (game.result === streakType) {
      streakCount++
    } else {
      break
    }
  }

  // Only show if streak is 3+
  if (streakCount < 3) return null

  const isWinStreak = streakType === 'win'

  return {
    label: isWinStreak ? 'WIN STREAK' : 'LOSING STREAK',
    teamLogo: teamAbbr,
    headerLink: `/schedule`,
    items: [{
      id: 'streak',
      label: `${streakCount}`,
      labelColor: isWinStreak ? '#4ade80' : '#f87171',
      text: isWinStreak ? `${streakCount} straight wins` : `${streakCount} straight losses`
    }]
  }
}

function generateSeasonSection(dynasty, teamAbbr, year) {
  const games = (dynasty.games || []).filter(g =>
    g.userTeam === teamAbbr && Number(g.year) === year && g.result
  )

  if (games.length === 0) return null

  const wins = games.filter(g => g.result === 'win').length
  const losses = games.filter(g => g.result === 'loss').length

  // Calculate points
  const totalPointsFor = games.reduce((sum, g) => sum + (Number(g.teamScore) || 0), 0)
  const totalPointsAgainst = games.reduce((sum, g) => sum + (Number(g.opponentScore) || 0), 0)
  const avgPointsFor = Math.round(totalPointsFor / games.length)
  const avgPointsAgainst = Math.round(totalPointsAgainst / games.length)

  return {
    label: `${year} SEASON`,
    teamLogo: teamAbbr,
    headerLink: `/team/${teamAbbr}/${year}`,
    items: [
      { id: 'record', text: `${wins}-${losses}`, label: 'Record' },
      { id: 'ppg', text: `${avgPointsFor}`, label: 'PPG' },
      { id: 'oppg', text: `${avgPointsAgainst}`, label: 'Opp PPG' }
    ]
  }
}

function generateSeasonHighlightsSection(dynasty, teamAbbr, year) {
  const items = []
  const games = (dynasty.games || []).filter(g =>
    g.userTeam === teamAbbr && Number(g.year) === year && g.result
  )

  if (games.length === 0) return null

  const wins = games.filter(g => g.result === 'win').length
  const losses = games.filter(g => g.result === 'loss').length

  // Check for undefeated
  if (wins >= 6 && losses === 0) {
    items.push({
      id: 'undefeated',
      label: 'UNDEFEATED',
      labelColor: '#fcd34d',
      text: `${wins}-0 on the season`
    })
  }

  // Check bowl eligibility (6+ wins)
  if (wins >= 6 && items.length === 0) {
    items.push({
      id: 'bowl-eligible',
      label: 'BOWL ELIGIBLE',
      labelColor: '#4ade80',
      text: `${wins} wins this season`
    })
  }

  // Check for ranked wins (would need rankings data)
  // For now, check for big wins (20+ point margin)
  const blowouts = games.filter(g =>
    g.result === 'win' &&
    (Number(g.teamScore) - Number(g.opponentScore)) >= 20
  )
  if (blowouts.length >= 2) {
    items.push({
      id: 'blowouts',
      text: `${blowouts.length} wins by 20+ points`
    })
  }

  if (items.length === 0) return null

  return {
    label: 'THIS SEASON',
    teamLogo: teamAbbr,
    headerLink: `/team/${teamAbbr}/${year}`,
    items
  }
}

function generateHeadToHeadSection(dynasty, teamAbbr, year) {
  if (dynasty.currentPhase !== 'regular_season') return null

  const schedule = getCurrentSchedule(dynasty)
  if (!schedule) return null

  // Find upcoming opponent
  const upcomingGame = schedule.find(g => g.week === dynasty.currentWeek && !g.result)
  if (!upcomingGame) return null

  const oppAbbr = getTeamAbbr(upcomingGame.opponent)

  // Find all games vs this opponent
  const h2hGames = (dynasty.games || []).filter(g =>
    g.userTeam === teamAbbr &&
    getTeamAbbr(g.opponent) === oppAbbr &&
    g.result
  )

  if (h2hGames.length < 2) return null // Need at least 2 previous meetings

  const h2hWins = h2hGames.filter(g => g.result === 'win').length
  const h2hLosses = h2hGames.filter(g => g.result === 'loss').length

  return {
    label: 'HEAD-TO-HEAD',
    teamLogo: teamAbbr,
    headerLink: `/team/${oppAbbr}`,
    items: [{
      id: 'h2h',
      team: oppAbbr,
      label: `vs ${oppAbbr}`,
      text: `${h2hWins}-${h2hLosses} all-time`
    }]
  }
}

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
      label: `${passLeader.position || 'QB'} ${passLeader.name}`,
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
      label: `${rushLeader.position || 'RB'} ${rushLeader.name}`,
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
      label: `${recLeader.position || 'WR'} ${recLeader.name}`,
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

function generateRecentGamesSection(dynasty, teamAbbr, year) {
  const games = (dynasty.games || [])
    .filter(g => g.userTeam === teamAbbr && Number(g.year) === year && g.result)
    .sort((a, b) => (b.week || 0) - (a.week || 0))
    .slice(0, 4)

  if (games.length < 2) return null

  const items = games.map(game => {
    const isWin = game.result === 'win'
    const oppAbbr = getTeamAbbr(game.opponent)
    return {
      id: `game-${game.week}`,
      team: oppAbbr,
      label: isWin ? 'W' : 'L',
      labelColor: isWin ? '#4ade80' : '#f87171',
      text: `${game.teamScore}-${game.opponentScore} ${oppAbbr}`,
      link: `/team/${oppAbbr}/${year}`
    }
  })

  return {
    label: 'RECENT GAMES',
    teamLogo: teamAbbr,
    headerLink: `/schedule`,
    items
  }
}

function generateBiggestWinsSection(dynasty, teamAbbr) {
  if (!dynasty?.games) return null

  const userWins = dynasty.games
    .filter(g => g.userTeam === teamAbbr && g.result === 'win')
    .map(g => ({
      ...g,
      margin: (Number(g.teamScore) || 0) - (Number(g.opponentScore) || 0)
    }))
    .sort((a, b) => b.margin - a.margin)
    .slice(0, 3)

  if (userWins.length === 0 || userWins[0].margin < 14) return null

  const items = userWins.map((game, i) => {
    const oppAbbr = getTeamAbbr(game.opponent)
    return {
      id: `big-win-${i}`,
      team: oppAbbr,
      label: `+${game.margin}`,
      labelColor: '#4ade80',
      text: `${game.teamScore}-${game.opponentScore} vs ${oppAbbr} '${String(game.year).slice(-2)}`,
      link: `/team/${oppAbbr}/${game.year}`
    }
  })

  return {
    label: 'BIGGEST WINS',
    teamLogo: teamAbbr,
    headerLink: `/coach-career`,
    items
  }
}

function generateMilestonesSection(dynasty, teamAbbr, year) {
  const items = []

  // Coach milestone - career wins
  const userGames = (dynasty.games || []).filter(g => g.userTeam && g.result)
  const totalWins = userGames.filter(g => g.result === 'win').length

  // Check for milestone wins (50, 100, 150, etc)
  const milestones = [200, 150, 100, 75, 50]
  for (const milestone of milestones) {
    if (totalWins >= milestone && totalWins < milestone + 10) {
      items.push({
        id: `coach-${milestone}`,
        label: 'MILESTONE',
        labelColor: '#fcd34d',
        text: `Coach reaches ${milestone} career wins!`,
        link: `/coach-career`
      })
      break
    }
  }

  // Player milestones - check for career stat milestones
  if (dynasty?.players) {
    for (const player of dynasty.players) {
      if (!player.statsByYear || player.isHonorOnly) continue

      const years = Object.values(player.statsByYear)
      const careerPassYds = years.reduce((sum, s) => sum + (s.passing?.yds || 0), 0)
      const careerRushYds = years.reduce((sum, s) => sum + (s.rushing?.yds || 0), 0)
      const careerRecYds = years.reduce((sum, s) => sum + (s.receiving?.yds || 0), 0)

      // Only check players on current roster
      if (player.teamsByYear?.[year] !== teamAbbr) continue

      // Passing milestones
      const passMilestones = [15000, 12000, 10000, 8000]
      for (const m of passMilestones) {
        if (careerPassYds >= m && careerPassYds < m + 1000) {
          items.push({
            id: `pass-${player.pid}-${m}`,
            label: 'MILESTONE',
            labelColor: '#fcd34d',
            text: `${player.position || 'QB'} ${player.name} passes ${m.toLocaleString()} career yards!`,
            link: `/player/${player.pid}`
          })
          break
        }
      }

      // Rushing milestones
      const rushMilestones = [6000, 5000, 4000, 3000]
      for (const m of rushMilestones) {
        if (careerRushYds >= m && careerRushYds < m + 500) {
          items.push({
            id: `rush-${player.pid}-${m}`,
            label: 'MILESTONE',
            labelColor: '#fcd34d',
            text: `${player.position || 'RB'} ${player.name} passes ${m.toLocaleString()} career rush yards!`,
            link: `/player/${player.pid}`
          })
          break
        }
      }

      // Receiving milestones
      const recMilestones = [4000, 3000, 2500, 2000]
      for (const m of recMilestones) {
        if (careerRecYds >= m && careerRecYds < m + 500) {
          items.push({
            id: `rec-${player.pid}-${m}`,
            label: 'MILESTONE',
            labelColor: '#fcd34d',
            text: `${player.position || 'WR'} ${player.name} passes ${m.toLocaleString()} career rec yards!`,
            link: `/player/${player.pid}`
          })
          break
        }
      }

      // Only show first 3 player milestones
      if (items.length >= 4) break
    }
  }

  if (items.length === 0) return null

  return {
    label: 'MILESTONES',
    teamLogo: teamAbbr,
    items: items.slice(0, 4)
  }
}

function generateAllAmericansSection(dynasty) {
  if (!dynasty?.players) return null

  const allAmericans = []

  dynasty.players.forEach(player => {
    if (player.allAmericans && player.allAmericans.length > 0) {
      player.allAmericans.forEach(aa => {
        allAmericans.push({
          name: player.name,
          position: player.position,
          pid: player.pid,
          year: aa.year,
          team: aa.team || '1st Team', // 1st Team, 2nd Team, etc
          school: aa.school
        })
      })
    }
  })

  if (allAmericans.length === 0) return null

  // Sort by year descending
  allAmericans.sort((a, b) => Number(b.year) - Number(a.year))

  const items = allAmericans.slice(0, 4).map((aa, i) => ({
    id: `aa-${i}`,
    team: getTeamAbbr(aa.school),
    label: `'${String(aa.year).slice(-2)} ${aa.team}`,
    labelColor: '#fcd34d',
    text: `${aa.position || ''} ${aa.name}`.trim(),
    link: `/player/${aa.pid}`
  }))

  return {
    label: 'ALL-AMERICANS',
    headerLink: `/all-americans`,
    items
  }
}

function generateAllConferenceSection(dynasty) {
  if (!dynasty?.players) return null

  const allConference = []

  dynasty.players.forEach(player => {
    if (player.allConference && player.allConference.length > 0) {
      player.allConference.forEach(ac => {
        allConference.push({
          name: player.name,
          position: player.position,
          pid: player.pid,
          year: ac.year,
          conference: ac.conference,
          team: ac.team || '1st Team',
          school: ac.school
        })
      })
    }
  })

  if (allConference.length === 0) return null

  // Sort by year descending
  allConference.sort((a, b) => Number(b.year) - Number(a.year))

  const items = allConference.slice(0, 4).map((ac, i) => ({
    id: `ac-${i}`,
    team: getTeamAbbr(ac.school),
    label: `'${String(ac.year).slice(-2)} ${ac.team}`,
    labelColor: '#a78bfa',
    text: `${ac.position || ''} ${ac.name}`.trim(),
    link: `/player/${ac.pid}`
  }))

  return {
    label: 'ALL-CONFERENCE',
    headerLink: `/all-conference`,
    items
  }
}

function generateCFPChampionsSection(dynasty) {
  if (!dynasty?.cfpResultsByYear) return null

  const champions = []

  Object.entries(dynasty.cfpResultsByYear)
    .sort(([a], [b]) => Number(b) - Number(a))
    .forEach(([year, results]) => {
      const championship = results.championship?.[0]
      if (championship?.winner) {
        const winnerAbbr = getTeamAbbr(championship.winner)
        champions.push({
          id: `champ-${year}`,
          team: winnerAbbr,
          label: year,
          text: getShortName(championship.winner),
          link: `/team/${winnerAbbr}/${year}`
        })
      }
    })

  if (champions.length === 0) return null

  return {
    label: 'NATIONAL CHAMPIONS',
    headerLink: `/cfp-bracket`,
    items: champions.slice(0, 5)
  }
}

function generateCFPResultsSection(dynasty) {
  if (!dynasty?.cfpResultsByYear) return null

  const results = []

  Object.entries(dynasty.cfpResultsByYear)
    .sort(([a], [b]) => Number(b) - Number(a))
    .slice(0, 2) // Last 2 years
    .forEach(([year, yearResults]) => {
      // Semifinals
      if (yearResults.semifinals) {
        yearResults.semifinals.forEach((game, i) => {
          if (game?.winner) {
            const winnerAbbr = getTeamAbbr(game.winner)
            const loser = game.team1 === game.winner ? game.team2 : game.team1
            results.push({
              id: `semi-${year}-${i}`,
              team: winnerAbbr,
              label: `'${String(year).slice(-2)} Semi`,
              text: `${getShortName(game.winner)} def. ${getShortName(loser)}`,
              link: `/cfp-bracket`
            })
          }
        })
      }

      // Quarterfinals
      if (yearResults.quarterfinals) {
        yearResults.quarterfinals.forEach((game, i) => {
          if (game?.winner) {
            const winnerAbbr = getTeamAbbr(game.winner)
            const loser = game.team1 === game.winner ? game.team2 : game.team1
            results.push({
              id: `quarter-${year}-${i}`,
              team: winnerAbbr,
              label: `'${String(year).slice(-2)} QF`,
              text: `${getShortName(game.winner)} def. ${getShortName(loser)}`,
              link: `/cfp-bracket`
            })
          }
        })
      }
    })

  if (results.length === 0) return null

  return {
    label: 'CFP RESULTS',
    headerLink: `/cfp-bracket`,
    items: results.slice(0, 4)
  }
}

function generateConferenceChampionsSection(dynasty) {
  // Check games for conference championship type
  const ccGames = (dynasty.games || [])
    .filter(g => g.gameType === GAME_TYPES.CONFERENCE_CHAMPIONSHIP && g.winner)
    .sort((a, b) => Number(b.year) - Number(a.year))
    .slice(0, 5)

  if (ccGames.length === 0) return null

  const items = ccGames.map(game => {
    const winnerAbbr = getTeamAbbr(game.winner)
    return {
      id: `cc-${game.year}-${game.conference || 'conf'}`,
      team: winnerAbbr,
      label: game.conference || `'${String(game.year).slice(-2)}`,
      text: getShortName(game.winner),
      link: `/team/${winnerAbbr}/${game.year}`
    }
  })

  return {
    label: 'CONFERENCE CHAMPS',
    headerLink: `/conference-championship-history`,
    items
  }
}

function generateBowlResultsSection(dynasty, currentYear) {
  if (!dynasty?.games) return null

  const bowlGames = dynasty.games
    .filter(g =>
      g.gameType === GAME_TYPES.BOWL &&
      g.team1Score !== undefined &&
      g.team2Score !== undefined
    )
    .sort((a, b) => Number(b.year) - Number(a.year))
    .slice(0, 4)

  if (bowlGames.length === 0) return null

  const items = bowlGames.map(game => {
    const team1Score = Number(game.team1Score) || 0
    const team2Score = Number(game.team2Score) || 0
    const winner = team1Score > team2Score ? game.team1 : game.team2
    const winnerAbbr = getTeamAbbr(winner)
    const winScore = Math.max(team1Score, team2Score)
    const loseScore = Math.min(team1Score, team2Score)

    return {
      id: `bowl-${game.bowlName}-${game.year}`,
      team: winnerAbbr,
      label: game.bowlName || 'Bowl',
      text: `${getShortName(winner)} ${winScore}-${loseScore}`,
      link: `/team/${winnerAbbr}/${game.year}`
    }
  })

  return {
    label: 'BOWL RESULTS',
    headerLink: `/bowl-history`,
    items
  }
}

function generateHeismanSection(dynasty) {
  if (!dynasty?.awardsByYear) return null

  const heismanWinners = []

  Object.entries(dynasty.awardsByYear)
    .sort(([a], [b]) => Number(b) - Number(a))
    .forEach(([year, awards]) => {
      if (awards.heisman?.player) {
        const teamAbbr = getTeamAbbr(awards.heisman.team)
        heismanWinners.push({
          id: `heisman-${year}`,
          team: teamAbbr,
          label: year,
          text: awards.heisman.player,
          link: `/team/${teamAbbr}/${year}`
        })
      }
    })

  if (heismanWinners.length === 0) return null

  return {
    label: 'HEISMAN TROPHY',
    imageUrl: 'https://i.imgur.com/NwJHIXQ.png',
    headerLink: `/awards`,
    items: heismanWinners.slice(0, 5)
  }
}

function generateDraftSection(dynasty) {
  if (!dynasty?.draftResultsByYear) return null

  const draftPicks = []

  Object.entries(dynasty.draftResultsByYear)
    .sort(([a], [b]) => Number(b) - Number(a))
    .forEach(([year, picks]) => {
      if (Array.isArray(picks)) {
        picks.forEach(pick => {
          if (pick.player) {
            draftPicks.push({
              year,
              ...pick
            })
          }
        })
      }
    })

  if (draftPicks.length === 0) return null

  // Sort by round/pick if available, else by year
  draftPicks.sort((a, b) => {
    if (a.year !== b.year) return Number(b.year) - Number(a.year)
    if (a.round !== b.round) return (a.round || 99) - (b.round || 99)
    return (a.pick || 99) - (b.pick || 99)
  })

  const items = draftPicks.slice(0, 4).map((pick, i) => {
    const teamAbbr = getTeamAbbr(pick.team || pick.school)
    const roundText = pick.round ? `Rd ${pick.round}` : `'${String(pick.year).slice(-2)}`
    return {
      id: `draft-${i}`,
      team: teamAbbr,
      label: roundText,
      labelColor: '#60a5fa',
      text: `${pick.position || ''} ${pick.player}`.trim(),
      link: `/players`
    }
  })

  return {
    label: 'NFL DRAFT',
    headerLink: `/players`,
    items
  }
}

function generateRecruitingSection(dynasty, teamAbbr, year) {
  const recruits = dynasty.recruitsByTeamYear?.[teamAbbr]?.[year] || []

  if (recruits.length === 0) return null

  const fiveStars = recruits.filter(r => r.stars === 5).length
  const fourStars = recruits.filter(r => r.stars === 4).length

  const items = [
    { id: 'total', label: 'Commits', text: `${recruits.length}` }
  ]

  if (fiveStars > 0) {
    items.push({ id: '5star', label: '5-Star', text: `${fiveStars}` })
  }
  if (fourStars > 0) {
    items.push({ id: '4star', label: '4-Star', text: `${fourStars}` })
  }

  // Top recruit
  const topRecruit = recruits.sort((a, b) => (b.stars || 0) - (a.stars || 0))[0]
  if (topRecruit) {
    items.push({
      id: 'top',
      label: `${topRecruit.stars}-Star ${topRecruit.position}`,
      text: topRecruit.name,
      link: `/recruiting`
    })
  }

  return {
    label: `${year} RECRUITING`,
    teamLogo: teamAbbr,
    headerLink: `/recruiting`,
    items
  }
}

function generateCoachSection(dynasty) {
  if (!dynasty?.games) return null

  const userGames = dynasty.games.filter(g => g.userTeam && g.result)
  if (userGames.length < 5) return null

  const wins = userGames.filter(g => g.result === 'win').length
  const losses = userGames.filter(g => g.result === 'loss').length
  const yearsCoached = (dynasty.currentYear || dynasty.startYear) - dynasty.startYear + 1

  const items = [
    { id: 'record', label: 'Career', text: `${wins}-${losses}` },
    { id: 'years', label: 'Seasons', text: `${yearsCoached}` }
  ]

  // Win percentage
  const winPct = ((wins / (wins + losses)) * 100).toFixed(1)
  items.push({ id: 'pct', label: 'Win %', text: `${winPct}%` })

  return {
    label: 'COACH CAREER',
    headerLink: `/coach-career`,
    items
  }
}

function generateRecordsSections(dynasty) {
  if (!dynasty?.players) return []

  const sections = []
  const players = dynasty.players.filter(p => !p.isHonorOnly && p.statsByYear)

  if (players.length === 0) return []

  // Helper to get years active for a player
  const getYearsActive = (player) => {
    const years = Object.keys(player.statsByYear || {}).map(Number).sort()
    if (years.length === 0) return ''
    if (years.length === 1) return `'${String(years[0]).slice(-2)}`
    return `'${String(years[0]).slice(-2)}-'${String(years[years.length - 1]).slice(-2)}`
  }

  // Helper to aggregate career stats
  const getCareerStats = (player) => {
    const years = Object.values(player.statsByYear || {})
    const yearsActive = getYearsActive(player)
    return {
      name: player.name,
      position: player.position,
      pid: player.pid,
      yearsActive,
      // Passing
      passYds: years.reduce((sum, s) => sum + (s.passing?.yds || 0), 0),
      passTD: years.reduce((sum, s) => sum + (s.passing?.td || 0), 0),
      // Rushing
      rushYds: years.reduce((sum, s) => sum + (s.rushing?.yds || 0), 0),
      rushTD: years.reduce((sum, s) => sum + (s.rushing?.td || 0), 0),
      // Receiving
      recYds: years.reduce((sum, s) => sum + (s.receiving?.yds || 0), 0),
      recTD: years.reduce((sum, s) => sum + (s.receiving?.td || 0), 0),
      receptions: years.reduce((sum, s) => sum + (s.receiving?.rec || 0), 0),
      // Defense
      tackles: years.reduce((sum, s) => sum + (s.defense?.soloTkl || 0) + (s.defense?.astTkl || 0), 0),
      sacks: years.reduce((sum, s) => sum + (s.defense?.sacks || 0), 0),
      ints: years.reduce((sum, s) => sum + (s.defense?.int || 0), 0)
    }
  }

  const careerStats = players.map(getCareerStats)

  // Labels for rankings
  const getRankLabel = (index) => {
    if (index === 0) return 'RECORD'
    if (index === 1) return '2ND'
    if (index === 2) return '3RD'
    return `#${index + 1}`
  }

  // ===== CAREER PASSING LEADERS =====
  const passLeaders = careerStats.filter(p => p.passYds > 1000).sort((a, b) => b.passYds - a.passYds).slice(0, 3)
  if (passLeaders.length > 0) {
    sections.push({
      label: 'CAREER PASSING',
      headerLink: `/dynasty-records`,
      items: passLeaders.map((p, i) => ({
        id: `career-pass-${i}`,
        label: getRankLabel(i),
        labelColor: i === 0 ? '#fcd34d' : undefined,
        text: `${p.position || 'QB'} ${p.name} ${p.yearsActive} (${p.passYds.toLocaleString()} yds, ${p.passTD} TD)`,
        link: `/player/${p.pid}`
      }))
    })
  }

  // ===== CAREER RUSHING LEADERS =====
  const rushLeaders = careerStats.filter(p => p.rushYds > 500).sort((a, b) => b.rushYds - a.rushYds).slice(0, 3)
  if (rushLeaders.length > 0) {
    sections.push({
      label: 'CAREER RUSHING',
      headerLink: `/dynasty-records`,
      items: rushLeaders.map((p, i) => ({
        id: `career-rush-${i}`,
        label: getRankLabel(i),
        labelColor: i === 0 ? '#fcd34d' : undefined,
        text: `${p.position || 'RB'} ${p.name} ${p.yearsActive} (${p.rushYds.toLocaleString()} yds, ${p.rushTD} TD)`,
        link: `/player/${p.pid}`
      }))
    })
  }

  // ===== CAREER RECEIVING LEADERS =====
  const recLeaders = careerStats.filter(p => p.recYds > 300).sort((a, b) => b.recYds - a.recYds).slice(0, 3)
  if (recLeaders.length > 0) {
    sections.push({
      label: 'CAREER RECEIVING',
      headerLink: `/dynasty-records`,
      items: recLeaders.map((p, i) => ({
        id: `career-rec-${i}`,
        label: getRankLabel(i),
        labelColor: i === 0 ? '#fcd34d' : undefined,
        text: `${p.position || 'WR'} ${p.name} ${p.yearsActive} (${p.receptions} rec, ${p.recYds.toLocaleString()} yds)`,
        link: `/player/${p.pid}`
      }))
    })
  }

  // ===== CAREER DEFENSE LEADERS =====
  const defLeaders = careerStats.filter(p => p.tackles > 50).sort((a, b) => b.tackles - a.tackles).slice(0, 3)
  if (defLeaders.length > 0) {
    sections.push({
      label: 'CAREER DEFENSE',
      headerLink: `/dynasty-records`,
      items: defLeaders.map((p, i) => ({
        id: `career-def-${i}`,
        label: getRankLabel(i),
        labelColor: i === 0 ? '#fcd34d' : undefined,
        text: `${p.position || 'LB'} ${p.name} ${p.yearsActive} (${p.tackles} tkl, ${p.sacks} sck, ${p.ints} INT)`,
        link: `/player/${p.pid}`
      }))
    })
  }

  // ===== SINGLE SEASON PASSING =====
  const seasonPassLeaders = []
  players.forEach(player => {
    Object.entries(player.statsByYear || {}).forEach(([year, stats]) => {
      if ((stats.passing?.yds || 0) > 1500) {
        seasonPassLeaders.push({
          name: player.name,
          position: player.position,
          pid: player.pid,
          year,
          yds: stats.passing.yds,
          td: stats.passing.td || 0
        })
      }
    })
  })
  seasonPassLeaders.sort((a, b) => b.yds - a.yds)
  if (seasonPassLeaders.length > 0) {
    sections.push({
      label: 'SEASON PASSING',
      headerLink: `/dynasty-records`,
      items: seasonPassLeaders.slice(0, 3).map((p, i) => ({
        id: `season-pass-${i}`,
        label: getRankLabel(i),
        labelColor: i === 0 ? '#fcd34d' : undefined,
        text: `${p.position || 'QB'} ${p.name} '${String(p.year).slice(-2)} (${p.yds.toLocaleString()} yds, ${p.td} TD)`,
        link: `/player/${p.pid}`
      }))
    })
  }

  // ===== SINGLE SEASON RUSHING =====
  const seasonRushLeaders = []
  players.forEach(player => {
    Object.entries(player.statsByYear || {}).forEach(([year, stats]) => {
      if ((stats.rushing?.yds || 0) > 500) {
        seasonRushLeaders.push({
          name: player.name,
          position: player.position,
          pid: player.pid,
          year,
          yds: stats.rushing.yds,
          td: stats.rushing.td || 0
        })
      }
    })
  })
  seasonRushLeaders.sort((a, b) => b.yds - a.yds)
  if (seasonRushLeaders.length > 0) {
    sections.push({
      label: 'SEASON RUSHING',
      headerLink: `/dynasty-records`,
      items: seasonRushLeaders.slice(0, 3).map((p, i) => ({
        id: `season-rush-${i}`,
        label: getRankLabel(i),
        labelColor: i === 0 ? '#fcd34d' : undefined,
        text: `${p.position || 'RB'} ${p.name} '${String(p.year).slice(-2)} (${p.yds.toLocaleString()} yds, ${p.td} TD)`,
        link: `/player/${p.pid}`
      }))
    })
  }

  return sections
}

export default useTickerSections
