import { describe, it, expect } from 'vitest'
import { buildRankByWeekPatch } from '../cfb27SaveSync'

// PC dynasties never got a "Final Top 25" — the sync writes each week's
// media poll into rankByWeek[<save's raw week>], but Rankings.jsx's own
// "Final Poll" detection (and the Dashboard's Final Top 25 task) only ever
// recognize the dedicated week-105 slot, which nothing wrote to for a PC
// dynasty. Once the save itself confirms the season is over (phase ===
// 'offseason'), that sync's poll snapshot IS the real final ranking — so
// it should land in week 105 too, not just under whatever ordinary week
// number the save happened to report.

describe('buildRankByWeekPatch', () => {
  it('writes only the ordinary week slot when this is not the final-poll sync', () => {
    const result = buildRankByWeekPatch({ 3: 10 }, 16, 5, false)
    expect(result).toEqual({ 3: 10, 16: 5 })
    expect(result[105]).toBeUndefined()
  })

  it('also stamps the dedicated Final Poll slot (105) when this IS the final-poll sync', () => {
    const result = buildRankByWeekPatch({ 3: 10, 16: 8 }, 20, 4, true)
    expect(result).toEqual({ 3: 10, 16: 8, 20: 4, 105: 4 })
  })

  it('preserves every other week already recorded, only adding/overwriting the touched ones', () => {
    const existing = { 0: 22, 5: 18, 10: 12, 15: 6 }
    const result = buildRankByWeekPatch(existing, 20, 1, true)
    expect(result).toEqual({ 0: 22, 5: 18, 10: 12, 15: 6, 20: 1, 105: 1 })
  })

  it('handles a team with no prior rankByWeek at all', () => {
    const result = buildRankByWeekPatch(undefined, 20, 3, true)
    expect(result).toEqual({ 20: 3, 105: 3 })
  })

  it('a later non-final sync overwrites week 105 numerically but does not touch it (regression guard: only isFinalPollSync writes 105)', () => {
    // Simulates: final poll already recorded from a prior end-of-season
    // sync, then the user re-syncs mid-way through the SAME already-final
    // state without the offseason flag somehow flipping back — 105 must
    // stay untouched, not get overwritten with a stale/wrong value.
    const existing = { 20: 4, 105: 4 }
    const result = buildRankByWeekPatch(existing, 20, 4, false)
    expect(result[105]).toBe(4)
  })
})
