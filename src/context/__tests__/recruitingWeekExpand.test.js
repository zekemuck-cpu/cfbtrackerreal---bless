import { describe, it, expect } from 'vitest'

// Mirrors the _recruitingWeekExpandV1 transform in applyMigrations, and its
// composition with _offseasonWeekCollapseV1 (collapse runs first, expand
// second — see applyMigrations). Unlike collapse, expand has no fixed point
// (w >= 5 ? w + 1 : w keeps climbing), which is exactly why its result MUST
// be persisted by the caller (recruitingWeekShifts / persistRecruitingWeekShifts)
// rather than relying on re-running it being harmless.
const collapse = (w) => (w >= 8 ? 7 : w)
const expand = (w) => (w >= 5 ? w + 1 : w)
const composed = (w) => expand(collapse(w))

describe('recruiting week expand migration', () => {
  it('leaves weeks 1-4 (Leaving, Recruiting 1-3) untouched', () => {
    for (const w of [1, 2, 3, 4]) expect(expand(w)).toBe(w)
  })

  it('shifts week 5 (old Signing Day) to 6, the new Signing Day', () => {
    expect(expand(5)).toBe(6)
  })

  it('shifts week 6 (old Training) to 7, the new Training', () => {
    expect(expand(6)).toBe(7)
  })

  it('shifts week 7 (old Transfers) to 8, the new Transfers', () => {
    expect(expand(7)).toBe(8)
  })
})

describe('collapse + expand composition (the order applyMigrations actually runs them in)', () => {
  // The exact mapping to double-check the composed result against: wk<=4
  // unchanged, 5->6, 6->7, 7->8. This only holds because collapse is now a
  // fixed point (w>=8?7:w) that leaves 1-7 alone — with the old buggy
  // collapse (w===7?6), a stored 7 (true Transfers) would collapse to 6
  // then expand to 7, permanently misfiling a Transfers-stage dynasty as
  // Training Results once persisted.
  it('matches wk<=4 unchanged, 5->6, 6->7, 7->8', () => {
    expect(composed(1)).toBe(1)
    expect(composed(2)).toBe(2)
    expect(composed(3)).toBe(3)
    expect(composed(4)).toBe(4)
    expect(composed(5)).toBe(6)
    expect(composed(6)).toBe(7)
    expect(composed(7)).toBe(8)
  })

  it('still maps the ancient pre-collapse week 8 (Transfers) onto the new week 8', () => {
    expect(composed(8)).toBe(8)
  })
})
