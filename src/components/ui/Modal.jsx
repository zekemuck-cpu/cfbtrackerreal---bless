import { useEffect } from 'react'

/**
 * Base modal shell.
 *
 * Enforces the backdrop pattern documented in CLAUDE.md (full-viewport
 * coverage with explicit inset-0 + margin:0 + high z-index). All new
 * modals should compose this instead of rolling their own backdrop.
 *
 * Props:
 *   isOpen:   boolean — whether the modal is rendered
 *   onClose:  () => void — backdrop click / ESC / close button
 *   title?:   string — shown in the modal header
 *   size?:    'sm' | 'md' | 'lg' | 'xl' | 'full' (default 'md')
 *   footer?:  ReactNode — rendered in a sticky footer band
 *   children: ReactNode — modal body content
 *   closeOnBackdrop?: boolean (default true)
 *   closeOnEscape?:   boolean (default true)
 *   hideClose?: boolean — hide the header close button (e.g. during an
 *                         atomic operation the user shouldn't interrupt)
 *   accent?:  string — optional CSS color for the top accent stripe
 *                      (defaults to team color via var(--team-primary))
 */
const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
  full: 'max-w-[95vw]',
}

export default function Modal({
  isOpen,
  onClose,
  title,
  size = 'md',
  footer,
  children,
  closeOnBackdrop = true,
  closeOnEscape = true,
  hideClose = false,
  accent,
}) {
  useEffect(() => {
    if (!isOpen || !closeOnEscape) return
    const handler = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, closeOnEscape, onClose])

  useEffect(() => {
    if (!isOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [isOpen])

  if (!isOpen) return null

  const sizeClass = SIZES[size] || SIZES.md

  return (
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-60 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4 modal-backdrop-in"
      style={{ margin: 0 }}
      onMouseDown={(e) => {
        if (hideClose) return
        if (closeOnBackdrop && e.target === e.currentTarget) onClose?.()
      }}
    >
      <div
        className={`w-full ${sizeClass} card-elevated flex flex-col max-h-[90dvh] overflow-hidden modal-panel-in`}
        role="dialog"
        aria-modal="true"
        aria-label={title || undefined}
      >
        <div
          className="h-[3px] w-full flex-shrink-0"
          style={{ backgroundColor: accent || 'var(--team-primary)' }}
          aria-hidden="true"
        />

        {title && (
          <header className="px-6 py-4 border-b border-surface-4 flex items-center justify-between flex-shrink-0">
            <h2 className="text-display-md text-txt-primary m-0">{title}</h2>
            {!hideClose && (
              <button
                onClick={onClose}
                className="p-1.5 rounded-md text-txt-tertiary hover:text-txt-primary hover:bg-surface-3 transition-colors"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </header>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>

        {footer && (
          <footer className="px-6 py-4 border-t border-surface-4 flex items-center justify-end gap-3 flex-shrink-0 bg-surface-2">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}
