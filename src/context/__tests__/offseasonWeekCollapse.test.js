import { describe, it, expect } from 'vitest'

// Mirrors the _offseasonWeekCollapseV1 transform in applyMigrations.
// The flag it is gated on is never persisted (applyMigrations is a pure
// in-memory transform), so this runs against raw storage on EVERY load —
// which makes being a fixed point the property that actually matters.
const collapse = (w) => (w >= 8 ? 7 : w)

describe('offseason week collapse migration', () => {
  it('maps the old 8-week model\'s last week onto the current last week', () => {
    expect(collapse(8)).toBe(7)
  })

  it('leaves week 7 (Transfers) alone', () => {
    // Regression: the old `w === 7 ? 6` clause wedged every console dynasty
    // that advanced to the last offseason week — wk6→7 persists a 7, the
    // next load knocked it back to 6, and the user could never reach
    // preseason.
    expect(collapse(7)).toBe(7)
  })

  it('leaves every earlier offseason week untouched', () => {
    for (const w of [1, 2, 3, 4, 5, 6]) expect(collapse(w)).toBe(w)
  })

  it('is a fixed point, so re-running it on every load is a no-op', () => {
    for (const w of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      expect(collapse(collapse(w))).toBe(collapse(w))
    }
  })
})
