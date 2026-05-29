/**
 * MediaList — render a list of user-pasted URLs as inline embeds.
 *
 * Smart-detects the link type and picks the right rendering:
 *   • YouTube (youtube.com / youtu.be) → 16:9 iframe player
 *   • Imgur album / gallery (imgur.com/a/, imgur.com/gallery/) → embedded iframe
 *   • Imgur single post (imgur.com/<id>) → direct image with .jpg→.png fallback
 *   • Direct image (.jpg/.png/.gif/.webp, i.imgur.com/<id>) → <img>
 *   • Anything else → plain link card with an open-in-new-tab arrow
 *
 * Mirrors the rendering used in the Game page Media section so that the
 * Player profile Highlights tab and the per-game Media list look the same
 * — one place to fix bugs, one set of supported link providers.
 *
 * Props:
 *   links        - string[] | comma-separated string. Falsy / empty → renders nothing.
 *   accentColor  - hex/CSS color used as the icon-tile fill on plain link cards.
 *                  Defaults to a neutral surface tone.
 *   className    - extra classes for the outer wrapper.
 *   emptyState   - optional ReactNode rendered when there are no links. If
 *                  omitted, the component renders nothing on empty.
 */
import { getContrastTextColor } from '../utils/colorUtils'
import { proxyImageUrl } from '../utils/imageProxy'

function parseLinks(linksData) {
  if (!linksData) return []
  if (Array.isArray(linksData)) {
    return linksData.map(l => (typeof l === 'string' ? l.trim() : '')).filter(Boolean)
  }
  if (typeof linksData !== 'string') return []
  return linksData.split(/[\n,]+/).map(l => l.trim()).filter(Boolean)
}

const isYouTubeLink = (url) => url.includes('youtube.com') || url.includes('youtu.be')

function getYouTubeEmbedUrl(url) {
  // Handles both watch?v= and youtu.be/<id> forms; falls back to null on misses.
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s?]+)/)
  return m ? `https://www.youtube.com/embed/${m[1]}` : null
}

const isImgurAlbumLink = (url) => /imgur\.com\/(a|gallery)\//.test(url)

function getImgurAlbumId(url) {
  const m = url.match(/imgur\.com\/(?:a|gallery)\/([a-zA-Z0-9]+)/)
  return m ? m[1] : null
}

function isImgurPostLink(url) {
  // Match imgur.com/<id> where <id> is 5–8 alphanumerics; exclude album/gallery
  // routes and direct i.imgur.com (the latter is handled by isImageLink).
  if (url.includes('i.imgur.com')) return false
  if (isImgurAlbumLink(url)) return false
  return /imgur\.com\/[a-zA-Z0-9]{5,8}(?:\?|#|$)/.test(url)
}

function getImgurDirectUrl(url) {
  const m = url.match(/imgur\.com\/([a-zA-Z0-9]{5,8})/)
  return m ? `https://i.imgur.com/${m[1]}.jpg` : null
}

function isImageLink(url) {
  if (/\.(jpg|jpeg|png|gif|webp)$/i.test(url)) return true
  if (/i\.imgur\.com\/[a-zA-Z0-9]+/.test(url) && !url.includes('/a/') && !url.includes('/gallery/')) return true
  return false
}

export default function MediaList({
  links,
  accentColor = 'var(--surface-4)',
  className = '',
  emptyState = null,
}) {
  const list = parseLinks(links)

  if (list.length === 0) {
    return emptyState || null
  }

  return (
    <div className={`space-y-4 ${className}`.trim()}>
      {list.map((link, index) => {
        // YouTube — 16:9 iframe.
        if (isYouTubeLink(link)) {
          const embed = getYouTubeEmbedUrl(link)
          if (embed) {
            return (
              <div key={index} className="rounded-xl overflow-hidden shadow-lg aspect-video ring-1 ring-surface-4">
                <iframe
                  width="100%"
                  height="100%"
                  src={embed}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full"
                />
              </div>
            )
          }
        }

        // Imgur album / gallery — embedded iframe with its own header strip.
        if (isImgurAlbumLink(link)) {
          const albumId = getImgurAlbumId(link)
          if (albumId) {
            return (
              <div key={index} className="rounded-xl overflow-hidden shadow-lg ring-1 ring-surface-4 bg-surface-2">
                <div className="flex items-center justify-between px-4 py-2 border-b border-surface-4">
                  <span className="text-sm font-medium text-white">Imgur Album</span>
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-txt-tertiary hover:text-green-400 transition-colors flex items-center gap-1"
                  >
                    Open in Imgur
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
                <div className="relative w-full" style={{ minHeight: '500px' }}>
                  <iframe
                    src={`https://imgur.com/a/${albumId}/embed?pub=true&ref=https://dynastytracker.app&analytics=false`}
                    width="100%"
                    height="500"
                    frameBorder="0"
                    scrolling="no"
                    allowFullScreen
                    className="w-full"
                    style={{ overflow: 'hidden' }}
                  />
                </div>
              </div>
            )
          }
        }

        // Imgur single post — direct image with .jpg→.png fallback so we don't
        // need to know the file extension up front.
        if (isImgurPostLink(link)) {
          const directUrl = getImgurDirectUrl(link)
          if (directUrl) {
            return (
              <div key={index} className="rounded-xl overflow-hidden shadow-lg ring-1 ring-surface-4">
                <a href={link} target="_blank" rel="noopener noreferrer">
                  <img
                    src={directUrl}
                    alt=""
                    className="w-full h-auto"
                    onError={(e) => {
                      if (e.target.src.endsWith('.jpg')) {
                        e.target.src = e.target.src.replace('.jpg', '.png')
                      }
                    }}
                  />
                </a>
              </div>
            )
          }
        }

        // Direct image link.
        if (isImageLink(link)) {
          return (
            <div key={index} className="rounded-xl overflow-hidden shadow-lg ring-1 ring-surface-4">
              <a href={link} target="_blank" rel="noopener noreferrer">
                <img src={proxyImageUrl(link, 1600, { animated: true })} alt="" className="w-full h-auto" />
              </a>
            </div>
          )
        }

        // Generic fallback — link card with provider-agnostic icon.
        return (
          <a
            key={index}
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 bg-surface-2 rounded-xl hover:bg-surface-3 transition-colors group ring-1 ring-surface-4"
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: accentColor }}
            >
              <svg className="w-5 h-5" fill="none" stroke={getContrastTextColor(accentColor)} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </div>
            <span className="text-sm text-txt-secondary group-hover:text-white break-all flex-1 transition-colors">{link}</span>
            <svg className="w-5 h-5 text-txt-muted group-hover:text-white transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </a>
        )
      })}
    </div>
  )
}
