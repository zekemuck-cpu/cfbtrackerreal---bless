import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty } from '../context/DynastyContext'
import { useToast } from './ui/Toast'
import LocalDataEntry from './ui/LocalDataEntry'
import SheetManualEntry from './ui/SheetManualEntry'
import SheetModalAIHero from './ui/SheetModalAIHero'
import { splitTsv } from '../utils/tsvParse'
import { getTeamNameOptions, getTeamNameAliases } from '../data/teamRegistry'
import {
  STAFF_MOVE_COLUMNS,
  STAFF_MOVE_ROLES,
  STAFF_MOVE_REASONS,
  buildStaffMovesPrompt,
  parseStaffMovesRows,
  staffMovesToTsv,
} from '../utils/staffMoves'
import { normalizeStaffMoveRows } from '../utils/staffMovesRealign'
import {
  createStaffMovesSheet,
  readStaffMovesFromSheet,
  deleteGoogleSheet,
} from '../services/sheetsService'

/**
 * StaffMovesModal — enter the end-of-season coaching carousel ("Staff Moves"
 * board) during the National Championship phase. Local TSV paste is the DEFAULT
 * (copy prompt -> screenshot to AI -> paste -> editable grid); Google Sheets is
 * the opt-in background. Imported moves both populate the season's Coach
 * Carousel list AND fold into the real cid coach-entity model.
 */
export default function StaffMovesModal({ isOpen, onClose, currentYear }) {
  const { currentDynasty, saveStaffMoves } = useDynasty()
  const { toast } = useToast()

  // Local paste is the default; Google Sheets is the opt-in fallback.
  const [useLocal, setUseLocal] = useState(true)
  const [sheetId, setSheetId] = useState(null)
  const [creatingSheet, setCreatingSheet] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [deletingSheet, setDeletingSheet] = useState(false)

  const yearNum = Number(currentYear)

  const aiPrompt = useMemo(
    () => buildStaffMovesPrompt({ year: yearNum, dynasty: currentDynasty }),
    [yearNum, currentDynasty]
  )

  const existingMoves = currentDynasty?.staffMovesByYear?.[yearNum]?.moves || []
  const initialText = useMemo(() => staffMovesToTsv(existingMoves), [existingMoves])

  // Team NAMES for the school combobox columns.
  const teamNameOptions = useMemo(
    () => getTeamNameOptions(currentDynasty?.teams, { includeFCS: false }),
    [currentDynasty?.teams],
  )

  const columnOptions = useMemo(() => ({
    'Prev Pos': STAFF_MOVE_ROLES,
    'New Pos': STAFF_MOVE_ROLES,
    'Reason': STAFF_MOVE_REASONS,
  }), [])

  const comboboxColumns = useMemo(() => ({
    'Prev School': teamNameOptions,
    'New School': teamNameOptions,
  }), [teamNameOptions])

  if (!isOpen) return null

  const applyMoves = async (rows) => {
    const moves = parseStaffMovesRows(rows, currentDynasty)
    if (moves.length === 0) {
      throw new Error('No staff moves found. Check the pasted output and try again.')
    }
    await saveStaffMoves(currentDynasty.id, yearNum, moves)
    toast.success(`Saved ${moves.length} staff move${moves.length === 1 ? '' : 's'}.`)
    onClose()
  }

  const handleLocalImport = async (text) => {
    await applyMoves(splitTsv(text))
  }

  const handleCreateSheet = async () => {
    setCreatingSheet(true)
    try {
      const info = await createStaffMovesSheet(
        currentDynasty?.teamName || 'Dynasty',
        yearNum,
        existingMoves,
        currentDynasty?.teams
      )
      setSheetId(info.spreadsheetId)
    } catch (err) {
      console.error('Create staff moves sheet failed:', err)
      toast.error(err?.message || 'Could not create the Google Sheet.')
    } finally {
      setCreatingSheet(false)
    }
  }

  const handleImportFromSheet = async () => {
    if (!sheetId) return
    setSyncing(true)
    try {
      const rows = await readStaffMovesFromSheet(sheetId)
      await applyMoves(rows)
    } catch (err) {
      console.error('Import staff moves from sheet failed:', err)
      toast.error(err?.message || 'Could not import from the sheet.')
    } finally {
      setSyncing(false)
    }
  }

  const handleDeleteSheet = async () => {
    if (!sheetId) return
    setDeletingSheet(true)
    try {
      await deleteGoogleSheet(sheetId)
      setSheetId(null)
    } catch (err) {
      console.error('Delete staff moves sheet failed:', err)
      toast.error(err?.message || 'Could not delete the sheet.')
    } finally {
      setDeletingSheet(false)
    }
  }

  const busy = creatingSheet || syncing || deletingSheet

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4"
      style={{ margin: 0 }}
      onMouseDown={onClose}
    >
      <div
        className="card-elevated relative w-full max-h-[calc(100dvh-4rem)] flex flex-col overflow-hidden sm:max-w-[720px] sm:h-auto"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-7 py-4 border-b border-surface-4">
          <div className="flex flex-col">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-txt-tertiary mb-0.5">Postseason</span>
            <h2 className="text-xl sm:text-2xl font-bold text-txt-primary tracking-tight tabular-nums">
              {yearNum} Staff Moves
            </h2>
          </div>
          <button
            aria-label="Close"
            onClick={onClose}
            className="text-txt-tertiary hover:text-txt-primary transition-colors -mr-1 p-1.5 rounded-md hover:bg-surface-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {useLocal ? (
            <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-5">
              <LocalDataEntry
                aiPrompt={aiPrompt}
                onImport={handleLocalImport}
                onUseGoogle={() => setUseLocal(false)}
                onCancel={onClose}
                importLabel="Import Staff Moves"
                initialText={initialText}
                columns={STAFF_MOVE_COLUMNS}
                columnOptions={columnOptions}
                normalizeRows={normalizeStaffMoveRows}
                comboboxColumns={comboboxColumns}
                comboboxAliases={getTeamNameAliases(currentDynasty?.teams)}
                instructions={`Take a screenshot of the Staff Moves board (scroll to catch every row). Upload it with the copied prompt to your AI of choice — it returns a TSV of coach moves. Paste that below. Schools use team names; leave "New School" blank for coaches who retired or left for the NFL.`}
              />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-6 flex flex-col gap-6">
              <SheetModalAIHero
                tagline="Skip the typing. Let AI fill the coaching carousel."
                buttons={[{ label: 'Copy AI Prompt', prompt: aiPrompt }]}
              />

              {sheetId ? (
                <div className="flex flex-col items-center gap-5">
                  <SheetManualEntry sheetId={sheetId} />
                  <p className="text-xs text-txt-tertiary text-center max-w-sm leading-relaxed">
                    Fill in the sheet (one row per coach), then import it back here.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button onClick={handleImportFromSheet} disabled={busy} className="btn-refined btn-refined--solid">
                      {syncing ? 'Importing…' : 'Import from sheet'}
                    </button>
                    <button onClick={handleDeleteSheet} disabled={busy} className="btn-refined">
                      {deletingSheet ? 'Deleting…' : 'Delete sheet'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <button onClick={handleCreateSheet} disabled={busy} className="btn-refined btn-refined--solid">
                    {creatingSheet ? 'Creating…' : 'Create Google Sheet'}
                  </button>
                  <p className="text-xs text-txt-tertiary text-center max-w-sm leading-relaxed">
                    Creates a Staff Moves sheet pre-filled with any existing rows, with team-abbreviation dropdowns for the school columns.
                  </p>
                </div>
              )}

              <div className="flex justify-between items-center pt-2 border-t border-surface-4">
                <button onClick={() => setUseLocal(true)} disabled={busy} className="text-xs text-txt-tertiary hover:text-txt-primary transition-colors underline decoration-dotted underline-offset-4">
                  ← Paste locally instead
                </button>
                <button onClick={onClose} disabled={busy} className="btn-refined">Close</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
