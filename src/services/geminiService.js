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
import { getUserGamePerspective, getLockedCoachingStaff, getCustomConferencesForYear } from '../context/DynastyContext'

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
function buildEnhancedPlayerHighlights(boxScore, side, players, allGames, year, currentGameOrder, teamAbbr) {
  const highlights = {
    passing: [],
    rushing: [],
    receiving: [],
    defense: [],
    kicking: []
  }

  // Extract passing leaders with enhanced context
  // Note: Box score from sheets uses: comp, attempts, yards, tD, iNT (camelCase from headers)
  if (boxScore[side]?.passing?.length > 0) {
    const passers = boxScore[side].passing.filter(p => (p.attempts || p.att) > 0)
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
  if (boxScore[side]?.rushing?.length > 0) {
    const rushers = boxScore[side].rushing.filter(p => (p.carries || p.car) > 0).slice(0, 3)
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
  if (boxScore[side]?.receiving?.length > 0) {
    const receivers = boxScore[side].receiving.filter(p => (p.receptions || p.rec) > 0).slice(0, 3)
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
  // Note: Box score from sheets uses: fGM, fGA, fGLong (camelCase from headers like 'FGM', 'FGA', 'FG Long')
  if (boxScore[side]?.kicking?.length > 0) {
    boxScore[side].kicking.forEach(p => {
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
    const oppPriorRank = (oppAbbr && getTeamFinalRank(dynasty, oppAbbr, yearNum - 1))
      || (oppTid != null && getTeamFinalRank(dynasty, oppAbbr || null, yearNum - 1))
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

  return results.sort((a, b) => (a.week || 0) - (b.week || 0))
}

/**
 * Get performance trends for players in the box score
 * Shows if players are on hot streaks, bouncing back, etc.
 */
function getPlayerPerformanceTrends(boxScore, side, players, allGames, year, currentGameOrder, dynasty = null) {
  const trends = []

  // Get all players from this side of the box score
  const playerNames = new Set()
  for (const category of ['passing', 'rushing', 'receiving', 'defense']) {
    const entries = boxScore?.[side]?.[category] || []
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

  // Determine teams and scores based on game type
  // CRITICAL: For user games, team1 MUST be user's team and team2 MUST be opponent
  // because boxScore.home ALWAYS contains user's stats regardless of location
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

  // Check for ranked matchup and upset
  // All games use unified format with team1Rank/team2Rank
  const team1Ranking = game.team1Rank
  const team2Ranking = game.team2Rank
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

  // Determine which box score side has which team's stats. Tid-based via
  // game.homeTeamTid (canonical) so a teambuilder team renamed mid-dynasty
  // still attributes pre-rename game stats to the right side. Abbr fallback
  // for legacy games where homeTeamTid isn't stored.
  let team1Side = 'home'
  let team2Side = 'away'

  if (game.boxScore?.teamStats) {
    const homeTid = game.homeTeamTid != null ? Number(game.homeTeamTid) : null
    const t1Tid = team1Tid != null ? Number(team1Tid) : null
    if (homeTid != null && t1Tid != null) {
      // team1 is on the home side iff its tid matches homeTeamTid
      if (homeTid === t1Tid) {
        team1Side = 'home'; team2Side = 'away'
      } else {
        team1Side = 'away'; team2Side = 'home'
      }
    } else {
      // Legacy abbr path
      const homeAbbr = game.boxScore.teamStats.home?.teamAbbr?.toUpperCase()
      const awayAbbr = game.boxScore.teamStats.away?.teamAbbr?.toUpperCase()
      if (homeAbbr && awayAbbr && awayAbbr === team1?.toUpperCase()) {
        team1Side = 'away'; team2Side = 'home'
      }
    }
  }

  // Extract box score stats with enhanced player context
  let boxScoreContext = null
  if (game.boxScore) {
    boxScoreContext = {
      team1: buildEnhancedPlayerHighlights(game.boxScore, team1Side, players, allGames, year, thisGameOrder, team1),
      team2: buildEnhancedPlayerHighlights(game.boxScore, team2Side, players, allGames, year, thisGameOrder, team2),
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

  // NEW: Get player performance trends from box score (using determined sides)
  let team1PlayerTrends = []
  let team2PlayerTrends = []
  if (game.boxScore) {
    team1PlayerTrends = getPlayerPerformanceTrends(game.boxScore, team1Side, players, allGames, year, thisGameOrder, dynasty)
    team2PlayerTrends = getPlayerPerformanceTrends(game.boxScore, team2Side, players, allGames, year, thisGameOrder, dynasty)
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
    // about rank movement ("Tennessee fell to #15 after the loss").
    team1Ranking,
    team2Ranking,
    // PRE-GAME (entering) ranks — derived by reading each team's most
    // recent prior game's stored rank. Use these to describe the
    // matchup itself ("the #4 team faced the #11 team"). null when the
    // team had no prior game with a stored rank this year.
    team1EnteringRank: getTeamEnteringRank(allGames, team1, year, thisGameOrder, dynasty),
    team2EnteringRank: getTeamEnteringRank(allGames, team2, year, thisGameOrder, dynasty),

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

    // Team stats (first downs, turnovers, 3rd down, possession, etc.)
    // Swap home/away to match team1/team2 order when user is team2 in unified format
    teamStats: game.boxScore?.teamStats ? {
      home: game.boxScore.teamStats[team1Side] || {},
      away: game.boxScore.teamStats[team2Side] || {}
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
 * IMPORTANT: For user games, boxScore.home ALWAYS contains user's stats regardless of location
 */
function extractBoxScoreHighlightsForBothTeams(boxScore, team1, team2, game) {
  // boxScore.home always contains team1 (user's team for user games, team1 for CPU games)
  // boxScore.away always contains team2 (opponent for user games, team2 for CPU games)
  const team1Side = 'home'
  const team2Side = 'away'

  return {
    team1: extractHighlightsForSide(boxScore, team1Side),
    team2: extractHighlightsForSide(boxScore, team2Side),
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
// DEFAULT WRITING INSTRUCTIONS TEMPLATE
// ============================================

/**
 * Default writing instructions for game recaps
 * Placeholder [HOME_TEAM] will be replaced with the actual home team at generation time
 */
export const DEFAULT_GAME_RECAP_INSTRUCTIONS = `You are writing a professional game recap article — top-byline quality, the kind of work that runs at The Athletic, ESPN, or Sports Illustrated. Treat this as serious sportswriting, not a chat reply.

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
VOICE & STYLE — write like a top byline, not a fan
═══════════════════════════════════════════════════════════
Write like Stewart Mandel, Andy Staples, Pat Forde, or Heather Dinich at The Athletic / Yahoo Sports — confident, opinionated, willing to advance a thesis, conversational without being sloppy. NOT AP wire copy. NOT a list of plays stitched with verbs. Top reporters argue something. So do you.

- Open with a SPECIFIC moment, fact, or stat — not "In a thrilling matchup..." or "It was a game for the ages." Show the drama through what actually happened.
- Vary sentence length. Short for impact. Long for context. Avoid metronome rhythm.
- Active voice. "Garrett threw 27 of 35" — not "27 of 35 passes were thrown by Garrett."
- After first reference, use last names. Don't repeat full names every sentence.
- Numbers under 10 are written as words ("three touchdowns") EXCEPT in stat lines where digits read better ("4-of-5," "27 of 35," "62 yards"). Scores, years, and rankings are always digits.
- Cut clichés ruthlessly: hard-fought, tough as nails, fought tooth and nail, dug deep, left it all on the field, gritty, gutsy, must-win, statement game, signature win (unless the data shows the explicit ranked-vs-ranked context that earns the phrase).
- Skip throwaway transitions like "Meanwhile," "On the other side of the ball," "All in all," "At the end of the day."
- Don't tell the reader the game was exciting. Show it through plays and numbers.
- One precise verb beats two adverbs. Reach for the right word.

═══════════════════════════════════════════════════════════
RULE A — THE LEDE MUST ARGUE SOMETHING (mandatory)
═══════════════════════════════════════════════════════════
Your first sentence is a CLAIM about THIS GAME, not a description of the score.

❌ ANTI-PATTERN (forbidden):
   "In a thrilling matchup at Neyland Stadium, Tennessee fell 38-35 to South Carolina."
   "Saturday produced fireworks in Columbia."
   "South Carolina pulled off the upset of the week."

✅ PRO-PATTERN (this is what The Athletic writes):
   "Tennessee's title hopes died in Columbia, but the obituary started writing itself a month ago."
   "South Carolina played the role of executioner Saturday — 38-35 over a #6 Tennessee team that no longer looks like one."
   "Three turnovers in the first half, a fourth-quarter interception that sealed it: Tennessee's collapse from #2 to also-ran took only six weeks."

These openings advance a CLAIM. They name the tension. They force the reader forward. NEVER open with "In a thrilling matchup", "It was a battle", "Saturday saw", or any variant.

═══════════════════════════════════════════════════════════
RULE B — BANNED VERB LIST. NO VERB MORE THAN TWICE.
═══════════════════════════════════════════════════════════
These are AI-tells: "rolled", "drilled", "flattened", "crushed", "edged", "topped", "hammered", "handled", "dropped" (as in "dropped 52 on"). Use any of them at most TWICE per article. Vary your result language by what the data shows:
   • Lopsided + early: "made an example of", "ran out of patience with", "dictated terms from the opening drive"
   • Lopsided + late: "buried late", "pulled away in the third"
   • One-score: "survived", "outlasted", "stole one in", "needed a fourth-quarter touchdown to put away"
   • Upset: "stunned", "took down", "ambushed", "ended the playoff dream"

═══════════════════════════════════════════════════════════
RULE C — PRIOR-YEAR & COACHING CONTEXT IS HARD-REQUIRED
═══════════════════════════════════════════════════════════
If either team finished TOP-10 LAST YEAR or PLAYED IN THE CFP last year, their prior-year finish must be referenced when you describe them. This is a hard rule, not a suggestion.

Same for coaching tenure when the data block flags a "Framing cue": first-year coach, hot-seat year four, era-builder year three+. If a Framing cue exists and would land naturally, USE IT.

THE FAILURE MODE we are eliminating: a previous Texas-Ole Miss recap mentioned the 52-20 score and dropped Ole Miss. Ole Miss had finished #4 the prior year and made the CFP semifinal — a fact in the prompt's PRIOR-SEASON CONTEXT block. The recap was dead air on the angle that made the result interesting ("a year removed from playing for the title, Ole Miss took a 52-20 beating"). DO NOT DO THIS. If the prior-year context is in the prompt, surface it.

═══════════════════════════════════════════════════════════
RULE D — POSITION THE GAME IN THE LARGER SEASON ARC
═══════════════════════════════════════════════════════════
A great game recap doesn't just describe the game — it positions the result in each team's season arc. Use the SEASON RECORD, current STREAK, prior-postseason context, and quality-wins/bad-losses tally we provide to anchor what this result MEANS for each team.

Examples of arc-positioning lines (each one earned by the data block):
   • "The win pushes the Volunteers to 8-1 and into the heart of the playoff conversation."
   • "It's Mississippi State's third bad loss this year — the Bulldogs are now 4-7, and the bowl door is closing."
   • "Coach Kelly is now 2-8 in his second year. The seat is no longer warm."
   • "A year after losing the National Championship Game, Georgia is back to 9-1 and quietly building another at-large case."

═══════════════════════════════════════════════════════════
MANDATORY SELF-CRITIQUE PASS BEFORE YOU SEND
═══════════════════════════════════════════════════════════
Read your draft top to bottom and answer each question HONESTLY. If any answer is no, REWRITE before sending.

   1. Does my lede ARGUE something? (Not "describe", not "announce" — argue.)
   2. Did I use prior-year context for either team if they finished top-10 last year or played in the CFP?
   3. Did I use the coaching framing cue when the data block provided one?
   4. Did I use any banned verb (rolled, drilled, flattened, crushed, edged, topped, hammered, handled, dropped) more than twice?
   5. Did I position THIS RESULT in each team's larger season arc, or did I describe the game in isolation?
   6. Did I cite at least one specific concrete play or stat per major beat, or am I summarizing in generalities?

If any check fails, rewrite the offending paragraph. Do not send a draft that hasn't passed every one.

OUTPUT WRAPPER — READ THIS FIRST:
Your ENTIRE response must be wrapped in a single fenced code block so the user can copy the raw markdown out of the chat UI without losing the formatting markers. That means:

- The very first line of your response is exactly: \`\`\`markdown
- Every line of the article goes between the fences
- The very last line of your response is exactly: \`\`\`
- Output NOTHING outside the fences — no preamble like "Here you go:", no notes, no follow-up offer to revise. Anything outside the fences ends up pasted into the user's tracker as garbage.
- Do NOT add additional code fences inside the article. The outer fence is the only one.

FORMAT (the markdown that goes INSIDE the fence):
- Start with a strong headline on its own line as a level-1 markdown heading (e.g., "# Talley, Brink Lift No. 5 Wisconsin Past No. 8 Penn State in Wild Final Minute")
- Begin the article body with a dateline in EXACTLY this format: City, State — (two-letter state abbreviation, a space, then a true em-dash "—", then a space, then the first sentence). Do NOT use a period, a hyphen, or an en-dash between the dateline and the first sentence — it MUST be the em-dash character "—". Examples: "Madison, WI — The Badgers..." or "Tuscaloosa, AL — Alabama jumped out...". Use the home team's city. For neutral site games (bowls, CFP, conference championships), omit the dateline.
- For longer articles with rich data, use level-2 markdown subheadings to break up sections (e.g., "## Early fireworks and a heavyweight feel", "## Fourth-quarter chaos: lead changes and clutch plays")
- Use **bold** for pivotal moments, decisive plays, and standout stat lines — things you want the reader's eye to land on. Examples: **"Shembo completed 27 of 28 passes for 266 yards and three touchdowns"**, **the 48-yard field goal with 0:03 left**. Don't over-bold — 3 to 8 boldings across the whole article is the sweet spot.
- Use *italic* sparingly, for a quoted phrase, a team nickname on first mention, or a moment of narrative emphasis. Skip it if you're not sure.
- Use these markdown markers only. Do not use bullet lists, tables, links, inner code fences, or any other markdown syntax. Separate paragraphs with a blank line.

USING THE DATA:
- Use the SCORING SUMMARY to walk through scoring plays chronologically with times and running scores
- Call out EXACT stat lines throughout: "Shembo completed 27 of 28 passes for 266 yards and three touchdowns with no interceptions, posting a 211.5 passer rating"
- Include yards per carry, yards per attempt, completion percentage when the numbers are notable
- Use records/schedule context for big-picture framing (e.g., "The win moves Wisconsin to 8-1 overall and 6-0 in Big Ten play")
- Only mention rankings if explicitly shown - don't assume teams are ranked based on reputation
- Player stat lines show class + position in brackets like "[RS Fr HB, Kentucky Wildcats]". This bracket tag is INPUT METADATA — it is for your reference only. NEVER copy the bracket tag into the article text. When you mention a player's year or position in prose, render it as natural English words: "redshirt freshman running back Frank Hall", "Hall, a redshirt freshman", or "freshman halfback Frank Hall ran for 38 yards". Class abbreviations: Fr = freshman, RS Fr = redshirt freshman, So = sophomore, RS So = redshirt sophomore, Jr = junior, RS Jr = redshirt junior, Sr = senior, RS Sr = redshirt senior. Position abbreviations: QB = quarterback, HB = running back (or "halfback"), FB = fullback, WR = wide receiver, TE = tight end, K = kicker, P = punter, plus the various OL/DL/LB/DB tags. Never guess a player's year or position — if no bracket tag is given for a player, omit those descriptors for them entirely. Critically: do NOT write "Frank Hall [RS Fr HB] carried 11 times" — that is wrong; write "Redshirt freshman running back Frank Hall carried 11 times" or just "Frank Hall carried 11 times" if you don't need to reference the year.

GAME FLOW:
When a scoring summary is provided, track the running score after each play to understand lead changes. Walk through the game quarter by quarter, describing how momentum shifted. A "comeback win" means a team was losing and then won.

ARTICLE STRUCTURE (for rich data):
1. Headline
2. Opening paragraph: Capture the drama - the key play, final score, what made this game special
3. Context paragraph: Records, standings, what this means for both teams
4. Section: The decisive moment or finish (with subheading)
5. Section: Key player performances with full stat lines (with subheading)
6. Section: Early game and how things developed (with subheading)
7. Section: Fourth quarter drama (with subheading if applicable)
8. Closing: Big-picture takeaway, what's next

PLAYER FOCUS:
Make players the centerpiece. Feature standout performances with FULL stat lines woven naturally: "Frisch ran 8 times for 48 yards and two touchdowns, averaging 6.0 yards per carry." Cover both teams' key players.

TEAM NAMES:
Write like a real journalist - use full team names ("Wisconsin", "Penn State") and nicknames ("the Badgers", "the Nittany Lions"). Vary your references for readability.

USER'S TEAM:
If a "USER'S TEAM PERSPECTIVE" section appears, frame the article from that team's perspective - they are the protagonist.

SCALING LENGTH:
- Rich data (scoring summary, box scores, quarter scores): Write a comprehensive article with subheadings, 10-20 paragraphs
- Moderate data (some stats, quarter scores): Write 4-8 paragraphs, no subheadings needed
- Limited data (just final score): Write 2-3 short paragraphs focusing on the result and any available context

A shorter, accurate article is always better than a longer one padded with invented details. Before you submit, run the self-check above. Every fact ties to the data, every player name spelled correctly, no fabricated quotes, no fabricated plays, no clichés — top-byline quality only.`

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
${ctx.team1FullName} entering rank: ${ctx.team1EnteringRank ? `#${ctx.team1EnteringRank}` : 'UNRANKED'} → post-game rank: ${ctx.team1Ranking ? `#${ctx.team1Ranking}` : 'UNRANKED'}
${ctx.team2FullName} entering rank: ${ctx.team2EnteringRank ? `#${ctx.team2EnteringRank}` : 'UNRANKED'} → post-game rank: ${ctx.team2Ranking ? `#${ctx.team2Ranking}` : 'UNRANKED'}
(EA quirk: the rank shown next to a team in EA's schedule is the rank AFTER that game ended, NOT the rank coming in. The "entering rank" above is derived from each team's previous game's stored rank — that's what the team CARRIED INTO this matchup. Use the entering rank when describing the matchup itself ("the #4 team faced the #11 team"); use the post-game rank when describing rank movement after the result ("Tennessee fell to #15 after the loss").)
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

  // Add user team focus section (when this is the user's game, not a CPU vs CPU game)
  if (ctx.isUserGame && ctx.userTeamName) {
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

  // Add scoring summary (CRITICAL for game flow narrative)
  if (ctx.scoringSummary && ctx.scoringSummary.length > 0) {
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
    ctx.scoringSummary.forEach((play) => {
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
    if (ctx.scoringSummary.every((p) => quarterRankForFlow(p.quarter) <= 4)) {
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

  // Add team stats if available
  if (ctx.teamStats) {
    const home = ctx.teamStats.home || {}
    const away = ctx.teamStats.away || {}
    // For user games, home side is always user's stats regardless of location
    const homeTeamName = ctx.isCPUGame ? (getTeamName(home.teamAbbr) || home.teamAbbr || ctx.team1FullName) : ctx.team1FullName
    const awayTeamName = ctx.isCPUGame ? (getTeamName(away.teamAbbr) || away.teamAbbr || ctx.team2FullName) : ctx.team2FullName
    prompt += `\n
===========================================
TEAM STATISTICS
===========================================
                        ${homeTeamName}    ${awayTeamName}
First Downs:            ${home.firstDowns ?? '-'}         ${away.firstDowns ?? '-'}
Total Yards:            ${home.totalYards ?? home.totalOffense ?? '-'}       ${away.totalYards ?? away.totalOffense ?? '-'}
Rushing (ATT-YDS):      ${home.rushAttempts ?? '-'}-${home.rushYards ?? '-'}     ${away.rushAttempts ?? '-'}-${away.rushYards ?? '-'}
Passing (CMP-ATT-YDS):  ${home.completions ?? '-'}-${home.passAttempts ?? '-'}-${home.passingYards ?? home.passYards ?? '-'}   ${away.completions ?? '-'}-${away.passAttempts ?? '-'}-${away.passingYards ?? away.passYards ?? '-'}
Turnovers:              ${home.turnovers ?? '-'}         ${away.turnovers ?? '-'}
3rd Down:               ${home['3rdDownConv'] ?? '-'}/${home['3rdDownAtt'] ?? '-'}       ${away['3rdDownConv'] ?? '-'}/${away['3rdDownAtt'] ?? '-'}
Possession:             ${home.possMinutes ?? ''}:${String(home.possSeconds ?? '').padStart(2, '0')}      ${away.possMinutes ?? ''}:${String(away.possSeconds ?? '').padStart(2, '0')}`
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

    const team2Stats = ctx.boxScore.team2
    if (team2Stats) {
      prompt += `\n
===========================================
${team2Name.toUpperCase()} INDIVIDUAL STATS
(All players below play for ${team2Name})
===========================================`

      if (team2Stats.passing.length > 0) {
        prompt += `\n\n${team2Name.toUpperCase()} PASSING:`
        team2Stats.passing.forEach(p => { prompt += `\n${formatPlayerLine(p, team2Name)}` })
      }
      if (team2Stats.rushing.length > 0) {
        prompt += `\n\n${team2Name.toUpperCase()} RUSHING:`
        team2Stats.rushing.forEach(p => { prompt += `\n${formatPlayerLine(p, team2Name)}` })
      }
      if (team2Stats.receiving.length > 0) {
        prompt += `\n\n${team2Name.toUpperCase()} RECEIVING:`
        team2Stats.receiving.forEach(p => { prompt += `\n${formatPlayerLine(p, team2Name)}` })
      }
      if (team2Stats.defense.length > 0) {
        prompt += `\n\n${team2Name.toUpperCase()} DEFENSE:`
        team2Stats.defense.forEach(p => { prompt += `\n${formatPlayerLine(p, team2Name)}` })
      }
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
  if ((ctx.team1SeasonHistory && ctx.team1SeasonHistory.length > 0) || (ctx.team2SeasonHistory && ctx.team2SeasonHistory.length > 0)) {
    prompt += `\n
===========================================
PAST SEASON RECORDS
===========================================`
    if (ctx.team1SeasonHistory && ctx.team1SeasonHistory.length > 0) {
      prompt += `\n${ctx.team1FullName} Past Seasons:`
      ctx.team1SeasonHistory.forEach(s => {
        prompt += `\n  ${s.year}: ${s.wins}-${s.losses} overall${s.confWins || s.confLosses ? `, ${s.confWins}-${s.confLosses} conference` : ''}`
      })
    }
    if (ctx.team2SeasonHistory && ctx.team2SeasonHistory.length > 0) {
      prompt += `\n${ctx.team2FullName} Past Seasons:`
      ctx.team2SeasonHistory.forEach(s => {
        prompt += `\n  ${s.year}: ${s.wins}-${s.losses} overall${s.confWins || s.confLosses ? `, ${s.confWins}-${s.confLosses} conference` : ''}`
      })
    }
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
Use these as concrete record-quality anchors. A 7-3 team with 2 ranked wins and 0 bad losses is "quietly playing themselves into the at-large picture." A 7-3 team with 0 ranked wins and 1 bad loss "has the record but not the resume." If a team has neither, skip — don't manufacture quality.`
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

  return prompt
}


/**
 * Build the full prompt for a game recap (for copying to external AI)
 * @param {object} dynasty - The dynasty data
 * @param {object} game - The game data
 * @param {string} customInstructions - Optional custom writing instructions
 * @returns {string} The full prompt text ready to paste into any AI
 */
export function getFullRecapPrompt(dynasty, game, customInstructions = null) {
  const context = buildGameRecapContext(dynasty, game)
  return buildGameRecapPrompt(context, customInstructions)
}
