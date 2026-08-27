import { describe, it, expect } from 'vitest'
import { buildLeagueDraftResults } from '../cfb27SaveSync'

// The in-game "Draft Results" screen turned out to source from the SAME
// LeavingPlayer table Players Leaving reads, filtered to EarlyNFL_* rows —
// verified against a real save: LeavingPlayer.ProjectRound matched a real
// 9-player Ohio State draft class exactly, round for round (Sayin R1, Smith
// R1, Montgomery R2, Siereveld R3, Jackson Jr R3, Walker R4, Mathews Jr R4,
// Inniss R6, Hinzman R6). PLYR_DRAFTROUND on the player record itself is a
// separate field that never actually resolves mid-season (16,254 of 16,257
// players in that same save still carried its "not yet drafted" sentinel).

describe('buildLeagueDraftResults', () => {
  // Whole-league player rows come from buildPlayerRows in
  // api/_lib/cfb27Extract/extractPlayers.cjs, which names the rating field
  // `ovr` — not `overall` — so the fixtures below match that real shape.
  const players = [
    { asset_name: 'SayinJulian_1', first_name: 'Julian', last_name: 'Sayin', position: 'QB', year: 'Junior', ovr: 94, team_id: 68 },
    { asset_name: 'SmithJeremiah_2', first_name: 'Jeremiah', last_name: 'Smith', position: 'WR', year: 'Junior', ovr: 99, team_id: 68 },
    { asset_name: 'InnissBrandon_3', first_name: 'Brandon', last_name: 'Inniss', position: 'WR', year: 'Senior', ovr: 88, team_id: 68 },
  ]
  const rawTeamIdMap = new Map([[68, 194]]) // raw save team id 68 -> app tid 194 (arbitrary for the test)

  it('resolves a whole-league draft class from EarlyNFL_* leaving-player rows', () => {
    const leavingPlayers = [
      { assetName: 'SayinJulian_1', category: 'draft', reason: null, projectRound: 1 },
      { assetName: 'SmithJeremiah_2', category: 'draft', reason: null, projectRound: 1 },
      { assetName: 'InnissBrandon_3', category: 'draft', reason: null, projectRound: 6 },
    ]
    const result = buildLeagueDraftResults(leavingPlayers, players, rawTeamIdMap)
    expect(result).toEqual([
      { assetName: 'SayinJulian_1', playerName: 'Julian Sayin', position: 'QB', classYear: 'Junior', overall: 94, tid: 194, draftRound: '1st Round', round: 1 },
      { assetName: 'SmithJeremiah_2', playerName: 'Jeremiah Smith', position: 'WR', classYear: 'Junior', overall: 99, tid: 194, draftRound: '1st Round', round: 1 },
      { assetName: 'InnissBrandon_3', playerName: 'Brandon Inniss', position: 'WR', classYear: 'Senior', overall: 88, tid: 194, draftRound: '6th Round', round: 6 },
    ])
  })

  it('ignores transfer/graduate leaving-player rows entirely', () => {
    const leavingPlayers = [
      { assetName: 'SayinJulian_1', category: 'transfer', reason: 'Pro Potential', projectRound: null },
      { assetName: 'SmithJeremiah_2', category: 'graduate', reason: null, projectRound: null },
    ]
    expect(buildLeagueDraftResults(leavingPlayers, players, rawTeamIdMap)).toEqual([])
  })

  it('drops a draft entry whose player row cannot be resolved', () => {
    const leavingPlayers = [{ assetName: 'Unknown_99', category: 'draft', reason: null, projectRound: 3 }]
    expect(buildLeagueDraftResults(leavingPlayers, players, rawTeamIdMap)).toEqual([])
  })

  it('drops a draft entry whose team cannot be mapped to an app tid', () => {
    const leavingPlayers = [{ assetName: 'SayinJulian_1', category: 'draft', reason: null, projectRound: 1 }]
    expect(buildLeagueDraftResults(leavingPlayers, players, new Map())).toEqual([])
  })

  it('drops a draft entry with no resolvable projectRound', () => {
    const leavingPlayers = [{ assetName: 'SayinJulian_1', category: 'draft', reason: null, projectRound: null }]
    expect(buildLeagueDraftResults(leavingPlayers, players, rawTeamIdMap)).toEqual([])
  })

  it('handles empty/missing inputs gracefully', () => {
    expect(buildLeagueDraftResults(undefined, undefined, new Map())).toEqual([])
    expect(buildLeagueDraftResults([], [], new Map())).toEqual([])
  })

  it('dedupes a player who has more than one identical LeavingPlayer row (observed in a real save)', () => {
    const leavingPlayers = [
      { assetName: 'SayinJulian_1', category: 'draft', reason: null, projectRound: 1 },
      { assetName: 'SayinJulian_1', category: 'draft', reason: null, projectRound: 1 },
    ]
    const result = buildLeagueDraftResults(leavingPlayers, players, rawTeamIdMap)
    expect(result).toHaveLength(1)
    expect(result[0].playerName).toBe('Julian Sayin')
  })
})
