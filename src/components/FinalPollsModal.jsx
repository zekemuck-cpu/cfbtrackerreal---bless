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
import { getModalColors } from '../utils/colorUtils'
import { buildAIPrompt } from '../utils/aiPrompt'
import SheetLoadingHint from './SheetLoadingHint'
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

  const [useEmbedded, setUseEmbedded] = useState(() => {
    return localStorage.getItem('sheetEmbedPreference') === 'true'
  })
  const [highlightSave, setHighlightSave] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [showAIPrompt, setShowAIPrompt] = useState(false)

  const creatingSheetRef = useRef(false)
  const modalColors = useMemo(() => getModalColors(teamColors), [teamColors])

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} Final Top 25 Poll`,
    structure: `This sheet has ONE tab named "Polls". 2 columns, 26 rows: row 1 is a protected header, rows 2-26 are ranks 1-25.

Column A (rank number 1-25) is PRE-FILLED — you never output it.
You fill column B (Top 25 team for that rank).

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. Output ONLY column B (one team abbreviation per line). NEVER output column A (rank), the header row, or any rank labels.
2. Row order is FIXED: rank 1 first, rank 25 last. EXACTLY 25 lines of output.
3. Each line has EXACTLY 1 field: <Team abbreviation>
4. Team values must be UPPERCASE abbreviations from the mapping at the bottom — NEVER full names or nicknames.
5. NO COMMAS. No commentary. No rank numbers. No header row. No tabs.
6. Each team abbreviation must appear AT MOST ONCE across all 25 ranks — no duplicates in the poll.
7. BLANK line for unknown ranks (just an empty line between two filled ranks). Never guess.
8. ONE block. Label it with paste target.

═══════════════════════════════════════════════════════════
TAB "Polls" — 25 rows × 1 output column
Paste at cell B2 of the "Polls" tab
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
<Team abbreviation>

Field format:
- Top 25 team (strict dropdown) — UPPERCASE abbreviation from the team mapping at the bottom (e.g. OSU, BAMA, UGA). One team per rank. Blank if unknown.

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== FINAL POLL — paste at cell B2 of "Polls" tab ===
<rank 1 abbr>
<rank 2 abbr>
<rank 3 abbr>
<rank 4 abbr>
<rank 5 abbr>
<rank 6 abbr>
<rank 7 abbr>
<rank 8 abbr>
<rank 9 abbr>
<rank 10 abbr>
<rank 11 abbr>
<rank 12 abbr>
<rank 13 abbr>
<rank 14 abbr>
<rank 15 abbr>
<rank 16 abbr>
<rank 17 abbr>
<rank 18 abbr>
<rank 19 abbr>
<rank 20 abbr>
<rank 21 abbr>
<rank 22 abbr>
<rank 23 abbr>
<rank 24 abbr>
<rank 25 abbr>

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] Exactly 25 lines in the block, rank 1 first, rank 25 last
[ ] Every line has exactly 1 field (no tabs, no commas)
[ ] All team values are uppercase abbreviations from the mapping — no full names
[ ] No team duplicated across the 25 ranks
[ ] Blank lines for unknowns — nothing invented
[ ] No rank numbers, no header row, no commentary in the output`,
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
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => { document.body.style.overflow = 'unset' }
  }, [isOpen])

  useEffect(() => {
    const createSheet = async () => {
      if (isOpen && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote) {
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          const existingPolls = currentDynasty?.finalPollsByYear?.[currentYear] || {}
          const sheetInfo = await createFinalPollsSheet(currentYear, existingPolls, currentDynasty?.teams || currentDynasty?.customTeams)
          setSheetId(sheetInfo.sheetId)
        } catch (error) {
          console.error('Failed to create final polls sheet:', error)
        } finally {
          setCreatingSheet(false)
          creatingSheetRef.current = false
        }
      }
    }
    createSheet()
  }, [isOpen, user, sheetId, creatingSheet, currentDynasty?.id, auth.retryCount, showDeletedNote])

  useEffect(() => {
    if (!isOpen) {
      setShowDeletedNote(false)
      creatingSheetRef.current = false
      setSheetId(null)
    }
  }, [isOpen])

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

  const handleClose = () => onClose()

  if (!isOpen) return null

  const embedUrl = sheetId ? getSheetEmbedUrl(sheetId, 'Final Polls') : null
  const isLoading = creatingSheet

  return createPortal(
    <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-60 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4 modal-backdrop-in" style={{ margin: 0 }} onMouseDown={handleClose}>
      <div className="card-elevated w-full sm:w-[95vw] max-h-[calc(100dvh-4rem)] sm:h-[95dvh] flex flex-col overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
        <div className="h-[3px] w-full" style={{ backgroundColor: 'var(--surface-5)' }} aria-hidden="true" />
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-surface-4">
          <h2 className="text-2xl font-bold text-txt-primary">{currentYear} Final Top 25</h2>
          <button aria-label="Close" onClick={handleClose} className="text-txt-tertiary hover:text-txt-primary transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin w-12 h-12 border-4 rounded-full mx-auto mb-4" style={{ borderColor: 'var(--text-primary)', borderTopColor: 'transparent' }} />
              <p className="text-lg font-semibold text-txt-primary">Creating Final Polls Sheet...</p>
              <SheetLoadingHint active={isLoading} />
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="card p-8 border-l-[3px] text-center max-w-sm" style={{ borderLeftColor: 'var(--surface-5)' }}>
              <p className="label-xs text-txt-tertiary mb-2">Status</p>
              <p className="text-xl font-bold text-txt-primary mb-2">Saved &amp; Moved to Trash</p>
              <p className="text-sm text-txt-secondary">Final polls saved.</p>
            </div>
          </div>
        ) : sheetId ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {!isMobile && useEmbedded && (
              <div className="mb-3">
                <div className="flex gap-3 flex-wrap items-center">
                  <button onClick={handleSyncAndDelete} disabled={syncing || deletingSheet} className={`px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-all text-sm ${highlightSave ? 'animate-pulse ring-4 ring-offset-2 scale-105' : ''}`} style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}>{deletingSheet ? 'Saving...' : 'Save & Move to Trash'}</button>
                  <button onClick={handleSyncFromSheet} disabled={syncing || deletingSheet} className="btn btn-secondary text-sm">{syncing ? 'Syncing...' : 'Save & Keep Sheet'}</button>
                  <button onClick={() => setShowAIPrompt(true)} className="px-4 py-2 rounded-lg font-semibold text-sm border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent">AI Prompt</button>
                  <button onClick={handleRegenerateSheet} disabled={syncing || deletingSheet || regenerating} className="px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-colors text-sm border-2 ml-auto" style={{ backgroundColor: 'transparent', borderColor: '#EF4444', color: '#EF4444' }}>{regenerating ? 'Regenerating...' : 'Regenerate sheet'}</button>
                </div>
              </div>
            )}
            {!isMobile && (
              <div className="flex items-center justify-end mb-2">
                <button onClick={() => { const newValue = !useEmbedded; setUseEmbedded(newValue); localStorage.setItem('sheetEmbedPreference', newValue.toString()); }} className="text-xs px-3 py-1 rounded-full border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent">{useEmbedded ? '← Back to default view' : 'Try embedded view (beta)'}</button>
              </div>
            )}
            {isMobile || !useEmbedded ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                <h3 className="label-xs text-txt-tertiary mb-2">Data Entry</h3>
                <p className="text-2xl font-bold text-txt-primary mb-6">Edit in Google Sheets</p>
                <div className="text-left mb-6 max-w-sm w-full card p-4 border-l-[3px]" style={{ borderLeftColor: 'var(--surface-5)' }}>
                  <p className="label-xs text-txt-tertiary mb-3">Instructions</p>
                  <ol className="text-sm space-y-2 text-txt-secondary">
                    <li className="flex gap-3"><span className="font-bold text-txt-primary tabular-nums">1.</span><span>Tap the button below to open Google Sheets</span></li>
                    <li className="flex gap-3"><span className="font-bold text-txt-primary tabular-nums">2.</span><span>Enter the final Top 25 (1-25)</span></li>
                    <li className="flex gap-3"><span className="font-bold text-txt-primary tabular-nums">3.</span><span>Return to this app when done</span></li>
                    <li className="flex gap-3"><span className="font-bold text-txt-primary tabular-nums">4.</span><span>Tap "Save" below to sync results</span></li>
                  </ol>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 items-center justify-center mb-6">
                  <a href={`https://docs.google.com/spreadsheets/d/${sheetId}/edit`} target="_blank" rel="noopener noreferrer" className="px-6 py-3 rounded-lg font-bold text-lg hover:opacity-90 transition-colors flex items-center gap-2" style={{ backgroundColor: '#0F9D58', color: '#FFFFFF' }}>
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/><path d="M7 7h2v2H7zm0 4h2v2H7zm0 4h2v2H7zm4-8h6v2h-6zm0 4h6v2h-6zm0 4h6v2h-6z"/></svg>
                    Open Google Sheets
                  </a>
                  <button onClick={() => setShowAIPrompt(true)} className="px-6 py-3 rounded-lg font-semibold text-sm border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent">AI Prompt</button>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 items-center justify-center mb-4">
                  <button onClick={handleSyncAndDelete} disabled={syncing || deletingSheet} className={`px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-all text-sm ${highlightSave ? 'animate-pulse ring-4 ring-offset-2 scale-105' : ''}`} style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}>{deletingSheet ? 'Saving...' : 'Save & Move to Trash'}</button>
                  <button onClick={handleSyncFromSheet} disabled={syncing || deletingSheet} className="btn btn-secondary px-6 py-3 text-sm">{syncing ? 'Syncing...' : 'Save & Keep Sheet'}</button>
                </div>
                <button onClick={handleRegenerateSheet} disabled={syncing || deletingSheet || regenerating} className="text-xs px-4 py-2 rounded-lg font-medium hover:opacity-90 transition-colors border mb-4" style={{ backgroundColor: 'transparent', borderColor: '#EF4444', color: '#EF4444' }}>{regenerating ? 'Regenerating...' : 'Messed up? Regenerate sheet'}</button>
              </div>
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                <SheetToolbar sheetId={sheetId} embedUrl={embedUrl} teamColors={teamColors} title="Final Polls" />
              </div>
            )}
          </div>
        ) : null}
        </div>
      </div>
      <AuthErrorModal isOpen={auth.showAuthError} onClose={auth.closeAuthError} onRefresh={auth.retry} teamColors={teamColors} />
      <AIPromptModal isOpen={showAIPrompt} onClose={() => setShowAIPrompt(false)} title={`${currentYear} Final Top 25`} prompt={aiPrompt} pasteTarget={`Cell B2 of the "Polls" tab`} />
    </div>,
    document.body
  )
}
