// Upload + server-side parse for a CFB 27 PC save file. Mirrors
// imageUpload.js's presigned-R2-PUT pattern (uploadViaR2): the browser
// uploads the raw save directly to R2 so a multi-megabyte file never hits
// Vercel's request-body size limit, then a serverless function
// (api/cfb27-save-parse.js) downloads it server-side and runs the vendored
// extractor (api/_lib/cfb27Extract) against it — see the CFB27 PC Save
// Import plan for why parsing can't happen in the browser tab.
import { auth } from '../config/firebase'

const API_BASE = import.meta.env.VITE_API_BASE || ''

/**
 * Upload a CFB 27 save file and return its extracted player rows.
 *
 * @param {File} file - the raw DYNASTY-* save file the user picked
 * @param {object} [opts]
 * @param {(stage: 'uploading'|'parsing') => void} [opts.onProgress]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{ players: object[], teamCount: number, tableRowCount: number }>}
 */
// Turn a failed API response into an error that actually says what happened.
// A handler error arrives as JSON with an `error` key, but a PLATFORM failure
// (Vercel HTML 404 for a missing route, an HTML 500 from a function that
// couldn't boot) has no JSON at all — the old code swallowed it and reported a
// bare "Could not start upload", which is indistinguishable between "route is
// gone", "function crashed", and "you're not premium". Keep the status and a
// snippet of the raw body so one screenshot is enough to diagnose.
async function describeFailure(res, what) {
  const raw = await res.text().catch(() => '')
  let parsed = null
  try { parsed = JSON.parse(raw) } catch { /* not JSON — platform-level failure */ }
  if (parsed?.error) return new Error(parsed.error)
  const snippet = raw.replace(/\s+/g, ' ').trim().slice(0, 160)
  return new Error(
    `${what} — HTTP ${res.status}${snippet ? `: ${snippet}` : ''}`
  )
}

export async function uploadAndParseCfb27Save(file, { onProgress, signal } = {}) {
  const user = auth.currentUser
  if (!user) throw new Error('Sign in to import a save file')
  const token = await user.getIdToken()

  onProgress?.('uploading')

  const presignRes = await fetch(`${API_BASE}/api/cfb27-save-upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ size: file.size }),
    signal,
  })
  if (!presignRes.ok) {
    throw await describeFailure(presignRes, 'Could not start upload')
  }
  const { uploadUrl, key, headers } = await presignRes.json()

  const putRes = await fetch(uploadUrl, { method: 'PUT', body: file, headers, signal })
  if (!putRes.ok) {
    // R2 rejection (expired signature, size/permission) — its body is XML.
    throw await describeFailure(putRes, 'Upload to storage failed')
  }

  onProgress?.('parsing')

  const parseRes = await fetch(`${API_BASE}/api/cfb27-save-parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ key }),
    signal,
  })
  if (!parseRes.ok) {
    throw await describeFailure(parseRes, 'Could not parse save')
  }

  return parseRes.json()
}
