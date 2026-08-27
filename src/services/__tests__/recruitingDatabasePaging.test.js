import { describe, it, expect, vi, beforeEach } from 'vitest'

// getRecruitingDatabaseSubcollection used to fetch the WHOLE national
// recruiting board in one unbounded getDocs() call, racing a fixed 15s
// timeout. That's the same shape players/games already needed paging for
// (a large-enough collection can legitimately take longer than 15s to
// return in a single round trip) — reported as a RECURRING timeout on a
// real dynasty, not an occasional network blip. This fetches in bounded
// pages instead, same pattern as getPlayersSubcollection.

vi.mock('../../config/firebase', () => ({ db: {}, auth: {}, storage: {} }))

let serverCallCount

vi.mock('firebase/firestore', () => {
  const collection = () => ({ __col: true })
  const query = () => ({ __query: true })
  const orderBy = vi.fn()
  const startAfter = vi.fn()
  const limit = vi.fn()
  const documentId = vi.fn()
  const getCountFromServer = vi.fn(async () => ({ data: () => ({ count: 250 }) }))
  const getDocsFromServer = vi.fn(async () => {
    serverCallCount += 1
    if (serverCallCount === 1) {
      return { empty: false, docs: Array.from({ length: 200 }, (_, i) => ({ id: `p${i}`, data: () => ({ pid: `p${i}` }) })) }
    }
    return { empty: false, docs: Array.from({ length: 50 }, (_, i) => ({ id: `p${200 + i}`, data: () => ({ pid: `p${200 + i}` }) })) }
  })
  const getDocsFromCache = vi.fn(async () => ({ empty: true, docs: [] }))
  const getDocs = vi.fn(async () => ({ docs: [] }))
  const noop = vi.fn(async () => {})
  return {
    collection, query, orderBy, startAfter, limit, documentId,
    getCountFromServer, getDocsFromServer, getDocsFromCache, getDocs,
    doc: vi.fn(), getDoc: noop, getDocFromServer: noop, addDoc: noop,
    updateDoc: noop, deleteDoc: noop, setDoc: noop, writeBatch: vi.fn(),
    where: vi.fn(), onSnapshot: vi.fn(), serverTimestamp: vi.fn(),
    deleteField: vi.fn(), arrayUnion: vi.fn(), arrayRemove: vi.fn(),
    waitForPendingWrites: noop,
  }
})

const { getRecruitingDatabaseSubcollection } = await import('../dynastyService')

beforeEach(() => { serverCallCount = 0 })

describe('getRecruitingDatabaseSubcollection', () => {
  it('fetches a large board across multiple bounded pages instead of one unbounded call', async () => {
    const result = await getRecruitingDatabaseSubcollection('dyn-1')
    expect(result).toHaveLength(250)
    // Two server round trips (200 + 50), each individually well inside any
    // fixed timeout, instead of one call trying to move all 250 at once.
    expect(serverCallCount).toBe(2)
  })

  it('returns every recruit across pages, not just the first page', async () => {
    const result = await getRecruitingDatabaseSubcollection('dyn-1')
    const pids = result.map(r => r.pid)
    expect(pids).toContain('p0')
    expect(pids).toContain('p199')
    expect(pids).toContain('p249')
  })
})
