import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty, getCustomConferencesForYear } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import SheetModalHeader from './ui/SheetModalHeader'
import SheetModalAIHero from './ui/SheetModalAIHero'
import SheetManualEntry from './ui/SheetManualEntry'
import SheetModalFooter from './ui/SheetModalFooter'
import AuthErrorModal from './AuthErrorModal'
import { useAuthErrorHandler } from '../hooks/useAuthErrorHandler'
import SheetToolbar from './SheetToolbar'
import {
  createConferencesSheet,
  readConferencesFromSheet,
  deleteGoogleSheet,
  getSheetEmbedUrl,
  sheetExists
} from '../services/sheetsService'
import { getModalColors } from '../utils/colorUtils'
import { buildAIPrompt } from '../utils/aiPrompt'
import SheetLoadingHint from './SheetLoadingHint'

// Simple mobile detection
const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export default function ConferencesModal({ isOpen, onClose, onSave, teamColors }) {
  const { currentDynasty, updateDynasty } = useDynasty()
  const { user, signOut } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()
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
    title: `Custom Conferences`,
    structure: `This sheet has ONE TAB PER SEASON YEAR (tab titles like "${currentDynasty?.currentYear || new Date().getFullYear()}", "${(currentDynasty?.currentYear || new Date().getFullYear()) - 1}", etc.). Focus on the "${currentDynasty?.currentYear || new Date().getFullYear()}" tab (the current year).
Each tab has the SAME layout: row 1 is a PROTECTED header of conference names; rows 2-21 are 20 team-slot rows (one cell per conference × column).

Row 1 (PROTECTED) — column headers in alphabetical order, typically these 11 conferences:
ACC | American | Big 12 | Big Ten | Conference USA | Independent | MAC | Mountain West | Pac-12 | SEC | Sun Belt
(If the user has renamed/added/removed conferences, column headers will differ. You must output one column per header in the exact left-to-right order shown in the sheet.)

You fill rows 2-21 (20 rows) with team abbreviations, one team per cell, going top-to-bottom within each conference's column.

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. Output ONLY rows 2-21 of data (up to 20 rows). NEVER output row 1 (conference-name headers).
2. Output EXACTLY as many columns as the sheet has conference-name headers, in the exact left-to-right order (default: 11 columns alphabetically).
3. Each line has tab-separated team abbreviations — one cell per conference column. Use an empty field (two consecutive tabs) for conferences whose column has fewer than the current row's index worth of teams.
4. Every team abbreviation must be UPPERCASE from the mapping at the bottom — NEVER full names or nicknames.
5. Every FBS team must appear EXACTLY ONCE across all columns in the block. Duplicates will cause a validation error when the sheet is read back.
6. Each team must be placed in the column matching its real conference.
7. NO COMMAS. No commentary. No header rows. No "N/A", no dashes.
8. Row order within a column: list the teams ALPHABETICALLY BY ABBREVIATION (e.g. for SEC: ARK before AUB before BAMA before FLA before LSU). One team per row, top-to-bottom. The "either is acceptable" wording from older versions is gone — pick alphabetical and stick to it; the validator doesn't care, but a consistent rule prevents the AI from fence-sitting.
9. ONE TSV block total, preceded by the required paste-target label line above the fence (see Method A/B rules above).

═══════════════════════════════════════════════════════════
TAB "${currentDynasty?.currentYear || new Date().getFullYear()}" — 20 rows × (number of conferences) columns
Paste at cell A2 of the "${currentDynasty?.currentYear || new Date().getFullYear()}" tab
═══════════════════════════════════════════════════════════

Default 11-column layout (your output has 11 tab-separated fields per line):
Col 1 = ACC | Col 2 = American | Col 3 = Big 12 | Col 4 = Big Ten | Col 5 = Conference USA | Col 6 = Independent | Col 7 = MAC | Col 8 = Mountain West | Col 9 = Pac-12 | Col 10 = SEC | Col 11 = Sun Belt

Default conference memberships (current real-world alignment — use these unless the screenshot shows different):
- ACC: BC, CAL, CLEM, DUKE, FSU, GT, LOU, MIA, NCST, UNC, PITT, SMU, SYR, STAN, UVA, VT, WAKE
- American: ARMY, CHAR, ECU, FAU, MEM, NAVY, UNT, RICE, TULN, TLSA, UAB, USF, UTSA
- Big 12: ARIZ, ASU, BU, BYU, UC, COLO, UH, ISU, KU, KSU, OKST, TCU, TTU, UCF, UTAH, WVU
- Big Ten: ILL, IU, IOWA, UMD, MICH, MSU, MINN, NEB, NU, OSU, ORE, PSU, PUR, RUTG, UCLA, USC, WASH, WIS
- Conference USA: FIU, KENN, LIB, LT, MTSU, NMSU, SHSU, UTEP, WKU
- Independent: ND, CONN, MASS
- MAC: AKR, BALL, BGSU, BUFF, CMU, EMU, KENT, M-OH, NIU, OHIO, TOL, WMU
- Mountain West: AFA, BOIS, CSU, FRES, HAW, NEV, SDSU, SJSU, UNLV, USU, WYO
- Pac-12: ORST, WSU
- SEC: BAMA, ARK, AUB, FLA, UGA, UK, LSU, MISS, MSST, MIZ, OU, SCAR, UT, TEX, TAMU, VAN
- Sun Belt: APP, ARST, CCU, GASO, GSU, JMU, JKST, ULM, UL, MRSH, ODU, USA, TXST, TROY

If the screenshot shows a DIFFERENT alignment (custom conferences / realignment year), use what the screenshot shows. Otherwise use the defaults above.

Per-line output (tab-separated, one field per conference column; blank if that column's conference has fewer teams than the current row number):
<ACC team>\\t<American team>\\t<Big 12 team>\\t<Big Ten team>\\t<Conf USA team>\\t<Indep team>\\t<MAC team>\\t<Mtn West team>\\t<Pac-12 team>\\t<SEC team>\\t<Sun Belt team>

Field format for every cell:
- Team abbreviation (strict dropdown) — UPPERCASE from the mapping at the bottom (e.g. BAMA, OSU, UGA). NEVER full names ("Alabama") or nicknames ("Crimson Tide").

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== CONFERENCES — paste at cell A2 of "${currentDynasty?.currentYear || new Date().getFullYear()}" tab ===
<row 2: 11 tab-separated cells, one team per conference column>
<row 3: 11 tab-separated cells>
<row 4: 11 tab-separated cells>
...continue for up to 20 rows...

(Stop before row 21 if no conference has more teams to list. Shorter blocks allowed. Smaller conferences like Independent (3 teams) and Pac-12 (2 teams in the default) will have blank fields in later rows.)

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] Every line has the same number of tab-separated fields = number of conference columns in the sheet (default 11)
[ ] Conference column ORDER matches the header row in the sheet (default: ACC, American, Big 12, Big Ten, Conference USA, Independent, MAC, Mountain West, Pac-12, SEC, Sun Belt)
[ ] Every FBS team appears EXACTLY ONCE across the entire block (no duplicates)
[ ] Every team is placed in its correct conference column
[ ] All team values are UPPERCASE abbreviations from the mapping — no full names, no nicknames
[ ] Empty cells (two consecutive tabs) for conferences with fewer teams than the row index
[ ] No header row, no commas, no commentary INSIDE the data. The paste-target label above the fence is required (see Method A/B rules above).`,
    includeTeamMap: true,
    dynastyTeams: currentDynasty?.teams,
  }), [currentDynasty?.currentYear, currentDynasty?.teams])

  // Ref to prevent concurrent sheet creation (state updates are async, refs are immediate)
  const creatingSheetRef = useRef(false)

  // Check for mobile on mount and resize
  useEffect(() => {
    setIsMobile(isMobileDevice())
    const handleResize = () => setIsMobile(isMobileDevice())
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

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

  // Get conference data for sheet creation - memoized to prevent recalculation on every render
  // Uses getCustomConferencesForYear which walks back through years automatically
  const conferenceData = useMemo(() => {
    try {
      const currentYear = currentDynasty?.currentYear
      if (!currentYear) return null

      // Get the effective conferences for the current year (may be inherited from previous year)
      const effectiveConferences = getCustomConferencesForYear(currentDynasty, currentYear)
      if (!effectiveConferences) return null

      // Return as year-keyed object for sheet creation
      // Include all historical years plus current year with effective data
      const byYear = currentDynasty?.customConferencesByYear || {}
      return { ...byYear, [currentYear]: effectiveConferences }
    } catch (error) {
      console.error('[ConferencesModal] Error getting conference data:', error)
      return null
    }
  }, [currentDynasty?.currentYear, currentDynasty?.customConferencesByYear, currentDynasty?.customConferences])

  const getConferencesForSheet = () => conferenceData
  const hasExistingConferences = !!conferenceData

  // Dark theme modal colors
  const modalColors = useMemo(() => getModalColors(teamColors), [teamColors])

  // Create Conferences sheet when modal opens
  useEffect(() => {
    const createSheet = async () => {
      if (isOpen && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote) {
        // Get saved conferences data
        const conferencesByYear = getConferencesForSheet()

        // Check if we have an existing conferences sheet
        const existingSheetId = currentDynasty?.conferencesSheetId
        if (existingSheetId) {
          // If we have saved custom conferences, delete old sheet and create fresh
          // This ensures the sheet always reflects the latest saved data
          if (conferencesByYear) {
            try {
              await deleteGoogleSheet(existingSheetId)
              await updateDynasty(currentDynasty.id, { conferencesSheetId: null, conferencesSheetUrl: null })
            } catch (e) {
              console.log('Could not delete old conferences sheet, creating new one anyway')
            }
          } else {
            // No saved conferences, just use existing sheet
            const stillExists = await sheetExists(existingSheetId)
            if (stillExists) {
              setSheetId(existingSheetId)
              return
            }
            await updateDynasty(currentDynasty.id, { conferencesSheetId: null, conferencesSheetUrl: null })
            // stale sheet (trashed in Drive); fall through to regenerate
          }
        }

        // Set ref immediately to prevent concurrent calls (state updates are async)
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          // Pass all years' custom conferences if available
          const sheetInfo = await createConferencesSheet(
            currentDynasty?.teamName || 'Dynasty',
            currentDynasty?.currentYear || new Date().getFullYear(),
            conferencesByYear,
            currentDynasty?.teams || currentDynasty?.customTeams
          )
          setSheetId(sheetInfo.spreadsheetId)

          // Save sheet ID to dynasty
          await updateDynasty(currentDynasty.id, {
            conferencesSheetId: sheetInfo.spreadsheetId,
            conferencesSheetUrl: sheetInfo.spreadsheetUrl
          })
        } catch (error) {
          console.error('Failed to create conferences sheet:', error)
          // Without this branch the OAuth-expired case silently failed:
          // the modal flipped out of "creating…" with no toast and no
          // re-auth prompt. Route through auth.handleError so the
          // AuthErrorModal fires; fall back to a toast for anything
          // else so the user knows the save didn't go through.
          if (!auth.handleError(error)) {
            toast.error('Failed to create the conferences sheet — try again or contact support.')
          }
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
      creatingSheetRef.current = false
    }
  }, [isOpen])

  const handleSyncFromSheet = async () => {
    if (!sheetId) return

    setSyncing(true)
    try {
      const conferences = await readConferencesFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(conferences)
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
      const conferences = await readConferencesFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(conferences)

      await deleteGoogleSheet(sheetId)
      await updateDynasty(currentDynasty.id, { conferencesSheetId: null, conferencesSheetUrl: null })

      setSheetId(null)
      setShowDeletedNote(true)
      setTimeout(() => {
        onClose()
      }, 2500)
    } catch (error) {
      console.error('Failed to sync/move to trash:', error)
      if (!auth.handleError(error)) {
        toast.error(`Failed to sync/move to trash: ${error.message || 'Unknown error'}`)
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
      await updateDynasty(currentDynasty.id, { conferencesSheetId: null, conferencesSheetUrl: null })
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
      title: 'Delete this conferences sheet?',
      message: 'This deletes the Google Sheet without applying any edits. Your dynasty conference alignments stay as-is.',
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (!ok) return
    setDeletingSheet(true)
    try {
      await deleteGoogleSheet(sheetId)
      await updateDynasty(currentDynasty.id, { conferencesSheetId: null, conferencesSheetUrl: null })
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

  // Don't specify sheet name - let user see all year tabs
  const embedUrl = sheetId ? getSheetEmbedUrl(sheetId) : null
  const isLoading = creatingSheet

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4"
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
        <SheetModalHeader eyebrow="Realignment" title="Custom Conferences" onClose={handleClose} />

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
                Creating Conferences Sheet...
              </p>
              <p className="text-sm mt-2 text-txt-secondary">
                {hasExistingConferences
                  ? 'Loading your saved conference alignment'
                  : 'Setting up default EA CFB 26 conference alignment'}
              </p>
              <SheetLoadingHint active={isLoading} />
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="card p-8 border-l-[3px] text-center max-w-sm" style={{ borderLeftColor: 'var(--surface-5)' }}>
              <p className="label-xs text-txt-tertiary mb-2">Status</p>
              <p className="text-xl font-bold text-txt-primary mb-2">Saved &amp; Moved to Trash</p>
              <p className="text-sm text-txt-secondary">Conference alignment saved to your dynasty.</p>
            </div>
          </div>
        ) : sheetId ? (
          <div className="flex-1 flex flex-col overflow-hidden gap-3">
            <SheetModalAIHero
              tagline="Skip the typing. Let AI fill the conferences."
              buttons={[{ label: 'Copy AI Prompt', prompt: aiPrompt }]}
            />
            {isMobile || !useEmbedded ? (
              <SheetManualEntry sheetId={sheetId} />
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden min-h-0 border border-surface-4 rounded-lg">
                <SheetToolbar sheetId={sheetId} embedUrl={embedUrl} teamColors={teamColors} title="Custom Conferences" />
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

      {/* Auth Error Modal */}
      <AuthErrorModal
        isOpen={auth.showAuthError}
        onClose={auth.closeAuthError}
        onRefresh={auth.retry}
        teamColors={teamColors}
      />
    </div>,
    document.body,
  )
}
