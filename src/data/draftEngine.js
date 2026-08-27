// Fictional "who got picked by who" overlay for the Full Draft Results view.
// The real fields (round, position, overall, college tid) all come straight
// from the save's LeavingPlayer.ProjectRound projections — this engine only
// invents the two things the save has no data for at all: which of the 32
// NFL teams a player lands on, and what pick number within their (real,
// save-decided) round they go at. Never labeled as simulated in the UI per
// the user's request — it's meant to read as a natural extension of the
// real draft-round data, not a disclosed guess.
//
// This app's real `position` field (as extracted from the save — see
// buildPlayerRows in api/_lib/cfb27Extract/extractPlayers.cjs) uses the
// game's classic split taxonomy: LE/RE (not LEDG/REDG), LOLB/MLB/ROLB (not
// SAM/MIKE/WILL) — verified directly against a real save's whole-league
// draft class, NOT the rosterOptions.js dropdown label set (which is a
// different, human-friendly vocabulary used only by manual roster entry and
// does not match what actually comes out of the save). POSITION_FAMILY
// below maps each real tag to the family its premium/roster-cap is judged
// by, while the original tag is still what gets displayed.

const POSITION_FAMILY = {
  QB: 'QB',
  HB: 'RB',
  FB: 'RB',
  WR: 'WR',
  TE: 'TE',
  LT: 'OT',
  RT: 'OT',
  LG: 'OG',
  RG: 'OG',
  C: 'C',
  LE: 'EDGE',
  RE: 'EDGE',
  DT: 'DT',
  LOLB: 'LB',
  MLB: 'LB',
  ROLB: 'LB',
  CB: 'CB',
  FS: 'S',
  SS: 'S',
  K: 'K',
  P: 'P',
}

const POS_PREMIUMS = {
  QB: 5.0,
  EDGE: 3.2,
  OT: 2.8,
  CB: 2.2,
  WR: 2.0,
  DT: 1.2,
  S: 0.0,
  TE: 0.0,
  OG: -1.0,
  C: -1.5,
  LB: -1.8,
  RB: -2.2,
  K: -8.0,
  P: -8.0,
}

const HARD_ROSTER_LIMITS = {
  QB: 1,
  K: 1,
  P: 1,
  RB: 2,
  TE: 2,
  C: 2,
  OG: 2,
  OT: 2,
  EDGE: 2,
  DT: 2,
  LB: 2,
  CB: 3,
  WR: 3,
  S: 2,
}

export const NFL_TEAMS = [
  'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE',
  'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC',
  'LAC', 'LAR', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG',
  'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WAS',
]

// Reverse order of ESPN's 2026 NFL FPI power rankings (worst-projected team
// picks first, same as how a real draft order works) — used ONLY for the
// very first year a dynasty ever generates mock draft picks, so a brand
// new dynasty's round 1 reads as grounded in today's real NFL landscape
// rather than fully arbitrary. A light shuffle (a couple of swaps, not a
// full reshuffle) is applied on top so it doesn't look mechanically
// identical to the rankings. Every later year reverts to a fully random
// order — see mergeSimulatedDraftPicks' useRealisticOrder param.
export const REAL_2026_DRAFT_ORDER = [
  'MIA', 'NYJ', 'CLE', 'ARI', 'LV', 'TEN', 'CAR', 'NO',
  'ATL', 'NYG', 'PIT', 'WAS', 'IND', 'MIN', 'TB', 'JAX',
  'CHI', 'DEN', 'NE', 'HOU', 'CIN', 'DAL', 'PHI', 'KC',
  'DET', 'LAC', 'GB', 'SF', 'SEA', 'BAL', 'BUF', 'LAR',
]

function positionFamily(pos) {
  return POSITION_FAMILY[pos] || pos
}

// Box-Muller transform for Gaussian noise around a player's raw board score.
function randomGaussian(mean, stdev) {
  const u = 1 - Math.random()
  const v = Math.random()
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
  return z * stdev + mean
}

function shuffle(array) {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// N random pair-swaps on top of a base order — not a full reshuffle, so
// most of the order stays intact for small N.
function swapShuffle(array, numSwaps) {
  const arr = [...array]
  for (let s = 0; s < numSwaps; s++) {
    const i = Math.floor(Math.random() * arr.length)
    let j = Math.floor(Math.random() * (arr.length - 1))
    if (j >= i) j += 1
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// Every year this dynasty ever generates mock picks stays anchored to the
// same real base order, but each successive generation drifts further from
// it — generation 0 (the dynasty's first-ever generated year) gets only
// 1-3 swaps, generation 1 gets 4-8, generation 2 gets 7-13, and so on,
// until the swap count is high enough (~16+ out of 32 teams) that the
// result is indistinguishable from a full random shuffle anyway — at that
// point just do a real one rather than relying on enough partial swaps to
// probabilistically approximate it.
function driftingShuffle(array, generation) {
  const minSwaps = 1 + generation * 3
  const maxSwaps = 3 + generation * 5
  if (minSwaps >= 16) return shuffle(array)
  const numSwaps = minSwaps + Math.floor(Math.random() * (maxSwaps - minSwaps + 1))
  return swapShuffle(array, numSwaps)
}

class NFLDraftEngine {
  constructor(players, options = {}) {
    this.players = players.map((p) => ({ ...p }))
    this.teams = options.baseOrder
      ? driftingShuffle(options.baseOrder, options.driftGeneration ?? 0)
      : shuffle(NFL_TEAMS)
    this.teamRosters = {}
    this.teams.forEach((team) => {
      this.teamRosters[team] = {}
    })
  }

  _getRoundOrder(roundNum) {
    const order = [...this.teams]
    if (roundNum > 1) {
      const numTrades = Math.floor(Math.random() * 3) + 2 // 2 to 4 trades
      for (let t = 0; t < numTrades; t++) {
        const i = Math.floor(Math.random() * order.length)
        // Guarantee a real swap (distinct index), rather than an occasional
        // self-swap no-op — keeps every round's order genuinely shuffled.
        let j = Math.floor(Math.random() * (order.length - 1))
        if (j >= i) j += 1
        ;[order[i], order[j]] = [order[j], order[i]]
      }
    }
    return order
  }

  _calculatePlayerBoardScore(player, roundNum) {
    const sigma = 1.0 + roundNum * 0.45
    const posWeight = POS_PREMIUMS[positionFamily(player.pos)] || 0.0
    const noise = randomGaussian(0, sigma)
    return Number(player.ovr) + posWeight + noise
  }

  _calculateTeamFitScore(team, pos, baseScore, roundNum) {
    const family = positionFamily(pos)
    const currentCount = this.teamRosters[team][family] || 0
    const maxAllowed = HARD_ROSTER_LIMITS[family] ?? 2

    if (currentCount >= maxAllowed) return -999.0

    let needMultiplier = 1.0
    if (currentCount === 1) needMultiplier = 0.35
    else if (currentCount === 2) needMultiplier = 0.1

    if (['K', 'P'].includes(family) && roundNum < 5) return -999.0

    const teamBias = 0.92 + Math.random() * (1.08 - 0.92)
    return baseScore * needMultiplier * teamBias
  }

  // True hard cap: only ever hands a team a player whose family is already
  // full if literally every remaining player in the round is also capped
  // for every team (should never actually happen with 32 teams x ~10+
  // families, but guards against an infinite/empty pick rather than
  // silently blowing through a cap the way a naive "pick index 0" fallback
  // would).
  _pickForTeam(team, roundPool, roundNum) {
    const windowSize = Math.min(6, roundPool.length)
    let bestIdx = -1
    let bestFitScore = -Infinity
    for (let i = 0; i < windowSize; i++) {
      const prospect = roundPool[i]
      const fitScore = this._calculateTeamFitScore(team, prospect.pos, prospect.boardScore, roundNum)
      if (fitScore > bestFitScore) {
        bestFitScore = fitScore
        bestIdx = i
      }
    }
    if (bestFitScore > -999.0) return bestIdx

    // Everyone in the top-6 window is capped for this team — widen the
    // search to the full remaining pool before giving up the cap entirely.
    for (let i = windowSize; i < roundPool.length; i++) {
      const prospect = roundPool[i]
      const family = positionFamily(prospect.pos)
      const currentCount = this.teamRosters[team][family] || 0
      const maxAllowed = HARD_ROSTER_LIMITS[family] ?? 2
      if (currentCount < maxAllowed) return i
    }
    return 0
  }

  simulate() {
    const draftResults = []
    let overallPickCounter = 1

    for (let roundNum = 1; roundNum <= 7; roundNum++) {
      let roundPool = this.players
        .filter((p) => Number(p.round) === roundNum)
        .map((p) => ({ ...p, boardScore: this._calculatePlayerBoardScore(p, roundNum) }))

      if (roundPool.length === 0) continue

      roundPool.sort((a, b) => b.boardScore - a.boardScore)

      const roundOrder = this._getRoundOrder(roundNum)

      for (let slotIndex = 0; slotIndex < roundOrder.length; slotIndex++) {
        if (roundPool.length === 0) break

        const team = roundOrder[slotIndex]
        const pickIdx = this._pickForTeam(team, roundPool, roundNum)
        const [selectedPlayer] = roundPool.splice(pickIdx, 1)

        const family = positionFamily(selectedPlayer.pos)
        this.teamRosters[team][family] = (this.teamRosters[team][family] || 0) + 1

        draftResults.push({
          assetName: selectedPlayer.assetName,
          overallPick: overallPickCounter,
          round: roundNum,
          roundPick: slotIndex + 1,
          pickLabel: `Pick ${slotIndex + 1}`,
          team,
          name: selectedPlayer.name,
          pos: selectedPlayer.pos,
          ovr: selectedPlayer.ovr,
          boardScore: Number(selectedPlayer.boardScore.toFixed(2)),
          isCompensatory: false,
        })
        overallPickCounter++
      }

      // Overflow (> 32 players projected into one round) — the save's own
      // projections decide round assignment, not this engine, so a stacked
      // round is handled rather than assumed away. NOTE: if every team is
      // already at its cap for a position (only possible when supply for
      // that position exceeds 32 x its cap — extremely unlikely in a real
      // class), eligibleTeams is empty and the fallback below places the
      // player on a random team anyway rather than dropping a real player
      // from the board. A cap violation here is a deliberate last resort,
      // not a bug — every real leaving player has to land somewhere.
      while (roundPool.length > 0) {
        const compPlayer = roundPool.shift()
        const family = positionFamily(compPlayer.pos)
        const eligibleTeams = this.teams.filter(
          (t) => (this.teamRosters[t][family] || 0) < (HARD_ROSTER_LIMITS[family] ?? 2)
        )
        const assignedTeam = eligibleTeams.length > 0
          ? eligibleTeams[Math.floor(Math.random() * eligibleTeams.length)]
          : this.teams[Math.floor(Math.random() * this.teams.length)]

        this.teamRosters[assignedTeam][family] = (this.teamRosters[assignedTeam][family] || 0) + 1

        draftResults.push({
          assetName: compPlayer.assetName,
          overallPick: null,
          round: roundNum,
          roundPick: null,
          pickLabel: 'Late Pick',
          team: assignedTeam,
          name: compPlayer.name,
          pos: compPlayer.pos,
          ovr: compPlayer.ovr,
          boardScore: Number(compPlayer.boardScore.toFixed(2)),
          isCompensatory: true,
        })
      }
    }

    return draftResults
  }
}

export function runDraftEngine(players, options) {
  return new NFLDraftEngine(players, options).simulate()
}

/**
 * Overlays fictional NFL team + pick-number assignments onto this sync's
 * real whole-league draft results (round/position/overall/tid — all from
 * the save itself, see buildLeagueDraftResults). Generated exactly ONCE per
 * dynasty year: if previousResults already carries mock picks (some entry
 * has a `team`), those are carried forward by assetName match instead of
 * re-running the engine — the real fields above are still refreshed fresh
 * every sync (a player's projected round can keep shifting sync to sync
 * right up until it's resolved), but the fictional destination, once
 * assigned, never changes for that player again this year.
 *
 * If a player's real round shifts AFTER their pick was frozen, their old
 * mock assignment is dropped (not carried forward, not regenerated) rather
 * than shown attached to a round it no longer matches — a mismatched pick
 * number would read as more obviously wrong than simply not having one yet.
 * A brand-new leaver appearing in a later sync (after the year's one-time
 * generation already ran) is left without a mock assignment for the same
 * reason: the alternative is re-running the whole class and reshuffling
 * everyone who already has a fixed, previously-seen pick.
 *
 * @param {Array<object>} freshResults - this sync's buildLeagueDraftResults() output
 * @param {Array<object>|undefined} previousResults - dynasty.leagueDraftResultsByYear[year] before this sync
 * @param {{generationIndex?: number}} [options] - how many OTHER years in
 *   this dynasty have already had their mock picks generated (see
 *   buildSyncPlan's call site) — 0 for the dynasty's first-ever generated
 *   year, 1 for the second, etc. Every year still starts from
 *   REAL_2026_DRAFT_ORDER, but drifts further from it with each generation
 *   (driftingShuffle) until enough years have passed that it's
 *   indistinguishable from fully random.
 */
export function mergeSimulatedDraftPicks(freshResults, previousResults, options = {}) {
  if (!freshResults || freshResults.length === 0) return freshResults || []

  const alreadyGenerated = (previousResults || []).some((r) => r.team)
  if (alreadyGenerated) {
    const prevByAssetName = new Map((previousResults || []).map((r) => [r.assetName, r]))
    return freshResults.map((r) => {
      const prev = prevByAssetName.get(r.assetName)
      if (prev && prev.team && prev.round === r.round) {
        return {
          ...r,
          team: prev.team,
          overallPick: prev.overallPick,
          roundPick: prev.roundPick,
          pickLabel: prev.pickLabel,
          isCompensatory: prev.isCompensatory,
        }
      }
      return r
    })
  }

  const picks = runDraftEngine(
    freshResults.map((r) => ({ assetName: r.assetName, name: r.playerName, pos: r.position, ovr: r.overall, round: r.round })),
    { baseOrder: REAL_2026_DRAFT_ORDER, driftGeneration: options.generationIndex ?? 0 }
  )
  const pickByAssetName = new Map(picks.map((p) => [p.assetName, p]))
  return freshResults.map((r) => {
    const pick = pickByAssetName.get(r.assetName)
    if (!pick) return r
    return {
      ...r,
      team: pick.team,
      overallPick: pick.overallPick,
      roundPick: pick.roundPick,
      pickLabel: pick.pickLabel,
      isCompensatory: pick.isCompensatory,
    }
  })
}
