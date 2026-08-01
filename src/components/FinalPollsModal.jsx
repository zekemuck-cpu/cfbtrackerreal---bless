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
import { getModalColors } from '../utils/colorUtils'
import { buildAIPrompt } from '../utils/aiPrompt'
import SheetLoadingHint from './SheetLoadingHint'
import LocalDataEntry from './ui/LocalDataEntry'
import { splitTsv } from '../utils/tsvParse'
import { getTeamNameOptions, getTeamNameLabel, getTidFromAbbr, getTeamNameAliases } from '../data/teamRegistry'
import {
  createFinalPollsSheet,
  readFinalPollsFromSheet,
  deleteGoogleSheet,
  getSheetEmbedUrl
} from '../services/sheetsService'

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export default function FinalPollsModal({ isOpen, onClose, onSave, currentYear, teamColors }) {
  const { currentDynasty } = useDynasty()
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
  const teamAbbrs = useMemo(() => getTeamNameOptions(currentDynasty?.teams, { includeFCS: false }), [currentDynasty?.teams])

  // Local paste is the DEFAULT; the Google Sheet flow is the opt-in fallback.
  const [useLocal, setUseLocal] = useState(true)
  const [useEmbedded, setUseEmbedded] = useState(() => {
    return localStorage.getItem('sheetEmbedPreference') === 'true'
  })
  const [highlightSave, setHighlightSave] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  const creatingSheetRef = useRef(false)
  const creationAttemptedRef = useRef(false)
  const lastRetryCountRef = useRef(auth.retryCount)
  const modalColors = useMemo(() => getModalColors(teamColors), [teamColors])

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} Final Top 25 Poll`,
    structure: `This sheet has ONE tab named "Polls". 2 columns, 26 rows: row 1 is a protected header, rows 2-26 are ranks 1-25.

Column A (rank number 1-25) is PRE-FILLED — you never output it.
You fill column B (Top 25 team for that rank).

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. Output ONLY column B (one team name per line). NEVER output column A (rank), the header row, or any rank labels.
2. Row order is FIXED: rank 1 first, rank 25 last. EXACTLY 25 lines of output.
3. Each line has EXACTLY 1 field: <Team name>
4. Team values must be team names from the list at the bottom — NEVER an abbreviation, nickname, or mascot.
5. NO COMMAS. No commentary INSIDE the data. No rank numbers. No header row. No tabs.
6. Each team name must appear AT MOST ONCE across all 25 ranks — no duplicates in the poll.
7. BLANK line for unknown ranks (just an empty line between two filled ranks). Never guess.
8. ONE block — output ONLY the fenced block, nothing before or after it.

═══════════════════════════════════════════════════════════
SECTION "Polls" — 25 rows × 1 output column
═══════════════════════════════════════════════════════════

Row-by-row mapping:

Sheet Row | Col A (PROTECTED, DO NOT OUTPUT) | Your output: Top 25 team
----------+----------------------------------+-------------------------
    2     | 1                                | <Rank 1 team>
    3     | 2                                | <Rank 2 team>
    4     | 3                                | <Rank 3 team>
    5     | 4                                | <Rank 4 team>
    6     | 5                                | <Rank 5 team>
    7     | 6                                | <Rank 6 team>
    8     | 7                                | <Rank 7 team>
    9     | 8                                | <Rank 8 team>
   10     | 9                                | <Rank 9 team>
   11     | 10                               | <Rank 10 team>
   12     | 11                               | <Rank 11 team>
   13     | 12                               | <Rank 12 team>
   14     | 13                               | <Rank 13 team>
   15     | 14                               | <Rank 14 team>
   16     | 15                               | <Rank 15 team>
   17     | 16                               | <Rank 16 team>
   18     | 17                               | <Rank 17 team>
   19     | 18                               | <Rank 18 team>
   20     | 19                               | <Rank 19 team>
   21     | 20                               | <Rank 20 team>
   22     | 21                               | <Rank 21 team>
   23     | 22                               | <Rank 22 team>
   24     | 23                               | <Rank 23 team>
   25     | 24                               | <Rank 24 team>
   26     | 25                               | <Rank 25 team>

Per-line output (1 field):
<Team name>

Field format:
- Top 25 team (strict dropdown) — team name from the TEAM NAMES list at the bottom (e.g. Ohio State, Alabama, Georgia). One team per rank. Blank if unknown.

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== FINAL POLL ===
<rank 1 name>
<rank 2 name>
<rank 3 name>
<rank 4 name>
<rank 5 name>
<rank 6 name>
<rank 7 name>
<rank 8 name>
<rank 9 name>
<rank 10 name>
<rank 11 name>
<rank 12 name>
<rank 13 name>
<rank 14 name>
<rank 15 name>
<rank 16 name>
<rank 17 name>
<rank 18 name>
<rank 19 name>
<rank 20 name>
<rank 21 name>
<rank 22 name>
<rank 23 name>
<rank 24 name>
<rank 25 name>

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] Exactly 25 lines in the block, rank 1 first, rank 25 last
[ ] Every line has exactly 1 field (no tabs, no commas)
[ ] All team values are uppercase names from the list — no full names
[ ] No team duplicated across the 25 ranks
[ ] Blank lines for unknowns — nothing invented
[ ] No rank numbers, no header row, no commentary INSIDE the data.`,
    includeTeamMap: true,
    dynastyTeams: currentDynasty?.teams,
  }), [currentYear, currentDynasty?.teams])

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
        creationAttemptedRef.current = true
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          const existingPolls = currentDynasty?.finalPollsByYear?.[currentYear] || {}
          const sheetInfo = await createFinalPollsSheet(currentYear, existingPolls, currentDynasty?.teams || currentDynasty?.customTeams)
          setSheetId(sheetInfo.sheetId)
        } catch (error) {
          console.error('Failed to create final polls sheet:', error)
          if (!auth.handleError(error)) {
            toast.error('Failed to create the final polls sheet. Try again or contact support.')
          }
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
      setSheetId(null)
      setUseLocal(true)
    }
  }, [isOpen])

  // Local paste import: feed the parser the SAME [rank, abbr] rows the sheet
  // produces. The AI reply lists teams in rank order (rank column is normally
  // pre-filled on the sheet), so a 1-cell line gets its rank from position.
  const handleLocalImport = async (text) => {
    const lines = splitTsv(text)
    const rows = lines.map((cells, i) => (cells.length >= 2 ? cells : [String(i + 1), (cells[0] ?? '')]))
    const polls = await readFinalPollsFromSheet(null, (currentDynasty?.teams || currentDynasty?.customTeams), { rows })
    await onSave(polls)
    onClose()
  }

  // Pre-fill the local grid with this year's saved Top 25. This is a
  // SINGLE-COLUMN, POSITION-BASED format: handleLocalImport derives each team's
  // rank from its line position (line i -> rank i+1) because splitTsv drops
  // blank lines. So the pre-fill can only round-trip when the saved poll is a
  // CONTIGUOUS 1..N (no internal gaps) — otherwise a blank rank would collapse
  // and shift every team below it. When the saved media list is dense from
  // rank 1, emit one team name per line in rank order; when it is ragged (has a gap),
  // leave the grid blank rather than emit a mis-ranked pre-fill.
  const initialText = useMemo(() => {
    const media = currentDynasty?.finalPollsByYear?.[currentYear]?.media
      || currentDynasty?.finalPollsByYear?.[String(currentYear)]?.media
      || []
    if (!Array.isArray(media) || media.length === 0) return ''
    const sorted = [...media]
      .filter(m => m && m.team && typeof m.rank === 'number' && m.rank >= 1)
      .sort((a, b) => a.rank - b.rank)
    if (sorted.length === 0) return ''
    // Require a contiguous 1..N sequence for a safe positional round-trip.
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].rank !== i + 1) return ''
    }
    return sorted.map(m => getTeamNameLabel(currentDynasty?.teams, m.tid ?? getTidFromAbbr(m.team, currentDynasty)) || m.team).join('\n')
  }, [currentDynasty?.finalPollsByYear, currentYear])

  const handleSyncFromSheet = async () => {
    if (!sheetId) return
    setSyncing(true)
    try {
      const polls = await readFinalPollsFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(polls)
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
      const polls = await readFinalPollsFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(polls)
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
      title: 'Delete this final polls sheet?',
      message: 'This deletes the Google Sheet without applying any edits. Your dynasty final polls stay as-is.',
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

  const handleClose = () => onClose()

  if (!isOpen) return null

  const embedUrl = sheetId ? getSheetEmbedUrl(sheetId, 'Final Polls') : null
  const isLoading = creatingSheet

  return createPortal(
    <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4 modal-backdrop-in" style={{ margin: 0 }} onMouseDown={handleClose}>
      <div className={`card-elevated w-full max-h-[calc(100dvh-4rem)] flex flex-col overflow-hidden ${
        useEmbedded
          ? 'sm:w-[95vw] sm:h-[95dvh]'
          : 'sm:max-w-[680px] sm:h-auto'
      }`} onMouseDown={(e) => e.stopPropagation()}>
        <SheetModalHeader eyebrow="Postseason" title={`${currentYear} Final Top 25`} onClose={handleClose} />

        <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6">
        {useLocal && !showDeletedNote ? (
          <LocalDataEntry
            aiPrompt={aiPrompt}
            onImport={handleLocalImport}
            onUseGoogle={() => setUseLocal(false)}
            onCancel={handleClose}
            importLabel="Import Final Polls"
            columns={['Team']}
            comboboxColumns={{ 'Team': teamAbbrs }}
            comboboxAliases={getTeamNameAliases(currentDynasty?.teams)}
            initialText={initialText}
          />
        ) : isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin w-12 h-12 border-4 rounded-full mx-auto mb-4" style={{ borderColor: 'var(--text-primary)', borderTopColor: 'transparent' }} />
              <p className="text-lg font-semibold text-txt-primary">Creating Final Polls Sheet...</p>
              <SheetLoadingHint active={isLoading} />
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="card p-8 text-center max-w-sm">
              <p className="label-xs text-txt-tertiary mb-2">Status</p>
              <p className="text-xl font-bold text-txt-primary mb-2">Saved &amp; Moved to Trash</p>
              <p className="text-sm text-txt-secondary">Final polls saved.</p>
            </div>
          </div>
        ) : sheetId ? (
          <div className="flex-1 flex flex-col overflow-hidden gap-3">
            <SheetModalAIHero
              tagline="Skip the typing. Let AI fill the final polls."
              buttons={[{ label: 'Copy AI Prompt', prompt: aiPrompt }]}
            />
            {isMobile || !useEmbedded ? (
              <SheetManualEntry sheetId={sheetId} />
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden min-h-0 border border-surface-4 rounded-lg">
                <SheetToolbar sheetId={sheetId} embedUrl={embedUrl} teamColors={teamColors} title="Final Polls" />
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
    document.body
  )
}
