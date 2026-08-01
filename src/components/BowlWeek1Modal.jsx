import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import SheetToolbar from './SheetToolbar'
import SheetModalAIHero from './ui/SheetModalAIHero'
import SheetManualEntry from './ui/SheetManualEntry'
import SheetModalFooter from './ui/SheetModalFooter'
import AuthErrorModal from './AuthErrorModal'
import { useAuthErrorHandler } from '../hooks/useAuthErrorHandler'
import {
  createBowlWeek1Sheet,
  readBowlGamesFromSheet,
  deleteGoogleSheet,
  getSheetEmbedUrl,
  getCFPFirstRoundGameName,
  isBowlInWeek1,
  getBowlGamesList,
} from '../services/sheetsService'
import { getCurrentTeamTid, getCurrentTeamAbbr, getGameTeamInfo, TEAMS, getTeamNameLabel } from '../data/teamRegistry'
import { CFP_BRACKET_SLOTS } from '../data/cfpConstants'
import { getModalColors } from '../utils/colorUtils'
import { buildAIPrompt } from '../utils/aiPrompt'
import SheetLoadingHint from './SheetLoadingHint'
import LocalDataEntry from './ui/LocalDataEntry'
import { splitTsv } from '../utils/tsvParse'

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

// Rankings week slots: 16=CCG, 17=BowlWk1, 18=BowlWk2, 19=CFP Semis, 20=NatChamp
const RANK_WEEK_OPTIONS = [
  { value: 16, label: 'Conf Champ Week' },
  { value: 17, label: 'Bowl Week 1' },
  { value: 18, label: 'Bowl Week 2' },
  { value: 19, label: 'Bowl Week 3 (CFP Semis)' },
  { value: 20, label: 'National Championship' },
]

export default function BowlWeek1Modal({ isOpen, onClose, onSave, currentYear, teamColors }) {
  const { currentDynasty, saveRankings } = useDynasty()
  const { user } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const modalColors = useMemo(() => getModalColors(teamColors), [teamColors])
  const [syncing, setSyncing] = useState(false)
  const [deletingSheet, setDeletingSheet] = useState(false)
  const [creatingSheet, setCreatingSheet] = useState(false)
  const [sheetId, setSheetId] = useState(null)
  const [showDeletedNote, setShowDeletedNote] = useState(false)
  const auth = useAuthErrorHandler()
  const [isMobile, setIsMobile] = useState(false)
  // Local paste is the DEFAULT; the Google Sheet flow is the opt-in fallback.
  const [useLocal, setUseLocal] = useState(true)
  const [useEmbedded, setUseEmbedded] = useState(() => localStorage.getItem('sheetEmbedPreference') === 'true')
  const [highlightSave, setHighlightSave] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const creatingSheetRef = useRef(false)
  const creationAttemptedRef = useRef(false)
  const lastRetryCountRef = useRef(auth.retryCount)

  // Rankings week — default to the current dynasty postseason week slot
  // (same pattern as WeeklyScoresModal). In postseason week N the poll
  // that comes out corresponds to slot 16+N, so when in BW2 the rankings
  // should land in slot 18 by default, not slot 17.
  const effectiveRankWeek = (() => {
    const phase = currentDynasty?.currentPhase
    const week = Number(currentDynasty?.currentWeek)
    if (phase === 'postseason' && Number.isFinite(week)) return 16 + week
    return 17
  })()
  const [rankWeek, setRankWeek] = useState(effectiveRankWeek)
  useEffect(() => {
    if (isOpen) setRankWeek(effectiveRankWeek)
  }, [isOpen, effectiveRankWeek])

  // Excluded games — only the user's own CFP First Round game gets pulled
  // out of the sheet, because the user enters that game with full detail
  // (quarters, ranks, box score) through the regular game editor. Every
  // OTHER bowl game stays in the sheet on every open so users can see /
  // edit any matchup; rows that already have data are pre-filled from
  // existingBowlWeek1 below and round-trip safely thanks to
  // saveCPUBowlGames' blank-row-preserves-existing logic.
  const excludedBowlGames = useMemo(() => {
    const cfpSeeds = currentDynasty?.cfpSeedsByYear?.[currentYear] || []
    const userTeamTid = getCurrentTeamTid(currentDynasty)
    const userCFPSeed = cfpSeeds.find(s => s.tid === userTeamTid)?.seed || null
    const excluded = []
    if (userCFPSeed >= 5 && userCFPSeed <= 12) {
      const cfpGameName = getCFPFirstRoundGameName(userCFPSeed)
      if (cfpGameName) excluded.push(cfpGameName)
    }
    return excluded
  }, [currentDynasty, currentYear])

  // Prior Top 25 reference (post-CCG poll = rankByWeek slot 15) so the AI can
  // reason about which ranked teams aren't playing in Bowl Week 1. If that slot
  // is sparse, fall back to the most recent slot holding a (near-)complete poll
  // so the AI still gets a full 25 to carry forward.
  const prevWeekTop25Block = useMemo(() => {
    if (!currentDynasty) return ''
    const yearNum = Number(currentYear)
    const teams = currentDynasty.teams || {}
    const priorSlot = (Number.isFinite(effectiveRankWeek) ? effectiveRankWeek : 17) - 1
    const buildForSlot = (slot) => {
      const slotMap = new Map()
      for (const team of Object.values(teams)) {
        const rbw = team?.byYear?.[yearNum]?.rankByWeek ?? team?.byYear?.[String(yearNum)]?.rankByWeek
        if (!rbw) continue
        const v = rbw[slot] ?? rbw[String(slot)]
        if (typeof v !== 'number' || v < 1 || v > 25) continue
        if (!slotMap.has(v)) slotMap.set(v, getTeamNameLabel(teams, team.tid) || team.abbr)
      }
      return slotMap
    }
    let best = new Map()
    for (let slot = priorSlot; slot >= 0; slot--) {
      const m = buildForSlot(slot)
      if (m.size > best.size) best = m
      if (best.size >= 25) break
    }
    if (best.size === 0) return ''
    const lines = []
    for (let r = 1; r <= 25; r++) {
      const abbr = best.get(r)
      if (abbr) lines.push(`  #${r} ${abbr}`)
    }
    return lines.join('\n')
  }, [currentDynasty, currentYear, effectiveRankWeek])

  // The EXACT row-by-row table the sheet uses for column A. Built per
  // open so excludes (user's own CFP First Round game) and dynasty-
  // specific CFP team abbreviations are baked in. The AI needs to see
  // this ONCE, not infer from "alphabetical order" — that's where the
  // misalignment was coming from: it would interleave 25 regular bowls
  // and 4 CFP rows in its own order, hallucinate teams for CFP rows,
  // and shift everything else down a row.
  const bw1RowTable = useMemo(() => {
    const cfpSeeds = currentDynasty?.cfpSeedsByYear?.[currentYear] || []
    const teams = currentDynasty?.teams || TEAMS
    const nameFromTid = (tid) => {
      if (tid == null) return null
      return getTeamNameLabel(teams, tid) || getGameTeamInfo(teams, tid)?.abbr || null
    }
    const seedToName = (seed) => {
      const entry = cfpSeeds.find(s => s.seed === seed)
      return entry ? (nameFromTid(entry.tid) || entry.team || null) : null
    }
    const cfpHintFor = (bowl) => {
      const m = bowl.match(/^CFP First Round \(#(\d+) vs #(\d+)\)$/)
      if (!m) return ''
      const high = Number(m[1])
      const low = Number(m[2])
      const t1 = seedToName(high)
      const t2 = seedToName(low)
      if (t1 && t2) {
        return `Team 1 = ${t1} (#${high} seed, host) Team 2 = ${t2} (#${low} seed)`
      }
      return `Team 1 = #${high} seed (host) Team 2 = #${low} seed  — read teams off your screenshot`
    }
    const allBowls = getBowlGamesList()
    const filtered = allBowls.filter(b => !excludedBowlGames.includes(b))
    const maxNameLen = Math.max(...filtered.map(b => b.length))
    return filtered.map((bowl, i) => {
      const rowNum = String(i + 1).padStart(2, ' ')
      const sheetRow = String(i + 2).padStart(2, ' ')
      const hint = cfpHintFor(bowl)
      const namePadded = bowl.padEnd(maxNameLen, ' ')
      return hint
        ? `  ${rowNum} (sheet row ${sheetRow}) | ${namePadded} | ${hint}`
        : `  ${rowNum} (sheet row ${sheetRow}) | ${namePadded} |`
    }).join('\n')
  }, [currentDynasty, currentYear, excludedBowlGames])

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} Bowl Week 1 Results`,
    structure: `This sheet has ONE tab: "Bowl Games". It contains ${29 - excludedBowlGames.length} rows (29 total Bowl Week 1 slots minus ${excludedBowlGames.length} excluded).${excludedBowlGames.length > 0 ? `

⚠️ GAMES NOT IN THIS SHEET — you may see the following in your screenshots, but there is NO row for them. Ignore them completely. Do NOT output a row for them:
${excludedBowlGames.map(g => `  • ${g}`).join('\n')}` : ''}

The sheet's pre-filled column A rows are the ONLY rows you output — match them exactly.

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. OUTPUT COLUMNS B, C, D, E, F, G ONLY (6 values per row). Column A (Bowl Game) is PROTECTED and pre-filled.
2. ROW ORDER IS FIXED — match the screenshot EXACTLY. Each row is keyed to the pre-filled Bowl Game name in column A. Never reorder, never rename, never add rows, never remove rows.
3. Output ONE row per bowl shown in the screenshot, with EXACTLY 6 tab-separated values per row.
4. NO COMMAS in numbers. "24" never "1,234".
5. INTEGERS ONLY for scores — no decimals, no "pts".
6. TEAM NAMES ONLY (columns B and D) — use the TEAM NAMES list below. Columns B and D are strict dropdowns — wrong text is rejected by the sheet.
7. RANKS (columns C and E): integer 1–25 if the team is ranked at the time of the bowl, BLANK if unranked. Rankings appear as a number prefix on the team name in the scores list (e.g. "12 Georgia" = Georgia is #12). No prefix = unranked = leave blank. Never write "NR" or "—".
8. BLANK CELLS if unknown. Never guess, never use "N/A", "TBD", dash. Zero is only valid if the team truly scored zero.
   - Bowl not yet played: leave all 6 cells blank (6 empty tab-separated fields).
   - Teams known, scores not: fill B–E only; leave F and G blank.
9. No header row, no Bowl Game text, no winner column, no commentary INSIDE the data.
10. ONE TSV block — output ONLY the fenced block, nothing before or after it.

═══════════════════════════════════════════════════════════
SECTION: "Bowl Games" — ${29 - excludedBowlGames.length} rows × 6 editable columns
═══════════════════════════════════════════════════════════

═══════════════════════════════════════════════════════════
EXACT ROW ORDER — this is the ground truth, NOT alphabetical inference
═══════════════════════════════════════════════════════════
Output ${29 - excludedBowlGames.length} TSV lines, ONE per row below, in this EXACT order. Line N
of your output lands in sheet row N+1 (paste starts at B2). Do NOT
reorder, do NOT alphabetize, do NOT skip rows, do NOT add rows. The
"CFP First Round" rows in the middle of this table are PLAYOFF GAMES,
not bowl games — their column-A names are literally "CFP First Round
(#8 vs #9)" etc., and the right-hand column below names the exact
teams that play in each one.

  # (sheet row) | Column A (PROTECTED pre-fill)         | Required Team 1 / Team 2 for CFP rows
  ------------- + ------------------------------------- + ----------------------------------------
${bw1RowTable}

For each row, output 6 tab-separated values in this exact column order:

Col A (PROTECTED)    | Col B (Team 1) | Col C (T1 Rank) | Col D (Team 2) | Col E (T2 Rank) | Col F (T1 Score) | Col G (T2 Score)
---------------------+----------------+-----------------+----------------+-----------------+------------------+------------------
pre-filled bowl name | team abbr      | rank or blank   | team abbr      | rank or blank   | integer          | integer

Column B, Column D: STRICT dropdown of team names — use ONLY values from the TEAM NAMES list at the bottom of this prompt.
Column C, Column E: integer rank 1–25 if ranked, BLANK if unranked. Read directly from the number prefix shown on the team name in the screenshot.
Column F, Column G: integer score (0 or higher), no commas, no decimal point.

For CFP First Round rows, the team names are PRE-DETERMINED by
this dynasty's playoff seeds — use the EXACT team names shown in the
right-hand column of the row table above. Team 1 (column B) is always
the higher seed (smaller number, the host); Team 2 (column D) is the
lower seed. Do NOT swap, do NOT substitute real-world matchups.

═══════════════════════════════════════════════════════════
PRIOR-WEEK TOP 25 — entering Bowl Week 1 (post-CCG poll)
═══════════════════════════════════════════════════════════
These teams were ranked BEFORE Bowl Week 1 started. Use this as your
baseline to determine the new ranks for teams NOT playing in Bowl Week 1.

${prevWeekTop25Block || '  (no prior-week Top 25 stored — infer non-playing ranks from any poll visible in screenshots)'}

═══════════════════════════════════════════════════════════
NON-PLAYING RANKED TEAMS — paste BELOW the game rows (critical, read carefully)
═══════════════════════════════════════════════════════════
The bowl screenshots only show teams that PLAYED in Bowl Week 1. A ranked
team with NO Bowl Week 1 game (its bowl is a later week, or it's a CFP team
on a bye) still holds a poll rank but never appears in the game rows above.
This block is ONLY for those non-playing ranked teams — so the game-row
ranks PLUS this block together cover the full Top 25.

DO NOT list a team here if it appears in a REGULAR (non-CFP) bowl game row
above — its AP rank is already captured on that row (Col C / Col E), and
repeating it here double-counts it. Example: Kentucky played the Gasparilla
Bowl ranked #21, so #21 goes on the Gasparilla Bowl row and Kentucky is NOT
in this block.

CFP PLAYOFF TEAMS ARE THE EXCEPTION: a "CFP First Round" row shows each team's
SEED (1–12), NOT its AP rank (e.g. a #5 seed may be AP #2). So CFP teams DO
belong in this block with their real AP rank from the poll — the seed on their
game row is not their ranking.

HOW TO BUILD THIS BLOCK:
  STEP 1 — From the PRIOR-WEEK TOP 25 above, list every ranked team (call it P).
  STEP 2 — Cross off every team in P that appears in a REGULAR (non-CFP) bowl
           row above — its AP rank is already on that game row. Do NOT cross
           off CFP teams: their game row shows a seed, not their AP rank, so
           they stay here. Every remaining team in P — non-playing teams AND
           CFP teams — goes in this block.
  STEP 3 — Find the rank slots NOT already claimed by a REGULAR bowl team's
           game-row AP rank, and assign each remaining team to one unfilled slot:
             • By default a team holds its prior rank.
             • Drop it a slot if a team below won big and leapfrogged; move it
               up if teams above it lost.
           Regular-bowl game-row ranks ∪ this block must equal {1,2,…,25}:
           every rank exactly once, no gaps, no duplicates, no rank shared
           with a regular-bowl team.

For each team in this block, output ONE row:
  • Leave Col A BLANK (no bowl name)
  • Col B = team name (from the TEAM NAMES list)
  • Col C = their AP rank (1–25)
  • Cols D–G = leave blank

Format: <TeamAbbr>\\t<Rank>\\t\\t\\t\\t
(team, tab, rank, then 4 blank tabs — NO leading tab.)

Only list teams that WERE ranked in the Prior-Week Top 25 above. If every
ranked team already shows its AP rank on a regular bowl row, emit NO rows
here. If no prior-week poll was provided above, skip this block entirely —
do NOT invent rankings.

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== BOWL GAMES ===
<row1 Team1>\\t<row1 T1Rank>\\t<row1 Team2>\\t<row1 T2Rank>\\t<row1 T1Score>\\t<row1 T2Score>
<row2 Team1>\\t<row2 T1Rank>\\t<row2 Team2>\\t<row2 T2Rank>\\t<row2 T1Score>\\t<row2 T2Score>
... (one row per bowl in the screenshot, in the screenshot's order)
\\t\\t\\t\\t\\t\\t           ← blank separator row (6 tabs)
<nonPlayingTeam1>\\t<rank1>\\t\\t\\t\\t
<nonPlayingTeam2>\\t<rank2>\\t\\t\\t\\t
... (one row per NON-PLAYING ranked team only — omit any team that has a game row above)

(Each \\t above represents a LITERAL TAB character — use actual tab characters in your output, not the text "\\t".)

═══════════════════════════════════════════════════════════
FINAL CHECK before you send the answer
═══════════════════════════════════════════════════════════
[ ] Row count matches the number of bowl rows shown in the screenshot exactly (${29 - excludedBowlGames.length} rows)
[ ] Row order matches the screenshot's pre-filled Bowl Game column top-to-bottom
[ ] Exactly 6 tab-separated values per game row (5 tab characters per line)
[ ] Columns B and D are team NAMES only, from the TEAM NAMES list
[ ] Columns C and E are ranks (1–25) or BLANK — never "NR", never guessed
[ ] Scores are INTEGERS only — no commas, no decimals, no "pts"
[ ] For CFP First Round rows: used the exact team names from the right-hand column of the EXACT ROW ORDER table above (not real-world matchups, not guessed); Team 1 = higher seed (host), Team 2 = lower seed
[ ] Line N of my output corresponds to row N+1 of the sheet exactly per the row table — I did NOT re-alphabetize or reorder
[ ] Blank cells for any unknown scores or unplayed bowls — invented nothing
[ ] Bottom block = ranked teams whose AP rank is NOT on a regular bowl row: non-playing teams PLUS CFP teams (CFP rows show a seed, not the AP rank)
[ ] No team appears in BOTH a REGULAR bowl row and the bottom block — regular-bowl teams' AP ranks live on their game row only (e.g. #21 Kentucky on the Gasparilla Bowl row, NOT in the block)
[ ] Bottom-block rows have blank Col A, team abbr in Col B, rank in Col C
[ ] Regular-bowl game-row ranks + bottom-block ranks together cover 1–25 — no gaps, no duplicates, no collisions
[ ] No header row, no bowl name text, no winner column INSIDE the data.`,
    includeTeamMap: true,
    dynastyTeams: currentDynasty?.teams,
  }), [currentYear, currentDynasty?.teams, excludedBowlGames, prevWeekTop25Block, bw1RowTable])

  // LOCAL-PASTE prompt: SELF-DESCRIBING rows. Every game row LEADS with its
  // exact bowl name (the identity the save matches on) — so there is NO
  // pre-filled column to align against and NO fixed row order. Poll rows lead
  // with a POLL sentinel (because splitTsv drops the blank separator the sheet
  // used to mark the poll block). The import reshapes both back into the
  // parser's column layout.
  const localAiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} Bowl Week 1 Results`,
    structure: `You produce TWO kinds of SELF-DESCRIBING lines: GAME lines (each LEADS with its exact bowl name) and POLL lines (each LEADS with the word POLL). There is NO pre-filled column and NO fixed row order — every line carries its own identity.${excludedBowlGames.length > 0 ? `

⚠️ GAMES TO IGNORE — you may see these in your screenshots, but do NOT output a line for them:
${excludedBowlGames.map(g => `  • ${g}`).join('\n')}` : ''}

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. GAME line — EXACTLY 7 tab-separated fields: BowlName<TAB>Team1<TAB>Team1Rank<TAB>Team2<TAB>Team2Rank<TAB>Team1Score<TAB>Team2Score.
2. POLL line — EXACTLY 3 tab-separated fields: POLL<TAB>Rank<TAB>TeamAbbr (the literal word POLL as the first field).
3. NO header row. NO blank lines. NO commentary, totals, or labels INSIDE the data.
4. OMIT any bowl whose result you cannot see — do NOT pad, do NOT guess, do NOT invent scores. A bowl with no line is left unchanged.
5. BowlName MUST be one of the EXACT pre-defined bowl names listed in the BOWL NAMES table below — copy it CHARACTER-FOR-CHARACTER, including any "CFP First Round (#5 vs #12)" style suffix. This name is the ONLY identifier for the game.
6. Team1 / Team2 are team names from the TEAM NAMES list at the bottom — NEVER an abbreviation, nickname, mascot, or city.
7. Team1Rank / Team2Rank: integer 1–25 if the team is ranked at bowl time, BLANK if unranked. Read off the number prefix on the team name. Never "NR" or "—".
8. Team1Score / Team2Score: integers (no commas, no decimals, no "pts"). If teams are known but scores aren't, leave both score fields blank (still keep all 7 fields / 6 tabs).
9. For "CFP First Round" rows, use the exact team names shown in the BOWL NAMES table's right-hand hint column. Team 1 = higher seed (host), Team 2 = lower seed. Do NOT swap or substitute real-world matchups.
10. POLL lines are ONLY for ranked teams whose AP rank does NOT appear on a REGULAR (non-CFP) game line above. CFP teams DO get a POLL line (their game line shows a SEED, not the AP rank). Do not duplicate a regular-bowl team in a POLL line.

═══════════════════════════════════════════════════════════
BOWL NAMES — copy column A exactly (identity for each game line)
═══════════════════════════════════════════════════════════
${bw1RowTable}

═══════════════════════════════════════════════════════════
PRIOR-WEEK TOP 25 — entering Bowl Week 1 (post-CCG poll)
═══════════════════════════════════════════════════════════
These teams were ranked BEFORE Bowl Week 1. Use as the baseline for POLL lines (ranks for teams not on a regular game line).

${prevWeekTop25Block || '  (no prior-week Top 25 stored — emit POLL lines only for ranks clearly visible in screenshots, otherwise omit them)'}

═══════════════════════════════════════════════════════════
PER-LINE OUTPUT
═══════════════════════════════════════════════════════════
GAME:  <BowlName><TAB><Team1><TAB><Team1Rank><TAB><Team2><TAB><Team2Rank><TAB><Team1Score><TAB><Team2Score>
POLL:  POLL<TAB><Rank><TAB><TeamAbbr>

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== BOWL WEEK 1 ===
<BowlName>\\t<Team1>\\t<Team1Rank>\\t<Team2>\\t<Team2Rank>\\t<Team1Score>\\t<Team2Score>
…one GAME line per bowl you can see; omit unknowns entirely
POLL\\t<Rank>\\t<TeamAbbr>
…one POLL line per ranked team NOT already on a regular game line (include CFP teams); omit if no prior-week poll

(Each \\t above represents a LITERAL TAB character — use actual tab characters, not the text "\\t".)

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] Every GAME line has exactly 7 tab-separated fields (six tabs) and LEADS with an exact bowl name from the BOWL NAMES table
[ ] Every POLL line has exactly 3 fields: the literal word POLL, then rank, then team abbr
[ ] Team values are team names from the TEAM NAMES list
[ ] Ranks are 1–25 or blank; scores are integers with no commas or decimals
[ ] CFP First Round lines use the exact teams from the hint column; Team1 = higher seed (host)
[ ] No team is on BOTH a regular game line and a POLL line; CFP teams appear on a POLL line with their AP rank
[ ] No blank lines, no header row, no commentary — only games you can see and the poll lines that complete the Top 25`,
    includeTeamMap: true,
    dynastyTeams: currentDynasty?.teams,
  }), [currentYear, currentDynasty?.teams, excludedBowlGames, prevWeekTop25Block, bw1RowTable])

  // Local paste import. The AI emits SELF-DESCRIBING lines:
  //   GAME: BowlName<TAB>Team1<TAB>T1Rank<TAB>Team2<TAB>T2Rank<TAB>T1Score<TAB>T2Score
  //   POLL: POLL<TAB>Rank<TAB>TeamAbbr
  // The parser (readBowlGamesFromSheet) detects games by NON-empty col A and
  // poll rows by EMPTY col A (abbr in col B, rank in col C), and the save keys
  // games by BOWL NAME (identity). So GAME rows pass straight through (bowl
  // name already in col A), and POLL rows are reshaped POLL/Rank/Team →
  // ['', Team, Rank] to recreate the empty-col-A poll layout the parser reads.
  const handleLocalImport = async (text) => {
    const splitRows = splitTsv(text)
    const rows = splitRows.map(row => {
      if (row[0] === 'POLL') {
        return ['', row[2] || '', row[1] || '']
      }
      return row
    })
    const bowlGames = await readBowlGamesFromSheet(null, (currentDynasty?.teams || currentDynasty?.customTeams), { rows })

    // Save post-bowl poll rankings if the AI included them (mirrors handleSave).
    const pollEntries = bowlGames.pollEntries || []
    if (pollEntries.length > 0 && currentDynasty?.id) {
      try {
        await saveRankings(currentDynasty.id, pollEntries, currentYear, rankWeek)
      } catch (e) {
        console.error('Failed to save bowl week 1 rankings:', e)
      }
    }

    await onSave(bowlGames)
    onClose()
  }

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
    if (auth.retryCount !== lastRetryCountRef.current) {
      lastRetryCountRef.current = auth.retryCount
      creationAttemptedRef.current = false
    }

    const createSheet = async () => {
      // Don't create a Google Sheet while the local paste path is active.
      if (isOpen && !useLocal && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote && !creationAttemptedRef.current) {
        creationAttemptedRef.current = true
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          const cfpSeeds = currentDynasty?.cfpSeedsByYear?.[currentYear] || []
          const excludeGames = []

          const userTeamTid = getCurrentTeamTid(currentDynasty)
          const userTeamAbbr = getCurrentTeamAbbr(currentDynasty) || ''
          const userCFPSeed = cfpSeeds.find(s => s.tid === userTeamTid)?.seed || null
          if (userCFPSeed >= 5 && userCFPSeed <= 12) {
            const cfpGameName = getCFPFirstRoundGameName(userCFPSeed)
            if (cfpGameName) excludeGames.push(cfpGameName)
          }
          // Already-entered Week 1 bowls stay IN the sheet (pre-filled
          // with their existing data via existingBowlWeek1 below). The
          // earlier "exclude every already-entered bowl" behavior left
          // re-opened sheets showing only the 4 CFP First Round rows —
          // user couldn't see/edit any of the bowls they'd previously
          // saved. Round-trip safety lives in saveCPUBowlGames now (blank
          // rows preserve existing entries; replacements keep rich fields).

          // Pre-fill uses team ABBR strings (the sheet's dropdowns are
          // abbr-keyed), so resolve every game's tid → current abbr from
          // dynasty.teams. Falls through to legacy g.team1/g.team2 only
          // when no tid is set, which covers ancient pre-tid games.
          const teamsForResolve = currentDynasty?.teams || currentDynasty?.customTeams || TEAMS
          const abbrFromTid = (tid) => {
            if (tid == null) return null
            const info = getGameTeamInfo(teamsForResolve, tid)
            return info?.abbr || null
          }

          const legacyBowlWeek1 = currentDynasty?.bowlGamesByYear?.[currentYear]?.week1 || []
          const unifiedBowlGames = (currentDynasty?.games || [])
            .filter(g => {
              if (Number(g.year) !== currentYear) return false
              const isBowl = g.gameType === 'bowl' || (g.bowlName && !g.bowlName.includes('CFP'))
              if (!isBowl) return false
              return isBowlInWeek1(g.bowlName)
            })
            .map(g => {
              if (g.opponent) {
                return { bowlName: g.bowlName, team1: g.userTeam || userTeamAbbr, team2: g.opponent, team1Score: g.teamScore, team2Score: g.opponentScore }
              }
              return {
                bowlName: g.bowlName,
                team1: abbrFromTid(g.team1Tid) || g.team1,
                team2: abbrFromTid(g.team2Tid) || g.team2,
                team1Score: g.team1Score,
                team2Score: g.team2Score,
              }
            })

          const existingBowlWeek1 = [...legacyBowlWeek1]
          unifiedBowlGames.forEach(ug => {
            const idx = existingBowlWeek1.findIndex(eb => eb.bowlName === ug.bowlName)
            if (idx >= 0) existingBowlWeek1[idx] = ug
            else existingBowlWeek1.push(ug)
          })

          const allGames = currentDynasty?.games || []
          const existingCFPFirstRound = allGames
            .filter(g => g && (g.gameType === 'cfp_first_round' || g.isCFPFirstRound) && Number(g.year) === Number(currentYear))
            .map(g => {
              // CFP First Round shells from createOrUpdateCFPGameShells
              // don't carry seed1/seed2 directly — those live on cfpSlot
              // via CFP_BRACKET_SLOTS[slot].higherSeed/lowerSeed. The
              // sheet's getExistingBowlData matches the row's expected
              // seed pair (e.g. 8 vs 9) to the stored game by seed1/2,
              // so without this fallback the lookup fails and the
              // scores never pre-fill — exactly the symptom the user
              // hit (teams resolved via seeds, but the score columns
              // stayed blank because the matcher never found the game).
              const slotCfg = g.cfpSlot ? CFP_BRACKET_SLOTS[g.cfpSlot] : null
              const seed1 = g.seed1 ?? slotCfg?.higherSeed ?? null
              const seed2 = g.seed2 ?? slotCfg?.lowerSeed ?? null
              return {
                seed1,
                seed2,
                team1: abbrFromTid(g.team1Tid) || g.team1,
                team2: abbrFromTid(g.team2Tid) || g.team2,
                team1Score: g.team1Score,
                team2Score: g.team2Score,
                winner: g.winner,
              }
            })

          const sheetInfo = await createBowlWeek1Sheet(
            currentDynasty?.teamName || 'Dynasty',
            currentYear,
            cfpSeeds,
            excludeGames,
            existingBowlWeek1,
            existingCFPFirstRound,
            currentDynasty?.teams || currentDynasty?.customTeams,
          )
          setSheetId(sheetInfo.spreadsheetId)
        } catch (error) {
          console.error('Failed to create bowl sheet:', error)
          auth.handleError(error)
        } finally {
          setCreatingSheet(false)
          creatingSheetRef.current = false
        }
      }
    }
    createSheet()
  }, [isOpen, useLocal, user, sheetId, currentDynasty?.id, auth.retryCount, showDeletedNote])

  useEffect(() => {
    if (!isOpen) {
      setShowDeletedNote(false)
      creatingSheetRef.current = false
      creationAttemptedRef.current = false
      setSheetId(null)
      setUseLocal(true)
    }
  }, [isOpen])

  const handleSave = async (alsoDelete) => {
    if (!sheetId) return
    if (alsoDelete) setDeletingSheet(true); else setSyncing(true)
    try {
      const bowlGames = await readBowlGamesFromSheet(sheetId, currentDynasty?.teams || currentDynasty?.customTeams)

      // Save post-bowl poll rankings if the AI included them
      const pollEntries = bowlGames.pollEntries || []
      if (pollEntries.length > 0 && currentDynasty?.id) {
        try {
          await saveRankings(currentDynasty.id, pollEntries, currentYear, rankWeek)
        } catch (e) {
          console.error('Failed to save bowl week 1 rankings:', e)
        }
      }

      await onSave(bowlGames)

      if (alsoDelete) {
        try { await deleteGoogleSheet(sheetId) } catch (e) { console.error('Failed to delete sheet:', e) }
        setSheetId(null)
        setShowDeletedNote(true)
        setTimeout(() => onClose(), 2500)
      } else {
        onClose()
      }
    } catch (error) {
      console.error('Error saving bowl week 1:', error)
      if (!auth.handleError(error)) {
        toast.error(`Failed to sync: ${error.message || 'Unknown error'}`)
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
      title: 'Delete this bowl week 1 sheet?',
      message: 'This deletes the Google Sheet without applying any edits. Your dynasty bowl game results stay as-is.',
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
        toast.error('Failed to delete the sheet. Try again.')
      }
    } finally {
      setDeletingSheet(false)
    }
  }

  if (!isOpen) return null

  const embedUrl = sheetId ? getSheetEmbedUrl(sheetId, 'Bowl Games') : null
  const isLoading = creatingSheet

  const rankWeekSelect = (
    <select
      id="bw1-rank-week"
      value={rankWeek}
      onChange={(e) => setRankWeek(Number(e.target.value))}
      disabled={syncing || deletingSheet}
      className="px-3 py-2 rounded-md bg-surface-2 border border-surface-4 hover:border-surface-5 text-txt-primary text-sm font-medium tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-3 disabled:opacity-60 transition-colors"
    >
      {RANK_WEEK_OPTIONS.map(({ value, label }) => (
        <option key={value} value={value}>{label}</option>
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
          useEmbedded ? 'sm:w-[95vw] sm:h-[95dvh]' : 'sm:max-w-[680px] sm:h-auto'
        }`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-7 py-4 border-b border-surface-4">
          <div className="flex flex-col">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-txt-tertiary mb-0.5">Postseason</span>
            <h2 className="text-xl sm:text-2xl font-bold text-txt-primary tracking-tight tabular-nums">
              {currentYear} Bowl Week 1
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
            <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-5">
              <LocalDataEntry
                aiPrompt={localAiPrompt}
                onImport={handleLocalImport}
                onUseGoogle={() => setUseLocal(false)}
                onCancel={onClose}
                importLabel="Import Bowl Week 1"
              >
                <section className="text-center">
                  <label htmlFor="bw1-rank-week" className="label-xs text-txt-tertiary block mb-2">
                    Rankings week
                  </label>
                  <div className="flex justify-center">
                    {rankWeekSelect}
                  </div>
                  <p className="text-xs text-txt-tertiary mt-2 leading-relaxed">
                    The Top 25 the AI extracts from your screenshot lands in this week's poll slot.
                  </p>
                </section>
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
                  tagline="Skip the typing. Let AI fill the bowl results."
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

                    <label htmlFor="bw1-rank-week" className="label-xs text-txt-tertiary">
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

                  <div className="flex-1 flex flex-col overflow-hidden min-h-0 border border-surface-4 rounded-lg mx-5 sm:mx-7 my-3">
                    <SheetToolbar sheetId={sheetId} embedUrl={embedUrl} teamColors={teamColors} title="Bowl Week 1" />
                  </div>

                  <div className="px-5 sm:px-7 py-2 flex items-center justify-end">
                    <button
                      onClick={() => {
                        const v = !useEmbedded
                        setUseEmbedded(v)
                        localStorage.setItem('sheetEmbedPreference', v.toString())
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
                    <SheetManualEntry sheetId={sheetId} />

                    <section className="text-center">
                      <label htmlFor="bw1-rank-week" className="label-xs text-txt-tertiary block mb-2">
                        Rankings week
                      </label>
                      <div className="flex justify-center">
                        {rankWeekSelect}
                      </div>
                      <p className="text-xs text-txt-tertiary mt-2 leading-relaxed">
                        The Top 25 the AI extracts from your screenshot lands in this week's poll slot.
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
                        const v = !useEmbedded
                        setUseEmbedded(v)
                        localStorage.setItem('sheetEmbedPreference', v.toString())
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
