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
 * Handles both user games (with opponent/teamScore) and CPU games (with team1/team2)
 */
export function buildGameRecapContext(dynasty, game) {
  const userTeamAbbr = getAbbreviationFromDisplayName(dynasty.teamName) || dynasty.teamName
  const year = game.year
  const allGames = dynasty.games || []

  // Detect if this is a CPU vs CPU game
  const isCPUGame = !game.userTeam && game.team1 && game.team2

  // Determine teams and scores based on game type
  let team1, team2, team1Score, team2Score
  if (isCPUGame) {
    team1 = game.team1
    team2 = game.team2
    team1Score = game.team1Score
    team2Score = game.team2Score
  } else {
    team1 = game.userTeam || userTeamAbbr
    team2 = game.opponent
    team1Score = game.teamScore
    team2Score = game.opponentScore
  }

  const scoreDiff = Math.abs(team1Score - team2Score)
  const team1Won = team1Score > team2Score

  // For user games, get season context
  let recordBefore = null
  let recordAfter = null
  let streak = null

  if (!isCPUGame) {
    const seasonGames = allGames.filter(g =>
      Number(g.year) === Number(year) &&
      (g.userTeam === userTeamAbbr || g.opponent)
    )

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

    const isWin = game.result === 'win' || game.result === 'W'
    recordBefore = `${winsBefore}-${lossesBefore}`
    recordAfter = isWin ? `${winsBefore + 1}-${lossesBefore}` : `${winsBefore}-${lossesBefore + 1}`

    // Calculate streak
    const gamesUpToThis = [...gamesBefore, game].sort((a, b) => getGameOrder(a) - getGameOrder(b))
    let streakCount = 0
    const streakType = isWin ? 'win' : 'loss'
    for (let i = gamesUpToThis.length - 1; i >= 0; i--) {
      const g = gamesUpToThis[i]
      const gWin = g.result === 'win' || g.result === 'W'
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
  const team1Ranking = isCPUGame ? game.team1Rank : game.ranking
  const team2Ranking = isCPUGame ? game.team2Rank : game.opponentRank
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

  // Extract box score stats if available - get for both teams
  let boxScoreContext = null
  if (game.boxScore) {
    boxScoreContext = extractBoxScoreHighlightsForBothTeams(game.boxScore, team1, team2, game)
  }

  return {
    // Game type flag
    isCPUGame,

    // Team info
    team1,
    team2,
    team1Score,
    team2Score,
    team1Won,
    winner: team1Won ? team1 : team2,
    loser: team1Won ? team2 : team1,
    winnerScore: team1Won ? team1Score : team2Score,
    loserScore: team1Won ? team2Score : team1Score,

    // Game basics
    week: game.week,
    year: game.year,
    gameType: gameTypeDescription,
    location: game.location,

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

    // Box score highlights for both teams
    boxScore: boxScoreContext,

    // Bowl/CFP info
    bowlName: game.bowlName,
    cfpSeed: game.cfpSeed,

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
 */
function extractBoxScoreHighlightsForBothTeams(boxScore, team1, team2, game) {
  // For user games, determine sides based on location
  // For CPU games, home/away is already correct
  const location = game.location || 'home'
  const team1IsHome = location === 'home' || location === 'neutral' || game.team1

  const team1Side = team1IsHome ? 'home' : 'away'
  const team2Side = team1IsHome ? 'away' : 'home'

  return {
    team1: extractHighlightsForSide(boxScore, team1Side),
    team2: extractHighlightsForSide(boxScore, team2Side),
    team1Name: team1,
    team2Name: team2
  }
}

// ============================================
// PROMPT TEMPLATES
// ============================================

/**
 * Build the prompt for a game recap
 * Works with both user games and CPU vs CPU games
 */
function buildGameRecapPrompt(ctx) {
  // Build the game result line
  const resultLine = `${ctx.winner} defeated ${ctx.loser} ${ctx.winnerScore}-${ctx.loserScore}`

  let prompt = `You are a college football beat writer for a major sports publication like ESPN or The Athletic. Write a compelling 2-3 paragraph game recap in a professional, engaging sports journalism style.

GAME INFORMATION:
- ${resultLine}
- Game Type: ${ctx.gameType}
- Location: ${ctx.location === 'home' ? 'Home' : ctx.location === 'away' ? 'Away' : 'Neutral Site'}
${ctx.isOvertime ? '- This game went to overtime' : ''}
${ctx.team1Ranking ? `- ${ctx.team1} was ranked #${ctx.team1Ranking}` : ''}
${ctx.team2Ranking ? `- ${ctx.team2} was ranked #${ctx.team2Ranking}` : ''}

GAME CHARACTER:
${ctx.isBlowout ? '- This was a dominant, one-sided victory' : ''}
${ctx.isCloseGame ? '- This was a hard-fought, close game decided by one score' : ''}
${ctx.isShutout ? '- One team was held scoreless (shutout)' : ''}
${ctx.isUpset ? '- This was an upset victory over a top-10 opponent' : ''}
${ctx.isRankedMatchup ? '- This was a ranked vs ranked matchup' : ''}`

  // Add season context only for user games (not available for CPU games)
  if (!ctx.isCPUGame && ctx.recordBefore) {
    prompt += `\n\nSEASON CONTEXT FOR ${ctx.team1}:
- Record entering the game: ${ctx.recordBefore}
- Record after the game: ${ctx.recordAfter}
${ctx.streak ? `- Currently on a ${ctx.streak}` : ''}
${ctx.isConferenceGame ? `- This was a ${ctx.conference} conference game` : ''}`
  }

  // Add box score stats for both teams if available
  if (ctx.boxScore) {
    // Add stats for team1 (winner focus or first team)
    const team1Stats = ctx.boxScore.team1
    if (team1Stats) {
      prompt += `\n\nKEY STATISTICS FOR ${ctx.boxScore.team1Name.toUpperCase()}:`
      if (team1Stats.passing.length > 0) {
        prompt += `\nPassing:`
        team1Stats.passing.forEach(p => {
          prompt += `\n  - ${p.player}: ${p.stats}`
        })
      }
      if (team1Stats.rushing.length > 0) {
        prompt += `\nRushing:`
        team1Stats.rushing.forEach(p => {
          prompt += `\n  - ${p.player}: ${p.stats}`
        })
      }
      if (team1Stats.receiving.length > 0) {
        prompt += `\nReceiving:`
        team1Stats.receiving.forEach(p => {
          prompt += `\n  - ${p.player}: ${p.stats}`
        })
      }
      if (team1Stats.defense.length > 0) {
        prompt += `\nDefense:`
        team1Stats.defense.forEach(p => {
          prompt += `\n  - ${p.player}: ${p.stats}`
        })
      }
    }

    // Add stats for team2
    const team2Stats = ctx.boxScore.team2
    if (team2Stats) {
      prompt += `\n\nKEY STATISTICS FOR ${ctx.boxScore.team2Name.toUpperCase()}:`
      if (team2Stats.passing.length > 0) {
        prompt += `\nPassing:`
        team2Stats.passing.forEach(p => {
          prompt += `\n  - ${p.player}: ${p.stats}`
        })
      }
      if (team2Stats.rushing.length > 0) {
        prompt += `\nRushing:`
        team2Stats.rushing.forEach(p => {
          prompt += `\n  - ${p.player}: ${p.stats}`
        })
      }
      if (team2Stats.receiving.length > 0) {
        prompt += `\nReceiving:`
        team2Stats.receiving.forEach(p => {
          prompt += `\n  - ${p.player}: ${p.stats}`
        })
      }
      if (team2Stats.defense.length > 0) {
        prompt += `\nDefense:`
        team2Stats.defense.forEach(p => {
          prompt += `\n  - ${p.player}: ${p.stats}`
        })
      }
    }
  }

  if (ctx.gameNotes) {
    prompt += `\n\nADDITIONAL NOTES:\n${ctx.gameNotes}`
  }

  prompt += `\n\nWRITING GUIDELINES:
1. Write 2-3 paragraphs in an engaging, professional sports journalism style
2. Lead with the most compelling storyline (upset, dominant performance, close finish, etc.)
3. Highlight standout individual performances using the stats provided
4. Use vivid, active language - avoid passive voice
5. Don't use generic phrases like "in an exciting game" - be specific
6. If box score stats are provided, weave them naturally into the narrative
7. Do NOT include a headline or title - just the article paragraphs
8. Do NOT use quotation marks for made-up quotes`

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
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
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
