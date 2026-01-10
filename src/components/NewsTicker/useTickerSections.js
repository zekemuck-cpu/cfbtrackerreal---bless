import { useMemo } from 'react'
import { teamAbbreviations, getAbbreviationFromDisplayName } from '../../data/teamAbbreviations'
import { getCurrentSchedule } from '../../context/DynastyContext'
import { TEAMS, resolveTid } from '../../data/teamRegistry'

// Get abbreviation - handles both full names and abbreviations
function getTeamAbbr(teamIdentifier) {
  if (!teamIdentifier) return null
  if (teamAbbreviations[teamIdentifier]) return teamIdentifier
  return getAbbreviationFromDisplayName(teamIdentifier) || teamIdentifier
}

// Get game order for sorting
function getGameOrder(g) {
  if (g.gameType === 'conference_championship') return 100
  if (g.gameType === 'cfp_first_round') return 101
  if (g.gameType === 'cfp_quarterfinal') return 102
  if (g.gameType === 'cfp_semifinal') return 103
  if (g.gameType === 'cfp_championship') return 104
  if (g.gameType === 'bowl') return 150 + (g.week || 0)
  return g.week || 0
}

/**
 * Simplified ticker sections - returns array of sections with guaranteed valid data
 */
export function useTickerSections(dynasty) {
  return useMemo(() => {
    if (!dynasty) return []

    const sections = []
    const teamAbbr = getTeamAbbr(dynasty.teamName)
    const currentYear = dynasty.currentYear

    // Get current team's games, find most recent season with data
    const currentTeamGames = (dynasty.games || [])
      .filter(g => g.userTeam === teamAbbr && g.result)
      .sort((a, b) => Number(b.year) - Number(a.year))

    // Try current year first, fall back to most recent year with games for this team
    let displayYear = currentYear
    let seasonGames = currentTeamGames.filter(g => Number(g.year) === currentYear)

    if (seasonGames.length === 0 && currentTeamGames.length > 0) {
      displayYear = Number(currentTeamGames[0].year)
      seasonGames = currentTeamGames.filter(g => Number(g.year) === displayYear)
    }

    seasonGames = seasonGames.sort((a, b) => getGameOrder(a) - getGameOrder(b))

    const wins = seasonGames.filter(g => g.result === 'win').length
    const losses = seasonGames.filter(g => g.result === 'loss').length
    const record = `${wins}-${losses}`

    // === 1. SEASON OVERVIEW ===
    if (seasonGames.length > 0) {
      const totalPF = seasonGames.reduce((sum, g) => sum + (Number(g.teamScore) || 0), 0)
      const totalPA = seasonGames.reduce((sum, g) => sum + (Number(g.opponentScore) || 0), 0)
      const diff = totalPF - totalPA

      sections.push({
        type: 'season',
        label: `${displayYear} SEASON`,
        teamLogo: teamAbbr,
        teamRecord: record,
        items: [
          { id: 'record', label: 'Record', text: record },
          { id: 'pf', label: 'PF', text: String(totalPF) },
          { id: 'pa', label: 'PA', text: String(totalPA) },
          { id: 'diff', label: 'Diff', text: diff >= 0 ? `+${diff}` : String(diff) }
        ]
      })
    }

    // === 2. UPCOMING GAME (only if in regular season with upcoming game) ===
    const schedule = getCurrentSchedule(dynasty)
    const upcoming = schedule?.find(g => g.week === dynasty.currentWeek && !g.result)
    if (upcoming?.opponent && dynasty.currentPhase === 'regular_season') {
      const oppAbbr = getTeamAbbr(upcoming.opponent)
      const loc = upcoming.location === 'away' ? '@' : 'vs'
      sections.push({
        type: 'upcoming',
        label: `WEEK ${dynasty.currentWeek}`,
        teamLogo: teamAbbr,
        teamRecord: record,
        opponentLogo: oppAbbr,
        items: [{ id: 'next', label: 'NEXT', labelColor: '#fcd34d', text: `${loc} ${oppAbbr}` }]
      })
    }

    // === 3. GAME LOG ===
    if (seasonGames.length > 0) {
      const items = seasonGames.map((g, i) => {
        const opp = getTeamAbbr(g.opponent)
        const loc = g.location === 'away' ? '@' : 'vs'
        const isWin = g.result === 'win'
        return {
          id: `g${i}`,
          team: opp,
          label: isWin ? 'W' : 'L',
          labelColor: isWin ? '#22c55e' : '#ef4444',
          text: `${loc} ${g.teamScore}-${g.opponentScore}`,
          link: g.id ? `/game/${g.id}` : null
        }
      })
      sections.push({
        type: 'games',
        label: 'GAME LOG',
        teamLogo: teamAbbr,
        teamRecord: record,
        items
      })
    }

    // === 4. LAST GAME RECAP (most recent with box score) ===
    const lastGameWithStats = [...seasonGames]
      .sort((a, b) => getGameOrder(b) - getGameOrder(a))
      .find(g => {
        const stats = g.location === 'away' ? g.boxScore?.away : g.boxScore?.home
        return stats?.passing?.length > 0 || stats?.rushing?.length > 0
      })

    if (lastGameWithStats) {
      const opp = getTeamAbbr(lastGameWithStats.opponent)
      const isWin = lastGameWithStats.result === 'win'
      const stats = lastGameWithStats.location === 'away'
        ? lastGameWithStats.boxScore?.away
        : lastGameWithStats.boxScore?.home

      // Helper to find player pid by name
      const findPlayerPid = (playerName) => {
        if (!playerName || !dynasty.players) return null
        const player = dynasty.players.find(p => p.name === playerName)
        return player?.pid || null
      }

      const items = [{
        id: 'score',
        label: isWin ? 'W' : 'L',
        labelColor: isWin ? '#22c55e' : '#ef4444',
        text: `${lastGameWithStats.teamScore}-${lastGameWithStats.opponentScore}`
      }]

      // Top passer
      const passer = stats?.passing?.sort((a, b) => (b.yards || 0) - (a.yards || 0))[0]
      if (passer?.yards > 0) {
        const pid = findPlayerPid(passer.playerName)
        items.push({
          id: 'qb',
          label: passer.playerName || 'QB',
          text: `${passer.comp || 0}/${passer.attempts || 0}, ${passer.yards} yds, ${passer.tD || 0} TD`,
          link: pid ? `/player/${pid}` : null
        })
      }

      // Top rusher
      const rusher = stats?.rushing?.sort((a, b) => (b.yards || 0) - (a.yards || 0))[0]
      if (rusher?.yards > 0) {
        const pid = findPlayerPid(rusher.playerName)
        items.push({
          id: 'rb',
          label: rusher.playerName || 'RB',
          text: `${rusher.carries || 0} car, ${rusher.yards} yds${rusher.tD > 0 ? `, ${rusher.tD} TD` : ''}`,
          link: pid ? `/player/${pid}` : null
        })
      }

      // Top receiver
      const receiver = stats?.receiving?.sort((a, b) => (b.yards || 0) - (a.yards || 0))[0]
      if (receiver?.yards > 0) {
        const pid = findPlayerPid(receiver.playerName)
        items.push({
          id: 'wr',
          label: receiver.playerName || 'WR',
          text: `${receiver.receptions || 0} rec, ${receiver.yards} yds${receiver.tD > 0 ? `, ${receiver.tD} TD` : ''}`,
          link: pid ? `/player/${pid}` : null
        })
      }

      if (items.length > 1) {
        sections.push({
          type: 'recap',
          label: 'LAST GAME',
          teamLogo: teamAbbr,
          opponentLogo: opp,
          items
        })
      }
    }

    // === 5. SEASON LEADERS ===
    if (dynasty.players?.length > 0) {
      const teamPlayers = dynasty.players.filter(p =>
        p.teamsByYear?.[displayYear] === teamAbbr && p.statsByYear?.[displayYear]
      )
      const items = []

      // Passing leader
      const passLeader = teamPlayers
        .filter(p => (p.statsByYear[displayYear]?.passing?.yds || 0) > 200)
        .sort((a, b) => (b.statsByYear[displayYear]?.passing?.yds || 0) - (a.statsByYear[displayYear]?.passing?.yds || 0))[0]
      if (passLeader) {
        const s = passLeader.statsByYear[displayYear].passing
        items.push({ id: 'pass', label: passLeader.name, text: `${s.yds.toLocaleString()} yds, ${s.td} TD`, link: `/player/${passLeader.pid}` })
      }

      // Rushing leader
      const rushLeader = teamPlayers
        .filter(p => (p.statsByYear[displayYear]?.rushing?.yds || 0) > 100)
        .sort((a, b) => (b.statsByYear[displayYear]?.rushing?.yds || 0) - (a.statsByYear[displayYear]?.rushing?.yds || 0))[0]
      if (rushLeader) {
        const s = rushLeader.statsByYear[displayYear].rushing
        items.push({ id: 'rush', label: rushLeader.name, text: `${s.yds.toLocaleString()} yds, ${s.td} TD`, link: `/player/${rushLeader.pid}` })
      }

      // Receiving leader
      const recLeader = teamPlayers
        .filter(p => (p.statsByYear[displayYear]?.receiving?.yds || 0) > 100)
        .sort((a, b) => (b.statsByYear[displayYear]?.receiving?.yds || 0) - (a.statsByYear[displayYear]?.receiving?.yds || 0))[0]
      if (recLeader) {
        const s = recLeader.statsByYear[displayYear].receiving
        items.push({ id: 'rec', label: recLeader.name, text: `${s.rec} rec, ${s.yds.toLocaleString()} yds`, link: `/player/${recLeader.pid}` })
      }

      if (items.length > 0) {
        sections.push({
          type: 'leaders',
          label: `${displayYear} LEADERS`,
          teamLogo: teamAbbr,
          teamRecord: record,
          items
        })
      }
    }

    // === 6. MY POSTSEASON HISTORY (user's bowls + CFP games with scores) ===
    const postseasonTypes = ['bowl', 'cfp_first_round', 'cfp_quarterfinal', 'cfp_semifinal', 'cfp_championship']
    const postseasonGames = (dynasty.games || [])
      .filter(g => postseasonTypes.includes(g.gameType) && g.userTeam && g.result && g.opponent)
      .sort((a, b) => Number(b.year) - Number(a.year))
      .slice(0, 8)

    if (postseasonGames.length > 0) {
      const psWins = postseasonGames.filter(g => g.result === 'win').length
      const psLosses = postseasonGames.filter(g => g.result === 'loss').length

      const getGameLabel = (g) => {
        if (g.gameType === 'cfp_championship') return 'NATTY'
        if (g.gameType === 'cfp_semifinal') return 'SF'
        if (g.gameType === 'cfp_quarterfinal') return 'QF'
        if (g.gameType === 'cfp_first_round') return 'RD1'
        return g.bowlName || 'Bowl'
      }

      const items = postseasonGames.map((g, i) => {
        const userTeamAbbr = g.userTeam
        const oppAbbr = getTeamAbbr(g.opponent)
        const isWin = g.result === 'win'

        // Determine team order based on location
        let t1, t2, s1, s2
        if (g.location === 'away') {
          t1 = oppAbbr
          t2 = userTeamAbbr
          s1 = g.opponentScore
          s2 = g.teamScore
        } else {
          t1 = userTeamAbbr
          t2 = oppAbbr
          s1 = g.teamScore
          s2 = g.opponentScore
        }

        return {
          id: `ps${i}`,
          label: `${getGameLabel(g)} '${String(g.year).slice(-2)}`,
          team: t1,
          team2: t2,
          score1: s1,
          score2: s2,
          winner: isWin ? userTeamAbbr : oppAbbr,
          link: g.id ? `/game/${g.id}` : null
        }
      })

      sections.push({
        type: 'postseason',
        label: `POSTSEASON (${psWins}-${psLosses})`,
        teamLogo: teamAbbr,
        headerLink: '/bowl-history',
        items
      })
    }

    // === 7. CFP BRACKETS BY YEAR (from games[] array) ===
    const cfpGameTypes = ['cfp_first_round', 'cfp_quarterfinal', 'cfp_semifinal', 'cfp_championship']
    const allCfpGames = (dynasty.games || []).filter(g => cfpGameTypes.includes(g.gameType))
    const cfpYears = [...new Set(allCfpGames.map(g => g.year))].sort((a, b) => Number(b) - Number(a))

    // Helper to determine winner from scores
    const getCfpWinner = (game) => {
      if (game.winner) return game.winner
      // For user games
      if (game.result && game.userTeam) {
        return game.result === 'win' ? game.userTeam : getTeamAbbr(game.opponent)
      }
      // For CPU games
      const s1 = Number(game.team1Score) || 0
      const s2 = Number(game.team2Score) || 0
      return s1 > s2 ? game.team1 : game.team2
    }

    // Helper to get teams and scores from a CFP game (handles both user and CPU games)
    const normalizeCfpGame = (g) => {
      let t1, t2, s1, s2
      if (g.opponent) {
        // User game
        const userTeamAbbr = g.userTeam
        const oppAbbr = getTeamAbbr(g.opponent)
        if (g.location === 'away') {
          t1 = oppAbbr
          t2 = userTeamAbbr
          s1 = g.opponentScore
          s2 = g.teamScore
        } else {
          t1 = userTeamAbbr
          t2 = oppAbbr
          s1 = g.teamScore
          s2 = g.opponentScore
        }
      } else {
        // CPU game
        t1 = g.team1
        t2 = g.team2
        s1 = g.team1Score
        s2 = g.team2Score
      }
      return { t1, t2, s1, s2, winner: getCfpWinner(g) }
    }

    const cfpRoundLabel = (gameType) => {
      if (gameType === 'cfp_first_round') return 'RD1'
      if (gameType === 'cfp_quarterfinal') return 'QF'
      if (gameType === 'cfp_semifinal') return 'SF'
      if (gameType === 'cfp_championship') return 'CHAMP'
      return ''
    }

    cfpYears.forEach(cfpYear => {
      const yearGames = allCfpGames
        .filter(g => g.year === cfpYear)
        .filter(g => {
          // Must have teams defined
          if (g.opponent) return true
          if (g.team1 && g.team2) return true
          return false
        })
        .sort((a, b) => {
          // Sort by round order
          const order = { cfp_first_round: 1, cfp_quarterfinal: 2, cfp_semifinal: 3, cfp_championship: 4 }
          return (order[a.gameType] || 0) - (order[b.gameType] || 0)
        })

      if (yearGames.length > 0) {
        const items = yearGames.map((g, i) => {
          const { t1, t2, s1, s2, winner } = normalizeCfpGame(g)
          const isChamp = g.gameType === 'cfp_championship'
          return {
            id: `cfp${i}`,
            label: cfpRoundLabel(g.gameType),
            labelColor: isChamp ? '#fcd34d' : undefined,
            team: t1,
            team2: t2,
            score1: s1,
            score2: s2,
            winner,
            link: g.id ? `/game/${g.id}` : null
          }
        })

        sections.push({
          type: 'cfp',
          label: `${cfpYear} CFP`,
          headerLink: '/cfp-bracket',
          items
        })
      }
    })

    // === 8. LEAGUE BOWL GAMES BY YEAR ===
    // Get all bowl games (including CPU vs CPU) grouped by year
    const allBowlGames = (dynasty.games || []).filter(g => g.gameType === 'bowl')
    const bowlYears = [...new Set(allBowlGames.map(g => g.year))].sort((a, b) => Number(b) - Number(a))

    bowlYears.forEach(bowlYear => {
      const yearBowls = allBowlGames
        .filter(g => g.year === bowlYear)
        .filter(g => {
          // User games have opponent, CPU games have team1/team2
          if (g.opponent) return true
          if (g.team1 && g.team2) return true
          return false
        })

      if (yearBowls.length > 0) {
        const items = yearBowls.map((g, i) => {
          // Determine team1, team2, and winner
          let t1, t2, s1, s2, winner
          if (g.opponent) {
            // User game
            const userTeamAbbr = g.userTeam
            const oppAbbr = getTeamAbbr(g.opponent)
            if (g.location === 'away') {
              t1 = oppAbbr
              t2 = userTeamAbbr
              s1 = g.opponentScore
              s2 = g.teamScore
            } else {
              t1 = userTeamAbbr
              t2 = oppAbbr
              s1 = g.teamScore
              s2 = g.opponentScore
            }
            winner = g.result === 'win' ? userTeamAbbr : oppAbbr
          } else {
            // CPU vs CPU game
            t1 = g.team1
            t2 = g.team2
            s1 = g.team1Score
            s2 = g.team2Score
            winner = g.winner || (Number(s1) > Number(s2) ? t1 : t2)
          }

          return {
            id: `bowl${i}`,
            label: g.bowlName || 'Bowl',
            team: t1,
            team2: t2,
            score1: s1,
            score2: s2,
            winner,
            link: g.id ? `/game/${g.id}` : null
          }
        })

        sections.push({
          type: 'bowls',
          label: `${bowlYear} BOWLS`,
          headerLink: '/bowl-history',
          items
        })
      }
    })

    // === 9. DYNASTY LEADERBOARDS ===
    // Career leaderboards - one stat from each major category
    if (dynasty.players?.length > 0) {
      const rosterPlayers = dynasty.players.filter(p => !p.isHonorOnly)

      // Aggregate career stats for each player
      const careerStats = {}
      rosterPlayers.forEach(player => {
        if (!player.statsByYear) return
        const pid = player.pid

        if (!careerStats[pid]) {
          careerStats[pid] = {
            pid,
            name: player.name,
            team: player.team,
            passing: { yds: 0, td: 0 },
            rushing: { yds: 0, td: 0 },
            receiving: { yds: 0, td: 0 },
            defense: { sacks: 0, int: 0, tkl: 0 },
            kicking: { fgm: 0 }
          }
        }

        Object.values(player.statsByYear).forEach(yearStats => {
          if (yearStats.passing) {
            careerStats[pid].passing.yds += yearStats.passing.yds || 0
            careerStats[pid].passing.td += yearStats.passing.td || 0
          }
          if (yearStats.rushing) {
            careerStats[pid].rushing.yds += yearStats.rushing.yds || 0
            careerStats[pid].rushing.td += yearStats.rushing.td || 0
          }
          if (yearStats.receiving) {
            careerStats[pid].receiving.yds += yearStats.receiving.yds || 0
            careerStats[pid].receiving.td += yearStats.receiving.td || 0
          }
          if (yearStats.defense) {
            careerStats[pid].defense.sacks += yearStats.defense.sacks || 0
            careerStats[pid].defense.int += yearStats.defense.int || 0
            careerStats[pid].defense.tkl += (yearStats.defense.soloTkl || 0) + (yearStats.defense.astTkl || 0)
          }
          if (yearStats.kicking) {
            careerStats[pid].kicking.fgm += yearStats.kicking.fgm || 0
          }
        })
      })

      const allStats = Object.values(careerStats)

      // Leaderboard definitions: [label, getter, minValue, unit]
      const leaderboards = [
        ['PASS YDS', p => p.passing.yds, 500, 'yds'],
        ['PASS TD', p => p.passing.td, 5, 'TD'],
        ['RUSH YDS', p => p.rushing.yds, 200, 'yds'],
        ['RUSH TD', p => p.rushing.td, 3, 'TD'],
        ['REC YDS', p => p.receiving.yds, 200, 'yds'],
        ['REC TD', p => p.receiving.td, 3, 'TD'],
        ['SACKS', p => p.defense.sacks, 1, ''],
        ['DEF INT', p => p.defense.int, 1, ''],
        ['TACKLES', p => p.defense.tkl, 10, ''],
        ['FG MADE', p => p.kicking.fgm, 1, '']
      ]

      leaderboards.forEach(([label, getter, minValue, unit]) => {
        const leaders = allStats
          .filter(p => getter(p) >= minValue)
          .sort((a, b) => getter(b) - getter(a))
          .slice(0, 5)

        if (leaders.length >= 3) {
          sections.push({
            type: 'leaderboard',
            label: `CAREER ${label}`,
            headerLink: '/dynasty-records',
            items: leaders.map((p, i) => ({
              id: `lb${i}`,
              team: p.team,
              label: `#${i + 1}`,
              text: `${p.name} ${getter(p).toLocaleString()}${unit ? ` ${unit}` : ''}`,
              link: `/player/${p.pid}`
            }))
          })
        }
      })
    }

    // === 10. CAREER SUMMARY - Each season individually ===
    const allUserGames = (dynasty.games || []).filter(g => g.userTeam && g.result)
    if (allUserGames.length > 0) {
      // Group games by year and team
      const seasonMap = {}
      allUserGames.forEach(g => {
        const key = `${g.year}-${g.userTeam}`
        if (!seasonMap[key]) {
          seasonMap[key] = { year: g.year, team: g.userTeam, wins: 0, losses: 0 }
        }
        if (g.result === 'win') seasonMap[key].wins++
        else seasonMap[key].losses++
      })

      // Sort by year descending
      const seasons = Object.values(seasonMap).sort((a, b) => Number(b.year) - Number(a.year))

      if (seasons.length > 0) {
        const totalWins = seasons.reduce((sum, s) => sum + s.wins, 0)
        const totalLosses = seasons.reduce((sum, s) => sum + s.losses, 0)

        const items = seasons.map((s, i) => ({
          id: `s${i}`,
          team: s.team,
          label: String(s.year),
          text: `${s.wins}-${s.losses}`,
          link: `/team/${resolveTid(s.team, dynasty?.teams || TEAMS)}/${s.year}`
        }))

        sections.push({
          type: 'career',
          label: `CAREER (${totalWins}-${totalLosses})`,
          headerLink: '/coach-career',
          items
        })
      }
    }

    return sections
  }, [
    dynasty?.currentYear,
    dynasty?.currentPhase,
    dynasty?.currentWeek,
    dynasty?.games,
    dynasty?.players,
    dynasty?.teamName,
    dynasty?.cfpResultsByYear
  ])
}

export default useTickerSections
