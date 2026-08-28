import { describe, it, expect } from 'vitest'
import { reconcilePlayers, computeRosterArrivalsPossible } from '../cfb27SaveSync'

// New requirement (2026-08-28): the roster should only fully gain new
// players starting with National Signing Day (offseason week 6) — the first
// week each season the save's own roster reflects the incoming class. An
// explicit, coded rule rather than relying on the save simply not having
// the data early.
//
// Changed same day: originally an exact `=== 6` match, which a real dynasty
// showed could permanently miss a whole season's new class if no sync ever
// landed on that literal week — every OTHER team's freshmen silently never
// got created (only the user's own team's still arrived, via the separate
// recruiting-board pathway). Now a >= 6 threshold, open through every phase
// after Signing Day (not just the rest of the offseason) since the incoming
// class stays visible in the save for the whole season once it's signed.

const YEAR = 2029

// Ohio State resolves via the static team registry fallback (dynastyTeams
// can stay empty) — same real-team-name approach used elsewhere in this
// test suite for resolveTeamTid to succeed.
function makeRow(overrides = {}) {
  return {
    asset_name: 'NewGuyJohn_1',
    first_name: 'John',
    last_name: 'NewGuy',
    team: 'Ohio State',
    team_nick: 'Buckeyes',
    position: 'QB',
    year: 'Fr',
    height: `6'2"`,
    weight: 200,
    stars: 3,
    ...overrides,
  }
}

describe('computeRosterArrivalsPossible', () => {
  it('the very first CFB27 sync ever is never gated, regardless of week', () => {
    expect(computeRosterArrivalsPossible([], { targetPhase: 'regular_season', targetWeek: 3 })).toBe(true)
  })

  it('a dynasty with only console-tracked players (no cfb27AssetName) counts as first sync too', () => {
    const existing = [{ pid: 1, name: 'Manual Entry' }]
    expect(computeRosterArrivalsPossible(existing, { targetPhase: 'regular_season', targetWeek: 3 })).toBe(true)
  })

  it('National Signing Day (offseason week 6) allows arrivals', () => {
    const existing = [{ pid: 1, cfb27AssetName: 'Existing_1' }]
    expect(computeRosterArrivalsPossible(existing, { targetPhase: 'offseason', targetWeek: 6 })).toBe(true)
  })

  it('an earlier offseason week (before Signing Day) does not allow arrivals', () => {
    const existing = [{ pid: 1, cfb27AssetName: 'Existing_1' }]
    expect(computeRosterArrivalsPossible(existing, { targetPhase: 'offseason', targetWeek: 3 })).toBe(false)
    expect(computeRosterArrivalsPossible(existing, { targetPhase: 'offseason', targetWeek: 5 })).toBe(false)
  })

  it('any offseason week at or after Signing Day allows arrivals, not just the literal week 6', () => {
    const existing = [{ pid: 1, cfb27AssetName: 'Existing_1' }]
    expect(computeRosterArrivalsPossible(existing, { targetPhase: 'offseason', targetWeek: 7 })).toBe(true)
    expect(computeRosterArrivalsPossible(existing, { targetPhase: 'offseason', targetWeek: 8 })).toBe(true)
  })

  it('any phase after Signing Day allows arrivals too (preseason, regular season, etc.)', () => {
    const existing = [{ pid: 1, cfb27AssetName: 'Existing_1' }]
    expect(computeRosterArrivalsPossible(existing, { targetPhase: 'preseason', targetWeek: 0 })).toBe(true)
    expect(computeRosterArrivalsPossible(existing, { targetPhase: 'regular_season', targetWeek: 6 })).toBe(true)
    expect(computeRosterArrivalsPossible(existing, { targetPhase: 'conference_championship', targetWeek: 1 })).toBe(true)
    expect(computeRosterArrivalsPossible(existing, { targetPhase: 'postseason', targetWeek: 2 })).toBe(true)
  })

  it('an unresolved phase still gates closed', () => {
    const existing = [{ pid: 1, cfb27AssetName: 'Existing_1' }]
    expect(computeRosterArrivalsPossible(existing, { targetPhase: null, targetWeek: null })).toBe(false)
  })
})

describe('reconcilePlayers roster-arrival gating', () => {
  it('a genuinely brand-new player is deferred when arrivals are not possible', () => {
    const rows = [makeRow()]
    const result = reconcilePlayers(rows, [], { year: YEAR, dynastyTeams: {}, leavingPlayers: [], rosterArrivalsPossible: false })
    expect(result.toCreate).toHaveLength(0)
  })

  it('the same brand-new player IS created once arrivals are possible', () => {
    const rows = [makeRow()]
    const result = reconcilePlayers(rows, [], { year: YEAR, dynastyTeams: {}, leavingPlayers: [], rosterArrivalsPossible: true })
    expect(result.toCreate).toHaveLength(1)
    expect(result.toCreate[0].name).toBe('John NewGuy')
  })

  it('a dangling recruit placeholder is NOT promoted when arrivals are not possible', () => {
    const danglingRecruit = {
      pid: 42,
      name: 'John NewGuy',
      isTarget: true,
      team: -1,
      targetYear: YEAR - 1,
      teamsByYear: {},
    }
    const rows = [makeRow({ asset_name: null })] // recruits' rows often have no asset_name yet either, but matching is by name+team:-1 here
    const result = reconcilePlayers(rows, [danglingRecruit], { year: YEAR, dynastyTeams: {}, leavingPlayers: [], rosterArrivalsPossible: false })
    expect(result.toUpdate).toHaveLength(0)
    expect(result.toCreate).toHaveLength(0)
  })

  it('the same dangling recruit IS promoted (via toUpdate) once arrivals are possible', () => {
    const danglingRecruit = {
      pid: 42,
      name: 'John NewGuy',
      isTarget: true,
      team: -1,
      targetYear: YEAR - 1,
      teamsByYear: {},
    }
    const rows = [makeRow({ asset_name: null })]
    const result = reconcilePlayers(rows, [danglingRecruit], { year: YEAR, dynastyTeams: {}, leavingPlayers: [], rosterArrivalsPossible: true })
    expect(result.toUpdate).toHaveLength(1)
    expect(result.toUpdate[0].pid).toBe(42)
    expect(result.toCreate).toHaveLength(0)
  })

  it('an already-rostered player (matched by asset name) still updates normally regardless of the gate', () => {
    const existingPlayer = {
      pid: 7,
      name: 'John NewGuy',
      cfb27AssetName: 'NewGuyJohn_1',
      team: 194,
      teamsByYear: { [YEAR - 1]: 194 },
    }
    const rows = [makeRow()] // same asset_name as existingPlayer
    const result = reconcilePlayers(rows, [existingPlayer], { year: YEAR, dynastyTeams: {}, leavingPlayers: [], rosterArrivalsPossible: false })
    expect(result.toCreate).toHaveLength(0)
    // Still gets an update (e.g. jersey/position/team refresh) — an
    // already-known roster player is never treated as a "new appearance".
    expect(result.toUpdate.some((u) => u.pid === 7)).toBe(true)
  })
})
