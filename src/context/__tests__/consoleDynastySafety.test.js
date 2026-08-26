import { describe, it, expect } from 'vitest'
import {
  processBoxScoreSave,
  recalculateStatsFromBoxScores,
  getTeamRanking,
  migrateFCSFiveTeams,
} from '../DynastyContext'
import { isPcAutoDynasty } from '../../editions'

// The PC-integration merge changed a number of code paths that are NOT behind
// an isPcAutoDynasty gate — they run for every dynasty, including the manually
// tracked console dynasties that make up essentially the entire existing user
// base. These tests pin the behavior of those specific un-gated paths against
// console-shaped data (no `platform`, no save-synced fields, box scores entered
// by hand) so a later change can't quietly regress them.
//
// The gate itself is covered separately in src/editions/__tests__.

// A console dynasty as it actually exists today: cfb27 by default edition,
// no `platform` field, nothing the save sync would have written.
const consoleDynasty = (over = {}) => ({
  id: 'd1',
  gameEdition: 'cfb27',
  currentYear: 2026,
  currentWeek: 3,
  currentPhase: 'regular_season',
  teams: {},
  players: [],
  games: [],
  ...over,
})

describe('console dynasty — the edition gate', () => {
  it('is not a PC dynasty, so every PC-only surface stays hidden', () => {
    expect(isPcAutoDynasty(consoleDynasty())).toBe(false)
  })
})

describe('console dynasty — manually entered box scores still credit stats', () => {
  const box = {
    byTid: {
      10: {
        passing: [{ playerName: 'Jack Moran', comp: 18, attempts: 25, yards: 240, tD: 2, iNT: 0, long: 0, sacks: 0 }],
      },
    },
  }

  it('processBoxScoreSave attributes a hand-entered line to the right player', () => {
    const players = [{ pid: 1, name: 'Jack Moran', position: 'QB', teamsByYear: { 2026: 10 } }]
    const { updatedPlayers, statsContributed } = processBoxScoreSave(players, box, null, 2026)
    expect(updatedPlayers[0].statsByYear[2026].passing.yds).toBe(240)
    // statsContributed stays name-keyed — every previously saved game stored it
    // in that shape and the edit path reverses against it.
    expect(Object.keys(statsContributed)).toContain('jack moran')
  })

  it('recalculateStatsFromBoxScores credits a player with NO tracked team', () => {
    // Extremely common in a hand-tracked dynasty: the user enters a box score
    // before ever recording which team the player is on.
    const players = [{ pid: 1, name: 'Jack Moran', position: 'QB' }]
    const games = [{ id: 'g1', year: 2026, team1Tid: 10, team2Tid: 20, homeTeamTid: 10, boxScore: box }]
    const out = recalculateStatsFromBoxScores(players, games, 2026)
    expect(out[0].statsByYear[2026].passing.yds).toBe(240)
  })

  it('does not wipe stats for a roster of ordinary, non-colliding players', () => {
    // Guards the composite-index fallback: a strict tid-only lookup would miss
    // and the caller CLEARS every box-score category on a miss.
    const players = [
      { pid: 1, name: 'Jack Moran', position: 'QB', teamsByYear: { 2026: 10 } },
      { pid: 2, name: 'Sam Reed', position: 'RB', teamsByYear: { 2026: 10 } },
    ]
    const games = [{ id: 'g1', year: 2026, team1Tid: 10, team2Tid: 20, homeTeamTid: 10, boxScore: box }]
    const out = recalculateStatsFromBoxScores(players, games, 2026)
    expect(out[0].statsByYear[2026].passing.yds).toBe(240)
    // Sam didn't appear in the box score — he must be left alone, not cleared
    // into a materialized empty stat line.
    expect(out[1].statsByYear?.[2026]?.passing).toBeUndefined()
  })

  // Real incident: a console dynasty whose season stats were entered through
  // the Season Stats sheet (statsByYear written directly, no game boxScore
  // behind them) lost the whole roster's stats when revertWeek triggered a
  // resync. The clearing branch assumed every stat in a box-score category
  // was box-score-derived and "healed" the sheet data away.
  it('a resync with ZERO box-scored games changes nothing at all', () => {
    const players = [{
      pid: 1, name: 'Jack Moran', position: 'QB', teamsByYear: { 2026: 10 },
      statsByYear: { 2026: { passing: { yds: 3200, tds: 28 }, gamesPlayed: 12 } },
    }]
    const games = [
      { id: 'g1', year: 2026, team1Tid: 10, team2Tid: 20, homeTeamTid: 10, team1Score: 31, team2Score: 10 },
    ]
    const out = recalculateStatsFromBoxScores(players, games, 2026, { skipGamesPlayed: false })
    expect(out[0].statsByYear[2026].passing.yds).toBe(3200)
    expect(out[0].statsByYear[2026].gamesPlayed).toBe(12)
  })

  it('sheet-entered stats survive when only OTHER teams have box scores', () => {
    // One CPU game somewhere in the league has a box score; the user's own
    // team (tid 30) never appears in any box-scored game. Their sheet-entered
    // stats cannot be residue of those box scores and must be left alone.
    const players = [{
      pid: 1, name: 'Rice Quarterback', position: 'QB', teamsByYear: { 2026: 30 },
      statsByYear: { 2026: { passing: { yds: 2900, tds: 24 }, gamesPlayed: 11 } },
    }]
    const games = [
      { id: 'g1', year: 2026, team1Tid: 10, team2Tid: 20, homeTeamTid: 10, boxScore: box },
    ]
    const out = recalculateStatsFromBoxScores(players, games, 2026, { skipGamesPlayed: false })
    expect(out[0].statsByYear[2026].passing.yds).toBe(2900)
    expect(out[0].statsByYear[2026].gamesPlayed).toBe(11)
  })

  it('still clears stale residue for a player whose team IS in a box-scored game', () => {
    // The healing the clearing branch exists for must keep working: tid 10
    // participates in the box-scored game, this player has box-score-shaped
    // stats, but the current box score no longer credits them.
    const players = [{
      pid: 9, name: 'Ghost Player', position: 'WR', teamsByYear: { 2026: 10 },
      statsByYear: { 2026: { receiving: { yds: 500 }, gamesPlayed: 4 } },
    }]
    const games = [{ id: 'g1', year: 2026, team1Tid: 10, team2Tid: 20, homeTeamTid: 10, boxScore: box }]
    const out = recalculateStatsFromBoxScores(players, games, 2026, { skipGamesPlayed: false })
    expect(out[0].statsByYear[2026].receiving).toBeUndefined()
    expect(out[0].statsByYear[2026].gamesPlayed).toBe(0)
  })
})

describe('console dynasty — rankings read the same with no CFP poll present', () => {
  // getTeamRanking now merges cfpRankByWeek over rankByWeek from week 10+.
  // cfpRankByWeek is only ever written by the save sync, so a console dynasty
  // has none and must resolve exactly as it did before the merge.
  const withRanks = (rankByWeek, extra = {}) => consoleDynasty({
    currentWeek: 5,
    teams: { 10: { tid: 10, abbr: 'TEST', name: 'Test', byYear: { 2026: { rankByWeek, ...extra } } } },
  })

  it('returns the media-poll rank when only rankByWeek exists', () => {
    // Returns a { rank, ... } record, not a bare number.
    expect(getTeamRanking(withRanks({ 0: 12, 3: 8, 5: 6 }), 10, 2026)?.rank).toBe(6)
  })

  it('ignores out-of-range and non-numeric entries rather than returning them', () => {
    const r = getTeamRanking(withRanks({ 0: 12, 3: 8, 5: 99, bogus: 4 }), 10, 2026)
    // 99 and 'bogus' must never surface as a rank; it falls back to the last
    // legitimate week (3 -> 8) or reports nothing.
    expect(r?.rank == null || (r.rank >= 1 && r.rank <= 25)).toBe(true)
    expect(r?.rank).not.toBe(99)
  })

  it('returns null for a team with no ranking data at all', () => {
    expect(getTeamRanking(consoleDynasty({ teams: { 10: { tid: 10, abbr: 'TEST' } } }), 10, 2026)).toBeNull()
  })
})

describe('console dynasty — the FCS logo migration stays in its lane', () => {
  it('never touches a non-FCS team', () => {
    const d = consoleDynasty({
      _fcs5TeamsMigrated: true,
      teams: {
        10: { tid: 10, abbr: 'BAMA', name: 'Alabama', logo: 'https://example.com/mine.png' },
      },
    })
    const out = migrateFCSFiveTeams(d)
    expect(out.teams[10].logo).toBe('https://example.com/mine.png')
  })

  it('returns the SAME object when there is nothing to correct (no churn)', () => {
    const d = consoleDynasty({ _fcs5TeamsMigrated: true, teams: { 10: { tid: 10, abbr: 'BAMA' } } })
    expect(migrateFCSFiveTeams(d)).toBe(d)
  })

  it('leaves a user-customized FCS logo alone', () => {
    const d = consoleDynasty({
      _fcs5TeamsMigrated: true,
      teams: { 137: { tid: 137, abbr: 'FCSE', name: 'My Custom FCS', logo: 'https://example.com/custom.png' } },
    })
    expect(migrateFCSFiveTeams(d).teams[137].logo).toBe('https://example.com/custom.png')
  })
})
