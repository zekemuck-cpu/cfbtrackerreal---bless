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
import {
  createWeeklyScoresSheet,
  readWeeklyScoresFromSheet,
  deleteGoogleSheet,
  getSheetEmbedUrl,
  WEEKLY_SCORES_MAX_ROWS,
} from '../services/sheetsService'
import { getCurrentTeamTid } from '../data/teamRegistry'
import { getModalColors } from '../utils/colorUtils'
import { buildAIPrompt } from '../utils/aiPrompt'
import SheetLoadingHint from './SheetLoadingHint'
import { getCustomConferencesForYear } from '../context/DynastyContext'
import { conferenceTeams as DEFAULT_CONFERENCE_TEAMS } from '../data/conferenceTeams'

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

  const [useEmbedded, setUseEmbedded] = useState(() => localStorage.getItem('sheetEmbedPreference') === 'true')
  const [highlightSave, setHighlightSave] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const creatingSheetRef = useRef(false)

  // Which week's rankByWeek slot to write the screenshot's poll into.
  // Defaults to the dynasty's currentWeek (= what the user sees in CFB26
  // right now). User can override when they're backfilling — e.g. they
  // forgot to save last week, so the screenshot they're pasting actually
  // shows last week's poll, not today's. Without the override, every
  // re-save silently overwrites the current poll with stale data.
  const [rankWeek, setRankWeek] = useState(null)
  useEffect(() => {
    if (!isOpen) return
    const cw = Number(currentDynasty?.currentWeek)
    setRankWeek(Number.isFinite(cw) && cw > 0 ? cw : Number(week) || 1)
  }, [isOpen, currentDynasty?.currentWeek, week])

  const userTid = currentDynasty ? getCurrentTeamTid(currentDynasty) : null
  const userTeam = userTid ? currentDynasty?.teams?.[userTid] : null
  const userAbbr = userTeam?.abbr || null

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
    const seen = new Set()
    for (const conf of order) {
      const teams = Array.isArray(confMap[conf]) ? confMap[conf].filter(Boolean) : null
      if (!teams || teams.length === 0) continue
      lines.push(`  ${conf}: ${teams.join(', ')}`)
      seen.add(conf)
    }
    // Anything else in the map that wasn't in the canonical order
    // (e.g. a custom conference name the user invented).
    for (const [conf, teams] of Object.entries(confMap)) {
      if (seen.has(conf)) continue
      if (!Array.isArray(teams) || teams.length === 0) continue
      lines.push(`  ${conf}: ${teams.join(', ')}`)
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
    if (!Number.isFinite(yearNum) || !Number.isFinite(weekNum) || weekNum <= 0) return ''
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
        if (!slots.has(v)) slots.set(v, team.abbr)
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
    if (slotMap.size === 0) return ''
    const lines = []
    if (sourceWeek !== weekNum) {
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

  WS<n> | <img> | <leftAbbr> <leftScore> [VS|@|NEUT] <rightAbbr> <rightScore> | HOME=<abbr> | WINNER=<abbr> | NEUTRAL=Y/N

Field by field:
  • WS<n>            sequential — WS1, WS2, WS3 …
  • <img>            which screenshot you read this game from (img1, img2…)
  • The middle block is what you SAW: which team's logo/abbr was on which
    side of the screen, and which score sat next to which logo. The
    [VS|@|NEUT] marker is the orientation cue you used (vs / @ / neutral
    site). Keep left and right in the order they appeared on screen.
  • HOME=<abbr>      apply rule 6 (HOME / AWAY ORIENTATION). Cite mentally
                     which evidence drove the decision: "@", "vs", left/
                     right convention, explicit Home/Away tag, neutral
  • WINNER=<abbr>    the team with the higher score. CRITICAL: the higher
                     score in the middle block must belong to the team you
                     write here. If your worksheet line says
                     "AUB 31 @ UGA 21 ... WINNER=UGA" you have a bug —
                     31 is paired with AUB on screen, AUB won.
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
        "WINNER_ABBR  WINNER_SCORE,  LOSER_ABBR  LOSER_SCORE"
THE WINNER COMES FIRST. The loser comes after the comma.

Real examples taken straight from CFB26 screenshots:
  • "UK 17, UGA 14"     →  UK won 17, UGA lost 14    (Kentucky beat Georgia)
  • "OKLA 28, TAMU 26"  →  Oklahoma 28, Texas A&M 26  (Oklahoma won)
  • "MIST 38, KENN 17"  →  Missouri State 38, Kennesaw State 17
  • "ND 51, FRES 10"    →  Notre Dame 51, Fresno State 10
  • "USC 38, IOWA 33"   →  USC 38, Iowa 33 (USC won)
  • "ECU 51, WVU 10"    →  East Carolina 51, West Virginia 10

This is the score-swap defense: you do NOT have to look at logos and try to pair scores visually. The result text directly tells you who won and who lost. If you read the comma-separated string correctly, score-swap cannot happen.

═══ ABBREVIATION MISMATCH: result text ≠ dropdown ═══

CFB26's result-column abbreviations are the game's internal short codes. They MAY NOT match the dropdown abbreviations in your TEAM ABBREVIATIONS mapping. Examples I've personally seen:

  Result-text abbr → Dropdown abbr
  ────────────────────────────────────
    CUSE          →  SYR    (Syracuse / 'Cuse)
    MIST          →  MZST   (Missouri State)
    JXST          →  JKST   (Jacksonville State)
    M-OH          →  M-OH   (Miami OH — same)
    UF            →  UF     (Florida — same)
    OKLA          →  OU     (Oklahoma — sometimes either form is used)
    TAMU          →  TAMU   (Texas A&M — same)
    MASS          →  MASS   (UMass — same)
    CONN          →  CONN   (UConn — same)
    BAMA          →  BAMA   (Alabama — same)
    GASO          →  GASO   (Georgia Southern — same)
    SCAR          →  SCAR   (South Carolina — same)
    KENN          →  KENN   (Kennesaw State — same)

When the result-text abbr doesn't match a dropdown entry, **do NOT use the result-text abbr in the TSV**. Match the team's FULL NAME from the matchup column to the dropdown instead. This is critical — using "CUSE" or "MIST" verbatim breaks the import.

═══ THE STEP-BY-STEP STRATEGY (use this for every row) ═══

1. Read the FULL TEAM NAMES from the matchup column. Examples:
   "Missouri State", "Kennesaw State", "Notre Dame", "Fresno State".
2. Look up each full name in your TEAM ABBREVIATIONS mapping at the bottom of this prompt. Use the dropdown abbr you find there. The matchup column's text is the SOURCE OF TRUTH for team identity.
3. Read the result text: "XXX score1, YYY score2".
4. Match each result-text abbr (XXX, YYY) back to one of the two team names in the matchup column. There are only two teams in the row — one of them is XXX, the other is YYY. Use abbr similarity + position-in-the-row as the matching cue.
5. Pair each team with its score: the team matched to XXX scored score1, the team matched to YYY scored score2.
6. Apply the "at" rule: LEFT team = AWAY/visitor, RIGHT team = HOME/host. Both team's scores are now known from step 5; just put them in the right columns.

Example, end-to-end on the "Missouri State at Kennesaw State | MIST 38, KENN 17" row:
  Step 1: Left full name = "Missouri State". Right full name = "Kennesaw State".
  Step 2: Look up "Missouri State" in dropdown → MZST. Look up "Kennesaw State" → KENN.
  Step 3: Result text = "MIST 38, KENN 17". Winner is MIST with 38; loser is KENN with 17.
  Step 4: MIST result-abbr corresponds to "Missouri State" (left, the visitor). KENN result-abbr corresponds to "Kennesaw State" (right, the host).
  Step 5: Missouri State scored 38. Kennesaw State scored 17.
  Step 6: HOME = right team = Kennesaw State = KENN with score 17. AWAY = left team = Missouri State = MZST with score 38.

  Worksheet line: WSn | img1 | MZST 38 @ KENN 17 | HOME=KENN | WINNER=MZST | NEUTRAL=N
  TSV row:        KENN  [blank]  17  MZST  [blank]  38  [blank]

═══ Other things on the screen — IGNORE these ═══

  • The "PLAY" column number (0, 1, 5, etc.) is a per-user highlight counter. Has nothing to do with scoring. Ignore it.
  • The right-side panel (the big card showing one highlighted game with logos stacked vertically and an arrow → next to one score) duplicates information already in the row. Don't extract from this panel — work the table rows. The panel only shows ONE game at a time.
  • The records in parentheses on the right panel ("3-4 (2-3)" / "1-5 (0-2)") are season-to-date team records, NOT game scores. Don't confuse these with scores.

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
7. NEUTRAL FLAG: column G is "Y" only when the game is explicitly at a neutral site (kickoff games, neutral-site classics, conference championship venues). For ordinary home games leave column G BLANK. Do NOT write "N". For Week 14+ specifically, see the CONFERENCE CHAMPIONSHIP WEEK section below — every conference championship game MUST be marked Y, and the importer relies on Y to recognize the game as a championship.
8. FCS OPPONENTS — INCLUDE THEM. EA College Football 26 represents real FCS schools as one of four generic FCS placeholders, and those placeholders ARE in the team mapping at the bottom of this prompt (typically FCSE, FCSM, FCSN, FCSW — but follow whatever appears in your mapping). When a Power-or-Group-of-5 FBS team plays an FCS opponent in Week 0 (or later), that game IS in scope — find the matching FCS placeholder abbreviation in the mapping and write the row. Do NOT drop FCS games — they're part of the user's records.
9. UNKNOWN ABBREVIATIONS — never invent. If you cannot find a team in the mapping AT ALL after a careful re-scan, OMIT that game (rare — almost everything an in-game screenshot shows is in the mapping, including all FBS teams, FCS placeholders, and any user-renamed teambuilder teams). Re-check the mapping CAREFULLY before omitting — it includes every valid abbreviation for this dynasty.
10. SKIP bye weeks. Teams on bye are not games and have no row.
11. NO HEADER ROW in the output. Do not include "HOME TEAM" / "AWAY TEAM" labels.
12. ${userAbbr ? `OPTIONAL — the user's own team is ${userAbbr}. If you can see their game in the screenshots, INCLUDE it; if not, that's fine — they enter their own game separately and any duplicate row is harmlessly preserved.` : `If the user's own team plays in this week, include the row anyway — duplicates with their separately-entered game are handled automatically.`}

═══════════════════════════════════════════════════════════
CONFERENCE CHAMPIONSHIP WEEK (Week 14+) — special rules
═══════════════════════════════════════════════════════════
When the week being entered is Week 14 OR LATER, conference championship games appear in the screenshots — typically a CONF CHAMPIONSHIPS sub-screen that lists one or two games per conference at neutral sites. They look like a regular game line on the surface (two teams, a score), but they are NOT regular-season games. The importer auto-promotes these rows to the "conference championship" game type if and only if every condition below is met for that row:

   (A) BOTH teams are in the SAME conference per the DYNASTY CONFERENCE MAP at the bottom of this prompt.
   (B) Column G is "Y" (neutral site).
   (C) The week (the value injected at the top of this prompt) is ≥ 14.

So when you encounter a Week 14+ matchup at a neutral site between two teams in the same conference (per the dynasty map), set column G to "Y" — period. Do NOT skip it, do NOT leave it blank, do NOT mark it home/away. Conversely, regular-season conference games (not neutral, not championship-week) MUST keep G blank — never bleed the neutral flag onto a normal home game.

Use the dynasty's CONFERENCE MAP at the bottom of this prompt — NOT real-world conference assumptions. If the user has moved Alabama and Georgia into the Pac-12 in their dynasty, then a Week 14 BAMA-vs-UGA neutral-site game IS the Pac-12 Championship — record it accordingly. Do not assume a team is in its real-world conference; trust the mapping below.

═══════════════════════════════════════════════════════════
DYNASTY CONFERENCE MAP — use this, not real-world assumptions
═══════════════════════════════════════════════════════════
This is the conference alignment for the ${year} season in THIS dynasty. Use it to determine whether a Week 14+ matchup is a conference championship (rule above). Each line is "<conference>: <comma-separated team abbreviations>".

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
  1. From the PRIOR-WEEK TOP 25 above, list every team that was ranked.
  2. For each ranked team, check whether they appear as Col A or Col D
     of any row in your GAMES block. If yes → they played this week,
     their new rank already lives in the games row's rank column.
     IGNORE them in the bye block.
  3. The remaining ranked teams DID NOT play this week — they're on
     bye. Each of those teams gets ONE row in the BYE block.
  4. Decide each bye team's new rank by THINKING ABOUT THE WEEK:
       • By default, bye teams hold their slot.
       • If a team BELOW them won big and leapfrogged, the bye team
         drops one (or more) slots.
       • If a team ABOVE them lost (especially a bad loss), the bye
         team can move UP.
       • Multiple ranked teams can be on bye in the same week — they
         each independently shift based on what happened around them.
       • Movement of more than one slot IS allowed when the data
         supports it (e.g. multiple leapfrogs, blowout losses above).
       • The 25 slots in the new poll are all filled. For each empty
         slot in the GAMES-derived ranks, decide which bye team most
         naturally fills it. Walk slot-by-slot from #1 down — for
         each missing rank, identify the bye team whose prior rank +
         the week's events line up.
  5. Sanity check: every rank in your BYE block must be UNIQUE, must
     be 1-25, and must NOT collide with a rank already claimed by a
     team in the GAMES block. The full union of (games block ranks)
     ∪ (bye block ranks) should be exactly {1, 2, ..., up to 25}.
  6. Only output bye rows for teams that WERE ranked in the prior-week
     Top 25 above. A team that was unranked entering this week can
     enter the new poll only via a game (= their rank shows up in the
     games block). Don't invent unranked-to-ranked entries here.
  7. If no ranked team had a bye, emit an empty BYE block (no rows).

═══════════════════════════════════════════════════════════
TAB: "Week ${week} Scores" — up to ${WEEKLY_SCORES_MAX_ROWS} game rows + up to 25 bye-rank rows × 7 columns
Paste your block at cell A2 of the "Week ${week} Scores" tab
═══════════════════════════════════════════════════════════

Col A (Home Team) | Col B (Home Rank) | Col C (Home Score) | Col D (Away Team) | Col E (Away Rank) | Col F (Away Score) | Col G (Neutral?)
------------------+-------------------+--------------------+-------------------+-------------------+--------------------+-----------------
team abbr         | 1–25 or BLANK     | integer            | team abbr         | 1–25 or BLANK     | integer            | "Y" or BLANK

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
Output, in order:
  1. The pre-extraction WORKSHEET as a fenced \`\`\`worksheet block
     (one WS line per game, see "PRE-EXTRACTION WORKSHEET" above).
  2. The TSV block — paste-target marker line, then game rows, then
     bye-rank rows directly after them. ONE paste covers everything —
     the user clicks paste once at cell A2 and is done. NO padding,
     NO separator row needed; the importer classifies each row by
     content (col D filled = game, col D empty = bye rank).

\`\`\`worksheet
WS1 | img1 | <leftAbbr> <leftScore> [VS|@|NEUT] <rightAbbr> <rightScore> | HOME=<abbr> | WINNER=<abbr> | NEUTRAL=Y/N
WS2 | img1 | ...
...
\`\`\`

=== WEEK ${week} SCORES — paste at cell A2 of "Week ${week} Scores" tab ===
<game1 HomeTeam>\\t<game1 HomeRank>\\t<game1 HomeScore>\\t<game1 AwayTeam>\\t<game1 AwayRank>\\t<game1 AwayScore>\\t<game1 Neutral?>
<game2 HomeTeam>\\t<game2 HomeRank>\\t<game2 HomeScore>\\t<game2 AwayTeam>\\t<game2 AwayRank>\\t<game2 AwayScore>\\t<game2 Neutral?>
... (one row per game — emit the FULL list, no "...")
<bye1 TeamAbbr>\\t<bye1 Rank>\\t\\t\\t\\t\\t
<bye2 TeamAbbr>\\t<bye2 Rank>\\t\\t\\t\\t\\t
... (one row per ranked bye team; can be empty if no ranked bye teams; up to 25)

(Each \\t above represents a LITERAL TAB character — use actual tab characters in your output, not the text "\\t".)

LAYOUT EXAMPLE (concrete shape — 3 games, 2 bye teams):
  GA\\t1\\t35\\tAUB\\t\\t14\\t            ← game
  TEX\\t\\t28\\tOU\\t12\\t21\\t            ← game
  BAMA\\t\\t52\\tTENN\\t8\\t10\\tY         ← game (neutral)
  MIA\\t1\\t\\t\\t\\t\\t                       ← bye rank: Miami at #1
  CLEM\\t3\\t\\t\\t\\t\\t                      ← bye rank: Clemson at #3

The KEY DIFFERENCE between a game row and a bye row is column D:
  • Game row: column D is the away-team abbreviation. NEVER blank.
  • Bye row:  column D is BLANK. Only columns A (team) and B (rank)
              are filled. Columns C, E, F, G are all blank.

If you put a team abbr in column D of a row meant to be a bye rank,
the importer will treat it as a game and silently drop the bye-rank
information. Be careful.

The WORKSHEET is for audit only — the user reads it but pastes only the
TSV (everything from the "=== WEEK ..." marker through the last bye row)
into the sheet.

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
[ ] HOME team correctly identified per game. Re-read rule 6 if you skipped it. The team in Col A is the team whose stadium hosted the game — NOT the team listed first on the screen. CFB26 layouts put the visitor on the LEFT and the home team on the RIGHT, so swap as needed. If your draft has the same team in Col A for the majority of rows (e.g. Auburn in Col A for every Auburn game), you've biased home/away — go re-read each row and fix before sending.
[ ] No same-team-in-Col-A bias. Within this single week's slate, scan your Col A values: if any team appears more than once in Col A, that's an error (a team plays at most one game per week). Across many weeks of separate entries, the same team should NOT appear in Col A for every game it plays — half its games are home, half are away.
[ ] SCORE-FOLLOWS-TEAM (per-row, rule 6.5). Pick THREE rows from your draft at random. For each, mentally re-read the screenshot at that exact row position. Confirm that the value in Col C is the score that was visually next to the team you put in Col A — and the value in Col F is the score next to the team in Col D. If your home/away decision swapped which side of the screen Col A came from, the score MUST have swapped with it. Any row that fails this check has the WINNER WRONG — fix it before sending. This is the most common source of "wrong team won" bug reports.
[ ] WORKSHEET vs TSV (winner consistency). For every TSV row, find the matching WS line. The team with the higher score in the worksheet's middle block (the screen-order summary) MUST equal WINNER on that worksheet line, AND must equal whichever team has the higher score in the TSV row (whether that's Col C or Col F). If any row's TSV winner disagrees with the worksheet's WINNER, you introduced a score-swap during the worksheet→TSV derivation. Fix the TSV row.
[ ] TEAM COVERAGE (rule F in PRE-EXTRACTION COUNT). Every team you saw in the screenshots is now either (a) in a row of your output, or (b) confirmed on bye. No team silently disappeared. If you can name a team you remember seeing that doesn't appear in EITHER place, you have a missing game — go find it.
[ ] No header row, no commentary INSIDE the data, no follow-up text (except the optional "X games dropped" note ONLY if N > ${WEEKLY_SCORES_MAX_ROWS}). The paste-target label line above the fence is required (see Method A/B rules above) and the upstream worksheet fence is permitted as described above.
[ ] BYE BLOCK PRESENT: IF the PRIOR-WEEK TOP 25 block above has data, every team in it is accounted for — either (a) they appear in a game row, or (b) they appear in the bye block with a derived new rank. NO ranked team silently drops out. IF the PRIOR-WEEK TOP 25 block above is EMPTY ("(no prior-week Top 25 stored)"), emit an EMPTY bye block — do NOT invent bye entries from real-world poll knowledge or memory. The dynasty's stored picture is the only source of truth here.
[ ] BYE BLOCK COL D EMPTY: every bye row's column D (4th tab-separated cell) is BLANK. If you accidentally put a team abbr in col D of a bye row, the importer treats it as a game with that abbr.
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
  }, [isOpen, user, sheetId, creatingSheet, currentDynasty?.id, auth.retryCount, showDeletedNote, year, week])

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
          message: `These rows couldn't be parsed and won't be saved:\n\n${lines.join('\n')}${more}\n\nFix the sheet and try again, or continue without these rows.`,
          confirmLabel: 'Save anyway',
          variant: 'danger',
        })
        if (!proceed) {
          setDeletingSheet(false)
          setSyncing(false)
          return
        }
      }

      // "Significant drop in count" guard. If this save would replace
      // a previously-saved week's games with substantially fewer rows
      // (≥10 fewer or ≤80% of prior), confirm before silently shrinking
      // the data. Only enforced when prior save had a meaningful count.
      const priorCount = Number(currentDynasty?.weeklyScoresEntered?.[year]?.[week]?.gameCount) || 0
      const newCount = games.filter(g => typeof g.homeScore === 'number' && typeof g.awayScore === 'number').length
      if (priorCount >= 20 && newCount < priorCount * 0.8 && (priorCount - newCount) >= 10) {
        const ok = await confirm({
          title: 'Game count dropped sharply',
          message: `Previous save had ${priorCount} games for Week ${week}. This save has ${newCount}. Continuing will replace the existing data with fewer rows.`,
          confirmLabel: 'Continue',
          variant: 'danger',
        })
        if (!ok) {
          setDeletingSheet(false)
          setSyncing(false)
          return
        }
      }

      await saveWeeklyScores(currentDynasty.id, games, year, week, rankWeek)
      toast.success(`Saved ${newCount} game${newCount === 1 ? '' : 's'} for Week ${week}.`)

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
        toast.error('Failed to delete the sheet — try again.')
      }
    } finally {
      setDeletingSheet(false)
    }
  }

  if (!isOpen) return null

  const embedUrl = sheetId && sheetTitle ? getSheetEmbedUrl(sheetId, sheetTitle) : null
  const isLoading = creatingSheet
  const headerLabel = `${year} Week ${week} Scores`

  const dynastyCurrentWeek = Number(currentDynasty?.currentWeek)
  const rankWeekOptions = useMemo(() => {
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
      {rankWeekOptions.map(w => (
        <option key={w} value={w}>
          Week {w}{w === dynastyCurrentWeek ? ' (current)' : ''}
        </option>
      ))}
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
            <span className="label-xs text-txt-tertiary">Weekly Scores</span>
            <h2 className="text-xl sm:text-2xl font-bold text-txt-primary tracking-tight tabular-nums">
              {year} <span className="text-txt-tertiary font-medium">·</span> Week {week}
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
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center">
                <div
                  className="animate-spin w-10 h-10 border-2 rounded-full mx-auto mb-4"
                  style={{ borderColor: 'var(--text-primary)', borderTopColor: 'transparent' }}
                />
                <p className="label-xs text-txt-tertiary mb-2">Creating Sheet</p>
                <p className="text-base font-semibold text-txt-primary">
                  Week {week} workspace
                </p>
                <p className="text-xs mt-2 text-txt-tertiary tabular-nums">
                  Up to {WEEKLY_SCORES_MAX_ROWS} rows · 1 tab
                </p>
                <SheetLoadingHint active={isLoading} />
              </div>
            </div>
          ) : showDeletedNote ? (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center max-w-sm">
                <p className="label-xs text-txt-tertiary mb-2">Status</p>
                <p className="text-xl font-bold text-txt-primary mb-1">Saved</p>
                <p className="text-sm text-txt-secondary">
                  Week {week} scores synced. Sheet moved to Drive trash.
                </p>
              </div>
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

                    {/* SAVE / CANCEL — three matching full-width buttons */}
                    <section>
                      <p className="label-xs text-txt-tertiary mb-3">Save</p>
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => handleSave(true)}
                          disabled={syncing || deletingSheet}
                          className={`btn-refined btn-refined--solid btn-refined--lg w-full justify-center ${highlightSave ? 'animate-pulse-subtle' : ''}`}
                        >
                          {deletingSheet ? 'Saving…' : 'Save & move to trash'}
                        </button>
                        <button
                          onClick={() => handleSave(false)}
                          disabled={syncing || deletingSheet}
                          className="btn-refined btn-refined--lg w-full justify-center"
                        >
                          {syncing ? 'Saving…' : 'Save & keep sheet'}
                        </button>
                        <button
                          onClick={handleDeleteSheetOnly}
                          disabled={syncing || deletingSheet || regenerating}
                          className="btn-refined btn-refined--lg btn-refined--danger w-full justify-center"
                        >
                          {deletingSheet ? 'Deleting…' : 'Delete sheet (no save)'}
                        </button>
                      </div>
                      <p className="text-xs text-txt-tertiary mt-2 leading-relaxed">
                        <span className="text-txt-secondary font-medium">Save</span> moves the sheet to Drive trash. <span className="text-txt-secondary font-medium">Save &amp; keep</span> leaves it open. <span className="text-txt-secondary font-medium">Delete</span> tosses the sheet without saving anything.
                      </p>
                    </section>

                    {/* TROUBLESHOOTING — recovery only */}
                    <section className="pt-2 border-t border-surface-4 flex items-center gap-5 justify-center flex-wrap">
                      <button
                        onClick={handleRegenerateSheet}
                        disabled={syncing || deletingSheet || regenerating}
                        className="text-xs text-txt-tertiary hover:text-[color:var(--accent-error)] transition-colors disabled:opacity-60 underline decoration-dotted underline-offset-4"
                      >
                        {regenerating ? 'Regenerating…' : 'Regenerate sheet'}
                      </button>
                      {!isMobile && (
                        <button
                          onClick={() => {
                            const newValue = !useEmbedded
                            setUseEmbedded(newValue)
                            localStorage.setItem('sheetEmbedPreference', newValue.toString())
                          }}
                          className="text-xs text-txt-tertiary hover:text-txt-primary transition-colors underline decoration-dotted underline-offset-4"
                        >
                          Try embedded view (beta)
                        </button>
                      )}
                    </section>

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
