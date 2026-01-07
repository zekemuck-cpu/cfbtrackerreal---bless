import { useMemo } from 'react'
import { teamAbbreviations, getAbbreviationFromDisplayName } from '../../data/teamAbbreviations'
import { getCurrentSchedule } from '../../context/DynastyContext'

// Get abbreviation - handles both full names and abbreviations
function getTeamAbbr(teamIdentifier) {
  if (!teamIdentifier) return null
  if (teamAbbreviations[teamIdentifier]) return teamIdentifier
  return getAbbreviationFromDisplayName(teamIdentifier) || teamIdentifier
}

// Get game order for sorting
function getGameOrder(g) {
  if (g.isConferenceChampionship || g.gameType === 'conference_championship') return 100
  if (g.isCFPFirstRound || g.gameType === 'cfp_first_round') return 101
  if (g.isCFPQuarterfinal || g.gameType === 'cfp_quarterfinal') return 102
  if (g.isCFPSemifinal || g.gameType === 'cfp_semifinal') return 103
  if (g.isCFPChampionship || g.gameType === 'cfp_championship') return 104
  if (g.isBowlGame || g.gameType === 'bowl') return 150 + (g.week || 0)
  return g.week || 0
}

/**
 * Returns flat array of ticker sections, each with a `type` field for tracking
 */
export function useTickerSections(dynasty) {
  const sections = useMemo(() => {
    if (!dynasty) return []

    const result = []
    const teamAbbr = getTeamAbbr(dynasty.teamName)
    const year = dynasty.currentYear

    // Get all user games for this season, sorted by week
    const seasonGames = (dynasty.games || [])
      .filter(g => g.userTeam === teamAbbr && Number(g.year) === year && g.result)
      .sort((a, b) => getGameOrder(a) - getGameOrder(b))

    const wins = seasonGames.filter(g => g.result === 'win').length
    const losses = seasonGames.filter(g => g.result === 'loss').length

    // === SECTION: Upcoming Game (if in regular season) ===
    if (dynasty.currentPhase === 'regular_season') {
      const schedule = getCurrentSchedule(dynasty)
      const upcomingGame = schedule?.find(g => g.week === dynasty.currentWeek && !g.result)
      if (upcomingGame) {
        const oppAbbr = getTeamAbbr(upcomingGame.opponent)
        const locationText = upcomingGame.location === 'away' ? '@' : 'vs'
        result.push({
          type: 'upcoming_game',
          label: `WEEK ${dynasty.currentWeek}`,
          teamLogo: teamAbbr,
          teamRecord: `${wins}-${losses}`,
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

    // === SECTION: Season Overview ===
    if (seasonGames.length > 0) {
      const totalPF = seasonGames.reduce((sum, g) => sum + (Number(g.teamScore) || 0), 0)
      const totalPA = seasonGames.reduce((sum, g) => sum + (Number(g.opponentScore) || 0), 0)

      result.push({
        type: 'season_overview',
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

    // === SECTION: Game Log ===
    if (seasonGames.length > 0) {
      const gameLogItems = seasonGames.map((game, idx) => {
        const oppAbbr = getTeamAbbr(game.opponent)
        const isWin = game.result === 'win'
        const locationPrefix = game.location === 'away' ? '@' : 'vs'

        return {
          id: `game-${idx}`,
          team: oppAbbr,
          label: isWin ? 'W' : 'L',
          labelColor: isWin ? '#22c55e' : '#ef4444',
          text: `${locationPrefix} ${oppAbbr} ${game.teamScore}-${game.opponentScore}`,
          link: game.id ? `/game/${game.id}` : null
        }
      })

      result.push({
        type: 'game_log',
        label: `${year} GAME LOG`,
        teamLogo: teamAbbr,
        teamRecord: `${wins}-${losses}`,
        headerLink: `/schedule`,
        items: gameLogItems
      })
    }

    // === SECTION: Game Recaps - ONLY LAST 3 with box scores ===
    const gamesWithBoxScores = seasonGames
      .filter(g => {
        const userStats = g.location === 'away' ? g.boxScore?.away : g.boxScore?.home
        return userStats && (
          (userStats.passing?.length > 0) ||
          (userStats.rushing?.length > 0) ||
          (userStats.receiving?.length > 0)
        )
      })
      .sort((a, b) => getGameOrder(b) - getGameOrder(a))
      .slice(0, 3)

    gamesWithBoxScores.forEach((game) => {
      const oppAbbr = getTeamAbbr(game.opponent)
      const isWin = game.result === 'win'
      const userStats = game.location === 'away' ? game.boxScore?.away : game.boxScore?.home

      const items = []

      let weekLabel = `WK ${game.week}`
      if (game.isConferenceChampionship || game.gameType === 'conference_championship') weekLabel = 'CONF CHAMP'
      else if (game.isCFPFirstRound || game.gameType === 'cfp_first_round') weekLabel = 'CFP RD 1'
      else if (game.isCFPQuarterfinal || game.gameType === 'cfp_quarterfinal') weekLabel = 'CFP QF'
      else if (game.isCFPSemifinal || game.gameType === 'cfp_semifinal') weekLabel = 'CFP SEMI'
      else if (game.isCFPChampionship || game.gameType === 'cfp_championship') weekLabel = 'NATL CHAMP'
      else if (game.isBowlGame || game.gameType === 'bowl') weekLabel = game.bowlName || 'BOWL'

      items.push({
        id: 'score',
        label: isWin ? 'W' : 'L',
        labelColor: isWin ? '#22c55e' : '#ef4444',
        text: `${game.teamScore}-${game.opponentScore}`
      })

      const passers = [...(userStats.passing || [])].sort((a, b) => (b.yards || 0) - (a.yards || 0))
      if (passers[0] && (passers[0].yards || 0) > 0) {
        const p = passers[0]
        items.push({ id: 'qb', label: p.playerName || 'QB', text: `${p.comp || 0}/${p.attempts || 0}, ${p.yards || 0} yds, ${p.tD || 0} TD` })
      }

      const rushers = [...(userStats.rushing || [])].sort((a, b) => (b.yards || 0) - (a.yards || 0))
      if (rushers[0] && (rushers[0].yards || 0) > 0) {
        const p = rushers[0]
        items.push({ id: 'rb', label: p.playerName || 'RB', text: `${p.carries || 0} car, ${p.yards || 0} yds${p.tD > 0 ? `, ${p.tD} TD` : ''}` })
      }

      const receivers = [...(userStats.receiving || [])].sort((a, b) => (b.yards || 0) - (a.yards || 0))
      if (receivers[0] && (receivers[0].yards || 0) > 0) {
        const p = receivers[0]
        items.push({ id: 'wr', label: p.playerName || 'WR', text: `${p.receptions || 0} rec, ${p.yards || 0} yds${p.tD > 0 ? `, ${p.tD} TD` : ''}` })
      }

      if (items.length > 1) {
        result.push({
          type: 'game_recap',
          label: weekLabel,
          teamLogo: teamAbbr,
          teamRecord: `${wins}-${losses}`,
          opponentLogo: oppAbbr,
          headerLink: game.id ? `/game/${game.id}` : `/schedule`,
          items
        })
      }
    })

    // === SECTION: Scoring Summary ===
    if (seasonGames.length > 0) {
      const avgPF = Math.round(seasonGames.reduce((sum, g) => sum + (Number(g.teamScore) || 0), 0) / seasonGames.length)
      const avgPA = Math.round(seasonGames.reduce((sum, g) => sum + (Number(g.opponentScore) || 0), 0) / seasonGames.length)
      const biggestWin = seasonGames.filter(g => g.result === 'win').sort((a, b) => (Number(b.teamScore) - Number(b.opponentScore)) - (Number(a.teamScore) - Number(a.opponentScore)))[0]
      const closestGame = [...seasonGames].sort((a, b) => Math.abs(Number(a.teamScore) - Number(a.opponentScore)) - Math.abs(Number(b.teamScore) - Number(b.opponentScore)))[0]

      const scoringItems = [
        { id: 'avg-pf', label: 'Avg PF', text: `${avgPF}` },
        { id: 'avg-pa', label: 'Avg PA', text: `${avgPA}` }
      ]
      if (biggestWin) {
        scoringItems.push({ id: 'biggest-win', label: 'Biggest Win', text: `+${Number(biggestWin.teamScore) - Number(biggestWin.opponentScore)} vs ${getTeamAbbr(biggestWin.opponent)}` })
      }
      if (closestGame) {
        scoringItems.push({ id: 'closest', label: 'Closest', text: `${closestGame.result === 'win' ? 'W' : 'L'} by ${Math.abs(Number(closestGame.teamScore) - Number(closestGame.opponentScore))} vs ${getTeamAbbr(closestGame.opponent)}` })
      }

      result.push({
        type: 'scoring_summary',
        label: 'SCORING',
        teamLogo: teamAbbr,
        teamRecord: `${wins}-${losses}`,
        headerLink: `/schedule`,
        items: scoringItems
      })
    }

    // === SECTION: Season Leaders ===
    if (dynasty.players) {
      const playersWithStats = dynasty.players.filter(p => p.teamsByYear?.[year] === teamAbbr && p.statsByYear?.[year])
      const items = []

      const passLeader = playersWithStats.filter(p => (p.statsByYear[year]?.passing?.yds || 0) > 200).sort((a, b) => (b.statsByYear[year]?.passing?.yds || 0) - (a.statsByYear[year]?.passing?.yds || 0))[0]
      if (passLeader) {
        const stats = passLeader.statsByYear[year].passing
        items.push({ id: 'pass-leader', label: passLeader.name || 'QB', text: `${stats.yds.toLocaleString()} yds, ${stats.td} TD`, link: `/player/${passLeader.pid}` })
      }

      const rushLeader = playersWithStats.filter(p => (p.statsByYear[year]?.rushing?.yds || 0) > 100).sort((a, b) => (b.statsByYear[year]?.rushing?.yds || 0) - (a.statsByYear[year]?.rushing?.yds || 0))[0]
      if (rushLeader && rushLeader.pid !== passLeader?.pid) {
        const stats = rushLeader.statsByYear[year].rushing
        items.push({ id: 'rush-leader', label: rushLeader.name || 'RB', text: `${stats.yds.toLocaleString()} yds, ${stats.td} TD`, link: `/player/${rushLeader.pid}` })
      }

      const recLeader = playersWithStats.filter(p => (p.statsByYear[year]?.receiving?.yds || 0) > 100).sort((a, b) => (b.statsByYear[year]?.receiving?.yds || 0) - (a.statsByYear[year]?.receiving?.yds || 0))[0]
      if (recLeader && recLeader.pid !== passLeader?.pid && recLeader.pid !== rushLeader?.pid) {
        const stats = recLeader.statsByYear[year].receiving
        items.push({ id: 'rec-leader', label: recLeader.name || 'WR', text: `${stats.rec} rec, ${stats.yds.toLocaleString()} yds`, link: `/player/${recLeader.pid}` })
      }

      if (items.length > 0) {
        result.push({
          type: 'season_leaders',
          label: 'SEASON LEADERS',
          teamLogo: teamAbbr,
          teamRecord: `${wins}-${losses}`,
          headerLink: `/team-stats/${teamAbbr}/${year}`,
          items
        })
      }
    }

    // === SECTION: Awards ===
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
      const awardItems = allAwards
        .sort((a, b) => Number(b.year) - Number(a.year))
        .slice(0, 6)
        .filter(a => a.player && a.award && a.year)
        .map((a, idx) => ({
          id: `award-${idx}`,
          label: a.award,
          text: `${a.player} (${a.year})`
        }))

      if (awardItems.length > 0) {
        result.push({
          type: 'awards',
          label: 'AWARDS',
          teamLogo: teamAbbr,
          headerLink: `/awards`,
          items: awardItems
        })
      }
    }

    // === SECTION: All-Americans ===
    const allAmericansByYear = dynasty.allAmericansByYear || {}
    const allAmericans = []
    Object.entries(allAmericansByYear).forEach(([aaYear, yearData]) => {
      (yearData?.allAmericans || []).forEach(aa => {
        if (aa.name && aa.position) {
          allAmericans.push({ year: aaYear, name: aa.name, team: aa.team || '1st', position: aa.position })
        }
      })
    })
    if (allAmericans.length > 0) {
      const aaItems = allAmericans
        .sort((a, b) => Number(b.year) - Number(a.year))
        .slice(0, 6)
        .map((aa, idx) => ({
          id: `aa-${idx}`,
          label: aa.name,
          text: `${aa.team} Team ${aa.position} (${aa.year})`
        }))

      if (aaItems.length > 0) {
        result.push({
          type: 'all_americans',
          label: 'ALL-AMERICANS',
          teamLogo: teamAbbr,
          headerLink: `/all-americans`,
          items: aaItems
        })
      }
    }

    // === SECTION: Conference Championships ===
    const ccByYear = dynasty.conferenceChampionshipsByYear || {}
    const confChamps = []
    Object.entries(ccByYear).forEach(([ccYear, ccList]) => {
      if (Array.isArray(ccList)) {
        ccList.forEach(cc => {
          // Only include if we have meaningful data to display
          if (cc.winner && (cc.conference || cc.opponent || cc.loser)) {
            confChamps.push({ year: ccYear, conference: cc.conference, opponent: cc.opponent || cc.loser })
          }
        })
      }
    })
    if (confChamps.length > 0) {
      const ccItems = confChamps
        .sort((a, b) => Number(b.year) - Number(a.year))
        .slice(0, 6)
        .map((cc, idx) => ({
          id: `cc-${idx}`,
          label: cc.year,
          text: cc.conference ? `${cc.conference} Champion` : cc.opponent ? `vs ${cc.opponent}` : null
        }))
        .filter(item => item.text) // Remove items without valid text

      if (ccItems.length > 0) {
        result.push({
          type: 'conference_championships',
          label: 'CONF CHAMPS',
          teamLogo: teamAbbr,
          headerLink: `/conference-championship-history`,
          items: ccItems
        })
      }
    }

    // === SECTION: National Championships ===
    const cfpByYear = dynasty.cfpResultsByYear || {}
    const nattyWins = []
    Object.entries(cfpByYear).forEach(([cfpYear, cfpData]) => {
      const championship = cfpData?.championship
      if (championship?.winner && championship.team1 && championship.team2) {
        nattyWins.push({
          year: cfpYear,
          opponent: championship.team1 === championship.winner ? championship.team2 : championship.team1,
          score: `${championship.team1Score || 0}-${championship.team2Score || 0}`
        })
      }
    })
    if (nattyWins.length > 0) {
      const nattyItems = nattyWins
        .sort((a, b) => Number(b.year) - Number(a.year))
        .filter(n => n.opponent) // Only include if opponent is defined
        .map((n, idx) => ({
          id: `natty-${idx}`,
          label: n.year,
          labelColor: '#fcd34d',
          text: `vs ${n.opponent} ${n.score}`
        }))

      if (nattyItems.length > 0) {
        result.push({
          type: 'national_championships',
          label: 'NATIONAL CHAMPS',
          teamLogo: teamAbbr,
          headerLink: `/cfp-bracket`,
          items: nattyItems
        })
      }
    }

    // === SECTION: Bowl History ===
    const bowlGames = (dynasty.games || []).filter(g =>
      (g.isBowlGame || g.gameType === 'bowl') && g.userTeam && g.result && g.opponent
    )
    if (bowlGames.length > 0) {
      const bowlItems = bowlGames
        .sort((a, b) => Number(b.year) - Number(a.year))
        .slice(0, 6)
        .map((b, idx) => ({
          id: `bowl-${idx}`,
          label: b.result === 'win' ? 'W' : 'L',
          labelColor: b.result === 'win' ? '#22c55e' : '#ef4444',
          text: `${b.bowlName || 'Bowl'} ${b.year} vs ${getTeamAbbr(b.opponent)}`
        }))
        .filter(item => item.text && !item.text.includes('undefined'))

      if (bowlItems.length > 0) {
        result.push({
          type: 'bowl_history',
          label: 'BOWL HISTORY',
          teamLogo: teamAbbr,
          teamRecord: `${bowlGames.filter(g => g.result === 'win').length}-${bowlGames.filter(g => g.result === 'loss').length}`,
          headerLink: `/bowl-history`,
          items: bowlItems
        })
      }
    }

    // === SECTION: Final Rankings ===
    const finalPolls = dynasty.finalPollsByYear || {}
    const rankings = []
    Object.entries(finalPolls).forEach(([pollYear, pollData]) => {
      if (pollData?.apRank || pollData?.cfpRank) {
        rankings.push({ year: pollYear, ap: pollData.apRank, cfp: pollData.cfpRank })
      }
    })
    if (rankings.length > 0) {
      const rankItems = rankings
        .sort((a, b) => Number(b.year) - Number(a.year))
        .slice(0, 6)
        .map((r, idx) => {
          let text = null
          if (r.cfp) {
            text = `#${r.cfp} CFP${r.ap ? `, #${r.ap} AP` : ''}`
          } else if (r.ap) {
            text = `#${r.ap} AP`
          }
          return { id: `rank-${idx}`, label: r.year, text }
        })
        .filter(item => item.text)

      if (rankItems.length > 0) {
        result.push({
          type: 'final_rankings',
          label: 'FINAL RANKINGS',
          teamLogo: teamAbbr,
          headerLink: `/rankings`,
          items: rankItems
        })
      }
    }

    // Final validation: filter out sections without valid items
    return result.filter(section => {
      // Must have items array with at least one item
      if (!section.items || section.items.length === 0) return false
      // All items must have text that's not undefined/null/empty
      return section.items.every(item => item.text && item.text !== 'undefined' && !item.text.includes('undefined'))
    })
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

export default useTickerSections
