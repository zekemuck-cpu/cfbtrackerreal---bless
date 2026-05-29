import { describe, it, expect } from 'vitest'
import { groupForPosition, OFFENSE_FORMATION, DEFENSE_FORMATION, ST_FORMATION } from '../../data/positionGroups'

describe('groupForPosition', () => {
  it('maps OL positions to OL', () => {
    for (const p of ['LT', 'LG', 'C', 'RG', 'RT']) expect(groupForPosition(p)).toBe('OL')
  })
  it('maps edge/interior DL to DL', () => {
    for (const p of ['LEDG', 'REDG', 'DT', 'DE', 'NT']) expect(groupForPosition(p)).toBe('DL')
  })
  it('maps linebackers to LB and dbs to DB', () => {
    expect(groupForPosition('MIKE')).toBe('LB')
    expect(groupForPosition('CB')).toBe('DB')
    expect(groupForPosition('FS')).toBe('DB')
  })
  it('returns null for unknown', () => {
    expect(groupForPosition('XYZ')).toBe(null)
  })
})

describe('formations', () => {
  it('offense has the OL + skill slots', () => {
    const ids = OFFENSE_FORMATION.map(s => s.id)
    expect(ids).toEqual(['LT', 'LG', 'C', 'RG', 'RT', 'TE', 'WR1', 'HB', 'QB', 'FB', 'WR2'])
  })
  it('every slot names a real position pool', () => {
    for (const f of [OFFENSE_FORMATION, DEFENSE_FORMATION, ST_FORMATION]) {
      for (const slot of f) expect(typeof slot.pos).toBe('string')
    }
  })
})
