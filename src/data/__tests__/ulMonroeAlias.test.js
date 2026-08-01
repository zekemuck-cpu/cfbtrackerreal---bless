import { describe, it, expect } from 'vitest'
import { getTidFromTeamText } from '../teams'

describe('getTidFromTeamText — EA "UL X" school aliases', () => {
  it('resolves "UL Monroe" (EA name) to the Warhawks (ULM) tid', () => {
    expect(getTidFromTeamText('UL Monroe')).toBeTruthy()
    expect(getTidFromTeamText('UL MONROE')).toBe(getTidFromTeamText('ULM'))
  })
  it('also resolves "Louisiana Monroe"', () => {
    expect(getTidFromTeamText('Louisiana Monroe')).toBe(getTidFromTeamText('ULM'))
  })
  it('resolves "UL Lafayette" to the Ragin Cajuns (UL) tid', () => {
    expect(getTidFromTeamText('UL Lafayette')).toBe(getTidFromTeamText('UL'))
  })
  it('still resolves a normal name and abbr', () => {
    expect(getTidFromTeamText('Alabama')).toBeTruthy()
    expect(getTidFromTeamText('BAMA')).toBeTruthy()
  })
})
