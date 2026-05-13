/**
 * SheetModalFooter — the unified bottom action row for every sheet
 * modal. Two visual groups:
 *
 *   Left:  tertiary actions  — Delete sheet · Reset · Embedded view
 *          (small dotted-underline text links, visually subordinate)
 *   Right: primary saves     — Save & keep sheet · Save
 *          (medium buttons, primary filled, secondary bordered)
 *
 * Desktop: single row, tertiary anchored left, primary anchored right.
 * Mobile: stacks vertically with primary buttons ON TOP (the main
 * action should be reachable without scrolling), tertiary actions
 * below as a compact text-link row.
 *
 * Props:
 *   onSaveAndDelete, onSaveAndKeep, onDeleteSheetOnly, onRegenerate
 *     — required handlers wired to the parent modal's existing flow.
 *   syncing, deletingSheet, regenerating, highlightSave
 *     — disabled / loading / highlight states propagated from parent.
 *   regenLabel — optional override for the "Regenerate" link text
 *     (BoxScoreSheetModal uses "Reset (wipe <thing>)").
 *   regenTitle — optional `title` tooltip for the regenerate link.
 *   showEmbeddedToggle — render the "Try embedded view (beta)" /
 *     "Default view" toggle. Pass false on mobile.
 *   useEmbedded, onToggleEmbedded — toggle state + handler.
 */
export default function SheetModalFooter({
  syncing = false,
  deletingSheet = false,
  regenerating = false,
  highlightSave = false,
  onSaveAndDelete,
  onSaveAndKeep,
  onDeleteSheetOnly,
  onRegenerate,
  regenLabel,
  regenTitle,
  showEmbeddedToggle = false,
  useEmbedded = false,
  onToggleEmbedded,
}) {
  const busy = syncing || deletingSheet || regenerating
  const tertiaryClass =
    'text-xs text-txt-tertiary hover:text-txt-secondary transition-colors disabled:opacity-60 disabled:cursor-not-allowed underline decoration-dotted underline-offset-4'
  const tertiarySeparator = (
    <span className="text-txt-muted text-xs" aria-hidden="true">·</span>
  )

  return (
    <div className="flex flex-col gap-3 pt-4 border-t border-surface-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      {/* Tertiary actions — appears BELOW primary on mobile, LEFT on desktop */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 order-2 sm:order-1">
        {onDeleteSheetOnly && (
          <button onClick={onDeleteSheetOnly} disabled={busy} className={tertiaryClass}>
            {deletingSheet ? 'Deleting…' : 'Delete sheet'}
          </button>
        )}
        {onDeleteSheetOnly && onRegenerate && tertiarySeparator}
        {onRegenerate && (
          <button
            onClick={onRegenerate}
            disabled={busy}
            title={regenTitle}
            className={`${tertiaryClass} hover:text-[color:var(--accent-error)]`}
          >
            {regenerating ? 'Regenerating…' : (regenLabel || 'Reset')}
          </button>
        )}
        {showEmbeddedToggle && onToggleEmbedded && (
          <>
            {tertiarySeparator}
            <button onClick={onToggleEmbedded} className={tertiaryClass}>
              {useEmbedded ? 'Default view' : 'Embedded view (beta)'}
            </button>
          </>
        )}
      </div>

      {/* Primary save actions — appears ABOVE tertiary on mobile, RIGHT on desktop */}
      <div className="flex items-center gap-2 order-1 sm:order-2">
        {onSaveAndKeep && (
          <button
            onClick={onSaveAndKeep}
            disabled={syncing || deletingSheet}
            className="flex-1 sm:flex-none px-4 py-2 rounded-md font-semibold text-sm border border-surface-4 hover:bg-surface-3 text-txt-primary disabled:opacity-60 transition-colors active:scale-[0.98]"
          >
            {syncing ? 'Syncing…' : 'Save & keep'}
          </button>
        )}
        <button
          onClick={onSaveAndDelete}
          disabled={syncing || deletingSheet}
          className={`flex-1 sm:flex-none px-4 py-2 rounded-md font-semibold text-sm hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60 ${
            highlightSave ? 'animate-pulse ring-2 ring-offset-2 ring-offset-surface-1' : ''
          }`}
          style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}
        >
          {deletingSheet ? 'Saving…' : 'Save & close'}
        </button>
      </div>
    </div>
  )
}
