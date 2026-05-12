/**
 * SheetEntryPanel — the "open sheet / fill in / save" screen shared by
 * every Google Sheets modal. Replaces a ~30-line inline block that was
 * duplicated across 20+ modals with slightly different copy.
 *
 * Flow explained to the user in 3 plain steps:
 *   1. Open the sheet (button opens Google Sheets in a new tab)
 *   2. {whatToDo} — caller describes the specific data entry task
 *   3. Come back and click Save
 *
 * Save buttons:
 *   - "Save" (primary)       — syncs data and moves sheet to Drive trash
 *   - "Save & keep sheet"    — syncs data, leaves the sheet in Drive
 *   - "Regenerate sheet"     — deletes and creates a fresh sheet
 */
export default function SheetEntryPanel({
  sheetId,
  whatToDo,
  tabs,
  tip,
  syncing = false,
  deletingSheet = false,
  regenerating = false,
  highlightSave = false,
  onSaveAndDelete,
  onSaveAndKeep,
  onRegenerate,
  onDeleteSheetOnly,
}) {
  const busy = syncing || deletingSheet || regenerating

  return (
    <div className="flex flex-col items-center text-center w-full max-w-md mx-auto pt-2 pb-4 px-4">
      {/* Three-step explanation (no eyebrow / heading — the parent
          modal's SheetModalHeader + SheetModalAIHero already say
          what this panel is). */}
      <ol
        className="text-left text-sm space-y-2 text-txt-secondary w-full card p-4 border-l-[3px] mb-5"
        style={{ borderLeftColor: 'var(--surface-5)' }}
      >
        <li className="flex gap-3">
          <span className="font-bold text-txt-primary tabular-nums">1.</span>
          <span>Open the sheet in Google Sheets</span>
        </li>
        <li className="flex gap-3">
          <span className="font-bold text-txt-primary tabular-nums">2.</span>
          <span>{whatToDo || 'Fill in your data'}</span>
        </li>
        <li className="flex gap-3">
          <span className="font-bold text-txt-primary tabular-nums">3.</span>
          <span>Come back here and click <span className="text-txt-primary font-medium">Save</span> below</span>
        </li>
        {(tabs || tip) && (
          <li className="pt-2 mt-2 border-t border-surface-4 space-y-1.5 block">
            {tabs && (
              <p className="text-xs text-txt-tertiary">
                <span className="font-semibold text-txt-secondary">Tabs:</span> {tabs}
              </p>
            )}
            {tip && (
              <p className="text-xs text-txt-tertiary">
                <span className="font-semibold text-txt-secondary">Tip:</span> {tip}
              </p>
            )}
          </li>
        )}
      </ol>

      {/* Primary CTA — Google green */}
      <a
        href={`https://docs.google.com/spreadsheets/d/${sheetId}/edit`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md font-semibold text-sm transition-all duration-200 hover:opacity-90 active:scale-[0.98] mb-5"
        style={{ backgroundColor: '#0F9D58', color: '#FFFFFF' }}
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z" />
          <path d="M7 7h2v2H7zm0 4h2v2H7zm0 4h2v2H7zm4-8h6v2h-6zm0 4h6v2h-6zm0 4h6v2h-6z" />
        </svg>
        Open Google Sheets
        <svg className="w-3.5 h-3.5 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
        </svg>
      </a>

      {/* Save actions */}
      <div className="w-full max-w-sm flex flex-col sm:flex-row gap-2 mb-3">
        <button
          onClick={onSaveAndDelete}
          disabled={busy}
          className={`flex-1 px-5 py-2.5 rounded-md font-semibold text-sm transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed ${highlightSave ? 'animate-pulse ring-2 ring-offset-2 ring-offset-surface-1' : ''}`}
          style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}
        >
          {deletingSheet ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={onSaveAndKeep}
          disabled={busy}
          className="flex-1 px-5 py-2.5 rounded-md font-medium text-sm transition-all duration-200 bg-transparent border border-surface-5 text-txt-primary hover:bg-surface-3 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {syncing ? 'Saving…' : 'Save & keep sheet'}
        </button>
      </div>

      <p className="text-xs text-txt-tertiary mb-3 max-w-sm">
        <span className="font-medium text-txt-secondary">Save</span> moves the sheet to your Drive trash after syncing. <span className="font-medium text-txt-secondary">Save &amp; keep sheet</span> leaves it in Drive.
      </p>

      {/* Secondary destructive actions — low-visibility */}
      <div className="flex items-center gap-4 flex-wrap justify-center">
        {onDeleteSheetOnly && (
          <button
            onClick={onDeleteSheetOnly}
            disabled={busy}
            className="text-xs text-txt-tertiary hover:text-[color:var(--accent-error)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed underline decoration-dotted underline-offset-4"
          >
            Delete Sheet (No Save)
          </button>
        )}
        <button
          onClick={onRegenerate}
          disabled={busy}
          className="text-xs text-txt-tertiary hover:text-[color:var(--accent-error)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed underline decoration-dotted underline-offset-4"
        >
          {regenerating ? 'Regenerating…' : 'Something wrong? Regenerate sheet'}
        </button>
      </div>
    </div>
  )
}
