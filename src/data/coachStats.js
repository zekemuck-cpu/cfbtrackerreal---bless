/**
 * Per-coach lifetime summaries — single source of truth for the
 * Coaches leaderboard, Coach Career headline, and any future
 * "compare two coaches" surface.
 *
 * Pure derivation: walks dynasty.games[] filtered by memberTeamHistory[uid].
 * No state of its own; safe to call on every render.
 */

import { getCoachNameForUid } from './leagueModel'

// Game-type constants mirror DynastyContext.GAME_TYPES. Inlined here
// to avoid the circular import (DynastyContext is the consumer surface;
// helper files like this one stay leaf nodes).
const TYPE_BOWL = 'bowl'
const TYPE_CC = 'conference_championship'
const TYPE_CFP_FR = 'cfp_first_round'
const TYPE_CFP_QF = 'cfp_quarterfinal'
const TYPE_CFP_SF = 'cfp_semifinal'
const TYPE_CFP_NC = 'cfp_championship'

function isPlayed(g) {
  if (!g) return false
  if (g.isPlayed) return true
  if (g.team1Score == null || g.team2Score == null) return false
  return (g.team1Score + g.team2Score) > 0
}

function isBowlGame(g) {
  return !!(g.isBowlGame || g.gameType === TYPE_BOWL)
}

function isConferenceChampionshipGame(g) {
  return !!(g.isConferenceChampionship || g.gameType === TYPE_CC)
}

function isNationalChampionshipGame(g) {
  return !!(g.isCFPChampionship || g.gameType === TYPE_CFP_NC)
}

function isCFPGame(g) {
  return !!(
    g.isCFPFirstRound || g.isCFPQuarterfinal || g.isCFPSemifinal || g.isCFPChampionship ||
    g.gameType === TYPE_CFP_FR || g.gameType === TYPE_CFP_QF ||
    g.gameType === TYPE_CFP_SF || g.gameType === TYPE_CFP_NC
  )
}

/**
 * Walk memberTeamHistory[uid] in chronological order and produce
 * contiguous stints — runs of consecutive years on the same team.
 * Each stint: { tid, startYear, endYear, years }.
 *
 * Multi-team years collapse to one stint per tid. A coach who held
 * two teams simultaneously in 2025 (commish shepherding) gets two
 * separate stint entries for that year, joined to whichever side
 * extends backward / forward.
 *
 * Single source of truth — same map the timeline editor and Coach
 * Career page read. So edits in /league flow into stints immediately.
 */
export function getCoachStints(dynasty, uid) {
  if (!dynasty || !uid) return []
  const yearTeams = buildYearTeamsMap(dynasty, uid)
  const sortedYears = Object.keys(yearTeams).map(Number).filter(Number.isFinite).sort((a, b) => a - b)
  if (sortedYears.length === 0) return []

  // Track open stints per tid; close when a year breaks the run.
  const open = new Map() // tid → { startYear, endYear }
  const closed = []

  for (const year of sortedYears) {
    const tids = Array.from(yearTeams[year])
    const tidSet = new Set(tids)
    // Close stints whose tid isn't in this year OR whose endYear is not year-1.
    for (const [tid, stint] of Array.from(open.entries())) {
      if (!tidSet.has(tid) || stint.endYear < year - 1) {
        closed.push({ tid, startYear: stint.startYear, endYear: stint.endYear })
        open.delete(tid)
      }
    }
    // Extend or open a stint per tid in this year.
    for (const tid of tids) {
      const existing = open.get(tid)
      if (existing) {
        existing.endYear = year
      } else {
        open.set(tid, { startYear: year, endYear: year })
      }
    }
  }
  for (const [tid, stint] of open) {
    closed.push({ tid, startYear: stint.startYear, endYear: stint.endYear })
  }

  // Sort by startYear asc, then endYear asc, then tid for determinism.
  closed.sort((a, b) => a.startYear - b.startYear || a.endYear - b.endYear || a.tid - b.tid)
  // Add years count for convenience.
  return closed.map(s => ({ ...s, years: s.endYear - s.startYear + 1 }))
}

/**
 * Build a `{ year: Set<tid> }` map of which teams a uid coached each
 * year. memberTeamHistory[uid] is the SINGLE SOURCE OF TRUTH whenever
 * it exists at all — even if certain years are absent from it (the
 * user removed them via the timeline editor and meant for those
 * years to be empty).
 *
 * For dynasties that have never been touched by the new system
 * (memberTeamHistory[uid] is undefined entirely), we fall back to the
 * legacy owner-only coachTeamByYear so pre-migration solo dynasties
 * still attribute correctly.
 */
function buildYearTeamsMap(dynasty, uid) {
  const out = {}
  const history = dynasty?.memberTeamHistory?.[uid]
  // History exists for this uid? Trust it as the source of truth.
  // An empty year inside history means "user wasn't coaching that year"
  // — the legacy fallback below would silently override that intent.
  if (history) {
    for (const [yearStr, tids] of Object.entries(history)) {
      const year = Number(yearStr)
      if (!Number.isFinite(year) || !Array.isArray(tids)) continue
      const cleaned = tids.map(Number).filter(Number.isFinite)
      if (cleaned.length > 0) out[year] = new Set(cleaned)
    }
    return out
  }
  // No history snapshot for this uid — pre-migration solo dynasty.
  // Owner gets the legacy coachTeamByYear walk so their career still
  // renders. Non-owners get an empty map.
  if (uid === dynasty?.userId && dynasty?.coachTeamByYear) {
    for (const [yearStr, entry] of Object.entries(dynasty.coachTeamByYear)) {
      const year = Number(yearStr)
      if (!Number.isFinite(year)) continue
      const tid = entry?.tid ?? entry?.team ?? entry
      const tidNum = Number(tid)
      if (Number.isFinite(tidNum)) out[year] = new Set([tidNum])
    }
  }
  return out
}

/**
 * Lifetime summary for a single coach. Returns numbers (no formatting).
 */
export function getCoachSummary(dynasty, uid) {
  if (!dynasty || !uid) return null
  const yearTeams = buildYearTeamsMap(dynasty, uid)

  let wins = 0, losses = 0
  let bowlWins = 0, bowlLosses = 0
  let ccWins = 0
  let ncWins = 0
  const playoffYears = new Set()
  const gameYears = new Set()

  for (const g of (dynasty.games || [])) {
    if (!isPlayed(g)) continue
    const year = Number(g.year)
    const userTids = yearTeams[year]
    if (!userTids || userTids.size === 0) continue

    const t1 = Number(g.team1Tid)
    const t2 = Number(g.team2Tid)
    let userTid = null
    if (userTids.has(t1)) userTid = t1
    else if (userTids.has(t2)) userTid = t2
    if (!userTid) continue

    const userScore = userTid === t1 ? g.team1Score : g.team2Score
    const oppScore = userTid === t1 ? g.team2Score : g.team1Score
    if (userScore == null || oppScore == null) continue

    const won = userScore > oppScore
    const lost = oppScore > userScore

    if (won) wins++
    if (lost) losses++
    gameYears.add(year)

    if (isBowlGame(g)) {
      if (won) bowlWins++
      if (lost) bowlLosses++
    }
    if (isConferenceChampionshipGame(g) && won) ccWins++
    if (isNationalChampionshipGame(g) && won) ncWins++
    if (isCFPGame(g)) playoffYears.add(year)
  }

  const yearsList = Object.keys(yearTeams).map(Number).filter(Number.isFinite).sort((a, b) => a - b)
  const startYear = yearsList[0] ?? null
  const endYear = yearsList[yearsList.length - 1] ?? null

  // Primary team = team they coached most recently. If they coach multiple
  // for the same year, take the first (deterministic).
  let primaryTeamTid = null
  if (endYear != null && yearTeams[endYear]?.size > 0) {
    primaryTeamTid = Array.from(yearTeams[endYear])[0]
  }

  const totalGames = wins + losses
  const winPct = totalGames > 0 ? wins / totalGames : 0

  return {
    uid,
    name: getCoachNameForUid(dynasty, uid),
    primaryTeamTid,
    startYear,
    endYear,
    yearsActive: yearsList.length,
    seasonsWithGames: gameYears.size,
    wins,
    losses,
    winPct,
    bowlWins,
    bowlLosses,
    confTitles: ccWins,
    nationalTitles: ncWins,
    playoffAppearances: playoffYears.size,
  }
}

/**
 * Summaries for every editor (commish + co-commishes + members).
 * Sorted by lifetime wins desc by default; pass a sort key:
 *   'wins' | 'winPct' | 'national' | 'conf' | 'bowl' | 'name' | 'years'
 */
export function getAllCoachSummaries(dynasty, sortBy = 'wins') {
  if (!dynasty) return []
  const ownerUid = dynasty.userId
  const editors = Array.isArray(dynasty.editors) ? dynasty.editors : []
  const allUids = new Set(editors)
  if (ownerUid) allUids.add(ownerUid)
  const summaries = Array.from(allUids)
    .map(uid => getCoachSummary(dynasty, uid))
    .filter(Boolean)

  const sorters = {
    wins: (a, b) => b.wins - a.wins || b.winPct - a.winPct,
    winPct: (a, b) => b.winPct - a.winPct || b.wins - a.wins,
    national: (a, b) => b.nationalTitles - a.nationalTitles || b.wins - a.wins,
    conf: (a, b) => b.confTitles - a.confTitles || b.wins - a.wins,
    bowl: (a, b) => b.bowlWins - a.bowlWins || b.wins - a.wins,
    name: (a, b) => (a.name || '').localeCompare(b.name || ''),
    years: (a, b) => b.yearsActive - a.yearsActive || b.wins - a.wins,
  }
  return summaries.sort(sorters[sortBy] || sorters.wins)
}
