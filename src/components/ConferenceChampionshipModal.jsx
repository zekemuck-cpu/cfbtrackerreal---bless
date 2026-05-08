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
  createConferenceChampionshipSheet,
  readConferenceChampionshipsFromSheet,
  deleteGoogleSheet,
  getSheetEmbedUrl
} from '../services/sheetsService'
import { getGameTeamInfo, TEAMS } from '../data/teamRegistry'
import { getModalColors } from '../utils/colorUtils'
import { buildAIPrompt } from '../utils/aiPrompt'
import SheetLoadingHint from './SheetLoadingHint'

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export default function ConferenceChampionshipModal({ isOpen, onClose, onSave, currentYear, teamColors }) {
  const modalColors = useMemo(() => getModalColors(teamColors), [teamColors])
  const { currentDynasty } = useDynasty()
  const { user, signOut } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [syncing, setSyncing] = useState(false)
  const [deletingSheet, setDeletingSheet] = useState(false)
  const [creatingSheet, setCreatingSheet] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [sheetId, setSheetId] = useState(null)
  const [showDeletedNote, setShowDeletedNote] = useState(false)
  const auth = useAuthErrorHandler()
  const [isMobile, setIsMobile] = useState(false)

  const [useEmbedded, setUseEmbedded] = useState(() => {
    // Load preference from localStorage
    return localStorage.getItem('sheetEmbedPreference') === 'true'
  })
  const [highlightSave, setHighlightSave] = useState(false)
  const [showAIPrompt, setShowAIPrompt] = useState(false)

  // Determine which conference (if any) is excluded from the sheet because
  // the user already played their own CC game. Mirrors the logic in the
  // sheet-creation effect below so the AI prompt and the actual sheet stay
  // in sync. Returned as the *canonical* conference name from the master
  // list so the prompt can match it case-insensitively against that list.
  // The MASTER_CONFERENCES order here MUST exactly match the order used by
  // createConferenceChampionshipSheet() in services/sheetsService.js.
  const excludeConferenceForPrompt = useMemo(() => {
    const MASTER_CONFERENCES = [
      'American', 'ACC', 'Big 12', 'Big Ten', 'Conference USA',
      'MAC', 'Mountain West', 'Pac-12', 'SEC', 'Sun Belt',
    ]
    const userCCGame = currentDynasty?.games?.find(
      g => g.isConferenceChampionship && Number(g.year) === Number(currentYear) && g.userTeam
    )
    const raw = userCCGame?.conference || currentDynasty?.conference || null
    if (!raw) return null
    const norm = String(raw).toLowerCase()
    return MASTER_CONFERENCES.find(c => c.toLowerCase() === norm) || null
  }, [currentDynasty?.games, currentDynasty?.conference, currentYear])

  const aiPrompt = useMemo(() => {
    // Single source of truth for the row order. Must mirror the array in
    // createConferenceChampionshipSheet() — that's the order column A is
    // pre-filled in. If you change one, change the other.
    const MASTER_CONFERENCES = [
      'American', 'ACC', 'Big 12', 'Big Ten', 'Conference USA',
      'MAC', 'Mountain West', 'Pac-12', 'SEC', 'Sun Belt',
    ]
    const sheetConferences = excludeConferenceForPrompt
      ? MASTER_CONFERENCES.filter(c => c !== excludeConferenceForPrompt)
      : MASTER_CONFERENCES
    const totalRows = sheetConferences.length

    // Build the row table dynamically so sheet row numbers stay correct
    // when a conference is excluded (rows shift up — there is no gap).
    const rowTable = sheetConferences
      .map((conf, i) => {
        const sheetRow = String(i + 2).padStart(5, ' ')
        const confPadded = conf.padEnd(20, ' ')
        return `  ${sheetRow}    | ${confPadded} | <Team1 abbr>\\t<Team2 abbr>\\t<int>\\t<int>`
      })
      .join('\n')

    const outputTemplateLines = sheetConferences
      .map(conf => `<${conf} row: Team1\\tTeam2\\tScore1\\tScore2   OR blank line if unknown>`)
      .join('\n')

    const exclusionNote = excludeConferenceForPrompt
      ? `IMPORTANT — the "${excludeConferenceForPrompt}" conference is EXCLUDED from this sheet because the user already entered their own CC game for that conference. Output exactly ${totalRows} lines (NOT 10). Do NOT output a "${excludeConferenceForPrompt}" row at all.`
      : `Output exactly ${totalRows} lines (one per conference, in the exact order listed below).`

    const orderListInline = sheetConferences.join(', ')

    return buildAIPrompt({
      title: `${currentYear} Conference Championships`,
      structure: `This sheet has ONE tab named "Conference Championships". 5 columns, ${totalRows + 1} rows (1 header + ${totalRows} conferences).

Column A (Conference name) is PRE-FILLED and PROTECTED — you never output it.
You fill columns B (Team 1), C (Team 2), D (Team 1 Score), E (Team 2 Score).

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. Output ONLY columns B, C, D, E. Never output column A (conference name) or the header row.
2. Row order is FIXED — it is NOT alphabetical. The sheet pre-fills column A in the EXACT order listed in the row table below. Your line N must correspond to the conference on sheet row N+1. Do not re-sort.
3. ${exclusionNote}
4. NO COMMAS in scores. Integers only. No decimals.
5. BLANK LINE (empty, no tabs) if you do not know the CC result for a conference. Never guess. Never invent scores. The blank still counts as that conference's line — keep position so all later lines stay aligned.
6. Team 1 and Team 2 must BOTH be members of the conference for that row.
7. Both teams must use UPPERCASE abbreviations from the mapping at the bottom — NEVER full names or nicknames.
8. ONE TSV block. Label it with the paste target.

═══════════════════════════════════════════════════════════
TAB "Conference Championships" — ${totalRows} rows × 4 output columns
Paste at cell B2 of the "Conference Championships" tab
═══════════════════════════════════════════════════════════

Column A is pre-filled with these ${totalRows} conferences in this EXACT order (this is NOT alphabetical — it is the literal order the sheet uses, hard-coded). Match this order line-for-line:

Sheet Row | Col A (PROTECTED)    | Your output: Team1\\tTeam2\\tTeam1Score\\tTeam2Score
----------+----------------------+----------------------------------------------------
${rowTable}

Order in plain words: ${orderListInline}.

Per-line output (4 tab-separated fields):
<Team 1 Abbr>\\t<Team 2 Abbr>\\t<Team 1 Score>\\t<Team 2 Score>

Field formats:
- Team 1 (strict dropdown) — UPPERCASE abbreviation from the mapping at the bottom. Must be a member of the conference on that row.
- Team 2 (strict dropdown) — same rules. Must be a different team from Team 1, same conference.
- Team 1 Score — integer (no commas, no decimals). e.g. "31" not "31.0".
- Team 2 Score — integer (no commas, no decimals).

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== CONFERENCE CHAMPIONSHIPS — paste at cell B2 of "Conference Championships" tab ===
${outputTemplateLines}

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] Exactly ${totalRows} lines total, in this EXACT order: ${orderListInline}
[ ] First line is for ${sheetConferences[0]} (NOT alphabetical — match the row table)
[ ] Last line is for ${sheetConferences[totalRows - 1]}
${excludeConferenceForPrompt ? `[ ] No "${excludeConferenceForPrompt}" line — that conference is excluded` : ''}
[ ] Every non-blank line has exactly 4 tab-separated fields (3 tabs)
[ ] Both teams on each line are members of that row's conference
[ ] Team 1 and Team 2 are different teams
[ ] All team values are uppercase abbreviations from the mapping — no full names
[ ] All scores are integers with no commas and no decimals
[ ] Blank entire lines for unknown results — nothing invented (still keeps the line position)
[ ] No Conference name, no header row, no commentary in the output`,
      includeTeamMap: true,
      dynastyTeams: currentDynasty?.teams,
    })
  }, [currentYear, currentDynasty?.teams, excludeConferenceForPrompt])

  // Ref to prevent concurrent sheet creation (state updates are async, refs are immediate)
  const creatingSheetRef = useRef(false)

  useEffect(() => {
    setIsMobile(isMobileDevice())
    const handleResize = () => setIsMobile(isMobileDevice())
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

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

  // Create a CC sheet when modal opens if user is authenticated
  useEffect(() => {
    const createSheet = async () => {
      if (isOpen && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote) {
        // Set ref immediately to prevent concurrent calls (state updates are async)
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          // Check if user played in a CC game this year - if so, exclude their conference
          // Debug: log all CC games to help diagnose
          const allCCGames = currentDynasty?.games?.filter(g => g.isConferenceChampionship) || []
          console.log('[CC Modal] All CC games:', allCCGames.map(g => ({ year: g.year, yearType: typeof g.year, conf: g.conference, userTeam: g.userTeam })))
          console.log('[CC Modal] currentYear:', currentYear, 'type:', typeof currentYear)

          // Find user's CC game - must have userTeam set (not just any CC game)
          const userCCGame = currentDynasty?.games?.find(
            g => g.isConferenceChampionship && Number(g.year) === Number(currentYear) && g.userTeam
          )
          // Get user's conference from:
          // 1. The user's CC game itself (most reliable - it has the conference they played in)
          // 2. Fallback to dynasty.conference
          const userConference = userCCGame?.conference || currentDynasty?.conference || null
          console.log('[CC Modal] User conference:', userConference, 'userCCGame exists:', !!userCCGame, 'userCCGame:', userCCGame)
          const excludeConference = userCCGame ? userConference : null
          console.log('[CC Modal] excludeConference:', excludeConference)

          // Get existing CC data for pre-filling from multiple sources
          const teams = currentDynasty?.teams || TEAMS

          // 1. Get CC games from games[] array (has actual scores)
          const ccGamesFromArray = (currentDynasty?.games || [])
            .filter(g => (g.isConferenceChampionship || g.gameType === 'conference_championship') && Number(g.year) === Number(currentYear))
            .map(g => {
              // Handle both unified format (team1Tid/team2Tid) and legacy format
              let team1, team2
              if (g.team1Tid && g.team2Tid) {
                const t1Info = getGameTeamInfo(teams, g.team1Tid)
                const t2Info = getGameTeamInfo(teams, g.team2Tid)
                team1 = t1Info?.abbr || g.team1
                team2 = t2Info?.abbr || g.team2
              } else if (g.userTeam && g.opponent) {
                // Legacy user game format
                team1 = g.userTeam
                team2 = g.opponent
              } else {
                team1 = g.team1
                team2 = g.team2
              }

              return {
                conference: g.conference,
                team1: team1,
                team2: team2,
                team1Score: g.team1Score ?? g.teamScore,
                team2Score: g.team2Score ?? g.opponentScore
              }
            })
            .filter(cc => cc.conference) // Must have conference name

          // 2. Get any additional data from conferenceChampionshipsByYear
          const ccFromByYear = currentDynasty?.conferenceChampionshipsByYear?.[currentYear] || []

          // 3. Merge: games[] data takes precedence (has scores), then conferenceChampionshipsByYear
          const existingByConference = {}
          // Add conferenceChampionshipsByYear data first
          ccFromByYear.forEach(cc => {
            if (cc?.conference) {
              existingByConference[cc.conference] = cc
            }
          })
          // Override with games[] data (more complete with scores)
          ccGamesFromArray.forEach(cc => {
            existingByConference[cc.conference] = cc
          })

          const existingCCData = Object.values(existingByConference)
          console.log('[CC Modal] existingCCData for prefill:', existingCCData)

          const sheetInfo = await createConferenceChampionshipSheet(
            currentDynasty?.teamName || 'Dynasty',
            currentYear,
            excludeConference,
            existingCCData,
            currentDynasty?.teams || currentDynasty?.customTeams
          )
          setSheetId(sheetInfo.spreadsheetId)
        } catch (error) {
          console.error('Failed to create CC sheet:', error)
        } finally {
          setCreatingSheet(false)
          creatingSheetRef.current = false
        }
      }
    }

    createSheet()
  }, [isOpen, user, sheetId, creatingSheet, currentDynasty?.id, auth.retryCount, showDeletedNote])

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShowDeletedNote(false)
      setSheetId(null)
      creatingSheetRef.current = false
    }
  }, [isOpen])

  const handleSyncFromSheet = async () => {
    if (!sheetId) return

    setSyncing(true)
    try {
      console.log('[CC Modal] Reading from sheet:', sheetId)
      const championships = await readConferenceChampionshipsFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      console.log('[CC Modal] Read championships from sheet:', championships)
      console.log('[CC Modal] Calling onSave...')
      await onSave(championships)
      console.log('[CC Modal] onSave complete, closing modal')
      onClose()
    } catch (error) {
      console.error('[CC Modal] Error in handleSyncFromSheet:', error)
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
      console.log('[CC Modal] handleSyncAndDelete - Reading from sheet:', sheetId)
      const championships = await readConferenceChampionshipsFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      console.log('[CC Modal] handleSyncAndDelete - Read championships:', championships)
      console.log('[CC Modal] handleSyncAndDelete - Calling onSave...')
      await onSave(championships)
      console.log('[CC Modal] handleSyncAndDelete - onSave complete')

      // Move sheet to trash (keep sheet ID stored so user can restore if needed)
      await deleteGoogleSheet(sheetId)

      setSheetId(null)
      setShowDeletedNote(true)
      setTimeout(() => {
        onClose()
      }, 2500)
    } catch (error) {
      console.error('[CC Modal] Error in handleSyncAndDelete:', error)
      if (!auth.handleError(error)) {
        toast.error('Failed to sync from Google Sheets.')
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
      title: 'Delete this conference championship sheet?',
      message: 'This deletes the Google Sheet without applying any edits. Your dynasty conference championship data stays as-is.',
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

  const embedUrl = sheetId ? getSheetEmbedUrl(sheetId, 'Conference Championships') : null
  const isLoading = creatingSheet

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-60 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4 modal-backdrop-in"
      style={{ margin: 0 }}
      onMouseDown={handleClose}
    >
      <div
        className="card-elevated w-full sm:w-[95vw] max-h-[calc(100dvh-4rem)] sm:h-[95dvh] flex flex-col overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-surface-4">
          <h2 className="text-2xl font-bold text-txt-primary">
            Conference Championship Week
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
                Creating Conference Championship Sheet...
              </p>
              <p className="text-sm mt-2 text-txt-secondary">
                Setting up conferences and team dropdowns
              </p>
              <SheetLoadingHint active={isLoading} />
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="card p-8 border-l-[3px] text-center max-w-sm" style={{ borderLeftColor: 'var(--surface-5)' }}>
              <p className="label-xs text-txt-tertiary mb-2">Status</p>
              <p className="text-xl font-bold text-txt-primary mb-2">Saved &amp; Moved to Trash</p>
              <p className="text-sm text-txt-secondary">Conference Championship data saved to your dynasty.</p>
            </div>
          </div>
        ) : sheetId ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Action Buttons - only show at top for embedded view */}
            {!isMobile && useEmbedded && (
              <div className="mb-3 flex gap-3 flex-wrap items-center">
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
                  onClick={handleDeleteSheetOnly}
                  disabled={syncing || deletingSheet || regenerating}
                  className="px-4 py-2 rounded-lg font-semibold text-sm disabled:opacity-60 transition-colors border border-surface-4 hover:bg-surface-2 text-txt-secondary ml-auto"
                >
                  {deletingSheet ? 'Deleting…' : 'Delete Sheet (No Save)'}
                </button>
                <button
                  onClick={handleRegenerateSheet}
                  disabled={syncing || deletingSheet || regenerating}
                  className="btn btn-secondary text-sm"
                  style={{ opacity: 0.7 }}
                >
                  {regenerating ? 'Regenerating...' : 'Regenerate sheet'}
                </button>
                {highlightSave && (
                  <span className="text-xs font-medium animate-bounce" style={{ color: 'var(--text-primary)' }}>

                  </span>
                )}
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
                <div className="text-left mb-6 max-w-sm w-full card p-4 border-l-[3px]" style={{ borderLeftColor: 'var(--surface-5)' }}>
                  <p className="label-xs text-txt-tertiary mb-3">Instructions</p>
                  <ol className="text-sm space-y-2 text-txt-secondary">
                    <li className="flex gap-3"><span className="font-bold text-txt-primary tabular-nums">1.</span><span>Tap the button below to open Google Sheets</span></li>
                    <li className="flex gap-3"><span className="font-bold text-txt-primary tabular-nums">2.</span><span>Enter conference championship results</span></li>
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
                {highlightSave && (
                  <span className="text-sm font-medium animate-bounce mb-4" style={{ color: 'var(--text-primary)' }}>

                  </span>
                )}

                <div className="flex flex-col sm:flex-row gap-3 items-center justify-center">
                  <button
                    onClick={handleDeleteSheetOnly}
                    disabled={syncing || deletingSheet || regenerating}
                    className="text-sm underline text-txt-tertiary hover:text-txt-primary transition-colors disabled:opacity-50"
                  >
                    {deletingSheet ? 'Deleting…' : 'Delete Sheet (No Save)'}
                  </button>
                  <button
                    onClick={handleRegenerateSheet}
                    disabled={syncing || deletingSheet || regenerating}
                    className="text-sm underline text-txt-tertiary hover:text-txt-primary transition-colors"
                  >
                    {regenerating ? 'Regenerating...' : 'Messed up? Regenerate sheet'}
                  </button>
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
      <AIPromptModal isOpen={showAIPrompt} onClose={() => setShowAIPrompt(false)} title={`${currentYear} Conference Championships`} prompt={aiPrompt} pasteTarget={`Cell B2 of the "Conference Championships" tab`} />
    </div>,
    document.body
  )
}
