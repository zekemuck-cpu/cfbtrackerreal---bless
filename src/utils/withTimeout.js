// withTimeout — reject a promise that never settles within `ms`.
//
// Unlike settleOrProceed (which resolves optimistically because a wedged
// Firestore write is already durable in persistentLocalCache and WILL sync),
// this REJECTS on timeout. Use it for operations where a hang means the work
// genuinely did NOT happen and there is no background retry — chiefly the
// IndexedDB (localforage) reads/writes on the free/local storage tier.
//
// The classic wedge is a SECOND browser tab holding the IndexedDB connection
// (or a blocked version upgrade): localforage's getItem/setItem then never
// settle, and any UI awaiting the save spins its "Saving…"/"Importing…"
// spinner forever — a hard refresh of the current tab can't clear it while the
// other tab still holds the lock. Rejecting after a grace period lets the
// caller's catch surface a real, actionable error and release the spinner.
export function withTimeout(promise, ms = 10000, label = 'operation') {
  let timer
  return Promise.race([
    Promise.resolve(promise).then(
      (v) => { clearTimeout(timer); return v },
      (err) => { clearTimeout(timer); throw err },
    ),
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(
          `${label} timed out after ${ms}ms. Local storage may be locked by ` +
          `another open tab of Dynasty Tracker — close other tabs and try again.`
        ))
      }, ms)
    }),
  ])
}
