import { describe, it, expect } from 'vitest'
import {
  foldTeamsByYearFieldsFromFlat,
  TEAMS_BYYEAR_FLAT_FIELDS,
} from '../seasonSubcollection'

// This function runs on EVERY dynasty load, for EVERY dynasty — console and
// PC, cloud and local, migrated and not. It is the read half of the change
// that stops `teams[tid].byYear[year]` from re-accumulating on the main doc:
// updateDynasty strips those sub-fields off the write and routes them to the
// flat *ByTeamYear seasons-subcollection fields, and this folds them back so
// the 30+ existing read sites (rankByWeek alone) keep working unchanged.
//
// A bug here doesn't throw — it silently shows a console user the wrong
// schedule, the wrong ratings, or an empty rank history. That's the exact
// failure mode we can't ship, so the behavior is pinned.
describe('foldTeamsByYearFieldsFromFlat', () => {
  // ── The pre-deploy console dynasty ────────────────────────────────────
  // The single most important case. Every existing console dynasty on the
  // day this ships has its data INLINE and nothing in the flat twins for
  // the five fields that never had one (rankByWeek, division, schoolGrades,
  // recruitingClassConferenceRank, recruitingClassStats). The fold must be
  // a complete no-op — it must not blank, replace, or drop anything.
  it('leaves an un-migrated dynasty completely untouched', () => {
    const dynasty = {
      id: 'console-1',
      teams: {
        42: {
          abbr: 'UT',
          byYear: {
            2029: {
              schedule: [{ week: 1, opponent: 'BAMA' }],
              rankByWeek: { 1: 12, 2: 9 },
              teamRatings: { offense: 88 },
              conference: 'SEC',
            },
          },
        },
      },
    }
    const out = foldTeamsByYearFieldsFromFlat(dynasty)
    // Identity, not just deep-equality: nothing to fold means no new object,
    // so React state doesn't churn on every listener snapshot.
    expect(out).toBe(dynasty)
    expect(out.teams[42].byYear[2029].rankByWeek).toEqual({ 1: 12, 2: 9 })
    expect(out.teams[42].byYear[2029].schedule).toEqual([{ week: 1, opponent: 'BAMA' }])
  })

  // ── The post-migration dynasty ────────────────────────────────────────
  // After the migration clears the inline copies, the flat field is the only
  // home for this data. If the fold doesn't restore it, the user's rank
  // history and schedule simply vanish from the UI.
  it('restores sub-fields onto byYear when the inline copy is gone', () => {
    const out = foldTeamsByYearFieldsFromFlat({
      id: 'cloud-1',
      teams: { 42: { abbr: 'UT', byYear: { 2029: { conference: 'SEC' } } } },
      rankByWeekByTeamYear: { 42: { 2029: { 1: 12, 2: 9 } } },
      schedulesByTeamYear: { 42: { 2029: [{ week: 1, opponent: 'BAMA' }] } },
    })
    expect(out.teams[42].byYear[2029].rankByWeek).toEqual({ 1: 12, 2: 9 })
    expect(out.teams[42].byYear[2029].schedule).toEqual([{ week: 1, opponent: 'BAMA' }])
    // Sibling data that was never routed off the main doc survives.
    expect(out.teams[42].byYear[2029].conference).toBe('SEC')
  })

  it('creates byYear (and the year entry) when the team has none yet', () => {
    const out = foldTeamsByYearFieldsFromFlat({
      teams: { 42: { abbr: 'UT' } },
      rankByWeekByTeamYear: { 42: { 2029: { 1: 3 } } },
    })
    expect(out.teams[42].byYear[2029].rankByWeek).toEqual({ 1: 3 })
    expect(out.teams[42].abbr).toBe('UT')
  })

  // ── Flat wins on overlap ──────────────────────────────────────────────
  // Deliberate, and worth pinning because the naive instinct is the reverse.
  // Once this ships, updateDynasty strips the inline copy from every write,
  // so a main doc that still carries an inline value is carrying a STALE one
  // — the fresh value went to the flat field. Inline-wins would show users
  // their pre-deploy data until the migration got around to clearing it.
  it('prefers the flat value over a stale inline copy', () => {
    const out = foldTeamsByYearFieldsFromFlat({
      teams: { 42: { byYear: { 2029: { rankByWeek: { 1: 25 } } } } },
      rankByWeekByTeamYear: { 42: { 2029: { 1: 4, 2: 3 } } },
    })
    expect(out.teams[42].byYear[2029].rankByWeek).toEqual({ 1: 4, 2: 3 })
  })

  // ── The three fields that were held back ──────────────────────────────
  // These three were held back from routing until the record/teamRecord
  // collision was resolved (both dual-wrote into teamRecordsByTeamYear under
  // different keys, so whichever saved last clobbered the other). The fix
  // gave the CALCULATED variant its own store. This test now pins that
  // separation — if the two ever collapse back onto one flat field, the
  // silent-clobber bug is back.
  it('routes record and teamRecord to SEPARATE flat stores', () => {
    expect(TEAMS_BYYEAR_FLAT_FIELDS.teamCalculatedRecordByTeamYear).toBe('record')
    expect(TEAMS_BYYEAR_FLAT_FIELDS.teamRecordsByTeamYear).toBe('teamRecord')
    expect(TEAMS_BYYEAR_FLAT_FIELDS.conferenceByTeamYear).toBe('conference')
    // No two sub-fields may share a flat store.
    const flats = Object.keys(TEAMS_BYYEAR_FLAT_FIELDS)
    expect(new Set(flats).size).toBe(flats.length)
    const subs = Object.values(TEAMS_BYYEAR_FLAT_FIELDS)
    expect(new Set(subs).size).toBe(subs.length)
  })

  // Conference now follows the same flat-wins rule as everything else: once
  // it's routed, updateDynasty strips the inline copy from every write, so an
  // inline value that survives on the main doc is the STALE one. (Before
  // routing, the reverse was true and this test asserted the opposite —
  // changing it was the point of the audit, not an oversight.)
  it('prefers the flat conference over a stale inline copy', () => {
    const out = foldTeamsByYearFieldsFromFlat({
      teams: { 42: { byYear: { 2029: { conference: 'SEC' } } } },
      conferenceByTeamYear: { 42: { 2029: 'Big Ten' } },
    })
    expect(out.teams[42].byYear[2029].conference).toBe('Big Ten')
  })

  // The safety half of the same rule: a dynasty that has NOT yet migrated has
  // no flat conference, and its inline value must survive untouched.
  it('keeps an inline conference when no flat twin exists yet', () => {
    const dynasty = { teams: { 42: { byYear: { 2029: { conference: 'SEC' } } } } }
    expect(foldTeamsByYearFieldsFromFlat(dynasty).teams[42].byYear[2029].conference).toBe('SEC')
  })

  // ── Doesn't invent teams ──────────────────────────────────────────────
  // The flat fields are dual-keyed by tid AND current abbr (rename-safe
  // writes), so a flat map routinely holds keys like 'UT' that are not tids.
  // Folding those in would add phantom entries to dynasty.teams.
  it('ignores flat keys with no matching team (abbr-keyed twins)', () => {
    const out = foldTeamsByYearFieldsFromFlat({
      teams: { 42: { abbr: 'UT', byYear: {} } },
      rankByWeekByTeamYear: { 42: { 2029: { 1: 5 } }, UT: { 2029: { 1: 5 } }, 999: { 2029: { 1: 1 } } },
    })
    expect(Object.keys(out.teams)).toEqual(['42'])
    expect(out.teams[42].byYear[2029].rankByWeek).toEqual({ 1: 5 })
  })

  // ── Purity ────────────────────────────────────────────────────────────
  // The input object is live React state (and, in updateDynasty, shares
  // references with the object seeded into this session's local state).
  // Mutating it in place would blank data out of the UI until reload.
  it('does not mutate its input', () => {
    const dynasty = {
      teams: { 42: { byYear: { 2029: { conference: 'SEC' } } } },
      rankByWeekByTeamYear: { 42: { 2029: { 1: 7 } } },
    }
    const snapshot = JSON.parse(JSON.stringify(dynasty))
    const out = foldTeamsByYearFieldsFromFlat(dynasty)
    expect(dynasty).toEqual(snapshot)
    expect(out).not.toBe(dynasty)
    expect(out.teams).not.toBe(dynasty.teams)
  })

  // ── Degenerate input ──────────────────────────────────────────────────
  // Local/IndexedDB dynasties never get flat fields at all, and the loader
  // calls this before every field is guaranteed present.
  it('handles missing, empty, and malformed input without throwing', () => {
    expect(foldTeamsByYearFieldsFromFlat(null)).toBe(null)
    expect(foldTeamsByYearFieldsFromFlat(undefined)).toBe(undefined)
    const noTeams = { id: 'local-1' }
    expect(foldTeamsByYearFieldsFromFlat(noTeams)).toBe(noTeams)
    const localDynasty = { id: 'local-2', teams: { 42: { abbr: 'UT', byYear: { 2029: { schedule: [] } } } } }
    expect(foldTeamsByYearFieldsFromFlat(localDynasty)).toBe(localDynasty)
    // Flat field present but garbage-shaped — must not throw or corrupt.
    const garbage = { teams: { 42: { byYear: {} } }, rankByWeekByTeamYear: { 42: null, 7: 'nope' } }
    expect(() => foldTeamsByYearFieldsFromFlat(garbage)).not.toThrow()
  })

  // ── Numeric vs string keys ────────────────────────────────────────────
  // tids are numbers in some writers and strings in others; JS object keys
  // are always strings, so both must land on the same team.
  it('matches numeric and string tid/year keys interchangeably', () => {
    const out = foldTeamsByYearFieldsFromFlat({
      teams: { 42: { byYear: {} } },
      rankByWeekByTeamYear: { '42': { '2029': { 1: 6 } } },
    })
    expect(out.teams['42'].byYear['2029'].rankByWeek).toEqual({ 1: 6 })
    expect(out.teams[42].byYear[2029].rankByWeek).toEqual({ 1: 6 })
  })

  // ── Multi-team, multi-year, multi-field ───────────────────────────────
  it('folds every field across many teams and years independently', () => {
    const out = foldTeamsByYearFieldsFromFlat({
      teams: { 42: { byYear: {} }, 136: { byYear: { 2029: { conference: 'B1G' } } } },
      rankByWeekByTeamYear: { 42: { 2029: { 1: 1 }, 2030: { 1: 2 } }, 136: { 2029: { 1: 3 } } },
      teamRatingsByTeamYear: { 136: { 2029: { offense: 91 } } },
      divisionByTeamYear: { 42: { 2030: 'East' } },
    })
    expect(out.teams[42].byYear[2029].rankByWeek).toEqual({ 1: 1 })
    expect(out.teams[42].byYear[2030].rankByWeek).toEqual({ 1: 2 })
    expect(out.teams[42].byYear[2030].division).toBe('East')
    expect(out.teams[136].byYear[2029].rankByWeek).toEqual({ 1: 3 })
    expect(out.teams[136].byYear[2029].teamRatings).toEqual({ offense: 91 })
    expect(out.teams[136].byYear[2029].conference).toBe('B1G')
    // 42 never had a 2029 division; folding 2030 must not invent one.
    expect(out.teams[42].byYear[2029].division).toBeUndefined()
  })
})
