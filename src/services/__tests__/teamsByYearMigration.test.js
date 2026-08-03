import { describe, it, expect } from 'vitest'
import {
  TEAMS_BYYEAR_FLAT_FIELDS,
  foldTeamsByYearFieldsFromFlat,
  stripTeamsByYearFlatFields,
} from '../seasonSubcollection'

// Regression coverage for the bug reported in production: the main-doc size
// guard in DynastyContext.jsx's updateDynasty was measuring the FOLDED-BACK
// dynasty.teams shape (rankByWeek/schedule/teamRatings/etc. reconstructed
// from the seasons subcollection for readers) instead of what actually gets
// persisted to the main doc after the write-router strips those same
// fields. That mismatch made the guard reject "Sync from Save" for a
// dynasty whose real main doc would have been well under the 1MB cap.
//
// These tests exercise the two shared functions directly with synthetic
// data shaped like a real CFB27 dynasty (many teams, several seasons each,
// every migrated field populated) to prove — with real byte counts, not
// just code review — that strip() actually removes enough weight and that
// fold(strip(x)) reconstructs the original shape losslessly.

function buildSyntheticTeam(tid, years) {
  const byYear = {}
  for (const year of years) {
    byYear[year] = {
      // Migrated fields (should be stripped/folded)
      rankByWeek: Object.fromEntries(Array.from({ length: 16 }, (_, i) => [i, (i % 25) + 1])),
      schedule: Array.from({ length: 12 }, (_, i) => ({ opponent: `Team${i}`, week: i, result: 'W' })),
      teamRatings: { overall: 85, offense: 84, defense: 86 },
      coachingStaff: { headCoach: 'Coach A', oc: 'Coach B', dc: 'Coach C' },
      preseasonSetup: { scheduleEntered: true, rosterEntered: true },
      recruitingCommitments: Array.from({ length: 20 }, (_, i) => ({ pid: i, name: `Recruit${i}` })),
      recruitingClassRank: 15,
      playersLeaving: Array.from({ length: 5 }, (_, i) => ({ pid: i, reason: 'graduation' })),
      draftResults: Array.from({ length: 3 }, (_, i) => ({ pid: i, round: 1, pick: i })),
      transferDestinations: {},
      portalTransferClass: [],
      fringeCaseClass: [],
      trainingResults: {},
      conferenceChampionshipData: {},
      bowlEligibilityData: { eligible: true },
      encourageTransfers: [],
      recruits: Array.from({ length: 25 }, (_, i) => ({ pid: i, stars: 3 })),
      division: 'East',
      schoolGrades: { academics: 'A', facilities: 'B' },
      recruitingClassConferenceRank: 5,
      recruitingClassStats: { avgStars: 3.2 },
      // Deliberately excluded fields — must survive strip() untouched
      conference: 'Big Ten',
      record: '10-2',
      teamRecord: '10-2',
      // A field not covered by any migration at all
      customField: 'untouched',
    }
  }
  return {
    tid,
    abbr: `T${tid}`,
    name: `Team ${tid}`,
    statRecords: { career: [], game: [], season: [] },
    byYear,
  }
}

function buildSyntheticTeams(teamCount, years) {
  const teams = {}
  for (let i = 0; i < teamCount; i++) {
    teams[i] = buildSyntheticTeam(i, years)
  }
  return teams
}

describe('stripTeamsByYearFlatFields', () => {
  it('removes every migrated field from every team/year and nothing else', () => {
    const teams = buildSyntheticTeams(3, [2029, 2030])
    const { strippedTeams } = stripTeamsByYearFlatFields(teams)

    for (const tidKey of Object.keys(teams)) {
      for (const yearKey of Object.keys(teams[tidKey].byYear)) {
        const strippedYear = strippedTeams[tidKey].byYear[yearKey]
        for (const subField of Object.values(TEAMS_BYYEAR_FLAT_FIELDS)) {
          expect(subField in strippedYear).toBe(false)
        }
        // Deliberately-excluded and unrelated fields must survive untouched
        expect(strippedYear.conference).toBe('Big Ten')
        expect(strippedYear.record).toBe('10-2')
        expect(strippedYear.teamRecord).toBe('10-2')
        expect(strippedYear.customField).toBe('untouched')
      }
      // Team meta fields untouched
      expect(strippedTeams[tidKey].abbr).toBe(teams[tidKey].abbr)
      expect(strippedTeams[tidKey].statRecords).toEqual(teams[tidKey].statRecords)
    }
  })

  it('produces an extracted map shaped for splitSeasonalUpdateByYear ({seasonalField: {tid: {year: value}}})', () => {
    const teams = buildSyntheticTeams(2, [2029])
    const { extracted } = stripTeamsByYearFlatFields(teams)

    expect(extracted.rankByWeekByTeamYear['0']['2029']).toEqual(teams['0'].byYear[2029].rankByWeek)
    expect(extracted.schedulesByTeamYear['1']['2029']).toEqual(teams['1'].byYear[2029].schedule)
    // Excluded fields must never appear in the extracted output at all
    expect(extracted.conferenceByTeamYear).toBeUndefined()
  })

  it('actually shrinks serialized size — the whole point of the migration', () => {
    // 136 teams x 3 seasons, matching the repo's own "~136 schools" framing
    // for a realistic CFB27 dynasty a few seasons in.
    const teams = buildSyntheticTeams(136, [2029, 2030, 2031])
    const originalBytes = new TextEncoder().encode(JSON.stringify(teams)).length
    const { strippedTeams } = stripTeamsByYearFlatFields(teams)
    const strippedBytes = new TextEncoder().encode(JSON.stringify(strippedTeams)).length

    expect(strippedBytes).toBeLessThan(originalBytes)
    // Migrated fields are the overwhelming majority of the synthetic
    // payload (schedule/recruits/recruitingCommitments arrays dwarf the
    // handful of excluded fields) — stripping should remove the large
    // majority of the bytes, not a token amount.
    expect(strippedBytes).toBeLessThan(originalBytes * 0.25)
  })

  it('is a no-op (returns the same reference) when nothing needs stripping', () => {
    const teams = { 0: { tid: 0, abbr: 'T0', byYear: { 2029: { conference: 'Big Ten' } } } }
    const { strippedTeams, extracted } = stripTeamsByYearFlatFields(teams)
    expect(strippedTeams).toBe(teams)
    expect(extracted).toEqual({})
  })

  it('handles teams with no byYear, empty teams object, and null/undefined gracefully', () => {
    expect(stripTeamsByYearFlatFields(null).strippedTeams).toBe(null)
    expect(stripTeamsByYearFlatFields(undefined).strippedTeams).toBe(undefined)
    expect(stripTeamsByYearFlatFields({}).strippedTeams).toEqual({})
    const teamsNoByYear = { 0: { tid: 0, abbr: 'T0' } }
    const result = stripTeamsByYearFlatFields(teamsNoByYear)
    expect(result.strippedTeams).toBe(teamsNoByYear)
    expect(result.extracted).toEqual({})
  })
})

describe('foldTeamsByYearFieldsFromFlat + stripTeamsByYearFlatFields round-trip', () => {
  it('reconstructs an equivalent teams object after strip -> fold', () => {
    const teams = buildSyntheticTeams(4, [2029, 2030])
    const { strippedTeams, extracted } = stripTeamsByYearFlatFields(teams)

    // Simulate what the seasons subcollection would rehydrate onto the
    // dynasty object: the SAME extracted shape, exposed under the flat
    // *ByTeamYear field names.
    const dynastyAfterReload = { teams: strippedTeams, ...extracted }
    const folded = foldTeamsByYearFieldsFromFlat(dynastyAfterReload)

    for (const tidKey of Object.keys(teams)) {
      for (const yearKey of Object.keys(teams[tidKey].byYear)) {
        expect(folded.teams[tidKey].byYear[yearKey]).toEqual(teams[tidKey].byYear[yearKey])
      }
    }
  })

  it('is idempotent — folding twice does not change the result or throw', () => {
    const teams = buildSyntheticTeams(2, [2029])
    const { strippedTeams, extracted } = stripTeamsByYearFlatFields(teams)
    const dynasty = { teams: strippedTeams, ...extracted }
    const foldedOnce = foldTeamsByYearFieldsFromFlat(dynasty)
    const foldedTwice = foldTeamsByYearFieldsFromFlat(foldedOnce)
    expect(foldedTwice).toEqual(foldedOnce)
  })

  it('leaves a dynasty with no flat fields at all untouched (pre-migration dynasty, never synced since)', () => {
    const dynasty = { teams: buildSyntheticTeams(2, [2029]) }
    const folded = foldTeamsByYearFieldsFromFlat(dynasty)
    expect(folded).toBe(dynasty)
  })
})

describe('size-guard equivalence (the actual regression)', () => {
  it('the folded-back shape and the stripped shape must NOT be measured as equal size — proves the guard bug is real and the fix addresses it', () => {
    const teams = buildSyntheticTeams(136, [2029, 2030])
    const { strippedTeams, extracted } = stripTeamsByYearFlatFields(teams)
    const dynastyAfterReload = { teams: strippedTeams, ...extracted }
    const folded = foldTeamsByYearFieldsFromFlat(dynastyAfterReload)

    // This is what the OLD buggy guard measured: the folded-back shape.
    const buggyMeasuredBytes = new TextEncoder().encode(JSON.stringify(folded.teams)).length
    // This is what the FIXED guard measures: stripTeamsByYearFlatFields
    // applied again right before the size check, matching what the
    // write-router will actually persist.
    const fixedMeasuredBytes = new TextEncoder().encode(
      JSON.stringify(stripTeamsByYearFlatFields(folded.teams).strippedTeams)
    ).length

    expect(buggyMeasuredBytes).toBeGreaterThan(fixedMeasuredBytes * 3)
  })
})
