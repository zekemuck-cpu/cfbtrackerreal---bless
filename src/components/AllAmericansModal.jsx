import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import AuthErrorModal from './AuthErrorModal'
import { useAuthErrorHandler } from '../hooks/useAuthErrorHandler'
import AIPromptModal from './AIPromptModal'
import SheetToolbar from './SheetToolbar'
import SheetEntryPanel from './ui/SheetEntryPanel'
import {
  createAllAmericansOnlySheet,
  readAllAmericansOnlyFromSheet,
  deleteGoogleSheet,
  getSheetEmbedUrl,
  sheetExists
} from '../services/sheetsService'
import { getModalColors } from '../utils/colorUtils'
import { buildAIPrompt } from '../utils/aiPrompt'
import SheetLoadingHint from './SheetLoadingHint'

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export default function AllAmericansModal({ isOpen, onClose, onSave, currentYear, teamColors }) {
  const { currentDynasty, updateDynasty } = useDynasty()
  const { user, signOut } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const modalColors = useMemo(() => getModalColors(teamColors), [teamColors])
  const [syncing, setSyncing] = useState(false)
  const [deletingSheet, setDeletingSheet] = useState(false)
  const [creatingSheet, setCreatingSheet] = useState(false)
  const [sheetId, setSheetId] = useState(null)
  const [showDeletedNote, setShowDeletedNote] = useState(false)
  const auth = useAuthErrorHandler()
  const [isMobile, setIsMobile] = useState(false)
  const [useEmbedded, setUseEmbedded] = useState(() => {
    // Load preference from localStorage
    return localStorage.getItem('sheetEmbedPreference') === 'true'
  })
  const [highlightSave, setHighlightSave] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [showAIPrompt, setShowAIPrompt] = useState(false)

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} All-Americans`,
    structure: `This sheet has ONE tab per season year. Use the "${currentYear}" tab (current year).
Each tab is 28 rows × 12 columns organized as three side-by-side team blocks (First-Team, Second-Team, Freshman Team). Each block is 4 columns wide: Position | Player | Team | Class.

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. Each data line has EXACTLY 12 tab-separated fields (11 tabs per line), in this order:
   Position | First Player | First Team | First Class | Position | Second Player | Second Team | Second Class | Position | Freshman Player | Freshman Team | Freshman Class
2. The Position value is REPEATED in the 1st, 5th, and 9th fields of every line — same value all three times (the sheet has three Position columns, one per team block).
3. Row order is FIXED by the 25 positions below — output exactly 25 data lines in that exact order.
4. Do NOT output rows 1-3 (title row, team-label row, column-header row) — they are pre-filled and some are merged.
5. NO COMMAS anywhere. No commentary, totals, or extra columns. No "N/A", no dashes.
6. BLANK field for unknown (empty between tabs). Never guess. Never invent players.
7. Use ONLY the literal dropdown values listed below for Position, Team, and Class — wrong spelling = dropdown rejects it.
8. Team values must be UPPERCASE abbreviations from the mapping at the bottom of this prompt — NEVER full names, city, or nickname.
9. ONE TSV block, 25 lines, 12 tab-separated fields each. Label it with paste target.

═══════════════════════════════════════════════════════════
TAB "${currentYear}" — 25 data rows × 12 fields
Paste at cell A4 of the "${currentYear}" tab
═══════════════════════════════════════════════════════════

WHY PASTE AT A4 AND INCLUDE POSITIONS: Google Sheets pastes TSV into CONSECUTIVE cells. You cannot "skip" columns E and I — every tab in your line fills the next cell. To land data in the correct columns (B/C/D for First-Team, F/G/H for Second, J/K/L for Freshman), you MUST include the Position value in cols A/E/I. The Position value you output simply overwrites the pre-filled Position with the identical value from the list below. If you try to skip positions and paste at B4 with only 9 fields, your data will be shifted left across the middle and right blocks — CORRUPT.

Position by row (repeat the same value in the 1st, 5th, 9th fields of that line):
  Row 4  → QB
  Row 5  → HB
  Row 6  → HB
  Row 7  → WR
  Row 8  → WR
  Row 9  → WR
  Row 10 → TE
  Row 11 → LT
  Row 12 → LG
  Row 13 → C
  Row 14 → RG
  Row 15 → RT
  Row 16 → LEDG
  Row 17 → REDG
  Row 18 → DT
  Row 19 → DT
  Row 20 → SAM
  Row 21 → MIKE
  Row 22 → WILL
  Row 23 → CB
  Row 24 → CB
  Row 25 → FS
  Row 26 → SS
  Row 27 → K
  Row 28 → P

HB appears twice (rows 5-6), WR three times (rows 7-9), DT twice (rows 18-19), CB twice (rows 23-24). Use different players in each slot for the same team-group (First/Second/Freshman) — do not repeat a name within those doubled-up rows.

Per-line output (12 tab-separated fields):
<Position>\\t<First Player>\\t<First Team>\\t<First Class>\\t<Position>\\t<Second Player>\\t<Second Team>\\t<Second Class>\\t<Position>\\t<Freshman Player>\\t<Freshman Team>\\t<Freshman Class>

Field formats:
- Position (appears 3 times per line — 1st, 5th, 9th fields) — must be EXACTLY one of, case-sensitive:
    QB | HB | FB | WR | TE | LT | LG | C | RG | RT | LEDG | REDG | DT | SAM | MIKE | WILL | CB | FS | SS | K | P
  Use the position that matches the row from the list above. The same value goes in all three Position slots on that line.
- Player (3 slots per row: First, Second, Freshman) — full name string, blank if unknown. A Freshman-team player must actually be a freshman (Fr or RS Fr).
- Team (3 slots per row — strict dropdown) — uppercase abbreviation from the mapping at the bottom (e.g. BAMA, OSU, UGA, TEX). NEVER full names or nicknames.
- Class (3 slots per row — strict dropdown) — must be EXACTLY one of:
    Fr | RS Fr | So | RS So | Jr | RS Jr | Sr | RS Sr
  Note the literal space in "RS Fr"/"RS So"/"RS Jr"/"RS Sr". No "Freshman", "Sophomore", "FR", "SO", "R-Fr", "RSFr".

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== ALL-AMERICANS — paste at cell A4 of "${currentYear}" tab ===
<25 lines × 12 tab-separated fields, positions as listed above>

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] Exactly 25 lines in the block, one per position (order: QB, HB, HB, WR, WR, WR, TE, LT, LG, C, RG, RT, LEDG, REDG, DT, DT, SAM, MIKE, WILL, CB, CB, FS, SS, K, P)
[ ] Every line has exactly 12 tab-separated fields (11 tabs per line)
[ ] The 1st, 5th, and 9th fields on every line are the SAME position value from the row list
[ ] All Team values are uppercase abbreviations from the mapping — no full names
[ ] All Class values are from the exact list: Fr, RS Fr, So, RS So, Jr, RS Jr, Sr, RS Sr
[ ] All Freshman-team Class values are Fr or RS Fr (no Sophomores or above in Freshman slot)
[ ] Blank fields for unknowns — nothing was invented
[ ] No commas, no header rows, no commentary in the output`,
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
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => { document.body.style.overflow = 'unset' }
  }, [isOpen])

  useEffect(() => {
    const createSheet = async () => {
      if (isOpen && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote) {
        const existingSheetId = currentDynasty?.allAmericansSheetIdByYear?.[currentYear]
        if (existingSheetId) {
          const stillExists = await sheetExists(existingSheetId)
          if (stillExists) {
            setSheetId(existingSheetId)
            return
          }
          await updateDynasty(currentDynasty.id, {
            allAmericansSheetIdByYear: { ...(currentDynasty.allAmericansSheetIdByYear || {}), [currentYear]: null }
          })
          // stale sheet (trashed in Drive); fall through to regenerate
        }
        // Set ref immediately to prevent concurrent calls (state updates are async)
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          // Pass allAmericansByYear for pre-filling past years
          const allAmericansByYear = currentDynasty?.allAmericansByYear || {}
          const sheetInfo = await createAllAmericansOnlySheet(currentYear, allAmericansByYear, currentDynasty?.teams || currentDynasty?.customTeams)
          setSheetId(sheetInfo.spreadsheetId)
          const existingByYear = currentDynasty?.allAmericansSheetIdByYear || {}
          await updateDynasty(currentDynasty.id, {
            allAmericansSheetIdByYear: { ...existingByYear, [currentYear]: sheetInfo.spreadsheetId }
          })
        } catch (error) {
          console.error('Failed to create all-americans sheet:', error)
          auth.handleError(error)
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
      creatingSheetRef.current = false
    }
  }, [isOpen])

  const handleSyncFromSheet = async () => {
    if (!sheetId) return
    setSyncing(true)
    try {
      // Read from the current year tab
      const data = await readAllAmericansOnlyFromSheet(sheetId, currentYear, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(data)
      onClose()
    } catch (error) {
      console.error(error)
      if (!auth.handleError(error)) {
        toast.error('Failed to sync from Google Sheets.')
      }
    } finally {
      setSyncing(false)
    }
  }

  const handleSyncAndDelete = async () => {
    if (!sheetId) return
    setDeletingSheet(true)
    try {
      // Read from the current year tab
      const data = await readAllAmericansOnlyFromSheet(sheetId, currentYear, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(data)
      // Move sheet to trash (keep sheet ID stored so user can restore if needed)
      await deleteGoogleSheet(sheetId)
      setSheetId(null)
      setShowDeletedNote(true)
      setTimeout(() => onClose(), 2500)
    } catch (error) {
      console.error('Error in handleSyncAndDelete:', error)
      if (!auth.handleError(error)) {
        toast.error(`Failed to sync/delete: ${error.message || 'Unknown error'}`)
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
      const existingByYear = currentDynasty?.allAmericansSheetIdByYear || {}
      await updateDynasty(currentDynasty.id, {
        allAmericansSheetIdByYear: { ...existingByYear, [currentYear]: null }
      })
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
      title: 'Delete this All-Americans sheet?',
      message: 'This deletes the Google Sheet without applying any edits. Your dynasty All-Americans selections stay as-is.',
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (!ok) return
    setDeletingSheet(true)
    try {
      await deleteGoogleSheet(sheetId)
      const existingByYear = currentDynasty?.allAmericansSheetIdByYear || {}
      await updateDynasty(currentDynasty.id, {
        allAmericansSheetIdByYear: { ...existingByYear, [currentYear]: null }
      })
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

  const handleClose = () => onClose()

  if (!isOpen) return null

  const embedUrl = sheetId ? getSheetEmbedUrl(sheetId, `${currentYear}`) : null
  const isLoading = creatingSheet

  return createPortal(
    <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-60 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4" style={{ margin: 0 }} onMouseDown={handleClose}>
      <div className="card-elevated w-full sm:w-[95vw] max-h-[calc(100dvh-4rem)] sm:h-[95dvh] flex flex-col overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
        <div className="h-[3px] w-full" style={{ backgroundColor: 'var(--text-primary)' }} aria-hidden="true" />
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-surface-4">
          <h2 className="text-2xl font-bold text-txt-primary">{currentYear} All-Americans</h2>
          <button aria-label="Close" onClick={handleClose} className="text-txt-tertiary hover:text-txt-primary transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin w-12 h-12 border-4 rounded-full mx-auto mb-4" style={{ borderColor: 'var(--text-primary)', borderTopColor: 'transparent' }} />
              <p className="text-lg font-semibold text-txt-primary">Creating All-Americans Sheet...</p>
              <SheetLoadingHint active={isLoading} />
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="card p-8 border-l-[3px] text-center max-w-sm" style={{ borderLeftColor: 'var(--surface-5)' }}>
              <p className="label-xs text-txt-tertiary mb-2">Status</p>
              <p className="text-xl font-bold text-txt-primary mb-2">Saved &amp; Moved to Trash</p>
              <p className="text-sm text-txt-secondary">All-Americans selections saved.</p>
            </div>
          </div>
        ) : sheetId ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {!isMobile && useEmbedded && (
              <div className="mb-3">
                <div className="flex gap-3 flex-wrap items-center">
                  <button onClick={handleSyncAndDelete} disabled={syncing || deletingSheet} className={`px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-all text-sm ${highlightSave ? 'animate-pulse ring-4 ring-offset-2 scale-105' : ''}`} style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}>{deletingSheet ? 'Saving...' : 'Save & Move to Trash'}</button>
                  <button onClick={handleSyncFromSheet} disabled={syncing || deletingSheet} className="btn btn-secondary text-sm">{syncing ? 'Syncing...' : 'Save & Keep Sheet'}</button>
                  <button onClick={() => setShowAIPrompt(true)} className="px-4 py-2 rounded-lg text-sm font-medium border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent">AI Prompt</button>
                  <button onClick={handleDeleteSheetOnly} disabled={syncing || deletingSheet || regenerating} className="px-4 py-2 rounded-lg font-semibold text-sm disabled:opacity-60 transition-colors border border-surface-4 hover:bg-surface-2 text-txt-secondary ml-auto">{deletingSheet ? 'Deleting…' : 'Delete Sheet (No Save)'}</button>
                  <button onClick={handleRegenerateSheet} disabled={syncing || deletingSheet || regenerating} className="px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-colors text-sm border-2" style={{ backgroundColor: 'transparent', borderColor: '#EF4444', color: '#EF4444' }}>{regenerating ? 'Regenerating...' : 'Regenerate sheet'}</button>
                </div>
              </div>
            )}
            {!isMobile && (
              <div className="flex items-center justify-end mb-2">
                <button onClick={() => { const newValue = !useEmbedded; setUseEmbedded(newValue); localStorage.setItem('sheetEmbedPreference', newValue.toString()); }} className="text-xs px-3 py-1 rounded-full border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent">{useEmbedded ? '← Back to default view' : 'Try embedded view (beta)'}</button>
              </div>
            )}
            {isMobile || !useEmbedded ? (
              <div className="flex flex-col items-center flex-1">
                <SheetEntryPanel
                  sheetId={sheetId}
                  whatToDo="Enter Player, Team, and Class for each position."
                  syncing={syncing}
                  deletingSheet={deletingSheet}
                  regenerating={regenerating}
                  highlightSave={highlightSave}
                  onSaveAndDelete={handleSyncAndDelete}
                  onSaveAndKeep={handleSyncFromSheet}
                  onRegenerate={handleRegenerateSheet}
                  onDeleteSheetOnly={handleDeleteSheetOnly}
                />
                <button onClick={() => setShowAIPrompt(true)} className="mt-2 mb-6 px-5 py-3 rounded-lg text-sm font-medium border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent">AI Prompt</button>
              </div>
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                <SheetToolbar sheetId={sheetId} embedUrl={embedUrl} teamColors={teamColors} title="All-Americans" />
              </div>
            )}
          </div>
        ) : null}
        </div>
      </div>
      <AuthErrorModal isOpen={auth.showAuthError} onClose={auth.closeAuthError} onRefresh={auth.retry} teamColors={teamColors} />
      <AIPromptModal isOpen={showAIPrompt} onClose={() => setShowAIPrompt(false)} title={`${currentYear} All-Americans`} prompt={aiPrompt} pasteTarget={`Cell A4 of the "${currentYear}" tab`} />
    </div>,
    document.body,
  )
}
