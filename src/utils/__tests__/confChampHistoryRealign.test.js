import { describe, it, expect } from 'vitest'
import {
  normalizeConfChampHistoryRow,
  normalizeConfChampHistoryRows,
} from '../confChampHistoryRealign'

// Canonical shape: [ Year(0), Conference(1), Team 1(2), Team 2(3), Team 1 Score(4), Team 2 Score(5) ]

describe('normalizeConfChampHistoryRow', () => {
  it('recovers a dropped-blank shift to [year, text, text, text, int, int]', () => {
    // A stray blank (e.g. a double-tab) slid Team 2 + both scores one column
    // right. The six real values survive intact and in canonical order once the
    // blank is stripped, so the row is unambiguously reconstructable.
    const shifted = ['2023', 'SEC', 'BAMA', '', 'UGA', '24', '17']
    expect(normalizeConfChampHistoryRow(shifted)).toEqual([
      '2023',
      'SEC',
      'BAMA',
      'UGA',
      '24',
      '17',
    ])
  })

  it('recovers a leading-blank shift', () => {
    const shifted = ['', '2019', 'Big Ten', 'OSU', 'WISC', '34', '21']
    expect(normalizeConfChampHistoryRow(shifted)).toEqual([
      '2019',
      'Big Ten',
      'OSU',
      'WISC',
      '34',
      '21',
    ])
  })

  it('is a no-op on an already-aligned row', () => {
    const aligned = ['2025', 'ACC', 'CLEM', 'MIA', '31', '28']
    expect(normalizeConfChampHistoryRow(aligned)).toEqual(aligned)
  })

  it('is idempotent (re-running on healed output changes nothing)', () => {
    const shifted = ['2023', 'SEC', 'BAMA', '', 'UGA', '24', '17']
    const once = normalizeConfChampHistoryRow(shifted)
    const twice = normalizeConfChampHistoryRow(once)
    expect(twice).toEqual(once)
    // And a fully-canonical row survives a second pass unchanged.
    expect(normalizeConfChampHistoryRow(once)).toEqual([
      '2023',
      'SEC',
      'BAMA',
      'UGA',
      '24',
      '17',
    ])
  })

  it('BAILS on an ambiguous row (a real text cell missing) — never guesses', () => {
    // Conference dropped entirely: only 2 text cells survive, so we cannot tell
    // which text column the missing blank belongs to. Must return unchanged.
    const ambiguous = ['2021', 'GA', 'ALA', '24', '17']
    expect(normalizeConfChampHistoryRow(ambiguous)).toEqual(ambiguous)
  })

  it('BAILS when a stray int sits among the text cells (cannot pin anchors)', () => {
    const ambiguous = ['2020', 'SEC', '99', 'BAMA', 'UGA', '24', '17']
    expect(normalizeConfChampHistoryRow(ambiguous)).toEqual(ambiguous)
  })

  it('leaves a row without a clear 4-digit year unchanged', () => {
    const noYear = ['SEC', 'BAMA', 'UGA', '24', '17']
    expect(normalizeConfChampHistoryRow(noYear)).toEqual(noYear)
    const badYear = ['23', 'SEC', 'BAMA', 'UGA', '24', '17']
    expect(normalizeConfChampHistoryRow(badYear)).toEqual(badYear)
  })

  it('passes non-array input straight through', () => {
    expect(normalizeConfChampHistoryRow(null)).toBe(null)
    expect(normalizeConfChampHistoryRow(undefined)).toBe(undefined)
    expect(normalizeConfChampHistoryRow('2023\tSEC')).toBe('2023\tSEC')
  })
})

describe('normalizeConfChampHistoryRows', () => {
  it('maps over every row, healing shifted rows and leaving good/ambiguous ones', () => {
    const rows = [
      ['2023', 'SEC', 'BAMA', '', 'UGA', '24', '17'], // shifted -> healed
      ['2025', 'ACC', 'CLEM', 'MIA', '31', '28'], // aligned -> no-op
      ['2021', 'GA', 'ALA', '24', '17'], // ambiguous -> unchanged
    ]
    expect(normalizeConfChampHistoryRows(rows)).toEqual([
      ['2023', 'SEC', 'BAMA', 'UGA', '24', '17'],
      ['2025', 'ACC', 'CLEM', 'MIA', '31', '28'],
      ['2021', 'GA', 'ALA', '24', '17'],
    ])
  })

  it('passes non-array input straight through', () => {
    expect(normalizeConfChampHistoryRows(null)).toBe(null)
    expect(normalizeConfChampHistoryRows('nope')).toBe('nope')
  })
})
