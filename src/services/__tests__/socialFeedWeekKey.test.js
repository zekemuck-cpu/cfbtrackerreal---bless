import { describe, it, expect, vi, beforeEach } from 'vitest'

// A postseason game's week is a string sentinel ('Bowl', 'CCG', 'Bowl 1'-4
// for CFP rounds) — GameSocialModal.jsx reads game.week verbatim for exactly
// that reason. The social-feed storage layer used to run Number(week),
// which is NaN for any of those: every bowl/CCG/CFP game's posts saved
// successfully but under a doc keyed by nothing any reader ever looked up
// again (the write succeeded; sanitizeForFirestore coerced the NaN field to
// null, and buildSocialFeedMap's old Number(data.week) check read that back
// as week 0 — filing posts from every non-numeric-week game into one silent
// black hole). Confirmed on a real dynasty: a bowl game's recap/graphic
// (stored directly on the game record) survived a sync; its social posts,
// stored week-keyed, did not.

vi.mock('../../config/firebase', () => ({ db: {}, auth: {}, storage: {} }))

vi.mock('firebase/firestore', () => {
  const names = [
    'collection', 'doc', 'getDoc', 'getDocFromServer', 'getDocs',
    'getDocsFromCache', 'getDocsFromServer', 'addDoc', 'updateDoc',
    'deleteDoc', 'setDoc', 'writeBatch', 'query', 'where', 'onSnapshot',
    'serverTimestamp', 'deleteField', 'arrayUnion', 'arrayRemove',
    'waitForPendingWrites', 'getCountFromServer', 'orderBy', 'startAfter',
    'limit', 'documentId',
  ]
  return Object.fromEntries(names.map((n) => [n, vi.fn()]))
})

const { socialFeedDocId, buildSocialFeedMap } = await import('../dynastyService')

describe('socialFeedDocId', () => {
  it('preserves a string sentinel week exactly', () => {
    expect(socialFeedDocId(2026, 'Bowl')).toBe('2026-Bowl')
    expect(socialFeedDocId(2026, 'CCG')).toBe('2026-CCG')
    expect(socialFeedDocId(2026, 'Bowl 1')).toBe('2026-Bowl 1')
  })

  it('produces the same doc id as before for a numeric week (no migration needed for regular-season games)', () => {
    expect(socialFeedDocId(2026, 5)).toBe('2026-5')
  })

  it('never produces the broken "-NaN" suffix for a real sentinel', () => {
    expect(socialFeedDocId(2026, 'Bowl')).not.toMatch(/-NaN$/)
  })
})

describe('buildSocialFeedMap', () => {
  const docOf = (id, data) => ({ id, data: () => data })

  it('indexes a string-sentinel week doc under that exact string key', () => {
    const out = buildSocialFeedMap([
      docOf('2026-Bowl', { year: 2026, week: 'Bowl', posts: [{ id: 'p1' }] }),
    ])
    expect(out[2026]['Bowl']).toEqual([{ id: 'p1' }])
  })

  it('indexes a numeric week doc under that number (unchanged behavior)', () => {
    const out = buildSocialFeedMap([
      docOf('2026-5', { year: 2026, week: 5, posts: [{ id: 'p1' }] }),
    ])
    expect(out[2026][5]).toEqual([{ id: 'p1' }])
  })

  it('does not drop a legitimate week 0 (preseason) doc', () => {
    const out = buildSocialFeedMap([
      docOf('2026-0', { year: 2026, week: 0, posts: [{ id: 'p1' }] }),
    ])
    expect(out[2026][0]).toEqual([{ id: 'p1' }])
  })

  it('skips a doc with no usable week (null/missing) rather than mis-filing it under week 0', () => {
    const out = buildSocialFeedMap([
      docOf('2026-NaN', { year: 2026, week: null, posts: [{ id: 'orphaned' }] }),
    ])
    expect(out[2026]).toBeUndefined()
  })

  it('skips a doc with an unresolvable year', () => {
    const out = buildSocialFeedMap([
      docOf('bad', { year: 'not-a-year', week: 5, posts: [{ id: 'p1' }] }),
    ])
    expect(out).toEqual({})
  })
})
