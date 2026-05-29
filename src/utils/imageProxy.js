/**
 * Route a user-supplied image URL (ImgBB, etc.) through the wsrv.nl image
 * proxy. Two reasons this matters for this app:
 *
 *  1. Resilience. ImgBB's free tier hotlink-blocks / drops images, and a
 *     direct <img src> then renders ImgBB's "image not found" placeholder.
 *     wsrv fetches server-side (bypassing browser hotlink blocks) and caches
 *     what it fetches, so an image stays visible even after ImgBB flakes.
 *  2. Speed. Static images are re-encoded to sized webp.
 *
 * Display-only: never persist the proxied URL. Pair with an onError that
 * falls back to the raw url where a fallback is useful.
 *
 * @param {string} url    the raw image url
 * @param {number} [width] max width in px (omit for no resize)
 * @param {object} [opts]
 * @param {boolean} [opts.animated] keep all frames + original format (GIFs);
 *                                  otherwise re-encode to webp
 * @param {number}  [opts.q] webp quality (default 90)
 */
export function proxyImageUrl(url, width, { animated = false, q = 90 } = {}) {
  if (!url || typeof url !== 'string') return url
  const s = url.trim()
  // Leave data/blob URIs and already-proxied URLs untouched.
  if (!s || s.startsWith('data:') || s.startsWith('blob:') || s.includes('wsrv.nl') || s.includes('weserv.nl')) {
    return url
  }
  const params = [`url=${encodeURIComponent(s)}`]
  if (width) params.push(`w=${width}`)
  if (animated) params.push('n=-1')
  else params.push('output=webp', `q=${q}`)
  return `https://wsrv.nl/?${params.join('&')}`
}
