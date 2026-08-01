import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty, getUserGamePerspective } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import SheetToolbar from './SheetToolbar'
import SheetModalAIHero from './ui/SheetModalAIHero'
import SheetModalFooter from './ui/SheetModalFooter'
import SheetManualEntry from './ui/SheetManualEntry'
import AuthErrorModal from './AuthErrorModal'
import { useAuthErrorHandler } from '../hooks/useAuthErrorHandler'
import {
  createBowlWeek2Sheet,
  readBowlWeek2GamesFromSheet,
  deleteGoogleSheet,
  getSheetEmbedUrl,
  getCFPQuarterfinalGameName,
  isBowlInWeek2,
  getBowlGamesWeek2,
} from '../services/sheetsService'
import { getCurrentTeamAbbr, getCurrentTeamTid, TEAMS, getGameTeamInfo, getTeamNameLabel } from '../data/teamRegistry'
import { buildAIPrompt } from '../utils/aiPrompt'
import SheetLoadingHint from './SheetLoadingHint'
import LocalDataEntry from './ui/LocalDataEntry'
import { splitTsv } from '../utils/tsvParse'
import { DEFAULT_BOWL_CONFIG, CFP_NY6_BOWLS, CFP_BRACKET_SLOTS } from '../data/cfpConstants'

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

// Rankings week slots: 17=BowlWk1, 18=BowlWk2, 19=CFP Semis, 20=NatChamp
const RANK_WEEK_OPTIONS = [
  { value: 17, label: 'Bowl Week 1' },
  { value: 18, label: 'Bowl Week 2' },
  { value: 19, label: 'Bowl Week 3 (CFP Semis)' },
  { value: 20, label: 'National Championship' },
]

export default function BowlWeek2Modal({ isOpen, onClose, onSave, currentYear, teamColors }) {
  const { currentDynasty, updateDynasty, saveRankings } = useDynasty()
  const { user } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()
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

  // Rankings week — default to current dynasty postseason week slot.
  const effectiveRankWeek = (() => {
    const phase = currentDynasty?.currentPhase
    const week = Number(currentDynasty?.currentWeek)
    if (phase === 'postseason' && Number.isFinite(week)) return 16 + week
    return 18
  })()
  const [rankWeek, setRankWeek] = useState(effectiveRankWeek)
  useEffect(() => {
    if (isOpen) setRankWeek(effectiveRankWeek)
  }, [isOpen, effectiveRankWeek])

  // Semifinal host-bowl picks
  const computeSfDefaults = () => {
    const saved = currentDynasty?.cfpBowlConfigByYear?.[currentYear] || {}
    const qfBowls = new Set(['seed1', 'seed2', 'seed3', 'seed4'].map(k => saved[k]).filter(Boolean))
    const remaining = CFP_NY6_BOWLS.filter(b => !qfBowls.has(b))
    const [def1, def2] = remaining.length >= 2 ? remaining : [DEFAULT_BOWL_CONFIG.sf1, DEFAULT_BOWL_CONFIG.sf2]
    return { sf1: saved.sf1 || def1, sf2: saved.sf2 || def2 }
  }
  const [sfBowlConfig, setSfBowlConfig] = useState(computeSfDefaults)
  useEffect(() => {
    if (!isOpen) return
    setSfBowlConfig(computeSfDefaults())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentYear, currentDynasty?.cfpBowlConfigByYear])

  // Excluded games — only the user's own CFP Quarterfinal game gets
  // pulled out of the sheet (they enter it through the regular game
  // editor with full detail). Every other Bowl Week 2 game stays in the
  // sheet every time so users can see / edit any matchup; already-
  // entered rows are pre-filled from existingBowlWeek2 and round-trip
  // safely thanks to saveCPUBowlGames' blank-row-preserves-existing
  // logic.
  const excludedBowlGames = useMemo(() => {
    const cfpSeeds = currentDynasty?.cfpSeedsByYear?.[currentYear] || []
    const userTeamTid = getCurrentTeamTid(currentDynasty)
    const userTeamAbbr = getCurrentTeamAbbr(currentDynasty)
    const userCFPSeed = cfpSeeds.find(s => s.tid === userTeamTid)?.seed || null
    const cfpBowlConfigForExclude = currentDynasty?.cfpBowlConfigByYear?.[currentYear] || null
    const allGames = currentDynasty?.games || []
    const teams = currentDynasty?.teams || TEAMS
    const firstRoundResults = allGames
      .filter(g => g && (g.gameType === 'cfp_first_round' || g.isCFPFirstRound) && Number(g.year) === Number(currentYear))
      .map(g => {
        const t1 = g.team1Tid ? (getTeamNameLabel(teams, g.team1Tid) || getGameTeamInfo(teams, g.team1Tid)?.abbr || g.team1) : g.team1
        const t2 = g.team2Tid ? (getTeamNameLabel(teams, g.team2Tid) || getGameTeamInfo(teams, g.team2Tid)?.abbr || g.team2) : g.team2
        const winnerTid = g.winnerTid != null ? Number(g.winnerTid) : null
        const winner = (winnerTid ? getTeamNameLabel(teams, winnerTid) : null) || g.winner || (winnerTid ? getGameTeamInfo(teams, winnerTid)?.abbr : null)
        return { seed1: g.seed1, seed2: g.seed2, team1: t1, team2: t2, winner, winnerTid }
      })
    const excluded = []
    if (userCFPSeed) {
      if (userCFPSeed >= 1 && userCFPSeed <= 4) {
        const qf = getCFPQuarterfinalGameName(userCFPSeed, [], cfpBowlConfigForExclude)
        if (qf && !excluded.includes(qf)) excluded.push(qf)
      } else if (userCFPSeed >= 5 && userCFPSeed <= 12) {
        const userWon = firstRoundResults.find(g => {
          if (!g) return false
          if (userTeamTid != null && g.winnerTid != null) return Number(g.winnerTid) === Number(userTeamTid)
          return g.winner === userTeamAbbr
        })
        if (userWon) {
          const qf = getCFPQuarterfinalGameName(userCFPSeed, firstRoundResults, cfpBowlConfigForExclude)
          if (qf && !excluded.includes(qf)) excluded.push(qf)
        }
      }
    }
    return excluded
  }, [currentDynasty, currentYear])

  // Prior Top 25 reference for the AI's non-playing-team block. The immediate
  // prior poll (slot 16 for BW2) is usually SPARSE during bowls — the user only
  // re-confirms their own team's rank week to week, so reading slot 16 alone
  // often yields a single team. To still hand the AI a full Top 25 (so it can
  // carry every non-playing ranked team forward), fall back to the most recent
  // slot that holds a (near-)complete poll, scanning back through the bowl weeks
  // into the final regular-season / CCG poll.
  const prevWeekTop25Block = useMemo(() => {
    if (!currentDynasty) return ''
    const yearNum = Number(currentYear)
    const teamsData = currentDynasty.teams || {}
    const priorSlot = (Number.isFinite(effectiveRankWeek) ? effectiveRankWeek : 18) - 1
    const buildForSlot = (slot) => {
      const slotMap = new Map()
      for (const team of Object.values(teamsData)) {
        const rbw = team?.byYear?.[yearNum]?.rankByWeek ?? team?.byYear?.[String(yearNum)]?.rankByWeek
        if (!rbw) continue
        const v = rbw[slot] ?? rbw[String(slot)]
        if (typeof v !== 'number' || v < 1 || v > 25) continue
        if (!slotMap.has(v)) slotMap.set(v, getTeamNameLabel(teamsData, team.tid) || team.abbr)
      }
      return slotMap
    }
    // Walk back from the immediate prior slot and keep the fullest poll found.
    // Strict `>` keeps the most recent poll on ties; stop once we hit a full 25.
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

  // EXACT row-by-row table the sheet uses for column A — already
  // sorted by getBowlGamesWeek2 to interleave the user's QF bowls
  // alphabetically with the regular Week 2 bowls. Inline per-row CFP
  // QF matchup hints (Team 1 = first-round winner, Team 2 = bye seed)
  // mean the AI doesn't have to infer alphabetical position or invent
  // playoff matchups — the row table IS the answer.
  const bw2RowTable = useMemo(() => {
    const cfpSeeds = currentDynasty?.cfpSeedsByYear?.[currentYear] || []
    const teams = currentDynasty?.teams || TEAMS
    const cfg = currentDynasty?.cfpBowlConfigByYear?.[currentYear] || DEFAULT_BOWL_CONFIG
    const nameFromTid = (tid) => {
      if (tid == null) return null
      return getTeamNameLabel(teams, tid) || getGameTeamInfo(teams, tid)?.abbr || null
    }
    const seedToAbbr = (seed) => {
      const entry = cfpSeeds.find(s => s.seed === seed)
      return entry ? (nameFromTid(entry.tid) || entry.team || null) : null
    }

    // First-round winners by seed-pair, derived from games[].
    const frResults = (currentDynasty?.games || [])
      .filter(g => g && (g.gameType === 'cfp_first_round' || g.isCFPFirstRound) && Number(g.year) === Number(currentYear))
      .map(g => {
        const slotCfg = g.cfpSlot ? CFP_BRACKET_SLOTS[g.cfpSlot] : null
        const seed1 = g.seed1 ?? slotCfg?.higherSeed ?? null
        const seed2 = g.seed2 ?? slotCfg?.lowerSeed ?? null
        const winnerTid = g.winnerTid != null ? Number(g.winnerTid) : null
        // Prefer the tid-derived NAME; fall back to any stored winner string.
        let winnerAbbr = (winnerTid ? nameFromTid(winnerTid) : null) || g.winner || null
        if (!winnerAbbr && typeof g.team1Score === 'number' && typeof g.team2Score === 'number') {
          const winningTid = g.team1Score > g.team2Score ? g.team1Tid : g.team2Tid
          winnerAbbr = nameFromTid(winningTid) || null
        }
        return { seed1, seed2, winner: winnerAbbr }
      })
    const winnerForSeedPair = (high, low) => {
      const r = frResults.find(x =>
        (x.seed1 === high && x.seed2 === low) || (x.seed1 === low && x.seed2 === high)
      )
      return r?.winner || null
    }

    // Build a lookup: "<bowl-name-with-suffix>" → { byeSeed, frHigh, frLow }
    const qfMap = {
      [`${cfg.seed1 || DEFAULT_BOWL_CONFIG.seed1} (CFP QF)`]: { byeSeed: 1, frHigh: 8, frLow: 9 },
      [`${cfg.seed2 || DEFAULT_BOWL_CONFIG.seed2} (CFP QF)`]: { byeSeed: 2, frHigh: 7, frLow: 10 },
      [`${cfg.seed3 || DEFAULT_BOWL_CONFIG.seed3} (CFP QF)`]: { byeSeed: 3, frHigh: 6, frLow: 11 },
      [`${cfg.seed4 || DEFAULT_BOWL_CONFIG.seed4} (CFP QF)`]: { byeSeed: 4, frHigh: 5, frLow: 12 },
    }

    const cfpHintFor = (bowl) => {
      const m = qfMap[bowl]
      if (!m) return ''
      const byeAbbr = seedToAbbr(m.byeSeed)
      const winner = winnerForSeedPair(m.frHigh, m.frLow)
      if (byeAbbr && winner) {
        return `Team 1 = ${winner} (won #${m.frHigh} vs #${m.frLow}) Team 2 = ${byeAbbr} (#${m.byeSeed} seed, bye)`
      }
      if (byeAbbr) {
        return `Team 1 = winner of First Round #${m.frHigh} vs #${m.frLow} (read off screenshot) Team 2 = ${byeAbbr} (#${m.byeSeed} seed, bye)`
      }
      return `Team 1 = winner of First Round #${m.frHigh} vs #${m.frLow} Team 2 = #${m.byeSeed} seed (bye) — read teams off your screenshot`
    }

    const allBowls = getBowlGamesWeek2(cfg)
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

  const persistSfBowlConfig = async () => {
    if (!currentDynasty?.id) return
    if (sfBowlConfig.sf1 === sfBowlConfig.sf2) {
      toast.error('Each semifinal needs a different host bowl.')
      throw new Error('duplicate SF bowl')
    }
    const existingConfig = currentDynasty.cfpBowlConfigByYear || {}
    const existingYearConfig = existingConfig[currentYear] || {}
    const existingGames = currentDynasty.games || []
    const updatedGames = existingGames.map(g => {
      if (Number(g.year) !== Number(currentYear)) return g
      if (g.cfpSlot === 'cfpsf1' || (g.isCFPSemifinal && g.id?.includes('sf1'))) return { ...g, bowlName: sfBowlConfig.sf1 }
      if (g.cfpSlot === 'cfpsf2' || (g.isCFPSemifinal && g.id?.includes('sf2'))) return { ...g, bowlName: sfBowlConfig.sf2 }
      return g
    })
    const gamesChanged = updatedGames.some((g, i) => g !== existingGames[i])
    await updateDynasty(currentDynasty.id, {
      cfpBowlConfigByYear: { ...existingConfig, [currentYear]: { ...existingYearConfig, sf1: sfBowlConfig.sf1, sf2: sfBowlConfig.sf2 } },
      ...(gamesChanged ? { games: updatedGames } : {}),
    })
  }

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} Bowl Week 2 Results`,
    structure: `This sheet has ONE tab: "Bowl Games". It contains ${13 - excludedBowlGames.length} rows (13 total Bowl Week 2 slots minus ${excludedBowlGames.length} excluded). All bowl names are PRE-FILLED in column A and sorted ALPHABETICALLY. The CFP Quarterfinal rows have the suffix "(CFP QF)" in their bowl name.${excludedBowlGames.length > 0 ? `

⚠️ GAMES NOT IN THIS SHEET — you may see the following in your screenshots, but there is NO row for them. Ignore them completely. Do NOT output a row for them:
${excludedBowlGames.map(g => `  • ${g}`).join('\n')}` : ''}

The sheet's pre-filled column A rows are the ONLY rows you output — match them exactly.

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. OUTPUT COLUMNS B, C, D, E, F, G ONLY (6 values per row). Column A (Bowl Game) is PROTECTED and pre-filled.
2. ROW ORDER IS FIXED — match the screenshot EXACTLY (alphabetical order by bowl name). Each row is keyed to the pre-filled Bowl Game name in column A. Never reorder, never rename, never add rows, never remove rows.
3. Output ONE row per bowl shown in the screenshot, with EXACTLY 6 tab-separated values per row.
4. NO COMMAS in numbers. "24" never "1,234".
5. INTEGERS ONLY for scores — no decimals, no "pts".
6. TEAM NAMES ONLY (columns B and D) — use the TEAM NAMES list below. Columns B and D are strict dropdowns.
7. RANKS (columns C and E): integer 1–25 if the team is ranked at the time of the bowl, BLANK if unranked. Rankings appear as a number prefix on the team name in the scores list (e.g. "4 Alabama" = Alabama is #4). No prefix = unranked = leave blank. Never write "NR" or "—".
8. BLANK CELLS if unknown. Never guess, never use "N/A", "TBD", dash. Zero is only valid if the team truly scored zero.
9. No header row, no Bowl Game text, no winner column, no commentary INSIDE the data.
10. ONE TSV block — output ONLY the fenced block, nothing before or after it.

═══════════════════════════════════════════════════════════
SECTION: "Bowl Games" — ${13 - excludedBowlGames.length} rows × 6 editable columns
═══════════════════════════════════════════════════════════

═══════════════════════════════════════════════════════════
EXACT ROW ORDER — this is the ground truth, NOT alphabetical inference
═══════════════════════════════════════════════════════════
Output ${13 - excludedBowlGames.length} TSV lines, ONE per row below, in this EXACT order. Line N
of your output lands in sheet row N+1 (paste starts at B2). Do NOT
reorder, do NOT alphabetize on your own, do NOT skip rows, do NOT add
rows. Four rows in the middle are CFP Quarterfinal games (the column-A
name ends with "(CFP QF)") — the right-hand column below names the
exact teams that play in each one. Bowl traditions are IRRELEVANT to
which teams play in a CFP QF row; only the playoff bracket matters.

  # (sheet row) | Column A (PROTECTED pre-fill)         | Required Team 1 / Team 2 for CFP QF rows
  ------------- + ------------------------------------- + -----------------------------------------------
${bw2RowTable}

For each row, output 6 tab-separated values in this exact column order:

Col A (PROTECTED)    | Col B (Team 1) | Col C (T1 Rank) | Col D (Team 2) | Col E (T2 Rank) | Col F (T1 Score) | Col G (T2 Score)
---------------------+----------------+-----------------+----------------+-----------------+------------------+------------------
pre-filled bowl name | team abbr      | rank or blank   | team abbr      | rank or blank   | integer          | integer

Column B, Column D: STRICT dropdown of team names — use ONLY values from the TEAM NAMES list at the bottom of this prompt.
Column C, Column E: integer rank 1–25 if ranked, BLANK if unranked. Read directly from the number prefix shown on the team name in the screenshot.
Column F, Column G: integer score (0 or higher), no commas, no decimal point.

For "(CFP QF)" rows, the team names are PRE-DETERMINED by this
dynasty's playoff seeds — use the EXACT team names shown in the
right-hand column of the row table above. Team 1 (column B) is always
the First Round winner (the lower-seeded team that advanced); Team 2
(column D) is the bye seed (1–4). Do NOT swap, do NOT substitute
real-world matchups.

═══════════════════════════════════════════════════════════
PRIOR-WEEK TOP 25 — entering Bowl Week 2 (post-Bowl-Week-1 poll)
═══════════════════════════════════════════════════════════
These teams were ranked BEFORE Bowl Week 2 started. Use this as your
baseline to determine the new ranks for teams NOT playing in Bowl Week 2.

${prevWeekTop25Block || '  (no prior-week Top 25 stored — infer non-playing ranks from any poll visible in screenshots)'}

═══════════════════════════════════════════════════════════
NON-PLAYING RANKED TEAMS — paste BELOW the game rows (critical, read carefully)
═══════════════════════════════════════════════════════════
The bowl screenshots only show teams that PLAYED in Bowl Week 2. A ranked
team with NO Bowl Week 2 game (its bowl was an earlier week, or it's a CFP
team between rounds) still holds a poll rank but never appears in the game
rows above. This block is ONLY for those non-playing ranked teams — so the
game-row ranks PLUS this block together cover the full Top 25.

DO NOT list a team here if it appears in a REGULAR (non-CFP) bowl game row
above — its AP rank is already captured on that row (Col C / Col E), and
repeating it here double-counts it.

CFP PLAYOFF TEAMS ARE THE EXCEPTION: a CFP Quarterfinal row ("… (CFP QF)")
shows each team's SEED (1–12), NOT its AP rank (e.g. a #5 seed may be AP #2).
So CFP teams DO belong in this block with their real AP rank from the poll —
the seed on their game row is not their ranking.

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
... (one row per bowl in the screenshot, in the screenshot's alphabetical order)
\\t\\t\\t\\t\\t\\t           ← blank separator row (6 tabs)
<nonPlayingTeam1>\\t<rank1>\\t\\t\\t\\t
... (one row per NON-PLAYING ranked team only — omit any team that has a game row above)

(Each \\t above represents a LITERAL TAB character — use actual tab characters in your output, not the text "\\t".)

═══════════════════════════════════════════════════════════
FINAL CHECK before you send the answer
═══════════════════════════════════════════════════════════
[ ] Row count matches the number of bowl rows shown in the screenshot exactly (${13 - excludedBowlGames.length} rows)
[ ] Row order matches the screenshot's pre-filled Bowl Game column top-to-bottom (alphabetical)
[ ] Exactly 6 tab-separated values per game row (5 tab characters per line)
[ ] Columns B and D are team NAMES only, from the TEAM NAMES list
[ ] Columns C and E are ranks (1–25) or BLANK — never "NR", never guessed
[ ] Scores are INTEGERS only — no commas, no decimals, no "pts"
[ ] For "(CFP QF)" rows: used the exact team names from the right-hand column of the EXACT ROW ORDER table above (not real-world bowl matchups, not guessed); Team 1 = First Round winner (lower seed), Team 2 = bye seed (1-4)
[ ] Line N of my output corresponds to row N+1 of the sheet exactly per the row table — I did NOT re-alphabetize or reorder
[ ] Blank cells for any unknown scores or unplayed bowls — invented nothing
[ ] Bottom block = ranked teams whose AP rank is NOT on a regular bowl row: non-playing teams PLUS CFP teams (CFP rows show a seed, not the AP rank)
[ ] No team appears in BOTH a REGULAR bowl row and the bottom block — regular-bowl teams' AP ranks live on their game row only
[ ] Bottom-block rows have blank Col A, team abbr in Col B, rank in Col C
[ ] Regular-bowl game-row ranks + bottom-block ranks together cover 1–25 — no gaps, no duplicates, no collisions
[ ] No header row, no bowl name text, no winner column INSIDE the data.`,
    includeTeamMap: true,
    dynastyTeams: currentDynasty?.teams,
  }), [currentYear, currentDynasty?.teams, excludedBowlGames, prevWeekTop25Block, bw2RowTable])

  // LOCAL-PASTE prompt: SELF-DESCRIBING rows. Every game row LEADS with its
  // exact bowl name (the identity the save matches on, including any "(CFP QF)"
  // suffix) — so there is NO pre-filled column to align against and NO fixed
  // row order. Poll rows lead with a POLL sentinel (splitTsv drops the blank
  // separator the sheet used to mark the poll block). The import reshapes both
  // back into the parser's column layout.
  const localAiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} Bowl Week 2 Results`,
    structure: `You produce TWO kinds of SELF-DESCRIBING lines: GAME lines (each LEADS with its exact bowl name) and POLL lines (each LEADS with the word POLL). There is NO pre-filled column and NO fixed row order — every line carries its own identity. The CFP Quarterfinal games have a bowl name ending in "(CFP QF)".${excludedBowlGames.length > 0 ? `

⚠️ GAMES TO IGNORE — you may see these in your screenshots, but do NOT output a line for them:
${excludedBowlGames.map(g => `  • ${g}`).join('\n')}` : ''}

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. GAME line — EXACTLY 7 tab-separated fields: BowlName<TAB>Team1<TAB>Team1Rank<TAB>Team2<TAB>Team2Rank<TAB>Team1Score<TAB>Team2Score.
2. POLL line — EXACTLY 3 tab-separated fields: POLL<TAB>Rank<TAB>TeamAbbr (the literal word POLL as the first field).
3. NO header row. NO blank lines. NO commentary, totals, or labels INSIDE the data.
4. OMIT any bowl whose result you cannot see — do NOT pad, do NOT guess, do NOT invent scores. A bowl with no line is left unchanged.
5. BowlName MUST be one of the EXACT pre-defined bowl names listed in the BOWL NAMES table below — copy it CHARACTER-FOR-CHARACTER, INCLUDING the "(CFP QF)" suffix where shown. This name is the ONLY identifier for the game.
6. Team1 / Team2 are team names from the TEAM NAMES list at the bottom — NEVER an abbreviation, nickname, mascot, or city.
7. Team1Rank / Team2Rank: integer 1–25 if the team is ranked at bowl time, BLANK if unranked. Read off the number prefix on the team name. Never "NR" or "—".
8. Team1Score / Team2Score: integers (no commas, no decimals, no "pts"). If teams are known but scores aren't, leave both score fields blank (still keep all 7 fields / 6 tabs).
9. For "(CFP QF)" rows, use the exact team names shown in the BOWL NAMES table's right-hand hint column. Team 1 = First Round winner (lower seed that advanced), Team 2 = bye seed (1-4). Do NOT swap or substitute real-world matchups.
10. POLL lines are ONLY for ranked teams whose AP rank does NOT appear on a REGULAR (non-CFP) game line above. CFP teams DO get a POLL line (their game line shows a SEED, not the AP rank). Do not duplicate a regular-bowl team in a POLL line.

═══════════════════════════════════════════════════════════
BOWL NAMES — copy column A exactly (identity for each game line)
═══════════════════════════════════════════════════════════
${bw2RowTable}

═══════════════════════════════════════════════════════════
PRIOR-WEEK TOP 25 — entering Bowl Week 2 (post-Bowl-Week-1 poll)
═══════════════════════════════════════════════════════════
These teams were ranked BEFORE Bowl Week 2. Use as the baseline for POLL lines (ranks for teams not on a regular game line).

${prevWeekTop25Block || '  (no prior-week Top 25 stored — emit POLL lines only for ranks clearly visible in screenshots, otherwise omit them)'}

═══════════════════════════════════════════════════════════
PER-LINE OUTPUT
═══════════════════════════════════════════════════════════
GAME:  <BowlName><TAB><Team1><TAB><Team1Rank><TAB><Team2><TAB><Team2Rank><TAB><Team1Score><TAB><Team2Score>
POLL:  POLL<TAB><Rank><TAB><TeamAbbr>

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== BOWL WEEK 2 ===
<BowlName>\\t<Team1>\\t<Team1Rank>\\t<Team2>\\t<Team2Rank>\\t<Team1Score>\\t<Team2Score>
…one GAME line per bowl you can see; omit unknowns entirely
POLL\\t<Rank>\\t<TeamAbbr>
…one POLL line per ranked team NOT already on a regular game line (include CFP teams); omit if no prior-week poll

(Each \\t above represents a LITERAL TAB character — use actual tab characters, not the text "\\t".)

═══════════════════════════════════════════════════════════
FINAL CHECK before you send
═══════════════════════════════════════════════════════════
[ ] Every GAME line has exactly 7 tab-separated fields (six tabs) and LEADS with an exact bowl name from the BOWL NAMES table (with the "(CFP QF)" suffix where shown)
[ ] Every POLL line has exactly 3 fields: the literal word POLL, then rank, then team abbr
[ ] Team values are team names from the TEAM NAMES list
[ ] Ranks are 1–25 or blank; scores are integers with no commas or decimals
[ ] "(CFP QF)" lines use the exact teams from the hint column; Team1 = First Round winner, Team2 = bye seed
[ ] No team is on BOTH a regular game line and a POLL line; CFP teams appear on a POLL line with their AP rank
[ ] No blank lines, no header row, no commentary — only games you can see and the poll lines that complete the Top 25`,
    includeTeamMap: true,
    dynastyTeams: currentDynasty?.teams,
  }), [currentYear, currentDynasty?.teams, excludedBowlGames, prevWeekTop25Block, bw2RowTable])

  // Local paste import. The AI emits SELF-DESCRIBING lines:
  //   GAME: BowlName<TAB>Team1<TAB>T1Rank<TAB>Team2<TAB>T2Rank<TAB>T1Score<TAB>T2Score
  //   POLL: POLL<TAB>Rank<TAB>TeamAbbr
  // The parser (readBowlWeek2GamesFromSheet) detects games by NON-empty col A
  // and poll rows by EMPTY col A (abbr in col B, rank in col C), and the save
  // keys games by BOWL NAME (identity). So GAME rows pass straight through
  // (bowl name already in col A), and POLL rows are reshaped POLL/Rank/Team →
  // ['', Team, Rank] to recreate the empty-col-A poll layout. The SF host-bowl
  // config is persisted first, mirroring handleSave.
  const handleLocalImport = async (text) => {
    await persistSfBowlConfig()
    const splitRows = splitTsv(text)
    const rows = splitRows.map(row => {
      if (row[0] === 'POLL') {
        return ['', row[2] || '', row[1] || '']
      }
      return row
    })
    const bowlGames = await readBowlWeek2GamesFromSheet(null, (currentDynasty?.teams || currentDynasty?.customTeams), { rows })

    const pollEntries = bowlGames.pollEntries || []
    if (pollEntries.length > 0 && currentDynasty?.id) {
      try {
        await saveRankings(currentDynasty.id, pollEntries, currentYear, rankWeek)
      } catch (e) {
        console.error('Failed to save bowl week 2 rankings:', e)
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
      if (document.visibilityState === 'visible') { setHighlightSave(true); setTimeout(() => setHighlightSave(false), 5000) }
    }
    const handleFocus = () => { setHighlightSave(true); setTimeout(() => setHighlightSave(false), 5000) }
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
          const getSeedByTid = (tid) => cfpSeeds.find(s => s.tid === tid)?.seed
          const allGames = currentDynasty?.games || []

          const firstRoundResults = allGames
            .filter(g => g && (g.gameType === 'cfp_first_round' || g.isCFPFirstRound) && Number(g.year) === Number(currentYear))
            .map(g => {
              let team1 = g.team1, team2 = g.team2, winner = g.winner, seed1 = g.seed1, seed2 = g.seed2
              const teams = currentDynasty?.teams || TEAMS
              if (g.team1Tid && g.team2Tid && !team1) {
                const t1Info = getGameTeamInfo(teams, g.team1Tid)
                const t2Info = getGameTeamInfo(teams, g.team2Tid)
                team1 = t1Info?.abbr || g.team1
                team2 = t2Info?.abbr || g.team2
              }
              if (!winner && g.winnerTid) winner = getGameTeamInfo(teams, g.winnerTid)?.abbr
              const perspective = getUserGamePerspective(g, currentDynasty)
              if (perspective && !winner) {
                const userTeamInfo = perspective.userTid ? getGameTeamInfo(teams, perspective.userTid) : null
                const oppTeamInfo = perspective.opponentTid ? getGameTeamInfo(teams, perspective.opponentTid) : null
                const userTeam = userTeamInfo?.abbr || g.userTeam || getCurrentTeamAbbr(currentDynasty)
                const oppTeam = oppTeamInfo?.abbr || g.opponent
                winner = perspective.userWon ? userTeam : oppTeam
                if (!team1 || !team2) { team1 = userTeam; team2 = oppTeam }
              } else if (g.opponent && !winner) {
                const userTeam = g.userTeam || getCurrentTeamAbbr(currentDynasty)
                winner = (g.result === 'win' || g.result === 'W') ? userTeam : g.opponent
                if (!team1 || !team2) { team1 = userTeam; team2 = g.opponent }
              }
              if ((!seed1 || !seed2) && (g.team1Tid || g.team2Tid)) {
                const s1 = getSeedByTid(g.team1Tid), s2 = getSeedByTid(g.team2Tid)
                if (s1 && !s2) { seed1 = s1; seed2 = 17 - s1 }
                else if (!s1 && s2) { seed2 = s2; seed1 = 17 - s2 }
                else { seed1 = s1; seed2 = s2 }
              }
              const team1Tid = g.team1Tid != null ? Number(g.team1Tid) : null
              const team2Tid = g.team2Tid != null ? Number(g.team2Tid) : null
              const winnerTid = g.winnerTid != null ? Number(g.winnerTid) : (perspective ? (perspective.userWon ? team1Tid : team2Tid) : null)
              return { seed1, seed2, team1, team2, team1Tid, team2Tid, team1Score: g.team1Score, team2Score: g.team2Score, winner, winnerTid }
            })

          const excludeGames = []
          const cfpBowlConfigForExclude = currentDynasty?.cfpBowlConfigByYear?.[currentYear] || null
          const userTeamTid = getCurrentTeamTid(currentDynasty)
          const userTeamAbbr = getCurrentTeamAbbr(currentDynasty)
          const userCFPSeed = cfpSeeds.find(s => s.tid === userTeamTid)?.seed || null

          if (userCFPSeed) {
            if (userCFPSeed >= 1 && userCFPSeed <= 4) {
              const qfGameName = getCFPQuarterfinalGameName(userCFPSeed, [], cfpBowlConfigForExclude)
              if (qfGameName) excludeGames.push(qfGameName)
            } else if (userCFPSeed >= 5 && userCFPSeed <= 12) {
              const userFirstRoundGame = firstRoundResults.find(g => {
                if (!g) return false
                if (userTeamTid != null && g.winnerTid != null) return Number(g.winnerTid) === Number(userTeamTid)
                return g.winner === userTeamAbbr
              })
              if (userFirstRoundGame) {
                const qfGameName = getCFPQuarterfinalGameName(userCFPSeed, firstRoundResults, cfpBowlConfigForExclude)
                if (qfGameName) excludeGames.push(qfGameName)
              }
            }
          }

          // Already-entered Week 2 bowls stay IN the sheet (pre-filled
          // with their existing data via existingBowlWeek2 below). See
          // matching note in BowlWeek1Modal — round-trip safety lives in
          // saveCPUBowlGames now (blank rows preserve existing entries;
          // replacements keep rich fields like quarters / box score).

          const legacyBowlWeek2 = currentDynasty?.bowlGamesByYear?.[currentYear]?.week2 || []
          const unifiedBowlGames = (currentDynasty?.games || [])
            .filter(g => Number(g.year) === currentYear && (g.gameType === 'bowl' || (g.bowlName && !g.bowlName.includes('CFP'))) && isBowlInWeek2(g.bowlName))
            .map(g => {
              const teams = currentDynasty?.teams || TEAMS
              const t1Info = g.team1Tid ? getGameTeamInfo(teams, g.team1Tid) : null
              const t2Info = g.team2Tid ? getGameTeamInfo(teams, g.team2Tid) : null
              if (g.opponent) return { bowlName: g.bowlName, team1: g.userTeam || userTeamAbbr, team2: g.opponent, team1Score: g.teamScore, team2Score: g.opponentScore }
              return { bowlName: g.bowlName, team1: g.team1 || t1Info?.abbr, team2: g.team2 || t2Info?.abbr, team1Score: g.team1Score, team2Score: g.team2Score }
            })

          const existingBowlWeek2 = [...legacyBowlWeek2]
          unifiedBowlGames.forEach(ug => {
            const idx = existingBowlWeek2.findIndex(eb => eb.bowlName === ug.bowlName)
            if (idx >= 0) existingBowlWeek2[idx] = ug; else existingBowlWeek2.push(ug)
          })

          const existingCFPQuarterfinals = allGames
            .filter(g => g && (g.gameType === 'cfp_quarterfinal' || g.isCFPQuarterfinal) && Number(g.year) === Number(currentYear))
            .map(g => {
              const teams = currentDynasty?.teams || TEAMS
              const t1Info = g.team1Tid ? getGameTeamInfo(teams, g.team1Tid) : null
              const t2Info = g.team2Tid ? getGameTeamInfo(teams, g.team2Tid) : null
              // The sheet's column-A row name for a CFP QF is always
              // "<Bowl> (CFP QF)". Stored bowlName varies by entry path
              // (shells write "Sugar Bowl", GameEdit + sheet saves can
              // write either format), so normalize here to match — that's
              // how getExistingBowlData in initializeBowlWeek2Sheet keys
              // pre-fill lookups, and without this normalization an
              // already-entered QF score wouldn't show up when the user
              // re-opens the sheet.
              const stored = g.bowlName || ''
              const normalizedBowl = /\(CFP\s*QF\)\s*$/i.test(stored)
                ? stored
                : (stored ? `${stored} (CFP QF)` : '')
              return { bowl: normalizedBowl, team1: g.team1 || t1Info?.abbr, team2: g.team2 || t2Info?.abbr, score1: g.team1Score, score2: g.team2Score, winner: g.winner || (g.winnerTid ? getGameTeamInfo(teams, g.winnerTid)?.abbr : null) }
            })

          const cfpBowlConfig = currentDynasty?.cfpBowlConfigByYear?.[currentYear] || null
          const sheetInfo = await createBowlWeek2Sheet(
            currentDynasty?.teamName || 'Dynasty', currentYear, cfpSeeds, firstRoundResults,
            excludeGames, existingBowlWeek2, existingCFPQuarterfinals,
            currentDynasty?.teams || currentDynasty?.customTeams, cfpBowlConfig,
          )
          setSheetId(sheetInfo.spreadsheetId)
        } catch (error) {
          console.error('Failed to create bowl Week 2 sheet:', error)
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
    if (!isOpen) { setShowDeletedNote(false); creatingSheetRef.current = false; creationAttemptedRef.current = false; setSheetId(null); setUseLocal(true) }
  }, [isOpen])

  const handleSave = async (alsoDelete) => {
    if (!sheetId) return
    if (alsoDelete) setDeletingSheet(true); else setSyncing(true)
    try {
      await persistSfBowlConfig()
      const bowlGames = await readBowlWeek2GamesFromSheet(sheetId, currentDynasty?.teams || currentDynasty?.customTeams)

      const pollEntries = bowlGames.pollEntries || []
      if (pollEntries.length > 0 && currentDynasty?.id) {
        try { await saveRankings(currentDynasty.id, pollEntries, currentYear, rankWeek) }
        catch (e) { console.error('Failed to save bowl week 2 rankings:', e) }
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
      if (error?.message === 'duplicate SF bowl') { setDeletingSheet(false); setSyncing(false); return }
      console.error(error)
      if (!auth.handleError(error)) toast.error('Failed to sync from Google Sheets.')
    } finally {
      setDeletingSheet(false)
      setSyncing(false)
    }
  }

  const handleRegenerateSheet = async () => {
    if (!sheetId) return
    const confirmed = await confirm({ title: 'Regenerate sheet?', message: 'This will delete your current sheet and create a fresh one. Any unsaved data will be lost.', confirmLabel: 'Regenerate', variant: 'danger' })
    if (!confirmed) return
    setRegenerating(true)
    try {
      await deleteGoogleSheet(sheetId); setSheetId(null); auth.retry()
    } catch (error) {
      console.error('Failed to regenerate sheet:', error)
      if (!auth.handleError(error)) toast.error('Failed to regenerate sheet. Please try again.')
    } finally { setRegenerating(false) }
  }

  const handleDeleteSheetOnly = async () => {
    if (!sheetId || !currentDynasty) return
    const ok = await confirm({ title: 'Delete this bowl week 2 sheet?', message: 'This deletes the Google Sheet without applying any edits. Your dynasty bowl game results stay as-is.', confirmLabel: 'Delete', variant: 'danger' })
    if (!ok) return
    setDeletingSheet(true)
    try {
      await deleteGoogleSheet(sheetId); setSheetId(null); setShowDeletedNote(true); setTimeout(() => onClose(), 1800)
    } catch (error) {
      console.error('Failed to delete sheet:', error)
      if (!auth.handleError(error)) toast.error('Failed to delete the sheet. Try again.')
    } finally { setDeletingSheet(false) }
  }

  if (!isOpen) return null

  const embedUrl = sheetId ? getSheetEmbedUrl(sheetId, 'Bowl Games') : null
  const isLoading = creatingSheet

  const rankWeekSelect = (
    <select
      id="bw2-rank-week"
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

  // Semifinal host-bowl picker — the local-paste path needs this so the user
  // can set SF host bowls before importing (persistSfBowlConfig runs on
  // import). Same markup the Google branches render.
  const sfHostBowlsBlock = (
    <div className="p-3 rounded-lg border bg-surface-2 border-surface-4">
      <h4 className="text-xs font-bold uppercase mb-1.5 text-txt-primary" style={{ letterSpacing: '1.5px' }}>Semifinal Host Bowls</h4>
      {(() => {
        const savedConfig = currentDynasty?.cfpBowlConfigByYear?.[currentYear] || {}
        const qfBowls = new Set(['seed1', 'seed2', 'seed3', 'seed4'].map(k => savedConfig[k]).filter(Boolean))
        const sfOptions = CFP_NY6_BOWLS.filter(b => !qfBowls.has(b))
        const bowlChoices = sfOptions.length > 0 ? sfOptions : CFP_NY6_BOWLS
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[{ key: 'sf1', label: 'Semifinal 1 host (1/4-seed bracket)' }, { key: 'sf2', label: 'Semifinal 2 host (2/3-seed bracket)' }].map(({ key, label }) => {
              const current = sfBowlConfig[key]
              const opts = bowlChoices.includes(current) ? bowlChoices : [current, ...bowlChoices]
              return (
                <div key={key}>
                  <label className="text-[10px] block mb-0.5 text-txt-tertiary">{label}</label>
                  <select value={current} onChange={(e) => setSfBowlConfig(prev => ({ ...prev, [key]: e.target.value }))} className="w-full px-2 py-1 rounded text-xs border bg-surface-3 border-surface-4 text-txt-primary">
                    {opts.map(bowl => <option key={bowl} value={bowl}>{bowl}</option>)}
                  </select>
                </div>
              )
            })}
          </div>
        )
      })()}
      {sfBowlConfig.sf1 === sfBowlConfig.sf2 && <p className="text-[11px] mt-1.5 text-red-400 font-medium">Each semifinal needs a different host bowl.</p>}
    </div>
  )

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4"
      style={{ margin: 0 }}
      onMouseDown={onClose}
    >
      <div
        className={`card-elevated w-full max-h-[calc(100dvh-4rem)] flex flex-col overflow-hidden ${
          useEmbedded ? 'sm:w-[95vw] sm:h-[95dvh]' : 'sm:max-w-[680px] sm:h-auto'
        }`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-7 py-4 border-b border-surface-4">
          <div className="flex flex-col">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-txt-tertiary mb-0.5">Postseason</span>
            <h2 className="text-xl sm:text-2xl font-bold text-txt-primary tracking-tight tabular-nums">
              {currentYear} Bowl Week 2
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
                importLabel="Import Bowl Week 2"
              >
                {sfHostBowlsBlock}
                <section className="text-center">
                  <label htmlFor="bw2-rank-week" className="label-xs text-txt-tertiary block mb-2">
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
                <div className="animate-spin w-10 h-10 border-2 rounded-full mx-auto mb-4" style={{ borderColor: 'var(--text-primary)', borderTopColor: 'transparent' }} />
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
                    <button onClick={() => handleSave(true)} disabled={syncing || deletingSheet} className={`btn-refined btn-refined--solid ${highlightSave ? 'animate-pulse-subtle' : ''}`}>
                      {deletingSheet ? 'Saving…' : 'Save & move to trash'}
                    </button>
                    <button onClick={() => handleSave(false)} disabled={syncing || deletingSheet} className="btn-refined">
                      {syncing ? 'Saving…' : 'Save & keep sheet'}
                    </button>

                    <span className="mx-1 h-6 w-px bg-surface-4" aria-hidden="true" />

                    <label htmlFor="bw2-rank-week" className="label-xs text-txt-tertiary">Rankings week</label>
                    {rankWeekSelect}

                    <div className="ml-auto flex items-center gap-2">
                      <button onClick={handleDeleteSheetOnly} disabled={syncing || deletingSheet || regenerating} className="btn-refined">
                        {deletingSheet ? 'Deleting…' : 'Delete sheet'}
                      </button>
                      <button onClick={handleRegenerateSheet} disabled={syncing || deletingSheet || regenerating} className="btn-refined btn-refined--danger">
                        {regenerating ? 'Regenerating…' : 'Regenerate'}
                      </button>
                    </div>
                  </div>

                  {/* Semifinal bowl assignment (also accessible in embedded mode) */}
                  <div className="px-5 sm:px-7 pt-3 pb-2">
                    <div className="p-3 rounded-lg border flex-shrink-0 bg-surface-2 border-surface-4">
                      <h4 className="text-xs font-bold uppercase mb-1.5 text-txt-primary" style={{ letterSpacing: '1.5px' }}>Semifinal Host Bowls</h4>
                      {(() => {
                        const savedConfig = currentDynasty?.cfpBowlConfigByYear?.[currentYear] || {}
                        const qfBowls = new Set(['seed1', 'seed2', 'seed3', 'seed4'].map(k => savedConfig[k]).filter(Boolean))
                        const sfOptions = CFP_NY6_BOWLS.filter(b => !qfBowls.has(b))
                        const bowlChoices = sfOptions.length > 0 ? sfOptions : CFP_NY6_BOWLS
                        return (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {[{ key: 'sf1', label: 'Semifinal 1 host (1/4-seed bracket)' }, { key: 'sf2', label: 'Semifinal 2 host (2/3-seed bracket)' }].map(({ key, label }) => {
                              const current = sfBowlConfig[key]
                              const opts = bowlChoices.includes(current) ? bowlChoices : [current, ...bowlChoices]
                              return (
                                <div key={key}>
                                  <label className="text-[10px] block mb-0.5 text-txt-tertiary">{label}</label>
                                  <select value={current} onChange={(e) => setSfBowlConfig(prev => ({ ...prev, [key]: e.target.value }))} className="w-full px-2 py-1 rounded text-xs border bg-surface-3 border-surface-4 text-txt-primary">
                                    {opts.map(bowl => <option key={bowl} value={bowl}>{bowl}</option>)}
                                  </select>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })()}
                      {sfBowlConfig.sf1 === sfBowlConfig.sf2 && <p className="text-[11px] mt-1.5 text-red-400 font-medium">Each semifinal needs a different host bowl.</p>}
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col overflow-hidden min-h-0 border border-surface-4 rounded-lg mx-5 sm:mx-7 my-3">
                    <SheetToolbar sheetId={sheetId} embedUrl={embedUrl} teamColors={teamColors} title="Bowl Week 2" />
                  </div>

                  <div className="px-5 sm:px-7 py-2 flex items-center justify-end">
                    <button onClick={() => { const v = !useEmbedded; setUseEmbedded(v); localStorage.setItem('sheetEmbedPreference', v.toString()) }} className="text-xs text-txt-tertiary hover:text-txt-primary transition-colors underline decoration-dotted underline-offset-4">
                      ← Back to default view
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  <div className="max-w-md mx-auto px-5 sm:px-7 py-6 flex flex-col gap-5">
                    <SheetManualEntry sheetId={sheetId} />

                    {/* Semifinal Host Bowls — neutral surface colors to
                        match the rest of the sheet-modal family. */}
                    <div className="p-3 rounded-lg border bg-surface-2 border-surface-4">
                      <h4 className="text-xs font-bold uppercase mb-1.5 text-txt-primary" style={{ letterSpacing: '1.5px' }}>Semifinal Host Bowls</h4>
                      {(() => {
                        const savedConfig = currentDynasty?.cfpBowlConfigByYear?.[currentYear] || {}
                        const qfBowls = new Set(['seed1', 'seed2', 'seed3', 'seed4'].map(k => savedConfig[k]).filter(Boolean))
                        const sfOptions = CFP_NY6_BOWLS.filter(b => !qfBowls.has(b))
                        const bowlChoices = sfOptions.length > 0 ? sfOptions : CFP_NY6_BOWLS
                        return (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {[{ key: 'sf1', label: 'Semifinal 1 host (1/4-seed bracket)' }, { key: 'sf2', label: 'Semifinal 2 host (2/3-seed bracket)' }].map(({ key, label }) => {
                              const current = sfBowlConfig[key]
                              const opts = bowlChoices.includes(current) ? bowlChoices : [current, ...bowlChoices]
                              return (
                                <div key={key}>
                                  <label className="text-[10px] block mb-0.5 text-txt-tertiary">{label}</label>
                                  <select value={current} onChange={(e) => setSfBowlConfig(prev => ({ ...prev, [key]: e.target.value }))} className="w-full px-2 py-1 rounded text-xs border bg-surface-3 border-surface-4 text-txt-primary">
                                    {opts.map(bowl => <option key={bowl} value={bowl}>{bowl}</option>)}
                                  </select>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })()}
                      {sfBowlConfig.sf1 === sfBowlConfig.sf2 && <p className="text-[11px] mt-1.5 text-red-400 font-medium">Each semifinal needs a different host bowl.</p>}
                    </div>

                    <section className="text-center">
                      <label htmlFor="bw2-rank-week" className="label-xs text-txt-tertiary block mb-2">
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
                      onToggleEmbedded={() => { const v = !useEmbedded; setUseEmbedded(v); localStorage.setItem('sheetEmbedPreference', v.toString()) }}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <AuthErrorModal isOpen={auth.showAuthError} onClose={auth.closeAuthError} onRefresh={auth.retry} teamColors={teamColors} />
    </div>,
    document.body,
  )
}
