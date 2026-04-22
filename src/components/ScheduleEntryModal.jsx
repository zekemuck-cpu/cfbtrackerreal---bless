import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import AIPromptModal from './AIPromptModal'
import SheetToolbar, { SheetErrorBanner } from './SheetToolbar'
import {
  createScheduleSheet,
  readScheduleFromScheduleSheet,
  deleteGoogleSheet,
  getSingleSheetEmbedUrl
} from '../services/sheetsService'
import { useDynasty, getCurrentSchedule, getScheduleForTeam } from '../context/DynastyContext'
import { getAbbrFromTid } from '../data/teamRegistry'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import { getModalColors, getContrastTextColor } from '../utils/colorUtils'
import { buildAIPrompt } from '../utils/aiPrompt'
import SheetLoadingHint from './SheetLoadingHint'

export default function ScheduleEntryModal({ isOpen, onClose, onSave, currentYear, teamColors, teamTid, teamName }) {
  const { currentDynasty, updateDynasty } = useDynasty()
  const modalColors = useMemo(() => getModalColors(teamColors), [teamColors])

  // Resolve team name for display - use provided teamName or fall back to dynasty team
  const displayTeamName = teamName || currentDynasty?.teamName || 'Dynasty'
  // Resolve team abbreviation for the sheet
  const targetTeamAbbr = teamTid ? getAbbrFromTid(teamTid) : (currentDynasty?.teamName || '')
  const { user, signOut, refreshSession } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [refreshing, setRefreshing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [deletingSheet, setDeletingSheet] = useState(false)
  const [creatingSheet, setCreatingSheet] = useState(false)
  const [sheetId, setSheetId] = useState(null)
  const [showDeletedNote, setShowDeletedNote] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [useEmbedded, setUseEmbedded] = useState(() => {
    // Load preference from localStorage
    return localStorage.getItem('sheetEmbedPreference') === 'true'
  })
  const [showSessionError, setShowSessionError] = useState(false)
  const [highlightSave, setHighlightSave] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [showAIPrompt, setShowAIPrompt] = useState(false)

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `${displayTeamName} ${currentYear} Schedule`,
    structure: `This sheet has ONE tab: "Schedule". It contains 16 rows, one per week for Week 0 through Week 15 of the ${currentYear} season for ${displayTeamName}.

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. OUTPUT COLUMNS C AND D ONLY (2 values per row). Columns A (Week) and B (User Team) are PROTECTED and pre-filled — never output them.
2. ROW ORDER IS FIXED: row 1 = Week 0, row 2 = Week 1, ..., row 16 = Week 15. Rows are keyed to the pre-filled Week number in column A — never reorder.
3. Output EXACTLY 16 data rows, each with EXACTLY 2 tab-separated values.
4. There are NO score columns. Do NOT output scores. This sheet is the pre-game schedule, not the results.
5. TEAM ABBREVIATIONS ONLY (column C) — use values from the TEAM ABBREVIATIONS mapping below, OR the literal word "BYE" for a bye week. Column C is a strict dropdown.
6. SITE (column D) must be EXACTLY one of these 3 literal values, case-sensitive: "Home", "Road", "Neutral". Do NOT use "Away" — the sheet's dropdown uses "Road" instead. Do NOT invent other values.
7. BYE WEEKS: If the user has a bye that week, put "BYE" in column C and leave column D BLANK.
8. BLANK CELLS if the matchup is unknown. Never guess, never use "N/A", "TBD", dash. Never leave column C blank if a game is scheduled — fill the opponent or "BYE".
9. Never change or output the User Team (column B is pre-filled with ${targetTeamAbbr} on every row).
10. No header row, no Week numbers, no scores, no commentary, no explanation.
11. SINGLE TSV block labeled by tab name and paste cell.

═══════════════════════════════════════════════════════════
TAB: "Schedule" — 16 rows × 2 editable columns
Paste your block at cell C2 of the "Schedule" tab
═══════════════════════════════════════════════════════════

Row | Col A (PROTECTED) | Col B (PROTECTED)    | Col C (CPU Team)                             | Col D (Site)
----+-------------------+----------------------+----------------------------------------------+-----------------------------
  1 | 0                 | ${targetTeamAbbr}    | opponent abbr, or "BYE", or blank if unknown | "Home" / "Road" / "Neutral" / blank
  2 | 1                 | ${targetTeamAbbr}    | opponent abbr, or "BYE", or blank            | "Home" / "Road" / "Neutral" / blank
  3 | 2                 | ${targetTeamAbbr}    | opponent abbr, or "BYE", or blank            | "Home" / "Road" / "Neutral" / blank
  4 | 3                 | ${targetTeamAbbr}    | opponent abbr, or "BYE", or blank            | "Home" / "Road" / "Neutral" / blank
  5 | 4                 | ${targetTeamAbbr}    | opponent abbr, or "BYE", or blank            | "Home" / "Road" / "Neutral" / blank
  6 | 5                 | ${targetTeamAbbr}    | opponent abbr, or "BYE", or blank            | "Home" / "Road" / "Neutral" / blank
  7 | 6                 | ${targetTeamAbbr}    | opponent abbr, or "BYE", or blank            | "Home" / "Road" / "Neutral" / blank
  8 | 7                 | ${targetTeamAbbr}    | opponent abbr, or "BYE", or blank            | "Home" / "Road" / "Neutral" / blank
  9 | 8                 | ${targetTeamAbbr}    | opponent abbr, or "BYE", or blank            | "Home" / "Road" / "Neutral" / blank
 10 | 9                 | ${targetTeamAbbr}    | opponent abbr, or "BYE", or blank            | "Home" / "Road" / "Neutral" / blank
 11 | 10                | ${targetTeamAbbr}    | opponent abbr, or "BYE", or blank            | "Home" / "Road" / "Neutral" / blank
 12 | 11                | ${targetTeamAbbr}    | opponent abbr, or "BYE", or blank            | "Home" / "Road" / "Neutral" / blank
 13 | 12                | ${targetTeamAbbr}    | opponent abbr, or "BYE", or blank            | "Home" / "Road" / "Neutral" / blank
 14 | 13                | ${targetTeamAbbr}    | opponent abbr, or "BYE", or blank            | "Home" / "Road" / "Neutral" / blank
 15 | 14                | ${targetTeamAbbr}    | opponent abbr, or "BYE", or blank            | "Home" / "Road" / "Neutral" / blank
 16 | 15                | ${targetTeamAbbr}    | opponent abbr, or "BYE", or blank            | "Home" / "Road" / "Neutral" / blank

Column C (CPU Team) allowed values (strict dropdown — wrong value is rejected):
  - "BYE" — for a bye week (then leave column D blank)
  - Any team abbreviation from the TEAM ABBREVIATIONS mapping at the bottom of this prompt

Column D (Site) allowed values (strict dropdown — exactly these three, case-sensitive):
  - "Home"    — the user team hosts the game
  - "Road"    — the user team travels to the opponent  (NOT "Away")
  - "Neutral" — played at a neutral site

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== SCHEDULE — paste at cell C2 of "Schedule" tab ===
<week 0 CPU Team>\\t<week 0 Site>
<week 1 CPU Team>\\t<week 1 Site>
<week 2 CPU Team>\\t<week 2 Site>
<week 3 CPU Team>\\t<week 3 Site>
<week 4 CPU Team>\\t<week 4 Site>
<week 5 CPU Team>\\t<week 5 Site>
<week 6 CPU Team>\\t<week 6 Site>
<week 7 CPU Team>\\t<week 7 Site>
<week 8 CPU Team>\\t<week 8 Site>
<week 9 CPU Team>\\t<week 9 Site>
<week 10 CPU Team>\\t<week 10 Site>
<week 11 CPU Team>\\t<week 11 Site>
<week 12 CPU Team>\\t<week 12 Site>
<week 13 CPU Team>\\t<week 13 Site>
<week 14 CPU Team>\\t<week 14 Site>
<week 15 CPU Team>\\t<week 15 Site>

(Each \\t above represents a LITERAL TAB character — use actual tab characters in your output, not the text "\\t".)

═══════════════════════════════════════════════════════════
FINAL CHECK before you send the answer
═══════════════════════════════════════════════════════════
[ ] Exactly 16 data rows (Weeks 0 through 15)
[ ] Exactly 2 tab-separated values per row (1 tab character per line)
[ ] Column C: team abbreviation from the mapping, or the literal "BYE", or blank
[ ] Column D: EXACTLY "Home", "Road", or "Neutral" — not "Away", not any other value; blank on bye weeks
[ ] No score columns, no week numbers, no user team column, no header row in the output
[ ] Blank cells only where the week's matchup is genuinely unknown — invented nothing`,
    includeTeamMap: true,
  }), [currentYear, displayTeamName, targetTeamAbbr])

  // Ref to prevent concurrent sheet creation (state updates are async, refs are immediate)
  const creatingSheetRef = useRef(false)

  // Highlight save button when user returns to the window (after editing in Google Sheets)
  useEffect(() => {
    if (!isOpen || !sheetId || useEmbedded) return

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setHighlightSave(true)
        // Remove highlight after 5 seconds
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

  // Create schedule sheet when modal opens - always create fresh
  useEffect(() => {
    const createSheet = async () => {
      // Don't create a new sheet if we just deleted one (showing success message)
      if (isOpen && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote) {
        // Set ref immediately to prevent concurrent calls (state updates are async)
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          // Get existing schedule to pre-fill the sheet
          // Use team-specific schedule if teamTid is provided, otherwise use current team's schedule
          const existingSchedule = teamTid
            ? getScheduleForTeam(currentDynasty, teamTid, currentYear) || []
            : getCurrentSchedule(currentDynasty) || []

          // Always create a fresh sheet, but pre-fill with existing data if available
          const sheetInfo = await createScheduleSheet(
            displayTeamName,
            currentYear,
            targetTeamAbbr,
            existingSchedule,
            currentDynasty?.teams || currentDynasty?.customTeams
          )
          setSheetId(sheetInfo.spreadsheetId)

          // Save sheet ID to dynasty
          await updateDynasty(currentDynasty.id, {
            scheduleSheetId: sheetInfo.spreadsheetId
          })
        } catch (error) {
          console.error('Failed to create schedule sheet:', error)
        } finally {
          setCreatingSheet(false)
          creatingSheetRef.current = false
        }
      }
    }

    createSheet()
  }, [isOpen, user, sheetId, creatingSheet, currentDynasty?.id, retryCount, showDeletedNote, teamTid, currentYear, displayTeamName, targetTeamAbbr])

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShowDeletedNote(false)
      creatingSheetRef.current = false
    }
  }, [isOpen])

  const handleSave = async (schedule) => {
    try {
      await onSave(schedule)
      onClose()
    } catch (error) {
      toast.error('Failed to save schedule.')
      console.error(error)
    }
  }

  const handleSyncFromSheet = async () => {
    if (!sheetId) return

    setSyncing(true)
    try {
      const schedule = await readScheduleFromScheduleSheet(sheetId)
      await onSave(schedule)
      onClose()
    } catch (error) {
      toast.error('Failed to sync from Google Sheets. Make sure data is properly formatted.')
      console.error(error)
    } finally {
      setSyncing(false)
    }
  }

  const handleSyncAndDelete = async () => {
    if (!sheetId) return

    setDeletingSheet(true)
    try {
      const schedule = await readScheduleFromScheduleSheet(sheetId)
      await onSave(schedule)

      await deleteGoogleSheet(sheetId)
      await updateDynasty(currentDynasty.id, { scheduleSheetId: null })

      setSheetId(null)
      setShowDeletedNote(true)
      setTimeout(() => {
        onClose()
      }, 2500)
    } catch (error) {
      console.error('Failed to sync/move to trash:', error)
      toast.error(`Failed to sync/move to trash: ${error.message || 'Unknown error'}`)
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
      // Delete the current sheet
      await deleteGoogleSheet(sheetId)

      // Clear sheet ID from dynasty
      await updateDynasty(currentDynasty.id, {
        scheduleSheetId: null
      })

      // Reset local state to trigger new sheet creation
      setSheetId(null)
      setRetryCount(c => c + 1)
    } catch (error) {
      console.error('Failed to regenerate sheet:', error)
      if (error.message?.includes('OAuth') || error.message?.includes('access token')) {
        setShowSessionError(true)
      } else {
        toast.error('Failed to regenerate sheet. Please try again.')
      }
    } finally {
      setRegenerating(false)
    }
  }

  const handleClose = () => {
    onClose()
  }

  if (!isOpen) return null

  const embedUrl = sheetId ? getSingleSheetEmbedUrl(sheetId) : null
  const isLoading = creatingSheet

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-60 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4"
      style={{ margin: 0 }}
      onMouseDown={handleClose}
    >
      <div
        className="card-elevated w-full sm:w-[95vw] max-h-[calc(100dvh-4rem)] sm:h-[95dvh] flex flex-col overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="h-[3px] w-full" style={{ backgroundColor: teamColors.primary }} aria-hidden="true" />
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-surface-4">
          <h2 className="text-2xl font-bold text-txt-primary">
            {teamTid ? `${displayTeamName} ${currentYear} Schedule` : 'Schedule Entry'}
          </h2>
          <button aria-label="Close"
            onClick={handleClose}
            className="text-txt-tertiary hover:text-txt-primary transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div
                className="animate-spin w-12 h-12 border-4 rounded-full mx-auto mb-4"
                style={{
                  borderColor: teamColors.primary,
                  borderTopColor: 'transparent'
                }}
              />
              <p className="text-lg font-semibold text-txt-primary">
                Creating Schedule Sheet...
              </p>
              <p className="text-sm mt-2 text-txt-secondary">
                Setting up 12-game schedule
              </p>
              <SheetLoadingHint active={isLoading} />
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="card p-8 border-l-[3px] text-center max-w-sm" style={{ borderLeftColor: teamColors.primary }}>
              <p className="label-xs text-txt-tertiary mb-2">Status</p>
              <p className="text-xl font-bold text-txt-primary mb-2">Saved &amp; Moved to Trash</p>
              <p className="text-sm text-txt-secondary">Schedule saved to your dynasty.</p>
            </div>
          </div>
        ) : sheetId ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Action Buttons - only show at top for embedded view */}
            {useEmbedded && (
              <div className="mb-3">
                <div className="flex gap-2 sm:gap-3 flex-wrap items-center">
                  <button
                    onClick={handleSyncAndDelete}
                    disabled={syncing || deletingSheet}
                    className={`px-3 sm:px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-all text-xs sm:text-sm ${highlightSave ? 'animate-pulse ring-4 ring-offset-2 scale-105' : ''}`}
                    style={{
                      backgroundColor: teamColors.primary,
                      color: getContrastTextColor(teamColors.primary)
                    }}
                  >
                    {deletingSheet ? 'Saving...' : 'Save & Move to Trash'}
                  </button>
                  <button
                    onClick={handleSyncFromSheet}
                    disabled={syncing || deletingSheet}
                    className="btn btn-secondary text-xs sm:text-sm"
                  >
                    {syncing ? 'Syncing...' : 'Save & Keep Sheet'}
                  </button>
                  <button
                    onClick={() => setShowAIPrompt(true)}
                    className="px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent"
                  >
                    AI Prompt
                  </button>
                  <button
                    onClick={handleRegenerateSheet}
                    disabled={syncing || deletingSheet || regenerating}
                    className="px-3 sm:px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-colors text-xs sm:text-sm border-2 ml-auto"
                    style={{
                      backgroundColor: 'transparent',
                      borderColor: '#EF4444',
                      color: '#EF4444'
                    }}
                  >
                    {regenerating ? 'Regenerating...' : 'Regenerate sheet'}
                  </button>
                  {highlightSave && (
                    <span className="text-xs font-medium animate-bounce" style={{ color: modalColors.accent }}>

                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Toggle between embedded and new tab */}
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

            {/* Session Error Banner */}
            {showSessionError && (
              <SheetErrorBanner
                teamColors={teamColors}
                onReload={() => {
                  setShowSessionError(false)
                  setRetryCount(c => c + 1)
                }}
                onOpenNewTab={() => window.open(`https://docs.google.com/spreadsheets/d/${sheetId}/edit`, '_blank')}
                onRefreshSession={async () => {
                  const success = await refreshSession()
                  if (success) {
                    setShowSessionError(false)
                    setRetryCount(c => c + 1)
                  }
                }}
              />
            )}

            {useEmbedded ? (
              /* Embedded iframe view with toolbar */
              <>
                <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                  <SheetToolbar
                    sheetId={sheetId}
                    embedUrl={embedUrl}
                    teamColors={teamColors}
                    title="Schedule Google Sheet"
                    onSessionError={() => setShowSessionError(true)}
                  />
                </div>

                <div className="text-xs mt-2 space-y-1 text-txt-tertiary">
                  <p><strong className="text-txt-primary">Columns:</strong> Week | User Team | CPU Team | Site</p>
                  <p>Enter your 12-game regular season schedule. Select opponents and Home/Road/Neutral for each game.</p>
                </div>
              </>
            ) : (
              /* Open in new tab view */
              <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                <h3 className="label-xs text-txt-tertiary mb-2">Data Entry</h3>
                <p className="text-2xl font-bold text-txt-primary mb-6">Edit in Google Sheets</p>

                <div className="text-left mb-6 max-w-sm w-full card p-4 border-l-[3px]" style={{ borderLeftColor: teamColors.primary }}>
                  <p className="label-xs text-txt-tertiary mb-3">Instructions</p>
                  <ol className="text-sm space-y-2 text-txt-secondary">
                    <li className="flex gap-3">
                      <span className="font-bold text-txt-primary tabular-nums">1.</span>
                      <span>Click the button below to open Google Sheets in a new tab</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="font-bold text-txt-primary tabular-nums">2.</span>
                      <span>Enter your 12-game schedule (Week, User Team, CPU Team, Site)</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="font-bold text-txt-primary tabular-nums">3.</span>
                      <span>Return to this tab when done</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="font-bold text-txt-primary tabular-nums">4.</span>
                      <span>Click "Save" below to sync your schedule</span>
                    </li>
                  </ol>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3 mb-6">
                  <a
                    href={`https://docs.google.com/spreadsheets/d/${sheetId}/edit`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-8 py-4 rounded-lg font-bold text-lg hover:opacity-90 transition-colors flex items-center gap-3"
                    style={{
                      backgroundColor: '#0F9D58',
                      color: '#FFFFFF'
                    }}
                  >
                    <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/>
                      <path d="M7 7h2v2H7zm0 4h2v2H7zm0 4h2v2H7zm4-8h6v2h-6zm0 4h6v2h-6zm0 4h6v2h-6z"/>
                    </svg>
                    Open Google Sheets
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                  <button
                    onClick={() => setShowAIPrompt(true)}
                    className="px-4 py-2 rounded-lg text-sm font-medium border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent"
                  >
                    AI Prompt
                  </button>
                </div>

                {/* Centered Save Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 items-center justify-center mb-6">
                  <button
                    onClick={handleSyncAndDelete}
                    disabled={syncing || deletingSheet}
                    className={`px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-all text-sm ${highlightSave ? 'animate-pulse ring-4 ring-offset-2 scale-105' : ''}`}
                    style={{
                      backgroundColor: teamColors.primary,
                      color: getContrastTextColor(teamColors.primary)
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
                {/* Start Over Button */}
                <button
                  onClick={handleRegenerateSheet}
                  disabled={syncing || deletingSheet || regenerating}
                  className="text-xs px-4 py-2 rounded-lg font-medium hover:opacity-90 transition-colors border mb-4"
                  style={{
                    backgroundColor: 'transparent',
                    borderColor: '#EF4444',
                    color: '#EF4444'
                  }}
                >
                  {regenerating ? 'Regenerating...' : 'Messed up? Regenerate sheet'}
                </button>
                {highlightSave && (
                  <span className="text-sm font-medium animate-bounce mb-4" style={{ color: modalColors.accent }}>

                  </span>
                )}

                <div className="text-xs p-3 rounded-lg max-w-sm bg-surface-3 text-txt-tertiary">
                  <p className="font-semibold mb-1 text-txt-primary">Columns to fill:</p>
                  <p>Week | User Team | CPU Team | Site (Home/Road/Neutral)</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-lg mb-4 text-txt-primary">
                Your session has expired. Click below to refresh.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={async () => {
                    setRefreshing(true)
                    try {
                      const success = await refreshSession()
                      if (success) {
                        setRetryCount(c => c + 1)
                      }
                    } catch (e) {
                      console.error('Refresh failed:', e)
                    }
                    setRefreshing(false)
                  }}
                  disabled={refreshing}
                  className="px-4 py-2 rounded font-semibold transition-colors"
                  style={{
                    backgroundColor: teamColors.primary,
                    color: getContrastTextColor(teamColors.primary),
                    opacity: refreshing ? 0.7 : 1
                  }}
                >
                  {refreshing ? 'Refreshing...' : 'Refresh Session'}
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>

      <AIPromptModal
        isOpen={showAIPrompt}
        onClose={() => setShowAIPrompt(false)}
        title={`${displayTeamName} ${currentYear} Schedule`}
        prompt={aiPrompt}
      />
    </div>,
    document.body,
  )
}
