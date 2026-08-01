import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty } from '../context/DynastyContext'
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
import SheetLoadingHint from './SheetLoadingHint'
import {
  createTeamStatsSheet,
  readTeamStatsFromSheet,
  parseTeamStatsLocal,
  deleteGoogleSheet,
  getSheetEmbedUrl,
  sheetExists
} from '../services/sheetsService'
import { buildAIPrompt } from '../utils/aiPrompt'
import LocalDataEntry from './ui/LocalDataEntry'
import { splitTsv } from '../utils/tsvParse'

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export default function TeamStatsModal({ isOpen, onClose, onSave, currentYear, teamName, teamColors, aggregatedStats = {} }) {
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
  // Local paste is the DEFAULT; the Google Sheet flow is the opt-in fallback.
  const [useLocal, setUseLocal] = useState(true)

  const [useEmbedded, setUseEmbedded] = useState(() => {
    // Load preference from localStorage
    return localStorage.getItem('sheetEmbedPreference') === 'true'
  })
  const [highlightSave, setHighlightSave] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  // Pre-fill the local grid with the team's EXISTING aggregated stats so the
  // modal opens ready to edit. parseTeamStatsLocal reads each row as
  // Section<TAB>StatLabel<TAB>Value and looks the label up in the fixed
  // OFFENSE/DEFENSE key maps — so we emit one self-describing row per stat, in
  // the same section+label order the AI prompt uses. Column order: [Section,
  // Stat, Value]. Blank (null/undefined) values are omitted (parser treats an
  // absent row the same as a blank value: leaves the key null).
  const initialTeamStatsText = useMemo(() => {
    const OFFENSE = [
      ['Points', 'pointsFor'],
      ['Offense Yards', 'totalOffense'],
      ['Yards Per Play', 'yardsPerPlay'],
      ['Passing Yards', 'passYards'],
      ['Passing Touchdowns', 'passTds'],
      ['Rushing Yards', 'rushYards'],
      ['Rushing Touchdowns', 'rushTds'],
      ['First Downs', 'firstDowns'],
    ]
    const DEFENSE = [
      ['Points Allowed', 'pointsAgainst'],
      ['Total Yards Allowed', 'defTotalYards'],
      ['Passing Yards Allowed', 'defPassYards'],
      ['Rushing Yards Allowed', 'defRushYards'],
      ['Sacks', 'defSacks'],
      ['Forced Fumbles', 'forcedFumbles'],
      ['Interceptions', 'defInterceptions'],
    ]
    const src = aggregatedStats || {}
    const lines = []
    const emit = (section, label, key) => {
      const v = src[key]
      if (v === undefined || v === null || v === '') return
      lines.push(`${section}\t${label}\t${v}`)
    }
    OFFENSE.forEach(([label, key]) => emit('OFFENSE', label, key))
    DEFENSE.forEach(([label, key]) => emit('DEFENSE', label, key))
    return lines.join('\n')
  }, [aggregatedStats])

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} ${teamName} Team Statistics`,
    multiBlock: true,
    structure: `This sheet has TWO tabs ("Offense" and "Defense"). Each tab has 2 columns.
Column A = stat name (pre-filled + PROTECTED). Column B = the value (empty, what you fill).

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. OUTPUT COLUMN B ONLY. Never output column A, headers, labels, or row numbers.
2. ROW ORDER IS FIXED. Values must match the pre-filled stat names below in the EXACT order given. One value per line.
3. NO COMMAS in numbers. Output "1234" — never "1,234".
4. DECIMALS use a period: "5.8". One decimal place where specified.
5. INTEGERS have no decimal point: "42" not "42.0".
6. BLANK LINE when unknown. Never guess. Blank ≠ zero.
7. ZERO only if the screenshot clearly shows zero.
8. No header row, no totals, no commentary INSIDE the data, no "N/A", no dashes.
9. TWO separate blocks — one per tab — each preceded by its "=== ... ===" section label above the fence.

═══════════════════════════════════════════════════════════
SECTION 1: "Offense" — 8 rows
═══════════════════════════════════════════════════════════
Output EXACTLY 8 lines, one value per line, in this row order:

Row | Column A (protected) | Your column B value                    | Format
----+----------------------+----------------------------------------+--------------------
  1 | Points               | Total points scored by this team       | integer
  2 | Offense Yards        | Total offensive yards                  | integer
  3 | Yards Per Play       | Yards per play                         | decimal, 1 place (e.g. 5.8)
  4 | Passing Yards        | Passing yards                          | integer
  5 | Passing Touchdowns   | Passing TDs                            | integer
  6 | Rushing Yards        | Rushing yards                          | integer
  7 | Rushing Touchdowns   | Rushing TDs                            | integer
  8 | First Downs          | First downs                            | integer

═══════════════════════════════════════════════════════════
SECTION 2: "Defense" — 7 rows
═══════════════════════════════════════════════════════════
Output EXACTLY 7 lines, one value per line, in this row order:

Row | Column A (protected)    | Your column B value                      | Format
----+-------------------------+------------------------------------------+----------
  1 | Points Allowed          | Points given up by this defense          | integer
  2 | Total Yards Allowed     | Total yards given up                     | integer
  3 | Passing Yards Allowed   | Passing yards given up                   | integer
  4 | Rushing Yards Allowed   | Rushing yards given up                   | integer
  5 | Sacks                   | Sacks made by this defense               | integer
  6 | Forced Fumbles          | Forced fumbles by this defense           | integer
  7 | Interceptions           | Interceptions by this defense            | integer

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== OFFENSE ===
<row 1 value>
<row 2 value>
<row 3 value>
<row 4 value>
<row 5 value>
<row 6 value>
<row 7 value>
<row 8 value>

=== DEFENSE ===
<row 1 value>
<row 2 value>
<row 3 value>
<row 4 value>
<row 5 value>
<row 6 value>
<row 7 value>

═══════════════════════════════════════════════════════════
FINAL CHECK before you send the answer
═══════════════════════════════════════════════════════════
[ ] Offense block = exactly 8 lines (not counting the "=== OFFENSE ===" label)
[ ] Defense block = exactly 7 lines
[ ] No commas in any number
[ ] No column A / stat names anywhere
[ ] No header row, no total row, no explanation text INSIDE the data blocks
[ ] Blank lines for unknowns — did not invent any values`,
  }), [currentYear, teamName])

  // LOCAL-PASTE prompt: self-describing rows. Each line LEADS with the section
  // (OFFENSE/DEFENSE) and the stat's exact label, so there is NO fixed row
  // order to preserve. parseTeamStatsLocal looks each stat up by label (not by
  // position), so the user can omit any stat they cannot see.
  const localAiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} ${teamName} Team Statistics`,
    structure: `Output ONE line per team stat you can see. Each line is SELF-DESCRIBING — it LEADS with the section (OFFENSE or DEFENSE) and the exact stat label — so there is NO fixed row order.

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. Each line has EXACTLY 3 tab-separated fields (2 tabs):
   Section<TAB>StatLabel<TAB>Value
2. NO header row. NO blank lines. NO commentary, totals, or labels INSIDE the data.
3. OMIT any stat you cannot see — do NOT pad, do NOT guess, do NOT invent a value. An omitted stat is simply left unset.
4. Line order does not matter (each line self-identifies with its section + label).

═══════════════════════════════════════════════════════════
FIELDS
═══════════════════════════════════════════════════════════
- Section — EXACTLY "OFFENSE" or "DEFENSE" (uppercase).
- StatLabel — must be EXACTLY one of the labels below, copied character-for-character (case-insensitive match, but use these spellings):
    OFFENSE labels:
      Points | Offense Yards | Yards Per Play | Passing Yards | Passing Touchdowns | Rushing Yards | Rushing Touchdowns | First Downs
    DEFENSE labels:
      Points Allowed | Total Yards Allowed | Passing Yards Allowed | Rushing Yards Allowed | Sacks | Forced Fumbles | Interceptions
- Value — the number for that stat. NO commas ("1234" not "1,234"). Integers have no decimal point. "Yards Per Play" is a decimal with one place (e.g. "5.8"); every other stat is an integer. Use 0 only if the screenshot clearly shows zero.

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== TEAM STATS ===
OFFENSE\\tPoints\\t<value>
OFFENSE\\tOffense Yards\\t<value>
…etc for every offense stat you can see…
DEFENSE\\tPoints Allowed\\t<value>
…etc for every defense stat you can see…

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] Every line has exactly 3 tab-separated fields (two tabs)
[ ] The 1st field is OFFENSE or DEFENSE; the 2nd field is one of the exact labels listed above
[ ] "Yards Per Play" is a one-decimal number; all other values are integers
[ ] No commas in any number
[ ] No blank lines, no header row, no commentary INSIDE the data — only stats you can actually see`,
  }), [currentYear, teamName])

  // Ref to prevent concurrent sheet creation (state updates are async, refs are immediate)
  const creatingSheetRef = useRef(false)
  // Single-attempt guard: a FAILED creation must not silently re-fire (the
  // runaway loop that spam-created sheets). One attempt per modal-open; an
  // explicit retry bumps auth.retryCount and re-arms exactly one more.
  const creationAttemptedRef = useRef(false)
  const lastRetryCountRef = useRef(auth.retryCount)

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
    // An explicit retry re-arms one fresh attempt by bumping auth.retryCount.
    if (auth.retryCount !== lastRetryCountRef.current) {
      lastRetryCountRef.current = auth.retryCount
      creationAttemptedRef.current = false
    }

    const createSheet = async () => {
      // Don't create a Google Sheet while the local paste path is active.
      if (isOpen && !useLocal && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote && !creationAttemptedRef.current) {
        // Mark attempted BEFORE any await so a rejection can't loop back in
        creationAttemptedRef.current = true
        // Set ref immediately to prevent concurrent calls (state updates are async)
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          const existingSheetId = currentDynasty?.teamStatsSheetId
          if (existingSheetId) {
            // Verify the stored sheet still lives in Drive. If the user (or
            // Drive retention, or a second browser) trashed it, the ID is
            // stale and would render a "file deleted" page. Clear and
            // fall through to create a fresh sheet.
            const stillExists = await sheetExists(existingSheetId)
            if (stillExists) {
              setSheetId(existingSheetId)
              return
            }
            await updateDynasty(currentDynasty.id, { teamStatsSheetId: null })
          }
          const sheetInfo = await createTeamStatsSheet(currentYear, teamName, aggregatedStats)
          setSheetId(sheetInfo.sheetId)
          await updateDynasty(currentDynasty.id, { teamStatsSheetId: sheetInfo.sheetId })
        } catch (error) {
          console.error('Failed to create team stats sheet:', error)
          if (!auth.handleError(error)) toast.error(auth.describeError(error, 'create the stats sheet'))
        } finally {
          setCreatingSheet(false)
          creatingSheetRef.current = false
        }
      }
    }
    createSheet()
  }, [isOpen, useLocal, user, sheetId, currentDynasty?.id, auth.retryCount, showDeletedNote])

  useEffect(() => {
    if (!isOpen) {
      setShowDeletedNote(false)
      creatingSheetRef.current = false
      creationAttemptedRef.current = false
      setUseLocal(true)
    }
  }, [isOpen])

  // Local paste import: the AI emits Section<TAB>StatLabel<TAB>Value rows.
  // parseTeamStatsLocal looks each stat up by label (not by position) and
  // returns the SAME flat { key: number|null } object the Google reader
  // returns, so the existing onSave (replaces teamStatsByYear[year]) applies
  // unchanged.
  const handleLocalImport = async (text) => {
    const stats = parseTeamStatsLocal(splitTsv(text))
    await onSave(stats)
    onClose()
  }

  const handleSyncFromSheet = async () => {
    if (!sheetId) return
    setSyncing(true)
    try {
      const stats = await readTeamStatsFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(stats)
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
      const stats = await readTeamStatsFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(stats)
      await deleteGoogleSheet(sheetId)
      await updateDynasty(currentDynasty.id, { teamStatsSheetId: null })
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
      await updateDynasty(currentDynasty.id, { teamStatsSheetId: null })
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
      title: 'Delete this team stats sheet?',
      message: 'This deletes the Google Sheet without applying any edits. Your dynasty team statistics stay as-is.',
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (!ok) return
    setDeletingSheet(true)
    try {
      await deleteGoogleSheet(sheetId)
      await updateDynasty(currentDynasty.id, { teamStatsSheetId: null })
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

  const handleClose = () => onClose()

  if (!isOpen) return null

  const embedUrl = sheetId ? getSheetEmbedUrl(sheetId, 'Team Stats') : null
  const isLoading = creatingSheet

  return createPortal(
    <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4" style={{ margin: 0 }} onMouseDown={handleClose}>
      <div className={`card-elevated w-full max-h-[calc(100dvh-4rem)] flex flex-col overflow-hidden ${
        useEmbedded
          ? 'sm:w-[95vw] sm:h-[95dvh]'
          : 'sm:max-w-[680px] sm:h-auto'
      }`} onMouseDown={(e) => e.stopPropagation()}>
        <SheetModalHeader eyebrow="Stats" title={`${currentYear} Team Statistics`} onClose={handleClose} />

        <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6">
        {useLocal && !showDeletedNote ? (
          <div className="flex-1 flex flex-col overflow-hidden gap-3">
            <div
              className="rounded-lg border border-surface-4 bg-surface-2 px-4 py-3 text-xs sm:text-sm text-txt-secondary"
              role="note"
            >
              <span className="text-txt-primary font-semibold">Skip this if you've been entering box scores game-by-game.</span>
              {' '}Team stats are aggregated from box scores. This is only for end-of-season catch-up if you skipped per-game entry.
            </div>
            <LocalDataEntry
              aiPrompt={localAiPrompt}
              onImport={handleLocalImport}
              onUseGoogle={() => setUseLocal(false)}
              onCancel={handleClose}
              importLabel="Import Team Stats"
              columns={['Section', 'Stat', 'Value']}
              initialText={initialTeamStatsText}
            />
          </div>
        ) : isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin w-12 h-12 border-4 rounded-full mx-auto mb-4" style={{ borderColor: 'var(--text-primary)', borderTopColor: 'transparent' }} />
              <p className="text-lg font-semibold text-txt-primary">Creating Team Stats Sheet...</p>
              <SheetLoadingHint active={isLoading} />
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="card p-8 text-center max-w-sm">
              <p className="label-xs text-txt-tertiary mb-2">Status</p>
              <p className="text-xl font-bold text-txt-primary mb-2">Saved &amp; Moved to Trash</p>
              <p className="text-sm text-txt-secondary">Team statistics saved.</p>
            </div>
          </div>
        ) : sheetId ? (
          <div className="flex-1 flex flex-col overflow-hidden gap-3">
            <div
              className="rounded-lg border border-surface-4 bg-surface-2 px-4 py-3 text-xs sm:text-sm text-txt-secondary"
              role="note"
            >
              <span className="text-txt-primary font-semibold">Skip this if you've been entering box scores game-by-game.</span>
              {' '}Team stats are aggregated from box scores. This sheet is only for end-of-season catch-up if you skipped per-game entry.
            </div>
            <SheetModalAIHero
              tagline="Skip the typing. Let AI fill the team stats."
              buttons={[{ label: 'Copy AI Prompt', prompt: aiPrompt }]}
            />
            {isMobile || !useEmbedded ? (
              <SheetManualEntry sheetId={sheetId} />
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden min-h-0 border border-surface-4 rounded-lg">
                <SheetToolbar sheetId={sheetId} embedUrl={embedUrl} teamColors={teamColors} title="Team Stats" />
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
