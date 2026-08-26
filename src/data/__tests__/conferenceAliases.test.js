import { describe, it, expect } from 'vitest'
import { canonicalizeConferenceName, CONFERENCE_ALIASES } from '../conferenceTeams'

// The save's own Conference table names conferences however the game
// stores them internally ('MWC', 'CUSA'), and that raw name flows straight
// into teams[tid].byYear[year].conference on every sync with no
// normalization. CC History compares a team's resolved conference against
// a hardcoded canonical name ('Mountain West', 'Conference USA') — a real
// dynasty had its Mountain West and Conference USA championship games
// permanently show 0 games because of exactly this mismatch, even though
// the games existed and were correctly flagged.
describe('canonicalizeConferenceName', () => {
  it('maps a known save-side alias to the canonical display name', () => {
    expect(canonicalizeConferenceName('MWC')).toBe('Mountain West')
    expect(canonicalizeConferenceName('CUSA')).toBe('Conference USA')
    expect(canonicalizeConferenceName('C-USA')).toBe('Conference USA')
    expect(canonicalizeConferenceName('AAC')).toBe('American')
  })

  it('leaves an already-canonical name unchanged', () => {
    expect(canonicalizeConferenceName('Mountain West')).toBe('Mountain West')
    expect(canonicalizeConferenceName('Conference USA')).toBe('Conference USA')
  })

  it('passes an unrecognized/custom conference name through unchanged', () => {
    expect(canonicalizeConferenceName('My Custom League')).toBe('My Custom League')
  })

  it('passes through null/undefined/empty without throwing', () => {
    expect(canonicalizeConferenceName(null)).toBe(null)
    expect(canonicalizeConferenceName(undefined)).toBe(undefined)
    expect(canonicalizeConferenceName('')).toBe('')
  })

  it('every canonical name maps to itself', () => {
    for (const canonical of Object.keys(CONFERENCE_ALIASES)) {
      expect(canonicalizeConferenceName(canonical)).toBe(canonical)
    }
  })
})
