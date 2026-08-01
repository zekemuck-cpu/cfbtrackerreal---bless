import { describe, it, expect } from 'vitest'
import { isDynastyBlueprintEnabled, editionHasFeature } from '../index'

describe('isDynastyBlueprintEnabled — the single Blueprint gate', () => {
  it('is ON for a CFB 27 dynasty by default', () => {
    expect(isDynastyBlueprintEnabled({ gameEdition: 'cfb27' })).toBe(true)
  })

  it('is OFF for a CFB 27 dynasty when the user hid it', () => {
    expect(isDynastyBlueprintEnabled({ gameEdition: 'cfb27', hideDynastyBlueprint: true })).toBe(false)
  })

  it('is ON again once the preference is flipped back (hideDynastyBlueprint: false)', () => {
    expect(isDynastyBlueprintEnabled({ gameEdition: 'cfb27', hideDynastyBlueprint: false })).toBe(true)
  })

  it('is OFF for CFB 26 / untagged (legacy) dynasties regardless of the preference', () => {
    expect(isDynastyBlueprintEnabled({ gameEdition: 'cfb26' })).toBe(false)
    expect(isDynastyBlueprintEnabled({})).toBe(false)
    // The hide flag can never turn Blueprint ON where the edition lacks it.
    expect(isDynastyBlueprintEnabled({ gameEdition: 'cfb26', hideDynastyBlueprint: false })).toBe(false)
  })

  it('does not crash on null / undefined', () => {
    expect(isDynastyBlueprintEnabled(null)).toBe(false)
    expect(isDynastyBlueprintEnabled(undefined)).toBe(false)
  })

  it('the settings card gate (editionHasFeature) stays TRUE when hidden, so the toggle remains visible to unhide', () => {
    expect(editionHasFeature({ gameEdition: 'cfb27', hideDynastyBlueprint: true }, 'dynastyPoints')).toBe(true)
    expect(editionHasFeature({ gameEdition: 'cfb26' }, 'dynastyPoints')).toBe(false)
  })
})
