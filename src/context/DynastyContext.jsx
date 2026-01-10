import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { useAuth } from './AuthContext'
import {
  getUserDynasties,
  subscribeToDynasties,
  createDynasty as createDynastyInFirestore,
  updateDynasty as updateDynastyInFirestore,
  deleteDynasty as deleteDynastyFromFirestore,
  deleteDynastyWithSubcollections,
  migrateLocalStorageData,
  // Subcollection functions
  getPlayersSubcollection,
  getGamesSubcollection,
  savePlayersToSubcollection,
  saveGamesToSubcollection,
  migrateDynastyToSubcollections
} from '../services/dynastyService'
import { createDynastySheet, deleteGoogleSheet, writeExistingDataToSheet, createConferencesSheet, readConferencesFromSheet } from '../services/sheetsService'
import { getTeamName } from '../data/teamAbbreviations'
import { getTeamConference, getConferencesWithCustomTeams } from '../data/conferenceTeams'
import {
  TEAMS,
  initializeDynastyTeams,
  setTeambuilderTeam,
  getTeam,
  getTidFromAbbr,
  getTidFromTeamName,
  getAbbrFromTeamName,
  getTeamYear,
  setTeamYear,
  getTeamYearField,
  setTeamYearField,
  migrateDynastyToTidStructure,
  getAbbrFromTid,
  getNameFromTid,
  getCurrentTeamTid,
  getCurrentTeamAbbr,
  getOriginalTeamAbbr
} from '../data/teamRegistry'
import { findMatchingPlayer, getPlayerLastHonorDescription, normalizePlayerName } from '../utils/playerMatching'
import { getFirstRoundSlotId, getSlotIdFromBowlName, getCFPGameId } from '../data/cfpConstants'

const DynastyContext = createContext()

// ============================================================================
// GAME TYPE CONSTANTS - Unified game classification system
// ============================================================================
export const GAME_TYPES = {
  REGULAR: 'regular',
  CONFERENCE_CHAMPIONSHIP: 'conference_championship',
  BOWL: 'bowl',
  CFP_FIRST_ROUND: 'cfp_first_round',
  CFP_QUARTERFINAL: 'cfp_quarterfinal',
  CFP_SEMIFINAL: 'cfp_semifinal',
  CFP_CHAMPIONSHIP: 'cfp_championship'
}

/**
 * Detect game type from existing game flags
 * Used during migration and for backwards compatibility
 */
export function detectGameType(game) {
  if (game.gameType) return game.gameType // Already has type
  if (game.isCFPChampionship) return GAME_TYPES.CFP_CHAMPIONSHIP
  if (game.isCFPSemifinal) return GAME_TYPES.CFP_SEMIFINAL
  if (game.isCFPQuarterfinal) return GAME_TYPES.CFP_QUARTERFINAL
  if (game.isCFPFirstRound) return GAME_TYPES.CFP_FIRST_ROUND
  if (game.isConferenceChampionship) return GAME_TYPES.CONFERENCE_CHAMPIONSHIP
  if (game.isBowlGame) return GAME_TYPES.BOWL
  return GAME_TYPES.REGULAR
}

/**
 * Get user's perspective on a game based on which team they were coaching that year
 * Returns null if user wasn't coaching or their team didn't play in this game
 *
 * HANDLES BOTH FORMATS:
 * - Unified format: team1Tid, team2Tid, team1Score, team2Score, homeTeamTid
 * - Legacy format: userTeam, opponent, teamScore, opponentScore, location, result
 *
 * @param {Object} game - The game object (either format)
 * @param {Object} dynasty - The dynasty object with coachTeamByYear
 * @returns {Object|null} User's perspective on the game
 */
export function getUserGamePerspective(game, dynasty) {
  if (!game || !dynasty) return null

  // Get user's team tid for this game's year
  // Primary source: coachTeamByYear[year].tid
  let userTid = dynasty.coachTeamByYear?.[game.year]?.tid
  const userTeamAbbr = dynasty.coachTeamByYear?.[game.year]?.team

  // Fallback 1: Derive tid from coachTeamByYear[year].team abbr
  if (!userTid && userTeamAbbr) {
    userTid = getTidFromAbbr(userTeamAbbr)
  }

  // Fallback 2: If this is the current year, use current team tid
  if (!userTid && Number(game.year) === Number(dynasty.currentYear)) {
    userTid = getCurrentTeamTid(dynasty)
  }

  // Fallback 3: For dynasties without coachTeamByYear, derive from teamName
  // This handles older dynasties that haven't been fully migrated
  if (!userTid && dynasty.teamName) {
    userTid = getTidFromTeamName(dynasty.teamName, dynasty.teams)
  }

  // UNIFIED FORMAT: Check if game has team1Tid/team2Tid
  if (game.team1Tid && game.team2Tid) {
    // Check if user's team played in this game (by tid)
    const isUserGame = game.team1Tid === userTid || game.team2Tid === userTid
    if (!isUserGame) return null  // User's team didn't play

    const isUserTeam1 = game.team1Tid === userTid
    const userScore = isUserTeam1 ? game.team1Score : game.team2Score
    const opponentScore = isUserTeam1 ? game.team2Score : game.team1Score

    return {
      userTid,
      opponentTid: isUserTeam1 ? game.team2Tid : game.team1Tid,
      userScore,
      opponentScore,
      userWon: userScore > opponentScore,
      userRank: isUserTeam1 ? game.team1Rank : game.team2Rank,
      opponentRank: isUserTeam1 ? game.team2Rank : game.team1Rank,
      userOverall: isUserTeam1 ? game.team1Overall : game.team2Overall,
      opponentOverall: isUserTeam1 ? game.team2Overall : game.team1Overall,
      isHome: game.homeTeamTid === userTid,
      isAway: game.homeTeamTid !== null && game.homeTeamTid !== userTid,
      isNeutral: game.homeTeamTid === null
    }
  }

  // LEGACY FORMAT: Check userTeam/opponent fields
  // Only match if userTeam matches the team user was coaching that year
  if (game.userTeam) {
    // Get tid from userTeam abbreviation to compare
    const gameUserTid = getTidFromAbbr(game.userTeam)

    // Check if this game's userTeam matches what we coached that year
    if (userTid && gameUserTid !== userTid) return null  // Different team
    if (!userTid && userTeamAbbr && game.userTeam !== userTeamAbbr) return null

    // Get opponent tid for the perspective
    const opponentTid = game.opponentTid || getTidFromAbbr(game.opponent)

    // Determine win/loss from result field or scores
    let userWon = false
    if (game.result) {
      userWon = game.result === 'win' || game.result === 'W'
    } else if (game.teamScore !== undefined && game.opponentScore !== undefined) {
      userWon = Number(game.teamScore) > Number(game.opponentScore)
    }

    return {
      userTid: gameUserTid || userTid,
      opponentTid,
      userScore: game.teamScore,
      opponentScore: game.opponentScore,
      userWon,
      userRank: game.userRank,
      opponentRank: game.opponentRank,
      userOverall: null,  // Not stored in legacy format
      opponentOverall: game.opponentOverall,
      isHome: game.location === 'home',
      isAway: game.location === 'away',
      isNeutral: game.location === 'neutral' || (!game.location && (game.isBowlGame || game.isConferenceChampionship || game.isCFPFirstRound || game.isCFPQuarterfinal || game.isCFPSemifinal || game.isCFPChampionship))
    }
  }

  // CPU-only game (no user involvement) - check legacy team1/team2 format
  if (game.team1 && game.team2 && !game.userTeam && !game.opponent) {
    // This is a CPU game in legacy format - user didn't play
    return null
  }

  return null  // Unknown format or user didn't play
}

/**
 * Check if a game involves a specific team (by tid)
 * @param {Object} game - The game object
 * @param {number} tid - Team ID to check
 * @returns {boolean} True if team played in this game
 */
export function isTeamInGame(game, tid) {
  if (!game || !tid) return false
  return game.team1Tid === tid || game.team2Tid === tid
}

/**
 * Get a team's perspective on a game (for TeamYear page, etc.)
 * @param {Object} game - The game object
 * @param {number} tid - Team ID to get perspective for
 * @returns {Object|null} Team's perspective
 */
export function getTeamGamePerspective(game, tid) {
  if (!game || !tid) return null
  if (!isTeamInGame(game, tid)) return null

  const isTeam1 = game.team1Tid === tid
  const teamScore = isTeam1 ? game.team1Score : game.team2Score
  const opponentScore = isTeam1 ? game.team2Score : game.team1Score

  return {
    teamTid: tid,
    opponentTid: isTeam1 ? game.team2Tid : game.team1Tid,
    teamScore,
    opponentScore,
    won: teamScore > opponentScore,
    teamRank: isTeam1 ? game.team1Rank : game.team2Rank,
    opponentRank: isTeam1 ? game.team2Rank : game.team1Rank,
    isHome: game.homeTeamTid === tid,
    isAway: game.homeTeamTid !== null && game.homeTeamTid !== tid,
    isNeutral: game.homeTeamTid === null
  }
}

/**
 * Get games by type from unified games array
 * @param {Object} dynasty - The dynasty object
 * @param {string} gameType - One of GAME_TYPES values
 * @param {number} [year] - Optional year filter
 * @returns {Array} Games matching the type
 */
export function getGamesByType(dynasty, gameType, year = null) {
  if (!dynasty) return []
  const games = dynasty.games || []

  return games.filter(g => {
    const type = detectGameType(g)
    if (type !== gameType) return false
    if (year !== null && Number(g.year) !== Number(year)) return false
    return true
  })
}

/**
 * Get all CFP games for a year (all CFP rounds)
 */
export function getCFPGames(dynasty, year) {
  if (!dynasty) return []
  const games = dynasty.games || []

  return games.filter(g => {
    if (Number(g.year) !== Number(year)) return false
    const type = detectGameType(g)
    return type === GAME_TYPES.CFP_FIRST_ROUND ||
           type === GAME_TYPES.CFP_QUARTERFINAL ||
           type === GAME_TYPES.CFP_SEMIFINAL ||
           type === GAME_TYPES.CFP_CHAMPIONSHIP
  })
}

/**
 * Get a specific game by teams and year (for finding duplicates)
 */
export function findGameByTeams(dynasty, team1, team2, year, gameType = null) {
  if (!dynasty) return null
  const games = dynasty.games || []

  return games.find(g => {
    if (Number(g.year) !== Number(year)) return false

    // Check if teams match (in either order)
    const teamsMatch =
      (g.team1 === team1 && g.team2 === team2) ||
      (g.team1 === team2 && g.team2 === team1) ||
      (g.userTeam === team1 && g.opponent === team2) ||
      (g.userTeam === team2 && g.opponent === team1)

    if (!teamsMatch) return false

    // If gameType specified, check it matches
    if (gameType && detectGameType(g) !== gameType) return false

    return true
  })
}

/**
 * Migrate dynasty to unified game system
 * Converts cfpResultsByYear, bowlGamesByYear, conferenceChampionshipsByYear to games[]
 * Safe to run multiple times (idempotent)
 */
export function migrateToUnifiedGames(dynasty) {
  if (!dynasty) return dynasty

  const existingGames = [...(dynasty.games || [])]
  const migratedGames = []
  const processedKeys = new Set() // Track what we've processed to avoid duplicates

  // Helper to generate a unique key for dedup
  const getGameKey = (year, team1, team2, type) => {
    const teams = [team1, team2].sort().join('-')
    return `${year}-${teams}-${type}`
  }

  // Helper to check if game already exists
  const gameExists = (year, team1, team2, type) => {
    const key = getGameKey(year, team1, team2, type)
    if (processedKeys.has(key)) return true

    // Check in existing games array
    const found = existingGames.find(g => {
      const gType = detectGameType(g)
      if (gType !== type) return false
      if (Number(g.year) !== Number(year)) return false

      const gTeam1 = g.team1 || g.userTeam
      const gTeam2 = g.team2 || g.opponent
      const matchedTeams = [gTeam1, gTeam2].sort().join('-')
      return matchedTeams === [team1, team2].sort().join('-')
    })

    return !!found
  }

  // Process existing games - add gameType if missing
  existingGames.forEach(game => {
    const gameType = detectGameType(game)
    const team1 = game.team1 || game.userTeam
    const team2 = game.team2 || game.opponent
    const key = getGameKey(game.year, team1, team2, gameType)

    migratedGames.push({
      ...game,
      gameType,
      // Normalize team fields
      team1: team1,
      team2: team2
    })
    processedKeys.add(key)
  })

  // Migrate CFP results
  const cfpResults = dynasty.cfpResultsByYear || {}
  Object.entries(cfpResults).forEach(([year, yearData]) => {
    if (!yearData) return

    // First Round
    const firstRound = Array.isArray(yearData.firstRound) ? yearData.firstRound : []
    firstRound.forEach(game => {
      if (!game || !game.team1 || !game.team2) return
      if (gameExists(year, game.team1, game.team2, GAME_TYPES.CFP_FIRST_ROUND)) return

      const key = getGameKey(year, game.team1, game.team2, GAME_TYPES.CFP_FIRST_ROUND)
      processedKeys.add(key)

      migratedGames.push({
        id: game.id || `migrate-cfp-fr-${year}-${game.team1}-${game.team2}`,
        year: Number(year),
        gameType: GAME_TYPES.CFP_FIRST_ROUND,
        team1: game.team1,
        team2: game.team2,
        team1Score: game.team1Score,
        team2Score: game.team2Score,
        winner: game.winner,
        cfpSeed1: game.seed1,
        cfpSeed2: game.seed2,
        isCFPFirstRound: true // Keep legacy flag for backwards compat
      })
    })

    // Quarterfinals
    const quarterfinals = Array.isArray(yearData.quarterfinals) ? yearData.quarterfinals : []
    quarterfinals.forEach(game => {
      if (!game || !game.team1 || !game.team2) return
      if (gameExists(year, game.team1, game.team2, GAME_TYPES.CFP_QUARTERFINAL)) return

      const key = getGameKey(year, game.team1, game.team2, GAME_TYPES.CFP_QUARTERFINAL)
      processedKeys.add(key)

      migratedGames.push({
        id: game.id || `migrate-cfp-qf-${year}-${game.team1}-${game.team2}`,
        year: Number(year),
        gameType: GAME_TYPES.CFP_QUARTERFINAL,
        team1: game.team1,
        team2: game.team2,
        team1Score: game.team1Score,
        team2Score: game.team2Score,
        winner: game.winner,
        bowlName: game.bowlName,
        cfpSeed1: game.seed1,
        cfpSeed2: game.seed2,
        isCFPQuarterfinal: true
      })
    })

    // Semifinals
    const semifinals = Array.isArray(yearData.semifinals) ? yearData.semifinals : []
    semifinals.forEach(game => {
      if (!game || !game.team1 || !game.team2) return
      if (gameExists(year, game.team1, game.team2, GAME_TYPES.CFP_SEMIFINAL)) return

      const key = getGameKey(year, game.team1, game.team2, GAME_TYPES.CFP_SEMIFINAL)
      processedKeys.add(key)

      migratedGames.push({
        id: game.id || `migrate-cfp-sf-${year}-${game.team1}-${game.team2}`,
        year: Number(year),
        gameType: GAME_TYPES.CFP_SEMIFINAL,
        team1: game.team1,
        team2: game.team2,
        team1Score: game.team1Score,
        team2Score: game.team2Score,
        winner: game.winner,
        bowlName: game.bowlName,
        cfpSeed1: game.seed1,
        cfpSeed2: game.seed2,
        isCFPSemifinal: true
      })
    })

    // Championship
    const championship = Array.isArray(yearData.championship) ? yearData.championship : []
    championship.forEach(game => {
      if (!game || !game.team1 || !game.team2) return
      if (gameExists(year, game.team1, game.team2, GAME_TYPES.CFP_CHAMPIONSHIP)) return

      const key = getGameKey(year, game.team1, game.team2, GAME_TYPES.CFP_CHAMPIONSHIP)
      processedKeys.add(key)

      migratedGames.push({
        id: game.id || `migrate-cfp-nc-${year}-${game.team1}-${game.team2}`,
        year: Number(year),
        gameType: GAME_TYPES.CFP_CHAMPIONSHIP,
        team1: game.team1,
        team2: game.team2,
        team1Score: game.team1Score,
        team2Score: game.team2Score,
        winner: game.winner,
        cfpSeed1: game.seed1,
        cfpSeed2: game.seed2,
        isCFPChampionship: true
      })
    })
  })

  // Migrate Bowl results
  const bowlResults = dynasty.bowlGamesByYear || {}
  Object.entries(bowlResults).forEach(([year, yearData]) => {
    if (!yearData) return

    // Process week1 and week2 bowls
    ['week1', 'week2'].forEach(weekKey => {
      const weekGames = Array.isArray(yearData[weekKey]) ? yearData[weekKey] : []
      weekGames.forEach(game => {
        if (!game || !game.team1 || !game.team2) return
        if (!game.bowlName) return // Skip if no bowl name
        if (gameExists(year, game.team1, game.team2, GAME_TYPES.BOWL)) return

        const key = getGameKey(year, game.team1, game.team2, GAME_TYPES.BOWL)
        processedKeys.add(key)

        migratedGames.push({
          id: game.id || `migrate-bowl-${year}-${game.bowlName.replace(/\s+/g, '-')}`,
          year: Number(year),
          gameType: GAME_TYPES.BOWL,
          team1: game.team1,
          team2: game.team2,
          team1Score: game.team1Score,
          team2Score: game.team2Score,
          winner: game.winner,
          bowlName: game.bowlName,
          bowlWeek: weekKey,
          isBowlGame: true
        })
      })
    })
  })

  // Migrate Conference Championship results
  const ccResults = dynasty.conferenceChampionshipsByYear || {}
  Object.entries(ccResults).forEach(([year, yearData]) => {
    if (!yearData) return

    const games = Array.isArray(yearData) ? yearData : []
    games.forEach(game => {
      if (!game || !game.team1 || !game.team2) return
      if (gameExists(year, game.team1, game.team2, GAME_TYPES.CONFERENCE_CHAMPIONSHIP)) return

      const key = getGameKey(year, game.team1, game.team2, GAME_TYPES.CONFERENCE_CHAMPIONSHIP)
      processedKeys.add(key)

      migratedGames.push({
        id: game.id || `migrate-cc-${year}-${game.conference || 'unknown'}`,
        year: Number(year),
        gameType: GAME_TYPES.CONFERENCE_CHAMPIONSHIP,
        team1: game.team1,
        team2: game.team2,
        team1Score: game.team1Score,
        team2Score: game.team2Score,
        winner: game.winner,
        conference: game.conference,
        isConferenceChampionship: true
      })
    })
  })

  return {
    ...dynasty,
    games: migratedGames,
    // Mark as migrated to avoid re-running
    _gamesMigrated: true
  }
}

// ============================================================================
// BOX SCORE STATS AGGREGATION
// Aggregate player stats from game box scores into player.statsByYear
// ============================================================================

/**
 * Box score category definitions
 * Maps box score field names to aggregation strategy
 * 'sum' = add values across games, 'max' = take max (for long plays)
 */
const BOX_SCORE_STATS = {
  passing: {
    sum: ['comp', 'attempts', 'yards', 'tD', 'iNT', 'sacks'],
    max: ['long']
  },
  rushing: {
    sum: ['carries', 'yards', 'tD', 'fumbles', '20+', 'brokenTackles', 'yAC'],
    max: ['long']
  },
  receiving: {
    sum: ['receptions', 'yards', 'tD', 'rAC', 'drops'],
    max: ['long']
  },
  blocking: {
    sum: ['pancakes', 'sacksAllowed']
  },
  defense: {
    sum: ['solo', 'assists', 'tFL', 'sack', 'iNT', 'iNTYards', 'deflections', 'tD', 'fF', 'fR']
  },
  kicking: {
    sum: ['fGM', 'fGA', 'xPM', 'xPA', 'kickoffs', 'touchbacks']
  },
  punting: {
    sum: ['punts', 'yards', 'netYards', 'in20', 'touchbacks'],
    max: ['long']
  },
  kickReturn: {
    sum: ['kR', 'yards', 'tD'],
    max: ['long']
  },
  puntReturn: {
    sum: ['pR', 'yards', 'tD'],
    max: ['long']
  }
}

// Convert box score format to internal format for statsByYear storage
const BOXSCORE_TO_INTERNAL_MAP = {
  passing: { comp: 'cmp', attempts: 'att', yards: 'yds', tD: 'td', iNT: 'int', long: 'lng', sacks: 'sacks' },
  rushing: { carries: 'car', yards: 'yds', tD: 'td', long: 'lng', fumbles: 'fum', brokenTackles: 'bt', yAC: 'yac', '20+': 'twentyPlus' },
  receiving: { receptions: 'rec', yards: 'yds', tD: 'td', long: 'lng', drops: 'drops', rAC: 'rac' },
  blocking: { pancakes: 'pancakes', sacksAllowed: 'sacksAllowed' },
  defense: { solo: 'soloTkl', assists: 'astTkl', tFL: 'tfl', sack: 'sacks', iNT: 'int', iNTYards: 'intYds', deflections: 'pd', tD: 'td', fF: 'ff', fR: 'fr' },
  kicking: { fGM: 'fgm', fGA: 'fga', xPM: 'xpm', xPA: 'xpa', kickoffs: 'kickoffs', touchbacks: 'touchbacks', fGLong: 'lng' },
  punting: { punts: 'punts', yards: 'yds', netYards: 'netYds', in20: 'in20', touchbacks: 'tb', long: 'lng' },
  kickReturn: { kR: 'ret', yards: 'yds', tD: 'td', long: 'lng' },
  puntReturn: { pR: 'ret', yards: 'yds', tD: 'td', long: 'lng' }
}

// Convert box score stats object to internal format
function convertBoxScoreToInternal(boxScoreStats, category) {
  const mapping = BOXSCORE_TO_INTERNAL_MAP[category] || {}
  const result = {}
  Object.entries(boxScoreStats).forEach(([key, value]) => {
    const internalKey = mapping[key] || key
    result[internalKey] = value
  })
  return result
}

/**
 * Extract stats contribution from a box score
 * Returns an object mapping player names to their stats in INTERNAL format
 * @param {Object} boxScore - The game's box score object
 * @returns {Object} { "player name (lowercase)": { passing: {...}, rushing: {...}, ... } }
 */
function extractBoxScoreContribution(boxScore) {
  if (!boxScore) return {}

  const contribution = {}

  // Search both sides of box score
  for (const side of ['home', 'away']) {
    const sideBoxScore = boxScore[side]
    if (!sideBoxScore) continue

    // Process each stat category
    Object.keys(BOX_SCORE_STATS).forEach(category => {
      const categoryStats = sideBoxScore[category]
      if (!Array.isArray(categoryStats)) return

      categoryStats.forEach(playerRow => {
        const playerName = normalizePlayerName(playerRow.playerName)
        if (!playerName) return

        // Initialize player if not exists
        if (!contribution[playerName]) {
          contribution[playerName] = { _hadStats: true }
        }

        // Initialize category if not exists
        if (!contribution[playerName][category]) {
          contribution[playerName][category] = {}
        }

        // Extract all stat fields (in box score format)
        const allFields = [...(BOX_SCORE_STATS[category].sum || []), ...(BOX_SCORE_STATS[category].max || [])]
        allFields.forEach(field => {
          const value = parseFloat(playerRow[field]) || 0
          contribution[playerName][category][field] = value
        })
      })
    })
  }

  // Convert all stats to internal format
  Object.keys(contribution).forEach(playerName => {
    Object.keys(BOX_SCORE_STATS).forEach(category => {
      if (contribution[playerName][category]) {
        contribution[playerName][category] = convertBoxScoreToInternal(
          contribution[playerName][category],
          category
        )
      }
    })
  })

  return contribution
}

/**
 * Apply box score delta to player stats
 * Calculates difference between new and old contribution, applies to player.statsByYear
 * @param {Array} players - Array of player objects
 * @param {Object} newContribution - New stats contribution from box score
 * @param {Object} oldContribution - Previous stats contribution (null for new games)
 * @param {number} year - The year to update stats for
 * @returns {Array} Updated players array
 */
function applyBoxScoreDelta(players, newContribution, oldContribution, year) {
  const yearNum = Number(year)

  // Get all player names that appear in either contribution
  const allPlayerNames = new Set([
    ...Object.keys(newContribution || {}),
    ...Object.keys(oldContribution || {})
  ])

  return players.map(player => {
    const playerNameNormalized = normalizePlayerName(player.name)
    if (!allPlayerNames.has(playerNameNormalized)) return player

    const newStats = newContribution?.[playerNameNormalized] || {}
    const oldStats = oldContribution?.[playerNameNormalized] || {}

    const existingStatsByYear = player.statsByYear || {}
    const existingYearStats = { ...(existingStatsByYear[yearNum] || {}) }

    // Process each category
    Object.keys(BOX_SCORE_STATS).forEach(category => {
      const newCatStats = newStats[category] || {}
      const oldCatStats = oldStats[category] || {}

      // Get all fields for this category (in internal format)
      const internalMapping = BOXSCORE_TO_INTERNAL_MAP[category] || {}
      const allInternalFields = new Set([
        ...Object.keys(newCatStats),
        ...Object.keys(oldCatStats)
      ])

      if (allInternalFields.size === 0) return

      // Initialize category if needed
      if (!existingYearStats[category]) {
        existingYearStats[category] = {}
      }

      // Determine which fields are "max" fields (need special handling)
      const maxFields = (BOX_SCORE_STATS[category].max || []).map(f => internalMapping[f] || f)

      // Apply delta for each field
      allInternalFields.forEach(field => {
        const newVal = newCatStats[field] || 0
        const oldVal = oldCatStats[field] || 0
        const currentVal = existingYearStats[category][field] || 0

        if (maxFields.includes(field)) {
          // For "long" fields, take max of current and new
          existingYearStats[category][field] = Math.max(currentVal, newVal)
        } else {
          // For sum fields, apply delta
          const delta = newVal - oldVal
          existingYearStats[category][field] = Math.max(0, currentVal + delta)
        }
      })
    })

    // Update games played: increment if new game had stats, decrement if old game had stats but new doesn't
    const newHadStats = newStats._hadStats
    const oldHadStats = oldStats._hadStats

    if (newHadStats && !oldHadStats) {
      // New game with stats for this player
      existingYearStats.gamesPlayed = (existingYearStats.gamesPlayed || 0) + 1
    } else if (!newHadStats && oldHadStats) {
      // Player was removed from box score
      existingYearStats.gamesPlayed = Math.max(0, (existingYearStats.gamesPlayed || 0) - 1)
    }

    return {
      ...player,
      statsByYear: {
        ...existingStatsByYear,
        [yearNum]: existingYearStats
      }
    }
  })
}

/**
 * Process box score save - extracts contribution, applies delta, returns updated players and contribution
 * @param {Array} players - Current players array
 * @param {Object} newBoxScore - The new box score being saved
 * @param {Object} oldContribution - Previous statsContributed from the game (null for new games)
 * @param {number} year - The year
 * @returns {Object} { updatedPlayers, statsContributed }
 */
export function processBoxScoreSave(players, newBoxScore, oldContribution, year) {
  const newContribution = extractBoxScoreContribution(newBoxScore)
  const updatedPlayers = applyBoxScoreDelta(players, newContribution, oldContribution, year)

  return {
    updatedPlayers,
    statsContributed: newContribution
  }
}

/**
 * Process box score deletion - subtracts the contribution from player stats
 * @param {Array} players - Current players array
 * @param {Object} oldContribution - The statsContributed from the deleted game
 * @param {number} year - The year
 * @returns {Array} Updated players array
 */
export function processBoxScoreDelete(players, oldContribution, year) {
  // Deleting is like applying a delta where new contribution is empty
  return applyBoxScoreDelta(players, {}, oldContribution, year)
}

/**
 * Recalculate ALL player stats from ALL box scores for a given year
 * This is more robust than delta tracking - just sum everything fresh
 * @param {Array} players - Current players array
 * @param {Array} games - All games array
 * @param {number} year - The year to recalculate
 * @param {number|string} userTeamTidOrAbbr - The user's team tid or abbreviation
 * @returns {Array} Updated players array with recalculated stats
 */
export function recalculateStatsFromBoxScores(players, games, year, userTeamTidOrAbbr) {
  const yearNum = Number(year)

  // Convert to tid for consistent comparison
  const userTid = typeof userTeamTidOrAbbr === 'number' ? userTeamTidOrAbbr : getTidFromAbbr(userTeamTidOrAbbr)

  // Get all games for this year that have box scores
  // Support both new (userTid) and old (userTeam) fields
  const gamesWithBoxScores = (games || []).filter(g => {
    if (Number(g.year) !== yearNum || !g.boxScore) return false
    // Prefer tid comparison, fall back to abbr comparison
    if (g.userTid) return g.userTid === userTid
    if (g.userTeam) return g.userTeam === userTeamTidOrAbbr || getTidFromAbbr(g.userTeam) === userTid
    return false
  })

  // Build aggregated stats for each player from all box scores
  const aggregatedStats = {} // { normalizedPlayerName: { category: { field: value } } }
  const gamesPlayedCount = {} // { normalizedPlayerName: count }

  gamesWithBoxScores.forEach(game => {
    const contribution = extractBoxScoreContribution(game.boxScore)

    Object.keys(contribution).forEach(playerName => {
      const playerStats = contribution[playerName]

      // Track games played
      if (playerStats._hadStats) {
        gamesPlayedCount[playerName] = (gamesPlayedCount[playerName] || 0) + 1
      }

      // Initialize player if needed
      if (!aggregatedStats[playerName]) {
        aggregatedStats[playerName] = {}
      }

      // Aggregate each category
      Object.keys(BOX_SCORE_STATS).forEach(category => {
        if (!playerStats[category]) return

        if (!aggregatedStats[playerName][category]) {
          aggregatedStats[playerName][category] = {}
        }

        // Get max fields for this category
        const internalMapping = BOXSCORE_TO_INTERNAL_MAP[category] || {}
        const maxFields = (BOX_SCORE_STATS[category].max || []).map(f => internalMapping[f] || f)

        // Sum or max each field
        Object.keys(playerStats[category]).forEach(field => {
          const value = playerStats[category][field] || 0
          const currentValue = aggregatedStats[playerName][category][field] || 0

          if (maxFields.includes(field)) {
            // For "long" fields, take the max
            aggregatedStats[playerName][category][field] = Math.max(currentValue, value)
          } else {
            // For sum fields, add
            aggregatedStats[playerName][category][field] = currentValue + value
          }
        })
      })
    })
  })

  // Apply aggregated stats to players
  return players.map(player => {
    const playerNameNormalized = normalizePlayerName(player.name)
    const playerAggregated = aggregatedStats[playerNameNormalized]

    if (!playerAggregated) {
      // Player has no box score stats for this year - preserve existing stats
      // but clear box score derived stats if they existed
      return player
    }

    const existingStatsByYear = player.statsByYear || {}
    const existingYearStats = existingStatsByYear[yearNum] || {}
    const boxScoreGamesPlayed = gamesPlayedCount[playerNameNormalized]

    // Build new year stats - sync box score stat categories (passing, rushing, etc.)
    // but preserve manually entered gamesPlayed and snapsPlayed
    const newYearStats = {
      // Preserve gamesPlayed if manually entered and player not found in box scores
      // Only overwrite if player was actually found in box score data
      gamesPlayed: boxScoreGamesPlayed !== undefined
        ? boxScoreGamesPlayed
        : (existingYearStats.gamesPlayed ?? 0),
      // Preserve snapsPlayed if it exists (manually entered)
      ...(existingYearStats.snapsPlayed !== undefined ? { snapsPlayed: existingYearStats.snapsPlayed } : {}),
      // Add all aggregated category stats from box scores
      ...playerAggregated
    }

    return {
      ...player,
      statsByYear: {
        ...existingStatsByYear,
        [yearNum]: newYearStats
      }
    }
  })
}

/**
 * Get box score totals for a single player for a specific year
 * Returns null if player has no box score stats, otherwise returns aggregated stats
 * @param {string} playerName - Player name
 * @param {Array} games - All games array
 * @param {number} year - The year to check
 * @param {string} userTeam - The user's team abbreviation
 * @returns {Object|null} { gamesPlayed, passing, rushing, etc. } or null if no box score data
 */
export function getPlayerBoxScoreTotals(playerName, games, year, userTeam) {
  const yearNum = Number(year)
  const playerNameNormalized = normalizePlayerName(playerName)

  // Get all games for this year that have box scores
  // NOTE: Don't filter by userTeam - we want stats from ALL games where the player appeared
  // This handles cases where the coach has moved to a new team but we're viewing old player stats
  // The player's appearance in the box score is what matters, not userTeam
  const gamesWithBoxScores = (games || []).filter(g =>
    Number(g.year) === yearNum && g.boxScore
  )

  if (gamesWithBoxScores.length === 0) return null

  // Build aggregated stats for this player
  let gamesPlayed = 0
  const aggregatedStats = {}

  gamesWithBoxScores.forEach(game => {
    const contribution = extractBoxScoreContribution(game.boxScore)
    const playerStats = contribution[playerNameNormalized]

    if (!playerStats) return

    // Track games played
    if (playerStats._hadStats) {
      gamesPlayed++
    }

    // Aggregate each category
    Object.keys(BOX_SCORE_STATS).forEach(category => {
      if (!playerStats[category]) return

      if (!aggregatedStats[category]) {
        aggregatedStats[category] = {}
      }

      // Get max fields for this category
      const internalMapping = BOXSCORE_TO_INTERNAL_MAP[category] || {}
      const maxFields = (BOX_SCORE_STATS[category].max || []).map(f => internalMapping[f] || f)

      // Sum or max each field
      Object.keys(playerStats[category]).forEach(field => {
        const value = playerStats[category][field] || 0
        const currentValue = aggregatedStats[category][field] || 0

        if (maxFields.includes(field)) {
          aggregatedStats[category][field] = Math.max(currentValue, value)
        } else {
          aggregatedStats[category][field] = currentValue + value
        }
      })
    })
  })

  // If player had no stats in any box score, return null
  if (gamesPlayed === 0 && Object.keys(aggregatedStats).length === 0) return null

  return {
    gamesPlayed,
    ...aggregatedStats
  }
}

// ============================================================================
// TEAM-CENTRIC HELPER FUNCTIONS
// These functions get/set data specific to the current team and year
// ============================================================================

// ============================================================================
// CUSTOM TEAMS (TEAMBUILDER) SUPPORT
// Custom teams replace FBS teams with user-created teams
// ============================================================================

/**
 * Get custom teams from dynasty (for Teambuilder feature)
 * @param {Object} dynasty - Dynasty object
 * @returns {Object|null} Custom teams object or null
 */
export function getCustomTeams(dynasty) {
  return dynasty?.customTeams || null
}

/**
 * Check if the dynasty has any custom teams
 * @param {Object} dynasty - Dynasty object
 * @returns {boolean} True if dynasty has custom teams
 */
export function hasCustomTeams(dynasty) {
  return dynasty?.customTeams && Object.keys(dynasty.customTeams).length > 0
}

/**
 * Get custom team by abbreviation
 * @param {Object} dynasty - Dynasty object
 * @param {string} abbr - Team abbreviation (custom or replaced)
 * @returns {Object|null} Custom team data or null
 */
export function getCustomTeam(dynasty, abbr) {
  if (!dynasty?.customTeams) return null

  // Direct match on custom abbreviation
  if (dynasty.customTeams[abbr]) {
    return dynasty.customTeams[abbr]
  }

  // Check if this abbreviation was replaced by a custom team
  const replaced = Object.values(dynasty.customTeams).find(t => t.replacesTeam === abbr)
  return replaced || null
}

/**
 * Get the abbreviation to use for a team (resolves replaced teams to custom team abbr)
 * @param {Object} dynasty - Dynasty object
 * @param {string} abbr - Original team abbreviation
 * @returns {string} Custom team abbreviation if replaced, otherwise original
 */
export function resolveTeamAbbr(dynasty, abbr) {
  if (!dynasty?.customTeams) return abbr

  const customTeam = Object.values(dynasty.customTeams).find(t => t.replacesTeam === abbr)
  return customTeam ? customTeam.abbreviation : abbr
}

// ============================================================================

/**
 * Get the current team's schedule for the current year
 * Falls back to legacy structures for backwards compatibility
 */
export function getCurrentSchedule(dynasty) {
  if (!dynasty) return []

  const teamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName
  const year = dynasty.currentYear

  // Try NEW tid-based byYear structure first (Phase 7 migration)
  const tid = getTidFromAbbr(teamAbbr)
  if (tid && dynasty.teams?.[tid]?.byYear?.[year]?.schedule) {
    return dynasty.teams[tid].byYear[year].schedule
  }

  // Try old team-centric structure (schedulesByTeamYear)
  const teamYearSchedule = dynasty.schedulesByTeamYear?.[teamAbbr]?.[year]
  if (teamYearSchedule) {
    return teamYearSchedule
  }

  // Only fall back to legacy schedule for the dynasty's first year
  // For subsequent years, return empty (new year = new schedule needed)
  if (year === dynasty.startYear) {
    const legacySchedule = dynasty.schedule || []
    if (legacySchedule.length > 0) {
      const firstEntry = legacySchedule[0]
      // If legacy schedule has userTeam that matches current team, use it
      if (firstEntry.userTeam === teamAbbr || !firstEntry.userTeam) {
        return legacySchedule
      }
    }
  }

  return []
}

/**
 * UNIFIED ROSTER MEMBERSHIP CHECK - Single source of truth
 * Check if a player is on a specific team's roster for a given year.
 * Uses teamsByYear as the ONLY source of truth for roster membership.
 * All components should use this function for consistent roster filtering.
 *
 * After full tid migration, teamsByYear stores tid values (numbers).
 * This function accepts either tid (number) or abbreviation (string) for backward compatibility.
 *
 * @param {Object} player - The player object
 * @param {number|string} tidOrAbbr - Team ID (tid) or abbreviation (for backward compatibility)
 * @param {number|string} year - The year to check
 * @returns {boolean} True if player is on the team's roster
 */
export function isPlayerOnRoster(player, tidOrAbbr, year) {
  // teamsByYear is the ONLY source of truth for roster membership
  // After full tid migration, teamsByYear values are tids (numbers)
  // Check both number and string keys since data may be stored either way
  const yearNum = Number(year)
  const yearStr = String(year)
  const teamForYear = player.teamsByYear?.[yearNum] ?? player.teamsByYear?.[yearStr]

  // If tidOrAbbr is a number, compare directly (new tid-based)
  if (typeof tidOrAbbr === 'number') {
    return teamForYear === tidOrAbbr
  }

  // If tidOrAbbr is a string that looks like a number (tid from URL param), parse and compare
  if (typeof tidOrAbbr === 'string' && /^\d+$/.test(tidOrAbbr)) {
    return teamForYear === parseInt(tidOrAbbr, 10)
  }

  // If tidOrAbbr is an abbreviation string (backward compatibility during transition)
  // Convert abbr to tid and compare
  if (typeof tidOrAbbr === 'string') {
    const tid = getTidFromAbbr(tidOrAbbr)
    if (tid) {
      return teamForYear === tid
    }
    // Fallback: direct string comparison (for unmigrated data)
    return teamForYear === tidOrAbbr
  }

  return false
}

/**
 * Get the current team's roster (non-honor-only players for current team)
 * Uses isPlayerOnRoster for consistent filtering
 */
export function getCurrentRoster(dynasty) {
  if (!dynasty) return []

  // Use currentTid if available (new system), fallback to abbr lookup (old system)
  const tid = dynasty.currentTid || getTidFromTeamName(dynasty.teamName, dynasty.teams)
  const currentYear = dynasty.currentYear
  const allPlayers = dynasty.players || []

  // Use unified isPlayerOnRoster for consistent filtering across all components
  return allPlayers.filter(p => isPlayerOnRoster(p, tid, currentYear))
}

/**
 * Get all players including honor-only (for awards, all-americans, etc.)
 */
export function getAllPlayers(dynasty) {
  if (!dynasty) return []
  return dynasty.players || []
}

/**
 * Get games for the current team only
 * IMPORTANT: This filters by userTeam to ensure team-centric data when coach switches teams
 * @param {Object} dynasty - The dynasty object
 * @param {number} [year] - Optional year filter (defaults to all years for current team)
 * @returns {Array} Games played by the current team
 */
export function getCurrentTeamGames(dynasty, year = null) {
  if (!dynasty) return []

  const allGames = dynasty.games || []

  return allGames.filter(g => {
    // Use unified game perspective to check if user's team is in this game
    // getUserGamePerspective checks coachTeamByYear[game.year].tid against team1Tid/team2Tid
    const perspective = getUserGamePerspective(g, dynasty)
    if (!perspective) return false // Not a user game

    // Optionally filter by year
    if (year !== null) {
      return Number(g.year) === Number(year)
    }

    return true
  }).map(g => {
    // Attach perspective for convenience
    const perspective = getUserGamePerspective(g, dynasty)
    return { ...g, perspective }
  })
}

/**
 * Find a specific game for the current team
 * @param {Object} dynasty - The dynasty object
 * @param {Function} predicate - Filter function (receives game object)
 * @returns {Object|undefined} The matching game or undefined
 */
export function findCurrentTeamGame(dynasty, predicate) {
  const teamGames = getCurrentTeamGames(dynasty)
  return teamGames.find(predicate)
}

/**
 * Get preseason setup flags for current team and year
 */
export function getCurrentPreseasonSetup(dynasty) {
  const defaultSetup = {
    scheduleEntered: false,
    rosterEntered: false,
    teamRatingsEntered: false,
    coachingStaffEntered: false,
    conferencesEntered: false
  }

  if (!dynasty) return defaultSetup

  const teamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName
  const year = dynasty.currentYear

  // Try NEW tid-based byYear structure first (Phase 7 migration)
  const tid = getTidFromAbbr(teamAbbr)
  if (tid && dynasty.teams?.[tid]?.byYear?.[year]?.preseasonSetup) {
    return dynasty.teams[tid].byYear[year].preseasonSetup
  }

  // Try old team-centric structure (preseasonSetupByTeamYear)
  const teamYearSetup = dynasty.preseasonSetupByTeamYear?.[teamAbbr]?.[year]
  if (teamYearSetup) {
    return teamYearSetup
  }

  // Only fall back to legacy preseasonSetup for the dynasty's first year
  // For subsequent years, return fresh defaults (new year = new preseason setup)
  if (year === dynasty.startYear) {
    return dynasty.preseasonSetup || defaultSetup
  }

  // New year without preseason setup initialized yet - return defaults
  return defaultSetup
}

/**
 * Get team ratings for current team and year
 */
export function getCurrentTeamRatings(dynasty) {
  const defaultRatings = { overall: null, offense: null, defense: null }

  if (!dynasty) return defaultRatings

  const teamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName
  const year = dynasty.currentYear

  // Try NEW tid-based byYear structure first (Phase 7 migration)
  const tid = getTidFromAbbr(teamAbbr)
  if (tid && dynasty.teams?.[tid]?.byYear?.[year]?.teamRatings) {
    return dynasty.teams[tid].byYear[year].teamRatings
  }

  // Try old team-centric structure (teamRatingsByTeamYear)
  const teamYearRatings = dynasty.teamRatingsByTeamYear?.[teamAbbr]?.[year]
  if (teamYearRatings) {
    return teamYearRatings
  }

  // Only fall back to legacy teamRatings for the dynasty's first year
  // For subsequent years, return defaults (new year = new ratings needed)
  if (year === dynasty.startYear) {
    return dynasty.teamRatings || defaultRatings
  }

  return defaultRatings
}

/**
 * Get coaching staff for current team and year
 * Note: Coaching staff carries over from year to year (unlike schedule/ratings)
 */
export function getCurrentCoachingStaff(dynasty) {
  const defaultStaff = { hcName: null, ocName: null, dcName: null }

  if (!dynasty) return defaultStaff

  const teamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName
  const year = dynasty.currentYear
  const tid = getTidFromAbbr(teamAbbr)

  // Try NEW tid-based byYear structure first (Phase 7 migration)
  if (tid && dynasty.teams?.[tid]?.byYear?.[year]?.coachingStaff) {
    return dynasty.teams[tid].byYear[year].coachingStaff
  }

  // Try old team-centric structure (coachingStaffByTeamYear)
  const teamYearStaff = dynasty.coachingStaffByTeamYear?.[teamAbbr]?.[year]
  if (teamYearStaff) {
    return teamYearStaff
  }

  // For coaching staff, try previous year's data (staff carries over)
  // Check new structure first for previous year
  if (tid && dynasty.teams?.[tid]?.byYear?.[year - 1]?.coachingStaff) {
    return dynasty.teams[tid].byYear[year - 1].coachingStaff
  }
  const previousYearStaff = dynasty.coachingStaffByTeamYear?.[teamAbbr]?.[year - 1]
  if (previousYearStaff) {
    return previousYearStaff
  }

  // Only fall back to legacy coachingStaff for the dynasty's first year
  if (year === dynasty.startYear) {
    return dynasty.coachingStaff || defaultStaff
  }

  return defaultStaff
}

/**
 * Get Google Sheet info for current team
 */
export function getCurrentGoogleSheet(dynasty) {
  if (!dynasty) return { googleSheetId: null, googleSheetUrl: null }

  const teamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName

  // Try new team-centric structure first
  const teamSheet = dynasty.googleSheetsByTeam?.[teamAbbr]
  if (teamSheet) {
    return teamSheet
  }

  // Fall back to legacy googleSheet fields
  return {
    googleSheetId: dynasty.googleSheetId || null,
    googleSheetUrl: dynasty.googleSheetUrl || null
  }
}

/**
 * Get recruits for current team and year
 */
export function getCurrentRecruits(dynasty) {
  if (!dynasty) return []

  const teamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName
  const year = dynasty.currentYear

  // Try NEW tid-based byYear structure first (Phase 7 migration)
  const tid = getTidFromAbbr(teamAbbr)
  if (tid && dynasty.teams?.[tid]?.byYear?.[year]?.recruits) {
    return dynasty.teams[tid].byYear[year].recruits
  }

  // Try old team-centric structure (recruitsByTeamYear)
  const teamYearRecruits = dynasty.recruitsByTeamYear?.[teamAbbr]?.[year]
  if (teamYearRecruits) {
    return teamYearRecruits
  }

  // Fall back to legacy recruits (filter by team if they have team field)
  const legacyRecruits = dynasty.recruits || []
  return legacyRecruits.filter(r => !r.team || r.team === teamAbbr)
}

/**
 * Class progression mapping for season advancement
 */
const CLASS_PROGRESSION = {
  'HS': 'Fr',
  // JUCO players: drop the JUCO prefix, keep the class level
  // Their first season on team they play as that class (Fr, So, Jr, Sr)
  'JUCO Fr': 'Fr',
  'JUCO So': 'So',
  'JUCO Jr': 'Jr',
  'JUCO Sr': 'Sr',
  'Fr': 'So',
  'RS Fr': 'RS So',
  'So': 'Jr',
  'RS So': 'RS Jr',
  'Jr': 'Sr',
  'RS Jr': 'RS Sr',
  'Sr': 'RS Sr',
  'RS Sr': 'RS Sr'
}

/**
 * Get players that need class advancement confirmation (null gamesPlayed)
 * Returns array of players who need user to confirm if they played 5+ games
 */
export function getPlayersNeedingClassConfirmation(dynasty) {
  if (!dynasty) return []

  const teamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName
  const year = dynasty.currentYear
  const players = dynasty.players || []

  // Get active players for current team (not left, not recruits, not honor-only)
  const activePlayers = players.filter(p => {
    if (p.isHonorOnly) return false
    if (p.isRecruit) return false
    // Also exclude players recruited this year (even if isRecruit flag is missing)
    if (p.recruitYear === year) return false
    // Exclude players who have departed (have a departure movement)
    const hasDeparted = (p.movements || []).some(m => m.type === 'departure')
    if (hasDeparted) return false
    if (p.team && p.team !== teamAbbr) return false
    // Already RS players don't need confirmation (they'll progress normally)
    if (p.year?.startsWith('RS ')) return false
    return true
  })

  // Find players with null/undefined gamesPlayed (read from player.statsByYear)
  const needsConfirmation = activePlayers.filter(player => {
    const yearStats = player.statsByYear?.[year] || player.statsByYear?.[String(year)]
    const gamesPlayed = yearStats?.gamesPlayed
    return gamesPlayed === null || gamesPlayed === undefined
  })

  return needsConfirmation
}

/**
 * Check if user is on a new team (first year coaching this team)
 */
export function isFirstYearOnTeam(dynasty) {
  if (!dynasty) return false

  const currentTeamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName
  const previousYearTeam = dynasty.coachTeamByYear?.[dynasty.currentYear]?.team

  // If no previous year record, check if this is the dynasty start year
  if (!previousYearTeam) {
    return dynasty.currentYear !== dynasty.startYear
  }

  return previousYearTeam !== currentTeamAbbr
}

/**
 * Get which team the coach was coaching for a specific year.
 * This is locked in at the start of the season (Week 1) and does NOT change
 * even if the user switches teams during the offseason.
 *
 * Use this for coach career records, player leaderboards, and any stats
 * that need to know "who was the coach coaching this year".
 */
export function getCoachTeamForYear(dynasty, year) {
  if (!dynasty) return null

  // Check the coachTeamByYear structure first
  const coachTeamRecord = dynasty.coachTeamByYear?.[year]
  if (coachTeamRecord) {
    return coachTeamRecord
  }

  // Fallback for years before this feature was implemented:
  // - If it's the current year and we haven't started the season yet, use current team
  // - Otherwise return null (data not available)
  if (year === dynasty.currentYear && dynasty.currentPhase === 'preseason') {
    const teamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName
    return {
      team: teamAbbr,
      teamName: dynasty.teamName,
      position: dynasty.coachPosition || 'HC'
    }
  }

  // For the start year, assume the current team if no record exists
  if (year === dynasty.startYear) {
    const teamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName
    return {
      team: teamAbbr,
      teamName: dynasty.teamName,
      position: dynasty.coachPosition || 'HC'
    }
  }

  return null
}

/**
 * Get all years the coach has coached with their team info
 */
export function getCoachHistory(dynasty) {
  if (!dynasty) return []

  const history = []
  const coachTeamByYear = dynasty.coachTeamByYear || {}

  // Get all years from coachTeamByYear
  for (const [year, record] of Object.entries(coachTeamByYear)) {
    history.push({
      year: parseInt(year),
      ...record
    })
  }

  // Sort by year
  history.sort((a, b) => a.year - b.year)
  return history
}

/**
 * Get the locked coaching staff for a specific year.
 * This is locked in at Week 12 (end of regular season) BEFORE any conference
 * championship firings. Use this for historical views to show who the
 * coordinators were during that season, even if they were fired later.
 *
 * @param dynasty - The dynasty object
 * @param year - The year to get staff for
 * @param teamAbbr - Optional team abbreviation (defaults to coach's team for that year)
 */
export function getLockedCoachingStaff(dynasty, year, teamAbbr = null) {
  if (!dynasty) return { hcName: null, ocName: null, dcName: null }

  // If no team specified, get the coach's team for that year
  if (!teamAbbr) {
    const coachTeam = getCoachTeamForYear(dynasty, year)
    teamAbbr = coachTeam?.team
  }

  if (!teamAbbr) {
    // Fallback to current team
    teamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName
  }

  // Try NEW tid-based byYear structure first (Phase 7 migration)
  const tid = getTidFromAbbr(teamAbbr)
  let staff = tid && dynasty.teams?.[tid]?.byYear?.[year]?.lockedCoachingStaff

  // Fall back to locked coaching staff (old format, set at end of Week 12)
  if (!staff) {
    staff = dynasty.lockedCoachingStaffByYear?.[teamAbbr]?.[year]
  }

  // Fall back to team-centric coaching staff from new structure
  if (!staff && tid) {
    staff = dynasty.teams?.[tid]?.byYear?.[year]?.coachingStaff
  }

  // Fall back to team-centric coaching staff (old format, may have been updated after firings)
  if (!staff) {
    staff = dynasty.coachingStaffByTeamYear?.[teamAbbr]?.[year]
  }

  // ONLY fall back to legacy coaching staff if this is the user's CURRENT team
  // This prevents showing the user's coordinators on other teams' pages
  const userCurrentTeam = getCurrentTeamAbbr(dynasty) || dynasty.teamName
  if (!staff && teamAbbr === userCurrentTeam) {
    staff = dynasty.coachingStaff || { hcName: null, ocName: null, dcName: null }
  }

  // If still no staff (other team with no data), return empty
  if (!staff) {
    staff = { hcName: null, ocName: null, dcName: null }
  }

  // Check if the user was coaching this team in this year and add their name
  const coachTeamForYear = getCoachTeamForYear(dynasty, year)
  if (coachTeamForYear && coachTeamForYear.team === teamAbbr && dynasty.coachName) {
    staff = { ...staff }
    if (coachTeamForYear.position === 'HC') {
      staff.hcName = dynasty.coachName
    } else if (coachTeamForYear.position === 'OC') {
      staff.ocName = dynasty.coachName
    } else if (coachTeamForYear.position === 'DC') {
      staff.dcName = dynasty.coachName
    }
  }

  return staff
}

/**
 * Get custom conferences for a specific year
 * Falls back to legacy customConferences, then to null (use defaults)
 */
export function getCustomConferencesForYear(dynasty, year) {
  if (!dynasty) return null

  // Check year-specific first
  const byYear = dynasty.customConferencesByYear?.[year]
  if (byYear && Object.keys(byYear).length > 0) {
    return byYear
  }

  // Fall back to legacy customConferences
  if (dynasty.customConferences && Object.keys(dynasty.customConferences).length > 0) {
    return dynasty.customConferences
  }

  return null
}

/**
 * Get current custom conferences (for current year)
 */
export function getCurrentCustomConferences(dynasty) {
  if (!dynasty) return null
  return getCustomConferencesForYear(dynasty, dynasty.currentYear)
}

/**
 * Get conference for a team, using dynasty's custom conferences if available
 * @param {Object} dynasty - The dynasty object
 * @param {string} teamAbbr - Team abbreviation
 * @param {number} [year] - Optional year (defaults to current year)
 * @returns {string|null} Conference name
 */
export function getTeamConferenceForDynasty(dynasty, teamAbbr, year = null) {
  const targetYear = year || dynasty?.currentYear
  const customConferences = dynasty ? getCustomConferencesForYear(dynasty, targetYear) : null
  return getTeamConference(teamAbbr, customConferences)
}

// ============================================================================
// PLAYER STATS HELPERS - Unified stats access
// ============================================================================

/**
 * Get player stats for a specific year
 * Handles both string and number year keys
 * @param {Object} player - The player object
 * @param {number|string} year - The year to get stats for
 * @returns {Object|null} Stats for that year or null
 */
export function getPlayerStatsForYear(player, year) {
  if (!player) return null
  const numYear = Number(year)
  const strYear = String(year)
  return player.statsByYear?.[numYear] || player.statsByYear?.[strYear] || null
}

/**
 * Convert sheet category stats to internal format
 * @param {Object} sheetStats - Stats from sheet format (e.g., { Completions: 250, Yards: 3000 })
 * @param {string} category - Sheet category name (e.g., 'Passing')
 * @returns {Object} Internal format stats
 */
function convertSheetStatsToInternal(sheetStats, category) {
  if (!sheetStats) return null

  const mappings = {
    'Passing': {
      'Completions': 'cmp', 'Attempts': 'att', 'Yards': 'yds', 'Touchdowns': 'td',
      'Interceptions': 'int', 'Passing Long': 'lng', 'Sacks Taken': 'sacks'
    },
    'Rushing': {
      'Carries': 'car', 'Yards': 'yds', 'Touchdowns': 'td', 'Rushing Long': 'lng', 'Fumbles': 'fum'
    },
    'Receiving': {
      'Receptions': 'rec', 'Yards': 'yds', 'Touchdowns': 'td', 'Receiving Long': 'lng', 'Drops': 'drops'
    },
    'Blocking': {
      'Pancakes': 'pancakes', 'Sacks Allowed': 'sacksAllowed'
    },
    'Defensive': {
      'Solo Tackles': 'soloTkl', 'Assisted Tackles': 'astTkl', 'Sacks': 'sacks', 'TFLs': 'tfl',
      'Interceptions': 'int', 'Pass Deflections': 'pd', 'Forced Fumbles': 'ff',
      'Fumble Recoveries': 'fr', 'Touchdowns': 'td', 'Safeties': 'sfty'
    },
    'Kicking': {
      'FG Made': 'fgm', 'FG Attempted': 'fga', 'XP Made': 'xpm', 'XP Attempted': 'xpa', 'FG Long': 'lng'
    },
    'Punting': {
      'Punts': 'punts', 'Punting Yards': 'yds', 'Punting Long': 'lng', 'Inside 20': 'in20', 'Touchbacks': 'tb'
    },
    'Kick Return': {
      'Kickoff Returns': 'ret', 'KR Yardage': 'yds', 'KR Touchdowns': 'td', 'KR Long': 'lng'
    },
    'Punt Return': {
      'Punt Returns': 'ret', 'PR Yardage': 'yds', 'PR Touchdowns': 'td', 'PR Long': 'lng'
    }
  }

  const categoryMap = mappings[category]
  if (!categoryMap) return null

  const result = {}
  let hasAnyValue = false

  Object.entries(categoryMap).forEach(([sheetKey, internalKey]) => {
    const value = sheetStats[sheetKey]
    if (value !== undefined && value !== null && value !== '') {
      result[internalKey] = typeof value === 'number' ? value : parseInt(value) || 0
      hasAnyValue = true
    }
  })

  return hasAnyValue ? result : null
}

/**
 * Migrate legacy stats structures to player.statsByYear
 * Called once per dynasty on load if not already migrated
 * @param {Object} dynasty - The dynasty object
 * @returns {Object} Dynasty with migrated stats
 */
export function migrateStatsToPlayers(dynasty) {
  if (!dynasty) return dynasty
  if (dynasty._statsMigrated) return dynasty
  if (!dynasty.players || dynasty.players.length === 0) return dynasty

  // Get legacy data
  const playerStatsByYear = dynasty.playerStatsByYear || {}
  const detailedStatsByYear = dynasty.detailedStatsByYear || {}

  // Check if there's any legacy data to migrate
  const hasLegacyData = Object.keys(playerStatsByYear).length > 0 ||
                        Object.keys(detailedStatsByYear).length > 0
  if (!hasLegacyData) {
    // No legacy data, just mark as migrated
    return { ...dynasty, _statsMigrated: true }
  }

  // Category mapping from sheet names to internal names
  const categoryMap = {
    'Passing': 'passing', 'Rushing': 'rushing', 'Receiving': 'receiving',
    'Blocking': 'blocking', 'Defensive': 'defense', 'Kicking': 'kicking',
    'Punting': 'punting', 'Kick Return': 'kickReturn', 'Punt Return': 'puntReturn'
  }

  // Get all years from both legacy structures
  const allYears = new Set([
    ...Object.keys(playerStatsByYear),
    ...Object.keys(detailedStatsByYear)
  ])

  // Migrate each player's stats
  const migratedPlayers = dynasty.players.map(player => {
    const newStatsByYear = { ...(player.statsByYear || {}) }

    allYears.forEach(yearKey => {
      const year = Number(yearKey)

      // Find basic stats for this player in legacy structure
      const yearBasicStats = playerStatsByYear[yearKey] || playerStatsByYear[year] || []
      const basicStats = yearBasicStats.find(s =>
        s.pid === player.pid ||
        (s.name && player.name && s.name.toLowerCase().trim() === player.name.toLowerCase().trim())
      )

      // Find detailed stats for this player in legacy structure
      const detailedYear = detailedStatsByYear[yearKey] || detailedStatsByYear[year] || {}

      // Initialize year stats if needed (only if we have data to migrate)
      if (!newStatsByYear[year]) {
        newStatsByYear[year] = {}
      }

      // Merge basic stats (only if not already set in new format)
      if (basicStats) {
        if (newStatsByYear[year].gamesPlayed === undefined && basicStats.gamesPlayed !== undefined) {
          newStatsByYear[year].gamesPlayed = basicStats.gamesPlayed
        }
        if (newStatsByYear[year].snapsPlayed === undefined && basicStats.snapsPlayed !== undefined) {
          newStatsByYear[year].snapsPlayed = basicStats.snapsPlayed
        }
      }

      // Merge detailed stats from each category
      Object.entries(categoryMap).forEach(([sheetName, internalName]) => {
        // Skip if already has data in new format
        if (newStatsByYear[year][internalName]) return

        const categoryArray = detailedYear[sheetName] || []
        const categoryStats = categoryArray.find(s =>
          s.pid === player.pid ||
          (s.name && player.name && s.name.toLowerCase().trim() === player.name.toLowerCase().trim())
        )

        if (categoryStats) {
          const converted = convertSheetStatsToInternal(categoryStats, sheetName)
          if (converted) {
            newStatsByYear[year][internalName] = converted
          }
        }
      })

      // Clean up empty year objects
      if (Object.keys(newStatsByYear[year]).length === 0) {
        delete newStatsByYear[year]
      }
    })

    // Only update if we have stats
    if (Object.keys(newStatsByYear).length > 0) {
      return { ...player, statsByYear: newStatsByYear }
    }
    return player
  })

  return {
    ...dynasty,
    players: migratedPlayers,
    _statsMigrated: true
  }
}

/**
 * Migrate roster data - Fix corrupted teamsByYear entries
 * Removes future years from teamsByYear for players who have left
 * This fixes the bug where players who transferred away reappear
 * @param {Object} dynasty - The dynasty object
 * @returns {Object} Dynasty with fixed roster data
 */
export function migrateRosterData(dynasty) {
  if (!dynasty) return dynasty
  // Use _rosterMigratedV3 to force re-run of migration (V2 didn't backfill current year)
  if (dynasty._rosterMigratedV3) return dynasty
  if (!dynasty.players || dynasty.players.length === 0) {
    return { ...dynasty, _rosterMigratedV3: true }
  }

  const currentYear = dynasty.currentYear
  const teamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName

  let needsUpdate = false
  const fixedPlayers = dynasty.players.map(player => {
    let modifiedPlayer = { ...player }
    let playerModified = false

    // Fix 1: Remove future years from teamsByYear for players who left
    if ((player.leftTeam || player.transferredTo || (player.leavingYear && player.leavingReason)) && player.teamsByYear) {
      const departureYear = Number(player.leftYear || player.leavingYear || currentYear)

      const fixedTeamsByYear = {}
      Object.entries(player.teamsByYear).forEach(([year, team]) => {
        const yearNum = Number(year)
        if (yearNum <= departureYear) {
          fixedTeamsByYear[year] = team
        } else {
          needsUpdate = true
          playerModified = true
        }
      })

      if (playerModified) {
        modifiedPlayer = { ...modifiedPlayer, teamsByYear: fixedTeamsByYear }
      }
    }

    // Fix 2: Add current year to teamsByYear for active players who are missing it
    // (This fixes players who went through Signing Day before the code fix)
    if (!player.leftTeam && !player.isRecruit && !player.isHonorOnly) {
      // Check if player should be on current team
      const isOnCurrentTeam = player.team === teamAbbr || !player.team
      // Check if they don't have pending departure
      const notLeaving = !player.leavingYear || !player.leavingReason
      // Check if they've enrolled (not a future recruit)
      const hasEnrolled = !player.recruitYear || Number(currentYear) > Number(player.recruitYear)

      if (isOnCurrentTeam && notLeaving && hasEnrolled) {
        const existingTeamsByYear = modifiedPlayer.teamsByYear || {}
        // If current year is missing from teamsByYear, add it
        if (!existingTeamsByYear[currentYear] && !existingTeamsByYear[String(currentYear)]) {
          needsUpdate = true
          playerModified = true
          modifiedPlayer = {
            ...modifiedPlayer,
            teamsByYear: {
              ...existingTeamsByYear,
              [currentYear]: teamAbbr
            }
          }
        }
      }
    }

    return playerModified ? modifiedPlayer : player
  })

  if (needsUpdate) {
    return {
      ...dynasty,
      players: fixedPlayers,
      _rosterMigratedV3: true
    }
  }

  return { ...dynasty, _rosterMigratedV3: true }
}

/**
 * Migration: Clean up legacy departure fields
 * Converts legacy fields (leftTeam, leavingYear, transferredTo, etc.) to movements[]
 * Then deletes the legacy fields entirely
 */
export function migrateLegacyDepartureFields(dynasty) {
  if (dynasty._legacyDepartureFieldsMigrated) return dynasty
  if (!dynasty?.players?.length) {
    return { ...dynasty, _legacyDepartureFieldsMigrated: true }
  }

  const migratedPlayers = dynasty.players.map(player => {
    const movements = [...(player.movements || [])]
    let needsUpdate = false

    // Check for legacy departure fields
    const hasLegacyLeft = player.leftTeam === true && player.leftYear
    const hasLegacyLeaving = player.leavingYear && player.leavingReason
    const hasLegacyTransferTo = player.transferredTo
    const hasLegacyPendingDeparture = player.pendingDeparture

    // If player has leftTeam/leftYear, ensure there's a departure movement
    if (hasLegacyLeft) {
      const existingDeparture = movements.find(m =>
        (m.type === 'departure' || m.type === 'transfer') && m.year === Number(player.leftYear)
      )
      if (!existingDeparture) {
        const reason = player.leftReason || 'Unknown'
        if (reason === 'Transfer' || reason === 'Encouraged Transfer') {
          movements.push({
            year: Number(player.leftYear),
            type: 'departure',
            from: player.team,
            reason: reason
          })
        } else {
          movements.push({
            year: Number(player.leftYear),
            type: 'departure',
            from: player.team,
            reason: reason,
            ...(player.draftRound ? { extra: { draftRound: player.draftRound } } : {})
          })
        }
        needsUpdate = true
      }
    }

    // If player has leavingYear/leavingReason (pending), ensure movement exists
    if (hasLegacyLeaving && !hasLegacyLeft) {
      const existingDeparture = movements.find(m =>
        (m.type === 'departure' || m.type === 'transfer') && m.year === Number(player.leavingYear)
      )
      if (!existingDeparture) {
        movements.push({
          year: Number(player.leavingYear),
          type: 'departure',
          from: player.team,
          reason: player.leavingReason
        })
        needsUpdate = true
      }
    }

    // If player has transferredTo, ensure transfer movement exists
    if (hasLegacyTransferTo) {
      const transferYear = player.leftYear || player.leavingYear
      const existingTransfer = movements.find(m =>
        m.type === 'transfer' && m.to === player.transferredTo
      )
      if (!existingTransfer && transferYear) {
        movements.push({
          year: Number(transferYear),
          type: 'transfer',
          from: player.transferredFrom || player.team,
          to: player.transferredTo,
          reason: 'Transfer'
        })
        needsUpdate = true
      }
    }

    // If player has pendingDeparture, convert it to a movement
    if (hasLegacyPendingDeparture) {
      const pd = player.pendingDeparture
      const existingDeparture = movements.find(m =>
        (m.type === 'departure' || m.type === 'transfer') && m.year === Number(pd.year)
      )
      if (!existingDeparture && pd.year) {
        if (pd.destination) {
          movements.push({
            year: Number(pd.year),
            type: 'transfer',
            from: player.team,
            to: pd.destination,
            reason: pd.reason || 'Transfer'
          })
        } else {
          movements.push({
            year: Number(pd.year),
            type: 'departure',
            from: player.team,
            reason: pd.reason || 'Unknown'
          })
        }
        needsUpdate = true
      }
    }

    // Check if player has any legacy fields to remove
    const legacyFields = ['leftTeam', 'leftYear', 'leftReason', 'leavingYear', 'leavingReason',
                          'transferredTo', 'transferredFrom', 'pendingDeparture']
    const hasLegacyFields = legacyFields.some(f => player[f] !== undefined && player[f] !== null)

    if (!needsUpdate && !hasLegacyFields) return player

    // Create cleaned player without legacy fields
    const cleanedPlayer = { ...player, movements }
    legacyFields.forEach(f => delete cleanedPlayer[f])

    return cleanedPlayer
  })

  return {
    ...dynasty,
    players: migratedPlayers,
    _legacyDepartureFieldsMigrated: true
  }
}

/**
 * Migrate dynasty to full tid-based system.
 * This migration:
 * 1. Adds currentTid (derived from teamName)
 * 2. Adds tid to coachTeamByYear records
 * 3. Converts player.teamsByYear values from abbr to tid
 * 4. Converts game records from abbr fields (userTeam, opponent, team1, team2) to tid fields
 *
 * @param {Object} dynasty - The dynasty object
 * @returns {Object} Migrated dynasty
 */
export function migrateToFullTidSystem(dynasty) {
  if (!dynasty) return dynasty
  if (dynasty._tidFullyMigrated) return dynasty

  let migrated = { ...dynasty }

  // Ensure teams exists (should be created by earlier _tidMigrated migration)
  if (!migrated.teams) {
    // This shouldn't happen, but just in case
    migrated = migrateDynastyToTidStructure(migrated)
    migrated._tidMigrated = true
  }

  // Phase 1: Add currentTid
  if (!migrated.currentTid && migrated.teamName) {
    // For custom teams, the name is stored in dynasty.teams
    // For default teams, use NAME_TO_TID lookup
    const tid = getTidFromTeamName(migrated.teamName, migrated.teams)
    if (tid) {
      migrated.currentTid = tid
    } else {
      // Fallback: try abbreviation approach
      const abbr = getAbbrFromTeamName(migrated.teamName, migrated.teams)
      const fallbackTid = getTidFromAbbr(abbr)
      if (fallbackTid) {
        migrated.currentTid = fallbackTid
      }
    }
  }

  // Phase 2: Migrate coachTeamByYear records
  if (migrated.coachTeamByYear && Object.keys(migrated.coachTeamByYear).length > 0) {
    const migratedCoachTeamByYear = {}
    for (const [year, record] of Object.entries(migrated.coachTeamByYear)) {
      if (record && !record.tid && record.team) {
        // Convert team abbr to tid
        const tid = getTidFromAbbr(record.team)
        migratedCoachTeamByYear[year] = {
          ...record,
          tid: tid || null
        }
      } else {
        migratedCoachTeamByYear[year] = record
      }
    }
    migrated.coachTeamByYear = migratedCoachTeamByYear
  } else {
    // Initialize coachTeamByYear for existing dynasties that don't have it
    // This ensures getUserGamePerspective works correctly
    const initCoachTeamByYear = {}

    // First, try to infer from games data (userTeam field tells us what team we were coaching)
    if (migrated.games && Array.isArray(migrated.games)) {
      for (const game of migrated.games) {
        if (game.userTeam && game.year && !initCoachTeamByYear[game.year]) {
          const tid = getTidFromAbbr(game.userTeam)
          const team = migrated.teams?.[tid]
          initCoachTeamByYear[game.year] = {
            tid: tid,
            team: game.userTeam,
            teamName: team?.name || game.userTeam
          }
        }
      }
    }

    // Ensure at least the current year is set using dynasty's team info
    const currentYear = migrated.currentYear
    if (currentYear && !initCoachTeamByYear[currentYear]) {
      const currentTid = migrated.currentTid || getTidFromTeamName(migrated.teamName, migrated.teams)
      const currentTeam = migrated.teams?.[currentTid]
      if (currentTid) {
        initCoachTeamByYear[currentYear] = {
          tid: currentTid,
          team: currentTeam?.abbr,
          teamName: currentTeam?.name || migrated.teamName
        }
      }
    }

    if (Object.keys(initCoachTeamByYear).length > 0) {
      migrated.coachTeamByYear = initCoachTeamByYear
    }
  }

  // Phase 3: Migrate player.teamsByYear values from abbr to tid
  if (migrated.players && Array.isArray(migrated.players)) {
    migrated.players = migrated.players.map(player => {
      if (!player.teamsByYear) return player

      const migratedTeamsByYear = {}
      let needsMigration = false

      for (const [year, value] of Object.entries(player.teamsByYear)) {
        if (typeof value === 'number') {
          // Already a tid
          migratedTeamsByYear[year] = value
        } else if (typeof value === 'string') {
          // Convert abbr to tid
          const tid = getTidFromAbbr(value)
          migratedTeamsByYear[year] = tid || null
          needsMigration = true
        } else {
          migratedTeamsByYear[year] = value
        }
      }

      if (!needsMigration) return player

      return {
        ...player,
        teamsByYear: migratedTeamsByYear
      }
    })
  }

  // Phase 4: Migrate game records to UNIFIED format
  // All games become team1Tid vs team2Tid with homeTeamTid for location
  // User's perspective is determined by coachTeamByYear, not stored on games
  if (migrated.games && Array.isArray(migrated.games)) {
    migrated.games = migrated.games.map(game => {
      // Skip if already migrated (has team1Tid but no userTeam/opponent fields)
      if (game.team1Tid && game.team2Tid && !game.userTeam && !game.opponent) {
        return game
      }

      const newGame = { ...game }

      if (game.userTeam || game.userTid || game.opponent || game.opponentTid) {
        // User game format - convert to unified format
        const userTid = game.userTid || getTidFromAbbr(game.userTeam)
        const oppTid = game.opponentTid || getTidFromAbbr(game.opponent)
        const userScore = parseInt(game.teamScore) || 0
        const oppScore = parseInt(game.opponentScore) || 0

        newGame.team1Tid = userTid
        newGame.team2Tid = oppTid
        newGame.team1Score = userScore
        newGame.team2Score = oppScore
        newGame.team1Rank = game.userRank || null
        newGame.team2Rank = game.opponentRank || null
        newGame.team2Overall = game.opponentOverall || null
        newGame.team2Offense = game.opponentOffense || null
        newGame.team2Defense = game.opponentDefense || null

        // Add winnerTid
        if (userScore > 0 || oppScore > 0) {
          newGame.winnerTid = userScore > oppScore ? userTid : oppTid
        }

        // Convert location to homeTeamTid
        if (game.location === 'home') {
          newGame.homeTeamTid = userTid
        } else if (game.location === 'away') {
          newGame.homeTeamTid = oppTid
        } else {
          newGame.homeTeamTid = null  // neutral
        }

        // Remove old fields
        delete newGame.userTeam
        delete newGame.userTid
        delete newGame.opponent
        delete newGame.opponentTid
        delete newGame.teamScore
        delete newGame.opponentScore
        delete newGame.result
        delete newGame.location
        delete newGame.userRank
        delete newGame.opponentRank
        delete newGame.opponentOverall
        delete newGame.opponentOffense
        delete newGame.opponentDefense
        delete newGame.opponentRecord
      } else if (game.team1 || game.team1Tid) {
        // Already has team1/team2 format (CPU game or postseason)
        newGame.team1Tid = game.team1Tid || getTidFromAbbr(game.team1)
        newGame.team2Tid = game.team2Tid || getTidFromAbbr(game.team2)

        // Add winnerTid if scores exist
        const score1 = parseInt(newGame.team1Score) || 0
        const score2 = parseInt(newGame.team2Score) || 0
        if (!newGame.winnerTid && (score1 > 0 || score2 > 0)) {
          newGame.winnerTid = score1 > score2 ? newGame.team1Tid : newGame.team2Tid
        }

        // Postseason games are typically neutral
        if (newGame.homeTeamTid === undefined) {
          newGame.homeTeamTid = null
        }

        // Remove abbr fields
        delete newGame.team1
        delete newGame.team2
        delete newGame.winner  // Remove string-based winner field
      }

      return newGame
    })
  }

  migrated._tidFullyMigrated = true
  return migrated
}

/**
 * Migration: Ensure coachTeamByYear is initialized
 * For dynasties created before coachTeamByYear initialization was added to createDynasty
 */
export function migrateCoachTeamByYear(dynasty) {
  if (!dynasty) return dynasty

  // If coachTeamByYear already has data, skip
  if (dynasty.coachTeamByYear && Object.keys(dynasty.coachTeamByYear).length > 0) {
    return dynasty
  }

  let migrated = { ...dynasty }
  const initCoachTeamByYear = {}

  // First, try to infer from games data (userTeam field tells us what team we were coaching)
  if (migrated.games && Array.isArray(migrated.games)) {
    for (const game of migrated.games) {
      if (game.userTeam && game.year && !initCoachTeamByYear[game.year]) {
        const tid = getTidFromAbbr(game.userTeam)
        const team = migrated.teams?.[tid]
        initCoachTeamByYear[game.year] = {
          tid: tid,
          team: game.userTeam,
          teamName: team?.name || game.userTeam
        }
      }
    }
  }

  // Ensure at least the current year is set using dynasty's team info
  const currentYear = migrated.currentYear
  if (currentYear && !initCoachTeamByYear[currentYear]) {
    const currentTid = migrated.currentTid || getTidFromTeamName(migrated.teamName, migrated.teams)
    const currentTeam = migrated.teams?.[currentTid]
    if (currentTid) {
      initCoachTeamByYear[currentYear] = {
        tid: currentTid,
        team: currentTeam?.abbr,
        teamName: currentTeam?.name || migrated.teamName
      }
    }
  }

  if (Object.keys(initCoachTeamByYear).length > 0) {
    migrated.coachTeamByYear = initCoachTeamByYear
  }

  return migrated
}

// ============================================================================
// MOVEMENT TYPES - Player movement tracking system
// ============================================================================
export const MOVEMENT_TYPES = {
  RECRUITED: 'recruited',      // HS/JUCO recruit signs
  PORTAL_IN: 'portal_in',      // Transfer portal player commits
  TRANSFER: 'transfer',        // Player transfers to another team
  DEPARTURE: 'departure',      // Graduating or Pro Draft (no destination)
  ADDED: 'added',              // Manual roster add via editor
  REMOVED: 'removed',          // Manual roster delete via editor
  RECOMMIT: 'recommit'         // Was leaving but came back same offseason
}

/**
 * Create a movement entry
 * @param {number} year - The season year
 * @param {string} type - One of MOVEMENT_TYPES
 * @param {string|null} from - Team abbreviation or null
 * @param {string|null} to - Team abbreviation or null
 * @param {string} [reason] - Optional reason (e.g., 'Graduating', 'Pro Draft', 'Transfer')
 * @param {Object} [extra] - Optional extra data (draftRound, etc.)
 */
export function createMovement(year, type, from, to, reason = null, extra = {}) {
  return {
    year: Number(year),
    type,
    from,
    to,
    reason,
    timestamp: Date.now(),
    ...extra
  }
}

/**
 * Get players with pending departures for a given team and year
 * Checks tid-based byYear first, then team-centric, then year-only for backward compatibility
 * @param {Object} dynasty - The dynasty object
 * @param {string} teamAbbr - Team abbreviation
 * @param {number|string} year - The year
 */
export function getPlayersLeaving(dynasty, teamAbbr, year) {
  if (!dynasty) return []

  // Try NEW tid-based byYear structure first (Phase 7 migration)
  const tid = getTidFromAbbr(teamAbbr)
  if (tid && dynasty.teams?.[tid]?.byYear?.[year]?.playersLeaving) {
    return dynasty.teams[tid].byYear[year].playersLeaving
  }

  // Check team-centric structure (old format)
  const teamYear = dynasty.playersLeavingByTeamYear?.[teamAbbr]?.[year] ||
                   dynasty.playersLeavingByTeamYear?.[teamAbbr]?.[String(year)]
  if (teamYear) return teamYear

  // Fall back to year-only structure (legacy format)
  return dynasty.playersLeavingByYear?.[year] || dynasty.playersLeavingByYear?.[String(year)] || []
}

/**
 * Get conference championship data for a given team and year
 * Checks tid-based byYear first, then team-centric, then year-only for backward compatibility
 */
export function getConferenceChampionshipData(dynasty, teamAbbr, year) {
  if (!dynasty) return null

  // Try NEW tid-based byYear structure first (Phase 7 migration)
  const tid = getTidFromAbbr(teamAbbr)
  if (tid && dynasty.teams?.[tid]?.byYear?.[year]?.conferenceChampionshipData) {
    return dynasty.teams[tid].byYear[year].conferenceChampionshipData
  }

  // Check team-centric structure (old format)
  const teamYear = dynasty.conferenceChampionshipDataByTeamYear?.[teamAbbr]?.[year] ||
                   dynasty.conferenceChampionshipDataByTeamYear?.[teamAbbr]?.[String(year)]
  if (teamYear) return teamYear

  // Fall back to year-only structure (legacy format)
  return dynasty.conferenceChampionshipDataByYear?.[year] ||
         dynasty.conferenceChampionshipDataByYear?.[String(year)] || null
}

/**
 * Get bowl eligibility data for a given team and year
 * Checks tid-based byYear first, then team-centric, then year-only for backward compatibility
 */
export function getBowlEligibilityData(dynasty, teamAbbr, year) {
  if (!dynasty) return null

  // Try NEW tid-based byYear structure first (Phase 7 migration)
  const tid = getTidFromAbbr(teamAbbr)
  if (tid && dynasty.teams?.[tid]?.byYear?.[year]?.bowlEligibilityData) {
    return dynasty.teams[tid].byYear[year].bowlEligibilityData
  }

  // Check team-centric structure (old format)
  const teamYear = dynasty.bowlEligibilityDataByTeamYear?.[teamAbbr]?.[year] ||
                   dynasty.bowlEligibilityDataByTeamYear?.[teamAbbr]?.[String(year)]
  if (teamYear) return teamYear

  // Fall back to year-only structure (legacy format)
  return dynasty.bowlEligibilityDataByYear?.[year] ||
         dynasty.bowlEligibilityDataByYear?.[String(year)] || null
}

/**
 * Get draft results for a given team and year
 * Checks tid-based byYear first, then team-centric, then year-only for backward compatibility
 */
export function getDraftResults(dynasty, teamAbbr, year) {
  if (!dynasty) return []

  // Try NEW tid-based byYear structure first (Phase 7 migration)
  const tid = getTidFromAbbr(teamAbbr)
  if (tid && dynasty.teams?.[tid]?.byYear?.[year]?.draftResults) {
    return dynasty.teams[tid].byYear[year].draftResults
  }

  // Check team-centric structure (old format)
  const teamYear = dynasty.draftResultsByTeamYear?.[teamAbbr]?.[year] ||
                   dynasty.draftResultsByTeamYear?.[teamAbbr]?.[String(year)]
  if (teamYear) return teamYear

  // Fall back to year-only structure (legacy format)
  return dynasty.draftResultsByYear?.[year] ||
         dynasty.draftResultsByYear?.[String(year)] || []
}

/**
 * Get transfer destinations for a given team and year
 * Checks tid-based byYear first, then team-centric, then year-only for backward compatibility
 */
export function getTransferDestinations(dynasty, teamAbbr, year) {
  if (!dynasty) return {}

  // Try NEW tid-based byYear structure first (Phase 7 migration)
  const tid = getTidFromAbbr(teamAbbr)
  if (tid && dynasty.teams?.[tid]?.byYear?.[year]?.transferDestinations) {
    return dynasty.teams[tid].byYear[year].transferDestinations
  }

  // Check team-centric structure (old format)
  const teamYear = dynasty.transferDestinationsByTeamYear?.[teamAbbr]?.[year] ||
                   dynasty.transferDestinationsByTeamYear?.[teamAbbr]?.[String(year)]
  if (teamYear) return teamYear

  // Fall back to year-only structure (legacy format)
  return dynasty.transferDestinationsByYear?.[year] ||
         dynasty.transferDestinationsByYear?.[String(year)] || {}
}

/**
 * Get training results for a given team and year
 * Checks tid-based byYear first, then team-centric, then year-only for backward compatibility
 */
export function getTrainingResults(dynasty, teamAbbr, year) {
  if (!dynasty) return {}

  // Try NEW tid-based byYear structure first (Phase 7 migration)
  const tid = getTidFromAbbr(teamAbbr)
  if (tid && dynasty.teams?.[tid]?.byYear?.[year]?.trainingResults) {
    return dynasty.teams[tid].byYear[year].trainingResults
  }

  // Check team-centric structure (old format)
  const teamYear = dynasty.trainingResultsByTeamYear?.[teamAbbr]?.[year] ||
                   dynasty.trainingResultsByTeamYear?.[teamAbbr]?.[String(year)]
  if (teamYear) return teamYear

  // Fall back to year-only structure (legacy format)
  return dynasty.trainingResultsByYear?.[year] ||
         dynasty.trainingResultsByYear?.[String(year)] || {}
}

/**
 * Get portal transfer class assignments for a given team and year
 * Checks tid-based byYear first, then team-centric, then year-only for backward compatibility
 */
export function getPortalTransferClass(dynasty, teamAbbr, year) {
  if (!dynasty) return {}

  // Try NEW tid-based byYear structure first (Phase 7 migration)
  const tid = getTidFromAbbr(teamAbbr)
  if (tid && dynasty.teams?.[tid]?.byYear?.[year]?.portalTransferClass) {
    return dynasty.teams[tid].byYear[year].portalTransferClass
  }

  // Check team-centric structure (old format)
  const teamYear = dynasty.portalTransferClassByTeamYear?.[teamAbbr]?.[year] ||
                   dynasty.portalTransferClassByTeamYear?.[teamAbbr]?.[String(year)]
  if (teamYear) return teamYear

  // Fall back to year-only structure (legacy format)
  return dynasty.portalTransferClassByYear?.[year] ||
         dynasty.portalTransferClassByYear?.[String(year)] || {}
}

/**
 * Get fringe case class assignments for a given team and year
 * Checks tid-based byYear first, then team-centric, then year-only for backward compatibility
 */
export function getFringeCaseClass(dynasty, teamAbbr, year) {
  if (!dynasty) return {}

  // Try NEW tid-based byYear structure first (Phase 7 migration)
  const tid = getTidFromAbbr(teamAbbr)
  if (tid && dynasty.teams?.[tid]?.byYear?.[year]?.fringeCaseClass) {
    return dynasty.teams[tid].byYear[year].fringeCaseClass
  }

  // Check team-centric structure (old format)
  const teamYear = dynasty.fringeCaseClassByTeamYear?.[teamAbbr]?.[year] ||
                   dynasty.fringeCaseClassByTeamYear?.[teamAbbr]?.[String(year)]
  if (teamYear) return teamYear

  // Fall back to year-only structure (legacy format)
  return dynasty.fringeCaseClassByYear?.[year] ||
         dynasty.fringeCaseClassByYear?.[String(year)] || {}
}

/**
 * Check if a player has transferred away (has a transfer movement in their history)
 */
export function hasPlayerTransferredAway(player, fromTeam) {
  if (!player.movements) return false
  return player.movements.some(m =>
    m.type === MOVEMENT_TYPES.TRANSFER &&
    m.from === fromTeam
  )
}

/**
 * Migrate dynasty to new movements system
 * Converts legacy fields to movements[] and pendingDeparture
 */
export function migrateToMovementsSystem(dynasty) {
  if (!dynasty) return dynasty
  if (dynasty._movementsMigrated) return dynasty
  if (!dynasty.players || dynasty.players.length === 0) {
    return { ...dynasty, _movementsMigrated: true }
  }

  const teamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName

  const migratedPlayers = dynasty.players.map(player => {
    // Skip if already has movements array
    if (player.movements && player.movements.length > 0) {
      return player
    }

    const movements = []

    // Determine the player's origin team
    const originTeam = player.team || teamAbbr

    // Add recruitment movement if we can determine when they joined
    if (player.recruitYear && player.isRecruit !== undefined) {
      // This was a recruit
      const recruitType = player.isPortal ? MOVEMENT_TYPES.PORTAL_IN : MOVEMENT_TYPES.RECRUITED
      const fromTeam = player.isPortal ? (player.previousTeam || null) : null
      movements.push(createMovement(
        player.recruitYear,
        recruitType,
        fromTeam,
        originTeam
      ))
    } else if (player.yearStarted) {
      // Legacy: player has yearStarted
      movements.push(createMovement(
        player.yearStarted,
        MOVEMENT_TYPES.ADDED,
        null,
        originTeam
      ))
    }

    // Convert leftTeam/leftYear/leftReason to departure movement
    if (player.leftTeam && player.leftYear) {
      const departureTeam = player.teamsByYear?.[player.leftYear] || originTeam
      const isTransfer = player.leftReason === 'Transfer' || player.leftReason === 'Encouraged Transfer'

      if (isTransfer && player.transferredTo) {
        movements.push(createMovement(
          player.leftYear,
          MOVEMENT_TYPES.TRANSFER,
          departureTeam,
          player.transferredTo,
          player.leftReason
        ))
      } else {
        const extra = player.draftRound ? { draftRound: player.draftRound } : {}
        movements.push(createMovement(
          player.leftYear,
          MOVEMENT_TYPES.DEPARTURE,
          departureTeam,
          null,
          player.leftReason || 'Unknown',
          extra
        ))
      }
    }

    // Convert leavingYear/leavingReason/transferredTo to pendingDeparture
    let pendingDeparture = null
    if (player.leavingYear && player.leavingReason) {
      pendingDeparture = {
        year: Number(player.leavingYear),
        reason: player.leavingReason,
        destination: player.transferredTo || null
      }
    }

    return {
      ...player,
      movements: movements.length > 0 ? movements : [],
      pendingDeparture: pendingDeparture
      // Note: We keep the legacy fields for now for backwards compatibility
      // They will be ignored by the new isPlayerOnRoster logic
    }
  })

  return {
    ...dynasty,
    players: migratedPlayers,
    _movementsMigrated: true
  }
}

export function useDynasty() {
  const context = useContext(DynastyContext)
  if (!context) {
    throw new Error('useDynasty must be used within DynastyProvider')
  }
  return context
}

export function DynastyProvider({ children }) {
  const { user } = useAuth()
  const [dynasties, setDynasties] = useState([])
  const [currentDynasty, setCurrentDynasty] = useState(null)
  const [loading, setLoading] = useState(true)
  const [migrated, setMigrated] = useState(false)
  // Ref to skip Firestore listener updates after manual local state update
  // This prevents the listener from overwriting fresh local changes with stale Firestore data
  // Uses a counter to skip multiple updates (optimistic + server confirm)
  const skipListenerUpdatesCountRef = useRef(0)

  // Helper to apply migrations to dynasties (games + stats + roster)
  const applyMigrations = (dynastyList) => {
    return dynastyList.map(dynasty => {
      let migrated = dynasty

      // Apply game migration if needed
      if (!migrated._gamesMigrated) {
        migrated = migrateToUnifiedGames(migrated)
      }

      // Apply stats migration if needed
      if (!migrated._statsMigrated) {
        migrated = migrateStatsToPlayers(migrated)
      }

      // Apply roster migration if needed (fixes corrupted teamsByYear + backfills current year)
      if (!migrated._rosterMigratedV3) {
        migrated = migrateRosterData(migrated)
      }

      // Apply movements migration if needed (new player movement tracking system)
      if (!migrated._movementsMigrated) {
        migrated = migrateToMovementsSystem(migrated)
      }

      // Apply legacy departure fields cleanup migration
      if (!migrated._legacyDepartureFieldsMigrated) {
        migrated = migrateLegacyDepartureFields(migrated)
      }

      // Apply tid-based team structure migration
      // Converts old abbr-keyed data to new tid-based dynasty.teams structure
      if (!migrated._tidMigrated) {
        migrated = migrateDynastyToTidStructure(migrated)
        migrated._tidMigrated = true
      }

      // Apply full tid migration
      // Converts currentTid, player.teamsByYear, game records, coachTeamByYear to tid
      if (!migrated._tidFullyMigrated) {
        migrated = migrateToFullTidSystem(migrated)
        migrated._tidFullyMigrated = true
      }

      // Ensure coachTeamByYear is initialized (for dynasties created before this feature)
      // This is separate from _tidFullyMigrated because that migration only runs once
      if (!migrated._coachTeamByYearMigrated) {
        migrated = migrateCoachTeamByYear(migrated)
        migrated._coachTeamByYearMigrated = true
      }

      return migrated
    })
  }

  // Load dynasties when user changes
  useEffect(() => {
    // In dev mode, use localStorage fallback (even without user)
    const isDev = import.meta.env.VITE_DEV_MODE === 'true'
    if (isDev) {
      // Load from localStorage in dev mode
      const saved = localStorage.getItem('cfb-dynasties')
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          // Apply all migrations to dynasties
          const migratedDynasties = applyMigrations(parsed)
          setDynasties(migratedDynasties)
        } catch (error) {
          console.error('Error loading dynasties:', error)
        }
      }
      setLoading(false)
      return
    }

    // Production mode - require user
    if (!user) {
      setDynasties([])
      setCurrentDynasty(null)
      setLoading(false)
      return
    }

    // Migrate localStorage data on first load
    const migrateData = async () => {
      if (!migrated) {
        try {
          await migrateLocalStorageData(user.uid)
          setMigrated(true)
        } catch (error) {
          console.error('Migration error:', error)
        }
      }
    }
    migrateData()

    // Subscribe to real-time updates
    const unsubscribe = subscribeToDynasties(user.uid, async (firestoreDynasties) => {
      // Check if we should skip this update (we just manually updated local state)
      if (skipListenerUpdatesCountRef.current > 0) {
        skipListenerUpdatesCountRef.current--
        return
      }

      // Load subcollections for each dynasty in parallel
      // This fetches players and games from their subcollections
      const dynastiesWithSubcollections = await Promise.all(
        firestoreDynasties.map(async (dynasty) => {
          try {
            // Check if this dynasty has been migrated to subcollections
            if (dynasty._subcollectionsMigrated) {
              // Fetch from subcollections
              const [players, games] = await Promise.all([
                getPlayersSubcollection(dynasty.id),
                getGamesSubcollection(dynasty.id)
              ])
              // Always use subcollection data for migrated dynasties
              // Even if empty - that's the source of truth after migration
              return {
                ...dynasty,
                players: players,
                games: games
              }
            } else {
              // Not yet migrated - use main document data
              // NOTE: We do NOT auto-migrate here to avoid race conditions
              // User should manually migrate via Admin Tools when ready
              const hasDataToMigrate = (dynasty.players?.length > 0 || dynasty.games?.length > 0)
              if (hasDataToMigrate) {
                console.log(`Dynasty ${dynasty.id} needs migration to subcollections (use Admin Tools)`)
              }
              // Return with existing data from main document
              return dynasty
            }
          } catch (err) {
            console.error(`Error loading subcollections for dynasty ${dynasty.id}:`, err)
            // Fall back to main document data
            return dynasty
          }
        })
      )

      // Apply all migrations to dynasties from Firestore
      const migratedDynasties = applyMigrations(dynastiesWithSubcollections)

      setDynasties(migratedDynasties)
      setLoading(false)

      // Update current dynasty if it's in the list
      if (currentDynasty) {
        const updated = migratedDynasties.find(d => d.id === currentDynasty.id)
        if (updated) {
          setCurrentDynasty(updated)
        } else {
          setCurrentDynasty(null)
        }
      }

      // PERSIST MIGRATION FLAGS: Save migration flags back to Firestore so migrations don't run again
      // Compare raw vs migrated to see if any dynasty needs flag updates
      migratedDynasties.forEach((migrated, idx) => {
        const raw = firestoreDynasties[idx]
        const flagsToSave = {}

        // Check each migration flag
        if (migrated._gamesMigrated && !raw._gamesMigrated) {
          flagsToSave._gamesMigrated = true
        }
        if (migrated._statsMigrated && !raw._statsMigrated) {
          flagsToSave._statsMigrated = true
        }
        if (migrated._rosterMigratedV3 && !raw._rosterMigratedV3) {
          flagsToSave._rosterMigratedV3 = true
        }
        if (migrated._movementsMigrated && !raw._movementsMigrated) {
          flagsToSave._movementsMigrated = true
        }
        if (migrated._legacyDepartureFieldsMigrated && !raw._legacyDepartureFieldsMigrated) {
          flagsToSave._legacyDepartureFieldsMigrated = true
        }
        if (migrated._tidMigrated && !raw._tidMigrated) {
          flagsToSave._tidMigrated = true
        }
        if (migrated._tidFullyMigrated && !raw._tidFullyMigrated) {
          flagsToSave._tidFullyMigrated = true
          // Also persist currentTid since it's added during migration
          if (migrated.currentTid) {
            flagsToSave.currentTid = migrated.currentTid
          }
        }

        // If any flags need saving, update Firestore
        if (Object.keys(flagsToSave).length > 0) {
          skipListenerUpdatesCountRef.current++
          updateDynastyInFirestore(migrated.id, flagsToSave).catch(err => {
            console.error('Failed to persist migration flags:', err)
          })
        }
      })
    })

    return () => unsubscribe()
  }, [user, migrated, currentDynasty?.id])

  // Save to localStorage in dev mode
  useEffect(() => {
    const isDev = import.meta.env.VITE_DEV_MODE === 'true'

    // Don't save during initial load
    if (loading) return

    if (isDev && dynasties.length > 0) {
      localStorage.setItem('cfb-dynasties', JSON.stringify(dynasties))
    }
    // Note: We don't remove from localStorage when empty to avoid accidental data loss
  }, [dynasties, loading])

  const createDynasty = async (dynastyData) => {
    const startYear = parseInt(dynastyData.startYear)

    // If custom teams exist, initialize conference data with replacement applied
    let initialConferences = null
    if (dynastyData.customTeams && Object.keys(dynastyData.customTeams).length > 0) {
      initialConferences = getConferencesWithCustomTeams(dynastyData.customTeams)
    }

    // Initialize the teams map from the master TEAMS list
    // This is the single source of truth for all team data in this dynasty
    const teams = initializeDynastyTeams()

    // If there's a teambuilder team, replace the corresponding slot
    if (dynastyData.customTeams) {
      for (const [abbr, customTeam] of Object.entries(dynastyData.customTeams)) {
        // Find the tid of the team being replaced
        const replacedTid = getTidFromAbbr(customTeam.replacesTeam)
        if (replacedTid) {
          setTeambuilderTeam(teams, replacedTid, {
            abbr: abbr,
            name: customTeam.name,
            logo: customTeam.logoUrl,
            primaryColor: customTeam.backgroundColor || customTeam.primaryColor,
            secondaryColor: customTeam.textColor || customTeam.secondaryColor
          })
        }
      }
    }

    // Get the currentTid for the user's team
    // This is the single source of truth for which team the user is coaching
    const currentTid = getTidFromTeamName(dynastyData.teamName, teams)
    const currentTeamAbbr = teams[currentTid]?.abbr

    const newDynastyData = {
      ...dynastyData,
      currentTid, // Primary team identifier (tid)
      currentYear: startYear,
      currentWeek: 0,
      currentPhase: 'preseason',
      seasons: [],
      games: [],
      players: [],
      recruits: [],
      schedule: [],
      rankings: [],
      nextPID: 1, // Initialize player ID counter
      // Teams map - single source of truth for all team data (tid-keyed)
      teams,
      _tidMigrated: true, // Mark as already using tid-based team registry
      _tidFullyMigrated: true, // Mark as using full tid system (currentTid, player.teamsByYear as tid, game.userTid, etc.)
      // Initialize coachTeamByYear with the starting year
      // This ensures games entered in preseason can be properly attributed
      coachTeamByYear: {
        [startYear]: {
          tid: currentTid,
          team: currentTeamAbbr,
          teamName: dynastyData.teamName
        }
      },
      preseasonSetup: {
        scheduleEntered: false,
        rosterEntered: false,
        teamRatingsEntered: false,
        coachingStaffEntered: false,
        conferencesEntered: false  // Shows as incomplete, but defaults are valid if user skips
      },
      teamRatings: {
        overall: null,
        offense: null,
        defense: null
      },
      coachingStaff: {
        hcName: null,
        ocName: null,
        dcName: null
      },
      // Initialize custom conferences if custom teams exist (replaces old team in conference)
      ...(initialConferences ? {
        customConferencesByYear: {
          [startYear]: initialConferences
        },
        customConferences: initialConferences // Legacy field for backwards compatibility
      } : {})
    }

    const isDev = import.meta.env.VITE_DEV_MODE === 'true'

    // Note: Google Sheet is created lazily when user opens Schedule Entry modal
    // This avoids creating sheets that may never be used

    if (isDev || !user) {
      // Dev mode: use localStorage
      const newDynasty = {
        id: Date.now().toString(),
        ...newDynastyData,
        createdAt: new Date().toISOString(),
        lastModified: Date.now()
      }

      // Immediately save to localStorage before updating state
      const existingDynasties = dynasties
      const updatedDynasties = [...existingDynasties, newDynasty]
      localStorage.setItem('cfb-dynasties', JSON.stringify(updatedDynasties))

      setDynasties(updatedDynasties)
      setCurrentDynasty(newDynasty)
      return newDynasty
    }

    // Production: use Firestore
    try {
      const newDynasty = await createDynastyInFirestore(user.uid, {
        ...newDynastyData,
        lastModified: Date.now(),
        // New dynasties start with subcollections enabled to avoid 1MB limit
        _subcollectionsMigrated: true
      })
      // Mark local state as migrated too
      const dynastyWithFlag = { ...newDynasty, _subcollectionsMigrated: true }
      // CRITICAL: Update both dynasties array AND currentDynasty
      // Without this, updateDynasty can't find the dynasty and routes players incorrectly
      setDynasties(prev => [...prev, dynastyWithFlag])
      setCurrentDynasty(dynastyWithFlag)
      return dynastyWithFlag
    } catch (error) {
      console.error('Error creating dynasty:', error)
      throw error
    }
  }

  const updateDynasty = async (dynastyId, updates, options = {}) => {
    const isDev = import.meta.env.VITE_DEV_MODE === 'true'
    const { skipLastModified = false } = options

    // Helper to recursively remove undefined values (Firestore doesn't accept undefined)
    const removeUndefined = (obj) => {
      if (obj === null || obj === undefined) return obj
      if (Array.isArray(obj)) {
        return obj.map(item => removeUndefined(item))
      }
      if (typeof obj === 'object') {
        return Object.fromEntries(
          Object.entries(obj)
            .filter(([_, v]) => v !== undefined)
            .map(([k, v]) => [k, removeUndefined(v)])
        )
      }
      return obj
    }

    // BULLETPROOF: If updating players array, remove any duplicates by PID
    // This prevents duplicate players from ever being saved
    let sanitizedUpdates = { ...updates }
    if (sanitizedUpdates.players && Array.isArray(sanitizedUpdates.players)) {
      const seenPIDs = new Set()
      const seenNames = new Set()
      sanitizedUpdates.players = sanitizedUpdates.players.filter(player => {
        // Skip if no player object
        if (!player) return false

        // Check for duplicate PID
        if (player.pid != null) {
          if (seenPIDs.has(player.pid)) {
            console.warn(`Duplicate player PID detected and removed: ${player.pid} (${player.name})`)
            return false
          }
          seenPIDs.add(player.pid)
        }

        // Also check for duplicate names (same name + same team + same year class = likely duplicate)
        const nameKey = `${(player.name || '').toLowerCase().trim()}_${player.team || ''}_${player.year || ''}`
        if (player.name && seenNames.has(nameKey)) {
          console.warn(`Duplicate player name/team/class detected and removed: ${player.name}`)
          return false
        }
        if (player.name) seenNames.add(nameKey)

        return true
      })
    }

    // NOTE: Games now use unified format (team1Tid, team2Tid, homeTeamTid)
    // No normalization needed - migration handles conversion from old format

    // Add lastModified timestamp to updates (unless skipLastModified is true)
    const updatesWithTimestamp = removeUndefined({
      ...sanitizedUpdates,
      ...(skipLastModified ? {} : { lastModified: Date.now() })
    })

    if (isDev || !user) {
      // Dev mode: update local state

      // CRITICAL FIX: Read from localStorage to get the absolute latest data
      // This prevents race conditions when multiple updates happen in quick succession
      const currentData = localStorage.getItem('cfb-dynasties')
      const currentDynasties = currentData ? JSON.parse(currentData) : dynasties

      const updated = currentDynasties.map(d => (String(d.id) === String(dynastyId) ? { ...d, ...updatesWithTimestamp } : d))

      // Immediately save to localStorage
      localStorage.setItem('cfb-dynasties', JSON.stringify(updated))

      setDynasties(updated)

      // CRITICAL FIX: Update currentDynasty with the full updated object from the array
      // instead of just merging updates (which can miss nested object changes)
      if (String(currentDynasty?.id) === String(dynastyId)) {
        const updatedDynasty = updated.find(d => String(d.id) === String(dynastyId))
        setCurrentDynasty(updatedDynasty)
      }
      return
    }

    // Production: update Firestore
    try {
      // Set counter to skip the next 2 listener updates BEFORE calling Firestore
      // (the listener fires during updateDoc, not after)
      skipListenerUpdatesCountRef.current = 2

      // Check if dynasty is migrated to subcollections
      // Also check currentDynasty as fallback (in case dynasties array hasn't updated yet)
      let dynasty = dynasties.find(d => String(d.id) === String(dynastyId))
      if (!dynasty && String(currentDynasty?.id) === String(dynastyId)) {
        dynasty = currentDynasty
      }
      const isMigrated = dynasty?._subcollectionsMigrated === true

      // SUBCOLLECTION ROUTING: If migrated, route players/games to subcollections
      let mainDocUpdates = { ...updatesWithTimestamp }
      const subcollectionPromises = []

      if (isMigrated) {
        // Route players to subcollection
        if (mainDocUpdates.players && Array.isArray(mainDocUpdates.players)) {
          console.log(`Saving ${mainDocUpdates.players.length} players to subcollection`)
          subcollectionPromises.push(
            savePlayersToSubcollection(dynastyId, mainDocUpdates.players)
          )
          // Don't save players to main doc - they're in subcollection now
          delete mainDocUpdates.players
        }

        // Route games to subcollection
        if (mainDocUpdates.games && Array.isArray(mainDocUpdates.games)) {
          console.log(`Saving ${mainDocUpdates.games.length} games to subcollection`)
          subcollectionPromises.push(
            saveGamesToSubcollection(dynastyId, mainDocUpdates.games)
          )
          // Don't save games to main doc - they're in subcollection now
          delete mainDocUpdates.games
        }
      }

      // Execute subcollection writes and main doc update in parallel
      const writePromises = [...subcollectionPromises]

      // Only update main doc if there are non-subcollection updates
      if (Object.keys(mainDocUpdates).length > 0) {
        writePromises.push(updateDynastyInFirestore(dynastyId, mainDocUpdates))
      }

      await Promise.all(writePromises)

      // WORKAROUND: Also update local state immediately after Firestore update
      // This ensures the UI reflects the changes without waiting for the listener
      // (which sometimes gets stale data due to Firestore caching issues)

      // Helper to expand dot-notation keys into nested objects for local state update
      // e.g., { "schedulesByTeamYear.UT.2029": [...] } becomes { schedulesByTeamYear: { UT: { 2029: [...] } } }
      const expandDotNotation = (updates) => {
        const result = {}
        for (const [key, value] of Object.entries(updates)) {
          if (key.includes('.')) {
            const parts = key.split('.')
            let current = result
            for (let i = 0; i < parts.length - 1; i++) {
              if (!current[parts[i]]) current[parts[i]] = {}
              current = current[parts[i]]
            }
            current[parts[parts.length - 1]] = value
          } else {
            result[key] = value
          }
        }
        return result
      }

      // Helper to deep merge objects (for nested structures like schedulesByTeamYear)
      const deepMerge = (target, source) => {
        const result = { ...target }
        for (const key of Object.keys(source)) {
          if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            result[key] = deepMerge(result[key] || {}, source[key])
          } else {
            result[key] = source[key]
          }
        }
        return result
      }

      // Use original updatesWithTimestamp for local state (includes players/games)
      const expandedUpdates = expandDotNotation(updatesWithTimestamp)

      // Check if dynasty is in the array (might not be if just created - React state is async)
      const dynastyInArray = dynasties.some(d => String(d.id) === String(dynastyId))

      let updatedDynasties
      if (dynastyInArray) {
        // Normal case: update dynasty in the array
        updatedDynasties = dynasties.map(d =>
          String(d.id) === String(dynastyId) ? deepMerge(d, expandedUpdates) : d
        )
      } else if (String(currentDynasty?.id) === String(dynastyId)) {
        // Dynasty was just created and isn't in dynasties array yet
        // Add the updated dynasty to the array
        const updatedDynasty = deepMerge(currentDynasty, expandedUpdates)
        updatedDynasties = [...dynasties, updatedDynasty]
      } else {
        // Dynasty not found anywhere - shouldn't happen but keep existing array
        updatedDynasties = dynasties
      }
      setDynasties(updatedDynasties)

      if (String(currentDynasty?.id) === String(dynastyId)) {
        const updatedDynasty = updatedDynasties.find(d => String(d.id) === String(dynastyId))
        // Fallback to merging currentDynasty directly if not found in array
        setCurrentDynasty(updatedDynasty || deepMerge(currentDynasty, expandedUpdates))
      }
    } catch (error) {
      console.error('Error updating dynasty:', error)
      throw error
    }
  }

  const deleteDynasty = async (dynastyId) => {

    const isDev = import.meta.env.VITE_DEV_MODE === 'true'

    if (isDev || !user) {
      // Dev mode: delete from local state
      const updated = dynasties.filter(d => {
        const match = String(d.id) !== String(dynastyId)
        return match
      })


      // Immediately save to localStorage
      if (updated.length > 0) {
        localStorage.setItem('cfb-dynasties', JSON.stringify(updated))
      } else {
        localStorage.removeItem('cfb-dynasties')
      }

      setDynasties(updated)

      if (String(currentDynasty?.id) === String(dynastyId)) {
        setCurrentDynasty(null)
      }
      return
    }

    // Production: delete from Firestore (including subcollections)
    try {
      // Use the new function that also deletes players/games subcollections
      await deleteDynastyWithSubcollections(dynastyId)
      if (String(currentDynasty?.id) === String(dynastyId)) {
        setCurrentDynasty(null)
      }
    } catch (error) {
      console.error('❌ Error deleting dynasty from Firestore:', error)
      throw error
    }
  }

  const selectDynasty = (dynastyId) => {
    const dynasty = dynasties.find(d => d.id === dynastyId)
    setCurrentDynasty(dynasty || null)
  }

  const addGame = async (dynastyId, gameData) => {
    // Helper to recursively remove undefined values (Firestore doesn't accept undefined)
    const removeUndefined = (obj) => {
      if (obj === null || obj === undefined) return obj
      if (Array.isArray(obj)) {
        return obj.map(item => removeUndefined(item))
      }
      if (typeof obj === 'object') {
        return Object.fromEntries(
          Object.entries(obj)
            .filter(([_, v]) => v !== undefined)
            .map(([k, v]) => [k, removeUndefined(v)])
        )
      }
      return obj
    }

    // Clean the gameData of any undefined values
    const cleanGameData = removeUndefined(gameData)

    // CRITICAL: Read from localStorage to get the latest data
    const isDev = import.meta.env.VITE_DEV_MODE === 'true'
    let dynasty

    if (isDev || !user) {
      const currentData = localStorage.getItem('cfb-dynasties')
      const currentDynasties = currentData ? JSON.parse(currentData) : dynasties
      dynasty = currentDynasties.find(d => String(d.id) === String(dynastyId))
    } else {
      dynasty = String(currentDynasty?.id) === String(dynastyId)
        ? currentDynasty
        : dynasties.find(d => String(d.id) === String(dynastyId))
    }

    if (!dynasty) {
      console.error('Dynasty not found:', dynastyId)
      return
    }

    // Detect game format and CPU games
    // UNIFIED FORMAT: has team1Tid/team2Tid
    // LEGACY FORMAT: has team1/team2 (abbr) or userTeam/opponent
    const hasUnifiedFormat = cleanGameData.team1Tid && cleanGameData.team2Tid
    const hasLegacyTeamFormat = cleanGameData.team1 && cleanGameData.team2 && !hasUnifiedFormat
    const hasLegacyUserFormat = cleanGameData.opponent || cleanGameData.userTeam

    // CPU games: have team identifiers but no user involvement marker
    // In unified format: has team1Tid/team2Tid but user's tid is not involved
    // In legacy format: has team1/team2 but no userTeam/opponent
    const currentUserTid = getCurrentTeamTid(dynasty)
    const currentUserTeam = getCurrentTeamAbbr(dynasty) || dynasty.teamName

    let isCPUGame = false
    if (hasUnifiedFormat) {
      // Unified format: CPU game if neither team is the user's current team
      isCPUGame = cleanGameData.team1Tid !== currentUserTid && cleanGameData.team2Tid !== currentUserTid
    } else if (hasLegacyTeamFormat && !hasLegacyUserFormat) {
      // Legacy format: CPU game if has team1/team2 but no userTeam/opponent
      isCPUGame = true
    }

    // NOTE: We no longer add userTeam field for non-CPU games
    // User's team is derived from coachTeamByYear[game.year].tid at read time
    // This makes games team-neutral and supports job changes correctly

    // UNIFIED GAME TYPES: Set gameType field based on game flags
    // This ensures all games (user and CPU) have consistent gameType for filtering
    if (!cleanGameData.gameType) {
      if (cleanGameData.isCFPChampionship) {
        cleanGameData.gameType = GAME_TYPES.CFP_CHAMPIONSHIP
      } else if (cleanGameData.isCFPSemifinal) {
        cleanGameData.gameType = GAME_TYPES.CFP_SEMIFINAL
      } else if (cleanGameData.isCFPQuarterfinal) {
        cleanGameData.gameType = GAME_TYPES.CFP_QUARTERFINAL
      } else if (cleanGameData.isCFPFirstRound) {
        cleanGameData.gameType = GAME_TYPES.CFP_FIRST_ROUND
      } else if (cleanGameData.isBowlGame) {
        cleanGameData.gameType = GAME_TYPES.BOWL
      } else if (cleanGameData.isConferenceChampionship) {
        cleanGameData.gameType = GAME_TYPES.CONFERENCE_CHAMPIONSHIP
      } else {
        cleanGameData.gameType = GAME_TYPES.REGULAR
      }
    }

    // LEGACY FORMAT CONVERSION: If game has legacy fields, convert to unified format
    // This handles any code still passing legacy format (backward compatibility)
    const isCFPGame = cleanGameData.isCFPFirstRound || cleanGameData.isCFPQuarterfinal ||
                      cleanGameData.isCFPSemifinal || cleanGameData.isCFPChampionship

    if (!hasUnifiedFormat && hasLegacyUserFormat && !isCPUGame) {
      // Convert legacy user game format to unified format
      const userTeamAbbr = cleanGameData.userTeam || currentUserTeam
      const opponentAbbr = cleanGameData.opponent
      const userTid = getTidFromAbbr(userTeamAbbr) || currentUserTid
      const opponentTid = getTidFromAbbr(opponentAbbr)

      // Determine scores from legacy fields
      const userScore = cleanGameData.team1Score ?? parseInt(cleanGameData.teamScore) ?? null
      const oppScore = cleanGameData.team2Score ?? parseInt(cleanGameData.opponentScore) ?? null
      const userWon = cleanGameData.result === 'win' || cleanGameData.result === 'W' ||
                      (userScore !== null && oppScore !== null && userScore > oppScore)

      // For CFP First Round, determine seeds and correct team ordering
      if (isCFPGame && cleanGameData.isCFPFirstRound) {
        const cfpSeeds = dynasty.cfpSeedsByYear?.[cleanGameData.year] || []
        const userSeed = cfpSeeds.find(s => s.team === userTeamAbbr)?.seed
        const oppSeed = cfpSeeds.find(s => s.team === opponentAbbr)?.seed || (userSeed ? 17 - userSeed : null)

        // Higher seed (lower number) should be team1 (home team in first round)
        if (userSeed && oppSeed && userSeed > oppSeed) {
          // Opponent has higher seed - they are team1
          cleanGameData.team1Tid = opponentTid
          cleanGameData.team2Tid = userTid
          cleanGameData.team1Score = oppScore
          cleanGameData.team2Score = userScore
          cleanGameData.seed1 = oppSeed
          cleanGameData.seed2 = userSeed
          cleanGameData.homeTeamTid = opponentTid // Higher seed hosts
        } else {
          // User has higher seed - they are team1
          cleanGameData.team1Tid = userTid
          cleanGameData.team2Tid = opponentTid
          cleanGameData.team1Score = userScore
          cleanGameData.team2Score = oppScore
          cleanGameData.seed1 = userSeed
          cleanGameData.seed2 = oppSeed
          cleanGameData.homeTeamTid = userTid // Higher seed hosts
        }
        // Also set winner tid for bracket display
        const winnerTid = userWon ? userTid : opponentTid
        cleanGameData.winnerTid = winnerTid
      } else if (isCFPGame) {
        // For QF/SF/Championship (neutral site), user team1 is arbitrary but consistent
        cleanGameData.team1Tid = userTid
        cleanGameData.team2Tid = opponentTid
        cleanGameData.team1Score = userScore
        cleanGameData.team2Score = oppScore
        cleanGameData.homeTeamTid = null // Neutral site
        cleanGameData.winnerTid = userWon ? userTid : opponentTid
      } else {
        // Regular/CC/Bowl user games
        cleanGameData.team1Tid = userTid
        cleanGameData.team2Tid = opponentTid
        cleanGameData.team1Score = userScore
        cleanGameData.team2Score = oppScore

        // Set homeTeamTid based on location
        if (cleanGameData.location === 'home') {
          cleanGameData.homeTeamTid = userTid
        } else if (cleanGameData.location === 'away') {
          cleanGameData.homeTeamTid = opponentTid
        } else {
          cleanGameData.homeTeamTid = null // Neutral
        }
      }

      // Transfer ranks and ratings to unified format if not already set
      if (!cleanGameData.team1Rank && cleanGameData.userRank) {
        cleanGameData.team1Rank = cleanGameData.userRank
      }
      if (!cleanGameData.team2Rank && cleanGameData.opponentRank) {
        cleanGameData.team2Rank = cleanGameData.opponentRank
      }
      if (!cleanGameData.team2Overall && cleanGameData.opponentOverall) {
        cleanGameData.team2Overall = cleanGameData.opponentOverall
      }
    }

    // ENSURE winnerTid is set for all games with scores
    // This is important for bracket display and game history
    if (!cleanGameData.winnerTid && cleanGameData.team1Tid && cleanGameData.team2Tid) {
      const score1 = parseInt(cleanGameData.team1Score) || 0
      const score2 = parseInt(cleanGameData.team2Score) || 0
      if (score1 > 0 || score2 > 0) {
        cleanGameData.winnerTid = score1 > score2 ? cleanGameData.team1Tid : cleanGameData.team2Tid
      }
    }

    // Check if game already exists for this week/year
    // Special handling for CC games, bowl games, and CFP games
    let existingGameIndex
    if (cleanGameData.isConferenceChampionship) {
      existingGameIndex = dynasty.games?.findIndex(
        g => g.isConferenceChampionship && Number(g.year) === Number(cleanGameData.year)
      )
    } else if (cleanGameData.isBowlGame) {
      existingGameIndex = dynasty.games?.findIndex(
        g => g.isBowlGame && Number(g.year) === Number(cleanGameData.year)
      )
    } else if (cleanGameData.isCFPFirstRound) {
      existingGameIndex = dynasty.games?.findIndex(
        g => g.isCFPFirstRound && Number(g.year) === Number(cleanGameData.year)
      )
    } else if (cleanGameData.isCFPQuarterfinal) {
      existingGameIndex = dynasty.games?.findIndex(
        g => g.isCFPQuarterfinal && Number(g.year) === Number(cleanGameData.year)
      )
    } else if (cleanGameData.isCFPSemifinal) {
      existingGameIndex = dynasty.games?.findIndex(
        g => g.isCFPSemifinal && Number(g.year) === Number(cleanGameData.year)
      )
    } else if (cleanGameData.isCFPChampionship) {
      existingGameIndex = dynasty.games?.findIndex(
        g => g.isCFPChampionship && Number(g.year) === Number(cleanGameData.year)
      )
    } else {
      existingGameIndex = dynasty.games?.findIndex(
        g => Number(g.week) === Number(cleanGameData.week) && Number(g.year) === Number(cleanGameData.year)
      )
    }

    let updatedGames
    let game

    if (existingGameIndex !== -1 && existingGameIndex !== undefined) {
      // Update existing game - ensure it has proper ID (especially for CFP games)
      const existingGame = dynasty.games[existingGameIndex]

      // For CFP games, ensure proper slot ID format
      let gameId = existingGame.id || Date.now().toString()
      let cfpSeedData = {} // To store seed info for CFP First Round games

      // Check if this is a CFP game that needs ID correction
      if (cleanGameData.isCFPFirstRound || existingGame.isCFPFirstRound) {
        const cfpSeeds = dynasty.cfpSeedsByYear?.[cleanGameData.year || existingGame.year] || []
        const userTeamAbbr = getCurrentTeamAbbr(dynasty)
        const userSeed = cfpSeeds.find(s => s.team === userTeamAbbr)?.seed
        const oppSeed = userSeed ? 17 - userSeed : null
        const slotId = getFirstRoundSlotId(userSeed, oppSeed)
        if (slotId) {
          gameId = getCFPGameId(slotId, cleanGameData.year || existingGame.year)
        }
        // CRITICAL: Add seed data so bracket can find this game
        if (userSeed && oppSeed) {
          cfpSeedData = {
            cfpSeed1: userSeed,
            cfpSeed2: oppSeed,
            seed1: userSeed,
            seed2: oppSeed,
            gameType: 'cfp_first_round'
          }
        }
      } else if ((cleanGameData.isCFPQuarterfinal || existingGame.isCFPQuarterfinal) && (cleanGameData.bowlName || existingGame.bowlName)) {
        const slotId = getSlotIdFromBowlName(cleanGameData.bowlName || existingGame.bowlName)
        if (slotId) {
          gameId = getCFPGameId(slotId, cleanGameData.year || existingGame.year)
        }
      } else if ((cleanGameData.isCFPSemifinal || existingGame.isCFPSemifinal) && (cleanGameData.bowlName || existingGame.bowlName)) {
        const slotId = getSlotIdFromBowlName(cleanGameData.bowlName || existingGame.bowlName)
        if (slotId) {
          gameId = getCFPGameId(slotId, cleanGameData.year || existingGame.year)
        }
      } else if (cleanGameData.isCFPChampionship || existingGame.isCFPChampionship) {
        gameId = getCFPGameId('cfpnc', cleanGameData.year || existingGame.year)
      }

      game = {
        ...existingGame,
        ...cleanGameData,
        ...cfpSeedData, // Include CFP seed data for bracket matching
        id: gameId,
        updatedAt: new Date().toISOString()
      }
      updatedGames = [...dynasty.games]
      updatedGames[existingGameIndex] = game
    } else {
      // Add new game
      // For CFP games, generate proper slot ID based on game type
      let gameId = Date.now().toString()
      let cfpSeedData = {} // To store seed info for CFP First Round games

      if (cleanGameData.isCFPFirstRound) {
        const cfpSeeds = dynasty.cfpSeedsByYear?.[cleanGameData.year] || []
        const userTeamAbbr = getCurrentTeamAbbr(dynasty)
        const userSeed = cfpSeeds.find(s => s.team === userTeamAbbr)?.seed
        const oppSeed = userSeed ? 17 - userSeed : null
        const slotId = getFirstRoundSlotId(userSeed, oppSeed)
        if (slotId) {
          gameId = getCFPGameId(slotId, cleanGameData.year)
        }
        // CRITICAL: Add seed data so bracket can find this game
        if (userSeed && oppSeed) {
          cfpSeedData = {
            cfpSeed1: userSeed,
            cfpSeed2: oppSeed,
            seed1: userSeed,
            seed2: oppSeed,
            gameType: 'cfp_first_round'
          }
        }
      } else if (cleanGameData.isCFPQuarterfinal && cleanGameData.bowlName) {
        const slotId = getSlotIdFromBowlName(cleanGameData.bowlName)
        if (slotId) {
          gameId = getCFPGameId(slotId, cleanGameData.year)
        }
      } else if (cleanGameData.isCFPSemifinal && cleanGameData.bowlName) {
        const slotId = getSlotIdFromBowlName(cleanGameData.bowlName)
        if (slotId) {
          gameId = getCFPGameId(slotId, cleanGameData.year)
        }
      } else if (cleanGameData.isCFPChampionship) {
        gameId = getCFPGameId('cfpnc', cleanGameData.year)
      }

      game = {
        id: gameId,
        ...cleanGameData,
        ...cfpSeedData, // Include CFP seed data for bracket matching
        createdAt: new Date().toISOString()
      }
      updatedGames = [...(dynasty.games || []), game]
    }

    // Build updates object - games[] is the single source of truth for CFP games
    // cfpResultsByYear is deprecated and only kept for reading legacy data
    const updates = { games: updatedGames }

    // AUTO-SYNC: Process box score stats if present (delta tracking)
    // The manual "Sync Stats" button in Player Editor is a backup for fixing discrepancies
    if (cleanGameData.boxScore && !isCPUGame) {
      const existingGame = existingGameIndex !== -1 && existingGameIndex !== undefined
        ? dynasty.games[existingGameIndex]
        : null
      const oldContribution = existingGame?.statsContributed || null

      const { updatedPlayers, statsContributed } = processBoxScoreSave(
        dynasty.players || [],
        cleanGameData.boxScore,
        oldContribution,
        cleanGameData.year
      )

      // Store the stats contribution on the game for future delta calculations
      const gameIndex = updatedGames.findIndex(g => g.id === game.id)
      if (gameIndex !== -1) {
        updatedGames[gameIndex] = { ...updatedGames[gameIndex], statsContributed }
      }

      updates.players = updatedPlayers
      updates.games = updatedGames
    }

    await updateDynasty(dynastyId, updates)

    return game
  }

  // Add or update CPU bowl games as proper game entries in the games[] array
  // This ensures ALL games (user and CPU) are stored uniformly
  const saveCPUBowlGames = async (dynastyId, bowlGames, year, week = 'week1') => {
    const isDev = import.meta.env.VITE_DEV_MODE === 'true'
    let dynasty

    if (isDev || !user) {
      const currentData = localStorage.getItem('cfb-dynasties')
      const currentDynasties = currentData ? JSON.parse(currentData) : dynasties
      dynasty = currentDynasties.find(d => String(d.id) === String(dynastyId))
    } else {
      dynasty = String(currentDynasty?.id) === String(dynastyId)
        ? currentDynasty
        : dynasties.find(d => String(d.id) === String(dynastyId))
    }

    if (!dynasty) {
      console.error('Dynasty not found:', dynastyId)
      return
    }

    const userTeamAbbr = getCurrentTeamAbbr(dynasty)
    const existingGames = dynasty.games || []

    // Filter out existing bowl games for this year and week to avoid duplicates
    // (Both CPU and user bowl games entered via the modal will be replaced)
    const filteredGames = existingGames.filter(g => {
      // Keep games from different years
      if (Number(g.year) !== Number(year)) return true
      // Keep non-bowl games
      if (!g.isBowlGame) return true
      // Keep games from different bowl weeks
      if (g.bowlWeek !== week) return true
      // Remove bowl games from same year/week (will be replaced with fresh data)
      return false
    })

    // Create game entries for each bowl game in UNIFIED FORMAT
    const userTid = getCurrentTeamTid(dynasty)
    const newGames = bowlGames
      .filter(bowl => {
        // Only process games with valid data
        // Support both tid-based and abbr-based input
        const hasTeam1 = bowl.team1Tid || bowl.team1
        const hasTeam2 = bowl.team2Tid || bowl.team2
        if (!hasTeam1 || !hasTeam2) return false
        if (bowl.team1Score === null || bowl.team1Score === undefined) return false
        if (bowl.team2Score === null || bowl.team2Score === undefined) return false
        return true
      })
      .map(bowl => {
        // Get tids (support both input formats)
        const team1Tid = bowl.team1Tid || getTidFromAbbr(bowl.team1)
        const team2Tid = bowl.team2Tid || getTidFromAbbr(bowl.team2)

        // Determine scores and winner
        const team1Score = parseInt(bowl.team1Score)
        const team2Score = parseInt(bowl.team2Score)
        const winnerTid = team1Score > team2Score ? team1Tid : team2Tid

        return {
          id: `bowl-${year}-${bowl.bowlName?.replace(/\s+/g, '-').toLowerCase() || Date.now()}`,
          isBowlGame: true,
          bowlName: bowl.bowlName,
          bowlWeek: week,
          year: Number(year),
          week: 'Bowl',
          gameType: GAME_TYPES.BOWL,

          // UNIFIED FORMAT: tid-based team identification
          team1Tid,
          team2Tid,
          team1Score,
          team2Score,
          homeTeamTid: null,  // Bowl games are neutral site
          winnerTid,

          // Preserve team ranks if provided
          ...(bowl.team1Rank && { team1Rank: parseInt(bowl.team1Rank) }),
          ...(bowl.team2Rank && { team2Rank: parseInt(bowl.team2Rank) }),

          // Preserve any notes/links if they exist
          gameNote: bowl.gameNote || '',
          links: bowl.links || '',
          createdAt: new Date().toISOString()
        }
      })

    const updatedGames = [...filteredGames, ...newGames]

    await updateDynasty(dynastyId, { games: updatedGames })

    return newGames
  }

  // Save CFP games in unified format to games[] array
  // Handles all rounds: First Round, Quarterfinals, Semifinals, Championship
  // This is the single source of truth for CFP games - does NOT write to cfpResultsByYear
  const saveCFPGames = async (dynastyId, gamesData, year, roundType) => {
    const isDev = import.meta.env.VITE_DEV_MODE === 'true'
    let dynasty

    if (isDev || !user) {
      const currentData = localStorage.getItem('cfb-dynasties')
      const currentDynasties = currentData ? JSON.parse(currentData) : dynasties
      dynasty = currentDynasties.find(d => String(d.id) === String(dynastyId))
    } else {
      dynasty = String(currentDynasty?.id) === String(dynastyId)
        ? currentDynasty
        : dynasties.find(d => String(d.id) === String(dynastyId))
    }

    if (!dynasty) {
      console.error('Dynasty not found:', dynastyId)
      return
    }

    const existingGames = dynasty.games || []

    // Get user's team tid for this year to check if game involves user's team
    const userTidForYear = dynasty.coachTeamByYear?.[year]?.tid || getCurrentTeamTid(dynasty)

    // Determine which legacy flag to check based on round type
    const legacyFlagMap = {
      [GAME_TYPES.CFP_FIRST_ROUND]: 'isCFPFirstRound',
      [GAME_TYPES.CFP_QUARTERFINAL]: 'isCFPQuarterfinal',
      [GAME_TYPES.CFP_SEMIFINAL]: 'isCFPSemifinal',
      [GAME_TYPES.CFP_CHAMPIONSHIP]: 'isCFPChampionship'
    }
    const legacyFlag = legacyFlagMap[roundType]

    // Filter out existing games of this type for this year
    // BUT preserve user's game if it was entered separately
    // User's game detected by: team1Tid or team2Tid matches user's coached team for this year
    // (Also supports legacy userTeam field during transition)
    const filteredGames = existingGames.filter(g => {
      const isThisRoundType = g.gameType === roundType || g[legacyFlag]
      const isThisYear = Number(g.year) === Number(year)
      if (isThisRoundType && isThisYear) {
        // Check if this is user's game (unified format: team1Tid/team2Tid match, legacy: userTeam field)
        const isUserGame = (g.team1Tid === userTidForYear || g.team2Tid === userTidForYear) ||
                          (g.userTeam && getTidFromAbbr(g.userTeam) === userTidForYear)
        // Keep user's game - it will be merged/updated below if also in gamesData
        return isUserGame
      }
      return true
    })

    // Build new games array
    const newGames = []

    // Get user's team tid for this year to determine if it's a user game
    const userTid = dynasty.coachTeamByYear?.[year]?.tid || getCurrentTeamTid(dynasty)

    for (const gameData of gamesData) {
      // Skip incomplete games - support both tid and abbr inputs
      const team1Abbr = gameData.team1
      const team2Abbr = gameData.team2
      if (!team1Abbr || !team2Abbr) continue
      if (gameData.team1Score === null || gameData.team1Score === undefined) continue
      if (gameData.team2Score === null || gameData.team2Score === undefined) continue

      // Resolve team tids (accept both tid and abbr inputs)
      const team1Tid = gameData.team1Tid || getTidFromAbbr(team1Abbr)
      const team2Tid = gameData.team2Tid || getTidFromAbbr(team2Abbr)

      // Determine slot ID based on round type
      let slotId
      if (roundType === GAME_TYPES.CFP_FIRST_ROUND) {
        slotId = getFirstRoundSlotId(gameData.seed1, gameData.seed2)
      } else {
        slotId = getSlotIdFromBowlName(gameData.bowlName)
      }

      const gameId = slotId ? getCFPGameId(slotId, year) : `cfp-${roundType}-${year}-${Date.now()}`

      // Determine winner (tid-based)
      const team1Score = parseInt(gameData.team1Score)
      const team2Score = parseInt(gameData.team2Score)
      const winnerTid = team1Score > team2Score ? team1Tid : team2Tid

      // UNIFIED FORMAT: Use tid-based fields only
      // User's team is determined at read time via coachTeamByYear[year].tid
      const unifiedGame = {
        id: gameId,
        year: Number(year),
        gameType: roundType,
        // Team identification (tid only)
        team1Tid,
        team2Tid,
        // Scores
        team1Score,
        team2Score,
        // Home/away (CFP games are neutral site)
        homeTeamTid: null,
        // Winner
        winnerTid,
        // CFP-specific metadata
        seed1: gameData.seed1,
        seed2: gameData.seed2,
        bowlName: gameData.bowlName,
        // Legacy flags for backward compatibility during transition
        [legacyFlag]: true,
        createdAt: new Date().toISOString()
      }

      // Check if this game already exists (user's game preserved above)
      const existingIndex = filteredGames.findIndex(g => g.id === gameId)
      if (existingIndex >= 0) {
        // Update existing game
        filteredGames[existingIndex] = { ...filteredGames[existingIndex], ...unifiedGame }
      } else {
        newGames.push(unifiedGame)
      }
    }

    const updatedGames = [...filteredGames, ...newGames]

    await updateDynasty(dynastyId, { games: updatedGames })

    return newGames
  }

  // Add or update CPU conference championship games as proper game entries in the games[] array
  // This ensures ALL games (user and CPU) are stored uniformly
  const saveCPUConferenceChampionships = async (dynastyId, championships, year) => {
    console.log('[saveCPUCC] Called with:', { dynastyId, championships, year })
    const isDev = import.meta.env.VITE_DEV_MODE === 'true'
    let dynasty

    if (isDev || !user) {
      const currentData = localStorage.getItem('cfb-dynasties')
      const currentDynasties = currentData ? JSON.parse(currentData) : dynasties
      dynasty = currentDynasties.find(d => String(d.id) === String(dynastyId))
    } else {
      dynasty = String(currentDynasty?.id) === String(dynastyId)
        ? currentDynasty
        : dynasties.find(d => String(d.id) === String(dynastyId))
    }

    if (!dynasty) {
      console.error('[saveCPUCC] Dynasty not found:', dynastyId)
      return
    }

    console.log('[saveCPUCC] Found dynasty:', dynasty.teamName)
    const existingGames = dynasty.games || []
    console.log('[saveCPUCC] Existing games count:', existingGames.length)
    console.log('[saveCPUCC] Existing CC games:', existingGames.filter(g => g.isConferenceChampionship))

    // Get user's team tid for this year
    const userTidForYear = dynasty.coachTeamByYear?.[year]?.tid || getCurrentTeamTid(dynasty)

    // Find the user's CC game for this year (if any)
    // Check both unified format (team1Tid/team2Tid) and legacy format (userTeam)
    const userCCGame = existingGames.find(g => {
      if (!g.isConferenceChampionship || Number(g.year) !== Number(year)) return false
      // Unified format: check if user's tid matches
      if (g.team1Tid === userTidForYear || g.team2Tid === userTidForYear) return true
      // Legacy format: check userTeam field
      if (g.userTeam && getTidFromAbbr(g.userTeam) === userTidForYear) return true
      return false
    })
    console.log('[saveCPUCC] User CC game found:', userCCGame)

    // Check if the incoming championships data includes the user's conference
    // If not, we need to preserve the user's manually entered CC game
    const userConference = dynasty.conference
    const championshipsIncludesUserConf = championships.some(cc =>
      cc.conference?.toLowerCase() === userConference?.toLowerCase()
    )
    console.log('[saveCPUCC] User conference:', userConference)
    console.log('[saveCPUCC] Championships includes user conf:', championshipsIncludesUserConf)
    const shouldPreserveUserCCGame = userCCGame && !championshipsIncludesUserConf

    // Filter out existing conference championship games for this year to avoid duplicates
    // EXCEPT preserve user's CC game if it's not in the incoming data
    const filteredGames = existingGames.filter(g => {
      // Keep games from different years
      if (Number(g.year) !== Number(year)) return true
      // Keep non-CC games
      if (!g.isConferenceChampionship) return true
      // Preserve user's CC game if their conference was excluded from sheet
      if (shouldPreserveUserCCGame) {
        // Check if this is user's game (unified or legacy format)
        const isUserGame = (g.team1Tid === userTidForYear || g.team2Tid === userTidForYear) ||
                          (g.userTeam && getTidFromAbbr(g.userTeam) === userTidForYear)
        if (isUserGame) {
          console.log('[saveCPUCC] Preserving user CC game')
          return true
        }
      }
      // Remove other CC games from same year (will be replaced with fresh data)
      return false
    })
    console.log('[saveCPUCC] After filtering out CC games for year:', filteredGames.length)

    // Create game entries for each conference championship game
    // UNIFIED FORMAT: Use tid-based fields, no legacy userTeam/opponent/teamScore/opponentScore/result
    const newGames = championships
      .filter(cc => {
        // Only process games with valid data
        if (!cc.team1 || !cc.team2) return false
        if (cc.team1Score === null || cc.team1Score === undefined) return false
        if (cc.team2Score === null || cc.team2Score === undefined) return false
        return true
      })
      .map(cc => {
        // Resolve team tids (accept both tid and abbr inputs)
        const team1Tid = cc.team1Tid || getTidFromAbbr(cc.team1)
        const team2Tid = cc.team2Tid || getTidFromAbbr(cc.team2)

        // Determine winner (tid-based)
        const team1Score = parseInt(cc.team1Score)
        const team2Score = parseInt(cc.team2Score)
        const winnerTid = team1Score > team2Score ? team1Tid : team2Tid

        return {
          id: `cc-${year}-${cc.conference?.replace(/\s+/g, '-').toLowerCase() || Date.now()}`,
          isConferenceChampionship: true,
          conference: cc.conference,
          year: Number(year),
          week: 'CCG',
          gameType: GAME_TYPES.CONFERENCE_CHAMPIONSHIP,
          // Team identification (tid only) - UNIFIED FORMAT
          team1Tid,
          team2Tid,
          // Scores
          team1Score,
          team2Score,
          // Home/away (CC games are neutral site)
          homeTeamTid: null,
          // Winner (tid-based)
          winnerTid,
          // Preserve any notes/links if they exist
          gameNote: cc.gameNote || '',
          links: cc.links || '',
          createdAt: new Date().toISOString()
        }
      })

    const updatedGames = [...filteredGames, ...newGames]
    console.log('[saveCPUCC] newGames created:', newGames.length, newGames)
    console.log('[saveCPUCC] updatedGames total:', updatedGames.length)

    // Deduplicate CC games by year + conference
    // Prefer the one that involves user's team (check using tid-based or legacy userTeam)
    const deduplicatedGames = []
    const ccGameKeys = new Set()
    for (const game of updatedGames) {
      if (game.isConferenceChampionship) {
        const key = `cc-${game.year}-${game.conference?.toLowerCase()}`
        if (ccGameKeys.has(key)) {
          // Skip duplicate - but if this one is user's game and previous wasn't, swap
          const existingIdx = deduplicatedGames.findIndex(g =>
            g.isConferenceChampionship &&
            g.year === game.year &&
            g.conference?.toLowerCase() === game.conference?.toLowerCase()
          )
          if (existingIdx >= 0) {
            // Check if this game involves user's team (unified or legacy format)
            const thisIsUserGame = (game.team1Tid === userTidForYear || game.team2Tid === userTidForYear) ||
                                  (game.userTeam && getTidFromAbbr(game.userTeam) === userTidForYear)
            const existingIsUserGame = (deduplicatedGames[existingIdx].team1Tid === userTidForYear ||
                                       deduplicatedGames[existingIdx].team2Tid === userTidForYear) ||
                                      (deduplicatedGames[existingIdx].userTeam &&
                                       getTidFromAbbr(deduplicatedGames[existingIdx].userTeam) === userTidForYear)

            if (thisIsUserGame && !existingIsUserGame) {
              console.log('[saveCPUCC] Replacing CPU CC game with user CC game for:', key)
              deduplicatedGames[existingIdx] = game
            } else {
              console.log('[saveCPUCC] Skipping duplicate CC game:', key)
            }
          }
          continue
        }
        ccGameKeys.add(key)
      }
      deduplicatedGames.push(game)
    }
    console.log('[saveCPUCC] After deduplication:', deduplicatedGames.length)
    console.log('[saveCPUCC] Calling updateDynasty...')

    await updateDynasty(dynastyId, { games: deduplicatedGames })
    console.log('[saveCPUCC] updateDynasty complete')

    return newGames
  }

  const advanceWeek = async (dynastyId, classConfirmations = {}) => {
    const dynasty = dynasties.find(d => d.id === dynastyId)
    if (!dynasty) return

    let nextWeek = dynasty.currentWeek + 1
    let nextPhase = dynasty.currentPhase
    let nextYear = dynasty.currentYear
    let additionalUpdates = {}

    // Phase transitions
    if (dynasty.currentPhase === 'preseason' && nextWeek >= 1) {
      nextPhase = 'regular_season'
      nextWeek = 1

      // COACH HISTORY: Record which team the coach is coaching this year
      // This is locked in at season start and does NOT change even if user switches teams later
      const coachTeamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName
      const coachTeamTid = getCurrentTeamTid(dynasty)
      const existingCoachTeamByYear = dynasty.coachTeamByYear || {}
      additionalUpdates.coachTeamByYear = {
        ...existingCoachTeamByYear,
        [dynasty.currentYear]: {
          tid: coachTeamTid,  // tid is the single source of truth
          team: coachTeamAbbr,  // Keep for backward compatibility
          teamName: dynasty.teamName,
          position: dynasty.coachPosition || 'HC',
          conference: dynasty.conference
        }
      }

      // Delete Google Sheet when advancing from preseason
      if (dynasty.googleSheetId) {
        try {
          await deleteGoogleSheet(dynasty.googleSheetId)
          additionalUpdates.googleSheetId = null
          additionalUpdates.googleSheetUrl = null
        } catch (error) {
          console.error('Failed to delete Google Sheet:', error)
          // Continue anyway - don't block advancing
          additionalUpdates.googleSheetId = null
          additionalUpdates.googleSheetUrl = null
        }
      }
      // Clear other preseason sheet IDs
      additionalUpdates.scheduleSheetId = null
      additionalUpdates.rosterSheetId = null
      additionalUpdates.rosterEditSheetId = null
    } else if (dynasty.currentPhase === 'regular_season' && nextWeek > 12) {
      // After week 12, move to conference championship week
      nextPhase = 'conference_championship'
      nextWeek = 1

      // LOCK IN COACHING STAFF: Save the full coaching staff at end of regular season
      // This preserves them for historical display even if they're fired in CC week
      // Also includes the user's position so their name shows in historical views
      const currentTeamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName
      const currentStaff = dynasty.coachingStaff || getCurrentCoachingStaff(dynasty)

      // Build complete staff including user's position
      const completeStaff = { ...currentStaff }
      if (dynasty.coachName && dynasty.coachPosition) {
        if (dynasty.coachPosition === 'HC') {
          completeStaff.hcName = dynasty.coachName
        } else if (dynasty.coachPosition === 'OC') {
          completeStaff.ocName = dynasty.coachName
        } else if (dynasty.coachPosition === 'DC') {
          completeStaff.dcName = dynasty.coachName
        }
      }

      if (completeStaff.hcName || completeStaff.ocName || completeStaff.dcName) {
        const existingLockedStaff = dynasty.lockedCoachingStaffByYear || {}
        const teamLockedStaff = existingLockedStaff[currentTeamAbbr] || {}
        additionalUpdates.lockedCoachingStaffByYear = {
          ...existingLockedStaff,
          [currentTeamAbbr]: {
            ...teamLockedStaff,
            [dynasty.currentYear]: { ...completeStaff }
          }
        }
      }
    } else if (dynasty.currentPhase === 'conference_championship' && nextWeek > 1) {
      // After conference championship, move to postseason (playoffs)
      nextPhase = 'postseason'
      nextWeek = 1

      // Execute pending coordinator firing if any
      const pendingFiring = dynasty.conferenceChampionshipData?.pendingFiring
      if (pendingFiring && pendingFiring !== 'none') {
        const firedOCName = (pendingFiring === 'oc' || pendingFiring === 'both') ? dynasty.coachingStaff?.ocName : null
        const firedDCName = (pendingFiring === 'dc' || pendingFiring === 'both') ? dynasty.coachingStaff?.dcName : null

        let updatedStaff = { ...dynasty.coachingStaff }
        if (pendingFiring === 'oc' || pendingFiring === 'both') {
          updatedStaff.ocName = null
        }
        if (pendingFiring === 'dc' || pendingFiring === 'both') {
          updatedStaff.dcName = null
        }

        additionalUpdates.coachingStaff = updatedStaff
        additionalUpdates.conferenceChampionshipData = {
          ...dynasty.conferenceChampionshipData,
          firingCoordinators: true,
          coordinatorToFire: pendingFiring,
          firedOCName,
          firedDCName
        }
        // Reset coachingStaffEntered so user must re-enter in next preseason
        additionalUpdates['preseasonSetup.coachingStaffEntered'] = false
      }
    } else if (dynasty.currentPhase === 'postseason' && nextWeek > 5) {
      // After Week 5 (End of Season Recap), move to offseason
      nextPhase = 'offseason'
      nextWeek = 1

      // Apply new job if user accepted one during postseason
      const newJobData = dynasty.newJobData
      if (newJobData?.takingNewJob && newJobData.team && newJobData.position) {
        // Get the full team name from abbreviation
        const newTeamName = getTeamName(newJobData.team)
        const newConference = getTeamConference(newJobData.team)

        // REVERT SUPPORT: Save previous job data so we can restore on revert
        additionalUpdates.previousJobData = {
          teamName: dynasty.teamName,
          coachPosition: dynasty.coachPosition || 'HC',
          conference: dynasty.conference,
          schedule: dynasty.schedule,
          teamRatings: dynasty.teamRatings,
          coachingStaff: dynasty.coachingStaff,
          googleSheetId: dynasty.googleSheetId,
          googleSheetUrl: dynasty.googleSheetUrl,
          preseasonSetup: dynasty.preseasonSetup,
          newJobData: newJobData // Save the accepted job offer to restore on revert
        }

        // Calculate record at current team for this stint
        const currentTeamGames = (dynasty.games || []).filter(g =>
          g.userTeam === dynasty.teamName ||
          g.userTeam === getCurrentTeamAbbr(dynasty) ||
          (!g.userTeam && !g.team1 && !g.team2) // Legacy games without userTeam (not CPU games which have team1/team2)
        )
        const currentStintGames = currentTeamGames.filter(g => {
          // Get the start year of the current stint
          const existingHistory = dynasty.coachingHistory || []
          const stintStartYear = existingHistory.length > 0
            ? existingHistory[existingHistory.length - 1].endYear + 1
            : dynasty.startYear
          return Number(g.year) >= stintStartYear
        })
        const stintWins = currentStintGames.filter(g => g.result === 'win').length
        const stintLosses = currentStintGames.filter(g => g.result === 'loss').length

        // Determine start year of current stint
        const existingHistory = dynasty.coachingHistory || []
        const stintStartYear = existingHistory.length > 0
          ? existingHistory[existingHistory.length - 1].endYear + 1
          : dynasty.startYear

        // Add current team to coaching history
        const updatedCoachingHistory = [
          ...existingHistory,
          {
            teamName: dynasty.teamName,
            conference: dynasty.conference,
            position: dynasty.coachPosition || 'HC',
            startYear: stintStartYear,
            endYear: dynasty.currentYear,
            wins: stintWins,
            losses: stintLosses
          }
        ]
        additionalUpdates.coachingHistory = updatedCoachingHistory

        // Update to new team
        additionalUpdates.teamName = newTeamName
        additionalUpdates.coachPosition = newJobData.position
        additionalUpdates.conference = newConference || ''

        // TEAM-CENTRIC FIX: Tag all legacy players (without team field) with their current team
        // before switching. This ensures they stay associated with their original team.
        const currentTeamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName
        const existingPlayers = dynasty.players || []
        const taggedPlayers = existingPlayers.map(p => {
          // If player already has team field, keep it
          if (p.team) return p
          // If honor-only player, don't tag with team (they're tracked separately)
          if (p.isHonorOnly) return p
          // Tag legacy roster player with their current team
          return { ...p, team: currentTeamAbbr }
        })
        additionalUpdates.players = taggedPlayers

        // TEAM-CENTRIC FIX: Tag all legacy games (without userTeam field) with their team
        // before switching. This ensures games stay with the team that played them.
        const existingGames = dynasty.games || []
        const taggedGames = existingGames.map(g => {
          // If game already has userTeam field, keep it
          if (g.userTeam) return g
          // CPU games don't need userTeam - they're identified by having team1/team2 but no userTeam
          if (g.team1 && g.team2) return g
          // Tag legacy user game with the current team
          return { ...g, userTeam: currentTeamAbbr }
        })
        additionalUpdates.games = taggedGames

        // TEAM-CENTRIC FIX: Store current schedule in team-centric structure before clearing
        const currentSchedule = dynasty.schedule || []
        const currentTeamTid = getTidFromAbbr(currentTeamAbbr)

        // Initialize byYear structure for the current team
        if (currentTeamTid) {
          const existingTeams = dynasty.teams || {}
          const existingTeamData = existingTeams[currentTeamTid] || {}
          const existingByYear = existingTeamData.byYear || {}
          const existingYearData = existingByYear[dynasty.currentYear] || {}

          // Build byYear updates for schedule, teamRatings, and coachingStaff
          const byYearUpdates = { ...existingYearData }

          if (currentSchedule.length > 0) {
            byYearUpdates.schedule = currentSchedule
          }

          const currentRatingsForByYear = dynasty.teamRatings
          if (currentRatingsForByYear && (currentRatingsForByYear.overall || currentRatingsForByYear.offense || currentRatingsForByYear.defense)) {
            byYearUpdates.teamRatings = currentRatingsForByYear
          }

          const currentStaffForByYear = dynasty.coachingStaff
          if (currentStaffForByYear && (currentStaffForByYear.hcName || currentStaffForByYear.ocName || currentStaffForByYear.dcName)) {
            byYearUpdates.coachingStaff = currentStaffForByYear
          }

          additionalUpdates.teams = {
            ...existingTeams,
            [currentTeamTid]: {
              ...existingTeamData,
              byYear: {
                ...existingByYear,
                [dynasty.currentYear]: byYearUpdates
              }
            }
          }
        }

        if (currentSchedule.length > 0) {
          const existingSchedulesByTeamYear = dynasty.schedulesByTeamYear || {}
          const teamSchedules = existingSchedulesByTeamYear[currentTeamAbbr] || {}
          additionalUpdates.schedulesByTeamYear = {
            ...existingSchedulesByTeamYear,
            [currentTeamAbbr]: {
              ...teamSchedules,
              [dynasty.currentYear]: currentSchedule
            }
          }
        }

        // TEAM-CENTRIC FIX: Store current teamRatings in team-centric structure before clearing
        const currentRatings = dynasty.teamRatings
        if (currentRatings && (currentRatings.overall || currentRatings.offense || currentRatings.defense)) {
          const existingTeamRatingsByTeamYear = dynasty.teamRatingsByTeamYear || {}
          const teamRatingsForTeam = existingTeamRatingsByTeamYear[currentTeamAbbr] || {}
          additionalUpdates.teamRatingsByTeamYear = {
            ...existingTeamRatingsByTeamYear,
            [currentTeamAbbr]: {
              ...teamRatingsForTeam,
              [dynasty.currentYear]: currentRatings
            }
          }
        }

        // TEAM-CENTRIC FIX: Store current coachingStaff in team-centric structure before clearing
        const currentStaff = dynasty.coachingStaff
        if (currentStaff && (currentStaff.hcName || currentStaff.ocName || currentStaff.dcName)) {
          const existingCoachingStaffByTeamYear = dynasty.coachingStaffByTeamYear || {}
          const coachingStaffForTeam = existingCoachingStaffByTeamYear[currentTeamAbbr] || {}
          additionalUpdates.coachingStaffByTeamYear = {
            ...existingCoachingStaffByTeamYear,
            [currentTeamAbbr]: {
              ...coachingStaffForTeam,
              [dynasty.currentYear]: currentStaff
            }
          }
        }

        // TEAM-CENTRIC FIX: Store current Google Sheet in team-centric structure before clearing
        if (dynasty.googleSheetId) {
          const existingGoogleSheetsByTeam = dynasty.googleSheetsByTeam || {}
          additionalUpdates.googleSheetsByTeam = {
            ...existingGoogleSheetsByTeam,
            [currentTeamAbbr]: {
              googleSheetId: dynasty.googleSheetId,
              googleSheetUrl: dynasty.googleSheetUrl
            }
          }
        }

        // Clear legacy structures for backwards compatibility
        additionalUpdates.schedule = []
        additionalUpdates.teamRatings = null
        additionalUpdates.coachingStaff = null
        additionalUpdates.googleSheetId = null
        additionalUpdates.googleSheetUrl = null
        additionalUpdates.playersLeavingSheetId = null

        // Reset preseason setup flags for the new team (legacy structure)
        additionalUpdates.preseasonSetup = {
          scheduleEntered: false,
          rosterEntered: false,
          teamRatingsEntered: false,
          coachingStaffEntered: false
        }

        // Clear newJobData
        additionalUpdates.newJobData = null
      }
    } else if (dynasty.currentPhase === 'offseason' && dynasty.currentWeek === 1 && nextWeek === 2) {
      // Advancing FROM offseason week 1 TO week 2
      // Clear previousJobData - user has committed to the new team
      if (dynasty.previousJobData) {
        additionalUpdates.previousJobData = null
      }
    } else if (dynasty.currentPhase === 'offseason' && dynasty.currentWeek === 5 && nextWeek === 6) {
      // YEAR FLIP - Happens when entering Signing Day (week 6)
      // The year changes here so that team pages for the new year become available
      // CRITICAL: Use Number() to ensure proper arithmetic (currentYear could be string from Firestore)
      nextYear = Number(dynasty.currentYear) + 1

      // CLASS PROGRESSION - Also happens at year flip
      // Progress all players' classes based on games played in the previous season
      const previousSeasonYear = Number(dynasty.currentYear) // The year that just ended
      const teamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName
      const teamTid = getTidFromAbbr(teamAbbr)
      // For tid-based storage: use tid for fully migrated dynasties
      const useFullTidSystem = dynasty._tidFullyMigrated === true
      const teamsByYearValue = useFullTidSystem && teamTid ? teamTid : teamAbbr

      const players = dynasty.players || []

      // Get helper to check data by year (for legacy structures)
      const getByYearHelper = (obj, year) => obj?.[year] ?? obj?.[String(year)] ?? obj?.[Number(year)]

      // Get players leaving data to skip them during class progression (team-aware with fallback)
      const playersLeavingThisYear = getPlayersLeaving(dynasty, teamAbbr, previousSeasonYear)
      const leavingPids = new Set(playersLeavingThisYear.map(p => p.pid).filter(Boolean))

      // Helper to check if a teamsByYear value matches the current team (supports both tid and abbr)
      const isTeamMatch = (value) => {
        if (!value) return false
        if (typeof value === 'number') return value === teamTid
        return value === teamAbbr
      }

      // Progress each player's class
      const progressedPlayers = players.map(player => {
        // Skip honor-only players
        if (player.isHonorOnly) return player

        // Skip players from other teams (use teamsByYear as primary check)
        const playerTeamThisSeason = player.teamsByYear?.[previousSeasonYear] ?? player.teamsByYear?.[String(previousSeasonYear)]
        if (playerTeamThisSeason && !isTeamMatch(playerTeamThisSeason)) return player
        if (!playerTeamThisSeason && player.team && player.team !== teamAbbr) return player

        // Check if player has any FUTURE year on this team (indicates they should still be on the team)
        const hasFutureYearOnTeam = Object.entries(player.teamsByYear || {}).some(([yearKey, teamValue]) => {
          const year = Number(yearKey)
          return isTeamMatch(teamValue) && year > previousSeasonYear
        })

        // CRITICAL: Skip players who weren't on the team this season (they already left in a prior year)
        // This prevents departed players from being re-added to the roster
        // Exception: if they have a future year on this team, they should be processed (data was incomplete)
        if (!playerTeamThisSeason && !player.isRecruit && !hasFutureYearOnTeam) return player

        // Skip recruits (they get converted when advanceToNewSeason runs)
        if (player.isRecruit) return player

        // Skip players who are leaving (from Players Leaving task)
        if (leavingPids.has(player.pid)) return player

        // Skip players who already have next year's team set (processed by Transfer Destinations)
        if (player.teamsByYear?.[nextYear]) return player

        // Get games played from player.statsByYear
        const yearStats = player.statsByYear?.[previousSeasonYear] || player.statsByYear?.[String(previousSeasonYear)]
        let gamesPlayed = yearStats?.gamesPlayed

        // Use confirmation if provided (for null gamesPlayed cases)
        if ((gamesPlayed === null || gamesPlayed === undefined) && classConfirmations[player.pid] !== undefined) {
          gamesPlayed = classConfirmations[player.pid] ? 5 : 0 // Treat as 5+ or 0
        }

        // Use classByYear as source of truth for player's class in the previous season
        const currentClass = player.classByYear?.[previousSeasonYear] || player.classByYear?.[String(previousSeasonYear)] || player.year
        const isAlreadyRS = currentClass?.startsWith('RS ')
        let newYear = currentClass

        // Apply class progression based on games played
        if (gamesPlayed !== null && gamesPlayed !== undefined) {
          if (gamesPlayed <= 4 && !isAlreadyRS) {
            // Redshirt: add RS prefix (played 4 or fewer games)
            newYear = 'RS ' + currentClass
          } else {
            // Normal progression
            newYear = CLASS_PROGRESSION[currentClass] || currentClass
          }
        } else {
          // No games data - default to normal progression
          newYear = CLASS_PROGRESSION[currentClass] || currentClass
        }

        // Update player with new class and ensure teamsByYear is set for the new season
        // CRITICAL: Set teamsByYear[nextYear] = tid/abbr so roster filtering works immediately
        return {
          ...player,
          year: newYear,
          classByYear: {
            ...(player.classByYear || {}),
            [nextYear]: newYear
          },
          teamsByYear: {
            ...(player.teamsByYear || {}),
            [nextYear]: teamsByYearValue
          }
        }
      })

      additionalUpdates.players = progressedPlayers
      // Mark that class progression has been done for this year
      additionalUpdates.classProgressionDoneForYear = nextYear
    } else if (dynasty.currentPhase === 'offseason' && dynasty.currentWeek === 6 && nextWeek === 7) {
      // Week 6→7 transition (after Signing Day tasks complete)
      // With the new system, departures and transfers are handled directly in:
      // - handlePlayersLeavingSave (adds movements, doesn't add next year to teamsByYear)
      // - handleTransferDestinationsSave (updates teamsByYear, adds movements)
      // NOTE: Recruits stay as isRecruit=true until Week 7→8 so users can enter Recruit Overalls
      const previousSeasonYear = dynasty.currentYear - 1 // Year that just ended
      const players = dynasty.players || []

      // Get draft results for draft round info
      const getByYear = (obj, year) => obj?.[year] ?? obj?.[String(year)] ?? obj?.[Number(year)]
      const draftResults = getByYear(dynasty.draftResultsByYear, previousSeasonYear) || []
      const draftByPid = {}
      draftResults.forEach(d => {
        if (d.pid) draftByPid[d.pid] = d
      })

      // Process all players: add draft info only (recruit conversion moved to Week 7→8)
      const updatedPlayers = players.map(player => {
        let updated = { ...player }
        let modified = false

        // Add draft info if available
        const draftInfo = draftByPid[player.pid]
        if (draftInfo && (!player.draftRound || !player.draftPick)) {
          updated.draftRound = draftInfo.draftRound || player.draftRound
          updated.draftPick = draftInfo.draftPick || player.draftPick
          modified = true
        }

        return modified ? updated : player
      })

      // Only update if there were changes
      if (updatedPlayers.some((p, i) => p !== players[i])) {
        additionalUpdates.players = updatedPlayers
      }
    } else if (dynasty.currentPhase === 'offseason' && dynasty.currentWeek === 7 && nextWeek === 8) {
      // Week 7→8 transition (after Training Camp tasks complete)
      // NOW convert recruits to active players (after user had chance to enter Recruit Overalls)
      const previousSeasonYear = dynasty.currentYear - 1 // Year that just ended (recruitYear)
      const currentSeasonYear = dynasty.currentYear // The new season (already flipped)
      const teamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName
      const teamTid = getTidFromAbbr(teamAbbr)
      // For tid-based storage: use tid for fully migrated dynasties
      const useFullTidSystem = dynasty._tidFullyMigrated === true
      const teamsByYearValue = useFullTidSystem && teamTid ? teamTid : teamAbbr
      const players = dynasty.players || []

      // Convert recruits from this class to active players
      const updatedPlayers = players.map(player => {
        if (player.isRecruit && Number(player.recruitYear) === previousSeasonYear) {
          let updated = { ...player, isRecruit: false }

          // Ensure teamsByYear has the current year (in case it's missing)
          const hasCurrentYear = player.teamsByYear?.[currentSeasonYear] || player.teamsByYear?.[String(currentSeasonYear)]
          if (!hasCurrentYear) {
            // For tid-based system: use tid. Otherwise use player.team or fallback to abbr.
            const playerTeamValue = useFullTidSystem
              ? (getTidFromAbbr(player.team) || teamsByYearValue)
              : (player.team || teamAbbr)
            updated.teamsByYear = {
              ...(player.teamsByYear || {}),
              [currentSeasonYear]: playerTeamValue
            }
          }

          // Ensure classByYear has the current year
          const hasClassForCurrentYear = player.classByYear?.[currentSeasonYear] || player.classByYear?.[String(currentSeasonYear)]
          if (!hasClassForCurrentYear && player.year) {
            updated.classByYear = {
              ...(player.classByYear || {}),
              [currentSeasonYear]: player.year
            }
          }

          return updated
        }
        return player
      })

      // Only update if there were changes
      if (updatedPlayers.some((p, i) => p !== players[i])) {
        additionalUpdates.players = updatedPlayers
      }
    } else if (dynasty.currentPhase === 'offseason' && nextWeek > 8) {
      // SEASON ADVANCEMENT to preseason - year already flipped when entering Signing Day
      // Just transition to preseason phase, no year change needed
      // Note: Week 8 is "Offseason" phase with Custom Conferences & Encourage Transfers

      nextPhase = 'preseason'
      nextWeek = 0
      // nextYear stays the same (already set when entering week 6)

      // Clear CC firing data for the new season
      additionalUpdates.conferenceChampionshipData = null

      // Clear temporary sheet IDs from offseason
      // Year already flipped at Signing Day, so previous season = currentYear - 1
      const previousSeasonYearForCleanup = dynasty.currentYear - 1
      additionalUpdates.trainingResultsSheetId = null
      additionalUpdates.playersLeavingSheetId = null
      additionalUpdates.encourageTransfersSheetId = null
      additionalUpdates.recruitOverallsSheetId = null
      additionalUpdates.conferencesSheetId = null
      additionalUpdates[`portalTransferClassSheetId_${previousSeasonYearForCleanup}`] = null
      additionalUpdates.fringeCaseClassSheetId = null
      additionalUpdates.transferDestinationsSheetId = null
      additionalUpdates.draftResultsSheetId = null
    }

    await updateDynasty(dynastyId, {
      currentWeek: nextWeek,
      currentPhase: nextPhase,
      currentYear: nextYear,
      ...additionalUpdates
    })
  }

  /**
   * Advance to new season with full player processing
   * This handles: marking players as left, recruit conversion,
   * custom conferences, and detecting first year on team.
   *
   * NOTE: Class progression happens at Signing Day (offseason week 6), NOT here.
   * This function only updates teamsByYear and classByYear tracking for the new season.
   *
   * @param {string} dynastyId - The dynasty ID
   */
  const advanceToNewSeason = async (dynastyId) => {
    const dynasty = dynasties.find(d => d.id === dynastyId)
    if (!dynasty) return

    // IMPORTANT: Year flip happened when entering Signing Day (week 6).
    // At this point, dynasty.currentYear is already the NEW season year (e.g., 2027).
    // All offseason data (playersLeaving, playerStats, recruits, etc.) is stored under the PREVIOUS year (2026).
    const previousSeasonYear = Number(dynasty.currentYear) - 1  // The season that just ended (e.g., 2026)
    const currentSeasonYear = Number(dynasty.currentYear)       // The upcoming season (e.g., 2027)
    const teamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName
    const players = [...(dynasty.players || [])]

    // Helper to get data by year (handles both string and numeric keys)
    const getByYear = (obj, year) => obj?.[year] ?? obj?.[String(year)] ?? obj?.[Number(year)]

    // Get players leaving data (stored under previous season year) - team-aware with fallback
    const playersLeavingThisYear = getPlayersLeaving(dynasty, teamAbbr, previousSeasonYear)
    const leavingPids = new Set(playersLeavingThisYear.map(p => p.pid).filter(Boolean))

    // Get encouraged transfers data (stored under current season year - after year flip)
    const encouragedTransfersForTeam = dynasty.encourageTransfersByTeamYear?.[teamAbbr]
    const encouragedTransfers = getByYear(encouragedTransfersForTeam, currentSeasonYear) || []
    const encouragedNames = new Set(encouragedTransfers.map(t => t.name?.toLowerCase().trim()))

    // Get draft results for draft round info (stored under previous season year) - team-aware with fallback
    const draftResults = getDraftResults(dynasty, teamAbbr, previousSeasonYear)
    const draftByPid = {}
    draftResults.forEach(d => {
      if (d.pid) draftByPid[d.pid] = d
    })

    // Process each player
    const updatedPlayers = players.map(player => {
      // Skip honor-only players
      if (player.isHonorOnly) return player

      // Skip players from other teams (use teamsByYear for previous season as primary check)
      const playerTeamPrevSeason = player.teamsByYear?.[previousSeasonYear] ?? player.teamsByYear?.[String(previousSeasonYear)]
      if (playerTeamPrevSeason && playerTeamPrevSeason !== teamAbbr) return player
      if (!playerTeamPrevSeason && player.team && player.team !== teamAbbr) return player

      // Check if player has any FUTURE year on this team (indicates they should still be on the team)
      const hasFutureYearOnTeam = Object.entries(player.teamsByYear || {}).some(([yearKey, team]) => {
        const year = Number(yearKey)
        return team === teamAbbr && year > previousSeasonYear
      })

      // CRITICAL: Skip players who weren't on the team last season (they already left in a prior year)
      // This prevents departed players from being re-added to the roster
      // Exception: recruits are handled separately below
      // Exception: if they have a future year on this team, they should be processed (data was incomplete)
      if (!playerTeamPrevSeason && !player.isRecruit && !hasFutureYearOnTeam) return player

      // Check if player is an encouraged transfer FIRST (before any early returns)
      // They don't get teamsByYear[newYear] - their career with this team ends
      // CRITICAL: Must REMOVE teamsByYear[currentSeasonYear] if it was set by saveRoster earlier
      // The encourageTransfersByTeamYear data is the source of truth for Career Timeline display
      const playerNameLower = player.name?.toLowerCase().trim()
      if (!player.isRecruit && encouragedNames.has(playerNameLower)) {
        // Remove current season year from teamsByYear (may have been set by earlier roster operations)
        const updatedTeamsByYear = { ...(player.teamsByYear || {}) }
        delete updatedTeamsByYear[currentSeasonYear]
        delete updatedTeamsByYear[String(currentSeasonYear)]
        return {
          ...player,
          teamsByYear: updatedTeamsByYear
        }
      }

      // Skip players who already have a team for the current season (already processed or transferred)
      const existingTeamForCurrentSeason = player.teamsByYear?.[currentSeasonYear] ?? player.teamsByYear?.[String(currentSeasonYear)]
      if (existingTeamForCurrentSeason) {
        // Player already has a team for next season (set by Transfer Destinations or recommit)
        // Clear isRecruit if applicable (handles recommit players who have teamsByYear set but still have isRecruit: true)
        return {
          ...player,
          team: existingTeamForCurrentSeason,
          isRecruit: false  // Always clear - if they have a team for this season, they're not a recruit
        }
      }

      // Check if player is leaving (from Players Leaving sheet)
      if (leavingPids.has(player.pid)) {
        const draftInfo = draftByPid[player.pid]

        // Player is departing - do NOT add current season year to teamsByYear
        // movements[] was already added in handlePlayersLeavingSave/handleTransferDestinationsSave
        // Just add draft info if applicable
        return {
          ...player,
          draftRound: draftInfo?.draftRound || player.draftRound || null,
          draftPick: draftInfo?.draftPick || player.draftPick || null
        }
      }

      // Check for RS Sr players not in playersLeaving - auto-graduate them
      // IMPORTANT: Only auto-graduate if they were ALREADY RS Sr in the previous season
      // (before Signing Day class progression). Players who just became RS Sr should play next season.
      const previousSeasonClass = player.classByYear?.[previousSeasonYear]
      if (previousSeasonClass === 'RS Sr' && !player.isRecruit) {
        // Player is leaving - add movement if not already present
        const hasGradMovement = (player.movements || []).some(m =>
          m.type === 'departure' && m.year === previousSeasonYear && m.reason === 'Graduating'
        )
        const updatedMovements = hasGradMovement ? player.movements : [
          ...(player.movements || []),
          { year: previousSeasonYear, type: 'departure', from: teamAbbr, reason: 'Graduating' }
        ]
        return {
          ...player,
          movements: updatedMovements
        }
      }

      // Convert recruits to active players (recruits have recruitYear from the previous season's recruiting cycle)
      // Use Number() to handle string/number type mismatch
      if (player.isRecruit && Number(player.recruitYear) === previousSeasonYear) {
        let newYear

        // Check if this is a portal transfer with a manually assigned class (team-aware with fallback)
        if (player.isPortal) {
          const portalClassSelectionsObj = getPortalTransferClass(dynasty, teamAbbr, previousSeasonYear)
          const portalClassSelections = Array.isArray(portalClassSelectionsObj) ? portalClassSelectionsObj : []
          const classSelection = portalClassSelections.find(s =>
            s.playerName?.toLowerCase().trim() === player.name?.toLowerCase().trim()
          )
          if (classSelection?.selectedClass) {
            // Use the manually assigned class
            newYear = classSelection.selectedClass
          } else {
            // Portal transfer without manual selection: year is already set correctly
            // by classToYear mapping (Jr stays Jr, Sr stays Sr, etc.)
            newYear = player.year
          }
        } else {
          // HS/JUCO recruits: year is already set correctly by classToYear mapping
          // When recruited: HS recruits have year='Fr', JUCO Fr have year='So', etc.
          // No progression needed - just use the existing value
          newYear = player.year
        }

        return {
          ...player,
          isRecruit: false,
          year: newYear,
          // Track class for this season
          classByYear: {
            ...(player.classByYear || {}),
            [currentSeasonYear]: newYear
          },
          // CRITICAL: Set teamsByYear for the new season so roster filtering works
          teamsByYear: {
            ...(player.teamsByYear || {}),
            [currentSeasonYear]: teamAbbr
          }
        }
      }

      // Skip recruits from other years
      if (player.isRecruit) return player

      // Class progression already happened at Signing Day (offseason week 6)
      // Here we just need to add teamsByYear and classByYear tracking for the new season

      // CRITICAL: Add current season year to teamsByYear for players continuing on the team
      // This creates the immutable roster history record
      const updatedTeamsByYear = {
        ...(player.teamsByYear || {}),
        [currentSeasonYear]: teamAbbr
      }

      // Track class for this season (use existing player.year which was already updated at Signing Day)
      const updatedClassByYear = {
        ...(player.classByYear || {}),
        [currentSeasonYear]: player.year
      }

      return {
        ...player,
        teamsByYear: updatedTeamsByYear,
        classByYear: updatedClassByYear
      }
    })

    // Detect if first year on new team (for preseason roster entry)
    const previousYearTeam = dynasty.coachTeamByYear?.[previousSeasonYear]?.team
    const isFirstYearOnTeam = previousYearTeam !== teamAbbr

    // Get current coaching staff and apply any pending hires from offseason
    let currentCoachingStaff = { ...dynasty.coachingStaff } || { hcName: null, ocName: null, dcName: null }
    const pendingHires = dynasty.pendingCoordinatorHires
    if (pendingHires) {
      if (pendingHires.filledOC && pendingHires.newOCName) {
        currentCoachingStaff.ocName = pendingHires.newOCName
      }
      if (pendingHires.filledDC && pendingHires.newDCName) {
        currentCoachingStaff.dcName = pendingHires.newDCName
      }
    }

    // Initialize empty preseason setup for the new year
    // In subsequent years (not first year on team), we don't need roster entry
    // Schedule and team ratings always need to be re-entered each year
    // Coaching staff carries over from previous year (auto-filled)
    const existingPreseasonSetup = dynasty.preseasonSetupByTeamYear || {}
    const teamPreseasonSetup = existingPreseasonSetup[teamAbbr] || {}

    const newYearPreseasonSetup = {
      scheduleEntered: false,
      rosterEntered: !isFirstYearOnTeam, // Skip roster entry if continuing with same team
      teamRatingsEntered: false,
      coachingStaffEntered: !isFirstYearOnTeam, // Auto-filled if continuing with same team
      conferencesEntered: true // Conferences were set in offseason week 7
    }

    // Store coaching staff for new year (carries over from previous year)
    const existingCoachingStaffByTeamYear = dynasty.coachingStaffByTeamYear || {}
    const teamCoachingStaff = existingCoachingStaffByTeamYear[teamAbbr] || {}

    // Get tid for new byYear structure
    const teamTid = getTidFromAbbr(teamAbbr)

    // Prepare updates
    const updates = {
      players: updatedPlayers,
      isFirstYearOnCurrentTeam: isFirstYearOnTeam,
      // Update main coaching staff with any pending hires
      coachingStaff: currentCoachingStaff,
      // Clear pending hires since we've applied them
      pendingCoordinatorHires: null,
      // Store coaching staff for new year using team-centric pattern
      coachingStaffByTeamYear: {
        ...existingCoachingStaffByTeamYear,
        [teamAbbr]: {
          ...teamCoachingStaff,
          [currentSeasonYear]: currentCoachingStaff
        }
      },
      // Initialize preseason setup for new year using team-centric pattern
      preseasonSetupByTeamYear: {
        ...existingPreseasonSetup,
        [teamAbbr]: {
          ...teamPreseasonSetup,
          [currentSeasonYear]: newYearPreseasonSetup
        }
      }
    }

    // Also write to NEW tid-based byYear structure
    if (teamTid) {
      const existingTeams = dynasty.teams || {}
      const existingTeamData = existingTeams[teamTid] || {}
      const existingByYear = existingTeamData.byYear || {}
      const existingYearData = existingByYear[currentSeasonYear] || {}

      updates.teams = {
        ...existingTeams,
        [teamTid]: {
          ...existingTeamData,
          byYear: {
            ...existingByYear,
            [currentSeasonYear]: {
              ...existingYearData,
              coachingStaff: currentCoachingStaff,
              preseasonSetup: newYearPreseasonSetup
            }
          }
        }
      }
    }

    // Apply custom conferences for next year if set
    if (dynasty.customConferencesByYear?.[currentSeasonYear]) {
      updates.customConferences = dynasty.customConferencesByYear[currentSeasonYear]
    }

    await updateDynasty(dynastyId, updates)
  }

  const revertWeek = async (dynastyId) => {
    const dynasty = dynasties.find(d => d.id === dynastyId)
    if (!dynasty) return

    const { currentPhase, currentWeek, currentYear, startYear } = dynasty
    let prevWeek = currentWeek
    let prevPhase = currentPhase
    let prevYear = currentYear
    let additionalUpdates = {}

    // Phase structure:
    // - Preseason: Week 0
    // - Regular Season: Weeks 1-12
    // - Conference Championship: Week 1
    // - Postseason: Weeks 1-5
    // - Offseason: Weeks 1-8

    // Determine the previous phase/week based on current state
    if (currentPhase === 'preseason') {
      // Preseason Week 0 → Previous Year's Offseason Week 8
      if (currentYear <= startYear) {
        // Can't go back before the dynasty started
        // Cannot revert: at start of dynasty
        return
      }
      prevPhase = 'offseason'
      prevWeek = 8
      prevYear = currentYear - 1

      // CRITICAL: Restore recruits to isRecruit: true
      // At Week 7→8, recruits were converted. We need to undo that.
      // recruitYear will be prevYear (the year the recruiting happened)
      const players = dynasty.players || []
      const recruitingYear = prevYear
      const updatedPlayers = players.map(player => {
        // Restore isRecruit for players recruited this cycle
        if (player.recruitYear === recruitingYear || player.recruitYear === String(recruitingYear)) {
          return { ...player, isRecruit: true }
        }
        return player
      })
      if (updatedPlayers.some((p, i) => p !== players[i])) {
        additionalUpdates.players = updatedPlayers
      }
    } else if (currentPhase === 'regular_season') {
      if (currentWeek <= 1) {
        // Regular Season Week 1 → Preseason Week 0
        prevPhase = 'preseason'
        prevWeek = 0
      } else {
        // Regular Season Week N → Regular Season Week N-1
        prevWeek = currentWeek - 1
      }
    } else if (currentPhase === 'conference_championship') {
      // Conference Championship Week 1 → Regular Season Week 12
      prevPhase = 'regular_season'
      prevWeek = 12
    } else if (currentPhase === 'postseason') {
      if (currentWeek <= 1) {
        // Postseason Week 1 → Conference Championship Week 1
        prevPhase = 'conference_championship'
        prevWeek = 1
      } else {
        // Postseason Week N → Postseason Week N-1
        prevWeek = currentWeek - 1
      }
    } else if (currentPhase === 'offseason') {
      if (currentWeek <= 1) {
        // Offseason Week 1 → Postseason Week 5
        prevPhase = 'postseason'
        prevWeek = 5
      } else {
        // Offseason Week N → Offseason Week N-1
        prevWeek = currentWeek - 1
      }
    } else {
      console.error('Unknown phase:', currentPhase)
      return
    }

    // Remove game data from the week we're reverting from
    // NOTE: Stats are NOT auto-adjusted here - use "Sync Stats" in Player Editor for manual control
    let updatedGames = [...(dynasty.games || [])]
    const year = dynasty.currentYear

    if (dynasty.currentPhase === 'regular_season') {
      // Remove regular season game for current week
      updatedGames = updatedGames.filter(g =>
        !(g.week === dynasty.currentWeek && g.year === year && !g.isConferenceChampionship)
      )
    } else if (dynasty.currentPhase === 'conference_championship') {
      // Remove CC game from games array
      updatedGames = updatedGames.filter(g =>
        !(g.isConferenceChampionship && g.year === year)
      )

      // Restore fired coordinators if any were fired during this CC phase
      const ccData = dynasty.conferenceChampionshipData
      if (ccData && ccData.year === year) {
        // Restore coordinator names that were fired
        if (ccData.firedOCName || ccData.firedDCName) {
          const restoredStaff = { ...dynasty.coachingStaff }
          if (ccData.firedOCName) {
            restoredStaff.ocName = ccData.firedOCName
          }
          if (ccData.firedDCName) {
            restoredStaff.dcName = ccData.firedDCName
          }
          additionalUpdates.coachingStaff = restoredStaff
          // Restore the coachingStaffEntered flag since we're restoring the coordinators
          additionalUpdates['preseasonSetup.coachingStaffEntered'] = true
        }
      }

      // Clear all CC data
      additionalUpdates.conferenceChampionshipData = null
      // Clear CC sheet ID
      additionalUpdates.conferenceChampionshipSheetId = null
    } else if (dynasty.currentPhase === 'postseason') {
      // Postseason has 4 weeks:
      // Week 1: Bowl Week 1 + CFP First Round (seeds 5-12)
      // Week 2: Bowl Week 2 + CFP Quarterfinals (seeds 1-4 enter)
      // Week 3: Bowl Week 3 + CFP Semifinals
      // Week 4: National Championship

      const existingBowlGames = dynasty.bowlGamesByYear || {}
      const yearBowlGames = existingBowlGames[year] || {}
      const existingCFPResults = dynasty.cfpResultsByYear || {}
      const yearCFPResults = existingCFPResults[year] || {}

      if (dynasty.currentWeek === 1) {
        // Reverting FROM Week 1 TO Conference Championship phase
        // Clear ALL Bowl Week 1 data

        // Remove user's CFP First Round game and bowl game from games array
        updatedGames = updatedGames.filter(g =>
          !(g.isCFPFirstRound && g.year === year) &&
          !(g.isBowlGame && g.year === year && g.bowlWeek === 'week1')
        )

        // Clear conference championships data
        additionalUpdates.conferenceChampionships = null
        const existingCCByYear = dynasty.conferenceChampionshipsByYear || {}
        additionalUpdates.conferenceChampionshipsByYear = { ...existingCCByYear, [year]: null }

        // Clear CFP Seeds for current year
        const existingCFPSeeds = dynasty.cfpSeedsByYear || {}
        additionalUpdates.cfpSeedsByYear = { ...existingCFPSeeds, [year]: null }

        // Clear bowl eligibility data
        additionalUpdates.bowlEligibilityData = null

        // Clear new job data
        additionalUpdates.newJobData = null

        // Clear Bowl Week 1 results
        additionalUpdates.bowlGamesByYear = {
          ...existingBowlGames,
          [year]: { ...yearBowlGames, week1: null }
        }

        // Clear CFP First Round results
        additionalUpdates.cfpResultsByYear = {
          ...existingCFPResults,
          [year]: { ...yearCFPResults, firstRound: null }
        }

        // Clear all sheet IDs for this phase
        additionalUpdates.bowlWeek1SheetId = null
        additionalUpdates.cfpSeedsSheetId = null
        additionalUpdates.cfpFirstRoundSheetId = null

      } else if (dynasty.currentWeek === 2) {
        // Reverting FROM Week 2 TO Week 1
        // Clear Week 2 data (Bowl Week 2 + CFP Quarterfinals)

        // Remove user's CFP Quarterfinal game and bowl game from games array
        updatedGames = updatedGames.filter(g =>
          !(g.isCFPQuarterfinal && g.year === year) &&
          !(g.isBowlGame && g.year === year && g.bowlWeek === 'week2')
        )

        // Clear Bowl Week 2 results
        additionalUpdates.bowlGamesByYear = {
          ...existingBowlGames,
          [year]: { ...yearBowlGames, week2: null }
        }

        // Clear CFP Quarterfinal results
        additionalUpdates.cfpResultsByYear = {
          ...existingCFPResults,
          [year]: { ...yearCFPResults, quarterfinals: null }
        }

        // Clear all sheet IDs for this phase
        additionalUpdates.bowlWeek2SheetId = null
        additionalUpdates.cfpQuarterfinalsSheetId = null

      } else if (dynasty.currentWeek === 3) {
        // Reverting FROM Week 3 TO Week 2
        // Clear Week 3 data (Bowl Week 3 + CFP Semifinals)

        // Remove user's CFP Semifinal game and bowl game from games array
        updatedGames = updatedGames.filter(g =>
          !(g.isCFPSemifinal && g.year === year) &&
          !(g.isBowlGame && g.year === year && g.bowlWeek === 'week3')
        )

        // Clear Bowl Week 3 results (if exists)
        additionalUpdates.bowlGamesByYear = {
          ...existingBowlGames,
          [year]: { ...yearBowlGames, week3: null }
        }

        // Clear CFP Semifinal results
        additionalUpdates.cfpResultsByYear = {
          ...existingCFPResults,
          [year]: { ...yearCFPResults, semifinals: null }
        }

        // Clear all sheet IDs for this phase (if they exist)
        additionalUpdates.bowlWeek3SheetId = null
        additionalUpdates.cfpSemifinalsSheetId = null

      } else if (dynasty.currentWeek === 4) {
        // Reverting FROM Week 4 TO Week 3
        // Clear Week 4 data (National Championship)

        // Remove user's CFP Championship game from games array
        updatedGames = updatedGames.filter(g =>
          !(g.isCFPChampionship && g.year === year)
        )

        // Clear CFP Championship results
        additionalUpdates.cfpResultsByYear = {
          ...existingCFPResults,
          [year]: { ...yearCFPResults, championship: null }
        }

        // Clear sheet ID (if exists)
        additionalUpdates.cfpChampionshipSheetId = null
      } else if (dynasty.currentWeek === 5) {
        // Reverting FROM Week 5 TO Week 4
        // Week 5 (End of Season Recap) - only clears championship data
        // that was entered by users who weren't in the championship

        // Clear CFP Championship results (if entered during recap week)
        additionalUpdates.cfpResultsByYear = {
          ...existingCFPResults,
          [year]: { ...yearCFPResults, championship: null }
        }
      }
    } else if (dynasty.currentPhase === 'offseason') {
      // Reverting within offseason - handle different week transitions
      const teamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName

      if (dynasty.currentWeek === 1 && prevPhase === 'postseason') {
        // Reverting FROM offseason week 1 TO postseason week 5
        // If user switched teams, restore the previous team
        const previousJobData = dynasty.previousJobData
        if (previousJobData) {
          // Restore the old team
          additionalUpdates.teamName = previousJobData.teamName
          additionalUpdates.coachPosition = previousJobData.coachPosition
          additionalUpdates.conference = previousJobData.conference
          additionalUpdates.schedule = previousJobData.schedule
          additionalUpdates.teamRatings = previousJobData.teamRatings
          additionalUpdates.coachingStaff = previousJobData.coachingStaff
          additionalUpdates.googleSheetId = previousJobData.googleSheetId
          additionalUpdates.googleSheetUrl = previousJobData.googleSheetUrl
          additionalUpdates.preseasonSetup = previousJobData.preseasonSetup
          // Restore the accepted job offer so it shows again
          additionalUpdates.newJobData = previousJobData.newJobData
          // Remove the last entry from coaching history (the stint we just added)
          const existingHistory = dynasty.coachingHistory || []
          if (existingHistory.length > 0) {
            additionalUpdates.coachingHistory = existingHistory.slice(0, -1)
          }
          // Clear previousJobData since we've restored it
          additionalUpdates.previousJobData = null
        }
      } else if (dynasty.currentWeek === 6 && prevWeek === 5) {
        // Reverting FROM Signing Day (week 6) TO week 5
        // CRITICAL: Undo year flip and class progression
        // currentYear is the NEW year (post-flip), prevYear will be currentYear - 1
        prevYear = currentYear - 1
        const newSeasonYear = currentYear // The year we're leaving
        const previousSeasonYear = prevYear // The year we're going back to

        const players = dynasty.players || []

        // Reverse class progression for all players
        // Remove teamsByYear[newSeasonYear] and classByYear[newSeasonYear] entries
        // Restore player.year to previous class
        const REVERSE_CLASS_PROGRESSION = {
          'So': 'Fr', 'Jr': 'So', 'Sr': 'Jr',
          'RS So': 'RS Fr', 'RS Jr': 'RS So', 'RS Sr': 'RS Jr',
          'RS Fr': 'Fr' // Redshirt was added, remove it
        }

        const updatedPlayers = players.map(player => {
          if (player.isHonorOnly) return player
          if (player.isRecruit) return player // Recruits weren't processed

          // Check if this player was on the team and had class progression applied
          const hadNewYearEntry = player.teamsByYear?.[newSeasonYear] === teamAbbr ||
                                   player.teamsByYear?.[String(newSeasonYear)] === teamAbbr

          if (!hadNewYearEntry) return player

          // Get the class from the previous season to determine original class
          const previousClass = player.classByYear?.[previousSeasonYear] ||
                                player.classByYear?.[String(previousSeasonYear)]

          // Remove the new season entries from teamsByYear and classByYear
          const newTeamsByYear = { ...player.teamsByYear }
          delete newTeamsByYear[newSeasonYear]
          delete newTeamsByYear[String(newSeasonYear)]

          const newClassByYear = { ...player.classByYear }
          delete newClassByYear[newSeasonYear]
          delete newClassByYear[String(newSeasonYear)]

          // Restore player.year to the previous class
          return {
            ...player,
            year: previousClass || player.year,
            teamsByYear: newTeamsByYear,
            classByYear: newClassByYear
          }
        })

        if (updatedPlayers.some((p, i) => p !== players[i])) {
          additionalUpdates.players = updatedPlayers
        }

        // Clear class progression marker
        additionalUpdates.classProgressionDoneForYear = null
      } else if (dynasty.currentWeek === 8 && prevWeek === 7) {
        // Reverting FROM week 8 TO week 7
        // CRITICAL: Restore recruits to isRecruit: true
        // At Week 7→8, recruits were converted. We need to undo that.
        // Year is already post-flip, so recruitYear = currentYear - 1
        const players = dynasty.players || []
        const recruitingYear = currentYear - 1

        const updatedPlayers = players.map(player => {
          // Restore isRecruit for players recruited this cycle
          if (player.recruitYear === recruitingYear || player.recruitYear === String(recruitingYear)) {
            return { ...player, isRecruit: true }
          }
          return player
        })

        if (updatedPlayers.some((p, i) => p !== players[i])) {
          additionalUpdates.players = updatedPlayers
        }
      }
    }

    await updateDynasty(dynastyId, {
      currentWeek: prevWeek,
      currentPhase: prevPhase,
      currentYear: prevYear,
      games: updatedGames,
      ...additionalUpdates
    })
  }

  const saveSchedule = async (dynastyId, schedule) => {
    // CRITICAL: Read from localStorage to get the latest data
    const isDev = import.meta.env.VITE_DEV_MODE === 'true'
    let dynasty

    if (isDev || !user) {
      const currentData = localStorage.getItem('cfb-dynasties')
      const currentDynasties = currentData ? JSON.parse(currentData) : dynasties
      dynasty = currentDynasties.find(d => String(d.id) === String(dynastyId))
    } else {
      dynasty = String(currentDynasty?.id) === String(dynastyId)
        ? currentDynasty
        : dynasties.find(d => String(d.id) === String(dynastyId))
    }

    if (!dynasty) {
      console.error('Dynasty not found:', dynastyId)
      return
    }

    // Get current team abbreviation and year for team-centric storage
    const teamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName
    const year = dynasty.currentYear
    const tid = getTidFromAbbr(teamAbbr)

    // Build team-centric schedule storage (old structure)
    const existingSchedulesByTeamYear = dynasty.schedulesByTeamYear || {}
    const teamSchedules = existingSchedulesByTeamYear[teamAbbr] || {}

    // Build team-centric preseason setup storage (old structure)
    const existingPreseasonSetupByTeamYear = dynasty.preseasonSetupByTeamYear || {}
    const teamSetups = existingPreseasonSetupByTeamYear[teamAbbr] || {}
    const currentSetup = teamSetups[year] || dynasty.preseasonSetup || {}

    // Build NEW tid-based byYear structure updates
    const existingTeams = dynasty.teams || {}
    const existingTeamData = existingTeams[tid] || {}
    const existingByYear = existingTeamData.byYear || {}
    const existingYearData = existingByYear[year] || {}
    const existingYearSetup = existingYearData.preseasonSetup || {}

    const scheduleUpdates = isDev || !user
      ? {
          // Store in NEW tid-based byYear structure
          teams: {
            ...existingTeams,
            [tid]: {
              ...existingTeamData,
              byYear: {
                ...existingByYear,
                [year]: {
                  ...existingYearData,
                  schedule,
                  preseasonSetup: {
                    ...existingYearSetup,
                    scheduleEntered: true
                  }
                }
              }
            }
          },
          // Store in old team-centric structure (for backward compatibility)
          schedulesByTeamYear: {
            ...existingSchedulesByTeamYear,
            [teamAbbr]: {
              ...teamSchedules,
              [year]: schedule
            }
          },
          // Also update legacy schedule for backwards compatibility
          schedule,
          // Update old team-centric preseason setup
          preseasonSetupByTeamYear: {
            ...existingPreseasonSetupByTeamYear,
            [teamAbbr]: {
              ...teamSetups,
              [year]: {
                ...currentSetup,
                scheduleEntered: true
              }
            }
          },
          // Also update legacy preseason setup
          preseasonSetup: {
            ...(dynasty.preseasonSetup || {}),
            scheduleEntered: true
          }
        }
      : {
          // Firestore: use dot notation for nested updates
          // NEW tid-based byYear structure
          [`teams.${tid}.byYear.${year}.schedule`]: schedule,
          [`teams.${tid}.byYear.${year}.preseasonSetup.scheduleEntered`]: true,
          // Old structures (for backward compatibility)
          [`schedulesByTeamYear.${teamAbbr}.${year}`]: schedule,
          schedule,
          [`preseasonSetupByTeamYear.${teamAbbr}.${year}.scheduleEntered`]: true,
          'preseasonSetup.scheduleEntered': true
        }

    await updateDynasty(dynastyId, scheduleUpdates)
  }

  const saveRoster = async (dynastyId, players, options = {}) => {
    // CRITICAL: Read from localStorage to get the latest data (including any recent schedule save)
    const isDev = import.meta.env.VITE_DEV_MODE === 'true'
    let dynasty

    if (isDev || !user) {
      const currentData = localStorage.getItem('cfb-dynasties')
      const currentDynasties = currentData ? JSON.parse(currentData) : dynasties
      dynasty = currentDynasties.find(d => String(d.id) === String(dynastyId))
    } else {
      dynasty = String(currentDynasty?.id) === String(dynastyId)
        ? currentDynasty
        : dynasties.find(d => String(d.id) === String(dynastyId))
    }

    if (!dynasty) {
      console.error('Dynasty not found:', dynastyId)
      return
    }

    // DEBUG: Log dynasty flags
    console.log(`[saveRoster] Dynasty flags: _tidFullyMigrated=${dynasty._tidFullyMigrated}, _tidMigrated=${dynasty._tidMigrated}, _subcollectionsMigrated=${dynasty._subcollectionsMigrated}`)

    // Get team abbreviation - use provided teamAbbr or fall back to user's current team
    const teamAbbr = options.teamAbbr || getCurrentTeamAbbr(dynasty) || dynasty.teamName
    // Get year - use provided year or fall back to current year
    const year = options.year || dynasty.currentYear

    // For tid-based storage: get tid from abbreviation
    // After full tid migration, teamsByYear should store tid (number) not abbr (string)
    const teamTid = getTidFromAbbr(teamAbbr)
    const useFullTidSystem = dynasty._tidFullyMigrated === true
    const teamsByYearValue = useFullTidSystem && teamTid ? teamTid : teamAbbr

    // DEBUG: Log what values are being used
    console.log(`[saveRoster] teamAbbr: ${teamAbbr}, teamTid: ${teamTid}, _tidFullyMigrated: ${dynasty._tidFullyMigrated}, useFullTidSystem: ${useFullTidSystem}, teamsByYearValue: ${teamsByYearValue} (type: ${typeof teamsByYearValue}), year: ${year}`)

    // ALWAYS use merge mode - never delete existing players that aren't in the sheet
    // This prevents accidental data loss if the sheet has fewer players than expected
    const existingPlayers = dynasty.players || []

    // Keep all players that are NOT on the team being edited
    // Players on the team being edited will be handled via name matching below
    const playersToKeep = existingPlayers.filter(p => {
      // Always keep honor-only players
      if (p.isHonorOnly) return true
      // Keep players from OTHER teams
      if (p.team && p.team !== teamAbbr) return true
      // Keep players with no team field (legacy data)
      if (!p.team) return true
      // For this team's players: they'll be updated via name matching if in sheet,
      // or preserved below if not in sheet
      return false
    })

    // Also preserve existing team players who are NOT in the incoming sheet data
    // This prevents accidental deletion of players who were filtered out of the sheet
    const incomingNames = new Set(players.map(p => (p.name || '').toLowerCase().trim()).filter(n => n))
    const teamPlayersNotInSheet = existingPlayers.filter(p => {
      if (p.isHonorOnly) return false // Already in playersToKeep
      if (p.team !== teamAbbr) return false // Not this team
      const nameLower = (p.name || '').toLowerCase().trim()
      // Keep if this player is NOT in the incoming sheet data
      return nameLower && !incomingNames.has(nameLower)
    })

    let finalPlayers
    let newNextPID

    // Find the highest existing PID to continue from
    const maxExistingPID = existingPlayers.reduce((max, p) => Math.max(max, p.pid || 0), 0)
    const startPID = Math.max(maxExistingPID + 1, dynasty.nextPID || 1)

    // Create a map of existing players by name for matching
    const existingPlayersByName = {}
    existingPlayers.forEach(p => {
      if (p.name && p.team === teamAbbr) {
        existingPlayersByName[p.name.toLowerCase().trim()] = p
      }
    })

    // Add team field and yearStarted to each player
    // For existing players (matched by name), preserve their original data
    // For new players, set yearStarted to the current editing year
    let nextPIDCounter = startPID
    const playersWithPIDs = players.map((player) => {
      const nameLower = (player.name || '').toLowerCase().trim()
      const existingPlayer = existingPlayersByName[nameLower]

      // For new players, assign a new PID
      let pid, id
      if (existingPlayer) {
        pid = existingPlayer.pid
        id = existingPlayer.id
      } else {
        pid = nextPIDCounter++
        id = `player-${pid}`
      }

      // For existing players, START with existing data and only update SPECIFIC editable fields from sheet
      // This prevents accidentally overwriting critical metadata with undefined values
      if (existingPlayer) {
        // CRITICAL: Set teamsByYear[year] = teamAbbr to record this player was on this team this year
        // This is the IMMUTABLE record that determines roster membership for past seasons
        // BUT: Skip adding the year if player has a departure movement before this year
        const hasDepartedBeforeThisYear = (existingPlayer.movements || []).some(m =>
          (m.type === 'departure' || m.type === 'transfer') && m.year && Number(m.year) < Number(year)
        )
        const shouldAddToTeamsByYear = !hasDepartedBeforeThisYear

        const updatedTeamsByYear = shouldAddToTeamsByYear
          ? {
              ...(existingPlayer.teamsByYear || {}),
              [year]: teamsByYearValue
            }
          : existingPlayer.teamsByYear || {}

        // Track player class for this season
        const playerClass = player.year || existingPlayer.year
        const updatedClassByYear = {
          ...(existingPlayer.classByYear || {}),
          [year]: playerClass
        }

        return {
          // Start with ALL existing player data (preserves everything by default)
          ...existingPlayer,
          // Update ONLY the fields that are editable via Google Sheet
          // These are the columns: First Name, Last Name, Position, Class, Dev Trait, Jersey #, Archetype, Overall, Height, Weight, Hometown, State, Image URL
          firstName: player.firstName ?? existingPlayer.firstName,
          lastName: player.lastName ?? existingPlayer.lastName,
          name: player.name || existingPlayer.name,
          position: player.position || existingPlayer.position,
          year: player.year || existingPlayer.year, // class (Fr, So, Jr, Sr, etc.)
          devTrait: player.devTrait || existingPlayer.devTrait,
          jerseyNumber: player.jerseyNumber ?? existingPlayer.jerseyNumber,
          archetype: player.archetype ?? existingPlayer.archetype,
          overall: player.overall ?? existingPlayer.overall,
          height: player.height ?? existingPlayer.height,
          weight: player.weight ?? existingPlayer.weight,
          hometown: player.hometown ?? existingPlayer.hometown,
          state: player.state ?? existingPlayer.state,
          pictureUrl: player.pictureUrl ?? existingPlayer.pictureUrl,
          // Ensure pid/id/team are correct
          pid,
          id,
          team: teamAbbr,
          // IMMUTABLE roster history - records which team player was on each year
          teamsByYear: updatedTeamsByYear,
          // IMMUTABLE class history - records what class player was each year
          classByYear: updatedClassByYear
          // ALL other fields (recruitYear, yearStarted, isRecruit, isPortal, stars, etc.)
          // are automatically preserved from ...existingPlayer and NOT overwritten
        }
      }

      // For NEW players (no name match), use sheet data with required fields
      // Add 'added' movement to track when player was manually added
      const addedMovement = createMovement(
        year,
        MOVEMENT_TYPES.ADDED,
        null,
        teamAbbr,
        'Added via roster entry'
      )
      return {
        ...player,
        pid,
        id,
        team: teamAbbr,
        yearStarted: player.yearStarted || year,
        // IMMUTABLE roster history - this player is on this team this year
        // Use tid (number) for fully migrated dynasties, abbr (string) for legacy
        teamsByYear: { [year]: teamsByYearValue },
        // IMMUTABLE class history - record this player's class for this year
        classByYear: { [year]: player.year },
        // Movement history for tracking career path
        movements: [addedMovement]
      }
    })

    // Get the PIDs of players being updated from the sheet
    const updatedPIDs = new Set(playersWithPIDs.map(p => p.pid))

    // Filter out players from playersToKeep that are being replaced by sheet data
    // This prevents duplicates when the same player appears in both playersToKeep and playersWithPIDs
    const filteredPlayersToKeep = playersToKeep.filter(p => !updatedPIDs.has(p.pid))

    // Filter out teamPlayersNotInSheet that somehow got a matching PID (edge case)
    const filteredTeamPlayersNotInSheet = teamPlayersNotInSheet.filter(p => !updatedPIDs.has(p.pid))

    // Combine: other teams + honor-only + team players not in sheet + sheet players
    // This ensures we never lose players just because they weren't in the sheet
    finalPlayers = [...filteredPlayersToKeep, ...filteredTeamPlayersNotInSheet, ...playersWithPIDs]
    newNextPID = nextPIDCounter  // Use the counter which only incremented for new players

    // DEBUG: Log first 3 players from final array with their teamsByYear
    console.log(`[saveRoster] Final players count: ${finalPlayers.length}`)
    finalPlayers.slice(0, 3).forEach((p, i) => {
      console.log(`[saveRoster] Player ${i}: ${p.name}, team: ${p.team}, teamsByYear:`, p.teamsByYear)
    })

    // Build team-centric preseason setup storage (old structure)
    const existingPreseasonSetupByTeamYear = dynasty.preseasonSetupByTeamYear || {}
    const teamSetups = existingPreseasonSetupByTeamYear[teamAbbr] || {}
    const currentSetup = teamSetups[year] || dynasty.preseasonSetup || {}

    // Build NEW tid-based byYear structure updates
    const tid = getTidFromAbbr(teamAbbr)
    const existingTeams = dynasty.teams || {}
    const existingTeamData = existingTeams[tid] || {}
    const existingByYear = existingTeamData.byYear || {}
    const existingYearData = existingByYear[year] || {}
    const existingYearSetup = existingYearData.preseasonSetup || {}

    const rosterUpdates = isDev || !user
      ? {
          players: finalPlayers,
          nextPID: newNextPID,
          // Update NEW tid-based byYear structure
          teams: {
            ...existingTeams,
            [tid]: {
              ...existingTeamData,
              byYear: {
                ...existingByYear,
                [year]: {
                  ...existingYearData,
                  preseasonSetup: {
                    ...existingYearSetup,
                    rosterEntered: true
                  }
                }
              }
            }
          },
          // Update old team-centric preseason setup (for backward compatibility)
          preseasonSetupByTeamYear: {
            ...existingPreseasonSetupByTeamYear,
            [teamAbbr]: {
              ...teamSetups,
              [year]: {
                ...currentSetup,
                rosterEntered: true
              }
            }
          },
          // Also update legacy preseason setup
          preseasonSetup: {
            ...dynasty.preseasonSetup,
            rosterEntered: true
          }
        }
      : {
          players: finalPlayers,
          nextPID: newNextPID,
          // NEW tid-based byYear structure
          [`teams.${tid}.byYear.${year}.preseasonSetup.rosterEntered`]: true,
          // Old structures (for backward compatibility)
          [`preseasonSetupByTeamYear.${teamAbbr}.${year}.rosterEntered`]: true,
          'preseasonSetup.rosterEntered': true
        }

    await updateDynasty(dynastyId, rosterUpdates)
  }

  const saveTeamRatings = async (dynastyId, ratings) => {
    const isDev = import.meta.env.VITE_DEV_MODE === 'true'
    let dynasty

    if (isDev || !user) {
      const currentData = localStorage.getItem('cfb-dynasties')
      const currentDynasties = currentData ? JSON.parse(currentData) : dynasties
      dynasty = currentDynasties.find(d => String(d.id) === String(dynastyId))
    } else {
      dynasty = String(currentDynasty?.id) === String(dynastyId)
        ? currentDynasty
        : dynasties.find(d => String(d.id) === String(dynastyId))
    }

    if (!dynasty) {
      console.error('Dynasty not found:', dynastyId)
      return
    }

    // Get current team abbreviation and year for team-centric storage
    const teamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName
    const year = dynasty.currentYear
    const tid = getTidFromAbbr(teamAbbr)

    // Build team-centric preseason setup storage (old structure)
    const existingPreseasonSetupByTeamYear = dynasty.preseasonSetupByTeamYear || {}
    const teamSetups = existingPreseasonSetupByTeamYear[teamAbbr] || {}
    const currentSetup = teamSetups[year] || dynasty.preseasonSetup || {}

    // Build team-centric ratings storage (old structure)
    const existingTeamRatingsByTeamYear = dynasty.teamRatingsByTeamYear || {}
    const teamRatingsForTeam = existingTeamRatingsByTeamYear[teamAbbr] || {}

    // Build NEW tid-based byYear structure updates
    const existingTeams = dynasty.teams || {}
    const existingTeamData = existingTeams[tid] || {}
    const existingByYear = existingTeamData.byYear || {}
    const existingYearData = existingByYear[year] || {}
    const existingYearSetup = existingYearData.preseasonSetup || {}

    const teamRatingsUpdates = isDev || !user
      ? {
          // Store in NEW tid-based byYear structure
          teams: {
            ...existingTeams,
            [tid]: {
              ...existingTeamData,
              byYear: {
                ...existingByYear,
                [year]: {
                  ...existingYearData,
                  teamRatings: ratings,
                  preseasonSetup: {
                    ...existingYearSetup,
                    teamRatingsEntered: true
                  }
                }
              }
            }
          },
          // Store in old team-centric structure (for backward compatibility)
          teamRatingsByTeamYear: {
            ...existingTeamRatingsByTeamYear,
            [teamAbbr]: {
              ...teamRatingsForTeam,
              [year]: ratings
            }
          },
          // Also update legacy for backwards compatibility
          teamRatings: ratings,
          preseasonSetupByTeamYear: {
            ...existingPreseasonSetupByTeamYear,
            [teamAbbr]: {
              ...teamSetups,
              [year]: {
                ...currentSetup,
                teamRatingsEntered: true
              }
            }
          },
          preseasonSetup: {
            ...dynasty.preseasonSetup,
            teamRatingsEntered: true
          }
        }
      : {
          // Firestore: use dot notation for nested updates
          // NEW tid-based byYear structure
          [`teams.${tid}.byYear.${year}.teamRatings`]: ratings,
          [`teams.${tid}.byYear.${year}.preseasonSetup.teamRatingsEntered`]: true,
          // Old structures (for backward compatibility)
          [`teamRatingsByTeamYear.${teamAbbr}.${year}`]: ratings,
          teamRatings: ratings,
          [`preseasonSetupByTeamYear.${teamAbbr}.${year}.teamRatingsEntered`]: true,
          'preseasonSetup.teamRatingsEntered': true
        }

    await updateDynasty(dynastyId, teamRatingsUpdates)
  }

  // Save team year info (record, conference) for any team/year combination
  const saveTeamYearInfo = async (dynastyId, teamAbbr, year, info) => {
    const isDev = import.meta.env.VITE_DEV_MODE === 'true'
    let dynasty

    if (isDev || !user) {
      const currentData = localStorage.getItem('cfb-dynasties')
      const currentDynasties = currentData ? JSON.parse(currentData) : dynasties
      dynasty = currentDynasties.find(d => String(d.id) === String(dynastyId))
    } else {
      dynasty = String(currentDynasty?.id) === String(dynastyId)
        ? currentDynasty
        : dynasties.find(d => String(d.id) === String(dynastyId))
    }

    if (!dynasty) {
      console.error('Dynasty not found:', dynastyId)
      return
    }

    // Get tid for new byYear structure
    const tid = getTidFromAbbr(teamAbbr)

    const updates = {}

    // Handle record update
    if (info.wins !== undefined && info.losses !== undefined) {
      const existingRecords = dynasty.teamRecordsByTeamYear || {}
      const teamRecords = existingRecords[teamAbbr] || {}
      const recordData = { wins: info.wins, losses: info.losses }

      if (isDev || !user) {
        // NEW tid-based byYear structure
        if (tid) {
          const existingTeams = dynasty.teams || {}
          const existingTeamData = existingTeams[tid] || {}
          const existingByYear = existingTeamData.byYear || {}
          const existingYearData = existingByYear[year] || {}

          updates.teams = {
            ...existingTeams,
            [tid]: {
              ...existingTeamData,
              byYear: {
                ...existingByYear,
                [year]: {
                  ...existingYearData,
                  teamRecord: recordData
                }
              }
            }
          }
        }
        // Old structure (for backward compatibility)
        updates.teamRecordsByTeamYear = {
          ...existingRecords,
          [teamAbbr]: {
            ...teamRecords,
            [year]: recordData
          }
        }
      } else {
        // Firestore dot notation
        if (tid) {
          updates[`teams.${tid}.byYear.${year}.teamRecord`] = recordData
        }
        updates[`teamRecordsByTeamYear.${teamAbbr}.${year}`] = recordData
      }
    }

    // Handle conference update
    if (info.conference !== undefined) {
      const existingConferences = dynasty.conferenceByTeamYear || {}
      const teamConferences = existingConferences[teamAbbr] || {}

      if (isDev || !user) {
        // NEW tid-based byYear structure
        if (tid) {
          const existingTeams = updates.teams || dynasty.teams || {}
          const existingTeamData = existingTeams[tid] || {}
          const existingByYear = existingTeamData.byYear || {}
          const existingYearData = existingByYear[year] || {}

          updates.teams = {
            ...existingTeams,
            [tid]: {
              ...existingTeamData,
              byYear: {
                ...existingByYear,
                [year]: {
                  ...existingYearData,
                  conference: info.conference
                }
              }
            }
          }
        }
        // Old structure (for backward compatibility)
        updates.conferenceByTeamYear = {
          ...existingConferences,
          [teamAbbr]: {
            ...teamConferences,
            [year]: info.conference
          }
        }
      } else {
        // Firestore dot notation
        if (tid) {
          updates[`teams.${tid}.byYear.${year}.conference`] = info.conference
        }
        updates[`conferenceByTeamYear.${teamAbbr}.${year}`] = info.conference
      }
    }

    if (Object.keys(updates).length > 0) {
      await updateDynasty(dynastyId, updates)
    }
  }

  const saveCoachingStaff = async (dynastyId, staff) => {
    const isDev = import.meta.env.VITE_DEV_MODE === 'true'
    let dynasty

    if (isDev || !user) {
      const currentData = localStorage.getItem('cfb-dynasties')
      const currentDynasties = currentData ? JSON.parse(currentData) : dynasties
      dynasty = currentDynasties.find(d => String(d.id) === String(dynastyId))
    } else {
      dynasty = String(currentDynasty?.id) === String(dynastyId)
        ? currentDynasty
        : dynasties.find(d => String(d.id) === String(dynastyId))
    }

    if (!dynasty) {
      console.error('Dynasty not found:', dynastyId)
      return
    }

    // Get current team abbreviation and year for team-centric storage
    const teamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName
    const year = dynasty.currentYear
    const tid = getTidFromAbbr(teamAbbr)

    // Build team-centric preseason setup storage (old structure)
    const existingPreseasonSetupByTeamYear = dynasty.preseasonSetupByTeamYear || {}
    const teamSetups = existingPreseasonSetupByTeamYear[teamAbbr] || {}
    const currentSetup = teamSetups[year] || dynasty.preseasonSetup || {}

    // Build team-centric coaching staff storage (old structure)
    const existingCoachingStaffByTeamYear = dynasty.coachingStaffByTeamYear || {}
    const coachingStaffForTeam = existingCoachingStaffByTeamYear[teamAbbr] || {}

    // Build NEW tid-based byYear structure updates
    const existingTeams = dynasty.teams || {}
    const existingTeamData = existingTeams[tid] || {}
    const existingByYear = existingTeamData.byYear || {}
    const existingYearData = existingByYear[year] || {}
    const existingYearSetup = existingYearData.preseasonSetup || {}

    const coachingStaffUpdates = isDev || !user
      ? {
          // Store in NEW tid-based byYear structure
          teams: {
            ...existingTeams,
            [tid]: {
              ...existingTeamData,
              byYear: {
                ...existingByYear,
                [year]: {
                  ...existingYearData,
                  coachingStaff: staff,
                  preseasonSetup: {
                    ...existingYearSetup,
                    coachingStaffEntered: true
                  }
                }
              }
            }
          },
          // Store in old team-centric structure (for backward compatibility)
          coachingStaffByTeamYear: {
            ...existingCoachingStaffByTeamYear,
            [teamAbbr]: {
              ...coachingStaffForTeam,
              [year]: staff
            }
          },
          // Also update legacy for backwards compatibility
          coachingStaff: staff,
          preseasonSetupByTeamYear: {
            ...existingPreseasonSetupByTeamYear,
            [teamAbbr]: {
              ...teamSetups,
              [year]: {
                ...currentSetup,
                coachingStaffEntered: true
              }
            }
          },
          preseasonSetup: {
            ...dynasty.preseasonSetup,
            coachingStaffEntered: true
          }
        }
      : {
          // Firestore: use dot notation for nested updates
          // NEW tid-based byYear structure
          [`teams.${tid}.byYear.${year}.coachingStaff`]: staff,
          [`teams.${tid}.byYear.${year}.preseasonSetup.coachingStaffEntered`]: true,
          // Old structures (for backward compatibility)
          [`coachingStaffByTeamYear.${teamAbbr}.${year}`]: staff,
          coachingStaff: staff,
          [`preseasonSetupByTeamYear.${teamAbbr}.${year}.coachingStaffEntered`]: true,
          'preseasonSetup.coachingStaffEntered': true
        }

    await updateDynasty(dynastyId, coachingStaffUpdates)
  }

  const updatePlayer = async (dynastyId, updatedPlayer, yearStats = null) => {
    const isDev = import.meta.env.VITE_DEV_MODE === 'true'
    let dynasty

    if (isDev || !user) {
      const currentData = localStorage.getItem('cfb-dynasties')
      const currentDynasties = currentData ? JSON.parse(currentData) : dynasties
      dynasty = currentDynasties.find(d => String(d.id) === String(dynastyId))
    } else {
      dynasty = String(currentDynasty?.id) === String(dynastyId)
        ? currentDynasty
        : dynasties.find(d => String(d.id) === String(dynastyId))
    }

    if (!dynasty) {
      console.error('Dynasty not found:', dynastyId)
      return
    }

    // Find the original player to check if name changed
    const originalPlayer = (dynasty.players || []).find(p => p.pid === updatedPlayer.pid)
    const oldName = originalPlayer?.name
    const newName = updatedPlayer.name
    const nameChanged = oldName && newName && oldName !== newName

    // Update the player in the players array
    const updatedPlayers = (dynasty.players || []).map(player =>
      player.pid === updatedPlayer.pid ? updatedPlayer : player
    )

    // Build the update object
    const updateData = { players: updatedPlayers }

    // If name changed, update all box scores in all games
    if (nameChanged) {
      const updatedGames = (dynasty.games || []).map(game => {
        if (!game.boxScore) return game

        // Helper to update player names in a stat category
        const updateStatCategory = (stats) => {
          if (!Array.isArray(stats)) return stats
          return stats.map(row => {
            if (row.playerName === oldName) {
              return { ...row, playerName: newName }
            }
            return row
          })
        }

        // Update both home and away box scores
        const updatedBoxScore = { ...game.boxScore }

        if (updatedBoxScore.home) {
          updatedBoxScore.home = { ...updatedBoxScore.home }
          Object.keys(updatedBoxScore.home).forEach(category => {
            updatedBoxScore.home[category] = updateStatCategory(updatedBoxScore.home[category])
          })
        }

        if (updatedBoxScore.away) {
          updatedBoxScore.away = { ...updatedBoxScore.away }
          Object.keys(updatedBoxScore.away).forEach(category => {
            updatedBoxScore.away[category] = updateStatCategory(updatedBoxScore.away[category])
          })
        }

        // Also update scoring summary if it contains the player's name
        if (Array.isArray(updatedBoxScore.scoringSummary)) {
          updatedBoxScore.scoringSummary = updatedBoxScore.scoringSummary.map(play => {
            const updated = { ...play }
            if (updated.scorer === oldName) updated.scorer = newName
            if (updated.passer === oldName) updated.passer = newName
            if (updated.patNotes === oldName) updated.patNotes = newName
            return updated
          })
        }

        return { ...game, boxScore: updatedBoxScore }
      })

      updateData.games = updatedGames
      // Note: Legacy playerStatsByYear and detailedStatsByYear updates removed
      // Stats are now stored in player.statsByYear only
    }

    // If yearStats is provided, update player.statsByYear directly
    if (yearStats && yearStats.year) {
      const year = Number(yearStats.year)

      // Update player.statsByYear in the players array
      // Use updateData.players (which already has the updatedPlayer changes) as the base
      const playersBase = updateData.players || dynasty.players
      const updatedPlayersWithStats = playersBase.map(p => {
        if (p.pid !== updatedPlayer.pid) return p

        // Start from the updated player (which has the form changes) to preserve all edits
        const existingStatsByYear = { ...(p.statsByYear || {}) }
        existingStatsByYear[year] = {
          ...(existingStatsByYear[year] || {}),
          gamesPlayed: yearStats.gamesPlayed,
          snapsPlayed: yearStats.snapsPlayed,
          ...(yearStats.passing && { passing: yearStats.passing }),
          ...(yearStats.rushing && { rushing: yearStats.rushing }),
          ...(yearStats.receiving && { receiving: yearStats.receiving }),
          ...(yearStats.blocking && { blocking: yearStats.blocking }),
          ...(yearStats.defense && { defense: yearStats.defense }),
          ...(yearStats.defensive && { defense: yearStats.defensive }), // Handle both names
          ...(yearStats.kicking && { kicking: yearStats.kicking }),
          ...(yearStats.punting && { punting: yearStats.punting }),
          ...(yearStats.kickReturn && { kickReturn: yearStats.kickReturn }),
          ...(yearStats.puntReturn && { puntReturn: yearStats.puntReturn })
        }

        return { ...p, statsByYear: existingStatsByYear }
      })

      updateData.players = updatedPlayersWithStats
    }

    await updateDynasty(dynastyId, updateData)
  }

  // Delete a player from the dynasty
  // Adds a 'removed' movement to track the deletion before removing
  const deletePlayer = async (dynastyId, playerPid) => {
    const isDev = import.meta.env.VITE_DEV_MODE === 'true'
    let dynasty

    if (isDev || !user) {
      const currentData = localStorage.getItem('cfb-dynasties')
      const currentDynasties = currentData ? JSON.parse(currentData) : dynasties
      dynasty = currentDynasties.find(d => String(d.id) === String(dynastyId))
    } else {
      dynasty = String(currentDynasty?.id) === String(dynastyId)
        ? currentDynasty
        : dynasties.find(d => String(d.id) === String(dynastyId))
    }

    if (!dynasty) {
      console.error('Dynasty not found:', dynastyId)
      return
    }

    // Find the player being deleted to add a removal movement
    const playerToDelete = (dynasty.players || []).find(p => p.pid === playerPid)
    const teamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName

    // If player exists and has movements, add a 'removed' movement before deleting
    if (playerToDelete) {
      const removedMovement = createMovement(
        dynasty.currentYear,
        MOVEMENT_TYPES.REMOVED,
        playerToDelete.team || teamAbbr,
        null,
        'User removed from roster'
      )

      // Update player with removal movement, then remove from array
      const updatedPlayers = (dynasty.players || []).map(player => {
        if (player.pid === playerPid) {
          return {
            ...player,
            movements: [...(player.movements || []), removedMovement],
            isRemoved: true, // Mark as removed for historical tracking
            removedYear: dynasty.currentYear
          }
        }
        return player
      }).filter(player => player.pid !== playerPid) // Then remove

      await updateDynasty(dynastyId, { players: updatedPlayers })
    } else {
      // Fallback: just remove if player not found
      const updatedPlayers = (dynasty.players || []).filter(player => player.pid !== playerPid)
      await updateDynasty(dynastyId, { players: updatedPlayers })
    }
  }

  // Sync all players' stats to match box score totals for a given year
  const syncAllPlayersStats = async (dynastyId, year) => {
    console.log('syncAllPlayersStats called with:', { dynastyId, year })
    const isDev = import.meta.env.VITE_DEV_MODE === 'true'
    let dynasty

    if (isDev || !user) {
      const currentData = localStorage.getItem('cfb-dynasties')
      const currentDynasties = currentData ? JSON.parse(currentData) : dynasties
      dynasty = currentDynasties.find(d => String(d.id) === String(dynastyId))
    } else {
      dynasty = String(currentDynasty?.id) === String(dynastyId)
        ? currentDynasty
        : dynasties.find(d => String(d.id) === String(dynastyId))
    }

    if (!dynasty) {
      console.error('Dynasty not found:', dynastyId)
      throw new Error('Dynasty not found')
    }

    const userTeamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName
    console.log('Syncing stats for team:', userTeamAbbr, 'year:', year)
    console.log('Games with box scores:', (dynasty.games || []).filter(g => g.boxScore && Number(g.year) === Number(year) && g.userTeam === userTeamAbbr).length)

    const updatedPlayers = recalculateStatsFromBoxScores(
      dynasty.players || [],
      dynasty.games || [],
      year,
      userTeamAbbr
    )

    console.log('Updated', updatedPlayers.length, 'players')
    await updateDynasty(dynastyId, { players: updatedPlayers })
    console.log('Sync complete!')
  }

  const createGoogleSheetForDynasty = async (dynastyId) => {
    if (!user) {
      throw new Error('You must be signed in to create Google Sheets')
    }


    // Use currentDynasty if IDs match, otherwise search in array
    let dynasty = currentDynasty?.id === dynastyId ? currentDynasty : dynasties.find(d => d.id === dynastyId)

    if (!dynasty) {
      console.error('Dynasty not found. ID:', dynastyId)
      throw new Error('Dynasty not found')
    }

    if (dynasty.googleSheetId) {
      throw new Error('This dynasty already has a Google Sheet')
    }


    try {
      const sheetInfo = await createDynastySheet(
        dynasty.teamName,
        dynasty.coachName,
        dynasty.startYear
      )


      await updateDynasty(dynastyId, {
        googleSheetId: sheetInfo.spreadsheetId,
        googleSheetUrl: sheetInfo.spreadsheetUrl
      })

      return sheetInfo
    } catch (error) {
      console.error('❌ Failed to create Google Sheet:', error)
      throw error
    }
  }

  // Create a temporary Google Sheet pre-filled with existing data for editing
  const createTempSheetWithData = async (dynastyId) => {
    if (!user) {
      throw new Error('You must be signed in to create Google Sheets')
    }

    let dynasty = currentDynasty?.id === dynastyId ? currentDynasty : dynasties.find(d => d.id === dynastyId)

    if (!dynasty) {
      throw new Error('Dynasty not found')
    }


    try {
      // Create a new sheet
      const sheetInfo = await createDynastySheet(
        dynasty.teamName,
        dynasty.coachName,
        dynasty.currentYear
      )


      // Get user team abbreviation
      const userTeamAbbr = getCurrentTeamAbbr(dynasty)

      // Write existing schedule and roster data to the sheet
      await writeExistingDataToSheet(
        sheetInfo.spreadsheetId,
        dynasty.schedule,
        dynasty.players,
        userTeamAbbr
      )


      // Update dynasty with temporary sheet ID (will be deleted after save)
      await updateDynasty(dynastyId, {
        googleSheetId: sheetInfo.spreadsheetId,
        googleSheetUrl: sheetInfo.spreadsheetUrl
      })

      return sheetInfo
    } catch (error) {
      console.error('❌ Failed to create temporary sheet:', error)
      throw error
    }
  }

  // Delete the Google Sheet and clear references from dynasty
  const deleteSheetAndClearRefs = async (dynastyId) => {
    let dynasty = currentDynasty?.id === dynastyId ? currentDynasty : dynasties.find(d => d.id === dynastyId)

    if (!dynasty || !dynasty.googleSheetId) {
      return
    }

    try {
      await deleteGoogleSheet(dynasty.googleSheetId)
    } catch (error) {
      console.error('Failed to delete sheet:', error)
    }

    // Clear references regardless of deletion success
    await updateDynasty(dynastyId, {
      googleSheetId: null,
      googleSheetUrl: null
    })
  }

  // Create a Conferences Google Sheet for a dynasty
  const createConferencesSheetForDynasty = async (dynastyId) => {
    if (!user) {
      throw new Error('You must be signed in to create Google Sheets')
    }

    let dynasty = currentDynasty?.id === dynastyId ? currentDynasty : dynasties.find(d => d.id === dynastyId)

    if (!dynasty) {
      throw new Error('Dynasty not found')
    }

    if (dynasty.conferencesSheetId) {
      throw new Error('This dynasty already has a Conferences Sheet')
    }


    try {
      const sheetInfo = await createConferencesSheet(
        dynasty.teamName,
        dynasty.currentYear,
        null,
        dynasty.customTeams
      )


      await updateDynasty(dynastyId, {
        conferencesSheetId: sheetInfo.spreadsheetId,
        conferencesSheetUrl: sheetInfo.spreadsheetUrl
      })

      return sheetInfo
    } catch (error) {
      console.error('❌ Failed to create Conferences Sheet:', error)
      throw error
    }
  }

  // Save conferences data from sheet to dynasty
  const saveConferences = async (dynastyId, conferencesSheetId) => {
    if (!user) {
      throw new Error('You must be signed in to sync conferences')
    }

    let dynasty = currentDynasty?.id === dynastyId ? currentDynasty : dynasties.find(d => d.id === dynastyId)

    if (!dynasty) {
      throw new Error('Dynasty not found')
    }

    try {
      // Read conferences from Google Sheet
      const conferences = await readConferencesFromSheet(conferencesSheetId)

      // Save to dynasty
      const isDev = import.meta.env.VITE_DEV_MODE === 'true'

      if (isDev || !user) {
        // Dev mode: Use localStorage with spread operator
        const currentData = localStorage.getItem('cfb-dynasties')
        const currentDynasties = currentData ? JSON.parse(currentData) : []
        const dynastyToUpdate = currentDynasties.find(d => d.id === dynastyId)
        if (dynastyToUpdate) {
          dynastyToUpdate.customConferences = conferences
          dynastyToUpdate.preseasonSetup = {
            ...dynastyToUpdate.preseasonSetup,
            conferencesEntered: true
          }
          dynastyToUpdate.lastModified = Date.now()
          localStorage.setItem('cfb-dynasties', JSON.stringify(currentDynasties))
          setDynasties(currentDynasties)
          if (currentDynasty?.id === dynastyId) {
            setCurrentDynasty(dynastyToUpdate)
          }
        }
      } else {
        // Production mode: Use Firestore dot notation
        await updateDynastyInFirestore(dynastyId, {
          customConferences: conferences,
          'preseasonSetup.conferencesEntered': true,
          lastModified: Date.now()
        })
      }

      return conferences
    } catch (error) {
      console.error('Error saving conferences:', error)
      throw error
    }
  }

  const exportDynasty = (dynastyId) => {

    // Find the dynasty to export
    const dynasty = dynasties.find(d => String(d.id) === String(dynastyId))

    if (!dynasty) {
      console.error('Dynasty not found:', dynastyId)
      throw new Error('Dynasty not found')
    }

    // Convert to JSON string with pretty formatting
    const jsonString = JSON.stringify(dynasty, null, 2)

    // Create a blob and download link
    const blob = new Blob([jsonString], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    // Get team abbreviation
    const teamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName.replace(/\s+/g, '')

    // Format phase for filename
    const phaseNames = {
      'preseason': 'Preseason',
      'regular_season': 'Week' + dynasty.currentWeek,
      'conference_championship': 'ConfChamp',
      'postseason': 'Bowl' + dynasty.currentWeek,
      'offseason': 'Offseason' + dynasty.currentWeek
    }
    const phasePart = phaseNames[dynasty.currentPhase] || dynasty.currentPhase

    // Create filename with team, year, and phase
    const filename = `${teamAbbr}_${dynasty.currentYear}_${phasePart}.json`

    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

  }

  /**
   * Import a dynasty from a JSON file
   * @param {File} jsonFile - The JSON file to import
   * @param {Function} onProgress - Optional callback for progress updates
   *   Called with: { stage: string, message: string, progress: number (0-100), detail?: string }
   *   Stages: 'parsing', 'creating', 'players', 'games', 'complete'
   */
  const importDynasty = async (jsonFile, onProgress = null) => {

    const reportProgress = (stage, message, progress, detail = null) => {
      if (onProgress) {
        onProgress({ stage, message, progress, detail })
      }
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.onload = async (e) => {
        try {
          // Stage 1: Parse the JSON file
          reportProgress('parsing', 'Reading file...', 5)
          const dynastyData = JSON.parse(e.target.result)
          reportProgress('parsing', 'File parsed successfully', 10)

          // Remove fields that would link this to the original dynasty
          // This ensures the imported dynasty is a completely separate entity
          const {
            id: oldId,
            userId: oldUserId,
            lastModified: oldLastModified,
            createdAt: oldCreatedAt,
            shareCode: oldShareCode,
            isPublic: oldIsPublic,
            googleSheetsByTeam: oldGoogleSheets,
            ...cleanDynastyData
          } = dynastyData

          // Set timestamps to now (import time, not old export time)
          const now = Date.now()
          cleanDynastyData.lastModified = now
          cleanDynastyData.createdAt = now

          // Ensure the imported dynasty starts as private with no share code
          cleanDynastyData.isPublic = false

          // Save the dynasty using createDynasty logic
          const isDev = import.meta.env.VITE_DEV_MODE === 'true'

          if (isDev || !user) {
            // Dev mode: localStorage - needs an ID
            reportProgress('creating', 'Creating dynasty...', 20)
            const newId = Date.now().toString()
            const importedDynasty = {
              ...cleanDynastyData,
              id: newId
            }
            const currentData = localStorage.getItem('cfb-dynasties')
            const currentDynasties = currentData ? JSON.parse(currentData) : []
            const updatedDynasties = [...currentDynasties, importedDynasty]
            localStorage.setItem('cfb-dynasties', JSON.stringify(updatedDynasties))
            setDynasties(updatedDynasties)
            reportProgress('complete', 'Import complete!', 100)
          } else {
            // Production mode: Firestore - use subcollections for players and games
            // This avoids the 1MB document size limit

            // Extract players and games for subcollections
            const { players, games, ...mainDocData } = cleanDynastyData
            const playerCount = players?.length || 0
            const gameCount = games?.length || 0

            // Mark as using subcollections
            mainDocData._subcollectionsMigrated = true

            // Stage 2: Create the main dynasty document (without players/games)
            reportProgress('creating', 'Creating dynasty record...', 15)
            const result = await createDynastyInFirestore(user.uid, mainDocData)
            reportProgress('creating', 'Dynasty record created', 20)

            // Stage 3: Save players to subcollection if there are any
            if (playerCount > 0) {
              reportProgress('players', `Importing players (0/${playerCount})...`, 25)

              // Import players in batches and report progress
              const BATCH_SIZE = 500
              for (let i = 0; i < playerCount; i += BATCH_SIZE) {
                const batchPlayers = players.slice(i, i + BATCH_SIZE)
                const batchEnd = Math.min(i + BATCH_SIZE, playerCount)

                // Save this batch
                await savePlayersToSubcollection(result.id, players.slice(0, batchEnd))

                // Calculate progress (players are 25-60% of total)
                const playerProgress = 25 + Math.round((batchEnd / playerCount) * 35)
                reportProgress('players', `Importing players (${batchEnd}/${playerCount})...`, playerProgress, `${batchEnd} of ${playerCount} players`)
              }
            }

            // Stage 4: Save games to subcollection if there are any
            if (gameCount > 0) {
              reportProgress('games', `Importing games (0/${gameCount})...`, 65)

              // Import games in batches and report progress
              const BATCH_SIZE = 500
              for (let i = 0; i < gameCount; i += BATCH_SIZE) {
                const batchEnd = Math.min(i + BATCH_SIZE, gameCount)

                // Save this batch
                await saveGamesToSubcollection(result.id, games.slice(0, batchEnd))

                // Calculate progress (games are 65-95% of total)
                const gameProgress = 65 + Math.round((batchEnd / gameCount) * 30)
                reportProgress('games', `Importing games (${batchEnd}/${gameCount})...`, gameProgress, `${batchEnd} of ${gameCount} games`)
              }
            }

            // For local state, include players and games
            cleanDynastyData._subcollectionsMigrated = true
            reportProgress('complete', 'Import complete!', 100)
          }

          resolve(cleanDynastyData)
        } catch (error) {
          console.error('Error importing dynasty:', error)
          // Return the actual error message for better debugging
          reject(new Error(error.message || 'Invalid JSON file or corrupted dynasty data'))
        }
      }

      reader.onerror = () => {
        reject(new Error('Error reading file'))
      }

      reader.readAsText(jsonFile)
    })
  }

  /**
   * Process honor entries (awards, all-americans, all-conference) and link to existing players or create new ones.
   *
   * @param {string} dynastyId
   * @param {string} honorType - 'awards', 'allAmericans', or 'allConference'
   * @param {Array} entries - Array of honor entries
   * @param {number} year - Year of the honors
   * @param {Array} transferDecisions - Array of { entryIndex, isSamePlayer } for resolved transfer confirmations
   * @returns {Object} { success, needsConfirmation, confirmations, message }
   */
  const processHonorPlayers = async (dynastyId, honorType, entries, year, transferDecisions = []) => {
    const isDev = import.meta.env.VITE_DEV_MODE === 'true'
    let dynasty

    if (isDev || !user) {
      const currentData = localStorage.getItem('cfb-dynasties')
      const currentDynasties = currentData ? JSON.parse(currentData) : dynasties
      dynasty = currentDynasties.find(d => String(d.id) === String(dynastyId))
    } else {
      dynasty = String(currentDynasty?.id) === String(dynastyId)
        ? currentDynasty
        : dynasties.find(d => String(d.id) === String(dynastyId))
    }

    if (!dynasty) {
      return { success: false, message: 'Dynasty not found' }
    }

    const existingPlayers = [...(dynasty.players || [])]
    let nextPID = dynasty.nextPID || (existingPlayers.length + 1)

    // Track which entries need confirmation
    const confirmations = []

    // Track updates to make
    const playersToUpdate = [] // { pid, updates }
    const playersToCreate = [] // New player objects

    // Create a map of transfer decisions by entry index
    const decisionMap = {}
    transferDecisions.forEach(d => {
      decisionMap[d.entryIndex] = d.isSamePlayer
    })

    // Process each entry
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]

      // Skip entries without a name
      if (!entry.player && !entry.name) continue

      const playerName = entry.player || entry.name
      // For allAmericans/allConference, school is the team; entry.team is the category label
      const playerTeam = (entry.school || entry.team || '').toUpperCase()
      const playerPosition = entry.position || ''

      // Find matching player
      const match = findMatchingPlayer(playerName, playerTeam, year, existingPlayers)

      if (match.matchType === 'exact') {
        // Auto-link to existing player
        playersToUpdate.push({
          pid: match.player.pid,
          honorType,
          entry: { ...entry, year },
          addTeam: playerTeam
        })
      } else if (match.matchType === 'transfer') {
        // Check if we have a decision for this entry
        if (decisionMap[i] !== undefined) {
          if (decisionMap[i]) {
            // User confirmed same player - link to existing
            playersToUpdate.push({
              pid: match.player.pid,
              honorType,
              entry: { ...entry, year },
              addTeam: playerTeam
            })
          } else {
            // User said different player - create new
            playersToCreate.push({
              name: playerName,
              position: playerPosition,
              team: playerTeam,
              honorType,
              entry: { ...entry, year }
            })
          }
        } else {
          // Need confirmation from user
          const lastHonor = getPlayerLastHonorDescription(match.player)
          confirmations.push({
            entryIndex: i,
            entry: { ...entry, year, honorType: getHonorDescription(honorType, entry) },
            player: match.player,
            existingTeams: match.existingTeams,
            existingYears: match.existingYears,
            lastHonor
          })
        }
      } else {
        // No match - create new player
        playersToCreate.push({
          name: playerName,
          position: playerPosition,
          team: playerTeam,
          honorType,
          entry: { ...entry, year }
        })
      }
    }

    // If there are confirmations needed, return them
    if (confirmations.length > 0) {
      return {
        success: false,
        needsConfirmation: true,
        confirmations,
        message: `${confirmations.length} player(s) may be transfers and need confirmation`
      }
    }

    // Apply updates to existing players
    // Use filter instead of find to get ALL updates for each player (e.g., multiple awards)
    let updatedPlayers = existingPlayers.map(p => {
      const updates = playersToUpdate.filter(u => u.pid === p.pid)
      if (updates.length === 0) return p

      const updatedPlayer = { ...p }

      // Initialize arrays if needed
      if (!updatedPlayer.awards) updatedPlayer.awards = []
      if (!updatedPlayer.allAmericans) updatedPlayer.allAmericans = []
      if (!updatedPlayer.allConference) updatedPlayer.allConference = []
      if (!updatedPlayer.teams) updatedPlayer.teams = []

      // Process each update for this player
      for (const update of updates) {
        // Add team if not already present
        if (update.addTeam && !updatedPlayer.teams.includes(update.addTeam)) {
          updatedPlayer.teams.push(update.addTeam)
        }

        // Add honor entry based on type
        if (update.honorType === 'awards') {
          // Check for duplicate
          const isDupe = updatedPlayer.awards.some(a =>
            a.year === update.entry.year && a.award === update.entry.award
          )
          if (!isDupe) {
            updatedPlayer.awards.push({
              year: update.entry.year,
              award: update.entry.award || update.entry.awardKey,
              team: update.entry.team,
              position: update.entry.position,
              class: update.entry.class
            })
          }
        } else if (update.honorType === 'allAmericans') {
          const isDupe = updatedPlayer.allAmericans.some(a =>
            a.year === update.entry.year &&
            a.designation === update.entry.designation &&
            a.position === update.entry.position
          )
          if (!isDupe) {
            updatedPlayer.allAmericans.push({
              year: update.entry.year,
              designation: update.entry.designation,
              position: update.entry.position,
              school: update.entry.school,
              class: update.entry.class
            })
          }
        } else if (update.honorType === 'allConference') {
          const isDupe = updatedPlayer.allConference.some(a =>
            a.year === update.entry.year &&
            a.designation === update.entry.designation &&
            a.position === update.entry.position
          )
          if (!isDupe) {
            updatedPlayer.allConference.push({
              year: update.entry.year,
              designation: update.entry.designation,
              position: update.entry.position,
              school: update.entry.school,
              class: update.entry.class
            })
          }
        }
      }

      return updatedPlayer
    })

    // Create new players
    for (const newPlayer of playersToCreate) {
      // Get the year from the entry for teamsByYear
      const entryYear = newPlayer.entry?.year || dynasty.currentYear
      const player = {
        pid: nextPID,
        id: `player-${nextPID}`,
        name: newPlayer.name,
        position: newPlayer.position,
        team: newPlayer.team,
        teams: [newPlayer.team],
        isHonorOnly: true, // Not a user's roster player
        // IMMUTABLE roster history - record which team they were on for this award year
        teamsByYear: { [entryYear]: newPlayer.team },
        awards: [],
        allAmericans: [],
        allConference: []
      }

      // Add the honor entry
      if (newPlayer.honorType === 'awards') {
        player.awards.push({
          year: newPlayer.entry.year,
          award: newPlayer.entry.award || newPlayer.entry.awardKey,
          team: newPlayer.entry.team,
          position: newPlayer.entry.position,
          class: newPlayer.entry.class
        })
      } else if (newPlayer.honorType === 'allAmericans') {
        player.allAmericans.push({
          year: newPlayer.entry.year,
          designation: newPlayer.entry.designation,
          position: newPlayer.entry.position,
          school: newPlayer.entry.school,
          class: newPlayer.entry.class
        })
      } else if (newPlayer.honorType === 'allConference') {
        player.allConference.push({
          year: newPlayer.entry.year,
          designation: newPlayer.entry.designation,
          position: newPlayer.entry.position,
          school: newPlayer.entry.school,
          class: newPlayer.entry.class
        })
      }

      updatedPlayers.push(player)
      nextPID++
    }

    // Save updated players
    await updateDynasty(dynastyId, {
      players: updatedPlayers,
      nextPID
    })

    return {
      success: true,
      needsConfirmation: false,
      message: `Processed ${playersToUpdate.length} existing players and created ${playersToCreate.length} new players`
    }
  }

  // Helper to get honor description for confirmation modal
  const getHonorDescription = (honorType, entry) => {
    if (honorType === 'awards') {
      return entry.award || 'Award'
    } else if (honorType === 'allAmericans') {
      const designation = entry.designation === 'first' ? '1st Team' :
                          entry.designation === 'second' ? '2nd Team' : 'Freshman'
      return `${designation} All-American`
    } else if (honorType === 'allConference') {
      const designation = entry.designation === 'first' ? '1st Team' :
                          entry.designation === 'second' ? '2nd Team' : 'Freshman'
      return `${designation} All-Conference`
    }
    return 'Honor'
  }

  /**
   * Clean up roster data - fixes players who incorrectly have teamsByYear entries
   * after they should have left, and ensures recruits are properly set up.
   */
  const cleanupRosterData = async (dynastyId) => {
    const dynasty = dynasties.find(d => d.id === dynastyId)
    if (!dynasty) return { success: false, message: 'Dynasty not found' }

    const currentYear = dynasty.currentYear
    const teamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName
    const players = [...(dynasty.players || [])]
    let fixedCount = 0
    let recruitFixedCount = 0

    const updatedPlayers = players.map(player => {
      if (player.isHonorOnly) return player

      let modified = false
      let updatedTeamsByYear = { ...(player.teamsByYear || {}) }

      // Check for departure movements - player should not have teamsByYear entries AFTER their departure year
      const departureMovements = (player.movements || []).filter(m =>
        (m.type === 'departure' || m.type === 'transfer' || m.type === 'entered_portal') &&
        m.from === teamAbbr
      )

      if (departureMovements.length > 0 && !player.isRecruit) {
        // Find the earliest departure year from this team
        const departureYears = departureMovements.map(m => Number(m.year)).filter(y => !isNaN(y))
        if (departureYears.length > 0) {
          const earliestDeparture = Math.min(...departureYears)

          // Check if player has a recommit after their departure (they came back)
          const recommitMovements = (player.movements || []).filter(m =>
            m.type === 'recommit' && m.to === teamAbbr && Number(m.year) >= earliestDeparture
          )

          // If no recommit, remove all teamsByYear entries after the departure year
          if (recommitMovements.length === 0) {
            Object.keys(updatedTeamsByYear).forEach(yearKey => {
              const year = Number(yearKey)
              if (year > earliestDeparture && updatedTeamsByYear[yearKey] === teamAbbr) {
                delete updatedTeamsByYear[yearKey]
                modified = true
              }
            })
          }
        }
      }

      // Fix recruits - ensure they have teamsByYear for their enrollment year
      // Also clear isRecruit if they should already be on the roster (enrollment year <= current year)
      let updatedIsRecruit = player.isRecruit
      let updatedClassByYear = { ...(player.classByYear || {}) }
      if (player.isRecruit && player.recruitYear) {
        const enrollmentYear = Number(player.recruitYear) + 1

        // Ensure teamsByYear has enrollment year
        if (!updatedTeamsByYear[enrollmentYear] && !updatedTeamsByYear[String(enrollmentYear)]) {
          updatedTeamsByYear[enrollmentYear] = player.team || teamAbbr
          modified = true
          recruitFixedCount++
        }

        // Ensure classByYear has enrollment year
        if (!updatedClassByYear[enrollmentYear] && !updatedClassByYear[String(enrollmentYear)] && player.year) {
          updatedClassByYear[enrollmentYear] = player.year
          modified = true
        }

        // Clear isRecruit if they should already be active (enrollment year has passed)
        if (enrollmentYear <= currentYear) {
          updatedIsRecruit = false
          modified = true
        }
      }

      // Fix 3: Fill gaps in teamsByYear for continuing players
      // If player has entries for years N and N+2 on the same team but is missing N+1, fill it in
      if (!player.isRecruit) {
        const teamYears = Object.entries(updatedTeamsByYear)
          .filter(([, team]) => team === teamAbbr)
          .map(([year]) => Number(year))
          .filter(y => !isNaN(y))
          .sort((a, b) => a - b)

        if (teamYears.length >= 2) {
          const minYear = teamYears[0]
          const maxYear = teamYears[teamYears.length - 1]

          // Check if player departed after maxYear (don't fill beyond departure)
          const hasActiveDeparture = departureMovements.some(m => {
            const depYear = Number(m.year)
            // Check for recommit after this departure
            const hasRecommitAfter = (player.movements || []).some(r =>
              r.type === 'recommit' && r.to === teamAbbr && Number(r.year) >= depYear
            )
            return depYear >= maxYear && !hasRecommitAfter
          })

          // Fill gaps between min and max year (or current year if no departure)
          const fillUpToYear = hasActiveDeparture ? maxYear : Math.min(maxYear, currentYear)
          for (let year = minYear; year <= fillUpToYear; year++) {
            if (!updatedTeamsByYear[year] && !updatedTeamsByYear[String(year)]) {
              updatedTeamsByYear[year] = teamAbbr
              modified = true
            }
            // Also fill classByYear gaps by inferring from surrounding years
            if (!updatedClassByYear[year] && !updatedClassByYear[String(year)]) {
              // Try to infer class from previous or next year
              const prevYearClass = updatedClassByYear[year - 1] || updatedClassByYear[String(year - 1)]
              const nextYearClass = updatedClassByYear[year + 1] || updatedClassByYear[String(year + 1)]
              if (prevYearClass) {
                // Progress from previous year
                const CLASS_PROGRESSION = {
                  'Fr': 'So', 'So': 'Jr', 'Jr': 'Sr', 'Sr': 'RS Sr',
                  'RS Fr': 'RS So', 'RS So': 'RS Jr', 'RS Jr': 'RS Sr', 'RS Sr': 'RS Sr'
                }
                updatedClassByYear[year] = CLASS_PROGRESSION[prevYearClass] || prevYearClass
                modified = true
              } else if (nextYearClass) {
                // Regress from next year
                const CLASS_REGRESSION = {
                  'So': 'Fr', 'Jr': 'So', 'Sr': 'Jr',
                  'RS So': 'RS Fr', 'RS Jr': 'RS So', 'RS Sr': 'RS Jr'
                }
                updatedClassByYear[year] = CLASS_REGRESSION[nextYearClass] || nextYearClass
                modified = true
              }
            }
          }
        } else if (teamYears.length === 1) {
          // Fix 4: Player has only one year entry - fill up to current year if no departure
          const onlyYear = teamYears[0]
          const hasDeparture = departureMovements.some(m => Number(m.year) >= onlyYear)

          if (!hasDeparture && onlyYear < currentYear) {
            // Fill years from onlyYear to currentYear
            for (let year = onlyYear; year <= currentYear; year++) {
              if (!updatedTeamsByYear[year] && !updatedTeamsByYear[String(year)]) {
                updatedTeamsByYear[year] = teamAbbr
                modified = true
              }
              // Also fill classByYear gaps
              if (!updatedClassByYear[year] && !updatedClassByYear[String(year)]) {
                const prevYearClass = updatedClassByYear[year - 1] || updatedClassByYear[String(year - 1)]
                if (prevYearClass) {
                  const CLASS_PROGRESSION = {
                    'Fr': 'So', 'So': 'Jr', 'Jr': 'Sr', 'Sr': 'RS Sr',
                    'RS Fr': 'RS So', 'RS So': 'RS Jr', 'RS Jr': 'RS Sr', 'RS Sr': 'RS Sr'
                  }
                  updatedClassByYear[year] = CLASS_PROGRESSION[prevYearClass] || prevYearClass
                  modified = true
                }
              }
            }
          }
        }
      }

      if (modified) {
        fixedCount++
        return {
          ...player,
          teamsByYear: updatedTeamsByYear,
          classByYear: updatedClassByYear,
          isRecruit: updatedIsRecruit
        }
      }
      return player
    })

    if (fixedCount > 0 || recruitFixedCount > 0) {
      await updateDynasty(dynastyId, { players: updatedPlayers })
      return {
        success: true,
        message: `Fixed ${fixedCount} player(s) with incorrect roster entries, ${recruitFixedCount} recruit(s) with missing team entries`
      }
    }

    return { success: true, message: 'No roster issues found' }
  }

  // Emergency cleanup to remove incorrectly added current year entries
  // This removes teamsByYear[currentYear] for players who don't have the previous year
  const removeOrphanedRosterEntries = async (dynastyId) => {
    const dynasty = dynasties.find(d => d.id === dynastyId)
    if (!dynasty) return { success: false, message: 'Dynasty not found' }

    const currentYear = dynasty.currentYear
    const previousYear = currentYear - 1
    const teamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName
    const players = [...(dynasty.players || [])]
    let removedCount = 0

    const updatedPlayers = players.map(player => {
      if (player.isHonorOnly) return player

      const teamsByYear = player.teamsByYear || {}
      const hasCurrentYear = teamsByYear[currentYear] === teamAbbr || teamsByYear[String(currentYear)] === teamAbbr
      const hasPreviousYear = teamsByYear[previousYear] === teamAbbr || teamsByYear[String(previousYear)] === teamAbbr

      // If player has current year but NOT previous year, remove current year
      // (Exception: recruits who just enrolled)
      if (hasCurrentYear && !hasPreviousYear && !player.isRecruit) {
        const updatedTeamsByYear = { ...teamsByYear }
        delete updatedTeamsByYear[currentYear]
        delete updatedTeamsByYear[String(currentYear)]

        // Also remove classByYear for current year if it exists
        const updatedClassByYear = { ...(player.classByYear || {}) }
        delete updatedClassByYear[currentYear]
        delete updatedClassByYear[String(currentYear)]

        removedCount++
        return {
          ...player,
          teamsByYear: updatedTeamsByYear,
          classByYear: updatedClassByYear
        }
      }
      return player
    })

    if (removedCount > 0) {
      await updateDynasty(dynastyId, { players: updatedPlayers })
      return {
        success: true,
        message: `Removed ${removedCount} orphaned roster entries for year ${currentYear}`
      }
    }

    return { success: true, message: 'No orphaned entries found' }
  }

  // Comprehensive migration: Fill ALL gaps in teamsByYear and classByYear for all players
  // This ensures every player has complete consecutive year data
  const migratePlayerCareerData = async (dynastyId) => {
    const dynasty = dynasties.find(d => d.id === dynastyId)
    if (!dynasty) return { success: false, message: 'Dynasty not found' }

    const currentYear = dynasty.currentYear
    const players = [...(dynasty.players || [])]
    let migratedCount = 0
    let totalFixes = 0

    // Class progression mapping
    const CLASS_PROGRESSION = {
      'Fr': 'So', 'So': 'Jr', 'Jr': 'Sr', 'Sr': 'RS Sr',
      'RS Fr': 'RS So', 'RS So': 'RS Jr', 'RS Jr': 'RS Sr', 'RS Sr': 'RS Sr',
      'HS': 'Fr', 'JUCO Fr': 'Fr', 'JUCO So': 'So', 'JUCO Jr': 'Jr', 'JUCO Sr': 'Sr'
    }

    const updatedPlayers = players.map(player => {
      if (player.isHonorOnly) return player

      let modified = false
      const teamsByYear = { ...(player.teamsByYear || {}) }
      const classByYear = { ...(player.classByYear || {}) }

      // Get all years from both objects
      const allYearKeys = [...new Set([
        ...Object.keys(teamsByYear),
        ...Object.keys(classByYear)
      ])].map(y => parseInt(y)).filter(y => !isNaN(y))

      if (allYearKeys.length === 0) return player

      const minYear = Math.min(...allYearKeys)
      const maxYear = Math.max(...allYearKeys)

      // Check if player has a departure - if so, don't extend past departure year
      const departureMovement = (player.movements || []).find(m => m.type === 'departure')
      const departureYear = departureMovement ? parseInt(departureMovement.year) : null
      const finalYear = departureYear || Math.min(maxYear, currentYear)

      // Build complete year range
      for (let year = minYear; year <= finalYear; year++) {
        const yearKey = String(year)
        const hasTeam = teamsByYear[year] || teamsByYear[yearKey]
        const hasClass = classByYear[year] || classByYear[yearKey]

        // Fill team if missing
        if (!hasTeam) {
          // Look for the most recent team before this year
          let inferredTeam = null
          for (let prevYear = year - 1; prevYear >= minYear; prevYear--) {
            const prevTeam = teamsByYear[prevYear] || teamsByYear[String(prevYear)]
            if (prevTeam) {
              inferredTeam = prevTeam
              break
            }
          }
          // Or look for the next team after this year
          if (!inferredTeam) {
            for (let nextYear = year + 1; nextYear <= finalYear; nextYear++) {
              const nextTeam = teamsByYear[nextYear] || teamsByYear[String(nextYear)]
              if (nextTeam) {
                inferredTeam = nextTeam
                break
              }
            }
          }
          // Or use player.team as fallback
          if (!inferredTeam) {
            inferredTeam = player.team || ''
          }

          if (inferredTeam) {
            teamsByYear[yearKey] = inferredTeam
            modified = true
            totalFixes++
          }
        }

        // Fill class if missing
        if (!hasClass) {
          // Try to infer from previous year
          const prevYearClass = classByYear[year - 1] || classByYear[String(year - 1)]
          if (prevYearClass) {
            classByYear[yearKey] = CLASS_PROGRESSION[prevYearClass] || prevYearClass
            modified = true
            totalFixes++
          } else {
            // Try to infer from next year (regress)
            const nextYearClass = classByYear[year + 1] || classByYear[String(year + 1)]
            if (nextYearClass) {
              const CLASS_REGRESSION = {
                'So': 'Fr', 'Jr': 'So', 'Sr': 'Jr',
                'RS So': 'RS Fr', 'RS Jr': 'RS So', 'RS Sr': 'RS Jr'
              }
              classByYear[yearKey] = CLASS_REGRESSION[nextYearClass] || nextYearClass
              modified = true
              totalFixes++
            } else if (player.year) {
              // Use current class as fallback
              classByYear[yearKey] = player.year
              modified = true
              totalFixes++
            }
          }
        }
      }

      if (modified) {
        migratedCount++
        return {
          ...player,
          teamsByYear,
          classByYear
        }
      }
      return player
    })

    if (migratedCount > 0) {
      await updateDynasty(dynastyId, { players: updatedPlayers })
      return {
        success: true,
        message: `Migrated ${migratedCount} player(s), filled ${totalFixes} missing entries`
      }
    }

    return { success: true, message: 'All player data is complete - no migration needed' }
  }

  // Fix transferred players: Remove incorrect current-year entries for players who transferred away
  // Also handles graduating seniors by not adding entries past senior year
  const fixTransferredPlayers = async (dynastyId) => {
    const dynasty = dynasties.find(d => d.id === dynastyId)
    if (!dynasty) return { success: false, message: 'Dynasty not found' }

    const currentYear = dynasty.currentYear
    const currentTeamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName
    const players = [...(dynasty.players || [])]
    let fixedCount = 0
    const fixedPlayers = []

    // Senior classes - these players shouldn't have entries after their senior year
    const SENIOR_CLASSES = ['Sr', 'RS Sr']

    const updatedPlayers = players.map(player => {
      const teamsByYear = { ...(player.teamsByYear || {}) }
      const classByYear = { ...(player.classByYear || {}) }
      let modified = false

      // Get years sorted chronologically
      const years = Object.keys(teamsByYear)
        .map(y => parseInt(y))
        .filter(y => !isNaN(y))
        .sort((a, b) => a - b)

      if (years.length < 2) return player

      // Find the most recent year BEFORE current year where they had a team entry
      const prevYears = years.filter(y => y < currentYear)
      if (prevYears.length === 0) return player

      const mostRecentPrevYear = Math.max(...prevYears)
      const mostRecentPrevTeam = teamsByYear[mostRecentPrevYear] || teamsByYear[String(mostRecentPrevYear)]
      const mostRecentPrevClass = classByYear[mostRecentPrevYear] || classByYear[String(mostRecentPrevYear)]
      const currentYearTeam = teamsByYear[currentYear] || teamsByYear[String(currentYear)]

      // Check 1: If player was a senior in their most recent year, they graduated - remove current year entry
      if (mostRecentPrevClass && SENIOR_CLASSES.includes(mostRecentPrevClass)) {
        if (currentYearTeam) {
          delete teamsByYear[currentYear]
          delete teamsByYear[String(currentYear)]
          delete classByYear[currentYear]
          delete classByYear[String(currentYear)]
          modified = true
          fixedPlayers.push(`${player.name}: Graduated (was ${mostRecentPrevClass} in ${mostRecentPrevYear})`)
        }
      }
      // Check 2: If player transferred AWAY from current team, and now shows back on current team,
      // that's likely an error - should stay at their transfer destination
      // BUT: If player has a "recommit" movement, they intentionally came back - don't fix
      else if (mostRecentPrevTeam && mostRecentPrevTeam !== currentTeamAbbr && currentYearTeam === currentTeamAbbr) {
        // Check if player has any indication they recommitted (came back intentionally)
        const movements = player.movements || []
        const movementsByYear = player.movementsByYear || {}
        const hasRecommit = movements.some(m =>
          m.type === 'recommit' ||
          m.type === 'portal_in' ||
          (m.to === currentTeamAbbr && m.year >= mostRecentPrevYear)
        )
        const hasRecommitMovement = Object.values(movementsByYear).some(m =>
          m === 'Recommitted' || m === 'Transferred'
        )

        // Also check if they were originally from this team (came back home)
        const wasOriginallyOnTeam = Object.values(teamsByYear).filter(t => t === currentTeamAbbr).length > 1

        if (hasRecommit || hasRecommitMovement || wasOriginallyOnTeam) {
          // Player intentionally came back - don't fix
          // But let's note this for logging
          fixedPlayers.push(`${player.name}: Kept on ${currentTeamAbbr} (recommit detected)`)
        } else {
          // This player was at another team last year but now shows as being on our team
          // No recommit detected, so this is probably wrong
          // Change their current year to match their most recent team
          teamsByYear[String(currentYear)] = mostRecentPrevTeam
          // Progress their class
          const CLASS_PROGRESSION = {
            'Fr': 'So', 'So': 'Jr', 'Jr': 'Sr', 'Sr': 'RS Sr',
            'RS Fr': 'RS So', 'RS So': 'RS Jr', 'RS Jr': 'RS Sr', 'RS Sr': 'RS Sr'
          }
          if (mostRecentPrevClass && CLASS_PROGRESSION[mostRecentPrevClass]) {
            classByYear[String(currentYear)] = CLASS_PROGRESSION[mostRecentPrevClass]
          }
          modified = true
          fixedPlayers.push(`${player.name}: Stayed at ${mostRecentPrevTeam} (was incorrectly on ${currentTeamAbbr})`)
        }
      }

      if (modified) {
        fixedCount++
        return { ...player, teamsByYear, classByYear }
      }
      return player
    })

    if (fixedCount > 0) {
      await updateDynasty(dynastyId, { players: updatedPlayers })
      console.log('Fixed players:', fixedPlayers)
      return {
        success: true,
        message: `Fixed ${fixedCount} player(s): ${fixedPlayers.slice(0, 5).join(', ')}${fixedPlayers.length > 5 ? ` and ${fixedPlayers.length - 5} more` : ''}`
      }
    }

    return { success: true, message: 'No transferred players needed fixing' }
  }

  // Analyze and optimize dynasty document size
  const analyzeDocumentSize = (dynastyId) => {
    const dynasty = dynasties.find(d => d.id === dynastyId)
    if (!dynasty) return { success: false, message: 'Dynasty not found' }

    // Estimate size of each section (rough JSON size estimate)
    const estimateSize = (obj) => {
      try {
        return new Blob([JSON.stringify(obj)]).size
      } catch {
        return 0
      }
    }

    const isMigrated = dynasty._subcollectionsMigrated === true

    // For migrated dynasties, players and games are in subcollections, not the main document
    // We still track their sizes for informational purposes
    const playersSize = estimateSize(dynasty.players || [])
    const gamesSize = estimateSize(dynasty.games || [])

    // Main document sections (always in main doc)
    const mainDocSections = {
      schedulesByTeamYear: estimateSize(dynasty.schedulesByTeamYear || {}),
      recruitingCommitmentsByTeamYear: estimateSize(dynasty.recruitingCommitmentsByTeamYear || {}),
      customConferencesByYear: estimateSize(dynasty.customConferencesByYear || {}),
      teamRatingsByTeamYear: estimateSize(dynasty.teamRatingsByTeamYear || {}),
      coachingStaffByTeamYear: estimateSize(dynasty.coachingStaffByTeamYear || {}),
      playersLeavingByYear: estimateSize(dynasty.playersLeavingByYear || {}),
      playersLeavingByTeamYear: estimateSize(dynasty.playersLeavingByTeamYear || {}),
      draftResultsByYear: estimateSize(dynasty.draftResultsByYear || {}),
      draftResultsByTeamYear: estimateSize(dynasty.draftResultsByTeamYear || {}),
      cfpResultsByYear: estimateSize(dynasty.cfpResultsByYear || {}),
      bowlResultsByYear: estimateSize(dynasty.bowlResultsByYear || {}),
      rankingsHistoryByYear: estimateSize(dynasty.rankingsHistoryByYear || {}),
      conferenceChampionshipDataByTeamYear: estimateSize(dynasty.conferenceChampionshipDataByTeamYear || {}),
      bowlEligibilityDataByTeamYear: estimateSize(dynasty.bowlEligibilityDataByTeamYear || {}),
      transferDestinationsByTeamYear: estimateSize(dynasty.transferDestinationsByTeamYear || {}),
      trainingResultsByTeamYear: estimateSize(dynasty.trainingResultsByTeamYear || {}),
      portalTransferClassByTeamYear: estimateSize(dynasty.portalTransferClassByTeamYear || {}),
      lockedCoachingStaffByTeamYear: estimateSize(dynasty.lockedCoachingStaffByTeamYear || {}),
      coachTeamByYear: estimateSize(dynasty.coachTeamByYear || {}),
      preseasonSetupByTeamYear: estimateSize(dynasty.preseasonSetupByTeamYear || {}),
      googleSheetsByTeam: estimateSize(dynasty.googleSheetsByTeam || {}),
    }

    // Calculate main document size
    const mainDocKnownSize = Object.values(mainDocSections).reduce((a, b) => a + b, 0)

    // For non-migrated dynasties, include players and games in main doc calculation
    let mainDocTotal
    if (isMigrated) {
      // Migrated: players and games are NOT in the main document
      // Estimate metadata overhead (dynasty name, currentYear, etc.)
      const metadataEstimate = 2000 // ~2KB for metadata fields
      mainDocTotal = mainDocKnownSize + metadataEstimate
    } else {
      // Not migrated: everything is in the main document
      mainDocTotal = mainDocKnownSize + playersSize + gamesSize + 2000
    }

    const analysis = {
      isMigrated,
      // Main document info
      mainDocTotal,
      mainDocTotalKB: (mainDocTotal / 1024).toFixed(1),
      mainDocPercentUsed: ((mainDocTotal / (1024 * 1024)) * 100).toFixed(1),
      mainDocSections,
      // Subcollection info (for migrated dynasties, this is separate storage)
      subcollections: {
        players: {
          size: playersSize,
          sizeKB: (playersSize / 1024).toFixed(1),
          count: (dynasty.players || []).length
        },
        games: {
          size: gamesSize,
          sizeKB: (gamesSize / 1024).toFixed(1),
          count: (dynasty.games || []).length,
          withBoxScores: (dynasty.games || []).filter(g => g.boxScore).length
        }
      },
      // Legacy format for backwards compatibility with UI
      total: isMigrated ? mainDocTotal : (mainDocTotal + playersSize + gamesSize),
      totalKB: isMigrated ? (mainDocTotal / 1024).toFixed(1) : ((mainDocTotal + playersSize + gamesSize) / 1024).toFixed(1),
      limitKB: 1024,
      percentUsed: isMigrated ? ((mainDocTotal / (1024 * 1024)) * 100).toFixed(1) : (((mainDocTotal + playersSize + gamesSize) / (1024 * 1024)) * 100).toFixed(1),
      sections: isMigrated ? mainDocSections : { ...mainDocSections, players: playersSize, games: gamesSize },
      counts: {
        players: (dynasty.players || []).length,
        games: (dynasty.games || []).length,
        gamesWithBoxScores: (dynasty.games || []).filter(g => g.boxScore).length
      }
    }

    // Calculate 'other' for non-migrated
    if (!isMigrated) {
      const knownSize = Object.values(analysis.sections).reduce((a, b) => a + b, 0)
      analysis.sections.other = Math.max(0, analysis.total - knownSize)
    }

    return { success: true, analysis }
  }

  // Optimize dynasty document by removing unnecessary data
  const optimizeDocumentSize = async (dynastyId, options = {}) => {
    const dynasty = dynasties.find(d => d.id === dynastyId)
    if (!dynasty) return { success: false, message: 'Dynasty not found' }

    let cleanedItems = []
    let savedBytes = 0
    const updates = {}

    // 1. Clean up players - remove empty/null fields and redundant data
    if (options.cleanPlayers !== false) {
      const players = dynasty.players || []
      const cleanedPlayers = players.map(player => {
        const cleaned = { ...player }

        // Remove empty arrays
        if (Array.isArray(cleaned.movements) && cleaned.movements.length === 0) {
          delete cleaned.movements
        }

        // Remove null/undefined/empty string fields
        Object.keys(cleaned).forEach(key => {
          if (cleaned[key] === null || cleaned[key] === undefined || cleaned[key] === '') {
            delete cleaned[key]
          }
        })

        // Remove redundant statsByYear entries with all zeros
        if (cleaned.statsByYear) {
          Object.keys(cleaned.statsByYear).forEach(year => {
            const stats = cleaned.statsByYear[year]
            if (stats) {
              // Remove empty sub-objects
              Object.keys(stats).forEach(statKey => {
                const statObj = stats[statKey]
                if (typeof statObj === 'object' && statObj !== null) {
                  const hasNonZero = Object.values(statObj).some(v => v && v !== 0)
                  if (!hasNonZero) {
                    delete stats[statKey]
                  }
                }
              })
              // If only gamesPlayed and snapsPlayed remain and both are 0, remove the year
              const remainingKeys = Object.keys(stats)
              if (remainingKeys.length <= 2 &&
                  (!stats.gamesPlayed || stats.gamesPlayed === 0) &&
                  (!stats.snapsPlayed || stats.snapsPlayed === 0)) {
                delete cleaned.statsByYear[year]
              }
            }
          })
          if (Object.keys(cleaned.statsByYear).length === 0) {
            delete cleaned.statsByYear
          }
        }

        return cleaned
      })

      const originalSize = new Blob([JSON.stringify(players)]).size
      const newSize = new Blob([JSON.stringify(cleanedPlayers)]).size
      if (newSize < originalSize) {
        updates.players = cleanedPlayers
        savedBytes += originalSize - newSize
        cleanedItems.push(`Players: saved ${((originalSize - newSize) / 1024).toFixed(1)}KB`)
      }
    }

    // 2. Clean up games - optionally remove old box scores
    if (options.removeOldBoxScores) {
      const games = dynasty.games || []
      const currentYear = dynasty.currentYear
      const keepYears = options.keepBoxScoreYears || 2 // Keep last 2 years by default

      const cleanedGames = games.map(game => {
        // Keep box scores for recent years only
        if (game.boxScore && game.year && game.year < currentYear - keepYears) {
          const { boxScore, ...gameWithoutBoxScore } = game
          return gameWithoutBoxScore
        }
        return game
      })

      const originalSize = new Blob([JSON.stringify(games)]).size
      const newSize = new Blob([JSON.stringify(cleanedGames)]).size
      if (newSize < originalSize) {
        updates.games = cleanedGames
        savedBytes += originalSize - newSize
        cleanedItems.push(`Old box scores: saved ${((originalSize - newSize) / 1024).toFixed(1)}KB`)
      }
    }

    // 3. Remove empty ByYear objects
    const byYearFields = [
      'schedulesByTeamYear', 'recruitingCommitmentsByTeamYear', 'teamRatingsByTeamYear',
      'coachingStaffByTeamYear', 'playersLeavingByYear', 'draftResultsByYear',
      'cfpResultsByYear', 'bowlResultsByYear', 'rankingsHistoryByYear'
    ]

    byYearFields.forEach(field => {
      if (dynasty[field]) {
        const cleaned = {}
        Object.entries(dynasty[field]).forEach(([key, value]) => {
          // Keep if not empty
          if (value && typeof value === 'object') {
            if (Array.isArray(value) && value.length > 0) {
              cleaned[key] = value
            } else if (!Array.isArray(value) && Object.keys(value).length > 0) {
              cleaned[key] = value
            }
          }
        })
        if (Object.keys(cleaned).length !== Object.keys(dynasty[field]).length) {
          updates[field] = cleaned
        }
      }
    })

    // Apply updates if any
    if (Object.keys(updates).length > 0) {
      await updateDynasty(dynastyId, updates)
      return {
        success: true,
        message: `Optimized document. Saved approximately ${(savedBytes / 1024).toFixed(1)}KB. ${cleanedItems.join('; ')}`
      }
    }

    return { success: true, message: 'Document already optimized, no changes needed' }
  }

  // Update a teambuilder team's data (name, abbreviation, colors, logo)
  const updateTeambuilderTeam = async (dynastyId, tid, updates) => {
    const dynasty = dynasties.find(d => d.id === dynastyId)
    if (!dynasty) return { success: false, message: 'Dynasty not found' }

    const teams = dynasty.teams || TEAMS
    const team = teams[tid]
    if (!team) return { success: false, message: 'Team not found' }
    if (!team.isCustom) return { success: false, message: 'Team is not a custom teambuilder team' }

    // Get old abbreviation for customTeams key update
    const oldAbbr = team.abbr
    const newAbbr = updates.abbreviation?.toUpperCase() || updates.abbr?.toUpperCase() || oldAbbr

    // Build updated team object
    const updatedTeam = {
      ...team,
      abbr: newAbbr,
      name: updates.name || team.name,
      primaryColor: updates.primaryColor || team.primaryColor,
      secondaryColor: updates.secondaryColor || team.secondaryColor,
      logo: updates.logoUrl || updates.logo || team.logo,
      isCustom: true
    }

    // Build updates for both new and legacy structures
    const dynastyUpdates = {
      [`teams.${tid}`]: updatedTeam
    }

    // Update legacy customTeams structure
    // If abbreviation changed, we need to remove old key and add new key
    if (dynasty.customTeams) {
      if (oldAbbr !== newAbbr && dynasty.customTeams[oldAbbr]) {
        // Remove old key by setting to null (will be deleted in Firestore)
        dynastyUpdates[`customTeams.${oldAbbr}`] = null
      }

      // Add/update the custom team data
      dynastyUpdates[`customTeams.${newAbbr}`] = {
        name: updatedTeam.name,
        abbreviation: newAbbr,
        logoUrl: updatedTeam.logo,
        backgroundColor: updatedTeam.primaryColor,
        textColor: updatedTeam.secondaryColor,
        primaryColor: updatedTeam.primaryColor,
        secondaryColor: updatedTeam.secondaryColor,
        replacesTeam: dynasty.customTeams[oldAbbr]?.replacesTeam || getOriginalTeamAbbr(tid)
      }
    }

    // If team name changed and this is the user's current team, update dynasty.teamName
    if (updates.name && dynasty.currentTid === tid) {
      dynastyUpdates.teamName = updates.name
    }

    try {
      await updateDynasty(dynastyId, dynastyUpdates)
      return { success: true, message: 'Team updated successfully' }
    } catch (error) {
      console.error('Failed to update teambuilder team:', error)
      return { success: false, message: error.message || 'Failed to update team' }
    }
  }

  // Manual migration to subcollections - can be triggered from Admin Tools
  const migrateToSubcollections = async (dynastyId) => {
    const dynasty = dynasties.find(d => d.id === dynastyId)
    if (!dynasty) return { success: false, message: 'Dynasty not found' }

    if (dynasty._subcollectionsMigrated) {
      return { success: true, message: 'Already migrated to subcollections', alreadyMigrated: true }
    }

    try {
      const result = await migrateDynastyToSubcollections(dynastyId)

      // Update local state to reflect migration
      if (result.success) {
        const updatedDynasties = dynasties.map(d =>
          d.id === dynastyId ? { ...d, _subcollectionsMigrated: true } : d
        )
        setDynasties(updatedDynasties)
        if (currentDynasty?.id === dynastyId) {
          setCurrentDynasty({ ...currentDynasty, _subcollectionsMigrated: true })
        }
      }

      return result
    } catch (error) {
      console.error('Migration error:', error)
      return { success: false, message: error.message || 'Migration failed' }
    }
  }

  // Get custom teams from current dynasty for easy access
  const customTeams = currentDynasty?.customTeams || null

  const value = {
    dynasties,
    currentDynasty,
    customTeams,
    loading,
    createDynasty,
    updateDynasty,
    deleteDynasty,
    selectDynasty,
    addGame,
    saveCPUBowlGames,
    saveCFPGames,
    saveCPUConferenceChampionships,
    advanceWeek,
    advanceToNewSeason,
    revertWeek,
    saveSchedule,
    saveRoster,
    saveTeamRatings,
    saveTeamYearInfo,
    saveCoachingStaff,
    updatePlayer,
    deletePlayer,
    syncAllPlayersStats,
    createGoogleSheetForDynasty,
    createTempSheetWithData,
    deleteSheetAndClearRefs,
    createConferencesSheetForDynasty,
    saveConferences,
    exportDynasty,
    importDynasty,
    processHonorPlayers,
    cleanupRosterData,
    removeOrphanedRosterEntries,
    migratePlayerCareerData,
    fixTransferredPlayers,
    analyzeDocumentSize,
    optimizeDocumentSize,
    migrateToSubcollections,
    updateTeambuilderTeam
  }

  return (
    <DynastyContext.Provider value={value}>
      {children}
    </DynastyContext.Provider>
  )
}

export default DynastyContext
