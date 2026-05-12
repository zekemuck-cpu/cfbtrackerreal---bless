import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import SheetModalHeader from './ui/SheetModalHeader'
import SheetManualEntry from './ui/SheetManualEntry'
import SheetModalFooter from './ui/SheetModalFooter'
import AuthErrorModal from './AuthErrorModal'
import { useAuthErrorHandler } from '../hooks/useAuthErrorHandler'
import AIPromptModal from './AIPromptModal'
import SheetToolbar from './SheetToolbar'
import {
  createAwardsSheet,
  readAwardsFromSheet,
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

export default function AwardsModal({ isOpen, onClose, onSave, currentYear, teamColors }) {
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
    title: `${currentYear} Season Awards`,
    structure: `This sheet has ONE tab named "${currentYear}" (the current year). It has 5 columns and 23 rows: row 1 is a protected header, rows 2-23 are the 22 awards.

Column A (Award name) is PRE-FILLED and PROTECTED — you never output it.
You fill columns B (Player), C (Position), D (Team), E (Class).

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. Output ONLY columns B, C, D, E. Never output column A (Award name), the header row, row numbers, or any labels.
2. Row order is FIXED. You must output exactly 22 data rows in the exact order shown below — one per award.
3. NO COMMAS in any value. No totals, no explanation text, no "N/A", no dashes.
4. BLANK field for unknown (empty string between the tabs). Never guess, never write "Unknown", never put zero.
5. Use ONLY the literal dropdown values listed — wrong spelling/casing = Google Sheets rejects it.
6. Team column (D) uses the ABBREVIATION from the mapping at the bottom of this prompt — NEVER full names or mascots.
7. COACH AWARDS (rows 5 "Bear Bryant Coach of the Year" and 17 "Broyles") have cells C, D, E MERGED into ONE wide cell that holds the Team. The merge anchor is column C. For those two rows only, output exactly 3 tab characters yielding 4 fields: CoachName<TAB>TeamAbbr<TAB><TAB>. Concretely: field1=CoachName, field2=TeamAbbr, field3=EMPTY, field4=EMPTY. All other 20 rows output 3 tab characters yielding 4 fields: Player<TAB>Position<TAB>Team<TAB>Class. NEVER put the team in field 3 on coach rows — that lands inside the merged region and leaves column C blank.
8. ONE TSV block total — exactly 22 lines. Label it with the paste target.

═══════════════════════════════════════════════════════════
TAB "${currentYear}" — 22 rows × 4 output columns
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
   23     | Shaun Alexander                  | Player<TAB>Position<TAB>Team<TAB>Class           (FRESHMAN — Most Outstanding Freshman; Class is almost always Fr / RS Fr)

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
<Shaun Alexander row: Player\\tPosition\\tTeam\\tClass>

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] Exactly 22 lines in the block, in the exact order above (Heisman first, Shaun Alexander last)
[ ] Rows 4 (Bear Bryant, 4th line) and 16 (Broyles, 16th line) each have 4 tab-separated fields in this exact order: CoachName<TAB>Team<TAB><TAB> — Team is the SECOND field (col C, the merge anchor), the third and fourth fields are EMPTY (they are merged-away cells D & E). Do NOT leave field 2 empty and put the team in field 3 — that would land the team in column D inside the merged region and leave column C blank.
[ ] All other 20 rows have 4 tab-separated non-empty slots: Player, Position, Team, Class (individual fields may be blank if unknown)
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
      const awards = await readAwardsFromSheet(sheetId, currentYear, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(awards)
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
      title: 'Delete this awards sheet?',
      message: 'This deletes the Google Sheet without applying any edits. Your dynasty season awards stay as-is.',
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (!ok) return
    setDeletingSheet(true)
    try {
      await deleteGoogleSheet(sheetId)
      const existingByYear = currentDynasty?.awardsSheetIdByYear || {}
      await updateDynasty(currentDynasty.id, {
        awardsSheetIdByYear: { ...existingByYear, [currentYear]: null }
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
    <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4" style={{ margin: 0 }} onMouseDown={handleClose}>
      <div className="card-elevated w-full sm:w-[95vw] max-h-[calc(100dvh-4rem)] sm:h-[95dvh] flex flex-col overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
        <SheetModalHeader eyebrow="Season Awards" title={`${currentYear} Awards`} onClose={handleClose} />

        <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin w-12 h-12 border-4 rounded-full mx-auto mb-4" style={{ borderColor: 'var(--text-primary)', borderTopColor: 'transparent' }} />
              <p className="text-lg font-semibold text-txt-primary">Creating Awards Sheet...</p>
              <SheetLoadingHint active={isLoading} />
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="card p-8 border-l-[3px] text-center max-w-sm" style={{ borderLeftColor: 'var(--surface-5)' }}>
              <p className="label-xs text-txt-tertiary mb-2">Status</p>
              <p className="text-xl font-bold text-txt-primary mb-2">Saved &amp; Moved to Trash</p>
              <p className="text-sm text-txt-secondary">Season awards saved.</p>
            </div>
          </div>
        ) : sheetId ? (
          <div className="flex-1 flex flex-col overflow-hidden gap-3">

            {/* AI Hero Panel — primary path. The user can run the AI
                prompt through ChatGPT/Claude/Gemini, paste the response
                into the sheet below, then save. Manual entry into the
                sheet is still supported but framed as the secondary
                path. */}
            <div
              className="rounded-lg p-3 sm:p-4 border-l-[3px] flex items-center gap-3 sm:gap-4 flex-wrap"
              style={{ borderLeftColor: 'var(--text-primary)', backgroundColor: 'var(--surface-2)' }}
            >
              <div className="flex-1 min-w-[200px]">
                <div className="label-xs text-txt-tertiary mb-1" style={{ letterSpacing: '1.5px' }}>
                  AI WORKFLOW · RECOMMENDED
                </div>
                <p className="text-sm text-txt-primary font-semibold">
                  Skip the typing. Let AI fill the sheet.
                </p>
                <p className="text-xs text-txt-secondary mt-1">
                  Copy the prompt → paste into your AI assistant → paste the AI's reply into the sheet → save.
                </p>
              </div>
              <button
                onClick={() => setShowAIPrompt(true)}
                className="px-4 sm:px-5 py-2.5 rounded-lg font-semibold text-sm hover:opacity-90 transition-opacity flex-shrink-0"
                style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}
              >
                Copy AI Prompt
              </button>
            </div>

            {/* Sheet — embedded iframe on desktop, instructional view
                on mobile. Manual editing happens here regardless of
                whether the user pastes AI output or types each cell. */}
            {isMobile || !useEmbedded ? (
              <SheetManualEntry sheetId={sheetId} whatToDo="Enter award winners (Player, Position, Team, Class)" />
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                <SheetToolbar sheetId={sheetId} embedUrl={embedUrl} teamColors={teamColors} title="Awards" />
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
      <AuthErrorModal isOpen={auth.showAuthError} onClose={auth.closeAuthError} onRefresh={auth.retry} teamColors={teamColors} />
      <AIPromptModal isOpen={showAIPrompt} onClose={() => setShowAIPrompt(false)} title={`${currentYear} Season Awards`} prompt={aiPrompt} pasteTarget={`Cell B2 of the "${currentYear}" tab`} />
    </div>,
    document.body,
  )
}
