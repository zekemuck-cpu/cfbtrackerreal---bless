import { describe, it, expect } from 'vitest'
import { reconcilePlayers, computeRosterArrivalsPossible } from '../cfb27SaveSync'

// New requirement (2026-08-28): the roster should only fully gain new
// players on specific offseason weeks, starting with National Signing Day
// (week 6) — the first week each season the save's own roster reflects the
// incoming class. An explicit, coded rule rather than relying on the save
// simply not having the data early.

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

  it('any other offseason week does not allow arrivals', () => {
    const existing = [{ pid: 1, cfb27AssetName: 'Existing_1' }]
    expect(computeRosterArrivalsPossible(existing, { targetPhase: 'offseason', targetWeek: 3 })).toBe(false)
    expect(computeRosterArrivalsPossible(existing, { targetPhase: 'offseason', targetWeek: 7 })).toBe(false)
  })

  it('the regular season never allows arrivals (once past the first sync)', () => {
    const existing = [{ pid: 1, cfb27AssetName: 'Existing_1' }]
    expect(computeRosterArrivalsPossible(existing, { targetPhase: 'regular_season', targetWeek: 6 })).toBe(false)
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
