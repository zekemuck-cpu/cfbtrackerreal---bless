import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { buildDefaultRosterPlayers, portraitUrlFor } from '../defaultRosterLoader'

// Console dynasties seed from the bundled rosters, which begin the season with
// the SAME players as the PC game — so those players can be handed their real
// in-game faces at creation instead of a silhouette. Initial seed only; every
// season after is the user's to maintain, exactly as before.
//
// The name -> portrait mapping is GENERATED from a base save
// (scripts/build-default-portrait-map.mjs) because the bundled rosters carry no
// portrait id. It is deliberately not committed by hand and not invented here:
// a guessed mapping puts the wrong face on a real player, which is worse than
// no face. So the resolution logic is tested against an injected map, and the
// integration test covers the un-generated state the feature ships in.
//
// mapPortraitUrl returns '' without a `window` (it builds a URL against the
// configured host) and these run under node, so both are stubbed — otherwise
// every assertion would pass trivially by resolving to ''.

beforeAll(() => {
  globalThis.window = { location: { origin: 'https://dynastytracker.app' } }
  vi.stubEnv('VITE_CFB27_PORTRAIT_BASE', 'https://cdn.example.com')
})
afterAll(() => {
  delete globalThis.window
  vi.unstubAllEnvs()
})

const MAP = {
  brentgordonjr: 'Unique_Player_100',
  sheltonsampsonjr: 'Generic_0001_P_T0000_D_1_1',
}

describe('portraitUrlFor — name to portrait resolution', () => {
  it('resolves a real player to their unique portrait', () => {
    expect(portraitUrlFor({ name: 'Brent Gordon Jr.' }, MAP))
      .toBe('https://cdn.example.com/cfb27-portraits/unique/100.webp')
  })

  it('resolves a generated player to their generic portrait', () => {
    expect(portraitUrlFor({ name: 'Shelton Sampson Jr.' }, MAP))
      .toBe('https://cdn.example.com/cfb27-portraits/generic/0001_P_T0000_D_1_1.webp')
  })

  it('matches regardless of punctuation, spacing or case', () => {
    const expected = 'https://cdn.example.com/cfb27-portraits/unique/100.webp'
    for (const n of ['brent gordon jr', 'BRENT GORDON JR.', "Brent  Gordon   Jr."]) {
      expect(portraitUrlFor({ name: n }, MAP)).toBe(expected)
    }
  })

  it('builds the name from firstName/lastName when there is no full name', () => {
    expect(portraitUrlFor({ firstName: 'Brent', lastName: 'Gordon Jr.' }, MAP))
      .toBe('https://cdn.example.com/cfb27-portraits/unique/100.webp')
  })

  // The important half. An unmatched name must stay blank rather than borrow
  // someone else's face — blank falls back to the team logo, which is what
  // console dynasties showed before this existed.
  it('returns blank for a name the map does not carry', () => {
    expect(portraitUrlFor({ name: 'Someone Not In The Map' }, MAP)).toBe('')
  })

  it('returns blank when there is no map at all', () => {
    expect(portraitUrlFor({ name: 'Brent Gordon Jr.' }, null)).toBe('')
    expect(portraitUrlFor({ name: 'Brent Gordon Jr.' }, {})).toBe('')
  })

  // An asset id with no file in the shipped pack must not produce a URL that
  // 404s — mapPortraitUrl gates on the manifests for exactly this reason.
  it('returns blank for an asset that is not in the portrait pack', () => {
    expect(portraitUrlFor({ name: 'X' }, { x: 'Unique_Player_99999999' })).toBe('')
  })
})

describe('default roster seeding — with no portrait maps generated yet', () => {
  it('seeds every player blank, exactly as before the feature existed', async () => {
    const players = await buildDefaultRosterPlayers(110, 2029, 1, 'cfb27')
    expect(players.length).toBeGreaterThan(0)
    for (const p of players) expect(p.pictureUrl).toBe('')
  })

  it('still produces a complete roster with contiguous pids', async () => {
    const players = await buildDefaultRosterPlayers(110, 2029, 1, 'cfb27')
    const p = players[0]
    expect(p.team).toBe(110)
    expect(p.teamsByYear[2029]).toBe(110)
    expect(p.entryReason).toBe('created')
    expect(players.map(x => x.pid)).toEqual(players.map((_, i) => i + 1))
  })
})
