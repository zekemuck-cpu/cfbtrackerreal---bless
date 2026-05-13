import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useToast } from './ui/Toast'

/**
 * AI prompt display modal.
 *
 * Props:
 *   isOpen      — modal visibility
 *   onClose     — close handler
 *   title       — sheet name shown in the header (e.g. "2034 Awards")
 *   prompt      — the full AI prompt text the user copies
 *   pasteTarget — optional. Where the user should paste the AI's reply.
 *                 Either a string (single paste target) or an array of
 *                 strings (multiple — e.g. one per tab for the All-
 *                 Conference sheet's 10 conference tabs). Rendered as
 *                 a labeled panel near the top of the modal so the
 *                 user can't miss it.
 */
export default function AIPromptModal({ isOpen, onClose, title, prompt, pasteTarget }) {
  const [copied, setCopied] = useState(false)
  const { toast } = useToast()
  const textareaRef = useRef(null)

  useEffect(() => {
    if (!isOpen) setCopied(false)
  }, [isOpen])

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(prompt)
      } else if (textareaRef.current) {
        textareaRef.current.select()
        document.execCommand('copy')
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Copy failed:', err)
      toast.error('Could not copy to clipboard. Select the text and copy manually.')
    }
  }

  if (!isOpen) return null

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[10000] py-8 px-4 sm:p-4 modal-backdrop-in"
      style={{ margin: 0 }}
      onMouseDown={(e) => {
        // Stop the mousedown from bubbling through the React tree to a parent
        // modal's backdrop handler. Without this, dismissing the AI modal also
        // closes the underlying sheet/box-score modal in the same click.
        e.stopPropagation()
        onClose()
      }}
    >
      <div
        className="card-elevated w-full sm:w-[min(720px,95vw)] max-h-[calc(100dvh-4rem)] sm:max-h-[85vh] flex flex-col overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 sm:px-7 py-4 border-b border-surface-4">
          <div className="flex flex-col min-w-0">
            <span className="label-xs text-txt-tertiary">AI Prompt</span>
            <h2 className="text-lg sm:text-xl font-bold text-txt-primary tracking-tight truncate">
              {title}
            </h2>
          </div>
          <button
            aria-label="Close"
            onClick={onClose}
            className="text-txt-tertiary hover:text-txt-primary transition-colors -mr-1 p-1.5 rounded-md hover:bg-surface-2 flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col px-5 sm:px-7 py-5 gap-4">
          <p className="text-sm text-txt-secondary leading-relaxed">
            Copy this prompt into your AI chat tool along with screenshots of the source data. The AI returns a tab-separated block you paste directly into the Google Sheet.
          </p>

          {pasteTarget && (
            <div className="rounded-md bg-surface-2 border border-surface-4 px-4 py-3">
              <p className="label-xs text-txt-tertiary mb-1.5">Paste target</p>
              {Array.isArray(pasteTarget) ? (
                <ul className="space-y-0.5 text-sm font-mono text-txt-primary">
                  {pasteTarget.map((target, i) => (
                    <li key={i} className="leading-snug">{target}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm font-mono text-txt-primary leading-snug">
                  {pasteTarget}
                </p>
              )}
            </div>
          )}

          <textarea
            ref={textareaRef}
            readOnly
            value={prompt}
            className="flex-1 w-full min-h-[240px] rounded-md bg-surface-2 border border-surface-4 hover:border-surface-5 focus:border-surface-5 text-txt-primary text-sm font-mono p-3 resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-3 transition-colors"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          />

          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <button
              onClick={onClose}
              className="btn-refined justify-center"
            >
              Close
            </button>
            <button
              onClick={handleCopy}
              className="btn-refined btn-refined--solid justify-center"
            >
              {copied ? 'Copied' : 'Copy prompt'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
