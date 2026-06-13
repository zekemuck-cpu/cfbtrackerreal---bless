import { canonicalBoxScore } from './boxScoreHelpers'
import { resolveTid } from '../data/teamRegistry'

export const TIER_CONFIG = {
  platinum: { label: 'PLATINUM', min: 3000, color: '#7dd3fc', glow: 'rgba(125,211,252,0.35)', border: 'rgba(125,211,252,0.5)' },
  gold:     { label: 'GOLD',     min: 2200, color: '#fbbf24', glow: 'rgba(251,191,36,0.35)',  border: 'rgba(251,191,36,0.5)' },
  silver:   { label: 'SILVER',   min: 1500, color: '#d1d5db', glow: 'rgba(209,213,219,0.30)', border: 'rgba(209,213,219,0.45)' },
  bronze:   { label: 'BRONZE',   min: 1000, color: '#cd7f32', glow: 'rgba(205,127,50,0.30)',  border: 'rgba(205,127,50,0.45)' },
}

export function getTier(score) {
  if (score >= 3000) return TIER_CONFIG.platinum
  if (score >= 2200) return TIER_CONFIG.gold
  if (score >= 1500) return TIER_CONFIG.silver
  if (score >= 1000) return TIER_CONFIG.bronze
  return null
}

/**
 * Parse the aiRecap for narrative drama signals.
 * Returns an object with confirmed deficit, quarter context, and categorical flags.
 */
function parseRecap(recap) {
  if (!recap) return { maxDeficit: 0, deficitInFourth: false, hasComeback: false, isRivalry: false, isWalkoff: false }

  const text = recap.toLowerCase()

  // Extract largest explicit deficit mentioned ("down 14 points", "trailing by 20", "28-point deficit")
  let maxDeficit = 0
  const patterns = [
    /(?:down|trailed? by|trailing by)\s+(\d+)\s+points?/g,
    /(?:down|trailed? by|trailing by)\s+(\d+)(?!\s*yard)/g,
    /(\d+)[- ]point\s+(?:deficit|hole|disadvantage)/g,
  ]
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const n = parseInt(m[1], 10)
      if (n > maxDeficit && n <= 99) maxDeficit = n
    }
  }

  // Check if a sizable deficit was in the fourth quarter / late in the game
  const deficitInFourth = maxDeficit >= 7 && /fourth quarter|4th quarter|final quarter/.test(text)

  // Comeback / rally language
  const hasComeback = /\b(?:comeback|rallied?|came back|miraculous|stunning|improbable|incredible comeback)\b/.test(text)

  // Rivalry game language — named trophies, "rivalry", classic series names
  const isRivalry = /\b(?:rivalry|governor'?s cup|iron bowl|bedlam|red river|palmetto bowl|border war|egg bowl|big game|clean old-fashioned hate|battle for the golden boot|toilet bowl|victory bell|paul bunyan|land grant trophy)\b/.test(text)

  // Walk-off / last-second heroics
  const isWalkoff = /\b(?:last[- ]second|walk[- ]off|hail mary|final (play|snap|second|moment|seconds?)|with no time|as time expired|at the buzzer|on the final play)\b/.test(text)

  return { maxDeficit, deficitInFourth, hasComeback, isRivalry, isWalkoff }
}

/**
 * Calculate the ESPN Classic Drama Score for a game from a specific team's perspective.
 * Returns null if the game has no final score.
 */
export function calcDramaScore(game, tid, teamsRegistry = null) {
  const resolve = (v) => resolveTid(v, teamsRegistry)
  const t1Tid = game.team1Tid != null ? Number(game.team1Tid) : resolve(game.team1)
  const t2Tid = game.team2Tid != null ? Number(game.team2Tid) : resolve(game.team2)
  const isTeam1 = t1Tid === Number(tid)

  const myScore  = isTeam1 ? game.team1Score  : game.team2Score
  const oppScore = isTeam1 ? game.team2Score  : game.team1Score
  const myRank   = isTeam1 ? game.team1Rank   : game.team2Rank
  const oppRank  = isTeam1 ? game.team2Rank   : game.team1Rank
  // Support both new format (team1/team2) and old format (team/opponent).
  // In the old format 'team' was always the dynasty's team, so no isTeam1 lookup needed.
  const hasNewQFormat = !!(game.quarters?.team1 || game.quarters?.team2)
  const myQ  = game.quarters
    ? (hasNewQFormat ? (isTeam1 ? game.quarters.team1  : game.quarters.team2)    : game.quarters.team)
    : null
  const oppQ = game.quarters
    ? (hasNewQFormat ? (isTeam1 ? game.quarters.team2  : game.quarters.team1)    : game.quarters.opponent)
    : null

  if (myScore == null || oppScore == null) return null

  // Quarter values may be stored as strings ("14") — always coerce to numbers.
  const qn = v => Number(v) || 0

  const margin = Math.abs(myScore - oppScore)
  const won    = myScore > oppScore
  let prestige = 0, comeback = 0, chaos = 0, milestones = 0, recapBonus = 0

  // A. Prestige
  if (myRank && oppRank && myRank <= 25 && oppRank <= 25) {
    prestige += 200
    if (myRank <= 5 && oppRank <= 5) prestige += 400
  }
  const isPost = !!(
    game.isBowlGame || game.isCFPFirstRound || game.isCFPQuarterfinal ||
    game.isCFPSemifinal || game.isCFPChampionship || game.isConferenceChampionship ||
    game.gameType === 'bowl' || game.gameType === 'conference_championship' ||
    game.gameType === 'cfp_first_round' || game.gameType === 'cfp_quarterfinal' ||
    game.gameType === 'cfp_semifinal'   || game.gameType === 'cfp_championship'
  )
  if (isPost) prestige += 200

  // B. Margin & Comeback
  if (margin <= 7) comeback += 200
  if (margin <= 3) comeback += 400
  const otCount = Array.isArray(game.overtimes) ? game.overtimes.length : 0
  if (otCount > 0) comeback += 300 + (otCount - 1) * 100

  // Quarter-based comeback: trailing after Q3 → won OR forced OT means a real comeback happened
  let deficitAfterQ3 = 0
  let estimatedPeakDeficit = 0
  if (myQ && oppQ && (won || otCount > 0)) {
    const myAfter3  = qn(myQ.Q1) + qn(myQ.Q2) + qn(myQ.Q3)
    const oppAfter3 = qn(oppQ.Q1) + qn(oppQ.Q2) + qn(oppQ.Q3)
    if (myAfter3 < oppAfter3) {
      deficitAfterQ3 = oppAfter3 - myAfter3
      comeback += deficitAfterQ3 >= 10 ? 500 : 300
      // If the opponent also scored in Q4, the real peak deficit was even deeper —
      // estimate it as Q3-end deficit + all opponent Q4 points (worst-case ordering).
      const oppQ4 = qn(oppQ.Q4)
      estimatedPeakDeficit = deficitAfterQ3 + oppQ4
      if (estimatedPeakDeficit >= 28) comeback += 500  // legendary 28+ point Q4 hole
      else if (estimatedPeakDeficit >= 20) comeback += 350  // canonical "down 20 in Q4"
      else if (estimatedPeakDeficit >= 14) comeback += 150
    }
  }

  // C. Lead Changes (estimated from quarter splits)
  if (myQ && oppQ) {
    let myRun = 0, oppRun = 0, last = null, changes = 0
    for (const q of ['Q1', 'Q2', 'Q3', 'Q4']) {
      myRun  += qn(myQ[q])
      oppRun += qn(oppQ[q])
      const leader = myRun > oppRun ? 'my' : myRun < oppRun ? 'opp' : null
      if (leader && leader !== last) { if (last !== null) changes++; last = leader }
    }
    chaos += Math.min(changes * 50, 300)
  }
  if (otCount > 0) chaos += Math.min(otCount * 300, 600)

  // High-scoring game — two teams combining for 80+ is unusually entertaining
  const totalPoints = myScore + oppScore
  if (totalPoints >= 100) chaos += 300
  else if (totalPoints >= 90) chaos += 200
  else if (totalPoints >= 80) chaos += 100

  // D. Milestones — underdog win
  if (won) {
    const myR  = myRank  || 999
    const oppR = oppRank || 999
    if ((!myRank && oppR <= 10) || (myRank && myR - oppR >= 15)) milestones += 200
  }
  // Box-score heroics
  if (game.boxScore) {
    const bs = canonicalBoxScore(game)
    if (bs) {
      let heroCount = 0
      for (const slot of Object.values(bs.byTid)) {
        if (!slot) continue
        for (const p of (slot.passing   || [])) { if ((p.yds ?? p.yards ?? 0) >= 450 || (p.td ?? p.tds ?? 0) >= 5) heroCount++ }
        for (const p of (slot.rushing   || [])) { if ((p.yds ?? p.yards ?? 0) >= 200 || (p.td ?? p.tds ?? 0) >= 5) heroCount++ }
        for (const p of (slot.receiving || [])) { if ((p.yds ?? p.yards ?? 0) >= 200 || (p.td ?? p.tds ?? 0) >= 5) heroCount++ }
      }
      milestones += Math.min(heroCount * 150, 300)
    }
  }

  // E. Recap analysis — mine aiRecap for confirmed drama signals
  const recapSignals = parseRecap(game.aiRecap)
  if (recapSignals.maxDeficit > 0 && (won || otCount > 0)) {
    // Confirmed deficit from the narrative — only credit extra beyond what quarter data already gave us
    const confirmedDeficit = recapSignals.maxDeficit
    const baselineDeficit = estimatedPeakDeficit || deficitAfterQ3
    if (confirmedDeficit > baselineDeficit) {
      // Recap reveals a bigger hole than quarters alone suggest
      if (confirmedDeficit >= 28) recapBonus += 400
      else if (confirmedDeficit >= 20) recapBonus += 250
      else if (confirmedDeficit >= 14) recapBonus += 100
    }
    // Q4 comeback context: being down big IN the 4th is more dramatic than entering it down
    if (recapSignals.deficitInFourth && confirmedDeficit >= 14) recapBonus += 400
    else if (recapSignals.deficitInFourth && confirmedDeficit >= 7) recapBonus += 150
  }
  if (recapSignals.hasComeback && (won || otCount > 0)) recapBonus += 150
  if (recapSignals.isRivalry)         recapBonus += 300
  if (recapSignals.isWalkoff)         recapBonus += 200

  const total = prestige + comeback + chaos + milestones + recapBonus
  return { total, prestige, comeback, chaos, milestones, recapBonus, margin, won, otCount, isPost }
}

/**
 * Given all dynasty games and a user's primary tid, return the sorted list of
 * classic games (score >= 1000) with their rank. Returns [{ game, ds, tier, rank }].
 */
export function getClassicGames(allGames, userTid, teamsRegistry = null) {
  const tid = Number(userTid)
  return allGames
    .filter(g => {
      if (g.team1Score == null || g.team2Score == null) return false
      const t1 = g.team1Tid != null ? Number(g.team1Tid) : resolveTid(g.team1, teamsRegistry)
      const t2 = g.team2Tid != null ? Number(g.team2Tid) : resolveTid(g.team2, teamsRegistry)
      return t1 === tid || t2 === tid
    })
    .map(g => {
      const ds   = calcDramaScore(g, tid, teamsRegistry)
      if (!ds) return null
      const tier = getTier(ds.total)
      if (!tier) return null
      return { game: g, ds, tier }
    })
    .filter(Boolean)
    .sort((a, b) => b.ds.total - a.ds.total)
    .map((entry, i) => ({ ...entry, rank: i + 1 }))
}

/** Inline ESPN Classic badge — import-safe, no JSX deps at utility layer. */
export const ESPN_CLASSIC_BADGE_STYLE = {
  espn:    { background: '#cc0000', color: '#fff', fontWeight: 900, fontSize: '11px', letterSpacing: '1px', padding: '2px 5px', lineHeight: 1.2 },
  classic: { background: '#1a1a1a', color: '#cc0000', fontWeight: 900, fontSize: '10px', letterSpacing: '2px', padding: '2px 5px', lineHeight: 1.2, border: '1px solid #cc0000', borderLeft: 'none' },
}
