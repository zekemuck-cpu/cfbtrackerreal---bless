// settleOrProceed — stop the UI from hanging forever on a Firestore write that
// never gets a server acknowledgement.
//
// The app initializes Firestore with `persistentLocalCache` (see
// src/config/firebase.js), which means every write is durably persisted to the
// local IndexedDB cache the moment it's issued, and the SDK keeps retrying
// delivery to the server on its own until it succeeds — even across reloads.
// The promise returned by `setDoc` / `updateDoc` / `batch.commit()`, however,
// only resolves on the SERVER ack. When the long-poll WebChannel connection
// wedges (a known failure mode on flaky networks, proxies/VPNs, or when a
// second tab holds the single-tab persistence lease), that ack never arrives,
// so an `await`-ing save spins its "Saving…"/"Importing…" UI forever and only a
// page refresh (which re-establishes the connection) clears it.
//
// Because the write is already durable locally and WILL sync, it's safe to stop
// AWAITING the server ack after a grace period and let the caller proceed with
// its optimistic local-state update. The write completes in the background.
//
// A write that REJECTS quickly (permission-denied, validation) still rejects
// before the timeout, so genuine errors continue to surface to the caller's
// catch — this only short-circuits the "pending forever" case.
import { trackWriteBegin, trackWriteResolved, trackWriteFailed } from './cloudSyncStatus'

export function settleOrProceed(promise, ms = 10000, label = 'write') {
  const p = Promise.resolve(promise)
  // Report this write to the sync-status store so a wedged connection (an ack
  // that never arrives) surfaces as a visible "not synced to cloud" banner
  // instead of silently diverging. Resolution = the server actually acked;
  // rejection = a genuine error. This .then also serves as the terminal handler
  // so a rejection that lands AFTER we've proceeded on timeout never becomes an
  // unhandledrejection.
  const writeId = trackWriteBegin(label)
  p.then(
    () => trackWriteResolved(writeId),
    (err) => trackWriteFailed(writeId, err),
  )
  let timer
  return Promise.race([
    p.then((v) => { clearTimeout(timer); return v }),
    new Promise((resolve) => {
      timer = setTimeout(() => {
        console.warn(
          `[save] "${label}" was not confirmed by the server within ${ms}ms — ` +
          `continuing anyway. Your changes are saved locally and will sync when ` +
          `the connection recovers.`
        )
        resolve(undefined)
      }, ms)
    }),
  ])
}
