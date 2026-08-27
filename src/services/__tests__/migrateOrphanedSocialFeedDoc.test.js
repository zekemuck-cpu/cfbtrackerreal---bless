import { describe, it, expect, vi, beforeEach } from 'vitest'

// Recovers posts trapped by the Number(week) bug (see socialFeedWeekKey.test.js
// for the root-cause writeup). The posts themselves are intact in the
// orphaned "{year}-NaN" doc — this just needs to re-file each one under its
// owning game's real week, using the post's own gameId (never affected by
// the bug) to find it.

vi.mock('../../config/firebase', () => ({ db: {}, auth: {}, storage: {} }))

const state = {
  orphanedDocs: [],       // what getDocsFromServer(the socialFeed collection) returns
  existingTargetDocs: {}, // path -> { exists: boolean, data: {...} }
  writes: [],             // { ref: {path}, data } from batch.set
  deletes: [],            // ref.path from batch.delete
}

function fakeRef(path) {
  return { path, id: path.split('/').pop() }
}

vi.mock('firebase/firestore', () => {
  const collection = (_db, ...segments) => fakeRef(segments.join('/'))
  const doc = (_db, ...segments) => fakeRef(segments.join('/'))
  const getDocsFromServer = vi.fn(async (ref) => {
    if (ref.path.endsWith('/socialFeed')) {
      return { docs: state.orphanedDocs.map(d => ({ id: d.id, ref: fakeRef(`${ref.path}/${d.id}`), data: () => d.data })) }
    }
    return { docs: [] }
  })
  const getDoc = vi.fn(async (ref) => {
    const existing = state.existingTargetDocs[ref.path]
    return {
      exists: () => !!existing,
      data: () => existing?.data,
    }
  })
  const writeBatch = vi.fn(() => ({
    set: (ref, data) => { state.writes.push({ path: ref.path, data }) },
    delete: (ref) => { state.deletes.push(ref.path) },
    update: () => {},
    commit: async () => {},
  }))
  const noop = vi.fn(async () => {})
  return {
    collection, doc, getDoc, getDocsFromServer, writeBatch,
    getDocFromServer: noop, getDocs: noop, getDocsFromCache: noop,
    addDoc: noop, updateDoc: noop, deleteDoc: noop, setDoc: noop,
    query: vi.fn(), where: vi.fn(), onSnapshot: vi.fn(),
    serverTimestamp: vi.fn(), deleteField: vi.fn(() => '__deleteField__'),
    arrayUnion: vi.fn(), arrayRemove: vi.fn(), waitForPendingWrites: noop,
    getCountFromServer: noop, orderBy: vi.fn(), startAfter: vi.fn(),
    limit: vi.fn(), documentId: vi.fn(),
  }
})

const { migrateOrphanedSocialFeedDoc } = await import('../dynastyService')

const GAME_BOWL = { id: 'game-bowl', week: 'Bowl', year: 2026 }
const GAME_CCG = { id: 'game-ccg', week: 'CCG', year: 2026 }

beforeEach(() => {
  state.orphanedDocs = []
  state.existingTargetDocs = {}
  state.writes = []
  state.deletes = []
})

describe('migrateOrphanedSocialFeedDoc', () => {
  it('does nothing when there is no orphaned doc', async () => {
    state.orphanedDocs = []
    const result = await migrateOrphanedSocialFeedDoc('dyn-1', [GAME_BOWL])
    expect(result).toEqual({ migrated: 0 })
    expect(state.writes).toHaveLength(0)
  })

  it('re-files posts from two different games under their own correct docs, then clears the orphan', async () => {
    state.orphanedDocs = [{
      id: '2026-NaN',
      data: {
        year: 2026,
        week: null,
        posts: [
          { id: 'p-bowl-1', gameId: 'game-bowl', text: 'bowl post' },
          { id: 'p-ccg-1', gameId: 'game-ccg', text: 'ccg post' },
        ],
      },
    }]

    const result = await migrateOrphanedSocialFeedDoc('dyn-1', [GAME_BOWL, GAME_CCG])

    expect(result.migrated).toBe(2)
    const bowlWrite = state.writes.find(w => w.path.endsWith('/2026-Bowl'))
    const ccgWrite = state.writes.find(w => w.path.endsWith('/2026-CCG'))
    expect(bowlWrite.data.posts).toEqual([{ id: 'p-bowl-1', gameId: 'game-bowl', text: 'bowl post' }])
    expect(ccgWrite.data.posts).toEqual([{ id: 'p-ccg-1', gameId: 'game-ccg', text: 'ccg post' }])
    // Every post found a home — the orphan is safe to delete.
    expect(state.deletes).toContain('dynasties/dyn-1/socialFeed/2026-NaN')
  })

  it('merges recovered posts with whatever already correctly lives at the target doc, deduped by post id', async () => {
    state.orphanedDocs = [{
      id: '2026-NaN',
      data: { year: 2026, week: null, posts: [{ id: 'p-new', gameId: 'game-bowl', text: 'recovered' }] },
    }]
    state.existingTargetDocs['dynasties/dyn-1/socialFeed/2026-Bowl'] = {
      data: { posts: [{ id: 'p-existing', gameId: 'game-bowl', text: 'already there' }] },
    }

    await migrateOrphanedSocialFeedDoc('dyn-1', [GAME_BOWL])

    const bowlWrite = state.writes.find(w => w.path.endsWith('/2026-Bowl'))
    expect(bowlWrite.data.posts.map(p => p.id).sort()).toEqual(['p-existing', 'p-new'])
  })

  it('leaves the orphan doc uncleared when a post belongs to a game that no longer exists', async () => {
    state.orphanedDocs = [{
      id: '2026-NaN',
      data: {
        year: 2026,
        week: null,
        posts: [{ id: 'p-orphaned', gameId: 'deleted-game', text: 'no home for this one' }],
      },
    }]

    const result = await migrateOrphanedSocialFeedDoc('dyn-1', [GAME_BOWL]) // deleted-game not in the list

    expect(result.migrated).toBe(0)
    expect(state.writes).toHaveLength(0)
    // Must NOT delete — this doc still holds the only copy of that post.
    expect(state.deletes).toHaveLength(0)
  })
})
