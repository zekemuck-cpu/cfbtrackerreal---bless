import { describe, it, expect } from 'vitest'
import { buildDepthChart, gradeForOvr, isPortalRisk } from '../depthChart'
import { OFFENSE_FORMATION } from '../../data/positionGroups'

const mk = (pid, position, ovr, status = 'returning') => ({ key: 'pid:' + pid, pid, name: pid, position, projectedOvr: ovr, status, isIncoming: status === 'incoming', devTrait: 'Normal' })
const slot = (chart, id) => chart.find(s => s.id === id)

describe('gradeForOvr', () => {
  it('maps OVR to a letter and returns F for a hole (null starter)', () => {
    expect(gradeForOvr(91)).toBe('A+')
    expect(gradeForOvr(79)).toBe('B')
    expect(gradeForOvr(null)).toBe('F')
  })
})

describe('buildDepthChart — position-respecting assignment', () => {
  it('keeps single-position players at their slot and orders by OVR', () => {
    const chart = buildDepthChart([mk('qb1', 'QB', 88), mk('qb2', 'QB', 70), mk('c1', 'C', 75)], { formation: OFFENSE_FORMATION })
    const qb = slot(chart, 'QB')
    expect(qb.starter.pid).toBe('qb1')
    expect(qb.backups.map(b => b.pid)).toEqual(['qb2'])
    expect(slot(chart, 'C').starter.pid).toBe('c1')
  })

  it('distributes same-role multi-slot positions (WR1/WR2) by OVR', () => {
    const chart = buildDepthChart([mk('wrA', 'WR', 90), mk('wrB', 'WR', 84), mk('wrC', 'WR', 75), mk('wrD', 'WR', 60)], { formation: OFFENSE_FORMATION })
    expect(slot(chart, 'WR1').starter.pid).toBe('wrA')
    expect(slot(chart, 'WR2').starter.pid).toBe('wrB')
    expect(slot(chart, 'WR1').backups.map(b => b.pid)).toEqual(['wrC'])
    expect(slot(chart, 'WR2').backups.map(b => b.pid)).toEqual(['wrD'])
  })

  it('keeps an exact-coded LT at LT and back-fills the generic OT into the open tackle slot', () => {
    // OT has higher OVR but must NOT displace the LT-coded player off LT.
    const chart = buildDepthChart([mk('lt1', 'LT', 80), mk('ot1', 'OT', 85)], { formation: OFFENSE_FORMATION })
    expect(slot(chart, 'LT').starter.pid).toBe('lt1')   // exact LT owns LT
    expect(slot(chart, 'RT').starter.pid).toBe('ot1')   // generic tackle fills RT
  })

  it('does not let a higher-OVR generic start over an exact-coded player when slots are full', () => {
    // Both tackle slots are taken by exact LT/RT; the generic OT (higher OVR)
    // back-fills onto a tackle slot but must NOT take the starter role there.
    const chart = buildDepthChart([mk('lt1', 'LT', 80), mk('rt1', 'RT', 78), mk('ot1', 'OT', 90)], { formation: OFFENSE_FORMATION })
    const lt = slot(chart, 'LT')
    const rt = slot(chart, 'RT')
    const startsExact = (lt.starter.position === 'LT') && (rt.starter.position === 'RT')
    expect(startsExact).toBe(true)
    // the generic is somewhere as a backup, not a starter
    const allStarters = [lt.starter, rt.starter].map(s => s.pid)
    expect(allStarters).not.toContain('ot1')
  })

  it('routes a generic RB to a back slot (not a hole)', () => {
    const chart = buildDepthChart([mk('rb1', 'RB', 88)], { formation: OFFENSE_FORMATION })
    expect(slot(chart, 'HB').starter.pid).toBe('rb1')
    expect(slot(chart, 'HB').isHole).toBe(false)
  })

  it('flags a hole when no player fills a slot', () => {
    const chart = buildDepthChart([mk('qb1', 'QB', 88)], { formation: OFFENSE_FORMATION })
    const lt = slot(chart, 'LT')
    expect(lt.starter).toBe(null)
    expect(lt.isHole).toBe(true)
    expect(lt.grade).toBe('F')
  })

  it('honors a manual slot override (drag a player to another position)', () => {
    const chart = buildDepthChart([mk('wrHi', 'WR', 90), mk('wrLo', 'WR', 70)], { formation: OFFENSE_FORMATION, slotOf: { wrHi: 'WR2' } })
    expect(slot(chart, 'WR2').starter.pid).toBe('wrHi')  // pinned despite higher OVR
    expect(slot(chart, 'WR1').starter.pid).toBe('wrLo')
  })

  it('honors manual within-slot order (▲▼)', () => {
    const chart = buildDepthChart([mk('qb1', 'QB', 88), mk('qb2', 'QB', 70)], { formation: OFFENSE_FORMATION, order: { QB: ['qb2', 'qb1'] } })
    expect(slot(chart, 'QB').starter.pid).toBe('qb2')
    expect(slot(chart, 'QB').slotPids).toEqual(['qb2', 'qb1'])
  })
})

describe('isPortalRisk', () => {
  it('flags a returning non-senior with very low snaps', () => {
    const p = { statsByYear: { 2035: { snapsPlayed: 40 } } }
    expect(isPortalRisk(p, 2035, 'So')).toBe(true)
    expect(isPortalRisk(p, 2035, 'Sr')).toBe(false)
    expect(isPortalRisk({ statsByYear: { 2035: { snapsPlayed: 600 } } }, 2035, 'So')).toBe(false)
  })
  it('reads the legacy snaps alias', () => {
    expect(isPortalRisk({ statsByYear: { 2035: { snaps: 30 } } }, 2035, 'Jr')).toBe(true)
  })
})
