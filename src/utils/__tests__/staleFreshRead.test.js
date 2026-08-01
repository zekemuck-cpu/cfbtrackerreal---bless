import { describe, it, expect } from 'vitest'

// Mirror of isStaleFreshRead in DynastyContext.jsx. That guard decides whether
// a background server read's payload should be DISCARDED because it predates
// our own local write — the rule that stops a just-added recruit from being
// wiped by a slow read that started before the save.
const RECENT_WRITE_PROTECTION_MS = 20000
const isStaleFreshRead = (dynastyId, meta, tsRef, idRef) => {
  if (idRef.current !== dynastyId) return false
  const lastWrite = tsRef.current || 0
  if (!lastWrite) return false
  if (meta?.requestedAt != null) return meta.requestedAt <= lastWrite
  return Date.now() - lastWrite < RECENT_WRITE_PROTECTION_MS
}

const refs = (id, ts) => ({ idRef: { current: id }, tsRef: { current: ts } })

describe('isStaleFreshRead', () => {
  it('discards a read that STARTED before the local write, however late it lands', () => {
    // The exact recruit-vanishing case: read starts, user saves, read returns
    // 60s later carrying pre-save data. Elapsed time is irrelevant.
    const { idRef, tsRef } = refs('d1', 1_000_000)
    const meta = { requestedAt: 999_000 } // read began 1s BEFORE the write
    expect(isStaleFreshRead('d1', meta, tsRef, idRef)).toBe(true)
  })

  it('accepts a read that started after the local write', () => {
    const { idRef, tsRef } = refs('d1', 1_000_000)
    const meta = { requestedAt: 1_000_001 }
    expect(isStaleFreshRead('d1', meta, tsRef, idRef)).toBe(false)
  })

  it('treats a read started at the same instant as the write as stale', () => {
    // Can't prove it contains the write, so don't gamble the user's data.
    const { idRef, tsRef } = refs('d1', 1_000_000)
    expect(isStaleFreshRead('d1', { requestedAt: 1_000_000 }, tsRef, idRef)).toBe(true)
  })

  it('ignores writes belonging to a DIFFERENT dynasty', () => {
    const { idRef, tsRef } = refs('other', Date.now())
    expect(isStaleFreshRead('d1', { requestedAt: 0 }, tsRef, idRef)).toBe(false)
  })

  it('never blocks when there has been no local write at all', () => {
    const { idRef, tsRef } = refs('d1', 0)
    expect(isStaleFreshRead('d1', { requestedAt: 0 }, tsRef, idRef)).toBe(false)
  })

  it('falls back to the elapsed-time window for unstamped callers', () => {
    const now = Date.now()
    const fresh = refs('d1', now - 1000) // wrote 1s ago
    expect(isStaleFreshRead('d1', undefined, fresh.tsRef, fresh.idRef)).toBe(true)
    const old = refs('d1', now - (RECENT_WRITE_PROTECTION_MS + 1000))
    expect(isStaleFreshRead('d1', undefined, old.tsRef, old.idRef)).toBe(false)
  })
})
