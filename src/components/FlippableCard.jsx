import { useState } from 'react'

/**
 * FlippableCard — click-to-flip 3D card preview used everywhere a
 * prompt-driven card needs to expose both faces (player profile,
 * Game page Cards tab, dynasty Card Collection page).
 *
 * Behavior:
 *   • Both URLs present → renders a button that 3D-flips on click.
 *   • Only one URL present → renders that single image, no flip.
 *   • Neither URL present → renders a placeholder slot.
 *
 * Aspect ratio is locked to 5:7 (real card proportion). The component
 * fills its container width.
 */
export default function FlippableCard({ frontImageUrl, backImageUrl, className = '' }) {
  const [flipped, setFlipped] = useState(false)
  const hasFront = !!frontImageUrl
  const hasBack = !!backImageUrl

  if (!hasFront && !hasBack) {
    return (
      <div
        className={`rounded-xl flex items-center justify-center text-xs text-txt-tertiary ${className}`}
        style={{
          width: '100%',
          aspectRatio: '5 / 7',
          backgroundColor: 'var(--surface-2)',
          border: '1px dashed var(--surface-4)',
        }}
      >
        No images yet
      </div>
    )
  }

  if (!hasBack || !hasFront) {
    const url = frontImageUrl || backImageUrl
    return (
      <div
        className={`rounded-xl overflow-hidden shadow-2xl ${className}`}
        style={{ aspectRatio: '5 / 7' }}
      >
        <img src={url} alt="" className="w-full h-full object-cover" />
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setFlipped(f => !f)}
      className={`w-full block text-left ${className}`}
      style={{ aspectRatio: '5 / 7', perspective: '1200px', cursor: 'pointer' }}
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
          <img src={frontImageUrl} alt="" className="w-full h-full object-cover" />
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
          <img src={backImageUrl} alt="" className="w-full h-full object-cover" />
        </div>
      </div>
    </button>
  )
}
