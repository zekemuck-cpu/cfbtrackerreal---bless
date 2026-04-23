import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Stale-chunk recovery: when Vercel redeploys, the hashed asset filenames
// change. A tab left open on the old build will try to lazy-load chunks
// that no longer exist, get Vercel's SPA fallback (index.html) back instead
// of JS, and the browser rejects it as "Failed to fetch dynamically
// imported module". Detect that and force a hard reload — the user gets
// the new build and their next navigation works. A short-lived
// sessionStorage flag prevents reload loops if the error fires again.
const CHUNK_RELOAD_KEY = 'chunk-reload-at'
function shouldReloadForStaleChunk() {
  const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0)
  if (Date.now() - last < 10_000) return false
  sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
  return true
}
function isStaleChunkError(err) {
  const msg = err?.message || err?.reason?.message || ''
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('Unable to preload CSS')
  )
}
window.addEventListener('vite:preloadError', () => {
  if (shouldReloadForStaleChunk()) window.location.reload()
})
window.addEventListener('unhandledrejection', (e) => {
  if (isStaleChunkError(e) && shouldReloadForStaleChunk()) window.location.reload()
})
window.addEventListener('error', (e) => {
  if (isStaleChunkError(e) && shouldReloadForStaleChunk()) window.location.reload()
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
