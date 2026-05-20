// Robust "paste an image" helper that mirrors how ImageUpload.jsx
// handles its in-component paste button. Used by any modal/button that
// needs to convert whatever-the-user-copied into a real File for upload.
//
// The clipboard can hold an image in three shapes, and which one shows
// up depends on the source app:
//   1. A real image/* blob — when you screenshot, or "Copy image" from
//      a native image file. This is the cheap, no-network path.
//   2. text/html with an <img src="..."> inside — what ChatGPT, Notion,
//      Google Docs, most webpages put on the clipboard when you "Copy
//      image" on a rendered <img>. The bytes are on a remote host.
//   3. A plain-text URL — the user did "Copy image address" / "Copy
//      link to image" instead of "Copy image".
//
// For shapes 2 and 3 we fetch the URL ourselves so the upload path gets
// a real File. Some hosts gate their images behind login cookies and
// will 401/403 cross-origin — those get an actionable error instead of
// a silent broken-image upload.

export function extractImageUrlFromHtml(html) {
  if (!html) return null
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const img = doc.querySelector('img')
    if (img && img.getAttribute('src')) return img.getAttribute('src')
  } catch {
    // Fall through to regex.
  }
  const m = html.match(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i)
  return m ? m[1] : null
}

export function looksLikeUrl(s) {
  if (!s) return false
  const trimmed = s.trim()
  return /^https?:\/\//i.test(trimmed) || trimmed.startsWith('data:image/')
}

// Known hosts whose image URLs require session cookies — these never
// load cross-origin and would silently produce broken-image icons.
export function isKnownAuthGatedUrl(url) {
  try {
    const u = new URL(url)
    if (/(^|\.)chatgpt\.com$/i.test(u.hostname) && /^\/backend-api\//i.test(u.pathname)) return true
    return false
  } catch {
    return false
  }
}

export async function urlToImageFile(url) {
  const res = await fetch(url, { mode: 'cors' })
  if (!res.ok) throw new Error(`Fetch failed (${res.status})`)
  const blob = await res.blob()
  if (!blob.type.startsWith('image/')) {
    throw new Error(`Not an image (${blob.type || 'unknown'})`)
  }
  const ext = (blob.type.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '').slice(0, 4) || 'png'
  return new File([blob], `pasted.${ext}`, { type: blob.type })
}

// Read the clipboard via navigator.clipboard.read() / readText() and
// return a File the caller can upload. Returns one of:
//   { ok: true, file }                — got an image, ready to upload
//   { ok: false, reason: 'denied'   } — browser blocked clipboard access
//   { ok: false, reason: 'empty'    } — clipboard had nothing usable
//   { ok: false, reason: 'auth_url', url } — looked like a chat-gated URL
//   { ok: false, reason: 'fetch_failed', error } — URL fetch threw
export async function readClipboardImageAsFile() {
  let clipboardItems = null
  let plainText = null
  try {
    clipboardItems = await navigator.clipboard.read()
  } catch {
    // read() is gated behind permissions on some platforms — try readText below.
  }
  try {
    plainText = await navigator.clipboard.readText()
  } catch {
    // readText() may also be denied.
  }

  // 1. Real image blob in a structured clipboard item.
  if (clipboardItems) {
    for (const item of clipboardItems) {
      const imageType = item.types.find(type => type.startsWith('image/'))
      if (imageType) {
        try {
          const blob = await item.getType(imageType)
          const ext = (imageType.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '').slice(0, 4) || 'png'
          return { ok: true, file: new File([blob], `pasted.${ext}`, { type: imageType }) }
        } catch {
          // fall through
        }
      }
    }

    // 2. text/html with an embedded <img src> — ChatGPT/Notion/Docs path.
    for (const item of clipboardItems) {
      if (item.types.includes('text/html')) {
        try {
          const blob = await item.getType('text/html')
          const html = await blob.text()
          const url = extractImageUrlFromHtml(html)
          if (url && looksLikeUrl(url)) {
            if (isKnownAuthGatedUrl(url)) return { ok: false, reason: 'auth_url', url }
            try {
              const file = await urlToImageFile(url)
              return { ok: true, file }
            } catch (error) {
              return { ok: false, reason: 'fetch_failed', error, url }
            }
          }
        } catch {
          // try next type
        }
      }
    }
  }

  // 3. Plain-text URL — from readText() or from a text/plain clipboard item.
  const tryUrl = async (url) => {
    if (!looksLikeUrl(url)) return null
    if (isKnownAuthGatedUrl(url)) return { ok: false, reason: 'auth_url', url }
    try {
      const file = await urlToImageFile(url)
      return { ok: true, file }
    } catch (error) {
      return { ok: false, reason: 'fetch_failed', error, url }
    }
  }
  if (plainText) {
    const r = await tryUrl(plainText)
    if (r) return r
  }
  if (clipboardItems) {
    for (const item of clipboardItems) {
      if (item.types.includes('text/plain')) {
        try {
          const blob = await item.getType('text/plain')
          const text = await blob.text()
          const r = await tryUrl(text)
          if (r) return r
        } catch {
          // give up
        }
      }
    }
  }

  if (clipboardItems == null && plainText == null) {
    return { ok: false, reason: 'denied' }
  }
  return { ok: false, reason: 'empty' }
}
