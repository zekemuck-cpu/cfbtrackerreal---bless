import { describe, it, expect, vi, beforeEach } from 'vitest'

// This is the safety net for the exact production incident that drove the
// team-shard migration: a dynasty's seasons/{year} doc was already over
// Firestore's 1 MiB cap (per-team-year data for a full ~130+ team league,
// predating sharding). The one-time background migration (run on dynasty
// load) usually beats a later save to shrinking it, but there's no
// ordering guarantee between "page finished loading" and "a save fired
// first" — a user could hit Sync from Save before the migration lands.
// Without this retry, that save would fail with the same opaque
// "exceeds the maximum allowed size" rejection all over again, forcing
// exactly the "wait, then try again" back-and-forth the fix exists to
// avoid. writeSeasonalUpdate must instead self-heal inline: catch the
// too-large rejection, run the migration itself, and retry once.

vi.mock('../../config/firebase', () => ({ db: {}, auth: {}, storage: {} }))

const TOO_LARGE = Object.assign(
  new Error('Document cannot be written because its size (1,049,245 bytes) exceeds the maximum allowed size of 1,048,576 bytes.'),
  { code: 'invalid-argument' },
)

let commitImpl // (callNumber) => throws or resolves; set per-test
let commitCallCount

function fakeRef(path) {
  const segments = path.split('/')
  return { id: segments[segments.length - 1], path }
}

vi.mock('firebase/firestore', () => {
  const collection = (_db, ...segments) => ({ __path: segments.join('/') })
  const doc = (_db, ...segments) => fakeRef(segments.join('/'))
  const writeBatch = vi.fn(() => ({
    set: () => {},
    update: () => {},
    commit: async () => {
      commitCallCount += 1
      commitImpl(commitCallCount)
    },
  }))
  const getDocsFromServer = vi.fn(async (ref) => {
    if (String(ref.__path).endsWith('/seasons')) {
      // ONE pre-sharding season doc still carrying embedded per-team-year
      // data — the exact shape a dynasty that's never run the migration has.
      return { docs: [{ id: '2026', data: () => ({ year: 2026, schedulesByTeam: { '10': [{ week: 1, opponent: 'AAA' }] } }) }] }
    }
    if (String(ref.__path).includes('/teamShards')) {
      return { docs: [] } // no shards written yet for this year
    }
    return { docs: [] }
  })
  const getDocsFromCache = vi.fn(async () => ({ empty: true, docs: [] }))
  const getDocs = vi.fn(async () => ({ docs: [] }))
  const getDocFromServer = vi.fn(async (ref) => ({
    exists: () => true,
    data: () => ({ schedulesByTeam: { '10': [{ week: 1, opponent: 'AAA' }] } }),
    id: ref.id,
  }))
  const updateDoc = vi.fn(async () => {})
  const setDoc = vi.fn(async () => {})
  const deleteField = () => '__deleteField__'
  const waitForPendingWrites = vi.fn(async () => {})

  return {
    collection, doc, writeBatch, getDocsFromServer, getDocsFromCache, getDocs,
    getDocFromServer, getDoc: getDocFromServer, updateDoc, setDoc, deleteField,
    waitForPendingWrites,
  }
})

const { writeSeasonalUpdate } = await import('../seasonSubcollection')

beforeEach(() => {
  commitCallCount = 0
  commitImpl = () => {} // default: every commit succeeds
})

describe('writeSeasonalUpdate self-heals a too-large season doc', () => {
  it('retries once after running the team-shard migration, instead of surfacing the rejection', async () => {
    // Only the FIRST commit (writeSeasonalUpdate's own write) is rejected;
    // the migration's shard write and the retried write both succeed.
    commitImpl = (n) => { if (n === 1) throw TOO_LARGE }

    const byYear = { 2026: { allAmericans: ['player-a'] } }
    await expect(writeSeasonalUpdate('dyn-1', byYear)).resolves.toEqual(['2026'])
    // More than one commit proves the self-heal path actually ran (the
    // rejected attempt, the migration's own write, and the retry) rather
    // than the save just happening to succeed on its own.
    expect(commitCallCount).toBeGreaterThan(1)
  })

  it('still propagates a genuine too-large rejection if retrying does not help', async () => {
    // Every commit fails, forever — simulates "ran the migration but
    // something is still wrong" so the caller isn't left in a silent loop.
    commitImpl = () => { throw TOO_LARGE }
    await expect(writeSeasonalUpdate('dyn-1', { 2026: { allAmericans: ['x'] } })).rejects.toThrow(/exceeds the maximum/)
  })

  it('does not intercept an unrelated write failure', async () => {
    commitImpl = () => { throw new Error('permission-denied') }
    await expect(writeSeasonalUpdate('dyn-1', { 2026: { allAmericans: ['x'] } })).rejects.toThrow('permission-denied')
    // No self-heal attempted — the only commit is the original rejected one.
    expect(commitCallCount).toBe(1)
  })
})
