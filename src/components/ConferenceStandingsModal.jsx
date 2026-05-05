import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import AuthErrorModal from './AuthErrorModal'
import AIPromptModal from './AIPromptModal'
import SheetToolbar from './SheetToolbar'
import {
  createConferenceStandingsSheet,
  readConferenceStandingsFromSheet,
  deleteGoogleSheet,
  getSheetEmbedUrl
} from '../services/sheetsService'
import { getModalColors } from '../utils/colorUtils'
import { buildAIPrompt } from '../utils/aiPrompt'
import SheetLoadingHint from './SheetLoadingHint'

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export default function ConferenceStandingsModal({ isOpen, onClose, onSave, currentYear, teamColors }) {
  const { currentDynasty } = useDynasty()
  const modalColors = useMemo(() => getModalColors(teamColors), [teamColors])
  const { user, signOut, refreshSession } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [refreshing, setRefreshing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [deletingSheet, setDeletingSheet] = useState(false)
  const [creatingSheet, setCreatingSheet] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [sheetId, setSheetId] = useState(null)
  const [showDeletedNote, setShowDeletedNote] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [isMobile, setIsMobile] = useState(false)
  const [showAuthError, setShowAuthError] = useState(false)
  const [useEmbedded, setUseEmbedded] = useState(() => {
    // Load preference from localStorage
    return localStorage.getItem('sheetEmbedPreference') === 'true'
  })
  const [highlightSave, setHighlightSave] = useState(false)
  const [showAIPrompt, setShowAIPrompt] = useState(false)

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} Conference Standings`,
    structure: `This sheet has ONE tab named "Standings". Single vertical table, 7 columns, 11 conference blocks of 20 rows each with 1 spacer row between blocks.

Columns A (Conference name) and B (Conf. Rank 1-20) are PRE-FILLED in every team row. Column A text is the conference name; column B is the integer rank 1-20.
You fill columns C, D, E, F, G only (Team, Wins, Losses, Points For, Points Against).

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. Output ONLY columns C, D, E, F, G (Team, Wins, Losses, Points For, Points Against). Never output Conference name, Rank, header row, or spacer rows.
2. ONE labeled TSV block per conference — 11 total blocks. Each block has UP TO 20 lines (one per ranked team). Leave extra slots blank if a conference has fewer than 20 teams.
3. Row order within each block = rank 1 first → rank 20 last. Best record first.
4. Each line has EXACTLY 5 tab-separated fields: Team, Wins, Losses, Points For, Points Against.
5. NO COMMAS in numbers: "1234" not "1,234". No thousands separators.
6. Integers only — no decimal points in Wins/Losses/Points For/Points Against.
7. Fewer than 20 lines is allowed if a conference has fewer teams. Do NOT pad with fake entries. Do NOT guess — leave the remaining lines out rather than inventing teams.
8. Team values (col C) must be UPPERCASE abbreviations from the mapping at the bottom — NEVER full names or nicknames. Must be a member of the conference for that block.
9. Spacer rows between conferences in the sheet are NOT part of your output — each block starts fresh at the rank-1 cell of its conference.

═══════════════════════════════════════════════════════════
LAYOUT — 11 conferences in this EXACT order with exact paste cells
═══════════════════════════════════════════════════════════
  1. ACC         → paste at cell C2   of "Standings" tab
  2. American    → paste at cell C23  of "Standings" tab
  3. Big 12      → paste at cell C44  of "Standings" tab
  4. Big Ten     → paste at cell C65  of "Standings" tab
  5. C-USA       → paste at cell C86  of "Standings" tab
  6. Independent → paste at cell C107 of "Standings" tab
  7. MAC         → paste at cell C128 of "Standings" tab
  8. MWC         → paste at cell C149 of "Standings" tab
  9. Pac-12      → paste at cell C170 of "Standings" tab
 10. SEC         → paste at cell C191 of "Standings" tab
 11. Sun Belt    → paste at cell C212 of "Standings" tab

(Each conference occupies exactly 20 team rows starting at its rank-1 row, followed by 1 blank spacer row, then the next conference's rank-1 row.)

Independent is small (typically just ND, CONN, MASS) — output only 1-3 lines, not 20.

═══════════════════════════════════════════════════════════
PER-LINE OUTPUT (5 tab-separated fields)
═══════════════════════════════════════════════════════════
<Team Abbr>\\t<Wins>\\t<Losses>\\t<Points For>\\t<Points Against>

Field formats:
- Team Abbr (strict dropdown) — UPPERCASE abbreviation from the mapping at the bottom (e.g. BAMA, OSU, UGA). Must be a team in THIS block's conference. NEVER full names ("Alabama", "Ohio State") or nicknames.
- Wins — integer, no decimals, no commas (e.g. "12" not "12.0" or "12,0").
- Losses — integer, same rules.
- Points For — season total integer, no commas (e.g. "487" not "4,870").
- Points Against — season total integer, same rules.

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== ACC — paste at cell C2 of "Standings" tab ===
<rank-1 team line>
<rank-2 team line>
...
<rank-N team line>

=== American — paste at cell C23 of "Standings" tab ===
<up to 20 team lines in rank order>

=== Big 12 — paste at cell C44 of "Standings" tab ===
<up to 20 team lines in rank order>

=== Big Ten — paste at cell C65 of "Standings" tab ===
<up to 20 team lines in rank order>

=== C-USA — paste at cell C86 of "Standings" tab ===
<up to 20 team lines in rank order>

=== Independent — paste at cell C107 of "Standings" tab ===
<up to 20 team lines in rank order (usually 1-3)>

=== MAC — paste at cell C128 of "Standings" tab ===
<up to 20 team lines in rank order>

=== MWC — paste at cell C149 of "Standings" tab ===
<up to 20 team lines in rank order>

=== Pac-12 — paste at cell C170 of "Standings" tab ===
<up to 20 team lines in rank order>

=== SEC — paste at cell C191 of "Standings" tab ===
<up to 20 team lines in rank order>

=== Sun Belt — paste at cell C212 of "Standings" tab ===
<up to 20 team lines in rank order>

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] Exactly 11 labeled blocks, in the order: ACC, American, Big 12, Big Ten, C-USA, Independent, MAC, MWC, Pac-12, SEC, Sun Belt
[ ] Each block labeled with the exact paste cell (C2, C23, C44, C65, C86, C107, C128, C149, C170, C191, C212)
[ ] Every line has exactly 5 tab-separated fields (4 tabs)
[ ] No commas in any number
[ ] No decimals (all values are integers)
[ ] All team values are uppercase abbreviations from the mapping — no full names
[ ] Every team is a valid member of its block's conference
[ ] Teams within a block are in rank order (rank 1 first)
[ ] Did not invent teams to fill to 20 — shorter blocks allowed
[ ] No Conference column, no Rank column, no header row, no commentary in the output`,
    includeTeamMap: true,
    dynastyTeams: currentDynasty?.teams,
  }), [currentYear, currentDynasty?.teams])

  // Ref to prevent concurrent sheet creation (state updates are async, refs are immediate)
  const creatingSheetRef = useRef(false)

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
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  useEffect(() => {
    const createSheet = async () => {
      if (isOpen && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote) {
        // Set ref immediately to prevent concurrent calls (state updates are async)
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          // Get existing data for pre-filling (if any)
          const existingStandings = currentDynasty?.conferenceStandingsByYear?.[currentYear] || {}
          const sheetInfo = await createConferenceStandingsSheet(currentYear, existingStandings, currentDynasty?.teams || currentDynasty?.customTeams)
          setSheetId(sheetInfo.sheetId)
        } catch (error) {
          console.error('Failed to create conference standings sheet:', error)
        } finally {
          setCreatingSheet(false)
          creatingSheetRef.current = false
        }
      }
    }
    createSheet()
  }, [isOpen, user, sheetId, creatingSheet, currentDynasty?.id, retryCount, showDeletedNote])

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
      const standings = await readConferenceStandingsFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(standings)
      onClose()
    } catch (error) {
      console.error(error)
      if (error.message?.includes('OAuth') || error.message?.includes('access token')) {
        setShowAuthError(true)
      } else {
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
      const standings = await readConferenceStandingsFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(standings)
      // Move sheet to trash (keep sheet ID stored so user can restore if needed)
      await deleteGoogleSheet(sheetId)
      setSheetId(null)
      setShowDeletedNote(true)
      setTimeout(() => onClose(), 2500)
    } catch (error) {
      console.error('Error in handleSyncAndDelete:', error)
      if (error.message?.includes('OAuth') || error.message?.includes('access token')) {
        setShowAuthError(true)
      } else {
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
      setRetryCount(c => c + 1)
    } catch (error) {
      console.error('Failed to regenerate sheet:', error)
      if (error.message?.includes('OAuth') || error.message?.includes('access token')) {
        setShowAuthError(true)
      } else {
        toast.error('Failed to regenerate sheet. Please try again.')
      }
    } finally {
      setRegenerating(false)
    }
  }

  const handleClose = () => onClose()

  if (!isOpen) return null

  const embedUrl = sheetId ? getSheetEmbedUrl(sheetId, 'Standings') : null
  const isLoading = creatingSheet

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-60 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4"
      style={{ margin: 0 }}
      onMouseDown={handleClose}
    >
      <div
        className="card-elevated w-full sm:w-[95vw] max-h-[calc(100dvh-4rem)] sm:h-[95dvh] flex flex-col overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-surface-4">
          <h2 className="text-2xl font-bold text-txt-primary">
            {currentYear} Conference Standings
          </h2>
          <button aria-label="Close" onClick={handleClose} className="text-txt-tertiary hover:text-txt-primary transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin w-12 h-12 border-4 rounded-full mx-auto mb-4" style={{ borderColor: 'var(--text-primary)', borderTopColor: 'transparent' }} />
              <p className="text-lg font-semibold text-txt-primary">Creating Conference Standings Sheet...</p>
              <SheetLoadingHint active={isLoading} />
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="card p-8 border-l-[3px] text-center max-w-sm" style={{ borderLeftColor: 'var(--surface-5)' }}>
              <p className="label-xs text-txt-tertiary mb-2">Status</p>
              <p className="text-xl font-bold text-txt-primary mb-2">Saved &amp; Moved to Trash</p>
              <p className="text-sm text-txt-secondary">Conference standings saved.</p>
            </div>
          </div>
        ) : sheetId ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {!isMobile && useEmbedded && (
              <div className="mb-3">
                <div className="flex gap-3 flex-wrap items-center">
                  <button onClick={handleSyncAndDelete} disabled={syncing || deletingSheet} className={`px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-all text-sm ${highlightSave ? 'animate-pulse ring-4 ring-offset-2 scale-105' : ''}`} style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}>
                    {deletingSheet ? 'Saving...' : 'Save & Move to Trash'}
                  </button>
                  <button onClick={handleSyncFromSheet} disabled={syncing || deletingSheet} className="btn btn-secondary text-sm">
                    {syncing ? 'Syncing...' : 'Save & Keep Sheet'}
                  </button>
                  <button onClick={() => setShowAIPrompt(true)} className="px-4 py-2 rounded-lg text-sm font-medium border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent">AI Prompt</button>
                  <button onClick={handleRegenerateSheet} disabled={syncing || deletingSheet || regenerating} className="btn btn-secondary text-sm" style={{ opacity: 0.7 }}>
                    {regenerating ? 'Regenerating...' : 'Regenerate sheet'}
                  </button>
                </div>
              </div>
            )}

            {!isMobile && (
              <div className="flex items-center justify-end mb-2">
                <button onClick={() => { const newValue = !useEmbedded; setUseEmbedded(newValue); localStorage.setItem('sheetEmbedPreference', newValue.toString()); }} className="text-xs px-3 py-1 rounded-full border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent">
                  {useEmbedded ? '← Back to default view' : 'Try embedded view (beta)'}
                </button>
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
                    <li className="flex gap-3"><span className="font-bold text-txt-primary tabular-nums">2.</span><span>Enter standings for each conference</span></li>
                    <li className="flex gap-3"><span className="font-bold text-txt-primary tabular-nums">3.</span><span>Return to this app when done</span></li>
                    <li className="flex gap-3"><span className="font-bold text-txt-primary tabular-nums">4.</span><span>Tap "Save" below to sync results</span></li>
                  </ol>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-3 mb-6">
                  <a href={`https://docs.google.com/spreadsheets/d/${sheetId}/edit`} target="_blank" rel="noopener noreferrer" className="px-6 py-3 rounded-lg font-bold text-lg hover:opacity-90 transition-colors flex items-center gap-2" style={{ backgroundColor: '#0F9D58', color: '#FFFFFF' }}>
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/><path d="M7 7h2v2H7zm0 4h2v2H7zm0 4h2v2H7zm4-8h6v2h-6zm0 4h6v2h-6zm0 4h6v2h-6z"/></svg>
                    Open Google Sheets
                  </a>
                  <button onClick={() => setShowAIPrompt(true)} className="px-5 py-3 rounded-lg text-sm font-medium border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent">AI Prompt</button>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 items-center justify-center mb-4">
                  <button onClick={handleSyncAndDelete} disabled={syncing || deletingSheet} className={`px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-all text-sm ${highlightSave ? 'animate-pulse ring-4 ring-offset-2 scale-105' : ''}`} style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}>
                    {deletingSheet ? 'Saving...' : 'Save & Move to Trash'}
                  </button>
                  <button onClick={handleSyncFromSheet} disabled={syncing || deletingSheet} className="btn btn-secondary px-6 py-3 text-sm">
                    {syncing ? 'Syncing...' : 'Save & Keep Sheet'}
                  </button>
                </div>
                <button onClick={handleRegenerateSheet} disabled={syncing || deletingSheet || regenerating} className="text-sm underline text-txt-tertiary hover:text-txt-primary transition-colors">
                  {regenerating ? 'Regenerating...' : 'Messed up? Regenerate sheet'}
                </button>
              </div>
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                <SheetToolbar sheetId={sheetId} embedUrl={embedUrl} teamColors={teamColors} title="Conference Standings" onSessionError={() => setShowAuthError(true)} />
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-lg mb-4 text-txt-primary">Your session has expired.</p>
              <div className="flex gap-3 justify-center">
                <button onClick={async () => { setRefreshing(true); try { const success = await refreshSession(); if (success) setRetryCount(c => c + 1); } catch (e) { console.error(e); } setRefreshing(false); }} disabled={refreshing} className="px-4 py-2 rounded font-semibold" style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)', opacity: refreshing ? 0.7 : 1 }}>
                  {refreshing ? 'Refreshing...' : 'Refresh Session'}
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
      <AuthErrorModal isOpen={showAuthError} onClose={() => setShowAuthError(false)} onRefresh={() => setRetryCount(c => c + 1)} teamColors={teamColors} />
      <AIPromptModal isOpen={showAIPrompt} onClose={() => setShowAIPrompt(false)} title={`${currentYear} Conference Standings`} prompt={aiPrompt} pasteTarget={[
        'ACC → Cell C2 of the "Standings" tab',
        'American → Cell C23 of the "Standings" tab',
        'Big 12 → Cell C44 of the "Standings" tab',
        'Big Ten → Cell C65 of the "Standings" tab',
        'Conference USA → Cell C86 of the "Standings" tab',
        'MAC → Cell C107 of the "Standings" tab',
        'Mountain West → Cell C128 of the "Standings" tab',
        'Pac-12 → Cell C149 of the "Standings" tab',
        'SEC → Cell C170 of the "Standings" tab',
        'Sun Belt → Cell C191 of the "Standings" tab',
        'Independent → Cell C212 of the "Standings" tab',
      ]} />
    </div>,
    document.body,
  )
}
