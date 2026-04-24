import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useToast } from './ui/Toast'

export default function AIPromptModal({ isOpen, onClose, title, prompt }) {
  const [copied, setCopied] = useState(false)
  const { toast } = useToast()
  const textareaRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = 'unset' }
  }, [isOpen])

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
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-60 flex items-center justify-center z-[10000] py-8 px-4 sm:p-4 modal-backdrop-in"
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
        <div className="h-[3px] w-full" style={{ backgroundColor: 'var(--surface-5)' }} aria-hidden="true" />
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-surface-4">
          <h2 className="text-xl font-bold text-txt-primary">AI Prompt — {title}</h2>
          <button
            aria-label="Close"
            onClick={onClose}
            className="text-txt-tertiary hover:text-txt-primary transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-hidden flex flex-col p-4 sm:p-6 gap-4">
          <p className="text-sm text-txt-secondary leading-relaxed">
            Copy this prompt into your AI chat tool along with screenshots of the source data.
            The AI will return a tab-separated block you can paste directly into the Google Sheet starting at cell A1.
          </p>
          <textarea
            ref={textareaRef}
            readOnly
            value={prompt}
            className="flex-1 w-full min-h-[240px] rounded-md border border-surface-4 bg-surface-2 text-txt-primary text-sm font-mono p-3 resize-none focus:outline-none focus:ring-2 focus:ring-surface-5"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          />
          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent"
            >
              Close
            </button>
            <button
              onClick={handleCopy}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}
            >
              {copied ? 'Copied!' : 'Copy prompt'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
