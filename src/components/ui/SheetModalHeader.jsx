/**
 * SheetModalHeader — the unified header for every sheet/data-entry
 * modal. Replaces the per-modal hand-rolled `text-2xl font-bold`
 * h2 + close button + 3px team-color top stripe combo with a
 * single eyebrow + title pair that matches the design system.
 *
 * Props:
 *   eyebrow — small uppercase tracked label above the title
 *             (e.g. "WEEKLY SCORES", "SEASON AWARDS"). Optional.
 *   title   — the bold title text (e.g. "2034 · Week 12").
 *   onClose — close handler.
 */
export default function SheetModalHeader({ eyebrow, title, onClose }) {
  return (
    <div className="flex items-center justify-between px-5 sm:px-7 py-4 border-b border-surface-4">
      <div className="flex flex-col min-w-0">
        <h2 className="text-xl sm:text-2xl font-bold text-txt-primary tracking-tight truncate">
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
  )
}
