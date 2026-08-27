import { describe, it, expect } from 'vitest'
import { runDraftEngine, mergeSimulatedDraftPicks, REAL_2026_DRAFT_ORDER } from '../draftEngine'

describe('runDraftEngine', () => {
  it('never lets a team exceed the hard roster cap under realistic supply', () => {
    // QB cap is 1 — under any realistic draft class (well below the 32
    // teams x 1 the cap can absorb), no team should get a second QB.
    const players = Array.from({ length: 5 }, (_, i) => ({
      assetName: `qb_${i}`, name: `QB ${i}`, pos: 'QB', ovr: 70 + (i % 20), round: 1,
    }))
    const picks = runDraftEngine(players)
    const countByTeam = new Map()
    for (const p of picks) countByTeam.set(p.team, (countByTeam.get(p.team) || 0) + 1)
    for (const count of countByTeam.values()) expect(count).toBeLessThanOrEqual(1)
  })

  it('can only exceed a cap when oversupply structurally forces it (more of one position than all teams can absorb)', () => {
    // 40 round-1 QBs vs 32 teams x cap-1 = 32 absorbable — the extra 8 MUST
    // land somewhere once every team is already full, so the overflow
    // ("Late Pick") bucket falls back to placing them anyway rather than
    // dropping real players from the board. This is a documented, accepted
    // trade-off (see draftEngine.js's overflow-loop comment), not a bug —
    // this test exists to pin the behavior, not assert the cap holds.
    const players = Array.from({ length: 40 }, (_, i) => ({
      assetName: `qb_${i}`, name: `QB ${i}`, pos: 'QB', ovr: 70 + (i % 20), round: 1,
    }))
    const picks = runDraftEngine(players)
    expect(picks).toHaveLength(40)
    expect(picks.every((p) => p.team)).toBe(true)
  })

  it('groups split position tags (LT/RT) under the same OT family cap', () => {
    // OT family cap is 2 — 6 tackles (mixed LT/RT) across 32 teams must still
    // cap at 2 COMBINED per team, not 2 LTs + 2 RTs.
    const players = [
      { assetName: 'lt1', name: 'LT One', pos: 'LT', ovr: 90, round: 1 },
      { assetName: 'lt2', name: 'LT Two', pos: 'LT', ovr: 88, round: 1 },
      { assetName: 'lt3', name: 'LT Three', pos: 'LT', ovr: 86, round: 1 },
      { assetName: 'rt1', name: 'RT One', pos: 'RT', ovr: 84, round: 1 },
      { assetName: 'rt2', name: 'RT Two', pos: 'RT', ovr: 82, round: 1 },
      { assetName: 'rt3', name: 'RT Three', pos: 'RT', ovr: 80, round: 1 },
    ]
    const picks = runDraftEngine(players)
    const countByTeam = new Map()
    for (const p of picks) countByTeam.set(p.team, (countByTeam.get(p.team) || 0) + 1)
    for (const count of countByTeam.values()) expect(count).toBeLessThanOrEqual(2)
  })

  it('round 1 stays close to a provided baseOrder (light shuffle, not a full reshuffle)', () => {
    // 32 round-1 players so every NFL team picks exactly once — round 1's
    // team order IS the (lightly shuffled) baseOrder directly, since the
    // trade-shuffle only kicks in for round > 1.
    const players = REAL_2026_DRAFT_ORDER.map((_, i) => ({
      assetName: `p${i}`, name: `Player ${i}`, pos: 'WR', ovr: 99 - i, round: 1,
    }))
    const picks = runDraftEngine(players, { baseOrder: REAL_2026_DRAFT_ORDER })
      .sort((a, b) => a.overallPick - b.overallPick)
    const matches = picks.filter((p, i) => p.team === REAL_2026_DRAFT_ORDER[i]).length
    // At most 3 swaps can touch at most 6 positions, so at least 26/32 must match.
    expect(matches).toBeGreaterThanOrEqual(26)
    // But it's not an exact, unshuffled copy either.
    expect(picks.every((p, i) => p.team === REAL_2026_DRAFT_ORDER[i])).toBe(false)
  })

  it('without a baseOrder, round 1 is fully random (not pinned to REAL_2026_DRAFT_ORDER)', () => {
    const players = REAL_2026_DRAFT_ORDER.map((_, i) => ({
      assetName: `p${i}`, name: `Player ${i}`, pos: 'WR', ovr: 99 - i, round: 1,
    }))
    // Run several trials — a full shuffle should disagree with the real
    // order in a lot more than 6 slots at least once.
    const anyTrialFarFromReal = Array.from({ length: 5 }).some(() => {
      const picks = runDraftEngine(players).sort((a, b) => a.overallPick - b.overallPick)
      const matches = picks.filter((p, i) => p.team === REAL_2026_DRAFT_ORDER[i]).length
      return matches < 20
    })
    expect(anyTrialFarFromReal).toBe(true)
  })

  it('assigns every player a team, round, and pick label', () => {
    const players = [
      { assetName: 'a', name: 'Player A', pos: 'WR', ovr: 95, round: 1 },
      { assetName: 'b', name: 'Player B', pos: 'K', ovr: 75, round: 6 },
    ]
    const picks = runDraftEngine(players)
    expect(picks).toHaveLength(2)
    for (const p of picks) {
      expect(p.team).toBeTruthy()
      expect(p.round).toBeGreaterThan(0)
      expect(p.pickLabel).toBeTruthy()
    }
  })
})

describe('mergeSimulatedDraftPicks', () => {
  const fresh = [
    { assetName: 'p1', playerName: 'Player One', position: 'QB', overall: 96, tid: 1, draftRound: '1st Round', round: 1 },
    { assetName: 'p2', playerName: 'Player Two', position: 'WR', overall: 91, tid: 2, draftRound: '2nd Round', round: 2 },
    { assetName: 'p3', playerName: 'Player Three', position: 'CB', overall: 88, tid: 3, draftRound: '3rd Round', round: 3 },
  ]

  it('generates mock picks the first time a year has no prior simulated data', () => {
    const result = mergeSimulatedDraftPicks(fresh, undefined)
    expect(result).toHaveLength(3)
    for (const r of result) {
      expect(r.team).toBeTruthy()
      expect(Number.isFinite(r.overallPick) || r.overallPick === null).toBe(true)
    }
  })

  it('freezes picks once generated — a second sync with unchanged data does not reshuffle', () => {
    const first = mergeSimulatedDraftPicks(fresh, undefined)
    const second = mergeSimulatedDraftPicks(fresh, first)
    expect(second.map((r) => r.team)).toEqual(first.map((r) => r.team))
    expect(second.map((r) => r.overallPick)).toEqual(first.map((r) => r.overallPick))
  })

  it('drops a frozen pick if the player\'s real round shifts after freezing', () => {
    const first = mergeSimulatedDraftPicks(fresh, undefined)
    const shifted = fresh.map((r) => (r.assetName === 'p1' ? { ...r, round: 4, draftRound: '4th Round' } : r))
    const second = mergeSimulatedDraftPicks(shifted, first)
    const p1 = second.find((r) => r.assetName === 'p1')
    expect(p1.team).toBeUndefined()
    // Unaffected players keep their frozen assignment.
    const p2 = second.find((r) => r.assetName === 'p2')
    expect(p2.team).toBe(first.find((r) => r.assetName === 'p2').team)
  })

  it('leaves a brand-new leaver (added after the year was already frozen) without a mock pick', () => {
    const first = mergeSimulatedDraftPicks(fresh, undefined)
    const withNewPlayer = [...fresh, { assetName: 'p4', playerName: 'Player Four', position: 'RB', overall: 85, tid: 4, draftRound: '5th Round', round: 5 }]
    const second = mergeSimulatedDraftPicks(withNewPlayer, first)
    const p4 = second.find((r) => r.assetName === 'p4')
    expect(p4.team).toBeUndefined()
  })

  it('handles empty input gracefully', () => {
    expect(mergeSimulatedDraftPicks([], undefined)).toEqual([])
    expect(mergeSimulatedDraftPicks(undefined, undefined)).toEqual([])
  })

  it('generationIndex 0 (the dynasty\'s first-ever generated year) pins round-1 close to REAL_2026_DRAFT_ORDER', () => {
    const round1Fresh = REAL_2026_DRAFT_ORDER.map((_, i) => ({
      assetName: `p${i}`, playerName: `Player ${i}`, position: 'WR', overall: 99 - i, tid: 1, draftRound: '1st Round', round: 1,
    }))
    const result = mergeSimulatedDraftPicks(round1Fresh, undefined, { generationIndex: 0 })
      .sort((a, b) => a.overallPick - b.overallPick)
    const matches = result.filter((r, i) => r.team === REAL_2026_DRAFT_ORDER[i]).length
    expect(matches).toBeGreaterThanOrEqual(26)
  })

  it('drift grows with generationIndex — later generations end up far less like the real order than gen 0', () => {
    const round1Fresh = REAL_2026_DRAFT_ORDER.map((_, i) => ({
      assetName: `p${i}`, playerName: `Player ${i}`, position: 'WR', overall: 99 - i, tid: 1, draftRound: '1st Round', round: 1,
    }))
    const matchCountFor = (generationIndex) => {
      const result = mergeSimulatedDraftPicks(round1Fresh, undefined, { generationIndex })
        .sort((a, b) => a.overallPick - b.overallPick)
      return result.filter((r, i) => r.team === REAL_2026_DRAFT_ORDER[i]).length
    }
    // gen 0 always stays close (guaranteed by the 1-3 swap cap).
    for (let t = 0; t < 3; t++) expect(matchCountFor(0)).toBeGreaterThanOrEqual(26)
    // gen 5+ is a full shuffle every time — average match count over
    // several trials should sit far below gen 0's guaranteed floor.
    const gen5Avg = Array.from({ length: 8 }, () => matchCountFor(5)).reduce((a, b) => a + b, 0) / 8
    expect(gen5Avg).toBeLessThan(15)
  })
})
