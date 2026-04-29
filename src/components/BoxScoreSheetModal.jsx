import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import AIPromptModal from './AIPromptModal'
import SheetToolbar, { SheetErrorBanner } from './SheetToolbar'
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
import { getCurrentTeamAbbr, getAbbrFromTeamName, getOriginalTeamAbbr, getTidFromAbbr } from '../data/teamRegistry'
import { getModalColors, getContrastTextColor } from '../utils/colorUtils'
import { buildAIPrompt } from '../utils/aiPrompt'
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
 * - sheetType: 'homeStats' | 'awayStats' | 'scoring'
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
  existingSheetId,
  game,
  teamColors
}) {
  const { currentDynasty, updateDynasty, addGame } = useDynasty()
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
  const [useEmbedded, setUseEmbedded] = useState(() => {
    return localStorage.getItem('sheetEmbedPreference') === 'true'
  })
  const [showSessionError, setShowSessionError] = useState(false)
  const [highlightSave, setHighlightSave] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [ignoreExistingSheetId, setIgnoreExistingSheetId] = useState(false)
  const [showAIPrompt, setShowAIPrompt] = useState(false)

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
    // For legacy games, try to get tid from abbreviation
    homeTeamTid = getTidFromAbbr(homeTeamAbbr)
    awayTeamTid = getTidFromAbbr(awayTeamAbbr)
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

  // Determine title and team info based on sheet type
  const getSheetConfig = () => {
    switch (sheetType) {
      case 'homeStats':
        return {
          title: `${homeTeamAbbr} Player Stats`,
          teamAbbr: homeTeamAbbr,
          teamName: homeTeamName,
          opponentAbbr: awayTeamAbbr,
          roster: homeRoster,
          isUserControlled: isHomeTeamUserControlled,
          sheetIdKey: 'homeStatsSheetId',
          instructions: 'Enter player statistics for each category tab (Passing, Rushing, Receiving, etc.)',
          columns: 'Passing, Rushing, Receiving, Blocking, Defense, Kicking, Punting, Kick Return, Punt Return'
        }
      case 'awayStats':
        return {
          title: `${awayTeamAbbr} Player Stats`,
          teamAbbr: awayTeamAbbr,
          teamName: awayTeamName,
          opponentAbbr: homeTeamAbbr,
          roster: awayRoster,
          isUserControlled: isAwayTeamUserControlled,
          sheetIdKey: 'awayStatsSheetId',
          instructions: 'Enter player statistics for each category tab (Passing, Rushing, Receiving, etc.)',
          columns: 'Passing, Rushing, Receiving, Blocking, Defense, Kicking, Punting, Kick Return, Punt Return'
        }
      case 'scoring':
        return {
          title: 'Scoring Summary',
          sheetIdKey: 'scoringSummarySheetId',
          instructions: 'Enter each scoring play with team, scorer, and details',
          columns: 'Team | Scorer | Passer | Score Type | Quarter | Time Left'
        }
      case 'teamStats':
        return {
          title: 'Team Stats',
          sheetIdKey: 'teamStatsSheetId',
          instructions: 'Enter team statistics in each tab (one for each team)',
          columns: 'First Downs, Rush/Pass Stats, Turnovers, Penalties, Possession Time'
        }
      default:
        return { title: 'Stats', sheetIdKey: '', instructions: '', columns: '' }
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
      return buildAIPrompt({
        title: `${baseTitle} — Scoring Summary`,
        roster: scoringUserRoster,
        opponentRoster: scoringOpponentRoster,
        structure: `This sheet has ONE tab: "Scoring Summary". It has 30 rows (one per scoring play, unused rows blank) and 9 columns.

═══════════════════════════════════════════════════════════
HOW TO READ THE SCORING-SUMMARY SCREENSHOT — do this first
═══════════════════════════════════════════════════════════
The user pastes a screenshot of CFB26's post-game Scoring Summary page. Each entry on that page is ONE scoring play. Before writing any row:

1. EACH ENTRY ON THE SCREENSHOT = ONE ROW. The PAT attempt listed below a TD is NOT a separate row — it collapses into that TD's row via column F (PAT Result).

2. TEAM COLUMN: each entry shows the scoring team's helmet/abbr on the left. Put EXACTLY "${homeTeamAbbr}" or "${awayTeamAbbr}" in column A — whatever the screenshot shows for that play.

3. QUARTER + TIME: CFB26 shows "Q2 03:47" style. Q1/Q2/Q3/Q4 map to "1"/"2"/"3"/"4" (quoted digits). Overtime entries map to "OT" (or "2OT", "3OT"... for subsequent overtimes). Time is "MM:SS" with leading zeros on BOTH minutes and seconds — "03:47" not "3:47", "00:15" not "0:15".

4. SCORING SUMMARY ORDER: the screenshot lists plays chronologically within each quarter. OT plays are ALWAYS after Q4 — never let OT plays land first even if the screenshot displays them in a different visual position.

5. SCORE TYPE mapping:
     - Rushing TD → run into the endzone (column D = yards on the run)
     - Passing TD → QB threw to a receiver who scored (column B = receiver, column C = QB)
     - Field Goal → kicker's points (column B = kicker, column D = FG distance in yards)
     - Safety → opposing offense tackled/flagged in its own endzone (column B may be the defender or "Defense"; column D = blank)
     - Kick Return TD / Punt Return TD / INT Return TD / Fumble Return TD / Blocked Punt/FG TD → self-explanatory; column B = the returner/recoverer; column C = blank

6. PAT RESULT (column F): Every TD row MUST have a PAT result (Made XP / Missed XP / Blocked XP / Converted 2PT / Failed 2PT). Field goals and safeties have BLANK PAT (empty string, not "N/A").

7. YARDS (column D): for TDs this is the yardage of the SCORING PLAY ITSELF — not the length of the drive. For a 3-yard TD pass, D = 3, NOT 75. For FGs, D = the kick distance. For safeties, D = blank.

8. OPPONENT PLAYER NAMES: the opponent's roster is provided separately in this prompt. Names in the opponent column must come from THAT list. Do not type "#12" or "J. Smith" — use the full roster name. If the screenshot shows only a jersey number and the roster doesn't clearly match, leave Scorer blank rather than guess.

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. Output ALL 9 columns (A through I) per row, paste at cell A2. The sheet has no pre-filled data rows — you fill everything below the header.
2. ONE ROW PER SCORING PLAY, in chronological order (earliest quarter/latest time first → later quarter). PAT attempts are NOT separate rows — they collapse into the TD row via column F (PAT Result).
3. Output AT MOST 30 rows. Leave remaining rows blank (do not output them at all — just stop).
4. NO COMMAS in numbers. "24" never "1,234".
5. INTEGERS ONLY for Yards and Quarter.
6. Use ONLY the literal dropdown values listed below for columns A, E, F, G. Strict dropdowns — wrong value is rejected.
7. BLANK CELLS for unknowns. Never guess, never use "N/A" (except where explicitly allowed — this sheet uses empty string, NOT "N/A", for plays without a PAT).
8. No header row, no commentary, no explanation. SINGLE TSV block.

═══════════════════════════════════════════════════════════
TAB: "Scoring Summary" — up to 30 rows × 9 columns
Paste your block at cell A2 of the "Scoring Summary" tab
═══════════════════════════════════════════════════════════

Col | Header       | Format / Allowed values
----+--------------+----------------------------------------------------------------------
 A  | Team         | STRICT dropdown: EXACTLY "${homeTeamAbbr}" or "${awayTeamAbbr}" (uppercase). No other values.
 B  | Scorer       | Player name — the player who scored (rusher/receiver for TDs, kicker for FGs/PATs, returner for return TDs, "Defense" or defender name for safeties/defensive TDs).
                  | ⚠️ NAME DISAMBIGUATION: the scoring play belongs to whichever team
                  |    scored (column A). Resolve the full name against THAT team's
                  |    roster block — HOME roster for "${homeTeamAbbr}" scores, OPPONENT
                  |    roster for "${awayTeamAbbr}" scores. If both rosters contain a
                  |    player matching the same initial + last name, use jersey
                  |    number or position to pick the right one; otherwise leave
                  |    Scorer blank (never guess across teams).
 C  | Passer       | QB name who threw the TD pass. BLANK for non-passing scores (rushing TD, FG, safety, return TD, defensive TD).
                  | Passer is always on the SAME team as Scorer — match to that team's roster.
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
[ ] Every row has EXACTLY 9 tab-separated values (8 tab characters per row)
[ ] Column A is EXACTLY "${homeTeamAbbr}" or "${awayTeamAbbr}" — nothing else
[ ] Column E is one of the 9 exact Score Type values, no paraphrasing
[ ] Column F is one of the 6 exact PAT Result values (empty string for FG / Safety)
[ ] Column G is "1"/"2"/"3"/"4"/"OT"/"2OT"/"3OT"/"4OT" — quoted as listed
[ ] Column H is MM:SS with leading zeros
[ ] Rows are chronological
[ ] Total rows ≤ 30; no header row; no commas in numbers
[ ] PAT row is NOT a separate row; the PAT result is in column F of the TD row`,
        includeTeamMap: true,
      })
    }

    if (sheetType === 'teamStats') {
      return buildAIPrompt({
        title: `${baseTitle} — Team Stats`,
        structure: `This sheet has ONE tab: "Team Stats". It has 30 rows (one per stat category) and 3 columns. Column A is the stat label (pre-filled, PROTECTED). Column B is the AWAY team's value (${awayTeamAbbr}). Column C is the HOME team's value (${homeTeamAbbr}).

═══════════════════════════════════════════════════════════
HOW TO READ THE TEAM-STATS SCREENSHOT — do this first
═══════════════════════════════════════════════════════════
The user pastes CFB26's "Team Stats" post-game screen. That screen shows TWO columns, one per team, with the stat label down the middle. Before writing any TSV row:

1. IDENTIFY TEAM ORDER: the screenshot usually shows home team on ONE side (often right) and away on the other. ${awayTeamAbbr} = AWAY (your output column B). ${homeTeamAbbr} = HOME (your output column C). Confirm by reading the team names/helmets in the header of the screenshot. If you cannot reliably tell which side is which, stop and say so — do not guess.

2. POSSESSION TIME: CFB26 shows possession as "MM:SS" (e.g. "32:14"). Split into TWO separate rows in the sheet: Row 29 "Poss Minutes" (integer) and Row 30 "Poss Seconds" (integer). "32:14" → row 29 = 32, row 30 = 14.

3. RED ZONE: CFB26 shows red-zone conversions (e.g. "3/4 · 75%"). The sheet has separate rows for attempts, successes, and percent. Red Zone Pct row takes the PERCENT AS A WHOLE NUMBER (75, not 0.75 and not "75%").

4. PENALTIES / 3RD DOWNS / 4TH DOWNS: shown as "fraction (percent)" in game. Put attempts and conversions in separate rows as the label requires.

5. THIRD/FOURTH DOWN EFFICIENCY: if shown as "6/14" split into two rows: "3rd Down Conversions" = 6, "3rd Down Attempts" = 14.

6. YARDS BREAKDOWN: Total Offense, Rush Yards, Pass Yards, Net Passing may differ slightly from Total Offense. Copy each separately — do NOT derive Pass Yards as Total Offense minus Rush Yards.

7. BLANKS: if a stat isn't visible in the screenshot, leave the cell BLANK. Do not invent. Do not copy another team's value into the missing one.

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. OUTPUT COLUMNS B AND C ONLY. Column A (stat label) is PROTECTED and pre-filled — never output it.
2. ROW ORDER IS FIXED — the 30 rows match the exact stat order below. Row 1 of your output = "First Downs", row 2 = "Total Offense", ..., row 30 = "Poss Seconds". Never reorder, never skip, never add.
3. Output EXACTLY 30 data rows, each with EXACTLY 2 tab-separated values (away value, home value).
4. NO COMMAS in numbers. "1234" never "1,234".
5. ENTER EVERY NUMBER YOU CAN SEE. If a stat is visible in the screenshots (even if it's only the combined-format number or average), extract and enter it per the rules below. Only leave a cell BLANK if the stat is GENUINELY not visible anywhere in the provided screenshots.
6. INTEGERS for all rows EXCEPT row 26 (Punt Avg), which is a one-decimal number (e.g. 42.7). Red Zone Pct is a whole-number percent (e.g. 75 means 75%). Possession time is split into separate Poss Minutes and Poss Seconds rows (both integers).
7. Use 0 for a stat that is genuinely zero. Use a BLANK cell only if the stat is truly unknown/unreported.
8. Column B = AWAY team (${awayTeamAbbr}), Column C = HOME team (${homeTeamAbbr}). Never swap.
9. No header row, no stat labels, no commentary. SINGLE TSV block.

═══════════════════════════════════════════════════════════
DATA-INTERPRETATION RULES (read before reading rows)
═══════════════════════════════════════════════════════════
A. CFB26 shows several stats as pipe-separated combined labels. You MUST split each one into the separate rows shown:
     • "Rushes | Yards | TDs" (e.g. "18 | 73 | 1") → Row 4 Rush Attempts=18, Row 5 Rush Yards=73, Row 6 Rush TDs=1
     • "Comp | Att | TDs" (e.g. "21 | 31 | 3") → Row 7 Completions=21, Row 8 Pass Attempts=31, Row 9 Pass TDs=3
     • "3rd Down Conv." (e.g. "7 | 12 (58%)") → Row 11 =7, Row 12 =12. Ignore the % — it's derived.
     • "4th Down Conv." (e.g. "1 | 2 (50%)") → Row 13 =1, Row 14 =2. Ignore the %.
     • "2-Point Conv." (e.g. "0 | 0 (0%)") → Row 15 =0, Row 16 =0. Ignore the %.
     • "Red Zone TD | FG | %" (e.g. "3 | 0 | 60%") → Row 17 =3, Row 18 =0, Row 19 =60 (integer percent).
     • "Penalties" (e.g. "1 | 10") → Row 27 Penalties =1, Row 28 Penalty Yards =10.
B. "Turnovers" in CFB26 shows as "2 (-1)" — the "2" is the turnover COUNT (enter 2). The "(-1)" is turnover margin — IGNORE it.
C. Row 26 (Punt Avg): CFB26's "Punts" stat is the punt AVERAGE, shown as a decimal (e.g. "42.7"). Enter it as a decimal. Do NOT try to derive punt count — the screen doesn't show it. Do NOT leave it blank when the average is visible.
D. Calculated/derived fields ("Yards Per Play", "Yards Per Rush", "Yards Per Pass") are NOT rows in this sheet — skip them. Do not try to fit them anywhere.
E. "Total Offense" (Row 2) = the value CFB26 labels "Total Offense". If only rushing and passing yards are visible, sum them for Total Offense.
F. Percentage rows want an integer 0-100. "75%" → "75". Never "0.75" or "75.00".
G. Possession Time displayed as "MM:SS" (e.g. "26:12") splits into Poss Minutes "26" and Poss Seconds "12". Never put "26:12" in a single row.
H. Blank only when truly not visible across ALL provided screenshots. Never insert "N/A", "—", or "0" to substitute for a missing value.

═══════════════════════════════════════════════════════════
TAB: "Team Stats" — 30 rows × 2 editable columns
Paste your block at cell B2 of the "Team Stats" tab
═══════════════════════════════════════════════════════════

Row | Col A (PROTECTED / pre-filled) | Col B (${awayTeamAbbr} — AWAY) | Col C (${homeTeamAbbr} — HOME) | Format
----+--------------------------------+--------------------------------+--------------------------------+---------------------------
  1 | First Downs                    | away first downs               | home first downs               | integer
  2 | Total Offense                  | away total offense yards       | home total offense yards       | integer
  3 | Total Plays                    | away total plays               | home total plays               | integer
  4 | Rush Attempts                  | away rush attempts             | home rush attempts             | integer
  5 | Rush Yards                     | away rush yards                | home rush yards                | integer
  6 | Rush TDs                       | away rushing TDs               | home rushing TDs               | integer
  7 | Completions                    | away pass completions          | home pass completions          | integer
  8 | Pass Attempts                  | away pass attempts             | home pass attempts             | integer
  9 | Pass TDs                       | away passing TDs               | home passing TDs               | integer
 10 | Passing Yards                  | away passing yards             | home passing yards             | integer
 11 | 3rd Down Conv                  | away 3rd down conversions      | home 3rd down conversions      | integer
 12 | 3rd Down Att                   | away 3rd down attempts         | home 3rd down attempts         | integer
 13 | 4th Down Conv                  | away 4th down conversions      | home 4th down conversions      | integer
 14 | 4th Down Att                   | away 4th down attempts         | home 4th down attempts         | integer
 15 | 2PT Conv                       | away 2PT conversions           | home 2PT conversions           | integer
 16 | 2PT Att                        | away 2PT attempts              | home 2PT attempts              | integer
 17 | Red Zone TD                    | away red-zone TDs              | home red-zone TDs              | integer
 18 | Red Zone FG                    | away red-zone FGs              | home red-zone FGs              | integer
 19 | Red Zone Pct                   | away red-zone percent          | home red-zone percent          | integer whole-number percent (e.g. 75 for 75%)
 20 | Turnovers                      | away turnovers                 | home turnovers                 | integer
 21 | Fumbles Lost                   | away fumbles lost              | home fumbles lost              | integer
 22 | Interceptions                  | away interceptions thrown      | home interceptions thrown      | integer
 23 | Punt Ret Yards                 | away punt return yards         | home punt return yards         | integer
 24 | Kick Ret Yards                 | away kick return yards         | home kick return yards         | integer
 25 | Total Yards                    | away total yards               | home total yards               | integer
 26 | Punt Avg                       | away punt average (yds)        | home punt average (yds)        | decimal, one digit (e.g. 42.7) — the number CFB26 shows next to "Punts"
 27 | Penalties                      | away penalties count           | home penalties count           | integer
 28 | Penalty Yards                  | away penalty yards             | home penalty yards             | integer
 29 | Poss Minutes                   | away possession minutes        | home possession minutes        | integer (0-60)
 30 | Poss Seconds                   | away possession seconds        | home possession seconds        | integer (0-59)

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== TEAM STATS — paste at cell B2 of "Team Stats" tab ===
<row1 away>\\t<row1 home>
<row2 away>\\t<row2 home>
... (30 total rows in the exact stat order above)

(Each \\t above represents a LITERAL TAB character — use actual tab characters, not the text "\\t".)

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] Exactly 30 data rows (count them)
[ ] Exactly 2 tab-separated values per row (1 tab character per line)
[ ] Row order matches the 30-row list above EXACTLY
[ ] Column B is ${awayTeamAbbr} (away); Column C is ${homeTeamAbbr} (home) — not swapped
[ ] All values INTEGERS — no commas, no decimals — EXCEPT row 26 (Punt Avg), which is a one-decimal number (e.g. 42.7)
[ ] Every pipe-separated CFB26 stat was SPLIT into its rows (Rushes|Yds|TDs, Comp|Att|TDs, 3rd/4th down, 2PT, Red Zone, Penalties)
[ ] Row 26 Punt Avg filled with the decimal shown next to "Punts" in CFB26 (not blank, not a count)
[ ] 0 used for genuine zeros; blank only for truly unknown stats
[ ] No header row, no stat labels, no commentary`,
        includeTeamMap: true,
      })
    }

    // Player stats (homeStats or awayStats) — 9 tabs
    const teamAbbr = config.teamAbbr || ''
    const opponentAbbrLabel = config.opponentAbbr || ''
    // Only pass roster when the tab is the user-controlled team — Column A
    // is a strict roster dropdown only for the user's team.
    const playerStatsRoster = config.isUserControlled
      ? (sheetType === 'homeStats' ? homeRosterObjects : awayRosterObjects)
      : []
    const layout = computeUnifiedTabLayout()
    const sectionSummary = layout.sections
      .map(s => `  ${s.title}: rows ${s.dataStart}–${s.dataEnd} (${s.rowCount} data rows)`)
      .join('\n')

    // Per-section row spec for the prompt — what each row should contain
    const rowSpec = layout.sections.map((s, idx) => {
      const isLast = idx === layout.sections.length - 1
      const lines = []
      lines.push(`Row ${s.bannerRow}:        ═══ ${s.title.toUpperCase()} ═══   (this exact text in column A)`)
      lines.push(`Row ${s.headerRow}:        ${s.headers.join(' | ')}   (tab-separated column headers)`)
      lines.push(`Rows ${s.dataStart}–${s.dataEnd}: ${s.rowCount} data row slots — fill stat-earners from the top, leave any unused slots BLANK (just an empty line)`)
      if (!isLast) lines.push(`Row ${s.dataEnd + 1}:       blank separator`)
      return lines.join('\n')
    }).join('\n\n')

    // Banner-position table — gives the AI an absolute-row checklist it
    // can verify against its own draft. The previous version of this
    // prompt only specified row ranges per section; the AI would
    // sometimes undershoot data rows in an earlier section and every
    // later banner would shift down a row, landing inside the next
    // section's data area (e.g. "═══ DEFENSE ═══" appearing in a
    // Blocking data row). Pinning each banner to its absolute line
    // number — and asking the AI to physically count and verify —
    // makes the misalignment self-detectable.
    const bannerPositionTable = layout.sections
      .map(s => `  Line ${s.bannerRow}: "═══ ${s.title.toUpperCase()} ═══"`)
      .join('\n')

    // Pre-built skeleton the AI fills in. Every banner, header, blank
    // separator, and empty data slot is laid out as the literal text
    // the AI must emit. Only the player-data lines are placeholders.
    // This is the simplest way to make the row count physically
    // unambiguous — the AI replaces `<EMPTY>` / `<DATA>` placeholders
    // and never generates the structure freehand.
    const skeleton = (() => {
      const out = []
      layout.sections.forEach((s, idx) => {
        const isLast = idx === layout.sections.length - 1
        out.push(`${s.bannerRow}\t═══ ${s.title.toUpperCase()} ═══`)
        out.push(`${s.headerRow}\t${s.headers.join('\\t')}`)
        for (let i = 0; i < s.rowCount; i++) {
          out.push(`${s.dataStart + i}\t<DATA-OR-EMPTY>`)
        }
        if (!isLast) out.push(`${s.dataEnd + 1}\t<EMPTY-SEPARATOR>`)
      })
      return out.join('\n')
    })()

    return buildAIPrompt({
      title: `${baseTitle} — ${teamAbbr} Player Stats`,
      roster: playerStatsRoster,
      structure: `This Google Sheet contains a tab named "${AI_UNIFIED_TAB.title}" that holds EVERY stat category for the ${teamAbbr} team in one place. Your job: produce ONE giant tab-separated block that the user can paste at cell A1 of that tab to fill the entire layout in a single paste. Stats are for the ${teamAbbr} team only (opponent: ${opponentAbbrLabel}).

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

7. BLANKS VS ZEROS: the screenshot lists only players who TOUCHED that category. For those players, 0 means "played but didn't produce" and is valid. A player who didn't appear on the screenshot should not be in your output at all — don't pad with zero rows.

═══════════════════════════════════════════════════════════
OUTPUT SHAPE — read carefully
═══════════════════════════════════════════════════════════
Output EXACTLY ${layout.totalRows} lines. Each line corresponds to ONE row of the "${AI_UNIFIED_TAB.title}" tab when pasted at cell A1. Within a line, fields are TAB-separated (real tab character \\t, not the literal text "\\t"). Empty slots = an empty line (just \\n).

The tab is divided into 9 sections stacked vertically. Each section has:
  • a banner row (column A only, the section title)
  • a column-header row (one cell per stat)
  • a fixed number of data row slots
  • a blank separator (except after the last section)

Section row ranges (1-indexed):
${sectionSummary}

Total rows: ${layout.totalRows}. Max columns: ${layout.maxCols}.

═══════════════════════════════════════════════════════════
EXACT ROW-BY-ROW LAYOUT — emit each row in this order
═══════════════════════════════════════════════════════════
${rowSpec}

═══════════════════════════════════════════════════════════
BANNER POSITIONS — these line numbers are non-negotiable
═══════════════════════════════════════════════════════════
The output is exactly ${layout.totalRows} lines (1-indexed). The 9
section banners MUST land on these exact line numbers. If your draft
puts a banner anywhere else, your data-row counts in earlier
sections are wrong — go back and fix them.

${bannerPositionTable}

If line N starts with "═══ X ═══", line N MUST be one of the lines
above. There are NO other banner lines, EVER. Banner text never
appears mid-section, never appears in a data row's column A as a
"value", never appears with tab characters or trailing data. Any
"═══ ... ═══" you see anywhere except the lines above means your
output is misaligned.

═══════════════════════════════════════════════════════════
CRITICAL RULES
═══════════════════════════════════════════════════════════
1. Output EXACTLY ${layout.totalRows} lines. Count them. The user pastes the entire output at cell A1 of the "${AI_UNIFIED_TAB.title}" tab — every line MUST land on the correct row.
2. Banner rows: output ONLY the banner text in column A (no tabs). Example: \`═══ PASSING ═══\`. Do NOT add any other columns to a banner line.
3. Column header rows: output the EXACT header text for that section, tab-separated, with NO extra columns past the section's stat list. The header row for "Passing" has 8 cells; for "Defense" it has 15.
4. Data rows: each non-empty data row must have EXACTLY the column count of its section's header row. Empty slots in a data row are tab-separated empty fields, NOT skipped tabs. (e.g. a Passing data row always has 8 fields separated by 7 tabs.)
5. Empty data slots (rows where no player stat-earner exists): output a TRULY EMPTY LINE (just \\n) — no tabs, no spaces.
6. Blank separator rows (between sections): output a TRULY EMPTY LINE.
7. NO COMMAS in numbers ("1234" not "1,234"). INTEGERS only EXCEPT Passing Rtg which is one decimal (e.g. "148.3").
8. Player names: if this is the user's team, names MUST match the roster (strict dropdown). For opponent, any reasonable name. NEVER "#12" or "J. Smith" when a full name exists in the roster.
9. ${teamAbbr} players ONLY. No ${opponentAbbrLabel} players in this output.
10. No commentary, no explanation, no markdown fencing. SINGLE block of ${layout.totalRows} lines.

═══════════════════════════════════════════════════════════
COLUMN SPEC PER SECTION (for reference)
═══════════════════════════════════════════════════════════
${layout.sections.map(s => `${s.title} (${s.headers.length} cols): ${s.headers.join(' | ')}`).join('\n')}

Notes:
  • Passing: Rtg is decimal one-place (e.g. 148.3); all others integer.
  • Rushing: BT = Broken Tackles, YAC = Yards After Contact, "20+" = runs of 20+ yards.
  • Receiving: RAC = Receiving Yards After Catch.
  • Defense: TFL = Tackles For Loss, FF = Forced Fumbles, FR = Fumble Recoveries, Blocks = kicks/punts blocked, TD = defensive TDs.
  • Kicking: FGA/FGM 29/39/49/50+ = field goals by distance bucket; XPM/XPA/XPB = extra points made/attempted/blocked.
  • Punting: Block = punts blocked, In20 = punts downed inside the 20, TB = touchbacks.

═══════════════════════════════════════════════════════════
COMMON MISTAKES — actively avoid these
═══════════════════════════════════════════════════════════
✗ Putting ${opponentAbbrLabel} players in this sheet (they belong on a different tab)
✗ Using "J. Smith" or jersey-number-only when the roster has the full name
✗ Guessing split Solo/Assists when the screenshot shows only a total
✗ Inventing 20+ / BT / YAC / RAC / Drops when those columns aren't visible
✗ Outputting decimal numbers for anything except Passing Rtg
✗ Adding commas to totals ("1,234" → wrong; "1234" is correct)
✗ Reordering columns — the column order per section is FIXED
✗ Mixing the "Long" value with TD yardage (Long is the longest SINGLE play)
✗ Skipping empty rows: every row position MUST be present in the output, even as a blank line
✗ Outputting fewer or more than ${layout.totalRows} total lines
✗ Adding any text outside the ${layout.totalRows}-line block (no "here is the output:", no markdown fences, no trailing notes)

═══════════════════════════════════════════════════════════
FINAL CHECK before you send — actually run these on your draft
═══════════════════════════════════════════════════════════
Don't just glance at this list. Physically execute each check
against the lines you just wrote. Misalignment is the #1 failure
mode of this output and it will silently corrupt the user's sheet.

[ ] LINE COUNT: split your draft on newlines. The result MUST
    contain EXACTLY ${layout.totalRows} elements. If it's anything
    else, you're done — go fix.

[ ] BANNER POSITIONS: for each banner line number listed above, look
    at THAT line of your draft (1-indexed) and confirm the line
    contains exactly the expected banner text and NOTHING else (no
    tabs, no trailing data). If line ${layout.sections[0]?.bannerRow ?? 1} is not
    "═══ ${layout.sections[0]?.title?.toUpperCase() ?? 'PASSING'} ═══", the rest of the output is shifted; fix the
    section above it.

[ ] STRAY BANNERS: search your draft for the string "═══". Every
    occurrence MUST be on one of the banner-position lines above.
    Any "═══ X ═══" appearing in a data row position means an
    earlier section is short on rows.

[ ] EMPTY-LINE COUNT: there should be ${layout.sections.length - 1} blank separator lines
    between sections, plus however many empty data slots you didn't
    fill. An empty line is a TRULY EMPTY line — \\n only, no
    spaces, no tabs.

[ ] BANNER ROW SHAPE: for each banner line, confirm there are zero
    tab characters on that line. Banners are column A only.

[ ] HEADER ROW SHAPE: for each header line, confirm the column
    count matches the section's stat list (e.g. Passing header has
    8 cells, Defense header has 15).

[ ] PLAYER NAMES: match the roster spelling — NO "#12" or "J. Smith".

[ ] TEAM SCOPE: all stats are for ${teamAbbr} players only. No ${opponentAbbrLabel}.

[ ] NUMBER FORMAT: no commas in any number. Rtg may have one
    decimal; every other stat is integer.

[ ] NO COMMENTARY: no markdown fences, no "here is the output:",
    no trailing notes. The block is exactly ${layout.totalRows} lines and nothing
    else surrounds it.

If ANY of these fails, fix and re-run the checks. Do not send
output that fails any of them.`,
      includeTeamMap: true,
    })
  }, [sheetType, config.teamAbbr, config.opponentAbbr, config.isUserControlled, homeTeamAbbr, awayTeamAbbr, game?.week, gameYear, homeRosterObjects, awayRosterObjects, homeTeamTid, awayTeamTid, userTidForGameYear])

  const aiPromptTitle = useMemo(() => {
    const weekLabel = game?.week != null ? `Week ${game.week}` : 'Game'
    const yearLabel = gameYear || ''
    const matchupLabel = `${awayTeamAbbr} @ ${homeTeamAbbr}`.trim()
    const baseTitle = `${yearLabel} ${weekLabel} ${matchupLabel}`.trim()
    if (sheetType === 'scoring') return `${baseTitle} — Scoring Summary`
    if (sheetType === 'teamStats') return `${baseTitle} — Team Stats`
    return `${baseTitle} — ${config.teamAbbr || ''} Player Stats`
  }, [sheetType, config.teamAbbr, homeTeamAbbr, awayTeamAbbr, game?.week, gameYear])

  // Where the user should paste the AI's reply. Surfaced prominently in
  // the AI Prompt modal so the user doesn't have to fish through the
  // prompt text to find it. Critically: for player-stats the user
  // pastes into the consolidated "AI All in One" tab (NOT the
  // individual category tabs like Passing / Rushing — those are driven
  // by formulas off the AI All in One tab).
  const aiPasteTarget = useMemo(() => {
    if (sheetType === 'scoring') return `Cell A2 of the "Scoring Summary" tab`
    if (sheetType === 'teamStats') return `Cell B2 of the "Team Stats" tab`
    // Player-stats sheet: single mega-paste into the AI All in One tab.
    return `Cell A1 of the "${AI_UNIFIED_TAB.title}" tab — DO NOT paste into the individual category tabs (Passing, Rushing, etc.); those are driven by formulas off the "${AI_UNIFIED_TAB.title}" tab.`
  }, [sheetType])

  // Short label used inside the Reset/Regenerate button text so the
  // user can tell at a glance what's about to be wiped (e.g. "wipe
  // BAMA stats" not just "wipe data"). Kept short on purpose — the
  // confirm dialog has the full description.
  const regenWipeShort = useMemo(() => {
    if (sheetType === 'scoring') return 'scoring summary'
    if (sheetType === 'teamStats') return 'team stats'
    if (sheetType === 'homeStats') return `${homeTeamAbbr || 'home'} stats`
    if (sheetType === 'awayStats') return `${awayTeamAbbr || 'away'} stats`
    return 'saved data'
  }, [sheetType, homeTeamAbbr, awayTeamAbbr])

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

  // Reset session error when modal opens or sheetId changes
  useEffect(() => {
    if (isOpen) {
      setShowSessionError(false)
    }
  }, [isOpen, sheetId])

  // Load existing sheet or create new one
  useEffect(() => {
    const initSheet = async () => {
      // Use ref for immediate check to prevent race conditions (state updates are async)
      // Also check showSessionError to stop retrying on OAuth failures
      if (isOpen && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote && !showSessionError) {
        // Check for existing sheet (unless we're regenerating and should ignore it)
        if (existingSheetId && !ignoreExistingSheetId) {
          const stillExists = await sheetExists(existingSheetId)
          if (stillExists) {
            setSheetId(existingSheetId)
            return
          }
          await saveSheetIdToGame(null)
          if (onSheetCreated) {
            onSheetCreated(null)
          }
          // stale sheet (trashed in Drive); fall through to regenerate
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
            // Get existing team stats data to pre-fill
            const existingTeamStats = game?.boxScore?.teamStats || null
            sheetInfo = await createGameTeamStatsSheet(
              homeTeamAbbr,
              awayTeamAbbr,
              year,
              week,
              existingTeamStats,
              currentDynasty?.teams || currentDynasty?.customTeams
            )
          } else {
            // Get existing player stats to pre-fill (homeStats or awayStats)
            const existingPlayerStats = sheetType === 'homeStats'
              ? game?.boxScore?.home || null
              : game?.boxScore?.away || null
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
          // Check if it's an OAuth/token error
          if (error.message?.includes('OAuth') || error.message?.includes('token') || error.message?.includes('expired')) {
            setShowSessionError(true)
          }
        } finally {
          setCreatingSheet(false)
          creatingSheetRef.current = false
        }
      }
    }

    initSheet()
  }, [isOpen, user, sheetId, creatingSheet, existingSheetId, retryCount, showDeletedNote, ignoreExistingSheetId])

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShowDeletedNote(false)
      setIgnoreExistingSheetId(false)
      creatingSheetRef.current = false
    }
  }, [isOpen])

  // Save sheet ID to game in dynasty (for existing games)
  const saveSheetIdToGame = async (newSheetId) => {
    if (!currentDynasty || !game?.id) {
      return
    }

    const games = [...(currentDynasty.games || [])]
    const gameIndex = games.findIndex(g => g.id === game.id)
    if (gameIndex === -1) {
      return // Game doesn't exist yet, parent will handle
    }

    games[gameIndex] = {
      ...games[gameIndex],
      [config.sheetIdKey]: newSheetId
    }

    await updateDynasty(currentDynasty.id, { games })
  }

  // Sync data from sheet
  // Read player-stats data — prefers AI All in One tab so its values
  // override anything the user may have manually pasted into the
  // individual category tabs (Passing, Rushing, etc.). The category
  // tabs are normally driven by formulas off AI All in One, but those
  // formulas get clobbered if the user types directly into them. By
  // reading AI All in One first and only falling back to the 9-tab
  // read when AI All in One is empty / unreadable, the AI flow is
  // authoritative.
  const readPlayerStatsPreferUnified = async () => {
    const teams = currentDynasty?.teams || currentDynasty?.customTeams
    const unified = await readGameBoxScoreFromUnifiedTab(sheetId)
    if (unified) {
      const hasAnyData = Object.values(unified).some(arr => Array.isArray(arr) && arr.length > 0)
      if (hasAnyData) return unified
    }
    // Empty AI All in One (or unreadable) → fall back so a manual
    // workflow without the AI prompt still works.
    return await readGameBoxScoreFromSheet(sheetId, teams)
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
      // Check if it's an OAuth/token error
      if (error.message?.includes('OAuth') || error.message?.includes('token') || error.message?.includes('expired')) {
        setShowSessionError(true)
      } else {
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
      // Check if it's an OAuth/token error
      if (error.message?.includes('OAuth') || error.message?.includes('token') || error.message?.includes('expired')) {
        setShowSessionError(true)
      } else {
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

    // Match per-sheetType so the warning text reflects what's actually
    // about to be wiped — players see "all team stats" vs "all home
    // player stats" vs "scoring summary" depending on which sheet they
    // opened, rather than a generic "data will be lost".
    const wipeLabel = (() => {
      if (sheetType === 'scoring') return 'the scoring summary for this game'
      if (sheetType === 'teamStats') return 'the team stats for this game'
      if (sheetType === 'homeStats') return `${homeTeamAbbr} player stats for this game`
      if (sheetType === 'awayStats') return `${awayTeamAbbr} player stats for this game`
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
          const prevBoxScore = prevGame?.boxScore || {}
          const sliceKey =
            sheetType === 'scoring' ? 'scoringSummary'
            : sheetType === 'teamStats' ? 'teamStats'
            : sheetType === 'homeStats' ? 'home'
            : sheetType === 'awayStats' ? 'away'
            : null
          const nextBoxScore = sliceKey
            ? { ...prevBoxScore, [sliceKey]: null }
            : prevBoxScore
          const updatedGame = {
            ...prevGame,
            [config.sheetIdKey]: null,
            boxScore: nextBoxScore,
          }
          await addGame(currentDynasty.id, updatedGame)
        }
      }

      // Ignore the old existingSheetId prop so we create a fresh sheet
      setIgnoreExistingSheetId(true)
      setSheetId(null)
      setRetryCount(c => c + 1)
    } catch (error) {
      console.error('Failed to regenerate sheet:', error)
      // Check if it's an OAuth/token error
      if (error.message?.includes('OAuth') || error.message?.includes('token') || error.message?.includes('expired')) {
        setShowSessionError(true)
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
        className="card-elevated w-full sm:w-[95vw] max-h-[calc(100dvh-4rem)] sm:h-[95dvh] flex flex-col overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="h-[3px] w-full" style={{ backgroundColor: teamColors.primary }} aria-hidden="true" />
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-surface-4">
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-txt-primary">
              {config.title}
            </h2>
            {sheetType !== 'scoring' && sheetType !== 'teamStats' && (
              <p className="text-xs mt-1 text-txt-secondary">
                Reminder: This is not mandatory to be entered every game. You will have the option to enter all player season stats at the end of the season.
              </p>
            )}
          </div>
          <button aria-label="Close"
            onClick={handleClose}
            className="text-txt-tertiary hover:text-txt-primary transition-colors ml-4"
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
                  borderColor: teamColors.primary,
                  borderTopColor: 'transparent'
                }}
              />
              <p className="text-lg font-semibold text-txt-primary">
                Creating {config.title} Sheet...
              </p>
              <p className="text-sm mt-2 text-txt-secondary">
                {sheetType === 'scoring' ? 'Setting up scoring summary' : 'Setting up 9 stat category tabs'}
              </p>
              <SheetLoadingHint active={isLoading} />
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="card p-8 border-l-[3px] max-w-md text-center" style={{ borderLeftColor: teamColors.primary }}>
              <p className="text-xl font-bold mb-2 text-txt-primary">
                Saved & Moved to Trash!
              </p>
              <p className="text-sm text-txt-secondary">
                Stats saved to your game.
              </p>
            </div>
          </div>
        ) : sheetId ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Action Buttons - only show at top for embedded view */}
            {useEmbedded && (
              <div className="mb-3">
                <div className="flex gap-2 sm:gap-3 flex-wrap items-center">
                  <button
                    onClick={handleSyncAndDelete}
                    disabled={syncing || deletingSheet}
                    className={`px-3 sm:px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-all text-xs sm:text-sm ${highlightSave ? 'animate-pulse ring-4 ring-offset-2 scale-105' : ''}`}
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
                    className="btn btn-secondary text-xs sm:text-sm"
                  >
                    {syncing ? 'Syncing...' : 'Save & Keep Sheet'}
                  </button>
                  <button
                    onClick={() => setShowAIPrompt(true)}
                    className="px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent"
                  >
                    AI Prompt
                  </button>
                  <button
                    onClick={handleRegenerateSheet}
                    disabled={syncing || deletingSheet || regenerating}
                    title="Delete the Google Sheet AND wipe saved stats for this team / this game from the dynasty (player season totals are recalculated to subtract this game's contribution). Start over with a fresh sheet."
                    className="px-3 sm:px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-colors text-xs sm:text-sm border-2 ml-auto"
                    style={{
                      backgroundColor: 'transparent',
                      borderColor: '#EF4444',
                      color: '#EF4444'
                    }}
                  >
                    {regenerating ? 'Resetting...' : `Reset (regen sheet & wipe ${regenWipeShort})`}
                  </button>
                </div>
              </div>
            )}

            {/* Toggle between embedded and new tab */}
            <div className="flex items-center justify-end mb-2">
              <button
                onClick={() => {
                  const newValue = !useEmbedded
                  setUseEmbedded(newValue)
                  localStorage.setItem('sheetEmbedPreference', newValue.toString())
                }}
                className="text-xs px-3 py-1 rounded-full border border-surface-4 text-txt-tertiary hover:text-txt-primary bg-transparent transition-colors"
              >
                {useEmbedded ? 'Back to default view' : 'Try embedded view (beta)'}
              </button>
            </div>

            {/* Session Error Banner */}
            {showSessionError && (
              <SheetErrorBanner
                teamColors={teamColors}
                onReload={() => {
                  setShowSessionError(false)
                  setRetryCount(c => c + 1)
                }}
                onOpenNewTab={() => window.open(`https://docs.google.com/spreadsheets/d/${sheetId}/edit`, '_blank')}
                onRefreshSession={async () => {
                  const success = await refreshSession()
                  if (success) {
                    setShowSessionError(false)
                    setRetryCount(c => c + 1)
                  }
                }}
              />
            )}

            {useEmbedded ? (
              /* Embedded iframe view with toolbar */
              <>
                <div className="flex-1 flex flex-col overflow-hidden min-h-0 border border-surface-4 rounded-lg">
                  <SheetToolbar
                    sheetId={sheetId}
                    embedUrl={embedUrl}
                    teamColors={teamColors}
                    title={`${config.title} Google Sheet`}
                    onSessionError={() => setShowSessionError(true)}
                  />
                </div>

                <div className="text-xs mt-2 space-y-1 text-txt-secondary">
                  <p><strong className="text-txt-primary">Tabs:</strong> {config.columns}</p>
                  <p>{config.instructions}</p>
                </div>
              </>
            ) : (
              /* Open in new tab view */
              <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                <div className="label-xs mb-2 text-txt-tertiary">Google Sheets</div>
                <h3 className="text-2xl font-bold mb-4 text-txt-primary">
                  Edit in Google Sheets
                </h3>

                <div className="card p-4 border-l-[3px] text-left mb-6 max-w-sm w-full" style={{ borderLeftColor: teamColors.primary }}>
                  <p className="text-sm font-semibold mb-2 text-txt-primary">
                    Instructions:
                  </p>
                  <ol className="text-sm space-y-1.5 text-txt-secondary">
                    <li className="flex gap-2">
                      <span className="font-bold text-txt-primary">1.</span>
                      <span>Click the button below to open Google Sheets in a new tab</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold text-txt-primary">2.</span>
                      <span>{config.instructions}</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold text-txt-primary">3.</span>
                      <span>Return to this tab when done</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold text-txt-primary">4.</span>
                      <span>Click "Save" below to sync your data</span>
                    </li>
                  </ol>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3 mb-6">
                  <a
                    href={`https://docs.google.com/spreadsheets/d/${sheetId}/edit`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-8 py-4 rounded-lg font-bold text-lg hover:opacity-90 transition-colors flex items-center gap-3"
                    style={{
                      backgroundColor: '#0F9D58',
                      color: '#FFFFFF'
                    }}
                  >
                    <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/>
                      <path d="M7 7h2v2H7zm0 4h2v2H7zm0 4h2v2H7zm4-8h6v2h-6zm0 4h6v2h-6zm0 4h6v2h-6z"/>
                    </svg>
                    Open Google Sheets
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                  <button
                    onClick={() => setShowAIPrompt(true)}
                    className="px-4 py-2 rounded-lg text-sm font-medium border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent"
                  >
                    AI Prompt
                  </button>
                </div>

                {/* Centered Save Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 items-center justify-center mb-6">
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

                {/* Start Over button — does both: deletes the Google
                    Sheet AND wipes the saved stats slice for this team
                    / this game (with delta-tracking on player season
                    totals). */}
                <button
                  onClick={handleRegenerateSheet}
                  disabled={syncing || deletingSheet || regenerating}
                  title="Delete the Google Sheet AND wipe saved stats for this team / this game from the dynasty (player season totals are recalculated to subtract this game's contribution). Start over with a fresh sheet."
                  className="text-xs px-4 py-2 rounded-lg font-medium hover:opacity-90 transition-colors border mb-4"
                  style={{
                    backgroundColor: 'transparent',
                    borderColor: '#EF4444',
                    color: '#EF4444'
                  }}
                >
                  {regenerating ? 'Resetting...' : `Stats look weird? Reset (regen sheet & wipe ${regenWipeShort})`}
                </button>

                <div className="bg-surface-2 text-xs p-3 rounded-lg max-w-sm text-txt-secondary">
                  <p className="font-semibold mb-1 text-txt-primary">Tabs:</p>
                  <p>{config.columns}</p>
                </div>
              </div>
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
                        // Clear the error state first, then trigger retry
                        setShowSessionError(false)
                        // Small delay to ensure token is ready
                        setTimeout(() => {
                          setRetryCount(c => c + 1)
                        }, 500)
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
      </div>

      <AIPromptModal
        isOpen={showAIPrompt}
        onClose={() => setShowAIPrompt(false)}
        title={aiPromptTitle}
        prompt={aiPrompt}
        pasteTarget={aiPasteTarget}
      />
    </div>,
    document.body,
  )
}
