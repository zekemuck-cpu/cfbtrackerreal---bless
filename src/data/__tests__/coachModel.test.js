import { describe, it, expect } from 'vitest'
import { synthOwnerCoachFromCoachTeamByYear } from '../coachModel'
import { getEarnedTrophies } from '../../utils/trophyEngine'

// Regression guard for the "Trophy Room comes up blank after winning a bowl"
// bug (Delaware save, 2026-07-05). Root cause: a coaching-carousel dynasty where
// every coach entity had controlledBy:null, so the owner had NO selectable coach
// and their coachingHistory was empty — even though coachTeamByYear correctly
// recorded they coached tid 26 both seasons and the bowl game was a clean
// tid-based win. The fix synthesizes the owner's coach from coachTeamByYear.

describe('synthOwnerCoachFromCoachTeamByYear', () => {
  const dynasty = {
    userId: 'U1',
    coachTeamByYear: {
      2026: { tid: 26, team: 'DEL', position: 'HC' },
      2027: { tid: 26, team: 'DEL', position: 'HC' },
    },
    memberLabels: { U1: 'Coach Flacco' },
  }

  it('builds the owner coach byYear from coachTeamByYear (strictly tid-based)', () => {
    const c = synthOwnerCoachFromCoachTeamByYear(dynasty)
    expect(c).toBeTruthy()
    expect(c.controlledBy).toBe('U1')
    expect(c.byYear['2026'].teamTid).toBe(26)
    expect(c.byYear['2027'].teamTid).toBe(26)
    expect(c.name).toBe('Coach Flacco')
    expect(c._synthesized).toBe(true)
  })

  it('tolerates numeric / teamTid entry shapes', () => {
    const c = synthOwnerCoachFromCoachTeamByYear({ userId: 'U', coachTeamByYear: { 2030: 42, 2031: { teamTid: 7 } } })
    expect(c.byYear['2030'].teamTid).toBe(42)
    expect(c.byYear['2031'].teamTid).toBe(7)
  })

  it('returns null when there is no owner or no usable coachTeamByYear', () => {
    expect(synthOwnerCoachFromCoachTeamByYear(null)).toBeNull()
    expect(synthOwnerCoachFromCoachTeamByYear({ userId: 'U1' })).toBeNull()
    expect(synthOwnerCoachFromCoachTeamByYear({ coachTeamByYear: { 2026: { tid: 26 } } })).toBeNull() // no userId
    expect(synthOwnerCoachFromCoachTeamByYear({ userId: 'U1', coachTeamByYear: { 2026: { team: 'DEL' } } })).toBeNull() // no tid
  })

  it('end-to-end: the synthesized owner coach yields the completed-season bowl trophy', () => {
    const c = synthOwnerCoachFromCoachTeamByYear(dynasty)
    const tid = c.byYear['2026'].teamTid
    // The exact Delaware game: a clean tid-based Boca Raton Bowl win in 2026.
    const bowl = {
      year: 2026, gameType: 'bowl', isBowlGame: true, bowlName: 'Boca Raton Bowl',
      team1Tid: tid, team2Tid: 44, team1Score: 21, team2Score: 7, winnerTid: tid,
    }
    const stints = [{ teamTid: tid, startYear: 2026, endYear: 2027, games: [bowl] }]
    const earned = getEarnedTrophies({ ...dynasty, teams: {} }, stints)
    expect(earned['boca-raton-bowl']).toBeTruthy()
    expect(earned['boca-raton-bowl'][0].year).toBe(2026)
  })
})
