/**
 * SheetModalFooter — the unified action row at the bottom of every
 * sheet modal. Primary save actions sit on the left; tertiary
 * destructive actions + the embedded-view toggle sit on the right as
 * a tight row of dotted-underline text links to keep them visually
 * subordinate.
 *
 * Props:
 *   onSaveAndDelete, onSaveAndKeep, onDeleteSheetOnly, onRegenerate
 *     — required handlers wired straight to the parent modal's
 *       existing save/delete/regenerate flow.
 *   syncing, deletingSheet, regenerating, highlightSave
 *     — disabled / loading / highlight states propagated from the
 *       parent.
 *   regenLabel — optional override for the "Regenerate" link text
 *     (BoxScoreSheetModal uses "Reset (wipe <thing>)").
 *   regenTitle — optional `title` attribute for the regenerate
 *     link (BoxScoreSheetModal uses it to spell out exactly what
 *     stats get wiped).
 *   showEmbeddedToggle — render the "Try embedded view (beta)" /
 *     "Default view" toggle. Pass false on mobile (the embedded
 *     view doesn't work on mobile).
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
  const tertiaryButtonClass =
    'hover:text-txt-secondary transition-colors disabled:opacity-60 disabled:cursor-not-allowed underline decoration-dotted underline-offset-4'

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-surface-3">
      {/* Primary save actions — left, full-weight buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={onSaveAndDelete}
          disabled={syncing || deletingSheet}
          className={`px-4 py-2 rounded-md font-semibold text-sm hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60 ${
            highlightSave ? 'animate-pulse ring-2 ring-offset-2 ring-offset-surface-1' : ''
          }`}
          style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}
        >
          {deletingSheet ? 'Saving…' : 'Save & Move to Trash'}
        </button>
        {onSaveAndKeep && (
          <button
            onClick={onSaveAndKeep}
            disabled={syncing || deletingSheet}
            className="px-4 py-2 rounded-md font-semibold text-sm border border-surface-4 hover:bg-surface-3 text-txt-primary disabled:opacity-60 transition-colors active:scale-[0.98]"
          >
            {syncing ? 'Syncing…' : 'Save & Keep Sheet'}
          </button>
        )}
      </div>

      {/* Tertiary actions — right, subtle dotted-underline links */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-txt-tertiary">
        {onDeleteSheetOnly && (
          <button
            onClick={onDeleteSheetOnly}
            disabled={busy}
            className={tertiaryButtonClass}
          >
            {deletingSheet ? 'Deleting…' : 'Delete sheet (no save)'}
          </button>
        )}
        {onDeleteSheetOnly && onRegenerate && (
          <span className="text-txt-muted" aria-hidden="true">·</span>
        )}
        {onRegenerate && (
          <button
            onClick={onRegenerate}
            disabled={busy}
            title={regenTitle}
            className={`${tertiaryButtonClass} hover:text-[color:var(--accent-error)]`}
          >
            {regenerating ? 'Regenerating…' : (regenLabel || 'Regenerate')}
          </button>
        )}
        {showEmbeddedToggle && onToggleEmbedded && (
          <>
            <span className="text-txt-muted" aria-hidden="true">·</span>
            <button onClick={onToggleEmbedded} className={tertiaryButtonClass}>
              {useEmbedded ? 'Default view' : 'Try embedded view (beta)'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
