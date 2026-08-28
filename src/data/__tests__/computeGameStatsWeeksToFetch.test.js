import { describe, it, expect } from 'vitest'
import { computeGameStatsWeeksToFetch } from '../../../api/_lib/cfb27Extract/extractPlayers.cjs'

// Real save file testing (see the sync-performance work this accompanies)
// confirmed the safety gates correctly disable this optimization once a
// season has reached bowls/CFP, but couldn't exercise the "actually skips
// old weeks" path — that save had already finished its whole season.
// These synthetic mid-season scenarios cover exactly that path instead.

function regularSeasonGames(weeks) {
  return weeks.map((week) => ({ week, weekType: 'RegularSeason' }))
}

describe('computeGameStatsWeeksToFetch', () => {
  it('mid regular season, matching year/week: only fetches weeks after the already-synced one', () => {
    const games = regularSeasonGames([1, 2, 3, 4, 5, 6, 7, 8])
    const playedWeeks = [1, 2, 3, 4, 5, 6, 7, 8]
    const season = { year: 2029, conferenceChampionshipWeek: 15 }
    const opts = { alreadySyncedYear: 2029, alreadySyncedThroughWeek: 7 }
    expect(computeGameStatsWeeksToFetch(games, playedWeeks, season, opts)).toEqual([8])
  })

  it('first sync of the season (no opts): fetches every played week', () => {
    const games = regularSeasonGames([1, 2, 3])
    const playedWeeks = [1, 2, 3]
    const season = { year: 2029, conferenceChampionshipWeek: 15 }
    expect(computeGameStatsWeeksToFetch(games, playedWeeks, season, {})).toEqual([1, 2, 3])
  })

  it('year changed since last sync: falls back to fetching every played week', () => {
    const games = regularSeasonGames([1, 2, 3])
    const playedWeeks = [1, 2, 3]
    const season = { year: 2030, conferenceChampionshipWeek: 15 }
    const opts = { alreadySyncedYear: 2029, alreadySyncedThroughWeek: 15 }
    expect(computeGameStatsWeeksToFetch(games, playedWeeks, season, opts)).toEqual([1, 2, 3])
  })

  it('conference championship already played: disables the optimization entirely', () => {
    const games = [...regularSeasonGames([1, 2, 3, 4, 5]), { week: 15, weekType: 'RegularSeason' }]
    const playedWeeks = [1, 2, 3, 4, 5, 15]
    const season = { year: 2029, conferenceChampionshipWeek: 15 }
    const opts = { alreadySyncedYear: 2029, alreadySyncedThroughWeek: 5 }
    expect(computeGameStatsWeeksToFetch(games, playedWeeks, season, opts)).toEqual(playedWeeks)
  })

  it('any non-regular-season game present (bowl/CFP): disables the optimization entirely', () => {
    const games = [...regularSeasonGames([1, 2, 3]), { week: 17, weekType: 'Bowl' }]
    const playedWeeks = [1, 2, 3, 17]
    const season = { year: 2029, conferenceChampionshipWeek: 15 }
    const opts = { alreadySyncedYear: 2029, alreadySyncedThroughWeek: 3 }
    expect(computeGameStatsWeeksToFetch(games, playedWeeks, season, opts)).toEqual(playedWeeks)
  })

  it('already synced through the latest played week: returns an empty list (nothing new)', () => {
    const games = regularSeasonGames([1, 2, 3])
    const playedWeeks = [1, 2, 3]
    const season = { year: 2029, conferenceChampionshipWeek: 15 }
    const opts = { alreadySyncedYear: 2029, alreadySyncedThroughWeek: 3 }
    expect(computeGameStatsWeeksToFetch(games, playedWeeks, season, opts)).toEqual([])
  })

  it('missing/invalid opts.alreadySyncedThroughWeek: falls back to fetching every played week', () => {
    const games = regularSeasonGames([1, 2, 3])
    const playedWeeks = [1, 2, 3]
    const season = { year: 2029, conferenceChampionshipWeek: 15 }
    const opts = { alreadySyncedYear: 2029 } // no alreadySyncedThroughWeek
    expect(computeGameStatsWeeksToFetch(games, playedWeeks, season, opts)).toEqual([1, 2, 3])
  })

  it('missing season info: falls back to fetching every played week', () => {
    const games = regularSeasonGames([1, 2, 3])
    const playedWeeks = [1, 2, 3]
    const opts = { alreadySyncedYear: 2029, alreadySyncedThroughWeek: 2 }
    expect(computeGameStatsWeeksToFetch(games, playedWeeks, null, opts)).toEqual([1, 2, 3])
  })
})
