// Chronological ordering for game lists.
//
// A game's position WITHIN its season is not just its week number — postseason
// games (conference championship, bowls, CFP rounds) happen after the regular
// season and must rank above the highest regular week. gameSeasonRank encodes
// that timeline so "newest first" lists read correctly.

export function gameSeasonRank(g) {
  if (!g) return 0
  if (g.isCFPChampionship) return 240
  if (g.isCFPSemifinal) return 230
  if (g.isCFPQuarterfinal) return 220
  if (g.isCFPFirstRound) return 210
  if (g.isBowlGame) return 200
  if (g.isConferenceChampionship) return 100
  return Number(g.week) || 0
}

/**
 * Sort a list of games newest → oldest (year desc, then within-season position
 * desc). Returns a new array.
 *
 * @param {Array} items   - games, or wrappers containing a game
 * @param {Function} getGame - extract the game object from an item (default: identity)
 */
export function sortGamesNewestFirst(items, getGame = (x) => x) {
  if (!Array.isArray(items)) return []
  return [...items].sort((a, b) => {
    const ga = getGame(a)
    const gb = getGame(b)
    const yA = Number(ga?.year) || 0
    const yB = Number(gb?.year) || 0
    if (yB !== yA) return yB - yA
    return gameSeasonRank(gb) - gameSeasonRank(ga)
  })
}
