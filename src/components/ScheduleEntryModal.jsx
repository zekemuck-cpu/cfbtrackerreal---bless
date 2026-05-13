import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import SheetToolbar from './SheetToolbar'
import AuthErrorModal from './AuthErrorModal'
import { useAuthErrorHandler } from '../hooks/useAuthErrorHandler'
import {
  createScheduleSheet,
  readScheduleFromScheduleSheet,
  deleteGoogleSheet,
  getSingleSheetEmbedUrl
} from '../services/sheetsService'
import { useDynasty, getCurrentSchedule, getScheduleForTeam, computeScheduleDiff } from '../context/DynastyContext'
import { getAbbrFromTid, getTidFromAbbr } from '../data/teamRegistry'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import SheetModalHeader from './ui/SheetModalHeader'
import SheetModalAIHero from './ui/SheetModalAIHero'
import SheetManualEntry from './ui/SheetManualEntry'
import SheetModalFooter from './ui/SheetModalFooter'
import { getModalColors } from '../utils/colorUtils'
import { buildAIPrompt } from '../utils/aiPrompt'
import SheetLoadingHint from './SheetLoadingHint'
import ScheduleSaveConfirmModal from './ScheduleSaveConfirmModal'

export default function ScheduleEntryModal({ isOpen, onClose, onSave, currentYear, teamColors, teamTid, teamName }) {
  const { currentDynasty, updateDynasty } = useDynasty()
  const modalColors = useMemo(() => getModalColors(teamColors), [teamColors])

  // Resolve team name for display - use provided teamName or fall back to dynasty team
  const displayTeamName = teamName || currentDynasty?.teamName || 'Dynasty'
  // Resolve team abbreviation for the sheet — must read from
  // dynasty.teams[tid] so a TeamBuilder takeover's CURRENT abbr is
  // returned, not the static FBS abbr that used to live in this slot.
  const targetTeamAbbr = teamTid
    ? getAbbrFromTid(currentDynasty?.teams, teamTid)
    : (currentDynasty?.teamName || '')
  const { user } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const auth = useAuthErrorHandler()
  const [syncing, setSyncing] = useState(false)
  const [deletingSheet, setDeletingSheet] = useState(false)
  const [creatingSheet, setCreatingSheet] = useState(false)
  const [sheetId, setSheetId] = useState(null)
  const [showDeletedNote, setShowDeletedNote] = useState(false)
  const [useEmbedded, setUseEmbedded] = useState(() => {
    // Load preference from localStorage
    return localStorage.getItem('sheetEmbedPreference') === 'true'
  })
  const [highlightSave, setHighlightSave] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  // Pending save kept around while the confirmation modal is open. The
  // ref-style shape lets a single modal handle both sync-only and
  // sync-and-delete flows.
  const [pendingSave, setPendingSave] = useState(null)

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
10. No header row, no Week numbers, no scores, no commentary or explanation INSIDE the data. The paste-target label above the fence is required (see Method A/B rules above).
11. ONE TSV block — preceded by the paste-target label line as required by the Method A/B rules above.

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
[ ] No score columns, no week numbers, no user team column, no header row INSIDE the data (the paste-target label above the fence is required, see Method A/B rules above)
[ ] Blank cells only where the week's matchup is genuinely unknown — invented nothing`,
    includeTeamMap: true,
    dynastyTeams: currentDynasty?.teams,
  }), [currentYear, displayTeamName, targetTeamAbbr, currentDynasty?.teams])

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

  // Create schedule sheet when modal opens - always create fresh
  useEffect(() => {
    const createSheet = async () => {
      // Don't create a new sheet if we just deleted one (showing success message)
      if (isOpen && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote) {
        // Set ref immediately to prevent concurrent calls (state updates are async)
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          // Get existing schedule to pre-fill the sheet.
          // Use team-specific schedule if teamTid is provided, otherwise
          // use current team's schedule.
          let existingSchedule = teamTid
            ? getScheduleForTeam(currentDynasty, teamTid, currentYear) || []
            : getCurrentSchedule(currentDynasty) || []

          // For non-user teams (e.g. opening Auburn's "Edit Schedule"
          // when the user coaches Kentucky), no schedule was ever saved
          // — but the dynasty likely already has Auburn's games via
          // weekly-scores entries. Synthesize a schedule from the
          // games array so the sheet opens with what we already know,
          // not blanks.
          if ((!existingSchedule || existingSchedule.length === 0) && teamTid) {
            const games = currentDynasty?.games || []
            const teams = currentDynasty?.teams || {}
            const myTid = Number(teamTid)
            const myAbbr = teams[myTid]?.abbr || targetTeamAbbr
            const yr = Number(currentYear)
            const synthesized = []
            for (const g of games) {
              if (!g || Number(g.year) !== yr) continue
              if (g.gameType && g.gameType !== 'regular') continue
              const t1 = Number(g.team1Tid)
              const t2 = Number(g.team2Tid)
              if (t1 !== myTid && t2 !== myTid) continue
              const oppTid = t1 === myTid ? t2 : t1
              const oppAbbr = teams[oppTid]?.abbr || ''
              if (!oppAbbr) continue
              const homeT = g.homeTeamTid == null ? null : Number(g.homeTeamTid)
              let location = 'neutral'
              if (homeT === myTid) location = 'home'
              else if (homeT === oppTid) location = 'away'
              synthesized.push({
                week: Number(g.week),
                userTeam: myAbbr,
                opponent: oppAbbr,
                location,
              })
            }
            // Dedup by week — prefer the entry with a defined opponent
            // and most recent (last write wins is fine here).
            const byWeek = new Map()
            synthesized.forEach(e => byWeek.set(Number(e.week), e))
            existingSchedule = Array.from(byWeek.values()).sort((a, b) => a.week - b.week)
          }

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
          auth.handleError(error)
        } finally {
          setCreatingSheet(false)
          creatingSheetRef.current = false
        }
      }
    }

    createSheet()
  }, [isOpen, user, sheetId, creatingSheet, currentDynasty?.id, auth.retryCount, showDeletedNote, teamTid, currentYear, displayTeamName, targetTeamAbbr])

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

  // Resolve the tid/year used for the diff. Mirrors the logic inside
  // saveSchedule so the user sees exactly what saveSchedule will write.
  const resolveTargetTid = () => {
    if (teamTid) return teamTid
    if (currentDynasty?.currentTid) return currentDynasty.currentTid
    const userAbbr = currentDynasty?.teamName
    return userAbbr ? getTidFromAbbr(userAbbr, currentDynasty) : null
  }

  // Common save path: read schedule → compute diff → maybe show confirm
  // modal → call onSave + post-save side effect.
  // The CALLER is responsible for closing the modal after a successful
  // safe-path save (so flows like "Save & Move to Trash" can defer close
  // for a "Sheet deleted" toast).
  //
  //   onSafeDone: () => void   // ran after onSave + postSave succeed when
  //                            //   no confirm was needed
  //   onConfirmedDone: same, but ran when the user confirmed in the modal
  //   postSave: () => Promise  // optional side effect after onSave (e.g.
  //                            //   delete the Google Sheet)
  //   finallyFn: () => void    // always ran (success, fail, cancel)
  const submitSchedule = async ({ schedule, postSave, onSafeDone, onConfirmedDone, finallyFn }) => {
    const targetTid = resolveTargetTid()
    let diff = null
    try {
      if (targetTid) {
        diff = computeScheduleDiff(currentDynasty, schedule, targetTid, currentYear)
      }
    } catch (e) {
      console.warn('computeScheduleDiff failed; saving without preview', e)
      diff = null
    }

    const empty = diff && diff.toAdd.length === 0 && diff.toUpdate.length === 0 && diff.toRemove.length === 0
    if (diff && empty) {
      toast.info('No schedule changes to save.')
      if (finallyFn) finallyFn()
      onClose()
      return
    }

    const needsConfirm = diff && (diff.toUpdate.length > 0 || diff.toRemove.length > 0)
    if (needsConfirm) {
      setPendingSave({ schedule, diff, postSave, onConfirmedDone, finallyFn })
      return
    }

    // Safe path: only adds (or unknown — fall through to save).
    try {
      await onSave(schedule)
      if (typeof postSave === 'function') await postSave()
      if (typeof onSafeDone === 'function') onSafeDone()
      else onClose()
    } catch (error) {
      toast.error('Failed to save schedule.')
      console.error(error)
    } finally {
      if (finallyFn) finallyFn()
    }
  }

  const handleConfirmSave = async () => {
    if (!pendingSave) return
    const { schedule, postSave, onConfirmedDone, finallyFn } = pendingSave
    setPendingSave(null)
    try {
      await onSave(schedule)
      if (typeof postSave === 'function') await postSave()
      if (typeof onConfirmedDone === 'function') onConfirmedDone()
      else onClose()
    } catch (error) {
      toast.error('Failed to save schedule.')
      console.error(error)
    } finally {
      if (finallyFn) finallyFn()
    }
  }

  const handleCancelConfirm = () => {
    const { finallyFn } = pendingSave || {}
    setPendingSave(null)
    if (finallyFn) finallyFn()
  }

  const handleSyncFromSheet = async () => {
    if (!sheetId) return

    setSyncing(true)
    try {
      const schedule = await readScheduleFromScheduleSheet(sheetId, currentDynasty?.teams || currentDynasty?.customTeams)
      await submitSchedule({
        schedule,
        finallyFn: () => setSyncing(false),
      })
    } catch (error) {
      toast.error('Failed to sync from Google Sheets. Make sure data is properly formatted.')
      console.error(error)
      setSyncing(false)
    }
  }

  const handleSyncAndDelete = async () => {
    if (!sheetId) return

    setDeletingSheet(true)
    // Defer onClose until after the "sheet deleted" note has been visible
    const finishWithDeletedNote = () => {
      setSheetId(null)
      setShowDeletedNote(true)
      setTimeout(() => onClose(), 2500)
    }

    try {
      const schedule = await readScheduleFromScheduleSheet(sheetId, currentDynasty?.teams || currentDynasty?.customTeams)
      await submitSchedule({
        schedule,
        postSave: async () => {
          await deleteGoogleSheet(sheetId)
          await updateDynasty(currentDynasty.id, { scheduleSheetId: null })
        },
        onSafeDone: finishWithDeletedNote,
        onConfirmedDone: finishWithDeletedNote,
        finallyFn: () => setDeletingSheet(false),
      })
    } catch (error) {
      console.error('Failed to sync/move to trash:', error)
      toast.error(`Failed to sync/move to trash: ${error.message || 'Unknown error'}`)
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
      title: 'Delete this schedule sheet?',
      message: 'This deletes the Google Sheet without applying any edits. Your dynasty schedule stays as-is.',
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (!ok) return
    setDeletingSheet(true)
    try {
      await deleteGoogleSheet(sheetId)
      await updateDynasty(currentDynasty.id, { scheduleSheetId: null })
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

  const embedUrl = sheetId ? getSingleSheetEmbedUrl(sheetId) : null
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
        <SheetModalHeader eyebrow="Schedule" title={teamTid ? `${displayTeamName} · ${currentYear}` : 'Schedule Entry'} onClose={handleClose} />

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
                Creating Schedule Sheet...
              </p>
              <p className="text-sm mt-2 text-txt-secondary">
                Setting up regular-season schedule (Weeks 0–15)
              </p>
              <SheetLoadingHint active={isLoading} />
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="card p-8 border-l-[3px] text-center max-w-sm" style={{ borderLeftColor: 'var(--surface-5)' }}>
              <p className="label-xs text-txt-tertiary mb-2">Status</p>
              <p className="text-xl font-bold text-txt-primary mb-2">Saved &amp; Moved to Trash</p>
              <p className="text-sm text-txt-secondary">Schedule saved to your dynasty.</p>
            </div>
          </div>
        ) : sheetId ? (
          <div className="flex-1 flex flex-col overflow-hidden gap-3">
            <SheetModalAIHero
              tagline="Skip the typing. Let AI fill the schedule."
              buttons={[{ label: 'Copy AI Prompt', prompt: aiPrompt }]}
            />
            {useEmbedded ? (
              <div className="flex-1 flex flex-col overflow-hidden min-h-0 border border-surface-4 rounded-lg">
                <SheetToolbar
                  sheetId={sheetId}
                  embedUrl={embedUrl}
                  teamColors={teamColors}
                  title="Schedule Google Sheet"
                />
              </div>
            ) : (
              <SheetManualEntry sheetId={sheetId} />
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
              showEmbeddedToggle
              useEmbedded={useEmbedded}
              onToggleEmbedded={() => { const newValue = !useEmbedded; setUseEmbedded(newValue); localStorage.setItem('sheetEmbedPreference', newValue.toString()); }}
            />
          </div>
        ) : (
          // Fallback placeholder for the brief moment between modal
          // open and initSheet completing — or when initSheet failed
          // and AuthErrorModal is up to handle the recovery action.
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-sm text-txt-secondary">
              {auth.showAuthError ? 'Refresh your session to continue.' : 'Setting up sheet…'}
            </div>
          </div>
        )}
        </div>
      </div>

      <ScheduleSaveConfirmModal
        isOpen={!!pendingSave}
        diff={pendingSave?.diff}
        primaryColor={teamColors?.primary}
        onClose={handleCancelConfirm}
        onConfirm={handleConfirmSave}
      />

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
