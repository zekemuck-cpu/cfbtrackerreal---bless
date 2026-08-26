import { describe, it, expect } from 'vitest'
import { reconcileDevTraitMirror, syncDerivedFieldsFromV2 } from '../rosterModel'

// Regression tests for the "dev traits won't stick" report (two independent
// console users). syncDerivedFieldsFromV2 derives player.devTrait FROM
// devTraitByYear[currentYear] when the map has a value — so any surface that
// edits only the top-level mirror (recruiting modal, player modal's main
// dropdown) had its edit silently reverted by the very save meant to persist
// it. reconcileDevTraitMirror runs before the derive and writes a detected
// mirror-edit through to the map. The bug only manifests through the
// COMPOSITION of the two functions, so most tests here run both, exactly as
// updateDynasty does.
const CY = 2027

const roundTrip = (next, prior) =>
  syncDerivedFieldsFromV2(reconcileDevTraitMirror(next, prior, CY), CY)

describe('reconcileDevTraitMirror + syncDerivedFieldsFromV2', () => {
  it('a mirror-only edit survives the derive (the reported bug)', () => {
    const prior = { pid: 1, name: 'R', devTrait: 'Normal', devTraitByYear: { [CY]: 'Normal' } }
    // Recruiting modal: spreads the player, sets only the top-level trait.
    const next = { ...prior, devTrait: 'Star' }
    const out = roundTrip(next, prior)
    expect(out.devTrait).toBe('Star')
    expect(out.devTraitByYear[CY]).toBe('Star')
  })

  it('without reconciliation the derive really does revert (documents why this exists)', () => {
    const prior = { pid: 1, devTrait: 'Normal', devTraitByYear: { [CY]: 'Normal' } }
    const next = { ...prior, devTrait: 'Star' }
    // Derive alone — the pre-fix behavior.
    expect(syncDerivedFieldsFromV2(next, CY).devTrait).toBe('Normal')
  })

  it('clearing the mirror clears the trait (blank = hidden, never presume Normal)', () => {
    const prior = { pid: 1, devTrait: 'Star', devTraitByYear: { [CY]: 'Star' } }
    const next = { ...prior, devTrait: '' }
    const out = roundTrip(next, prior)
    // The normalizer drops empty map entries, so both stores genuinely clear.
    expect(out.devTrait).toBe(null)
    expect(out.devTraitByYear[CY]).toBeUndefined()
  })

  it('an edit made through the map itself is left alone — the map is canonical', () => {
    const prior = { pid: 1, devTrait: 'Normal', devTraitByYear: { [CY]: 'Normal' } }
    // Player-page per-year editor: map changed, mirror stale.
    const next = { ...prior, devTraitByYear: { [CY]: 'Elite' } }
    const out = roundTrip(next, prior)
    expect(out.devTrait).toBe('Elite')
  })

  it('no-op when nothing changed', () => {
    const prior = { pid: 1, devTrait: 'Impact', devTraitByYear: { [CY]: 'Impact' } }
    const next = { ...prior }
    expect(roundTrip(next, prior).devTrait).toBe('Impact')
  })

  it('players with no per-year entry keep working as before', () => {
    // Recruits created by the recruiting flow have an empty map — the mirror
    // always won for them, which is why only v2-migrated rosters hit the bug.
    const prior = { pid: 1, devTrait: '', devTraitByYear: {} }
    const next = { ...prior, devTrait: 'Star' }
    const out = roundTrip(next, prior)
    expect(out.devTrait).toBe('Star')
  })

  it('string-keyed map entries are matched too', () => {
    const prior = { pid: 1, devTrait: 'Normal', devTraitByYear: { [String(CY)]: 'Normal' } }
    const next = { ...prior, devTrait: 'Elite' }
    const out = roundTrip(next, prior)
    expect(out.devTrait).toBe('Elite')
  })

  it('handles a missing prior (new player) and bad years without throwing', () => {
    const next = { pid: 9, devTrait: 'Star', devTraitByYear: {} }
    expect(reconcileDevTraitMirror(next, undefined, CY)).toBe(next)
    expect(reconcileDevTraitMirror(next, null, CY)).toBe(next)
    expect(reconcileDevTraitMirror(next, { devTrait: '' }, undefined)).toBe(next)
    expect(reconcileDevTraitMirror(null, { devTrait: '' }, CY)).toBe(null)
  })

  it('does not touch the map when mirror and map already agree', () => {
    const prior = { pid: 1, devTrait: 'Normal', devTraitByYear: { [CY]: 'Star' } }
    // Mirror changed to what the map already says — nothing to reconcile.
    const next = { ...prior, devTrait: 'Star' }
    const rec = reconcileDevTraitMirror(next, prior, CY)
    expect(rec).toBe(next)
  })
})
