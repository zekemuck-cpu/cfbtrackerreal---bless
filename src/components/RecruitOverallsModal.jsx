import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import AuthErrorModal from './AuthErrorModal'
import { useAuthErrorHandler } from '../hooks/useAuthErrorHandler'
import AIPromptModal from './AIPromptModal'
import SheetToolbar from './SheetToolbar'
import {
  createRecruitOverallsSheet,
  readRecruitOverallsFromSheet,
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

export default function RecruitOverallsModal({ isOpen, onClose, onSave, currentYear, teamColors, recruits }) {
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

  const [useEmbedded, setUseEmbedded] = useState(() => {
    return localStorage.getItem('sheetEmbedPreference') === 'true'
  })
  const [highlightSave, setHighlightSave] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [showAIPrompt, setShowAIPrompt] = useState(false)

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} Recruiting Class Overalls`,
    structure: `This sheet has ONE tab: "Recruit Overalls".
Row 1 (header) and Columns A–D (Name, Position, Class, Stars) are PRE-FILLED and PROTECTED. Recruits are already listed in alphabetical order by last name in column A. You output ONLY two values per recruit: Overall (col E) and Jersey # (col F).

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. Output ONLY columns E and F. NEVER output columns A, B, C, or D. NEVER output the header row.
2. ROW ORDER IS FIXED. Produce exactly one output line per pre-filled recruit, in the SAME ORDER as column A in the screenshots. Do NOT reorder, skip, or add rows.
3. Exactly TWO tab-separated values per line: <Overall>\\t<Jersey #>.
4. NO COMMAS in numbers. Output "85" — never "85.0", "85pts", or "85,".
5. INTEGERS only. No decimals, no quotes, no units.
6. BLANK for unknown values — never guess, never use 0, "-", or "N/A". An empty cell = blank. For a line where Overall is known but Jersey # is not, output:  85\\t  (tab then nothing).
7. Overall range: 40–99. Jersey # range: 0–99.
8. No header row, no commentary. ONE TSV block.

═══════════════════════════════════════════════════════════
TAB: "Recruit Overalls"
Paste at cell E2 of the "Recruit Overalls" tab
═══════════════════════════════════════════════════════════

Col | Header (protected)  | Your output                                | Format
----+---------------------+--------------------------------------------+---------------------
 A  | Name                | — (pre-filled, do NOT output)              | protected
 B  | Position            | — (pre-filled, do NOT output)              | protected
 C  | Class               | — (pre-filled, do NOT output)              | protected
 D  | Stars               | — (pre-filled, do NOT output)              | protected
 E  | Overall             | Integer 40–99                              | integer, no commas
 F  | Jersey #            | Integer 0–99 (blank if not visible)        | integer, no commas

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== RECRUIT OVERALLS — paste at cell E2 of "Recruit Overalls" tab ===
<Overall>\\t<Jersey #>
<Overall>\\t<Jersey #>
...
(one line per recruit, same order as column A in the screenshots)

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] Line count exactly equals the number of pre-filled recruit rows visible in the screenshots
[ ] Every line has EXACTLY one tab character (two values: Overall then Jersey #)
[ ] Every Overall is an integer 40–99, or blank
[ ] Every Jersey # is an integer 0–99, or blank
[ ] No commas, no decimals, no quotes, no units
[ ] Row order matches column A alphabetical-by-last-name order exactly
[ ] Blank cells for unknowns — invented nothing`,
    includeTeamMap: false,
  }), [currentYear])

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

  // Create recruit overalls sheet when modal opens
  useEffect(() => {
    const createSheet = async () => {
      if (isOpen && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote) {
        // Check if we have an existing sheet
        const existingSheetId = currentDynasty?.recruitOverallsSheetId
        if (existingSheetId) {
          const stillExists = await sheetExists(existingSheetId)
          if (stillExists) {
            setSheetId(existingSheetId)
            return
          }
          await updateDynasty(currentDynasty.id, { recruitOverallsSheetId: null })
          // stale sheet (trashed in Drive); fall through to regenerate
        }

        // Set ref immediately to prevent concurrent calls (state updates are async)
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          const sheetInfo = await createRecruitOverallsSheet(
            currentDynasty?.teamName || 'Dynasty',
            currentYear,
            recruits || []
          )
          setSheetId(sheetInfo.spreadsheetId)

          // Save sheet ID to dynasty
          await updateDynasty(currentDynasty.id, {
            recruitOverallsSheetId: sheetInfo.spreadsheetId
          })
        } catch (error) {
          console.error('Failed to create recruit overalls sheet:', error)
          auth.handleError(error)
        } finally {
          setCreatingSheet(false)
          creatingSheetRef.current = false
        }
      }
    }

    createSheet()
  }, [isOpen, user, sheetId, creatingSheet, currentDynasty?.id, auth.retryCount, showDeletedNote, recruits, currentYear])

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
      const recruitOveralls = await readRecruitOverallsFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(recruitOveralls)
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
      const recruitOveralls = await readRecruitOverallsFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(recruitOveralls)

      await deleteGoogleSheet(sheetId)
      await updateDynasty(currentDynasty.id, { recruitOverallsSheetId: null })

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
      await updateDynasty(currentDynasty.id, { recruitOverallsSheetId: null })
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

  const handleClose = () => {
    onClose()
  }

  if (!isOpen) return null

  const embedUrl = sheetId ? getSheetEmbedUrl(sheetId, 'Recruit Overalls') : null
  const isLoading = creatingSheet

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4"
      style={{ margin: 0 }}
      onMouseDown={handleClose}
    >
      <div
        className="card-elevated w-full sm:w-[95vw] max-h-[calc(100dvh-4rem)] sm:h-[95dvh] flex flex-col overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-surface-4">
          <h2 className="text-2xl font-bold text-txt-primary">
            Recruiting Class Overalls
          </h2>
          <button aria-label="Close"
            onClick={handleClose}
            className="text-txt-tertiary hover:text-txt-primary transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

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
                Creating Recruiting Class Sheet...
              </p>
              <p className="text-sm mt-2 text-txt-secondary">
                Loading your incoming recruits and transfers
              </p>
              <SheetLoadingHint active={isLoading} />
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="card p-8 border-l-[3px] text-center max-w-sm" style={{ borderLeftColor: 'var(--surface-5)' }}>
              <p className="label-xs text-txt-tertiary mb-2">Status</p>
              <p className="text-xl font-bold text-txt-primary mb-2">
                Saved & Moved to Trash
              </p>
              <p className="text-sm text-txt-secondary">
                Recruiting class overalls have been saved.
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
                      color: 'var(--surface-1)'
                    }}
                  >
                    {deletingSheet ? 'Saving...' : 'Save & Move to Trash'}
                  </button>
                  <button
                    onClick={handleSyncFromSheet}
                    disabled={syncing || deletingSheet}
                    className="btn btn-secondary text-sm"
                  >
                    {syncing ? 'Syncing...' : 'Save & Keep Sheet'}
                  </button>
                  <button
                    onClick={() => setShowAIPrompt(true)}
                    className="px-4 py-2 rounded-lg text-sm font-medium border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent"
                  >
                    AI Prompt
                  </button>
                  <button
                    onClick={handleRegenerateSheet}
                    disabled={syncing || deletingSheet || regenerating}
                    className="px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-colors text-sm border-2 ml-auto"
                    style={{
                      backgroundColor: 'transparent',
                      borderColor: '#EF4444',
                      color: '#EF4444'
                    }}
                  >
                    {regenerating ? 'Regenerating...' : 'Regenerate sheet'}
                  </button>
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
                  className="text-xs px-3 py-1 rounded-full border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-txt-tertiary transition-colors"
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
                  <svg className="w-10 h-10" fill="none" stroke={'var(--surface-1)'} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>

                <h3 className="text-xl font-bold mb-3 text-txt-primary">
                  Enter Recruiting Class Overalls
                </h3>

                {/* Step-by-step instructions */}
                <div className="text-left mb-6 max-w-xs">
                  <p className="text-sm font-semibold mb-2 text-txt-primary">
                    Instructions:
                  </p>
                  <ol className="text-sm space-y-1.5 text-txt-secondary">
                    <li className="flex gap-2">
                      <span className="font-bold">1.</span>
                      <span>Tap the button below to open Google Sheets</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold">2.</span>
                      <span>Enter the Overall rating for each recruit</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold">3.</span>
                      <span>Return to this app when done</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold">4.</span>
                      <span>Tap "Save" below to save overalls</span>
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
                  <button
                    onClick={() => setShowAIPrompt(true)}
                    className="px-5 py-3 rounded-lg text-sm font-medium border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent"
                  >
                    AI Prompt
                  </button>
                </div>

                {/* Centered Save Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 items-center justify-center mb-4">
                  <button
                    onClick={handleSyncAndDelete}
                    disabled={syncing || deletingSheet}
                    className={`px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-all text-sm ${highlightSave ? 'animate-pulse ring-4 ring-offset-2 scale-105' : ''}`}
                    style={{
                      backgroundColor: 'var(--text-primary)',
                      color: 'var(--surface-1)'
                    }}
                  >
                    {deletingSheet ? 'Saving...' : 'Save & Move to Trash'}
                  </button>
                  <button
                    onClick={handleSyncFromSheet}
                    disabled={syncing || deletingSheet}
                    className="btn btn-secondary px-6 py-3 text-sm"
                  >
                    {syncing ? 'Syncing...' : 'Save & Keep Sheet'}
                  </button>
                </div>
                {/* Start Over Button */}
                <button
                  onClick={handleRegenerateSheet}
                  disabled={syncing || deletingSheet || regenerating}
                  className="text-xs px-4 py-2 rounded-lg font-medium hover:opacity-90 transition-colors border mb-4"
                  style={{
                    backgroundColor: 'transparent',
                    borderColor: '#EF4444',
                    color: '#EF4444'
                  }}
                >
                  {regenerating ? 'Regenerating...' : 'Messed up? Regenerate sheet'}
                </button>

                <div className="text-xs p-3 rounded-lg max-w-xs bg-surface-2 text-txt-secondary border-l-[3px]" style={{ borderLeftColor: 'var(--surface-5)' }}>
                  <p className="font-semibold mb-1 text-txt-primary">Note:</p>
                  <p>Enter the overall rating for each incoming recruit after they've gone through summer workouts. These overalls will be saved to their player profiles.</p>
                </div>
              </div>
            ) : null}
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
      <AIPromptModal
        isOpen={showAIPrompt}
        onClose={() => setShowAIPrompt(false)}
        title={`${currentYear} Recruiting Class Overalls`}
        prompt={aiPrompt}
        pasteTarget={`Cell E2 of the "Recruit Overalls" tab`}
      />
    </div>,
    document.body,
  )
}
