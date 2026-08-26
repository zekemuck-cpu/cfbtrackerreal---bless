import { isDocTooLargeError } from './firestoreErrors'

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

// BOTH code and message. This used to be `err.code || err.message`, which
// returned 'invalid-argument' and discarded the message — but the message is
// the only part that says WHICH limit was hit ('too many index entries for
// entity', 'exceeds the maximum allowed size', 'entity is too big'), and it's
// also where updateDynasty's payload audit appends the offending field paths.
// A user screenshotted this banner reading a bare 'invalid-argument' while the
// message underneath held the actual answer.
function errText(err) {
  if (!err) return 'unknown error'
  const code = err.code ? String(err.code) : ''
  const msg = err.message ? String(err.message) : ''
  if (code && msg) return msg.includes(code) ? msg : `${code}: ${msg}`
  return code || msg || String(err)
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
  // A server-acked write proves the doc is writable again — clear any sticky
  // rejection state (e.g. doc-too-large after the user ran the subcollection
  // migration) so its banner dismisses itself exactly when the problem is
  // actually fixed, not on a timer.
  if (lastError) lastError = null
  emit()
}

// The write rejected (permission-denied, oversized doc, etc.) — a real error.
// Unlike the suppressed stalled-ack signal (which false-positives on wedged
// but-still-syncing connections), a rejection is definitive: the server
// refused the write and the data is NOT in the cloud. docTooLarge marks the
// one rejection class with a specific user remedy (Danger Zone → Migrate to
// Subcollections); CloudSyncBanner renders it loudly.
export function trackWriteFailed(id, err) {
  const e = inflight.get(id)
  if (e && e.timer) clearTimeout(e.timer)
  inflight.delete(id)
  // Loud by design. A rejection can land AFTER settleOrProceed's grace
  // released the caller — the save already reported success, so this line
  // is the only trace of why the data silently reverted. A real field
  // report ("sync works, then ~30s later everything snaps back to
  // preseason") was exactly this: the rejection arrived late, was recorded
  // here, and nothing rendered or logged it.
  console.error(`[cloudSync] write REJECTED by server${e?.label ? ` (${e.label})` : ''}:`, err)
  lastError = { message: errText(err), label: e?.label || null, at: Date.now(), docTooLarge: isDocTooLargeError(err) }
  emit()
}
