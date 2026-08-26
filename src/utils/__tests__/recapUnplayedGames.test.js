import { describe, it, expect } from 'vitest'
import { buildWeekRecapPrompt } from '../recapPrompts'

// Regression test for a real report against a 12-0 dynasty: "it counts that
// 'practice' as a loss in the prompt (note: it is not displaying as a loss in
// the record)".
//
// The record shown in the app and the record shown in the AI write-up prompt
// came from two different functions that disagreed. The app's
// calculateTeamRecordFromGames counts a win only when teamScore >
// opponentScore and a loss only when it's less — so an unplayed 0-0 record is
// neither. recapPrompts' own userPerspective used `userScore > oppScore`
// whenever both were non-null, and an unplayed game is stored 0-0, not
// null-null — so it evaluated to `false`, i.e. a LOSS.

const teams = {
  1: { abbr: 'ALA', name: 'Alabama Crimson Tide' },
  2: { abbr: 'UGA', name: 'Georgia Bulldogs' },
}

// A ranked snapshot has to exist for the records section to render at all,
// and the poll block requires >= 10 rows before it's considered usable.
const rankings = Array.from({ length: 25 }, (_, i) => ({
  rank: i + 1,
  team: i === 0 ? 'ALA' : 'UGA',
  tid: i === 0 ? 1 : 2,
}))

const playedWin = (week) => ({
  year: 2026, week,
  team1Tid: 1, team2Tid: 2,
  team1: 'ALA', team2: 'UGA',
  team1Score: 30, team2Score: 10,
  homeTeamTid: 1,
  isPlayed: true,
  gameType: 'regular',
})

const buildDynasty = (extraGames = []) => ({
  teams,
  currentYear: 2026,
  games: [playedWin(1), playedWin(2), playedWin(3), ...extraGames],
  rankingsByWeek: { 2026: { 1: rankings, 2: rankings, 3: rankings, 4: rankings } },
})

const recordLineFor = (prompt, label) => {
  const line = prompt.split('\n').find(l => l.includes(label) && /:\s*\d+-\d+\s*$/.test(l))
  return line ? line.trim() : null
}

describe('week recap prompt — unplayed games', () => {
  it('does not count an unplayed 0-0 slot as a loss', () => {
    const withPractice = buildDynasty([{
      year: 2026, week: 0,
      team1Tid: 1, team2Tid: null,
      team1: 'ALA', team2: 'Practice',
      team1Score: 0, team2Score: 0,
      homeTeamTid: 1,
      isPlayed: false,
      gameType: 'regular',
    }])

    const prompt = buildWeekRecapPrompt(withPractice, 2026, 3)
    const line = recordLineFor(prompt, 'Alabama Crimson Tide')
    expect(line).toBeTruthy()
    // 3-0, NOT 3-1.
    expect(line).toMatch(/3-0$/)
  })

  it('matches the clean-dynasty record exactly — the unplayed slot changes nothing', () => {
    const clean = buildWeekRecapPrompt(buildDynasty(), 2026, 3)
    const withUnplayed = buildWeekRecapPrompt(buildDynasty([{
      year: 2026, week: 0,
      team1Tid: 1, team2Tid: 2,
      team1: 'ALA', team2: 'UGA',
      team1Score: 0, team2Score: 0,
      homeTeamTid: 1,
      isPlayed: false,
      gameType: 'regular',
    }]), 2026, 3)

    expect(recordLineFor(withUnplayed, 'Alabama Crimson Tide'))
      .toBe(recordLineFor(clean, 'Alabama Crimson Tide'))
  })

  // An unplayed game listed as a real "0, 0" line is worse than omitting it:
  // the AI can't distinguish it from a scoreless tie and writes up a result
  // that never happened.
  it('does not list an unplayed game among the week\'s results', () => {
    const prompt = buildWeekRecapPrompt(buildDynasty([{
      year: 2026, week: 3,
      team1Tid: 1, team2Tid: 2,
      team1: 'ALA', team2: 'UGA',
      team1Score: 0, team2Score: 0,
      homeTeamTid: 1,
      isPlayed: false,
      gameType: 'regular',
    }]), 2026, 3)
    // Game lines read "Alabama Crimson Tide 31 (W), Georgia Bulldogs 3 ...",
    // so an unplayed slot would surface as a 0 immediately after the name.
    expect(prompt).not.toMatch(/Alabama Crimson Tide 0[,\s]/)
    expect(prompt).toMatch(/Alabama Crimson Tide 30 \(W\)/)
  })

  // Legacy records predate the isPlayed field entirely — they must keep
  // counting, or every pre-CFB27 dynasty's recap records would reset to 0-0.
  it('still counts a played game that has no isPlayed field', () => {
    const legacy = {
      teams,
      currentYear: 2026,
      games: [
        { year: 2026, week: 1, team1Tid: 1, team2Tid: 2, team1: 'ALA', team2: 'UGA', team1Score: 21, team2Score: 7, homeTeamTid: 1, gameType: 'regular' },
      ],
      rankingsByWeek: { 2026: { 1: rankings, 2: rankings } },
    }
    const line = recordLineFor(buildWeekRecapPrompt(legacy, 2026, 1), 'Alabama Crimson Tide')
    expect(line).toMatch(/1-0$/)
  })

  // Regression for the regression: the first version of this fix keyed
  // strictly off the isPlayed flag — but schedule seeding creates the USER'S
  // own game records with isPlayed:false, and the user-game score-entry path
  // (unlike the weekly-scores sheet) never flips it. A real report: the
  // user's Stanford game — and only theirs — vanished from the recap and
  // their record read 0-0, while every sheet-entered CPU result listed fine.
  // A game with real scores is played no matter what the flag says.
  it('counts a scored game whose isPlayed flag is still false (user-entered game)', () => {
    const withScoredFlagFalse = buildDynasty([{
      year: 2026, week: 4,
      team1Tid: 1, team2Tid: 2,
      team1: 'ALA', team2: 'UGA',
      team1Score: 24, team2Score: 17,
      homeTeamTid: 1,
      isPlayed: false,
      gameType: 'regular',
    }])
    const prompt = buildWeekRecapPrompt(withScoredFlagFalse, 2026, 4)
    const line = recordLineFor(prompt, 'Alabama Crimson Tide')
    expect(line).toMatch(/4-0$/)
    expect(prompt).toMatch(/Alabama Crimson Tide 24 \(W\)/)
  })

  // A genuine 0-0 final is neither a win nor a loss, matching the app's own
  // calculateTeamRecordFromGames.
  it('counts a real scoreless tie as neither a win nor a loss', () => {
    const tie = buildDynasty([{
      year: 2026, week: 4,
      team1Tid: 1, team2Tid: 2,
      team1: 'ALA', team2: 'UGA',
      team1Score: 0, team2Score: 0,
      homeTeamTid: 1,
      isPlayed: true,
      gameType: 'regular',
    }])
    const line = recordLineFor(buildWeekRecapPrompt(tie, 2026, 4), 'Alabama Crimson Tide')
    expect(line).toMatch(/3-0$/)
  })
})
