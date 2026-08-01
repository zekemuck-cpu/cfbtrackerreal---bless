import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import AuthErrorModal from './AuthErrorModal'
import { useAuthErrorHandler } from '../hooks/useAuthErrorHandler'
import SheetToolbar from './SheetToolbar'
import SheetEntryPanel from './ui/SheetEntryPanel'
import SheetManualEntry from './ui/SheetManualEntry'
import SheetModalHeader from './ui/SheetModalHeader'
import SheetModalAIHero from './ui/SheetModalAIHero'
import SheetModalFooter from './ui/SheetModalFooter'
import {
  createAllAmericansOnlySheet,
  readAllAmericansOnlyFromSheet,
  deleteGoogleSheet,
  getSheetEmbedUrl,
  sheetExists
} from '../services/sheetsService'
import { getModalColors } from '../utils/colorUtils'
import { buildAIPrompt } from '../utils/aiPrompt'
import SheetLoadingHint from './SheetLoadingHint'
import LocalDataEntry from './ui/LocalDataEntry'
import { splitTsv } from '../utils/tsvParse'
import { getTeamNameOptions, getTeamNameAliases } from '../data/teamRegistry'

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export default function AllAmericansModal({ isOpen, onClose, onSave, currentYear, teamColors }) {
  const { currentDynasty, updateDynasty } = useDynasty()
  const { user, signOut } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const modalColors = useMemo(() => getModalColors(teamColors), [teamColors])
  const teamAbbrs = useMemo(() => getTeamNameOptions(currentDynasty?.teams, { includeFCS: false }), [currentDynasty?.teams])
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

  // The 25 fixed All-Americans position rows, in sheet order (row 4 → row 28).
  // Mirrors ALL_AMERICAN_POSITIONS in sheetsService.js.
  const AA_POSITIONS = [
    'QB', 'HB', 'HB', 'WR', 'WR', 'WR', 'TE',
    'LT', 'LG', 'C', 'RG', 'RT',
    'LEDG', 'REDG', 'DT', 'DT',
    'SAM', 'MIKE', 'WILL',
    'CB', 'CB', 'FS', 'SS',
    'K', 'P',
  ]

  // Pre-fill the local grid with this year's EXISTING All-Americans so the modal
  // opens ready to edit. handleLocalImport prepends 3 empty header rows and the
  // parser reads rows[3 + i] for the 25 position rows, taking each 12-field line
  // as: Position, FirstPlayer, FirstTeam, FirstClass, Position, SecondPlayer,
  // SecondTeam, SecondClass, Position, FreshPlayer, FreshTeam, FreshClass. We
  // build exactly 25 lines (one per position slot), filling the position value
  // in fields 0/4/8 of EVERY row — this mirrors createAllAmericansOnlySheet's
  // pre-fill AND guarantees no line is fully blank (so splitTsv, which drops
  // blank lines, can't collapse the fixed 25-row layout and misalign import).
  // Multi-slot positions (HB×2, WR×3, DT×2, CB×2) consume existing entries in
  // order via a per-position used-index, exactly like the Google pre-fill.
  const initialAllAmericansText = useMemo(() => {
    const yearData = currentDynasty?.allAmericansByYear?.[currentYear] || {}
    const aaFirst = {}
    const aaSecond = {}
    const aaFreshman = {}
    if (yearData.allAmericans) {
      yearData.allAmericans.forEach(entry => {
        const pos = entry.position
        if (entry.designation === 'first') (aaFirst[pos] = aaFirst[pos] || []).push(entry)
        else if (entry.designation === 'second') (aaSecond[pos] = aaSecond[pos] || []).push(entry)
        else if (entry.designation === 'freshman') (aaFreshman[pos] = aaFreshman[pos] || []).push(entry)
      })
    }
    const usedFirst = {}
    const usedSecond = {}
    const usedFreshman = {}
    return AA_POSITIONS.map(pos => {
      const firstEntries = aaFirst[pos] || []
      const secondEntries = aaSecond[pos] || []
      const freshmanEntries = aaFreshman[pos] || []
      if (usedFirst[pos] === undefined) usedFirst[pos] = 0
      if (usedSecond[pos] === undefined) usedSecond[pos] = 0
      if (usedFreshman[pos] === undefined) usedFreshman[pos] = 0
      const first = firstEntries[usedFirst[pos]] ? firstEntries[usedFirst[pos]++] : null
      const second = secondEntries[usedSecond[pos]] ? secondEntries[usedSecond[pos]++] : null
      const freshman = freshmanEntries[usedFreshman[pos]] ? freshmanEntries[usedFreshman[pos]++] : null
      return [
        pos, first?.player || '', first?.school || '', first?.class || '',
        pos, second?.player || '', second?.school || '', second?.class || '',
        pos, freshman?.player || '', freshman?.school || '', freshman?.class || '',
      ].join('\t')
    }).join('\n')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDynasty?.allAmericansByYear, currentYear])

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} All-Americans`,
    structure: `This sheet has ONE tab per season year. Use the "${currentYear}" tab (current year).
Each tab is 28 rows × 12 columns organized as three side-by-side team blocks (First-Team, Second-Team, Freshman Team). Each block is 4 columns wide: Position | Player | Team | Class.

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. Each data line has EXACTLY 12 tab-separated fields (11 tabs per line), in this order:
   Position | First Player | First Team | First Class | Position | Second Player | Second Team | Second Class | Position | Freshman Player | Freshman Team | Freshman Class
2. The Position value is REPEATED in the 1st, 5th, and 9th fields of every line — same value all three times (the sheet has three Position columns, one per team block).
3. Row order is FIXED by the 25 positions below — output exactly 25 data lines in that exact order.
4. Do NOT output rows 1-3 (title row, team-label row, column-header row) — they are pre-filled and some are merged.
5. NO COMMAS anywhere. No commentary, totals, or extra columns. No "N/A", no dashes.
6. BLANK field for unknown (empty between tabs). Never guess. Never invent players.
7. Use ONLY the literal dropdown values listed below for Position, Team, and Class — wrong spelling = dropdown rejects it.
8. Team values must be team names from the list at the bottom of this prompt — NEVER an abbreviation, nickname, or city.
9. ONE TSV block, 25 lines, 12 tab-separated fields each.

═══════════════════════════════════════════════════════════
SECTION: "${currentYear}" — 25 data rows × 12 fields
═══════════════════════════════════════════════════════════

WHY INCLUDE POSITIONS IN ALL THREE SLOTS: each line has three side-by-side team blocks (First-Team, Second-Team, Freshman Team), and repeating the Position value in the 1st, 5th, and 9th fields keeps the three blocks aligned. If you drop the position fields and output only 9 fields, the middle and right blocks shift left and the data is CORRUPT.

Position by row (repeat the same value in the 1st, 5th, 9th fields of that line):
  Row 4  → QB
  Row 5  → HB
  Row 6  → HB
  Row 7  → WR
  Row 8  → WR
  Row 9  → WR
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

HB appears twice (rows 5-6), WR three times (rows 7-9), DT twice (rows 18-19), CB twice (rows 23-24). Use different players in each slot for the same team-group (First/Second/Freshman) — do not repeat a name within those doubled-up rows.

Per-line output (12 tab-separated fields):
<Position>\\t<First Player>\\t<First Team>\\t<First Class>\\t<Position>\\t<Second Player>\\t<Second Team>\\t<Second Class>\\t<Position>\\t<Freshman Player>\\t<Freshman Team>\\t<Freshman Class>

Field formats:
- Position (appears 3 times per line — 1st, 5th, 9th fields) — must be EXACTLY one of, case-sensitive:
    QB | HB | FB | WR | TE | LT | LG | C | RG | RT | LEDG | REDG | DT | SAM | MIKE | WILL | CB | FS | SS | K | P
  Use the position that matches the row from the list above. The same value goes in all three Position slots on that line.
- Player (3 slots per row: First, Second, Freshman) — full name string, blank if unknown. A Freshman-team player must actually be a freshman (Fr or RS Fr).
- Team (3 slots per row — strict dropdown) — team name from the list at the bottom (e.g. Alabama, Ohio State, Georgia, Texas). NEVER an abbreviation, nickname, or mascot.
- Class (3 slots per row — strict dropdown) — must be EXACTLY one of:
    Fr | RS Fr | So | RS So | Jr | RS Jr | Sr | RS Sr
  Note the literal space in "RS Fr"/"RS So"/"RS Jr"/"RS Sr". No "Freshman", "Sophomore", "FR", "SO", "R-Fr", "RSFr".

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== ALL-AMERICANS ===
<25 lines × 12 tab-separated fields, positions as listed above>

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] Exactly 25 lines in the block, one per position (order: QB, HB, HB, WR, WR, WR, TE, LT, LG, C, RG, RT, LEDG, REDG, DT, DT, SAM, MIKE, WILL, CB, CB, FS, SS, K, P)
[ ] Every line has exactly 12 tab-separated fields (11 tabs per line)
[ ] The 1st, 5th, and 9th fields on every line are the SAME position value from the row list
[ ] All Team values are uppercase names from the list — no full names
[ ] All Class values are from the exact list: Fr, RS Fr, So, RS So, Jr, RS Jr, Sr, RS Sr
[ ] All Freshman-team Class values are Fr or RS Fr (no Sophomores or above in Freshman slot)
[ ] Blank fields for unknowns — nothing was invented
[ ] No commas, no header rows, no commentary INSIDE the data.`,
    includeTeamMap: true,
    dynastyTeams: currentDynasty?.teams,
  }), [currentYear, currentDynasty?.teams])

  // Ref to prevent concurrent sheet creation (state updates are async, refs are immediate)
  const creatingSheetRef = useRef(false)
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
    if (auth.retryCount !== lastRetryCountRef.current) {
      lastRetryCountRef.current = auth.retryCount
      creationAttemptedRef.current = false
    }

    const createSheet = async () => {
      // Don't create a Google Sheet while the local paste path is active.
      if (isOpen && !useLocal && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote && !creationAttemptedRef.current) {
        // Set ref immediately to prevent concurrent calls (state updates are async)
        creationAttemptedRef.current = true
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          // Existing-sheet Drive lookup must live INSIDE the try: an expired
          // Google token throws here, and outside the try the rejection escaped,
          // leaving an empty modal with no re-auth prompt.
          const existingSheetId = currentDynasty?.allAmericansSheetIdByYear?.[currentYear]
          if (existingSheetId) {
            const stillExists = await sheetExists(existingSheetId)
            if (stillExists) {
              setSheetId(existingSheetId)
              return
            }
            await updateDynasty(currentDynasty.id, {
              allAmericansSheetIdByYear: { ...(currentDynasty.allAmericansSheetIdByYear || {}), [currentYear]: null }
            })
            // stale sheet (trashed in Drive); fall through to regenerate
          }
          // Pass allAmericansByYear for pre-filling past years
          const allAmericansByYear = currentDynasty?.allAmericansByYear || {}
          const sheetInfo = await createAllAmericansOnlySheet(currentYear, allAmericansByYear, currentDynasty?.teams || currentDynasty?.customTeams)
          setSheetId(sheetInfo.spreadsheetId)
          const existingByYear = currentDynasty?.allAmericansSheetIdByYear || {}
          await updateDynasty(currentDynasty.id, {
            allAmericansSheetIdByYear: { ...existingByYear, [currentYear]: sheetInfo.spreadsheetId }
          })
        } catch (error) {
          console.error('Failed to create all-americans sheet:', error)
          auth.handleError(error)
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

  // Local paste import: the AI reply pastes at A4 (no header rows) and emits 25
  // data lines of 12 tab-separated fields, positions included in fields 1/5/9.
  // The parser reads rows[3 + i], so prepend 3 empty header rows to align the
  // data to indices 3–27 — the same shape the Sheets API A1:L28 read returns.
  const handleLocalImport = async (text) => {
    const rows = [[], [], [], ...splitTsv(text)]
    const data = await readAllAmericansOnlyFromSheet(null, currentYear, (currentDynasty?.teams || currentDynasty?.customTeams), { rows })
    await onSave(data)
    onClose()
  }

  const handleSyncFromSheet = async () => {
    if (!sheetId) return
    setSyncing(true)
    try {
      // Read from the current year tab
      const data = await readAllAmericansOnlyFromSheet(sheetId, currentYear, (currentDynasty?.teams || currentDynasty?.customTeams))
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
      // Read from the current year tab
      const data = await readAllAmericansOnlyFromSheet(sheetId, currentYear, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(data)
      // Move sheet to trash (keep sheet ID stored so user can restore if needed)
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
      const existingByYear = currentDynasty?.allAmericansSheetIdByYear || {}
      await updateDynasty(currentDynasty.id, {
        allAmericansSheetIdByYear: { ...existingByYear, [currentYear]: null }
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
      title: 'Delete this All-Americans sheet?',
      message: 'This deletes the Google Sheet without applying any edits. Your dynasty All-Americans selections stay as-is.',
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (!ok) return
    setDeletingSheet(true)
    try {
      await deleteGoogleSheet(sheetId)
      const existingByYear = currentDynasty?.allAmericansSheetIdByYear || {}
      await updateDynasty(currentDynasty.id, {
        allAmericansSheetIdByYear: { ...existingByYear, [currentYear]: null }
      })
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

  const embedUrl = sheetId ? getSheetEmbedUrl(sheetId, `${currentYear}`) : null
  const isLoading = creatingSheet

  return createPortal(
    <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4" style={{ margin: 0 }} onMouseDown={handleClose}>
      <div className={`card-elevated w-full max-h-[calc(100dvh-4rem)] flex flex-col overflow-hidden ${
        useEmbedded
          ? 'sm:w-[95vw] sm:h-[95dvh]'
          : 'sm:max-w-[680px] sm:h-auto'
      }`} onMouseDown={(e) => e.stopPropagation()}>
        <SheetModalHeader eyebrow="Postseason" title={`${currentYear} All-Americans`} onClose={handleClose} />

        <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6">
        {useLocal && !showDeletedNote ? (
          <LocalDataEntry
            aiPrompt={aiPrompt}
            columns={['Position', 'First Player', 'First Team', 'First Class', 'Position', 'Second Player', 'Second Team', 'Second Class', 'Position', 'Freshman Player', 'Freshman Team', 'Freshman Class']}
            comboboxColumns={{ 'First Team': teamAbbrs, 'Second Team': teamAbbrs, 'Freshman Team': teamAbbrs }}
            comboboxAliases={getTeamNameAliases(currentDynasty?.teams)}
            initialText={initialAllAmericansText}
            onImport={handleLocalImport}
            onUseGoogle={() => setUseLocal(false)}
            onCancel={handleClose}
            importLabel="Import All-Americans"
          />
        ) : isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin w-12 h-12 border-4 rounded-full mx-auto mb-4" style={{ borderColor: 'var(--text-primary)', borderTopColor: 'transparent' }} />
              <p className="text-lg font-semibold text-txt-primary">Creating All-Americans Sheet...</p>
              <SheetLoadingHint active={isLoading} />
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="card p-8 text-center max-w-sm">
              <p className="label-xs text-txt-tertiary mb-2">Status</p>
              <p className="text-xl font-bold text-txt-primary mb-2">Saved &amp; Moved to Trash</p>
              <p className="text-sm text-txt-secondary">All-Americans selections saved.</p>
            </div>
          </div>
        ) : sheetId ? (
          <div className="flex-1 flex flex-col overflow-hidden gap-3">
            <SheetModalAIHero
              tagline="Skip the typing. Let AI fill the All-Americans roster."
              buttons={[{ label: 'Copy AI Prompt', prompt: aiPrompt }]}
            />
            {isMobile || !useEmbedded ? (
              <SheetManualEntry sheetId={sheetId} />
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden min-h-0 border border-surface-4 rounded-lg">
                <SheetToolbar sheetId={sheetId} embedUrl={embedUrl} teamColors={teamColors} title="All-Americans" />
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
