import { describe, it, expect } from 'vitest'
import { processBoxScoreSave, recalculateStatsFromBoxScores } from '../../context/DynastyContext'
import { normalizePlayerName } from '../playerMatching'

// Build a minimal byTid box score for one team's passing line.
function passingBox(tid, playerName, line) {
  return {
    byTid: {
      [tid]: {
        passing: [{
          playerName,
          comp: line.comp ?? 0,
          attempts: line.attempts ?? 0,
          yards: line.yards ?? 0,
          tD: line.tD ?? 0,
          iNT: 0,
          long: 0,
          sacks: 0,
        }],
      },
    },
  }
}

describe('normalizePlayerName suffix/punctuation handling', () => {
  it('treats "Jr." and "Jr" as the same player', () => {
    expect(normalizePlayerName('John Smith Jr.')).toBe(normalizePlayerName('John Smith Jr'))
  })
  it('treats "Smith, Jr" like "Smith Jr"', () => {
    expect(normalizePlayerName('John Smith, Jr')).toBe(normalizePlayerName('John Smith Jr'))
  })
  it('treats "A.J." like "AJ"', () => {
    expect(normalizePlayerName('A.J. Brown')).toBe(normalizePlayerName('AJ Brown'))
  })
})

describe('box score attribution is scoped to the game\'s teams', () => {
  it('does not copy a stat line onto a same-named player on another team', () => {
    const players = [
      { pid: 'a', name: 'Jack Moran', position: 'QB', teamsByYear: { 2026: 10 } }, // played
      { pid: 'b', name: 'Jack Moran', position: 'DT', teamsByYear: { 2024: 20 } }, // not on a 2026 team
    ]
    const box = passingBox(10, 'Jack Moran', { comp: 9, attempts: 15, yards: 94, tD: 1 })

    const { updatedPlayers } = processBoxScoreSave(players, box, null, 2026)

    // The QB who actually played gets the passing line.
    expect(updatedPlayers[0].statsByYear[2026].passing.cmp).toBe(9)
    expect(updatedPlayers[0].statsByYear[2026].passing.yds).toBe(94)
    // The same-named DT on an unrelated team is left completely untouched.
    expect(updatedPlayers[1].statsByYear).toBeUndefined()
    expect(updatedPlayers[1]).toBe(players[1]) // same reference — no phantom write
  })

  it('reverses a previously mis-attributed line on the off-team player when the game is re-saved', () => {
    // p2 carries a phantom passing line from an earlier buggy (name-only) save.
    const players = [
      { pid: 'a', name: 'Jack Moran', position: 'QB', teamsByYear: { 2026: 10 },
        statsByYear: { 2026: { gamesPlayed: 1, passing: { cmp: 9, att: 15, yds: 94, td: 1 } } } },
      { pid: 'b', name: 'Jack Moran', position: 'DT', teamsByYear: { 2024: 20 },
        statsByYear: { 2026: { gamesPlayed: 1, passing: { cmp: 9, att: 15, yds: 94, td: 1 } } } },
    ]
    const box = passingBox(10, 'Jack Moran', { comp: 9, attempts: 15, yards: 94, tD: 1 })
    const oldContribution = { 'jack moran': { _hadStats: true, passing: { cmp: 9, att: 15, yds: 94, td: 1 } } }

    const { updatedPlayers } = processBoxScoreSave(players, box, oldContribution, 2026, [
      { id: 'g1', year: 2026, boxScore: box },
    ])

    // On-team QB stays correct (delta new - old = 0).
    expect(updatedPlayers[0].statsByYear[2026].passing.cmp).toBe(9)
    // Off-team DT's phantom line is subtracted back out.
    expect(updatedPlayers[1].statsByYear[2026].passing.cmp).toBe(0)
    expect(updatedPlayers[1].statsByYear[2026].gamesPlayed).toBe(0)
  })

  it('attaches stats when roster suffix has a period but the box score does not', () => {
    const players = [
      { pid: 'c', name: 'John Smith Jr.', position: 'RB', teamsByYear: { 2026: 10 } },
    ]
    const box = {
      byTid: {
        10: { rushing: [{ playerName: 'John Smith Jr', carries: 12, yards: 88, tD: 1, long: 0, fumbles: 0 }] },
      },
    }
    const { updatedPlayers } = processBoxScoreSave(players, box, null, 2026)
    expect(updatedPlayers[0].statsByYear[2026].rushing.car).toBe(12)
    expect(updatedPlayers[0].statsByYear[2026].rushing.yds).toBe(88)
  })
})

// The full-recalc path indexes contributions TWO ways: byComposite
// ("<tid>::<name>", precise) and byName (the legacy index). It reads composite
// first, then falls back to byName. The fallback is load-bearing: on a miss the
// function CLEARS every box-score category for that player, so a strict
// composite-only lookup would silently wipe season stats for the box-score
// shapes a long-running manually-tracked dynasty is full of.
describe('recalculateStatsFromBoxScores — composite index with name fallback', () => {
  it('credits the exact (tid, name) player and no one else on a collision', () => {
    const players = [
      { pid: 'a', name: 'Keenan Jackson', position: 'QB', teamsByYear: { 2026: 10 } }, // played
      { pid: 'b', name: 'Keenan Jackson', position: 'DT', teamsByYear: { 2026: 55 } }, // didn't
    ]
    const games = [{ id: 'g1', year: 2026, team1Tid: 10, team2Tid: 20, homeTeamTid: 10,
      boxScore: passingBox(10, 'Keenan Jackson', { comp: 20, attempts: 30, yards: 275, tD: 3 }) }]

    const out = recalculateStatsFromBoxScores(players, games, 2026)
    expect(out[0].statsByYear[2026].passing.yds).toBe(275)
    expect(out[1].statsByYear?.[2026]?.passing).toBeUndefined()
  })

  it('keeps stats for a LEGACY home/away box score, which carries no byTid at all', () => {
    // The console-dynasty regression guard. No byTid → tids are derived from
    // the game; if that derivation ever fails, byComposite is empty and only
    // the name fallback saves this player's season.
    const players = [{ pid: 'a', name: 'Jack Moran', position: 'QB', teamsByYear: { 2026: 10 } }]
    const games = [{
      id: 'g1', year: 2026, team1Tid: 10, team2Tid: 20, homeTeamTid: 10,
      boxScore: {
        home: { passing: [{ playerName: 'Jack Moran', comp: 18, attempts: 25, yards: 240, tD: 2, iNT: 0, long: 0, sacks: 0 }] },
      },
    }]

    const out = recalculateStatsFromBoxScores(players, games, 2026)
    expect(out[0].statsByYear[2026].passing.yds).toBe(240)
    expect(out[0].statsByYear[2026].gamesPlayed).toBe(1)
  })

  it('keeps stats when the player has NO tracked team for the year', () => {
    const players = [{ pid: 'a', name: 'Jack Moran', position: 'QB' }] // no teamsByYear
    const games = [{ id: 'g1', year: 2026, team1Tid: 10, team2Tid: 20, homeTeamTid: 10,
      boxScore: passingBox(10, 'Jack Moran', { comp: 18, attempts: 25, yards: 240, tD: 2 }) }]

    const out = recalculateStatsFromBoxScores(players, games, 2026)
    expect(out[0].statsByYear[2026].passing.yds).toBe(240)
  })

  it('keeps stats when the player changed teams after the game was played', () => {
    // Box score credits tid 10; teamsByYear now says 42. Composite misses —
    // without the fallback this player's whole season would blank out.
    const players = [{ pid: 'a', name: 'Jack Moran', position: 'QB', teamsByYear: { 2026: 42 } }]
    const games = [{ id: 'g1', year: 2026, team1Tid: 10, team2Tid: 20, homeTeamTid: 10,
      boxScore: passingBox(10, 'Jack Moran', { comp: 18, attempts: 25, yards: 240, tD: 2 }) }]

    const out = recalculateStatsFromBoxScores(players, games, 2026)
    expect(out[0].statsByYear[2026].passing.yds).toBe(240)
  })
})
