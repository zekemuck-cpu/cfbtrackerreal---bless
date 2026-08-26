import { describe, it, expect } from 'vitest'
import { isDocTooLargeError } from '../firestoreErrors'

// This classifier decides when the loud red "your saves are NOT reaching the
// cloud" banner shows. False negative = a user silently loses months of data
// (the "whole season gone except week two" report). False positive = we scare
// a user whose save actually succeeded. Both directions get pinned.
describe('isDocTooLargeError', () => {
  it('matches the real Firestore oversized-document rejection', () => {
    // Shape the Web SDK produces when the server refuses a >1MiB doc.
    expect(isDocTooLargeError({
      code: 'invalid-argument',
      message: 'Document cannot be written because its size (1,234,567 bytes) exceeds the maximum allowed size of 1,048,576 bytes.',
    })).toBe(true)
  })

  it('matches the gRPC-style INVALID_ARGUMENT text form', () => {
    expect(isDocTooLargeError(new Error(
      'INVALID_ARGUMENT: entity is too big. size=1200000 max=1048576',
    ))).toBe(true)
  })

  it('matches the per-field variant ("longer than N bytes")', () => {
    expect(isDocTooLargeError({
      code: 'invalid-argument',
      message: 'The value of property "teams" is longer than 1048487 bytes.',
    })).toBe(true)
  })

  it('does NOT fire for other invalid-argument rejections', () => {
    // Same code, unrelated cause — must not show the size banner.
    expect(isDocTooLargeError({
      code: 'invalid-argument',
      message: 'Unsupported field value: undefined (found in field player.name)',
    })).toBe(false)
  })

  it('does NOT fire for permission-denied', () => {
    expect(isDocTooLargeError({
      code: 'permission-denied',
      message: 'Missing or insufficient permissions.',
    })).toBe(false)
  })

  it('does NOT fire for network-flavored failures or empty input', () => {
    expect(isDocTooLargeError({ code: 'unavailable', message: 'The service is currently unavailable.' })).toBe(false)
    expect(isDocTooLargeError(null)).toBe(false)
    expect(isDocTooLargeError(undefined)).toBe(false)
    expect(isDocTooLargeError({})).toBe(false)
  })
})
