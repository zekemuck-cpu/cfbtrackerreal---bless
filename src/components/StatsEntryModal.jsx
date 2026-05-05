import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty, isPlayerOnRoster } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import AuthErrorModal from './AuthErrorModal'
import AIPromptModal from './AIPromptModal'
import SheetToolbar from './SheetToolbar'
import {
  createStatsEntrySheet,
  readStatsFromSheet,
  deleteGoogleSheet,
  getSheetEmbedUrl
} from '../services/sheetsService'
import { buildAIPrompt } from '../utils/aiPrompt'
import SheetLoadingHint from './SheetLoadingHint'
// Stats are read directly from player.statsByYear (single source of truth)

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export default function StatsEntryModal({
  isOpen,
  onClose,
  onSave,
  currentYear,
  teamColors,
  // Optional props for team override (used by TeamStats page)
  teamAbbr: overrideTeamAbbr,
  teamName: overrideTeamName
}) {
  const { currentDynasty, updateDynasty } = useDynasty()
  const { user, signOut, refreshSession } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [refreshing, setRefreshing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [deletingSheet, setDeletingSheet] = useState(false)
  const [creatingSheet, setCreatingSheet] = useState(false)
  const [sheetId, setSheetId] = useState(null)
  const [showDeletedNote, setShowDeletedNote] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [isMobile, setIsMobile] = useState(false)
  const [showAuthError, setShowAuthError] = useState(false)
  const [authErrorOccurred, setAuthErrorOccurred] = useState(false) // Prevents retry loops on auth errors
  const [createAttempts, setCreateAttempts] = useState(0) // Tracks creation attempts
  const MAX_CREATE_ATTEMPTS = 2 // Maximum retries for sheet creation
  const [useEmbedded, setUseEmbedded] = useState(() => {
    // Load preference from localStorage
    return localStorage.getItem('sheetEmbedPreference') === 'true'
  })
  const [highlightSave, setHighlightSave] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [showAIPrompt, setShowAIPrompt] = useState(false)

  // Current-team roster, used to give the AI a "A. Guess → Alex Guess"
  // lookup so EA-CFB screenshots with initial-abbreviated names can be
  // resolved to the full names the strict Google Sheets dropdown expects.
  const userRoster = useMemo(() => {
    const teamAbbrForRoster = overrideTeamAbbr ||
      currentDynasty?.teams?.[currentDynasty?.currentTid]?.abbr ||
      currentDynasty?.teamName
    const all = currentDynasty?.players || []
    return all
      .filter(p => isPlayerOnRoster(p, teamAbbrForRoster, currentYear))
      .map(p => ({
        name: p.name,
        jerseyNumber: p.jerseyNumber,
        position: p.position,
      }))
  }, [currentDynasty?.players, currentDynasty?.teams, currentDynasty?.currentTid, currentDynasty?.teamName, overrideTeamAbbr, currentYear])

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} GP/Snaps Entry`,
    roster: userRoster,
    structure: `This sheet has ONE tab: "GP/Snaps".
Row 1 (header: Player | Games Played | Snaps Played) is pre-filled and PROTECTED. Data rows start at row 2. Column A uses a STRICT DROPDOWN containing every roster player's name — any value that doesn't exactly match a roster name will be rejected by the sheet.

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. Output data rows ONLY (starting at row 2). NEVER output the header row.
2. One line per player, 3 tab-separated values: <Player>\\t<Games Played>\\t<Snaps Played>.
3. Column A (Player) is a STRICT DROPDOWN of roster names. You MUST use the EXACT player name as it appears on the box-score / stats screenshots — case-sensitive, including spaces, hyphens, apostrophes, "Jr.", "III", etc.
4. Only include players who actually appear in the screenshots. Do NOT invent rows for other roster players.
5. Games Played: integer 0–15 (regular season + postseason). NO commas, NO decimals.
6. Snaps Played: integer. NO commas, NO decimals, NO "snaps" suffix.
7. BLANK cell for unknown values (leave the cell empty between tabs). Never guess. Never use 0 as "unknown".
8. NO COMMAS in numbers: "1234" not "1,234".
9. No header row, no totals, no commentary. ONE TSV block.

═══════════════════════════════════════════════════════════
TAB: "GP/Snaps"
Paste at cell A2 of the "GP/Snaps" tab
═══════════════════════════════════════════════════════════

Col | Header (protected)  | Your output                                                                 | Format
----+---------------------+-----------------------------------------------------------------------------+------------------------
 A  | Player              | Player name — MUST exactly match a roster dropdown entry (see screenshots) | strict dropdown, text
 B  | Games Played        | Integer 0–15                                                                | integer, no commas
 C  | Snaps Played        | Integer (total snaps played for the season)                                 | integer, no commas

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== GP/SNAPS — paste at cell A2 of "GP/Snaps" tab ===
<Player>\\t<Games Played>\\t<Snaps Played>
<Player>\\t<Games Played>\\t<Snaps Played>
...

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] One line per player that appears in the screenshots — no invented players
[ ] Every line has EXACTLY 2 tab characters (3 values)
[ ] Player name is copied character-for-character from the screenshot (case, punctuation, suffix)
[ ] Games Played is an integer 0–15 (or blank)
[ ] Snaps Played is an integer (or blank)
[ ] No commas in any number
[ ] No header row, no totals, no commentary`,
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

  // Create stats sheet when modal opens - ALWAYS create fresh to reflect current player data
  useEffect(() => {
    const createSheet = async () => {
      // Don't retry if auth error occurred or max attempts reached
      if (authErrorOccurred || createAttempts >= MAX_CREATE_ATTEMPTS) return

      if (isOpen && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote) {
        // ALWAYS create a fresh sheet - never reuse old sheets
        // This ensures the sheet reflects current player data (user may have edited players directly)

        // Set ref immediately to prevent concurrent calls (state updates are async)
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          // Get current team abbreviation - use override if provided
          const { getCurrentTeamAbbr } = await import('../data/teamRegistry')
          const userTeamAbbr = overrideTeamAbbr || getCurrentTeamAbbr(currentDynasty)
          const dynastyTeamName = overrideTeamName || currentDynasty?.teamName
          const startYear = currentDynasty?.startYear || currentYear

          // Get the full roster for this team and year
          const allPlayers = currentDynasty?.players || []
          const players = allPlayers.filter(player =>
            isPlayerOnRoster(player, userTeamAbbr, currentYear)
          )

          // Get existing stats to pre-fill gamesPlayed/snapsPlayed
          // Prioritize box scores (most accurate count of games played), then fall back to saved stats
          // Use normalized string key for consistency with how stats are saved
          const yearKey = String(currentYear)
          const numKey = Number(currentYear)

          const playersWithStats = players.map(player => {
            // Check player's own statsByYear - try all possible key types (SINGLE SOURCE OF TRUTH)
            const playerYearStats = player.statsByYear?.[yearKey]
              ?? player.statsByYear?.[numKey]
              ?? player.statsByYear?.[currentYear]

            // Read games/snaps directly from player.statsByYear
            // Box scores already update this via delta tracking
            const gamesPlayed = playerYearStats?.gamesPlayed ?? null
            const snapsPlayed = playerYearStats?.snapsPlayed ?? null

            return {
              ...player,
              gamesPlayed,
              snapsPlayed
            }
          })

          const sheetInfo = await createStatsEntrySheet(
            dynastyTeamName || 'Dynasty',
            currentYear,
            playersWithStats
          )

          setSheetId(sheetInfo.spreadsheetId)
          // NOTE: We do NOT save the sheet ID to dynasty - each open creates a fresh sheet
        } catch (error) {
          console.error('Failed to create stats sheet:', error)
          setCreateAttempts(prev => prev + 1)

          // Check for OAuth/auth errors - stop retrying and show error modal
          if (error.message?.includes('OAuth') || error.message?.includes('access token') || error.message?.includes('expired')) {
            setAuthErrorOccurred(true)
            setShowAuthError(true)
          }
        } finally {
          setCreatingSheet(false)
          creatingSheetRef.current = false
        }
      }
    }

    createSheet()
  }, [isOpen, user, sheetId, creatingSheet, currentDynasty?.id, retryCount, showDeletedNote, overrideTeamAbbr, overrideTeamName, currentYear, authErrorOccurred, createAttempts])

  // Reset state when modal closes - clear sheetId so a fresh sheet is created next time
  useEffect(() => {
    if (!isOpen) {
      setSheetId(null)
      setShowDeletedNote(false)
      creatingSheetRef.current = false
      setAuthErrorOccurred(false)
      setCreateAttempts(0)
      setShowAuthError(false)
    }
  }, [isOpen])

  const handleSyncFromSheet = async () => {
    if (!sheetId) return

    setSyncing(true)
    try {
      const stats = await readStatsFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(stats)
      onClose()
    } catch (error) {
      console.error(error)
      if (error.message?.includes('OAuth') || error.message?.includes('access token')) {
        setShowAuthError(true)
      } else {
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
      const stats = await readStatsFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(stats)

      // Move sheet to trash (keep sheet ID stored so user can restore if needed)
      await deleteGoogleSheet(sheetId)

      setSheetId(null)
      setShowDeletedNote(true)
      setTimeout(() => {
        onClose()
      }, 2500)
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
      message: 'This will delete your current sheet and create a fresh one. Any unsaved data will be lost.',
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

  const handleClose = () => {
    onClose()
  }

  if (!isOpen) return null

  const embedUrl = sheetId ? getSheetEmbedUrl(sheetId, 'GP/Snaps') : null
  const isLoading = creatingSheet

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-3 sm:p-4"
      style={{ margin: 0 }}
      onMouseDown={handleClose}
    >
      <div
        className="card-elevated w-full sm:w-[95vw] max-h-[calc(100dvh-1.5rem)] sm:max-h-[95dvh] flex flex-col overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-surface-4">
          <h2 className="text-2xl font-bold text-txt-primary">
            {currentYear} GP/Snaps Entry
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

        <div className="flex-1 flex flex-col overflow-y-auto min-h-0 p-4 sm:p-6">
        <p className="text-sm mb-3 text-txt-secondary">
          Enter this first! Detailed Stats entry sorts players by snaps, so entering snaps here lets you quickly go down the list when entering passing, rushing, and other stats.
        </p>

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
                Creating GP/Snaps Sheet...
              </p>
              <p className="text-sm mt-2 text-txt-secondary">
                Setting up player dropdown
              </p>
              <SheetLoadingHint active={isLoading} />
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="card p-8 border-l-[3px] text-center max-w-sm" style={{ borderLeftColor: 'var(--surface-5)' }}>
              <p className="label-xs text-txt-tertiary mb-2">Status</p>
              <p className="text-xl font-bold text-txt-primary mb-2">Saved &amp; Moved to Trash</p>
              <p className="text-sm text-txt-secondary">Player stats saved to your dynasty.</p>
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
                  {highlightSave && (
                    <span className="text-xs font-medium animate-bounce text-txt-primary">

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
                  className="text-xs px-3 py-1 rounded-full border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent"
                >
                  {useEmbedded ? '← Back to default view' : 'Try embedded view (beta)'}
                </button>
              </div>
            )}

            {isMobile || !useEmbedded ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <h3 className="label-xs text-txt-tertiary mb-1">Data Entry</h3>
                <p className="text-xl font-bold text-txt-primary mb-3">Edit in Google Sheets</p>
                <div className="text-left mb-3 max-w-sm w-full card p-3 border-l-[3px]" style={{ borderLeftColor: 'var(--surface-5)' }}>
                  <p className="label-xs text-txt-tertiary mb-1.5">Instructions</p>
                  <ol className="text-xs space-y-1 text-txt-secondary">
                    <li className="flex gap-2"><span className="font-bold text-txt-primary tabular-nums">1.</span><span>Tap button below to open Google Sheets</span></li>
                    <li className="flex gap-2"><span className="font-bold text-txt-primary tabular-nums">2.</span><span>Select a player, enter GP &amp; Snaps</span></li>
                    <li className="flex gap-2"><span className="font-bold text-txt-primary tabular-nums">3.</span><span>Return to this app when done</span></li>
                    <li className="flex gap-2"><span className="font-bold text-txt-primary tabular-nums">4.</span><span>Tap "Save" below to sync results</span></li>
                  </ol>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-3 mb-4">
                  <a href={`https://docs.google.com/spreadsheets/d/${sheetId}/edit`} target="_blank" rel="noopener noreferrer" className="px-5 py-2.5 rounded-lg font-bold text-base hover:opacity-90 transition-colors flex items-center gap-2" style={{ backgroundColor: '#0F9D58', color: '#FFFFFF' }}>
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/><path d="M7 7h2v2H7zm0 4h2v2H7zm0 4h2v2H7zm4-8h6v2h-6zm0 4h6v2h-6zm0 4h6v2h-6z"/></svg>
                    Open Google Sheets
                  </a>
                  <button
                    onClick={() => setShowAIPrompt(true)}
                    className="px-5 py-3 rounded-lg text-sm font-medium border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent"
                  >
                    AI Prompt
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 items-center justify-center mb-2">
                  <button
                    onClick={handleSyncAndDelete}
                    disabled={syncing || deletingSheet}
                    className={`px-5 py-2.5 rounded-lg font-semibold hover:opacity-90 transition-all text-sm ${highlightSave ? 'animate-pulse ring-4 ring-offset-2 scale-105' : ''}`}
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
                    className="btn btn-secondary px-5 py-2.5 text-sm"
                  >
                    {syncing ? 'Syncing...' : 'Save & Keep Sheet'}
                  </button>
                </div>
                <button
                  onClick={handleRegenerateSheet}
                  disabled={syncing || deletingSheet || regenerating}
                  className="text-[11px] px-3 py-1.5 rounded-lg font-medium hover:opacity-90 transition-colors border"
                  style={{
                    backgroundColor: 'transparent',
                    borderColor: '#EF4444',
                    color: '#EF4444'
                  }}
                >
                  {regenerating ? 'Regenerating...' : 'Messed up? Regenerate sheet'}
                </button>
              </div>
            ) : (
              <>
                <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                  <SheetToolbar
                    sheetId={sheetId}
                    embedUrl={embedUrl}
                    teamColors={teamColors}
                    title="GP/Snaps Google Sheet"
                    onSessionError={() => setShowAuthError(true)}
                  />
                </div>
                <div className="text-xs mt-2 space-y-1 text-txt-tertiary">
                  <p><strong>Columns:</strong> Player (dropdown) | Games Played | Snaps Played</p>
                  <p>Select a player from the dropdown, then enter their Games Played and Snaps Played.</p>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-lg mb-4 text-txt-primary">
                Your session has expired. Click below to refresh.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={async () => {
                    setRefreshing(true)
                    try {
                      const success = await refreshSession()
                      if (success) {
                        // Reset error states to allow sheet creation retry
                        setAuthErrorOccurred(false)
                        setCreateAttempts(0)
                        // Trigger sheet creation retry
                        setRetryCount(c => c + 1)
                      }
                    } catch (e) {
                      console.error('Refresh failed:', e)
                    }
                    setRefreshing(false)
                  }}
                  disabled={refreshing}
                  className="px-4 py-2 rounded font-semibold transition-colors"
                  style={{
                    backgroundColor: 'var(--text-primary)',
                    color: 'var(--surface-1)',
                    opacity: refreshing ? 0.7 : 1
                  }}
                >
                  {refreshing ? 'Refreshing...' : 'Refresh Session'}
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>

      {/* Auth Error Modal */}
      <AuthErrorModal
        isOpen={showAuthError}
        onClose={() => setShowAuthError(false)}
        onRefresh={() => {
          // Reset error states to allow sheet creation retry
          setAuthErrorOccurred(false)
          setCreateAttempts(0)
          // Trigger sheet creation retry
          setRetryCount(c => c + 1)
        }}
        teamColors={teamColors}
      />
      <AIPromptModal
        isOpen={showAIPrompt}
        onClose={() => setShowAIPrompt(false)}
        title={`${currentYear} GP/Snaps Entry`}
        prompt={aiPrompt}
        pasteTarget={`Cell A2 of the "GP/Snaps" tab`}
      />
    </div>,
    document.body
  )
}
