// Image upload helper — writes to imgbb and returns a hosted image URL.
// Switched back from Firebase Storage on 2026-05-07 to control egress
// cost on bulk uploads (a 21-photo game upload + the resulting
// repeated-view fetches were the inflection point). Existing Firebase
// Storage URLs already saved in dynasties continue to load fine — the
// switch only affects new uploads.
//
// imgbb's known weakness: free tier has no SLA and the CDN occasionally
// serves a "Service unavailable" placeholder for otherwise-valid URLs.
// Consumers (FlippableCard, MediaList, etc.) already have onError
// fallbacks for that case.
//
// Inputs accepted:
//   • File / Blob       → uploaded as-is (preferred)
//   • base64 string     → converted to Blob first (PlayerEdit's
//                         compressImage path)
//
// Output: an imgbb-hosted image URL. Same sharing model Firebase
// Storage provided (anyone with the link can load it).

const IMGBB_ENDPOINT = 'https://api.imgbb.com/1/upload'
const MAX_BYTES = 32 * 1024 * 1024 // imgbb's hard cap

function getApiKey() {
  return import.meta.env.VITE_IMGBB_API_KEY || '1369fa0365731b13c5330a26fedf569c'
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

/**
 * Upload a single image to imgbb. Returns the hosted image URL.
 * Throws on failure — caller decides how to surface (toast, etc.).
 */
export async function uploadImage(input) {
  const blob = coerceToBlob(input)
  if (blob.size > MAX_BYTES) {
    throw new Error(`Image must be ≤ ${Math.round(MAX_BYTES / 1024 / 1024)}MB (imgbb limit)`)
  }
  if (blob.type && !blob.type.startsWith('image/')) {
    throw new Error(`Not an image (${blob.type})`)
  }
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('Image upload not configured (missing VITE_IMGBB_API_KEY)')

  const formData = new FormData()
  formData.append('image', blob)
  formData.append('key', apiKey)

  const response = await fetch(IMGBB_ENDPOINT, {
    method: 'POST',
    body: formData,
  })
  const data = await response.json().catch(() => ({}))

  if (!response.ok || !data?.success) {
    throw new Error(data?.error?.message || `Upload failed (${response.status})`)
  }
  return data.data?.url || data.data?.display_url || ''
}

/**
 * Upload many images in parallel.
 * Returns: { urls: string[], errors: { file, error }[] }
 * Partial successes are kept.
 *
 * Optional `onProgress({ done, total, ok, url, error, file })` fires as
 * each individual upload settles — used by GameEdit's photo card to
 * surface a live "X of N uploaded" counter and progressively render
 * thumbnails so the user can confirm the bulk upload is making
 * forward progress instead of staring at a static spinner for a
 * 20-photo batch.
 */
export async function uploadImages(files, { onProgress } = {}) {
  const list = Array.from(files || [])
  const total = list.length
  if (total === 0) return { urls: [], errors: [] }

  let done = 0
  const results = await Promise.allSettled(
    list.map(async (file) => {
      try {
        const url = await uploadImage(file)
        done++
        try { onProgress?.({ done, total, ok: true, url, file }) } catch (_) { /* ignore listener errors */ }
        return url
      } catch (err) {
        done++
        const error = err instanceof Error ? err : new Error(String(err))
        try { onProgress?.({ done, total, ok: false, error, file }) } catch (_) { /* ignore listener errors */ }
        throw error
      }
    })
  )

  const urls = []
  const errors = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) urls.push(r.value)
    else errors.push({ file: list[i], error: r.reason instanceof Error ? r.reason : new Error(String(r.reason)) })
  })
  return { urls, errors }
}
