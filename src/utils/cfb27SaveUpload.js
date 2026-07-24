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
    const info = await presignRes.json().catch(() => ({}))
    throw new Error(info?.error || `Could not start upload (${presignRes.status})`)
  }
  const { uploadUrl, key, headers } = await presignRes.json()

  const putRes = await fetch(uploadUrl, { method: 'PUT', body: file, headers, signal })
  if (!putRes.ok) {
    throw new Error(`Upload failed (${putRes.status}) — try again`)
  }

  onProgress?.('parsing')

  const parseRes = await fetch(`${API_BASE}/api/cfb27-save-parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ key }),
    signal,
  })
  if (!parseRes.ok) {
    const info = await parseRes.json().catch(() => ({}))
    throw new Error(info?.error || `Could not parse save (${parseRes.status})`)
  }

  return parseRes.json()
}
