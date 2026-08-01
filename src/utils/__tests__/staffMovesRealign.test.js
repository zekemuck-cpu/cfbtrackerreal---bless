import { describe, it, expect } from 'vitest'
import {
  normalizeStaffMoveRow,
  normalizeStaffMoveRows,
} from '../staffMovesRealign'

// Canonical column order:
//   [ Name(0), Prev Pos(1), Prev School(2), New Pos(3), New School(4), Reason(5) ]

describe('normalizeStaffMoveRow', () => {
  it('no-op on an already-aligned row', () => {
    const row = ['Lincoln Riley', 'HC', 'USC', 'OC', 'Alabama', 'Hired by Another Team']
    expect(normalizeStaffMoveRow(row)).toBe(row) // returns the same reference unchanged
  })

  it('recovers a dropped-blank left slide (both roles back at 1 and 3)', () => {
    // A blank Name was dropped, sliding every value one column left, so the two
    // roles land at indices 0 and 2 instead of 1 and 3.
    const shifted = ['HC', 'USC', 'OC', 'Alabama', 'Hired by Another Team']
    expect(normalizeStaffMoveRow(shifted)).toEqual([
      '', 'HC', 'USC', 'OC', 'Alabama', 'Hired by Another Team',
    ])
  })

  it('recovers a dropped blank in the middle (Prev School missing)', () => {
    // Prev School was blank and dropped: New Pos slides from index 3 to 2.
    const shifted = ['Nick Saban', 'HC', 'DC', 'Georgia', 'Retired']
    expect(normalizeStaffMoveRow(shifted)).toEqual([
      'Nick Saban', 'HC', '', 'DC', 'Georgia', 'Retired',
    ])
  })

  it('is idempotent (healing a healed row is a no-op)', () => {
    const shifted = ['HC', 'USC', 'OC', 'Alabama', 'Hired by Another Team']
    const once = normalizeStaffMoveRow(shifted)
    const twice = normalizeStaffMoveRow(once)
    expect(twice).toBe(once) // second pass sees a canonical row and returns it unchanged
    expect(twice).toEqual([
      '', 'HC', 'USC', 'OC', 'Alabama', 'Hired by Another Team',
    ])
  })

  it('leaves an ambiguous row UNCHANGED (multiple valid reconstructions)', () => {
    // Three role-looking cells and nothing else: several blank placements put a
    // role at both index 1 and index 3, so there is no unique fix. Bail.
    const ambiguous = ['HC', 'OC', 'DC']
    expect(normalizeStaffMoveRow(ambiguous)).toBe(ambiguous)
  })

  it('leaves a row with no recognizable roles unchanged', () => {
    const noRoles = ['Some Coach', 'Miami', 'Fired']
    expect(normalizeStaffMoveRow(noRoles)).toBe(noRoles)
  })

  it('does not reorder free-text columns (bails when only one role is present)', () => {
    // Only one role available cannot fill both role indices, so nothing validates.
    const oneRole = ['Coach', 'HC', 'FSU', 'Retired']
    expect(normalizeStaffMoveRow(oneRole)).toBe(oneRole)
  })

  it('passes a non-array through unchanged', () => {
    expect(normalizeStaffMoveRow(null)).toBe(null)
    expect(normalizeStaffMoveRow('HC\tOC')).toBe('HC\tOC')
  })
})

describe('normalizeStaffMoveRows', () => {
  it('normalizes each row, healing shifted and leaving aligned ones', () => {
    const aligned = ['Lincoln Riley', 'HC', 'USC', 'OC', 'Alabama', 'Hired by Another Team']
    const shifted = ['HC', 'USC', 'OC', 'Alabama', 'Hired by Another Team']
    const out = normalizeStaffMoveRows([aligned, shifted])
    expect(out[0]).toBe(aligned)
    expect(out[1]).toEqual(['', 'HC', 'USC', 'OC', 'Alabama', 'Hired by Another Team'])
  })

  it('passes non-array input through unchanged', () => {
    expect(normalizeStaffMoveRows(null)).toBe(null)
    expect(normalizeStaffMoveRows('nope')).toBe('nope')
  })
})
