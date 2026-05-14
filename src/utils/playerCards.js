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
import { weekSortKey } from './compareUtils'

/**
 * Returns the player's cards as an array. Two shapes coexist:
 *   • Legacy (PNG-template-based): { templateId, photoUrl, ... }
 *   • New (prompt-driven):         { styleId, frontImageUrl, backImageUrl, ... }
 * The list filter keeps anything that's "real" under either shape so the
 * Player profile Cards tab and the editor list show both kinds. Empty
 * scaffolds (e.g. an unsaved new-style card with no images yet) drop out
 * of the read view but stay in the editor's working state.
 */
export function getPlayerCards(player) {
  if (!player) return []
  if (Array.isArray(player.cards) && player.cards.length > 0) {
    return player.cards
      .filter(c => {
        if (!c) return false
        // Prompt-driven card: at least one image side present.
        if (c.styleId !== undefined && c.templateId === undefined) {
          return !!(c.frontImageUrl || c.backImageUrl)
        }
        // Legacy: photoUrl / front / back URL present.
        return !!(c.photoUrl || c.front || c.back)
      })
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
 * Coerce a card record into a canonical shape. Idempotent on already-
 * canonical cards. Detects the prompt-driven shape via the presence of
 * `styleId` (without `templateId`) so it doesn't accidentally merge
 * legacy fields onto a new-style record.
 */
export function normalizeCard(card) {
  if (!card) return null
  // Prompt-driven (new) shape — passes through verbatim with sensible
  // fallbacks. Doesn't pick up `templateId` so the renderer's branch
  // stays clean.
  if (card.styleId !== undefined && card.templateId === undefined) {
    return {
      id: card.id || newCardId(),
      styleId: card.styleId || '',
      contextType: card.contextType || 'season',
      contextDetails: card.contextDetails || {},
      year: card.year ?? null,
      frontImageUrl: card.frontImageUrl || '',
      backImageUrl: card.backImageUrl || '',
      label: card.label || '',
      createdAt: card.createdAt || null,
    }
  }
  // Legacy (PNG-template) shape.
  return {
    id: card.id || newCardId(),
    templateId: card.templateId || DEFAULT_TEMPLATE_ID,
    photoUrl: card.photoUrl || card.front || card.back || '',
    year: card.year ?? null,
    label: card.label || '',
    gameId: card.gameId || '',
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
 *
 * Handles BOTH card shapes:
 *  • Legacy template-based: top-level `gameId`.
 *  • Prompt-driven:         `contextType === 'game'` plus
 *                           `contextDetails.gameId`.
 */
export function getCardsForGame(dynasty, gameId) {
  if (!dynasty?.players || !gameId) return []
  const out = []
  const target = String(gameId)
  for (const player of dynasty.players) {
    const cards = getPlayerCards(player)
    for (const card of cards) {
      const legacyGameId = String(card.gameId || '')
      const contextGameId = card.contextType === 'game'
        ? String(card.contextDetails?.gameId || '')
        : ''
      if (legacyGameId === target || contextGameId === target) {
        out.push({ player, card })
      }
    }
  }
  return out
}

/**
 * Flat list of every card across the dynasty, paired with its player.
 * Used by the sidebar Card Collection page. Returns newest-first by
 * createdAt, falling back to player name + card id for stable ordering
 * when timestamps are missing.
 */
export function getAllDynastyCards(dynasty) {
  if (!dynasty?.players) return []
  const out = []
  for (const player of dynasty.players) {
    const cards = getPlayerCards(player)
    for (const card of cards) {
      out.push({ player, card })
    }
  }
  out.sort((a, b) => {
    const ta = Number(a.card.createdAt) || 0
    const tb = Number(b.card.createdAt) || 0
    if (ta !== tb) return tb - ta
    const na = a.player?.name || ''
    const nb = b.player?.name || ''
    if (na !== nb) return na.localeCompare(nb)
    return String(a.card.id).localeCompare(String(b.card.id))
  })
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
    if (!isGamePlayed(g)) continue

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
    return weekSortKey(b.week) - weekSortKey(a.week)
  })
}

/**
 * Has this game actually been played? Mirrors the heuristic used in
 * DynastyContext (isPlayed flag → result string → boxScore presence →
 * non-zero score). Scheduled-but-unplayed games carry null or 0
 * scores and must be excluded from the card editor's game picker.
 */
function isGamePlayed(g) {
  if (!g) return false
  if (g.isPlayed === true) return true
  const r = g.result
  if (r === 'win' || r === 'loss' || r === 'W' || r === 'L' || r === 'tie') return true
  if (g.boxScore && typeof g.boxScore === 'object' && Object.keys(g.boxScore).length > 0) return true
  if ((Number(g.team1Score) || 0) !== 0 || (Number(g.team2Score) || 0) !== 0) return true
  return false
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
