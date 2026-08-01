import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import SheetModalHeader from './ui/SheetModalHeader'
import SheetModalAIHero from './ui/SheetModalAIHero'
import SheetModalFooter from './ui/SheetModalFooter'
import SheetManualEntry from './ui/SheetManualEntry'
import AuthErrorModal from './AuthErrorModal'
import { useAuthErrorHandler } from '../hooks/useAuthErrorHandler'
import SheetToolbar from './SheetToolbar'
import {
  createCFPSeedsSheet,
  readCFPSeedsFromSheet,
  deleteGoogleSheet,
  getSheetEmbedUrl
} from '../services/sheetsService'
import { DEFAULT_BOWL_CONFIG, CFP_NY6_BOWLS, SEED_DESCRIPTIONS } from '../data/cfpConstants'
import { buildAIPrompt } from '../utils/aiPrompt'
import SheetLoadingHint from './SheetLoadingHint'
import LocalDataEntry from './ui/LocalDataEntry'
import { splitTsv } from '../utils/tsvParse'
import { getAbbrFromTid, getTeamNameLabel } from '../data/teamRegistry'
import { getTeamNameOptions, getTeamNameAliases } from '../data/teamRegistry'

// Simple mobile detection
const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

// Config keys in order for UI - QF by seed (4, 1, 3, 2) then SF
const QF_KEYS = ['seed4', 'seed1', 'seed3', 'seed2']

export default function CFPSeedsModal({ isOpen, onClose, onSave, currentYear, teamColors }) {
  const { currentDynasty, updateDynasty } = useDynasty()
  const { user, signOut } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [syncing, setSyncing] = useState(false)
  const [deletingSheet, setDeletingSheet] = useState(false)
  const [creatingSheet, setCreatingSheet] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [sheetId, setSheetId] = useState(null)
  const [showDeletedNote, setShowDeletedNote] = useState(false)
  const auth = useAuthErrorHandler()
  const [isMobile, setIsMobile] = useState(false)
  const teamAbbrs = useMemo(() => getTeamNameOptions(currentDynasty?.teams, { includeFCS: false }), [currentDynasty?.teams])
  // Local paste is the DEFAULT; the Google Sheet flow is the opt-in fallback.
  const [useLocal, setUseLocal] = useState(true)
  const [bowlConfig, setBowlConfig] = useState(() => {
    // Initialize from existing dynasty config or defaults
    return currentDynasty?.cfpBowlConfigByYear?.[currentYear] || { ...DEFAULT_BOWL_CONFIG }
  })

  const [useEmbedded, setUseEmbedded] = useState(() => {
    // Load preference from localStorage
    return localStorage.getItem('sheetEmbedPreference') === 'true'
  })
  const [highlightSave, setHighlightSave] = useState(false)

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} CFP Seeds (1-12)`,
    structure: `This sheet has ONE tab: "CFP Seeds". It is a 12-row ranking of the College Football Playoff seeds 1 through 12.

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. OUTPUT COLUMN B ONLY. Column A (the seed number) is pre-filled and protected — never output it.
2. ROW ORDER IS FIXED: row 1 = #1 seed, row 2 = #2 seed, ..., row 12 = #12 seed. Do not reorder.
3. Output EXACTLY 12 lines. Not 11, not 13. One team per line.
4. TEAM NAMES ONLY — use the TEAM NAMES list below. Never output an abbreviation, nickname, mascot, or city.
5. The team column is a STRICT dropdown. Wrong spelling/casing/nickname will be rejected by the sheet.
6. BLANK LINE if the seed is unknown. Never guess, never use "N/A", "TBD", dash, or zero.
7. No header row, no seed numbers, no commentary or explanation INSIDE the data, no blank leading line before row 1.
8. No commas, no extra whitespace, no surrounding quotes.
9. ONE TSV block — output ONLY the fenced block, nothing before or after it.

═══════════════════════════════════════════════════════════
SECTION: "CFP Seeds" — 12 rows × 1 editable column
═══════════════════════════════════════════════════════════

Row | Column A (PROTECTED / pre-filled) | Your column B value    | Format / Allowed values
----+-----------------------------------+------------------------+-------------------------------------
  1 | 1                                 | #1 seed team name      | Exactly one value from the TEAM NAMES list below
  2 | 2                                 | #2 seed team name      | Exactly one value from the TEAM NAMES list below
  3 | 3                                 | #3 seed team name      | Exactly one value from the TEAM NAMES list below
  4 | 4                                 | #4 seed team name      | Exactly one value from the TEAM NAMES list below
  5 | 5                                 | #5 seed team name      | Exactly one value from the TEAM NAMES list below
  6 | 6                                 | #6 seed team name      | Exactly one value from the TEAM NAMES list below
  7 | 7                                 | #7 seed team name      | Exactly one value from the TEAM NAMES list below
  8 | 8                                 | #8 seed team name      | Exactly one value from the TEAM NAMES list below
  9 | 9                                 | #9 seed team name      | Exactly one value from the TEAM NAMES list below
 10 | 10                                | #10 seed team name     | Exactly one value from the TEAM NAMES list below
 11 | 11                                | #11 seed team name     | Exactly one value from the TEAM NAMES list below
 12 | 12                                | #12 seed team name     | Exactly one value from the TEAM NAMES list below

All 12 cells use the same strict dropdown of team names. The complete list of allowed team names is in the TEAM NAMES list at the bottom of this prompt — use ONLY those exact values.

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== CFP SEEDS ===
<#1 seed name>
<#2 seed name>
<#3 seed name>
<#4 seed name>
<#5 seed name>
<#6 seed name>
<#7 seed name>
<#8 seed name>
<#9 seed name>
<#10 seed name>
<#11 seed name>
<#12 seed name>

═══════════════════════════════════════════════════════════
FINAL CHECK before you send the answer
═══════════════════════════════════════════════════════════
[ ] Exactly 12 lines in the block (not counting the "=== CFP SEEDS ===" label)
[ ] Every value is a team name from the TEAM NAMES list — no abbreviations, no nicknames
[ ] No seed numbers, no column A, no header row in the output
[ ] Blank line for any seed I could not determine — I invented nothing
[ ] Team name matches the TEAM NAMES list exactly (e.g. "Alabama", "Miami (FL)")
[ ] No commas, no surrounding quotes, no trailing commentary INSIDE the data.`,
    includeTeamMap: true,
    dynastyTeams: currentDynasty?.teams,
  }), [currentYear, currentDynasty?.teams])

  // Pre-fill the local grid with the year's existing seeds so the user opens
  // ready to edit. Mirrors prefillCFPSeedsData: 12 fixed rows in seed order
  // (row i = seed i+1), each a single team-abbr cell. The local parser maps a
  // 1-cell line to [seedFromPosition, abbr], so round-tripping this unchanged
  // reproduces the same {seed, tid}. Saved format is tid-only ({seed, tid}), so
  // resolve tid → abbr via the dynasty teams map.
  const initialText = useMemo(() => {
    const existingSeeds = currentDynasty?.cfpSeedsByYear?.[currentYear]
      || currentDynasty?.cfpSeedsByYear?.[String(currentYear)]
      || []
    if (!existingSeeds.length) return ''
    const teams = currentDynasty?.teams || currentDynasty?.customTeams
    const bySeed = new Array(12).fill('')
    for (const entry of existingSeeds) {
      const seedNum = Number(entry?.seed)
      if (!(seedNum >= 1 && seedNum <= 12)) continue
      const abbr = entry?.tid != null ? (getTeamNameLabel(teams, entry.tid) || '') : (entry?.team || '')
      bySeed[seedNum - 1] = abbr || ''
    }
    // splitTsv drops blank lines, and the local import derives each seed from
    // ROW POSITION after that split — so an interior gap would shift every
    // later seed up by one. Only pre-fill when the filled seeds are contiguous
    // from #1 (the normal case: a saved bracket has all 12). Bail to a blank
    // grid on any interior gap so we never seed a misaligning round-trip.
    const lastFilled = bySeed.reduce((last, abbr, i) => (abbr ? i : last), -1)
    if (lastFilled < 0) return ''
    for (let i = 0; i <= lastFilled; i++) {
      if (!bySeed[i]) return ''
    }
    return bySeed.slice(0, lastFilled + 1).join('\n')
  }, [currentDynasty?.cfpSeedsByYear, currentDynasty?.teams, currentYear])

  // Ref to prevent concurrent sheet creation (state updates are async, refs are immediate)
  const creatingSheetRef = useRef(false)
  const creationAttemptedRef = useRef(false)
  const lastRetryCountRef = useRef(auth.retryCount)

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

  // Create fresh CFP seeds sheet when modal opens (always new, pre-filled with existing data)
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
          // Get existing seeds data to pre-fill
          const existingSeeds = currentDynasty?.cfpSeedsByYear?.[currentYear] || []

          const sheetInfo = await createCFPSeedsSheet(
            currentDynasty?.teamName || 'Dynasty',
            currentYear,
            existingSeeds,
            currentDynasty?.teams || currentDynasty?.customTeams
          )
          setSheetId(sheetInfo.spreadsheetId)
        } catch (error) {
          console.error('Failed to create CFP seeds sheet:', error)
          if (!auth.handleError(error)) {
            toast.error('Failed to create the CFP seeds sheet. Try again or contact support.')
          }
        } finally {
          setCreatingSheet(false)
          creatingSheetRef.current = false
        }
      }
    }

    createSheet()
  }, [isOpen, useLocal, user, sheetId, currentDynasty?.id, currentYear, auth.retryCount, showDeletedNote])

  // Reset state when modal closes - clear sheetId so fresh sheet is created next time
  useEffect(() => {
    if (!isOpen) {
      setSheetId(null)
      setShowDeletedNote(false)
      creatingSheetRef.current = false
      creationAttemptedRef.current = false
      setUseLocal(true)
    }
  }, [isOpen])

  // Reset bowl config when modal opens or year changes
  useEffect(() => {
    if (isOpen) {
      setBowlConfig(currentDynasty?.cfpBowlConfigByYear?.[currentYear] || { ...DEFAULT_BOWL_CONFIG })
    }
  }, [isOpen, currentYear, currentDynasty?.cfpBowlConfigByYear])

  // Local paste import: feed the parser the SAME [seed, abbr] rows the sheet
  // produces. The AI reply lists teams in seed order (the seed column is
  // normally pre-filled on the sheet), so a 1-cell line gets its seed from
  // position. Mirrors FinalPolls' rank-prepend normalization.
  const handleLocalImport = async (text) => {
    const lines = splitTsv(text)
    const rows = lines.map((cells, i) => (cells.length >= 2 ? cells : [String(i + 1), (cells[0] ?? '')]))
    const seeds = await readCFPSeedsFromSheet(null, (currentDynasty?.teams || currentDynasty?.customTeams), { rows })
    await onSave(seeds, bowlConfig)
    onClose()
  }

  const handleSyncFromSheet = async () => {
    if (!sheetId) return

    setSyncing(true)
    try {
      const seeds = await readCFPSeedsFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(seeds, bowlConfig)
      onClose()
    } catch (error) {
      console.error(error)
      if (!auth.handleError(error)) {
        toast.error('Failed to sync from Google Sheets. Make sure all 12 seeds are entered.')
      }
    } finally {
      setSyncing(false)
    }
  }

  const handleSyncAndDelete = async () => {
    if (!sheetId) return

    setDeletingSheet(true)
    try {
      const seeds = await readCFPSeedsFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(seeds, bowlConfig)

      // Move sheet to trash (keep sheet ID stored so user can restore if needed)
      await deleteGoogleSheet(sheetId)

      setSheetId(null)
      setShowDeletedNote(true)
      setTimeout(() => {
        onClose()
      }, 2500)
    } catch (error) {
      console.error(error)
      if (!auth.handleError(error)) {
        toast.error('Failed to sync from Google Sheets.')
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
      title: 'Delete this CFP Seeds sheet?',
      message: 'This deletes the Google Sheet without applying any edits. Your dynasty CFP seeds stay as-is.',
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (!ok) return
    setDeletingSheet(true)
    try {
      await deleteGoogleSheet(sheetId)
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

  const embedUrl = sheetId ? getSheetEmbedUrl(sheetId, 'CFP Seeds') : null
  const isLoading = creatingSheet

  // Bowl Game Assignments — shared by the local-paste and Google-Sheet
  // branches. bowlConfig is part of every save (onSave(seeds, bowlConfig)),
  // so the user must be able to set it regardless of the entry path.
  const bowlConfigSection = (
    <div className="p-3 rounded-lg border flex-shrink-0 bg-surface-2 border-surface-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-bold uppercase text-txt-primary" style={{ letterSpacing: '1.5px' }}>
          Bowl Game Assignments
        </h4>
        <span className="text-[10px] uppercase tracking-wider text-txt-tertiary">
          NY6 rotates yearly
        </span>
      </div>

      {/* Quarterfinals */}
      <p className="text-[10px] font-bold uppercase mb-1.5 text-txt-tertiary" style={{ letterSpacing: '1px' }}>Quarterfinals</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mb-2.5">
        {QF_KEYS.map(key => (
          <div key={key}>
            <label className="text-[10px] block mb-0.5 text-txt-tertiary">
              {SEED_DESCRIPTIONS[key]}
            </label>
            <select
              value={bowlConfig[key] || DEFAULT_BOWL_CONFIG[key]}
              onChange={(e) => setBowlConfig(prev => ({ ...prev, [key]: e.target.value }))}
              className="w-full px-1.5 py-1 rounded text-xs border bg-surface-3 border-surface-4 text-txt-primary"
            >
              {CFP_NY6_BOWLS.map(bowl => (
                <option key={bowl} value={bowl}>{bowl}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {/* Semifinal bowl assignments are prompted at Bowl Week 3 — the
          EA CFB game does not show semifinal bowl hosts during Week 1. */}
      <p className="text-[10px] mt-1 italic" style={{ color: 'var(--text-secondary)' }}>
        Semifinal bowl hosts entered at Bowl Week 3.
      </p>

      {/* Validation warning if same bowl assigned to multiple slots */}
      {(() => {
        const bowls = Object.values(bowlConfig).filter(Boolean)
        const hasDuplicates = bowls.length !== new Set(bowls).size
        return hasDuplicates ? (
          <p className="text-[11px] mt-1.5 text-red-400 font-medium">
            Each bowl should only be assigned to one game
          </p>
        ) : null
      })()}
    </div>
  )

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] p-3 sm:p-4"
      style={{ margin: 0 }}
      onMouseDown={handleClose}
    >
      <div
        className={`card-elevated w-full max-h-[calc(100dvh-1.5rem)] flex flex-col overflow-hidden ${
          useEmbedded
            ? 'sm:w-[95vw] sm:h-[95dvh]'
            : 'sm:max-w-[680px] sm:h-auto'
        }`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <SheetModalHeader eyebrow="College Football Playoff" title={`${currentYear} CFP Seeds`} onClose={handleClose} />

        <div className="flex-1 flex flex-col overflow-hidden p-3 sm:p-5 min-h-0">
        {useLocal && !showDeletedNote ? (
          <div className="flex-1 flex flex-col overflow-hidden min-h-0 gap-3">
            {bowlConfigSection}
            <LocalDataEntry
              aiPrompt={aiPrompt}
              columns={['Team']}
              comboboxColumns={{ 'Team': teamAbbrs }}
              comboboxAliases={getTeamNameAliases(currentDynasty?.teams)}
              initialText={initialText}
              onImport={handleLocalImport}
              onUseGoogle={() => setUseLocal(false)}
              onCancel={handleClose}
              importLabel="Import CFP Seeds"
            />
          </div>
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
          <div className="flex-1 flex flex-col overflow-hidden min-h-0 gap-3">
            {/* Bowl Configuration Section — pinned at top. Neutral
                surface colors only — keep the chrome consistent with the
                rest of the sheet-modal family instead of letting the
                user's team primary/secondary leak into this admin
                control. */}
            {bowlConfigSection}

            <SheetModalAIHero
              tagline="Skip the typing. Let AI fill the CFP seeds."
              buttons={[{ label: 'Copy AI Prompt', prompt: aiPrompt }]}
            />

            {isMobile || !useEmbedded ? (
              <SheetManualEntry sheetId={sheetId} />
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden min-h-0 border border-surface-4 rounded-lg">
                <SheetToolbar
                  sheetId={sheetId}
                  embedUrl={embedUrl}
                  teamColors={teamColors}
                  title="CFP Seeds Google Sheet"
                />
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
    document.body
  )
}
