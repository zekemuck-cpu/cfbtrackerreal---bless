import { createPortal } from 'react-dom'
import { RECAP_DEPTH_OPTIONS } from '../services/geminiService'

/**
 * Recap Settings modal — surfaces two sliders that control how "Copy AI
 * Prompt" builds its prompt:
 *
 *   1. Voice / Perspective  (5 stops: team1Fan → neutral → team2Fan)
 *   2. Length / Depth       (10 stops: Scoreline → Epic)
 *
 * Both settings are persisted in localStorage and are read/written by the
 * parent (GameEntryModal / GameEdit) so the active values live in their
 * scope alongside the copy-prompt logic.
 *
 * UX: rendered as a portal with a full-screen backdrop so clicking anywhere
 * outside the panel closes it — fixes the "hard to dismiss" issue of the old
 * absolute-positioned popover.
 */
export default function RecapSettingsModal({
  isOpen,
  onClose,
  // Perspective props
  perspectiveOptions,   // [{ key, label, blurb }] — team names baked in by parent
  perspective,
  onPerspectiveChange,
  // Depth props
  depth,
  onDepthChange,
}) {
  if (!isOpen) return null

  const perspIdx = Math.max(0, perspectiveOptions.findIndex(p => p.key === perspective))
  const currentPersp = perspectiveOptions[perspIdx] || perspectiveOptions[Math.floor(perspectiveOptions.length / 2)]

  const depthIdx = Math.max(0, RECAP_DEPTH_OPTIONS.findIndex(d => d.key === depth))
  const currentDepth = RECAP_DEPTH_OPTIONS[depthIdx] || RECAP_DEPTH_OPTIONS[5] // 'standard'

  // Section label style
  const sectionLabel = {
    display: 'block',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '2px',
    textTransform: 'uppercase',
    color: 'var(--text-tertiary)',
    marginBottom: '6px',
  }

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 flex items-center justify-center z-[10001] p-4"
      style={{ margin: 0, backgroundColor: 'rgba(0,0,0,0.65)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-sm rounded-xl shadow-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--surface-2)',
          border: '1px solid var(--surface-5)',
          boxShadow: '0 30px 60px -20px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.02) inset',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--surface-4)' }}
        >
          <span
            className="font-bold"
            style={{ fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}
          >
            Recap Settings
          </span>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-md transition-colors hover:bg-surface-3"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Settings body */}
        <div className="px-5 py-5 space-y-6">

          {/* ── Setting 1: Voice / Perspective ── */}
          <div>
            <span style={sectionLabel}>Voice</span>
            <div
              className="text-sm font-semibold mb-0.5"
              style={{ color: 'var(--text-primary)' }}
            >
              {currentPersp.label}
            </div>
            <p
              className="text-xs leading-snug mb-3"
              style={{ color: 'var(--text-secondary)' }}
            >
              {currentPersp.blurb}
            </p>
            <input
              type="range"
              min={0}
              max={perspectiveOptions.length - 1}
              step={1}
              value={perspIdx}
              onChange={(e) => onPerspectiveChange(perspectiveOptions[Number(e.target.value)].key)}
              className="w-full"
            />
            <div
              className="flex justify-between mt-1.5"
              style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}
            >
              <span className="max-w-[72px] leading-tight">{perspectiveOptions[0]?.label}</span>
              <span className="leading-tight">{perspectiveOptions[Math.floor(perspectiveOptions.length / 2)]?.label}</span>
              <span className="max-w-[72px] text-right leading-tight">{perspectiveOptions[perspectiveOptions.length - 1]?.label}</span>
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: '1px', backgroundColor: 'var(--surface-4)', margin: '0 -20px' }} />

          {/* ── Setting 2: Length / Depth ── */}
          <div>
            <span style={sectionLabel}>Length</span>
            <div className="flex items-baseline gap-2 mb-0.5">
              <span
                className="text-sm font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                {currentDepth.label}
              </span>
              {currentDepth.wordTarget && (
                <span
                  className="text-xs"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {currentDepth.wordTarget} words
                </span>
              )}
            </div>
            <p
              className="text-xs leading-snug mb-3"
              style={{ color: 'var(--text-secondary)' }}
            >
              {currentDepth.blurb}
            </p>
            <input
              type="range"
              min={0}
              max={RECAP_DEPTH_OPTIONS.length - 1}
              step={1}
              value={depthIdx}
              onChange={(e) => onDepthChange(RECAP_DEPTH_OPTIONS[Number(e.target.value)].key)}
              className="w-full"
            />
            <div
              className="flex justify-between mt-1.5"
              style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}
            >
              <span>{RECAP_DEPTH_OPTIONS[0].label}</span>
              <span>{RECAP_DEPTH_OPTIONS[5].label}</span>
              <span>{RECAP_DEPTH_OPTIONS[RECAP_DEPTH_OPTIONS.length - 1].label}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="px-5 py-3"
          style={{ borderTop: '1px solid var(--surface-4)' }}
        >
          <p
            className="italic"
            style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}
          >
            Settings are saved across games. Changes apply the next time you copy the prompt.
          </p>
        </div>
      </div>
    </div>,
    document.body
  )
}
