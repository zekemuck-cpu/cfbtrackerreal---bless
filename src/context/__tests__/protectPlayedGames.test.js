import { describe, it, expect } from 'vitest'
import { computeScheduleDiff } from '../DynastyContext'

// Sync from Save applies its schedule diff with no user confirmation. When
// the save's schedule for a week didn't line up on a later sync, an
// already-played game could be reassigned to a different opponent or deleted
// outright, taking the aiRecap / scoreGraphic / preview stored on that game
// record with it.
//
// The fix is opt-in on purpose. The manual Schedule Entry flow feeds
// `playedAffected` to ScheduleSaveConfirmModal, which warns "N played games
// will lose data" and relabels the button "Delete N games and save" — the
// user sees the cost and chooses. Forcing the guard on everywhere would both
// block a legitimate correction (fixing the wrong opponent on a week already
// scored) and silently empty the warning that makes the choice visible.

const USER_TID = 10
const OPP_A = 20
const OPP_B = 30

const dynastyWith = (games) => ({
  currentYear: 2026,
  currentTid: USER_TID,
  teams: {
    [USER_TID]: { tid: USER_TID, abbr: 'USR', name: 'User Team' },
    [OPP_A]: { tid: OPP_A, abbr: 'AAA', name: 'Aaa Team' },
    [OPP_B]: { tid: OPP_B, abbr: 'BBB', name: 'Bbb Team' },
  },
  games,
})

const game = (over = {}) => ({
  id: 'g-w5',
  year: 2026,
  week: 5,
  team1Tid: USER_TID,
  team2Tid: OPP_A,
  homeTeamTid: USER_TID,
  ...over,
})

const played = (over = {}) => game({ isPlayed: true, team1Score: 31, team2Score: 17, ...over })
const week5Against = (abbr) => [{ week: 5, opponent: abbr, location: 'home' }]

describe('computeScheduleDiff protectPlayed', () => {
  it('reassigns a played game to a new opponent by default', () => {
    const d = dynastyWith([played()])
    const diff = computeScheduleDiff(d, week5Against('BBB'), USER_TID, 2026)
    expect(diff.toUpdate).toHaveLength(1)
    expect(diff.toUpdate[0].patch.opponentTid).toBe(OPP_B)
  })

  it('leaves a played game alone when protectPlayed is set', () => {
    const d = dynastyWith([played()])
    const diff = computeScheduleDiff(d, week5Against('BBB'), USER_TID, 2026, { protectPlayed: true })
    expect(diff.toUpdate).toHaveLength(0)
    expect(diff.toKeep.some(k => k.week === 5)).toBe(true)
    // The kept entry must still describe the game as it actually stands,
    // not as the save wanted it — otherwise the denormalized schedule copy
    // written from updatedSchedule would disagree with the game record.
    const entry = diff.updatedSchedule.find(e => e.week === 5)
    expect(entry.opponentTid).toBe(OPP_A)
    expect(entry.gameId).toBe('g-w5')
  })

  it('removes a played game whose week vanished, by default', () => {
    const d = dynastyWith([played()])
    const diff = computeScheduleDiff(d, [], USER_TID, 2026)
    expect(diff.toRemove.map(r => r.week)).toContain(5)
  })

  it('never removes a played game under protectPlayed', () => {
    const d = dynastyWith([played()])
    const diff = computeScheduleDiff(d, [], USER_TID, 2026, { protectPlayed: true })
    expect(diff.toRemove).toHaveLength(0)
  })

  it('protects a game carrying a box score even if isPlayed was never set', () => {
    // playedAffected already counts a box score as real entered data; the
    // guard has to agree, or a synced game whose isPlayed flag never flipped
    // still gets its box score deleted.
    const d = dynastyWith([game({ boxScore: { passing: [{ pid: 1, yds: 300 }] } })])
    const diff = computeScheduleDiff(d, [], USER_TID, 2026, { protectPlayed: true })
    expect(diff.toRemove).toHaveLength(0)
  })

  it('still adds, updates and removes UNPLAYED games under protectPlayed', () => {
    const d = dynastyWith([game({ id: 'g-w5' })])
    const diff = computeScheduleDiff(
      d,
      [{ week: 5, opponent: 'BBB', location: 'home' }, { week: 6, opponent: 'AAA', location: 'away' }],
      USER_TID,
      2026,
      { protectPlayed: true },
    )
    expect(diff.toUpdate).toHaveLength(1)
    expect(diff.toUpdate[0].week).toBe(5)
    expect(diff.toAdd.map(a => a.week)).toEqual([6])
  })

  it('keeps populating playedAffected for the confirm modal when unguarded', () => {
    const d = dynastyWith([played()])
    const diff = computeScheduleDiff(d, [], USER_TID, 2026)
    expect(diff.playedAffected).toHaveLength(1)
    expect(diff.playedAffected[0].isPlayed).toBe(true)
  })
})
