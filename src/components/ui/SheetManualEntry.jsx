/**
 * SheetManualEntry — the "edit in Google Sheets" manual-entry path
 * that renders when the user is on mobile or has opted out of the
 * embedded iframe view.
 *
 * No section heading, no eyebrow — the parent modal's
 * SheetModalHeader + SheetModalAIHero already establish what this
 * panel is. Just the 3-step instruction card and a primary green
 * "Open Google Sheets" CTA.
 *
 * Props:
 *   sheetId — the Google Sheet document ID, used to build the open URL.
 *   whatToDo — step 2 copy describing the data entry task
 *              (e.g. "Enter award winners (Player, Position, Team, Class)").
 *   tabs / tip — optional extra hints rendered inside the instruction card.
 */
export default function SheetManualEntry({ sheetId, whatToDo, tabs, tip }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center w-full text-center px-4 py-6 min-h-0">
      <div className="w-full max-w-md flex flex-col items-center">
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
          <span>Come back here, tap Save</span>
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
      <a
        href={`https://docs.google.com/spreadsheets/d/${sheetId}/edit`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md font-semibold text-sm hover:opacity-90 active:scale-[0.98] transition-all"
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
      </div>
    </div>
  )
}
