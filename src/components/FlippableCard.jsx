import { useState } from 'react'
import { proxyImageUrl } from '../utils/imageProxy'
import { getCardStyle } from '../data/cardStyles'

// Render width for card faces — matches the full-size photo treatment so
// cards stay crisp at any on-screen size while gaining wsrv's resilience
// (server-side fetch + cache) against imgbb dropping/placeholdering images.
const CARD_W = 1600

// Treat a face as missing once the browser has reported a load error.
// Old card art lived on imgbb, which has since started serving a
// "Service unavailable" placeholder image for valid-looking URLs whose
// underlying file has expired or is temporarily unavailable. Showing
// that placeholder verbatim ruins the card grid; collapsing the face
// to "No image" matches what the user sees for cards that were never
// uploaded and is honest about the state.
function ImageWithFallback({ src, onError, ...rest }) {
  return <img src={src} onError={onError} {...rest} />
}

/**
 * FlippableCard — click-to-flip 3D card preview used everywhere a
 * prompt-driven card needs to expose both faces (player profile,
 * Game page Cards tab, dynasty Card Collection page).
 *
 * Behavior:
 *   • Both URLs present → renders a button that 3D-flips on click.
 *   • Only one URL present → renders that single image, no flip.
 *   • Neither URL present → renders a placeholder slot.
 *   • Image load fails  → that face is treated as missing, so a
 *     dead imgbb URL doesn't show the blue "Service unavailable" tile.
 *
 * Aspect ratio is locked to 5:7 (real card proportion). The component
 * fills its container width.
 */
export default function FlippableCard({ frontImageUrl, backImageUrl, styleId, className = '' }) {
  const [flipped, setFlipped] = useState(false)
  const [frontBroken, setFrontBroken] = useState(false)
  const [backBroken, setBackBroken] = useState(false)
  // Card proportion comes from the style (oversized sets like the 1965
  // "Tall Boys" are much taller than the standard 5:7), so the face isn't
  // cropped to standard size. Falls back to standard when unknown.
  const aspectRatio = getCardStyle(styleId)?.aspectRatio || '5 / 7'
  const hasFront = !!frontImageUrl && !frontBroken
  const hasBack = !!backImageUrl && !backBroken

  if (!hasFront && !hasBack) {
    return (
      <div
        className={`rounded-xl flex items-center justify-center text-xs text-txt-tertiary ${className}`}
        style={{
          width: '100%',
          aspectRatio,
          backgroundColor: 'var(--surface-2)',
          border: '1px dashed var(--surface-4)',
        }}
      >
        No images yet
      </div>
    )
  }

  if (!hasBack || !hasFront) {
    const showingFront = hasFront
    const url = showingFront ? frontImageUrl : backImageUrl
    return (
      <div
        className={`rounded-xl overflow-hidden shadow-2xl ${className}`}
        style={{ aspectRatio }}
      >
        <ImageWithFallback
          src={proxyImageUrl(url, CARD_W)}
          alt=""
          className="w-full h-full object-cover"
          onError={() => (showingFront ? setFrontBroken(true) : setBackBroken(true))}
        />
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setFlipped(f => !f)}
      className={`w-full block text-left ${className}`}
      style={{ aspectRatio, perspective: '1200px', cursor: 'pointer' }}
      title={flipped ? 'Click to flip — front' : 'Click to flip — back'}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          transformStyle: 'preserve-3d',
          transition: 'transform 600ms cubic-bezier(0.22, 1, 0.36, 1)',
          transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        {/* Front face */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            borderRadius: 12,
            overflow: 'hidden',
            boxShadow: '0 18px 42px rgba(0, 0, 0, 0.55)',
          }}
        >
          <ImageWithFallback
            src={proxyImageUrl(frontImageUrl, CARD_W)}
            alt=""
            className="w-full h-full object-cover"
            onError={() => setFrontBroken(true)}
          />
        </div>
        {/* Back face — pre-rotated so it shows when the parent flips. */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            borderRadius: 12,
            overflow: 'hidden',
            boxShadow: '0 18px 42px rgba(0, 0, 0, 0.55)',
          }}
        >
          <ImageWithFallback
            src={proxyImageUrl(backImageUrl, CARD_W)}
            alt=""
            className="w-full h-full object-cover"
            onError={() => setBackBroken(true)}
          />
        </div>
      </div>
    </button>
  )
}
