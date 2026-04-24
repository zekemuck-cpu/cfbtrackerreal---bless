/**
 * AI Service
 * Handles context building and API calls for AI-generated content
 * Supports multiple providers: Gemini, OpenAI, Anthropic, OpenRouter
 */

import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../config/firebase'
import { getTeamName } from '../data/teamAbbreviations'
import { getCurrentTeamAbbr, TEAMS, getGameTeamInfo, getNameByAbbr, getTidFromAbbr } from '../data/teamRegistry'
import { getTeamConference } from '../data/conferenceTeams'
import { getUserGamePerspective } from '../context/DynastyContext'
import { getProvider, getDefaultModel as getProviderDefaultModel } from './providers'

// ============================================
// API KEY MANAGEMENT (Legacy + Multi-Provider)
// ============================================

// In-memory cache for user AI config to reduce Firestore reads
// Cache expires after 1 hour or when user changes
const aiConfigCache = new Map() // userId -> { data, timestamp }
const AI_CONFIG_CACHE_TTL = 60 * 60 * 1000 // 1 hour

function getCachedConfig(userId) {
  const cached = aiConfigCache.get(userId)
  if (cached && Date.now() - cached.timestamp < AI_CONFIG_CACHE_TTL) {
    return cached.data
  }
  return null
}

function setCachedConfig(userId, data) {
  aiConfigCache.set(userId, { data, timestamp: Date.now() })
}

// Clear cache for a specific user (call on logout or settings change)
export function clearAiConfigCache(userId) {
  if (userId) {
    aiConfigCache.delete(userId)
  } else {
    aiConfigCache.clear()
  }
}

/**
 * Fetch the user's Gemini API key from Firestore (legacy support)
 * Uses in-memory cache to reduce Firestore reads
 */
export async function getGeminiApiKey(userId) {
  if (!userId) return null

  // Check cache first
  const cached = getCachedConfig(userId)
  if (cached) {
    return cached.apiKeys?.gemini || cached.geminiApiKey || null
  }

  try {
    const userDoc = await getDoc(doc(db, 'users', userId))
    if (!userDoc.exists()) return null
    const data = userDoc.data()
    // Cache the full user data
    setCachedConfig(userId, data)
    // Check new structure first, then legacy
    return data.apiKeys?.gemini || data.geminiApiKey || null
  } catch (error) {
    console.error('Error fetching Gemini API key:', error)
    return null
  }
}

/**
 * Get the Gemini model to use for content generation
 * Always returns gemini-2.5-flash (the recommended model with good free tier support)
 */
export async function getGeminiModel(userId) {
  return 'gemini-2.5-flash'
}

// ============================================
// MULTI-PROVIDER API KEY & SETTINGS
// ============================================

/**
 * Get user's AI configuration (provider, model, and API keys)
 * Uses in-memory cache to reduce Firestore reads
 */
export async function getAiConfig(userId) {
  if (!userId) return null

  // Check cache first
  const cached = getCachedConfig(userId)
  if (cached) {
    return {
      provider: cached.aiProvider || 'gemini',
      model: cached.aiModel || 'gemini-2.5-flash',
      apiKeys: {
        gemini: cached.apiKeys?.gemini || cached.geminiApiKey || null,
        openai: cached.apiKeys?.openai || null,
        anthropic: cached.apiKeys?.anthropic || null,
        openrouter: cached.apiKeys?.openrouter || null
      }
    }
  }

  try {
    const userDoc = await getDoc(doc(db, 'users', userId))
    if (!userDoc.exists()) return null

    const data = userDoc.data()
    // Cache the full user data
    setCachedConfig(userId, data)

    // Build config from new structure with fallback to legacy
    return {
      provider: data.aiProvider || 'gemini',
      model: data.aiModel || 'gemini-2.5-flash',
      apiKeys: {
        gemini: data.apiKeys?.gemini || data.geminiApiKey || null,
        openai: data.apiKeys?.openai || null,
        anthropic: data.apiKeys?.anthropic || null,
        openrouter: data.apiKeys?.openrouter || null
      }
    }
  } catch (error) {
    console.error('Error fetching AI config:', error)
    return null
  }
}

/**
 * Get API key for a specific provider
 */
export async function getApiKey(userId, providerName) {
  if (!userId || !providerName) return null

  try {
    const userDoc = await getDoc(doc(db, 'users', userId))
    if (!userDoc.exists()) return null

    const data = userDoc.data()

    // Check new structure first
    if (data.apiKeys?.[providerName]) {
      return data.apiKeys[providerName]
    }

    // Legacy fallback for Gemini
    if (providerName === 'gemini' && data.geminiApiKey) {
      return data.geminiApiKey
    }

    return null
  } catch (error) {
    console.error(`Error fetching ${providerName} API key:`, error)
    return null
  }
}

/**
 * Save API key for a specific provider
 */
export async function saveApiKey(userId, providerName, apiKey) {
  if (!userId || !providerName) {
    return { success: false, message: 'Missing user ID or provider' }
  }

  try {
    const updates = {
      [`apiKeys.${providerName}`]: apiKey || null,
      updatedAt: new Date().toISOString()
    }

    // Also update legacy field for backwards compatibility
    if (providerName === 'gemini') {
      updates.geminiApiKey = apiKey || null
    }

    await setDoc(doc(db, 'users', userId), updates, { merge: true })
    // Invalidate cache so next request gets fresh data
    clearAiConfigCache(userId)
    return { success: true, message: 'API key saved' }
  } catch (error) {
    console.error(`Error saving ${providerName} API key:`, error)
    return { success: false, message: error.message }
  }
}

/**
 * Get user's selected AI provider
 */
export async function getSelectedProvider(userId) {
  if (!userId) return 'gemini'

  try {
    const userDoc = await getDoc(doc(db, 'users', userId))
    if (!userDoc.exists()) return 'gemini'
    return userDoc.data().aiProvider || 'gemini'
  } catch (error) {
    console.error('Error fetching selected provider:', error)
    return 'gemini'
  }
}

/**
 * Set user's selected AI provider and model
 */
export async function setSelectedProvider(userId, providerName, modelId = null) {
  if (!userId || !providerName) {
    return { success: false, message: 'Missing user ID or provider' }
  }

  try {
    const updates = {
      aiProvider: providerName,
      updatedAt: new Date().toISOString()
    }

    // Set model to provider default if not specified
    if (modelId) {
      updates.aiModel = modelId
    } else {
      updates.aiModel = getProviderDefaultModel(providerName)
    }

    await setDoc(doc(db, 'users', userId), updates, { merge: true })
    // Invalidate cache so next request gets fresh data
    clearAiConfigCache(userId)
    return { success: true, message: 'Provider updated' }
  } catch (error) {
    console.error('Error setting provider:', error)
    return { success: false, message: error.message }
  }
}

/**
 * Get user's selected model
 */
export async function getSelectedModel(userId) {
  if (!userId) return 'gemini-2.5-flash'

  try {
    const userDoc = await getDoc(doc(db, 'users', userId))
    if (!userDoc.exists()) return 'gemini-2.5-flash'
    return userDoc.data().aiModel || 'gemini-2.5-flash'
  } catch (error) {
    console.error('Error fetching selected model:', error)
    return 'gemini-2.5-flash'
  }
}

// ============================================
// USAGE TRACKING
// ============================================

/**
 * Get today's date string in YYYY-MM-DD format
 */
function getTodayDateString() {
  return new Date().toISOString().split('T')[0]
}

/**
 * Track API usage after a successful call
 * Stores: requests count, tokens used, by date
 */
export async function trackApiUsage(userId, usage) {
  if (!userId) return

  try {
    const today = getTodayDateString()
    const userDoc = await getDoc(doc(db, 'users', userId))
    const existingData = userDoc.exists() ? userDoc.data() : {}
    const existingUsage = existingData.geminiUsage || {}

    // Get today's usage or initialize
    const todayUsage = existingUsage[today] || { requests: 0, promptTokens: 0, outputTokens: 0, totalTokens: 0 }

    // Update counts
    todayUsage.requests += 1
    if (usage) {
      todayUsage.promptTokens += usage.promptTokens || 0
      todayUsage.outputTokens += usage.outputTokens || 0
      todayUsage.totalTokens += usage.totalTokens || 0
    }
    todayUsage.lastRequest = new Date().toISOString()

    // Save back
    await setDoc(doc(db, 'users', userId), {
      geminiUsage: {
        ...existingUsage,
        [today]: todayUsage
      }
    }, { merge: true })
  } catch (error) {
    console.error('Error tracking API usage:', error)
    // Don't throw - usage tracking shouldn't break the main flow
  }
}

/**
 * Get usage statistics for the user
 * Returns today's usage and historical data
 */
export async function getApiUsageStats(userId) {
  if (!userId) return null

  try {
    const userDoc = await getDoc(doc(db, 'users', userId))
    if (!userDoc.exists()) return null

    const data = userDoc.data()
    const usage = data.geminiUsage || {}
    const today = getTodayDateString()
    const todayUsage = usage[today] || { requests: 0, promptTokens: 0, outputTokens: 0, totalTokens: 0 }

    // Calculate totals for last 7 days
    const last7Days = []
    for (let i = 0; i < 7; i++) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      const dateStr = date.toISOString().split('T')[0]
      last7Days.push({
        date: dateStr,
        ...(usage[dateStr] || { requests: 0, totalTokens: 0 })
      })
    }

    // Calculate all-time totals
    let allTimeRequests = 0
    let allTimeTokens = 0
    Object.values(usage).forEach(day => {
      allTimeRequests += day.requests || 0
      allTimeTokens += day.totalTokens || 0
    })

    return {
      today: todayUsage,
      last7Days,
      allTime: {
        requests: allTimeRequests,
        totalTokens: allTimeTokens
      },
      // Free tier limits
      limits: {
        requestsPerDay: 1500,
        requestsPerMinute: 15,
        tokensPerMinute: 1000000
      }
    }
  } catch (error) {
    console.error('Error fetching API usage:', error)
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
 * Get abbreviation from tid using TEAMS registry
 */
function getAbbrFromTid(tid) {
  if (!tid) return null
  const teamData = TEAMS[tid]
  return teamData?.abbr || null
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
 * Get team ratings for a team/year
 * Checks tid-based storage first, then falls back to legacy abbr-based storage
 */
function getTeamRatings(dynasty, teamAbbr, year) {
  // Try tid-based lookup first (new format)
  if (dynasty?.teams) {
    // Find tid from abbr
    for (const [tid, teamData] of Object.entries(dynasty.teams)) {
      if (teamData?.abbr === teamAbbr || teamData?.name?.includes(teamAbbr)) {
        const tidRatings = teamData?.byYear?.[year]?.teamRatings
        if (tidRatings) return tidRatings
      }
    }
  }

  // Fall back to legacy abbr-based lookup
  if (dynasty?.teamRatingsByTeamYear?.[teamAbbr]?.[year]) {
    return dynasty.teamRatingsByTeamYear[teamAbbr][year]
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
 * Supports both legacy (userTeam/opponent) and unified (team1Tid/team2Tid) formats
 */
function getSeasonResultsBeforeGame(allGames, teamAbbr, year, currentGameOrder) {
  if (!allGames) return []

  const teamTid = getTidFromAbbr(teamAbbr)

  return allGames
    .filter(g => {
      if (Number(g.year) !== Number(year)) return false
      if (getGameOrder(g) >= currentGameOrder) return false
      // Must be a user game for this team (check both legacy and unified formats)
      const isUserTeamLegacy = g.userTeam === teamAbbr
      const isUserTeamUnified = teamTid && (g.userTid === teamTid || g.team1Tid === teamTid)
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
        opponent = getAbbrFromTid(g.team2Tid) || g.team2
        teamScore = g.team1Score
        opponentScore = g.team2Score
        opponentRank = g.team2Rank
      } else if (teamTid && g.team2Tid === teamTid) {
        // Unified format - user is team2
        opponent = getAbbrFromTid(g.team1Tid) || g.team1
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
function getHeadToHeadHistory(allGames, team1, team2, currentYear, maxGames = 5) {
  const history = []

  // Get tids for unified format matching
  const team1Tid = getTidFromAbbr(team1)
  const team2Tid = getTidFromAbbr(team2)

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
      const team1Name = getTeamName(getAbbrFromTid(g.team1Tid)) || getAbbrFromTid(g.team1Tid)
      const team2Name = getTeamName(getAbbrFromTid(g.team2Tid)) || getAbbrFromTid(g.team2Tid)
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

/**
 * Get a team's postseason result from the prior year (the year before the current game)
 * Returns bowl game or CFP participation details from the previous season
 */
function getPriorYearPostseason(allGames, teamAbbr, currentYear) {
  const priorYear = Number(currentYear) - 1
  const teamTid = getTidFromAbbr(teamAbbr)

  for (const g of allGames) {
    if (Number(g.year) !== priorYear) continue
    if (!g.isBowlGame && !g.isCFPFirstRound && !g.isCFPQuarterfinal && !g.isCFPSemifinal && !g.isCFPChampionship) continue

    // Check if this team was in the game (support both formats)
    const teamInGameLegacy = g.userTeam === teamAbbr || g.team1 === teamAbbr || g.team2 === teamAbbr
    const teamInGameUnified = teamTid && (g.team1Tid === teamTid || g.team2Tid === teamTid || g.userTid === teamTid)

    if (teamInGameLegacy || teamInGameUnified) {
      let won, opponent, score, gameName

      // Determine result based on game format
      if (g.team1Tid && g.team2Tid) {
        // Unified format - resolve opponent from tid
        const isTeam1 = (teamTid && g.team1Tid === teamTid) || g.team1 === teamAbbr
        won = isTeam1 ? g.team1Score > g.team2Score : g.team2Score > g.team1Score
        const opponentTid = isTeam1 ? g.team2Tid : g.team1Tid
        // Get opponent abbr from tid, fallback to g.team2/g.team1 if available
        const opponentInfo = getGameTeamInfo(TEAMS, opponentTid)
        opponent = opponentInfo?.abbr || (isTeam1 ? g.team2 : g.team1) || opponentTid
        score = `${isTeam1 ? g.team1Score : g.team2Score}-${isTeam1 ? g.team2Score : g.team1Score}`
      } else if (g.team1 && g.team2) {
        // Legacy CPU game format
        const isTeam1 = g.team1 === teamAbbr
        won = isTeam1 ? g.team1Score > g.team2Score : g.team2Score > g.team1Score
        opponent = isTeam1 ? g.team2 : g.team1
        score = `${isTeam1 ? g.team1Score : g.team2Score}-${isTeam1 ? g.team2Score : g.team1Score}`
      } else {
        // Legacy user game format
        won = g.result === 'win' || g.result === 'W'
        // Try to get opponent from opponentTid if opponent abbr not available
        if (g.opponent) {
          opponent = g.opponent
        } else if (g.opponentTid) {
          const oppInfo = getGameTeamInfo(TEAMS, g.opponentTid)
          opponent = oppInfo?.abbr || g.opponentTid
        }
        score = `${g.teamScore}-${g.opponentScore}`
      }

      // Determine game type name
      if (g.isCFPChampionship) {
        gameName = 'National Championship'
      } else if (g.isCFPSemifinal) {
        gameName = g.bowlName || 'CFP Semifinal'
      } else if (g.isCFPQuarterfinal) {
        gameName = g.bowlName || 'CFP Quarterfinal'
      } else if (g.isCFPFirstRound) {
        gameName = 'CFP First Round'
      } else {
        gameName = g.bowlName || 'Bowl Game'
      }

      // For CFP games, check if they made it further
      let cfpRound = null
      if (g.isCFPChampionship) {
        cfpRound = 'National Championship'
      } else if (g.isCFPSemifinal) {
        cfpRound = 'CFP Semifinal'
      } else if (g.isCFPQuarterfinal) {
        cfpRound = 'CFP Quarterfinal'
      } else if (g.isCFPFirstRound) {
        cfpRound = 'CFP First Round'
      }

      return {
        year: priorYear,
        gameName,
        result: won ? 'W' : 'L',
        opponent,
        score,
        isCFP: g.isCFPFirstRound || g.isCFPQuarterfinal || g.isCFPSemifinal || g.isCFPChampionship,
        cfpRound,
        wonNationalChampionship: g.isCFPChampionship && won
      }
    }
  }

  return null
}

/**
 * Get a team's season history (past years' records)
 * Returns records for previous seasons where this team was coached
 */
function getTeamSeasonHistory(allGames, teamAbbr, currentYear, maxSeasons = 3) {
  const seasonsByYear = {}
  const teamTid = getTidFromAbbr(teamAbbr)

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

    // Determine if team won (handle all formats)
    let won
    if (g.userTeam === teamAbbr || (teamTid && g.userTid === teamTid)) {
      // User game - check result field or scores
      if (g.result) {
        won = g.result === 'win' || g.result === 'W'
      } else {
        won = (g.teamScore || g.team1Score) > (g.opponentScore || g.team2Score)
      }
    } else if (g.team1 === teamAbbr || (teamTid && g.team1Tid === teamTid)) {
      won = g.team1Score > g.team2Score
    } else {
      won = g.team2Score > g.team1Score
    }

    if (won) {
      seasonsByYear[gYear].wins++
      if (g.isConferenceGame) seasonsByYear[gYear].confWins++
    } else {
      seasonsByYear[gYear].losses++
      if (g.isConferenceGame) seasonsByYear[gYear].confLosses++
    }
  }

  return Object.values(seasonsByYear)
    .sort((a, b) => b.year - a.year)
    .slice(0, maxSeasons)
}

/**
 * Get opponent's season results (their games this year)
 * Shows how the opponent has performed leading up to this matchup
 * Supports both legacy and unified game formats
 */
function getOpponentSeasonResults(allGames, opponentAbbr, year, currentGameOrder) {
  const results = []
  const opponentTid = getTidFromAbbr(opponentAbbr)

  for (const g of allGames) {
    if (Number(g.year) !== Number(year)) continue
    if (getGameOrder(g) >= currentGameOrder) continue
    if (isUnplayedGame(g)) continue

    // Check if opponent was in this game
    let opponentWon, oppScore, otherTeam, otherScore, found = false

    // Legacy format: userTeam/opponent
    if (g.userTeam === opponentAbbr) {
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
    // Unified format: team1Tid/team2Tid
    else if (opponentTid && g.team1Tid === opponentTid) {
      opponentWon = g.team1Score > g.team2Score
      oppScore = g.team1Score
      otherTeam = getAbbrFromTid(g.team2Tid) || g.team2
      otherScore = g.team2Score
      found = true
    } else if (opponentTid && g.team2Tid === opponentTid) {
      opponentWon = g.team2Score > g.team1Score
      oppScore = g.team2Score
      otherTeam = getAbbrFromTid(g.team1Tid) || g.team1
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
function getPlayerPerformanceTrends(boxScore, side, players, allGames, year, currentGameOrder) {
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
      for (const gameSide of ['home', 'away']) {
        for (const category of ['passing', 'rushing', 'receiving', 'defense']) {
          const entries = g.boxScore?.[gameSide]?.[category] || []
          const playerEntry = entries.find(p => normalizePlayerName(p.playerName) === normalized)
          if (playerEntry) {
            // Opponent is ALWAYS the team on the OTHER side from where the player appeared.
            // g.opponent is unreliable here because it encodes the user's perspective, not
            // this specific player's — an opponent-team player would get their own team
            // name back. Resolve from tid/boxScore side first.
            const opponentTid = gameSide === 'home' ? g.team2Tid : g.team1Tid
            const otherSide = gameSide === 'home' ? 'away' : 'home'
            let opponentName = null
            if (opponentTid && TEAMS[opponentTid]) {
              opponentName = TEAMS[opponentTid].name || TEAMS[opponentTid].mascot || TEAMS[opponentTid].abbr
            }
            if (!opponentName) {
              opponentName = g.boxScore?.[otherSide]?.teamName || null
            }
            if (!opponentName) {
              const fallback = gameSide === 'home' ? g.team2 : g.team1
              opponentName = typeof fallback === 'string' ? fallback : null
            }
            recentGames.push({
              week: g.week,
              opponent: opponentName,
              category,
              stats: playerEntry
            })
          }
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
  if (isCurrentGameUserGame) {
    // User game - use perspective to ensure correct team alignment
    // This works for both unified format and legacy format user games
    const userInfo = currentGamePerspective.userTid ? getGameTeamInfo(teams, currentGamePerspective.userTid) : null
    const oppInfo = currentGamePerspective.opponentTid ? getGameTeamInfo(teams, currentGamePerspective.opponentTid) : null
    team1 = userInfo?.abbr || game.userTeam || userTeamAbbr
    team2 = oppInfo?.abbr || game.opponent
    team1Score = currentGamePerspective.userScore ?? game.teamScore
    team2Score = currentGamePerspective.opponentScore ?? game.opponentScore
  } else if (hasUnifiedFormat) {
    // CPU game with unified format - use tids directly
    team1 = getAbbrFromTid(game.team1Tid) || game.team1
    team2 = getAbbrFromTid(game.team2Tid) || game.team2
    team1Score = game.team1Score
    team2Score = game.team2Score
  } else if (isCPUGame) {
    // Legacy CPU game format
    team1 = game.team1
    team2 = game.team2
    team1Score = game.team1Score
    team2Score = game.team2Score
  } else {
    // Fallback for legacy user games without perspective
    team1 = game.userTeam || userTeamAbbr
    team2 = game.opponent
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

  // For user games (including unified format user games), get season context
  let recordBefore = null
  let recordAfter = null
  let streak = null

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

  // Calculate season context for user games
  if (isCurrentGameUserGame) {
    const seasonGames = allGames.filter(g =>
      Number(g.year) === Number(year) && isUserGame(g) && !isUnplayedGame(g)
    )

    const gamesBefore = seasonGames.filter(g => getGameOrder(g) < thisGameOrder)

    const winsBefore = gamesBefore.filter(g => getGameWin(g) === true).length
    const lossesBefore = gamesBefore.filter(g => getGameWin(g) === false).length

    const isWin = currentGamePerspective?.userWon ?? (game.result === 'win' || game.result === 'W') ?? team1Won
    recordBefore = `${winsBefore}-${lossesBefore}`
    recordAfter = isWin ? `${winsBefore + 1}-${lossesBefore}` : `${winsBefore}-${lossesBefore + 1}`

    // Calculate streak
    const gamesUpToThis = [...gamesBefore, game].sort((a, b) => getGameOrder(a) - getGameOrder(b))
    let streakCount = 0
    const streakType = isWin ? 'win' : 'loss'
    for (let i = gamesUpToThis.length - 1; i >= 0; i--) {
      const g = gamesUpToThis[i]
      const gWin = getGameWin(g)
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

  // Get coaching staff for user team (team1 for user games)
  const team1Staff = !isCPUGame ? getCoachingStaff(dynasty, team1, year) : null

  // Get full season results before this game (for user games)
  const seasonResults = !isCPUGame
    ? getSeasonResultsBeforeGame(allGames, team1, year, thisGameOrder)
    : []

  // Determine if user is team1 or team2 in the original game data
  // This affects how quarters are mapped since quarters.team/quarters.opponent
  // are stored relative to team1/team2 order for CPU games and unified format CCG games
  let isUserTeam1InGameData = true
  if (isCurrentGameUserGame && hasUnifiedFormat && currentGamePerspective?.userTid) {
    isUserTeam1InGameData = game.team1Tid === currentGamePerspective.userTid
  }

  // Determine which box score side has which team's stats by checking teamAbbr
  // The box score teamStats has home.teamAbbr and away.teamAbbr to identify teams
  let team1Side = 'home'
  let team2Side = 'away'

  if (game.boxScore?.teamStats) {
    const homeAbbr = game.boxScore.teamStats.home?.teamAbbr?.toUpperCase()
    const awayAbbr = game.boxScore.teamStats.away?.teamAbbr?.toUpperCase()

    // Match team1 to the correct side by abbreviation
    if (homeAbbr && awayAbbr) {
      if (awayAbbr === team1?.toUpperCase()) {
        // team1's stats are in 'away' position
        team1Side = 'away'
        team2Side = 'home'
      }
      // else: team1's stats are in 'home' position (default)
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
  const team1SeasonHistory = getTeamSeasonHistory(allGames, team1, year)
  const team2SeasonHistory = getTeamSeasonHistory(allGames, team2, year)

  // NEW: Get opponent's season results (how they've done this year)
  const team2SeasonResults = !isCPUGame
    ? getOpponentSeasonResults(allGames, team2, year, thisGameOrder)
    : []

  // Get conferences for both teams
  const customConferences = dynasty?.conferencesByYear?.[year] || dynasty?.conferences || null
  const customTeams = dynasty?.customTeams || null
  const team1Conference = getTeamConference(team1, customConferences, customTeams)
  const team2Conference = getTeamConference(team2, customConferences, customTeams)

  // Get prior year postseason results for both teams
  const team1PriorPostseason = getPriorYearPostseason(allGames, team1, year)
  const team2PriorPostseason = getPriorYearPostseason(allGames, team2, year)

  // NEW: Get player performance trends from box score (using determined sides)
  let team1PlayerTrends = []
  let team2PlayerTrends = []
  if (game.boxScore) {
    team1PlayerTrends = getPlayerPerformanceTrends(game.boxScore, team1Side, players, allGames, year, thisGameOrder)
    team2PlayerTrends = getPlayerPerformanceTrends(game.boxScore, team2Side, players, allGames, year, thisGameOrder)
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
    team1Conference,
    team2Conference,

    // NEW: Team ratings
    team1Ratings,
    team2Ratings,

    // NEW: Coaching staff
    team1Staff,

    // NEW: Full season results before this game
    seasonResults,

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

    // NEW: Past season records for both teams
    team1SeasonHistory,
    team2SeasonHistory,

    // NEW: Opponent's season results (their games this year)
    team2SeasonResults,

    // NEW: Prior year postseason results (bowl/CFP from previous season)
    team1PriorPostseason,
    team2PriorPostseason,

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
export const DEFAULT_GAME_RECAP_INSTRUCTIONS = `Write a professional game recap article like a college football writer for ESPN or The Athletic.

CRITICAL RULE: Every specific fact you mention (scores, records, rankings, stats, drive details, time remaining, etc.) MUST be directly supported by the data provided above. Do not make up any numbers, injuries, rankings, or plays. It's fine to add neutral connecting language (e.g., "Clemson took control in the fourth quarter") but don't invent extra drives, turnovers, or scoring plays that aren't in the data.

DATA HYGIENE RULE: If any value in the data above is missing, blank, "undefined", "N/A", or a 0-0 score for a completed game, treat that entry as unavailable and ignore it silently. Never write phrases like "undefined defeated undefined", "they are 0-0 against them", or "record unavailable". Do not mention the gap — just leave that fact out of the article. Pull the narrative from the fields that ARE populated.

FORMAT:
- Start with a strong headline on its own line as a level-1 markdown heading (e.g., "# Talley, Brink Lift No. 5 Wisconsin Past No. 8 Penn State in Wild Final Minute")
- Begin the article body with a dateline: "City, State —" format (e.g., "Madison, WI —" or "Tuscaloosa, AL —"). Use the home team's city. For neutral site games (bowls, CFP, conference championships), omit the dateline.
- For longer articles with rich data, use level-2 markdown subheadings to break up sections (e.g., "## Early fireworks and a heavyweight feel", "## Fourth-quarter chaos: lead changes and clutch plays")
- Use **bold** for pivotal moments, decisive plays, and standout stat lines — things you want the reader's eye to land on. Examples: **"Shembo completed 27 of 28 passes for 266 yards and three touchdowns"**, **the 48-yard field goal with 0:03 left**. Don't over-bold — 3 to 8 boldings across the whole article is the sweet spot.
- Use *italic* sparingly, for a quoted phrase, a team nickname on first mention, or a moment of narrative emphasis. Skip it if you're not sure.
- Use these markdown markers only. Do not use bullet lists, tables, code fences, links, or any other markdown syntax. Separate paragraphs with a blank line.

USING THE DATA:
- Use the SCORING SUMMARY to walk through scoring plays chronologically with times and running scores
- Call out EXACT stat lines throughout: "Shembo completed 27 of 28 passes for 266 yards and three touchdowns with no interceptions, posting a 211.5 passer rating"
- Include yards per carry, yards per attempt, completion percentage when the numbers are notable
- Use records/schedule context for big-picture framing (e.g., "The win moves Wisconsin to 8-1 overall and 6-0 in Big Ten play")
- Only mention rankings if explicitly shown - don't assume teams are ranked based on reputation

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

A shorter, accurate article is always better than a longer one padded with invented details.`

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
${ctx.team1FullName} Ranking: ${ctx.team1Ranking ? `#${ctx.team1Ranking}` : 'UNRANKED'}
${ctx.team2FullName} Ranking: ${ctx.team2Ranking ? `#${ctx.team2Ranking}` : 'UNRANKED'}
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

      // Update running score - check against abbreviation since play.team uses abbr
      const isTeam1 = play.team?.toUpperCase() === ctx.team1?.toUpperCase()
      if (isTeam1) team1Running += points
      else team2Running += points

      const quarter = play.quarter || '?'
      const timeLeft = play.timeLeft || ''
      const scorer = play.scorer || 'Unknown'
      const passer = play.passer ? ` from ${play.passer}` : ''
      // Convert team abbreviation to full name in the output
      const playTeamFullName = play.team?.toUpperCase() === ctx.team1?.toUpperCase() ? ctx.team1FullName : ctx.team2FullName

      prompt += `\n${idx + 1}. Q${quarter} ${timeLeft} - ${playTeamFullName}: ${scorer}${passer} (${scoreType}${patResult ? ', ' + patResult : ''}) → Score: ${ctx.team1FullName} ${team1Running}, ${ctx.team2FullName} ${team2Running}`
    })
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

  // Add season context for user games
  if (!ctx.isCPUGame && ctx.recordBefore) {
    prompt += `\n
===========================================
SEASON CONTEXT FOR ${ctx.team1FullName}
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
      const opponentName = getTeamName(g.opponent) || g.opponent
      prompt += `\n  Week ${g.week}: ${resultChar} ${g.teamScore}-${g.opponentScore} ${locationChar} ${rankStr}${opponentName}`
    })
  }

  // Add player stats for both teams - CRITICAL: Include team name with each player for clarity
  if (ctx.boxScore) {
    const team1Name = ctx.boxScore.team1Name
    const team2Name = ctx.boxScore.team2Name
    const team1Stats = ctx.boxScore.team1
    if (team1Stats) {
      prompt += `\n
===========================================
${team1Name.toUpperCase()} INDIVIDUAL STATS
(All players below play for ${team1Name})
===========================================`

      if (team1Stats.passing.length > 0) {
        prompt += `\n\n${team1Name.toUpperCase()} PASSING:`
        team1Stats.passing.forEach(p => {
          prompt += `\n  ${p.player} [${team1Name}]: ${p.stats}`
        })
      }
      if (team1Stats.rushing.length > 0) {
        prompt += `\n\n${team1Name.toUpperCase()} RUSHING:`
        team1Stats.rushing.forEach(p => {
          prompt += `\n  ${p.player} [${team1Name}]: ${p.stats}`
        })
      }
      if (team1Stats.receiving.length > 0) {
        prompt += `\n\n${team1Name.toUpperCase()} RECEIVING:`
        team1Stats.receiving.forEach(p => {
          prompt += `\n  ${p.player} [${team1Name}]: ${p.stats}`
        })
      }
      if (team1Stats.defense.length > 0) {
        prompt += `\n\n${team1Name.toUpperCase()} DEFENSE:`
        team1Stats.defense.forEach(p => {
          prompt += `\n  ${p.player} [${team1Name}]: ${p.stats}`
        })
      }
      if (team1Stats.kicking.length > 0) {
        prompt += `\n\n${team1Name.toUpperCase()} KICKING:`
        team1Stats.kicking.forEach(p => {
          prompt += `\n  ${p.player} [${team1Name}]: ${p.stats}`
        })
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
        team2Stats.passing.forEach(p => {
          prompt += `\n  ${p.player} [${team2Name}]: ${p.stats}`
        })
      }
      if (team2Stats.rushing.length > 0) {
        prompt += `\n\n${team2Name.toUpperCase()} RUSHING:`
        team2Stats.rushing.forEach(p => {
          prompt += `\n  ${p.player} [${team2Name}]: ${p.stats}`
        })
      }
      if (team2Stats.receiving.length > 0) {
        prompt += `\n\n${team2Name.toUpperCase()} RECEIVING:`
        team2Stats.receiving.forEach(p => {
          prompt += `\n  ${p.player} [${team2Name}]: ${p.stats}`
        })
      }
      if (team2Stats.defense.length > 0) {
        prompt += `\n\n${team2Name.toUpperCase()} DEFENSE:`
        team2Stats.defense.forEach(p => {
          prompt += `\n  ${p.player} [${team2Name}]: ${p.stats}`
        })
      }
    }
  }

  // Add head-to-head history (rivalry context)
  if (ctx.headToHead && ctx.headToHead.length > 0) {
    prompt += `\n
===========================================
HEAD-TO-HEAD HISTORY (${ctx.team1FullName} vs ${ctx.team2FullName})
===========================================`
    ctx.headToHead.forEach(h => {
      // Convert abbreviations to full names
      const winnerName = getTeamName(h.winner) || h.winner
      const loserName = getTeamName(h.loser) || h.loser
      prompt += `\n  ${h.year}: ${winnerName} def. ${loserName} ${h.winnerScore}-${h.loserScore} (${h.gameType})`
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

  // Add prior year postseason results (bowl/CFP from previous season)
  if (ctx.team1PriorPostseason || ctx.team2PriorPostseason) {
    prompt += `\n
===========================================
PRIOR YEAR POSTSEASON RESULTS
===========================================
Use this context to enrich your narrative when relevant (e.g., defending national champions, coming off a bowl win, etc.). This is optional context - only mention if it naturally fits the story.`
    if (ctx.team1PriorPostseason) {
      const p = ctx.team1PriorPostseason
      const oppName = getTeamName(p.opponent) || p.opponent
      prompt += `\n${ctx.team1FullName} (${p.year}): ${p.result} ${p.score} vs ${oppName} (${p.gameName})`
      if (p.wonNationalChampionship) {
        prompt += ` - NATIONAL CHAMPIONS`
      } else if (p.isCFP) {
        prompt += ` - Made CFP (${p.cfpRound})`
      }
    }
    if (ctx.team2PriorPostseason) {
      const p = ctx.team2PriorPostseason
      const oppName = getTeamName(p.opponent) || p.opponent
      prompt += `\n${ctx.team2FullName} (${p.year}): ${p.result} ${p.score} vs ${oppName} (${p.gameName})`
      if (p.wonNationalChampionship) {
        prompt += ` - NATIONAL CHAMPIONS`
      } else if (p.isCFP) {
        prompt += ` - Made CFP (${p.cfpRound})`
      }
    }
  }

  // Add opponent's current season results (how they've done this year)
  if (ctx.team2SeasonResults && ctx.team2SeasonResults.length > 0) {
    const oppWins = ctx.team2SeasonResults.filter(g => g.result === 'W').length
    const oppLosses = ctx.team2SeasonResults.filter(g => g.result === 'L').length
    prompt += `\n
===========================================
${ctx.team2FullName.toUpperCase()}'S SEASON RECORD: ${oppWins}-${oppLosses}
(THIS IS THEIR ACTUAL RECORD - DO NOT ASSUME A DIFFERENT RECORD)
===========================================`
    ctx.team2SeasonResults.forEach(g => {
      const oppName = getTeamName(g.opponent) || g.opponent
      prompt += `\n  Week ${g.week}: ${g.result} ${g.score} vs ${oppName}${g.isConferenceGame ? ' (conf)' : ''}`
    })
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

  return prompt
}

// ============================================
// API CALLS
// ============================================

/**
 * Generate content using Gemini API with retry logic for overloaded errors
 * @param {string} apiKey - Gemini API key
 * @param {string} prompt - The prompt to send
 * @param {number} maxRetries - Number of retries for overloaded errors
 * @param {string} model - The Gemini model to use (default: gemini-2.5-flash)
 */
export async function generateWithGemini(apiKey, prompt, maxRetries = 3, model = 'gemini-2.5-flash') {
  if (!apiKey) {
    throw new Error('No API key provided')
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
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
 * @param {string} model - The Gemini model to use (default: gemini-2.5-flash)
 * @returns {object} { text, usage } - The generated text and token usage info
 */
export async function generateWithGeminiStreaming(apiKey, prompt, onChunk, maxRetries = 3, model = 'gemini-2.5-flash') {
  if (!apiKey) {
    throw new Error('No API key provided')
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
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

/**
 * Generate a game recap using any supported AI provider
 * @param {object} dynasty - The dynasty data
 * @param {object} game - The game data
 * @param {string} apiKey - API key for the provider
 * @param {function} onChunk - Optional callback for streaming (receives accumulated text)
 * @param {string} customInstructions - Optional custom writing instructions
 * @param {string} userId - Optional user ID for usage tracking
 * @param {string} model - Model ID to use
 * @param {string} providerName - Provider name (gemini, openai, anthropic, openrouter). Defaults to gemini for backwards compatibility.
 * @returns {object} { text, usage } - The generated text and token usage info (when streaming)
 */
export async function generateGameRecap(dynasty, game, apiKey, onChunk = null, customInstructions = null, userId = null, model = 'gemini-2.5-flash', providerName = 'gemini') {
  const context = buildGameRecapContext(dynasty, game)
  const prompt = buildGameRecapPrompt(context, customInstructions)

  let result

  // Use provider abstraction for all providers
  try {
    const provider = getProvider(providerName)
    const options = { model, maxRetries: 3 }

    if (onChunk) {
      // Streaming returns { text, usage }
      result = await provider.generateStreaming(apiKey, prompt, onChunk, options)
    } else {
      // Non-streaming returns just text
      const text = await provider.generate(apiKey, prompt, options)
      result = { text, usage: null }
    }
  } catch (providerError) {
    // Fallback to legacy Gemini functions if provider not found (shouldn't happen)
    if (providerError.message?.includes('Unknown AI provider')) {
      if (onChunk) {
        result = await generateWithGeminiStreaming(apiKey, prompt, onChunk, 3, model)
      } else {
        const text = await generateWithGemini(apiKey, prompt, 3, model)
        result = { text, usage: null }
      }
    } else {
      throw providerError
    }
  }

  // Track usage if userId provided
  if (userId && result.usage) {
    trackApiUsage(userId, result.usage)
  } else if (userId) {
    // Still track the request even without detailed usage
    trackApiUsage(userId, null)
  }

  return result
}
