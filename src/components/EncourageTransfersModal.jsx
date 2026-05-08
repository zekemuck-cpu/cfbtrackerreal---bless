import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty, isPlayerOnRoster } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import AuthErrorModal from './AuthErrorModal'
import { useAuthErrorHandler } from '../hooks/useAuthErrorHandler'
import AIPromptModal from './AIPromptModal'
import SheetToolbar from './SheetToolbar'
import { getModalColors } from '../utils/colorUtils'
import {
  createEncourageTransfersSheet,
  readEncourageTransfersFromSheet,
  deleteGoogleSheet,
  getSheetEmbedUrl,
  sheetExists
} from '../services/sheetsService'
import { buildAIPrompt } from '../utils/aiPrompt'
import SheetLoadingHint from './SheetLoadingHint'

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export default function EncourageTransfersModal({ isOpen, onClose, onSave, currentYear, teamColors, players }) {
  const { currentDynasty, updateDynasty } = useDynasty()
  const { user, signOut } = useAuth()
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

  const userRoster = useMemo(() => {
    const teamAbbrForRoster =
      currentDynasty?.teams?.[currentDynasty?.currentTid]?.abbr ||
      currentDynasty?.teamName
    const all = currentDynasty?.players || []
    return all
      .filter(p => isPlayerOnRoster(p, teamAbbrForRoster, currentYear))
      .map(p => ({ name: p.name, jerseyNumber: p.jerseyNumber, position: p.position }))
  }, [currentDynasty?.players, currentDynasty?.teams, currentDynasty?.currentTid, currentDynasty?.teamName, currentYear])

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} Encourage Transfers`,
    roster: userRoster,
    structure: `This sheet has ONE tab: "Encourage Transfers". It has 4 columns total (A–D) and one row per roster player (row 2 onward). Row 1 is the protected header row. Columns A (Name), B (Position), C (Overall) are PRE-FILLED from dynasty data and PROTECTED — do NOT output them. Only column D is editable.

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. Output ONLY column D. NEVER output columns A, B, C, or the header row.
2. Output format is a SINGLE column of values — one value per line — NO tabs, NO commas, NO extra columns.
3. Row order must match the pre-filled rows EXACTLY, from top to bottom as shown in the sheet screenshot. One line per pre-filled player. If the sheet shows N players, output EXACTLY N lines.
4. Every value MUST be the literal string TRUE or FALSE — uppercase, no quotes, no period. Do NOT write "True", "true", "1", "0", "yes", "no", "Y", "N", a checkbox character, or a blank.
5. TRUE means "encourage this player to transfer out". FALSE means "keep this player / do not encourage transfer". Use FALSE as the default — only mark TRUE when you are confident the coach should push this player out.
6. No blank lines, no header row, no commentary, no totals, no explanation.
7. NEVER leave a line blank. Every player row must receive either TRUE or FALSE (when uncertain, use FALSE).

═══════════════════════════════════════════════════════════
TAB: "Encourage Transfers" — paste at cell D2 of the "Encourage Transfers" tab
═══════════════════════════════════════════════════════════

Column layout (single editable column):

Col | Header (row 1, protected) | Pre-filled / protected?      | Your value
----+---------------------------+------------------------------+---------------------------
 A  | Name                      | Pre-filled — PROTECTED       | DO NOT OUTPUT
 B  | Position                  | Pre-filled — PROTECTED       | DO NOT OUTPUT
 C  | Overall                   | Pre-filled — PROTECTED       | DO NOT OUTPUT
 D  | Encourage Transfer        | Empty checkbox — EDITABLE    | TRUE or FALSE (literal, uppercase)

───────────────────────────────────────────────────────────
COLUMN D — Encourage Transfer — MUST be one of these 2 values EXACTLY:
TRUE
FALSE
(Uppercase only. No quotes. No period. These values paste into Google Sheets checkbox cells as checked (TRUE) or unchecked (FALSE).)

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== ENCOURAGE TRANSFERS — paste at cell D2 of "Encourage Transfers" tab ===
<TRUE or FALSE>
<TRUE or FALSE>
<TRUE or FALSE>
…one line per pre-filled player, in the exact order shown in the screenshots

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] Exactly N lines, where N = number of pre-filled player rows visible in the screenshots
[ ] Every line is either the literal TRUE or the literal FALSE (uppercase, no quotes)
[ ] No tabs, no commas, no other columns
[ ] No blank lines
[ ] No header row, no commentary, no totals
[ ] Default to FALSE when uncertain — never blank, never guess TRUE`,
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

  // Create encourage transfers sheet when modal opens
  useEffect(() => {
    const createSheet = async () => {
      if (isOpen && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote) {
        // Check if we have an existing sheet for this year
        const existingSheetId = currentDynasty?.encourageTransfersSheetId
        if (existingSheetId) {
          const stillExists = await sheetExists(existingSheetId)
          if (stillExists) {
            setSheetId(existingSheetId)
            return
          }
          await updateDynasty(currentDynasty.id, { encourageTransfersSheetId: null })
          // stale sheet (trashed in Drive); fall through to regenerate
        }

        // Set ref immediately to prevent concurrent calls (state updates are async)
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          const sheetInfo = await createEncourageTransfersSheet(
            currentDynasty?.teamName || 'Dynasty',
            currentYear,
            players || []
          )
          setSheetId(sheetInfo.spreadsheetId)

          // Save sheet ID to dynasty
          await updateDynasty(currentDynasty.id, {
            encourageTransfersSheetId: sheetInfo.spreadsheetId
          })
        } catch (error) {
          console.error('Failed to create encourage transfers sheet:', error)
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
      const transferPlayers = await readEncourageTransfersFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(transferPlayers)
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
      const transferPlayers = await readEncourageTransfersFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(transferPlayers)

      await deleteGoogleSheet(sheetId)
      await updateDynasty(currentDynasty.id, { encourageTransfersSheetId: null })

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
      await updateDynasty(currentDynasty.id, { encourageTransfersSheetId: null })
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
      title: 'Delete this encourage transfers sheet?',
      message: 'This deletes the Google Sheet without applying any edits. Your dynasty roster stays as-is.',
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (!ok) return
    setDeletingSheet(true)
    try {
      await deleteGoogleSheet(sheetId)
      await updateDynasty(currentDynasty.id, { encourageTransfersSheetId: null })
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

  const embedUrl = sheetId ? getSheetEmbedUrl(sheetId, 'Encourage Transfers') : null
  const isLoading = creatingSheet

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-60 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4"
      style={{ margin: 0 }}
      onMouseDown={handleClose}
    >
      <div
        className="rounded-xl border shadow-xl w-full sm:w-[95vw] max-h-[calc(100dvh-4rem)] sm:h-[95dvh] flex flex-col p-4 sm:p-6"
        style={{ backgroundColor: modalColors.background, borderColor: modalColors.border }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Encourage Transfers
          </h2>
          <button aria-label="Close"
            onClick={handleClose}
            className="hover:opacity-70"
            style={{ color: 'var(--text-primary)' }}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

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
              <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                Creating Encourage Transfers Sheet...
              </p>
              <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
                Loading roster for transfer selection
              </p>
              <SheetLoadingHint active={isLoading} />
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center p-8 rounded-lg" style={{ backgroundColor: 'var(--text-primary)' }}>
              <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke={modalColors.background} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-xl font-bold mb-2" style={{ color: modalColors.background }}>
                Saved & Moved to Trash!
              </p>
              <p className="text-sm" style={{ color: modalColors.background, opacity: 0.9 }}>
                Players marked for transfer have been recorded.
              </p>
            </div>
          </div>
        ) : sheetId ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Action Buttons - only show at top for embedded view */}
            {!isMobile && useEmbedded && (
              <div className="mb-3">
                <div className="flex gap-3 flex-wrap items-center">
                  <button
                    onClick={handleSyncAndDelete}
                    disabled={syncing || deletingSheet}
                    className={`px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-all text-sm ${highlightSave ? 'animate-pulse ring-4 ring-offset-2 scale-105' : ''}`}
                    style={{
                      backgroundColor: 'var(--text-primary)',
                      color: modalColors.background
                    }}
                  >
                    {deletingSheet ? 'Saving...' : 'Save & Move to Trash'}
                  </button>
                  <button
                    onClick={handleSyncFromSheet}
                    disabled={syncing || deletingSheet}
                    className="px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-colors text-sm border-2"
                    style={{
                      backgroundColor: 'transparent',
                      borderColor: 'var(--text-primary)',
                      color: 'var(--text-primary)'
                    }}
                  >
                    {syncing ? 'Syncing...' : 'Save & Keep Sheet'}
                  </button>
                  <button onClick={() => setShowAIPrompt(true)} className="px-4 py-2 rounded-lg text-sm font-medium border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent">AI Prompt</button>
                  <button
                    onClick={handleDeleteSheetOnly}
                    disabled={syncing || deletingSheet || regenerating}
                    className="px-4 py-2 rounded-lg font-semibold text-sm disabled:opacity-60 transition-colors border border-surface-4 hover:bg-surface-2 text-txt-secondary ml-auto"
                  >
                    {deletingSheet ? 'Deleting…' : 'Delete Sheet (No Save)'}
                  </button>
                  <button
                    onClick={handleRegenerateSheet}
                    disabled={syncing || deletingSheet || regenerating}
                    className="px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-colors text-sm border-2"
                    style={{
                      backgroundColor: 'transparent',
                      borderColor: '#EF4444',
                      color: '#EF4444'
                    }}
                  >
                    {regenerating ? 'Regenerating...' : 'Regenerate sheet'}
                  </button>
                  {highlightSave && (
                    <span className="text-xs font-medium animate-bounce" style={{ color: 'var(--text-primary)' }}>

                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Toggle between embedded and new tab */}
            {!isMobile && (
              <div className="flex items-center justify-end mb-2">
                <button
                  onClick={() => {
                    const newValue = !useEmbedded
                    setUseEmbedded(newValue)
                    localStorage.setItem('sheetEmbedPreference', newValue.toString())
                  }}
                  className="text-xs px-3 py-1 rounded-full border transition-colors"
                  style={{
                    borderColor: 'var(--text-primary)',
                    color: 'var(--text-primary)',
                    backgroundColor: 'transparent'
                  }}
                >
                  {useEmbedded ? '← Back to default view' : 'Try embedded view (beta)'}
                </button>
              </div>
            )}

            {/* Mobile View - Open in Google Sheets button */}
            {isMobile || !useEmbedded ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
                  style={{ backgroundColor: 'var(--text-primary)' }}
                >
                  <svg className="w-10 h-10" fill="none" stroke={modalColors.background} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </div>

                <h3 className="text-xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
                  Mark Players to Transfer
                </h3>

                <div className="text-left mb-6 max-w-xs">
                  <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                    Instructions:
                  </p>
                  <ol className="text-sm space-y-1.5" style={{ color: 'var(--text-secondary)' }}>
                    <li className="flex gap-2">
                      <span className="font-bold">1.</span>
                      <span>Tap the button below to open Google Sheets</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold">2.</span>
                      <span>Check the "Encourage Transfer" box for players you want to leave</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold">3.</span>
                      <span>Return to this app when done</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold">4.</span>
                      <span>Tap "Save" below to record transfers</span>
                    </li>
                  </ol>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3 mb-6">
                  <a
                    href={`https://docs.google.com/spreadsheets/d/${sheetId}/edit`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-6 py-3 rounded-lg font-bold text-lg hover:opacity-90 transition-colors flex items-center gap-2"
                    style={{
                      backgroundColor: '#0F9D58',
                      color: '#FFFFFF'
                    }}
                  >
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/>
                      <path d="M7 7h2v2H7zm0 4h2v2H7zm0 4h2v2H7zm4-8h6v2h-6zm0 4h6v2h-6zm0 4h6v2h-6z"/>
                    </svg>
                    Open Google Sheets
                  </a>
                  <button onClick={() => setShowAIPrompt(true)} className="px-5 py-3 rounded-lg text-sm font-medium border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent">AI Prompt</button>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 items-center justify-center mb-4">
                  <button
                    onClick={handleSyncAndDelete}
                    disabled={syncing || deletingSheet}
                    className={`px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-all text-sm ${highlightSave ? 'animate-pulse ring-4 ring-offset-2 scale-105' : ''}`}
                    style={{
                      backgroundColor: 'var(--text-primary)',
                      color: modalColors.background
                    }}
                  >
                    {deletingSheet ? 'Saving...' : 'Save & Move to Trash'}
                  </button>
                  <button
                    onClick={handleSyncFromSheet}
                    disabled={syncing || deletingSheet}
                    className="px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-colors text-sm border-2"
                    style={{
                      backgroundColor: 'transparent',
                      borderColor: 'var(--text-primary)',
                      color: 'var(--text-primary)'
                    }}
                  >
                    {syncing ? 'Syncing...' : 'Save & Keep Sheet'}
                  </button>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 items-center justify-center mb-4">
                  <button
                    onClick={handleDeleteSheetOnly}
                    disabled={syncing || deletingSheet || regenerating}
                    className="text-xs px-4 py-2 rounded-lg font-medium transition-colors border border-surface-4 hover:bg-surface-2 text-txt-secondary disabled:opacity-60"
                  >
                    {deletingSheet ? 'Deleting…' : 'Delete Sheet (No Save)'}
                  </button>
                  <button
                    onClick={handleRegenerateSheet}
                    disabled={syncing || deletingSheet || regenerating}
                    className="text-xs px-4 py-2 rounded-lg font-medium hover:opacity-90 transition-colors border"
                    style={{
                      backgroundColor: 'transparent',
                      borderColor: '#EF4444',
                      color: '#EF4444'
                    }}
                  >
                    {regenerating ? 'Regenerating...' : 'Messed up? Regenerate sheet'}
                  </button>
                </div>
                {highlightSave && (
                  <span className="text-sm font-medium animate-bounce mb-4" style={{ color: 'var(--text-primary)' }}>

                  </span>
                )}

                <div className="text-xs p-3 rounded-lg max-w-xs" style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)' }}>
                  <p className="font-semibold mb-1">Note:</p>
                  <p style={{ color: 'var(--text-secondary)' }}>Players you encourage to transfer will be removed from next season's roster. They will still appear in your historical records.</p>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Auth Error Modal */}
      <AuthErrorModal
        isOpen={auth.showAuthError}
        onClose={auth.closeAuthError}
        onRefresh={auth.retry}
        teamColors={teamColors}
      />
      <AIPromptModal isOpen={showAIPrompt} onClose={() => setShowAIPrompt(false)} title={`${currentYear} Encourage Transfers`} prompt={aiPrompt} pasteTarget={`Cell D2 of the "Encourage Transfers" tab`} />
    </div>,
    document.body,
  )
}
