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
} from '../services/sheetsService'
import { getCurrentTeamTid, getCurrentTeamAbbr, getGameTeamInfo, TEAMS } from '../data/teamRegistry'
import { CFP_BRACKET_SLOTS } from '../data/cfpConstants'
import { getModalColors } from '../utils/colorUtils'
import { buildAIPrompt } from '../utils/aiPrompt'
import SheetLoadingHint from './SheetLoadingHint'

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

// Rankings week slots: 15=CCG, 16=BowlWk1, 17=BowlWk2, 18=NatChamp
const RANK_WEEK_OPTIONS = [
  { value: 15, label: 'Conf Champ Week' },
  { value: 16, label: 'Bowl Week 1' },
  { value: 17, label: 'Bowl Week 2' },
  { value: 18, label: 'Bowl Week 3 (CFP Semis)' },
  { value: 19, label: 'National Championship' },
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
  const [useEmbedded, setUseEmbedded] = useState(() => localStorage.getItem('sheetEmbedPreference') === 'true')
  const [highlightSave, setHighlightSave] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const creatingSheetRef = useRef(false)

  // Rankings week — default to the current dynasty postseason week slot
  // (same pattern as WeeklyScoresModal). In postseason week N the poll
  // that comes out corresponds to slot 15+N, so when in BW2 the rankings
  // should land in slot 17 by default, not slot 16.
  const effectiveRankWeek = (() => {
    const phase = currentDynasty?.currentPhase
    const week = Number(currentDynasty?.currentWeek)
    if (phase === 'postseason' && Number.isFinite(week)) return 15 + week
    return 16
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

  // Prior-week Top 25 (post-CCG poll = rankByWeek slot 15) so the AI can
  // reason about which ranked teams aren't playing in Bowl Week 1.
  const prevWeekTop25Block = useMemo(() => {
    if (!currentDynasty) return ''
    const yearNum = Number(currentYear)
    const teams = currentDynasty.teams || {}
    const slotMap = new Map()
    for (const team of Object.values(teams)) {
      const rbw = team?.byYear?.[yearNum]?.rankByWeek ?? team?.byYear?.[String(yearNum)]?.rankByWeek
      if (!rbw) continue
      const v = rbw[15] ?? rbw['15']
      if (typeof v !== 'number' || v < 1 || v > 25) continue
      if (!slotMap.has(v)) slotMap.set(v, team.abbr)
    }
    if (slotMap.size === 0) return ''
    const lines = []
    for (let r = 1; r <= 25; r++) {
      const abbr = slotMap.get(r)
      if (abbr) lines.push(`  #${r} ${abbr}`)
    }
    return lines.join('\n')
  }, [currentDynasty, currentYear])

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
6. TEAM ABBREVIATIONS ONLY (columns B and D) — use the abbreviation mapping below. Columns B and D are strict dropdowns — wrong text is rejected by the sheet.
7. RANKS (columns C and E): integer 1–25 if the team is ranked at the time of the bowl, BLANK if unranked. Rankings appear as a number prefix on the team name in the scores list (e.g. "12 Georgia" = Georgia is #12). No prefix = unranked = leave blank. Never write "NR" or "—".
8. BLANK CELLS if unknown. Never guess, never use "N/A", "TBD", dash. Zero is only valid if the team truly scored zero.
   - Bowl not yet played: leave all 6 cells blank (6 empty tab-separated fields).
   - Teams known, scores not: fill B–E only; leave F and G blank.
9. No header row, no Bowl Game text, no winner column, no commentary INSIDE the data. The paste-target label above the fence is required (see Method A/B rules above).
10. ONE TSV block — preceded by the paste-target label line as required by the Method A/B rules above.

═══════════════════════════════════════════════════════════
TAB: "Bowl Games" — ${29 - excludedBowlGames.length} rows × 6 editable columns
Paste your block at cell B2 of the "Bowl Games" tab
═══════════════════════════════════════════════════════════

Column A (Bowl Game) is pre-filled with the bowl game name — match the screenshot. The full pool of possible pre-filled bowl names is listed below so you can recognize each row; the actual sheet contains ONLY those that appear in the screenshot.

Pre-filled Bowl Game names (possible values in column A, in sheet order):
  1. 68 Ventures Bowl
  2. Alamo Bowl
  3. Arizona Bowl
  4. Armed Forces Bowl
  5. Birmingham Bowl
  6. Boca Raton Bowl
  7. CFP First Round (#8 vs #9)
  8. CFP First Round (#7 vs #10)
  9. CFP First Round (#6 vs #11)
 10. CFP First Round (#5 vs #12)
 11. Cure Bowl
 12. Famous Idaho Potato Bowl
 13. Fenway Bowl
 14. Frisco Bowl
 15. GameAbove Sports Bowl
 16. Gasparilla Bowl
 17. Hawaii Bowl
 18. Holiday Bowl
 19. Independence Bowl
 20. LA Bowl
 21. Las Vegas Bowl
 22. Liberty Bowl
 23. Military Bowl
 24. Myrtle Beach Bowl
 25. New Mexico Bowl
 26. New Orleans Bowl
 27. Pop-Tarts Bowl
 28. Rate Bowl
 29. Salute to Veterans Bowl

For each row, in the same top-to-bottom order shown in the screenshot, output these 6 columns:

Col A (PROTECTED)    | Col B (Team 1) | Col C (T1 Rank) | Col D (Team 2) | Col E (T2 Rank) | Col F (T1 Score) | Col G (T2 Score)
---------------------+----------------+-----------------+----------------+-----------------+------------------+------------------
pre-filled bowl name | team abbr      | rank or blank   | team abbr      | rank or blank   | integer          | integer

Column B, Column D: STRICT dropdown of team abbreviations — use ONLY values from the TEAM ABBREVIATIONS mapping at the bottom of this prompt.
Column C, Column E: integer rank 1–25 if ranked, BLANK if unranked. Read directly from the number prefix shown on the team name in the screenshot.
Column F, Column G: integer score (0 or higher), no commas, no decimal point.

CFP First Round rows: For the rows whose Bowl Game name starts with "CFP First Round", Team 1 is the HIGHER seed (the lower seed number: e.g. #5 in "5 vs 12") and Team 2 is the LOWER seed (#12). Do NOT swap them.

═══════════════════════════════════════════════════════════
PRIOR-WEEK TOP 25 — entering Bowl Week 1 (post-CCG poll)
═══════════════════════════════════════════════════════════
These teams were ranked BEFORE Bowl Week 1 started. Use this as your
baseline to determine the new ranks for teams NOT playing in Bowl Week 1.

${prevWeekTop25Block || '  (no prior-week Top 25 stored — infer non-playing ranks from any poll visible in screenshots)'}

═══════════════════════════════════════════════════════════
POST-BOWL POLL — paste BELOW the game rows (same tab, same paste)
═══════════════════════════════════════════════════════════
After ALL bowl game rows, leave ONE blank row, then output EVERY team in
the new post-Bowl-Week-1 AP Poll (Top 25). This MUST include both:

  (a) Teams that PLAYED in Bowl Week 1 — use their new rank from the
      post-game poll visible in your screenshots, or infer from results.
  (b) Teams that did NOT play in Bowl Week 1 — they are still ranked.
      Use the PRIOR-WEEK TOP 25 above as your baseline:
        • By default, non-playing teams hold their prior rank.
        • Drop them a slot if a team below them won impressively and
          leapfrogged; move them up if teams above them lost.
        • Every rank 1–25 must be filled exactly once across the full
          set of poll rows. No collisions, no gaps, no duplicates.

For each ranked team, output ONE row:
  • Leave Col A BLANK (no bowl name)
  • Col B = team abbreviation (from the TEAM ABBREVIATIONS mapping)
  • Col C = their rank (1–25)
  • Cols D–G = leave blank

Format: \\t<TeamAbbr>\\t<Rank>\\t\\t\\t\\t
(tab, team, tab, rank, then 4 blank tabs — Col A blank = no bowl name)

Output all 25 ranked teams in rank order (#1 first). If no post-bowl poll
is visible in screenshots AND no prior-week poll was provided above,
skip this section entirely — do NOT invent rankings.

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== BOWL GAMES — paste at cell B2 of "Bowl Games" tab ===
<row1 Team1>\\t<row1 T1Rank>\\t<row1 Team2>\\t<row1 T2Rank>\\t<row1 T1Score>\\t<row1 T2Score>
<row2 Team1>\\t<row2 T1Rank>\\t<row2 Team2>\\t<row2 T2Rank>\\t<row2 T1Score>\\t<row2 T2Score>
... (one row per bowl in the screenshot, in the screenshot's order)
\\t\\t\\t\\t\\t\\t           ← blank separator row (6 tabs)
\\t<rank1Team>\\t<rank1>\\t\\t\\t\\t
\\t<rank2Team>\\t<rank2>\\t\\t\\t\\t
... (up to 25 poll rows)

(Each \\t above represents a LITERAL TAB character — use actual tab characters in your output, not the text "\\t".)

═══════════════════════════════════════════════════════════
FINAL CHECK before you send the answer
═══════════════════════════════════════════════════════════
[ ] Row count matches the number of bowl rows shown in the screenshot exactly (${29 - excludedBowlGames.length} rows)
[ ] Row order matches the screenshot's pre-filled Bowl Game column top-to-bottom
[ ] Exactly 6 tab-separated values per game row (5 tab characters per line)
[ ] Columns B and D are team ABBREVIATIONS only, from the TEAM ABBREVIATIONS mapping
[ ] Columns C and E are ranks (1–25) or BLANK — never "NR", never guessed
[ ] Scores are INTEGERS only — no commas, no decimals, no "pts"
[ ] For CFP First Round rows: Team 1 is the higher seed, Team 2 is the lower seed
[ ] Blank cells for any unknown scores or unplayed bowls — invented nothing
[ ] Post-bowl poll block present and includes ALL 25 ranked teams — both playing AND non-playing
[ ] Non-playing ranked teams (from Prior-Week Top 25) are included with their new ranks (held or adjusted)
[ ] Poll rows have blank Col A, team abbr in Col B, rank in Col C
[ ] No rank collision or gap across all 25 poll rows
[ ] No header row, no bowl name text, no winner column INSIDE the data. The paste-target label above the fence is required (see Method A/B rules above).`,
    includeTeamMap: true,
    dynastyTeams: currentDynasty?.teams,
  }), [currentYear, currentDynasty?.teams, excludedBowlGames, prevWeekTop25Block])

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
    const createSheet = async () => {
      if (isOpen && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote) {
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
  }, [isOpen, user, sheetId, creatingSheet, currentDynasty?.id, auth.retryCount, showDeletedNote])

  useEffect(() => {
    if (!isOpen) {
      setShowDeletedNote(false)
      creatingSheetRef.current = false
      setSheetId(null)
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
        toast.error('Failed to delete the sheet — try again.')
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
          {isLoading ? (
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
