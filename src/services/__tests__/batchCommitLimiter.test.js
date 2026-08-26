import { describe, it, expect, vi } from 'vitest'

// dynastyService pulls in the real Firebase app at import time; none of it is
// needed to exercise the commit limiter, so every module it reaches for is
// stubbed. Only commitBatch is under test.
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
  return Object.fromEntries(names.map((n) => [n, () => {}]))
})

const { commitBatch } = await import('../dynastyService')

// A fake WriteBatch whose commit() resolves only when the test says so, so we
// can observe exactly how many are in flight at once.
function deferredBatch(tracker) {
  let settle
  const promise = new Promise((resolve, reject) => { settle = { resolve, reject } })
  return {
    settle,
    commit: () => {
      tracker.inFlight++
      tracker.peak = Math.max(tracker.peak, tracker.inFlight)
      return promise.finally(() => { tracker.inFlight-- })
    },
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('commitBatch concurrency limiter', () => {
  it('never runs more than 3 commits at once and still runs them all', async () => {
    const tracker = { inFlight: 0, peak: 0 }
    const batches = Array.from({ length: 12 }, () => deferredBatch(tracker))
    const all = Promise.all(batches.map((b) => commitBatch(b)))

    await flush()
    expect(tracker.peak).toBe(3)

    // Release them one at a time; each release must let exactly one queued
    // commit start, never a burst.
    for (const b of batches) {
      b.settle.resolve('ok')
      await flush()
      expect(tracker.inFlight).toBeLessThanOrEqual(3)
    }

    await expect(all).resolves.toHaveLength(12)
    expect(tracker.peak).toBe(3)
  })

  it('runs a lone commit immediately without queueing', async () => {
    const tracker = { inFlight: 0, peak: 0 }
    const b = deferredBatch(tracker)
    const p = commitBatch(b)
    await flush()
    expect(tracker.inFlight).toBe(1)
    b.settle.resolve('done')
    await expect(p).resolves.toBe('done')
  })

  it('releases the slot when a commit rejects, so the queue keeps draining', async () => {
    const tracker = { inFlight: 0, peak: 0 }
    const batches = Array.from({ length: 5 }, () => deferredBatch(tracker))
    const results = batches.map((b) => commitBatch(b).then(() => 'ok', () => 'failed'))

    await flush()
    // Fail every one of the first three; a leaked slot here would deadlock
    // the remaining two forever.
    batches[0].settle.reject(new Error('boom'))
    batches[1].settle.reject(new Error('boom'))
    batches[2].settle.reject(new Error('boom'))
    await flush()

    batches[3].settle.resolve('ok')
    batches[4].settle.resolve('ok')
    await expect(Promise.all(results)).resolves.toEqual(['failed', 'failed', 'failed', 'ok', 'ok'])
  })

  it('rejects the caller with the underlying error rather than swallowing it', async () => {
    const tracker = { inFlight: 0, peak: 0 }
    const b = deferredBatch(tracker)
    const p = commitBatch(b)
    await flush()
    b.settle.reject(new Error('write stream exhausted'))
    await expect(p).rejects.toThrow('write stream exhausted')
  })
})
