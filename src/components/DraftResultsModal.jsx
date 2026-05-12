import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty, isPlayerOnRoster } from '../context/DynastyContext'
import { getCurrentTeamTid } from '../data/teamRegistry'
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
  createDraftResultsSheet,
  readDraftResultsFromSheet,
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

export default function DraftResultsModal({ isOpen, onClose, onSave, currentYear, teamColors }) {
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
  const [noDraftDeclarees, setNoDraftDeclarees] = useState(false)
  const [showAIPrompt, setShowAIPrompt] = useState(false)

  const userRoster = useMemo(() => {
    // Teambuilder-safe: filter by TID + pass dynasty for abbr fallback
    const teamTid = getCurrentTeamTid(currentDynasty)
    const teamAbbrForRoster =
      currentDynasty?.teams?.[currentDynasty?.currentTid]?.abbr ||
      currentDynasty?.teamName
    const all = currentDynasty?.players || []
    return all
      .filter(p => isPlayerOnRoster(p, teamTid ?? teamAbbrForRoster, currentYear, currentDynasty))
      .map(p => ({ name: p.name, jerseyNumber: p.jerseyNumber, position: p.position }))
  }, [currentDynasty?.players, currentDynasty?.teams, currentDynasty?.currentTid, currentDynasty?.teamName, currentYear, currentDynasty])

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} Draft Results`,
    roster: userRoster,
    structure: `This sheet has ONE tab: "Draft Results".
Row 1 (header) and columns A–C (Player, Position, Overall) are PRE-FILLED. Players who declared for the draft are listed in column A, sorted by Overall DESCENDING. You output ONE value per player: the Draft Round in column D (a strict dropdown).

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. Output ONLY column D. NEVER output columns A, B, or C. NEVER output the header row.
2. ROW ORDER IS FIXED. Exactly one line per pre-filled player row, in the SAME ORDER as column A appears in the screenshots. Do NOT reorder, skip, or add rows.
3. Exactly ONE value per line: the Draft Round string. No tabs, no numbers alone, no commas, no extra text.
4. Column D is a STRICT DROPDOWN. Use EXACTLY one of the 8 literal values listed below — case-sensitive, with the space between number and "Round". Any other text is rejected.
5. BLANK LINE if a player's draft round is unknown or not visible in the screenshots — never guess. Blank preserves row alignment.
6. No header row, no totals, no commentary. ONE single-column TSV block.

═══════════════════════════════════════════════════════════
TAB: "Draft Results"
Paste at cell D2 of the "Draft Results" tab
═══════════════════════════════════════════════════════════

Col | Header (protected)  | Your output                              | Format
----+---------------------+------------------------------------------+-------------------
 A  | Player              | — (pre-filled, do NOT output)            | protected
 B  | Position            | — (pre-filled, do NOT output)            | protected
 C  | Overall             | — (pre-filled, do NOT output)            | protected
 D  | Draft Round         | EXACT dropdown string, one of the 8 below| strict dropdown

═══════════════════════════════════════════════════════════
ENUMERATED DROPDOWN VALUES for column D (use EXACTLY — case-sensitive, with the space)
═══════════════════════════════════════════════════════════
  1st Round
  2nd Round
  3rd Round
  4th Round
  5th Round
  6th Round
  7th Round
  Undrafted

NOT allowed: "Round 1", "R1", "1st round", "1", "1st", "1st-round", "first round".

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== DRAFT RESULTS — paste at cell D2 of "Draft Results" tab ===
<Draft Round>
<Draft Round>
<Draft Round>
...
(one line per player, same order as column A in the screenshots; blank line = unknown)

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] Line count exactly equals the number of pre-filled player rows visible in the screenshots (including blank lines for unknowns)
[ ] Every non-blank line is EXACTLY one of: 1st Round, 2nd Round, 3rd Round, 4th Round, 5th Round, 6th Round, 7th Round, Undrafted
[ ] Exact capitalization: "1st Round" (capital R), "Undrafted" (capital U)
[ ] NO tabs, NO extra text, NO commentary on any line
[ ] Row order matches column A in the screenshots exactly
[ ] Blank lines for unknown players — did not invent any values`,
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

  // Create draft results sheet when modal opens
  useEffect(() => {
    const createSheet = async () => {
      if (isOpen && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote && !noDraftDeclarees) {
        // Check if we have an existing sheet for this year
        const existingSheetId = currentDynasty?.draftResultsSheetId
        if (existingSheetId) {
          const stillExists = await sheetExists(existingSheetId)
          if (stillExists) {
            setSheetId(existingSheetId)
            return
          }
          await updateDynasty(currentDynasty.id, { draftResultsSheetId: null })
          // stale sheet (trashed in Drive); fall through to regenerate
        }

        // Check if there are any draft declarees
        const playersLeavingThisYear = currentDynasty?.playersLeavingByYear?.[currentYear] || []
        const draftDeclarees = playersLeavingThisYear.filter(p => p.reason === 'Pro Draft')

        if (draftDeclarees.length === 0) {
          setNoDraftDeclarees(true)
          return
        }

        // Set ref immediately to prevent concurrent calls (state updates are async)
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          const sheetInfo = await createDraftResultsSheet(
            currentDynasty?.teamName || 'Dynasty',
            currentYear,
            playersLeavingThisYear,
            currentDynasty?.players || []
          )
          setSheetId(sheetInfo.spreadsheetId)

          // Save sheet ID to dynasty
          await updateDynasty(currentDynasty.id, {
            draftResultsSheetId: sheetInfo.spreadsheetId
          })
        } catch (error) {
          console.error('Failed to create draft results sheet:', error)
          auth.handleError(error)
        } finally {
          setCreatingSheet(false)
          creatingSheetRef.current = false
        }
      }
    }

    createSheet()
  }, [isOpen, user, sheetId, creatingSheet, currentDynasty?.id, auth.retryCount, showDeletedNote, noDraftDeclarees, currentYear])

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShowDeletedNote(false)
      setNoDraftDeclarees(false)
      creatingSheetRef.current = false
    }
  }, [isOpen])

  const handleSyncFromSheet = async () => {
    if (!sheetId) return

    setSyncing(true)
    try {
      const draftResults = await readDraftResultsFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(draftResults)
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
      const draftResults = await readDraftResultsFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(draftResults)

      await deleteGoogleSheet(sheetId)
      await updateDynasty(currentDynasty.id, { draftResultsSheetId: null })

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
      await updateDynasty(currentDynasty.id, { draftResultsSheetId: null })
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
      title: 'Delete this draft results sheet?',
      message: 'This deletes the Google Sheet without applying any edits. Your dynasty draft results stay as-is.',
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (!ok) return
    setDeletingSheet(true)
    try {
      await deleteGoogleSheet(sheetId)
      await updateDynasty(currentDynasty.id, { draftResultsSheetId: null })
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

  const handleSkip = async () => {
    // No draft declarees, just save empty results and close
    await onSave([])
    onClose()
  }

  if (!isOpen) return null

  const embedUrl = sheetId ? getSheetEmbedUrl(sheetId, 'Draft Results') : null
  const isLoading = creatingSheet

  // Get count of draft declarees for display
  const playersLeavingThisYear = currentDynasty?.playersLeavingByYear?.[currentYear] || []
  const draftDeclareesCount = playersLeavingThisYear.filter(p => p.reason === 'Pro Draft').length

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
        <SheetModalHeader eyebrow="Offseason" title={`${currentYear} Draft Results`} onClose={handleClose} />

        <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6">
        {noDraftDeclarees ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="card p-8 border-l-[3px] text-center max-w-sm" style={{ borderLeftColor: 'var(--surface-5)' }}>
              <p className="label-xs text-txt-tertiary mb-2">Status</p>
              <p className="text-xl font-bold text-txt-primary mb-2">
                No Draft Declarees
              </p>
              <p className="text-sm mb-6 text-txt-secondary">
                No players declared for the Pro Draft this year.
              </p>
              <button
                onClick={handleSkip}
                className="px-6 py-3 rounded-lg font-semibold hover:opacity-90"
                style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}
              >
                Continue
              </button>
            </div>
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
              <p className="text-lg font-semibold text-txt-primary">
                Creating Draft Results Sheet...
              </p>
              <p className="text-sm mt-2 text-txt-secondary">
                Pre-filling {draftDeclareesCount} draft declaree{draftDeclareesCount !== 1 ? 's' : ''}
              </p>
              <SheetLoadingHint active={isLoading} />
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="card p-8 border-l-[3px] text-center max-w-sm" style={{ borderLeftColor: 'var(--surface-5)' }}>
              <p className="label-xs text-txt-tertiary mb-2">Status</p>
              <p className="text-xl font-bold text-txt-primary mb-2">Saved &amp; Moved to Trash</p>
              <p className="text-sm text-txt-secondary">Draft results saved to your dynasty.</p>
            </div>
          </div>
        ) : sheetId ? (
          <div className="flex-1 flex flex-col overflow-hidden gap-3">
            <SheetModalAIHero
              tagline="Skip the typing. Let AI fill the draft results."
              buttons={[{ label: 'Copy AI Prompt', onClick: () => setShowAIPrompt(true) }]}
            />
            {isMobile || !useEmbedded ? (
              <SheetManualEntry sheetId={sheetId} whatToDo="Enter draft results" />
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden min-h-0 border border-surface-4 rounded-lg">
                <iframe
                  src={embedUrl}
                  className="w-full h-full"
                  title="Draft Results Sheet"
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
        title={`${currentYear} Draft Results`}
        prompt={aiPrompt}
        pasteTarget={`Cell D2 of the "Draft Results" tab`}
      />
    </div>,
    document.body,
  )
}
