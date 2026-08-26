import { describe, it, expect } from 'vitest'
import { findInvalidFirestoreValues, describeInvalidFirestoreValues } from '../firestorePayloadAudit'

// This exists to make Firestore's opaque `invalid-argument` actionable. A real
// user's CFB27 sync was broken for days because the only signal was that the
// main-doc write failed while subcollection writes succeeded — the error named
// no field. False negatives here put us right back there, so the shapes an
// actual sync payload produces are pinned explicitly.
describe('findInvalidFirestoreValues', () => {
  it('finds a deeply nested undefined and gives its dotted path', () => {
    // The real shape: one award entry whose optional stat line never got set.
    const payload = {
      heismanWatchByYear: { 2026: { 3: [{ name: 'Bo Jackson', stats: undefined }] } },
    }
    expect(findInvalidFirestoreValues(payload)).toEqual([
      { path: 'heismanWatchByYear.2026.3[0].stats', reason: 'undefined' },
    ])
  })

  it('flags a directly nested array', () => {
    expect(findInvalidFirestoreValues({ teamFuture: { 42: { order: [[1, 2], [3]] } } }))
      .toEqual([
        { path: 'teamFuture.42.order[0]', reason: 'nested array (array inside array)' },
        { path: 'teamFuture.42.order[1]', reason: 'nested array (array inside array)' },
      ])
  })

  it('does NOT flag arrays of objects that themselves contain arrays', () => {
    // Legal in Firestore and extremely common here (a roster of players, each
    // with a stats array). Flagging it would bury the real finding in noise.
    expect(findInvalidFirestoreValues({ players: [{ name: 'A', tags: ['x', 'y'] }] })).toEqual([])
  })

  it('catches NaN, functions, and symbols', () => {
    const found = findInvalidFirestoreValues({ a: NaN, b: () => {}, c: Symbol('s') })
    expect(found.map(f => f.reason).sort()).toEqual(['NaN', 'function', 'symbol'])
  })

  it('passes a clean payload, including legal edge values', () => {
    // null IS storable and must not be confused with undefined; 0 and '' are
    // fine; Infinity is a valid double in Firestore.
    expect(findInvalidFirestoreValues({
      a: null, b: 0, c: '', d: false, e: [], f: {}, g: Infinity,
      teams: { 42: { byYear: { 2026: { rankByWeek: { 1: 12 } } } } },
    })).toEqual([])
  })

  it('does not walk into class instances (FieldValue/Timestamp sentinels)', () => {
    class Sentinel { constructor() { this.internal = undefined } }
    expect(findInvalidFirestoreValues({ updatedAt: new Sentinel() })).toEqual([])
  })

  it('survives circular references without hanging', () => {
    const a = { name: 'x' }
    a.self = a
    expect(() => findInvalidFirestoreValues({ a })).not.toThrow()
  })

  it('caps findings so a pathological payload cannot produce an endless report', () => {
    const payload = {}
    for (let i = 0; i < 200; i++) payload[`f${i}`] = undefined
    expect(findInvalidFirestoreValues(payload)).toHaveLength(25)
  })

  it('describes findings as a short one-liner, or empty when clean', () => {
    expect(describeInvalidFirestoreValues({ ok: 1 })).toBe('')
    const desc = describeInvalidFirestoreValues({ a: { b: undefined } })
    expect(desc).toBe('a.b (undefined)')
  })
})
