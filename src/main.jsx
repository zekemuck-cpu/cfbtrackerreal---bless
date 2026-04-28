import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Stale-chunk recovery: when Vercel redeploys, the hashed asset filenames
// change. A tab left open on the old build tries to lazy-load chunks
// that no longer exist; the browser either gets a 404 or Vercel's SPA
// fallback (index.html) back, and dynamic import rejects with
// "Failed to fetch dynamically imported module".
//
// The previous version of this handler reloaded on ANY chunk-load
// failure, which spuriously reloaded the page on transient network
// blips (e.g. clicking into a dynasty when wifi flickered for 100ms).
// We now probe the failing URL before reloading: 404 or HTML response
// → genuine stale, reload; anything else → transient, log and continue.
//
// A short-lived sessionStorage flag prevents reload loops if a probe
// somehow says "stale" repeatedly without actually fixing on reload.
const CHUNK_RELOAD_KEY = 'chunk-reload-at'
function recentlyReloaded() {
  const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0)
  return Date.now() - last < 10_000
}
function markReloaded() {
  sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
}

// Pull the URL out of a thrown chunk-load error. Vite formats these
// as: "Failed to fetch dynamically imported module: https://.../foo.js"
function extractUrlFromError(err) {
  const msg = err?.message || err?.reason?.message || err?.error?.message || ''
  const match = msg.match(/https?:\/\/[^\s)]+/)
  return match ? match[0] : null
}

function isStaleChunkError(err) {
  const msg = err?.message || err?.reason?.message || err?.error?.message || ''
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('Unable to preload CSS')
  )
}

// Probe the URL: only reload if it's actually stale (404 or HTML
// fallback). A successful response means the original failure was
// transient — leave the page alone; the next navigation will retry.
async function reloadIfStale(url) {
  if (!url || recentlyReloaded()) return
  try {
    const resp = await fetch(url, { method: 'GET', cache: 'no-store' })
    if (!resp.ok) {
      console.warn(`[chunk-reload] ${url} → ${resp.status}, reloading for new build`)
      markReloaded()
      window.location.reload()
      return
    }
    const ct = resp.headers.get('content-type') || ''
    if (ct.includes('text/html')) {
      console.warn(`[chunk-reload] ${url} returned HTML fallback, reloading for new build`)
      markReloaded()
      window.location.reload()
      return
    }
    // Probe succeeded with real JS/CSS — original failure was transient.
    console.warn(`[chunk-reload] ${url} now loads fine, treating as transient`)
  } catch (err) {
    // Probe network error (likely offline). Don't reload blindly —
    // would just fail again. User can refresh manually.
    console.warn(`[chunk-reload] could not probe ${url}:`, err?.message || err)
  }
}

window.addEventListener('vite:preloadError', (event) => {
  // Vite gives us the URL directly on the event payload.
  reloadIfStale(event?.payload)
})
window.addEventListener('unhandledrejection', (e) => {
  if (isStaleChunkError(e)) reloadIfStale(extractUrlFromError(e?.reason || e))
})
window.addEventListener('error', (e) => {
  if (isStaleChunkError(e)) reloadIfStale(extractUrlFromError(e?.error || e))
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
