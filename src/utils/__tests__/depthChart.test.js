import { describe, it, expect } from 'vitest'
import { gradeForOvr, isPortalRisk } from '../depthChart'

describe('gradeForOvr', () => {
  it('maps OVR to a letter and returns F for a hole (null starter)', () => {
    expect(gradeForOvr(91)).toBe('A+')
    expect(gradeForOvr(79)).toBe('B')
    expect(gradeForOvr(null)).toBe('F')
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
