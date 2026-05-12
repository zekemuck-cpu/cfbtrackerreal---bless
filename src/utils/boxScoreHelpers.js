// Single source of truth for box-score storage and lookup.
//
// Canonical shape (post-refactor):
//
//   game.boxScore = {
//     byTid: {
//       [tid]: { passing: [], rushing: [], receiving: [], blocking: [],
//                defense: [], kicking: [], punting: [], kickReturn: [],
//                puntReturn: [] }
//     },
//     teamStatsByTid: {
//       [tid]: { teamAbbr, firstDowns, totalOffense, ... }
//     },
//     scoringSummary: [ ... ]   // unchanged — already team-attributed
//   }
//
//   game.playerStatsSheetIdByTid = { [tid]: 'google-sheet-id' }
//   game.teamStatsSheetId        = 'google-sheet-id'   // one sheet, both teams
//   game.scoringSummarySheetId   = 'google-sheet-id'   // one sheet, both teams
//
// Legacy shape (pre-refactor, still on disk for unedited games):
//
//   game.boxScore = {
//     home:      { passing: [], ... },                 // home team's stats
//     away:      { passing: [], ... },                 // away team's stats
//     teamStats: { home: { teamAbbr, ... }, away: { teamAbbr, ... } },
//     scoringSummary: [ ... ]
//   }
//   game.homeStatsSheetId / game.awayStatsSheetId
//
// All reads go through helpers in this file so legacy games continue to
// work without an on-disk migration; the first time a legacy game is
// written via setBoxScoreForTid / setTeamStatsForTid it lands in the
// canonical shape.

import { resolveTid, getTidFromAbbr } from '../data/teamRegistry'

export const PLAYER_STAT_KEYS = [
  'passing', 'rushing', 'receiving', 'blocking',
  'defense', 'kicking', 'punting', 'kickReturn', 'puntReturn'
]

// Coerce anything that smells like a tid to a Number, returning null for
// values that can't be tids. Object keys come back as strings from Object
// iteration; comparing them to game.team1Tid (a Number) silently fails
// without this normalization.
function asTid(value) {
  if (value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

// Resolve which tid corresponds to the legacy boxScore.home and
// boxScore.away slots for a given game. Order of preference:
//   1. teamStats.{home,away}.teamAbbr — explicitly written into the slot
//      when the team-stats sheet was read back (most reliable).
//   2. game.homeTeamTid — when set, that team is "home"; the other one
//      (team1Tid or team2Tid, whichever isn't home) is "away".
//   3. Neutral-site convention — team1 = "home", team2 = "away".
//      Matches BoxScoreSheetModal:113-118 and GameEdit:1870-1876, the
//      two writers that produced legacy data.
function resolveLegacySlotTids(game, teamsRegistry) {
  if (!game) return { homeTid: null, awayTid: null }

  const homeAbbr = game.boxScore?.teamStats?.home?.teamAbbr
  const awayAbbr = game.boxScore?.teamStats?.away?.teamAbbr
  let homeTid = homeAbbr ? asTid(resolveTid(homeAbbr, teamsRegistry) ?? getTidFromAbbr(homeAbbr, teamsRegistry)) : null
  let awayTid = awayAbbr ? asTid(resolveTid(awayAbbr, teamsRegistry) ?? getTidFromAbbr(awayAbbr, teamsRegistry)) : null
  if (homeTid != null && awayTid != null) return { homeTid, awayTid }

  const t1 = asTid(game.team1Tid)
  const t2 = asTid(game.team2Tid)
  const hT = asTid(game.homeTeamTid)
  if (hT != null && t1 != null && t2 != null) {
    if (hT === t1) return { homeTid: t1, awayTid: t2 }
    if (hT === t2) return { homeTid: t2, awayTid: t1 }
  }
  // Neutral or pre-tid legacy: team1 is "home" by convention.
  return { homeTid: t1, awayTid: t2 }
}

// Return the boxScore in canonical (byTid) form, migrating legacy
// shape on the fly without mutating the original. Idempotent: a game
// already in canonical form is returned with its byTid / teamStatsByTid
// untouched. Returns null when the game has no boxScore at all.
export function canonicalBoxScore(game, teamsRegistry = null) {
  const bs = game?.boxScore
  if (!bs) return null

  // Already canonical — pass through. Tolerate teamStatsByTid missing on
  // games where only player stats were entered (and vice versa).
  if (bs.byTid || bs.teamStatsByTid) {
    return {
      byTid: bs.byTid || {},
      teamStatsByTid: bs.teamStatsByTid || {},
      scoringSummary: bs.scoringSummary || []
    }
  }

  // Legacy shape — fan out home/away to tids.
  const { homeTid, awayTid } = resolveLegacySlotTids(game, teamsRegistry)
  const byTid = {}
  const teamStatsByTid = {}

  const hasContent = (obj) => obj && typeof obj === 'object' && Object.keys(obj).length > 0

  if (homeTid != null && hasContent(bs.home)) byTid[homeTid] = bs.home
  if (awayTid != null && hasContent(bs.away)) byTid[awayTid] = bs.away
  if (homeTid != null && hasContent(bs.teamStats?.home)) teamStatsByTid[homeTid] = bs.teamStats.home
  if (awayTid != null && hasContent(bs.teamStats?.away)) teamStatsByTid[awayTid] = bs.teamStats.away

  return {
    byTid,
    teamStatsByTid,
    scoringSummary: bs.scoringSummary || []
  }
}

// ---------- READ helpers ----------

export function getPlayerStatsForTid(game, tid, teamsRegistry = null) {
  const t = asTid(tid)
  if (t == null) return null
  const bs = canonicalBoxScore(game, teamsRegistry)
  if (!bs) return null
  return bs.byTid[t] || null
}

export function getTeamStatsForTid(game, tid, teamsRegistry = null) {
  const t = asTid(tid)
  if (t == null) return null
  const bs = canonicalBoxScore(game, teamsRegistry)
  if (!bs) return null
  return bs.teamStatsByTid[t] || null
}

export function getScoringSummary(game, teamsRegistry = null) {
  const bs = canonicalBoxScore(game, teamsRegistry)
  return bs?.scoringSummary || []
}

export function listPlayerStatsTids(game, teamsRegistry = null) {
  const bs = canonicalBoxScore(game, teamsRegistry)
  if (!bs) return []
  return Object.keys(bs.byTid).map(asTid).filter(t => t != null)
}

export function listTeamStatsTids(game, teamsRegistry = null) {
  const bs = canonicalBoxScore(game, teamsRegistry)
  if (!bs) return []
  return Object.keys(bs.teamStatsByTid).map(asTid).filter(t => t != null)
}

export function hasAnyPlayerStats(game, teamsRegistry = null) {
  const bs = canonicalBoxScore(game, teamsRegistry)
  if (!bs) return false
  for (const t of Object.keys(bs.byTid)) {
    const slot = bs.byTid[t]
    if (!slot) continue
    for (const k of PLAYER_STAT_KEYS) {
      if (Array.isArray(slot[k]) && slot[k].length > 0) return true
    }
  }
  return false
}

export function hasPlayerStatsForTid(game, tid, teamsRegistry = null) {
  const slot = getPlayerStatsForTid(game, tid, teamsRegistry)
  if (!slot) return false
  for (const k of PLAYER_STAT_KEYS) {
    if (Array.isArray(slot[k]) && slot[k].length > 0) return true
  }
  return false
}

export function hasAnyTeamStats(game, teamsRegistry = null) {
  return listTeamStatsTids(game, teamsRegistry).length > 0
}

// ---------- WRITE helpers (immutable — return new game object) ----------

// Drop the legacy slots when writing — they'd otherwise drift from the
// canonical byTid view and become a second source of truth.
function stripLegacyBoxScore(prev) {
  if (!prev) return undefined
  const { home, away, teamStats, ...rest } = prev
  return rest
}

export function setPlayerStatsForTid(game, tid, data, teamsRegistry = null) {
  const t = asTid(tid)
  if (t == null) return game
  const canon = canonicalBoxScore(game, teamsRegistry) || { byTid: {}, teamStatsByTid: {}, scoringSummary: [] }
  return {
    ...game,
    boxScore: {
      ...stripLegacyBoxScore(game?.boxScore),
      byTid: { ...canon.byTid, [t]: data || {} },
      teamStatsByTid: canon.teamStatsByTid,
      scoringSummary: canon.scoringSummary || []
    }
  }
}

export function setTeamStatsForTid(game, tid, stats, teamsRegistry = null) {
  const t = asTid(tid)
  if (t == null) return game
  const canon = canonicalBoxScore(game, teamsRegistry) || { byTid: {}, teamStatsByTid: {}, scoringSummary: [] }
  return {
    ...game,
    boxScore: {
      ...stripLegacyBoxScore(game?.boxScore),
      byTid: canon.byTid,
      teamStatsByTid: { ...canon.teamStatsByTid, [t]: stats || {} },
      scoringSummary: canon.scoringSummary || []
    }
  }
}

export function setScoringSummary(game, scoringSummary, teamsRegistry = null) {
  const canon = canonicalBoxScore(game, teamsRegistry) || { byTid: {}, teamStatsByTid: {}, scoringSummary: [] }
  return {
    ...game,
    boxScore: {
      ...stripLegacyBoxScore(game?.boxScore),
      byTid: canon.byTid,
      teamStatsByTid: canon.teamStatsByTid,
      scoringSummary: scoringSummary || []
    }
  }
}

// Build a fresh canonical boxScore object from a per-tid stats map and
// optional scoring summary. Used by writers that produce a complete
// boxScore at once (e.g. the random generator, sheet readers).
export function buildBoxScore({ playerStatsByTid = {}, teamStatsByTid = {}, scoringSummary = [] } = {}) {
  const byTid = {}
  for (const [k, v] of Object.entries(playerStatsByTid || {})) {
    const t = asTid(k)
    if (t == null) continue
    byTid[t] = v
  }
  const teamStats = {}
  for (const [k, v] of Object.entries(teamStatsByTid || {})) {
    const t = asTid(k)
    if (t == null) continue
    teamStats[t] = v
  }
  return {
    byTid,
    teamStatsByTid: teamStats,
    scoringSummary: scoringSummary || []
  }
}

// ---------- Sheet ID helpers ----------

export function getPlayerStatsSheetIdForTid(game, tid, teamsRegistry = null) {
  const t = asTid(tid)
  if (t == null) return null
  const byTid = game?.playerStatsSheetIdByTid
  if (byTid && byTid[t] != null) return byTid[t]
  if (byTid && byTid[String(t)] != null) return byTid[String(t)]
  // Legacy fallback — resolve home/away sheet IDs through the same tid
  // mapping used for legacy box-score slots.
  if (game?.homeStatsSheetId || game?.awayStatsSheetId) {
    const { homeTid, awayTid } = resolveLegacySlotTids(game, teamsRegistry)
    if (t === homeTid) return game.homeStatsSheetId || null
    if (t === awayTid) return game.awayStatsSheetId || null
  }
  return null
}

export function setPlayerStatsSheetIdForTid(game, tid, sheetId) {
  const t = asTid(tid)
  if (t == null) return game
  const prev = game?.playerStatsSheetIdByTid || {}
  const next = { ...prev, [t]: sheetId }
  // Drop the legacy fields so the new tid-keyed store is the only place
  // sheet IDs live. Mixing both would re-introduce home/away drift.
  const { homeStatsSheetId, awayStatsSheetId, ...rest } = game || {}
  return { ...rest, playerStatsSheetIdByTid: next }
}

// ---------- Migration utility (eager — for the DangerZone tool) ----------

// Take a single game and return its canonical form. Drops legacy fields.
// Idempotent: a game already in canonical form is returned with its
// legacy fields stripped.
export function migrateGameToCanonical(game, teamsRegistry = null) {
  if (!game) return game
  const canon = canonicalBoxScore(game, teamsRegistry)
  const { homeStatsSheetId, awayStatsSheetId, ...rest } = game

  const playerStatsSheetIdByTid = { ...(game.playerStatsSheetIdByTid || {}) }
  if (homeStatsSheetId || awayStatsSheetId) {
    const { homeTid, awayTid } = resolveLegacySlotTids(game, teamsRegistry)
    if (homeTid != null && homeStatsSheetId && playerStatsSheetIdByTid[homeTid] == null) {
      playerStatsSheetIdByTid[homeTid] = homeStatsSheetId
    }
    if (awayTid != null && awayStatsSheetId && playerStatsSheetIdByTid[awayTid] == null) {
      playerStatsSheetIdByTid[awayTid] = awayStatsSheetId
    }
  }

  const out = { ...rest }
  if (canon) {
    out.boxScore = canon
  }
  if (Object.keys(playerStatsSheetIdByTid).length > 0) {
    out.playerStatsSheetIdByTid = playerStatsSheetIdByTid
  }
  return out
}
