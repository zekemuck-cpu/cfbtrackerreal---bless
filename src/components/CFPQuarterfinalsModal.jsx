import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import SheetModalHeader from './ui/SheetModalHeader'
import SheetModalAIHero from './ui/SheetModalAIHero'
import SheetManualEntry from './ui/SheetManualEntry'
import AuthErrorModal from './AuthErrorModal'
import { useAuthErrorHandler } from '../hooks/useAuthErrorHandler'
import AIPromptModal from './AIPromptModal'
import SheetToolbar from './SheetToolbar'
import {
  createCFPQuarterfinalsSheet,
  readCFPQuarterfinalsFromSheet,
  deleteGoogleSheet,
  getSheetEmbedUrl
} from '../services/sheetsService'
import { getModalColors } from '../utils/colorUtils'
import { buildAIPrompt } from '../utils/aiPrompt'
import SheetLoadingHint from './SheetLoadingHint'

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export default function CFPQuarterfinalsModal({ isOpen, onClose, onSave, currentYear, teamColors }) {
  const { currentDynasty } = useDynasty()
  const { user, signOut } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const modalColors = useMemo(() => getModalColors(teamColors), [teamColors])
  const [syncing, setSyncing] = useState(false)
  const [deletingSheet, setDeletingSheet] = useState(false)
  const [creatingSheet, setCreatingSheet] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [sheetId, setSheetId] = useState(null)
  const [showDeletedNote, setShowDeletedNote] = useState(false)
  const auth = useAuthErrorHandler()
  const [isMobile, setIsMobile] = useState(false)

  const [useEmbedded, setUseEmbedded] = useState(() => {
    // Load preference from localStorage
    return localStorage.getItem('sheetEmbedPreference') === 'true'
  })
  const [highlightSave, setHighlightSave] = useState(false)
  const [showAIPrompt, setShowAIPrompt] = useState(false)

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} CFP Quarterfinals Results`,
    structure: `This sheet has ONE tab: "CFP Quarterfinals". It contains 4 quarterfinal bowl games (each pairing a bye seed 1-4 against a First Round winner from seeds 5-12).

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. OUTPUT COLUMNS B, C, D, E, F ONLY (5 values per row). Column A (Bowl Game) is pre-filled and must not be changed.
2. ROW ORDER IS FIXED (bracket display order): row 1 = seed-4 bye bowl, row 2 = seed-1 bye bowl, row 3 = seed-3 bye bowl, row 4 = seed-2 bye bowl. Rows are keyed to the pre-filled Bowl Game column — do not reorder.
3. Output EXACTLY 4 data rows, each with EXACTLY 5 tab-separated values.
4. NO COMMAS in numbers. Output "28" never "1,234".
5. INTEGERS ONLY for scores — no decimals, no "pts", no minus signs.
6. TEAM ABBREVIATIONS ONLY (columns B, C, F) — use the abbreviation mapping below. Never full names, nicknames, cities, or mascots.
7. WINNER (column F) must EXACTLY equal whichever abbreviation in that row's columns B or C has the higher score. If the two scores are tied or blank, leave Winner blank.
8. BLANK CELL if unknown. Never guess, never use "N/A", "TBD", dash. Zero (0) is only valid if the team truly scored zero.
   - If an entire game hasn't been played: leave all 5 cells blank.
   - If teams are known but scores aren't: fill columns B and C only; leave D, E, F blank.
9. Team 1 (column B) is always the bye seed (1, 2, 3, or 4). Team 2 (column C) is always the First Round winner that advanced into that bowl. Do not swap them.
10. No header row, no Bowl Game text, no commentary, no explanation.
11. SINGLE TSV block labeled by tab name and paste cell.

═══════════════════════════════════════════════════════════
TAB: "CFP Quarterfinals" — 4 rows × 5 editable columns
Paste your block at cell B2 of the "CFP Quarterfinals" tab
═══════════════════════════════════════════════════════════

Column A (Bowl Game) shows which CFP bowl game hosts that matchup — the specific bowl names (Sugar, Cotton, Rose, Orange, or whatever the user configured) are already pre-filled and must not be changed. Focus on the 5 editable columns below.

Row | Col A (PROTECTED)    | Col B (Team 1 = bye seed) | Col C (Team 2 = First Round winner) | Col D (Team 1 Score) | Col E (Team 2 Score) | Col F (Winner)
----+----------------------+---------------------------+-------------------------------------+----------------------+----------------------+--------------------------------
  1 | bowl hosting seed-4  | #4 seed team abbr         | winner of 5-vs-12 First Round game  | integer              | integer              | abbr matching higher scorer
  2 | bowl hosting seed-1  | #1 seed team abbr         | winner of 8-vs-9 First Round game   | integer              | integer              | abbr matching higher scorer
  3 | bowl hosting seed-3  | #3 seed team abbr         | winner of 6-vs-11 First Round game  | integer              | integer              | abbr matching higher scorer
  4 | bowl hosting seed-2  | #2 seed team abbr         | winner of 7-vs-10 First Round game  | integer              | integer              | abbr matching higher scorer

Columns B, C, F: team abbreviation from the TEAM ABBREVIATIONS mapping below.
Columns D, E: integer score (0 or higher), no commas, no decimal point.
Column F (Winner) rule: Winner === (Team 1 Score > Team 2 Score) ? Team 1 abbr : Team 2 abbr. Winner MUST equal whichever of columns B/C has the higher score.

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== CFP QUARTERFINALS — paste at cell B2 of "CFP Quarterfinals" tab ===
<row1 Team1>\\t<row1 Team2>\\t<row1 T1Score>\\t<row1 T2Score>\\t<row1 Winner>
<row2 Team1>\\t<row2 Team2>\\t<row2 T1Score>\\t<row2 T2Score>\\t<row2 Winner>
<row3 Team1>\\t<row3 Team2>\\t<row3 T1Score>\\t<row3 T2Score>\\t<row3 Winner>
<row4 Team1>\\t<row4 Team2>\\t<row4 T1Score>\\t<row4 T2Score>\\t<row4 Winner>

(Each \\t above represents a LITERAL TAB character — use actual tab characters in your output, not the text "\\t".)

═══════════════════════════════════════════════════════════
FINAL CHECK before you send the answer
═══════════════════════════════════════════════════════════
[ ] Exactly 4 data rows (not 3, not 5)
[ ] Exactly 5 tab-separated values per row (4 tab characters per line)
[ ] Row order: seed-4 bowl, seed-1 bowl, seed-3 bowl, seed-2 bowl (matches the protected Bowl Game column)
[ ] Columns B and C use TEAM ABBREVIATIONS only
[ ] Team 1 is always the bye seed, Team 2 is always the First Round winner (not swapped)
[ ] Scores are INTEGERS only, no commas or decimals
[ ] Winner column matches the team abbreviation with the higher score (or blank if tied/unknown)
[ ] Blank cells for any unknowns — I invented nothing`,
    includeTeamMap: true,
    dynastyTeams: currentDynasty?.teams,
  }), [currentYear, currentDynasty?.teams])

  // Ref to prevent concurrent sheet creation (state updates are async, refs are immediate)
  const creatingSheetRef = useRef(false)

  useEffect(() => {
    setIsMobile(isMobileDevice())
    const handleResize = () => setIsMobile(isMobileDevice())
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Prevent body scroll when modal is open
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

  // Highlight save button when user returns to the window
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

  // Create CFP Quarterfinals sheet when modal opens
  useEffect(() => {
    const createSheet = async () => {
      if (isOpen && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote) {
        // Set ref immediately to prevent concurrent calls (state updates are async)
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          // Get CFP seeds and First Round results for team auto-fill
          const cfpSeeds = currentDynasty?.cfpSeedsByYear?.[currentYear] || []
          const firstRoundResults = currentDynasty?.cfpResultsByYear?.[currentYear]?.firstRound || []
          // Get existing quarterfinals data for pre-filling scores
          const existingQuarterfinals = currentDynasty?.cfpResultsByYear?.[currentYear]?.quarterfinals || []
          // Get bowl configuration for correct bowl name assignments
          const bowlConfig = currentDynasty?.cfpBowlConfigByYear?.[currentYear] || null

          const sheetInfo = await createCFPQuarterfinalsSheet(
            currentDynasty?.teamName || 'Dynasty',
            currentYear,
            cfpSeeds,
            firstRoundResults,
            existingQuarterfinals,
            bowlConfig,
            currentDynasty?.teams || currentDynasty?.customTeams
          )
          setSheetId(sheetInfo.spreadsheetId)
        } catch (error) {
          console.error('Failed to create CFP Quarterfinals sheet:', error)
          auth.handleError(error)
        } finally {
          setCreatingSheet(false)
          creatingSheetRef.current = false
        }
      }
    }

    createSheet()
  }, [isOpen, user, sheetId, creatingSheet, currentDynasty?.id, auth.retryCount, showDeletedNote])

  // Reset state when modal closes
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
      const games = await readCFPQuarterfinalsFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(games)
      onClose()
    } catch (error) {
      console.error(error)
      if (!auth.handleError(error)) {
        toast.error('Failed to sync from Google Sheets. Make sure all 4 games have scores entered.')
      }
    } finally {
      setSyncing(false)
    }
  }

  const handleSyncAndDelete = async () => {
    if (!sheetId) return

    setDeletingSheet(true)
    try {
      const games = await readCFPQuarterfinalsFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(games)

      // Move sheet to trash (keep sheet ID stored so user can restore if needed)
      await deleteGoogleSheet(sheetId)

      setSheetId(null)
      setShowDeletedNote(true)
      setTimeout(() => {
        onClose()
      }, 2500)
    } catch (error) {
      console.error(error)
      if (!auth.handleError(error)) {
        toast.error('Failed to sync from Google Sheets.')
      }
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
      title: 'Delete this CFP Quarterfinals sheet?',
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

  const embedUrl = sheetId ? getSheetEmbedUrl(sheetId, 'CFP Quarterfinals') : null
  const isLoading = creatingSheet

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4 modal-backdrop-in"
      style={{ margin: 0 }}
      onMouseDown={handleClose}
    >
      <div
        className="card-elevated w-full sm:w-[95vw] max-h-[calc(100dvh-4rem)] sm:h-[95dvh] flex flex-col overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <SheetModalHeader eyebrow="College Football Playoff" title={`${currentYear} CFP Quarterfinals`} onClose={handleClose} />

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
                Creating CFP Quarterfinals Sheet...
              </p>
              <p className="text-sm mt-2 text-txt-tertiary">
                Auto-filling teams from First Round results
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
                CFP Quarterfinals results saved to your dynasty.
              </p>
            </div>
          </div>
        ) : sheetId ? (
          <div className="flex-1 flex flex-col overflow-hidden gap-3">
            <SheetModalAIHero
              tagline="Skip the typing. Let AI fill the CFP Quarterfinals."
              buttons={[{ label: 'Copy AI Prompt', onClick: () => setShowAIPrompt(true) }]}
            />
            {isMobile || !useEmbedded ? (
              <SheetManualEntry sheetId={sheetId} whatToDo="Enter CFP Quarterfinal results" />
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden min-h-0 border border-surface-4 rounded-lg">
                <SheetToolbar sheetId={sheetId} embedUrl={embedUrl} teamColors={teamColors} title="CFP Quarterfinals" />
              </div>
            )}
            <div className="flex flex-wrap gap-2 items-center pt-1">
              <button onClick={handleSyncAndDelete} disabled={syncing || deletingSheet} className={`px-4 py-2 rounded-lg font-semibold text-sm hover:opacity-90 transition-all disabled:opacity-60 ${highlightSave ? 'animate-pulse ring-4 ring-offset-2 scale-105' : ''}`} style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}>{deletingSheet ? 'Saving…' : 'Save & Move to Trash'}</button>
              <button onClick={handleSyncFromSheet} disabled={syncing || deletingSheet} className="px-4 py-2 rounded-lg font-semibold text-sm border border-surface-4 hover:bg-surface-2 text-txt-primary disabled:opacity-60 transition-colors">{syncing ? 'Syncing…' : 'Save & Keep Sheet'}</button>
              <button onClick={handleDeleteSheetOnly} disabled={syncing || deletingSheet || regenerating} className="px-4 py-2 rounded-lg font-semibold text-sm border border-surface-4 hover:bg-surface-2 text-txt-secondary disabled:opacity-60 transition-colors ml-auto">{deletingSheet ? 'Deleting…' : 'Delete Sheet (No Save)'}</button>
              <button onClick={handleRegenerateSheet} disabled={syncing || deletingSheet || regenerating} className="px-4 py-2 rounded-lg font-semibold text-sm border hover:bg-surface-2 transition-colors disabled:opacity-60" style={{ backgroundColor: 'transparent', borderColor: 'var(--accent-error)', color: 'var(--accent-error)' }}>{regenerating ? 'Regenerating…' : 'Regenerate'}</button>
            </div>
            {!isMobile && (
              <div className="flex items-center justify-end">
                <button onClick={() => { const newValue = !useEmbedded; setUseEmbedded(newValue); localStorage.setItem('sheetEmbedPreference', newValue.toString()); }} className="text-[11px] px-2.5 py-1 rounded-full border border-surface-4 text-txt-tertiary hover:text-txt-secondary hover:border-surface-5 transition-colors bg-transparent">{useEmbedded ? '← Back to default view' : 'Try embedded view (beta)'}</button>
              </div>
            )}
          </div>
        ) : null}
        </div>
      </div>

      {/* Auth Error Modal */}
      <AuthErrorModal
        isOpen={auth.showAuthError}
        onClose={auth.closeAuthError}
        onRefresh={auth.retry}
        teamColors={teamColors}
      />

      <AIPromptModal
        isOpen={showAIPrompt}
        onClose={() => setShowAIPrompt(false)}
        title={`${currentYear} CFP Quarterfinals Results`}
        prompt={aiPrompt}
        pasteTarget={`Cell B2 of the "CFP Quarterfinals" tab`}
      />
    </div>,
    document.body
  )
}
