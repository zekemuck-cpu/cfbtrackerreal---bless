import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { useAuth } from './AuthContext'
import { useToast } from '../components/ui/Toast'
import {
  getUserDynasties,
  subscribeToDynasties,
  subscribeToSharedDynasties,
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
  migrateDynastyToSubcollections,
  // Single-document functions (efficient for individual updates)
  savePlayerToSubcollection,
  deletePlayerFromSubcollection,
  saveGameToSubcollection,
  saveChangedPlayersAndGame,
  saveChangedPlayers,
  saveWeeklyGamesChanges,
  deleteGameFromSubcollection,
  // Week recap subcollection (extracted out of the main doc to keep
  // long-running dynasties under Firestore's 1 MB document cap).
  saveWeekRecapToSubcollection,
  deleteWeekRecapFromSubcollection,
  getWeekRecapsSubcollection,
  migrateWeekRecapsToSubcollection
} from '../services/dynastyService'
import {
  PER_YEAR_FIELDS,
  PER_TEAM_YEAR_FIELDS,
  isSeasonalField,
  getSeasonsSubcollection,
  splitSeasonalUpdateByYear,
  writeSeasonalUpdate,
  migrateSeasonalFieldsToSubcollection
} from '../services/seasonSubcollection'

// Sets the listener uses to rehydrate seasonal fields from per-season
// docs back into the legacy `<field>ByYear` / `<field>ByTeamYear`
// shapes consumers already read.
const PER_YEAR_NAMES = new Set(PER_YEAR_FIELDS)
const ALL_SEASONAL_FIELD_NAMES = [...PER_YEAR_FIELDS, ...PER_TEAM_YEAR_FIELDS]
import { indexedDBStorage, storageService } from '../services/storage'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../config/firebase'
import { createDynastySheet, deleteGoogleSheet, writeExistingDataToSheet, createConferencesSheet, readConferencesFromSheet } from '../services/sheetsService'
import { getTeamName } from '../data/teamAbbreviations'
import { getTeamConference, getConferencesWithCustomTeams, conferenceTeams as DEFAULT_CONFERENCE_TEAMS } from '../data/conferenceTeams'
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
  addCareerEntry,
  isFCSPlaceholderAbbr,
  isFCSPlaceholderTid,
} from '../data/teamRegistry'
import { findMatchingPlayer, getPlayerLastHonorDescription, normalizePlayerName } from '../utils/playerMatching'
import { syncDerivedFieldsFromV2, legacyMovementToCanonical } from '../data/rosterModel'
import { normalizeAwardName } from '../utils/playerHeal'
import { getFirstRoundSlotId, getSlotIdFromBowlName, getCFPGameId, CFP_BRACKET_SLOTS, DEFAULT_BOWL_CONFIG, getBowlForSlot, CFP_BRACKET_FLOW, getBracketFlowConfig } from '../data/cfpConstants'
import { migrateDynastyToEditors, needsEditorsMigration, getMemberTeams, snapshotAllMembersForYear, getCoachNameForUid } from '../data/leagueModel'
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
      userTid = getTidFromAbbr(userTeamAbbr, dynasty)
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
    const gameUserTid = getTidFromAbbr(game.userTeam, dynasty)

    // Check if this game's userTeam matches what we coached that year
    if (userTid && gameUserTid !== userTid) return null  // Different team
    if (!userTid && userTeamAbbr && game.userTeam !== userTeamAbbr) return null

    // Get opponent tid for the perspective
    const opponentTid = game.opponentTid || getTidFromAbbr(game.opponent, dynasty)

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
    // Number-coerce both sides — legacy game records can store tids
    // as strings and number-vs-string strict-eq silently misclassifies
    // the home side (was the "every game shows Home" bug across the
    // app). Null/undefined → neutral.
    isHome: game.homeTeamTid != null && Number(game.homeTeamTid) === Number(tid),
    isAway: game.homeTeamTid != null && Number(game.homeTeamTid) !== Number(tid),
    isNeutral: game.homeTeamTid == null
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

    // Determine game type for the new shell based on slot ID pattern
    let gameType, legacyFlag, week, cfpRound
    if (nextSlotId.startsWith('cfpqf')) {
      gameType = GAME_TYPES.CFP_QUARTERFINAL
      legacyFlag = 'isCFPQuarterfinal'
      week = 'Bowl 2'
      cfpRound = 'quarterfinal'
    } else if (nextSlotId.startsWith('cfpsf')) {
      gameType = GAME_TYPES.CFP_SEMIFINAL
      legacyFlag = 'isCFPSemifinal'
      week = 'Bowl 3'
      cfpRound = 'semifinal'
    } else if (nextSlotId === 'cfpnc') {
      gameType = GAME_TYPES.CFP_CHAMPIONSHIP
      legacyFlag = 'isCFPChampionship'
      week = 'Bowl 4'
      cfpRound = 'championship'
    } else {
      console.error(`[propagateCFPWinner] Unknown slot ID pattern: ${nextSlotId}`)
      gameType = GAME_TYPES.CFP_SEMIFINAL
      legacyFlag = 'isCFPSemifinal'
      week = 'Bowl 3'
      cfpRound = 'semifinal'
    }

    const newShell = {
      id: expectedId,
      cfpSlot: nextSlotId,
      cfpRound,
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
  const abbr = getAbbrFromTid(dynasty.teams, tid)

  // FCS placeholders are anonymous buckets representing whichever real
  // FCS school the EA game collapsed into that slot. The same
  // placeholder plays many games in a single season (often multiple
  // games the same week), so accumulating wins/losses for it produces
  // a meaningless "record". Return all-zero — every consumer of this
  // function already filters out empty records, so the record simply
  // doesn't render anywhere for the four placeholders.
  if (isFCSPlaceholderAbbr(abbr)) {
    return { wins: 0, losses: 0, confWins: 0, confLosses: 0, pointsFor: 0, pointsAgainst: 0 }
  }

  // Filter to year and team. Tid checks come first (modern data); abbr
  // checks cover legacy CPU-vs-CPU games stored without tids. Includes
  // both team1/team2 abbr forms to defend against teambuilder games
  // recorded before tid migration but matching the team's CURRENT abbr.
  let teamGames = games.filter(g => {
    if (Number(g.year) !== Number(year)) return false

    const tidNum = Number(tid)
    const isInGame =
      Number(g.team1Tid) === tidNum || Number(g.team2Tid) === tidNum ||
      Number(g.userTid) === tidNum || Number(g.opponentTid) === tidNum ||
      g.userTeam === abbr || g.opponent === abbr ||
      g.team1 === abbr || g.team2 === abbr

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
  let pointsFor = 0, pointsAgainst = 0

  teamGames.forEach(g => {
    const { teamScore, opponentScore, isConfGame } = getTeamScoreInfo(g, tid, abbr)

    if (teamScore === undefined || opponentScore === undefined) return

    pointsFor += Number(teamScore) || 0
    pointsAgainst += Number(opponentScore) || 0

    if (teamScore > opponentScore) {
      wins++
      if (isConfGame) confWins++
    } else if (teamScore < opponentScore) {
      losses++
      if (isConfGame) confLosses++
    }
    // No ties in college football - games always have a winner
  })

  return { wins, losses, confWins, confLosses, pointsFor, pointsAgainst }
}

/**
 * Generic drift-safe lookup for any `*ByTeamYear` storage shape — i.e.
 * objects of the form `{ [teamKey]: { [year]: value, ... }, ... }` where
 * `teamKey` may be either a tid or an abbr depending on when the entry
 * was written. After a teambuilder rename, old entries sit under the old
 * abbr; new entries land under the new abbr; callers don't know which.
 *
 * Strategy:
 *   1. tid lookup (modern)
 *   2. current-abbr lookup (most common)
 *   3. scan all keys; for each abbr-keyed entry, resolve to tid via the
 *      registry; if it matches the requested team's tid, return.
 *
 * Step 3 only kicks in for teams that have been renamed; ordinary teams
 * hit step 2 and return immediately.
 */
export function lookupByTeamYear(structure, dynasty, tidOrAbbr, year) {
  if (!structure || !dynasty || tidOrAbbr == null || year == null) return undefined
  const tid = typeof tidOrAbbr === 'string' && !/^\d+$/.test(tidOrAbbr)
    ? getTidFromAbbr(tidOrAbbr, dynasty)
    : Number(tidOrAbbr)
  const abbr = typeof tidOrAbbr === 'number' || (typeof tidOrAbbr === 'string' && /^\d+$/.test(tidOrAbbr))
    ? (dynasty.teams?.[tidOrAbbr]?.abbr || getAbbrFromTid(dynasty.teams, tidOrAbbr))
    : tidOrAbbr

  // Year keys may be number or string depending on write path. Try both.
  const pickYear = (sub) => {
    if (!sub) return undefined
    if (sub[year] !== undefined) return sub[year]
    const ys = String(year)
    if (sub[ys] !== undefined) return sub[ys]
    const yn = Number(year)
    if (Number.isFinite(yn) && sub[yn] !== undefined) return sub[yn]
    return undefined
  }

  // 1. tid-keyed (covers structures that have already migrated)
  if (tid != null) {
    const v = pickYear(structure[tid])
    if (v !== undefined) return v
  }
  // 2. current-abbr keyed (most common)
  if (abbr) {
    const v = pickYear(structure[abbr])
    if (v !== undefined) return v
  }
  // 3. drift recovery — scan keys, resolve each to a tid via current
  //    registry, see if any old-abbr entry now points to our tid.
  if (tid != null) {
    for (const key of Object.keys(structure)) {
      if (key === abbr) continue
      if (key === String(tid)) continue
      const keyTid = getTidFromAbbr(key, dynasty)
      if (keyTid != null && Number(keyTid) === Number(tid)) {
        const v = pickYear(structure[key])
        if (v !== undefined) return v
      }
    }
  }
  return undefined
}

/**
 * Produce dot-notation Firestore-style updates that write a value to
 * BOTH the tid key and the current-abbr key of a `*ByTeamYear` structure.
 * Pair with `lookupByTeamYear` (drift-recovery on read) so a teambuilder
 * team renamed mid-dynasty:
 *   - retains its old data (still under old abbr, recoverable via scan)
 *   - new writes land under the new abbr AND the stable tid
 *   - reads find it via tid even if the abbr drifts again
 *
 * Returns a plain object suitable for spreading into an `updateDynasty`
 * payload. Year may be number or string; we write under whichever the
 * caller supplies (downstream readers tolerate both via the helper).
 *
 *   { ...buildByTeamYearUpdates('teamRecordsByTeamYear', dynasty, tidOrAbbr, year, value) }
 *
 * Both keys are written even if one resolves to the same string as the
 * other (de-duped), so callers don't have to check.
 */
export function buildByTeamYearUpdates(structureName, dynasty, tidOrAbbr, year, value) {
  if (!structureName || tidOrAbbr == null || year == null) return {}
  const tid = typeof tidOrAbbr === 'string' && !/^\d+$/.test(tidOrAbbr)
    ? getTidFromAbbr(tidOrAbbr, dynasty)
    : Number(tidOrAbbr)
  const abbr = typeof tidOrAbbr === 'number' || (typeof tidOrAbbr === 'string' && /^\d+$/.test(tidOrAbbr))
    ? (dynasty?.teams?.[tidOrAbbr]?.abbr || getAbbrFromTid(dynasty?.teams, tidOrAbbr))
    : tidOrAbbr
  const updates = {}
  if (tid != null && Number.isFinite(tid)) {
    updates[`${structureName}.${tid}.${year}`] = value
  }
  if (abbr && abbr !== String(tid)) {
    updates[`${structureName}.${abbr}.${year}`] = value
  }
  return updates
}

/**
 * Get the team record (single source of truth)
 * Priority:
 * 1. Calculate from actual games (if team has games in games[])
 * 2. Fall back to stored records (from conference standings, useful when switching teams)
 * @param {Object} dynasty - Dynasty object
 * @param {number|string} tidOrAbbr - Team ID or abbreviation
 * @param {number} year - Year
 * @returns {{ wins, losses, confWins, confLosses } | null}
 */
export function getTeamRecord(dynasty, tidOrAbbr, year) {
  if (!dynasty || !tidOrAbbr || !year) return null

  // Handle abbr input for backward compatibility
  const tid = typeof tidOrAbbr === 'string' ? getTidFromAbbr(tidOrAbbr, dynasty) : tidOrAbbr
  const abbr = typeof tidOrAbbr === 'number' ? getAbbrFromTid(dynasty.teams, tidOrAbbr) : tidOrAbbr

  // The bug we're fixing: for non-user teams, dynasty.games[] only
  // contains the user-vs-them games. The previous "if calc has any
  // wins/losses, use calc" gate caused a single user-vs-Duke bowl game
  // (calc = 0-1) to override Duke's authoritative stored 9-4 season
  // record. The fix is coverage-aware: collect every record source
  // we know about (live games, three different stored locations) and
  // pick whichever covers the most games. Calc only wins on ties or
  // when there's no stored record at all — and even then it carries
  // per-game point-diff numbers the stored rows don't have, so ties
  // going to calc is the right call.
  const calculatedRecord = calculateTeamRecordFromGames(dynasty, tid, year)
  const calcGames = (calculatedRecord?.wins || 0) + (calculatedRecord?.losses || 0)

  // Source A — `dynasty.teams[tid].byYear[year].record` (or .teamRecord)
  // Tid-keyed; survives abbr drift on teambuilder-renamed teams.
  const tidRecord = dynasty.teams?.[tid]?.byYear?.[year]?.record
                || dynasty.teams?.[tid]?.byYear?.[year]?.teamRecord
                || null

  // Source B — `dynasty.teamRecordsByTeamYear` (legacy abbr-or-tid keyed
  // map; drift-aware via tid → abbr lookup).
  const legacyRecord = lookupByTeamYear(dynasty.teamRecordsByTeamYear, dynasty, tid ?? abbr, year) || null

  // Source C — the conference standings row for this team, if present.
  let standingsRecord = null
  const standings = dynasty.conferenceStandingsByYear?.[year]
  if (standings) {
    for (const teams of Object.values(standings)) {
      if (!Array.isArray(teams)) continue
      // Tid match is strongest (survives abbr drift); guard the strict
      // equality with `tid != null` so an unresolvable lookup (tid=null)
      // doesn't accidentally match a row with no tid.
      const teamEntry = teams.find(t => (tid != null && Number(t.tid) === Number(tid)) || t.abbr === abbr || t.team === abbr)
      if (teamEntry && (teamEntry.wins > 0 || teamEntry.losses > 0)) {
        standingsRecord = {
          wins: teamEntry.wins || 0,
          losses: teamEntry.losses || 0,
          confWins: teamEntry.confWins || 0,
          confLosses: teamEntry.confLosses || 0,
        }
        break
      }
    }
  }

  // Pick whichever stored source covers the most games. We don't
  // privilege one source over another — they're all "stored elsewhere"
  // from the user's perspective; the one that reflects the most
  // complete season is the truth.
  const candidates = [tidRecord, legacyRecord, standingsRecord]
    .filter(r => r && (r.wins > 0 || r.losses > 0))
    .map(r => ({
      wins: r.wins || 0,
      losses: r.losses || 0,
      confWins: r.confWins || 0,
      confLosses: r.confLosses || 0,
      total: (r.wins || 0) + (r.losses || 0),
    }))
  const bestStored = candidates.length > 0
    ? candidates.reduce((best, r) => r.total > best.total ? r : best)
    : null
  const storedGames = bestStored?.total || 0

  // Calc wins on ties (it carries per-game accuracy and conf-record
  // computed from actual game rows); stored wins when it covers more
  // games. Calc with zero games and no stored record returns the
  // empty calc (downstream consumers expect 0-0 for unseen teams).
  if (calcGames >= storedGames && calcGames > 0) {
    return calculatedRecord
  }
  if (bestStored) {
    return {
      wins: bestStored.wins,
      losses: bestStored.losses,
      confWins: bestStored.confWins,
      confLosses: bestStored.confLosses,
    }
  }
  return calculatedRecord
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
 * Get current ranking for a team in a given year
 * UNIFIED RANKING SYSTEM - All pages should use this for consistency
 * Priority:
 * 1. Final poll ranking (if entered for that year) - end of season definitive ranking
 * 2. Most recent game ranking (userRank from games in chronological order)
 *
 * @param {Object} dynasty - Dynasty object
 * @param {number|string} tidOrAbbr - Team ID or abbreviation
 * @param {number} year - Year to check
 * @returns {{ rank: number, source: 'final_poll'|'game'|null, week?: number|string } | null}
 */
// ──────────────────────────────────────────────────────────────────────
// Per-team-per-week ranks — the authoritative store.
//
// Storage shape: dynasty.teams[tid].byYear[year].rankByWeek = {
//   0: 5, 1: 5, 2: 8, 3: 8, ..., 11: 6, 12: 15,
//   100: 4, 101: 4, ...   // CC + CFP weeks use the same numeric keys
//                         // getGameOrder() emits.
// }
//
// rankByWeek[N] = the rank the team CARRIED INTO Week N (entering
// Week N rank). For display, you look up rankByWeek[gameWeek] for the
// teams in that game.
//
// Why team-level not game-level: a team's rank is a property of the
// team at that moment in the season, not of any one game. Storing it
// per-game forces every read site to re-derive entering rank from the
// prior game; storing it per-team-per-week makes every read a one-line
// dictionary lookup.
//
// EA quirk: when the user enters a Week N scores sheet, the screenshot
// shows the post-Week-N ranks (= entering Week N+1). Those entries
// must be stored as rankByWeek[N+1], not rankByWeek[N]. CPU games
// (everyone else's matchups) follow this rule. User games — where
// the user controls a team in the matchup — have always been entered
// with the pre-game (entering) rank, so they go straight into
// rankByWeek[gameWeek] without shifting.
// ──────────────────────────────────────────────────────────────────────

/**
 * Get the user's tid for a given year. Mirrors getUserGamePerspective's
 * resolution but returns just the tid for a one-shot lookup.
 */
export function getUserTidForYear(dynasty, year) {
  if (!dynasty || year == null) return null
  const yearNum = Number(year)
  const yearStr = String(year)
  if (yearNum === Number(dynasty.currentYear)) {
    const tid = getUserTeamTid(dynasty)
    if (tid != null) return Number(tid)
  }
  const fromByYear = dynasty.coachTeamByYear?.[yearNum]?.tid
    ?? dynasty.coachTeamByYear?.[yearStr]?.tid
  if (fromByYear != null) return Number(fromByYear)
  const abbrFromByYear = dynasty.coachTeamByYear?.[yearNum]?.team
    ?? dynasty.coachTeamByYear?.[yearStr]?.team
  if (abbrFromByYear) {
    const tid = getTidFromAbbr(abbrFromByYear, dynasty)
    if (tid != null) return Number(tid)
  }
  if (dynasty.teamName) {
    const tid = getTidFromAbbr(dynasty.teamName, dynasty)
    if (tid != null) return Number(tid)
  }
  return null
}

/**
 * Whether a stored game was entered through the user-game flow
 * (GameEntryModal — pre-game ranks) or the CPU-game flow
 * (WeeklyScoresModal — post-game ranks). User games' team1Rank /
 * team2Rank are entering ranks; CPU games' are post-game ranks.
 */
export function isUserGame(dynasty, game) {
  if (!dynasty || !game) return false
  const userTid = getUserTidForYear(dynasty, game.year)
  if (userTid == null) return false
  if (game.team1Tid != null && Number(game.team1Tid) === userTid) return true
  if (game.team2Tid != null && Number(game.team2Tid) === userTid) return true
  if (game.userTid != null && Number(game.userTid) === userTid) return true
  // Legacy fallback — older user games used a userTeam abbr field.
  if (game.userTeam) {
    const ut = getTidFromAbbr(game.userTeam, dynasty)
    if (ut != null && Number(ut) === userTid) return true
  }
  return false
}

/**
 * Read the rank a team CARRIED INTO a given week (entering rank).
 * Returns the integer rank (1-25) or null if unranked / unknown.
 *
 * Falls back to dynasty.preseasonRankingsByYear for week 0 / week 1
 * when no rankByWeek data is stored yet (e.g. before the first
 * weekly-scores save of the year).
 */
export function getTeamRankForWeek(dynasty, tidOrAbbr, year, week) {
  if (!dynasty || tidOrAbbr == null || year == null || week == null) return null
  const tid = typeof tidOrAbbr === 'string' && !/^\d+$/.test(tidOrAbbr)
    ? getTidFromAbbr(tidOrAbbr, dynasty)
    : Number(tidOrAbbr)
  if (tid == null) return null
  const yearNum = Number(year)
  const yearStr = String(year)
  const byYear = dynasty.teams?.[tid]?.byYear
  const entry = byYear?.[yearNum]?.rankByWeek ?? byYear?.[yearStr]?.rankByWeek
  if (entry) {
    const v = entry[week] ?? entry[String(week)] ?? entry[Number(week)]
    if (v == null) return null
    const n = Number(v)
    return n >= 1 && n <= 25 ? n : null
  }
  // Preseason fallback for week 0 / week 1 — pull from the dynasty's
  // preseason poll if no rankByWeek data is stored yet.
  if (Number(week) <= 1) {
    const presPolls = dynasty.preseasonRankingsByYear?.[yearNum]
      || dynasty.preseasonRankingsByYear?.[yearStr]
    if (Array.isArray(presPolls)) {
      const entry2 = presPolls.find(p =>
        p && (
          (p.tid != null && Number(p.tid) === tid) ||
          (p.team && getTidFromAbbr(p.team, dynasty) === tid)
        )
      )
      if (entry2?.rank) return Number(entry2.rank)
    }
  }
  return null
}

/**
 * Migration: walk every stored game and seed each team's
 * rankByWeek map. User games' stored rank → rankByWeek[gameWeek];
 * CPU games' stored rank → rankByWeek[gameWeek + 1] (post-game →
 * entering next week).
 *
 * Idempotent — gated on dynasty._rankByWeekMigrated. Re-running
 * (via a Danger Zone admin action) will overwrite existing
 * rankByWeek data with the freshly recomputed values.
 *
 * Conflict resolution: when both a CPU game and a user game would
 * write to the same rankByWeek[N] slot for a team, we apply CPU
 * writes first then overlay user-game writes — the user has stated
 * user-game ranks are always correct and should win conflicts.
 */
export function migrateRanksToRankByWeek(dynasty, options = {}) {
  if (!dynasty || !Array.isArray(dynasty.games)) return dynasty
  const { force = false } = options
  // V4 of the migration: bumps from V3 to re-run with stronger tid
  // resolution for legacy preseason / final poll entries. V3 only
  // resolved tids via the explicit `tid` field or getTidFromAbbr.
  // V4 also walks dynasty.teams for case-insensitive abbr / name
  // matches — older dynasties with only abbr-keyed final polls now
  // seed rankByWeek correctly. Without this, the Top 25 sheet's
  // pre-fill would miss those entries, and saving the sheet could
  // wipe stored rankByWeek data the user couldn't see in the sheet.
  if (dynasty._rankByWeekMigratedV4 && !force) return dynasty

  const games = dynasty.games
  const teamsCopy = { ...(dynasty.teams || {}) }

  // Helper: bump a single rank into a team-year's rankByWeek slot.
  const writeRank = (tid, year, weekKey, rank) => {
    if (tid == null || year == null || weekKey == null) return
    if (typeof rank !== 'number' || rank < 1 || rank > 25) return
    const tidKey = String(tid)
    const yearKey = String(year)
    const team = teamsCopy[tidKey] || teamsCopy[tid] || {}
    const byYear = { ...(team.byYear || {}) }
    const yearEntry = { ...(byYear[yearKey] || byYear[year] || {}) }
    const rankByWeek = { ...(yearEntry.rankByWeek || {}) }
    rankByWeek[weekKey] = rank
    yearEntry.rankByWeek = rankByWeek
    byYear[yearKey] = yearEntry
    teamsCopy[tidKey] = { ...team, byYear }
  }

  // Determine each game's "week key" — regular weeks use the integer
  // week; CC / CFP / bowls use 100+ to match getGameOrder() semantics
  // and avoid collision with regular weeks.
  const weekKeyOf = (g) => {
    if (g.isCFPChampionship) return 104
    if (g.isCFPSemifinal) return 103
    if (g.isCFPQuarterfinal) return 102
    if (g.isCFPFirstRound) return 101
    if (g.isConferenceChampionship) return 100
    if (g.isBowlGame) return 100
    const w = Number(g.week)
    return Number.isFinite(w) ? w : null
  }

  // Two passes — CPU first, user games second so user-game ranks win
  // any conflict with the same team in the same week.
  for (const pass of ['cpu', 'user']) {
    for (const g of games) {
      if (!g || g.year == null) continue
      const userOwned = isUserGame(dynasty, g)
      if (pass === 'cpu' && userOwned) continue
      if (pass === 'user' && !userOwned) continue
      const wk = weekKeyOf(g)
      if (wk == null) continue
      // User games: stored rank = entering rank → write to rankByWeek[wk].
      // CPU games: stored rank = post-game rank → write to rankByWeek[wk+1]
      // (= entering next week). We don't know what "next week" means for
      // postseason games (CC → CFP1 → CFPQ → ...) so post-game shifts
      // for those games go to the next event in the sequence.
      const targetKey = userOwned ? wk : (wk >= 100 ? wk + 1 : wk + 1)
      const t1 = g.team1Tid != null ? Number(g.team1Tid) : null
      const t2 = g.team2Tid != null ? Number(g.team2Tid) : null
      const r1 = typeof g.team1Rank === 'number' ? g.team1Rank : null
      const r2 = typeof g.team2Rank === 'number' ? g.team2Rank : null
      if (t1 != null && r1 != null) writeRank(t1, g.year, targetKey, r1)
      if (t2 != null && r2 != null) writeRank(t2, g.year, targetKey, r2)
    }
  }

  // Seed week-0 / week-1 from preseason rankings so display lookups
  // for early-season games don't return null when no game has been
  // played yet.
  // Preseason poll seeding is below (uses the loose tid resolver
  // defined just before — handles legacy abbr-only entries that
  // getTidFromAbbr alone can't always resolve).
  const presByYear = dynasty.preseasonRankingsByYear || {}

  // Seed week-105 ("Final Poll" — post-Natty rank) from existing
  // finalPollsByYear data. Mirrors the per-team-per-week store with
  // whatever the user already entered through the end-of-season
  // recap flow, so the Top 25 page's "Final Poll" column and the
  // Edit-Rankings sheet stay in sync without requiring a re-save.
  //
  // Aggressive tid resolution: legacy entries often have only an abbr
  // (no tid). Try multiple paths to resolve every entry — explicit
  // tid → getTidFromAbbr → walk dynasty.teams for a case-insensitive
  // abbr match → walk dynasty.teams for a case-insensitive name match.
  // The cost of a missed resolution is the entry not seeding rankByWeek,
  // which means the Top 25 sheet creator can't pre-fill it, which means
  // the user could accidentally clear it on save (the bug we're fixing).
  const resolveTidLoose = (entry) => {
    if (!entry) return null
    if (entry.tid != null) {
      const n = Number(entry.tid)
      if (Number.isFinite(n)) return n
    }
    if (entry.team) {
      const fromAbbr = getTidFromAbbr(entry.team, dynasty)
      if (fromAbbr != null) return Number(fromAbbr)
      const wantedUpper = String(entry.team).toUpperCase()
      const wantedTrim = String(entry.team).trim().toLowerCase()
      for (const [tidKey, team] of Object.entries(dynasty.teams || {})) {
        if (!team) continue
        if (team.abbr && String(team.abbr).toUpperCase() === wantedUpper) return Number(tidKey)
        if (team.name && String(team.name).trim().toLowerCase() === wantedTrim) return Number(tidKey)
      }
    }
    return null
  }
  const finalPollsByYear = dynasty.finalPollsByYear || {}
  for (const [year, polls] of Object.entries(finalPollsByYear)) {
    const media = polls?.media
    if (!Array.isArray(media)) continue
    for (const e of media) {
      const tid = resolveTidLoose(e)
      if (tid == null) continue
      if (typeof e.rank !== 'number') continue
      writeRank(tid, year, 105, e.rank)
    }
  }
  // Same loose resolution for preseason polls — also legacy data
  // that might predate the tid-everywhere migration.
  for (const [year, polls] of Object.entries(presByYear)) {
    if (!Array.isArray(polls)) continue
    for (const p of polls) {
      const tid = resolveTidLoose(p)
      if (tid == null) continue
      if (typeof p.rank !== 'number') continue
      writeRank(tid, year, 0, p.rank)
      writeRank(tid, year, 1, p.rank)
    }
  }

  // Now that rankByWeek is fully populated, rewrite every game's
  // team1Rank/team2Rank to the team's ENTERING rank for that game's
  // week. After this rewrite, every game record's stored rank IS the
  // rank during the game — no further derivation needed at read time.
  const readEntering = (tid, year, week) => {
    if (tid == null || year == null || week == null) return null
    const t = teamsCopy[String(tid)] || teamsCopy[tid]
    const rbw = t?.byYear?.[String(year)]?.rankByWeek ?? t?.byYear?.[year]?.rankByWeek
    if (!rbw) return null
    const v = rbw[week] ?? rbw[String(week)]
    if (typeof v !== 'number' || v < 1 || v > 25) return null
    return v
  }
  const rewrittenGames = games.map(g => {
    if (!g || g.year == null) return g
    const wk = weekKeyOf(g)
    if (wk == null) return g
    let next = g
    if (g.team1Tid != null) {
      const r = readEntering(Number(g.team1Tid), g.year, wk)
      const stored = typeof g.team1Rank === 'number' ? g.team1Rank : null
      if (r !== stored) next = { ...next, team1Rank: r }
    }
    if (g.team2Tid != null) {
      const r = readEntering(Number(g.team2Tid), g.year, wk)
      const stored = typeof g.team2Rank === 'number' ? g.team2Rank : null
      if (r !== stored) next = { ...next, team2Rank: r }
    }
    return next
  })

  return {
    ...dynasty,
    games: rewrittenGames,
    teams: teamsCopy,
    _rankByWeekMigrated: true,
    _rankByWeekMigratedV3: true,
    _rankByWeekMigratedV4: true,
  }
}

/**
 * Safe rebuild for already-migrated dynasties. Walks every game and
 * rewrites dynasty.teams[*].byYear[*].rankByWeek using each game's
 * CURRENT team1Rank/team2Rank — which after migration IS the entering
 * rank, no shift required. Re-applies preseason poll seeds at week 0/1
 * and final poll seeds at week 105.
 *
 * Why this exists: migrateRanksToRankByWeek's CPU-shift logic assumes
 * raw post-game-rank data. Running it twice corrupts everything (the
 * second pass shifts already-shifted entering ranks by +1). The Danger
 * Zone "Rebuild" button uses THIS function instead, which is safe to
 * run any number of times because it doesn't apply any shifts.
 */
export function rebuildRankByWeekFromCurrentState(dynasty) {
  if (!dynasty) return dynasty?.teams || {}

  // Start with a teams object where every team's byYear.rankByWeek
  // is wiped — we're rebuilding from scratch, no merging.
  const teamsCopy = {}
  for (const [tidKey, team] of Object.entries(dynasty.teams || {})) {
    if (!team) { teamsCopy[tidKey] = team; continue }
    const byYear = {}
    for (const [yearKey, yEntry] of Object.entries(team.byYear || {})) {
      if (!yEntry) { byYear[yearKey] = yEntry; continue }
      // Drop rankByWeek; keep everything else (coachingStaff, etc.).
      const { rankByWeek: _drop, ...rest } = yEntry
      byYear[yearKey] = rest
    }
    teamsCopy[tidKey] = { ...team, byYear }
  }

  const writeRank = (tid, year, weekKey, rank) => {
    if (tid == null || year == null || weekKey == null) return
    if (typeof rank !== 'number' || rank < 1 || rank > 25) return
    const tidKey = String(tid)
    const yearKey = String(year)
    const team = teamsCopy[tidKey] || teamsCopy[tid] || {}
    const byYear = { ...(team.byYear || {}) }
    const yearEntry = { ...(byYear[yearKey] || byYear[year] || {}) }
    const rankByWeek = { ...(yearEntry.rankByWeek || {}) }
    rankByWeek[weekKey] = rank
    yearEntry.rankByWeek = rankByWeek
    byYear[yearKey] = yearEntry
    teamsCopy[tidKey] = { ...team, byYear }
  }

  const weekKeyOf = (g) => {
    if (g.isCFPChampionship) return 104
    if (g.isCFPSemifinal) return 103
    if (g.isCFPQuarterfinal) return 102
    if (g.isCFPFirstRound) return 101
    if (g.isConferenceChampionship) return 100
    if (g.isBowlGame) return 100
    const w = Number(g.week)
    return Number.isFinite(w) ? w : null
  }

  // Walk every game; team1Rank/team2Rank ARE the entering rank by now.
  for (const g of (dynasty.games || [])) {
    if (!g || g.year == null) continue
    const wk = weekKeyOf(g)
    if (wk == null) continue
    if (g.team1Tid != null && typeof g.team1Rank === 'number') {
      writeRank(Number(g.team1Tid), g.year, wk, g.team1Rank)
    }
    if (g.team2Tid != null && typeof g.team2Rank === 'number') {
      writeRank(Number(g.team2Tid), g.year, wk, g.team2Rank)
    }
  }

  // Re-seed preseason at week 0/1 and final poll at week 105 from
  // their canonical stores.
  const presByYear = dynasty.preseasonRankingsByYear || {}
  for (const [year, polls] of Object.entries(presByYear)) {
    if (!Array.isArray(polls)) continue
    for (const p of polls) {
      const tid = p?.tid != null ? Number(p.tid) : (p?.team ? getTidFromAbbr(p.team, dynasty) : null)
      if (tid == null || typeof p.rank !== 'number') continue
      writeRank(tid, year, 0, p.rank)
      writeRank(tid, year, 1, p.rank)
    }
  }
  const finalPollsByYear = dynasty.finalPollsByYear || {}
  for (const [year, polls] of Object.entries(finalPollsByYear)) {
    const media = polls?.media
    if (!Array.isArray(media)) continue
    for (const e of media) {
      const tid = e?.tid != null ? Number(e.tid) : (e?.team ? getTidFromAbbr(e.team, dynasty) : null)
      if (tid == null || typeof e.rank !== 'number') continue
      writeRank(tid, year, 105, e.rank)
    }
  }

  return teamsCopy
}

/**
 * Given a single saved game + the current dynasty.teams object, return
 * a NEW dynasty.teams object with that game's rank updates applied.
 * Used by addGame and updateGame so every save keeps rankByWeek in
 * sync without forcing the caller to know the EA shift rules.
 *
 * Same shift logic as the migration: user games' team1Rank /
 * team2Rank go to rankByWeek[gameWeek]; CPU games' go to
 * rankByWeek[gameWeek + 1] (post-game rank → entering next week).
 */
export function applyGameRanksToTeams(dynasty, game) {
  if (!dynasty || !game || game.year == null) return dynasty.teams || {}

  const teamsCopy = { ...(dynasty.teams || {}) }
  const writeRank = (tid, year, weekKey, rank) => {
    if (tid == null || year == null || weekKey == null) return
    if (typeof rank !== 'number' || rank < 1 || rank > 25) return
    const tidKey = String(tid)
    const team = teamsCopy[tidKey] || teamsCopy[tid] || {}
    const byYear = { ...(team.byYear || {}) }
    const yearKey = String(year)
    const yearEntry = { ...(byYear[yearKey] || byYear[year] || {}) }
    const rankByWeek = { ...(yearEntry.rankByWeek || {}) }
    rankByWeek[weekKey] = rank
    yearEntry.rankByWeek = rankByWeek
    byYear[yearKey] = yearEntry
    teamsCopy[tidKey] = { ...team, byYear }
  }

  const weekKey = (() => {
    if (game.isCFPChampionship) return 104
    if (game.isCFPSemifinal) return 103
    if (game.isCFPQuarterfinal) return 102
    if (game.isCFPFirstRound) return 101
    if (game.isConferenceChampionship) return 100
    if (game.isBowlGame) return 100
    const w = Number(game.week)
    return Number.isFinite(w) ? w : null
  })()
  if (weekKey == null) return teamsCopy

  // The stored game.team1Rank / team2Rank is now ALWAYS the entering
  // rank for that game's week (post-migration semantics). Direct edits
  // through addGame / updateGame come through here — the user is
  // editing the entering rank field they see in the UI, so we mirror
  // it straight into rankByWeek[weekKey] without any shift.
  //
  // The EA shift (post-game → entering-next-week) only happens at
  // the weekly-scoreboard save flow (saveWeeklyScores), which writes
  // rankByWeek[weekKey + 1] internally before the game record itself
  // gets its team1Rank/team2Rank set to the entering rank.
  const t1 = game.team1Tid != null ? Number(game.team1Tid) : null
  const t2 = game.team2Tid != null ? Number(game.team2Tid) : null
  const r1 = typeof game.team1Rank === 'number' ? game.team1Rank : null
  const r2 = typeof game.team2Rank === 'number' ? game.team2Rank : null
  if (t1 != null && r1 != null) writeRank(t1, game.year, weekKey, r1)
  if (t2 != null && r2 != null) writeRank(t2, game.year, weekKey, r2)

  return teamsCopy
}

/**
 * Apply a Top 25 sheet sync-back diff to dynasty.teams. Diff shape
 * matches readTop25FromSheet's output:
 *
 *   { [tid]: { [year]: { [weekKey]: rank | null } } }
 *
 * `rank` (1-25) sets or replaces the team's rankByWeek slot.
 * `null` clears the slot (= the user removed the team from that
 * (rank, week) cell on the sheet).
 *
 * Returns the new dynasty.teams object — caller wraps it in an
 * updateDynasty({ teams }) call. Pure / immutable; doesn't mutate the
 * input.
 */
export function applyTop25SheetDiff(dynasty, diff) {
  if (!dynasty || !diff || typeof diff !== 'object') return dynasty?.teams || {}
  const teamsCopy = { ...(dynasty.teams || {}) }
  for (const [tidKey, byYear] of Object.entries(diff)) {
    if (!byYear || typeof byYear !== 'object') continue
    const tidStr = String(tidKey)
    const team = teamsCopy[tidStr] || teamsCopy[Number(tidStr)] || {}
    const teamByYear = { ...(team.byYear || {}) }
    for (const [yearKey, weekUpdates] of Object.entries(byYear)) {
      if (!weekUpdates || typeof weekUpdates !== 'object') continue
      const yearEntry = { ...(teamByYear[yearKey] || teamByYear[Number(yearKey)] || {}) }
      const rankByWeek = { ...(yearEntry.rankByWeek || {}) }
      for (const [weekKey, value] of Object.entries(weekUpdates)) {
        if (value == null) {
          delete rankByWeek[weekKey]
          delete rankByWeek[Number(weekKey)]
        } else {
          const n = Number(value)
          if (Number.isFinite(n) && n >= 1 && n <= 25) rankByWeek[weekKey] = n
        }
      }
      yearEntry.rankByWeek = rankByWeek
      teamByYear[yearKey] = yearEntry
    }
    teamsCopy[tidStr] = { ...team, byYear: teamByYear }
  }
  return teamsCopy
}

/**
 * Build a human-readable diff summary from a Top 25 sheet sync-back
 * diff + the current dynasty state. Shape:
 *
 *   {
 *     byYear: {
 *       [year]: {
 *         added:   [{ tid, abbr, weekKey, rank }],     // new ranking entries
 *         removed: [{ tid, abbr, weekKey, rank }],     // entries cleared
 *         changed: [{ tid, abbr, weekKey, oldRank, newRank }],
 *       }
 *     },
 *     totals: { added, removed, changed },
 *   }
 *
 * Used by the Top 25 sheet modal to show the user every change before
 * applying — they confirm or cancel.
 */
export function buildTop25Diff(dynasty, diff) {
  if (!dynasty || !diff || typeof diff !== 'object') return { byYear: {}, totals: { added: 0, removed: 0, changed: 0 } }

  const teamAbbr = (tidKey) => {
    const t = dynasty.teams?.[tidKey] || dynasty.teams?.[Number(tidKey)]
    return t?.abbr || tidKey
  }
  const readOld = (tidKey, year, weekKey) => {
    const t = dynasty.teams?.[tidKey] || dynasty.teams?.[Number(tidKey)]
    const rbw = t?.byYear?.[year]?.rankByWeek ?? t?.byYear?.[String(year)]?.rankByWeek
    if (!rbw) return null
    const v = rbw[weekKey] ?? rbw[String(weekKey)]
    return typeof v === 'number' ? v : null
  }

  const byYear = {}
  let totalAdded = 0, totalRemoved = 0, totalChanged = 0
  for (const [tidKey, byYearMap] of Object.entries(diff)) {
    for (const [year, weekUpdates] of Object.entries(byYearMap || {})) {
      const yearEntry = byYear[year] || (byYear[year] = { added: [], removed: [], changed: [] })
      for (const [weekKey, newVal] of Object.entries(weekUpdates || {})) {
        const wk = Number(weekKey)
        if (!Number.isFinite(wk)) continue
        const oldRank = readOld(tidKey, year, wk)
        const abbr = teamAbbr(tidKey)
        if (newVal == null) {
          if (oldRank != null) {
            yearEntry.removed.push({ tid: Number(tidKey), abbr, weekKey: wk, rank: oldRank })
            totalRemoved += 1
          }
        } else {
          const newRank = Number(newVal)
          if (!Number.isFinite(newRank)) continue
          if (oldRank == null) {
            yearEntry.added.push({ tid: Number(tidKey), abbr, weekKey: wk, rank: newRank })
            totalAdded += 1
          } else if (oldRank !== newRank) {
            yearEntry.changed.push({ tid: Number(tidKey), abbr, weekKey: wk, oldRank, newRank })
            totalChanged += 1
          }
        }
      }
    }
  }
  return { byYear, totals: { added: totalAdded, removed: totalRemoved, changed: totalChanged } }
}

export function getTeamRanking(dynasty, tidOrAbbr, year) {
  if (!dynasty || !tidOrAbbr || !year) return null

  // Resolve tid and abbr
  const tid = typeof tidOrAbbr === 'string' ? getTidFromAbbr(tidOrAbbr, dynasty) : tidOrAbbr
  const abbr = typeof tidOrAbbr === 'number' ? getOriginalTeamAbbr(tidOrAbbr) : tidOrAbbr

  // Priority 1: rankByWeek — the canonical per-week rank store the
  // Rankings page reads from. Take this team's highest populated
  // week so the team page shows the current-week rank and matches
  // the Rankings page exactly. This wins over saved final polls so
  // an in-season team that has a stale or pre-existing finalPolls
  // entry (preseason poll seed, prior playthrough, manual entry)
  // doesn't override the live week-by-week truth.
  if (tid != null) {
    const byYear = dynasty.teams?.[tid]?.byYear || dynasty.teams?.[String(tid)]?.byYear
    const rankByWeek = byYear?.[year]?.rankByWeek ?? byYear?.[String(year)]?.rankByWeek
    if (rankByWeek && typeof rankByWeek === 'object') {
      let latestWeek = -Infinity
      let latestRank = null
      for (const [k, v] of Object.entries(rankByWeek)) {
        const wk = Number(k)
        if (!Number.isFinite(wk)) continue
        if (typeof v !== 'number' || v < 1 || v > 25) continue
        if (wk > latestWeek) { latestWeek = wk; latestRank = v }
      }
      if (latestRank != null) {
        return { rank: latestRank, source: 'rank_by_week', week: latestWeek }
      }
    }
  }

  // Priority 2: Saved final poll. Only consulted when no rankByWeek
  // exists — covers legacy dynasties that pre-date rankByWeek and
  // never had weekly-scores saves populate it.
  const finalPolls = dynasty.finalPollsByYear?.[year]
  if (finalPolls?.media?.length > 0) {
    const teamEntry = finalPolls.media.find(p => p && ((tid != null && Number(p.tid) === Number(tid)) || p.team === abbr))
    if (teamEntry?.rank) {
      return { rank: teamEntry.rank, source: 'final_poll' }
    }
  }

  // Priority 3: Get ranking from most recent game (in chronological order)
  const games = dynasty.games || []
  const teamGames = games
    .filter(g => {
      if (Number(g.year) !== Number(year)) return false
      return g.team1Tid === tid || g.team2Tid === tid ||
             g.team1 === abbr || g.team2 === abbr ||
             g.userTeam === abbr
    })
    .filter(g => g.team1Score !== null || g.team2Score !== null) // Only played games
    .sort((a, b) => {
      // Sort by week (handle bowl weeks like 'Bowl 1', 'Bowl 2', etc.)
      const weekA = typeof a.week === 'string' && a.week.startsWith('Bowl') ? 100 + parseInt(a.week.split(' ')[1] || '1') : Number(a.week)
      const weekB = typeof b.week === 'string' && b.week.startsWith('Bowl') ? 100 + parseInt(b.week.split(' ')[1] || '1') : Number(b.week)
      return weekA - weekB
    })

  if (teamGames.length > 0) {
    const lastGame = teamGames[teamGames.length - 1]
    const isTeam1 = lastGame.team1Tid === tid || lastGame.team1 === abbr
    const rank = isTeam1 ? lastGame.team1Rank : lastGame.team2Rank

    // Also check legacy userRank field
    const legacyRank = lastGame.userTeam === abbr ? lastGame.userRank : null

    const finalRank = rank || legacyRank
    if (finalRank) {
      return { rank: finalRank, source: 'game', week: lastGame.week }
    }
  }

  return null
}

/**
 * Build a live Top 25 for a given year from game-level rankings
 * (`team1Rank` / `team2Rank` on each game). Drives the Rankings page
 * so weekly score entries flow into the Top 25 without requiring
 * end-of-season manual entry.
 *
 * The naive "use only the latest week with rank data" approach falls
 * apart when the user enters their own Week N game first (one ranked
 * team) before logging the rest of Week N's nationwide scores — Top
 * 25 collapses to a single row. To fix that, we walk weeks newest →
 * oldest and fill each rank 1–25 from the most recent week that
 * supplied it, with a guard to keep any one team from appearing in
 * two slots (a team's rank can shift week-to-week, so we always keep
 * its newest rank and drop older ones).
 *
 * Returns the same shape as a saved final-poll's `media` array so
 * callers can swap between live and saved with no shape changes.
 *
 * @param {Object} dynasty
 * @param {number} year
 * @returns {{ entries: Array<{ rank, team, tid }>, week: number|null }}
 */
export function buildLiveTop25FromGames(dynasty, year, options = {}) {
  if (!dynasty || !year) return { entries: [], week: null }
  const { upToWeek } = options
  const games = dynasty.games || []
  const yearNum = Number(year)
  const validRank = (n) => typeof n === 'number' && n >= 1 && n <= 25

  // Bucket game-level (rank, team) observations by week. Each
  // week-bucket holds rank → first team seen at that rank that week.
  // Working off these buckets lets us walk weeks in order without
  // re-scanning the whole games list per pass.
  const weekBuckets = new Map() // wk -> Map(rank -> { tid, abbr })
  const observe = (wk, rank, tid, abbr) => {
    if (!validRank(rank)) return
    if (!weekBuckets.has(wk)) weekBuckets.set(wk, new Map())
    const bucket = weekBuckets.get(wk)
    if (bucket.has(rank)) return
    bucket.set(rank, {
      tid: tid != null ? Number(tid) : null,
      abbr: abbr || null,
    })
  }
  for (const g of games) {
    if (!g || Number(g.year) !== yearNum) continue
    const wk = typeof g.week === 'number' ? g.week : parseInt(g.week, 10)
    if (!Number.isFinite(wk)) continue
    // Optional week ceiling — lets callers ask "what did the Top 25 look
    // like through Week N?" without losing later weeks' game records.
    if (upToWeek != null && Number.isFinite(Number(upToWeek)) && wk > Number(upToWeek)) continue
    const t1Tid = g.team1Tid != null ? Number(g.team1Tid) : null
    const t2Tid = g.team2Tid != null ? Number(g.team2Tid) : null
    const t1Abbr = (t1Tid && dynasty.teams?.[t1Tid]?.abbr) || g.team1 || null
    const t2Abbr = (t2Tid && dynasty.teams?.[t2Tid]?.abbr) || g.team2 || null
    observe(wk, g.team1Rank, t1Tid, t1Abbr)
    observe(wk, g.team2Rank, t2Tid, t2Abbr)
  }
  if (weekBuckets.size === 0) return { entries: [], week: null }

  const sortedWeeks = Array.from(weekBuckets.keys()).sort((a, b) => b - a)
  const latestWeek = sortedWeeks[0]

  // Two-pass fill:
  //  Pass 1 — register every team's NEWEST rank (across all weeks)
  //    so a team that shifted from #1 last week to #3 this week
  //    appears only at #3, never both.
  //  Pass 2 — write to slot map newest → oldest. A slot is only
  //    filled if (a) it isn't already taken and (b) the team that
  //    held it that week still holds that exact rank in their
  //    "newest" registration (otherwise that's a stale duplicate).
  const teamNewestRank = new Map() // teamKey -> { rank, tid, abbr }
  const teamKeyOf = (tid, abbr) => tid != null ? `tid:${tid}` : `abbr:${abbr || ''}`
  for (const wk of sortedWeeks) {
    const bucket = weekBuckets.get(wk)
    for (const [rank, info] of bucket.entries()) {
      const key = teamKeyOf(info.tid, info.abbr)
      if (!key) continue
      if (!teamNewestRank.has(key)) {
        teamNewestRank.set(key, { rank, tid: info.tid, abbr: info.abbr })
      }
    }
  }

  const slotMap = new Map() // rank -> { rank, team, tid }
  for (const wk of sortedWeeks) {
    const bucket = weekBuckets.get(wk)
    for (const [rank, info] of bucket.entries()) {
      if (slotMap.has(rank)) continue
      const key = teamKeyOf(info.tid, info.abbr)
      const newest = teamNewestRank.get(key)
      // Skip if this team's newest rank isn't this slot — they'll be
      // (or have been) placed elsewhere by their newest entry.
      if (!newest || newest.rank !== rank) continue
      slotMap.set(rank, { rank, team: info.abbr || null, tid: info.tid })
    }
    if (slotMap.size === 25) break
  }

  const entries = Array.from(slotMap.values()).sort((a, b) => a.rank - b.rank)
  return { entries, week: latestWeek }
}

/**
 * Get current ranking for the user's current team in current year
 * Convenience wrapper for Dashboard usage
 */
export function getCurrentTeamRanking(dynasty) {
  if (!dynasty) return null

  const tid = getCurrentTeamTid(dynasty)
  const year = dynasty.currentYear

  if (!tid || !year) return null

  return getTeamRanking(dynasty, tid, year)
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
  const calc = calculateTeamRecordFromGames(dynasty, tid, game.year, {
    upToWeek: gameOrder,
    includeUpToWeek: true
  })

  // Coverage check: for non-user teams, dynasty.games[] only contains
  // user-vs-them games, so calc is sparse and would show e.g. "1-0" for
  // a team whose stored full-season record is 9-4. The "as-of"
  // semantic (record at this point in time) only makes sense when we
  // actually have the team's full game-by-game history, which we
  // don't for non-user teams. Fall back to whichever stored source
  // covers the most games — practically that's the team's end-of-
  // season record, which is closer to what the user expects to see
  // next to a CPU opponent's name than a sparse partial calc.
  const helperRec = getTeamRecord(dynasty, tid, game.year)
  const calcGames = (calc.wins || 0) + (calc.losses || 0)
  const helperGames = (helperRec?.wins || 0) + (helperRec?.losses || 0)
  if (helperRec && helperGames > calcGames) {
    return {
      overall: `${helperRec.wins}-${helperRec.losses}`,
      conference: `${helperRec.confWins || 0}-${helperRec.confLosses || 0}`,
      wins: helperRec.wins,
      losses: helperRec.losses,
      confWins: helperRec.confWins || 0,
      confLosses: helperRec.confLosses || 0,
    }
  }

  return {
    overall: `${calc.wins}-${calc.losses}`,
    conference: `${calc.confWins}-${calc.confLosses}`,
    wins: calc.wins,
    losses: calc.losses,
    confWins: calc.confWins,
    confLosses: calc.confLosses
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
  const abbr = getAbbrFromTid(dynasty.teams, tid)

  if (!abbr) return {}

  record.lastUpdated = new Date().toISOString()

  // Build updates for both structures (for backward compatibility)
  const updates = {}

  // New tid-based structure
  updates[`teams.${tid}.byYear.${year}.record`] = record

  // Legacy structure — dual-write tid + abbr keys so the data stays
  // findable even if the team is renamed (lookupByTeamYear scans both).
  const recordPayload = {
    wins: record.wins,
    losses: record.losses,
    confWins: record.confWins,
    confLosses: record.confLosses
  }
  Object.assign(updates, buildByTeamYearUpdates('teamRecordsByTeamYear', dynasty, tid, year, recordPayload))

  return updates
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
    sum: [
      'fGM', 'fGA', 'xPM', 'xPA', 'kickoffs', 'touchbacks',
      'fGBlock', 'xPB',
      'fGM29', 'fGA29', 'fGM39', 'fGA39', 'fGM49', 'fGA49', 'fGM50+', 'fGA50+'
    ],
    max: ['fGLong']
  },
  punting: {
    sum: ['punts', 'yards', 'netYards', 'in20', 'tB', 'block'],
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
  kicking: {
    fGM: 'fgm', fGA: 'fga', xPM: 'xpm', xPA: 'xpa',
    kickoffs: 'kickoffs', touchbacks: 'touchbacks', fGLong: 'lng',
    fGBlock: 'fgb', xPB: 'xpb',
    fGM29: 'fgm29', fGA29: 'fga29',
    fGM39: 'fgm39', fGA39: 'fga39',
    fGM49: 'fgm49', fGA49: 'fga49',
    'fGM50+': 'fgm50', 'fGA50+': 'fga50'
  },
  punting: {
    punts: 'punts', yards: 'yds', netYards: 'netYds', in20: 'in20',
    tB: 'tb', long: 'lng', block: 'block'
  },
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
 * Recompute "max" (long) fields by scanning all games for the year.
 * Needed because the delta path uses Math.max against current — it never
 * decreases a season long even if the game that originally set it was edited
 * down. Sum/count fields remain delta-tracked (cheap, correct).
 *
 * Exhaustive across all (player, category) pairs — for any player whose
 * statsByYear[year][category] exists, we set every max field to the
 * highest value found across all games' contributions, OR 0 if no game
 * contains that player's stats for that category. Without the "OR 0"
 * step, a wipe (Reset on a slice) would orphan max fields: the player
 * disappears from every game's contribution but their season-long
 * stays at the old value forever.
 */
function recomputeMaxFieldsFromGames(players, allGames, year) {
  const yearNum = Number(year)
  const gamesWithBox = (allGames || []).filter(g =>
    Number(g.year) === yearNum && g.boxScore
  )

  // Collect: playerName -> category -> maxField -> max value across games
  const maxByPlayer = {}
  gamesWithBox.forEach(game => {
    const contribution = extractBoxScoreContribution(game.boxScore)
    Object.entries(contribution).forEach(([normalizedName, catStats]) => {
      if (!maxByPlayer[normalizedName]) maxByPlayer[normalizedName] = {}
      Object.keys(BOX_SCORE_STATS).forEach(category => {
        const stats = catStats[category]
        if (!stats) return
        const internalMapping = BOXSCORE_TO_INTERNAL_MAP[category] || {}
        const maxFields = (BOX_SCORE_STATS[category].max || []).map(f => internalMapping[f] || f)
        if (maxFields.length === 0) return
        if (!maxByPlayer[normalizedName][category]) maxByPlayer[normalizedName][category] = {}
        maxFields.forEach(field => {
          const v = stats[field] || 0
          const cur = maxByPlayer[normalizedName][category][field] || 0
          if (v > cur) maxByPlayer[normalizedName][category][field] = v
        })
      })
    })
  })

  // Pre-compute the (category, field) pairs we have to recompute, so we
  // don't redo this work per-player.
  const categoriesWithMax = []
  Object.keys(BOX_SCORE_STATS).forEach(category => {
    const internalMapping = BOXSCORE_TO_INTERNAL_MAP[category] || {}
    const maxFields = (BOX_SCORE_STATS[category].max || []).map(f => internalMapping[f] || f)
    if (maxFields.length > 0) categoriesWithMax.push({ category, maxFields })
  })

  return players.map(player => {
    const existingStatsByYear = player.statsByYear || {}
    const existingYearStats = existingStatsByYear[yearNum]
    if (!existingYearStats) return player // Player has no stats this year — nothing to do.

    const normalized = normalizePlayerName(player.name)
    const playerMax = maxByPlayer[normalized] || {}

    let modified = false
    const updatedYearStats = { ...existingYearStats }

    categoriesWithMax.forEach(({ category, maxFields }) => {
      // Only touch categories the player already has stats in. If they
      // never had Passing stats this year, we don't materialize a
      // Passing entry just to write zeros into it.
      const existingCat = updatedYearStats[category]
      if (!existingCat) return

      const computed = playerMax[category] || {}
      let categoryModified = false
      const nextCat = { ...existingCat }

      maxFields.forEach(field => {
        // Source of truth: highest value found across this year's games,
        // or 0 if the player isn't in any game's contribution for this
        // category. This is what makes the function exhaustive — we
        // overwrite stale values, including with 0.
        const newMax = computed[field] || 0
        if (nextCat[field] !== newMax) {
          nextCat[field] = newMax
          categoryModified = true
        }
      })

      if (categoryModified) {
        updatedYearStats[category] = nextCat
        modified = true
      }
    })

    if (!modified) return player
    return {
      ...player,
      statsByYear: { ...existingStatsByYear, [yearNum]: updatedYearStats },
    }
  })
}

/**
 * Process box score save - extracts contribution, applies delta, returns updated players and contribution.
 * When editing an existing box score (oldContribution non-null), also recomputes max/long fields
 * from all games — the delta path can only ever increase max fields, so an edit that lowers a long
 * rush/reception/etc. would otherwise leave season totals inflated.
 */
export function processBoxScoreSave(players, newBoxScore, oldContribution, year, allGames = null) {
  const newContribution = extractBoxScoreContribution(newBoxScore)
  let updatedPlayers = applyBoxScoreDelta(players, newContribution, oldContribution, year)

  // Max-field correction only needed when editing (oldContribution present).
  // For fresh adds, Math.max against the new game is already correct.
  if (oldContribution && allGames) {
    updatedPlayers = recomputeMaxFieldsFromGames(updatedPlayers, allGames, year)
  }

  return {
    updatedPlayers,
    statsContributed: newContribution
  }
}


/**
 * Recalculate ALL player stats from ALL box scores for a given year
 * This is more robust than delta tracking - just sum everything fresh
 * @param {Array} players - Current players array
 * @param {Array} games - All games array
 * @param {number} year - The year to recalculate
 * @param {Object} options - Optional settings
 * @param {boolean} options.skipGamesPlayed - If true, preserve existing gamesPlayed values
 * @returns {Array} Updated players array with recalculated stats
 */
export function recalculateStatsFromBoxScores(players, games, year, options = {}) {
  const { skipGamesPlayed = false } = options
  const yearNum = Number(year)

  // Get all games for this year that have box scores
  // NOTE: Don't filter by team - we want stats from ALL games where players appeared
  // This matches getPlayerBoxScoreTotals() behavior
  const gamesWithBoxScores = (games || []).filter(g =>
    Number(g.year) === yearNum && g.boxScore
  )

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

    // Start from existing year stats so non-box-score categories (manual entry,
    // sheet import) survive. Box-score categories from playerAggregated will
    // overlay the existing same-named categories as the recomputed truth.
    const newYearStats = {
      ...existingYearStats,
      gamesPlayed: skipGamesPlayed
        ? (existingYearStats.gamesPlayed ?? 0)
        : (boxScoreGamesPlayed !== undefined
          ? boxScoreGamesPlayed
          : (existingYearStats.gamesPlayed ?? 0)),
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
// (Removed: getCustomTeams, hasCustomTeams, getCustomTeam, resolveTeamAbbr.
//  The codebase now reads team data exclusively from dynasty.teams[tid].
//  TeamBuilder slots are just slots in that map — no separate "custom"
//  concept needed at the data layer. The legacy `dynasty.customTeams`
//  field is migrated away on load.)
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

  // Try old team-centric structure (schedulesByTeamYear) — drift-aware so
  // a teambuilder team renamed mid-dynasty still finds its old data.
  const teamAbbr = getAbbrFromTid(dynasty.teams, tid) || dynasty.teamName
  const teamYearSchedule = lookupByTeamYear(dynasty.schedulesByTeamYear, dynasty, tid, year)
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
  const tid = typeof tidOrAbbr === 'number' ? tidOrAbbr : getTidFromAbbr(tidOrAbbr, dynasty)
  const teamAbbr = typeof tidOrAbbr === 'string' ? tidOrAbbr : getAbbrFromTid(dynasty.teams, tidOrAbbr)

  // Try NEW tid-based byYear structure first
  if (tid && dynasty.teams?.[tid]?.byYear?.[year]?.schedule) {
    return dynasty.teams[tid].byYear[year].schedule
  }

  // Try old team-centric structure (drift-aware)
  const teamYearSchedule = lookupByTeamYear(dynasty.schedulesByTeamYear, dynasty, tid ?? tidOrAbbr, year)
  if (teamYearSchedule) return teamYearSchedule

  return []
}

/**
 * Heuristic: has this game record been "played" — i.e., does it carry
 * score, result, or boxScore data we should be careful about destroying?
 */
function isGamePlayed(g) {
  if (!g) return false
  if (g.isPlayed === true) return true
  const r = g.result
  if (r === 'win' || r === 'loss' || r === 'W' || r === 'L' || r === 'tie') return true
  if (g.boxScore && typeof g.boxScore === 'object' && Object.keys(g.boxScore).length > 0) return true
  // Non-zero score also implies played even if isPlayed flag missing.
  if ((Number(g.team1Score) || 0) !== 0 || (Number(g.team2Score) || 0) !== 0) return true
  return false
}

/**
 * Compute the diff between a new schedule and the existing game records.
 * The output drives both the confirm modal (so the user sees exactly what
 * will change) and the apply step (so the games array stays in sync).
 *
 * Scope discipline: only touches gameType==='regular' games for the given
 * team and year. CFP, bowls, conference championships, and other teams'
 * games are immune.
 *
 * @returns {{
 *   toAdd: Array,        // entries with no matching game record yet
 *   toUpdate: Array,     // entries whose game record needs an opponent or site change
 *   toRemove: Array,     // existing games whose week is no longer in the schedule (or now BYE)
 *   toKeep: Array,       // entries already in sync
 *   playedAffected: Array, // subset of toUpdate + toRemove with played-game data
 *   updatedSchedule: Array // the schedule with gameId/opponentTid/isBye filled in
 * }}
 */
export function computeScheduleDiff(dynasty, newSchedule, userTid, year) {
  const existingGames = dynasty.games || []

  // Existing user-team regular-season games for this year, keyed by week.
  // Legacy game records sometimes omit gameType — treat missing as 'regular'
  // so older dynasties don't get bypassed by the diff and accumulate ghosts.
  const existingByWeek = new Map()
  existingGames.forEach(g => {
    const gType = g.gameType || 'regular'
    if (gType !== 'regular') return
    if (Number(g.year) !== Number(year)) return
    const matchesUser = g.team1Tid === userTid || g.team2Tid === userTid || g.userTid === userTid
    if (!matchesUser) return
    existingByWeek.set(Number(g.week), g)
  })

  const opponentTidOf = (g) => (g.team1Tid === userTid ? g.team2Tid : g.team1Tid)
  const locationOf = (g) => {
    const oppTid = opponentTidOf(g)
    if (g.homeTeamTid === userTid) return 'home'
    if (g.homeTeamTid === oppTid) return 'away'
    return 'neutral'
  }
  const teamsLookup = dynasty?.teams || TEAMS
  const abbrFor = (tid) => (tid && getAbbrFromTid(teamsLookup, tid)) || (tid ? `tid-${tid}` : '')

  const toAdd = []
  const toUpdate = []
  const toKeep = []
  const updatedSchedule = []
  const referencedWeeks = new Set()

  // Stable id base for any new games created in this batch
  const idBase = Date.now()

  newSchedule.forEach((entry, index) => {
    const week = Number(entry.week)
    referencedWeeks.add(week)

    const isBye = entry.opponent?.toUpperCase() === 'BYE' || entry.isBye

    if (isBye) {
      // BYE rows never have a game record; if one existed it'll be removed below.
      updatedSchedule.push({ ...entry, week, isBye: true, gameId: null, opponentTid: null })
      return
    }

    const opponentTid = entry.opponentTid || getTidFromAbbr(entry.opponent, dynasty)
    const isHome = entry.location === 'home'
    const isAway = entry.location === 'away'
    const expectedHomeTid = isHome ? userTid : (isAway ? opponentTid : null)

    const existing = existingByWeek.get(week)

    if (!existing) {
      const newGameId = `game-${idBase}-${index}-${Math.random().toString(36).substr(2, 5)}`
      const newGame = {
        id: newGameId,
        week,
        year: Number(year),
        gameType: 'regular',
        team1Tid: userTid,
        team2Tid: opponentTid,
        team1Score: 0,
        team2Score: 0,
        homeTeamTid: expectedHomeTid,
        isPlayed: false,
        userTid,
        opponentTid,
      }
      toAdd.push({
        week,
        opponent: entry.opponent,
        opponentAbbr: entry.opponent,
        location: entry.location || 'home',
        gameRecord: newGame,
      })
      updatedSchedule.push({ ...entry, week, gameId: newGameId, opponentTid, isBye: false })
      return
    }

    // Has an existing game — compare to detect change
    const existingOpponentTid = opponentTidOf(existing)
    const existingLocation = locationOf(existing)
    const opponentMatches = existingOpponentTid === opponentTid
    const homeTidMatches = (existing.homeTeamTid ?? null) === expectedHomeTid

    if (opponentMatches && homeTidMatches) {
      toKeep.push({ week, opponent: entry.opponent })
      updatedSchedule.push({ ...entry, week, gameId: existing.id, opponentTid, isBye: false })
      return
    }

    // Build the patch we'll apply on save. userTid stays on whichever side
    // it currently sits; we only swap the opponent slot and home flag.
    const userIsTeam1 = existing.team1Tid === userTid
    const patch = {
      homeTeamTid: expectedHomeTid,
      opponentTid,
      ...(userIsTeam1 ? { team2Tid: opponentTid } : { team1Tid: opponentTid }),
    }

    toUpdate.push({
      week,
      gameId: existing.id,
      oldOpponent: abbrFor(existingOpponentTid),
      oldOpponentTid: existingOpponentTid,
      newOpponent: entry.opponent,
      newOpponentTid: opponentTid,
      oldLocation: existingLocation,
      newLocation: entry.location || 'home',
      isPlayed: isGamePlayed(existing),
      hasBoxScore: !!(existing.boxScore && Object.keys(existing.boxScore).length > 0),
      patch,
    })
    updatedSchedule.push({ ...entry, week, gameId: existing.id, opponentTid, isBye: false })
  })

  // toRemove: existing games whose week isn't in the new schedule, or is now BYE
  const toRemove = []
  existingByWeek.forEach((g, week) => {
    const newEntry = newSchedule.find(e => Number(e.week) === week)
    const isBye = newEntry && (newEntry.opponent?.toUpperCase() === 'BYE' || newEntry.isBye)
    const stillReferenced = referencedWeeks.has(week) && !isBye
    if (stillReferenced) return

    const oppTid = opponentTidOf(g)
    toRemove.push({
      week,
      gameId: g.id,
      opponent: abbrFor(oppTid),
      opponentTid: oppTid,
      isPlayed: isGamePlayed(g),
      hasBoxScore: !!(g.boxScore && Object.keys(g.boxScore).length > 0),
    })
  })

  const playedAffected = [...toUpdate, ...toRemove].filter(x => x.isPlayed || x.hasBoxScore)

  return { toAdd, toUpdate, toRemove, toKeep, playedAffected, updatedSchedule }
}

/**
 * Apply a schedule diff to the dynasty's games array, returning the next
 * games array. Pure function — no DB writes here.
 */
export function applyScheduleDiff(games, diff) {
  const removeIds = new Set(diff.toRemove.map(r => r.gameId))
  const updateById = new Map(diff.toUpdate.map(u => [u.gameId, u]))

  // 1. Strip removed games
  const surviving = (games || []).filter(g => !removeIds.has(g.id))

  // 2. Apply patches in place
  const patched = surviving.map(g => {
    const update = updateById.get(g.id)
    return update ? { ...g, ...update.patch } : g
  })

  // 3. Append new games
  const newRecords = diff.toAdd.map(a => a.gameRecord)
  return [...patched, ...newRecords]
}

/**
 * Legacy wrapper kept for any external callers — internally now uses the
 * diff. Only returns the (additive) shape it always did, so existing
 * call sites don't break, but it does NOT remove or patch anything. New
 * code should use computeScheduleDiff + applyScheduleDiff directly.
 */
export function createGamesFromSchedule(dynasty, schedule, userTid, year) {
  const diff = computeScheduleDiff(dynasty, schedule, userTid, year)
  return {
    newGames: diff.toAdd.map(a => a.gameRecord),
    updatedSchedule: diff.updatedSchedule,
  }
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
 * Pass `dynasty` so a teambuilder team's renamed abbr resolves to its tid —
 * without it, both lookupAbbr (TEAMS[tid].abbr) and getTidFromAbbr(stored)
 * fall back to the static FBS map and silently miss TB-renamed slots when
 * the legacy abbr branch runs.
 *
 * @param {Object} player - The player object
 * @param {number|string} tidOrAbbr - Team ID (tid) or abbreviation (for backward compatibility)
 * @param {number|string} year - The year to check
 * @param {Object} [dynasty] - Dynasty for teambuilder-aware resolution
 * @returns {boolean} True if player is on the team's roster
 */
export function isPlayerOnRoster(player, tidOrAbbr, year, dynasty = null) {
  // Honor-only players are never on active roster
  if (player.isHonorOnly) return false

  // teamsByYear is the SINGLE source of truth for roster membership
  const yearNum = Number(year)
  const yearStr = String(year)
  const teamForYear = player.teamsByYear?.[yearNum] ?? player.teamsByYear?.[yearStr]

  if (teamForYear === undefined || teamForYear === null) {
    return false
  }

  // Normalize the lookup value to both tid and abbr for comparison.
  // dynasty.teams is checked first so a teambuilder-renamed slot exposes its
  // current abbr (not the original FBS abbr from static TEAMS).
  let lookupTid = null
  let lookupAbbr = null

  if (typeof tidOrAbbr === 'number') {
    lookupTid = tidOrAbbr
    const teamData = dynasty?.teams?.[tidOrAbbr] || TEAMS[tidOrAbbr]
    lookupAbbr = teamData?.abbr
  } else if (typeof tidOrAbbr === 'string' && /^\d+$/.test(tidOrAbbr)) {
    lookupTid = parseInt(tidOrAbbr, 10)
    const teamData = dynasty?.teams?.[lookupTid] || TEAMS[lookupTid]
    lookupAbbr = teamData?.abbr
  } else if (typeof tidOrAbbr === 'string') {
    lookupAbbr = tidOrAbbr
    lookupTid = getTidFromAbbr(tidOrAbbr, dynasty)
  }

  // Compare against the stored value (which could be tid or abbr)
  if (typeof teamForYear === 'number') {
    return teamForYear === lookupTid
  } else if (typeof teamForYear === 'string') {
    if (teamForYear === lookupAbbr) {
      return true
    }
    const storedTid = getTidFromAbbr(teamForYear, dynasty)
    if (storedTid && storedTid === lookupTid) {
      return true
    }
  }

  return false
}

/**
 * Get a player's class for a given year.
 *
 * `classByYear[year]` is the source of truth, but it's frequently
 * sparse — honor-only players, transferred-out players, CPU rosters
 * and other off-team records often have only a single anchor year
 * filled in. Past-year display sites used to fall back to the
 * stale `player.year` (legacy "current class") field, which silently
 * showed a senior in 2034 as a senior in his 2031 freshman card too.
 *
 * To handle the gaps, we walk the standard FBS class progression
 * from the nearest known anchor year. Forward beyond Sr / RS Sr
 * returns null (graduated). Backward before Fr returns null
 * (before they were on a roster). Ties on distance prefer the
 * earlier anchor (we have more confidence about what came before
 * an anchor than what came after, since the user is more likely to
 * have entered the player's debut year than a later one).
 *
 * @param {Object} player - Player object
 * @param {number} year - The year to get class for
 * @returns {string|null} Class string or null
 */
export function getPlayerClassForYear(player, year) {
  if (!player || year == null) return null
  const yearNum = Number(year)
  if (!Number.isFinite(yearNum)) return null
  const yearStr = String(yearNum)

  // Direct hit on classByYear — preferred when present.
  if (player.classByYear) {
    if (player.classByYear[yearNum] != null) return player.classByYear[yearNum]
    if (player.classByYear[yearStr] != null) return player.classByYear[yearStr]
  }

  // No anchors at all — best we can do is the legacy field.
  const knownYears = Object.keys(player.classByYear || {})
    .map(k => Number(k))
    .filter(n => Number.isFinite(n))
    .sort((a, b) => a - b)
  if (knownYears.length === 0) {
    return player.year ?? null
  }

  // Pick the nearest anchor year. Ties go to the EARLIER year so
  // forward derivation (which has well-defined progression rules)
  // wins over backward derivation (which has to guess at redshirt
  // history).
  let anchorYear = knownYears[0]
  let minDist = Math.abs(yearNum - anchorYear)
  for (const ky of knownYears) {
    const d = Math.abs(yearNum - ky)
    if (d < minDist || (d === minDist && ky < anchorYear)) {
      minDist = d
      anchorYear = ky
    }
  }
  const anchorClass = player.classByYear[anchorYear] ?? player.classByYear[String(anchorYear)]
  if (!anchorClass) return player.year ?? null
  if (yearNum === anchorYear) return anchorClass

  if (yearNum > anchorYear) {
    // Forward — apply CLASS_PROGRESSION (yearNum - anchorYear) times.
    // Sr / RS Sr graduates if asked to advance.
    let cls = anchorClass
    const steps = yearNum - anchorYear
    for (let i = 0; i < steps; i++) {
      if (cls === 'Sr' || cls === 'RS Sr') return null // graduated
      cls = CLASS_PROGRESSION[cls] || cls
    }
    return cls
  }

  // Backward — reverse the progression. We can only go back through
  // the standard mapping; transferring back through redshirt years
  // can't be reconstructed cleanly, so we return null if we'd have
  // to underflow the anchor.
  const REVERSE_CLASS_BACKWARD = {
    'So': 'Fr',
    'Jr': 'So',
    'Sr': 'Jr',
    'RS Sr': 'Sr',
    'RS Fr': 'Fr',
    'RS So': 'So',
    'RS Jr': 'Jr',
  }
  let cls = anchorClass
  const stepsBack = anchorYear - yearNum
  for (let i = 0; i < stepsBack; i++) {
    const prev = REVERSE_CLASS_BACKWARD[cls]
    if (!prev) return null // can't go further back (already Fr / unknown class)
    cls = prev
  }
  return cls
}

/**
 * Get a player's overall rating for a specific season.
 * Falls back to player.overall when no per-year record exists (legacy players).
 */
export function getPlayerOverallForYear(player, year) {
  if (!player) return null
  const yearNum = Number(year)
  const yearStr = String(year)
  const byYear = player.overallByYear
  const fromByYear = byYear?.[yearNum] ?? byYear?.[yearStr]
  if (fromByYear != null && fromByYear !== '') return fromByYear
  return player.overall ?? null
}

/**
 * Get a player's position for a specific season.
 * Falls back to player.position when no per-year record exists — intentional,
 * so pre-positionByYear historical rosters don't display blanks. From the
 * point positionByYear starts being written, new entries land under their
 * own year and historical views get accurate tags.
 */
export function getPlayerPositionForYear(player, year) {
  if (!player) return null
  const yearNum = Number(year)
  const yearStr = String(year)
  const byYear = player.positionByYear
  const fromByYear = byYear?.[yearNum] ?? byYear?.[yearStr]
  if (fromByYear) return fromByYear
  return player.position ?? null
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

  // Try old team-centric structure (drift-aware via tid)
  const teamYearSetup = lookupByTeamYear(dynasty.preseasonSetupByTeamYear, dynasty, tid, year)
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

  // Try old team-centric structure (drift-aware via tid)
  const teamYearRatings = lookupByTeamYear(dynasty.teamRatingsByTeamYear, dynasty, tid, year)
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
  const tid = typeof tidOrAbbr === 'number' ? tidOrAbbr : getTidFromAbbr(tidOrAbbr, dynasty)
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

  // PRIORITY 3: Try legacy teamRatingsByTeamYear (drift-aware via tid)
  const legacyRatings = lookupByTeamYear(dynasty.teamRatingsByTeamYear, dynasty, tid ?? tidOrAbbr, yearNum)
  if (legacyRatings) {
    return legacyRatings
  }

  return defaultRatings
}

/**
 * Get coaching staff for current team and year. Pass `uid` so a member
 * who has set their OWN staff overrides via the Members page is shown
 * their own names (not whatever the legacy single-staff field has from
 * the owner's preseason flow). Multi-coach dynasties depend on this so
 * each user's stint shows their own coordinators.
 *
 * Resolution priority:
 *   1. memberCoachingStaff[uid] (per-uid override; only the rows the
 *      user actually filled — empty fields fall through)
 *   2. teams[tid].byYear[year].coachingStaff (current team-year stamp)
 *   3. coachingStaffByTeamYear[abbr/tid][year] (legacy team-year store)
 *   4. previous year's team-year (staff carries over)
 *   5. dynasty.coachingStaff (legacy single-staff field, owner's flow)
 *
 * Note: Coaching staff carries over from year to year (unlike schedule/ratings).
 */
export function getCurrentCoachingStaff(dynasty, uid = null) {
  const defaultStaff = { hcName: null, ocName: null, dcName: null }

  if (!dynasty) return defaultStaff

  // (1) Per-uid override. Only fields the user actually filled win;
  //     blank slots fall through to the team-year stamps below.
  let baseFromOverride = null
  if (uid && dynasty.memberCoachingStaff?.[uid]) {
    baseFromOverride = dynasty.memberCoachingStaff[uid]
  }

  // CRITICAL: Get tid directly - tid is the ONLY source of truth
  const tid = getCurrentTeamTid(dynasty)
  const year = dynasty.currentYear

  // Helper: layer the per-uid override (if any) over a team-year base,
  // letting the override win field-by-field while blank override slots
  // fall through to the team-year staff. Without this, an override
  // that only sets HC would wipe the OC/DC the dynasty had stored.
  const merge = (base) => {
    if (!base && !baseFromOverride) return null
    return {
      ...defaultStaff,
      ...(base || {}),
      ...(baseFromOverride
        ? Object.fromEntries(
            Object.entries(baseFromOverride).filter(([, v]) => v != null)
          )
        : {}),
    }
  }

  // Try NEW tid-based byYear structure first (Phase 7 migration)
  if (tid && dynasty.teams?.[tid]?.byYear?.[year]?.coachingStaff) {
    return merge(dynasty.teams[tid].byYear[year].coachingStaff)
  }

  // Try old team-centric structure (drift-aware via tid)
  const teamYearStaff = lookupByTeamYear(dynasty.coachingStaffByTeamYear, dynasty, tid, year)
  if (teamYearStaff) {
    return merge(teamYearStaff)
  }

  // For coaching staff, try previous year's data (staff carries over)
  // Check new structure first for previous year
  if (tid && dynasty.teams?.[tid]?.byYear?.[year - 1]?.coachingStaff) {
    return merge(dynasty.teams[tid].byYear[year - 1].coachingStaff)
  }
  const previousYearStaff = lookupByTeamYear(dynasty.coachingStaffByTeamYear, dynasty, tid, year - 1)
  if (previousYearStaff) {
    return merge(previousYearStaff)
  }

  // Only fall back to legacy coachingStaff for the dynasty's first year
  if (year === dynasty.startYear) {
    return merge(dynasty.coachingStaff) || dynasty.coachingStaff || defaultStaff
  }

  // No team-year base, but the per-uid override might still have content.
  return merge(null) || defaultStaff
}

/**
 * Get Google Sheet info for current team
 */
export function getCurrentGoogleSheet(dynasty) {
  if (!dynasty) return { googleSheetId: null, googleSheetUrl: null }

  // CRITICAL: Get tid directly - tid is the ONLY source of truth
  const tid = getCurrentTeamTid(dynasty)
  const teamAbbr = getAbbrFromTid(dynasty.teams, tid) || dynasty.teamName

  // Try new team-centric structure first. Drift-aware: check the
  // resolved abbr AND scan all keys for any abbr that resolves to this
  // tid (handles teambuilder rename).
  const sheetsByTeam = dynasty.googleSheetsByTeam || {}
  let teamSheet = sheetsByTeam[teamAbbr] || (tid != null ? sheetsByTeam[tid] : null)
  if (!teamSheet && tid != null) {
    for (const key of Object.keys(sheetsByTeam)) {
      if (key === teamAbbr || key === String(tid)) continue
      const keyTid = getTidFromAbbr(key, dynasty)
      if (keyTid != null && Number(keyTid) === Number(tid)) {
        teamSheet = sheetsByTeam[key]
        if (teamSheet) break
      }
    }
  }
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

  // Try old team-centric structure (drift-aware via tid)
  const teamAbbr = getAbbrFromTid(dynasty.teams, tid) || dynasty.teamName
  const teamYearRecruits = lookupByTeamYear(dynasty.recruitsByTeamYear, dynasty, tid, year)
  if (teamYearRecruits) {
    return teamYearRecruits
  }

  // Fall back to legacy recruits (filter by team if they have team field).
  // Tid match first; abbr fallback only if r.team is a string. Survives
  // teambuilder renames since tid is stable across abbr changes.
  const legacyRecruits = dynasty.recruits || []
  return legacyRecruits.filter(r => {
    if (!r.team) return true
    if (tid != null && (Number(r.team) === Number(tid) || Number(r.tid) === Number(tid))) return true
    return r.team === teamAbbr
  })
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

  // Get active players for current team (not left, not recruits, not honor-only)
  // CRITICAL: Use isPlayerOnRoster which ONLY checks teamsByYear - no fallback to p.team
  // This ensures consistency with the roster display (same players appear in both)
  const activePlayers = players.filter(p => {
    if (p.isHonorOnly) return false
    if (p.isRecruit) return false
    // Also exclude players recruited this year (even if isRecruit flag is missing)
    if (Number(p.recruitYear) === Number(year)) return false
    // Exclude players who have departed THIS year. Reads BOTH legacy
    // movements[] AND v2 movementByYear — after the v2 migration the
    // legacy array is stripped, so checking only it left departed
    // players in the class-confirmation prompt.
    const v2DepartureTypesYr = new Set(['departure', 'entered_portal', 'transferred_out', 'graduated', 'declared_for_draft', 'transfer'])
    const v2DepartureShapesYr = new Set(['transfer_out', 'graduated', 'pro_draft'])
    const hasDepartedThisYearLegacy = (p.movements || []).some(m =>
      (m.type === 'departure' || m.type === 'entered_portal') && Number(m.year) === Number(year)
    )
    const v2EntryThisYear = p.movementByYear?.[year] || p.movementByYear?.[String(year)]
    const hasDepartedThisYearV2 = !!v2EntryThisYear && (
      v2DepartureTypesYr.has(v2EntryThisYear.type) ||
      v2DepartureShapesYr.has(v2EntryThisYear.departure)
    )
    if (hasDepartedThisYearLegacy || hasDepartedThisYearV2) return false
    // Check team membership using isPlayerOnRoster (only checks teamsByYear, no p.team fallback)
    if (!isPlayerOnRoster(p, teamTid, year)) return false
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
    tid = coachTeam?.tid || (teamAbbr ? getTidFromAbbr(teamAbbr, dynasty) : null)
  }

  if (!teamAbbr && !tid) {
    // CRITICAL: Fallback to current team using tid directly
    tid = getCurrentTeamTid(dynasty)
    teamAbbr = getAbbrFromTid(dynasty.teams, tid) || dynasty.teamName
  } else if (!tid && teamAbbr) {
    // Have abbr but not tid - resolve it
    tid = getTidFromAbbr(teamAbbr, dynasty)
  }

  // Try NEW tid-based byYear structure first (Phase 7 migration)
  let staff = tid && dynasty.teams?.[tid]?.byYear?.[year]?.lockedCoachingStaff

  // Fall back to locked coaching staff (drift-aware)
  if (!staff) {
    staff = lookupByTeamYear(dynasty.lockedCoachingStaffByYear, dynasty, tid ?? teamAbbr, year)
  }

  // Fall back to team-centric coaching staff from new structure
  if (!staff && tid) {
    staff = dynasty.teams?.[tid]?.byYear?.[year]?.coachingStaff
  }

  // Fall back to team-centric coaching staff (old format) — drift-aware
  if (!staff) {
    staff = lookupByTeamYear(dynasty.coachingStaffByTeamYear, dynasty, tid ?? teamAbbr, year)
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

  // Check if the user was coaching this team in this year and add their name.
  // coachTeamByYear.team is documented as "ALWAYS use tid" (see
  // getCoachTeamForYear) — compare by tid first, fall back to abbr only for
  // pre-migration legacy records that may still hold an abbr string.
  const coachTeamForYear = getCoachTeamForYear(dynasty, year)
  const coachTid = coachTeamForYear?.team
  const matchesTeam = coachTeamForYear && (
    (tid != null && coachTid != null && Number(coachTid) === Number(tid)) ||
    coachTid === teamAbbr
  )
  // Owner-centric: coachTeamByYear is the legacy owner-only stamp, so
  // the name we inject is the owner's. getCoachNameForUid pulls
  // memberLabels[ownerUid] first and falls back to dynasty.coachName
  // for pre-migration dynasties — single source of truth.
  const ownerName = matchesTeam ? getCoachNameForUid(dynasty, dynasty.userId, '') : ''
  if (matchesTeam && ownerName) {
    staff = { ...staff }
    if (coachTeamForYear.position === 'HC') {
      staff.hcName = ownerName
    } else if (coachTeamForYear.position === 'OC') {
      staff.ocName = ownerName
    } else if (coachTeamForYear.position === 'DC') {
      staff.dcName = ownerName
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

  // Resolve the base conference map (the bulk realignment snapshot).
  // Year-specific entry → walk-back to the most recent year that had
  // a snapshot → legacy `customConferences` (single-snapshot) →
  // null (caller falls back to the static catalog).
  let baseMap = null
  const byYear = dynasty.customConferencesByYear?.[yearNum] || dynasty.customConferencesByYear?.[String(yearNum)]
  if (byYear && typeof byYear === 'object' && Object.keys(byYear).length > 0) {
    baseMap = byYear
  } else if (dynasty.customConferencesByYear && typeof dynasty.customConferencesByYear === 'object') {
    const startYear = Number(dynasty.startYear) || 2024
    const minYear = Math.max(startYear, yearNum - 10)
    for (let y = yearNum - 1; y >= minYear; y--) {
      const prevYearConf = dynasty.customConferencesByYear[y] || dynasty.customConferencesByYear[String(y)]
      if (prevYearConf && typeof prevYearConf === 'object' && Object.keys(prevYearConf).length > 0) {
        baseMap = prevYearConf
        break
      }
    }
  }
  if (!baseMap && dynasty.customConferences && typeof dynasty.customConferences === 'object' && Object.keys(dynasty.customConferences).length > 0) {
    baseMap = dynasty.customConferences
  }

  // Collect single-team conference overrides written by the team-info
  // edit modal (via saveTeamYearInfo). These live alongside the bulk
  // snapshot and must override it — without this overlay, changing
  // one team's conference (e.g. Notre Dame → Big Ten) saves to the
  // override stores but no consumer ever reads them, so the team
  // page and conference standings still show the old conference.
  const overrides = new Map() // abbr (UPPERCASE) -> conferenceName
  // New path: dynasty.teams[tid].byYear[year].conference
  for (const [, team] of Object.entries(dynasty.teams || {})) {
    const yearData = team?.byYear?.[yearNum] || team?.byYear?.[String(yearNum)]
    const conf = yearData?.conference
    const abbr = team?.abbr
    if (conf && abbr) overrides.set(abbr.toUpperCase(), conf)
  }
  // Legacy path: dynasty.conferenceByTeamYear[abbr][year]
  const legacyOverrides = dynasty.conferenceByTeamYear || {}
  for (const [abbr, byYearMap] of Object.entries(legacyOverrides)) {
    if (!abbr || !byYearMap || typeof byYearMap !== 'object') continue
    const conf = byYearMap[yearNum] ?? byYearMap[String(yearNum)]
    if (conf) overrides.set(abbr.toUpperCase(), conf)
  }

  // No bulk map AND no per-team overrides → preserve legacy "use
  // defaults" contract by returning null.
  if (!baseMap && overrides.size === 0) return null

  // Deep clone whichever base we picked (or the static default when
  // there's no custom snapshot) so the overlay below doesn't mutate
  // stored data.
  const sourceMap = baseMap || DEFAULT_CONFERENCE_TEAMS
  const result = {}
  for (const [conf, teams] of Object.entries(sourceMap)) {
    result[conf] = Array.isArray(teams) ? [...teams] : []
  }

  if (overrides.size > 0) {
    for (const [abbr, newConf] of overrides) {
      // Remove from any conference it currently appears in.
      for (const teamList of Object.values(result)) {
        const idx = teamList.findIndex(t => (t || '').toUpperCase() === abbr)
        if (idx !== -1) teamList.splice(idx, 1)
      }
      // Add to its new conference (create the bucket if needed —
      // covers the user-invented-conference-name case).
      if (!Array.isArray(result[newConf])) result[newConf] = []
      if (!result[newConf].some(t => (t || '').toUpperCase() === abbr)) {
        // Preserve the team's original abbr casing if we can find it.
        const original = (() => {
          for (const teams of Object.values(sourceMap)) {
            if (!Array.isArray(teams)) continue
            const m = teams.find(t => (t || '').toUpperCase() === abbr)
            if (m) return m
          }
          return abbr
        })()
        result[newConf].push(original)
      }
    }
  }

  return result
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
      const fallbackTid = getTidFromAbbr(abbr, dynasty)
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
        const tid = getTidFromAbbr(record.team, dynasty)
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
          const tid = getTidFromAbbr(game.userTeam, dynasty)
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
          const tid = getTidFromAbbr(value, dynasty)
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
        const userTid = game.userTid || getTidFromAbbr(game.userTeam, dynasty)
        const oppTid = game.opponentTid || getTidFromAbbr(game.opponent, dynasty)
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
        newGame.team1Tid = game.team1Tid || getTidFromAbbr(game.team1, dynasty)
        newGame.team2Tid = game.team2Tid || getTidFromAbbr(game.team2, dynasty)

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
        const tid = getTidFromAbbr(game.userTeam, dynasty)
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
        currentTid = currentYearGame.userTid || getTidFromAbbr(currentYearGame.userTeam, dynasty)
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
        const tid = entry.tid || getTidFromAbbr(entry.team, dynasty)
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

/**
 * Migration: Sync FCS team set to CFB26's actual five teams.
 *
 * Older dynasties were created when the registry held only four FCS teams
 * (FCSE / FCSM / FCSN / FCSW) with made-up nicknames (Judicials / Rebels /
 * Stallions / Titans). CFB26 actually ships five generic directional
 * schools — FCS East, FCS Southeast, FCS Midwest, FCS Northwest, FCS West
 * — with no nicknames, and uses 5-letter codes for the compound
 * directions (FCSE, FCSSE, FCSMW, FCSNW, FCSW). This migration:
 *
 *   • Renames tid 138's abbr from "FCSM" to "FCSMW" if still 4-letter.
 *   • Renames tid 139's abbr from "FCSN" to "FCSNW" if still 4-letter.
 *   • Strips made-up nicknames from existing FCS team names.
 *   • Adds tid 141 (FCSSE / FCS Southeast) if missing.
 *
 * Only `abbr` and `name` on FCS slots are normalized; user customizations
 * to colors/logos are preserved. tid remains the stable identifier.
 */
export function migrateFCSFiveTeams(dynasty) {
  if (!dynasty) return dynasty

  // The main one-shot migration is gated by _fcs5TeamsMigrated, but the
  // FCSSE logo backfill runs unconditionally below (cheap, idempotent —
  // only acts when the logo field is empty). This handles dynasties that
  // already ran the gated migration before the logo was known.
  const FCSSE_LOGO = 'https://i.imgur.com/8qfTMIy.png'
  if (dynasty._fcs5TeamsMigrated) {
    const slot = dynasty.teams?.[141]
    if (slot && !slot.logo) {
      return {
        ...dynasty,
        teams: {
          ...dynasty.teams,
          141: { ...slot, logo: FCSSE_LOGO },
        },
      }
    }
    return dynasty
  }

  const teams = { ...(dynasty.teams || {}) }

  // Canonical names for the four pre-existing FCS slots. The migration
  // overwrites the team's `name` with these only if the current name
  // matches one of the legacy made-up forms (so user-renamed FCS teams
  // are left alone).
  const canonicalNames = {
    137: { name: 'FCS East',      legacy: ['FCS East Judicials'] },
    138: { name: 'FCS Midwest',   legacy: ['FCS Midwest Rebels'] },
    139: { name: 'FCS Northwest', legacy: ['FCS Northwest Stallions'] },
    140: { name: 'FCS West',      legacy: ['FCS West Titans'] },
  }

  // Rename old 4-letter abbrs to CFB26's 5-letter codes (only when the
  // dynasty still holds the legacy 4-letter form).
  if (teams[138] && teams[138].abbr === 'FCSM') {
    teams[138] = { ...teams[138], abbr: 'FCSMW' }
  }
  if (teams[139] && teams[139].abbr === 'FCSN') {
    teams[139] = { ...teams[139], abbr: 'FCSNW' }
  }

  // Strip made-up nicknames from any FCS slot still holding the legacy
  // form. User-customized names pass through untouched.
  for (const [tidStr, { name, legacy }] of Object.entries(canonicalNames)) {
    const tid = Number(tidStr)
    const slot = teams[tid]
    if (slot && legacy.includes(slot.name)) {
      teams[tid] = { ...slot, name }
    }
  }

  // Add FCSSE if missing, OR backfill its logo if a previous run of this
  // migration created the slot with an empty logo string.
  if (!teams[141]) {
    teams[141] = {
      tid: 141,
      abbr: 'FCSSE',
      name: 'FCS Southeast',
      primaryColor: '#4A7C59',
      secondaryColor: '#F0E68C',
      logo: FCSSE_LOGO,
      isFCS: true,
      byYear: {},
    }
  } else if (!teams[141].logo) {
    teams[141] = { ...teams[141], logo: FCSSE_LOGO }
  }

  return {
    ...dynasty,
    teams,
    _fcs5TeamsMigrated: true,
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
  let tid = typeof tidOrAbbr === 'number' ? tidOrAbbr : getTidFromAbbr(tidOrAbbr, dynasty)

  // Try NEW tid-based byYear structure first (Phase 7 migration)
  if (tid && dynasty.teams?.[tid]?.byYear?.[year]?.playersLeaving) {
    return dynasty.teams[tid].byYear[year].playersLeaving
  }

  // Get abbr for legacy lookup
  const abbr = typeof tidOrAbbr === 'string' ? tidOrAbbr : (dynasty.teams?.[tid]?.abbr || getOriginalTeamAbbr(tid))

  // Check team-centric structure (drift-aware via tid)
  const teamYear = lookupByTeamYear(dynasty.playersLeavingByTeamYear, dynasty, tid ?? tidOrAbbr, year)
  if (teamYear) return teamYear

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
  let tid = typeof tidOrAbbr === 'number' ? tidOrAbbr : getTidFromAbbr(tidOrAbbr, dynasty)

  // Try NEW tid-based byYear structure first (Phase 7 migration)
  if (tid && dynasty.teams?.[tid]?.byYear?.[year]?.conferenceChampionshipData) {
    return dynasty.teams[tid].byYear[year].conferenceChampionshipData
  }

  // Fall back to abbr-based structure (drift-aware via tid)
  const teamYear = lookupByTeamYear(dynasty.conferenceChampionshipDataByTeamYear, dynasty, tid ?? tidOrAbbr, year)
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
  const tid = getTidFromAbbr(teamAbbr, dynasty)
  if (tid && dynasty.teams?.[tid]?.byYear?.[year]?.bowlEligibilityData) {
    return dynasty.teams[tid].byYear[year].bowlEligibilityData
  }

  // Check team-centric structure (drift-aware via tid)
  const teamYear = lookupByTeamYear(dynasty.bowlEligibilityDataByTeamYear, dynasty, tid ?? teamAbbr, year)
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
  const tid = getTidFromAbbr(teamAbbr, dynasty)
  if (tid && dynasty.teams?.[tid]?.byYear?.[year]?.draftResults) {
    return dynasty.teams[tid].byYear[year].draftResults
  }

  // Check team-centric structure (drift-aware via tid)
  const teamYear = lookupByTeamYear(dynasty.draftResultsByTeamYear, dynasty, tid ?? teamAbbr, year)
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
  const tid = getTidFromAbbr(teamAbbr, dynasty)
  if (tid && dynasty.teams?.[tid]?.byYear?.[year]?.transferDestinations) {
    return dynasty.teams[tid].byYear[year].transferDestinations
  }

  // Check team-centric structure (drift-aware via tid)
  const teamYear = lookupByTeamYear(dynasty.transferDestinationsByTeamYear, dynasty, tid ?? teamAbbr, year)
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
  let tid = typeof tidOrAbbr === 'number' ? tidOrAbbr : getTidFromAbbr(tidOrAbbr, dynasty)

  // Try NEW tid-based byYear structure first (Phase 7 migration)
  if (tid && dynasty.teams?.[tid]?.byYear?.[year]?.trainingResults) {
    return dynasty.teams[tid].byYear[year].trainingResults
  }

  // Fall back to abbr-based structure (drift-aware via tid)
  const teamYear = lookupByTeamYear(dynasty.trainingResultsByTeamYear, dynasty, tid ?? tidOrAbbr, year)
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
  const tid = getTidFromAbbr(teamAbbr, dynasty)
  if (tid && dynasty.teams?.[tid]?.byYear?.[year]?.portalTransferClass) {
    return dynasty.teams[tid].byYear[year].portalTransferClass
  }

  // Check team-centric structure (drift-aware via tid)
  const teamYear = lookupByTeamYear(dynasty.portalTransferClassByTeamYear, dynasty, tid ?? teamAbbr, year)
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
  const tid = getTidFromAbbr(teamAbbr, dynasty)
  if (tid && dynasty.teams?.[tid]?.byYear?.[year]?.fringeCaseClass) {
    return dynasty.teams[tid].byYear[year].fringeCaseClass
  }

  // Check team-centric structure (drift-aware via tid)
  const teamYear = lookupByTeamYear(dynasty.fringeCaseClassByTeamYear, dynasty, tid ?? teamAbbr, year)
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
  let tid = typeof tidOrAbbr === 'number' ? tidOrAbbr : getTidFromAbbr(tidOrAbbr, dynasty)

  // Try NEW tid-based byYear structure first
  if (tid && dynasty.teams?.[tid]?.byYear?.[year]?.encourageTransfers) {
    return dynasty.teams[tid].byYear[year].encourageTransfers
  }

  // Fall back to abbr-based structure (drift-aware via tid)
  const teamYear = lookupByTeamYear(dynasty.encourageTransfersByTeamYear, dynasty, tid ?? tidOrAbbr, year)
  if (teamYear) return teamYear

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
  let tid = typeof tidOrAbbr === 'number' ? tidOrAbbr : getTidFromAbbr(tidOrAbbr, dynasty)

  // Try NEW tid-based byYear structure first
  if (tid && dynasty.teams?.[tid]?.byYear?.[year]?.recruitingCommitments) {
    return dynasty.teams[tid].byYear[year].recruitingCommitments
  }

  // Fall back to abbr-based structure (drift-aware via tid)
  const teamYear = lookupByTeamYear(dynasty.recruitingCommitmentsByTeamYear, dynasty, tid ?? tidOrAbbr, year)
  if (teamYear) return teamYear

  return {}
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
      originTeam = getTidFromAbbr(originTeam, dynasty) || teamTid
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
  const { toast } = useToast()
  const [dynasties, setDynasties] = useState([])
  const [currentDynasty, setCurrentDynasty] = useState(null)
  const [loading, setLoading] = useState(true)
  // True for signed-in users until the first Firestore snapshot lands.
  // Decoupled from `loading` (which drops as soon as the local read
  // resolves) so callers can distinguish "spinner is gone, UI is
  // interactive" from "cloud data has arrived, can decide a dynasty
  // truly doesn't exist." Used by selectDynasty's not-found check and
  // by DynastyDashboard's redirect-home effect.
  // Default to TRUE so that on a fresh page load, the
  // "redirect-home if dynasty not found" effect in DynastyDashboard
  // doesn't fire BEFORE the listener has had a chance to populate
  // dynasties[]. Without this, refreshing on /dynasty/:id would
  // briefly see cloudSyncing=false + dynasties=[] and bounce home
  // before the cloud subscription delivered the dynasty. Flipped to
  // false on either:
  //   - the signed-out branch (no cloud to wait on; runs immediately)
  //   - the first successful Firestore snapshot landing
  const [cloudSyncing, setCloudSyncing] = useState(true)
  const [migrated, setMigrated] = useState(false)
  // Ref to skip Firestore listener updates after manual local state update
  // This prevents the listener from overwriting fresh local changes with stale Firestore data
  // Uses a counter to skip multiple updates (optimistic + server confirm)
  const skipListenerUpdatesCountRef = useRef(0)
  // Flag to prevent listener updates during phase transitions (more robust than counter)
  // Set to true when starting a phase transition, cleared when complete
  const phaseTransitionInProgressRef = useRef(false)
  // Timestamp of when skip was set - auto-clears after timeout to prevent stuck state
  const skipListenerTimestampRef = useRef(0)
  // CRITICAL: Track when we last updated players locally to prevent listener from overwriting
  // This is separate from skip counter because player updates need longer protection
  const lastPlayersUpdateTimestampRef = useRef(0)
  // Also track the dynasty ID that was updated to be more precise
  const lastPlayersUpdateDynastyIdRef = useRef(null)
  // CRITICAL: Track when we last updated games locally to prevent listener from overwriting
  const lastGamesUpdateTimestampRef = useRef(0)
  const lastGamesUpdateDynastyIdRef = useRef(null)
  // Track which dynasties have had their migration data persisted this session
  // This prevents the auto-save from running multiple times for the same dynasty
  const persistedMigrationDynastiesRef = useRef(new Set())
  // Flag to indicate if a migration save is currently in progress (to serialize saves)
  const migrationSaveInProgressRef = useRef(false)
  // Track which cloud dynasties have had their subcollections loaded (lazy loading optimization)
  const loadedDynastyIdsRef = useRef(new Set())
  // Mirror of currentDynasty?.id readable from the dynasties listener
  // closure without forcing the listener to re-subscribe every time the
  // user opens a different dynasty. Keeping this listener stable across
  // navigations avoids tearing down and re-establishing the Firestore
  // WebSocket on each click — re-handshakes were a major contributor to
  // the variable cold-load times users reported.
  const currentDynastyIdRef = useRef(null)
  // Track which dynasty is currently having its data loaded
  const [loadingDynastyId, setLoadingDynastyId] = useState(null)

  // Keep the listener-readable ref in sync with currentDynasty.
  useEffect(() => {
    currentDynastyIdRef.current = currentDynasty?.id || null
  }, [currentDynasty?.id])

  // Helper to find dynasty by ID - checks state first (both local + cloud), then IndexedDB as fallback
  // This ensures cloud dynasties work even if user's premium expired (read-only mode)
  // Also returns the dynasty's storage type for proper routing
  const findDynastyById = async (dynastyId) => {
    // First check state (contains both local and cloud dynasties)
    let dynasty = String(currentDynasty?.id) === String(dynastyId)
      ? currentDynasty
      : dynasties.find(d => String(d.id) === String(dynastyId))

    // Fallback to IndexedDB for local dynasties not yet in state
    if (!dynasty) {
      const localDynasties = await indexedDBStorage.getDynasties() || []
      dynasty = localDynasties.find(d => String(d.id) === String(dynastyId))
    }

    return dynasty
  }

  // Helper to get games for a dynasty with proper storage routing
  const getDynastyGames = async (dynasty) => {
    if (!dynasty) return []

    const isCloudDynasty = dynasty.storageType === 'cloud'

    if (isCloudDynasty && dynasty._subcollectionsMigrated) {
      try {
        return await getGamesSubcollection(dynasty.id)
      } catch (err) {
        return dynasty?.games || []
      }
    } else if (!isCloudDynasty) {
      const localDynasties = await indexedDBStorage.getDynasties() || []
      const localDynasty = localDynasties.find(d => String(d.id) === String(dynasty.id))
      return localDynasty?.games || dynasty?.games || []
    }

    return dynasty?.games || []
  }

  // Helper to get players for a dynasty with proper storage routing
  const getDynastyPlayers = async (dynasty) => {
    if (!dynasty) return []

    const isCloudDynasty = dynasty.storageType === 'cloud'

    if (isCloudDynasty && dynasty._subcollectionsMigrated) {
      try {
        return await getPlayersSubcollection(dynasty.id)
      } catch (err) {
        return dynasty?.players || []
      }
    } else if (!isCloudDynasty) {
      const localDynasties = await indexedDBStorage.getDynasties() || []
      const localDynasty = localDynasties.find(d => String(d.id) === String(dynasty.id))
      return localDynasty?.players || dynasty?.players || []
    }

    return dynasty?.players || []
  }

  // Lazy load subcollection data for a cloud dynasty on demand
  // This reduces Firestore reads by only loading data when user opens a dynasty
  const loadDynastyData = async (dynastyId) => {
    // Check if already loaded
    if (loadedDynastyIdsRef.current.has(dynastyId)) {
      return
    }

    // Find the dynasty in state — search BOTH owner dynasties AND
    // shared dynasties (where the user is in editors[] but doesn't own).
    const ownerDynasty = dynasties.find(d => d.id === dynastyId)
    const sharedDynasty = !ownerDynasty
      ? sharedDynasties.find(d => d.id === dynastyId)
      : null
    const dynasty = ownerDynasty || sharedDynasty
    if (!dynasty) {
      return
    }

    // Local dynasties already have their data, just mark as loaded
    if (dynasty.storageType !== 'cloud') {
      loadedDynastyIdsRef.current.add(dynastyId)
      return
    }

    setLoadingDynastyId(dynastyId)

    try {
      // Load subcollections from Firestore. ALL of them — players,
      // games, weekRecaps, AND seasons. Without weekRecaps in this
      // list, the lazy-load entry point (which fires on direct
      // navigation to a dynasty after a page refresh) never reads the
      // recap subcollection back into React state. Recaps would
      // appear "deleted" until the next subscribeToDynasties fire
      // happened to also load subcollections — which on a quiet
      // dynasty might not happen at all. That asymmetry between this
      // path and the listener was the recap-disappears-on-refresh bug.
      // Cache-first reads return the IndexedDB-cached subcollection
      // data instantly, then fire a server fetch in the background.
      // Wire onFresh callbacks so the fresh server data REPLACES
      // stale cache when it returns. Without these, a save made on
      // Device A never reached Device B until something else evicted
      // the cache — the recap-saved-on-laptop-but-missing-on-phone
      // bug. The state-update functions are written to be no-ops
      // when the dynasty is no longer the current one.
      const onFreshGames = (fresh) => {
        if (skipListenerUpdatesCountRef.current > 0) return // active save in flight; don't clobber
        setDynasties(prev => prev.map(d =>
          String(d.id) === String(dynastyId) ? { ...d, games: fresh } : d
        ))
        setCurrentDynasty(prev => {
          if (!prev || String(prev.id) !== String(dynastyId)) return prev
          return { ...prev, games: fresh }
        })
      }
      const onFreshPlayers = (fresh) => {
        if (skipListenerUpdatesCountRef.current > 0) return
        setDynasties(prev => prev.map(d =>
          String(d.id) === String(dynastyId) ? { ...d, players: fresh } : d
        ))
        setCurrentDynasty(prev => {
          if (!prev || String(prev.id) !== String(dynastyId)) return prev
          return { ...prev, players: fresh }
        })
      }
      const onFreshRecaps = (fresh) => {
        if (skipListenerUpdatesCountRef.current > 0) return
        setDynasties(prev => prev.map(d =>
          String(d.id) === String(dynastyId) ? { ...d, weekRecapsByYear: fresh } : d
        ))
        setCurrentDynasty(prev => {
          if (!prev || String(prev.id) !== String(dynastyId)) return prev
          return { ...prev, weekRecapsByYear: fresh }
        })
      }
      // Seasons rehydrate to MULTIPLE legacy field names — surface them
      // by spreading the whole map back onto the dynasty object.
      const onFreshSeasons = (fresh) => {
        if (skipListenerUpdatesCountRef.current > 0) return
        setDynasties(prev => prev.map(d =>
          String(d.id) === String(dynastyId) ? { ...d, ...fresh } : d
        ))
        setCurrentDynasty(prev => {
          if (!prev || String(prev.id) !== String(dynastyId)) return prev
          return { ...prev, ...fresh }
        })
      }

      const [subcollectionPlayers, subcollectionGames, subcollectionRecaps, subcollectionSeasons] = await Promise.all([
        getPlayersSubcollection(dynastyId, { onFresh: onFreshPlayers }),
        getGamesSubcollection(dynastyId, { onFresh: onFreshGames }),
        getWeekRecapsSubcollection(dynastyId, { onFresh: onFreshRecaps }),
        getSeasonsSubcollection(dynastyId, { onFresh: onFreshSeasons }),
      ])

      // Use subcollection data if available, otherwise fall back to main document
      const players = subcollectionPlayers.length > 0 ? subcollectionPlayers : (dynasty.players || [])
      const games = subcollectionGames.length > 0 ? subcollectionGames : (dynasty.games || [])

      // Week recaps: same merge-then-migrate pattern the listener uses.
      // Subcollection wins per-(year, week) on overlap so a stale
      // legacy main-doc value can't override a fresh subcollection
      // save.
      const legacyRecaps = dynasty.weekRecapsByYear || {}
      const legacyRecapKeys = Object.keys(legacyRecaps)
      const subRecapKeys = Object.keys(subcollectionRecaps || {})
      const weekRecapsByYear = {}
      for (const y of legacyRecapKeys) {
        weekRecapsByYear[y] = { ...(legacyRecaps[y] || {}) }
      }
      for (const y of subRecapKeys) {
        if (!weekRecapsByYear[y]) weekRecapsByYear[y] = {}
        Object.assign(weekRecapsByYear[y], subcollectionRecaps[y] || {})
      }

      // Fire the legacy → subcollection migration in the background
      // if the main doc still has data. The migrate helper is now
      // subcollection-wins so it can't clobber freshly-saved data.
      if (legacyRecapKeys.length > 0) {
        migrateWeekRecapsToSubcollection(dynastyId, legacyRecaps).catch(err => {
          console.warn(`[recap migration] failed for ${dynastyId}:`, err?.code || err?.message || err)
        })
      }

      // Rehydrate seasonal fields — same merge-then-migrate pattern as
      // the listener's path. Sub wins per-(field, year) on overlap so
      // a partial-migration state can't drop data.
      const mergedSeasonal = {}
      for (const field of ALL_SEASONAL_FIELD_NAMES) {
        const legacy = dynasty[field]
        const fromSub = subcollectionSeasons[field]
        const hasLegacy = legacy && typeof legacy === 'object' && Object.keys(legacy).length > 0
        const hasSub = fromSub && typeof fromSub === 'object' && Object.keys(fromSub).length > 0
        if (!hasLegacy && !hasSub) continue
        if (PER_YEAR_NAMES.has(field)) {
          mergedSeasonal[field] = { ...(legacy || {}), ...(fromSub || {}) }
        } else {
          const out = {}
          for (const [teamKey, yearMap] of Object.entries(legacy || {})) {
            out[teamKey] = { ...(yearMap || {}) }
          }
          for (const [teamKey, yearMap] of Object.entries(fromSub || {})) {
            out[teamKey] = { ...(out[teamKey] || {}), ...(yearMap || {}) }
          }
          mergedSeasonal[field] = out
        }
      }

      // Detect any legacy seasonal data still on the main doc and
      // kick off background migration. Same pattern as the listener.
      const legacySeasonalSnapshot = {}
      let hasLegacySeasonal = false
      for (const field of ALL_SEASONAL_FIELD_NAMES) {
        const value = dynasty[field]
        if (value && typeof value === 'object' && Object.keys(value).length > 0) {
          legacySeasonalSnapshot[field] = value
          hasLegacySeasonal = true
        }
      }
      if (hasLegacySeasonal) {
        migrateSeasonalFieldsToSubcollection(dynastyId, legacySeasonalSnapshot)
          .then(({ migrated, cleared }) => {
            console.log(`[season migration] ${dynastyId}: migrated ${migrated.length} season(s), cleared ${cleared.length} field(s)`)
          })
          .catch(err => {
            console.warn(`[season migration] failed for ${dynastyId}:`, err?.code || err?.message || err)
          })
      }

      // Apply migrations to the loaded data
      const dynastyWithData = { ...dynasty, players, games, weekRecapsByYear, ...mergedSeasonal }
      const [migratedDynasty] = applyMigrations([dynastyWithData])

      // Write the loaded data back into whichever list owns it.
      if (ownerDynasty) {
        setDynasties(prev => prev.map(d =>
          d.id === dynastyId ? migratedDynasty : d
        ))
      } else {
        setSharedDynasties(prev => prev.map(d =>
          d.id === dynastyId ? migratedDynasty : d
        ))
      }

      // If this is the current dynasty, update it too
      setCurrentDynasty(prev => {
        if (prev?.id === dynastyId) {
          return migratedDynasty
        }
        return prev
      })

      loadedDynastyIdsRef.current.add(dynastyId)
    } catch (err) {
      console.error(`Error loading dynasty data for ${dynastyId}:`, err)
    } finally {
      setLoadingDynastyId(null)
    }
  }

  // Helper to apply migrations to dynasties (games + stats + roster)
  const applyMigrations = (dynastyList) => {
    return dynastyList.map(dynasty => {
      let migrated = dynasty

      // ─── Collapse legacy customTeams into dynasty.teams ──────────────
      // The site no longer reads `dynasty.customTeams` anywhere — the
      // tid-keyed `dynasty.teams` map is the only source of truth. For
      // dynasties created before this cleanup that still have a
      // populated customTeams field, fold each entry into the matching
      // tid slot (merging, so the slot's existing fields are preserved)
      // and drop the field from the in-memory copy. This is idempotent
      // and runs once per session per dynasty until the persisted copy
      // gets re-saved without it.
      if (migrated.customTeams && Object.keys(migrated.customTeams).length > 0) {
        const teams = { ...(migrated.teams || {}) }
        for (const [abbr, customTeam] of Object.entries(migrated.customTeams)) {
          if (!customTeam) continue
          // The replacedTid is what `customTeam.replacesTeam` referenced
          // (the original FBS team's abbr → tid). For a TB whose slot
          // is already populated with TB data this is a no-op.
          const replacedTid = customTeam.replacesTeam
            ? getTidFromAbbr(customTeam.replacesTeam)
            : null
          if (!replacedTid) continue
          // Skip if the slot already shows the TB's abbr — already migrated.
          const slot = teams[replacedTid]
          if (slot?.abbr === abbr) continue
          setTeambuilderTeam(teams, replacedTid, {
            abbr,
            name: customTeam.name,
            logo: customTeam.logoUrl,
            primaryColor: customTeam.backgroundColor || customTeam.primaryColor,
            secondaryColor: customTeam.textColor || customTeam.secondaryColor,
          })
        }
        const { customTeams: _drop, ...withoutCustomTeams } = migrated
        migrated = { ...withoutCustomTeams, teams }
      }

      // Apply game migration if needed
      if (!migrated._gamesMigrated) {
        migrated = migrateToUnifiedGames(migrated)
      }

      // Apply stats migration if needed
      if (!migrated._statsMigrated) {
        migrated = migrateStatsToPlayers(migrated)
      }

      // Apply movements migration if needed (new player movement tracking system)
      if (!migrated._movementsMigrated) {
        migrated = migrateToMovementsSystem(migrated)
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

      // Sync FCS team set to CFB26's actual five teams (5-letter compound
      // codes + FCSSE). The function is internally idempotent: gated work
      // skips on _fcs5TeamsMigrated, but it still runs the FCSSE-logo
      // backfill (only acts when the logo is empty).
      migrated = migrateFCSFiveTeams(migrated)

      // Per-team-per-week ranks. Walks every stored game and seeds
      // dynasty.teams[tid].byYear[year].rankByWeek so display sites
      // can do a one-line lookup ("what's team T's rank entering
      // Week N?") instead of deriving entering rank from a prior
      // game's stored rank. User games' stored team1Rank/team2Rank
      // are pre-game ranks (entering); CPU games' are post-game
      // ranks (= entering next week). Migration handles both.
      if (!migrated._rankByWeekMigrated) {
        migrated = migrateRanksToRankByWeek(migrated)
      }

      // Heal movementByYear at LOAD time so the in-memory player has clean
      // canonical entries before any render. Two cases:
      //   1. { type: 'unknown', legacyType, raw } poison shapes from an
      //      earlier migration bug. Recover from `raw` when possible
      //      (preserves the user's intended movement) or drop.
      //   2. Legacy types (declared_for_draft, transferred_out, recommitted,
      //      graduated, encouraged_to_transfer, …) that were written into
      //      movementByYear before the canonical conversion was pushed
      //      through every writer. Convert via legacyMovementToCanonical
      //      so renderers and resolvers see consistent v2 shapes.
      // Idempotent — clean players pass through untouched.
      const CANONICAL_TYPES = new Set(['arrival', 'departure', 'recommit'])
      if (Array.isArray(migrated.players)) {
        let healed = false
        const healedPlayers = migrated.players.map(p => {
          if (!p?.movementByYear) return p
          const cleaned = {}
          let touched = false
          for (const [y, m] of Object.entries(p.movementByYear)) {
            if (!m || typeof m !== 'object' || !m.type) {
              touched = true
              continue
            }
            if (CANONICAL_TYPES.has(m.type)) {
              cleaned[y] = m
              continue
            }
            if (m.type === 'unknown') {
              touched = true
              const recovered = m.raw ? legacyMovementToCanonical(m.raw) : null
              if (recovered && recovered.type !== 'unknown') {
                cleaned[y] = recovered
              }
              continue
            }
            // Legacy type — canonicalize.
            const canonical = legacyMovementToCanonical(m)
            if (canonical && canonical.type !== 'unknown') {
              touched = true
              cleaned[y] = canonical
            } else {
              touched = true
            }
          }
          if (!touched) return p
          healed = true
          return { ...p, movementByYear: cleaned }
        })
        if (healed) {
          migrated = { ...migrated, players: healedPlayers }
        }
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
          const tid = getTidFromAbbr(g.userTeam, migrated)
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
                              getTidFromAbbr(migrated.teamName, migrated)
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

      // SHARING MIGRATION: every dynasty gets an `editors` array on
      // first load. The owner's uid is always present so Firestore
      // rules can use the same array-contains check for both owner and
      // shared editors. Legacy `members[]` / `memberUids` are harvested
      // into `editors` so existing collaborators don't lose access.
      if (needsEditorsMigration(migrated)) {
        migrated = migrateDynastyToEditors(migrated)
      }

      // Drop 0-0 shell duplicates: if two games match on
      // year + week + gameType + team-pair (either order) and one is a
      // blank shell (no scores, not played) while the other has data,
      // remove the shell. Caused by a race in GameEdit where /game/new
      // could create a fresh shell instead of finding the existing game.
      if (Array.isArray(migrated.games) && migrated.games.length > 1) {
        const groups = new Map()
        migrated.games.forEach((g, idx) => {
          if (!g) return
          const t1 = g.team1Tid != null ? Number(g.team1Tid) : null
          const t2 = g.team2Tid != null ? Number(g.team2Tid) : null
          if (t1 == null || t2 == null) return
          const year = g.year != null ? Number(g.year) : null
          if (year == null || Number.isNaN(year)) return
          const week = g.week === '' || g.week == null ? '' : Number(g.week)
          const gameType = g.gameType || 'regular'
          const pair = t1 < t2 ? `${t1}-${t2}` : `${t2}-${t1}`
          const key = `${year}|${week}|${gameType}|${pair}`
          if (!groups.has(key)) groups.set(key, [])
          groups.get(key).push(idx)
        })
        const dropIdx = new Set()
        for (const idxs of groups.values()) {
          if (idxs.length < 2) continue
          const isShell = (g) => {
            if (!g) return true
            const s1 = parseInt(g.team1Score) || 0
            const s2 = parseInt(g.team2Score) || 0
            return s1 === 0 && s2 === 0 && !g.isPlayed
          }
          const enriched = idxs.map(i => ({ i, g: migrated.games[i], shell: isShell(migrated.games[i]) }))
          const hasReal = enriched.some(e => !e.shell)
          if (!hasReal) continue
          // Keep all non-shell games; drop every shell duplicate.
          for (const e of enriched) {
            if (e.shell) dropIdx.add(e.i)
          }
        }
        if (dropIdx.size > 0) {
          console.log(`[applyMigrations] Removing ${dropIdx.size} duplicate shell game(s)`)
          migrated = {
            ...migrated,
            games: migrated.games.filter((_, idx) => !dropIdx.has(idx))
          }
        }
      }

      return migrated
    })
  }

  // Load dynasties - ALWAYS loads from both local and cloud (if signed in)
  // Each dynasty has a storageType field ('local' or 'cloud') to track where it lives
  useEffect(() => {
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

    // Clear lazy loading cache when user changes (logout or login as different user)
    loadedDynastyIdsRef.current.clear()

    // If user is not signed in (or running under the dev-auth bypass,
    // which has no real Firestore access), skip cloud sync and load
    // only local dynasties.
    const isDevAuth = import.meta.env.DEV
      && typeof window !== 'undefined'
      && sessionStorage.getItem('cfbtracker_devauth') === '1'
    if (!user || isDevAuth) {
      // No cloud to wait on.
      setCloudSyncing(false)
      const loadOnlyLocal = async () => {
        const localDynasties = await loadLocalDynasties()
        if (localDynasties.length > 0) {
          let migratedDynasties = applyMigrations(localDynasties)
          // Under dev-auth, claim any unowned local dynasty for the
          // mock user so per-user views (CoachCareer, recruiting
          // commitments, etc.) render with real data instead of an
          // empty shell. In-memory only — never persisted.
          if (isDevAuth && user?.uid) {
            migratedDynasties = migratedDynasties.map(d => (
              d.userId ? d : { ...d, userId: user.uid }
            ))
          }
          setDynasties(migratedDynasties)
        } else {
          setDynasties([])
        }
        setLoading(false)
      }
      loadOnlyLocal()
      return
    }

    // Signed in: cloud sync is pending until the first Firestore
    // snapshot lands. Code that needs to know "has cloud data been
    // confirmed?" reads this flag instead of `loading`.
    setCloudSyncing(true)

    // User is signed in - load BOTH local and cloud dynasties
    // NOTE: Automatic migration is DISABLED. Users must manually migrate dynasties
    // through the Storage Switch Modal to avoid duplicates and size limit issues.
    // The old migrateLocalStorageData() caused problems:
    // - Created duplicate dynasties in Firestore
    // - Failed for large dynasties (>1MB) without proper subcollection handling
    // - Cleared IndexedDB even on partial failures

    // Load local dynasties first, then subscribe to cloud updates.
    // CRITICAL: drop the loading spinner as soon as the local read
    // resolves. Without this, signed-in users sit on "Loading
    // dynasties..." until the first Firestore snapshot arrives — which
    // on mobile cold reopens (no Firestore offline cache, possible
    // long-polling fallback) can stretch into multiple minutes. Cloud
    // dynasties continue syncing in the background and merge in when
    // the snapshot lands.
    loadLocalDynasties().then(localDynasties => {
      if (localDynasties.length > 0 && dynasties.length === 0) {
        const migratedLocal = applyMigrations(localDynasties)
        setDynasties(migratedLocal)
      }
      setLoading(false)
    })

    // Subscribe to real-time updates for cloud dynasties (Firestore)
    const unsubscribe = subscribeToDynasties(user.uid, async (firestoreDynasties) => {
      // Check if phase transition is in progress - ALWAYS skip during transitions
      if (phaseTransitionInProgressRef.current) {
        return
      }

      // Check if we should skip this update (we just manually updated local state)
      // Also check timestamp - auto-clear skip after 30 seconds to prevent stuck state
      const now = Date.now()
      if (skipListenerUpdatesCountRef.current > 0) {
        // Check if skip has been active for too long (5 minutes max for large saves)
        // Increased from 60s to 300s to handle large player/game saves over slow networks
        if (now - skipListenerTimestampRef.current > 300000) {
          skipListenerUpdatesCountRef.current = 0
        } else {
          skipListenerUpdatesCountRef.current--
          return
        }
      }

      // LAZY LOADING OPTIMIZATION: Only load subcollections for dynasties that are already loaded
      // or currently selected. This reduces Firestore reads significantly for users with many dynasties.
      const cloudDynastiesWithSubcollections = await Promise.all(
        firestoreDynasties.map(async (dynasty) => {
          try {
            // Tag as cloud storage
            const taggedDynasty = { ...dynasty, storageType: 'cloud' }

            // Check if this dynasty should have its subcollections loaded:
            // 1. It's the currently selected dynasty (user is viewing it)
            // 2. It's already been loaded this session (keep it in sync)
            const shouldLoadSubcollections =
              currentDynastyIdRef.current === dynasty.id ||
              loadedDynastyIdsRef.current.has(dynasty.id)

            if (!shouldLoadSubcollections) {
              // Return metadata only - players/games will be loaded on demand
              // Keep any embedded data from main document for display purposes (e.g., player count)
              return taggedDynasty
            }

            // Load subcollections for this dynasty.
            //
            // onFresh callbacks: cache-first reads served instant data
            // but used to drop the background-server result on the
            // floor. That's the cross-device staleness bug — Device A
            // saves to subcollection, Device B reads cache, gets
            // stale data. Now the server result, when it returns,
            // pushes fresh subcollection data into React state via
            // these callbacks. Listener-skip-active means an
            // in-flight local save has called this; defer to the
            // local state to avoid clobber.
            const dynId = dynasty.id
            const onFreshGames = (fresh) => {
              if (skipListenerUpdatesCountRef.current > 0) return
              setDynasties(prev => prev.map(d =>
                String(d.id) === String(dynId) ? { ...d, games: fresh } : d
              ))
              setCurrentDynasty(prev => {
                if (!prev || String(prev.id) !== String(dynId)) return prev
                return { ...prev, games: fresh }
              })
            }
            const onFreshPlayers = (fresh) => {
              if (skipListenerUpdatesCountRef.current > 0) return
              setDynasties(prev => prev.map(d =>
                String(d.id) === String(dynId) ? { ...d, players: fresh } : d
              ))
              setCurrentDynasty(prev => {
                if (!prev || String(prev.id) !== String(dynId)) return prev
                return { ...prev, players: fresh }
              })
            }
            const onFreshRecaps = (fresh) => {
              if (skipListenerUpdatesCountRef.current > 0) return
              setDynasties(prev => prev.map(d =>
                String(d.id) === String(dynId) ? { ...d, weekRecapsByYear: fresh } : d
              ))
              setCurrentDynasty(prev => {
                if (!prev || String(prev.id) !== String(dynId)) return prev
                return { ...prev, weekRecapsByYear: fresh }
              })
            }
            const onFreshSeasons = (fresh) => {
              if (skipListenerUpdatesCountRef.current > 0) return
              setDynasties(prev => prev.map(d =>
                String(d.id) === String(dynId) ? { ...d, ...fresh } : d
              ))
              setCurrentDynasty(prev => {
                if (!prev || String(prev.id) !== String(dynId)) return prev
                return { ...prev, ...fresh }
              })
            }

            const [subcollectionPlayers, subcollectionGames, subcollectionRecaps, subcollectionSeasons] = await Promise.all([
              getPlayersSubcollection(dynasty.id, { onFresh: onFreshPlayers }),
              getGamesSubcollection(dynasty.id, { onFresh: onFreshGames }),
              getWeekRecapsSubcollection(dynasty.id, { onFresh: onFreshRecaps }),
              getSeasonsSubcollection(dynasty.id, { onFresh: onFreshSeasons })
            ])

            // Use subcollection data if it exists, otherwise fall back to main document
            const players = subcollectionPlayers.length > 0 ? subcollectionPlayers : (dynasty.players || [])
            const games = subcollectionGames.length > 0 ? subcollectionGames : (dynasty.games || [])

            // Week recaps: merge legacy (main-doc field) + subcollection
            // sources, with the subcollection winning per-(year, week) for
            // any overlap. Merging instead of preferring one source is
            // load-bearing — a previous save may have written the new
            // recap to the subcollection and started the legacy-field
            // cleanup but had the deleteField step fail (network drop,
            // app close mid-save). In that state both sources are
            // partial: legacy is missing the new recap, subcollection is
            // missing the not-yet-migrated old recaps. Either-or would
            // appear to drop data on the next load.
            const legacyRecaps = dynasty.weekRecapsByYear || {}
            const legacyKeys = Object.keys(legacyRecaps)
            const subKeys = Object.keys(subcollectionRecaps || {})
            const weekRecapsByYear = {}
            for (const y of legacyKeys) {
              weekRecapsByYear[y] = { ...(legacyRecaps[y] || {}) }
            }
            for (const y of subKeys) {
              if (!weekRecapsByYear[y]) weekRecapsByYear[y] = {}
              Object.assign(weekRecapsByYear[y], subcollectionRecaps[y] || {})
            }

            if (legacyKeys.length > 0) {
              // Fire-and-forget — UI uses `weekRecapsByYear` regardless of
              // which storage tier holds the data, so the user can keep
              // working while migration runs in the background.
              migrateWeekRecapsToSubcollection(dynasty.id, legacyRecaps).catch(err => {
                console.warn(`[recap migration] failed for ${dynasty.id}:`, err?.code || err?.message || err)
              })
            }

            // Season-scoped fields: same merge-then-migrate pattern as
            // weekRecaps. The season subcollection holds every per-year
            // and per-team-year field that used to live as a ByYear /
            // ByTeamYear map on the main doc. We rehydrate the legacy
            // shapes from the subcollection, merge with anything still
            // on the main doc (so a partial-migration state doesn't
            // appear to drop data), and surface them under the same
            // field names consumers already read.
            const mergedSeasonal = {}
            for (const field of ALL_SEASONAL_FIELD_NAMES) {
              const legacy = dynasty[field]
              const fromSub = subcollectionSeasons[field]
              const hasLegacy = legacy && typeof legacy === 'object' && Object.keys(legacy).length > 0
              const hasSub = fromSub && typeof fromSub === 'object' && Object.keys(fromSub).length > 0
              if (!hasLegacy && !hasSub) continue
              if (PER_YEAR_NAMES.has(field)) {
                // shape: { [year]: data } — merge year-by-year, sub wins
                mergedSeasonal[field] = { ...(legacy || {}), ...(fromSub || {}) }
              } else {
                // shape: { [teamKey]: { [year]: data } } — deep merge,
                // sub wins per-(teamKey, year)
                const out = {}
                for (const [teamKey, yearMap] of Object.entries(legacy || {})) {
                  out[teamKey] = { ...(yearMap || {}) }
                }
                for (const [teamKey, yearMap] of Object.entries(fromSub || {})) {
                  out[teamKey] = { ...(out[teamKey] || {}), ...(yearMap || {}) }
                }
                mergedSeasonal[field] = out
              }
            }

            // Detect whether ANY of the seasonal fields still has data
            // on the main doc — if so, kick off background migration.
            const legacySeasonalSnapshot = {}
            let hasLegacySeasonal = false
            for (const field of ALL_SEASONAL_FIELD_NAMES) {
              const value = dynasty[field]
              if (value && typeof value === 'object' && Object.keys(value).length > 0) {
                legacySeasonalSnapshot[field] = value
                hasLegacySeasonal = true
              }
            }
            if (hasLegacySeasonal) {
              migrateSeasonalFieldsToSubcollection(dynasty.id, legacySeasonalSnapshot)
                .then(({ migrated, cleared }) => {
                  console.log(`[season migration] ${dynasty.id}: migrated ${migrated.length} season(s), cleared ${cleared.length} field(s)`)
                })
                .catch(err => {
                  console.warn(`[season migration] failed for ${dynasty.id}:`, err?.code || err?.message || err)
                })
            }

            // Mark as loaded
            loadedDynastyIdsRef.current.add(dynasty.id)

            return {
              ...taggedDynasty,
              players,
              games,
              weekRecapsByYear,
              ...mergedSeasonal,
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

      // Apply all migrations
      const migratedDynasties = applyMigrations(allDynasties)

      setDynasties(migratedDynasties)
      setLoading(false)
      setCloudSyncing(false)

      // Update current dynasty if it's in the list. Functional setter
      // form so we read the LATEST currentDynasty — the listener closure
      // is now stable across navigations (no longer rebuilt on every
      // dynasty open) and a captured `currentDynasty` reference would
      // be stale here. Preserve recent local player/game edits so the
      // listener echoing stale subcollection data doesn't clobber a
      // write the user just made.
      setCurrentDynasty(prevCurrent => {
        if (!prevCurrent) return prevCurrent
        const updated = migratedDynasties.find(d => d.id === prevCurrent.id)
        if (!updated) {
          // Dynasty not in OWNED list. For shared dynasties (uid in
          // editors[]), it lives in sharedDynasties state instead.
          // Don't clobber currentDynasty in that case — only nuke it
          // if it's genuinely gone (deleted, or access revoked).
          const isOwnedByUser = prevCurrent.userId === user?.uid
          return isOwnedByUser ? null : prevCurrent
        }

        const recentPlayerUpdate = lastPlayersUpdateDynastyIdRef.current === prevCurrent.id &&
          (Date.now() - lastPlayersUpdateTimestampRef.current) < 10000
        const recentGamesUpdate = lastGamesUpdateDynastyIdRef.current === prevCurrent.id &&
          (Date.now() - lastGamesUpdateTimestampRef.current) < 10000

        if (recentPlayerUpdate || recentGamesUpdate) {
          const preserved = {
            ...updated,
            ...(recentPlayerUpdate && prevCurrent.players ? { players: prevCurrent.players } : {}),
            ...(recentGamesUpdate && prevCurrent.games ? { games: prevCurrent.games } : {})
          }
          // Also reflect the preserved version in the dynasties array
          // so the home page doesn't briefly show stale Firestore data
          // for a dynasty the user just edited.
          setDynasties(prevDyn => prevDyn.map(d => d.id === preserved.id ? preserved : d))
          return preserved
        }
        return updated
      })

      // PERSIST MIGRATION FLAGS: Save migration flags back to Firestore so migrations don't run again
      // Compare raw vs migrated to see if any dynasty needs flag updates
      // NOTE: Only process cloud dynasties (migratedDynasties includes both local and cloud)
      // IMPORTANT: Process dynasties serially to avoid overwhelming Firestore
      const processMigrationPersistence = async () => {
        // Skip if already processing
        if (migrationSaveInProgressRef.current) {
          return
        }
        migrationSaveInProgressRef.current = true

        try {
          for (const migrated of cloudDynastiesWithSubcollections) {
            // Find the matching raw dynasty by ID (not index, since arrays may differ)
            const raw = firestoreDynasties.find(d => d.id === migrated.id)
            if (!raw) continue // Skip if no matching raw dynasty found

            // TOP-LEVEL PROTECTION: If stint migration was applied, NEVER auto-save players
            // This is the authoritative check that prevents any race condition from corrupting data
            const hasStintMigration = raw._stintMigrationApplied || migrated._stintMigrationApplied
            if (hasStintMigration) {
              // Add to persisted set to prevent any future attempts in this session
              persistedMigrationDynastiesRef.current.add(migrated.id)
            }

            const flagsToSave = {}

            // Check each migration flag
            if (migrated._gamesMigrated && !raw._gamesMigrated) {
              flagsToSave._gamesMigrated = true
            }
            if (migrated._statsMigrated && !raw._statsMigrated) {
              flagsToSave._statsMigrated = true
            }
            if (migrated._movementsMigrated && !raw._movementsMigrated) {
              flagsToSave._movementsMigrated = true
            }
            if (migrated._tidMigrated && !raw._tidMigrated) {
              flagsToSave._tidMigrated = true
            }
            if (migrated._fcs5TeamsMigrated && !raw._fcs5TeamsMigrated) {
              flagsToSave._fcs5TeamsMigrated = true
              // Also persist the updated teams map so the new abbrs / FCSSE
              // team survive a refresh without waiting on another mutation.
              if (migrated.teams) {
                flagsToSave.teams = migrated.teams
              }
            } else if (
              raw._fcs5TeamsMigrated &&
              migrated.teams?.[141]?.logo &&
              raw.teams?.[141]?.logo !== migrated.teams[141].logo
            ) {
              // FCSSE logo backfill ran on an already-migrated dynasty —
              // persist the updated teams map so the logo sticks.
              flagsToSave.teams = migrated.teams
            }

            // Check if we should persist migrated data
            // ONLY persist if flag is newly set AND we haven't already persisted this session
            const isNewlyFlagged = migrated._tidFullyMigrated && !raw._tidFullyMigrated
            const alreadyPersistedThisSession = persistedMigrationDynastiesRef.current.has(migrated.id)
            const shouldPersistMigratedData = isNewlyFlagged && !alreadyPersistedThisSession

            if (migrated._tidFullyMigrated && !raw._tidFullyMigrated) {
              flagsToSave._tidFullyMigrated = true
              // Also persist currentTid since it's added during migration
              if (migrated.currentTid) {
                flagsToSave.currentTid = migrated.currentTid
              }
            }

            if (shouldPersistMigratedData) {
              // Mark as persisted BEFORE saving to prevent duplicate attempts
              persistedMigrationDynastiesRef.current.add(migrated.id)

              try {
                // CRITICAL: Skip player saving if stint migration was already applied
                // The stint migration from DangerZone is the authoritative source
                // Saving here with potentially stale in-memory data would overwrite good data
                const stintMigrationApplied = raw._stintMigrationApplied || migrated._stintMigrationApplied
                if (!stintMigrationApplied && migrated.players && migrated.players.length > 0 && migrated._subcollectionsMigrated) {
                  await savePlayersToSubcollection(migrated.id, migrated.players)
                }
                // Also persist games with unified format
                if (migrated.games && migrated.games.length > 0 && migrated._subcollectionsMigrated) {
                  await saveGamesToSubcollection(migrated.id, migrated.games)
                }
              } catch (err) {
                console.error(`Failed to persist migrated data for dynasty ${migrated.id}:`, err)
                // Remove from persisted set so it can retry later
                persistedMigrationDynastiesRef.current.delete(migrated.id)
              }
            }

            // If any flags need saving, update Firestore
            if (Object.keys(flagsToSave).length > 0) {
              skipListenerUpdatesCountRef.current++
              try {
                await updateDynastyInFirestore(migrated.id, flagsToSave)
              } catch (err) {
                console.error('Failed to persist migration flags:', err)
              }
            }
          }
        } finally {
          migrationSaveInProgressRef.current = false
        }
      }

      // Run the persistence (don't await - let it run in background but serially)
      processMigrationPersistence()
    })

    return () => unsubscribe()
    // Intentionally omitting currentDynasty?.id: the listener uses
    // currentDynastyIdRef internally, so navigating between dynasties
    // doesn't tear down and re-establish the Firestore subscription.
    // Re-handshakes were a major contributor to the inconsistent
    // cold-load times users reported.
  }, [user, isPremium, migrated])

  // Dev-auth ownership stamp — reactive variant. The initial-load path
  // already stamps unowned dynasties, but new ones (test imports,
  // createDynasty) arrive after that fires. This effect stamps any
  // unowned dynasty on every dynasties change so per-user pages render
  // real data under dev-auth. In-memory only; never persisted (the
  // serialize step strips it back via the storage filter, and the
  // condition stops looping once all dynasties have a userId).
  useEffect(() => {
    if (!import.meta.env.DEV) return
    if (typeof window === 'undefined') return
    if (sessionStorage.getItem('cfbtracker_devauth') !== '1') return
    if (!user?.uid) return
    if (!dynasties.some(d => !d.userId)) return
    setDynasties(prev => prev.map(d => d.userId ? d : { ...d, userId: user.uid }))
  }, [dynasties, user])

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

  // When the user's premium subscription ends (cancel, refund, dispute,
  // customer deletion), the webhook flips tier→free and sets
  // pendingDowngrade: true on the user doc. We pick that up here and
  // copy all of the user's cloud dynasties into local storage, so they
  // don't lose access to their data. Cloud copies are removed after
  // the local copy succeeds; Firestore rules still allow read of
  // owned dynasties even when not premium so this migration works.
  //
  // Guarded by a ref so concurrent re-renders don't try to migrate twice.
  const migratingDowngradeRef = useRef(false)
  useEffect(() => {
    if (!user || !subscription?.pendingDowngrade) return
    if (migratingDowngradeRef.current) return
    migratingDowngradeRef.current = true

    let cancelled = false
    ;(async () => {
      try {
        // deleteFromCloud: false — keep cloud copies as a soft backup.
        // If the migrate-to-local step fails partway (network, permissions,
        // bug), we want the source data preserved in Firestore. User can
        // re-subscribe and get back to the original cloud dynasties later,
        // and we still have an escape hatch for recovery.
        const result = await storageService.migrateToLocal({ deleteFromCloud: false })
        if (cancelled) return

        // Reload all dynasties so the UI reflects the migrated copies.
        const all = await storageService.getDynasties()
        if (!cancelled) setDynasties(all)

        if (result?.migratedCount > 0) {
          toast.info(
            `Premium ended — ${result.migratedCount} cloud ${result.migratedCount === 1 ? 'dynasty' : 'dynasties'} copied to this device.`
          )
        }
      } catch (err) {
        console.error('[DynastyContext] auto-export on downgrade failed:', err)
        // Don't clear the flag if migration failed — leave it so we
        // retry on the next session.
        migratingDowngradeRef.current = false
        return
      }

      // Clear the flag only after migration succeeded.
      try {
        await updateDoc(doc(db, 'users', user.uid), { pendingDowngrade: false })
      } catch (err) {
        console.error('Failed to clear pendingDowngrade flag:', err)
      }
    })()

    return () => { cancelled = true }
  }, [user, subscription?.pendingDowngrade, toast])

  // Defensive read-only guard for mutation functions. The Firestore
  // rules already reject writes from non-premium users on cloud
  // dynasties, but a rejection at the network layer surfaces as an
  // ugly "Missing or insufficient permissions" Firestore error in the
  // console with no user feedback. This helper lets each mutation
  // short-circuit cleanly with a friendly toast before the network
  // call is even attempted.
  //
  // Returns true when the caller should bail. Pass the dynasty id of
  // the operation; the helper looks it up in `dynasties` /
  // `currentDynasty` and checks whether it's a cloud dynasty owned by
  // a user without active premium. Local-only dynasties are always
  // writable (this returns false for them).
  const blockIfReadOnly = (dynastyId, actionLabel = 'this change') => {
    let dynasty = dynasties.find(d => String(d.id) === String(dynastyId))
    if (!dynasty && String(currentDynasty?.id) === String(dynastyId)) {
      dynasty = currentDynasty
    }
    if (!dynasty) return false // unknown dynasty — let the caller decide
    const readOnly = dynasty.storageType === 'cloud' && !isPremium
    if (readOnly) {
      try {
        toast.error('This cloud dynasty is read-only without active premium. Renew premium to save changes.')
      } catch { /* toast may not be ready in early-mount paths */ }
      console.warn(`[DynastyContext] blocked ${actionLabel} on ${dynastyId} (cloud + not premium)`)
    }
    return readOnly
  }

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

    // `customTeams` is a transient input used to populate the tid-keyed
    // `teams` map above; it is NOT persisted on the dynasty doc.
    // `coachName` is a transient input that seeds memberLabels[ownerUid]
    // below — the dynasty doc does not store it as its own field anymore.
    // Single source of truth for owner's name: memberLabels[uid].
    const {
      customTeams: _droppedCustomTeams,
      coachName: _droppedCoachName,
      ...dynastyDataNoCustomTeams
    } = dynastyData

    const newDynastyData = {
      ...dynastyDataNoCustomTeams,
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
      // Multiplayer-of-1 by default: stamp the owner's uid into editors[],
      // seed memberTeams[ownerUid] with the team they're playing as,
      // and mirror the coach name into memberLabels so the Coach Career
      // picker / Members page already show the user's name. Solo
      // dynasties stay solo; the schema is forward-compatible if they
      // ever invite a second user via the Members page later.
      ...(user?.uid && currentTid ? {
        editors: [user.uid],
        memberTeams: { [user.uid]: [Number(currentTid)] },
        memberTeamHistory: {
          [user.uid]: { [startYear]: [Number(currentTid)] },
        },
        ...(dynastyData.coachName?.trim() ? {
          memberLabels: { [user.uid]: dynastyData.coachName.trim() },
        } : {}),
      } : {}),
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
      // Initialize custom conferences if custom teams exist (replaces old team in conference).
      // Bulk map → per-team fan-out: write the conference name into
      // each team's byYear[startYear] entry so the per-team field is
      // the authoritative source from day one of the dynasty.
      ...(initialConferences ? (() => {
        const updatedTeams = { ...teams }
        const abbrToTid = new Map()
        for (const [tid, team] of Object.entries(updatedTeams)) {
          const abbr = (team?.abbr || '').toUpperCase()
          if (abbr) abbrToTid.set(abbr, tid)
        }
        for (const [conferenceName, abbrs] of Object.entries(initialConferences)) {
          if (!Array.isArray(abbrs)) continue
          for (const rawAbbr of abbrs) {
            const tid = abbrToTid.get(String(rawAbbr).toUpperCase())
            if (!tid) continue
            const existingTeam = updatedTeams[tid] || {}
            const existingByYear = existingTeam.byYear || {}
            const existingYearData = existingByYear[startYear] || {}
            updatedTeams[tid] = {
              ...existingTeam,
              byYear: {
                ...existingByYear,
                [startYear]: { ...existingYearData, conference: conferenceName },
              },
            }
          }
        }
        return {
          teams: updatedTeams,
          customConferencesByYear: { [startYear]: initialConferences },
          customConferences: initialConferences, // Legacy field for backwards compatibility
        }
      })() : {})
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
    const { skipLastModified = false, forceOverwrite = false, skipGamesSubcollection = false } = options

    // Read-only chokepoint: most mutations route through updateDynasty,
    // so guarding here catches every modal whose parent forgot to gate
    // on isViewOnly. Per-feature mutations below also guard
    // independently for a clean error message before they call us.
    if (blockIfReadOnly(dynastyId, 'update dynasty')) return

    // Find the dynasty to determine its storage type
    let dynasty = dynasties.find(d => String(d.id) === String(dynastyId))
    if (!dynasty && String(currentDynasty?.id) === String(dynastyId)) {
      dynasty = currentDynasty
    }

    // Route based on dynasty's storageType, not global premium status
    // SAFEGUARD: Firebase IDs are 20+ character alphanumeric strings (not timestamps)
    // If the ID looks like a Firebase ID, we should route to cloud even if storageType is missing
    const looksLikeFirebaseId = typeof dynastyId === 'string' && dynastyId.length >= 20 && !/^\d+$/.test(dynastyId)
    const isLocalStorage = !looksLikeFirebaseId && (!dynasty || dynasty.storageType !== 'cloud' || !user)

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
      // Set counter to skip the next 3 listener updates BEFORE calling Firestore
      // (the listener fires during updateDoc, not after)
      // Increased from 2 to 3 for extra safety with batch writes
      skipListenerUpdatesCountRef.current = 3
      skipListenerTimestampRef.current = Date.now()

      // ALWAYS route players/games to subcollections for cloud dynasties
      // This prevents the 1MB document limit issue and ensures consistent data storage
      let mainDocUpdates = { ...updatesWithTimestamp }
      const subcollectionPromises = []

      // Route players to subcollection
      if (mainDocUpdates.players && Array.isArray(mainDocUpdates.players)) {
        console.log(`Saving ${mainDocUpdates.players.length} players to subcollection (with orphan cleanup${forceOverwrite ? ', forced' : ''})`)
        // CRITICAL: Track this player update to prevent listener from overwriting with stale data
        lastPlayersUpdateTimestampRef.current = Date.now()
        lastPlayersUpdateDynastyIdRef.current = dynastyId
        // Normalize every player through the v2 sync layer so the top-level
        // player.year / .team / .overall / .devTrait fields are always a
        // consistent mirror of the canonical per-year maps. Drops legacy
        // movements[] / teamHistory / leftTeam / etc. Keeps v2 canonical.
        const currentYearForSync = dynasty?.currentYear
        const normalizedPlayers = mainDocUpdates.players.map(p =>
          syncDerivedFieldsFromV2(p, currentYearForSync)
        )
        // Also write normalized players back into updatesWithTimestamp so
        // the local-state update at the bottom of this function shows the
        // same normalized shape that was persisted to Firestore.
        updatesWithTimestamp.players = normalizedPlayers
        subcollectionPromises.push(
          savePlayersToSubcollection(dynastyId, normalizedPlayers, { deleteOrphans: true, forceOverwrite })
        )
        // Don't save players to main doc - they're in subcollection now
        delete mainDocUpdates.players
        // Ensure subcollection flag is set
        mainDocUpdates._subcollectionsMigrated = true
      }

      // Route games to subcollection (unless skipGamesSubcollection is true - for optimized single-game updates)
      if (mainDocUpdates.games && Array.isArray(mainDocUpdates.games) && !skipGamesSubcollection) {
        console.log(`Saving ${mainDocUpdates.games.length} games to subcollection (with orphan cleanup)`)
        // CRITICAL: Track this games update to prevent listener from overwriting with stale data
        lastGamesUpdateTimestampRef.current = Date.now()
        lastGamesUpdateDynastyIdRef.current = dynastyId
        subcollectionPromises.push(
          saveGamesToSubcollection(dynastyId, mainDocUpdates.games, { deleteOrphans: true })
        )
        // Don't save games to main doc - they're in subcollection now
        delete mainDocUpdates.games
        // Ensure subcollection flag is set
        mainDocUpdates._subcollectionsMigrated = true
      } else if (mainDocUpdates.games && skipGamesSubcollection) {
        // Games already saved individually - just remove from main doc updates
        console.log('[updateDynasty] Skipping games subcollection (already saved individually)')
        delete mainDocUpdates.games
      }

      // Route season-scoped fields (allAmericansByYear, schedulesByTeamYear,
      // recruitingCommitmentsByTeamYear, etc) to the seasons subcollection.
      // Same justification as players/games: keeps the parent dynasty doc
      // under Firestore's 1 MiB cap on long-running dynasties.
      //
      // Handles two write shapes:
      //   - full field: { allAmericansByYear: { 2034: ..., 2033: ... } }
      //     → fanned out via splitSeasonalUpdateByYear
      //   - dot-notation path: { 'schedulesByTeamYear.UT.2029': [...] }
      //     → expanded into the same per-year shape and fanned out
      // Both paths produce a year-keyed map of season-doc patches that
      // writeSeasonalUpdate persists with setDoc({merge: true}).
      const seasonalCollect = {}
      const seasonalDotKeys = []
      for (const key of Object.keys(mainDocUpdates)) {
        if (isSeasonalField(key)) {
          seasonalCollect[key] = mainDocUpdates[key]
          delete mainDocUpdates[key]
          continue
        }
        if (key.includes('.')) {
          const topLevel = key.split('.')[0]
          if (isSeasonalField(topLevel)) {
            seasonalDotKeys.push(key)
          }
        }
      }
      // Expand dot-notation keys into the same nested shape full-field
      // writes use, so a single call to splitSeasonalUpdateByYear
      // handles both.
      for (const key of seasonalDotKeys) {
        const parts = key.split('.')
        const topLevel = parts[0]
        const value = mainDocUpdates[key]
        delete mainDocUpdates[key]
        if (!seasonalCollect[topLevel]) seasonalCollect[topLevel] = {}
        let target = seasonalCollect[topLevel]
        for (let i = 1; i < parts.length - 1; i++) {
          if (!target[parts[i]]) target[parts[i]] = {}
          target = target[parts[i]]
        }
        target[parts[parts.length - 1]] = value
      }
      if (Object.keys(seasonalCollect).length > 0) {
        const byYear = splitSeasonalUpdateByYear(seasonalCollect)
        if (Object.keys(byYear).length > 0) {
          subcollectionPromises.push(writeSeasonalUpdate(dynastyId, byYear))
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

      // CRITICAL: use functional setters so back-to-back updateDynasty calls
      // (e.g. save data then clear the sheetId) don't race. Each call sees
      // the latest committed dynasties state rather than the stale value
      // captured when this closure was created.
      setDynasties(prev => {
        const dynastyInArray = prev.some(d => String(d.id) === String(dynastyId))
        if (dynastyInArray) {
          return prev.map(d =>
            String(d.id) === String(dynastyId) ? deepMerge(d, expandedUpdates) : d
          )
        }
        // Dynasty just created and not in array yet — use currentDynasty as base.
        // currentDynasty may also be stale here, but expandedUpdates wins in deepMerge.
        if (String(currentDynasty?.id) === String(dynastyId)) {
          return [...prev, deepMerge(currentDynasty, expandedUpdates)]
        }
        return prev
      })

      if (String(currentDynasty?.id) === String(dynastyId)) {
        // Same deal — functional setter so back-to-back writes merge correctly.
        setCurrentDynasty(prev => {
          if (prev && String(prev.id) === String(dynastyId)) {
            return deepMerge(prev, expandedUpdates)
          }
          return deepMerge(currentDynasty, expandedUpdates)
        })
      }
    } catch (error) {
      console.error('Error updating dynasty:', error)
      throw error
    }
  }

  // ─── Week recap save/delete ────────────────────────────────────────
  // Recaps moved out of the main `dynasty.weekRecapsByYear` field into
  // a per-doc `weekRecaps/{year-week}` subcollection. The trigger was a
  // beta dynasty whose main doc reached 1,051,303 bytes — past the 1 MB
  // Firestore cap — and started rejecting EVERY write with
  // INVALID_ARGUMENT. Subcollection storage scales without that ceiling.
  //
  // The first save on any dynasty that still has the legacy field
  // migrates all existing entries to the subcollection and clears the
  // field via deleteField (which shrinks the parent doc and so is not
  // blocked by the size cap that's blocking normal updates).
  //
  // Local-only dynasties keep using the embedded map in IndexedDB —
  // there's no equivalent size limit there, and routing through the
  // subcollection helpers (which talk to Firestore) would error out.
  const saveWeekRecap = async (dynastyId, year, week, recap) => {
    if (blockIfReadOnly(dynastyId, 'save week recap')) return

    let dynasty = String(currentDynasty?.id) === String(dynastyId)
      ? currentDynasty
      : dynasties.find(d => String(d.id) === String(dynastyId))
    if (!dynasty) throw new Error('Dynasty not found')

    const looksLikeFirebaseId = typeof dynastyId === 'string' && dynastyId.length >= 20 && !/^\d+$/.test(dynastyId)
    const isCloud = looksLikeFirebaseId || (dynasty.storageType === 'cloud' && user)

    const yearN = Number(year)
    const weekN = Number(week)
    const entry = {
      generatedAt: recap?.generatedAt ?? Date.now(),
      text: String(recap?.text || '')
    }

    if (isCloud) {
      // Write the new recap to its own subcollection doc. Server-
      // confirmed via waitForPendingWrites + read-back verify inside
      // saveWeekRecapToSubcollection so we don't return success on a
      // local-cache-only write that the server silently rejected.
      //
      // We do NOT run the legacy → subcollection migration from this
      // save path. The previous version did, and that was the bug
      // that wiped recaps after close+reopen: dynasty.weekRecapsByYear
      // here is the in-memory state that was loaded at session start
      // (merged from legacy + subcollection by the listener). For the
      // year/week we just edited, that in-memory value is STALE
      // relative to the fresh write we just made — so passing it to
      // the migrate helper would fan back out and overwrite our
      // fresh subcollection write with the stale value. Migration
      // belongs in one place: the listener, on next load, with the
      // subcollection-wins guard now baked into the helper.
      await saveWeekRecapToSubcollection(dynastyId, yearN, weekN, entry)
    } else {
      // Local-only dynasty — the embedded map in IndexedDB has no size
      // ceiling, so just keep using updateDynasty.
      const cur = dynasty.weekRecapsByYear || {}
      const yr = { ...(cur[yearN] || {}) }
      yr[weekN] = entry
      await updateDynasty(dynastyId, { weekRecapsByYear: { ...cur, [yearN]: yr } })
      return
    }

    // Cloud-path local-state update: merge the new entry into
    // weekRecapsByYear so the UI reflects the change without waiting
    // for the listener to round-trip the subcollection.
    const apply = (prev) => {
      if (!prev) return prev
      const cur = prev.weekRecapsByYear || {}
      const yr = { ...(cur[yearN] || {}) }
      yr[weekN] = entry
      return { ...prev, weekRecapsByYear: { ...cur, [yearN]: yr } }
    }
    setDynasties(prev => prev.map(d =>
      String(d.id) === String(dynastyId) ? apply(d) : d
    ))
    if (String(currentDynasty?.id) === String(dynastyId)) {
      setCurrentDynasty(prev => prev ? apply(prev) : prev)
    }
  }

  const deleteWeekRecap = async (dynastyId, year, week) => {
    if (blockIfReadOnly(dynastyId, 'delete week recap')) return

    let dynasty = String(currentDynasty?.id) === String(dynastyId)
      ? currentDynasty
      : dynasties.find(d => String(d.id) === String(dynastyId))
    if (!dynasty) throw new Error('Dynasty not found')

    const looksLikeFirebaseId = typeof dynastyId === 'string' && dynastyId.length >= 20 && !/^\d+$/.test(dynastyId)
    const isCloud = looksLikeFirebaseId || (dynasty.storageType === 'cloud' && user)

    const yearN = Number(year)
    const weekN = Number(week)

    if (isCloud) {
      await deleteWeekRecapFromSubcollection(dynastyId, yearN, weekN)
    } else {
      const cur = dynasty.weekRecapsByYear || {}
      const yr = { ...(cur[yearN] || {}) }
      delete yr[weekN]
      await updateDynasty(dynastyId, { weekRecapsByYear: { ...cur, [yearN]: yr } })
      return
    }

    const apply = (prev) => {
      if (!prev) return prev
      const cur = prev.weekRecapsByYear || {}
      const yr = { ...(cur[yearN] || {}) }
      delete yr[weekN]
      return { ...prev, weekRecapsByYear: { ...cur, [yearN]: yr } }
    }
    setDynasties(prev => prev.map(d =>
      String(d.id) === String(dynastyId) ? apply(d) : d
    ))
    if (String(currentDynasty?.id) === String(dynastyId)) {
      setCurrentDynasty(prev => prev ? apply(prev) : prev)
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

    // Cloud storage: optimistic UI + background Firestore wipe.
    //
    // Was: await deleteDynastyWithSubcollections, then remove from
    // state. On a multi-year dynasty (5000+ players, 1000+ games)
    // that single await blocked the UI for 5-10 seconds. Now the
    // dynasty disappears from the user's list IMMEDIATELY and the
    // Firestore tear-down runs in the background. If it fails, the
    // listener brings the dynasty back on the next snapshot — and
    // the catch block surfaces a toast so the user knows.
    const updated = dynasties.filter(d => String(d.id) !== String(dynastyId))
    setDynasties(updated)
    if (String(currentDynasty?.id) === String(dynastyId)) {
      setCurrentDynasty(null)
    }

    deleteDynastyWithSubcollections(dynastyId).catch(error => {
      console.error('Error deleting dynasty from Firestore:', error)
      try { toast.error('Failed to delete dynasty — it may reappear. Try again.') } catch {}
    })
  }

  const selectDynasty = async (dynastyId) => {
    // Look in BOTH owned dynasties AND shared dynasties — for a user
    // navigating into a dynasty they have edit access to, the dynasty
    // lives in sharedDynasties until the merge happens via the context
    // value. Searching both directly avoids a race where this function
    // captures the closure before merge has propagated.
    let dynasty = dynasties.find(d => d.id === dynastyId)
      || sharedDynasties.find(d => d.id === dynastyId)
    if (!dynasty) {
      // Don't clear currentDynasty if cloud sync is still pending — the
      // dynasty may arrive shortly via the cloud or shared-dynasty
      // subscriptions. Clearing now would briefly null currentDynasty
      // and force the page into the "redirect home" path. Gate on
      // cloudSyncing rather than `loading` because `loading` flips
      // false as soon as the local read resolves, before cloud has had
      // a chance to deliver the dynasty.
      if (cloudSyncing) return
      setCurrentDynasty(null)
      return
    }

    // SHARING: shared editors see the same currentTid as the owner;
    // per-user team selection is deferred to the permissions phase.

    // Set the dynasty immediately (may not have players/games yet if cloud and unloaded)
    setCurrentDynasty(dynasty)

    // If this is a cloud dynasty that hasn't been loaded yet, trigger lazy loading
    if (dynasty.storageType === 'cloud' && !loadedDynastyIdsRef.current.has(dynastyId)) {
      await loadDynastyData(dynastyId)
    }

    // One-shot cleanup: earlier versions of the awards save flow created
    // roster entries for coach awards (Bear Bryant, Broyles), leaving ghost
    // players with no position/ovr/stats sitting in the roster. The current
    // save path skips them — this sweep removes any that pre-exist.
    if (!dynasty._coachAwardGhostsCleanedAt) {
      const COACH_AWARD_KEYS = new Set(['bearBryantCoachOfTheYear', 'broyles'])
      const players = dynasty.players || []
      const isCoachAwardGhost = (p) => {
        const accolades = p.accolades || []
        if (accolades.length === 0) return false
        // Every accolade must be a coach award.
        if (!accolades.every(a => COACH_AWARD_KEYS.has(a.award))) return false
        // And the player must have no real roster data.
        const hasOverall = p.overall != null || Object.keys(p.overallByYear || {}).length > 0
        const hasTeams = Object.keys(p.teamsByYear || {}).length > 0
        const hasStats = Object.keys(p.statsByYear || {}).length > 0
        const hasAllAm = (p.allAmericans || []).length > 0
        const hasAllConf = (p.allConference || []).length > 0
        const hasPosition = !!p.position
        return !hasOverall && !hasTeams && !hasStats && !hasAllAm && !hasAllConf && !hasPosition
      }
      const ghosts = players.filter(isCoachAwardGhost)
      if (ghosts.length > 0) {
        const ghostPids = new Set(ghosts.map(p => p.pid))
        const cleanedPlayers = players.filter(p => !ghostPids.has(p.pid))
        console.log(`[selectDynasty] Cleaning up ${ghosts.length} coach-award ghost player(s):`,
          ghosts.map(p => p.name).join(', '))
        try {
          await updateDynasty(dynastyId, {
            players: cleanedPlayers,
            _coachAwardGhostsCleanedAt: Date.now(),
          })
        } catch (e) {
          console.error('[selectDynasty] Coach-award ghost cleanup failed:', e)
        }
      } else {
        // Mark as clean so we don't re-scan every visit.
        try {
          await updateDynasty(dynastyId, { _coachAwardGhostsCleanedAt: Date.now() })
        } catch {}
      }
    }
  }

  const addGame = async (dynastyId, gameData) => {
    if (blockIfReadOnly(dynastyId, 'add game')) return

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

    // Find dynasty - check state first (contains both local and cloud), then IndexedDB as fallback
    // This ensures cloud dynasties work even if user's premium expired (read-only mode)
    let dynasty = String(currentDynasty?.id) === String(dynastyId)
      ? currentDynasty
      : dynasties.find(d => String(d.id) === String(dynastyId))

    // Fallback to IndexedDB for local dynasties not yet in state
    if (!dynasty) {
      const localDynasties = await indexedDBStorage.getDynasties() || []
      dynasty = localDynasties.find(d => String(d.id) === String(dynastyId))
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
      // Unified format: CPU game if neither team is the user's coached team.
      // Check the CURRENT user team AND the user team for this game's year
      // (coachTeamByYear) — multi-stint coaches need games from prior stints
      // to still be classified as user games, not CPU.
      const t1 = cleanGameData.team1Tid != null ? Number(cleanGameData.team1Tid) : null
      const t2 = cleanGameData.team2Tid != null ? Number(cleanGameData.team2Tid) : null
      const cur = currentUserTid != null ? Number(currentUserTid) : null
      const stintTidRaw = currentDynasty?.coachTeamByYear?.[cleanGameData.year]?.tid
      const stintTid = stintTidRaw != null ? Number(stintTidRaw) : null
      const matchesAnyUserTid = (slot) =>
        slot != null && ((cur != null && slot === cur) || (stintTid != null && slot === stintTid))
      isCPUGame = !matchesAnyUserTid(t1) && !matchesAnyUserTid(t2)
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
      const userTid = getTidFromAbbr(userTeamAbbr, dynasty) || currentUserTid
      const opponentTid = getTidFromAbbr(opponentAbbr, dynasty)

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
        // Regular games: match by year + week + team-pair (either order).
        // Without a team-pair check, multiple non-user games in the same week
        // would all collide on the first match, and a missing/blank week
        // would silently match an unrelated week-0 game.
        const cgWeek = cleanGameData.week === '' || cleanGameData.week == null
          ? null
          : Number(cleanGameData.week)
        const cgYear = Number(cleanGameData.year)
        const cgT1 = cleanGameData.team1Tid != null ? Number(cleanGameData.team1Tid) : null
        const cgT2 = cleanGameData.team2Tid != null ? Number(cleanGameData.team2Tid) : null
        if (cgT1 != null && cgT2 != null) {
          existingGameIndex = dynasty.games?.findIndex(g => {
            if (Number(g.year) !== cgYear) return false
            const gw = g.week === '' || g.week == null ? null : Number(g.week)
            if (cgWeek != null && gw !== cgWeek) return false
            if (cgWeek == null && gw != null) return false
            const gT1 = g.team1Tid != null ? Number(g.team1Tid) : null
            const gT2 = g.team2Tid != null ? Number(g.team2Tid) : null
            return (gT1 === cgT1 && gT2 === cgT2) || (gT1 === cgT2 && gT2 === cgT1)
          }) ?? -1
        } else if (cgWeek != null) {
          // Legacy fallback when team tids aren't available on the incoming game
          existingGameIndex = dynasty.games?.findIndex(
            g => Number(g.week) === cgWeek && Number(g.year) === cgYear
          ) ?? -1
        }
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

    // Sync per-team-per-week ranks. User games store entering rank
    // directly; CPU games' stored rank is the EA-screenshot post-game
    // rank, which equals each team's entering-next-week rank.
    if (typeof game.team1Rank === 'number' || typeof game.team2Rank === 'number') {
      updates.teams = applyGameRanksToTeams(dynasty, game)
    }

    // Determine if we need to process box score stats
    const hasBoxScoreToProcess = cleanGameData.boxScore && !isCPUGame

    // Track which players actually moved through processBoxScoreSave so
    // the cloud fast-path can write only those (vs rewriting every player
    // in the dynasty). applyBoxScoreDelta + recomputeMaxFieldsFromGames
    // both use `.map()` and return the SAME reference for unmutated
    // entries — so `updatedPlayers[i] !== originalPlayers[i]` is a
    // reliable "did this player change" signal.
    const originalPlayersRef = dynasty.players || []
    let changedPlayers = null

    // AUTO-SYNC: Process box score stats if present (delta tracking)
    // The manual "Sync Stats" button in Player Editor is a backup for fixing discrepancies
    if (hasBoxScoreToProcess) {
      const existingGame = existingGameIndex !== -1 && existingGameIndex !== undefined
        ? dynasty.games[existingGameIndex]
        : null
      const oldContribution = existingGame?.statsContributed || null

      // Pass the updated games list so max/long fields can be recomputed accurately
      // when editing an existing box score (delta can't lower a season long on its own).
      const { updatedPlayers, statsContributed } = processBoxScoreSave(
        originalPlayersRef,
        cleanGameData.boxScore,
        oldContribution,
        cleanGameData.year,
        updatedGames
      )

      // Store the stats contribution on the game for future delta calculations
      const gameIndex = updatedGames.findIndex(g => g.id === game.id)
      if (gameIndex !== -1) {
        updatedGames[gameIndex] = { ...updatedGames[gameIndex], statsContributed }
        game = updatedGames[gameIndex] // Update game reference with statsContributed
      }

      updates.players = updatedPlayers
      updates.games = updatedGames

      // Reference-diff. Realistic counts: ~20-30 box-score scorers
      // touched by applyBoxScoreDelta + a small handful potentially
      // touched by recomputeMaxFieldsFromGames. Way under the
      // writeBatch 500-doc cap.
      changedPlayers = updatedPlayers.filter((p, i) => p !== originalPlayersRef[i])
    }

    // Determine storage type for optimization
    const looksLikeFirebaseId = typeof dynastyId === 'string' && dynastyId.length >= 20 && !/^\d+$/.test(dynastyId)
    const isCloudStorage = looksLikeFirebaseId || (dynasty.storageType === 'cloud' && user)

    // OPTIMIZATION: For cloud storage with simple game (no box score processing),
    // save just the single game doc instead of rewriting all games
    if (isCloudStorage && !hasBoxScoreToProcess) {
      console.log(`[addGame] OPTIMIZED: Saving single game ${game.id} to cloud (no box score)`)

      try {
        // Set listener-skip guards so the real-time listener doesn't
        // overwrite our local games array with a stale subcollection read.
        skipListenerUpdatesCountRef.current = Math.max(skipListenerUpdatesCountRef.current, 3)
        skipListenerTimestampRef.current = Date.now()
        lastGamesUpdateTimestampRef.current = Date.now()
        lastGamesUpdateDynastyIdRef.current = dynastyId

        // Save single game to Firestore subcollection (1 write instead of N)
        await saveGameToSubcollection(dynastyId, game)
        lastGamesUpdateTimestampRef.current = Date.now()
        console.log(`[addGame] Single game saved successfully: ${game.id}`)

        // Update local React state
        const updatedDynasty = { ...dynasty, games: updatedGames, lastModified: Date.now() }

        setDynasties(prev => prev.map(d =>
          String(d.id) === String(dynastyId) ? updatedDynasty : d
        ))

        if (String(currentDynasty?.id) === String(dynastyId)) {
          setCurrentDynasty(updatedDynasty)
        }

        return game
      } catch (error) {
        console.error('[addGame] Single-doc update failed, falling back to batch:', error)
        // Fall through to batch update
      }
    }

    // OPTIMIZATION: For cloud storage WITH box score, write just the
    // affected docs (1 game + N changed players) in a single batch.
    // The savePlayersToSubcollection path in updateDynasty rewrites
    // EVERY player in the dynasty, with batch delays + a verify-read
    // of the full subcollection at the end — that was 30+ seconds on
    // 5000-player dynasties even though box-score saves only mutate
    // the 20-30 players who recorded stats. The reference-diff above
    // (changedPlayers) gives us the exact set to persist.
    if (isCloudStorage && hasBoxScoreToProcess && Array.isArray(changedPlayers)) {
      console.log(`[addGame] OPTIMIZED: Saving 1 game + ${changedPlayers.length} changed players (skipping full-roster rewrite)`)

      try {
        skipListenerUpdatesCountRef.current = Math.max(skipListenerUpdatesCountRef.current, 3)
        skipListenerTimestampRef.current = Date.now()
        lastGamesUpdateTimestampRef.current = Date.now()
        lastGamesUpdateDynastyIdRef.current = dynastyId
        // Block the real-time listener from clobbering our fresh
        // players array with a stale read — same pattern updateDynasty
        // uses for its players-subcollection writes.
        lastPlayersUpdateTimestampRef.current = Date.now()
        lastPlayersUpdateDynastyIdRef.current = dynastyId

        await saveChangedPlayersAndGame(dynastyId, changedPlayers, game)
        lastGamesUpdateTimestampRef.current = Date.now()
        lastPlayersUpdateTimestampRef.current = Date.now()

        // Update local React state with the FULL updated arrays so the
        // UI reflects the new player stats immediately (the in-memory
        // updatedPlayers has the unchanged-by-reference + the changed
        // mutations both).
        const updatedDynasty = {
          ...dynasty,
          games: updatedGames,
          players: updates.players,
          lastModified: Date.now(),
        }

        setDynasties(prev => prev.map(d =>
          String(d.id) === String(dynastyId) ? updatedDynasty : d
        ))

        if (String(currentDynasty?.id) === String(dynastyId)) {
          setCurrentDynasty(updatedDynasty)
        }

        return game
      } catch (error) {
        console.error('[addGame] Box-score fast-path failed, falling back to batch:', error)
        // Fall through to batch update
      }
    }

    // BATCH PATH: Used for local storage OR when the cloud fast-path
    // failed (e.g., transient network error during the batch commit).
    if (hasBoxScoreToProcess) {
      console.log(`[addGame] BATCH: Saving game ${game.id} with box score (updating players too)`)
    } else {
      console.log(`[addGame] BATCH: Saving game ${game.id} via updateDynasty`)
    }

    await updateDynasty(dynastyId, updates)

    return game
  }

  /**
   * OPTIMIZED: Update a single game with optional record updates
   * Used by GameEdit.jsx to avoid rewriting all games to Firestore
   * Handles CFP winner propagation by saving affected games individually
   *
   * @param {string} dynastyId - Dynasty ID
   * @param {Object} gameData - Full game object to save
   * @param {Object} options - Optional config { recordUpdates, cfpGamesToPropagate }
   */
  const updateGame = async (dynastyId, gameData, options = {}) => {
    if (blockIfReadOnly(dynastyId, 'update game')) return
    const { recordUpdates = {}, cfpGamesToPropagate = [] } = options

    // Find dynasty
    let dynasty = String(currentDynasty?.id) === String(dynastyId)
      ? currentDynasty
      : dynasties.find(d => String(d.id) === String(dynastyId))

    if (!dynasty) {
      const localDynasties = await indexedDBStorage.getDynasties() || []
      dynasty = localDynasties.find(d => String(d.id) === String(dynastyId))
    }

    if (!dynasty) {
      console.error('[updateGame] Dynasty not found:', dynastyId)
      throw new Error('Dynasty not found')
    }

    // Determine storage type
    const looksLikeFirebaseId = typeof dynastyId === 'string' && dynastyId.length >= 20 && !/^\d+$/.test(dynastyId)
    const isCloudStorage = looksLikeFirebaseId || (dynasty.storageType === 'cloud' && user)

    // Build updated games array for local state
    const games = dynasty.games || []
    const existingIndex = games.findIndex(g => g.id === gameData.id)
    let updatedGames = [...games]

    if (existingIndex >= 0) {
      updatedGames[existingIndex] = { ...games[existingIndex], ...gameData, updatedAt: new Date().toISOString() }
    } else {
      updatedGames.push({ ...gameData, createdAt: new Date().toISOString() })
    }

    // Apply CFP propagation games (if any)
    for (const propagatedGame of cfpGamesToPropagate) {
      const propIndex = updatedGames.findIndex(g => g.id === propagatedGame.id)
      if (propIndex >= 0) {
        updatedGames[propIndex] = { ...updatedGames[propIndex], ...propagatedGame }
      }
    }

    // Per-team-per-week rank update from this game's stored ranks.
    // Same EA-shift rule: user games' rank → rankByWeek[gameWeek];
    // CPU games' rank → rankByWeek[gameWeek + 1].
    let teamsUpdate = null
    if (typeof gameData.team1Rank === 'number' || typeof gameData.team2Rank === 'number') {
      teamsUpdate = applyGameRanksToTeams(dynasty, gameData)
    }

    // OPTIMIZED PATH: Cloud storage - save individual games + record updates only
    if (isCloudStorage) {
      try {
        // Set listener-skip guards so the real-time listener doesn't
        // overwrite our games array with a stale subcollection read.
        skipListenerUpdatesCountRef.current = Math.max(skipListenerUpdatesCountRef.current, 3)
        skipListenerTimestampRef.current = Date.now()
        lastGamesUpdateTimestampRef.current = Date.now()
        lastGamesUpdateDynastyIdRef.current = dynastyId

        // Save main game to subcollection
        await saveGameToSubcollection(dynastyId, updatedGames.find(g => g.id === gameData.id))

        // Save any CFP propagated games
        for (const propagatedGame of cfpGamesToPropagate) {
          const fullPropGame = updatedGames.find(g => g.id === propagatedGame.id)
          if (fullPropGame) {
            await saveGameToSubcollection(dynastyId, fullPropGame)
          }
        }

        // Update dynasty document with ONLY record updates (not games array)
        // This is the key optimization - we don't rewrite all 261 games
        const cloudUpdates = { ...recordUpdates }
        if (teamsUpdate) cloudUpdates.teams = teamsUpdate
        if (Object.keys(cloudUpdates).length > 0) {
          console.log('[updateGame] Updating dynasty with record updates only:', Object.keys(cloudUpdates))
          await updateDynasty(dynastyId, cloudUpdates, { skipGamesSubcollection: true })
        }

        // Re-stamp now that writes are durable.
        lastGamesUpdateTimestampRef.current = Date.now()

        // Update local React state
        const updatedDynasty = { ...dynasty, games: updatedGames, lastModified: Date.now() }

        setDynasties(prev => prev.map(d =>
          String(d.id) === String(dynastyId) ? updatedDynasty : d
        ))

        if (String(currentDynasty?.id) === String(dynastyId)) {
          setCurrentDynasty(updatedDynasty)
        }

        console.log(`[updateGame] SUCCESS: Saved ${1 + cfpGamesToPropagate.length} game(s) with ${Object.keys(recordUpdates).length} record fields`)
        return gameData
      } catch (error) {
        console.error('[updateGame] Optimized save failed, falling back to batch:', error)
        // Fall through to batch update
      }
    }

    // FALLBACK PATH: Local storage or cloud error - use batch update
    console.log(`[updateGame] BATCH: Saving via updateDynasty (local storage or fallback)`)
    const batchUpdates = { games: updatedGames, ...recordUpdates }
    if (teamsUpdate) batchUpdates.teams = teamsUpdate
    await updateDynasty(dynastyId, batchUpdates)

    return gameData
  }

  // Add or update CPU bowl games as proper game entries in the games[] array
  // This ensures ALL games (user and CPU) are stored uniformly
  // FIXED: Now reads games from storage backend (not stale React state) to avoid race conditions
  const saveCPUBowlGames = async (dynastyId, bowlGames, year, week = 'week1') => {
    if (blockIfReadOnly(dynastyId, 'save CPU bowl games')) return
    // Find dynasty from state first, then fallback to IndexedDB
    let dynasty = String(currentDynasty?.id) === String(dynastyId)
      ? currentDynasty
      : dynasties.find(d => String(d.id) === String(dynastyId))

    if (!dynasty) {
      const localDynasties = await indexedDBStorage.getDynasties() || []
      dynasty = localDynasties.find(d => String(d.id) === String(dynastyId))
    }

    if (!dynasty) {
      console.error('Dynasty not found:', dynastyId)
      return
    }

    // Use dynasty's storageType to determine where to read games from
    const isCloudDynasty = dynasty.storageType === 'cloud'
    let existingGames

    if (isCloudDynasty && dynasty._subcollectionsMigrated) {
      // CLOUD STORAGE: Read from Firestore subcollection to get latest data
      try {
        existingGames = await getGamesSubcollection(dynastyId)
      } catch (err) {
        existingGames = dynasty?.games || []
      }
    } else if (!isCloudDynasty) {
      // LOCAL STORAGE: Read from IndexedDB to get latest data
      const localDynasties = await indexedDBStorage.getDynasties() || []
      const localDynasty = localDynasties.find(d => String(d.id) === String(dynastyId))
      existingGames = localDynasty?.games || dynasty?.games || []
    } else {
      existingGames = dynasty?.games || []
    }

    const userTeamAbbr = getCurrentTeamAbbr(dynasty)

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
        const team1Tid = bowl.team1Tid || getTidFromAbbr(bowl.team1, dynasty)
        const team2Tid = bowl.team2Tid || getTidFromAbbr(bowl.team2, dynasty)

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

  // ─── Targeted single-doc patch helpers ──────────────────────────────
  // Each of these is the "fast path" companion to a heavy-handed
  // updateDynasty({ players: [...all 5000] }) / updateDynasty({ games:
  // [...all 1000] }) call. They detect what actually changed, write
  // only those docs to Firestore, and update local state with the
  // full updated array so the React tree reflects the change.

  /**
   * Patch a SINGLE game's fields without rewriting the rest of the
   * games subcollection. Used by sheet modals that need to record a
   * sheetId on a game (or any other narrow per-game metadata).
   */
  const patchGameFields = async (dynastyId, gameId, partialFields) => {
    if (blockIfReadOnly(dynastyId, 'update game fields')) return
    if (!dynastyId || !gameId || !partialFields) return

    const dynasty = await findDynastyById(dynastyId)
    if (!dynasty) return

    const games = dynasty.games || []
    const idx = games.findIndex(g => g.id === gameId)
    if (idx === -1) return

    const updatedGame = {
      ...games[idx],
      ...partialFields,
      updatedAt: new Date().toISOString(),
    }
    const updatedGames = [...games]
    updatedGames[idx] = updatedGame

    const looksLikeFirebaseId = typeof dynastyId === 'string' && dynastyId.length >= 20 && !/^\d+$/.test(dynastyId)
    const isCloudStorage = looksLikeFirebaseId || (dynasty.storageType === 'cloud' && user)

    if (isCloudStorage) {
      try {
        skipListenerUpdatesCountRef.current = Math.max(skipListenerUpdatesCountRef.current, 3)
        skipListenerTimestampRef.current = Date.now()
        lastGamesUpdateTimestampRef.current = Date.now()
        lastGamesUpdateDynastyIdRef.current = dynastyId

        await saveGameToSubcollection(dynastyId, updatedGame)

        const updatedDynasty = { ...dynasty, games: updatedGames, lastModified: Date.now() }
        setDynasties(prev => prev.map(d => String(d.id) === String(dynastyId) ? updatedDynasty : d))
        if (String(currentDynasty?.id) === String(dynastyId)) {
          setCurrentDynasty(updatedDynasty)
        }
        return updatedGame
      } catch (error) {
        console.error('[patchGameFields] Single-game write failed, falling back to batch:', error)
      }
    }

    // Local-storage path or fallback: full updateDynasty (IndexedDB).
    await updateDynasty(dynastyId, { games: updatedGames })
    return updatedGame
  }

  /**
   * Persist a partial roster update — caller passes the FULL
   * updatedPlayers array (typically the result of mapping over
   * dynasty.players and returning the same reference for unchanged
   * entries). We diff against current state to find actually-changed
   * players, then write only those via writeBatch. Local React state
   * still gets the full updated array so the UI reflects every
   * change.
   *
   * Caps at 500 changed players (writeBatch limit). For larger
   * updates the caller should fall back to updateDynasty.
   */
  const applyChangedPlayers = async (dynastyId, updatedPlayers) => {
    if (blockIfReadOnly(dynastyId, 'apply player updates')) return
    if (!dynastyId || !Array.isArray(updatedPlayers)) return

    const dynasty = await findDynastyById(dynastyId)
    if (!dynasty) return

    const originalPlayers = dynasty.players || []
    // Reference-diff. Same indexing as the caller's .map() — unchanged
    // entries return the SAME ref so this filter picks out only the
    // mutated ones.
    const changed = updatedPlayers.filter((p, i) => p !== originalPlayers[i])

    const looksLikeFirebaseId = typeof dynastyId === 'string' && dynastyId.length >= 20 && !/^\d+$/.test(dynastyId)
    const isCloudStorage = looksLikeFirebaseId || (dynasty.storageType === 'cloud' && user)

    // Too many changes for the fast batch path → fall back to the
    // full subcollection rewrite (same behavior as before this fix).
    if (isCloudStorage && changed.length > 500) {
      console.warn(`[applyChangedPlayers] ${changed.length} changed players exceeds batch cap — falling back to full rewrite`)
      await updateDynasty(dynastyId, { players: updatedPlayers })
      return changed.length
    }

    if (isCloudStorage && changed.length > 0) {
      try {
        skipListenerUpdatesCountRef.current = Math.max(skipListenerUpdatesCountRef.current, 3)
        skipListenerTimestampRef.current = Date.now()
        lastPlayersUpdateTimestampRef.current = Date.now()
        lastPlayersUpdateDynastyIdRef.current = dynastyId

        await saveChangedPlayers(dynastyId, changed)

        const updatedDynasty = { ...dynasty, players: updatedPlayers, lastModified: Date.now() }
        setDynasties(prev => prev.map(d => String(d.id) === String(dynastyId) ? updatedDynasty : d))
        if (String(currentDynasty?.id) === String(dynastyId)) {
          setCurrentDynasty(updatedDynasty)
        }
        return changed.length
      } catch (error) {
        console.error('[applyChangedPlayers] Batch write failed, falling back to full rewrite:', error)
      }
    }

    // Local-storage / no-changes / fallback path
    if (changed.length > 0) {
      await updateDynasty(dynastyId, { players: updatedPlayers })
    }
    return changed.length
  }

  /**
   * Persist a set of game inserts plus a list of game-id deletions
   * via a single writeBatch — the same shape as saveWeeklyScores's
   * cloud fast path, but available to any modal that does
   * "rebuild a slice of dynasty.games" (Bowl History edit, CFP
   * brackets, etc).
   *
   * `gamesToSet`     — full game objects to upsert (must have .id).
   * `gameIdsToDelete` — game IDs to remove from the subcollection.
   * `extraUpdates`   — optional non-games fields to land on the main
   *                    doc (e.g. { someField: value }). Routes through
   *                    updateDynasty with skipGamesSubcollection=true
   *                    so the slow full-rewrite is skipped.
   * `localGamesArray` — REQUIRED. The full updated games array the
   *                    caller built; used to update React state so
   *                    the UI shows the new state immediately.
   */
  const saveGameSetChanges = async (dynastyId, { gamesToSet = [], gameIdsToDelete = [], extraUpdates = {}, localGamesArray = null } = {}) => {
    if (blockIfReadOnly(dynastyId, 'save game changes')) return
    if (!dynastyId) return
    if (!Array.isArray(localGamesArray)) {
      throw new Error('saveGameSetChanges requires localGamesArray for state sync')
    }

    const dynasty = await findDynastyById(dynastyId)
    if (!dynasty) return

    const looksLikeFirebaseId = typeof dynastyId === 'string' && dynastyId.length >= 20 && !/^\d+$/.test(dynastyId)
    const isCloudStorage = looksLikeFirebaseId || (dynasty.storageType === 'cloud' && user)

    if (isCloudStorage) {
      try {
        skipListenerUpdatesCountRef.current = Math.max(skipListenerUpdatesCountRef.current, 3)
        skipListenerTimestampRef.current = Date.now()
        lastGamesUpdateTimestampRef.current = Date.now()
        lastGamesUpdateDynastyIdRef.current = dynastyId

        await saveWeeklyGamesChanges(dynastyId, gamesToSet, gameIdsToDelete)

        if (extraUpdates && Object.keys(extraUpdates).length > 0) {
          await updateDynasty(dynastyId, extraUpdates, { skipGamesSubcollection: true })
        }

        const updatedDynasty = { ...dynasty, ...extraUpdates, games: localGamesArray, lastModified: Date.now() }
        setDynasties(prev => prev.map(d => String(d.id) === String(dynastyId) ? updatedDynasty : d))
        if (String(currentDynasty?.id) === String(dynastyId)) {
          setCurrentDynasty(updatedDynasty)
        }
        lastGamesUpdateTimestampRef.current = Date.now()
        return
      } catch (error) {
        console.error('[saveGameSetChanges] Targeted batch failed, falling back to full updateDynasty:', error)
      }
    }

    // Local-storage / fallback: full updateDynasty.
    await updateDynasty(dynastyId, { games: localGamesArray, ...extraUpdates })
  }

  // Save a week's worth of CPU/league-wide regular-season game records.
  // Each parsed row becomes a game in dynasty.games[] with a stable id so re-
  // imports update in place. Games involving the user's own team that already
  // have scores entered through the schedule flow are PRESERVED — we never
  // overwrite the user's own results.
  const saveWeeklyScores = async (dynastyId, weeklyGames, year, week) => {
    if (blockIfReadOnly(dynastyId, 'save weekly scores')) return
    const dynasty = await findDynastyById(dynastyId)
    if (!dynasty) return []

    const yearNum = Number(year)
    const weekNum = Number(week)
    const userTid = getCurrentTeamTid(dynasty)
    const existingGames = await getDynastyGames(dynasty)

    // Stable id keyed by sorted tids — same matchup re-imported updates in place
    const idForGame = (homeTid, awayTid) => {
      const lo = Math.min(Number(homeTid), Number(awayTid))
      const hi = Math.max(Number(homeTid), Number(awayTid))
      return `weekly-${yearNum}-w${weekNum}-${lo}-${hi}`
    }

    // Index existing games for this week so we can update in place
    const existingByPair = new Map()
    for (const g of existingGames) {
      if (!g) continue
      if (Number(g.year) !== yearNum) continue
      if (Number(g.week) !== weekNum) continue
      if (!g.team1Tid || !g.team2Tid) continue
      const lo = Math.min(Number(g.team1Tid), Number(g.team2Tid))
      const hi = Math.max(Number(g.team1Tid), Number(g.team2Tid))
      existingByPair.set(`${lo}-${hi}`, g)
    }

    const isUserGameWithScores = (g) => {
      if (!g) return false
      if (Number(g.team1Tid) !== userTid && Number(g.team2Tid) !== userTid) return false
      return typeof g.team1Score === 'number' && typeof g.team2Score === 'number'
    }

    // Custom conferences for isConferenceGame inference
    const customConferences = getCustomConferencesForYear(dynasty, yearNum)

    // Detect conference-championship matchups already on file. The
    // dedicated CC entry flow is the source of truth for those games —
    // an import that would clobber them with a "regular" gameType row
    // breaks every page that filters by isConferenceChampionship. We
    // index by sorted tid pair scoped to the year (CCs aren't tied to
    // a specific week in the dynasty data) so the same pair anywhere
    // in the year wins over the import.
    const existingCCByPair = new Map()
    for (const g of existingGames) {
      if (!g) continue
      if (Number(g.year) !== yearNum) continue
      if (!g.isConferenceChampionship && g.gameType !== GAME_TYPES.CONFERENCE_CHAMPIONSHIP) continue
      if (!g.team1Tid || !g.team2Tid) continue
      const lo = Math.min(Number(g.team1Tid), Number(g.team2Tid))
      const hi = Math.max(Number(g.team1Tid), Number(g.team2Tid))
      existingCCByPair.set(`${lo}-${hi}`, g)
    }

    // Conference championship games are played in week 14 or 15 (depending
    // on the year), at a neutral site, between two teams in the same
    // conference. All three signals together are a strong identifier — a
    // regular conference game is never neutral, and non-conference games
    // never share a conference. Use this to PROMOTE the imported row to
    // gameType=CONFERENCE_CHAMPIONSHIP so the rest of the app stops
    // treating it as a regular Saturday game.
    const isConferenceChampionshipCandidate = (homeConf, awayConf, neutral) => (
      !!homeConf && !!awayConf && homeConf === awayConf && !!neutral && weekNum >= 14
    )

    // Walk parsed rows, build a Map keyed by sorted-tid pair so duplicates collapse
    const newByPair = new Map()
    for (const row of weeklyGames) {
      const homeTid = Number(row.homeTid)
      const awayTid = Number(row.awayTid)
      if (!homeTid || !awayTid || homeTid === awayTid) continue
      if (typeof row.homeScore !== 'number' || typeof row.awayScore !== 'number') continue

      const lo = Math.min(homeTid, awayTid)
      const hi = Math.max(homeTid, awayTid)
      const key = `${lo}-${hi}`

      // Preserve user-team games that already have scores
      const existing = existingByPair.get(key)
      if (isUserGameWithScores(existing)) continue

      // Use HOME as team1 so home/away orientation is preserved
      const team1Tid = homeTid
      const team2Tid = awayTid
      const team1Score = row.homeScore
      const team2Score = row.awayScore
      const homeTeamTid = row.neutral ? null : homeTid
      const winnerTid = team1Score === team2Score
        ? null
        : (team1Score > team2Score ? team1Tid : team2Tid)

      // Infer conference matchup so confWins/confLosses update too
      const homeAbbr = getAbbrFromTid(dynasty.teams, team1Tid) || row.homeTeam
      const awayAbbr = getAbbrFromTid(dynasty.teams, team2Tid) || row.awayTeam
      const homeConf = homeAbbr ? getTeamConference(homeAbbr, customConferences) : null
      const awayConf = awayAbbr ? getTeamConference(awayAbbr, customConferences) : null
      const isConferenceGame = !!(homeConf && awayConf && homeConf === awayConf)

      // If a conference championship game already exists for this
      // matchup (entered through the dedicated CC flow), skip the
      // weekly-scores row entirely — the existing record is the
      // source of truth and gets updated via that flow, not this one.
      if (existingCCByPair.has(key)) continue

      // Otherwise, promote rows that match the CC signature so they
      // land with the correct gameType and isConferenceChampionship
      // flag. The conference field carries the CC's parent league for
      // downstream pages (CC History, CFP auto-bid logic, etc.).
      const isConfChampImport = isConferenceChampionshipCandidate(homeConf, awayConf, row.neutral)

      // Ranks: column A = home (team1), column D = away (team2).
      // These represent each team's rank for the user's CURRENT
      // dynasty week — that's what CFB26 shows in the schedule
      // view at all times, regardless of which past week the user
      // is reviewing. The rank pass below saves them into
      // rankByWeek[currentWeek] for each team. The Week N game's
      // own stored team1Rank / team2Rank is filled separately from
      // each team's rankByWeek[N] (set when the prior week's sheet
      // was saved with currentWeek == N).
      const homeRankRaw = row.homeRank
      const awayRankRaw = row.awayRank
      const homeCurrentWeekRank = (typeof homeRankRaw === 'number' && homeRankRaw >= 1 && homeRankRaw <= 25) ? homeRankRaw : null
      const awayCurrentWeekRank = (typeof awayRankRaw === 'number' && awayRankRaw >= 1 && awayRankRaw <= 25) ? awayRankRaw : null

      newByPair.set(key, {
        id: existing?.id || idForGame(homeTid, awayTid),
        year: yearNum,
        week: weekNum,
        gameType: isConfChampImport ? GAME_TYPES.CONFERENCE_CHAMPIONSHIP : GAME_TYPES.REGULAR,
        team1Tid,
        team2Tid,
        team1Score,
        team2Score,
        team1Rank: null, // filled below from rankByWeek[weekNum]
        team2Rank: null,
        homeTeamTid,
        winnerTid,
        isConferenceGame,
        ...(isConfChampImport ? { isConferenceChampionship: true, conference: homeConf } : {}),
        isPlayed: true,
        source: 'weekly-scores',
        // Stash the user-entered current-week ranks so the rank
        // pass below can write them to rankByWeek[currentWeek].
        // Stripped from the saved record before it lands.
        _team1CurrentWeekRank: homeCurrentWeekRank,
        _team2CurrentWeekRank: awayCurrentWeekRank,
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    }

    // Build updated games array: keep everything except weekly-scores rows for
    // this year+week that are being replaced. User-team scores stay because
    // we excluded them from newByPair above.
    //
    // We also collect the IDs of dropped weekly-scores rows so the
    // cloud fast-path can DELETE them from the subcollection in the
    // same writeBatch as the insert (otherwise stale rows would
    // linger in Firestore even after the local array no longer
    // references them).
    const droppedWeeklyIds = []
    const filtered = existingGames.filter(g => {
      if (!g) return false
      if (Number(g.year) !== yearNum || Number(g.week) !== weekNum) return true
      if (!g.team1Tid || !g.team2Tid) return true
      // Always keep user-team games (they have their own entry path)
      if (Number(g.team1Tid) === userTid || Number(g.team2Tid) === userTid) return true
      const lo = Math.min(Number(g.team1Tid), Number(g.team2Tid))
      const hi = Math.max(Number(g.team1Tid), Number(g.team2Tid))
      // Drop only previously-weekly-scores entries that aren't in the new set;
      // and drop ones in the new set so the new version takes their place
      if (g.source === 'weekly-scores') {
        if (g.id) droppedWeeklyIds.push(g.id)
        return false
      }
      // Keep non-weekly entries (e.g. shells from schedule flow)
      const inNewSet = newByPair.has(`${lo}-${hi}`)
      if (inNewSet && g.id) droppedWeeklyIds.push(g.id)
      return !inNewSet
    })

    const newGamesArr = Array.from(newByPair.values())

    // ─── Rank pass ───────────────────────────────────────────────
    // Spec, in plain terms:
    //   1. The ranks the user entered alongside the Week N scores
    //      are each team's rank for the user's CURRENT dynasty
    //      week — that's what CFB26 shows in the schedule view at
    //      all times. Save those into rankByWeek[currentWeek] for
    //      each team.
    //   2. Each saved Week N game's own stored team1Rank /
    //      team2Rank is pulled from rankByWeek[N] for each team —
    //      the rank that was saved the previous week, when
    //      currentWeek was N.
    const currentWeek = Number(dynasty.currentWeek)
    const haveCurrentWeek = Number.isFinite(currentWeek) && currentWeek > 0

    const teamsCopy = { ...(dynasty.teams || {}) }
    const writeRankByWeek = (tid, weekKey, rank) => {
      if (tid == null || weekKey == null || typeof rank !== 'number' || rank < 1 || rank > 25) return
      const tidKey = String(tid)
      const team = teamsCopy[tidKey] || teamsCopy[tid] || {}
      const byYear = { ...(team.byYear || {}) }
      const yearKey = String(yearNum)
      const yearEntry = { ...(byYear[yearKey] || byYear[yearNum] || {}) }
      const rankByWeek = { ...(yearEntry.rankByWeek || {}) }
      rankByWeek[weekKey] = rank
      yearEntry.rankByWeek = rankByWeek
      byYear[yearKey] = yearEntry
      teamsCopy[tidKey] = { ...team, byYear }
    }
    const readRankByWeek = (tid, weekKey) => {
      if (tid == null || weekKey == null) return null
      const t = teamsCopy[String(tid)] || teamsCopy[tid]
      const rbw = t?.byYear?.[String(yearNum)]?.rankByWeek ?? t?.byYear?.[yearNum]?.rankByWeek
      if (!rbw) return null
      const v = rbw[weekKey] ?? rbw[String(weekKey)]
      if (typeof v !== 'number' || v < 1 || v > 25) return null
      return v
    }

    // (1a) Push user-entered ranks into rankByWeek[currentWeek] for
    // every team that played a game in this save.
    if (haveCurrentWeek) {
      for (const g of newGamesArr) {
        if (typeof g._team1CurrentWeekRank === 'number') writeRankByWeek(g.team1Tid, currentWeek, g._team1CurrentWeekRank)
        if (typeof g._team2CurrentWeekRank === 'number') writeRankByWeek(g.team2Tid, currentWeek, g._team2CurrentWeekRank)
      }
    }

    // (1b) Bye-week block. The AI also emits one row per ranked team
    // that didn't play this week, with the team's inferred new rank
    // (also a current-dynasty-week rank). Those go to the same
    // rankByWeek[currentWeek] slot, with two guards:
    //   - don't claim a slot a played team already wrote
    //   - don't overwrite a tid a played team already wrote (the
    //     prompt's worked example uses CLEM as a bye row and the
    //     AI sometimes copies that team in even when it played)
    const byeRanks = Array.isArray(weeklyGames?.byeRanks) ? weeklyGames.byeRanks : []
    if (haveCurrentWeek && byeRanks.length > 0) {
      const playedSlots = new Set()
      const playedTids = new Set()
      for (const g of newGamesArr) {
        if (typeof g._team1CurrentWeekRank === 'number') {
          playedSlots.add(g._team1CurrentWeekRank)
          if (g.team1Tid != null) playedTids.add(Number(g.team1Tid))
        }
        if (typeof g._team2CurrentWeekRank === 'number') {
          playedSlots.add(g._team2CurrentWeekRank)
          if (g.team2Tid != null) playedTids.add(Number(g.team2Tid))
        }
      }
      const seenByeRanks = new Set()
      for (const entry of byeRanks) {
        if (!entry || typeof entry.tid !== 'number') continue
        const r = entry.rank
        if (typeof r !== 'number' || r < 1 || r > 25) continue
        if (seenByeRanks.has(r)) continue
        if (playedSlots.has(r)) continue
        if (playedTids.has(Number(entry.tid))) continue
        seenByeRanks.add(r)
        writeRankByWeek(entry.tid, currentWeek, r)
      }
    }

    // (2) Each saved Week N game's stored rank is pulled from
    // rankByWeek[N] for each team — the rank saved the previous
    // week when the user was in Week N. Strip the stash fields.
    for (const g of newGamesArr) {
      g.team1Rank = readRankByWeek(g.team1Tid, weekNum)
      g.team2Rank = readRankByWeek(g.team2Tid, weekNum)
      delete g._team1CurrentWeekRank
      delete g._team2CurrentWeekRank
    }

    // Sync any current-week game record already on file (e.g., the
    // user's own game from the schedule flow) so its stored rank
    // matches the freshly-written rankByWeek[currentWeek]. Other
    // weeks' games are unaffected — their stored rank reflects what
    // rankByWeek held when each of those weeks was the current week.
    const updatedGames = [...filtered, ...newGamesArr].map(g => {
      if (!g || g.year == null) return g
      if (Number(g.year) !== yearNum) return g
      if (!haveCurrentWeek || Number(g.week) !== currentWeek) return g
      let next = g
      if (g.team1Tid != null) {
        const r = readRankByWeek(Number(g.team1Tid), currentWeek)
        if (r != null && r !== (typeof g.team1Rank === 'number' ? g.team1Rank : null)) {
          next = { ...next, team1Rank: r }
        }
      }
      if (g.team2Tid != null) {
        const r = readRankByWeek(Number(g.team2Tid), currentWeek)
        if (r != null && r !== (typeof g.team2Rank === 'number' ? g.team2Rank : null)) {
          next = { ...next, team2Rank: r }
        }
      }
      return next
    })

    // Track that this week's scores were entered (used by dashboard to-do)
    const existingTracker = dynasty.weeklyScoresEntered || {}
    const existingYearTracker = existingTracker[yearNum] || {}
    const updatedTracker = {
      ...existingTracker,
      [yearNum]: {
        ...existingYearTracker,
        [weekNum]: {
          enteredAt: new Date().toISOString(),
          gameCount: newGamesArr.length,
        }
      }
    }

    // Cloud fast path: write only the changed games (~60-130 inserts +
    // a handful of deletes for replaced rows) via a single writeBatch,
    // then update the main doc with non-games fields. Bypasses
    // updateDynasty's saveGamesToSubcollection, which rewrites EVERY
    // game in the subcollection on every weekly save and was the
    // source of the "Write stream exhausted" Firestore error on
    // multi-year dynasties.
    const looksLikeFirebaseId = typeof dynastyId === 'string' && dynastyId.length >= 20 && !/^\d+$/.test(dynastyId)
    const isCloudStorage = looksLikeFirebaseId || (dynasty.storageType === 'cloud' && user)

    if (isCloudStorage) {
      try {
        // Listener-skip guards so the snapshot doesn't undo our local
        // games array with a stale subcollection read.
        skipListenerUpdatesCountRef.current = Math.max(skipListenerUpdatesCountRef.current, 3)
        skipListenerTimestampRef.current = Date.now()
        lastGamesUpdateTimestampRef.current = Date.now()
        lastGamesUpdateDynastyIdRef.current = dynastyId

        // Step 1: targeted batch write for the changed games.
        // newGamesArr = inserts/replaces this save produced.
        // droppedWeeklyIds = stale rows being replaced or removed.
        await saveWeeklyGamesChanges(dynastyId, newGamesArr, droppedWeeklyIds)

        // Step 2: persist non-games fields via updateDynasty with
        // skipGamesSubcollection=true so the slow full-rewrite is
        // skipped. teams + weeklyScoresEntered land on the main doc.
        await updateDynasty(dynastyId, {
          teams: teamsCopy,
          weeklyScoresEntered: updatedTracker,
        }, { skipGamesSubcollection: true })

        // Step 3: sync local React state with the full updatedGames
        // array we already computed.
        const updatedDynasty = {
          ...dynasty,
          games: updatedGames,
          teams: teamsCopy,
          weeklyScoresEntered: updatedTracker,
          lastModified: Date.now(),
        }

        setDynasties(prev => prev.map(d =>
          String(d.id) === String(dynastyId) ? updatedDynasty : d
        ))

        if (String(currentDynasty?.id) === String(dynastyId)) {
          setCurrentDynasty(updatedDynasty)
        }

        lastGamesUpdateTimestampRef.current = Date.now()
        return newGamesArr
      } catch (error) {
        console.error('[saveWeeklyScores] Targeted batch write failed, falling back to full updateDynasty:', error)
        // Fall through to the legacy path below.
      }
    }

    // Legacy / local-storage path: full-array updateDynasty (writes to
    // IndexedDB on local; for cloud only reached if the targeted
    // batch above threw).
    await updateDynasty(dynastyId, {
      games: updatedGames,
      teams: teamsCopy,
      weeklyScoresEntered: updatedTracker,
    })

    return newGamesArr
  }

  // Save CFP games in unified format to games[] array
  // Handles all rounds: First Round, Quarterfinals, Semifinals, Championship
  // This is the single source of truth for CFP games - does NOT write to cfpResultsByYear
  // UPDATED: Now properly updates existing game shells created at seed entry time
  // FIXED: Now reads games from storage backend (not stale React state) to avoid race conditions
  const saveCFPGames = async (dynastyId, gamesData, year, roundType) => {
    if (blockIfReadOnly(dynastyId, 'save CFP games')) return
    // Use helper functions for consistent storage routing based on dynasty.storageType
    const dynasty = await findDynastyById(dynastyId)

    if (!dynasty) {
      return
    }

    // Get games using proper storage routing
    const latestGames = await getDynastyGames(dynasty)

    // Start with latest games from storage - we'll update shells in place
    let updatedGames = [...latestGames]

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

      // Resolve team tids (accept both tid and abbr inputs).
      // Pass dynasty so TB takeovers' current abbrs resolve to the
      // correct slot tids, not the static map's stale ones.
      const team1Tid = gameData.team1Tid || getTidFromAbbr(team1Abbr, dynasty)
      const team2Tid = gameData.team2Tid || getTidFromAbbr(team2Abbr, dynasty)

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
        }

        // PRIMARY: Find by slot ID
        if (expectedSlotId) {
          const expectedGameId = getCFPGameId(expectedSlotId, year)
          existingIndex = updatedGames.findIndex(g => g.id === expectedGameId)
        }

        // SECONDARY: Find by cfpSlot field
        if (existingIndex === -1 && expectedSlotId) {
          existingIndex = updatedGames.findIndex(g =>
            g.cfpSlot === expectedSlotId &&
            Number(g.year) === Number(year) &&
            g.isCFPQuarterfinal
          )
        }

        // TERTIARY: Find by bye seed team tid (in case shell doesn't have correct ID)
        if (existingIndex === -1 && team1Tid) {
          existingIndex = updatedGames.findIndex(g =>
            g.isCFPQuarterfinal &&
            Number(g.year) === Number(year) &&
            g.team1Tid === team1Tid // Bye seed team should be in team1 position
          )
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
        }

        // PRIMARY: Find by slot ID
        if (expectedSlotId) {
          const expectedGameId = getCFPGameId(expectedSlotId, year)
          existingIndex = updatedGames.findIndex(g => g.id === expectedGameId)
        }

        // SECONDARY: Find by cfpSlot field
        if (existingIndex === -1 && expectedSlotId) {
          existingIndex = updatedGames.findIndex(g =>
            g.cfpSlot === expectedSlotId &&
            Number(g.year) === Number(year) &&
            g.isCFPSemifinal
          )
        }

        // TERTIARY: Find by team tids
        if (existingIndex === -1 && (team1Tid || team2Tid)) {
          existingIndex = updatedGames.findIndex(g =>
            g.isCFPSemifinal &&
            Number(g.year) === Number(year) &&
            ((team1Tid && (g.team1Tid === team1Tid || g.team2Tid === team1Tid)) ||
             (team2Tid && (g.team1Tid === team2Tid || g.team2Tid === team2Tid)))
          )
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
      } else {
        // No shell exists - add new game (fallback for legacy data)
        unifiedGame.createdAt = new Date().toISOString()
        updatedGames.push(unifiedGame)
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
    if (blockIfReadOnly(dynastyId, 'save conference championships')) return
    console.log('[saveCPUCC] Called with:', { dynastyId, championships, year })
    // Use helper functions for consistent storage routing based on dynasty.storageType
    const dynasty = await findDynastyById(dynastyId)

    if (!dynasty) {
      console.error('[saveCPUCC] Dynasty not found:', dynastyId)
      return
    }

    console.log('[saveCPUCC] Found dynasty:', dynasty.teamName)
    // Get games using proper storage routing
    const existingGames = await getDynastyGames(dynasty)
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
      if (g.userTeam && getTidFromAbbr(g.userTeam, dynasty) === userTidForYear) return true
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
                          (g.userTeam && getTidFromAbbr(g.userTeam, dynasty) === userTidForYear)
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
        // Resolve team tids (accept both tid and abbr inputs).
        const team1Tid = cc.team1Tid || getTidFromAbbr(cc.team1, dynasty)
        const team2Tid = cc.team2Tid || getTidFromAbbr(cc.team2, dynasty)

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
                                  (game.userTeam && getTidFromAbbr(game.userTeam, dynasty) === userTidForYear)
            const existingIsUserGame = (deduplicatedGames[existingIdx].team1Tid === userTidForYear ||
                                       deduplicatedGames[existingIdx].team2Tid === userTidForYear) ||
                                      (deduplicatedGames[existingIdx].userTeam &&
                                       getTidFromAbbr(deduplicatedGames[existingIdx].userTeam, dynasty) === userTidForYear)

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
    if (blockIfReadOnly(dynastyId, 'advance week')) return
    console.log('[advanceWeek] ========== STARTING ==========')
    console.log('[advanceWeek] dynastyId:', dynastyId)
    console.log('[advanceWeek] classConfirmations:', classConfirmations)

    // CRITICAL: Set phase transition flag to prevent listener from overwriting data
    phaseTransitionInProgressRef.current = true
    console.log('[advanceWeek] Phase transition flag SET')

    // IMPORTANT: Prefer currentDynasty over dynasties.find() to get the latest in-memory data
    // This ensures we don't lose player edits that haven't been persisted yet
    const dynasty = (String(currentDynasty?.id) === String(dynastyId))
      ? currentDynasty
      : dynasties.find(d => d.id === dynastyId)
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

      // Clear previousJobData here — once the user enters regular season they
      // are locked into the new team. Holding the snapshot through preseason
      // keeps the full revert chain (preseason ← offseason wk8 ← … ← postseason
      // wk5) walkable; the OLD code cleared at offseason wk1 → wk2, which
      // silently broke the chain past wk1.
      if (dynasty.previousJobData) {
        additionalUpdates.previousJobData = null
      }

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

      // Unlink (but do NOT delete) the preseason Google Sheet when advancing.
      // Reason: advance is reversible via revertWeek, but deleting the Sheet
      // from Drive is not. Leaving the file in Drive lets the user recover or
      // re-import if they revert. Cleanup is the user's responsibility.
      //
      // Snapshot the IDs into prevPreseasonSheetIds so revertWeek (regular wk0
      // → preseason wk0) can restore them — without the snapshot, the IDs
      // were lost on advance and the user had to re-import the same Sheets.
      const prevPreseasonSheetIds = {
        googleSheetId: dynasty.googleSheetId ?? null,
        googleSheetUrl: dynasty.googleSheetUrl ?? null,
        scheduleSheetId: dynasty.scheduleSheetId ?? null,
        rosterSheetId: dynasty.rosterSheetId ?? null,
        rosterEditSheetId: dynasty.rosterEditSheetId ?? null,
      }
      const hasAnySheetId = Object.values(prevPreseasonSheetIds).some(v => v != null)
      if (hasAnySheetId) {
        additionalUpdates.prevPreseasonSheetIds = prevPreseasonSheetIds
      }
      if (dynasty.googleSheetId) {
        additionalUpdates.googleSheetId = null
        additionalUpdates.googleSheetUrl = null
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

      // Build complete staff including user's position. Single source of
      // truth for the owner's name — getCoachNameForUid pulls memberLabels
      // first, falls back to dynasty.coachName for pre-migration dynasties.
      const completeStaff = { ...currentStaff }
      const ownerNameForLock = getCoachNameForUid(dynasty, dynasty.userId, '')
      if (ownerNameForLock && dynasty.coachPosition) {
        if (dynasty.coachPosition === 'HC') {
          completeStaff.hcName = ownerNameForLock
        } else if (dynasty.coachPosition === 'OC') {
          completeStaff.ocName = ownerNameForLock
        } else if (dynasty.coachPosition === 'DC') {
          completeStaff.dcName = ownerNameForLock
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
      // Read from conferenceChampionshipDataByYear (where Dashboard saves it)
      const ccDataForYear = dynasty.conferenceChampionshipDataByYear?.[dynasty.currentYear] || {}
      const pendingFiring = ccDataForYear.pendingFiring
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

        // Write to conferenceChampionshipDataByYear (where Dashboard reads it)
        const existingByYear = dynasty.conferenceChampionshipDataByYear || {}
        additionalUpdates.conferenceChampionshipDataByYear = {
          ...existingByYear,
          [dynasty.currentYear]: {
            ...ccDataForYear,
            firingCoordinators: true,
            coordinatorToFire: pendingFiring,
            firedOCName,
            firedDCName
          }
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
        // All lookups go through dynasty.teams[tid] — the only source of truth.
        const newTeamName = getTeamName(newJobData.team, dynasty.teams)
        const newTeamAbbr = getAbbrFromTeamName(newJobData.team, dynasty.teams) || newJobData.team
        const newConference = getTeamConference(newTeamAbbr, null, dynasty.teams)

        // REVERT SUPPORT: Save previous job data so we can restore on revert.
        // Captures ENOUGH state for revertWeek to fully reverse this job swap:
        //   - Root-level dynasty fields (teamName, schedule, ratings, staff…)
        //   - The minimal teams-map slice we're about to flip via
        //     applyPendingUserTeam (so revert can put userId/pendingUserId back)
        //   - memberTeams/memberTeamHistory[year] snapshots
        //   - The pids/game-ids that get legacy-team-tagged below (so revert
        //     can untag exactly those and not touch real tags)
        // Pre-collect the pid/id lists in single passes that mirror the
        // tagging filters used below.
        const _existingPlayersForSnapshot = dynasty.players || []
        const _legacyTaggedPlayerPids = []
        for (const p of _existingPlayersForSnapshot) {
          if (p.team) continue
          if (p.isHonorOnly) continue
          if (p.pid) _legacyTaggedPlayerPids.push(p.pid)
        }
        const _existingGamesForSnapshot = dynasty.games || []
        const _legacyTaggedGameIds = []
        for (const g of _existingGamesForSnapshot) {
          if (g.userTeam) continue
          if (g.team1 && g.team2) continue
          if (g.cfpSlot) continue
          if (g.team1Tid && g.team2Tid) continue
          if (g.id) _legacyTaggedGameIds.push(g.id)
        }
        // Capture the pre-flip team-flag slice for the two affected tids so
        // revert can put userId/pendingUserId/coachPosition back exactly.
        const _oldUserTidForSnapshot = dynasty.currentTid != null ? Number(dynasty.currentTid) : null
        const _newUserTidForSnapshot = getTidFromTeamName(newTeamName, dynasty.teams)
        const _teamsSliceForSnapshot = {}
        if (_oldUserTidForSnapshot != null && dynasty.teams?.[_oldUserTidForSnapshot]) {
          const t = dynasty.teams[_oldUserTidForSnapshot]
          _teamsSliceForSnapshot[_oldUserTidForSnapshot] = {
            userId: t.userId ?? null,
            pendingUserId: t.pendingUserId ?? null,
            coachPosition: t.coachPosition ?? null,
          }
        }
        if (_newUserTidForSnapshot != null && dynasty.teams?.[_newUserTidForSnapshot]) {
          const t = dynasty.teams[_newUserTidForSnapshot]
          _teamsSliceForSnapshot[_newUserTidForSnapshot] = {
            userId: t.userId ?? null,
            pendingUserId: t.pendingUserId ?? null,
            coachPosition: t.coachPosition ?? null,
          }
        }
        // memberTeamHistory snapshot for the year that just ended — we'll
        // overwrite this entry on advance, so capture it for revert. Same
        // for memberTeams (the swap is full-list).
        const _memberTeamHistorySnapshot =
          dynasty.memberTeamHistory != null
            ? JSON.parse(JSON.stringify(dynasty.memberTeamHistory))
            : null
        const _memberTeamsSnapshot =
          dynasty.memberTeams != null
            ? JSON.parse(JSON.stringify(dynasty.memberTeams))
            : null
        // Snapshot the OLD team's pre-existing byYear[currentYear] slice
        // so revert can decide whether to drop the entry entirely (it
        // didn't exist) or restore the prior content.
        const _oldTeamByYearSnapshot = (
          _oldUserTidForSnapshot != null &&
          dynasty.teams?.[_oldUserTidForSnapshot]?.byYear?.[dynasty.currentYear]
        )
          ? JSON.parse(JSON.stringify(dynasty.teams[_oldUserTidForSnapshot].byYear[dynasty.currentYear]))
          : null

        additionalUpdates.previousJobData = {
          teamName: dynasty.teamName,
          currentTid: dynasty.currentTid,
          coachPosition: dynasty.coachPosition || 'HC',
          conference: dynasty.conference,
          schedule: dynasty.schedule,
          teamRatings: dynasty.teamRatings,
          coachingStaff: dynasty.coachingStaff,
          googleSheetId: dynasty.googleSheetId,
          googleSheetUrl: dynasty.googleSheetUrl,
          preseasonSetup: dynasty.preseasonSetup,
          newJobData: newJobData, // Save the accepted job offer to restore on revert
          // ----- richer snapshots for full revert reversal -----
          oldUserTid: _oldUserTidForSnapshot,
          newUserTid: _newUserTidForSnapshot,
          teamsSlice: _teamsSliceForSnapshot,
          memberTeams: _memberTeamsSnapshot,
          memberTeamHistory: _memberTeamHistorySnapshot,
          legacyTaggedPlayerPids: _legacyTaggedPlayerPids,
          legacyTaggedGameIds: _legacyTaggedGameIds,
          oldTeamByYearForCurrentYear: _oldTeamByYearSnapshot,
          // The year on which the swap happened (= old-team's last season)
          // so revert can target byYear[year] correctly.
          swapYear: dynasty.currentYear,
        }

        // Calculate record at current team for this stint. Tid match is
        // the source of truth — survives teambuilder team renames since
        // tid is stable. Abbr/teamName checks remain as legacy fallbacks
        // for very old games saved before tids were stored on games.
        const currentTid = dynasty.currentTid != null ? Number(dynasty.currentTid) : null
        const currentTeamGames = (dynasty.games || []).filter(g => {
          if (currentTid != null && (
            Number(g.userTid) === currentTid ||
            Number(g.team1Tid) === currentTid ||
            Number(g.team2Tid) === currentTid
          )) return true
          if (g.userTeam === dynasty.teamName) return true
          if (g.userTeam === getCurrentTeamAbbr(dynasty)) return true
          // Legacy games without userTeam (not CPU games which have team1/team2)
          if (!g.userTeam && !g.team1 && !g.team2) return true
          return false
        })
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

        // DEPRECATED: dynasty.coachingHistory is the legacy owner-only
        // stint array. Same info is now derivable per-uid from
        // memberTeamHistory via getCoachStints (used by the Coaches
        // leaderboard, Members page row sub-line, and TeamYear's
        // user-record block). Kept as a write here for backward compat
        // with the revert flow's pop logic and any unmigrated reader;
        // safe to delete once no consumer remains.
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
          // CFP game shells don't need userTeam - they're identified by cfpSlot or team1Tid/team2Tid
          if (g.cfpSlot) return g
          if (g.team1Tid && g.team2Tid) return g
          // Tag legacy user game with the current team
          return { ...g, userTeam: currentTeamAbbr }
        })
        additionalUpdates.games = taggedGames

        // TEAM-CENTRIC FIX: Store current schedule in team-centric structure before clearing
        const currentSchedule = dynasty.schedule || []
        const currentTeamTid = getTidFromAbbr(currentTeamAbbr, dynasty)

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
        // This handles the case where user selected a new job during Bowl Weeks.
        try {
          let teamsBeforeFlip = additionalUpdates.teams || dynasty.teams

          if (teamsBeforeFlip) {
            // FALLBACK: If newJobData says user is taking a new job but pendingUserId wasn't set
            // (e.g., job was selected before this code was added), set it now before flip
            if (newJobData?.takingNewJob && newJobData.team) {
              const hasPendingUser = Object.values(teamsBeforeFlip).some(t => t.pendingUserId === 'currentUser')
              if (!hasPendingUser) {
                const newTeamTid = getTidFromTeamName(newJobData.team, teamsBeforeFlip)
                if (newTeamTid && teamsBeforeFlip[newTeamTid]) {
                  teamsBeforeFlip = {
                    ...teamsBeforeFlip,
                    [newTeamTid]: {
                      ...teamsBeforeFlip[newTeamTid],
                      pendingUserId: 'currentUser',
                      coachPosition: newJobData.position || 'HC'
                    }
                  }
                }
              }
            }

            const teamsAfterFlip = applyPendingUserTeam(teamsBeforeFlip)
            additionalUpdates.teams = teamsAfterFlip

            // Sync the unified per-user team system to the job that
            // just went into effect. The TIMING above (when the flip
            // happens) is owned by applyPendingUserTeam — we just
            // mirror its result into memberTeams + memberTeamHistory
            // so the TeamSwitcher and Coach Career picker see the
            // change immediately.
            //
            // Order matters: stamp memberTeamHistory for the year
            // that just ended FIRST (with the OLD memberTeams, since
            // the user coached that year on the old team), then swap
            // memberTeams to the new team.
            const ownerUid = dynasty.userId
            const newUserTidEntry = Object.entries(teamsAfterFlip)
              .find(([_, t]) => t.userId === 'currentUser')
            if (ownerUid && newUserTidEntry) {
              const newUserTid = Number(newUserTidEntry[0])
              const seasonThatJustEnded = Number(dynasty.currentYear)
              if (Number.isFinite(seasonThatJustEnded)) {
                additionalUpdates.memberTeamHistory = snapshotAllMembersForYear(
                  dynasty,
                  seasonThatJustEnded,
                )
              }
              const existingMemberTeams = dynasty.memberTeams || {}
              const ownerCurrent = Array.isArray(existingMemberTeams[ownerUid])
                ? existingMemberTeams[ownerUid].map(Number)
                : []
              const swapped = ownerCurrent.length > 0
                ? [newUserTid, ...ownerCurrent.slice(1).filter(t => t !== newUserTid)]
                : [newUserTid]
              additionalUpdates.memberTeams = {
                ...existingMemberTeams,
                [ownerUid]: swapped,
              }
            }
          }
        } catch (err) {
          console.error('Error applying pending user team:', err)
        }

        // Clear newJobData
        additionalUpdates.newJobData = null
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
      const wasOnTeamLastSeason = (player) => {
        return isPlayerOnRoster(player, teamTid, previousSeasonYear)
      }

      // Helper to check if player is leaving. Reads BOTH the legacy
      // movements[] array AND the v2 movementByYear map — after the v2
      // migration, movements[] is removed and only movementByYear survives.
      // This caused transferred/graduated players to get silently carried
      // over on every year flip because the old check missed them.
      const isPlayerLeaving = (player) => {
        const legacyMovements = Array.isArray(player.movements) ? player.movements : []

        // Recommit override: if they recommitted after entering the portal
        // that same year, they aren't leaving — check both formats.
        const movementByYearForPrev =
          player.movementByYear?.[previousSeasonYear] ||
          player.movementByYear?.[String(previousSeasonYear)]
        const hasRecommitInLegacy = legacyMovements.some(m =>
          (m.type === 'recommit' || m.type === 'recommitted') &&
          Number(m.year) === previousSeasonYear
        )
        const hasRecommitInV2 =
          movementByYearForPrev?.type === 'recommit' ||
          movementByYearForPrev?.type === 'recommitted'
        if (hasRecommitInLegacy || hasRecommitInV2) return false

        if (leavingPids.has(player.pid)) return true
        if (player.name && leavingNames.has(player.name.toLowerCase().trim())) return true

        // Legacy movements[] departure check.
        const hasLegacyDeparture = legacyMovements.some(m =>
          (m.type === 'departure' || m.type === 'entered_portal' || m.type === 'transfer' ||
           m.type === 'transferred_out' || m.type === 'graduated' || m.type === 'declared_for_draft' ||
           m.type === 'encouraged_to_transfer') &&
          Number(m.year) === previousSeasonYear
        )
        if (hasLegacyDeparture) return true

        // v2 movementByYear departure check. Any departure on the previous
        // season year means they're leaving — irrespective of which team
        // they departed from.
        const byYearDepartureTypes = new Set([
          'departure', 'entered_portal', 'transfer', 'transferred_out',
          'graduated', 'declared_for_draft', 'encouraged_to_transfer',
        ])
        const v2DepartureShapes = new Set(['transfer_out', 'graduated', 'pro_draft'])
        const hasV2Departure = !!movementByYearForPrev && (
          movementByYearForPrev.type === 'departure' ||
          byYearDepartureTypes.has(movementByYearForPrev.type) ||
          v2DepartureShapes.has(movementByYearForPrev.departure)
        )
        if (hasV2Departure) return true

        // ALSO: a departure in ANY prior year (not just previousSeasonYear)
        // should still stop carry-over. If Daevon transferred in 2032 and
        // someone advances from 2033 to 2034, his previousSeasonYear-based
        // check above misses him — but he should obviously stay gone.
        // Only counts as "still gone" if there's no arrival / recommit in
        // a year >= the departure year.
        const allV2Entries = Object.entries(player.movementByYear || {})
        let earliestDeparture = null
        for (const [yStr, m] of allV2Entries) {
          const y = Number(yStr)
          if (!Number.isFinite(y)) continue
          const isDep =
            m?.type === 'departure' ||
            byYearDepartureTypes.has(m?.type) ||
            v2DepartureShapes.has(m?.departure)
          if (isDep && (earliestDeparture == null || y < earliestDeparture)) {
            earliestDeparture = y
          }
        }
        for (const m of legacyMovements) {
          if (!m) continue
          const y = Number(m.year)
          if (!Number.isFinite(y)) continue
          const isDep =
            m.type === 'departure' || m.type === 'entered_portal' || m.type === 'transfer' ||
            m.type === 'transferred_out' || m.type === 'graduated' ||
            m.type === 'declared_for_draft' || m.type === 'encouraged_to_transfer'
          if (isDep && (earliestDeparture == null || y < earliestDeparture)) {
            earliestDeparture = y
          }
        }
        if (earliestDeparture != null && earliestDeparture <= previousSeasonYear) {
          // They departed at some point on or before the year that just
          // ended. Did they ever come back (recommit or arrival AFTER the
          // departure)?
          const arrivalTypes = new Set(['recruited', 'transfer', 'portal_in', 'added', 'recommit', 'recommitted'])
          const v2ArrivalShapes = new Set(['recruit', 'transfer_in', 'walk_on', 'juco'])
          const cameBackAfter = (y) => y > earliestDeparture
          const returnedViaLegacy = legacyMovements.some(m =>
            (arrivalTypes.has(m?.type) || m?.type === 'recommit') && cameBackAfter(Number(m.year))
          )
          const returnedViaV2 = allV2Entries.some(([yStr, m]) => {
            const y = Number(yStr)
            if (!cameBackAfter(y)) return false
            if (m?.type === 'recommit' || m?.type === 'recommitted') return true
            if (m?.type === 'arrival') return true
            if (v2ArrivalShapes.has(m?.arrival)) return true
            return false
          })
          if (!returnedViaLegacy && !returnedViaV2) return true
        }

        return false
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

          // ========== SIMPLE AGING FOR OTHER TEAM PLAYERS ==========
          // These players aren't on the user's team, so apply simple linear progression
          // No redshirt logic - just advance class and graduate seniors

          // CRITICAL: A CPU-team player who transferred out / entered the
          // portal / graduated / declared for the draft must NOT be carried
          // forward to nextYear on their old team — otherwise they reappear
          // on that roster the next season ("guys off team finding way back
          // on roster"). isPlayerLeaving inspects movementByYear AND legacy
          // movements[] for any departure on or before previousSeasonYear
          // that wasn't followed by an arrival/recommit, so it correctly
          // catches transfers regardless of which team's roster the player
          // was on.
          if (isPlayerLeaving(player)) {
            return player
          }

          const otherTeamClass = player.year ||
            player.classByYear?.[previousSeasonYear] ||
            player.classByYear?.[String(previousSeasonYear)]

          // Check if player is graduating (Sr or RS Sr)
          if (otherTeamClass === 'Sr' || otherTeamClass === 'RS Sr') {
            // Graduate this player - don't add next year to teamsByYear
            return player
          }

          // Not graduating - advance their class
          const newOtherClass = CLASS_PROGRESSION[otherTeamClass] || otherTeamClass

          // Get their current team tid from teamsByYear
          const otherTeamTid = player.teamsByYear?.[previousSeasonYear] ||
                         player.teamsByYear?.[String(previousSeasonYear)] ||
                         player.team

          return {
            ...player,
            year: newOtherClass,
            classByYear: {
              ...(player.classByYear || {}),
              [nextYear]: newOtherClass
            },
            ...(otherTeamTid ? {
              teamsByYear: {
                ...(player.teamsByYear || {}),
                [nextYear]: otherTeamTid
              }
            } : {}),
            ...(player.devTrait ? {
              devTraitByYear: {
                ...(player.devTraitByYear || {}),
                [nextYear]: player.devTrait
              }
            } : {}),
            ...(player.overall ? {
              overallByYear: {
                ...(player.overallByYear || {}),
                [nextYear]: player.overall
              }
            } : {})
          }
        }

        // Check if player is leaving
        if (isPlayerLeaving(player)) {
          notCarriedOver++
          // Don't add next year to teamsByYear - player is leaving
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

        // Add teamsByYear entry for next year and update class + carry forward dev trait and overall
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
          },
          ...(player.devTrait ? {
            devTraitByYear: {
              ...(player.devTraitByYear || {}),
              [nextYear]: player.devTrait
            }
          } : {}),
          ...(player.overall ? {
            overallByYear: {
              ...(player.overallByYear || {}),
              [nextYear]: player.overall
            }
          } : {})
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
      let carryoverMap = null
      if (prevYearConferences && Object.keys(prevYearConferences).length > 0) {
        console.log('[advanceWeek] Carrying over custom conferences from', previousSeasonYear, 'to', nextYear)
        additionalUpdates.customConferencesByYear = {
          ...(dynasty.customConferencesByYear || {}),
          [nextYear]: prevYearConferences
        }
        additionalUpdates.customConferences = prevYearConferences
        carryoverMap = prevYearConferences
      } else if (dynasty.customConferences && Object.keys(dynasty.customConferences).length > 0) {
        console.log('[advanceWeek] Carrying over legacy custom conferences to', nextYear)
        additionalUpdates.customConferencesByYear = {
          ...(dynasty.customConferencesByYear || {}),
          [nextYear]: dynasty.customConferences
        }
        carryoverMap = dynasty.customConferences
      }

      // Fan the carry-over out to each team's per-year conference
      // field so the new authoritative store gets the same data the
      // legacy stores received above. Local-storage merge — additional
      // Updates is just a plain object that updateDynasty applies.
      if (carryoverMap) {
        const { localPatch } = buildPerTeamConferencePatch(dynasty, nextYear, carryoverMap)
        if (localPatch.teams) {
          additionalUpdates.teams = {
            ...(dynasty.teams || {}),
            ...(additionalUpdates.teams || {}),
            ...localPatch.teams,
          }
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
            const playerTeamTid = typeof player.team === 'number' ? player.team : getTidFromAbbr(player.team, dynasty)
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

      // Clear the advanceToNewSeason snapshot — past wk8 the user is in
      // preseason and can't revert through that path anyway (revert from
      // preseason wk0 jumps back to offseason wk8, where the snapshot
      // already lived during that earlier wk7→wk8 advance).
      additionalUpdates.prevAdvanceToNewSeasonSnapshot = null

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

    // Debug: Log if games are being updated and count CFP games
    if (additionalUpdates.games) {
      const cfpGames = additionalUpdates.games.filter(g => g.cfpSlot || g.isCFPFirstRound || g.isCFPQuarterfinal || g.isCFPSemifinal || g.isCFPChampionship)
      console.log('[advanceWeek] Games in update:', additionalUpdates.games.length, 'CFP games:', cfpGames.length)
    } else {
      const currentCfpGames = (dynasty.games || []).filter(g => g.cfpSlot || g.isCFPFirstRound || g.isCFPQuarterfinal || g.isCFPSemifinal || g.isCFPChampionship)
      console.log('[advanceWeek] NOT updating games array. Current CFP games:', currentCfpGames.length)
    }

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
    } finally {
      // CRITICAL: Clear phase transition flag after completion (success or error)
      // Small delay to ensure Firestore updates have propagated
      setTimeout(() => {
        phaseTransitionInProgressRef.current = false
        console.log('[advanceWeek] Phase transition flag CLEARED')
      }, 1000)
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
    if (blockIfReadOnly(dynastyId, 'advance to new season')) return
    // CRITICAL: Set phase transition flag to prevent listener from overwriting data
    phaseTransitionInProgressRef.current = true
    console.log('[advanceToNewSeason] Phase transition flag SET')

    // IMPORTANT: Prefer currentDynasty over dynasties.find() to get the latest in-memory data
    // This ensures we don't lose player edits that haven't been persisted yet
    const dynasty = (String(currentDynasty?.id) === String(dynastyId))
      ? currentDynasty
      : dynasties.find(d => d.id === dynastyId)
    if (!dynasty) {
      phaseTransitionInProgressRef.current = false
      return
    }

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
      return getTidFromAbbr(value, dynasty) === teamTid
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
      const playerTeamFieldTid = typeof player.team === 'number' ? player.team : getTidFromAbbr(player.team, dynasty)
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
          teamsByYear: updatedTeamsByYear,
          movementByYear: {
            ...(player.movementByYear || {}),
            // Canonical v2 — legacy 'encouraged_to_transfer' was being
            // converted to this exact shape by syncDerivedFieldsFromV2 on
            // every save. Write it directly to skip the round-trip.
            [previousSeasonYear]: {
              type: 'departure',
              departure: 'transfer_out',
              toTid: null,
              reason: 'Encouraged Transfer',
            }
          }
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

      // Check for RS Sr players not in playersLeaving - auto-graduate them.
      // IMPORTANT: Only auto-graduate if they were ALREADY RS Sr in the
      // previous season (before Signing Day class progression). Players
      // who just became RS Sr should play next season.
      //
      // Movement is written to canonical v2 movementByYear directly. The
      // legacy movements[] array is stripped by syncDerivedFieldsFromV2 on
      // every save, so the previous parallel write was dead code AND used
      // a non-canonical shape that the heal then converted on save.
      const previousSeasonClass = player.classByYear?.[previousSeasonYear]
      if (previousSeasonClass === 'RS Sr' && !player.isRecruit) {
        const existingForYear = player.movementByYear?.[previousSeasonYear]
          || player.movementByYear?.[String(previousSeasonYear)]
        const alreadyGraduated = existingForYear?.type === 'departure'
          && existingForYear?.departure === 'graduated'
        if (alreadyGraduated) return player
        return {
          ...player,
          movementByYear: {
            ...(player.movementByYear || {}),
            [previousSeasonYear]: { type: 'departure', departure: 'graduated' }
          }
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
        classByYear: updatedClassByYear,
        ...(player.devTrait ? {
          devTraitByYear: {
            ...(player.devTraitByYear || {}),
            [currentSeasonYear]: player.devTrait
          }
        } : {}),
        ...(player.overall ? {
          overallByYear: {
            ...(player.overallByYear || {}),
            [currentSeasonYear]: player.overall
          }
        } : {})
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

    // Snapshot of fields advanceToNewSeason mutates, so revertWeek's
    // wk8 ← wk7 path can restore the dynasty without heuristics. Stored on
    // the dynasty itself; cleared when offseason wk8 advances to preseason.
    const prevAdvanceToNewSeasonSnapshot = {
      isFirstYearOnCurrentTeam: dynasty.isFirstYearOnCurrentTeam ?? null,
      coachingStaff: dynasty.coachingStaff ?? null,
      pendingCoordinatorHires: dynasty.pendingCoordinatorHires ?? null,
      customConferences: dynasty.customConferences ?? null,
      teamAbbr,
      teamTid: teamTid ?? null,
      currentSeasonYear,
      hadCoachingStaffByTeamYearEntry: !!(
        existingCoachingStaffByTeamYear?.[teamAbbr]?.[currentSeasonYear] ||
        (teamTid && existingCoachingStaffByTeamYear?.[teamTid]?.[currentSeasonYear])
      ),
      hadPreseasonSetupByTeamYearEntry: !!(
        existingPreseasonSetup?.[teamAbbr]?.[currentSeasonYear] ||
        (teamTid && existingPreseasonSetup?.[teamTid]?.[currentSeasonYear])
      ),
      hadTeamsByYearEntry: !!(
        teamTid && dynasty.teams?.[teamTid]?.byYear?.[currentSeasonYear]
      ),
    }

    // Prepare updates
    const updates = {
      players: updatedPlayers,
      isFirstYearOnCurrentTeam: isFirstYearOnTeam,
      // Update main coaching staff with any pending hires
      coachingStaff: currentCoachingStaff,
      // Clear pending hires since we've applied them
      pendingCoordinatorHires: null,
      // Snapshot for revertWeek (wk8 ← wk7).
      prevAdvanceToNewSeasonSnapshot,
      // Store coaching staff for new year — dual-keyed (rename-safe).
      coachingStaffByTeamYear: {
        ...existingCoachingStaffByTeamYear,
        [teamAbbr]: {
          ...(existingCoachingStaffByTeamYear[teamAbbr] || {}),
          [currentSeasonYear]: currentCoachingStaff
        },
        ...(teamTid ? {
          [teamTid]: {
            ...(existingCoachingStaffByTeamYear[teamTid] || {}),
            [currentSeasonYear]: currentCoachingStaff
          }
        } : {})
      },
      // Initialize preseason setup for new year — dual-keyed (rename-safe).
      preseasonSetupByTeamYear: {
        ...existingPreseasonSetup,
        [teamAbbr]: {
          ...(existingPreseasonSetup[teamAbbr] || {}),
          [currentSeasonYear]: newYearPreseasonSetup
        },
        ...(teamTid ? {
          [teamTid]: {
            ...(existingPreseasonSetup[teamTid] || {}),
            [currentSeasonYear]: newYearPreseasonSetup
          }
        } : {})
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

    // Snapshot the just-ended season's per-user team assignments into
    // memberTeamHistory so the Coach Career page has a fixed record
    // for every member (including users who didn't reassign during the
    // year). Members-page writes already stamp the current year on
    // change; this catches the unchanged carry-forward case.
    if (Number.isFinite(previousSeasonYear)) {
      updates.memberTeamHistory = snapshotAllMembersForYear(dynasty, previousSeasonYear)
    }

    try {
      await updateDynasty(dynastyId, updates)
    } finally {
      // CRITICAL: Clear phase transition flag after completion
      // Small delay to ensure Firestore updates have propagated
      setTimeout(() => {
        phaseTransitionInProgressRef.current = false
        console.log('[advanceToNewSeason] Phase transition flag CLEARED')
      }, 1000)
    }
  }

  // Helper: delete BOTH numeric and string keys for a per-year map. Many
  // upstream writes go through Firestore (string keys via Object.keys) or
  // through code paths using numeric keys. Reverts that only delete one
  // shape leave stale data behind.
  const deleteYearKeys = (obj, year) => {
    if (!obj) return obj
    const next = { ...obj }
    delete next[year]
    delete next[String(year)]
    delete next[Number(year)]
    return next
  }

  const revertWeek = async (dynastyId) => {
    if (blockIfReadOnly(dynastyId, 'revert week')) return
    const dynasty = dynasties.find(d => d.id === dynastyId)
    if (!dynasty) return

    // Lock the listener so an in-flight Firestore tick can't clobber the
    // multi-field revert mid-write. Mirrors what advanceWeek does. Cleared
    // in the finally below (with the same 1s settle delay).
    phaseTransitionInProgressRef.current = true

    try {

    const { currentPhase, currentWeek, currentYear, startYear } = dynasty
    let prevWeek = currentWeek
    let prevPhase = currentPhase
    let prevYear = currentYear
    let additionalUpdates = {}

    // Phase structure:
    // - Preseason: Week 0
    // - Regular Season: Weeks 0-15 (16 game weeks; advance enters at wk0)
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
      // At Week 7→8, recruits were converted. We need to undo that:
      //   - Flip isRecruit back to true
      //   - Remove teamsByYear[currentYear] / classByYear[currentYear] that
      //     the conversion wrote. currentYear here is the upcoming season
      //     (post year-flip); those entries don't belong on recruit records.
      const players = dynasty.players || []
      const recruitingYear = prevYear
      const upcomingSeasonYear = currentYear
      const updatedPlayers = players.map(player => {
        const matchesRecruitYear =
          player.recruitYear === recruitingYear ||
          player.recruitYear === String(recruitingYear)
        if (!matchesRecruitYear) return player

        const nextTeamsByYear = { ...(player.teamsByYear || {}) }
        delete nextTeamsByYear[upcomingSeasonYear]
        delete nextTeamsByYear[String(upcomingSeasonYear)]

        const nextClassByYear = { ...(player.classByYear || {}) }
        delete nextClassByYear[upcomingSeasonYear]
        delete nextClassByYear[String(upcomingSeasonYear)]

        return {
          ...player,
          isRecruit: true,
          teamsByYear: nextTeamsByYear,
          classByYear: nextClassByYear,
        }
      })
      if (updatedPlayers.some((p, i) => p !== players[i])) {
        additionalUpdates.players = updatedPlayers
      }
    } else if (currentPhase === 'regular_season') {
      if (currentWeek <= 0) {
        // Regular Season Week 0 → Preseason Week 0
        // Advance enters regular_season at week 0 (preseason wk0 → reg wk0),
        // so wk0 is the boundary back to preseason. Older code used <=1 here
        // and silently sent wk1 reverts to preseason, skipping wk0 entirely.
        prevPhase = 'preseason'
        prevWeek = 0

        // Advance wrote coachTeamByYear[currentYear] when leaving preseason.
        // Roll it back so history doesn't carry a stamped record for a season
        // we haven't actually started yet.
        if (
          dynasty.coachTeamByYear?.[currentYear] != null ||
          dynasty.coachTeamByYear?.[String(currentYear)] != null
        ) {
          additionalUpdates.coachTeamByYear = deleteYearKeys(dynasty.coachTeamByYear, currentYear)
        }

        // Restore the preseason Sheet IDs that advance unlinked. The Sheets
        // themselves were never deleted from Drive (see comment in advance),
        // so re-attaching the IDs reconnects the user to their existing data.
        if (dynasty.prevPreseasonSheetIds) {
          const snap = dynasty.prevPreseasonSheetIds
          if (snap.googleSheetId != null) additionalUpdates.googleSheetId = snap.googleSheetId
          if (snap.googleSheetUrl != null) additionalUpdates.googleSheetUrl = snap.googleSheetUrl
          if (snap.scheduleSheetId != null) additionalUpdates.scheduleSheetId = snap.scheduleSheetId
          if (snap.rosterSheetId != null) additionalUpdates.rosterSheetId = snap.rosterSheetId
          if (snap.rosterEditSheetId != null) additionalUpdates.rosterEditSheetId = snap.rosterEditSheetId
          additionalUpdates.prevPreseasonSheetIds = null
        }
      } else {
        // Regular Season Week N → Regular Season Week N-1
        prevWeek = currentWeek - 1
      }
    } else if (currentPhase === 'conference_championship') {
      // Conference Championship Week 1 → Regular Season Week 15.
      // Advance fires CC when nextWeek > 15, so wk15 was the LAST regular
      // season week. Older code returned wk12 here and lost three weeks.
      prevPhase = 'regular_season'
      prevWeek = 15
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
    // Stats ARE auto-resynced at the end of revertWeek for game-playing
    // phases — see syncAllPlayersStats call in the finally section. Any
    // player.statsByYear inflation from a deleted box score is dropped on
    // resync since the rebuild reads only surviving games.
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

      // NOTE: Coordinator firing is EXECUTED at CC → postseason advance, not
      // at RS → CC advance. So reverting CC → RS has no firing to undo —
      // that restoration lives in the postseason wk1 → CC branch below.

      // Clear legacy CC data
      additionalUpdates.conferenceChampionshipData = null
      // Clear CC sheet ID
      additionalUpdates.conferenceChampionshipSheetId = null

      // Clear the locked coaching staff that advance stamped when moving from
      // regular season week 15 → CC. Leaving it in place would cause duplicate
      // stamped records on re-advance.
      const lockedTeamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName
      const existingLockedStaff = dynasty.lockedCoachingStaffByYear || {}
      if (existingLockedStaff[lockedTeamAbbr]?.[year]) {
        const nextTeamLocked = deleteYearKeys(existingLockedStaff[lockedTeamAbbr], year)
        // If the team's locked-staff map is now empty, drop the team key
        // entirely so we don't leave orphaned `{}` clutter behind.
        if (Object.keys(nextTeamLocked).length === 0) {
          const nextLocked = { ...existingLockedStaff }
          delete nextLocked[lockedTeamAbbr]
          additionalUpdates.lockedCoachingStaffByYear = nextLocked
        } else {
          additionalUpdates.lockedCoachingStaffByYear = {
            ...existingLockedStaff,
            [lockedTeamAbbr]: nextTeamLocked,
          }
        }
      }
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

        // Restore fired coordinators — the firing was EXECUTED at CC →
        // postseason advance (DynastyContext.advanceWeek line ~7371). If
        // the user reverts back into CC, the staff and the
        // coachingStaffEntered flag must be restored.
        const ccData = dynasty.conferenceChampionshipDataByYear?.[year]
        if (ccData && (ccData.firedOCName || ccData.firedDCName)) {
          const restoredStaff = { ...(dynasty.coachingStaff || {}) }
          if (ccData.firedOCName) restoredStaff.ocName = ccData.firedOCName
          if (ccData.firedDCName) restoredStaff.dcName = ccData.firedDCName
          additionalUpdates.coachingStaff = restoredStaff
          additionalUpdates['preseasonSetup.coachingStaffEntered'] = true

          // Clear the fired-coordinator markers — the user is back in CC
          // pre-firing and may set a different pendingFiring this time.
          additionalUpdates.conferenceChampionshipDataByYear = {
            ...(dynasty.conferenceChampionshipDataByYear || {}),
            [year]: {
              ...ccData,
              firedOCName: null,
              firedDCName: null,
              firingCoordinators: null,
              coordinatorToFire: null,
            },
          }
        }

        // Clear conference championships data
        additionalUpdates.conferenceChampionships = null
        const existingCCByYear = dynasty.conferenceChampionshipsByYear || {}
        additionalUpdates.conferenceChampionshipsByYear = { ...existingCCByYear, [year]: null }

        // Clear CFP Seeds for current year (shells will be recreated when re-entered).
        // Dual-keyed (some advance paths write tid-keyed structures too).
        const existingCFPSeeds = dynasty.cfpSeedsByYear || {}
        additionalUpdates.cfpSeedsByYear = { ...existingCFPSeeds, [year]: null }
        if (dynasty.cfpSeedsByYearTid) {
          additionalUpdates.cfpSeedsByYearTid = deleteYearKeys(dynasty.cfpSeedsByYearTid, year)
        }

        // Clear CFP Bowl Config for current year
        const existingBowlConfig = dynasty.cfpBowlConfigByYear || {}
        additionalUpdates.cfpBowlConfigByYear = { ...existingBowlConfig, [year]: null }

        // Clear bowl eligibility data — both legacy single-field and the
        // newer year/team-year stores.
        additionalUpdates.bowlEligibilityData = null
        if (dynasty.bowlEligibilityDataByYear) {
          additionalUpdates.bowlEligibilityDataByYear = deleteYearKeys(dynasty.bowlEligibilityDataByYear, year)
        }
        if (dynasty.bowlEligibilityDataByTeamYear) {
          const next = {}
          for (const [teamKey, byYear] of Object.entries(dynasty.bowlEligibilityDataByTeamYear)) {
            const stripped = deleteYearKeys(byYear || {}, year)
            if (Object.keys(stripped).length > 0) next[teamKey] = stripped
          }
          additionalUpdates.bowlEligibilityDataByTeamYear = next
        }

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

        // Remove Week 3 bowl games from games array (keep SF shells).
        // Check both legacy flag and new gameType enum so dynasties with mixed
        // shapes get fully cleaned.
        updatedGames = updatedGames.filter(g =>
          !((g.isBowlGame || g.gameType === GAME_TYPES.BOWL) &&
            isSameYear(g.year, year) && g.bowlWeek === 'week3')
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
      // Reverting within offseason - handle different week transitions.
      // tid is the source of truth; abbr is only kept for legacy team-year
      // stores that are still keyed by abbr (rename-safe writes also stamp
      // the tid copy, so we clear both — see deleteYearKeys helper).
      const teamTid = getCurrentTeamTid(dynasty)
      const teamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName

      if (dynasty.currentWeek === 1 && prevPhase === 'postseason') {
        // Reverting FROM offseason week 1 TO postseason week 5
        // Clear all data that was entered in offseason week 1

        // Clear players leaving data for this year (year-keyed)
        if (dynasty.playersLeavingByYear) {
          additionalUpdates.playersLeavingByYear = deleteYearKeys(
            dynasty.playersLeavingByYear, year
          )
        }

        // Clear players leaving by team year — Dashboard writes BOTH abbr
        // and tid keys (rename-safe). Older revert only cleared abbr; the
        // tid-keyed copy survived and team-tid reads got stale data.
        const existingByTeamYear = dynasty.playersLeavingByTeamYear || {}
        if (existingByTeamYear[teamAbbr] || (teamTid && existingByTeamYear[teamTid])) {
          additionalUpdates.playersLeavingByTeamYear = {
            ...existingByTeamYear,
            ...(existingByTeamYear[teamAbbr]
              ? { [teamAbbr]: deleteYearKeys(existingByTeamYear[teamAbbr], year) }
              : {}),
            ...(teamTid && existingByTeamYear[teamTid]
              ? { [teamTid]: deleteYearKeys(existingByTeamYear[teamTid], year) }
              : {}),
          }
        }

        // Clear teams[tid].byYear[year].playersLeaving (per-team byYear cache).
        if (teamTid && dynasty.teams?.[teamTid]?.byYear?.[year]?.playersLeaving) {
          const existingTeams = dynasty.teams
          const existingTeamData = existingTeams[teamTid] || {}
          const existingByYear = existingTeamData.byYear || {}
          const existingYearData = existingByYear[year] || {}
          const { playersLeaving, ...restYearData } = existingYearData
          additionalUpdates.teams = {
            ...(additionalUpdates.teams || existingTeams),
            [teamTid]: {
              ...existingTeamData,
              byYear: { ...existingByYear, [year]: restYearData },
            },
          }
        }

        // Clear per-player departure movements written by handlePlayersLeavingSave
        // and handleDraftResultsSave (both stamp movementByYear[year] with
        // departure types). Without this, players still show as
        // graduated/transferred/drafted in their profiles after revert.
        const advanceWrittenTypes = new Set([
          'graduated', 'declared_for_draft', 'encouraged_to_transfer',
          'transferred_out', 'departure', 'entered_portal', 'transfer',
        ])
        const v2DepartureShapes = new Set(['graduated', 'pro_draft', 'transfer_out'])
        const playersForCleanup = dynasty.players || []
        const cleanedPlayers = playersForCleanup.map(p => {
          const mvForYear =
            p.movementByYear?.[year] || p.movementByYear?.[String(year)]
          const isAdvanceWritten = mvForYear && (
            advanceWrittenTypes.has(mvForYear.type) ||
            v2DepartureShapes.has(mvForYear.departure)
          )
          const hasDraftFields = (p.draftYear === year || p.draftYear === String(year))
          if (!isAdvanceWritten && !hasDraftFields) return p
          let updated = { ...p }
          if (isAdvanceWritten) {
            updated.movementByYear = deleteYearKeys(p.movementByYear, year)
            // Also strip legacy movements[] entries for the same year/type
            // so the two stores stay in sync.
            if (Array.isArray(p.movements) && p.movements.length > 0) {
              updated.movements = p.movements.filter(m => {
                if (Number(m.year) !== Number(year)) return true
                const t = m.type
                const r = m.reason
                return !(
                  advanceWrittenTypes.has(t) ||
                  (t === 'departure' && (r === 'Graduating' || r === 'Pro Draft'))
                )
              })
            }
          }
          if (hasDraftFields) {
            // Only strip if revert is undoing the draft entry that just landed.
            updated.draftYear = null
            updated.draftRound = null
            updated.draftPick = null
          }
          return updated
        })
        if (cleanedPlayers.some((p, i) => p !== playersForCleanup[i])) {
          additionalUpdates.players = cleanedPlayers
        }

        // Clear sheet ID
        additionalUpdates.playersLeavingSheetId = null

        // Clear draft results entered during postseason week 5 / offseason week 1
        // (dual-keyed: abbr + tid).
        const existingDraftResults_w1 = dynasty.draftResultsByTeamYear || {}
        if (existingDraftResults_w1[teamAbbr] || (teamTid && existingDraftResults_w1[teamTid])) {
          additionalUpdates.draftResultsByTeamYear = {
            ...existingDraftResults_w1,
            ...(existingDraftResults_w1[teamAbbr]
              ? { [teamAbbr]: deleteYearKeys(existingDraftResults_w1[teamAbbr], year) }
              : {}),
            ...(teamTid && existingDraftResults_w1[teamTid]
              ? { [teamTid]: deleteYearKeys(existingDraftResults_w1[teamTid], year) }
              : {}),
          }
        }

        // Also clear teams[tid].byYear[year].draftResults
        if (teamTid && dynasty.teams?.[teamTid]?.byYear?.[year]?.draftResults) {
          const existingTeams = additionalUpdates.teams || dynasty.teams
          const existingTeamData = existingTeams[teamTid] || {}
          const existingByYear = existingTeamData.byYear || {}
          const existingYearData = existingByYear[year] || {}
          const { draftResults, ...restYearData } = existingYearData
          additionalUpdates.teams = {
            ...existingTeams,
            [teamTid]: {
              ...existingTeamData,
              byYear: { ...existingByYear, [year]: restYearData },
            },
          }
        }

        // If user switched teams, restore the previous team
        const previousJobData = dynasty.previousJobData
        if (previousJobData) {
          // Restore root-level dynasty fields
          additionalUpdates.teamName = previousJobData.teamName
          // CRITICAL: Restore currentTid — without this, team-perspective queries
          // stay pointed at the new team even after revert.
          if (previousJobData.currentTid != null) {
            additionalUpdates.currentTid = previousJobData.currentTid
          }
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

          // Reverse applyPendingUserTeam (advance flips userId/pendingUserId
          // on dynasty.teams). Without this, getCurrentTeamTid (which scans
          // for userId='currentUser') returns the NEW team while
          // dynasty.currentTid points to the OLD team — total divergence.
          // The teamsSlice snapshot has the exact pre-flip flags for both
          // affected tids; just merge them back over the post-flip teams map.
          if (previousJobData.teamsSlice && dynasty.teams) {
            const nextTeams = { ...(additionalUpdates.teams || dynasty.teams) }
            for (const [tidStr, slice] of Object.entries(previousJobData.teamsSlice)) {
              const tid = Number(tidStr)
              const team = nextTeams[tid]
              if (!team) continue
              nextTeams[tid] = {
                ...team,
                userId: slice.userId,
                pendingUserId: slice.pendingUserId,
                coachPosition: slice.coachPosition,
              }
            }
            additionalUpdates.teams = nextTeams
          }

          // Restore memberTeams + memberTeamHistory snapshots (advance overwrote
          // both — memberTeamHistory was stamped for the season that just
          // ended, memberTeams was reordered to put the new team first).
          if (previousJobData.memberTeams !== undefined) {
            additionalUpdates.memberTeams = previousJobData.memberTeams
          }
          if (previousJobData.memberTeamHistory !== undefined) {
            additionalUpdates.memberTeamHistory = previousJobData.memberTeamHistory
          }

          // Untag legacy player.team / game.userTeam fields that advance
          // stamped on records that didn't have them. Use the captured pid
          // and id lists so we only touch records we actually modified.
          if (Array.isArray(previousJobData.legacyTaggedPlayerPids) && previousJobData.legacyTaggedPlayerPids.length > 0) {
            const taggedPids = new Set(previousJobData.legacyTaggedPlayerPids)
            const playersList = additionalUpdates.players || dynasty.players || []
            const untaggedPlayers = playersList.map(p => {
              if (!p?.pid || !taggedPids.has(p.pid)) return p
              const { team: _team, ...rest } = p
              return rest
            })
            if (untaggedPlayers.some((p, i) => p !== playersList[i])) {
              additionalUpdates.players = untaggedPlayers
            }
          }
          if (Array.isArray(previousJobData.legacyTaggedGameIds) && previousJobData.legacyTaggedGameIds.length > 0) {
            const taggedGameIds = new Set(previousJobData.legacyTaggedGameIds)
            updatedGames = updatedGames.map(g => {
              if (!g?.id || !taggedGameIds.has(g.id)) return g
              const { userTeam: _userTeam, ...rest } = g
              return rest
            })
          }

          // Roll back the team-centric byYear[swapYear] write that advance
          // made on the OLD team's record. If there was no entry there
          // before advance, drop it; otherwise restore the prior contents.
          const swapYear = previousJobData.swapYear
          const oldTid = previousJobData.oldUserTid
          if (swapYear != null && oldTid != null && dynasty.teams?.[oldTid]?.byYear) {
            const existingTeams = additionalUpdates.teams || dynasty.teams
            const teamData = existingTeams[oldTid] || {}
            const byYear = teamData.byYear || {}
            const nextByYear = { ...byYear }
            if (previousJobData.oldTeamByYearForCurrentYear != null) {
              nextByYear[swapYear] = previousJobData.oldTeamByYearForCurrentYear
            } else {
              delete nextByYear[swapYear]
              delete nextByYear[String(swapYear)]
            }
            additionalUpdates.teams = {
              ...existingTeams,
              [oldTid]: { ...teamData, byYear: nextByYear },
            }
          }

          // Drop the duplicate team-centric writes (schedulesByTeamYear,
          // teamRatingsByTeamYear, coachingStaffByTeamYear, googleSheetsByTeam)
          // that advance stamped under the OLD team's abbr. The root-level
          // restores above are now the source of truth post-revert.
          if (swapYear != null) {
            const oldAbbr = previousJobData.coachPosition !== undefined
              ? (dynasty.teams?.[oldTid]?.abbr || null)
              : null
            // We pull abbr from the current teams map since teambuilder slot
            // assignments survive the swap.
            if (oldAbbr) {
              if (dynasty.schedulesByTeamYear?.[oldAbbr]?.[swapYear] != null) {
                additionalUpdates.schedulesByTeamYear = {
                  ...dynasty.schedulesByTeamYear,
                  [oldAbbr]: deleteYearKeys(dynasty.schedulesByTeamYear[oldAbbr], swapYear),
                }
              }
              if (dynasty.teamRatingsByTeamYear?.[oldAbbr]?.[swapYear] != null) {
                additionalUpdates.teamRatingsByTeamYear = {
                  ...dynasty.teamRatingsByTeamYear,
                  [oldAbbr]: deleteYearKeys(dynasty.teamRatingsByTeamYear[oldAbbr], swapYear),
                }
              }
              if (dynasty.coachingStaffByTeamYear?.[oldAbbr]?.[swapYear] != null) {
                additionalUpdates.coachingStaffByTeamYear = {
                  ...dynasty.coachingStaffByTeamYear,
                  [oldAbbr]: deleteYearKeys(dynasty.coachingStaffByTeamYear[oldAbbr], swapYear),
                }
              }
              if (dynasty.googleSheetsByTeam?.[oldAbbr] != null) {
                const next = { ...dynasty.googleSheetsByTeam }
                delete next[oldAbbr]
                additionalUpdates.googleSheetsByTeam = next
              }
            }
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

          // Also handle edge case: class was bumped but no teamsByYear entry
          // (e.g. player was graduated by advanceToNewSeason — no new-year roster slot
          // but may still have a classByYear[newSeasonYear] from pre-flip processing).
          const hadClassEntryForNewYear =
            player.classByYear?.[newSeasonYear] != null ||
            player.classByYear?.[String(newSeasonYear)] != null

          if (!hadNewYearEntry && !hadClassEntryForNewYear) {
            // Still clear any departure movement written by advanceToNewSeason for
            // the previous season year (graduated/encouraged_to_transfer), so
            // replay-advance doesn't see a stale record.
            const prevMovementEntry =
              player.movementByYear?.[previousSeasonYear] ||
              player.movementByYear?.[String(previousSeasonYear)]
            const advanceWrittenTypes = new Set([
              'graduated', 'declared_for_draft', 'encouraged_to_transfer',
              'departure',
            ])
            const shouldClear = prevMovementEntry && (
              advanceWrittenTypes.has(prevMovementEntry.type) ||
              prevMovementEntry.departure === 'graduated' ||
              prevMovementEntry.departure === 'pro_draft' ||
              prevMovementEntry.reason === 'Encouraged Transfer' ||
              prevMovementEntry.reason === 'Graduating'
            )
            if (!shouldClear) return player
            const cleanedMovementByYear = { ...(player.movementByYear || {}) }
            delete cleanedMovementByYear[previousSeasonYear]
            delete cleanedMovementByYear[String(previousSeasonYear)]
            const cleanedMovements = (player.movements || []).filter(m => {
              if (Number(m.year) !== Number(previousSeasonYear)) return true
              const t = m.type
              const r = m.reason
              return !(
                t === 'graduated' || t === 'declared_for_draft' ||
                t === 'encouraged_to_transfer' ||
                (t === 'departure' && (r === 'Graduating' || r === 'Pro Draft'))
              )
            })
            return {
              ...player,
              movementByYear: cleanedMovementByYear,
              ...(cleanedMovements.length !== (player.movements || []).length
                ? { movements: cleanedMovements }
                : {}),
            }
          }

          // Get the class from the previous season to determine original class.
          // Fallback: derive from current player.year via the reverse map for
          // edge cases where classByYear[previousSeasonYear] was never written
          // (e.g., player added mid-season without a snapshot).
          const previousClass =
            player.classByYear?.[previousSeasonYear] ||
            player.classByYear?.[String(previousSeasonYear)] ||
            REVERSE_CLASS_PROGRESSION[player.year] ||
            player.year

          // Remove the new season entries from teamsByYear, classByYear, AND
          // the per-year overall/devTrait maps. Advance writes all four; revert
          // must clear all four or stat lookups for the new year stay polluted.
          const newTeamsByYear = deleteYearKeys(player.teamsByYear, newSeasonYear)
          const newClassByYear = deleteYearKeys(player.classByYear, newSeasonYear)
          const newOverallByYear = player.overallByYear
            ? deleteYearKeys(player.overallByYear, newSeasonYear)
            : player.overallByYear
          const newDevTraitByYear = player.devTraitByYear
            ? deleteYearKeys(player.devTraitByYear, newSeasonYear)
            : player.devTraitByYear

          // Clear any departure movement written by advanceToNewSeason for the
          // previous season year (graduated/pro-draft/encouraged-transfer). These
          // were added by the year-flip side effects and must be undone on revert.
          let nextMovementByYear = player.movementByYear
          let nextMovements = player.movements
          const prevMvEntry =
            player.movementByYear?.[previousSeasonYear] ||
            player.movementByYear?.[String(previousSeasonYear)]
          const isAdvanceWritten =
            prevMvEntry && (
              prevMvEntry.type === 'graduated' ||
              prevMvEntry.type === 'declared_for_draft' ||
              prevMvEntry.type === 'encouraged_to_transfer' ||
              prevMvEntry.departure === 'graduated' ||
              prevMvEntry.departure === 'pro_draft' ||
              prevMvEntry.reason === 'Encouraged Transfer'
            )
          if (isAdvanceWritten) {
            nextMovementByYear = { ...(player.movementByYear || {}) }
            delete nextMovementByYear[previousSeasonYear]
            delete nextMovementByYear[String(previousSeasonYear)]
            nextMovements = (player.movements || []).filter(m => {
              if (Number(m.year) !== Number(previousSeasonYear)) return true
              const t = m.type
              const r = m.reason
              return !(
                t === 'graduated' || t === 'declared_for_draft' ||
                t === 'encouraged_to_transfer' ||
                (t === 'departure' && (r === 'Graduating' || r === 'Pro Draft'))
              )
            })
          }

          // Restore player.year to the previous class
          return {
            ...player,
            year: previousClass || player.year,
            teamsByYear: newTeamsByYear,
            classByYear: newClassByYear,
            ...(newOverallByYear !== player.overallByYear
              ? { overallByYear: newOverallByYear }
              : {}),
            ...(newDevTraitByYear !== player.devTraitByYear
              ? { devTraitByYear: newDevTraitByYear }
              : {}),
            ...(nextMovementByYear !== player.movementByYear
              ? { movementByYear: nextMovementByYear }
              : {}),
            ...(nextMovements !== player.movements
              ? { movements: nextMovements }
              : {}),
          }
        })

        if (updatedPlayers.some((p, i) => p !== players[i])) {
          additionalUpdates.players = updatedPlayers
        }

        // Clear class progression marker
        additionalUpdates.classProgressionDoneForYear = null

        // Pop the coachCareer entry that advance added for newSeasonYear.
        // addCareerEntry dedupes by year, so the entry is guaranteed at most
        // one row for this year — remove any that match.
        const existingCoachCareer = dynasty.coachCareer || []
        if (existingCoachCareer.some(e => Number(e.year) === Number(newSeasonYear))) {
          additionalUpdates.coachCareer = existingCoachCareer.filter(
            e => Number(e.year) !== Number(newSeasonYear)
          )
        }

        // Clear coachTeamByYear entry for the year we're flipping away from
        // (the new year's coach-team record was written when we advanced into
        // it; if we're rolling the year back, that entry is premature).
        if (
          dynasty.coachTeamByYear?.[newSeasonYear] != null ||
          dynasty.coachTeamByYear?.[String(newSeasonYear)] != null
        ) {
          additionalUpdates.coachTeamByYear = deleteYearKeys(
            dynasty.coachTeamByYear, newSeasonYear
          )
        }

        // Undo customConferences carryover (advance line ~8063-8095).
        // Advance copies customConferencesByYear[previousYear] →
        // [nextYear] and assigns root customConferences = prevYearConferences.
        // On revert, we drop the [nextYear] copy so the new year doesn't
        // hold stale conference data, and restore root customConferences
        // from the per-year store for the year we're going back into.
        if (
          dynasty.customConferencesByYear?.[newSeasonYear] != null ||
          dynasty.customConferencesByYear?.[String(newSeasonYear)] != null
        ) {
          additionalUpdates.customConferencesByYear = deleteYearKeys(
            dynasty.customConferencesByYear, newSeasonYear
          )
        }
        const prevYearConfs =
          dynasty.customConferencesByYear?.[previousSeasonYear] ||
          dynasty.customConferencesByYear?.[String(previousSeasonYear)]
        if (prevYearConfs) {
          additionalUpdates.customConferences = prevYearConfs
        }

        // Walk teams[*] and clear byYear[newSeasonYear].conference that
        // buildPerTeamConferencePatch fanned out at advance time.
        if (dynasty.teams) {
          let touchedTeams = false
          const nextTeams = { ...(additionalUpdates.teams || dynasty.teams) }
          for (const [tidStr, team] of Object.entries(nextTeams)) {
            const byYear = team?.byYear
            if (!byYear) continue
            const keyN = byYear[newSeasonYear]
            const keyS = byYear[String(newSeasonYear)]
            if (keyN == null && keyS == null) continue
            const targetKey = keyN != null ? newSeasonYear : String(newSeasonYear)
            const yearData = byYear[targetKey] || {}
            if (yearData.conference == null) continue
            const { conference, ...rest } = yearData
            const nextByYear = { ...byYear, [targetKey]: rest }
            // Drop the year entry entirely if it became empty.
            if (Object.keys(rest).length === 0) {
              delete nextByYear[targetKey]
            }
            nextTeams[tidStr] = { ...team, byYear: nextByYear }
            touchedTeams = true
          }
          if (touchedTeams) additionalUpdates.teams = nextTeams
        }

        // Clear recruiting class rank for this year (dual-keyed: abbr + tid).
        const existingClassRank = dynasty.recruitingClassRankByTeamYear || {}
        if (existingClassRank[teamAbbr] || (teamTid && existingClassRank[teamTid])) {
          additionalUpdates.recruitingClassRankByTeamYear = {
            ...existingClassRank,
            ...(existingClassRank[teamAbbr]
              ? { [teamAbbr]: deleteYearKeys(existingClassRank[teamAbbr], previousSeasonYear) }
              : {}),
            ...(teamTid && existingClassRank[teamTid]
              ? { [teamTid]: deleteYearKeys(existingClassRank[teamTid], previousSeasonYear) }
              : {}),
          }
        }

        // Clear draft results for this year (dual-keyed: abbr + tid).
        const existingDraftResults = dynasty.draftResultsByTeamYear || {}
        if (existingDraftResults[teamAbbr] || (teamTid && existingDraftResults[teamTid])) {
          additionalUpdates.draftResultsByTeamYear = {
            ...existingDraftResults,
            ...(existingDraftResults[teamAbbr]
              ? { [teamAbbr]: deleteYearKeys(existingDraftResults[teamAbbr], previousSeasonYear) }
              : {}),
            ...(teamTid && existingDraftResults[teamTid]
              ? { [teamTid]: deleteYearKeys(existingDraftResults[teamTid], previousSeasonYear) }
              : {}),
          }
        }
      } else if (dynasty.currentWeek === 7 && prevWeek === 6) {
        // Reverting FROM Training Camp (week 7) TO Signing Day (week 6)
        // Note: Training data is keyed by the new year (post-flip)
        const trainingYear = currentYear

        // Restore player overalls that the training results modal mutated
        // (Dashboard.handleTrainingResultsSave at line ~1635 sets player.overall
        // and overallByYear[year] = newOverall). Use the saved result blob's
        // pastOverall to revert. Fall back to overallByYear[prevYear] if the
        // result was just a free-form set without a snapshot.
        const trainingResults = dynasty.trainingResultsByYear?.[trainingYear]
          || dynasty.trainingResultsByYear?.[String(trainingYear)]
          || []
        if (Array.isArray(trainingResults) && trainingResults.length > 0) {
          const pastByName = new Map()
          for (const r of trainingResults) {
            if (!r?.playerName) continue
            const norm = String(r.playerName).toLowerCase().trim()
            // We may not always have pastOverall; null means "leave alone".
            pastByName.set(norm, r.pastOverall ?? null)
          }
          const players = dynasty.players || []
          const updatedPlayers = players.map(p => {
            const norm = (p.name || '').toLowerCase().trim()
            if (!pastByName.has(norm)) return p
            const past = pastByName.get(norm)
            const nextOverallByYear = { ...(p.overallByYear || {}) }
            // Drop the training year's stamped overall — it's the post-train value.
            delete nextOverallByYear[trainingYear]
            delete nextOverallByYear[String(trainingYear)]
            const restored = { ...p, overallByYear: nextOverallByYear }
            // Roll back the live `overall` field to the pre-training number
            // when we have one; otherwise leave it (user can re-edit).
            if (past != null) restored.overall = past
            return restored
          })
          if (updatedPlayers.some((p, i) => p !== players[i])) {
            additionalUpdates.players = updatedPlayers
          }
        }

        // Clear training results — Dashboard writes these year-keyed (NOT
        // team-year-keyed). Older revert code cleared the wrong field.
        if (dynasty.trainingResultsByYear) {
          additionalUpdates.trainingResultsByYear = deleteYearKeys(
            dynasty.trainingResultsByYear, trainingYear
          )
        }
        // Also clear tid-based structure (teamTid resolved at the top of
        // this offseason branch — no need to re-derive from abbr).
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

        // Clear recruit overalls — Dashboard writes year-keyed too (#22).
        if (dynasty.recruitOverallsByYear) {
          additionalUpdates.recruitOverallsByYear = deleteYearKeys(
            dynasty.recruitOverallsByYear, trainingYear
          )
        }
      } else if (dynasty.currentWeek === 8 && prevWeek === 7) {
        // Reverting FROM week 8 TO week 7
        // Layout calls advanceToNewSeason THEN advanceWeek for this transition,
        // so revert must undo BOTH:
        //   (a) advanceWeek's recruit conversion (below)
        //   (b) advanceToNewSeason's coaching/preseason/customConferences writes
        //       (restored from prevAdvanceToNewSeasonSnapshot)
        const players = dynasty.players || []
        const recruitingYear = currentYear - 1
        const currentSeasonYear = currentYear

        // (b) Restore from advanceToNewSeason snapshot if present.
        const snapshot = dynasty.prevAdvanceToNewSeasonSnapshot
        if (snapshot) {
          // Restore root-level fields
          additionalUpdates.isFirstYearOnCurrentTeam = snapshot.isFirstYearOnCurrentTeam
          additionalUpdates.coachingStaff = snapshot.coachingStaff
          additionalUpdates.pendingCoordinatorHires = snapshot.pendingCoordinatorHires
          additionalUpdates.customConferences = snapshot.customConferences

          // Roll back the per-team-year stamps. If the year wasn't present
          // before advance, delete it; otherwise we can't perfectly recover
          // the prior value, but clearing keeps reads consistent.
          const snapAbbr = snapshot.teamAbbr
          const snapTid = snapshot.teamTid
          const snapYear = snapshot.currentSeasonYear

          if (!snapshot.hadCoachingStaffByTeamYearEntry) {
            const existing = dynasty.coachingStaffByTeamYear || {}
            const next = { ...existing }
            if (snapAbbr && next[snapAbbr]) {
              next[snapAbbr] = deleteYearKeys(next[snapAbbr], snapYear)
              if (Object.keys(next[snapAbbr]).length === 0) delete next[snapAbbr]
            }
            if (snapTid && next[snapTid]) {
              next[snapTid] = deleteYearKeys(next[snapTid], snapYear)
              if (Object.keys(next[snapTid]).length === 0) delete next[snapTid]
            }
            additionalUpdates.coachingStaffByTeamYear = next
          }

          if (!snapshot.hadPreseasonSetupByTeamYearEntry) {
            const existing = dynasty.preseasonSetupByTeamYear || {}
            const next = { ...existing }
            if (snapAbbr && next[snapAbbr]) {
              next[snapAbbr] = deleteYearKeys(next[snapAbbr], snapYear)
              if (Object.keys(next[snapAbbr]).length === 0) delete next[snapAbbr]
            }
            if (snapTid && next[snapTid]) {
              next[snapTid] = deleteYearKeys(next[snapTid], snapYear)
              if (Object.keys(next[snapTid]).length === 0) delete next[snapTid]
            }
            additionalUpdates.preseasonSetupByTeamYear = next
          }

          // Roll back teams[tid].byYear[snapYear].{coachingStaff, preseasonSetup}.
          if (snapTid && dynasty.teams?.[snapTid]?.byYear?.[snapYear]) {
            const existingTeams = additionalUpdates.teams || dynasty.teams
            const teamData = existingTeams[snapTid] || {}
            const byYear = teamData.byYear || {}
            const yearData = byYear[snapYear] || {}
            const { coachingStaff: _cs, preseasonSetup: _ps, ...rest } = yearData
            const nextByYear = { ...byYear }
            if (Object.keys(rest).length === 0) {
              delete nextByYear[snapYear]
              delete nextByYear[String(snapYear)]
            } else {
              nextByYear[snapYear] = rest
            }
            additionalUpdates.teams = {
              ...existingTeams,
              [snapTid]: { ...teamData, byYear: nextByYear },
            }
          }

          // Snapshot consumed — clear it.
          additionalUpdates.prevAdvanceToNewSeasonSnapshot = null
        }

        // (a) Undo recruit conversion: flip isRecruit back to true and remove
        // teamsByYear[currentYear] / classByYear[currentYear] entries that
        // advance wrote. Those belong only to active (non-recruit) players;
        // leaving them would stamp the recruit as already-on-roster for the
        // upcoming season.
        const updatedPlayers = players.map(player => {
          const matchesRecruitYear =
            player.recruitYear === recruitingYear ||
            player.recruitYear === String(recruitingYear)
          if (!matchesRecruitYear) return player

          const nextTeamsByYear = { ...(player.teamsByYear || {}) }
          delete nextTeamsByYear[currentSeasonYear]
          delete nextTeamsByYear[String(currentSeasonYear)]

          const nextClassByYear = { ...(player.classByYear || {}) }
          delete nextClassByYear[currentSeasonYear]
          delete nextClassByYear[String(currentSeasonYear)]

          return {
            ...player,
            isRecruit: true,
            teamsByYear: nextTeamsByYear,
            classByYear: nextClassByYear,
          }
        })

        if (updatedPlayers.some((p, i) => p !== players[i])) {
          additionalUpdates.players = updatedPlayers
        }
      }
    }

    // Record which year to re-sync stats for. After the update lands, we
    // re-derive player.statsByYear[yearToSync] from the surviving box scores
    // so stat totals don't stay inflated by the deleted/cleared game(s).
    // We resync any time the revert touches a year that had games:
    //  - Currently in a game-playing phase (regular_season / CC / postseason)
    //  - OR landing back into one of those phases (e.g. offseason wk1 → postseason wk5)
    //  - OR rolling the year back at signing day (year-flip revert, prevYear ≠ currentYear)
    const playPhases = new Set(['regular_season', 'conference_championship', 'postseason'])
    const shouldResyncCurrent = playPhases.has(dynasty.currentPhase)
    const shouldResyncPrev = playPhases.has(prevPhase)
    const yearToResync = shouldResyncCurrent
      ? dynasty.currentYear
      : (shouldResyncPrev ? prevYear : null)
    // On a year-flip revert, also resync the year we're going BACK to (its
    // stats may have been touched by advanceToNewSeason side effects).
    const extraYearToResync = (prevYear !== currentYear) ? prevYear : null

    await updateDynasty(dynastyId, {
      currentWeek: prevWeek,
      currentPhase: prevPhase,
      currentYear: prevYear,
      games: updatedGames,
      ...additionalUpdates
    })

    if (yearToResync != null) {
      try {
        await syncAllPlayersStats(dynastyId, yearToResync, { skipGamesPlayed: false })
      } catch (err) {
        console.error('[revertWeek] Post-revert stats resync failed:', err)
        // Non-fatal — user can run Sync Stats manually from DangerZone.
      }
    }
    if (extraYearToResync != null && extraYearToResync !== yearToResync) {
      try {
        await syncAllPlayersStats(dynastyId, extraYearToResync, { skipGamesPlayed: false })
      } catch (err) {
        console.error('[revertWeek] Post-revert stats resync (prev year) failed:', err)
      }
    }

    } finally {
      // Mirror advanceWeek: clear the listener-skip flag with a short
      // settle delay so any Firestore tick triggered by our updateDynasty
      // call lands while the flag is still set, preventing a stale snapshot
      // from clobbering the post-revert state.
      setTimeout(() => {
        phaseTransitionInProgressRef.current = false
      }, 1000)
    }
  }

  const saveSchedule = async (dynastyId, schedule, options = {}) => {
    if (blockIfReadOnly(dynastyId, 'save schedule')) return
    // Use helper functions for consistent storage routing based on dynasty.storageType
    const dynasty = await findDynastyById(dynastyId)

    if (!dynasty) {
      console.error('Dynasty not found:', dynastyId)
      return
    }

    // Derive storage type from dynasty's storageType field
    const useLocalStorage = dynasty.storageType !== 'cloud'

    // Get team and year — use provided values or fall back to user's
    // current team. CRITICAL: derive tid via getCurrentTeamTid, not
    // by round-tripping abbr → static map. A TeamBuilder's chosen
    // abbr can collide with a real team's static abbr (e.g. a TB
    // named "MUR" → Murray State Racers FCS), which would otherwise
    // resolve to the WRONG tid and save games against a team the
    // user doesn't actually own.
    const targetTid = options.teamTid || getCurrentTeamTid(dynasty)
    const targetYear = options.year || dynasty.currentYear
    const teamAbbr = targetTid
      ? getAbbrFromTid(dynasty.teams, targetTid)
      : (getCurrentTeamAbbr(dynasty) || dynasty.teamName)
    const year = targetYear
    const tid = targetTid

    // Determine if this is the user's current team + year. Editing
    // your OWN team's schedule via the TeamYear page passes teamTid +
    // year explicitly; we still want the legacy root-level flags
    // (preseasonSetup.scheduleEntered, dynasty.schedule) to update so
    // the Dashboard to-do reflects the change. Treat "no options
    // passed" OR "tid+year match the user's current team+year" both
    // as the user's own.
    const userCurrentTid = getCurrentTeamTid(dynasty)
    const matchesUserTeam = Number(tid) === Number(userCurrentTid)
    const matchesCurrentYear = Number(year) === Number(dynasty.currentYear)
    const isUserCurrentTeamYear = (!options.teamTid && !options.year)
      || (matchesUserTeam && matchesCurrentYear)

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

    // Compute the diff (adds + updates + removes) and apply it to the games
    // array, so re-submitting a schedule actually keeps games in sync rather
    // than only ever appending new records.
    const diff = computeScheduleDiff(dynasty, schedule, tid, year)
    const allGames = applyScheduleDiff(dynasty.games || [], diff)

    // Use updatedSchedule (with gameIds + opponentTid + isBye) instead of raw schedule
    const scheduleToSave = diff.updatedSchedule

    // Base updates - always save to team-specific structures
    let scheduleUpdates

    if (useLocalStorage) {
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
        // Store in old team-centric structure — dual-key under tid AND
        // current abbr so a teambuilder rename doesn't orphan the data.
        schedulesByTeamYear: {
          ...existingSchedulesByTeamYear,
          [teamAbbr]: {
            ...(existingSchedulesByTeamYear[teamAbbr] || {}),
            [year]: scheduleToSave
          },
          ...(tid ? { [tid]: { ...(existingSchedulesByTeamYear[tid] || {}), [year]: scheduleToSave } } : {})
        },
        // Update old team-centric preseason setup (dual-keyed)
        preseasonSetupByTeamYear: {
          ...existingPreseasonSetupByTeamYear,
          [teamAbbr]: {
            ...(existingPreseasonSetupByTeamYear[teamAbbr] || {}),
            [year]: {
              ...((existingPreseasonSetupByTeamYear[teamAbbr] || {})[year] || {}),
              scheduleEntered: true
            }
          },
          ...(tid ? {
            [tid]: {
              ...(existingPreseasonSetupByTeamYear[tid] || {}),
              [year]: {
                ...((existingPreseasonSetupByTeamYear[tid] || {})[year] || {}),
                scheduleEntered: true
              }
            }
          } : {})
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
      // Firestore: use dot notation for nested updates. Dual-write tid +
      // current-abbr keys so the data survives a teambuilder rename.
      scheduleUpdates = {
        // NEW tid-based byYear structure
        [`teams.${tid}.byYear.${year}.schedule`]: scheduleToSave,
        [`teams.${tid}.byYear.${year}.preseasonSetup.scheduleEntered`]: true,
        // Old structures — dual-key writes
        ...buildByTeamYearUpdates('schedulesByTeamYear', dynasty, tid, year, scheduleToSave),
        ...buildByTeamYearUpdates('preseasonSetupByTeamYear', dynasty, tid, `${year}.scheduleEntered`, true),
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
    if (blockIfReadOnly(dynastyId, 'save roster')) return
    // Use helper functions for consistent storage routing based on dynasty.storageType
    const dynasty = await findDynastyById(dynastyId)

    if (!dynasty) {
      console.error('Dynasty not found:', dynastyId)
      return
    }

    // Derive storage type from dynasty's storageType field
    const useLocalStorage = dynasty.storageType !== 'cloud'

    // DEBUG: Log dynasty flags
    console.log(`[saveRoster] Dynasty flags: _tidFullyMigrated=${dynasty._tidFullyMigrated}, _tidMigrated=${dynasty._tidMigrated}, _subcollectionsMigrated=${dynasty._subcollectionsMigrated}`)

    // Get year - use provided year or fall back to current year
    const year = options.year || dynasty.currentYear

    // CRITICAL: Get tid directly - tid is the ONLY source of truth.
    // If options.teamAbbr is provided, convert it to tid; otherwise
    // use current user team's tid.
    let teamTid
    if (options.teamAbbr) {
      // Convert provided abbr to tid (for editing other teams).
      // Pass dynasty so a TB takeover's CURRENT abbr resolves to the
      // correct slot tid, not whatever the static map says.
      teamTid = getTidFromAbbr(options.teamAbbr, dynasty)
    } else {
      // Use current user team's tid directly
      teamTid = getCurrentTeamTid(dynasty)
    }
    // Resolve the EDITED team's abbr from its tid so legacy player.team
    // field comparisons match the right team. Was previously the user's
    // current team's abbr, which is wrong when editing OTHER teams.
    const teamAbbr = teamTid ? getAbbrFromTid(dynasty.teams, teamTid) : (getCurrentTeamAbbr(dynasty) || dynasty.teamName)
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
        // This is the IMMUTABLE record that determines roster membership for past seasons.
        // Skip adding the year if player has a departure movement before this year.
        // After v2 migration, movements[] is stripped on save, so we MUST also
        // check movementByYear or every post-migration departure is invisible
        // here — which would re-stamp departed players back onto the roster.
        const v2DepartureTypes = new Set(['departure', 'transfer', 'entered_portal', 'transferred_out', 'graduated', 'declared_for_draft', 'encouraged_to_transfer'])
        const v2DepartureShapes = new Set(['transfer_out', 'graduated', 'pro_draft'])
        const hasDepartedBeforeThisYearLegacy = (existingPlayer.movements || []).some(m =>
          (m.type === 'departure' || m.type === 'transfer') && m.year && Number(m.year) < Number(year)
        )
        const hasDepartedBeforeThisYearV2 = Object.entries(existingPlayer.movementByYear || {}).some(([yStr, m]) => {
          const yNum = Number(yStr)
          if (!Number.isFinite(yNum) || yNum >= Number(year)) return false
          return m && (v2DepartureTypes.has(m.type) || v2DepartureShapes.has(m.departure))
        })
        const shouldAddToTeamsByYear = !(hasDepartedBeforeThisYearLegacy || hasDepartedBeforeThisYearV2)

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

        // Track player overall for this season (if provided in sheet)
        const playerOverall = player.overall ?? existingPlayer.overall
        const updatedOverallByYear = playerOverall
          ? {
              ...(existingPlayer.overallByYear || {}),
              [year]: playerOverall
            }
          : existingPlayer.overallByYear || {}

        // Track dev trait for this season
        const playerDevTrait = player.devTrait || existingPlayer.devTrait
        const updatedDevTraitByYear = playerDevTrait
          ? {
              ...(existingPlayer.devTraitByYear || {}),
              [year]: playerDevTrait
            }
          : existingPlayer.devTraitByYear || {}

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
          classByYear: updatedClassByYear,
          // IMMUTABLE overall history - records what overall player had each year
          overallByYear: updatedOverallByYear,
          // IMMUTABLE dev trait history - records what dev trait player had each year
          devTraitByYear: updatedDevTraitByYear
          // ALL other fields (recruitYear, yearStarted, isRecruit, isPortal, stars, etc.)
          // are automatically preserved from ...existingPlayer and NOT overwritten
        }
      }

      // For NEW players (no name match), use sheet data with required fields.
      // Write a canonical v2 arrival/transfer_in entry to movementByYear
      // (mirrors what legacyMovementToCanonical produces for the legacy
      // 'added' type — keeping the semantic identical while skipping the
      // legacy movements[] write the heal would just strip on next load).
      return {
        ...player,
        pid,
        id,
        team: teamTid,
        yearStarted: player.yearStarted || year,
        entryReason: 'created',
        // IMMUTABLE roster history - this player is on this team this year (tid)
        teamsByYear: { [year]: teamsByYearValue },
        // IMMUTABLE class history - record this player's class for this year
        classByYear: { [year]: player.year },
        // IMMUTABLE overall history - record this player's overall for this year
        overallByYear: player.overall ? { [year]: player.overall } : {},
        // IMMUTABLE dev trait history - record this player's dev trait for this year
        devTraitByYear: player.devTrait ? { [year]: player.devTrait } : {},
        // Canonical v2 movement record — was a legacy movements[] entry.
        movementByYear: {
          [year]: { type: 'arrival', arrival: 'transfer_in', fromTid: null },
        },
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
    const tid = getTidFromAbbr(teamAbbr, dynasty)
    const existingTeams = dynasty.teams || {}
    const existingTeamData = existingTeams[tid] || {}
    const existingByYear = existingTeamData.byYear || {}
    const existingYearData = existingByYear[year] || {}
    const existingYearSetup = existingYearData.preseasonSetup || {}

    const rosterUpdates = useLocalStorage
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
          // Update old team-centric preseason setup — dual-keyed (rename-safe)
          preseasonSetupByTeamYear: {
            ...existingPreseasonSetupByTeamYear,
            [teamAbbr]: {
              ...(existingPreseasonSetupByTeamYear[teamAbbr] || {}),
              [year]: {
                ...((existingPreseasonSetupByTeamYear[teamAbbr] || {})[year] || {}),
                rosterEntered: true
              }
            },
            ...(tid ? {
              [tid]: {
                ...(existingPreseasonSetupByTeamYear[tid] || {}),
                [year]: {
                  ...((existingPreseasonSetupByTeamYear[tid] || {})[year] || {}),
                  rosterEntered: true
                }
              }
            } : {})
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
          // Old structures — dual-write tid + abbr key (rename-safe)
          ...buildByTeamYearUpdates('preseasonSetupByTeamYear', dynasty, tid, `${year}.rosterEntered`, true),
          'preseasonSetup.rosterEntered': true
        }

    await updateDynasty(dynastyId, rosterUpdates)
  }

  const saveTeamRatings = async (dynastyId, ratings) => {
    if (blockIfReadOnly(dynastyId, 'save team ratings')) return
    // Use helper functions for consistent storage routing based on dynasty.storageType
    const dynasty = await findDynastyById(dynastyId)

    if (!dynasty) {
      console.error('Dynasty not found:', dynastyId)
      return
    }

    // Derive storage type from dynasty's storageType field
    const useLocalStorage = dynasty.storageType !== 'cloud'

    // Get current team abbreviation and year for team-centric storage
    const teamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName
    const year = dynasty.currentYear
    const tid = getTidFromAbbr(teamAbbr, dynasty)

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

    const teamRatingsUpdates = useLocalStorage
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
          // Store in old team-centric structure — dual-keyed (rename-safe)
          teamRatingsByTeamYear: {
            ...existingTeamRatingsByTeamYear,
            [teamAbbr]: {
              ...(existingTeamRatingsByTeamYear[teamAbbr] || {}),
              [year]: ratings
            },
            ...(tid ? { [tid]: { ...(existingTeamRatingsByTeamYear[tid] || {}), [year]: ratings } } : {})
          },
          // Also update legacy for backwards compatibility
          teamRatings: ratings,
          preseasonSetupByTeamYear: {
            ...existingPreseasonSetupByTeamYear,
            [teamAbbr]: {
              ...(existingPreseasonSetupByTeamYear[teamAbbr] || {}),
              [year]: {
                ...((existingPreseasonSetupByTeamYear[teamAbbr] || {})[year] || {}),
                teamRatingsEntered: true
              }
            },
            ...(tid ? {
              [tid]: {
                ...(existingPreseasonSetupByTeamYear[tid] || {}),
                [year]: {
                  ...((existingPreseasonSetupByTeamYear[tid] || {})[year] || {}),
                  teamRatingsEntered: true
                }
              }
            } : {})
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
          // Old structures — dual-write tid + abbr keys (rename-safe)
          ...buildByTeamYearUpdates('teamRatingsByTeamYear', dynasty, tid, year, ratings),
          ...buildByTeamYearUpdates('preseasonSetupByTeamYear', dynasty, tid, `${year}.teamRatingsEntered`, true),
          teamRatings: ratings,
          'preseasonSetup.teamRatingsEntered': true
        }

    await updateDynasty(dynastyId, teamRatingsUpdates)
  }

  // Save team year info (record, conference) for any team/year combination
  const saveTeamYearInfo = async (dynastyId, teamAbbr, year, info) => {
    if (blockIfReadOnly(dynastyId, 'save team info')) return
    // Use helper functions for consistent storage routing based on dynasty.storageType
    const dynasty = await findDynastyById(dynastyId)

    if (!dynasty) {
      console.error('Dynasty not found:', dynastyId)
      return
    }

    // Derive storage type from dynasty's storageType field
    const useLocalStorage = dynasty.storageType !== 'cloud'

    // Get tid for new byYear structure
    const tid = getTidFromAbbr(teamAbbr, dynasty)

    const updates = {}

    // Handle record update
    if (info.wins !== undefined && info.losses !== undefined) {
      const existingRecords = dynasty.teamRecordsByTeamYear || {}
      const teamRecords = existingRecords[teamAbbr] || {}
      const recordData = { wins: info.wins, losses: info.losses }

      if (useLocalStorage) {
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
        // Firestore dot notation. Dual-write tid + abbr keys (rename-safe).
        if (tid) {
          updates[`teams.${tid}.byYear.${year}.teamRecord`] = recordData
        }
        Object.assign(updates, buildByTeamYearUpdates('teamRecordsByTeamYear', dynasty, tid ?? teamAbbr, year, recordData))
      }
    }

    // Handle conference update
    if (info.conference !== undefined) {
      const existingConferences = dynasty.conferenceByTeamYear || {}
      const teamConferences = existingConferences[teamAbbr] || {}

      if (useLocalStorage) {
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
        // Firestore dot notation. Dual-write tid + abbr (rename-safe).
        if (tid) {
          updates[`teams.${tid}.byYear.${year}.conference`] = info.conference
        }
        Object.assign(updates, buildByTeamYearUpdates('conferenceByTeamYear', dynasty, tid ?? teamAbbr, year, info.conference))
      }
    }

    if (Object.keys(updates).length > 0) {
      await updateDynasty(dynastyId, updates)
    }
  }

  const saveCoachingStaff = async (dynastyId, staff) => {
    if (blockIfReadOnly(dynastyId, 'save coaching staff')) return
    // Use helper functions for consistent storage routing based on dynasty.storageType
    const dynasty = await findDynastyById(dynastyId)

    if (!dynasty) {
      console.error('Dynasty not found:', dynastyId)
      return
    }

    // Derive storage type from dynasty's storageType field
    const useLocalStorage = dynasty.storageType !== 'cloud'

    // Get current team abbreviation and year for team-centric storage
    const teamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName
    const year = dynasty.currentYear
    const tid = getTidFromAbbr(teamAbbr, dynasty)

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

    const coachingStaffUpdates = useLocalStorage
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
          // Store in old team-centric structure — dual-keyed (rename-safe)
          coachingStaffByTeamYear: {
            ...existingCoachingStaffByTeamYear,
            [teamAbbr]: {
              ...(existingCoachingStaffByTeamYear[teamAbbr] || {}),
              [year]: staff
            },
            ...(tid ? { [tid]: { ...(existingCoachingStaffByTeamYear[tid] || {}), [year]: staff } } : {})
          },
          // Also update legacy for backwards compatibility
          coachingStaff: staff,
          preseasonSetupByTeamYear: {
            ...existingPreseasonSetupByTeamYear,
            [teamAbbr]: {
              ...(existingPreseasonSetupByTeamYear[teamAbbr] || {}),
              [year]: {
                ...((existingPreseasonSetupByTeamYear[teamAbbr] || {})[year] || {}),
                coachingStaffEntered: true
              }
            },
            ...(tid ? {
              [tid]: {
                ...(existingPreseasonSetupByTeamYear[tid] || {}),
                [year]: {
                  ...((existingPreseasonSetupByTeamYear[tid] || {})[year] || {}),
                  coachingStaffEntered: true
                }
              }
            } : {})
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
          // Old structures — dual-write tid + abbr keys (rename-safe)
          ...buildByTeamYearUpdates('coachingStaffByTeamYear', dynasty, tid, year, staff),
          ...buildByTeamYearUpdates('preseasonSetupByTeamYear', dynasty, tid, `${year}.coachingStaffEntered`, true),
          coachingStaff: staff,
          'preseasonSetup.coachingStaffEntered': true
        }

    await updateDynasty(dynastyId, coachingStaffUpdates)
  }

  const updatePlayer = async (dynastyId, updatedPlayer, yearStats = null) => {
    if (blockIfReadOnly(dynastyId, 'update player')) return
    // Use helper functions for consistent storage routing based on dynasty.storageType
    const dynasty = await findDynastyById(dynastyId)

    if (!dynasty) {
      console.error('Dynasty not found:', dynastyId)
      return
    }

    // Find the original player to check if name changed
    const originalPlayer = (dynasty.players || []).find(p => p.pid === updatedPlayer.pid)
    const oldName = originalPlayer?.name
    const newName = updatedPlayer.name
    const nameChanged = oldName && newName && oldName !== newName

    // Determine storage type
    const looksLikeFirebaseId = typeof dynastyId === 'string' && dynastyId.length >= 20 && !/^\d+$/.test(dynastyId)
    const isCloudStorage = looksLikeFirebaseId || (dynasty.storageType === 'cloud' && user)

    // Prepare the final player object (with yearStats if provided)
    let finalPlayer = { ...updatedPlayer }

    // Year-stamp the player's position so past-season roster views can show
    // the position they held at the time (e.g., a WR in 2033 who becomes a
    // TE in 2034 still shows as "WR" on the 2033 roster). Stamping happens
    // in the central save path so every edit surface is covered at once.
    const stampYear = Number(dynasty.currentYear)
    if (stampYear && finalPlayer.position) {
      finalPlayer.positionByYear = {
        ...(finalPlayer.positionByYear || {}),
        [stampYear]: finalPlayer.position,
      }
    }

    if (yearStats && yearStats.year) {
      const year = Number(yearStats.year)
      const existingStatsByYear = { ...(finalPlayer.statsByYear || {}) }
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
      finalPlayer.statsByYear = existingStatsByYear
    }

    // OPTIMIZATION: For cloud storage, use single-document updates instead of rewriting all players
    if (isCloudStorage && !nameChanged) {
      // Simple case: no name change, just save the single player doc
      console.log(`[updatePlayer] OPTIMIZED: Saving single player ${finalPlayer.pid} (${finalPlayer.name}) to cloud`)

      try {
        // Set listener-skip guards so the real-time listener doesn't
        // overwrite our local state with a stale subcollection read.
        // (See the matching fix in deletePlayer — same root cause.)
        skipListenerUpdatesCountRef.current = Math.max(skipListenerUpdatesCountRef.current, 3)
        skipListenerTimestampRef.current = Date.now()
        lastPlayersUpdateTimestampRef.current = Date.now()
        lastPlayersUpdateDynastyIdRef.current = dynastyId

        // Normalize through v2 sync so legacy top-level fields (player.year,
        // .team, .overall, .devTrait, .movements[]) stay in lockstep with
        // the canonical per-year maps. Single source of truth.
        finalPlayer = syncDerivedFieldsFromV2(finalPlayer, dynasty?.currentYear)

        // Save single player to Firestore subcollection (1 write instead of N)
        await savePlayerToSubcollection(dynastyId, finalPlayer)
        lastPlayersUpdateTimestampRef.current = Date.now()

        // Update local React state
        const updatedPlayers = (dynasty.players || []).map(player =>
          player.pid === finalPlayer.pid ? finalPlayer : player
        )

        const updatedDynasty = { ...dynasty, players: updatedPlayers, lastModified: Date.now() }

        setDynasties(prev => prev.map(d =>
          String(d.id) === String(dynastyId) ? updatedDynasty : d
        ))

        if (String(currentDynasty?.id) === String(dynastyId)) {
          setCurrentDynasty(updatedDynasty)
        }

        return
      } catch (error) {
        console.error('[updatePlayer] Single-doc update failed, falling back to batch:', error)
        // Fall through to batch update
      }
    }

    // BATCH PATH: Used for local storage OR when name changed (need to update games too)
    // Update the player in the players array
    const updatedPlayers = (dynasty.players || []).map(player =>
      player.pid === finalPlayer.pid ? finalPlayer : player
    )

    // Build the update object
    const updateData = { players: updatedPlayers }

    // If name changed, update all box scores in all games
    if (nameChanged) {
      console.log(`[updatePlayer] Name changed from "${oldName}" to "${newName}" - updating box scores`)

      // Helper to check if a game's box score contains the old name
      const gameHasPlayerName = (game, name) => {
        if (!game.boxScore) return false
        const checkStats = (stats) => Array.isArray(stats) && stats.some(row => row.playerName === name)
        const checkSide = (side) => side && Object.values(side).some(checkStats)
        return checkSide(game.boxScore.home) || checkSide(game.boxScore.away) ||
          (Array.isArray(game.boxScore.scoringSummary) &&
           game.boxScore.scoringSummary.some(play => play.scorer === name || play.passer === name))
      }

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

      const updatedGames = (dynasty.games || []).map(game => {
        if (!game.boxScore) return game

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
            return updated
          })
        }

        return { ...game, boxScore: updatedBoxScore }
      })

      updateData.games = updatedGames

      // OPTIMIZATION: For cloud storage with name change, save player + only affected games individually
      if (isCloudStorage) {
        try {
          console.log(`[updatePlayer] OPTIMIZED: Saving player + affected games individually`)

          // Set listener-skip guards for both players AND games subcollections
          // so the real-time listener doesn't clobber our local changes.
          skipListenerUpdatesCountRef.current = Math.max(skipListenerUpdatesCountRef.current, 3)
          skipListenerTimestampRef.current = Date.now()
          lastPlayersUpdateTimestampRef.current = Date.now()
          lastPlayersUpdateDynastyIdRef.current = dynastyId
          lastGamesUpdateTimestampRef.current = Date.now()
          lastGamesUpdateDynastyIdRef.current = dynastyId

          // Normalize through v2 sync.
          finalPlayer = syncDerivedFieldsFromV2(finalPlayer, dynasty?.currentYear)

          // Save the player
          await savePlayerToSubcollection(dynastyId, finalPlayer)

          // Find and save only the games that actually had the player's name
          const affectedGames = updatedGames.filter(game => gameHasPlayerName(game, newName))
          console.log(`[updatePlayer] Updating ${affectedGames.length} affected games (out of ${updatedGames.length} total)`)

          for (const game of affectedGames) {
            await saveGameToSubcollection(dynastyId, game)
          }

          // Re-stamp now that writes are durable so the 10-second window
          // starts from write-complete, not write-initiated.
          lastPlayersUpdateTimestampRef.current = Date.now()
          lastGamesUpdateTimestampRef.current = Date.now()

          // Update local React state
          const updatedDynasty = { ...dynasty, players: updatedPlayers, games: updatedGames, lastModified: Date.now() }

          setDynasties(prev => prev.map(d =>
            String(d.id) === String(dynastyId) ? updatedDynasty : d
          ))

          if (String(currentDynasty?.id) === String(dynastyId)) {
            setCurrentDynasty(updatedDynasty)
          }

          return
        } catch (error) {
          console.error('[updatePlayer] Optimized name-change update failed, falling back to batch:', error)
          // Fall through to batch update
        }
      }
    }

    // Fallback: Use batch update (for local storage or if optimization failed)
    await updateDynasty(dynastyId, updateData)
  }

  // Delete a player from the dynasty
  // Adds a 'removed' movement to track the deletion before removing
  const deletePlayer = async (dynastyId, playerPid) => {
    if (blockIfReadOnly(dynastyId, 'delete player')) return
    // Use helper functions for consistent storage routing based on dynasty.storageType
    const dynasty = await findDynastyById(dynastyId)

    if (!dynasty) {
      console.error('Dynasty not found:', dynastyId)
      return
    }

    // Determine storage type
    const looksLikeFirebaseId = typeof dynastyId === 'string' && dynastyId.length >= 20 && !/^\d+$/.test(dynastyId)
    const isCloudStorage = looksLikeFirebaseId || (dynasty.storageType === 'cloud' && user)

    // Find the player being deleted to add a removal movement
    const playerToDelete = (dynasty.players || []).find(p => p.pid === playerPid)
    // Get tid directly - tid is the ONLY source of truth
    const teamTid = getCurrentTeamTid(dynasty)

    // OPTIMIZATION: For cloud storage, use single-document delete instead of rewriting all players
    if (isCloudStorage) {
      console.log(`[deletePlayer] OPTIMIZED: Deleting single player ${playerPid} from cloud`)

      try {
        // CRITICAL: Set the listener-skip guards BEFORE the Firestore write,
        // mirroring the batch updateDynasty() path. Without this, the real-
        // time listener fires as a side effect of the delete, reads the
        // players subcollection via its own data stream (which may not have
        // seen the delete yet), and overwrites local React state with a
        // stale snapshot — bringing the deleted player back. This is the
        // exact bug that made deleted players "reappear after reload".
        //
        // See the listener's guard at the top of subscribeToDynasties'
        // callback: it preserves local state when the refs below are set
        // and younger than 10s.
        skipListenerUpdatesCountRef.current = Math.max(skipListenerUpdatesCountRef.current, 3)
        skipListenerTimestampRef.current = Date.now()
        lastPlayersUpdateTimestampRef.current = Date.now()
        lastPlayersUpdateDynastyIdRef.current = dynastyId

        // Delete single player from Firestore subcollection (1 delete instead of N writes)
        await deletePlayerFromSubcollection(dynastyId, playerPid)

        // Re-stamp the timestamp AFTER the write so the 10-second window
        // starts when Firestore actually has the delete, not when we
        // decided to do it.
        lastPlayersUpdateTimestampRef.current = Date.now()

        // Update local React state - remove the player from the array
        const updatedPlayers = (dynasty.players || []).filter(player => player.pid !== playerPid)
        const updatedDynasty = { ...dynasty, players: updatedPlayers, lastModified: Date.now() }

        setDynasties(prev => prev.map(d =>
          String(d.id) === String(dynastyId) ? updatedDynasty : d
        ))

        if (String(currentDynasty?.id) === String(dynastyId)) {
          setCurrentDynasty(updatedDynasty)
        }

        return
      } catch (error) {
        console.error('[deletePlayer] Single-doc delete failed, falling back to batch:', error)
        // Fall through to batch update
      }
    }

    // BATCH PATH: Used for local storage or if optimization failed
    // If player exists and has movements, add a 'removed' movement before deleting
    if (playerToDelete) {
      // Get player's team as tid
      let playerTeamTid = playerToDelete.team
      if (typeof playerTeamTid === 'string') {
        playerTeamTid = getTidFromAbbr(playerTeamTid, dynasty) || teamTid
      }
      if (!playerTeamTid) {
        playerTeamTid = teamTid
      }

      // Mark + remove. The previous version appended a legacy 'removed'
      // movements[] entry to the player object, but the very next .filter
      // call drops the player from dynasty.players[] entirely — so the
      // movement write was never persisted anywhere. Just mark and
      // filter; nothing else reads `isRemoved`/`removedYear` after this.
      const updatedPlayers = (dynasty.players || []).map(player => {
        if (player.pid === playerPid) {
          return { ...player, isRemoved: true, removedYear: dynasty.currentYear }
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
  // Options: { skipGamesPlayed: boolean } - if true, preserve existing gamesPlayed values
  const syncAllPlayersStats = async (dynastyId, year, options = {}) => {
    console.log('syncAllPlayersStats called with:', { dynastyId, year, options })
    // Use helper functions for consistent storage routing based on dynasty.storageType
    const dynasty = await findDynastyById(dynastyId)

    if (!dynasty) {
      console.error('Dynasty not found:', dynastyId)
      throw new Error('Dynasty not found')
    }

    const gamesWithBoxScores = (dynasty.games || []).filter(g => g.boxScore && Number(g.year) === Number(year)).length
    console.log('Syncing stats for year:', year, 'skipGamesPlayed:', options.skipGamesPlayed)
    console.log('Games with box scores:', gamesWithBoxScores)

    const updatedPlayers = recalculateStatsFromBoxScores(
      dynasty.players || [],
      dynasty.games || [],
      year,
      options
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
        getCoachNameForUid(dynasty, dynasty.userId, ''),
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
        getCoachNameForUid(dynasty, dynasty.userId, ''),
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
        dynasty.teams
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

  /**
   * Compute a Firestore-/object-shaped patch that distributes a bulk
   * conference map ({"Big Ten": ["MICH", "OSU", ...], ...}) across
   * every team's per-year record. Writing to each team's
   * `byYear[year].conference` makes that field the single source of
   * truth — bulk callers (offseason recap, conference standings page,
   * conference sheet sync) used to write only `customConferencesByYear`,
   * which left the per-team field stale and forced every reader to
   * juggle multiple stores.
   *
   * Returns an object with two keys:
   *   • localPatch — nested object suitable for IndexedDB merges
   *     (mutates dynasty.teams in place inside the patch).
   *   • cloudPatch — Firestore dot-path map (e.g.
   *     "teams.42.byYear.2034.conference": "Big Ten").
   *
   * Caller picks whichever applies based on dynasty.storageType. The
   * old customConferencesByYear / customConferences writes are still
   * emitted by callers for the duration of Phase 1 — the migration
   * pass in Phase 2 will let us retire them.
   */
  const buildPerTeamConferencePatch = (dynasty, year, conferenceMap) => {
    const yearKey = String(year)
    const cloudPatch = {}
    const localTeamsPatch = {}
    if (!dynasty || !conferenceMap || typeof conferenceMap !== 'object') {
      return { localPatch: {}, cloudPatch }
    }
    const teams = dynasty.teams || {}
    // Build an abbr-uppercase → tid index of the dynasty's current
    // team registry so we can resolve "MICH" → tid 42 even if the
    // user has renamed a teambuilder team since the last save.
    const abbrToTid = new Map()
    for (const [tid, team] of Object.entries(teams)) {
      const abbr = (team?.abbr || '').toUpperCase()
      if (abbr) abbrToTid.set(abbr, tid)
    }
    for (const [conferenceName, abbrs] of Object.entries(conferenceMap)) {
      if (!Array.isArray(abbrs)) continue
      for (const rawAbbr of abbrs) {
        if (!rawAbbr) continue
        const tid = abbrToTid.get(String(rawAbbr).toUpperCase())
        if (!tid) continue
        cloudPatch[`teams.${tid}.byYear.${yearKey}.conference`] = conferenceName
        // Nested local patch — caller merges this into updates.teams.
        if (!localTeamsPatch[tid]) {
          const existingTeam = teams[tid] || {}
          localTeamsPatch[tid] = {
            ...existingTeam,
            byYear: { ...(existingTeam.byYear || {}) },
          }
        }
        const yearData = localTeamsPatch[tid].byYear[yearKey] || {}
        localTeamsPatch[tid].byYear[yearKey] = { ...yearData, conference: conferenceName }
      }
    }
    return {
      localPatch: Object.keys(localTeamsPatch).length ? { teams: localTeamsPatch } : {},
      cloudPatch,
    }
  }

  /**
   * Persist a bulk conference alignment for a single year. Writes to
   * BOTH the legacy stores (customConferencesByYear /
   * customConferences) and the per-team byYear field — the per-team
   * field is the new source of truth, and the legacy stores stay
   * during Phase 1 so older readers / unmigrated data keep working.
   *
   * Used by Conference Standings (manual save) and the offseason
   * recap on Dashboard (where the new year's alignment is committed).
   */
  const saveConferenceAlignment = async (dynastyId, year, conferenceMap, options = {}) => {
    if (blockIfReadOnly(dynastyId, 'save conference alignment')) return
    const dynasty = await findDynastyById(dynastyId)
    if (!dynasty) {
      console.error('Dynasty not found:', dynastyId)
      return
    }
    const useLocalStorage = dynasty.storageType !== 'cloud'
    const yearKey = String(year)
    const { localPatch, cloudPatch } = buildPerTeamConferencePatch(dynasty, year, conferenceMap)

    if (useLocalStorage) {
      const existingByYear = dynasty.customConferencesByYear || {}
      const updates = {
        customConferencesByYear: { ...existingByYear, [yearKey]: conferenceMap },
        customConferences: conferenceMap,
      }
      if (localPatch.teams) {
        updates.teams = {
          ...(dynasty.teams || {}),
          ...localPatch.teams,
        }
      }
      // Optional: caller can pass extra updates to merge in atomically
      // (e.g. preseasonSetup flags). Spread last so callers can override
      // anything if needed.
      if (options.extraUpdates) Object.assign(updates, options.extraUpdates)
      await updateDynasty(dynastyId, updates)
    } else {
      const existingByYear = dynasty.customConferencesByYear || {}
      const cloudUpdates = {
        customConferencesByYear: { ...existingByYear, [yearKey]: conferenceMap },
        customConferences: conferenceMap,
        ...cloudPatch,
      }
      if (options.extraUpdates) Object.assign(cloudUpdates, options.extraUpdates)
      await updateDynasty(dynastyId, cloudUpdates)
    }
  }

  // Save conferences data from sheet to dynasty
  const saveConferences = async (dynastyId, conferencesSheetId) => {
    if (!user) {
      throw new Error('You must be signed in to sync conferences')
    }

    // Use helper functions for consistent storage routing based on dynasty.storageType
    const dynasty = await findDynastyById(dynastyId)

    if (!dynasty) {
      throw new Error('Dynasty not found')
    }

    try {
      // Read conferences from Google Sheet
      const conferences = await readConferencesFromSheet(conferencesSheetId, dynasty?.teams || dynasty?.customTeams)

      // Derive storage type from dynasty's storageType field
      const useLocalStorage = dynasty.storageType !== 'cloud'

      // Fan out to per-team field — single source of truth for
      // conference assignment going forward.
      const sheetYear = Number(dynasty.currentYear) || new Date().getFullYear()
      const { localPatch, cloudPatch } = buildPerTeamConferencePatch(dynasty, sheetYear, conferences)

      if (useLocalStorage) {
        // Local storage: Use IndexedDB
        const currentDynasties = await indexedDBStorage.getDynasties() || []
        const dynastyToUpdate = currentDynasties.find(d => d.id === dynastyId)
        if (dynastyToUpdate) {
          dynastyToUpdate.customConferences = conferences
          dynastyToUpdate.preseasonSetup = {
            ...dynastyToUpdate.preseasonSetup,
            conferencesEntered: true
          }
          if (localPatch.teams) {
            dynastyToUpdate.teams = {
              ...(dynastyToUpdate.teams || {}),
              ...localPatch.teams,
            }
          }
          dynastyToUpdate.lastModified = Date.now()
          await indexedDBStorage.saveDynasties(currentDynasties)
          setDynasties(currentDynasties)
          if (currentDynasty?.id === dynastyId) {
            setCurrentDynasty(dynastyToUpdate)
          }
        }
      } else {
        // Cloud storage: Use Firestore dot notation
        await updateDynastyInFirestore(dynastyId, {
          customConferences: conferences,
          'preseasonSetup.conferencesEntered': true,
          ...cloudPatch,
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
    // Find the dynasty to export — search BOTH owner dynasties AND
    // shared dynasties so editors (uid in editors[] but not the owner)
    // can also download a backup.
    let dynasty = dynasties.find(d => String(d.id) === String(dynastyId))
      || sharedDynasties.find(d => String(d.id) === String(dynastyId))

    if (!dynasty) {
      toast.error('Dynasty not found')
      return
    }

    // For cloud dynasties with subcollections, ensure we have the latest data
    // This is especially important for read-only users where initial load might have failed.
    //
    // We pull every subcollection the dynasty has — players, games, weekRecaps,
    // and the per-year seasons docs. The seasons subcollection holds all the
    // per-year + per-team-year fields that used to live on the main dynasty
    // doc (allAmericansByYear, cfpSeedsByYear, recruitingCommitmentsByTeamYear,
    // etc.) before the 1 MB cap forced them out. Without rehydrating them,
    // the export looks like every CFP / awards / standings field got wiped
    // — which is exactly the false alarm a beta user hit on UK_2034_Week12.
    if (dynasty.storageType === 'cloud') {
      try {
        const [players, games, weekRecaps, seasonalRehydrated] = await Promise.all([
          getPlayersSubcollection(dynasty.id),
          getGamesSubcollection(dynasty.id),
          getWeekRecapsSubcollection(dynasty.id),
          getSeasonsSubcollection(dynasty.id),
        ])

        // Merge fresh data with dynasty. Seasonal fields are merged
        // back into their legacy ByYear / ByTeamYear shapes so the
        // export is shape-compatible with backups taken before the
        // subcollection migration — old re-imports keep working.
        dynasty = {
          ...dynasty,
          players: players || [],
          games: games || [],
          weekRecapsByYear: weekRecaps || {},
          ...seasonalRehydrated,
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

    // Prefer the File System Access API so the browser shows a real
    // "Save As" dialog and the user picks the destination. Falls back to
    // the legacy anchor-click flow on browsers that don't support it
    // (Firefox, Safari, in-app webviews).
    if (typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function') {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{
            description: 'Dynasty backup (JSON)',
            accept: { 'application/json': ['.json'] },
          }],
        })
        const writable = await handle.createWritable()
        await writable.write(jsonString)
        await writable.close()
        return
      } catch (err) {
        // User cancelled the picker — bail without falling back.
        if (err?.name === 'AbortError') return
        // Any other error: fall through to the legacy download path.
        console.warn('showSaveFilePicker failed, falling back to direct download:', err)
      }
    }

    // Legacy fallback: trigger an immediate download to the default folder.
    const blob = new Blob([jsonString], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  /**
   * Core import processing logic shared by file and URL import
   * @param {Object} dynastyData - Parsed JSON dynasty data
   * @param {Function} reportProgress - Progress reporting callback
   */
  const processImportData = async (dynastyData, reportProgress) => {
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

    // CRITICAL: Reset roster migration flag to ensure teamsByYear entries are properly
    // populated for all players. Without this, players may not appear on the roster
    // after import because their teamsByYear entries might be missing or incomplete.
    // This forces the migration to run fresh on the imported data.
    delete cleanDynastyData._rosterMigratedV3

    // Multiplayer-of-N seeder: imports built by external migrators
    // (e.g. the Tracker spreadsheet migrator) carry an
    // `_importMemberSeed` hint with the user's tid + coach name + a
    // year→tid map. Stamp the editors/memberTeams/memberLabels/
    // memberTeamHistory fields here using the importer's real Firebase
    // auth UID. Skip if the import already brought populated fields
    // keyed by a real-looking UID.
    const importerUid = user?.uid
    const seed = cleanDynastyData._importMemberSeed
    delete cleanDynastyData._importMemberSeed
    const hasRealMemberData =
      Array.isArray(cleanDynastyData.editors) &&
      cleanDynastyData.editors.length > 0 &&
      cleanDynastyData.editors.every(uid =>
        typeof uid === 'string' && uid.length >= 20 && !uid.includes('imported')
      )
    if (importerUid && seed && !hasRealMemberData) {
      const tid = Number(seed.tid) || cleanDynastyData.currentTid || null
      const coachLabel = (seed.coachName && seed.coachName !== '[Your Name]')
        ? seed.coachName
        : (cleanDynastyData.coachName || 'Coach')
      cleanDynastyData.editors = [importerUid]
      cleanDynastyData.memberTeams = tid ? { [importerUid]: [tid] } : {}
      cleanDynastyData.memberLabels = { [importerUid]: coachLabel }
      const yearMap = seed.teamHistoryByYear || {}
      cleanDynastyData.memberTeamHistory = {
        [importerUid]: { ...yearMap }
      }
      // Also tag the user team slot so getUserTeamTid resolves cleanly.
      const teams = cleanDynastyData.teams
      if (tid && teams && teams[tid]) {
        teams[tid] = { ...teams[tid], userId: importerUid }
      }
    }

    // Save the dynasty using createDynasty logic
    const useLocalStorage = !storageService.isPremium()

    if (useLocalStorage) {
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

      // CRITICAL: Apply migrations to all dynasties (including the imported one)
      // This ensures roster data, movements, and tid structures are properly set up
      // Without this, players may be missing teamsByYear entries and not appear on roster
      const migratedDynasties = applyMigrations(updatedDynasties)

      await indexedDBStorage.saveDynasties(migratedDynasties)
      setDynasties(migratedDynasties)

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
      // CRITICAL: this branch writes to Firestore, so the doc MUST declare
      // storageType: 'cloud'. Earlier in this function we defaulted to
      // 'local' (line ~9776) for the IndexedDB path; override it here.
      // The Firestore security rule rejects cloud-collection creates
      // unless storageType is exactly 'cloud'.
      mainDocData.storageType = 'cloud'

      // Stage 2: Create the main dynasty document (without players/games)
      reportProgress('creating', 'Creating dynasty record...', 15)
      const result = await createDynastyInFirestore(user.uid, mainDocData)
      reportProgress('creating', 'Dynasty record created', 20)

      // Stage 3: Save players to subcollection if there are any
      if (playerCount > 0) {
        reportProgress('players', `Importing players (0/${playerCount})...`, 25)

        // Import players in batches and report progress.
        //
        // PERF: Previously this passed `players.slice(0, batchEnd)` to
        // savePlayersToSubcollection on every iteration — meaning each
        // batch re-saved every prior batch on top of the new one. For
        // 1027 players that became 500 + 1000 + 1027 = 2527 doc writes
        // instead of 1027, and the cost grew quadratically with player
        // count. The user's BAMA dynasty was hanging at "Importing
        // players (0/1027)" because of this. Pass only the new batch.
        const BATCH_SIZE = 500
        for (let i = 0; i < playerCount; i += BATCH_SIZE) {
          const batchEnd = Math.min(i + BATCH_SIZE, playerCount)
          const batchPlayers = players.slice(i, batchEnd)

          // Save just this batch — savePlayersToSubcollection upserts
          // by pid, so each call only writes the docs it was handed.
          await savePlayersToSubcollection(result.id, batchPlayers)

          // Calculate progress (players are 25-60% of total)
          const playerProgress = 25 + Math.round((batchEnd / playerCount) * 35)
          reportProgress('players', `Importing players (${batchEnd}/${playerCount})...`, playerProgress, `${batchEnd} of ${playerCount} players`)
        }
      }

      // Stage 4: Save games to subcollection if there are any
      if (gameCount > 0) {
        reportProgress('games', `Importing games (0/${gameCount})...`, 65)

        // Same fix as the player loop above — pass only the new batch.
        const BATCH_SIZE = 500
        for (let i = 0; i < gameCount; i += BATCH_SIZE) {
          const batchEnd = Math.min(i + BATCH_SIZE, gameCount)
          const batchGames = games.slice(i, batchEnd)

          await saveGamesToSubcollection(result.id, batchGames)

          // Calculate progress (games are 65-95% of total)
          const gameProgress = 65 + Math.round((batchEnd / gameCount) * 30)
          reportProgress('games', `Importing games (${batchEnd}/${gameCount})...`, gameProgress, `${batchEnd} of ${gameCount} games`)
        }
      }

      // For local state, include players and games
      cleanDynastyData._subcollectionsMigrated = true
      reportProgress('complete', 'Import complete!', 100)
    }

    return cleanDynastyData
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
          reportProgress('parsing', 'Reading file...', 5)
          const rawContent = e.target.result

          let dynastyData
          try {
            dynastyData = JSON.parse(rawContent)
          } catch (parseError) {
            throw new Error(`JSON parse error: ${parseError.message}`)
          }

          const result = await processImportData(dynastyData, reportProgress)
          resolve(result)
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
   * Import a dynasty from a URL (e.g., Dropbox, GitHub raw)
   * @param {string} url - URL pointing to a JSON file
   * @param {Function} onProgress - Optional callback for progress updates
   */
  const importDynastyFromUrl = async (url, onProgress = null) => {
    const reportProgress = (stage, message, progress, detail = null) => {
      if (onProgress) {
        onProgress({ stage, message, progress, detail })
      }
    }

    try {
      reportProgress('parsing', 'Fetching file from URL...', 2)

      // Convert common sharing URLs to direct download URLs
      let fetchUrl = url.trim()

      // Dropbox: change dl=0 to dl=1, or add dl=1
      if (fetchUrl.includes('dropbox.com')) {
        fetchUrl = fetchUrl.replace('www.dropbox.com', 'dl.dropboxusercontent.com')
        fetchUrl = fetchUrl.replace('dl=0', 'dl=1')
        if (!fetchUrl.includes('dl=1') && !fetchUrl.includes('dl.dropboxusercontent.com')) {
          fetchUrl += (fetchUrl.includes('?') ? '&' : '?') + 'dl=1'
        }
      }

      // GitHub: convert blob URLs to raw
      if (fetchUrl.includes('github.com') && fetchUrl.includes('/blob/')) {
        fetchUrl = fetchUrl.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/')
      }

      const response = await fetch(fetchUrl)
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`)
      }

      reportProgress('parsing', 'Reading response...', 5)
      const rawContent = await response.text()

      let dynastyData
      try {
        dynastyData = JSON.parse(rawContent)
      } catch (parseError) {
        throw new Error(`The URL did not return valid JSON. Make sure the link points directly to a .json file.`)
      }

      const result = await processImportData(dynastyData, reportProgress)
      return result
    } catch (error) {
      console.error('Error importing dynasty from URL:', error)
      throw new Error(error.message || 'Failed to import from URL')
    }
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

    // Use helper functions for consistent storage routing based on dynasty.storageType
    const dynasty = await findDynastyById(dynastyId)

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

    // Coach awards — recipients are head coaches / coordinators, not roster
    // players. They live on the Awards page already (read from awardsByYear
    // directly) and must NOT be created as player records.
    const COACH_AWARD_KEYS = new Set(['bearBryantCoachOfTheYear', 'broyles'])

    // Process each entry
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]

      // Skip entries without a name
      if (!entry.player && !entry.name) continue

      // Skip coach awards entirely — do not create player records for them.
      // They're already stored in awardsByYear and rendered on the Awards /
      // Coach Career pages.
      const awardKey = entry.award || entry.awardKey
      if (honorType === 'awards' && awardKey && COACH_AWARD_KEYS.has(awardKey)) {
        continue
      }

      const playerName = entry.player || entry.name
      // For allAmericans/allConference, school is the team; entry.team is the category label
      const playerTeam = (entry.school || entry.team || '').toUpperCase()
      const playerPosition = entry.position || ''

      // Find matching player. Pass dynasty.teams so teambuilder-renamed slots
      // resolve correctly during honor matching (else a TB takeover would
      // mis-classify the same person as a transfer).
      const match = findMatchingPlayer(playerName, playerTeam, year, existingPlayers, dynasty?.teams)

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

    // Apply ALL the unambiguous work right now — exact name+team matches
    // get linked, brand-new entries get created — even if some transfer
    // confirmations are still pending below. We used to bail out early
    // here whenever ANY entry needed confirmation, which left honor-only
    // players (the unambiguous "no match" cases) with no player record
    // until the user resolved the modal. Splitting the flow this way
    // means every honor entry that doesn't need a human decision lands
    // immediately, and only the genuinely-ambiguous "same name on a
    // different team within 5 seasons" cases stop for confirmation.
    if (confirmations.length > 0) {
      console.log(`[processHonorPlayers] ${confirmations.length} entry(s) need confirmation — applying ${playersToUpdate.length} auto-links and ${playersToCreate.length} auto-creates immediately`)
    } else {
      console.log(`[processHonorPlayers] No confirmations needed. Updates: ${playersToUpdate.length}, Creates: ${playersToCreate.length}`)
    }

    // Apply updates to existing players
    // Use filter instead of find to get ALL updates for each player (e.g., multiple awards)
    let updatedPlayers = existingPlayers.map(p => {
      const updates = playersToUpdate.filter(u => u.pid === p.pid)
      if (updates.length === 0) return p

      const updatedPlayer = { ...p }

      // Initialize arrays if needed
      if (!updatedPlayer.accolades) updatedPlayer.accolades = []
      if (!updatedPlayer.allAmericans) updatedPlayer.allAmericans = []
      if (!updatedPlayer.allConference) updatedPlayer.allConference = []
      if (!updatedPlayer.teams) updatedPlayer.teams = []

      // Clone nested maps so we don't mutate the original player object
      updatedPlayer.teamsByYear = { ...(updatedPlayer.teamsByYear || {}) }
      updatedPlayer.classByYear = { ...(updatedPlayer.classByYear || {}) }

      // Process each update for this player
      for (const update of updates) {
        // Add team if not already present
        if (update.addTeam && !updatedPlayer.teams.includes(update.addTeam)) {
          updatedPlayer.teams.push(update.addTeam)
        }

        // Record roster membership and class for the honor year so the player's
        // profile (timeline, team, classByYear) reflects the honor they just won.
        // Transfer-confirmed matches can land the player on a different team than
        // their previous year — this is what makes the timeline/team page update.
        const honorYear = update.entry?.year
        if (honorYear) {
          if (update.addTeam) {
            const teamTid = getTidFromAbbr(update.addTeam, dynasty) || update.addTeam
            updatedPlayer.teamsByYear[honorYear] = teamTid
          }
          if (update.entry?.class) {
            updatedPlayer.classByYear[honorYear] = update.entry.class
          }
        }

        // Add honor entry based on type
        if (update.honorType === 'awards') {
          // Normalize the award name to the canonical key before
          // dedup or storage — legacy entries on existing players
          // sometimes hold the LABEL ("Chuck Bednarik Award") while
          // the dropdown stores the KEY ("chuckBednarik"). Without
          // normalization the dupe check missed label-vs-key matches
          // and pushed a second ghost row on every sync. After
          // normalization both rows compare as the same canonical key.
          const awardName = normalizeAwardName(update.entry.award || update.entry.awardKey)
          if (awardName && update.entry.year) {
            const isDupe = updatedPlayer.accolades.some(a =>
              a.year === update.entry.year && normalizeAwardName(a.award) === awardName
            )
            if (!isDupe) {
              updatedPlayer.accolades.push({
                year: update.entry.year,
                award: awardName,
                team: update.entry.team,
                position: update.entry.position,
                class: update.entry.class
              })
            }
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
      const teamTid = getTidFromAbbr(newPlayer.team, dynasty) || newPlayer.team
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
        if (!existingInBatch.accolades) existingInBatch.accolades = []
        if (!existingInBatch.allAmericans) existingInBatch.allAmericans = []
        if (!existingInBatch.allConference) existingInBatch.allConference = []

        if (newPlayer.honorType === 'awards') {
          // Same normalization rationale as the updates path above —
          // canonicalize to the dropdown key so label/key dupes
          // collapse and writes use a single stored shape.
          const awardName = normalizeAwardName(newPlayer.entry.award || newPlayer.entry.awardKey)
          if (awardName && newPlayer.entry.year) {
            const isDupe = existingInBatch.accolades.some(a =>
              a.year === newPlayer.entry.year && normalizeAwardName(a.award) === awardName
            )
            if (!isDupe) {
              existingInBatch.accolades.push({
                year: newPlayer.entry.year,
                award: awardName,
                team: newPlayer.entry.team,
                position: newPlayer.entry.position,
                class: newPlayer.entry.class
              })
            }
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

      // Create new player. Honor-imported players are regular roster
      // records — `isHonorOnly: false` is set explicitly so the legacy
      // `!p.isHonorOnly` filters scattered around the codebase keep them
      // in every roster / leaderboard / players list view.
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
        teamsByYear: { [entryYear]: teamTid },
        accolades: [],
        allAmericans: [],
        allConference: [],
        isHonorOnly: false,
      }

      // Add the honor entry. Award name canonicalized to the dropdown
      // key so storage has a single source of truth.
      if (newPlayer.honorType === 'awards') {
        const awardName = normalizeAwardName(newPlayer.entry.award || newPlayer.entry.awardKey)
        if (awardName && newPlayer.entry.year) {
          player.accolades.push({
            year: newPlayer.entry.year,
            award: awardName,
            team: newPlayer.entry.team,
            position: newPlayer.entry.position,
            class: newPlayer.entry.class
          })
        }
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

    // Save updated players. Always runs — even when confirmations are
    // still pending below — so the unambiguous links/creates land
    // immediately. The pending transfers are returned alongside so the
    // caller can pop the confirmation modal for those specific entries.
    await updateDynasty(dynastyId, {
      players: updatedPlayers,
      nextPID
    })

    if (confirmations.length > 0) {
      return {
        success: true,
        needsConfirmation: true,
        confirmations,
        message: `Linked ${playersToUpdate.length} and created ${playersToCreate.length}; ${confirmations.length} possible transfer(s) need confirmation`,
      }
    }

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

    // For dynasties without an explicit dynasty.teams map, seed from the
    // static FBS registry so the override write below has a base to merge.
    const sourceTeams = dynasty.teams || TEAMS
    const team = sourceTeams[tid] || TEAMS[tid]
    if (!team) return { success: false, message: 'Team not found' }

    // Get old abbreviation for customTeams key update
    const oldAbbr = team.abbr
    const newAbbr = updates.abbreviation?.toUpperCase() || updates.abbr?.toUpperCase() || oldAbbr

    // Build updated team object — preserve original isCustom flag so
    // FBS overrides don't get re-flagged as TeamBuilder slots.
    const updatedTeam = {
      ...team,
      abbr: newAbbr,
      name: updates.name || team.name,
      primaryColor: updates.primaryColor || team.primaryColor,
      secondaryColor: updates.secondaryColor || team.secondaryColor,
      logo: updates.logoUrl || updates.logo || team.logo,
      isCustom: team.isCustom || false,
    }

    // Single source of truth: write only to the tid slot. The legacy
    // `customTeams` map is no longer maintained.
    const dynastyUpdates = {
      [`teams.${tid}`]: updatedTeam,
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

  // Add a brand-new team to the dynasty's teams map at a fresh tid.
  // Use case: a team got accidentally removed from the dynasty (e.g.
  // an abbr collision in an imported spreadsheet caused a real team to
  // be dropped) and the user needs to add it back. Picks the next
  // unused tid (max(existing) + 1, with a floor of 1000 so we don't
  // collide with the reserved static FBS range 1-200).
  const addCustomTeam = async (dynastyId, newTeam) => {
    const dynasty = dynasties.find(d => d.id === dynastyId)
    if (!dynasty) return { success: false, message: 'Dynasty not found' }

    const sourceTeams = dynasty.teams || TEAMS
    const existingTids = Object.keys(sourceTeams).map(Number).filter(Number.isFinite)
    const newTid = Math.max(1000, ...existingTids) + 1

    const abbr = (newTeam.abbreviation || newTeam.abbr || '').toUpperCase()
    if (!abbr || abbr.length < 2) {
      return { success: false, message: 'Abbreviation must be at least 2 characters' }
    }
    // Reject collisions with any existing team in the dynasty
    for (const t of Object.values(sourceTeams)) {
      if (t?.abbr?.toUpperCase() === abbr) {
        return { success: false, message: `Abbreviation "${abbr}" is already used by ${t.name || 'another team'}` }
      }
    }

    const built = {
      tid: newTid,
      abbr,
      name: newTeam.name || abbr,
      primaryColor: newTeam.primaryColor || '#444444',
      secondaryColor: newTeam.secondaryColor || '#ffffff',
      logo: newTeam.logoUrl || newTeam.logo || '',
      isFCS: false,
      byYear: {},
    }

    try {
      await updateDynasty(dynastyId, { [`teams.${newTid}`]: built })
      return { success: true, tid: newTid, message: 'Team added' }
    } catch (error) {
      console.error('Failed to add team:', error)
      return { success: false, message: error.message || 'Failed to add team' }
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

  // Backward-compat: a few older consumers still destructure `customTeams`
  // from the context. Keep the export but always null — the migration
  // collapses the field on load and nothing writes it anymore. Consumers
  // should read `dynasty.teams[tid]` instead.
  const customTeams = null

  // View-only when the user lacks edit access. Three buckets:
  //   - Owner of a cloud dynasty needs premium (the owner pays for cloud
  //     storage). A premium owner who lapses falls back to read-only here.
  //   - Anyone in editors[] (invited members + co-commishes) can EDIT,
  //     even on the free tier — the commish's premium covers storage.
  //   - Everyone else (random viewers, signed-out users) is read-only.
  const isViewOnly = (() => {
    if (!currentDynasty) return false
    if (currentDynasty.storageType !== 'cloud') return false
    if (!user?.uid) return true
    const isOwner = currentDynasty.userId === user.uid
    if (isOwner) return !isPremium
    const isInvited = Array.isArray(currentDynasty.editors)
      && currentDynasty.editors.includes(user.uid)
    return !isInvited
  })()

  // ─── Sharing: subscribe to dynasties shared with the user (uid in
  // editors[] but not the owner). Merged into the main dynasties list
  // below so existing consumers keep working without changes.
  const [sharedDynasties, setSharedDynasties] = useState([])
  useEffect(() => {
    if (!user?.uid) {
      setSharedDynasties([])
      return
    }
    const unsub = subscribeToSharedDynasties(user.uid, (leagues) => {
      const tagged = leagues
        .filter(d => d.userId !== user.uid)
        .map(d => ({ ...d, storageType: 'cloud' }))
      setSharedDynasties(applyMigrations(tagged))
    })
    return unsub
  }, [user?.uid])

  // Merge owner dynasties + shared dynasties, dedup by id. Owner entries
  // win — they have full subcollection data; shared entries are
  // metadata until selected for lazy load.
  const dynastiesWithShared = (() => {
    if (!sharedDynasties.length) return dynasties
    const ownerIds = new Set(dynasties.map(d => d.id))
    const onlyShared = sharedDynasties.filter(d => !ownerIds.has(d.id))
    return [...dynasties, ...onlyShared]
  })()

  // ─── Per-user active team ────────────────────────────────────────
  // Each user's "active team" is one of the tids they own via
  // memberTeams[uid]. Commish + co-commishes can have several so they
  // can manage non-premium users' teams; this state tracks which one
  // they're currently focused on. Stored in localStorage keyed by
  // (dynastyId, uid) so it sticks across reloads and only matters
  // per-device.
  const [activeTeamByKey, setActiveTeamByKey] = useState({})

  const _activeTeamKey = (currentDynasty?.id && user?.uid)
    ? `${currentDynasty.id}:${user.uid}`
    : null

  // Hydrate the cached active-team selection when the dynasty or user
  // changes.
  useEffect(() => {
    if (!_activeTeamKey) return
    try {
      const saved = localStorage.getItem(`active-team:${_activeTeamKey}`)
      if (saved != null) {
        const tid = Number(saved)
        if (Number.isFinite(tid)) {
          setActiveTeamByKey(prev => prev[_activeTeamKey] === tid ? prev : { ...prev, [_activeTeamKey]: tid })
        }
      }
    } catch {}
  }, [_activeTeamKey])

  const setActiveTeam = (tid) => {
    if (!_activeTeamKey) return
    const tNum = Number(tid)
    if (!Number.isFinite(tNum)) return
    try { localStorage.setItem(`active-team:${_activeTeamKey}`, String(tNum)) } catch {}
    setActiveTeamByKey(prev => ({ ...prev, [_activeTeamKey]: tNum }))
  }

  // The list of tids this user controls in the current dynasty, in the
  // order they were assigned. Empty array if no assignments — callers
  // fall back to the dynasty-doc-level currentTid.
  const userTeams = (currentDynasty && user?.uid)
    ? getMemberTeams(currentDynasty, user.uid)
    : []

  // The user's currently-focused tid: the saved active selection if it
  // still belongs to them, else their first assigned team.
  const activeUserTid = (() => {
    if (!_activeTeamKey || userTeams.length === 0) return null
    const saved = activeTeamByKey[_activeTeamKey]
    if (saved != null && userTeams.includes(Number(saved))) return Number(saved)
    return userTeams[0]
  })()

  // ─── Per-user dynasty override ───────────────────────────────────
  // Re-stamps `currentTid` and `teams[].userId === 'currentUser'` to
  // match the user's active team. Done as a derived layer at the
  // context boundary so internal writes still flow through the
  // un-overridden currentDynasty — no risk of persisting the override
  // back to Firestore on partial saves.
  const overriddenCurrentDynasty = (() => {
    if (!currentDynasty || !user?.uid) return currentDynasty
    const myTid = activeUserTid
    if (myTid == null) return currentDynasty
    if (Number(currentDynasty.currentTid) === Number(myTid)) return currentDynasty
    const remappedTeams = {}
    if (currentDynasty.teams) {
      for (const [tidStr, team] of Object.entries(currentDynasty.teams)) {
        const isOurTeam = Number(tidStr) === Number(myTid)
        const wasCurrentUser = team?.userId === 'currentUser'
        if (isOurTeam && !wasCurrentUser) {
          remappedTeams[tidStr] = { ...team, userId: 'currentUser' }
        } else if (!isOurTeam && wasCurrentUser) {
          const { userId: _drop, ...rest } = team
          remappedTeams[tidStr] = rest
        } else {
          remappedTeams[tidStr] = team
        }
      }
    }
    return {
      ...currentDynasty,
      currentTid: Number(myTid),
      teams: Object.keys(remappedTeams).length > 0 ? remappedTeams : currentDynasty.teams,
    }
  })()

  const value = {
    dynasties: dynastiesWithShared,
    currentDynasty: overriddenCurrentDynasty,
    userTeams,
    activeUserTid,
    setActiveTeam,
    customTeams,
    loading,
    cloudSyncing,
    loadingDynastyId,
    isViewOnly,
    createDynasty,
    updateDynasty,
    saveWeekRecap,
    deleteWeekRecap,
    deleteDynasty,
    selectDynasty,
    addGame,
    updateGame,
    patchGameFields,
    applyChangedPlayers,
    saveGameSetChanges,
    saveCPUBowlGames,
    saveWeeklyScores,
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
    saveConferenceAlignment,
    exportDynasty,
    importDynasty,
    importDynastyFromUrl,
    processHonorPlayers,
    analyzeDocumentSize,
    optimizeDocumentSize,
    migrateToSubcollections,
    updateTeambuilderTeam,
    addCustomTeam,
    migrateDynastyStorage,
  }

  return (
    <DynastyContext.Provider value={value}>
      {children}
    </DynastyContext.Provider>
  )
}

export default DynastyContext
