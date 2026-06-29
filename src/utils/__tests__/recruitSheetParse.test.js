import { describe, it, expect } from 'vitest'
import { parseRecruitingRow, parseRecruitingRows, ATTR_COL_START, PID_COL } from '../recruitSheetParse'
import { attributeNamesFor, mapAttributeColumns, ATTRIBUTE_COLUMNS } from '../recruitAttributes'

// A legacy A–O row (15 cells), mirroring the old reader's expected input.
const legacyRow = [
  'Bryce Young', 'HS', 'QB', 'Dual Threat', '☆☆☆☆☆', '1', '1', '1',
  "6'2\"", '195', 'Shelby', 'NC', '', 'Elite', '',
]

describe('parseRecruitingRow — legacy A–O parity', () => {
  it('parses the 15 existing fields exactly + defaults the new fields', () => {
    expect(parseRecruitingRow(legacyRow)).toEqual({
      name: 'Bryce Young', class: 'HS', position: 'QB', archetype: 'Dual Threat',
      stars: 5, nationalRank: 1, stateRank: 1, positionRank: 1,
      height: "6'2\"", weight: 195, hometown: 'Shelby', state: 'NC',
      gemBust: '', devTrait: 'Elite', previousTeam: '',
      isPortal: false,
      // new fields default harmlessly on a legacy sheet:
      commitment: '', attributes: null, pid: undefined, nil: null,
    })
  })

  it('detects portal class and leaves a blank devTrait blank', () => {
    // Dev traits are hidden until signing day — a blank cell must stay blank
    // (not get presumed Normal), so grading can project from stars instead.
    const r = parseRecruitingRow(['Joe Transfer', 'Jr', 'WR', '', '☆☆☆☆', '', '', '', '', '', '', '', '', '', 'OHIO'])
    expect(r.isPortal).toBe(true)
    expect(r.stars).toBe(4)
    expect(r.devTrait).toBe('')
    expect(r.previousTeam).toBe('OHIO')
  })

  it('skips a nameless row', () => {
    expect(parseRecruitingRow(['', 'HS', 'QB'])).toBeNull()
    expect(parseRecruitingRows([legacyRow, [''], ['  ']])).toHaveLength(1)
  })
})

describe('parseRecruitingRow — Targets extension (P–AA)', () => {
  it('reads the Commitment column (P)', () => {
    const row = [...legacyRow]
    row[15] = '(Pursuing)'
    expect(parseRecruitingRow(row).commitment).toBe('(Pursuing)')
  })

  it('reads pid from the hidden column', () => {
    const row = [...legacyRow]
    row[PID_COL] = '4042'
    expect(parseRecruitingRow(row).pid).toBe(4042)
  })

  it('parses attributes from the single labeled cell (codes or full names)', () => {
    const row = [...legacyRow]
    row[ATTR_COL_START] = 'AWR 70, Speed 95, ACC 88'
    expect(parseRecruitingRow(row).attributes).toEqual({ Awareness: 70, Speed: 95, Acceleration: 88 })
  })

  it('handles multi-word names and skips unrecognized labels', () => {
    const row = [...legacyRow]
    row[ATTR_COL_START] = 'Awareness 76, Man Coverage 76, Play Recognition 74, Bogus 50'
    expect(parseRecruitingRow(row).attributes).toEqual({ Awareness: 76, 'Man Coverage': 76, 'Play Recognition': 74 })
  })

  it('treats a bare-number legacy cell as no attributes', () => {
    const row = [...legacyRow]
    row[ATTR_COL_START] = '76'
    expect(parseRecruitingRow(row).attributes).toBeNull()
  })

  it('leaves attributes null when none are filled (unscouted target)', () => {
    expect(parseRecruitingRow(legacyRow).attributes).toBeNull()
  })
})

describe('attribute name resolution', () => {
  it('uses the position base order', () => {
    expect(attributeNamesFor('QB')[0]).toBe('Awareness')
    expect(attributeNamesFor('QB')[1]).toBe('Throw Power')
  })
  it('aliases line positions to their bucket (LT → OT)', () => {
    expect(attributeNamesFor('LT')).toEqual(attributeNamesFor('OT'))
  })
  it('applies an archetype override (WR Speedster ends in Release, Route Artist in Agility)', () => {
    expect(attributeNamesFor('WR', 'Speedster').at(-1)).toBe('Release')
    expect(attributeNamesFor('WR', 'Route Artist').at(-1)).toBe('Agility')
  })
  it('applies the OL "Raw Strength (POS)" override via position alias', () => {
    expect(attributeNamesFor('LT', 'Raw Strength').at(-1)).toBe('Strength')
  })
  it('returns null for positions with no profile (K/P)', () => {
    expect(attributeNamesFor('K')).toBeNull()
    expect(mapAttributeColumns(['10', '20'], 'P')).toBeNull()
  })
  it('skips blank/non-numeric cells', () => {
    expect(mapAttributeColumns(['70', '', 'x', '88'], 'QB')).toEqual({ Awareness: 70, 'Medium Accuracy': 88 })
  })
})
