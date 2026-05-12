/**
 * SheetModalAIHero — the "AI is the primary path" hero panel that
 * sits above the sheet area in every data-entry modal. Originally
 * shipped as the canonical reference in AwardsModal; this primitive
 * makes the same treatment trivial to apply to the other 31 sheet
 * modals.
 *
 * Visual: rounded panel, 3px text-primary left rail, surface-2 bg,
 * eyebrow + tagline + description on the left, CTA(s) on the right.
 *
 * Props:
 *   tagline    — bold single-line value prop. Defaults to the
 *                AwardsModal copy. Override per-modal if a more
 *                specific framing reads better.
 *   description — secondary explanatory copy.
 *   buttons    — array of { label, onClick, disabled? }. One button
 *                renders as a single primary CTA; multiple buttons
 *                render as a row (used by BoxScoreSheetModal which
 *                has Scoring Summary + All Plays prompts).
 */
export default function SheetModalAIHero({
  tagline = 'Skip the typing. Let AI fill the sheet.',
  description = `Copy the prompt → paste into your AI assistant → paste the AI's reply into the sheet → save.`,
  buttons = [],
}) {
  if (!buttons.length) return null
  return (
    <div
      className="rounded-lg p-3 sm:p-4 border-l-[3px] flex items-center gap-3 sm:gap-4 flex-wrap"
      style={{ borderLeftColor: 'var(--text-primary)', backgroundColor: 'var(--surface-2)' }}
    >
      <div className="flex-1 min-w-[200px]">
        <div className="label-xs text-txt-tertiary mb-1" style={{ letterSpacing: '1.5px' }}>
          AI WORKFLOW · RECOMMENDED
        </div>
        <p className="text-sm text-txt-primary font-semibold">{tagline}</p>
        <p className="text-xs text-txt-secondary mt-1">{description}</p>
      </div>
      <div className="flex flex-wrap gap-2 flex-shrink-0">
        {buttons.map((btn, idx) => {
          const isPrimary = idx === 0
          return (
            <button
              key={btn.label}
              onClick={btn.onClick}
              disabled={btn.disabled}
              className={`px-4 sm:px-5 py-2.5 rounded-lg font-semibold text-sm transition-opacity disabled:opacity-60 ${
                isPrimary ? 'hover:opacity-90' : 'border border-surface-4 hover:bg-surface-3'
              }`}
              style={isPrimary
                ? { backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }
                : { color: 'var(--text-primary)' }
              }
            >
              {btn.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
