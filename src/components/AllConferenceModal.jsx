import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import SheetModalHeader from './ui/SheetModalHeader'
import AuthErrorModal from './AuthErrorModal'
import { useAuthErrorHandler } from '../hooks/useAuthErrorHandler'
import SheetToolbar from './SheetToolbar'
import SheetModalAIHero from './ui/SheetModalAIHero'
import SheetModalFooter from './ui/SheetModalFooter'
import SheetManualEntry from './ui/SheetManualEntry'
import {
  createAllConferenceSheet,
  readAllConferenceFromSheet,
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

export default function AllConferenceModal({ isOpen, onClose, onSave, currentYear, teamColors }) {
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
    return localStorage.getItem('sheetEmbedPreference') === 'true'
  })
  const [highlightSave, setHighlightSave] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} All-Conference`,
    structure: `This sheet has ONE TAB PER CONFERENCE. Default layout = 10 tabs with these EXACT names (case-sensitive):
  Big Ten | SEC | Big 12 | ACC | Pac-12 | Mountain West | American | Sun Belt | Conference USA | MAC

⚠️ If the user's sheet has CUSTOM conferences (different tab names), the
default list above does NOT apply. In that case:
  • Read the actual tab names from the user's screenshots (the tab strip
    at the bottom of Google Sheets, or any header the user includes).
  • Output ONE block per tab that actually exists, in left-to-right tab
    order.
  • Label each block with the tab's EXACT name, copied character-for-
    character from the screenshot.
  • NEVER invent a "Big Ten" / "SEC" / etc. block if those tabs don't
    exist in the user's sheet — pasting into a missing tab fails.

Every tab has the SAME layout: 28 rows × 12 columns organized as three side-by-side team blocks (First-Team, Second-Team, Freshman Team), each block = 4 columns (Position | Player | Team | Class).

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. One output BLOCK per conference tab (so 10 blocks for default, labeled with the conference name).
2. Row order is FIXED by the 25 positions below — output exactly 25 lines per block in that exact order.
3. Each line has EXACTLY 12 tab-separated fields (11 tabs per line): Position, First Player, First Team, First Class, Position, Second Player, Second Team, Second Class, Position, Freshman Player, Freshman Team, Freshman Class.
4. The Position value must be repeated identically in the 1st, 5th, and 9th fields of every line (the sheet has three Position columns).
5. NO COMMAS in any value. No commentary, totals, "N/A", or dashes.
6. BLANK field for unknown (empty between tabs). Never guess. A Freshman-team slot empty = leave Player/Team/Class blank.
7. Use ONLY the literal dropdown values listed below for Position, Team, and Class.
8. Team column values (cols C, G, K) must be UPPERCASE team abbreviations from the mapping below — NEVER full names. Each team listed in a block MUST actually belong to THIS conference for this tab. Teams from other conferences will be semantically wrong even if the dropdown accepts them.
9. Do NOT output rows 1-3 (merged title, team-group headers, column headers) — they are pre-filled.

═══════════════════════════════════════════════════════════
SHARED LAYOUT (same for every conference tab)
═══════════════════════════════════════════════════════════
Rows 1-3 (pre-filled, DO NOT OUTPUT):
  Row 1: "All-<Conference>" (merged A1:L1)
  Row 2: "First-Team" (A2:D2, merged) | "Second-Team" (E2:H2, merged) | "Freshman Team" (I2:L2, merged)
  Row 3: Position | Player | Team | Class | Position | Player | Team | Class | Position | Player | Team | Class

Rows 4-28 (YOUR OUTPUT, 25 lines, 12 tab-separated fields each, positions in fixed order):
  Row 4 → QB
  Row 5 → HB
  Row 6 → HB
  Row 7 → WR
  Row 8 → WR
  Row 9 → WR
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

HB appears twice (rows 5-6), WR three times (rows 7-9), DT twice (rows 18-19), CB twice (rows 23-24). Use different players in each slot for the same conference/team-group — do not duplicate a name.

Per-line output (12 tab-separated fields):
<Position>\\t<First Player>\\t<First Team>\\t<First Class>\\t<Position>\\t<Second Player>\\t<Second Team>\\t<Second Class>\\t<Position>\\t<Freshman Player>\\t<Freshman Team>\\t<Freshman Class>

Field formats:
- Position (appears 3 times per line) — must be EXACTLY one of, case-sensitive:
    QB | HB | FB | WR | TE | LT | LG | C | RG | RT | LEDG | REDG | DT | SAM | MIKE | WILL | CB | FS | SS | K | P
  Use the position that matches the row from the list above. The same value goes in all three Position slots.
- Player — full name string. Leave blank if unknown. Do NOT invent players.
- Team (strict dropdown) — uppercase abbreviation from the mapping below (e.g. BAMA, OSU, UGA, TEX, USC). NEVER full names or nicknames. Must be a member of the conference this tab represents.
- Class (strict dropdown) — must be EXACTLY one of, case-sensitive:
    Fr | RS Fr | So | RS So | Jr | RS Jr | Sr | RS Sr
  Note the literal space in "RS Fr"/"RS So"/"RS Jr"/"RS Sr". No "Freshman"/"Sophomore"/"FR"/"SO"/"R-Fr"/"RSFr". Freshman-team slots must be Fr or RS Fr only.

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT (one labeled block per conference tab)
═══════════════════════════════════════════════════════════
=== Big Ten — paste at cell A4 of "Big Ten" tab ===
<25 lines × 12 tab-separated fields>

=== SEC — paste at cell A4 of "SEC" tab ===
<25 lines × 12 tab-separated fields>

=== Big 12 — paste at cell A4 of "Big 12" tab ===
<25 lines × 12 tab-separated fields>

=== ACC — paste at cell A4 of "ACC" tab ===
<25 lines × 12 tab-separated fields>

=== Pac-12 — paste at cell A4 of "Pac-12" tab ===
<25 lines × 12 tab-separated fields>

=== Mountain West — paste at cell A4 of "Mountain West" tab ===
<25 lines × 12 tab-separated fields>

=== American — paste at cell A4 of "American" tab ===
<25 lines × 12 tab-separated fields>

=== Sun Belt — paste at cell A4 of "Sun Belt" tab ===
<25 lines × 12 tab-separated fields>

=== Conference USA — paste at cell A4 of "Conference USA" tab ===
<25 lines × 12 tab-separated fields>

=== MAC — paste at cell A4 of "MAC" tab ===
<25 lines × 12 tab-separated fields>

(If the user's sheet has custom conferences, output one labeled block per tab that actually exists, using the exact tab name in the label.)

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] One labeled block per conference tab, exact tab name in the label
[ ] Each block has exactly 25 lines in the exact position order: QB, HB, HB, WR, WR, WR, TE, LT, LG, C, RG, RT, LEDG, REDG, DT, DT, SAM, MIKE, WILL, CB, CB, FS, SS, K, P
[ ] Each line has exactly 12 tab-separated fields (11 tabs)
[ ] The 1st, 5th, and 9th fields on every line hold the SAME position value matching that row
[ ] All Position values are from the exact list: QB, HB, FB, WR, TE, LT, LG, C, RG, RT, LEDG, REDG, DT, SAM, MIKE, WILL, CB, FS, SS, K, P
[ ] All Class values are from the exact list: Fr, RS Fr, So, RS So, Jr, RS Jr, Sr, RS Sr
[ ] All Freshman-team Class values are Fr or RS Fr
[ ] All Team values are uppercase abbreviations from the mapping — and each team is a member of THIS tab's conference
[ ] Blank fields for unknowns — nothing was invented
[ ] No commas, no header rows, no commentary INSIDE the data. The paste-target label(s) above each fence are required (see Method A/B rules above).`,
    includeTeamMap: true,
    dynastyTeams: currentDynasty?.teams,
  }), [currentYear, currentDynasty?.teams])

  // Ref to prevent concurrent sheet creation
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
        // Check for existing sheet for this year
        const existingSheetId = currentDynasty?.allConferenceSheetIdByYear?.[currentYear]
        if (existingSheetId) {
          const stillExists = await sheetExists(existingSheetId)
          if (stillExists) {
            setSheetId(existingSheetId)
            return
          }
          await updateDynasty(currentDynasty.id, {
            allConferenceSheetIdByYear: { ...(currentDynasty.allConferenceSheetIdByYear || {}), [currentYear]: null }
          })
          // stale sheet (trashed in Drive); fall through to regenerate
        }
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          // Get existing all-conference data grouped by conference for pre-filling
          const allConferenceByConference = currentDynasty?.allAmericansByYear?.[currentYear]?.allConferenceByConference || {}
          // Get custom conferences for this year (if any)
          const customConferences = currentDynasty?.conferencesByYear?.[currentYear] || null
          // Get custom teams for dropdown validation
          const customTeams = currentDynasty?.teams || currentDynasty?.customTeams || null
          const sheetInfo = await createAllConferenceSheet(
            currentYear,
            allConferenceByConference,
            customConferences,
            customTeams
          )
          setSheetId(sheetInfo.spreadsheetId)
          const existingByYear = currentDynasty?.allConferenceSheetIdByYear || {}
          await updateDynasty(currentDynasty.id, {
            allConferenceSheetIdByYear: { ...existingByYear, [currentYear]: sheetInfo.spreadsheetId }
          })
        } catch (error) {
          console.error('Failed to create all-conference sheet:', error)
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
      // Read from all conference tabs
      // Pass the conference list (matching the tabs we created) as arg 2,
      // and dynastyTeams as arg 3. Previously the dynasty.teams object
      // was being passed as `conferences` by mistake — `for (const c of {})`
      // threw "{} is not iterable" and the sync silently failed.
      const customConferences = currentDynasty?.conferencesByYear?.[currentYear] || null
      const conferenceTabs = customConferences && Object.keys(customConferences).length > 0
        ? Object.keys(customConferences).sort()
        : undefined // let the function fall back to ALL_CONFERENCES default
      const dynastyTeams = currentDynasty?.teams || currentDynasty?.customTeams || null
      const data = await readAllConferenceFromSheet(sheetId, conferenceTabs, dynastyTeams)
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
      // Pass the conference list (matching the tabs we created) as arg 2,
      // and dynastyTeams as arg 3. Previously the dynasty.teams object
      // was being passed as `conferences` by mistake — `for (const c of {})`
      // threw "{} is not iterable" and the sync silently failed.
      const customConferences = currentDynasty?.conferencesByYear?.[currentYear] || null
      const conferenceTabs = customConferences && Object.keys(customConferences).length > 0
        ? Object.keys(customConferences).sort()
        : undefined // let the function fall back to ALL_CONFERENCES default
      const dynastyTeams = currentDynasty?.teams || currentDynasty?.customTeams || null
      const data = await readAllConferenceFromSheet(sheetId, conferenceTabs, dynastyTeams)
      await onSave(data)
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
      const existingByYear = currentDynasty?.allConferenceSheetIdByYear || {}
      await updateDynasty(currentDynasty.id, {
        allConferenceSheetIdByYear: { ...existingByYear, [currentYear]: null }
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
      title: 'Delete this All-Conference sheet?',
      message: 'This deletes the Google Sheet without applying any edits. Your dynasty All-Conference selections stay as-is.',
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (!ok) return
    setDeletingSheet(true)
    try {
      await deleteGoogleSheet(sheetId)
      const existingByYear = currentDynasty?.allConferenceSheetIdByYear || {}
      await updateDynasty(currentDynasty.id, {
        allConferenceSheetIdByYear: { ...existingByYear, [currentYear]: null }
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

  // Default to first conference tab for embed
  const embedUrl = sheetId ? getSheetEmbedUrl(sheetId, 'ACC') : null
  const isLoading = creatingSheet

  return createPortal(
    <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4" style={{ margin: 0 }} onMouseDown={handleClose}>
      <div className={`card-elevated w-full max-h-[calc(100dvh-4rem)] flex flex-col overflow-hidden ${
        useEmbedded
          ? 'sm:w-[95vw] sm:h-[95dvh]'
          : 'sm:max-w-[680px] sm:h-auto'
      }`} onMouseDown={(e) => e.stopPropagation()}>
        <SheetModalHeader eyebrow="Postseason" title={`${currentYear} All-Conference`} onClose={handleClose} />

        <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin w-12 h-12 border-4 rounded-full mx-auto mb-4" style={{ borderColor: 'var(--text-primary)', borderTopColor: 'transparent' }} />
              <p className="text-lg font-semibold text-txt-primary">Creating All-Conference Sheet...</p>
              <p className="text-sm mt-2 text-txt-tertiary">10 conference tabs</p>
              <SheetLoadingHint active={isLoading} />
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="card p-8 border-l-[3px] text-center max-w-sm" style={{ borderLeftColor: 'var(--surface-5)' }}>
              <p className="label-xs text-txt-tertiary mb-2">Status</p>
              <p className="text-xl font-bold text-txt-primary mb-2">Saved &amp; Moved to Trash</p>
              <p className="text-sm text-txt-secondary">All-Conference selections saved.</p>
            </div>
          </div>
        ) : sheetId ? (
          <div className="flex-1 flex flex-col overflow-hidden gap-3">
            <SheetModalAIHero
              tagline="Skip the typing. Let AI fill the All-Conference roster."
              buttons={[{ label: 'Copy AI Prompt', prompt: aiPrompt }]}
            />
            {isMobile || !useEmbedded ? (
              <SheetManualEntry sheetId={sheetId} />
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden min-h-0 border border-surface-4 rounded-lg">
                <SheetToolbar sheetId={sheetId} embedUrl={embedUrl} teamColors={teamColors} title="All-Conference" />
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
