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
  leaveDynasty as leaveDynastyInFirestore,
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
  migrateWeekRecapsToSubcollection,
  // Recruiting Database subcollection — same "keep the main doc small"
  // rationale as weekRecaps above.
  getRecruitingDatabaseSubcollection,
  saveRecruitingDatabaseSubcollection,
  migrateRecruitingDatabaseToSubcollection,
  // Scheme Builder depth-chart plans (dynasty.teamFuture) — same rationale,
  // one doc per tid instead of a single ever-growing main-doc field.
  getTeamFutureSubcollection,
  saveTeamFutureSubcollection,
  migrateTeamFutureToSubcollection,
  // Whole-league named recruiting-class rosters (dynasty.teams[tid].byYear
  // [year].recruitingClassRoster) — one doc per (tid, year), same
  // unbounded-per-season growth as PLAYERS/GAMES, so it gets that same
  // granularity rather than the shared per-YEAR seasons doc (too much data
  // for ~130 teams to share one document).
  getRecruitingClassesSubcollection,
  saveRecruitingClassesSubcollection,
  // Key-order-independent equality check — see its own comment. Used for
  // diff-based saves so an object that's semantically unchanged but came
  // back from Firestore with different key order doesn't get rewritten.
  stableStringify,
  // Social Media feature subcollections.
  saveSocialFeedToSubcollection,
  getSocialFeedSubcollection,
  saveSocialCharacterShards,
  clearSocialCharacterOverrides,
  saveSocialCharacterOverrides,
  getSocialCharactersSubcollection
} from '../services/dynastyService'
import {
  PER_YEAR_FIELDS,
  PER_TEAM_YEAR_FIELDS,
  isSeasonalField,
  getSeasonsSubcollection,
  splitSeasonalUpdateByYear,
  writeSeasonalUpdate,
  diffSeasonalDeletions,
  migrateSeasonalFieldsToSubcollection,
  migrateTeamsByYearDuplicatesToSubcollection,
  TEAMS_BYYEAR_FLAT_FIELDS,
  foldTeamsByYearFieldsFromFlat,
  stripTeamsByYearFlatFields
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
import { importUniverse, mergePosts, ensureUniverseLoaded, DEFAULT_SOCIAL_SETTINGS, DEFAULT_SOCIAL_PLATFORM, SOCIAL_UNIVERSE_VERSION } from '../data/socialModel'
import { findMatchingPlayer, getPlayerLastHonorDescription, normalizePlayerName } from '../utils/playerMatching'
import { syncDerivedFieldsFromV2, legacyMovementToCanonical } from '../data/rosterModel'
import { buildDefaultRosterPlayers, buildAllDefaultRosterPlayers } from '../data/defaultRosterLoader'
import { bulkSeedPlayers } from '../utils/cfb27BulkSeed'
import { syncPlayersToSubcollection } from '../utils/cfb27SyncPlayers'
import { chunkUpdateObject } from '../utils/updateChunker'
import { firestoreDocSize, firestoreValueSize } from '../utils/firestoreSize'
import { buildSyncPlan } from '../data/cfb27SaveSync'
import { CFB27_TEAM_RATINGS } from '../data/cfb27TeamRatings'
import { CFB27_TEAM_ABBRS } from '../data/cfb27TeamAbbrs'
import { CFB27_CONFERENCES } from '../data/cfb27Conferences'
import { CFB27_NIL_BUDGETS } from '../data/cfb27NilBudgets'
import { normalizeAwardName } from '../utils/playerHeal'
import { getFirstRoundSlotId, getSlotIdFromBowlName, getCFPGameId, CFP_BRACKET_SLOTS, DEFAULT_BOWL_CONFIG, getBowlForSlot, CFP_BRACKET_FLOW, getBracketFlowConfig } from '../data/cfpConstants'
import { migrateDynastyToEditors, needsEditorsMigration, getMemberTeams, snapshotAllMembersForYear, getCoachNameForUid, canManageMembers, getMemberPhoto, setMemberPhotoValue } from '../data/leagueModel'
import { migrateDynastyToCoaches, makeCoach, deriveMemberTeamsIndex, getCoaches, getCoachesControlledBy, getCurrentTeamsForControlledCoaches, getActiveCoachForTeam, setCoachSeason, carryForwardControlledCoaches, applyStaffMovesToCoaches, syncCoordinatorCoachesForTeamYear } from '../data/coachModel'
import { migrateTeamNameParts } from '../data/teams'
import { isSameWeek, isSameYear } from '../utils/compareUtils'
import { shapeTargetForDatabase } from '../utils/recruitAttributes'
import { settleOrProceed } from '../utils/firestoreWriteGuard'
import { withTimeout } from '../utils/withTimeout'
import { normalizeEditionKey, DEFAULT_EDITION } from '../editions'
import { getSyncStamp, setSyncStamp } from '../utils/subcollectionSyncStamp'
import { getAllStaffDataForDynasty } from '../components/staffDB'

/**
 * Gate a subcollection getter's billed background server re-read on the
 * main doc's rev (max of updatedAt/lastModified — see dynastyDocRev).
 *
 * Every cloud write bumps the main doc's lastModified in the same batch as
 * the subcollection write (bumpDynastyLastModifiedInBatch) — that is the
 * app's existing cross-device sync trigger. So when the current rev equals
 * the stamp recorded after our last COMPLETED server read of a collection,
 * the server can't have anything newer: serve the Firestore local cache
 * and skip the getDocsFromServer entirely (~500 billed reads saved per
 * players load alone). Any remote or local write bumps the rev, the stamp
 * stops matching, and the next load re-reads from the server as before —
 * freshness behavior is unchanged.
 *
 * The stamp is written inside onFresh, i.e. only after a server read
 * actually completed, so a failed background fetch never marks a
 * collection as synced. rev<=0 (legacy docs with no timestamp) always
 * re-reads.
 */
function gatedFreshOptions(dynastyId, collectionName, rev, onFresh) {
  if (rev > 0 && getSyncStamp(dynastyId, collectionName) === rev) {
    return {} // nothing changed since our last completed sync — cache only
  }
  if (!onFresh) return {}
  return {
    // `meta` carries the moment the server read STARTED (requestedAt) so the
    // consumer can reject a snapshot that predates a local write. Forwarding
    // it matters: without it every gated read looks unstamped and falls back
    // to the weaker elapsed-time guard.
    onFresh: (fresh, meta) => {
      if (rev > 0) setSyncStamp(dynastyId, collectionName, rev)
      onFresh(fresh, meta)
    },
  }
}

const DynastyContext = createContext()

// Block a main-doc write once the projected JSON size reaches this many bytes.
// Firestore's hard per-document cap is 1,048,576 bytes; a document's true size
// (field-name overhead per nested entry) runs LARGER than its JSON string, so a
// JSON projection at ~1 MB means the real doc is already over the cap. Guarding
// here converts the silent over-size "save then vanish + wedge every later
// write" failure into a loud, actionable error. See the guard in updateDynasty.
const MAIN_DOC_BYTE_LIMIT = 1_000_000

/**
 * Strip teams[tid].byYear[year].recruitingClassRoster OUT of a teams object,
 * returning both the stripped copy and the extracted values as
 * { [tidKey]: { [yearKey]: roster } } — the shape
 * saveRecruitingClassesSubcollection expects. Same job as
 * stripTeamsByYearFlatFields (seasonSubcollection.js) but for this one field,
 * which deliberately ISN'T in that shared registry — see
 * getRecruitingClassesSubcollection's own header comment for why this field
 * needs its own (tid, year)-granular subcollection instead of the shared
 * per-YEAR seasons doc every other teams[].byYear[] field routes through.
 */
function stripRecruitingClassRosterFromTeams(teams) {
  const extracted = {}
  if (!teams || typeof teams !== 'object') return { strippedTeams: teams, extracted }
  let stripped = teams
  let teamsTouched = false
  for (const [tidKey, team] of Object.entries(teams)) {
    const byYear = team?.byYear
    if (!byYear || typeof byYear !== 'object') continue
    let byYearTouched = false
    let nextByYear = byYear
    for (const [yearKey, yearData] of Object.entries(byYear)) {
      if (!yearData || typeof yearData !== 'object' || !('recruitingClassRoster' in yearData)) continue
      if (!extracted[tidKey]) extracted[tidKey] = {}
      extracted[tidKey][yearKey] = yearData.recruitingClassRoster
      if (!byYearTouched) { nextByYear = { ...byYear }; byYearTouched = true }
      const { recruitingClassRoster, ...restYearData } = nextByYear[yearKey]
      nextByYear[yearKey] = restYearData
    }
    if (byYearTouched) {
      if (!teamsTouched) { stripped = { ...teams }; teamsTouched = true }
      stripped[tidKey] = { ...team, byYear: nextByYear }
    }
  }
  return { strippedTeams: stripped, extracted }
}

/**
 * Inverse of stripRecruitingClassRosterFromTeams: fold the recruitingClasses
 * subcollection's `{ [tidKey]: { [yearKey]: roster } }` shape (see
 * getRecruitingClassesSubcollection) back onto teams[tid].byYear[year].
 * recruitingClassRoster, so every existing reader (Recruiting.jsx,
 * TeamYear.jsx) keeps working unchanged — they only ever read that inline
 * path, never call this subcollection directly.
 */
function foldRecruitingClassesIntoTeams(teams, recruitingClasses) {
  if (!teams || typeof teams !== 'object' || !recruitingClasses) return teams
  let next = teams
  let touched = false
  for (const [tidKey, byYearMap] of Object.entries(recruitingClasses)) {
    if (!byYearMap || typeof byYearMap !== 'object' || !next[tidKey]) continue
    for (const [yearKey, roster] of Object.entries(byYearMap)) {
      if (!touched) { next = { ...teams }; touched = true }
      const team = next[tidKey]
      const byYear = team.byYear || {}
      const yearData = byYear[yearKey] || {}
      next[tidKey] = { ...team, byYear: { ...byYear, [yearKey]: { ...yearData, recruitingClassRoster: roster } } }
    }
  }
  return next
}

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
  // Function-scoped: the LEGACY userTeam branch far below also compares against
  // this abbr. It used to be `const` INSIDE the block, so that later reference
  // resolved to nothing and threw ReferenceError whenever a dynasty actually
  // reached it (no userTid + a legacy game.userTeam).
  let userTeamAbbr = null
  if (!userTid) {
    userTid = dynasty.coachTeamByYear?.[yearNum]?.tid ?? dynasty.coachTeamByYear?.[yearStr]?.tid
    userTeamAbbr = dynasty.coachTeamByYear?.[yearNum]?.team ?? dynasty.coachTeamByYear?.[yearStr]?.team

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
 * Create or update the user's bowl game shell when the bowl wizard completes.
 * Mirrors the CFP shell pattern: once the user has answered bowl-eligible? +
 * picked a bowl + picked an opponent, a shell appears in games[] so the
 * dashboard's "Enter Your Bowl Game" tile can detect it via a games[] lookup
 * instead of bowlEligibilityDataByYear + form-state flags.
 *
 * Idempotent. If a shell already exists for this user-team / year, it's
 * updated in place (preserving scores and any user edits to the shell).
 *
 * @param {Array}  existingGames - Current games array from dynasty
 * @param {Object} params
 * @param {string} params.bowlName  - Full bowl name (e.g. "Xbox Bowl")
 * @param {number} params.year      - Dynasty year (e.g. 2030)
 * @param {number} params.userTid   - User's team tid (offensive side, team1)
 * @param {number} params.opponentTid - Opponent team tid
 * @param {boolean} params.isWeek1  - true if the bowl is a Week-1 bowl
 * @returns {Array} Updated games array with the bowl shell created/updated
 */
export function createOrUpdateBowlGameShell(existingGames, { bowlName, year, userTid, opponentTid, isWeek1 }) {
  if (!bowlName || !year || !userTid || !opponentTid) return existingGames

  const games = [...existingGames]
  const slug = String(bowlName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const id = `bowl-${year}-${slug}`

  // Locate any existing bowl shell for the user this year (regardless
  // of id — the user may have changed bowl names mid-flow, which would
  // produce a stale shell under the previous slug).
  const existingIdx = games.findIndex(g =>
    g && g.isBowlGame &&
    Number(g.year) === Number(year) &&
    (g.team1Tid === userTid || g.team2Tid === userTid)
  )

  const shell = {
    id,
    isBowlGame: true,
    bowlName,
    bowlWeek: isWeek1 ? 'week1' : 'week2',
    year: Number(year),
    week: 'Bowl',
    gameType: 'bowl',
    team1Tid: userTid,
    team2Tid: opponentTid,
    team1Score: null,
    team2Score: null,
    homeTeamTid: null,
    winnerTid: null,
    gameNote: '',
    links: '',
    createdAt: new Date().toISOString(),
  }

  if (existingIdx >= 0) {
    // Preserve any scores / edits already on the existing shell, but
    // refresh the bowl name / week / opponent in case the user changed
    // their wizard answers.
    const prev = games[existingIdx]
    games[existingIdx] = {
      ...prev,
      bowlName,
      bowlWeek: shell.bowlWeek,
      team2Tid: opponentTid,
      // Keep the original id stable — don't churn shell ids on wizard edits.
    }
  } else {
    games.push(shell)
  }

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
  const s1 = Number(game.team1Score), s2 = Number(game.team2Score)
  if (!Number.isFinite(s1) || !Number.isFinite(s2) || s1 === s2) return false
  const winnerTid = s1 > s2 ? game.team1Tid : game.team2Tid
  return winnerTid === tid
}

/**
 * Check if a team lost a CFP game
 */
export function isCFPGameLoser(game, tid) {
  if (game.team1Score === null || game.team2Score === null) return false
  const s1 = Number(game.team1Score), s2 = Number(game.team2Score)
  if (!Number.isFinite(s1) || !Number.isFinite(s2) || s1 === s2) return false
  const loserTid = s1 > s2 ? game.team2Tid : game.team1Tid
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
  // Delegate to the canonical slot so record ordering matches every other
  // subsystem. (Kept as a thin wrapper for the existing call sites.)
  return gameSlot(game)
}

// ============================================================================
// CANONICAL GAME SLOT — the single source of truth for "which calendar week
// does this game belong to." Every game, regular or postseason, maps to ONE
// number. The gameType (NOT the slot) is what distinguishes a CFP game from a
// regular bowl played the SAME week — CFP rounds are concurrent with bowl
// weeks, they don't get their own calendar slots:
//
//   0–15  Regular season
//   16    Conference Championship Week
//   17    Bowl Week 1   (regular bowls + CFP First Round live here)
//   18    Bowl Week 2   (regular bowls + CFP Quarterfinals)
//   19    Bowl Week 3   (regular bowls + CFP Semifinals)
//   20    National Championship
//
// This reads BOTH the new shape (gameType + numeric week) AND every legacy
// shape (string week 'CCG' / 'Bowl' / 'Bowl 1'…, or the boolean is* flags),
// via detectGameType. So old league files compute correct slots with ZERO data
// mutation — the migration that stamps numeric `week` is then purely additive.
// ============================================================================
export function gameSlot(game) {
  if (!game) return null
  const type = detectGameType(game)
  switch (type) {
    case GAME_TYPES.CONFERENCE_CHAMPIONSHIP: return 16
    case GAME_TYPES.CFP_FIRST_ROUND: return 17
    case GAME_TYPES.CFP_QUARTERFINAL: return 18
    case GAME_TYPES.CFP_SEMIFINAL: return 19
    case GAME_TYPES.CFP_CHAMPIONSHIP: return 20
    case GAME_TYPES.BOWL:
      return game.bowlWeek === 'week3' ? 19 : game.bowlWeek === 'week2' ? 18 : 17
    default: {
      const w = Number(game.week)
      return Number.isFinite(w) ? w : 0
    }
  }
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
 * Did this player recommit (after entering the portal) in the given year?
 * Checks both the legacy movements[] array and the v2 movementByYear map.
 * A recommit overrides any departure record for that year.
 */
function hasRecommitForYear(player, year) {
  const legacyMovements = Array.isArray(player.movements) ? player.movements : []
  const m = player.movementByYear?.[year] || player.movementByYear?.[String(year)]
  if (m?.type === 'recommit' || m?.type === 'recommitted') return true
  return legacyMovements.some(mm =>
    (mm?.type === 'recommit' || mm?.type === 'recommitted') &&
    Number(mm.year) === Number(year)
  )
}

/**
 * Movement-record departure check — the single source of truth for "this
 * player left and never came back", shared by the Signing Day carryover
 * (offseason week 5→6) and advanceToNewSeason (week 7).
 *
 * Extracted VERBATIM from the Signing Day carryover's isPlayerLeaving
 * closure (minus its playersLeaving-list checks, which stay at the call
 * site). Before the extraction, advanceToNewSeason detected departures
 * ONLY from the Players Leaving list — so departures recorded exclusively
 * in movement records (Draft Results rounds, player-editor edits,
 * transfers marked outside the leaving sheet) were re-added to the new
 * season's roster by its fall-through carry block. That was the
 * "players who left came back after advancing the season" bug.
 *
 * Reads BOTH the legacy movements[] array AND the v2 movementByYear map,
 * honors recommits/arrivals after a departure, and treats a
 * transfer_out whose destination is THIS team as an arrival (imported
 * data mis-stores those).
 */
function hasUnresolvedDeparture(player, homeTid, previousSeasonYear, dynasty, options = {}) {
  // excludeTeamsByYearYear: a teamsByYear year the implicit-arrival safety
  // net must IGNORE. advanceToNewSeason passes the new season year here —
  // a pre-seeded new-season slot is the very artifact being validated, so
  // it can't double as evidence that the player "came back".
  const { excludeTeamsByYearYear } = options
  const legacyMovements = Array.isArray(player.movements) ? player.movements : []

  // Recommit override: if they recommitted after entering the portal
  // that same year, they aren't leaving.
  if (hasRecommitForYear(player, previousSeasonYear)) return false

  const movementByYearForPrev =
    player.movementByYear?.[previousSeasonYear] ||
    player.movementByYear?.[String(previousSeasonYear)]

  // Legacy movements[] departure check. NOTE: bare 'transfer' is
  // deliberately NOT a departure — legacyMovementToCanonical maps
  // 'transfer' → an ARRIVAL (transfer_in), so treating it as a departure
  // here contradicted the rest of the system and dropped incoming
  // transfers on the year flip. Transfer-OUTs use 'transferred_out' /
  // 'entered_portal' / the canonical departure shape.
  const hasLegacyDeparture = legacyMovements.some(m =>
    (m.type === 'departure' || m.type === 'entered_portal' ||
     m.type === 'transferred_out' || m.type === 'graduated' || m.type === 'declared_for_draft' ||
     m.type === 'encouraged_to_transfer') &&
    Number(m.year) === previousSeasonYear
  )
  if (hasLegacyDeparture) return true

  // v2 movementByYear departure check. Any departure on the previous
  // season year means they're leaving — irrespective of which team
  // they departed from. ('transfer' excluded — it's an arrival type.)
  const byYearDepartureTypes = new Set([
    'departure', 'entered_portal', 'transferred_out',
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
    // A transfer_out with toTid pointing AT this team is actually
    // someone else's roster losing the player TO us — from our
    // perspective it's an arrival, not a departure. (Jay's STONY
    // dynasty had imported portal transfers with arrival events
    // mis-stored as transfer_out+toTid=2, which caused this loop to
    // flag the player as "still gone" on every year flip.)
    // Normalize toTid (it can be a string abbr) before comparing — an
    // arrival mis-stored as transfer_out+toTid=home is really an arrival
    // to us, not a departure. Strict === missed string-abbr destinations.
    const toTidNorm = m?.toTid == null ? null
      : (typeof m.toTid === 'number' ? m.toTid : getTidFromAbbr(m.toTid, dynasty))
    if (isDep && m?.departure === 'transfer_out' && toTidNorm === homeTid) continue
    if (isDep && (earliestDeparture == null || y < earliestDeparture)) {
      earliestDeparture = y
    }
  }
  for (const m of legacyMovements) {
    if (!m) continue
    const y = Number(m.year)
    if (!Number.isFinite(y)) continue
    // NOTE: bare 'transfer' is deliberately NOT a departure — everywhere else
    // in the system (legacyMovementToCanonical, the previousSeasonYear check
    // above, the arrival set below) treats it as an ARRIVAL (transfer_in).
    // Listing it here made a transfer-IN look like a departure it could never
    // clear (its own arrival year isn't > itself), silently dropping the
    // player on the year flip.
    const isDep =
      m.type === 'departure' || m.type === 'entered_portal' ||
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
    // Implicit-arrival safety net: if teamsByYear shows the player on
    // THIS team in any year after the departure, they obviously came
    // back even if no explicit arrival movement was written. Imported
    // teambuilder data routinely lacks the arrival side of a transfer.
    // Stored value can be tid (number) or legacy abbr (string), so
    // normalize before comparing.
    const returnedViaTeamsByYear = Object.entries(player.teamsByYear || {}).some(([yStr, t]) => {
      const y = Number(yStr)
      if (!Number.isFinite(y) || !cameBackAfter(y)) return false
      if (excludeTeamsByYearYear != null && y === Number(excludeTeamsByYearYear)) return false
      if (typeof t === 'number') return t === homeTid
      return getTidFromAbbr(t, dynasty) === homeTid
    })
    if (!returnedViaLegacy && !returnedViaV2 && !returnedViaTeamsByYear) return true
  }

  return false
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
  const validRank = (v) => {
    if (v == null) return null
    const n = Number(v)
    return n >= 1 && n <= 25 ? n : null
  }
  if (entry) {
    // Exact week first.
    const exact = validRank(entry[week] ?? entry[String(week)] ?? entry[Number(week)])
    if (exact != null) return exact
    // CARRY-FORWARD: a poll stands until a newer one is entered. If this exact
    // week has no ranking (e.g. the user entered a preseason / early Top 25 but
    // hasn't entered a fresh poll for this week), fall back to the most recent
    // EARLIER week that does — including preseason (week 0). Without this, the
    // Scores page and Sportsbook showed no rank pips for teams that are clearly
    // ranked on the Rankings page (which displays the latest populated week).
    // Regular-season weeks (≤20) never inherit a postseason poll (101–105).
    const wk = Number(week)
    if (Number.isFinite(wk)) {
      let best = null, bestWk = -Infinity
      for (const k of Object.keys(entry)) {
        const kw = Number(k)
        if (!Number.isFinite(kw) || kw > wk) continue
        if (wk <= 20 && kw > 20) continue
        const r = validRank(entry[k])
        if (r != null && kw > bestWk) { bestWk = kw; best = r }
      }
      if (best != null) return best
    }
  }
  // Preseason-array fallback — a separate store some dynasties use before any
  // rankByWeek is written. A preseason poll stands until a weekly one replaces
  // it, so this now applies to ANY week (was week ≤ 1 only), matching the
  // carry-forward semantic above.
  {
    const presPolls = dynasty.preseasonRankingsByYear?.[yearNum]
      || dynasty.preseasonRankingsByYear?.[yearStr]
    if (Array.isArray(presPolls)) {
      const entry2 = presPolls.find(p =>
        p && (
          (p.tid != null && Number(p.tid) === tid) ||
          (p.team && getTidFromAbbr(p.team, dynasty) === tid)
        )
      )
      if (entry2?.rank) return validRank(entry2.rank)
    }
  }
  return null
}

/**
 * Migration: walk every stored game and seed each team's
 * rankByWeek map. Each game's stored team1Rank/team2Rank IS the
 * rank entering that game's week — no shift required, regardless of
 * whether the game was a user game or a CPU game. The save flow
 * (saveWeeklyScores + addGame/updateGame's applyGameRanksToTeams)
 * persists ranks consistently with this semantic, so the migration
 * just mirrors them straight into rankByWeek[gameWeek].
 *
 * Idempotent — gated on dynasty._rankByWeekMigratedV5. Re-running
 * (via a Danger Zone admin action) will overwrite existing rankByWeek
 * data with the freshly recomputed values.
 */
export function migrateRanksToRankByWeek(dynasty, options = {}) {
  if (!dynasty || !Array.isArray(dynasty.games)) return dynasty
  const { force = false } = options
  // V5 of the migration: bumps from V4 to re-run with the corrected
  // semantic. Earlier versions applied a +1 week shift to CPU games
  // ("post-game → entering next week"), but the live save flow has
  // since been pinned to write entering-week ranks directly. Running
  // V4 on a post-fix dynasty would re-shift already-correct data and
  // corrupt rankByWeek by one week for every CPU-game team. V5 drops
  // the shift entirely so migration ↔ rebuild ↔ live save all use
  // the same model: stored game rank = entering-week rank.
  if (dynasty._rankByWeekMigratedV5 && !force) return dynasty

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
    // Canonical rankByWeek slots: Conf Champ = 16, Bowl Week 1 = 17,
    // Bowl Week 2 = 18 (matches getGameOrderForRecord + the Rankings
    // labels). The old shared "100" slot collided CCG with bowls and
    // surfaced as a bogus "Week 100" in the Top 25 week picker.
    if (g.isConferenceChampionship) return 16
    if (g.isBowlGame) return g.bowlWeek === 'week2' ? 18 : 17
    const w = Number(g.week)
    return Number.isFinite(w) ? w : null
  }

  // Single pass — every game's stored rank goes to rankByWeek[gameWeek]
  // unshifted. The earlier two-pass user/CPU split existed to overlay
  // user-game writes on top of shifted CPU-game writes; with the shift
  // gone, both flavors target the same slot and the order doesn't matter.
  for (const g of games) {
    if (!g || g.year == null) continue
    const wk = weekKeyOf(g)
    if (wk == null) continue
    const t1 = g.team1Tid != null ? Number(g.team1Tid) : null
    const t2 = g.team2Tid != null ? Number(g.team2Tid) : null
    const r1 = typeof g.team1Rank === 'number' ? g.team1Rank : null
    const r2 = typeof g.team2Rank === 'number' ? g.team2Rank : null
    if (t1 != null && r1 != null) writeRank(t1, g.year, wk, r1)
    if (t2 != null && r2 != null) writeRank(t2, g.year, wk, r2)
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
    _rankByWeekMigratedV5: true,
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
    // Canonical rankByWeek slots: Conf Champ = 16, Bowl Week 1 = 17,
    // Bowl Week 2 = 18 (matches getGameOrderForRecord + the Rankings
    // labels). The old shared "100" slot collided CCG with bowls and
    // surfaced as a bogus "Week 100" in the Top 25 week picker.
    if (g.isConferenceChampionship) return 16
    if (g.isBowlGame) return g.bowlWeek === 'week2' ? 18 : 17
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
    // Canonical rankByWeek slots: Conf Champ = 16, Bowl Week 1 = 17,
    // Bowl Week 2 = 18 (see weekKeyOf above).
    if (game.isConferenceChampionship) return 16
    if (game.isBowlGame) return game.bowlWeek === 'week2' ? 18 : 17
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
 * Sync games[].team1Rank/team2Rank to match the canonical rankByWeek
 * snapshot in `teams`. Walks every game whose (year, week) appears in
 * the affected map and rewrites its stored ranks from rankByWeek.
 *
 * Why: Top 25 sheet edits write to teams.byYear[year].rankByWeek but
 * leave games[].team1Rank/team2Rank untouched. The two stores then
 * diverge — Rankings page (rankByWeek) shows the corrected rank, Game
 * page (game record) shows the stale one. Beta tester reports of
 * "putting the last week ranking" trace back to this divergence.
 *
 * `affectedYears`: { [year]: Set<weekNumber> } — only games at these
 * (year, week) coordinates get touched. CFP/bowl/CC week keys (>=100)
 * pass through; the helper walks the integer week coords only.
 *
 * Returns the new games array. Pure / immutable.
 */
export function syncGameRanksFromRankByWeek(games, teams, affectedYears) {
  if (!Array.isArray(games)) return games || []
  if (!teams || typeof teams !== 'object') return games
  if (!affectedYears || typeof affectedYears !== 'object') return games

  const readRank = (tid, year, week) => {
    if (tid == null || year == null || week == null) return null
    const t = teams[String(tid)] || teams[tid]
    const rbw = t?.byYear?.[String(year)]?.rankByWeek ?? t?.byYear?.[year]?.rankByWeek
    if (!rbw) return null
    const v = rbw[week] ?? rbw[String(week)]
    if (typeof v !== 'number' || v < 1 || v > 25) return null
    return v
  }

  let mutated = false
  const next = games.map(g => {
    if (!g || g.year == null || g.week == null) return g
    const yr = Number(g.year)
    const wk = Number(g.week)
    if (!Number.isFinite(yr) || !Number.isFinite(wk)) return g
    const weeks = affectedYears[yr] || affectedYears[String(yr)]
    if (!weeks || !weeks.has(wk)) return g

    let updated = g
    if (g.team1Tid != null) {
      const r = readRank(g.team1Tid, yr, wk)
      const stored = typeof g.team1Rank === 'number' ? g.team1Rank : null
      if (r !== stored) {
        updated = { ...updated, team1Rank: r }
        mutated = true
      }
    }
    if (g.team2Tid != null) {
      const r = readRank(g.team2Tid, yr, wk)
      const stored = typeof g.team2Rank === 'number' ? g.team2Rank : null
      if (r !== stored) {
        updated = { ...updated, team2Rank: r }
        mutated = true
      }
    }
    return updated
  })
  return mutated ? next : games
}

/**
 * Helper: extract the (year, week) coordinates touched by a Top 25
 * sheet diff. Used to scope syncGameRanksFromRankByWeek to only the
 * weeks the user actually edited.
 */
export function affectedYearWeeksFromTop25Diff(diff) {
  const out = {}
  if (!diff || typeof diff !== 'object') return out
  for (const byYear of Object.values(diff)) {
    if (!byYear || typeof byYear !== 'object') continue
    for (const [yearKey, weekUpdates] of Object.entries(byYear)) {
      if (!weekUpdates || typeof weekUpdates !== 'object') continue
      const yr = Number(yearKey)
      if (!Number.isFinite(yr)) continue
      if (!out[yr]) out[yr] = new Set()
      for (const k of Object.keys(weekUpdates)) {
        const wk = Number(k)
        if (Number.isFinite(wk)) out[yr].add(wk)
      }
    }
  }
  return out
}

/**
 * Derive the preseason poll array — dynasty.preseasonRankingsByYear[year],
 * shape [{ rank, team: abbr, tid }] — from a teams map's rankByWeek[0]
 * snapshot for a given year.
 *
 * The preseason poll lives in TWO stores: each team's rankByWeek[0] (what the
 * Top 25 page + side-menu editor read/write) and preseasonRankingsByYear (what
 * the Dashboard "Enter Preseason Top 25" todo, the preseason recap, and the
 * preseason sheet pre-fill read). The side-menu Top 25 editor only wrote
 * rankByWeek, so preseason entries made there never reached the Dashboard.
 * This lets that editor rebuild the array form from rankByWeek[0] and keep the
 * two in lockstep.
 */
export function derivePreseasonPollFromTeams(teams, year) {
  const out = []
  if (!teams || typeof teams !== 'object') return out
  const yearNum = Number(year)
  const yearStr = String(yearNum)
  for (const team of Object.values(teams)) {
    if (!team) continue
    const rbw = team.byYear?.[yearNum]?.rankByWeek ?? team.byYear?.[yearStr]?.rankByWeek
    if (!rbw) continue
    const v = rbw[0] ?? rbw['0']
    const n = Number(v)
    if (!Number.isFinite(n) || n < 1 || n > 25) continue
    out.push({ rank: n, team: team.abbr || null, tid: team.tid != null ? Number(team.tid) : null })
  }
  out.sort((a, b) => a.rank - b.rank)
  return out
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

// CFB27's own in-game Rankings screen features the Media poll for weeks 1-9,
// then switches its primary Top 25 to the CFP Committee poll starting week
// 10 (confirmed against real save screenshots — the two polls can genuinely
// disagree on who's ranked, e.g. a team in one poll's #25 slot but unranked
// in the other's). Merges a team's rankByWeek (Media) and cfpRankByWeek
// (CFP) into one effective per-week map — weeks 0-9 from Media, weeks 10+
// from CFP, falling back to the other poll when the preferred one is
// missing that specific week's entry (dynasties synced before
// cfpRankByWeek existed only ever populate rankByWeek). Every other rank
// display in the app (Rankings.jsx, teamRanking.js's currentPollRank) uses
// the same week-10 cutover — this is the shared merge for getTeamRanking's
// own, more complex phase-aware logic below.
function mergedRankByWeek(team, year) {
  const media = team?.byYear?.[year]?.rankByWeek ?? team?.byYear?.[String(year)]?.rankByWeek
  const cfp = team?.byYear?.[year]?.cfpRankByWeek ?? team?.byYear?.[String(year)]?.cfpRankByWeek
  if (!media && !cfp) return null
  const merged = {}
  const keys = new Set([...Object.keys(media || {}), ...Object.keys(cfp || {})])
  for (const k of keys) {
    const wk = Number(k)
    if (!Number.isFinite(wk)) continue
    const primary = wk >= 10 ? cfp : media
    const fallback = wk >= 10 ? media : cfp
    let v = primary?.[k]
    if (typeof v !== 'number' || v < 1 || v > 25) v = fallback?.[k]
    if (typeof v === 'number' && v >= 1 && v <= 25) merged[wk] = v
  }
  return merged
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
    const team = dynasty.teams?.[tid] ?? dynasty.teams?.[String(tid)]
    const rankByWeek = mergedRankByWeek(team, year)
    if (rankByWeek && typeof rankByWeek === 'object') {
      const isYearMatch = Number(dynasty.currentYear) === Number(year)
      const phase = dynasty.currentPhase
      // Once the user has saved a Final Poll for this season,
      // rankByWeek[105] IS the answer — either a number for ranked
      // teams or absent for unranked teams. Don't fall through to
      // earlier postseason slots when the user has explicitly
      // declared the season's final picture (otherwise a team that
      // was ranked #24 entering CCG week but dropped out of the
      // Final Poll would still surface as #24 on its team page).
      const hasSavedFinalPoll = (() => {
        const fp = dynasty.finalPollsByYear?.[year] ?? dynasty.finalPollsByYear?.[String(year)]
        return !!(fp?.media && Array.isArray(fp.media) && fp.media.length > 0)
      })()
      const finalSlotRank = (() => {
        const v = rankByWeek[105] ?? rankByWeek['105']
        return typeof v === 'number' && v >= 1 && v <= 25 ? v : null
      })()

      // Postseason slot priority — newest in time first. Used only
      // when no Final Poll is saved yet (still mid-postseason).
      // Final Poll (105) is the canonical "end-of-season" rank; CFP
      // rounds 101-104 are the per-round polls (post-FR through
      // post-NC); slot 16 is the post-Week-15 Conf-Champ-Week poll.
      const POSTSEASON_SLOTS = [105, 104, 103, 102, 101, 16]
      const pickPostseasonRank = () => {
        for (const slot of POSTSEASON_SLOTS) {
          const v = rankByWeek[slot] ?? rankByWeek[String(slot)]
          if (typeof v === 'number' && v >= 1 && v <= 25) {
            return { rank: v, week: slot }
          }
        }
        return null
      }

      // Looking at a PAST year (year < currentYear, or current year
      // but the dynasty has advanced past it). Always prefer the
      // team's latest postseason rank — that's "their final ranking
      // for that season." The mid-season weekly polls would surface
      // a stale snapshot from that season's regular-season run.
      if (!isYearMatch) {
        if (hasSavedFinalPoll) {
          // Final Poll exists — slot 105 is authoritative. Unranked
          // teams get null here (skipping Priority 2/3 below which
          // would surface stale data).
          return finalSlotRank
            ? { rank: finalSlotRank, source: 'rank_by_week', week: 105 }
            : null
        }
        const latest = pickPostseasonRank()
        if (latest) {
          return { rank: latest.rank, source: 'rank_by_week', week: latest.week }
        }
        // Fall through to Priority 2 (final poll) for legacy dynasties
        // that have a saved final poll but no rankByWeek seeding.
      } else if (phase === 'offseason' || phase === 'postseason') {
        // Same year, season is over (postseason past NC, or already
        // rolled into offseason). The "current rank" semantically IS
        // the team's final ranking — use the latest postseason slot.
        // This fixes the bug where a 14-3 national-champion team
        // showed unranked on its team page because the snapshot
        // anchored to dynasty.currentWeek=4/5 (an offseason week
        // index that doubled as a regular-season Week N rank slot).
        if (hasSavedFinalPoll) {
          return finalSlotRank
            ? { rank: finalSlotRank, source: 'rank_by_week', week: 105 }
            : null
        }
        const latest = pickPostseasonRank()
        if (latest) {
          return { rank: latest.rank, source: 'rank_by_week', week: latest.week }
        }
        // Team genuinely unranked at season end — fall through to
        // Priority 2 (final poll) as a final safety net.
      } else {
        // In-season (preseason / regular_season / conference_championship).
        // Anchor every team's reported rank to dynasty.currentWeek so a
        // team that fell out of the poll shows unranked instead of
        // their last-known rank from a past week.
        //
        // During CCG phase, dynasty.currentWeek = 1 (CCG is its own
        // phase, indexed week 1 within the phase) but the semantic
        // rank slot is 16 (post-Week-15 / pre-CCG poll). Anchoring to
        // currentWeek=1 would surface every team's preseason rank on
        // every team page during CCG week — override to slot 16.
        const isCCGPhase = phase === 'conference_championship'
        const cw = isCCGPhase ? 16 : Number(dynasty.currentWeek)
        let snapshotWeek = -Infinity
        if (Number.isFinite(cw) && cw >= 0) {
          // Confirm at least one team has data for currentWeek; if not,
          // fall through to the legacy "max populated" path.
          for (const otherTeam of Object.values(dynasty.teams || {})) {
            const tRbw = mergedRankByWeek(otherTeam, year)
            if (!tRbw || typeof tRbw !== 'object') continue
            const v = tRbw[cw] ?? tRbw[String(cw)]
            if (typeof v === 'number' && v >= 1 && v <= 25) { snapshotWeek = cw; break }
          }
        }
        if (snapshotWeek === -Infinity) {
          for (const otherTeam of Object.values(dynasty.teams || {})) {
            const tRbw = mergedRankByWeek(otherTeam, year)
            if (!tRbw || typeof tRbw !== 'object') continue
            for (const k of Object.keys(tRbw)) {
              const wk = Number(k)
              if (!Number.isFinite(wk)) continue
              const v = tRbw[k]
              if (typeof v !== 'number' || v < 1 || v > 25) continue
              if (wk > snapshotWeek) snapshotWeek = wk
            }
          }
        }
        if (snapshotWeek > -Infinity) {
          const v = rankByWeek[snapshotWeek] ?? rankByWeek[String(snapshotWeek)]
          if (typeof v === 'number' && v >= 1 && v <= 25) {
            return { rank: v, source: 'rank_by_week', week: snapshotWeek }
          }
          // Team has rankByWeek data elsewhere but not at the snapshot
          // week — currently unranked. Return null (don't fall through
          // to "highest populated week" which would surface a stale
          // earlier rank).
          return null
        }
      }
      // Fallback: no usable snapshot found above (e.g. mid-season with
      // no team ranked yet, or pre-V5 legacy dynasty). Use this team's
      // highest populated week — preserves legacy behavior.
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
    // CCG games carry game.week='CCG' (string sentinel). They land in
    // bucket 15 — the same slot the Rankings page uses for the
    // post-Week-14 / pre-CCG poll. Without this, parseInt('CCG')=NaN
    // and the CCG game's stored team1Rank/team2Rank never seed the
    // live Top 25.
    const isCCG = g.isConferenceChampionship || g.gameType === GAME_TYPES.CONFERENCE_CHAMPIONSHIP
    let wk
    if (isCCG) {
      wk = 15
    } else {
      wk = typeof g.week === 'number' ? g.week : parseInt(g.week, 10)
      if (!Number.isFinite(wk)) continue
    }
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
 * Look up a team's stored record from non-games sources:
 * conferenceStandingsByYear (regular season), teamRecordsByTeamYear (the
 * manual per-team override, abbr-keyed legacy lookup), and
 * teams[tid].byYear[year].record (tid-based, calculated — folded in from
 * teamCalculatedRecordByTeamYear). Returns the entry covering the most
 * games, or null if nothing is found.
 * Used as a fallback for CPU teams whose regular-season games are not in
 * dynasty.games but whose records are available from standings uploads.
 */
export function getStoredTeamRecord(dynasty, tid, year) {
  if (!dynasty || !tid || !year) return null
  const yearNum = Number(year)

  let best = null
  let bestGames = 0
  const consider = (rec) => {
    if (!rec) return
    const games = (rec.wins || 0) + (rec.losses || 0)
    if (games > bestGames) {
      best = { wins: rec.wins || 0, losses: rec.losses || 0, confWins: rec.confWins || 0, confLosses: rec.confLosses || 0 }
      bestGames = games
    }
  }

  // Conference standings (regular season — most reliable for CPU teams)
  const yearStandings = dynasty.conferenceStandingsByYear?.[yearNum] ||
                        dynasty.conferenceStandingsByYear?.[String(yearNum)] || {}
  for (const confTeams of Object.values(yearStandings)) {
    if (Array.isArray(confTeams)) {
      const teamData = confTeams.find(t => {
        if (!t || !t.team) return false
        const resolvedTid = t.tid || getTidFromAbbr(t.team, dynasty)
        return Number(resolvedTid) === Number(tid)
      })
      if (teamData) consider(teamData)
    }
  }

  // Legacy teamRecordsByTeamYear
  consider(lookupByTeamYear(dynasty.teamRecordsByTeamYear || {}, dynasty, tid, year))

  // Tid-based teams.byYear.record
  consider(dynasty.teams?.[tid]?.byYear?.[yearNum]?.record)
  consider(dynasty.teams?.[tid]?.byYear?.[String(yearNum)]?.record)

  return best
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

  // Calculate including this game using the game's sort order as the cutoff.
  // getGameOrderForRecord returns numeric values: reg season 1-14, CC=15, BW1=16, BW2=17, CFP 20-23.
  const gameOrder = getGameOrderForRecord(game)
  const calc = calculateTeamRecordFromGames(dynasty, tid, game.year, {
    upToWeek: gameOrder,
    includeUpToWeek: true
  })

  const calcRecord = {
    overall: `${calc.wins}-${calc.losses}`,
    conference: `${calc.confWins}-${calc.confLosses}`,
    wins: calc.wins,
    losses: calc.losses,
    confWins: calc.confWins,
    confLosses: calc.confLosses
  }

  // Regular-season game view (order 1-14): calc with upToWeek is the only
  // source that respects the as-of-week cutoff. Stored records hold
  // end-of-season totals and would over-report when shown on an earlier
  // week's game page.
  if (gameOrder < 15) return calcRecord

  // Postseason games (CC + bowls + CFP): CPU teams may not have their full
  // regular season in dynasty.games. If stored covers more games than calc,
  // combine stored (reg-season baseline) with calc (postseason contribution).
  const calcGames = calc.wins + calc.losses
  const stored = getStoredTeamRecord(dynasty, tid, game.year)
  const storedGames = stored ? (stored.wins + stored.losses) : 0

  if (calcGames >= storedGames || storedGames === 0) return calcRecord

  const totalWins = stored.wins + calc.wins
  const totalLosses = stored.losses + calc.losses
  return {
    overall: `${totalWins}-${totalLosses}`,
    conference: `${stored.confWins}-${stored.confLosses}`,
    wins: totalWins,
    losses: totalLosses,
    confWins: stored.confWins,
    confLosses: stored.confLosses
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
  // NOTE: this is the CALCULATED record, so it goes to
  // teamCalculatedRecordByTeamYear, not teamRecordsByTeamYear — the latter
  // is the manual "Update automatically"-checkbox override written by
  // saveTeamYearInfo. The two used to share teamRecordsByTeamYear, so
  // whichever saved last silently clobbered the other's value there.
  const recordPayload = {
    wins: record.wins,
    losses: record.losses,
    confWins: record.confWins,
    confLosses: record.confLosses
  }
  Object.assign(updates, buildByTeamYearUpdates('teamCalculatedRecordByTeamYear', dynasty, tid, year, recordPayload))

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
 * Extract stats contribution from a box score, indexed two ways:
 *  - byComposite["<tid>::<normalized name>"]: stats from the specific team
 *    side that had this name in this box score. Precise - safe even when
 *    two unrelated real players share a full name (confirmed to happen -
 *    e.g. two different "Keenan Jackson"s on different teams).
 *  - byName["<normalized name>"]: the same stats merged across every side
 *    that had this name in this box score (the old, name-only behavior).
 *    Kept only as a fallback for callers that can't determine which team
 *    a player belongs to.
 * `game` supplies team1Tid/team2Tid/homeTeamTid so a tid can be derived
 * even for the legacy `home`/`away` box score shape (the `byTid` shape
 * already carries its own tid as the dict key).
 * @param {Object} boxScore - The game's box score object
 * @param {Object} [game] - The game this box score belongs to (for tid lookup)
 * @returns {{byComposite: Object, byName: Object}}
 */
function extractBoxScoreContribution(boxScore, game) {
  if (!boxScore) return { byComposite: {}, byName: {} }

  const byComposite = {}
  const byName = {}

  // Walk every team's stat block in either shape (byTid for canonical
  // games, home/away for legacy games waiting to be migrated on next
  // write), tagging each side with its tid.
  const sides = []
  if (boxScore.byTid && typeof boxScore.byTid === 'object') {
    for (const [tid, side] of Object.entries(boxScore.byTid)) {
      if (side) sides.push({ tid: Number(tid), side })
    }
  }
  if (boxScore.home) {
    const homeTid = game?.homeTeamTid ?? game?.team1Tid
    sides.push({ tid: homeTid != null ? Number(homeTid) : null, side: boxScore.home })
  }
  if (boxScore.away) {
    const homeTid = game?.homeTeamTid ?? game?.team1Tid
    const awayTid = (game?.team1Tid != null && Number(game.team1Tid) !== Number(homeTid))
      ? game.team1Tid
      : game?.team2Tid
    sides.push({ tid: awayTid != null ? Number(awayTid) : null, side: boxScore.away })
  }

  for (const { tid, side: sideBoxScore } of sides) {
    if (!sideBoxScore) continue

    // Process each stat category
    Object.keys(BOX_SCORE_STATS).forEach(category => {
      const categoryStats = sideBoxScore[category]
      if (!Array.isArray(categoryStats)) return

      categoryStats.forEach(playerRow => {
        const playerName = normalizePlayerName(playerRow.playerName)
        if (!playerName) return

        const compositeKey = tid != null ? `${tid}::${playerName}` : null

        if (!byName[playerName]) byName[playerName] = { _hadStats: true }
        if (!byName[playerName][category]) byName[playerName][category] = {}
        if (compositeKey) {
          if (!byComposite[compositeKey]) byComposite[compositeKey] = { _hadStats: true }
          if (!byComposite[compositeKey][category]) byComposite[compositeKey][category] = {}
        }

        // Extract all stat fields (in box score format)
        const allFields = [...(BOX_SCORE_STATS[category].sum || []), ...(BOX_SCORE_STATS[category].max || [])]
        allFields.forEach(field => {
          const value = parseFloat(playerRow[field]) || 0
          byName[playerName][category][field] = value
          if (compositeKey) byComposite[compositeKey][category][field] = value
        })
      })
    })
  }

  // Convert all stats to internal format
  const convertAll = (dict) => {
    Object.keys(dict).forEach(key => {
      Object.keys(BOX_SCORE_STATS).forEach(category => {
        if (dict[key][category]) {
          dict[key][category] = convertBoxScoreToInternal(dict[key][category], category)
        }
      })
    })
  }
  convertAll(byName)
  convertAll(byComposite)

  return { byComposite, byName }
}

// A player's tracked team (tid) for a given season - the disambiguator used
// whenever a normalized player name matches more than one real player.
function playerTidForYear(player, year) {
  const y = Number(year)
  const t = player?.teamsByYear?.[y] ?? player?.teamsByYear?.[String(y)]
  return t != null ? Number(t) : null
}

/**
 * Resolves the stats blob that applies to a specific player out of a
 * {byComposite, byName} index built by extractBoxScoreContribution. When
 * the player's own team for that year is known, ONLY the exact (tid, name)
 * match is trusted - deliberately not falling back to the name-only index,
 * since that fallback is exactly what let one real player's box score
 * stats bleed onto an unrelated same-named player on a different team.
 * The name-only index is used only when the player's team-for-year can't
 * be determined at all.
 */
function resolveIndexedStats(index, player, year) {
  const name = normalizePlayerName(player.name)
  const tid = playerTidForYear(player, year)
  if (tid != null) return index.byComposite[`${tid}::${name}`] || null
  return index.byName[name] || null
}

/**
 * The numeric team tids that took part in a box score, read from its
 * canonical `byTid` map. Legacy home/away-only box scores (pre-byTid) carry
 * no tid, so this returns [] for them — callers then fall back to name-only
 * attribution (no behavior change for that legacy shape).
 */
function boxScoreParticipantTids(boxScore) {
  if (!boxScore || !boxScore.byTid || typeof boxScore.byTid !== 'object') return []
  return Object.keys(boxScore.byTid)
    .map(k => Number(k))
    .filter(n => Number.isFinite(n))
}

/**
 * Box-score stat rows identify a player only by NAME. When two tracked
 * players share a normalized name (e.g. a QB on one team and a DT on
 * another), attributing a game's stat line to BOTH — which the old
 * name-only match did — duplicated that line onto a player who never
 * appeared in the game. That was the "duplicate game" report: the same
 * passing line showing up under a same-named player on an unrelated team.
 *
 * Given the box score's own participant tids, this returns a Set of the
 * player objects that must NOT receive a contributed name, because a better
 * owner (a same-named player who is actually on one of those teams that
 * year) exists. It only ever fires on a genuine name collision, and only
 * when a participant owner is identifiable — so a real, single-owner stat
 * line is never dropped and the common no-collision case is untouched.
 *
 * @param {Array} players           - all players
 * @param {Set<string>} names       - normalized names present in the contribution
 * @param {number[]} participantTids - the game's team tids (empty = no scoping)
 * @param {number} year             - stat year, for roster membership checks
 * @returns {Set<Object>} player objects to exclude from name attribution
 */
function offTeamContributionOwners(players, names, participantTids, year) {
  const excluded = new Set()
  if (!participantTids || participantTids.length === 0 || !names || names.size === 0) {
    return excluded
  }
  const byName = new Map()
  for (const player of players) {
    if (!player) continue
    const n = normalizePlayerName(player.name)
    if (!n || !names.has(n)) continue
    if (!byName.has(n)) byName.set(n, [])
    byName.get(n).push(player)
  }
  for (const matches of byName.values()) {
    if (matches.length < 2) continue // no collision — nothing to disambiguate
    const onTeam = matches.filter(p =>
      participantTids.some(tid => isPlayerOnRoster(p, tid, year))
    )
    if (onTeam.length === 0) continue // can't tell who played — keep all (no data loss)
    for (const p of matches) {
      if (!onTeam.includes(p)) excluded.add(p)
    }
  }
  return excluded
}

/**
 * Re-key a stored stats contribution (from game.statsContributed) through the
 * current name normalizer. A game saved before a normalizer change holds keys
 * under the old scheme; re-normalizing lets the delta reversal line them up
 * with today's player-name normalization. Returns the same object reference
 * when nothing changed. Two old keys collapsing to one is rare enough that we
 * keep the richer record rather than summing (summing would over-reverse).
 */
function renormalizeContributionKeys(contribution) {
  if (!contribution || typeof contribution !== 'object') return contribution
  let changed = false
  const out = {}
  for (const [key, value] of Object.entries(contribution)) {
    const nk = normalizePlayerName(key)
    if (!nk) { changed = true; continue }
    if (nk !== key) changed = true
    if (out[nk] === undefined) {
      out[nk] = value
    } else {
      changed = true
      if (Object.keys(value || {}).length > Object.keys(out[nk] || {}).length) out[nk] = value
    }
  }
  return changed ? out : contribution
}

/**
 * Apply box score delta to player stats
 * Calculates difference between new and old contribution, applies to player.statsByYear
 * @param {Array} players - Array of player objects
 * @param {Object} newContribution - New stats contribution from box score
 * @param {Object} oldContribution - Previous stats contribution (null for new games)
 * @param {number} year - The year to update stats for
 * @param {number[]} participantTids - the box score's team tids, to keep a stat
 *   line off same-named players on other teams (empty/omitted = name-only, legacy)
 * @returns {Array} Updated players array
 */
function applyBoxScoreDelta(players, newContribution, oldContribution, year, participantTids = []) {
  const yearNum = Number(year)

  // Get all player names that appear in either contribution
  const allPlayerNames = new Set([
    ...Object.keys(newContribution || {}),
    ...Object.keys(oldContribution || {})
  ])

  // Same-named players on teams that didn't play in this game must not
  // absorb its stats. They still reverse any previously (wrongly) applied
  // contribution below via oldStats, so re-saving a game self-heals a
  // duplicate that a prior buggy save created.
  const offTeam = offTeamContributionOwners(players, allPlayerNames, participantTids, yearNum)

  return players.map(player => {
    const playerNameNormalized = normalizePlayerName(player.name)
    if (!allPlayerNames.has(playerNameNormalized)) return player

    const isOffTeam = offTeam.has(player)
    const oldStats = oldContribution?.[playerNameNormalized] || {}
    // Off-team same-name player with nothing previously applied: leave them
    // fully untouched (don't even materialize an empty year record).
    if (isOffTeam && Object.keys(oldStats).length === 0) return player
    const newStats = isOffTeam ? {} : (newContribution?.[playerNameNormalized] || {})

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
          // For sum fields, apply delta (allow negatives for yards)
          const delta = newVal - oldVal
          existingYearStats[category][field] = currentVal + delta
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

  // Collect: playerName -> category -> maxField -> max value across games.
  // Built in parallel per-(tid,name) and per-name-only - see
  // resolveIndexedStats for why the tid-scoped index takes precedence
  // whenever a player's team-for-year is known.
  const maxByComposite = {}
  const maxByName = {}
  const accumulateMax = (dict, key, catStats) => {
    if (!dict[key]) dict[key] = {}
    Object.keys(BOX_SCORE_STATS).forEach(category => {
      const stats = catStats[category]
      if (!stats) return
      const internalMapping = BOXSCORE_TO_INTERNAL_MAP[category] || {}
      const maxFields = (BOX_SCORE_STATS[category].max || []).map(f => internalMapping[f] || f)
      if (maxFields.length === 0) return
      if (!dict[key][category]) dict[key][category] = {}
      maxFields.forEach(field => {
        const v = stats[field] || 0
        const cur = dict[key][category][field] || 0
        if (v > cur) dict[key][category][field] = v
      })
    })
  }

  const participantTidUnion = new Set()
  gamesWithBox.forEach(game => {
    for (const tid of boxScoreParticipantTids(game.boxScore)) participantTidUnion.add(tid)
    const { byComposite, byName } = extractBoxScoreContribution(game.boxScore, game)
    Object.entries(byComposite).forEach(([key, catStats]) => accumulateMax(maxByComposite, key, catStats))
    Object.entries(byName).forEach(([key, catStats]) => accumulateMax(maxByName, key, catStats))
  })

  // Pre-compute the (category, field) pairs we have to recompute, so we
  // don't redo this work per-player.
  const categoriesWithMax = []
  Object.keys(BOX_SCORE_STATS).forEach(category => {
    const internalMapping = BOXSCORE_TO_INTERNAL_MAP[category] || {}
    const maxFields = (BOX_SCORE_STATS[category].max || []).map(f => internalMapping[f] || f)
    if (maxFields.length > 0) categoriesWithMax.push({ category, maxFields })
  })

  // Keep season-long/max fields off same-named players on teams that never
  // played this year (mirrors applyBoxScoreDelta's attribution scoping).
  const offTeam = offTeamContributionOwners(
    players, new Set(Object.keys(maxByName)), [...participantTidUnion], yearNum
  )

  return players.map(player => {
    if (offTeam.has(player)) return player
    const existingStatsByYear = player.statsByYear || {}
    const existingYearStats = existingStatsByYear[yearNum]
    if (!existingYearStats) return player // Player has no stats this year — nothing to do.

    const tid = playerTidForYear(player, yearNum)
    const normalized = normalizePlayerName(player.name)
    // Composite (tid+name) first for precision; fall back to name-only when
    // this player's team-for-year is unknown OR the box score carried no
    // usable tid for them (legacy shapes, mid-year team changes). The
    // fallback can't resurrect a collision — offTeam already removed the
    // same-named players who weren't on a participating team.
    const playerMax = (tid != null && maxByComposite[`${tid}::${normalized}`])
      || maxByName[normalized]
      || {}

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
  // Name-only index here: `statsContributed` is persisted on the game in this
  // shape, so switching it to composite keys would orphan every previously
  // saved game's reversal record. The tid-scoped collision fix is applied
  // instead via participantTids below, which needs no stored-shape change.
  const newContribution = extractBoxScoreContribution(newBoxScore).byName
  // Re-key the previously-stored contribution through the current name
  // normalizer. Games saved before a normalizer change (e.g. "Jr." now
  // strips its period) stored keys under the old scheme; without this the
  // reversal below wouldn't find the player and the edit would double-count.
  const oldContributionNorm = renormalizeContributionKeys(oldContribution)
  // Scope attribution to this game's own teams so a same-named player on
  // another team can't absorb a duplicate copy of the stat line.
  const participantTids = boxScoreParticipantTids(newBoxScore)
  let updatedPlayers = applyBoxScoreDelta(players, newContribution, oldContributionNorm, year, participantTids)

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
  const categoryKeys = Object.keys(BOX_SCORE_STATS)

  // Get all games for this year that have box scores
  const gamesWithBoxScores = (games || []).filter(g =>
    Number(g.year) === yearNum && g.boxScore
  )

  // Build aggregated stats in parallel per-(tid,name) and per-name-only.
  // The tid-scoped index is preferred whenever a player's team-for-year is
  // known - this is what stops two unrelated real players who happen to
  // share a full name (confirmed to occur - e.g. two different "Keenan
  // Jackson"s on different teams) from bleeding one player's box score
  // stats onto the other.
  const aggregatedByComposite = {}
  const gamesPlayedByComposite = {}
  const aggregatedByName = {}
  const gamesPlayedByName = {}

  const aggregateInto = (aggDict, countDict, key, playerStats) => {
    if (playerStats._hadStats) {
      countDict[key] = (countDict[key] || 0) + 1
    }
    if (!aggDict[key]) aggDict[key] = {}
    categoryKeys.forEach(category => {
      if (!playerStats[category]) return
      if (!aggDict[key][category]) aggDict[key][category] = {}
      const internalMapping = BOXSCORE_TO_INTERNAL_MAP[category] || {}
      const maxFields = (BOX_SCORE_STATS[category].max || []).map(f => internalMapping[f] || f)
      Object.keys(playerStats[category]).forEach(field => {
        const value = playerStats[category][field] || 0
        const currentValue = aggDict[key][category][field] || 0
        aggDict[key][category][field] = maxFields.includes(field)
          ? Math.max(currentValue, value)
          : currentValue + value
      })
    })
  }

  const participantTidUnion = new Set()
  gamesWithBoxScores.forEach(game => {
    for (const tid of boxScoreParticipantTids(game.boxScore)) participantTidUnion.add(tid)
    const { byComposite, byName } = extractBoxScoreContribution(game.boxScore, game)
    Object.keys(byComposite).forEach(key => aggregateInto(aggregatedByComposite, gamesPlayedByComposite, key, byComposite[key]))
    Object.keys(byName).forEach(key => aggregateInto(aggregatedByName, gamesPlayedByName, key, byName[key]))
  })

  // A box-score row's stats belong to the player who actually played, not to
  // every same-named player in the dynasty. Identify same-named players on
  // teams that never played this year so we can strip (heal) any phantom
  // box-score stats a prior name-only save wrote onto them.
  const offTeam = offTeamContributionOwners(
    players, new Set(Object.keys(aggregatedByName)), [...participantTidUnion], yearNum
  )

  // Apply aggregated stats to players
  return players.map(player => {
    const tid = playerTidForYear(player, yearNum)
    const normalized = normalizePlayerName(player.name)
    const compositeKey = tid != null ? `${tid}::${normalized}` : null
    // Composite (tid+name) first for precision; fall back to name-only when
    // this player's team-for-year is unknown OR the box score carried no
    // usable tid for them (legacy home/away games, mid-year team changes).
    // The fallback can't resurrect a collision - offTeam below already
    // removed the same-named players who weren't on a participating team.
    const useComposite = compositeKey != null && aggregatedByComposite[compositeKey] != null
    const playerAggregated = useComposite ? aggregatedByComposite[compositeKey] : aggregatedByName[normalized]
    const boxScoreGamesPlayed = useComposite ? gamesPlayedByComposite[compositeKey] : gamesPlayedByName[normalized]

    // Same-named player on a team that didn't play: they own none of this
    // name's box-score stats. Remove those categories if a prior bug copied
    // them here, otherwise leave the player untouched.
    if (offTeam.has(player)) {
      const existingYear = player.statsByYear?.[yearNum]
      if (!existingYear || !playerAggregated) return player
      const phantomCategories = Object.keys(playerAggregated).filter(c => existingYear[c] != null)
      if (phantomCategories.length === 0) return player
      const cleaned = { ...existingYear }
      for (const c of phantomCategories) delete cleaned[c]
      return {
        ...player,
        statsByYear: { ...player.statsByYear, [yearNum]: cleaned }
      }
    }

    const existingStatsByYear = player.statsByYear || {}
    const existingYearStats = existingStatsByYear[yearNum] || {}

    if (!playerAggregated) {
      // No box score this year credits this exact player (by team+name when
      // known, else by name alone) - clear any stale box-score-derived
      // categories so a stat line left behind by a previous name-collision
      // (or a team change) doesn't linger forever. A player with nothing to
      // clear is returned as-is to avoid needless object churn across the
      // whole roster.
      const hasStaleBoxScoreStats = categoryKeys.some(cat => existingYearStats[cat])
      if (!hasStaleBoxScoreStats) return player

      const clearedYearStats = { ...existingYearStats }
      categoryKeys.forEach(cat => { delete clearedYearStats[cat] })
      if (!skipGamesPlayed) clearedYearStats.gamesPlayed = 0

      return {
        ...player,
        statsByYear: { ...existingStatsByYear, [yearNum]: clearedYearStats }
      }
    }

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
    // Name-only index only: this takes a bare player name (no pid/team),
    // so there's nothing to disambiguate a collision with - same tradeoff
    // as processBoxScoreSave above.
    const { byName } = extractBoxScoreContribution(game.boxScore, game)
    const playerStats = byName[playerNameNormalized]

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
export function isGamePlayed(g) {
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

  // Bulletproof against a nullish userTid: without this, `g.userTid ===
  // userTid` below turns into `undefined === undefined` and matches EVERY
  // OTHER team's CPU game that also lacks a userTid field (all of them —
  // see buildWholeLeagueGames, which never sets one) — verified against a
  // real dynasty where this silently linked the user's current-week
  // schedule entry to an unrelated CPU-vs-CPU game (wrong two teams,
  // wrong score) instead of creating/keeping the real shell game. Bailing
  // out to an empty diff is always safe here: the caller (applyScheduleDiff)
  // just treats "nothing changed" as a no-op, so a transient missing
  // userTid self-heals on the next sync instead of corrupting a schedule
  // entry that then persists.
  if (userTid == null) {
    console.error('computeScheduleDiff called with a nullish userTid — skipping to avoid mismatching games to the wrong team.')
    return { toAdd: [], toUpdate: [], toRemove: [], toKeep: [], playedAffected: [], updatedSchedule: newSchedule || [] }
  }

  // Existing user-team regular-season games for this year, keyed by week.
  // Legacy game records sometimes omit gameType — treat missing as 'regular'
  // so older dynasties don't get bypassed by the diff and accumulate ghosts.
  // Compare by Number() — a stored tid can be a number while `userTid` arrives
  // as a string (or vice versa) depending on the caller. A raw === here would
  // fail to match the existing slate, so every week looks "new" and the WHOLE
  // schedule gets re-emitted as adds — doubling every one of the user's games
  // on a re-save. Every other tid comparison in this file is Number()-normalized
  // for exactly this reason.
  const userTidN = Number(userTid)
  const existingByWeek = new Map()
  existingGames.forEach(g => {
    const gType = g.gameType || 'regular'
    if (gType !== 'regular') return
    if (Number(g.year) !== Number(year)) return
    const matchesUser = Number(g.team1Tid) === userTidN || Number(g.team2Tid) === userTidN || Number(g.userTid) === userTidN
    if (!matchesUser) return
    existingByWeek.set(Number(g.week), g)
  })

  const opponentTidOf = (g) => (Number(g.team1Tid) === userTidN ? g.team2Tid : g.team1Tid)
  const locationOf = (g) => {
    const oppTid = opponentTidOf(g)
    if (Number(g.homeTeamTid) === userTidN) return 'home'
    if (Number(g.homeTeamTid) === Number(oppTid)) return 'away'
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
        dateLabel: entry.dateLabel ?? null,
        kickoffTimeLabel: entry.kickoffTimeLabel ?? null,
        gameDateMonth: entry.gameDateMonth ?? null,
        gameDateDay: entry.gameDateDay ?? null,
        dayOfWeek: entry.dayOfWeek ?? null,
        kickoffTimeMinutes: entry.kickoffTimeMinutes ?? null,
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

  // 3. Append new games — but NEVER append a game whose (year, week, tid-pair)
  // already exists. If a schedule is re-saved against a stale snapshot,
  // computeScheduleDiff can fail to match the existing slate and emit the whole
  // schedule as adds, duplicating every game (two placeholder records for one
  // matchup, only one of which ever gets the real score, so the game renders
  // twice). Two teams never play twice in one week, so a matching (year, week,
  // sorted tid-pair) is always the same game — skip the duplicate add.
  const pairKey = (g) => {
    const a = Number(g.team1Tid), b = Number(g.team2Tid)
    return `${Number(g.year)}-${Number(g.week)}-${Math.min(a, b)}-${Math.max(a, b)}`
  }
  const existingKeys = new Set(
    patched.filter(g => g?.team1Tid && g?.team2Tid).map(pairKey)
  )
  const newRecords = []
  for (const a of diff.toAdd) {
    const rec = a.gameRecord
    if (rec?.team1Tid && rec?.team2Tid) {
      const k = pairKey(rec)
      if (existingKeys.has(k)) continue // same matchup already present — skip
      existingKeys.add(k)
    }
    newRecords.push(rec)
  }
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

    // Find the game record for this week's matchup. Start from the linked
    // gameId (primary), then consider every regular-season record for this
    // (week, user) — a schedule imported twice can leave a played copy AND a
    // 0-0 placeholder for the same game, and entry.gameId often points at the
    // placeholder. Prefer the "most played" copy so the row shows the real
    // result and links to it, instead of the empty ghost. This mirrors the
    // dedup the Scores tab and Sportsbook already apply. The gameId fallback
    // also covers a deleted-and-replaced game whose entry still points at the
    // old id.
    const candidates = games.filter(g =>
      Number(g.week) === Number(entry.week) &&
      Number(g.year) === Number(year) &&
      (g.gameType || 'regular') === 'regular' &&
      (Number(g.team1Tid) === Number(userTid) || Number(g.team2Tid) === Number(userTid))
    )
    const playedRank = (g) => {
      const t1 = Number(g.team1Score), t2 = Number(g.team2Score)
      const scored = (Number.isFinite(t1) && t1 > 0) || (Number.isFinite(t2) && t2 > 0)
      return (g.isPlayed ? 2 : 0) + (scored ? 1 : 0)
    }
    let game = entry.gameId ? games.find(g => g.id === entry.gameId) : null
    for (const c of candidates) {
      if (!game || playedRank(c) > playedRank(game)) game = c
    }

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
  // A null/undefined entry in the players array must not throw — the roster
  // filters that call this (e.g. the Dynasty Blueprint panel) run in the
  // render path with no error boundary of their own, so a single bad record
  // would black out the whole page.
  if (!player) return false
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

  // Use unified isPlayerOnRoster for consistent filtering across all components.
  // Pass `dynasty` so teambuilder-renamed teams and legacy abbr-string
  // teamsByYear resolve — omitting it silently emptied such rosters.
  return allPlayers.filter(p => isPlayerOnRoster(p, tid, currentYear, dynasty))
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
export const CLASS_PROGRESSION = {
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

  // Pre-index every player name that appears in ANY box score this year, in a
  // SINGLE pass over the games. The per-player check below is then an O(1) Set
  // lookup. The old version re-ran `games.filter()` AND walked every box score
  // for EACH active player — O(activePlayers × allGames × boxScore), which on a
  // multi-season dynasty (the games array spans every season) made the Signing
  // Day advance crawl/appear to hang.
  const namesInBoxScoresThisYear = (() => {
    const names = new Set()
    const addSlot = (slot) => {
      if (!slot) return
      for (const category of Object.values(slot)) {
        if (!Array.isArray(category)) continue
        for (const p of category) {
          const n = normalizeName(p?.playerName)
          if (n) names.add(n)
        }
      }
    }
    for (const game of games) {
      if (Number(game.year) !== Number(year)) continue
      const bs = game.boxScore
      if (!bs) continue
      if (bs.byTid && typeof bs.byTid === 'object') {
        for (const slot of Object.values(bs.byTid)) addSlot(slot)
      }
      addSlot(bs.home)
      addSlot(bs.away)
    }
    return names
  })()
  const hasBoxScoreThisYear = (playerName) => namesInBoxScoresThisYear.has(normalizeName(playerName))

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
    if (hasBoxScoreThisYear(player.name)) {
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

  // NO global dynasty.coachingStaff fallback. That single blob holds only
  // ONE team's coordinators, so it leaks across teams the moment a user runs
  // more than one (e.g. Kentucky's coordinators showing on Arkansas).
  // Coordinators live PER TEAM in teams[tid].byYear[year].coachingStaff (the
  // single source of truth); a team with none entered simply shows none.
  if (!staff) {
    staff = { hcName: null, ocName: null, dcName: null }
  }

  // Head-coach name comes from the COACH ENTITY controlling this team that
  // year (per-team, per-coach) — not a dynasty-wide owner stamp. This keeps
  // each team's head coach separate when one user runs several teams.
  const hcCoach = Object.values(getCoaches(dynasty)).find(c =>
    c && c.controlledBy != null &&
    Number(c.byYear?.[year]?.teamTid ?? c.byYear?.[String(year)]?.teamTid) === Number(tid)
  )
  if (hcCoach && hcCoach.name) {
    staff = { ...staff, hcName: hcCoach.name }
  } else {
    // Legacy fallback for pre-migration saves with no coach entity yet:
    // the owner-only coachTeamByYear stamp.
    const coachTeamForYear = getCoachTeamForYear(dynasty, year)
    const coachTid = coachTeamForYear?.team
    const matchesTeam = coachTeamForYear && (
      (tid != null && coachTid != null && Number(coachTid) === Number(tid)) ||
      coachTid === teamAbbr
    )
    const ownerName = matchesTeam ? getCoachNameForUid(dynasty, dynasty.userId, '') : ''
    if (matchesTeam && ownerName) {
      staff = { ...staff }
      if (coachTeamForYear.position === 'HC') staff.hcName = ownerName
      else if (coachTeamForYear.position === 'OC') staff.ocName = ownerName
      else if (coachTeamForYear.position === 'DC') staff.dcName = ownerName
    }
  }

  return staff
}

/**
 * LEGACY bulk conference alignment for a year, read from the old bulk stores
 * (customConferencesByYear snapshot + carry-back, customConferences, and the
 * conferenceByTeamYear per-abbr overrides). Returns { conf: [abbr,...] } or null.
 *
 * This is NOT the source of truth. It exists only to (a) backfill the canonical
 * per-team field on load (backfillConferencesPerTeam) and (b) act as a safety
 * fallback in getCustomConferencesForYear for any dynasty whose per-team field
 * hasn't been populated yet. Once a dynasty is backfilled, this is never read.
 */
function bulkConferenceMap(dynasty, year) {
  const yearNum = Number(year)
  if (!dynasty || !Number.isFinite(yearNum)) return null
  const startYear = Number(dynasty.startYear) || 2024

  let baseMap = null
  const exact = dynasty.customConferencesByYear?.[yearNum] || dynasty.customConferencesByYear?.[String(yearNum)]
  if (exact && typeof exact === 'object' && Object.keys(exact).length > 0) {
    baseMap = exact
  } else if (dynasty.customConferencesByYear && typeof dynasty.customConferencesByYear === 'object') {
    const minYear = Math.max(startYear, yearNum - 10)
    for (let y = yearNum - 1; y >= minYear; y--) {
      const c = dynasty.customConferencesByYear[y] || dynasty.customConferencesByYear[String(y)]
      if (c && typeof c === 'object' && Object.keys(c).length > 0) { baseMap = c; break }
    }
  }
  if (!baseMap && dynasty.customConferences && typeof dynasty.customConferences === 'object' && Object.keys(dynasty.customConferences).length > 0) {
    baseMap = dynasty.customConferences
  }

  const legacyPerTeam = dynasty.conferenceByTeamYear || {}
  const hasLegacy = Object.keys(legacyPerTeam).length > 0
  if (!baseMap && !hasLegacy) return null

  const src = baseMap || DEFAULT_CONFERENCE_TEAMS
  const result = {}
  for (const [conf, list] of Object.entries(src)) result[conf] = Array.isArray(list) ? [...list] : []
  for (const [abbr, byYearMap] of Object.entries(legacyPerTeam)) {
    if (!byYearMap || typeof byYearMap !== 'object') continue
    const conf = byYearMap[yearNum] ?? byYearMap[String(yearNum)]
    if (!conf) continue
    const up = String(abbr).toUpperCase()
    for (const l of Object.values(result)) { const i = l.findIndex(t => (t || '').toUpperCase() === up); if (i !== -1) l.splice(i, 1) }
    if (!Array.isArray(result[conf])) result[conf] = []
    if (!result[conf].some(t => (t || '').toUpperCase() === up)) result[conf].push(abbr)
  }
  return result
}

/**
 * Compute the COMPLETE per-tid conference history that makes
 * teams[tid].byYear[year].conference the single source of truth: every non-FCS
 * team resolves to a conference for every season via carry-back, with NO default
 * map or legacy store needed at read time.
 *
 * Priority per (team, year): existing per-tid value > legacy bulk stores
 * (bulkConferenceMap) > static real-world default (getTeamConference). The
 * default is consulted ONLY here, as a one-time seed for teams that have no
 * conference stored anywhere (per product decision), then never read again.
 *
 * Returns a lean patch { tid: { year: conferenceName } } of values to WRITE:
 * an anchor at startYear plus a new entry only where the conference CHANGES, so
 * carry-back fills the gaps. Existing per-tid values are never overwritten.
 */
function computeConferenceBackfill(dynasty) {
  const teams = dynasty?.teams
  if (!teams || typeof teams !== 'object') return {}

  const start = Number(dynasty.startYear)
  const cur = Number(dynasty.currentYear)
  const startYear = Number.isFinite(start) ? start : (Number.isFinite(cur) ? cur : null)
  const curYear = Number.isFinite(cur) ? cur : startYear
  if (startYear == null) return {}

  // Anchor span (startYear..currentYear) plus any year that carries legacy data.
  const years = new Set()
  for (let y = startYear; y <= curYear; y++) years.add(y)
  for (const y of Object.keys(dynasty.customConferencesByYear || {})) { const n = Number(y); if (Number.isFinite(n) && n >= startYear) years.add(n) }
  for (const byYearMap of Object.values(dynasty.conferenceByTeamYear || {})) {
    if (byYearMap && typeof byYearMap === 'object') for (const y of Object.keys(byYearMap)) { const n = Number(y); if (Number.isFinite(n) && n >= startYear) years.add(n) }
  }
  const sortedYears = [...years].sort((a, b) => a - b)

  // Per-year abbr(UPPER) → conf from the legacy bulk stores, computed once.
  const bulkIdxByYear = new Map()
  for (const y of sortedYears) {
    const m = bulkConferenceMap(dynasty, y)
    if (!m) continue
    const idx = new Map()
    for (const [conf, list] of Object.entries(m)) for (const a of (list || [])) if (a) idx.set(String(a).toUpperCase(), conf)
    bulkIdxByYear.set(y, idx)
  }

  const out = {}
  for (const [tid, team] of Object.entries(teams)) {
    if (!team || team.isFCS || !team.abbr) continue
    const up = team.abbr.toUpperCase()
    const defaultConf = getTeamConference(team.abbr) || null // static real-world seed
    const by = team.byYear || {}
    let carried = null
    for (const y of sortedYears) {
      const existing = by[y]?.conference ?? by[String(y)]?.conference
      if (existing) { carried = existing; continue }
      const resolved = bulkIdxByYear.get(y)?.get(up) || defaultConf
      if (!resolved) continue
      // Write the startYear anchor, then only at change points.
      if (y === startYear || resolved !== carried) {
        if (!out[tid]) out[tid] = {}
        out[tid][y] = resolved
      }
      carried = resolved
    }
  }
  return out
}

// tid -> the exact prior registry `name` for a team that's since been
// renamed (see the "Heal renamed registry defaults" migration below). Add an
// entry here whenever a base TEAMS[tid].name changes, so dynasties created
// under the old name self-heal on load instead of staying stuck on it.
const RENAMED_REGISTRY_DEFAULTS = {
  110: "Lafayette Ragin' Cajuns", // now "Louisiana Ragin' Cajuns"
  111: 'Monroe Warhawks', // now "UL Monroe Warhawks"
}

/**
 * One-time (idempotent) migration: materialize the COMPLETE per-tid conference
 * history in memory so teams[tid].byYear[year].conference is the single source of
 * truth and getCustomConferencesForYear never needs the default map or legacy
 * stores. Runs in applyMigrations on every load until the persisted copy carries
 * the _conferencesBackfilledV2 flag (persisted for cloud in processMigrationPersistence,
 * or via the DangerZone "Migrate Conferences" action).
 */
function backfillConferencesPerTeam(dynasty) {
  if (!dynasty || dynasty._conferencesBackfilledV2) return dynasty
  const patch = computeConferenceBackfill(dynasty)
  const tids = Object.keys(patch)
  if (tids.length === 0) return { ...dynasty, _conferencesBackfilledV2: true }

  const nextTeams = { ...dynasty.teams }
  for (const tid of tids) {
    const team = nextTeams[tid]
    if (!team) continue
    const byYear = { ...(team.byYear || {}) }
    for (const [y, conf] of Object.entries(patch[tid])) {
      byYear[y] = { ...(byYear[y] || {}), conference: conf }
    }
    nextTeams[tid] = { ...team, byYear }
  }
  return { ...dynasty, teams: nextTeams, _conferencesBackfilledV2: true }
}

/**
 * Get custom conferences for a specific year.
 *
 * Returns a map of { conferenceName: [abbr, ...] } representing the
 * dynasty's conference alignment for the given year.
 *
 * Algorithm: base map + per-team overrides.
 *
 *   Step 1 — Pick a base map (covers ALL teams; handles bulk saves and
 *             Google Sheets sync):
 *     a. customConferencesByYear[year]          — year-specific bulk snapshot
 *     b. walk back to nearest year with a snapshot (carry-forward)
 *     c. customConferences                       — legacy single-snapshot
 *     d. null → returns null (caller uses static defaults)
 *
 *   Step 2 — Overlay per-team overrides (handle individual team edits):
 *     a. conferenceByTeamYear[abbr][year]       — legacy per-team (lower priority)
 *     b. teams[tid].byYear[year].conference     — canonical per-team (wins)
 *
 *   Step 3 — Apply overrides to clone of base map; return.
 *
 * WHY NOT BUILD FROM PER-TEAM DATA ALONE:
 *   Many existing dynasties have conference data ONLY in the bulk stores.
 *   Individual team edits (saveTeamYearInfo) write only to the canonical
 *   per-team field. If the primary path were "build entirely from per-team",
 *   a dynasty with 130 teams where 1 team was individually edited would
 *   return a map with 1 team — silently dropping the other 129.
 *   The overlay approach is safe: base covers all teams; per-team overrides
 *   only move individual teams when they differ from the base.
 *
 * MIGRATION PATH:
 *   Run "Migrate Conferences" in Admin to populate every team's
 *   teams[tid].byYear[year].conference from the legacy bulk stores. After
 *   migration every individual team edit AND the base map agree, so the
 *   overlay is a no-op and the system is effectively single-source.
 */
export function getCustomConferencesForYear(dynasty, year) {
  if (!dynasty || !year) return null

  const yearNum = Number(year)
  if (isNaN(yearNum)) return null

  const teams = dynasty.teams
  if (!teams || typeof teams !== 'object') return null

  // ── SINGLE SOURCE OF TRUTH: teams[tid].byYear[year].conference ───────────────
  // Build the alignment STRICTLY from each team's own per-tid conference for the
  // season, carrying BACK to the most recent prior season it was set (a conference
  // persists until the team is moved, so a 2036 realignment holds in 2037, 2038…).
  // No real-world default map and no legacy bulk stores are consulted — those are
  // folded into the per-tid field once, on load (backfillConferencesPerTeam), so
  // this resolver never needs them. Only this dynasty's real, non-FCS teams appear;
  // nothing is invented. A team with no conference in any season is simply absent
  // (unassigned) rather than guessed from a default.
  const startYear = Number(dynasty.startYear)
  const minYear = Number.isFinite(startYear) ? Math.min(startYear, yearNum) : (yearNum - 50)

  const result = {}
  for (const team of Object.values(teams)) {
    if (!team || team.isFCS || !team.abbr) continue
    const by = team.byYear || {}
    let conf = by[yearNum]?.conference ?? by[String(yearNum)]?.conference
    if (!conf) {
      for (let y = yearNum - 1; y >= minYear; y--) {
        const c = by[y]?.conference ?? by[String(y)]?.conference
        if (c) { conf = c; break }
      }
    }
    if (!conf) continue
    if (!Array.isArray(result[conf])) result[conf] = []
    result[conf].push(team.abbr)
  }

  // Empty → return null so an un-backfilled dynasty (a load path that bypassed
  // migration) still has a chance to resolve via the inert legacy fallbacks that
  // remain in a few callers. A populated dynasty always returns its per-tid map.
  return Object.keys(result).length > 0 ? result : null
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
  return getTeamConference(teamAbbr, customConferences, dynasty?.teams)
}

/**
 * Which conferences are split into divisions for a season, and the ordered
 * division names. Reads dynasty.conferenceDivisionsByYear[year], carrying BACK
 * to the most recent prior season it was set (divisions persist until changed),
 * mirroring the conference carry-back. Returns { conferenceName: [name0, name1] }
 * for split conferences only, or {} when none are split.
 */
export function getConferenceDivisionsForYear(dynasty, year) {
  if (!dynasty || !year) return {}
  const yearNum = Number(year)
  if (isNaN(yearNum)) return {}
  const store = dynasty.conferenceDivisionsByYear
  if (!store || typeof store !== 'object') return {}

  // A saved year is authoritative even when empty (all splits removed that
  // season), so carry-back applies ONLY when the year has no entry at all.
  const hasYear = Object.prototype.hasOwnProperty.call(store, yearNum) || Object.prototype.hasOwnProperty.call(store, String(yearNum))
  let map = store[yearNum] || store[String(yearNum)] || {}
  if (!hasYear) {
    const startYear = Number(dynasty.startYear)
    const minYear = Number.isFinite(startYear) ? startYear : (yearNum - 50)
    for (let y = yearNum - 1; y >= minYear; y--) {
      if (Object.prototype.hasOwnProperty.call(store, y) || Object.prototype.hasOwnProperty.call(store, String(y))) {
        map = store[y] || store[String(y)] || {}
        break
      }
    }
  }

  const out = {}
  for (const [conf, names] of Object.entries(map)) {
    if (Array.isArray(names) && names.length === 2 && names[0] && names[1]) out[conf] = [names[0], names[1]]
  }
  return out
}

/**
 * A team's division NAME for a season (single source of truth:
 * teams[tid].byYear[year].division), with the same carry-back as conference.
 * Returns null when the team isn't in a split conference / has no division.
 */
export function getTeamDivisionForDynasty(dynasty, abbrOrTid, year = null) {
  if (!dynasty) return null
  const targetYear = Number(year || dynasty.currentYear)
  if (!Number.isFinite(targetYear)) return null
  const teams = dynasty.teams || {}

  // Resolve tid → team (accept a tid or an abbr).
  let team = null
  if (typeof abbrOrTid === 'number' || (typeof abbrOrTid === 'string' && /^\d+$/.test(abbrOrTid))) {
    team = teams[String(abbrOrTid)] || teams[Number(abbrOrTid)]
  }
  if (!team && abbrOrTid) {
    const up = String(abbrOrTid).toUpperCase()
    team = Object.values(teams).find(t => (t?.abbr || '').toUpperCase() === up) || null
  }
  if (!team?.byYear) return null

  const by = team.byYear
  let div = by[targetYear]?.division ?? by[String(targetYear)]?.division
  if (!div) {
    const startYear = Number(dynasty.startYear)
    const minYear = Number.isFinite(startYear) ? startYear : (targetYear - 50)
    for (let y = targetYear - 1; y >= minYear; y--) {
      const d = by[y]?.division ?? by[String(y)]?.division
      if (d) { div = d; break }
    }
  }
  return div || null
}

/**
 * Shared display formatter for a team's conference label: "SEC (East)" when the
 * team is in a split conference, otherwise just "SEC" (or null if unknown). This
 * is the single place that formats conference+division for display.
 */
export function getTeamConferenceLabel(dynasty, abbrOrTid, year = null) {
  const conf = getTeamConferenceForDynasty(dynasty, abbrOrTid, year)
  if (!conf) return null
  const divisions = getConferenceDivisionsForYear(dynasty, year || dynasty?.currentYear)
  if (!divisions[conf]) return conf
  const div = getTeamDivisionForDynasty(dynasty, abbrOrTid, year)
  return div ? `${conf} (${div})` : conf
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
// The 5 FCS placeholder tids' logos as originally shipped — all 5 turned
// out to be stock mascot-patch clipart with no resemblance to the real
// in-game logos (confirmed 2026-07-25 against user-provided screenshots of
// the actual custom-schedule team-select screen). Any dynasty's teams[tid]
// still holding one of these exact URLs gets it replaced with the real
// logo below, regardless of when it was created — see REAL_FCS_LOGOS.
const OLD_WRONG_FCS_LOGOS = {
  137: 'https://i.imgur.com/eFyXxwT.png',
  138: 'https://i.imgur.com/NOJOPG8.png',
  139: 'https://i.imgur.com/uBvbn1s.png',
  140: 'https://i.imgur.com/Y8A8u0g.png',
  141: 'https://i.imgur.com/8qfTMIy.png',
}
const REAL_FCS_LOGOS = {
  137: '/fcs-logos/fcs-east.png',
  138: '/fcs-logos/fcs-midwest.png',
  139: '/fcs-logos/fcs-northwest.png',
  140: '/fcs-logos/fcs-west.png',
  141: '/fcs-logos/fcs-southeast.png',
}

// Canonical names for the four pre-existing FCS slots. Both the truly-old
// made-up nicknames (Judicials/Rebels/Stallions/Titans) AND the bare
// no-nickname names ("FCS East" etc., canonical until the nicknames below
// were adopted to match the upstream repo's naming) are treated as legacy —
// any slot still holding one of those gets renamed. A user-customized name
// passes through untouched.
const CANONICAL_FCS_NAMES = {
  137: { name: 'FCS East Sentinels',       legacy: ['FCS East Judicials', 'FCS East'] },
  138: { name: 'FCS Midwest Thunderbirds', legacy: ['FCS Midwest Rebels', 'FCS Midwest'] },
  139: { name: 'FCS Northwest Kodiaks',    legacy: ['FCS Northwest Stallions', 'FCS Northwest'] },
  140: { name: 'FCS West Rivertoads',      legacy: ['FCS West Titans', 'FCS West'] },
}

function correctFCSLogos(teams) {
  if (!teams) return teams
  let next = teams
  for (const [tidStr, oldUrl] of Object.entries(OLD_WRONG_FCS_LOGOS)) {
    const tid = Number(tidStr)
    const slot = next[tid]
    if (slot && (!slot.logo || slot.logo === oldUrl)) {
      next = { ...next, [tid]: { ...slot, logo: REAL_FCS_LOGOS[tid] } }
    }
  }
  return next
}

// Idempotent, unconditional — runs on every load (not just the one-shot
// migration below) so a name-scheme change (like adopting nicknames) reaches
// dynasties that already ran the gated migration, same as correctFCSLogos.
function correctFCSNames(teams) {
  if (!teams) return teams
  let next = teams
  for (const [tidStr, { name, legacy }] of Object.entries(CANONICAL_FCS_NAMES)) {
    const tid = Number(tidStr)
    const slot = next[tid]
    if (slot && legacy.includes(slot.name)) {
      next = { ...next, [tid]: { ...slot, name } }
    }
  }
  return next
}

export function migrateFCSFiveTeams(dynasty) {
  if (!dynasty) return dynasty

  // The main one-shot migration is gated by _fcs5TeamsMigrated, but the
  // logo/name corrections run unconditionally below (cheap, idempotent —
  // only act on slots still holding an empty/known-wrong logo URL or a
  // legacy name). This handles dynasties that already ran the gated
  // migration before the real logos/names were known.
  if (dynasty._fcs5TeamsMigrated) {
    const correctedTeams = correctFCSNames(correctFCSLogos(dynasty.teams))
    if (correctedTeams !== dynasty.teams) {
      return { ...dynasty, teams: correctedTeams }
    }
    return dynasty
  }

  const teams = { ...(dynasty.teams || {}) }

  // Rename old 4-letter abbrs to CFB26's 5-letter codes (only when the
  // dynasty still holds the legacy 4-letter form).
  if (teams[138] && teams[138].abbr === 'FCSM') {
    teams[138] = { ...teams[138], abbr: 'FCSMW' }
  }
  if (teams[139] && teams[139].abbr === 'FCSN') {
    teams[139] = { ...teams[139], abbr: 'FCSNW' }
  }

  // Strip made-up/legacy nicknames from any FCS slot still holding one.
  // User-customized names pass through untouched.
  for (const [tidStr, { name, legacy }] of Object.entries(CANONICAL_FCS_NAMES)) {
    const tid = Number(tidStr)
    const slot = teams[tid]
    if (slot && legacy.includes(slot.name)) {
      teams[tid] = { ...slot, name }
    }
  }

  // Add FCSSE if missing.
  if (!teams[141]) {
    teams[141] = {
      tid: 141,
      abbr: 'FCSSE',
      name: 'FCS Southeast',
      primaryColor: '#12213A',
      secondaryColor: '#E8622C',
      logo: REAL_FCS_LOGOS[141],
      isFCS: true,
      byYear: {},
    }
  }

  return {
    ...dynasty,
    teams: correctFCSLogos(teams),
    _fcs5TeamsMigrated: true,
  }
}

/**
 * Migration: upgrade the five generic FCS teams to CFB 27's set.
 *
 * CFB 27 shipped a new generic FCS lineup — East (Sentinels), Southeast
 * (Condors), Midwest (Thunderbirds), Northwest (Kodiaks), West (Rivertoads)
 * — with new colors, replacing CFB 26's teams. New cfb27 dynasties get these
 * baked in at creation by initializeDynastyTeams. This migration retrofits
 * cfb27 dynasties created before the change: for each FCS slot still holding
 * the pristine CFB 26 default colors (i.e. the user never recolored it), it
 * applies the CFB 27 colors + mascot + logo. Slots the user customized are left
 * untouched, and cfb26 dynasties are never touched at all.
 */
const FCS_CFB26_DEFAULTS = {
  137: { primaryColor: '#2f1936', secondaryColor: '#8e85a1' },
  138: { primaryColor: '#91abc7', secondaryColor: '#1a1a1a' },
  139: { primaryColor: '#bfa544', secondaryColor: '#477f62' },
  140: { primaryColor: '#462e6a', secondaryColor: '#af9458' },
  141: { primaryColor: '#4a7c59', secondaryColor: '#f0e68c' },
}
// The CFB 26 logo each FCS slot shipped with, lowercased for comparison. Used
// so the logo backfill only swaps a slot the user never replaced.
const FCS_CFB26_LOGOS = {
  137: 'https://i.imgur.com/efyxxwt.png',
  138: 'https://i.imgur.com/nojopg8.png',
  139: 'https://i.imgur.com/ubvbn1s.png',
  140: 'https://i.imgur.com/y8a8u0g.png',
  141: 'https://i.imgur.com/8qftmiy.png',
}
const FCS_CFB27_LOGOS = {
  137: 'https://i.imgur.com/youhHZ5.png',
  138: 'https://i.imgur.com/1jzzCpP.png',
  139: 'https://i.imgur.com/PgDD4FD.png',
  140: 'https://i.imgur.com/XfzSZYZ.png',
  141: 'https://i.imgur.com/kwVO5vi.png',
}
const FCS_CFB27_IDENTITY = {
  137: { primaryColor: '#1C2A4D', secondaryColor: '#C6A15B', nickname: 'Sentinels', logo: FCS_CFB27_LOGOS[137] },
  138: { primaryColor: '#7C1D2E', secondaryColor: '#35B5AE', nickname: 'Thunderbirds', logo: FCS_CFB27_LOGOS[138] },
  139: { primaryColor: '#1E4A44', secondaryColor: '#C4A64C', nickname: 'Kodiaks', logo: FCS_CFB27_LOGOS[139] },
  140: { primaryColor: '#D64D95', secondaryColor: '#1A1A1A', nickname: 'Rivertoads', logo: FCS_CFB27_LOGOS[140] },
  141: { primaryColor: '#26314F', secondaryColor: '#E0691E', nickname: 'Condors', logo: FCS_CFB27_LOGOS[141] },
}
export function migrateFCSCfb27Teams(dynasty) {
  if (!dynasty || dynasty._fcsCfb27Migrated) return dynasty
  if (normalizeEditionKey(dynasty.gameEdition) !== 'cfb27') return dynasty

  const teams = { ...(dynasty.teams || {}) }
  let changed = false
  for (const [tidStr, defaults] of Object.entries(FCS_CFB26_DEFAULTS)) {
    const tid = Number(tidStr)
    const slot = teams[tid]
    if (!slot) continue
    // Only upgrade a slot the user hasn't recolored — compare against the
    // CFB 26 defaults case-insensitively so stored casing doesn't matter.
    const p = (slot.primaryColor || '').toLowerCase()
    const s = (slot.secondaryColor || '').toLowerCase()
    if (p === defaults.primaryColor && s === defaults.secondaryColor) {
      teams[tid] = { ...slot, ...FCS_CFB27_IDENTITY[tid] }
      changed = true
    }
  }

  if (!changed) return { ...dynasty, _fcsCfb27Migrated: true }
  return { ...dynasty, teams, _fcsCfb27Migrated: true }
}

/**
 * Migration: backfill CFB 27 FCS logos onto existing cfb27 dynasties.
 *
 * Separate from migrateFCSCfb27Teams because that one only fires when a slot
 * still holds the pristine CFB 26 *colors* — a cfb27 dynasty created after the
 * color/mascot change but before the logo art existed already has the new
 * colors, so it would never re-run. This one keys off the *logo* instead:
 * for each FCS slot still holding its CFB 26 logo, swap in the CFB 27 art. User
 * -replaced logos and cfb26 dynasties are left untouched. Idempotent.
 */
export function migrateFCSCfb27Logos(dynasty) {
  if (!dynasty || dynasty._fcsCfb27LogosMigrated) return dynasty
  if (normalizeEditionKey(dynasty.gameEdition) !== 'cfb27') return dynasty

  const teams = { ...(dynasty.teams || {}) }
  let changed = false
  for (const [tidStr, oldLogo] of Object.entries(FCS_CFB26_LOGOS)) {
    const tid = Number(tidStr)
    const slot = teams[tid]
    if (!slot) continue
    const cur = (slot.logo || '').toLowerCase()
    // Swap the old CFB 26 mark (or an empty logo) for the new CFB 27 art.
    if (cur === oldLogo || cur === '') {
      teams[tid] = { ...slot, logo: FCS_CFB27_LOGOS[tid] }
      changed = true
    }
  }

  if (!changed) return { ...dynasty, _fcsCfb27LogosMigrated: true }
  return { ...dynasty, teams, _fcsCfb27LogosMigrated: true }
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

  // The commitments object is a map of BUCKETS: `edit` (Recruiting-page
  // paste/import) plus per-week buckets from the Dashboard signing-day flow
  // (preseason, regular_N, signing_N, bowl_N, conf_champ). It lives in TWO
  // dual-keyed stores that are supposed to match: the tid-based teams.byYear
  // store and the recruitingCommitmentsByTeamYear store.
  //
  // They can DRIFT: the teams store is replace-persisted while byTeamYear is
  // merge-persisted, so a past bare "{ edit: ... }" write (the recruiting
  // data-loss bug) could strip the per-week buckets from teams while byTeamYear
  // still holds them. Union both so no bucket is lost — teams wins on shared
  // keys (its `edit` is the most-recently-written), byTeamYear fills in any
  // bucket the teams store is missing. When they're in sync this is a no-op;
  // when teams was clobbered it transparently restores the hidden commits.
  const fromTeams = (tid && dynasty.teams?.[tid]?.byYear?.[year]?.recruitingCommitments) || null
  const fromByTeamYear = lookupByTeamYear(dynasty.recruitingCommitmentsByTeamYear, dynasty, tid ?? tidOrAbbr, year) || null

  if (fromTeams && fromByTeamYear) return { ...fromByTeamYear, ...fromTeams }
  return fromTeams || fromByTeamYear || {}
}

/**
 * THE single sanctioned way to WRITE recruiting commitments.
 *
 * Every commitment writer (Recruiting-page paste, in-app target resolution,
 * the Dashboard signing-day/weekly flow, "no commitments this week") must go
 * through this so the two stores can never clobber a bucket or drift apart:
 *
 *   • It reads the CURRENT commitments via getRecruitingCommitments — the UNION
 *     of both stores — so the write always starts from the complete, most
 *     recent bucket set. A writer can never accidentally drop a sibling bucket
 *     by spreading from an incomplete base (the recruiting data-loss bug).
 *   • It sets exactly ONE bucket (`bucket` → `records`) and leaves every other
 *     bucket intact. Pass `replaceAllBuckets: true` for the deliberate
 *     Google-Sheet consolidation, where the sheet is the authoritative full
 *     class and every recruit lands back in `edit`.
 *   • It writes BOTH stores with the SAME object — the tid-based teams store
 *     AND recruitingCommitmentsByTeamYear, dual-keyed under abbr + tid — so the
 *     two are re-synced on every write and any prior drift self-heals.
 *
 * Returns an updates fragment ({ teams, recruitingCommitmentsByTeamYear }) for
 * the caller to spread into its updateDynasty() payload alongside players/etc.
 * Does NOT persist — the caller owns the single updateDynasty() call.
 */
// Internal: turn a fully-formed commitments object (all buckets) into the
// dual-store updates fragment. Shared by every commitment writer so the teams
// store and recruitingCommitmentsByTeamYear can never drift.
function buildCommitmentsFragment(dynasty, resolvedTid, resolvedAbbr, year, nextCommitments) {
  const fragment = {}

  // Teams store (tid-based) — preserve every other team / year / field.
  if (resolvedTid != null && dynasty?.teams) {
    const teams = dynasty.teams
    const teamData = teams[resolvedTid] || {}
    const byYear = teamData.byYear || {}
    const yearData = byYear[year] || {}
    fragment.teams = {
      ...teams,
      [resolvedTid]: {
        ...teamData,
        byYear: { ...byYear, [year]: { ...yearData, recruitingCommitments: nextCommitments } },
      },
    }
  }

  // byTeamYear store — dual-keyed under abbr AND tid (rename-safe).
  const existingByTeamYear = dynasty?.recruitingCommitmentsByTeamYear || {}
  fragment.recruitingCommitmentsByTeamYear = {
    ...existingByTeamYear,
    ...(resolvedAbbr ? { [resolvedAbbr]: { ...(existingByTeamYear[resolvedAbbr] || {}), [year]: nextCommitments } } : {}),
    ...(resolvedTid != null ? { [resolvedTid]: { ...(existingByTeamYear[resolvedTid] || {}), [year]: nextCommitments } } : {}),
  }

  return fragment
}

export function buildRecruitingCommitmentUpdate(dynasty, { tid, teamAbbr, year, bucket, records, replaceAllBuckets = false }) {
  const resolvedTid = tid != null ? tid : getTidFromAbbr(teamAbbr, dynasty)
  const resolvedAbbr = teamAbbr || (resolvedTid != null ? getAbbrFromTid(dynasty?.teams, resolvedTid) : null)

  const current = getRecruitingCommitments(dynasty, resolvedTid ?? resolvedAbbr, year) || {}
  const nextCommitments = replaceAllBuckets
    ? { [bucket]: records }
    : { ...current, [bucket]: records }

  return buildCommitmentsFragment(dynasty, resolvedTid, resolvedAbbr, year, nextCommitments)
}

/**
 * Remove a single committed recruit from EVERY commitments bucket (edit plus
 * per-week signing-day buckets), across both stores. A committed recruit can
 * live in any bucket, so filtering just `edit` would leave them on the board —
 * this filters them out of all of them by pid (preferred) or name. Returns an
 * updates fragment for the caller to spread into its updateDynasty() payload.
 */
export function buildRecruitingCommitmentRemoval(dynasty, { tid, teamAbbr, year, pid, name }) {
  const resolvedTid = tid != null ? tid : getTidFromAbbr(teamAbbr, dynasty)
  const resolvedAbbr = teamAbbr || (resolvedTid != null ? getAbbrFromTid(dynasty?.teams, resolvedTid) : null)

  const current = getRecruitingCommitments(dynasty, resolvedTid ?? resolvedAbbr, year) || {}
  const normName = (n) => String(n || '').toLowerCase().trim()
  const targetPid = pid != null ? String(pid) : null
  const targetName = name ? normName(name) : null
  const matches = (rec) => {
    if (targetPid && rec?.pid != null && String(rec.pid) === targetPid) return true
    if (targetName && normName(rec?.name) === targetName) return true
    return false
  }

  const nextCommitments = {}
  for (const [bucket, records] of Object.entries(current)) {
    nextCommitments[bucket] = Array.isArray(records) ? records.filter(r => !matches(r)) : records
  }

  return buildCommitmentsFragment(dynasty, resolvedTid, resolvedAbbr, year, nextCommitments)
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
  // Social Media data, kept OFF the dynasty object so the dynasty listener
  // can't wipe it. Overlaid onto the exposed currentDynasty below.
  const [socialByDynasty, setSocialByDynasty] = useState({})
  // Non-destructive calendar PREVIEW (dev jumper): { year, phase, week } | null.
  // Overrides only the displayed currentYear/Phase/Week on the EXPOSED dynasty;
  // never persisted. Cleared automatically when the real dynasty changes.
  const [phaseOverride, setPhaseOverride] = useState(null)
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
  // Uses a counter to skip multiple updates (optimistic + server confirm).
  // CAPPED at SKIP_COUNT_MAX to prevent runaway accumulation under burst
  // saves — every Math.max(current, 3) call clamps to at most 6 ignored
  // snapshots, avoiding the "burst saves stall cross-device sync for 10s+"
  // behavior the audit flagged.
  const skipListenerUpdatesCountRef = useRef(0)
  const SKIP_COUNT_MAX = 6
  // Centralized bump — replaces ad-hoc Math.max(current, 3) calls with
  // a clamped form so the count can't accumulate past SKIP_COUNT_MAX
  // under burst saves. Returns the new value for callers that want to
  // read it back.
  const bumpSkipCount = (atLeast = 3) => {
    const next = Math.min(Math.max(skipListenerUpdatesCountRef.current, atLeast), SKIP_COUNT_MAX)
    skipListenerUpdatesCountRef.current = next
    return next
  }
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
  // GENERIC guard: track recently-written main-doc field names per dynasty so a
  // stale Firestore snapshot delivered after the listener-skip window can't
  // revert a field the user just saved. players/games/teams have their own refs
  // above; this covers everything else (dynastyPoints, coaches, etc.). Keyed
  // `${dynastyId}::${field}` -> write timestamp.
  const recentMainDocFieldWritesRef = useRef({})

  // How long a locally-saved field is protected against a stale snapshot
  // overwriting it. Bumped from the original 10s: the cost of this window
  // being "too long" is trivial (a genuinely newer remote change is ignored
  // for a few extra seconds before the next snapshot re-applies it), while
  // the cost of it being too short is real, silent data loss on a slow
  // round-trip — which is exactly what happened to a Recruiting Database
  // import that looked saved, then vanished a moment later.
  const RECENT_WRITE_PROTECTION_MS = 20000

  // Should a background server read's payload be DISCARDED because it predates
  // our own local write?
  //
  // Cache-first reads fire a getDocsFromServer in the background; that request
  // can be in flight when the user saves. When it resolves it carries pre-save
  // data, and blindly applying it reverts what the user just did. The only
  // sound test is ordering, not elapsed time: a read that STARTED before our
  // last write to that collection cannot possibly contain it, however long it
  // takes to arrive. `meta.requestedAt` (stamped by the getters) gives us that.
  //
  // This replaced three inconsistent elapsed-time guards — 10s here, 15s in the
  // listener copy, and NONE on the listener's players callback — which is what
  // let a just-added recruit show up and then vanish on a big dynasty whose
  // reads outrun the window ("sits for like 10 seconds and then disappears").
  // The elapsed-time path remains only as a fallback for unstamped callers.
  const isStaleFreshRead = (dynastyId, meta, tsRef, idRef) => {
    if (idRef.current !== dynastyId) return false
    const lastWrite = tsRef.current || 0
    if (!lastWrite) return false
    if (meta?.requestedAt != null) return meta.requestedAt <= lastWrite
    return Date.now() - lastWrite < RECENT_WRITE_PROTECTION_MS
  }

  // Given a freshly-arrived snapshot's version of a dynasty (`fresh`) and
  // whatever this app already had for that same dynasty a moment ago
  // (`prev`), returns `fresh` with any field written in the last
  // RECENT_WRITE_PROTECTION_MS re-applied from `prev` — so an in-flight
  // write's own snapshot echo (which can carry pre-write data if it arrives
  // before the write has fully settled) can never silently revert it.
  // Deliberately dynasty-id-scoped (not "only if this is currentDynasty") so
  // a write to ANY dynasty in the account — not just the one on screen — is
  // protected the same way.
  const reconcileWithRecentWrites = (fresh, prev) => {
    if (!prev || String(prev.id) !== String(fresh.id)) return fresh
    const dynastyId = fresh.id
    const now = Date.now()

    const recentPlayerUpdate = String(lastPlayersUpdateDynastyIdRef.current) === String(dynastyId) &&
      (now - lastPlayersUpdateTimestampRef.current) < RECENT_WRITE_PROTECTION_MS
    const recentGamesUpdate = String(lastGamesUpdateDynastyIdRef.current) === String(dynastyId) &&
      (now - lastGamesUpdateTimestampRef.current) < RECENT_WRITE_PROTECTION_MS

    const recentFields = []
    const fieldPrefix = `${dynastyId}::`
    for (const [k, ts] of Object.entries(recentMainDocFieldWritesRef.current)) {
      if (k.startsWith(fieldPrefix) && (now - ts) < RECENT_WRITE_PROTECTION_MS) {
        const field = k.slice(fieldPrefix.length)
        if (prev[field] !== undefined) recentFields.push(field)
      }
    }

    if (!recentPlayerUpdate && !recentGamesUpdate && recentFields.length === 0) return fresh

    const preserved = {
      ...fresh,
      ...(recentPlayerUpdate && prev.players ? { players: prev.players } : {}),
      ...(recentGamesUpdate && prev.games ? { games: prev.games } : {}),
      // saveWeeklyScores writes both `teams` (where rankByWeek lives) and
      // `weeklyScoresEntered` to the main doc alongside the games
      // subcollection write. Without preserving them on the same recent-
      // update window, a stale main-doc snapshot delivered after the
      // listener-skip count decrements can clobber the just-saved poll —
      // beta tester report shows up as "ranking reverts to last week's poll
      // after refresh" while the games stay intact (because games is
      // already preserved). The Top 25 page then "fights for which ranking
      // it wants to display" as the listener oscillates.
      ...(recentGamesUpdate && prev.teams ? { teams: prev.teams } : {}),
      ...(recentGamesUpdate && prev.weeklyScoresEntered ? { weeklyScoresEntered: prev.weeklyScoresEntered } : {}),
    }
    // Generic recently-written fields (dynastyPoints, coaches,
    // recruitingDatabasePlayers, etc.) — keep the locally-saved value over a
    // possibly-stale snapshot.
    for (const field of recentFields) preserved[field] = prev[field]
    return preserved
  }

  // Drop any active calendar preview when the real dynasty changes, so a
  // preview from one dynasty never bleeds into another.
  useEffect(() => {
    setPhaseOverride(null)
  }, [currentDynasty?.id])
  // Track which dynasties have had their migration data persisted this session
  // This prevents the auto-save from running multiple times for the same dynasty
  const persistedMigrationDynastiesRef = useRef(new Set())
  // Flag to indicate if a migration save is currently in progress (to serialize saves)
  const migrationSaveInProgressRef = useRef(false)
  // Track which cloud dynasties have had their subcollections loaded (lazy loading optimization)
  const loadedDynastyIdsRef = useRef(new Set())
  // Track which dynasties have ALREADY attempted the legacy-to-subcollection
  // migrations (recaps + seasonal fields) THIS SESSION. Without this guard,
  // both migrations re-fire on every Firestore snapshot whenever the legacy
  // fields are still on the main doc — which means a single failed-or-
  // partial migration sets up an infinite retry loop driven by the dynasty
  // listener. Each retry consumes write quota; once Firestore's per-minute
  // write budget is exhausted, the SDK retries indefinitely at max backoff
  // and the user starts seeing resource-exhausted errors in console.
  // Once per session per dynasty is the right cadence — a permanent failure
  // requires a code fix anyway.
  const migrationsAttemptedRef = useRef({ recaps: new Set(), seasonal: new Set(), recruitingDatabase: new Set(), teamsByYearDuplicates: new Set(), teamFuture: new Set() })
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

  // Per-dynasty, per-session tracking of which subcollections have been
  // confirmed against the SERVER (not just the local Firestore cache) —
  // used to gate the full-page "Loading..." state on the PC (CFB27
  // auto-sync) dynasty screens (see Layout.jsx). A cache-first read paints
  // instantly but can be stale/incomplete right after a "Sync from Save"
  // (or on any cross-device open) — a plain console dynasty is small and
  // single-writer so this never shows, but a PC dynasty's full-roster
  // subcollections can take several seconds to reconcile, during which the
  // cache-first paint shows wrong numbers. Rather than trying to make the
  // cache itself never be stale, PC dynasty pages block on this flag and
  // show a loading state until the server read (or a stamp match proving
  // the cache is already current — see gatedFreshOptions) confirms both
  // players and games for that dynasty this session.
  const pcConfirmedPartsRef = useRef({}) // dynastyId -> Set of confirmed part names
  // Value itself is never read — its setter exists only to force a
  // re-render of consumers when the ref above changes.
  // eslint-disable-next-line no-unused-vars
  const [pcConfirmedTick, setPcConfirmedTick] = useState(0)

  const markPcDynastyPartConfirmed = (dynastyId, part) => {
    if (!dynastyId) return
    const existing = pcConfirmedPartsRef.current[dynastyId] || new Set()
    if (existing.has(part)) return
    existing.add(part)
    pcConfirmedPartsRef.current[dynastyId] = existing
    setPcConfirmedTick(t => t + 1)
  }

  const isPcDynastyDataConfirmed = (dynastyId) => {
    const parts = pcConfirmedPartsRef.current[dynastyId]
    return !!parts && parts.has('players') && parts.has('games')
  }

  // Change-detection for the dynasties listener (Firestore read cost). The
  // listener otherwise re-reads ALL five subcollections for EVERY loaded
  // dynasty on every fire — so editing one dynasty re-reads the subcollections
  // of every other loaded dynasty too, and metadata-only fires re-read
  // needlessly. dynastiesStateRef mirrors the merged state so the listener can
  // reuse the freshest copy of an unchanged dynasty; listenerRevByIdRef records
  // the main-doc revision at which each dynasty was last fully loaded.
  const dynastiesStateRef = useRef([])
  const listenerRevByIdRef = useRef({})
  // Same idea for the shared-league refresh: only re-pull a shared dynasty's
  // subcollections when ITS main doc changed, not when some other shared
  // dynasty in the same snapshot did.
  const sharedRefreshRevRef = useRef({})
  useEffect(() => { dynastiesStateRef.current = dynasties }, [dynasties])
  // Monotonic revision of a dynasty's MAIN doc. Any write bumps updatedAt or
  // lastModified (the stale-snapshot guards rely on this), and this listener
  // only fires on main-doc changes, so an unchanged rev means nothing to
  // re-read. Returns 0 when no timestamp is present → callers must treat 0 as
  // "unknown, do a full read" (never skip).
  const dynastyDocRev = (d) => {
    const toMs = (v) => {
      if (v == null) return 0
      if (typeof v === 'number') return v
      if (typeof v?.toMillis === 'function') { try { return v.toMillis() } catch { return 0 } }
      if (typeof v?.seconds === 'number') return v.seconds * 1000 + (v.nanoseconds || 0) / 1e6
      const t = Date.parse(v)
      return Number.isFinite(t) ? t : 0
    }
    return Math.max(toMs(d?.updatedAt), toMs(d?.lastModified))
  }

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
      // A background server read can only be trusted if it STARTED after our
      // most recent local write to that collection — a read already in flight
      // when the user saved cannot contain what they just saved, no matter how
      // long it takes to come back. The old guard was purely elapsed-time
      // ("ignore fresh data for 10s after a write"), which loses the race on a
      // big dynasty where the read takes longer than the window: the user adds
      // a recruit, sees it, and ~10s later a pre-write snapshot lands and wipes
      // it — "it sits in the system for like 10 seconds and then disappears."
      // requestedAt makes that deterministic instead of a stopwatch bet.
      const onFreshGames = (fresh, meta) => {
        // Fires regardless of the guards below — a PC dynasty page is
        // waiting on this to know the server round-trip actually
        // completed (see isPcDynastyDataConfirmed / pcConfirmedPartsRef).
        markPcDynastyPartConfirmed(dynastyId, 'games')
        if (skipListenerUpdatesCountRef.current > 0) return // active save in flight; don't clobber
        // Stale-snapshot guard. Firestore's eventual consistency sometimes
        // delivers a subcollection snapshot that predates a local save AFTER
        // that save's listener-skip count has decremented to 0. Without this,
        // the stale read overwrites the just-saved games array — reported as
        // "games disappear from the weekly recap right after entering them,
        // but the individual team page still shows them" (the recap reads
        // currentDynasty.games which got clobbered; the team page uses a
        // different lookup).
        if (isStaleFreshRead(dynastyId, meta, lastGamesUpdateTimestampRef, lastGamesUpdateDynastyIdRef)) return
        setDynasties(prev => prev.map(d =>
          String(d.id) === String(dynastyId) ? { ...d, games: fresh } : d
        ))
        setCurrentDynasty(prev => {
          if (!prev || String(prev.id) !== String(dynastyId)) return prev
          return { ...prev, games: fresh }
        })
      }
      const onFreshPlayers = (fresh, meta) => {
        markPcDynastyPartConfirmed(dynastyId, 'players')
        if (skipListenerUpdatesCountRef.current > 0) return
        // Same stale-read rule as games — this is the one that made a
        // just-added recruit vanish on a large dynasty.
        if (isStaleFreshRead(dynastyId, meta, lastPlayersUpdateTimestampRef, lastPlayersUpdateDynastyIdRef)) return
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
          String(d.id) === String(dynastyId) ? foldTeamsByYearFieldsFromFlat({ ...d, ...fresh }) : d
        ))
        setCurrentDynasty(prev => {
          if (!prev || String(prev.id) !== String(dynastyId)) return prev
          return foldTeamsByYearFieldsFromFlat({ ...prev, ...fresh })
        })
      }
      const onFreshRecruitingDatabase = (fresh) => {
        if (skipListenerUpdatesCountRef.current > 0) return
        setDynasties(prev => prev.map(d =>
          String(d.id) === String(dynastyId) ? { ...d, recruitingDatabasePlayers: fresh } : d
        ))
        setCurrentDynasty(prev => {
          if (!prev || String(prev.id) !== String(dynastyId)) return prev
          return { ...prev, recruitingDatabasePlayers: fresh }
        })
      }
      const onFreshTeamFuture = (fresh) => {
        if (skipListenerUpdatesCountRef.current > 0) return
        setDynasties(prev => prev.map(d =>
          String(d.id) === String(dynastyId) ? { ...d, teamFuture: fresh } : d
        ))
        setCurrentDynasty(prev => {
          if (!prev || String(prev.id) !== String(dynastyId)) return prev
          return { ...prev, teamFuture: fresh }
        })
      }
      const onFreshRecruitingClasses = (fresh) => {
        if (skipListenerUpdatesCountRef.current > 0) return
        setDynasties(prev => prev.map(d =>
          String(d.id) === String(dynastyId) ? { ...d, teams: foldRecruitingClassesIntoTeams(d.teams, fresh) } : d
        ))
        setCurrentDynasty(prev => {
          if (!prev || String(prev.id) !== String(dynastyId)) return prev
          return { ...prev, teams: foldRecruitingClassesIntoTeams(prev.teams, fresh) }
        })
      }

      // Firestore-read cost gate: skip each collection's billed background
      // server re-read when the main doc's rev matches the stamp from our
      // last completed sync — see gatedFreshOptions. This path previously
      // had NO gate at all, so every page refresh / dynasty open re-read
      // all five subcollections (~800-1500 billed reads) unconditionally.
      const loadRev = dynastyDocRev(dynasty)
      // When the stamp already matches the current rev, gatedFreshOptions skips
      // wiring onFresh at all (cache is trusted, nothing changed since our last
      // completed server read) — so onFreshPlayers/onFreshGames will never fire
      // to mark confirmation. Mark it here instead so PC dynasty pages don't
      // wait forever on a collection that was already known-fresh.
      if (loadRev > 0 && getSyncStamp(dynastyId, 'players') === loadRev) markPcDynastyPartConfirmed(dynastyId, 'players')
      if (loadRev > 0 && getSyncStamp(dynastyId, 'games') === loadRev) markPcDynastyPartConfirmed(dynastyId, 'games')
      const [subcollectionPlayers, subcollectionGames, subcollectionRecaps, subcollectionSeasons, subcollectionRecruitingDatabase, subcollectionTeamFuture, subcollectionRecruitingClasses] = await Promise.all([
        getPlayersSubcollection(dynastyId, gatedFreshOptions(dynastyId, 'players', loadRev, onFreshPlayers)),
        getGamesSubcollection(dynastyId, gatedFreshOptions(dynastyId, 'games', loadRev, onFreshGames)),
        getWeekRecapsSubcollection(dynastyId, gatedFreshOptions(dynastyId, 'weekRecaps', loadRev, onFreshRecaps)),
        getSeasonsSubcollection(dynastyId, gatedFreshOptions(dynastyId, 'seasons', loadRev, onFreshSeasons)),
        // Isolated with its own catch: this is the newest of these five
        // subcollections, so it's the most likely to hit an environment
        // that hasn't picked up its security rule yet. A failure here
        // must NOT reject the whole Promise.all — that would fall through
        // to the catch below and discard the players/games hydration that
        // already succeeded, which is what caused the roster/score
        // flickering (this dynasty's data alternating between real and
        // blank on every listener snapshot).
        getRecruitingDatabaseSubcollection(dynastyId, gatedFreshOptions(dynastyId, 'recruitingDatabase', loadRev, onFreshRecruitingDatabase)).catch(err => {
          console.warn(`[recruiting database] fetch failed for ${dynastyId}, treating as empty:`, err?.code || err?.message || err)
          return []
        }),
        // Same isolation as recruitingDatabase above — newest subcollection,
        // must not take down players/games hydration if its rules haven't
        // propagated yet.
        getTeamFutureSubcollection(dynastyId, gatedFreshOptions(dynastyId, 'teamFuture', loadRev, onFreshTeamFuture)).catch(err => {
          console.warn(`[teamFuture] fetch failed for ${dynastyId}, treating as empty:`, err?.code || err?.message || err)
          return {}
        }),
        // Same isolation as teamFuture/recruitingDatabase above — newest
        // subcollection, must not take down players/games hydration if its
        // rules haven't propagated yet.
        getRecruitingClassesSubcollection(dynastyId, gatedFreshOptions(dynastyId, 'recruitingClasses', loadRev, onFreshRecruitingClasses)).catch(err => {
          console.warn(`[recruitingClasses] fetch failed for ${dynastyId}, treating as empty:`, err?.code || err?.message || err)
          return {}
        }),
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

      // Same idea, for the legacy teams[tid].byYear[year] duplicate fields
      // (schedule, teamRatings, rankByWeek, etc. — see TEAMS_BYYEAR_FLAT_FIELDS).
      // Cheap in-memory scan first so a dynasty with nothing to clean up
      // never pays for the migration's server read.
      if (!migrationsAttemptedRef.current.teamsByYearDuplicates.has(dynastyId)) {
        const teamsByYearSubFields = Object.values(TEAMS_BYYEAR_FLAT_FIELDS)
        const hasTeamsByYearDuplicates = Object.values(dynasty.teams || {}).some(team => {
          const byYear = team?.byYear
          if (!byYear) return false
          return Object.values(byYear).some(yearData =>
            yearData && teamsByYearSubFields.some(f => f in yearData)
          )
        })
        if (hasTeamsByYearDuplicates) {
          migrationsAttemptedRef.current.teamsByYearDuplicates.add(dynastyId)
          migrateTeamsByYearDuplicatesToSubcollection(dynastyId, dynasty)
            .then(({ migrated, cleared }) => {
              console.log(`[teams migration] ${dynastyId}: wrote ${Array.isArray(migrated) ? migrated.length : 0} season patch(es), cleared ${cleared || 0} cell(s)`)
            })
            .catch(err => {
              console.warn(`[teams migration] failed for ${dynastyId}:`, err?.code || err?.message || err)
            })
        }
      }

      // Recruiting Database: same fall-back-to-legacy + fire-and-forget
      // migration pattern as weekRecaps/seasons above.
      const recruitingDatabasePlayers = subcollectionRecruitingDatabase.length > 0
        ? subcollectionRecruitingDatabase
        : (dynasty.recruitingDatabasePlayers || [])
      if ((dynasty.recruitingDatabasePlayers || []).length > 0 && !migrationsAttemptedRef.current.recruitingDatabase.has(dynastyId)) {
        migrationsAttemptedRef.current.recruitingDatabase.add(dynastyId)
        migrateRecruitingDatabaseToSubcollection(dynastyId, dynasty.recruitingDatabasePlayers).catch(err => {
          console.warn(`[recruiting database migration] failed for ${dynastyId}:`, err?.code || err?.message || err)
        })
      }

      // Scheme Builder depth-chart plans: same fall-back-to-legacy +
      // fire-and-forget migration pattern as recruitingDatabase above.
      const teamFuture = Object.keys(subcollectionTeamFuture || {}).length > 0
        ? subcollectionTeamFuture
        : (dynasty.teamFuture || {})
      if (Object.keys(dynasty.teamFuture || {}).length > 0 && !migrationsAttemptedRef.current.teamFuture.has(dynastyId)) {
        migrationsAttemptedRef.current.teamFuture.add(dynastyId)
        migrateTeamFutureToSubcollection(dynastyId, dynasty.teamFuture).catch(err => {
          console.warn(`[teamFuture migration] failed for ${dynastyId}:`, err?.code || err?.message || err)
        })
      }

      // Fold the recruitingClasses subcollection back onto teams[tid].byYear
      // [year].recruitingClassRoster — no legacy-migration counterpart is
      // needed here (unlike teamFuture/recruitingDatabase above): this field
      // never successfully persisted to any main doc before it got its own
      // subcollection, so there's no legacy data anywhere to migrate.
      const teamsWithRecruitingClasses = foldRecruitingClassesIntoTeams(dynasty.teams, subcollectionRecruitingClasses)

      // Apply migrations to the loaded data
      const dynastyWithData = { ...dynasty, players, games, weekRecapsByYear, recruitingDatabasePlayers, teamFuture, teams: teamsWithRecruitingClasses, ...mergedSeasonal }
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

      // ─── CFB 27: heal launch team abbreviations ─────────────────────────
      // The cfb27 abbr set (e.g. Louisville LOU→UL, Lafayette UL→ULL) is applied
      // at CREATION only. A dynasty whose teams map predates a given remap — or
      // was re-initialized somewhere — can carry a stale/colliding abbr. That's
      // the "UL shows Lafayette, Lafayette is duplicated" report: two slots end
      // up resolving to Lafayette because Louisville took UL while Lafayette
      // never moved to ULL. Re-assert each base tid's cfb27 abbr on every load
      // so dynasty-first name/logo resolution is correct everywhere (conference
      // standings, edit-conference, etc.). Idempotent (only rewrites a differing
      // abbr) and additive; teambuilder-overridden slots (isCustom) keep theirs.
      if (normalizeEditionKey(migrated.gameEdition) === 'cfb27' && migrated.teams) {
        let teamsChanged = false
        const nextTeams = { ...migrated.teams }
        for (const [tidStr, abbr] of Object.entries(CFB27_TEAM_ABBRS)) {
          const tid = Number(tidStr)
          const t = nextTeams[tid]
          if (!t || t.isCustom) continue
          if (t.abbr !== abbr) {
            nextTeams[tid] = { ...t, abbr }
            teamsChanged = true
          }
        }
        if (teamsChanged) migrated = { ...migrated, teams: nextTeams }
      }

      // ─── Heal renamed registry defaults ──────────────────────────────────
      // A team's display name is copied from the registry once, at dynasty
      // creation — a dynasty created before a registry rename keeps showing
      // the old name forever otherwise (e.g. Louisiana Ragin' Cajuns/UL
      // Monroe Warhawks were relabeled from Lafayette/Monroe to match EA's
      // own in-game names). Re-sync a non-custom slot's name to the CURRENT
      // registry name whenever it still matches a KNOWN prior default — never
      // touches a team whose name doesn't match a tracked old default, so a
      // teambuilder rename or any other intentional edit is untouched even
      // without isCustom being set correctly.
      if (migrated.teams) {
        let namesChanged = false
        const healedTeams = { ...migrated.teams }
        for (const [tidStr, oldName] of Object.entries(RENAMED_REGISTRY_DEFAULTS)) {
          const tid = Number(tidStr)
          const t = healedTeams[tid]
          const registryName = TEAMS[tid]?.name
          if (!t || t.isCustom || !registryName) continue
          if (t.name === oldName && t.name !== registryName) {
            healedTeams[tid] = { ...t, name: registryName }
            namesChanged = true
          }
        }
        if (namesChanged) migrated = { ...migrated, teams: healedTeams }
      }

      // ─── Fold legacy bulk conference stores into the per-team field ──────
      // teams[tid].byYear[year].conference is the single source of truth for
      // conference alignment; this backfills it from the old bulk stores so the
      // resolver never needs to read them. Idempotent (flagged once persisted).
      migrated = backfillConferencesPerTeam(migrated)

      // Apply game migration if needed
      if (!migrated._gamesMigrated) {
        migrated = migrateToUnifiedGames(migrated)
      }

      // Drop the phantom Week 15. Earlier versions of the app modeled
      // EA's calendar as 16 regular-season weeks (0-15) followed by
      // CCG / bowls. EA's actual calendar is 15 regular-season weeks
      // (0-14), then a dedicated Conference Championship Week, then
      // bowls / CFP. The fix:
      //   1) If the dynasty is sitting at currentPhase='regular_season'
      //      with currentWeek > 14, advance them into the
      //      conference_championship phase (currentWeek=1) — same
      //      transition the advance-week button now produces, just
      //      auto-applied so users don't get stuck in a phase that
      //      no longer exists.
      //   2) Any saved game with numeric week=15 AND a CCG flag gets
      //      its week field rewritten to 'CCG' — matches the
      //      ConferenceChampionshipModal's storage convention.
      //   3) Games with numeric week=15 but NOT flagged as CCG are
      //      left alone — they're "phantom Week 15" data. The Week
      //      0-14 schedule UI won't render them; user can delete via
      //      the game editor (or surface via a future Danger Zone
      //      cleanup tool).
      // Idempotent — safe to run on every load. Persist via the
      // _week15MigratedV2 flag so we only mutate on first encounter.
      if (!migrated._week15MigratedV2) {
        let touched = false
        const next = { ...migrated }

        // Regular season is now 0–15 (16 weeks). Only weeks BEYOND 15 are
        // invalid; bump those into the Conference Championship phase. A real
        // Week 15 is left in place.
        if (next.currentPhase === 'regular_season' && Number(next.currentWeek) > 15) {
          next.currentPhase = 'conference_championship'
          next.currentWeek = 1
          touched = true
        }

        if (Array.isArray(next.games) && next.games.length > 0) {
          let gamesTouched = false
          const updatedGames = next.games.map(g => {
            if (!g) return g
            const isCCG = g.isConferenceChampionship || g.gameType === GAME_TYPES.CONFERENCE_CHAMPIONSHIP
            if (!isCCG) return g
            // Normalize every CCG game's week to the string 'CCG'.
            // Sources of bad week values we've seen in the wild:
            //   • week: 15 / '15' — old weekly-scores auto-promote
            //   • week: 'CC' — earlier short-form sentinel (Dashboard
            //     navigated with week=CC to /game/new before the
            //     standardization to 'CCG')
            //   • week: NaN — GameEdit's parseInt('CC') stash bug
            //   • week: null/undefined/'' — dedicated CC modal sometimes
            //     omits the field entirely
            // Anything that isn't already exactly 'CCG' gets rewritten.
            if (g.week === 'CCG') return g
            gamesTouched = true
            return { ...g, week: 'CCG' }
          })
          if (gamesTouched) {
            next.games = updatedGames
            touched = true
          }
        }

        next._week15MigratedV2 = true
        migrated = touched ? next : { ...migrated, _week15MigratedV2: true }
      }

      // Collapse phantom rankByWeek slot 100 into the canonical CCG-week
      // slot 15. The Top 25 sheet schema used to expose BOTH a "Week 15"
      // column (slot 15) AND a "CC" column (slot 100) — only slot 15 was
      // ever written to by code, but users who typed CCG-week rankings
      // into the "CC" column stranded data at slot 100 where nothing
      // else in the app reads it. After the schema simplification that
      // drops slot 100 from TOP25_WEEK_KEYS, that stray data needs to
      // land at slot 15 so the Rankings page and getTeamRanking see it.
      // Conflict policy: existing slot-15 data wins (the canonical slot
      // is authoritative); slot-100-only entries fall through.
      // Idempotent — gated by _rankSlot100MigratedV1.
      if (!migrated._rankSlot100MigratedV1) {
        let touched = false
        const teamsObj = migrated.teams || {}
        const nextTeams = {}
        for (const [tidKey, team] of Object.entries(teamsObj)) {
          if (!team?.byYear) {
            nextTeams[tidKey] = team
            continue
          }
          let teamTouched = false
          const nextByYear = {}
          for (const [yearKey, yearEntry] of Object.entries(team.byYear)) {
            const rbw = yearEntry?.rankByWeek
            if (!rbw || !(100 in rbw || '100' in rbw)) {
              nextByYear[yearKey] = yearEntry
              continue
            }
            const slot100 = rbw[100] ?? rbw['100']
            const slot15 = rbw[15] ?? rbw['15']
            const nextRbw = { ...rbw }
            delete nextRbw[100]
            delete nextRbw['100']
            if (slot15 == null && typeof slot100 === 'number') {
              nextRbw[15] = slot100
            }
            nextByYear[yearKey] = { ...yearEntry, rankByWeek: nextRbw }
            teamTouched = true
          }
          nextTeams[tidKey] = teamTouched ? { ...team, byYear: nextByYear } : team
          if (teamTouched) touched = true
        }
        migrated = touched
          ? { ...migrated, teams: nextTeams, _rankSlot100MigratedV1: true }
          : { ...migrated, _rankSlot100MigratedV1: true }
      }

      // Adding a real regular-season Week 15 pushed every postseason rankByWeek
      // slot up by one: Conf Champ 15→16, Bowl Week 1 16→17, Bowl Week 2 17→18,
      // Bowl Week 3/Semis 18→19, Natl Champ 19→20. Shift any stored rank data so
      // the freed slot 15 can hold the new Week 15 poll. Regular weeks 0–14 and
      // CFP slots (101–105) are untouched. Shift in DESCENDING order so a
      // destination is never clobbered before it's moved (slot 20 was unused).
      // Runs AFTER the slot-100 collapse (which lands CCG data at slot 15).
      // Idempotent — gated by _week15RankShiftV1.
      if (!migrated._week15RankShiftV1) {
        const teamsObj = migrated.teams || {}
        let touched = false
        const nextTeams = {}
        for (const [tidKey, team] of Object.entries(teamsObj)) {
          if (!team?.byYear) { nextTeams[tidKey] = team; continue }
          let teamTouched = false
          const nextByYear = {}
          for (const [yearKey, yearEntry] of Object.entries(team.byYear)) {
            const rbw = yearEntry?.rankByWeek
            const has = (k) => rbw && (k in rbw || String(k) in rbw)
            // The CC/bowl rank slots span 15–19 (CC=15, BW1=16, BW2=17, BW3/Semis=18,
            // NatChamp=19 — bowl modals offer all of these; older CPU-game writes
            // also populated 18). They ALL shift up one (→16–20). CFP poll slots
            // (101–105) and regular weeks 0–14 are untouched. Slot 20 was unused.
            if (!rbw || ![15, 16, 17, 18, 19].some(has)) {
              nextByYear[yearKey] = yearEntry
              continue
            }
            const get = (k) => rbw[k] ?? rbw[String(k)]
            const v15 = get(15), v16 = get(16), v17 = get(17), v18 = get(18), v19 = get(19)
            const nextRbw = { ...rbw }
            ;[15, 16, 17, 18, 19].forEach(k => { delete nextRbw[k]; delete nextRbw[String(k)] })
            // Assign HIGH→LOW so no destination is overwritten before it's moved.
            if (v19 != null) nextRbw[20] = v19
            if (v18 != null) nextRbw[19] = v18
            if (v17 != null) nextRbw[18] = v17
            if (v16 != null) nextRbw[17] = v16
            if (v15 != null) nextRbw[16] = v15
            nextByYear[yearKey] = { ...yearEntry, rankByWeek: nextRbw }
            teamTouched = true
          }
          nextTeams[tidKey] = teamTouched ? { ...team, byYear: nextByYear } : team
          if (teamTouched) touched = true
        }
        migrated = touched
          ? { ...migrated, teams: nextTeams, _week15RankShiftV1: true }
          : { ...migrated, _week15RankShiftV1: true }
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

      // cfb27 dynasties: upgrade any pristine CFB 26 FCS slots to CFB 27's
      // new generic teams (colors + mascots). Gated + only touches slots the
      // user never recolored; cfb26 dynasties are left with the old teams.
      migrated = migrateFCSCfb27Teams(migrated)
      // Backfill the CFB 27 FCS logo art onto cfb27 dynasties whose slots still
      // hold the old CFB 26 logo (covers saves already color-migrated before
      // the art existed). Keyed off the logo, so it's independent of the above.
      migrated = migrateFCSCfb27Logos(migrated)

      // Backfill the teamName + nickname split ("Kentucky" | "Wildcats") on the
      // teams map for saves created before the split existed. Additive and
      // idempotent: derives from the full `name` via the same strip the frontend
      // already uses, and never touches `name`, so nothing changes on screen.
      try { if (migrated.teams) migrateTeamNameParts(migrated.teams) } catch (e) { console.error('[migrateTeamNameParts] skipped:', e) }

      // Per-team-per-week ranks. Walks every stored game and seeds
      // dynasty.teams[tid].byYear[year].rankByWeek so display sites
      // can do a one-line lookup ("what's team T's rank entering
      // Week N?") instead of deriving entering rank from a prior
      // game's stored rank. User games' stored team1Rank/team2Rank
      // are pre-game ranks (entering); CPU games' are post-game
      // ranks (= entering next week). Migration handles both.
      // Gate on the latest migration version so dynasties that ran
      // older versions get re-migrated with the corrected semantic
      // (V5 dropped the buggy CPU-game shift). Without bumping the
      // gate flag, a V4-marked dynasty would skip the rerun and stay
      // off-by-one for every CPU-game team.
      if (!migrated._rankByWeekMigratedV5) {
        migrated = migrateRanksToRankByWeek(migrated)
      }

      // Collapse the offseason from the old 8-week layout to the new 7-week one.
      //   old wk8 (Conferences/Transfers) → new wk7 (same tasks)
      //   old wk7 (Training)              → new wk6 (Training Results)
      //   old wk6 (Signing Day Results, post-flip) → stays wk6 (Training Results;
      //            the year flip already happened, so land on the next post-flip step)
      //   old wk≤5 → unchanged (recruiting / Signing Day are pre-flip)
      // The year flip stays at wk5→6 in BOTH models, so no year change is needed.
      // Gated by a persisted flag so it runs exactly once per dynasty.
      if (!migrated._offseasonWeekCollapseV1) {
        if (migrated.currentPhase === 'offseason' && typeof migrated.currentWeek === 'number') {
          const w = migrated.currentWeek
          const newW = w >= 8 ? 7 : w === 7 ? 6 : w
          if (newW !== w) migrated = { ...migrated, currentWeek: newW }
        }
        migrated._offseasonWeekCollapseV1 = true
      }

      // NOTE: the "flip the year ON Signing Day" model is the ACTIVE model again
      // (year flip at wk4→5; Signing Day wk5 is the FIRST week of the new season,
      // post-flip). A save parked on offseason wk5 with the year already flipped
      // (classProgressionDoneForYear === currentYear) is now in the CORRECT state
      // and must be left exactly where it is. This migration — which previously
      // shoved such saves forward to wk6 to rescue them under the reverted
      // collapse model — is therefore a no-op. We keep the flag so the one-time
      // pass is recorded and never re-evaluates.
      if (!migrated._offseasonRevertFlipExperimentV1) {
        migrated._offseasonRevertFlipExperimentV1 = true
      }

      // Heal a corrupted offseason year-flip state. The year flip
      // (advanceWeek wk4→5) sets classProgressionDoneForYear AND currentYear
      // to the SAME new year, atomically — so once the flip has run the
      // invariant is `classProgressionDoneForYear === currentYear`. A save
      // where classProgressionDoneForYear is exactly currentYear + 1 means the
      // flip's roster/class work committed but currentYear was left a year
      // behind — the inconsistent state a revert or a model-flip migration
      // produces when it rolls currentYear back without undoing the flip
      // artifacts (rosters, coach career entries, classProgressionDoneForYear).
      // Symptom: advancing the LAST offseason week lands on the same year's
      // preseason instead of the next season, and next year's roster looks
      // "already there" but the season never advances. Restore the invariant
      // by advancing currentYear to match. Narrow + idempotent: only fires in
      // the offseason on the exact off-by-one mismatch, so a healthy dynasty
      // (classProgressionDoneForYear === currentYear) is never touched.
      if (
        migrated.currentPhase === 'offseason' &&
        Number.isFinite(Number(migrated.classProgressionDoneForYear)) &&
        Number(migrated.classProgressionDoneForYear) === Number(migrated.currentYear) + 1
      ) {
        migrated = { ...migrated, currentYear: Number(migrated.classProgressionDoneForYear) }
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

      // Ownership backfill — older LOCAL saves (and any free-tier dynasty
      // created before the owner was stamped) may have editors but no
      // userId, so their creator renders as a plain member instead of the
      // commish. The creator is editors[0]; stamp them as the owner. Cloud
      // dynasties always carry userId (the create rule requires it), so this
      // only ever fixes local saves.
      if (!migrated.userId && Array.isArray(migrated.editors) && migrated.editors.length > 0) {
        migrated = { ...migrated, userId: migrated.editors[0] }
      }

      // COACH-ENTITY MIGRATION: bring each user's head coach into the
      // cid-keyed coaches map (controlledBy = their uid), derived from the
      // legacy uid-keyed maps. Additive + fail-safe + idempotent (see
      // coachModel.migrateDynastyToCoaches). Computed in-memory on every
      // load until the user next mutates a coach; intentionally NOT added to
      // the on-open auto-persist block, so merely viewing a years-deep save
      // never writes to it. Legacy maps are preserved untouched for fallback.
      migrated = migrateDynastyToCoaches(migrated)

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
          // Use a stable string key for the week so non-numeric weeks
          // (CCG games carry week='CCG') don't collapse to NaN and
          // collide with each other across conferences. Numeric weeks
          // are stringified to "0".."14"; CCG stays "CCG".
          let week
          if (g.week === '' || g.week == null) week = ''
          else if (typeof g.week === 'string' && !/^\d+$/.test(g.week)) week = g.week.toUpperCase()
          else {
            const n = Number(g.week)
            week = Number.isFinite(n) ? String(n) : 'CCG'
          }
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

      // Reconstruct dynasty.teams[tid].byYear[year].{rankByWeek,division,
      // schoolGrades,recruitingClassConferenceRank,recruitingClassStats}
      // from the flat *ByTeamYear seasons-subcollection fields, so every
      // existing read site (30+ call sites read rankByWeek alone) keeps
      // working unchanged even though updateDynasty now strips these
      // fields off the main-doc `teams` map before it's written. No-op
      // for a dynasty whose main doc still carries the legacy inline
      // data and has never gone through the new write path.
      migrated = foldTeamsByYearFieldsFromFlat(migrated)

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

    // Load local dynasties (IndexedDB). Normally instant, but on an iOS
    // home-screen (standalone) PWA the shared IndexedDB subsystem can hang the
    // localforage open with NO success/error event, so these awaits would never
    // settle — freezing the app forever on "Loading dynasties...". Race a
    // timeout so boot always proceeds; if the read ever lands, merge it in.
    const LOCAL_LOAD_TIMEOUT_MS = 4000
    const loadLocalDynasties = async () => {
      const read = (async () => {
        // First, migrate any existing localStorage data to IndexedDB, then load.
        await indexedDBStorage.migrateFromLocalStorage()
        const saved = await indexedDBStorage.getDynasties()
        return (saved || []).map(d => ({ ...d, storageType: 'local' }))
      })().catch((error) => {
        console.error('Error loading local dynasties:', error)
        return []
      })
      const result = await Promise.race([
        read,
        new Promise((resolve) => setTimeout(() => resolve(null), LOCAL_LOAD_TIMEOUT_MS)),
      ])
      if (result == null) {
        console.warn('[DynastyContext] Local IndexedDB did not respond in time — proceeding without local data (likely iOS standalone PWA). Cloud sync continues.')
        // If the read eventually resolves with data, merge it — but only if
        // nothing else (cloud) has populated the list in the meantime.
        read.then((late) => {
          if (Array.isArray(late) && late.length > 0) {
            localDynastiesRef = late
            setDynasties((prev) => (prev.length === 0 ? applyMigrations(late) : prev))
          }
        }).catch(() => {})
        return []
      }
      localDynastiesRef = result
      return result
    }

    // Clear lazy loading cache when user changes (logout or login as different user)
    loadedDynastyIdsRef.current.clear()
    migrationsAttemptedRef.current.recaps.clear()
    migrationsAttemptedRef.current.seasonal.clear()
    migrationsAttemptedRef.current.recruitingDatabase.clear()
    migrationsAttemptedRef.current.teamsByYearDuplicates.clear()

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

    // Boot watchdog. Firestore uses persistentLocalCache (IndexedDB), so if the
    // iOS standalone IndexedDB subsystem hangs, the first snapshot may NEVER
    // arrive and cloudSyncing would stay true forever — the app freezes on
    // "Loading dynasties..." even after the local-load timeout above clears
    // `loading`. As a last resort, force both flags off after a longer delay so
    // the user always reaches the app; real cloud data still merges in later if
    // the snapshot eventually lands. Cleared on unmount.
    const bootWatchdog = setTimeout(() => {
      setLoading(false)
      setCloudSyncing(false)
    }, 12000)

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

      // Half-deleted dynasties: a teardown that died partway leaves the main
      // doc alive with some subcollections already gone. It's tombstoned with
      // _deleting — hide it (never resurrect a gutted dynasty in the list)
      // and quietly finish the teardown in the background. Idempotent: the
      // retry deletes whatever remains and then the main doc.
      const deletingDocs = firestoreDynasties.filter(d => d._deleting === true)
      const liveFirestoreDynasties = firestoreDynasties.filter(d => d._deleting !== true)
      for (const doomed of deletingDocs) {
        deleteDynastyWithSubcollections(doomed.id).catch(err => {
          console.warn(`[listener] retrying teardown of half-deleted dynasty ${doomed.id} failed:`, err?.message)
        })
      }

      // LAZY LOADING OPTIMIZATION: Only load subcollections for dynasties that are already loaded
      // or currently selected. This reduces Firestore reads significantly for users with many dynasties.
      const cloudDynastiesWithSubcollections = await Promise.all(
        liveFirestoreDynasties.map(async (dynasty) => {
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

            // Change-detection (Firestore read cost): if this dynasty's main doc
            // hasn't changed since we last fully loaded it, reuse the freshest
            // copy already in state instead of re-reading its five
            // subcollections. Any real change bumps the rev (updatedAt/
            // lastModified) and this listener only fires on main-doc changes, so
            // an unchanged rev means there is nothing new to read. rev===0 (no
            // timestamp) or no prior loaded copy → fall through to a full read.
            const rev = dynastyDocRev(dynasty)
            if (rev > 0 && listenerRevByIdRef.current[dynasty.id] === rev) {
              const existing = dynastiesStateRef.current.find(d => String(d.id) === String(dynasty.id))
              if (existing && Array.isArray(existing.players)) {
                return existing
              }
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
            const onFreshGames = (fresh, meta) => {
              // Fires regardless of the guards below — a PC dynasty page is
              // waiting on this to know the server round-trip actually
              // completed (see isPcDynastyDataConfirmed).
              markPcDynastyPartConfirmed(dynId, 'games')
              if (skipListenerUpdatesCountRef.current > 0) return
              // Don't let a background server-read (kicked off before a local save)
              // overwrite games that were just committed locally. The cache-first
              // read dispatches a getDocsFromServer fetch BEFORE the save batch
              // runs; if that read wins the race it returns pre-save data, which
              // would revert the UI to blank and make subsequent addGame calls
              // create duplicates.
              if (isStaleFreshRead(dynId, meta, lastGamesUpdateTimestampRef, lastGamesUpdateDynastyIdRef)) return
              setDynasties(prev => prev.map(d =>
                String(d.id) === String(dynId) ? { ...d, games: fresh } : d
              ))
              setCurrentDynasty(prev => {
                if (!prev || String(prev.id) !== String(dynId)) return prev
                return { ...prev, games: fresh }
              })
            }
            const onFreshPlayers = (fresh, meta) => {
              markPcDynastyPartConfirmed(dynId, 'players')
              if (skipListenerUpdatesCountRef.current > 0) return
              // Previously UNGUARDED: any background players read that landed
              // after a local save silently overwrote it, which is what made a
              // just-added recruit disappear moments later.
              if (isStaleFreshRead(dynId, meta, lastPlayersUpdateTimestampRef, lastPlayersUpdateDynastyIdRef)) return
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
                String(d.id) === String(dynId) ? foldTeamsByYearFieldsFromFlat({ ...d, ...fresh }) : d
              ))
              setCurrentDynasty(prev => {
                if (!prev || String(prev.id) !== String(dynId)) return prev
                return foldTeamsByYearFieldsFromFlat({ ...prev, ...fresh })
              })
            }
            const onFreshRecruitingDatabase = (fresh) => {
              if (skipListenerUpdatesCountRef.current > 0) return
              setDynasties(prev => prev.map(d =>
                String(d.id) === String(dynId) ? { ...d, recruitingDatabasePlayers: fresh } : d
              ))
              setCurrentDynasty(prev => {
                if (!prev || String(prev.id) !== String(dynId)) return prev
                return { ...prev, recruitingDatabasePlayers: fresh }
              })
            }
            const onFreshTeamFuture = (fresh) => {
              if (skipListenerUpdatesCountRef.current > 0) return
              setDynasties(prev => prev.map(d =>
                String(d.id) === String(dynId) ? { ...d, teamFuture: fresh } : d
              ))
              setCurrentDynasty(prev => {
                if (!prev || String(prev.id) !== String(dynId)) return prev
                return { ...prev, teamFuture: fresh }
              })
            }
            const onFreshRecruitingClasses = (fresh) => {
              if (skipListenerUpdatesCountRef.current > 0) return
              setDynasties(prev => prev.map(d =>
                String(d.id) === String(dynId) ? { ...d, teams: foldRecruitingClassesIntoTeams(d.teams, fresh) } : d
              ))
              setCurrentDynasty(prev => {
                if (!prev || String(prev.id) !== String(dynId)) return prev
                return { ...prev, teams: foldRecruitingClassesIntoTeams(prev.teams, fresh) }
              })
            }

            // Firestore-read cost gate: even when the in-memory rev gate
            // above misses (page refresh wiped it, or this is the active
            // dynasty whose rev just bumped from our OWN save), the
            // persisted per-collection stamps let each getter skip its
            // billed server re-read when nothing actually changed since
            // the last completed sync — see gatedFreshOptions.
            //
            // Same reasoning as selectDynasty's copy: a stamp match means
            // gatedFreshOptions won't wire onFresh at all, so mark confirmed
            // here or a PC dynasty page would wait forever on this collection.
            if (rev > 0 && getSyncStamp(dynasty.id, 'players') === rev) markPcDynastyPartConfirmed(dynasty.id, 'players')
            if (rev > 0 && getSyncStamp(dynasty.id, 'games') === rev) markPcDynastyPartConfirmed(dynasty.id, 'games')
            const [subcollectionPlayers, subcollectionGames, subcollectionRecaps, subcollectionSeasons, subcollectionRecruitingDatabase, subcollectionTeamFuture, subcollectionRecruitingClasses] = await Promise.all([
              getPlayersSubcollection(dynasty.id, gatedFreshOptions(dynasty.id, 'players', rev, onFreshPlayers)),
              getGamesSubcollection(dynasty.id, gatedFreshOptions(dynasty.id, 'games', rev, onFreshGames)),
              getWeekRecapsSubcollection(dynasty.id, gatedFreshOptions(dynasty.id, 'weekRecaps', rev, onFreshRecaps)),
              getSeasonsSubcollection(dynasty.id, gatedFreshOptions(dynasty.id, 'seasons', rev, onFreshSeasons)),
              // Isolated with its own catch — see the matching comment in
              // selectDynasty's copy of this Promise.all. A failure here must
              // never reject the whole group and wipe out players/games.
              getRecruitingDatabaseSubcollection(dynasty.id, gatedFreshOptions(dynasty.id, 'recruitingDatabase', rev, onFreshRecruitingDatabase)).catch(err => {
                console.warn(`[recruiting database] fetch failed for ${dynasty.id}, treating as empty:`, err?.code || err?.message || err)
                return []
              }),
              getTeamFutureSubcollection(dynasty.id, gatedFreshOptions(dynasty.id, 'teamFuture', rev, onFreshTeamFuture)).catch(err => {
                console.warn(`[teamFuture] fetch failed for ${dynasty.id}, treating as empty:`, err?.code || err?.message || err)
                return {}
              }),
              getRecruitingClassesSubcollection(dynasty.id, gatedFreshOptions(dynasty.id, 'recruitingClasses', rev, onFreshRecruitingClasses)).catch(err => {
                console.warn(`[recruitingClasses] fetch failed for ${dynasty.id}, treating as empty:`, err?.code || err?.message || err)
                return {}
              }),
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

            if (legacyKeys.length > 0 && !migrationsAttemptedRef.current.recaps.has(dynasty.id)) {
              // Fire-and-forget — UI uses `weekRecapsByYear` regardless of
              // which storage tier holds the data, so the user can keep
              // working while migration runs in the background.
              // Gate behind a per-session ref so the migration can't
              // re-fire on every snapshot if the cleanup writes fail
              // (resource-exhausted, rule denial, network drop). One
              // attempt per dynasty per session is enough — a real
              // failure needs a code fix anyway.
              migrationsAttemptedRef.current.recaps.add(dynasty.id)
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
            if (hasLegacySeasonal && !migrationsAttemptedRef.current.seasonal.has(dynasty.id)) {
              // One attempt per dynasty per session. Same justification as
              // the recap migration guard above — without this, a failed
              // cleanup write turns this into an infinite retry loop
              // driven by every dynasty-listener snapshot. The legacy
              // fields stay on the main doc, the next snapshot arrives,
              // and we try to migrate again. Quota exhaustion follows.
              migrationsAttemptedRef.current.seasonal.add(dynasty.id)
              migrateSeasonalFieldsToSubcollection(dynasty.id, legacySeasonalSnapshot)
                .then(({ migrated, cleared }) => {
                  console.log(`[season migration] ${dynasty.id}: migrated ${migrated.length} season(s), cleared ${cleared.length} field(s)`)
                })
                .catch(err => {
                  console.warn(`[season migration] failed for ${dynasty.id}:`, err?.code || err?.message || err)
                })
            }

            // Same idea, for the legacy teams[tid].byYear[year] duplicate
            // fields — see the matching comment in loadDynastyData's copy
            // of this check.
            if (!migrationsAttemptedRef.current.teamsByYearDuplicates.has(dynasty.id)) {
              const teamsByYearSubFields = Object.values(TEAMS_BYYEAR_FLAT_FIELDS)
              const hasTeamsByYearDuplicates = Object.values(dynasty.teams || {}).some(team => {
                const byYear = team?.byYear
                if (!byYear) return false
                return Object.values(byYear).some(yearData =>
                  yearData && teamsByYearSubFields.some(f => f in yearData)
                )
              })
              if (hasTeamsByYearDuplicates) {
                migrationsAttemptedRef.current.teamsByYearDuplicates.add(dynasty.id)
                migrateTeamsByYearDuplicatesToSubcollection(dynasty.id, dynasty)
                  .then(({ migrated, cleared }) => {
                    console.log(`[teams migration] ${dynasty.id}: wrote ${Array.isArray(migrated) ? migrated.length : 0} season patch(es), cleared ${cleared || 0} cell(s)`)
                  })
                  .catch(err => {
                    console.warn(`[teams migration] failed for ${dynasty.id}:`, err?.code || err?.message || err)
                  })
              }
            }

            // Recruiting Database: same fall-back-to-legacy + fire-and-
            // forget migration pattern as weekRecaps/seasons above.
            const recruitingDatabasePlayers = subcollectionRecruitingDatabase.length > 0
              ? subcollectionRecruitingDatabase
              : (dynasty.recruitingDatabasePlayers || [])
            if ((dynasty.recruitingDatabasePlayers || []).length > 0 && !migrationsAttemptedRef.current.recruitingDatabase.has(dynasty.id)) {
              migrationsAttemptedRef.current.recruitingDatabase.add(dynasty.id)
              migrateRecruitingDatabaseToSubcollection(dynasty.id, dynasty.recruitingDatabasePlayers).catch(err => {
                console.warn(`[recruiting database migration] failed for ${dynasty.id}:`, err?.code || err?.message || err)
              })
            }

            // Scheme Builder depth-chart plans: same fall-back-to-legacy +
            // fire-and-forget migration pattern as recruitingDatabase above.
            const teamFuture = Object.keys(subcollectionTeamFuture || {}).length > 0
              ? subcollectionTeamFuture
              : (dynasty.teamFuture || {})
            if (Object.keys(dynasty.teamFuture || {}).length > 0 && !migrationsAttemptedRef.current.teamFuture.has(dynasty.id)) {
              migrationsAttemptedRef.current.teamFuture.add(dynasty.id)
              migrateTeamFutureToSubcollection(dynasty.id, dynasty.teamFuture).catch(err => {
                console.warn(`[teamFuture migration] failed for ${dynasty.id}:`, err?.code || err?.message || err)
              })
            }

            // Mark as loaded
            loadedDynastyIdsRef.current.add(dynasty.id)
            // Record the main-doc rev we just fully loaded at, so the next fire
            // can skip re-reading when nothing changed. Only set on success —
            // the catch below leaves it unset so a failed load always retries.
            if (rev > 0) listenerRevByIdRef.current[dynasty.id] = rev

            return {
              ...taggedDynasty,
              players,
              games,
              weekRecapsByYear,
              recruitingDatabasePlayers,
              teamFuture,
              // No legacy-migration counterpart needed here (unlike teamFuture/
              // recruitingDatabase above) — recruitingClassRoster never
              // successfully persisted to any main doc before it got its own
              // subcollection, so there's no legacy data anywhere to migrate.
              teams: foldRecruitingClassesIntoTeams(dynasty.teams, subcollectionRecruitingClasses),
              ...mergedSeasonal,
            }
          } catch (err) {
            console.error(`Error loading subcollections for dynasty ${dynasty.id}:`, err)
            // Preserve already-hydrated heavy fields from current state: the
            // raw main doc has NO players/games (deleteField'd at migration),
            // so returning it bare would blank a loaded dynasty's roster in
            // setDynasties below — and loadedDynastyIdsRef was already set by
            // the earlier successful load, so nothing would re-hydrate it.
            // A transient read error must degrade to "stale", never "empty".
            // (Same pattern as the shared-dynasties listener.)
            const prior = dynastiesStateRef.current.find(d => String(d.id) === String(dynasty.id))
            if (prior && (prior.players || prior.games)) {
              return {
                ...dynasty,
                storageType: 'cloud',
                players: prior.players,
                games: prior.games,
                weekRecapsByYear: prior.weekRecapsByYear,
                recruitingDatabasePlayers: prior.recruitingDatabasePlayers,
              }
            }
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
      //
      // Id-collision rule: a local and a cloud copy share an id ONLY after a
      // cloud→local export that kept the cloud copy (downgrade / beta-lapse
      // auto-export, deleteFromCloud:false). For a PREMIUM user the cloud copy
      // is the live one — cloud wins. For a NON-premium user the cloud copy is
      // read-only; letting it shadow the freshly-exported LOCAL copy would
      // defeat the entire point of the export (the user's editable copy
      // becomes invisible). So on collision: premium → cloud wins, free →
      // local wins.
      const localIds = new Set(freshLocalDynasties.map(d => String(d.id)))
      const cloudToUse = isPremium
        ? dynastiesToUse
        : dynastiesToUse.filter(d => !localIds.has(String(d.id)))
      const usedIds = new Set(cloudToUse.map(d => d.id))
      const uniqueLocalDynasties = freshLocalDynasties.filter(d => !usedIds.has(d.id))
      const allDynasties = [...uniqueLocalDynasties, ...cloudToUse]

      // Apply all migrations
      const migratedDynasties = applyMigrations(allDynasties)

      // A snapshot can arrive carrying data from just before a write actually
      // settled — reconcileWithRecentWrites protects against that echo
      // reverting a fresh local save. This used to only run for whichever
      // dynasty was `currentDynasty` at the time (see setCurrentDynasty
      // below); a write to any OTHER dynasty in this array (e.g. a
      // background operation, or a co-commish/shared-dynasty write) had zero
      // protection — the very next snapshot could silently revert it. Now
      // applied uniformly to every dynasty in the incoming snapshot, not just
      // the one currently open.
      setDynasties(prevDynasties => migratedDynasties.map(fresh => {
        const prev = prevDynasties.find(d => String(d.id) === String(fresh.id))
        return prev ? reconcileWithRecentWrites(fresh, prev) : fresh
      }))
      setLoading(false)
      setCloudSyncing(false)

      // Update current dynasty if it's in the list. Functional setter form
      // so we read the LATEST currentDynasty — the listener closure is now
      // stable across navigations (no longer rebuilt on every dynasty open)
      // and a captured `currentDynasty` reference would be stale here.
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
        return reconcileWithRecentWrites(updated, prevCurrent)
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

            // Persist the complete per-tid conference backfill once, so
            // teams[tid].byYear[year].conference becomes the durable single
            // source of truth (not just an in-memory materialization).
            if (migrated._conferencesBackfilledV2 && !raw._conferencesBackfilledV2) {
              flagsToSave._conferencesBackfilledV2 = true
              if (migrated.teams) flagsToSave.teams = migrated.teams
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

    return () => { clearTimeout(bootWatchdog); unsubscribe() }
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
        // Dedup: the export keeps the cloud copy (deleteFromCloud:false) and
        // the local copy keeps the SAME id, so the raw concat holds both —
        // rendering two cards per dynasty (one read-only). Apply the same
        // local-wins-for-free-users rule the listener merge uses.
        const all = await storageService.getDynasties()
        const localIds = new Set(all.filter(d => d.storageType !== 'cloud').map(d => String(d.id)))
        const deduped = all.filter(d => d.storageType !== 'cloud' || !localIds.has(String(d.id)))
        if (!cancelled) setDynasties(deduped)

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

  // Beta-grant lapse → same cloud→local rescue as a real cancellation.
  //
  // A self-granted premium pass (_devGranted) has no Stripe subscription, so
  // when it expires NO webhook fires and pendingDowngrade never gets set —
  // the user just silently drops to free tier with their cloud dynasties
  // stranded read-only. The webhook path above can't cover them. Detect the
  // lapse client-side and run the identical migration.
  //
  // We can't set pendingDowngrade ourselves (Firestore rules only let the
  // client clear it, never set it), so the once-only guard is a localStorage
  // key scoped to uid + the grant's expiry. That's per-DEVICE, which is
  // exactly right: each device needs its own local copy, and migrateToLocal
  // keeps the cloud copies (deleteFromCloud:false) so other devices — and a
  // future re-subscribe — still have the source data.
  const migratingLapseRef = useRef(false)
  useEffect(() => {
    if (!user || !subscription) return
    // Only beta/dev grants that have lapsed but were never downgraded.
    if (!subscription._devGranted || subscription.tier !== 'premium') return
    const cpe = subscription.currentPeriodEnd
    if (!cpe) return // no expiry recorded → legacy active grant, don't touch
    const endMs = cpe.toMillis ? cpe.toMillis() : (cpe.seconds ? cpe.seconds * 1000 : new Date(cpe).getTime())
    if (!Number.isFinite(endMs) || endMs > Date.now()) return // still active
    if (isPremium) return // belt-and-suspenders: don't migrate anyone still premium

    const guardKey = `betaLapseMigrated:${user.uid}:${endMs}`
    try { if (localStorage.getItem(guardKey) === '1') return } catch { /* ignore */ }
    if (migratingLapseRef.current) return
    migratingLapseRef.current = true

    let cancelled = false
    ;(async () => {
      try {
        // Match the cancellation path exactly: keep cloud copies as a soft
        // backup so a re-subscribe (or another device) still has the source.
        const result = await storageService.migrateToLocal({ deleteFromCloud: false })
        if (cancelled) return
        // Same local-wins dedup as the cancellation path above — the export
        // leaves a cloud copy with the SAME id as the new local copy.
        const all = await storageService.getDynasties()
        const localIds = new Set(all.filter(d => d.storageType !== 'cloud').map(d => String(d.id)))
        const deduped = all.filter(d => d.storageType !== 'cloud' || !localIds.has(String(d.id)))
        if (!cancelled) setDynasties(deduped)
        if (result?.migratedCount > 0) {
          toast.info(
            `Your free premium ended — ${result.migratedCount} cloud ${result.migratedCount === 1 ? 'dynasty' : 'dynasties'} copied to this device.`
          )
        }
        try { localStorage.setItem(guardKey, '1') } catch { /* ignore */ }
      } catch (err) {
        console.error('[DynastyContext] beta-lapse auto-export failed:', err)
        // Leave the guard unset so we retry next session.
        migratingLapseRef.current = false
      }
    })()

    return () => { cancelled = true }
  }, [user, subscription, isPremium, toast])

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
    if (!dynasty) dynasty = sharedDynasties.find(d => String(d.id) === String(dynastyId))
    if (!dynasty && String(currentDynasty?.id) === String(dynastyId)) {
      dynasty = currentDynasty
    }
    if (!dynasty) return false // unknown dynasty — let the caller decide
    // Mirror isViewOnly's cloud model: an invited editor (uid in editors[],
    // not the owner) can always write — the owner's premium pays for storage,
    // so editors need not be premium themselves. Only the owner is gated on
    // their own active premium. Without this carve-out, every invited-editor
    // save was silently blocked even though the Firestore rules allow it.
    const isInvitedEditor = !!user?.uid
      && Array.isArray(dynasty.editors)
      && dynasty.editors.includes(user.uid)
      && dynasty.userId !== user.uid
    const readOnly = dynasty.storageType === 'cloud' && !isPremium && !isInvitedEditor
    if (readOnly) {
      try {
        toast.error('This cloud dynasty is read-only without active premium. Renew premium to save changes.')
      } catch { /* toast may not be ready in early-mount paths */ }
      console.warn(`[DynastyContext] blocked ${actionLabel} on ${dynastyId} (cloud + not premium)`)
    }
    return readOnly
  }

  // Gate league-wide calendar actions (advance/revert week, advance season) to
  // the commissioner + co-commissioners in a genuinely shared dynasty. The
  // owner is always the commish, so single-player and the owner's own play are
  // never affected — this only stops a regular member from driving the calendar
  // for everyone. Returns true (and toasts) when the action should be blocked.
  const blockIfNotCommish = (dynastyId, actionLabel = 'do this') => {
    let dynasty = dynasties.find(d => String(d.id) === String(dynastyId))
    if (!dynasty) dynasty = sharedDynasties.find(d => String(d.id) === String(dynastyId))
    if (!dynasty && String(currentDynasty?.id) === String(dynastyId)) dynasty = currentDynasty
    if (!dynasty) return false
    if (dynasty.storageType !== 'cloud') return false
    const editors = Array.isArray(dynasty.editors) ? dynasty.editors : []
    if (editors.length <= 1) return false // not actually shared yet
    if (canManageMembers(dynasty, user?.uid)) return false
    try {
      toast.error(`Only the commissioner can ${actionLabel}.`)
    } catch { /* toast may not be ready */ }
    console.warn(`[DynastyContext] blocked non-commish ${actionLabel} on ${dynastyId}`)
    return true
  }

  const createDynasty = async (dynastyData, { onProgress } = {}) => {
    // A CFB27 PC save import auto-detects the dynasty's actual in-save
    // year/week/phase; prefer it so createDynasty is correct even if a caller
    // forgets to mirror it into startYear.
    const cfb27Season = dynastyData.cfb27Season || null
    const startYear = cfb27Season ? cfb27Season.year : parseInt(dynastyData.startYear)
    // Edition for this dynasty, resolved once. Gates which teams exist and
    // whether the whole-country roster + launch team-ratings seed runs (cfb27).
    const editionKey = normalizeEditionKey(dynastyData.gameEdition || DEFAULT_EDITION)

    // Progress reporter for the create UI. Yields to the event loop after each
    // update so React actually paints the new message/bar before the next
    // (often synchronous and blocking) phase runs.
    const report = async (message, pct) => {
      if (!onProgress) return
      try { onProgress({ message, pct }) } catch (_) {}
      await new Promise((r) => setTimeout(r))
    }
    await report('Setting up teams…', 4)

    // Conference data is built AFTER the teams map (abbreviations) is finalized
    // below, so it can reflect cfb27's launch abbreviations and any teambuilder
    // overrides in one place.
    let initialConferences = null

    // Initialize the teams map from the master TEAMS list
    // This is the single source of truth for all team data in this dynasty.
    // Pass the edition so edition-gated teams (e.g. CFB 27's NDSU/Sac State)
    // only appear in dynasties on that edition or later.
    const teams = initializeDynastyTeams(editionKey)

    // CFB 27: apply the launch abbreviation set, overriding each team's abbr on
    // the dynasty's own teams map. This is the SAME per-dynasty override path
    // teambuilder teams use, so getTidFromAbbr(..., dynasty) and every
    // dynasty-aware read resolve the new abbrevs. Runs BEFORE teambuilder so a
    // custom team can still replace a slot's abbr on top. NDSU/Sac State aren't
    // in the set and keep their registry abbreviations.
    if (editionKey === 'cfb27') {
      for (const [tidStr, abbr] of Object.entries(CFB27_TEAM_ABBRS)) {
        const t = teams[Number(tidStr)]
        if (t) t.abbr = abbr
      }
    }

    // If there's a teambuilder team, replace the corresponding slot
    if (dynastyData.customTeams) {
      for (const [abbr, customTeam] of Object.entries(dynastyData.customTeams)) {
        // Find the tid of the team being replaced
        const replacedTid = getTidFromAbbr(customTeam.replacesTeam)
        if (replacedTid) {
          setTeambuilderTeam(teams, replacedTid, {
            abbr: abbr,
            name: customTeam.name,
            teamName: customTeam.teamName,
            nickname: customTeam.nickname,
            logo: customTeam.logoUrl,
            primaryColor: customTeam.backgroundColor || customTeam.primaryColor,
            secondaryColor: customTeam.textColor || customTeam.secondaryColor
          })
        }
      }
    }

    // Build conference data now that the teams map (abbrevs) is final.
    // - cfb27: use the CFB 27 realignment (CFB27_CONFERENCES, tid-keyed) — the
    //   rebuilt 8-team Pac-12 etc., which differs from the base 2024-25 map.
    //   Each team is placed under its conference by its CURRENT abbr (cfb27
    //   launch abbr, or a teambuilder override that replaced the slot), feeding
    //   the byYear.conference + customConferences writer below so
    //   getTeamConference resolves correctly.
    // - other editions: unchanged teambuilder-only behavior.
    if (dynastyData.cfb27Conferences && Object.keys(dynastyData.cfb27Conferences).length > 0) {
      // A PC save import carries the dynasty's ACTUAL alignment (every team,
      // including mid-dynasty realignment), so it beats the static launch map.
      initialConferences = dynastyData.cfb27Conferences
    } else if (editionKey === 'cfb27') {
      initialConferences = {}
      for (const [tidStr, confName] of Object.entries(CFB27_CONFERENCES)) {
        const team = teams[Number(tidStr)]
        if (!team?.abbr) continue
        ;(initialConferences[confName] ||= []).push(team.abbr)
      }
    } else if (dynastyData.customTeams && Object.keys(dynastyData.customTeams).length > 0) {
      initialConferences = getConferencesWithCustomTeams(dynastyData.customTeams)
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

    // Auto-populate rosters from the bundled default rosters (src/data/
    // {cfb27Rosters|defaultRosters}/{tid}.json).
    //
    // - cfb27 + "Load all team rosters" opt-in (dynastyData.seedAllRosters):
    //   seed EVERY team in the country (full attribute-rich launch rosters).
    //   This is the slow path (~9k players) the create checkbox warns about.
    //   Custom/teambuilder slots and tids absent from the registry are skipped.
    // - Default (checkbox off, or any non-cfb27 edition): seed ONLY the user's
    //   team. Teambuilder/custom user teams have no bundled roster, so they're
    //   skipped (the user fills the roster via the Add Roster flow).
    //
    // Failure is non-fatal: a dynasty still creates with an empty roster.
    const seedAllRosters = editionKey === 'cfb27' && !!dynastyData.seedAllRosters
    let seededPlayers = []
    try {
      // A PC save import already built a full multi-team roster in
      // cfb27SaveImport.js — use it verbatim and skip the bundled seeds.
      if (Array.isArray(dynastyData.cfb27SeededPlayers) && dynastyData.cfb27SeededPlayers.length > 0) {
        await report('Importing roster from save…', 10)
        seededPlayers = dynastyData.cfb27SeededPlayers
      } else if (seedAllRosters) {
        await report('Loading all team rosters…', 10)
        seededPlayers = await buildAllDefaultRosterPlayers(teams, startYear, 1, editionKey)
      } else if (currentTid && !teams[currentTid]?.isCustom) {
        await report('Loading team roster…', 10)
        seededPlayers = await buildDefaultRosterPlayers(currentTid, startYear, 1, editionKey)
      }
    } catch (err) {
      console.warn('[createDynasty] default roster seed failed:', err)
      seededPlayers = []
    }
    if (seededPlayers.length > 0) await report(`Preparing ${seededPlayers.length.toLocaleString()} players…`, 35)

    // CFB 27: seed every team's launch OVR/Offense/Defense rating into the
    // START YEAR only. Ratings are year-keyed (teams[tid].byYear[year].
    // teamRatings), so seeding just startYear makes them display on day one and
    // naturally clear when the season advances (the next year has no entry) —
    // no special wipe logic needed. We write BOTH the tid-based byYear store
    // (Dashboard / game entry read this) and the legacy teamRatingsByTeamYear
    // store (the TeamYear page reads this), mirroring saveTeamRatings exactly.
    // Custom/teambuilder slots and tids absent from this dynasty are skipped.
    let seededTeamRatingsByTeamYear = null
    let userSeededRatings = null
    if (editionKey === 'cfb27') {
      seededTeamRatingsByTeamYear = {}
      for (const [tidStr, r] of Object.entries(CFB27_TEAM_RATINGS)) {
        const tid = Number(tidStr)
        const team = teams[tid]
        if (!team || team.isCustom) continue
        const ratings = { overall: r.ovr, offense: r.off, defense: r.def }
        const existingByYear = team.byYear || {}
        const existingYearData = existingByYear[startYear] || {}
        teams[tid] = {
          ...team,
          byYear: {
            ...existingByYear,
            [startYear]: {
              ...existingYearData,
              teamRatings: ratings,
              preseasonSetup: { ...(existingYearData.preseasonSetup || {}), teamRatingsEntered: true },
            },
          },
        }
        // Legacy dual-keyed (abbr + tid) store, drift-safe like saveTeamRatings.
        if (team.abbr) seededTeamRatingsByTeamYear[team.abbr] = { [startYear]: ratings }
        seededTeamRatingsByTeamYear[tid] = { [startYear]: ratings }
        if (currentTid && tid === Number(currentTid)) userSeededRatings = ratings
      }
    }

    // Did the USER's own team get a seeded roster? With the cfb27 whole-country
    // seed, seededPlayers can be non-empty even when the user picked a custom
    // team that got nothing — so the "roster entered" checklist flags must key
    // off the user's team specifically, not the total seeded count.
    const userTeamSeeded = currentTid != null && seededPlayers.some((p) => Number(p.team) === Number(currentTid))

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
    // `cfb27SeededPlayers` was already consumed into `seededPlayers`/`players`
    // above — it must NOT also ride along as a duplicate top-level field
    // (that's the entire multi-team roster a second time, which would blow
    // past Firestore's 1MB main-doc limit that _subcollectionsMigrated exists
    // to avoid).
    const {
      customTeams: _droppedCustomTeams,
      coachName: _droppedCoachName,
      seedAllRosters: _droppedSeedAllRosters,
      cfb27SeededPlayers: _droppedCfb27SeededPlayers,
      cfb27Season: _droppedCfb27Season,
      cfb27Conferences: _droppedCfb27Conferences,
      cfb27TeamRatings: _droppedCfb27TeamRatings,
      cfb27CoachingStaff: _droppedCfb27CoachingStaff,
      cfb27Schedule: _droppedCfb27Schedule,
      cfb27PreseasonTop25: _droppedCfb27PreseasonTop25,
      ...dynastyDataNoCustomTeams
    } = dynastyData

    // Seed the owner's head coach as a first-class coach entity
    // (controlledBy = their uid). This is the new source of truth for the
    // coaching career; the uid-keyed memberTeams/memberTeamHistory seeds
    // below stay as the derived security index + legacy fallback.
    const ownerCoach = (user?.uid && currentTid)
      ? makeCoach({
          name: dynastyData.coachName?.trim() || '',
          year: startYear,
          teamTid: Number(currentTid),
          role: coachPosition || 'HC',
          controlledBy: user.uid,
        })
      : null

    // A CFB27 save import's schedule needs to go through the SAME
    // diff/apply pipeline the manual "Enter Schedule" flow uses
    // (computeScheduleDiff -> applyScheduleDiff, wrapped here by
    // createGamesFromSchedule) — the Schedule tab's game list reads
    // dynasty.games[], not the raw opponent-list array, and hand-rolling
    // that game-record shape here would drift from what the real save
    // path produces. Games array stub is empty since this is a brand-new
    // dynasty — every entry is a pure "toAdd".
    const cfb27ScheduleResult = (dynastyData.cfb27Schedule?.length && currentTid)
      ? createGamesFromSchedule({ games: [], teams }, dynastyData.cfb27Schedule, currentTid, startYear)
      : null

    const newDynastyData = {
      ...dynastyDataNoCustomTeams,
      // Which game edition this dynasty tracks (CFB 26 vs 27). The form
      // passes a choice; fall back to DEFAULT_EDITION and normalize so a
      // bad/absent value can never become an unknown key. Untagged legacy
      // dynasties never reach here — they resolve to cfb26 via getEditionKey.
      gameEdition: normalizeEditionKey(dynastyData.gameEdition || DEFAULT_EDITION),
      currentTid, // Primary team identifier (tid) - kept for backwards compatibility
      currentYear: startYear,
      currentWeek: cfb27Season ? cfb27Season.week : 0,
      currentPhase: cfb27Season ? cfb27Season.phase : 'preseason',
      seasons: [],
      games: cfb27ScheduleResult?.newGames || [],
      players: [],
      recruits: [],
      schedule: cfb27ScheduleResult?.updatedSchedule || [],
      rankings: [],
      rivalries: [],
      nextPID: seededPlayers.length + 1, // Initialize player ID counter (continues past any auto-seeded roster)
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
      // First-class coach entity for the owner + skip the load-migration
      // (this save is born already in the new model).
      ...(ownerCoach ? {
        coaches: { [ownerCoach.cid]: ownerCoach },
        _coachesControlMigrated: true,
      } : {}),
      preseasonSetup: {
        scheduleEntered: Boolean(dynastyData.cfb27Schedule?.length),
        rosterEntered: userTeamSeeded || seededPlayers.length > 0, // auto-seeded roster counts as entered
        teamRatingsEntered: Boolean(dynastyData.cfb27TeamRatings) || !!userSeededRatings,
        coachingStaffEntered: Boolean(dynastyData.cfb27CoachingStaff),
        conferencesEntered: Boolean(initialConferences)  // Shows as incomplete, but defaults are valid if user skips
      },
      // Legacy per-team/year ratings store (read by the TeamYear page). Seeded
      // for every team on cfb27 so historical/other-team views show launch OVRs.
      ...(seededTeamRatingsByTeamYear ? { teamRatingsByTeamYear: seededTeamRatingsByTeamYear } : {}),
      // Live current-season cache: a save import's ratings win, then our
      // seeded launch ratings, then the empty default.
      teamRatings: dynastyData.cfb27TeamRatings || userSeededRatings || {
        overall: null,
        offense: null,
        defense: null
      },
      // CFB 27: pre-fill the user team's Dynasty Points budget (the first
      // preseason to-do) with that team's launch NIL budget. dynastyPoints is
      // per-team, keyed by tid then String(year) (see dynastyPointsModel).
      ...(editionKey === 'cfb27' && currentTid != null && CFB27_NIL_BUDGETS[currentTid] != null
        ? { dynastyPoints: { byTeam: { [String(currentTid)]: { byYear: { [String(startYear)]: { budget: CFB27_NIL_BUDGETS[currentTid] } } } } } }
        : {}),
      coachingStaff: dynastyData.cfb27CoachingStaff || {
        hcName: null,
        ocName: null,
        dcName: null
      },
      // Preseason Top 25 — same field PreseasonTop25Modal writes to
      // (dynasty.preseasonRankingsByYear[year] = [{ rank, team, tid }]).
      ...(dynastyData.cfb27PreseasonTop25?.length ? {
        preseasonRankingsByYear: { [startYear]: dynastyData.cfb27PreseasonTop25 },
      } : {}),
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

    // When we auto-seeded the roster, also flip the tid-based byYear
    // rosterEntered flag (the source the team page's preseason checklist
    // reads) so the "enter your roster" step shows complete from day one.
    // A CFB27 save import also fills team ratings, coaching staff, and
    // schedule — flip their byYear flags too, or the top-level fields set
    // above get shadowed once rosterEntered forces the byYear object to exist.
    if (currentTid && (userTeamSeeded || seededPlayers.length > 0 || dynastyData.cfb27TeamRatings || dynastyData.cfb27CoachingStaff || cfb27ScheduleResult)) {
      const t = newDynastyData.teams?.[currentTid] || {}
      const by = t.byYear || {}
      const yd = by[startYear] || {}
      newDynastyData.teams = {
        ...newDynastyData.teams,
        [currentTid]: {
          ...t,
          byYear: {
            ...by,
            [startYear]: {
              ...yd,
              ...(dynastyData.cfb27TeamRatings ? { teamRatings: dynastyData.cfb27TeamRatings } : {}),
              ...(dynastyData.cfb27CoachingStaff ? { coachingStaff: dynastyData.cfb27CoachingStaff } : {}),
              // getScheduleForTeam reads ONLY this byYear.schedule (no
              // fallback to the top-level dynasty.schedule field at all,
              // unlike teamRatings/preseasonSetup) — this is the one and
              // only place the imported schedule actually needs to land.
              // Use the diff-processed updatedSchedule (gameId/opponentTid/
              // isBye filled in), not the raw cfb27Schedule rows, so it
              // matches what the manual Enter Schedule flow itself stores.
              ...(cfb27ScheduleResult ? { schedule: cfb27ScheduleResult.updatedSchedule } : {}),
              preseasonSetup: {
                ...(yd.preseasonSetup || {}),
                ...(seededPlayers.length > 0 ? { rosterEntered: true } : {}),
                ...(dynastyData.cfb27TeamRatings ? { teamRatingsEntered: true } : {}),
                ...(dynastyData.cfb27CoachingStaff ? { coachingStaffEntered: true } : {}),
                ...(cfb27ScheduleResult ? { scheduleEntered: true } : {}),
                ...(initialConferences ? { conferencesEntered: true } : {}),
              },
            },
          },
        },
      }
    }

    // Preseason Top 25: preseasonRankingsByYear (set above) only drives the
    // Dashboard checklist/AI recap — the actual Rankings page reads
    // teams[tid].byYear[year].rankByWeek[0] exclusively (see
    // PreseasonTop25Modal's persistEntries, which writes both). Spans every
    // ranked team, not just the user's — unlike ratings/staff/schedule.
    if (dynastyData.cfb27PreseasonTop25?.length) {
      const updatedTeams = { ...newDynastyData.teams }
      for (const entry of dynastyData.cfb27PreseasonTop25) {
        if (entry.tid == null) continue
        const tidKey = String(entry.tid)
        const t = updatedTeams[tidKey] || updatedTeams[entry.tid] || {}
        const by = t.byYear || {}
        const yd = by[startYear] || {}
        updatedTeams[tidKey] = {
          ...t,
          byYear: {
            ...by,
            [startYear]: {
              ...yd,
              rankByWeek: { ...(yd.rankByWeek || {}), 0: entry.rank },
            },
          },
        }
      }
      newDynastyData.teams = updatedTeams
    }

    // Note: Google Sheet is created lazily when user opens Schedule Entry modal
    // This avoids creating sheets that may never be used

    // Route to correct storage backend based on dynasty's storageType
    if (finalStorageType === 'local' || !user) {
      // Local storage: use IndexedDB
      const newDynasty = {
        id: Date.now().toString(),
        ...newDynastyData,
        // The creator is the OWNER (commish), free tier included. Cloud
        // dynasties get this from createDynastyInFirestore; local ones must
        // set it here or the creator would render as a plain member.
        userId: user?.uid ?? newDynastyData.userId ?? null,
        players: seededPlayers, // local dynasties read players inline from the IndexedDB doc
        createdAt: new Date().toISOString(),
        lastModified: Date.now()
      }

      // Immediately save to IndexedDB before updating state
      // IMPORTANT: Only save local dynasties to IndexedDB (filter out cloud ones)
      const existingLocalDynasties = dynasties.filter(d => d.storageType !== 'cloud')
      const updatedLocalDynasties = [...existingLocalDynasties, newDynasty]
      if (seededPlayers.length > 0) await report(`Saving ${seededPlayers.length.toLocaleString()} players…`, 55)
      await indexedDBStorage.saveDynasties(updatedLocalDynasties)
      await report('Finalizing…', 98)

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
      // Cloud dynasties read players from the players subcollection (the main
      // doc's 1 MB cap is exactly why _subcollectionsMigrated is set), so the
      // seeded roster must be written there — NOT inline in the doc, where it
      // would be ignored on the next load. The collection is brand-new and
      // empty, so this is a pure insert.
      if (seededPlayers.length > 0) {
        try {
          await report(`Saving ${seededPlayers.length.toLocaleString()} players…`, 40)
          // Whole-league CFB27 imports (thousands of players) go through the
          // Admin-SDK bulk writer — the client subcollection path batches via
          // Firestore's offline-write queue, which a full-league import blows
          // past ("Write stream exhausted"). See cfb27-bulk-seed-players.js.
          if (Array.isArray(dynastyData.cfb27SeededPlayers) && dynastyData.cfb27SeededPlayers.length > 0) {
            await bulkSeedPlayers(newDynasty.id, seededPlayers)
          } else {
            // Brand-new empty collection, so this is a pure insert.
            // Per-batch progress maps into the 40-95% band of the create bar.
            await savePlayersToSubcollection(newDynasty.id, seededPlayers, {
              forceOverwrite: true,
              onProgress: ({ saved, total }) => {
                const pct = 40 + Math.round((saved / Math.max(total, 1)) * 55)
                try { onProgress?.({ message: `Saving players… ${saved.toLocaleString()} / ${total.toLocaleString()}`, pct }) } catch (_) {}
              },
            })
          }
        } catch (err) {
          // Do NOT swallow this: the main doc already exists with players:[]
          // and _subcollectionsMigrated, so proceeding would show the seeded
          // roster from memory while the SERVER has none — on the next reload
          // (or any other device) the entire roster silently vanishes. Tear
          // down the half-created doc and fail the create loudly so the user
          // simply retries.
          console.error('[createDynasty] failed to seed players subcollection:', err)
          try { await deleteDynastyWithSubcollections(newDynasty.id) } catch (_) { /* orphan; harmless */ }
          throw new Error(`Could not save the roster to the cloud (${err?.message || 'network error'}). Nothing was created — please try again.`)
        }
      }
      await report('Finalizing…', 98)
      // Mark local state as migrated too; carry the seeded roster so the UI
      // shows it immediately without waiting for a subcollection re-read.
      const dynastyWithFlag = { ...newDynasty, _subcollectionsMigrated: true, players: seededPlayers }
      // CRITICAL: Update both dynasties array AND currentDynasty
      // Without this, updateDynasty can't find the dynasty and routes players incorrectly
      //
      // Dedupe by id: the onSnapshot listener can fire (and full-replace the
      // array with the server list, already including this new doc) during the
      // awaited savePlayersToSubcollection above. A blind append would then add
      // a second copy with the same id — two identical cards on the home page
      // and a React duplicate-key warning. Replace-or-append keeps it idempotent.
      setDynasties(prev => [
        ...prev.filter(d => String(d.id) !== String(dynastyWithFlag.id)),
        dynastyWithFlag,
      ])
      setCurrentDynasty(dynastyWithFlag)
      return dynastyWithFlag
    } catch (error) {
      console.error('Error creating dynasty:', error)
      throw error
    }
  }

  // Games the save shows as played (GameStatus !== 'Unplayed') for the
  // user's own team overwrite that week's score unconditionally — "save
  // always wins" applies even if the tracker already had a (possibly
  // corrected) score there. Matches save home/away onto the tracker's
  // team1/team2 slots by tid rather than assuming they line up positionally.
  // Also attaches the full box score (team + player stat lines) for that
  // week when buildBoxScoresForUserGames produced one — same "save wins"
  // rule, so a manually-entered box score gets overwritten by the save's.
  function applyCfb27GameScores(games, scoreEntries, boxScoresByWeek, year) {
    const byWeek = new Map(scoreEntries.map((e) => [e.week, e]))
    return (games || []).map((g) => {
      if (Number(g.year) !== year || g.gameType !== 'regular') return g
      const entry = byWeek.get(g.week)
      if (!entry) return g
      if (g.team1Tid !== entry.homeTid && g.team1Tid !== entry.awayTid) return g
      if (g.team2Tid !== entry.homeTid && g.team2Tid !== entry.awayTid) return g
      const team1IsHome = g.team1Tid === entry.homeTid
      const team1Score = team1IsHome ? entry.homeScore : entry.awayScore
      const team2Score = team1IsHome ? entry.awayScore : entry.homeScore
      const team1Quarters = team1IsHome ? entry.homeQuarters : entry.awayQuarters
      const team2Quarters = team1IsHome ? entry.awayQuarters : entry.homeQuarters
      const team1OT = team1IsHome ? entry.homeOT : entry.awayOT
      const team2OT = team1IsHome ? entry.awayOT : entry.homeOT
      const box = boxScoresByWeek?.[entry.week]
      return {
        ...g,
        team1Score,
        team2Score,
        isPlayed: true,
        quarters: {
          team1: { Q1: team1Quarters[0], Q2: team1Quarters[1], Q3: team1Quarters[2], Q4: team1Quarters[3] },
          team2: { Q1: team2Quarters[0], Q2: team2Quarters[1], Q3: team2Quarters[2], Q4: team2Quarters[3] },
        },
        // GameEdit.jsx's overtimes is a per-period ARRAY ({team1,team2} each)
        // to support multiple OTs — the save only ever gives one combined OT
        // total, so this only ever produces a single-element array (or none).
        ...(team1OT || team2OT ? { overtimes: [{ team1: team1OT, team2: team2OT }] } : {}),
        ...(box ? { boxScore: { byTid: box.byTid, teamStatsByTid: box.teamStatsByTid } } : {}),
      }
    })
  }

  /**
   * Sync an ALREADY-TRACKED dynasty against a newer CFB27 save snapshot —
   * the existing-dynasty counterpart to createDynasty's CFB27 import path.
   * See src/data/cfb27SaveSync.js for the reconciliation design (save always
   * wins; matches players by cfb27AssetName, falling back to name+team for
   * players synced before that field existed).
   *
   * @param {string} dynastyId
   * @param {object} parsed - the raw result from api/cfb27-save-parse.js (same shape createDynasty's CFB27 import consumes)
   * @returns {Promise<{summary: object, unresolvedTeamNames: string[]}>}
   */
  // Walks (week, phase) forward using the SAME transition rules advanceWeek
  // uses (DynastyContext.jsx's advanceWeek, ~line 11022) — but as a pure
  // computation, not by invoking that function repeatedly. advanceWeek reads
  // dynasty state via closures over this component's currentDynasty/
  // dynasties — calling it N times in a tight loop from another async
  // function does NOT see its own prior writes (each call still closes over
  // the SAME pre-loop state), so it can never walk forward more than one
  // step no matter how many times it's awaited. Recomputing the transition
  // rules directly on data already fetched fresh avoids that trap entirely.
  // Deliberately stops at 'offseason': crossing into the next year's
  // preseason needs per-player class/redshirt confirmations (see
  // advanceWeek's `classConfirmations` param) only the user can make — this
  // does not attempt to guess those.
  function computeCfb27SyncSeasonAdvance(startWeek, startPhase, targetYear, targetPhase, targetWeek, currentYear) {
    const phaseOrder = ['preseason', 'regular_season', 'conference_championship', 'postseason', 'offseason']
    let week = Number(startWeek)
    let phase = startPhase
    let reachedTarget = false
    let stoppedAtOffseason = false

    if (Number(currentYear) !== Number(targetYear)) {
      // A year boundary is exactly the offseason->preseason transition this
      // is deliberately not automating — leave it for the user.
      return { week, phase, reachedTarget: false, stoppedAtOffseason: false }
    }

    let iterations = 0
    while (iterations < 60) {
      if (phase === targetPhase && week === Number(targetWeek)) { reachedTarget = true; break }
      const phaseIdx = phaseOrder.indexOf(phase)
      const targetIdx = phaseOrder.indexOf(targetPhase)
      if (phaseIdx > targetIdx) break // already past what the save reports — don't walk backwards
      if (phase === targetPhase && week > Number(targetWeek)) {
        // Already in the target phase but ahead of the fresh target week —
        // can only happen if the previously-stored week was wrong (e.g. a
        // since-fixed week-mapping bug). Counting up from here would just
        // overshoot past this phase entirely and miss the target, so trust
        // the save's own (authoritative) week label instead.
        week = Number(targetWeek)
        reachedTarget = true
        break
      }
      if (phase === 'offseason') { stoppedAtOffseason = true; break }

      let nextWeek = week + 1
      let nextPhase = phase
      // Mirrors advanceWeek's own phase-transition conditions exactly
      // (DynastyContext.jsx ~11059-11198) — kept in sync manually since
      // duplicating the transition RULES (not the side effects) is the
      // deliberate tradeoff here.
      if (phase === 'preseason' && nextWeek >= 1) {
        nextPhase = 'regular_season'; nextWeek = 0
      } else if (phase === 'regular_season' && nextWeek > 15) {
        nextPhase = 'conference_championship'; nextWeek = 1
      } else if (phase === 'conference_championship' && nextWeek > 1) {
        nextPhase = 'postseason'; nextWeek = 1
      } else if (phase === 'postseason' && nextWeek > 5) {
        nextPhase = 'offseason'; nextWeek = 1
      }

      if (nextPhase === 'offseason' && phase !== 'offseason') { stoppedAtOffseason = true; break }

      week = nextWeek
      phase = nextPhase
      iterations += 1
    }

    return { week, phase, reachedTarget, stoppedAtOffseason }
  }

  const syncDynastyFromCFB27Save = async (dynastyId, parsed, { onProgress } = {}) => {
    if (blockIfReadOnly(dynastyId, 'sync CFB27 save')) return

    // A full whole-league sync runs several heavy, fully-synchronous phases
    // (buildSyncPlan, the box-score/conference-game merges, stats recalc)
    // with no internal await, so the UI would otherwise never repaint an
    // intermediate percentage — report() yields a tick after every call so
    // React can actually paint before the next blocking phase runs. Same
    // pattern as createDynasty's own report() helper.
    const startedAt = Date.now()
    const report = async (message, pct) => {
      if (!onProgress) return
      const elapsedMs = Date.now() - startedAt
      const etaSeconds = pct > 0 && pct < 100 ? Math.round((elapsedMs / pct) * (100 - pct) / 1000) : null
      try { onProgress({ message, pct, etaSeconds }) } catch (_) {}
      await new Promise((r) => setTimeout(r))
    }

    const dynasty = await findDynastyById(dynastyId)
    if (!dynasty) {
      console.error('Dynasty not found:', dynastyId)
      return
    }
    await report('Loading dynasty…', 5)

    // CRITICAL: dynasty.players/.games (from findDynastyById, a plain state
    // lookup) are NOT guaranteed to hold the full, current subcollection
    // contents for a cloud dynasty — only getDynastyPlayers/getDynastyGames
    // fetch that live. Diffing against a stale/partial base here and then
    // writing the result with deleteOrphans:true (which updateDynasty's
    // games path always does) would silently delete real games/players that
    // just weren't loaded into state yet at the moment of the sync.
    const freshPlayers = await getDynastyPlayers(dynasty)
    const freshGames = await getDynastyGames(dynasty)
    const dynastyForPlan = { ...dynasty, players: freshPlayers, games: freshGames }
    await report('Loading current roster & games…', 12)

    await report('Comparing against your save…', 15)
    const plan = buildSyncPlan(dynastyForPlan, parsed)
    await report('Merging schedule & scores…', 45)

    // An empty scheduleForUserTeam means the save just doesn't have this
    // year's schedule generated yet (e.g. synced at Preseason Wk 0, before
    // the game itself has assigned matchups) — NOT that the user's real
    // games should be deleted. computeScheduleDiff has no way to tell the
    // difference between "the save's schedule is genuinely empty this year"
    // and "nothing to compare yet", and marks every existing game toRemove
    // when newSchedule has zero entries (nothing in it to "still
    // reference"). Skipping the diff/merge entirely when there's nothing to
    // sync preserves whatever real games+denormalized schedule already
    // exist, instead of wiping a full season down to "NO SCHEDULE" the
    // moment a sync happens to catch the save mid-generation.
    let mergedGames = freshGames
    let scheduleDiff = { updatedSchedule: [] }
    if (plan.scheduleForUserTeam?.length) {
      scheduleDiff = computeScheduleDiff(dynastyForPlan, plan.scheduleForUserTeam, dynasty.currentTid, dynasty.currentYear)
      mergedGames = applyScheduleDiff(freshGames, scheduleDiff)
    }
    mergedGames = applyCfb27GameScores(mergedGames, plan.gameScoresForUserTeam, plan.boxScoresByWeek, Number(dynasty.currentYear))

    // Denormalized schedule copy — getCurrentSchedule (and the Dashboard's
    // own "Schedule" panel) reads teams[tid].byYear[year].schedule directly,
    // NOT dynasty.games. CreateDynasty.jsx seeds this once at dynasty
    // creation, but no ongoing sync step ever refreshed it afterward —
    // scheduleDiff.updatedSchedule (already computed above, just for the
    // games-array diff) was silently discarded every sync. Left permanently
    // stale after the very first sync, and empty for any year whose
    // byYear[year] entry gets cleared for any reason (e.g. Danger Zone's
    // Reset CFB27 Sync Data), with no way to rebuild it short of recreating
    // the dynasty — this keeps it current on every sync going forward.
    if (dynasty.currentTid != null && scheduleDiff.updatedSchedule?.length) {
      const teamsBase = plan.mergedTeams || dynasty.teams || {}
      const tidKey = String(dynasty.currentTid)
      const userTeam = teamsBase[tidKey]
      if (userTeam) {
        const yearData = userTeam.byYear?.[dynasty.currentYear] || {}
        plan.mergedTeams = {
          ...teamsBase,
          [tidKey]: {
            ...userTeam,
            byYear: { ...userTeam.byYear, [dynasty.currentYear]: { ...yearData, schedule: scheduleDiff.updatedSchedule } },
          },
        }
      }
    }

    // Every OTHER team's games (whole-league) — plan.cpuGamesToWrite is
    // already minimal-diff (only games that actually changed since last
    // sync), so this upsert is cheap even though it covers the whole
    // league: a routine week adds ~60-70 records, not all 891 at once.
    if (plan.cpuGamesToWrite?.length) {
      const byId = new Map(mergedGames.map((g) => [g.id, g]))
      for (const cpuGame of plan.cpuGamesToWrite) byId.set(cpuGame.id, cpuGame)
      mergedGames = [...byId.values()]
    }

    // Prune stale CPU games the current save no longer agrees with — see
    // buildWholeLeagueGames' cpuGamesToDelete comment. Without this, a
    // record written by an earlier/incomplete sync (a phantom bye-week
    // opponent, a stale duplicate at the wrong week, etc.) could survive
    // forever since the upsert above only ever adds/updates by id, never
    // removes.
    if (plan.cpuGamesToDelete?.length) {
      const deleteIds = new Set(plan.cpuGamesToDelete)
      mergedGames = mergedGames.filter((g) => !deleteIds.has(g.id))
    }

    // Bowl + full CFP bracket results, every team including the user's own —
    // plan.postseasonGamesToWrite is already minimal-diff/upsert-by-id
    // (buildPostseasonGames matches an existing manually-entered bowl/CFP
    // record where possible so it gets corrected by the real save data
    // instead of duplicated).
    if (plan.postseasonGamesToWrite?.length) {
      const byId = new Map(mergedGames.map((g) => [g.id, g]))
      for (const postseasonGame of plan.postseasonGamesToWrite) byId.set(postseasonGame.id, postseasonGame)
      mergedGames = [...byId.values()]
    }

    // isConferenceGame is normally computed by GameEntryModal.jsx at the
    // moment a human enters a score — CFB27 sync writes scores directly
    // (applyCfb27GameScores / plan.cpuGamesToWrite) and never went through
    // that form, so every synced game came in with isConferenceGame simply
    // undefined. getTeamRecord/calculateTeamRecordFromGames gate confWins/
    // confLosses on this exact flag, so every team's conference record
    // silently stayed 0-0 forever regardless of a correct overall record —
    // reported on the Conf. Standings page (every conference showing
    // (0-0)). Recomputed for every regular-season game this year on every
    // sync (not just newly-touched ones) so this also self-heals games
    // synced before this fix landed, not just future ones.
    const customConferencesForSync = getCustomConferencesForYear(dynastyForPlan, dynasty.currentYear)
    const teamsForConf = plan.mergedTeams || dynasty.teams
    mergedGames = mergedGames.map((g) => {
      if (Number(g.year) !== Number(dynasty.currentYear) || (g.gameType || 'regular') !== 'regular') return g
      if (g.team1Tid == null || g.team2Tid == null) return g
      const abbr1 = getAbbrFromTid(teamsForConf, g.team1Tid)
      const abbr2 = getAbbrFromTid(teamsForConf, g.team2Tid)
      const conf1 = abbr1 ? getTeamConference(abbr1, customConferencesForSync) : null
      const conf2 = abbr2 ? getTeamConference(abbr2, customConferencesForSync) : null
      const isConferenceGame = !!(conf1 && conf2 && conf1 === conf2)
      if (Boolean(g.isConferenceGame) === isConferenceGame) return g
      return { ...g, isConferenceGame }
    })
    await report('Applying game results…', 55)

    // Auto-advance currentWeek/currentPhase to match the save's own season
    // state — computed here (pure function, not by invoking advanceWeek)
    // and folded into the SAME write below, so the header/checklist agree
    // with the data just written in this same call rather than needing a
    // separate "Advance Week" click.
    let reachedTargetSeason = false
    let stoppedAtOffseason = false
    let seasonFieldUpdates = {}
    if (plan.seasonInfo) {
      const advance = computeCfb27SyncSeasonAdvance(
        dynasty.currentWeek, dynasty.currentPhase,
        plan.seasonInfo.year, plan.seasonInfo.phase, plan.seasonInfo.week,
        dynasty.currentYear
      )
      reachedTargetSeason = advance.reachedTarget
      stoppedAtOffseason = advance.stoppedAtOffseason
      if (advance.week !== Number(dynasty.currentWeek) || advance.phase !== dynasty.currentPhase) {
        seasonFieldUpdates = { currentWeek: advance.week, currentPhase: advance.phase }
      }
    }

    // Whole-league in-game depth chart order -> dynasty.teamFuture[tid].order
    // (SchemeBuilder.jsx's persisted STACK order within each position's
    // default slot column — save always wins, same as everything else this
    // sync touches, but merged key-by-key so it never wipes a scheme/package/
    // note the user already set up in Scheme Builder for that team, or an
    // order the user set for a slot this sync didn't touch, e.g. WR2/SLWR).
    let teamFutureUpdate = {}
    if (plan.depthChartUpdates && Object.keys(plan.depthChartUpdates).length) {
      const existingTeamFuture = dynasty.teamFuture || {}
      const nextTeamFuture = { ...existingTeamFuture }
      for (const [tid, { order, placements }] of Object.entries(plan.depthChartUpdates)) {
        const existingForTid = nextTeamFuture[tid] || {}
        nextTeamFuture[tid] = {
          ...existingForTid,
          order: { ...(existingForTid.order || {}), ...order },
          // Explicit column placement, not just stack order — see
          // mapDepthCharts' header comment: a player's roster position tag
          // (e.g. RT) doesn't always match the column they're actually
          // starting in per the save (e.g. LT), and auto-seed-by-position
          // only ever seeds a player into the column matching their tag.
          placements: { ...(existingForTid.placements || {}), ...placements },
        }
      }
      teamFutureUpdate = { teamFuture: nextTeamFuture }
    }

    // Whole-league weekly Players of the Week / Heisman Watch — merged
    // key-by-week, same "never wipe a week this sync didn't touch" rule as
    // rankByWeek above, so a season's worth of syncs builds a full history.
    let playersOfWeekUpdate = {}
    if (plan.playersOfWeekUpdate && Object.keys(plan.playersOfWeekUpdate).length) {
      const existingByYear = dynasty.playersOfWeekByYear || {}
      const existingForYear = existingByYear[dynasty.currentYear] || {}
      playersOfWeekUpdate = {
        playersOfWeekByYear: {
          ...existingByYear,
          [dynasty.currentYear]: { ...existingForYear, ...plan.playersOfWeekUpdate },
        },
      }
    }
    let heismanWatchUpdate = {}
    if (plan.heismanWatchUpdate && Object.keys(plan.heismanWatchUpdate).length) {
      const existingByYear = dynasty.heismanWatchByYear || {}
      const existingForYear = existingByYear[dynasty.currentYear] || {}
      heismanWatchUpdate = {
        heismanWatchByYear: {
          ...existingByYear,
          [dynasty.currentYear]: { ...existingForYear, ...plan.heismanWatchUpdate },
        },
      }
    }

    // Rivalries — auto-seed/gap-fill dynasty.rivalries[] with the user's own
    // team's real rivals. plan.rivalriesToAdd/rivalriesToPatch already never
    // touch trophyName/trophyDescription/trophyImageUrl/description (the
    // user's own creative system) or an already-set name/formedYear.
    let rivalriesUpdate = {}
    if (plan.rivalriesToAdd?.length || plan.rivalriesToPatch?.length) {
      const existingRivalries = dynasty.rivalries || []
      const patchById = new Map((plan.rivalriesToPatch || []).map((r) => [r.id, r.patch]))
      const patched = existingRivalries.map((r) => (patchById.has(r.id) ? { ...r, ...patchById.get(r.id) } : r))
      rivalriesUpdate = { rivalries: [...patched, ...(plan.rivalriesToAdd || [])] }
    }

    // NFL Draft Results — mirrors handleDraftResultsSave's (Dashboard.jsx)
    // exact write targets so the manual Google-Sheet flow and this sync
    // stay fully interchangeable: draftResultsByTeamYear (both abbr and tid
    // keys) and teams[tid].byYear[year].draftResults. The per-player
    // draftYear/draftRound/movementByYear fields are already applied via
    // the normal departurePatches path above (reconcilePlayers' patch).
    let draftResultsUpdate = {}
    if (plan.draftResultsUpdate && Object.keys(plan.draftResultsUpdate).length) {
      const existingByTeamYear = dynasty.draftResultsByTeamYear || {}
      const nextByTeamYear = { ...existingByTeamYear }
      for (const [tid, results] of Object.entries(plan.draftResultsUpdate)) {
        const teamAbbr = getAbbrFromTid(plan.mergedTeams || dynasty.teams, Number(tid))
        nextByTeamYear[tid] = { ...(nextByTeamYear[tid] || {}), [dynasty.currentYear]: results }
        if (teamAbbr) nextByTeamYear[teamAbbr] = { ...(nextByTeamYear[teamAbbr] || {}), [dynasty.currentYear]: results }
      }
      draftResultsUpdate = { draftResultsByTeamYear: nextByTeamYear }

      // Also fold into teams[tid].byYear[year].draftResults — mirrors
      // handleDraftResultsSave's dual write exactly.
      const teamsBase = draftResultsUpdate.teams || plan.mergedTeams
      const teamsWithDraftResults = { ...teamsBase }
      for (const [tid, results] of Object.entries(plan.draftResultsUpdate)) {
        const tidKey = String(tid)
        const team = teamsWithDraftResults[tidKey]
        if (!team) continue
        const yearData = team.byYear?.[dynasty.currentYear] || {}
        teamsWithDraftResults[tidKey] = {
          ...team,
          byYear: { ...team.byYear, [dynasty.currentYear]: { ...yearData, draftResults: results } },
        }
      }
      plan.mergedTeams = teamsWithDraftResults
    }

    // Real CFP seed list + bowl-host config — mirrors CFPSeedsModal's exact
    // save shape (cfpSeedsByYear/cfpSeedsByYearTid/cfpBowlConfigByYear) so
    // this sync and manual entry stay fully interchangeable. plan.cfpSeeds
    // Update is null until the bracket is actually locked in the save (see
    // deriveCFPSeeds in cfb27SaveSync.js), in which case nothing here is
    // touched and any existing manually-entered seeds stay exactly as they
    // are — this only ever writes once it has real, verified data.
    let cfpSeedsUpdate = {}
    if (plan.cfpSeedsUpdate) {
      const { seeds, bowlConfig } = plan.cfpSeedsUpdate
      const year = dynasty.currentYear
      const seedsWithTid = {}
      for (const s of seeds) seedsWithTid[s.seed] = s.tid
      cfpSeedsUpdate = {
        cfpSeedsByYear: { ...(dynasty.cfpSeedsByYear || {}), [year]: seeds },
        cfpSeedsByYearTid: { ...(dynasty.cfpSeedsByYearTid || {}), [year]: seedsWithTid },
        ...(Object.keys(bowlConfig).length
          ? { cfpBowlConfigByYear: { ...(dynasty.cfpBowlConfigByYear || {}), [year]: { ...(dynasty.cfpBowlConfigByYear?.[year] || {}), ...bowlConfig } } }
          : {}),
      }
    }

    // Season-end honors — National All-Americans, All-Conference teams, and
    // named individual awards. plan.allAmericansUpdate/awardsUpdate are null
    // (untouched) until the save actually has real honorees this year, so a
    // mid-season sync never wipes what's already there. Awards merge KEY BY
    // KEY (not a full-object overwrite) so a manually-entered award this
    // sync has no verified data for (e.g. a coach award) is never clobbered.
    let honorsUpdate = {}
    if (plan.allAmericansUpdate) {
      const year = dynasty.currentYear
      const existingByYear = dynasty.allAmericansByYear || {}
      const existingYearData = existingByYear[year] || {}
      honorsUpdate.allAmericansByYear = {
        ...existingByYear,
        [year]: { ...existingYearData, ...plan.allAmericansUpdate },
      }
    }
    if (plan.awardsUpdate) {
      const year = dynasty.currentYear
      const existingByYear = dynasty.awardsByYear || {}
      const existingYearData = existingByYear[year] || {}
      honorsUpdate.awardsByYear = {
        ...existingByYear,
        [year]: { ...existingYearData, ...plan.awardsUpdate },
      }
    }
    // Record book (Career/Game/Season x National/Conference) — NOT
    // year-keyed, unlike allAmericansByYear/awardsByYear above. This always
    // reflects the save's CURRENT record-book state (same as the in-game
    // screen, which shows current records, not history), so it's a plain
    // overwrite rather than a per-year merge. Team-scoped records already
    // rode along on plan.mergedTeams (each team's byYear.statRecords).
    if (plan.leagueStatRecordsUpdate) {
      honorsUpdate.leagueStatRecords = plan.leagueStatRecordsUpdate
    }

    // User job-change detection — plan.userJobChange is only set when
    // Coach.IsUserControlled's real team/position in the save disagrees with
    // what this dynasty has tracked (see cfb27SaveSync.js). Mirrors
    // Dashboard.jsx's handleNewJobSave exact write shape (newJobData +
    // setPendingUserTeam) so the rest of that existing job-change flow keeps
    // working unchanged — the only difference is this sync answers the
    // "did you take a new job" question instead of a manual Yes/No.
    let userJobChangeUpdate = {}
    if (plan.userJobChange) {
      const { tid, position } = plan.userJobChange
      const abbr = getAbbrFromTid(plan.mergedTeams || dynasty.teams, tid)
      userJobChangeUpdate = {
        newJobData: { takingNewJob: true, team: abbr, teamTid: tid, position },
      }
      plan.mergedTeams = setPendingUserTeam(plan.mergedTeams || dynasty.teams, tid, position)
    } else if (plan.userJobChangeResolved) {
      // The save's coach identity now correctly matches this dynasty's own
      // tracked team again — clears a stale newJobData flag a PREVIOUS sync
      // left behind (e.g. the wrong dynasty's save file got uploaded once by
      // mistake), rather than leaving an incorrect "Taking a New Job" banner
      // stuck forever even after a correct re-sync.
      userJobChangeUpdate = { newJobData: null }
      plan.mergedTeams = clearPendingUserTeam(plan.mergedTeams || dynasty.teams)
    }

    // The human's own real coach portrait — read directly off the
    // IsUserControlled row (see cfb27SaveSync.js's userCoachPortrait
    // comment for why this can't be looked up through teams[tid]'s
    // coachingStaff map instead). Only written when present so a sync that
    // for some reason can't resolve it doesn't blow away a previously-good
    // value.
    const userCoachPortraitUpdate = plan.userCoachPortrait ? { userCoachPortrait: plan.userCoachPortrait } : {}

    // Real, save-authoritative career totals for the human coach (Job
    // Security %, Prestige, career W-L/bowl/conf-title/NC/playoff/rivalry/
    // Top-25 records, draft picks, Top 5 recruiting classes) — see
    // cfb27SaveSync.js's userCoachCareerStats comment. Full overwrite each
    // sync (lifetime counters the save itself maintains), only written when
    // present so a sync that can't resolve it doesn't blow away a
    // previously-good value.
    const userCoachCareerStatsUpdate = plan.userCoachCareerStats ? { userCoachCareerStats: plan.userCoachCareerStats } : {}

    // "All Coaches" national leaderboard (every current FBS head coach) —
    // see cfb27SaveSync.js's allCoachesUpdate comment. Keyed by year like
    // the rest of this dynasty's per-season snapshots (cfpSeedsByYear,
    // finalPollsByYear); full overwrite for the current year each sync.
    const allCoachesUpdate = plan.allCoachesUpdate
      ? { allCoachesByYear: { ...(dynasty.allCoachesByYear || {}), [dynasty.currentYear]: plan.allCoachesUpdate } }
      : {}

    // Coach Carousel — plan.coachOffersUpdate is always the CURRENT live
    // list from this sync (see cfb27SaveSync.js), so it's a full replace,
    // never merged with what was there before: an offer that's since
    // disappeared from the save should disappear from the dashboard too.
    const coachOffersUpdate = { coachOffers: plan.coachOffersUpdate || [] }

    const useLocalStorage = dynasty.storageType !== 'cloud'
    const statsYear = Number(dynasty.currentYear)

    // User-facing labels for the leftover main-doc fields, keyed by their
    // ACTUAL top-level field name (not the local `...xyzUpdate` variable
    // name) — used for both progress messages and partial-failure errors so
    // neither ever exposes an internal field name like `allCoachesUpdate`.
    // Falls back to a generic label for anything not listed here, so adding
    // a new sync field later can never crash the labeler.
    const SYNC_FIELD_LABELS = {
      teams: 'team data',
      games: 'games',
      currentWeek: 'calendar advance',
      currentPhase: 'calendar advance',
      currentYear: 'calendar advance',
      teamFuture: 'future schedule',
      playersOfWeekByYear: 'weekly awards',
      heismanWatchByYear: 'weekly awards',
      rivalries: 'rivalry records',
      draftResultsByTeamYear: 'draft & playoff results',
      cfpSeedsByYear: 'draft & playoff results',
      cfpSeedsByYearTid: 'draft & playoff results',
      cfpBowlConfigByYear: 'draft & playoff results',
      allAmericansByYear: 'season honors & records',
      awardsByYear: 'season honors & records',
      leagueStatRecords: 'season honors & records',
      newJobData: 'coach profile',
      userCoachPortrait: 'coach profile',
      userCoachCareerStats: 'coach profile',
      allCoachesByYear: 'national coach rankings',
      coachOffers: 'coaching carousel',
    }
    const chunkLabel = (chunk) => {
      const labels = [...new Set(
        Object.keys(chunk)
          .filter((k) => k !== 'platform')
          .map((k) => SYNC_FIELD_LABELS[k] || 'additional sync data')
      )]
      return labels.length ? labels.join(', ') : 'sync data'
    }

    if (useLocalStorage) {
      const existingByPid = new Map(freshPlayers.map((p) => [p.pid, p]))
      for (const { pid, patch } of [...plan.toUpdatePatches, ...plan.departurePatches]) {
        const existing = existingByPid.get(pid)
        if (existing) existingByPid.set(pid, { ...existing, ...patch })
      }
      for (const created of plan.toCreatePlayers) {
        existingByPid.set(created.pid, created)
      }
      // Whole-league box scores just landed on mergedGames above — recompute
      // every player's season stat totals from them (same machinery the
      // manual "Fix Player Stats" admin action uses), or the box scores sit
      // on the games unread and every stats page stays empty.
      const mergedPlayers = recalculateStatsFromBoxScores([...existingByPid.values()], mergedGames, statsYear)
      await report('Recalculating stats…', 65)

      // No Firestore size ceiling applies to a local (IndexedDB) dynasty, so
      // this stays a single write — only cloud dynasties need the chunked
      // sequence below.
      await report('Saving…', 95)
      await updateDynasty(dynastyId, { players: mergedPlayers, teams: plan.mergedTeams, games: mergedGames, ...seasonFieldUpdates, ...teamFutureUpdate, ...playersOfWeekUpdate, ...heismanWatchUpdate, ...rivalriesUpdate, ...draftResultsUpdate, ...cfpSeedsUpdate, ...honorsUpdate, ...userJobChangeUpdate, ...userCoachPortraitUpdate, ...userCoachCareerStatsUpdate, ...allCoachesUpdate, ...coachOffersUpdate, platform: 'pc' })
      await report('Done', 100)
    } else {
      // Same recompute as the local branch, but diffed against freshPlayers
      // (not written wholesale — a cloud dynasty can have thousands of
      // players, and most weeks only touch a few hundred of them) so only
      // players whose season totals actually changed get a Firestore write.
      // Patch value is the FULL merged statsByYear map (existing years
      // spread in client-side), matching every other nested-year patch in
      // this same sync (teamsByYear/classByYear/overallByYear above) — a
      // bare `{ statsByYear: { [year]: ... } }` patch would replace the
      // whole map via {merge:true} and wipe every other tracked season.
      const existingByPid = new Map(freshPlayers.map((p) => [p.pid, p]))
      for (const { pid, patch } of [...plan.toUpdatePatches, ...plan.departurePatches]) {
        const existing = existingByPid.get(pid)
        if (existing) existingByPid.set(pid, { ...existing, ...patch })
      }
      for (const created of plan.toCreatePlayers) {
        existingByPid.set(created.pid, created)
      }
      const recalculated = recalculateStatsFromBoxScores([...existingByPid.values()], mergedGames, statsYear)
      const recalculatedByPid = new Map(recalculated.map((p) => [p.pid, p]))
      await report('Recalculating stats…', 65)

      const createPidSet = new Set(plan.toCreatePlayers.map((p) => p.pid))
      const statsPatches = []
      for (const player of recalculated) {
        if (createPidSet.has(player.pid)) continue // folded into the create doc below instead
        const freshPlayer = freshPlayers.find((p) => p.pid === player.pid)
        // stableStringify — same key-order-independence reasoning as the
        // games/players diffs in updateDynasty.
        const before = stableStringify(freshPlayer?.statsByYear?.[statsYear] || null)
        const after = stableStringify(player.statsByYear?.[statsYear] || null)
        if (before !== after) {
          statsPatches.push({
            pid: player.pid,
            patch: { statsByYear: { ...(freshPlayer?.statsByYear || {}), [statsYear]: player.statsByYear?.[statsYear] || {} } },
          })
        }
      }
      const createsWithStats = plan.toCreatePlayers.map((p) => {
        const recalc = recalculatedByPid.get(p.pid)
        return recalc?.statsByYear?.[statsYear] ? { ...p, statsByYear: { ...(p.statsByYear || {}), [statsYear]: recalc.statsByYear[statsYear] } } : p
      })

      if (createsWithStats.length || plan.toUpdatePatches.length || plan.departurePatches.length || statsPatches.length) {
        const totalPlayerWrites = createsWithStats.length + plan.toUpdatePatches.length + plan.departurePatches.length + statsPatches.length
        await syncPlayersToSubcollection(dynastyId, createsWithStats, [...plan.toUpdatePatches, ...plan.departurePatches, ...statsPatches], {
          onProgress: (sent, total) => { report('Saving roster…', 70 + Math.round((sent / Math.max(total || totalPlayerWrites, 1)) * 20)) },
        })
      }
      await report('Saving roster…', 90)

      // Everything left over after players/games/seasonal routing still
      // lands in ONE main-document Firestore write — on a full whole-league
      // sync (~143 teams, national coach rankings, honors, etc.) that single
      // write can exceed Firestore's request-size cap even though no
      // individual field is oversized on its own. Byte-chunk it into several
      // smaller sequential writes instead. Calendar-advance fields are
      // forced into their own chunk placed LAST so every other chunk is
      // durably written before the season clock advances on the server —
      // preserving updateDynasty's own single-call "isCalendarWrite"
      // ordering guarantee across this multi-call sequence.
      const fullUpdate = {
        teams: plan.mergedTeams, games: mergedGames, ...seasonFieldUpdates, ...teamFutureUpdate,
        ...playersOfWeekUpdate, ...heismanWatchUpdate, ...rivalriesUpdate, ...draftResultsUpdate, ...cfpSeedsUpdate,
        ...honorsUpdate, ...userJobChangeUpdate, ...userCoachPortraitUpdate, ...userCoachCareerStatsUpdate,
        ...allCoachesUpdate, ...coachOffersUpdate, platform: 'pc',
      }
      const chunks = chunkUpdateObject(fullUpdate, { lastKeys: ['currentYear', 'currentPhase', 'currentWeek'] })

      // This chunked sequence fires far more updateDynasty calls than a
      // normal save — bump the realtime-listener skip window to its cap for
      // the duration so a slow chunk's echo can't slip past a later chunk
      // resetting the counter mid-sync (see bumpSkipCount's own comment).
      bumpSkipCount(SKIP_COUNT_MAX)

      const completedLabels = []
      try {
        for (let i = 0; i < chunks.length; i++) {
          await report(`Saving ${chunkLabel(chunks[i])}…`, 90 + Math.round(((i + 1) / chunks.length) * 10))
          await updateDynasty(dynastyId, chunks[i], { skipPlayersSubcollection: true })
          completedLabels.push(chunkLabel(chunks[i]))
          // Each chunk's updateDynasty call can itself dispatch a burst of
          // parallel subcollection writes (games, teamFuture, seasonal) —
          // pace the chunks themselves too, same "Write stream exhausted"
          // protection as chunkForFirestoreBatch's own inter-batch delay,
          // so back-to-back chunks can't stack two such bursts on top of
          // each other.
          if (i + 1 < chunks.length) {
            await new Promise(resolve => setTimeout(resolve, 300))
          }
        }
      } catch (err) {
        const failedParts = chunks.slice(completedLabels.length).map(chunkLabel)
        err.completedParts = completedLabels
        err.failedParts = failedParts
        err.message = `${err.message} — synced: ${completedLabels.join(', ') || 'nothing yet'}. ` +
          `Not synced (safe to re-run the sync): ${failedParts.join(', ')}.`
        throw err
      }
    }

    return {
      summary: plan.summary,
      unresolvedTeamNames: plan.unresolvedTeamNames,
      reachedTargetSeason,
      stoppedAtOffseason,
    }
  }

  const updateDynasty = async (dynastyId, updates, options = {}) => {
    const { skipLastModified = false, forceOverwrite = false, skipGamesSubcollection = false, skipPlayersSubcollection = false, changedPlayerPids = null, replaceTeams = false, replaceSeasonal = [] } = options

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

        // Check for duplicate PID — pid is the true identity key, so this
        // removes only genuine duplicates.
        if (player.pid != null) {
          if (seenPIDs.has(player.pid)) {
            console.warn(`Duplicate player PID detected and removed: ${player.pid} (${player.name})`)
            return false
          }
          seenPIDs.add(player.pid)
          return true
        }

        // No pid to dedupe by — fall back to a content key so a malformed
        // record that's missing its pid can't slip a duplicate through.
        // IMPORTANT: this key is reached ONLY by pid-less players (the pid
        // branch above returns first). Two REAL players with distinct pids
        // who happen to share a name + team + class are legitimate and are
        // never touched here.
        //
        // cfb27AssetName is the save's own per-player unique id and is
        // trusted first when present. Otherwise fall back to name+team+
        // class+POSITION: confirmed against a real save that name+team+year
        // alone is not discriminating enough — two different real freshmen
        // ("James Moore" QB pid 10916 and "James Moore" K pid 11834, both
        // team 28) collided on it, and the second was silently deleted on
        // every save. That's real data loss, not a duplicate.
        const hasAssetName = player.cfb27AssetName != null && player.cfb27AssetName !== ''
        const nameKey = hasAssetName
          ? `asset:${player.cfb27AssetName}`
          : `name:${(player.name || '').toLowerCase().trim()}_${player.team || ''}_${player.year || ''}_${(player.position || '').toLowerCase()}`
        if (player.name && seenNames.has(nameKey)) {
          console.warn(`Duplicate pid-less player name/team/class detected and removed: ${player.name}`)
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
      // This prevents race conditions when multiple updates happen in quick succession.
      // withTimeout guards against a wedged IndexedDB connection (e.g. a second tab
      // holding the DB open) — without it, localforage's getItem/setItem can hang
      // forever, leaving every "Saving…"/"Importing…" spinner stuck until refresh
      // (and a refresh can't clear it while the other tab holds the lock). Rejecting
      // surfaces a real error to the caller's catch instead of the endless hang.
      const currentLocalDynasties = await withTimeout(
        indexedDBStorage.getDynasties(), 10000, 'Reading local dynasties'
      ) || []

      // Apply the updates to one local dynasty. Plain keys shallow-replace
      // (unchanged behavior); Firestore-style dot-notation keys (e.g.
      // "teams.42") are written into their NESTED path instead — cloning each
      // level so siblings are preserved and prior state isn't mutated. Without
      // this, a shallow spread stored a literal "teams.42" field and left
      // teams[42] untouched, so editing a team on a local (free-tier) dynasty
      // looked like it "didn't save" and reverted to the original.
      const applyLocalUpdates = (d) => {
        const plain = {}
        const dotted = []
        for (const [key, value] of Object.entries(updatesWithTimestamp)) {
          if (key.includes('.')) dotted.push([key, value])
          else plain[key] = value
        }
        let next = { ...d, ...plain }
        for (const [key, value] of dotted) {
          const parts = key.split('.')
          let cur = next
          for (let i = 0; i < parts.length - 1; i++) {
            const p = parts[i]
            cur[p] = (cur[p] && typeof cur[p] === 'object' && !Array.isArray(cur[p])) ? { ...cur[p] } : {}
            cur = cur[p]
          }
          cur[parts[parts.length - 1]] = value
        }
        return next
      }

      // Update the specific dynasty in the local dynasties list
      const updatedLocalDynasties = currentLocalDynasties.map(d =>
        String(d.id) === String(dynastyId) ? applyLocalUpdates(d) : d
      )

      // DATA-LOSS GUARD: if the dynasty we're updating isn't in what we just
      // read, the read almost certainly failed transiently (getDynasties()
      // swallows errors and returns [], or returned a partial list). Persisting
      // this result would drop the dynasty being edited — and if the read came
      // back empty, wipe every local dynasty. Abort loudly instead; the caller's
      // catch surfaces a retryable save error rather than silent loss. The
      // in-memory state is untouched, so nothing is lost.
      const targetPresent = updatedLocalDynasties.some(d => String(d.id) === String(dynastyId))
      if (!targetPresent) {
        throw new Error('Local save aborted: dynasty not found in stored data (likely a transient read failure). Your changes were not lost — please try again.')
      }

      // Immediately save to IndexedDB (only local dynasties). Guarded so a wedged
      // IndexedDB write can't hang the save UI forever (see the read above).
      await withTimeout(
        indexedDBStorage.saveDynasties(updatedLocalDynasties), 10000, 'Saving to local storage'
      )

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

      // Main-doc size guard — run BEFORE any subcollection write is dispatched.
      // A too-big main doc resolves locally then the server rejects it, wedging
      // the write queue. Previously this check ran AFTER the players/games/
      // seasonal subcollection writes were already in flight and then threw,
      // leaving half-committed state (subcollections written, main doc not).
      // It also mis-measured: it projected {...dynasty} minus players/games/
      // seasonal but LEFT IN recruitingDatabasePlayers, weekRecapsByYear, and
      // social — all subcollection-backed and potentially multi-MB — so for the
      // exact large-Recruiting-DB users the subcollection split was meant to
      // rescue, EVERY save spuriously threw. Exclude every subcollection-backed
      // field, and run before dispatch so a rejected save writes nothing.
      if (dynasty) {
        try {
          const OFF_MAIN_DOC = ['players', 'games', 'recruitingDatabasePlayers', 'weekRecapsByYear', 'socialFeedByYear', 'socialCharacters', 'teamFuture']
          const projected = { ...dynasty }
          for (const k of OFF_MAIN_DOC) delete projected[k]
          for (const k of Object.keys(projected)) {
            if (isSeasonalField(k)) delete projected[k]
          }
          // `dynasty.teams` here is the FOLDED-BACK shape (see
          // foldTeamsByYearFieldsFromFlat) — every reader's convenience
          // reconstruction of rankByWeek/schedule/teamRatings/etc. from the
          // seasons subcollection, not what's actually going to be written
          // to the main doc. Re-strip it the same way the router below
          // will, or this projection double-counts data that's headed to
          // the subcollection and rejects saves the real write would
          // survive (the exact bug that made `teams` keep showing up as
          // the "biggest field" even after that data stopped actually
          // living on the main doc).
          if (projected.teams) {
            projected.teams = stripTeamsByYearFlatFields(projected.teams).strippedTeams
            projected.teams = stripRecruitingClassRosterFromTeams(projected.teams).strippedTeams
          }
          for (const [k, v] of Object.entries(updatesWithTimestamp)) {
            if (k.includes('.')) continue
            if (OFF_MAIN_DOC.includes(k) || isSeasonalField(k)) continue
            // The incoming update's OWN `teams` needs the same re-strip as the
            // existing dynasty's above, or this loop just overwrites the
            // already-stripped copy with the raw incoming one — a CFB27
            // whole-league sync always writes every team's teams object at
            // once, so this wasn't a narrow edge case: it silently undid the
            // strip above on literally every sync, this guard just hadn't
            // been pushed hard enough for the gap to matter until a field
            // large enough (recruitingClassRoster, ~130 teams' named rosters
            // at once) exposed it — the real write-routing below already
            // strips the incoming teams object correctly, so a save this
            // rejects can still be one the real write would have survived.
            if (k === 'teams' && v && typeof v === 'object') {
              const strippedOnce = stripTeamsByYearFlatFields(v).strippedTeams
              projected.teams = stripRecruitingClassRosterFromTeams(strippedOnce).strippedTeams
              continue
            }
            projected[k] = v
          }
          // firestoreDocSize (src/utils/firestoreSize.js) computes Firestore's
          // own documented per-document size formula instead of a plain
          // JSON.stringify().length — a naive stringify estimate under-counts
          // real Firestore-charged size for data with lots of small fields
          // (confirmed in production: an "8 MiB" stringify-based batch
          // estimate still failed against the real ~11 MiB request cap), so
          // this guard's 1 MB threshold is only meaningful if the number
          // being compared against it is accurate. It also tolerates circular
          // references (degrades to not re-counting the repeat, rather than
          // throwing) — a plain JSON.stringify used to throw on one, and this
          // whole estimate used to be swallowed silently on any throw (see
          // the catch below), which meant a payload big enough to introduce
          // one also skipped the size check entirely and sailed straight
          // through to Firestore's own reject instead of this guard's
          // actionable message.
          const bytes = firestoreDocSize(projected)
          if (bytes > MAIN_DOC_BYTE_LIMIT) {
            const mb = (bytes / 1e6).toFixed(2)
            // Name the ACTUAL biggest field rather than assuming a cause. This
            // used to hard-code "almost always a large Recruiting Database" and
            // send everyone to Scout Staff → Export JSON. That advice is now
            // frequently wrong: a CFB 27 PC dynasty carries per-team statRecords
            // on `teams` (record book, up to 27 entries x ~136 schools) plus
            // dynasty-level leagueStatRecords, so `teams` can easily be the
            // largest field — and trimming a Recruiting Database they may not
            // even have would do nothing. Report the real top offenders and let
            // the message adapt.
            const sizeOf = (v) => {
              try { return firestoreValueSize(v ?? null) } catch { return 0 }
            }
            const top = Object.entries(projected)
              .map(([k, v]) => [k, sizeOf(v)])
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .filter(([, n]) => n > 0)
            const breakdown = top.map(([k, n]) => `${k} (${(n / 1e6).toFixed(2)} MB)`).join(', ')
            const biggest = top[0]?.[0]
            const hint = biggest === 'recruitingDatabasePlayers' || biggest === 'players'
              ? ' Open Scout Staff → Recruiting Database, use Export JSON to back it up, then trim it.'
              : ''
            throw new Error(
              `This dynasty's core save is ${mb} MB, over Firestore's 1 MB per-document limit. ` +
              `Largest fields: ${breakdown}.${hint}`
            )
          }
        } catch (err) {
          if (err instanceof Error && err.message.includes('per-document')) throw err
          // Don't block a save on an estimation failure — but this used to be
          // completely silent, which meant a broken estimate (and therefore a
          // skipped size check) left no trace when the save then failed for
          // real at Firestore with a much less actionable error.
          console.error('[updateDynasty] Main-doc size estimate failed — proceeding without the size guard for this save:', err)
        }
      }
      const subcollectionPromises = []

      // Stamp every top-level field we're writing so the listener won't let a
      // stale snapshot revert it for the next 10s (players/games have their own
      // refs; this protects dynastyPoints, coaches, teams, etc.).
      // Dot-notation writes ('teams.42', 'conferenceDivisionsByYear.2029') are
      // stamped by their TOP-LEVEL segment — reconcileWithRecentWrites protects
      // whole top-level fields, which is the right granularity. Previously these
      // were skipped entirely, so a dotted-key save could be reverted by a stale
      // snapshot once the skip-count window elapsed.
      {
        const writeTs = Date.now()
        for (const key of Object.keys(updates || {})) {
          const top = key.includes('.') ? key.split('.')[0] : key
          if (top === 'players' || top === 'games' || top === 'lastModified') continue
          recentMainDocFieldWritesRef.current[`${dynastyId}::${top}`] = writeTs
        }
      }

      // Route players to subcollection (unless skipPlayersSubcollection is
      // true — used by callers that already wrote the changed-only subset
      // via saveChangedPlayers and just want updateDynasty to sync local
      // React state without re-rewriting every player doc).
      if (mainDocUpdates.players && Array.isArray(mainDocUpdates.players) && !skipPlayersSubcollection) {
        console.log(`Saving ${mainDocUpdates.players.length} players to subcollection (with orphan cleanup${forceOverwrite ? ', forced' : ''})`)
        // CRITICAL: Track this player update to prevent listener from overwriting with stale data
        lastPlayersUpdateTimestampRef.current = Date.now()
        lastPlayersUpdateDynastyIdRef.current = dynastyId
        // Normalize every player through the v2 sync layer so the top-level
        // player.year / .team / .overall / .devTrait fields are always a
        // consistent mirror of the canonical per-year maps. Drops legacy
        // movements[] / teamHistory / leftTeam / etc. Keeps v2 canonical.
        // Prefer the currentYear being written in THIS update over the stale
        // in-memory dynasty. During a season flip the update carries
        // currentYear: nextYear while `dynasty` still holds the old year — using
        // the old year derives every player's top-level .team/.year/.overall
        // mirror from LAST season, leaving the new-season convenience fields
        // pointing at the wrong team (and skewing the name+team+year dedup key).
        const currentYearForSync = updates?.currentYear ?? dynasty?.currentYear
        const normalizedPlayers = mainDocUpdates.players.map(p =>
          syncDerivedFieldsFromV2(p, currentYearForSync)
        )
        // Also write normalized players back into updatesWithTimestamp so
        // the local-state update at the bottom of this function shows the
        // same normalized shape that was persisted to Firestore.
        updatesWithTimestamp.players = normalizedPlayers
        if (changedPlayerPids && changedPlayerPids.length) {
          // Caller passed the FULL players array (for correct local state) but
          // only a handful actually changed (e.g. resolving a few recruiting
          // commitments). Persist just those by pid — no full-roster rewrite,
          // no orphan-cleanup read. This keeps the save sub-second so the
          // accompanying main-doc fields (teams / recruitingCommitments) land
          // well inside the stale-snapshot guard window instead of racing it.
          const pidSet = new Set(changedPlayerPids.map(String))
          const subset = normalizedPlayers.filter(p => pidSet.has(String(p.pid)))
          if (subset.length > 0) {
            subcollectionPromises.push(
              savePlayersToSubcollection(dynastyId, subset, { forceOverwrite })
            )
          }
        } else {
          // Diff-based save (Firestore cost): callers routinely pass the FULL
          // roster when only a handful of players changed. The old path
          // rewrote every player doc AND ran a full orphan-scan read —
          // ~1000 billed ops for a one-player edit on a 500-player dynasty.
          // Diff the incoming array against the in-state roster (which
          // mirrors Firestore — it was hydrated from the subcollection and
          // updated by every save) and write only changed/new docs, deleting
          // exactly the removed pids with no scan.
          //
          // Falls back to the battle-tested full rewrite + orphan-scan path
          // when the diff can't be trusted: dynasty not fully hydrated this
          // session, pid-less rows, forceOverwrite repairs, or a mass
          // removal (>25) that should face the orphan path's safety checks.
          let diffApplied = false
          const priorRoster = Array.isArray(dynasty?.players) ? dynasty.players : null
          const fullyLoaded = loadedDynastyIdsRef.current.has(dynastyId)
          if (fullyLoaded && priorRoster && priorRoster.length > 0 && !forceOverwrite) {
            const priorByPid = new Map()
            let comparable = true
            for (const p of priorRoster) {
              if (p?.pid == null) { comparable = false; break }
              priorByPid.set(String(p.pid), p)
            }
            const changedPlayers = []
            const newPids = new Set()
            if (comparable) {
              for (const p of normalizedPlayers) {
                if (p?.pid == null) { comparable = false; break }
                const key = String(p.pid)
                newPids.add(key)
                const before = priorByPid.get(key)
                // stableStringify (key-order-independent) instead of plain
                // JSON.stringify: a player rebuilt via object spreads (every
                // sync/save path does this) serializes with different key
                // order than what Firestore hands back, even when nothing
                // actually changed — plain JSON.stringify treated that as a
                // real change and rewrote the doc anyway. Confirmed in
                // production on games (see the matching fix in the games
                // diff below): a 933-of-944 "changed" count on a repeat sync
                // of unchanged data was this exact bug, and volume that size
                // is what tips Firestore into "Write stream exhausted."
                // stableStringify still catches every REAL change — it's a
                // full deep comparison, just order-independent — so this
                // loses no safety, only the false positives.
                if (!before || stableStringify(before) !== stableStringify(p)) {
                  changedPlayers.push(p)
                }
              }
            }
            const removedPids = comparable
              ? [...priorByPid.keys()].filter(k => !newPids.has(k))
              : []
            if (comparable && removedPids.length <= 25) {
              diffApplied = true
              console.log(`[updateDynasty] players diff: ${changedPlayers.length} changed, ${removedPids.length} removed (of ${normalizedPlayers.length})`)
              if (changedPlayers.length > 0 || removedPids.length > 0) {
                subcollectionPromises.push(
                  savePlayersToSubcollection(dynastyId, changedPlayers, { removePids: removedPids, forceOverwrite })
                )
              }
            }
          }
          if (!diffApplied) {
            // forceOverwrite disables BOTH wipe guards inside
            // savePlayersToSubcollection (the empty-array skip and the >50%
            // mass-deletion refusal). If the in-memory roster is empty or was
            // never fully hydrated this session (subcollection load failed →
            // fell back to the bare main doc), a forced save would delete
            // every player doc on the server with no recoverable source.
            // Demote to a guarded save in that case — legit repairs always
            // run against a hydrated, non-empty roster.
            const forcedUnsafe = forceOverwrite
              && (normalizedPlayers.length === 0 || !loadedDynastyIdsRef.current.has(dynastyId))
            if (forcedUnsafe) {
              console.error('[updateDynasty] Refusing forced roster overwrite: in-memory roster is empty or not fully hydrated — saving with safety guards instead')
            }
            subcollectionPromises.push(
              savePlayersToSubcollection(dynastyId, normalizedPlayers, { deleteOrphans: true, forceOverwrite: forceOverwrite && !forcedUnsafe })
            )
          }
        }
        // Don't save players to main doc - they're in subcollection now
        delete mainDocUpdates.players
        // Ensure subcollection flag is set
        mainDocUpdates._subcollectionsMigrated = true
      } else if (mainDocUpdates.players && skipPlayersSubcollection) {
        // Players already saved individually via saveChangedPlayers — keep
        // the full array on updatesWithTimestamp so local React state still
        // sees the post-write shape, but skip the Firestore re-write.
        console.log('[updateDynasty] Skipping players subcollection (already saved individually)')
        delete mainDocUpdates.players
        mainDocUpdates._subcollectionsMigrated = true
      }

      // Route games to subcollection (unless skipGamesSubcollection is true - for optimized single-game updates)
      if (mainDocUpdates.games && Array.isArray(mainDocUpdates.games) && !skipGamesSubcollection) {
        console.log(`Saving ${mainDocUpdates.games.length} games to subcollection`)
        // CRITICAL: Track this games update to prevent listener from overwriting with stale data
        lastGamesUpdateTimestampRef.current = Date.now()
        lastGamesUpdateDynastyIdRef.current = dynastyId
        // Diff-based save — same rationale and fallback conditions as the
        // players diff above: write only changed/new games, delete exactly
        // the removed ids, and fall back to the full rewrite + orphan-scan
        // path whenever the diff can't be trusted.
        let gamesDiffApplied = false
        const priorGames = Array.isArray(dynasty?.games) ? dynasty.games : null
        const gamesFullyLoaded = loadedDynastyIdsRef.current.has(dynastyId)
        if (gamesFullyLoaded && priorGames && priorGames.length > 0 && !forceOverwrite) {
          const priorById = new Map()
          let comparable = true
          for (const g of priorGames) {
            if (g?.id == null) { comparable = false; break }
            priorById.set(String(g.id), g)
          }
          const changedGames = []
          const newIds = new Set()
          if (comparable) {
            for (const g of mainDocUpdates.games) {
              if (g?.id == null) { comparable = false; break }
              const key = String(g.id)
              newIds.add(key)
              const before = priorById.get(key)
              // stableStringify, not plain JSON.stringify — see the matching
              // comment in the players diff above. Games rebuilt by the
              // CFB27 sync (spread + box-score merge) serialize with
              // different key order than Firestore's stored copy even when
              // content is identical, so a plain-stringify compare flagged
              // nearly every game as "changed" on every sync (933 of 944 on
              // a REPEAT sync in production) — that write volume is what
              // was tipping Firestore into "Write stream exhausted."
              if (!before || stableStringify(before) !== stableStringify(g)) {
                changedGames.push(g)
              }
            }
          }
          const removedIds = comparable
            ? [...priorById.keys()].filter(k => !newIds.has(k))
            : []
          if (comparable && removedIds.length <= 25) {
            gamesDiffApplied = true
            console.log(`[updateDynasty] games diff: ${changedGames.length} changed, ${removedIds.length} removed (of ${mainDocUpdates.games.length})`)
            if (changedGames.length > 0 || removedIds.length > 0) {
              subcollectionPromises.push(
                saveGamesToSubcollection(dynastyId, changedGames, { removeIds: removedIds })
              )
            }
          }
        }
        if (!gamesDiffApplied) {
          subcollectionPromises.push(
            saveGamesToSubcollection(dynastyId, mainDocUpdates.games, { deleteOrphans: true })
          )
        }
        // Don't save games to main doc - they're in subcollection now
        delete mainDocUpdates.games
        // Ensure subcollection flag is set
        mainDocUpdates._subcollectionsMigrated = true
      } else if (mainDocUpdates.games && skipGamesSubcollection) {
        // Games already saved individually - just remove from main doc updates
        console.log('[updateDynasty] Skipping games subcollection (already saved individually)')
        delete mainDocUpdates.games
      }

      // Route teamFuture (Scheme Builder depth-chart plans) to its own
      // subcollection — one doc per tid. Not seasons-subcollection material
      // (it's the single CURRENT plan, not year-scoped history), so it gets
      // its own small subcollection instead, same as players/games. Full
      // replace every time — both writers (saveTeamFuture, the CFB27 sync)
      // already pass the complete object.
      if (mainDocUpdates.teamFuture && typeof mainDocUpdates.teamFuture === 'object') {
        subcollectionPromises.push(
          saveTeamFutureSubcollection(dynastyId, mainDocUpdates.teamFuture)
        )
        delete mainDocUpdates.teamFuture
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

      // Extract every teams[tid].byYear[year].{field} sub-field listed in
      // TEAMS_BYYEAR_FLAT_FIELDS into the matching flat *ByTeamYear seasons-
      // subcollection field, so the main-doc `teams` map stops re-
      // accumulating data that's ALSO stored there (or, for
      // rankByWeek/division/schoolGrades/recruitingClass*/conference/record/
      // teamRecord, that has no other home at all — rankByWeek is the
      // dominant one: every team's full week-by-week rank history, forever,
      // times ~136 teams — see the DangerZone size guard's "biggest fields"
      // report for why `teams` keeps showing up).
      //
      // Two write shapes to handle:
      //   - full-object: mainDocUpdates.teams = { [tid]: { byYear: { [year]: {...} } } }
      //   - dot-notation: mainDocUpdates['teams.42.byYear.2029.rankByWeek.5'] = 12
      //     (saveRankings writes this shape so concurrent rank edits merge
      //     instead of last-write-wins clobbering the whole teams map)
      //
      // Every level touched is cloned rather than mutated in place —
      // mainDocUpdates.teams is the SAME object reference as
      // updatesWithTimestamp.teams (mainDocUpdates above is only a shallow
      // copy), and updatesWithTimestamp seeds this session's local React
      // state. Mutating in place would silently blank rankByWeek etc. out
      // of the UI until the next reload re-hydrates it from the
      // subcollection (see foldTeamsByYearFieldsFromFlat).
      const TEAMS_BYYEAR_TO_SEASONAL_FIELD = Object.fromEntries(
        Object.entries(TEAMS_BYYEAR_FLAT_FIELDS).map(([seasonalField, subField]) => [subField, seasonalField])
      )
      const addTeamsByYearToSeasonalCollect = (seasonalField, tidKey, yearKey, value) => {
        if (!seasonalCollect[seasonalField]) seasonalCollect[seasonalField] = {}
        if (!seasonalCollect[seasonalField][tidKey]) seasonalCollect[seasonalField][tidKey] = {}
        seasonalCollect[seasonalField][tidKey][yearKey] = value
      }
      // recruitingClassRoster is NOT part of TEAMS_BYYEAR_FLAT_FIELDS (see
      // stripRecruitingClassRosterFromTeams's own header comment for why it
      // needs its own (tid, year)-granular subcollection instead of the
      // shared seasons doc) — extracted separately, before the seasonal
      // extraction below, using the same size-guard-shared helper.
      let recruitingClassRosterCollect = {}
      if (mainDocUpdates.teams && typeof mainDocUpdates.teams === 'object') {
        const { strippedTeams, extracted } = stripRecruitingClassRosterFromTeams(mainDocUpdates.teams)
        mainDocUpdates.teams = strippedTeams
        recruitingClassRosterCollect = extracted
      }
      // Route recruitingClassRoster (just extracted above) to its own
      // (tid, year)-granular subcollection — see
      // saveRecruitingClassesSubcollection's own header comment for why this
      // needs finer granularity than teamFuture's one-doc-per-tid or the
      // shared seasons doc.
      if (Object.keys(recruitingClassRosterCollect).length > 0) {
        subcollectionPromises.push(
          saveRecruitingClassesSubcollection(dynastyId, recruitingClassRosterCollect)
        )
      }
      if (mainDocUpdates.teams && typeof mainDocUpdates.teams === 'object') {
        // Shared with the main-doc size guard above (stripTeamsByYearFlatFields)
        // so the two can never disagree about what `teams` looks like once
        // these fields are routed away — that mismatch is exactly what let
        // the guard reject syncs the real write would have survived.
        const { strippedTeams, extracted } = stripTeamsByYearFlatFields(mainDocUpdates.teams)
        mainDocUpdates.teams = strippedTeams
        for (const [seasonalField, byTid] of Object.entries(extracted)) {
          for (const [tidKey, byYearMap] of Object.entries(byTid)) {
            for (const [yearKey, value] of Object.entries(byYearMap)) {
              addTeamsByYearToSeasonalCollect(seasonalField, tidKey, yearKey, value)
            }
          }
        }
      }
      {
        const dotKeysToDelete = []
        // Built from TEAMS_BYYEAR_FLAT_FIELDS's subField names so this never
        // drifts out of sync with which fields actually get routed —
        // hardcoding the alternation here once already caused a near-miss
        // when Phase B added 16 more fields to that map.
        const teamsByYearSubFieldNames = Object.values(TEAMS_BYYEAR_FLAT_FIELDS)
        const teamsByYearDotRe = new RegExp(
          `^teams\\.([^.]+)\\.byYear\\.([^.]+)\\.(${teamsByYearSubFieldNames.join('|')})(?:\\.(.+))?$`
        )
        for (const key of Object.keys(mainDocUpdates)) {
          const m = key.match(teamsByYearDotRe)
          if (!m) continue
          const [, tidKey, yearKey, subField, restPath] = m
          const seasonalField = TEAMS_BYYEAR_TO_SEASONAL_FIELD[subField]
          const value = mainDocUpdates[key]
          if (restPath) {
            // Partial update (e.g. saveRankings' `...rankByWeek.5`) — merge
            // the single leaf into whatever's already queued for this
            // (tid, year) rather than clobbering the rest of the map. The
            // season doc's own setDoc({merge:true}) then merges this into
            // any existing server-side data for OTHER weeks/keys.
            if (!seasonalCollect[seasonalField]) seasonalCollect[seasonalField] = {}
            if (!seasonalCollect[seasonalField][tidKey]) seasonalCollect[seasonalField][tidKey] = {}
            const existing = seasonalCollect[seasonalField][tidKey][yearKey]
            seasonalCollect[seasonalField][tidKey][yearKey] =
              (existing && typeof existing === 'object') ? { ...existing, [restPath]: value } : { [restPath]: value }
          } else {
            addTeamsByYearToSeasonalCollect(seasonalField, tidKey, yearKey, value)
          }
          dotKeysToDelete.push(key)
        }
        for (const key of dotKeysToDelete) delete mainDocUpdates[key]
      }

      if (Object.keys(seasonalCollect).length > 0) {
        const byYear = splitSeasonalUpdateByYear(seasonalCollect)
        // For fields the caller is REPLACING (not just adding to), inject
        // deleteField() sentinels for entries removed vs the current value —
        // a merge-write can't otherwise clear a key that's simply absent now.
        for (const field of replaceSeasonal) {
          if (!(field in seasonalCollect)) continue
          const delPatch = diffSeasonalDeletions(field, dynasty?.[field], seasonalCollect[field])
          for (const [yr, fields] of Object.entries(delPatch)) {
            if (!byYear[yr]) byYear[yr] = {}
            for (const [sf, teamMap] of Object.entries(fields)) {
              if (teamMap && typeof teamMap === 'object' && !Array.isArray(teamMap) && byYear[yr][sf] && typeof byYear[yr][sf] === 'object') {
                byYear[yr][sf] = { ...byYear[yr][sf], ...teamMap }
              } else {
                byYear[yr][sf] = teamMap
              }
            }
          }
        }
        if (Object.keys(byYear).length > 0) {
          subcollectionPromises.push(writeSeasonalUpdate(dynastyId, byYear))
        }
      }

      // Execute subcollection writes and main doc update in parallel
      const writePromises = [...subcollectionPromises]

      // Defensive routing assertion — any seasonal field reaching the
      // main doc means the strip step above missed it. Log loudly so
      // we catch the bug at write time instead of debugging it from
      // diverged-data symptoms later. Doesn't block the write — the
      // worst case is one stale field on the main doc, fixable with
      // a touch later. Better than crashing the user's save.
      if (Object.keys(mainDocUpdates).length > 0) {
        const leakedSeasonal = Object.keys(mainDocUpdates).filter(k =>
          isSeasonalField(k) || (k.includes('.') && isSeasonalField(k.split('.')[0]))
        )
        if (leakedSeasonal.length > 0) {
          console.warn(
            `[updateDynasty] Seasonal field(s) leaked into main-doc update — should have been routed to seasons subcollection: ${leakedSeasonal.join(', ')}`
          )
        }

        // Main-doc size guard. Large fields kept on the main doc — chiefly the
        // (Main-doc size guard runs earlier, before any subcollection write is
        // dispatched — see the top of this cloud branch.)
        //
        // CALENDAR ordering: when this update moves the season clock
        // (currentYear / currentPhase / currentWeek — i.e. advanceWeek /
        // advanceToNewSeason), the main-doc write must not land before the
        // accompanying subcollection writes (players/seasonal). Parallel
        // writes meant a fast subcollection failure could leave the server
        // calendar advanced past roster/season data that never persisted — a
        // half-advanced season. Sequence it: subcollections first, main doc
        // only after they succeed. Normal (non-calendar) saves keep the
        // parallel fast path.
        const isCalendarWrite = ['currentYear', 'currentPhase', 'currentWeek']
          .some(k => k in mainDocUpdates)
        if (isCalendarWrite && subcollectionPromises.length > 0) {
          writePromises.length = 0
          writePromises.push(
            Promise.all(subcollectionPromises).then(() => updateDynastyInFirestore(dynastyId, mainDocUpdates))
          )
        } else {
          writePromises.push(updateDynastyInFirestore(dynastyId, mainDocUpdates))
        }
      }

      // Swallow-proof: Promise.all rejects on the FIRST failure; any sibling
      // that rejects afterwards would surface as an unhandledrejection with
      // no handler. Attach a no-op catch to each (doesn't affect Promise.all,
      // which subscribes separately).
      for (const p of writePromises) p.catch(() => {})

      // Don't block the save UI forever if the server ack never arrives (wedged
      // WebChannel connection). persistentLocalCache has already durably stored
      // these writes and will sync them in the background, so after a grace
      // period we proceed to the optimistic local-state update below instead of
      // leaving every "Saving…"/"Importing…" spinner stuck until a refresh.
      await settleOrProceed(Promise.all(writePromises), 10000, `updateDynasty(${dynastyId})`)

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

      // deepMerge merges the `teams` map key-by-key, so it can ADD or UPDATE a
      // tid but never REMOVE one absent from the new map. Callers that delete
      // teams (e.g. the NCAA 11 migration pruning non-2010 programs) pass
      // replaceTeams so the local copy mirrors the wholesale field replace that
      // updateDoc already does on the server — otherwise the removed teams
      // linger in the UI until a hard reload.
      const mergeUpdates = (base) => {
        const merged = deepMerge(base, expandedUpdates)
        if (replaceTeams && expandedUpdates.teams) merged.teams = expandedUpdates.teams
        // `coaches` (and its derived `memberTeams` index) are maps where a
        // DELETION must propagate — removing a coach, or clearing a season's
        // byYear entry (Timeline "Clear"/X). deepMerge can only add/update
        // keys, never drop them, so a cleared season would linger in the UI
        // until reload. All coach writes send the full intended map, so a
        // wholesale replace is both correct and what updateDoc already does
        // on the server.
        if ('coaches' in expandedUpdates) merged.coaches = expandedUpdates.coaches
        if ('memberTeams' in expandedUpdates) merged.memberTeams = expandedUpdates.memberTeams
        // Same rationale as replaceTeams: deepMerge can't drop a removed key, so
        // a cleared seasonal entry (e.g. a recruiting-class rank) would linger in
        // the UI until reload. Replace the whole field with the new value.
        for (const field of replaceSeasonal) {
          if (field in expandedUpdates) merged[field] = expandedUpdates[field]
        }
        // schemeBuilder (Scheme Builder's per-tid/year scheme+playbook+
        // package state) has the identical problem: every write already
        // sends the COMPLETE object for that tid/year (see SchemeBuilder.jsx's
        // buildSchemeBuilderPatch), so deepMerge-ing it can only add/update
        // keys, never remove one — deselecting a playbook writes it with the
        // key genuinely absent, updateDoc correctly clears it on the server,
        // but deepMerge would leave the stale value sitting in local state,
        // making the deselect look like it silently did nothing. Unlike
        // teams/replaceSeasonal this needs no opt-in flag — every caller of
        // this field already sends the full picture, so a wholesale replace
        // is always correct.
        if ('schemeBuilder' in expandedUpdates) merged.schemeBuilder = expandedUpdates.schemeBuilder
        return merged
      }

      // CRITICAL: use functional setters so back-to-back updateDynasty calls
      // (e.g. save data then clear the sheetId) don't race. Each call sees
      // the latest committed dynasties state rather than the stale value
      // captured when this closure was created.
      setDynasties(prev => {
        const dynastyInArray = prev.some(d => String(d.id) === String(dynastyId))
        if (dynastyInArray) {
          return prev.map(d =>
            String(d.id) === String(dynastyId) ? mergeUpdates(d) : d
          )
        }
        // Dynasty just created and not in array yet — use currentDynasty as base.
        // currentDynasty may also be stale here, but expandedUpdates wins in deepMerge.
        if (String(currentDynasty?.id) === String(dynastyId)) {
          return [...prev, mergeUpdates(currentDynasty)]
        }
        return prev
      })

      if (String(currentDynasty?.id) === String(dynastyId)) {
        // Same deal — functional setter so back-to-back writes merge correctly.
        setCurrentDynasty(prev => {
          if (prev && String(prev.id) === String(dynastyId)) {
            return mergeUpdates(prev)
          }
          return mergeUpdates(currentDynasty)
        })
      }

      // Shared (non-owner editor) dynasties live in `sharedDynasties`, not
      // `dynasties`. Patch there too so an editor's own write reflects in the
      // home-list entry immediately — the setDynasties block above never
      // matches a shared dynasty, and currentDynasty only covers the live view.
      setSharedDynasties(prev => prev.some(d => String(d.id) === String(dynastyId))
        ? prev.map(d => String(d.id) === String(dynastyId) ? mergeUpdates(d) : d)
        : prev)
    } catch (error) {
      console.error('Error updating dynasty:', error)
      // Surface a lapsed-premium rejection as an actionable message. The
      // client's isPremium flag only refreshes when the users/{uid} doc
      // changes, but rules evaluate currentPeriodEnd against request.time —
      // a clock-only expiry means the client still THINKS it's premium while
      // the server rejects every write. Without this the edit just vanished.
      if (error?.code === 'permission-denied') {
        try { toast.error('Save rejected — your premium may have expired. Check Account, then reload.') } catch (_) {}
      }
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
      // Write the new recap to its own subcollection doc. The write
      // resolves after the local SDK cache is updated (fast — no
      // extra network round-trips); Firestore handles server delivery
      // and retry internally.
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
      await settleOrProceed(saveWeekRecapToSubcollection(dynastyId, yearN, weekN, entry), 10000, 'saveWeekRecap')
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

  // One preview per year (not one per week like weekRecapsByYear), so the
  // plain embedded map is never a document-size concern — no subcollection
  // needed here, unlike saveWeekRecap/deleteWeekRecap above.
  const savePlayoffPreview = async (dynastyId, year, text) => {
    if (blockIfReadOnly(dynastyId, 'save playoff preview')) return
    const yearN = Number(year)
    const dynasty = String(currentDynasty?.id) === String(dynastyId)
      ? currentDynasty
      : dynasties.find(d => String(d.id) === String(dynastyId))
    if (!dynasty) throw new Error('Dynasty not found')
    const cur = dynasty.playoffPreviewByYear || {}
    await updateDynasty(dynastyId, {
      playoffPreviewByYear: { ...cur, [yearN]: { generatedAt: Date.now(), text: String(text || '') } }
    })
  }

  const deletePlayoffPreview = async (dynastyId, year) => {
    if (blockIfReadOnly(dynastyId, 'delete playoff preview')) return
    const yearN = Number(year)
    const dynasty = String(currentDynasty?.id) === String(dynastyId)
      ? currentDynasty
      : dynasties.find(d => String(d.id) === String(dynastyId))
    if (!dynasty) throw new Error('Dynasty not found')
    const cur = { ...(dynasty.playoffPreviewByYear || {}) }
    delete cur[yearN]
    await updateDynasty(dynastyId, { playoffPreviewByYear: cur })
  }

  // ─── Social Media feature ──────────────────────────────────────────────────
  // Social data is loaded lazily (it's an opt-in tab) rather than threaded
  // through the hot dynasty-load path. Cloud: subcollections (socialFeed +
  // sharded socialCharacters). Local: embedded fields on the dynasty doc.
  const socialFindDynasty = (dynastyId) =>
    (String(currentDynasty?.id) === String(dynastyId) ? currentDynasty : null) ||
    dynasties.find(d => String(d.id) === String(dynastyId))

  const socialIsCloud = (dynasty, dynastyId) => {
    const looksLikeFirebaseId = typeof dynastyId === 'string' && dynastyId.length >= 20 && !/^\d+$/.test(dynastyId)
    return looksLikeFirebaseId || (dynasty?.storageType === 'cloud' && !!user)
  }

  // Social data lives in dedicated state (keyed by dynasty id), NOT on the
  // dynasty object — the dynasty listener rebuilds currentDynasty constantly,
  // which would wipe lazily-loaded social fields and re-trigger an infinite
  // load loop. This state is overlaid onto the exposed currentDynasty at the
  // context boundary, so it survives listener churn.
  // Shape: { [dynastyId]: { characters: {...}, feed: {...} } }
  const socialFetchedRef = useRef({}) // fetch-once-per-id guard
  const socialLoadedAtRef = useRef({}) // dynastyId -> socialUpdatedAt seen at last fetch
  // Local (non-cloud) dynasties: remembers the RAW socialCharacters/
  // socialFeedByYear references last written into socialByDynasty per id, so
  // loadSocial can skip a redundant setState when neither has actually
  // changed. Without this, loadSocial unconditionally called setSocialByDynasty
  // on every invocation — harmless in isolation, but LeaguePreferences.jsx's
  // effect depends on the loadSocial function reference itself (which is
  // recreated every DynastyProvider render, not memoized), so: setState →
  // re-render → new loadSocial reference → effect refires → loadSocial call →
  // setState again → ... an infinite loop, confirmed via a real "Maximum
  // update depth exceeded" freeze reported by the user. Any updateDynasty
  // call that changes currentDynasty's reference (e.g. toggling an unrelated
  // boolean like scoutStaffEnabled) could trigger this once the loop got
  // started. This guard breaks the cycle at its root: once the raw source
  // fields are unchanged, loadSocial returns the cached value without ever
  // touching state again.
  const localSocialSourceRef = useRef({})

  const getSocialFor = (dynastyId) => socialByDynasty[dynastyId] || { characters: {}, feed: {} }
  const setSocialFor = (dynastyId, patch) => {
    setSocialByDynasty(prev => {
      const cur = prev[dynastyId] || { characters: {}, feed: {} }
      return { ...prev, [dynastyId]: { ...cur, ...patch } }
    })
  }

  // Fetch characters + feed into state. Call when the social UI mounts.
  // Loads the bundled base universe (shared) first, then per-dynasty data.
  const loadSocial = async (dynastyId) => {
    await ensureUniverseLoaded()
    const dynasty = socialFindDynasty(dynastyId)
    if (!dynasty) return { socialCharacters: {}, socialFeedByYear: {} }

    if (!socialIsCloud(dynasty, dynastyId)) {
      const rawCharacters = dynasty.socialCharacters
      const rawFeed = dynasty.socialFeedByYear
      const last = localSocialSourceRef.current[dynastyId]
      if (last && last.rawCharacters === rawCharacters && last.rawFeed === rawFeed) {
        const cur = getSocialFor(dynastyId)
        return { socialCharacters: cur.characters, socialFeedByYear: cur.feed }
      }
      localSocialSourceRef.current[dynastyId] = { rawCharacters, rawFeed }
      const characters = rawCharacters || {}
      const feed = rawFeed || {}
      // Second guard, for the first call after a remount (the ref above is
      // empty then): only update state when the underlying references
      // actually changed. An unconditional setState produces a new object
      // every call, and any caller that runs loadSocial from an effect keyed
      // on state would spin (see WeekRecapModal's social-load effect).
      setSocialByDynasty(prev => {
        const cur = prev[dynastyId]
        if (cur && cur.characters === characters && cur.feed === feed) return prev
        return { ...prev, [dynastyId]: { characters, feed } }
      })
      return { socialCharacters: characters, socialFeedByYear: feed }
    }

    // Cloud: fetch exactly once per id. The subcollection getters swallow
    // their own errors (return {}), so a permission failure still resolves —
    // we record the attempt and never spin.
    if (socialFetchedRef.current[dynastyId]) {
      const cur = getSocialFor(dynastyId)
      return { socialCharacters: cur.characters, socialFeedByYear: cur.feed }
    }
    socialFetchedRef.current[dynastyId] = true
    socialLoadedAtRef.current[dynastyId] = Number(dynasty.socialUpdatedAt || 0)
    const [characters, feed] = await Promise.all([
      getSocialCharactersSubcollection(dynastyId, { onFresh: (fresh) => setSocialFor(dynastyId, { characters: fresh }) }),
      getSocialFeedSubcollection(dynastyId, { onFresh: (fresh) => setSocialFor(dynastyId, { feed: fresh }) }),
    ])
    setSocialByDynasty(prev => ({ ...prev, [dynastyId]: { characters, feed } }))
    return { socialCharacters: characters, socialFeedByYear: feed }
  }

  // Cross-device social sync: when another device writes social data it bumps
  // socialUpdatedAt on the dynasty doc. If that's newer than what we last
  // fetched, drop the fetch-once guard and reload (there's no live listener on
  // the social subcollections, so this is how remote imports/edits propagate).
  useEffect(() => {
    const d = currentDynasty
    if (!d?.id || !socialIsCloud(d, d.id)) return
    if (!socialFetchedRef.current[d.id]) return // initial mount-load handles first fetch
    const remote = Number(d.socialUpdatedAt || 0)
    const loaded = Number(socialLoadedAtRef.current[d.id] || 0)
    if (remote > loaded) {
      socialFetchedRef.current[d.id] = false
      loadSocial(d.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDynasty?.id, currentDynasty?.socialUpdatedAt])

  // Import an externally-authored universe pack into this dynasty. By default
  // it REPLACES the whole universe (the imported set becomes the dynasty's
  // accounts, no bundled base merge), mirroring importing a league file.
  const importSocialUniverse = async (dynastyId, rawArray, { replace = true } = {}) => {
    if (blockIfReadOnly(dynastyId, 'import social universe')) return
    const dynasty = socialFindDynasty(dynastyId)
    if (!dynasty) throw new Error('Dynasty not found')
    const validTids = new Set(Object.keys(dynasty.teams || {}).map(Number).filter(Number.isFinite))
    const { byId, count, skipped, dupHandles } = importUniverse(rawArray, { validTids })
    if (socialIsCloud(dynasty, dynastyId)) {
      // On a replace import the file is authoritative — wipe stale per-account
      // overrides first so they can't mask the freshly imported bios/avatars.
      if (replace) await settleOrProceed(clearSocialCharacterOverrides(dynastyId), 10000, 'clearSocialOverrides')
      await settleOrProceed(saveSocialCharacterShards(dynastyId, byId), 10000, 'saveSocialShards')
      if (replace) await updateDynasty(dynastyId, { socialUniverseReplaced: true, socialDeletedIds: [], socialUpdatedAt: Date.now(), socialUniverseVersion: SOCIAL_UNIVERSE_VERSION })
    } else {
      await updateDynasty(dynastyId, { socialCharacters: byId, socialUpdatedAt: Date.now(), ...(replace ? { socialUniverseReplaced: true, socialDeletedIds: [], socialUniverseVersion: SOCIAL_UNIVERSE_VERSION } : {}) })
    }
    setSocialFor(dynastyId, { characters: byId })
    return { count, skipped: skipped.length, dupHandles }
  }

  // Replace this dynasty's social universe with the current bundled default
  // (the "latest" universe). Used by the upgrade prompt for dynasties still on
  // an older imported universe. Filtered to the dynasty's teams by import.
  const upgradeSocialUniverseToLatest = async (dynastyId) => {
    if (blockIfReadOnly(dynastyId, 'upgrade social universe')) return
    const mod = await import('../data/socialUniverse.json')
    const arr = mod?.default || mod
    return importSocialUniverse(dynastyId, arr, { replace: true })
  }

  // Save a week's parsed posts (merged/deduped) plus any auto-created characters.
  const saveSocialPosts = async (dynastyId, year, week, newPosts, newCharacters = {}) => {
    if (blockIfReadOnly(dynastyId, 'save social posts')) return
    const dynasty = socialFindDynasty(dynastyId)
    if (!dynasty) throw new Error('Dynasty not found')
    const yearN = Number(year)
    const weekN = Number(week)
    const cur = getSocialFor(dynastyId)
    const existingWeek = cur.feed?.[yearN]?.[weekN] || []
    const mergedWeek = mergePosts(existingWeek, newPosts)
    const hasNewChars = newCharacters && Object.keys(newCharacters).length > 0
    const nextFeed = { ...cur.feed, [yearN]: { ...(cur.feed[yearN] || {}), [weekN]: mergedWeek } }
    const nextChars = hasNewChars ? { ...cur.characters, ...newCharacters } : cur.characters

    if (socialIsCloud(dynasty, dynastyId)) {
      // Guarded so a wedged WebChannel ack can't spin the "Adding…"/"Saving…"
      // UI forever (these subcollection writes are durable in
      // persistentLocalCache and sync in the background). Mirrors updateDynasty.
      await settleOrProceed(Promise.all([
        saveSocialFeedToSubcollection(dynastyId, yearN, weekN, mergedWeek),
        ...(hasNewChars ? [saveSocialCharacterOverrides(dynastyId, newCharacters)] : []),
      ]), 10000, 'saveSocialPosts')
    } else {
      const update = { socialFeedByYear: nextFeed }
      if (hasNewChars) update.socialCharacters = nextChars
      await updateDynasty(dynastyId, update)
    }
    setSocialFor(dynastyId, { feed: nextFeed, characters: nextChars })
    return mergedWeek.length
  }

  // Replace a week's posts wholesale (used by the post manager to support
  // delete / edit / manual-add, which merging can't do).
  const replaceSocialWeek = async (dynastyId, year, week, posts, newCharacters = {}) => {
    if (blockIfReadOnly(dynastyId, 'edit social posts')) return
    const dynasty = socialFindDynasty(dynastyId)
    if (!dynasty) throw new Error('Dynasty not found')
    const yearN = Number(year)
    const weekN = Number(week)
    const cur = getSocialFor(dynastyId)
    const hasNewChars = newCharacters && Object.keys(newCharacters).length > 0
    const nextFeed = { ...cur.feed, [yearN]: { ...(cur.feed[yearN] || {}), [weekN]: posts } }
    const nextChars = hasNewChars ? { ...cur.characters, ...newCharacters } : cur.characters
    if (socialIsCloud(dynasty, dynastyId)) {
      // Guarded (see saveSocialPosts) so an un-acked write can't hang the UI.
      await settleOrProceed(Promise.all([
        saveSocialFeedToSubcollection(dynastyId, yearN, weekN, posts),
        ...(hasNewChars ? [saveSocialCharacterOverrides(dynastyId, newCharacters)] : []),
      ]), 10000, 'replaceSocialWeek')
    } else {
      const update = { socialFeedByYear: nextFeed }
      if (hasNewChars) update.socialCharacters = nextChars
      await updateDynasty(dynastyId, update)
    }
    setSocialFor(dynastyId, { feed: nextFeed, characters: nextChars })
    return posts.length
  }

  // Persist user edits / additions to characters (overrides).
  const saveSocialCharacters = async (dynastyId, charsById) => {
    if (blockIfReadOnly(dynastyId, 'save social characters')) return
    const dynasty = socialFindDynasty(dynastyId)
    if (!dynasty || !charsById || Object.keys(charsById).length === 0) return
    const cur = getSocialFor(dynastyId)
    const nextChars = { ...cur.characters, ...charsById }
    if (socialIsCloud(dynasty, dynastyId)) {
      await settleOrProceed(saveSocialCharacterOverrides(dynastyId, charsById), 10000, 'saveSocialCharacters')
    } else {
      await updateDynasty(dynastyId, { socialCharacters: nextChars, socialUpdatedAt: Date.now() })
    }
    setSocialFor(dynastyId, { characters: nextChars })
  }

  // Delete one or more accounts from the universe. Stored data (shards) can't
  // drop a single key cleanly, so we record a tombstone id list on the dynasty
  // and getEffectiveCharacters filters them out. Also drops them from local
  // state for immediate feedback. Cleared on a fresh universe import.
  const deleteSocialCharacters = async (dynastyId, ids) => {
    if (blockIfReadOnly(dynastyId, 'delete social characters')) return
    const dynasty = socialFindDynasty(dynastyId)
    const idList = (Array.isArray(ids) ? ids : [ids]).map(String).filter(Boolean)
    if (!dynasty || idList.length === 0) return
    const prev = Array.isArray(dynasty.socialDeletedIds) ? dynasty.socialDeletedIds.map(String) : []
    const nextDeleted = Array.from(new Set([...prev, ...idList]))
    await updateDynasty(dynastyId, { socialDeletedIds: nextDeleted, socialUpdatedAt: Date.now() })
    const cur = getSocialFor(dynastyId)
    const nextChars = { ...cur.characters }
    for (const id of idList) delete nextChars[id]
    setSocialFor(dynastyId, { characters: nextChars })
    return idList.length
  }

  const updateSocialSettings = async (dynastyId, patch) => {
    if (blockIfReadOnly(dynastyId, 'update social settings')) return
    const dynasty = socialFindDynasty(dynastyId)
    const cur = { ...DEFAULT_SOCIAL_SETTINGS, ...(dynasty?.socialSettings || {}) }
    await updateDynasty(dynastyId, { socialSettings: { ...cur, ...patch } })
  }

  const updateSocialPlatform = async (dynastyId, patch) => {
    if (blockIfReadOnly(dynastyId, 'update social platform')) return
    const dynasty = socialFindDynasty(dynastyId)
    const cur = { ...DEFAULT_SOCIAL_PLATFORM, ...(dynasty?.socialPlatform || {}) }
    await updateDynasty(dynastyId, { socialPlatform: { ...cur, ...patch } })
  }

  const deleteDynasty = async (dynastyId) => {
    // Find the dynasty to determine its storage type. The list exposed to
    // consumers is dynastiesWithShared (owner + shared), so a dynasty the
    // user can see may live in sharedDynasties — search both, same as
    // selectDynasty. Searching only the owner list here was the bug behind
    // "delete does nothing": a miss fell through to the local branch, which
    // clears IndexedDB but never deletes the Firestore doc, so the listener
    // re-added the dynasty on the next snapshot.
    const dynasty = dynasties.find(d => String(d.id) === String(dynastyId))
      || sharedDynasties.find(d => String(d.id) === String(dynastyId))

    // Route based on the dynasty's actual storage. Only treat it as local
    // when it's explicitly tagged 'local' (or nobody is signed in). A
    // signed-in user deleting an untagged / not-found dynasty must go
    // through the Firestore teardown: if the doc doesn't exist there the
    // delete is a harmless no-op, whereas wrongly taking the local branch
    // can never remove a cloud doc and risks clearAll() on IndexedDB.
    const isLocalStorage = !user || dynasty?.storageType === 'local'

    if (isLocalStorage) {
      // Local storage: remove ONLY this dynasty from IndexedDB. Never call
      // clearAll() here — deriving "no local dynasties left" from the
      // in-memory list and wiping the whole store could destroy other
      // on-disk dynasties that simply weren't hydrated into state yet
      // (audit C5). indexedDBStorage.deleteDynasty reads the store,
      // filters out this id, and writes the rest back — safe by itself.
      await indexedDBStorage.deleteDynasty(dynastyId)

      setDynasties(prev => prev.filter(d => String(d.id) !== String(dynastyId)))

      if (String(currentDynasty?.id) === String(dynastyId)) {
        setCurrentDynasty(null)
      }
      return
    }

    // Ownership guard: only the OWNER may run the destructive teardown.
    // For a SHARED dynasty (a different userId — this user is just an
    // invited editor), "delete" must mean LEAVE, not wipe. A non-owner
    // can't delete the parent doc (owner-only rule) and can only delete a
    // SUBSET of subcollections, so the teardown would partially destroy the
    // owner's dynasty and then fail "Missing or insufficient permissions".
    // Leaving drops this uid from the dynasty; the shared-dynasty listener
    // then removes it from the list. A missing userId is treated as ours
    // (legacy / pre-sharing dynasties).
    const isOwner = !dynasty?.userId || String(dynasty.userId) === String(user.uid)
    if (!isOwner) {
      setSharedDynasties(prev => prev.filter(d => String(d.id) !== String(dynastyId)))
      setDynasties(prev => prev.filter(d => String(d.id) !== String(dynastyId)))
      if (String(currentDynasty?.id) === String(dynastyId)) setCurrentDynasty(null)
      // Await the genuine leave so the dialog spinner holds until it's done.
      try {
        await leaveDynastyInFirestore(dynastyId, user.uid)
      } catch (error) {
        console.error('Error leaving shared dynasty:', error)
        try { toast.error('Failed to leave dynasty — it may reappear. Try again.') } catch {}
        throw error
      }
      return
    }

    // Cloud storage: optimistic list removal, but AWAIT the genuine wipe.
    //
    // The dynasty disappears from the user's list IMMEDIATELY (the card is
    // gone the moment they confirm), so the page stays responsive. But we
    // then AWAIT the Firestore tear-down so this promise only resolves once
    // the dynasty is GENUINELY deleted — that lets the delete dialog keep its
    // loading spinner up until the work actually finishes, instead of closing
    // the instant the background task is kicked off. If the teardown fails,
    // the listener brings the dynasty back on the next snapshot, we surface a
    // toast, and we re-throw so the caller can react.
    const updated = dynasties.filter(d => String(d.id) !== String(dynastyId))
    setDynasties(updated)
    if (String(currentDynasty?.id) === String(dynastyId)) {
      setCurrentDynasty(null)
    }

    try {
      await deleteDynastyWithSubcollections(dynastyId)
    } catch (error) {
      console.error('Error deleting dynasty from Firestore:', error)
      try { toast.error('Failed to delete dynasty — it may reappear. Try again.') } catch {}
      throw error
    }
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
    // ACTING user's team — in a shared league the raw doc's current team is
    // the OWNER's, so a member's own game must classify against THEIR team
    // (else it's mistaken for a CPU game and its box score/stats are skipped).
    const currentUserTid = activeUserTid || getCurrentTeamTid(dynasty)
    const currentUserTeam = (currentUserTid ? getAbbrFromTid(dynasty.teams, currentUserTid) : null) || getCurrentTeamAbbr(dynasty) || dynasty.teamName

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
        const userTidForSeed = activeUserTid || getCurrentTeamTid(dynasty)
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
        const userTidForSeed = activeUserTid || getCurrentTeamTid(dynasty)
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
        bumpSkipCount(3)
        skipListenerTimestampRef.current = Date.now()
        lastGamesUpdateTimestampRef.current = Date.now()
        lastGamesUpdateDynastyIdRef.current = dynastyId

        // Save single game to Firestore subcollection (1 write instead of N).
        // Capped: a wedged connection must not hang the caller's Saving… UI
        // forever — the write is durable locally and syncs in the background.
        await settleOrProceed(saveGameToSubcollection(dynastyId, game), 10000, `addGame(${dynastyId})`)
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
        bumpSkipCount(3)
        skipListenerTimestampRef.current = Date.now()
        lastGamesUpdateTimestampRef.current = Date.now()
        lastGamesUpdateDynastyIdRef.current = dynastyId
        // Block the real-time listener from clobbering our fresh
        // players array with a stale read — same pattern updateDynasty
        // uses for its players-subcollection writes.
        lastPlayersUpdateTimestampRef.current = Date.now()
        lastPlayersUpdateDynastyIdRef.current = dynastyId

        await settleOrProceed(saveChangedPlayersAndGame(dynastyId, changedPlayers, game), 10000, `addGame:boxscore(${dynastyId})`)
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

    // OPTIMIZED PATH: Cloud storage - save all games in ONE batch + record updates
    if (isCloudStorage) {
      try {
        // Set listener-skip guards so the real-time listener doesn't
        // overwrite our games array with a stale subcollection read.
        bumpSkipCount(3)
        skipListenerTimestampRef.current = Date.now()
        lastGamesUpdateTimestampRef.current = Date.now()
        lastGamesUpdateDynastyIdRef.current = dynastyId

        // Collect ALL games to write: main game + any CFP propagated games.
        // Previously we called saveGameToSubcollection once per game, which
        // fires waitForPendingWrites on each call — N+1 sequential server
        // round-trips. For a CFP Quarterfinal (bowl week 2) that was 3
        // round-trips and is why those saves took so long. Batching into one
        // saveWeeklyGamesChanges call cuts it to a single round-trip.
        const gamesToSave = []
        const gameToSave = updatedGames.find(g => g.id === gameData.id)
        if (gameToSave) gamesToSave.push(gameToSave)
        for (const propagatedGame of cfpGamesToPropagate) {
          const fullPropGame = updatedGames.find(g => g.id === propagatedGame.id)
          if (fullPropGame) gamesToSave.push(fullPropGame)
        }
        // Single batch commit + one waitForPendingWrites for all games.
        // Cap the server-ack wait: the batch is durable in the local cache and
        // syncs in the background, so a wedged long-poll connection must not
        // spin "Saving…" forever (same settleOrProceed treatment as updateDynasty
        // / recap / social saves). Fast rejections still surface to the catch.
        await settleOrProceed(saveWeeklyGamesChanges(dynastyId, gamesToSave, []), 10000, `updateGame(${dynastyId})`)

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

        console.log(`[updateGame] SUCCESS: Saved ${gamesToSave.length} game(s) in 1 batch with ${Object.keys(recordUpdates).length} record fields`)
        return gameData
      } catch (error) {
        console.error('[updateGame] Optimized save failed, falling back to batch:', error)
        // Fall through to batch update
      }
    }

    // FALLBACK PATH: Local storage or cloud error - use targeted save approach
    if (isCloudStorage) {
      // Cloud fallback: batch all changed games in one write + update main doc
      // fields only. NEVER do a full-array rewrite here — it writes a
      // potentially-stale games array back to Firestore with deleteOrphans=true,
      // which deletes any game that was committed after we last read React state.
      console.log(`[updateGame] Cloud fallback: saving game(s) as single batch without full-array rewrite`)
      try {
        const fallbackGames = []
        const gameToSave = updatedGames.find(g => g.id === gameData.id)
        if (gameToSave) fallbackGames.push(gameToSave)
        for (const propagatedGame of cfpGamesToPropagate) {
          const fullPropGame = updatedGames.find(g => g.id === propagatedGame.id)
          if (fullPropGame) fallbackGames.push(fullPropGame)
        }
        await settleOrProceed(saveWeeklyGamesChanges(dynastyId, fallbackGames, []), 10000, `updateGame:fallback(${dynastyId})`)
        const cloudUpdates = { ...recordUpdates }
        if (teamsUpdate) cloudUpdates.teams = teamsUpdate
        if (Object.keys(cloudUpdates).length > 0) {
          await updateDynasty(dynastyId, cloudUpdates, { skipGamesSubcollection: true })
        }
      } catch (retryError) {
        console.error('[updateGame] Cloud fallback also failed:', retryError)
        throw retryError
      }
    } else {
      // Local storage: full-array batch update (safe for IndexedDB, no orphan risk)
      console.log(`[updateGame] Local storage: batch update via updateDynasty`)
      const batchUpdates = { games: updatedGames, ...recordUpdates }
      if (teamsUpdate) batchUpdates.teams = teamsUpdate
      await updateDynasty(dynastyId, batchUpdates)
    }

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

    // Only treat an incoming row as "I have data for this bowl" if it
    // carries both teams AND both scores. Blank rows in the sheet still
    // come back from the reader (column A is protected so bowlName is
    // always set), but they should NOT wipe the existing game — they
    // mean "user didn't fill this one in." This guard is what makes
    // it safe to show all bowls in the sheet every time without
    // pre-excluding already-entered ones.
    const validIncoming = bowlGames.filter(b => {
      if (!b?.bowlName) return false
      const hasTeam1 = b.team1Tid || b.team1
      const hasTeam2 = b.team2Tid || b.team2
      if (!hasTeam1 || !hasTeam2) return false
      if (b.team1Score === null || b.team1Score === undefined) return false
      if (b.team2Score === null || b.team2Score === undefined) return false
      return true
    })
    const incomingValidNames = new Set(validIncoming.map(b => b.bowlName))

    // Index existing bowl games for this year + week so we can preserve
    // rich fields (quarters, box score, etc.) on a round-trip save.
    const existingByBowlName = new Map()
    for (const g of existingGames) {
      if (!g?.isBowlGame) continue
      if (Number(g.year) !== Number(year)) continue
      if (g.bowlWeek !== week) continue
      if (g.bowlName) existingByBowlName.set(g.bowlName, g)
    }

    const filteredGames = existingGames.filter(g => {
      if (Number(g.year) !== Number(year)) return true
      if (!g.isBowlGame) return true
      if (g.bowlWeek !== week) return true
      // Only drop an existing bowl game if the sheet has fresh, valid
      // data for it. Bowl rows the user left blank fall through here
      // and stay intact.
      return !incomingValidNames.has(g.bowlName)
    })

    // Create / refresh game entries for each valid incoming bowl.
    const newGames = validIncoming.map(bowl => {
      const existing = existingByBowlName.get(bowl.bowlName)

      // Raw orientation as transcribed from the sheet (col B = team1, D = team2).
      let team1Tid = bowl.team1Tid || getTidFromAbbr(bowl.team1, dynasty)
      let team2Tid = bowl.team2Tid || getTidFromAbbr(bowl.team2, dynasty)
      let team1Score = parseInt(bowl.team1Score)
      let team2Score = parseInt(bowl.team2Score)
      let team1Rank = (bowl.team1Rank !== null && bowl.team1Rank !== undefined && bowl.team1Rank !== '') ? parseInt(bowl.team1Rank) : null
      let team2Rank = (bowl.team2Rank !== null && bowl.team2Rank !== undefined && bowl.team2Rank !== '') ? parseInt(bowl.team2Rank) : null

      // ORIENTATION LOCK. If this bowl already exists with the SAME two teams
      // in the OPPOSITE slots, keep the existing team1/team2 orientation and
      // map the incoming scores + ranks onto it. The AI transcribes the EA
      // screenshot's left-to-right order, which can differ from how the game
      // was first entered (the user's own game is stored user-team-first).
      // Without this, a re-save flips team1Tid/team2Tid while the POSITIONAL
      // quarters{team1,team2} / overtimes[{team1,team2}] stay put — silently
      // mismatching the linescore with the teams (and, if the game is later
      // re-opened in the editor, recomputing the final score from the wrong
      // quarter column). Re-aligning the incoming row here fixes it entirely
      // in the save layer, with no change to the AI prompt or the sheet.
      const reversedVsExisting = existing &&
        existing.team1Tid != null && existing.team2Tid != null &&
        team1Tid != null && team2Tid != null &&
        Number(existing.team1Tid) === Number(team2Tid) &&
        Number(existing.team2Tid) === Number(team1Tid)
      if (reversedVsExisting) {
        ;[team1Tid, team2Tid] = [team2Tid, team1Tid]
        ;[team1Score, team2Score] = [team2Score, team1Score]
        ;[team1Rank, team2Rank] = [team2Rank, team1Rank]
      }

      const winnerTid = team1Score > team2Score ? team1Tid : team2Tid

      // Spread the existing game first so rich fields (quarters,
      // boxScore, gameNote, links, team ranks already on file, etc.)
      // survive a round-trip save through the sheet. The values below
      // intentionally override only the fields the sheet is authoritative
      // for: tids, scores, winner, plus the bowl-game classification.
      return {
        ...(existing || {}),
        id: existing?.id || `bowl-${year}-${bowl.bowlName?.replace(/\s+/g, '-').toLowerCase() || Date.now()}`,
        isBowlGame: true,
        bowlName: bowl.bowlName,
        bowlWeek: week,
        year: Number(year),
        week: existing?.week || 'Bowl',
        gameType: GAME_TYPES.BOWL,

        // UNIFIED FORMAT: tid-based team identification (orientation-locked
        // to the existing game when this is a same-teams round-trip).
        team1Tid,
        team2Tid,
        team1Score,
        team2Score,
        homeTeamTid: existing?.homeTeamTid !== undefined ? existing.homeTeamTid : null,
        winnerTid,

        // Sheet-supplied ranks win when present; otherwise keep whatever
        // the existing game had. Ranks follow the locked orientation above.
        ...(team1Rank !== null ? { team1Rank } : {}),
        ...(team2Rank !== null ? { team2Rank } : {}),

        // Sheet-supplied notes/links win when present; otherwise inherit.
        gameNote: bowl.gameNote || existing?.gameNote || '',
        links: bowl.links || existing?.links || '',
        createdAt: existing?.createdAt || new Date().toISOString(),
      }
    })

    const updatedGames = [...filteredGames, ...newGames]

    // OPTIMIZED: For cloud storage, write only the changed bowl games
    // instead of rewriting the entire games subcollection. The full-array
    // updateDynasty path fires saveGamesToSubcollection with deleteOrphans=true,
    // which reads the whole subcollection, computes orphans, and batch-rewrites
    // every game — O(all games) instead of O(changed bowl games).
    //
    // newGames reuse existing IDs (id: existing?.id || ...) so the upserts in
    // saveWeeklyGamesChanges naturally replace any old doc. No explicit
    // deletions needed — the old doc with the same ID is simply overwritten.
    if (isCloudDynasty && newGames.length > 0) {
      try {
        bumpSkipCount(3)
        skipListenerTimestampRef.current = Date.now()
        lastGamesUpdateTimestampRef.current = Date.now()
        lastGamesUpdateDynastyIdRef.current = dynastyId

        await settleOrProceed(saveWeeklyGamesChanges(dynastyId, newGames, []), 10000, `saveCPUBowlGames(${dynastyId})`)
        lastGamesUpdateTimestampRef.current = Date.now()

        // Update local React state with the full updated games list
        const updatedDynasty = { ...dynasty, games: updatedGames, lastModified: Date.now() }
        setDynasties(prev => prev.map(d =>
          String(d.id) === String(dynastyId) ? updatedDynasty : d
        ))
        if (String(currentDynasty?.id) === String(dynastyId)) {
          setCurrentDynasty(updatedDynasty)
        }

        console.log(`[saveCPUBowlGames] Saved ${newGames.length} bowl game(s) for ${year} ${week} in 1 batch`)
        return newGames
      } catch (error) {
        console.error('[saveCPUBowlGames] Targeted batch failed, falling back to full-array rewrite:', error)
        // Fall through to full-array rewrite below
      }
    }

    // Local storage (and the cloud targeted-write fallback) land here: a full
    // games-array rewrite. Timed so bowl-save cost is visible for free-tier
    // dynasties too (they have no targeted subcollection path).
    const tBowl0 = (typeof performance !== 'undefined' ? performance.now() : Date.now())
    await updateDynasty(dynastyId, { games: updatedGames })
    const tBowl1 = (typeof performance !== 'undefined' ? performance.now() : Date.now())
    console.log(`[saveCPUBowlGames] Full-array rewrite of ${updatedGames.length} game(s) in ${Math.round(tBowl1 - tBowl0)}ms (${isCloudDynasty ? 'cloud-fallback' : 'local'}, ${week})`)

    return newGames
  }

  // Delete a single game by id. Fast path on cloud — one Firestore
  // delete + local-state update — falls back to the slow
  // full-array updateDynasty on local storage. If the deleted game
  // had a box score, we re-aggregate that year's player stats so
  // season totals don't keep counting the removed game's
  // contribution.
  const deleteGame = async (dynastyId, gameId) => {
    if (blockIfReadOnly(dynastyId, 'delete game')) return
    if (!gameId) throw new Error('deleteGame: gameId required')

    const dynasty = dynasties.find(d => String(d.id) === String(dynastyId))
      || (String(currentDynasty?.id) === String(dynastyId) ? currentDynasty : null)
    if (!dynasty) throw new Error(`deleteGame: dynasty ${dynastyId} not found`)

    const games = dynasty.games || []
    const target = games.find(g => String(g.id) === String(gameId))
    if (!target) throw new Error(`deleteGame: game ${gameId} not found`)

    const updatedGames = games.filter(g => String(g.id) !== String(gameId))
    const yearOfGame = Number(target.year)
    const hadBoxScore = !!target.boxScore || !!target.statsContributed

    const isCloud = dynasty.storageType === 'cloud'

    if (isCloud) {
      try {
        // Listener-skip guards so the snapshot listener doesn't
        // bring the deleted game back from a stale subcollection
        // read while our delete is in flight.
        bumpSkipCount(3)
        skipListenerTimestampRef.current = Date.now()
        lastGamesUpdateTimestampRef.current = Date.now()
        lastGamesUpdateDynastyIdRef.current = dynastyId

        await deleteGameFromSubcollection(dynastyId, gameId)

        // Local state — optimistic and immediate. Same shape the
        // addGame fast path uses.
        const updatedDynasty = { ...dynasty, games: updatedGames, lastModified: Date.now() }
        setDynasties(prev => prev.map(d =>
          String(d.id) === String(dynastyId) ? updatedDynasty : d
        ))
        if (String(currentDynasty?.id) === String(dynastyId)) {
          setCurrentDynasty(updatedDynasty)
        }
      } catch (err) {
        console.error('[deleteGame] Fast-path delete failed, falling back to full updateDynasty:', err)
        await updateDynasty(dynastyId, { games: updatedGames })
      }
    } else {
      // Local-storage path: write through updateDynasty.
      await updateDynasty(dynastyId, { games: updatedGames })
    }

    // Re-aggregate that year's player stats so season totals don't
    // keep counting the deleted game's contribution. Skip when the
    // game had no box score — there's nothing to subtract.
    if (hadBoxScore && Number.isFinite(yearOfGame)) {
      try {
        await syncAllPlayersStats(dynastyId, yearOfGame, { skipGamesPlayed: false })
      } catch (err) {
        console.warn(`[deleteGame] Stat resync for year ${yearOfGame} failed (game deleted, but season totals may be slightly off):`, err)
      }
    }
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
        bumpSkipCount(3)
        skipListenerTimestampRef.current = Date.now()
        lastGamesUpdateTimestampRef.current = Date.now()
        lastGamesUpdateDynastyIdRef.current = dynastyId

        await settleOrProceed(saveGameToSubcollection(dynastyId, updatedGame), 10000, `patchGameFields(${dynastyId})`)

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
        bumpSkipCount(3)
        skipListenerTimestampRef.current = Date.now()
        lastPlayersUpdateTimestampRef.current = Date.now()
        lastPlayersUpdateDynastyIdRef.current = dynastyId

        await settleOrProceed(saveChangedPlayers(dynastyId, changed), 10000, `applyChangedPlayers(${dynastyId})`)

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
        bumpSkipCount(3)
        skipListenerTimestampRef.current = Date.now()
        lastGamesUpdateTimestampRef.current = Date.now()
        lastGamesUpdateDynastyIdRef.current = dynastyId

        await settleOrProceed(saveWeeklyGamesChanges(dynastyId, gamesToSet, gameIdsToDelete), 10000, `saveGameSetChanges(${dynastyId})`)

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
  const saveWeeklyScores = async (dynastyId, weeklyGames, year, week, rankWeekOverride = null) => {
    if (blockIfReadOnly(dynastyId, 'save weekly scores')) return
    const dynasty = await findDynastyById(dynastyId)
    if (!dynasty) return []

    const yearNum = Number(year)
    const weekNum = Number(week)
    // ACTING user's team — a member's own game must be the one protected from
    // the weekly-scores import (raw currentTid would protect the owner's game
    // and let the import clobber the member's hand-entered game).
    const userTid = activeUserTid || getCurrentTeamTid(dynasty)
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

    // Conference championship games come EXCLUSIVELY through the
    // dedicated ConferenceChampionshipModal flow — never through the
    // weekly-scores importer. EA's calendar puts the CCG week between
    // Week 14 (last regular-season week) and the bowl / CFP weeks; it
    // isn't a numbered regular-season slot. Earlier versions of this
    // importer auto-promoted Week 14-15 same-conf neutral-site rows to
    // CCGs, which kept misfiring on Army-Navy and ate hours of
    // recovery work. The new rule: weekly scores are always REGULAR
    // games. CCGs go through their own flow with week='CCG'.
    const isConferenceChampionshipCandidate = () => false

    // Walk parsed rows, build a Map keyed by sorted-tid pair so duplicates collapse
    const newByPair = new Map()
    // Poll ranks pasted on the user's OWN game row. The user's game is entered
    // via its own flow, so we skip creating/replacing it below — but the ranks
    // on that row are still part of the CURRENT poll the screenshot shows.
    // Captured here so the rank pass writes them to rankByWeek[currentWeek] too;
    // without this the user's team rank is silently dropped and the user's team
    // goes missing from the Top 25 after a weekly-scores save.
    const userGameRankRows = []
    const validPollRank = (r) => (typeof r === 'number' && r >= 1 && r <= 25) ? r : null
    for (const row of weeklyGames) {
      const homeTid = Number(row.homeTid)
      const awayTid = Number(row.awayTid)
      if (!homeTid || !awayTid || homeTid === awayTid) continue
      // Blank-BOTH-scores rows are the upcoming-schedule paste (SCHEDULE-ONLY
      // MODE in the AI prompt): saved below as SCHEDULED games so the week's
      // matchups exist before they're played. Rows where only one side parsed
      // stay skipped (malformed).
      const isScheduleRow = row.homeScore == null && row.awayScore == null
      if (!isScheduleRow && (typeof row.homeScore !== 'number' || typeof row.awayScore !== 'number')) continue

      const lo = Math.min(homeTid, awayTid)
      const hi = Math.max(homeTid, awayTid)
      const key = `${lo}-${hi}`

      if (isScheduleRow) {
        // Additive only: never touch a matchup that already has ANY game on
        // file (played or scheduled) — the schedule paste fills gaps, it
        // doesn't rewrite games.
        if (existingByPair.get(key) || existingCCByPair.has(key)) continue
        const schedHomeAbbr = getAbbrFromTid(dynasty.teams, homeTid) || row.homeTeam
        const schedAwayAbbr = getAbbrFromTid(dynasty.teams, awayTid) || row.awayTeam
        const schedHomeConf = schedHomeAbbr ? getTeamConference(schedHomeAbbr, customConferences) : null
        const schedAwayConf = schedAwayAbbr ? getTeamConference(schedAwayAbbr, customConferences) : null
        newByPair.set(key, {
          id: idForGame(homeTid, awayTid),
          year: yearNum,
          week: weekNum,
          gameType: GAME_TYPES.REGULAR,
          team1Tid: homeTid,
          team2Tid: awayTid,
          team1Score: null,
          team2Score: null,
          team1Rank: null,
          team2Rank: null,
          homeTeamTid: row.neutral ? null : homeTid,
          winnerTid: null,
          isConferenceGame: !!(schedHomeConf && schedAwayConf && schedHomeConf === schedAwayConf),
          isPlayed: false,
          source: 'weekly-schedule',
          _team1CurrentWeekRank: (typeof row.homeRank === 'number' && row.homeRank >= 1 && row.homeRank <= 25) ? row.homeRank : null,
          _team2CurrentWeekRank: (typeof row.awayRank === 'number' && row.awayRank >= 1 && row.awayRank <= 25) ? row.awayRank : null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        continue
      }

      // Preserve user-team games that already have scores — but keep the poll
      // ranks pasted on that row so the rank pass can still record them.
      const existing = existingByPair.get(key)
      if (isUserGameWithScores(existing)) {
        userGameRankRows.push({ homeTid, awayTid, homeRank: validPollRank(row.homeRank), awayRank: validPollRank(row.awayRank) })
        continue
      }

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
      const isConfChampImport = isConferenceChampionshipCandidate(homeConf, awayConf, row.neutral, lo, hi)

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
        // PRESERVE user-added data attached to the prior record for this
        // matchup. The weekly-scores save rebuilds the game object from the
        // parsed sheet; without this, re-entering a week's scores wiped
        // everything a user had layered onto these games — photo tags,
        // uploaded photos, the score graphic, the box score, the AI recap.
        // Spread these FIRST so the fresh score/rank/tid fields below win.
        ...(existing ? {
          ...(existing.photoTags ? { photoTags: existing.photoTags } : {}),
          ...(Array.isArray(existing.photos) && existing.photos.length ? { photos: existing.photos } : {}),
          ...(existing.scoreGraphic ? { scoreGraphic: existing.scoreGraphic } : {}),
          ...(existing.scoreGraphics ? { scoreGraphics: existing.scoreGraphics } : {}),
          ...(existing.scoreGraphicShown ? { scoreGraphicShown: existing.scoreGraphicShown } : {}),
          ...(existing.boxScore ? { boxScore: existing.boxScore } : {}),
          ...(existing.aiRecap ? { aiRecap: existing.aiRecap } : {}),
          ...(existing.gameNote ? { gameNote: existing.gameNote } : {}),
          ...(Array.isArray(existing.links) && existing.links.length ? { links: existing.links } : {}),
        } : {}),
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

    // SAFETY: refuse to wipe existing weekly-scores entries on an
    // empty save. The destructive filter below drops every
    // weekly-scores game for this year+week before installing the
    // new ones, so without this guard, hitting Save with an empty
    // sheet — or one whose paste failed to parse — silently erases
    // the previously-saved 50+ games and leaves only the user-team
    // game (which is preserved separately). The success toast still
    // says "Saved 0 games", so the data loss is invisible until the
    // user opens the recap and notices a single game.
    if (newByPair.size === 0) {
      const existingWeeklyCount = existingGames.filter(g =>
        g && Number(g.year) === yearNum && Number(g.week) === weekNum
        && g.source === 'weekly-scores'
        && g.team1Tid && g.team2Tid
      ).length
      if (existingWeeklyCount > 0) {
        const err = new Error(
          `Save blocked: 0 games parsed from the sheet, but ${existingWeeklyCount} ` +
          `${existingWeeklyCount === 1 ? 'game is' : 'games are'} already saved for ` +
          `Week ${weekNum}, ${yearNum}. Your existing data is unchanged. ` +
          `Re-paste the AI's TSV and try Save again.`
        )
        err.code = 'WEEKLY_SCORES_EMPTY_SAVE_BLOCKED'
        throw err
      }
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
    // SIMPLE SPEC. The Google Sheet does two things:
    //
    //   1. Save game scores for the week being entered (weekNum).
    //   2. Save each team's CURRENT poll rank (from the screenshot)
    //      to rankByWeek[currentWeek]. The screenshot the user pastes
    //      shows the dynasty's CURRENT poll regardless of which past
    //      week's scores they're transcribing — so all entered ranks
    //      live in the rankByWeek[currentWeek] slot.
    //
    // Each saved game's team1Rank / team2Rank stores whatever the AI
    // extracted from the screenshot for that game's row — a snapshot
    // of the rank the user actually saw, no derivation, no rankByWeek
    // round-trip.
    //
    // The PLAYED-TID guard on the bye block is the only non-trivial
    // bit: a team in newGamesArr can never be a bye team, even if the
    // AI mistakenly puts them in the bye block (PR #125's fix).
    // The week we write screenshot ranks to. By default this is the
    // dynasty's currentWeek (the user's "right now" poll). Callers can
    // override when they know the screenshot they pasted is from a
    // different week (e.g. backfilling history) — passing
    // rankWeekOverride lets the modal target a specific slot instead
    // of always clobbering currentWeek.
    const overrideWeek = Number(rankWeekOverride)
    const haveOverride = Number.isFinite(overrideWeek) && overrideWeek > 0
    const currentWeek = haveOverride ? overrideWeek : Number(dynasty.currentWeek)
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

    // (1a) Played-team ranks → rankByWeek[currentWeek].
    if (haveCurrentWeek) {
      for (const g of newGamesArr) {
        if (typeof g._team1CurrentWeekRank === 'number') writeRankByWeek(g.team1Tid, currentWeek, g._team1CurrentWeekRank)
        if (typeof g._team2CurrentWeekRank === 'number') writeRankByWeek(g.team2Tid, currentWeek, g._team2CurrentWeekRank)
      }
      // (1a-user) The user's own game is excluded from newGamesArr (it has its
      // own entry flow), but its row's poll ranks still belong in the current
      // poll — otherwise the user's team is missing from the Top 25 after a
      // weekly-scores save (this is the "my team's rank spot went blank" bug).
      for (const r of userGameRankRows) {
        if (typeof r.homeRank === 'number') writeRankByWeek(r.homeTid, currentWeek, r.homeRank)
        if (typeof r.awayRank === 'number') writeRankByWeek(r.awayTid, currentWeek, r.awayRank)
      }
    }

    // (1b) Bye-team ranks → same rankByWeek[currentWeek] slot. This
    // is the user's CURRENT poll, with played teams from the game
    // block and bye teams from the bye block — together they form a
    // complete Top 25 picture for currentWeek.
    //
    // Played-tid guard: a played team can never be on bye. If the AI
    // put them in the bye block by mistake, skip the entry.
    const byeRanks = Array.isArray(weeklyGames?.byeRanks) ? weeklyGames.byeRanks : []
    if (haveCurrentWeek && byeRanks.length > 0) {
      const playedTids = new Set()
      for (const g of newGamesArr) {
        if (g.team1Tid != null) playedTids.add(Number(g.team1Tid))
        if (g.team2Tid != null) playedTids.add(Number(g.team2Tid))
      }
      const seenByeRanks = new Set()
      for (const entry of byeRanks) {
        if (!entry || typeof entry.tid !== 'number') continue
        const r = entry.rank
        if (typeof r !== 'number' || r < 1 || r > 25) continue
        if (seenByeRanks.has(r)) continue
        if (playedTids.has(Number(entry.tid))) continue
        seenByeRanks.add(r)
        writeRankByWeek(entry.tid, currentWeek, r)
      }
    }

    // (2) Each saved game stores the team's rank "during the game"
    // (entering-Wk N), read back from rankByWeek[weekNum]. The screenshot
    // the AI parsed shows the user's CURRENT poll (entering-currentWeek),
    // which we already wrote to rankByWeek[currentWeek] in step (1).
    // For the Wk N game record we want the historical entering-Wk N rank
    // — that was set on the prior save when the user was in dynasty Wk N.
    const rankedGamesArr = newGamesArr.map(g => {
      const { _team1CurrentWeekRank: _t1, _team2CurrentWeekRank: _t2, ...rest } = g
      return {
        ...rest,
        team1Rank: readRankByWeek(g.team1Tid, weekNum),
        team2Rank: readRankByWeek(g.team2Tid, weekNum),
      }
    })

    // Build the final games array — preserved games (filtered) plus
    // the freshly built rankedGamesArr. Each game in rankedGamesArr already
    // has team1Rank/team2Rank set directly from the AI's row in step
    // (2) above; existing games (like the user's schedule-flow game)
    // keep whatever ranks they already had.
    const updatedGames = [...filtered, ...rankedGamesArr]

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
        bumpSkipCount(3)
        skipListenerTimestampRef.current = Date.now()
        lastGamesUpdateTimestampRef.current = Date.now()
        lastGamesUpdateDynastyIdRef.current = dynastyId

        // Step 1: targeted batch write for the changed games.
        // newGamesArr = inserts/replaces this save produced.
        // droppedWeeklyIds = stale rows being replaced or removed.
        await settleOrProceed(saveWeeklyGamesChanges(dynastyId, newGamesArr, droppedWeeklyIds), 10000, `saveWeeklyScores(${dynastyId})`)

        // Step 2: persist non-games fields via updateDynasty with
        // skipGamesSubcollection=true so the slow full-rewrite is
        // skipped. teams + weeklyScoresEntered land on the main doc.
        //
        // Document-size guard. Firestore caps single docs at 1 MiB.
        // dynasty.teams carries every team's byYear[*].rankByWeek +
        // coachingStaff + record across all years — on a 20-year,
        // 134-team dynasty it can creep toward the cap and silently
        // fail the write. We warn at 800 KB (80% of cap) and toast
        // at 950 KB (within striking distance) so the user has a
        // chance to investigate before a save blows up. Phase 1 of
        // a planned subcollection split — the migration to per-team-
        // per-year subdocs is pending; this guard makes the failure
        // mode visible in the meantime.
        try {
          const TEAMS_DOC_SOFT_LIMIT = 800 * 1024
          const TEAMS_DOC_HARD_WARN = 950 * 1024
          const size = new Blob([JSON.stringify(teamsCopy)]).size
          if (size >= TEAMS_DOC_HARD_WARN) {
            console.warn(`[saveWeeklyScores] dynasty.teams payload is ${(size / 1024).toFixed(0)} KB — within ${((1024 * 1024 - size) / 1024).toFixed(0)} KB of Firestore's 1 MiB single-doc cap. The next several weekly saves may fail. Subcollection split is pending.`)
            try {
              toast?.warning?.(`Dynasty data nearing Firestore size limit (${(size / 1024).toFixed(0)} KB / 1024 KB). Saves may start failing soon — please contact support.`, { duration: 12000 })
            } catch {/* toast may not be available in every code path */}
          } else if (size >= TEAMS_DOC_SOFT_LIMIT) {
            console.warn(`[saveWeeklyScores] dynasty.teams payload is ${(size / 1024).toFixed(0)} KB — approaching the 1 MiB cap. (Threshold ${(TEAMS_DOC_SOFT_LIMIT / 1024).toFixed(0)} KB.)`)
          }
        } catch {/* size estimate is best-effort; never block the save */}

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
        console.error('[saveWeeklyScores] Targeted batch write failed, falling back to safe cloud path:', error)
        // Cloud fallback: retry the targeted batch write (same approach, avoids
        // the dangerous full-array rewrite that can orphan-delete games that
        // were committed to Firestore between the time we read existingGames
        // (cache-first) and when the fallback write runs).
        try {
          bumpSkipCount(3)
          skipListenerTimestampRef.current = Date.now()
          await settleOrProceed(saveWeeklyGamesChanges(dynastyId, rankedGamesArr, droppedWeeklyIds), 10000, `saveWeeklyScores:ranked(${dynastyId})`)
          await updateDynasty(dynastyId, {
            teams: teamsCopy,
            weeklyScoresEntered: updatedTracker,
          }, { skipGamesSubcollection: true })
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
          return newGamesArr
        } catch (retryError) {
          console.error('[saveWeeklyScores] Cloud retry also failed:', retryError)
          // Fall through to the local-storage path below only for non-cloud dynasties.
          if (isCloudStorage) throw retryError
        }
      }
    }

    // Legacy / local-storage path: full-array updateDynasty (writes to
    // IndexedDB only — safe because IndexedDB is local and has no orphan
    // deletion concept). For cloud dynasties this is never reached (the
    // cloud fast-path or its retry both throw on failure rather than
    // risking a stale-array overwrite of Firestore subcollection games).
    await updateDynasty(dynastyId, {
      games: updatedGames,
      teams: teamsCopy,
      weeklyScoresEntered: updatedTracker,
    })

    return newGamesArr
  }

  // Write an AP Poll snapshot to rankByWeek for a specific week slot.
  // Used by bowl-week modals after saving game scores — identical to the
  // rank pass inside saveWeeklyScores but without the game-creation logic.
  // rankings: [{ tid, rank }]  — tid may be null if abbr lookup failed
  // rankWeek: integer week slot (16=BowlWk1, 17=BowlWk2, 18=NatChamp)
  const saveRankings = async (dynastyId, rankings, year, rankWeek) => {
    if (blockIfReadOnly(dynastyId, 'save rankings')) return
    if (!Array.isArray(rankings) || rankings.length === 0) return
    const rankWeekNum = Number(rankWeek)
    if (!Number.isFinite(rankWeekNum) || rankWeekNum <= 0) return
    const dynasty = await findDynastyById(dynastyId)
    if (!dynasty) return
    const yearNum = Number(year)

    // Write each ranked team's slot as a dot-path field so concurrent rank/team
    // edits in a shared dynasty MERGE instead of overwriting the whole teams map
    // (last-write-wins). updateDynasty expands dot-notation for local storage and
    // passes it through as a Firestore field-path merge for cloud.
    const updates = {}
    for (const { tid, rank } of rankings) {
      if (tid == null || typeof rank !== 'number' || rank < 1 || rank > 25) continue
      updates[`teams.${tid}.byYear.${yearNum}.rankByWeek.${rankWeekNum}`] = rank
    }
    if (!Object.keys(updates).length) return

    await updateDynasty(dynastyId, updates)
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

        // TERTIARY: Find by bowlName on the existing shell. The QF shells
        // get a bowlName at creation time (set from cfpBowlConfigByYear), so
        // a row coming back from the BW2 sheet with bowlName="Cotton Bowl"
        // can find the right shell directly — useful when seed1 didn't
        // make it through the call chain (older callers, or AI output that
        // mangled the team-2 lookup). The PRIMARY/SECONDARY paths still
        // win when they hit; this is the safety net.
        if (existingIndex === -1 && gameData.bowlName) {
          existingIndex = updatedGames.findIndex(g =>
            g.isCFPQuarterfinal &&
            Number(g.year) === Number(year) &&
            g.bowlName &&
            g.bowlName.toLowerCase() === gameData.bowlName.toLowerCase()
          )
        }

        // QUATERNARY: Find by bye seed team tid (in case shell doesn't have correct ID)
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

    // OPTIMIZED targeted write — mirrors saveCPUBowlGames. The default
    // updateDynasty({ games }) path was the cause of the "page not responsive"
    // freeze on bowl-week saves: it synchronously deep-clones the ENTIRE games
    // array (removeUndefined + sanitizeForFirestore over every box score) and,
    // on cloud, reads + rewrites every game doc with deleteOrphans. CFP only
    // ever touches a handful of bracket games, so we diff against storage and
    // write just those. Unchanged games keep their original object reference
    // (updatedGames is a shallow copy with targeted index replacement, and
    // propagateCFPWinner returns a fresh array), so reference inequality is a
    // safe, COMPLETE change-detector — it captures bracket propagation and
    // newly-created shells, while excluding the untouched bulk of the history.
    const isCloudDynasty = dynasty.storageType === 'cloud'
    const beforeById = new Map(latestGames.map(g => [String(g.id), g]))
    const changedGames = updatedGames.filter(g => g?.id && beforeById.get(String(g.id)) !== g)

    if (isCloudDynasty && dynasty._subcollectionsMigrated && changedGames.length > 0) {
      try {
        const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now())
        bumpSkipCount(3)
        skipListenerTimestampRef.current = Date.now()
        lastGamesUpdateTimestampRef.current = Date.now()
        lastGamesUpdateDynastyIdRef.current = dynastyId

        await settleOrProceed(saveWeeklyGamesChanges(dynastyId, changedGames, []), 10000, `saveCFPGames(${dynastyId})`)
        lastGamesUpdateTimestampRef.current = Date.now()

        // Update local React state with the full games list (cheap vs. the
        // O(all games) Firestore rewrite we just avoided).
        const updatedDynasty = { ...dynasty, games: updatedGames, lastModified: Date.now() }
        setDynasties(prev => prev.map(d =>
          String(d.id) === String(dynastyId) ? updatedDynasty : d
        ))
        if (String(currentDynasty?.id) === String(dynastyId)) {
          setCurrentDynasty(updatedDynasty)
        }

        const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now())
        console.log(`[saveCFPGames] Targeted write: ${changedGames.length} changed of ${updatedGames.length} total game(s) in ${Math.round(t1 - t0)}ms (${roundType})`)
        return gamesData
      } catch (error) {
        console.error('[saveCFPGames] Targeted batch failed, falling back to full-array rewrite:', error)
        // Fall through to the safe full rewrite below.
      }
    }

    const tFull0 = (typeof performance !== 'undefined' ? performance.now() : Date.now())
    await updateDynasty(dynastyId, { games: updatedGames })
    const tFull1 = (typeof performance !== 'undefined' ? performance.now() : Date.now())
    console.log(`[saveCFPGames] Full-array rewrite of ${updatedGames.length} game(s) in ${Math.round(tFull1 - tFull0)}ms (${roundType}, ${isCloudDynasty ? 'cloud-fallback' : 'local'})`)

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

    // Get user's team tid for this year. Member (non-owner) uses their own
    // team; owner keeps year-accurate coachTeamByYear (job-change history).
    const userTidForYear = (user?.uid && dynasty.userId !== user.uid ? activeUserTid : null) || dynasty.coachTeamByYear?.[year]?.tid || getCurrentTeamTid(dynasty)

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
    // Always preserve the user's existing CC game regardless of whether the sheet includes
    // their conference. When the sheet DOES include the user's conf we patch the scores/ranks
    // into the preserved game rather than replacing it with a sparse new entry — this keeps
    // gameNote, links, id, createdAt, and any other rich data the user entered.
    const shouldPreserveUserCCGame = !!userCCGame

    // Filter out existing conference championship games for this year to avoid duplicates
    // EXCEPT preserve user's CC game unconditionally
    const filteredGames = existingGames.filter(g => {
      // Keep games from different years
      if (Number(g.year) !== Number(year)) return true
      // Keep non-CC games
      if (!g.isConferenceChampionship) return true
      // Always preserve user's CC game — we'll patch scores into it below if the sheet
      // includes their conference
      if (shouldPreserveUserCCGame) {
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

    // If the sheet includes the user's conference, patch the preserved game in-place with
    // the sheet's scores/ranks instead of letting newGames create a competing sparse entry.
    const userConfCCFromSheet = (userCCGame && championshipsIncludesUserConf)
      ? championships.find(cc => cc.conference?.toLowerCase() === userCCGame.conference?.toLowerCase())
      : null
    if (userConfCCFromSheet) {
      const pT1Tid = userConfCCFromSheet.team1Tid || getTidFromAbbr(userConfCCFromSheet.team1, dynasty)
      const pT2Tid = userConfCCFromSheet.team2Tid || getTidFromAbbr(userConfCCFromSheet.team2, dynasty)
      const pT1Score = parseInt(userConfCCFromSheet.team1Score)
      const pT2Score = parseInt(userConfCCFromSheet.team2Score)
      const pR1 = userConfCCFromSheet.team1Rank != null ? parseInt(userConfCCFromSheet.team1Rank, 10) : null
      const pR2 = userConfCCFromSheet.team2Rank != null ? parseInt(userConfCCFromSheet.team2Rank, 10) : null
      const pWinnerTid = pT1Score > pT2Score ? pT1Tid : pT2Tid
      const patchIdx = filteredGames.findIndex(g =>
        g.id === userCCGame.id ||
        (g.isConferenceChampionship && Number(g.year) === Number(year) &&
         g.conference?.toLowerCase() === userCCGame.conference?.toLowerCase()))
      if (patchIdx >= 0) {
        filteredGames[patchIdx] = {
          ...filteredGames[patchIdx],
          team1Tid: pT1Tid,
          team2Tid: pT2Tid,
          team1Score: pT1Score,
          team2Score: pT2Score,
          winnerTid: pWinnerTid,
          ...(pR1 >= 1 && pR1 <= 25 ? { team1Rank: pR1 } : {}),
          ...(pR2 >= 1 && pR2 <= 25 ? { team2Rank: pR2 } : {}),
        }
        console.log('[saveCPUCC] Patched scores into preserved user CC game for:', userCCGame.conference)
      }
    }

    // Create game entries for each conference championship game
    // UNIFIED FORMAT: Use tid-based fields, no legacy userTeam/opponent/teamScore/opponentScore/result
    const newGames = championships
      .filter(cc => {
        // Only process games with valid data
        if (!cc.team1 || !cc.team2) return false
        if (cc.team1Score === null || cc.team1Score === undefined) return false
        if (cc.team2Score === null || cc.team2Score === undefined) return false
        // Skip user's conference — already handled by patching the preserved game above
        if (userCCGame && cc.conference?.toLowerCase() === userCCGame.conference?.toLowerCase()) return false
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

        const r1 = cc.team1Rank != null ? parseInt(cc.team1Rank, 10) : null
        const r2 = cc.team2Rank != null ? parseInt(cc.team2Rank, 10) : null
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
          // Rankings at time of game
          ...(r1 >= 1 && r1 <= 25 ? { team1Rank: r1 } : {}),
          ...(r2 >= 1 && r2 <= 25 ? { team2Rank: r2 } : {}),
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

  // Multi-year save flow for the Conference Championships History sheet.
  // Takes `byYear` shaped as { [year]: championships[] } (the output of
  // readConferenceChampionshipsHistoryFromSheet) and writes ALL years in
  // a single updateDynasty call.
  //
  // This is an "edit history" flow — the sheet is the source of truth.
  // Each year's pass FULLY WIPES that year's existing CC games and replaces
  // them with whatever the sheet dictates. No user-game preservation, no
  // partial overlays — the sheet wins. (Earlier iterations preserved the
  // user's CC game when its conference row read blank, which broke
  // re-submissions where the user was fixing a wrong conference mapping:
  // the stale user game survived the wipe and shadowed the corrected entry
  // through dedup. Re-saving the sheet now overwrites cleanly every time.)
  //
  // Running every year in a single updateDynasty call (instead of one call
  // per year) avoids the React-state staleness window where a second
  // call's findDynastyById would still see the pre-write currentDynasty.
  //
  // Returns: { yearsApplied: number[], gameCountsByYear: { [year]: number } }
  const saveConferenceChampionshipsHistoryFromSheet = async (dynastyId, byYear) => {
    if (blockIfReadOnly(dynastyId, 'save conference championships history')) return

    const dynasty = await findDynastyById(dynastyId)
    if (!dynasty) {
      console.error('[saveCCHistory] Dynasty not found:', dynastyId)
      return
    }

    const existingGames = await getDynastyGames(dynasty)
    const yearsApplied = []
    const gameCountsByYear = {}

    // CCG detection that survives partial data — some legacy/imported games
    // only set one of the two flags, so checking either keeps the wipe
    // exhaustive.
    const isCCGEntry = (g) =>
      g?.isConferenceChampionship === true ||
      g?.gameType === GAME_TYPES.CONFERENCE_CHAMPIONSHIP

    // Start from the full existing games array and apply each year's
    // edits in turn. Each year's pass: remove ALL of that year's CC games,
    // then append the filtered/converted new games.
    let runningGames = [...existingGames]

    for (const yearKey of Object.keys(byYear || {})) {
      const year = Number(yearKey)
      if (!Number.isFinite(year)) continue
      const championships = Array.isArray(byYear[yearKey]) ? byYear[yearKey] : []

      // Member (non-owner) uses their own team; owner keeps year-accurate history.
      const userTidForYear = (user?.uid && dynasty.userId !== user.uid ? activeUserTid : null) || dynasty.coachTeamByYear?.[year]?.tid || getCurrentTeamTid(dynasty)

      const filtered = runningGames.filter(g => {
        if (Number(g.year) !== Number(year)) return true
        if (!isCCGEntry(g)) return true
        return false // drop every CC game for this year — sheet is authoritative
      })

      const newGamesForYear = championships
        .filter(cc => {
          if (!cc?.team1 || !cc?.team2) return false
          if (cc.team1Score === null || cc.team1Score === undefined) return false
          if (cc.team2Score === null || cc.team2Score === undefined) return false
          return true
        })
        .map(cc => {
          const team1Tid = cc.team1Tid || getTidFromAbbr(cc.team1, dynasty)
          const team2Tid = cc.team2Tid || getTidFromAbbr(cc.team2, dynasty)
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
            team1Tid,
            team2Tid,
            team1Score,
            team2Score,
            homeTeamTid: null,
            winnerTid,
            gameNote: cc.gameNote || '',
            links: cc.links || '',
            createdAt: new Date().toISOString(),
          }
        })

      // Deduplicate this year's new entries by conference (prefer the
      // entry involving the user's team if there's a collision).
      const seenConfKeys = new Map()
      const dedupedNew = []
      for (const game of newGamesForYear) {
        const key = `cc-${game.year}-${game.conference?.toLowerCase()}`
        if (seenConfKeys.has(key)) {
          const existingIdx = seenConfKeys.get(key)
          const thisIsUserGame = (game.team1Tid === userTidForYear || game.team2Tid === userTidForYear)
          const existingIsUserGame = (dedupedNew[existingIdx].team1Tid === userTidForYear ||
                                      dedupedNew[existingIdx].team2Tid === userTidForYear)
          if (thisIsUserGame && !existingIsUserGame) {
            dedupedNew[existingIdx] = game
          }
          continue
        }
        seenConfKeys.set(key, dedupedNew.length)
        dedupedNew.push(game)
      }

      runningGames = [...filtered, ...dedupedNew]
      yearsApplied.push(year)
      gameCountsByYear[year] = dedupedNew.length
    }

    await updateDynasty(dynastyId, { games: runningGames })

    return { yearsApplied, gameCountsByYear }
  }

  const advanceWeek = async (dynastyId, classConfirmations = {}) => {
    if (blockIfReadOnly(dynastyId, 'advance week')) return
    if (blockIfNotCommish(dynastyId, 'advance the week')) return
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
      // After Week 14, move to Conference Championship Week. EA's calendar
      // is 15 regular-season weeks (0-14), then a dedicated CCG week, then
      // bowls/CFP. The earlier `nextWeek > 15` cap was off-by-one and let
      // a phantom Week 15 exist as a regular-season slot — that's the
      // bug being fixed. CCG week itself isn't numbered; it just lives
      // under the conference_championship phase with currentWeek=1.
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

      // Apply new job if user accepted one during postseason.
      //
      // OWNER-SCOPED: newJobData is the dynasty-level (owner) answer. In a
      // shared league a MEMBER's answer must never drive this block — it
      // swaps the dynasty's PRIMARY team (teamName/currentTid/schedule/…).
      // Member answers live uid-keyed in newJobDataByUser and are applied to
      // their memberTeams slot below. A legacy answer with no uid stamp is
      // treated as the owner's (pre-shared-league behavior).
      const rawNewJobData = dynasty.newJobData
      const newJobData = (rawNewJobData && (rawNewJobData.uid == null || rawNewJobData.uid === dynasty.userId))
        ? rawNewJobData
        : null

      // Member job moves: a uid-keyed accepted job switches that member's
      // team slot (memberTeams drives activeUserTid for members) — the
      // dynasty's primary team is untouched. Entry cleared after applying.
      const jobsByUser = dynasty.newJobDataByUser || {}
      for (const [uid, jd] of Object.entries(jobsByUser)) {
        if (!jd?.takingNewJob || !jd.team || !jd.position) continue
        if (uid === dynasty.userId) continue // owner uses the full swap path
        const memberNewTid = jd.teamTid ?? getTidFromTeamName(jd.team, dynasty.teams)
        if (memberNewTid == null) continue
        const curArr = Array.isArray(dynasty.memberTeams?.[uid]) ? dynasty.memberTeams[uid].map(Number) : []
        const fromTid = jd.fromTid != null ? Number(jd.fromTid) : null
        let nextArr
        if (curArr.length <= 1) nextArr = [Number(memberNewTid)]
        else if (fromTid != null && curArr.includes(fromTid)) nextArr = curArr.map(t => (t === fromTid ? Number(memberNewTid) : t))
        else nextArr = [...curArr.filter(t => t !== Number(memberNewTid)), Number(memberNewTid)]
        additionalUpdates[`memberTeams.${uid}`] = Array.from(new Set(nextArr))
        additionalUpdates[`newJobDataByUser.${uid}`] = null
      }

      if (newJobData?.takingNewJob && newJobData.team && newJobData.position) {
        // Prefer the canonical newJobData.teamTid (stored at pick time);
        // fall back to resolving the legacy team-name field. All display
        // values derive from dynasty.teams[tid] — the only source of truth.
        const newTeamTid = newJobData.teamTid ?? getTidFromTeamName(newJobData.team, dynasty.teams)
        const resolvedNewTeam = newTeamTid != null ? dynasty.teams?.[newTeamTid] : null
        const newTeamName = resolvedNewTeam?.name || getTeamName(newJobData.team, dynasty.teams)
        const newTeamAbbr = resolvedNewTeam?.abbr || getAbbrFromTeamName(newJobData.team, dynasty.teams) || newJobData.team
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
        // Full coaches-map snapshot — the job swap edits a controlled coach's
        // byYear; capturing the whole map makes revert a clean restore.
        const _coachesSnapshot =
          dynasty.coaches != null
            ? JSON.parse(JSON.stringify(dynasty.coaches))
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
          coaches: _coachesSnapshot,
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
            // Keep the userId flip ATOMIC with the teamName / currentTid /
            // conference update above — that update only runs for a COMPLETE
            // accepted job (takingNewJob + team + position). So the team-flag
            // flip must use the SAME condition. Otherwise a declined job, or a
            // half-finished selection (team picked but no position), would let
            // applyPendingUserTeam switch `userId` to the new team while
            // currentTid/teamName stay on the old one — a divergence that makes
            // getUserTeamTid and currentTid disagree and corrupts the save.
            const jobAccepted = !!(newJobData?.takingNewJob && newJobData.team && newJobData.position)
            if (!jobAccepted) {
              // No complete accepted job this cycle — strip any pending marker
              // so the flip below is a no-op and the team does NOT change.
              teamsBeforeFlip = clearPendingUserTeam(teamsBeforeFlip)
            } else {
              // FALLBACK: the job is accepted but no pendingUserId is set
              // (e.g. saves from before the marker existed) — set it now so the
              // flip matches the teamName/currentTid update above.
              const hasPendingUser = Object.values(teamsBeforeFlip).some(t => t.pendingUserId === 'currentUser')
              if (!hasPendingUser) {
                const newTeamTid = newJobData.teamTid ?? getTidFromTeamName(newJobData.team, teamsBeforeFlip)
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
                // Legacy mirror (kept for fallback / read-compat).
                additionalUpdates.memberTeamHistory = snapshotAllMembersForYear(
                  dynasty,
                  seasonThatJustEnded,
                )

                // Coach entity (source of truth): advance the owner's ACTIVE
                // coach onto the new team for the UPCOMING season. The ended
                // season's byYear stays on the old team so its games keep
                // attributing there; the new team is keyed to nextSeason so we
                // never overwrite the season that just finished.
                const oldTid = Number(dynasty.currentTid)
                const activeCoach =
                  getActiveCoachForTeam(dynasty, ownerUid, oldTid, seasonThatJustEnded) ||
                  getCoachesControlledBy(dynasty, ownerUid)[0] || null
                if (activeCoach) {
                  const nextSeason = seasonThatJustEnded + 1
                  const updatedCoach = setCoachSeason(activeCoach, nextSeason, {
                    teamTid: newUserTid,
                    role: newJobData.position || 'HC',
                    hiredVia: 'carousel',
                  })
                  const nextCoaches = { ...getCoaches(dynasty), [activeCoach.cid]: updatedCoach }
                  additionalUpdates.coaches = nextCoaches
                  // Re-derive the security index from the updated coaches, merged
                  // over the existing index so no member is dropped.
                  additionalUpdates.memberTeams = {
                    ...(dynasty.memberTeams || {}),
                    ...deriveMemberTeamsIndex({
                      ...dynasty,
                      currentYear: seasonThatJustEnded,
                      coaches: nextCoaches,
                    }),
                  }
                }
              }

              // Fallback memberTeams swap when there was no coach to advance
              // (un-migrated edge) — keeps the live team correct regardless.
              if (additionalUpdates.memberTeams === undefined) {
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
          }
        } catch (err) {
          console.error('Error applying pending user team:', err)
        }

        // Clear newJobData
        additionalUpdates.newJobData = null
      }
    } else if (dynasty.currentPhase === 'offseason' && dynasty.currentWeek === 4 && nextWeek === 5) {
      console.log('[advanceWeek] *** ENTERING WEEK 4→5 TRANSITION (SIGNING DAY / YEAR FLIP) ***')

      // YEAR FLIP - Happens when entering Signing Day (week 5)
      // The year changes here so that team pages for the new year become available
      // CRITICAL: Use Number() to ensure proper arithmetic (currentYear could be string from Firestore)
      nextYear = Number(dynasty.currentYear) + 1
      console.log('[advanceWeek] Year flip:', dynasty.currentYear, '→', nextYear)

      // ARCHIVE THE DEPTH CHART FOR THE SEASON THAT JUST ENDED.
      // The depth chart has two stores: past seasons read from
      // depthChartByYear[tid][year], while the current + future years share
      // the forward-projection plan teamFuture[tid]. Without this snapshot,
      // the moment the year flips the season you just played becomes a "past
      // year" with nothing archived — its depth chart reads back empty and
      // the 2-deep you built all season is gone. Copy every team's plan into
      // the per-season store, keyed to the season that just ended, so you can
      // always go back and see how the depth chart looked that year.
      // teamFuture carries forward untouched as the new current-year plan.
      // Never overwrite an existing archive (a user may have already edited
      // that season's chart directly).
      try {
        const seasonEnding = Number(dynasty.currentYear)
        const teamFutureNow = dynasty.teamFuture || {}
        if (Number.isFinite(seasonEnding) && Object.keys(teamFutureNow).length > 0) {
          const dcByYear = { ...(dynasty.depthChartByYear || {}) }
          let archived = 0
          for (const [tidKey, plan] of Object.entries(teamFutureNow)) {
            if (!plan || typeof plan !== 'object' || Object.keys(plan).length === 0) continue
            const existingForTeam = dcByYear[tidKey] || {}
            if (existingForTeam[seasonEnding] != null) continue // already archived
            dcByYear[tidKey] = { ...existingForTeam, [seasonEnding]: JSON.parse(JSON.stringify(plan)) }
            archived++
          }
          if (archived > 0) {
            additionalUpdates.depthChartByYear = dcByYear
            console.log(`[advanceWeek] Archived ${archived} depth chart(s) for ${seasonEnding}`)
          }
        }
      } catch (err) {
        console.error('[advanceWeek] Error archiving depth charts:', err)
      }

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
      // Only fall back to NAME matching for leaving entries that have NO pid.
      // Every leaving entry from the modal already carries a pid, so the pid
      // check below is authoritative; matching by name too dropped unrelated
      // returning players who merely shared a name with a departing player
      // (common across a full league's CPU rosters — a graduating "Chris
      // Jackson" would drop a returning freshman "Chris Jackson").
      const leavingNames = new Set(
        playersLeavingList.filter(p => !p.pid).map(p => p.name?.toLowerCase().trim()).filter(Boolean)
      )
      console.log('[advanceWeek] Players Leaving count:', playersLeavingList.length)

      // Every team a member controls is a first-class roster that must
      // progress exactly like the commish's own (redshirt-aware class
      // progression + carry-over), NOT the lighter "simple aging" CPU path.
      // Build the set of member-controlled tids (commish's own team included).
      const memberTidSet = new Set()
      if (teamTid != null) memberTidSet.add(Number(teamTid))
      for (const tids of Object.values(dynasty.memberTeams || {})) {
        for (const t of (Array.isArray(tids) ? tids : [])) {
          const n = Number(t); if (Number.isFinite(n)) memberTidSet.add(n)
        }
      }
      // The member-controlled team this player was on last season, or null
      // (null ⇒ a CPU team, which keeps the lighter simple-aging path).
      const memberTeamOf = (player) => {
        for (const t of memberTidSet) {
          // MUST pass `dynasty` — otherwise a teambuilder-renamed slot or a
          // legacy roster that stored teamsByYear as an abbr STRING fails to
          // resolve (isPlayerOnRoster falls back to the static registry abbr),
          // returns false for every player, and the ENTIRE roster is misrouted
          // to the lossy CPU "simple aging" path (which drops all seniors). That
          // emptied next-year rosters on imported/teambuilder dynasties.
          if (isPlayerOnRoster(player, t, previousSeasonYear, dynasty)) return t
        }
        return null
      }

      // Teambuilder imports have been observed leaving isRecruit:true stuck on
      // players who have multiple seasons of teamsByYear entries — Jay's STONY
      // dynasty had 20 players with isRecruit:true who'd been on the roster
      // since 2027. The skip-recruits guards below would silently drop them
      // every year flip. Treat the flag as stale (i.e. the player is NOT
      // actually a new recruit) when any prior teamsByYear entry exists.
      const isStaleRecruitFlag = (player) => {
        if (!player.isRecruit) return false
        const tby = player.teamsByYear || {}
        for (const yKey of Object.keys(tby)) {
          const y = Number(yKey)
          if (Number.isFinite(y) && y <= previousSeasonYear) return true
        }
        return false
      }

      // Helper to check if player is leaving. The leaving-list checks stay
      // here; the movement-record checks (legacy movements[] + v2
      // movementByYear, incl. prior-year departures with no later return)
      // live in the module-scope hasUnresolvedDeparture so that
      // advanceToNewSeason applies the exact same departure rule — it
      // previously only consulted the leaving list, which is what let
      // movement-recorded departures get carried back onto the roster.
      const isPlayerLeaving = (player, homeTid = teamTid) => {
        // Recommit override runs BEFORE the list checks — a player who
        // recommitted after entering the portal isn't leaving even if a
        // stale leaving-list entry still names them.
        if (hasRecommitForYear(player, previousSeasonYear)) return false

        if (leavingPids.has(player.pid)) return true
        if (player.name && leavingNames.has(player.name.toLowerCase().trim())) return true

        return hasUnresolvedDeparture(player, homeTid, previousSeasonYear, dynasty)
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

        // Skip recruits (they're handled at week 7→8). isStaleRecruitFlag
        // unsticks the flag so imported players who've been on the roster for
        // years aren't treated as never-played recruits.
        if (player.isRecruit && !isStaleRecruitFlag(player)) {
          recruitsSkipped++
          return player
        }

        // Skip players who already have nextYear set (already processed)
        const hasNextYear = player.teamsByYear?.[nextYear] ?? player.teamsByYear?.[String(nextYear)]

        if (hasNextYear) {
          alreadyHadNextYear++
          return player
        }

        // Which member-controlled team was this player on last season?
        // null ⇒ a CPU team → lighter simple-aging path below. Any member
        // team (commish OR another member) → full redshirt-aware path.
        const playerMemberTid = memberTeamOf(player)
        if (playerMemberTid == null) {
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

          // Determine the prior-season class via the canonical progression
          // walker. It handles sparse classByYear (e.g. a transfer whose senior
          // year was never recorded) and returns null once a player walks past
          // Sr — so we no longer rely on the stale top-level player.year, which
          // caused transfers to be advanced into an EXTRA senior season instead
          // of graduating (e.g. a Jr-in-2033 transfer reappearing as a senior in
          // both 2034 and 2035).
          const priorClass = getPlayerClassForYear(player, previousSeasonYear)
          const hasClassHistory = !!(player.classByYear && Object.keys(player.classByYear).length)

          // Graduate (don't carry to nextYear) when eligibility is exhausted, or
          // when the walker already places them past Sr.
          if (priorClass === 'Sr' || priorClass === 'RS Sr' || (priorClass == null && hasClassHistory)) {
            return player
          }

          // Not graduating - advance their class
          const otherTeamClass = priorClass || player.year
          // Defensive: if a CPU player has neither classByYear nor player.year,
          // otherTeamClass is undefined and this would write year/classByYear
          // as undefined. Keep whatever class already exists rather than
          // stamping an undefined over it.
          const newOtherClass = CLASS_PROGRESSION[otherTeamClass] || otherTeamClass || player.year || null

          // Get their current team tid from teamsByYear
          let otherTeamTid = player.teamsByYear?.[previousSeasonYear] ||
                         player.teamsByYear?.[String(previousSeasonYear)] ||
                         player.team
          // Keep teamsByYear tid-pure: if the only source was a legacy abbr
          // string on player.team, resolve it to a tid so we don't leak an abbr
          // into the new season (readers still normalize, but membership by tid
          // is the invariant).
          if (typeof otherTeamTid === 'string' && !/^\d+$/.test(otherTeamTid)) {
            otherTeamTid = getTidFromAbbr(otherTeamTid, dynasty) ?? otherTeamTid
          }

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

        // Check if player is leaving (evaluated against THEIR team)
        if (isPlayerLeaving(player, playerMemberTid)) {
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
            [nextYear]: playerMemberTid
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
      // Read each team's canonical per-team conference from the prior
      // year and write it directly to the next year's per-team field.
      //
      // IMPORTANT: We iterate dynasty.teams (ALL teams), NOT
      // additionalUpdates.teams which may be a partial patch containing
      // only the user's team from an earlier step in this function.
      // ============================================================
      {
        const baseTeams = dynasty.teams || {}
        const localTeamsPatch = {}
        let carryCount = 0

        for (const [tid, team] of Object.entries(baseTeams)) {
          // Read the canonical conference for the previous year.
          const prevConf = team?.byYear?.[previousSeasonYear]?.conference
            ?? team?.byYear?.[String(previousSeasonYear)]?.conference
          if (!prevConf) continue

          // Only write if the next year's conference hasn't been set yet.
          // (preserves any conference changes the user made for next year already)
          const alreadySet = team?.byYear?.[nextYear]?.conference
            ?? team?.byYear?.[String(nextYear)]?.conference
          if (alreadySet) continue

          // Build a minimal patch — only touch byYear, don't clobber other fields.
          if (!localTeamsPatch[tid]) {
            localTeamsPatch[tid] = {
              ...team,
              byYear: { ...(team.byYear || {}) },
            }
          }
          const yearData = localTeamsPatch[tid].byYear[nextYear] || {}
          const nextData = { ...yearData, conference: prevConf }
          // Carry the team's division forward too (if the conference is split).
          const prevDiv = team?.byYear?.[previousSeasonYear]?.division
            ?? team?.byYear?.[String(previousSeasonYear)]?.division
          if (prevDiv && !yearData.division) nextData.division = prevDiv
          localTeamsPatch[tid].byYear[nextYear] = nextData
          carryCount++
        }

        if (carryCount > 0) {
          console.log(`[advanceWeek] Carried forward conferences for ${carryCount} teams from ${previousSeasonYear} → ${nextYear}`)
          // Merge: full dynasty.teams base → any earlier additionalUpdates.teams → conference patch.
          // This ensures no team from additionalUpdates.teams is clobbered.
          additionalUpdates.teams = {
            ...(dynasty.teams || {}),
            ...(additionalUpdates.teams || {}),
            ...localTeamsPatch,
          }
        }

        // Also keep the legacy bulk stores in sync. We resolve the previous
        // year's alignment (using the base-map + overlay algorithm, which
        // reads from the pre-advance dynasty state) and copy it forward.
        // This ensures legacy readers (old code paths, export tools) still
        // see correct data even on dynasties that haven't run the migration.
        const resolvedMap = getCustomConferencesForYear(dynasty, previousSeasonYear)
        if (resolvedMap && Object.keys(resolvedMap).length > 0) {
          additionalUpdates.customConferencesByYear = {
            ...(dynasty.customConferencesByYear || {}),
            [nextYear]: resolvedMap,
          }
          additionalUpdates.customConferences = resolvedMap
        }

        // Carry the division definitions (which conferences are split + their
        // names) forward, unless next year already has its own definition.
        const divStore = dynasty.conferenceDivisionsByYear || {}
        const nextHasDivs = Object.prototype.hasOwnProperty.call(divStore, nextYear)
          || Object.prototype.hasOwnProperty.call(divStore, String(nextYear))
        if (!nextHasDivs) {
          const prevDivs = getConferenceDivisionsForYear(dynasty, previousSeasonYear)
          if (prevDivs && Object.keys(prevDivs).length > 0) {
            additionalUpdates.conferenceDivisionsByYear = {
              ...divStore,
              [nextYear]: prevDivs,
            }
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
    } else if (dynasty.currentPhase === 'offseason' && dynasty.currentWeek === 7 && nextWeek > 7) {
      // Week 7 (Conferences/Transfers — the last offseason week) → Preseason.
      // Collapsed 7-week model: this single transition does BOTH
      //   (a) recruit→player conversion (the old wk7→8 step), and
      //   (b) the move to preseason + cleanup (the old wk8→preseason step).
      // advanceToNewSeason runs just before this, in Layout's wk7 intercept.
      // (a) NOW convert recruits to active players (after Recruit Overalls entry)
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

      // (b) SEASON ADVANCEMENT to preseason — year already flipped at wk5→6.
      nextPhase = 'preseason'
      nextWeek = 0
      // nextYear stays the same (already set when entering week 6)

      // NOTE: do NOT null prevAdvanceToNewSeasonSnapshot here. In the old
      // 8-week model the snapshot was restorable at the intermediate wk8→wk7
      // revert; that stop no longer exists in the collapsed model, so the
      // snapshot must survive into preseason for the preseason→wk7 revert to
      // roll back advanceToNewSeason's writes.

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
    if (blockIfNotCommish(dynastyId, 'advance to a new season')) return
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
        // …unless the slot points at OUR team and the player has an
        // unresolved departure record. saveRoster/imports can seed the
        // new-season slot before the advance runs, which used to make a
        // departed player look "already processed" and keep them on the
        // roster. Strip the seeded year instead — same treatment the
        // encouraged-transfer branch above applies. (A slot pointing at a
        // DIFFERENT team is a Transfer Destination and stays untouched;
        // recommits return false from hasUnresolvedDeparture and are kept.)
        if (isTeamMatch(existingTeamForCurrentSeason) &&
            hasUnresolvedDeparture(player, teamTid, previousSeasonYear, dynasty,
              { excludeTeamsByYearYear: currentSeasonYear })) {
          const cleanedTeamsByYear = { ...(player.teamsByYear || {}) }
          delete cleanedTeamsByYear[currentSeasonYear]
          delete cleanedTeamsByYear[String(currentSeasonYear)]
          const draftInfo = draftByPid[player.pid]
          return {
            ...player,
            teamsByYear: cleanedTeamsByYear,
            draftRound: draftInfo?.draftRound || player.draftRound || null,
            draftPick: draftInfo?.draftPick || player.draftPick || null
          }
        }
        // Player already has a team for next season (set by Transfer Destinations or recommit)
        // Clear isRecruit if applicable (handles recommit players who have teamsByYear set but still have isRecruit: true)
        // Normalize to tid — teamsByYear can hold a legacy abbr string, but
        // player.team is canonically a tid (number). Writing the abbr through
        // would propagate stale data into a field downstream code treats as tid.
        const existingTeamTid = typeof existingTeamForCurrentSeason === 'number'
          ? existingTeamForCurrentSeason
          : getTidFromAbbr(existingTeamForCurrentSeason, dynasty) || existingTeamForCurrentSeason
        return {
          ...player,
          team: existingTeamTid,
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
      // A stale isRecruit:true flag (see "Skip recruits from other years"
      // below) would otherwise prevent an actual RS Sr from being marked
      // graduated.
      const hasPriorTeamYearForGrad = Object.keys(player.teamsByYear || {}).some(k => {
        const y = Number(k)
        return Number.isFinite(y) && y <= previousSeasonYear
      })
      const isGenuineRecruit = player.isRecruit && !hasPriorTeamYearForGrad
      // Auto-graduate BOTH exhausted-eligibility shapes — matching the CPU-team
      // path, which already graduates Sr and RS Sr alike. Previously only
      // RS Sr auto-graduated here, so a plain Sr not marked in Players Leaving
      // was carried into the new season and CLASS_PROGRESSION advanced them to
      // 'RS Sr' — the "my graduated seniors show as redshirts and I can't get
      // them off my roster" bug. A genuine 5th-year return (redshirt senior
      // resolved via the Fringe Case Class flow, which stamps an explicit
      // class for the NEW season) still plays: that stamp skips this gate.
      const resolvedNextClass = player.classByYear?.[currentSeasonYear]
        ?? player.classByYear?.[String(currentSeasonYear)]
      const eligibilityExhausted = previousSeasonClass === 'RS Sr'
        || (previousSeasonClass === 'Sr' && resolvedNextClass == null)
      if (eligibilityExhausted && !isGenuineRecruit) {
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

      // Skip recruits from other years. Treat isRecruit:true as stale (and
      // fall through to the normal carry-over block) when the player already
      // has prior-year teamsByYear entries — those aren't actually new
      // recruits, just imported players whose flag never got cleared. See
      // matching guard in the wk5→6 progression loop above.
      const hasPriorTeamYear = Object.keys(player.teamsByYear || {}).some(k => {
        const y = Number(k)
        return Number.isFinite(y) && y <= previousSeasonYear
      })
      if (player.isRecruit && !hasPriorTeamYear) return player

      // PRIMARY departure guard: honor movement-record departures before
      // carrying anyone forward. Departures recorded ONLY in movement
      // records — a Draft Results round for a player never pre-flagged
      // "Pro Draft" on the leaving sheet, a transfer/graduation marked in
      // the player editor, a prior-year departure — never make it into
      // leavingPids above. The Signing Day carryover already withholds
      // these players via its movementByYear check; without the SAME rule
      // here, this fall-through carry re-added them to the new season
      // ("players who would have left ended up just coming back").
      if (hasUnresolvedDeparture(player, teamTid, previousSeasonYear, dynasty,
            { excludeTeamsByYearYear: currentSeasonYear })) {
        const draftInfo = draftByPid[player.pid]
        return {
          ...player,
          draftRound: draftInfo?.draftRound || player.draftRound || null,
          draftPick: draftInfo?.draftPick || player.draftPick || null
        }
      }

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

    // Coach entities (source of truth): carry every controlled coach into the
    // new season (non-overwriting — a coach who took a new job keeps it), then
    // refresh the derived security index for the new current year. Merge over
    // the existing index so a member without a coach entity (migration edge)
    // never loses their game-write access.
    if (Number.isFinite(currentSeasonYear) && dynasty.coaches && Object.keys(dynasty.coaches).length) {
      const carried = carryForwardControlledCoaches(dynasty.coaches, currentSeasonYear)
      updates.coaches = carried
      updates.memberTeams = {
        ...(dynasty.memberTeams || {}),
        ...deriveMemberTeamsIndex({ ...dynasty, currentYear: currentSeasonYear, coaches: carried }),
      }
    }

    try {
      // Fast path for cloud dynasties: only a fraction of players actually
      // change during advance-to-new-season (recruits being converted,
      // class bumps, dev trait progression from training results). Sending
      // the full updatedPlayers array through updateDynasty routes
      // through savePlayersToSubcollection with deleteOrphans=true —
      // that's a full read of the players subcollection plus a re-write
      // of EVERY player doc. On long-running dynasties with 500+
      // accumulated players, this is the 5-10s lag the user reported
      // when advancing past Training Camp.
      //
      // Diff against the original players array (reference compare —
      // player.map returns same ref for unmodified players) and write
      // only the changed subset via saveChangedPlayers (single batched
      // setDoc, no orphan scan). Then call updateDynasty with the full
      // updatedPlayers array but skipPlayersSubcollection so local React
      // state still syncs without re-rewriting Firestore.
      //
      // Falls back to the legacy full-rewrite path on local-storage
      // dynasties OR if too many players changed (>500, the
      // saveChangedPlayers batch cap).
      const isCloud = dynasty.storageType === 'cloud'
      const changedPlayers = isCloud
        ? updatedPlayers.filter((p, i) => p !== players[i])
        : null

      if (isCloud && changedPlayers && changedPlayers.length <= 500) {
        try {
          // Listener-skip guards so the snapshot doesn't undo our
          // local players array with a stale subcollection read.
          bumpSkipCount(3)
          skipListenerTimestampRef.current = Date.now()
          lastPlayersUpdateTimestampRef.current = Date.now()
          lastPlayersUpdateDynastyIdRef.current = dynastyId

          if (changedPlayers.length > 0) {
            const currentYearForSync = dynasty?.currentYear
            const normalizedChanged = changedPlayers.map(p => syncDerivedFieldsFromV2(p, currentYearForSync))
            await settleOrProceed(saveChangedPlayers(dynastyId, normalizedChanged), 10000, `advanceToNewSeason(${dynastyId})`)
          }

          // Metadata write — full updatedPlayers passed for local state
          // sync; skipPlayersSubcollection prevents the slow re-write.
          await updateDynasty(dynastyId, updates, { skipPlayersSubcollection: true })
          console.log(`[advanceToNewSeason] Fast path: wrote ${changedPlayers.length} changed player(s) (of ${updatedPlayers.length}) in one batch`)
        } catch (err) {
          console.error('[advanceToNewSeason] Fast path failed, falling back to full updateDynasty:', err)
          await updateDynasty(dynastyId, updates)
        }
      } else {
        await updateDynasty(dynastyId, updates)
      }
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
    if (blockIfNotCommish(dynastyId, 'revert the week')) return
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
      // Preseason Week 0 → Previous Year's Offseason Week 7 (last offseason week
      // in the collapsed 7-week model — was week 8).
      if (currentYear <= startYear) {
        // Can't go back before the dynasty started
        // Cannot revert: at start of dynasty
        return
      }
      prevPhase = 'offseason'
      prevWeek = 7
      prevYear = currentYear - 1

      // CRITICAL: Restore recruits to isRecruit: true
      // At Week 7→Preseason, recruits were converted. We need to undo that:
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

      // Also undo advanceToNewSeason's writes. It runs at Layout's wk7 intercept
      // just before the wk7→preseason advance, capturing prevAdvanceToNewSeasonSnapshot.
      // In the old 8-week model this rollback happened at the intermediate wk8→wk7
      // revert; the collapsed model has no such stop, so we restore it here.
      const snapshot = dynasty.prevAdvanceToNewSeasonSnapshot
      if (snapshot) {
        additionalUpdates.isFirstYearOnCurrentTeam = snapshot.isFirstYearOnCurrentTeam
        additionalUpdates.coachingStaff = snapshot.coachingStaff
        additionalUpdates.pendingCoordinatorHires = snapshot.pendingCoordinatorHires
        additionalUpdates.customConferences = snapshot.customConferences

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

        additionalUpdates.prevAdvanceToNewSeasonSnapshot = null
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
      // Conference Championship Week 1 → Regular Season Week 14.
      // Regular season is 0-14 under the new model (15 weeks total).
      // Advance fires CC when nextWeek > 14, so Week 14 was the last
      // regular-season week. (Was prevWeek = 15 from when the model
      // had a phantom Week 15; reverting into that no-longer-valid
      // slot would land the user in a state the migration would just
      // bump back into CCG on next load.)
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
          // Restore the coaches map (advance added the new-team byYear to the
          // active coach). A full-map restore reverses it cleanly.
          if (previousJobData.coaches !== undefined && previousJobData.coaches !== null) {
            additionalUpdates.coaches = previousJobData.coaches
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
      } else if (dynasty.currentWeek >= 2 && dynasty.currentWeek <= 4 && prevWeek === dynasty.currentWeek - 1) {
        // Reverting within recruiting weeks (2-5)
        // Clear recruiting commitments that were added in current week
        // Note: We don't delete recruits here, just clear sheet IDs as the actual
        // recruit management is handled through the recruiting modal
        additionalUpdates.recruitingSheetId = null
      } else if (dynasty.currentWeek === 6 && prevWeek === 5) {
        // Reverting FROM Training Results (week 6) TO National Signing Day (week 5).
        // With the flip at wk4→5, BOTH weeks are POST-flip — this does NOT cross
        // the year flip. So we only restore the Training Results overalls the
        // modal wrote at wk6 (year-keyed by the post-flip year).
        const trainingYear = currentYear
        let basePlayers = dynasty.players || []
        const trainingResults = dynasty.trainingResultsByYear?.[trainingYear]
          || dynasty.trainingResultsByYear?.[String(trainingYear)]
          || []
        if (Array.isArray(trainingResults) && trainingResults.length > 0) {
          const pastByName = new Map()
          for (const r of trainingResults) {
            if (!r?.playerName) continue
            // Match the WRITER's normalization (handleTrainingResultsSave uses
            // normalizePlayerName) so names with curly apostrophes / double
            // spaces (e.g. De'Andre) restore correctly instead of leaving
            // player.overall stuck at the post-training value.
            pastByName.set(normalizePlayerName(r.playerName), r.pastOverall ?? null)
          }
          basePlayers = basePlayers.map(p => {
            const norm = normalizePlayerName(p.name || '')
            if (!pastByName.has(norm)) return p
            const past = pastByName.get(norm)
            const nextOverallByYear = { ...(p.overallByYear || {}) }
            delete nextOverallByYear[trainingYear]
            delete nextOverallByYear[String(trainingYear)]
            const restored = { ...p, overallByYear: nextOverallByYear }
            if (past != null) restored.overall = past
            return restored
          })
        }
        // Clear the training-results stores (year-keyed + tid-keyed) + recruit overalls.
        if (dynasty.trainingResultsByYear) {
          additionalUpdates.trainingResultsByYear = deleteYearKeys(
            dynasty.trainingResultsByYear, trainingYear
          )
        }
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
                  [trainingYear]: { ...existingYearData, trainingResults: null }
                }
              }
            }
          }
        }
        // NOTE: do NOT clear recruitOverallsByYear here. Recruit Overalls is a
        // Signing-Day (wk5) task keyed under the ending year S, not Training-
        // Results (wk6) data. Reverting wk6→wk5 lands the user back ON Signing
        // Day, so that data must survive.

        // Persist the training-overall restoration (no class-progression change here).
        if (basePlayers.some((p, i) => p !== (dynasty.players || [])[i])) {
          additionalUpdates.players = basePlayers
        }
      } else if (dynasty.currentWeek === 5 && prevWeek === 4) {
        // Reverting FROM National Signing Day (week 5, POST-flip) TO Recruiting
        // Week 3 (week 4, PRE-flip). This crosses the year flip → undo the flip
        // + class progression. currentYear is the NEW year (post-flip).
        prevYear = currentYear - 1
        const newSeasonYear = currentYear // The year we're leaving
        const previousSeasonYear = prevYear // The year we're going back to
        const players = dynasty.players || []

        // Undo the depth-chart archive the flip wrote for the season we're
        // returning to. That season is the LIVE plan again (teamFuture), so a
        // leftover archive would both shadow it and go stale if the user edits
        // the chart before re-advancing. Removing it lets the next advance
        // re-archive the current state.
        if (dynasty.depthChartByYear) {
          const dcRollback = {}
          let removed = 0
          for (const [tidKey, byYear] of Object.entries(dynasty.depthChartByYear)) {
            const stripped = deleteYearKeys(byYear || {}, previousSeasonYear)
            if (Object.keys(stripped || {}).length !== Object.keys(byYear || {}).length) removed++
            dcRollback[tidKey] = stripped
          }
          if (removed > 0) additionalUpdates.depthChartByYear = dcRollback
        }

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

        // NOTE: We intentionally do NOT clear recruitingClassRankByTeamYear or
        // draftResultsByTeamYear here. In the flip-on-Signing-Day model these are
        // keyed under the ENDING season year S (= previousSeasonYear after this
        // un-flip): Class Rank is a Signing-Day (wk5) task whose data year is
        // currentYear-1, and Draft Results are entered earlier in the offseason
        // under the same year. Un-flipping wk5→wk4 rolls the year back to S but
        // leaves that S-keyed data in place, so re-advancing into Signing Day
        // surfaces the user's entries again. Clearing it would silently wipe
        // them.
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
    // In a shared league the RAW dynasty's currentTid / teams[].userId
    // point at the OWNER's team, so getCurrentTeamTid(dynasty) would scope
    // a member's schedule save to the commish's team (games created from
    // the wrong perspective). When the caller didn't pass an explicit
    // teamTid (e.g. the Dashboard "Enter Schedule" todo), use THIS user's
    // active team — the same tid the UI is showing them — falling back to
    // the dynasty-doc team for solo dynasties.
    const targetTid = options.teamTid || activeUserTid || getCurrentTeamTid(dynasty)
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
    // Root-level schedule / preseasonSetup are OWNER-scoped (a single value
    // on the doc, historically the owner's team). Only mirror to them when
    // the team being saved is the dynasty-doc's current team — i.e. the
    // owner editing their own team. A member editing their team writes ONLY
    // the per-team structures below, so they never clobber the owner's
    // root-level schedule with their own games.
    const isUserCurrentTeamYear = matchesUserTeam && matchesCurrentYear

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
      // Use the ACTING user's team. In a shared league the raw dynasty's
      // currentTid is the OWNER's team, so a member saving their own roster
      // must resolve to their own team (activeUserTid), not the commish's.
      teamTid = activeUserTid || getCurrentTeamTid(dynasty)
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

    // Fallback match indexes for THIS team's existing players. EA's roster screen
    // abbreviates first names ("B. Hubbard"), so an AI paste re-typing the roster
    // won't full-name-match "Bray Hubbard" — without this it lands as a NEW
    // player, duplicating the roster and forcing the user to re-enter everything.
    // Keyed by lastName+jersey (most specific) then lastName+position; only used
    // when the exact-name match misses AND the key is unambiguous (exactly one
    // candidate), so two different players are never merged.
    const nrm = (s) => (s || '').toString().toLowerCase().trim()
    const lastNameOf = (p) => nrm(p.lastName) || nrm(p.name).split(/\s+/).slice(1).join(' ')
    const firstNameOf = (p) => nrm(p.firstName) || nrm(p.name).split(/\s+/)[0] || ''
    // The fallback exists ONLY for EA's abbreviated first names ("B. Hubbard" ⇄
    // "Bray Hubbard"). It must NOT merge two DIFFERENT players who merely share a
    // last name + position (e.g. incoming "R.J. Rogers" vs existing "Noah Rogers",
    // both WR) — that silently drops the new player and corrupts the existing one.
    // So require the first names to be compatible: equal, or one is an
    // initial-style abbreviation of the other. Missing first name on either side
    // can't disprove a match, so it's allowed through.
    const firstNamesCompatible = (a, b) => {
      const fa = firstNameOf(a).replace(/\./g, '')
      const fb = firstNameOf(b).replace(/\./g, '')
      if (!fa || !fb) return true
      if (fa === fb) return true
      if (fa.length <= 2 && fb.startsWith(fa[0])) return true
      if (fb.length <= 2 && fa.startsWith(fb[0])) return true
      return false
    }
    const byLastJersey = {}
    const byLastPos = {}
    const pushIdx = (map, key, p) => { if (key) (map[key] = map[key] || []).push(p) }
    existingPlayers.forEach(p => {
      const isThisTeam = p.team === teamTid || p.team === teamAbbr
      if (!p.name || !isThisTeam) return
      const ln = lastNameOf(p)
      if (!ln) return
      if (p.jerseyNumber != null && String(p.jerseyNumber).trim() !== '') pushIdx(byLastJersey, `${ln}#${String(p.jerseyNumber).trim()}`, p)
      if (p.position) pushIdx(byLastPos, `${ln}|${nrm(p.position)}`, p)
    })
    const uniqMatch = (map, key) => { const a = key && map[key]; return a && a.length === 1 ? a[0] : null }
    const fallbackMatch = (player) => {
      const ln = lastNameOf(player)
      if (!ln) return null
      const jersey = player.jerseyNumber != null && String(player.jerseyNumber).trim() !== '' ? `${ln}#${String(player.jerseyNumber).trim()}` : ''
      const cand = uniqMatch(byLastJersey, jersey) || uniqMatch(byLastPos, player.position ? `${ln}|${nrm(player.position)}` : '')
      // Same last name + jersey/position is not enough when the first names
      // clearly disagree — that's a different person, not an abbreviated re-type.
      if (cand && !firstNamesCompatible(player, cand)) return null
      return cand
    }

    // Track which players actually changed so the cloud save can write ONLY
    // those docs instead of rewriting the entire roster (a 1-player edit was
    // rewriting all ~1300 players). New players always count. For existing
    // players we compare every field the roster editor can touch — top-level
    // editable fields plus this year's entry in each immutable byYear map — so
    // no real edit is ever missed (a missed change would be lost on reload).
    const changedPids = new Set()
    const yearVal = (obj, mapKey) => obj?.[mapKey]?.[year] ?? obj?.[mapKey]?.[String(year)]
    const rosterPlayerChanged = (built, e) => {
      if (!e) return true
      const fields = ['firstName', 'lastName', 'name', 'position', 'year', 'devTrait', 'archetype', 'overall', 'height', 'weight', 'hometown', 'state', 'pictureUrl']
      for (const k of fields) if ((built[k] ?? null) !== (e[k] ?? null)) return true
      if (String(built.jerseyNumber ?? '') !== String(e.jerseyNumber ?? '')) return true
      if (String(built.team ?? '') !== String(e.team ?? '')) return true
      for (const m of ['teamsByYear', 'classByYear', 'overallByYear', 'devTraitByYear', 'nilByYear']) {
        if ((yearVal(built, m) ?? null) !== (yearVal(e, m) ?? null)) return true
      }
      if (JSON.stringify(yearVal(built, 'attributesByYear') ?? null) !== JSON.stringify(yearVal(e, 'attributesByYear') ?? null)) return true
      return false
    }

    // Add team field and yearStarted to each player
    // For existing players (matched by name), preserve their original data
    // For new players, set yearStarted to the current editing year
    let nextPIDCounter = startPID
    const playersWithPIDs = players.map((player) => {
      const nameLower = (player.name || '').toLowerCase().trim()
      // Exact full-name match first; fall back to lastName+jersey/position so an
      // abbreviated incoming name updates the existing player instead of duping.
      let existingPlayer = existingPlayersByName[nameLower]
      let matchedViaFallback = false
      if (!existingPlayer) {
        const cand = fallbackMatch(player)
        if (cand) { existingPlayer = cand; matchedViaFallback = true }
      }

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
        // Set teamsByYear[year] = tid to record this player was on this team
        // this year — the IMMUTABLE record that drives roster membership.
        //
        // The user is entering THIS roster for `year`, so a player listed here
        // is one they're asserting is on the team this season. We therefore
        // ALWAYS write teamsByYear[year], even if the player carries a stale
        // prior-year departure marker. (Previously any departure in a year <
        // `year` made this skip the write, so a player who was marked as
        // leaving last season — correctly or by a carryover glitch — could
        // never be re-added to a later season's roster. That's the exact
        // "second season… won't let me add a player that's missing from my
        // roster" bug. All three saveRoster callers are manual roster entry,
        // so honoring the explicit entry is always correct here.)
        const updatedTeamsByYear = {
          ...(existingPlayer.teamsByYear || {}),
          [year]: teamsByYearValue
        }

        // Drop now-contradicted departure markers from BEFORE this season so
        // the Career Timeline is consistent, the season-advance carryover
        // (hasUnresolvedDeparture) doesn't re-strip them next year, and a
        // future roster re-save doesn't hide them again. Only departure-type
        // entries for years < `year` are cleared; arrivals and this/later-year
        // events are untouched. (Legacy movements[] gets stripped on save by
        // syncDerivedFieldsFromV2, so movementByYear is the source of truth.)
        const departureTypesToClear = new Set(['departure', 'transfer', 'entered_portal', 'transferred_out', 'graduated', 'declared_for_draft', 'encouraged_to_transfer'])
        const departureShapesToClear = new Set(['transfer_out', 'graduated', 'pro_draft'])
        const cleanedMovementByYear = { ...(existingPlayer.movementByYear || {}) }
        for (const [yStr, m] of Object.entries(cleanedMovementByYear)) {
          const yNum = Number(yStr)
          if (!Number.isFinite(yNum) || yNum >= Number(year)) continue
          if (m && (departureTypesToClear.has(m.type) || departureShapesToClear.has(m.departure))) {
            delete cleanedMovementByYear[yStr]
          }
        }

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

        const built = {
          // Start with ALL existing player data (preserves everything by default)
          ...existingPlayer,
          // Update ONLY the fields that are editable via Google Sheet
          // These are the columns: First Name, Last Name, Position, Class, Dev Trait, Jersey #, Archetype, Overall, Height, Weight, Hometown, State, Image URL
          // When matched via the abbreviated-name fallback, KEEP the existing
          // full name — the incoming name is the abbreviated "B. Hubbard" form,
          // so overwriting would replace "Bray Hubbard" with the initial.
          firstName: matchedViaFallback ? existingPlayer.firstName : (player.firstName ?? existingPlayer.firstName),
          lastName: matchedViaFallback ? existingPlayer.lastName : (player.lastName ?? existingPlayer.lastName),
          name: matchedViaFallback ? existingPlayer.name : (player.name || existingPlayer.name),
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
          // Prior-season departure markers cleared (see above) so re-adding a
          // player to a later roster fully restores them.
          movementByYear: cleanedMovementByYear,
          // IMMUTABLE class history - records what class player was each year
          classByYear: updatedClassByYear,
          // IMMUTABLE overall history - records what overall player had each year
          overallByYear: updatedOverallByYear,
          // IMMUTABLE dev trait history - records what dev trait player had each year
          devTraitByYear: updatedDevTraitByYear,
          // IMMUTABLE NIL history (CFB 27+) — only written when the sheet provides
          // a value, so CFB 26 players never gain an empty nilByYear map.
          ...(player.nil != null && player.nil !== '' && !isNaN(parseInt(player.nil))
            ? { nilByYear: { ...(existingPlayer.nilByYear || {}), [year]: parseInt(player.nil) } }
            : {}),
          // IMMUTABLE per-season attribute history (CFB 27) — only when the sheet's
          // Attributes cell parsed to something, so other seasons/players are untouched.
          ...(player.attributes && Object.keys(player.attributes).length
            ? { attributesByYear: { ...(existingPlayer.attributesByYear || {}), [year]: player.attributes } }
            : {})
          // ALL other fields (recruitYear, yearStarted, isRecruit, isPortal, stars, etc.)
          // are automatically preserved from ...existingPlayer and NOT overwritten
        }
        if (rosterPlayerChanged(built, existingPlayer)) changedPids.add(pid)
        return built
      }

      // For NEW players (no name match), use sheet data with required fields.
      // Write a canonical v2 arrival/transfer_in entry to movementByYear
      // (mirrors what legacyMovementToCanonical produces for the legacy
      // 'added' type — keeping the semantic identical while skipping the
      // legacy movements[] write the heal would just strip on next load).
      changedPids.add(pid)
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
        // IMMUTABLE NIL history (CFB 27+) — only when the sheet provides a value.
        ...(player.nil != null && player.nil !== '' && !isNaN(parseInt(player.nil))
          ? { nilByYear: { [year]: parseInt(player.nil) } }
          : {}),
        // IMMUTABLE per-season attribute history (CFB 27) — only when the sheet's
        // Attributes cell parsed to a non-empty map.
        ...(player.attributes && Object.keys(player.attributes).length
          ? { attributesByYear: { [year]: player.attributes } }
          : {}),
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
    //
    // Graduation-aware preservation: the "never delete players missing from
    // the sheet" merge exists to survive PARTIAL sheets — but it also made
    // graduated seniors literally unremovable ("I remove them in edit roster
    // and they just reappear"). A player whose eligibility was already
    // exhausted entering `year` (class was Sr / RS Sr the season before) and
    // whom the user REMOVED from the sheet is a graduate, not an accidental
    // omission: keep the player record (career history intact) but drop this
    // year's roster membership and record the graduation. The recorded
    // departure also stops the teamHistory backfill from re-adding the year.
    const filteredTeamPlayersNotInSheet = teamPlayersNotInSheet
      .filter(p => !updatedPIDs.has(p.pid))
      .map(p => {
        const yearN = Number(year)
        const prevY = yearN - 1
        const clsPrev = p.classByYear?.[prevY] ?? p.classByYear?.[String(prevY)]
        const exhausted = clsPrev === 'Sr' || clsPrev === 'RS Sr'
        if (!exhausted) return p
        const hasThisYear = p.teamsByYear?.[yearN] != null || p.teamsByYear?.[String(yearN)] != null
        if (!hasThisYear) return p
        const nextTeamsByYear = { ...(p.teamsByYear || {}) }
        delete nextTeamsByYear[yearN]
        delete nextTeamsByYear[String(yearN)]
        const nextClassByYear = { ...(p.classByYear || {}) }
        delete nextClassByYear[yearN]
        delete nextClassByYear[String(yearN)]
        const existingMove = p.movementByYear?.[prevY] || p.movementByYear?.[String(prevY)]
        return {
          ...p,
          teamsByYear: nextTeamsByYear,
          classByYear: nextClassByYear,
          movementByYear: existingMove ? p.movementByYear : {
            ...(p.movementByYear || {}),
            [prevY]: { type: 'departure', departure: 'graduated' },
          },
        }
      })

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

    // Surgical cloud save: only the players that actually changed get written
    // to the subcollection (no full-roster rewrite, no orphan-cleanup read).
    // If nothing changed, skip the player write entirely. Local (IndexedDB)
    // dynasties still write the whole doc in one shot, which is already fast.
    const changedPidList = [...changedPids]
    const rosterSaveOpts = changedPidList.length
      ? { changedPlayerPids: changedPidList }
      : { skipPlayersSubcollection: true }
    console.log(`[saveRoster] ${changedPidList.length} player(s) changed -> ${changedPidList.length ? 'writing only those' : 'no player writes'}`)
    await updateDynasty(dynastyId, rosterUpdates, rosterSaveOpts)
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

    // Resolve the ACTING user's team first. In a shared league the raw
    // dynasty's current team is the OWNER's, so a member must target their
    // own team (activeUserTid); derive the abbr from that tid.
    const tid = activeUserTid || getCurrentTeamTid(dynasty)
    const teamAbbr = (tid ? getAbbrFromTid(dynasty.teams, tid) : null) || getCurrentTeamAbbr(dynasty) || dynasty.teamName
    const year = dynasty.currentYear

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

    // Handle record update. clearRecord === true removes the manual override
    // (record set to null) so the calculated record is used again — this is the
    // "Update automatically" checkbox in the team edit modal.
    if (info.clearRecord === true || (info.wins !== undefined && info.losses !== undefined)) {
      const existingRecords = dynasty.teamRecordsByTeamYear || {}
      const teamRecords = existingRecords[teamAbbr] || {}
      const recordData = info.clearRecord === true ? null : { wins: info.wins, losses: info.losses }

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

    // Handle conference update.
    //
    // Primary: teams[tid].byYear[year].conference (canonical per-team store).
    // Fallback: conferenceByTeamYear[abbr][year] — written when tid is not
    // available (legacy abbr-only teams) so the change isn't silently lost.
    // The base-map + override read path in getCustomConferencesForYear picks
    // this up correctly via the conferenceByTeamYear overlay.
    if (info.conference !== undefined) {
      if (useLocalStorage) {
        if (tid) {
          // Canonical per-team write.
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
                [year]: { ...existingYearData, conference: info.conference }
              }
            }
          }
        } else if (teamAbbr) {
          // Fallback: write to legacy store so the change isn't dropped.
          const existingConferences = dynasty.conferenceByTeamYear || {}
          const teamConferences = existingConferences[teamAbbr] || {}
          updates.conferenceByTeamYear = {
            ...existingConferences,
            [teamAbbr]: { ...teamConferences, [year]: info.conference }
          }
        }
      } else {
        // Firestore dot notation.
        if (tid) {
          updates[`teams.${tid}.byYear.${year}.conference`] = info.conference
        } else if (teamAbbr) {
          // Fallback for legacy abbr-only teams.
          Object.assign(updates, buildByTeamYearUpdates('conferenceByTeamYear', dynasty, teamAbbr, year, info.conference))
        }
      }
    }

    // Handle team ratings (overall / offense / defense) for this team+year.
    // Canonical store is teams[tid].byYear[year].teamRatings. For the USER's
    // current team+year, getTeamRatingsForYear reads dynasty.teamRatings first,
    // so mirror there too or the edit wouldn't take effect for that one team.
    if (info.teamRatings !== undefined) {
      const r = info.teamRatings // { overall, offense, defense } — numbers or null
      const isUserCurrent = tid != null
        && Number(tid) === Number(getCurrentTeamTid(dynasty))
        && Number(year) === Number(dynasty.currentYear)
      if (useLocalStorage) {
        if (tid) {
          const existingTeams = updates.teams || dynasty.teams || {}
          const existingTeamData = existingTeams[tid] || {}
          const existingByYear = existingTeamData.byYear || {}
          const existingYearData = existingByYear[year] || {}
          updates.teams = {
            ...existingTeams,
            [tid]: {
              ...existingTeamData,
              byYear: { ...existingByYear, [year]: { ...existingYearData, teamRatings: r } }
            }
          }
        }
        const existingR = dynasty.teamRatingsByTeamYear || {}
        updates.teamRatingsByTeamYear = {
          ...existingR,
          [teamAbbr]: { ...(existingR[teamAbbr] || {}), [year]: r },
          ...(tid ? { [tid]: { ...(existingR[tid] || {}), [year]: r } } : {}),
        }
        if (isUserCurrent) updates.teamRatings = r
      } else {
        if (tid) updates[`teams.${tid}.byYear.${year}.teamRatings`] = r
        Object.assign(updates, buildByTeamYearUpdates('teamRatingsByTeamYear', dynasty, tid ?? teamAbbr, year, r))
        if (isUserCurrent) updates.teamRatings = r
      }
    }

    if (Object.keys(updates).length > 0) {
      await updateDynasty(dynastyId, updates)
    }
  }

  // Bulk team-ratings save — the "Team Overalls sheet". One updateDynasty
  // call writes every passed team's { overall, offense, defense } for the
  // year, instead of one save per school via saveTeamYearInfo (which is what
  // forced users to click through All Teams team by team). Mirrors the
  // ratings branch of saveTeamYearInfo exactly: canonical store is
  // teams[tid].byYear[year].teamRatings, dual-keyed legacy mirror in
  // teamRatingsByTeamYear, and dynasty.teamRatings for the user's current
  // team+year (that's what getTeamRatingsForYear reads first for that team).
  const saveAllTeamRatings = async (dynastyId, year, ratingsByTid) => {
    if (blockIfReadOnly(dynastyId, 'save team overalls')) return
    const dynasty = await findDynastyById(dynastyId)
    if (!dynasty) {
      console.error('Dynasty not found:', dynastyId)
      return
    }
    const entries = Object.entries(ratingsByTid || {}).filter(([, r]) =>
      r && (r.overall != null || r.offense != null || r.defense != null)
    )
    if (entries.length === 0) return { saved: 0 }

    const useLocalStorage = dynasty.storageType !== 'cloud'
    const yr = Number(year)
    const userTid = Number(getCurrentTeamTid(dynasty))
    const isCurrentYear = yr === Number(dynasty.currentYear)
    const updates = {}

    if (useLocalStorage) {
      const teams = { ...(dynasty.teams || {}) }
      const byTeamYear = { ...(dynasty.teamRatingsByTeamYear || {}) }
      for (const [tidStr, r] of entries) {
        const tid = Number(tidStr)
        const teamData = teams[tid] || {}
        const byYear = teamData.byYear || {}
        teams[tid] = {
          ...teamData,
          byYear: { ...byYear, [yr]: { ...(byYear[yr] || {}), teamRatings: r } },
        }
        const abbr = teamData.abbr || getAbbrFromTid(dynasty.teams, tid)
        byTeamYear[tid] = { ...(byTeamYear[tid] || {}), [yr]: r }
        if (abbr && abbr !== String(tid)) {
          byTeamYear[abbr] = { ...(byTeamYear[abbr] || {}), [yr]: r }
        }
        if (tid === userTid && isCurrentYear) updates.teamRatings = r
      }
      updates.teams = teams
      updates.teamRatingsByTeamYear = byTeamYear
    } else {
      for (const [tidStr, r] of entries) {
        const tid = Number(tidStr)
        updates[`teams.${tid}.byYear.${yr}.teamRatings`] = r
        Object.assign(updates, buildByTeamYearUpdates('teamRatingsByTeamYear', dynasty, tid, yr, r))
        if (tid === userTid && isCurrentYear) updates.teamRatings = r
      }
    }

    await updateDynasty(dynastyId, updates)
    return { saved: entries.length }
  }

  // Persist an end-of-season Staff Moves board: store the season's carousel
  // list AND fold every coach into the real cid coach-entity model (tid-by-year
  // + HC/OC/DC), bridging legacy staff names and re-deriving the security index.
  const saveStaffMoves = async (dynastyId, year, moves) => {
    if (blockIfReadOnly(dynastyId, 'save staff moves')) return
    const dynasty = await findDynastyById(dynastyId)
    if (!dynasty) {
      console.error('Dynasty not found:', dynastyId)
      return
    }
    const yr = Number(year)
    const { coaches, teams, memberTeams } = applyStaffMovesToCoaches(dynasty, moves, yr)
    const staffMovesByYear = {
      ...(dynasty.staffMovesByYear || {}),
      [yr]: { moves: Array.isArray(moves) ? moves : [], completed: true, updatedAt: Date.now() },
    }
    await updateDynasty(dynastyId, { coaches, teams, memberTeams, staffMovesByYear })
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

    // Resolve the ACTING user's team first. In a shared league the raw
    // dynasty's current team is the OWNER's, so a member must target their
    // own team (activeUserTid); derive the abbr from that tid.
    const tid = activeUserTid || getCurrentTeamTid(dynasty)
    const teamAbbr = (tid ? getAbbrFromTid(dynasty.teams, tid) : null) || getCurrentTeamAbbr(dynasty) || dynasty.teamName
    const year = dynasty.currentYear

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

    // Mint/refresh cid coach entities for the OC/DC just entered, so they
    // become real, linkable coaches (not just name strings). HC stays the
    // user's controlled coach — syncCoordinatorCoachesForTeamYear skips it.
    const nextCoaches = syncCoordinatorCoachesForTeamYear(dynasty.coaches, tid, year, staff)

    const coachingStaffUpdates = useLocalStorage
      ? {
          coaches: nextCoaches,
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
          // Firestore: full coaches map (matches every other coach write path)
          coaches: nextCoaches,
          // use dot notation for nested updates
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

    // Per-record edit timestamp — the only place we don't have one already
    // (dynasty.lastModified is doc-level only). This is what lets the
    // Recruiting Database's Google Sheet sync do most-recent-wins conflict
    // resolution per recruit instead of guessing.
    finalPlayer.updatedAt = Date.now()

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
        bumpSkipCount(3)
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

      // Helper to check if a game's box score contains the old name.
      // Walks every team's stat block in the canonical (or legacy) shape.
      const gameHasPlayerName = (game, name) => {
        if (!game.boxScore) return false
        const checkStats = (stats) => Array.isArray(stats) && stats.some(row => row.playerName === name)
        const checkSide = (side) => side && Object.values(side).some(checkStats)
        const bs = game.boxScore
        // New shape: byTid
        if (bs.byTid) {
          for (const side of Object.values(bs.byTid)) {
            if (checkSide(side)) return true
          }
        }
        // Legacy shape: home/away
        if (checkSide(bs.home) || checkSide(bs.away)) return true
        return Array.isArray(bs.scoringSummary) &&
          bs.scoringSummary.some(play => play.scorer === name || play.passer === name)
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

      // Rewrite every team's stat block in either shape (canonical byTid
      // or legacy home/away) — name renames have to land in storage
      // regardless of which shape the game is currently in.
      const renamePlayerInSide = (side) => {
        if (!side) return side
        const out = { ...side }
        Object.keys(out).forEach(category => {
          out[category] = updateStatCategory(out[category])
        })
        return out
      }

      const updatedGames = (dynasty.games || []).map(game => {
        if (!game.boxScore) return game

        const updatedBoxScore = { ...game.boxScore }

        // New shape: rewrite every tid's slot
        if (updatedBoxScore.byTid) {
          const nextByTid = {}
          for (const [tidKey, side] of Object.entries(updatedBoxScore.byTid)) {
            nextByTid[tidKey] = renamePlayerInSide(side)
          }
          updatedBoxScore.byTid = nextByTid
        }
        // Legacy shape: rewrite home/away if present
        if (updatedBoxScore.home) updatedBoxScore.home = renamePlayerInSide(updatedBoxScore.home)
        if (updatedBoxScore.away) updatedBoxScore.away = renamePlayerInSide(updatedBoxScore.away)

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
          bumpSkipCount(3)
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
            await settleOrProceed(saveGameToSubcollection(dynastyId, game), 10000, `updatePlayer(${dynastyId})`)
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

  // Full-replace save for the Recruiting Database's recruit list — the
  // single write path every caller (import, batch edit, delete, JSON
  // restore) already funnels through, since all of them rebuild "here is
  // the complete current list" rather than patching one entry. Cloud
  // dynasties write to the recruitingDatabase subcollection (kept off the
  // main doc for the same reason players/games/weekRecaps already are —
  // see migrateRecruitingDatabaseToSubcollection); local (IndexedDB)
  // dynasties have no per-document size ceiling to dodge, so they keep
  // using the plain field via the ordinary updateDynasty path.
  const updateRecruitingDatabasePlayers = async (dynastyId, players) => {
    if (blockIfReadOnly(dynastyId, 'update recruiting database')) return
    const dynasty = await findDynastyById(dynastyId)
    if (!dynasty) {
      console.error('Dynasty not found:', dynastyId)
      return
    }
    const looksLikeFirebaseId = typeof dynastyId === 'string' && dynastyId.length >= 20 && !/^\d+$/.test(dynastyId)
    const isCloudStorage = looksLikeFirebaseId || (dynasty.storageType === 'cloud' && user)

    if (!isCloudStorage) {
      await updateDynasty(dynastyId, { recruitingDatabasePlayers: players })
      return
    }

    // Capped like the other cloud saves: a slow/marginal connection must not
    // spin the Recruiting Database's Saving… UI forever (the delta is durable
    // locally and syncs in the background). Fast rejections still surface.
    await settleOrProceed(saveRecruitingDatabaseSubcollection(dynastyId, players), 10000, `updateRecruitingDatabasePlayers(${dynastyId})`)

    // Optimistic local update, same shape as updatePlayer's single-doc
    // cloud path — the subcollection write itself doesn't touch React
    // state, and subscribeToDynasties only re-fetches this subcollection
    // for dynasties already flagged as loaded, so without this the UI
    // wouldn't reflect the save until the next unrelated snapshot.
    setDynasties(prev => prev.map(d =>
      String(d.id) === String(dynastyId) ? { ...d, recruitingDatabasePlayers: players } : d
    ))
    setCurrentDynasty(prev => {
      if (!prev || String(prev.id) !== String(dynastyId)) return prev
      return { ...prev, recruitingDatabasePlayers: players }
    })
  }

  // Recover recruit data (the Recruiting Database + committed recruits) from
  // ANOTHER of the user's saves into `targetId`. Built for users whose
  // recruits went missing from a cloud save after a storage round-trip: point
  // it at a save that still has them (usually a local backup) and it copies
  // them in. ADDITIVE ONLY — it unions the source's recruits into the target,
  // never overwriting or deleting anything the target already has, so it can't
  // make things worse. Reads the source straight from storage (subcollections
  // for cloud, IndexedDB for local) so it works even for a source not opened
  // this session.
  const recoverRecruitData = async (sourceId, targetId) => {
    if (blockIfReadOnly(targetId, 'recover recruits')) return { success: false, error: 'This dynasty is read-only.' }
    if (String(sourceId) === String(targetId)) return { success: false, error: 'Pick a different source save.' }

    const findAny = (id) =>
      dynasties.find(d => String(d.id) === String(id)) ||
      (String(currentDynasty?.id) === String(id) ? currentDynasty : null)
    const source = findAny(sourceId)
    const target = findAny(targetId)
    if (!source) return { success: false, error: 'Source save not found.' }
    if (!target) return { success: false, error: 'Target dynasty not found.' }

    // ── Read recruit data from the source ────────────────────────────────
    let srcDb = []
    let srcRecruits = {}, srcCommitments = {}, srcClassRank = {}
    try {
      if (source.storageType === 'cloud') {
        srcDb = (await getRecruitingDatabaseSubcollection(sourceId)) || []
        if (srcDb.length === 0 && Array.isArray(source.recruitingDatabasePlayers)) srcDb = source.recruitingDatabasePlayers
        const seasonal = (await getSeasonsSubcollection(sourceId)) || {}
        srcRecruits = seasonal.recruitsByTeamYear || source.recruitsByTeamYear || {}
        srcCommitments = seasonal.recruitingCommitmentsByTeamYear || source.recruitingCommitmentsByTeamYear || {}
        srcClassRank = seasonal.recruitingClassRankByTeamYear || source.recruitingClassRankByTeamYear || {}
      } else {
        const fresh = (await indexedDBStorage.getDynasty(sourceId)) || source
        srcDb = Array.isArray(fresh.recruitingDatabasePlayers) ? fresh.recruitingDatabasePlayers : []
        srcRecruits = fresh.recruitsByTeamYear || {}
        srcCommitments = fresh.recruitingCommitmentsByTeamYear || {}
        srcClassRank = fresh.recruitingClassRankByTeamYear || {}
      }
    } catch (err) {
      console.error('[recoverRecruitData] read failed:', err)
      return { success: false, error: 'Could not read recruits from the source save.' }
    }

    // Deep union of a per-team → per-year map (target wins on overlap so we
    // never overwrite existing target data — purely fills gaps).
    const unionByTeamYear = (targetMap, srcMap) => {
      const out = {}
      for (const [teamKey, years] of Object.entries(targetMap || {})) out[teamKey] = { ...(years || {}) }
      for (const [teamKey, years] of Object.entries(srcMap || {})) {
        out[teamKey] = out[teamKey] || {}
        for (const [y, v] of Object.entries(years || {})) {
          if (out[teamKey][y] === undefined) out[teamKey][y] = v
        }
      }
      return out
    }
    const countTeamYear = (m) => Object.values(m || {}).reduce((n, t) => n + Object.keys(t || {}).length, 0)

    const srcCommittedCount = countTeamYear(srcRecruits) + countTeamYear(srcCommitments)
    if (srcDb.length === 0 && srcCommittedCount === 0) {
      return { success: false, error: 'The selected source save has no recruit data to copy.' }
    }

    // ── Write into the target (additive) ─────────────────────────────────
    try {
      // Recruiting Database: union by pid, keeping the target's copy on a
      // pid clash so existing scouted data isn't clobbered.
      if (srcDb.length > 0) {
        const existingDb = Array.isArray(target.recruitingDatabasePlayers) ? target.recruitingDatabasePlayers : []
        const byPid = new Map()
        for (const r of srcDb) if (r && r.pid != null) byPid.set(String(r.pid), r)
        for (const r of existingDb) if (r && r.pid != null) byPid.set(String(r.pid), r) // target wins
        await updateRecruitingDatabasePlayers(targetId, [...byPid.values()])
      }

      const seasonalUpdate = {}
      const mergedRecruits = unionByTeamYear(target.recruitsByTeamYear, srcRecruits)
      const mergedCommit = unionByTeamYear(target.recruitingCommitmentsByTeamYear, srcCommitments)
      const mergedClassRank = unionByTeamYear(target.recruitingClassRankByTeamYear, srcClassRank)
      if (countTeamYear(mergedRecruits)) seasonalUpdate.recruitsByTeamYear = mergedRecruits
      if (countTeamYear(mergedCommit)) seasonalUpdate.recruitingCommitmentsByTeamYear = mergedCommit
      if (countTeamYear(mergedClassRank)) seasonalUpdate.recruitingClassRankByTeamYear = mergedClassRank
      if (Object.keys(seasonalUpdate).length) {
        await updateDynasty(targetId, seasonalUpdate)
      }
    } catch (err) {
      console.error('[recoverRecruitData] write failed:', err)
      return { success: false, error: 'Failed while writing recruits into this dynasty.' }
    }

    return { success: true, dbCount: srcDb.length, committedCount: srcCommittedCount }
  }

  // Recover the ROSTER (players) from ANOTHER of the user's saves into
  // `targetId`. Built for users whose roster came over empty after switching a
  // save from local to cloud — point it at a save that still has the players
  // and it copies them in. ADDITIVE ONLY: it unions the source's players into
  // the target (matched by pid, or by name+team for pid-less legacy rows) and
  // the TARGET always wins on a clash, so nothing already in the target is
  // overwritten or deleted. Reads the source straight from storage
  // (subcollection for cloud, IndexedDB for local) so it works even for a
  // source not opened this session.
  const recoverRosterData = async (sourceId, targetId) => {
    if (blockIfReadOnly(targetId, 'recover roster')) return { success: false, error: 'This dynasty is read-only.' }
    if (String(sourceId) === String(targetId)) return { success: false, error: 'Pick a different source save.' }

    const findAny = (id) =>
      dynasties.find(d => String(d.id) === String(id)) ||
      (String(currentDynasty?.id) === String(id) ? currentDynasty : null)
    const source = findAny(sourceId)
    const target = findAny(targetId)
    if (!source) return { success: false, error: 'Source save not found.' }
    if (!target) return { success: false, error: 'Target dynasty not found.' }

    // ── Read the roster from the source ──────────────────────────────────
    let srcPlayers = []
    try {
      if (source.storageType === 'cloud') {
        srcPlayers = (await getPlayersSubcollection(sourceId)) || []
        if ((!srcPlayers || srcPlayers.length === 0) && Array.isArray(source.players)) srcPlayers = source.players
      } else {
        const fresh = (await indexedDBStorage.getDynasty(sourceId)) || source
        srcPlayers = Array.isArray(fresh.players) ? fresh.players : []
      }
    } catch (err) {
      console.error('[recoverRosterData] read source failed:', err)
      return { success: false, error: 'Could not read the roster from the source save.' }
    }
    if (!srcPlayers || srcPlayers.length === 0) {
      return { success: false, error: 'The selected source save has no roster to copy.' }
    }

    // ── Read the target's current roster to union against ────────────────
    let tgtPlayers = []
    try {
      tgtPlayers = (await getDynastyPlayers(target)) || []
    } catch {
      tgtPlayers = Array.isArray(target.players) ? target.players : []
    }

    // Union by pid; pid-less legacy rows match on name+team so we don't create
    // duplicates. Target wins on any clash — purely fills gaps, never clobbers.
    const keyOf = (p) => (p?.pid != null
      ? `pid:${p.pid}`
      : `nm:${(p?.name || '').toLowerCase().trim()}|${p?.team ?? ''}`)
    const byKey = new Map()
    for (const p of srcPlayers) if (p) byKey.set(keyOf(p), p)
    for (const p of tgtPlayers) if (p) byKey.set(keyOf(p), p) // target wins
    const merged = [...byKey.values()]
    const added = Math.max(0, merged.length - tgtPlayers.length)

    try {
      // updateDynasty routes a full players array correctly for both tiers
      // (subcollection for cloud, inline for local). The union INCLUDES every
      // existing target player, so the cloud orphan-cleanup path never deletes
      // anything legit.
      await updateDynasty(targetId, { players: merged })
    } catch (err) {
      console.error('[recoverRosterData] write failed:', err)
      return { success: false, error: 'Failed while writing the roster into this dynasty.' }
    }

    return { success: true, added, total: merged.length, sourceCount: srcPlayers.length }
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

    // A recruiting Target lives permanently in the Recruiting Database once
    // scouted — deleting it here (the Targets page's own delete path, via
    // PlayerEdit) removes the tracked-target record but must NOT erase its
    // scouted data. Archive a shaped snapshot into recruitingDatabasePlayers
    // first (skipped if already archived there, e.g. from a prior Clear All)
    // so it keeps showing in the Database afterward. If this write fails, we
    // abort the deletion entirely rather than risk silently losing the data.
    if (playerToDelete?.isTarget) {
      const alreadyArchived = (dynasty.recruitingDatabasePlayers || [])
        .some(p => String(p.pid) === String(playerToDelete.pid))
      if (!alreadyArchived) {
        try {
          await updateRecruitingDatabasePlayers(dynastyId, [
            ...(dynasty.recruitingDatabasePlayers || []),
            shapeTargetForDatabase(playerToDelete),
          ])
        } catch (error) {
          console.error('[deletePlayer] Failed to archive target into Recruiting Database, aborting delete:', error)
          throw error
        }
      }
    }

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
        bumpSkipCount(3)
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
        userTeamAbbr,
        dynasty.currentYear
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
  const buildPerTeamConferencePatch = (dynasty, year, conferenceMap, teamDivisions = null) => {
    const yearKey = String(year)
    const cloudPatch = {}
    const localTeamsPatch = {}
    if (!dynasty || !conferenceMap || typeof conferenceMap !== 'object') {
      return { localPatch: {}, cloudPatch }
    }
    const teams = dynasty.teams || {}
    // Optional per-team division (ABBR-uppercase → division name). Written into
    // the SAME byYear[year] entry as conference so a split conference's teams
    // carry their division. Only teams present here get a division; others are
    // left as-is (a stale division is ignored because every consumer gates on
    // conferenceDivisionsByYear, the authoritative "is this conference split").
    const divByAbbr = teamDivisions && typeof teamDivisions === 'object'
      ? new Map(Object.entries(teamDivisions).map(([a, d]) => [String(a).toUpperCase(), d]))
      : null
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
        const up = String(rawAbbr).toUpperCase()
        const tid = abbrToTid.get(up)
        if (!tid) continue
        const division = divByAbbr ? (divByAbbr.get(up) || null) : undefined
        cloudPatch[`teams.${tid}.byYear.${yearKey}.conference`] = conferenceName
        if (division !== undefined) cloudPatch[`teams.${tid}.byYear.${yearKey}.division`] = division
        // Nested local patch — caller merges this into updates.teams.
        if (!localTeamsPatch[tid]) {
          const existingTeam = teams[tid] || {}
          localTeamsPatch[tid] = {
            ...existingTeam,
            byYear: { ...(existingTeam.byYear || {}) },
          }
        }
        const yearData = localTeamsPatch[tid].byYear[yearKey] || {}
        const nextYearData = { ...yearData, conference: conferenceName }
        if (division !== undefined) nextYearData.division = division
        localTeamsPatch[tid].byYear[yearKey] = nextYearData
      }
    }
    return {
      localPatch: Object.keys(localTeamsPatch).length ? { teams: localTeamsPatch } : {},
      cloudPatch,
    }
  }

  /**
   * One-time migration: backfill teams[tid].byYear[year].conference
   * from the legacy bulk stores for any team/year combos that are
   * missing the canonical per-team field. Safe to run multiple times
   * (skips combinations already set). Returns a result summary.
   *
   * Available in the DangerZone admin panel as "Migrate Conferences".
   */
  const migrateConferencesToPerTeam = async (dynastyId) => {
    if (blockIfReadOnly(dynastyId, 'migrate conferences')) return { skipped: true }
    const dynasty = await findDynastyById(dynastyId)
    if (!dynasty) throw new Error('Dynasty not found')

    const useLocalStorage = dynasty.storageType !== 'cloud'

    // Complete per-tid conference history: existing per-tid > legacy bulk stores
    // > static real-world default (one-time seed). Guarantees every non-FCS team
    // resolves to a conference for every season with no default map at read time.
    const patch = computeConferenceBackfill(dynasty)
    const tids = Object.keys(patch)

    if (tids.length === 0) {
      // Nothing to write, but still flag the dynasty so the resolver treats
      // per-tid as authoritative and we don't retry the backfill every load.
      await updateDynasty(dynastyId, { _conferencesBackfilledV2: true })
      return { written: 0, message: 'All teams already have canonical conference data — nothing to migrate.' }
    }

    let totalWritten = 0
    if (useLocalStorage) {
      const localTeamsPatch = {}
      for (const tid of tids) {
        const base = dynasty.teams?.[tid]
        if (!base) continue
        const byYear = { ...(base.byYear || {}) }
        for (const [y, conf] of Object.entries(patch[tid])) {
          byYear[y] = { ...(byYear[y] || {}), conference: conf }
          totalWritten++
        }
        localTeamsPatch[tid] = { ...base, byYear }
      }
      await updateDynasty(dynastyId, {
        teams: { ...(dynasty.teams || {}), ...localTeamsPatch },
        _conferencesBackfilledV2: true,
      })
    } else {
      const cloudPatch = { _conferencesBackfilledV2: true }
      for (const tid of tids) {
        for (const [y, conf] of Object.entries(patch[tid])) {
          cloudPatch[`teams.${tid}.byYear.${y}.conference`] = conf
          totalWritten++
        }
      }
      await updateDynasty(dynastyId, cloudPatch)
    }

    return {
      written: totalWritten,
      message: `Migrated ${totalWritten} team/year conference assignments to the canonical per-team store.`,
    }
  }

  /**
   * Persist a bulk conference alignment for a single year. Writes to
   * BOTH the legacy stores (customConferencesByYear /
   * customConferences) and the per-team byYear field — the per-team
   * field is the new source of truth, and the legacy stores stay
   * for backward compatibility.
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
    // Divisions (optional): options.teamDivisions = { ABBR: divName } fans out to
    // each team's byYear[year].division; options.divisions = { conf: [n0,n1] } is
    // the authoritative "which conferences are split + names" for this season.
    const { localPatch, cloudPatch } = buildPerTeamConferencePatch(dynasty, year, conferenceMap, options.teamDivisions)
    const hasDivisions = options.divisions && typeof options.divisions === 'object'

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
      if (hasDivisions) {
        const existingDiv = dynasty.conferenceDivisionsByYear || {}
        updates.conferenceDivisionsByYear = { ...existingDiv, [yearKey]: options.divisions }
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
      if (hasDivisions) {
        cloudUpdates[`conferenceDivisionsByYear.${yearKey}`] = options.divisions
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
        // Pull EVERY subcollection the dynasty fanned off its main doc, or
        // the backup silently loses whatever we skip. Social + the Recruiting
        // Database were previously omitted here — so a cloud-dynasty export
        // produced a JSON with zero social universe and (for a dynasty not
        // opened this session) no recruiting database. Import already writes
        // all of these back, so the round-trip must export them too.
        const [players, games, weekRecaps, seasonalRehydrated, socialFeed, socialChars, recruitingDb] = await Promise.all([
          getPlayersSubcollection(dynasty.id),
          getGamesSubcollection(dynasty.id),
          getWeekRecapsSubcollection(dynasty.id),
          getSeasonsSubcollection(dynasty.id),
          getSocialFeedSubcollection(dynasty.id),
          getSocialCharactersSubcollection(dynasty.id),
          getRecruitingDatabaseSubcollection(dynasty.id),
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
          socialFeedByYear: socialFeed || {},
          socialCharacters: socialChars || {},
          ...((recruitingDb && recruitingDb.length > 0) ? { recruitingDatabasePlayers: recruitingDb } : {}),
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
    // Scout Staff config now lives on dynasty.scoutStaff, so it's already in
    // exportData above — no special-casing needed. (Older backups carried it
    // under a separate _scoutStaffData key; that's migrated back on import.)

    // Scout Staff config now lives on dynasty.scoutStaff, so it's already in
    // exportData above for any dynasty that's gone through the one-time cloud
    // migration (see ScoutStaff.jsx). Safety net for a dynasty that hasn't
    // been reopened since that migration shipped: fall back to reading the
    // legacy local-only store directly so nothing is silently left out.
    if (!exportData.scoutStaff) {
      try {
        const scoutStaffData = await getAllStaffDataForDynasty(dynasty.id)
        if (Object.keys(scoutStaffData).length > 0) {
          exportData.scoutStaff = scoutStaffData
        }
      } catch (err) {
        console.warn('Failed to include Scout Staff data in export:', err)
      }
    }

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
      _scoutStaffData: importedScoutStaffData, // legacy backups only; migrated onto scoutStaff below
      ...cleanDynastyData
    } = dynastyData

    // Legacy backups stored Scout Staff config under _scoutStaffData (a separate
    // local IndexedDB store). It now lives on dynasty.scoutStaff, so lift an old
    // backup's config onto the dynasty object when the new field isn't present.
    if (importedScoutStaffData && Object.keys(importedScoutStaffData).length > 0 && !cleanDynastyData.scoutStaff) {
      cleanDynastyData.scoutStaff = importedScoutStaffData
    }

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
      // Surface the new id on the returned object so callers (e.g. the sign-in
      // "Try it out" loader) can navigate straight into the imported dynasty.
      cleanDynastyData.id = newId

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
      // Production mode: Firestore - use subcollections for players,
      // games, week recaps, AND every PER_YEAR / PER_TEAM_YEAR
      // seasonal field. This avoids the 1 MB document size limit:
      // a long-running dynasty's
      //   recruitingCommitmentsByTeamYear (~300 KB)
      //   allAmericansByYear (~240 KB)
      //   weekRecapsByYear (~85 KB)
      //   schedulesByTeamYear (~60 KB)
      //   conferenceStandingsByYear (~35 KB)
      // alone routinely exceed the 1 MiB cap. Earlier import code
      // only stripped players + games and left the rest on the main
      // doc, which Firestore rejected with "exceeds the maximum
      // allowed size of 1,048,576 bytes" — see Alabama Prince's
      // import failure at 1,082,432 bytes.

      // Extract players, games, week recaps, the social feed/characters,
      // and every seasonal field. Whatever's left in mainDocData is
      // identity + small per-year scalars + dynasty.teams, which together
      // fit comfortably.
      //
      // socialFeedByYear + socialCharacters MUST be stripped here too: a
      // dynasty with an active social universe carries a multi-MB feed
      // (the exported social-universe blobs run ~2 MB), and leaving them
      // embedded pushed the import's main-doc write past Firestore's 1 MiB
      // cap — the exact "exceeds the maximum allowed size of 1,048,576
      // bytes" failure a social-heavy dynasty hit on import. The migrate
      // (Move to Cloud) path already fans these out; import must match it
      // or a user who exports/re-imports instead of migrating still fails.
      const { players, games, weekRecapsByYear, socialFeedByYear, socialCharacters, recruitingDatabasePlayers, ...rest } = cleanDynastyData
      const playerCount = players?.length || 0
      const gameCount = games?.length || 0

      // Pull every seasonal field off rest. Each gets routed to the
      // seasons subcollection via splitSeasonalUpdateByYear.
      const seasonalForSplit = {}
      const mainDocData = {}
      for (const [k, v] of Object.entries(rest)) {
        if (isSeasonalField(k)) {
          if (v && typeof v === 'object' && Object.keys(v).length > 0) {
            seasonalForSplit[k] = v
          }
          // either way, don't put seasonal field on main doc
          continue
        }
        mainDocData[k] = v
      }

      // Mark as using subcollections + flag that seasonal fields are
      // now in the subcollection (skip a redundant migration pass).
      mainDocData._subcollectionsMigrated = true
      mainDocData._seasonsMigratedAt = new Date().toISOString()
      // CRITICAL: this branch writes to Firestore, so the doc MUST declare
      // storageType: 'cloud'. Earlier in this function we defaulted to
      // 'local' (line ~9776) for the IndexedDB path; override it here.
      // The Firestore security rule rejects cloud-collection creates
      // unless storageType is exactly 'cloud'.
      mainDocData.storageType = 'cloud'

      // Stage 2: Create the main dynasty document (without players/games/seasonals)
      reportProgress('creating', 'Creating dynasty record...', 15)
      const result = await createDynastyInFirestore(user.uid, mainDocData)
      reportProgress('creating', 'Dynasty record created', 20)

      // Track every non-fatal stage failure so the completion message can be
      // honest. Previously recaps / social / recruiting DB failures were
      // console.warn'd and the user still saw "Import complete!" — a silently
      // incomplete cloud copy with no hint anything was missing.
      const importFailedParts = []

      // Stage 2b: Fan seasonal fields out into the seasons subcollection.
      // splitSeasonalUpdateByYear turns { allAmericansByYear: { 2027: [...] } }
      // into { 2027: { allAmericans: [...] } }, then writeSeasonalUpdate
      // setDoc({merge: true})s each year's payload into seasons/{year}.
      const seasonalKeyCount = Object.keys(seasonalForSplit).length
      if (seasonalKeyCount > 0) {
        reportProgress('seasonal', 'Importing seasonal data...', 22)
        const byYear = splitSeasonalUpdateByYear(seasonalForSplit)
        if (Object.keys(byYear).length > 0) {
          try {
            await writeSeasonalUpdate(result.id, byYear)
          } catch (err) {
            console.error('[import] seasonal data save failed:', err?.message)
            importFailedParts.push('schedules & season data')
          }
        }
      }

      // Stage 2c: Save week recaps to their dedicated subcollection.
      // Each (year, week) becomes its own doc — same shape used by
      // saveWeekRecapToSubcollection in normal save flow.
      if (weekRecapsByYear && typeof weekRecapsByYear === 'object') {
        const recapEntries = []
        for (const [yearStr, weeks] of Object.entries(weekRecapsByYear)) {
          if (!weeks || typeof weeks !== 'object') continue
          for (const [weekStr, entry] of Object.entries(weeks)) {
            if (!entry || typeof entry !== 'object') continue
            const yearN = Number(yearStr); const weekN = Number(weekStr)
            if (!Number.isFinite(yearN) || !Number.isFinite(weekN)) continue
            recapEntries.push({ yearN, weekN, entry })
          }
        }
        if (recapEntries.length > 0) {
          reportProgress('recaps', `Importing ${recapEntries.length} week recap${recapEntries.length === 1 ? '' : 's'}...`, 23)
          let recapFailures = 0
          for (const { yearN, weekN, entry } of recapEntries) {
            try { await saveWeekRecapToSubcollection(result.id, yearN, weekN, entry) }
            catch (err) { recapFailures++; console.warn('[import] week recap save failed:', yearN, weekN, err?.message) }
          }
          if (recapFailures > 0) importFailedParts.push(`week recaps (${recapFailures} failed)`)
        }
      }

      // Stage 2d: Fan the social feed out into its subcollection, one doc
      // per (year, week) — same shape saveSocialFeedToSubcollection uses in
      // the normal save flow and that migrate (Move to Cloud) fans out.
      // This is what keeps a multi-MB social universe off the main doc.
      if (socialFeedByYear && typeof socialFeedByYear === 'object') {
        let feedWeeks = 0
        let feedFailures = 0
        for (const [yearStr, byWeek] of Object.entries(socialFeedByYear)) {
          if (!byWeek || typeof byWeek !== 'object') continue
          for (const [weekStr, posts] of Object.entries(byWeek)) {
            if (!Array.isArray(posts) || posts.length === 0) continue
            const yearN = Number(yearStr); const weekN = Number(weekStr)
            if (!Number.isFinite(yearN) || !Number.isFinite(weekN)) continue
            try { await saveSocialFeedToSubcollection(result.id, yearN, weekN, posts); feedWeeks++ }
            catch (err) { feedFailures++; console.warn('[import] social feed save failed:', yearN, weekN, err?.message) }
          }
        }
        if (feedFailures > 0) importFailedParts.push(`social feed (${feedFailures} week${feedFailures === 1 ? '' : 's'} failed)`)
        if (feedWeeks > 0) reportProgress('social', `Importing ${feedWeeks} social feed week${feedWeeks === 1 ? '' : 's'}...`, 24)
      }

      // Stage 2e: Save social characters to their sharded subcollection.
      if (socialCharacters && typeof socialCharacters === 'object'
          && Object.keys(socialCharacters).length > 0) {
        try {
          await saveSocialCharacterShards(result.id, socialCharacters)
          reportProgress('social', `Importing ${Object.keys(socialCharacters).length} social character${Object.keys(socialCharacters).length === 1 ? '' : 's'}...`, 24)
        } catch (err) {
          console.warn('[import] social characters save failed:', err?.message)
          importFailedParts.push('social characters')
        }
      }

      // Stage 2f: Fan the Recruiting Database out into its own subcollection,
      // same as migrate (Move to Cloud) does. Previously recruitingDatabasePlayers
      // fell through into the main-doc write — a large recruit list could push
      // the main doc past Firestore's 1 MB cap and fail the whole import, and
      // even when it fit it landed in the wrong place (main doc, not the
      // recruitingDatabase subcollection).
      if (Array.isArray(recruitingDatabasePlayers) && recruitingDatabasePlayers.length > 0) {
        reportProgress('recruiting', `Importing ${recruitingDatabasePlayers.length} recruiting database recruit${recruitingDatabasePlayers.length === 1 ? '' : 's'}...`, 24)
        try {
          await saveRecruitingDatabaseSubcollection(result.id, recruitingDatabasePlayers)
        } catch (err) {
          console.warn('[import] recruiting database save failed:', err?.message)
          importFailedParts.push('recruiting database')
        }
      }

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
      if (importFailedParts.length > 0) {
        // Honest completion: the dynasty imported, but these parts did not
        // land in the cloud. The source file is untouched, so re-importing
        // (or Re-sync to Cloud in Account) can fill the gaps.
        reportProgress('complete', `Imported with issues — these did not upload: ${importFailedParts.join(', ')}. Your file is unchanged; re-import or use Re-sync to Cloud to finish.`, 100)
      } else {
        reportProgress('complete', 'Import complete!', 100)
      }
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
            // Reuse the tid the sheet reader already resolved (entry.schoolTid)
            // so teamsByYear gets a numeric tid, not a raw uppercase-name
            // string fallback. Fall back to name resolution only if absent.
            const teamTid = update.entry?.schoolTid != null
              ? Number(update.entry.schoolTid)
              : (getTidFromAbbr(update.addTeam, dynasty) || update.addTeam)
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
              schoolTid: update.entry.schoolTid ?? null,
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
              schoolTid: update.entry.schoolTid ?? null,
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
      // Convert team to tid for storage — prefer the schoolTid the sheet reader
      // already resolved so we don't re-run the weaker name resolver.
      const teamTid = newPlayer.entry?.schoolTid != null
        ? Number(newPlayer.entry.schoolTid)
        : (getTidFromAbbr(newPlayer.team, dynasty) || newPlayer.team)
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
              schoolTid: newPlayer.entry.schoolTid ?? null,
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
              schoolTid: newPlayer.entry.schoolTid ?? null,
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
          schoolTid: newPlayer.entry.schoolTid ?? null,
          class: newPlayer.entry.class
        })
      } else if (newPlayer.honorType === 'allConference') {
        player.allConference.push({
          year: newPlayer.entry.year,
          designation: newPlayer.entry.designation,
          position: newPlayer.entry.position,
          school: newPlayer.entry.school,
          schoolTid: newPlayer.entry.schoolTid ?? null,
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

        // Drop only null/undefined fields. NOT empty strings, and never a
        // structural/identity field: players are saved via a full-replace
        // set() per doc, so dropping a legitimately-empty value (e.g. a
        // cleared jerseyNumber: '') would permanently lose it (audit C5).
        const PROTECTED_PLAYER_KEYS = new Set(['pid', 'name', 'position', 'team'])
        Object.keys(cleaned).forEach(key => {
          if (PROTECTED_PLAYER_KEYS.has(key)) return
          if (cleaned[key] === null || cleaned[key] === undefined) {
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

    // 3. (Removed) Empty ByYear-object pruning.
    //
    // These fields are now sharded into the per-year `seasons` subcollection
    // and routed through a MERGE write, which cannot delete keys — so the
    // old cleanup here removed nothing yet still reported phantom savings
    // (audit C5). Doing it correctly would require `replaceSeasonal`, but a
    // bulk replace built from possibly-partial in-memory data risks DELETING
    // seasons that simply weren't loaded. Empty {} entries cost negligible
    // space, so the safe choice is to not touch seasonal fields here.

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
      // Split name parts ride alongside `name`; take the new values when the
      // editor supplied them, else keep whatever the slot already had.
      teamName: updates.teamName != null ? updates.teamName : team.teamName,
      nickname: updates.nickname != null ? updates.nickname : team.nickname,
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
      teamName: newTeam.teamName != null ? newTeam.teamName : (newTeam.name || abbr),
      nickname: newTeam.nickname != null ? newTeam.nickname : '',
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
        // ROOT-CAUSE GUARD for "switched local→cloud, roster empty": the
        // migration re-reads the dynasty straight from IndexedDB, which can lag
        // the live in-memory roster (edits held in React state that haven't
        // round-tripped to the on-disk doc yet). If we migrate the stale doc,
        // its (empty/partial) players get uploaded and the complete local copy
        // is then deleted. Flush the freshest roster + Recruiting DB into the
        // local doc FIRST so the migration reads a complete record.
        try {
          const live = String(currentDynasty?.id) === String(dynastyId) ? currentDynasty : dynasty
          // Read React state DIRECTLY — getDynastyPlayers re-reads IndexedDB
          // for local dynasties (disk wins), which made this flush a no-op for
          // exactly the case it exists for: in-memory edits fresher than disk.
          const livePlayers = (Array.isArray(live?.players) && live.players.length > 0)
            ? live.players
            : await getDynastyPlayers(live)
          const flush = {}
          if (Array.isArray(livePlayers) && livePlayers.length) flush.players = livePlayers
          if (Array.isArray(live?.recruitingDatabasePlayers) && live.recruitingDatabasePlayers.length) {
            flush.recruitingDatabasePlayers = live.recruitingDatabasePlayers
          }
          if (Object.keys(flush).length) {
            await indexedDBStorage.updateDynasty(dynastyId, flush)
          }
        } catch (flushErr) {
          console.warn('[migrateDynastyStorage] pre-migration roster flush failed:', flushErr)
        }
        // Local → Cloud
        result = await storageService.migrateDynastyToCloud(dynastyId)
      } else {
        // Cloud → Local
        result = await storageService.migrateDynastyToLocal(dynastyId)
      }

      if (result.success) {
        // Functional setter: the Firestore listener can fire during the long
        // awaited upload above — a closure-captured `dynasties` here would
        // overwrite whatever it changed with a stale array.
        setDynasties(prev => prev.map(d =>
          String(d.id) === String(dynastyId) || String(d.id) === String(result.dynasty?.id)
            ? { ...d, ...result.dynasty, storageType: targetStorageType }
            : d
        ))

        // Update currentDynasty if it's the one being migrated
        setCurrentDynasty(prev =>
          (prev && String(prev.id) === String(dynastyId))
            ? { ...prev, ...result.dynasty, storageType: targetStorageType }
            : prev
        )
      }

      return result
    } catch (error) {
      console.error('Migration error:', error)
      return { success: false, error: error.message || 'Migration failed' }
    }
  }

  // Depth Chart: persist a team's whole depth-chart state in ONE write. The
  // page batches edits in local draft state and calls this once on Save.
  // dataForTid = { slotOf: { pid: slotId }, order: { slotId: [pid] }, leaveFlags: [pid] }.
  // Writes the whole (small) teamFuture object so it works for both storage
  // tiers and reads back nested under teamFuture[tid].
  const saveTeamFuture = (dynastyId, tid, dataForTid) => {
    const tf = currentDynasty?.teamFuture || {}
    return updateDynasty(dynastyId, { teamFuture: { ...tf, [tid]: dataForTid } })
  }

  // Persist the user-curated rivalry list (formed rivalries, names, trophies).
  const saveRivalries = (dynastyId, rivalries) => {
    return updateDynasty(dynastyId, { rivalries })
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

  // Re-pull a shared dynasty's subcollections and push fresh data into both
  // the shared-list entry and currentDynasty. This is the live-sync path for
  // editors: the shared-dynasty listener only carries main-doc metadata, so
  // when the owner or another editor writes (which bumps lastModified), we
  // reload players/games/recaps/seasons here so this editor sees the change.
  // Skipped while a local save or phase transition is in flight to avoid
  // clobbering in-progress edits.
  const refreshSharedSubcollections = async (dynId) => {
    if (!dynId) return
    const guard = () => skipListenerUpdatesCountRef.current === 0 && !phaseTransitionInProgressRef.current
    const apply = (patch) => {
      if (!patch || !Object.keys(patch).length) return
      // Recent-write protection (same rule as the owner path's
      // reconcileWithRecentWrites): a server re-read racing this editor's
      // own just-saved roster/games must not revert them with a stale copy.
      const now = Date.now()
      if (patch.players
          && String(lastPlayersUpdateDynastyIdRef.current) === String(dynId)
          && (now - lastPlayersUpdateTimestampRef.current) < RECENT_WRITE_PROTECTION_MS) {
        delete patch.players
      }
      if (patch.games
          && String(lastGamesUpdateDynastyIdRef.current) === String(dynId)
          && (now - lastGamesUpdateTimestampRef.current) < RECENT_WRITE_PROTECTION_MS) {
        delete patch.games
      }
      if (!Object.keys(patch).length) return
      setSharedDynasties(prev => prev.map(d => String(d.id) === String(dynId) ? { ...d, ...patch } : d))
      setCurrentDynasty(prev => (prev && String(prev.id) === String(dynId)) ? { ...prev, ...patch } : prev)
    }
    try {
      const [players, games, recaps, seasons, recruitingDb] = await Promise.all([
        // meta.requestedAt lets apply() drop a read that predates this
        // editor's own save (see isStaleFreshRead) instead of reverting it.
        getPlayersSubcollection(dynId, { onFresh: (fresh, meta) => { if (guard() && !isStaleFreshRead(dynId, meta, lastPlayersUpdateTimestampRef, lastPlayersUpdateDynastyIdRef)) apply({ players: fresh }) } }),
        getGamesSubcollection(dynId, { onFresh: (fresh, meta) => { if (guard() && !isStaleFreshRead(dynId, meta, lastGamesUpdateTimestampRef, lastGamesUpdateDynastyIdRef)) apply({ games: fresh }) } }),
        getWeekRecapsSubcollection(dynId, { onFresh: (fresh) => { if (guard()) apply({ weekRecapsByYear: fresh }) } }),
        getSeasonsSubcollection(dynId, { onFresh: (fresh) => { if (guard()) apply(fresh) } }),
        // Recruiting Database — without this, a teammate's recruit edits stay
        // invisible to other shared-league editors until a full page reload.
        getRecruitingDatabaseSubcollection(dynId, { onFresh: (fresh) => { if (guard()) apply({ recruitingDatabasePlayers: fresh }) } }).catch(() => []),
      ])
      if (!guard()) return
      const patch = {}
      if (Array.isArray(players) && players.length) patch.players = players
      if (Array.isArray(games) && games.length) patch.games = games
      if (recaps && Object.keys(recaps).length) patch.weekRecapsByYear = recaps
      if (seasons && Object.keys(seasons).length) Object.assign(patch, seasons)
      if (Array.isArray(recruitingDb) && recruitingDb.length) patch.recruitingDatabasePlayers = recruitingDb
      apply(patch)
    } catch (e) {
      console.warn('[shared sync] subcollection refresh failed:', e?.code || e?.message || e)
    }
  }

  useEffect(() => {
    if (!user?.uid) {
      setSharedDynasties([])
      return
    }
    const unsub = subscribeToSharedDynasties(user.uid, (leagues) => {
      // Drain the write-echo skip counter here too. updateDynasty sets it to
      // 3 on EVERY cloud write, but only the OWNER listener decremented it —
      // a shared write never fires that listener for the writer, so a
      // non-owner editor who owns no cloud dynasties had the counter stuck
      // at 3 forever: this whole callback's live-sync stayed gated OFF and
      // they never saw teammates' changes again until a reload.
      if (skipListenerUpdatesCountRef.current > 0) {
        if (Date.now() - skipListenerTimestampRef.current > 300000) {
          skipListenerUpdatesCountRef.current = 0
        } else {
          skipListenerUpdatesCountRef.current--
          return
        }
      }
      const tagged = leagues
        .filter(d => d.userId !== user.uid)
        .map(d => ({ ...d, storageType: 'cloud' }))
      // Preserve already-hydrated subcollection fields so a metadata-only
      // snapshot doesn't blank a loaded shared dynasty's roster/games.
      setSharedDynasties(prev => {
        const prevById = new Map(prev.map(d => [String(d.id), d]))
        return applyMigrations(tagged.map(d => {
          const old = prevById.get(String(d.id))
          if (old && (old.players || old.games)) {
            return { ...d, players: old.players, games: old.games, weekRecapsByYear: old.weekRecapsByYear }
          }
          return d
        }))
      })
      // Live-sync the currently-open shared dynasty when another user writes.
      const openId = currentDynastyIdRef.current
      const openFresh = tagged.find(d => String(d.id) === String(openId))
      if (openFresh
          && skipListenerUpdatesCountRef.current === 0
          && !phaseTransitionInProgressRef.current) {
        // Sync main-doc fields (advanceReady, editors, currentWeek/phase/year,
        // teams, etc.) into currentDynasty so editors see each other's main-doc
        // changes live (the ready-up pill, calendar position, ...). Preserve
        // subcollection-hydrated fields (players/games/recaps + seasonal) so
        // the metadata-only snapshot doesn't blank them.
        setCurrentDynasty(prev => {
          if (!prev || String(prev.id) !== String(openId)) return prev
          const merged = { ...prev }
          for (const [k, v] of Object.entries(openFresh)) {
            if (k === 'players' || k === 'games' || k === 'weekRecapsByYear') continue
            if (ALL_SEASONAL_FIELD_NAMES.includes(k)) continue
            merged[k] = v
          }
          // Same stale-echo protection the owner path gets: a snapshot
          // arriving within the recent-write window must not revert fields
          // this editor just saved (skip-counter drain alone is shorter than
          // the 20s durability window).
          return reconcileWithRecentWrites(merged, prev)
        })
        // Only re-pull subcollections when THIS shared dynasty's main doc
        // advanced (a teammate wrote to it). When the fire was caused by a
        // different shared dynasty, the open one's rev is unchanged → skip the
        // 4-subcollection re-read. rev===0 (no timestamp) always refreshes.
        const openRev = dynastyDocRev(openFresh)
        if (openRev === 0 || sharedRefreshRevRef.current[openId] !== openRev) {
          sharedRefreshRevRef.current[openId] = openRev
          refreshSharedSubcollections(openId)
        }
      } else if (openId
                 && !openFresh
                 && skipListenerUpdatesCountRef.current === 0
                 && !phaseTransitionInProgressRef.current) {
        // The open dynasty is a SHARED one that just disappeared from our
        // snapshot — the owner deleted it or revoked our access. Drop it so
        // we don't keep editing a dead doc whose writes silently fail
        // (audit M6). Guard inside the setter: never null a dynasty we OWN
        // (owned dynasties never appear in the shared snapshot, so absence
        // there is expected and handled by the owner-list effect).
        setCurrentDynasty(prev => {
          if (!prev || String(prev.id) !== String(openId)) return prev
          if (prev.userId === user?.uid) return prev
          try { toast.info('This dynasty is no longer available — it may have been deleted by the commish.') } catch {}
          return null
        })
      }
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

  // The list of tids this user controls in the current dynasty — the
  // current-season team of every coach they control (so each separately
  // tracked coach's team stays switchable/writable from the TeamSwitcher).
  // Empty array if none — callers fall back to the dynasty-doc currentTid.
  const userTeams = (currentDynasty && user?.uid)
    ? getCurrentTeamsForControlledCoaches(currentDynasty, user.uid)
    : []

  // The user's currently-focused tid: the saved active selection if it
  // still belongs to them, else their first assigned team.
  //
  // Resolution is uid-scoped and mirrors Home.jsx's getViewerTid: prefer the
  // teams the user's controlled coaches hold, but FALL BACK to their
  // memberTeams membership slot. Without that fallback, a returning user whose
  // controlled-coach records didn't resolve (e.g. a commish after logout/login)
  // got activeUserTid === null, the per-user override below no-op'd, and the
  // Dashboard read the shared, owner-scoped currentTid — which could be a
  // co-member's team (the "commish logs in and sees his buddy's Tulsa" bug).
  const activeUserTid = (() => {
    if (!_activeTeamKey || !user?.uid) return null
    const mine = userTeams.length > 0 ? userTeams : getMemberTeams(currentDynasty, user.uid)
    if (mine.length === 0) return null
    const saved = activeTeamByKey[_activeTeamKey]
    if (saved != null && mine.includes(Number(saved))) return Number(saved)
    return mine[0]
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
    // The `userId: 'currentUser'` sentinel is a SHARED field on the teams map,
    // so a co-member's session can leave it stamped on THEIR team. Because
    // getUserTeamTid() returns the sentinel team BEFORE currentTid, we can't
    // shortcut on `currentTid === myTid` alone — the sentinel may still point
    // at another team (the "commish's currentTid is CSU but the sentinel is on
    // the buddy's Tulsa" bug). Only skip the remap when currentTid matches AND
    // the sentinel already sits on exactly myTid.
    const teamsMap = currentDynasty.teams || {}
    const sentinelTids = Object.keys(teamsMap)
      .filter((t) => teamsMap[t]?.userId === 'currentUser')
      .map(Number)
    const sentinelCorrect = sentinelTids.length === 1 && sentinelTids[0] === Number(myTid)
    if (Number(currentDynasty.currentTid) === Number(myTid) && sentinelCorrect) return currentDynasty
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

  // Layer the non-destructive PREVIEW on top of the team-remap override. Only
  // the calendar fields change, and only on the exposed object — the real
  // currentDynasty state (used by all persistence) is untouched.
  const previewedCurrentDynasty = (phaseOverride && overriddenCurrentDynasty)
    ? {
        ...overriddenCurrentDynasty,
        ...(phaseOverride.year != null ? { currentYear: phaseOverride.year } : {}),
        currentPhase: phaseOverride.phase,
        currentWeek: phaseOverride.week,
        __phasePreview: true,
      }
    : overriddenCurrentDynasty

  // Overlay the dedicated social state onto the exposed currentDynasty so
  // consumers read currentDynasty.socialCharacters / .socialFeedByYear as
  // before, but the data survives every dynasty-listener rebuild.
  const exposedCurrentDynasty = (() => {
    if (!previewedCurrentDynasty) return previewedCurrentDynasty
    const social = socialByDynasty[previewedCurrentDynasty.id]
    if (!social) return previewedCurrentDynasty
    return {
      ...previewedCurrentDynasty,
      socialCharacters: social.characters,
      socialFeedByYear: social.feed,
    }
  })()

  // ─── Advance ready-up (multiplayer) ──────────────────────────────
  // Each editor can mark themselves "ready to advance". A user is ready when
  // their entry in dynasty.advanceReady equals the CURRENT advance stamp
  // (year|week|phase). The stamp changes on every advance, so all prior ready
  // flags auto-expire — no cleanup write needed. Force-advance users
  // (commish + co-commishes) can advance immediately; the owner's client
  // auto-advances once every editor is ready (see Layout).
  const advanceStampOf = (d) =>
    d ? `${d.currentYear}|${d.currentWeek}|${d.currentPhase}` : ''

  const advanceReadyInfo = (() => {
    const d = currentDynasty
    if (!d || d.storageType !== 'cloud') {
      return { isShared: false, stamp: '', total: 0, readyCount: 0, allReady: false, iAmReady: false, canForceAdvance: true, isOwner: true, readyUids: [] }
    }
    // The owner is a participant even if they aren't in editors[] — after a
    // commish transfer the new owner is removed from editors (audit M4), so
    // union userId in to avoid undercounting participants / letting the week
    // auto-advance without the owner being ready.
    const editorList = Array.isArray(d.editors) ? d.editors : []
    const editors = d.userId && !editorList.includes(d.userId)
      ? [...editorList, d.userId]
      : editorList
    const stamp = advanceStampOf(d)
    const ready = d.advanceReady || {}
    const readyUids = editors.filter(uid => ready[uid] === stamp)
    return {
      isShared: editors.length > 1,
      stamp,
      total: editors.length,
      readyCount: readyUids.length,
      readyUids,
      allReady: editors.length > 0 && readyUids.length === editors.length,
      iAmReady: !!user?.uid && ready[user.uid] === stamp,
      canForceAdvance: canManageMembers(d, user?.uid),
      isOwner: d.userId === user?.uid,
    }
  })()

  const toggleAdvanceReady = async (dynastyId, ready) => {
    if (!user?.uid) return
    const d = (String(currentDynasty?.id) === String(dynastyId))
      ? currentDynasty
      : (dynasties.find(x => String(x.id) === String(dynastyId))
         || sharedDynasties.find(x => String(x.id) === String(dynastyId)))
    if (!d) return
    const stamp = advanceStampOf(d)
    // Dot-notation so concurrent ready toggles merge into advanceReady rather
    // than clobbering the whole map.
    await updateDynasty(dynastyId, { [`advanceReady.${user.uid}`]: ready ? stamp : '' })
  }

  const value = {
    dynasties: dynastiesWithShared,
    currentDynasty: exposedCurrentDynasty,
    phaseOverride,
    setPhaseOverride,
    userTeams,
    activeUserTid,
    setActiveTeam,
    advanceReadyInfo,
    toggleAdvanceReady,
    customTeams,
    loading,
    cloudSyncing,
    loadingDynastyId,
    isPcDynastyDataConfirmed,
    isViewOnly,
    createDynasty,
    updateDynasty,
    syncDynastyFromCFB27Save,
    saveWeekRecap,
    deleteWeekRecap,
    savePlayoffPreview,
    deletePlayoffPreview,
    // Social Media feature
    loadSocial,
    importSocialUniverse,
    upgradeSocialUniverseToLatest,
    saveSocialPosts,
    replaceSocialWeek,
    saveSocialCharacters,
    deleteSocialCharacters,
    updateSocialSettings,
    updateSocialPlatform,
    deleteDynasty,
    selectDynasty,
    addGame,
    updateGame,
    deleteGame,
    patchGameFields,
    applyChangedPlayers,
    saveGameSetChanges,
    saveCPUBowlGames,
    saveWeeklyScores,
    saveRankings,
    saveCFPGames,
    saveCPUConferenceChampionships,
    saveConferenceChampionshipsHistoryFromSheet,
    advanceWeek,
    advanceToNewSeason,
    revertWeek,
    saveSchedule,
    saveRoster,
    saveTeamRatings,
    saveTeamYearInfo,
    saveAllTeamRatings,
    saveCoachingStaff,
    saveStaffMoves,
    updatePlayer,
    updateRecruitingDatabasePlayers,
    recoverRecruitData,
    recoverRosterData,
    deletePlayer,
    getDynastyPlayers,
    syncAllPlayersStats,
    createGoogleSheetForDynasty,
    createTempSheetWithData,
    deleteSheetAndClearRefs,
    createConferencesSheetForDynasty,
    saveConferences,
    saveConferenceAlignment,
    migrateConferencesToPerTeam,
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
    saveTeamFuture,
    saveRivalries,
  }

  return (
    <DynastyContext.Provider value={value}>
      {children}
    </DynastyContext.Provider>
  )
}

export default DynastyContext
