import { describe, it, expect } from 'vitest'
import { getRecordAsOfGame, syncGameRanksFromRankByWeek } from '../DynastyContext'

// Regression tests for the postseason record display and the game-rank sync.
//
// Background (real user report): a 12-2 conference champion's game page
// showed "24-4" — getRecordAsOfGame added the FULL as-of-game calculation
// (regular season + postseason) on top of the stored regular-season record,
// double-counting every game both sources knew about. The combine exists for
// CPU teams whose regular season is NOT in dynasty.games; it must never fire
// when the games array already covers the season.

const TID_USER = 42
const TID_OPP = 136

function regularSeasonGames(year, tid, oppTid, { wins, losses }) {
  const games = []
  let week = 1
  for (let i = 0; i < wins; i++) {
    games.push({
      id: `g-${year}-w${week}`, year, week: week++, gameType: 'regular',
      team1Tid: tid, team2Tid: oppTid, team1Score: 28, team2Score: 14,
      isConferenceGame: week <= 9,
    })
  }
  for (let i = 0; i < losses; i++) {
    games.push({
      id: `g-${year}-w${week}`, year, week: week++, gameType: 'regular',
      team1Tid: tid, team2Tid: oppTid, team1Score: 10, team2Score: 24,
      isConferenceGame: true,
    })
  }
  return games
}

const ccGame = (year, tid, oppTid) => ({
  id: `cc-${year}-test`, year, week: 'CCG', gameType: 'conference_championship',
  isConferenceChampionship: true, conference: 'Test',
  team1Tid: tid, team2Tid: oppTid, team1Score: 24, team2Score: 3,
})

const baseTeams = {
  [TID_USER]: { abbr: 'UT', name: 'User Team' },
  [TID_OPP]: { abbr: 'OPP', name: 'Opponent' },
}

describe('getRecordAsOfGame — postseason combine', () => {
  it('does NOT double-count when the games array holds the full season (the 24-4 bug)', () => {
    // 11-2 regular season + CC win = 12-2. A stored record for the same
    // season exists (standings upload, 13 games) — the old code added the
    // two together and displayed 23-4-style nonsense.
    const games = [
      ...regularSeasonGames(2027, TID_USER, TID_OPP, { wins: 11, losses: 2 }),
      ccGame(2027, TID_USER, TID_OPP),
    ]
    const dynasty = {
      games,
      teams: {
        ...baseTeams,
        [TID_USER]: {
          ...baseTeams[TID_USER],
          byYear: { 2027: { record: { wins: 11, losses: 2, confWins: 7, confLosses: 1 } } },
        },
      },
    }
    const rec = getRecordAsOfGame(dynasty, ccGame(2027, TID_USER, TID_OPP), TID_USER)
    expect(rec.overall).toBe('12-2')
  })

  it('still combines for a CPU team whose regular season is only in stored standings', () => {
    // Only the CC game is in dynasty.games; the 11-2 regular season lives
    // in the stored record. The combine is exactly for this case.
    const dynasty = {
      games: [ccGame(2027, TID_USER, TID_OPP)],
      teams: {
        ...baseTeams,
        [TID_USER]: {
          ...baseTeams[TID_USER],
          byYear: { 2027: { record: { wins: 11, losses: 2, confWins: 7, confLosses: 1 } } },
        },
      },
    }
    const rec = getRecordAsOfGame(dynasty, ccGame(2027, TID_USER, TID_OPP), TID_USER)
    expect(rec.overall).toBe('12-2')
    expect(rec.conference).toBe('7-1')
  })

  it('adds only the postseason contribution when games knows SOME regular games', () => {
    // CPU team: 2 of its regular games are in dynasty.games (it played the
    // user), stored standings cover all 13. Old code: 13 + 3 = double-counts
    // the overlap. New code: stored (11-2) + postseason only (1-0) = 12-2.
    const dynasty = {
      games: [
        ...regularSeasonGames(2027, TID_USER, TID_OPP, { wins: 2, losses: 0 }),
        ccGame(2027, TID_USER, TID_OPP),
      ],
      teams: {
        ...baseTeams,
        [TID_USER]: {
          ...baseTeams[TID_USER],
          byYear: { 2027: { record: { wins: 11, losses: 2, confWins: 7, confLosses: 1 } } },
        },
      },
    }
    const rec = getRecordAsOfGame(dynasty, ccGame(2027, TID_USER, TID_OPP), TID_USER)
    expect(rec.overall).toBe('12-2')
  })

  it('regular-season game pages never use stored records', () => {
    const games = regularSeasonGames(2027, TID_USER, TID_OPP, { wins: 3, losses: 1 })
    const dynasty = {
      games,
      teams: {
        ...baseTeams,
        [TID_USER]: {
          ...baseTeams[TID_USER],
          byYear: { 2027: { record: { wins: 12, losses: 1, confWins: 8, confLosses: 0 } } },
        },
      },
    }
    // As of the week-2 game, the record is 2-0 regardless of stored totals.
    const rec = getRecordAsOfGame(dynasty, games[1], TID_USER)
    expect(rec.overall).toBe('2-0')
  })
})

describe('syncGameRanksFromRankByWeek — legacy alias cleanup', () => {
  const weeks = (arr) => ({ 2027: new Set(arr) })

  it('clears stale legacy userRank/opponentRank on unified-format games', () => {
    // The phantom-rank report: stored team1Rank cleared, but the display
    // chain falls back to userRank — which nothing ever cleared.
    const games = [{
      id: 'g1', year: 2027, week: 1,
      team1Tid: TID_USER, team2Tid: TID_OPP,
      team1Rank: null, team2Rank: null,
      userRank: 14, opponentRank: 22,
    }]
    const teams = { [TID_USER]: { byYear: { 2027: { rankByWeek: { 1: 5 } } } } }
    const out = syncGameRanksFromRankByWeek(games, teams, weeks([1]))
    expect(out[0].team1Rank).toBe(5)
    expect(out[0].userRank).toBe(null)
    expect(out[0].opponentRank).toBe(null)
  })

  it('leaves pure-legacy games (no tids) completely alone', () => {
    // A legacy game's ONLY rank lives in userRank — wiping it would
    // destroy real data.
    const games = [{ id: 'g2', year: 2027, week: 1, userTeam: 'UT', opponent: 'OPP', userRank: 9 }]
    const teams = { [TID_USER]: { byYear: { 2027: { rankByWeek: { 1: 5 } } } } }
    const out = syncGameRanksFromRankByWeek(games, teams, weeks([1]))
    expect(out[0].userRank).toBe(9)
  })

  it('does not touch games outside the affected weeks', () => {
    const games = [{
      id: 'g3', year: 2027, week: 9,
      team1Tid: TID_USER, team2Tid: TID_OPP, userRank: 3,
    }]
    const teams = { [TID_USER]: { byYear: { 2027: { rankByWeek: { 1: 5 } } } } }
    const out = syncGameRanksFromRankByWeek(games, teams, weeks([1]))
    expect(out).toBe(games)
  })
})
