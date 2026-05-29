import { describe, it, expect } from 'vitest'
import { buildDepthChart, gradeForOvr, isPortalRisk } from '../depthChart'
import { OFFENSE_FORMATION } from '../../data/positionGroups'

const mk = (pid, position, ovr, status = 'returning') => ({ key: 'pid:' + pid, pid, name: pid, position, projectedOvr: ovr, status, isIncoming: status === 'incoming', devTrait: 'Normal' })

describe('gradeForOvr', () => {
  it('maps OVR to a letter and returns F for a hole (null starter)', () => {
    expect(gradeForOvr(91)).toBe('A+')
    expect(gradeForOvr(79)).toBe('B')
    expect(gradeForOvr(null)).toBe('F')
  })
})

describe('buildDepthChart', () => {
  it('orders each slot by OVR desc, splits multi-slot positions round-robin', () => {
    const projected = [
      mk('qb1', 'QB', 88), mk('qb2', 'QB', 70),
      mk('wrA', 'WR', 90), mk('wrB', 'WR', 84), mk('wrC', 'WR', 75), mk('wrD', 'WR', 60),
    ]
    const chart = buildDepthChart(projected, { formation: OFFENSE_FORMATION, manualOrder: {} })
    const qb = chart.find(s => s.id === 'QB')
    expect(qb.starter.pid).toBe('qb1')
    expect(qb.backups.map(b => b.pid)).toEqual(['qb2'])
    const wr1 = chart.find(s => s.id === 'WR1')
    const wr2 = chart.find(s => s.id === 'WR2')
    expect(wr1.starter.pid).toBe('wrA')
    expect(wr2.starter.pid).toBe('wrB')
    expect(wr1.backups.map(b => b.pid)).toEqual(['wrC'])
    expect(wr2.backups.map(b => b.pid)).toEqual(['wrD'])
  })

  it('flags a hole when no player fills a slot', () => {
    const chart = buildDepthChart([mk('qb1', 'QB', 88)], { formation: OFFENSE_FORMATION, manualOrder: {} })
    const lt = chart.find(s => s.id === 'LT')
    expect(lt.starter).toBe(null)
    expect(lt.isHole).toBe(true)
    expect(lt.grade).toBe('F')
  })

  it('respects manual order before OVR', () => {
    const projected = [mk('qb1', 'QB', 88), mk('qb2', 'QB', 70)]
    const chart = buildDepthChart(projected, { formation: OFFENSE_FORMATION, manualOrder: { QB: ['qb2', 'qb1'] } })
    expect(chart.find(s => s.id === 'QB').starter.pid).toBe('qb2')
  })
})

describe('isPortalRisk', () => {
  it('flags a returning non-senior with very low snaps', () => {
    const p = { statsByYear: { 2035: { snapsPlayed: 40 } } }
    expect(isPortalRisk(p, 2035, 'So')).toBe(true)
    expect(isPortalRisk(p, 2035, 'Sr')).toBe(false)
    expect(isPortalRisk({ statsByYear: { 2035: { snapsPlayed: 600 } } }, 2035, 'So')).toBe(false)
  })
})
