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

// Reclassify generic "in the portal" entries that are actually a more
// specific outcome the user already recorded elsewhere on the player.
// Background: re-saving the Players Leaving sheet was clobbering
// drafted/graduated players back to `{ type: 'departure', departure:
// 'transfer_out', toTid: null, reason: null }`, because the sheet's
// catch-all branch treated anything not "Pro Draft" / "Graduating" as
// portal-unknown. handleDraftResultsSave still kept draftRound /
// draftYear on the top-level fields, so we can detect the mismatch:
//
//   - If movementByYear[player.draftYear] is the generic transfer_out
//     stub, but player.draftYear / draftRound are set, restore
//     pro_draft.
//   - If movementByYear[lastSeasonYear] is the generic transfer_out
//     stub and the player's class for that year was Sr / RS Sr,
//     restore graduated. (Seniors who hit their final year and exit
//     are graduating by definition; the only reason they'd land on
//     the leaving sheet with a portal reason is the same clobber.)
//
// The heuristic is conservative: only fires when the existing entry is
// the EXACT generic stub (transfer_out + null toTid + null reason).
// Real portal entries with a destination or a real reason pass through.
function reclassifyMisclassifiedDepartures(mby, player) {
  if (!mby || typeof mby !== 'object') return { value: mby, changed: false }
  const isGenericPortalStub = (m) =>
    m && m.type === 'departure' && m.departure === 'transfer_out'
    && m.toTid == null && (m.reason == null || m.reason === '')
  const cleaned = { ...mby }
  let changed = false

  // Draft case — strongest signal. draftYear matches a generic stub.
  const draftYear = Number(player?.draftYear)
  if (Number.isFinite(draftYear)) {
    const key = mby[draftYear] !== undefined ? draftYear : (mby[String(draftYear)] !== undefined ? String(draftYear) : null)
    if (key !== null && isGenericPortalStub(cleaned[key])) {
      cleaned[key] = {
        type: 'departure',
        departure: 'pro_draft',
        ...(player.draftRound != null ? { draftRound: player.draftRound } : {}),
      }
      changed = true
    }
  }

  // Graduation case — class for the stub year was Sr / RS Sr.
  const classByYear = player?.classByYear || {}
  for (const [yearKey, m] of Object.entries(cleaned)) {
    if (!isGenericPortalStub(m)) continue
    const cls = classByYear[yearKey] ?? classByYear[Number(yearKey)] ?? classByYear[String(yearKey)]
    if (cls === 'Sr' || cls === 'RS Sr') {
      cleaned[yearKey] = { type: 'departure', departure: 'graduated' }
      changed = true
    }
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

// Coerce a stats value to a number-or-null. Stats slots like
// gamesPlayed / snapsPlayed / yds / td / etc. are read directly into
// JSX as `<td>{y.gamesPlayed}</td>`. A bad migration left `{}` in the
// gamesPlayed slot of CJ Carr's record, which crashed the render with
// React #31 because `{} || 0` evaluates to `{}` (truthy). Anything
// non-numeric becomes 0 here so renders stay safe.
function statNumber(v) {
  if (v == null) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// Heal one stat-category sub-object (passing / rushing / etc.) by
// coercing every value to a number. Returns the cleaned object plus a
// `changed` flag so the caller can short-circuit identity preservation.
function healStatCategory(cat) {
  if (!cat || typeof cat !== 'object') return { value: null, changed: !!cat }
  let changed = false
  const cleaned = {}
  for (const [k, v] of Object.entries(cat)) {
    const safe = statNumber(v)
    if (safe !== v) changed = true
    cleaned[k] = safe
  }
  return { value: cleaned, changed }
}

// Walk statsByYear and sanitize every leaf. gamesPlayed / snapsPlayed
// must be numbers; each category (passing/rushing/etc.) must be an
// object whose fields are numbers. Drops year entries that are
// completely malformed.
function healStatsByYear(stats) {
  if (!stats || typeof stats !== 'object') return { value: stats, changed: false }
  const cleaned = {}
  let changed = false
  for (const [yr, year] of Object.entries(stats)) {
    if (!year || typeof year !== 'object') {
      changed = true
      continue
    }
    const next = {}
    for (const [key, val] of Object.entries(year)) {
      if (key === 'gamesPlayed' || key === 'snapsPlayed') {
        const safe = statNumber(val)
        if (safe !== val) changed = true
        next[key] = safe
        continue
      }
      // Recognized category key — sanitize each numeric field.
      if (
        key === 'passing' || key === 'rushing' || key === 'receiving' ||
        key === 'blocking' || key === 'defense' || key === 'defensive' ||
        key === 'kicking' || key === 'punting' || key === 'kickReturn' ||
        key === 'puntReturn'
      ) {
        const r = healStatCategory(val)
        if (r.changed) changed = true
        if (r.value) next[key] = r.value
        else changed = true
        continue
      }
      // Unknown key — pass through unless it's clearly bad.
      if (val != null && typeof val === 'object' && !Array.isArray(val)) {
        // Object-shaped unknown key — drop to be safe.
        changed = true
        continue
      }
      next[key] = val
    }
    cleaned[yr] = next
  }
  return { value: cleaned, changed }
}

// Coerce a value into something that's safe to interpolate into JSX
// — string/number/boolean only. Objects in render-bound slots are the
// classic React #31 trigger ("Objects are not valid as a React child")
// and the offending shape is most often an empty {} that survived a
// partial migration. Anything non-primitive becomes null.
function primitiveOrNull(v) {
  if (v == null) return null
  const t = typeof v
  if (t === 'string' || t === 'number' || t === 'boolean') return v
  return null
}

// Heal a per-year map whose values must be primitives (classByYear,
// overallByYear, devTraitByYear, positionByYear). Drops year entries
// whose value is an object — better an absent year than a render crash.
function healPrimitiveByYearMap(map, coerce = primitiveOrNull) {
  if (!map || typeof map !== 'object') return { value: map, changed: false }
  const cleaned = {}
  let changed = false
  for (const [yearKey, raw] of Object.entries(map)) {
    const safe = coerce(raw)
    if (safe == null && raw != null) {
      changed = true
      continue
    }
    if (safe == null) {
      changed = true
      continue
    }
    cleaned[yearKey] = safe
    if (safe !== raw) changed = true
  }
  return { value: cleaned, changed }
}

// Top-level scalar fields read directly into JSX in the player profile
// (header card, stat strip, biography line, sidebar). Must be primitives
// or null — anything object-shaped here is what crashes the page with
// React #31.
const SCALAR_FIELDS = [
  'name', 'firstName', 'lastName', 'position', 'archetype', 'jerseyNumber',
  'year', 'overall', 'devTrait', 'height', 'weight', 'hometown', 'state',
  'pictureUrl', 'notes', 'recruitYear', 'previousTeam', 'team', 'stars',
  'nationalRank', 'stateRank', 'positionRank', 'gemBust', 'draftRound',
  'draftPick', 'draftYear', 'pid',
]

function healScalarFields(player) {
  let changed = false
  let next = player
  for (const key of SCALAR_FIELDS) {
    if (!(key in player)) continue
    const safe = primitiveOrNull(player[key])
    if (safe === player[key]) continue
    if (next === player) next = { ...player }
    if (safe == null) {
      delete next[key]
    } else {
      next[key] = safe
    }
    changed = true
  }
  return { value: next, changed }
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
  // Reclassify generic "in the portal" stubs that should be pro_draft
  // (player has draftYear / draftRound) or graduated (class was Sr/RS
  // Sr). Runs AFTER healMovementByYear so we operate on canonical
  // entries.
  {
    const r = reclassifyMisclassifiedDepartures(next.movementByYear, next)
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
  // Per-year primitive maps. classByYear / overallByYear / devTraitByYear
  // / positionByYear are read directly into JSX in the year-by-year
  // tables and the sidebar timeline. An object value at any year is the
  // most common React #31 trigger we still see in the wild — sanitize
  // each map by dropping non-primitive year entries.
  for (const key of ['classByYear', 'overallByYear', 'devTraitByYear', 'positionByYear']) {
    if (!(key in player)) continue
    const r = healPrimitiveByYearMap(player[key])
    if (r.changed) {
      next = next === player ? { ...player } : next
      next[key] = r.value
      changed = true
    }
  }
  // Top-level scalar fields. The header card / biography line / sidebar
  // read these directly; an object value here is exactly the empty-{}
  // child the user reported.
  const scalar = healScalarFields(next)
  if (scalar.changed) {
    next = scalar.value
    changed = true
  }
  // statsByYear leaves. The year-by-year stat tables render values
  // directly (`<td>{y.gamesPlayed}</td>`), and a single object-shaped
  // gamesPlayed/snapsPlayed/yds/etc. crashes the page with React #31.
  // A real player record from the user (CJ Carr) shipped with
  // gamesPlayed: {} from some partial migration. Coerce every leaf
  // to a number.
  if ('statsByYear' in next) {
    const r = healStatsByYear(next.statsByYear)
    if (r.changed) {
      next = next === player ? { ...player, ...next } : { ...next }
      next.statsByYear = r.value
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
// re-runs the walk on every player. Format YYYY.MM.DD.vvvv (vvvv is a
// 4-digit sequence number resetting daily) keeps stamps lexicographically
// sortable and unambiguous when multiple bumps land the same day.
//
// 2026.05.07.0001: also strip legacy player.movements[] array and sync
// player.year / .overall / .devTrait / .team to the current-year
// values from the by-year maps.
// 2026.05.07.0002: sanitize per-year primitive maps (classByYear,
// overallByYear, devTraitByYear, positionByYear) and top-level scalar
// fields (position, archetype, height, hometown, state, etc.) — drop
// non-primitive values that crash the renderer with React #31.
// 2026.05.07.0003: sanitize statsByYear leaves — coerce gamesPlayed,
// snapsPlayed, and every category field (passing/rushing/etc.) to a
// number. CJ Carr's record had statsByYear[year].gamesPlayed = {} which
// crashed the year-by-year table render.
// 2026.05.07.0004: reclassify generic transfer_out stubs that are
// actually drafted (player has draftYear/draftRound) or graduated
// (class was Sr/RS Sr). User reported "previous players are being
// marked as in the portal and not what actually happened (draft,
// graduation)" — root cause: re-saving the Players Leaving sheet
// clobbered specific outcomes back to portal-unknown.
export const PLAYER_HEAL_VERSION = '2026.05.07.0004'
