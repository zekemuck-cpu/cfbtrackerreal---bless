// Image upload helper — returns a hosted image URL.
//
// Backend is selectable via VITE_IMAGE_BACKEND:
//   • 'r2'    → Cloudflare R2 via a presigned PUT. The browser uploads the
//               blob DIRECTLY to R2 (bytes never touch our server); reads are
//               served from the R2 public host through Cloudflare's CDN, so
//               egress is free and repeat views are edge-cached. This is the
//               path that replaces imgbb to escape its shared-key rate limits.
//   • 'imgbb' → legacy host (default). Free tier, no SLA, rate-limited.
//
// Rollout is zero-risk: the default stays 'imgbb' until R2 is configured and
// the flag is flipped. If 'r2' is selected but the server reports R2 isn't
// configured yet (501), we transparently fall back to imgbb when a key exists.
//
// Existing Firebase-Storage / imgbb URLs already saved in dynasties keep
// loading regardless — the backend choice only affects NEW uploads.
//
// Inputs accepted:
//   • File / Blob       → uploaded as-is (preferred)
//   • base64 string     → converted to Blob first (PlayerEdit's
//                         compressImage path)
//
// Output: a hosted image URL (anyone with the link can load it). Stored as a
// plain string, so local (IndexedDB) and cloud (Firestore) saves are identical.

import { auth } from '../config/firebase'

const IMGBB_ENDPOINT = 'https://api.imgbb.com/1/upload'
const MAX_BYTES = 32 * 1024 * 1024 // matches both imgbb's cap and the R2 endpoint's

// Which backend new uploads go to. Defaults to imgbb so merging the R2 code
// changes nothing until this flag is set to 'r2' (in Vercel + .env.local).
const IMAGE_BACKEND = String(import.meta.env.VITE_IMAGE_BACKEND || 'imgbb').toLowerCase()

// Base for our serverless API. '' = same-origin (production on Vercel). In
// local dev (plain Vite, no serverless functions) set VITE_API_BASE to the
// deployed origin so the presign endpoint is reachable.
const API_BASE = import.meta.env.VITE_API_BASE || ''

function getApiKey() {
  return import.meta.env.VITE_IMGBB_API_KEY || ''
}

// Convert a raw base64 string (no data: prefix) to a Blob. JPEG is the
// safe assumption since both PlayerEdit's compressImage and most paste
// flows produce JPEG. Caller can override the contentType if known.
function base64ToBlob(base64, contentType = 'image/jpeg') {
  const byteString = atob(base64)
  const bytes = new Uint8Array(byteString.length)
  for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i)
  return new Blob([bytes], { type: contentType })
}

// Coerces whatever the caller passed into a Blob suitable for upload.
function coerceToBlob(input) {
  if (!input) throw new Error('No file provided')
  if (input instanceof Blob) return input
  if (typeof input === 'string') {
    // Strip the data: prefix if present.
    const m = input.match(/^data:([^;,]+)(?:;base64)?,(.*)$/)
    if (m) {
      return base64ToBlob(m[2], m[1])
    }
    return base64ToBlob(input)
  }
  throw new Error(`Unsupported upload input type: ${typeof input}`)
}

// Re-encode an image before upload so the STORED source is far smaller while
// keeping it sharp. Full-res game screenshots (multi-MB PNGs) are the cause of
// both slow photo loads and storage cost: the wsrv proxy must fetch the whole
// original to serve any size, and the grid fires a dozen of those at once.
//
// Sizing choices (tuned for storage cost over many years of uploads):
//   • MAX_UPLOAD_DIMENSION 1600 — matches the largest on-screen view (the
//     enlarged card renders ~1600px), so this cap is visually lossless at the
//     sizes these images are actually displayed while cutting 4K screenshots
//     down hard. Screenshots are the bulk of uploads and the main storage cost.
//   • UPLOAD_QUALITY 0.72 — webp at 0.72 is visually near-identical to the
//     source for screenshots/photos (faint softening only on heavy zoom) at
//     roughly a third the bytes of the source, prioritizing storage cost.
//
// Defensive: any failure (or an animated GIF, which a canvas would flatten)
// returns the original untouched, and we keep whichever blob is smaller.
const MAX_UPLOAD_DIMENSION = 1600
const UPLOAD_QUALITY = 0.72

// Compression decodes the source onto a canvas (createImageBitmap + a full
// canvas), which is memory-heavy for multi-MB screenshots. When a batch runs
// these in parallel (UPLOAD_CONCURRENCY), memory spikes until createImageBitmap
// throws — and the catch below then uploads the ORIGINAL full-res file, so the
// image silently lands UNCOMPRESSED. We serialize the decode step through this
// one-at-a-time queue so only a single bitmap exists at any moment; the network
// uploads still pipeline. This is why the sequential admin recompress tool
// always succeeds where a parallel upload batch did not.
let _compressQueue = Promise.resolve()
function runSerialized(task) {
  const result = _compressQueue.then(task, task)
  // Keep the chain alive regardless of any single task's outcome.
  _compressQueue = result.then(() => {}, () => {})
  return result
}

// Exported so the admin recompress tool can re-encode already-stored images.
// opts.quality overrides UPLOAD_QUALITY; opts.maxDim overrides MAX_UPLOAD_DIMENSION.
export function compressImageBlob(blob, opts = {}) {
  return runSerialized(() => _compressImageBlobInner(blob, opts))
}

async function _compressImageBlobInner(blob, opts = {}) {
  try {
    if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return blob
    if (!blob || !blob.type || !blob.type.startsWith('image/')) return blob
    if (blob.type === 'image/gif') return blob // preserve animation

    const quality = opts.quality ?? UPLOAD_QUALITY
    const maxDim = opts.maxDim ?? MAX_UPLOAD_DIMENSION

    const bmp = await createImageBitmap(blob)
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height))
    const w = Math.max(1, Math.round(bmp.width * scale))
    const h = Math.max(1, Math.round(bmp.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) { bmp.close?.(); return blob }
    ctx.drawImage(bmp, 0, 0, w, h)
    bmp.close?.()

    const out = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality))
    // Release the canvas backing store before the next queued image decodes.
    canvas.width = 0
    canvas.height = 0
    // Keep whichever is smaller (re-encoding an already-tiny image can grow it).
    return (out && out.size > 0 && out.size < blob.size) ? out : blob
  } catch {
    return blob
  }
}

// Upload one (already compressed) blob to imgbb. Returns the hosted URL.
async function uploadViaImgbb(blob, signal) {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('Image upload not configured (missing VITE_IMGBB_API_KEY)')

  const formData = new FormData()
  formData.append('image', blob)
  formData.append('key', apiKey)

  const response = await fetch(IMGBB_ENDPOINT, {
    method: 'POST',
    body: formData,
    signal,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data?.success) {
    throw new Error(data?.error?.message || `Upload failed (${response.status})`)
  }
  return data.data?.url || data.data?.display_url || ''
}

// Sentinel so the caller can detect "R2 not set up yet" and fall back to imgbb.
class R2NotConfiguredError extends Error {
  constructor() {
    super('R2 storage not configured')
    this.code = 'R2_NOT_CONFIGURED'
  }
}

// Upload one (already compressed) blob directly to R2 via a presigned PUT.
// Two hops: (1) ask our server to sign a URL, (2) PUT the bytes to R2.
async function uploadViaR2(blob, signal) {
  const user = auth.currentUser
  if (!user) throw new Error('Sign in to upload images')
  const token = await user.getIdToken()

  const presignRes = await fetch(`${API_BASE}/api/upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ contentType: blob.type || 'image/webp', size: blob.size }),
    signal,
  })

  if (presignRes.status === 501) throw new R2NotConfiguredError()
  if (!presignRes.ok) {
    const info = await presignRes.json().catch(() => ({}))
    throw new Error(info?.error || `Could not start upload (${presignRes.status})`)
  }

  const { uploadUrl, publicUrl, headers } = await presignRes.json()
  const putRes = await fetch(uploadUrl, { method: 'PUT', body: blob, headers, signal })
  if (!putRes.ok) {
    throw new Error(`Upload failed (${putRes.status}) — image host rejected the file`)
  }
  return publicUrl
}

/**
 * Upload a single image and return the hosted image URL.
 * Throws on failure — caller decides how to surface (toast, etc.).
 */
export async function uploadImage(input, { signal } = {}) {
  let blob = coerceToBlob(input)
  // Shrink the source before upload so it loads fast later (see compressImageBlob).
  blob = await compressImageBlob(blob)
  if (blob.size > MAX_BYTES) {
    throw new Error(`Image must be ≤ ${Math.round(MAX_BYTES / 1024 / 1024)}MB`)
  }
  if (blob.type && !blob.type.startsWith('image/')) {
    throw new Error(`Not an image (${blob.type})`)
  }

  // Abort after 30 seconds to prevent indefinite hangs on mobile or slow networks.
  const timer = AbortController ? new AbortController() : null
  const timeoutId = timer ? setTimeout(() => timer.abort(), 30_000) : null
  const combinedSignal = (timer && signal)
    ? AbortSignal.any
      ? AbortSignal.any([timer.signal, signal])
      : timer.signal
    : (timer?.signal || signal || undefined)

  try {
    if (IMAGE_BACKEND === 'r2') {
      try {
        return await uploadViaR2(blob, combinedSignal)
      } catch (err) {
        // Only fall back when R2 simply isn't wired up yet AND imgbb is still
        // available — a real R2 failure should surface, not silently reroute.
        if (err?.code === 'R2_NOT_CONFIGURED' && getApiKey()) {
          return await uploadViaImgbb(blob, combinedSignal)
        }
        throw err
      }
    }
    return await uploadViaImgbb(blob, combinedSignal)
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Upload timed out — check your connection and try again')
    throw err
  } finally {
    if (timeoutId != null) clearTimeout(timeoutId)
  }
}

// Network throttle for the upload step. The memory-heavy compression step is
// now serialized inside compressImageBlob (one decode at a time, regardless of
// this pool), so a batch can no longer spike memory and silently fall back to
// uploading full-res originals. This pool only bounds concurrent network PUTs.
const UPLOAD_CONCURRENCY = 3

/**
 * Upload many images with bounded concurrency.
 * Returns: { urls: string[], errors: { file, error }[] }
 * Partial successes are kept.
 *
 * Options:
 *   onProgress({ done, total, ok, url, error, file }) — fires as each upload settles
 *   signal — AbortSignal to cancel the whole batch (e.g. user clicks Cancel)
 */
export async function uploadImages(files, { onProgress, signal } = {}) {
  const list = Array.from(files || [])
  const total = list.length
  if (total === 0) return { urls: [], errors: [] }

  let done = 0
  let next = 0
  const results = new Array(total)

  async function worker() {
    while (true) {
      if (signal?.aborted) return
      const i = next++
      if (i >= total) return
      const file = list[i]
      try {
        const url = await uploadImage(file, { signal })
        done++
        results[i] = { ok: true, value: url }
        try { onProgress?.({ done, total, ok: true, url, file }) } catch (_) { /* ignore listener errors */ }
      } catch (err) {
        done++
        const error = err instanceof Error ? err : new Error(String(err))
        results[i] = { ok: false, error }
        try { onProgress?.({ done, total, ok: false, error, file }) } catch (_) { /* ignore listener errors */ }
      }
    }
  }

  const workers = Array.from({ length: Math.min(UPLOAD_CONCURRENCY, total) }, () => worker())
  await Promise.all(workers)

  const urls = []
  const errors = []
  results.forEach((r, i) => {
    if (r && r.ok && r.value) urls.push(r.value)
    else errors.push({ file: list[i], error: r?.error instanceof Error ? r.error : new Error('Upload failed') })
  })
  return { urls, errors }
}
