// Image upload helper — writes to Firebase Storage and returns a public
// download URL. Replaces the previous imgbb-based path: imgbb is a free
// image host with no SLA, and we've seen images silently disappear or
// the CDN return a "service unavailable" placeholder that ends up baked
// into player card art.
//
// Inputs accepted:
//   • File / Blob       → uploaded as-is (preferred)
//   • base64 string     → converted to Blob first (PlayerEdit's
//                         compressImage path)
//
// Output: a Firebase Storage download URL (with embedded token, so it's
// publicly accessible to anyone who has the link — same sharing model
// imgbb provided).

import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '../config/firebase'

const MAX_BYTES = 32 * 1024 * 1024 // mirrors imgbb's old 32 MB cap

// Convert a raw base64 string (no data: prefix) to a Blob. JPEG is the
// safe assumption since both PlayerEdit's compressImage and most paste
// flows produce JPEG. Caller can override the contentType if known.
function base64ToBlob(base64, contentType = 'image/jpeg') {
  const byteString = atob(base64)
  const bytes = new Uint8Array(byteString.length)
  for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i)
  return new Blob([bytes], { type: contentType })
}

function extensionFor(blob) {
  const t = blob?.type || ''
  if (t.includes('png')) return 'png'
  if (t.includes('webp')) return 'webp'
  if (t.includes('gif')) return 'gif'
  return 'jpg'
}

// Random-enough storage key. Two pieces:
//   • timestamp (ms)  — visible chronological order in the bucket
//   • 8 random hex    — collision-proof under any realistic load
function makeStorageKey(blob) {
  const ts = Date.now()
  const rand = Math.random().toString(16).slice(2, 10)
  return `images/${ts}-${rand}.${extensionFor(blob)}`
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
 * Upload a single image. Returns the public download URL.
 * Throws on failure — caller decides how to surface (toast, etc.).
 */
export async function uploadImage(input) {
  const blob = coerceToBlob(input)
  if (blob.size > MAX_BYTES) {
    throw new Error(`Image must be ≤ ${Math.round(MAX_BYTES / 1024 / 1024)}MB`)
  }
  if (blob.type && !blob.type.startsWith('image/')) {
    throw new Error(`Not an image (${blob.type})`)
  }
  const storageRef = ref(storage, makeStorageKey(blob))
  await uploadBytes(storageRef, blob, blob.type ? { contentType: blob.type } : undefined)
  return await getDownloadURL(storageRef)
}

/**
 * Upload many images in parallel.
 * Returns: { urls: string[], errors: { file, error }[] }
 * Partial successes are kept (mirrors the old imgbb helper's contract).
 */
export async function uploadImages(files) {
  const list = Array.from(files || [])
  if (list.length === 0) return { urls: [], errors: [] }
  const results = await Promise.allSettled(list.map(f => uploadImage(f)))
  const urls = []
  const errors = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) urls.push(r.value)
    else errors.push({ file: list[i], error: r.reason instanceof Error ? r.reason : new Error(String(r.reason)) })
  })
  return { urls, errors }
}
