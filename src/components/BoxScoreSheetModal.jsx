import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import SheetToolbar from './SheetToolbar'
import AuthErrorModal from './AuthErrorModal'
import { useAuthErrorHandler } from '../hooks/useAuthErrorHandler'
import {
  createGameBoxScoreSheet,
  createScoringSummarySheet,
  createGameTeamStatsSheet,
  readGameBoxScoreFromSheet,
  readGameBoxScoreFromUnifiedTab,
  readScoringSummaryFromSheet,
  readGameTeamStatsFromSheet,
  deleteGoogleSheet,
  getSingleSheetEmbedUrl,
  sheetExists
} from '../services/sheetsService'
import { useDynasty, isPlayerOnRoster } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import SheetModalHeader from './ui/SheetModalHeader'
import SheetModalAIHero from './ui/SheetModalAIHero'
import SheetManualEntry from './ui/SheetManualEntry'
import SheetModalFooter from './ui/SheetModalFooter'
import { getCurrentTeamAbbr, getAbbrFromTeamName, getOriginalTeamAbbr, getTidFromAbbr } from '../data/teamRegistry'
import { getModalColors } from '../utils/colorUtils'
import { buildAIPrompt } from '../utils/aiPrompt'
import { getPlayerStatsForTid, getTeamStatsForTid, getPlayerStatsSheetIdForTid, canonicalBoxScore, setScoringSummary } from '../utils/boxScoreHelpers'
import { AI_UNIFIED_TAB, computeUnifiedTabLayout } from '../data/boxScoreConstants'
import SheetLoadingHint from './SheetLoadingHint'

/**
 * BoxScoreSheetModal - A reusable modal for box score Google Sheets
 *
 * Props:
 * - isOpen: boolean
 * - onClose: () => void
 * - onSave: (data) => void - Called with the synced data (stats or scoring summary)
 * - onSheetCreated: (sheetId) => void - Called when a new sheet is created
 * - sheetType: 'playerStats' | 'scoring' | 'teamStats'
 * - targetTid: number — required for sheetType === 'playerStats'.
 *              Identifies which team this sheet is for. The other team's
 *              tid is taken from the game (team1Tid / team2Tid).
 * - existingSheetId: string | null - Existing sheet ID if already created
 * - game: { id, week, year, opponent, location }
 * - teamColors: { primary, secondary }
 */
export default function BoxScoreSheetModal({
  isOpen,
  onClose,
  onSave,
  onSheetCreated,
  sheetType,
  targetTid = null,
  existingSheetId,
  game,
  teamColors
}) {
  const { currentDynasty, updateDynasty, addGame, patchGameFields, isViewOnly } = useDynasty()
  const { user } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()

  const auth = useAuthErrorHandler()
  const [syncing, setSyncing] = useState(false)
  const [deletingSheet, setDeletingSheet] = useState(false)
  const [creatingSheet, setCreatingSheet] = useState(false)
  const [sheetId, setSheetId] = useState(null)
  const [showDeletedNote, setShowDeletedNote] = useState(false)
  const [useEmbedded, setUseEmbedded] = useState(() => {
    return localStorage.getItem('sheetEmbedPreference') === 'true'
  })
  const [highlightSave, setHighlightSave] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [ignoreExistingSheetId, setIgnoreExistingSheetId] = useState(false)
  // Ref to prevent concurrent sheet creation (state updates are async, refs are immediate)
  const creatingSheetRef = useRef(false)

  // Resolve team abbreviations from game data
  // Try direct abbreviation fields first, then resolve from tids
  // Use explicit undefined checks to ensure we get strings, not undefined
  const resolvedTeam1 = game?.team1 || (game?.team1Tid ? getOriginalTeamAbbr(game.team1Tid) : null) || ''
  const resolvedTeam2 = game?.team2 || (game?.team2Tid ? getOriginalTeamAbbr(game.team2Tid) : null) || ''

  // Determine teams based on game data
  // Use homeTeamTid as the source of truth for determining home/away
  const userTeamAbbr = getCurrentTeamAbbr(currentDynasty) || currentDynasty?.teamName || ''
  // Ensure opponent is an abbreviation (convert full name if needed)
  const rawOpponent = game?.opponent || ''
  const opponentAbbr = getAbbrFromTeamName(rawOpponent) || rawOpponent

  // Determine home and away teams using homeTeamTid as source of truth
  // homeTeamTid = null means neutral site
  let homeTeamAbbr, awayTeamAbbr, homeTeamName, awayTeamName, homeTeamTid, awayTeamTid

  if (game?.homeTeamTid !== undefined) {
    // Use homeTeamTid to determine home/away (most reliable)
    const team1IsHome = game.homeTeamTid === game.team1Tid
    const team2IsHome = game.homeTeamTid === game.team2Tid

    if (team1IsHome) {
      homeTeamAbbr = resolvedTeam1 || 'Home'
      awayTeamAbbr = resolvedTeam2 || 'Away'
      homeTeamTid = game.team1Tid
      awayTeamTid = game.team2Tid
    } else if (team2IsHome) {
      homeTeamAbbr = resolvedTeam2 || 'Home'
      awayTeamAbbr = resolvedTeam1 || 'Away'
      homeTeamTid = game.team2Tid
      awayTeamTid = game.team1Tid
    } else {
      // Neutral site (homeTeamTid is null) - keep team1 as "home" and team2 as "away"
      // to match button labels in GameEdit (team1 Stats → homeStats, team2 Stats → awayStats)
      homeTeamAbbr = resolvedTeam1 || 'Team 1'
      awayTeamAbbr = resolvedTeam2 || 'Team 2'
      homeTeamTid = game.team1Tid
      awayTeamTid = game.team2Tid
    }
    homeTeamName = homeTeamAbbr
    awayTeamName = awayTeamAbbr
  } else {
    // Fallback to location field for legacy games
    const locationLower = (game?.location || '').toLowerCase()
    const isUserHome = locationLower === 'home' || locationLower === 'neutral'

    homeTeamAbbr = (isUserHome ? userTeamAbbr : opponentAbbr) || resolvedTeam2 || 'Home'
    awayTeamAbbr = (isUserHome ? opponentAbbr : userTeamAbbr) || resolvedTeam1 || 'Away'
    homeTeamName = (isUserHome ? currentDynasty?.teamName : opponentAbbr) || homeTeamAbbr
    awayTeamName = (isUserHome ? opponentAbbr : currentDynasty?.teamName) || awayTeamAbbr
    // For legacy games, try to get tid from abbreviation (dynasty-aware so
    // teambuilder-renamed slots resolve via their custom abbr)
    homeTeamTid = getTidFromAbbr(homeTeamAbbr, currentDynasty)
    awayTeamTid = getTidFromAbbr(awayTeamAbbr, currentDynasty)
  }

  // Get the game year (use game's year, fallback to dynasty's current year)
  const gameYear = game?.year || currentDynasty?.currentYear

  // Get the user-controlled team tid for the game's specific year
  // This ensures we only enforce strict dropdowns for the team the user controlled that season
  const userTidForGameYear = useMemo(() => {
    if (!gameYear) return null

    // First check coachTeamByYear for that specific year
    const yearRecord = currentDynasty?.coachTeamByYear?.[gameYear] ||
                       currentDynasty?.coachTeamByYear?.[String(gameYear)]
    if (yearRecord?.tid) return yearRecord.tid

    // Fallback: if game year is current year, use currentTid
    if (gameYear === currentDynasty?.currentYear && currentDynasty?.currentTid) {
      return currentDynasty.currentTid
    }

    return null
  }, [gameYear, currentDynasty?.coachTeamByYear, currentDynasty?.currentYear, currentDynasty?.currentTid])

  // Helper to get roster for a specific team using tid directly
  const getRosterForTeamByTid = (tid) => {
    if (!currentDynasty?.players || !tid) return []
    return currentDynasty.players
      .filter(p => isPlayerOnRoster(p, tid, gameYear))
      .map(p => p.name)
      .sort()
  }

  // Get rosters for home and away teams using tids directly
  const homeRoster = useMemo(() => getRosterForTeamByTid(homeTeamTid),
    [currentDynasty?.players, homeTeamTid, gameYear])
  const awayRoster = useMemo(() => getRosterForTeamByTid(awayTeamTid),
    [currentDynasty?.players, awayTeamTid, gameYear])

  // Roster objects ({name, jerseyNumber, position}) for AI prompt — used so the
  // AI can resolve abbreviated names (e.g. "A. Guess" → "Alex Guess").
  const getRosterObjectsForTeamByTid = (tid) => {
    if (!currentDynasty?.players || !tid) return []
    return currentDynasty.players
      .filter(p => isPlayerOnRoster(p, tid, gameYear))
      .map(p => ({ name: p.name, jerseyNumber: p.jerseyNumber, position: p.position }))
  }
  const homeRosterObjects = useMemo(() => getRosterObjectsForTeamByTid(homeTeamTid),
    [currentDynasty?.players, homeTeamTid, gameYear])
  const awayRosterObjects = useMemo(() => getRosterObjectsForTeamByTid(awayTeamTid),
    [currentDynasty?.players, awayTeamTid, gameYear])

  // Check if home/away teams are user-controlled FOR THIS GAME'S YEAR (for dropdown behavior)
  // Only the team the user controlled in the game's season should have strict dropdown
  const isHomeTeamUserControlled = userTidForGameYear && homeTeamTid === userTidForGameYear
  const isAwayTeamUserControlled = userTidForGameYear && awayTeamTid === userTidForGameYear

  // Player-stats sheets are now keyed by `targetTid` rather than home/away
  // — eliminates the storage ambiguity at neutral sites where "home" was
  // just team1 by convention. The "other" team is whichever of the
  // game's two tids isn't the target; falls back gracefully when only
  // one tid is known.
  const targetTidNum = targetTid != null ? Number(targetTid) : null
  const otherTidNum = (() => {
    if (targetTidNum == null) return null
    const t1 = game?.team1Tid != null ? Number(game.team1Tid) : null
    const t2 = game?.team2Tid != null ? Number(game.team2Tid) : null
    if (t1 != null && t1 !== targetTidNum) return t1
    if (t2 != null && t2 !== targetTidNum) return t2
    return null
  })()
  // Resolve target team's abbr/name through the existing home/away
  // computations so a teambuilder-renamed team gets the same label here
  // as it does everywhere else in the dynasty.
  const tidToSide = (tid) => {
    if (tid == null) return null
    if (Number(tid) === Number(homeTeamTid)) return 'home'
    if (Number(tid) === Number(awayTeamTid)) return 'away'
    return null
  }
  const targetSide = tidToSide(targetTidNum)
  const otherSide = tidToSide(otherTidNum)
  const targetTeamAbbr = targetSide === 'home' ? homeTeamAbbr : (targetSide === 'away' ? awayTeamAbbr : '')
  const targetTeamName = targetSide === 'home' ? homeTeamName : (targetSide === 'away' ? awayTeamName : '')
  const otherTeamAbbr  = otherSide  === 'home' ? homeTeamAbbr : (otherSide  === 'away' ? awayTeamAbbr : '')
  const targetRoster        = targetSide === 'home' ? homeRoster        : (targetSide === 'away' ? awayRoster        : [])
  const targetRosterObjects = targetSide === 'home' ? homeRosterObjects : (targetSide === 'away' ? awayRosterObjects : [])
  const isTargetUserControlled = userTidForGameYear && targetTidNum === Number(userTidForGameYear)

  // Determine title and team info based on sheet type
  const getSheetConfig = () => {
    switch (sheetType) {
      case 'playerStats':
        return {
          title: `${targetTeamAbbr || 'Team'} Player Stats`,
          teamAbbr: targetTeamAbbr,
          teamName: targetTeamName,
          opponentAbbr: otherTeamAbbr,
          roster: targetRoster,
          isUserControlled: !!isTargetUserControlled,
          // sheetIdKey is intentionally absent — player-stats sheet IDs
          // are stored tid-keyed (playerStatsSheetIdByTid[targetTid]),
          // not as a top-level field. saveSheetIdToGame branches on
          // sheetType to handle this.
          sheetIdKey: null,
          instructions: 'Enter player statistics for each category tab (Passing, Rushing, Receiving, etc.)'
        }
      case 'scoring':
        return {
          // User-facing label is "Plays" — same sheet supports both
          // scoring-only entry (legacy 9-col workflow) and full play-
          // by-play entry (15 cols × 300 rows). The Google Sheet's
          // tab name stays "Scoring Summary" for back-compat with
          // every existing dynasty's saved sheets.
          title: 'Plays',
          sheetIdKey: 'scoringSummarySheetId',
          instructions: 'Enter scoring plays or every play with the appropriate AI prompt below.'
        }
      case 'teamStats':
        return {
          title: 'Team Stats',
          sheetIdKey: 'teamStatsSheetId',
          instructions: 'Enter team statistics in each tab (one for each team)'
        }
      default:
        return { title: 'Stats', sheetIdKey: '', instructions: '' }
    }
  }

  const config = getSheetConfig()

  // Get dark theme modal colors
  const modalColors = useMemo(() => getModalColors(teamColors), [teamColors])

  // AI Prompt — varies by sheetType (player stats tabs vs scoring summary vs team stats)
  const aiPrompt = useMemo(() => {
    const weekLabel = game?.week != null ? `Week ${game.week}` : 'Game'
    const yearLabel = gameYear || ''
    const matchupLabel = `${awayTeamAbbr} @ ${homeTeamAbbr}`.trim()
    const baseTitle = `${yearLabel} ${weekLabel} ${matchupLabel}`.trim()

    // Determine which team (home/away) is user-controlled so we can label
    // the roster blocks correctly in scoring prompts.
    const userIsHome = userTidForGameYear && homeTeamTid === userTidForGameYear
    const userIsAway = userTidForGameYear && awayTeamTid === userTidForGameYear
    const scoringUserRoster = userIsHome ? homeRosterObjects : (userIsAway ? awayRosterObjects : [])
    const scoringOpponentRoster = userIsHome ? awayRosterObjects : (userIsAway ? homeRosterObjects : [])

    if (sheetType === 'scoring') {
      const allPlaysPrompt = buildAIPrompt({
        title: `${baseTitle} — All Plays`,
        roster: scoringUserRoster,
        opponentRoster: scoringOpponentRoster,
        rosterLabel: `${userIsHome ? homeTeamAbbr : awayTeamAbbr} ROSTER (user-controlled team — for team-assignment, see below)`,
        opponentRosterLabel: `${userIsHome ? awayTeamAbbr : homeTeamAbbr} ROSTER (opponent team — for team-assignment, see below)`,
        structure: `This is an OCR task: extract structured data from images into TSV. Prioritize responding quickly rather than thinking deeply. Extended thinking adds latency and is NOT helpful here — when in doubt, respond directly. Skip every preamble and begin output immediately with the first row's first character.

Output the full play-by-play of this game as 13-col TSV — one row per highlight line, chronological order (earliest first). The user will copy your reply and paste it at cell A2 of the "Scoring Summary" tab in Google Sheets, so the DATA block must contain ONLY tab-separated rows. No XML, no header row inside the data, no preamble or commentary other than the required paste-target label line above the fence (see Method A/B rules above).

═══════════════════════════════════════════════════════════
TRANSCRIBE, DON'T REASON
═══════════════════════════════════════════════════════════
100% transcription accuracy is required. Mechanical QC only — name spellings, numbers in the right cells, negatives preserved (-2 stays -2), chronological order, exactly 13 cols (12 tabs) per row.

You must NOT apply football reasoning on top:
  ✗ "Does -2 yards make sense?" — yes, write -2.
  ✗ Don't trace possession / drives / kickoff returns across plays.
  ✗ Don't compute or reconcile field-position math (${awayTeamAbbr} 14 + 31 = ${awayTeamAbbr} 45 — skip the check).
  ✗ Don't cross-check rosters every play. Look up each name ONCE, then trust.
  ✗ Don't "fix" what the screenshot says. Line and football logic disagree → the line wins.

If a cell is illegible or ambiguous, write \`?\` for that cell and move on. The user fixes \`?\` cells after.

═══════════════════════════════════════════════════════════
13 COLUMNS (TSV order — exactly 12 tabs per row)
═══════════════════════════════════════════════════════════
A Team        — "${homeTeamAbbr}" or "${awayTeamAbbr}". The offensive team. Required.
B Scorer      — the primary player named on the line. Required when one is named.
C Passer      — QB. Required on any pass play (complete / incomplete / sacked / INT / knocked away).
D Yards       — the yardage number the line states. Negative for losses & sacks. For FGs, the FG distance.
E Score Type  — ONLY when the play scores. See list below. Blank otherwise.
F PAT Result  — ONLY on TD rows when the PAT outcome is visible. Blank otherwise.
G Quarter     — "1"/"2"/"3"/"4"/"OT"/"2OT"/etc. Required.
H Time Left   — MM:SS with leading zeros. Required.
I Video Link  — blank.
J Down        — "1"/"2"/"3"/"4" if the line has "Nth & X" prefix. Blank for kickoffs/PATs.
K Distance    — number or "Goal" (when the line says "& Goal"). Blank if J blank.
L Field Pos   — copy verbatim from the prefix: "${homeTeamAbbr} 45", "${awayTeamAbbr} 7", "MID 50".
M Play Type   — see list below.

═══════════════════════════════════════════════════════════
PLAY TYPE (col M) — match by phrasing
═══════════════════════════════════════════════════════════
"X yard rush by Y"                  → Rush             B=Y
"X pass to Y for N yards"           → Pass Complete    B=Y      C=X
"X incomplete pass; intended for Y" → Pass Incomplete  B=Y      C=X
"X pass knocked away by Y"          → Pass Knocked Away B=Y     C=X
"X pass intercepted by Y"           → Pass Intercepted B=Y      C=X
"X sacked for a N yard loss"        → Sack             B=blank  C=X      D=-N
"Kickoff on FP. Y returns kick…"    → Kickoff Return   B=Y      L=FP
"N yard punt return by Y"           → Punt Return      B=Y
"Y N yard field goal good"          → Field Goal Made  B=Y      D=N      E=Field Goal
"Y missed a N yard field goal"      → Field Goal Missed B=Y     D=N
"Extra point good/missed/blocked by Y" → DO NOT EMIT a new row. Instead, set F on the preceding TD row to "Made XP" / "Missed XP" / "Blocked XP". See the PAT section below.
"Fumble recovered by Y for N yards" → Fumble Recovery  B=Y
"…penalty against…"                 → Penalty
"Safety"                            → Safety
Anything else                       → Other

PUNT DETECTION — EA CFB26 does NOT write "punts" in the play text. A punt
looks identical to a rush: "Y N yds" with no verb. Classify as Punt when:
  • The down is 4th AND
  • The play is just "[player name] [N] yds" (no pass/sack/rush keyword) AND
  • The player is a P (punter) in the roster, OR no matching skill player
    (QB/RB/WR/TE) exists with that name in the roster.
Set B = punter name, D = distance. Do NOT classify punts as Rush.

═══════════════════════════════════════════════════════════
COL A — derive from the PLAYER, never from Field Pos
═══════════════════════════════════════════════════════════
The team abbreviation inside Field Pos ("${homeTeamAbbr} 35", "${awayTeamAbbr} 7", "MID 50") is a GEOGRAPHIC label — it describes which END of the field the ball is on, NOT who has the ball. Confusing them flips col A on every play and ruins the sheet. This is the #1 failure mode for this task.

Rule: col A = team of the PLAYER named on the line.
  • Rush / Pass / Sack / FG / PAT → team of player in B (or C for sacks)
  • Kickoff Return / Punt Return / Pass Intercepted / Fumble Recovery → team of the returner / interceptor / recoverer (B). Possession just flipped — that's fine.

Anchor example: "Kickoff on ${homeTeamAbbr} 35. Jason Cummings returns kick for 19 yards." → A = ${awayTeamAbbr}. ("${homeTeamAbbr} 35" means ${homeTeamAbbr} is kicking FROM their own 35; Jason Cummings is ${awayTeamAbbr}'s returner.) Same pattern for "1st & Goal on ${homeTeamAbbr} 6" — that means someone is scoring AGAINST ${homeTeamAbbr}, so the offense is the OPPOSING team, not ${homeTeamAbbr}.

Look each player up in the rosters ONCE per game, then trust the assignment.

═══════════════════════════════════════════════════════════
SCORE TYPE (col E) WHEN A PLAY SCORES
═══════════════════════════════════════════════════════════
Rushing TD / Passing TD / Field Goal / Safety / Kick Return TD / Punt Return TD / INT Return TD / Fumble Return TD / Blocked Punt/FG TD

(No "PAT" — PAT attempts NEVER get their own row. See PAT section below.)

PAT Result (F) on TD rows only when visible: Made XP / Missed XP / Blocked XP / Converted 2PT / Failed 2PT

═══════════════════════════════════════════════════════════
PAT (extra-point attempts) — collapse into the TD row
═══════════════════════════════════════════════════════════
When a TD is followed by an extra-point attempt, you emit EXACTLY ONE row:
the TD row itself, with the PAT outcome encoded in column F.

  - TD row: F = "Made XP" (or "Missed XP" / "Blocked XP" / "Converted 2PT" / "Failed 2PT")
  - DO NOT emit a separate PAT row. No row with E = "PAT". No row with
    Play Type = "PAT". The kicker's name is not preserved in this sheet.

Why one row: the front-end reads column F off the TD row to compute the
running score (TD = 6 + XP = 1). A separate PAT row is redundant noise
in the play list — the Made/Missed/Blocked outcome is already visible
on the TD row's chip.

Worked example — Bama's 9-yd TD pass with a good XP:
  → BAMA  Lorenzo Corra  CJ Carr   9  Passing TD  Made XP  2  10:09        2  Goal  LSU 9  Pass Complete

That's it. ONE row. No follow-up "BAMA Rico Melendez ... PAT ... Made XP"
row underneath. Same rule for Missed XP / Blocked XP / Converted 2PT /
Failed 2PT — always one row, the TD row.

═══════════════════════════════════════════════════════════
ORDER — this is the #2 failure mode, read it slowly
═══════════════════════════════════════════════════════════
The game clock COUNTS DOWN inside each quarter (12:00 → 00:00). So within ONE quarter:
  • EARLIER in real time = HIGHER time-left value (12:00 is the FIRST play of the quarter)
  • LATER in real time  = LOWER  time-left value (00:00 is the LAST play of the quarter)

CFB26's Highlights screen lists plays REVERSE-chronologically — newest on TOP, oldest on BOTTOM. So inside one screenshot, the TOP row has the SMALLEST time-left value (most recent) and the BOTTOM row has the LARGEST time-left value (oldest).

Your output is CHRONOLOGICAL (earliest first):
  • Across quarters:        Q1 → Q2 → Q3 → Q4 → OT → 2OT → …
  • Within a quarter:        sort by time-left DESCENDING (12:00 first, 00:00 last)

═══════════════════════════════════════════════════════════
MULTI-SCREENSHOT MERGE — this is what bit the last run
═══════════════════════════════════════════════════════════
The user almost always pastes MORE THAN ONE screenshot per game, because the Highlights screen scrolls. Each screenshot is a WINDOW into the same Q1/Q2/Q3/Q4 list — and consecutive screenshots typically OVERLAP by a few rows as the user scrolls.

Treat all screenshots as ONE POOL of plays — do NOT emit them screenshot-by-screenshot:
  1. Collect every play visible across ALL screenshots into one list.
  2. DEDUPE: if (quarter, time-left, play-text) match between two screenshots (overlap during scroll), keep ONE copy.
  3. SORT globally: first by quarter ascending (1 → OT…), then within each quarter by time-left DESCENDING (12:00 → 00:00).
  4. Emit the sorted, deduped list in one continuous TSV block.

❌ FAIL MODE — emitting each screenshot as a contiguous block produces a sawtooth timeline like
   "Q4 6:34 … 3:24, Q4 6:21 … 2:20, Q4 10:24 … 7:00, Q4 12:00 … 10:34, Q4 0:59 … 0:10, Q4 2:16 … 0:48"
   — same quarter, but time-left jumps backward every time a new screenshot starts. Instantly visible to the user.

✅ Worked example (Q4 only):
  Screenshot A (top of Q4 list)    shows times: 2:20, 2:36, 5:01, 5:41, 6:21
  Screenshot B (middle of Q4 list) shows times: 5:01, 5:41, 6:21, 7:00, 7:42
  Screenshot C (bottom of Q4 list) shows times: 7:00, 7:42, 10:24, 11:57, 12:00

  Merged + deduped + sorted Q4 output (in this exact order):
    12:00, 11:57, 10:24, 7:42, 7:00, 6:21, 5:41, 5:01, 2:36, 2:20

  Times decrease monotonically through the quarter. Overlap rows (5:01, 5:41, 6:21, 7:00, 7:42) each appear ONCE.

SANITY CHECK before emitting: within one quarter, time-left must DECREASE monotonically as you move down rows. If a row's time-left is HIGHER than the previous row's (e.g. "6:21" written right after "3:24", or "10:24" after "2:20") — STOP. You skipped the merge step. Re-collect across screenshots and re-sort before emitting.

═══════════════════════════════════════════════════════════
REFERENCE ROWS (templates — note how col A is decided)
═══════════════════════════════════════════════════════════
"2nd & 10 on ${homeTeamAbbr} 45. 25 yard rush by Donte Ware."  (${homeTeamAbbr} has the ball in ${homeTeamAbbr} territory)
→ ${homeTeamAbbr}	Donte Ware		25				2	09:42		2	10	${homeTeamAbbr} 45	Rush

"Kickoff on ${homeTeamAbbr} 35. Jason Cummings returns kick for 19 yards."  (${homeTeamAbbr} is KICKING; Jason Cummings is ${awayTeamAbbr}'s returner)
→ ${awayTeamAbbr}	Jason Cummings		19				1	14:55			${homeTeamAbbr} 35	Kickoff Return

"1st & Goal on ${homeTeamAbbr} 6. Edward Reed pass to Duke Lamar for a 6 yard TD."  (${awayTeamAbbr} driving INTO ${homeTeamAbbr}'s end zone — Edward Reed is ${awayTeamAbbr}'s QB)
→ ${awayTeamAbbr}	Duke Lamar	Edward Reed	6	Passing TD	Made XP	1	08:55		1	Goal	${homeTeamAbbr} 6	Pass Complete

"3rd & 5 on ${awayTeamAbbr} 10. Donte Ware pass knocked away by Larry Long."  (${homeTeamAbbr} has the ball; Larry Long is ${awayTeamAbbr}'s defender)
→ ${homeTeamAbbr}	Larry Long	Donte Ware	0				2	12:00		3	5	${awayTeamAbbr} 10	Pass Knocked Away

"2nd & 5 on ${awayTeamAbbr} 25. Penalty against ${awayTeamAbbr}, 5 yards. (no named player)"  (penalty with no player named)
→ ${awayTeamAbbr}						2	11:40		2	5	${awayTeamAbbr} 25	Penalty

Notice: rows 2, 3, and 4 all have a Field Pos that names a team ≠ col A. That's the normal case, not the exception. Decide col A from the PLAYER, every time.

═══════════════════════════════════════════════════════════
🚨 COLUMN ALIGNMENT — every row MUST have EXACTLY 12 tabs (13 cells) 🚨
═══════════════════════════════════════════════════════════
This is the #3 failure mode and it silently corrupts the sheet.

When a play has no Scorer, no Passer, no Yards, no Score Type, and no
PAT Result — like a Penalty or a generic "Other" row — you MUST still
emit the EMPTY cells with their tabs. Do NOT collapse them.

❌ WRONG (penalty row with collapsed empty cells — only 9 tabs):
   ${awayTeamAbbr}				2	11:40		2	5	${awayTeamAbbr} 25	Penalty
   What ends up in the sheet:
     Score Type = "2"   ← quarter number leaked into col E
     PAT Result = "11:40"  ← time leaked into col F
   The front-end then thinks "2" is a scoring play and renders a
   ghost scoring card. THIS BREAKS THE PLAYS TAB.

✅ RIGHT (penalty row with EVERY empty cell tabbed — 12 tabs):
   ${awayTeamAbbr}						2	11:40		2	5	${awayTeamAbbr} 25	Penalty
   Six leading empty cells (Scorer, Passer, Yards, Score Type, PAT,
   then Quarter starts at col G). Count the tabs: 12.

Rule: BEFORE EMITTING ANY ROW, count tab characters. The count must
be EXACTLY 12. If it's less, you collapsed empty cells — go back and
add the missing tabs.

Score Type column (col E): if the play is NOT a score, this cell is
EMPTY. Never a quarter number. Never a yardage. Never a time. Empty.
Same for PAT Result (col F) — empty unless it's a TD/PAT/2PT row.

═══════════════════════════════════════════════════════════
SCORE TYPE — use these EXACT strings (col E)
═══════════════════════════════════════════════════════════
Valid values for col E when a play scores:
  Rushing TD | Passing TD | Field Goal | Safety
  Kick Return TD | Punt Return TD | INT Return TD
  Fumble Return TD | Blocked Punt/FG TD

There is no "PAT" value — extra points are encoded as column F on the
TD row, not as their own row.

Do NOT paraphrase. "Interception TD" → use "INT Return TD" instead.
"FG" → use "Field Goal". "Kickoff Return TD" → use "Kick Return TD".
The front-end's score-running logic looks at these EXACT strings; a
paraphrased label still renders the play but breaks downstream
aggregations (season stat rollups, awards counters).

═══════════════════════════════════════════════════════════
CELL FORMAT — exact strings, no paraphrasing
═══════════════════════════════════════════════════════════
These format mistakes silently corrupt the sheet (the dropdown
rejects them or the front-end misparses). Use the LITERAL form:

  • Quarter (col G): "1" / "2" / "3" / "4" / "OT" / "2OT" / "3OT" / "4OT".
    NOT "Q1", "1Q", "1st", "Quarter 1", or just the integer 1.
  • Time Left (col H): "MM:SS" with leading zeros on BOTH parts.
    "09:30" not "9:30". "00:15" not "0:15". "15:00" not "15:0".
  • Down (col J): "1" / "2" / "3" / "4". NOT "1st", "2nd", "3rd", "4th".
  • Distance (col K): a number ("10", "5") OR the literal word "Goal"
    when the line says "& Goal". NOT "G", "& Goal", "Goal Line", or "&G".
  • Field Pos (col L): "<ABBR> <number>" e.g. "${homeTeamAbbr} 35", "${awayTeamAbbr} 7".
    Special case for the 50-yard line: "MID 50" — NOT "50" alone,
    NOT "midfield", NOT "50-yard line".
  • Yards (col D): plain integer, negatives allowed ("-7"). NEVER
    a percentage, parenthetical, or comma-grouped number ("1,234").
    Blank when the play has no yardage (incomplete pass, PAT row,
    penalty without yardage stated).

═══════════════════════════════════════════════════════════
NO EMBEDDED TABS OR NEWLINES INSIDE A CELL
═══════════════════════════════════════════════════════════
A single play = a single row = a single line. If a play description
spans multiple lines on the screenshot, the OUTPUT row is still ONE
line. Do NOT emit a literal newline (\\n) or tab (\\t) inside any
cell value — both will split the row and create misaligned ghost
rows in the sheet. Use spaces instead.

═══════════════════════════════════════════════════════════
🚨 FINAL CHECK — physically run these on your draft 🚨
═══════════════════════════════════════════════════════════
Before sending, walk through your output. Not a glance — actually
run each check. Misalignment is the highest-impact failure for this
sheet because it shows up in the user's Plays tab as garbage they
have to delete by hand.

[ ] TAB COUNT: every row has EXACTLY 12 tab characters. Count by
    eye on the suspicious rows — Penalty, Other, Sack, Kickoff
    Return without a named returner. Each of those has many empty
    cells; each empty cell still costs one tab.

[ ] SCORE TYPE WHITELIST: scan col E across every row. Each value
    is EXACTLY one of the 9 valid scoring strings, or empty. NEVER
    "PAT" (extra points live in column F, not column E), NEVER a
    digit ("2"), NEVER a time ("11:40"), NEVER a paraphrase
    ("Interception TD", "Kickoff Return TD", "FG").

[ ] PAT COLLAPSED: every TD row has col F filled (Made XP / Missed
    XP / Blocked XP / Converted 2PT / Failed 2PT). NO row has E="PAT"
    or Play Type="PAT". The XP attempt lives only in the TD row's
    column F — no separate row for the kicker.

[ ] QUARTER / TIME on every row: col G is one of the 8 valid quarter
    strings (NOT empty, NOT "Q1"). Col H is MM:SS with leading zeros.

[ ] NO NEWLINES INSIDE CELLS: split your draft on newlines. The
    count equals the number of plays you intended to emit. If it's
    higher, you let a cell value wrap.

[ ] TEAM ATTRIBUTION: col A is the team of the PLAYER named in B
    (or C for sacks). NOT the team in Field Pos.

If ANY of these fails, fix the offending row(s) and re-run the
checks. Do not send output that fails any of them.`,
        includeTeamMap: true,
        dynastyTeams: currentDynasty?.teams,
      })

      const scoringSummaryPrompt = buildAIPrompt({
        title: `${baseTitle} — Scoring Summary`,
        roster: scoringUserRoster,
        opponentRoster: scoringOpponentRoster,
        rosterLabel: `${userIsHome ? homeTeamAbbr : awayTeamAbbr} ROSTER (user-controlled team — disambiguation reference for abbreviated names)`,
        opponentRosterLabel: `${userIsHome ? awayTeamAbbr : homeTeamAbbr} ROSTER (opponent team — disambiguation reference for abbreviated names)`,
        structure: `This sheet has ONE tab: "Scoring Summary". It has 30 rows (one per scoring play, unused rows blank) and 9 columns.

═══════════════════════════════════════════════════════════
🚨 #1 PRIORITY — TRANSCRIBE EVERY SCORING PLAY FROM BOTH TEAMS 🚨
═══════════════════════════════════════════════════════════
THE MOST COMMON FAILURE on this sheet is the AI filling in only the user's team and leaving the opponent's Scorer/Passer cells blank. DO NOT DO THIS.

The CFB26 Scoring Summary screenshot ALREADY shows every scorer's FULL NAME in plain text — for BOTH teams. Examples directly from the game UI: "(${awayTeamAbbr}) Kevin Applewhite, 34 Yd FG, 7:48", "(${homeTeamAbbr}) George McManus 63 Yd pass from Donte Ware (Sam Cage kick), 8:30", "(${awayTeamAbbr}) Paul Cormier, 1 Yd run (Kevin Applewhite kick), 2:45".

There is NEVER ambiguity about who scored — the screenshot has already spelled it out. Your job is to TRANSCRIBE that name into column B (and the kicker/passer into column C when present), VERBATIM, for EVERY ROW, regardless of which team scored.

The roster blocks below are provided ONLY as a tiebreaker for cases where CFB26 abbreviates a name (e.g. "K. Applewhite" or "A. Guess"). They are NOT a whitelist. If the screenshot shows a full name like "Kevin Applewhite" or "Paul Cormier" or "Donte Ware", USE THAT NAME EXACTLY — even if that exact spelling is not in the roster block. Real-game rosters can lag the dynasty data (in-season transfers, depth changes, walk-ons), and an opponent scorer not appearing in the roster block IS NOT A REASON TO LEAVE THE CELL BLANK.

Concrete pass/fail examples:
  ✅ Screenshot: "(${awayTeamAbbr}) Kevin Applewhite, 34 Yd FG, 7:48"
     → Row: ${awayTeamAbbr}  Kevin Applewhite          34   Field Goal       1   07:48
  ✅ Screenshot: "(${awayTeamAbbr}) Paul Cormier, 1 Yd run (Kevin Applewhite kick), 2:45"
     → Row: ${awayTeamAbbr}  Paul Cormier              1    Rushing TD  Made XP   4   02:45
        (the "(Kevin Applewhite kick)" parenthetical is the kicker for the PAT — that's already
         encoded by Made XP in column F; do NOT put the kicker in column C here)
  ✅ Screenshot: "(${homeTeamAbbr}) George McManus 63 Yd pass from Donte Ware (Sam Cage kick), 8:30"
     → Row: ${homeTeamAbbr}    George McManus  Donte Ware  63  Passing TD  Made XP   3   08:30
  ❌ FAIL: leaving Scorer blank because "Kevin Applewhite" or "Paul Cormier" isn't in the ${awayTeamAbbr} roster block.
  ❌ FAIL: filling Scorer/Passer for ${homeTeamAbbr} rows but leaving ${awayTeamAbbr} rows with empty B and C columns.

EVERY SCORING PLAY THAT APPEARS ON THE SCREENSHOT MUST HAVE COLUMN B FILLED. Field goals → kicker's name. Rushing TDs → ball carrier's name. Passing TDs → receiver's name (and column C = QB). Return TDs / defensive TDs → returner/defender's name. The screenshot tells you the name. Write it down.

═══════════════════════════════════════════════════════════
HOW TO READ THE SCORING-SUMMARY SCREENSHOT
═══════════════════════════════════════════════════════════
The user pastes a screenshot of CFB26's post-game Scoring Summary page. Each entry on that page is ONE scoring play. Before writing any row:

1. EACH ENTRY ON THE SCREENSHOT = ONE ROW. The PAT attempt listed in parentheses inside a TD entry is NOT a separate row — it collapses into that TD's row via column F (PAT Result).

2. TEAM COLUMN: each entry begins with "(ABBR)" — the parenthesized scoring team. Put EXACTLY "${homeTeamAbbr}" or "${awayTeamAbbr}" in column A — whatever the screenshot shows in that "(...)".

3. QUARTER: CFB26 groups plays under "First Quarter", "Second Quarter", "Third Quarter", "Fourth Quarter" (and "Overtime" / "Second OT" / etc. headings if applicable). Map them to the quoted digits "1"/"2"/"3"/"4" in column G. Overtime entries map to "OT", "2OT", "3OT", "4OT". CRITICAL: if a quarter has zero scoring plays in the screenshot, CFB26 may OMIT that quarter heading entirely (e.g. "Third Quarter" header missing because no team scored). Plays that follow such an omitted heading still belong to the next visible quarter heading. Look for the heading immediately ABOVE each play to determine its quarter.

4. TIME: shown at the END of each entry (e.g. ", 7:48" at the right of the line). Time is "MM:SS" with leading zeros on BOTH minutes and seconds — "03:47" not "3:47", "00:15" not "0:15". A screenshot showing "7:48" means "07:48".

5. CHRONOLOGICAL ORDER: the screenshot lists plays chronologically within each quarter (clock counts DOWN, so 7:48 is earlier in the quarter than 1:36). OT plays are ALWAYS after Q4 — never let OT plays land first even if the screenshot displays them in a different visual position.

6. SCORE TYPE mapping (extract from the entry's text after the player name):
     - "X Yd FG" → "Field Goal" (column B = kicker, column D = X, column F = "")
     - "X Yd run (Kicker kick)" → "Rushing TD" (column B = ball carrier, column D = X, column F = "Made XP")
     - "X Yd run (Kicker kick blocked)" → "Rushing TD" with column F = "Blocked XP"
     - "X Yd run (Kicker kick failed)" or "(Kicker kick no good)" → "Rushing TD" with column F = "Missed XP"
     - "X Yd run (TWO PT GOOD)" / "(2-pt conversion)" → "Rushing TD" with column F = "Converted 2PT"
     - "X Yd run (TWO PT FAILED)" → "Rushing TD" with column F = "Failed 2PT"
     - "X Yd pass from Passer (Kicker kick)" → "Passing TD" (column B = receiver who caught it, column C = passer/QB, column D = X, column F per the kick result)
     - "X Yd interception return" → "INT Return TD"
     - "X Yd fumble return" → "Fumble Return TD"
     - "X Yd kickoff return" → "Kick Return TD"
     - "X Yd punt return" → "Punt Return TD"
     - "Blocked punt/FG return for TD" → "Blocked Punt/FG TD"
     - "Safety" → "Safety" (column D blank, column F "")

7. PAT RESULT (column F): Every TD row MUST have one of: "Made XP", "Missed XP", "Blocked XP", "Converted 2PT", "Failed 2PT". Read the parenthetical after the play description. Field goals and safeties MUST have F = "" (empty string, not "N/A").

8. YARDS (column D): for TDs this is the yardage of the SCORING PLAY ITSELF — not the length of the drive. For a 3-yard TD pass, D = 3, NOT 75. For FGs, D = the kick distance. For safeties, D = blank.

9. PLAYER NAMES — read this carefully:
   • The screenshot's "(ABBR) Player Name, ..." text is your SOURCE OF TRUTH. Copy the name VERBATIM into column B. CFB26 nearly always prints the full first name + last name in the Scoring Summary (e.g. "Kevin Applewhite", not "K. Applewhite") — when it does, no roster lookup is needed.
   • For passing TDs, the QB appears after "from" (e.g. "63 Yd pass from Donte Ware") — copy that name VERBATIM into column C.
   • The kicker named in "(Kicker kick)" is the kicker for the EXTRA POINT on a TD play, not the scorer. Encode that PAT in column F via "Made XP" / "Missed XP" / etc. Do NOT put the kicker's name in column C for a TD row.
   • Roster blocks are TIEBREAKERS, not whitelists: ONLY consult them if CFB26 actually printed an abbreviated form (e.g. "A. Guess"). If two players match an abbreviation, use jersey/position to pick the right one. If the screenshot shows a full name that isn't in the roster block, USE THE SCREENSHOT'S NAME — do NOT blank the cell. Opponent rosters can be incomplete; the screenshot is authoritative.
   • Leave Scorer blank ONLY when the screenshot itself is illegible / cropped at that row, AND the entry literally has no readable name. "Not in my roster block" is NOT a valid reason to blank a cell.

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. Output ALL 9 columns (A through I) per row, paste at cell A2. The sheet has no pre-filled data rows — you fill everything below the header.
2. ONE ROW PER SCORING PLAY, in chronological order (earliest quarter / latest game-clock time first). PAT attempts are NOT separate rows — they collapse into the TD row via column F (PAT Result).
3. Output AT MOST 30 rows. Leave remaining rows blank (do not output them at all — just stop).
4. NO COMMAS in numbers. "24" never "1,234".
5. INTEGERS ONLY for Yards and Quarter.
6. Use ONLY the literal dropdown values listed below for columns A, E, F, G. Strict dropdowns — wrong value is rejected.
7. BLANK CELLS only for genuinely missing/illegible data. NEVER use "N/A". This sheet uses empty string, NOT "N/A", for plays without a PAT.
8. EVERY scoring play in the screenshot must produce one row, and that row's column B (Scorer) MUST be filled with the name from the screenshot — for BOTH teams equally. Output is rejected if it skips opponent scorers.
9. No header row, no commentary or explanation INSIDE the data. ONE TSV block — preceded by the paste-target label line as required by the Method A/B rules above.

═══════════════════════════════════════════════════════════
TAB: "Scoring Summary" — up to 30 rows × 9 columns
Paste your block at cell A2 of the "Scoring Summary" tab
═══════════════════════════════════════════════════════════

Col | Header       | Format / Allowed values
----+--------------+----------------------------------------------------------------------
 A  | Team         | STRICT dropdown: EXACTLY "${homeTeamAbbr}" or "${awayTeamAbbr}" (uppercase). No other values.
 B  | Scorer       | Player name — the player who scored (rusher/receiver for TDs, kicker for FGs, returner for return TDs, "Defense" or defender name for safeties/defensive TDs).
                  | REQUIRED for every row that has any data. The screenshot ALWAYS prints
                  |    this name — copy it VERBATIM. Use the roster block only to expand
                  |    abbreviations (e.g. "A. Guess" → "Alex Guess"). Do NOT blank an
                  |    opponent scorer just because that name isn't in the opponent's
                  |    roster block — the screenshot is authoritative.
 C  | Passer       | QB name who threw the TD pass — copy VERBATIM from the "from <Name>" portion of the entry. BLANK for non-passing scores (rushing TD, FG, safety, return TD, defensive TD). Do NOT put the PAT kicker here on a TD row — that goes in column F via "Made XP" etc.
 D  | Yards        | Integer — yards on the scoring play. FG distance for FGs; TD play yardage for TDs; blank for Safety.
 E  | Score Type   | STRICT dropdown — EXACTLY one of these 9 literal values (case-sensitive):
    |              |   - "Rushing TD"
    |              |   - "Passing TD"
    |              |   - "Field Goal"
    |              |   - "Safety"
    |              |   - "Kick Return TD"
    |              |   - "Punt Return TD"
    |              |   - "INT Return TD"
    |              |   - "Fumble Return TD"
    |              |   - "Blocked Punt/FG TD"
 F  | PAT Result   | STRICT dropdown — EXACTLY one of these 6 literal values:
    |              |   - ""            (empty string — for Field Goal / Safety rows; no PAT applies)
    |              |   - "Made XP"     (extra point good after a TD)
    |              |   - "Missed XP"   (extra point missed after a TD)
    |              |   - "Blocked XP"  (extra point blocked after a TD)
    |              |   - "Converted 2PT" (two-point conversion successful after a TD)
    |              |   - "Failed 2PT"    (two-point conversion failed after a TD)
 G  | Quarter      | STRICT dropdown — EXACTLY one of: "1", "2", "3", "4", "OT", "2OT", "3OT", "4OT".  (Regular quarters are the string digits, not integers; overtime uses "OT"/"2OT"/"3OT"/"4OT".)
 H  | Time Left    | Game clock when the score occurred, formatted MM:SS (e.g. "03:42", "14:07", "00:00"). Leading zeros REQUIRED on both minutes and seconds.
 I  | Video Link   | Optional URL to a clip; leave BLANK if none.

PAT Result rules:
  - TD row (any of the 5 "... TD" score types or "Rushing TD" / "Passing TD"): column F MUST be one of "Made XP", "Missed XP", "Blocked XP", "Converted 2PT", "Failed 2PT".
  - Field Goal row: column F MUST be "" (empty string).
  - Safety row: column F MUST be "" (empty string).

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== SCORING SUMMARY — paste at cell A2 of "Scoring Summary" tab ===
<Team>\\t<Scorer>\\t<Passer>\\t<Yards>\\t<Score Type>\\t<PAT Result>\\t<Quarter>\\t<Time Left>\\t<Video Link>
... one row per scoring play, chronological

(Each \\t above represents a LITERAL TAB character — use actual tab characters, not the text "\\t".)

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] EVERY row that has team + score type ALSO has column B (Scorer) filled. Count the scoring plays in the screenshot. Count the rows in your output. Count the non-blank Scorer cells. All three numbers must match.
[ ] Both teams' scorers are filled — not just the user's team. If the screenshot shows N plays for ${homeTeamAbbr} and M plays for ${awayTeamAbbr}, your output has N populated rows for ${homeTeamAbbr} and M populated rows for ${awayTeamAbbr}, each with column B filled.
[ ] No Scorer cell was blanked just because the name isn't in the roster block. If CFB26 printed "Kevin Applewhite", the cell says "Kevin Applewhite" — period.
[ ] For Passing TDs, both column B (receiver) AND column C (passer) are filled from the "<Receiver> ... pass from <Passer>" text.
[ ] Every row has EXACTLY 9 tab-separated values (8 tab characters per row)
[ ] Column A is EXACTLY "${homeTeamAbbr}" or "${awayTeamAbbr}" — nothing else
[ ] Column E is one of the 9 exact Score Type values, no paraphrasing
[ ] Column F is one of the 6 exact PAT Result values (empty string for FG / Safety)
[ ] Column G is "1"/"2"/"3"/"4"/"OT"/"2OT"/"3OT"/"4OT" — quoted as listed
[ ] Column H is MM:SS with leading zeros
[ ] Rows are chronological (within a quarter, higher MM:SS comes first because the clock counts down)
[ ] Total rows ≤ 30; no header row; no commas in numbers
[ ] PAT row is NOT a separate row; the PAT result is in column F of the TD row`,
        includeTeamMap: true,
        dynastyTeams: currentDynasty?.teams,
      })

      return { allPlays: allPlaysPrompt, scoring: scoringSummaryPrompt }
    }

    if (sheetType === 'teamStats') {
      return buildAIPrompt({
        title: `${baseTitle} — Team Stats`,
        structure: `This sheet has ONE tab: "Team Stats". 30 rows × 3 columns. Column A (stat label) is PRE-FILLED and PROTECTED — never output it. Column B = AWAY team ${awayTeamAbbr}. Column C = HOME team ${homeTeamAbbr}. Your output is exactly 30 lines, each "<away_value>\\t<home_value>".

═══════════════════════════════════════════════════════════
WHAT YOU ARE LOOKING AT
═══════════════════════════════════════════════════════════
The user is uploading screenshots of EA College Football 26's post-game "Team Stats" screen. The screen has the AWAY team's values down the LEFT, the HOME team's values down the RIGHT, and the stat label centered between them. The list is longer than fits on one screen, so the user typically uploads 2-3 screenshots scrolled to different positions. Some lines OVERLAP between screenshots — that's fine, treat them as confirmations, not duplicates.

⚠️ The two teams in this game are:
   • AWAY = "${awayTeamAbbr}" → your output column B (LEFT in your TSV row)
   • HOME = "${homeTeamAbbr}" → your output column C (RIGHT in your TSV row)
At the top of every CFB26 Team Stats screenshot, the away team's logo+abbr appears on one side and the home team's on the other. READ THAT HEADER FIRST. CFB26 conventionally puts AWAY on the left and HOME on the right, but always confirm against the abbreviations above. If the screenshot shows the home/away order reversed (e.g. user took the screenshot from the home team's perspective), STILL output AWAY value first, HOME value second on each row.

═══════════════════════════════════════════════════════════
CRITICAL RULES — non-negotiable
═══════════════════════════════════════════════════════════
1. EXACTLY 30 rows of output. Count them before you send.
2. EACH row = "<away>\\t<home>" — exactly ONE tab character per line. No header row, no labels, no commentary INSIDE the data. The paste-target label above the fence is required (see Method A/B rules above).
3. Row order is FIXED — see the 30-row table below. Row 1 = First Downs, row 2 = Total Offense, …, row 30 = Poss Seconds. Never reorder, skip, or add.
4. Use INTEGERS everywhere EXCEPT row 26 (Punt Avg), which is a one-decimal number like 42.7.
5. NO COMMAS in numbers ("1234", never "1,234"). NO percent signs. NO units.
6. Use "0" for a stat that is genuinely zero on the screenshot. Use a BLANK cell (empty between the tabs) ONLY when the stat is not visible anywhere in any provided screenshot. Never substitute "N/A", "—", "?", or another team's value.
7. Column B is ${awayTeamAbbr} (AWAY); Column C is ${homeTeamAbbr} (HOME). Never swap.

═══════════════════════════════════════════════════════════
SKIP LIST — these CFB26 lines are NOT rows in this sheet
═══════════════════════════════════════════════════════════
Do not try to place any of these into the output. They are derived/redundant and the sheet does not have rows for them:
   • "Score" (the final score is tracked elsewhere)
   • "Yards Per Play"
   • "Yards Per Rush"
   • "Yards Per Pass"
If CFB26 shows a stat the sheet doesn't have, drop it. Do not invent a row to hold it.

═══════════════════════════════════════════════════════════
SPLIT LIST — combined CFB26 lines that map to MULTIPLE sheet rows
═══════════════════════════════════════════════════════════
Several CFB26 labels pack 2-3 numbers into one line using "|" or "(...)". You MUST split each into the separate rows shown:

   CFB26 line                                  Sheet rows
   ─────────────────────────────────────────────────────────────────────
   "Rushes | Yards | TDs"   "28 | 8 | 0"   →   row 4 (28), row 5 (8),  row 6 (0)
   "Comp | Att | TDs"       "19 | 25 | 0"  →   row 7 (19), row 8 (25), row 9 (0)
   "3rd Down Conv."         "5 | 13 (38%)" →   row 11 (5), row 12 (13). Ignore the percent.
   "4th Down Conv."         "1 | 1 (100%)" →   row 13 (1), row 14 (1). Ignore the percent.
   "2-Point Conv."          "0 | 0 (0%)"   →   row 15 (0), row 16 (0). Ignore the percent.
   "Red Zone TD | FG | %"   "4 | 0 | 44%"  →   row 17 (4), row 18 (0), row 19 (44 — integer percent, no % sign)
   "Penalties"              "1 | 15"       →   row 27 (1 — penalty count), row 28 (15 — penalty yards)
   "Possession Time"        "26:28"        →   row 29 (26 — minutes), row 30 (28 — seconds)
   "Turnovers"              "1 (-1)"       →   row 20 (1). The "(-1)" is turnover margin — IGNORE it.

═══════════════════════════════════════════════════════════
SPECIAL CASES — read carefully
═══════════════════════════════════════════════════════════
• PUNT AVG (row 26): CFB26 labels this just "Punts" but the value is the AVERAGE punt distance, shown as a decimal (e.g. "42.7", "35.2", "0.0"). Copy the decimal exactly. If the value is "0.0", enter "0.0" — do NOT leave blank. Do NOT try to derive punt count. The sheet has no punt-count row.

• RED ZONE PCT (row 19): integer 0-100. "44%" → 44. Never "0.44" or "44.00" or "44%". If CFB26 shows the percent ungrouped (e.g. "100 %"), still enter the integer (100).

• POSSESSION TIME (rows 29-30): CFB26 shows "MM:SS" (e.g. "26:28"). Split: minutes → row 29, seconds → row 30. Never put "26:28" in a single row.

• TURNOVERS (row 20): the count comes BEFORE the parenthesis. "1 (-1)" → 1. "0 (+1)" → 0. The parenthesized number is turnover margin — drop it.

• TOTAL OFFENSE (row 2) vs TOTAL YARDS (row 25): CFB26 shows BOTH. Total Offense = offensive yards only (rushing + passing). Total Yards = Total Offense + return yards. They are DIFFERENT rows. Copy each from its own line — do not derive one from the other.

• ZEROS: CFB26 displays a true zero as "0" or "0.0". Treat any visible zero as a real value (output 0 or 0.0, not blank). Blank is reserved for stats not displayed in any screenshot.

═══════════════════════════════════════════════════════════
THE 30 ROWS — exact order, exact format
═══════════════════════════════════════════════════════════
Row | Stat label (Col A, pre-filled)  | What CFB26 calls it                | Format
----+---------------------------------+------------------------------------+-----------------------------
  1 | First Downs                     | "First Downs"                      | integer
  2 | Total Offense                   | "Total Offense"                    | integer
  3 | Total Plays                     | "Total Plays"                      | integer
  4 | Rush Attempts                   | "Rushes | Yards | TDs" — 1st num   | integer
  5 | Rush Yards                      | "Rushes | Yards | TDs" — 2nd num   | integer
  6 | Rush TDs                        | "Rushes | Yards | TDs" — 3rd num   | integer
  7 | Completions                     | "Comp | Att | TDs" — 1st num       | integer
  8 | Pass Attempts                   | "Comp | Att | TDs" — 2nd num       | integer
  9 | Pass TDs                        | "Comp | Att | TDs" — 3rd num       | integer
 10 | Passing Yards                   | "Passing Yards"                    | integer
 11 | 3rd Down Conv                   | "3rd Down Conv." — before "|"      | integer
 12 | 3rd Down Att                    | "3rd Down Conv." — after "|"       | integer
 13 | 4th Down Conv                   | "4th Down Conv." — before "|"      | integer
 14 | 4th Down Att                    | "4th Down Conv." — after "|"       | integer
 15 | 2PT Conv                        | "2-Point Conv." — before "|"       | integer
 16 | 2PT Att                         | "2-Point Conv." — after "|"        | integer
 17 | Red Zone TD                     | "Red Zone TD | FG | %" — 1st       | integer
 18 | Red Zone FG                     | "Red Zone TD | FG | %" — 2nd       | integer
 19 | Red Zone Pct                    | "Red Zone TD | FG | %" — 3rd       | integer percent (44, not 0.44, not "44%")
 20 | Turnovers                       | "Turnovers" — number BEFORE "("    | integer
 21 | Fumbles Lost                    | "Fumble Lost"                      | integer
 22 | Interceptions                   | "Interceptions"                    | integer
 23 | Punt Ret Yards                  | "PR Yards"                         | integer
 24 | Kick Ret Yards                  | "KR Yards"                         | integer
 25 | Total Yards                     | "Total Yards"                      | integer
 26 | Punt Avg                        | "Punts" (the decimal, e.g. 42.7)   | decimal one digit (e.g. 42.7, 0.0)
 27 | Penalties                       | "Penalties" — before "|"           | integer
 28 | Penalty Yards                   | "Penalties" — after "|"            | integer
 29 | Poss Minutes                    | "Possession Time" — minutes (MM)   | integer (0-60)
 30 | Poss Seconds                    | "Possession Time" — seconds (SS)   | integer (0-59)

═══════════════════════════════════════════════════════════
WORKED EXAMPLE — make sure your output matches THIS structure
═══════════════════════════════════════════════════════════
This example uses MADE-UP numbers ONLY to show shape and format. Use the user's actual screenshot values, not these.

If the screenshots showed (away → home):
   First Downs:           "12 | 27"            (yes, this label is plain — no pipes here, just two numbers in two columns)
   Total Offense:         "202 | 529"
   Total Plays:           "53 | 46"
   Rushes | Yards | TDs:  "28 | 8 | 0" vs "9 | 98 | 1"
   Comp | Att | TDs:      "19 | 25 | 0" vs "34 | 37 | 7"
   Passing Yards:         "194 | 431"
   3rd Down Conv.:        "5 | 13 (38%)" vs "6 | 7 (85%)"
   4th Down Conv.:        "0 | 0 (0%)"   vs "1 | 1 (100%)"
   2-Point Conv.:         "0 | 0 (0%)"   vs "0 | 0 (0%)"
   Red Zone TD | FG | %:  "0 | 1 | 100%" vs "4 | 0 | 44%"
   Turnovers:             "1 (-1)"       vs "0 (+1)"
   Fumble Lost:           "1"            vs "0"
   Interceptions:         "0"            vs "0"
   PR Yards:              "0"            vs "21"
   KR Yards:              "141"          vs "25"
   Total Yards:           "343"          vs "575"
   Punts:                 "35.2"         vs "0.0"
   Penalties:             "1 | 15"       vs "1 | 5"
   Possession Time:       "26:28"        vs "21:32"

…then your TSV output would be these 30 lines (each "<away>\\ttab\\t<home>"):
   12\\t27
   202\\t529
   53\\t46
   28\\t9
   8\\t98
   0\\t1
   19\\t34
   25\\t37
   0\\t7
   194\\t431
   5\\t6
   13\\t7
   0\\t1
   0\\t1
   0\\t0
   0\\t0
   0\\t4
   1\\t0
   100\\t44
   1\\t0
   1\\t0
   0\\t0
   0\\t21
   141\\t25
   343\\t575
   35.2\\t0.0
   1\\t1
   15\\t5
   26\\t21
   28\\t32

(Each \\t above represents a LITERAL TAB character — use actual tab characters in your output, not the text "\\t".)

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== TEAM STATS — paste at cell B2 of "Team Stats" tab ===
<row1 away>\\t<row1 home>
<row2 away>\\t<row2 home>
... (30 total rows, in the exact order above, no header inside the data, no commentary inside the data — the paste-target label above the fence is required, see Method A/B rules above)

═══════════════════════════════════════════════════════════
SELF-CHECK BEFORE YOU SEND — run every line
═══════════════════════════════════════════════════════════
[ ] I confirmed which side of the screenshot is ${awayTeamAbbr} (AWAY) and which is ${homeTeamAbbr} (HOME) by reading the team headers.
[ ] My output has EXACTLY 30 lines (I counted).
[ ] Every line has EXACTLY ONE tab character (so 2 fields per line).
[ ] Line N matches stat row N from the table above (no reorder, no skip, no extra).
[ ] Column B (left of the tab) is ${awayTeamAbbr}; Column C (right of the tab) is ${homeTeamAbbr}.
[ ] Every pipe-separated CFB26 line was SPLIT into its sheet rows: Rushes|Yards|TDs (rows 4-6), Comp|Att|TDs (rows 7-9), 3rd Down (11-12), 4th Down (13-14), 2PT (15-16), Red Zone (17-19), Penalties (27-28), Possession (29-30).
[ ] Row 19 (Red Zone Pct) is an integer like 44 — not "44%" or 0.44.
[ ] Row 20 (Turnovers) is the number BEFORE the parenthesis — not the margin.
[ ] Row 26 (Punt Avg) is the decimal next to "Punts" (e.g. 42.7 or 0.0) — not a count, not blank.
[ ] No commas, no percent signs, no units, no "N/A", no "—".
[ ] I did NOT include rows for "Score", "Yards Per Play", "Yards Per Rush", or "Yards Per Pass" — those are not in this sheet.
[ ] Genuine zeros are output as "0" (or "0.0" for Punt Avg). Blank cells only when the stat is truly not visible anywhere in any screenshot.`,
        includeTeamMap: true,
        dynastyTeams: currentDynasty?.teams,
      })
    }

    // Player stats (sheetType === 'playerStats') — 9 tabs
    const teamAbbr = config.teamAbbr || ''
    const opponentAbbrLabel = config.opponentAbbr || ''
    // Only pass roster when the tab is the user-controlled team — Column A
    // is a strict roster dropdown only for the user's team. The roster
    // belongs to the target team (the one this sheet is for), regardless
    // of whether that team is home or away in the game.
    const playerStatsRoster = config.isUserControlled ? targetRosterObjects : []
    const layout = computeUnifiedTabLayout()

    // THE single source of truth for row alignment. One line per banner,
    // one line per header, one range entry per data section, one line
    // per blank separator. The AI reads this and knows EXACTLY what
    // goes on every 1-indexed output line. Replaces the earlier
    // SECTION → LINE MAP / FILL-IN-THE-BLANK TEMPLATE / WORKED EXAMPLE
    // / BANNER POSITIONS / OUTPUT SHAPE sections — those were saying
    // the same thing four different ways and the duplication invited
    // mistakes.
    const outputLineMap = (() => {
      const out = []
      const pad = (n) => String(n).padStart(3, ' ')
      layout.sections.forEach((s, idx) => {
        const isLast = idx === layout.sections.length - 1
        out.push(`Line ${pad(s.bannerRow)}: ═══ ${s.title.toUpperCase()} ═══     (banner; column A only, no tabs)`)
        out.push(`Line ${pad(s.bannerRow + 1)}: ${s.headers.join('<TAB>')}     (header row; ${s.headers.length} cells, tab-separated)`)
        // One spec line per data slot — gives the AI a 1-to-1 map
        // between spec lines and output lines so it doesn't have to
        // mentally expand a range and count slots when thinking is off.
        for (let i = 0; i < s.rowCount; i++) {
          const lineNum = s.dataStart + i
          out.push(`Line ${pad(lineNum)}: ${s.title.toUpperCase()} slot ${i + 1} of ${s.rowCount} — player row (${s.headers.length} fields, tab-separated) OR TRULY EMPTY LINE`)
        }
      })
      return out.join('\n')
    })()

    return buildAIPrompt({
      title: `${baseTitle} — ${teamAbbr} Player Stats`,
      roster: playerStatsRoster,
      structure: `This Google Sheet contains a tab named "${AI_UNIFIED_TAB.title}" that holds EVERY stat category for the ${teamAbbr} team in one place. Your job: produce ONE giant tab-separated block — exactly ${layout.totalRows} lines — that the user pastes at cell A1 of that tab to fill the entire layout in a single paste. Stats are for the ${teamAbbr} team only (opponent: ${opponentAbbrLabel}).

╔══════════════════════════════════════════════════════════╗
║  THE OUTPUT — EXACT LINE-BY-LINE LAYOUT                    ║
║  THIS IS THE SPEC. EVERY OTHER SECTION IS DETAIL.          ║
╚══════════════════════════════════════════════════════════╝

Your output is EXACTLY ${layout.totalRows} lines. Each line below tells you what
must appear at that 1-indexed output position. Banner and header
lines are FIXED — emit them verbatim. Data lines are placeholders
you fill (or leave empty). Unused slots are TRULY EMPTY LINES (\\n only).
There are NO separator rows between sections — the last data slot of
one section is immediately followed by the next section's banner.

${outputLineMap}

Total: exactly ${layout.totalRows} lines. "<TAB>" in the spec = real tab character (U+0009).
Empty slots are TRULY EMPTY LINES (\\n only — no spaces, no tabs). Never skip or merge a line. Banner lines: no tabs. Header lines: (column count − 1) tabs. Data lines: same column count as their section header.

═══════════════════════════════════════════════════════════
HOW TO READ THE GAME SCREENSHOTS — do this first
═══════════════════════════════════════════════════════════
The user pastes screenshots from EA College Football 26's post-game stats screens. Each screenshot shows ONE stat category for BOTH teams side-by-side. Before you write a single TSV row:

1. IDENTIFY THE TEAM COLUMN. Each screenshot shows the two team helmets/names as column headers. "${teamAbbr}" is the team you're writing stats for RIGHT NOW. Only use rows from the ${teamAbbr} column. Never mix in opponent (${opponentAbbrLabel}) rows.

2. TACKLES SPLIT: the defense screenshot shows "TOTAL" tackles as a single number (e.g. "8"). The sheet needs SOLO and ASSISTS as SEPARATE columns. EA's in-game screen shows them split as "SOLO/AST" like "6/2". If the screenshot shows only a combined total with no split, enter the total under Solo and leave Assists blank — NEVER invent a split.

3. PASSING HEADER LINE: CFB26 shows a QB line like "26/35, 298 YDS, 3 TD, 1 INT, 148.3 RTG". Map directly:
     - "26" → Comp
     - "35" → Att
     - "298" → Yards
     - "3"   → TD
     - "1"   → INT
     - "148.3" → Rtg (one decimal; ONLY this column may have a decimal)
     - Long is shown separately on the passing screen — grab it from the LONG column.

4. RUSHING / RECEIVING ROWS: format is usually "CARRIES YDS AVG TD LONG". Skip AVG (not a column). 20+ / BT / YAC / RAC / Drops come from the "ADVANCED" tab in CFB26 — if you don't see them in the screenshot, leave those columns BLANK, do not guess.

5. KICKING RANGE SPLITS: CFB26 shows FG attempts per distance range. Map attempts and makes to the pairs FGA 29/FGM 29 (0-29 yd), FGA 39/FGM 39 (30-39 yd), FGA 49/FGM 49 (40-49 yd), FGA 50+/FGM 50+ (50 yd+). If the screenshot lists one combined FG line with no splits, enter FGM / FGA on the summary columns and leave the range columns BLANK.

6. JERSEY NUMBERS IN SCREENSHOTS: CFB26 shows "#12 J. Smith" style entries. Map to the full roster name from the roster block above — NEVER output "#12" or "J. Smith". Always the full name from the roster dropdown.

6a. FIRST NAMES FROM THE SIDEBAR — IMPORTANT for opponent players (and any teammate not in the roster block): CFB26's stat tables only show "F.Last" with the first INITIAL ("J.Elmore", "D.Shelby"). But the right-hand sidebar / player card in those same screenshots shows the FULL FIRST NAME of whichever player is currently highlighted (e.g. "JAMIE ELMORE", "DEMARIO SHELBY"). Use the sidebar across ALL the attached screenshots to build a roster of full first names, then apply those to the abbreviated names in the tables:
     - If a screenshot has "J.Elmore" in the table AND the sidebar shows "JAMIE ELMORE" → output "Jamie Elmore" (title case), NOT "J. Elmore" or "J.Elmore".
     - The sidebar typically rotates as the user scrolls; different screenshots may highlight different players. Cross-reference ALL screenshots before falling back to the initial-only form.
     - If after checking every sidebar across every screenshot you STILL have no full first name for a player, only THEN may you keep the "F. Last" abbreviated form. But always try the sidebar first.
     - For the user's team (${teamAbbr}), the roster block above is still authoritative — use the dropdown spelling, not the sidebar.

7. BLANKS VS ZEROS: the screenshot lists only players who TOUCHED that category. For those players, 0 means "played but didn't produce" and is valid. A player who didn't appear on the screenshot should not be in your output at all — don't pad with zero rows.

═══════════════════════════════════════════════════════════
CRITICAL RULES
═══════════════════════════════════════════════════════════
1. Output EXACTLY ${layout.totalRows} lines. Count them. The user pastes the entire output at cell A1 of the "${AI_UNIFIED_TAB.title}" tab — every line MUST land on the correct row.
2. Banner rows: output ONLY the banner text in column A (no tabs). Example: \`═══ PASSING ═══\`. Do NOT add any other columns to a banner line.
3. Column header rows: output the EXACT header text for that section, tab-separated, with NO extra columns past the section's stat list. The header row for "Passing" has 8 cells; for "Defense" it has 15.
4. Data rows: each non-empty data row must have EXACTLY the column count of its section's header row. Empty slots in a data row are tab-separated empty fields, NOT skipped tabs. (e.g. a Passing data row always has 8 fields separated by 7 tabs.)
5. Empty data slots (rows where no player stat-earner exists): output a TRULY EMPTY LINE (just \\n) — no tabs, no spaces.
6. There are NO separator rows between sections. The next banner immediately follows the last data slot of the previous section.
7. NO COMMAS in numbers ("1234" not "1,234"). INTEGERS only, with these EXCEPTIONS:
   • Passing Rtg — one decimal (e.g. "148.3").
   • Defense Sacks — half-credits ARE valid (e.g. "2.5" or "0.5"). If the screenshot shows a half-sack, write it as "2.5" — DO NOT round to an integer. If the screenshot shows a whole number, write it whole (e.g. "2", not "2.0").
   • Defense TFL (Tackles For Loss) — half-credits ARE valid for the same reason. Write "1.5" if the screenshot shows it; otherwise whole.
   These half-credit values come from the screenshot directly. Never invent ".5" — only emit it when the source clearly shows it.
8. Player names: if this is the user's team, names MUST match the roster (strict dropdown). For opponent (and any teammate not in the roster block), the table shows "F.Last" — BEFORE outputting that abbreviated form, expand it to the full first name by checking the right-hand sidebar / player card across EVERY attached screenshot (see rule 6a). Only fall back to "F. Last" after every sidebar has been checked. NEVER output "#12" or "J. Smith" when a full name exists in the roster OR the sidebar.
9. ${teamAbbr} players ONLY. No ${opponentAbbrLabel} players in this output.
10. No commentary or explanation INSIDE the data. ONE block of ${layout.totalRows} lines — preceded by the required paste-target label line above the fence (see Method A/B rules above).

═══════════════════════════════════════════════════════════
COLUMN SPEC PER SECTION (for reference)
═══════════════════════════════════════════════════════════
${layout.sections.map(s => `${s.title} (${s.headers.length} cols): ${s.headers.join(' | ')}`).join('\n')}

Notes:
  • Passing: Rtg is decimal one-place (e.g. 148.3); all others integer.
  • Rushing: BT = Broken Tackles, YAC = Yards After Contact, "20+" = runs of 20+ yards.
  • Receiving: RAC = Receiving Yards After Catch.
  • Defense: TFL = Tackles For Loss, FF = Forced Fumbles, FR = Fumble Recoveries, Blocks = kicks/punts blocked, TD = defensive TDs. Sacks AND TFL accept half-credits (e.g. "1.5", "2.5") when the screenshot shows them — do NOT round halves to whole numbers; do NOT invent halves the screenshot doesn't show.
  • Kicking: FGA/FGM 29/39/49/50+ = field goals by distance bucket; XPM/XPA/XPB = extra points made/attempted/blocked.
  • Punting: Block = punts blocked, In20 = punts downed inside the 20, TB = touchbacks.

═══════════════════════════════════════════════════════════
COMMON MISTAKES — actively avoid these
═══════════════════════════════════════════════════════════
✗ Putting ${opponentAbbrLabel} players in this sheet (they belong on a different tab)
✗ Using "J. Smith" or jersey-number-only when the roster has the full name
✗ Guessing split Solo/Assists when the screenshot shows only a total
✗ Inventing 20+ / BT / YAC / RAC / Drops when those columns aren't visible
✗ Outputting decimal numbers for anything except Passing Rtg, Defense Sacks (.5 OK), and Defense TFL (.5 OK)
✗ Rounding a half-sack ("1.5") up or down to an integer — emit it as "1.5" exactly
✗ Adding commas to totals ("1,234" → wrong; "1234" is correct)
✗ Reordering columns — the column order per section is FIXED
✗ Mixing the "Long" value with TD yardage (Long is the longest SINGLE play)
✗ Skipping empty rows: every row position MUST be present in the output, even as a blank line
✗ Outputting fewer or more than ${layout.totalRows} total lines
✗ Adding stray text outside the data block — apart from the required paste-target label line above the fence (no "here is the output:", no trailing notes, no follow-up questions).

═══════════════════════════════════════════════════════════
FINAL CHECK before you send — actually run these on your draft
═══════════════════════════════════════════════════════════
Don't just glance at this list. Physically execute each check
against the lines you just wrote. Misalignment is the #1 failure
mode of this output and it will silently corrupt the user's sheet.

[ ] TEMPLATE STRUCTURE: take YOUR DRAFT and the TEMPLATE above. Walk
    line-by-line in parallel. Banner lines and header lines in
    your draft must EQUAL the corresponding lines in the template
    character-for-character (after substituting <TAB> with real
    tabs). If ANY banner or header line differs from the template,
    you generated it from scratch instead of copying — go back and
    re-copy from the template.

[ ] LINE COUNT: split your draft on newlines. The result MUST
    contain EXACTLY ${layout.totalRows} elements. If it's anything
    else, you're done — go fix.

[ ] STRAY BANNERS / HEADERS: search your draft for the string "═══".
    Every occurrence MUST be on one of the banner-position lines
    listed above. Search your draft for the literal text "Player
    Name" — every occurrence MUST be on one of the column-header
    lines listed in the template (header lines start with "Player
    Name" followed by tabs and stat labels). Any "Player Name" or
    "═══ ... ═══" found in a DATA row position means a header /
    banner line was duplicated into a data slot. Delete the
    duplicate.

[ ] EMPTY-LINE COUNT: there are NO blank separator lines between
    sections — each section's last data slot runs right up to the
    next banner. Empty lines appear only within data blocks, for
    unused player slots. An empty line is a TRULY EMPTY line —
    \\n only, no spaces, no tabs.

[ ] BANNER ROW SHAPE: for each banner line, confirm there are zero
    tab characters on that line. Banners are column A only.

[ ] HEADER ROW SHAPE: for each header line, confirm the column
    count matches the section's stat list (e.g. Passing header has
    9 cells, Defense header has 15).

[ ] DATA ROW SHAPE: for each non-empty data row, confirm the field
    count matches the section's column count. A Passing data row
    has exactly 9 fields (8 tabs); a Defense row has 15 fields
    (14 tabs); etc.

[ ] PLAYER NAMES: match the roster spelling — NO "#12" or "J. Smith".

[ ] TEAM SCOPE: all stats are for ${teamAbbr} players only. No ${opponentAbbrLabel}.

[ ] NUMBER FORMAT: no commas in any number. Allowed decimals are:
    Passing Rtg (one decimal), and Defense Sacks / TFL (".5"
    half-credits when the screenshot shows them). Every other stat
    is an integer.

[ ] OUTPUT SHAPE: the required paste-target line above the fence,
    the fenced block (exactly ${layout.totalRows} lines of data), and
    nothing else. No "here is the output:", no greetings, no trailing
    notes.

If ANY of these fails, fix and re-run the checks. Do not send
output that fails any of them.`,
      includeTeamMap: true,
      dynastyTeams: currentDynasty?.teams,
    })
  }, [sheetType, config.teamAbbr, config.opponentAbbr, config.isUserControlled, homeTeamAbbr, awayTeamAbbr, game?.week, gameYear, homeRosterObjects, awayRosterObjects, targetRosterObjects, homeTeamTid, awayTeamTid, targetTidNum, userTidForGameYear, currentDynasty?.teams])

  // Short label used inside the Reset/Regenerate button text so the
  // user can tell at a glance what's about to be wiped (e.g. "wipe
  // BAMA stats" not just "wipe data"). Kept short on purpose — the
  // confirm dialog has the full description.
  const regenWipeShort = useMemo(() => {
    if (sheetType === 'scoring') return 'scoring summary'
    if (sheetType === 'teamStats') return 'team stats'
    if (sheetType === 'playerStats') return `${targetTeamAbbr || 'team'} stats`
    return 'saved data'
  }, [sheetType, targetTeamAbbr])

  // Highlight save button when user returns to window
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

  // Load existing sheet or create new one
  useEffect(() => {
    const initSheet = async () => {
      // Use ref for immediate check to prevent race conditions (state updates are async)
      // Also gate on auth.showAuthError so we don't loop on OAuth failures
      if (isOpen && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote && !auth.showAuthError) {
        // Optimistic existing-sheet path: in the common case the sheet
        // already exists, so render the iframe IMMEDIATELY rather than
        // making the user wait on a Drive API existence probe before
        // anything visible happens. Verify in the background; if the
        // sheet was actually trashed, fall back to regenerate.
        // (Previous code awaited sheetExists serially, which on slow
        // connections added 1-2s of blank-modal wait per open.)
        if (existingSheetId && !ignoreExistingSheetId) {
          setSheetId(existingSheetId)
          ;(async () => {
            try {
              const stillExists = await sheetExists(existingSheetId)
              if (stillExists) return
              // Stale sheet (trashed in Drive). Clear state, drop the
              // sheet ID from the game, and bump retryCount so the
              // initSheet effect re-runs and creates a fresh sheet.
              setSheetId(null)
              await saveSheetIdToGame(null)
              if (onSheetCreated) onSheetCreated(null)
              auth.retry()
            } catch {
              // Probe failed — assume the sheet is still live (matches
              // sheetExists' own optimistic fallback) and let the iframe
              // surface any real errors itself.
            }
          })()
          return
        }

        // Create new sheet - set ref immediately to prevent concurrent calls
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          const year = game?.year || currentDynasty?.currentYear
          const week = game?.week || 1

          let sheetInfo
          if (sheetType === 'scoring') {
            // Get existing scoring data to pre-fill (if editing a game that already has scoring data)
            const existingScoringData = game?.boxScore?.scoringSummary || []
            // Pass team rosters for dropdown suggestions (any team with roster gets dropdown)
            sheetInfo = await createScoringSummarySheet(
              homeTeamAbbr,
              awayTeamAbbr,
              year,
              week,
              homeRoster,
              awayRoster,
              existingScoringData,
              currentDynasty?.teams || currentDynasty?.customTeams
            )
          } else if (sheetType === 'teamStats') {
            // Get existing team stats data to pre-fill. The sheet helper
            // takes byTid input and projects onto its home/away columns
            // using the abbrs we pass.
            const teamsForResolve = currentDynasty?.teams || currentDynasty?.customTeams
            const existingTeamStatsByTid = {}
            if (homeTeamTid != null) {
              const stats = getTeamStatsForTid(game, homeTeamTid, teamsForResolve)
              if (stats) existingTeamStatsByTid[Number(homeTeamTid)] = stats
            }
            if (awayTeamTid != null) {
              const stats = getTeamStatsForTid(game, awayTeamTid, teamsForResolve)
              if (stats) existingTeamStatsByTid[Number(awayTeamTid)] = stats
            }
            sheetInfo = await createGameTeamStatsSheet(
              homeTeamAbbr,
              awayTeamAbbr,
              year,
              week,
              Object.keys(existingTeamStatsByTid).length > 0 ? existingTeamStatsByTid : null,
              teamsForResolve
            )
          } else {
            // Player stats — read existing data for the target team via
            // the canonical byTid store (with legacy fallback).
            const existingPlayerStats = getPlayerStatsForTid(game, targetTidNum, currentDynasty?.teams || currentDynasty?.customTeams)
            // Only enforce strict dropdown for user-controlled teams (current + past teams from coachTeamByYear)
            // Opponent teams should allow free text entry even if they have some players in the dynasty
            const roster = config.roster || []
            const isUserTeam = config.isUserControlled || false
            sheetInfo = await createGameBoxScoreSheet(
              config.teamName,
              config.teamAbbr,
              config.opponentAbbr,
              year,
              week,
              isUserTeam,  // Only true for user-controlled teams
              isUserTeam ? roster : [],  // Only pass roster for user teams (enables dropdown)
              existingPlayerStats
            )
          }

          setSheetId(sheetInfo.spreadsheetId)

          // Reset the ignore flag now that we have a new sheet
          setIgnoreExistingSheetId(false)

          // Notify parent of new sheet ID
          if (onSheetCreated) {
            onSheetCreated(sheetInfo.spreadsheetId)
          }

          // Also try to save to game in dynasty (for existing games)
          await saveSheetIdToGame(sheetInfo.spreadsheetId)
        } catch (error) {
          console.error('Failed to create sheet:', error)
          auth.handleError(error)
        } finally {
          setCreatingSheet(false)
          creatingSheetRef.current = false
        }
      }
    }

    initSheet()
  }, [isOpen, user, sheetId, creatingSheet, existingSheetId, auth.retryCount, showDeletedNote, ignoreExistingSheetId])

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShowDeletedNote(false)
      setIgnoreExistingSheetId(false)
      creatingSheetRef.current = false
    }
  }, [isOpen])

  // Save sheet ID to game in dynasty (for existing games).
  //
  // Was rewriting the FULL games subcollection (~1000+ setDocs on a
  // multi-year dynasty) just to attach one sheet ID to one game.
  // Now uses the targeted single-game patch helper — one setDoc.
  const saveSheetIdToGame = async (newSheetId) => {
    if (!currentDynasty || !game?.id) {
      return
    }
    if (sheetType === 'playerStats') {
      if (targetTidNum == null) return
      // Player-stats sheet IDs live in a tid-keyed map. Merge the new id
      // in rather than overwriting the whole map.
      const prev = game?.playerStatsSheetIdByTid || {}
      const next = { ...prev, [targetTidNum]: newSheetId }
      await patchGameFields(currentDynasty.id, game.id, {
        playerStatsSheetIdByTid: next,
      })
      return
    }
    if (!config.sheetIdKey) return
    await patchGameFields(currentDynasty.id, game.id, {
      [config.sheetIdKey]: newSheetId,
    })
  }

  // Sync data from sheet
  // Read player-stats data — per-section merge with AI All in One as
  // the override. The category tabs (Passing, Rushing, etc.) are
  // normally formula-driven from AI All in One, but those formulas get
  // clobbered when the user types directly into them. The semantic the
  // user wants: "anything the user enters in the AI All in One tab
  // overrides anything else in the sheet" — but only for the sections
  // they actually populated. If they pasted only Passing into AI All
  // in One, manual data in the Rushing tab should still be picked up.
  //
  // So we read both sources in parallel and merge per-section: unified
  // wins for any category where it has data, individual tabs fill in
  // categories where unified is empty.
  const readPlayerStatsPreferUnified = async () => {
    const teams = currentDynasty?.teams || currentDynasty?.customTeams
    const [unified, fallback] = await Promise.all([
      readGameBoxScoreFromUnifiedTab(sheetId),
      readGameBoxScoreFromSheet(sheetId, teams),
    ])
    if (!unified) return fallback // AI All in One unreadable — fallback only

    const merged = {}
    const allKeys = new Set([
      ...Object.keys(unified || {}),
      ...Object.keys(fallback || {}),
    ])
    for (const key of allKeys) {
      const unifiedHas = Array.isArray(unified[key]) && unified[key].length > 0
      merged[key] = unifiedHas ? unified[key] : (fallback?.[key] || [])
    }
    return merged
  }

  const handleSyncFromSheet = async () => {
    if (!sheetId) return

    setSyncing(true)
    try {
      let data
      if (sheetType === 'scoring') {
        data = await readScoringSummaryFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      } else if (sheetType === 'teamStats') {
        data = await readGameTeamStatsFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      } else {
        data = await readPlayerStatsPreferUnified()
      }
      await onSave(data)
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

  // Sync and delete sheet
  const handleSyncAndDelete = async () => {
    if (!sheetId) return

    setDeletingSheet(true)
    try {
      let data
      if (sheetType === 'scoring') {
        data = await readScoringSummaryFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      } else if (sheetType === 'teamStats') {
        data = await readGameTeamStatsFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      } else {
        data = await readPlayerStatsPreferUnified()
      }
      await onSave(data)

      // Move sheet to trash (keep sheet ID stored so user can restore if needed)
      await deleteGoogleSheet(sheetId)

      setSheetId(null)
      setShowDeletedNote(true)
      setTimeout(() => {
        onClose()
      }, 2500)
    } catch (error) {
      console.error('Failed to sync/move to trash:', error)
      if (!auth.handleError(error)) {
        toast.error(`Failed to sync/move to trash: ${error.message || 'Unknown error'}`)
      }
    } finally {
      setDeletingSheet(false)
    }
  }

  // Regenerate sheet — also wipes the saved box-score slice for this
  // sheet type so we don't pre-fill the new sheet with the previous
  // (possibly bad) data. Without this clear, regenerating after a
  // misaligned AI paste would leave the corrupt rows persisted on
  // game.boxScore even though the Google Sheet was rebuilt.
  const handleRegenerateSheet = async () => {
    if (!sheetId) return

    // Read-only safety: if the user has lost premium since opening
    // this modal, addGame below would silently no-op via
    // blockIfReadOnly. Without this guard we'd end up deleting the
    // Google Sheet but failing to wipe the dynasty data — the worst
    // possible inconsistency. Catch it up front.
    if (isViewOnly) {
      toast.error('This cloud dynasty is read-only without active premium. Renew premium to reset stats.')
      return
    }

    // Match per-sheetType so the warning text reflects what's actually
    // about to be wiped — players see "all team stats" vs "all home
    // player stats" vs "scoring summary" depending on which sheet they
    // opened, rather than a generic "data will be lost".
    const wipeLabel = (() => {
      if (sheetType === 'scoring') return 'the scoring summary for this game'
      if (sheetType === 'teamStats') return 'the team stats for this game'
      if (sheetType === 'playerStats') return `${targetTeamAbbr || 'team'} player stats for this game`
      return 'the data for this sheet'
    })()

    const confirmed = await confirm({
      title: 'Reset this sheet?',
      message: `This deletes the Google Sheet AND wipes ${wipeLabel} from the dynasty. Player season totals are recalculated to subtract this game's contribution — so the bad stats won't linger anywhere. You'll start over with a fresh empty sheet. Other sheets and other games are not affected.`,
      confirmLabel: `Reset & wipe ${wipeLabel.replace(/ for this game$/, '')}`.slice(0, 60),
      variant: 'danger',
    })
    if (!confirmed) return

    setRegenerating(true)
    try {
      await deleteGoogleSheet(sheetId)

      // Clear sheet ID from game AND wipe the saved slice of
      // game.boxScore that this sheet feeds into, so the next sheet
      // creation starts from a clean slate (and the user's dynasty no
      // longer holds the bad data).
      //
      // Use addGame instead of updateDynasty so player season totals
      // get re-aggregated via the existing delta-tracking logic.
      // Otherwise: data on the game would be cleared, but each
      // affected player's statsByYear[year] would still include the
      // bad contribution and the user would see ghost season stats.
      if (currentDynasty && game?.id) {
        const games = currentDynasty.games || []
        const prevGame = games.find(g => g.id === game.id)
        if (prevGame) {
          // Reset just this sheet's slice of the boxScore. Player-stats
          // and team-stats slices are tid-keyed in the new shape; scoring
          // is still a single array.
          const teamsForResolve = currentDynasty?.teams || currentDynasty?.customTeams
          let updatedGame = { ...prevGame }
          if (sheetType === 'scoring') {
            updatedGame = setScoringSummary(updatedGame, [], teamsForResolve)
            updatedGame.scoringSummarySheetId = null
          } else if (sheetType === 'teamStats') {
            // One sheet, both teams — drop the whole teamStatsByTid map.
            const canon = canonicalBoxScore(updatedGame, teamsForResolve) || { byTid: {}, teamStatsByTid: {}, scoringSummary: [] }
            updatedGame.boxScore = {
              byTid: canon.byTid,
              teamStatsByTid: {},
              scoringSummary: canon.scoringSummary || []
            }
            updatedGame.teamStatsSheetId = null
          } else if (sheetType === 'playerStats' && targetTidNum != null) {
            const canon = canonicalBoxScore(updatedGame, teamsForResolve) || { byTid: {}, teamStatsByTid: {}, scoringSummary: [] }
            const nextByTid = { ...canon.byTid }
            delete nextByTid[targetTidNum]
            updatedGame.boxScore = {
              byTid: nextByTid,
              teamStatsByTid: canon.teamStatsByTid,
              scoringSummary: canon.scoringSummary || []
            }
            const prevMap = updatedGame.playerStatsSheetIdByTid || {}
            const nextMap = { ...prevMap }
            delete nextMap[targetTidNum]
            updatedGame.playerStatsSheetIdByTid = nextMap
          }
          // For non-CPU games, addGame's box-score processing recomputes
          // statsContributed from the new boxScore (correct delta).
          // For CPU games (isCPUGame), addGame skips the box-score path
          // entirely — without this explicit null, a stale
          // statsContributed from a prior coaching-history era could
          // linger and corrupt later operations. Setting it to null up
          // front handles both cases:
          //   non-CPU → overridden by the new computed value at line ~5754 of DynastyContext
          //   CPU     → stays null, which is correct for an unaggregated game
          updatedGame.statsContributed = null
          await addGame(currentDynasty.id, updatedGame)
        }
      }

      // Ignore the old existingSheetId prop so we create a fresh sheet
      setIgnoreExistingSheetId(true)
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

  // Delete the Google Sheet without applying any edits or wiping saved
  // stats. Just clears the per-game sheet-ID reference so opening this
  // modal again creates a fresh sheet pre-filled from existing data.
  const handleDeleteSheetOnly = async () => {
    if (!sheetId || !currentDynasty) return
    const ok = await confirm({
      title: 'Delete this box score sheet?',
      message: 'This deletes the Google Sheet without applying any edits. Your dynasty box score data stays as-is.',
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (!ok) return
    setDeletingSheet(true)
    try {
      await deleteGoogleSheet(sheetId)
      // Clear the saved sheet-ID reference on the game so reopening
      // doesn't try to resume the now-deleted sheet. Player-stats sheet
      // IDs live in a tid-keyed map; other sheet types use a single field.
      if (game?.id) {
        const games = currentDynasty.games || []
        const prevGame = games.find(g => g.id === game.id)
        if (prevGame) {
          let updatedGame
          if (sheetType === 'playerStats' && targetTidNum != null) {
            const prevMap = prevGame.playerStatsSheetIdByTid || {}
            const nextMap = { ...prevMap }
            delete nextMap[targetTidNum]
            updatedGame = { ...prevGame, playerStatsSheetIdByTid: nextMap }
          } else if (config.sheetIdKey) {
            updatedGame = { ...prevGame, [config.sheetIdKey]: null }
          } else {
            updatedGame = prevGame
          }
          await addGame(currentDynasty.id, updatedGame)
        }
      }
      setIgnoreExistingSheetId(true)
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

  const embedUrl = sheetId ? getSingleSheetEmbedUrl(sheetId) : null
  const isLoading = creatingSheet

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4"
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
        <SheetModalHeader eyebrow="Box Score" title={config.title} onClose={handleClose} />

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
              <SheetLoadingHint active={isLoading} />
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="card p-8 border-l-[3px] max-w-md text-center" style={{ borderLeftColor: 'var(--surface-5)' }}>
              <p className="text-xl font-bold text-txt-primary">Saved</p>
            </div>
          </div>
        ) : sheetId ? (
          <div className="flex-1 flex flex-col overflow-hidden gap-3">
            {/* AI Hero Panel — the primary path. Scoring sheets surface
                BOTH prompts (Scoring Summary + All Plays) since the
                user picks which entry mode fits the screenshots they
                have. Player/Team stats sheets get a single CTA. */}
            <SheetModalAIHero
              tagline="Skip the typing. Let AI fill the box score."
              buttons={sheetType === 'scoring'
                ? [
                    { label: 'All Plays AI Prompt', prompt: aiPrompt?.allPlays },
                    { label: 'Scoring Summary AI Prompt', prompt: aiPrompt?.scoring },
                  ]
                : [
                    { label: 'Copy AI Prompt', prompt: aiPrompt },
                  ]
              }
            />

            {/* Sheet — embedded iframe on desktop, instructional view
                on mobile / when the user opts out of embedded. Manual
                editing happens here either way. */}
            {useEmbedded ? (
              <div className="flex-1 flex flex-col overflow-hidden min-h-0 border border-surface-4 rounded-lg">
                <SheetToolbar
                  sheetId={sheetId}
                  embedUrl={embedUrl}
                  teamColors={teamColors}
                  title={`${config.title} Google Sheet`}
                />
              </div>
            ) : (
              <SheetManualEntry sheetId={sheetId} />
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
              regenLabel={`Reset (wipe ${regenWipeShort})`}
              regenTitle="Delete the Google Sheet AND wipe saved stats for this team / this game from the dynasty (player season totals are recalculated to subtract this game's contribution). Start over with a fresh sheet."
              showEmbeddedToggle
              useEmbedded={useEmbedded}
              onToggleEmbedded={() => { const newValue = !useEmbedded; setUseEmbedded(newValue); localStorage.setItem('sheetEmbedPreference', newValue.toString()); }}
            />
          </div>
        ) : (
          // Fallback placeholder for the brief moment between modal
          // open and initSheet completing — or when initSheet failed
          // and AuthErrorModal is up to handle the recovery action.
          // No inline refresh UI here anymore: AuthErrorModal (rendered
          // at the bottom of this component) is the single source of
          // session-expired controls.
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-sm text-txt-secondary">
              {auth.showAuthError ? 'Refresh your session to continue.' : 'Setting up sheet…'}
            </div>
          </div>
        )}
        </div>
      </div>

      <AuthErrorModal
        isOpen={auth.showAuthError}
        onClose={auth.closeAuthError}
        onRefresh={auth.retry}
        teamColors={teamColors}
      />
    </div>,
    document.body,
  )
}
