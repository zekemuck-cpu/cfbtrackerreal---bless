import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Stale-chunk recovery: helpers live in utils/chunkReload.js (shared with
// RouteErrorBoundary, which catches lazy-route failures React-side). The
// probe-before-reload behavior is unchanged: 404/HTML → genuine stale,
// reload; anything else → transient, log and continue.
import { reloadIfStale, extractUrlFromError, isStaleChunkError } from './utils/chunkReload'

window.addEventListener('vite:preloadError', (event) => {
  // Vite gives us the URL directly on the event payload.
  reloadIfStale(event?.payload)
})
function isFirestoreInternalAssertion(e) {
  const msg = e?.reason?.message || e?.message || ''
  // Known non-fatal Firestore SDK race: transaction aborted then retry timer fires
  // into already-cleaned-up state. The SDK recovers on its own.
  return msg.includes('INTERNAL ASSERTION FAILED') && msg.includes('b815')
}

window.addEventListener('unhandledrejection', (e) => {
  if (isFirestoreInternalAssertion(e)) { e.preventDefault(); return }
  if (isStaleChunkError(e)) reloadIfStale(extractUrlFromError(e?.reason || e))
})
window.addEventListener('error', (e) => {
  if (isStaleChunkError(e)) reloadIfStale(extractUrlFromError(e?.error || e))
})

// Ask the browser to make our storage PERSISTENT so it isn't evicted as
// "best-effort" data. Without this, IndexedDB (where free/local dynasties live)
// can be silently cleared by the browser under storage pressure or by Safari/iOS
// tracking-prevention eviction — which is how a "local" save can vanish between
// sessions. Best-effort and non-blocking; failure is fine (some browsers ignore
// it, and it can't undo an already-persisted grant).
async function requestPersistentStorage() {
  try {
    if (!navigator.storage?.persist) return
    if (await navigator.storage.persisted()) return
    const granted = await navigator.storage.persist()
    console.log(`[storage] persistent storage ${granted ? 'granted' : 'not granted'}`)
  } catch (e) {
    console.warn('[storage] persist request failed:', e)
  }
}
requestPersistentStorage()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
