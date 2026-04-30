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
EXHAUSTIVENESS — THE #1 FAILURE MODE OF THIS TASK
═══════════════════════════════════════════════════════════
The most common way you fail this task is by under-reporting games. A full FBS week typically has 50–70 games. The user's screenshots show every one of them — usually as a scrollable SCORES/SCHEDULES list in EA College Football 26, sometimes split across multiple screenshots ("1 of 2", "2 of 2", etc.) or multiple conference filter views. Missing even one game corrupts the user's standings, rankings, and records.

Treat every visible matchup as in-scope. Specifically:

1. PROCESS EVERY SCREENSHOT. If the user attached more than one image, every image is a different view of the same week. Walk through ALL of them in order. Do NOT stop after the first. Do NOT assume later screenshots duplicate earlier ones — they almost never do. Combine the games into ONE deduplicated list (a game seen twice = one row, not two).

2. IF YOU SEE A LIST, EVERY ROW IN THE LIST IS A GAME. The CFB26 SCORES/SCHEDULES screen is a list of matchups — every row in that list is a separate FBS game with its own final score. Do not pick "the interesting ones" or "the highlight games" or "the ones with rankings." Output every row.

3. EXPECT A LONG OUTPUT. 50–70 rows for a full week is normal. The sheet supports up to ${WEEKLY_SCORES_MAX_ROWS} rows. A 5-row or 10-row output for a Week with a full slate is almost always wrong. Length is REQUIRED, not laziness.

4. NO SHORTCUTS. Never end with "...", "and so on", "[truncated for brevity]", "etc.". Never summarize. Never say "the rest of the games follow the same pattern." Output every row in full.

5. ASYMMETRIC COST. Missing a game is a SERIOUS failure (corrupts the user's data). Including a borderline/duplicate row is a MINOR issue (the sheet's importer collapses duplicates by team pair). When in doubt about whether something is a game in scope, INCLUDE it.

═══════════════════════════════════════════════════════════
PRE-EXTRACTION COUNT — do this BEFORE writing any TSV
═══════════════════════════════════════════════════════════
Before writing the output, perform this counting step internally:

A. Walk every screenshot top-to-bottom, left-to-right. For each one, count the matchups visible. Note partial rows at the edges of a screenshot — they may continue in the next image.

B. Sum the counts across screenshots, deduplicating any matchup visible in more than one image. Call this number N.

C. Your TSV output MUST contain EXACTLY N rows (ONE per game, including FBS-vs-FCS games — FCS placeholders like FCSE/FCSM/FCSN/FCSW are valid teams in this dynasty). If you find yourself emitting fewer than N rows, STOP and re-walk the screenshots — you missed something.

D. Common skip-trap to watch: Week 0 (and many early-season weeks) routinely have multiple FBS-vs-FCS warm-up games. Those games are NOT optional. The FCS opponent is in the team mapping below. INCLUDE every one of them.

E. If N > ${WEEKLY_SCORES_MAX_ROWS}, you have more games than the sheet supports — emit the first ${WEEKLY_SCORES_MAX_ROWS} games in the order they appear and add a one-line note AFTER the TSV block reporting how many were dropped.

═══════════════════════════════════════════════════════════
COMMON SCREENSHOT FORMATS — recognize these layouts
═══════════════════════════════════════════════════════════
• SCORES/SCHEDULES list view (CFB26): a vertical list of matchups, each row showing two team logos, scores, date. Every row = one game.
• Single-game scoreboard / final card: shows ONE game with both team helmets, scores, and a "FINAL" tag. One game per card.
• Conference filter view: same SCORES/SCHEDULES list filtered to one conference. Treat normally — every row is a game.
• Scoreboard ticker / rotation: a strip showing several games at once. Each "panel" = one game.
• Week recap / news page: may also list scores with summary text. Every score line is a game.

If the screenshot shows pagination (e.g. "1 of 2" badge, page indicator), there are MORE images. The user attached them. Use them.

═══════════════════════════════════════════════════════════
CRITICAL RULES — output format
═══════════════════════════════════════════════════════════
1. OUTPUT 7 COLUMNS PER ROW, in this exact order:
   Col A — HOME TEAM (abbreviation)
   Col B — HOME RANK (integer 1–25, or BLANK if unranked)
   Col C — HOME SCORE (integer)
   Col D — AWAY TEAM (abbreviation)
   Col E — AWAY RANK (integer 1–25, or BLANK if unranked)
   Col F — AWAY SCORE (integer)
   Col G — NEUTRAL? ("Y" if neutral site, otherwise leave BLANK)
2. ONE ROW PER GAME. The sheet allows up to ${WEEKLY_SCORES_MAX_ROWS} rows. The screenshots are the SOURCE OF TRUTH for how many games to output (see EXHAUSTIVENESS above).
3. TEAM ABBREVIATIONS ONLY (columns A and D). Use ONLY values from the TEAM ABBREVIATIONS mapping at the bottom of this prompt. Columns A and D are STRICT dropdowns — wrong text is rejected by the sheet.
4. INTEGERS ONLY for scores — no decimals, no "pts", no commas. "24" never "1,234" never "24.0".
5. RANKS — read directly from the screenshot. If a team's name is preceded by "#11" or shown as a ranked team in the matchup line (e.g. "#7 Texas vs Oklahoma"), put 11 / 7 in the rank column. If the team is unranked (no number shown), LEAVE THE RANK COLUMN BLANK. Do not guess. Do not write "NR" or "—" — blank means unranked.
6. HOME / AWAY ORIENTATION matters. Identify the home team from the screenshot:
   - "VISITOR @ HOME" notation: the team after the "@" is HOME.
   - "HOME vs VISITOR" notation: the team before "vs" is HOME.
   - Logos on a TV scoreboard: the team listed BELOW (or on the right in some layouts) is typically HOME — confirm with the matchup line if shown.
   - In CFB26's SCORES/SCHEDULES list, the team listed SECOND (right side) is the HOME team. The team listed FIRST (left side) is the AWAY team. If you cannot tell, mark Col G = "Y" (neutral) and pick either team for Col A.
   - If a game is at a neutral site, put EITHER team in column A (it doesn't matter which) and put "Y" in column G.
7. NEUTRAL FLAG: column G is "Y" only when the game is explicitly at a neutral site (kickoff games, neutral-site classics, conference championship venues). For ordinary home games leave column G BLANK. Do NOT write "N".
8. FCS OPPONENTS — INCLUDE THEM. EA College Football 26 represents real FCS schools as one of four generic FCS placeholders, and those placeholders ARE in the team mapping at the bottom of this prompt (typically FCSE, FCSM, FCSN, FCSW — but follow whatever appears in your mapping). When a Power-or-Group-of-5 FBS team plays an FCS opponent in Week 0 (or later), that game IS in scope — find the matching FCS placeholder abbreviation in the mapping and write the row. Do NOT drop FCS games — they're part of the user's records.
9. UNKNOWN ABBREVIATIONS — never invent. If you cannot find a team in the mapping AT ALL after a careful re-scan, OMIT that game (rare — almost everything an in-game screenshot shows is in the mapping, including all FBS teams, FCS placeholders, and any user-renamed teambuilder teams). Re-check the mapping CAREFULLY before omitting — it includes every valid abbreviation for this dynasty.
10. SKIP bye weeks. Teams on bye are not games and have no row.
11. NO HEADER ROW in the output. Do not include "HOME TEAM" / "AWAY TEAM" labels.
12. ${userAbbr ? `OPTIONAL — the user's own team is ${userAbbr}. If you can see their game in the screenshots, INCLUDE it; if not, that's fine — they enter their own game separately and any duplicate row is harmlessly preserved.` : `If the user's own team plays in this week, include the row anyway — duplicates with their separately-entered game are handled automatically.`}

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
... (one row per game in the screenshots — DO NOT actually emit "..."; emit the FULL list)

(Each \\t above represents a LITERAL TAB character — use actual tab characters in your output, not the text "\\t".)

Example rows (for illustration only — your data should match the screenshots, and you should use ONLY abbreviations that appear in the mapping at the bottom of this prompt):
TEX\\t7\\t34\\tOU\\t\\t21\\t
BAMA\\t\\t28\\tUGA\\t3\\t31\\tY
LSU\\t\\t52\\tFCSE\\t\\t10\\t

(Row 1: Texas at home, ranked #7. Row 2: Alabama unranked, Georgia ranked #3, neutral site. Row 3: LSU hosts an FCS opponent — FCSE is the placeholder for FCS East in this dynasty's mapping. Use whichever FCS placeholder matches what the screenshot shows.)

═══════════════════════════════════════════════════════════
FINAL CHECK before you send the answer — actually run these
═══════════════════════════════════════════════════════════
Don't just glance at this list. Physically execute each check on your draft.

[ ] EXHAUSTIVENESS: count the games visible across ALL the user's screenshots (deduplicated, INCLUDING FBS-vs-FCS warm-ups). That number is N. Your TSV has EXACTLY N rows. If your row count is less than N, you missed games — go back to the screenshots and find them. A 2-row or 5-row output for a Week with a full slate is almost certainly wrong.
[ ] FCS GAMES INCLUDED: every FBS-vs-FCS game in the screenshots is a row in your output, mapped to the appropriate FCS placeholder (FCSE / FCSM / FCSN / FCSW or whatever appears in the team mapping below). Skipping a Week 0 FCS warm-up is a known failure mode — confirm you didn't.
[ ] EVERY SCREENSHOT PROCESSED: if the user sent multiple images (look for "1 of 2", "2 of 2" etc., or simply more than one attachment), confirm you read every one of them, not just the first.
[ ] NO TRUNCATION: your output does not end with "...", "[and the rest]", "etc.", or any phrase implying you stopped early. The full list goes through.
[ ] EXACTLY 7 tab-separated values per row (6 tab characters per line) — even when rank/neutral columns are blank, the surrounding tabs MUST still be present.
[ ] Columns A and D are team ABBREVIATIONS only, from the TEAM ABBREVIATIONS mapping (re-check before omitting any unfamiliar one).
[ ] Scores in columns C and F are INTEGERS only — no commas, no decimals, no "pts".
[ ] Ranks in columns B and E are integers 1–25 or BLANK — never "NR", never "—", never 0.
[ ] Column G is exactly "Y" or BLANK — never "N", never "neutral", never anything else.
[ ] HOME team correctly identified per game (visitor @ HOME convention; in CFB26 lists, RIGHT side = home) — when in doubt, mark Y in column G and pick either team for column A.
[ ] No header row, no commentary, no follow-up text (except the optional "X games dropped" note ONLY if N > ${WEEKLY_SCORES_MAX_ROWS}).`,
    includeTeamMap: true,
    dynastyTeams: currentDynasty?.teams,
  }), [year, week, userAbbr, currentDynasty?.teams])

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
