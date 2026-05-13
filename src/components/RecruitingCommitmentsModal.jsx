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
import AIPromptModal from './AIPromptModal'
import {
  createRecruitingSheet,
  readRecruitingFromSheet,
  deleteGoogleSheet,
  getSheetEmbedUrl,
  sheetExists
} from '../services/sheetsService'
import { teamAbbreviations } from '../data/teamAbbreviations'
import { getModalColors } from '../utils/colorUtils'
import { buildAIPrompt } from '../utils/aiPrompt'
import SheetLoadingHint from './SheetLoadingHint'

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export default function RecruitingCommitmentsModal({
  isOpen,
  onClose,
  onSave,
  currentYear,
  currentPhase,
  currentWeek,
  commitmentKey,
  recruitingLabel,
  existingCommitments = [],
  teamColors
}) {
  const { currentDynasty, updateDynasty } = useDynasty()
  const { user } = useAuth()
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
  const [showAIPrompt, setShowAIPrompt] = useState(false)

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} Recruiting Commitments — ${recruitingLabel || ''}`.trim(),
    structure: `This sheet has ONE tab: "Commitments".
The header row (row 1) is pre-filled and PROTECTED. Data rows start at row 2. You will output one row per recruit visible in the screenshots (up to 35 recruits — max scholarships per class).

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. Output ONLY the data rows (row 2 onward). NEVER output the header row.
2. Output ALL 15 columns per row, tab-separated, in the exact order A→O below.
3. One row per recruit. Do not reorder rows arbitrarily; keep the same order as the screenshots.
4. NO COMMAS in numbers. Output "1234" — never "1,234".
5. INTEGERS have no decimal point. No quotes around numbers.
6. BLANK cell for unknown values — never guess, never use 0, "-", or "N/A". Blank ≠ zero.
7. Dropdown columns (B, C, D, E, I, L, M, N, O) MUST use EXACTLY one of the literal values listed. Wrong spelling or casing will be rejected.
8. Column E (Stars) uses ☆ symbols, NOT digits. One symbol = 1 star, five symbols = 5 stars.
9. Column O (Prev Team) MUST be a team abbreviation from the mapping below, or BLANK. Blank for HS/JUCO recruits; only filled for transfer-portal recruits.
10. No header row, no totals, no commentary INSIDE the data. ONE TSV block, preceded by the required paste-target label line above the fence (see Method A/B rules above).

═══════════════════════════════════════════════════════════
TAB: "Commitments" — up to 35 rows × 15 columns
Paste at cell A2 of the "Commitments" tab
═══════════════════════════════════════════════════════════

Row | Col | Header (protected)  | Your value                                                                            | Format
----+-----+---------------------+---------------------------------------------------------------------------------------+----------
 2+ |  A  | Player              | Full player name, text                                                                | text
 2+ |  B  | Class               | Dropdown — exactly one of the 10 values below                                         | dropdown
 2+ |  C  | Position            | Dropdown — exactly one of the 22 values below                                         | dropdown
 2+ |  D  | Archetype           | Dropdown — exactly one of the 43 values below                                         | dropdown
 2+ |  E  | Stars               | Dropdown — exactly one of: ☆  ☆☆  ☆☆☆  ☆☆☆☆  ☆☆☆☆☆   (blank if unknown)               | dropdown (symbols)
 2+ |  F  | Nat. Rank           | Integer (national recruiting rank)                                                    | integer
 2+ |  G  | State Rank          | Integer (rank within state)                                                           | integer
 2+ |  H  | Pos. Rank           | Integer (rank at position)                                                            | integer
 2+ |  I  | Height              | Dropdown — exactly one of the 20 values below (feet'inches" with straight quotes)     | dropdown
 2+ |  J  | Weight              | Integer in lbs, no unit suffix                                                        | integer
 2+ |  K  | Hometown            | City name, text                                                                       | text
 2+ |  L  | State               | Dropdown — exactly one of the 51 two-letter codes below                               | dropdown
 2+ |  M  | Gem/Bust            | Dropdown — exactly "Gem" or "Bust", or blank                                          | dropdown
 2+ |  N  | Dev Trait           | Dropdown — exactly one of: Elite, Star, Impact, Normal                                | dropdown
 2+ |  O  | Prev Team           | Team abbreviation from mapping (transfers only); BLANK for HS/JUCO                    | dropdown

═══════════════════════════════════════════════════════════
ENUMERATED DROPDOWN VALUES (use EXACTLY — case-sensitive)
═══════════════════════════════════════════════════════════

Column B — Class (10 values):
  HS, JUCO Fr, JUCO So, JUCO Jr, Fr, RS Fr, So, RS So, Jr, RS Jr

Column C — Position (22 values):
  QB, HB, FB, WR, TE, LT, LG, C, RG, RT, LEDG, REDG, DT, SAM, MIKE, WILL, CB, FS, SS, K, P, ATH

Column D — Archetype (43 values — copy EXACTLY, including capitalization and slashes):
  Backfield Creator, Dual Threat, Pocket Passer, Pure Runner,
  Backfield Threat, East/West Playmaker, Elusive Bruiser, North/South Receiver, North/South Blocker,
  Blocking, Utility,
  Contested Specialist, Elusive Route Runner, Gadget, Gritty Possession, Physical Route Runner, Route Artist, Speedster,
  Possession, Pure Blocker, Pure Possession, Vertical Threat,
  Agile, Pass Protector, Raw Strength, Ground and Pound, Well Rounded,
  Edge Setter, Gap Specialist, Power Rusher, Pure Power, Speed Rusher,
  Lurker, Signal Caller, Thumper,
  Boundary, Bump and Run, Field, Zone,
  Box Specialist, Coverage Specialist, Hybrid,
  Accurate, Power

Column E — Stars (5 values, star symbol only — NOT digits, NOT "5 stars"):
  ☆        (1 star)
  ☆☆       (2 stars)
  ☆☆☆      (3 stars)
  ☆☆☆☆     (4 stars)
  ☆☆☆☆☆    (5 stars)

Column I — Height (20 values — foot mark ' then inches then straight ASCII quote "):
  5'5"  5'6"  5'7"  5'8"  5'9"  5'10"  5'11"
  6'0"  6'1"  6'2"  6'3"  6'4"  6'5"  6'6"  6'7"  6'8"  6'9"  6'10"  6'11"
  7'0"

Column L — State (51 two-letter US codes):
  AK, AL, AR, AZ, CA, CO, CT, DC, DE, FL, GA, HI, IA, ID, IL, IN, KS, KY, LA, MA,
  MD, ME, MI, MN, MO, MS, MT, NC, ND, NE, NH, NJ, NM, NV, NY, OH, OK, OR, PA, RI,
  SC, SD, TN, TX, UT, VA, VT, WA, WI, WV, WY

Column M — Gem/Bust:
  Gem, Bust   (or leave BLANK if neither)

Column N — Dev Trait (4 values):
  Elite, Star, Impact, Normal

Column O — Prev Team: use ONLY abbreviations from the team mapping appended below. Leave BLANK for any non-transfer (HS, JUCO) recruit. Never write a full team name.

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== COMMITMENTS — paste at cell A2 of "Commitments" tab ===
<Player>\\t<Class>\\t<Position>\\t<Archetype>\\t<Stars>\\t<Nat. Rank>\\t<State Rank>\\t<Pos. Rank>\\t<Height>\\t<Weight>\\t<Hometown>\\t<State>\\t<Gem/Bust>\\t<Dev Trait>\\t<Prev Team>
<next recruit row...>
...

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] Exactly 15 tab-separated values per line (count the tabs: there must be 14 tabs between 15 values)
[ ] No header row in output
[ ] No commas in any number
[ ] Stars column uses ☆ symbols (never digits)
[ ] Every value in columns B, C, D, E, I, L, M, N, O is a LITERAL MATCH of an enumerated dropdown value
[ ] Heights use straight ASCII quote " not curly quote
[ ] Prev Team is blank for HS/JUCO recruits, an abbreviation (from mapping) for transfers
[ ] Blank cells for unknowns — invented nothing`,
    includeTeamMap: true,
    dynastyTeams: currentDynasty?.teams,
    notes: 'Column O (Prev Team) applies ONLY to transfer-portal recruits (Class = Fr, RS Fr, So, RS So, Jr, or RS Jr). For HS and JUCO recruits, leave column O blank. Use ONLY the team abbreviations in the mapping below — never a full team name.',
  }), [currentYear, recruitingLabel, currentDynasty?.teams])

  // Ref to prevent concurrent sheet creation (state updates are async, refs are immediate)
  const creatingSheetRef = useRef(false)

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

  // Create recruiting sheet when modal opens
  useEffect(() => {
    const createSheet = async () => {
      if (isOpen && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote && commitmentKey) {
        // Check for existing sheet for this phase/week
        const sheetKey = `recruitingSheet_${currentYear}_${commitmentKey}`
        const existingSheetId = currentDynasty?.[sheetKey]
        if (existingSheetId) {
          const stillExists = await sheetExists(existingSheetId)
          if (stillExists) {
            setSheetId(existingSheetId)
            return
          }
          await updateDynasty(currentDynasty.id, { [sheetKey]: null })
          // stale sheet (trashed in Drive); fall through to regenerate
        }

        // Set ref immediately to prevent concurrent calls (state updates are async)
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          const sheetInfo = await createRecruitingSheet(
            currentDynasty?.teamName || 'Dynasty',
            currentYear,
            currentDynasty?.teams || null,
            existingCommitments // Pass all previous commitments to pre-populate
          )
          setSheetId(sheetInfo.spreadsheetId)

          // Save sheet ID to dynasty
          await updateDynasty(currentDynasty.id, {
            [sheetKey]: sheetInfo.spreadsheetId
          })
        } catch (error) {
          console.error('Failed to create recruiting sheet:', error)
          auth.handleError(error)
        } finally {
          setCreatingSheet(false)
          creatingSheetRef.current = false
        }
      }
    }

    createSheet()
  }, [isOpen, user, sheetId, creatingSheet, currentDynasty?.id, auth.retryCount, showDeletedNote, currentYear, commitmentKey, existingCommitments])

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
      const recruits = await readRecruitingFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(recruits)
      onClose()
    } catch (error) {
      console.error(error)
      if (!auth.handleError(error)) {
        toast.error('Failed to sync from Google Sheets. Make sure data is properly formatted.')
      }
    } finally {
      setSyncing(false)
    }
  }

  const handleSyncAndDelete = async () => {
    if (!sheetId) return

    setDeletingSheet(true)
    try {
      const recruits = await readRecruitingFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(recruits)

      // Move sheet to trash (keep sheet ID stored so user can restore if needed)
      await deleteGoogleSheet(sheetId)

      setSheetId(null)
      setShowDeletedNote(true)
      setTimeout(() => {
        onClose()
      }, 2500)
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
      const sheetKey = `recruitingSheet_${currentYear}_${commitmentKey}`
      await updateDynasty(currentDynasty.id, { [sheetKey]: null })
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
      title: 'Delete this recruiting commitments sheet?',
      message: 'This deletes the Google Sheet without applying any edits. Your dynasty recruiting commitments stay as-is.',
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (!ok) return
    setDeletingSheet(true)
    try {
      await deleteGoogleSheet(sheetId)
      const sheetKey = `recruitingSheet_${currentYear}_${commitmentKey}`
      await updateDynasty(currentDynasty.id, { [sheetKey]: null })
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

  const embedUrl = sheetId ? getSheetEmbedUrl(sheetId, 'Commitments') : null
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
        <SheetModalHeader eyebrow="Recruiting" title={`Commitments — ${recruitingLabel}`} onClose={handleClose} />

        <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6">
        {currentPhase !== 'offseason' && (
          <div className="mb-4 p-3 rounded-lg text-sm text-txt-primary" style={{ backgroundColor: 'var(--surface-3)' }}>
            <strong>Note:</strong> Weekly commitment entry is optional. You can also enter all commitments during Signing Day in the offseason.
            {existingCommitments.length > 0 && (
              <span className="block mt-1">
                Previous commitments ({existingCommitments.length}) are pre-filled in the sheet.
              </span>
            )}
          </div>
        )}

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
                Creating Recruiting Sheet...
              </p>
              <p className="text-sm mt-2 text-txt-secondary">
                Setting up dropdowns and formatting
              </p>
              <SheetLoadingHint active={isLoading} />
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="card p-8 border-l-[3px] text-center max-w-sm" style={{ borderLeftColor: 'var(--surface-5)' }}>
              <p className="label-xs text-txt-tertiary mb-2">Status</p>
              <p className="text-xl font-bold text-txt-primary mb-2">Saved &amp; Moved to Trash</p>
              <p className="text-sm text-txt-secondary">Recruiting commitments saved to your dynasty.</p>
            </div>
          </div>
        ) : sheetId ? (
          <div className="flex-1 flex flex-col overflow-hidden gap-3">
            <SheetModalAIHero
              tagline="Skip the typing. Let AI fill the recruiting commitments."
              buttons={[{ label: 'Copy AI Prompt', onClick: () => setShowAIPrompt(true) }]}
            />
            {isMobile || !useEmbedded ? (
              <SheetManualEntry sheetId={sheetId} />
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden min-h-0 border border-surface-4 rounded-lg">
                <iframe
                  src={embedUrl}
                  className="w-full h-full"
                  title="Recruiting Commitments Sheet"
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
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-txt-primary">Failed to create sheet. Please try again.</p>
          </div>
        )}
        </div>
      </div>

      {/* Auth Error Modal */}
      <AuthErrorModal
        isOpen={auth.showAuthError}
        onClose={auth.closeAuthError}
        onRefresh={auth.retry}
        teamColors={teamColors}
      />
      <AIPromptModal
        isOpen={showAIPrompt}
        onClose={() => setShowAIPrompt(false)}
        title={`${currentYear} Recruiting Commitments — ${recruitingLabel || ''}`.trim()}
        prompt={aiPrompt}
        pasteTarget={`Cell A2 of the "Commitments" tab`}
      />
    </div>,
    document.body,
  )
}
