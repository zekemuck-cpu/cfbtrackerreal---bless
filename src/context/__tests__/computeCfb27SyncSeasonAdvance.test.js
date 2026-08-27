import { describe, it, expect } from 'vitest'
import { computeCfb27SyncSeasonAdvance } from '../DynastyContext'

// PC dynasties have no manual "Advance Week" button (Layout.jsx hides it
// entirely for isCfb27Auto, replacing it with "Sync from Save") — so this
// walker is the ONLY mechanism that ever moves a PC dynasty's tracked
// week/phase forward. A real user got permanently stuck at "End of Season
// Recap" once their save reached offseason week 1 (Players Leaving), because
// an earlier version of this function refused to step into 'offseason' at
// all. A later version still paused at week 4->5 (Signing Day) pending a
// class/redshirt confirmation, mirroring the CONSOLE flow's manual prompt —
// but PC doesn't need that: the save itself reports each player's real class
// once the tracker's year rolls over and a new-season save gets synced
// (cfb27SaveSync.js writes classByYear straight from the save, "save always
// wins"), so nothing here ever needs a human decision. These tests cover the
// walker advancing straight through the whole offseason unconditionally.

describe('computeCfb27SyncSeasonAdvance', () => {
  it('walks freely through early offseason weeks (Players Leaving, Recruiting)', () => {
    const result = computeCfb27SyncSeasonAdvance(5, 'postseason', 2029, 'offseason', 3, 2029)
    expect(result).toEqual({ week: 3, phase: 'offseason', reachedTarget: true })
  })

  it('walks straight through Signing Day (week 4->5) with no stop', () => {
    const result = computeCfb27SyncSeasonAdvance(3, 'offseason', 2029, 'offseason', 5, 2029)
    expect(result).toEqual({ week: 5, phase: 'offseason', reachedTarget: true })
  })

  it('walks all the way to offseason week 7', () => {
    const result = computeCfb27SyncSeasonAdvance(5, 'postseason', 2029, 'offseason', 7, 2029)
    expect(result).toEqual({ week: 7, phase: 'offseason', reachedTarget: true })
  })

  it('refuses to advance at all across a year mismatch', () => {
    const result = computeCfb27SyncSeasonAdvance(5, 'postseason', 2030, 'offseason', 3, 2029)
    expect(result).toEqual({ week: 5, phase: 'postseason', reachedTarget: false })
  })

  it('walks a full regular season through conference championship into postseason', () => {
    const result = computeCfb27SyncSeasonAdvance(14, 'regular_season', 2029, 'postseason', 2, 2029)
    expect(result).toEqual({ week: 2, phase: 'postseason', reachedTarget: true })
  })

  it('never walks backwards if the tracker is already ahead of the save-reported target phase', () => {
    const result = computeCfb27SyncSeasonAdvance(3, 'offseason', 2029, 'postseason', 4, 2029)
    expect(result).toEqual({ week: 3, phase: 'offseason', reachedTarget: false })
  })

  it('trusts the save-reported week when already in the target phase but ahead of it', () => {
    const result = computeCfb27SyncSeasonAdvance(6, 'offseason', 2029, 'offseason', 3, 2029)
    expect(result).toEqual({ week: 3, phase: 'offseason', reachedTarget: true })
  })
})
