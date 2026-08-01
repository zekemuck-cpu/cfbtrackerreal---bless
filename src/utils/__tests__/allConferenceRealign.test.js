import { describe, it, expect } from 'vitest'
import { normalizeAllConferenceRow, normalizeAllConferenceRows } from '../allConferenceRealign'

// Canonical layout:
//   [Conference(0), Designation(1), Position(2), Player(3), Team(4), Class(5)]
// Enum spine: Designation@1, Position@2, Class@5. Free text: Conference, Player, Team.

describe('normalizeAllConferenceRow — enum-anchored column-shift self-heal', () => {
  it('recovers a dropped-Designation left-slide (Position at idx1, Class at idx4)', () => {
    // Designation blank was dropped, sliding every later cell one column left:
    //   [ACC, DT, Aidan Hutchinson, Michigan, Jr]  (5 cells)
    // Position "DT" now sits at idx1 and Class "Jr" at idx4.
    const shifted = ['ACC', 'DT', 'Aidan Hutchinson', 'Michigan', 'Jr']
    const healed = normalizeAllConferenceRow(shifted)
    expect(healed).toEqual(['ACC', '', 'DT', 'Aidan Hutchinson', 'Michigan', 'Jr'])
    // Enum spine re-validates: idx1 blank, idx2 Position, idx5 Class.
    expect(healed[2]).toBe('DT')
    expect(healed[5]).toBe('Jr')
    // Player and Team keep their relative order and slots.
    expect(healed[3]).toBe('Aidan Hutchinson')
    expect(healed[4]).toBe('Michigan')
  })

  it('is a no-op on an already-aligned six-column row', () => {
    const canonical = ['SEC', 'first', 'QB', 'Bryce Young', 'Alabama', 'Sr']
    expect(normalizeAllConferenceRow(canonical)).toEqual(canonical)
  })

  it('is idempotent — re-running a healed row leaves it unchanged', () => {
    const shifted = ['Big Ten', 'WR', 'Marvin Harrison', 'Ohio State', 'RS So']
    const once = normalizeAllConferenceRow(shifted)
    expect(once).toEqual(['Big Ten', '', 'WR', 'Marvin Harrison', 'Ohio State', 'RS So'])
    const twice = normalizeAllConferenceRow(once)
    expect(twice).toEqual(once)
  })

  it('BAILS on an ambiguous row where a text value could be Player OR Team', () => {
    // Both Designation and Team dropped → 4 cells [Conf, Pos, Player, Class].
    // The single free-text value between Position and Class could be the Player
    // (Team dropped) or the Team (Player dropped); we cannot tell, so multiple
    // reconstructions validate → bail unchanged.
    const ambiguous = ['ACC', 'CB', 'Travis Hunter', 'Jr']
    expect(normalizeAllConferenceRow(ambiguous)).toEqual(ambiguous)
  })

  it('leaves a row with no recognizable enum values unchanged', () => {
    // Five free-text cells, no Designation/Position/Class anywhere to anchor.
    const noEnum = ['Some Conf', 'Jane Doe', 'Springfield U', 'Extra', 'More']
    expect(normalizeAllConferenceRow(noEnum)).toEqual(noEnum)
  })

  it('passes non-array input straight through', () => {
    expect(normalizeAllConferenceRow(null)).toBe(null)
    expect(normalizeAllConferenceRow(undefined)).toBe(undefined)
    expect(normalizeAllConferenceRow('ACC\tfirst\tQB')).toBe('ACC\tfirst\tQB')
  })
})

describe('normalizeAllConferenceRows — grid wrapper', () => {
  it('heals each row and leaves aligned/ambiguous rows intact', () => {
    const grid = [
      ['SEC', 'first', 'QB', 'Bryce Young', 'Alabama', 'Sr'], // aligned → no-op
      ['ACC', 'DT', 'Aidan Hutchinson', 'Michigan', 'Jr'],    // dropped Designation → healed
      ['ACC', 'CB', 'Travis Hunter', 'Jr'],                   // ambiguous → unchanged
    ]
    expect(normalizeAllConferenceRows(grid)).toEqual([
      ['SEC', 'first', 'QB', 'Bryce Young', 'Alabama', 'Sr'],
      ['ACC', '', 'DT', 'Aidan Hutchinson', 'Michigan', 'Jr'],
      ['ACC', 'CB', 'Travis Hunter', 'Jr'],
    ])
  })

  it('passes non-array input straight through', () => {
    expect(normalizeAllConferenceRows(null)).toBe(null)
    expect(normalizeAllConferenceRows('not an array')).toBe('not an array')
  })
})
