// Per-player heal — sanitizes the shapes most commonly responsible for
// the "We couldn't render this player" error boundary. Idempotent: a
// clean player passes through unchanged, so re-running on every profile
// load is cheap (microseconds for the typical record).
//
// What this fixes
// ---------------
// React error #31 ("Objects are not valid as a React child") fires when
// the player profile or timeline tries to render a value that's an
// object instead of a primitive. The legacy → v2 movement migration
// left a few stale shapes that can trigger it:
//
// 1. `movementByYear[year]` entries that are null, missing `type`, or
//    poison-shaped ({ type: 'unknown', legacyType, raw }). The DynastyContext
//    heal already tackles these on dynasty load, but it modifies in-memory
//    only — the on-disk record is still dirty, so a later code path that
//    re-reads from storage (or a future render that picks up the raw
//    field) can still crash.
// 2. `teamsByYear[year]` values that landed as objects ({ tid, conf, ... })
//    instead of bare tid numbers. Several timeline render paths feed this
//    value directly into JSX as `to: teamsByYear[year]`, which is exactly
//    the React #31 trigger.
// 3. `teamHistory[]` stints whose `teamTid` / `fromYear` / `toYear` slots
//    are non-primitives.
//
// The heal walks each of these and emits a cleaned copy. Anything it
// can't recover gets dropped (better than crashing the page). Returns
// `{ player: healedPlayer, changed: boolean }` — caller writes back
// only when `changed` is true so we don't churn writes on clean records.

const CANONICAL_MOVEMENT_TYPES = new Set(['arrival', 'departure', 'recommit'])

// Legacy → canonical translation. Mirrors the small subset of
// legacyMovementToCanonical that we expect to see in the wild — kept
// inline here so the heal is self-contained and doesn't depend on the
// DynastyContext heal landing on this branch first.
function legacyMovementShapeToCanonical(m) {
  if (!m || typeof m !== 'object' || typeof m.type !== 'string') return null
  switch (m.type) {
    case 'recruited':
      return { type: 'arrival', arrival: 'recruit' }
    case 'transferred_in':
    case 'portal_in':
      return { type: 'arrival', arrival: 'transfer_in', fromTid: numericOrNull(m.fromTid ?? m.fromTeamTid) }
    case 'juco_in':
      return { type: 'arrival', arrival: 'juco' }
    case 'walk_on':
    case 'added':
      return { type: 'arrival', arrival: 'walk_on' }
    case 'graduated':
      return { type: 'departure', departure: 'graduated' }
    case 'declared_for_draft':
      return { type: 'departure', departure: 'pro_draft', draftRound: numericOrNull(m.draftRound) }
    case 'transferred_out':
    case 'entered_portal':
      return { type: 'departure', departure: 'transfer_out', reason: stringOrNull(m.reason) }
    case 'recommitted':
    case 'recommit':
      return { type: 'recommit', reason: stringOrNull(m.reason) }
    case 'encouraged_to_transfer':
    case 'encouraged_transfer':
      return { type: 'departure', departure: 'transfer_out', reason: 'Encouraged to transfer' }
    default:
      return null
  }
}

function numericOrNull(v) {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function stringOrNull(v) {
  if (v == null) return null
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  // Objects / arrays in a slot expecting a string would be the React #31
  // trigger — return null so the renderer sees a safe absence rather
  // than the malformed value.
  return null
}

function healMovementByYear(mby) {
  if (!mby || typeof mby !== 'object') return { value: mby, changed: false }
  const cleaned = {}
  let changed = false
  for (const [yearKey, m] of Object.entries(mby)) {
    // Drop entries with bad keys / values we can't make sense of.
    if (!m || typeof m !== 'object') {
      changed = true
      continue
    }
    if (typeof m.type !== 'string' || m.type.length === 0) {
      changed = true
      continue
    }
    if (CANONICAL_MOVEMENT_TYPES.has(m.type)) {
      cleaned[yearKey] = m
      continue
    }
    if (m.type === 'unknown') {
      // Poison shape from the earlier migration bug. Try to recover
      // from raw; otherwise drop.
      const recovered = m.raw ? legacyMovementShapeToCanonical(m.raw) : null
      if (recovered) {
        cleaned[yearKey] = recovered
      }
      changed = true
      continue
    }
    // Legacy type — translate to canonical v2.
    const canonical = legacyMovementShapeToCanonical(m)
    if (canonical) {
      cleaned[yearKey] = canonical
    }
    changed = true
  }
  return { value: cleaned, changed }
}

function healTeamsByYear(tby) {
  if (!tby || typeof tby !== 'object') return { value: tby, changed: false }
  const cleaned = {}
  let changed = false
  for (const [yearKey, raw] of Object.entries(tby)) {
    if (typeof raw === 'number' || (typeof raw === 'string' && /^\d+$/.test(raw))) {
      cleaned[yearKey] = raw
      continue
    }
    if (raw && typeof raw === 'object') {
      // Common malformed shape: { tid, conf } or { teamTid }. Extract
      // the tid; if we can't, drop the year (better than rendering an
      // object).
      const tid = numericOrNull(raw.tid ?? raw.teamTid ?? raw.value)
      if (tid != null) {
        cleaned[yearKey] = tid
      }
      changed = true
      continue
    }
    if (raw == null) {
      changed = true
      continue
    }
    // Anything else (boolean, function, etc.) — drop.
    changed = true
  }
  return { value: cleaned, changed }
}

function healTeamHistory(history) {
  if (!Array.isArray(history)) {
    if (history == null) return { value: history, changed: false }
    return { value: [], changed: true }
  }
  const cleaned = []
  let changed = false
  for (const stint of history) {
    if (!stint || typeof stint !== 'object') {
      changed = true
      continue
    }
    const teamTid = numericOrNull(stint.teamTid ?? stint.tid)
    const fromYear = numericOrNull(stint.fromYear ?? stint.from)
    const toYear = stint.toYear === null ? null : numericOrNull(stint.toYear ?? stint.to)
    if (teamTid == null || fromYear == null) {
      changed = true
      continue
    }
    const next = { teamTid, fromYear, toYear, reason: stringOrNull(stint.reason) }
    if (
      next.teamTid !== stint.teamTid ||
      next.fromYear !== stint.fromYear ||
      next.toYear !== stint.toYear ||
      next.reason !== stint.reason
    ) {
      changed = true
    }
    cleaned.push(next)
  }
  return { value: cleaned, changed }
}

// Sync the legacy convenience fields (player.year / .overall / .devTrait /
// .team) to the canonical by-year maps for the dynasty's current year.
// These fields are still read in many render paths as the "current value"
// shortcut, so when they drift from the by-year maps the player profile
// shows stale data (the old "OVR 79 in header but 83 in progression
// modal" class of bug). syncDerivedFieldsFromV2 already does this on
// every save, but a player who hasn't been touched since the by-year
// maps got updated via some other path can drift in the meantime.
function syncDerivedSingleValues(player, currentYear) {
  if (!player || typeof player !== 'object') return { value: player, changed: false }
  if (!Number.isFinite(Number(currentYear))) return { value: player, changed: false }
  const yr = Number(currentYear)
  const lookups = [
    { key: 'year', mapKey: 'classByYear' },
    { key: 'overall', mapKey: 'overallByYear' },
    { key: 'devTrait', mapKey: 'devTraitByYear' },
    { key: 'team', mapKey: 'teamsByYear' },
  ]
  let changed = false
  let next = player
  for (const { key, mapKey } of lookups) {
    const map = player[mapKey]
    if (!map || typeof map !== 'object') continue
    const fromMap = map[yr] ?? map[String(yr)]
    if (fromMap == null || fromMap === '') continue
    if (player[key] === fromMap) continue
    if (next === player) next = { ...player }
    next[key] = fromMap
    changed = true
  }
  return { value: next, changed }
}

export function healPlayer(player, options = {}) {
  if (!player || typeof player !== 'object') return { player, changed: false }
  let changed = false
  let next = player

  if ('movementByYear' in player) {
    const r = healMovementByYear(player.movementByYear)
    if (r.changed) {
      next = next === player ? { ...player } : next
      next.movementByYear = r.value
      changed = true
    }
  }
  if ('teamsByYear' in player) {
    const r = healTeamsByYear(player.teamsByYear)
    if (r.changed) {
      next = next === player ? { ...player } : next
      next.teamsByYear = r.value
      changed = true
    }
  }
  if ('teamHistory' in player) {
    const r = healTeamHistory(player.teamHistory)
    if (r.changed) {
      next = next === player ? { ...player } : next
      next.teamHistory = r.value
      changed = true
    }
  }
  // Drop the legacy `movements[]` array entirely. The by-year map
  // (movementByYear) is the source of truth; rosterModel's
  // syncDerivedFieldsFromV2 already deletes movements[] on every
  // canonical write, but data that came in via legacy code paths or
  // partial migrations can still carry it. Removing it here keeps the
  // record clean post-load and prevents any stragglers from being read
  // by legacy fallback paths.
  if (Array.isArray(player.movements)) {
    next = next === player ? { ...player } : next
    delete next.movements
    changed = true
  }
  // Sync the legacy single-value convenience fields (year/overall/
  // devTrait/team) to the canonical by-year maps for the current year.
  // Optional — caller passes currentYear when the dynasty is loaded;
  // skipped otherwise.
  if (options.currentYear != null) {
    const r = syncDerivedSingleValues(next, options.currentYear)
    if (r.changed) {
      next = r.value
      changed = true
    }
  }

  return { player: next, changed }
}

// Bump this string when adding new heal logic so the next profile view
// re-runs the walk on every player. Format YYYY.MM.DD lets you grep
// commits for "HEAL_VERSION" alongside dated changelog entries.
//
// 2026.05.07: also strip legacy player.movements[] array and sync
// player.year / .overall / .devTrait / .team to the current-year
// values from the by-year maps.
export const PLAYER_HEAL_VERSION = '2026.05.07'
