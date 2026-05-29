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
  it('orders each slot by OVR desc, splits multi-slot positions across slots', () => {
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

  it('respects manual order before OVR (keyed by group)', () => {
    const projected = [mk('qb1', 'QB', 88), mk('qb2', 'QB', 70)]
    const chart = buildDepthChart(projected, { formation: OFFENSE_FORMATION, manualOrder: { QB: ['qb2', 'qb1'] } })
    expect(chart.find(s => s.id === 'QB').starter.pid).toBe('qb2')
  })
})

describe('buildDepthChart — group bucketing (generic position codes)', () => {
  it('places generically-coded OL players (OT/OG) into OL slots — none vanish', () => {
    const chart = buildDepthChart([mk('ot1', 'OT', 80), mk('og1', 'OG', 76)], { formation: OFFENSE_FORMATION, manualOrder: {} })
    const olSlots = chart.filter(s => s.group === 'OL')
    const filled = olSlots.filter(s => s.starter)
    expect(filled.map(s => s.starter.pid).sort()).toEqual(['og1', 'ot1'])
    expect(olSlots[0].starter.pid).toBe('ot1') // highest-OVR OL takes the first OL slot
  })

  it('places a generic RB into the HB slot (not a hole)', () => {
    const chart = buildDepthChart([mk('rb1', 'RB', 88)], { formation: OFFENSE_FORMATION, manualOrder: {} })
    const hb = chart.find(s => s.id === 'HB')
    expect(hb.starter.pid).toBe('rb1')
    expect(hb.isHole).toBe(false)
  })

  it('exposes the ordered groupPool on each slot for reordering', () => {
    const chart = buildDepthChart([mk('wrA', 'WR', 90), mk('wrB', 'WR', 84)], { formation: OFFENSE_FORMATION, manualOrder: {} })
    expect(chart.find(s => s.id === 'WR1').groupPool).toEqual(['wrA', 'wrB'])
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
