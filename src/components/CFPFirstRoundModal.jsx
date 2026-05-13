import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import SheetModalHeader from './ui/SheetModalHeader'
import SheetModalAIHero from './ui/SheetModalAIHero'
import SheetModalFooter from './ui/SheetModalFooter'
import SheetManualEntry from './ui/SheetManualEntry'
import AuthErrorModal from './AuthErrorModal'
import { useAuthErrorHandler } from '../hooks/useAuthErrorHandler'
import SheetToolbar from './SheetToolbar'
import { getModalColors } from '../utils/colorUtils'
import { buildAIPrompt } from '../utils/aiPrompt'
import SheetLoadingHint from './SheetLoadingHint'
import {
  createCFPFirstRoundSheet,
  readCFPFirstRoundFromSheet,
  deleteGoogleSheet,
  getSheetEmbedUrl
} from '../services/sheetsService'

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export default function CFPFirstRoundModal({ isOpen, onClose, onSave, currentYear, teamColors }) {
  const { currentDynasty } = useDynasty()
  const { user, signOut } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [syncing, setSyncing] = useState(false)
  const [deletingSheet, setDeletingSheet] = useState(false)
  const [creatingSheet, setCreatingSheet] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [sheetId, setSheetId] = useState(null)
  const [showDeletedNote, setShowDeletedNote] = useState(false)
  const auth = useAuthErrorHandler()
  const [isMobile, setIsMobile] = useState(false)

  const [useEmbedded, setUseEmbedded] = useState(() => {
    return localStorage.getItem('sheetEmbedPreference') === 'true'
  })
  const [highlightSave, setHighlightSave] = useState(false)

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} CFP First Round Results`,
    structure: `This sheet has ONE tab: "CFP First Round". It contains 4 First Round games (seeds 5 through 12 play; seeds 1-4 have byes).

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. OUTPUT COLUMNS B, C, D, E ONLY (4 values per row). Column A (Game label) is PROTECTED and pre-filled — never output it.
2. ROW ORDER IS FIXED (see the table below). Never reorder the rows — rows are keyed to the pre-filled Game column.
3. Output EXACTLY 4 data rows, each with EXACTLY 4 tab-separated values.
4. NO COMMAS in numbers. Output "24" never "024", never "1,234".
5. INTEGERS ONLY for scores — no decimals, no "pts", no minus signs, no plus signs.
6. TEAM ABBREVIATIONS ONLY (columns B and C) — use the abbreviation mapping below. Never full names, nicknames, cities, or mascots. Columns B and C are strict dropdowns.
7. BLANK CELL if unknown. Never guess, never use "N/A", "TBD", dash, or zero (0 is a real score).
   - If an entire game hasn't been played yet: leave all 4 cells blank (empty tab-separated fields).
   - If only the teams are known but not scores: fill Higher Seed + Lower Seed, leave score cells blank.
8. No header row, no column labels, no pre-filled Game text, no commentary or explanation INSIDE the data. The paste-target label above the fence is required (see Method A/B rules above).
9. ONE TSV block — preceded by the paste-target label line as required by the Method A/B rules above.

═══════════════════════════════════════════════════════════
TAB: "CFP First Round" — 4 rows × 4 editable columns
Paste your block at cell B2 of the "CFP First Round" tab
═══════════════════════════════════════════════════════════

Each row is one game. Column A (Game) is pre-filled/protected. You output columns B through E in order: Higher Seed, Lower Seed, Higher Score, Lower Score.

Row | Col A (PROTECTED / pre-filled) | Col B (Higher Seed) | Col C (Lower Seed) | Col D (Higher Score) | Col E (Lower Score)
----+--------------------------------+---------------------+--------------------+----------------------+--------------------
  1 | Game 1 (5 vs 12)               | #5 seed team abbr   | #12 seed team abbr | points by #5 seed    | points by #12 seed
  2 | Game 2 (6 vs 11)               | #6 seed team abbr   | #11 seed team abbr | points by #6 seed    | points by #11 seed
  3 | Game 3 (7 vs 10)               | #7 seed team abbr   | #10 seed team abbr | points by #7 seed    | points by #10 seed
  4 | Game 4 (8 vs 9)                | #8 seed team abbr   | #9 seed team abbr  | points by #8 seed    | points by #9 seed

Column B and Column C: STRICT dropdown of team abbreviations — use ONLY values from the TEAM ABBREVIATIONS mapping at the bottom of this prompt.
Column D and Column E: INTEGER scores (0 or higher), no commas, no decimal point.

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== CFP FIRST ROUND — paste at cell B2 of "CFP First Round" tab ===
<row1 HigherSeed>\\t<row1 LowerSeed>\\t<row1 HigherScore>\\t<row1 LowerScore>
<row2 HigherSeed>\\t<row2 LowerSeed>\\t<row2 HigherScore>\\t<row2 LowerScore>
<row3 HigherSeed>\\t<row3 LowerSeed>\\t<row3 HigherScore>\\t<row3 LowerScore>
<row4 HigherSeed>\\t<row4 LowerSeed>\\t<row4 HigherScore>\\t<row4 LowerScore>

(Each \\t above represents a LITERAL TAB character — use actual tab characters in your output, not the text "\\t".)

═══════════════════════════════════════════════════════════
FINAL CHECK before you send the answer
═══════════════════════════════════════════════════════════
[ ] Exactly 4 data rows (not 3, not 5)
[ ] Exactly 4 tab-separated values per row (3 tab characters per line)
[ ] Row order is 5v12, 6v11, 7v10, 8v9 — matches the protected Game column
[ ] Columns B and C use team ABBREVIATIONS only, from the mapping
[ ] Columns D and E are INTEGERS only (no commas, no decimals)
[ ] Blank cell for any unknown value — invented nothing
[ ] Winner is implied by the higher of the two scores; I did not add a winner column`,
    includeTeamMap: true,
    dynastyTeams: currentDynasty?.teams,
  }), [currentYear, currentDynasty?.teams])

  const creatingSheetRef = useRef(false)

  const modalColors = useMemo(() => getModalColors(teamColors), [teamColors])

  useEffect(() => {
    setIsMobile(isMobileDevice())
    const handleResize = () => setIsMobile(isMobileDevice())
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }

    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !sheetId || useEmbedded) return

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setHighlightSave(true)
        setTimeout(() => setHighlightSave(false), 5000)
      }
    }

    const handleFocus = () => {
      setHighlightSave(true)
      setTimeout(() => setHighlightSave(false), 5000)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [isOpen, sheetId, useEmbedded])

  useEffect(() => {
    const createSheet = async () => {
      if (isOpen && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote) {
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          const existingFirstRound = currentDynasty?.cfpResultsByYear?.[currentYear]?.firstRound || []

          const sheetInfo = await createCFPFirstRoundSheet(
            currentDynasty?.teamName || 'Dynasty',
            currentYear,
            existingFirstRound,
            currentDynasty?.teams || currentDynasty?.customTeams
          )
          setSheetId(sheetInfo.spreadsheetId)
        } catch (error) {
          console.error('Failed to create CFP First Round sheet:', error)
          if (!auth.handleError(error)) {
            toast.error('Failed to create the CFP First Round sheet — try again or contact support.')
          }
        } finally {
          setCreatingSheet(false)
          creatingSheetRef.current = false
        }
      }
    }

    createSheet()
  }, [isOpen, user, sheetId, creatingSheet, currentDynasty?.id, auth.retryCount, showDeletedNote])

  useEffect(() => {
    if (!isOpen) {
      setShowDeletedNote(false)
      setSheetId(null)
      creatingSheetRef.current = false
    }
  }, [isOpen])

  const handleSyncFromSheet = async () => {
    if (!sheetId) return

    setSyncing(true)
    try {
      const games = await readCFPFirstRoundFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(games)
      onClose()
    } catch (error) {
      toast.error('Failed to sync from Google Sheets. Make sure all 4 games are entered with scores.')
      console.error(error)
    } finally {
      setSyncing(false)
    }
  }

  const handleSyncAndDelete = async () => {
    if (!sheetId) return

    setDeletingSheet(true)
    try {
      const games = await readCFPFirstRoundFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(games)

      await deleteGoogleSheet(sheetId)

      setSheetId(null)
      setShowDeletedNote(true)
      setTimeout(() => {
        onClose()
      }, 2500)
    } catch (error) {
      toast.error('Failed to sync from Google Sheets.')
      console.error(error)
    } finally {
      setDeletingSheet(false)
    }
  }

  const handleRegenerateSheet = async () => {
    if (!sheetId) return
    const confirmed = await confirm({
      title: 'Regenerate sheet?',
      message: "This will delete your current sheet and create a fresh one. Any unsaved data will be lost.",
      confirmLabel: 'Regenerate',
      variant: 'danger',
    })
    if (!confirmed) return
    setRegenerating(true)
    try {
      await deleteGoogleSheet(sheetId)
      setSheetId(null)
      auth.retry()
    } catch (error) {
      console.error('Failed to regenerate sheet:', error)
      if (!auth.handleError(error)) {
        toast.error('Failed to regenerate sheet. Please try again.')
      }
    } finally {
      setRegenerating(false)
    }
  }

  const handleDeleteSheetOnly = async () => {
    if (!sheetId || !currentDynasty) return
    const ok = await confirm({
      title: 'Delete this CFP First Round sheet?',
      message: 'This deletes the Google Sheet without applying any edits. Your dynasty CFP results stay as-is.',
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (!ok) return
    setDeletingSheet(true)
    try {
      await deleteGoogleSheet(sheetId)
      setSheetId(null)
      setShowDeletedNote(true)
      setTimeout(() => onClose(), 1800)
    } catch (error) {
      console.error('Failed to delete sheet:', error)
      if (!auth.handleError(error)) {
        toast.error('Failed to delete the sheet — try again.')
      }
    } finally {
      setDeletingSheet(false)
    }
  }

  const handleClose = () => {
    onClose()
  }

  if (!isOpen) return null

  const embedUrl = sheetId ? getSheetEmbedUrl(sheetId, 'CFP First Round') : null
  const isLoading = creatingSheet

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4 modal-backdrop-in"
      style={{ margin: 0 }}
      onMouseDown={handleClose}
    >
      <div
        className={`card-elevated w-full max-h-[calc(100dvh-4rem)] flex flex-col overflow-hidden ${
          useEmbedded
            ? 'sm:w-[95vw] sm:h-[95dvh]'
            : 'sm:max-w-[680px] sm:h-auto'
        }`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <SheetModalHeader eyebrow="College Football Playoff" title={`${currentYear} CFP First Round`} onClose={handleClose} />

        <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div
                className="animate-spin w-12 h-12 border-4 rounded-full mx-auto mb-4"
                style={{
                  borderColor: 'var(--text-primary)',
                  borderTopColor: 'transparent'
                }}
              />
              <p className="text-lg font-semibold text-txt-primary">
                Creating CFP First Round Sheet...
              </p>
              <p className="text-sm mt-2 text-txt-tertiary">
                Setting up 4 First Round games (seeds 5-12)
              </p>
              <SheetLoadingHint active={isLoading} />
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="card p-8 border-l-[3px] text-center max-w-sm" style={{ borderLeftColor: 'var(--surface-5)' }}>
              <p className="label-xs text-txt-tertiary mb-2">Status</p>
              <p className="text-xl font-bold text-txt-primary mb-2">Saved &amp; Moved to Trash</p>
              <p className="text-sm text-txt-secondary">
                CFP First Round results saved to your dynasty.
              </p>
            </div>
          </div>
        ) : sheetId ? (
          <div className="flex-1 flex flex-col overflow-hidden gap-3">
            <SheetModalAIHero
              tagline="Skip the typing. Let AI fill the CFP First Round."
              buttons={[{ label: 'Copy AI Prompt', prompt: aiPrompt }]}
            />
            {isMobile || !useEmbedded ? (
              <SheetManualEntry sheetId={sheetId} />
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden min-h-0 border border-surface-4 rounded-lg">
                <SheetToolbar sheetId={sheetId} embedUrl={embedUrl} teamColors={teamColors} title="CFP First Round" />
              </div>
            )}
            <SheetModalFooter
              syncing={syncing}
              deletingSheet={deletingSheet}
              regenerating={regenerating}
              highlightSave={highlightSave}
              onSaveAndDelete={handleSyncAndDelete}
              onSaveAndKeep={handleSyncFromSheet}
              onDeleteSheetOnly={handleDeleteSheetOnly}
              onRegenerate={handleRegenerateSheet}
              showEmbeddedToggle={!isMobile}
              useEmbedded={useEmbedded}
              onToggleEmbedded={() => { const newValue = !useEmbedded; setUseEmbedded(newValue); localStorage.setItem('sheetEmbedPreference', newValue.toString()); }}
            />
          </div>
        ) : null}
        </div>
      </div>

      <AuthErrorModal
        isOpen={auth.showAuthError}
        onClose={auth.closeAuthError}
        onRefresh={auth.retry}
        teamColors={teamColors}
      />
    </div>,
    document.body
  )
}
