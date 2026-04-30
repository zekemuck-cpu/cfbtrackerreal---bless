import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import AuthErrorModal from './AuthErrorModal'
import AIPromptModal from './AIPromptModal'
import SheetToolbar from './SheetToolbar'
import {
  createAwardsSheet,
  readAwardsFromSheet,
  deleteGoogleSheet,
  getSheetEmbedUrl,
  sheetExists
} from '../services/sheetsService'
import { getModalColors, getContrastTextColor } from '../utils/colorUtils'
import { buildAIPrompt } from '../utils/aiPrompt'
import SheetLoadingHint from './SheetLoadingHint'

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export default function AwardsModal({ isOpen, onClose, onSave, currentYear, teamColors }) {
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
    title: `${currentYear} Season Awards`,
    structure: `This sheet has ONE tab named "${currentYear}" (the current year). It has 5 columns and 22 rows: row 1 is a protected header, rows 2-22 are the 21 awards.

Column A (Award name) is PRE-FILLED and PROTECTED — you never output it.
You fill columns B (Player), C (Position), D (Team), E (Class).

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. Output ONLY columns B, C, D, E. Never output column A (Award name), the header row, row numbers, or any labels.
2. Row order is FIXED. You must output exactly 21 data rows in the exact order shown below — one per award.
3. NO COMMAS in any value. No totals, no explanation text, no "N/A", no dashes.
4. BLANK field for unknown (empty string between the tabs). Never guess, never write "Unknown", never put zero.
5. Use ONLY the literal dropdown values listed — wrong spelling/casing = Google Sheets rejects it.
6. Team column (D) uses the ABBREVIATION from the mapping at the bottom of this prompt — NEVER full names or mascots.
7. COACH AWARDS (rows 5 "Bear Bryant Coach of the Year" and 17 "Broyles") have cells C, D, E MERGED into ONE wide cell that holds the Team. The merge anchor is column C. For those two rows only, output exactly 3 tab characters yielding 4 fields: CoachName<TAB>TeamAbbr<TAB><TAB>. Concretely: field1=CoachName, field2=TeamAbbr, field3=EMPTY, field4=EMPTY. All other 19 rows output 3 tab characters yielding 4 fields: Player<TAB>Position<TAB>Team<TAB>Class. NEVER put the team in field 3 on coach rows — that lands inside the merged region and leaves column C blank.
8. ONE TSV block total — exactly 21 lines. Label it with the paste target.

═══════════════════════════════════════════════════════════
TAB "${currentYear}" — 21 rows × 4 output columns
Paste at cell B2 of the "${currentYear}" tab
═══════════════════════════════════════════════════════════

Row-by-row mapping (sheet row numbers shown; row 2 = first award):

Sheet Row | Col A (PROTECTED, DO NOT OUTPUT) | Your output (tab-separated)
----------+----------------------------------+-----------------------------------------------------------
    2     | Heisman                          | Player<TAB>Position<TAB>Team<TAB>Class
    3     | Maxwell                          | Player<TAB>Position<TAB>Team<TAB>Class
    4     | Walter Camp                      | Player<TAB>Position<TAB>Team<TAB>Class
    5     | Bear Bryant Coach of the Year    | CoachName<TAB>Team<TAB><TAB>           (COACH — Team in merged C cell; trailing empties for merged-away D & E)
    6     | Davey O'Brien                    | Player<TAB>Position<TAB>Team<TAB>Class
    7     | Chuck Bednarik                   | Player<TAB>Position<TAB>Team<TAB>Class
    8     | Bronco Nagurski                  | Player<TAB>Position<TAB>Team<TAB>Class
    9     | Jim Thorpe                       | Player<TAB>Position<TAB>Team<TAB>Class
   10     | Doak Walker                      | Player<TAB>Position<TAB>Team<TAB>Class
   11     | Fred Biletnikoff                 | Player<TAB>Position<TAB>Team<TAB>Class
   12     | Lombardi                         | Player<TAB>Position<TAB>Team<TAB>Class
   13     | Unitas Golden Arm                | Player<TAB>Position<TAB>Team<TAB>Class
   14     | Edge Rusher of the Year          | Player<TAB>Position<TAB>Team<TAB>Class
   15     | Outland                          | Player<TAB>Position<TAB>Team<TAB>Class
   16     | John Mackey                      | Player<TAB>Position<TAB>Team<TAB>Class
   17     | Broyles                          | CoachName<TAB>Team<TAB><TAB>           (COACH — Team in merged C cell; trailing empties for merged-away D & E)
   18     | Dick Butkus                      | Player<TAB>Position<TAB>Team<TAB>Class
   19     | Rimington                        | Player<TAB>Position<TAB>Team<TAB>Class
   20     | Lou Groza                        | Player<TAB>Position<TAB>Team<TAB>Class
   21     | Ray Guy                          | Player<TAB>Position<TAB>Team<TAB>Class
   22     | Returner of the Year             | Player<TAB>Position<TAB>Team<TAB>Class

Field formats:
- Player: full name string (e.g. "John Smith"). Leave blank if unknown.
- Position (strict dropdown) — must be EXACTLY one of these 21 values, case-sensitive:
    QB | HB | FB | WR | TE | LT | LG | C | RG | RT | LEDG | REDG | DT | SAM | MIKE | WILL | CB | FS | SS | K | P
  Do NOT use "RB", "OL", "LB", "DE", "S", "OG", "OT" — those will be REJECTED by the dropdown.
- Team (strict dropdown) — uppercase abbreviation from the team mapping at the bottom of this prompt (e.g. BAMA, OSU, UGA). NEVER full names ("Alabama", "Ohio State") or nicknames ("Crimson Tide").
- Class (strict dropdown) — must be EXACTLY one of these 8 values, case-sensitive:
    Fr | RS Fr | So | RS So | Jr | RS Jr | Sr | RS Sr
  Note the literal space in "RS Fr", "RS So", "RS Jr", "RS Sr". Do NOT use "Freshman", "Sophomore", "Junior", "Senior", "FR", "SO", "JR", "SR", "RSFr", "R-Fr", etc.

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== AWARDS — paste at cell B2 of "${currentYear}" tab ===
<Heisman row: Player\\tPosition\\tTeam\\tClass>
<Maxwell row: Player\\tPosition\\tTeam\\tClass>
<Walter Camp row: Player\\tPosition\\tTeam\\tClass>
<Bear Bryant row: CoachName\\tTeam\\t\\t>
<Davey O'Brien row: Player\\tPosition\\tTeam\\tClass>
<Chuck Bednarik row: Player\\tPosition\\tTeam\\tClass>
<Bronco Nagurski row: Player\\tPosition\\tTeam\\tClass>
<Jim Thorpe row: Player\\tPosition\\tTeam\\tClass>
<Doak Walker row: Player\\tPosition\\tTeam\\tClass>
<Fred Biletnikoff row: Player\\tPosition\\tTeam\\tClass>
<Lombardi row: Player\\tPosition\\tTeam\\tClass>
<Unitas Golden Arm row: Player\\tPosition\\tTeam\\tClass>
<Edge Rusher of the Year row: Player\\tPosition\\tTeam\\tClass>
<Outland row: Player\\tPosition\\tTeam\\tClass>
<John Mackey row: Player\\tPosition\\tTeam\\tClass>
<Broyles row: CoachName\\tTeam\\t\\t>
<Dick Butkus row: Player\\tPosition\\tTeam\\tClass>
<Rimington row: Player\\tPosition\\tTeam\\tClass>
<Lou Groza row: Player\\tPosition\\tTeam\\tClass>
<Ray Guy row: Player\\tPosition\\tTeam\\tClass>
<Returner of the Year row: Player\\tPosition\\tTeam\\tClass>

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] Exactly 21 lines in the block, in the exact order above (Heisman first, Returner of the Year last)
[ ] Rows 4 (Bear Bryant, 4th line) and 16 (Broyles, 16th line) each have 4 tab-separated fields in this exact order: CoachName<TAB>Team<TAB><TAB> — Team is the SECOND field (col C, the merge anchor), the third and fourth fields are EMPTY (they are merged-away cells D & E). Do NOT leave field 2 empty and put the team in field 3 — that would land the team in column D inside the merged region and leave column C blank.
[ ] All other 19 rows have 4 tab-separated non-empty slots: Player, Position, Team, Class (individual fields may be blank if unknown)
[ ] All Position values are from the exact list: QB, HB, FB, WR, TE, LT, LG, C, RG, RT, LEDG, REDG, DT, SAM, MIKE, WILL, CB, FS, SS, K, P
[ ] All Class values are from the exact list: Fr, RS Fr, So, RS So, Jr, RS Jr, Sr, RS Sr
[ ] All Team values are uppercase abbreviations from the mapping — no full names
[ ] Blank fields for unknowns — nothing was invented
[ ] No award name, header row, commas, commentary, or explanation in the output`,
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
        const existingSheetId = currentDynasty?.awardsSheetIdByYear?.[currentYear]
        if (existingSheetId) {
          const stillExists = await sheetExists(existingSheetId)
          if (stillExists) {
            setSheetId(existingSheetId)
            return
          }
          await updateDynasty(currentDynasty.id, {
            awardsSheetIdByYear: { ...(currentDynasty.awardsSheetIdByYear || {}), [currentYear]: null }
          })
          // stale sheet (trashed in Drive); fall through to regenerate
        }
        // Set ref immediately to prevent concurrent calls (state updates are async)
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          // Pass awardsByYear for pre-filling past years
          const awardsByYear = currentDynasty?.awardsByYear || {}
          const sheetInfo = await createAwardsSheet(currentYear, awardsByYear, currentDynasty?.teams || currentDynasty?.customTeams)
          setSheetId(sheetInfo.sheetId)
          const existingByYear = currentDynasty?.awardsSheetIdByYear || {}
          await updateDynasty(currentDynasty.id, {
            awardsSheetIdByYear: { ...existingByYear, [currentYear]: sheetInfo.sheetId }
          })
        } catch (error) {
          console.error('Failed to create awards sheet:', error)
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
      const awards = await readAwardsFromSheet(sheetId, currentYear, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(awards)
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
      const awards = await readAwardsFromSheet(sheetId, currentYear, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(awards)
      await deleteGoogleSheet(sheetId)
      const existingByYear = currentDynasty?.awardsSheetIdByYear || {}
      await updateDynasty(currentDynasty.id, {
        awardsSheetIdByYear: { ...existingByYear, [currentYear]: null }
      })
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
      message: "This will delete your current sheet and create a fresh one with all past awards. Any unsaved data will be lost.",
      confirmLabel: 'Regenerate',
      variant: 'danger',
    })
    if (!confirmed) return
    setRegenerating(true)
    try {
      await deleteGoogleSheet(sheetId)
      const existingByYear = currentDynasty?.awardsSheetIdByYear || {}
      await updateDynasty(currentDynasty.id, {
        awardsSheetIdByYear: { ...existingByYear, [currentYear]: null }
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

  return createPortal(
    <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-60 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4" style={{ margin: 0 }} onMouseDown={handleClose}>
      <div className="card-elevated w-full sm:w-[95vw] max-h-[calc(100dvh-4rem)] sm:h-[95dvh] flex flex-col overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
        <div className="h-[3px] w-full" style={{ backgroundColor: modalColors.accent }} aria-hidden="true" />
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-surface-4">
          <h2 className="text-2xl font-bold text-txt-primary">{currentYear} Season Awards</h2>
          <button aria-label="Close" onClick={handleClose} className="text-txt-tertiary hover:text-txt-primary transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin w-12 h-12 border-4 rounded-full mx-auto mb-4" style={{ borderColor: modalColors.accent, borderTopColor: 'transparent' }} />
              <p className="text-lg font-semibold text-txt-primary">Creating Awards Sheet...</p>
              <SheetLoadingHint active={isLoading} />
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="card p-8 border-l-[3px] text-center max-w-sm" style={{ borderLeftColor: modalColors.accent }}>
              <p className="label-xs text-txt-tertiary mb-2">Status</p>
              <p className="text-xl font-bold text-txt-primary mb-2">Saved &amp; Moved to Trash</p>
              <p className="text-sm text-txt-secondary">Season awards saved.</p>
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
              <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                <h3 className="label-xs text-txt-tertiary mb-2">Data Entry</h3>
                <p className="text-2xl font-bold text-txt-primary mb-6">Edit in Google Sheets</p>
                <div className="text-left mb-6 max-w-sm w-full card p-4 border-l-[3px]" style={{ borderLeftColor: modalColors.accent }}>
                  <p className="label-xs text-txt-tertiary mb-3">Instructions</p>
                  <ol className="text-sm space-y-2 text-txt-secondary">
                    <li className="flex gap-3"><span className="font-bold text-txt-primary tabular-nums">1.</span><span>Tap the button below to open Google Sheets</span></li>
                    <li className="flex gap-3"><span className="font-bold text-txt-primary tabular-nums">2.</span><span>Enter award winners (Player, Position, Team, Class)</span></li>
                    <li className="flex gap-3"><span className="font-bold text-txt-primary tabular-nums">3.</span><span>Return to this app when done</span></li>
                    <li className="flex gap-3"><span className="font-bold text-txt-primary tabular-nums">4.</span><span>Tap "Save" below to sync results</span></li>
                  </ol>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-3 mb-6">
                  <a href={`https://docs.google.com/spreadsheets/d/${sheetId}/edit`} target="_blank" rel="noopener noreferrer" className="px-6 py-3 rounded-lg font-bold text-lg hover:opacity-90 transition-colors flex items-center gap-2" style={{ backgroundColor: '#0F9D58', color: '#FFFFFF' }}>
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/><path d="M7 7h2v2H7zm0 4h2v2H7zm0 4h2v2H7zm4-8h6v2h-6zm0 4h6v2h-6zm0 4h6v2h-6z"/></svg>
                    Open Google Sheets
                  </a>
                  <button onClick={() => setShowAIPrompt(true)} className="px-5 py-3 rounded-lg text-sm font-medium border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent">AI Prompt</button>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 items-center justify-center mb-4">
                  <button onClick={handleSyncAndDelete} disabled={syncing || deletingSheet} className={`px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-all text-sm ${highlightSave ? 'animate-pulse ring-4 ring-offset-2 scale-105' : ''}`} style={{ backgroundColor: modalColors.accent, color: getContrastTextColor(modalColors.accent) }}>{deletingSheet ? 'Saving...' : 'Save & Move to Trash'}</button>
                  <button onClick={handleSyncFromSheet} disabled={syncing || deletingSheet} className="btn btn-secondary px-6 py-3 text-sm">{syncing ? 'Syncing...' : 'Save & Keep Sheet'}</button>
                </div>
                <button onClick={handleRegenerateSheet} disabled={syncing || deletingSheet || regenerating} className="text-xs px-4 py-2 rounded-lg font-medium hover:opacity-90 transition-colors border mb-4" style={{ backgroundColor: 'transparent', borderColor: '#EF4444', color: '#EF4444' }}>{regenerating ? 'Regenerating...' : 'Messed up? Regenerate sheet'}</button>
              </div>
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                <SheetToolbar sheetId={sheetId} embedUrl={embedUrl} teamColors={teamColors} title="Awards" onSessionError={() => setShowAuthError(true)} />
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
      <AIPromptModal isOpen={showAIPrompt} onClose={() => setShowAIPrompt(false)} title={`${currentYear} Season Awards`} prompt={aiPrompt} pasteTarget={`Cell B2 of the "${currentYear}" tab`} />
    </div>,
    document.body,
  )
}
