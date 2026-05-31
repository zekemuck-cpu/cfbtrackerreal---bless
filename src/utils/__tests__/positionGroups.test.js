import { describe, it, expect } from 'vitest'
import { groupForPosition, finePositionGroup } from '../../data/positionGroups'

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

describe('finePositionGroup (Team Future breakout)', () => {
  it('splits the OL into OT / OG / C', () => {
    expect(['LT', 'RT'].map(finePositionGroup)).toEqual(['OT', 'OT'])
    expect(['LG', 'RG'].map(finePositionGroup)).toEqual(['OG', 'OG'])
    expect(finePositionGroup('C')).toBe('C')
  })
  it('splits the front into DT / EDGE', () => {
    expect(finePositionGroup('DT')).toBe('DT')
    expect(['LEDG', 'REDG'].map(finePositionGroup)).toEqual(['EDGE', 'EDGE'])
  })
  it('splits LBs into OLB / MIKE and DBs into CB / Safety', () => {
    expect(['SAM', 'WILL'].map(finePositionGroup)).toEqual(['OLB', 'OLB'])
    expect(finePositionGroup('MIKE')).toBe('MIKE')
    expect(finePositionGroup('CB')).toBe('CB')
    expect(['FS', 'SS'].map(finePositionGroup)).toEqual(['Safety', 'Safety'])
  })
})
