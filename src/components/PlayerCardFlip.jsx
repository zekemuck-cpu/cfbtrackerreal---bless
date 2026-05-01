// 3D-flip card display for the Player.jsx "Card" tab and the Game
// page's Cards tab. Renders the saved front-of-card image; clicking
// the Flip button rotates 180° around Y to reveal the back.
//
// Uses `object-contain` (not cover) so the user's full uploaded
// image — including any border treatment baked into the card design
// itself — is fully visible without being cropped at the rounded
// corners. The wrapper provides a thin team-color border for cards
// whose own design doesn't include one.

import { useState } from 'react'

export default function PlayerCardFlip({ frontUrl, backUrl, accentColor, sizeWidth = 'min(360px, 80vw)' }) {
  const [flipped, setFlipped] = useState(false)
  const hasFront = !!frontUrl
  const hasBack = !!backUrl
  const canFlip = hasFront && hasBack

  if (!hasFront && !hasBack) return null

  return (
    <div className="flex flex-col items-center gap-5 py-4">
      <div
        className="relative"
        style={{
          // Card aspect: 2.5 x 3.5 inches → ~5:7. Width caps so cards
          // don't get absurdly large on huge screens.
          width: sizeWidth,
          aspectRatio: '5 / 7',
          perspective: '1400px',
        }}
      >
        <div
          className="relative w-full h-full transition-transform duration-700"
          style={{
            transformStyle: 'preserve-3d',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}
        >
          {/* FRONT */}
          <div
            className="absolute inset-0 rounded-xl shadow-2xl flex items-center justify-center"
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              backgroundColor: '#0a0a0a',
            }}
          >
            {hasFront ? (
              <img
                src={frontUrl}
                alt="Card front"
                className="max-w-full max-h-full object-contain rounded-xl"
                draggable={false}
              />
            ) : (
              <div className="text-xs text-txt-tertiary uppercase tracking-wider">
                No front uploaded
              </div>
            )}
          </div>

          {/* BACK */}
          <div
            className="absolute inset-0 rounded-xl shadow-2xl flex items-center justify-center"
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              backgroundColor: '#0a0a0a',
            }}
          >
            {hasBack ? (
              <img
                src={backUrl}
                alt="Card back"
                className="max-w-full max-h-full object-contain rounded-xl"
                draggable={false}
              />
            ) : (
              <div className="text-xs text-txt-tertiary uppercase tracking-wider">
                No back uploaded
              </div>
            )}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setFlipped(f => !f)}
        disabled={!canFlip}
        className="px-5 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90 active:translate-y-px disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          backgroundColor: accentColor || 'var(--surface-3)',
          color: '#fff',
        }}
      >
        {flipped ? '↻ Show Front' : '↻ Flip Card'}
      </button>
      {!canFlip && (
        <span className="text-xs text-txt-tertiary">
          Upload both front and back images to enable flipping.
        </span>
      )}
    </div>
  )
}
