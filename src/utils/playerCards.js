// Helpers for the multi-card-per-player system.
//
// Each player has a `cards` array of card records:
//   { id, front, back, year, label, gameId, brandLabel, styleLabel, createdAt }
//
// `cardFront` / `cardBack` / `cardGameId` are LEGACY single-card fields
// kept on the record for backwards compatibility — when no cards
// array exists yet, those legacy fields surface as a single-entry
// virtual list. As soon as the user saves the Card tab, the array
// becomes the source of truth and the legacy fields are cleared.

/**
 * Returns the player's cards as an array. Falls back to a single
 * legacy entry derived from cardFront/cardBack/cardGameId when no
 * cards array exists yet.
 */
export function getPlayerCards(player) {
  if (!player) return []
  if (Array.isArray(player.cards) && player.cards.length > 0) {
    return player.cards.filter(c => c && (c.front || c.back))
  }
  if (player.cardFront || player.cardBack) {
    return [{
      id: 'legacy',
      front: player.cardFront || '',
      back: player.cardBack || '',
      year: null,
      label: '',
      gameId: player.cardGameId || '',
      brandLabel: '',
      styleLabel: '',
      createdAt: null,
    }]
  }
  return []
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
 * Cards tab) can render the player name alongside the flip card.
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
 * Hydrate a card draft from existing data — used to seed the
 * "edit existing card" form in the editor with sane defaults.
 */
export function makeBlankCard() {
  return {
    id: newCardId(),
    front: '',
    back: '',
    year: null,
    label: '',
    gameId: '',
    brandLabel: '',
    styleLabel: '',
    createdAt: new Date().toISOString(),
  }
}
