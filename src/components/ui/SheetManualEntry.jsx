/**
 * SheetManualEntry — the "edit in Google Sheets" manual-entry path
 * that renders when the user is on mobile or has opted out of the
 * embedded iframe view.
 *
 * Just the primary green CTA — the prior 3-step instruction card was
 * redundant chrome. The modal's SheetModalAIHero already tells the
 * user what to do, and the AI's reply leads with a "Paste this TSV
 * into cell X" line that points to the exact cell.
 *
 * Props:
 *   sheetId — the Google Sheet document ID, used to build the open URL.
 */
export default function SheetManualEntry({ sheetId }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center w-full px-4 py-6 min-h-0">
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
  )
}
