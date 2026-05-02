// Helpers for the multi-card-per-player system.
//
// Card shape:
//   { id, templateId, photoUrl, year, label, gameId, createdAt }
//
// `templateId` references an entry in src/data/cardTemplates. The
// composer (CardComposer) renders the card live by overlaying the
// player's photo + auto-derived team data into the template's grey
// zones — no static front/back image is stored.
//
// Legacy fields kept on the player record (cardFront, cardBack,
// cardGameId) are surfaced as a single virtual card on read so any
// previously-saved card still renders. Once the user saves the new
// editor those legacy fields are cleared.

import { DEFAULT_TEMPLATE_ID } from '../data/cardTemplates'

/**
 * Returns the player's cards as an array. Each entry is in the
 * canonical new shape. Falls back to a single legacy entry derived
 * from cardFront/cardBack/cardGameId when no cards array exists.
 */
export function getPlayerCards(player) {
  if (!player) return []
  if (Array.isArray(player.cards) && player.cards.length > 0) {
    // Normalize: older array entries may have used `front`/`back`
    // (image URLs from the previous design). Map those to the new
    // photoUrl + default templateId so they still render.
    return player.cards
      .filter(c => c && (c.photoUrl || c.front || c.back))
      .map(c => normalizeCard(c))
  }
  if (player.cardFront || player.cardBack) {
    return [{
      id: 'legacy',
      templateId: DEFAULT_TEMPLATE_ID,
      photoUrl: player.cardFront || player.cardBack || '',
      year: null,
      label: '',
      gameId: player.cardGameId || '',
      createdAt: null,
    }]
  }
  return []
}

/**
 * Coerce a card record (possibly in an older shape) into the
 * canonical new shape. Idempotent on already-canonical cards.
 */
export function normalizeCard(card) {
  if (!card) return null
  return {
    id: card.id || newCardId(),
    templateId: card.templateId || DEFAULT_TEMPLATE_ID,
    photoUrl: card.photoUrl || card.front || card.back || '',
    year: card.year ?? null,
    label: card.label || '',
    gameId: card.gameId || '',
    // Per-card photo transform — scale 1 + zero offsets means
    // straight object-cover (the default cropping behavior).
    // The editor's zoom slider + drag-to-pan write here.
    photoTransform: card.photoTransform || { scale: 1, offsetX: 0, offsetY: 0 },
    createdAt: card.createdAt || null,
  }
}

/**
 * Returns a fresh client-side card id. Crypto-randomUUID when
 * available; falls back to time-based for older browsers.
 */
export function newCardId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `crd_${crypto.randomUUID().slice(0, 12)}`
  }
  return `crd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Find every card across the dynasty that's tagged to a specific
 * game id. Returns `{ player, card }` pairs so callers (Game page
 * Cards tab) can render the player name alongside the rendered card.
 */
export function getCardsForGame(dynasty, gameId) {
  if (!dynasty?.players || !gameId) return []
  const out = []
  for (const player of dynasty.players) {
    const cards = getPlayerCards(player)
    for (const card of cards) {
      if (String(card.gameId || '') === String(gameId)) {
        out.push({ player, card })
      }
    }
  }
  return out
}

/**
 * Returns a fresh blank card record using the default template.
 */
export function makeBlankCard() {
  return {
    id: newCardId(),
    templateId: DEFAULT_TEMPLATE_ID,
    photoUrl: '',
    year: null,
    label: '',
    gameId: '',
    photoTransform: { scale: 1, offsetX: 0, offsetY: 0 },
    createdAt: new Date().toISOString(),
  }
}

/**
 * List the games a player participated in across every season,
 * shaped for the "tag this card to a game" dropdown. Newest first.
 * Each entry: { gameId, year, week, opponentAbbr, opponentName,
 * playerScore, oppScore, won, location, raw }.
 */
export function listPlayerGames(player, dynasty) {
  if (!player || !dynasty?.games) return []
  const games = []
  const teamsSrc = dynasty.teams || {}

  // Walk every game in the dynasty; include if the player was on
  // either team for that year (stint-based via teamHistory, or
  // teamsByYear fallback).
  for (const g of dynasty.games) {
    if (!g) continue
    const yr = Number(g.year)
    if (!Number.isFinite(yr)) continue
    if (typeof g.team1Score !== 'number' || typeof g.team2Score !== 'number') continue

    const teamTid = teamForYear(player, yr)
    if (teamTid == null) continue
    const t1 = Number(g.team1Tid)
    const t2 = Number(g.team2Tid)
    if (t1 !== teamTid && t2 !== teamTid) continue

    const playerTeamIsT1 = t1 === teamTid
    const oppTid = playerTeamIsT1 ? t2 : t1
    const opp = teamsSrc[oppTid]
    const playerScore = playerTeamIsT1 ? g.team1Score : g.team2Score
    const oppScore = playerTeamIsT1 ? g.team2Score : g.team1Score
    const isHome = g.homeTeamTid != null && Number(g.homeTeamTid) === teamTid
    const isNeutral = g.homeTeamTid == null
    const location = isNeutral ? 'neutral' : (isHome ? 'home' : 'away')

    games.push({
      gameId: g.id,
      year: yr,
      week: g.week,
      opponentAbbr: opp?.abbr || '',
      opponentName: opp?.name || g.team2 || '',
      playerScore, oppScore,
      won: playerScore > oppScore,
      location,
      raw: g,
    })
  }

  return games.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year
    return Number(b.week ?? 0) - Number(a.week ?? 0)
  })
}

function teamForYear(player, year) {
  if (Array.isArray(player.teamHistory) && player.teamHistory.length > 0) {
    for (const stint of player.teamHistory) {
      const from = Number(stint.fromYear)
      const to = stint.toYear == null ? Infinity : Number(stint.toYear)
      if (year >= from && year <= to) return Number(stint.teamTid)
    }
  }
  if (player.teamsByYear) {
    const t = player.teamsByYear[year] ?? player.teamsByYear[String(year)]
    if (t != null) return Number(t)
  }
  return null
}
