// cloudSyncStatus — a tiny observable store of Firestore write-sync health.
//
// The app writes through settleOrProceed (see firestoreWriteGuard.js), which
// stops AWAITING the server ack after a grace period so the UI never hangs.
// The catch: with persistentLocalCache a write is durable on THIS device the
// moment it's issued, so a save "succeeds" locally even when the sync
// connection is wedged (VPN/proxy, flaky network, or a second tab holding the
// single-tab persistence lease) and nothing ever reaches the cloud. That
// divergence used to be completely silent — a device could pile up unsynced
// edits while other devices (and the server) stayed on old data.
//
// This store makes it visible. settleOrProceed reports every cloud write here;
// a write that hasn't been server-acked within STALLED_MS is flagged "stalled"
// and a banner (CloudSyncBanner) surfaces it. When the ack finally lands (the
// connection recovers) the write clears and the banner disappears.

// A write is "stalled" for banner purposes only after this long without a
// server ack — deliberately longer than settleOrProceed's UI-proceed timeout so
// a merely-slow-but-working save on a poor connection doesn't cry wolf.
const STALLED_MS = 20000

let nextId = 1
const inflight = new Map() // id -> { label, startedAt, stalled, timer }
let lastError = null // { message, at } — last hard write rejection
const listeners = new Set()

function snapshot() {
  let stalledCount = 0
  let oldestStalledAt = null
  for (const w of inflight.values()) {
    if (!w.stalled) continue
    stalledCount++
    if (oldestStalledAt == null || w.startedAt < oldestStalledAt) oldestStalledAt = w.startedAt
  }
  return { stalled: stalledCount > 0, stalledCount, oldestStalledAt, lastError }
}

let lastPublic = snapshot()
function emit() {
  const s = snapshot()
  // Only notify when the user-visible shape actually changes — a fast write
  // resolving shouldn't churn the banner or re-render subscribers.
  if (
    lastPublic &&
    s.stalled === lastPublic.stalled &&
    s.stalledCount === lastPublic.stalledCount &&
    s.lastError === lastPublic.lastError
  ) {
    return
  }
  lastPublic = s
  for (const cb of listeners) {
    try { cb(s) } catch { /* a bad subscriber must not break the store */ }
  }
}

export function subscribeSyncStatus(cb) {
  listeners.add(cb)
  cb(snapshot())
  return () => listeners.delete(cb)
}

export function getSyncStatus() {
  return snapshot()
}

function errText(err) {
  if (!err) return 'unknown error'
  return err.code || err.message || String(err)
}

// ── Called by settleOrProceed ────────────────────────────────────────────────

// Begin tracking one cloud write. Returns an id to resolve/fail it with.
export function trackWriteBegin(label = 'write') {
  const id = nextId++
  const entry = { label, startedAt: Date.now(), stalled: false, timer: null }
  entry.timer = setTimeout(() => {
    entry.stalled = true
    entry.timer = null
    emit()
  }, STALLED_MS)
  inflight.set(id, entry)
  return id
}

// The write reached the server (ack landed) — even if it had gone stalled first.
export function trackWriteResolved(id) {
  const e = inflight.get(id)
  if (!e) return
  if (e.timer) clearTimeout(e.timer)
  inflight.delete(id)
  emit()
}

// The write rejected (permission-denied, oversized doc, etc.) — a real error.
export function trackWriteFailed(id, err) {
  const e = inflight.get(id)
  if (e && e.timer) clearTimeout(e.timer)
  inflight.delete(id)
  lastError = { message: errText(err), at: Date.now() }
  emit()
}
