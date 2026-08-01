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
import { getAbbrFromTid, getTidFromAbbr, getTeamNameOptions, getTeamNameLabel, getTeamNameAliases } from '../data/teamRegistry'
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
import LocalDataEntry from './ui/LocalDataEntry'
import { splitTsv } from '../utils/tsvParse'

// The schedule is a fixed 16-week grid (Week 0 through Week 15), mirroring the
// Google Sheet's protected week column.
const WEEK_LABELS = Array.from({ length: 16 }, (_, i) => `Week ${i}`)

export default function ScheduleEntryModal({ isOpen, onClose, onSave, currentYear, teamColors, teamTid, teamName }) {
  const { currentDynasty, updateDynasty } = useDynasty()
  const modalColors = useMemo(() => getModalColors(teamColors), [teamColors])
  // Opponent typeahead: every schedulable team (incl. FCS) by NAME, plus "BYE".
  const opponentOptions = useMemo(
    () => [...getTeamNameOptions(currentDynasty?.teams, { includeFCS: true }), 'BYE'],
    [currentDynasty?.teams],
  )

  // Resolve team name for display - use provided teamName or fall back to dynasty team
  const displayTeamName = teamName || currentDynasty?.teamName || 'Dynasty'
  // Resolve team name for the sheet — must read from
  // dynasty.teams[tid] so a TeamBuilder takeover's CURRENT abbr is
  // returned, not the static FBS abbr that used to live in this slot.
  const targetTeamAbbr = teamTid
    ? getAbbrFromTid(currentDynasty?.teams, teamTid)
    : (currentDynasty?.teamName || '')
  // The user team as a NAME label (what the AI prompt + grid now show).
  const targetTeamName = (teamTid ? getTeamNameLabel(currentDynasty?.teams, teamTid) : null) || displayTeamName
  const { user } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const auth = useAuthErrorHandler()
  const [syncing, setSyncing] = useState(false)
  const [deletingSheet, setDeletingSheet] = useState(false)
  const [creatingSheet, setCreatingSheet] = useState(false)
  // Set when sheet creation fails for a non-auth reason. Stops the effect
  // from immediately re-trying (which presented as an endless spinner) and
  // surfaces a real error + manual "Try again" instead.
  const [createError, setCreateError] = useState(null)
  const [sheetId, setSheetId] = useState(null)
  const [showDeletedNote, setShowDeletedNote] = useState(false)
  // Local paste is the DEFAULT; the Google Sheet flow is the opt-in fallback.
  const [useLocal, setUseLocal] = useState(true)
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
    title: `${targetTeamName} ${currentYear} Schedule`,
    structure: `This sheet has ONE tab: "Schedule". It contains 16 rows, one per week for Week 0 through Week 15 of the ${currentYear} season for ${targetTeamName}. Conference championships are entered separately (they're not in the regular-season schedule).

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. OUTPUT COLUMNS C AND D ONLY (2 values per row). Columns A (Week) and B (User Team) are PROTECTED and pre-filled — never output them.
2. ROW ORDER IS FIXED: row 1 = Week 0, row 2 = Week 1, ..., row 16 = Week 15. Rows are keyed to the pre-filled Week number in column A — never reorder.
3. Output EXACTLY 16 data rows, each with EXACTLY 2 tab-separated values.
4. There are NO score columns. Do NOT output scores. This sheet is the pre-game schedule, not the results.
5. TEAM NAMES ONLY (column C) — use values from the TEAM NAMES list below, OR the literal word "BYE" for a bye week. Column C is a strict dropdown.
6. SITE (column D) must be EXACTLY one of these 3 literal values, case-sensitive: "Home", "Road", "Neutral". Do NOT use "Away" — the sheet's dropdown uses "Road" instead. Do NOT invent other values.
7. BYE WEEKS: If the user has a bye that week, put "BYE" in column C and leave column D BLANK.
8. BLANK CELLS if the matchup is unknown. Never guess, never use "N/A", "TBD", dash. Never leave column C blank if a game is scheduled — fill the opponent or "BYE".
9. Never change or output the User Team (column B is pre-filled with ${targetTeamName} on every row).
10. No header row, no Week numbers, no scores, no commentary or explanation INSIDE the data.
11. Output ONLY the fenced tsv block, nothing before or after it.

═══════════════════════════════════════════════════════════
SECTION: "Schedule" — 16 rows × 2 editable columns
═══════════════════════════════════════════════════════════

Row | Col A (PROTECTED) | Col B (PROTECTED)    | Col C (CPU Team)                             | Col D (Site)
----+-------------------+----------------------+----------------------------------------------+-----------------------------
  1 | 0                 | ${targetTeamName}    | opponent name, or "BYE", or blank if unknown | "Home" / "Road" / "Neutral" / blank
  2 | 1                 | ${targetTeamName}    | opponent name, or "BYE", or blank            | "Home" / "Road" / "Neutral" / blank
  3 | 2                 | ${targetTeamName}    | opponent name, or "BYE", or blank            | "Home" / "Road" / "Neutral" / blank
  4 | 3                 | ${targetTeamName}    | opponent name, or "BYE", or blank            | "Home" / "Road" / "Neutral" / blank
  5 | 4                 | ${targetTeamName}    | opponent name, or "BYE", or blank            | "Home" / "Road" / "Neutral" / blank
  6 | 5                 | ${targetTeamName}    | opponent name, or "BYE", or blank            | "Home" / "Road" / "Neutral" / blank
  7 | 6                 | ${targetTeamName}    | opponent name, or "BYE", or blank            | "Home" / "Road" / "Neutral" / blank
  8 | 7                 | ${targetTeamName}    | opponent name, or "BYE", or blank            | "Home" / "Road" / "Neutral" / blank
  9 | 8                 | ${targetTeamName}    | opponent name, or "BYE", or blank            | "Home" / "Road" / "Neutral" / blank
 10 | 9                 | ${targetTeamName}    | opponent name, or "BYE", or blank            | "Home" / "Road" / "Neutral" / blank
 11 | 10                | ${targetTeamName}    | opponent name, or "BYE", or blank            | "Home" / "Road" / "Neutral" / blank
 12 | 11                | ${targetTeamName}    | opponent name, or "BYE", or blank            | "Home" / "Road" / "Neutral" / blank
 13 | 12                | ${targetTeamName}    | opponent name, or "BYE", or blank            | "Home" / "Road" / "Neutral" / blank
 14 | 13                | ${targetTeamName}    | opponent name, or "BYE", or blank            | "Home" / "Road" / "Neutral" / blank
 15 | 14                | ${targetTeamName}    | opponent name, or "BYE", or blank            | "Home" / "Road" / "Neutral" / blank
 16 | 15                | ${targetTeamName}    | opponent name, or "BYE", or blank            | "Home" / "Road" / "Neutral" / blank

Column C (CPU Team) allowed values (strict dropdown — wrong value is rejected):
  - "BYE" — for a bye week (then leave column D blank)
  - Any team name from the TEAM NAMES list at the bottom of this prompt

Column D (Site) allowed values (strict dropdown — exactly these three, case-sensitive):
  - "Home"    — the user team hosts the game
  - "Road"    — the user team travels to the opponent  (NOT "Away")
  - "Neutral" — played at a neutral site

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== SCHEDULE — one row per week: <Week>\\t<CPU Team>\\t<Site> ===
0\\t<week 0 CPU Team>\\t<week 0 Site>
1\\t<week 1 CPU Team>\\t<week 1 Site>
2\\t<week 2 CPU Team>\\t<week 2 Site>
3\\t<week 3 CPU Team>\\t<week 3 Site>
4\\t<week 4 CPU Team>\\t<week 4 Site>
5\\t<week 5 CPU Team>\\t<week 5 Site>
6\\t<week 6 CPU Team>\\t<week 6 Site>
7\\t<week 7 CPU Team>\\t<week 7 Site>
8\\t<week 8 CPU Team>\\t<week 8 Site>
9\\t<week 9 CPU Team>\\t<week 9 Site>
10\\t<week 10 CPU Team>\\t<week 10 Site>
11\\t<week 11 CPU Team>\\t<week 11 Site>
12\\t<week 12 CPU Team>\\t<week 12 Site>
13\\t<week 13 CPU Team>\\t<week 13 Site>
14\\t<week 14 CPU Team>\\t<week 14 Site>
15\\t<week 15 CPU Team>\\t<week 15 Site>

(Each \\t above represents a LITERAL TAB character — use actual tab characters in your output, not the text "\\t".)

═══════════════════════════════════════════════════════════
FINAL CHECK before you send the answer
═══════════════════════════════════════════════════════════
[ ] Exactly 16 data rows (Weeks 0 through 15), each LEADING with its week number 0-15 in order
[ ] Exactly 3 tab-separated values per row (2 tab characters): Week number, then CPU Team, then Site
[ ] Field 2 (CPU Team): team name from the list, or the literal "BYE", or blank
[ ] Field 3 (Site): EXACTLY "Home", "Road", or "Neutral" — not "Away", not any other value; blank on bye weeks
[ ] No score columns, no user team column, no header row INSIDE the data
[ ] Blank CPU Team / Site only where the week's matchup is genuinely unknown — invented nothing`,
    includeTeamMap: true,
    dynastyTeams: currentDynasty?.teams,
  }), [currentYear, displayTeamName, targetTeamName, targetTeamAbbr, currentDynasty?.teams])

  // Pre-fill the local grid with the team's existing schedule so Edit
  // Schedule opens ready to edit instead of blank. The local parser
  // (readScheduleFromScheduleSheet) reads opponent at row[2] and site at
  // row[3]; handleLocalImport prepends [week, userTeamAbbr] by row index,
  // so the seeded grid columns are [Opponent, Site], ONE row per week
  // 0-15 in fixed order. location home/away/neutral maps back to the
  // dropdown labels Home/Road/Neutral; a bye seeds "BYE" with a blank
  // site — the same shapes the parser round-trips.
  const initialScheduleText = useMemo(() => {
    const existing = teamTid
      ? getScheduleForTeam(currentDynasty, teamTid, currentYear) || []
      : getCurrentSchedule(currentDynasty) || []
    const byWeek = new Map()
    for (const e of existing) {
      const wk = Number(e?.week)
      if (!Number.isFinite(wk) || wk < 0 || wk > 15) continue
      byWeek.set(wk, e)
    }
    const siteLabel = (loc) => {
      const l = String(loc || '').toLowerCase()
      if (l === 'home') return 'Home'
      if (l === 'away' || l === 'road') return 'Road'
      if (l === 'neutral') return 'Neutral'
      return ''
    }
    // Week-index-led rows (<week>\t<opponent>\t<site>) so LocalDataEntry's
    // fixed 16-row grid places each week correctly and no blank week collapses.
    const rows = []
    for (let wk = 0; wk <= 15; wk++) {
      const e = byWeek.get(wk)
      if (!e) { rows.push(`${wk}\t\t`); continue }
      const isBye = e.isBye || (!e.opponent && !e.opponentTid)
      if (isBye) { rows.push(`${wk}\tBYE\t`); continue }
      // Seed the opponent as a NAME label (matching the combobox options),
      // resolving from the stored tid; fall back to any stored opponent string.
      const oppTid = e.opponentTid != null ? e.opponentTid : getTidFromAbbr(e.opponent, currentDynasty)
      const opp = getTeamNameLabel(currentDynasty?.teams, oppTid) || (e.opponent || '')
      rows.push(`${wk}\t${opp}\t${siteLabel(e.location)}`)
    }
    return rows.join('\n')
  }, [currentDynasty, teamTid, currentYear])

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
      // Not signed in → show the auth modal immediately rather than
      // silently stalling on "Setting up sheet…" indefinitely. The
      // "Refresh Session" button in AuthErrorModal handles both
      // first-time Google sign-in and expired-token re-auth, so the
      // same recovery flow works for both cases.
      // Don't touch Google auth/creation while the local paste path is active.
      if (useLocal) return
      if (isOpen && !user && !sheetId && !creatingSheetRef.current && !showDeletedNote && !createError) {
        auth.setShowAuthError(true)
        return
      }
      // Don't create a new sheet if we just deleted one (showing success
      // message), or if a prior attempt failed (wait for manual retry —
      // otherwise the effect re-fires on every render and spins forever).
      if (isOpen && user && !sheetId && !creatingSheetRef.current && !showDeletedNote && !createError) {
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
            const myAbbr = getTeamNameLabel(teams, myTid) || teams[myTid]?.abbr || targetTeamName
            const yr = Number(currentYear)
            const synthesized = []
            for (const g of games) {
              if (!g || Number(g.year) !== yr) continue
              if (g.gameType && g.gameType !== 'regular') continue
              const t1 = Number(g.team1Tid)
              const t2 = Number(g.team2Tid)
              if (t1 !== myTid && t2 !== myTid) continue
              const oppTid = t1 === myTid ? t2 : t1
              const oppAbbr = getTeamNameLabel(teams, oppTid) || teams[oppTid]?.abbr || ''
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
          // Auth errors open the re-auth modal. Anything else (timeout,
          // 403 insufficient scope, quota, network) gets surfaced inline
          // with a retry instead of silently re-looping the creation.
          if (!auth.handleError(error)) {
            setCreateError(error?.message || 'Could not set up the sheet. Please try again.')
          }
        } finally {
          setCreatingSheet(false)
          creatingSheetRef.current = false
        }
      }
    }

    createSheet()
  }, [isOpen, useLocal, user, sheetId, createError, currentDynasty?.id, auth.retryCount, showDeletedNote, teamTid, currentYear, displayTeamName, targetTeamAbbr])

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShowDeletedNote(false)
      setCreateError(null)
      creatingSheetRef.current = false
      setUseLocal(true)
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

  // Local paste import: the AI emits 2 columns per week (CPU Team, Site) in the
  // FIXED order Week 0 → Week 15. Columns A (Week) and B (User Team) are
  // pre-filled on the sheet and never output. The parser reads week at row[0]
  // and the user team at row[1], so we prepend [weekNum, userTeamAbbr] by row
  // position. Rows are week-index-led (<week>\t<opponent>\t<site>) from the
  // fixed 16-row grid, so the WEEK comes from the row itself — never from the
  // surviving line index (a blank week no longer shifts every later week).
  const handleLocalImport = async (text) => {
    const raw = splitTsv(text)
    // Accept BOTH shapes so a paste "just works":
    //   • week-led  <week>\t<opponent>\t<site>   (what our AI prompt emits)
    //   • positional <opponent>\t<site>          (natural copy from the game —
    //     one row per week in order 0→15, BYE lines included, no week column)
    // Detect by the first column: if EVERY row leads with a 0–15 integer it's
    // week-led; otherwise treat each row's position as its week. Without this,
    // a positional paste slides the opponent into the site column and the week
    // falls back to the row index, so nothing but "0–15" lands.
    const weekLed = raw.length > 0 && raw.every((c) => {
      const first = String(c[0] ?? '').trim()
      return /^\d{1,2}$/.test(first) && Number(first) <= 15
    })
    const rows = weekLed
      ? raw.map((c) => [String(c[0] ?? ''), targetTeamAbbr, (c[1] ?? ''), (c[2] ?? '')])
      : raw.map((c, i) => [String(i), targetTeamAbbr, (c[0] ?? ''), (c[1] ?? '')])
    const schedule = await readScheduleFromScheduleSheet(null, currentDynasty?.teams || currentDynasty?.customTeams, { rows })
    await submitSchedule({ schedule })
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
        toast.error('Failed to delete the sheet. Try again.')
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
        <SheetModalHeader title={teamTid ? `${targetTeamName} ${currentYear}` : 'Schedule Entry'} onClose={handleClose} />

        <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6">
        {useLocal && !showDeletedNote ? (
          <LocalDataEntry
            aiPrompt={aiPrompt}
            onImport={handleLocalImport}
            onUseGoogle={() => setUseLocal(false)}
            onCancel={handleClose}
            importLabel="Import Schedule"
            initialText={initialScheduleText}
            columns={['Opponent', 'Site']}
            comboboxColumns={{ Opponent: opponentOptions }}
            comboboxAliases={getTeamNameAliases(currentDynasty?.teams)}
            columnOptions={{ Site: ['Home', 'Road', 'Neutral'] }}
            rowLabels={WEEK_LABELS}
            rowLabelHeader="Week"
          />
        ) : isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div
                className="animate-spin w-12 h-12 border-4 rounded-full mx-auto mb-4"
                style={{
                  borderColor: 'var(--text-primary)',
                  borderTopColor: 'transparent'
                }}
              />
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
          // open and initSheet completing — or a recovery state when
          // creation failed (auth modal, or an inline error + retry).
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-sm text-txt-secondary max-w-sm">
              {auth.showAuthError ? (
                'Refresh your session to continue.'
              ) : createError ? (
                <>
                  <p className="mb-3 text-txt-primary">{createError}</p>
                  <button
                    onClick={() => setCreateError(null)}
                    className="px-4 py-2 rounded-lg font-semibold"
                    style={{ backgroundColor: teamColors?.primary || 'var(--text-primary)', color: '#fff' }}
                  >
                    Try again
                  </button>
                </>
              ) : (
                'Setting up sheet…'
              )}
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
        firstTime={!user}
      />
    </div>,
    document.body,
  )
}
