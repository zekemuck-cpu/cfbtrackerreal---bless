import { describe, it, expect } from 'vitest'
import { getCustomConferencesForYear } from '../DynastyContext'

// getCustomConferencesForYear resolves conference membership from
// teams[tid].byYear[year].conference, with a fallback to the bulk
// customConferencesByYear snapshot for any team the per-tid data has no
// answer for (backfillConferencesPerTeam runs once per dynasty, so a team
// added afterwards never gets a per-tid entry and would otherwise be
// invisible on Conf. Standings / CC History forever).
//
// The fallback is only ever allowed to FILL a gap. Conference edits write
// both stores, but they write the per-tid field only for teams present in
// the new map — a team the user moved out of a conference keeps its stale
// per-tid value. If the fallback could outrank per-tid, or reach back to an
// older season for a team the current snapshot answers, a user's edit would
// silently revert to whatever the save first imported.

const dynasty = ({ teams, bulk }) => ({
  startYear: 2026,
  currentYear: 2027,
  teams,
  customConferencesByYear: bulk,
})

const team = (abbr, byYear = {}) => ({ abbr, name: `${abbr} Team`, byYear })

describe('getCustomConferencesForYear bulk fallback', () => {
  it('prefers the per-tid conference over the bulk snapshot', () => {
    const d = dynasty({
      teams: { 1: team('AAA', { 2027: { conference: 'Big Ten' } }) },
      bulk: { 2027: { 'Sun Belt': ['AAA'] } },
    })
    expect(getCustomConferencesForYear(d, 2027)).toEqual({ 'Big Ten': ['AAA'] })
  })

  it('falls back to the bulk snapshot when per-tid has no answer', () => {
    const d = dynasty({
      teams: { 1: team('AAA') },
      bulk: { 2027: { 'Sun Belt': ['AAA'] } },
    })
    expect(getCustomConferencesForYear(d, 2027)).toEqual({ 'Sun Belt': ['AAA'] })
  })

  it('does not reach back a season when the current snapshot places the team', () => {
    // The user moved AAA to the Sun Belt for 2027. Walking back to 2026 to
    // "find" Conference USA would resurrect the pre-edit conference.
    const d = dynasty({
      teams: { 1: team('AAA') },
      bulk: { 2026: { 'Conference USA': ['AAA'] }, 2027: { 'Sun Belt': ['AAA'] } },
    })
    expect(getCustomConferencesForYear(d, 2027)).toEqual({ 'Sun Belt': ['AAA'] })
  })

  it('leaves a team unassigned when neither store places it', () => {
    // An empty alignment resolves to null, not {} — callers treat that as
    // "no per-tid answer yet" and fall through to their own legacy paths.
    const d = dynasty({ teams: { 1: team('AAA') }, bulk: { 2027: {} } })
    expect(getCustomConferencesForYear(d, 2027)).toBeNull()
  })

  it('never places an FCS team', () => {
    const d = dynasty({
      teams: { 1: { ...team('FCS'), isFCS: true } },
      bulk: { 2027: { 'Sun Belt': ['FCS'] } },
    })
    expect(getCustomConferencesForYear(d, 2027)).toBeNull()
  })

  it('works with a dynasty that has no bulk snapshot at all', () => {
    const d = dynasty({ teams: { 1: team('AAA', { 2027: { conference: 'MAC' } }) }, bulk: undefined })
    expect(getCustomConferencesForYear(d, 2027)).toEqual({ MAC: ['AAA'] })
  })
})
