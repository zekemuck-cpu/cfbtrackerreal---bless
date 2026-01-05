import { useMemo } from 'react'
import { teamAbbreviations, getAbbreviationFromDisplayName } from '../../data/teamAbbreviations'
import { getCurrentSchedule, GAME_TYPES } from '../../context/DynastyContext'

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
  const sections = useMemo(() => {
    if (!dynasty) return []

    const result = []
    const teamAbbr = getTeamAbbr(dynasty.teamName)
    const year = dynasty.currentYear

    // ===== SECTION: THIS WEEK / LATEST RESULT =====
    const thisWeekSection = generateThisWeekSection(dynasty, teamAbbr, year)
    if (thisWeekSection) result.push(thisWeekSection)

    // ===== SECTION: SEASON RECORD =====
    const seasonSection = generateSeasonSection(dynasty, teamAbbr, year)
    if (seasonSection) result.push(seasonSection)

    // ===== SECTION: SEASON LEADERS =====
    const leadersSection = generateSeasonLeadersSection(dynasty, teamAbbr, year)
    if (leadersSection) result.push(leadersSection)

    // ===== SECTION: RECENT GAMES =====
    const recentGamesSection = generateRecentGamesSection(dynasty, teamAbbr, year)
    if (recentGamesSection) result.push(recentGamesSection)

    // ===== SECTION: CFP CHAMPIONS (historical) =====
    const cfpSection = generateCFPChampionsSection(dynasty)
    if (cfpSection) result.push(cfpSection)

    // ===== SECTION: BOWL RESULTS =====
    const bowlSection = generateBowlResultsSection(dynasty, year)
    if (bowlSection) result.push(bowlSection)

    // ===== SECTION: HEISMAN WINNERS =====
    const heismanSection = generateHeismanSection(dynasty)
    if (heismanSection) result.push(heismanSection)

    // ===== SECTION: RECRUITING =====
    const recruitingSection = generateRecruitingSection(dynasty, teamAbbr, year)
    if (recruitingSection) result.push(recruitingSection)

    // ===== SECTION: COACH CAREER =====
    const coachSection = generateCoachSection(dynasty)
    if (coachSection) result.push(coachSection)

    // ===== SECTION: DYNASTY RECORDS (multiple sections) =====
    const recordsSections = generateRecordsSections(dynasty)
    result.push(...recordsSections)

    return result
  }, [
    dynasty?.currentYear,
    dynasty?.currentPhase,
    dynasty?.currentWeek,
    dynasty?.games?.length,
    dynasty?.players?.length,
    dynasty?.awardsByYear,
    dynasty?.cfpResultsByYear,
    dynasty?.recruitsByTeamYear,
    dynasty?.teamName
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
      const locationText = upcomingGame.location === 'away' ? '@' :
                          upcomingGame.location === 'neutral' ? 'vs' : 'vs'
      return {
        label: `WEEK ${dynasty.currentWeek}`,
        teamLogo: teamAbbr, // Show user's team logo
        items: [{
          id: 'upcoming',
          team: oppAbbr,
          label: `${dynasty.teamName}`,
          text: `${locationText} ${upcomingGame.opponent}`,
          link: null
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
      teamLogo: teamAbbr, // Show user's team logo
      items: [{
        id: 'latest',
        team: isWin ? teamAbbr : oppAbbr,
        label: isWin ? 'WIN' : 'LOSS',
        labelColor: isWin ? '#4ade80' : '#f87171',
        text: `${dynasty.teamName} ${lastGame.teamScore}, ${lastGame.opponent} ${lastGame.opponentScore}`,
        link: null
      }]
    }
  }

  return null
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
    items: [
      { id: 'record', text: `${wins}-${losses}`, label: 'Record' },
      { id: 'ppg', text: `${avgPointsFor}`, label: 'PPG' },
      { id: 'oppg', text: `${avgPointsAgainst}`, label: 'Opp PPG' }
    ]
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
      label: passLeader.name,
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
      label: rushLeader.name,
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
      label: recLeader.name,
      text: `${stats.rec} rec, ${stats.yds.toLocaleString()} yds`,
      link: `/player/${recLeader.pid}`
    })
  }

  if (items.length === 0) return null

  return {
    label: 'SEASON LEADERS',
    teamLogo: teamAbbr,
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
      text: `${game.teamScore}-${game.opponentScore} ${getShortName(game.opponent)}`
    }
  })

  return {
    label: 'RECENT GAMES',
    teamLogo: teamAbbr,
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
        champions.push({
          id: `champ-${year}`,
          team: championship.winner,
          label: year,
          text: getTeamName(championship.winner),
          link: `/cfp-bracket`
        })
      }
    })

  if (champions.length === 0) return null

  return {
    label: 'NATIONAL CHAMPIONS',
    icon: '🏆',
    items: champions.slice(0, 5)
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
    const winScore = Math.max(team1Score, team2Score)
    const loseScore = Math.min(team1Score, team2Score)

    return {
      id: `bowl-${game.bowlName}-${game.year}`,
      team: winner,
      label: game.bowlName || 'Bowl',
      text: `${getShortName(winner)} ${winScore}-${loseScore}`,
      link: `/bowl-history`
    }
  })

  return {
    label: 'BOWL RESULTS',
    icon: '🎖️',
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
        heismanWinners.push({
          id: `heisman-${year}`,
          team: awards.heisman.team,
          label: year,
          text: awards.heisman.player,
          link: `/awards`
        })
      }
    })

  if (heismanWinners.length === 0) return null

  return {
    label: 'HEISMAN TROPHY',
    imageUrl: 'https://i.imgur.com/NwJHIXQ.png',
    items: heismanWinners.slice(0, 5)
  }
}

function generateRecruitingSection(dynasty, teamAbbr, year) {
  const recruits = dynasty.recruitsByTeamYear?.[teamAbbr]?.[year] || []

  if (recruits.length === 0) return null

  const fiveStars = recruits.filter(r => r.stars === 5).length
  const fourStars = recruits.filter(r => r.stars === 4).length
  const threeStars = recruits.filter(r => r.stars === 3).length

  const items = [
    { id: 'total', label: 'Commits', text: `${recruits.length}` }
  ]

  if (fiveStars > 0) {
    items.push({ id: '5star', label: '5★', text: `${fiveStars}` })
  }
  if (fourStars > 0) {
    items.push({ id: '4star', label: '4★', text: `${fourStars}` })
  }

  // Top recruit
  const topRecruit = recruits.sort((a, b) => (b.stars || 0) - (a.stars || 0))[0]
  if (topRecruit) {
    items.push({
      id: 'top',
      label: `${topRecruit.stars}★ ${topRecruit.position}`,
      text: topRecruit.name,
      link: `/recruiting`
    })
  }

  return {
    label: `${year} RECRUITING`,
    teamLogo: teamAbbr,
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
    icon: '👔',
    items
  }
}

function generateRecordsSections(dynasty) {
  if (!dynasty?.players) return []

  const sections = []
  const players = dynasty.players.filter(p => !p.isHonorOnly && p.statsByYear)

  if (players.length === 0) return []

  // Helper to aggregate career stats
  const getCareerStats = (player) => {
    const years = Object.values(player.statsByYear || {})
    return {
      name: player.name,
      pid: player.pid,
      // Passing
      passYds: years.reduce((sum, s) => sum + (s.passing?.yds || 0), 0),
      passTD: years.reduce((sum, s) => sum + (s.passing?.td || 0), 0),
      passAtt: years.reduce((sum, s) => sum + (s.passing?.att || 0), 0),
      // Rushing
      rushYds: years.reduce((sum, s) => sum + (s.rushing?.yds || 0), 0),
      rushTD: years.reduce((sum, s) => sum + (s.rushing?.td || 0), 0),
      rushAtt: years.reduce((sum, s) => sum + (s.rushing?.car || 0), 0),
      // Receiving
      recYds: years.reduce((sum, s) => sum + (s.receiving?.yds || 0), 0),
      recTD: years.reduce((sum, s) => sum + (s.receiving?.td || 0), 0),
      receptions: years.reduce((sum, s) => sum + (s.receiving?.rec || 0), 0),
      // Defense
      tackles: years.reduce((sum, s) => sum + (s.defense?.soloTkl || 0) + (s.defense?.astTkl || 0), 0),
      sacks: years.reduce((sum, s) => sum + (s.defense?.sacks || 0), 0),
      ints: years.reduce((sum, s) => sum + (s.defense?.int || 0), 0),
      // Kicking
      fgm: years.reduce((sum, s) => sum + (s.kicking?.fgm || 0), 0),
      fga: years.reduce((sum, s) => sum + (s.kicking?.fga || 0), 0)
    }
  }

  const careerStats = players.map(getCareerStats)

  // ===== CAREER PASSING LEADERS =====
  const passLeaders = careerStats.filter(p => p.passYds > 1000).sort((a, b) => b.passYds - a.passYds).slice(0, 3)
  if (passLeaders.length > 0) {
    sections.push({
      label: 'CAREER PASSING',
      icon: '🏈',
      items: passLeaders.map((p, i) => ({
        id: `career-pass-${i}`,
        label: `#${i + 1}`,
        text: `${p.name} (${p.passYds.toLocaleString()} yds, ${p.passTD} TD)`,
        link: `/dynasty-records`
      }))
    })
  }

  // ===== CAREER RUSHING LEADERS =====
  const rushLeaders = careerStats.filter(p => p.rushYds > 500).sort((a, b) => b.rushYds - a.rushYds).slice(0, 3)
  if (rushLeaders.length > 0) {
    sections.push({
      label: 'CAREER RUSHING',
      icon: '🏃',
      items: rushLeaders.map((p, i) => ({
        id: `career-rush-${i}`,
        label: `#${i + 1}`,
        text: `${p.name} (${p.rushYds.toLocaleString()} yds, ${p.rushTD} TD)`,
        link: `/dynasty-records`
      }))
    })
  }

  // ===== CAREER RECEIVING LEADERS =====
  const recLeaders = careerStats.filter(p => p.recYds > 300).sort((a, b) => b.recYds - a.recYds).slice(0, 3)
  if (recLeaders.length > 0) {
    sections.push({
      label: 'CAREER RECEIVING',
      icon: '🙌',
      items: recLeaders.map((p, i) => ({
        id: `career-rec-${i}`,
        label: `#${i + 1}`,
        text: `${p.name} (${p.receptions} rec, ${p.recYds.toLocaleString()} yds)`,
        link: `/dynasty-records`
      }))
    })
  }

  // ===== CAREER DEFENSE LEADERS =====
  const defLeaders = careerStats.filter(p => p.tackles > 50).sort((a, b) => b.tackles - a.tackles).slice(0, 3)
  if (defLeaders.length > 0) {
    sections.push({
      label: 'CAREER DEFENSE',
      icon: '🛡️',
      items: defLeaders.map((p, i) => ({
        id: `career-def-${i}`,
        label: `#${i + 1}`,
        text: `${p.name} (${p.tackles} tkl, ${p.sacks} sck, ${p.ints} INT)`,
        link: `/dynasty-records`
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
      icon: '📊',
      items: seasonPassLeaders.slice(0, 3).map((p, i) => ({
        id: `season-pass-${i}`,
        label: `#${i + 1}`,
        text: `${p.name} '${String(p.year).slice(-2)} (${p.yds.toLocaleString()} yds, ${p.td} TD)`,
        link: `/dynasty-records`
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
      icon: '📊',
      items: seasonRushLeaders.slice(0, 3).map((p, i) => ({
        id: `season-rush-${i}`,
        label: `#${i + 1}`,
        text: `${p.name} '${String(p.year).slice(-2)} (${p.yds.toLocaleString()} yds, ${p.td} TD)`,
        link: `/dynasty-records`
      }))
    })
  }

  return sections
}

export default useTickerSections
