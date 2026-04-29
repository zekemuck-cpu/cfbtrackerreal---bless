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
  createRosterHistorySheet,
  readRosterHistoryFromSheet,
  deleteGoogleSheet,
  getSingleSheetEmbedUrl,
  prefillRosterHistorySheet
} from '../services/sheetsService'
import { getTidFromAbbr } from '../data/teamRegistry'
import { getModalColors, getContrastTextColor } from '../utils/colorUtils'
import { buildAIPrompt } from '../utils/aiPrompt'
import SheetLoadingHint from './SheetLoadingHint'

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export default function RosterHistoryModal({ isOpen, onClose, teamColors }) {
  const { currentDynasty, updateDynasty } = useDynasty()
  const { user, signOut, refreshSession } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const modalColors = useMemo(() => getModalColors(teamColors), [teamColors])
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
    return localStorage.getItem('sheetEmbedPreference') === 'true'
  })
  const [highlightSave, setHighlightSave] = useState(false)
  const [showAIPrompt, setShowAIPrompt] = useState(false)

  // Ref to prevent concurrent sheet creation (state updates are async, refs are immediate)
  const creatingSheetRef = useRef(false)

  // Determine years to show based on dynasty data
  const startYear = currentDynasty?.startYear || 2025
  const currentYear = currentDynasty?.currentYear || startYear
  const years = []
  for (let y = startYear; y <= currentYear; y++) {
    years.push(y)
  }

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `Roster History`,
    structure: `This sheet has ONE tab: "Roster History". It has ${2 + years.length} columns total: Player Name (A), PID (B), then one team column per tracked year — ${years.map(y => `"${y} Team"`).join(', ')}. Row 1 is the protected header row. Up to 499 data rows (rows 2–500).

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. Output ONLY the data rows (rows 2+). NEVER output the header row.
2. Every line must have EXACTLY ${2 + years.length} tab-separated columns (${1 + years.length} tab characters). Order: Player Name, PID, ${years.map(y => `${y} Team`).join(', ')}.
3. One player per line. Up to 499 players total.
4. NO COMMAS anywhere — not in names, not in PIDs.
5. PID is an INTEGER (no decimal point) OR blank. NEVER invent a PID. If you do not see a PID on the screenshot, leave that cell blank — the app will match by player name for new rows. Wrong PIDs will cause silent data corruption.
6. BLANK CELL for any year the player was NOT on a roster that season — leave empty (two tabs in a row). Do NOT use "-", "N/A", "None", or "FA".
7. Team columns: use ONLY the team abbreviations from the mapping below (e.g. BAMA, OSU, UGA). NEVER use full names ("Alabama"), nicknames ("Tide"), or mascots. Case-sensitive — all uppercase/mixed as shown in the mapping.
8. No header row, no totals, no commentary, no blank separator rows.

═══════════════════════════════════════════════════════════
TAB: "Roster History" — paste at cell A2 of the "Roster History" tab
═══════════════════════════════════════════════════════════

Column layout, tab-separated:

Col | Header (row 1, protected) | Your value                             | Format
----+---------------------------+----------------------------------------+---------------------------------------
 A  | Player Name               | Full name (First Last)                 | text — no commas, include suffix (Jr./II) if known
 B  | PID                       | Existing player ID (or blank)          | integer — ONLY if screenshot shows it; NEVER invent
${years.map((y, i) => ` ${String.fromCharCode(67 + i)}  | ${y} Team                   | Team player was on in ${y}                | DROPDOWN — team abbreviation from mapping, or BLANK`).join('\n')}

───────────────────────────────────────────────────────────
TEAM COLUMNS — Dropdown values:
Use ONLY abbreviations from the team-abbreviation mapping provided at the bottom of this prompt (format: ABBR = Full Name). Examples: BAMA = Alabama, OSU = Ohio State, UGA = Georgia. Case must match the mapping exactly.

A blank cell means "not on any roster that year" (e.g. pre-enrollment year, transferred out with unknown destination, graduated, not yet recruited). Blank is the correct answer for any unknown season — never guess.

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== ROSTER HISTORY — paste at cell A2 of "Roster History" tab ===
<Player Name>\t<PID or blank>\t${years.map(y => `<${y} team abbr or blank>`).join('\t')}
<Player Name>\t<PID or blank>\t${years.map(y => `<${y} team abbr or blank>`).join('\t')}
…one line per player

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] Every line has exactly ${2 + years.length} tab-separated columns (${1 + years.length} tab characters)
[ ] No header row, no commentary
[ ] PID column is either an integer from the screenshot, or BLANK — never invented
[ ] No commas in any cell
[ ] All team values are exact abbreviations from the mapping below
[ ] Blank cell for every year a player was NOT on a roster — no "-", "N/A", "FA"
[ ] Player Name has no trailing whitespace
[ ] At most 499 data lines`,
    includeTeamMap: true,
  }), [years.join(',')])

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

  // Create sheet when modal opens
  useEffect(() => {
    const createSheet = async () => {
      if (isOpen && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote) {
        // Set ref immediately to prevent concurrent calls (state updates are async)
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          // Delete any existing roster history sheet first
          const existingSheetId = currentDynasty?.rosterHistorySheetId
          if (existingSheetId) {
            try {
              await deleteGoogleSheet(existingSheetId)
            } catch {
              // Ignore errors if sheet doesn't exist or already deleted
            }
          }

          // Create fresh sheet
          const sheetInfo = await createRosterHistorySheet(
            currentDynasty?.dynastyName || 'Dynasty',
            years,
            currentDynasty?.teams || currentDynasty?.customTeams
          )

          // Prefill with all non-honor-only players
          const players = (currentDynasty?.players || []).filter(p => !p.isHonorOnly)
          if (players.length > 0) {
            await prefillRosterHistorySheet(sheetInfo.spreadsheetId, players, years)
          }

          setSheetId(sheetInfo.spreadsheetId)

          // Save sheet ID to dynasty
          await updateDynasty(currentDynasty.id, {
            rosterHistorySheetId: sheetInfo.spreadsheetId
          })
        } catch (error) {
          console.error('Failed to create roster history sheet:', error)
          if (error.message?.includes('authentication') || error.message?.includes('token')) {
            setShowAuthError(true)
          }
        } finally {
          setCreatingSheet(false)
          creatingSheetRef.current = false
        }
      }
    }

    createSheet()
  }, [isOpen, user, sheetId, creatingSheet, currentDynasty?.id, retryCount, showDeletedNote])

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
      const historyData = await readRosterHistoryFromSheet(sheetId, years, (currentDynasty?.teams || currentDynasty?.customTeams))
      const useFullTidSystem = currentDynasty?._tidFullyMigrated === true

      // Helper to convert teamsByYear values to tid format for migrated dynasties
      const convertTeamsByYear = (teamsByYear) => {
        if (!useFullTidSystem) return teamsByYear
        return Object.fromEntries(
          Object.entries(teamsByYear).map(([yearKey, teamValue]) => {
            if (typeof teamValue === 'number') return [yearKey, teamValue]
            const tid = getTidFromAbbr(teamValue)
            return [yearKey, tid || teamValue]
          })
        )
      }

      // Update players with teamsByYear data
      const updatedPlayers = (currentDynasty?.players || []).map(player => {
        if (player.isHonorOnly) return player

        // Find matching entry by PID
        const match = historyData.find(h => h.pid === player.pid)
        if (match && Object.keys(match.teamsByYear).length > 0) {
          return {
            ...player,
            teamsByYear: {
              ...(player.teamsByYear || {}),
              ...convertTeamsByYear(match.teamsByYear)
            }
          }
        }
        return player
      })

      await updateDynasty(currentDynasty.id, { players: updatedPlayers })
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
      const historyData = await readRosterHistoryFromSheet(sheetId, years, (currentDynasty?.teams || currentDynasty?.customTeams))
      const useFullTidSystem = currentDynasty?._tidFullyMigrated === true

      // Helper to convert teamsByYear values to tid format for migrated dynasties
      const convertTeamsByYear = (teamsByYear) => {
        if (!useFullTidSystem) return teamsByYear
        return Object.fromEntries(
          Object.entries(teamsByYear).map(([yearKey, teamValue]) => {
            if (typeof teamValue === 'number') return [yearKey, teamValue]
            const tid = getTidFromAbbr(teamValue)
            return [yearKey, tid || teamValue]
          })
        )
      }

      // Update players with teamsByYear data
      const updatedPlayers = (currentDynasty?.players || []).map(player => {
        if (player.isHonorOnly) return player

        // Find matching entry by PID
        const match = historyData.find(h => h.pid === player.pid)
        if (match && Object.keys(match.teamsByYear).length > 0) {
          return {
            ...player,
            teamsByYear: {
              ...(player.teamsByYear || {}),
              ...convertTeamsByYear(match.teamsByYear)
            }
          }
        }
        return player
      })

      await updateDynasty(currentDynasty.id, { players: updatedPlayers })

      await deleteGoogleSheet(sheetId)
      await updateDynasty(currentDynasty.id, { rosterHistorySheetId: null })

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
      message: "This will delete your current sheet and create a fresh one. Any unsaved data will be lost.",
      confirmLabel: 'Regenerate',
      variant: 'danger',
    })
    if (!confirmed) return
    setRegenerating(true)
    try {
      await deleteGoogleSheet(sheetId)
      await updateDynasty(currentDynasty.id, { rosterHistorySheetId: null })
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

  const embedUrl = sheetId ? getSingleSheetEmbedUrl(sheetId) : null
  const isLoading = creatingSheet

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-60 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4"
      style={{ margin: 0 }}
      onMouseDown={handleClose}
    >
      <div
        className="rounded-lg shadow-xl w-full sm:w-[95vw] max-h-[calc(100dvh-4rem)] sm:h-[95dvh] flex flex-col p-4 sm:p-6 border"
        style={{ backgroundColor: modalColors.background, borderColor: modalColors.border }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold" style={{ color: modalColors.text }}>
            Roster History Editor
          </h2>
          <button aria-label="Close"
            onClick={handleClose}
            className="hover:opacity-70"
            style={{ color: modalColors.textMuted }}
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
                  borderColor: modalColors.accent,
                  borderTopColor: 'transparent'
                }}
              />
              <p className="text-lg font-semibold" style={{ color: modalColors.text }}>
                Creating Roster History Sheet...
              </p>
              <p className="text-sm mt-2" style={{ color: modalColors.textMuted }}>
                Pre-filling all players with team data
              </p>
              <SheetLoadingHint active={isLoading} />
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center p-8 rounded-lg" style={{ backgroundColor: modalColors.accent }}>
              <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="#ffffff" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-xl font-bold mb-2" style={{ color: '#ffffff' }}>
                Saved & Moved to Trash!
              </p>
              <p className="text-sm" style={{ color: '#ffffff', opacity: 0.9 }}>
                Roster history saved to your dynasty.
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
                      backgroundColor: modalColors.accent,
                      color: '#ffffff'
                    }}
                  >
                    {deletingSheet ? 'Saving...' : '✓ Save & Move to Trash'}
                  </button>
                  <button
                    onClick={handleSyncFromSheet}
                    disabled={syncing || deletingSheet}
                    className="px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-colors text-sm border-2"
                    style={{
                      backgroundColor: 'transparent',
                      borderColor: modalColors.border,
                      color: modalColors.text
                    }}
                  >
                    {syncing ? 'Syncing...' : 'Save & Keep Sheet'}
                  </button>
                  <button onClick={() => setShowAIPrompt(true)} className="px-4 py-2 rounded-lg text-sm font-medium border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent">AI Prompt</button>
                  <button
                    onClick={handleRegenerateSheet}
                    disabled={syncing || deletingSheet || regenerating}
                    className="px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-colors text-sm border-2"
                    style={{
                      backgroundColor: '#EF4444',
                      borderColor: '#EF4444',
                      color: '#FFFFFF'
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
                  className="text-xs px-3 py-1 rounded-full border transition-colors"
                  style={{
                    borderColor: modalColors.border,
                    color: modalColors.textMuted,
                    backgroundColor: 'transparent'
                  }}
                >
                  {useEmbedded ? '← Back to default view' : 'Try embedded view (beta)'}
                </button>
              </div>
            )}

            {isMobile || !useEmbedded ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6" style={{ backgroundColor: modalColors.accent }}>
                  <svg className="w-10 h-10" fill="none" stroke="#ffffff" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold mb-3" style={{ color: modalColors.text }}>Edit Roster History</h3>
                <div className="text-left mb-6 max-w-md">
                  <p className="text-sm font-semibold mb-2" style={{ color: modalColors.text }}>Instructions:</p>
                  <ol className="text-sm space-y-1.5" style={{ color: modalColors.textMuted }}>
                    <li className="flex gap-2"><span className="font-bold">1.</span><span>Open Google Sheets using the button below</span></li>
                    <li className="flex gap-2"><span className="font-bold">2.</span><span>For each player, set their team for each season</span></li>
                    <li className="flex gap-2"><span className="font-bold">3.</span><span>Use dropdowns to select team abbreviations</span></li>
                    <li className="flex gap-2"><span className="font-bold">4.</span><span>Return here and tap "Save" to update</span></li>
                  </ol>
                  <p className="text-xs mt-3" style={{ color: modalColors.textMuted }}>
                    This tracks which team each player was on in each season. Useful for fixing roster display issues after team changes.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-3 mb-6">
                  <a href={`https://docs.google.com/spreadsheets/d/${sheetId}/edit`} target="_blank" rel="noopener noreferrer" className="px-6 py-3 rounded-lg font-bold text-lg hover:opacity-90 transition-colors flex items-center gap-2" style={{ backgroundColor: '#0F9D58', color: '#FFFFFF' }}>
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/><path d="M7 7h2v2H7zm0 4h2v2H7zm0 4h2v2H7zm4-8h6v2h-6zm0 4h6v2h-6zm0 4h6v2h-6z"/></svg>
                    Open Google Sheets
                  </a>
                  <button onClick={() => setShowAIPrompt(true)} className="px-5 py-3 rounded-lg text-sm font-medium border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent">AI Prompt</button>
                </div>

                {/* Centered Save Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 items-center justify-center mb-4">
                  <button
                    onClick={handleSyncAndDelete}
                    disabled={syncing || deletingSheet}
                    className={`px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-all text-sm ${highlightSave ? 'animate-pulse ring-4 ring-offset-2 scale-105' : ''}`}
                    style={{
                      backgroundColor: teamColors.primary,
                      color: getContrastTextColor(teamColors.primary)
                    }}
                  >
                    {deletingSheet ? 'Saving...' : '✓ Save & Move to Trash'}
                  </button>
                  <button
                    onClick={handleSyncFromSheet}
                    disabled={syncing || deletingSheet}
                    className="px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-colors text-sm border-2"
                    style={{
                      backgroundColor: 'transparent',
                      borderColor: teamColors.primary,
                      color: teamColors.primary
                    }}
                  >
                    {syncing ? 'Syncing...' : 'Save & Keep Sheet'}
                  </button>
                </div>

                <button
                  onClick={handleRegenerateSheet}
                  disabled={syncing || deletingSheet || regenerating}
                  className="text-sm underline opacity-70 hover:opacity-100 transition-opacity"
                  style={{ color: teamColors.primary }}
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
                    title="Roster History Sheet"
                    onSessionError={() => setShowAuthError(true)}
                  />
                </div>
                <div className="text-xs mt-2 space-y-1" style={{ color: teamColors.primary, opacity: 0.6 }}>
                  <p><strong>Columns:</strong> Player Name | PID | {years.map(y => `${y} Team`).join(' | ')}</p>
                  <p>Set which team each player was on in each season. Use dropdowns for team abbreviations.</p>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-lg mb-4" style={{ color: teamColors.primary }}>
                Your session has expired. Click below to refresh.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={async () => {
                    setRefreshing(true)
                    try {
                      const success = await refreshSession()
                      if (success) {
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
                    backgroundColor: teamColors.primary,
                    color: getContrastTextColor(teamColors.primary),
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

      {/* Auth Error Modal */}
      <AuthErrorModal
        isOpen={showAuthError}
        onClose={() => setShowAuthError(false)}
        onRefresh={() => setRetryCount(c => c + 1)}
        teamColors={teamColors}
      />
      <AIPromptModal isOpen={showAIPrompt} onClose={() => setShowAIPrompt(false)} title={`Roster History`} prompt={aiPrompt} pasteTarget={`Cell A2 of the "Roster History" tab`} />
    </div>,
    document.body,
  )
}
