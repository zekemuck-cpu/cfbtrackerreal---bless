import { describe, it, expect } from 'vitest'
import { normalizeRosterRow, normalizeRosterRows } from '../rosterRealign'

// Column layout (14 cols; +Attributes(14) when attributes are enabled):
// [First(0), Last(1), Position(2), Class(3), Dev(4), Jersey#(5), Archetype(6),
//  Overall(7), Height(8), Weight(9), Hometown(10), State(11), Image(12), NIL(13)]

// A well-formed, aligned row with a BLANK Dev Trait (the common empty case).
const aligned = () => [
  'John', 'Smith', 'QB', 'Jr', '', '12', 'Pocket Passer', '85',
  `6'2"`, '210', 'Dallas', 'TX', '', '1000',
]

describe('normalizeRosterRow — dropped-Dev-Trait left-slide', () => {
  it('recovers a dropped blank Dev Trait (Height back to index 8, spine validates)', () => {
    // Blank Dev(4) dropped => everything from Jersey# on slides one LEFT, so
    // Height lands at index 7 instead of 8.
    const shifted = [
      'John', 'Smith', 'QB', 'Jr', '12', 'Pocket Passer', '85',
      `6'2"`, '210', 'Dallas', 'TX', '', '1000',
    ]
    expect(shifted[7]).toBe(`6'2"`) // Height mispositioned before heal

    const out = normalizeRosterRow(shifted)
    expect(out[8]).toBe(`6'2"`)     // Height restored to its home index
    expect(out[2]).toBe('QB')       // Position intact
    expect(out[3]).toBe('Jr')       // Class intact
    expect(out[4]).toBe('')         // re-inserted blank Dev Trait
    expect(out[5]).toBe('12')       // Jersey# back in place
    expect(out[7]).toBe('85')       // Overall in place
    expect(out[9]).toBe('210')      // Weight in place
    expect(out[13]).toBe('1000')    // NIL in place
    expect(out).toEqual(aligned())
  })

  it('recovers the shift when the optional Attributes column is present', () => {
    const shifted = [
      'John', 'Smith', 'QB', 'Jr', '12', 'Pocket Passer', '85',
      `6'2"`, '210', 'Dallas', 'TX', '', '1000', 'AWR 80, SPD 88',
    ]
    const out = normalizeRosterRow(shifted)
    expect(out[8]).toBe(`6'2"`)
    expect(out[4]).toBe('')
    expect(out[14]).toBe('AWR 80, SPD 88') // Attributes preserved at the tail
  })
})

describe('normalizeRosterRow — no-op / idempotency', () => {
  it('is a no-op on an already-aligned row', () => {
    const row = aligned()
    expect(normalizeRosterRow(row)).toEqual(aligned())
  })

  it('is idempotent (double-apply == single-apply)', () => {
    const shifted = [
      'John', 'Smith', 'QB', 'Jr', '12', 'Pocket Passer', '85',
      `6'2"`, '210', 'Dallas', 'TX', '', '1000',
    ]
    const once = normalizeRosterRow(shifted)
    const twice = normalizeRosterRow(once)
    expect(twice).toEqual(once)
    expect(once).toEqual(aligned())
  })
})

describe('normalizeRosterRow — BAIL cases (prefer false negatives)', () => {
  it('bails when the shift is ambiguous (a dropped blank Archetype has >1 valid reconstruction)', () => {
    // Real Dev='Elite' present; a blank Archetype(6) dropped slides Height to 7.
    // Re-inserting the blank at the Dev slot, the freed slot, OR the Archetype
    // slot all validate => ambiguous => unchanged.
    const shifted = [
      'John', 'Smith', 'QB', 'Jr', 'Elite', '12', '85',
      `6'2"`, '210', 'Dallas', 'TX', '', '1000',
    ]
    const out = normalizeRosterRow(shifted)
    expect(out).toBe(shifted) // exact same reference — untouched
  })

  it('leaves a row with no Height unchanged', () => {
    const row = ['John', 'Smith', 'QB', 'Jr', '', '12', 'Pocket Passer', '85']
    expect(normalizeRosterRow(row)).toBe(row)
  })

  it('does NOT reorder collision-prone numerics — bails rather than guess', () => {
    // Jersey#, Overall, Weight are jumbled but there is no clean Height-anchored
    // single-block shift to key off (Height already at 8), so numerics are left
    // exactly as-is (never sorted by content).
    const row = [
      'Jane', 'Doe', 'WR', 'So', 'Star', '210', 'Speedster', '99',
      `5'11"`, '85', 'Miami', 'FL', '', '12',
    ]
    const out = normalizeRosterRow(row)
    expect(out).toEqual(row)   // untouched
    expect(out[5]).toBe('210') // numerics NOT reordered
    expect(out[7]).toBe('99')
    expect(out[9]).toBe('85')
  })

  it('bails on a right-slide (Height past index 8) rather than remove cells', () => {
    const row = [
      '', 'John', 'Smith', 'QB', 'Jr', '', '12', 'Pocket Passer', '85',
      `6'2"`, '210', 'Dallas', 'TX', '', '1000',
    ]
    expect(normalizeRosterRow(row)).toBe(row)
  })
})

describe('normalizeRosterRows / non-array pass-through', () => {
  it('passes a non-array through unchanged', () => {
    expect(normalizeRosterRow(null)).toBe(null)
    expect(normalizeRosterRow('nope')).toBe('nope')
    expect(normalizeRosterRows(null)).toBe(null)
    expect(normalizeRosterRows('nope')).toBe('nope')
  })

  it('maps over a grid of rows', () => {
    const rows = [
      aligned(),
      ['John', 'Smith', 'QB', 'Jr', '12', 'Pocket Passer', '85', `6'2"`, '210', 'Dallas', 'TX', '', '1000'],
    ]
    const out = normalizeRosterRows(rows)
    expect(out[0]).toEqual(aligned())
    expect(out[1][8]).toBe(`6'2"`) // second row healed
  })
})
