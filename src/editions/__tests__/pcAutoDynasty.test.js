import { describe, it, expect } from 'vitest'
import { isPcAutoDynasty, isCfb27, DEFAULT_EDITION, LEGACY_EDITION } from '../index'

// PC auto-sync mode rewires ~80 gate sites: it removes Edit buttons, replaces
// the preseason manual-entry to-dos with read-only links, changes the
// Sportsbook power model, and surfaces sync-only nav pages. Flipping an
// existing console dynasty into it would break the workflow its owner is
// using RIGHT NOW, with no action on their part.
//
// So the gate is OPT-IN: it requires an explicit platform: 'pc'. These tests
// exist to make that direction impossible to invert by accident.
describe('isPcAutoDynasty — console dynasties must never auto-enter PC mode', () => {
  it('is FALSE for a CFB27 dynasty with no platform field (every pre-existing save)', () => {
    // The critical case. DEFAULT_EDITION is cfb27, and no dynasty created
    // before the Console/PC selector shipped carries a `platform` at all.
    expect(isPcAutoDynasty({ gameEdition: 'cfb27' })).toBe(false)
  })

  it('is FALSE for a dynasty with NO fields at all', () => {
    expect(isPcAutoDynasty({})).toBe(false)
    expect(isPcAutoDynasty(null)).toBe(false)
    expect(isPcAutoDynasty(undefined)).toBe(false)
  })

  it('is FALSE for an explicit console dynasty', () => {
    expect(isPcAutoDynasty({ gameEdition: 'cfb27', platform: 'console' })).toBe(false)
  })

  it('is FALSE for any unrecognized platform value', () => {
    // A typo, a future value, or corrupt data must fail CLOSED (manual mode),
    // never open into auto-sync.
    for (const platform of ['PC', 'Pc', 'pc ', 'steam', '', 0, 1, true, {}, []]) {
      expect(isPcAutoDynasty({ gameEdition: 'cfb27', platform })).toBe(false)
    }
  })

  it('is TRUE only for an explicit CFB27 + platform:"pc" dynasty', () => {
    expect(isPcAutoDynasty({ gameEdition: 'cfb27', platform: 'pc' })).toBe(true)
  })

  it('is FALSE on CFB 26 even with platform:"pc" (no save sync exists there)', () => {
    expect(isPcAutoDynasty({ gameEdition: 'cfb26', platform: 'pc' })).toBe(false)
  })

  it('is FALSE for an untagged (legacy) dynasty regardless of platform', () => {
    // No gameEdition → LEGACY_EDITION (cfb26), which has no PC support.
    expect(LEGACY_EDITION).toBe('cfb26')
    expect(isPcAutoDynasty({ platform: 'pc' })).toBe(false)
  })
})

describe('edition defaults the PC gate depends on', () => {
  it('DEFAULT_EDITION is cfb27 — which is exactly why the gate cannot key on edition alone', () => {
    expect(DEFAULT_EDITION).toBe('cfb27')
    // Same dynasty, CFB 27 by edition, still not a PC dynasty.
    const consoleDynasty = { gameEdition: DEFAULT_EDITION }
    expect(isCfb27(consoleDynasty)).toBe(true)
    expect(isPcAutoDynasty(consoleDynasty)).toBe(false)
  })
})
