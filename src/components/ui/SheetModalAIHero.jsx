import { useState } from 'react'

/**
 * SheetModalAIHero — the "AI is the primary path" panel that sits
 * above the sheet area in every data-entry modal.
 *
 * Visual: subtle bordered card on surface-2. No team-color accent
 * stripe — the eyebrow + tagline already establish what this is.
 *
 * Props:
 *   tagline    — bold single-line value prop.
 *   description — secondary explanatory copy.
 *   buttons    — array of button descriptors. Each entry supports:
 *                  { label, prompt }   — click copies `prompt` to the
 *                  clipboard and briefly flips the label to "Copied!"
 *                  { label, onClick }  — escape hatch.
 *                One button = single primary CTA; multiple buttons
 *                render as a row.
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
        // Clipboard API can fail in iframes, http://, or with denied
        // permissions. Fall back to textarea-select.
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
      className="rounded-lg p-4 sm:p-5 bg-surface-2 border border-surface-4"
    >
      <div className="label-xs text-txt-tertiary mb-2" style={{ letterSpacing: '1.5px' }}>
        AI WORKFLOW · RECOMMENDED
      </div>
      <p className="text-base sm:text-lg text-txt-primary font-bold leading-snug">
        {tagline}
      </p>
      <p className="text-sm text-txt-secondary mt-2 leading-relaxed">
        {description}
      </p>
      <div className="flex flex-wrap gap-2 mt-4">
        {buttons.map((btn, idx) => {
          const isPrimary = idx === 0
          const isCopied = copiedIdx === idx
          return (
            <button
              key={btn.label}
              onClick={() => handleClick(btn, idx)}
              disabled={btn.disabled}
              className={`px-4 py-2 rounded-md font-semibold text-sm transition-all active:scale-[0.98] disabled:opacity-60 ${
                isPrimary
                  ? 'hover:opacity-90'
                  : 'border border-surface-4 hover:bg-surface-3'
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
