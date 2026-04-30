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
  createWeeklyScoresSheet,
  readWeeklyScoresFromSheet,
  deleteGoogleSheet,
  getSheetEmbedUrl,
  WEEKLY_SCORES_MAX_ROWS,
} from '../services/sheetsService'
import { getCurrentTeamTid } from '../data/teamRegistry'
import { getModalColors, getContrastTextColor } from '../utils/colorUtils'
import { buildAIPrompt } from '../utils/aiPrompt'
import SheetLoadingHint from './SheetLoadingHint'

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

/**
 * WeeklyScoresModal — paste-and-sync entry for league-wide regular-season
 * results. Mirrors BowlWeek1Modal's pattern: creates a Google Sheet with
 * abbreviation dropdowns + neutral-site flag, accepts a TSV paste from an
 * AI-built prompt, then reads results back into dynasty.games[] via
 * saveWeeklyScores. User-team games already entered via the schedule flow
 * are preserved (never overwritten by this modal).
 *
 * Props:
 *   isOpen     — modal visibility
 *   onClose    — close handler
 *   year       — season year for these scores
 *   week       — week number (0-15) being entered
 *   teamColors — { primary, secondary } for accent
 */
export default function WeeklyScoresModal({ isOpen, onClose, year, week, teamColors }) {
  const { currentDynasty, saveWeeklyScores } = useDynasty()
  const { user, refreshSession } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const modalColors = useMemo(() => getModalColors(teamColors), [teamColors])
  const [refreshing, setRefreshing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [deletingSheet, setDeletingSheet] = useState(false)
  const [creatingSheet, setCreatingSheet] = useState(false)
  const [sheetId, setSheetId] = useState(null)
  const [sheetTitle, setSheetTitle] = useState(null)
  const [showDeletedNote, setShowDeletedNote] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [isMobile, setIsMobile] = useState(false)
  const [showAuthError, setShowAuthError] = useState(false)
  const [useEmbedded, setUseEmbedded] = useState(() => localStorage.getItem('sheetEmbedPreference') === 'true')
  const [highlightSave, setHighlightSave] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [showAIPrompt, setShowAIPrompt] = useState(false)
  const creatingSheetRef = useRef(false)

  const userTid = currentDynasty ? getCurrentTeamTid(currentDynasty) : null
  const userTeam = userTid ? currentDynasty?.teams?.[userTid] : null
  const userAbbr = userTeam?.abbr || null

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `${year} Week ${week} Scores`,
    structure: `This sheet has ONE tab: "Week ${week} Scores". It is a freeform list of every FBS game played in Week ${week} of the ${year} season — across all 134 teams in the country. Each row is one game.

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. OUTPUT 7 COLUMNS PER ROW, in this exact order:
   Col A — HOME TEAM (abbreviation)
   Col B — HOME RANK (integer 1–25, or BLANK if unranked)
   Col C — HOME SCORE (integer)
   Col D — AWAY TEAM (abbreviation)
   Col E — AWAY RANK (integer 1–25, or BLANK if unranked)
   Col F — AWAY SCORE (integer)
   Col G — NEUTRAL? ("Y" if neutral site, otherwise leave BLANK)
2. ONE ROW PER GAME. The sheet allows up to ${WEEKLY_SCORES_MAX_ROWS} rows. The screenshots are the SOURCE OF TRUTH for how many games to output.
3. TEAM ABBREVIATIONS ONLY (columns A and D). Use ONLY values from the TEAM ABBREVIATIONS mapping at the bottom of this prompt. Columns A and D are STRICT dropdowns — wrong text is rejected by the sheet.
4. INTEGERS ONLY for scores — no decimals, no "pts", no commas. "24" never "1,234" never "24.0".
5. RANKS — read directly from the screenshot. If a team's name is preceded by "#11" or shown as a ranked team in the matchup line (e.g. "#7 Texas vs Oklahoma"), put 11 / 7 in the rank column. If the team is unranked (no number shown), LEAVE THE RANK COLUMN BLANK. Do not guess. Do not write "NR" or "—" — blank means unranked.
6. HOME / AWAY ORIENTATION matters. Identify the home team from the screenshot:
   - "VISITOR @ HOME" notation: the team after the "@" is HOME.
   - "HOME vs VISITOR" notation: the team before "vs" is HOME.
   - Logos on a TV scoreboard: the team listed BELOW (or on the right in some layouts) is typically HOME — confirm with the matchup line if shown.
   - If a game is at a neutral site, put EITHER team in column A (it doesn't matter which) and put "Y" in column G.
7. NEUTRAL FLAG: column G is "Y" only when the game is explicitly at a neutral site (kickoff games, neutral-site classics, conference championship venues). For ordinary home games leave column G BLANK. Do NOT write "N".
8. SKIP FCS opponents. If an FBS team played an FCS opponent and you cannot find the FCS team in the abbreviation mapping below, OMIT that game entirely — do not invent an abbreviation.
9. SKIP bye weeks. Teams on bye are not games and have no row.
10. NO HEADER ROW in the output. Do not include "HOME TEAM" / "AWAY TEAM" labels.
11. ${userAbbr ? `OPTIONAL — the user's own team is ${userAbbr}. If you can see their game in the screenshots, INCLUDE it; if not, that's fine — they enter their own game separately and any duplicate row is harmlessly preserved.` : `If the user's own team plays in this week, include the row anyway — duplicates with their separately-entered game are handled automatically.`}

═══════════════════════════════════════════════════════════
TAB: "Week ${week} Scores" — up to ${WEEKLY_SCORES_MAX_ROWS} rows × 7 columns
Paste your block at cell A2 of the "Week ${week} Scores" tab
═══════════════════════════════════════════════════════════

Col A (Home Team) | Col B (Home Rank) | Col C (Home Score) | Col D (Away Team) | Col E (Away Rank) | Col F (Away Score) | Col G (Neutral?)
------------------+-------------------+--------------------+-------------------+-------------------+--------------------+-----------------
team abbr         | 1–25 or BLANK     | integer            | team abbr         | 1–25 or BLANK     | integer            | "Y" or BLANK

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== WEEK ${week} SCORES — paste at cell A2 of "Week ${week} Scores" tab ===
<row1 HomeTeam>\\t<row1 HomeRank>\\t<row1 HomeScore>\\t<row1 AwayTeam>\\t<row1 AwayRank>\\t<row1 AwayScore>\\t<row1 Neutral?>
<row2 HomeTeam>\\t<row2 HomeRank>\\t<row2 HomeScore>\\t<row2 AwayTeam>\\t<row2 AwayRank>\\t<row2 AwayScore>\\t<row2 Neutral?>
... (one row per game in the screenshots)

(Each \\t above represents a LITERAL TAB character — use actual tab characters in your output, not the text "\\t".)

Example rows (for illustration only — your data should match the screenshots):
TEX\\t7\\t34\\tOU\\t\\t21\\t
ALA\\t\\t28\\tGA\\t3\\t31\\tY

(In the second row, Alabama is unranked so Col B is blank, Georgia is #3, and "Y" in Col G means neutral site.)

═══════════════════════════════════════════════════════════
FINAL CHECK before you send the answer
═══════════════════════════════════════════════════════════
[ ] Row count matches the number of FBS-vs-FBS games shown across the screenshots (FCS opponents and byes EXCLUDED)
[ ] Exactly 7 tab-separated values per row (6 tab characters per line) — even when rank/neutral columns are blank, the surrounding tabs MUST still be present
[ ] Columns A and D are team ABBREVIATIONS only, from the TEAM ABBREVIATIONS mapping
[ ] Scores in columns C and F are INTEGERS only — no commas, no decimals, no "pts"
[ ] Ranks in columns B and E are integers 1–25 or BLANK — never "NR", never "—", never 0
[ ] Column G is exactly "Y" or BLANK — never "N", never "neutral", never anything else
[ ] HOME team is correctly identified per game (visitor @ HOME convention) — when in doubt, mark Y in column G and pick either team for column A
[ ] No header row, no commentary, no follow-up text`,
    includeTeamMap: true,
  }), [year, week, userAbbr])

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

  // Build pre-fill from existing games for this year+week (excluding user's own game,
  // which is entered through the schedule flow and shouldn't appear in the sheet)
  const existingForPrefill = useMemo(() => {
    if (!isOpen || !currentDynasty) return []
    const yearNum = Number(year)
    const weekNum = Number(week)
    const teams = currentDynasty.teams || {}
    const out = []
    for (const g of (currentDynasty.games || [])) {
      if (!g) continue
      if (Number(g.year) !== yearNum || Number(g.week) !== weekNum) continue
      if (!g.team1Tid || !g.team2Tid) continue
      // Skip user-team games — they have their own entry path
      if (Number(g.team1Tid) === userTid || Number(g.team2Tid) === userTid) continue
      const homeTid = g.homeTeamTid ?? Number(g.team1Tid)
      const isNeutral = g.homeTeamTid == null
      const homeIsTeam1 = !isNeutral && homeTid === Number(g.team1Tid)
      const homeAbbr = teams[homeIsTeam1 ? g.team1Tid : g.team2Tid]?.abbr
        || teams[g.team1Tid]?.abbr
        || ''
      const awayAbbr = teams[homeIsTeam1 ? g.team2Tid : g.team1Tid]?.abbr
        || teams[g.team2Tid]?.abbr
        || ''
      const homeScore = homeIsTeam1 ? g.team1Score : g.team2Score
      const awayScore = homeIsTeam1 ? g.team2Score : g.team1Score
      const homeRankRaw = homeIsTeam1 ? g.team1Rank : g.team2Rank
      const awayRankRaw = homeIsTeam1 ? g.team2Rank : g.team1Rank
      const homeRank = typeof homeRankRaw === 'number' ? homeRankRaw : (homeRankRaw ? parseInt(homeRankRaw, 10) : null)
      const awayRank = typeof awayRankRaw === 'number' ? awayRankRaw : (awayRankRaw ? parseInt(awayRankRaw, 10) : null)
      out.push({
        homeTeam: homeAbbr,
        awayTeam: awayAbbr,
        homeScore: typeof homeScore === 'number' ? homeScore : null,
        awayScore: typeof awayScore === 'number' ? awayScore : null,
        homeRank: typeof homeRank === 'number' && !isNaN(homeRank) && homeRank >= 1 && homeRank <= 25 ? homeRank : null,
        awayRank: typeof awayRank === 'number' && !isNaN(awayRank) && awayRank >= 1 && awayRank <= 25 ? awayRank : null,
        neutral: isNeutral,
      })
    }
    return out
  }, [isOpen, currentDynasty, year, week, userTid])

  useEffect(() => {
    const createSheet = async () => {
      if (isOpen && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote) {
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          const sheetInfo = await createWeeklyScoresSheet(
            currentDynasty?.teamName || 'Dynasty',
            year,
            week,
            existingForPrefill,
            currentDynasty?.teams || currentDynasty?.customTeams,
          )
          setSheetId(sheetInfo.spreadsheetId)
          setSheetTitle(sheetInfo.sheetTitle)
        } catch (error) {
          console.error('Failed to create weekly scores sheet:', error)
          if (error.message?.includes('OAuth') || error.message?.includes('access token')) {
            setShowAuthError(true)
          } else {
            toast.error('Failed to create Google Sheet. Try again or sign back in.')
          }
        } finally {
          setCreatingSheet(false)
          creatingSheetRef.current = false
        }
      }
    }
    createSheet()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, user, sheetId, creatingSheet, currentDynasty?.id, retryCount, showDeletedNote, year, week])

  useEffect(() => {
    if (!isOpen) {
      setShowDeletedNote(false)
      creatingSheetRef.current = false
      setSheetId(null)
      setSheetTitle(null)
    }
  }, [isOpen])

  const handleSave = async (alsoDelete) => {
    if (!sheetId || !sheetTitle) return
    if (alsoDelete) setDeletingSheet(true); else setSyncing(true)
    try {
      const games = await readWeeklyScoresFromSheet(
        sheetId,
        sheetTitle,
        currentDynasty?.teams || currentDynasty?.customTeams,
      )
      await saveWeeklyScores(currentDynasty.id, games, year, week)
      const playedCount = games.filter(g => typeof g.homeScore === 'number' && typeof g.awayScore === 'number').length
      toast.success(`Saved ${playedCount} game${playedCount === 1 ? '' : 's'} for Week ${week}.`)

      if (alsoDelete) {
        try { await deleteGoogleSheet(sheetId) } catch (e) { console.error('Failed to delete sheet:', e) }
        setSheetId(null)
        setSheetTitle(null)
        setShowDeletedNote(true)
        setTimeout(() => onClose(), 2000)
      } else {
        onClose()
      }
    } catch (error) {
      console.error('Weekly scores save failed:', error)
      if (error.message?.includes('OAuth') || error.message?.includes('access token')) {
        setShowAuthError(true)
      } else {
        toast.error('Failed to save. Make sure data is properly formatted.')
      }
    } finally {
      setDeletingSheet(false)
      setSyncing(false)
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
      setSheetTitle(null)
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

  if (!isOpen) return null

  const embedUrl = sheetId && sheetTitle ? getSheetEmbedUrl(sheetId, sheetTitle) : null
  const isLoading = creatingSheet
  const headerLabel = `${year} Week ${week} Scores`

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-60 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4"
      style={{ margin: 0 }}
      onMouseDown={onClose}
    >
      <div
        className="card-elevated w-full sm:w-[95vw] max-h-[calc(100dvh-4rem)] sm:h-[95dvh] flex flex-col overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="h-[3px] w-full" style={{ backgroundColor: modalColors.accent }} aria-hidden="true" />
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-surface-4">
          <h2 className="text-2xl font-bold text-txt-primary">{headerLabel}</h2>
          <button
            aria-label="Close"
            onClick={onClose}
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
                  style={{ borderColor: modalColors.accent, borderTopColor: 'transparent' }}
                />
                <p className="text-lg font-semibold text-txt-primary">
                  Creating Week {week} Scores Sheet...
                </p>
                <p className="text-sm mt-2 text-txt-tertiary">
                  Setting up freeform sheet for up to {WEEKLY_SCORES_MAX_ROWS} games
                </p>
                <SheetLoadingHint active={isLoading} />
              </div>
            </div>
          ) : showDeletedNote ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="card p-8 border-l-[3px] text-center max-w-sm" style={{ borderLeftColor: modalColors.accent }}>
                <p className="label-xs text-txt-tertiary mb-2">Status</p>
                <p className="text-xl font-bold text-txt-primary mb-2">Saved &amp; Moved to Trash</p>
                <p className="text-sm text-txt-secondary">
                  Week {week} scores saved to your dynasty.
                </p>
              </div>
            </div>
          ) : sheetId ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {!isMobile && useEmbedded && (
                <div className="mb-3">
                  <div className="flex gap-3 flex-wrap items-center">
                    <button
                      onClick={() => handleSave(true)}
                      disabled={syncing || deletingSheet}
                      className={`px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-all text-sm ${highlightSave ? 'animate-pulse ring-4 ring-offset-2 scale-105' : ''}`}
                      style={{ backgroundColor: modalColors.accent, color: getContrastTextColor(modalColors.accent) }}
                    >
                      {deletingSheet ? 'Saving...' : 'Save & Move to Trash'}
                    </button>
                    <button
                      onClick={() => handleSave(false)}
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
                      style={{ backgroundColor: 'transparent', borderColor: '#EF4444', color: '#EF4444' }}
                    >
                      {regenerating ? 'Regenerating...' : 'Regenerate sheet'}
                    </button>
                  </div>
                </div>
              )}

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
                  <div className="text-left mb-6 max-w-sm w-full card p-4 border-l-[3px]" style={{ borderLeftColor: modalColors.accent }}>
                    <p className="label-xs text-txt-tertiary mb-3">Instructions</p>
                    <ol className="text-sm space-y-2 text-txt-secondary">
                      <li className="flex gap-3"><span className="font-bold text-txt-primary tabular-nums">1.</span><span>Tap "AI Prompt" to copy the prompt + send your scoreboard screenshots to your AI</span></li>
                      <li className="flex gap-3"><span className="font-bold text-txt-primary tabular-nums">2.</span><span>Open Google Sheets and paste the AI's TSV output at cell A2</span></li>
                      <li className="flex gap-3"><span className="font-bold text-txt-primary tabular-nums">3.</span><span>Return here and tap "Save" to sync results into your dynasty</span></li>
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
                    <button
                      onClick={() => setShowAIPrompt(true)}
                      className="px-4 py-2 rounded-lg text-sm font-medium border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent"
                    >
                      AI Prompt
                    </button>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 items-center justify-center mb-4">
                    <button
                      onClick={() => handleSave(true)}
                      disabled={syncing || deletingSheet}
                      className={`px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-all text-sm ${highlightSave ? 'animate-pulse ring-4 ring-offset-2 scale-105' : ''}`}
                      style={{ backgroundColor: modalColors.accent, color: getContrastTextColor(modalColors.accent) }}
                    >
                      {deletingSheet ? 'Saving...' : 'Save & Move to Trash'}
                    </button>
                    <button
                      onClick={() => handleSave(false)}
                      disabled={syncing || deletingSheet}
                      className="btn btn-secondary px-6 py-3 text-sm"
                    >
                      {syncing ? 'Syncing...' : 'Save & Keep Sheet'}
                    </button>
                  </div>

                  <button
                    onClick={handleRegenerateSheet}
                    disabled={syncing || deletingSheet || regenerating}
                    className="text-xs px-4 py-2 rounded-lg font-medium hover:opacity-90 transition-colors border mb-4"
                    style={{ backgroundColor: 'transparent', borderColor: '#EF4444', color: '#EF4444' }}
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
                      title={`Week ${week} Scores Google Sheet`}
                      onSessionError={() => setShowAuthError(true)}
                    />
                  </div>
                  <div className="text-xs mt-2 space-y-1" style={{ color: modalColors.textMuted }}>
                    <p><strong>Columns:</strong> Home Team | Home Rank | Home Score | Away Team | Away Rank | Away Score | Neutral?</p>
                    <p>Rank columns: enter 1–25 if the team was ranked, or leave blank. "Y" in Neutral marks neutral-site games (kickoff classics, etc).</p>
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
                        if (success) setRetryCount(c => c + 1)
                      } catch (e) {
                        console.error('Refresh failed:', e)
                      }
                      setRefreshing(false)
                    }}
                    disabled={refreshing}
                    className="px-4 py-2 rounded font-semibold transition-colors"
                    style={{
                      backgroundColor: modalColors.accent,
                      color: getContrastTextColor(modalColors.accent),
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

      <AuthErrorModal
        isOpen={showAuthError}
        onClose={() => setShowAuthError(false)}
        onRefresh={() => setRetryCount(c => c + 1)}
        teamColors={teamColors}
      />

      <AIPromptModal
        isOpen={showAIPrompt}
        onClose={() => setShowAIPrompt(false)}
        title={`${year} Week ${week} Scores`}
        prompt={aiPrompt}
        pasteTarget={`Cell A2 of the "Week ${week} Scores" tab`}
      />
    </div>,
    document.body,
  )
}
