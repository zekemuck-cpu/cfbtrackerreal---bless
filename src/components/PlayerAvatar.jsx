import { useState } from 'react'
import { proxyImageUrl } from '../utils/imageProxy'

/**
 * PlayerAvatar — a player headshot with a graceful fallback chain:
 *   uploaded photo (pictureUrl) → the player's TEAM LOGO → a neutral silhouette.
 *
 * The team-logo fallback is the requested quality-of-life win: a roster of
 * un-photographed players shows their helmet instead of a wall of identical
 * gray silhouettes. Mirrors the reference implementation already used on the
 * team-page roster cards.
 *
 * The chain also runs when a photo URL EXISTS but fails to load. That matters
 * for CFB 27 PC dynasties: the save sync writes a bundled-portrait path into
 * every synced player's pictureUrl (see cfb27SaveImport's mapPortraitUrl), and
 * the portrait pack is ~800 MB / 26k files, so it is not committed to the repo
 * — it's served from VITE_CFB27_PORTRAIT_BASE. If that isn't configured, or a
 * single portrait is missing, we fall through to the team logo instead of
 * rendering a wall of broken-image icons.
 *
 * Props:
 *   photoUrl  — the player's pictureUrl (already placeholder-filtered by the
 *               caller via realPhoto() when relevant). Falsy → fall through.
 *   teamLogo  — the player's team logo URL. Falsy → fall through to silhouette.
 *   name      — used for alt text.
 *   size      — pixel diameter of the circle (default 40).
 *   className — extra classes on the outer circle (e.g. sizing overrides).
 */
export default function PlayerAvatar({ photoUrl, teamLogo, name = '', size = 40, className = '' }) {
  const box = { width: size, height: size }
  const base = `rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 border border-surface-5 ${className}`
  // Keyed by URL so a re-render with a DIFFERENT photo retries rather than
  // staying stuck on the previous one's failure.
  const [failedUrl, setFailedUrl] = useState(null)

  if (photoUrl && failedUrl !== photoUrl) {
    return (
      <div className={base} style={box}>
        <img
          src={proxyImageUrl(photoUrl, 300)}
          alt={name}
          className="w-full h-full object-cover"
          onError={() => setFailedUrl(photoUrl)}
        />
      </div>
    )
  }

  if (teamLogo) {
    return (
      <div className={`${base} bg-surface-3`} style={box}>
        <img
          src={teamLogo}
          alt=""
          className="object-contain"
          style={{ width: Math.round(size * 0.7), height: Math.round(size * 0.7) }}
        />
      </div>
    )
  }

  return (
    <div className={`${base} bg-surface-3 text-txt-muted`} style={box}>
      <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: Math.round(size * 0.52), height: Math.round(size * 0.52) }}>
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
      </svg>
    </div>
  )
}
