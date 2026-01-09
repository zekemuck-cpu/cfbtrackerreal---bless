/**
 * Gemini AI Service
 * Handles context building and API calls for AI-generated content
 */

import { doc, getDoc } from 'firebase/firestore'
import { db } from '../config/firebase'
import { getAbbreviationFromDisplayName } from '../data/teamAbbreviations'

// ============================================
// API KEY MANAGEMENT
// ============================================

/**
 * Fetch the user's Gemini API key from Firestore
 */
export async function getGeminiApiKey(userId) {
  if (!userId) return null

  try {
    const userDoc = await getDoc(doc(db, 'users', userId))
    return userDoc.exists() ? userDoc.data().geminiApiKey : null
  } catch (error) {
    console.error('Error fetching Gemini API key:', error)
    return null
  }
}

// ============================================
// CONTEXT BUILDERS
// ============================================

/**
 * Build comprehensive context for a game recap
 */
export function buildGameRecapContext(dynasty, game) {
  const userTeamAbbr = getAbbreviationFromDisplayName(dynasty.teamName) || dynasty.teamName
  const year = game.year
  const allGames = dynasty.games || []

  // Get all user games for the season up to this point
  const seasonGames = allGames.filter(g =>
    Number(g.year) === Number(year) &&
    (g.userTeam === userTeamAbbr || g.opponent)
  )

  // Calculate record before this game
  const getGameOrder = (g) => {
    if (g.isConferenceChampionship) return 100
    if (g.isCFPFirstRound) return 101
    if (g.isCFPQuarterfinal) return 102
    if (g.isCFPSemifinal) return 103
    if (g.isCFPChampionship) return 104
    if (g.isBowlGame) return 100 + (parseInt(String(g.bowlWeek).replace('week', '') || '1'))
    return g.week || 0
  }

  const thisGameOrder = getGameOrder(game)
  const gamesBefore = seasonGames.filter(g => getGameOrder(g) < thisGameOrder)

  const winsBefore = gamesBefore.filter(g => g.result === 'win' || g.result === 'W').length
  const lossesBefore = gamesBefore.filter(g => g.result === 'loss' || g.result === 'L').length

  // Determine if this is a win or loss
  const isWin = game.result === 'win' || game.result === 'W'
  const userScore = game.teamScore
  const oppScore = game.opponentScore
  const scoreDiff = Math.abs(userScore - oppScore)

  // Determine game significance
  const isBlowout = scoreDiff >= 21
  const isCloseGame = scoreDiff <= 7
  const isShutout = oppScore === 0 || userScore === 0
  const isOvertime = game.overtime || game.isOvertime
  const isUpset = game.opponentRank && game.opponentRank <= 10 && isWin
  const isRankedMatchup = game.ranking && game.opponentRank

  // Get game type info
  let gameTypeDescription = 'regular season game'
  if (game.isConferenceChampionship) gameTypeDescription = 'conference championship game'
  else if (game.isCFPChampionship) gameTypeDescription = 'College Football Playoff National Championship'
  else if (game.isCFPSemifinal) gameTypeDescription = 'College Football Playoff Semifinal'
  else if (game.isCFPQuarterfinal) gameTypeDescription = 'College Football Playoff Quarterfinal'
  else if (game.isCFPFirstRound) gameTypeDescription = 'College Football Playoff First Round game'
  else if (game.isBowlGame && game.bowlName) gameTypeDescription = `${game.bowlName}`
  else if (game.isBowlGame) gameTypeDescription = 'bowl game'

  // Extract box score stats if available
  let boxScoreContext = null
  if (game.boxScore) {
    boxScoreContext = extractBoxScoreHighlights(game.boxScore, userTeamAbbr, game)
  }

  // Get win/loss streak
  const gamesUpToThis = [...gamesBefore, game].sort((a, b) => getGameOrder(a) - getGameOrder(b))
  let streak = 0
  let streakType = isWin ? 'win' : 'loss'
  for (let i = gamesUpToThis.length - 1; i >= 0; i--) {
    const g = gamesUpToThis[i]
    const gWin = g.result === 'win' || g.result === 'W'
    if (gWin === isWin) {
      streak++
    } else {
      break
    }
  }

  return {
    // Team info
    userTeam: dynasty.teamName,
    userTeamAbbr,
    opponent: game.opponent,

    // Game basics
    week: game.week,
    year: game.year,
    gameType: gameTypeDescription,
    location: game.location, // home, away, neutral

    // Score
    userScore,
    opponentScore: oppScore,
    isWin,
    scoreDifferential: scoreDiff,
    isOvertime,

    // Game character
    isBlowout,
    isCloseGame,
    isShutout,
    isUpset,
    isRankedMatchup,

    // Rankings
    userRanking: game.ranking,
    opponentRanking: game.opponentRank,

    // Season context
    recordBefore: `${winsBefore}-${lossesBefore}`,
    recordAfter: isWin ? `${winsBefore + 1}-${lossesBefore}` : `${winsBefore}-${lossesBefore + 1}`,
    streak: streak > 1 ? `${streak}-game ${streakType} streak` : null,

    // Conference info
    conference: dynasty.conference,
    isConferenceGame: game.isConferenceGame,

    // Box score highlights
    boxScore: boxScoreContext,

    // Bowl/CFP info
    bowlName: game.bowlName,
    cfpSeed: game.cfpSeed,

    // Notes
    gameNotes: game.notes
  }
}

/**
 * Extract key highlights from box score data
 */
function extractBoxScoreHighlights(boxScore, userTeamAbbr, game) {
  const highlights = {
    passing: [],
    rushing: [],
    receiving: [],
    defense: [],
    kicking: []
  }

  // Determine which side is user's team
  const location = game.location || 'home'
  const userIsHome = location === 'home' || location === 'neutral'
  const userSide = userIsHome ? 'home' : 'away'
  const oppSide = userIsHome ? 'away' : 'home'

  // Extract passing leaders
  if (boxScore[userSide]?.passing?.length > 0) {
    const passers = boxScore[userSide].passing.filter(p => p.att > 0)
    passers.forEach(p => {
      highlights.passing.push({
        player: p.playerName,
        stats: `${p.cmp}/${p.att}, ${p.yds} yards, ${p.td} TD${p.td !== 1 ? 's' : ''}${p.int > 0 ? `, ${p.int} INT` : ''}`
      })
    })
  }

  // Extract rushing leaders
  if (boxScore[userSide]?.rushing?.length > 0) {
    const rushers = boxScore[userSide].rushing.filter(p => p.car > 0).slice(0, 3)
    rushers.forEach(p => {
      highlights.rushing.push({
        player: p.playerName,
        stats: `${p.car} carries, ${p.yds} yards${p.td > 0 ? `, ${p.td} TD${p.td !== 1 ? 's' : ''}` : ''}`
      })
    })
  }

  // Extract receiving leaders
  if (boxScore[userSide]?.receiving?.length > 0) {
    const receivers = boxScore[userSide].receiving.filter(p => p.rec > 0).slice(0, 3)
    receivers.forEach(p => {
      highlights.receiving.push({
        player: p.playerName,
        stats: `${p.rec} catches, ${p.yds} yards${p.td > 0 ? `, ${p.td} TD${p.td !== 1 ? 's' : ''}` : ''}`
      })
    })
  }

  // Extract defensive standouts
  if (boxScore[userSide]?.defense?.length > 0) {
    const defenders = boxScore[userSide].defense
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
  if (boxScore[userSide]?.kicking?.length > 0) {
    boxScore[userSide].kicking.forEach(p => {
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

// ============================================
// PROMPT TEMPLATES
// ============================================

/**
 * Build the prompt for a game recap
 */
function buildGameRecapPrompt(ctx) {
  let prompt = `You are a college football beat writer for a major sports publication like ESPN or The Athletic. Write a compelling 2-3 paragraph game recap in a professional, engaging sports journalism style.

GAME INFORMATION:
- ${ctx.userTeam} ${ctx.isWin ? 'defeated' : 'lost to'} ${ctx.opponent} ${ctx.userScore}-${ctx.opponentScore}
- Game Type: ${ctx.gameType}
- Location: ${ctx.location === 'home' ? 'Home' : ctx.location === 'away' ? 'Away' : 'Neutral Site'}
${ctx.isOvertime ? '- This game went to overtime' : ''}
${ctx.userRanking ? `- ${ctx.userTeam} was ranked #${ctx.userRanking}` : ''}
${ctx.opponentRanking ? `- ${ctx.opponent} was ranked #${ctx.opponentRanking}` : ''}

SEASON CONTEXT:
- Record entering the game: ${ctx.recordBefore}
- Record after the game: ${ctx.recordAfter}
${ctx.streak ? `- Currently on a ${ctx.streak}` : ''}
${ctx.isConferenceGame ? `- This was a ${ctx.conference} conference game` : ''}

GAME CHARACTER:
${ctx.isBlowout ? '- This was a dominant, one-sided victory' : ''}
${ctx.isCloseGame ? '- This was a hard-fought, close game decided by one score' : ''}
${ctx.isShutout ? '- One team was held scoreless (shutout)' : ''}
${ctx.isUpset ? '- This was an upset victory over a top-10 opponent' : ''}
${ctx.isRankedMatchup ? '- This was a ranked vs ranked matchup' : ''}`

  // Add box score stats if available
  if (ctx.boxScore) {
    prompt += `\n\nKEY STATISTICS FOR ${ctx.userTeam.toUpperCase()}:`

    if (ctx.boxScore.passing.length > 0) {
      prompt += `\nPassing:`
      ctx.boxScore.passing.forEach(p => {
        prompt += `\n  - ${p.player}: ${p.stats}`
      })
    }

    if (ctx.boxScore.rushing.length > 0) {
      prompt += `\nRushing:`
      ctx.boxScore.rushing.forEach(p => {
        prompt += `\n  - ${p.player}: ${p.stats}`
      })
    }

    if (ctx.boxScore.receiving.length > 0) {
      prompt += `\nReceiving:`
      ctx.boxScore.receiving.forEach(p => {
        prompt += `\n  - ${p.player}: ${p.stats}`
      })
    }

    if (ctx.boxScore.defense.length > 0) {
      prompt += `\nDefense:`
      ctx.boxScore.defense.forEach(p => {
        prompt += `\n  - ${p.player}: ${p.stats}`
      })
    }
  }

  if (ctx.gameNotes) {
    prompt += `\n\nADDITIONAL NOTES:\n${ctx.gameNotes}`
  }

  prompt += `\n\nWRITING GUIDELINES:
1. Write 2-3 paragraphs in an engaging, professional sports journalism style
2. Lead with the most compelling storyline (upset, dominant performance, close finish, etc.)
3. Highlight standout individual performances using the stats provided
4. Reference the season context and what this game means going forward
5. Use vivid, active language - avoid passive voice
6. Don't use generic phrases like "in an exciting game" - be specific
7. If box score stats are provided, weave them naturally into the narrative
8. End with forward-looking context about what's next for the team
9. Do NOT include a headline or title - just the article paragraphs
10. Do NOT use quotation marks for made-up quotes`

  return prompt
}

// ============================================
// API CALLS
// ============================================

/**
 * Generate content using Gemini API
 */
export async function generateWithGemini(apiKey, prompt) {
  if (!apiKey) {
    throw new Error('No API key provided')
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
        }
      })
    }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Failed to generate content')
  }

  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text

  if (!text) {
    throw new Error('No content generated')
  }

  return text.trim()
}

// ============================================
// HIGH-LEVEL GENERATION FUNCTIONS
// ============================================

/**
 * Generate a game recap
 */
export async function generateGameRecap(dynasty, game, apiKey) {
  const context = buildGameRecapContext(dynasty, game)
  const prompt = buildGameRecapPrompt(context)
  return generateWithGemini(apiKey, prompt)
}
