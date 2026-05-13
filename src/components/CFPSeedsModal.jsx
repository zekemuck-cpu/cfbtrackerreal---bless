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
import AIPromptModal from './AIPromptModal'
import SheetToolbar from './SheetToolbar'
import {
  createCFPSeedsSheet,
  readCFPSeedsFromSheet,
  deleteGoogleSheet,
  getSheetEmbedUrl
} from '../services/sheetsService'
import { DEFAULT_BOWL_CONFIG, CFP_NY6_BOWLS, SEED_DESCRIPTIONS } from '../data/cfpConstants'
import { getModalColors } from '../utils/colorUtils'
import { buildAIPrompt } from '../utils/aiPrompt'
import SheetLoadingHint from './SheetLoadingHint'

// Simple mobile detection
const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

// Config keys in order for UI - QF by seed (4, 1, 3, 2) then SF
const QF_KEYS = ['seed4', 'seed1', 'seed3', 'seed2']

export default function CFPSeedsModal({ isOpen, onClose, onSave, currentYear, teamColors }) {
  const modalColors = useMemo(() => getModalColors(teamColors), [teamColors])
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
  const [bowlConfig, setBowlConfig] = useState(() => {
    // Initialize from existing dynasty config or defaults
    return currentDynasty?.cfpBowlConfigByYear?.[currentYear] || { ...DEFAULT_BOWL_CONFIG }
  })

  const [useEmbedded, setUseEmbedded] = useState(() => {
    // Load preference from localStorage
    return localStorage.getItem('sheetEmbedPreference') === 'true'
  })
  const [highlightSave, setHighlightSave] = useState(false)
  const [showAIPrompt, setShowAIPrompt] = useState(false)

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} CFP Seeds (1-12)`,
    structure: `This sheet has ONE tab: "CFP Seeds". It is a 12-row ranking of the College Football Playoff seeds 1 through 12.

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. OUTPUT COLUMN B ONLY. Column A (the seed number) is pre-filled and protected — never output it.
2. ROW ORDER IS FIXED: row 1 = #1 seed, row 2 = #2 seed, ..., row 12 = #12 seed. Do not reorder.
3. Output EXACTLY 12 lines. Not 11, not 13. One team per line.
4. TEAM ABBREVIATIONS ONLY — use the abbreviation mapping below. Never output full names, nicknames, mascots, or cities.
5. The team column is a STRICT dropdown. Wrong spelling/casing/nickname will be rejected by the sheet.
6. BLANK LINE if the seed is unknown. Never guess, never use "N/A", "TBD", dash, or zero.
7. No header row, no seed numbers, no commentary, no explanation, no blank leading line before row 1.
8. No commas, no extra whitespace, no surrounding quotes.
9. One SINGLE TSV block labeled with the tab name and paste cell.

═══════════════════════════════════════════════════════════
TAB: "CFP Seeds" — 12 rows × 1 editable column
Paste your block at cell B2 of the "CFP Seeds" tab
═══════════════════════════════════════════════════════════

Row | Column A (PROTECTED / pre-filled) | Your column B value    | Format / Allowed values
----+-----------------------------------+------------------------+-------------------------------------
  1 | 1                                 | #1 seed team abbr      | Exactly one value from the TEAM ABBREVIATIONS mapping below
  2 | 2                                 | #2 seed team abbr      | Exactly one value from the TEAM ABBREVIATIONS mapping below
  3 | 3                                 | #3 seed team abbr      | Exactly one value from the TEAM ABBREVIATIONS mapping below
  4 | 4                                 | #4 seed team abbr      | Exactly one value from the TEAM ABBREVIATIONS mapping below
  5 | 5                                 | #5 seed team abbr      | Exactly one value from the TEAM ABBREVIATIONS mapping below
  6 | 6                                 | #6 seed team abbr      | Exactly one value from the TEAM ABBREVIATIONS mapping below
  7 | 7                                 | #7 seed team abbr      | Exactly one value from the TEAM ABBREVIATIONS mapping below
  8 | 8                                 | #8 seed team abbr      | Exactly one value from the TEAM ABBREVIATIONS mapping below
  9 | 9                                 | #9 seed team abbr      | Exactly one value from the TEAM ABBREVIATIONS mapping below
 10 | 10                                | #10 seed team abbr     | Exactly one value from the TEAM ABBREVIATIONS mapping below
 11 | 11                                | #11 seed team abbr     | Exactly one value from the TEAM ABBREVIATIONS mapping below
 12 | 12                                | #12 seed team abbr     | Exactly one value from the TEAM ABBREVIATIONS mapping below

All 12 cells use the same strict dropdown of team abbreviations. The complete list of allowed abbreviations is in the TEAM ABBREVIATIONS mapping at the bottom of this prompt — use ONLY those exact values.

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== CFP SEEDS — paste at cell B2 of "CFP Seeds" tab ===
<#1 seed abbr>
<#2 seed abbr>
<#3 seed abbr>
<#4 seed abbr>
<#5 seed abbr>
<#6 seed abbr>
<#7 seed abbr>
<#8 seed abbr>
<#9 seed abbr>
<#10 seed abbr>
<#11 seed abbr>
<#12 seed abbr>

═══════════════════════════════════════════════════════════
FINAL CHECK before you send the answer
═══════════════════════════════════════════════════════════
[ ] Exactly 12 lines in the block (not counting the "=== CFP SEEDS ===" label)
[ ] Every value is a team ABBREVIATION from the mapping — no full names, no nicknames
[ ] No seed numbers, no column A, no header row in the output
[ ] Blank line for any seed I could not determine — I invented nothing
[ ] Casing matches the mapping exactly (e.g. "BAMA" not "bama" or "Bama")
[ ] No commas, no surrounding quotes, no trailing commentary`,
    includeTeamMap: true,
    dynastyTeams: currentDynasty?.teams,
  }), [currentYear, currentDynasty?.teams])

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

  // Create fresh CFP seeds sheet when modal opens (always new, pre-filled with existing data)
  useEffect(() => {
    const createSheet = async () => {
      if (isOpen && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote) {
        // Set ref immediately to prevent concurrent calls (state updates are async)
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
            toast.error('Failed to create the CFP seeds sheet — try again or contact support.')
          }
        } finally {
          setCreatingSheet(false)
          creatingSheetRef.current = false
        }
      }
    }

    createSheet()
  }, [isOpen, user, sheetId, creatingSheet, currentDynasty?.id, currentYear, auth.retryCount, showDeletedNote])

  // Reset state when modal closes - clear sheetId so fresh sheet is created next time
  useEffect(() => {
    if (!isOpen) {
      setSheetId(null)
      setShowDeletedNote(false)
      creatingSheetRef.current = false
    }
  }, [isOpen])

  // Reset bowl config when modal opens or year changes
  useEffect(() => {
    if (isOpen) {
      setBowlConfig(currentDynasty?.cfpBowlConfigByYear?.[currentYear] || { ...DEFAULT_BOWL_CONFIG })
    }
  }, [isOpen, currentYear, currentDynasty?.cfpBowlConfigByYear])

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

  const embedUrl = sheetId ? getSheetEmbedUrl(sheetId, 'CFP Seeds') : null
  const isLoading = creatingSheet

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
                Creating CFP Seeds Sheet...
              </p>
              <p className="text-sm mt-2 text-txt-secondary">
                Setting up seed entries 1-12
              </p>
              <SheetLoadingHint active={isLoading} />
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="card p-8 border-l-[3px] text-center max-w-sm" style={{ borderLeftColor: 'var(--surface-5)' }}>
              <p className="label-xs text-txt-tertiary mb-2">Status</p>
              <p className="text-xl font-bold text-txt-primary mb-2">Saved &amp; Moved to Trash</p>
              <p className="text-sm text-txt-secondary">CFP Seeds saved to your dynasty.</p>
            </div>
          </div>
        ) : sheetId ? (
          <div className="flex-1 flex flex-col overflow-hidden min-h-0 gap-3">
            {/* Bowl Configuration Section — pinned at top */}
            <div className="p-3 rounded-lg border flex-shrink-0" style={{ borderColor: modalColors.border, backgroundColor: modalColors.headerBg }}>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold uppercase" style={{ color: 'var(--text-primary)', letterSpacing: '1.5px' }}>
                  Bowl Game Assignments
                </h4>
                <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                  NY6 rotates yearly
                </span>
              </div>

              {/* Quarterfinals */}
              <p className="text-[10px] font-bold uppercase mb-1.5" style={{ color: 'var(--text-secondary)', letterSpacing: '1px' }}>Quarterfinals</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mb-2.5">
                {QF_KEYS.map(key => (
                  <div key={key}>
                    <label className="text-[10px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                      {SEED_DESCRIPTIONS[key]}
                    </label>
                    <select
                      value={bowlConfig[key] || DEFAULT_BOWL_CONFIG[key]}
                      onChange={(e) => setBowlConfig(prev => ({ ...prev, [key]: e.target.value }))}
                      className="w-full px-1.5 py-1 rounded text-xs border"
                      style={{
                        borderColor: modalColors.inputBorder,
                        backgroundColor: modalColors.inputBg,
                        color: 'var(--text-primary)'
                      }}
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

            <SheetModalAIHero
              tagline="Skip the typing. Let AI fill the CFP seeds."
              buttons={[{ label: 'Copy AI Prompt', onClick: () => setShowAIPrompt(true) }]}
            />

            {isMobile || !useEmbedded ? (
              <SheetManualEntry sheetId={sheetId} whatToDo="Enter the CFP seeding" />
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
      <AIPromptModal isOpen={showAIPrompt} onClose={() => setShowAIPrompt(false)} title={`${currentYear} CFP Seeds (1-12)`} prompt={aiPrompt} pasteTarget={`Cell B2 of the "CFP Seeds" tab`} />
    </div>,
    document.body
  )
}
