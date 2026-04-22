import { useState, useEffect, useRef, useMemo } from 'react'
import { useDynasty } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import AuthErrorModal from './AuthErrorModal'
import AIPromptModal from './AIPromptModal'
import SheetToolbar from './SheetToolbar'
import SheetEntryPanel from './ui/SheetEntryPanel'
import {
  createAllAmericansOnlySheet,
  readAllAmericansOnlyFromSheet,
  deleteGoogleSheet,
  getSheetEmbedUrl
} from '../services/sheetsService'
import { getModalColors, getContrastTextColor } from '../utils/colorUtils'
import { buildAIPrompt } from '../utils/aiPrompt'

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export default function AllAmericansModal({ isOpen, onClose, onSave, currentYear, teamColors }) {
  const { currentDynasty, updateDynasty } = useDynasty()
  const { user, signOut, refreshSession } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const modalColors = useMemo(() => getModalColors(teamColors), [teamColors])
  const [refreshing, setRefreshing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [deletingSheet, setDeletingSheet] = useState(false)
  const [creatingSheet, setCreatingSheet] = useState(false)
  const [sheetId, setSheetId] = useState(null)
  const [showDeletedNote, setShowDeletedNote] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [isMobile, setIsMobile] = useState(false)
  const [showAuthError, setShowAuthError] = useState(false)
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

CAUTION: Position cells (columns A, E, I) are PRE-FILLED with the same 25 positions in every row. They are visually "editable" in the sheet, but your AI output MUST NOT include them — you only paste into cells B, C, D, F, G, H, J, K, L (9 columns × 25 rows).

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. Output ONLY 9 editable columns per row (in this order): First Player, First Team, First Class, Second Player, Second Team, Second Class, Freshman Player, Freshman Team, Freshman Class.
2. NEVER output columns A, E, I (Position) — they are pre-filled.
3. NEVER output rows 1-3 (title row, team-label row, column-header row) — they are pre-filled and some are merged.
4. Row order is FIXED by the 25 positions below — output exactly 25 data lines in that exact order.
5. NO COMMAS anywhere. No commentary, totals, or extra columns. No "N/A", no dashes.
6. BLANK field for unknown (empty between tabs). Never guess. Never invent players.
7. Use ONLY the literal dropdown values listed below for Team and Class — wrong spelling = dropdown rejects it.
8. Team values must be UPPERCASE abbreviations from the mapping at the bottom of this prompt — NEVER full names, city, or nickname.
9. ONE TSV block, 25 lines, 9 tab-separated fields each. Label it with paste target.

═══════════════════════════════════════════════════════════
TAB "${currentYear}" — 25 data rows × 9 editable columns
Paste at cell B4 of the "${currentYear}" tab
═══════════════════════════════════════════════════════════

Pre-filled positions in rows 4-28 (these appear in cols A, E, I — do NOT output):
Row 4: QB | Row 5: HB | Row 6: HB | Row 7: WR | Row 8: WR | Row 9: WR | Row 10: TE
Row 11: LT | Row 12: LG | Row 13: C | Row 14: RG | Row 15: RT
Row 16: LEDG | Row 17: REDG | Row 18: DT | Row 19: DT
Row 20: SAM | Row 21: MIKE | Row 22: WILL
Row 23: CB | Row 24: CB | Row 25: FS | Row 26: SS
Row 27: K | Row 28: P

NOTE: HB appears twice (rows 5-6), WR three times (rows 7-9), DT twice (rows 18-19), CB twice (rows 23-24). Different players go in each slot — do not repeat a player across the two HB slots, three WR slots, two DT slots, or two CB slots for the same team (First/Second/Freshman).

Per-row output (9 tab-separated fields, same for every row):
<First Player>\\t<First Team>\\t<First Class>\\t<Second Player>\\t<Second Team>\\t<Second Class>\\t<Freshman Player>\\t<Freshman Team>\\t<Freshman Class>

Field formats:
- Player (3 slots per row: First, Second, Freshman) — full name string, blank if unknown. A Freshman-team player must actually be a freshman (Fr or RS Fr).
- Team (3 slots per row — strict dropdown) — uppercase abbreviation from the mapping at the bottom (e.g. BAMA, OSU, UGA, TEX). NEVER full names or nicknames.
- Class (3 slots per row — strict dropdown) — must be EXACTLY one of:
    Fr | RS Fr | So | RS So | Jr | RS Jr | Sr | RS Sr
  Note the literal space in "RS Fr"/"RS So"/"RS Jr"/"RS Sr". No "Freshman", "Sophomore", "FR", "SO", "R-Fr", "RSFr".

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== ALL-AMERICANS — paste at cell B4 of "${currentYear}" tab ===
<row 4 QB: 9 tab-separated fields>
<row 5 HB: 9 tab-separated fields>
<row 6 HB: 9 tab-separated fields>
<row 7 WR: 9 tab-separated fields>
<row 8 WR: 9 tab-separated fields>
<row 9 WR: 9 tab-separated fields>
<row 10 TE: 9 tab-separated fields>
<row 11 LT: 9 tab-separated fields>
<row 12 LG: 9 tab-separated fields>
<row 13 C: 9 tab-separated fields>
<row 14 RG: 9 tab-separated fields>
<row 15 RT: 9 tab-separated fields>
<row 16 LEDG: 9 tab-separated fields>
<row 17 REDG: 9 tab-separated fields>
<row 18 DT: 9 tab-separated fields>
<row 19 DT: 9 tab-separated fields>
<row 20 SAM: 9 tab-separated fields>
<row 21 MIKE: 9 tab-separated fields>
<row 22 WILL: 9 tab-separated fields>
<row 23 CB: 9 tab-separated fields>
<row 24 CB: 9 tab-separated fields>
<row 25 FS: 9 tab-separated fields>
<row 26 SS: 9 tab-separated fields>
<row 27 K: 9 tab-separated fields>
<row 28 P: 9 tab-separated fields>

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] Exactly 25 lines in the block, one per position (order: QB, HB, HB, WR, WR, WR, TE, LT, LG, C, RG, RT, LEDG, REDG, DT, DT, SAM, MIKE, WILL, CB, CB, FS, SS, K, P)
[ ] Every line has exactly 9 tab-separated fields (8 tabs per line)
[ ] No Position values anywhere in the output — those are pre-filled in columns A/E/I
[ ] All Team values are uppercase abbreviations from the mapping — no full names
[ ] All Class values are from the exact list: Fr, RS Fr, So, RS So, Jr, RS Jr, Sr, RS Sr
[ ] All Freshman-team Class values are Fr or RS Fr (no Sophomores or above in Freshman slot)
[ ] Blank fields for unknowns — nothing was invented
[ ] No commas, no header rows, no commentary in the output`,
    includeTeamMap: true,
  }), [currentYear])

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
          setSheetId(existingSheetId)
          return
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
          if (error.message?.includes('OAuth') || error.message?.includes('access token')) {
            setShowAuthError(true)
          }
        } finally {
          setCreatingSheet(false)
          creatingSheetRef.current = false
        }
      }
    }
    createSheet()
  }, [isOpen, user, sheetId, creatingSheet, currentDynasty?.id, retryCount, showDeletedNote])

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
      const data = await readAllAmericansOnlyFromSheet(sheetId, currentYear)
      await onSave(data)
      onClose()
    } catch (error) {
      console.error(error)
      if (error.message?.includes('OAuth') || error.message?.includes('access token')) {
        setShowAuthError(true)
      } else {
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
      const data = await readAllAmericansOnlyFromSheet(sheetId, currentYear)
      await onSave(data)
      // Move sheet to trash (keep sheet ID stored so user can restore if needed)
      await deleteGoogleSheet(sheetId)
      setSheetId(null)
      setShowDeletedNote(true)
      setTimeout(() => onClose(), 2500)
    } catch (error) {
      console.error('Error in handleSyncAndDelete:', error)
      if (error.message?.includes('OAuth') || error.message?.includes('access token')) {
        setShowAuthError(true)
      } else {
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
      setRetryCount(c => c + 1)
    } catch (error) {
      console.error('Failed to regenerate sheet:', error)
      if (error.message?.includes('OAuth') || error.message?.includes('access token')) {
        setShowAuthError(true)
      } else {
        toast.error('Failed to regenerate sheet. Please try again.')
      }
    } finally {
      setRegenerating(false)
    }
  }

  const handleClose = () => onClose()

  if (!isOpen) return null

  const embedUrl = sheetId ? getSheetEmbedUrl(sheetId, `${currentYear}`) : null
  const isLoading = creatingSheet

  return (
    <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-60 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4" style={{ margin: 0 }} onMouseDown={handleClose}>
      <div className="card-elevated w-full sm:w-[95vw] max-h-[calc(100dvh-4rem)] sm:h-[95dvh] flex flex-col overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
        <div className="h-[3px] w-full" style={{ backgroundColor: modalColors.accent }} aria-hidden="true" />
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
              <div className="animate-spin w-12 h-12 border-4 rounded-full mx-auto mb-4" style={{ borderColor: modalColors.accent, borderTopColor: 'transparent' }} />
              <p className="text-lg font-semibold text-txt-primary">Creating All-Americans Sheet...</p>
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="card p-8 border-l-[3px] text-center max-w-sm" style={{ borderLeftColor: modalColors.accent }}>
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
                  <button onClick={handleSyncAndDelete} disabled={syncing || deletingSheet} className={`px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-all text-sm ${highlightSave ? 'animate-pulse ring-4 ring-offset-2 scale-105' : ''}`} style={{ backgroundColor: modalColors.accent, color: getContrastTextColor(modalColors.accent) }}>{deletingSheet ? 'Saving...' : 'Save & Move to Trash'}</button>
                  <button onClick={handleSyncFromSheet} disabled={syncing || deletingSheet} className="btn btn-secondary text-sm">{syncing ? 'Syncing...' : 'Save & Keep Sheet'}</button>
                  <button onClick={() => setShowAIPrompt(true)} className="px-4 py-2 rounded-lg text-sm font-medium border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent">AI Prompt</button>
                  <button onClick={handleRegenerateSheet} disabled={syncing || deletingSheet || regenerating} className="px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-colors text-sm border-2 ml-auto" style={{ backgroundColor: 'transparent', borderColor: '#EF4444', color: '#EF4444' }}>{regenerating ? 'Regenerating...' : 'Regenerate sheet'}</button>
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
                  accentColor={modalColors.accent}
                  whatToDo="Enter Player, Team, and Class for each position."
                  syncing={syncing}
                  deletingSheet={deletingSheet}
                  regenerating={regenerating}
                  highlightSave={highlightSave}
                  onSaveAndDelete={handleSyncAndDelete}
                  onSaveAndKeep={handleSyncFromSheet}
                  onRegenerate={handleRegenerateSheet}
                />
                <button onClick={() => setShowAIPrompt(true)} className="mt-2 mb-6 px-5 py-3 rounded-lg text-sm font-medium border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent">AI Prompt</button>
              </div>
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                <SheetToolbar sheetId={sheetId} embedUrl={embedUrl} teamColors={teamColors} title="All-Americans" onSessionError={() => setShowAuthError(true)} />
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-lg mb-4 text-txt-primary">Your session has expired.</p>
              <div className="flex gap-3 justify-center">
                <button onClick={async () => { setRefreshing(true); try { const success = await refreshSession(); if (success) setRetryCount(c => c + 1); } catch (e) { console.error(e); } setRefreshing(false); }} disabled={refreshing} className="px-4 py-2 rounded font-semibold" style={{ backgroundColor: modalColors.accent, color: getContrastTextColor(modalColors.accent), opacity: refreshing ? 0.7 : 1 }}>{refreshing ? 'Refreshing...' : 'Refresh Session'}</button>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
      <AuthErrorModal isOpen={showAuthError} onClose={() => setShowAuthError(false)} onRefresh={() => setRetryCount(c => c + 1)} teamColors={teamColors} />
      <AIPromptModal isOpen={showAIPrompt} onClose={() => setShowAIPrompt(false)} title={`${currentYear} All-Americans`} prompt={aiPrompt} />
    </div>
  )
}
