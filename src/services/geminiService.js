/**
 * Game Recap Prompt Builder
 *
 * Builds the text prompt that users copy into their own AI (ChatGPT,
 * Claude, Gemini web, etc.). This module is data-in / prompt-out only —
 * it does NOT call any AI API or persist anything. The app removed all
 * live AI calls in favor of the user-pastes-to-their-own-AI flow.
 */

import { getTeamName } from '../data/teamAbbreviations'
import { getCurrentTeamAbbr, TEAMS, getGameTeamInfo, getNameByAbbr, getTidFromAbbr } from '../data/teamRegistry'
import { getTeamConference } from '../data/conferenceTeams'
import { getUserGamePerspective, getLockedCoachingStaff, getCustomConferencesForYear, getTeamRankForWeek } from '../context/DynastyContext'
import { buildCFPProjection } from '../utils/cfpProjection'
import { canonicalBoxScore, getPlayerStatsForTid, getTeamStatsForTid } from '../utils/boxScoreHelpers'
import { collapsePatRowsIntoTDs } from '../utils/scoringPlayOrder'

// ============================================
// HELPER FUNCTIONS FOR DATA EXTRACTION
// ============================================

/* The old API-key management, provider selection, and usage-tracking
   block used to live between the top imports and here. It was deleted
   when the app stopped making live AI calls in favor of letting users
   copy the prompt into their own AI. If you need any of it again, pull
   it from git history (pre-refactor geminiService.js). Everything below
   is pure prompt-building. */

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
export function getGameOrder(g) {
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
    // Search every team's slot in the canonical store. Helper migrates
    // legacy {home, away} games on the fly.
    const canon = canonicalBoxScore(game)
    const slots = canon ? Object.values(canon.byTid || {}) : []
    for (const boxSide of slots) {
      if (!boxSide) continue

      // Check all stat categories
      for (const category of ['passing', 'rushing', 'receiving', 'defense', 'kicking']) {
        const entries = boxSide[category] || []
        const playerEntry = entries.find(p => normalizePlayerName(p.playerName) === normalized)
        if (playerEntry) {
          // Opponent fallback: prefer the explicit game.opponent field,
          // otherwise pick the side of game.team1/team2 that isn't the
          // player's team. Previously this branched on a `side` loop
          // variable from the old home/away loop — that variable went
          // away in the tid-keyed canonical-box-score refactor and the
          // dangling reference threw "Can't find variable: side" on
          // every game-recap prompt copy. Reported by ALABAMA PRINCE
          // 2026-05-11.
          const opponentName = game.opponent
            || (game.team1 && game.team1 === teamAbbr ? game.team2 : null)
            || (game.team2 && game.team2 === teamAbbr ? game.team1 : null)
            || ''
          results.push({
            week: game.week,
            opponent: opponentName,
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
 * Get abbreviation from tid. Reads dynasty.teams[tid] (the only source
 * of truth — TeamBuilder takeovers live there with their custom abbr)
 * and falls back to the static TEAMS map only when there's no dynasty
 * context. Callers MUST pass `dynasty` whenever they have it; without
 * it, TB teams resolve to their original FBS abbr.
 */
function getAbbrFromTid(tid, dynasty = null) {
  if (!tid) return null
  const teamData = dynasty?.teams?.[tid] || TEAMS[tid]
  return teamData?.abbr || null
}

/**
 * Drop noise rows from player performance trends.
 * "0 car, 0 yds" or "0 rec, 0 yds" lines appear when a player touched the
 * box score in one category but got nothing in another — they clutter the
 * prompt without telling the AI anything useful.
 */
function isZeroStatRow(stats, category) {
  if (!stats) return true
  const n = (v) => Number(v) || 0
  switch (category) {
    case 'passing': {
      const att = n(stats.attempts ?? stats.att)
      const yds = n(stats.yards ?? stats.yds)
      return att === 0 && yds === 0
    }
    case 'rushing': {
      const car = n(stats.carries ?? stats.car)
      const yds = n(stats.yards ?? stats.yds)
      return car === 0 && yds === 0
    }
    case 'receiving': {
      const rec = n(stats.receptions ?? stats.rec)
      const yds = n(stats.yards ?? stats.yds)
      return rec === 0 && yds === 0
    }
    case 'defense': {
      const tkl = n(stats.solo) + n(stats.assists) + n(stats.tackles)
      const sacks = n(stats.sack)
      const ints = n(stats.iNT ?? stats.int)
      const tfl = n(stats.tFL ?? stats.tfl)
      const ff = n(stats.fF ?? stats.ff)
      const pd = n(stats.deflections ?? stats.pD ?? stats.pd)
      return tkl === 0 && sacks === 0 && ints === 0 && tfl === 0 && ff === 0 && pd === 0
    }
    default:
      return false
  }
}

/**
 * Treat a game as "not played yet" when both scores are absent or both zero.
 * These phantom entries come from scheduled-but-blank games and would
 * otherwise inflate loss columns and litter the season recap.
 */
function isUnplayedGame(g) {
  if (!g) return true
  const s1 = g.team1Score ?? g.teamScore
  const s2 = g.team2Score ?? g.opponentScore
  const n1 = Number(s1) || 0
  const n2 = Number(s2) || 0
  return n1 === 0 && n2 === 0
}

/**
 * Get team ratings for a team/year. Tid-based primary path; legacy abbr
 * fallback is drift-aware (scans all keys and resolves each as a possible
 * old-abbr for this team) so a teambuilder team renamed mid-dynasty
 * still surfaces its old-year ratings.
 */
function getTeamRatings(dynasty, teamAbbr, year) {
  // Resolve target tid up-front.
  let targetTid = null
  if (dynasty?.teams) {
    for (const [tid, teamData] of Object.entries(dynasty.teams)) {
      if (teamData?.abbr === teamAbbr || teamData?.name?.includes(teamAbbr)) {
        targetTid = Number(tid)
        const tidRatings = teamData?.byYear?.[year]?.teamRatings
        if (tidRatings) return tidRatings
        break
      }
    }
  }

  const structure = dynasty?.teamRatingsByTeamYear
  if (structure) {
    // Direct hits first.
    if (structure[teamAbbr]?.[year]) return structure[teamAbbr][year]
    if (targetTid != null && structure[targetTid]?.[year]) return structure[targetTid][year]
    // Drift recovery — for renamed teambuilder teams.
    if (targetTid != null) {
      for (const key of Object.keys(structure)) {
        if (key === teamAbbr || key === String(targetTid)) continue
        const keyTid = dynasty?.teams && Object.entries(dynasty.teams).find(([, td]) => td?.abbr === key)?.[0]
        if (keyTid != null && Number(keyTid) === targetTid && structure[key]?.[year]) {
          return structure[key][year]
        }
      }
    }
  }

  return null
}

/**
 * Build a talent comparison description for two teams
 * Shows actual OVR numbers but instructs AI not to mention them directly
 */
function buildTalentContext(team1Ratings, team2Ratings, team1Name, team2Name, team1Won) {
  if (!team1Ratings?.overall && !team2Ratings?.overall) return null

  const lines = []

  // Get overall ratings
  const t1Overall = parseInt(team1Ratings?.overall) || 0
  const t2Overall = parseInt(team2Ratings?.overall) || 0
  const t1Offense = parseInt(team1Ratings?.offense) || 0
  const t1Defense = parseInt(team1Ratings?.defense) || 0
  const t2Offense = parseInt(team2Ratings?.offense) || 0
  const t2Defense = parseInt(team2Ratings?.defense) || 0

  // Show actual ratings for AI context
  lines.push(`TEAM RATINGS (for context only - do NOT mention these numbers in the article):`)
  if (t1Overall) {
    lines.push(`${team1Name}: ${t1Overall} OVR${t1Offense ? ` (OFF: ${t1Offense}, DEF: ${t1Defense})` : ''}`)
  }
  if (t2Overall) {
    lines.push(`${team2Name}: ${t2Overall} OVR${t2Offense ? ` (OFF: ${t2Offense}, DEF: ${t2Defense})` : ''}`)
  }

  // Add context about what the matchup means
  lines.push('')
  lines.push(`TALENT CONTEXT:`)

  if (t1Overall && t2Overall) {
    const diff = Math.abs(t1Overall - t2Overall)
    const favorite = t1Overall > t2Overall ? team1Name : team2Name
    const underdog = t1Overall > t2Overall ? team2Name : team1Name
    const favoriteWon = (t1Overall > t2Overall && team1Won) || (t2Overall > t1Overall && !team1Won)

    if (diff <= 3) {
      lines.push(`- Evenly matched game (${diff} point talent gap)`)
    } else if (diff <= 7) {
      lines.push(`- ${favorite} was slightly more talented (+${diff} OVR)`)
    } else if (diff <= 12) {
      lines.push(`- ${favorite} was a clear favorite (+${diff} OVR advantage)`)
      if (!favoriteWon) {
        lines.push(`- This qualifies as an UPSET - ${underdog} overcame the talent gap`)
      }
    } else {
      lines.push(`- ${favorite} was a heavy favorite (+${diff} OVR advantage)`)
      if (!favoriteWon) {
        lines.push(`- This is a MAJOR UPSET - ${underdog} overcame a huge talent deficit`)
      }
    }
  }

  return lines.join('\n')
}

/**
 * Get coaching staff for a team/year
 */
function getCoachingStaff(dynasty, teamAbbr, year) {
  // Delegate to the production helper. It handles:
  //   - locked staff → team-centric staff → legacy staff fallback chain
  //   - ONLY falling back to dynasty.coachingStaff when the team is the user's
  //     current team (so opponents don't inherit the user's OC/DC)
  //   - injecting dynasty.coachName as hcName/ocName/dcName when the user
  //     coaches that team in that year (fills in the user's HC name)
  if (!dynasty || !teamAbbr) return null
  const staff = getLockedCoachingStaff(dynasty, Number(year), teamAbbr)
  if (!staff) return null
  if (!staff.hcName && !staff.ocName && !staff.dcName) return null
  return staff
}

/**
 * Get all season results before this game
 * Supports both legacy (userTeam/opponent) and unified (team1Tid/team2Tid) formats
 */
function getSeasonResultsBeforeGame(allGames, teamAbbr, year, currentGameOrder, dynasty = null) {
  if (!allGames) return []

  // Pass dynasty so a teambuilder team's renamed abbr resolves to the right tid.
  const teamTid = getTidFromAbbr(teamAbbr, dynasty)

  return allGames
    .filter(g => {
      if (Number(g.year) !== Number(year)) return false
      if (getGameOrder(g) >= currentGameOrder) return false
      // Must be a user game for this team (check both legacy and unified
      // formats). Tid checks must include team2Tid as well — user can be
      // in the team2 slot for CCG / neutral-site bowl rows.
      const isUserTeamLegacy = g.userTeam === teamAbbr
      const isUserTeamUnified = teamTid && (
        Number(g.userTid) === Number(teamTid) ||
        Number(g.team1Tid) === Number(teamTid) ||
        Number(g.team2Tid) === Number(teamTid)
      )
      if (!isUserTeamLegacy && !isUserTeamUnified) return false
      if (isUnplayedGame(g)) return false
      return true
    })
    .sort((a, b) => getGameOrder(a) - getGameOrder(b))
    .map(g => {
      // Handle both legacy and unified formats for opponent and scores
      let opponent, teamScore, opponentScore, opponentRank

      if (g.userTeam) {
        // Legacy format
        opponent = g.opponent
        teamScore = g.teamScore
        opponentScore = g.opponentScore
        opponentRank = g.opponentRank
      } else if (teamTid && g.team1Tid === teamTid) {
        // Unified format - user is team1
        opponent = getAbbrFromTid(g.team2Tid, dynasty) || g.team2
        teamScore = g.team1Score
        opponentScore = g.team2Score
        opponentRank = g.team2Rank
      } else if (teamTid && g.team2Tid === teamTid) {
        // Unified format - user is team2
        opponent = getAbbrFromTid(g.team1Tid, dynasty) || g.team1
        teamScore = g.team2Score
        opponentScore = g.team1Score
        opponentRank = g.team1Rank
      }

      // Determine result
      const result = teamScore > opponentScore ? 'W' : 'L'

      return {
        week: g.week,
        opponent,
        result,
        teamScore,
        opponentScore,
        isConferenceGame: g.isConferenceGame,
        opponentRank,
        location: g.location,
        gameType: g.isConferenceChampionship ? 'CCG' :
                  g.isBowlGame ? 'Bowl' :
                  g.isCFPFirstRound ? 'CFP R1' :
                  g.isCFPQuarterfinal ? 'CFP QF' :
                  g.isCFPSemifinal ? 'CFP SF' : 'Regular'
      }
    })
}

/**
 * Build enhanced player context with season stats and recent games
 */
function buildEnhancedPlayerHighlights(teamStats, players, allGames, year, currentGameOrder, teamAbbr) {
  const highlights = {
    passing: [],
    rushing: [],
    receiving: [],
    defense: [],
    kicking: [],
    punting: [],
    kickReturn: [],
    puntReturn: [],
  }
  if (!teamStats) return highlights

  // Extract passing leaders with enhanced context
  // Note: Box score from sheets uses: comp, attempts, yards, tD, iNT (camelCase from headers)
  if (teamStats.passing?.length > 0) {
    const passers = teamStats.passing.filter(p => (p.attempts || p.att) > 0)
    passers.forEach(p => {
      const player = getPlayerByName(players, p.playerName)
      const seasonStats = player ? getPlayerSeasonStats(player, year) : null
      const recentGames = getPlayerRecentGames(p.playerName, allGames, year, currentGameOrder, teamAbbr)

      // Handle both field name formats (sheets uses comp/attempts, aggregated uses cmp/att)
      const cmp = p.comp ?? p.cmp ?? 0
      const att = p.attempts ?? p.att ?? 0
      const yds = p.yards ?? p.yds ?? 0
      const td = p.tD ?? p.td ?? 0
      const int = p.iNT ?? p.int ?? 0

      highlights.passing.push({
        player: p.playerName,
        stats: `${cmp}/${att}, ${yds} yards, ${td} TD${td !== 1 ? 's' : ''}${int > 0 ? `, ${int} INT` : ''}`,
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
  // Note: Box score from sheets uses: carries, yards, tD (camelCase from headers)
  if (teamStats?.rushing?.length > 0) {
    const rushers = teamStats.rushing.filter(p => (p.carries || p.car) > 0).slice(0, 3)
    rushers.forEach(p => {
      const player = getPlayerByName(players, p.playerName)
      const seasonStats = player ? getPlayerSeasonStats(player, year) : null
      const recentGames = getPlayerRecentGames(p.playerName, allGames, year, currentGameOrder, teamAbbr)

      // Handle both field name formats
      const car = p.carries ?? p.car ?? 0
      const yds = p.yards ?? p.yds ?? 0
      const td = p.tD ?? p.td ?? 0

      highlights.rushing.push({
        player: p.playerName,
        stats: `${car} carries, ${yds} yards${td > 0 ? `, ${td} TD${td !== 1 ? 's' : ''}` : ''}`,
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
  // Note: Box score from sheets uses: receptions, yards, tD (camelCase from headers)
  if (teamStats?.receiving?.length > 0) {
    const receivers = teamStats.receiving.filter(p => (p.receptions || p.rec) > 0).slice(0, 3)
    receivers.forEach(p => {
      const player = getPlayerByName(players, p.playerName)
      const seasonStats = player ? getPlayerSeasonStats(player, year) : null
      const recentGames = getPlayerRecentGames(p.playerName, allGames, year, currentGameOrder, teamAbbr)

      // Handle both field name formats
      const rec = p.receptions ?? p.rec ?? 0
      const yds = p.yards ?? p.yds ?? 0
      const td = p.tD ?? p.td ?? 0

      highlights.receiving.push({
        player: p.playerName,
        stats: `${rec} catches, ${yds} yards${td > 0 ? `, ${td} TD${td !== 1 ? 's' : ''}` : ''}`,
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
  if (teamStats?.defense?.length > 0) {
    const defenders = teamStats.defense
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
  // Note: Box score from sheets uses: fGM, fGA, fGLong (camelCase from headers like 'FGM', 'FGA', 'FG Long')
  if (teamStats?.kicking?.length > 0) {
    teamStats.kicking.forEach(p => {
      // Handle both field name formats
      const fgm = p.fGM ?? p.fgm ?? 0
      const fga = p.fGA ?? p.fga ?? 0
      const lng = p.fGLong ?? p.lng ?? p.long ?? null

      if (fgm > 0 || fga > 0) {
        const player = getPlayerByName(players, p.playerName)
        const seasonStats = player ? getPlayerSeasonStats(player, year) : null

        highlights.kicking.push({
          player: p.playerName,
          stats: `${fgm}/${fga} FG${lng ? `, long ${lng}` : ''}`,
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

  // Punting
  if (teamStats?.punting?.length > 0) {
    teamStats.punting
      .filter(p => (p.punts ?? 0) > 0)
      .forEach(p => {
        const punts = p.punts ?? 0
        const yards = p.yards ?? p.yds ?? 0
        const net = p.netYards ?? null
        const long = p.long ?? null
        const in20 = p.in20 ?? null
        let statStr = `${punts} punt${punts !== 1 ? 's' : ''}, ${yards} gross yds`
        if (net != null) statStr += `, ${net} net`
        if (long) statStr += `, long ${long}`
        if (in20) statStr += `, ${in20} inside 20`
        const player = getPlayerByName(players, p.playerName)
        highlights.punting.push({
          player: p.playerName,
          stats: statStr,
          position: player?.position || 'P',
          class: player?.classByYear?.[year] || player?.year || null,
        })
      })
  }

  // Kick returns
  if (teamStats?.kickReturn?.length > 0) {
    teamStats.kickReturn
      .filter(p => (p.kR ?? 0) > 0)
      .forEach(p => {
        const ret = p.kR ?? 0
        const yards = p.yards ?? p.yds ?? 0
        const long = p.long ?? null
        const td = p.tD ?? p.td ?? 0
        let statStr = `${ret} KR, ${yards} yds`
        if (long) statStr += `, long ${long}`
        if (td) statStr += `, ${td} TD`
        const player = getPlayerByName(players, p.playerName)
        highlights.kickReturn.push({
          player: p.playerName,
          stats: statStr,
          position: player?.position || null,
          class: player?.classByYear?.[year] || player?.year || null,
        })
      })
  }

  // Punt returns
  if (teamStats?.puntReturn?.length > 0) {
    teamStats.puntReturn
      .filter(p => (p.pR ?? 0) > 0)
      .forEach(p => {
        const ret = p.pR ?? 0
        const yards = p.yards ?? p.yds ?? 0
        const long = p.long ?? null
        const td = p.tD ?? p.td ?? 0
        let statStr = `${ret} PR, ${yards} yds`
        if (long) statStr += `, long ${long}`
        if (td) statStr += `, ${td} TD`
        const player = getPlayerByName(players, p.playerName)
        highlights.puntReturn.push({
          player: p.playerName,
          stats: statStr,
          position: player?.position || null,
          class: player?.classByYear?.[year] || player?.year || null,
        })
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
export function getHeadToHeadHistory(allGames, team1, team2, currentYear, maxGames = 5, dynasty = null) {
  const history = []

  // Get tids for unified format matching. Pass dynasty so teambuilder-renamed
  // abbrs resolve correctly.
  const team1Tid = getTidFromAbbr(team1, dynasty)
  const team2Tid = getTidFromAbbr(team2, dynasty)

  for (const g of allGames) {
    // Skip games from current year (we only want historical)
    if (Number(g.year) >= Number(currentYear)) continue
    // Skip scheduled-but-unplayed phantom entries
    if (isUnplayedGame(g)) continue

    // Check if this game involves both teams (support multiple formats)
    const isUnifiedMatch = team1Tid && team2Tid && (
      (g.team1Tid === team1Tid && g.team2Tid === team2Tid) ||
      (g.team1Tid === team2Tid && g.team2Tid === team1Tid)
    )
    const isLegacyUserMatch = (
      (g.userTeam === team1 && g.opponent === team2) ||
      (g.userTeam === team2 && g.opponent === team1)
    )
    const isLegacyCpuMatch = (
      (g.team1 === team1 && g.team2 === team2) ||
      (g.team1 === team2 && g.team2 === team1)
    )
    const isMatch = isUnifiedMatch || isLegacyUserMatch || isLegacyCpuMatch
    if (!isMatch) continue

    let winner, loser, winnerScore, loserScore
    if (isUnifiedMatch) {
      // Unified format — resolve names from tids, never fall back to undefined string fields
      const s1 = Number(g.team1Score) || 0
      const s2 = Number(g.team2Score) || 0
      const team1Won = s1 > s2
      const team1Name = getTeamName(getAbbrFromTid(g.team1Tid, dynasty), dynasty?.teams) || getAbbrFromTid(g.team1Tid, dynasty)
      const team2Name = getTeamName(getAbbrFromTid(g.team2Tid, dynasty), dynasty?.teams) || getAbbrFromTid(g.team2Tid, dynasty)
      winner = team1Won ? team1Name : team2Name
      loser = team1Won ? team2Name : team1Name
      winnerScore = team1Won ? s1 : s2
      loserScore = team1Won ? s2 : s1
    } else if (isLegacyCpuMatch && g.team1 && g.team2) {
      const team1Won = g.team1Score > g.team2Score
      winner = team1Won ? g.team1 : g.team2
      loser = team1Won ? g.team2 : g.team1
      winnerScore = team1Won ? g.team1Score : g.team2Score
      loserScore = team1Won ? g.team2Score : g.team1Score
    } else {
      // Legacy user game format
      const userWon = g.result === 'win' || g.result === 'W'
      winner = userWon ? g.userTeam : g.opponent
      loser = userWon ? g.opponent : g.userTeam
      winnerScore = userWon ? g.teamScore : g.opponentScore
      loserScore = userWon ? g.opponentScore : g.teamScore
    }

    // Guard: if resolution failed, skip rather than emit an "undefined" row
    if (!winner || !loser || winnerScore == null || loserScore == null) continue

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
  const allGames = dynasty.games || []

  // Tid-keyed seed lookup is the primary source; the legacy abbr-keyed
  // map is a fallback. Build BOTH maps so a renamed teambuilder team
  // (whose abbr drifted between when seeds were stored and now) is
  // still findable via tid.
  const tidToSeed = {}
  const tidToAbbr = {}
  const tidsInBracket = []
  const yearTidArray = dynasty.cfpSeedsByYear?.[year] || []
  if (Array.isArray(yearTidArray)) {
    yearTidArray.forEach(entry => {
      if (entry && entry.tid != null && entry.seed != null) {
        const t = Number(entry.tid)
        tidToSeed[t] = entry.seed
        tidToAbbr[t] = (dynasty.teams?.[t]?.abbr) || entry.team || null
        tidsInBracket.push(t)
      }
    })
  }
  // Legacy abbr-keyed seeds (only used when tid map is empty for this year)
  const legacySeeds = cfpResults.seeds || {}
  const teamToSeed = {}
  Object.entries(legacySeeds).forEach(([team, seed]) => {
    if (seed) teamToSeed[team] = seed
  })

  // Resolve any team-identifier (tid or abbr) to its seed.
  const resolveSeed = (tid, abbr) => {
    if (tid != null && tidToSeed[Number(tid)] != null) return tidToSeed[Number(tid)]
    if (abbr && teamToSeed[abbr] != null) return teamToSeed[abbr]
    return null
  }

  // Find current display abbr for a seed (used to render opponent names
  // in the AI prompt). Tid path first.
  const getTeamAbbrBySeed = (seed) => {
    for (const t of tidsInBracket) {
      if (Number(tidToSeed[t]) === Number(seed)) return tidToAbbr[t] || `#${seed} seed`
    }
    const legacy = Object.entries(legacySeeds).find(([, s]) => Number(s) === Number(seed))?.[0]
    return legacy || `#${seed} seed`
  }

  // Find the abbr of a winner from a game using tid + scores.
  const winnerAbbr = (g) => {
    if (!g) return null
    if (g.team1Score != null && g.team2Score != null && g.team1Tid != null && g.team2Tid != null) {
      const wTid = g.team1Score > g.team2Score ? Number(g.team1Tid) : Number(g.team2Tid)
      return dynasty.teams?.[wTid]?.abbr || (wTid === Number(g.team1Tid) ? g.team1 : g.team2)
    }
    if (g.team1Score != null && g.team2Score != null) {
      return g.team1Score > g.team2Score ? g.team1 : g.team2
    }
    if (g.result && g.userTeam) {
      return (g.result === 'win' || g.result === 'W') ? g.userTeam : g.opponent
    }
    return null
  }

  // Find first-round game by seed pair (tid-resolved seeds).
  const getFirstRoundWinner = (seed1, seed2) => {
    const frGame = allGames.find(g => {
      if (Number(g.year) !== Number(year) || !g.isCFPFirstRound) return false
      if (g.team1Score == null) return false
      const s1 = resolveSeed(g.team1Tid, g.team1)
      const s2 = resolveSeed(g.team2Tid, g.team2)
      return (Number(s1) === Number(seed1) && Number(s2) === Number(seed2)) ||
             (Number(s1) === Number(seed2) && Number(s2) === Number(seed1))
    })
    return winnerAbbr(frGame)
  }

  const getQuarterfinalWinner = (bowlName) => {
    const qfGame = allGames.find(g =>
      Number(g.year) === Number(year) &&
      g.isCFPQuarterfinal &&
      g.bowlName === bowlName &&
      (g.team1Score != null || g.teamScore != null)
    )
    return winnerAbbr(qfGame)
  }

  const getSemifinalWinner = (bowlName) => {
    const sfGame = allGames.find(g =>
      Number(g.year) === Number(year) &&
      g.isCFPSemifinal &&
      g.bowlName === bowlName &&
      (g.team1Score != null || g.teamScore != null)
    )
    return winnerAbbr(sfGame)
  }

  // Determine current game's teams and their seeds (tid-resolved).
  const team1 = game.team1 || game.userTeam
  const team2 = game.team2 || game.opponent
  const team1Seed = resolveSeed(game.team1Tid, team1)
  const team2Seed = resolveSeed(game.team2Tid, team2)
  const getTeamBySeed = getTeamAbbrBySeed

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

  // Add completed CFP games to bracket context. Tid-first winner/loser
  // resolution so a renamed teambuilder team appears under its CURRENT
  // abbr in the AI's bracket context.
  for (const g of cfpGames) {
    if (g.id === game.id) continue // Skip current game

    let winner, loser, score
    if (g.team1 && g.team2 && g.team1Score != null) {
      const t1Won = g.team1Score > g.team2Score
      const t1Tid = g.team1Tid != null ? Number(g.team1Tid) : null
      const t2Tid = g.team2Tid != null ? Number(g.team2Tid) : null
      const t1Abbr = (t1Tid != null && dynasty.teams?.[t1Tid]?.abbr) || g.team1
      const t2Abbr = (t2Tid != null && dynasty.teams?.[t2Tid]?.abbr) || g.team2
      winner = t1Won ? t1Abbr : t2Abbr
      loser = t1Won ? t2Abbr : t1Abbr
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
function getBowlHistory(allGames, teamAbbr, currentYear, maxGames = 3, dynasty = null) {
  const history = []
  // Pass dynasty so a teambuilder-renamed team's abbr resolves to its tid.
  const teamTid = getTidFromAbbr(teamAbbr, dynasty)

  for (const g of allGames) {
    if (Number(g.year) >= Number(currentYear)) continue
    if (!g.isBowlGame && !g.isCFPFirstRound && !g.isCFPQuarterfinal && !g.isCFPSemifinal && !g.isCFPChampionship) continue

    // Check if this team was in the game. Tid match first (modern data,
    // survives teambuilder rename); abbr match for legacy.
    const teamInGameUnified = teamTid && (
      Number(g.team1Tid) === Number(teamTid) ||
      Number(g.team2Tid) === Number(teamTid) ||
      Number(g.userTid) === Number(teamTid)
    )
    const teamInGameLegacy = g.userTeam === teamAbbr || g.team1 === teamAbbr || g.team2 === teamAbbr

    if (teamInGameUnified || teamInGameLegacy) {
      let won, opponent, score, gameName
      if (g.team1 && g.team2) {
        const isTeam1 = (teamTid && Number(g.team1Tid) === Number(teamTid)) || g.team1 === teamAbbr
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

/**
 * Get a team's postseason result from the prior year (the year before the current game)
 * Returns the DEEPEST round the team reached, plus a one-line narrative cue
 * the AI can drop straight into prose ("nearly won the natty",
 * "lost in the CFP semifinals", "won their bowl game", etc.).
 *
 * Earlier versions returned whichever postseason game iterated first in
 * `allGames`, which meant a team that played both their CFP first-round and
 * the National Championship would be reported as "CFP First Round" if that
 * game happened to come first in the array. The fix: rank every postseason
 * game we find, take the deepest one. National Championship > Semifinal >
 * Quarterfinal > First Round > Bowl.
 */
export function getPriorYearPostseason(allGames, teamAbbr, currentYear, dynasty = null) {
  const priorYear = Number(currentYear) - 1
  // Pass dynasty so a teambuilder-renamed team's abbr resolves to its tid.
  const teamTid = getTidFromAbbr(teamAbbr, dynasty)

  // Rank ordering — higher = deeper round. Used to pick the team's
  // furthest-played postseason game when multiple are present.
  const roundDepth = (g) => {
    if (g.isCFPChampionship) return 5
    if (g.isCFPSemifinal) return 4
    if (g.isCFPQuarterfinal) return 3
    if (g.isCFPFirstRound) return 2
    if (g.isBowlGame) return 1
    return 0
  }

  let best = null
  let bestDepth = -1

  for (const g of allGames) {
    if (Number(g.year) !== priorYear) continue
    if (!g.isBowlGame && !g.isCFPFirstRound && !g.isCFPQuarterfinal && !g.isCFPSemifinal && !g.isCFPChampionship) continue

    const teamInGameLegacy = g.userTeam === teamAbbr || g.team1 === teamAbbr || g.team2 === teamAbbr
    const teamInGameUnified = teamTid && (g.team1Tid === teamTid || g.team2Tid === teamTid || g.userTid === teamTid)
    if (!teamInGameLegacy && !teamInGameUnified) continue

    const depth = roundDepth(g)
    if (depth <= bestDepth) continue
    bestDepth = depth
    best = g
  }

  if (!best) return null

  const g = best
  let won, opponent, score

  if (g.team1Tid && g.team2Tid) {
    const isTeam1 = (teamTid && g.team1Tid === teamTid) || g.team1 === teamAbbr
    won = isTeam1 ? g.team1Score > g.team2Score : g.team2Score > g.team1Score
    const opponentTid = isTeam1 ? g.team2Tid : g.team1Tid
    const opponentInfo = getGameTeamInfo(TEAMS, opponentTid)
    opponent = opponentInfo?.abbr || (isTeam1 ? g.team2 : g.team1) || opponentTid
    score = `${isTeam1 ? g.team1Score : g.team2Score}-${isTeam1 ? g.team2Score : g.team1Score}`
  } else if (g.team1 && g.team2) {
    const isTeam1 = g.team1 === teamAbbr
    won = isTeam1 ? g.team1Score > g.team2Score : g.team2Score > g.team1Score
    opponent = isTeam1 ? g.team2 : g.team1
    score = `${isTeam1 ? g.team1Score : g.team2Score}-${isTeam1 ? g.team2Score : g.team1Score}`
  } else {
    won = g.result === 'win' || g.result === 'W'
    if (g.opponent) {
      opponent = g.opponent
    } else if (g.opponentTid) {
      const oppInfo = getGameTeamInfo(TEAMS, g.opponentTid)
      opponent = oppInfo?.abbr || g.opponentTid
    }
    score = `${g.teamScore}-${g.opponentScore}`
  }

  let gameName, cfpRound = null
  if (g.isCFPChampionship) {
    gameName = 'National Championship'
    cfpRound = 'National Championship'
  } else if (g.isCFPSemifinal) {
    gameName = g.bowlName || 'CFP Semifinal'
    cfpRound = 'CFP Semifinal'
  } else if (g.isCFPQuarterfinal) {
    gameName = g.bowlName || 'CFP Quarterfinal'
    cfpRound = 'CFP Quarterfinal'
  } else if (g.isCFPFirstRound) {
    gameName = 'CFP First Round'
    cfpRound = 'CFP First Round'
  } else {
    gameName = g.bowlName || 'Bowl Game'
  }

  // Narrative cue — a single phrase the AI can drop directly into prose.
  // Distinguishes the all-important cases (won the natty, almost won the
  // natty, made the playoff and lost early, lost their bowl, etc.) so the
  // recap doesn't have to interpret the structured fields.
  let narrativeCue
  if (g.isCFPChampionship && won) narrativeCue = `won the National Championship in ${priorYear}`
  else if (g.isCFPChampionship && !won) narrativeCue = `lost the ${priorYear} National Championship Game (a play away from the title)`
  else if (g.isCFPSemifinal && won) narrativeCue = `advanced to the ${priorYear} CFP National Championship`
  else if (g.isCFPSemifinal && !won) narrativeCue = `fell in the ${priorYear} CFP semifinals (one game shy of the title game)`
  else if (g.isCFPQuarterfinal && won) narrativeCue = `reached the ${priorYear} CFP semifinals`
  else if (g.isCFPQuarterfinal && !won) narrativeCue = `was eliminated in the ${priorYear} CFP quarterfinals`
  else if (g.isCFPFirstRound && won) narrativeCue = `won their ${priorYear} CFP first-round game`
  else if (g.isCFPFirstRound && !won) narrativeCue = `was bounced in the ${priorYear} CFP first round`
  else if (g.isBowlGame && won) narrativeCue = `won the ${priorYear} ${gameName}`
  else if (g.isBowlGame && !won) narrativeCue = `lost the ${priorYear} ${gameName}`

  return {
    year: priorYear,
    gameName,
    result: won ? 'W' : 'L',
    opponent,
    score,
    isCFP: g.isCFPFirstRound || g.isCFPQuarterfinal || g.isCFPSemifinal || g.isCFPChampionship,
    cfpRound,
    wonNationalChampionship: g.isCFPChampionship && won,
    lostNationalChampionship: g.isCFPChampionship && !won,
    deepestRound: gameName,
    narrativeCue,
  }
}

/**
 * Get a team's final-poll ranking from a given year (defaults to prior year).
 * Returns the integer rank (1-25) the team finished at, or null if not ranked
 * / no poll on file. Reads dynasty.finalPollsByYear[year].media — the same
 * shape DynastyContext.getTeamRanking uses, so this stays in sync with the
 * Rankings page.
 */
export function getTeamFinalRank(dynasty, teamAbbr, year) {
  if (!dynasty || !teamAbbr || !year) return null
  const teamTid = getTidFromAbbr(teamAbbr, dynasty)
  const media = dynasty?.finalPollsByYear?.[year]?.media
  if (!Array.isArray(media)) return null
  const entry = media.find(p =>
    p && (
      (teamTid != null && Number(p.tid) === Number(teamTid)) ||
      p.team === teamAbbr
    )
  )
  return entry?.rank ?? null
}

/**
 * Summarize a head-to-head history list into the storyline cues the AI needs
 * to write framing-rich prose. Reduces "we have 5 prior matchups" into:
 *   - the most-recent matchup (year, winner, score) — the rematch anchor
 *   - whether the most-recent meeting was a loss for team1 / team2 (revenge cue)
 *   - the dominant team in the rivalry across the visible history
 *   - the current consecutive-wins streak from one side (e.g. "Alabama has won
 *     the last 4 meetings") — only when the streak is ≥ 2 games long
 *
 * Inputs `team1` / `team2` should be the same identifiers the head-to-head
 * list was built with — typically full team names (since getHeadToHeadHistory
 * resolves tids to names before pushing into the list).
 */
export function summarizeHeadToHead(headToHeadList, team1Name, team2Name) {
  if (!Array.isArray(headToHeadList) || headToHeadList.length === 0) return null

  // History is sorted most-recent-first by getHeadToHeadHistory.
  const sorted = headToHeadList

  const team1Wins = sorted.filter(h => h.winner === team1Name).length
  const team2Wins = sorted.filter(h => h.winner === team2Name).length

  // Last meeting = the most-recent prior matchup.
  const last = sorted[0]
  const team1WonLast = last?.winner === team1Name
  const team2WonLast = last?.winner === team2Name

  // Walk from the most-recent backwards; count consecutive same-winner games.
  let streakWinner = last?.winner || null
  let streakLength = 0
  if (streakWinner) {
    for (const h of sorted) {
      if (h.winner === streakWinner) streakLength += 1
      else break
    }
  }

  return {
    isRematch: true, // by definition — we have at least one prior meeting
    totalMeetings: sorted.length,
    team1Wins,
    team2Wins,
    lastMeeting: last
      ? {
          year: last.year,
          winner: last.winner,
          loser: last.loser,
          winnerScore: last.winnerScore,
          loserScore: last.loserScore,
          gameType: last.gameType,
        }
      : null,
    team1LostLastMeeting: team2WonLast === true,
    team2LostLastMeeting: team1WonLast === true,
    currentStreak: streakLength >= 2 && streakWinner
      ? { winner: streakWinner, count: streakLength }
      : null,
  }
}

// ──────────────────────────────────────────────────────────────────────
// Rank semantics — IMPORTANT — read before touching anything rank-related.
//
// EA CFB's schedule UI shows each team's POST-WEEK rank next to it (the
// rank that team holds AFTER playing that week's game). When a user
// enters a week's score from the EA schedule, they're capturing the
// post-game rank, so `game.team1Rank` / `game.team2Rank` on every
// stored game are POST-GAME ranks — NOT pre-game / "entering" ranks.
//
// To compute the rank a team CARRIED INTO game G (the matchup-framing
// rank "the #4 team faced the #11 team"), we look at that team's most
// recent prior played game and read THAT game's stored rank — that
// stored rank is post-game from the prior matchup, which equals the
// rank the team brought into the next game.
//
// `getTeamEnteringRank` does that lookup for one team relative to one
// in-progress game. Both prompts use it so the AI can write
// pre-game-rank prose without inferring it from a tangle of weeks.
// ──────────────────────────────────────────────────────────────────────
export function getTeamEnteringRank(allGames, teamAbbr, year, currentGameOrder, dynasty) {
  if (!Array.isArray(allGames) || !teamAbbr) return null
  const teamTid = getTidFromAbbr(teamAbbr, dynasty)
  const yearNum = Number(year)

  // Prefer dynasty.teams[tid].byYear[year].rankByWeek if populated —
  // that's the post-migration source of truth, populated by addGame /
  // updateGame on every save. Fall back to deriving from the team's
  // most recent prior game's stored rank if rankByWeek isn't there
  // yet (e.g. dynasties that haven't been migrated).
  if (teamTid != null && dynasty) {
    const byYear = dynasty?.teams?.[teamTid]?.byYear
      || dynasty?.teams?.[String(teamTid)]?.byYear
    const rankByWeek = byYear?.[yearNum]?.rankByWeek ?? byYear?.[String(yearNum)]?.rankByWeek
    if (rankByWeek) {
      const v = rankByWeek[currentGameOrder] ?? rankByWeek[String(currentGameOrder)]
      if (v != null) {
        const n = Number(v)
        return n >= 1 && n <= 25 ? n : null
      }
    }
  }

  // Legacy fallback — derive from the team's most recent prior game.
  let bestOrder = -1
  let bestRank = null
  for (const g of allGames) {
    if (Number(g?.year) !== yearNum) continue
    if (isUnplayedGame(g)) continue
    const order = getGameOrder(g)
    if (order >= currentGameOrder) continue
    let teamRank = null
    if (g.team1Tid != null && g.team2Tid != null) {
      if (g.team1Tid === teamTid) teamRank = g.team1Rank
      else if (g.team2Tid === teamTid) teamRank = g.team2Rank
    }
    if (teamRank == null) {
      if (g.team1 === teamAbbr) teamRank = g.team1Rank
      else if (g.team2 === teamAbbr) teamRank = g.team2Rank
      else if (g.userTeam === teamAbbr) teamRank = g.teamRank ?? null
    }
    if (teamRank == null) continue
    if (order > bestOrder) {
      bestOrder = order
      bestRank = teamRank
    }
  }
  if (typeof bestRank !== 'number' || bestRank < 1 || bestRank > 25) return null
  return bestRank
}

// ──────────────────────────────────────────────────────────────────────
// Coaching context — name + tenure + career-at-school record.
//
// Tenure is computed by scanning teams[tid].byYear backwards for the
// same hcName: the moment the head coach changes, that's the start of
// the current stint. "Year 1" = first season at the school. The
// at-school career record is the cumulative W-L of every game that team
// played from the tenure-start year through the current season.
//
// This unlocks framing like "in his fourth year, Coach X is on the
// hot seat" or "first-year coach already 6-0" — the exact beats the
// user asked for.
// ──────────────────────────────────────────────────────────────────────
export function getCoachContext(dynasty, teamAbbr, year) {
  if (!dynasty || !teamAbbr || !year) return null
  const teamTid = getTidFromAbbr(teamAbbr, dynasty)
  if (teamTid == null) return null
  const yearNum = Number(year)
  const byYear = dynasty?.teams?.[teamTid]?.byYear
  if (!byYear) return null

  const currentStaff = byYear[yearNum]?.coachingStaff
    || byYear[yearNum - 1]?.coachingStaff
    || null
  const hcName = (currentStaff?.hcName || '').trim()
  if (!hcName) return null

  // Walk backwards from current year, find the earliest consecutive year
  // this same HC was on staff. Allow gaps where coachingStaff is missing
  // for a year (carries over) but stop the moment a different name appears.
  let stintStart = yearNum
  for (let y = yearNum - 1; y >= 0; y -= 1) {
    const st = byYear[y]?.coachingStaff
    if (!st) {
      // No record for this year — assume continuity (coach carries) and
      // keep walking. Bail only if we go more than ~2 years without
      // seeing the same name (defends against stale years way in the past).
      if (yearNum - y > 30) break
      stintStart = y
      continue
    }
    const name = (st.hcName || '').trim()
    if (!name) {
      stintStart = y
      continue
    }
    if (name !== hcName) break
    stintStart = y
  }
  const yearAtSchool = yearNum - stintStart + 1

  // Career record at THIS school during the current stint.
  let wins = 0, losses = 0, confWins = 0, confLosses = 0
  const allGames = dynasty.games || []
  for (const g of allGames) {
    const gYear = Number(g?.year)
    if (!Number.isFinite(gYear) || gYear < stintStart || gYear > yearNum) continue
    if (isUnplayedGame(g)) continue
    const inGame = g.team1Tid === teamTid || g.team2Tid === teamTid
      || g.team1 === teamAbbr || g.team2 === teamAbbr || g.userTeam === teamAbbr
    if (!inGame) continue
    let teamWon
    if (g.team1Tid != null && g.team2Tid != null) {
      const isT1 = g.team1Tid === teamTid
      const s1 = Number(g.team1Score) || 0
      const s2 = Number(g.team2Score) || 0
      teamWon = isT1 ? s1 > s2 : s2 > s1
    } else if (g.team1 && g.team2) {
      const isT1 = g.team1 === teamAbbr
      teamWon = isT1 ? Number(g.team1Score) > Number(g.team2Score) : Number(g.team2Score) > Number(g.team1Score)
    } else if (g.userTeam === teamAbbr) {
      teamWon = g.result === 'win' || g.result === 'W'
    } else continue
    if (teamWon) wins += 1
    else losses += 1
    if (g.isConferenceGame) {
      if (teamWon) confWins += 1
      else confLosses += 1
    }
  }

  // Hot-seat / first-year framing helper. Only emits when the data
  // genuinely supports the angle; otherwise returns null so the prompt
  // doesn't manufacture drama from a quiet middle-tier season.
  let framingCue = null
  if (yearAtSchool === 1) {
    framingCue = `first season as ${teamAbbr} head coach`
  } else if (yearAtSchool >= 4 && wins + losses >= 8 && wins / Math.max(1, wins + losses) < 0.45) {
    framingCue = `year ${yearAtSchool} at ${teamAbbr} with a sub-.500 stint record (${wins}-${losses}) — pressure mounting`
  } else if (yearAtSchool >= 3 && wins / Math.max(1, wins + losses) >= 0.75) {
    framingCue = `year ${yearAtSchool} at ${teamAbbr} with a ${wins}-${losses} stint record — building a real era`
  }

  return {
    name: hcName,
    ocName: (currentStaff.ocName || '').trim() || null,
    dcName: (currentStaff.dcName || '').trim() || null,
    yearAtSchool,
    stintStartYear: stintStart,
    stintWins: wins,
    stintLosses: losses,
    stintConfWins: confWins,
    stintConfLosses: confLosses,
    framingCue,
  }
}

// ──────────────────────────────────────────────────────────────────────
// Recruiting class context. The class keyed at year=Y is the class
// that ARRIVED for the Y season (signed during the Y-1 cycle). So when
// recapping the Y season, the relevant "incoming class" is at year=Y,
// and the class currently being recruited is at year=Y+1.
// ──────────────────────────────────────────────────────────────────────
export function getIncomingClassRank(dynasty, teamAbbr, year) {
  if (!dynasty || !teamAbbr || !year) return null
  const tid = getTidFromAbbr(teamAbbr, dynasty)
  const map = dynasty.recruitingClassRankByTeamYear
  if (!map) return null
  // Try tid-keyed first (the canonical write), then abbr-keyed (older entries).
  const candidates = []
  if (tid != null) candidates.push(map[tid], map[String(tid)])
  candidates.push(map[teamAbbr])
  for (const sub of candidates) {
    if (!sub) continue
    const v = sub[year] ?? sub[String(year)] ?? sub[Number(year)]
    if (v != null) return Number(v) || null
  }
  return null
}

// ──────────────────────────────────────────────────────────────────────
// Quality wins / bad losses tally. A "quality win" is a win over a
// team that is currently top-25 OR ended the prior year top-25. A "bad
// loss" is a loss to a team with a sub-.500 record this season.
//
// We scan the same SEASON RESULTS list the prompt already provides but
// surface the punchy callouts directly so the AI doesn't have to derive
// them ("you've beaten 2 ranked teams" / "lost to a 1-7 team").
// ──────────────────────────────────────────────────────────────────────
export function getQualityWinsAndBadLosses(allGames, teamAbbr, year, dynasty) {
  if (!Array.isArray(allGames) || !teamAbbr) return { qualityWins: [], badLosses: [], record: null }
  const teamTid = getTidFromAbbr(teamAbbr, dynasty)
  const yearNum = Number(year)

  // Build per-opponent record-this-year + entered-this-game rank lookups.
  // Records are computed from ALL played games so a "bad loss to 1-7"
  // claim is grounded in current standings.
  const recordByTid = new Map()
  const recordByAbbr = new Map()
  for (const g of allGames) {
    if (Number(g?.year) !== yearNum) continue
    if (isUnplayedGame(g)) continue
    const incr = (key, won) => {
      const map = typeof key === 'number' ? recordByTid : recordByAbbr
      if (!map.has(key)) map.set(key, { w: 0, l: 0 })
      const r = map.get(key)
      if (won) r.w += 1
      else r.l += 1
    }
    if (g.team1Tid != null && g.team2Tid != null) {
      const s1 = Number(g.team1Score) || 0
      const s2 = Number(g.team2Score) || 0
      incr(g.team1Tid, s1 > s2)
      incr(g.team2Tid, s2 > s1)
    } else if (g.team1 && g.team2) {
      const s1 = Number(g.team1Score) || 0
      const s2 = Number(g.team2Score) || 0
      incr(g.team1, s1 > s2)
      incr(g.team2, s2 > s1)
    }
  }

  const qualityWins = []
  const badLosses = []
  let teamW = 0, teamL = 0

  for (const g of allGames) {
    if (Number(g?.year) !== yearNum) continue
    if (isUnplayedGame(g)) continue

    const inGameTid = teamTid != null && (g.team1Tid === teamTid || g.team2Tid === teamTid)
    const inGameAbbr = !inGameTid && (g.team1 === teamAbbr || g.team2 === teamAbbr || g.userTeam === teamAbbr)
    if (!inGameTid && !inGameAbbr) continue

    let teamWon, oppTid, oppAbbr, oppRank
    if (g.team1Tid != null && g.team2Tid != null) {
      const isT1 = g.team1Tid === teamTid
      const s1 = Number(g.team1Score) || 0
      const s2 = Number(g.team2Score) || 0
      teamWon = isT1 ? s1 > s2 : s2 > s1
      oppTid = isT1 ? g.team2Tid : g.team1Tid
      oppAbbr = isT1 ? g.team2 : g.team1
      oppRank = isT1 ? g.team2Rank : g.team1Rank
    } else if (g.team1 && g.team2) {
      const isT1 = g.team1 === teamAbbr
      teamWon = isT1 ? Number(g.team1Score) > Number(g.team2Score) : Number(g.team2Score) > Number(g.team1Score)
      oppAbbr = isT1 ? g.team2 : g.team1
      oppRank = isT1 ? g.team2Rank : g.team1Rank
    } else if (g.userTeam === teamAbbr) {
      teamWon = g.result === 'win' || g.result === 'W'
      oppAbbr = g.opponent
      oppRank = g.opponentRank
    } else continue

    if (teamWon) teamW += 1
    else teamL += 1

    const oppRec = (oppTid != null && recordByTid.get(oppTid))
      || (oppAbbr && recordByAbbr.get(oppAbbr))
      || null
    const oppRecLabel = oppRec ? `${oppRec.w}-${oppRec.l}` : null
    const oppAbbrFromTid = !oppAbbr && oppTid != null ? dynasty?.teams?.[oppTid]?.abbr : null
    const oppPriorRank = (oppAbbr && getTeamFinalRank(dynasty, oppAbbr, yearNum - 1))
      || (oppAbbrFromTid && getTeamFinalRank(dynasty, oppAbbrFromTid, yearNum - 1))
      || null

    if (teamWon) {
      const wasRanked = typeof oppRank === 'number' && oppRank >= 1 && oppRank <= 25
      const wasPriorRanked = typeof oppPriorRank === 'number' && oppPriorRank >= 1 && oppPriorRank <= 25
      if (wasRanked || wasPriorRanked) {
        qualityWins.push({
          opponentAbbr: oppAbbr,
          opponentTid: oppTid,
          opponentRank: wasRanked ? oppRank : null,
          opponentPriorYearRank: wasPriorRanked ? oppPriorRank : null,
          opponentRecord: oppRecLabel,
          week: g.week,
        })
      }
    } else {
      // Bad loss = lost to a team currently below .500 OR a team that
      // entered this game unranked AND has a sub-.500 record. We require
      // a record to be readable so we don't false-positive on game 1.
      const sub500 = oppRec && oppRec.w + oppRec.l >= 3 && oppRec.l > oppRec.w
      if (sub500) {
        badLosses.push({
          opponentAbbr: oppAbbr,
          opponentTid: oppTid,
          opponentRecord: oppRecLabel,
          week: g.week,
        })
      }
    }
  }

  return {
    qualityWins,
    badLosses,
    record: { wins: teamW, losses: teamL },
  }
}

// ──────────────────────────────────────────────────────────────────────
// Static rivalry / trophy game registry. Keys are the unordered abbr
// pair joined alphabetically. The recap prompt uses the trophy NAME so
// the AI says "the Iron Bowl" / "the Egg Bowl" rather than "the
// Alabama-Auburn game."
//
// Custom team builders won't have entries here — we silently return
// null for any pair we don't recognize. Worth growing this list over
// time, but the canonical FBS rivalries cover the high-leverage cases.
// ──────────────────────────────────────────────────────────────────────
const RIVALRY_GAMES = (() => {
  const reg = {}
  const add = (a, b, name) => {
    const [x, y] = [a, b].sort()
    reg[`${x}|${y}`] = name
  }
  add('BAMA', 'AUB', 'the Iron Bowl')
  add('MISS', 'MSST', 'the Egg Bowl')
  add('GT', 'UGA', 'Clean, Old-Fashioned Hate')
  add('CLEM', 'SCAR', 'the Palmetto Bowl')
  add('FLA', 'UGA', "the World's Largest Outdoor Cocktail Party")
  add('FLA', 'FSU', 'the Florida–Florida State rivalry')
  add('FSU', 'MIA', 'the Florida State–Miami rivalry')
  add('FLA', 'MIA', 'the Florida–Miami rivalry')
  add('TEX', 'OU', 'the Red River Rivalry')
  add('TEX', 'TAMU', 'the Lone Star Showdown')
  add('OU', 'OKST', 'Bedlam')
  add('UT', 'VAN', 'the Tennessee–Vanderbilt rivalry')
  add('UT', 'BAMA', 'the Third Saturday in October')
  add('LSU', 'ARK', 'the Battle for the Golden Boot')
  add('LSU', 'BAMA', 'the LSU–Alabama rivalry')
  add('UK', 'LOU', 'the Governor\'s Cup')
  add('UK', 'UT', 'the Kentucky–Tennessee rivalry')
  add('MIZ', 'ARK', 'the Battle Line Rivalry')
  add('OSU', 'MICH', 'The Game')
  add('MICH', 'MSU', 'the Paul Bunyan Trophy')
  add('OSU', 'PSU', 'the Ohio State–Penn State rivalry')
  add('NU', 'ILL', 'the Land of Lincoln Trophy')
  add('IOWA', 'NEB', 'the Heroes Trophy')
  add('IOWA', 'WIS', 'the Heartland Trophy')
  add('IOWA', 'MINN', 'Floyd of Rosedale')
  add('MINN', 'WIS', 'Paul Bunyan\'s Axe')
  add('IOWA', 'ISU', 'the Cy-Hawk Trophy')
  add('IND', 'PUR', 'the Old Oaken Bucket')
  add('IU', 'PUR', 'the Old Oaken Bucket')
  add('PSU', 'MSU', 'the Land Grant Trophy')
  add('UNC', 'NCST', 'the Tobacco Road rivalry')
  add('UNC', 'DUKE', 'the UNC–Duke rivalry')
  add('NCST', 'WAKE', 'the NC State–Wake Forest rivalry')
  add('UVA', 'VT', 'the Commonwealth Cup')
  add('STAN', 'CAL', 'the Big Game')
  add('USC', 'UCLA', 'the Victory Bell')
  add('USC', 'ND', 'the USC–Notre Dame rivalry')
  add('ND', 'NAVY', 'the Notre Dame–Navy rivalry')
  add('ARMY', 'NAVY', 'the Army–Navy Game')
  add('UTAH', 'BYU', 'the Holy War')
  add('ORE', 'ORST', 'the Civil War')
  add('WASH', 'WSU', 'the Apple Cup')
  add('AFA', 'ARMY', 'the Commander-in-Chief\'s Trophy game')
  add('AFA', 'NAVY', 'the Commander-in-Chief\'s Trophy game')
  return reg
})()

export function getRivalryName(team1Abbr, team2Abbr) {
  if (!team1Abbr || !team2Abbr) return null
  const [x, y] = [team1Abbr, team2Abbr].sort()
  return RIVALRY_GAMES[`${x}|${y}`] || null
}

// ──────────────────────────────────────────────────────────────────────
// Season-long Player-of-the-Week trail. Walks the dynasty's games for a
// year, tallies how many times each named player won an offensive or
// defensive POW (at the conference and national levels). Used by both
// per-game and weekly recaps to surface "Player X has now won three
// conference POW awards this season" style beats.
// ──────────────────────────────────────────────────────────────────────
export function getSeasonPOWTrail(allGames, year) {
  const counts = new Map() // name -> { confOffense, confDefense, natlOffense, natlDefense }
  const yearNum = Number(year)
  const bump = (name, key) => {
    const trimmed = (name || '').trim()
    if (!trimmed) return
    if (!counts.has(trimmed)) counts.set(trimmed, { confOffense: 0, confDefense: 0, natlOffense: 0, natlDefense: 0 })
    counts.get(trimmed)[key] += 1
  }
  for (const g of allGames || []) {
    if (Number(g?.year) !== yearNum) continue
    if (g.conferencePOW) bump(g.conferencePOW, 'confOffense')
    if (g.confDefensePOW) bump(g.confDefensePOW, 'confDefense')
    if (g.nationalPOW) bump(g.nationalPOW, 'natlOffense')
    if (g.natlDefensePOW) bump(g.natlDefensePOW, 'natlDefense')
  }
  const out = []
  for (const [name, c] of counts.entries()) {
    const total = c.confOffense + c.confDefense + c.natlOffense + c.natlDefense
    if (total === 0) continue
    out.push({ name, ...c, total })
  }
  out.sort((a, b) => b.total - a.total || (b.natlOffense + b.natlDefense) - (a.natlOffense + a.natlDefense))
  return out
}

// ──────────────────────────────────────────────────────────────────────
// Rank progression — the team's week-by-week rank trajectory across
// the season. Read straight from rankByWeek; returns an ordered array
// of `{ week, rank }` for every populated entry, plus high/low/peak
// metadata for quick framing.
//
// Powers "Tennessee's six-week descent from #2 to #15" / "Texas climbed
// 14 spots in three weeks" type beats without making the AI count.
// ──────────────────────────────────────────────────────────────────────
export function getTeamRankProgression(dynasty, teamAbbr, year, beforeWeekKey = null) {
  if (!dynasty || !teamAbbr || !year) return null
  const tid = getTidFromAbbr(teamAbbr, dynasty)
  if (tid == null) return null
  const yearNum = Number(year)
  const byYear = dynasty.teams?.[tid]?.byYear || dynasty.teams?.[String(tid)]?.byYear
  const rankByWeek = byYear?.[yearNum]?.rankByWeek ?? byYear?.[String(yearNum)]?.rankByWeek
  if (!rankByWeek || typeof rankByWeek !== 'object') return null

  const entries = []
  for (const [k, v] of Object.entries(rankByWeek)) {
    const wk = Number(k)
    if (!Number.isFinite(wk)) continue
    if (beforeWeekKey != null && wk > Number(beforeWeekKey)) continue
    if (typeof v !== 'number' || v < 1 || v > 25) continue
    entries.push({ week: wk, rank: v })
  }
  if (entries.length === 0) return null
  entries.sort((a, b) => a.week - b.week)

  let peak = entries[0].rank, peakWeek = entries[0].week
  let low = entries[0].rank, lowWeek = entries[0].week
  for (const e of entries) {
    if (e.rank < peak) { peak = e.rank; peakWeek = e.week }
    if (e.rank > low) { low = e.rank; lowWeek = e.week }
  }
  return {
    entries,
    peak,
    peakWeek,
    low,
    lowWeek,
    first: entries[0],
    last: entries[entries.length - 1],
  }
}

// ──────────────────────────────────────────────────────────────────────
// Team's current position in conference standings — pulled from
// dynasty.conferenceStandingsByYear[year][conference]. Returns the
// row plus position (1st, 2nd, T-3rd ...) and the conference race
// context (games behind leader, etc.) the AI can use for "the loss
// drops Tennessee to 5-2 in the SEC, two games back of Alabama" beats.
// ──────────────────────────────────────────────────────────────────────
export function getTeamConferenceStanding(dynasty, teamAbbr, year) {
  if (!dynasty || !teamAbbr || !year) return null
  const yearNum = Number(year)
  const standingsByConf = dynasty.conferenceStandingsByYear?.[yearNum]
    || dynasty.conferenceStandingsByYear?.[String(yearNum)]
  if (!standingsByConf) return null
  const tid = getTidFromAbbr(teamAbbr, dynasty)

  for (const [conf, rows] of Object.entries(standingsByConf)) {
    if (!Array.isArray(rows)) continue
    const idx = rows.findIndex(r => r && (
      (tid != null && Number(r.tid) === Number(tid)) ||
      r.team === teamAbbr
    ))
    if (idx < 0) continue
    const row = rows[idx]
    // Compute position with tie awareness — same conf record = same rank.
    const sortedByConf = [...rows]
      .filter(r => r && (typeof r.confWins === 'number' || typeof r.confLosses === 'number'))
      .sort((a, b) => {
        const aPct = (a.confWins || 0) / Math.max(1, (a.confWins || 0) + (a.confLosses || 0))
        const bPct = (b.confWins || 0) / Math.max(1, (b.confWins || 0) + (b.confLosses || 0))
        return bPct - aPct
      })
    const teamPctVal = (row.confWins || 0) / Math.max(1, (row.confWins || 0) + (row.confLosses || 0))
    const aboveCount = sortedByConf.filter(r => {
      const pct = (r.confWins || 0) / Math.max(1, (r.confWins || 0) + (r.confLosses || 0))
      return pct > teamPctVal
    }).length
    const tieCount = sortedByConf.filter(r => {
      const pct = (r.confWins || 0) / Math.max(1, (r.confWins || 0) + (r.confLosses || 0))
      return pct === teamPctVal
    }).length
    const position = aboveCount + 1
    const positionLabel = tieCount > 1 ? `T-${position}` : `${position}`
    const leader = sortedByConf[0] || null
    const leaderPct = leader ? (leader.confWins || 0) / Math.max(1, (leader.confWins || 0) + (leader.confLosses || 0)) : 0
    const gamesBackOfLeader = leader && leader !== row
      ? Math.max(0, ((leader.confWins || 0) - (row.confWins || 0)) / 2 + ((row.confLosses || 0) - (leader.confLosses || 0)) / 2)
      : 0

    return {
      conference: conf,
      overallRecord: `${row.wins || 0}-${row.losses || 0}`,
      conferenceRecord: `${row.confWins || 0}-${row.confLosses || 0}`,
      position,
      positionLabel,
      leaderTeam: leader && leader !== row ? leader.team : null,
      leaderRecord: leader && leader !== row ? `${leader.confWins || 0}-${leader.confLosses || 0}` : null,
      gamesBackOfLeader,
      sharedPosition: tieCount > 1,
    }
  }
  return null
}

// ──────────────────────────────────────────────────────────────────────
// CFP projection slice — returns this team's projected seed/bid if
// they're currently in the 12-team field. Calls into the same
// buildCFPProjection helper the Rankings page uses, so the answer
// stays in sync with what the user sees on /rankings.
// ──────────────────────────────────────────────────────────────────────
export async function getTeamCFPProjectionSlice(dynasty, teamAbbr, year) {
  // Note: buildCFPProjection lives in utils/cfpProjection. We can't
  // import it at module load (cfpProjection imports DynastyContext
  // which imports geminiService — circular). Keep this as a no-op
  // helper signature; the prompt builder calls buildCFPProjection
  // directly and slices it inline. Left here as a documentation
  // touchstone for the surface area.
  return null
}

// ──────────────────────────────────────────────────────────────────────
// Scoring-margin trend across the team's season-to-date played games.
// Average win margin and average loss margin let the AI anchor
// whether THIS result is in line with the season ("their largest
// margin of the year" / "their tightest game in two months") without
// counting.
// ──────────────────────────────────────────────────────────────────────
export function getTeamScoringMarginTrend(allGames, teamAbbr, year, currentGameOrder, dynasty) {
  if (!Array.isArray(allGames) || !teamAbbr) return null
  const teamTid = getTidFromAbbr(teamAbbr, dynasty)
  const yearNum = Number(year)
  const winMargins = []
  const lossMargins = []
  let largestWinMargin = 0, largestLossMargin = 0
  let largestWinOpp = null, largestLossOpp = null
  for (const g of allGames) {
    if (Number(g?.year) !== yearNum) continue
    if (isUnplayedGame(g)) continue
    if (currentGameOrder != null && getGameOrder(g) >= currentGameOrder) continue
    const inGame = teamTid != null && (g.team1Tid === teamTid || g.team2Tid === teamTid)
      || g.team1 === teamAbbr || g.team2 === teamAbbr || g.userTeam === teamAbbr
    if (!inGame) continue
    let margin = null, won = null, oppAbbr = null
    if (g.team1Tid != null && g.team2Tid != null) {
      const isT1 = g.team1Tid === teamTid
      const s1 = Number(g.team1Score) || 0
      const s2 = Number(g.team2Score) || 0
      margin = isT1 ? s1 - s2 : s2 - s1
      won = margin > 0
      oppAbbr = isT1 ? g.team2 : g.team1
    } else if (g.team1 && g.team2) {
      const isT1 = g.team1 === teamAbbr
      const s1 = Number(g.team1Score) || 0
      const s2 = Number(g.team2Score) || 0
      margin = isT1 ? s1 - s2 : s2 - s1
      won = margin > 0
      oppAbbr = isT1 ? g.team2 : g.team1
    } else if (g.userTeam === teamAbbr) {
      const teamScore = Number(g.teamScore) || 0
      const oppScore = Number(g.opponentScore) || 0
      margin = teamScore - oppScore
      won = margin > 0
      oppAbbr = g.opponent
    } else continue
    if (won) {
      winMargins.push(margin)
      if (margin > largestWinMargin) { largestWinMargin = margin; largestWinOpp = oppAbbr }
    } else {
      lossMargins.push(-margin)
      if (-margin > largestLossMargin) { largestLossMargin = -margin; largestLossOpp = oppAbbr }
    }
  }
  if (winMargins.length === 0 && lossMargins.length === 0) return null
  const avg = (arr) => arr.length === 0 ? null : Math.round((arr.reduce((s, x) => s + x, 0) / arr.length) * 10) / 10
  return {
    wins: winMargins.length,
    losses: lossMargins.length,
    avgWinMargin: avg(winMargins),
    avgLossMargin: avg(lossMargins),
    largestWinMargin: largestWinMargin || null,
    largestWinOpp,
    largestLossMargin: largestLossMargin || null,
    largestLossOpp,
    oneScoreWins: winMargins.filter(m => m <= 8).length,
    oneScoreLosses: lossMargins.filter(m => m <= 8).length,
    blowoutWins: winMargins.filter(m => m >= 21).length,
    blowoutLosses: lossMargins.filter(m => m >= 21).length,
  }
}

// ──────────────────────────────────────────────────────────────────────
// Team season-to-date profile — points/yards on offense AND defense,
// averaged across played games. The matchup-framing data the AI needs
// for "Tennessee's offense averaged 38 ppg coming in; South Carolina's
// defense had been allowing 31" type leads.
// ──────────────────────────────────────────────────────────────────────
export function getTeamSeasonProfile(allGames, teamAbbr, year, currentGameOrder, dynasty) {
  if (!Array.isArray(allGames) || !teamAbbr) return null
  const teamTid = getTidFromAbbr(teamAbbr, dynasty)
  const yearNum = Number(year)

  let games = 0
  let pointsFor = 0, pointsAgainst = 0
  let totalYdsFor = 0, totalYdsAgainst = 0
  let passYdsFor = 0, passYdsAgainst = 0
  let rushYdsFor = 0, rushYdsAgainst = 0
  let turnoversFor = 0, turnoversAgainst = 0
  let firstDownsFor = 0, firstDownsAgainst = 0
  let teamGamesWithBox = 0

  for (const g of allGames) {
    if (Number(g?.year) !== yearNum) continue
    if (isUnplayedGame(g)) continue
    if (currentGameOrder != null && getGameOrder(g) >= currentGameOrder) continue

    let isT1 = false, inGame = false
    if (g.team1Tid != null && g.team2Tid != null) {
      if (g.team1Tid === teamTid) { inGame = true; isT1 = true }
      else if (g.team2Tid === teamTid) { inGame = true; isT1 = false }
    } else if (g.team1 === teamAbbr) { inGame = true; isT1 = true }
    else if (g.team2 === teamAbbr) { inGame = true; isT1 = false }
    if (!inGame) continue

    games += 1

    // Score side — team1Score/team2Score. For user games (legacy), use
    // teamScore/opponentScore as fallback.
    const s1 = Number(g.team1Score)
    const s2 = Number(g.team2Score)
    if (Number.isFinite(s1) && Number.isFinite(s2)) {
      pointsFor += isT1 ? s1 : s2
      pointsAgainst += isT1 ? s2 : s1
    } else if (g.userTeam === teamAbbr && Number.isFinite(Number(g.teamScore))) {
      pointsFor += Number(g.teamScore)
      pointsAgainst += Number(g.opponentScore) || 0
    }

    // Box score teamStats — home/away keyed. Determine which side the
    // team was on by homeTeamTid (or home/away location field).
    const ts = g.boxScore?.teamStats
    if (ts && (ts.home || ts.away)) {
      let teamSide = null
      if (g.homeTeamTid != null) {
        teamSide = Number(g.homeTeamTid) === teamTid ? 'home' : 'away'
      } else if (g.location === 'home') teamSide = isT1 ? 'home' : 'away'
      else if (g.location === 'away') teamSide = isT1 ? 'away' : 'home'
      if (teamSide) {
        teamGamesWithBox += 1
        const oppSide = teamSide === 'home' ? 'away' : 'home'
        const own = ts[teamSide] || {}
        const opp = ts[oppSide] || {}
        const num = (v) => typeof v === 'number' ? v : (Number(v) || 0)
        totalYdsFor += num(own.totalYards ?? own.totalOffense)
        totalYdsAgainst += num(opp.totalYards ?? opp.totalOffense)
        passYdsFor += num(own.passingYards ?? own.passYards)
        passYdsAgainst += num(opp.passingYards ?? opp.passYards)
        rushYdsFor += num(own.rushYards)
        rushYdsAgainst += num(opp.rushYards)
        turnoversFor += num(own.turnovers)
        turnoversAgainst += num(opp.turnovers)
        firstDownsFor += num(own.firstDowns)
        firstDownsAgainst += num(opp.firstDowns)
      }
    }
  }

  if (games === 0) return null
  const avg = (n, d) => d > 0 ? Math.round((n / d) * 10) / 10 : null
  return {
    games,
    boxScoreGames: teamGamesWithBox,
    ppgFor: avg(pointsFor, games),
    ppgAgainst: avg(pointsAgainst, games),
    ydsForPerGame: avg(totalYdsFor, teamGamesWithBox),
    ydsAgainstPerGame: avg(totalYdsAgainst, teamGamesWithBox),
    passYdsForPerGame: avg(passYdsFor, teamGamesWithBox),
    passYdsAgainstPerGame: avg(passYdsAgainst, teamGamesWithBox),
    rushYdsForPerGame: avg(rushYdsFor, teamGamesWithBox),
    rushYdsAgainstPerGame: avg(rushYdsAgainst, teamGamesWithBox),
    turnoverMargin: turnoversAgainst - turnoversFor, // takeaways - giveaways
    firstDownsForPerGame: avg(firstDownsFor, teamGamesWithBox),
    firstDownsAgainstPerGame: avg(firstDownsAgainst, teamGamesWithBox),
  }
}

// ──────────────────────────────────────────────────────────────────────
// Coaching head-to-head — record between THIS game's two head coaches
// across all prior years. Walks the dynasty's games for past matchups
// between the same two teams; for each, looks up the head coach who
// was on staff for that team-year. Counts only games where BOTH HCs
// match the current pair (so coach changes correctly reset the H2H).
// ──────────────────────────────────────────────────────────────────────
export function getCoachHeadToHead(dynasty, allGames, team1Abbr, team2Abbr, currentYear) {
  if (!dynasty || !team1Abbr || !team2Abbr || !currentYear) return null
  const t1Tid = getTidFromAbbr(team1Abbr, dynasty)
  const t2Tid = getTidFromAbbr(team2Abbr, dynasty)
  if (t1Tid == null || t2Tid == null) return null

  // Current head coaches for both teams (mirror getCoachContext).
  const coachOf = (tid, year) => {
    const byYear = dynasty?.teams?.[tid]?.byYear
    const staff = byYear?.[year]?.coachingStaff || byYear?.[year - 1]?.coachingStaff
    return (staff?.hcName || '').trim() || null
  }
  const coach1 = coachOf(t1Tid, currentYear)
  const coach2 = coachOf(t2Tid, currentYear)
  if (!coach1 || !coach2) return null

  let coach1Wins = 0
  let coach2Wins = 0
  let total = 0
  for (const g of allGames) {
    const gYear = Number(g?.year)
    if (!Number.isFinite(gYear) || gYear >= Number(currentYear)) continue
    if (isUnplayedGame(g)) continue

    const isMatchup = (g.team1Tid === t1Tid && g.team2Tid === t2Tid)
      || (g.team1Tid === t2Tid && g.team2Tid === t1Tid)
    if (!isMatchup) continue

    // Look up each team's HC at the time of THIS prior matchup.
    const t1HcThen = coachOf(t1Tid, gYear)
    const t2HcThen = coachOf(t2Tid, gYear)
    if (!t1HcThen || !t2HcThen) continue
    if (t1HcThen !== coach1 || t2HcThen !== coach2) continue

    total += 1
    const s1 = Number(g.team1Score) || 0
    const s2 = Number(g.team2Score) || 0
    const team1Won = g.team1Tid === t1Tid ? s1 > s2 : s2 > s1
    if (team1Won) coach1Wins += 1
    else coach2Wins += 1
  }

  return {
    coach1Name: coach1,
    coach2Name: coach2,
    coach1Wins,
    coach2Wins,
    totalMeetings: total,
    isFirstMeeting: total === 0,
  }
}

// ──────────────────────────────────────────────────────────────────────
// Per-player season-high context — for each top performer in THIS
// game's box score, flag whether the stat line ties or exceeds the
// player's previous season high (in any earlier game this year).
// Returns map keyed by player name with { passYdsHigh, rushYdsHigh,
// recYdsHigh, ... } booleans.
//
// Walks every prior game's box score this year once; cost is O(games
// in season × players per game).
// ──────────────────────────────────────────────────────────────────────
export function getPlayerSeasonHighFlags(allGames, year, currentGameOrder, currentGame) {
  if (!currentGame?.boxScore) return {}
  const yearNum = Number(year)

  // Build per-player previous-high map across all PRIOR games this year.
  const prevHighs = new Map() // name -> { passYds, rushYds, recYds, defTackles, defSacks, defInts }
  const trackHigh = (name, key, value) => {
    if (!name || !value || typeof value !== 'number' || value <= 0) return
    if (!prevHighs.has(name)) prevHighs.set(name, {})
    const m = prevHighs.get(name)
    if (!(key in m) || value > m[key]) m[key] = value
  }
  for (const g of allGames) {
    if (Number(g?.year) !== yearNum) continue
    if (currentGameOrder != null && getGameOrder(g) >= currentGameOrder) continue
    const bs = g.boxScore
    if (!bs) continue
    for (const side of ['home', 'away']) {
      const block = bs[side]
      if (!block) continue
      for (const p of (block.passing || [])) trackHigh(p?.name || p?.playerName, 'passYds', p?.passYds ?? p?.yds)
      for (const p of (block.rushing || [])) trackHigh(p?.name || p?.playerName, 'rushYds', p?.rushYds ?? p?.yds)
      for (const p of (block.receiving || [])) trackHigh(p?.name || p?.playerName, 'recYds', p?.recYds ?? p?.yds)
      for (const p of (block.defense || [])) {
        const name = p?.name || p?.playerName
        const tackles = (p?.soloTkl || 0) + (p?.astTkl || 0) || (p?.tackles || 0)
        trackHigh(name, 'tackles', tackles)
        trackHigh(name, 'sacks', p?.sacks)
        trackHigh(name, 'ints', p?.int)
      }
    }
  }

  // Compare THIS game's stat lines against prevHighs.
  const flags = {}
  const setFlag = (name, key, currentValue) => {
    if (!name || !currentValue || typeof currentValue !== 'number') return
    const prev = prevHighs.get(name)?.[key]
    if (!flags[name]) flags[name] = {}
    if (prev == null) flags[name][key + 'IsFirstSeason'] = true
    else if (currentValue > prev) flags[name][key + 'IsSeasonHigh'] = true
    if (prev != null) flags[name][key + 'PrevHigh'] = prev
  }
  for (const side of ['home', 'away']) {
    const block = currentGame.teamStats
    if (!block) continue
    for (const p of (block.passing || [])) setFlag(p?.name || p?.playerName, 'passYds', p?.passYds ?? p?.yds)
    for (const p of (block.rushing || [])) setFlag(p?.name || p?.playerName, 'rushYds', p?.rushYds ?? p?.yds)
    for (const p of (block.receiving || [])) setFlag(p?.name || p?.playerName, 'recYds', p?.recYds ?? p?.yds)
    for (const p of (block.defense || [])) {
      const name = p?.name || p?.playerName
      const tackles = (p?.soloTkl || 0) + (p?.astTkl || 0) || (p?.tackles || 0)
      setFlag(name, 'tackles', tackles)
      setFlag(name, 'sacks', p?.sacks)
      setFlag(name, 'ints', p?.int)
    }
  }
  return flags
}

// ──────────────────────────────────────────────────────────────────────
// Conference race context — current standing + remaining conference
// games + leader's record. Lets the AI reason about CCG implications
// without us pre-baking division/tiebreaker rules.
// ──────────────────────────────────────────────────────────────────────
export function getConferenceRaceContext(dynasty, allGames, teamAbbr, year, currentGameOrder) {
  if (!dynasty || !teamAbbr || !year) return null
  const teamTid = getTidFromAbbr(teamAbbr, dynasty)
  const yearNum = Number(year)
  const standings = dynasty.conferenceStandingsByYear?.[yearNum]
    || dynasty.conferenceStandingsByYear?.[String(yearNum)]
  if (!standings) return null

  // Find the team's conference and its row in standings.
  let conferenceName = null, teamRow = null, allRows = null
  for (const [conf, rows] of Object.entries(standings)) {
    if (!Array.isArray(rows)) continue
    const r = rows.find(row => row && (
      (teamTid != null && Number(row.tid) === Number(teamTid)) || row.team === teamAbbr
    ))
    if (r) { conferenceName = conf; teamRow = r; allRows = rows; break }
  }
  if (!teamRow || !allRows) return null

  // Count remaining CONFERENCE games for this team.
  let remainingConfGames = 0
  const remainingOpponents = []
  for (const g of allGames) {
    if (Number(g.year) !== yearNum) continue
    if (currentGameOrder != null && getGameOrder(g) <= currentGameOrder) continue
    if (g.isBowlGame || g.isCFPFirstRound || g.isCFPQuarterfinal
      || g.isCFPSemifinal || g.isCFPChampionship || g.isConferenceChampionship) continue
    if (!g.isConferenceGame) continue
    const inGame = (g.team1Tid != null && Number(g.team1Tid) === teamTid)
      || (g.team2Tid != null && Number(g.team2Tid) === teamTid)
      || g.team1 === teamAbbr || g.team2 === teamAbbr || g.userTeam === teamAbbr
    if (!inGame) continue
    remainingConfGames += 1
    let oppAbbr = null
    if (g.team1Tid != null && g.team2Tid != null) {
      oppAbbr = Number(g.team1Tid) === teamTid ? g.team2 : g.team1
    } else if (g.team1 === teamAbbr) oppAbbr = g.team2
    else if (g.team2 === teamAbbr) oppAbbr = g.team1
    if (oppAbbr) remainingOpponents.push(oppAbbr)
  }

  // Conference leader (best conf record).
  const sorted = [...allRows]
    .filter(r => r && (typeof r.confWins === 'number' || typeof r.confLosses === 'number'))
    .sort((a, b) => {
      const aL = a.confLosses || 0
      const bL = b.confLosses || 0
      if (aL !== bL) return aL - bL
      const aW = a.confWins || 0
      const bW = b.confWins || 0
      return bW - aW
    })
  const leader = sorted[0] || null

  return {
    conference: conferenceName,
    overallRecord: `${teamRow.wins || 0}-${teamRow.losses || 0}`,
    conferenceRecord: `${teamRow.confWins || 0}-${teamRow.confLosses || 0}`,
    confLosses: teamRow.confLosses || 0,
    remainingConfGames,
    remainingOpponents,
    leaderTeam: leader && leader !== teamRow ? leader.team : null,
    leaderConfRecord: leader && leader !== teamRow ? `${leader.confWins || 0}-${leader.confLosses || 0}` : null,
    leaderConfLosses: leader && leader !== teamRow ? (leader.confLosses || 0) : null,
  }
}

// ──────────────────────────────────────────────────────────────────────
// Resume splits — record vs ranked / unranked / home / away / one-score
// / blowout. Extends QualityWL with the cleaner "résumé tally" framing
// the AI can drop straight into prose ("Tennessee is 4-0 vs ranked
// teams this year — the only top-25 program with that mark").
// ──────────────────────────────────────────────────────────────────────
export function getTeamResumeSplits(allGames, teamAbbr, year, currentGameOrder, dynasty) {
  if (!Array.isArray(allGames) || !teamAbbr) return null
  const teamTid = getTidFromAbbr(teamAbbr, dynasty)
  const yearNum = Number(year)
  let rankedW = 0, rankedL = 0
  let unrankedW = 0, unrankedL = 0
  let homeW = 0, homeL = 0
  let awayW = 0, awayL = 0
  let neutralW = 0, neutralL = 0
  for (const g of allGames) {
    if (Number(g?.year) !== yearNum) continue
    if (isUnplayedGame(g)) continue
    if (currentGameOrder != null && getGameOrder(g) >= currentGameOrder) continue
    let inGame = false, isT1 = false, oppRank = null, won = null
    if (g.team1Tid != null && g.team2Tid != null) {
      if (g.team1Tid === teamTid) { inGame = true; isT1 = true }
      else if (g.team2Tid === teamTid) { inGame = true; isT1 = false }
      if (inGame) {
        const s1 = Number(g.team1Score) || 0
        const s2 = Number(g.team2Score) || 0
        won = isT1 ? s1 > s2 : s2 > s1
        oppRank = isT1 ? g.team2Rank : g.team1Rank
      }
    } else if (g.team1 === teamAbbr || g.team2 === teamAbbr) {
      inGame = true
      isT1 = g.team1 === teamAbbr
      const s1 = Number(g.team1Score) || 0
      const s2 = Number(g.team2Score) || 0
      won = isT1 ? s1 > s2 : s2 > s1
      oppRank = isT1 ? g.team2Rank : g.team1Rank
    } else if (g.userTeam === teamAbbr) {
      inGame = true
      won = g.result === 'win' || g.result === 'W'
      oppRank = g.opponentRank
    }
    if (!inGame || won == null) continue
    const wasRanked = typeof oppRank === 'number' && oppRank >= 1 && oppRank <= 25
    if (wasRanked) {
      if (won) rankedW += 1; else rankedL += 1
    } else {
      if (won) unrankedW += 1; else unrankedL += 1
    }
    // Site classification.
    let site = 'neutral'
    if (g.homeTeamTid != null) {
      if (Number(g.homeTeamTid) === teamTid) site = 'home'
      else site = 'away'
    } else if (g.location === 'home') site = 'home'
    else if (g.location === 'away') site = 'away'
    if (site === 'home') { if (won) homeW += 1; else homeL += 1 }
    else if (site === 'away') { if (won) awayW += 1; else awayL += 1 }
    else { if (won) neutralW += 1; else neutralL += 1 }
  }
  return {
    vsRanked: { wins: rankedW, losses: rankedL },
    vsUnranked: { wins: unrankedW, losses: unrankedL },
    home: { wins: homeW, losses: homeL },
    away: { wins: awayW, losses: awayL },
    neutral: { wins: neutralW, losses: neutralL },
  }
}

/**
 * Get a team's season history (past years' records)
 * Returns records for previous seasons where this team was coached
 */
function getTeamSeasonHistory(allGames, teamAbbr, currentYear, maxSeasons = 3, dynasty = null) {
  const seasonsByYear = {}
  // Pass dynasty so a teambuilder-renamed team's abbr resolves to its tid.
  const teamTid = getTidFromAbbr(teamAbbr, dynasty)

  for (const g of allGames) {
    const gYear = Number(g.year)
    if (gYear >= Number(currentYear)) continue

    // Check if this game involved the team (support both legacy and unified formats)
    const teamInGameLegacy = g.userTeam === teamAbbr || g.team1 === teamAbbr || g.team2 === teamAbbr
    const teamInGameUnified = teamTid && (g.team1Tid === teamTid || g.team2Tid === teamTid || g.userTid === teamTid)
    if (!teamInGameLegacy && !teamInGameUnified) continue
    if (isUnplayedGame(g)) continue

    if (!seasonsByYear[gYear]) {
      seasonsByYear[gYear] = { year: gYear, wins: 0, losses: 0, confWins: 0, confLosses: 0 }
    }

    // Determine if team won (handle all formats). Tid checks first; abbr
    // fallbacks for legacy data. Critically, the final `else` branch only
    // assumes team2 when we've EXPLICITLY confirmed the team is in the
    // team2 slot — otherwise we skip the game (continue) so a renamed
    // teambuilder team doesn't get silently mis-attributed.
    let won
    const isUserSide = g.userTeam === teamAbbr || (teamTid && Number(g.userTid) === Number(teamTid))
    const isTeam1 = g.team1 === teamAbbr || (teamTid && Number(g.team1Tid) === Number(teamTid))
    const isTeam2 = g.team2 === teamAbbr || (teamTid && Number(g.team2Tid) === Number(teamTid))
    if (isUserSide) {
      if (g.result) {
        won = g.result === 'win' || g.result === 'W'
      } else {
        won = (g.teamScore || g.team1Score) > (g.opponentScore || g.team2Score)
      }
    } else if (isTeam1) {
      won = g.team1Score > g.team2Score
    } else if (isTeam2) {
      won = g.team2Score > g.team1Score
    } else {
      // Game claimed to involve the team via one matcher but no slot is
      // identifiable now — skip rather than guess wrong (drift safety).
      continue
    }

    if (won) {
      seasonsByYear[gYear].wins++
      if (g.isConferenceGame) seasonsByYear[gYear].confWins++
    } else {
      seasonsByYear[gYear].losses++
      if (g.isConferenceGame) seasonsByYear[gYear].confLosses++
    }
  }

  // Only emit seasons where we have enough games to represent a plausible
  // full season. Otherwise a CPU team might show a misleading "1-1 overall"
  // when really we only tracked one win and one loss in this dynasty's
  // history — not their actual FBS season record. 6 games is a loose floor.
  const MIN_GAMES_PER_SEASON = 6
  return Object.values(seasonsByYear)
    .filter(s => (s.wins + s.losses) >= MIN_GAMES_PER_SEASON)
    .sort((a, b) => b.year - a.year)
    .slice(0, maxSeasons)
}

/**
 * Get per-game logs for a team across their past N seasons.
 *
 * Returns every played game (regular season + postseason) for the team
 * across the last `maxSeasons` years before `currentYear`, sorted
 * chronologically within each season. Includes box-score highlights
 * (top passer + rusher + receiver) whenever the data exists.
 *
 * Used by buildGameRecapPrompt to give the AI a full picture of each
 * team's recent form and key performers — not just a W-L record.
 *
 * @param {Array}  allGames    - Full dynasty game array
 * @param {string} teamAbbr   - Team abbreviation (for legacy-format lookups)
 * @param {number} currentYear - Current season year (excluded from results)
 * @param {number} maxSeasons  - How many prior seasons to include (default 3)
 * @param {object} dynasty     - Dynasty object for tid / name resolution
 * @returns {Array} newest-first: [{ year, games: [GameLogEntry] }]
 */
function getTeamSeasonGameLogs(allGames, teamAbbr, currentYear, maxSeasons = 3, dynasty = null) {
  const num = (x) => (x == null ? null : Number(x))
  const teamTid = getTidFromAbbr(teamAbbr, dynasty)
  const teams = dynasty?.teams || TEAMS

  // Which years to include — scan all prior games first
  const yearSet = new Set()
  for (const g of allGames) {
    const gy = Number(g.year)
    if (gy < Number(currentYear) && !isUnplayedGame(g)) yearSet.add(gy)
  }
  const targetYears = [...yearSet].sort((a, b) => b - a).slice(0, maxSeasons)

  const seasonLogs = []

  for (const targetYear of targetYears) {
    const games = []

    for (const g of allGames) {
      if (Number(g.year) !== targetYear) continue
      if (isUnplayedGame(g)) continue

      // ─── Resolve which side the team was on ───────────────────────────
      let teamScore, oppScore, won, oppAbbr, found = false, isHomeTeam = null

      const isBowlOrCFP = g.isBowlGame || g.isCFPFirstRound || g.isCFPQuarterfinal ||
                          g.isCFPSemifinal || g.isCFPChampionship || g.isConferenceChampionship

      const asTeam1Tid = teamTid && num(g.team1Tid) === num(teamTid)
      const asTeam2Tid = teamTid && num(g.team2Tid) === num(teamTid)
      const asUserTid  = teamTid && num(g.userTid)  === num(teamTid)

      if (asTeam1Tid || (!teamTid && g.team1 === teamAbbr)) {
        teamScore = g.team1Score; oppScore = g.team2Score
        won = teamScore > oppScore
        oppAbbr = getAbbrFromTid(g.team2Tid, dynasty) || g.team2
        if (!isBowlOrCFP && g.homeTeamTid != null)
          isHomeTeam = num(g.homeTeamTid) === num(teamTid)
        found = true

      } else if (asTeam2Tid || (!teamTid && g.team2 === teamAbbr)) {
        teamScore = g.team2Score; oppScore = g.team1Score
        won = teamScore > oppScore
        oppAbbr = getAbbrFromTid(g.team1Tid, dynasty) || g.team1
        if (!isBowlOrCFP && g.homeTeamTid != null)
          isHomeTeam = num(g.homeTeamTid) === num(teamTid)
        found = true

      } else if (asUserTid || (!teamTid && g.userTeam === teamAbbr)) {
        won = g.result === 'win' || g.result === 'W'
        teamScore = g.teamScore; oppScore = g.opponentScore
        oppAbbr = g.opponent
        if (!isBowlOrCFP) isHomeTeam = (g.location === 'home' || g.location == null)
        found = true

      } else {
        // Legacy abbr fallbacks (CPU-vs-CPU, no tid)
        if (g.team1 === teamAbbr) {
          teamScore = g.team1Score; oppScore = g.team2Score
          won = teamScore > oppScore; oppAbbr = g.team2; found = true
          if (!isBowlOrCFP && g.homeTeamTid != null) isHomeTeam = num(g.homeTeamTid) === num(getTidFromAbbr(g.team1, dynasty))
        } else if (g.team2 === teamAbbr) {
          teamScore = g.team2Score; oppScore = g.team1Score
          won = teamScore > oppScore; oppAbbr = g.team1; found = true
        }
      }

      if (!found) continue

      // Location label
      let location
      if (isBowlOrCFP) location = 'neutral'
      else if (isHomeTeam === true) location = 'home'
      else if (isHomeTeam === false) location = 'away'
      else location = g.location || 'home'

      // Game-type label for postseason rows
      let gameTypeLabel = ''
      if (g.isCFPChampionship)      gameTypeLabel = 'CFP Championship'
      else if (g.isCFPSemifinal)    gameTypeLabel = 'CFP Semifinal'
      else if (g.isCFPQuarterfinal) gameTypeLabel = 'CFP Quarterfinal'
      else if (g.isCFPFirstRound)   gameTypeLabel = 'CFP First Round'
      else if (g.isConferenceChampionship) gameTypeLabel = 'Conf Championship'
      else if (g.isBowlGame)        gameTypeLabel = g.bowlName || 'Bowl Game'

      // Opponent entering-game rank (for context like "@ #5 Alabama")
      const oppRank = (() => {
        // Try to find from the rankings stored on the game or from the week's rankings
        // Use whichever tid represents the opponent
        const oppTid = oppAbbr ? getTidFromAbbr(oppAbbr, dynasty) : null
        if (!oppTid || !dynasty?.teams?.[oppTid]) return null
        const team = dynasty.teams[oppTid]
        const rbw = team?.byYear?.[targetYear]?.rankByWeek ?? team?.byYear?.[String(targetYear)]?.rankByWeek
        if (!rbw) return null
        const wk = g.week
        return rbw[wk] ?? rbw[String(wk)] ?? null
      })()

      // ─── Box-score highlights for THIS team ───────────────────────────
      let passer = null, rusher = null, receiver = null
      if (g.boxScore && teamTid) {
        const ps = getPlayerStatsForTid(g, teamTid, teams)
        if (ps) {
          // Top passer (min 10 pass attempts)
          if (ps.passing?.length > 0) {
            const sorted = ps.passing
              .map(p => ({ ...p, _att: p.attempts ?? p.att ?? 0, _yds: p.yards ?? p.yds ?? 0 }))
              .filter(p => p._att >= 10)
              .sort((a, b) => b._yds - a._yds)
            if (sorted.length > 0) {
              const p = sorted[0]
              const cmp = p.comp ?? p.cmp ?? 0
              const att = p._att
              const yds = p._yds
              const td = p.tD ?? p.td ?? 0
              const int = p.iNT ?? p.int ?? 0
              passer = `${p.playerName} ${cmp}/${att} ${yds}yds${td ? ` ${td}TD` : ''}${int ? ` ${int}INT` : ''}`
            }
          }
          // Top rusher (min 5 carries)
          if (ps.rushing?.length > 0) {
            const sorted = ps.rushing
              .map(p => ({ ...p, _car: p.carries ?? p.car ?? 0, _yds: p.yards ?? p.yds ?? 0 }))
              .filter(p => p._car >= 5)
              .sort((a, b) => b._yds - a._yds)
            if (sorted.length > 0) {
              const p = sorted[0]
              const car = p._car
              const yds = p._yds
              const td = p.tD ?? p.td ?? 0
              rusher = `${p.playerName} ${car}car ${yds}yds${td ? ` ${td}TD` : ''}`
            }
          }
          // Top receiver (min 3 receptions) — only include if adds context
          if (ps.receiving?.length > 0) {
            const sorted = ps.receiving
              .map(p => ({ ...p, _rec: p.receptions ?? p.rec ?? 0, _yds: p.yards ?? p.yds ?? 0 }))
              .filter(p => p._rec >= 3)
              .sort((a, b) => b._yds - a._yds)
            if (sorted.length > 0) {
              const p = sorted[0]
              const rec = p._rec
              const yds = p._yds
              const td = p.tD ?? p.td ?? 0
              receiver = `${p.playerName} ${rec}rec ${yds}yds${td ? ` ${td}TD` : ''}`
            }
          }
        }
      }

      games.push({
        week: g.week,
        gameOrder: getGameOrder(g),
        result: won ? 'W' : 'L',
        teamScore,
        oppScore,
        opponent: oppAbbr,
        oppRank: (typeof oppRank === 'number' && oppRank >= 1 && oppRank <= 25) ? oppRank : null,
        location,
        isConference: !!g.isConferenceGame,
        gameTypeLabel,
        passer,
        rusher,
        receiver,
      })
    }

    // Sort chronologically within the season
    games.sort((a, b) => a.gameOrder - b.gameOrder)

    // Only include seasons that have enough games to be meaningful
    if (games.length >= 4) {
      seasonLogs.push({ year: targetYear, games })
    }
  }

  return seasonLogs // already sorted newest-first
}

/**
 * Get opponent's season results (their games this year)
 * Shows how the opponent has performed leading up to this matchup
 * Supports both legacy and unified game formats
 */
function getOpponentSeasonResults(allGames, opponentAbbr, year, currentGameOrder, dynasty = null) {
  const results = []
  // Pass dynasty so a teambuilder-renamed team's abbr resolves to its tid.
  const opponentTid = getTidFromAbbr(opponentAbbr, dynasty)

  for (const g of allGames) {
    if (Number(g.year) !== Number(year)) continue
    if (getGameOrder(g) >= currentGameOrder) continue
    if (isUnplayedGame(g)) continue

    // Check if opponent was in this game. Try unified (tid-based) FIRST
    // so a renamed teambuilder team is still found via stable tid even if
    // a legacy abbr branch would also (incorrectly) match the wrong row.
    let opponentWon, oppScore, otherTeam, otherScore, found = false

    if (opponentTid && Number(g.team1Tid) === Number(opponentTid)) {
      opponentWon = g.team1Score > g.team2Score
      oppScore = g.team1Score
      otherTeam = getAbbrFromTid(g.team2Tid, dynasty) || g.team2
      otherScore = g.team2Score
      found = true
    } else if (opponentTid && Number(g.team2Tid) === Number(opponentTid)) {
      opponentWon = g.team2Score > g.team1Score
      oppScore = g.team2Score
      otherTeam = getAbbrFromTid(g.team1Tid, dynasty) || g.team1
      otherScore = g.team1Score
      found = true
    } else if (opponentTid && Number(g.userTid) === Number(opponentTid)) {
      opponentWon = g.result === 'win' || g.result === 'W'
      oppScore = g.teamScore
      otherTeam = g.opponent
      otherScore = g.opponentScore
      found = true
    }
    // Legacy format fallbacks: userTeam/opponent and team1/team2 abbrs
    else if (g.userTeam === opponentAbbr) {
      opponentWon = g.result === 'win' || g.result === 'W'
      oppScore = g.teamScore
      otherTeam = g.opponent
      otherScore = g.opponentScore
      found = true
    } else if (g.opponent === opponentAbbr) {
      opponentWon = g.result !== 'win' && g.result !== 'W'
      oppScore = g.opponentScore
      otherTeam = g.userTeam
      otherScore = g.teamScore
      found = true
    } else if (g.team1 === opponentAbbr) {
      opponentWon = g.team1Score > g.team2Score
      oppScore = g.team1Score
      otherTeam = g.team2
      otherScore = g.team2Score
      found = true
    } else if (g.team2 === opponentAbbr) {
      opponentWon = g.team2Score > g.team1Score
      oppScore = g.team2Score
      otherTeam = g.team1
      otherScore = g.team1Score
      found = true
    }

    if (!found) continue

    results.push({
      week: g.week,
      result: opponentWon ? 'W' : 'L',
      score: `${oppScore}-${otherScore}`,
      opponent: otherTeam,
      isConferenceGame: g.isConferenceGame
    })
  }

  // Numeric weeks sort first (0..14), CCG just after (14.5), other
  // non-numeric weeks at the end. Plain (a.week || 0) - (b.week || 0)
  // produces NaN for CCG games and leaves them at arbitrary positions.
  const _wkOrd = (w) => {
    if (w == null || w === '') return Number.POSITIVE_INFINITY
    const n = Number(w)
    if (Number.isFinite(n)) return n
    const s = String(w).toUpperCase()
    return (s === 'CCG' || s === 'CC') ? 14.5 : Number.POSITIVE_INFINITY
  }
  return results.sort((a, b) => _wkOrd(a.week) - _wkOrd(b.week))
}

/**
 * Get performance trends for players in the box score
 * Shows if players are on hot streaks, bouncing back, etc.
 */
function getPlayerPerformanceTrends(teamStats, players, allGames, year, currentGameOrder, dynasty = null) {
  const trends = []
  if (!teamStats) return trends

  // Get all players from this team's box score
  const playerNames = new Set()
  for (const category of ['passing', 'rushing', 'receiving', 'defense']) {
    const entries = teamStats[category] || []
    entries.forEach(p => {
      if (p.playerName) playerNames.add(p.playerName)
    })
  }

  // For each player, check their recent performances
  for (const playerName of playerNames) {
    const recentGames = []
    const normalized = normalizePlayerName(playerName)

    // Find this player's stats in previous games this season
    const prevGames = allGames
      .filter(g => Number(g.year) === Number(year) && getGameOrder(g) < currentGameOrder && g.boxScore && !isUnplayedGame(g))
      .sort((a, b) => getGameOrder(b) - getGameOrder(a))
      .slice(0, 3)

    for (const g of prevGames) {
      // Pre-resolve which tid sits on each box-score side. homeTeamTid is the
      // source of truth — team1Tid/team2Tid do NOT always map to home/away.
      let homeSideTid = null
      let awaySideTid = null
      if (g.team1Tid && g.team2Tid) {
        if (g.homeTeamTid) {
          homeSideTid = g.homeTeamTid
          awaySideTid = g.homeTeamTid === g.team1Tid ? g.team2Tid : g.team1Tid
        } else {
          // Neutral site / no home marker — assume team1=home as a best-effort
          homeSideTid = g.team1Tid
          awaySideTid = g.team2Tid
        }
      }

      for (const gameSide of ['home', 'away']) {
        for (const category of ['passing', 'rushing', 'receiving', 'defense']) {
          const entries = g.boxScore?.[gameSide]?.[category] || []
          const playerEntry = entries.find(p => normalizePlayerName(p.playerName) === normalized)
          if (!playerEntry) continue

          // Opponent is the team on the OTHER box-score side from where the
          // player appeared. g.opponent is unreliable (it's stored from the
          // user's perspective, not this player's).
          const opponentTid = gameSide === 'home' ? awaySideTid : homeSideTid
          const otherSide = gameSide === 'home' ? 'away' : 'home'
          let opponentName = null
          if (opponentTid) {
            // Prefer dynasty.teams (picks up teambuilder-renamed teams) over
            // the static TEAMS table so a custom team's name is used.
            const fromDynasty = dynasty?.teams?.[opponentTid] || dynasty?.customTeams?.[opponentTid]
            if (fromDynasty) {
              opponentName = fromDynasty.name || fromDynasty.mascot || fromDynasty.abbr
            }
            if (!opponentName && TEAMS[opponentTid]) {
              opponentName = TEAMS[opponentTid].name || TEAMS[opponentTid].mascot || TEAMS[opponentTid].abbr
            }
          }
          if (!opponentName) {
            opponentName = g.boxScore?.[otherSide]?.teamName || null
          }
          if (!opponentName) {
            const fallback = gameSide === 'home' ? g.team2 : g.team1
            opponentName = typeof fallback === 'string' ? fallback : null
          }

          // Skip zero-stat noise rows (e.g., "0 car, 0 yds") — these appear
          // when a player is on the box score because they had a catch but
          // recorded 0 carries, and vice-versa. Keep only categories where
          // the player actually produced something notable.
          if (isZeroStatRow(playerEntry, category)) continue

          recentGames.push({
            week: g.week,
            opponent: opponentName,
            category,
            stats: playerEntry
          })
        }
      }
    }

    if (recentGames.length >= 2) {
      // Analyze trend
      const player = players.find(p => normalizePlayerName(p.name) === normalized)
      let trendDescription = null

      // Helper to get yards from stats (handles both field name formats)
      const getYards = (stats) => stats?.yards ?? stats?.yds ?? 0

      // Check for passing trends
      const passingGames = recentGames.filter(g => g.category === 'passing')
      if (passingGames.length >= 2) {
        const ydsRecent = passingGames.slice(0, 2).reduce((sum, g) => sum + getYards(g.stats), 0) / 2
        if (ydsRecent > 250) trendDescription = 'on a hot streak'
        else if (getYards(passingGames[0]?.stats) > getYards(passingGames[1]?.stats) + 50) trendDescription = 'bouncing back'
      }

      // Check for rushing trends
      const rushingGames = recentGames.filter(g => g.category === 'rushing')
      if (rushingGames.length >= 2) {
        const ydsRecent = rushingGames.slice(0, 2).reduce((sum, g) => sum + getYards(g.stats), 0) / 2
        if (ydsRecent > 100) trendDescription = 'running hot'
        else if (getYards(rushingGames[0]?.stats) > getYards(rushingGames[1]?.stats) + 30) trendDescription = 'finding his stride'
      }

      // Check for receiving trends
      const receivingGames = recentGames.filter(g => g.category === 'receiving')
      if (receivingGames.length >= 2) {
        const ydsRecent = receivingGames.slice(0, 2).reduce((sum, g) => sum + getYards(g.stats), 0) / 2
        if (ydsRecent > 80) trendDescription = 'red hot'
      }

      if (trendDescription || recentGames.length >= 2) {
        trends.push({
          player: playerName,
          position: player?.position || null,
          trend: trendDescription,
          recentGames: recentGames.slice(0, 3).map(g => {
            // Handle both field name formats (sheets vs aggregated)
            const s = g.stats
            const cmp = s.comp ?? s.cmp ?? 0
            const att = s.attempts ?? s.att ?? 0
            const yds = s.yards ?? s.yds ?? 0
            const td = s.tD ?? s.td ?? 0
            const car = s.carries ?? s.car ?? 0
            const rec = s.receptions ?? s.rec ?? 0

            return {
              week: g.week,
              opponent: g.opponent,
              category: g.category,
              stats: g.category === 'passing' ? `${cmp}/${att}, ${yds} yds, ${td} TD` :
                     g.category === 'rushing' ? `${car} car, ${yds} yds` :
                     g.category === 'receiving' ? `${rec} rec, ${yds} yds` :
                     `${(s.solo || 0) + (s.assists || 0)} tkl`
            }
          })
        })
      }
    }
  }

  return trends.slice(0, 5) // Top 5 players with trends
}

// ============================================
// CONTEXT BUILDERS
// ============================================

/**
 * Build comprehensive context for a game recap
 * Handles both user games (with opponent/teamScore) and CPU games (with team1/team2)
 */
export function buildGameRecapContext(dynasty, game) {
  const userTeamAbbr = getCurrentTeamAbbr(dynasty) || dynasty.teamName
  const year = game.year
  const allGames = dynasty.games || []
  const teams = dynasty?.teams || TEAMS

  // Helper to get abbr from tid
  const getAbbrFromTid = (tid) => {
    if (!tid) return null
    const teamInfo = getGameTeamInfo(teams, tid)
    return teamInfo?.abbr || null
  }

  // Check for unified format and get perspective for user games
  const hasUnifiedFormat = game.team1Tid && game.team2Tid
  const currentGamePerspective = getUserGamePerspective(game, dynasty)
  const isCurrentGameUserGame = currentGamePerspective !== null
  const isCPUGame = !isCurrentGameUserGame && (
    (!hasUnifiedFormat && !game.userTeam && game.team1 && game.team2) ||
    (hasUnifiedFormat && !game.userTeam && !game.opponent)
  )

  // Determine teams and scores based on game type. team1/team2 are
  // labels for the prompt template; box-score data is resolved by tid
  // independently below, so home/away no longer dictates this ordering.
  let team1, team2, team1Score, team2Score
  // Tids carried alongside abbrs so downstream scoring/lead-flow logic can
  // resolve play.team (abbr string) → tid via the game's two teams. Critical
  // for teambuilder teams whose abbr can drift after the game was recorded.
  let team1Tid = null
  let team2Tid = null
  if (isCurrentGameUserGame) {
    // User game - use perspective to ensure correct team alignment
    // This works for both unified format and legacy format user games
    const userInfo = currentGamePerspective.userTid ? getGameTeamInfo(teams, currentGamePerspective.userTid) : null
    const oppInfo = currentGamePerspective.opponentTid ? getGameTeamInfo(teams, currentGamePerspective.opponentTid) : null
    team1 = userInfo?.abbr || game.userTeam || userTeamAbbr
    team2 = oppInfo?.abbr || game.opponent
    team1Tid = currentGamePerspective.userTid != null ? Number(currentGamePerspective.userTid) : null
    team2Tid = currentGamePerspective.opponentTid != null ? Number(currentGamePerspective.opponentTid) : null
    team1Score = currentGamePerspective.userScore ?? game.teamScore
    team2Score = currentGamePerspective.opponentScore ?? game.opponentScore
  } else if (hasUnifiedFormat) {
    // CPU game with unified format - use tids directly
    team1 = getAbbrFromTid(game.team1Tid) || game.team1
    team2 = getAbbrFromTid(game.team2Tid) || game.team2
    team1Tid = game.team1Tid != null ? Number(game.team1Tid) : null
    team2Tid = game.team2Tid != null ? Number(game.team2Tid) : null
    team1Score = game.team1Score
    team2Score = game.team2Score
  } else if (isCPUGame) {
    // Legacy CPU game format
    team1 = game.team1
    team2 = game.team2
    team1Tid = game.team1Tid != null ? Number(game.team1Tid) : null
    team2Tid = game.team2Tid != null ? Number(game.team2Tid) : null
    team1Score = game.team1Score
    team2Score = game.team2Score
  } else {
    // Fallback for legacy user games without perspective
    team1 = game.userTeam || userTeamAbbr
    team2 = game.opponent
    team1Tid = game.userTid != null ? Number(game.userTid) : null
    team2Tid = game.opponentTid != null ? Number(game.opponentTid) : null
    team1Score = game.teamScore
    team2Score = game.opponentScore
  }

  // Derive location for unified format games from homeTeamTid
  // IMPORTANT: Bowl games, CFP games, and conference championships are ALWAYS neutral site
  const isBowlOrCFP = game.isBowlGame || game.isCFPFirstRound || game.isCFPQuarterfinal ||
                       game.isCFPSemifinal || game.isCFPChampionship || game.isConferenceChampionship ||
                       game.gameType === 'bowl' || (game.gameType || '').startsWith('cfp_')

  let gameLocation = isBowlOrCFP ? 'neutral' : game.location
  if (!gameLocation && hasUnifiedFormat) {
    // For unified format, derive location from homeTeamTid
    if (game.homeTeamTid === null) {
      gameLocation = 'neutral'
    } else if (game.homeTeamTid === game.team1Tid) {
      // team1 (user's team for user games) is home
      gameLocation = 'home'
    } else if (game.homeTeamTid === game.team2Tid) {
      // team2 (opponent for user games) is home, so user is away
      gameLocation = 'away'
    }
  }

  const scoreDiff = Math.abs(team1Score - team2Score)
  const team1Won = team1Score > team2Score

  // Calculate game order for this game (used for filtering previous games)
  const thisGameOrder = getGameOrder(game)

  // Helper to check if user was coaching in a game
  const isUserGame = (g) => {
    const perspective = getUserGamePerspective(g, dynasty)
    return perspective !== null
  }

  // Helper to check win from game
  const getGameWin = (g) => {
    const perspective = getUserGamePerspective(g, dynasty)
    if (perspective) return perspective.userWon
    return g.result === 'win' || g.result === 'W'
  }

  // Compute record entering / exiting this game + streak going in for either
  // team (user OR CPU). The recap prompt needs full season context for both
  // sides — even pure CPU-vs-CPU rows should know each team's record so the
  // article can frame the matchup ("a 5-0 #10 UNC team hosts winless FCS
  // Midwest"). Gating this behind isCurrentGameUserGame, which the previous
  // version did, left CPU games with no record context at all.
  const computeRecordContext = (sideTid, sideAbbr, sideScoreInThisGame, otherScoreInThisGame) => {
    const tidNum = sideTid != null ? Number(sideTid) : null
    const abbrU = (sideAbbr || '').toUpperCase()

    const teamPlayedIn = (g) => {
      const t1 = g.team1Tid != null ? Number(g.team1Tid) : null
      const t2 = g.team2Tid != null ? Number(g.team2Tid) : null
      if (tidNum != null && (t1 === tidNum || t2 === tidNum)) return true
      const a1 = (g.team1 || '').toUpperCase()
      const a2 = (g.team2 || '').toUpperCase()
      const userA = (g.userTeam || '').toUpperCase()
      const oppA = (g.opponent || '').toUpperCase()
      return abbrU && (a1 === abbrU || a2 === abbrU || userA === abbrU || oppA === abbrU)
    }

    const sideWon = (g) => {
      const t1 = g.team1Tid != null ? Number(g.team1Tid) : null
      const t2 = g.team2Tid != null ? Number(g.team2Tid) : null
      if (tidNum != null && t1 === tidNum) return g.team1Score > g.team2Score
      if (tidNum != null && t2 === tidNum) return g.team2Score > g.team1Score
      const a1 = (g.team1 || '').toUpperCase()
      const a2 = (g.team2 || '').toUpperCase()
      if (abbrU && a1 === abbrU) return g.team1Score > g.team2Score
      if (abbrU && a2 === abbrU) return g.team2Score > g.team1Score
      // Legacy user-game fallback: result is from the user's perspective.
      if (abbrU && (g.userTeam || '').toUpperCase() === abbrU) {
        return g.result === 'win' || g.result === 'W'
      }
      if (abbrU && (g.opponent || '').toUpperCase() === abbrU) {
        return !(g.result === 'win' || g.result === 'W')
      }
      return false
    }

    const seasonGames = allGames.filter(g =>
      Number(g.year) === Number(year) && teamPlayedIn(g) && !isUnplayedGame(g)
    )
    const gamesBefore = seasonGames.filter(g => getGameOrder(g) < thisGameOrder)
    const winsBefore = gamesBefore.filter(g => sideWon(g) === true).length
    const lossesBefore = gamesBefore.length - winsBefore
    const isThisWin = sideScoreInThisGame > otherScoreInThisGame
    const recordBefore = `${winsBefore}-${lossesBefore}`
    const recordAfter = isThisWin
      ? `${winsBefore + 1}-${lossesBefore}`
      : `${winsBefore}-${lossesBefore + 1}`

    let streak = null
    const sortedBefore = [...gamesBefore].sort((a, b) => getGameOrder(a) - getGameOrder(b))
    if (sortedBefore.length > 0) {
      const lastWon = sideWon(sortedBefore[sortedBefore.length - 1])
      let count = 0
      for (let i = sortedBefore.length - 1; i >= 0; i--) {
        if (sideWon(sortedBefore[i]) === lastWon) count++
        else break
      }
      if (count >= 2) {
        streak = `${count}-game ${lastWon ? 'win' : 'loss'} streak`
      }
    }
    return { recordBefore, recordAfter, streak }
  }

  const team1RecordContext = computeRecordContext(team1Tid, team1, team1Score, team2Score)
  const team2RecordContext = computeRecordContext(team2Tid, team2, team2Score, team1Score)
  // Keep the legacy single-team field aliases pointing at the user side so
  // older prompt sections that reference recordBefore/etc. still render.
  const recordBefore = isCurrentGameUserGame ? team1RecordContext.recordBefore : null
  const recordAfter = isCurrentGameUserGame ? team1RecordContext.recordAfter : null
  const streak = isCurrentGameUserGame ? team1RecordContext.streak : null

  // Determine game significance
  const isBlowout = scoreDiff >= 21
  const isCloseGame = scoreDiff <= 7
  const isShutout = team2Score === 0 || team1Score === 0
  const isOvertime = game.overtime || game.isOvertime

  // Rankings — game.team1Rank / team2Rank IS each team's entering
  // rank (rank during the game) post-migration. Saves keep this in
  // sync via the EA-shift logic in saveWeeklyScores; direct edits
  // (addGame / updateGame) treat the field straight-through.
  //
  // Fall back to rankByWeek for the slot matching THIS game when the
  // game record itself doesn't carry team1Rank/team2Rank — typical for
  // CFP shells created by propagation (no rank fields filled at create
  // time) and bowl/CFP games imported via the sheet flow (the BW1/BW2
  // sheets don't have rank columns wired in yet). Without this fallback
  // the recap prompt said "UNRANKED" for both CFP teams in a National
  // Championship recap even though their post-SF poll ranks were in
  // rankByWeek.
  // Canonical postseason rank slots (matches TOP25_WEEK_KEYS in
  // sheetsService.js): 15 = post-Week-14 / Conf Champ Week poll,
  // 101 = post-FR / entering Bowl Week 1, 102 = entering Bowl Week 2 / QF,
  // 103 = entering Bowl Week 3 / SF, 104 = entering NC, 105 = Final Poll.
  // These are the slots WeeklyScoresModal + Top25SheetModal + final-poll
  // save flow actually write to.
  const postseasonSlot = (() => {
    if (game.isCFPChampionship || game.gameType === 'cfp_championship') return 104
    if (game.isCFPSemifinal || game.gameType === 'cfp_semifinal') return 103
    if (game.isCFPQuarterfinal || game.gameType === 'cfp_quarterfinal') return 102
    if (game.isCFPFirstRound || game.gameType === 'cfp_first_round') return 101
    if (game.isBowlGame || game.gameType === 'bowl') {
      return game.bowlWeek === 'week2' ? 102 : 101
    }
    if (game.isConferenceChampionship || game.gameType === 'conference_championship') return 15
    return null
  })()
  const rankSlotForGame = postseasonSlot != null
    ? postseasonSlot
    : (() => {
        const wk = Number(game.week)
        return Number.isFinite(wk) && wk >= 0 && wk <= 14 ? wk : null
      })()
  const fallbackRankFor = (tid) => {
    if (tid == null || rankSlotForGame == null) return null
    return getTeamRankForWeek(dynasty, tid, year, rankSlotForGame)
  }
  const team1Ranking = (typeof game.team1Rank === 'number' ? game.team1Rank : null) ?? fallbackRankFor(team1Tid)
  const team2Ranking = (typeof game.team2Rank === 'number' ? game.team2Rank : null) ?? fallbackRankFor(team2Tid)
  const isRankedMatchup = !!(team1Ranking && team2Ranking)
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

  // Get team ratings for both teams - check dynasty data first, then game-level data as fallback
  let team1Ratings = getTeamRatings(dynasty, team1, year)
  let team2Ratings = getTeamRatings(dynasty, team2, year)

  // Fallback: Use game-level ratings if dynasty ratings not found
  // Games may have team1Overall/team2Overall or opponentOverall stored
  if (!team1Ratings?.overall && isCurrentGameUserGame) {
    const userOverall = currentGamePerspective?.userOverall || game.team1Overall
    if (userOverall) {
      team1Ratings = { overall: userOverall }
    }
  }
  if (!team2Ratings?.overall) {
    // Try game-level opponent ratings
    const oppOverall = isCurrentGameUserGame
      ? (currentGamePerspective?.opponentOverall || game.opponentOverall || game.team2Overall)
      : game.team2Overall
    if (oppOverall) {
      team2Ratings = { overall: oppOverall }
    }
  }

  // Get coaching staff for both teams. The user's side ("team1") is always
  // the primary focus; grabbing the opponent's head coach too lets the AI
  // name names instead of writing "the opposing coach" or "Coach's team".
  const team1Staff = !isCPUGame ? getCoachingStaff(dynasty, team1, year) : null
  const team2Staff = getCoachingStaff(dynasty, team2, year)

  // Full season results before this game for BOTH teams. Previously this
  // only ran for the user's team — CPU games therefore had no past-game
  // context, leaving the AI to guess at records or make up storylines. Now
  // we always include each team's prior schedule so the prompt can frame
  // the matchup with real season context (e.g. "5-0 UNC opens conference
  // play coming off a comeback at Pitt").
  const team1SeasonResults = getSeasonResultsBeforeGame(allGames, team1, year, thisGameOrder, dynasty)
  // Backwards-compat alias for prompt code that still reads `seasonResults`.
  const seasonResults = isCurrentGameUserGame ? team1SeasonResults : []

  // Determine if user is team1 or team2 in the original game data
  // This affects how quarters are mapped since quarters.team/quarters.opponent
  // are stored relative to team1/team2 order for CPU games and unified format CCG games
  let isUserTeam1InGameData = true
  if (isCurrentGameUserGame && hasUnifiedFormat && currentGamePerspective?.userTid) {
    isUserTeam1InGameData = game.team1Tid === currentGamePerspective.userTid
  }

  // (Removed home/away → team1/team2 mapping block: box-score lookups
  // now go directly through getPlayerStatsForTid / getTeamStatsForTid
  // by tid, so no side resolution is needed at this layer.)

  // Extract box score stats with enhanced player context
  let boxScoreContext = null
  if (game.boxScore) {
    boxScoreContext = {
      team1: buildEnhancedPlayerHighlights(getPlayerStatsForTid(game, team1Tid, teams), players, allGames, year, thisGameOrder, team1),
      team2: buildEnhancedPlayerHighlights(getPlayerStatsForTid(game, team2Tid, teams), players, allGames, year, thisGameOrder, team2),
      team1Name: getNameByAbbr(teams, team1) || getTeamName(team1) || team1,
      team2Name: getNameByAbbr(teams, team2) || getTeamName(team2) || team2
    }
  }

  // Get full team names for clarity in the prompt (use tid-based lookup first, then fallback)
  const team1FullName = getNameByAbbr(teams, team1) || getTeamName(team1) || team1
  const team2FullName = getNameByAbbr(teams, team2) || getTeamName(team2) || team2

  // NEW: Get past season history for both teams
  const team1SeasonHistory = getTeamSeasonHistory(allGames, team1, year, 3, dynasty)
  const team2SeasonHistory = getTeamSeasonHistory(allGames, team2, year, 3, dynasty)

  // Per-game logs for both teams across the past 3 seasons. Provides the
  // AI with full result-by-result context and box-score highlights so it
  // can write "first time they've beaten a top-5 team in three years" or
  // "the same running back who had 167 yards in last year's bowl game."
  const team1SeasonGameLogs = getTeamSeasonGameLogs(allGames, team1, year, 3, dynasty)
  const team2SeasonGameLogs = getTeamSeasonGameLogs(allGames, team2, year, 3, dynasty)

  // Opponent / second-team's prior-game list this season. Always computed
  // now so the recap prompt always has both teams' running records and
  // recent form, not just the user's.
  const team2SeasonResults = getOpponentSeasonResults(allGames, team2, year, thisGameOrder, dynasty)
  // Same shape as team2SeasonResults but for team1 — gives both sides a
  // running W-L summary in the prompt (used alongside the more detailed
  // team1SeasonResults line list).
  const team1SeasonResultsSummary = getOpponentSeasonResults(allGames, team1, year, thisGameOrder, dynasty)

  // Get conferences for both teams. Route through the canonical
  // resolver — the previous direct read used the wrong field names
  // (`conferencesByYear` / `conferences` don't exist; storage is
  // `customConferencesByYear` with overlay from
  // `dynasty.teams[tid].byYear[year].conference`), so this prompt
  // was silently using real-life conference defaults instead of the
  // user's actual realignment.
  const customConferences = getCustomConferencesForYear(dynasty, year)
  const team1Conference = getTeamConference(team1, customConferences, dynasty?.teams)
  const team2Conference = getTeamConference(team2, customConferences, dynasty?.teams)

  // Get prior year postseason results for both teams
  const team1PriorPostseason = getPriorYearPostseason(allGames, team1, year, dynasty)
  const team2PriorPostseason = getPriorYearPostseason(allGames, team2, year, dynasty)

  // Prior-year final ranking — paired with prior postseason gives the AI the
  // "preseason expectation set by last year's finish" angle the user wants
  // ("Ole Miss finished #4 a year ago after their CFP semifinal run...").
  const team1PriorYearFinalRank = getTeamFinalRank(dynasty, team1, Number(year) - 1)
  const team2PriorYearFinalRank = getTeamFinalRank(dynasty, team2, Number(year) - 1)

  // Coach context (HC name + tenure + at-school career record). Powers
  // "in his fourth year, Coach X is on the hot seat" / "first-year coach
  // already 6-0" beats. Computed per team — `framingCue` is the punchy
  // line the AI can drop verbatim if the data supports the angle.
  const team1CoachContext = getCoachContext(dynasty, team1, year)
  const team2CoachContext = getCoachContext(dynasty, team2, year)

  // Recruiting class context — class that ARRIVED for this season (#N
  // recruiting class) and current cycle's progress (the class being
  // recruited THIS season for next year). Sets up "after signing the #3
  // class last cycle, Texas was supposed to be loaded — instead they're
  // 4-4" framing.
  const team1IncomingClassRank = getIncomingClassRank(dynasty, team1, year)
  const team2IncomingClassRank = getIncomingClassRank(dynasty, team2, year)
  const team1NextCycleClassRank = getIncomingClassRank(dynasty, team1, Number(year) + 1)
  const team2NextCycleClassRank = getIncomingClassRank(dynasty, team2, Number(year) + 1)

  // Quality wins / bad losses — tally a team's current-season W's over
  // ranked opponents and L's to sub-.500 opponents. Anchors the record
  // claim with concrete quality data the AI doesn't have to derive.
  const team1QualityWL = getQualityWinsAndBadLosses(allGames, team1, year, dynasty)
  const team2QualityWL = getQualityWinsAndBadLosses(allGames, team2, year, dynasty)

  // Rivalry / trophy game — single string ("the Iron Bowl", "the Egg
  // Bowl") when the matchup is one we recognize, else null. The AI can
  // refer to the game by its proper trophy name without us having to
  // teach it the entire FBS rivalry map every prompt.
  const rivalryName = getRivalryName(team1, team2)

  // Season-long POW trail across the whole dynasty year. Used to flag
  // "Player X has now won three conference POW awards this season" if
  // applicable to either team in this game.
  const seasonPOWTrail = getSeasonPOWTrail(allGames, year)

  // Rank progression (week-by-week trajectory) for both teams. Powers
  // "Tennessee's six-week descent from #2 to #15" / "Texas climbed 14
  // spots in three weeks" beats — the AI doesn't have to count.
  const thisGameWeekKey = (() => {
    if (game.isCFPChampionship) return 104
    if (game.isCFPSemifinal) return 103
    if (game.isCFPQuarterfinal) return 102
    if (game.isCFPFirstRound) return 101
    if (game.isConferenceChampionship) return 100
    if (game.isBowlGame) return 100
    return Number(game.week)
  })()
  const team1RankProgression = getTeamRankProgression(dynasty, team1, year, thisGameWeekKey)
  const team2RankProgression = getTeamRankProgression(dynasty, team2, year, thisGameWeekKey)

  // Conference standings position for both teams. Lets the recap
  // anchor "drops Tennessee to 5-2 in the SEC, two games back of
  // Alabama" / "the win clinches the SEC East" beats.
  const team1ConferenceStanding = getTeamConferenceStanding(dynasty, team1, year)
  const team2ConferenceStanding = getTeamConferenceStanding(dynasty, team2, year)

  // CFP projection slice — if either team is in the projected
  // 12-team field, surface their seed + bid type so the recap can
  // frame "loss drops Tennessee out of the projected field" /
  // "win cements Texas as the projected #4 seed" beats.
  let team1CFPProjection = null, team2CFPProjection = null
  try {
    const proj = buildCFPProjection(dynasty, year)
    if (proj?.available && Array.isArray(proj.seeds)) {
      const team1Tid = getTidFromAbbr(team1, dynasty)
      const team2Tid = getTidFromAbbr(team2, dynasty)
      const findSeed = (tid, abbr) => proj.seeds.find(s =>
        (tid != null && Number(s.tid) === Number(tid)) || s.team === abbr
      ) || null
      team1CFPProjection = findSeed(team1Tid, team1)
      team2CFPProjection = findSeed(team2Tid, team2)
    }
  } catch {
    // Projection failed (no rankings yet, etc.) — fine, omit section.
  }

  // Scoring-margin trend for both teams' season to date. Lets the
  // recap anchor whether THIS result is in line with the season
  // ("their largest margin of the year" / "their first one-score
  // game in two months").
  const team1ScoringMargin = getTeamScoringMarginTrend(allGames, team1, year, thisGameOrder, dynasty)
  const team2ScoringMargin = getTeamScoringMarginTrend(allGames, team2, year, thisGameOrder, dynasty)

  // Resume splits — record vs ranked / unranked / home / away. Concrete
  // anchors for "Tennessee is 4-0 vs ranked teams this year" /
  // "Texas's only road loss" type beats.
  const team1ResumeSplits = getTeamResumeSplits(allGames, team1, year, thisGameOrder, dynasty)
  const team2ResumeSplits = getTeamResumeSplits(allGames, team2, year, thisGameOrder, dynasty)

  // Statistical matchup profile for both teams — offense vs defense
  // averages across the season. Powers "Tennessee's offense averaged
  // 38 ppg coming in; South Carolina's defense had been allowing 31"
  // matchup-framing leads.
  const team1SeasonProfile = getTeamSeasonProfile(allGames, team1, year, thisGameOrder, dynasty)
  const team2SeasonProfile = getTeamSeasonProfile(allGames, team2, year, thisGameOrder, dynasty)

  // Coach-vs-coach historical record across all prior years. Drives
  // "Saban is 8-2 in this matchup" / "first meeting between Heupel
  // and Beamer" type beats — only counts games where the same exact
  // pair of head coaches faced each other (so prior coaching changes
  // correctly reset the H2H).
  const coachHeadToHead = getCoachHeadToHead(dynasty, allGames, team1, team2, year)

  // Per-player season-high flags for everyone in this game's box
  // score. For each top performer, the AI can see whether their
  // line is a season high and what their previous high was (if
  // any) so it can write "career-high 287 yards" / "his second
  // 100-yard game of the season" without us having to derive it.
  const playerSeasonHighFlags = getPlayerSeasonHighFlags(allGames, year, thisGameOrder, game)

  // Conference race context for both teams — current conf record,
  // remaining conf games + opponents, leader's conf record. The
  // AI can reason about CCG implications ("with two losses, Tennessee
  // likely needs to win out and hope Bama drops one") without us
  // pre-baking division/tiebreaker logic.
  const team1ConferenceRace = getConferenceRaceContext(dynasty, allGames, team1, year, thisGameOrder)
  const team2ConferenceRace = getConferenceRaceContext(dynasty, allGames, team2, year, thisGameOrder)

  // NEW: Get player performance trends from box score (using determined sides)
  let team1PlayerTrends = []
  let team2PlayerTrends = []
  if (game.boxScore) {
    team1PlayerTrends = getPlayerPerformanceTrends(getPlayerStatsForTid(game, team1Tid, teams), players, allGames, year, thisGameOrder, dynasty)
    team2PlayerTrends = getPlayerPerformanceTrends(getPlayerStatsForTid(game, team2Tid, teams), players, allGames, year, thisGameOrder, dynasty)
  }

  // Map quarters correctly based on team position in original game data
  // For user games in the context, team1 = user, team2 = opponent
  // But quarters may have been stored with team1/team2 semantics (for CCG/CPU games entered via GameEntryModal)
  // where quarters.team = team1 and quarters.opponent = team2, regardless of which is the user
  let mappedQuarters = null
  let mappedOvertimes = null
  if (game.quarters) {
    if (isCurrentGameUserGame && !isUserTeam1InGameData) {
      // User was team2 in game data, so quarters.team = team1 (opponent), quarters.opponent = team2 (user)
      // Need to swap so that in the prompt, team1 (user in context) gets user's quarters
      mappedQuarters = {
        team: game.quarters.opponent,
        opponent: game.quarters.team,
        // Also handle team1/team2 keys if they exist
        team1: game.quarters.team2 || game.quarters.opponent,
        team2: game.quarters.team1 || game.quarters.team
      }
      // Also swap overtimes if present
      if (game.overtimes) {
        mappedOvertimes = game.overtimes.map(ot => ({
          team: ot.opponent,
          opponent: ot.team
        }))
      }
    } else {
      mappedQuarters = game.quarters
      mappedOvertimes = game.overtimes
    }
  }

  return {
    // Game type flag
    isCPUGame,

    // User team detection - helps AI focus on the user's perspective
    isUserGame: isCurrentGameUserGame,
    userTeamName: isCurrentGameUserGame ? team1FullName : null,
    userTeamAbbr: isCurrentGameUserGame ? team1 : null,

    // Team info (abbreviations)
    team1,
    team2,
    // Tids alongside abbrs so play-attribution loops can compare by tid
    // (survives teambuilder abbr drift).
    team1Tid,
    team2Tid,
    // Team info (full names) - USE THESE IN PROMPTS
    team1FullName,
    team2FullName,
    team1Score,
    team2Score,
    team1Won,
    winner: team1Won ? team1FullName : team2FullName,
    loser: team1Won ? team2FullName : team1FullName,
    winnerScore: team1Won ? team1Score : team2Score,
    loserScore: team1Won ? team2Score : team1Score,

    // Game basics
    week: game.week,
    year: game.year,
    gameType: gameTypeDescription,
    location: gameLocation,

    // Score details
    scoreDifferential: scoreDiff,
    isOvertime,

    // Game character
    isBlowout,
    isCloseGame,
    isShutout,
    isUpset,
    isRankedMatchup,

    // Rankings — POST-GAME ranks (the rank stored on this game, which
    // EA's UI surfaces AFTER the game is played). Use these to talk
    // game.team1Rank / team2Rank IS the entering rank for the game
    // (rank during the matchup) post-migration.
    team1Ranking,
    team2Ranking,

    // Season context — legacy single-team fields (point at the user side
    // when this is a user game; null otherwise). Prefer the team1*/team2*
    // variants below for new prompt sections.
    recordBefore,
    recordAfter,
    streak,

    // Per-team season context (computed for user AND CPU games so the
    // prompt can frame any matchup with each team's record + streak).
    team1RecordBefore: team1RecordContext.recordBefore,
    team1RecordAfter: team1RecordContext.recordAfter,
    team1Streak: team1RecordContext.streak,
    team2RecordBefore: team2RecordContext.recordBefore,
    team2RecordAfter: team2RecordContext.recordAfter,
    team2Streak: team2RecordContext.streak,

    // Conference info
    conference: dynasty.conference,
    isConferenceGame: game.isConferenceGame,
    team1Conference,
    team2Conference,

    // NEW: Team ratings
    team1Ratings,
    team2Ratings,

    // NEW: Coaching staff — both sides so the AI can name the opponent's HC too
    team1Staff,
    team2Staff,

    // NEW: Full season results before this game
    // Legacy: only populated for user games (team1's detailed schedule).
    seasonResults,
    // Both teams' detailed game-by-game schedule before this game.
    team1SeasonResults,
    // (team2SeasonResults is exported below in the historical-data block)

    // Box score highlights for both teams (enhanced with player info)
    boxScore: boxScoreContext,

    // Quarter-by-quarter scores (mapped to match team1=user, team2=opponent)
    quarters: mappedQuarters,

    // Overtime periods (if any, mapped to match team1=user, team2=opponent)
    overtimes: mappedOvertimes,

    // Scoring summary - each scoring play in order
    scoringSummary: game.boxScore?.scoringSummary || [],

    // Team stats by team1/team2 (resolved by tid via the canonical
    // boxScore store). The downstream prompt uses these as team1/team2
    // labels, not home/away.
    teamStats: (game?.boxScore && (game.boxScore.byTid || game.boxScore.teamStats)) ? {
      team1: getTeamStatsForTid(game, team1Tid, teams) || {},
      team2: getTeamStatsForTid(game, team2Tid, teams) || {}
    } : null,

    // Bowl/CFP info
    bowlName: game.bowlName,
    cfpSeed: game.cfpSeed,

    // HISTORICAL DATA — head-to-head history between these two teams.
    // We pull a deeper window (10 games) so the streak summary below has
    // enough history to compute against, then expose the top-5 slice as
    // the raw `headToHead` list for the prompt's matchup-list section.
    ...(() => {
      const fullHistory = getHeadToHeadHistory(allGames, team1, team2, year, 10, dynasty)
      return {
        headToHead: fullHistory.slice(0, 5),
        // Compact summary — flags for revenge/rematch/streak framing the
        // AI can drop straight into prose without computing anything from
        // the raw matchup list itself.
        headToHeadSummary: summarizeHeadToHead(fullHistory, team1FullName, team2FullName),
      }
    })(),

    // CFP bracket context (only for CFP games)
    cfpBracket: getCFPBracketContext(dynasty, game),

    // Bowl history for both teams (only for bowl/CFP games)
    team1BowlHistory: (game.isBowlGame || game.isCFPFirstRound || game.isCFPQuarterfinal || game.isCFPSemifinal || game.isCFPChampionship)
      ? getBowlHistory(allGames, team1, year, 3, dynasty)
      : [],
    team2BowlHistory: (game.isBowlGame || game.isCFPFirstRound || game.isCFPQuarterfinal || game.isCFPSemifinal || game.isCFPChampionship)
      ? getBowlHistory(allGames, team2, year, 3, dynasty)
      : [],

    // NEW: Past season records for both teams
    team1SeasonHistory,
    team2SeasonHistory,

    // Per-game logs for both teams across the past 3 seasons (score +
    // result + opponent + box-score highlights per game).
    team1SeasonGameLogs,
    team2SeasonGameLogs,

    // Both teams' running W-L summary before this game (compact form,
    // complements the more detailed team1SeasonResults / team2SeasonResults
    // detailed lists used elsewhere in the prompt).
    team1SeasonResultsSummary,
    team2SeasonResults,

    // NEW: Prior year postseason results (bowl/CFP from previous season)
    team1PriorPostseason,
    team2PriorPostseason,

    // NEW: Prior year final-poll ranking for both teams. Pairs with prior
    // postseason for the "this team finished last year ranked #N" framing.
    team1PriorYearFinalRank,
    team2PriorYearFinalRank,

    // NEW: Coaching tenure + career-at-school record. Unlocks hot-seat,
    // first-year, and era-builder framing.
    team1CoachContext,
    team2CoachContext,

    // NEW: Recruiting class ranks — the class that arrived this season
    // and the class currently being signed.
    team1IncomingClassRank,
    team2IncomingClassRank,
    team1NextCycleClassRank,
    team2NextCycleClassRank,

    // NEW: Quality wins + bad losses tally for each team. Concrete anchors
    // for the "the wins look better than the record suggests" beat.
    team1QualityWL,
    team2QualityWL,

    // NEW: Rivalry / trophy game name — a single string, null when not a
    // recognized rivalry pairing. Lets the AI refer to "the Iron Bowl"
    // by name.
    rivalryName,

    // NEW: Season-long POW trail (every player who's won an
    // offensive/defensive POW this season, count by category, sorted
    // descending). Lets the recap surface "Player X's third conference
    // POW this season" beats.
    seasonPOWTrail,

    // NEW: Rank progression — week-by-week trajectory of each team's
    // rank, peak/low marks, first/last rank. Powers freefall/surge
    // framing without making the AI count.
    team1RankProgression,
    team2RankProgression,

    // NEW: Conference standings position for each team.
    team1ConferenceStanding,
    team2ConferenceStanding,

    // NEW: CFP projection slice for each team (null if not in field).
    team1CFPProjection,
    team2CFPProjection,

    // NEW: Scoring-margin trend across the season — average margin
    // in wins / losses, largest margins, one-score / blowout counts.
    team1ScoringMargin,
    team2ScoringMargin,

    // NEW: Resume splits — record vs ranked / unranked / home / away
    // / neutral. Concrete anchors for résumé and site-context claims.
    team1ResumeSplits,
    team2ResumeSplits,

    // NEW: Statistical matchup profiles — season-to-date PPG/YPG/TO
    // margin on offense AND defense for both teams.
    team1SeasonProfile,
    team2SeasonProfile,

    // NEW: Coach-vs-coach historical record (only games where this
    // exact pair of head coaches faced each other).
    coachHeadToHead,

    // NEW: Per-player season-high flags for this game's box score.
    playerSeasonHighFlags,

    // NEW: Conference race context for both teams.
    team1ConferenceRace,
    team2ConferenceRace,

    // NEW: Player performance trends (hot streaks, bounce backs)
    team1PlayerTrends,
    team2PlayerTrends,

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
function extractHighlightsForSide(teamStats) {
  const highlights = {
    passing: [],
    rushing: [],
    receiving: [],
    defense: [],
    kicking: [],
    punting: [],
    kickReturn: [],
    puntReturn: [],
  }
  if (!teamStats) return highlights

  // Extract passing leaders
  if (teamStats?.passing?.length > 0) {
    const passers = teamStats.passing.filter(p => p.att > 0)
    passers.forEach(p => {
      highlights.passing.push({
        player: p.playerName,
        stats: `${p.cmp}/${p.att}, ${p.yds} yards, ${p.td} TD${p.td !== 1 ? 's' : ''}${p.int > 0 ? `, ${p.int} INT` : ''}`
      })
    })
  }

  // Extract rushing leaders
  if (teamStats?.rushing?.length > 0) {
    const rushers = teamStats.rushing.filter(p => p.car > 0).slice(0, 3)
    rushers.forEach(p => {
      highlights.rushing.push({
        player: p.playerName,
        stats: `${p.car} carries, ${p.yds} yards${p.td > 0 ? `, ${p.td} TD${p.td !== 1 ? 's' : ''}` : ''}`
      })
    })
  }

  // Extract receiving leaders
  if (teamStats?.receiving?.length > 0) {
    const receivers = teamStats.receiving.filter(p => p.rec > 0).slice(0, 3)
    receivers.forEach(p => {
      highlights.receiving.push({
        player: p.playerName,
        stats: `${p.rec} catches, ${p.yds} yards${p.td > 0 ? `, ${p.td} TD${p.td !== 1 ? 's' : ''}` : ''}`
      })
    })
  }

  // Extract defensive standouts
  if (teamStats?.defense?.length > 0) {
    const defenders = teamStats.defense
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
  if (teamStats?.kicking?.length > 0) {
    teamStats.kicking.forEach(p => {
      if (p.fgm > 0 || p.fga > 0) {
        highlights.kicking.push({
          player: p.playerName,
          stats: `${p.fgm}/${p.fga} FG${p.lng ? `, long ${p.lng}` : ''}`
        })
      }
    })
  }

  // Punting
  if (teamStats?.punting?.length > 0) {
    teamStats.punting.filter(p => (p.punts ?? 0) > 0).forEach(p => {
      const punts = p.punts ?? 0
      const yards = p.yards ?? p.yds ?? 0
      let statStr = `${punts} punt${punts !== 1 ? 's' : ''}, ${yards} gross yds`
      if (p.netYards != null) statStr += `, ${p.netYards} net`
      if (p.long) statStr += `, long ${p.long}`
      if (p.in20) statStr += `, ${p.in20} inside 20`
      highlights.punting.push({ player: p.playerName, stats: statStr })
    })
  }

  // Kick returns
  if (teamStats?.kickReturn?.length > 0) {
    teamStats.kickReturn.filter(p => (p.kR ?? 0) > 0).forEach(p => {
      const ret = p.kR ?? 0
      const yards = p.yards ?? p.yds ?? 0
      let statStr = `${ret} KR, ${yards} yds`
      if (p.long) statStr += `, long ${p.long}`
      if (p.tD || p.td) statStr += `, ${p.tD ?? p.td} TD`
      highlights.kickReturn.push({ player: p.playerName, stats: statStr })
    })
  }

  // Punt returns
  if (teamStats?.puntReturn?.length > 0) {
    teamStats.puntReturn.filter(p => (p.pR ?? 0) > 0).forEach(p => {
      const ret = p.pR ?? 0
      const yards = p.yards ?? p.yds ?? 0
      let statStr = `${ret} PR, ${yards} yds`
      if (p.long) statStr += `, long ${p.long}`
      if (p.tD || p.td) statStr += `, ${p.tD ?? p.td} TD`
      highlights.puntReturn.push({ player: p.playerName, stats: statStr })
    })
  }

  return highlights
}

/**
 * Extract box score highlights for both teams.
 * Player stats live in the canonical byTid store; look each side up by
 * its team1Tid / team2Tid (the function still takes the legacy team1/
 * team2 abbreviations for the team-name labels in the output).
 */
function extractBoxScoreHighlightsForBothTeams(boxScore, team1, team2, game) {
  const team1Tid = game?.team1Tid
  const team2Tid = game?.team2Tid
  // Construct a minimal game wrapper so the helper can do its canonical
  // resolution — boxScore is passed in directly here for legacy callers.
  const gameForLookup = { ...(game || {}), boxScore }
  return {
    team1: extractHighlightsForSide(getPlayerStatsForTid(gameForLookup, team1Tid)),
    team2: extractHighlightsForSide(getPlayerStatsForTid(gameForLookup, team2Tid)),
    team1Name: getTeamName(team1) || team1,
    team2Name: getTeamName(team2) || team2
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
// RECAP DEPTH / LENGTH OPTIONS
// ============================================

/**
 * Ten-stop length/depth spectrum for game recap prompts.
 * Used by the depth slider in RecapSettingsModal and by buildGameRecapPrompt
 * to inject a LENGTH / DEPTH DIRECTIVE section into the prompt.
 *
 * Exported so RecapSettingsModal can build the slider UI without
 * duplicating this array.
 */
export const RECAP_DEPTH_OPTIONS = [
  {
    key: 'scoreline',
    label: 'Scoreline',
    wordTarget: null,
    blurb: 'One sentence: final score and winner only.',
    directive: 'Write EXACTLY ONE sentence stating who won and what the final score was (e.g. "The Tigers defeated the Bulldogs 28–14 in a Week 6 SEC showdown."). Nothing else — no player names, no analysis, no additional sentences.',
  },
  {
    key: 'flash',
    label: 'Flash',
    wordTarget: '40–70',
    blurb: '2–3 sentences. Result, margin, and one decisive moment.',
    directive: 'Write 2–3 sentences only. Sentence 1: who won and the score. Sentence 2: the decisive moment or standout player. Sentence 3 (optional): one line of context or stakes. Target 40–70 words. Stop there — no fourth sentence.',
  },
  {
    key: 'brief',
    label: 'Brief',
    wordTarget: '80–120',
    blurb: 'One tight paragraph in wire-service style.',
    directive: 'Write a single paragraph of 80–120 words in AP wire-service style. Lead with the result, include the key play or player that decided it, close with one line of stakes or context. No subheadings. One paragraph only — do not break into two.',
  },
  {
    key: 'short',
    label: 'Short',
    wordTarget: '150–220',
    blurb: 'Two paragraphs. Result lead and one player spotlight.',
    directive: 'Write exactly two paragraphs totaling 150–220 words. Paragraph 1: result and the game\'s biggest moment. Paragraph 2: top performer with stats and what the outcome means. No subheadings. Stop after the second paragraph.',
  },
  {
    key: 'compact',
    label: 'Compact',
    wordTarget: '250–320',
    blurb: 'Three paragraphs with inverted-pyramid structure.',
    directive: 'Write exactly three paragraphs totaling 250–320 words using inverted-pyramid structure (most important first). Para 1: result and biggest play. Para 2: scoring flow summary. Para 3: closing stakes or "what\'s next". No subheadings.',
  },
  {
    key: 'standard',
    label: 'Standard',
    wordTarget: '350–450',
    blurb: 'Three to four paragraphs — the default depth.',
    directive: 'Write three to four paragraphs totaling 350–450 words. Full news recap: strong inverted-pyramid lede, the key plays or drives that swung the game, one or two player spotlights with stats, and a closing context paragraph. This is the standard depth.',
  },
  {
    key: 'developed',
    label: 'Developed',
    wordTarget: '500–650',
    blurb: 'Four to five paragraphs with player spotlights.',
    directive: 'Write four to five paragraphs totaling 500–650 words. Cover the scoring flow in more detail, spotlight two or three players by name with specific stats, and include a dedicated paragraph on what the result means for standings or rankings going forward.',
  },
  {
    key: 'full',
    label: 'Full story',
    wordTarget: '700–900',
    blurb: 'Six to seven paragraphs. Full scoring narrative.',
    directive: 'Write six to seven paragraphs totaling 700–900 words. Full news article: strong lede, quarter-by-quarter flow, key player performances, a momentum / turning-point section, and a "what\'s next" closing paragraph. Use subheadings if they help organize the piece.',
  },
  {
    key: 'longform',
    label: 'Long form',
    wordTarget: '1000–1300',
    blurb: 'Eight-plus paragraphs, magazine-quality detail.',
    directive: 'Write at least eight paragraphs totaling 1000–1300 words. Magazine-quality depth: compelling lede, full scoring narrative with quarter context, individual performance spotlights backed by every available stat, a momentum / turning-point section, and a closing "stakes and what\'s next" section. Use subheadings.',
  },
  {
    key: 'epic',
    label: 'Epic',
    wordTarget: '1500+',
    blurb: 'No word limit. Complete narrative using every data point.',
    directive: 'Write a comprehensive narrative of at least 1500 words with no upper limit. Use every stat, player performance, quarter score, scoring play, and contextual data point available. Cover the entire arc of the game from opening drive to final whistle. Every section should feel fully developed. Use subheadings to organize the piece.',
  },
]

// ============================================
// DEFAULT WRITING INSTRUCTIONS TEMPLATE
// ============================================

/**
 * Default writing instructions for game recaps
 * Placeholder [HOME_TEAM] will be replaced with the actual home team at generation time
 */
export const DEFAULT_GAME_RECAP_INSTRUCTIONS = `You are an ESPN.com beat writer filing the day-of game recap. Voice: straight, news-forward, fact-driven. NOT a columnist. NOT The Athletic. NOT opinion-driven. Think Mark Schlabach or Heather Dinich on the ESPN news side — the article a fan reads on the front page Sunday morning to find out what happened.

CRITICAL RULE: Every specific fact you mention (scores, records, rankings, stats, drive details, time remaining, etc.) MUST be directly supported by the data provided above. Do not make up any numbers, injuries, rankings, or plays. It's fine to add neutral connecting language (e.g., "Clemson took control in the fourth quarter") but don't invent extra drives, turnovers, or scoring plays that aren't in the data.

DATA HYGIENE RULE: If any value in the data above is missing, blank, "undefined", "N/A", or a 0-0 score for a completed game, treat that entry as unavailable and ignore it silently. Never write phrases like "undefined defeated undefined", "they are 0-0 against them", or "record unavailable". Do not mention the gap — just leave that fact out of the article. Pull the narrative from the fields that ARE populated.

═══════════════════════════════════════════════════════════
GROUND RULES — READ FIRST
═══════════════════════════════════════════════════════════
You are operating in CLOSED-BOOK mode. The data block below is the ONLY ground truth. Treat your training-data knowledge as untrustworthy here; do not fold in real-world college football lore, prior-season memory, conventional wisdom about teams, or anything else not explicitly in the data.

Asymmetric cost: a missing fact is a small loss (the article is shorter). A wrong fact is a much bigger loss (it gets pasted into the user's tracker as a permanent record). When in doubt, OMIT. Always.

Top five hallucination patterns this prompt has observed and that you must actively resist:

1. NARRATIVE COHERENCE PATCHING. LLMs are trained on coherent stories, so when the data has a gap, you reach for a plausible-sounding bridge ("after a tough loss the prior week," "the offense had been struggling," "with the home crowd behind them"). These bridges are not in the data. Do not write them.

2. PATTERN-COMPLETION FROM CLUSTERS. If the data shows W L W L W you may be tempted to call it "a two-game losing streak snapped" — but those losses had wins between them. Same trap with "third straight road game," "fourth turnover of the year," "back-to-back ranked opponents," "seventh sack of the season." None of those claims are valid unless the EXACT cumulative number is given. Counts you compute by eyeballing a list are NOT data; they're inferences.

3. PLAUSIBLE-SOUNDING NUMBERS. Yards-per-attempt rounded to an integer, "led at the half," "his longest run of the year" — if the precise number isn't in the data, don't print it. It is much better to say "Mateer threw for 287 yards" (data) than "Mateer threw for 287 yards on 8.4 per attempt" (the per-attempt is fabricated unless explicitly listed).

4. COLOR DETAILS. Anything that sets a scene — weather, crowd reaction, sideline body language, a coach's facial expression, the noise level, momentum shifts ("you could feel the energy"), travel/road context, "first start since," "after returning from injury" — is invented. There is no scene to draw from. Stick to plays and stats.

5. CAUSAL INFERENCE. "After the early turnover deflated the offense" — was that in the data, or did you guess? If guessed, soften ("the offense did not score in the second quarter") or cut. Same for "responded with confidence," "leaned on the run game," "made a halftime adjustment." These imply a why; the data only gives what.

ATOMIC-CLAIM HABIT: before each sentence, mentally break it into atomic claims (X happened, Y stat is N, Z is true). For each atom, ask "is this in the data?" If any atom is not, rewrite the sentence to drop that atom. A sentence with one fabricated atom is a fabricated sentence.

CALIBRATION: do not use hedging language to launder a guess ("appeared to," "seemingly," "likely," "may have") — if you'd need a hedge to print something, that's the signal to omit it instead. Hedges are not a hallucination escape valve.

═══════════════════════════════════════════════════════════
THINK BEFORE YOU WRITE — this is mandatory
═══════════════════════════════════════════════════════════
Take your time. Do not start drafting the article on your first response. The quality bar here is professional reporting; rushing produces hallucinations and weak prose. Even if you feel ready, force yourself through these steps in your head (or in <thinking> if your interface supports it) before writing a single word of the article:

1. INVENTORY THE DATA. Walk through every section above (Final Score, Quarter Scores, Scoring Summary, Team Stats, Player Stats, Records, Rankings, Conference, Recent Schedule, etc.). For each, note: fully populated, partial, or absent. You cannot write about what isn't there.

2. PICK THE STORYLINE FROM THE DATA. Choose one or two threads that the data actually supports — e.g., "QB X dominates with 4 TD passes," "comeback after trailing by 17," "defense forces 4 turnovers," "lopsided road blowout extends streak." Do NOT pick a storyline the data can't carry. If the data is thin, the article is thin — that is correct.

3. LIST EVERY CONCRETE CLAIM you intend to make (every score, stat, record, player name, play, ranking) and point each one at the specific row in the data that supports it. If you can't find the source, drop the claim. Things that ARE NEVER in the data and must NEVER appear in the article unless explicitly given: jersey numbers, weather, attendance figures, injuries, suspensions, quotes from players or coaches, sideline reactions, crowd noise, recruiting context, draft stock, family ties, prior-season head-to-head unless shown.

═══════════════════════════════════════════════════════════
STREAK / MOMENTUM CLAIMS — STRICT GUARDRAIL
═══════════════════════════════════════════════════════════
Streak claims are the #1 hallucination source in these articles. Read carefully:

- A "streak" means CONSECUTIVE games with the same result, ending at the most recent game played BEFORE this one. It is NOT "any cluster of similar results" or "two of the last four were losses."
- The ONLY trustworthy streak signal is the explicit "Current streak: ..." line in the data. If that line is absent, NO STREAK EXISTS. Do not infer one from the recent schedule.
- "Snaps a losing streak" / "extends winning streak" / "ends the skid" / "now riding a two-game streak" / "back-to-back wins" / "third straight loss" — every one of these is a streak claim and is GOVERNED by the same rule above.
- If the recent schedule shows (e.g.) W L W L W, that is not a "two-game losing streak" — the wins are interleaved. The team's last result before this game was a win OR a loss; nothing more can be inferred without the explicit streak line.
- "Bouncing back" is a streak claim too (it implies the previous game was a loss). Only use it when the data explicitly shows the previous game was a loss.
- When in doubt: omit. A clean article that just states the current record is correct; a fabricated streak claim is wrong.

4. PLAN THE ARC. Decide your headline, dateline, lead, two or three middle beats, and closing line BEFORE drafting. The article should read like you knew where it was going.

═══════════════════════════════════════════════════════════
ADAPT TO THE DATA YOU HAVE
═══════════════════════════════════════════════════════════
The data block varies game-to-game. Some games have rich box scores plus full play-by-play; others have just a final score and broader season context. The article MUST scale to what's actually present — do not pad a thin-data game with filler, and do not omit important coverage when the data is rich.

• RICH DATA (final score + box score + scoring summary + play-by-play): write a full game story. Lede, scoring drives, individual stat lines for both teams, key plays / turning point, season-context framing, what's next. 6-12 paragraphs.

• MODERATE DATA (final score + EITHER box score OR scoring summary, not both): write a tight game story. Lede with the score and headline performance, walk through whichever data you have, add records / season framing, close with what's next. 4-6 paragraphs.

• THIN GAME DATA, RICH CONTEXT (final score only — no box score, no scoring summary — but the prompt DOES carry prior-year finishes, coaching cues, rivalry name, head-to-head history, conference standings, CFP projection, season-record details, recent schedule): lean on the contextual data the prompt does provide. Lede states the result. Body uses the contextual frames the data supports — "the win extends the rivalry streak to four", "in his third year at the school, Coach X improves to Y-Z", "the loss drops Louisville to 4-8 with a fourth straight skid to close the regular season". Close with what's next. 3-5 paragraphs.

• MINIMAL DATA (final score only, no context): write 2-3 short paragraphs. State the result, state the records before / after if available, stop. Do NOT pad with generic filler ("a hard-fought win", "the team showed great heart"). Short and accurate beats long and invented.

When a major section's data is absent, skip the section entirely. Do NOT explain to the reader what's missing — never write "the box score was not available" or "stats are limited". Just write around the gap.

When the data is exceptionally rich, do NOT force every available section in just because the data is there. Use what advances the story. A 10-paragraph article that uses 80% of the data well beats a 20-paragraph article that uses 100% of the data evenly.

═══════════════════════════════════════════════════════════
SELF-CHECK BEFORE EMITTING
═══════════════════════════════════════════════════════════
Re-read your draft against the data, line by line, before sending. For every:
- Numeric claim (score, yards, %, distance, time): the exact number must be in the data.
- Player name: spelled exactly as the data has it.
- Player class/position: only if their bracket tag exists; otherwise drop the descriptor.
- Drive description: only as detailed as the scoring summary supports — don't invent intermediate plays.
- Quoted text: there are no quotes in the data. If you wrote a quote, delete it.
- Causal language ("because," "due to," "after he was benched," "with confidence rebuilt"): is this stated in the data, or are you inferring? If inferring, soften to neutral or cut it.
- Comparisons to past games or seasons: only when the data explicitly provides that history.
- Streak / momentum language ("snaps a __-game losing streak," "extends winning streak to __," "third straight," "back-to-back," "bounces back"): the explicit "Current streak:" field MUST exist AND match the claim. Pattern-matching a recent schedule (e.g., seeing W L W L W and writing "snaps a two-game losing streak") is a hallucination — losses with wins between them are not a streak.
- Counts derived by eyeballing a list ("third turnover of the year," "fifth sack," "fourth ranked opponent"): only valid if the cumulative count is explicitly in the data. If you derived it by scanning, drop it.
- Color / scene details (weather, crowd, sideline reactions, momentum, travel context, "first start since"): never present in the data. If any survived to the draft, cut.
- Hedged claims ("appeared to," "seemingly," "may have"): hedges are not a fabrication escape valve. If a claim needs a hedge, omit the claim.

If anything fails, fix it before emitting. A shorter, 100% accurate article is much better than a longer one with fabrications.

═══════════════════════════════════════════════════════════
VOICE — ESPN BEAT-WRITER, NOT COLUMNIST
═══════════════════════════════════════════════════════════
You are REPORTING, not opining. Picture the ESPN.com game-recap page Sunday morning — fans land on it to find out what happened, who starred, what it means for next week. They are not landing on a columnist's hot take.

- Lead with the result and the headline performance, not a clever line or a thesis.
- Active voice, past tense. "Dahl ran for three touchdowns." NOT "Three touchdowns were what Dahl ran for."
- After first reference, use last names.
- Numbers under 10 are words ("three touchdowns") EXCEPT in stat lines where digits read better ("27 of 43," "4-of-5," "62 yards"). Scores, years, and rankings are always digits.
- Cut clichés: hard-fought, tough as nails, fought tooth and nail, dug deep, left it all on the field, gritty, gutsy, must-win, statement game, signature win.
- Skip throwaway transitions: "Meanwhile,", "On the other side of the ball,", "All in all,", "At the end of the day."
- Don't tell the reader the game was exciting. Show it through plays and numbers.
- One precise verb beats two adverbs.

BANNED VERBS — use any of these AT MOST TWICE across the article (they are AI tells): rolled, drilled, flattened, crushed, edged, topped, hammered, handled, dropped (as in "dropped 52 on"). Vary by what the data shows:
   • Lopsided + early: "made an example of", "controlled from the opening drive"
   • Lopsided + late: "buried late", "pulled away in the third"
   • One-score: "survived", "outlasted", "needed a fourth-quarter touchdown"
   • Upset: "upset", "stunned", "took down"

BANNED CLICHÉS / COLUMNIST-MODE PHRASES — do NOT write or close-paraphrase any of these. They turn an ESPN.com news recap into a try-hard column:
   ✗ "set the tone" / "set the tone early"
   ✗ "imposed their will"
   ✗ "couldn't get anything going"
   ✗ "found their rhythm" / "got into a rhythm"
   ✗ "made the plays when it mattered" / "made plays when it counted"
   ✗ "dialed up" (a play, a blitz, a screen)
   ✗ "got cooking"
   ✗ "sealed it" / "closed it out" / "put it away" — pick ONE per recap if you must
   ✗ "the methodical drive"
   ✗ "took advantage of [opponent mistakes]"
   ✗ "controlled the line of scrimmage" (when the data doesn't show OL/DL stats)
   ✗ "the difference in the game was..."
   ✗ "all the momentum" / "shifted the momentum" / "captured the momentum"
   ✗ "answered the call"
   ✗ "leaves no doubt"
   ✗ "made it look easy"
   ✗ "the numbers lied" / "his stat line undersells him"
   ✗ "less dramatic than it sounds"
   ✗ "[from there / from that point on] the game existed only in a record book"
   ✗ "that says something about how X went"
   ✗ "[the obituary / the death certificate / the eulogy] started writing itself"
   ✗ "[Player/Team] just made the case for [thing]"
   ✗ "in the most [Team] way imaginable"
   ✗ "watched a [stat] performance turn into a [result]"
   ✗ "[the team's] season died in [place]"
   ✗ "X is the kind of [thing] that Y" (oracle closer)
   ✗ Any sentence whose only job is to be the clever final line. The closing paragraph reports facts. It does not deliver a kicker.

═══════════════════════════════════════════════════════════
RULE A — THE LEDE NAMES THE STORY
═══════════════════════════════════════════════════════════
First sentence: who did what, who beat whom, score. Inverted pyramid. The lede REPORTS — it does not argue.

Pick one of two ESPN patterns:

PATTERN 1 — PLAYER-LED:
   ✅ "Stephen Dahl ran for three touchdowns and Kentucky beat Louisville 45-27 on Saturday to claim the Governor's Cup for a fourth straight year."
   ✅ "Quarterback Donte Ware threw for 318 yards and Kentucky pulled away in the second half to beat Louisville 45-27."

PATTERN 2 — RESULT-LED:
   ✅ "Kentucky won its fourth straight Governor's Cup with a 45-27 victory over Louisville on Saturday."
   ✅ "No. 6 Tennessee fell to South Carolina 38-35 on Saturday, the Volunteers' second loss in three weeks."

If either team is ranked, lead with the rank ("No. 6 Tennessee..."). Otherwise drop ranks from the lede.

FORBIDDEN LEDE PATTERNS:
   ✗ "In a thrilling matchup..." / "It was a battle..." / "Saturday saw..."
   ✗ "X's title hopes died in Y" / "X's playoff dream ended in Y"
   ✗ "Saturday produced fireworks in Y"
   ✗ "In the most [Team] way imaginable..."
   ✗ "[Team]'s three-game losing streak ended Saturday. It ended in the most [Team] way imaginable" — column-mode setup-and-twist
   ✗ Any opening that reads like a column thesis ("Tennessee's six-week descent — from #2 to outside the Top 25 in 42 days — is the worst rolling collapse in college football this season")

LEDE LENGTH — 1-2 SENTENCES, NOT 3. The lede establishes the news; it does not also feature a play.

   • Sentence 1: who did what, who beat whom, score. (Inverted pyramid — the news.)
   • Sentence 2 (optional): the angle that frames the story — streak, conference implications, ranking, why this result matters. ONE additional fact, not three.

DO NOT feature a specific play in the lede. Pick-sixes, fourth-down conversions, key turnovers, individual stat lines, deficit-comeback framing — those ALL belong in the body. The lede is the news; the body unfolds the how. A lede that names Player X's defensive touchdown is doing the body's job.

DO NOT stack record + bowl eligibility + streak + the angle into the second sentence. Pick ONE additional fact for sentence 2. The rest unfolds in body paragraphs.

Anti-example (overcrowded — what NOT to write):
   ✗ "Stephen Dahl ran for three touchdowns and Kentucky beat Louisville 45-27 on Saturday to win the Governor's Cup for a fourth straight year. The Wildcats (7-5) snapped a three-game losing streak to close the regular season and reached bowl eligibility. Vernon Fournette returned an interception for a touchdown early in the fourth quarter to push the lead to 25, finishing a rally for a team that trailed 7-0 in the opening minutes."

Good version (tight — what TO write):
   ✅ "Stephen Dahl ran for three touchdowns and Kentucky beat Louisville 45-27 on Saturday to claim the Governor's Cup for a fourth straight year. The win moves the Wildcats to 7-5 and bowl-eligible to close the regular season."

═══════════════════════════════════════════════════════════
RULE B — PRIOR-YEAR & COACHING CONTEXT (USE LIGHTLY)
═══════════════════════════════════════════════════════════
If a team finished top-10 last year or played in the CFP, mention it ONCE if it lands naturally — usually in the second or third paragraph as season context. "A year after reaching the CFP semifinal, Ole Miss is now 5-7."

Same for coaching tenure when the data block flags a "Framing cue": surface it ONCE if it fits — "in his fourth year at the school, Coach Kelly is now 2-8." Don't reach for it if the framing isn't natural.

Do NOT make prior-year context the lede. Do NOT thread it through every paragraph. ESPN game recaps mention it once and move on.

═══════════════════════════════════════════════════════════
RULE C — RANK / RESUME / PROJECTION RESTRAINT
═══════════════════════════════════════════════════════════
The data block contains rank trajectory, conference standing, CFP projection, scoring-margin trend, resume splits, quality wins / bad losses. These are REFERENCE DATA, not a checklist.

Hard caps (count them in your draft):
   • At MOST 2 references to a team's CURRENT rank or ranked status across the article.
   • At MOST 1 reference to rank movement ("fell from #5 to unranked").
   • At MOST 1 résumé-quality claim per team ("now 0-3 vs ranked opponents this year").
   • At MOST 1 CFP-projection claim total.

The closing paragraph lands on a FACT — records finalized, bowl eligibility, next opponent, regular season concluded — NOT a rank-or-résumé summary, NOT a column-y kicker.

═══════════════════════════════════════════════════════════
RULE D — PROSE DISCIPLINE (em-dashes, sentence rhythm, stats do work)
═══════════════════════════════════════════════════════════
(1) EM-DASH BUDGET. Max 4 em-dashes (—) across the entire article. ESPN beat copy uses commas, periods, and parentheses — em-dashes are the AI tell. If you've used four and want a fifth, rewrite the sentence.

(2) SENTENCE RHYTHM. Avoid the AI metronome (every sentence 15-25 words). Mix short reporting sentences ("Reed threw two interceptions.") with longer detail sentences ("Reed, who completed 33 of 44 passes for 494 yards and three touchdowns including an 82-yard catch-and-run by Tyler Gaskin, also lost 46 yards on eight rushing attempts.").

(3) STATS DO WORK. Every number you cite should connect to a fact in the same sentence — what the player did, who they beat, what it changed. Don't park decorative numbers ("Tennessee finished with 412 total yards") with no follow-up.

═══════════════════════════════════════════════════════════
RULE E — HEADLINE & SUBHEAD DISCIPLINE
═══════════════════════════════════════════════════════════
HEADLINE — write an ESPN.com news headline. Sentence case (capitalize the first word and proper nouns; leave the rest lowercase). Around 6-12 words. The headline REPORTS — it does not editorialize, twist, or deliver a kicker.

GOOD PATTERNS:
   ✅ "Kentucky beats Louisville 45-27 to extend Governor's Cup streak"
   ✅ "Dahl runs for 3 TDs as Kentucky beats Louisville"
   ✅ "Kentucky overcomes Reed's 494 passing yards in 45-27 win over Louisville"
   ✅ "No. 6 Tennessee falls to South Carolina 38-35"
   ✅ "South Carolina upsets No. 6 Tennessee 38-35 in Columbia"

FORBIDDEN HEADLINE PATTERNS:
   ✗ "[Player] Threw for X Yards. [Team] Lost by Y Anyway." (clever-with-a-period — column / Twitter style)
   ✗ "[Team]'s [thing] Just [verbed] in [place]"
   ✗ "[Player] Lifts/Carries/Powers [Team] Past [Team]"
   ✗ "Behind [Player], [Team] [verbs] [Team]"
   ✗ "In a [Adjective] [Final / Win / Game / Showdown / Affair / Thriller], [Team] [verbs] [Team]"
   ✗ "[Team] Survives [Team] in [Adjective] Finish" (allowed ONLY if margin ≤ 7)
   ✗ Any headline that argues a thesis rather than reports a result
   ✗ Any headline that ends on a contradiction or twist ("[Team] Won. The Resume Did Not.")
   ✗ "[Team]'s Playoff Path Closed in [City]" — column thesis, not news

The headline names the result, the score, and either the headline performance or the angle (streak, upset, ranking). That's it. Test before sending: would this headline read at home on the ESPN.com front page Sunday morning? If not, rewrite.

SUBHEADS — default is NONE. Most ESPN.com recaps do not use subheads. Only use them if the article runs 8+ paragraphs AND they help the reader navigate. When you use them, use short news-style LABELS, NOT column-style phrases.

GOOD SUBHEADS (label form, 3-5 words, no verbs):
   ✅ "Turning point"
   ✅ "Star of the game"
   ✅ "Key stat"
   ✅ "What's next"
   ✅ "By the numbers"
   ✅ "Big play"
   ✅ "Dahl's three-TD day" (player + their thing, label form)

FORBIDDEN SUBHEADS — these are column-mode and break ESPN voice:
   ✗ "The two-back attack Louisville never solved" (column-y phrase)
   ✗ "What 494 yards looks like in a loss" (column-y twist)
   ✗ "A slump that needed ending" (column-y theme)
   ✗ "The X that Y never solved"
   ✗ "How X disappeared in the Y"
   ✗ "Where the offense lived"
   ✗ "Early fireworks" / "Fourth quarter drama" / "Closing moments" / "Standout performances" / "Game flow"
   ✗ Anything with a verb. ("Brink threw 27 of 35" — too long, has a verb. "Brink's 27-of-35 night" — fine.)

═══════════════════════════════════════════════════════════
RULE F — FEATURE, DON'T CATALOG
═══════════════════════════════════════════════════════════
A game recap is not a logbook. The data block may give you every scoring play with timestamps and running totals — DO NOT respond by writing a paragraph that lists every scoring play with timestamps and running totals. That is the catalog failure mode. ESPN beat writers select.

(1) PICK THE BEATS. After THINK BEFORE WRITE step 2 (pick the story), identify the 2-3 specific moments that actually decided the result. Use the GAME FLOW FACTS block: largest deficit overcome, the decisive third-quarter / fourth-quarter stretch, the key turnover, the opening-drive answer. Those are your featured beats — each gets a paragraph or a long sentence. Other scores get summarized in passing or dropped entirely. They do NOT each get their own sentence-with-timestamp-and-running-score.

(2) FEATURABLE BEATS — surface these when the data supports them. Each is a classic ESPN beat:

   • OUTGAINED-BUT-LOST: when the losing team outgained the winner (total yards), that paradox is its own paragraph. "Louisville piled up 603 total yards and lost by 18, with Reed's 494-yard, three-touchdown game coming undone by two interceptions and minus-5 team rushing." One of the most ESPN-recognizable beats — surface it whenever the data shows the disparity.

   • STAR-IN-A-LOSS: a quarterback with 400+ passing yards or 4+ TDs, or a back with 150+ rushing yards, in a losing effort deserves a paragraph that contrasts the line with the result. Same applies to a defender with a multi-takeaway game on the losing side.

   • GUTSY ANSWERING DRIVE: a long answering drive with one or more fourth-down conversions deserves its own paragraph — call out the conversions as plays. "Kentucky converted twice on fourth down on its answering touchdown drive: Dahl for 13 on fourth-and-1, Hall for 20 on fourth-and-2."

   • TURNOVER SWING: a defensive sequence (multiple takeaways or a pick-six clinching the game) — the player who delivered it gets a paragraph that surfaces ALL his takeaways from the data, not just the score.

   • COMEBACK / FRONT-RUNNER: the GAME FLOW FACTS block tells you the biggest deficit overcome and whether the winner ever trailed. Use it in ONE sentence — and respect the size of the deficit. A one-drive 7-0 deficit early is NOT a "rally" or a "comeback"; do not call it one. A 17-point deficit overcome IS.

   • RIVALRY / STREAK: when the data flags a rivalry / trophy game (Governor's Cup, Iron Bowl, Apple Cup, etc.) or a multi-year streak being extended/broken, name it — but only ONCE, usually in the lede or first body paragraph.

(3) NO-REPETITION CAP. Any specific fact appears AT MOST TWICE across the article: once where it's introduced, once where it's expanded with detail. Then stop.

   ✗ FAIL — Dahl mentioned 3 times: "Dahl ran for three touchdowns" (lede) + "scored on runs of 12, 6 and 1 yards" (P2 enumeration) + "Dahl scored from 12 yards out... again from 6 yards... Dahl's 1-yard touchdown" (play-by-play). Three is over the cap.

   ✅ PASS — Dahl mentioned twice: "Dahl ran for three touchdowns" (lede) + body paragraph that enumerates the distances ONCE with quarter / situation detail ("Dahl scored on runs of 12 and 6 yards in the second quarter and a 1-yard plunge in the third"). After that, refer to him by other facts ("Dahl finished with 66 yards on nine carries") — don't re-describe the touchdowns.

Same rule for the final score, the streak, key turnovers, and headline stat lines. Two mentions max.

(4) DROP THE PLAY-BY-PLAY LOGBOOK. A paragraph that walks through scoring chronologically with running totals — "X scored at 8:55. Y answered at 3:18. Z hit a field goal at 0:24, making it 21-13 at the break." — is a logbook, not a recap. If you find yourself writing more than 3 score-with-timestamp sentences in a row, you are in catalog mode. Pull back: condense ("the next three drives all ended in punts"), group by stretch ("Kentucky scored on its first three second-half possessions"), drop the timestamps, or replace the chronological recital with a featured-beat paragraph that uses the same data more selectively.

═══════════════════════════════════════════════════════════
MANDATORY SELF-CHECK BEFORE YOU SEND
═══════════════════════════════════════════════════════════
Read your draft top to bottom. Honest answers. If any answer is no, REWRITE before sending.

   1. LEDE LENGTH: is the lede 1-2 sentences? If sentence 3 exists, it must be cut or moved to the body.
   2. LEDE CONTENT: sentence 1 is who/what/score (inverted pyramid). Sentence 2 (optional) adds ONE angle — streak, conference implication, ranking. NO specific plays (pick-sixes, fourth-down conversions, key turnovers) in the lede.
   3. Did I tailor article LENGTH to the actual data available? (Rich data → full story. Thin data → 2-4 paragraphs. No padding when data is sparse.)
   4. NO-REPETITION CHECK: any single fact (player TD count, final score, key stat) appears AT MOST TWICE in the article? Walk through each headline player — count their mentions. If a fact appears three or more times, cut the weakest.
   5. CATALOG CHECK: any stretch of 3+ score-with-timestamp sentences in a row? If yes, that's logbook mode — condense, group, drop timestamps, or replace with a featured-beat paragraph.
   6. FEATURABLE BEATS — when the data supports them, did I actually feature these (per RULE F)?
        • OUTGAINED-BUT-LOST: if the losing team outgained the winner in total yards, did I write a paragraph that frames the paradox? Not a "despite" clause at the end.
        • STAR-IN-A-LOSS: if a player on the losing side hit 400+ pass yards, 4+ TDs, or 150+ rush yards, did I give him a paragraph contrasting the line with the result?
        • GUTSY ANSWERING DRIVE / TURNOVER SWING / RIVALRY-STREAK: surfaced if the data supports?
   7. COMEBACK FRAMING: any "rally" / "comeback" / "came back from behind" language? It must match the GAME FLOW FACTS deficit data. A one-drive 7-0 deficit is NOT a rally — don't call it one.
   8. Did I avoid the COLUMNIST PHRASES? ("the numbers lied," "less dramatic than it sounds," "that says something about how X went," "the obituary started writing itself," "[Player] just made the case for [thing]," "in the most [Team] way imaginable," "watched a [stat] performance turn into a [result]," "[Team]'s season died in [City]")
   9. Did I avoid the standard CLICHÉS? ("set the tone," "imposed their will," "found their rhythm," "made plays when it mattered," "dialed up," "got cooking," "sealed it" more than once, "controlled the line of scrimmage" without OL/DL data, "shifted the momentum," "answered the call," "leaves no doubt," "made it look easy")
  10. BANNED VERBS — any of "rolled, drilled, flattened, crushed, edged, topped, hammered, handled, dropped" used more than twice?
  11. RANK / RESUME COUNT — total rank refs ≤ 2 per team? Rank-movement claims ≤ 1? Résumé claims ≤ 1 per team? CFP projection claims ≤ 1 total?
  12. Does my CLOSING paragraph land on a FACT (record finalized, bowl eligibility, next opponent, regular season concluded) — NOT a column-y kicker, NOT a thematic flourish, NOT "that says something about..."
  13. EM-DASH count ≤ 4 across the whole article?
  14. SENTENCE RHYTHM: am I mixing short reporting sentences with longer detail sentences, or is every sentence in the 15-25 word AI band?
  15. HEADLINE check: ESPN news-style? Sentence case, 6-12 words, reports the result, no clever-with-a-period twist, no "[Team] Lost by X Anyway", no "[Team] Survives ___" unless margin ≤ 7. Would this headline read at home on ESPN.com Sunday morning?
  16. SUBHEAD check (if used): each is a SHORT NEWS LABEL (3-5 words, no verbs), NOT a column-y phrase? If they sound like article-section titles in a column, rewrite as labels or drop subheads entirely.
  17. STREAK / MOMENTUM check: any "snapped a __-game losing streak" / "third straight" / "back-to-back" / "bouncing back" claim? If so, the explicit "Current streak:" data line MUST support it — pattern-matching the schedule is a hallucination.
  18. PRIOR-YEAR context: used at most ONCE per team, lands naturally, NOT in the lede?
  19. Color / scene: any weather, crowd reaction, sideline body language, "first start since," "after returning from injury"? If yes, cut — these are never in the data.

If any check fails, rewrite the offending paragraph. Do not send a draft that hasn't passed every check.

OUTPUT WRAPPER — READ THIS FIRST:
Your ENTIRE response must be wrapped in a single fenced code block so the user can copy the raw markdown out of the chat UI without losing the formatting markers. That means:

- The very first line of your response is exactly: \`\`\`markdown
- Every line of the article goes between the fences
- The very last line of your response is exactly: \`\`\`
- Output NOTHING outside the fences — no preamble like "Here you go:", no notes, no follow-up offer to revise. Anything outside the fences ends up pasted into the user's tracker as garbage.
- Do NOT add additional code fences inside the article. The outer fence is the only one.

FORMAT (the markdown that goes INSIDE the fence):
- HEADLINE on its own line as a level-1 heading (e.g., "# Kentucky beats Louisville 45-27 to extend Governor's Cup streak"). Sentence case.
- DATELINE on its own line if the game has a home team: "City, ST —" in EXACTLY this format — two-letter state abbreviation, a space, an em-dash "—", a space, then the first sentence of the lede. Examples: "Lexington, KY — Kentucky..." or "Madison, WI — The Badgers...". Use the home team's city. For neutral-site games (bowls, CFP, conference championships), omit the dateline.
- SUBHEADS only if used (per RULE E) — level-2 markdown headings, short label form ("## Turning point").
- **bold** for pivotal stats, decisive plays, and standout stat lines you want the reader's eye to land on. 3-6 boldings across the entire article is the sweet spot — don't over-bold.
- *italic* sparingly, for a team nickname on first mention or rare narrative emphasis. Skip it if unsure.
- Markdown markers only: # / ## / **bold** / *italic*. NO bullet lists, NO tables, NO links, NO inner code fences. Blank line between paragraphs.

USING THE DATA:
- Use the SCORING SUMMARY to walk through scoring plays chronologically with times and running scores.
- Cite EXACT stat lines: "Dahl ran nine times for 66 yards and three touchdowns" — pull the structure straight from the data row.
- Mention yards per carry, completion percentage, yards per attempt only when notably high or low.
- Use records / standings for big-picture framing: "The win moves Kentucky to 7-5."
- Only mention rankings when explicitly shown in the data — don't assume.
- Player stat lines show class + position in brackets like "[RS Fr HB, Kentucky Wildcats]". This bracket tag is INPUT METADATA — it is for your reference only. NEVER copy the bracket tag into the article text. When you mention a player's year or position in prose, render it as natural English words: "redshirt freshman running back Frank Hall", "Hall, a redshirt freshman", or "freshman halfback Frank Hall ran for 38 yards". Class abbreviations: Fr = freshman, RS Fr = redshirt freshman, So = sophomore, RS So = redshirt sophomore, Jr = junior, RS Jr = redshirt junior, Sr = senior, RS Sr = redshirt senior. Position abbreviations: QB = quarterback, HB = running back (or "halfback"), FB = fullback, WR = wide receiver, TE = tight end, K = kicker, P = punter, plus the various OL/DL/LB/DB tags. Never guess a player's year or position — if no bracket tag is given for a player, omit those descriptors. Critically: do NOT write "Frank Hall [RS Fr HB] carried 11 times" — write "Redshirt freshman running back Frank Hall carried 11 times" or just "Frank Hall carried 11 times" if you don't need to reference the year.

GAME FLOW:
When a scoring summary is provided, walk through it chronologically. Track running scores to identify lead changes. A "comeback win" means a team was losing and then won — only use that frame when the data supports it. The GAME FLOW FACTS section in the data block explicitly tells you who trailed and who came back; do not invert that.

ARTICLE STRUCTURE (rich data, ~6-12 paragraphs):
1. Headline (per RULE E).
2. Dateline + lede paragraph: who did what, score, top-line framing (streak, conference, ranking). 2-3 sentences.
3. Second paragraph: expand the headline performance with a full stat line. What the player did, how it shaped the result.
4. Third paragraph: the OTHER side — losing team's QB or top performer, what they did, why it wasn't enough.
5. Body paragraphs: scoring drives chronologically, key plays, the turning point. Subheads optional if the body runs long.
6. Context paragraph (if applicable): prior-year context ONCE, conference implications ONCE.
7. Closing paragraph: records finalized, bowl eligibility, next opponent / regular season concluded. A FACT, not a kicker.

The numbered list is INTENT, not a template. Don't insert "Turning point:" as a subhead just because step 5 said subheads are optional — let the actual flow of the game decide whether subheads help.

PLAYER FOCUS:
Make players the centerpiece. Feature standout performances with full stat lines woven naturally: "Dahl ran nine times for 66 yards and three touchdowns." Cover both teams' top players, not just the winning side.

TEAM NAMES:
Use full team names ("Kentucky", "Louisville") and nicknames ("the Wildcats", "the Cardinals"). Vary for readability. On second reference within a paragraph, "Kentucky" or "the Wildcats" is fine. Third person only — never "our" or "we".

USER'S TEAM:
If a "USER'S TEAM PERSPECTIVE" section appears in the data, frame the article so that team is the primary focus — lead with their performance, feature their players, frame the result from their viewpoint. BUT stay in ESPN beat-writer voice — third-person, no fan voice, no "our Wildcats". Still include the opponent's top performers; this is news, not a one-sided column.

A shorter, accurate article is always better than a longer one padded with invented details or column-mode filler. Before submitting, run the self-check. Every fact ties to the data, every player name spelled correctly, no fabricated quotes, no fabricated plays, no column-mode arch closers — ESPN.com news quality only.`

// ---------------------------------------------------------------------------
// PERSPECTIVE-AWARE INSTRUCTION BUILDERS
//
// The recap UI exposes a slider with five stops:
//   team1 fan · team1 reporter · neutral · team2 reporter · team2 fan
//
// "Neutral" is the existing DEFAULT_GAME_RECAP_INSTRUCTIONS — the ESPN.com
// beat-writer voice. The other four are produced by prepending a short
// PERSPECTIVE OVERRIDE block to that same DEFAULT body. The override
// replaces ONLY the parts that change by perspective (voice, lede,
// headline, prose looseness, fan-vs-reporter framing) and leaves every
// factual guardrail / data-hygiene / streak / no-repetition / catalog
// rule in place. That way each perspective inherits the same closed-
// book discipline — fan voice does NOT get to invent plays.
//
// Reporter = hometown news-side beat writer (third-person, pro-team
// lens, factual). Fan = team-specific blog / SB Nation voice (first-
// person plural "we / our", emotional, blog-y headlines).
// ---------------------------------------------------------------------------

/** Build instructions for a hometown beat reporter focused on the given team. */
export function buildReporterInstructions(focusTeamName) {
  return `═══════════════════════════════════════════════════════════
PERSPECTIVE OVERRIDE — READ FIRST
═══════════════════════════════════════════════════════════
You are a beat reporter covering ${focusTeamName} for the hometown newspaper or team-specific news outlet (think Louisville Courier-Journal's UK beat, Athens Banner-Herald's UGA beat, The Tuscaloosa News on Alabama). NOT national media. NOT The Athletic columnist. NOT a fan.

The article still REPORTS — news-forward, fact-driven, third-person. But your lens is ${focusTeamName}-first. Their players lead. Their stakes frame the story. The opponent is the OTHER side of the story, not the protagonist.

OVERRIDE THE NEUTRAL VOICE / LEDE / HEADLINE RULES BELOW with these:

VOICE — ${focusTeamName} BEAT REPORTER:
- News-forward like ESPN, but you cover ${focusTeamName} specifically.
- ${focusTeamName} is the protagonist of every article. Their performance leads.
- Opponent's standout plays ARE covered (you're a reporter, not a homer) but in service of the ${focusTeamName} story.
- Third-person only. NEVER use "we" or "our" — you are a journalist, not a fan.
- Same banned verbs / banned phrases / cliché list as the neutral rules below.

LEDE — NAME ${focusTeamName}:
- The lede must name ${focusTeamName} in the first sentence, leading with their result.
- ✅ "${focusTeamName} beat [opponent] 45-27 on Saturday to claim the Governor's Cup for a fourth straight year."
- ✅ "Stephen Dahl ran for three touchdowns and ${focusTeamName} beat [opponent] 45-27 on Saturday."
- ✅ "${focusTeamName}'s three-game losing streak ended Saturday with a 45-27 win over [opponent]."
- ✗ "[Opponent] fell to ${focusTeamName} 45-27" — wrong order; the home team gets the active verb.
- All other RULE A guidance (1-2 sentences, no specific plays featured, inverted pyramid) still applies.

HEADLINE — ${focusTeamName} COMES FIRST:
- ${focusTeamName} leads the headline, always.
- ✅ "${focusTeamName} beats [opponent] 45-27 to extend Governor's Cup streak"
- ✅ "Dahl runs for 3 TDs as ${focusTeamName} tops [opponent]"
- ✅ "${focusTeamName} pulls away from [opponent] for fourth-straight Governor's Cup"
- ✗ "[Opponent] falls to ${focusTeamName} 45-27" — wrong order
- All other RULE E rules (sentence case, 6-12 words, no clever twist, no "Survives", no clever-with-period) still apply.

STRUCTURE — ${focusTeamName}-FIRST:
- The "USER'S TEAM PERSPECTIVE" section in the data block (if it appears) is REPLACED by this perspective. ${focusTeamName} is the protagonist regardless of whose dynasty this is.
- Article structure: lead with ${focusTeamName}'s story → expand with their star player → bring in opponent's response → key plays / turning point → ${focusTeamName} context (record, conference, prior-year if applicable) → what's next FOR ${focusTeamName}.

EVERYTHING ELSE BELOW APPLIES UNCHANGED. The factual rules, closed-book discipline, streak guardrails, no-repetition cap, feature-don't-catalog rule, hallucination patterns, prose discipline, self-check, and output format are ALL still in force. You are writing a news recap. You have a hometown beat reporter's lens. The data is still the data.

═══════════════════════════════════════════════════════════

${DEFAULT_GAME_RECAP_INSTRUCTIONS}`
}

/** Build instructions for a fan/blogger writing for fellow fans of the given team. */
export function buildFanInstructions(focusTeamName) {
  return `═══════════════════════════════════════════════════════════
PERSPECTIVE OVERRIDE — READ FIRST
═══════════════════════════════════════════════════════════
You are a ${focusTeamName} fan writing for fellow fans on a team-specific fan blog (think SB Nation team sites — Burnt Orange Nation for Texas, Roll Bama Roll for Alabama, Card Chronicle for Louisville, A Sea of Blue for Kentucky). NOT a reporter. NOT national media. A fan with feelings who watched every snap.

OVERRIDE THE NEUTRAL VOICE / LEDE / HEADLINE / STRUCTURE / PROSE RULES BELOW with these:

VOICE — ${focusTeamName} FAN:
- First-person plural is the fan voice. Use "we" / "us" / "our [team]" / "the boys" when talking about ${focusTeamName}. The opponent is "they" / their proper name / their nickname.
- Emotional. Celebrate wins. Mourn losses. Have opinions. Use them.
- Conversational, blog-y. Drop the AP wire formality.
- Sentence fragments are fine. Exclamations sparingly (1-2 max — they lose force when overused).
- Opinions tied to the data are fine ("Coach X's clock management in the fourth was indefensible — three timeouts at the half doesn't make up for two clock-killing first downs we burned to set up a punt"). Baseless attacks are not ("Coach X is a bum and should be fired" — without data backing).

LEDE — NAME THE EMOTION, NOT THE INVERTED PYRAMID:
- The first sentence captures what fans FEEL after this result. The score is news under the feeling.
- WIN examples:
  - ✅ "Four straight. Read it again — FOUR STRAIGHT Governor's Cups."
  - ✅ "Bowl-eligible. After three weeks of looking lost, the boys remembered who they were."
  - ✅ "Stephen Dahl ran for three. Three! And the defense actually showed up. We needed this one."
- LOSS examples:
  - ✅ "Edward Reed threw for 494 yards. We lost by 18. That's where we are right now."
  - ✅ "Five straight to close the year. The portal can't open fast enough."
  - ✅ "Whatever 'rebuilding' was supposed to look like, this isn't it."
- ✗ Inverted-pyramid wire lede ("Stephen Dahl ran for three touchdowns and Kentucky beat Louisville 45-27 on Saturday") — that's neutral voice, not fan.

HEADLINE — BLOG-POST TITLE:
- Fan headlines are blog-post titles. Punchy. Opinionated. Sometimes snarky. NOT wire-style.
- WIN: "Four-Peat! Wildcats Take the Cup Again", "Bowl Season, Baby", "Dahl, Hall, and a Defense That Showed Up"
- LOSS: "494 Yards. 45-27 Loss. Make It Make Sense.", "Where Do We Go From Here?", "Another One in Lexington"
- ✗ "Kentucky beats Louisville 45-27" — wire style, not fan.

PROSE DISCIPLINE (loosened from neutral):
- Em-dash budget: up to ~8 (looser than neutral's 4). Fan voice uses dashes naturally.
- Sentence rhythm: anything goes — fragments are fine.
- Stats still do work: every number should connect to a fact / opinion in the same sentence or next. Don't park decorative numbers.
- ALL the columnist-mode banned phrases from the neutral rules STILL apply ("the numbers lied", "less dramatic than it sounds", "the obituary started writing itself", "in the most [Team] way imaginable") — those are AI tells, not fan voice. Fan voice has its OWN clichés (banned for fans too): "buckle up", "strap in", "let that sink in", "the boys are back", "all eyes on", "rebuilding job", "trust the process" without irony.

STRUCTURE — FAN BLOG (4-8 paragraphs, sometimes shorter):
- WINS: lede with feeling → the moment that defined it → star of the game → opponent's response (briefly) → what fans should feel next / what to watch.
- LOSSES: lede that names the hurt → what went wrong, anchored in data → what we did do well (or didn't) → where do we go from here.
- Subheads optional. If used, can be opinion-y. "Where the defense lived (when it actually lived)" / "Three TDs and a tipped pass: a brief history of our 4th quarter."

TEAM NAMES — FIRST-PERSON FOR ${focusTeamName}:
- ${focusTeamName} = "we" / "us" / "our [team]" / "the boys" / proper name / nickname — VARY for readability.
- The opponent = their proper name on first mention, then "they" / their nickname.
- The "USER'S TEAM PERSPECTIVE" section in the data block (if it appears) is REPLACED by this perspective. ${focusTeamName} is "we" regardless of whose dynasty this is.

EVERYTHING FACTUAL FROM THE BASE RULES BELOW STILL APPLIES. The data is the data. NO invented plays. NO fake quotes. NO made-up stats. NO weather / crowd / sideline body-language details. Fan emotion does NOT excuse fabrication. The closed-book rules, streak guardrails, no-repetition cap, feature-don't-catalog rule, atomic-claim habit, and the output wrapper are all in force.

The self-check from the base rules below still runs. Additional fan-voice items:
- Does the lede have FEELING (not inverted-pyramid news)?
- Did I use first-person plural for ${focusTeamName} where it lands naturally?
- Does the headline read like a blog post, not a wire headline?
- Are any opinions tied to data, not baseless attacks?

═══════════════════════════════════════════════════════════

${DEFAULT_GAME_RECAP_INSTRUCTIONS}`
}

/**
 * Slider perspective keys. The UI maps a 5-stop slider to these values:
 *   team1Fan · team1Reporter · neutral · team2Reporter · team2Fan
 * The order matches the slider's left-to-right layout.
 */
export const RECAP_PERSPECTIVES = Object.freeze({
  TEAM1_FAN: 'team1Fan',
  TEAM1_REPORTER: 'team1Reporter',
  NEUTRAL: 'neutral',
  TEAM2_REPORTER: 'team2Reporter',
  TEAM2_FAN: 'team2Fan',
})

/**
 * Resolve a perspective key + game context to the right instruction string.
 * Returns null for the neutral path (caller falls back to DEFAULT).
 */
export function getRecapInstructionsForPerspective(perspective, ctx) {
  if (!perspective || perspective === 'neutral') return null
  const t1 = ctx?.team1FullName || ctx?.team1 || 'Team 1'
  const t2 = ctx?.team2FullName || ctx?.team2 || 'Team 2'
  switch (perspective) {
    case 'team1Fan':      return buildFanInstructions(t1)
    case 'team1Reporter': return buildReporterInstructions(t1)
    case 'team2Reporter': return buildReporterInstructions(t2)
    case 'team2Fan':      return buildFanInstructions(t2)
    default:              return null
  }
}

/**
 * Build the prompt for a game recap
 * Works with both user games and CPU vs CPU games
 * Includes all available game data for comprehensive article generation
 * @param {object} ctx - The context object from buildGameRecapContext
 * @param {string} customInstructions - Optional custom writing instructions (uses default if not provided)
 * @param {string} perspective - Optional perspective key (RECAP_PERSPECTIVES). When set and non-neutral, the USER'S TEAM PERSPECTIVE data block is suppressed — the perspective controls framing instead.
 */
function buildGameRecapPrompt(ctx, customInstructions = null, perspective = null, depth = null) {
  // Build the game result line
  const resultLine = `${ctx.winner} defeated ${ctx.loser} ${ctx.winnerScore}-${ctx.loserScore}`

  // Determine home/away teams explicitly - USE FULL NAMES
  const homeTeam = ctx.location === 'home' ? ctx.team1FullName : ctx.location === 'away' ? ctx.team2FullName : null
  const awayTeam = ctx.location === 'home' ? ctx.team2FullName : ctx.location === 'away' ? ctx.team1FullName : null

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
${ctx.team1FullName} ranking entering this game: ${ctx.team1Ranking ? `#${ctx.team1Ranking}` : 'UNRANKED'}
${ctx.team2FullName} ranking entering this game: ${ctx.team2Ranking ? `#${ctx.team2Ranking}` : 'UNRANKED'}
${ctx.team1Conference ? `${ctx.team1FullName} Conference: ${ctx.team1Conference}` : ''}
${ctx.team2Conference ? `${ctx.team2FullName} Conference: ${ctx.team2Conference}` : ''}`

  // Add quarter-by-quarter scores if available
  // Support both new format (team1/team2) and legacy format (team/opponent)
  // Use explicit labels to avoid alignment confusion
  if (ctx.quarters) {
    const team1Quarters = ctx.quarters.team1 || ctx.quarters.team || {}
    const team2Quarters = ctx.quarters.team2 || ctx.quarters.opponent || {}

    // Calculate half scores for clarity
    const team1FirstHalf = (parseInt(team1Quarters.Q1) || 0) + (parseInt(team1Quarters.Q2) || 0)
    const team1SecondHalf = (parseInt(team1Quarters.Q3) || 0) + (parseInt(team1Quarters.Q4) || 0)
    const team2FirstHalf = (parseInt(team2Quarters.Q1) || 0) + (parseInt(team2Quarters.Q2) || 0)
    const team2SecondHalf = (parseInt(team2Quarters.Q3) || 0) + (parseInt(team2Quarters.Q4) || 0)

    prompt += `\n
===========================================
QUARTER-BY-QUARTER SCORES
===========================================
${ctx.team1FullName}:
  Q1: ${team1Quarters.Q1 ?? '-'}, Q2: ${team1Quarters.Q2 ?? '-'}, Q3: ${team1Quarters.Q3 ?? '-'}, Q4: ${team1Quarters.Q4 ?? '-'}${ctx.overtimes ? ', OT: ' + (ctx.overtimes[0]?.team ?? '-') : ''}
  First Half: ${team1FirstHalf}, Second Half: ${team1SecondHalf}, Final: ${ctx.team1Score}

${ctx.team2FullName}:
  Q1: ${team2Quarters.Q1 ?? '-'}, Q2: ${team2Quarters.Q2 ?? '-'}, Q3: ${team2Quarters.Q3 ?? '-'}, Q4: ${team2Quarters.Q4 ?? '-'}${ctx.overtimes ? ', OT: ' + (ctx.overtimes[0]?.opponent ?? '-') : ''}
  First Half: ${team2FirstHalf}, Second Half: ${team2SecondHalf}, Final: ${ctx.team2Score}`
  }

  // Add user team focus section (when this is the user's game, not a CPU vs CPU game).
  // When any explicit perspective is selected (including neutral), the slider controls
  // framing — DON'T also inject the user-team-as-protagonist block. Neutral means
  // neutral; a specific team perspective has its own framing block. Only the default
  // (no perspective set) falls back to auto-focusing the user's team.
  const perspectiveOverridesUserFraming = !!perspective
  if (!perspectiveOverridesUserFraming && ctx.isUserGame && ctx.userTeamName) {
    prompt += `\n
===========================================
USER'S TEAM PERSPECTIVE
===========================================
THIS IS THE USER'S GAME - The user coaches ${ctx.userTeamName}.
FOCUS: Write from ${ctx.userTeamName}'s perspective as the primary team.
- Lead with ${ctx.userTeamName}'s performance and players
- Feature ${ctx.userTeamName} players more prominently in the narrative
- Frame the result from ${ctx.userTeamName}'s viewpoint (their win/loss, their comeback, etc.)
- Still include opponent stats and context, but ${ctx.userTeamName} should be the protagonist`
  }

  // Add scoring summary (CRITICAL for game flow narrative).
  //
  // The "scoringSummary" array can now hold every play the user
  // entered — scoring AND non-scoring — when they used the All Plays
  // entry. The recap prompt cares about TWO different views of it:
  //   • SCORING SUMMARY section: only plays that actually scored
  //     (or were a 2PT attempt). Non-scoring rows would render as
  //     "(, )" garbage with running score 0,0 — must be filtered.
  //   • PLAY-BY-PLAY section (below): every play, used for drive
  //     narration. Only rendered when PBP data exists.
  //
  // collapsePatRowsIntoTDs: in All Plays mode the AI emits PATs as
  // their own rows (scoreType="PAT", patResult on the PAT row). Merge
  // that patResult onto the preceding TD row so the running-score
  // math here adds the XP point. The PAT row itself is still kept in
  // the array for PBP context.
  const normalizedPlays = collapsePatRowsIntoTDs(ctx.scoringSummary || [])
  // A play is "scoring" if it has a recognizable scoring-type label
  // (TD / Field Goal / Safety) — excluding standalone PAT rows whose
  // patResult has already been folded onto the preceding TD — OR a
  // standalone 2PT attempt. Rejecting unrecognized labels guards
  // against misaligned TSV junk: a Penalty row the AI emitted with
  // too few empty cells can leave a quarter number ("2") sitting in
  // the scoreType slot. Truthy-only would have surfaced that as a
  // ghost scoring entry in the recap.
  const looksLikeScoreType = (s) => {
    if (!s) return false
    if (/\bTD\b/i.test(s)) return true
    if (/Field Goal/i.test(s)) return true
    if (/Safety/i.test(s)) return true
    return false
  }
  const isScoringPlay = (p) => {
    const s = (p?.scoreType || '').trim()
    if (s === 'PAT') return false
    const r = p?.patResult || ''
    if (looksLikeScoreType(s)) return true
    return r.includes('2PT') || s.includes('2PT')
  }
  // A play is "PBP-only" (carries play-by-play extension fields).
  // Used to detect whether the new PLAY-BY-PLAY section should
  // render at all. Accept legacy 15-col fields too so older games
  // still surface their drive context.
  const hasAnyPBPData = normalizedPlays.some(p =>
    p && (p.description || p.playType || p.down || p.fieldPos || p.outcome || p.notes)
  )
  const scoringOnlyList = normalizedPlays.filter(isScoringPlay)

  if (scoringOnlyList.length > 0) {
    prompt += `\n
===========================================
SCORING SUMMARY (in chronological order)
===========================================`
    // Tid-based "is this play team1's?" — play.team is an abbr string and
    // teambuilder team abbrs can drift after the game was recorded. We
    // resolve play.team → tid via this game's two team tids + their
    // current registry abbrs, then compare tids. Falls back to abbr
    // compare for legacy games where neither tid is available.
    const ctxT1U = ctx.team1?.toUpperCase()
    const ctxT2U = ctx.team2?.toUpperCase()
    const isPlayTeam1 = (play) => {
      const u = play.team?.toUpperCase()
      if (ctx.team1Tid != null && ctx.team2Tid != null && ctxT1U && ctxT2U) {
        const tid = u === ctxT1U ? ctx.team1Tid : (u === ctxT2U ? ctx.team2Tid : null)
        if (tid != null) return tid === ctx.team1Tid
      }
      return u === ctxT1U
    }
    let team1Running = 0
    let team2Running = 0
    scoringOnlyList.forEach((play, idx) => {
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

      // Update running score (tid-resolved when possible, see isPlayTeam1)
      const isTeam1 = isPlayTeam1(play)
      if (isTeam1) team1Running += points
      else team2Running += points

      const quarter = play.quarter || '?'
      const timeLeft = play.timeLeft || ''
      const scorer = play.scorer || 'Unknown'
      const passer = play.passer ? ` from ${play.passer}` : ''
      const playTeamFullName = isTeam1 ? ctx.team1FullName : ctx.team2FullName

      prompt += `\n${idx + 1}. Q${quarter} ${timeLeft} - ${playTeamFullName}: ${scorer}${passer} (${scoreType}${patResult ? ', ' + patResult : ''}) → Score: ${ctx.team1FullName} ${team1Running}, ${ctx.team2FullName} ${team2Running}`
    })

    // ---- GAME FLOW FACTS ----
    // The scoring summary is chronological, but LLMs still occasionally
    // confuse WHICH team was trailing and WHICH team rallied. Spell it out
    // explicitly so the recap headline can't invert the narrative.
    const quarterRankForFlow = (q) => {
      if (q == null) return 0
      if (typeof q === 'number' && Number.isFinite(q)) return q
      const s = String(q).trim().toUpperCase()
      if (!s) return 0
      if (/^\d+$/.test(s)) return parseInt(s, 10)
      const otMatch = s.match(/^(\d*)OT$/)
      if (otMatch) return 4 + (otMatch[1] ? parseInt(otMatch[1], 10) : 1)
      return 0
    }
    let t1 = 0, t2 = 0
    let t1MaxDeficit = 0, t2MaxDeficit = 0
    let halftimeT1 = 0, halftimeT2 = 0
    let regT1 = 0, regT2 = 0
    let otT1 = 0, otT2 = 0
    let leadChanges = 0
    let lastLeader = 0 // -1 = team2, 0 = tied, 1 = team1
    // Use normalizedPlays (PAT results already collapsed onto preceding
    // TD row) so flow math doesn't undercount XPs from All Plays mode.
    normalizedPlays.forEach((play) => {
      const scoreType = play.scoreType || ''
      const patResult = play.patResult || ''
      let pts = 0
      if (scoreType.includes('TD') && !scoreType.includes('2PT')) {
        pts = 6
        if (patResult.includes('Made XP')) pts += 1
        else if (patResult.includes('Converted 2PT')) pts += 2
      } else if (scoreType === 'Field Goal') pts = 3
      else if (scoreType === 'Safety') pts = 2
      else if (scoreType.includes('2PT') && scoreType.includes('Converted')) pts = 2
      // Reuse tid-resolved attribution from above (same logic).
      const isTeam1 = isPlayTeam1(play)
      if (isTeam1) t1 += pts
      else t2 += pts
      const qr = quarterRankForFlow(play.quarter)
      // Track halftime (through Q2) and end-of-regulation (through Q4)
      if (qr <= 2) { halftimeT1 = t1; halftimeT2 = t2 }
      if (qr <= 4) { regT1 = t1; regT2 = t2 }
      if (qr > 4) { otT1 = t1 - regT1; otT2 = t2 - regT2 }
      // Running deficit tracking (positive = they trailed by this much)
      if (t1 < t2) t1MaxDeficit = Math.max(t1MaxDeficit, t2 - t1)
      if (t2 < t1) t2MaxDeficit = Math.max(t2MaxDeficit, t1 - t2)
      // Lead change count
      const leader = t1 > t2 ? 1 : t1 < t2 ? -1 : 0
      if (leader !== 0 && leader !== lastLeader && lastLeader !== 0) leadChanges += 1
      if (leader !== 0) lastLeader = leader
    })
    // If no plays after Q4, regT matches current; if only regulation, otT is 0
    if (normalizedPlays.every((p) => quarterRankForFlow(p.quarter) <= 4)) {
      regT1 = t1; regT2 = t2
    }
    const finalT1 = t1
    const finalT2 = t2
    const name1 = ctx.team1FullName
    const name2 = ctx.team2FullName
    const describeLead = (a, b, nameA, nameB) =>
      a > b ? `${nameA} led ${a}-${b}` : a < b ? `${nameB} led ${b}-${a}` : `tied ${a}-${a}`

    const flowLines = [
      `Halftime: ${describeLead(halftimeT1, halftimeT2, name1, name2)}.`,
      `End of regulation: ${describeLead(regT1, regT2, name1, name2)}${regT1 === regT2 ? ' (went to overtime)' : ''}.`,
    ]
    if (regT1 === regT2) {
      flowLines.push(`Overtime scoring: ${name1} ${otT1}, ${name2} ${otT2}.`)
    }
    flowLines.push(`Final: ${describeLead(finalT1, finalT2, name1, name2)}.`)
    flowLines.push(`Largest deficit overcome by ${name1}: ${t1MaxDeficit === 0 ? 'never trailed' : `${t1MaxDeficit} point${t1MaxDeficit === 1 ? '' : 's'}`}.`)
    flowLines.push(`Largest deficit overcome by ${name2}: ${t2MaxDeficit === 0 ? 'never trailed' : `${t2MaxDeficit} point${t2MaxDeficit === 1 ? '' : 's'}`}.`)
    flowLines.push(`Lead changes: ${leadChanges}.`)
    // Winner framing — whichever team's score is higher at the end won.
    const winnerName = finalT1 > finalT2 ? name1 : finalT2 > finalT1 ? name2 : null
    const loserName = winnerName === name1 ? name2 : winnerName === name2 ? name1 : null
    const winnerMaxDeficit = winnerName === name1 ? t1MaxDeficit : t2MaxDeficit
    if (winnerName && winnerMaxDeficit > 0) {
      flowLines.push(`COMEBACK FACT: ${winnerName} trailed by as many as ${winnerMaxDeficit} and came back to win. ${loserName} led at one point but did NOT win — do not describe ${loserName} as rallying or coming back.`)
    } else if (winnerName && winnerMaxDeficit === 0) {
      flowLines.push(`FRONT-RUNNER FACT: ${winnerName} never trailed in this game. Do not describe ${winnerName} as rallying or coming back from behind.`)
    }

    prompt += `\n
===========================================
GAME FLOW FACTS — DO NOT CONTRADICT THESE
===========================================
${flowLines.join('\n')}`
  }

  // Play-by-play section — full drive-level detail when the user has
  // entered every play via the All Plays AI prompt. Renders separately
  // from the Scoring Summary section so the AI has:
  //   • a concise list of scoring plays (above), AND
  //   • a complete play-by-play log here, for drive narration and
  //     specific-play references.
  //
  // Closed-book discipline applies: the AI must not invent plays not in
  // this list. The guardrail line at the bottom of the section spells
  // that out explicitly.
  //
  // Data hygiene: only include rows that have BOTH a quarter and a
  // time (the chronological keys) AND at least one of {playType, down,
  // scorer, scoreType}. A row with no descriptive fields is a stray
  // user edit and would just confuse the AI.
  if (hasAnyPBPData && Array.isArray(ctx.scoringSummary) && ctx.scoringSummary.length > 0) {
    const ctxT1Upbp = ctx.team1?.toUpperCase()
    const ctxT2Upbp = ctx.team2?.toUpperCase()
    const playTeamLabel = (play) => {
      const u = play.team?.toUpperCase()
      if (ctx.team1Tid != null && ctx.team2Tid != null && ctxT1Upbp && ctxT2Upbp) {
        const tid = u === ctxT1Upbp ? ctx.team1Tid : (u === ctxT2Upbp ? ctx.team2Tid : null)
        if (tid != null) return tid === ctx.team1Tid ? ctx.team1FullName : ctx.team2FullName
      }
      return u === ctxT1Upbp ? ctx.team1FullName : (u === ctxT2Upbp ? ctx.team2FullName : (play.team || ''))
    }

    // Format down-and-distance ("3rd & 5", "1st & Goal"). Returns "" if
    // the row doesn't carry down data (e.g. a kickoff, PAT, scoring
    // summary that didn't include down/distance).
    const fmtDownDist = (play) => {
      const d = (play.down || '').trim()
      if (!d) return ''
      const dist = (play.distance || '').trim()
      const ord = d === '1' ? '1st' : d === '2' ? '2nd' : d === '3' ? '3rd' : d === '4' ? '4th' : d
      if (!dist) return ord
      if (dist === 'G' || /goal/i.test(dist)) return `${ord} & Goal`
      return `${ord} & ${dist}`
    }

    // Compact one-line play description. Reconstructs the play's
    // natural-language sentence from the structured atoms (Play Type
    // + scorer/passer/yards). For scoring rows, leads with the score
    // type so the "this play scored" signal is preserved.
    //
    // Legacy fallback: games saved under the previous schema may
    // still carry a `description` / `outcome` / `notes` field. If
    // atom assembly produces nothing, use that text.
    const fmtPlayDesc = (play) => {
      const isScoring = isScoringPlay(play)
      const scoreType = (play.scoreType || '').trim()
      const patResult = (play.patResult || '').trim()
      const yards = (play.yards || '').toString().trim()
      const primary = (play.scorer || '').trim()
      const secondary = (play.passer || '').trim()
      const playType = (play.playType || '').trim()

      // For scoring rows, lead with the score type — concise,
      // explicitly flags the play as a score for downstream prompts.
      if (isScoring && scoreType) {
        const yardClause = yards ? `${yards} yd` : ''
        const passFrom = secondary ? ` from ${secondary}` : ''
        const pat = patResult ? ` (PAT: ${patResult})` : ''
        return `${yardClause ? yardClause + ' ' : ''}${scoreType}: ${primary}${passFrom}${pat}`.trim()
      }

      // Non-scoring play: reconstruct sentence from atoms. The
      // granular Play Type taxonomy ("Pass Knocked Away", "Field
      // Goal Missed", etc.) tells us the template.
      const yardsNum = Number(yards)
      const yardsAbs = Number.isFinite(yardsNum) ? Math.abs(yardsNum) : null
      const isTD = /TD/i.test(scoreType)
      let sentence = ''
      switch (playType) {
        case 'Rush':
          if (primary) {
            sentence = yards ? `${yards} yard rush by ${primary}` : `Rush by ${primary}`
            if (isTD) sentence += ` for a TD`
          }
          break
        case 'Pass Complete':
          if (secondary) {
            sentence = primary && yards ? `${secondary} pass to ${primary} for ${yards} yards` : (primary ? `${secondary} pass to ${primary}` : `${secondary} pass complete`)
            if (isTD) sentence += ` for a TD`
          }
          break
        case 'Pass Incomplete':
          sentence = secondary ? (primary ? `${secondary} incomplete pass; intended for ${primary}` : `${secondary} incomplete pass`) : ''
          break
        case 'Pass Knocked Away':
          sentence = secondary ? (primary ? `${secondary} pass knocked away by ${primary}` : `${secondary} pass knocked away`) : ''
          break
        case 'Pass Intercepted':
          sentence = secondary ? (primary ? `${secondary} pass intercepted by ${primary}` : `${secondary} pass intercepted`) : ''
          break
        case 'Sack':
          sentence = secondary ? (yardsAbs != null ? `${secondary} sacked for a ${yardsAbs} yard loss` : `${secondary} sacked`) : ''
          break
        case 'Kickoff Return':
          sentence = primary ? (yards ? `${primary} returns kick for ${yards} yards` : `${primary} returns kick`) : ''
          break
        case 'Punt Return':
          sentence = primary ? (yards ? `${yards} yard punt return by ${primary}` : `Punt return by ${primary}`) : ''
          break
        case 'Field Goal Made':
          sentence = primary ? (yards ? `${primary} ${yards} yard field goal good` : `${primary} field goal good`) : ''
          break
        case 'Field Goal Missed':
          sentence = primary ? (yards ? `${primary} missed a ${yards} yard field goal` : `${primary} missed a field goal`) : ''
          break
        case 'PAT': {
          const pat = patResult.toLowerCase()
          const result = pat.includes('made') ? 'good' : pat.includes('missed') ? 'no good' : pat.includes('blocked') ? 'blocked' : pat.includes('converted') ? 'converted (2PT)' : pat.includes('failed') ? 'failed (2PT)' : 'good'
          sentence = primary ? `Extra point ${result} by ${primary}` : `Extra point ${result}`
          break
        }
        case 'Penalty':
          sentence = yards ? `Penalty for ${yards} yards` : 'Penalty'
          break
        case 'Fumble Recovery':
          sentence = primary ? (yards ? `Fumble recovered by ${primary} for ${yards} yards` : `Fumble recovered by ${primary}`) : ''
          break
        case 'Safety':
          sentence = primary ? `Safety on ${primary}` : 'Safety'
          break
        default: {
          // Unknown / legacy play type — synthesize something readable.
          const parts = []
          if (playType) parts.push(playType)
          if (primary && secondary) parts.push(`${primary} → ${secondary}`)
          else if (primary) parts.push(primary)
          if (yards) parts.push(`${yards} yd`)
          sentence = parts.join(' · ')
        }
      }

      if (sentence) return sentence

      // Legacy fallback — games stored under the previous schema.
      const desc = (play.description || '').trim()
      if (desc) return desc
      const outcome = (play.outcome || '').trim()
      const notes = (play.notes || '').trim()
      const parts = []
      if (playType) parts.push(playType)
      if (primary && secondary) parts.push(`${primary} → ${secondary}`)
      else if (primary) parts.push(primary)
      if (yards) parts.push(`${yards} yd`)
      if (outcome) parts.push(`(${outcome})`)
      if (notes) parts.push(notes)
      return parts.join(' · ')
    }

    // Strict hygiene filter — only rows with quarter+time and at least
    // one descriptive field. The new Description column counts;
    // legacy fields (outcome, notes) also count for back-compat.
    const pbpRows = (ctx.scoringSummary || []).filter(p =>
      p &&
      p.quarter && String(p.quarter).trim() &&
      p.timeLeft && String(p.timeLeft).trim() &&
      (
        (p.description || '').trim() ||
        (p.playType || '').trim() ||
        (p.down || '').trim() ||
        (p.scorer || '').trim() ||
        (p.scoreType || '').trim() ||
        (p.outcome || '').trim() ||
        (p.notes || '').trim()
      )
    )

    if (pbpRows.length > 0) {
      // Group by quarter for readability. quarter values are "1"/"2"/.../"OT"/"2OT".
      const byQuarter = new Map()
      for (const p of pbpRows) {
        const q = String(p.quarter).trim().toUpperCase()
        if (!byQuarter.has(q)) byQuarter.set(q, [])
        byQuarter.get(q).push(p)
      }
      // Sort quarter keys: 1, 2, 3, 4, OT, 2OT, 3OT, ...
      const quarterRank = (q) => {
        if (/^\d+$/.test(q)) return parseInt(q, 10)
        const m = q.match(/^(\d*)OT$/)
        if (m) return 4 + (m[1] ? parseInt(m[1], 10) : 1)
        return 99
      }
      const orderedQuarters = [...byQuarter.keys()].sort((a, b) => quarterRank(a) - quarterRank(b))

      prompt += `\n
===========================================
PLAY-BY-PLAY (every play, chronological)
===========================================
This section lists every play of the game. Use it to narrate drives, identify momentum shifts, describe failed red-zone trips and critical 4th-down conversions. EVERY play referenced in your recap must appear in this list — do NOT invent plays.`

      for (const q of orderedQuarters) {
        const label = /^\d+$/.test(q) ? `QUARTER ${q}` : (q === 'OT' ? 'OVERTIME' : `${q.replace('OT', '')}OT`)
        prompt += `\n\n${label}`
        // Within a quarter, the clock counts DOWN — so earlier plays
        // have MORE time remaining. Sort descending by time so the
        // list is chronological.
        const parseTime = (t) => {
          const [m, s] = String(t || '0:00').split(':')
          return (parseInt(m, 10) || 0) * 60 + (parseInt(s, 10) || 0)
        }
        const sorted = byQuarter.get(q).slice().sort((a, b) => parseTime(b.timeLeft) - parseTime(a.timeLeft))
        for (const play of sorted) {
          const dd = fmtDownDist(play)
          const fp = (play.fieldPos || '').trim()
          const desc = fmtPlayDesc(play)
          const teamLabel = playTeamLabel(play)
          // Compact line:  TIME  [TEAM] (downDist on fieldPos) — desc
          const dDistAndPos = [dd, fp].filter(Boolean).join(' on ')
          const head = dDistAndPos ? `(${dDistAndPos}) — ` : ''
          prompt += `\n  ${play.timeLeft}  [${teamLabel}]  ${head}${desc}`
        }
      }

      prompt += `\n
USE THIS DATA FOR:
- Describing scoring drives by their components ("a 9-play, 75-yard march capped by a 1-yard touchdown plunge"). Count plays only if they appear in this list.
- Citing specific key moments by quarter + time ("the 4th-and-2 conversion at the LOU 40 with 5:30 left in the first").
- Drive flow: when team changes between consecutive entries here, possession changed (kickoff, punt, turnover, or score). The list does not always tag the change explicitly — infer from the team brackets.

DO NOT:
- Invent any play not present in this list.
- Describe a player's involvement that contradicts the play description above.
- Pretend a player did something on a play where the data shows someone else as the primary/secondary actor.
- Reference yardage, down, or distance numbers that don't match the data verbatim.`
    }
  }

  // Add team stats if available. ctx.teamStats is keyed by team1/team2
  // (each side resolved by tid via the canonical store). The prompt
  // labels each column with the team's full name regardless of whether
  // it was physically home or away.
  if (ctx.teamStats) {
    const t1 = ctx.teamStats.team1 || {}
    const t2 = ctx.teamStats.team2 || {}
    const team1ColName = ctx.isCPUGame ? (getTeamName(t1.teamAbbr) || t1.teamAbbr || ctx.team1FullName) : ctx.team1FullName
    const team2ColName = ctx.isCPUGame ? (getTeamName(t2.teamAbbr) || t2.teamAbbr || ctx.team2FullName) : ctx.team2FullName

    // Helper: only emit a stat row when at least one team has a real value
    const hasStat = (...keys) => keys.some(k => t1[k] != null || t2[k] != null)
    const v = (obj, ...keys) => { for (const k of keys) if (obj[k] != null) return obj[k]; return '-' }

    prompt += `\n
===========================================
TEAM STATISTICS
===========================================
                        ${team1ColName}    ${team2ColName}
First Downs:            ${v(t1,'firstDowns')}         ${v(t2,'firstDowns')}
Total Yards:            ${v(t1,'totalYards','totalOffense')}       ${v(t2,'totalYards','totalOffense')}
Total Plays:            ${v(t1,'totalPlays')}         ${v(t2,'totalPlays')}
Rushing (ATT-YDS-TD):   ${v(t1,'rushAttempts')}-${v(t1,'rushYards')}-${v(t1,'rushTds')}     ${v(t2,'rushAttempts')}-${v(t2,'rushYards')}-${v(t2,'rushTds')}
Passing (CMP-ATT-YDS-TD): ${v(t1,'completions')}-${v(t1,'passAttempts')}-${v(t1,'passingYards','passYards')}-${v(t1,'passTds')}   ${v(t2,'completions')}-${v(t2,'passAttempts')}-${v(t2,'passingYards','passYards')}-${v(t2,'passTds')}
Turnovers:              ${v(t1,'turnovers')}         ${v(t2,'turnovers')}${
  hasStat('fumblesLost') ? `\nFumbles Lost:           ${v(t1,'fumblesLost')}         ${v(t2,'fumblesLost')}` : ''}${
  hasStat('interceptions') ? `\nInterceptions Thrown:   ${v(t1,'interceptions')}         ${v(t2,'interceptions')}` : ''}
3rd Down:               ${v(t1,'3rdDownConv')}/${v(t1,'3rdDownAtt')}       ${v(t2,'3rdDownConv')}/${v(t2,'3rdDownAtt')}${
  hasStat('4thDownConv','4thDownAtt') ? `\n4th Down:               ${v(t1,'4thDownConv')}/${v(t1,'4thDownAtt')}       ${v(t2,'4thDownConv')}/${v(t2,'4thDownAtt')}` : ''}${
  hasStat('redZoneTd','redZoneFg','redZonePct') ? `\nRed Zone (TD-FG-Pct):   ${v(t1,'redZoneTd')}-${v(t1,'redZoneFg')}-${v(t1,'redZonePct')}%   ${v(t2,'redZoneTd')}-${v(t2,'redZoneFg')}-${v(t2,'redZonePct')}%` : ''}${
  hasStat('penalties','penaltyYards') ? `\nPenalties (No.-Yds):    ${v(t1,'penalties')}-${v(t1,'penaltyYards')}     ${v(t2,'penalties')}-${v(t2,'penaltyYards')}` : ''}${
  hasStat('kickRetYards') ? `\nKick Return Yards:      ${v(t1,'kickRetYards')}         ${v(t2,'kickRetYards')}` : ''}${
  hasStat('puntRetYards') ? `\nPunt Return Yards:      ${v(t1,'puntRetYards')}         ${v(t2,'puntRetYards')}` : ''}${
  hasStat('puntAvg') ? `\nPunt Average:           ${v(t1,'puntAvg')}         ${v(t2,'puntAvg')}` : ''}
Possession:             ${t1.possMinutes ?? ''}:${String(t1.possSeconds ?? '').padStart(2, '0')}      ${t2.possMinutes ?? ''}:${String(t2.possSeconds ?? '').padStart(2, '0')}`
  }

  // Add coaching staff so the AI can name coaches instead of writing "Coach's team"
  const team1HC = ctx.team1Staff?.hcName?.trim()
  const team1OC = ctx.team1Staff?.ocName?.trim()
  const team1DC = ctx.team1Staff?.dcName?.trim()
  const team2HC = ctx.team2Staff?.hcName?.trim()
  const team2OC = ctx.team2Staff?.ocName?.trim()
  const team2DC = ctx.team2Staff?.dcName?.trim()
  const anyCoach = team1HC || team1OC || team1DC || team2HC || team2OC || team2DC
  if (anyCoach) {
    prompt += `\n
===========================================
COACHING STAFF
===========================================`
    if (team1HC || team1OC || team1DC) {
      prompt += `\n${ctx.team1FullName}:`
      if (team1HC) prompt += `\n  Head Coach: ${team1HC}`
      if (team1OC) prompt += `\n  Offensive Coordinator: ${team1OC}`
      if (team1DC) prompt += `\n  Defensive Coordinator: ${team1DC}`
      if (ctx.team1CoachContext && ctx.team1CoachContext.yearAtSchool > 0) {
        const c = ctx.team1CoachContext
        prompt += `\n  Tenure: year ${c.yearAtSchool} at ${ctx.team1FullName} (since ${c.stintStartYear}); stint record ${c.stintWins}-${c.stintLosses}${c.stintConfWins || c.stintConfLosses ? `, ${c.stintConfWins}-${c.stintConfLosses} conf` : ''}.`
        if (c.framingCue) prompt += `\n  Framing cue: ${c.framingCue}.`
      }
    }
    if (team2HC || team2OC || team2DC) {
      prompt += `\n${ctx.team2FullName}:`
      if (team2HC) prompt += `\n  Head Coach: ${team2HC}`
      if (team2OC) prompt += `\n  Offensive Coordinator: ${team2OC}`
      if (team2DC) prompt += `\n  Defensive Coordinator: ${team2DC}`
      if (ctx.team2CoachContext && ctx.team2CoachContext.yearAtSchool > 0) {
        const c = ctx.team2CoachContext
        prompt += `\n  Tenure: year ${c.yearAtSchool} at ${ctx.team2FullName} (since ${c.stintStartYear}); stint record ${c.stintWins}-${c.stintLosses}${c.stintConfWins || c.stintConfLosses ? `, ${c.stintConfWins}-${c.stintConfLosses} conf` : ''}.`
        if (c.framingCue) prompt += `\n  Framing cue: ${c.framingCue}.`
      }
    }
    prompt += `\n\nUse coach names where natural (e.g., "[HC] watched his team..."). Never write the literal word "Coach" as a stand-in for a name — if you don't have a coach's name for a reference, just use the team name or a pronoun. When a "Framing cue" line is present, it's a green-light to drop that beat verbatim or paraphrase ("first-year head coach already 6-0", "year four with a sub-.500 stint record — the seat is heating up", "year three with a 22-7 stint record — building a real era").`
  }

  // Add talent/roster context based on team ratings
  const talentContext = buildTalentContext(ctx.team1Ratings, ctx.team2Ratings, ctx.team1FullName, ctx.team2FullName, ctx.team1Won)
  if (talentContext) {
    prompt += `\n
===========================================
TALENT & ROSTER CONTEXT
===========================================
${talentContext}

Use this context to inform your narrative about favorites, underdogs, and upsets. Do NOT mention specific rating numbers.`
  }

  // Per-team season context. Rendered for BOTH teams (user and CPU games)
  // so the AI always knows each team's record, streak, and detailed prior
  // schedule going into this game. Without this, CPU-vs-CPU recaps had to
  // guess at records — the article could call a 0-5 team "surging" or a
  // 5-0 team "looking for its first win."
  const renderSeasonContext = (label, teamName, recordBefore, recordAfter, streakLine, detailedResults) => {
    if (!recordBefore) return ''
    let block = `\n
===========================================
${label} FOR ${teamName}
===========================================
Record entering game: ${recordBefore}
Record after game: ${recordAfter}
${streakLine
  ? `Current streak: ${streakLine}`
  : 'Current streak: NONE — no consecutive same-result run going into this game. Do NOT claim any "snaps __-game losing streak" / "extends winning streak" / "back-to-back" framing for this team.'}`
    if (detailedResults && detailedResults.length > 0) {
      block += `\n\n${teamName} season results before this game (most recent last):`
      detailedResults.forEach(g => {
        const resultChar = g.result === 'win' || g.result === 'W' ? 'W' : 'L'
        const locationChar = g.location === 'home' ? 'vs' : g.location === 'away' ? '@' : 'vs'
        const rankStr = g.opponentRank ? `#${g.opponentRank} ` : ''
        const opponentName = getTeamName(g.opponent) || g.opponent
        block += `\n  Week ${g.week}: ${resultChar} ${g.teamScore}-${g.opponentScore} ${locationChar} ${rankStr}${opponentName}`
      })
    }
    return block
  }

  prompt += renderSeasonContext(
    ctx.isUserGame ? `SEASON CONTEXT (USER'S TEAM)` : `SEASON CONTEXT`,
    ctx.team1FullName,
    ctx.team1RecordBefore,
    ctx.team1RecordAfter,
    ctx.team1Streak,
    ctx.team1SeasonResults
  )
  prompt += renderSeasonContext(
    `SEASON CONTEXT`,
    ctx.team2FullName,
    ctx.team2RecordBefore,
    ctx.team2RecordAfter,
    ctx.team2Streak,
    // team2SeasonResults uses a different shape (compact summary). Skip the
    // detailed list here — the dedicated "current season results" section
    // below renders team2's full week-by-week.
    null
  )
  if (ctx.isConferenceGame && ctx.conference) {
    prompt += `\n\nConference game: ${ctx.conference}`
  }

  // Add player stats for both teams - CRITICAL: Include team name with each player for clarity
  if (ctx.boxScore) {
    const team1Name = ctx.boxScore.team1Name
    const team2Name = ctx.boxScore.team2Name
    // Build "Sr HB" / "Jr QB" tag from whatever class/position we resolved.
    // AI writers need this so they don't guess a player's year (e.g., calling
    // a senior a "junior"). We still emit a clean line when either is missing.
    const formatPlayerLine = (p, teamName) => {
      const tagParts = []
      if (p.class) tagParts.push(p.class)
      if (p.position) tagParts.push(p.position)
      const tag = tagParts.length ? `${tagParts.join(' ')}, ` : ''
      return `  ${p.player} [${tag}${teamName}]: ${p.stats}`
    }

    const team1Stats = ctx.boxScore.team1
    if (team1Stats) {
      prompt += `\n
===========================================
${team1Name.toUpperCase()} INDIVIDUAL STATS
(All players below play for ${team1Name})
===========================================`

      if (team1Stats.passing.length > 0) {
        prompt += `\n\n${team1Name.toUpperCase()} PASSING:`
        team1Stats.passing.forEach(p => { prompt += `\n${formatPlayerLine(p, team1Name)}` })
      }
      if (team1Stats.rushing.length > 0) {
        prompt += `\n\n${team1Name.toUpperCase()} RUSHING:`
        team1Stats.rushing.forEach(p => { prompt += `\n${formatPlayerLine(p, team1Name)}` })
      }
      if (team1Stats.receiving.length > 0) {
        prompt += `\n\n${team1Name.toUpperCase()} RECEIVING:`
        team1Stats.receiving.forEach(p => { prompt += `\n${formatPlayerLine(p, team1Name)}` })
      }
      if (team1Stats.defense.length > 0) {
        prompt += `\n\n${team1Name.toUpperCase()} DEFENSE:`
        team1Stats.defense.forEach(p => { prompt += `\n${formatPlayerLine(p, team1Name)}` })
      }
      if (team1Stats.kicking.length > 0) {
        prompt += `\n\n${team1Name.toUpperCase()} KICKING:`
        team1Stats.kicking.forEach(p => { prompt += `\n${formatPlayerLine(p, team1Name)}` })
      }
    }

    // Helper: render all categories for one team
    const renderTeamStats = (stats, teamName) => {
      if (!stats) return
      const cats = [
        { key: 'passing',    label: 'PASSING' },
        { key: 'rushing',    label: 'RUSHING' },
        { key: 'receiving',  label: 'RECEIVING' },
        { key: 'defense',    label: 'DEFENSE' },
        { key: 'kicking',    label: 'KICKING' },
        { key: 'punting',    label: 'PUNTING' },
        { key: 'kickReturn', label: 'KICK RETURNS' },
        { key: 'puntReturn', label: 'PUNT RETURNS' },
      ]
      cats.forEach(({ key, label }) => {
        if (stats[key]?.length > 0) {
          prompt += `\n\n${teamName.toUpperCase()} ${label}:`
          stats[key].forEach(p => { prompt += `\n${formatPlayerLine(p, teamName)}` })
        }
      })
    }

    const team2Stats = ctx.boxScore.team2
    if (team2Stats) {
      prompt += `\n
===========================================
${team2Name.toUpperCase()} INDIVIDUAL STATS
(All players below play for ${team2Name})
===========================================`
      renderTeamStats(team2Stats, team2Name)
    }

    // Retrofit team1 to also use the shared renderer for the new categories
    // (passing/rushing/receiving/defense/kicking were already output above;
    // punting and returns are new and only added via renderTeamStats)
    const team1NewCats = ['punting', 'kickReturn', 'puntReturn']
    const team1Stats2 = ctx.boxScore.team1
    if (team1Stats2) {
      team1NewCats.forEach(key => {
        if (team1Stats2[key]?.length > 0) {
          const label = key === 'punting' ? 'PUNTING' : key === 'kickReturn' ? 'KICK RETURNS' : 'PUNT RETURNS'
          prompt += `\n\n${team1Name.toUpperCase()} ${label}:`
          team1Stats2[key].forEach(p => { prompt += `\n${formatPlayerLine(p, team1Name)}` })
        }
      })
    }
  }

  // Add head-to-head history (rivalry context) + a one-line cue block that
  // tells the AI exactly how to use it. Without explicit framing the AI
  // tended to ignore this section and never wrote "revenge / rematch /
  // avenging" prose even when the data clearly supported it.
  if (ctx.headToHead && ctx.headToHead.length > 0) {
    prompt += `\n
===========================================
HEAD-TO-HEAD HISTORY (${ctx.team1FullName} vs ${ctx.team2FullName})
===========================================`
    ctx.headToHead.forEach(h => {
      const winnerName = getTeamName(h.winner) || h.winner
      const loserName = getTeamName(h.loser) || h.loser
      prompt += `\n  ${h.year}: ${winnerName} def. ${loserName} ${h.winnerScore}-${h.loserScore} (${h.gameType})`
    })

    if (ctx.headToHeadSummary) {
      const s = ctx.headToHeadSummary
      prompt += `\n\nRIVALRY FRAMING — use whichever of these naturally fits the lede or a body paragraph:`
      if (s.lastMeeting) {
        const lm = s.lastMeeting
        prompt += `\n  • Last meeting (${lm.year}): ${lm.winner} beat ${lm.loser} ${lm.winnerScore}-${lm.loserScore} in the ${lm.gameType}.`
      }
      // Revenge / avenge cues — the explicit verbs the user asked for. Only
      // emit when this is a genuine rematch where the team that lost last
      // time has the chance to flip the result THIS time. The AI then
      // decides whether the actual result of THIS game extends or breaks
      // the trend (it has the live boxscore — we don't pre-bake the spin).
      if (s.team1LostLastMeeting) {
        prompt += `\n  • REVENGE ANGLE AVAILABLE: ${ctx.team1FullName} lost to ${ctx.team2FullName} the last time these two played (${s.lastMeeting.year}). If ${ctx.team1FullName} wins this game, "avenged last year's loss" / "got revenge" / "exorcised last season's ghosts" is a legitimate framing. If ${ctx.team1FullName} loses again, "couldn't reverse last year's outcome" / "swept again" works.`
      }
      if (s.team2LostLastMeeting) {
        prompt += `\n  • REVENGE ANGLE AVAILABLE: ${ctx.team2FullName} lost to ${ctx.team1FullName} the last time these two played (${s.lastMeeting.year}). If ${ctx.team2FullName} wins this game, "avenged last year's loss" / "got their revenge" applies. If ${ctx.team2FullName} loses again, "couldn't avenge it" works.`
      }
      if (s.currentStreak) {
        prompt += `\n  • CURRENT STREAK: ${s.currentStreak.winner} has won ${s.currentStreak.count} straight against ${s.currentStreak.winner === ctx.team1FullName ? ctx.team2FullName : ctx.team1FullName}. If that team wins again here, "extended their dominance to ${s.currentStreak.count + 1} straight"; if the streak breaks, "snapped a ${s.currentStreak.count}-game skid in the series."`
      }
      if (!s.currentStreak && (s.team1Wins > 0 || s.team2Wins > 0) && s.totalMeetings >= 3) {
        prompt += `\n  • Series record across visible history: ${ctx.team1FullName} ${s.team1Wins}, ${ctx.team2FullName} ${s.team2Wins}.`
      }
    }
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
      prompt += `\n${ctx.team1FullName} Recent Bowl/CFP History:`
      ctx.team1BowlHistory.forEach(h => {
        const opponentName = getTeamName(h.opponent) || h.opponent
        prompt += `\n  ${h.year}: ${h.result} vs ${opponentName} ${h.score} (${h.gameName})`
      })
    }
    if (ctx.team2BowlHistory && ctx.team2BowlHistory.length > 0) {
      prompt += `\n${ctx.team2FullName} Recent Bowl/CFP History:`
      ctx.team2BowlHistory.forEach(h => {
        const opponentName = getTeamName(h.opponent) || h.opponent
        prompt += `\n  ${h.year}: ${h.result} vs ${opponentName} ${h.score} (${h.gameName})`
      })
    }
  }

  // Add past season records for both teams
  // Per-season game logs with box-score highlights. Replaces the old W-L
  // summary (which is now derivable from the logs themselves). Gives the AI
  // concrete, game-by-game evidence for claims like "first ranked-team win in
  // three seasons" or "the same QB who threw for 312 yards in last year's bowl."
  const renderTeamGameLogs = (logs, teamFullName) => {
    if (!logs || logs.length === 0) return

    prompt += `\n
===========================================
PRIOR SEASON GAME LOGS — ${teamFullName.toUpperCase()}
(past ${logs.length} season${logs.length !== 1 ? 's' : ''} — each game listed chronologically)
===========================================
Use this data to support specific historical comparisons. Do NOT invent results
that are not listed here. If a game has no stats line, only the score is known.`

    logs.forEach(season => {
      const wins   = season.games.filter(g => g.result === 'W').length
      const losses = season.games.filter(g => g.result === 'L').length
      prompt += `\n\n── ${season.year} (${wins}-${losses}) ──`

      season.games.forEach(g => {
        const oppName = getTeamName(g.opponent) || g.opponent || '?'
        const rankStr  = g.oppRank ? `#${g.oppRank} ` : ''
        const locStr   = g.location === 'away' ? '@ ' : g.location === 'neutral' ? 'vs (N) ' : 'vs '
        const wkLabel  = g.gameTypeLabel
          ? g.gameTypeLabel
          : (g.week != null ? `Wk ${g.week}` : '?')

        // Stat highlights — only shown when box score data exists
        const statParts = []
        if (g.passer)   statParts.push(`QB: ${g.passer}`)
        if (g.rusher)   statParts.push(`RB: ${g.rusher}`)
        if (g.receiver) statParts.push(`WR: ${g.receiver}`)
        const statStr = statParts.length > 0 ? `  | ${statParts.join(', ')}` : ''

        prompt += `\n  ${g.result} ${g.teamScore ?? '?'}-${g.oppScore ?? '?'}  ${locStr}${rankStr}${oppName}  [${wkLabel}${g.isConference ? ', conf' : ''}]${statStr}`
      })
    })
  }

  const hasAnyLogs = (ctx.team1SeasonGameLogs?.length > 0) || (ctx.team2SeasonGameLogs?.length > 0)
  if (hasAnyLogs) {
    renderTeamGameLogs(ctx.team1SeasonGameLogs, ctx.team1FullName)
    renderTeamGameLogs(ctx.team2SeasonGameLogs, ctx.team2FullName)
  } else if ((ctx.team1SeasonHistory?.length > 0) || (ctx.team2SeasonHistory?.length > 0)) {
    // Fallback to W-L summary when no per-game logs exist (e.g. dynasty has
    // no tracked games from prior seasons)
    prompt += `\n
===========================================
PAST SEASON RECORDS
===========================================`
    ctx.team1SeasonHistory?.forEach(s => {
      prompt += `\n${ctx.team1FullName} ${s.year}: ${s.wins}-${s.losses} overall${s.confWins || s.confLosses ? `, ${s.confWins}-${s.confLosses} conf` : ''}`
    })
    ctx.team2SeasonHistory?.forEach(s => {
      prompt += `\n${ctx.team2FullName} ${s.year}: ${s.wins}-${s.losses} overall${s.confWins || s.confLosses ? `, ${s.confWins}-${s.confLosses} conf` : ''}`
    })
  }

  // Add prior year postseason results — paired with prior-year final ranking
  // as a setup/contrast tool. The previous version of this section said
  // "optional context, only mention if it naturally fits" and the AI
  // overwhelmingly skipped it. The user explicitly asked for things like
  // "After nearly winning the natty last season, Ole Miss has struggled to
  // recapture that same form" — which requires actively comparing prior peak
  // to current trajectory. This section now actively instructs the AI to
  // build that comparison.
  if (ctx.team1PriorPostseason || ctx.team2PriorPostseason || ctx.team1PriorYearFinalRank || ctx.team2PriorYearFinalRank) {
    const priorYear = Number(ctx.year) - 1
    prompt += `\n
===========================================
PRIOR-SEASON CONTEXT (${priorYear} season — last year)
===========================================
USE THIS ACTIVELY. A strong recap lede or early body paragraph contrasts where each team WAS (last year's finish) with where they ARE (this year's trajectory in the SEASON RECORD section below). Do not bury this — it's how readers locate stakes.

The kinds of framing this section unlocks (drop in verbatim or paraphrase, only when the data supports it):
  • "After [last year's deep run], Team X has [this year's record/streak]..."
  • "Coming off [bowl loss], Team Y looked to [this game's result]..."
  • "A year removed from playing for the title, Ole Miss is now [W-L]..."
  • "The defending [bowl/national] champions [extended/lost]..."
  • Contrast plays: a team that finished top-5 last year and is now scuffling deserves a "fall from grace" beat. A team that finished unranked and is now ranked deserves the "leap forward" beat.

Required: if a team has a NOTABLE prior-year finish (top-15 final ranking, CFP appearance, or a bowl win/loss), you must reference it at least once in your recap unless the live game is so dominant a storyline that historical framing would dilute it.`

    const renderPriorContext = (teamName, finalRank, prior) => {
      const bits = []
      if (finalRank) bits.push(`finished ${priorYear} ranked #${finalRank} in the final poll`)
      if (prior?.narrativeCue) bits.push(prior.narrativeCue)
      else if (prior) {
        const oppName = getTeamName(prior.opponent) || prior.opponent
        bits.push(`${prior.result === 'W' ? 'won' : 'lost'} ${prior.gameName} ${prior.score} vs ${oppName}`)
      }
      if (bits.length === 0) return null
      let line = `\n${teamName} (${priorYear}): ${bits.join('; ')}`
      if (prior?.wonNationalChampionship) line += ` — DEFENDING NATIONAL CHAMPIONS this season`
      else if (prior?.lostNationalChampionship) line += ` — came one game shy of the title`
      return line
    }

    const t1Line = renderPriorContext(ctx.team1FullName, ctx.team1PriorYearFinalRank, ctx.team1PriorPostseason)
    const t2Line = renderPriorContext(ctx.team2FullName, ctx.team2PriorYearFinalRank, ctx.team2PriorPostseason)
    if (t1Line) prompt += t1Line
    if (t2Line) prompt += t2Line
  }

  // Recruiting class context — the class that BUILT this year's roster
  // (signed last cycle, arriving for this season) plus any in-progress
  // class signing during this season. Frames "supposed to be loaded"
  // expectation gaps the AI can contrast with the live record.
  if (ctx.team1IncomingClassRank || ctx.team2IncomingClassRank || ctx.team1NextCycleClassRank || ctx.team2NextCycleClassRank) {
    prompt += `\n
===========================================
RECRUITING CLASS CONTEXT
===========================================
Use this when the gap between recruiting hype and on-field results is wide enough to be a story. "After signing the #3 class last cycle, Texas was supposed to be loaded — instead they're 4-4." Or the inverse: "a top-15 class on top of last year's #4 class — the talent is there." For currently-signing classes, use language like "as the program leans into its #X class for next season..."`
    const renderClassLine = (teamName, incoming, nextCycle) => {
      const bits = []
      if (incoming) bits.push(`#${incoming} ${ctx.year} class arrived`)
      if (nextCycle) bits.push(`currently signing the #${nextCycle} ${Number(ctx.year) + 1} class`)
      if (bits.length === 0) return null
      return `\n${teamName}: ${bits.join('; ')}.`
    }
    const t1Class = renderClassLine(ctx.team1FullName, ctx.team1IncomingClassRank, ctx.team1NextCycleClassRank)
    const t2Class = renderClassLine(ctx.team2FullName, ctx.team2IncomingClassRank, ctx.team2NextCycleClassRank)
    if (t1Class) prompt += t1Class
    if (t2Class) prompt += t2Class
  }

  // Quality wins / bad losses — concrete record-quality anchors so the
  // AI doesn't have to derive "you've beaten 2 ranked teams" from a
  // long schedule list.
  const renderQualityLine = (teamName, qwl) => {
    if (!qwl) return null
    const lines = []
    if (qwl.qualityWins.length > 0) {
      const wins = qwl.qualityWins.map(w => {
        const oppName = getTeamName(w.opponentAbbr) || w.opponentAbbr
        const rankBit = w.opponentRank
          ? `#${w.opponentRank} at the time`
          : (w.opponentPriorYearRank ? `${w.opponentPriorYearRank > 0 ? `last year's #${w.opponentPriorYearRank}` : ''}` : '')
        const recBit = w.opponentRecord ? `, currently ${w.opponentRecord}` : ''
        return `Week ${w.week} W vs ${oppName} (${rankBit}${recBit})`
      }).join('; ')
      lines.push(`Quality wins: ${wins}.`)
    }
    if (qwl.badLosses.length > 0) {
      const losses = qwl.badLosses.map(l => {
        const oppName = getTeamName(l.opponentAbbr) || l.opponentAbbr
        return `Week ${l.week} L to ${oppName}${l.opponentRecord ? ` (${l.opponentRecord})` : ''}`
      }).join('; ')
      lines.push(`Bad losses: ${losses}.`)
    }
    if (lines.length === 0) return null
    return `\n${teamName}: ${lines.join(' ')}`
  }
  const t1QW = renderQualityLine(ctx.team1FullName, ctx.team1QualityWL)
  const t2QW = renderQualityLine(ctx.team2FullName, ctx.team2QualityWL)
  if (t1QW || t2QW) {
    prompt += `\n
===========================================
QUALITY WINS & BAD LOSSES (current season)
===========================================
REFERENCE DATA. You DO NOT need to mention these — they exist so you can anchor a single record-quality claim if it strengthens the story. Pull AT MOST ONE per team across the article (see Rule E). Skip entirely if neither team has a remarkable tally; don't manufacture quality.`
    if (t1QW) prompt += t1QW
    if (t2QW) prompt += t2QW
  }

  // Rivalry / trophy game — single line, only emitted when this is one
  // of the canonical FBS rivalries. Custom matchups silently skip.
  if (ctx.rivalryName) {
    prompt += `\n
===========================================
RIVALRY GAME
===========================================
This game is ${ctx.rivalryName}. Refer to it by that name at least once in the recap (lede or first body paragraph). Trophy/rivalry framing carries weight on its own — winning a rivalry game when you're 4-6 is a real story, and losing one when you're 9-1 is a real wound.`
  }

  // Season-long POW trail — flag when a player on either team has won
  // multiple POW awards across the season. Skips the noise (one-off
  // weekly winners) by only emitting players with 2+ total awards.
  if (Array.isArray(ctx.seasonPOWTrail) && ctx.seasonPOWTrail.length > 0) {
    const multiWinners = ctx.seasonPOWTrail.filter(p => p.total >= 2).slice(0, 12)
    if (multiWinners.length > 0) {
      prompt += `\n
===========================================
SEASON-LONG POW TRAIL (multi-time award winners through ${ctx.year})
===========================================
Use sparingly — only mention when one of these players appears in the box score from this game. Format: "X's third conference POW of the season."`
      for (const p of multiWinners) {
        const parts = []
        if (p.confOffense) parts.push(`${p.confOffense} conf offensive POW`)
        if (p.confDefense) parts.push(`${p.confDefense} conf defensive POW`)
        if (p.natlOffense) parts.push(`${p.natlOffense} national offensive POW`)
        if (p.natlDefense) parts.push(`${p.natlDefense} national defensive POW`)
        prompt += `\n  ${p.name}: ${parts.join(', ')}.`
      }
    }
  }

  // Both teams' current season results (week-by-week, compact form). For
  // user games, team1 already gets a detailed schedule in the SEASON
  // CONTEXT section above; we still emit team1 here for CPU games and as
  // a "fact-check" anchor that pins each team's record explicitly.
  const renderSeasonRecordList = (teamName, results) => {
    if (!results || results.length === 0) return
    const wins = results.filter(g => g.result === 'W').length
    const losses = results.filter(g => g.result === 'L').length
    prompt += `\n
===========================================
${teamName.toUpperCase()}'S SEASON RECORD: ${wins}-${losses}
(THIS IS THEIR ACTUAL RECORD - DO NOT ASSUME A DIFFERENT RECORD)
===========================================`
    results.forEach(g => {
      const oppName = getTeamName(g.opponent) || g.opponent
      prompt += `\n  Week ${g.week}: ${g.result} ${g.score} vs ${oppName}${g.isConferenceGame ? ' (conf)' : ''}`
    })
  }
  if (ctx.isCPUGame) {
    renderSeasonRecordList(ctx.team1FullName, ctx.team1SeasonResultsSummary)
  }
  renderSeasonRecordList(ctx.team2FullName, ctx.team2SeasonResults)

  // Rank progression — week-by-week trajectory across the season for
  // each team. Lets the AI characterize collapse / surge / freefall
  // beats from the actual data trail.
  const renderRankProgression = (teamName, prog) => {
    if (!prog || !Array.isArray(prog.entries) || prog.entries.length === 0) return null
    const trail = prog.entries.map(e => `Wk ${e.week}: #${e.rank}`).join(' → ')
    let line = `\n${teamName} rank trajectory: ${trail}.`
    if (prog.peak !== prog.low) {
      line += ` Peak: #${prog.peak} (Wk ${prog.peakWeek}). Low: #${prog.low} (Wk ${prog.lowWeek}).`
    }
    return line
  }
  const t1Prog = renderRankProgression(ctx.team1FullName, ctx.team1RankProgression)
  const t2Prog = renderRankProgression(ctx.team2FullName, ctx.team2RankProgression)
  if (t1Prog || t2Prog) {
    prompt += `\n
===========================================
RANK TRAJECTORY THIS SEASON
===========================================
REFERENCE DATA. Use ONLY when a team's trajectory is genuinely dramatic — a multi-week freefall, a sustained climb of 5+ spots, a fall out of the Top 25. Even then, characterize it ONCE in the article, not every paragraph. Flat trajectories or ordinary one-week shifts are not stories — skip them. Subject to Rule E's rank-movement cap (at most ONE such reference per article).`
    if (t1Prog) prompt += t1Prog
    if (t2Prog) prompt += t2Prog
  }

  // Conference standings — current position, leader, games back of leader.
  const renderConfStanding = (teamName, cs) => {
    if (!cs) return null
    const bits = [`${cs.positionLabel} in the ${cs.conference}`, `${cs.conferenceRecord} conf`, `${cs.overallRecord} overall`]
    if (cs.leaderTeam && cs.gamesBackOfLeader > 0) {
      bits.push(`${cs.gamesBackOfLeader} game${cs.gamesBackOfLeader === 1 ? '' : 's'} back of ${cs.leaderTeam} (${cs.leaderRecord})`)
    } else if (cs.position === 1 && !cs.sharedPosition) {
      bits.push('alone atop the conference')
    } else if (cs.position === 1 && cs.sharedPosition) {
      bits.push('tied for first')
    }
    return `\n${teamName}: ${bits.join('; ')}.`
  }
  const t1Cs = renderConfStanding(ctx.team1FullName, ctx.team1ConferenceStanding)
  const t2Cs = renderConfStanding(ctx.team2FullName, ctx.team2ConferenceStanding)
  if (t1Cs || t2Cs) {
    prompt += `\n
===========================================
CONFERENCE STANDINGS (entering this game)
===========================================
Use for race-implication framing — "the loss drops Tennessee to 5-2 in the SEC, two games back of Alabama"; "the win clinches at least a share of the SEC East"; "Texas is alone atop the Big 12 at 6-0." Skip if the implication isn't material to the result.`
    if (t1Cs) prompt += t1Cs
    if (t2Cs) prompt += t2Cs
  }

  // CFP projection slice for each team.
  const renderCFP = (teamName, slice) => {
    if (!slice) return null
    return `\n${teamName}: projected #${slice.seed} seed (${slice.bidLabel || slice.bid || 'at-large'})${slice.conference ? `, ${slice.conference}` : ''}.`
  }
  const t1Cfp = renderCFP(ctx.team1FullName, ctx.team1CFPProjection)
  const t2Cfp = renderCFP(ctx.team2FullName, ctx.team2CFPProjection)
  if (t1Cfp || t2Cfp) {
    prompt += `\n
===========================================
CFP PROJECTION (12-team field if season ended today)
===========================================
Use when the result moves a team in or out of the projected field — "Tennessee's loss likely drops them out of the projected bracket"; "Texas's win cements them as the projected #4 seed and a host." Don't reference projection if neither team's situation is materially affected.`
    if (t1Cfp) prompt += t1Cfp
    if (t2Cfp) prompt += t2Cfp
  }

  // Scoring-margin trend — anchors how lopsided this result is vs season norms.
  const renderMargin = (teamName, sm) => {
    if (!sm) return null
    const bits = []
    if (sm.wins > 0 && sm.avgWinMargin != null) bits.push(`${sm.wins}-win avg margin: +${sm.avgWinMargin}`)
    if (sm.losses > 0 && sm.avgLossMargin != null) bits.push(`${sm.losses}-loss avg margin: -${sm.avgLossMargin}`)
    if (sm.largestWinMargin && sm.largestWinOpp) {
      const oppName = getTeamName(sm.largestWinOpp) || sm.largestWinOpp
      bits.push(`largest win: ${sm.largestWinMargin} pts vs ${oppName}`)
    }
    if (sm.largestLossMargin && sm.largestLossOpp) {
      const oppName = getTeamName(sm.largestLossOpp) || sm.largestLossOpp
      bits.push(`largest loss: ${sm.largestLossMargin} pts to ${oppName}`)
    }
    if (sm.oneScoreWins + sm.oneScoreLosses > 0) bits.push(`${sm.oneScoreWins}-${sm.oneScoreLosses} in one-score games`)
    if (sm.blowoutWins + sm.blowoutLosses > 0) bits.push(`${sm.blowoutWins}-${sm.blowoutLosses} in 21+ blowouts`)
    if (bits.length === 0) return null
    return `\n${teamName}: ${bits.join('; ')}.`
  }
  const t1Margin = renderMargin(ctx.team1FullName, ctx.team1ScoringMargin)
  const t2Margin = renderMargin(ctx.team2FullName, ctx.team2ScoringMargin)
  if (t1Margin || t2Margin) {
    prompt += `\n
===========================================
SCORING-MARGIN TREND (entering this game)
===========================================
REFERENCE DATA. Mention ONLY when this game's margin is a genuine outlier vs the team's season norms ("their largest margin of the year", "their first one-score game in two months"). One reference at most, and only when it actually strengthens the storyline — not a routine inclusion.`
    if (t1Margin) prompt += t1Margin
    if (t2Margin) prompt += t2Margin
  }

  // Resume splits — record vs ranked / unranked / home / away.
  const renderResume = (teamName, splits) => {
    if (!splits) return null
    const bits = []
    if (splits.vsRanked.wins + splits.vsRanked.losses > 0) bits.push(`vs ranked: ${splits.vsRanked.wins}-${splits.vsRanked.losses}`)
    if (splits.vsUnranked.wins + splits.vsUnranked.losses > 0) bits.push(`vs unranked: ${splits.vsUnranked.wins}-${splits.vsUnranked.losses}`)
    if (splits.home.wins + splits.home.losses > 0) bits.push(`home: ${splits.home.wins}-${splits.home.losses}`)
    if (splits.away.wins + splits.away.losses > 0) bits.push(`away: ${splits.away.wins}-${splits.away.losses}`)
    if (splits.neutral.wins + splits.neutral.losses > 0) bits.push(`neutral: ${splits.neutral.wins}-${splits.neutral.losses}`)
    if (bits.length === 0) return null
    return `\n${teamName}: ${bits.join('; ')}.`
  }
  const t1Resume = renderResume(ctx.team1FullName, ctx.team1ResumeSplits)
  const t2Resume = renderResume(ctx.team2FullName, ctx.team2ResumeSplits)
  if (t1Resume || t2Resume) {
    prompt += `\n
===========================================
RESUME SPLITS (entering this game)
===========================================
REFERENCE DATA. Pull AT MOST ONE résumé claim per team if it strengthens a beat you're already writing — not as a standalone "by the way" mention. Subject to Rule E's résumé-claim cap. Skip entirely when the splits are unremarkable.`
    if (t1Resume) prompt += t1Resume
    if (t2Resume) prompt += t2Resume
  }

  // Statistical matchup — both teams' season-to-date offensive AND
  // defensive averages, side by side. This is the matchup-framing
  // data the AI needs for "Tennessee's offense averaged 38 ppg coming
  // in; South Carolina's defense had been allowing 31" leads.
  const renderProfile = (teamName, p) => {
    if (!p) return null
    const bits = []
    if (p.ppgFor != null) bits.push(`${p.ppgFor} PPG for`)
    if (p.ppgAgainst != null) bits.push(`${p.ppgAgainst} PPG against`)
    if (p.ydsForPerGame != null) bits.push(`${p.ydsForPerGame} total yds/g for`)
    if (p.ydsAgainstPerGame != null) bits.push(`${p.ydsAgainstPerGame} total yds/g against`)
    if (p.passYdsForPerGame != null) bits.push(`pass: ${p.passYdsForPerGame}/g for vs ${p.passYdsAgainstPerGame ?? '-'}/g against`)
    if (p.rushYdsForPerGame != null) bits.push(`rush: ${p.rushYdsForPerGame}/g for vs ${p.rushYdsAgainstPerGame ?? '-'}/g against`)
    if (typeof p.turnoverMargin === 'number') bits.push(`TO margin: ${p.turnoverMargin > 0 ? '+' : ''}${p.turnoverMargin}`)
    if (bits.length === 0) return null
    return `\n${teamName}: ${bits.join('; ')}.`
  }
  const t1Prof = renderProfile(ctx.team1FullName, ctx.team1SeasonProfile)
  const t2Prof = renderProfile(ctx.team2FullName, ctx.team2SeasonProfile)
  if (t1Prof || t2Prof) {
    prompt += `\n
===========================================
STATISTICAL MATCHUP (both teams' season-to-date averages)
===========================================
Use for matchup leads when one team's strength faces the other's weakness ("Tennessee's #2 scoring offense met a South Carolina defense that had been giving up 31 a game"). When the result subverts the matchup expectation (high-PPG offense scoring 14, stout defense giving up 50), the GAP itself is the story. Skip if both profiles are unremarkable.`
    if (t1Prof) prompt += t1Prof
    if (t2Prof) prompt += t2Prof
  }

  // Coach-vs-coach historical record — only counts games where this
  // exact HC pair faced each other.
  if (ctx.coachHeadToHead) {
    const c = ctx.coachHeadToHead
    if (c.isFirstMeeting) {
      prompt += `\n
===========================================
COACH HEAD-TO-HEAD HISTORY
===========================================
First meeting between ${c.coach1Name} (${ctx.team1FullName}) and ${c.coach2Name} (${ctx.team2FullName}). When the article would land "for the first time as opposing head coaches" naturally, use it.`
    } else if (c.totalMeetings >= 1) {
      const dom = c.coach1Wins === c.coach2Wins
        ? `dead even at ${c.coach1Wins}-${c.coach2Wins}`
        : c.coach1Wins > c.coach2Wins
          ? `${c.coach1Name} leads ${c.coach1Wins}-${c.coach2Wins}`
          : `${c.coach2Name} leads ${c.coach2Wins}-${c.coach1Wins}`
      prompt += `\n
===========================================
COACH HEAD-TO-HEAD HISTORY
===========================================
${c.coach1Name} (${ctx.team1FullName}) vs ${c.coach2Name} (${ctx.team2FullName}) — ${dom} across ${c.totalMeetings} prior meeting${c.totalMeetings === 1 ? '' : 's'}. Use when the result extends or breaks the trend ("the third straight time Saban's beaten him"; "Heupel finally gets one").`
    }
  }

  // Per-player season-high flags from this game's box score.
  if (ctx.playerSeasonHighFlags && Object.keys(ctx.playerSeasonHighFlags).length > 0) {
    const lines = []
    for (const [name, flags] of Object.entries(ctx.playerSeasonHighFlags)) {
      const bits = []
      const labels = {
        passYds: 'passing yards',
        rushYds: 'rushing yards',
        recYds: 'receiving yards',
        tackles: 'tackles',
        sacks: 'sacks',
        ints: 'interceptions',
      }
      for (const [statKey, label] of Object.entries(labels)) {
        if (flags[`${statKey}IsSeasonHigh`]) {
          const prev = flags[`${statKey}PrevHigh`]
          bits.push(prev != null ? `season high ${label} (prev: ${prev})` : `season high ${label}`)
        } else if (flags[`${statKey}IsFirstSeason`]) {
          // First time we have a stat-line of this type for this player —
          // not necessarily a "high" but still notable for new arrivals.
        }
      }
      if (bits.length > 0) lines.push(`  ${name}: ${bits.join('; ')}`)
    }
    if (lines.length > 0) {
      prompt += `\n
===========================================
PLAYER SEASON-HIGH FLAGS (this game vs prior games this season)
===========================================
Use when a player on the box score posted a season high in a featured stat — "career-high 287 yards" / "his third straight 100-yard game" / "matched his season best with three sacks." Don't crown every line; pull the ones that anchor the storyline you're already telling.\n${lines.join('\n')}`
    }
  }

  // Conference race context — current standings + remaining conf
  // games + leader's record for both teams.
  const renderConfRace = (teamName, r) => {
    if (!r) return null
    const bits = [`${r.conferenceRecord} in the ${r.conference}`]
    if (r.remainingConfGames > 0) {
      bits.push(`${r.remainingConfGames} conf game${r.remainingConfGames === 1 ? '' : 's'} remaining (${r.remainingOpponents.join(', ')})`)
    } else {
      bits.push('conference schedule complete')
    }
    if (r.leaderTeam) {
      bits.push(`leader: ${r.leaderTeam} ${r.leaderConfRecord}`)
    }
    return `\n${teamName}: ${bits.join('; ')}.`
  }
  const t1Race = renderConfRace(ctx.team1FullName, ctx.team1ConferenceRace)
  const t2Race = renderConfRace(ctx.team2FullName, ctx.team2ConferenceRace)
  if (t1Race || t2Race) {
    prompt += `\n
===========================================
CONFERENCE-RACE & CCG IMPLICATIONS
===========================================
Use to thread title-game implications through the result: "with two conf losses and just two conf games left, Tennessee likely needs to win out and hope Bama drops one"; "the win clinches the SEC East with a game to spare." Reason from the data — current losses + games remaining + leader — without inventing tiebreaker rules. If the team is mathematically eliminated from CCG (more conf losses than the leader has plus all remaining wins can overcome), say so plainly.`
    if (t1Race) prompt += t1Race
    if (t2Race) prompt += t2Race
  }

  // Add player performance trends (hot streaks, bounce backs)
  if ((ctx.team1PlayerTrends && ctx.team1PlayerTrends.length > 0) || (ctx.team2PlayerTrends && ctx.team2PlayerTrends.length > 0)) {
    prompt += `\n
===========================================
PLAYER PERFORMANCE TRENDS
===========================================
Use these to add narrative about players "keeping it rolling" or "bouncing back"`
    if (ctx.team1PlayerTrends && ctx.team1PlayerTrends.length > 0) {
      prompt += `\n\n${ctx.team1FullName} Players:`
      ctx.team1PlayerTrends.forEach(p => {
        prompt += `\n  ${p.player}${p.position ? ` (${p.position})` : ''}${p.trend ? ` - ${p.trend}` : ''}:`
        p.recentGames.forEach(g => {
          const oppName = getTeamName(g.opponent) || g.opponent
          prompt += `\n    Week ${g.week} vs ${oppName}: ${g.stats}`
        })
      })
    }
    if (ctx.team2PlayerTrends && ctx.team2PlayerTrends.length > 0) {
      prompt += `\n\n${ctx.team2FullName} Players:`
      ctx.team2PlayerTrends.forEach(p => {
        prompt += `\n  ${p.player}${p.position ? ` (${p.position})` : ''}${p.trend ? ` - ${p.trend}` : ''}:`
        p.recentGames.forEach(g => {
          const oppName = getTeamName(g.opponent) || g.opponent
          prompt += `\n    Week ${g.week} vs ${oppName}: ${g.stats}`
        })
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

  // Inject length/depth directive when the user has set a non-default depth.
  // Appended AFTER writing instructions so it overrides any conflicting length
  // guidance in the default instructions block.
  const depthOpt = depth ? RECAP_DEPTH_OPTIONS.find(d => d.key === depth) : null
  if (depthOpt) {
    prompt += `\n
===========================================
LENGTH / DEPTH DIRECTIVE — follow precisely
===========================================
${depthOpt.directive}
${depthOpt.wordTarget
  ? `Target word count: ${depthOpt.wordTarget} words. Treat this as a hard constraint — do not write significantly more or fewer words than the range.`
  : 'Treat the single-sentence constraint as absolute — there is no word count range because the output is exactly one sentence.'
}`
  }

  return prompt
}


/**
 * Build the full prompt for a game recap (for copying to external AI).
 *
 * Backwards compatible: the third arg can still be a customInstructions
 * string. To use the perspective slider, pass an options object instead:
 *   getFullRecapPrompt(dynasty, game, { perspective: 'team1Fan' })
 *   getFullRecapPrompt(dynasty, game, { perspective: 'neutral', customInstructions: '...' })
 *
 * @param {object} dynasty - The dynasty data
 * @param {object} game - The game data
 * @param {string|object} optionsOrCustomInstructions - Either an options object
 *   { perspective?, customInstructions? } OR a raw customInstructions string
 *   (legacy signature).
 * @returns {string} The full prompt text ready to paste into any AI
 */
export function getFullRecapPrompt(dynasty, game, optionsOrCustomInstructions = null) {
  const context = buildGameRecapContext(dynasty, game)

  // Normalize the third arg. String = legacy customInstructions. Object = new options.
  let customInstructions = null
  let perspective = null
  let depth = null
  if (typeof optionsOrCustomInstructions === 'string') {
    customInstructions = optionsOrCustomInstructions
  } else if (optionsOrCustomInstructions && typeof optionsOrCustomInstructions === 'object') {
    customInstructions = optionsOrCustomInstructions.customInstructions || null
    perspective = optionsOrCustomInstructions.perspective || null
    depth = optionsOrCustomInstructions.depth || null
  }

  // Perspective wins over customInstructions when both are provided —
  // perspective is the user-facing slider, customInstructions is the
  // internal extensibility hook nobody uses today.
  if (perspective && perspective !== 'neutral') {
    customInstructions = getRecapInstructionsForPerspective(perspective, context) || customInstructions
  }

  return buildGameRecapPrompt(context, customInstructions, perspective, depth)
}
