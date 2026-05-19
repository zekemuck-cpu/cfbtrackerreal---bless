import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import SheetModalHeader from './ui/SheetModalHeader'
import SheetManualEntry from './ui/SheetManualEntry'
import SheetModalAIHero from './ui/SheetModalAIHero'
import SheetModalFooter from './ui/SheetModalFooter'
import AuthErrorModal from './AuthErrorModal'
import { useAuthErrorHandler } from '../hooks/useAuthErrorHandler'
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

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} Season Awards`,
    structure: `This sheet has ONE tab named "${currentYear}" (the current year). It has 5 columns and 23 rows: row 1 is a protected header, rows 2-23 are the 22 awards.

Column A (Award name) is PRE-FILLED and PROTECTED — you never output it.
You fill columns B (Player), C (Position), D (Team), E (Class).

═══════════════════════════════════════════════════════════
EXACTLY TWO COACH AWARDS — READ THIS FIRST
═══════════════════════════════════════════════════════════
Of the 22 awards on the sheet, ONLY two are coach awards. They are:

  • Sheet row 5  — Bear Bryant Coach of the Year   (winner is a head coach)
  • Sheet row 17 — Broyles                          (winner is an assistant coach / coordinator)

EVERY OTHER AWARD IS A PLAYER AWARD. That includes namesake awards
where the namesake was historically a coach — e.g. the Walter Camp
Award (row 4) was named after Walter Camp, who was a coach, but the
AWARD honors a player (the best player in college football). Do not
get fooled by names. The award TYPE is determined by the sheet row
and the explicit list above, not by the historical figure the award
is named for.

If you confuse a player award for a coach award, two things break:
the row gets a coach name and a team-only output (which is wrong for
a player award), AND the coach award row gets a player's stat line
(wrong for a coach award). You have done this before — do not do it
again. Stick to the explicit row map.

═══════════════════════════════════════════════════════════
CRITICAL RULES
═══════════════════════════════════════════════════════════
1. Output ONLY columns B, C, D, E. Never output column A (Award name), the header row, row numbers, or any labels.
2. Row order is FIXED. Output EXACTLY 22 data rows in the exact order shown below — one per award. Line N of your output lands in sheet row N+1.
3. NO COMMAS in any value. No totals, no explanation text, no "N/A", no dashes.
4. BLANK field for unknown (empty string between the tabs). Never guess, never write "Unknown", never put zero.
5. Use ONLY the literal dropdown values listed — wrong spelling/casing = Google Sheets rejects it.
6. Team column (D) uses the ABBREVIATION from the mapping at the bottom of this prompt — NEVER full names or mascots.
7. COACH AWARDS (rows 5 & 17 only — see the explicit list above) have cells C, D, E MERGED into ONE wide cell that holds the Team. The merge anchor is column C. For those two rows ONLY, output exactly 3 tab characters yielding 4 fields:
       CoachName<TAB>TeamAbbr<TAB><TAB>
   Concretely: field1 = CoachName, field2 = TeamAbbr, field3 = EMPTY, field4 = EMPTY.
   NEVER put the team in field 3 or 4 on a coach row — the team must land in column C (the merge anchor); fields 3 and 4 are merged-away cells D and E and MUST be empty.
   NEVER output the coach-row pattern for any other row. All 20 non-coach rows MUST output 4 fields: Player<TAB>Position<TAB>Team<TAB>Class.
8. ONE TSV block total — exactly 22 lines, preceded by the required paste-target label line above the fence (see Method A/B rules above).

═══════════════════════════════════════════════════════════
TAB "${currentYear}" — 22 rows × 4 output columns
Paste at cell B2 of the "${currentYear}" tab
═══════════════════════════════════════════════════════════

Row-by-row map. Output line N corresponds to sheet row N+1.

  Line | Sheet Row | Type   | Award (Col A, PROTECTED — DO NOT OUTPUT) | Output shape (4 tab-separated fields)
  -----+-----------+--------+-------------------------------------------+-----------------------------------------------
   1   |     2     | PLAYER | Heisman                                   | Player<TAB>Position<TAB>Team<TAB>Class
   2   |     3     | PLAYER | Maxwell                                   | Player<TAB>Position<TAB>Team<TAB>Class
   3   |     4     | PLAYER | Walter Camp                               | Player<TAB>Position<TAB>Team<TAB>Class
   4   |     5     | COACH  | Bear Bryant Coach of the Year             | CoachName<TAB>Team<TAB><TAB>      ← coach pattern; Team in field 2 (col C merge anchor); fields 3 & 4 EMPTY
   5   |     6     | PLAYER | Davey O'Brien                             | Player<TAB>Position<TAB>Team<TAB>Class
   6   |     7     | PLAYER | Chuck Bednarik                            | Player<TAB>Position<TAB>Team<TAB>Class
   7   |     8     | PLAYER | Bronco Nagurski                           | Player<TAB>Position<TAB>Team<TAB>Class
   8   |     9     | PLAYER | Jim Thorpe                                | Player<TAB>Position<TAB>Team<TAB>Class
   9   |    10     | PLAYER | Doak Walker                               | Player<TAB>Position<TAB>Team<TAB>Class
  10   |    11     | PLAYER | Fred Biletnikoff                          | Player<TAB>Position<TAB>Team<TAB>Class
  11   |    12     | PLAYER | Lombardi                                  | Player<TAB>Position<TAB>Team<TAB>Class
  12   |    13     | PLAYER | Unitas Golden Arm                         | Player<TAB>Position<TAB>Team<TAB>Class
  13   |    14     | PLAYER | Edge Rusher of the Year                   | Player<TAB>Position<TAB>Team<TAB>Class
  14   |    15     | PLAYER | Outland                                   | Player<TAB>Position<TAB>Team<TAB>Class
  15   |    16     | PLAYER | John Mackey                               | Player<TAB>Position<TAB>Team<TAB>Class
  16   |    17     | COACH  | Broyles                                   | CoachName<TAB>Team<TAB><TAB>      ← coach pattern; Team in field 2 (col C merge anchor); fields 3 & 4 EMPTY
  17   |    18     | PLAYER | Dick Butkus                               | Player<TAB>Position<TAB>Team<TAB>Class
  18   |    19     | PLAYER | Rimington                                 | Player<TAB>Position<TAB>Team<TAB>Class
  19   |    20     | PLAYER | Lou Groza                                 | Player<TAB>Position<TAB>Team<TAB>Class
  20   |    21     | PLAYER | Ray Guy                                   | Player<TAB>Position<TAB>Team<TAB>Class
  21   |    22     | PLAYER | Returner of the Year                      | Player<TAB>Position<TAB>Team<TAB>Class
  22   |    23     | PLAYER | Shaun Alexander                           | Player<TAB>Position<TAB>Team<TAB>Class    ← Most Outstanding Freshman; Class is almost always Fr or RS Fr

Only TWO lines use the COACH pattern (lines 4 and 16). Every other
line uses the PLAYER pattern. If you find yourself emitting more than
two coach lines, or fewer than two, or any coach line at a row other
than line 4 or line 16, STOP and re-read the row table.

Field formats:
- Player: full name string (e.g. "John Smith"). Leave blank if unknown.
- Position (strict dropdown) — must be EXACTLY one of these 21 values, case-sensitive:
    QB | HB | FB | WR | TE | LT | LG | C | RG | RT | LEDG | REDG | DT | SAM | MIKE | WILL | CB | FS | SS | K | P
  Do NOT use "RB", "OL", "LB", "DE", "S", "OG", "OT" — those will be REJECTED by the dropdown.
- Team (strict dropdown) — uppercase abbreviation from the team mapping at the bottom of this prompt (e.g. BAMA, OSU, UGA). NEVER full names ("Alabama", "Ohio State") or nicknames ("Crimson Tide"). On COACH rows this is the coach's TEAM (the school the coach works for), in field 2.
- Class (strict dropdown) — must be EXACTLY one of these 8 values, case-sensitive:
    Fr | RS Fr | So | RS So | Jr | RS Jr | Sr | RS Sr
  Note the literal space in "RS Fr", "RS So", "RS Jr", "RS Sr". Do NOT use "Freshman", "Sophomore", "Junior", "Senior", "FR", "SO", "JR", "SR", "RSFr", "R-Fr", etc.

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== AWARDS — paste at cell B2 of "${currentYear}" tab ===
<line 1, row 2,  Heisman:                   Player\\tPosition\\tTeam\\tClass>
<line 2, row 3,  Maxwell:                   Player\\tPosition\\tTeam\\tClass>
<line 3, row 4,  Walter Camp:               Player\\tPosition\\tTeam\\tClass>     ← PLAYER AWARD — do NOT emit a coach name here
<line 4, row 5,  Bear Bryant Coach of Year: CoachName\\tTeam\\t\\t>               ← COACH AWARD — Team in field 2, fields 3 & 4 empty
<line 5, row 6,  Davey O'Brien:             Player\\tPosition\\tTeam\\tClass>
<line 6, row 7,  Chuck Bednarik:            Player\\tPosition\\tTeam\\tClass>
<line 7, row 8,  Bronco Nagurski:           Player\\tPosition\\tTeam\\tClass>
<line 8, row 9,  Jim Thorpe:                Player\\tPosition\\tTeam\\tClass>
<line 9, row 10, Doak Walker:               Player\\tPosition\\tTeam\\tClass>
<line 10, row 11, Fred Biletnikoff:         Player\\tPosition\\tTeam\\tClass>
<line 11, row 12, Lombardi:                 Player\\tPosition\\tTeam\\tClass>
<line 12, row 13, Unitas Golden Arm:        Player\\tPosition\\tTeam\\tClass>
<line 13, row 14, Edge Rusher of the Year:  Player\\tPosition\\tTeam\\tClass>
<line 14, row 15, Outland:                  Player\\tPosition\\tTeam\\tClass>
<line 15, row 16, John Mackey:              Player\\tPosition\\tTeam\\tClass>
<line 16, row 17, Broyles:                  CoachName\\tTeam\\t\\t>               ← COACH AWARD — Team in field 2, fields 3 & 4 empty
<line 17, row 18, Dick Butkus:              Player\\tPosition\\tTeam\\tClass>
<line 18, row 19, Rimington:                Player\\tPosition\\tTeam\\tClass>
<line 19, row 20, Lou Groza:                Player\\tPosition\\tTeam\\tClass>
<line 20, row 21, Ray Guy:                  Player\\tPosition\\tTeam\\tClass>
<line 21, row 22, Returner of the Year:     Player\\tPosition\\tTeam\\tClass>
<line 22, row 23, Shaun Alexander:          Player\\tPosition\\tTeam\\tClass>

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] Exactly 22 lines in the block, in the EXACT order above (Heisman first, Shaun Alexander last)
[ ] Line 3 (Walter Camp) uses the PLAYER pattern — NOT the coach pattern. Walter Camp is a PLAYER award even though the namesake was a coach.
[ ] EXACTLY TWO lines use the coach pattern: line 4 (Bear Bryant Coach of the Year) and line 16 (Broyles). Every other line uses the player pattern.
[ ] On the two coach lines, the format is CoachName<TAB>Team<TAB><TAB> — Team is the SECOND field (col C, the merge anchor), the third and fourth fields are EMPTY (they are merged-away cells D & E). Do NOT leave field 2 empty and put the team in field 3 — that would land the team in column D inside the merged region and leave column C blank.
[ ] All 20 non-coach lines have 4 tab-separated slots: Player<TAB>Position<TAB>Team<TAB>Class (individual fields may be blank if unknown)
[ ] All Position values are from the exact list: QB, HB, FB, WR, TE, LT, LG, C, RG, RT, LEDG, REDG, DT, SAM, MIKE, WILL, CB, FS, SS, K, P
[ ] All Class values are from the exact list: Fr, RS Fr, So, RS So, Jr, RS Jr, Sr, RS Sr
[ ] All Team values are uppercase abbreviations from the mapping — no full names
[ ] Blank fields for unknowns — nothing was invented
[ ] No award name, header row, commas, commentary, or explanation INSIDE the data. The paste-target label above the fence is required (see Method A/B rules above).`,
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
      <div className={`card-elevated w-full max-h-[calc(100dvh-4rem)] flex flex-col overflow-hidden ${
        useEmbedded
          ? 'sm:w-[95vw] sm:h-[95dvh]'
          : 'sm:max-w-[680px] sm:h-auto'
      }`} onMouseDown={(e) => e.stopPropagation()}>
        <SheetModalHeader eyebrow="Season Awards" title={`${currentYear} Awards`} onClose={handleClose} />

        <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin w-12 h-12 border-4 rounded-full mx-auto mb-4" style={{ borderColor: 'var(--text-primary)', borderTopColor: 'transparent' }} />
              <SheetLoadingHint active={isLoading} />
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xl font-bold text-txt-primary">Saved</p>
          </div>
        ) : sheetId ? (
          <div className="flex-1 flex flex-col overflow-hidden gap-3">

            <SheetModalAIHero
              tagline="Skip the typing. Let AI fill the awards."
              buttons={[{ label: 'Copy AI Prompt', prompt: aiPrompt }]}
            />

            {/* Sheet — embedded iframe on desktop, instructional view
                on mobile. Manual editing happens here regardless of
                whether the user pastes AI output or types each cell. */}
            {isMobile || !useEmbedded ? (
              <SheetManualEntry sheetId={sheetId} />
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
    </div>,
    document.body,
  )
}
