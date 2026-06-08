import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty, getCustomConferencesForYear } from '../context/DynastyContext'
import { conferenceTeams as DEFAULT_CONFERENCE_TEAMS } from '../data/conferenceTeams'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import SheetModalHeader from './ui/SheetModalHeader'
import SheetModalAIHero from './ui/SheetModalAIHero'
import SheetModalFooter from './ui/SheetModalFooter'
import SheetManualEntry from './ui/SheetManualEntry'
import AuthErrorModal from './AuthErrorModal'
import { useAuthErrorHandler } from '../hooks/useAuthErrorHandler'
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

  const aiPrompt = useMemo(() => {
    // Single source of truth for the row order. Must mirror the array in
    // createConferenceChampionshipSheet() — that's the order column A is
    // pre-filled in. If you change one, change the other.
    const MASTER_CONFERENCES = [
      'American', 'ACC', 'Big 12', 'Big Ten', 'Conference USA',
      'MAC', 'Mountain West', 'Pac-12', 'SEC', 'Sun Belt',
    ]
    const sheetConferences = MASTER_CONFERENCES
    const totalRows = sheetConferences.length

    const rowTable = sheetConferences
      .map((conf, i) => {
        const sheetRow = String(i + 2).padStart(5, ' ')
        const confPadded = conf.padEnd(20, ' ')
        return `  ${sheetRow}    | ${confPadded} | <Team1>\\t<Team2>\\t<Score1>\\t<Score2>\\t<Rank1>\\t<Rank2>`
      })
      .join('\n')

    const outputTemplateLines = sheetConferences
      .map(conf => `<${conf} row: Team1\\tTeam2\\tScore1\\tScore2\\tRank1\\tRank2   OR blank line if unknown>`)
      .join('\n')

    const exclusionNote = `Output exactly ${totalRows} lines (one per conference, in the exact order listed below).`

    const orderListInline = sheetConferences.join(', ')

    // Per-conference team membership FOR THIS DYNASTY. Users routinely
    // realign — e.g. move Missouri + Georgia into the Pac-12 — so the AI
    // cannot infer membership from real-world knowledge. This block tells
    // it exactly which teams are eligible for each row's two dropdowns.
    const customConfs = getCustomConferencesForYear(currentDynasty, currentYear)
    const sourceMap = customConfs || DEFAULT_CONFERENCE_TEAMS
    const abbrToName = {}
    for (const t of Object.values(currentDynasty?.teams || {})) {
      if (t?.abbr && t?.name) abbrToName[String(t.abbr).toUpperCase()] = t.name
    }
    const membershipBlock = sheetConferences.map(conf => {
      const abbrs = Array.isArray(sourceMap[conf]) ? [...sourceMap[conf]] : []
      abbrs.sort((a, b) => String(a).localeCompare(String(b)))
      if (abbrs.length === 0) return `${conf}: (no teams assigned in this dynasty)`
      const entries = abbrs.map(a => {
        const upper = String(a).toUpperCase()
        const name = abbrToName[upper]
        return name ? `${upper} (${name})` : upper
      })
      return `${conf}: ${entries.join(', ')}`
    }).join('\n')

    return buildAIPrompt({
      title: `${currentYear} Conference Championships`,
      structure: `This sheet has ONE tab named "Conference Championships". 7 columns, ${totalRows + 1} rows (1 header + ${totalRows} conferences).

Column A (Conference name) is PRE-FILLED and PROTECTED — you never output it.
You fill columns B (Team 1), C (Team 2), D (Team 1 Score), E (Team 2 Score), F (Team 1 Rank), G (Team 2 Rank).

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. Output ONLY columns B, C, D, E, F, G. Never output column A (conference name) or the header row.
2. Row order is FIXED — it is NOT alphabetical. The sheet pre-fills column A in the EXACT order listed in the row table below. Your line N must correspond to the conference on sheet row N+1. Do not re-sort.
3. ${exclusionNote}
4. NO COMMAS in scores. Integers only. No decimals.
5. BLANK LINE (empty, no tabs) if you do not know the CC result for a conference. Never guess. Never invent scores. The blank still counts as that conference's line — keep position so all later lines stay aligned.
6. Team 1 and Team 2 must BOTH be members of the conference for that row, ACCORDING TO THE CONFERENCE MEMBERSHIP BLOCK BELOW — not according to real-world conferences. Users realign teams (e.g. Missouri and Georgia could be in the Pac-12 in this dynasty). Look every team up in the membership block before you write it.
7. Both teams must use UPPERCASE abbreviations from the mapping at the bottom — NEVER full names or nicknames.
8. ONE TSV block, preceded by the required paste-target label line above the fence (see Method A/B rules above).

═══════════════════════════════════════════════════════════
TAB "Conference Championships" — ${totalRows} rows × 6 output columns
Paste at cell B2 of the "Conference Championships" tab
═══════════════════════════════════════════════════════════

Column A is pre-filled with these ${totalRows} conferences in this EXACT order (this is NOT alphabetical — it is the literal order the sheet uses, hard-coded). Match this order line-for-line:

Sheet Row | Col A (PROTECTED)    | Your output: Team1\\tTeam2\\tScore1\\tScore2\\tRank1\\tRank2
----------+----------------------+--------------------------------------------------------------
${rowTable}

Order in plain words: ${orderListInline}.

═══════════════════════════════════════════════════════════
CONFERENCE MEMBERSHIP — DYNASTY-SPECIFIC, NOT REAL LIFE
═══════════════════════════════════════════════════════════
THIS IS THE MOST COMMON MISTAKE. READ TWICE.

The dynasty user can move any team between conferences. The list below is the ONLY source of truth for which teams belong in each conference for this dynasty/year. Do NOT use real-world conference knowledge. Both teams on each output line MUST appear in that row's conference list below — if a team is not listed in the conference for that row, that team is INELIGIBLE for that row.

${membershipBlock}

Per-line output (6 tab-separated fields):
<Team 1 Abbr>\\t<Team 2 Abbr>\\t<Team 1 Score>\\t<Team 2 Score>\\t<Team 1 Rank>\\t<Team 2 Rank>

Field formats:
- Team 1 (strict dropdown) — UPPERCASE abbreviation from the mapping at the bottom. Must be a member of the conference on that row.
- Team 2 (strict dropdown) — same rules. Must be a different team from Team 1, same conference.
- Team 1 Score — integer (no commas, no decimals). e.g. "31" not "31.0".
- Team 2 Score — integer (no commas, no decimals).
- Team 1 Rank — integer 1–25 if ranked, blank if unranked. e.g. "4" if ranked #4, "" if unranked.
- Team 2 Rank — integer 1–25 if ranked, blank if unranked.

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
[ ] Every non-blank line has exactly 6 tab-separated fields (5 tabs)
[ ] Both teams on each line appear in that row's conference list in the CONFERENCE MEMBERSHIP block (not your real-world knowledge)
[ ] Team 1 and Team 2 are different teams
[ ] All team values are uppercase abbreviations from the mapping — no full names
[ ] All scores are integers with no commas and no decimals
[ ] Ranks are integers 1–25 or blank — never 0, never a word
[ ] Blank entire lines for unknown results — nothing invented (still keeps the line position)
[ ] No Conference name, no header row, no commentary INSIDE the data. The paste-target label above the fence is required (see Method A/B rules above).`,
      includeTeamMap: true,
      dynastyTeams: currentDynasty?.teams,
    })
  }, [
    currentYear,
    currentDynasty?.teams,
    currentDynasty?.customConferences,
    currentDynasty?.customConferencesByYear,
    currentDynasty?.conferenceByTeamYear,
  ])

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

  // Create a CC sheet when modal opens if user is authenticated
  useEffect(() => {
    const createSheet = async () => {
      if (isOpen && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote) {
        // Set ref immediately to prevent concurrent calls (state updates are async)
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          // Always include all 10 conferences. The user's already-entered CC
          // game (if any) is pre-filled via existingCCData below.

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
                team2Score: g.team2Score ?? g.opponentScore,
                team1Rank: g.team1Rank ?? null,
                team2Rank: g.team2Rank ?? null,
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
            null,
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
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4 modal-backdrop-in"
      style={{ margin: 0 }}
      onMouseDown={handleClose}
    >
      <div
        className={`card-elevated w-full max-h-[calc(100dvh-4rem)] flex flex-col overflow-hidden ${
          useEmbedded
            ? 'sm:w-[95vw] sm:h-[95dvh]'
            : 'sm:max-w-[680px] sm:h-auto'
        }`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <SheetModalHeader eyebrow="Postseason" title={`${currentYear} Conference Championship Week`} onClose={handleClose} />

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
          <div className="flex-1 flex flex-col overflow-hidden gap-3">
            <SheetModalAIHero
              tagline="Skip the typing. Let AI fill the conference championships."
              buttons={[{ label: 'Copy AI Prompt', prompt: aiPrompt }]}
            />
            {isMobile || !useEmbedded ? (
              <SheetManualEntry sheetId={sheetId} />
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden min-h-0 border border-surface-4 rounded-lg">
                <SheetToolbar sheetId={sheetId} embedUrl={embedUrl} teamColors={teamColors} title="Conference Championships" />
              </div>
            )}
            <SheetModalFooter
              syncing={syncing}
              deletingSheet={deletingSheet}
              regenerating={regenerating}
              highlightSave={highlightSave}
              onSaveAndDelete={handleSyncAndDelete}
              onSaveAndKeep={handleSyncFromSheet}
              onDeleteSheetOnly={handleDeleteSheetOnly}
              onRegenerate={handleRegenerateSheet}
              showEmbeddedToggle={!isMobile}
              useEmbedded={useEmbedded}
              onToggleEmbedded={() => { const newValue = !useEmbedded; setUseEmbedded(newValue); localStorage.setItem('sheetEmbedPreference', newValue.toString()); }}
            />
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
    </div>,
    document.body
  )
}
