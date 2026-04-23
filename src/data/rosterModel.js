// rosterModel.js — v2 canonical readers + writers for player lifecycle data.
//
// Migration status: Phase 1. These helpers are SAFE TO USE ALONGSIDE legacy
// field access — they read canonical fields first and fall back to v1 shapes.
// Once Phase 3 lands, all call sites should route through these and the
// legacy-read branches below are removed.
//
// Canonical schema (see docs/ROSTER_DATA_MODEL_MIGRATION.md):
//   classByYear[year:Number]     → string (class label, e.g. 'Jr', 'RS Sr')
//   teamsByYear[year:Number]     → tid:Number
//   overallByYear[year:Number]   → Number
//   devTraitByYear[year:Number]  → string
//   movementByYear[year:Number]  → MovementEntry
//
// MovementEntry shapes:
//   { type: 'arrival', arrival: 'recruit' | 'transfer_in' | 'walk_on', fromTid?: number }
//   { type: 'departure', departure: 'graduated' | 'pro_draft' | 'transfer_out' | ..., toTid?: number|null, reason?: string }
//   { type: 'recommit' }

const toNum = (y) => {
  const n = Number(y)
  return Number.isFinite(n) ? n : null
}

const readByYear = (obj, year) => {
  if (!obj) return undefined
  const n = toNum(year)
  if (n == null) return undefined
  if (obj[n] !== undefined) return obj[n]
  if (obj[String(n)] !== undefined) return obj[String(n)]
  return undefined
}

// ─── READERS ────────────────────────────────────────────────────────────────

export function getPlayerClass(player, year, { currentYear } = {}) {
  if (!player) return null
  const v = readByYear(player.classByYear, year)
  if (v) return v
  // Only fall back to top-level player.year for the CURRENT year.
  if (currentYear != null && toNum(year) === toNum(currentYear)) {
    return player.year || null
  }
  return null
}

export function getPlayerTid(player, year, { currentYear } = {}) {
  if (!player) return null
  const v = readByYear(player.teamsByYear, year)
  if (v !== undefined && v !== null && v !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : v // tolerate legacy abbr strings for now
  }
  if (currentYear != null && toNum(year) === toNum(currentYear)) {
    const t = player.team
    const n = Number(t)
    return Number.isFinite(n) ? n : (t || null)
  }
  return null
}

export function getPlayerOverall(player, year, { currentYear } = {}) {
  if (!player) return null
  const v = readByYear(player.overallByYear, year)
  if (v != null) return Number(v)
  if (currentYear != null && toNum(year) === toNum(currentYear)) {
    return player.overall != null ? Number(player.overall) : null
  }
  return null
}

export function getPlayerDevTrait(player, year, { currentYear } = {}) {
  if (!player) return null
  const v = readByYear(player.devTraitByYear, year)
  if (v) return v
  if (currentYear != null && toNum(year) === toNum(currentYear)) {
    return player.devTrait || null
  }
  return null
}

export function getMovement(player, year) {
  if (!player) return null
  const n = toNum(year)
  if (n == null) return null
  // Prefer canonical movementByYear
  const v = readByYear(player.movementByYear, year)
  if (v) return v
  // Fall back to legacy movements[] array — convert first matching to canonical shape
  const legacy = (player.movements || []).find(m => toNum(m.year) === n)
  return legacy ? legacyMovementToCanonical(legacy) : null
}

export function getAllMovements(player) {
  if (!player) return {}
  const out = {}
  // Legacy first so canonical can overwrite.
  for (const m of player.movements || []) {
    const y = toNum(m.year)
    if (y == null) continue
    out[y] = legacyMovementToCanonical(m)
  }
  for (const [y, m] of Object.entries(player.movementByYear || {})) {
    const n = toNum(y)
    if (n == null) continue
    out[n] = m
  }
  return out
}

export function isOnRoster(player, tid, year) {
  const t = getPlayerTid(player, year)
  if (t == null) return false
  return Number(t) === Number(tid) || String(t) === String(tid)
}

export function getRosterYears(player) {
  const years = new Set()
  for (const y of Object.keys(player?.teamsByYear || {})) {
    const n = toNum(y)
    if (n != null) years.add(n)
  }
  return [...years].sort((a, b) => a - b)
}

// ─── WRITERS (return new player objects; never mutate) ──────────────────────

export function setPlayerClass(player, year, cls) {
  const n = toNum(year)
  if (n == null) return player
  return {
    ...player,
    classByYear: { ...(player.classByYear || {}), [n]: cls },
  }
}

export function setPlayerTid(player, year, tid) {
  const n = toNum(year)
  if (n == null) return player
  const t = Number(tid)
  return {
    ...player,
    teamsByYear: {
      ...(player.teamsByYear || {}),
      [n]: Number.isFinite(t) ? t : tid,
    },
  }
}

export function clearPlayerTid(player, year) {
  const n = toNum(year)
  if (n == null) return player
  const next = { ...(player.teamsByYear || {}) }
  delete next[n]
  delete next[String(n)]
  return { ...player, teamsByYear: next }
}

export function setPlayerOverall(player, year, ovr) {
  const n = toNum(year)
  if (n == null) return player
  return {
    ...player,
    overallByYear: { ...(player.overallByYear || {}), [n]: Number(ovr) },
  }
}

export function setPlayerDevTrait(player, year, trait) {
  const n = toNum(year)
  if (n == null) return player
  return {
    ...player,
    devTraitByYear: { ...(player.devTraitByYear || {}), [n]: trait },
  }
}

export function setMovement(player, year, entry) {
  const n = toNum(year)
  if (n == null) return player
  return {
    ...player,
    movementByYear: { ...(player.movementByYear || {}), [n]: entry },
  }
}

export function clearMovement(player, year) {
  const n = toNum(year)
  if (n == null) return player
  const next = { ...(player.movementByYear || {}) }
  delete next[n]
  delete next[String(n)]
  return { ...player, movementByYear: next }
}

// ─── LEGACY → CANONICAL MOVEMENT CONVERSION ─────────────────────────────────

export function legacyMovementToCanonical(m) {
  if (!m || !m.type) return null
  switch (m.type) {
    case 'recruited':
      return { type: 'arrival', arrival: 'recruit' }
    case 'transfer':
    case 'portal_in':
    case 'added':
      return {
        type: 'arrival',
        arrival: 'transfer_in',
        fromTid: m.from != null ? Number(m.from) : null,
      }
    case 'walk_on':
    case 'walk-on':
      return { type: 'arrival', arrival: 'walk_on' }
    case 'juco_in':
    case 'juco':
      return { type: 'arrival', arrival: 'juco' }
    case 'recommit':
    case 'recommitted':
      return { type: 'recommit' }
    case 'departure': {
      const reason = m.reason || ''
      if (reason === 'Graduating') return { type: 'departure', departure: 'graduated' }
      if (reason === 'Pro Draft') return { type: 'departure', departure: 'pro_draft', draftRound: m.draftRound || null }
      return {
        type: 'departure',
        departure: 'transfer_out',
        toTid: m.to != null ? Number(m.to) : null,
        reason: reason || null,
      }
    }
    case 'entered_portal':
      return {
        type: 'departure',
        departure: 'transfer_out',
        toTid: null,
        reason: m.reason || 'Entered Transfer Portal',
      }
    case 'graduated':
      return { type: 'departure', departure: 'graduated' }
    case 'declared_for_draft':
      return { type: 'departure', departure: 'pro_draft' }
    case 'transferred_out':
      return {
        type: 'departure',
        departure: 'transfer_out',
        toTid: m.toTeamTid != null ? Number(m.toTeamTid) : (m.to != null ? Number(m.to) : null),
        reason: m.reason || null,
      }
    case 'encouraged_to_transfer':
      return {
        type: 'departure',
        departure: 'transfer_out',
        toTid: null,
        reason: 'Encouraged Transfer',
      }
    default:
      return { type: 'unknown', legacyType: m.type, raw: m }
  }
}

// ─── SCHEMA VERSION ─────────────────────────────────────────────────────────

export const SCHEMA_VERSION = 2

export function isV2(player) {
  return player?._schemaVersion >= 2
}
