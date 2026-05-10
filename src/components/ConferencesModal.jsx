import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty, getCustomConferencesForYear } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import SheetModalHeader from './ui/SheetModalHeader'
import AuthErrorModal from './AuthErrorModal'
import { useAuthErrorHandler } from '../hooks/useAuthErrorHandler'
import AIPromptModal from './AIPromptModal'
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
  const [showAIPrompt, setShowAIPrompt] = useState(false)

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
9. ONE TSV block total. Label it with paste target.

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
[ ] No header row, no commas, no commentary in the output`,
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
        className="card-elevated w-full sm:w-[95vw] max-h-[calc(100dvh-4rem)] sm:h-[95dvh] flex flex-col overflow-hidden"
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
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Action Buttons - only show at top for embedded view */}
            {!isMobile && useEmbedded && (
              <div className="mb-3">
                <div className="flex gap-3 flex-wrap items-center">
                  <button
                    onClick={handleSyncAndDelete}
                    disabled={syncing || deletingSheet}
                    className={`px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-all text-sm ${highlightSave ? 'animate-pulse ring-4 ring-offset-2 scale-105' : ''}`}
                    style={{
                      backgroundColor: 'var(--text-primary)',
                      color: 'var(--surface-1)'
                    }}
                  >
                    {deletingSheet ? 'Saving...' : 'Save & Move to Trash'}
                  </button>
                  <button
                    onClick={handleSyncFromSheet}
                    disabled={syncing || deletingSheet}
                    className="btn btn-secondary text-sm"
                  >
                    {syncing ? 'Syncing...' : 'Save & Keep Sheet'}
                  </button>
                  <button
                    onClick={() => setShowAIPrompt(true)}
                    className="px-4 py-2 rounded-lg text-sm font-medium border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent"
                  >
                    AI Prompt
                  </button>
                  <button
                    onClick={handleDeleteSheetOnly}
                    disabled={syncing || deletingSheet || regenerating}
                    className="px-4 py-2 rounded-lg font-semibold text-sm disabled:opacity-60 transition-colors border border-surface-4 hover:bg-surface-2 text-txt-secondary ml-auto"
                  >
                    {deletingSheet ? 'Deleting…' : 'Delete Sheet (No Save)'}
                  </button>
                  <button
                    onClick={handleRegenerateSheet}
                    disabled={syncing || deletingSheet || regenerating}
                    className="px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-colors text-sm border-2"
                    style={{
                      backgroundColor: 'transparent',
                      borderColor: '#EF4444',
                      color: '#EF4444'
                    }}
                  >
                    {regenerating ? 'Regenerating...' : 'Regenerate sheet'}
                  </button>
                  {highlightSave && (
                    <span className="text-xs font-medium animate-bounce" style={{ color: 'var(--text-primary)' }}>

                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Toggle between embedded and new tab */}
            {!isMobile && (
              <div className="flex items-center justify-end mb-2">
                <button
                  onClick={() => {
                    const newValue = !useEmbedded
                    setUseEmbedded(newValue)
                    localStorage.setItem('sheetEmbedPreference', newValue.toString())
                  }}
                  className="text-xs px-3 py-1 rounded-full border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent"
                >
                  {useEmbedded ? '← Back to default view' : 'Try embedded view (beta)'}
                </button>
              </div>
            )}

            {/* Mobile View - Open in Google Sheets button */}
            {isMobile || !useEmbedded ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                <h3 className="label-xs text-txt-tertiary mb-2">Data Entry</h3>
                <p className="text-2xl font-bold text-txt-primary mb-6">Edit in Google Sheets</p>

                {/* Step-by-step instructions */}
                <div className="text-left mb-6 max-w-sm w-full card p-4 border-l-[3px]" style={{ borderLeftColor: 'var(--surface-5)' }}>
                  <p className="label-xs text-txt-tertiary mb-3">Instructions</p>
                  <ol className="text-sm space-y-2 text-txt-secondary">
                    <li className="flex gap-3">
                      <span className="font-bold text-txt-primary tabular-nums">1.</span>
                      <span>Tap the button below to open Google Sheets</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="font-bold text-txt-primary tabular-nums">2.</span>
                      <span>Edit conference alignments as needed</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="font-bold text-txt-primary tabular-nums">3.</span>
                      <span>Return to this app when done</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="font-bold text-txt-primary tabular-nums">4.</span>
                      <span>Tap "Save" below to sync your conferences</span>
                    </li>
                  </ol>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3 mb-6">
                  <a
                    href={`https://docs.google.com/spreadsheets/d/${sheetId}/edit`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-6 py-3 rounded-lg font-bold text-lg hover:opacity-90 transition-colors flex items-center gap-2"
                    style={{
                      backgroundColor: '#0F9D58',
                      color: '#FFFFFF'
                    }}
                  >
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/>
                      <path d="M7 7h2v2H7zm0 4h2v2H7zm0 4h2v2H7zm4-8h6v2h-6zm0 4h6v2h-6zm0 4h6v2h-6z"/>
                    </svg>
                    Open Google Sheets
                  </a>
                  <button onClick={() => setShowAIPrompt(true)} className="px-5 py-3 rounded-lg text-sm font-medium border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent">AI Prompt</button>
                </div>

                {/* Centered Save Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 items-center justify-center mb-4">
                  <button
                    onClick={handleSyncAndDelete}
                    disabled={syncing || deletingSheet}
                    className={`px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-all text-sm ${highlightSave ? 'animate-pulse ring-4 ring-offset-2 scale-105' : ''}`}
                    style={{
                      backgroundColor: 'var(--text-primary)',
                      color: 'var(--surface-1)'
                    }}
                  >
                    {deletingSheet ? 'Saving...' : 'Save & Move to Trash'}
                  </button>
                  <button
                    onClick={handleSyncFromSheet}
                    disabled={syncing || deletingSheet}
                    className="btn btn-secondary px-6 py-3 text-sm"
                  >
                    {syncing ? 'Syncing...' : 'Save & Keep Sheet'}
                  </button>
                </div>
                {/* Start Over Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 items-center justify-center mb-4">
                  <button
                    onClick={handleDeleteSheetOnly}
                    disabled={syncing || deletingSheet || regenerating}
                    className="text-xs px-4 py-2 rounded-lg font-medium transition-colors border border-surface-4 hover:bg-surface-2 text-txt-secondary disabled:opacity-60"
                  >
                    {deletingSheet ? 'Deleting…' : 'Delete Sheet (No Save)'}
                  </button>
                  <button
                    onClick={handleRegenerateSheet}
                    disabled={syncing || deletingSheet || regenerating}
                    className="text-xs px-4 py-2 rounded-lg font-medium hover:opacity-90 transition-colors border"
                    style={{
                      backgroundColor: 'transparent',
                      borderColor: '#EF4444',
                      color: '#EF4444'
                    }}
                  >
                    {regenerating ? 'Regenerating...' : 'Messed up? Regenerate sheet'}
                  </button>
                </div>
                {highlightSave && (
                  <span className="text-sm font-medium animate-bounce mb-4" style={{ color: 'var(--text-primary)' }}>

                  </span>
                )}

                <div className="text-xs p-3 rounded-lg max-w-xs bg-surface-2 text-txt-primary">
                  <p className="font-semibold mb-1">Info:</p>
                  <p className="text-txt-secondary">Pre-filled with EA CFB 26 default alignment. Use team abbreviations (e.g., BAMA, OSU, UGA).</p>
                </div>
              </div>
            ) : null}
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
      <AIPromptModal isOpen={showAIPrompt} onClose={() => setShowAIPrompt(false)} title="Custom Conferences" prompt={aiPrompt} pasteTarget={`Cell A2 of the "${currentDynasty?.currentYear || new Date().getFullYear()}" tab`} />
    </div>,
    document.body,
  )
}
