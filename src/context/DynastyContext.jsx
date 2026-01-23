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
import { indexedDBStorage, storageService } from '../services/storage'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../config/firebase'
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
  getOriginalTeamAbbr,
  // New user team system
  getUserTeamTid,
  getPendingUserTeamTid,
  setUserTeam,
  setPendingUserTeam,
  clearPendingUserTeam,
  applyPendingUserTeam,
  hasPendingJob,
  getPendingJobInfo,
  addCareerEntry
} from '../data/teamRegistry'
import { findMatchingPlayer, getPlayerLastHonorDescription, normalizePlayerName } from '../utils/playerMatching'
import { getFirstRoundSlotId, getSlotIdFromBowlName, getCFPGameId, CFP_BRACKET_SLOTS, DEFAULT_BOWL_CONFIG, getBowlForSlot, CFP_BRACKET_FLOW, getBracketFlowConfig } from '../data/cfpConstants'
import { isSameWeek, isSameYear } from '../utils/compareUtils'

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
 * @param {Object} options - Optional settings
 * @param {boolean} options.useHistorical - If true, always use coachTeamByYear (for career history).
 *                                          If false (default), use current team for current year.
 * @returns {Object|null} User's perspective on the game
 */
export function getUserGamePerspective(game, dynasty, options = {}) {
  if (!game || !dynasty) return null

  const { useHistorical = false } = options

  // Get user's team tid for this game's year
  const yearNum = Number(game.year)
  const yearStr = String(game.year)
  let userTid = null

  // For CURRENT year: Use getUserTeamTid() first (handles mid-season job changes)
  // After a job flip, userId on teams is updated but coachTeamByYear still has old team
  // UNLESS useHistorical is true, then always use coachTeamByYear for career stats
  if (!useHistorical && yearNum === Number(dynasty.currentYear)) {
    userTid = getUserTeamTid(dynasty)
  }

  // For PAST years (or if current year has no userId set, or useHistorical): Use coachTeamByYear
  // This correctly attributes historical games to the team coached that year
  if (!userTid) {
    userTid = dynasty.coachTeamByYear?.[yearNum]?.tid ?? dynasty.coachTeamByYear?.[yearStr]?.tid
    const userTeamAbbr = dynasty.coachTeamByYear?.[yearNum]?.team ?? dynasty.coachTeamByYear?.[yearStr]?.team

    // Derive tid from coachTeamByYear[year].team abbr if tid not set
    if (!userTid && userTeamAbbr) {
      userTid = getTidFromAbbr(userTeamAbbr)
    }
  }

  // Fallback: For dynasties without coachTeamByYear, derive from teamName
  // This handles older dynasties that haven't been fully migrated
  if (!userTid && dynasty.teamName) {
    userTid = getTidFromTeamName(dynasty.teamName, dynasty.teams)
  }

  // UNIFIED FORMAT: Check if game has team1Tid or team2Tid
  // NOTE: CFP shells may have only team1Tid set (waiting for opponent from previous round)
  if (game.team1Tid || game.team2Tid) {
    // For historical mode with explicit game.userTid, use that as source of truth
    // This handles cases where coachTeamByYear is wrong but game data is correct
    let effectiveUserTid = userTid
    if (useHistorical && game.userTid && (game.team1Tid === game.userTid || game.team2Tid === game.userTid)) {
      // Game has explicit userTid that's one of the teams - use it
      effectiveUserTid = game.userTid
    }

    // Check if user's team played in this game (by tid)
    // Handle case where one tid might be null (CFP shells waiting for opponent)
    const isUserGame = game.team1Tid === effectiveUserTid || game.team2Tid === effectiveUserTid

    if (!isUserGame) return null  // User's team didn't play

    const isUserTeam1 = game.team1Tid === effectiveUserTid
    const userScore = isUserTeam1 ? game.team1Score : game.team2Score
    const opponentScore = isUserTeam1 ? game.team2Score : game.team1Score

    return {
      userTid: effectiveUserTid,
      opponentTid: isUserTeam1 ? game.team2Tid : game.team1Tid,  // May be null for CFP shells
      userScore,
      opponentScore,
      userWon: userScore !== null && opponentScore !== null && userScore > opponentScore,
      userRank: isUserTeam1 ? game.team1Rank : game.team2Rank,
      opponentRank: isUserTeam1 ? game.team2Rank : game.team1Rank,
      userOverall: isUserTeam1 ? game.team1Overall : game.team2Overall,
      opponentOverall: isUserTeam1 ? game.team2Overall : game.team1Overall,
      isHome: game.homeTeamTid === effectiveUserTid,
      isAway: game.homeTeamTid !== null && game.homeTeamTid !== effectiveUserTid,
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

// ============================================================================
// CFP GAME SHELL SYSTEM - Upfront game creation when seeds are entered
// ============================================================================

/**
 * Get CFP game type from bracket slot round
 */
function getCFPGameTypeFromRound(round) {
  switch (round) {
    case 'first_round': return GAME_TYPES.CFP_FIRST_ROUND
    case 'quarterfinal': return GAME_TYPES.CFP_QUARTERFINAL
    case 'semifinal': return GAME_TYPES.CFP_SEMIFINAL
    case 'championship': return GAME_TYPES.CFP_CHAMPIONSHIP
    default: return null
  }
}

/**
 * Get legacy flag name for a CFP round
 */
function getCFPLegacyFlag(round) {
  switch (round) {
    case 'first_round': return 'isCFPFirstRound'
    case 'quarterfinal': return 'isCFPQuarterfinal'
    case 'semifinal': return 'isCFPSemifinal'
    case 'championship': return 'isCFPChampionship'
    default: return null
  }
}

/**
 * Create or update all 11 CFP game shells when seeds are entered
 * If shells already exist, updates team assignments while preserving scores
 *
 * @param {Array} existingGames - Current games array from dynasty
 * @param {Object} seedsWithTid - Seeds mapped to tids: { 1: tid, 2: tid, ..., 12: tid }
 * @param {number} year - The year for these CFP games
 * @returns {Array} Updated games array with CFP shells created/updated
 */
export function createOrUpdateCFPGameShells(existingGames, seedsWithTid, year, bowlConfig = null) {
  if (!seedsWithTid || Object.keys(seedsWithTid).length === 0) {
    return existingGames
  }

  // Use provided config or fall back to defaults
  const effectiveBowlConfig = bowlConfig || DEFAULT_BOWL_CONFIG
  console.log('[createCFPGameShells] Creating/updating shells for year', year, 'with bowlConfig:', effectiveBowlConfig)

  const games = [...existingGames]

  // Helper to find existing shell by cfpSlot (PRIMARY) or id (SECONDARY)
  const findExistingShell = (slotId) => {
    const bySlot = games.find(g => g.cfpSlot === slotId && Number(g.year) === Number(year))
    if (bySlot) return { game: bySlot, index: games.indexOf(bySlot) }

    const gameId = `${slotId}-${year}`
    const byId = games.find(g => g.id === gameId)
    if (byId) return { game: byId, index: games.indexOf(byId) }

    return null
  }

  // Process all 11 CFP slots to ensure shells exist
  for (const [slotId, config] of Object.entries(CFP_BRACKET_SLOTS)) {
    const gameId = `${slotId}-${year}`
    const existing = findExistingShell(slotId)

    // Determine teams based on round
    let team1Tid = null
    let team2Tid = null
    // Get bowl name from slot-based config (for QF and SF), fall back to default
    let bowlName = getBowlForSlot(slotId, effectiveBowlConfig) || config.bowl || null

    if (config.round === 'first_round') {
      // First round - both teams known from seeds, no bowl name
      team1Tid = seedsWithTid[config.higherSeed] ?? null
      team2Tid = seedsWithTid[config.lowerSeed] ?? null
      bowlName = null // First round games are on-campus, no bowl
    } else if (config.round === 'quarterfinal') {
      // Quarterfinal - bye seed known, opponent TBD (from first round winner)
      team1Tid = seedsWithTid[config.byeSeed] ?? null
      team2Tid = null // Will be populated when first round winner is determined
    } else {
      // Semifinals and Championship - both teams TBD (will be filled by propagation)
      team1Tid = null
      team2Tid = null
    }

    const gameType = getCFPGameTypeFromRound(config.round)
    const legacyFlag = getCFPLegacyFlag(config.round)

    if (existing) {
      // Update existing shell - preserve scores and propagated teams
      const existingGame = existing.game
      games[existing.index] = {
        ...existingGame,
        // For FR/QF: set teams from seeds. For SF/NC: only set if we have data AND existing is null
        team1Tid: (config.round === 'first_round' || config.round === 'quarterfinal')
          ? (team1Tid ?? existingGame.team1Tid)
          : (existingGame.team1Tid ?? team1Tid),  // Preserve propagated teams for SF/NC
        team2Tid: (config.round === 'first_round')
          ? (team2Tid ?? existingGame.team2Tid)
          : (existingGame.team2Tid ?? team2Tid),  // Preserve propagated teams
        // Preserve scores if already entered
        team1Score: existingGame.team1Score,
        team2Score: existingGame.team2Score,
        // CRITICAL: Always ensure cfpSlot is set correctly
        id: gameId,
        cfpSlot: slotId,
        cfpRound: config.round,
        bowlName,
        gameType,
        [legacyFlag]: true
      }
    } else {
      // Create new shell - CRITICAL for SF/NC shells that must exist for propagation!
      const newGame = {
        id: gameId,
        year: Number(year),
        week: `Bowl ${config.week}`,
        gameType,
        team1Tid,
        team2Tid,
        team1Score: null,
        team2Score: null,
        homeTeamTid: null, // CFP games are neutral site
        cfpSlot: slotId,
        cfpRound: config.round,
        bowlName,
        [legacyFlag]: true
      }
      games.push(newGame)
      console.log('[createCFPGameShells] Created shell:', { id: gameId, cfpSlot: slotId, cfpRound: config.round, bowlName })
    }
  }

  console.log('[createCFPGameShells] Total shells after creation:', games.filter(g => g.cfpSlot && Number(g.year) === Number(year)).length)
  return games
}

/**
 * Propagate CFP winner to the next round game shell
 * Called after a CFP game is saved with a result
 *
 * BULLETPROOF VERSION: Uses CFP_BRACKET_FLOW with explicit feedsPosition
 * and handles missing shells by creating them if necessary.
 *
 * @param {Array} games - Current games array
 * @param {Object} savedGame - The game that was just saved with scores
 * @returns {Array} Updated games array with winner propagated
 */
export function propagateCFPWinner(games, savedGame) {
  const { cfpSlot } = savedGame
  if (!cfpSlot) {
    console.warn('[propagateCFPWinner] No cfpSlot on saved game, cannot propagate')
    return games
  }

  // Get config from CFP_BRACKET_FLOW (uses explicit feedsPosition)
  const allFlowConfigs = {
    ...CFP_BRACKET_FLOW.firstRound,
    ...CFP_BRACKET_FLOW.quarterfinals,
    ...CFP_BRACKET_FLOW.semifinals,
    ...CFP_BRACKET_FLOW.championship
  }
  const flowConfig = allFlowConfigs[cfpSlot]

  if (!flowConfig || !flowConfig.feedsInto) {
    console.log(`[propagateCFPWinner] ${cfpSlot} has no feedsInto (championship or invalid slot)`)
    return games
  }

  // Determine winner - need valid scores
  if (savedGame.team1Score === null || savedGame.team2Score === null) {
    console.log(`[propagateCFPWinner] ${cfpSlot} has no scores yet, skipping propagation`)
    return games
  }

  const winnerTid = savedGame.team1Score > savedGame.team2Score
    ? savedGame.team1Tid
    : savedGame.team2Tid

  if (!winnerTid) {
    console.warn(`[propagateCFPWinner] ${cfpSlot} could not determine winner tid`)
    return games
  }

  const nextSlotId = flowConfig.feedsInto
  const feedsPosition = flowConfig.feedsPosition  // 'team1' or 'team2' - explicit!
  const year = savedGame.year
  const expectedId = `${nextSlotId}-${year}`

  console.log(`[propagateCFPWinner] ${cfpSlot} winner (tid ${winnerTid}) → ${nextSlotId}.${feedsPosition}`)

  // Find target shell by cfpSlot (PRIMARY) then by id (SECONDARY)
  let targetIndex = games.findIndex(g => g.cfpSlot === nextSlotId && Number(g.year) === Number(year))
  if (targetIndex === -1) {
    targetIndex = games.findIndex(g => g.id === expectedId)
  }

  if (targetIndex === -1) {
    // Shell doesn't exist - this shouldn't happen but handle it gracefully
    console.warn(`[propagateCFPWinner] Target shell ${nextSlotId} not found! Creating it.`)

    // Determine game type for the new shell
    let gameType = GAME_TYPES.CFP_SEMIFINAL
    let legacyFlag = 'isCFPSemifinal'
    let week = 'Bowl 3'
    if (nextSlotId === 'cfpnc') {
      gameType = GAME_TYPES.CFP_CHAMPIONSHIP
      legacyFlag = 'isCFPChampionship'
      week = 'Bowl 4'
    }

    const newShell = {
      id: expectedId,
      cfpSlot: nextSlotId,
      cfpRound: nextSlotId === 'cfpnc' ? 'championship' : 'semifinal',
      year: Number(year),
      week,
      gameType,
      [legacyFlag]: true,
      team1Tid: feedsPosition === 'team1' ? winnerTid : null,
      team2Tid: feedsPosition === 'team2' ? winnerTid : null,
      team1Score: null,
      team2Score: null,
      homeTeamTid: null,
    }
    return [...games, newShell]
  }

  // Update the existing shell at the correct position
  const updatedGames = [...games]
  const existingShell = updatedGames[targetIndex]
  updatedGames[targetIndex] = {
    ...existingShell,
    // Ensure cfpSlot is set (might be missing on legacy data)
    cfpSlot: nextSlotId,
    // Set winner at the correct position based on explicit feedsPosition
    [feedsPosition === 'team1' ? 'team1Tid' : 'team2Tid']: winnerTid,
  }

  console.log(`[propagateCFPWinner] Updated ${nextSlotId} shell:`, {
    id: updatedGames[targetIndex].id,
    cfpSlot: updatedGames[targetIndex].cfpSlot,
    team1Tid: updatedGames[targetIndex].team1Tid,
    team2Tid: updatedGames[targetIndex].team2Tid
  })

  return updatedGames
}

/**
 * Check if a team won a CFP game
 */
export function isCFPGameWinner(game, tid) {
  if (game.team1Score === null || game.team2Score === null) return false
  const winnerTid = game.team1Score > game.team2Score ? game.team1Tid : game.team2Tid
  return winnerTid === tid
}

/**
 * Check if a team lost a CFP game
 */
export function isCFPGameLoser(game, tid) {
  if (game.team1Score === null || game.team2Score === null) return false
  const loserTid = game.team1Score > game.team2Score ? game.team2Tid : game.team1Tid
  return loserTid === tid
}

/**
 * Get user's CFP game status for the current bowl week
 * Returns information about whether user has a game and its status
 *
 * @param {Object} dynasty - Dynasty object
 * @param {number} year - Year
 * @param {number|string} bowlWeek - Bowl week number (1-4)
 * @returns {Object|null} Game status info or null if not in CFP
 */
export function getUserCFPGameStatus(dynasty, year, bowlWeek) {
  const userTid = dynasty.currentTid
  const seeds = dynasty.cfpSeedsByYear?.[year]

  if (!seeds || !userTid) return null

  // Find user's seed (seeds can be { 1: tid, 2: tid, ... } or old array format)
  let userSeed = null
  if (Array.isArray(seeds)) {
    // Legacy array format: [{ seed: 1, team: 'OSU', tid: 42 }, ...]
    const seedEntry = seeds.find(s => s.tid === userTid)
    userSeed = seedEntry?.seed
  } else {
    // New tid-keyed format: { 1: tid, 2: tid, ... }
    const entry = Object.entries(seeds).find(([, tid]) => tid === userTid)
    userSeed = entry ? Number(entry[0]) : null
  }

  if (!userSeed) return null // User not in CFP

  const games = dynasty.games || []
  const week = Number(bowlWeek)

  // Helper to find user's game for a specific round
  const findUserGameByRound = (round) => {
    return games.find(g =>
      Number(g.year) === Number(year) &&
      g.cfpRound === round &&
      (g.team1Tid === userTid || g.team2Tid === userTid)
    )
  }

  // Helper to check if user advanced past a round
  const didUserAdvance = (round) => {
    const game = findUserGameByRound(round)
    return game && isCFPGameWinner(game, userTid)
  }

  // Helper to check if user lost in a round
  const didUserLose = (round) => {
    const game = findUserGameByRound(round)
    return game && isCFPGameLoser(game, userTid)
  }

  // Determine expected game based on week and seed
  if (week === 1) {
    // Bowl Week 1: Seeds 5-12 play First Round
    if (userSeed >= 5 && userSeed <= 12) {
      const game = findUserGameByRound('first_round')
      if (game) {
        const opponentTid = game.team1Tid === userTid ? game.team2Tid : game.team1Tid
        return {
          game,
          round: 'first_round',
          opponentKnown: opponentTid !== null,
          opponentTid,
          hasResult: game.team1Score !== null && game.team2Score !== null,
          userSeed
        }
      }
    }
    // Seeds 1-4 have bye in week 1
    return null
  }

  if (week === 2) {
    // Bowl Week 2: Quarterfinals
    // Seeds 1-4 enter, plus first round winners

    // If seed 1-4, they play in QF
    if (userSeed >= 1 && userSeed <= 4) {
      const game = findUserGameByRound('quarterfinal')
      if (game) {
        const opponentTid = game.team1Tid === userTid ? game.team2Tid : game.team1Tid
        return {
          game,
          round: 'quarterfinal',
          opponentKnown: opponentTid !== null,
          opponentTid,
          hasResult: game.team1Score !== null && game.team2Score !== null,
          userSeed
        }
      }
    }

    // If seed 5-12, check if they won first round
    if (userSeed >= 5 && userSeed <= 12) {
      if (didUserLose('first_round')) {
        return { eliminated: true, round: 'first_round', userSeed }
      }
      if (didUserAdvance('first_round')) {
        const game = findUserGameByRound('quarterfinal')
        if (game) {
          const opponentTid = game.team1Tid === userTid ? game.team2Tid : game.team1Tid
          return {
            game,
            round: 'quarterfinal',
            opponentKnown: opponentTid !== null,
            opponentTid,
            hasResult: game.team1Score !== null && game.team2Score !== null,
            userSeed
          }
        }
      }
      // First round not played yet
      return null
    }
    return null
  }

  if (week === 3) {
    // Bowl Week 3: Semifinals
    if (didUserLose('first_round') || didUserLose('quarterfinal')) {
      return { eliminated: true, round: didUserLose('first_round') ? 'first_round' : 'quarterfinal', userSeed }
    }
    if (didUserAdvance('quarterfinal')) {
      const game = findUserGameByRound('semifinal')
      if (game) {
        const opponentTid = game.team1Tid === userTid ? game.team2Tid : game.team1Tid
        return {
          game,
          round: 'semifinal',
          opponentKnown: opponentTid !== null,
          opponentTid,
          hasResult: game.team1Score !== null && game.team2Score !== null,
          userSeed
        }
      }
    }
    return null
  }

  if (week === 4) {
    // Bowl Week 4: Championship
    if (didUserLose('first_round') || didUserLose('quarterfinal') || didUserLose('semifinal')) {
      const lostRound = didUserLose('first_round') ? 'first_round' :
                        didUserLose('quarterfinal') ? 'quarterfinal' : 'semifinal'
      return { eliminated: true, round: lostRound, userSeed }
    }
    if (didUserAdvance('semifinal')) {
      const game = findUserGameByRound('championship')
      if (game) {
        const opponentTid = game.team1Tid === userTid ? game.team2Tid : game.team1Tid
        return {
          game,
          round: 'championship',
          opponentKnown: opponentTid !== null,
          opponentTid,
          hasResult: game.team1Score !== null && game.team2Score !== null,
          userSeed
        }
      }
    }
    return null
  }

  return null
}

/**
 * Get the round name for display
 */
export function getCFPRoundDisplayName(round) {
  switch (round) {
    case 'first_round': return 'CFP First Round'
    case 'quarterfinal': return 'CFP Quarterfinal'
    case 'semifinal': return 'CFP Semifinal'
    case 'championship': return 'National Championship'
    default: return 'CFP Game'
  }
}

/**
 * Find user's CFP game shell for a specific round
 * Unlike findCurrentTeamGame, this finds shells even when team2Tid is null
 *
 * @param {Object} dynasty - Dynasty object
 * @param {string} round - CFP round: 'first_round', 'quarterfinal', 'semifinal', 'championship'
 * @param {number} year - Year
 * @returns {Object|null} The game shell or null
 */
export function findUserCFPGameShell(dynasty, round, year) {
  if (!dynasty) return null

  const userTid = dynasty.currentTid
  if (!userTid) return null

  const games = dynasty.games || []

  return games.find(g =>
    Number(g.year) === Number(year) &&
    g.cfpRound === round &&
    (g.team1Tid === userTid || g.team2Tid === userTid)
  ) || null
}

// ============================================================================
// TEAM RECORD FUNCTIONS - Single source of truth for win/loss records
// ============================================================================

/**
 * Get game order for sorting (week number with postseason handling)
 * Used internally for "as of game" calculations
 */
function getGameOrderForRecord(game) {
  if (!game) return 0
  const type = detectGameType(game)
  if (type === GAME_TYPES.CFP_CHAMPIONSHIP) return 23
  if (type === GAME_TYPES.CFP_SEMIFINAL) return 22
  if (type === GAME_TYPES.CFP_QUARTERFINAL) return 21
  if (type === GAME_TYPES.CFP_FIRST_ROUND) return 20
  if (type === GAME_TYPES.CONFERENCE_CHAMPIONSHIP) return 15
  if (type === GAME_TYPES.BOWL) return game.week ? 14 + game.week : 14
  return game.week || 0
}

/**
 * Check if a game has valid scores for record calculation
 */
function hasValidScores(game) {
  if (!game) return false
  return (game.team1Score !== undefined && game.team2Score !== undefined) ||
         (game.teamScore !== undefined && game.opponentScore !== undefined)
}

/**
 * Get score info for a specific team in a game
 * Handles both unified (team1Tid/team2Tid) and legacy formats
 */
function getTeamScoreInfo(game, tid, abbr = null) {
  let teamScore, opponentScore

  // Unified format
  if (game.team1Tid !== undefined || game.team2Tid !== undefined) {
    const isTeam1 = game.team1Tid === tid
    teamScore = isTeam1 ? game.team1Score : game.team2Score
    opponentScore = isTeam1 ? game.team2Score : game.team1Score
  }
  // Legacy user game format
  else if (game.userTid === tid || (abbr && game.userTeam === abbr)) {
    teamScore = game.teamScore
    opponentScore = game.opponentScore
  }
  // Legacy opponent format
  else if (game.opponentTid === tid || (abbr && game.opponent === abbr)) {
    teamScore = game.opponentScore
    opponentScore = game.teamScore
  }

  // Determine if conference game (regular season only)
  const isConfGame = game.isConferenceGame &&
    detectGameType(game) === GAME_TYPES.REGULAR

  return { teamScore, opponentScore, isConfGame }
}

/**
 * Calculate team record from games - the canonical calculation logic
 * @param {Object} dynasty - Dynasty object
 * @param {number} tid - Team ID
 * @param {number} year - Year
 * @param {Object} options - Optional filtering
 * @param {string} options.upToGameId - Calculate record up to (but excluding) this game
 * @param {number} options.upToWeek - Calculate record up to this week (inclusive)
 * @param {boolean} options.includeUpToWeek - If true with upToWeek, include games at that week
 * @returns {{ wins, losses, confWins, confLosses }}
 */
export function calculateTeamRecordFromGames(dynasty, tid, year, options = {}) {
  if (!dynasty || !tid || !year) {
    return { wins: 0, losses: 0, confWins: 0, confLosses: 0 }
  }

  const games = dynasty.games || []
  const { upToGameId, upToWeek, includeUpToWeek = true } = options
  const abbr = getAbbrFromTid(tid)

  // Filter to year and team
  let teamGames = games.filter(g => {
    if (Number(g.year) !== Number(year)) return false

    // Check if team is involved (multiple format checks)
    const isInGame = g.team1Tid === tid || g.team2Tid === tid ||
      g.userTid === tid || g.opponentTid === tid ||
      g.userTeam === abbr || g.opponent === abbr

    if (!isInGame) return false
    if (!hasValidScores(g)) return false
    return true
  })

  // CRITICAL: Deduplicate games by week + gameType to prevent double-counting
  // This handles cases where duplicate game records exist for the same matchup
  const seenGames = new Map()
  teamGames = teamGames.filter(g => {
    // Create a unique key for each game slot: week + gameType (or 'regular' if not set)
    const gameType = g.gameType || 'regular'
    const week = g.week ?? 0
    const key = `${week}-${gameType}`

    if (seenGames.has(key)) {
      // Duplicate detected - skip silently (use DangerZone to clean up)
      return false
    }
    seenGames.set(key, g.id)
    return true
  })

  // Sort by game order for "as of" calculations
  teamGames = teamGames.sort((a, b) => getGameOrderForRecord(a) - getGameOrderForRecord(b))

  // Apply "up to" filters if specified
  if (upToGameId) {
    const idx = teamGames.findIndex(g => g.id === upToGameId)
    if (idx >= 0) teamGames = teamGames.slice(0, idx)
  }
  if (upToWeek !== undefined) {
    const targetOrder = upToWeek
    teamGames = teamGames.filter(g => {
      const order = getGameOrderForRecord(g)
      return includeUpToWeek ? order <= targetOrder : order < targetOrder
    })
  }

  let wins = 0, losses = 0
  let confWins = 0, confLosses = 0

  teamGames.forEach(g => {
    const { teamScore, opponentScore, isConfGame } = getTeamScoreInfo(g, tid, abbr)

    if (teamScore === undefined || opponentScore === undefined) return

    if (teamScore > opponentScore) {
      wins++
      if (isConfGame) confWins++
    } else if (teamScore < opponentScore) {
      losses++
      if (isConfGame) confLosses++
    }
    // No ties in college football - games always have a winner
  })

  return { wins, losses, confWins, confLosses }
}

/**
 * Get the team record (single source of truth)
 * Always calculates from actual games to ensure accuracy
 * @param {Object} dynasty - Dynasty object
 * @param {number|string} tidOrAbbr - Team ID or abbreviation
 * @param {number} year - Year
 * @returns {{ wins, losses, confWins, confLosses } | null}
 */
export function getTeamRecord(dynasty, tidOrAbbr, year) {
  if (!dynasty || !tidOrAbbr || !year) return null

  // Handle abbr input for backward compatibility
  const tid = typeof tidOrAbbr === 'string' ? getTidFromAbbr(tidOrAbbr) : tidOrAbbr

  // Always calculate from games - this is the authoritative source of truth
  // Stored records are only used as a cache for Firestore updates
  return calculateTeamRecordFromGames(dynasty, tid, year)
}

/**
 * Get record for current user team and year
 * Convenience wrapper for dashboard/ticker usage
 */
export function getCurrentTeamRecord(dynasty) {
  if (!dynasty) return null

  const tid = getCurrentTeamTid(dynasty)
  const year = dynasty.currentYear

  if (!tid || !year) return null

  return getTeamRecord(dynasty, tid, year)
}

/**
 * Get team record as of the end of a specific game
 * For Game.jsx display showing "record after this game"
 * @param {Object} dynasty - Dynasty object
 * @param {Object} game - The game object
 * @param {number} tid - Team to get record for
 * @returns {{ overall: string, conference: string, wins: number, losses: number }}
 */
export function getRecordAsOfGame(dynasty, game, tid) {
  if (!dynasty || !game || !tid) return { overall: '0-0', conference: '0-0', wins: 0, losses: 0 }

  // Calculate including this game by using upToWeek with the game's order
  const gameOrder = getGameOrderForRecord(game)
  const record = calculateTeamRecordFromGames(dynasty, tid, game.year, {
    upToWeek: gameOrder,
    includeUpToWeek: true
  })

  return {
    overall: `${record.wins}-${record.losses}`,
    conference: `${record.confWins}-${record.confLosses}`,
    wins: record.wins,
    losses: record.losses,
    confWins: record.confWins,
    confLosses: record.confLosses
  }
}

/**
 * Build update payload for team records after a game save
 * Call this from game save logic to update the stored records
 * @param {Object} dynasty - Dynasty object (with updated games array)
 * @param {number} tid - Team ID
 * @param {number} year - Year
 * @returns {Object} Updates object for updateDynasty()
 */
export function buildRecordUpdatePayload(dynasty, tid, year) {
  if (!dynasty || !tid || !year) return {}

  const record = calculateTeamRecordFromGames(dynasty, tid, year)
  const abbr = getAbbrFromTid(tid)

  if (!abbr) return {}

  record.lastUpdated = new Date().toISOString()

  // Build updates for both structures (for backward compatibility)
  const updates = {}

  // New tid-based structure
  updates[`teams.${tid}.byYear.${year}.record`] = record

  // Legacy structure
  updates[`teamRecordsByTeamYear.${abbr}.${year}`] = {
    wins: record.wins,
    losses: record.losses,
    confWins: record.confWins,
    confLosses: record.confLosses
  }

  return updates
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

  // CRITICAL: Get tid directly - tid is the ONLY source of truth
  const tid = getCurrentTeamTid(dynasty)
  const year = dynasty.currentYear

  // Try NEW tid-based byYear structure first (Phase 7 migration)
  if (tid && dynasty.teams?.[tid]?.byYear?.[year]?.schedule) {
    return dynasty.teams[tid].byYear[year].schedule
  }

  // Try old team-centric structure (schedulesByTeamYear) - need abbr for legacy lookup
  const teamAbbr = getAbbrFromTid(dynasty.teams, tid) || dynasty.teamName
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
 * Get schedule for any team and year
 * Used for editing schedules for teams other than the current user's team
 * @param {Object} dynasty - The dynasty object
 * @param {number|string} tidOrAbbr - Team ID (tid) or abbreviation
 * @param {number|string} year - The year to get schedule for
 */
export function getScheduleForTeam(dynasty, tidOrAbbr, year) {
  if (!dynasty || !tidOrAbbr || !year) return []

  // Resolve tid and abbr
  const tid = typeof tidOrAbbr === 'number' ? tidOrAbbr : getTidFromAbbr(tidOrAbbr)
  const teamAbbr = typeof tidOrAbbr === 'string' ? tidOrAbbr : getAbbrFromTid(tidOrAbbr)

  // Try NEW tid-based byYear structure first
  if (tid && dynasty.teams?.[tid]?.byYear?.[year]?.schedule) {
    return dynasty.teams[tid].byYear[year].schedule
  }

  // Try old team-centric structure (schedulesByTeamYear)
  if (teamAbbr && dynasty.schedulesByTeamYear?.[teamAbbr]?.[year]) {
    return dynasty.schedulesByTeamYear[teamAbbr][year]
  }

  return []
}

/**
 * Create game records from schedule entries
 * Called when schedule is saved to link schedule entries to actual games
 * @param {Object} dynasty - The dynasty object
 * @param {Array} schedule - Array of schedule entries
 * @param {number} userTid - User's team tid
 * @param {number} year - Schedule year
 * @returns {Object} { newGames: [...], updatedSchedule: [...] }
 */
export function createGamesFromSchedule(dynasty, schedule, userTid, year) {
  const existingGames = dynasty.games || []
  const newGames = []

  const updatedSchedule = schedule.map((entry, index) => {
    // Handle BYE weeks - no game created
    const isBye = entry.opponent?.toUpperCase() === 'BYE' || entry.isBye
    if (isBye) {
      return { ...entry, isBye: true, gameId: null, opponentTid: null }
    }

    const opponentTid = entry.opponentTid || getTidFromAbbr(entry.opponent)

    // If entry already has gameId, check if game exists
    if (entry.gameId) {
      const existingGame = existingGames.find(g => g.id === entry.gameId)
      if (existingGame) return { ...entry, opponentTid } // Game exists, keep link
    }

    // Try to find an existing game by week/year that matches this schedule entry
    // This allows retroactive linking of existing games to schedule entries
    const matchingGame = existingGames.find(g =>
      Number(g.week) === Number(entry.week) &&
      Number(g.year) === Number(year) &&
      g.gameType === 'regular' &&
      (g.team1Tid === userTid || g.team2Tid === userTid || g.userTid === userTid)
    )

    if (matchingGame) {
      // Link to existing game instead of creating new one
      return { ...entry, gameId: matchingGame.id, opponentTid, isBye: false }
    }

    // No existing game found - create new game record
    const isHome = entry.location === 'home'
    const isAway = entry.location === 'away'

    // Generate unique game ID
    const newGameId = `game-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 5)}`
    const newGame = {
      id: newGameId,
      week: Number(entry.week),
      year: Number(year),
      gameType: 'regular',
      team1Tid: userTid,
      team2Tid: opponentTid,
      team1Score: 0,
      team2Score: 0,
      homeTeamTid: isHome ? userTid : (isAway ? opponentTid : null),
      isPlayed: false,
      userTid: userTid,
      opponentTid: opponentTid
    }

    newGames.push(newGame)
    return { ...entry, gameId: newGameId, opponentTid, isBye: false }
  })

  return { newGames, updatedSchedule }
}

/**
 * Get schedule with actual game data merged in
 * This is the SINGLE SOURCE OF TRUTH for schedule display
 * Dashboard should ONLY use this function to display schedule
 * @param {Object} dynasty - The dynasty object
 * @returns {Array} Schedule entries with game data, perspective, and play status
 */
export function getScheduleWithGameData(dynasty) {
  if (!dynasty) return []

  const userTid = dynasty.currentTid
  const year = dynasty.currentYear
  const schedule = getScheduleForTeam(dynasty, userTid, year)
  const games = dynasty.games || []

  return schedule.map(entry => {
    // Handle BYE weeks
    if (entry.isBye || entry.opponent?.toUpperCase() === 'BYE') {
      return {
        ...entry,
        isBye: true,
        game: null,
        perspective: null,
        isPlayed: false
      }
    }

    // Find linked game by gameId (primary) or fallback to week match
    const game = entry.gameId
      ? games.find(g => g.id === entry.gameId)
      : games.find(g =>
          Number(g.week) === Number(entry.week) &&
          Number(g.year) === Number(year) &&
          g.gameType === 'regular'
        )

    // Get user's perspective on the game
    const perspective = game ? getUserGamePerspective(game, dynasty) : null

    return {
      ...entry,
      game,
      perspective,
      isPlayed: game?.isPlayed || (game && (game.team1Score > 0 || game.team2Score > 0))
    }
  })
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
  // IMPORTANT: teamsByYear values may be either:
  // - tid (number) for new/migrated data
  // - abbreviation (string) for legacy unmigrated data
  // This function handles BOTH formats for backwards compatibility

  const yearNum = Number(year)
  const yearStr = String(year)
  const teamForYear = player.teamsByYear?.[yearNum] ?? player.teamsByYear?.[yearStr]

  if (teamForYear === undefined || teamForYear === null) {
    return false
  }

  // Normalize the lookup value to both tid and abbr for comparison
  let lookupTid = null
  let lookupAbbr = null

  if (typeof tidOrAbbr === 'number') {
    lookupTid = tidOrAbbr
    // Get abbr from tid for legacy data comparison
    const teamData = TEAMS[tidOrAbbr]
    lookupAbbr = teamData?.abbr
  } else if (typeof tidOrAbbr === 'string' && /^\d+$/.test(tidOrAbbr)) {
    // String that's a number (tid from URL)
    lookupTid = parseInt(tidOrAbbr, 10)
    const teamData = TEAMS[lookupTid]
    lookupAbbr = teamData?.abbr
  } else if (typeof tidOrAbbr === 'string') {
    // Abbreviation string
    lookupAbbr = tidOrAbbr
    lookupTid = getTidFromAbbr(tidOrAbbr)
  }

  // Compare against the stored value (which could be tid or abbr)
  if (typeof teamForYear === 'number') {
    // Stored as tid - compare with lookup tid
    return teamForYear === lookupTid
  } else if (typeof teamForYear === 'string') {
    // Stored as abbr (legacy) - compare with lookup abbr, or convert and compare with tid
    if (teamForYear === lookupAbbr) {
      return true
    }
    // Also try converting stored abbr to tid
    const storedTid = getTidFromAbbr(teamForYear)
    if (storedTid && storedTid === lookupTid) {
      return true
    }
  }

  return false
}

/**
 * Get the current team's roster (non-honor-only players for current team)
 * Uses isPlayerOnRoster for consistent filtering
 */
export function getCurrentRoster(dynasty) {
  if (!dynasty) return []

  // Use getCurrentTeamTid which properly checks userId: 'currentUser' as source of truth
  // This ensures roster matches what Dashboard and Team pages display
  const tid = getCurrentTeamTid(dynasty)
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

  // CRITICAL: Get tid directly - tid is the ONLY source of truth
  const tid = getCurrentTeamTid(dynasty)
  const year = dynasty.currentYear

  // Try NEW tid-based byYear structure first (Phase 7 migration)
  if (tid && dynasty.teams?.[tid]?.byYear?.[year]?.preseasonSetup) {
    return dynasty.teams[tid].byYear[year].preseasonSetup
  }

  // Try old team-centric structure (preseasonSetupByTeamYear) - need abbr for legacy lookup
  const teamAbbr = getAbbrFromTid(dynasty.teams, tid) || dynasty.teamName
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

  // CRITICAL: Get tid directly - tid is the ONLY source of truth
  const tid = getCurrentTeamTid(dynasty)
  const year = dynasty.currentYear

  // Try NEW tid-based byYear structure first (Phase 7 migration)
  if (tid && dynasty.teams?.[tid]?.byYear?.[year]?.teamRatings) {
    return dynasty.teams[tid].byYear[year].teamRatings
  }

  // Try old team-centric structure (teamRatingsByTeamYear) - need abbr for legacy lookup
  const teamAbbr = getAbbrFromTid(dynasty.teams, tid) || dynasty.teamName
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
 * Get team ratings for a specific team and year
 * Works for both user team and other teams
 * @param {Object} dynasty - Dynasty object
 * @param {number|string} tidOrAbbr - Team ID or abbreviation
 * @param {number|string} year - Year to get ratings for
 * @returns {{ overall, offense, defense }}
 */
export function getTeamRatingsForYear(dynasty, tidOrAbbr, year) {
  const defaultRatings = { overall: null, offense: null, defense: null }

  if (!dynasty || !tidOrAbbr || !year) return defaultRatings

  // Resolve tid from abbr if needed
  const tid = typeof tidOrAbbr === 'number' ? tidOrAbbr : getTidFromAbbr(tidOrAbbr)
  const yearNum = Number(year)
  const currentTid = getCurrentTeamTid(dynasty)
  const currentYear = Number(dynasty.currentYear)

  // PRIORITY 1: For current user team and current year, use dynasty.teamRatings
  // This ensures we always get the LATEST ratings if user updates them mid-season
  if (tid === currentTid && yearNum === currentYear && dynasty.teamRatings) {
    const tr = dynasty.teamRatings
    if (tr.overall || tr.offense || tr.defense) {
      return tr
    }
  }

  // PRIORITY 2: Try NEW tid-based byYear structure (for past years or other teams)
  if (tid && dynasty.teams?.[tid]?.byYear?.[yearNum]?.teamRatings) {
    return dynasty.teams[tid].byYear[yearNum].teamRatings
  }

  // Try with string year key
  if (tid && dynasty.teams?.[tid]?.byYear?.[String(yearNum)]?.teamRatings) {
    return dynasty.teams[tid].byYear[String(yearNum)].teamRatings
  }

  // PRIORITY 3: Try legacy teamRatingsByTeamYear (uses abbr)
  const teamAbbr = typeof tidOrAbbr === 'string' ? tidOrAbbr : getAbbrFromTid(dynasty.teams, tid)
  if (teamAbbr) {
    const legacyRatings = dynasty.teamRatingsByTeamYear?.[teamAbbr]?.[yearNum] ||
                          dynasty.teamRatingsByTeamYear?.[teamAbbr]?.[String(yearNum)]
    if (legacyRatings) {
      return legacyRatings
    }
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

  // CRITICAL: Get tid directly - tid is the ONLY source of truth
  const tid = getCurrentTeamTid(dynasty)
  const year = dynasty.currentYear

  // Try NEW tid-based byYear structure first (Phase 7 migration)
  if (tid && dynasty.teams?.[tid]?.byYear?.[year]?.coachingStaff) {
    return dynasty.teams[tid].byYear[year].coachingStaff
  }

  // Try old team-centric structure (coachingStaffByTeamYear) - need abbr for legacy lookup
  const teamAbbr = getAbbrFromTid(dynasty.teams, tid) || dynasty.teamName
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

  // CRITICAL: Get tid directly - tid is the ONLY source of truth
  const tid = getCurrentTeamTid(dynasty)
  const teamAbbr = getAbbrFromTid(dynasty.teams, tid) || dynasty.teamName

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

  // CRITICAL: Get tid directly - tid is the ONLY source of truth
  const tid = getCurrentTeamTid(dynasty)
  const year = dynasty.currentYear

  // Try NEW tid-based byYear structure first (Phase 7 migration)
  if (tid && dynasty.teams?.[tid]?.byYear?.[year]?.recruits) {
    return dynasty.teams[tid].byYear[year].recruits
  }

  // Try old team-centric structure (recruitsByTeamYear) - need abbr for legacy lookup
  const teamAbbr = getAbbrFromTid(dynasty.teams, tid) || dynasty.teamName
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

  // CRITICAL: Get tid directly - tid is the ONLY source of truth
  const teamTid = getCurrentTeamTid(dynasty)
  const year = dynasty.currentYear
  const players = dynasty.players || []
  const games = dynasty.games || []

  // Only get teamAbbr for logging
  const teamAbbr = getAbbrFromTid(dynasty.teams, teamTid) || dynasty.teamName

  console.log('[getPlayersNeedingClassConfirmation] teamTid:', teamTid, 'year:', year)

  // Helper to normalize names for matching (same as boxScoreAggregator)
  const normalizeName = (name) => {
    if (!name) return ''
    return name.toLowerCase().trim().replace(/[^a-z0-9]/g, '')
  }

  // Helper to count games from box scores for a player
  const countGamesFromBoxScores = (playerName) => {
    const normalizedPlayerName = normalizeName(playerName)
    let gameCount = 0

    // Filter to games for this year
    const yearGames = games.filter(g => Number(g.year) === Number(year))

    yearGames.forEach(game => {
      const boxScore = game.boxScore
      if (!boxScore) return

      // Check if player appears in either home or away box score
      const checkSide = (side) => {
        if (!boxScore[side]) return false
        return Object.values(boxScore[side]).some(category =>
          Array.isArray(category) && category.some(p =>
            normalizeName(p.playerName) === normalizedPlayerName
          )
        )
      }

      if (checkSide('home') || checkSide('away')) {
        gameCount++
      }
    })

    return gameCount
  }

  // Helper to check if player's team matches current team (handles tid and abbr)
  const isOnCurrentTeam = (p) => {
    // First check teamsByYear for this year (most reliable)
    const teamThisYear = p.teamsByYear?.[year] ?? p.teamsByYear?.[String(year)]
    if (teamThisYear !== undefined) {
      if (typeof teamThisYear === 'number') return teamThisYear === teamTid
      // Legacy abbr string
      const tidFromAbbr = getTidFromAbbr(teamThisYear)
      return tidFromAbbr === teamTid
    }
    // Fall back to p.team field
    if (p.team !== undefined) {
      if (typeof p.team === 'number') return p.team === teamTid
      // Legacy abbr string
      const tidFromAbbr = getTidFromAbbr(p.team)
      return tidFromAbbr === teamTid
    }
    return false
  }

  // Get active players for current team (not left, not recruits, not honor-only)
  const activePlayers = players.filter(p => {
    if (p.isHonorOnly) return false
    if (p.isRecruit) return false
    // Also exclude players recruited this year (even if isRecruit flag is missing)
    if (Number(p.recruitYear) === Number(year)) return false
    // Exclude players who have departed THIS year
    const hasDepartedThisYear = (p.movements || []).some(m =>
      (m.type === 'departure' || m.type === 'entered_portal') && Number(m.year) === Number(year)
    )
    if (hasDepartedThisYear) return false
    // Check team membership using tid comparison
    if (!isOnCurrentTeam(p)) return false
    // Already RS players don't need confirmation (they'll progress normally)
    // Check both player.year and classByYear for the current year (classByYear is source of truth)
    const playerClassThisYear = p.classByYear?.[year] || p.classByYear?.[String(year)] || p.year
    if (playerClassThisYear?.startsWith('RS ')) return false
    // Must have a valid class/year field
    if (!p.year && !playerClassThisYear) return false
    return true
  })

  console.log('[getPlayersNeedingClassConfirmation] Active players needing check:', activePlayers.length)

  // Find players with null/undefined gamesPlayed AND no box score data
  const needsConfirmation = activePlayers.filter(player => {
    const yearStats = player.statsByYear?.[year] || player.statsByYear?.[String(year)]
    const gamesPlayed = yearStats?.gamesPlayed

    // If gamesPlayed is explicitly set, no confirmation needed
    if (gamesPlayed !== null && gamesPlayed !== undefined) {
      return false
    }

    // Check if player has box score data - if so, we can derive games from that
    const boxScoreGames = countGamesFromBoxScores(player.name)
    if (boxScoreGames > 0) {
      // Player has box score data, so we know they played - no confirmation needed
      // (The actual gamesPlayed will be calculated from box scores during class advancement)
      return false
    }

    // No explicit gamesPlayed AND no box score data - needs confirmation
    return true
  })

  console.log('[getPlayersNeedingClassConfirmation] Players needing confirmation:', needsConfirmation.length)
  return needsConfirmation
}

/**
 * Check if user is on a new team (first year coaching this team)
 * This checks if the team for the PREVIOUS year differs from the current team
 */
export function isFirstYearOnTeam(dynasty) {
  if (!dynasty) return false

  const currentYear = Number(dynasty.currentYear)
  const startYear = Number(dynasty.startYear)
  const currentTeamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName

  // First year of dynasty is always "first year on team"
  if (currentYear === startYear) return true

  // Check the stored flag first (set during advanceToNewSeason)
  if (dynasty.isFirstYearOnCurrentTeam === true) return true

  // Check coachTeamByYear for the PREVIOUS year
  const previousYear = currentYear - 1
  const previousYearEntry = dynasty.coachTeamByYear?.[previousYear] || dynasty.coachTeamByYear?.[String(previousYear)]
  const previousYearTeam = previousYearEntry?.team

  // If no previous year record exists, they're new to this team
  if (!previousYearTeam) return true

  // Compare previous year's team to current team
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
    // CRITICAL: Use tid for team field
    const teamTid = getCurrentTeamTid(dynasty)
    return {
      team: teamTid, // ALWAYS use tid
      teamName: dynasty.teamName,
      position: dynasty.coachPosition || 'HC'
    }
  }

  // For the start year, assume the current team if no record exists
  if (year === dynasty.startYear) {
    // CRITICAL: Use tid for team field
    const teamTid = getCurrentTeamTid(dynasty)
    return {
      team: teamTid, // ALWAYS use tid
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
  let tid = null
  if (!teamAbbr) {
    const coachTeam = getCoachTeamForYear(dynasty, year)
    teamAbbr = coachTeam?.team
    // Also get tid from coachTeam if it has it
    tid = coachTeam?.tid || (teamAbbr ? getTidFromAbbr(teamAbbr) : null)
  }

  if (!teamAbbr && !tid) {
    // CRITICAL: Fallback to current team using tid directly
    tid = getCurrentTeamTid(dynasty)
    teamAbbr = getAbbrFromTid(dynasty.teams, tid) || dynasty.teamName
  } else if (!tid && teamAbbr) {
    // Have abbr but not tid - resolve it
    tid = getTidFromAbbr(teamAbbr)
  }

  // Try NEW tid-based byYear structure first (Phase 7 migration)
  let staff = tid && dynasty.teams?.[tid]?.byYear?.[year]?.lockedCoachingStaff

  // Fall back to locked coaching staff (old format, set at end of Week 12)
  if (!staff && teamAbbr) {
    staff = dynasty.lockedCoachingStaffByYear?.[teamAbbr]?.[year]
  }

  // Fall back to team-centric coaching staff from new structure
  if (!staff && tid) {
    staff = dynasty.teams?.[tid]?.byYear?.[year]?.coachingStaff
  }

  // Fall back to team-centric coaching staff (old format, may have been updated after firings)
  if (!staff && teamAbbr) {
    staff = dynasty.coachingStaffByTeamYear?.[teamAbbr]?.[year]
  }

  // ONLY fall back to legacy coaching staff if this is the user's CURRENT team
  // This prevents showing the user's coordinators on other teams' pages
  const userCurrentTid = getCurrentTeamTid(dynasty)
  if (!staff && tid === userCurrentTid) {
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
 * Walks back through previous years to find the most recent conference alignment
 * Falls back to legacy customConferences, then to null (use defaults)
 */
export function getCustomConferencesForYear(dynasty, year) {
  if (!dynasty || !year) return null

  const yearNum = Number(year)
  if (isNaN(yearNum)) return null

  // Check year-specific first (try both number and string keys)
  const byYear = dynasty.customConferencesByYear?.[yearNum] || dynasty.customConferencesByYear?.[String(yearNum)]
  if (byYear && typeof byYear === 'object' && Object.keys(byYear).length > 0) {
    return byYear
  }

  // Walk back through previous years to find the most recent conference alignment
  // This handles cases where conferences weren't carried over properly
  if (dynasty.customConferencesByYear && typeof dynasty.customConferencesByYear === 'object') {
    const startYear = Number(dynasty.startYear) || 2024
    // Safety limit: only look back 10 years max
    const minYear = Math.max(startYear, yearNum - 10)

    for (let y = yearNum - 1; y >= minYear; y--) {
      // Try both number and string keys
      const prevYearConf = dynasty.customConferencesByYear[y] || dynasty.customConferencesByYear[String(y)]
      if (prevYearConf && typeof prevYearConf === 'object' && Object.keys(prevYearConf).length > 0) {
        return prevYearConf
      }
    }
  }

  // Fall back to legacy customConferences
  if (dynasty.customConferences && typeof dynasty.customConferences === 'object' && Object.keys(dynasty.customConferences).length > 0) {
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
  // CRITICAL: Get tid directly - tid is the ONLY source of truth
  const teamTid = getCurrentTeamTid(dynasty)
  const teamAbbr = getAbbrFromTid(dynasty.teams, teamTid) || dynasty.teamName

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
      // Check if player should be on current team (handles both tid and abbr)
      const playerTeamMatches = !player.team ||
        player.team === teamAbbr ||
        player.team === teamTid ||
        (typeof player.team === 'number' && player.team === teamTid) ||
        (typeof player.team === 'string' && getTidFromAbbr(player.team) === teamTid)
      const isOnCurrentTeam = playerTeamMatches
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

  // First, try to infer from games data
  if (migrated.games && Array.isArray(migrated.games)) {
    for (const game of migrated.games) {
      const year = game.year
      if (!year || initCoachTeamByYear[year]) continue

      // LEGACY FORMAT: Check userTeam field
      if (game.userTeam) {
        const tid = getTidFromAbbr(game.userTeam)
        const team = migrated.teams?.[tid]
        initCoachTeamByYear[year] = {
          tid: tid,
          team: game.userTeam,
          teamName: team?.name || game.userTeam
        }
        continue
      }

      // UNIFIED FORMAT: Check userTid field (if game was saved with user's tid)
      if (game.userTid) {
        const team = migrated.teams?.[game.userTid]
        initCoachTeamByYear[year] = {
          tid: game.userTid,
          team: team?.abbr,
          teamName: team?.name
        }
        continue
      }
    }
  }

  // CRITICAL: Ensure at least the current year is set using dynasty's team info
  // This is the primary fallback for newly created dynasties
  const currentYear = migrated.currentYear
  if (currentYear && !initCoachTeamByYear[currentYear]) {
    // Try multiple ways to get the team tid
    let currentTid = migrated.currentTid

    // Fallback 1: Try to get tid from teamName
    if (!currentTid && migrated.teamName) {
      currentTid = getTidFromTeamName(migrated.teamName, migrated.teams)
    }

    // Fallback 2: Try to get tid from any game in the current year
    if (!currentTid && migrated.games) {
      const currentYearGame = migrated.games.find(g => isSameYear(g.year, currentYear))
      if (currentYearGame) {
        currentTid = currentYearGame.userTid || getTidFromAbbr(currentYearGame.userTeam)
      }
    }

    if (currentTid) {
      const currentTeam = migrated.teams?.[currentTid]
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

/**
 * Migration: Initialize user team system on existing dynasties
 * Sets userId and coachPosition on the current team, creates coachCareer from coachTeamByYear
 */
export function migrateToUserTeamSystem(dynasty) {
  if (!dynasty) return dynasty
  if (dynasty._userTeamSystemMigrated) return dynasty

  try {
    let migrated = { ...dynasty }

    // Get current team tid
    const currentTid = getCurrentTeamTid(migrated)
    if (!currentTid) {
      // Can't migrate without knowing the current team - just mark as migrated
      migrated._userTeamSystemMigrated = true
      return migrated
    }

    // Get coach position (from dynasty.coachPosition or default to HC)
    const coachPosition = migrated.coachPosition || 'HC'

    // Update teams to set userId and coachPosition on current team
    if (migrated.teams && migrated.teams[currentTid]) {
      const existingTeam = migrated.teams[currentTid]
      // Only set if not already set
      if (existingTeam.userId !== 'currentUser') {
        migrated.teams = {
          ...migrated.teams,
          [currentTid]: {
            ...existingTeam,
            userId: 'currentUser',
            coachPosition: coachPosition
          }
        }
      }
    }

    // Create coachCareer from coachTeamByYear if it doesn't exist
    if (!migrated.coachCareer && migrated.coachTeamByYear) {
      const coachCareer = []
      for (const [yearStr, entry] of Object.entries(migrated.coachTeamByYear)) {
        const year = Number(yearStr)
        const tid = entry.tid || getTidFromAbbr(entry.team)
        const position = entry.position || migrated.coachPosition || 'HC'
        if (tid && !isNaN(year)) {
          coachCareer.push({ year, tid, position })
        }
      }
      // Sort by year
      coachCareer.sort((a, b) => a.year - b.year)
      migrated.coachCareer = coachCareer
    }

    migrated._userTeamSystemMigrated = true
    return migrated
  } catch (err) {
    console.error('Error in migrateToUserTeamSystem:', err)
    // Return dynasty unchanged but mark as migrated to prevent retry loops
    return { ...dynasty, _userTeamSystemMigrated: true }
  }
}

// ============================================================================
// MOVEMENT TYPES - Player movement tracking system
// ============================================================================
export const MOVEMENT_TYPES = {
  RECRUITED: 'recruited',      // HS/JUCO recruit signs
  PORTAL_IN: 'portal_in',      // Transfer portal player commits
  TRANSFER: 'transfer',        // Player transfers to another team
  DEPARTURE: 'departure',      // Generic departure (legacy, use GRADUATE/DRAFT instead)
  GRADUATE: 'graduate',        // Player graduated (exhausted eligibility)
  DRAFT: 'draft',              // Player left early for NFL draft
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
export function getPlayersLeaving(dynasty, tidOrAbbr, year) {
  if (!dynasty) return []

  // Resolve tid - handle both numeric tid and string abbreviation
  let tid = typeof tidOrAbbr === 'number' ? tidOrAbbr : getTidFromAbbr(tidOrAbbr)

  // Try NEW tid-based byYear structure first (Phase 7 migration)
  if (tid && dynasty.teams?.[tid]?.byYear?.[year]?.playersLeaving) {
    return dynasty.teams[tid].byYear[year].playersLeaving
  }

  // Get abbr for legacy lookup
  const abbr = typeof tidOrAbbr === 'string' ? tidOrAbbr : (dynasty.teams?.[tid]?.abbr || getOriginalTeamAbbr(tid))

  // Check team-centric structure (old format)
  if (abbr) {
    const teamYear = dynasty.playersLeavingByTeamYear?.[abbr]?.[year] ||
                     dynasty.playersLeavingByTeamYear?.[abbr]?.[String(year)]
    if (teamYear) return teamYear
  }

  // Fall back to year-only structure (legacy format)
  return dynasty.playersLeavingByYear?.[year] || dynasty.playersLeavingByYear?.[String(year)] || []
}

/**
 * Get conference championship data for a given team and year
 * Checks tid-based byYear first, then team-centric, then year-only for backward compatibility
 * @param {Object} dynasty - The dynasty object
 * @param {number|string} tidOrAbbr - Team ID (number) or abbreviation (string)
 * @param {number} year - The year
 * @returns {Object|null} Conference championship data or null
 */
export function getConferenceChampionshipData(dynasty, tidOrAbbr, year) {
  if (!dynasty) return null

  // Resolve tid - handle both numeric tid and string abbreviation
  let tid = typeof tidOrAbbr === 'number' ? tidOrAbbr : getTidFromAbbr(tidOrAbbr)

  // Try NEW tid-based byYear structure first (Phase 7 migration)
  if (tid && dynasty.teams?.[tid]?.byYear?.[year]?.conferenceChampionshipData) {
    return dynasty.teams[tid].byYear[year].conferenceChampionshipData
  }

  // Fall back to abbr-based structure (old format)
  // Need abbr for legacy lookup
  const abbr = typeof tidOrAbbr === 'string' ? tidOrAbbr : (dynasty.teams?.[tid]?.abbr || getOriginalTeamAbbr(tid))
  if (abbr) {
    const teamYear = dynasty.conferenceChampionshipDataByTeamYear?.[abbr]?.[year] ||
                     dynasty.conferenceChampionshipDataByTeamYear?.[abbr]?.[String(year)]
    if (teamYear) return teamYear
  }

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
 * @param {Object} dynasty - The dynasty object
 * @param {number|string} tidOrAbbr - Team ID (number) or abbreviation (string)
 * @param {number} year - The year
 * @returns {Object} Training results data or empty object
 */
export function getTrainingResults(dynasty, tidOrAbbr, year) {
  if (!dynasty) return {}

  // Resolve tid - handle both numeric tid and string abbreviation
  let tid = typeof tidOrAbbr === 'number' ? tidOrAbbr : getTidFromAbbr(tidOrAbbr)

  // Try NEW tid-based byYear structure first (Phase 7 migration)
  if (tid && dynasty.teams?.[tid]?.byYear?.[year]?.trainingResults) {
    return dynasty.teams[tid].byYear[year].trainingResults
  }

  // Fall back to abbr-based structure (old format)
  // Need abbr for legacy lookup
  const abbr = typeof tidOrAbbr === 'string' ? tidOrAbbr : (dynasty.teams?.[tid]?.abbr || getOriginalTeamAbbr(tid))
  if (abbr) {
    const teamYear = dynasty.trainingResultsByTeamYear?.[abbr]?.[year] ||
                     dynasty.trainingResultsByTeamYear?.[abbr]?.[String(year)]
    if (teamYear) return teamYear
  }

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
 * Get encourage transfers for a given team and year
 * Checks tid-based byYear first, then abbr-based for backward compatibility
 * @param {Object} dynasty - The dynasty object
 * @param {number|string} tidOrAbbr - Team ID (number) or abbreviation (string)
 * @param {number} year - The year
 * @returns {Array} Array of encouraged transfer players
 */
export function getEncourageTransfers(dynasty, tidOrAbbr, year) {
  if (!dynasty) return []

  // Resolve tid - handle both numeric tid and string abbreviation
  let tid = typeof tidOrAbbr === 'number' ? tidOrAbbr : getTidFromAbbr(tidOrAbbr)

  // Try NEW tid-based byYear structure first
  if (tid && dynasty.teams?.[tid]?.byYear?.[year]?.encourageTransfers) {
    return dynasty.teams[tid].byYear[year].encourageTransfers
  }

  // Fall back to abbr-based structure (old format)
  // Need abbr for legacy lookup
  const abbr = typeof tidOrAbbr === 'string' ? tidOrAbbr : (dynasty.teams?.[tid]?.abbr || getOriginalTeamAbbr(tid))
  if (abbr) {
    const teamYear = dynasty.encourageTransfersByTeamYear?.[abbr]?.[year] ||
                     dynasty.encourageTransfersByTeamYear?.[abbr]?.[String(year)]
    if (teamYear) return teamYear
  }

  return []
}

/**
 * Get recruiting commitments for a given team and year
 * Checks tid-based byYear first, then abbr-based for backward compatibility
 * @param {Object} dynasty - The dynasty object
 * @param {number|string} tidOrAbbr - Team ID (number) or abbreviation (string)
 * @param {number} year - The year
 * @returns {Object} Object of commitment keys to arrays of commits (e.g., { preseason: [...], regular_1: [...] })
 */
export function getRecruitingCommitments(dynasty, tidOrAbbr, year) {
  if (!dynasty) return {}

  // Resolve tid - handle both numeric tid and string abbreviation
  let tid = typeof tidOrAbbr === 'number' ? tidOrAbbr : getTidFromAbbr(tidOrAbbr)

  // Try NEW tid-based byYear structure first
  if (tid && dynasty.teams?.[tid]?.byYear?.[year]?.recruitingCommitments) {
    return dynasty.teams[tid].byYear[year].recruitingCommitments
  }

  // Fall back to abbr-based structure (old format)
  // Need abbr for legacy lookup
  const abbr = typeof tidOrAbbr === 'string' ? tidOrAbbr : (dynasty.teams?.[tid]?.abbr || getOriginalTeamAbbr(tid))
  if (abbr) {
    const teamYear = dynasty.recruitingCommitmentsByTeamYear?.[abbr]?.[year] ||
                     dynasty.recruitingCommitmentsByTeamYear?.[abbr]?.[String(year)]
    if (teamYear) return teamYear
  }

  return {}
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

  // Get tid directly - tid is the ONLY source of truth
  const teamTid = getCurrentTeamTid(dynasty)

  const migratedPlayers = dynasty.players.map(player => {
    // Skip if already has movements array
    if (player.movements && player.movements.length > 0) {
      return player
    }

    const movements = []

    // Determine the player's origin team as tid
    // player.team could be tid (number) or abbr (string) for legacy data
    let originTeam = player.team
    if (typeof originTeam === 'string') {
      // Convert legacy abbr to tid
      originTeam = getTidFromAbbr(originTeam) || teamTid
    }
    if (!originTeam) {
      originTeam = teamTid
    }

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
  const { user, isPremium, subscription } = useAuth()
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
      // Also check if any player still has abbr in teamsByYear (migration flag set but data not persisted)
      const needsDataMigration = !migrated._tidFullyMigrated || (() => {
        // Check if any player still has string (abbr) values in teamsByYear
        const players = migrated.players || []
        return players.some(p => {
          if (!p.teamsByYear) return false
          return Object.values(p.teamsByYear).some(v => typeof v === 'string' && !/^\d+$/.test(v))
        })
      })()

      if (needsDataMigration) {
        const wasAlreadyFlagged = migrated._tidFullyMigrated
        migrated = migrateToFullTidSystem(migrated)
        migrated._tidFullyMigrated = true
        // Mark that data needs persisting if we just migrated data that wasn't persisted before
        if (wasAlreadyFlagged) {
          migrated._tidDataMigrationPending = true
        }
      }

      // Ensure coachTeamByYear is initialized (for dynasties created before this feature)
      // This is separate from _tidFullyMigrated because that migration only runs once
      if (!migrated._coachTeamByYearMigrated) {
        migrated = migrateCoachTeamByYear(migrated)
        migrated._coachTeamByYearMigrated = true
      }

      // NEW: Migrate to user team system (userId on teams, coachCareer array)
      if (!migrated._userTeamSystemMigrated) {
        migrated = migrateToUserTeamSystem(migrated)
      }

      // FIX: Ensure coachTeamByYear has correct entries for ALL years with games
      // Infer from games data - find what team the user played as each year
      const games = migrated.games || []
      const inferredTeamsByYear = {}

      // First pass: Get teams for years where we have explicit data (userTid or userTeam)
      games.forEach(g => {
        if (!g.year) return
        const year = Number(g.year)
        if (inferredTeamsByYear[year]) return // Already found team for this year

        // PRIORITY 1: Check userTid on the game itself (most reliable - set when game was entered)
        if (g.userTid) {
          inferredTeamsByYear[year] = g.userTid
          return
        }

        // PRIORITY 2: Check userTeam field (legacy format)
        if (g.userTeam) {
          const tid = getTidFromAbbr(g.userTeam)
          if (tid) {
            inferredTeamsByYear[year] = tid
            return
          }
        }
      })

      // Second pass: For unified format games without userTid/userTeam, use smarter inference
      games.forEach(g => {
        if (!g.year) return
        const year = Number(g.year)
        if (inferredTeamsByYear[year]) return // Already found team for this year

        if (g.team1Tid && g.team2Tid) {
          // PRIORITY 3: Check if one of the teams matches a NEARBY year's coachTeamByYear
          // This handles cases where user played consecutive seasons with same team
          const nearbyYears = [year - 1, year + 1, year - 2, year + 2]
          for (const nearbyYear of nearbyYears) {
            const nearbyEntry = migrated.coachTeamByYear?.[nearbyYear] || inferredTeamsByYear[nearbyYear]
            const nearbyTid = typeof nearbyEntry === 'object' ? nearbyEntry?.tid : nearbyEntry
            if (nearbyTid && (g.team1Tid === nearbyTid || g.team2Tid === nearbyTid)) {
              inferredTeamsByYear[year] = nearbyTid
              return
            }
          }

          // PRIORITY 4: Try to infer from coachingHistory
          const history = migrated.coachingHistory || []
          for (const stint of history) {
            if (year >= stint.startYear && year <= stint.endYear) {
              const stintTid = getTidFromTeamName(stint.teamName, migrated.teams)
              if (stintTid && (g.team1Tid === stintTid || g.team2Tid === stintTid)) {
                inferredTeamsByYear[year] = stintTid
                return
              }
            }
          }

          // PRIORITY 5: Check if dynasty starting team matches (for early years)
          const startingTid = getTidFromTeamName(migrated.teamName, migrated.teams) ||
                              getTidFromAbbr(migrated.teamName)
          if (startingTid && (g.team1Tid === startingTid || g.team2Tid === startingTid)) {
            if (year <= (migrated.startYear || 2025) + 1) {
              inferredTeamsByYear[year] = startingTid
              return
            }
          }

          // Last resort: Check if current team matches (only for most recent year with no games after)
          // Avoid using this for years where user already switched teams
          const hasLaterYearInferred = Object.keys(inferredTeamsByYear).some(y => Number(y) > year)
          if (!hasLaterYearInferred) {
            const currentTid = getCurrentTeamTid(migrated)
            if (currentTid && (g.team1Tid === currentTid || g.team2Tid === currentTid)) {
              inferredTeamsByYear[year] = currentTid
            }
          }
        }
      })

      // Fix coachTeamByYear for any years that are missing or wrong
      let coachTeamByYearUpdated = false
      const updatedCoachTeamByYear = { ...migrated.coachTeamByYear }

      for (const [yearStr, tid] of Object.entries(inferredTeamsByYear)) {
        const year = Number(yearStr)
        const existingEntry = updatedCoachTeamByYear[year]
        if (!existingEntry || existingEntry.tid !== tid) {
          const team = migrated.teams?.[tid] || TEAMS[tid]
          updatedCoachTeamByYear[year] = {
            tid: tid,
            team: team?.abbr,
            teamName: team?.name,
            position: 'HC',
            conference: ''
          }
          coachTeamByYearUpdated = true
        }
      }

      // Also fix current year if in playing phase
      const isPlayingPhase = ['preseason', 'regular_season', 'conference_championship', 'postseason'].includes(migrated.currentPhase)
      const currentTid = getCurrentTeamTid(migrated)
      const currentYearEntry = updatedCoachTeamByYear[migrated.currentYear]
      if (isPlayingPhase && currentTid && (!currentYearEntry || currentYearEntry.tid !== currentTid)) {
        const currentTeamAbbr = getCurrentTeamAbbr(migrated)
        updatedCoachTeamByYear[migrated.currentYear] = {
          tid: currentTid,
          team: currentTeamAbbr,
          teamName: migrated.teamName,
          position: migrated.coachPosition || 'HC',
          conference: migrated.conference
        }
        coachTeamByYearUpdated = true
      }

      if (coachTeamByYearUpdated) {
        migrated.coachTeamByYear = updatedCoachTeamByYear
      }

      return migrated
    })
  }

  // Load dynasties - ALWAYS loads from both local and cloud (if signed in)
  // Each dynasty has a storageType field ('local' or 'cloud') to track where it lives
  useEffect(() => {
    console.log('[DynastyContext] Loading dynasties effect triggered. isPremium:', isPremium, 'user:', user?.uid)
    // Initialize storage service with user info
    storageService.initialize({ isPremium, uid: user?.uid })

    // Track local dynasties separately (they don't have real-time updates)
    let localDynastiesRef = []

    // Load local dynasties (IndexedDB) - always available
    const loadLocalDynasties = async () => {
      try {
        // First, migrate any existing localStorage data to IndexedDB
        await indexedDBStorage.migrateFromLocalStorage()

        // Load from IndexedDB
        const saved = await indexedDBStorage.getDynasties()
        console.log('[DynastyContext] Loaded from IndexedDB:', saved?.length || 0, 'dynasties', saved?.map(d => ({ id: d.id, name: d.teamName })))
        // Tag each with storageType: 'local'
        localDynastiesRef = (saved || []).map(d => ({
          ...d,
          storageType: 'local'
        }))
        return localDynastiesRef
      } catch (error) {
        console.error('Error loading local dynasties:', error)
        return []
      }
    }

    // If user is not signed in, only load local dynasties
    if (!user) {
      const loadOnlyLocal = async () => {
        const localDynasties = await loadLocalDynasties()
        if (localDynasties.length > 0) {
          const migratedDynasties = applyMigrations(localDynasties)
          setDynasties(migratedDynasties)
        } else {
          setDynasties([])
        }
        setLoading(false)
      }
      loadOnlyLocal()
      return
    }

    // User is signed in - load BOTH local and cloud dynasties
    // NOTE: Automatic migration is DISABLED. Users must manually migrate dynasties
    // through the Storage Switch Modal to avoid duplicates and size limit issues.
    // The old migrateLocalStorageData() caused problems:
    // - Created duplicate dynasties in Firestore
    // - Failed for large dynasties (>1MB) without proper subcollection handling
    // - Cleared IndexedDB even on partial failures

    // Load local dynasties first, then subscribe to cloud updates
    loadLocalDynasties().then(localDynasties => {
      // If we have local dynasties, show them immediately
      if (localDynasties.length > 0 && dynasties.length === 0) {
        const migratedLocal = applyMigrations(localDynasties)
        setDynasties(migratedLocal)
      }
    })

    // Subscribe to real-time updates for cloud dynasties (Firestore)
    const unsubscribe = subscribeToDynasties(user.uid, async (firestoreDynasties) => {
      console.log('[DynastyContext] Firestore subscription callback. Cloud dynasties:', firestoreDynasties?.length || 0, firestoreDynasties?.map(d => ({ id: d.id, name: d.teamName })))
      // Check if we should skip this update (we just manually updated local state)
      if (skipListenerUpdatesCountRef.current > 0) {
        skipListenerUpdatesCountRef.current--
        return
      }

      // Load subcollections for each cloud dynasty in parallel
      const cloudDynastiesWithSubcollections = await Promise.all(
        firestoreDynasties.map(async (dynasty) => {
          try {
            // Tag as cloud storage
            const taggedDynasty = { ...dynasty, storageType: 'cloud' }

            // Check if this dynasty has been migrated to subcollections
            if (dynasty._subcollectionsMigrated) {
              // Fetch from subcollections
              const [players, games] = await Promise.all([
                getPlayersSubcollection(dynasty.id),
                getGamesSubcollection(dynasty.id)
              ])
              return {
                ...taggedDynasty,
                players: players,
                games: games
              }
            } else {
              // Not yet migrated - use main document data
              const hasDataToMigrate = (dynasty.players?.length > 0 || dynasty.games?.length > 0)
              if (hasDataToMigrate) {
                console.log(`Dynasty ${dynasty.id} needs migration to subcollections (use Admin Tools)`)
              }
              return taggedDynasty
            }
          } catch (err) {
            console.error(`Error loading subcollections for dynasty ${dynasty.id}:`, err)
            return { ...dynasty, storageType: 'cloud' }
          }
        })
      )

      // Reload local dynasties to get fresh data
      const freshLocalDynasties = await loadLocalDynasties()

      // NOTE: Auto-migration for non-premium users is DISABLED.
      // Previously this would copy cloud dynasties to local and DELETE from Firestore,
      // which was too aggressive and caused data loss. Now we just show both.
      // Users can manually migrate through the Storage Switch Modal if needed.
      const dynastiesToUse = cloudDynastiesWithSubcollections

      // Combine local and cloud dynasties with deduplication
      // dynastiesToUse is either: cloud dynasties (premium) or converted-to-local dynasties (non-premium)
      const usedIds = new Set(dynastiesToUse.map(d => d.id))
      const uniqueLocalDynasties = freshLocalDynasties.filter(d => !usedIds.has(d.id))
      const allDynasties = [...uniqueLocalDynasties, ...dynastiesToUse]

      console.log('[DynastyContext] Merging dynasties:', {
        freshLocal: freshLocalDynasties?.length || 0,
        dynastiesToUse: dynastiesToUse?.length || 0,
        uniqueLocal: uniqueLocalDynasties?.length || 0,
        total: allDynasties?.length || 0,
        isPremium
      })

      // Apply all migrations
      const migratedDynasties = applyMigrations(allDynasties)

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
      // NOTE: Only process cloud dynasties (migratedDynasties includes both local and cloud)
      cloudDynastiesWithSubcollections.forEach((migrated) => {
        // Find the matching raw dynasty by ID (not index, since arrays may differ)
        const raw = firestoreDynasties.find(d => d.id === migrated.id)
        if (!raw) return // Skip if no matching raw dynasty found

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
        // Persist migrated data when flag is newly set OR when data migration was pending
        const shouldPersistMigratedData = (migrated._tidFullyMigrated && !raw._tidFullyMigrated) || migrated._tidDataMigrationPending

        if (migrated._tidFullyMigrated && !raw._tidFullyMigrated) {
          flagsToSave._tidFullyMigrated = true
          // Also persist currentTid since it's added during migration
          if (migrated.currentTid) {
            flagsToSave.currentTid = migrated.currentTid
          }
        }

        if (shouldPersistMigratedData) {
          // CRITICAL: Persist the migrated players with tid-based teamsByYear
          // This ensures the migration is permanent and not just in memory
          if (migrated.players && migrated.players.length > 0 && migrated._subcollectionsMigrated) {
            savePlayersToSubcollection(migrated.id, migrated.players).catch(err => {
              console.error('Failed to persist migrated players:', err)
            })
          }
          // Also persist games with unified format
          if (migrated.games && migrated.games.length > 0 && migrated._subcollectionsMigrated) {
            saveGamesToSubcollection(migrated.id, migrated.games).catch(err => {
              console.error('Failed to persist migrated games:', err)
            })
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
  }, [user, isPremium, migrated, currentDynasty?.id])

  // Save local dynasties to IndexedDB whenever dynasties state changes
  // Only saves dynasties with storageType !== 'cloud'
  useEffect(() => {
    // Don't save during initial load
    if (loading) return

    // Filter to only local dynasties
    const localDynasties = dynasties.filter(d => d.storageType !== 'cloud')

    if (localDynasties.length > 0) {
      // Save to IndexedDB (async, fire and forget)
      indexedDBStorage.saveDynasties(localDynasties).catch(error => {
        console.error('Error saving local dynasties to IndexedDB:', error)
      })
    }
    // Note: We don't remove data when empty to avoid accidental data loss
  }, [dynasties, loading])

  // Clear pendingDowngrade flag if set (legacy from old auto-migration system)
  // We no longer auto-migrate - instead cloud dynasties become read-only for non-premium users
  // Users must manually export and import as local to continue editing
  useEffect(() => {
    if (!user || !subscription?.pendingDowngrade) return

    // Just clear the flag - no auto-migration
    console.log('[DynastyContext] Premium expired - cloud dynasties are now read-only. Clearing pendingDowngrade flag.')
    updateDoc(doc(db, 'users', user.uid), { pendingDowngrade: false })
      .catch(err => console.error('Failed to clear pendingDowngrade flag:', err))
  }, [user, subscription?.pendingDowngrade])

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

    // Get coach position (defaults to HC if not specified)
    const coachPosition = dynastyData.coachPosition || 'HC'

    // NEW USER TEAM SYSTEM: Set userId and coachPosition on the user's team
    // This is the new source of truth for who controls which team
    if (currentTid && teams[currentTid]) {
      teams[currentTid] = {
        ...teams[currentTid],
        userId: 'currentUser',
        coachPosition: coachPosition
      }
    }

    // Create first career entry
    const coachCareer = addCareerEntry([], startYear, currentTid, coachPosition)

    // Determine storage type for new dynasty:
    // - If storageType is explicitly passed (e.g., from UI), use that
    // - Premium users default to 'cloud', free users default to 'local'
    // - Cloud storage requires both premium AND a signed-in user
    const requestedStorageType = dynastyData.storageType || (isPremium && user ? 'cloud' : 'local')
    const finalStorageType = (requestedStorageType === 'cloud' && isPremium && user) ? 'cloud' : 'local'

    const newDynastyData = {
      ...dynastyData,
      currentTid, // Primary team identifier (tid) - kept for backwards compatibility
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
      // Now includes userId and coachPosition on the user's team
      teams,
      _tidMigrated: true, // Mark as already using tid-based team registry
      _tidFullyMigrated: true, // Mark as using full tid system (currentTid, player.teamsByYear as tid, game.userTid, etc.)
      // NEW: Coach career array - historical record of coaching positions
      coachCareer,
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
      // Storage location for this dynasty
      storageType: finalStorageType,
      // Initialize custom conferences if custom teams exist (replaces old team in conference)
      ...(initialConferences ? {
        customConferencesByYear: {
          [startYear]: initialConferences
        },
        customConferences: initialConferences // Legacy field for backwards compatibility
      } : {})
    }

    // Note: Google Sheet is created lazily when user opens Schedule Entry modal
    // This avoids creating sheets that may never be used

    // Route to correct storage backend based on dynasty's storageType
    if (finalStorageType === 'local' || !user) {
      // Local storage: use IndexedDB
      const newDynasty = {
        id: Date.now().toString(),
        ...newDynastyData,
        createdAt: new Date().toISOString(),
        lastModified: Date.now()
      }

      // Immediately save to IndexedDB before updating state
      // IMPORTANT: Only save local dynasties to IndexedDB (filter out cloud ones)
      const existingLocalDynasties = dynasties.filter(d => d.storageType !== 'cloud')
      const updatedLocalDynasties = [...existingLocalDynasties, newDynasty]
      await indexedDBStorage.saveDynasties(updatedLocalDynasties)

      // Update state with all dynasties (local + cloud)
      const updatedDynasties = [...dynasties, newDynasty]

      setDynasties(updatedDynasties)
      setCurrentDynasty(newDynasty)
      return newDynasty
    }

    // Cloud storage: use Firestore
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
    const { skipLastModified = false } = options

    // Find the dynasty to determine its storage type
    let dynasty = dynasties.find(d => String(d.id) === String(dynastyId))
    if (!dynasty && String(currentDynasty?.id) === String(dynastyId)) {
      dynasty = currentDynasty
    }

    // Route based on dynasty's storageType, not global premium status
    const isLocalStorage = !dynasty || dynasty.storageType !== 'cloud' || !user

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

    if (isLocalStorage) {
      // Local storage: update IndexedDB

      // CRITICAL FIX: Read from IndexedDB to get the absolute latest local data
      // This prevents race conditions when multiple updates happen in quick succession
      const currentLocalDynasties = await indexedDBStorage.getDynasties() || []

      // Update the specific dynasty in the local dynasties list
      const updatedLocalDynasties = currentLocalDynasties.map(d =>
        String(d.id) === String(dynastyId) ? { ...d, ...updatesWithTimestamp } : d
      )

      // Immediately save to IndexedDB (only local dynasties)
      await indexedDBStorage.saveDynasties(updatedLocalDynasties)

      // Update state: merge updated local dynasties with existing cloud dynasties
      // This preserves cloud dynasties in the state
      const cloudDynasties = dynasties.filter(d => d.storageType === 'cloud')
      const updatedAllDynasties = [...updatedLocalDynasties.map(d => ({ ...d, storageType: 'local' })), ...cloudDynasties]

      setDynasties(updatedAllDynasties)

      // CRITICAL FIX: Update currentDynasty with the full updated object from the array
      // instead of just merging updates (which can miss nested object changes)
      if (String(currentDynasty?.id) === String(dynastyId)) {
        const updatedDynasty = updatedAllDynasties.find(d => String(d.id) === String(dynastyId))
        setCurrentDynasty(updatedDynasty)
      }
      return
    }

    // Cloud storage: update Firestore
    try {
      // Set counter to skip the next 2 listener updates BEFORE calling Firestore
      // (the listener fires during updateDoc, not after)
      skipListenerUpdatesCountRef.current = 2

      // Check if dynasty is migrated to subcollections
      // (dynasty was already looked up at top of function for storage routing)
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
    // Find the dynasty to determine its storage type
    const dynasty = dynasties.find(d => String(d.id) === String(dynastyId))

    // Route based on dynasty's storageType, not global premium status
    const isLocalStorage = !dynasty || dynasty.storageType !== 'cloud' || !user

    if (isLocalStorage) {
      // Local storage: delete from IndexedDB
      const updated = dynasties.filter(d => {
        const match = String(d.id) !== String(dynastyId)
        return match
      })

      // Immediately save to IndexedDB (only local dynasties)
      const localDynasties = updated.filter(d => d.storageType !== 'cloud')
      if (localDynasties.length > 0) {
        await indexedDBStorage.saveDynasties(localDynasties)
      } else {
        await indexedDBStorage.clearAll()
      }

      setDynasties(updated)

      if (String(currentDynasty?.id) === String(dynastyId)) {
        setCurrentDynasty(null)
      }
      return
    }

    // Cloud storage: delete from Firestore (including subcollections)
    try {
      // Use the new function that also deletes players/games subcollections
      await deleteDynastyWithSubcollections(dynastyId)

      // Remove from local state
      const updated = dynasties.filter(d => String(d.id) !== String(dynastyId))
      setDynasties(updated)

      if (String(currentDynasty?.id) === String(dynastyId)) {
        setCurrentDynasty(null)
      }
    } catch (error) {
      console.error('Error deleting dynasty from Firestore:', error)
      throw error
    }
  }

  const selectDynasty = (dynastyId) => {
    const dynasty = dynasties.find(d => d.id === dynastyId)
    setCurrentDynasty(dynasty || null)
  }

  const addGame = async (dynastyId, gameData) => {
    console.log('[addGame] Called with:', { dynastyId, gameId: gameData.id, cfpSlot: gameData.cfpSlot, bowlName: gameData.bowlName, team1Tid: gameData.team1Tid, team2Tid: gameData.team2Tid, isCFPQuarterfinal: gameData.isCFPQuarterfinal })

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

    // CRITICAL: Read from IndexedDB to get the latest data
    const useLocalStorage = !storageService.isPremium()
    let dynasty

    if (useLocalStorage || !user) {
      const currentDynasties = await indexedDBStorage.getDynasties() || dynasties
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
        const userSeed = cfpSeeds.find(s => s.tid === userTid)?.seed
        const oppSeed = cfpSeeds.find(s => s.tid === opponentTid)?.seed || (userSeed ? 17 - userSeed : null)

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

    // Check if game already exists
    // PRIORITY 1: Match by ID (most reliable, especially for CFP games with multiple per year)
    // PRIORITY 2: Match by type+year (fallback for games without explicit ID)
    let existingGameIndex = -1
    let foundById = false // Track if we found the game by ID (to prevent ID override)

    // First try to find by ID if provided
    if (cleanGameData.id) {
      existingGameIndex = dynasty.games?.findIndex(g => g.id === cleanGameData.id) ?? -1
      foundById = existingGameIndex !== -1
      if (foundById) {
        console.log('[addGame] Found game by ID:', { id: cleanGameData.id, existingGameIndex })
      }
    }

    // If not found by ID, fall back to type+year matching
    // Special handling for CC games, bowl games, and CFP games
    if (existingGameIndex === -1) {
      if (cleanGameData.isConferenceChampionship) {
        existingGameIndex = dynasty.games?.findIndex(
          g => g.isConferenceChampionship && Number(g.year) === Number(cleanGameData.year)
        )
      } else if (cleanGameData.isBowlGame) {
        existingGameIndex = dynasty.games?.findIndex(
          g => g.isBowlGame && Number(g.year) === Number(cleanGameData.year)
        )
      } else if (cleanGameData.isCFPFirstRound) {
        // For CFP First Round, also match by cfpSlot or seed pair
        existingGameIndex = dynasty.games?.findIndex(
          g => g.isCFPFirstRound && Number(g.year) === Number(cleanGameData.year) &&
               (g.cfpSlot === cleanGameData.cfpSlot ||
                (g.seed1 === cleanGameData.seed1 && g.seed2 === cleanGameData.seed2))
        )
        // Fallback: any first round game for this year if no slot match
        if (existingGameIndex === -1) {
          existingGameIndex = dynasty.games?.findIndex(
            g => g.isCFPFirstRound && Number(g.year) === Number(cleanGameData.year)
          )
        }
      } else if (cleanGameData.isCFPQuarterfinal) {
        // For CFP QF, match by cfpSlot or bowlName (4 QF games per year)
        existingGameIndex = dynasty.games?.findIndex(
          g => g.isCFPQuarterfinal && Number(g.year) === Number(cleanGameData.year) &&
               (g.cfpSlot === cleanGameData.cfpSlot || g.bowlName === cleanGameData.bowlName)
        )
        // Fallback: any QF game for this year if no slot match
        if (existingGameIndex === -1) {
          existingGameIndex = dynasty.games?.findIndex(
            g => g.isCFPQuarterfinal && Number(g.year) === Number(cleanGameData.year)
          )
        }
      } else if (cleanGameData.isCFPSemifinal) {
        // For CFP SF, match by cfpSlot or bowlName (2 SF games per year)
        existingGameIndex = dynasty.games?.findIndex(
          g => g.isCFPSemifinal && Number(g.year) === Number(cleanGameData.year) &&
               (g.cfpSlot === cleanGameData.cfpSlot || g.bowlName === cleanGameData.bowlName)
        )
        // Fallback: any SF game for this year if no slot match
        if (existingGameIndex === -1) {
          existingGameIndex = dynasty.games?.findIndex(
            g => g.isCFPSemifinal && Number(g.year) === Number(cleanGameData.year)
          )
        }
      } else if (cleanGameData.isCFPChampionship) {
        existingGameIndex = dynasty.games?.findIndex(
          g => g.isCFPChampionship && Number(g.year) === Number(cleanGameData.year)
        )
      } else {
        existingGameIndex = dynasty.games?.findIndex(
          g => Number(g.week) === Number(cleanGameData.week) && Number(g.year) === Number(cleanGameData.year)
        )
      }
    }

    let updatedGames
    let game

    if (existingGameIndex !== -1 && existingGameIndex !== undefined) {
      // Update existing game - ensure it has proper ID (especially for CFP games)
      const existingGame = dynasty.games[existingGameIndex]

      // For CFP games, ensure proper slot ID format
      let gameId = existingGame.id || Date.now().toString()
      let cfpSeedData = {} // To store seed info for CFP First Round games

      // CRITICAL: If we found the game by ID, PRESERVE that ID - don't recalculate
      // Recalculating can cause the wrong game to be updated if cfpSlot or bye seed lookup
      // returns a different slot than expected
      if (foundById) {
        console.log('[addGame] Preserving game ID (found by ID):', { gameId })
      } else if (cleanGameData.isCFPFirstRound || existingGame.isCFPFirstRound) {
        // Check if this is a CFP game that needs ID correction
        const cfpSeeds = dynasty.cfpSeedsByYear?.[cleanGameData.year || existingGame.year] || []
        const userTidForSeed = getCurrentTeamTid(dynasty)
        const userSeed = cfpSeeds.find(s => s.tid === userTidForSeed)?.seed
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
      } else if (cleanGameData.isCFPQuarterfinal || existingGame.isCFPQuarterfinal) {
        // For QF games: PRESERVE existing cfpSlot if available, otherwise find by bye seed
        let slotId = cleanGameData.cfpSlot || existingGame.cfpSlot
        const gameYear = cleanGameData.year || existingGame.year

        if (!slotId) {
          // Find slot by bye seed (which top-4 seed is in this game)
          const cfpSeeds = dynasty.cfpSeedsByYear?.[gameYear] || []
          const team1Tid = cleanGameData.team1Tid || existingGame.team1Tid
          const team2Tid = cleanGameData.team2Tid || existingGame.team2Tid
          const slotToByeSeed = { cfpqf1: 1, cfpqf2: 4, cfpqf3: 3, cfpqf4: 2 }

          for (const [slot, byeSeed] of Object.entries(slotToByeSeed)) {
            const byeSeedEntry = cfpSeeds.find(s => s.seed === byeSeed)
            if (byeSeedEntry && (byeSeedEntry.tid === team1Tid || byeSeedEntry.tid === team2Tid)) {
              slotId = slot
              console.log('[addGame] QF: Found slot by bye seed:', { slot, byeSeed, byeSeedTid: byeSeedEntry.tid })
              break
            }
          }
        }

        if (slotId) {
          gameId = getCFPGameId(slotId, gameYear)
          console.log('[addGame] QF: Using slotId:', { slotId, gameId })
        } else {
          console.log('[addGame] QF: Could not determine slotId!')
        }
      } else if (cleanGameData.isCFPSemifinal || existingGame.isCFPSemifinal) {
        // For SF games: PRESERVE existing cfpSlot if available
        let slotId = cleanGameData.cfpSlot || existingGame.cfpSlot
        if (!slotId && (cleanGameData.bowlName || existingGame.bowlName)) {
          // Fallback to bowl name lookup only if no slot set
          slotId = getSlotIdFromBowlName(cleanGameData.bowlName || existingGame.bowlName)
        }
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
        const userTidForSeed = getCurrentTeamTid(dynasty)
        const userSeed = cfpSeeds.find(s => s.tid === userTidForSeed)?.seed
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
      } else if (cleanGameData.isCFPQuarterfinal) {
        // For new QF games: use cfpSlot if provided, otherwise find by bye seed
        let slotId = cleanGameData.cfpSlot

        if (!slotId && cleanGameData.team1Tid) {
          // Find slot by bye seed (which top-4 seed is in this game)
          const cfpSeeds = dynasty.cfpSeedsByYear?.[cleanGameData.year] || []
          const slotToByeSeed = { cfpqf1: 1, cfpqf2: 4, cfpqf3: 3, cfpqf4: 2 }

          for (const [slot, byeSeed] of Object.entries(slotToByeSeed)) {
            const byeSeedEntry = cfpSeeds.find(s => s.seed === byeSeed)
            if (byeSeedEntry && (byeSeedEntry.tid === cleanGameData.team1Tid || byeSeedEntry.tid === cleanGameData.team2Tid)) {
              slotId = slot
              console.log('[addGame] New QF: Found slot by bye seed:', { slot, byeSeed })
              break
            }
          }
        }

        if (slotId) {
          gameId = getCFPGameId(slotId, cleanGameData.year)
        }
      } else if (cleanGameData.isCFPSemifinal) {
        // For new SF games: use cfpSlot if provided, fallback to bowl name
        let slotId = cleanGameData.cfpSlot
        if (!slotId && cleanGameData.bowlName) {
          slotId = getSlotIdFromBowlName(cleanGameData.bowlName)
        }
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
    const useLocalStorage = !storageService.isPremium()
    let dynasty

    if (useLocalStorage || !user) {
      const currentDynasties = await indexedDBStorage.getDynasties() || dynasties
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
  // UPDATED: Now properly updates existing game shells created at seed entry time
  const saveCFPGames = async (dynastyId, gamesData, year, roundType) => {
    const useLocalStorage = !storageService.isPremium()
    let dynasty

    if (useLocalStorage || !user) {
      const currentDynasties = await indexedDBStorage.getDynasties() || dynasties
      dynasty = currentDynasties.find(d => String(d.id) === String(dynastyId))
    } else {
      dynasty = String(currentDynasty?.id) === String(dynastyId)
        ? currentDynasty
        : dynasties.find(d => String(d.id) === String(dynastyId))
    }

    if (!dynasty) {
      console.error('[saveCFPGames] Dynasty not found:', dynastyId)
      return
    }

    // Start with all existing games - we'll update shells in place
    let updatedGames = [...(dynasty.games || [])]

    // Determine which legacy flag to use based on round type
    const legacyFlagMap = {
      [GAME_TYPES.CFP_FIRST_ROUND]: 'isCFPFirstRound',
      [GAME_TYPES.CFP_QUARTERFINAL]: 'isCFPQuarterfinal',
      [GAME_TYPES.CFP_SEMIFINAL]: 'isCFPSemifinal',
      [GAME_TYPES.CFP_CHAMPIONSHIP]: 'isCFPChampionship'
    }
    const legacyFlag = legacyFlagMap[roundType]

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

      // Determine winner (tid-based)
      const team1Score = parseInt(gameData.team1Score)
      const team2Score = parseInt(gameData.team2Score)
      const winnerTid = team1Score > team2Score ? team1Tid : team2Tid

      // CRITICAL FIX: For QF/SF games, find existing shell by BOWLNAME directly
      // This avoids the broken hardcoded bowl-to-slot mapping in getSlotIdFromBowlName
      // which doesn't account for user's custom bowl configuration
      let existingShell = null
      let existingIndex = -1

      if (roundType === GAME_TYPES.CFP_FIRST_ROUND) {
        // First round: match by seed pair
        const slotId = getFirstRoundSlotId(gameData.seed1, gameData.seed2)
        const gameId = slotId ? getCFPGameId(slotId, year) : null
        if (gameId) {
          existingIndex = updatedGames.findIndex(g => g.id === gameId)
        }
        if (existingIndex === -1) {
          // Fallback: find by seeds
          existingIndex = updatedGames.findIndex(g =>
            g.isCFPFirstRound && Number(g.year) === Number(year) &&
            ((g.seed1 === gameData.seed1 && g.seed2 === gameData.seed2) ||
             (g.seed1 === gameData.seed2 && g.seed2 === gameData.seed1))
          )
        }
      } else if (roundType === GAME_TYPES.CFP_QUARTERFINAL) {
        // BULLETPROOF QF: Determine slot from bye seed, NOT from bowl name
        // In QF games, team1 should be the bye seed (1-4). Map bye seed -> slot ID
        const byeSeedToSlot = { 1: 'cfpqf1', 2: 'cfpqf4', 3: 'cfpqf3', 4: 'cfpqf2' }

        // Try to find bye seed from gameData
        const byeSeed = gameData.seed1 // In QF, seed1 should be the bye seed (1-4)
        let expectedSlotId = null

        if (byeSeed && byeSeed >= 1 && byeSeed <= 4) {
          expectedSlotId = byeSeedToSlot[byeSeed]
          console.log(`[saveCFPGames] QF: Determined slot ${expectedSlotId} from bye seed ${byeSeed}`)
        }

        // PRIMARY: Find by slot ID
        if (expectedSlotId) {
          const expectedGameId = getCFPGameId(expectedSlotId, year)
          existingIndex = updatedGames.findIndex(g => g.id === expectedGameId)
          if (existingIndex >= 0) {
            console.log(`[saveCFPGames] QF: Found shell by slot ID ${expectedSlotId}:`, updatedGames[existingIndex].id)
          }
        }

        // SECONDARY: Find by cfpSlot field
        if (existingIndex === -1 && expectedSlotId) {
          existingIndex = updatedGames.findIndex(g =>
            g.cfpSlot === expectedSlotId &&
            Number(g.year) === Number(year) &&
            g.isCFPQuarterfinal
          )
          if (existingIndex >= 0) {
            console.log(`[saveCFPGames] QF: Found shell by cfpSlot field ${expectedSlotId}`)
          }
        }

        // TERTIARY: Find by bye seed team tid (in case shell doesn't have correct ID)
        if (existingIndex === -1 && team1Tid) {
          existingIndex = updatedGames.findIndex(g =>
            g.isCFPQuarterfinal &&
            Number(g.year) === Number(year) &&
            g.team1Tid === team1Tid // Bye seed team should be in team1 position
          )
          if (existingIndex >= 0) {
            console.log(`[saveCFPGames] QF: Found shell by bye seed team tid ${team1Tid}`)
          }
        }

        // Log if not found
        if (existingIndex === -1) {
          const availableShells = updatedGames.filter(g =>
            Number(g.year) === Number(year) && g.isCFPQuarterfinal
          ).map(g => ({ id: g.id, cfpSlot: g.cfpSlot, bowlName: g.bowlName, team1Tid: g.team1Tid }))
          console.log(`[saveCFPGames] QF: Shell NOT FOUND for bye seed ${byeSeed}. Available:`, availableShells)
        }
      } else if (roundType === GAME_TYPES.CFP_SEMIFINAL) {
        // BULLETPROOF SF: Determine slot from teams' QF origins
        // SF1 (cfpsf1) gets winners of cfpqf1 (seed 1) and cfpqf2 (seed 4)
        // SF2 (cfpsf2) gets winners of cfpqf3 (seed 3) and cfpqf4 (seed 2)

        // Try to determine which SF slot from gameData.slotId if provided
        let expectedSlotId = gameData.slotId || gameData.cfpSlot

        // If no slot ID, check which seeds are in this game to determine SF
        if (!expectedSlotId && (gameData.seed1 || gameData.seed2)) {
          const seeds = [gameData.seed1, gameData.seed2].filter(s => s)
          // Seeds 1 and 4 go to SF1, seeds 2 and 3 go to SF2
          const isSF1 = seeds.some(s => s === 1 || s === 4)
          const isSF2 = seeds.some(s => s === 2 || s === 3)
          if (isSF1 && !isSF2) expectedSlotId = 'cfpsf1'
          else if (isSF2 && !isSF1) expectedSlotId = 'cfpsf2'
          console.log(`[saveCFPGames] SF: Determined slot ${expectedSlotId} from seeds ${seeds}`)
        }

        // PRIMARY: Find by slot ID
        if (expectedSlotId) {
          const expectedGameId = getCFPGameId(expectedSlotId, year)
          existingIndex = updatedGames.findIndex(g => g.id === expectedGameId)
          if (existingIndex >= 0) {
            console.log(`[saveCFPGames] SF: Found shell by slot ID ${expectedSlotId}:`, updatedGames[existingIndex].id)
          }
        }

        // SECONDARY: Find by cfpSlot field
        if (existingIndex === -1 && expectedSlotId) {
          existingIndex = updatedGames.findIndex(g =>
            g.cfpSlot === expectedSlotId &&
            Number(g.year) === Number(year) &&
            g.isCFPSemifinal
          )
          if (existingIndex >= 0) {
            console.log(`[saveCFPGames] SF: Found shell by cfpSlot field ${expectedSlotId}`)
          }
        }

        // TERTIARY: Find by team tids
        if (existingIndex === -1 && (team1Tid || team2Tid)) {
          existingIndex = updatedGames.findIndex(g =>
            g.isCFPSemifinal &&
            Number(g.year) === Number(year) &&
            ((team1Tid && (g.team1Tid === team1Tid || g.team2Tid === team1Tid)) ||
             (team2Tid && (g.team1Tid === team2Tid || g.team2Tid === team2Tid)))
          )
          if (existingIndex >= 0) {
            console.log(`[saveCFPGames] SF: Found shell by team tids`)
          }
        }

        // Log if not found
        if (existingIndex === -1) {
          const availableShells = updatedGames.filter(g =>
            Number(g.year) === Number(year) && g.isCFPSemifinal
          ).map(g => ({ id: g.id, cfpSlot: g.cfpSlot, bowlName: g.bowlName }))
          console.log(`[saveCFPGames] SF: Shell NOT FOUND. Available:`, availableShells)
        }
      } else if (roundType === GAME_TYPES.CFP_CHAMPIONSHIP) {
        // Championship: only one per year
        existingIndex = updatedGames.findIndex(g =>
          g.isCFPChampionship && Number(g.year) === Number(year)
        )
      }

      existingShell = existingIndex >= 0 ? updatedGames[existingIndex] : null

      // Use existing shell's slot ID if found, otherwise determine from seeds (NOT bowl name!)
      let slotId = existingShell?.cfpSlot
      if (!slotId) {
        if (roundType === GAME_TYPES.CFP_FIRST_ROUND) {
          slotId = getFirstRoundSlotId(gameData.seed1, gameData.seed2)
        } else if (roundType === GAME_TYPES.CFP_QUARTERFINAL) {
          // BULLETPROOF: Determine slot from bye seed, NOT bowl name
          const byeSeedToSlot = { 1: 'cfpqf1', 2: 'cfpqf4', 3: 'cfpqf3', 4: 'cfpqf2' }
          const byeSeed = gameData.seed1 // Bye seed should be in seed1 position
          if (byeSeed && byeSeed >= 1 && byeSeed <= 4) {
            slotId = byeSeedToSlot[byeSeed]
          }
        } else if (roundType === GAME_TYPES.CFP_SEMIFINAL) {
          // BULLETPROOF: Determine slot from which seeds are playing
          const seeds = [gameData.seed1, gameData.seed2].filter(s => s)
          const isSF1 = seeds.some(s => s === 1 || s === 4)
          const isSF2 = seeds.some(s => s === 2 || s === 3)
          if (isSF1 && !isSF2) slotId = 'cfpsf1'
          else if (isSF2 && !isSF1) slotId = 'cfpsf2'
          else slotId = gameData.slotId || gameData.cfpSlot // Fallback to provided slot
        } else if (roundType === GAME_TYPES.CFP_CHAMPIONSHIP) {
          slotId = 'cfpnc'
        }
        console.log(`[saveCFPGames] Determined slotId from seeds: ${slotId}`)
      }

      const gameId = existingShell?.id || (slotId ? getCFPGameId(slotId, year) : `cfp-${roundType}-${year}-${Date.now()}`)

      // UNIFIED FORMAT: Use tid-based fields only
      const unifiedGame = {
        id: gameId,
        year: Number(year),
        gameType: roundType,
        team1Tid,
        team2Tid,
        team1Score,
        team2Score,
        homeTeamTid: null, // CFP games are neutral site
        winnerTid,
        seed1: gameData.seed1,
        seed2: gameData.seed2,
        bowlName: gameData.bowlName,
        cfpSlot: slotId, // For shell system
        cfpRound: roundType === GAME_TYPES.CFP_FIRST_ROUND ? 'first_round' :
                  roundType === GAME_TYPES.CFP_QUARTERFINAL ? 'quarterfinal' :
                  roundType === GAME_TYPES.CFP_SEMIFINAL ? 'semifinal' : 'championship',
        [legacyFlag]: true,
        updatedAt: new Date().toISOString()
      }

      if (existingIndex >= 0) {
        // Update existing shell - preserve any existing data not being overwritten
        updatedGames[existingIndex] = {
          ...updatedGames[existingIndex],
          ...unifiedGame
        }
        console.log(`[saveCFPGames] Updated existing shell at index ${existingIndex}:`, gameId)
      } else {
        // No shell exists - add new game (fallback for legacy data)
        unifiedGame.createdAt = new Date().toISOString()
        updatedGames.push(unifiedGame)
        console.log(`[saveCFPGames] Created new game (no shell found):`, gameId)
      }

      // Propagate winner to next round if this game feeds into another
      if (winnerTid && slotId) {
        updatedGames = propagateCFPWinner(updatedGames, { ...unifiedGame, cfpSlot: slotId })
      }
    }

    await updateDynasty(dynastyId, { games: updatedGames })

    return gamesData
  }

  // Add or update CPU conference championship games as proper game entries in the games[] array
  // This ensures ALL games (user and CPU) are stored uniformly
  const saveCPUConferenceChampionships = async (dynastyId, championships, year) => {
    console.log('[saveCPUCC] Called with:', { dynastyId, championships, year })
    const useLocalStorage = !storageService.isPremium()
    let dynasty

    if (useLocalStorage || !user) {
      const currentDynasties = await indexedDBStorage.getDynasties() || dynasties
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
    console.log('[advanceWeek] ========== STARTING ==========')
    console.log('[advanceWeek] dynastyId:', dynastyId)
    console.log('[advanceWeek] classConfirmations:', classConfirmations)

    const dynasty = dynasties.find(d => d.id === dynastyId)
    if (!dynasty) {
      console.error('[advanceWeek] Dynasty not found! dynastyId:', dynastyId)
      console.error('[advanceWeek] Available dynasty ids:', dynasties.map(d => d.id))
      return
    }

    console.log('[advanceWeek] Current state:', {
      phase: dynasty.currentPhase,
      week: dynasty.currentWeek,
      year: dynasty.currentYear,
      teamName: dynasty.teamName
    })

    let nextWeek = dynasty.currentWeek + 1
    let nextPhase = dynasty.currentPhase
    let nextYear = dynasty.currentYear
    let additionalUpdates = {}

    console.log('[advanceWeek] Initial next values:', { nextWeek, nextPhase, nextYear })

    // Phase transitions
    if (dynasty.currentPhase === 'preseason' && nextWeek >= 1) {
      nextPhase = 'regular_season'
      nextWeek = 0  // Regular season now starts with Week 0

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
    } else if (dynasty.currentPhase === 'regular_season' && nextWeek > 15) {
      // After week 15, move to conference championship week (Week 0-15 = 16 weeks)
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
        // newJobData.team is a full team name from SearchableSelect (e.g., "Wisconsin Badgers")
        // Get the full team name (handles both full names and abbreviations)
        const newTeamName = getTeamName(newJobData.team, dynasty.customTeams)
        // Get abbreviation for conference lookup (getTeamConference expects abbreviation)
        const newTeamAbbr = getAbbrFromTeamName(newJobData.team, dynasty.teams) || newJobData.team
        const newConference = getTeamConference(newTeamAbbr, null, dynasty.customTeams)

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

        // CRITICAL: Update currentTid to the new team's tid
        const newTid = getTidFromTeamName(newTeamName, dynasty.teams)
        if (newTid) {
          additionalUpdates.currentTid = newTid
        }

        // NOTE: We do NOT update coachTeamByYear[currentYear] here because:
        // - currentYear is still the OLD year (year flip happens at offseason week 6)
        // - The games played this year were with the OLD team
        // - coachTeamByYear for the NEW year is set when advancing to regular season (line ~4062)

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

        // NEW USER TEAM SYSTEM: Apply pending user team (flip pendingUserId to userId)
        // This handles the case where user selected a new job during Bowl Weeks
        console.log('[advanceWeek] POSTSEASON -> OFFSEASON transition')
        console.log('[advanceWeek] dynasty.newJobData:', dynasty.newJobData)
        console.log('[advanceWeek] additionalUpdates.teams exists:', !!additionalUpdates.teams)
        console.log('[advanceWeek] dynasty.teams exists:', !!dynasty.teams)

        try {
          let teamsBeforeFlip = additionalUpdates.teams || dynasty.teams
          console.log('[advanceWeek] teamsBeforeFlip exists:', !!teamsBeforeFlip)

          // Log teams with userId/pendingUserId before calling applyPendingUserTeam
          if (teamsBeforeFlip) {
            console.log('[advanceWeek] Teams with userId/pendingUserId BEFORE applyPendingUserTeam:')
            for (const [tidStr, team] of Object.entries(teamsBeforeFlip)) {
              if (team.userId || team.pendingUserId) {
                console.log(`  tid ${tidStr} (${team.name}): userId=${team.userId}, pendingUserId=${team.pendingUserId}`)
              }
            }

            // FALLBACK: If newJobData says user is taking a new job but pendingUserId wasn't set
            // (e.g., job was selected before this code was added), set it now before flip
            if (newJobData?.takingNewJob && newJobData.team) {
              const hasPendingUser = Object.values(teamsBeforeFlip).some(t => t.pendingUserId === 'currentUser')
              if (!hasPendingUser) {
                console.log('[advanceWeek] FALLBACK: No pendingUserId found, setting it from newJobData')
                const newTeamTid = getTidFromTeamName(newJobData.team, teamsBeforeFlip)
                console.log(`[advanceWeek] FALLBACK: New team tid=${newTeamTid} for team="${newJobData.team}"`)
                if (newTeamTid && teamsBeforeFlip[newTeamTid]) {
                  teamsBeforeFlip = {
                    ...teamsBeforeFlip,
                    [newTeamTid]: {
                      ...teamsBeforeFlip[newTeamTid],
                      pendingUserId: 'currentUser',
                      coachPosition: newJobData.position || 'HC'
                    }
                  }
                  console.log(`[advanceWeek] FALLBACK: Set pendingUserId on tid ${newTeamTid} (${teamsBeforeFlip[newTeamTid].name})`)
                }
              }
            }

            const teamsAfterFlip = applyPendingUserTeam(teamsBeforeFlip)
            additionalUpdates.teams = teamsAfterFlip

            // Log teams with userId/pendingUserId after
            console.log('[advanceWeek] Teams with userId/pendingUserId AFTER applyPendingUserTeam:')
            for (const [tidStr, team] of Object.entries(teamsAfterFlip)) {
              if (team.userId || team.pendingUserId) {
                console.log(`  tid ${tidStr} (${team.name}): userId=${team.userId}, pendingUserId=${team.pendingUserId}`)
              }
            }
          }
        } catch (err) {
          console.error('Error applying pending user team:', err)
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
      console.log('[advanceWeek] *** ENTERING WEEK 5→6 TRANSITION (SIGNING DAY / YEAR FLIP) ***')

      // YEAR FLIP - Happens when entering Signing Day (week 6)
      // The year changes here so that team pages for the new year become available
      // CRITICAL: Use Number() to ensure proper arithmetic (currentYear could be string from Firestore)
      nextYear = Number(dynasty.currentYear) + 1
      console.log('[advanceWeek] Year flip:', dynasty.currentYear, '→', nextYear)

      // NEW COACH CAREER SYSTEM: Write career entry for the new year
      // This captures which team the user is coaching for this season
      try {
        const userTeamTidForCareer = getUserTeamTid(dynasty)
        console.log('[advanceWeek] userTeamTidForCareer:', userTeamTidForCareer)
        if (userTeamTidForCareer) {
          const userTeamForCareer = dynasty.teams?.[userTeamTidForCareer]
          const userPositionForCareer = userTeamForCareer?.coachPosition || dynasty.coachPosition || 'HC'
          const existingCareer = dynasty.coachCareer || []
          additionalUpdates.coachCareer = addCareerEntry(existingCareer, nextYear, userTeamTidForCareer, userPositionForCareer)
          console.log('[advanceWeek] Added career entry for year', nextYear)
        }
      } catch (err) {
        console.error('[advanceWeek] Error adding career entry:', err)
      }

      // ============================================================
      // SIMPLE ROSTER CARRYOVER LOGIC:
      // 1. Was player on this team's roster last season?
      // 2. Are they in Players Leaving? If NO → carry over
      // ============================================================

      const previousSeasonYear = Number(dynasty.currentYear) // The year that just ended
      const teamTid = getCurrentTeamTid(dynasty)

      console.log('[advanceWeek] YEAR FLIP - previousSeasonYear:', previousSeasonYear, 'nextYear:', nextYear, 'teamTid:', teamTid)

      if (!teamTid) {
        console.error('[advanceWeek] CRITICAL: No teamTid found! Cannot process roster.')
      }

      const allPlayers = dynasty.players || []

      // Get Players Leaving list - these players should NOT be carried over
      const playersLeavingList = getPlayersLeaving(dynasty, teamTid, previousSeasonYear)
      const leavingPids = new Set(playersLeavingList.map(p => p.pid).filter(Boolean))
      const leavingNames = new Set(playersLeavingList.map(p => p.name?.toLowerCase().trim()).filter(Boolean))
      console.log('[advanceWeek] Players Leaving count:', playersLeavingList.length)

      // Helper to check if player was on THIS team last season
      // ONLY uses teamsByYear - this is the SINGLE source of truth
      const wasOnTeamLastSeason = (player) => {
        const teamLastYear = player.teamsByYear?.[previousSeasonYear] ?? player.teamsByYear?.[String(previousSeasonYear)]
        if (!teamLastYear) return false // No record = not on roster last year
        // Check if it matches this team
        if (typeof teamLastYear === 'number') return teamLastYear === teamTid
        return getTidFromAbbr(teamLastYear) === teamTid
      }

      // Helper to check if player is leaving
      const isPlayerLeaving = (player) => {
        if (leavingPids.has(player.pid)) return true
        if (player.name && leavingNames.has(player.name.toLowerCase().trim())) return true
        // Check for departure movements
        const hasDeparture = (player.movements || []).some(m =>
          (m.type === 'departure' || m.type === 'entered_portal' || m.type === 'transfer') &&
          Number(m.year) === previousSeasonYear
        )
        return hasDeparture
      }

      let carriedOver = 0
      let alreadyHadNextYear = 0
      let notCarriedOver = 0
      let recruitsSkipped = 0
      let otherTeamSkipped = 0
      let honorOnlySkipped = 0

      // Debug: Count how many players have teamsByYear[previousSeasonYear] set
      const playersWithPrevYear = allPlayers.filter(p => {
        const t = p.teamsByYear?.[previousSeasonYear] ?? p.teamsByYear?.[String(previousSeasonYear)]
        return t !== undefined && t !== null
      })
      console.log(`[advanceWeek] Players with teamsByYear[${previousSeasonYear}]: ${playersWithPrevYear.length}`)

      const processedPlayers = allPlayers.map(player => {
        // Skip honor-only players (historical records)
        if (player.isHonorOnly) {
          honorOnlySkipped++
          return player
        }

        // Skip recruits (they're handled at week 7→8)
        if (player.isRecruit) {
          recruitsSkipped++
          return player
        }

        // Skip players who already have nextYear set (already processed)
        const hasNextYear = player.teamsByYear?.[nextYear] ?? player.teamsByYear?.[String(nextYear)]
        if (hasNextYear) {
          alreadyHadNextYear++
          return player
        }

        // Check if player was on THIS team last season
        if (!wasOnTeamLastSeason(player)) {
          otherTeamSkipped++
          return player
        }

        // Check if player is leaving
        if (isPlayerLeaving(player)) {
          notCarriedOver++
          return player
        }

        // ========== CARRY OVER THIS PLAYER ==========
        carriedOver++

        // Get their class for progression
        const currentClass = player.classByYear?.[previousSeasonYear] || player.classByYear?.[String(previousSeasonYear)] || player.year
        const isAlreadyRS = currentClass?.startsWith('RS ')

        // Get games played to determine redshirt
        const yearStats = player.statsByYear?.[previousSeasonYear] || player.statsByYear?.[String(previousSeasonYear)]
        let gamesPlayed = yearStats?.gamesPlayed

        // Use class confirmation if provided
        if ((gamesPlayed === null || gamesPlayed === undefined) && classConfirmations[player.pid] !== undefined) {
          gamesPlayed = classConfirmations[player.pid] ? 5 : 0
        }

        // Determine new class
        let newClass = currentClass
        if (gamesPlayed !== null && gamesPlayed !== undefined) {
          if (gamesPlayed <= 4 && !isAlreadyRS) {
            newClass = 'RS ' + currentClass // Redshirt
          } else {
            newClass = CLASS_PROGRESSION[currentClass] || currentClass
          }
        } else {
          newClass = CLASS_PROGRESSION[currentClass] || currentClass
        }

        return {
          ...player,
          year: newClass,
          classByYear: {
            ...(player.classByYear || {}),
            [nextYear]: newClass
          },
          teamsByYear: {
            ...(player.teamsByYear || {}),
            [nextYear]: teamTid
          }
        }
      })

      console.log(`[advanceWeek] Roster carryover results:`)
      console.log(`  - Carried over: ${carriedOver}`)
      console.log(`  - Already had nextYear: ${alreadyHadNextYear}`)
      console.log(`  - Leaving (not carried): ${notCarriedOver}`)
      console.log(`  - Recruits (skipped): ${recruitsSkipped}`)
      console.log(`  - Other teams (skipped): ${otherTeamSkipped}`)
      console.log(`  - Honor-only (skipped): ${honorOnlySkipped}`)
      console.log(`  - TOTAL PLAYERS: ${allPlayers.length}`)

      additionalUpdates.players = processedPlayers
      // Mark that class progression has been done for this year
      additionalUpdates.classProgressionDoneForYear = nextYear

      // ============================================================
      // CARRY OVER CUSTOM CONFERENCES TO NEXT YEAR
      // Copy the exact conference alignment from the previous year
      // ============================================================
      const prevYearConferences = dynasty.customConferencesByYear?.[previousSeasonYear]
      if (prevYearConferences && Object.keys(prevYearConferences).length > 0) {
        console.log('[advanceWeek] Carrying over custom conferences from', previousSeasonYear, 'to', nextYear)
        additionalUpdates.customConferencesByYear = {
          ...(dynasty.customConferencesByYear || {}),
          [nextYear]: prevYearConferences
        }
        // Also update legacy field for backward compatibility
        additionalUpdates.customConferences = prevYearConferences
      } else if (dynasty.customConferences && Object.keys(dynasty.customConferences).length > 0) {
        // Fallback: if we have legacy customConferences but no year-specific, carry that forward
        console.log('[advanceWeek] Carrying over legacy custom conferences to', nextYear)
        additionalUpdates.customConferencesByYear = {
          ...(dynasty.customConferencesByYear || {}),
          [nextYear]: dynasty.customConferences
        }
      }
    } else if (dynasty.currentPhase === 'offseason' && dynasty.currentWeek === 6 && nextWeek === 7) {
      // Week 6→7 transition (after Signing Day tasks complete)
      // With the new system, departures and transfers are handled directly in:
      // - handlePlayersLeavingSave (adds movements, doesn't add next year to teamsByYear)
      // - handleTransferDestinationsSave (updates teamsByYear, adds movements)
      // NOTE: Recruits stay as isRecruit=true until Week 7→8 so users can enter Recruit Overalls
      const previousSeasonYear = dynasty.currentYear - 1 // Year that just ended
      const currentSeasonYear = dynasty.currentYear // The new season (already flipped)
      const players = dynasty.players || []

      // CRITICAL: Get tid directly - tid is the ONLY source of truth
      const teamTid = getCurrentTeamTid(dynasty)
      const teamsByYearValue = teamTid

      // Get draft results for draft round info
      const getByYear = (obj, year) => obj?.[year] ?? obj?.[String(year)] ?? obj?.[Number(year)]
      const draftResults = getByYear(dynasty.draftResultsByYear, previousSeasonYear) || []
      const draftByPid = {}
      draftResults.forEach(d => {
        if (d.pid) draftByPid[d.pid] = d
      })

      // Get players leaving to exclude them
      const playersLeavingList = getPlayersLeaving(dynasty, teamTid, previousSeasonYear)
      const leavingPidsSet = new Set(playersLeavingList.map(p => p.pid).filter(Boolean))

      // Process all players: add draft info only (roster carryover should have happened at week 5→6)
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
      // CRITICAL: Get tid directly - tid is the ONLY source of truth
      const teamTid = getCurrentTeamTid(dynasty)
      // teamsByYear MUST store tid (number), never abbreviation
      const teamsByYearValue = teamTid
      const players = dynasty.players || []

      // Convert recruits from this class to active players
      const updatedPlayers = players.map(player => {
        if (player.isRecruit && Number(player.recruitYear) === previousSeasonYear) {
          let updated = { ...player, isRecruit: false }

          // Ensure teamsByYear has the current year (in case it's missing)
          const hasCurrentYear = player.teamsByYear?.[currentSeasonYear] || player.teamsByYear?.[String(currentSeasonYear)]
          if (!hasCurrentYear) {
            // Use tid for teamsByYear - convert player.team to tid if needed
            const playerTeamTid = typeof player.team === 'number' ? player.team : getTidFromAbbr(player.team)
            const playerTeamValue = playerTeamTid || teamsByYearValue
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

    console.log('[advanceWeek] ========== CALLING updateDynasty ==========')
    console.log('[advanceWeek] Final values:', { nextWeek, nextPhase, nextYear })
    console.log('[advanceWeek] additionalUpdates keys:', Object.keys(additionalUpdates))

    try {
      await updateDynasty(dynastyId, {
        currentWeek: nextWeek,
        currentPhase: nextPhase,
        currentYear: nextYear,
        ...additionalUpdates
      })
      console.log('[advanceWeek] ========== SUCCESS ==========')
    } catch (err) {
      console.error('[advanceWeek] ========== ERROR ==========')
      console.error('[advanceWeek] Error during updateDynasty:', err)
      throw err
    }
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
    // CRITICAL: Get tid directly - tid is the ONLY source of truth
    const teamTid = getCurrentTeamTid(dynasty)
    const teamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName // For display/legacy data lookups only
    const players = [...(dynasty.players || [])]

    // Helper to get data by year (handles both string and numeric keys)
    const getByYear = (obj, year) => obj?.[year] ?? obj?.[String(year)] ?? obj?.[Number(year)]

    // Get players leaving data (stored under previous season year)
    const playersLeavingThisYear = getPlayersLeaving(dynasty, teamTid, previousSeasonYear)
    const leavingPids = new Set(playersLeavingThisYear.map(p => p.pid).filter(Boolean))

    // Get encouraged transfers data (stored under current season year - after year flip)
    const encouragedTransfers = getEncourageTransfers(dynasty, teamTid, currentSeasonYear)
    const encouragedNames = new Set(encouragedTransfers.map(t => t.name?.toLowerCase().trim()))

    // Get draft results for draft round info (stored under previous season year)
    const draftResults = getDraftResults(dynasty, teamTid, previousSeasonYear)
    const draftByPid = {}
    draftResults.forEach(d => {
      if (d.pid) draftByPid[d.pid] = d
    })

    // Helper to check if a teamsByYear value matches the current team (handles tid or abbr)
    const isTeamMatch = (value) => {
      if (!value || !teamTid) return false
      if (typeof value === 'number') return value === teamTid
      // Legacy: if stored as abbr string, convert to tid and compare
      return getTidFromAbbr(value) === teamTid
    }

    // Process each player
    const updatedPlayers = players.map(player => {
      // Skip honor-only players
      if (player.isHonorOnly) return player

      // Skip players from other teams (use teamsByYear for previous season as primary check)
      // CRITICAL: Handle both tid (number) and legacy abbr (string) in teamsByYear values
      const playerTeamPrevSeason = player.teamsByYear?.[previousSeasonYear] ?? player.teamsByYear?.[String(previousSeasonYear)]
      if (playerTeamPrevSeason && !isTeamMatch(playerTeamPrevSeason)) return player
      // Also check player.team field (could be tid or abbr)
      const playerTeamFieldTid = typeof player.team === 'number' ? player.team : getTidFromAbbr(player.team)
      if (!playerTeamPrevSeason && player.team && playerTeamFieldTid !== teamTid) return player

      // Check if player has any FUTURE year on this team (indicates they should still be on the team)
      const hasFutureYearOnTeam = Object.entries(player.teamsByYear || {}).some(([yearKey, team]) => {
        const year = Number(yearKey)
        return isTeamMatch(team) && year > previousSeasonYear
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
          { year: previousSeasonYear, type: 'departure', from: teamTid, reason: 'Graduating' } // ALWAYS use tid
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
          // ALWAYS use tid (number) - NEVER abbreviation
          teamsByYear: {
            ...(player.teamsByYear || {}),
            [currentSeasonYear]: teamTid
          }
        }
      }

      // Skip recruits from other years
      if (player.isRecruit) return player

      // Class progression already happened at Signing Day (offseason week 6)
      // Here we just need to add teamsByYear and classByYear tracking for the new season

      // CRITICAL: Add current season year to teamsByYear for players continuing on the team
      // This creates the immutable roster history record
      // ALWAYS use tid (number) - NEVER abbreviation
      const updatedTeamsByYear = {
        ...(player.teamsByYear || {}),
        [currentSeasonYear]: teamTid
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

    // teamTid already declared at top of function via getCurrentTeamTid(dynasty)

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
        !(isSameWeek(g.week, dynasty.currentWeek) && isSameYear(g.year, year) &&
          !g.isConferenceChampionship && g.gameType !== GAME_TYPES.CONFERENCE_CHAMPIONSHIP)
      )
    } else if (dynasty.currentPhase === 'conference_championship') {
      // Remove CC game from games array
      updatedGames = updatedGames.filter(g =>
        !((g.isConferenceChampionship || g.gameType === GAME_TYPES.CONFERENCE_CHAMPIONSHIP) && isSameYear(g.year, year))
      )

      // Restore fired coordinators if any were fired during this CC phase
      const ccData = dynasty.conferenceChampionshipData
      if (ccData && isSameYear(ccData.year, year)) {
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
        // Clear ALL Bowl Week 1 data AND all CFP data (since seeds will be cleared)

        // Remove ALL CFP games for this year (shells will be recreated when seeds re-entered)
        // Also remove Week 1 bowl games
        updatedGames = updatedGames.filter(g => {
          if (!isSameYear(g.year, year)) return true
          // Remove all CFP games (check both boolean flags and gameType)
          const gameType = g.gameType
          if (g.isCFPFirstRound || gameType === GAME_TYPES.CFP_FIRST_ROUND) return false
          if (g.isCFPQuarterfinal || gameType === GAME_TYPES.CFP_QUARTERFINAL) return false
          if (g.isCFPSemifinal || gameType === GAME_TYPES.CFP_SEMIFINAL) return false
          if (g.isCFPChampionship || gameType === GAME_TYPES.CFP_CHAMPIONSHIP) return false
          // Remove week 1 bowl games
          if ((g.isBowlGame || gameType === GAME_TYPES.BOWL) && g.bowlWeek === 'week1') return false
          return true
        })

        // Clear conference championships data
        additionalUpdates.conferenceChampionships = null
        const existingCCByYear = dynasty.conferenceChampionshipsByYear || {}
        additionalUpdates.conferenceChampionshipsByYear = { ...existingCCByYear, [year]: null }

        // Clear CFP Seeds for current year (shells will be recreated when re-entered)
        const existingCFPSeeds = dynasty.cfpSeedsByYear || {}
        additionalUpdates.cfpSeedsByYear = { ...existingCFPSeeds, [year]: null }

        // Clear CFP Bowl Config for current year
        const existingBowlConfig = dynasty.cfpBowlConfigByYear || {}
        additionalUpdates.cfpBowlConfigByYear = { ...existingBowlConfig, [year]: null }

        // Clear bowl eligibility data
        additionalUpdates.bowlEligibilityData = null

        // Clear new job data
        additionalUpdates.newJobData = null

        // Clear ALL Bowl Week results for the year
        additionalUpdates.bowlGamesByYear = {
          ...existingBowlGames,
          [year]: null
        }

        // Clear ALL CFP results for the year
        additionalUpdates.cfpResultsByYear = {
          ...existingCFPResults,
          [year]: null
        }

        // Clear all sheet IDs for this phase
        additionalUpdates.bowlWeek1SheetId = null
        additionalUpdates.bowlWeek2SheetId = null
        additionalUpdates.bowlWeek3SheetId = null
        additionalUpdates.cfpSeedsSheetId = null
        additionalUpdates.cfpFirstRoundSheetId = null
        additionalUpdates.cfpQuarterfinalsSheetId = null
        additionalUpdates.cfpSemifinalsSheetId = null
        additionalUpdates.cfpChampionshipSheetId = null

      } else if (dynasty.currentWeek === 2) {
        // Reverting FROM Week 2 TO Week 1
        // Clear Week 2 data (Bowl Week 2 + CFP Quarterfinals)
        // ALSO clear Week 1 data so user can re-enter First Round and seeds

        // Remove Week 2 bowl games from games array
        updatedGames = updatedGames.filter(g =>
          !((g.isBowlGame || g.gameType === GAME_TYPES.BOWL) && isSameYear(g.year, year) && g.bowlWeek === 'week2')
        )

        // Clear scores from QF shells (keep shells but reset scores)
        // Also clear opponent (team2Tid) since it comes from FR winner propagation
        updatedGames = updatedGames.map(g => {
          const isCFPQF = g.isCFPQuarterfinal || g.gameType === GAME_TYPES.CFP_QUARTERFINAL
          const isCFPFR = g.isCFPFirstRound || g.gameType === GAME_TYPES.CFP_FIRST_ROUND
          if (isCFPQF && isSameYear(g.year, year)) {
            return {
              ...g,
              team1Score: null,
              team2Score: null,
              winnerTid: null,
              team2Tid: null // Clear propagated opponent from FR
            }
          }
          // Also clear FR scores so they can be re-entered
          if (isCFPFR && isSameYear(g.year, year)) {
            return {
              ...g,
              team1Score: null,
              team2Score: null,
              winnerTid: null
            }
          }
          return g
        })

        // Clear Bowl Week 1 and Week 2 results
        additionalUpdates.bowlGamesByYear = {
          ...existingBowlGames,
          [year]: { ...yearBowlGames, week1: null, week2: null }
        }

        // Clear CFP First Round and Quarterfinal results (legacy storage)
        additionalUpdates.cfpResultsByYear = {
          ...existingCFPResults,
          [year]: { ...yearCFPResults, firstRound: null, quarterfinals: null }
        }

        // Clear all sheet IDs for Week 1 and Week 2
        additionalUpdates.bowlWeek1SheetId = null
        additionalUpdates.bowlWeek2SheetId = null
        additionalUpdates.cfpFirstRoundSheetId = null
        additionalUpdates.cfpQuarterfinalsSheetId = null

      } else if (dynasty.currentWeek === 3) {
        // Reverting FROM Week 3 TO Week 2
        // Clear Week 3 data (Bowl Week 3 + CFP Semifinals)
        // ALSO clear Week 2 CFP data so user can re-enter QF results

        // Remove Week 3 bowl games from games array (keep SF shells)
        updatedGames = updatedGames.filter(g =>
          !(g.isBowlGame && isSameYear(g.year, year) && g.bowlWeek === 'week3')
        )

        // Clear scores from QF shells AND SF shells (keep shells but reset scores/team tids)
        updatedGames = updatedGames.map(g => {
          const isCFPQF = g.isCFPQuarterfinal || g.gameType === GAME_TYPES.CFP_QUARTERFINAL
          const isCFPSF = g.isCFPSemifinal || g.gameType === GAME_TYPES.CFP_SEMIFINAL
          if (isCFPQF && isSameYear(g.year, year)) {
            // Clear QF scores but keep shell structure
            return {
              ...g,
              team1Score: null,
              team2Score: null,
              winnerTid: null
            }
          }
          if (isCFPSF && isSameYear(g.year, year)) {
            // Clear SF scores AND propagated team tids (keep shell)
            return {
              ...g,
              team1Score: null,
              team2Score: null,
              team1Tid: null,
              team2Tid: null,
              winnerTid: null
            }
          }
          return g
        })

        // Clear Bowl Week 3 results (if exists)
        additionalUpdates.bowlGamesByYear = {
          ...existingBowlGames,
          [year]: { ...yearBowlGames, week3: null, week2: null }
        }

        // Clear CFP Semifinal AND Quarterfinal results (legacy storage)
        additionalUpdates.cfpResultsByYear = {
          ...existingCFPResults,
          [year]: { ...yearCFPResults, semifinals: null, quarterfinals: null }
        }

        // Clear all sheet IDs for Week 2 and Week 3
        additionalUpdates.bowlWeek2SheetId = null
        additionalUpdates.bowlWeek3SheetId = null
        additionalUpdates.cfpQuarterfinalsSheetId = null
        additionalUpdates.cfpSemifinalsSheetId = null

      } else if (dynasty.currentWeek === 4) {
        // Reverting FROM Week 4 TO Week 3
        // Clear Week 4 data (National Championship)
        // ALSO clear Week 3 data so user can re-enter SF results

        // Clear scores from NC shell (keep shell but reset scores)
        updatedGames = updatedGames.map(g => {
          const isCFPChamp = g.isCFPChampionship || g.gameType === GAME_TYPES.CFP_CHAMPIONSHIP
          const isCFPSF = g.isCFPSemifinal || g.gameType === GAME_TYPES.CFP_SEMIFINAL
          if (isCFPChamp && isSameYear(g.year, year)) {
            return {
              ...g,
              team1Score: null,
              team2Score: null,
              team1Tid: null, // Clear propagated teams from SF
              team2Tid: null,
              winnerTid: null
            }
          }
          // Also clear SF scores so they can be re-entered
          if (isCFPSF && isSameYear(g.year, year)) {
            return {
              ...g,
              team1Score: null,
              team2Score: null,
              winnerTid: null
            }
          }
          return g
        })

        // Clear Bowl Week 3 results
        additionalUpdates.bowlGamesByYear = {
          ...existingBowlGames,
          [year]: { ...yearBowlGames, week3: null }
        }

        // Clear CFP Semifinal and Championship results (legacy storage)
        additionalUpdates.cfpResultsByYear = {
          ...existingCFPResults,
          [year]: { ...yearCFPResults, semifinals: null, championship: null }
        }

        // Clear sheet IDs
        additionalUpdates.bowlWeek3SheetId = null
        additionalUpdates.cfpSemifinalsSheetId = null
        additionalUpdates.cfpChampionshipSheetId = null
      } else if (dynasty.currentWeek === 5) {
        // Reverting FROM Week 5 TO Week 4
        // Week 5 (End of Season Recap) - clears championship data, All-Americans, All-Conference, rankings, awards

        // Clear NC shell scores from games[] so it can be re-entered
        updatedGames = updatedGames.map(g => {
          const isCFPChamp = g.isCFPChampionship || g.gameType === GAME_TYPES.CFP_CHAMPIONSHIP
          if (isCFPChamp && isSameYear(g.year, year)) {
            return {
              ...g,
              team1Score: null,
              team2Score: null,
              winnerTid: null
            }
          }
          return g
        })

        // Clear CFP Championship results (legacy storage)
        additionalUpdates.cfpResultsByYear = {
          ...existingCFPResults,
          [year]: { ...yearCFPResults, championship: null }
        }

        // Clear All-Americans and All-Conference data for this year
        const existingAllAmericans = dynasty.allAmericansByYear || {}
        additionalUpdates.allAmericansByYear = {
          ...existingAllAmericans,
          [year]: null
        }

        // Clear final rankings for this year
        const existingRankings = dynasty.rankingsByTeamYear || {}
        const teamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName
        if (existingRankings[teamAbbr]) {
          additionalUpdates.rankingsByTeamYear = {
            ...existingRankings,
            [teamAbbr]: {
              ...existingRankings[teamAbbr],
              [year]: {
                ...(existingRankings[teamAbbr]?.[year] || {}),
                final: null
              }
            }
          }
        }

        // Clear season awards data for this year
        const existingAwards = dynasty.seasonAwardsByYear || {}
        additionalUpdates.seasonAwardsByYear = {
          ...existingAwards,
          [year]: null
        }

        // Clear sheet IDs
        additionalUpdates.seasonAwardsSheetId = null
      }
    } else if (dynasty.currentPhase === 'offseason') {
      // Reverting within offseason - handle different week transitions
      const teamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName
      const teamTid = getTidFromAbbr(teamAbbr)

      if (dynasty.currentWeek === 1 && prevPhase === 'postseason') {
        // Reverting FROM offseason week 1 TO postseason week 5
        // Clear all data that was entered in offseason week 1

        // Clear players leaving data for this year
        const existingPlayersLeaving = dynasty.playersLeavingByYear || {}
        additionalUpdates.playersLeavingByYear = {
          ...existingPlayersLeaving,
          [year]: null
        }

        // Clear players leaving by team year
        const existingByTeamYear = dynasty.playersLeavingByTeamYear || {}
        if (existingByTeamYear[teamAbbr]) {
          additionalUpdates.playersLeavingByTeamYear = {
            ...existingByTeamYear,
            [teamAbbr]: {
              ...existingByTeamYear[teamAbbr],
              [year]: null
            }
          }
        }

        // Clear sheet ID
        additionalUpdates.playersLeavingSheetId = null

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
      } else if (dynasty.currentWeek >= 2 && dynasty.currentWeek <= 5 && prevWeek === dynasty.currentWeek - 1) {
        // Reverting within recruiting weeks (2-5)
        // Clear recruiting commitments that were added in current week
        // Note: We don't delete recruits here, just clear sheet IDs as the actual
        // recruit management is handled through the recruiting modal
        additionalUpdates.recruitingSheetId = null
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
          // Handle both tid (number) and legacy abbr (string) in teamsByYear
          const playerTeamForYear = player.teamsByYear?.[newSeasonYear] ?? player.teamsByYear?.[String(newSeasonYear)]
          const hadNewYearEntry = typeof playerTeamForYear === 'number'
            ? playerTeamForYear === teamTid
            : playerTeamForYear === teamAbbr || playerTeamForYear?.toUpperCase() === teamAbbr?.toUpperCase()

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

        // Clear recruiting class rank for this year (entered during recruiting weeks)
        const existingClassRank = dynasty.recruitingClassRankByTeamYear || {}
        if (existingClassRank[teamAbbr]) {
          additionalUpdates.recruitingClassRankByTeamYear = {
            ...existingClassRank,
            [teamAbbr]: {
              ...existingClassRank[teamAbbr],
              [previousSeasonYear]: null
            }
          }
        }

        // Clear draft results for this year (entered during recruiting week 1)
        const existingDraftResults = dynasty.draftResultsByTeamYear || {}
        if (existingDraftResults[teamAbbr]) {
          additionalUpdates.draftResultsByTeamYear = {
            ...existingDraftResults,
            [teamAbbr]: {
              ...existingDraftResults[teamAbbr],
              [previousSeasonYear]: null
            }
          }
        }
      } else if (dynasty.currentWeek === 7 && prevWeek === 6) {
        // Reverting FROM Training Camp (week 7) TO Signing Day (week 6)
        // Clear training results for this year
        // Note: Training data is keyed by the new year (post-flip)
        const trainingYear = currentYear
        const existingTraining = dynasty.trainingResultsByTeamYear || {}
        if (existingTraining[teamAbbr]) {
          additionalUpdates.trainingResultsByTeamYear = {
            ...existingTraining,
            [teamAbbr]: {
              ...existingTraining[teamAbbr],
              [trainingYear]: null
            }
          }
        }
        // Also clear tid-based structure
        const teamTid = getTidFromAbbr(teamAbbr)
        if (teamTid && dynasty.teams?.[teamTid]?.byYear?.[trainingYear]) {
          const existingTeams = dynasty.teams
          const existingTeamData = existingTeams[teamTid] || {}
          const existingByYear = existingTeamData.byYear || {}
          const existingYearData = existingByYear[trainingYear] || {}
          if (existingYearData.trainingResults) {
            additionalUpdates.teams = {
              ...(additionalUpdates.teams || existingTeams),
              [teamTid]: {
                ...existingTeamData,
                byYear: {
                  ...existingByYear,
                  [trainingYear]: {
                    ...existingYearData,
                    trainingResults: null
                  }
                }
              }
            }
          }
        }

        // Clear recruit overalls for this year
        const existingRecruitOveralls = dynasty.recruitOverallsByTeamYear || {}
        if (existingRecruitOveralls[teamAbbr]) {
          additionalUpdates.recruitOverallsByTeamYear = {
            ...existingRecruitOveralls,
            [teamAbbr]: {
              ...existingRecruitOveralls[teamAbbr],
              [trainingYear]: null
            }
          }
        }
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

  const saveSchedule = async (dynastyId, schedule, options = {}) => {
    // CRITICAL: Read from IndexedDB to get the latest data
    const useLocalStorage = !storageService.isPremium()
    let dynasty

    if (useLocalStorage || !user) {
      const currentDynasties = await indexedDBStorage.getDynasties() || dynasties
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

    // Get team and year - use provided values or fall back to current user's team
    const userTeamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName
    const targetTid = options.teamTid || getTidFromAbbr(userTeamAbbr)
    const targetYear = options.year || dynasty.currentYear
    const teamAbbr = options.teamTid ? getAbbrFromTid(options.teamTid) : userTeamAbbr
    const year = targetYear
    const tid = targetTid

    // Determine if this is the user's current team and year (for preseason setup tracking)
    const isUserCurrentTeamYear = !options.teamTid && !options.year

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

    // Create game records for schedule entries (links schedule to games)
    const { newGames, updatedSchedule } = createGamesFromSchedule(dynasty, schedule, tid, year)

    // Merge new games with existing games (avoid duplicates)
    const existingGames = dynasty.games || []
    const existingGameIds = new Set(existingGames.map(g => g.id))
    const gamesToAdd = newGames.filter(g => !existingGameIds.has(g.id))
    const allGames = [...existingGames, ...gamesToAdd]

    // Use updatedSchedule (with gameIds) instead of raw schedule
    const scheduleToSave = updatedSchedule

    // Base updates - always save to team-specific structures
    let scheduleUpdates

    if (useLocalStorage || !user) {
      scheduleUpdates = {
        // Store in NEW tid-based byYear structure
        teams: {
          ...existingTeams,
          [tid]: {
            ...existingTeamData,
            byYear: {
              ...existingByYear,
              [year]: {
                ...existingYearData,
                schedule: scheduleToSave,
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
            [year]: scheduleToSave
          }
        },
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
        // Save created games
        games: allGames
      }

      // Only update legacy root-level schedule and preseason for user's current team
      if (isUserCurrentTeamYear) {
        scheduleUpdates.schedule = scheduleToSave
        scheduleUpdates.preseasonSetup = {
          ...(dynasty.preseasonSetup || {}),
          scheduleEntered: true
        }
      }
    } else {
      // Firestore: use dot notation for nested updates
      scheduleUpdates = {
        // NEW tid-based byYear structure
        [`teams.${tid}.byYear.${year}.schedule`]: scheduleToSave,
        [`teams.${tid}.byYear.${year}.preseasonSetup.scheduleEntered`]: true,
        // Old structures (for backward compatibility)
        [`schedulesByTeamYear.${teamAbbr}.${year}`]: scheduleToSave,
        [`preseasonSetupByTeamYear.${teamAbbr}.${year}.scheduleEntered`]: true,
        // Save created games
        games: allGames
      }

      // Only update legacy root-level schedule and preseason for user's current team
      if (isUserCurrentTeamYear) {
        scheduleUpdates.schedule = scheduleToSave
        scheduleUpdates['preseasonSetup.scheduleEntered'] = true
      }
    }

    await updateDynasty(dynastyId, scheduleUpdates)
  }

  const saveRoster = async (dynastyId, players, options = {}) => {
    // CRITICAL: Read from IndexedDB to get the latest data (including any recent schedule save)
    const useLocalStorage = !storageService.isPremium()
    let dynasty

    if (useLocalStorage || !user) {
      const currentDynasties = await indexedDBStorage.getDynasties() || dynasties
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

    // Get year - use provided year or fall back to current year
    const year = options.year || dynasty.currentYear

    // CRITICAL: Get tid directly - tid is the ONLY source of truth
    // If options.teamAbbr is provided, convert it to tid; otherwise use current user team's tid
    let teamTid
    if (options.teamAbbr) {
      // Convert provided abbr to tid (for editing other teams)
      teamTid = getTidFromAbbr(options.teamAbbr)
    } else {
      // Use current user team's tid directly
      teamTid = getCurrentTeamTid(dynasty)
    }
    // Get abbr for display/logging only
    const teamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName
    // teamsByYear MUST store tid (number), never abbreviation
    const teamsByYearValue = teamTid

    // DEBUG: Log what values are being used
    console.log(`[saveRoster] teamAbbr: ${teamAbbr}, teamTid: ${teamTid}, teamsByYearValue: ${teamsByYearValue} (type: ${typeof teamsByYearValue}), year: ${year}`)

    // ALWAYS use merge mode - never delete existing players that aren't in the sheet
    // This prevents accidental data loss if the sheet has fewer players than expected
    const existingPlayers = dynasty.players || []

    // Keep all players that are NOT on the team being edited
    // Players on the team being edited will be handled via name matching below
    const playersToKeep = existingPlayers.filter(p => {
      // Always keep honor-only players
      if (p.isHonorOnly) return true
      // Keep players from OTHER teams (handle both tid and abbr for backwards compat)
      if (p.team && p.team !== teamTid && p.team !== teamAbbr) return true
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
      // Check if player is on this team (handle both tid and abbr)
      const isThisTeam = p.team === teamTid || p.team === teamAbbr
      if (!isThisTeam) return false // Not this team
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
      // Check if player is on this team (handle both tid and abbr)
      const isThisTeam = p.team === teamTid || p.team === teamAbbr
      if (p.name && isThisTeam) {
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
        // CRITICAL: Set teamsByYear[year] = tid to record this player was on this team this year
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
          // Ensure pid/id/team are correct - team stores tid (number)
          pid,
          id,
          team: teamTid,
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
        teamTid,
        'Added via roster entry'
      )
      return {
        ...player,
        pid,
        id,
        team: teamTid,
        yearStarted: player.yearStarted || year,
        // IMMUTABLE roster history - this player is on this team this year (tid)
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

    const rosterUpdates = useLocalStorage || !user
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
    const useLocalStorage = !storageService.isPremium()
    let dynasty

    if (useLocalStorage || !user) {
      const currentDynasties = await indexedDBStorage.getDynasties() || dynasties
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

    const teamRatingsUpdates = useLocalStorage || !user
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
    const useLocalStorage = !storageService.isPremium()
    let dynasty

    if (useLocalStorage || !user) {
      const currentDynasties = await indexedDBStorage.getDynasties() || dynasties
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

      if (useLocalStorage || !user) {
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

      if (useLocalStorage || !user) {
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
    const useLocalStorage = !storageService.isPremium()
    let dynasty

    if (useLocalStorage || !user) {
      const currentDynasties = await indexedDBStorage.getDynasties() || dynasties
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

    const coachingStaffUpdates = useLocalStorage || !user
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
    const useLocalStorage = !storageService.isPremium()
    let dynasty

    if (useLocalStorage || !user) {
      const currentDynasties = await indexedDBStorage.getDynasties() || dynasties
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
    const useLocalStorage = !storageService.isPremium()
    let dynasty

    if (useLocalStorage || !user) {
      const currentDynasties = await indexedDBStorage.getDynasties() || dynasties
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
    // Get tid directly - tid is the ONLY source of truth
    const teamTid = getCurrentTeamTid(dynasty)

    // If player exists and has movements, add a 'removed' movement before deleting
    if (playerToDelete) {
      // Get player's team as tid
      let playerTeamTid = playerToDelete.team
      if (typeof playerTeamTid === 'string') {
        playerTeamTid = getTidFromAbbr(playerTeamTid) || teamTid
      }
      if (!playerTeamTid) {
        playerTeamTid = teamTid
      }

      const removedMovement = createMovement(
        dynasty.currentYear,
        MOVEMENT_TYPES.REMOVED,
        playerTeamTid,
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
    const useLocalStorage = !storageService.isPremium()
    let dynasty

    if (useLocalStorage || !user) {
      const currentDynasties = await indexedDBStorage.getDynasties() || dynasties
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
      const useLocalStorage = !storageService.isPremium()

      if (useLocalStorage || !user) {
        // Dev mode: Use IndexedDB
        const currentDynasties = await indexedDBStorage.getDynasties() || []
        const dynastyToUpdate = currentDynasties.find(d => d.id === dynastyId)
        if (dynastyToUpdate) {
          dynastyToUpdate.customConferences = conferences
          dynastyToUpdate.preseasonSetup = {
            ...dynastyToUpdate.preseasonSetup,
            conferencesEntered: true
          }
          dynastyToUpdate.lastModified = Date.now()
          await indexedDBStorage.saveDynasties(currentDynasties)
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

  const exportDynasty = async (dynastyId) => {
    // Find the dynasty to export
    let dynasty = dynasties.find(d => String(d.id) === String(dynastyId))

    if (!dynasty) {
      alert('Dynasty not found')
      return
    }

    // For cloud dynasties with subcollections, ensure we have the latest data
    // This is especially important for read-only users where initial load might have failed
    if (dynasty.storageType === 'cloud' && dynasty._subcollectionsMigrated) {
      try {
        const [players, games] = await Promise.all([
          getPlayersSubcollection(dynasty.id),
          getGamesSubcollection(dynasty.id)
        ])

        // Merge fresh data with dynasty
        dynasty = {
          ...dynasty,
          players: players || [],
          games: games || []
        }
      } catch (err) {
        console.error('Failed to fetch subcollection data for export:', err)
        // Continue with whatever data we have in state
      }
    }

    // Remove internal fields that shouldn't be exported
    const exportData = { ...dynasty }
    delete exportData._firestoreId

    // Convert to JSON string with pretty formatting
    const jsonString = JSON.stringify(exportData, null, 2)

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
          const rawContent = e.target.result

          let dynastyData
          try {
            dynastyData = JSON.parse(rawContent)
          } catch (parseError) {
            throw new Error(`JSON parse error: ${parseError.message}`)
          }

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
            favorite: oldFavorite, // Don't carry over starred status
            ...cleanDynastyData
          } = dynastyData

          // Set timestamps to now (import time, not old export time)
          const now = Date.now()
          cleanDynastyData.lastModified = now
          cleanDynastyData.createdAt = now

          // Ensure the imported dynasty starts as private with no share code
          cleanDynastyData.isPublic = false

          // IMPORTANT: Set storageType to 'local' for imported dynasties
          cleanDynastyData.storageType = 'local'

          // Save the dynasty using createDynasty logic
          const useLocalStorage = !storageService.isPremium()

          if (useLocalStorage || !user) {
            // Local storage: IndexedDB - needs an ID
            reportProgress('creating', 'Creating dynasty...', 20)
            const newId = Date.now().toString()

            const importedDynasty = {
              ...cleanDynastyData,
              id: newId,
              storageType: 'local'
            }

            const currentDynasties = await indexedDBStorage.getDynasties() || []
            const updatedDynasties = [...currentDynasties, importedDynasty]

            await indexedDBStorage.saveDynasties(updatedDynasties)
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
    console.log(`[processHonorPlayers] Starting - honorType: ${honorType}, entries: ${entries.length}, year: ${year}`)

    const useLocalStorage = !storageService.isPremium()
    let dynasty

    if (useLocalStorage || !user) {
      const currentDynasties = await indexedDBStorage.getDynasties() || dynasties
      dynasty = currentDynasties.find(d => String(d.id) === String(dynastyId))
    } else {
      dynasty = String(currentDynasty?.id) === String(dynastyId)
        ? currentDynasty
        : dynasties.find(d => String(d.id) === String(dynastyId))
    }

    if (!dynasty) {
      console.log('[processHonorPlayers] Dynasty not found!')
      return { success: false, message: 'Dynasty not found' }
    }

    const existingPlayers = [...(dynasty.players || [])]
    let nextPID = dynasty.nextPID || (existingPlayers.length + 1)
    console.log(`[processHonorPlayers] Existing players: ${existingPlayers.length}, nextPID: ${nextPID}`)

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
      console.log(`[processHonorPlayers] Needs confirmation for ${confirmations.length} players - returning early`)
      return {
        success: false,
        needsConfirmation: true,
        confirmations,
        message: `${confirmations.length} player(s) may be transfers and need confirmation`
      }
    }

    console.log(`[processHonorPlayers] No confirmations needed. Updates: ${playersToUpdate.length}, Creates: ${playersToCreate.length}`)

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

    // Create new players (with deduplication - check if player already added in this batch)
    for (const newPlayer of playersToCreate) {
      // Get the year from the entry for teamsByYear
      const entryYear = newPlayer.entry?.year || dynasty.currentYear
      // Convert team abbreviation to tid for proper storage
      const teamTid = getTidFromAbbr(newPlayer.team) || newPlayer.team
      const normalizedName = newPlayer.name?.toLowerCase().trim()

      // Check if we already created this player in this batch (same name + team)
      // This prevents duplicates when re-syncing or when same player has multiple honors
      const existingInBatch = updatedPlayers.find(p => {
        const pName = p.name?.toLowerCase().trim()
        const pTeamMatches = p.team === teamTid || p.team === newPlayer.team ||
          (p.teamsByYear && Object.values(p.teamsByYear).some(t => t === teamTid || t === newPlayer.team))
        return pName === normalizedName && pTeamMatches
      })

      if (existingInBatch) {
        // Player already exists - add the honor to them instead of creating duplicate
        if (!existingInBatch.awards) existingInBatch.awards = []
        if (!existingInBatch.allAmericans) existingInBatch.allAmericans = []
        if (!existingInBatch.allConference) existingInBatch.allConference = []

        if (newPlayer.honorType === 'awards') {
          const isDupe = existingInBatch.awards.some(a =>
            a.year === newPlayer.entry.year && a.award === (newPlayer.entry.award || newPlayer.entry.awardKey)
          )
          if (!isDupe) {
            existingInBatch.awards.push({
              year: newPlayer.entry.year,
              award: newPlayer.entry.award || newPlayer.entry.awardKey,
              team: newPlayer.entry.team,
              position: newPlayer.entry.position,
              class: newPlayer.entry.class
            })
          }
        } else if (newPlayer.honorType === 'allAmericans') {
          const isDupe = existingInBatch.allAmericans.some(a =>
            a.year === newPlayer.entry.year && a.designation === newPlayer.entry.designation
          )
          if (!isDupe) {
            existingInBatch.allAmericans.push({
              year: newPlayer.entry.year,
              designation: newPlayer.entry.designation,
              position: newPlayer.entry.position,
              school: newPlayer.entry.school,
              class: newPlayer.entry.class
            })
          }
        } else if (newPlayer.honorType === 'allConference') {
          const isDupe = existingInBatch.allConference.some(a =>
            a.year === newPlayer.entry.year && a.designation === newPlayer.entry.designation
          )
          if (!isDupe) {
            existingInBatch.allConference.push({
              year: newPlayer.entry.year,
              designation: newPlayer.entry.designation,
              position: newPlayer.entry.position,
              school: newPlayer.entry.school,
              class: newPlayer.entry.class
            })
          }
        }
        continue // Skip creating new player
      }

      // Create new player
      const playerClass = newPlayer.entry?.class || ''
      const player = {
        pid: nextPID,
        id: `player-${nextPID}`,
        name: newPlayer.name,
        position: newPlayer.position,
        team: teamTid, // Store tid for consistency
        teams: [newPlayer.team], // Keep abbr in teams array for backwards compat
        year: playerClass, // Class from award entry (e.g., "Jr", "Sr")
        classByYear: playerClass ? { [entryYear]: playerClass } : {},
        // Players added via awards are regular roster players, not honor-only
        // They should appear on the team's roster for the award year
        teamsByYear: { [entryYear]: teamTid },
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
    const previousYear = currentYear - 1
    // CRITICAL: Get tid directly - tid is the ONLY source of truth
    const teamTid = getCurrentTeamTid(dynasty)
    const teamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName // For display/legacy comparison only
    const players = [...(dynasty.players || [])]
    let fixedCount = 0
    let recruitFixedCount = 0

    // Debug logging - show what we're working with
    console.log(`[cleanupRosterData] Starting cleanup for ${teamAbbr} (tid: ${teamTid}), year ${currentYear}`)
    console.log(`[cleanupRosterData] Total players: ${players.length}`)
    console.log(`[cleanupRosterData] playersLeavingByYear keys:`, Object.keys(dynasty.playersLeavingByYear || {}))
    console.log(`[cleanupRosterData] playersLeavingByTeamYear keys:`, Object.keys(dynasty.playersLeavingByTeamYear || {}))

    // Show leaving data for this team
    const leavingByYear = dynasty.playersLeavingByYear?.[previousYear] || dynasty.playersLeavingByYear?.[String(previousYear)] || []
    const leavingByTeamAbbr = dynasty.playersLeavingByTeamYear?.[teamAbbr]?.[previousYear] ||
                              dynasty.playersLeavingByTeamYear?.[teamAbbr]?.[String(previousYear)] || []
    const leavingByTeamTid = dynasty.playersLeavingByTeamYear?.[teamTid]?.[previousYear] ||
                             dynasty.playersLeavingByTeamYear?.[teamTid]?.[String(previousYear)] ||
                             dynasty.playersLeavingByTeamYear?.[String(teamTid)]?.[previousYear] ||
                             dynasty.playersLeavingByTeamYear?.[String(teamTid)]?.[String(previousYear)] || []
    console.log(`[cleanupRosterData] Players leaving in ${previousYear}:`,
      `byYear=${leavingByYear.length}, byTeamAbbr=${leavingByTeamAbbr.length}, byTeamTid=${leavingByTeamTid.length}`)

    const updatedPlayers = players.map(player => {
      if (player.isHonorOnly) return player

      let modified = false
      let updatedTeamsByYear = { ...(player.teamsByYear || {}) }

      // Check for departure movements - player should not have teamsByYear entries AFTER their departure year
      // Handle both tid (number) and legacy abbr (string) in movement.from
      const departureMovements = (player.movements || []).filter(m => {
        if (m.type !== 'departure' && m.type !== 'transfer' && m.type !== 'entered_portal') return false
        // Check if movement.from matches our team (handles tid or abbr)
        if (typeof m.from === 'number') return m.from === teamTid
        return m.from === teamAbbr
      })

      if (departureMovements.length > 0 && !player.isRecruit) {
        // Find the earliest departure year from this team
        const departureYears = departureMovements.map(m => Number(m.year)).filter(y => !isNaN(y))
        if (departureYears.length > 0) {
          const earliestDeparture = Math.min(...departureYears)

          // Check if player has a recommit after their departure (they came back)
          // Check both tid and abbr since movement.to could be either format
          const recommitMovements = (player.movements || []).filter(m => {
            if (m.type !== 'recommit' || Number(m.year) < earliestDeparture) return false
            if (typeof m.to === 'number') return m.to === teamTid
            return m.to === teamAbbr || getTidFromAbbr(m.to) === teamTid
          })

          // If no recommit, remove all teamsByYear entries after the departure year
          if (recommitMovements.length === 0) {
            Object.keys(updatedTeamsByYear).forEach(yearKey => {
              const year = Number(yearKey)
              const teamVal = updatedTeamsByYear[yearKey]
              // Check if this entry is for our team (handles both tid and abbr)
              const isThisTeamEntry = teamVal === teamTid || teamVal === teamAbbr ||
                                      (typeof teamVal === 'string' && getTidFromAbbr(teamVal) === teamTid)
              if (year > earliestDeparture && isThisTeamEntry) {
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

        // Ensure teamsByYear has enrollment year - ALWAYS use tid
        if (!updatedTeamsByYear[enrollmentYear] && !updatedTeamsByYear[String(enrollmentYear)]) {
          // Get tid from player.team (could be tid or legacy abbr)
          let playerTeamTid = player.team
          if (typeof playerTeamTid === 'string') {
            playerTeamTid = getTidFromAbbr(playerTeamTid) || teamTid
          }
          updatedTeamsByYear[enrollmentYear] = playerTeamTid || teamTid
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

      // Fix 3: Check if player should be on the roster for current year
      // This handles both adding missing entries AND removing incorrect entries
      if (!player.isRecruit && !player.isHonorOnly) {
        // Check if player was on this team's roster in the previous year
        // This is the PRIMARY check - teamsByYear is the source of truth
        const wasOnRosterPreviousYear = (() => {
          const prevYearTeam = updatedTeamsByYear[previousYear] || updatedTeamsByYear[String(previousYear)]
          if (!prevYearTeam) return false
          if (typeof prevYearTeam === 'number') return prevYearTeam === teamTid
          return getTidFromAbbr(prevYearTeam) === teamTid
        })()

        // Also check player.team field as fallback
        const playerTeamMatchesThisTeam = (() => {
          if (player.team === undefined || player.team === null) return false
          if (typeof player.team === 'number') return player.team === teamTid
          return getTidFromAbbr(player.team) === teamTid
        })()

        // Player is on this team if they were on roster last year OR their team field matches
        const isOnThisTeam = wasOnRosterPreviousYear || playerTeamMatchesThisTeam

        // Check if player has departed
        const hasDeparted = (player.movements || []).some(m =>
          (m.type === 'departure' || m.type === 'entered_portal' || m.type === 'transfer') &&
          (Number(m.year) === Number(currentYear) || Number(m.year) === Number(previousYear))
        )

        // Also check playersLeavingByYear directly (in case movements weren't added)
        // Check both abbr and tid keys since data might be stored either way
        const playersLeavingPrevYear = dynasty.playersLeavingByYear?.[previousYear] ||
                                       dynasty.playersLeavingByYear?.[String(previousYear)] || []
        const playersLeavingByTeamAbbrPrevYear = dynasty.playersLeavingByTeamYear?.[teamAbbr]?.[previousYear] ||
                                                  dynasty.playersLeavingByTeamYear?.[teamAbbr]?.[String(previousYear)] || []
        const playersLeavingByTeamTidPrevYear = dynasty.playersLeavingByTeamYear?.[teamTid]?.[previousYear] ||
                                                 dynasty.playersLeavingByTeamYear?.[teamTid]?.[String(previousYear)] ||
                                                 dynasty.playersLeavingByTeamYear?.[String(teamTid)]?.[previousYear] ||
                                                 dynasty.playersLeavingByTeamYear?.[String(teamTid)]?.[String(previousYear)] || []
        const allLeavingPrevYear = [...playersLeavingPrevYear, ...playersLeavingByTeamAbbrPrevYear, ...playersLeavingByTeamTidPrevYear]
        const isInLeavingList = allLeavingPrevYear.some(l =>
          l.pid === player.pid || l.playerName?.toLowerCase() === player.name?.toLowerCase()
        )

        // Simple roster formula:
        // New roster = Last year's roster + recruits/portal - players leaving - transfers out
        // RS Sr graduation is handled by the "players leaving" list - don't check class separately
        const shouldBeOnRoster = isOnThisTeam && !hasDeparted && !isInLeavingList

        // If player SHOULD be on roster but isn't, add them
        if (shouldBeOnRoster && !updatedTeamsByYear[currentYear] && !updatedTeamsByYear[String(currentYear)]) {
          updatedTeamsByYear[currentYear] = teamTid
          modified = true
          fixedCount++
          console.log(`[cleanupRosterData] Added ${player.name} to ${currentYear} roster`)
        }

        // If player should NOT be on roster but IS, remove them
        let wasRemovedFromCurrentYear = false
        if (!shouldBeOnRoster && (updatedTeamsByYear[currentYear] || updatedTeamsByYear[String(currentYear)])) {
          // Only remove if it's this team's entry
          const currentYearTeam = updatedTeamsByYear[currentYear] || updatedTeamsByYear[String(currentYear)]
          const isThisTeamsEntry = currentYearTeam === teamTid || currentYearTeam === teamAbbr ||
                                   getTidFromAbbr(currentYearTeam) === teamTid
          if (isThisTeamsEntry) {
            delete updatedTeamsByYear[currentYear]
            delete updatedTeamsByYear[String(currentYear)]
            wasRemovedFromCurrentYear = true
            modified = true
            fixedCount++
            console.log(`[cleanupRosterData] Removed ${player.name} from ${currentYear} roster (departed/graduated)`)
          }
        }

        // IMPORTANT: If player was just removed, skip gap-filling to prevent re-adding them
        if (wasRemovedFromCurrentYear || !shouldBeOnRoster) {
          // Return early - don't do gap filling for players who shouldn't be on roster
          if (modified) {
            return {
              ...player,
              teamsByYear: updatedTeamsByYear,
              classByYear: updatedClassByYear,
              isRecruit: updatedIsRecruit
            }
          }
          return player
        }
      }

      // Fix 4: Fill gaps in teamsByYear for continuing players
      // If player has entries for years N and N+2 on the same team but is missing N+1, fill it in
      // Helper to check if a teamsByYear value matches this team
      const isThisTeam = (t) => {
        if (typeof t === 'number') return t === teamTid
        return getTidFromAbbr(t) === teamTid
      }

      if (!player.isRecruit) {
        const teamYears = Object.entries(updatedTeamsByYear)
          .filter(([, team]) => isThisTeam(team))
          .map(([year]) => Number(year))
          .filter(y => !isNaN(y))
          .sort((a, b) => a - b)

        if (teamYears.length >= 2) {
          const minYear = teamYears[0]
          const maxYear = teamYears[teamYears.length - 1]

          // Check if player departed after maxYear (don't fill beyond departure)
          const hasActiveDeparture = departureMovements.some(m => {
            const depYear = Number(m.year)
            // Check for recommit after this departure (handles both tid and abbr)
            const hasRecommitAfter = (player.movements || []).some(r => {
              if (r.type !== 'recommit' || Number(r.year) < depYear) return false
              if (typeof r.to === 'number') return r.to === teamTid
              return r.to === teamAbbr
            })
            return depYear >= maxYear && !hasRecommitAfter
          })

          // Fill gaps between min and max year (or current year if no departure)
          const fillUpToYear = hasActiveDeparture ? maxYear : Math.min(maxYear, currentYear)
          for (let year = minYear; year <= fillUpToYear; year++) {
            if (!updatedTeamsByYear[year] && !updatedTeamsByYear[String(year)]) {
              updatedTeamsByYear[year] = teamTid // ALWAYS use tid
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

          // ALSO check the leaving list - player might not have a movement but be in the list
          const allLeavingList = [
            ...(dynasty.playersLeavingByYear?.[previousYear] || []),
            ...(dynasty.playersLeavingByYear?.[String(previousYear)] || []),
            ...(dynasty.playersLeavingByTeamYear?.[teamAbbr]?.[previousYear] || []),
            ...(dynasty.playersLeavingByTeamYear?.[teamAbbr]?.[String(previousYear)] || []),
            ...(dynasty.playersLeavingByTeamYear?.[teamTid]?.[previousYear] || []),
            ...(dynasty.playersLeavingByTeamYear?.[teamTid]?.[String(previousYear)] || [])
          ]
          const isInLeavingListForFillGaps = allLeavingList.some(l =>
            l.pid === player.pid || l.playerName?.toLowerCase() === player.name?.toLowerCase()
          )

          // Simple check: not departed and not in leaving list
          // RS Sr graduation is handled by the "players leaving" list
          if (!hasDeparture && !isInLeavingListForFillGaps && onlyYear < currentYear) {
            // Fill years from onlyYear to currentYear
            for (let year = onlyYear; year <= currentYear; year++) {
              if (!updatedTeamsByYear[year] && !updatedTeamsByYear[String(year)]) {
                updatedTeamsByYear[year] = teamTid // ALWAYS use tid
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
    const teamTid = getTidFromAbbr(teamAbbr)
    const players = [...(dynasty.players || [])]
    let removedCount = 0

    // Helper to check if a teamsByYear value matches our team
    const matchesTeam = (teamValue) => {
      if (teamValue === undefined || teamValue === null) return false
      if (typeof teamValue === 'number') return teamValue === teamTid
      return teamValue === teamAbbr || teamValue?.toUpperCase() === teamAbbr?.toUpperCase()
    }

    const updatedPlayers = players.map(player => {
      if (player.isHonorOnly) return player

      const teamsByYear = player.teamsByYear || {}
      const currentYearValue = teamsByYear[currentYear] ?? teamsByYear[String(currentYear)]
      const previousYearValue = teamsByYear[previousYear] ?? teamsByYear[String(previousYear)]
      const hasCurrentYear = matchesTeam(currentYearValue)
      const hasPreviousYear = matchesTeam(previousYearValue)

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
    const currentTeamTid = getTidFromAbbr(currentTeamAbbr)
    const players = [...(dynasty.players || [])]
    let fixedCount = 0
    const fixedPlayers = []

    // Senior classes - these players shouldn't have entries after their senior year
    const SENIOR_CLASSES = ['Sr', 'RS Sr']

    // Helper to check if a team value matches current team (handles tid and abbr)
    const isCurrentTeam = (teamValue) => {
      if (teamValue === undefined || teamValue === null) return false
      if (typeof teamValue === 'number') return teamValue === currentTeamTid
      return teamValue === currentTeamAbbr || teamValue?.toUpperCase() === currentTeamAbbr?.toUpperCase()
    }

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
      else if (mostRecentPrevTeam && !isCurrentTeam(mostRecentPrevTeam) && isCurrentTeam(currentYearTeam)) {
        // Check if player has any indication they recommitted (came back intentionally)
        const movements = player.movements || []
        const movementsByYear = player.movementsByYear || {}
        const hasRecommit = movements.some(m =>
          m.type === 'recommit' ||
          m.type === 'portal_in' ||
          (isCurrentTeam(m.to) && m.year >= mostRecentPrevYear)
        )
        const hasRecommitMovement = Object.values(movementsByYear).some(m =>
          m === 'Recommitted' || m === 'Transferred'
        )

        // Also check if they were originally from this team (came back home)
        const wasOriginallyOnTeam = Object.values(teamsByYear).filter(t => isCurrentTeam(t)).length > 1

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

  // Migrate a dynasty between local and cloud storage
  const migrateDynastyStorage = async (dynastyId, targetStorageType) => {
    const dynasty = dynasties.find(d => String(d.id) === String(dynastyId))
    if (!dynasty) {
      return { success: false, error: 'Dynasty not found' }
    }

    // Check if already at target
    if (dynasty.storageType === targetStorageType) {
      return { success: true, alreadyAtTarget: true }
    }

    // Check permissions for cloud migration
    if (targetStorageType === 'cloud') {
      if (!isPremium) {
        return { success: false, error: 'Premium required for cloud storage', requiresUpgrade: true }
      }
      if (!user) {
        return { success: false, error: 'Sign in required for cloud storage' }
      }
    }

    try {
      let result
      if (targetStorageType === 'cloud') {
        // Local → Cloud
        result = await storageService.migrateDynastyToCloud(dynastyId)
      } else {
        // Cloud → Local
        result = await storageService.migrateDynastyToLocal(dynastyId)
      }

      if (result.success) {
        // Update local state with new storageType
        const updatedDynasties = dynasties.map(d =>
          String(d.id) === String(dynastyId) || String(d.id) === String(result.dynasty?.id)
            ? { ...d, ...result.dynasty, storageType: targetStorageType }
            : d
        )
        setDynasties(updatedDynasties)

        // Update currentDynasty if it's the one being migrated
        if (String(currentDynasty?.id) === String(dynastyId)) {
          setCurrentDynasty({ ...currentDynasty, ...result.dynasty, storageType: targetStorageType })
        }
      }

      return result
    } catch (error) {
      console.error('Migration error:', error)
      return { success: false, error: error.message || 'Migration failed' }
    }
  }

  // Get custom teams from current dynasty for easy access
  const customTeams = currentDynasty?.customTeams || null

  // Cloud dynasties are read-only for non-premium users
  // They can view but not edit until they export and import as local
  const isViewOnly = currentDynasty?.storageType === 'cloud' && !isPremium

  const value = {
    dynasties,
    currentDynasty,
    customTeams,
    loading,
    isViewOnly,
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
    updateTeambuilderTeam,
    migrateDynastyStorage
  }

  return (
    <DynastyContext.Provider value={value}>
      {children}
    </DynastyContext.Provider>
  )
}

export default DynastyContext
