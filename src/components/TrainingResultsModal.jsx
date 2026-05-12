import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import SheetModalHeader from './ui/SheetModalHeader'
import SheetModalAIHero from './ui/SheetModalAIHero'
import SheetManualEntry from './ui/SheetManualEntry'
import AuthErrorModal from './AuthErrorModal'
import { useAuthErrorHandler } from '../hooks/useAuthErrorHandler'
import AIPromptModal from './AIPromptModal'
import {
  createTrainingResultsSheet,
  readTrainingResultsFromSheet,
  deleteGoogleSheet,
  getSheetEmbedUrl,
  sheetExists
} from '../services/sheetsService'
import { getModalColors } from '../utils/colorUtils'
import { buildAIPrompt } from '../utils/aiPrompt'
import SheetLoadingHint from './SheetLoadingHint'

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export default function TrainingResultsModal({ isOpen, onClose, onSave, currentYear, teamColors, players }) {
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

  // Use the EXACT list of players the sheet is built from (passed in via
  // the `players` prop from Dashboard). That list is the combined
  // returning-players + portal-transfers set. Recomputing it here with a
  // simpler filter missed portal transfers, so the AI prompt listed fewer
  // players than the sheet actually contained — causing the AI to skip
  // valid training rows.
  const userRoster = useMemo(() => (
    (players || []).map(p => ({
      name: p.name,
      jerseyNumber: p.jerseyNumber,
      position: p.position,
    }))
  ), [players])

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} Training Results`,
    roster: userRoster,
    structure: `This sheet has ONE tab: "Training Results". The user will paste your output at cell A2 and the app matches rows by PLAYER NAME — row order does not matter. Output ALL FOUR columns for every player on the YOUR TEAM ROSTER block above.

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. OUTPUT 4 TAB-SEPARATED COLUMNS per row: Player<TAB>Position<TAB>Past OVR<TAB>New OVR.
2. ONE ROW PER PLAYER in the YOUR TEAM ROSTER block. Include every roster player, even if their New OVR is unknown. The roster block has ALREADY been filtered to exclude incoming HS recruits — they do NOT receive training results. If a name appears in EA's training screenshots but is NOT in the YOUR TEAM ROSTER block, DO NOT output a row for them.
3. Column 1 (Player) MUST use the FULL name from the YOUR TEAM ROSTER block — never abbreviated ("A. Guess"). EA CFB screenshots often show abbreviated names; match them to full names using the roster.
4. Column 2 (Position) MUST match the roster's position string exactly (QB, HB, WR, TE, LT, LG, C, RG, RT, LEDG, REDG, DT, SAM, MIKE, WILL, CB, FS, SS, K, P).
5. Column 3 (Past OVR) = the OLD OVR before training. Integer 40–99.
   • If the screenshot shows both an old and new OVR for this player, use the old value.
   • TRANSFER PORTAL PLAYERS (newly arrived from another team) usually have NO prior OVR recorded in the app. In those cases, compute Past OVR = New OVR − training delta (e.g. a +3 training result with new OVR 84 means Past OVR = 81). Do this for ANY player whose past value you can derive from the screenshot — even if the app doesn't already know it.
   • Leave BLANK only if no past value can be read or derived.
6. Column 4 (New OVR) = the NEW OVR after training. Integer 40–99. Leave BLANK if unknown. If the screenshot shows a "+N" delta and a Past OVR, compute New OVR = Past OVR + delta.
7. NO header row. NO commentary. NO blank lines between rows. Each row has exactly 3 tab characters.
8. INTEGERS only in columns C and D. No decimals, no commas, no quotes, no units, no "+/-" signs, no color coding.
9. NEVER GUESS. If you cannot determine a player's OVR from the screenshots, leave that column blank for that player — the app keeps the previous value.

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT — fenced TSV block only, no prose before or after
═══════════════════════════════════════════════════════════
\`\`\`tsv
Alex Guess	QB	87	90
Jaylen Miller	HB	81	82
Devin Hollis	WR	76
...
\`\`\`

(one row per roster player; blank cells allowed in columns C/D only; paste the whole block at A2)

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] Row count equals the number of players on YOUR TEAM ROSTER
[ ] Every row has exactly 3 tab characters (4 columns)
[ ] Column 1 names match the FULL names in the roster block (no initials)
[ ] Column 2 positions use canonical abbreviations
[ ] Columns 3 and 4 are integers 40–99 or blank
[ ] No header row, no prose, no commas, no +/- signs
[ ] Output wrapped in a single \`\`\`tsv ... \`\`\` fence`,
    includeTeamMap: false,
  }), [currentYear, userRoster])

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

  // Create training results sheet when modal opens
  useEffect(() => {
    const createSheet = async () => {
      if (isOpen && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote) {
        // Check if we have an existing sheet for this year
        const existingSheetId = currentDynasty?.trainingResultsSheetId
        if (existingSheetId) {
          const stillExists = await sheetExists(existingSheetId)
          if (stillExists) {
            setSheetId(existingSheetId)
            return
          }
          await updateDynasty(currentDynasty.id, { trainingResultsSheetId: null })
          // stale sheet (trashed in Drive); fall through to regenerate
        }

        // Set ref immediately to prevent concurrent calls (state updates are async)
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          const sheetInfo = await createTrainingResultsSheet(
            currentDynasty?.teamName || 'Dynasty',
            currentYear,
            players || []
          )
          setSheetId(sheetInfo.spreadsheetId)

          // Save sheet ID to dynasty
          await updateDynasty(currentDynasty.id, {
            trainingResultsSheetId: sheetInfo.spreadsheetId
          })
        } catch (error) {
          console.error('Failed to create training results sheet:', error)
          auth.handleError(error)
        } finally {
          setCreatingSheet(false)
          creatingSheetRef.current = false
        }
      }
    }

    createSheet()
  }, [isOpen, user, sheetId, creatingSheet, currentDynasty?.id, auth.retryCount, showDeletedNote, players, currentYear])

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
      const trainingResults = await readTrainingResultsFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(trainingResults)
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
      const trainingResults = await readTrainingResultsFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(trainingResults)

      await deleteGoogleSheet(sheetId)
      await updateDynasty(currentDynasty.id, { trainingResultsSheetId: null })

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
      await updateDynasty(currentDynasty.id, { trainingResultsSheetId: null })
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
      title: 'Delete this training results sheet?',
      message: 'This deletes the Google Sheet without applying any edits. Your dynasty player overalls stay as-is.',
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (!ok) return
    setDeletingSheet(true)
    try {
      await deleteGoogleSheet(sheetId)
      await updateDynasty(currentDynasty.id, { trainingResultsSheetId: null })
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

  const embedUrl = sheetId ? getSheetEmbedUrl(sheetId, 'Training Results') : null
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
        <SheetModalHeader eyebrow="Offseason" title="Training Results" onClose={handleClose} />

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
                Creating Training Results Sheet...
              </p>
              <p className="text-sm mt-2 text-txt-secondary">
                Pre-filling returning players with current overalls
              </p>
              <SheetLoadingHint active={isLoading} />
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="card p-8 border-l-[3px] text-center max-w-sm" style={{ borderLeftColor: 'var(--surface-5)' }}>
              <p className="label-xs text-txt-tertiary mb-2">Status</p>
              <p className="text-xl font-bold text-txt-primary mb-2">Saved &amp; Moved to Trash</p>
              <p className="text-sm text-txt-secondary">Player overalls have been updated.</p>
            </div>
          </div>
        ) : sheetId ? (
          <div className="flex-1 flex flex-col overflow-hidden gap-3">
            <SheetModalAIHero
              tagline="Skip the typing. Let AI fill the training results."
              buttons={[{ label: 'Copy AI Prompt', onClick: () => setShowAIPrompt(true) }]}
            />
            {isMobile || !useEmbedded ? (
              <SheetManualEntry sheetId={sheetId} whatToDo="Enter training results" />
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden min-h-0 border border-surface-4 rounded-lg">
                <iframe
                  src={embedUrl}
                  className="w-full h-full"
                  title="Training Results Sheet"
                />
              </div>
            )}
            <div className="flex flex-wrap gap-2 items-center pt-1">
              <button onClick={handleSyncAndDelete} disabled={syncing || deletingSheet} className={`px-4 py-2 rounded-lg font-semibold text-sm hover:opacity-90 transition-all disabled:opacity-60 ${highlightSave ? 'animate-pulse ring-4 ring-offset-2 scale-105' : ''}`} style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}>{deletingSheet ? 'Saving…' : 'Save & Move to Trash'}</button>
              <button onClick={handleSyncFromSheet} disabled={syncing || deletingSheet} className="px-4 py-2 rounded-lg font-semibold text-sm border border-surface-4 hover:bg-surface-2 text-txt-primary disabled:opacity-60 transition-colors">{syncing ? 'Syncing…' : 'Save & Keep Sheet'}</button>
              <button onClick={handleDeleteSheetOnly} disabled={syncing || deletingSheet || regenerating} className="px-4 py-2 rounded-lg font-semibold text-sm border border-surface-4 hover:bg-surface-2 text-txt-secondary disabled:opacity-60 transition-colors ml-auto">{deletingSheet ? 'Deleting…' : 'Delete Sheet (No Save)'}</button>
              <button onClick={handleRegenerateSheet} disabled={syncing || deletingSheet || regenerating} className="px-4 py-2 rounded-lg font-semibold text-sm border hover:bg-surface-2 transition-colors disabled:opacity-60" style={{ backgroundColor: 'transparent', borderColor: 'var(--accent-error)', color: 'var(--accent-error)' }}>{regenerating ? 'Regenerating…' : 'Regenerate'}</button>
            </div>
            {!isMobile && (
              <div className="flex items-center justify-end">
                <button onClick={() => { const newValue = !useEmbedded; setUseEmbedded(newValue); localStorage.setItem('sheetEmbedPreference', newValue.toString()); }} className="text-[11px] px-2.5 py-1 rounded-full border border-surface-4 text-txt-tertiary hover:text-txt-secondary hover:border-surface-5 transition-colors bg-transparent">{useEmbedded ? '← Back to default view' : 'Try embedded view (beta)'}</button>
              </div>
            )}
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
        title={`${currentYear} Training Results`}
        prompt={aiPrompt}
        pasteTarget={`Cell A2 of the "Training Results" tab`}
      />
    </div>,
    document.body,
  )
}
