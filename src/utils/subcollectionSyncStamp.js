/**
 * Per-dynasty, per-subcollection "last fully synced" stamps, persisted in
 * localStorage so they survive page refreshes (the in-memory rev gate in
 * DynastyContext doesn't).
 *
 * Cost rationale: every subcollection getter is cache-first but, when given
 * an onFresh callback, ALSO fires a billed getDocsFromServer over the whole
 * collection — ~500 reads for players alone on a big dynasty, on every
 * refresh and dynasty open, even when nothing changed. Every cloud write
 * bumps the main doc's lastModified (that is already the app's cross-device
 * sync trigger — see bumpDynastyLastModifiedInBatch), so when the main
 * doc's rev equals the stamp we recorded after our last completed server
 * read, the server has nothing newer and the re-read can be skipped
 * entirely. Freshness is unchanged: any remote write bumps the rev, the
 * stamps stop matching, and the next load re-reads from the server.
 *
 * Stamps are only written from onFresh (i.e. after a server read actually
 * completed), so a failed background fetch can never mark a collection as
 * synced.
 */

const STORAGE_KEY = 'subcollectionSyncStamps'

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeAll(stamps) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stamps))
  } catch {
    // Storage unavailable (private mode, quota) — gating simply stays off.
  }
}

export function getSyncStamp(dynastyId, collectionName) {
  return readAll()[`${dynastyId}:${collectionName}`] ?? null
}

export function setSyncStamp(dynastyId, collectionName, rev) {
  const stamps = readAll()
  stamps[`${dynastyId}:${collectionName}`] = rev
  writeAll(stamps)
}
