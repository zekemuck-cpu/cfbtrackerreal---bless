import { describe, it, expect } from 'vitest'
import { mapScheduleForTeam, APP_CCG_WEEK } from '../cfb27SaveImport'

// Regression tests for a real report: "sync from save didn't save the SEC
// Championship... just tried to redo it and now none of the conference games
// are there", plus a Week 0 "Practice" slot that the recap prompt counted as
// a loss against a 12-0 team.
//
// Root cause for the CCG half: the save's own conference-championship week is
// NOT a fixed number (15 and 16 have both been seen in real saves), but the
// app always files a conference championship at week 16. Carrying the raw
// week through meant the CCG either fell outside the schedule's week filter
// entirely or landed on a regular-season week.

const TEAMS = {
  1: { abbr: 'ALA' },
  2: { abbr: 'UGA' },
  3: { abbr: 'ECU' },
  137: { abbr: 'FCSE' },
}
// raw save team id -> app tid
const RAW = new Map([[100, 1], [200, 2], [300, 3]])

const game = (over) => ({
  weekType: 'RegularSeason',
  status: 'Played',
  homeTeamId: 100,
  awayTeamId: 300,
  week: 1,
  ...over,
})

describe('mapScheduleForTeam — conference championship week', () => {
  it('files a CCG at the app week when the save numbers it 16', () => {
    const out = mapScheduleForTeam(
      [game({ week: 16, awayTeamId: 200 })], RAW, 1, TEAMS, 16
    )
    expect(out).toHaveLength(1)
    expect(out[0].week).toBe(APP_CCG_WEEK)
    expect(out[0].isConferenceChampionship).toBe(true)
    expect(out[0].gameType).toBe('conference_championship')
  })

  // The regression that actually lost the SEC Championship: the old filter
  // was `week >= 0 && week <= 15`, so a week-16 CCG was silently discarded.
  it('does not drop a week-16 CCG', () => {
    const out = mapScheduleForTeam([game({ week: 16, awayTeamId: 200 })], RAW, 1, TEAMS, 16)
    expect(out.map(e => e.opponent)).toContain('UGA')
  })

  it('re-files a CCG the save numbers 15 onto the app CCG week, not week 15', () => {
    const out = mapScheduleForTeam([game({ week: 15, awayTeamId: 200 })], RAW, 1, TEAMS, 15)
    expect(out[0].week).toBe(APP_CCG_WEEK)
    expect(out[0].isConferenceChampionship).toBe(true)
  })

  it('leaves regular-season weeks untouched and untagged', () => {
    const out = mapScheduleForTeam([game({ week: 7 })], RAW, 1, TEAMS, 16)
    expect(out[0].week).toBe(7)
    expect(out[0].isConferenceChampionship).toBeUndefined()
    expect(out[0].gameType).toBeUndefined()
  })

  it('is unchanged when the save reports no CCG week at all', () => {
    const out = mapScheduleForTeam([game({ week: 7 })], RAW, 1, TEAMS, null)
    expect(out[0].week).toBe(7)
    expect(out[0].isConferenceChampionship).toBeUndefined()
  })
})

describe('mapScheduleForTeam — TeamIndex 255 sentinel', () => {
  // The reported symptom: a Week 0 row reading "Practice" with a blank logo,
  // which then became a 0-0 game record.
  it('drops the practice slot instead of importing it as an opponent', () => {
    const out = mapScheduleForTeam(
      [game({ week: 0, awayTeamId: 255, awayTeam: 'Practice' })], RAW, 1, TEAMS, 16
    )
    expect(out).toHaveLength(0)
  })

  it('drops bye/open placeholders regardless of casing or padding', () => {
    for (const name of ['BYE', ' Open Date ', 'none', 'Off']) {
      const out = mapScheduleForTeam(
        [game({ week: 0, awayTeamId: 255, awayTeam: name })], RAW, 1, TEAMS, 16
      )
      expect(out, `expected "${name}" to be dropped`).toHaveLength(0)
    }
  })

  // Guards the opposite regression — the FCS filler schools are REAL schedule
  // slots, and dropping them undercounted a team's season (the original
  // "Indiana only has 11 games" bug).
  it('still keeps the real FCS filler schools', () => {
    const out = mapScheduleForTeam(
      [game({ week: 2, awayTeamId: 255, awayTeam: 'FCS East' })], RAW, 1, TEAMS, 16
    )
    expect(out).toHaveLength(1)
    expect(out[0].opponentTid).toBe(137)
  })

  it('keeps an unrecognized 255 opponent by name rather than dropping it', () => {
    const out = mapScheduleForTeam(
      [game({ week: 2, awayTeamId: 255, awayTeam: 'Some New FCS School' })], RAW, 1, TEAMS, 16
    )
    expect(out).toHaveLength(1)
    expect(out[0].opponent).toBe('Some New FCS School')
  })
})
