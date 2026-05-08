// Per-season subcollection — `dynasties/{id}/seasons/{year}` — holds
// every per-year and per-team-year field that used to live as a
// ByYear / ByTeamYear map on the main dynasty document.
//
// Why: the dynasty doc was creeping toward Firestore's 1 MiB cap as
// users accumulated seasons. weekRecapsByYear was the first thing to
// trip the cap; the diagnostic in DangerZone showed allAmericansByYear,
// recruitingCommitmentsByTeamYear, and conferenceStandingsByYear as the
// next biggest offenders. Rather than fight the cap one field at a
// time, this commit moves all season-scoped data into per-year docs
// where each season's worth of data is well under 1 MB on its own.
//
// Schema:
//   dynasties/{id}/seasons/{year} = {
//     year,
//     allAmericans, awards, conferenceStandings, ...,        // per-year
//     recruitingCommitmentsByTeam, schedulesByTeam, ...,     // per-team-year (year is implicit)
//   }
//
// Naming convention in the season doc:
//   - per-year fields drop the `ByYear` suffix (allAmericansByYear → allAmericans)
//   - per-team-year fields swap `ByTeamYear` for `ByTeam` since the year is
//     redundant with the doc id (recruitingCommitmentsByTeamYear → recruitingCommitmentsByTeam)
// Consumers don't see this — the listener rehydrates the legacy
// dynasty.allAmericansByYear[year] / dynasty.recruitingCommitmentsByTeamYear[teamKey][year]
// shapes from the season docs before exposing the dynasty to React state.

import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromCache,
  getDocsFromServer,
  setDoc,
  updateDoc,
  writeBatch,
  deleteField,
  waitForPendingWrites,
} from 'firebase/firestore'
import { db } from '../config/firebase'

const DYNASTIES_COLLECTION = 'dynasties'
const SEASONS_SUBCOLLECTION = 'seasons'

// Per-year fields. Shape on main doc: `{ [year]: data }`.
// On the season doc they're stored under the suffix-stripped name.
// weekRecapsByYear is intentionally NOT in this list — it has its own
// dedicated subcollection (one doc per year-week) for unrelated reasons.
export const PER_YEAR_FIELDS = [
  'allAmericansByYear',
  'awardsByYear',
  'bowlEligibilityDataByYear',
  'bowlGamesByYear',
  'bowlResultsByYear',
  'cfpBowlConfigByYear',
  'cfpResultsByYear',
  'cfpSeedsByYear',
  'conferenceChampionshipDataByYear',
  'conferenceChampionshipsByYear',
  'conferenceStandingsByYear',
  'customConferencesByYear',
  'detailedStatsByYear',
  'draftResultsByYear',
  'finalPollsByYear',
  'fringeCaseClassByYear',
  'lockedCoachingStaffByYear',
  'playersLeavingByYear',
  'playerStatsByYear',
  'portalTransferClassByYear',
  'positionChangesByYear',
  'preseasonRankingsByYear',
  'rankingsByYear',
  'rankingsHistoryByYear',
  'recruitOverallsByYear',
  'seasonAwardsByYear',
  'teamStatsByYear',
  'trainingResultsByYear',
  'transferDestinationsByYear',
]

// Per-team-year fields. Shape on main doc: `{ [teamKey]: { [year]: data } }`.
// Team key may be tid (number) or abbr (string) depending on the field's
// migration status — both are valid keys for storage. On the season doc
// they're stored under the suffix-stripped name as `{ [teamKey]: data }`
// since the year is implicit in the doc id.
export const PER_TEAM_YEAR_FIELDS = [
  'bowlEligibilityDataByTeamYear',
  'coachingStaffByTeamYear',
  'conferenceByTeamYear',
  'conferenceChampionshipDataByTeamYear',
  'draftResultsByTeamYear',
  'encourageTransfersByTeamYear',
  'fringeCaseClassByTeamYear',
  'playersLeavingByTeamYear',
  'portalTransferClassByTeamYear',
  'preseasonSetupByTeamYear',
  'rankingsByTeamYear',
  'recruitingClassRankByTeamYear',
  'recruitingCommitmentsByTeamYear',
  'recruitsByTeamYear',
  'schedulesByTeamYear',
  'teamRatingsByTeamYear',
  'teamRecordsByTeamYear',
  'trainingResultsByTeamYear',
  'transferDestinationsByTeamYear',
]

// Map of legacy-main-doc-field-name → season-doc-field-name. The
// season doc strips the wrapper suffix since the year is redundant
// with the doc id.
const PER_YEAR_TO_SEASON_FIELD = Object.fromEntries(
  PER_YEAR_FIELDS.map(f => [f, f.replace(/ByYear$/, '')])
)
const PER_TEAM_YEAR_TO_SEASON_FIELD = Object.fromEntries(
  PER_TEAM_YEAR_FIELDS.map(f => [f, f.replace(/ByTeamYear$/, 'ByTeam')])
)

const ALL_SEASONAL_FIELDS = new Set([...PER_YEAR_FIELDS, ...PER_TEAM_YEAR_FIELDS])

/** Fast `is this field season-scoped?` test for the updateDynasty router. */
export function isSeasonalField(fieldName) {
  return ALL_SEASONAL_FIELDS.has(fieldName)
}

/**
 * Read all season docs and rehydrate the legacy main-doc shapes.
 * Returns an object whose keys are the original ByYear / ByTeamYear
 * field names, so consumers see exactly what they used to see — they
 * don't have to know the data moved.
 *
 * Cache-first like other subcollection reads to keep mobile cold-start
 * latency tolerable; a server probe runs in the background to keep the
 * cache warm for the next load.
 */
export async function getSeasonsSubcollection(dynastyId, options = {}) {
  const { onFresh = null } = options
  const ref = collection(db, DYNASTIES_COLLECTION, dynastyId, SEASONS_SUBCOLLECTION)
  let docs
  try {
    const cached = await getDocsFromCache(ref)
    if (!cached.empty) {
      getDocsFromServer(ref).then(snap => {
        if (!onFresh) return
        try { onFresh(rehydrateSeasonalShapes(snap.docs)) } catch (e) { console.error('onFresh callback threw:', e) }
      }).catch(() => {})
      docs = cached.docs
    }
  } catch (_) { /* fall through */ }
  if (!docs) {
    try {
      const snap = await getDocs(ref)
      docs = snap.docs
    } catch (error) {
      console.error('Error fetching seasons subcollection:', error)
      return {}
    }
  }
  return rehydrateSeasonalShapes(docs)
}

function rehydrateSeasonalShapes(docs) {
  // out shape:
  //   { allAmericansByYear: { 2034: ... },
  //     recruitingCommitmentsByTeamYear: { '10': { 2034: ... } },
  //     ... }
  const out = {}
  for (const d of docs) {
    const yearKey = d.id
    const yearNum = Number(yearKey)
    if (!Number.isFinite(yearNum)) continue
    const data = d.data() || {}

    // Per-year fields: out[`${name}ByYear`][year] = data[seasonField]
    for (const [legacyName, seasonField] of Object.entries(PER_YEAR_TO_SEASON_FIELD)) {
      const value = data[seasonField]
      if (value === undefined) continue
      if (!out[legacyName]) out[legacyName] = {}
      out[legacyName][yearNum] = value
    }

    // Per-team-year fields: out[`${name}ByTeamYear`][teamKey][year] = data[seasonField][teamKey]
    for (const [legacyName, seasonField] of Object.entries(PER_TEAM_YEAR_TO_SEASON_FIELD)) {
      const teamMap = data[seasonField]
      if (!teamMap || typeof teamMap !== 'object') continue
      if (!out[legacyName]) out[legacyName] = {}
      for (const [teamKey, teamData] of Object.entries(teamMap)) {
        if (teamData === undefined) continue
        if (!out[legacyName][teamKey]) out[legacyName][teamKey] = {}
        out[legacyName][teamKey][yearNum] = teamData
      }
    }
  }
  return out
}

/**
 * Convert a partial dynasty update (the kind passed to updateDynasty)
 * into a per-year breakdown of season-doc patches.
 *
 * Input:
 *   { allAmericansByYear: { 2034: ..., 2033: ... },
 *     recruitingCommitmentsByTeamYear: { '10': { 2034: ... } } }
 *
 * Output (year-keyed map of season-doc partials):
 *   { 2033: { allAmericans: ... },
 *     2034: { allAmericans: ..., recruitingCommitmentsByTeam: { '10': ... } } }
 */
export function splitSeasonalUpdateByYear(updates) {
  const byYear = {}

  for (const [field, value] of Object.entries(updates)) {
    if (PER_YEAR_TO_SEASON_FIELD[field]) {
      // `{ [year]: data }` — fan out to one season patch per year.
      const seasonField = PER_YEAR_TO_SEASON_FIELD[field]
      if (!value || typeof value !== 'object') continue
      for (const [yearKey, data] of Object.entries(value)) {
        const yearNum = Number(yearKey)
        if (!Number.isFinite(yearNum)) continue
        if (!byYear[yearNum]) byYear[yearNum] = {}
        byYear[yearNum][seasonField] = data
      }
      continue
    }
    if (PER_TEAM_YEAR_TO_SEASON_FIELD[field]) {
      // `{ [teamKey]: { [year]: data } }` — invert to year-first.
      const seasonField = PER_TEAM_YEAR_TO_SEASON_FIELD[field]
      if (!value || typeof value !== 'object') continue
      for (const [teamKey, yearMap] of Object.entries(value)) {
        if (!yearMap || typeof yearMap !== 'object') continue
        for (const [yearKey, data] of Object.entries(yearMap)) {
          const yearNum = Number(yearKey)
          if (!Number.isFinite(yearNum)) continue
          if (!byYear[yearNum]) byYear[yearNum] = {}
          if (!byYear[yearNum][seasonField]) byYear[yearNum][seasonField] = {}
          byYear[yearNum][seasonField][teamKey] = data
        }
      }
      continue
    }
  }

  return byYear
}

/**
 * Write the year-keyed season patch produced by splitSeasonalUpdateByYear.
 * Each season doc is `setDoc(..., { merge: true })` so concurrent writes
 * to different fields on the same season don't clobber each other.
 *
 * Returns the list of season doc ids that were touched (mostly useful
 * for logging).
 */
export async function writeSeasonalUpdate(dynastyId, byYear) {
  const years = Object.keys(byYear)
  if (years.length === 0) return []

  // Use a batch when there are multiple seasons to keep the network
  // payload tight. Single-year writes go through setDoc directly.
  if (years.length === 1) {
    const yearKey = years[0]
    const ref = doc(db, DYNASTIES_COLLECTION, dynastyId, SEASONS_SUBCOLLECTION, String(yearKey))
    await setDoc(ref, { year: Number(yearKey), ...byYear[yearKey] }, { merge: true })
    return [yearKey]
  }

  const batch = writeBatch(db)
  for (const yearKey of years) {
    const ref = doc(db, DYNASTIES_COLLECTION, dynastyId, SEASONS_SUBCOLLECTION, String(yearKey))
    batch.set(ref, { year: Number(yearKey), ...byYear[yearKey] }, { merge: true })
  }
  await batch.commit()
  return years
}

/**
 * One-shot migration for dynasties that still have any of the seasonal
 * fields embedded on the main doc. Copies them to season docs, then
 * issues a single updateDoc that deleteFields() every migrated field
 * — that update SHRINKS the parent doc and is the only update path
 * that still works once it's pushed past the 1 MiB cap.
 *
 * Idempotent: setDoc(..., {merge: true}) replaces, deleteField on an
 * absent field is a no-op. Safe to call repeatedly.
 */
export async function migrateSeasonalFieldsToSubcollection(dynastyId, mainDocSourceArg) {
  // Three-phase paranoid-safe migration. Order is critical for the
  // user concern that drove this hardening: a beta tester's dynasty
  // showed empty CFP brackets after the initial migration shipped, and
  // we needed to make sure no dynasty that hadn't been opened yet
  // could lose data on first load.
  //
  // Phase 1 — SOURCE
  //   Read the main doc fresh from the server. The mainDocSourceArg
  //   passed by the listener is in-memory state which may have
  //   subcollection data merged in (and could even be missing fields
  //   that are still on the server doc). Authoritative source for the
  //   migration is the actual Firestore main doc, full stop.
  //
  // Phase 2 — WRITE + CONFIRM
  //   Write each year's data to the seasons subcollection, then
  //   waitForPendingWrites so the Firestore SDK confirms every write
  //   reached the server (not just the local cache). Then read back
  //   one season doc directly from the server — `getDocFromServer` —
  //   and verify that every field we just wrote actually shows up in
  //   the read-back. This catches the case where a permission-denied
  //   or rules-rejection failed silently (writes resolve locally even
  //   when the server rejects them).
  //
  // Phase 3 — CLEAR
  //   Only after verification do we deleteField the legacy fields
  //   from the main doc. If verification fails, we abort and leave
  //   the main doc untouched — migration retries on the next load
  //   (idempotent, no harm).
  const mainDocRef = doc(db, DYNASTIES_COLLECTION, dynastyId)

  // Phase 1: fresh read from server. Falls back to the passed-in
  // source if the read errors (offline, permission, etc.) — better
  // to migrate from stale-but-real data than not migrate at all.
  let mainDocSource = mainDocSourceArg
  try {
    const snap = await getDocFromServer(mainDocRef)
    if (snap.exists()) {
      mainDocSource = snap.data() || mainDocSourceArg
    }
  } catch (err) {
    console.warn('[season migration] could not read main doc from server, falling back to in-memory snapshot:', err?.code || err?.message)
  }

  if (!mainDocSource || typeof mainDocSource !== 'object') return { migrated: [], cleared: [] }

  const presentUpdates = {}
  const fieldsToClear = []
  for (const field of ALL_SEASONAL_FIELDS) {
    const value = mainDocSource[field]
    if (value && typeof value === 'object' && Object.keys(value).length > 0) {
      presentUpdates[field] = value
      fieldsToClear.push(field)
    }
  }
  if (fieldsToClear.length === 0) return { migrated: [], cleared: [] }

  const byYear = splitSeasonalUpdateByYear(presentUpdates)
  if (Object.keys(byYear).length === 0) return { migrated: [], cleared: [] }

  // SUBCOLLECTION-WINS GUARD — fetch the existing seasons subcollection
  // state from the server and strip any (year, field) cells that are
  // already populated there. Without this guard the migration would
  // fan stale main-doc data back into the subcollection and overwrite
  // freshly-saved values — same failure shape as the recap-loss bug,
  // applied to every per-year and per-team-year field. If we can't
  // read existing state, BAIL the destructive part of migration so
  // we never clobber unknowns.
  try {
    const seasonsRef = collection(db, DYNASTIES_COLLECTION, dynastyId, SEASONS_SUBCOLLECTION)
    const snap = await getDocsFromServer(seasonsRef)
    for (const d of snap.docs) {
      const yearKey = Number(d.id)
      if (!Number.isFinite(yearKey)) continue
      const existing = d.data() || {}
      const patch = byYear[yearKey]
      if (!patch) continue
      // For each field in our migration patch, drop it if the season
      // doc already has a non-empty value for that field server-side.
      for (const field of Object.keys(patch)) {
        const ev = existing[field]
        const hasExisting = ev !== undefined && ev !== null
          && !(typeof ev === 'object' && !Array.isArray(ev) && Object.keys(ev).length === 0)
          && !(Array.isArray(ev) && ev.length === 0)
        if (hasExisting) delete patch[field]
      }
      if (Object.keys(patch).length === 0) delete byYear[yearKey]
    }
  } catch (err) {
    console.warn('[season migration] could not read existing seasons subcollection — aborting to prevent data loss:', err?.code || err?.message)
    return { migrated: [], cleared: [] }
  }

  // After filtering, only legacy-only cells remain. If everything was
  // already in the subcollection, the writes/deletes are no-ops, but
  // we still want to deleteField the legacy main-doc data — that's
  // safe regardless since subcollection is the authoritative source.
  if (Object.keys(byYear).length === 0) {
    // Skip writes; jump straight to clearing main doc + verify.
    const clearPatchOnly = {}
    for (const field of fieldsToClear) clearPatchOnly[field] = deleteField()
    clearPatchOnly._seasonsMigratedAt = new Date().toISOString()
    await updateDoc(mainDocRef, clearPatchOnly)
    return { migrated: [], cleared: fieldsToClear }
  }

  // Phase 2a: write subcollection.
  const migrated = await writeSeasonalUpdate(dynastyId, byYear)

  // Phase 2b: ensure server confirms every pending write before we
  // touch the main doc. Without this, the local cache resolves the
  // setDoc/batch.commit promises while the server may still be
  // processing — and the deleteField could land on the server first.
  try {
    await waitForPendingWrites(db)
  } catch (err) {
    console.warn('[season migration] waitForPendingWrites failed; aborting deleteField step:', err?.code || err?.message)
    return { migrated, cleared: [] }
  }

  // Phase 2c: read-back verification. Sample the LAST written year
  // (most likely to surface server-rejection issues since it's the
  // most recent write). Read from server, not cache, so we know the
  // doc is durably persisted. If any expected field is missing,
  // refuse to clear the main doc.
  const verifyOk = await verifySeasonalWrites(dynastyId, byYear, migrated)
  if (!verifyOk) {
    console.warn(`[season migration] read-back verification failed for ${dynastyId}; main doc NOT cleared, will retry on next load`)
    return { migrated, cleared: [] }
  }

  // Phase 3: clear legacy fields from main doc + stamp a marker so
  // we can tell at a glance which dynasties have completed migration.
  // deleteField shrinks the resulting doc, which is also why this
  // succeeds on docs already at the 1 MiB cap — it can't grow.
  const clearPatch = { _seasonsMigratedAt: new Date().toISOString() }
  for (const field of fieldsToClear) {
    clearPatch[field] = deleteField()
  }
  await updateDoc(mainDocRef, clearPatch)

  return { migrated, cleared: fieldsToClear }
}

/**
 * Read-back verification: confirm that the last year we wrote
 * actually has every expected field on the server. Used by the
 * migration's pre-cleanup phase so we never deleteField legacy data
 * from the main doc unless we KNOW the data made it to the seasons
 * subcollection.
 *
 * We sample the LAST written year only (not every year) — verifying
 * one is sufficient evidence the batch reached the server, and one
 * server read keeps the migration latency tolerable. If the sample
 * passes but the rest of the batch failed somehow, the rest will be
 * caught by the next migration retry (since main doc still has them).
 */
async function verifySeasonalWrites(dynastyId, byYear, writtenYearKeys) {
  if (!writtenYearKeys || writtenYearKeys.length === 0) return false
  const sampleYear = writtenYearKeys[writtenYearKeys.length - 1]
  const expected = byYear[Number(sampleYear)] || byYear[sampleYear]
  if (!expected) return false
  try {
    const ref = doc(db, DYNASTIES_COLLECTION, dynastyId, SEASONS_SUBCOLLECTION, String(sampleYear))
    const snap = await getDocFromServer(ref)
    if (!snap.exists()) {
      console.warn(`[season migration] verify: seasons/${sampleYear} doesn't exist on server`)
      return false
    }
    const data = snap.data() || {}
    for (const expField of Object.keys(expected)) {
      if (!(expField in data)) {
        console.warn(`[season migration] verify: seasons/${sampleYear} missing expected field ${expField}`)
        return false
      }
    }
    return true
  } catch (err) {
    console.warn(`[season migration] verify read failed for seasons/${sampleYear}:`, err?.code || err?.message)
    return false
  }
}
