import { describe, it, expect } from 'vitest'
import { getTeamRankForWeek } from '../DynastyContext'

// Regression tests for "my team's rank is stuck at #23 despite falling out of
// the rankings" — deleting the rank on the game re-derived it back, and
// re-saving the Top 25 couldn't clear it either.
//
// The write side was always correct: the Top 25 sheet save records an explicit
// null in rankByWeek for every team that fell out of a touched week's poll.
// The reader was the bug — its carry-forward scan skipped invalid values, so
// it walked straight past the drop-out marker back to the last real rank and
// resurrected it forever.

const dynastyWith = (rankByWeek) => ({
  currentYear: 2026,
  teams: {
    10: { abbr: 'BUF', name: 'Buffalo Bulls', byYear: { 2026: { rankByWeek } } },
  },
})

describe('getTeamRankForWeek — drop-out markers', () => {
  it('an explicit null at week N stops the carry-forward from week N-1', () => {
    const d = dynastyWith({ 4: 23, 5: null })
    expect(getTeamRankForWeek(d, 10, 2026, 5)).toBe(null)
  })

  it('weeks after the drop-out stay unranked (no resurrection of the old rank)', () => {
    const d = dynastyWith({ 4: 23, 5: null })
    expect(getTeamRankForWeek(d, 10, 2026, 6)).toBe(null)
    expect(getTeamRankForWeek(d, 10, 2026, 9)).toBe(null)
  })

  it('a NEW rank after the drop-out takes over again', () => {
    const d = dynastyWith({ 4: 23, 5: null, 8: 21 })
    expect(getTeamRankForWeek(d, 10, 2026, 8)).toBe(21)
    expect(getTeamRankForWeek(d, 10, 2026, 9)).toBe(21)
  })

  // The behavior the carry-forward exists for must survive: a poll stands
  // until a newer one is entered, absence is NOT a drop-out marker.
  it('a week with NO entry at all still carries the last rank forward', () => {
    const d = dynastyWith({ 4: 23 })
    expect(getTeamRankForWeek(d, 10, 2026, 5)).toBe(23)
    expect(getTeamRankForWeek(d, 10, 2026, 9)).toBe(23)
  })

  it('weeks before the drop-out are untouched', () => {
    const d = dynastyWith({ 4: 23, 5: null })
    expect(getTeamRankForWeek(d, 10, 2026, 4)).toBe(23)
  })

  it('regular-season weeks still never inherit a postseason poll', () => {
    const d = dynastyWith({ 101: 8 })
    expect(getTeamRankForWeek(d, 10, 2026, 12)).toBe(null)
  })
})
