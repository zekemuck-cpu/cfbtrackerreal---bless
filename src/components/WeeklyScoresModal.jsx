import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import AuthErrorModal from './AuthErrorModal'
import { useAuthErrorHandler } from '../hooks/useAuthErrorHandler'
import SheetToolbar from './SheetToolbar'
import SheetModalAIHero from './ui/SheetModalAIHero'
import SheetManualEntry from './ui/SheetManualEntry'
import SheetModalFooter from './ui/SheetModalFooter'
import {
  createWeeklyScoresSheet,
  readWeeklyScoresFromSheet,
  normalizeWeeklyScoreRows,
  deleteGoogleSheet,
  getSheetEmbedUrl,
  WEEKLY_SCORES_MAX_ROWS,
} from '../services/sheetsService'
import { getCurrentTeamTid, getTeamNameLabel, getTeamNameOptions, getTidFromAbbr, getTeamNameAliases } from '../data/teamRegistry'
import { getModalColors } from '../utils/colorUtils'
import { buildAIPrompt } from '../utils/aiPrompt'
import SheetLoadingHint from './SheetLoadingHint'
import { getCustomConferencesForYear } from '../context/DynastyContext'
import { conferenceTeams as DEFAULT_CONFERENCE_TEAMS } from '../data/conferenceTeams'
import LocalDataEntry from './ui/LocalDataEntry'
import { splitTsv } from '../utils/tsvParse'

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

// Header labels for the weekly-scores grid. Seven columns, mirroring the
// Google Sheet layout the parser reads: game rows fill both sides; bye-rank
// rows put the team + rank in the first two and leave the rest blank. Kept
// short so all seven fit (and scroll) on a phone.
const WEEKLY_SCORES_COLUMNS = ['Home', 'Rk', 'Score', 'Away', 'Rk', 'Score', 'Neutral']

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
  const { user } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const modalColors = useMemo(() => getModalColors(teamColors), [teamColors])
  const [syncing, setSyncing] = useState(false)
  const [deletingSheet, setDeletingSheet] = useState(false)
  const [creatingSheet, setCreatingSheet] = useState(false)
  const [sheetId, setSheetId] = useState(null)
  const [sheetTitle, setSheetTitle] = useState(null)
  const [showDeletedNote, setShowDeletedNote] = useState(false)
  const auth = useAuthErrorHandler()
  const [isMobile, setIsMobile] = useState(false)
  // Local paste is the DEFAULT; the Google Sheet flow is the opt-in fallback.
  const [useLocal, setUseLocal] = useState(true)

  const [useEmbedded, setUseEmbedded] = useState(() => localStorage.getItem('sheetEmbedPreference') === 'true')
  const [highlightSave, setHighlightSave] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const creatingSheetRef = useRef(false)
  // Single-attempt guard: a failed creation must not auto-retry (that loop
  // spam-created sheets). One attempt per modal-open; an explicit retry bumps
  // auth.retryCount, which re-arms exactly one more attempt.
  const creationAttemptedRef = useRef(false)
  const lastRetryCountRef = useRef(auth.retryCount)

  // Which week's rankByWeek slot to write the screenshot's poll into.
  // Defaults to the dynasty's currentWeek (= what the user sees in CFB26
  // right now). User can override when they're backfilling — e.g. they
  // forgot to save last week, so the screenshot they're pasting actually
  // shows last week's poll, not today's. Without the override, every
  // re-save silently overwrites the current poll with stale data.
  // Compute the "rank-entry slot that represents the dynasty's current
  // moment". During regular_season this is just currentWeek. During
  // conference_championship the dynasty's currentWeek=1 (CCG week is
  // its own phase, week 1 within the phase) but the SEMANTIC current
  // rank-entry slot is Week 15 — that's the post-Week-14 / heading-
  // into-CCG poll, which is what the user is entering when they
  // import polls during CCG week. Without this distinction the
  // dropdown labeled regular-season Week 1 as "(current)" while the
  // dynasty was in CCG week, which is what the user reported.
  const dynastyCurrentWeek = Number(currentDynasty?.currentWeek)
  const isCCGPhase = currentDynasty?.currentPhase === 'conference_championship'
  const effectiveCurrentRankWeek = isCCGPhase ? 16 : dynastyCurrentWeek

  const [rankWeek, setRankWeek] = useState(null)
  useEffect(() => {
    if (!isOpen) return
    const eff = effectiveCurrentRankWeek
    const weekNum = Number(week)
    setRankWeek(Number.isFinite(eff) && eff >= 0 ? eff : (Number.isFinite(weekNum) ? weekNum : 1))
  }, [isOpen, effectiveCurrentRankWeek, week])

  const userTid = currentDynasty ? getCurrentTeamTid(currentDynasty) : null
  const userTeam = userTid ? currentDynasty?.teams?.[userTid] : null
  const userAbbr = getTeamNameLabel(currentDynasty?.teams, userTeam?.tid) || userTeam?.abbr || null

  // Build a conference→[teams] block keyed off the dynasty's actual
  // alignment for the year. Custom conferences (teambuilder dynasties
  // where the user moved a team) take priority — fallback to the
  // static catalog only when no custom map exists. The AI must
  // recognize a Big Ten Championship as a Big Ten Championship even
  // if the user moved Alabama into the Big Ten, so we do NOT inject
  // real-world assumptions here, only the dynasty's own data.
  const conferenceMapBlock = useMemo(() => {
    const customMap = currentDynasty ? getCustomConferencesForYear(currentDynasty, year) : null
    const confMap = customMap || DEFAULT_CONFERENCE_TEAMS
    const lines = []
    // Stable order: P4 first, then G6, then Independent / misc.
    const order = [
      'ACC', 'Big Ten', 'Big 12', 'SEC',
      'American', 'Conference USA', 'MAC', 'Mountain West', 'Pac-12', 'Sun Belt',
      'Independent',
    ]
    // The conference maps store team abbreviations; render each as its NAME
    // label (tid-rooted) so the alignment block matches the names-based prompt.
    const toName = (abbr) => getTeamNameLabel(currentDynasty?.teams, getTidFromAbbr(abbr, currentDynasty)) || abbr
    const seen = new Set()
    for (const conf of order) {
      const teams = Array.isArray(confMap[conf]) ? confMap[conf].filter(Boolean) : null
      if (!teams || teams.length === 0) continue
      lines.push(`  ${conf}: ${teams.map(toName).join(', ')}`)
      seen.add(conf)
    }
    // Anything else in the map that wasn't in the canonical order
    // (e.g. a custom conference name the user invented).
    for (const [conf, teams] of Object.entries(confMap)) {
      if (seen.has(conf)) continue
      if (!Array.isArray(teams) || teams.length === 0) continue
      lines.push(`  ${conf}: ${teams.map(toName).join(', ')}`)
    }
    return lines.join('\n')
  }, [currentDynasty, year])

  // Prior-week Top 25 block. We give the AI the entering-this-week
  // poll (= rankByWeek[week] — set by last week's weekly-scores save)
  // so it can reason about how teams moved. Specifically: which
  // ranked teams had a bye this week (their abbr won't appear in
  // any game row), and where those bye teams should slot in the
  // post-week poll given the leapfrogs/drops it just transcribed.
  //
  // Fallback: if rankByWeek[weekNum] is empty (first-time open of a
  // week's modal under the new save semantic — rankByWeek[N] only
  // gets populated when Wk N is itself saved), fall back to the
  // most recent populated week BEFORE weekNum. The carry-forward
  // gives the AI a reasonable baseline for bye reasoning, even if
  // it's slightly stale (the AI is going to re-derive the new poll
  // anyway from the games block + prior baseline).
  const prevWeekTop25Block = useMemo(() => {
    if (!currentDynasty) return ''
    const yearNum = Number(year)
    const weekNum = Number(week)
    if (!Number.isFinite(yearNum) || !Number.isFinite(weekNum) || weekNum < 0) return ''
    const teams = currentDynasty.teams || {}

    // Try the exact week first; if no team has a value there, walk
    // backward up to 4 weeks looking for the most recent populated
    // picture. Each call to slotsAtWeek returns Map(rank → abbr).
    const slotsAtWeek = (wk) => {
      const slots = new Map()
      for (const team of Object.values(teams)) {
        const rbw = team?.byYear?.[yearNum]?.rankByWeek
          ?? team?.byYear?.[String(yearNum)]?.rankByWeek
        if (!rbw) continue
        const v = rbw[wk] ?? rbw[String(wk)]
        if (typeof v !== 'number' || v < 1 || v > 25) continue
        if (!slots.has(v)) slots.set(v, getTeamNameLabel(teams, team.tid) || team.abbr)
      }
      return slots
    }
    let slotMap = slotsAtWeek(weekNum)
    let sourceWeek = weekNum
    if (slotMap.size === 0) {
      for (let probe = weekNum - 1; probe >= Math.max(0, weekNum - 4); probe--) {
        const candidate = slotsAtWeek(probe)
        if (candidate.size > 0) {
          slotMap = candidate
          sourceWeek = probe
          break
        }
      }
    }
    // Preseason fallback. Entering Week 0/1 scores, the "prior poll" IS the
    // preseason Top 25 — but that poll lives in preseasonRankingsByYear and is
    // only mirrored into rankByWeek[0] for dynasties entered through the current
    // modal (legacy/first-week data often has the array only). Without this the
    // block reads empty, the prompt tells the AI "no prior poll", and it skips
    // ranked bye teams entirely. Mirrors getTeamRankForWeek's week<=1 fallback.
    if (slotMap.size === 0 && weekNum <= 1) {
      const pre = currentDynasty.preseasonRankingsByYear?.[yearNum]
        ?? currentDynasty.preseasonRankingsByYear?.[String(yearNum)]
      if (Array.isArray(pre)) {
        const m = new Map()
        for (const e of pre) {
          const r = Number(e?.rank)
          if (!Number.isFinite(r) || r < 1 || r > 25 || m.has(r)) continue
          const label = (e?.tid != null && getTeamNameLabel(teams, e.tid)) || e?.team || ''
          if (label) m.set(r, label)
        }
        if (m.size > 0) { slotMap = m; sourceWeek = 'preseason' }
      }
    }
    if (slotMap.size === 0) return ''
    const lines = []
    if (sourceWeek === 'preseason') {
      lines.push('  (carried forward from the preseason Top 25)')
    } else if (sourceWeek !== weekNum) {
      lines.push(`  (carried forward from Week ${sourceWeek}; entering-Week-${weekNum} poll not yet stored)`)
    }
    for (let r = 1; r <= 25; r++) {
      const abbr = slotMap.get(r)
      if (abbr) lines.push(`  #${r} ${abbr}`)
    }
    return lines.join('\n')
  }, [currentDynasty, year, week])

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `${year} Week ${week} Scores`,
    structure: `This sheet has ONE tab: "Week ${week} Scores". It is a freeform list of every FBS game played in Week ${week} of the ${year} season — across all 134 teams in the country. Each row is one game.

═══════════════════════════════════════════════════════════
EXHAUSTIVENESS — THE #1 FAILURE MODE OF THIS TASK
═══════════════════════════════════════════════════════════
The most common way you fail this task is by under-reporting games. A full FBS week typically has 50–70 games. The user's screenshots show every one of them — usually as a scrollable SCORES/SCHEDULES list in EA College Football 26, sometimes split across multiple screenshots ("1 of 2", "2 of 2", etc.) or multiple conference filter views. Missing even one game corrupts the user's standings, rankings, and records.

Treat every visible matchup as in-scope. Specifically:

1. PROCESS EVERY SCREENSHOT. If the user attached more than one image, every image is a different view of the same week. Walk through ALL of them in order. Do NOT stop after the first. Do NOT assume later screenshots duplicate earlier ones — they almost never do. Combine the games into ONE deduplicated list. Two rows are the SAME game ONLY if BOTH teams match (in either home/away order) AND the year+week match. Two rows with the same teams but DIFFERENT scores are NOT the same game — they're a misread you need to resolve, not a duplicate. When in doubt, KEEP both rows; the importer collapses true duplicates by team-pair downstream, but it cannot recover a game you silently dropped.

2. IF YOU SEE A LIST, EVERY ROW IN THE LIST IS A GAME. The CFB26 SCORES/SCHEDULES screen is a list of matchups — every row in that list is a separate FBS game with its own final score. Do not pick "the interesting ones" or "the highlight games" or "the ones with rankings." Output every row.

3. EXPECT A LONG OUTPUT. 50–70 rows for a full week is normal. The sheet supports up to ${WEEKLY_SCORES_MAX_ROWS} rows. A 5-row or 10-row output for a Week with a full slate is almost always wrong. Length is REQUIRED, not laziness.

4. LIST EVERY GAME. Please don't abbreviate the list with "...", "and so on", "[truncated for brevity]", "etc.", or "the rest follow the same pattern" — the app needs each game as its own row, so include them all even when the slate is long.

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

F. TEAM-COVERAGE CHECK. After your initial pass, build a mental SET of every team mentioned in the screenshots — any logo or abbreviation you saw, even briefly, even in a corner widget or sidebar. For each team in that set, EXACTLY ONE of these must be true:
     (i)  the team appears in your row list (as Col A or Col D), OR
     (ii) you affirmatively confirmed the team is on bye this week (no game visible anywhere, and bye-status confirmed by a "BYE" tag, an empty schedule slot, or its absence from a complete league-wide list).
   If a team appears in your set but in NEITHER (i) nor (ii), you missed its game. Re-walk the screenshots specifically for that team — the missing game is almost always near a list edge (top/bottom fade, scroll cutoff) or in a conference filter you breezed past.

   This check exists because the most common "missing 1–5 games per conference" failure happens at the bottom of long lists where attention drifts. Don't skip it — it's cheap to run and catches the long-tail misses that the count step (B/C above) silently allows.

═══════════════════════════════════════════════════════════
PRE-EXTRACTION WORKSHEET — write this BEFORE the TSV
═══════════════════════════════════════════════════════════
Score-swap and missing-game errors happen when the AI commits to TSV rows
without explicitly reasoning about each game. The single most effective
defense is to force a structured WORKSHEET line per game BEFORE the TSV.
Field reports show this catches both bug classes:

  • Wrong-winner errors (you swapped home/away but left the scores in
    screen order)
  • Missing games (you forgot a row that you would have caught here)

For every game in the screenshots, write ONE worksheet line, in this
exact pipe-separated order:

  WS<n> | <img> | <leftTeam> <leftScore> [VS|@|NEUT] <rightTeam> <rightScore> | HOME=<team> | WINNER=<team> | NEUTRAL=Y/N

Every team you name here is the FULL NAME from the TEAM NAMES list (resolve
the on-screen logo/code to that list name), the same value you'll output in
the TSV — so the worksheet and the TSV always agree.

Field by field:
  • WS<n>            sequential — WS1, WS2, WS3 …
  • <img>            which screenshot you read this game from (img1, img2…)
  • The middle block is what you SAW: which team was on which side of the
    screen (identified by logo/name), and which score sat next to it. The
    [VS|@|NEUT] marker is the orientation cue you used (vs / @ / neutral
    site). Keep left and right in the order they appeared on screen.
  • HOME=<team>      apply rule 6 (HOME / AWAY ORIENTATION). Cite mentally
                     which evidence drove the decision: "@", "vs", left/
                     right convention, explicit Home/Away tag, neutral
  • WINNER=<team>    the team with the higher score. CRITICAL: the higher
                     score in the middle block must belong to the team you
                     write here. If your worksheet line says
                     "Auburn 31 @ Georgia 21 ... WINNER=Georgia" you have a
                     bug — 31 is paired with Auburn on screen, Auburn won.
  • NEUTRAL=Y/N      Y if you couldn't determine HOME and the game was at
                     a neutral site; otherwise N.

Three example worksheet lines:

  WS1 | img1 | AUB 31 @ UGA 21 | HOME=UGA | WINNER=AUB | NEUTRAL=N
  WS2 | img1 | TEX 28 vs OU 24 | HOME=TEX | WINNER=TEX | NEUTRAL=N
  WS3 | img2 | LSU 52 vs FCSE 10 | HOME=LSU | WINNER=LSU | NEUTRAL=N

After ALL worksheet lines are written, derive the TSV mechanically:
  • Col A = HOME (from the worksheet)
  • Col D = the OTHER team
  • Col C = HOME's score (the score you saw next to HOME's logo)
  • Col F = the OTHER team's score
  • Col G = "Y" if NEUTRAL=Y, else blank
  • Cols B and E from any rank annotations seen on the screenshot

If your TSV has a winner that disagrees with the worksheet's WINNER, you
introduced a score-swap. Fix the TSV row. The worksheet is the source of
truth — it captures what you actually saw before you reorganized into
home/away columns.

OUTPUT FORMAT for the worksheet: emit it as a fenced \`\`\`worksheet
block, BEFORE the TSV fence. The user keeps the worksheet as an audit
trail; only the TSV is pasted into the sheet.

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
CFB26 SCORES/SCHEDULES — EXACT FORMAT (the most common view)
═══════════════════════════════════════════════════════════
This is what almost every weekly-score screenshot in this app looks like. The format is COMPLETELY DETERMINISTIC — there's no left/right convention to second-guess, no orientation ambiguity. Read the structure below carefully; it's the strongest defense against score-swap and missed-game errors.

Each row is a sortable table line with these columns left-to-right:

  MATCHUP                                  | DATE       | TIME(ET)/RESULT       | TV   | PLAY
  ─────────────────────────────────────────────────────────────────────────────────────────────
  [logo] LeftTeamName  at  [logo] RightTeamName  | Sat, Oct 7 | XXX 38, YYY 17       | icon | 0

═══ HOME / AWAY: the literal word "at" ═══

The matchup column always reads "LeftTeamName at RightTeamName" with the literal word "at" between the two team names.
  • LEFT team is the VISITOR (away).
  • RIGHT team is the HOST (home).

This is unambiguous on every row. Don't second-guess it. If the row shows "Missouri State at Kennesaw State", Kennesaw State is HOME, Missouri State is the visitor — every time.

═══ RANKINGS: numeric prefix ═══

Rankings appear as a number prefix on the team name. Examples from real screenshots:
  • "12 Georgia at Kentucky"           → Georgia is #12 (visitor), Kentucky unranked (host)
  • "20 Nebraska at Minnesota"         → Nebraska #20, Minnesota unranked
  • "9 Washington at 21 Ohio State"    → Washington #9 (visitor), Ohio State #21 (host)
  • "Stanford at 4 Clemson"            → Stanford unranked, Clemson #4 (host)

Pull the rank from the integer prefix. No prefix → unranked → leave the rank cell BLANK in the TSV.

═══ SCORES: the result column is winner-first ═══

The TIME(ET)/RESULT column, after a game is played, reads:
        "WINNER_CODE  WINNER_SCORE,  LOSER_CODE  LOSER_SCORE"
THE WINNER COMES FIRST. The loser comes after the comma. (These codes are for
reading scores only — you output the full team NAME, not the code.)

Real examples taken straight from CFB26 screenshots:
  • "UK 17, UGA 14"     →  UK won 17, UGA lost 14    (Kentucky beat Georgia)
  • "OKLA 28, TAMU 26"  →  Oklahoma 28, Texas A&M 26  (Oklahoma won)
  • "MIST 38, KENN 17"  →  Missouri State 38, Kennesaw State 17
  • "ND 51, FRES 10"    →  Notre Dame 51, Fresno State 10
  • "USC 38, IOWA 33"   →  USC 38, Iowa 33 (USC won)
  • "ECU 51, WVU 10"    →  East Carolina 51, West Virginia 10

This is the score-swap defense: you do NOT have to look at logos and try to pair scores visually. The result text directly tells you who won and who lost. If you read the comma-separated string correctly, score-swap cannot happen.

═══ THE RESULT-SCREEN CODES ARE FOR SCORES ONLY — NEVER OUTPUT THEM ═══

The result column uses short codes (PSU, BUFF, MIST, CUSE). Their ONLY job is
to tell you which team scored what. You NEVER put these codes in your output.
What you OUTPUT is the team's FULL NAME, read from the MATCHUP column and copied
exactly from the TEAM NAMES list.

The codes often differ from the team's name/abbreviation anyway, so trying to
use them as identity would break the import. A few you'll see:

  Result-screen code → the team it means
  ────────────────────────────────────
    CUSE  → Syracuse
    MIST  → Missouri State
    JXST  → Jacksonville State
    OKLA  → Oklahoma
    M-OH  → Miami (OH)

Identity always comes from the MATCHUP column's full name, never the code.

═══ THE STEP-BY-STEP STRATEGY (use this for every row) ═══

1. Read the two FULL TEAM NAMES from the matchup column. Examples:
   "Missouri State", "Kennesaw State", "Notre Dame", "Fresno State".
2. Find each full name in your TEAM NAMES list at the bottom of this prompt and
   copy the EXACT list name — that is what you output for that team. The matchup
   column is the SOURCE OF TRUTH for team identity.
3. Read the result text: "CODE1 score1, CODE2 score2".
4. Match each result code (CODE1, CODE2) to one of the two teams in the matchup
   column. There are only two teams — one is CODE1, the other CODE2. Use code
   similarity + position-in-the-row as the cue.
5. Pair each team with its score: the team matched to CODE1 scored score1, the
   team matched to CODE2 scored score2.
6. Apply the "at" rule: LEFT team = AWAY/visitor, RIGHT team = HOME/host. Both
   scores are known from step 5; just put them in the right columns.

Example, end-to-end on the "Missouri State at Kennesaw State | MIST 38, KENN 17" row:
  Step 1: Left full name = "Missouri State". Right full name = "Kennesaw State".
  Step 2: Both are in the TEAM NAMES list verbatim — output "Missouri State" and "Kennesaw State".
  Step 3: Result text = "MIST 38, KENN 17". Winner is MIST with 38; loser is KENN with 17.
  Step 4: MIST corresponds to "Missouri State" (left, the visitor). KENN corresponds to "Kennesaw State" (right, the host).
  Step 5: Missouri State scored 38. Kennesaw State scored 17.
  Step 6: HOME = right team = Kennesaw State (17). AWAY = left team = Missouri State (38).

  Worksheet line: WSn | img1 | Missouri State 38 @ Kennesaw State 17 | HOME=Kennesaw State | WINNER=Missouri State | NEUTRAL=N
  TSV row:        Kennesaw State  [blank]  17  Missouri State  [blank]  38  [blank]

═══ Other things on the screen — IGNORE these ═══

  • The "PLAY" column number (0, 1, 5, etc.) is a per-user highlight counter. Has nothing to do with scoring. Ignore it.
  • The right-side panel (the big card showing one highlighted game with logos stacked vertically and an arrow → next to one score) duplicates information already in the row. Don't extract from this panel — work the table rows. The panel only shows ONE game at a time.
  • The records in parentheses on the right panel ("3-4 (2-3)" / "1-5 (0-2)") are season-to-date team records, NOT game scores. Don't confuse these with scores.

═══════════════════════════════════════════════════════════
CRITICAL RULES — output format
═══════════════════════════════════════════════════════════
1. OUTPUT 7 COLUMNS PER ROW, in this exact order:
   Col A — HOME TEAM (full name from the TEAM NAMES list)
   Col B — HOME RANK (integer 1–25, or BLANK if unranked)
   Col C — HOME SCORE (integer)
   Col D — AWAY TEAM (full name from the TEAM NAMES list)
   Col E — AWAY RANK (integer 1–25, or BLANK if unranked)
   Col F — AWAY SCORE (integer)
   Col G — NEUTRAL? ("Y" if neutral site, otherwise leave BLANK)
2. ONE ROW PER GAME. The sheet allows up to ${WEEKLY_SCORES_MAX_ROWS} rows. The screenshots are the SOURCE OF TRUTH for how many games to output (see EXHAUSTIVENESS above).
3. TEAM NAMES ONLY (columns A and D). Use ONLY values from the TEAM NAMES list at the bottom of this prompt. Columns A and D are STRICT dropdowns — wrong text is rejected by the sheet.
4. INTEGERS ONLY for scores — no decimals, no "pts", no commas. "24" never "1,234" never "24.0".
   SCHEDULE-ONLY MODE: if the user sends the UPCOMING schedule (matchups with no
   finals yet — e.g. the conference schedule screen), output the SAME rows with
   BOTH score columns (C and F) left blank. Blank-score rows save as scheduled
   games. Never invent scores; never write 0-0 for an unplayed game.
5. RANKS FOR PLAYED TEAMS — transcribe, do not reason.
   For every team that appears in a game row (Col A or Col D), the rank is EXACTLY what the screenshot shows — the integer prefix next to the team name, or blank if there is no prefix. Copy the number you see; don't compute or adjust it.

   DO NOT adjust a game-row rank because you think a team "should" be higher or lower.
   DO NOT infer or estimate a rank that isn't explicitly shown.
   DO NOT cross-reference the prior-week poll for game-row ranks — only the screenshot matters.

   If a team's name in the screenshot is preceded by "#11" or "11" or shown as ranked in the matchup line (e.g. "#7 Texas vs Oklahoma"), copy 11 / 7 exactly into the rank column. If the team is unranked (no number shown next to the name), LEAVE THE RANK COLUMN BLANK. Do not write "NR" or "—" — blank means unranked.

   Rank reasoning is reserved EXCLUSIVELY for bye teams — see the BYE WEEK RANKINGS section below.
6. HOME / AWAY ORIENTATION — single most common failure point, read SLOWLY.

   COLUMN A IS THE HOME TEAM. Always. The HOME team is whichever team
   PHYSICALLY HOSTED the game (the one whose stadium it was played in).

   PRIMARY signals — use these first when present:
     • "@" symbol → VISITOR @ HOST. After the @ is HOME.
       "Auburn @ Georgia" → Georgia in Col A, Auburn in Col D.
     • "vs" or "v" → HOST vs VISITOR. Before vs is HOME.
       "Auburn vs Georgia" → Auburn in Col A, Georgia in Col D.
     • Explicit "Home" or "Away" labels next to a team name — trust them.
     • A team's own schedule page in CFB26 shows "vs OPP" for home games
       and "@ OPP" / "at OPP" for away games. If the row reads
       "vs Georgia", THIS team was home; "at Georgia", THIS team was away.

   SECONDARY signals — only when no explicit @/vs:
     • CFB26 Around-the-Country / scoreboard ticker layout: the team
       listed on the RIGHT side (or BELOW in stacked layouts) is the
       HOME team. The team on the LEFT (or above) is the VISITOR.
     • TV broadcast scoreboard: home team is the lower / right team.

   ⚠ ANTI-BIAS CHECK — the most common AI mistake on this prompt:
     The AI's natural reading order is LEFT-to-RIGHT, and it tends to
     drop the FIRST-listed team into Col A. THAT IS WRONG when the
     screenshot's left-side convention means "away/visitor". You MUST
     swap so the actual HOME team lands in Col A.

     If you're parsing a single team's season schedule (e.g. "Auburn's
     2034 Schedule"), DO NOT put Auburn in Col A for every row. Half of
     Auburn's games are away — those rows put the OPPONENT in Col A.

     If your draft has the same team in Col A more than ~half the rows
     within a single week's slate, you've likely gotten orientation
     wrong. Re-read each row's @/vs marker and swap as needed before
     emitting.

   When TRULY ambiguous (no @/vs, no Home/Away tag, no clear left/right
   convention), mark Col G = "Y" (neutral) — that's better than guessing
   wrong, since neutral-site games don't show home/away on team pages.

6.5. SCORE-FOLLOWS-TEAM, ALWAYS. If you swap which team goes in Col A vs
   Col D (because the screenshot's left team is the visitor and the
   right team is the host), you MUST also swap the SCORES. The score
   belongs to the TEAM, not to the screen position. The single biggest
   source of "wrong team won" rows in this prompt's history is an AI
   that swapped the team labels but kept the scores in left-to-right
   screen order.

   Walk this procedure for EVERY row:
     a. Identify TEAM_LEFT and TEAM_RIGHT from the logos/abbreviations.
     b. Identify SCORE_LEFT (the score nearest TEAM_LEFT) and SCORE_RIGHT
        (the score nearest TEAM_RIGHT). Pair (TEAM_LEFT ↔ SCORE_LEFT)
        and (TEAM_RIGHT ↔ SCORE_RIGHT) in your head — DO NOT lose this
        pairing.
     c. Apply the home/away rule from #6 to decide which team is HOME.
     d. Output:  Col A = HOME team,    Col C = HOME team's score
                 Col D = AWAY team,    Col F = AWAY team's score
        — i.e., the score from step (b) attached to that team, NOT the
        score that visually sat on the same side of the screen as Col A
        does in the output.

   WORKED EXAMPLE — Auburn at Georgia, Auburn won 31–21:
     • Screen shows: [AUB logo] 31    [UGA logo] 21    "@" symbol present
     • TEAM_LEFT=AUB, SCORE_LEFT=31; TEAM_RIGHT=UGA, SCORE_RIGHT=21
     • "@" rule: visitor @ host → AUB is visitor, UGA is host (HOME)
     • CORRECT output:  UGA  [blank]  21  AUB  [blank]  31  [blank]
     • Sanity-check: is "21" the score that was next to the UGA logo? Yes. ✓

   COUNTEREXAMPLE — what NOT to do (this is the bug):
     • Same screenshot, WRONG output:  UGA  [blank]  31  AUB  [blank]  21
     • This row claims UGA scored 31 — but the UGA logo had 21 next to it.
       The AI swapped the teams (correctly) but left the scores in their
       original screen order (wrong). Result: wrong winner. FIX it before
       emitting.

   If you find yourself confused mid-row, the safe move is: write the team
   name and the score it was paired with ON THE SCREEN in the SAME column
   you put that team. If TEAM_LEFT goes to Col A, then SCORE_LEFT goes to
   Col C. If TEAM_LEFT goes to Col D (because it was the visitor), then
   SCORE_LEFT goes to Col F. Score moves with the team, period.
7. NEUTRAL FLAG: column G is "Y" only when the game is explicitly at a neutral site (kickoff games, neutral-site classics, the Army-Navy Game, etc.). For ordinary home games leave column G BLANK. Do NOT write "N". Conference championships are NEVER entered through this weekly-scores flow — they have a dedicated entry modal — so any neutral game you flag here is a regular-season neutral-site game, not a CCG.
8. FCS OPPONENTS — INCLUDE THEM. EA College Football 26 represents real FCS schools as one of four generic FCS placeholders, and those placeholders ARE in the TEAM NAMES list at the bottom of this prompt (e.g. FCS East, FCS Midwest, FCS Northwest, FCS West — but follow whatever appears in your list). When a Power-or-Group-of-5 FBS team plays an FCS opponent in Week 0 (or later), that game IS in scope — find the matching FCS placeholder name in the TEAM NAMES list and write the row. Do NOT drop FCS games — they're part of the user's records.
9. UNKNOWN TEAMS — never invent. If you cannot find a team in the TEAM NAMES list AT ALL after a careful re-scan, OMIT that game (rare — almost everything an in-game screenshot shows is in the mapping, including all FBS teams, FCS placeholders, and any user-renamed teambuilder teams). Re-check the mapping CAREFULLY before omitting — it includes every valid team name for this dynasty.
10. SKIP bye weeks. Teams on bye are not games and have no row.
11. NO HEADER ROW in the output. Do not include "HOME TEAM" / "AWAY TEAM" labels.
12. ${userAbbr ? `OPTIONAL — the user's own team is ${userAbbr}. If you can see their game in the screenshots, INCLUDE it; if not, that's fine — they enter their own game separately and any duplicate row is harmlessly preserved.` : `If the user's own team plays in this week, include the row anyway — duplicates with their separately-entered game are handled automatically.`}

═══════════════════════════════════════════════════════════
WEEK SCOPE — REGULAR-SEASON ONLY (Week 0 through Week 15)
═══════════════════════════════════════════════════════════
This flow is for REGULAR-SEASON weeks ONLY: Week 0 through Week 15. Conference championships are entered through a dedicated entry modal (not this one) and are NEVER auto-promoted from this sheet. If the screenshots include a CONF CHAMPIONSHIPS sub-screen, ignore those rows — the user enters them separately.

Week 15 is the LAST regular-season week. The Army-Navy Game lives here at a neutral site (Philadelphia / Foxborough / Soldier Field / etc.) — still mark column G "Y" because it IS a neutral-site game, but it is just a regular game, NOT a championship.

═══════════════════════════════════════════════════════════
DYNASTY CONFERENCE MAP — use this, not real-world assumptions
═══════════════════════════════════════════════════════════
This is the conference alignment for the ${year} season in THIS dynasty. Use it to set conference labels and infer in-conference matchups when needed. Each line is "<conference>: <comma-separated team names>".

${conferenceMapBlock || '  (no custom conference data — fall back to standard FBS alignment)'}

═══════════════════════════════════════════════════════════
PRIOR-WEEK TOP 25 — entering Week ${week}, before the games you're transcribing
═══════════════════════════════════════════════════════════
This is where every team STOOD in the poll BEFORE the games shown in
the screenshots happened. Use it as the baseline for reasoning about
bye-week ranks (see the BYE WEEK RANKINGS section below).

${prevWeekTop25Block || '  (no prior-week Top 25 stored — bye-week ranks block below should be empty)'}

═══════════════════════════════════════════════════════════
BYE WEEK RANKINGS — the second block you must emit (critical, read carefully)
═══════════════════════════════════════════════════════════
EA's screenshot only shows teams that PLAYED this week. Teams on a bye
disappear from the screenshot entirely — but they're still ranked in the
new poll. The user can see by inspection that a missing slot in the new
Top 25 belongs to a bye team (e.g. "Miami was #1 last week, had a bye,
slot 1 is the only empty slot this week → Miami is still #1"), but the
import has no way to know that without you telling it.

Your job: after the games block, emit a SECOND TSV block where each row
is one ranked bye-week team and that team's NEW rank for the upcoming
week. The user reviews and pastes — both blocks are part of the same
copy/paste from your reply.

HOW TO REASON ABOUT BYE-WEEK RANKS:

  STEP 1 — Identify the bye teams.
    From the PRIOR-WEEK TOP 25 above, list every team that was ranked last week.
    Call this set P (should be up to 25 teams).
    Cross off every team in P that appears as Col A or Col D in any of your game rows
    — those teams played, their rank is already transcribed from the screenshot.
    The leftover teams in P are on BYE. Call them B. Your bye block must have
    EXACTLY |B| rows — one per bye team, no more, no fewer.

  STEP 2 — Identify the unfilled rank slots.
    Look at all the rank values (Col B and Col E) across your completed game rows.
    Those are the slots already claimed by played teams.
    The unfilled slots are every integer 1–25 NOT claimed by a played team.
    List them out: e.g. "Unfilled: 2, 5, 9, 14, 22" — one slot per bye team.
    There must be EXACTLY |B| unfilled slots (bye team count = unfilled slot count).
    If the numbers don't match, something went wrong in step 1 — fix it before continuing.

  STEP 3 — Assign each bye team to an unfilled slot.
    THIS is where reasoning happens — and ONLY here.
    Consider each bye team's prior-week rank, then ask:
      • Which unfilled slot fits them best given what happened this week?
      • Did teams ranked below them win convincingly enough to leapfrog? → move the bye team down.
      • Did teams ranked above them lose badly? → the bye team may move up.
      • By default (nothing dramatic happened), a bye team holds as close to their prior slot as possible.
    Assign each bye team to exactly one unfilled slot. No two bye teams share a slot.

  STEP 4 — Sanity check.
    The complete set of ranks from (game rows) ∪ (bye rows) must equal {1, 2, …, 25}.
    All 25 slots filled. No gaps. No duplicates. No rank above 25 or below 1.
    If anything is off, revisit steps 1–3.

  STEP 5 — Special cases.
    • Only output bye rows for teams that WERE ranked in the prior-week poll.
      An unranked team cannot enter the new poll via the bye block — only via
      a game row where their rank is shown on the screenshot.
    • If no ranked team had a bye, emit an empty BYE block (no rows).
    • If the prior-week poll is unavailable (shown as empty above), skip the bye block entirely.

═══════════════════════════════════════════════════════════
SECTION: "Week ${week} Scores" — up to ${WEEKLY_SCORES_MAX_ROWS} game rows + up to 25 bye-rank rows × 7 columns
═══════════════════════════════════════════════════════════

Col A (Home Team) | Col B (Home Rank) | Col C (Home Score) | Col D (Away Team) | Col E (Away Rank) | Col F (Away Score) | Col G (Neutral?)
------------------+-------------------+--------------------+-------------------+-------------------+--------------------+-----------------
team name         | 1–25 or BLANK     | integer            | team name         | 1–25 or BLANK     | integer            | "Y" or BLANK

⚠ EXACTLY 7 columns (6 tabs) per row. The score comes DIRECTLY after the rank
with NO blank column between them: Home Score is Col C (right after Home Rank in
Col B), and Away Score is Col F (right after Away Rank in Col E). Do NOT insert an
extra empty column between a team's Rank and its Score — a common mistake that
pushes the away score into Col H and corrupts the import. A team is always the
triple Team → Rank → Score with no gap.

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
Output, in order:
  1. The pre-extraction WORKSHEET as a fenced \`\`\`worksheet block
     (one WS line per game, see "PRE-EXTRACTION WORKSHEET" above).
  2. The TSV, INSIDE ITS OWN fenced \`\`\`tsv code block — the
     "=== WEEK ... ===" label line, then game rows, then bye-rank rows
     directly after them. NO padding, NO separator row needed; the
     importer classifies each row by content (col D filled = game,
     col D empty = bye rank).

CRITICAL — the scores MUST be a real fenced \`\`\`tsv code block, NOT a
human-readable list ("Buffalo 13 Penn State 30"), NOT a markdown table,
NOT prose sentences. The code fence is the ONLY thing that preserves the
LITERAL TAB characters between columns and the exact team NAMES — without
it the tabs collapse to spaces and the paste is unusable. Use the team
NAMES from the TEAM NAMES list, spelled EXACTLY as they appear there (e.g.
"Penn State", "TCU", "Miami (FL)"), one tab between every column, one game
per line. Do NOT output abbreviations, nicknames, or the result-screen
codes — the full list name only.

\`\`\`worksheet
WS1 | img1 | <leftTeam> <leftScore> [VS|@|NEUT] <rightTeam> <rightScore> | HOME=<team> | WINNER=<team> | NEUTRAL=Y/N
WS2 | img1 | ...
...
\`\`\`

\`\`\`tsv
=== WEEK ${week} SCORES ===
<game1 HomeTeam>\\t<game1 HomeRank>\\t<game1 HomeScore>\\t<game1 AwayTeam>\\t<game1 AwayRank>\\t<game1 AwayScore>\\t<game1 Neutral?>
<game2 HomeTeam>\\t<game2 HomeRank>\\t<game2 HomeScore>\\t<game2 AwayTeam>\\t<game2 AwayRank>\\t<game2 AwayScore>\\t<game2 Neutral?>
... (one row per game — emit the FULL list, no "...")
<bye1 TeamName>\\t<bye1 Rank>\\t\\t\\t\\t\\t
<bye2 TeamName>\\t<bye2 Rank>\\t\\t\\t\\t\\t
... (one row per ranked bye team; can be empty if no ranked bye teams; up to 25)
\`\`\`

(Each \\t above represents a LITERAL TAB character — use actual tab characters in your output, not the text "\\t". Every team value is the FULL NAME exactly as written in the TEAM NAMES list.)

LAYOUT EXAMPLE (concrete shape — 3 games, 2 bye teams):
  Georgia\\t1\\t35\\tAuburn\\t\\t14\\t            ← game
  Texas\\t\\t28\\tOklahoma\\t12\\t21\\t          ← game
  Alabama\\t\\t52\\tTennessee\\t8\\t10\\tY        ← game (neutral)
  Miami (FL)\\t1\\t\\t\\t\\t\\t                      ← bye rank: Miami at #1
  Clemson\\t3\\t\\t\\t\\t\\t                        ← bye rank: Clemson at #3

The KEY DIFFERENCE between a game row and a bye row is column D:
  • Game row: column D is the away-team name. NEVER blank.
  • Bye row:  column D is BLANK. Only columns A (team) and B (rank)
              are filled. Columns C, E, F, G are all blank.

If you put a team name in column D of a row meant to be a bye rank,
the importer will treat it as a game and silently drop the bye-rank
information. Be careful.

The WORKSHEET is for audit only — the user reads it but pastes only the
contents of the \`\`\`tsv block (everything from the "=== WEEK ..." marker
through the last bye row) into the sheet.

Example rows (for illustration only — your data should match the screenshots, and you should use ONLY team names that appear in the TEAM NAMES list at the bottom of this prompt):
Texas\\t7\\t34\\tOklahoma\\t\\t21\\t
Alabama\\t\\t28\\tGeorgia\\t3\\t31\\tY
LSU\\t\\t52\\tFCS East\\t\\t10\\t

(Row 1: Texas at home, ranked #7. Row 2: Alabama unranked, Georgia ranked #3, neutral site. Row 3: LSU hosts an FCS opponent — "FCS East" is one of this dynasty's FCS placeholders. Use whichever FCS placeholder NAME matches what the screenshot shows, exactly as it appears in the TEAM NAMES list.)

═══════════════════════════════════════════════════════════
FINAL CHECK before you send the answer — actually run these
═══════════════════════════════════════════════════════════
Don't just glance at this list. Physically execute each check on your draft.

[ ] EXHAUSTIVENESS: count the games visible across ALL the user's screenshots (deduplicated, INCLUDING FBS-vs-FCS warm-ups). That number is N. Your TSV has EXACTLY N rows. If your row count is less than N, you missed games — go back to the screenshots and find them. A 2-row or 5-row output for a Week with a full slate is almost certainly wrong.
[ ] FCS GAMES INCLUDED: every FBS-vs-FCS game in the screenshots is a row in your output, mapped to the appropriate FCS placeholder (FCSE / FCSM / FCSN / FCSW or whatever appears in the team mapping below). Skipping a Week 0 FCS warm-up is a known failure mode — confirm you didn't.
[ ] EVERY SCREENSHOT PROCESSED: if the user sent multiple images (look for "1 of 2", "2 of 2" etc., or simply more than one attachment), confirm you read every one of them, not just the first.
[ ] NO TRUNCATION: your output does not end with "...", "[and the rest]", "etc.", or any phrase implying you stopped early. The full list goes through.
[ ] FENCED TSV: the scores are inside a \`\`\`tsv code block — NOT a plain list, prose, or markdown table. If you wrote "North Carolina 45 TCU 42" style lines, you failed this: rewrite as tab-separated team-NAME rows inside the \`\`\`tsv fence.
[ ] TEAM NAMES, NOT ABBREVIATIONS: every value in columns A and D is a FULL NAME copied exactly from the TEAM NAMES list (e.g. "Penn State", not "PSU"; "Miami (FL)", not "MIA"). The result-screen codes (PSU, BUFF, …) are ONLY for matching scores to teams — never output them.
[ ] EXACTLY 7 tab-separated values per row (6 tab characters per line) — even when rank/neutral columns are blank, the surrounding tabs MUST still be present.
[ ] Columns A and D are team NAMES only, from the TEAM NAMES list (re-check before omitting any unfamiliar one).
[ ] Scores in columns C and F are INTEGERS only — no commas, no decimals, no "pts".
[ ] Ranks in columns B and E are integers 1–25 or BLANK — never "NR", never "—", never 0.
[ ] Column G is exactly "Y" or BLANK — never "N", never "neutral", never anything else.
[ ] HOME team correctly identified per game. Re-read rule 6 if you skipped it. The team in Col A is the team whose stadium hosted the game — NOT the team listed first on the screen. CFB26 layouts put the visitor on the LEFT and the home team on the RIGHT, so swap as needed. If your draft has the same team in Col A for the majority of rows (e.g. Auburn in Col A for every Auburn game), you've biased home/away — go re-read each row and fix before sending.
[ ] No same-team-in-Col-A bias. Within this single week's slate, scan your Col A values: if any team appears more than once in Col A, that's an error (a team plays at most one game per week). Across many weeks of separate entries, the same team should NOT appear in Col A for every game it plays — half its games are home, half are away.
[ ] SCORE-FOLLOWS-TEAM (per-row, rule 6.5). Pick THREE rows from your draft at random. For each, mentally re-read the screenshot at that exact row position. Confirm that the value in Col C is the score that was visually next to the team you put in Col A — and the value in Col F is the score next to the team in Col D. If your home/away decision swapped which side of the screen Col A came from, the score MUST have swapped with it. Any row that fails this check has the WINNER WRONG — fix it before sending. This is the most common source of "wrong team won" bug reports.
[ ] WORKSHEET vs TSV (winner consistency). For every TSV row, find the matching WS line. The team with the higher score in the worksheet's middle block (the screen-order summary) MUST equal WINNER on that worksheet line, AND must equal whichever team has the higher score in the TSV row (whether that's Col C or Col F). If any row's TSV winner disagrees with the worksheet's WINNER, you introduced a score-swap during the worksheet→TSV derivation. Fix the TSV row.
[ ] TEAM COVERAGE (rule F in PRE-EXTRACTION COUNT). Every team you saw in the screenshots is now either (a) in a row of your output, or (b) confirmed on bye. No team silently disappeared. If you can name a team you remember seeing that doesn't appear in EITHER place, you have a missing game — go find it.
[ ] Inside the TSV block: data rows only — no header row, no commentary. Notes outside the block are fine (e.g. an "X games dropped" note if N > ${WEEKLY_SCORES_MAX_ROWS}). The worksheet fence above is expected.
[ ] BYE BLOCK PRESENT + COMPLETE: IF the PRIOR-WEEK TOP 25 block above has data — count the teams listed there (P). Count how many of them appear in your games block with a rank (G). Your bye block must have EXACTLY P − G rows. Every team in the prior-week top 25 must be accounted for in EXACTLY ONE place: either (a) in a game row with their new rank, or (b) in the bye block with a derived new rank. NO ranked team silently drops out. The total ranked teams across both blocks must equal P (typically 25). If your count is off, go back and find the missing team before sending. IF the PRIOR-WEEK TOP 25 block above is EMPTY ("(no prior-week Top 25 stored)"), emit an EMPTY bye block — do NOT invent bye entries from real-world poll knowledge or memory. The dynasty's stored picture is the only source of truth here.
[ ] BYE BLOCK COL D EMPTY: every bye row's column D (4th tab-separated cell) is BLANK. If you accidentally put a team name in col D of a bye row, the importer treats it as a game.
[ ] BYE RANKS UNIQUE + IN RANGE: every rank in the bye block is 1-25, no rank repeats, and no rank in the bye block matches a rank already shown for a played team in the games block. The new poll has 25 unique ranks total.`,
    includeTeamMap: true,
    dynastyTeams: currentDynasty?.teams,
  }), [year, week, userAbbr, currentDynasty?.teams, conferenceMapBlock, prevWeekTop25Block])

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

  // Build pre-fill from existing games for this year+week (excluding user's own game,
  // which is entered through the schedule flow and shouldn't appear in the sheet)
  const existingForPrefill = useMemo(() => {
    if (!isOpen || !currentDynasty) return []
    const yearNum = Number(year)
    const weekNum = Number(week)
    const teams = currentDynasty.teams || {}
    // The poll ranks (played AND bye) are saved to the RANKINGS WEEK slot
    // (effectiveCurrentRankWeek by default). Read the grid's rank columns from
    // that SAME slot so the grid is WYSIWYG with what will be saved. Reading
    // them from each game's stored team1Rank/team2Rank (a DIFFERENT slot — the
    // entering-week rank) is what made hand-edited ranks look like they reverted
    // on re-open, since edits landed in the rank-week slot but the prefill kept
    // showing the entering-week slot.
    const rankSlot = Number.isFinite(effectiveCurrentRankWeek) && effectiveCurrentRankWeek >= 0
      ? effectiveCurrentRankWeek : weekNum
    const rankOf = (tid) => {
      const t = teams[tid] || teams[String(tid)]
      const rbw = t?.byYear?.[String(yearNum)]?.rankByWeek ?? t?.byYear?.[yearNum]?.rankByWeek
      const v = rbw?.[rankSlot] ?? rbw?.[String(rankSlot)]
      return (typeof v === 'number' && v >= 1 && v <= 25) ? v : null
    }
    const out = []
    // Every tid playing this week (incl. the user's game) — so a team that plays
    // is never also emitted as a bye row.
    const playingTids = new Set()
    for (const g of (currentDynasty.games || [])) {
      if (!g) continue
      if (Number(g.year) !== yearNum || Number(g.week) !== weekNum) continue
      if (g.team1Tid != null) playingTids.add(Number(g.team1Tid))
      if (g.team2Tid != null) playingTids.add(Number(g.team2Tid))
    }
    for (const g of (currentDynasty.games || [])) {
      if (!g) continue
      if (Number(g.year) !== yearNum || Number(g.week) !== weekNum) continue
      if (!g.team1Tid || !g.team2Tid) continue
      // Skip user-team games — they have their own entry path
      if (Number(g.team1Tid) === userTid || Number(g.team2Tid) === userTid) continue
      const homeTid = g.homeTeamTid ?? Number(g.team1Tid)
      const isNeutral = g.homeTeamTid == null
      const homeIsTeam1 = !isNeutral && homeTid === Number(g.team1Tid)
      const hTid = homeIsTeam1 ? g.team1Tid : g.team2Tid
      const aTid = homeIsTeam1 ? g.team2Tid : g.team1Tid
      const homeAbbr = getTeamNameLabel(teams, hTid) || teams[hTid]?.abbr || ''
      const awayAbbr = getTeamNameLabel(teams, aTid) || teams[aTid]?.abbr || ''
      const homeScore = homeIsTeam1 ? g.team1Score : g.team2Score
      const awayScore = homeIsTeam1 ? g.team2Score : g.team1Score
      out.push({
        homeTeam: homeAbbr,
        awayTeam: awayAbbr,
        homeScore: typeof homeScore === 'number' ? homeScore : null,
        awayScore: typeof awayScore === 'number' ? awayScore : null,
        homeRank: rankOf(Number(hTid)),
        awayRank: rankOf(Number(aTid)),
        neutral: isNeutral,
        isBye: false,
      })
    }
    // Seed bye rows for ranked teams NOT playing this week (e.g. TCU #25 on a
    // week-1 bye) so they stay visible and editable and survive an edit
    // round-trip, instead of silently dropping out of the Top 25 on re-save.
    const byeRows = []
    for (const [tidKey, t] of Object.entries(teams)) {
      const tid = Number(tidKey)
      if (!Number.isFinite(tid)) continue
      if (playingTids.has(tid)) continue
      if (tid === userTid) continue
      const r = rankOf(tid)
      if (r == null) continue
      byeRows.push({
        homeTeam: getTeamNameLabel(teams, tid) || t?.abbr || '',
        awayTeam: '',
        homeScore: null,
        awayScore: null,
        homeRank: r,
        awayRank: null,
        neutral: false,
        isBye: true,
      })
    }
    byeRows.sort((a, b) => (a.homeRank || 99) - (b.homeRank || 99))
    return [...out, ...byeRows]
  }, [isOpen, currentDynasty, year, week, userTid, effectiveCurrentRankWeek])

  // Pre-fill the local grid with the week's existing CPU games so the modal
  // opens ready to edit instead of blank. The parser (readWeeklyScoresFromSheet)
  // is content-classified and reads a game row as
  // [HomeTeam, HomeRank, HomeScore, AwayTeam, AwayRank, AwayScore, Neutral].
  // existingForPrefill already resolves home/away orientation, scores, ranks,
  // and the neutral flag, so we serialize those seven columns per game (blank
  // cell where a value is missing).
  //
  // Ranked bye teams ARE pre-seeded now (as bye rows: team + rank, no opponent),
  // read back from the saved poll (rankByWeek[rankSlot]) so a ranked team on a
  // bye stays visible/editable and survives an edit round-trip instead of
  // silently dropping out of the Top 25 when the user re-opens and re-saves.
  const initialWeeklyText = useMemo(() => {
    const gameLines = existingForPrefill.map((g) => {
      const homeRank = g.homeRank != null ? String(g.homeRank) : ''
      const awayRank = g.awayRank != null ? String(g.awayRank) : ''
      const homeScore = g.homeScore != null ? String(g.homeScore) : ''
      const awayScore = g.awayScore != null ? String(g.awayScore) : ''
      const neutral = g.neutral ? 'Y' : ''
      return [g.homeTeam || '', homeRank, homeScore, g.awayTeam || '', awayRank, awayScore, neutral].join('\t')
    })
    return gameLines.join('\n')
  }, [existingForPrefill])

  // Team-name options for the Home/Away combobox cells. Same label builder the
  // prefill uses (getTeamNameLabel), so pre-filled cells like "Wyoming" match an
  // option and render as a picked value rather than off-list free text. The
  // combobox is a typeahead aid, not a hard gate: a user can type to search and
  // pick a real team, and an AI paste of raw abbreviations (e.g. "WYO") is kept
  // verbatim — the importer's getTidFromAbbr resolves both abbrs and name labels,
  // so pasting still works untouched. FCS opponents are included since a weekly
  // slate can have FBS-vs-FCS games.
  const teamNameOptions = useMemo(
    () => getTeamNameOptions(currentDynasty?.teams, { includeFCS: true }),
    [currentDynasty?.teams],
  )
  const weeklyComboboxColumns = useMemo(
    () => ({ Home: teamNameOptions, Away: teamNameOptions }),
    [teamNameOptions],
  )

  useEffect(() => {
    // An explicit retry (Refresh after re-auth, or Regenerate) re-arms one attempt.
    if (auth.retryCount !== lastRetryCountRef.current) {
      lastRetryCountRef.current = auth.retryCount
      creationAttemptedRef.current = false
    }
    const createSheet = async () => {
      // Don't create a Google Sheet while the local paste path is active.
      if (isOpen && !useLocal && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote && !creationAttemptedRef.current) {
        // Mark attempted before the first await so a failure can't loop back in.
        creationAttemptedRef.current = true
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
          if (!auth.handleError(error)) {
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
  }, [isOpen, useLocal, user, sheetId, currentDynasty?.id, auth.retryCount, showDeletedNote, year, week])

  useEffect(() => {
    if (!isOpen) {
      setShowDeletedNote(false)
      creatingSheetRef.current = false
      creationAttemptedRef.current = false
      setSheetId(null)
      setSheetTitle(null)
      setUseLocal(true)
    }
  }, [isOpen])

  // Shared save core: runs the dropped-rows confirm + the count-drop guard,
  // then writes via saveWeeklyScores. Returns true if the games were saved,
  // false if the user cancelled a guard. Both the Google-sheet sync and the
  // local-paste import funnel parsed games through here so the guards stay
  // identical. (Throws are surfaced by the caller.)
  const commitWeeklyGames = async (games) => {
    // Surface dropped rows BEFORE saving — the parser collects rows
    // it couldn't classify (unknown abbrs, malformed scores, etc.)
    // so they don't silently vanish. User confirms before continuing.
    const dropped = Array.isArray(games?.droppedRows) ? games.droppedRows : []
    if (dropped.length > 0) {
      const lines = dropped.slice(0, 8).map(d => {
        if (d.kind === 'game' && d.reason === 'unknown-abbr') {
          const which = d.missing === 'both' ? 'both teams' : d.missing === 'home' ? `home "${d.home}"` : `away "${d.away}"`
          return `• Game ${d.home} vs ${d.away}: ${which} not in team registry`
        }
        if (d.kind === 'game' && d.reason === 'malformed-score') {
          const parts = []
          if (d.rawHome) parts.push(`home "${d.rawHome}"`)
          if (d.rawAway) parts.push(`away "${d.rawAway}"`)
          return `• Game ${d.home} vs ${d.away}: malformed score (${parts.join(', ') || 'unparseable'})`
        }
        if (d.kind === 'bye' && d.reason === 'unknown-abbr') {
          return `• Bye row #${d.rank}: "${d.team}" not in team registry`
        }
        return `• ${d.kind} dropped (${d.reason})`
      })
      const more = dropped.length > 8 ? `\n…and ${dropped.length - 8} more` : ''
      const proceed = await confirm({
        title: `${dropped.length} row${dropped.length === 1 ? '' : 's'} will be dropped`,
        message: `These rows couldn't be parsed and won't be saved:\n\n${lines.join('\n')}${more}\n\nFix the data and try again, or continue without these rows.`,
        confirmLabel: 'Save anyway',
        variant: 'danger',
      })
      if (!proceed) return false
    }

    // "Significant drop in count" guard. If this save would replace
    // a previously-saved week's games with substantially fewer rows
    // (≥10 fewer or ≤80% of prior), confirm before silently shrinking
    // the data. Only enforced when prior save had a meaningful count.
    const priorCount = Number(currentDynasty?.weeklyScoresEntered?.[year]?.[week]?.gameCount) || 0
    const newCount = games.filter(g => typeof g.homeScore === 'number' && typeof g.awayScore === 'number').length
    // Scheduled-only rows (no scores) still count as content — an empty save
    // means neither played games nor scheduled matchups came through.
    const schedRowCount = games.filter(g => g.homeScore == null && g.awayScore == null && g.homeTid && g.awayTid).length
    if (priorCount >= 20 && newCount < priorCount * 0.8 && (priorCount - newCount) >= 10) {
      const ok = await confirm({
        title: 'Game count dropped sharply',
        message: `Previous save had ${priorCount} games for Week ${week}. This save has ${newCount}. Continuing will replace the existing data with fewer rows.`,
        confirmLabel: 'Continue',
        variant: 'danger',
      })
      if (!ok) return false
    }

    // Intentional CLEAR. saveWeeklyScores hard-blocks an empty save so a
    // failed paste can't silently wipe a saved week — but that also made a
    // mistakenly-entered week impossible to undo here, since emptying the
    // sheet is the only way to remove its last game. Ask once, in terms that
    // separate the two cases (a failed paste is an accident; deleting every
    // game is a decision), and pass the confirmation through.
    let allowEmptyClear = false
    if (newCount === 0 && schedRowCount === 0 && priorCount > 0) {
      allowEmptyClear = await confirm({
        title: `Delete all ${priorCount} saved game${priorCount === 1 ? '' : 's'} for Week ${week}?`,
        message: `The sheet is empty, so saving it removes every game already saved for Week ${week}, ${year}. Say Cancel if your paste just failed to come through — your data is untouched either way.`,
        confirmLabel: 'Delete them',
        variant: 'danger',
      })
      if (!allowEmptyClear) return false
    }

    await saveWeeklyScores(currentDynasty.id, games, year, week, rankWeek, { allowEmptyClear })
    const schedCount = games.filter(g => g.homeScore == null && g.awayScore == null && g.homeTid && g.awayTid).length
    const parts = []
    if (newCount > 0 || schedCount === 0) parts.push(`${newCount} game${newCount === 1 ? '' : 's'}`)
    if (schedCount > 0) parts.push(`${schedCount} scheduled matchup${schedCount === 1 ? '' : 's'}`)
    toast.success(`Saved ${parts.join(' + ')} for Week ${week}.`)
    return true
  }

  // Local paste import: the AI emits the SAME 7-column game rows + bye-rank
  // rows the sheet produces, classified by content (col D filled = game,
  // col D empty = bye). The parser is position-independent, so the pasted
  // rows feed straight in — no pre-filled columns, no normalization. Routes
  // through commitWeeklyGames so the dropped-row + count-drop guards apply.
  const handleLocalImport = async (text) => {
    const games = await readWeeklyScoresFromSheet(
      null,
      null,
      currentDynasty?.teams || currentDynasty?.customTeams,
      { rows: splitTsv(text) },
    )
    const saved = await commitWeeklyGames(games)
    if (saved) onClose()
  }

  const handleSave = async (alsoDelete) => {
    if (!sheetId || !sheetTitle) return
    if (alsoDelete) setDeletingSheet(true); else setSyncing(true)
    try {
      const games = await readWeeklyScoresFromSheet(
        sheetId,
        sheetTitle,
        currentDynasty?.teams || currentDynasty?.customTeams,
      )

      const saved = await commitWeeklyGames(games)
      if (!saved) {
        setDeletingSheet(false)
        setSyncing(false)
        return
      }

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
      if (!auth.handleError(error)) {
        // Surface specific guard messages so the user knows their
        // existing data is intact, vs. the generic "Failed to save"
        // copy which reads like a data-loss event.
        if (error?.code === 'WEEKLY_SCORES_EMPTY_SAVE_BLOCKED') {
          toast.error(error.message)
        } else {
          toast.error('Failed to save. Make sure data is properly formatted.')
        }
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
      title: 'Delete this weekly scores sheet?',
      message: 'This deletes the Google Sheet without applying any edits. Your dynasty weekly scores stay as-is.',
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (!ok) return
    setDeletingSheet(true)
    try {
      await deleteGoogleSheet(sheetId)
      setSheetId(null)
      setSheetTitle(null)
      setShowDeletedNote(true)
      setTimeout(() => onClose(), 1800)
    } catch (error) {
      console.error('Failed to delete sheet:', error)
      if (!auth.handleError(error)) {
        toast.error('Failed to delete the sheet. Try again.')
      }
    } finally {
      setDeletingSheet(false)
    }
  }

  if (!isOpen) return null

  const embedUrl = sheetId && sheetTitle ? getSheetEmbedUrl(sheetId, sheetTitle) : null
  const isLoading = creatingSheet
  const headerLabel = `${year} Week ${week} Scores`

  const rankWeekOptions = useMemo(() => {
    // Weeks 0-15 are the regular season; 16 is the slot for "after Week
    // 15 / heading into CCG week" rank entry. Bowls / CFP have their
    // own modals so we don't extend further.
    const opts = []
    for (let w = 0; w <= 16; w++) opts.push(w)
    return opts
  }, [])

  const rankWeekSelect = (
    <select
      id="weekly-rank-week"
      value={rankWeek ?? ''}
      onChange={(e) => setRankWeek(Number(e.target.value))}
      disabled={syncing || deletingSheet}
      className="px-3 py-2 rounded-md bg-surface-2 border border-surface-4 hover:border-surface-5 text-txt-primary text-sm font-medium tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-3 disabled:opacity-60 transition-colors"
    >
      {rankWeekOptions.map(w => {
        // Slot 16 isn't a real regular-season week — it's the rank-entry
        // slot for the post-Week-15 / heading-into-CCG poll. Label it
        // accordingly so users in CCG phase don't see a phantom "Week 16".
        const label = w === 16 ? 'Conf Champ Week' : `Week ${w}`
        return (
          <option key={w} value={w}>
            {label}{w === effectiveCurrentRankWeek ? ' (current)' : ''}
          </option>
        )
      })}
    </select>
  )

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4"
      style={{ margin: 0 }}
      onMouseDown={onClose}
    >
      <div
        className={`card-elevated relative w-full max-h-[calc(100dvh-4rem)] flex flex-col overflow-hidden ${
          useEmbedded
            ? 'sm:w-[95vw] sm:h-[95dvh]'
            : 'sm:max-w-[680px] sm:h-auto'
        }`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 sm:px-7 py-4 border-b border-surface-4">
          <div className="flex flex-col">
            <h2 className="text-xl sm:text-2xl font-bold text-txt-primary tracking-tight tabular-nums">
              {year} Week {week} Scores
            </h2>
          </div>
          <button
            aria-label="Close"
            onClick={onClose}
            className="text-txt-tertiary hover:text-txt-primary transition-colors -mr-1 p-1.5 rounded-md hover:bg-surface-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {useLocal && !showDeletedNote ? (
            <div className="flex-1 flex flex-col overflow-hidden px-5 sm:px-7 py-4">
              <p className="mb-3 text-[11px] leading-snug sm:text-sm sm:leading-relaxed text-txt-secondary">
                Screenshot <strong className="text-txt-primary">all of this week's scores</strong> and send them with the prompt. The AI reads every final and <strong className="text-txt-primary">derives the Top 25 automatically</strong> from them. Ranked teams on bye are auto derived from the past week's rankings. The AI makes its best judgement to fill in the entire Top 25.
              </p>
              <LocalDataEntry
                aiPrompt={aiPrompt}
                onImport={handleLocalImport}
                onUseGoogle={() => setUseLocal(false)}
                onCancel={onClose}
                importLabel="Import Scores"
                initialText={initialWeeklyText}
                columns={WEEKLY_SCORES_COLUMNS}
                comboboxColumns={weeklyComboboxColumns}
                comboboxAliases={getTeamNameAliases(currentDynasty?.teams)}
                normalizeRows={normalizeWeeklyScoreRows}
                instructions={"Screenshot this week's full scoreboard — every game and its final score. It doesn't have to be perfect, just clear and complete. The AI reads the scores AND derives the Top 25 from them, so there's no separate rankings screenshot."}
              >
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <label htmlFor="weekly-rank-week" className="label-xs text-txt-tertiary">
                    Rankings week
                  </label>
                  {rankWeekSelect}
                  <p className="basis-full text-xs text-txt-tertiary leading-relaxed">
                    Which week's slot the derived Top 25 lands in. Defaults to your dynasty's current week.
                  </p>
                </div>
              </LocalDataEntry>
            </div>
          ) : isLoading ? (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center">
                <div
                  className="animate-spin w-10 h-10 border-2 rounded-full mx-auto mb-4"
                  style={{ borderColor: 'var(--text-primary)', borderTopColor: 'transparent' }}
                />
                <SheetLoadingHint active={isLoading} />
              </div>
            </div>
          ) : showDeletedNote ? (
            <div className="flex-1 flex items-center justify-center p-6">
              <p className="text-xl font-bold text-txt-primary">Saved</p>
            </div>
          ) : sheetId ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-5 sm:px-7 pt-4 pb-3">
                <SheetModalAIHero
                  tagline="Skip the typing. Let AI fill the weekly scores."
                  buttons={[{ label: 'Copy AI Prompt', prompt: aiPrompt }]}
                />
              </div>
              {!isMobile && useEmbedded ? (
                <>
                  <div className="px-5 sm:px-7 py-3 border-b border-surface-4 flex flex-wrap gap-2 items-center">
                    <button
                      onClick={() => handleSave(true)}
                      disabled={syncing || deletingSheet}
                      className={`btn-refined btn-refined--solid ${highlightSave ? 'animate-pulse-subtle' : ''}`}
                    >
                      {deletingSheet ? 'Saving…' : 'Save & move to trash'}
                    </button>
                    <button
                      onClick={() => handleSave(false)}
                      disabled={syncing || deletingSheet}
                      className="btn-refined"
                    >
                      {syncing ? 'Saving…' : 'Save & keep sheet'}
                    </button>

                    <span className="mx-1 h-6 w-px bg-surface-4" aria-hidden="true" />

                    <label htmlFor="weekly-rank-week" className="label-xs text-txt-tertiary">
                      Rankings week
                    </label>
                    {rankWeekSelect}

                    <div className="ml-auto flex items-center gap-2">
                      <button
                        onClick={handleDeleteSheetOnly}
                        disabled={syncing || deletingSheet || regenerating}
                        className="btn-refined"
                      >
                        {deletingSheet ? 'Deleting…' : 'Delete sheet'}
                      </button>
                      <button
                        onClick={handleRegenerateSheet}
                        disabled={syncing || deletingSheet || regenerating}
                        className="btn-refined btn-refined--danger"
                      >
                        {regenerating ? 'Regenerating…' : 'Regenerate'}
                      </button>
                    </div>
                  </div>

                  <div className="px-5 sm:px-7 py-2 flex items-center justify-end">
                    <button
                      onClick={() => {
                        const newValue = !useEmbedded
                        setUseEmbedded(newValue)
                        localStorage.setItem('sheetEmbedPreference', newValue.toString())
                      }}
                      className="text-xs text-txt-tertiary hover:text-txt-primary transition-colors underline decoration-dotted underline-offset-4"
                    >
                      ← Back to default view
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  <div className="max-w-md mx-auto px-5 sm:px-7 py-6 flex flex-col gap-5">

                    {/* Manual entry — shared primitive replacing the inline Open Sheets CTA */}
                    <SheetManualEntry sheetId={sheetId} />

                    {/* RANKINGS WEEK */}
                    <section className="text-center">
                      <label htmlFor="weekly-rank-week" className="label-xs text-txt-tertiary block mb-2">
                        Rankings week
                      </label>
                      <div className="flex justify-center">
                        {rankWeekSelect}
                      </div>
                      <p className="text-xs text-txt-tertiary mt-2 leading-relaxed">
                        The Top 25 the AI extracts from your screenshot lands in this week's slot. Defaults to your dynasty's current week.
                      </p>
                    </section>

                    <SheetModalFooter
                      syncing={syncing}
                      deletingSheet={deletingSheet}
                      regenerating={regenerating}
                      highlightSave={highlightSave}
                      onSaveAndDelete={() => handleSave(true)}
                      onSaveAndKeep={() => handleSave(false)}
                      onDeleteSheetOnly={handleDeleteSheetOnly}
                      onRegenerate={handleRegenerateSheet}
                      showEmbeddedToggle={!isMobile}
                      useEmbedded={useEmbedded}
                      onToggleEmbedded={() => {
                        const newValue = !useEmbedded
                        setUseEmbedded(newValue)
                        localStorage.setItem('sheetEmbedPreference', newValue.toString())
                      }}
                    />

                  </div>
                </div>
              )}
            </div>
          ) : null}
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
