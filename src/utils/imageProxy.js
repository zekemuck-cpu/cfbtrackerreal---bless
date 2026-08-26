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

// The configured CFB27 portrait host, or this app's own origin when unset (a
// local dev copy of public/cfb27-portraits/). Single source of truth for both
// the import-time URL builders (cfb27SaveImport's mapPortraitUrl /
// mapCoachPortraitUrl) and the render-time rebase below.
export function portraitBase() {
  const base = import.meta.env?.VITE_CFB27_PORTRAIT_BASE
    || (typeof window === 'undefined' ? '' : window.location.origin)
  return String(base).replace(/\/$/, '')
}

/**
 * Re-point a STORED portrait URL at the CURRENTLY-configured portrait host.
 *
 * mapPortraitUrl bakes an ABSOLUTE url into every synced player's pictureUrl
 * at import time, which freezes the host at whatever VITE_CFB27_PORTRAIT_BASE
 * was when that save was imported. Rosters synced before the CDN was
 * configured therefore carry `https://dynastytracker.app/cfb27-portraits/...`
 * permanently — a guaranteed 404, since the ~800 MB pack is deliberately not
 * deployed with the app. Setting the env var afterwards fixes only NEW
 * imports, so every already-synced dynasty would keep showing team-logo
 * fallbacks with no route back short of a full re-sync.
 *
 * Rebasing at RENDER time makes the stored host irrelevant: only the
 * `/cfb27-portraits/...` path carries meaning, and the host is re-resolved on
 * every paint. Moving the CDN later becomes a config change instead of a data
 * migration. Anything that isn't a portrait path (user uploads, ImgBB links)
 * is returned untouched.
 */
export function resolvePortraitUrl(url) {
  if (!url || typeof url !== 'string') return url
  const idx = url.indexOf('/cfb27-portraits/')
  if (idx === -1) return url
  const base = portraitBase()
  if (!base) return url
  return `${base}${url.slice(idx)}`
}

export function proxyImageUrl(url, width, { animated = false, q = 90 } = {}) {
  if (!url || typeof url !== 'string') return url
  // Rebase first so a portrait stored against a stale host is proxied from
  // the host that actually serves it. Idempotent, so call sites that already
  // resolved (PlayerAvatar, Player.jsx) are unaffected.
  const s = resolvePortraitUrl(url).trim()
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
