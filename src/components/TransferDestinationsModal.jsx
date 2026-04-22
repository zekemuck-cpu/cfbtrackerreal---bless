import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty, isPlayerOnRoster } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import AuthErrorModal from './AuthErrorModal'
import AIPromptModal from './AIPromptModal'
import {
  createTransferDestinationsSheet,
  readTransferDestinationsFromSheet,
  deleteGoogleSheet,
  getSheetEmbedUrl,
  sheetExists
} from '../services/sheetsService'
import { getModalColors, getContrastTextColor } from '../utils/colorUtils'
import { buildAIPrompt } from '../utils/aiPrompt'
import SheetLoadingHint from './SheetLoadingHint'

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export default function TransferDestinationsModal({ isOpen, onClose, onSave, currentYear, teamColors }) {
  const { currentDynasty, updateDynasty } = useDynasty()
  const { user } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const modalColors = useMemo(() => getModalColors(teamColors), [teamColors])
  const [syncing, setSyncing] = useState(false)
  const [deletingSheet, setDeletingSheet] = useState(false)
  const [creatingSheet, setCreatingSheet] = useState(false)
  const [sheetId, setSheetId] = useState(() => {
    // Reuse existing sheet if it was created for the same season
    if (
      currentDynasty?.transferDestinationsSheetId &&
      currentDynasty?.transferDestinationsSheetYear === currentYear
    ) {
      return currentDynasty.transferDestinationsSheetId
    }
    return null
  })
  const [showDeletedNote, setShowDeletedNote] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [isMobile, setIsMobile] = useState(false)
  const [showAuthError, setShowAuthError] = useState(false)
  const [useEmbedded, setUseEmbedded] = useState(() => {
    return localStorage.getItem('sheetEmbedPreference') === 'true'
  })
  const [highlightSave, setHighlightSave] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [noTransfers, setNoTransfers] = useState(false)
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
    title: `${currentYear} Transfer Destinations`,
    roster: userRoster,
    structure: `This sheet has ONE tab: "Transfer Destinations". It has 2 columns total (A = Player Name, B = New Team). Row 1 is the protected header row. Column A (Player Name) is PRE-FILLED with outgoing transfers and PROTECTED — do NOT output column A. Column B is the only editable column — a STRICT dropdown of team abbreviations.

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. Output ONLY column B. NEVER output column A, the header row, or any commentary.
2. Output format is a SINGLE column of values — one value per line — NO tabs, NO extra columns.
3. Row order must match the pre-filled Player Name rows EXACTLY from top to bottom as shown in the screenshot. If the sheet shows N pre-filled players, output EXACTLY N lines (even if some are blank).
4. Every non-blank value MUST be a team abbreviation from the team-abbreviation mapping provided at the bottom of this prompt (format: ABBR = Full Name). Examples: BAMA, OSU, UGA, TEX.
5. NEVER use full team names ("Alabama"), nicknames ("Crimson Tide"), mascots ("Tide"), city names, or conference names. The column is a STRICT dropdown — wrong spelling / wrong casing / free text will be silently rejected.
6. Case must match the mapping exactly — abbreviations are typically all-uppercase but follow the mapping below.
7. BLANK LINE if the destination is unknown — leave the line empty (an empty string between two newlines). Do NOT guess, NOT use "UNK", "N/A", "TBD", or "-".
8. No header row, no commentary, no totals, no explanation text.
9. If the screenshot shows the player has withdrawn / is no longer transferring, leave that line blank.

═══════════════════════════════════════════════════════════
TAB: "Transfer Destinations" — paste at cell B2 of the "Transfer Destinations" tab
═══════════════════════════════════════════════════════════

Column layout:

Col | Header (row 1, protected) | Pre-filled / protected?          | Your value
----+---------------------------+----------------------------------+-----------------------------------
 A  | Player Name               | Pre-filled (outgoing transfers) — PROTECTED | DO NOT OUTPUT
 B  | New Team                  | Empty — EDITABLE dropdown        | Team abbreviation from mapping (or BLANK)

───────────────────────────────────────────────────────────
COLUMN B — New Team — Allowed values:
Any team abbreviation from the team-abbreviation mapping provided at the bottom of this prompt (format: ABBR = Full Name). Use the abbreviation exactly as shown (e.g. BAMA for Alabama, OSU for Ohio State, MIA for Miami (FL), M-OH for Miami (OH)).

Leave the line BLANK if the destination is not visible/known in the screenshots — a blank is the correct answer for unknown.

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== TRANSFER DESTINATIONS — paste at cell B2 of "Transfer Destinations" tab ===
<team abbr or blank>
<team abbr or blank>
<team abbr or blank>
…one line per pre-filled player, in the EXACT order shown in the screenshots

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] Exactly N lines, where N = number of pre-filled Player Name rows visible in the screenshots
[ ] Every non-blank value is an exact match for an abbreviation in the mapping (case-sensitive)
[ ] No full team names, nicknames, mascots, cities, conferences
[ ] No tabs, no commas, no other columns
[ ] Blank lines used for unknown destinations — nothing invented, no "UNK"/"N/A"/"TBD"
[ ] No header row, no commentary, no totals`,
    includeTeamMap: true,
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

  // Get transferring players (those leaving via transfer - NOT graduating or pro draft)
  // Reads from BOTH playersLeavingByYear AND player.leavingYear/leavingReason
  const getTransferringPlayers = () => {
    const playersLeavingThisYear = currentDynasty?.playersLeavingByYear?.[currentYear] || []
    const nonTransferReasons = ['Graduating', 'Pro Draft']

    // Source 1: Players from playersLeavingByYear
    const transfersFromList = playersLeavingThisYear
      .filter(p => p.reason && !nonTransferReasons.includes(p.reason))
      .map(leaving => {
        const player = (currentDynasty?.players || []).find(p => p.name === leaving.playerName || p.pid === leaving.pid)
        return {
          name: leaving.playerName,
          pid: leaving.pid || player?.pid,
          position: player?.position || ''
        }
      })

    // Source 2: Players with leavingYear set on their player record
    const transfersFromPlayerRecord = (currentDynasty?.players || [])
      .filter(p =>
        p.leavingYear === currentYear &&
        p.leavingReason &&
        !nonTransferReasons.includes(p.leavingReason)
      )
      .map(player => ({
        name: player.name,
        pid: player.pid,
        position: player.position || ''
      }))

    // Combine both sources
    const allTransfers = [...transfersFromList, ...transfersFromPlayerRecord]

    // Deduplicate by player name (in case same player appears in both sources)
    const seen = new Set()
    return allTransfers.filter(p => {
      if (seen.has(p.name)) return false
      seen.add(p.name)
      return true
    })
  }

  // Create sheet when modal opens (only if no existing sheet for this season)
  useEffect(() => {
    const createSheet = async () => {
      if (isOpen && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote && !noTransfers) {
        // Check if dynasty already has a sheet for this season (avoid race with restore effect)
        if (
          currentDynasty?.transferDestinationsSheetId &&
          currentDynasty?.transferDestinationsSheetYear === currentYear
        ) {
          const stillExists = await sheetExists(currentDynasty.transferDestinationsSheetId)
          if (stillExists) {
            setSheetId(currentDynasty.transferDestinationsSheetId)
            return
          }
          await updateDynasty(currentDynasty.id, {
            transferDestinationsSheetId: null,
            transferDestinationsSheetYear: null
          })
          // stale sheet (trashed in Drive); fall through to regenerate
        }

        const transferringPlayers = getTransferringPlayers()

        if (transferringPlayers.length === 0) {
          setNoTransfers(true)
          return
        }

        // Set ref immediately to prevent concurrent calls (state updates are async)
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          const sheetInfo = await createTransferDestinationsSheet(
            currentDynasty?.teamName || 'Dynasty',
            currentYear,
            transferringPlayers,
            currentDynasty?.teams || currentDynasty?.customTeams
          )
          setSheetId(sheetInfo.spreadsheetId)

          // Save sheet ID and year to dynasty so we can reuse it
          await updateDynasty(currentDynasty.id, {
            transferDestinationsSheetId: sheetInfo.spreadsheetId,
            transferDestinationsSheetYear: currentYear
          })
        } catch (error) {
          console.error('Failed to create transfer destinations sheet:', error)
          if (error.message?.includes('OAuth') || error.message?.includes('access token')) {
            setShowAuthError(true)
          }
        } finally {
          setCreatingSheet(false)
          creatingSheetRef.current = false
        }
      }
    }

    createSheet()
  }, [isOpen, user, sheetId, creatingSheet, currentDynasty?.id, retryCount, showDeletedNote, noTransfers, currentYear])

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShowDeletedNote(false)
      setNoTransfers(false)
      creatingSheetRef.current = false
    }
  }, [isOpen])

  // Restore sheetId from dynasty when modal re-opens (e.g. after app reload)
  useEffect(() => {
    if (isOpen && !sheetId && !creatingSheet && !creatingSheetRef.current) {
      if (
        currentDynasty?.transferDestinationsSheetId &&
        currentDynasty?.transferDestinationsSheetYear === currentYear
      ) {
        const candidateId = currentDynasty.transferDestinationsSheetId
        ;(async () => {
          const stillExists = await sheetExists(candidateId)
          if (stillExists) {
            setSheetId(candidateId)
            return
          }
          await updateDynasty(currentDynasty.id, {
            transferDestinationsSheetId: null,
            transferDestinationsSheetYear: null
          })
          // stale sheet (trashed in Drive); fall through to regenerate
        })()
      }
    }
  }, [isOpen])

  const handleSyncFromSheet = async () => {
    if (!sheetId) return

    setSyncing(true)
    try {
      const destinations = await readTransferDestinationsFromSheet(sheetId)
      await onSave(destinations)
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
      const destinations = await readTransferDestinationsFromSheet(sheetId)
      await onSave(destinations)

      // Move sheet to trash and clear saved reference
      await deleteGoogleSheet(sheetId)
      await updateDynasty(currentDynasty.id, {
        transferDestinationsSheetId: null,
        transferDestinationsSheetYear: null
      })

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
      await updateDynasty(currentDynasty.id, {
        transferDestinationsSheetId: null,
        transferDestinationsSheetYear: null
      })
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

  const handleSkip = async () => {
    // No transfers, just save empty results and close
    await onSave([])
    onClose()
  }

  if (!isOpen) return null

  const embedUrl = sheetId ? getSheetEmbedUrl(sheetId, 'Transfer Destinations') : null
  const isLoading = creatingSheet
  const transferringPlayers = getTransferringPlayers()
  const transferCount = transferringPlayers.length

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
        <div className="h-[3px] w-full" style={{ backgroundColor: teamColors.primary }} aria-hidden="true" />
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-surface-4">
          <h2 className="text-2xl font-bold text-txt-primary">
            Transfer Destinations
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
        {noTransfers ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="card p-8 border-l-[3px] text-center max-w-sm" style={{ borderLeftColor: teamColors.primary }}>
              <p className="label-xs text-txt-tertiary mb-2">Status</p>
              <p className="text-xl font-bold text-txt-primary mb-2">No Outgoing Transfers</p>
              <p className="text-sm mb-6 text-txt-secondary">
                No players transferred out this year.
              </p>
              <button
                onClick={handleSkip}
                className="px-6 py-3 rounded-lg font-semibold hover:opacity-90"
                style={{ backgroundColor: teamColors.primary, color: getContrastTextColor(teamColors.primary) }}
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
                  borderColor: teamColors.primary,
                  borderTopColor: 'transparent'
                }}
              />
              <p className="text-lg font-semibold text-txt-primary">
                Creating Transfer Destinations Sheet...
              </p>
              <p className="text-sm mt-2 text-txt-secondary">
                Pre-filling {transferCount} outgoing transfer{transferCount !== 1 ? 's' : ''}
              </p>
              <SheetLoadingHint active={isLoading} />
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="card p-8 border-l-[3px] text-center max-w-sm" style={{ borderLeftColor: teamColors.primary }}>
              <p className="label-xs text-txt-tertiary mb-2">Status</p>
              <p className="text-xl font-bold text-txt-primary mb-2">Saved &amp; Moved to Trash</p>
              <p className="text-sm text-txt-secondary">Transfer destinations saved. Player profiles updated.</p>
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
                      backgroundColor: teamColors.primary,
                      color: getContrastTextColor(teamColors.primary)
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
                  <button onClick={() => setShowAIPrompt(true)} className="px-4 py-2 rounded-lg text-sm font-medium border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent">AI Prompt</button>
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
                  className="text-xs px-3 py-1 rounded-full border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent"
                >
                  {useEmbedded ? '← Back to default view' : 'Try embedded view (beta)'}
                </button>
              </div>
            )}

            {isMobile || !useEmbedded ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                <h3 className="label-xs text-txt-tertiary mb-2">Data Entry</h3>
                <p className="text-2xl font-bold text-txt-primary mb-6">Edit in Google Sheets</p>
                <div className="text-left mb-6 max-w-sm w-full card p-4 border-l-[3px]" style={{ borderLeftColor: teamColors.primary }}>
                  <p className="label-xs text-txt-tertiary mb-3">Instructions</p>
                  <ol className="text-sm space-y-2 text-txt-secondary">
                    <li className="flex gap-3"><span className="font-bold text-txt-primary tabular-nums">1.</span><span>Tap the button below to open Google Sheets</span></li>
                    <li className="flex gap-3"><span className="font-bold text-txt-primary tabular-nums">2.</span><span>Outgoing transfers are pre-filled by name</span></li>
                    <li className="flex gap-3"><span className="font-bold text-txt-primary tabular-nums">3.</span><span>Select the team each player transferred to from the dropdown</span></li>
                    <li className="flex gap-3"><span className="font-bold text-txt-primary tabular-nums">4.</span><span>Return here and tap "Save" to update player profiles</span></li>
                  </ol>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-3 mb-6">
                  <a
                    href={`https://docs.google.com/spreadsheets/d/${sheetId}/edit`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-6 py-3 rounded-lg font-bold text-lg hover:opacity-90 transition-colors flex items-center gap-2"
                    style={{ backgroundColor: '#0F9D58', color: '#FFFFFF' }}
                  >
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/>
                      <path d="M7 7h2v2H7zm0 4h2v2H7zm0 4h2v2H7zm4-8h6v2h-6zm0 4h6v2h-6zm0 4h6v2h-6z"/>
                    </svg>
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
                <button
                  onClick={handleRegenerateSheet}
                  disabled={syncing || deletingSheet || regenerating}
                  className="px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-colors text-xs border-2"
                  style={{
                    backgroundColor: 'transparent',
                    borderColor: '#EF4444',
                    color: '#EF4444'
                  }}
                >
                  {regenerating ? 'Regenerating...' : 'Regenerate sheet'}
                </button>
              </div>
            ) : (
              /* Embedded iframe view */
              <div className="flex-1 rounded-lg overflow-hidden border border-surface-4">
                <iframe
                  src={embedUrl}
                  className="w-full h-full"
                  title="Transfer Destinations Sheet"
                />
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
        isOpen={showAuthError}
        onClose={() => setShowAuthError(false)}
        onRefresh={() => setRetryCount(c => c + 1)}
        teamColors={teamColors}
      />
      <AIPromptModal isOpen={showAIPrompt} onClose={() => setShowAIPrompt(false)} title={`${currentYear} Transfer Destinations`} prompt={aiPrompt} />
    </div>,
    document.body,
  )
}
