// Per-game score graphics — a game can hold up to THREE: one branded to each
// team plus a neutral one. Stored as:
//
//   game.scoreGraphics    = { team1?: url, neutral?: url, team2?: url }
//   game.scoreGraphicShown = 'team1' | 'neutral' | 'team2'  // which the overview shows
//
// Legacy single-graphic games (just `game.scoreGraphic`, no `scoreGraphics`)
// keep working: the overview falls back to that URL, and an official team
// account still shows it (the one image was never team-scoped, so it's the
// best we can do until the game is re-saved into the three-slot model).

export const GRAPHIC_SIDES = ['team1', 'neutral', 'team2']

// Normalized three-slot map (always the three keys, '' when unset). Does NOT
// fold in the legacy single field — that's handled by the read helpers below.
export function getScoreGraphicMap(game) {
  const m = game?.scoreGraphics || {}
  return { team1: m.team1 || '', neutral: m.neutral || '', team2: m.team2 || '' }
}

// True once the game has adopted the three-slot model (any slot filled).
export function hasMultiGraphics(game) {
  const m = getScoreGraphicMap(game)
  return !!(m.team1 || m.neutral || m.team2)
}

// Which side feeds the game overview: the explicit choice if it still has an
// image, else the first uploaded slot (team1 → neutral → team2), else null.
export function getShownSide(game) {
  const m = getScoreGraphicMap(game)
  const chosen = game?.scoreGraphicShown
  if (chosen && m[chosen]) return chosen
  return GRAPHIC_SIDES.find((s) => m[s]) || null
}

// The single URL shown in the game overview (the chosen slot, or the legacy
// single graphic when no three-slot data exists). '' when there is none.
export function getShownGraphic(game) {
  const side = getShownSide(game)
  if (side) return getScoreGraphicMap(game)[side]
  return game?.scoreGraphic || ''
}

// Map a tid to the side it plays in this game ('team1' | 'team2'), else null.
export function getSideForTid(game, tid) {
  if (tid == null || game == null) return null
  if (Number(game.team1Tid) === Number(tid)) return 'team1'
  if (Number(game.team2Tid) === Number(tid)) return 'team2'
  return null
}

// The graphic an official team account should attach in its social post: that
// team's own slot. For a pure-legacy game (no three-slot data) we fall back to
// the single graphic so existing posts don't lose their image; once the game
// adopts the three-slot model, only that team's slot counts. '' when none.
export function getTeamScoreGraphic(game, tid) {
  const side = getSideForTid(game, tid)
  if (!side) return ''
  if (hasMultiGraphics(game)) return getScoreGraphicMap(game)[side] || ''
  return game?.scoreGraphic || ''
}
