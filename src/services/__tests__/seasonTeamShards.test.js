import { describe, it, expect } from 'vitest'
import {
  shardForTeamKey,
  TEAM_SHARD_COUNT,
  splitYearPatchIntoSeasonAndShards,
  splitSeasonalUpdateByYear,
  rehydrateSeasonalShapes,
} from '../seasonSubcollection'

// A single seasons/{year} doc combines every team's per-team-year data
// (schedule, coaching staff, recruiting commitments, rank-by-week, etc.)
// into one document. For a deep dynasty with a full ~130+ team league that
// combined doc can itself cross Firestore's 1 MiB cap — confirmed against
// a real dynasty whose seasons/2026 hit 1,049,245 bytes and started
// rejecting every write, even though the main doc and players/games
// subcollections were nowhere near their own limits. Sharding by team
// spreads that data across seasons/{year}/teamShards/{0..7}.

describe('shardForTeamKey', () => {
  it('is deterministic for the same key', () => {
    expect(shardForTeamKey('42')).toBe(shardForTeamKey('42'))
    expect(shardForTeamKey(42)).toBe(shardForTeamKey('42')) // numeric vs numeric-as-string
  })

  it('always returns an index within [0, TEAM_SHARD_COUNT)', () => {
    const keys = ['1', '2', '3', 'ARK', 'UT', '999999', 'a-teambuilder-abbr']
    for (const key of keys) {
      const shard = shardForTeamKey(key)
      expect(shard).toBeGreaterThanOrEqual(0)
      expect(shard).toBeLessThan(TEAM_SHARD_COUNT)
    }
  })

  it('spreads a realistic league across more than one shard', () => {
    // Not a rigorous distribution test — just confirms 136 teams don't all
    // collapse onto a single shard, which would defeat the whole point.
    const shards = new Set()
    for (let tid = 1; tid <= 136; tid++) shards.add(shardForTeamKey(String(tid)))
    expect(shards.size).toBeGreaterThan(1)
  })
})

describe('splitYearPatchIntoSeasonAndShards', () => {
  it('keeps a per-year field (no team dimension) on the season doc patch', () => {
    const { seasonDocPatch, shardPatches } = splitYearPatchIntoSeasonAndShards(2026, {
      allAmericans: ['player-a', 'player-b'],
    })
    expect(seasonDocPatch).toEqual({ year: 2026, allAmericans: ['player-a', 'player-b'] })
    expect(shardPatches).toEqual({})
  })

  it('routes a per-team-year field into a shard keyed by team, not onto the season doc', () => {
    const { seasonDocPatch, shardPatches } = splitYearPatchIntoSeasonAndShards(2026, {
      schedulesByTeam: { '10': [{ week: 1, opponent: 'AAA' }] },
    })
    expect(seasonDocPatch).toEqual({ year: 2026 })
    const shard = shardForTeamKey('10')
    expect(shardPatches[shard]).toEqual({ schedulesByTeam: { '10': [{ week: 1, opponent: 'AAA' }] } })
  })

  it('routes two teams that land in different shards into separate shard patches', () => {
    // Pick two team keys guaranteed to differ in shard (search a small
    // range rather than hardcoding two ids that could coincidentally
    // collide if TEAM_SHARD_COUNT or the hash ever changes).
    let tidA = '1'
    let tidB = null
    for (let i = 2; i < 50; i++) {
      if (shardForTeamKey(String(i)) !== shardForTeamKey(tidA)) { tidB = String(i); break }
    }
    expect(tidB).not.toBeNull()

    const { shardPatches } = splitYearPatchIntoSeasonAndShards(2026, {
      teamRatingsByTeam: { [tidA]: { ovr: 85 }, [tidB]: { ovr: 90 } },
    })
    const shardA = shardForTeamKey(tidA)
    const shardB = shardForTeamKey(tidB)
    expect(shardPatches[shardA].teamRatingsByTeam).toEqual({ [tidA]: { ovr: 85 } })
    expect(shardPatches[shardB].teamRatingsByTeam).toEqual({ [tidB]: { ovr: 90 } })
  })

  it('leaves a non-object per-team-year value on the season doc rather than crashing', () => {
    // Defensive: a null/undefined value for a per-team-year field name
    // (e.g. a stray write) must not throw trying to Object.entries() it.
    const { seasonDocPatch, shardPatches } = splitYearPatchIntoSeasonAndShards(2026, {
      schedulesByTeam: null,
    })
    expect(seasonDocPatch.schedulesByTeam).toBe(null)
    expect(shardPatches).toEqual({})
  })
})

describe('sharding round-trip vs. rehydrateSeasonalShapes', () => {
  it('season-doc-merge-with-shards then rehydrate reproduces the original legacy shape', () => {
    // Simulates what getSeasonsSubcollection does at read time: merge a
    // season doc's own fields with its (separately fetched) shard fields
    // before handing off to rehydrateSeasonalShapes — without actually
    // touching Firestore.
    const original = {
      allAmericansByYear: { 2026: ['player-a'] },
      schedulesByTeamYear: {
        '10': { 2026: [{ week: 1, opponent: 'AAA' }] },
        '20': { 2026: [{ week: 1, opponent: 'BBB' }] },
      },
    }
    const byYear = splitSeasonalUpdateByYear(original)
    const yearPatch = byYear[2026]
    const { seasonDocPatch, shardPatches } = splitYearPatchIntoSeasonAndShards(2026, yearPatch)

    // Reassemble what a shard-aware read would produce: season doc fields
    // plus every shard's fields flattened back together.
    const mergedShardFields = {}
    for (const shardData of Object.values(shardPatches)) {
      for (const [seasonField, teamMap] of Object.entries(shardData)) {
        if (!mergedShardFields[seasonField]) mergedShardFields[seasonField] = {}
        Object.assign(mergedShardFields[seasonField], teamMap)
      }
    }
    const mergedSeasonDocData = { ...seasonDocPatch, ...mergedShardFields }

    const rehydrated = rehydrateSeasonalShapes([{ id: '2026', data: () => mergedSeasonDocData }])
    expect(rehydrated).toEqual(original)
  })
})
