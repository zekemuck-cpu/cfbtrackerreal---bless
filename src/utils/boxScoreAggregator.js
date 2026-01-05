// Box Score Aggregator Utility
// Aggregates per-game box score stats into season totals for players

import { getAbbreviationFromDisplayName } from '../data/teamAbbreviations'

/**
 * Normalize a player name for comparison
 * Handles case differences, extra whitespace, and other variations
 */
function normalizeName(name) {
  if (!name) return ''
  return name.toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Aggregate all box score stats for a player across games in a specific year
 * Simple: if the player appears in a box score, aggregate their stats
 * @param {Object} dynasty - The dynasty object containing games
 * @param {string} playerName - The player's name to search for
 * @param {number} year - The year to aggregate stats for
 * @param {string} teamAbbr - The player's team abbreviation (unused but kept for API compat)
 * @param {Object} player - Optional: The full player object (unused but kept for API compat)
 * @returns {Object} Aggregated stats by category
 */
export function aggregatePlayerBoxScoreStats(dynasty, playerName, year, teamAbbr, player = null) {
  if (!dynasty?.games || !playerName) return null

  // Find all games for this year that have box scores
  // We'll filter by player presence in the box score later
  const yearGames = dynasty.games.filter(g => {
    return Number(g.year) === year && g.boxScore
  })

  if (yearGames.length === 0) return null

  // Initialize aggregated stats
  const stats = {
    gamesWithStats: 0,
    passing: null,
    rushing: null,
    receiving: null,
    blocking: null,
    defense: null,
    kicking: null,
    punting: null,
    kickReturn: null,
    puntReturn: null
  }

  // Stat aggregation configs - which fields to sum vs take max
  const statConfigs = {
    passing: {
      sumFields: ['comp', 'attempts', 'yards', 'tD', 'iNT', 'sacks'],
      maxFields: ['long'],
      rateFields: ['qBRating'] // Calculated at the end
    },
    rushing: {
      sumFields: ['carries', 'yards', 'tD', 'fumbles', 'brokenTackles', 'yAC', '20+'],
      maxFields: ['long']
    },
    receiving: {
      sumFields: ['receptions', 'yards', 'tD', 'drops', 'rAC'],
      maxFields: ['long']
    },
    blocking: {
      sumFields: ['sacksAllowed', 'pancakes'],
      maxFields: []
    },
    defense: {
      sumFields: ['solo', 'assists', 'tFL', 'sack', 'iNT', 'iNTYards', 'deflections', 'fF', 'fR', 'fumbleYards', 'blocks', 'safeties', 'tD'],
      maxFields: ['iNTLong']
    },
    kicking: {
      sumFields: ['fGM', 'fGA', 'fGBlock', 'xPM', 'xPA', 'xPB', 'fGM29', 'fGA29', 'fGM39', 'fGA39', 'fGM49', 'fGA49', 'fGM50+', 'fGA50+', 'kickoffs', 'touchbacks'],
      maxFields: ['fGLong']
    },
    punting: {
      sumFields: ['punts', 'yards', 'netYards', 'block', 'in20', 'tB'],
      maxFields: ['long']
    },
    kickReturn: {
      sumFields: ['kR', 'yards', 'tD'],
      maxFields: ['long']
    },
    puntReturn: {
      sumFields: ['pR', 'yards', 'tD'],
      maxFields: ['long']
    }
  }

  // Process each game
  yearGames.forEach(game => {
    const boxScore = game.boxScore
    if (!boxScore) return

    let foundInGame = false

    // Search BOTH sides of the box score to find the player
    // This is more robust than relying on location field
    for (const side of ['home', 'away']) {
      const sideBoxScore = boxScore[side]
      if (!sideBoxScore) continue

      // Process each stat category
      Object.keys(statConfigs).forEach(category => {
        const categoryStats = sideBoxScore[category]
        if (!categoryStats || !Array.isArray(categoryStats)) return

        // Find player in this category
        const playerStats = categoryStats.find(p =>
          normalizeName(p.playerName) === normalizeName(playerName)
        )

        if (!playerStats) return

        foundInGame = true
        const config = statConfigs[category]

        // Initialize category if needed
        if (!stats[category]) {
          stats[category] = {}
          config.sumFields.forEach(f => stats[category][f] = 0)
          config.maxFields.forEach(f => stats[category][f] = 0)
        }

        // Sum fields
        config.sumFields.forEach(field => {
          const value = parseFloat(playerStats[field]) || 0
          stats[category][field] = (stats[category][field] || 0) + value
        })

        // Max fields (for "long" stats)
        config.maxFields.forEach(field => {
          const value = parseFloat(playerStats[field]) || 0
          stats[category][field] = Math.max(stats[category][field] || 0, value)
        })
      })

      // If we found the player on this side, don't search the other side
      if (foundInGame) break
    }

    if (foundInGame) {
      stats.gamesWithStats++
    }
  })

  // Calculate QB Rating if we have passing stats
  if (stats.passing && stats.passing.attempts > 0) {
    const { comp, attempts, yards, tD, iNT } = stats.passing
    // NFL passer rating formula (simplified)
    const a = Math.max(0, Math.min(2.375, ((comp / attempts) - 0.3) * 5))
    const b = Math.max(0, Math.min(2.375, ((yards / attempts) - 3) * 0.25))
    const c = Math.max(0, Math.min(2.375, (tD / attempts) * 20))
    const d = Math.max(0, Math.min(2.375, 2.375 - ((iNT / attempts) * 25)))
    stats.passing.qBRating = (((a + b + c + d) / 6) * 100).toFixed(1)
  }

  return stats.gamesWithStats > 0 ? stats : null
}

/**
 * Get all season stats for a player from box scores
 * Simple: if the player appears in a box score, include their stats
 * @param {Object} dynasty - The dynasty object
 * @param {Object} player - The player object
 * @returns {Array} Array of year stats objects
 */
export function getPlayerSeasonStatsFromBoxScores(dynasty, player) {
  if (!dynasty?.games || !player) return []

  const playerName = player.name
  const teamAbbr = player.team

  // Find all years where this player appears in box scores
  // Simple: if player is in the box score, include the year
  const years = new Set()
  dynasty.games.forEach(game => {
    if (!game.boxScore || !game.year) return

    const gameYear = Number(game.year)
    const boxScore = game.boxScore

    // Check if player appears in this game's box score
    const checkCategory = (side) => {
      if (!boxScore[side]) return false
      return Object.values(boxScore[side]).some(category =>
        Array.isArray(category) && category.some(p =>
          normalizeName(p.playerName) === normalizeName(playerName)
        )
      )
    }
    if (checkCategory('home') || checkCategory('away')) {
      years.add(gameYear)
    }
  })

  const result = []

  Array.from(years).sort((a, b) => a - b).forEach(year => {
    const aggregated = aggregatePlayerBoxScoreStats(dynasty, playerName, year, teamAbbr, player)
    if (!aggregated) return

    // Convert to the format expected by Player.jsx
    const yearStats = {
      year,
      gamesPlayed: aggregated.gamesWithStats,
      fromBoxScores: true // Flag to indicate this came from box scores
    }

    // Map aggregated stats to display format
    if (aggregated.passing) {
      yearStats.passing = {
        cmp: aggregated.passing.comp || 0,
        att: aggregated.passing.attempts || 0,
        yds: aggregated.passing.yards || 0,
        td: aggregated.passing.tD || 0,
        int: aggregated.passing.iNT || 0,
        lng: aggregated.passing.long || 0,
        sacks: aggregated.passing.sacks || 0,
        rating: aggregated.passing.qBRating || 0
      }
    }

    if (aggregated.rushing) {
      yearStats.rushing = {
        car: aggregated.rushing.carries || 0,
        yds: aggregated.rushing.yards || 0,
        td: aggregated.rushing.tD || 0,
        lng: aggregated.rushing.long || 0,
        fum: aggregated.rushing.fumbles || 0,
        bt: aggregated.rushing.brokenTackles || 0
      }
    }

    if (aggregated.receiving) {
      yearStats.receiving = {
        rec: aggregated.receiving.receptions || 0,
        yds: aggregated.receiving.yards || 0,
        td: aggregated.receiving.tD || 0,
        lng: aggregated.receiving.long || 0,
        drops: aggregated.receiving.drops || 0
      }
    }

    if (aggregated.blocking) {
      yearStats.blocking = {
        sacksAllowed: aggregated.blocking.sacksAllowed || 0,
        pancakes: aggregated.blocking.pancakes || 0
      }
    }

    if (aggregated.defense) {
      yearStats.defensive = {
        solo: aggregated.defense.solo || 0,
        ast: aggregated.defense.assists || 0,
        tfl: aggregated.defense.tFL || 0,
        sacks: aggregated.defense.sack || 0,
        int: aggregated.defense.iNT || 0,
        intYds: aggregated.defense.iNTYards || 0,
        intTd: aggregated.defense.tD || 0,
        pdef: aggregated.defense.deflections || 0,
        ff: aggregated.defense.fF || 0,
        fr: aggregated.defense.fR || 0
      }
    }

    if (aggregated.kicking) {
      yearStats.kicking = {
        fgm: aggregated.kicking.fGM || 0,
        fga: aggregated.kicking.fGA || 0,
        lng: aggregated.kicking.fGLong || 0,
        xpm: aggregated.kicking.xPM || 0,
        xpa: aggregated.kicking.xPA || 0
      }
    }

    if (aggregated.punting) {
      yearStats.punting = {
        punts: aggregated.punting.punts || 0,
        yds: aggregated.punting.yards || 0,
        lng: aggregated.punting.long || 0,
        in20: aggregated.punting.in20 || 0,
        tb: aggregated.punting.tB || 0
      }
    }

    if (aggregated.kickReturn) {
      yearStats.kickReturn = {
        ret: aggregated.kickReturn.kR || 0,
        yds: aggregated.kickReturn.yards || 0,
        td: aggregated.kickReturn.tD || 0,
        lng: aggregated.kickReturn.long || 0
      }
    }

    if (aggregated.puntReturn) {
      yearStats.puntReturn = {
        ret: aggregated.puntReturn.pR || 0,
        yds: aggregated.puntReturn.yards || 0,
        td: aggregated.puntReturn.tD || 0,
        lng: aggregated.puntReturn.long || 0
      }
    }

    result.push(yearStats)
  })

  return result
}

/**
 * Get per-game stats breakdown for a player in a specific year
 * @param {Object} dynasty - The dynasty object
 * @param {string} playerName - The player's name
 * @param {number} year - The year to get game log for
 * @param {string} teamAbbr - The player's team abbreviation
 * @returns {Array} Array of per-game stats
 */
export function getPlayerGameLog(dynasty, playerName, year, teamAbbr) {
  if (!dynasty?.games || !playerName) return []

  // Get all games for this year that have box scores
  // Simple: if the game has a boxScore, it's eligible for the game log
  // We'll filter by player presence in the boxScore later
  const yearGames = dynasty.games.filter(g => {
    return Number(g.year) === year && g.boxScore
  }).sort((a, b) => {
    // Sort by game order: regular season weeks, then CC, then postseason games
    const getGameOrder = (g) => {
      // Conference Championship
      if (g.isConferenceChampionship || g.gameType === 'conference_championship') return 100
      // CFP/Bowl games - use week + offset to come after regular season
      if (g.isCFPFirstRound || g.gameType === 'cfp_first_round') return 101
      if (g.isCFPQuarterfinal || g.gameType === 'cfp_quarterfinal') return 102
      if (g.isCFPSemifinal || g.gameType === 'cfp_semifinal') return 103
      if (g.isCFPChampionship || g.gameType === 'cfp_championship') return 104
      if (g.isBowlGame || g.gameType === 'bowl') return 100 + (parseInt(g.week) || 1)
      // Regular season - use week number
      return parseInt(g.week) || 0
    }
    return getGameOrder(a) - getGameOrder(b)
  })

  const gameLog = []
  const categories = ['passing', 'rushing', 'receiving', 'blocking', 'defense', 'kicking', 'punting', 'kickReturn', 'puntReturn']

  yearGames.forEach(game => {
    const boxScore = game.boxScore
    if (!boxScore) return

    // Search BOTH home and away box scores for this player
    // This handles all cases: user's team, opponent team, any team
    let playerFoundIn = null // 'home' or 'away'
    let playerStats = {}

    for (const side of ['home', 'away']) {
      if (!boxScore[side]) continue

      categories.forEach(category => {
        const categoryStats = boxScore[side][category]
        if (!categoryStats || !Array.isArray(categoryStats)) return

        const found = categoryStats.find(p =>
          normalizeName(p.playerName) === normalizeName(playerName)
        )

        if (found) {
          playerFoundIn = side
          playerStats[category] = { ...found }
        }
      })

      if (playerFoundIn) break // Found player, stop searching
    }

    if (!playerFoundIn) return // Player not in this game

    // SIMPLE APPROACH: Player was found in box score - determine opponent and scores
    // based on which side (home/away) the player was on

    // Determine teams and scores based on game structure
    let playerTeam, opponentTeam, playerTeamScore, opponentTeamScore

    // For games with userTeam/opponent format (regular games, user postseason)
    if (game.opponent) {
      const isUserHome = game.location === 'home' || game.location === 'neutral'
      const userTeam = game.userTeam || getAbbreviationFromDisplayName(dynasty.teamName) || ''

      if (playerFoundIn === 'home') {
        // Player is on home team
        playerTeam = isUserHome ? userTeam : game.opponent
        opponentTeam = isUserHome ? game.opponent : userTeam
        playerTeamScore = isUserHome ? game.teamScore : game.opponentScore
        opponentTeamScore = isUserHome ? game.opponentScore : game.teamScore
      } else {
        // Player is on away team
        playerTeam = isUserHome ? game.opponent : userTeam
        opponentTeam = isUserHome ? userTeam : game.opponent
        playerTeamScore = isUserHome ? game.opponentScore : game.teamScore
        opponentTeamScore = isUserHome ? game.teamScore : game.opponentScore
      }
    }
    // For games with team1/team2 format (CPU games, some CFP games)
    else if (game.team1 && game.team2) {
      if (playerFoundIn === 'home') {
        playerTeam = game.team1
        opponentTeam = game.team2
        playerTeamScore = game.team1Score
        opponentTeamScore = game.team2Score
      } else {
        playerTeam = game.team2
        opponentTeam = game.team1
        playerTeamScore = game.team2Score
        opponentTeamScore = game.team1Score
      }
    } else {
      // Fallback - shouldn't happen but handle gracefully
      return
    }

    // Determine result from player's perspective
    const playerWon = parseInt(playerTeamScore) > parseInt(opponentTeamScore)
    const playerResult = playerWon ? 'W' : 'L'

    gameLog.push({
      gameId: game.id,
      week: game.week,
      opponent: opponentTeam,
      result: playerResult,
      teamScore: playerTeamScore,
      opponentScore: opponentTeamScore,
      ...playerStats
    })
  })

  return gameLog
}
