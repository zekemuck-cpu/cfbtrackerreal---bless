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
  'conferenceDivisionsByYear',
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
  // Coaching-carousel results, one entry per season — the same unbounded
  // per-year growth as everything else here. Was previously unrouted, so it
  // accumulated on the MAIN doc forever (1 MiB cap risk on old dynasties).
  'staffMovesByYear',
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
  // Calculated/derived team records (from games, conference standings, etc.)
  // — kept separate from teamRecordsByTeamYear, which is the MANUAL override
  // store (the "Update automatically" checkbox's opposite). The two used to
  // share teamRecordsByTeamYear, so whichever saved last silently clobbered
  // the other's value there. See TEAMS_BYYEAR_FLAT_FIELDS below.
  'teamCalculatedRecordByTeamYear',
  'trainingResultsByTeamYear',
  'transferDestinationsByTeamYear',
  // The following five mirror data that previously ONLY lived nested inside
  // dynasty.teams[tid].byYear[year] on the main doc (no flat ByTeamYear
  // twin existed pre-migration, unlike everything else in this list). Of
  // those nested fields, rankByWeek is the dominant contributor to the
  // main doc's unbounded growth — every team's full week-by-week rank
  // history, forever, times ~136 teams. See DynastyContext.jsx's
  // updateDynasty (the `TEAMS_BYYEAR_TO_SEASONAL_FIELD` extraction) and
  // `foldTeamsByYearFieldsFromFlat` for the write/read routing that keeps
  // dynasty.teams[tid].byYear[year].X reading exactly as it always has.
  'rankByWeekByTeamYear',
  'divisionByTeamYear',
  'schoolGradesByTeamYear',
  'recruitingClassConferenceRankByTeamYear',
  'recruitingClassStatsByTeamYear',
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

// teams[tid].byYear[year] sub-fields that are ALSO fully covered by a flat
// *ByTeamYear field — either because they never had one until this migration
// (rankByWeek/division/schoolGrades/recruitingClassConferenceRank/
// recruitingClassStats — rankByWeek is the dominant one: every team's full
// week-by-week rank history, forever, times ~136 teams, the actual driver
// behind `teams` showing up as one of DangerZone's biggest-field offenders),
// or because they've long been dual-written to both places (schedule,
// teamRatings, coachingStaff, etc. — every save* flow already updates both
// the inline copy and the flat twin, so the inline copy is pure redundant
// weight on the main doc).
//
// `conference` and `record`/`teamRecord` (Phase C) were held back from the
// list above pending an audit: `record` (calculated from games/standings)
// and `teamRecord` (the manual "Update automatically"-checkbox override)
// used to BOTH dual-write into the same legacy `teamRecordsByTeamYear`
// flat store under different keys, so whichever saved last could silently
// clobber the other's value there. Fixed by giving the calculated variant
// its own store (`teamCalculatedRecordByTeamYear`) and keeping
// `teamRecordsByTeamYear` exclusively for the manual override. `conference`
// had no such collision — it already had its own flat twin
// (`conferenceByTeamYear`) — so it's a straight addition. These are also
// the main doc's only remaining unbounded-growth fields: one entry per
// team per season, forever, same as rankByWeek before it.
export const TEAMS_BYYEAR_FLAT_FIELDS = {
  rankByWeekByTeamYear: 'rankByWeek',
  divisionByTeamYear: 'division',
  schoolGradesByTeamYear: 'schoolGrades',
  recruitingClassConferenceRankByTeamYear: 'recruitingClassConferenceRank',
  recruitingClassStatsByTeamYear: 'recruitingClassStats',
  schedulesByTeamYear: 'schedule',
  teamRatingsByTeamYear: 'teamRatings',
  coachingStaffByTeamYear: 'coachingStaff',
  preseasonSetupByTeamYear: 'preseasonSetup',
  recruitingCommitmentsByTeamYear: 'recruitingCommitments',
  recruitingClassRankByTeamYear: 'recruitingClassRank',
  playersLeavingByTeamYear: 'playersLeaving',
  draftResultsByTeamYear: 'draftResults',
  transferDestinationsByTeamYear: 'transferDestinations',
  portalTransferClassByTeamYear: 'portalTransferClass',
  fringeCaseClassByTeamYear: 'fringeCaseClass',
  trainingResultsByTeamYear: 'trainingResults',
  conferenceChampionshipDataByTeamYear: 'conferenceChampionshipData',
  bowlEligibilityDataByTeamYear: 'bowlEligibilityData',
  encourageTransfersByTeamYear: 'encourageTransfers',
  recruitsByTeamYear: 'recruits',
  conferenceByTeamYear: 'conference',
  teamRecordsByTeamYear: 'teamRecord',
  teamCalculatedRecordByTeamYear: 'record',
}

/**
 * Reconstruct dynasty.teams[tid].byYear[year].{rankByWeek,division,...}
 * from the flat *ByTeamYear fields rehydrated onto the dynasty object (see
 * rehydrateSeasonalShapes) — so every existing read site (rankByWeek alone
 * has 30+ direct call sites across the app) keeps working unchanged even
 * though updateDynasty now strips these fields off the main-doc `teams` map
 * before persisting it. Pure; returns the same object if nothing needed
 * folding (a dynasty that's never gone through the new write path, or a
 * local/non-cloud dynasty that never gets these flat fields at all).
 *
 * Object keys are always strings in a plain JS object regardless of
 * whether they were assigned as a number or a string, so `teams[tidKey]` /
 * `byYear[yearKey]` match correctly here with no explicit coercion needed.
 */
export function foldTeamsByYearFieldsFromFlat(dynasty) {
  if (!dynasty || !dynasty.teams || typeof dynasty.teams !== 'object') return dynasty
  let teams = dynasty.teams
  let touched = false
  for (const [flatField, subField] of Object.entries(TEAMS_BYYEAR_FLAT_FIELDS)) {
    const flatData = dynasty[flatField]
    if (!flatData || typeof flatData !== 'object') continue
    for (const [tidKey, yearMap] of Object.entries(flatData)) {
      if (!yearMap || typeof yearMap !== 'object' || !teams[tidKey]) continue
      for (const [yearKey, value] of Object.entries(yearMap)) {
        if (value === undefined) continue
        if (!touched) { teams = { ...teams }; touched = true }
        const team = teams[tidKey]
        const byYear = team.byYear || {}
        const yearData = byYear[yearKey] || {}
        teams[tidKey] = { ...team, byYear: { ...byYear, [yearKey]: { ...yearData, [subField]: value } } }
      }
    }
  }
  return touched ? { ...dynasty, teams } : dynasty
}

const TEAMS_BYYEAR_SUBFIELD_TO_SEASONAL = Object.fromEntries(
  Object.entries(TEAMS_BYYEAR_FLAT_FIELDS).map(([seasonalField, subField]) => [subField, seasonalField])
)

/**
 * Inverse of foldTeamsByYearFieldsFromFlat: strip every teams[tid].byYear
 * [year].{subField} listed in TEAMS_BYYEAR_FLAT_FIELDS OUT of a teams
 * object, returning both the stripped copy and the extracted values in
 * the {seasonalField: {tid: {year: value}}} shape splitSeasonalUpdateByYear
 * expects.
 *
 * This is what `teams` actually looks like once it's routed to the seasons
 * subcollection and persisted — as opposed to the full in-memory shape
 * foldTeamsByYearFieldsFromFlat reconstructs for every existing reader's
 * convenience. Two callers need exactly this "post-routing" view and must
 * never diverge on what it means: updateDynasty's write-router (actually
 * does the routing) and the main-doc byte-size guard (has to know what
 * will ACTUALLY land on the main doc, not the folded-back reconstruction —
 * measuring the reconstruction instead double-counts data that's headed to
 * the subcollection anyway and was exactly the bug that made the size
 * guard keep rejecting saves the real write would have survived).
 */
export function stripTeamsByYearFlatFields(teams) {
  const extracted = {}
  if (!teams || typeof teams !== 'object') return { strippedTeams: teams, extracted }
  let stripped = teams
  let teamsTouched = false
  for (const [tidKey, team] of Object.entries(teams)) {
    const byYear = team?.byYear
    if (!byYear || typeof byYear !== 'object') continue
    let byYearTouched = false
    let nextByYear = byYear
    for (const [yearKey, yearData] of Object.entries(byYear)) {
      if (!yearData || typeof yearData !== 'object') continue
      let yearTouched = false
      const nextYearData = { ...yearData }
      for (const [subField, seasonalField] of Object.entries(TEAMS_BYYEAR_SUBFIELD_TO_SEASONAL)) {
        if (!(subField in nextYearData)) continue
        if (!extracted[seasonalField]) extracted[seasonalField] = {}
        if (!extracted[seasonalField][tidKey]) extracted[seasonalField][tidKey] = {}
        extracted[seasonalField][tidKey][yearKey] = nextYearData[subField]
        delete nextYearData[subField]
        yearTouched = true
      }
      if (yearTouched) {
        if (!byYearTouched) { nextByYear = { ...byYear }; byYearTouched = true }
        nextByYear[yearKey] = nextYearData
      }
    }
    if (byYearTouched) {
      if (!teamsTouched) { stripped = { ...teams }; teamsTouched = true }
      stripped[tidKey] = { ...team, byYear: nextByYear }
    }
  }
  return { strippedTeams: stripped, extracted }
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
  const { onFresh = null, serverFirst = false } = options
  const ref = collection(db, DYNASTIES_COLLECTION, dynastyId, SEASONS_SUBCOLLECTION)
  // serverFirst: destructive one-shot flows (cloud→local migration) must read
  // SERVER truth, never a possibly-stale cache. Throws on failure so the
  // caller aborts instead of proceeding with partial data.
  if (serverFirst) {
    const snap = await getDocsFromServer(ref)
    return rehydrateSeasonalShapes(snap.docs)
  }
  let docs
  try {
    const cached = await getDocsFromCache(ref)
    if (!cached.empty) {
      if (onFresh) {
        getDocsFromServer(ref).then(snap => {
          try { onFresh(rehydrateSeasonalShapes(snap.docs)) } catch (e) { console.error('onFresh callback threw:', e) }
        }).catch(err => {
          // Stale-while-revalidate background refresh failed. Cached data is
          // still served, so we don't surface to the user, but log for
          // debugging persistent sync issues.
          console.warn('Background season subcollection refresh failed:', err?.code || err?.message || err)
        })
      }
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

export function rehydrateSeasonalShapes(docs) {
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
 * Build a year-keyed patch of `deleteField()` sentinels for entries that exist
 * in `prevValue` but are gone from `nextValue`. Needed because writeSeasonalUpdate
 * uses setDoc({merge:true}) — a plain map with a key removed can't delete that key
 * (merge only adds/overwrites). Callers that REPLACE a seasonal field (not just
 * add to it) merge this into the split patch so removed entries are truly cleared.
 *
 *   field      — the legacy main-doc field name (e.g. 'recruitingClassRankByTeamYear')
 *   prevValue  — the field's current value on the dynasty
 *   nextValue  — the field's new (replacement) value
 */
export function diffSeasonalDeletions(field, prevValue, nextValue) {
  const out = {}
  const perTeamYear = PER_TEAM_YEAR_TO_SEASON_FIELD[field]
  const perYear = PER_YEAR_TO_SEASON_FIELD[field]
  if (perTeamYear) {
    // prev shape: { [teamKey]: { [year]: data } }
    for (const [teamKey, yearMap] of Object.entries(prevValue || {})) {
      if (!yearMap || typeof yearMap !== 'object') continue
      for (const yearKey of Object.keys(yearMap)) {
        const stillThere = nextValue?.[teamKey] && nextValue[teamKey][yearKey] !== undefined
        if (stillThere) continue
        const y = Number(yearKey)
        if (!Number.isFinite(y)) continue
        if (!out[y]) out[y] = {}
        if (!out[y][perTeamYear]) out[y][perTeamYear] = {}
        out[y][perTeamYear][teamKey] = deleteField()
      }
    }
  } else if (perYear) {
    // prev shape: { [year]: data }
    for (const yearKey of Object.keys(prevValue || {})) {
      if (nextValue?.[yearKey] !== undefined) continue
      const y = Number(yearKey)
      if (!Number.isFinite(y)) continue
      if (!out[y]) out[y] = {}
      out[y][perYear] = deleteField()
    }
  }
  return out
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

  // Always use a batch — even for a single year — so we can include
  // the main-doc lastModified bump atomically. The bump is what makes
  // subscribeToDynasties on other devices fire; without it, this
  // subcollection write is invisible to Device B's listener.
  const mainDocRef = doc(db, DYNASTIES_COLLECTION, dynastyId)
  const batch = writeBatch(db)
  for (const yearKey of years) {
    const ref = doc(db, DYNASTIES_COLLECTION, dynastyId, SEASONS_SUBCOLLECTION, String(yearKey))
    batch.set(ref, { year: Number(yearKey), ...byYear[yearKey] }, { merge: true })
  }
  batch.update(mainDocRef, { lastModified: Date.now() })
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
 * One-shot cleanup for dynasties whose main-doc `teams` map still carries
 * the legacy inline copies of fields listed in TEAMS_BYYEAR_FLAT_FIELDS
 * (schedule, teamRatings, coachingStaff, rankByWeek, etc.) — every one of
 * which is either already dual-written to a flat *ByTeamYear field, or (for
 * the handful with no prior flat twin) gets backfilled here for the first
 * time. Idempotent; safe to call repeatedly — a dynasty with nothing left
 * to clean up is a fast no-op.
 *
 * Same 3-phase paranoid pattern as migrateSeasonalFieldsToSubcollection:
 * read fresh from server, write+verify any missing (tid, year, field)
 * cells, THEN — only after read-back confirms the subcollection has every
 * cell — deleteField() the inline copies from the main doc. A dynasty
 * where the flat store already has everything (the common case, since
 * these fields have been dual-written for a while) skips straight to the
 * clear step with no write at all.
 *
 * Unlike the flat ByYear/ByTeamYear migration above, this walks a NESTED
 * shape (teams[tid].byYear[year].field) rather than a top-level field, so
 * the clear step uses per-cell dot-notation paths (teams.{tid}.byYear.
 * {year}.{field}) instead of whole-field deleteField() — clearing exactly
 * the sub-keys that moved, leaving every other byYear field (and the
 * team's meta fields — abbr, statRecords, userId, etc.) untouched.
 */
export async function migrateTeamsByYearDuplicatesToSubcollection(dynastyId, mainDocSourceArg) {
  const mainDocRef = doc(db, DYNASTIES_COLLECTION, dynastyId)

  // Phase 1: fresh read from server (falls back to the passed-in snapshot
  // if the read fails — better to migrate from stale-but-real data than
  // not migrate at all, same rationale as the seasonal migration above).
  let mainDocSource = mainDocSourceArg
  try {
    const snap = await getDocFromServer(mainDocRef)
    if (snap.exists()) mainDocSource = snap.data() || mainDocSourceArg
  } catch (err) {
    console.warn('[teams migration] could not read main doc from server, falling back to in-memory snapshot:', err?.code || err?.message)
  }
  const teams = mainDocSource?.teams
  if (!teams || typeof teams !== 'object') return { migrated: [], cleared: [] }

  // Walk every team/year/field cell, building both the candidate backfill
  // patch (seasonalCollect, same shape splitSeasonalUpdateByYear expects)
  // and the full list of cells eligible for clearing regardless of
  // whether they end up needing a write.
  const seasonalCollect = {}
  const allCells = []
  for (const [tidKey, team] of Object.entries(teams)) {
    const byYear = team?.byYear
    if (!byYear || typeof byYear !== 'object') continue
    for (const [yearKey, yearData] of Object.entries(byYear)) {
      if (!yearData || typeof yearData !== 'object') continue
      for (const [subField, seasonalField] of Object.entries(TEAMS_BYYEAR_SUBFIELD_TO_SEASONAL)) {
        if (!(subField in yearData)) continue
        const value = yearData[subField]
        // A cell is eligible for clearing off the main doc regardless of its
        // value — including `null` (e.g. teamRecord's "override cleared,
        // defer to calculated" sentinel). Only `undefined` skips clearing
        // too, since `subField in yearData` already guarantees the key
        // exists; excluding null here used to leave cleared-override cells
        // stuck on the main doc forever after this one-time migration ran.
        allCells.push({ tidKey, yearKey, subField })
        if (value === undefined) continue
        if (!seasonalCollect[seasonalField]) seasonalCollect[seasonalField] = {}
        if (!seasonalCollect[seasonalField][tidKey]) seasonalCollect[seasonalField][tidKey] = {}
        seasonalCollect[seasonalField][tidKey][yearKey] = value
      }
    }
  }
  if (allCells.length === 0) return { migrated: [], cleared: [] }

  const byYear = splitSeasonalUpdateByYear(seasonalCollect)

  // SUBCOLLECTION-WINS GUARD, at (year, seasonField, tidKey) granularity —
  // drop any cell the subcollection already has a value for, so this can
  // never regress fresher subcollection data with a stale main-doc
  // duplicate. What's left after filtering is exactly the backfill this
  // dynasty still needs. If we can't read existing state, bail the whole
  // migration (nothing written, nothing cleared) rather than risk it.
  try {
    const seasonsRef = collection(db, DYNASTIES_COLLECTION, dynastyId, SEASONS_SUBCOLLECTION)
    const snap = await getDocsFromServer(seasonsRef)
    const existingByYear = {}
    for (const d of snap.docs) existingByYear[d.id] = d.data() || {}
    for (const yearKey of Object.keys(byYear)) {
      const existing = existingByYear[yearKey] || {}
      for (const seasonField of Object.keys(byYear[yearKey])) {
        const teamMap = byYear[yearKey][seasonField]
        const existingTeamMap = existing[seasonField] || {}
        for (const tidKey of Object.keys(teamMap)) {
          const ev = existingTeamMap[tidKey]
          const hasExisting = ev !== undefined && ev !== null
            && !(typeof ev === 'object' && !Array.isArray(ev) && Object.keys(ev).length === 0)
            && !(Array.isArray(ev) && ev.length === 0)
          if (hasExisting) delete teamMap[tidKey]
        }
        if (Object.keys(teamMap).length === 0) delete byYear[yearKey][seasonField]
      }
      if (Object.keys(byYear[yearKey]).length === 0) delete byYear[yearKey]
    }
  } catch (err) {
    console.warn('[teams migration] could not read existing seasons subcollection — aborting to prevent data loss:', err?.code || err?.message)
    return { migrated: [], cleared: [] }
  }

  // Write + verify the backfill (only the cells the subcollection was
  // actually missing — usually none, since these fields are dual-written).
  if (Object.keys(byYear).length > 0) {
    const migrated = await writeSeasonalUpdate(dynastyId, byYear)
    try {
      await waitForPendingWrites(db)
    } catch (err) {
      console.warn('[teams migration] waitForPendingWrites failed; aborting clear step:', err?.code || err?.message)
      return { migrated, cleared: [] }
    }
    const verifyOk = await verifySeasonalWrites(dynastyId, byYear, migrated)
    if (!verifyOk) {
      console.warn(`[teams migration] read-back verification failed for ${dynastyId}; teams NOT cleared, will retry on next load`)
      return { migrated, cleared: [] }
    }
  }

  // Phase 3: every cell in allCells is now confirmed present in the
  // subcollection (either it already was, or we just backfilled + verified
  // it) — safe to clear every one from the main-doc `teams` map via
  // per-cell dot-notation deleteField(), leaving sibling byYear fields and
  // team meta untouched. Chunked: Firestore bounds field paths per write,
  // and a decades-long dynasty × ~136 teams × 16 fields can run into the
  // thousands of paths.
  const clearPatch = {}
  for (const { tidKey, yearKey, subField } of allCells) {
    clearPatch[`teams.${tidKey}.byYear.${yearKey}.${subField}`] = deleteField()
  }
  const patchKeys = Object.keys(clearPatch)
  const CLEAR_CHUNK_SIZE = 400
  for (let i = 0; i < patchKeys.length; i += CLEAR_CHUNK_SIZE) {
    const chunkKeys = patchKeys.slice(i, i + CLEAR_CHUNK_SIZE)
    const chunk = {}
    for (const k of chunkKeys) chunk[k] = clearPatch[k]
    if (i + CLEAR_CHUNK_SIZE >= patchKeys.length) {
      chunk._teamsByYearDuplicatesMigratedAt = new Date().toISOString()
    }
    await updateDoc(mainDocRef, chunk)
  }

  return { migrated: Object.keys(byYear), cleared: allCells.length }
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
