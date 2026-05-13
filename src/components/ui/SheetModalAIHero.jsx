import { useState } from 'react'

/**
 * SheetModalAIHero — the "AI is the primary path" hero panel that
 * sits above the sheet area in every data-entry modal.
 *
 * Visual: rounded panel, 3px text-primary left rail, surface-2 bg,
 * eyebrow + tagline + description on the left, CTA(s) on the right.
 *
 * Props:
 *   tagline    — bold single-line value prop.
 *   description — secondary explanatory copy.
 *   buttons    — array of button descriptors. Each entry supports:
 *                  { label, prompt }           — primary path: clicking
 *                  copies `prompt` to the clipboard and briefly flips
 *                  the button text to "Copied!" with no modal opening.
 *                  { label, onClick }          — escape hatch for
 *                  buttons that need custom behavior (still supported).
 *                One button renders as a single primary CTA; multiple
 *                buttons render as a row (used by BoxScoreSheetModal
 *                which has Scoring Summary + All Plays prompts).
 */
export default function SheetModalAIHero({
  tagline = 'Skip the typing. Let AI fill the sheet.',
  description = `Copy the prompt → paste it into your AI assistant along with screenshots from CFB 26 → the AI fills the sheet for you. Paste its TSV reply at the cell it tells you, then save.`,
  buttons = [],
}) {
  const [copiedIdx, setCopiedIdx] = useState(null)

  if (!buttons.length) return null

  const handleClick = async (btn, idx) => {
    if (btn.prompt) {
      try {
        await navigator.clipboard.writeText(btn.prompt)
        setCopiedIdx(idx)
        setTimeout(() => {
          setCopiedIdx((current) => (current === idx ? null : current))
        }, 2000)
      } catch (err) {
        // Clipboard API can fail in iframes, http://, or when permissions
        // are denied. Fall back to a textarea-select approach so the user
        // still has a chance to grab the prompt.
        console.error('Copy failed:', err)
        const ta = document.createElement('textarea')
        ta.value = btn.prompt
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        try { document.execCommand('copy') } catch { /* noop */ }
        document.body.removeChild(ta)
        setCopiedIdx(idx)
        setTimeout(() => {
          setCopiedIdx((current) => (current === idx ? null : current))
        }, 2000)
      }
      return
    }
    if (btn.onClick) btn.onClick()
  }

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
          const isCopied = copiedIdx === idx
          return (
            <button
              key={btn.label}
              onClick={() => handleClick(btn, idx)}
              disabled={btn.disabled}
              className={`px-4 sm:px-5 py-2.5 rounded-lg font-semibold text-sm transition-all disabled:opacity-60 ${
                isPrimary ? 'hover:opacity-90' : 'border border-surface-4 hover:bg-surface-3'
              }`}
              style={isPrimary
                ? { backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }
                : { color: 'var(--text-primary)' }
              }
            >
              {isCopied ? 'Copied!' : btn.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
