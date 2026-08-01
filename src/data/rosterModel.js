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

// Canonical v2 movement types. Anything matching one of these is already
// canonical and must pass through unchanged — feeding a canonical entry
// back through the legacy switch produces { type: 'unknown', ... } since
// the legacy cases don't include 'arrival'/'departure'/'recommit', and
// that corrupted shape then persists in movementByYear and crashes
// renders downstream.
//
// 'unknown' is included only so syncDerivedFieldsFromV2 can recognize the
// poison shape and recover from `raw` — callers should never store it.
const CANONICAL_MOVEMENT_TYPES = new Set(['arrival', 'departure', 'recommit', 'unknown'])

export function legacyMovementToCanonical(m) {
  if (!m || !m.type) return null
  if (CANONICAL_MOVEMENT_TYPES.has(m.type)) return m
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
      // Preserve any destination tid the legacy entry happened to carry
      // (rare, but legacy code paths could populate toTeamTid when the
      // player picked a destination in the same step). Default null is
      // correct for a "still in the portal" state.
      return {
        type: 'departure',
        departure: 'transfer_out',
        toTid: m.toTeamTid != null ? Number(m.toTeamTid)
          : (m.toTid != null ? Number(m.toTid)
          : (m.to != null ? Number(m.to) : null)),
        reason: m.reason || 'Entered Transfer Portal',
      }
    case 'graduated':
      return { type: 'departure', departure: 'graduated' }
    case 'declared_for_draft':
      return {
        type: 'departure',
        departure: 'pro_draft',
        draftRound: m.draftRound != null ? m.draftRound : null,
      }
    case 'transferred_out':
      return {
        type: 'departure',
        departure: 'transfer_out',
        toTid: m.toTeamTid != null ? Number(m.toTeamTid)
          : (m.toTid != null ? Number(m.toTid)
          : (m.to != null ? Number(m.to) : null)),
        reason: m.reason || null,
      }
    case 'encouraged_to_transfer':
      // Was hard-coding toTid: null and reason: 'Encouraged Transfer',
      // dropping the user-supplied destination tid + reason on every
      // canonicalization pass. Now preserves both, matching the shape
      // the PlayerEdit modal stores when the user explicitly picks the
      // school they were forced out to.
      return {
        type: 'departure',
        departure: 'transfer_out',
        toTid: m.toTeamTid != null ? Number(m.toTeamTid)
          : (m.toTid != null ? Number(m.toTid)
          : (m.to != null ? Number(m.to) : null)),
        reason: m.reason || 'Encouraged Transfer',
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

// ─── SYNC DERIVED FIELDS FROM V2 ────────────────────────────────────────────
//
// Collapses every legacy top-level roster field into a DERIVED mirror of the
// v2 canonical data. Run this on every player write so:
//   player.year      === classByYear[currentYear]
//   player.team      === teamsByYear[currentYear] (tid)
//   player.overall   === overallByYear[currentYear]
//   player.devTrait  === devTraitByYear[currentYear]
//   player.movements === [] (deleted — movementByYear is authoritative)
//
// Drops legacy junk fields that no v2 code path needs anymore. Missing
// canonical values leave the derived field as null (never guessed).
// _schemaVersion is stamped to 2 so the DynastyMigrationModal doesn't
// re-prompt for this player next load.
//
// IMPORTANT: this never removes nested year keys. It only rewrites the
// "current year convenience" top-level copies and strips deprecated arrays.
export function syncDerivedFieldsFromV2(player, currentYear) {
  if (!player) return player

  // Coerce all per-year keys to Number (Firestore can return string keys).
  const normalizedClassByYear = {}
  for (const [k, v] of Object.entries(player.classByYear || {})) {
    const n = Number(k)
    if (Number.isFinite(n) && v != null && v !== '') normalizedClassByYear[n] = v
  }
  const normalizedTeamsByYear = {}
  for (const [k, v] of Object.entries(player.teamsByYear || {})) {
    const n = Number(k)
    if (!Number.isFinite(n)) continue
    if (v == null || v === '') continue
    const asNum = Number(v)
    normalizedTeamsByYear[n] = Number.isFinite(asNum) ? asNum : v
  }
  // Preserve stint-based teamHistory before it's dropped at the end of this
  // function. teamHistory is the sole roster source for imported / stint-editor
  // players, and isPlayerOnRoster reads teamsByYear ONLY — so any year that
  // lives only in teamHistory silently vanishes once teamHistory is deleted.
  //
  // Previously this only ran when teamsByYear was ENTIRELY empty, to avoid
  // resurrecting a departed player. But a player with a PARTIAL teamsByYear
  // (e.g. only the current year, seeded by saveRoster) plus a teamHistory
  // covering earlier years took the skip path and lost every earlier year.
  // So we now backfill missing years even when teamsByYear has data, but with
  // two guards that preserve the original anti-resurrection intent:
  //   1. Never fill a year BEYOND the last year already in teamsByYear —
  //      teamsByYear is the source of truth for where the roster ends, so a
  //      stale/open stint can't extend a player past a departure that shows
  //      up simply as teamsByYear ending.
  //   2. Cap OPEN stints (toYear null) at any recorded departure year, so an
  //      un-closed stint doesn't run through the current year past a real exit.
  // The inner `== null` guard still ensures we only fill gaps, never overwrite.
  if (Array.isArray(player.teamHistory) && player.teamHistory.length > 0) {
    const cyNum = Number(currentYear)
    const existingYears = Object.keys(normalizedTeamsByYear).map(Number).filter(Number.isFinite)
    const maxExistingYear = existingYears.length ? Math.max(...existingYears) : null

    // Earliest recorded departure (movementByYear + legacy movements[]). Note
    // bare legacy 'transfer' is an ARRIVAL, not a departure.
    const DEP_TYPES = new Set(['departure', 'entered_portal', 'transferred_out', 'graduated', 'declared_for_draft', 'encouraged_to_transfer'])
    const DEP_SHAPES = new Set(['transfer_out', 'graduated', 'pro_draft'])
    let earliestDepYear = null
    for (const [yStr, m] of Object.entries(player.movementByYear || {})) {
      const y = Number(yStr)
      if (Number.isFinite(y) && m && (DEP_TYPES.has(m.type) || DEP_SHAPES.has(m.departure))) {
        if (earliestDepYear == null || y < earliestDepYear) earliestDepYear = y
      }
    }
    for (const m of (Array.isArray(player.movements) ? player.movements : [])) {
      const y = Number(m?.year)
      if (Number.isFinite(y) && m && DEP_TYPES.has(m.type)) {
        if (earliestDepYear == null || y < earliestDepYear) earliestDepYear = y
      }
    }

    for (const stint of player.teamHistory) {
      const stintTid = Number(stint?.teamTid ?? stint?.tid)
      const from = Number(stint?.fromYear)
      if (!Number.isFinite(stintTid) || !Number.isFinite(from)) continue
      const toNum = Number(stint?.toYear)
      const hasExplicitTo = stint?.toYear != null && stint?.toYear !== '' && Number.isFinite(toNum)
      let to = hasExplicitTo ? toNum : (Number.isFinite(cyNum) ? cyNum : from)
      // Guard 2: open stint capped at a recorded departure.
      if (!hasExplicitTo && earliestDepYear != null && earliestDepYear >= from) {
        to = Math.min(to, earliestDepYear)
      }
      // Guard 1: never extend beyond the known roster span.
      if (maxExistingYear != null) to = Math.min(to, maxExistingYear)
      for (let y = from; y <= to && y - from < 60; y++) {
        if (normalizedTeamsByYear[y] == null) normalizedTeamsByYear[y] = stintTid
      }
    }
  }

  const normalizedOverallByYear = {}
  for (const [k, v] of Object.entries(player.overallByYear || {})) {
    const n = Number(k)
    const val = Number(v)
    if (Number.isFinite(n) && Number.isFinite(val)) normalizedOverallByYear[n] = val
  }
  const normalizedDevTraitByYear = {}
  for (const [k, v] of Object.entries(player.devTraitByYear || {})) {
    const n = Number(k)
    if (Number.isFinite(n) && v != null && v !== '') normalizedDevTraitByYear[n] = v
  }

  // Collapse any remaining legacy movements[] entries into movementByYear,
  // richer-entry-wins on collision. Output is authoritative v2.
  const normalizedMovementByYear = { ...(player.movementByYear || {}) }
  const richness = (o) => Object.values(o || {}).filter(x => x != null && x !== '').length
  for (const m of player.movements || []) {
    const n = Number(m?.year)
    if (!Number.isFinite(n)) continue
    const canonical = legacyMovementToCanonical(m)
    if (!canonical || canonical.type === 'unknown') continue
    const existing = normalizedMovementByYear[n] || normalizedMovementByYear[String(n)]
    if (!existing || richness(canonical) > richness(existing)) {
      normalizedMovementByYear[n] = canonical
    }
  }
  // Re-key movementByYear to Number keys too. Drop anything whose `type`
  // isn't a canonical v2 type — covers two failure modes:
  //   1. { type: 'unknown', legacyType, raw } poison from an earlier
  //      migration bug. We recover from `raw` when possible so the user
  //      doesn't lose the entry, otherwise drop.
  //   2. Legacy types that somehow leaked into movementByYear (whose
  //      consumers all expect canonical shapes). Run them through the
  //      legacy converter so they end up canonical.
  // Anything that survives this filter is guaranteed to be a renderer-
  // safe canonical entry — that's what kept Player.jsx black-screening.
  const finalMovementByYear = {}
  for (const [k, v] of Object.entries(normalizedMovementByYear)) {
    const n = Number(k)
    if (!Number.isFinite(n)) continue
    if (!v || typeof v !== 'object' || !v.type) continue
    if (CANONICAL_MOVEMENT_TYPES.has(v.type) && v.type !== 'unknown') {
      finalMovementByYear[n] = v
      continue
    }
    if (v.type === 'unknown') {
      const recovered = v.raw ? legacyMovementToCanonical(v.raw) : null
      if (recovered && recovered.type !== 'unknown') finalMovementByYear[n] = recovered
      continue
    }
    // Legacy type that landed here — try to canonicalize it.
    const canonical = legacyMovementToCanonical(v)
    if (canonical && canonical.type !== 'unknown') finalMovementByYear[n] = canonical
  }

  // Derive the four top-level "current year" mirrors from canonical state.
  // Falls back to the existing top-level value only when canonical has
  // nothing for currentYear — that covers the case where the caller hasn't
  // yet populated the current year's class/overall (e.g. mid-edit).
  const cy = Number(currentYear)
  const derivedClass = Number.isFinite(cy) && normalizedClassByYear[cy] != null
    ? normalizedClassByYear[cy]
    : (player.year || null)
  const derivedTid = Number.isFinite(cy) && normalizedTeamsByYear[cy] != null
    ? normalizedTeamsByYear[cy]
    : (player.team != null ? player.team : null)
  const derivedOverall = Number.isFinite(cy) && normalizedOverallByYear[cy] != null
    ? normalizedOverallByYear[cy]
    : (player.overall != null ? Number(player.overall) : null)
  const derivedDevTrait = Number.isFinite(cy) && normalizedDevTraitByYear[cy]
    ? normalizedDevTraitByYear[cy]
    : (player.devTrait || null)

  const out = {
    ...player,
    classByYear: normalizedClassByYear,
    teamsByYear: normalizedTeamsByYear,
    overallByYear: normalizedOverallByYear,
    devTraitByYear: normalizedDevTraitByYear,
    movementByYear: finalMovementByYear,
    year: derivedClass,
    team: derivedTid,
    overall: derivedOverall,
    devTrait: derivedDevTrait,
    _schemaVersion: SCHEMA_VERSION,
  }

  // Strip deprecated keys that have no v2 equivalent. Their job was to
  // describe state that is now fully represented in the per-year maps
  // above, and leaving them around invites drift.
  delete out.movements
  delete out.teamHistory
  delete out._legacy_teamsByYear
  delete out.entryYear
  delete out.entryClass
  delete out.leftTeam
  delete out.leftYear
  delete out.leftReason
  delete out.leavingYear
  delete out.leavingReason
  delete out.transferredTo
  delete out.pendingDeparture
  // Legacy 'teams' array (list of abbrs) — superseded by teamsByYear.
  if (Array.isArray(out.teams)) delete out.teams

  return out
}
