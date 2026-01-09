/**
 * Gemini AI Service
 * Handles context building and API calls for AI-generated content
 */

import { doc, getDoc } from 'firebase/firestore'
import { db } from '../config/firebase'
import { getAbbreviationFromDisplayName } from '../data/teamAbbreviations'

// ============================================
// API KEY MANAGEMENT
// ============================================

/**
 * Fetch the user's Gemini API key from Firestore
 */
export async function getGeminiApiKey(userId) {
  if (!userId) return null

  try {
    const userDoc = await getDoc(doc(db, 'users', userId))
    return userDoc.exists() ? userDoc.data().geminiApiKey : null
  } catch (error) {
    console.error('Error fetching Gemini API key:', error)
    return null
  }
}

// ============================================
// HELPER FUNCTIONS FOR DATA EXTRACTION
// ============================================

/**
 * Normalize player name for matching (lowercase, trim)
 */
function normalizePlayerName(name) {
  return (name || '').toLowerCase().trim()
}

/**
 * Find a player record by name from the players array
 */
function getPlayerByName(players, playerName) {
  if (!players || !playerName) return null
  const normalized = normalizePlayerName(playerName)
  return players.find(p => normalizePlayerName(p.name) === normalized)
}

/**
 * Get player's season stats from statsByYear
 */
function getPlayerSeasonStats(player, year) {
  if (!player?.statsByYear) return null
  return player.statsByYear[year] || null
}

/**
 * Get game order for sorting (higher = later in season)
 */
function getGameOrder(g) {
  if (g.isConferenceChampionship) return 100
  if (g.isCFPFirstRound) return 101
  if (g.isCFPQuarterfinal) return 102
  if (g.isCFPSemifinal) return 103
  if (g.isCFPChampionship) return 104
  if (g.isBowlGame) return 100 + (parseInt(String(g.bowlWeek).replace('week', '') || '1'))
  return g.week || 0
}

/**
 * Get player's recent game performances (last 3 games before this one)
 */
function getPlayerRecentGames(playerName, allGames, year, currentGameOrder, teamAbbr) {
  if (!playerName || !allGames) return []

  const normalized = normalizePlayerName(playerName)

  // Find games before this one that have box scores with this player
  const recentGames = allGames
    .filter(g => {
      if (Number(g.year) !== Number(year)) return false
      if (getGameOrder(g) >= currentGameOrder) return false
      if (!g.boxScore) return false
      return true
    })
    .sort((a, b) => getGameOrder(b) - getGameOrder(a)) // Most recent first
    .slice(0, 3) // Last 3 games

  const results = []
  for (const game of recentGames) {
    // Search both sides of box score for this player
    for (const side of ['home', 'away']) {
      const boxSide = game.boxScore[side]
      if (!boxSide) continue

      // Check all stat categories
      for (const category of ['passing', 'rushing', 'receiving', 'defense', 'kicking']) {
        const entries = boxSide[category] || []
        const playerEntry = entries.find(p => normalizePlayerName(p.playerName) === normalized)
        if (playerEntry) {
          results.push({
            week: game.week,
            opponent: game.opponent || (side === 'home' ? game.team2 : game.team1),
            result: game.result,
            category,
            stats: playerEntry
          })
          break // Found player in this game, move to next game
        }
      }
    }
  }

  return results
}

/**
 * Get team ratings for a team/year
 */
function getTeamRatings(dynasty, teamAbbr, year) {
  if (!dynasty?.teamRatingsByTeamYear?.[teamAbbr]?.[year]) {
    return null
  }
  return dynasty.teamRatingsByTeamYear[teamAbbr][year]
}

/**
 * Get coaching staff for a team/year
 */
function getCoachingStaff(dynasty, teamAbbr, year) {
  if (!dynasty?.coachingStaffByTeamYear?.[teamAbbr]) {
    return null
  }
  // Check current year, then walk back to find most recent
  for (let y = year; y >= (dynasty.startYear || year - 10); y--) {
    if (dynasty.coachingStaffByTeamYear[teamAbbr][y]) {
      return dynasty.coachingStaffByTeamYear[teamAbbr][y]
    }
  }
  return null
}

/**
 * Get all season results before this game
 */
function getSeasonResultsBeforeGame(allGames, teamAbbr, year, currentGameOrder) {
  if (!allGames) return []

  return allGames
    .filter(g => {
      if (Number(g.year) !== Number(year)) return false
      if (getGameOrder(g) >= currentGameOrder) return false
      // Must be a user game for this team
      if (g.userTeam !== teamAbbr) return false
      return true
    })
    .sort((a, b) => getGameOrder(a) - getGameOrder(b))
    .map(g => ({
      week: g.week,
      opponent: g.opponent,
      result: g.result,
      teamScore: g.teamScore,
      opponentScore: g.opponentScore,
      isConferenceGame: g.isConferenceGame,
      opponentRank: g.opponentRank,
      location: g.location,
      gameType: g.isConferenceChampionship ? 'CCG' :
                g.isBowlGame ? 'Bowl' :
                g.isCFPFirstRound ? 'CFP R1' :
                g.isCFPQuarterfinal ? 'CFP QF' :
                g.isCFPSemifinal ? 'CFP SF' : 'Regular'
    }))
}

/**
 * Build enhanced player context with season stats and recent games
 */
function buildEnhancedPlayerHighlights(boxScore, side, players, allGames, year, currentGameOrder, teamAbbr) {
  const highlights = {
    passing: [],
    rushing: [],
    receiving: [],
    defense: [],
    kicking: []
  }

  // Extract passing leaders with enhanced context
  if (boxScore[side]?.passing?.length > 0) {
    const passers = boxScore[side].passing.filter(p => p.att > 0)
    passers.forEach(p => {
      const player = getPlayerByName(players, p.playerName)
      const seasonStats = player ? getPlayerSeasonStats(player, year) : null
      const recentGames = getPlayerRecentGames(p.playerName, allGames, year, currentGameOrder, teamAbbr)

      highlights.passing.push({
        player: p.playerName,
        stats: `${p.cmp}/${p.att}, ${p.yds} yards, ${p.td} TD${p.td !== 1 ? 's' : ''}${p.int > 0 ? `, ${p.int} INT` : ''}`,
        // Enhanced fields
        position: player?.position || 'QB',
        class: player?.classByYear?.[year] || player?.year || null,
        overall: player?.overall || null,
        seasonStats: seasonStats?.passing ? {
          gamesPlayed: seasonStats.gamesPlayed || 0,
          cmp: seasonStats.passing.cmp || 0,
          att: seasonStats.passing.att || 0,
          yds: seasonStats.passing.yds || 0,
          td: seasonStats.passing.td || 0,
          int: seasonStats.passing.int || 0
        } : null,
        recentGames: recentGames.filter(g => g.category === 'passing').map(g => ({
          week: g.week,
          opponent: g.opponent,
          stats: `${g.stats.cmp}/${g.stats.att}, ${g.stats.yds} yds, ${g.stats.td} TD`
        }))
      })
    })
  }

  // Extract rushing leaders with enhanced context
  if (boxScore[side]?.rushing?.length > 0) {
    const rushers = boxScore[side].rushing.filter(p => p.car > 0).slice(0, 3)
    rushers.forEach(p => {
      const player = getPlayerByName(players, p.playerName)
      const seasonStats = player ? getPlayerSeasonStats(player, year) : null
      const recentGames = getPlayerRecentGames(p.playerName, allGames, year, currentGameOrder, teamAbbr)

      highlights.rushing.push({
        player: p.playerName,
        stats: `${p.car} carries, ${p.yds} yards${p.td > 0 ? `, ${p.td} TD${p.td !== 1 ? 's' : ''}` : ''}`,
        position: player?.position || null,
        class: player?.classByYear?.[year] || player?.year || null,
        overall: player?.overall || null,
        seasonStats: seasonStats?.rushing ? {
          gamesPlayed: seasonStats.gamesPlayed || 0,
          car: seasonStats.rushing.car || 0,
          yds: seasonStats.rushing.yds || 0,
          td: seasonStats.rushing.td || 0,
          ypc: seasonStats.rushing.car > 0 ? (seasonStats.rushing.yds / seasonStats.rushing.car).toFixed(1) : '0.0'
        } : null,
        recentGames: recentGames.filter(g => g.category === 'rushing').map(g => ({
          week: g.week,
          opponent: g.opponent,
          stats: `${g.stats.car} car, ${g.stats.yds} yds${g.stats.td > 0 ? `, ${g.stats.td} TD` : ''}`
        }))
      })
    })
  }

  // Extract receiving leaders with enhanced context
  if (boxScore[side]?.receiving?.length > 0) {
    const receivers = boxScore[side].receiving.filter(p => p.rec > 0).slice(0, 3)
    receivers.forEach(p => {
      const player = getPlayerByName(players, p.playerName)
      const seasonStats = player ? getPlayerSeasonStats(player, year) : null
      const recentGames = getPlayerRecentGames(p.playerName, allGames, year, currentGameOrder, teamAbbr)

      highlights.receiving.push({
        player: p.playerName,
        stats: `${p.rec} catches, ${p.yds} yards${p.td > 0 ? `, ${p.td} TD${p.td !== 1 ? 's' : ''}` : ''}`,
        position: player?.position || null,
        class: player?.classByYear?.[year] || player?.year || null,
        overall: player?.overall || null,
        seasonStats: seasonStats?.receiving ? {
          gamesPlayed: seasonStats.gamesPlayed || 0,
          rec: seasonStats.receiving.rec || 0,
          yds: seasonStats.receiving.yds || 0,
          td: seasonStats.receiving.td || 0,
          ypr: seasonStats.receiving.rec > 0 ? (seasonStats.receiving.yds / seasonStats.receiving.rec).toFixed(1) : '0.0'
        } : null,
        recentGames: recentGames.filter(g => g.category === 'receiving').map(g => ({
          week: g.week,
          opponent: g.opponent,
          stats: `${g.stats.rec} rec, ${g.stats.yds} yds${g.stats.td > 0 ? `, ${g.stats.td} TD` : ''}`
        }))
      })
    })
  }

  // Extract defensive standouts with enhanced context
  if (boxScore[side]?.defense?.length > 0) {
    const defenders = boxScore[side].defense
      .map(p => ({
        ...p,
        totalTackles: (parseFloat(p.solo) || 0) + (parseFloat(p.assists) || 0)
      }))
      .filter(p => p.totalTackles > 0 || p.sacks > 0 || p.int > 0 || p.ff > 0)
      .sort((a, b) => b.totalTackles - a.totalTackles)
      .slice(0, 3)

    defenders.forEach(p => {
      const parts = []
      if (p.totalTackles > 0) parts.push(`${p.totalTackles} tackles`)
      if (p.sacks > 0) parts.push(`${p.sacks} sack${p.sacks !== 1 ? 's' : ''}`)
      if (p.int > 0) parts.push(`${p.int} INT`)
      if (p.ff > 0) parts.push(`${p.ff} FF`)

      if (parts.length > 0) {
        const player = getPlayerByName(players, p.playerName)
        const seasonStats = player ? getPlayerSeasonStats(player, year) : null

        highlights.defense.push({
          player: p.playerName,
          stats: parts.join(', '),
          position: player?.position || null,
          class: player?.classByYear?.[year] || player?.year || null,
          overall: player?.overall || null,
          seasonStats: seasonStats?.defense ? {
            gamesPlayed: seasonStats.gamesPlayed || 0,
            tackles: (seasonStats.defense.soloTkl || 0) + (seasonStats.defense.astTkl || 0),
            tfl: seasonStats.defense.tfl || 0,
            sacks: seasonStats.defense.sacks || 0,
            int: seasonStats.defense.int || 0
          } : null
        })
      }
    })
  }

  // Extract kicking with enhanced context
  if (boxScore[side]?.kicking?.length > 0) {
    boxScore[side].kicking.forEach(p => {
      if (p.fgm > 0 || p.fga > 0) {
        const player = getPlayerByName(players, p.playerName)
        const seasonStats = player ? getPlayerSeasonStats(player, year) : null

        highlights.kicking.push({
          player: p.playerName,
          stats: `${p.fgm}/${p.fga} FG${p.lng ? `, long ${p.lng}` : ''}`,
          position: player?.position || 'K',
          class: player?.classByYear?.[year] || player?.year || null,
          overall: player?.overall || null,
          seasonStats: seasonStats?.kicking ? {
            fgm: seasonStats.kicking.fgm || 0,
            fga: seasonStats.kicking.fga || 0,
            pct: seasonStats.kicking.fga > 0 ? Math.round((seasonStats.kicking.fgm / seasonStats.kicking.fga) * 100) : 0
          } : null
        })
      }
    })
  }

  return highlights
}

// ============================================
// HISTORICAL DATA HELPERS
// ============================================

/**
 * Get head-to-head history between two teams
 * Returns past matchups from all seasons in the dynasty
 */
function getHeadToHeadHistory(allGames, team1, team2, currentYear, maxGames = 5) {
  const history = []

  for (const g of allGames) {
    // Skip games from current year (we only want historical)
    if (Number(g.year) >= Number(currentYear)) continue

    // Check if this game involves both teams
    const isMatch = (
      // User game format
      (g.userTeam === team1 && g.opponent === team2) ||
      (g.userTeam === team2 && g.opponent === team1) ||
      // CPU game format
      (g.team1 === team1 && g.team2 === team2) ||
      (g.team1 === team2 && g.team2 === team1)
    )

    if (isMatch) {
      let winner, loser, winnerScore, loserScore
      if (g.team1 && g.team2) {
        // CPU game format
        const team1Won = g.team1Score > g.team2Score
        winner = team1Won ? g.team1 : g.team2
        loser = team1Won ? g.team2 : g.team1
        winnerScore = team1Won ? g.team1Score : g.team2Score
        loserScore = team1Won ? g.team2Score : g.team1Score
      } else {
        // User game format
        const userWon = g.result === 'win' || g.result === 'W'
        winner = userWon ? g.userTeam : g.opponent
        loser = userWon ? g.opponent : g.userTeam
        winnerScore = userWon ? g.teamScore : g.opponentScore
        loserScore = userWon ? g.opponentScore : g.teamScore
      }

      history.push({
        year: g.year,
        winner,
        loser,
        winnerScore,
        loserScore,
        gameType: g.isBowlGame ? (g.bowlName || 'Bowl Game') :
                  g.isConferenceChampionship ? 'Conference Championship' :
                  g.isCFPChampionship ? 'National Championship' :
                  g.isCFPSemifinal ? 'CFP Semifinal' :
                  g.isCFPQuarterfinal ? 'CFP Quarterfinal' :
                  'Regular Season'
      })
    }
  }

  // Sort by year descending (most recent first) and limit
  return history.sort((a, b) => b.year - a.year).slice(0, maxGames)
}

/**
 * Get next CFP opponent based on bracket structure
 * Returns { nextRound, nextOpponent, nextBowl } or null if championship/unknown
 */
function getNextCFPOpponent(dynasty, game) {
  if (game.isCFPChampionship) return null // No next game after championship

  const year = game.year
  const cfpResults = dynasty.cfpResultsByYear?.[year] || {}
  const seeds = cfpResults.seeds || {}
  const allGames = dynasty.games || []

  // Reverse lookup: team -> seed
  const teamToSeed = {}
  Object.entries(seeds).forEach(([team, seed]) => {
    if (seed) teamToSeed[team] = seed
  })

  // Helper to find a team by seed
  const getTeamBySeed = (seed) => {
    return Object.entries(seeds).find(([team, s]) => Number(s) === Number(seed))?.[0] || `#${seed} seed`
  }

  // Helper to find winner of a first round matchup
  const getFirstRoundWinner = (seed1, seed2) => {
    const frGame = allGames.find(g =>
      Number(g.year) === Number(year) &&
      g.isCFPFirstRound &&
      g.team1Score != null &&
      ((teamToSeed[g.team1] == seed1 && teamToSeed[g.team2] == seed2) ||
       (teamToSeed[g.team1] == seed2 && teamToSeed[g.team2] == seed1))
    )
    if (frGame) {
      return frGame.team1Score > frGame.team2Score ? frGame.team1 : frGame.team2
    }
    return null
  }

  // Helper to find winner of a quarterfinal by bowl name
  const getQuarterfinalWinner = (bowlName) => {
    const qfGame = allGames.find(g =>
      Number(g.year) === Number(year) &&
      g.isCFPQuarterfinal &&
      g.bowlName === bowlName &&
      (g.team1Score != null || g.teamScore != null)
    )
    if (qfGame) {
      if (qfGame.team1Score != null) {
        return qfGame.team1Score > qfGame.team2Score ? qfGame.team1 : qfGame.team2
      } else {
        return qfGame.result === 'win' || qfGame.result === 'W' ? qfGame.userTeam : qfGame.opponent
      }
    }
    return null
  }

  // Helper to find winner of a semifinal by bowl name
  const getSemifinalWinner = (bowlName) => {
    const sfGame = allGames.find(g =>
      Number(g.year) === Number(year) &&
      g.isCFPSemifinal &&
      g.bowlName === bowlName &&
      (g.team1Score != null || g.teamScore != null)
    )
    if (sfGame) {
      if (sfGame.team1Score != null) {
        return sfGame.team1Score > sfGame.team2Score ? sfGame.team1 : sfGame.team2
      } else {
        return sfGame.result === 'win' || sfGame.result === 'W' ? sfGame.userTeam : sfGame.opponent
      }
    }
    return null
  }

  // Determine current game's teams and their seeds
  const team1 = game.team1 || game.userTeam
  const team2 = game.team2 || game.opponent
  const team1Seed = teamToSeed[team1]
  const team2Seed = teamToSeed[team2]

  if (game.isCFPFirstRound) {
    // First round winners play a top-4 seed in quarterfinals
    // 5/12 winner plays #4 in Orange Bowl
    // 8/9 winner plays #1 in Sugar Bowl
    // 6/11 winner plays #3 in Rose Bowl
    // 7/10 winner plays #2 in Cotton Bowl
    const matchupSeeds = [team1Seed, team2Seed].sort((a, b) => a - b)
    const seedPair = matchupSeeds.join('-')

    const advancementMap = {
      '5-12': { hostSeed: 4, bowl: 'Orange Bowl' },
      '8-9': { hostSeed: 1, bowl: 'Sugar Bowl' },
      '6-11': { hostSeed: 3, bowl: 'Rose Bowl' },
      '7-10': { hostSeed: 2, bowl: 'Cotton Bowl' }
    }

    const advancement = advancementMap[seedPair]
    if (advancement) {
      const hostTeam = getTeamBySeed(advancement.hostSeed)
      return {
        nextRound: 'Quarterfinal',
        nextOpponent: hostTeam,
        nextBowl: advancement.bowl,
        nextOpponentSeed: advancement.hostSeed
      }
    }
  }

  if (game.isCFPQuarterfinal) {
    // Quarterfinal winners play in semifinals
    // Sugar Bowl winner vs Orange Bowl winner → one semifinal
    // Rose Bowl winner vs Cotton Bowl winner → other semifinal
    const bowlName = game.bowlName

    // Determine which semifinal this winner goes to
    if (bowlName === 'Sugar Bowl' || bowlName === 'Orange Bowl') {
      const otherBowl = bowlName === 'Sugar Bowl' ? 'Orange Bowl' : 'Sugar Bowl'
      const otherWinner = getQuarterfinalWinner(otherBowl)
      return {
        nextRound: 'Semifinal',
        nextOpponent: otherWinner || `Winner of ${otherBowl}`,
        nextBowl: 'Peach Bowl' // One semifinal matchup
      }
    } else if (bowlName === 'Rose Bowl' || bowlName === 'Cotton Bowl') {
      const otherBowl = bowlName === 'Rose Bowl' ? 'Cotton Bowl' : 'Rose Bowl'
      const otherWinner = getQuarterfinalWinner(otherBowl)
      return {
        nextRound: 'Semifinal',
        nextOpponent: otherWinner || `Winner of ${otherBowl}`,
        nextBowl: 'Fiesta Bowl' // Other semifinal matchup
      }
    }
  }

  if (game.isCFPSemifinal) {
    // Semifinal winners play for the championship
    const bowlName = game.bowlName
    const otherBowl = bowlName === 'Peach Bowl' ? 'Fiesta Bowl' : 'Peach Bowl'
    const otherWinner = getSemifinalWinner(otherBowl)
    return {
      nextRound: 'National Championship',
      nextOpponent: otherWinner || `Winner of ${otherBowl}`,
      nextBowl: 'National Championship'
    }
  }

  return null
}

/**
 * Get CFP bracket context for a CFP game
 * Returns info about other CFP games, seeds, bracket position
 */
function getCFPBracketContext(dynasty, game) {
  if (!game.isCFPFirstRound && !game.isCFPQuarterfinal && !game.isCFPSemifinal && !game.isCFPChampionship) {
    return null
  }

  const year = game.year
  const cfpResults = dynasty.cfpResultsByYear?.[year] || {}
  const allGames = dynasty.games || []

  const context = {
    round: game.isCFPFirstRound ? 'First Round' :
           game.isCFPQuarterfinal ? 'Quarterfinal' :
           game.isCFPSemifinal ? 'Semifinal' :
           'Championship',
    seeds: cfpResults.seeds || {},
    bracket: []
  }

  // Get other CFP games from this year
  const cfpGames = allGames.filter(g =>
    Number(g.year) === Number(year) &&
    (g.isCFPFirstRound || g.isCFPQuarterfinal || g.isCFPSemifinal || g.isCFPChampionship)
  )

  // Add completed CFP games to bracket context
  for (const g of cfpGames) {
    if (g.id === game.id) continue // Skip current game

    let winner, loser, score
    if (g.team1 && g.team2 && g.team1Score != null) {
      const t1Won = g.team1Score > g.team2Score
      winner = t1Won ? g.team1 : g.team2
      loser = t1Won ? g.team2 : g.team1
      score = `${Math.max(g.team1Score, g.team2Score)}-${Math.min(g.team1Score, g.team2Score)}`
    } else if (g.teamScore != null && g.opponentScore != null) {
      const userWon = g.result === 'win' || g.result === 'W'
      winner = userWon ? g.userTeam : g.opponent
      loser = userWon ? g.opponent : g.userTeam
      score = `${Math.max(g.teamScore, g.opponentScore)}-${Math.min(g.teamScore, g.opponentScore)}`
    } else {
      continue // No score yet
    }

    const round = g.isCFPFirstRound ? 'First Round' :
                  g.isCFPQuarterfinal ? 'Quarterfinal' :
                  g.isCFPSemifinal ? 'Semifinal' :
                  'Championship'

    context.bracket.push({
      round,
      winner,
      loser,
      score,
      bowlName: g.bowlName
    })
  }

  // Add next opponent info
  const nextOpponentInfo = getNextCFPOpponent(dynasty, game)
  if (nextOpponentInfo) {
    context.nextRound = nextOpponentInfo.nextRound
    context.nextOpponent = nextOpponentInfo.nextOpponent
    context.nextBowl = nextOpponentInfo.nextBowl
    context.nextOpponentSeed = nextOpponentInfo.nextOpponentSeed
  }

  return context
}

/**
 * Get bowl history for a team (past bowl appearances)
 */
function getBowlHistory(allGames, teamAbbr, currentYear, maxGames = 3) {
  const history = []

  for (const g of allGames) {
    if (Number(g.year) >= Number(currentYear)) continue
    if (!g.isBowlGame && !g.isCFPFirstRound && !g.isCFPQuarterfinal && !g.isCFPSemifinal && !g.isCFPChampionship) continue

    // Check if this team was in the game
    const teamInGame = g.userTeam === teamAbbr || g.team1 === teamAbbr || g.team2 === teamAbbr

    if (teamInGame) {
      let won, opponent, score, gameName
      if (g.team1 && g.team2) {
        const isTeam1 = g.team1 === teamAbbr
        won = isTeam1 ? g.team1Score > g.team2Score : g.team2Score > g.team1Score
        opponent = isTeam1 ? g.team2 : g.team1
        score = `${isTeam1 ? g.team1Score : g.team2Score}-${isTeam1 ? g.team2Score : g.team1Score}`
      } else {
        won = g.result === 'win' || g.result === 'W'
        opponent = g.opponent
        score = `${g.teamScore}-${g.opponentScore}`
      }

      gameName = g.isCFPChampionship ? 'National Championship' :
                 g.isCFPSemifinal ? (g.bowlName || 'CFP Semifinal') :
                 g.isCFPQuarterfinal ? (g.bowlName || 'CFP Quarterfinal') :
                 g.isCFPFirstRound ? 'CFP First Round' :
                 g.bowlName || 'Bowl Game'

      history.push({
        year: g.year,
        gameName,
        result: won ? 'W' : 'L',
        opponent,
        score
      })
    }
  }

  return history.sort((a, b) => b.year - a.year).slice(0, maxGames)
}

// ============================================
// CONTEXT BUILDERS
// ============================================

/**
 * Build comprehensive context for a game recap
 * Handles both user games (with opponent/teamScore) and CPU games (with team1/team2)
 */
export function buildGameRecapContext(dynasty, game) {
  const userTeamAbbr = getAbbreviationFromDisplayName(dynasty.teamName) || dynasty.teamName
  const year = game.year
  const allGames = dynasty.games || []

  // Detect if this is a CPU vs CPU game
  const isCPUGame = !game.userTeam && game.team1 && game.team2

  // Determine teams and scores based on game type
  let team1, team2, team1Score, team2Score
  if (isCPUGame) {
    team1 = game.team1
    team2 = game.team2
    team1Score = game.team1Score
    team2Score = game.team2Score
  } else {
    team1 = game.userTeam || userTeamAbbr
    team2 = game.opponent
    team1Score = game.teamScore
    team2Score = game.opponentScore
  }

  const scoreDiff = Math.abs(team1Score - team2Score)
  const team1Won = team1Score > team2Score

  // For user games, get season context
  let recordBefore = null
  let recordAfter = null
  let streak = null

  // Calculate game order for this game (used for filtering previous games)
  const thisGameOrder = getGameOrder(game)

  if (!isCPUGame) {
    const seasonGames = allGames.filter(g =>
      Number(g.year) === Number(year) &&
      (g.userTeam === userTeamAbbr || g.opponent)
    )

    const gamesBefore = seasonGames.filter(g => getGameOrder(g) < thisGameOrder)

    const winsBefore = gamesBefore.filter(g => g.result === 'win' || g.result === 'W').length
    const lossesBefore = gamesBefore.filter(g => g.result === 'loss' || g.result === 'L').length

    const isWin = game.result === 'win' || game.result === 'W'
    recordBefore = `${winsBefore}-${lossesBefore}`
    recordAfter = isWin ? `${winsBefore + 1}-${lossesBefore}` : `${winsBefore}-${lossesBefore + 1}`

    // Calculate streak
    const gamesUpToThis = [...gamesBefore, game].sort((a, b) => getGameOrder(a) - getGameOrder(b))
    let streakCount = 0
    const streakType = isWin ? 'win' : 'loss'
    for (let i = gamesUpToThis.length - 1; i >= 0; i--) {
      const g = gamesUpToThis[i]
      const gWin = g.result === 'win' || g.result === 'W'
      if (gWin === isWin) {
        streakCount++
      } else {
        break
      }
    }
    if (streakCount > 1) {
      streak = `${streakCount}-game ${streakType} streak`
    }
  }

  // Determine game significance
  const isBlowout = scoreDiff >= 21
  const isCloseGame = scoreDiff <= 7
  const isShutout = team2Score === 0 || team1Score === 0
  const isOvertime = game.overtime || game.isOvertime

  // Check for ranked matchup and upset
  const team1Ranking = isCPUGame ? game.team1Rank : game.ranking
  const team2Ranking = isCPUGame ? game.team2Rank : game.opponentRank
  const isRankedMatchup = team1Ranking && team2Ranking
  const isUpset = (team2Ranking && team2Ranking <= 10 && team1Won) ||
                  (team1Ranking && team1Ranking <= 10 && !team1Won)

  // Get game type info
  let gameTypeDescription = 'regular season game'
  if (game.isConferenceChampionship) gameTypeDescription = 'conference championship game'
  else if (game.isCFPChampionship) gameTypeDescription = 'College Football Playoff National Championship'
  else if (game.isCFPSemifinal) gameTypeDescription = 'College Football Playoff Semifinal'
  else if (game.isCFPQuarterfinal) gameTypeDescription = 'College Football Playoff Quarterfinal'
  else if (game.isCFPFirstRound) gameTypeDescription = 'College Football Playoff First Round game'
  else if (game.isBowlGame && game.bowlName) gameTypeDescription = `${game.bowlName}`
  else if (game.isBowlGame) gameTypeDescription = 'bowl game'

  // Get players array for enhanced context
  const players = dynasty.players || []

  // Get team ratings for both teams
  const team1Ratings = getTeamRatings(dynasty, team1, year)
  const team2Ratings = getTeamRatings(dynasty, team2, year)

  // Get coaching staff for user team (team1 for user games)
  const team1Staff = !isCPUGame ? getCoachingStaff(dynasty, team1, year) : null

  // Get full season results before this game (for user games)
  const seasonResults = !isCPUGame
    ? getSeasonResultsBeforeGame(allGames, team1, year, thisGameOrder)
    : []

  // Extract box score stats with enhanced player context
  let boxScoreContext = null
  if (game.boxScore) {
    const location = game.location || 'home'
    const team1IsHome = location === 'home' || location === 'neutral' || game.team1
    const team1Side = team1IsHome ? 'home' : 'away'
    const team2Side = team1IsHome ? 'away' : 'home'

    boxScoreContext = {
      team1: buildEnhancedPlayerHighlights(game.boxScore, team1Side, players, allGames, year, thisGameOrder, team1),
      team2: buildEnhancedPlayerHighlights(game.boxScore, team2Side, players, allGames, year, thisGameOrder, team2),
      team1Name: team1,
      team2Name: team2
    }
  }

  return {
    // Game type flag
    isCPUGame,

    // Team info
    team1,
    team2,
    team1Score,
    team2Score,
    team1Won,
    winner: team1Won ? team1 : team2,
    loser: team1Won ? team2 : team1,
    winnerScore: team1Won ? team1Score : team2Score,
    loserScore: team1Won ? team2Score : team1Score,

    // Game basics
    week: game.week,
    year: game.year,
    gameType: gameTypeDescription,
    location: game.location,

    // Score details
    scoreDifferential: scoreDiff,
    isOvertime,

    // Game character
    isBlowout,
    isCloseGame,
    isShutout,
    isUpset,
    isRankedMatchup,

    // Rankings
    team1Ranking,
    team2Ranking,

    // Season context (only for user games)
    recordBefore,
    recordAfter,
    streak,

    // Conference info
    conference: dynasty.conference,
    isConferenceGame: game.isConferenceGame,

    // NEW: Team ratings
    team1Ratings,
    team2Ratings,

    // NEW: Coaching staff
    team1Staff,

    // NEW: Full season results before this game
    seasonResults,

    // Box score highlights for both teams (enhanced with player info)
    boxScore: boxScoreContext,

    // Quarter-by-quarter scores
    quarters: game.quarters || null,

    // Overtime periods (if any)
    overtimes: game.overtimes || null,

    // Scoring summary - each scoring play in order
    scoringSummary: game.boxScore?.scoringSummary || [],

    // Team stats (first downs, turnovers, 3rd down, possession, etc.)
    teamStats: game.boxScore?.teamStats || null,

    // Bowl/CFP info
    bowlName: game.bowlName,
    cfpSeed: game.cfpSeed,

    // HISTORICAL DATA
    // Head-to-head history between these two teams
    headToHead: getHeadToHeadHistory(allGames, team1, team2, year),

    // CFP bracket context (only for CFP games)
    cfpBracket: getCFPBracketContext(dynasty, game),

    // Bowl history for both teams (only for bowl/CFP games)
    team1BowlHistory: (game.isBowlGame || game.isCFPFirstRound || game.isCFPQuarterfinal || game.isCFPSemifinal || game.isCFPChampionship)
      ? getBowlHistory(allGames, team1, year)
      : [],
    team2BowlHistory: (game.isBowlGame || game.isCFPFirstRound || game.isCFPQuarterfinal || game.isCFPSemifinal || game.isCFPChampionship)
      ? getBowlHistory(allGames, team2, year)
      : [],

    // Player of the week awards
    awards: {
      conferencePOW: game.conferencePOW || null,
      confDefensePOW: game.confDefensePOW || null,
      nationalPOW: game.nationalPOW || null,
      natlDefensePOW: game.natlDefensePOW || null
    },

    // Notes
    gameNotes: game.notes
  }
}

/**
 * Extract highlights from one side of a box score
 */
function extractHighlightsForSide(boxScore, side) {
  const highlights = {
    passing: [],
    rushing: [],
    receiving: [],
    defense: [],
    kicking: []
  }

  // Extract passing leaders
  if (boxScore[side]?.passing?.length > 0) {
    const passers = boxScore[side].passing.filter(p => p.att > 0)
    passers.forEach(p => {
      highlights.passing.push({
        player: p.playerName,
        stats: `${p.cmp}/${p.att}, ${p.yds} yards, ${p.td} TD${p.td !== 1 ? 's' : ''}${p.int > 0 ? `, ${p.int} INT` : ''}`
      })
    })
  }

  // Extract rushing leaders
  if (boxScore[side]?.rushing?.length > 0) {
    const rushers = boxScore[side].rushing.filter(p => p.car > 0).slice(0, 3)
    rushers.forEach(p => {
      highlights.rushing.push({
        player: p.playerName,
        stats: `${p.car} carries, ${p.yds} yards${p.td > 0 ? `, ${p.td} TD${p.td !== 1 ? 's' : ''}` : ''}`
      })
    })
  }

  // Extract receiving leaders
  if (boxScore[side]?.receiving?.length > 0) {
    const receivers = boxScore[side].receiving.filter(p => p.rec > 0).slice(0, 3)
    receivers.forEach(p => {
      highlights.receiving.push({
        player: p.playerName,
        stats: `${p.rec} catches, ${p.yds} yards${p.td > 0 ? `, ${p.td} TD${p.td !== 1 ? 's' : ''}` : ''}`
      })
    })
  }

  // Extract defensive standouts
  if (boxScore[side]?.defense?.length > 0) {
    const defenders = boxScore[side].defense
      .map(p => ({
        ...p,
        totalTackles: (parseFloat(p.solo) || 0) + (parseFloat(p.assists) || 0)
      }))
      .filter(p => p.totalTackles > 0 || p.sacks > 0 || p.int > 0 || p.ff > 0)
      .sort((a, b) => b.totalTackles - a.totalTackles)
      .slice(0, 3)

    defenders.forEach(p => {
      const parts = []
      if (p.totalTackles > 0) parts.push(`${p.totalTackles} tackles`)
      if (p.sacks > 0) parts.push(`${p.sacks} sack${p.sacks !== 1 ? 's' : ''}`)
      if (p.int > 0) parts.push(`${p.int} INT`)
      if (p.ff > 0) parts.push(`${p.ff} FF`)
      if (parts.length > 0) {
        highlights.defense.push({
          player: p.playerName,
          stats: parts.join(', ')
        })
      }
    })
  }

  // Extract kicking
  if (boxScore[side]?.kicking?.length > 0) {
    boxScore[side].kicking.forEach(p => {
      if (p.fgm > 0 || p.fga > 0) {
        highlights.kicking.push({
          player: p.playerName,
          stats: `${p.fgm}/${p.fga} FG${p.lng ? `, long ${p.lng}` : ''}`
        })
      }
    })
  }

  return highlights
}

/**
 * Extract box score highlights for both teams
 * team1 is home (or user team for user games), team2 is away (or opponent)
 */
function extractBoxScoreHighlightsForBothTeams(boxScore, team1, team2, game) {
  // For user games, determine sides based on location
  // For CPU games, home/away is already correct
  const location = game.location || 'home'
  const team1IsHome = location === 'home' || location === 'neutral' || game.team1

  const team1Side = team1IsHome ? 'home' : 'away'
  const team2Side = team1IsHome ? 'away' : 'home'

  return {
    team1: extractHighlightsForSide(boxScore, team1Side),
    team2: extractHighlightsForSide(boxScore, team2Side),
    team1Name: team1,
    team2Name: team2
  }
}

// ============================================
// PROMPT TEMPLATES
// ============================================

/**
 * Format a player stat line with enhanced context
 */
function formatEnhancedPlayerLine(p, category) {
  let line = `  - ${p.player}`
  if (p.class || p.overall) {
    const details = []
    if (p.class) details.push(p.class)
    if (p.position) details.push(p.position)
    if (p.overall) details.push(`${p.overall} OVR`)
    line += ` (${details.join(', ')})`
  }
  line += `: ${p.stats}`

  // Add season totals if available
  if (p.seasonStats) {
    if (category === 'passing' && p.seasonStats.yds > 0) {
      line += ` | Season: ${p.seasonStats.yds} yds, ${p.seasonStats.td} TD, ${p.seasonStats.int} INT in ${p.seasonStats.gamesPlayed} games`
    } else if (category === 'rushing' && p.seasonStats.yds > 0) {
      line += ` | Season: ${p.seasonStats.yds} yds, ${p.seasonStats.td} TD (${p.seasonStats.ypc} YPC) in ${p.seasonStats.gamesPlayed} games`
    } else if (category === 'receiving' && p.seasonStats.yds > 0) {
      line += ` | Season: ${p.seasonStats.rec} rec, ${p.seasonStats.yds} yds, ${p.seasonStats.td} TD in ${p.seasonStats.gamesPlayed} games`
    } else if (category === 'defense' && p.seasonStats.tackles > 0) {
      line += ` | Season: ${p.seasonStats.tackles} tackles, ${p.seasonStats.tfl} TFL, ${p.seasonStats.sacks} sacks`
    } else if (category === 'kicking' && p.seasonStats.fga > 0) {
      line += ` | Season: ${p.seasonStats.fgm}/${p.seasonStats.fga} FG (${p.seasonStats.pct}%)`
    }
  }

  // Add recent game log if available
  if (p.recentGames && p.recentGames.length > 0) {
    line += `\n      Recent: ${p.recentGames.map(g => `vs ${g.opponent}: ${g.stats}`).join(' | ')}`
  }

  return line
}

// ============================================
// DEFAULT WRITING INSTRUCTIONS TEMPLATE
// ============================================

/**
 * Default writing instructions for game recaps
 * Placeholder [HOME_TEAM] will be replaced with the actual home team at generation time
 */
export const DEFAULT_GAME_RECAP_INSTRUCTIONS = `CRITICAL RULE - READ THIS FIRST:
You may ONLY write about facts explicitly provided in the data above. If specific game details like scoring plays, play-by-play, individual stats, or quarter scores are NOT provided, do NOT invent them. Write a SHORTER article that focuses on what IS known (final score, historical context, season implications). A 2-3 paragraph recap based on real data is infinitely better than a 10-paragraph article full of fabricated details.

**SCALING LENGTH BASED ON DATA:**
- If you have: scoring summary, box scores, quarter scores → Write 6-10 detailed paragraphs
- If you have: quarter scores but no scoring summary → Write 3-5 paragraphs, describe flow by quarters only
- If you ONLY have: final score and teams → Write 2-3 short paragraphs about the result and historical context

**FORMAT:**
1. Start with a compelling HEADLINE in title case (like "Hurricanes Storm Back to Stun Rebels in Fiesta Bowl Thriller")
2. Start the article body with a proper dateline: "CITY, State --" format (e.g., "TUSCALOOSA, Ala. --" or "SOUTH BEND, Ind. --")
   - IMPORTANT: Look at the HOME TEAM field above. The game is played at the HOME TEAM's stadium.
   - HOME TEAM for this game: [HOME_TEAM]
   - Use the REAL city where [HOME_TEAM] plays their home games
   - NEVER use the away team's city - the dateline MUST be the home team's city
   - NEVER write "STAFF REPORT" - always use a real city name
3. Do NOT use markdown formatting like **, ##, or * - write in plain text only. The headline should just be the text, not wrapped in any symbols.

**CONTENT REQUIREMENTS:**
1. ONLY use facts from the data above - if a SCORING SUMMARY section exists, use it; if not, do NOT invent scoring plays
2. ONLY mention specific plays if they appear in the SCORING SUMMARY with quarter and time
3. ONLY include player stat lines if they appear in the INDIVIDUAL STATS sections
4. ONLY describe quarter-by-quarter flow if QUARTER-BY-QUARTER SCORES are provided
5. You CAN use historical data (head-to-head, bowl history, season results) - that context is always valuable
6. Reference team stats like turnovers only if they appear in the TEAM STATISTICS section

**NARRATIVE STYLE:**
1. Lead with the most compelling storyline - the result, the upset, the implications
2. If detailed play data exists, describe the game flow chronologically
3. If only the final score exists, focus on what the result MEANS (historical context, playoff implications, rivalry significance)
4. Use vivid, active language - avoid passive voice
5. Connect this game to the bigger picture using the historical data provided

**TEAM NAME USAGE - VERY IMPORTANT:**
Write like a real sports journalist. Do NOT overuse abbreviations like "ARST", "ISU", "ARK". Instead:
- Use full team names: "Arkansas State", "Iowa State", "Arkansas", "Michigan", "Ohio State"
- Use team nicknames: "the Red Wolves", "the Cyclones", "the Razorbacks", "the Wolverines", "the Buckeyes"
- Vary your references: "Arkansas State" → "the Red Wolves" → "Arkansas State" → "the visitors/hosts"
- In headlines, you may use shorter forms but prefer nicknames over abbreviations
- Abbreviations are OK occasionally for variety, but should NOT be the primary way you refer to teams
- BAD: "ARST defeated ISU 27-17. ARST's defense was strong. ISU couldn't score."
- GOOD: "Arkansas State defeated Iowa State 27-17. The Red Wolves' defense was dominant. The Cyclones couldn't find the end zone."

**ABSOLUTELY DO NOT:**
1. Do NOT make up specific times for touchdowns (like "with 3:00 left in the first quarter") unless in SCORING SUMMARY
2. Do NOT invent play-by-play descriptions (like "chipped away at the deficit" or "mounted a final drive") unless you have actual play data
3. Do NOT fabricate quarterback stats, rushing yards, or any numbers not explicitly provided
4. Do NOT create fictional narrative about how drives unfolded unless you have the scoring summary
5. Do NOT make up quotes from players or coaches
6. Do NOT speculate about injuries, weather, crowd, or atmosphere
7. If data is limited, write a SHORT factual recap - do NOT pad with invented details`

/**
 * Build the prompt for a game recap
 * Works with both user games and CPU vs CPU games
 * Includes all available game data for comprehensive article generation
 * @param {object} ctx - The context object from buildGameRecapContext
 * @param {string} customInstructions - Optional custom writing instructions (uses default if not provided)
 */
function buildGameRecapPrompt(ctx, customInstructions = null) {
  // Build the game result line
  const resultLine = `${ctx.winner} defeated ${ctx.loser} ${ctx.winnerScore}-${ctx.loserScore}`

  // Determine home/away teams explicitly
  const homeTeam = ctx.location === 'home' ? ctx.team1 : ctx.location === 'away' ? ctx.team2 : null
  const awayTeam = ctx.location === 'home' ? ctx.team2 : ctx.location === 'away' ? ctx.team1 : null

  let prompt = `You are a college football writer for a major sports publication like ESPN or The Athletic. Write a comprehensive, professional game recap article.

===========================================
FINAL SCORE
===========================================
${resultLine}
Game Type: ${ctx.gameType}
Week ${ctx.week}, ${ctx.year} Season
${homeTeam ? `HOME TEAM: ${homeTeam}` : ''}
${awayTeam ? `AWAY TEAM: ${awayTeam}` : ''}
${!homeTeam && !awayTeam ? 'NEUTRAL SITE GAME' : ''}
${ctx.isOvertime ? 'OVERTIME GAME' : ''}
${ctx.team1Ranking ? `${ctx.team1} Ranking: #${ctx.team1Ranking}` : ''}
${ctx.team2Ranking ? `${ctx.team2} Ranking: #${ctx.team2Ranking}` : ''}`

  // Add quarter-by-quarter scores if available
  if (ctx.quarters) {
    const team1Quarters = ctx.quarters.team || {}
    const team2Quarters = ctx.quarters.opponent || {}
    prompt += `\n
===========================================
QUARTER-BY-QUARTER SCORES
===========================================
         Q1   Q2   Q3   Q4   ${ctx.overtimes ? 'OT   ' : ''}Final
${ctx.team1}:  ${team1Quarters.Q1 ?? '-'}    ${team1Quarters.Q2 ?? '-'}    ${team1Quarters.Q3 ?? '-'}    ${team1Quarters.Q4 ?? '-'}    ${ctx.overtimes ? (ctx.overtimes[0]?.team ?? '-') + '    ' : ''}${ctx.team1Score}
${ctx.team2}:  ${team2Quarters.Q1 ?? '-'}    ${team2Quarters.Q2 ?? '-'}    ${team2Quarters.Q3 ?? '-'}    ${team2Quarters.Q4 ?? '-'}    ${ctx.overtimes ? (ctx.overtimes[0]?.opponent ?? '-') + '    ' : ''}${ctx.team2Score}`
  }

  // Add scoring summary (CRITICAL for game flow narrative)
  if (ctx.scoringSummary && ctx.scoringSummary.length > 0) {
    prompt += `\n
===========================================
SCORING SUMMARY (in chronological order)
===========================================`
    let team1Running = 0
    let team2Running = 0
    ctx.scoringSummary.forEach((play, idx) => {
      const scoreType = play.scoreType || ''
      const patResult = play.patResult || ''

      // Calculate points
      let points = 0
      if (scoreType.includes('TD') && !scoreType.includes('2PT')) {
        points = 6
        if (patResult.includes('Made XP')) points += 1
        else if (patResult.includes('Converted 2PT')) points += 2
      } else if (scoreType === 'Field Goal') {
        points = 3
      } else if (scoreType === 'Safety') {
        points = 2
      } else if (scoreType.includes('2PT') && scoreType.includes('Converted')) {
        points = 2
      }

      // Update running score
      const isTeam1 = play.team?.toUpperCase() === ctx.team1?.toUpperCase()
      if (isTeam1) team1Running += points
      else team2Running += points

      const quarter = play.quarter || '?'
      const timeLeft = play.timeLeft || ''
      const scorer = play.scorer || 'Unknown'
      const passer = play.passer ? ` from ${play.passer}` : ''

      prompt += `\n${idx + 1}. Q${quarter} ${timeLeft} - ${play.team}: ${scorer}${passer} (${scoreType}${patResult ? ', ' + patResult : ''}) → Score: ${ctx.team1} ${team1Running}, ${ctx.team2} ${team2Running}`
    })
  }

  // Add team stats if available
  if (ctx.teamStats) {
    const home = ctx.teamStats.home || {}
    const away = ctx.teamStats.away || {}
    prompt += `\n
===========================================
TEAM STATISTICS
===========================================
                        ${home.teamAbbr || ctx.team1}    ${away.teamAbbr || ctx.team2}
First Downs:            ${home.firstDowns ?? '-'}         ${away.firstDowns ?? '-'}
Total Yards:            ${home.totalYards ?? home.totalOffense ?? '-'}       ${away.totalYards ?? away.totalOffense ?? '-'}
Rushing (ATT-YDS):      ${home.rushAttempts ?? '-'}-${home.rushYards ?? '-'}     ${away.rushAttempts ?? '-'}-${away.rushYards ?? '-'}
Passing (CMP-ATT-YDS):  ${home.completions ?? '-'}-${home.passAttempts ?? '-'}-${home.passYards ?? '-'}   ${away.completions ?? '-'}-${away.passAttempts ?? '-'}-${away.passYards ?? '-'}
Turnovers:              ${home.turnovers ?? '-'}         ${away.turnovers ?? '-'}
3rd Down:               ${home['3rdDownConv'] ?? '-'}/${home['3rdDownAtt'] ?? '-'}       ${away['3rdDownConv'] ?? '-'}/${away['3rdDownAtt'] ?? '-'}
Possession:             ${home.possMinutes ?? ''}:${String(home.possSeconds ?? '').padStart(2, '0')}      ${away.possMinutes ?? ''}:${String(away.possSeconds ?? '').padStart(2, '0')}`
  }

  // Add season context for user games
  if (!ctx.isCPUGame && ctx.recordBefore) {
    prompt += `\n
===========================================
SEASON CONTEXT FOR ${ctx.team1}
===========================================
Record entering game: ${ctx.recordBefore}
Record after game: ${ctx.recordAfter}
${ctx.streak ? `Current streak: ${ctx.streak}` : ''}
${ctx.isConferenceGame ? `Conference game: ${ctx.conference}` : ''}`
  }

  // Add full season results if available
  if (ctx.seasonResults && ctx.seasonResults.length > 0) {
    prompt += `\n\nSeason results before this game:`
    ctx.seasonResults.forEach(g => {
      const resultChar = g.result === 'win' || g.result === 'W' ? 'W' : 'L'
      const locationChar = g.location === 'home' ? 'vs' : g.location === 'away' ? '@' : 'vs'
      const rankStr = g.opponentRank ? `#${g.opponentRank} ` : ''
      prompt += `\n  Week ${g.week}: ${resultChar} ${g.teamScore}-${g.opponentScore} ${locationChar} ${rankStr}${g.opponent}`
    })
  }

  // Add player stats for both teams
  if (ctx.boxScore) {
    const team1Stats = ctx.boxScore.team1
    if (team1Stats) {
      prompt += `\n
===========================================
${ctx.boxScore.team1Name.toUpperCase()} INDIVIDUAL STATS
===========================================`

      if (team1Stats.passing.length > 0) {
        prompt += `\n\nPASSING:`
        team1Stats.passing.forEach(p => {
          prompt += `\n  ${p.player}: ${p.stats}`
        })
      }
      if (team1Stats.rushing.length > 0) {
        prompt += `\n\nRUSHING:`
        team1Stats.rushing.forEach(p => {
          prompt += `\n  ${p.player}: ${p.stats}`
        })
      }
      if (team1Stats.receiving.length > 0) {
        prompt += `\n\nRECEIVING:`
        team1Stats.receiving.forEach(p => {
          prompt += `\n  ${p.player}: ${p.stats}`
        })
      }
      if (team1Stats.defense.length > 0) {
        prompt += `\n\nDEFENSE:`
        team1Stats.defense.forEach(p => {
          prompt += `\n  ${p.player}: ${p.stats}`
        })
      }
      if (team1Stats.kicking.length > 0) {
        prompt += `\n\nKICKING:`
        team1Stats.kicking.forEach(p => {
          prompt += `\n  ${p.player}: ${p.stats}`
        })
      }
    }

    const team2Stats = ctx.boxScore.team2
    if (team2Stats) {
      prompt += `\n
===========================================
${ctx.boxScore.team2Name.toUpperCase()} INDIVIDUAL STATS
===========================================`

      if (team2Stats.passing.length > 0) {
        prompt += `\n\nPASSING:`
        team2Stats.passing.forEach(p => {
          prompt += `\n  ${p.player}: ${p.stats}`
        })
      }
      if (team2Stats.rushing.length > 0) {
        prompt += `\n\nRUSHING:`
        team2Stats.rushing.forEach(p => {
          prompt += `\n  ${p.player}: ${p.stats}`
        })
      }
      if (team2Stats.receiving.length > 0) {
        prompt += `\n\nRECEIVING:`
        team2Stats.receiving.forEach(p => {
          prompt += `\n  ${p.player}: ${p.stats}`
        })
      }
      if (team2Stats.defense.length > 0) {
        prompt += `\n\nDEFENSE:`
        team2Stats.defense.forEach(p => {
          prompt += `\n  ${p.player}: ${p.stats}`
        })
      }
    }
  }

  // Add head-to-head history (rivalry context)
  if (ctx.headToHead && ctx.headToHead.length > 0) {
    prompt += `\n
===========================================
HEAD-TO-HEAD HISTORY (${ctx.team1} vs ${ctx.team2})
===========================================`
    ctx.headToHead.forEach(h => {
      prompt += `\n  ${h.year}: ${h.winner} def. ${h.loser} ${h.winnerScore}-${h.loserScore} (${h.gameType})`
    })
  }

  // Add CFP bracket context
  if (ctx.cfpBracket) {
    prompt += `\n
===========================================
CFP BRACKET CONTEXT
===========================================
Current Round: ${ctx.cfpBracket.round}`
    if (ctx.cfpBracket.seeds && Object.keys(ctx.cfpBracket.seeds).length > 0) {
      prompt += `\nCFP Seeds:`
      Object.entries(ctx.cfpBracket.seeds).forEach(([team, seed]) => {
        if (seed) prompt += `\n  #${seed} ${team}`
      })
    }
    if (ctx.cfpBracket.bracket && ctx.cfpBracket.bracket.length > 0) {
      prompt += `\n\nOther CFP Results This Year:`
      ctx.cfpBracket.bracket.forEach(g => {
        prompt += `\n  ${g.round}: ${g.winner} def. ${g.loser} ${g.score}${g.bowlName ? ` (${g.bowlName})` : ''}`
      })
    }
    // Add next opponent info if available
    if (ctx.cfpBracket.nextRound && ctx.cfpBracket.nextOpponent) {
      prompt += `\n\nNEXT ROUND MATCHUP:`
      prompt += `\n  The winner of this game advances to: ${ctx.cfpBracket.nextRound}`
      prompt += `\n  Next opponent: ${ctx.cfpBracket.nextOpponent}${ctx.cfpBracket.nextOpponentSeed ? ` (#${ctx.cfpBracket.nextOpponentSeed} seed)` : ''}`
      if (ctx.cfpBracket.nextBowl && ctx.cfpBracket.nextBowl !== ctx.cfpBracket.nextRound) {
        prompt += `\n  Location: ${ctx.cfpBracket.nextBowl}`
      }
    }
  }

  // Add bowl history for bowl/CFP games
  if ((ctx.team1BowlHistory && ctx.team1BowlHistory.length > 0) || (ctx.team2BowlHistory && ctx.team2BowlHistory.length > 0)) {
    prompt += `\n
===========================================
POSTSEASON HISTORY
===========================================`
    if (ctx.team1BowlHistory && ctx.team1BowlHistory.length > 0) {
      prompt += `\n${ctx.team1} Recent Bowl/CFP History:`
      ctx.team1BowlHistory.forEach(h => {
        prompt += `\n  ${h.year}: ${h.result} vs ${h.opponent} ${h.score} (${h.gameName})`
      })
    }
    if (ctx.team2BowlHistory && ctx.team2BowlHistory.length > 0) {
      prompt += `\n${ctx.team2} Recent Bowl/CFP History:`
      ctx.team2BowlHistory.forEach(h => {
        prompt += `\n  ${h.year}: ${h.result} vs ${h.opponent} ${h.score} (${h.gameName})`
      })
    }
  }

  if (ctx.gameNotes) {
    prompt += `\n
===========================================
ADDITIONAL NOTES
===========================================
${ctx.gameNotes}`
  }

  // Use custom instructions or default, replacing placeholders
  const instructions = (customInstructions || DEFAULT_GAME_RECAP_INSTRUCTIONS)
    .replace(/\[HOME_TEAM\]/g, homeTeam || 'Neutral site')

  prompt += `\n
===========================================
WRITING INSTRUCTIONS
===========================================

${instructions}`

  return prompt
}

// ============================================
// API CALLS
// ============================================

/**
 * Generate content using Gemini API with retry logic for overloaded errors
 */
export async function generateWithGemini(apiKey, prompt, maxRetries = 3) {
  if (!apiKey) {
    throw new Error('No API key provided')
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.8,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 8192,
          }
        })
      }
    )

    if (!response.ok) {
      const error = await response.json()
      const errorMessage = error.error?.message || 'Failed to generate content'

      // Retry on overloaded errors
      if (errorMessage.toLowerCase().includes('overloaded') && attempt < maxRetries - 1) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt) * 1000
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }

      throw new Error(errorMessage)
    }

    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text

    if (!text) {
      throw new Error('No content generated')
    }

    return text.trim()
  }
}

/**
 * Generate content using Gemini API with streaming
 * @param {string} apiKey - Gemini API key
 * @param {string} prompt - The prompt to send
 * @param {function} onChunk - Callback called with accumulated text as chunks arrive
 * @param {number} maxRetries - Number of retries for overloaded errors
 * @returns {object} { text, usage } - The generated text and token usage info
 */
export async function generateWithGeminiStreaming(apiKey, prompt, onChunk, maxRetries = 3) {
  if (!apiKey) {
    throw new Error('No API key provided')
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.8,
              topK: 40,
              topP: 0.95,
              maxOutputTokens: 8192,
            }
          })
        }
      )

      if (!response.ok) {
        const error = await response.json()
        const errorMessage = error.error?.message || 'Failed to generate content'

        // Provide helpful context for common errors
        if (errorMessage.toLowerCase().includes('quota')) {
          throw new Error(`API quota exceeded. ${errorMessage}. Check your Gemini API usage limits at https://aistudio.google.com/`)
        }
        if (errorMessage.toLowerCase().includes('rate limit')) {
          throw new Error(`Rate limit hit. ${errorMessage}. Wait a moment and try again.`)
        }
        if (errorMessage.toLowerCase().includes('token')) {
          throw new Error(`Token limit error. ${errorMessage}. The prompt may be too long.`)
        }

        // Retry on overloaded errors
        if (errorMessage.toLowerCase().includes('overloaded') && attempt < maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }

        throw new Error(errorMessage)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''
      let usageMetadata = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6)
            if (jsonStr.trim() === '[DONE]') continue

            try {
              const data = JSON.parse(jsonStr)
              const text = data.candidates?.[0]?.content?.parts?.[0]?.text
              if (text) {
                fullText += text
                onChunk(fullText)
              }
              // Capture usage metadata (usually in last chunk)
              if (data.usageMetadata) {
                usageMetadata = data.usageMetadata
              }
            } catch {
              // Skip invalid JSON chunks
            }
          }
        }
      }

      if (!fullText) {
        throw new Error('No content generated')
      }

      return {
        text: fullText.trim(),
        usage: usageMetadata ? {
          promptTokens: usageMetadata.promptTokenCount,
          outputTokens: usageMetadata.candidatesTokenCount,
          totalTokens: usageMetadata.totalTokenCount
        } : null
      }
    } catch (error) {
      // Retry on overloaded errors
      if (error.message?.toLowerCase().includes('overloaded') && attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      throw error
    }
  }
}

// ============================================
// HIGH-LEVEL GENERATION FUNCTIONS
// ============================================

/**
 * Get custom game recap instructions for a user from Firestore
 * Returns null if no custom instructions are set
 */
export async function getCustomRecapInstructions(userId) {
  if (!userId) return null

  try {
    const userDoc = await getDoc(doc(db, 'users', userId))
    return userDoc.exists() ? userDoc.data().gameRecapInstructions : null
  } catch (error) {
    console.error('Error fetching custom instructions:', error)
    return null
  }
}

/**
 * Generate a game recap
 * @param {object} dynasty - The dynasty data
 * @param {object} game - The game data
 * @param {string} apiKey - Gemini API key
 * @param {function} onChunk - Optional callback for streaming (receives accumulated text)
 * @param {string} customInstructions - Optional custom writing instructions
 * @returns {object} { text, usage } - The generated text and token usage info (when streaming)
 */
export async function generateGameRecap(dynasty, game, apiKey, onChunk = null, customInstructions = null) {
  const context = buildGameRecapContext(dynasty, game)
  const prompt = buildGameRecapPrompt(context, customInstructions)

  if (onChunk) {
    // Streaming returns { text, usage }
    return generateWithGeminiStreaming(apiKey, prompt, onChunk)
  }
  // Non-streaming returns just text
  const text = await generateWithGemini(apiKey, prompt)
  return { text, usage: null }
}
