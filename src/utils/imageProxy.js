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
// Matches the hostname of a local dev server (Vite default) or a LAN IP —
// wsrv.nl fetches server-side from the public internet, so it can NEVER
// reach any of these regardless of port. Only ever relevant for CFB27
// portrait URLs, which are same-origin by construction
// (cfb27SaveImport.js's mapPortraitUrl builds them from
// window.location.origin) — a real user-uploaded URL (ImgBB, etc.) is
// never same-origin, so this can't accidentally skip the proxy for the
// hotlink-resilience case it exists for.
const LOCAL_DEV_HOSTNAME = /^(localhost|127\.0\.0\.1|\[::1\]|(10|127)\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})$/i

export function proxyImageUrl(url, width, { animated = false, q = 90 } = {}) {
  if (!url || typeof url !== 'string') return url
  const s = url.trim()
  // Leave data/blob URIs and already-proxied URLs untouched.
  if (!s || s.startsWith('data:') || s.startsWith('blob:') || s.includes('wsrv.nl') || s.includes('weserv.nl')) {
    return url
  }
  // Same-origin + local dev host: wsrv.nl would 404 trying to fetch this,
  // and there's nothing to bypass (no hotlink-block, no resize benefit
  // worth the round trip) — load it directly instead.
  if (typeof window !== 'undefined' && LOCAL_DEV_HOSTNAME.test(window.location.hostname) && s.startsWith(window.location.origin)) {
    return s
  }
  const params = [`url=${encodeURIComponent(s)}`]
  if (width) params.push(`w=${width}`)
  if (animated) params.push('n=-1')
  else params.push('output=webp', `q=${q}`)
  return `https://wsrv.nl/?${params.join('&')}`
}
