import { describe, it, expect } from 'vitest'
import { computeTrainingSnapshotUpdate } from '../DynastyContext'

// Training Results (offseason week 7) needs to show each player's overall
// as of RIGHT BEFORE training camp (National Signing Day, week 6) next to
// their overall now — but overallByYear only ever holds ONE value per
// YEAR, overwritten by every sync, so the "before" value is gone by the
// time week 7's own sync runs unless captured first. This is that capture.

const YEAR = 2029

function freshPlayer(pid, ovr) {
  return { pid, overallByYear: { [YEAR]: ovr } }
}

describe('computeTrainingSnapshotUpdate', () => {
  it('captures a snapshot the sync that first reaches week 7', () => {
    const dynasty = { currentYear: YEAR, overallBeforeTrainingByYear: {} }
    const seasonAdvance = { phase: 'offseason', week: 7 }
    const freshPlayers = [freshPlayer(1, 82), freshPlayer(2, 75)]
    const update = computeTrainingSnapshotUpdate(dynasty, seasonAdvance, freshPlayers)
    expect(update.overallBeforeTrainingByYear[YEAR]).toEqual({ 1: 82, 2: 75 })
  })

  it('does not capture again once a snapshot already exists for this year', () => {
    const dynasty = { currentYear: YEAR, overallBeforeTrainingByYear: { [YEAR]: { 1: 82 } } }
    const seasonAdvance = { phase: 'offseason', week: 7 }
    // Even if the roster has since moved on (e.g. a later re-sync still
    // sitting at week 7) — must NOT overwrite with an already-advanced value.
    const freshPlayers = [freshPlayer(1, 85)]
    const update = computeTrainingSnapshotUpdate(dynasty, seasonAdvance, freshPlayers)
    expect(update).toEqual({})
  })

  it('does not capture on any other offseason week', () => {
    const dynasty = { currentYear: YEAR, overallBeforeTrainingByYear: {} }
    for (const week of [1, 2, 3, 4, 5, 6, 8]) {
      const update = computeTrainingSnapshotUpdate(dynasty, { phase: 'offseason', week }, [freshPlayer(1, 82)])
      expect(update).toEqual({})
    }
  })

  it('does not capture during the regular season or any other phase', () => {
    const dynasty = { currentYear: YEAR, overallBeforeTrainingByYear: {} }
    const update = computeTrainingSnapshotUpdate(dynasty, { phase: 'regular_season', week: 7 }, [freshPlayer(1, 82)])
    expect(update).toEqual({})
  })

  it('handles a missing/null seasonAdvance gracefully (e.g. an unparseable save)', () => {
    const dynasty = { currentYear: YEAR, overallBeforeTrainingByYear: {} }
    expect(computeTrainingSnapshotUpdate(dynasty, null, [freshPlayer(1, 82)])).toEqual({})
  })

  it('skips a player with no overall for this year rather than snapshotting undefined', () => {
    const dynasty = { currentYear: YEAR, overallBeforeTrainingByYear: {} }
    const seasonAdvance = { phase: 'offseason', week: 7 }
    const freshPlayers = [freshPlayer(1, 82), { pid: 2, overallByYear: {} }]
    const update = computeTrainingSnapshotUpdate(dynasty, seasonAdvance, freshPlayers)
    expect(update.overallBeforeTrainingByYear[YEAR]).toEqual({ 1: 82 })
  })

  it('preserves other years already captured in overallBeforeTrainingByYear', () => {
    const dynasty = { currentYear: YEAR, overallBeforeTrainingByYear: { [YEAR - 1]: { 5: 70 } } }
    const seasonAdvance = { phase: 'offseason', week: 7 }
    const update = computeTrainingSnapshotUpdate(dynasty, seasonAdvance, [freshPlayer(1, 82)])
    expect(update.overallBeforeTrainingByYear).toEqual({
      [YEAR - 1]: { 5: 70 },
      [YEAR]: { 1: 82 },
    })
  })
})
