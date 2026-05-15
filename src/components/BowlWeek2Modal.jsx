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
} from '../services/sheetsService'
import { getCurrentTeamAbbr, getCurrentTeamTid, TEAMS, getGameTeamInfo } from '../data/teamRegistry'
import { getModalColors } from '../utils/colorUtils'
import { buildAIPrompt } from '../utils/aiPrompt'
import SheetLoadingHint from './SheetLoadingHint'
import { DEFAULT_BOWL_CONFIG, CFP_NY6_BOWLS } from '../data/cfpConstants'

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

// Rankings week slots: 16=BowlWk1, 17=BowlWk2, 18=NatChamp
const RANK_WEEK_OPTIONS = [
  { value: 16, label: 'Bowl Week 1' },
  { value: 17, label: 'Bowl Week 2' },
  { value: 18, label: 'Bowl Week 3 (CFP Semis)' },
  { value: 19, label: 'National Championship' },
]

export default function BowlWeek2Modal({ isOpen, onClose, onSave, currentYear, teamColors }) {
  const { currentDynasty, updateDynasty, saveRankings } = useDynasty()
  const modalColors = useMemo(() => getModalColors(teamColors), [teamColors])
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
  const [useEmbedded, setUseEmbedded] = useState(() => localStorage.getItem('sheetEmbedPreference') === 'true')
  const [highlightSave, setHighlightSave] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const creatingSheetRef = useRef(false)

  // Rankings week — default to current dynasty postseason week slot.
  const effectiveRankWeek = (() => {
    const phase = currentDynasty?.currentPhase
    const week = Number(currentDynasty?.currentWeek)
    if (phase === 'postseason' && Number.isFinite(week)) return 15 + week
    return 17
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

  // Compute excluded games so the AI prompt can explicitly name which bowl(s) to skip.
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
        const t1 = g.team1Tid ? getGameTeamInfo(teams, g.team1Tid)?.abbr || g.team1 : g.team1
        const t2 = g.team2Tid ? getGameTeamInfo(teams, g.team2Tid)?.abbr || g.team2 : g.team2
        const winnerTid = g.winnerTid != null ? Number(g.winnerTid) : null
        const winner = g.winner || (winnerTid ? getGameTeamInfo(teams, winnerTid)?.abbr : null)
        return { seed1: g.seed1, seed2: g.seed2, team1: t1, team2: t2, winner, winnerTid }
      })
    const excluded = []
    if (userCFPSeed) {
      if (userCFPSeed >= 1 && userCFPSeed <= 4) {
        const qf = getCFPQuarterfinalGameName(userCFPSeed, [], cfpBowlConfigForExclude)
        if (qf) excluded.push(qf)
      } else if (userCFPSeed >= 5 && userCFPSeed <= 12) {
        const userWon = firstRoundResults.find(g => {
          if (!g) return false
          if (userTeamTid != null && g.winnerTid != null) return Number(g.winnerTid) === Number(userTeamTid)
          return g.winner === userTeamAbbr
        })
        if (userWon) {
          const qf = getCFPQuarterfinalGameName(userCFPSeed, firstRoundResults, cfpBowlConfigForExclude)
          if (qf) excluded.push(qf)
        }
      }
    }
    const userBowlGame = currentDynasty?.bowlEligibilityDataByYear?.[currentYear]?.bowlGame
    if (userBowlGame && isBowlInWeek2(userBowlGame)) excluded.push(userBowlGame)
    return excluded
  }, [currentDynasty, currentYear])

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
    structure: `This sheet has ONE tab: "Bowl Games". It contains up to 12 Week 2 bowl games: 8 regular Week 2 bowls plus 4 CFP Quarterfinal bowls. All bowl names are PRE-FILLED in column A and sorted ALPHABETICALLY. The CFP Quarterfinal rows have the suffix "(CFP QF)" in their bowl name.${excludedBowlGames.length > 0 ? `

⚠️ EXCLUDED BOWL(S) — the user played in these games themselves and they are NOT in the sheet. DO NOT output a row for them even if they appear in your screenshots:
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
6. TEAM ABBREVIATIONS ONLY (columns B and D) — use the abbreviation mapping below. Columns B and D are strict dropdowns.
7. RANKS (columns C and E): integer 1–25 if the team is ranked at the time of the bowl, BLANK if unranked. Rankings appear as a number prefix on the team name in the scores list (e.g. "4 Alabama" = Alabama is #4). No prefix = unranked = leave blank. Never write "NR" or "—".
8. BLANK CELLS if unknown. Never guess, never use "N/A", "TBD", dash. Zero is only valid if the team truly scored zero.
9. No header row, no Bowl Game text, no winner column, no commentary INSIDE the data. The paste-target label above the fence is required (see Method A/B rules above).
10. ONE TSV block — preceded by the paste-target label line as required by the Method A/B rules above.

═══════════════════════════════════════════════════════════
TAB: "Bowl Games" — up to 12 rows × 6 editable columns
Paste your block at cell B2 of the "Bowl Games" tab
═══════════════════════════════════════════════════════════

Column A (Bowl Game) is pre-filled alphabetically. The possible pre-filled bowl names are listed below; the actual sheet contains ONLY those that appear in the screenshot, in the order shown.

Possible pre-filled Bowl Game names (sheet is sorted alphabetically — the exact names for the CFP QF bowls vary by the user's configuration, but every CFP QF row ends with " (CFP QF)"):
  Regular Week 2 bowls:
    - Citrus Bowl
    - Duke's Mayo Bowl
    - First Responder Bowl
    - Gator Bowl
    - Reliaquest Bowl
    - Sun Bowl
    - Texas Bowl
    - Xbox Bowl
  CFP Quarterfinal bowls (4 rows, names from user config, each suffixed "(CFP QF)"):
    - <Seed-1 QF bowl> (CFP QF)     default: Sugar Bowl (CFP QF)
    - <Seed-2 QF bowl> (CFP QF)     default: Cotton Bowl (CFP QF)
    - <Seed-3 QF bowl> (CFP QF)     default: Rose Bowl (CFP QF)
    - <Seed-4 QF bowl> (CFP QF)     default: Orange Bowl (CFP QF)

For each row, in the same top-to-bottom order shown in the screenshot, output these 6 columns:

Col A (PROTECTED)    | Col B (Team 1) | Col C (T1 Rank) | Col D (Team 2) | Col E (T2 Rank) | Col F (T1 Score) | Col G (T2 Score)
---------------------+----------------+-----------------+----------------+-----------------+------------------+------------------
pre-filled bowl name | team abbr      | rank or blank   | team abbr      | rank or blank   | integer          | integer

Column B, Column D: STRICT dropdown of team abbreviations — use ONLY values from the TEAM ABBREVIATIONS mapping at the bottom of this prompt.
Column C, Column E: integer rank 1–25 if ranked, BLANK if unranked. Read directly from the number prefix shown on the team name in the screenshot.
Column F, Column G: integer score (0 or higher), no commas, no decimal point.

CFP QF rows (those with "(CFP QF)" in the name): Team 1 (column B) is the First Round winner (the lower-seeded team that advanced from the First Round, seeds 5-12). Team 2 (column D) is the higher seed that had the bye (seed 1, 2, 3, or 4). Do NOT swap this ordering.

═══════════════════════════════════════════════════════════
POST-BOWL POLL — paste BELOW the game rows (same tab, same paste)
═══════════════════════════════════════════════════════════
After ALL bowl game rows, leave ONE blank row, then list every team in
the NEW post-Bowl-Week-2 AP Poll (Top 25). This is the poll released
AFTER these games were played.

For each ranked team, output ONE row:
  • Leave Col A BLANK (no bowl name)
  • Col B = team abbreviation (from the TEAM ABBREVIATIONS mapping)
  • Col C = their rank (1–25)
  • Cols D–G = leave blank

Format: \\t<TeamAbbr>\\t<Rank>\\t\\t\\t\\t
(tab, team, tab, rank, then 4 blank tabs — Col A blank = no bowl name)

List all 25 ranked teams in rank order (#1 first). If you cannot determine the post-bowl poll from the screenshots, skip this section entirely — do NOT invent rankings.

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== BOWL GAMES — paste at cell B2 of "Bowl Games" tab ===
<row1 Team1>\\t<row1 T1Rank>\\t<row1 Team2>\\t<row1 T2Rank>\\t<row1 T1Score>\\t<row1 T2Score>
<row2 Team1>\\t<row2 T1Rank>\\t<row2 Team2>\\t<row2 T2Rank>\\t<row2 T1Score>\\t<row2 T2Score>
... (one row per bowl in the screenshot, in the screenshot's alphabetical order)
\\t\\t\\t\\t\\t\\t           ← blank separator row (6 tabs)
\\t<rank1Team>\\t<rank1>\\t\\t\\t\\t
... (up to 25 poll rows)

(Each \\t above represents a LITERAL TAB character — use actual tab characters in your output, not the text "\\t".)

═══════════════════════════════════════════════════════════
FINAL CHECK before you send the answer
═══════════════════════════════════════════════════════════
[ ] Row count matches the number of bowl rows shown in the screenshot exactly (up to 12)
[ ] Row order matches the screenshot's pre-filled Bowl Game column top-to-bottom (alphabetical)
[ ] Exactly 6 tab-separated values per game row (5 tab characters per line)
[ ] Columns B and D are team ABBREVIATIONS only, from the TEAM ABBREVIATIONS mapping
[ ] Columns C and E are ranks (1–25) or BLANK — never "NR", never guessed
[ ] Scores are INTEGERS only — no commas, no decimals, no "pts"
[ ] For "(CFP QF)" rows: Team 1 is the First Round winner (lower seed), Team 2 is the bye seed (1-4)
[ ] Blank cells for any unknown scores or unplayed bowls — invented nothing
[ ] Post-bowl poll block present after a blank separator (or omitted if not visible)
[ ] Poll rows have blank Col A, team abbr in Col B, rank in Col C
[ ] No header row, no bowl name text, no winner column INSIDE the data. The paste-target label above the fence is required (see Method A/B rules above).`,
    includeTeamMap: true,
    dynastyTeams: currentDynasty?.teams,
  }), [currentYear, currentDynasty?.teams, excludedBowlGames])

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
    const createSheet = async () => {
      if (isOpen && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote) {
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

          const userBowlGame = currentDynasty?.bowlEligibilityDataByYear?.[currentYear]?.bowlGame
          if (userBowlGame && isBowlInWeek2(userBowlGame)) excludeGames.push(userBowlGame)

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
              return { bowl: g.bowlName, team1: g.team1 || t1Info?.abbr, team2: g.team2 || t2Info?.abbr, score1: g.team1Score, score2: g.team2Score, winner: g.winner || (g.winnerTid ? getGameTeamInfo(teams, g.winnerTid)?.abbr : null) }
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
  }, [isOpen, user, sheetId, creatingSheet, currentDynasty?.id, auth.retryCount, showDeletedNote])

  useEffect(() => {
    if (!isOpen) { setShowDeletedNote(false); creatingSheetRef.current = false; setSheetId(null) }
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
      if (!auth.handleError(error)) toast.error('Failed to delete the sheet — try again.')
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
          {isLoading ? (
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
                    <div className="p-3 rounded-lg border flex-shrink-0" style={{ borderColor: modalColors.border, backgroundColor: modalColors.headerBg }}>
                      <h4 className="text-xs font-bold uppercase mb-1.5" style={{ color: 'var(--text-primary)', letterSpacing: '1.5px' }}>Semifinal Host Bowls</h4>
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
                                  <label className="text-[10px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>{label}</label>
                                  <select value={current} onChange={(e) => setSfBowlConfig(prev => ({ ...prev, [key]: e.target.value }))} className="w-full px-2 py-1 rounded text-xs border" style={{ borderColor: modalColors.inputBorder, backgroundColor: modalColors.inputBg, color: 'var(--text-primary)' }}>
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

                    {/* Semifinal Host Bowls */}
                    <div className="p-3 rounded-lg border" style={{ borderColor: modalColors.border, backgroundColor: modalColors.headerBg }}>
                      <h4 className="text-xs font-bold uppercase mb-1.5" style={{ color: 'var(--text-primary)', letterSpacing: '1.5px' }}>Semifinal Host Bowls</h4>
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
                                  <label className="text-[10px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>{label}</label>
                                  <select value={current} onChange={(e) => setSfBowlConfig(prev => ({ ...prev, [key]: e.target.value }))} className="w-full px-2 py-1 rounded text-xs border" style={{ borderColor: modalColors.inputBorder, backgroundColor: modalColors.inputBg, color: 'var(--text-primary)' }}>
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
