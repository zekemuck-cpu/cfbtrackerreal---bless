import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty, getUserGamePerspective } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'
import AuthErrorModal from './AuthErrorModal'
import { useAuthErrorHandler } from '../hooks/useAuthErrorHandler'
import AIPromptModal from './AIPromptModal'
import SheetToolbar from './SheetToolbar'
import {
  createBowlWeek2Sheet,
  readBowlWeek2GamesFromSheet,
  deleteGoogleSheet,
  getSheetEmbedUrl,
  getCFPQuarterfinalGameName,
  isBowlInWeek2
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

export default function BowlWeek2Modal({ isOpen, onClose, onSave, currentYear, teamColors }) {
  const { currentDynasty, updateDynasty } = useDynasty()
  const modalColors = useMemo(() => getModalColors(teamColors), [teamColors])
  const { user, signOut } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [syncing, setSyncing] = useState(false)
  const [deletingSheet, setDeletingSheet] = useState(false)
  const [creatingSheet, setCreatingSheet] = useState(false)
  const [sheetId, setSheetId] = useState(null)
  const [showDeletedNote, setShowDeletedNote] = useState(false)
  const auth = useAuthErrorHandler()
  const [isMobile, setIsMobile] = useState(false)

  const [useEmbedded, setUseEmbedded] = useState(() => {
    // Load preference from localStorage
    return localStorage.getItem('sheetEmbedPreference') === 'true'
  })
  const [highlightSave, setHighlightSave] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [showAIPrompt, setShowAIPrompt] = useState(false)

  // Semifinal host-bowl picks — prompted here (Bowl Week 3) because EA CFB
  // doesn't reveal the SF hosts during Bowl Week 1 when seeds are entered.
  // Defaults derive from whichever 2 NY6 bowls weren't picked for QFs this
  // year, so users don't see impossible options.
  const computeSfDefaults = () => {
    const saved = currentDynasty?.cfpBowlConfigByYear?.[currentYear] || {}
    const qfBowls = new Set(
      ['seed1', 'seed2', 'seed3', 'seed4']
        .map(k => saved[k])
        .filter(Boolean)
    )
    const remaining = CFP_NY6_BOWLS.filter(b => !qfBowls.has(b))
    const [def1, def2] =
      remaining.length >= 2
        ? remaining
        : [DEFAULT_BOWL_CONFIG.sf1, DEFAULT_BOWL_CONFIG.sf2]
    return {
      sf1: saved.sf1 || def1,
      sf2: saved.sf2 || def2,
    }
  }
  const [sfBowlConfig, setSfBowlConfig] = useState(computeSfDefaults)
  useEffect(() => {
    if (!isOpen) return
    setSfBowlConfig(computeSfDefaults())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentYear, currentDynasty?.cfpBowlConfigByYear])

  // Persist the chosen SF bowl assignments and stamp bowlName on any existing
  // SF game shells. Called from both save paths before onSave.
  const persistSfBowlConfig = async () => {
    if (!currentDynasty?.id) return
    if (sfBowlConfig.sf1 === sfBowlConfig.sf2) {
      toast.error('Each semifinal needs a different host bowl.')
      throw new Error('duplicate SF bowl')
    }
    const existingConfig = currentDynasty.cfpBowlConfigByYear || {}
    const existingYearConfig = existingConfig[currentYear] || {}
    // Stamp bowlName on any SF game shells already created so bracket /
    // history render the right bowl immediately.
    const existingGames = currentDynasty.games || []
    const updatedGames = existingGames.map(g => {
      if (Number(g.year) !== Number(currentYear)) return g
      if (g.cfpSlot === 'cfpsf1' || g.isCFPSemifinal && g.id?.includes('sf1')) {
        return { ...g, bowlName: sfBowlConfig.sf1 }
      }
      if (g.cfpSlot === 'cfpsf2' || g.isCFPSemifinal && g.id?.includes('sf2')) {
        return { ...g, bowlName: sfBowlConfig.sf2 }
      }
      return g
    })
    const gamesChanged = updatedGames.some((g, i) => g !== existingGames[i])
    await updateDynasty(currentDynasty.id, {
      cfpBowlConfigByYear: {
        ...existingConfig,
        [currentYear]: {
          ...existingYearConfig,
          sf1: sfBowlConfig.sf1,
          sf2: sfBowlConfig.sf2,
        },
      },
      ...(gamesChanged ? { games: updatedGames } : {}),
    })
  }

  const aiPrompt = useMemo(() => buildAIPrompt({
    title: `${currentYear} Bowl Week 2 Results`,
    structure: `This sheet has ONE tab: "Bowl Games". It contains up to 12 Week 2 bowl games: 8 regular Week 2 bowls plus 4 CFP Quarterfinal bowls. All bowl names are PRE-FILLED in column A and sorted ALPHABETICALLY. The CFP Quarterfinal rows have the suffix "(CFP QF)" in their bowl name. If the user plays in a bowl themselves, that row may be omitted — so the screenshot's actual pre-filled rows are the SOURCE OF TRUTH for how many rows you output.

═══════════════════════════════════════════════════════════
CRITICAL RULES — read before anything else
═══════════════════════════════════════════════════════════
1. OUTPUT COLUMNS B, C, D, E ONLY (4 values per row). Column A (Bowl Game) is PROTECTED and pre-filled.
2. ROW ORDER IS FIXED — match the screenshot EXACTLY (alphabetical order by bowl name). Each row is keyed to the pre-filled Bowl Game name in column A. Never reorder, never rename, never add rows, never remove rows.
3. Output ONE row per bowl shown in the screenshot, with EXACTLY 4 tab-separated values per row.
4. NO COMMAS in numbers. "24" never "1,234".
5. INTEGERS ONLY for scores — no decimals, no "pts".
6. TEAM ABBREVIATIONS ONLY (columns B and C) — use the abbreviation mapping below. Columns B and C are strict dropdowns.
7. BLANK CELLS if unknown. Never guess, never use "N/A", "TBD", dash. Zero is only valid if the team truly scored zero.
8. No header row, no Bowl Game text, no winner column, no commentary.
9. SINGLE TSV block labeled by tab name and paste cell.

═══════════════════════════════════════════════════════════
TAB: "Bowl Games" — up to 12 rows × 4 editable columns
Paste your block at cell B2 of the "Bowl Games" tab
═══════════════════════════════════════════════════════════

Column A (Bowl Game) is pre-filled alphabetically. The possible pre-filled bowl names are listed below; the actual sheet contains ONLY those that appear in the screenshot, in the order shown.

Possible pre-filled Bowl Game names (sheet is sorted alphabetically — the exact names for the CFP QF bowls vary by the user's configuration, but every CFP QF row ends with " (CFP QF)"):
  Regular Week 2 bowls:
    - Bahamas Bowl
    - Citrus Bowl
    - Duke's Mayo Bowl
    - First Responder Bowl
    - Gator Bowl
    - Reliaquest Bowl
    - Sun Bowl
    - Texas Bowl
  CFP Quarterfinal bowls (4 rows, names from user config, each suffixed "(CFP QF)"):
    - <Seed-1 QF bowl> (CFP QF)     default: Sugar Bowl (CFP QF)
    - <Seed-2 QF bowl> (CFP QF)     default: Cotton Bowl (CFP QF)
    - <Seed-3 QF bowl> (CFP QF)     default: Rose Bowl (CFP QF)
    - <Seed-4 QF bowl> (CFP QF)     default: Orange Bowl (CFP QF)

For each row, in the same top-to-bottom order shown in the screenshot, output these 4 columns:

Col A (PROTECTED)           | Col B (Team 1)   | Col C (Team 2)   | Col D (Team 1 Score) | Col E (Team 2 Score)
----------------------------+------------------+------------------+----------------------+---------------------
pre-filled bowl name        | team abbr        | team abbr        | integer              | integer

Column B, Column C: STRICT dropdown of team abbreviations — use ONLY values from the TEAM ABBREVIATIONS mapping at the bottom of this prompt.
Column D, Column E: integer score (0 or higher), no commas, no decimal point.

CFP QF rows (those with "(CFP QF)" in the name): Team 1 (column B) is the First Round winner (the lower-seeded team that advanced from the First Round, seeds 5-12). Team 2 (column C) is the higher seed that had the bye (seed 1, 2, 3, or 4). Do NOT swap this ordering.

═══════════════════════════════════════════════════════════
REQUIRED OUTPUT FORMAT
═══════════════════════════════════════════════════════════
=== BOWL GAMES — paste at cell B2 of "Bowl Games" tab ===
<row1 Team1>\\t<row1 Team2>\\t<row1 T1Score>\\t<row1 T2Score>
<row2 Team1>\\t<row2 Team2>\\t<row2 T1Score>\\t<row2 T2Score>
... (one row per bowl in the screenshot, in the screenshot's alphabetical order)

(Each \\t above represents a LITERAL TAB character — use actual tab characters in your output, not the text "\\t".)

═══════════════════════════════════════════════════════════
FINAL CHECK before you send the answer
═══════════════════════════════════════════════════════════
[ ] Row count matches the number of bowl rows shown in the screenshot exactly (up to 12)
[ ] Row order matches the screenshot's pre-filled Bowl Game column top-to-bottom (alphabetical)
[ ] Exactly 4 tab-separated values per row (3 tab characters per line)
[ ] Columns B and C are team ABBREVIATIONS only, from the TEAM ABBREVIATIONS mapping
[ ] Scores are INTEGERS only — no commas, no decimals, no "pts"
[ ] For "(CFP QF)" rows: Team 1 is the First Round winner (lower seed), Team 2 is the bye seed (1-4)
[ ] Blank cells for any unknown scores or unplayed bowls — invented nothing
[ ] No header row, no bowl name text, no winner column in the output`,
    includeTeamMap: true,
    dynastyTeams: currentDynasty?.teams,
  }), [currentYear, currentDynasty?.teams])

  // Ref to prevent concurrent sheet creation (state updates are async, refs are immediate)
  const creatingSheetRef = useRef(false)

  useEffect(() => {
    setIsMobile(isMobileDevice())
    const handleResize = () => setIsMobile(isMobileDevice())
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

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

  // Highlight save button when user returns to the window
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

  // Create bowl sheet when modal opens
  useEffect(() => {
    const createSheet = async () => {
      if (isOpen && user && !sheetId && !creatingSheet && !creatingSheetRef.current && !showDeletedNote) {
        // Set ref immediately to prevent concurrent calls (state updates are async)
        creatingSheetRef.current = true
        setCreatingSheet(true)
        try {
          // Get CFP data to pre-fill quarterfinal teams
          const cfpSeeds = currentDynasty?.cfpSeedsByYear?.[currentYear] || []

          // Helper to get seed by tid
          const getSeedByTid = (tid) => cfpSeeds.find(s => s.tid === tid)?.seed

          // Read CFP First Round results from unified games[] array
          // Transform to format expected by the sheet: { seed1, seed2, team1, team2, winner }
          const allGames = currentDynasty?.games || []
          const firstRoundResults = allGames
            .filter(g => g &&
              (g.gameType === 'cfp_first_round' || g.isCFPFirstRound) &&
              Number(g.year) === Number(currentYear))
            .map(g => {
              // For user games, compute team1/team2/winner if not set
              let team1 = g.team1
              let team2 = g.team2
              let winner = g.winner
              let seed1 = g.seed1
              let seed2 = g.seed2

              // Check for unified format with tids
              const teams = currentDynasty?.teams || TEAMS
              if (g.team1Tid && g.team2Tid && !team1) {
                const t1Info = getGameTeamInfo(teams, g.team1Tid)
                const t2Info = getGameTeamInfo(teams, g.team2Tid)
                team1 = t1Info?.abbr || g.team1
                team2 = t2Info?.abbr || g.team2
              }

              // Derive winner from winnerTid if not already set (for CPU games in unified format)
              if (!winner && g.winnerTid) {
                const winnerInfo = getGameTeamInfo(teams, g.winnerTid)
                winner = winnerInfo?.abbr
              }

              // Get perspective for user games
              const perspective = getUserGamePerspective(g, currentDynasty)

              // If this is a user game, derive winner from perspective or result
              if (perspective && !winner) {
                const userTeamInfo = perspective.userTid
                  ? getGameTeamInfo(teams, perspective.userTid)
                  : null
                const oppTeamInfo = perspective.opponentTid
                  ? getGameTeamInfo(teams, perspective.opponentTid)
                  : null
                const userTeam = userTeamInfo?.abbr || g.userTeam || getCurrentTeamAbbr(currentDynasty)
                const oppTeam = oppTeamInfo?.abbr || g.opponent
                winner = perspective.userWon ? userTeam : oppTeam

                // Set team1/team2 if not already set
                if (!team1 || !team2) {
                  team1 = userTeam
                  team2 = oppTeam
                }
              } else if (g.opponent && !winner) {
                // Fallback for legacy user games
                const userTeam = g.userTeam || getCurrentTeamAbbr(currentDynasty)
                const oppTeam = g.opponent
                const userWon = g.result === 'win' || g.result === 'W'
                winner = userWon ? userTeam : oppTeam

                // Set team1/team2 if not already set
                if (!team1 || !team2) {
                  team1 = userTeam
                  team2 = oppTeam
                }
              }

              // Compute seeds from cfpSeeds if not set on the game (use tid for lookup)
              if ((!seed1 || !seed2) && (g.team1Tid || g.team2Tid)) {
                const computedSeed1 = getSeedByTid(g.team1Tid)
                const computedSeed2 = getSeedByTid(g.team2Tid)
                // For first round, seeds are paired: 5v12, 6v11, 7v10, 8v9
                // If we only have one seed, compute the other
                if (computedSeed1 && !computedSeed2) {
                  seed1 = computedSeed1
                  seed2 = 17 - computedSeed1
                } else if (!computedSeed1 && computedSeed2) {
                  seed2 = computedSeed2
                  seed1 = 17 - computedSeed2
                } else {
                  seed1 = computedSeed1
                  seed2 = computedSeed2
                }
              }

              // Carry tids alongside abbrs so downstream "did the user
              // win their first-round game?" check can compare by tid
              // (survives teambuilder abbr drift, defends against two
              // teams with the same abbr).
              const team1Tid = g.team1Tid != null ? Number(g.team1Tid) :
                (perspective?.userTid != null && (perspective.userTid === g.userTid || g.userTeam === team1)
                  ? Number(perspective.userTid)
                  : null)
              const team2Tid = g.team2Tid != null ? Number(g.team2Tid) :
                (perspective?.opponentTid != null
                  ? Number(perspective.opponentTid)
                  : (g.opponentTid != null ? Number(g.opponentTid) : null))
              const winnerTid = g.winnerTid != null ? Number(g.winnerTid) :
                (perspective ? (perspective.userWon ? team1Tid : team2Tid) :
                  (g.result === 'win' || g.result === 'W' ? team1Tid : team2Tid))

              return {
                seed1,
                seed2,
                team1,
                team2,
                team1Tid,
                team2Tid,
                team1Score: g.team1Score,
                team2Score: g.team2Score,
                winner,
                winnerTid
              }
            })

          // Calculate which games to exclude (user's CFP QF game + user's Week 2 bowl game)
          const excludeGames = []

          // Get CFP bowl config for this year
          const cfpBowlConfigForExclude = currentDynasty?.cfpBowlConfigByYear?.[currentYear] || null

          // Check if user is in CFP (seeds 1-12)
          const userTeamTid = getCurrentTeamTid(currentDynasty)
          const userTeamAbbr = getCurrentTeamAbbr(currentDynasty) // Still need abbr for winner comparison
          const userCFPSeed = cfpSeeds.find(s => s.tid === userTeamTid)?.seed || null

          if (userCFPSeed) {
            // Seeds 1-4 have bye, play in QF
            if (userCFPSeed >= 1 && userCFPSeed <= 4) {
              const qfGameName = getCFPQuarterfinalGameName(userCFPSeed, [], cfpBowlConfigForExclude)
              if (qfGameName) {
                excludeGames.push(qfGameName)
              }
            }
            // Seeds 5-12 who won First Round also play in QF
            else if (userCFPSeed >= 5 && userCFPSeed <= 12) {
              // Check if user won their First Round game. Tid-first; fall
              // back to abbr only if no tid is available on either side.
              const userFirstRoundGame = firstRoundResults.find(g => {
                if (!g) return false
                if (userTeamTid != null && g.winnerTid != null) {
                  return Number(g.winnerTid) === Number(userTeamTid)
                }
                return g.winner === userTeamAbbr
              })
              if (userFirstRoundGame) {
                const qfGameName = getCFPQuarterfinalGameName(userCFPSeed, firstRoundResults, cfpBowlConfigForExclude)
                if (qfGameName) {
                  excludeGames.push(qfGameName)
                }
              }
            }
          }

          // Check if user has a Week 2 bowl game
          const userBowlGame = currentDynasty?.bowlEligibilityDataByYear?.[currentYear]?.bowlGame
          if (userBowlGame && isBowlInWeek2(userBowlGame)) {
            excludeGames.push(userBowlGame)
          }

          // Get existing bowl week 2 data for pre-filling
          // First get legacy bowlGamesByYear data
          const legacyBowlWeek2 = currentDynasty?.bowlGamesByYear?.[currentYear]?.week2 || []

          // Also check unified games[] array for bowl games
          const unifiedBowlGames = (currentDynasty?.games || [])
            .filter(g => {
              // Check if it's a bowl game from this year
              if (Number(g.year) !== currentYear) return false
              // Check game type - could be 'bowl' or detected by bowlName
              const isBowl = g.gameType === 'bowl' || (g.bowlName && !g.bowlName.includes('CFP'))
              if (!isBowl) return false
              // Only include week 2 bowls
              return isBowlInWeek2(g.bowlName)
            })
            .map(g => {
              // Handle unified format with tids
              const teams = currentDynasty?.teams || TEAMS
              const t1Info = g.team1Tid ? getGameTeamInfo(teams, g.team1Tid) : null
              const t2Info = g.team2Tid ? getGameTeamInfo(teams, g.team2Tid) : null

              // Convert to the format expected by the sheet (team1/team2 style)
              if (g.opponent) {
                // User game - convert from opponent format
                return {
                  bowlName: g.bowlName,
                  team1: g.userTeam || userTeamAbbr,
                  team2: g.opponent,
                  team1Score: g.teamScore,
                  team2Score: g.opponentScore
                }
              } else {
                // CPU game format - handle both legacy (team1/team2) and unified (team1Tid/team2Tid) formats
                return {
                  bowlName: g.bowlName,
                  team1: g.team1 || t1Info?.abbr,
                  team2: g.team2 || t2Info?.abbr,
                  team1Score: g.team1Score,
                  team2Score: g.team2Score
                }
              }
            })

          // Merge legacy and unified, preferring unified (newer) data
          const existingBowlWeek2 = [...legacyBowlWeek2]
          unifiedBowlGames.forEach(ug => {
            const existingIndex = existingBowlWeek2.findIndex(eb => eb.bowlName === ug.bowlName)
            if (existingIndex >= 0) {
              existingBowlWeek2[existingIndex] = ug // Replace with unified data
            } else {
              existingBowlWeek2.push(ug)
            }
          })

          // Read existing CFP Quarterfinal results from unified games[] array
          const existingCFPQuarterfinals = allGames
            .filter(g => g &&
              (g.gameType === 'cfp_quarterfinal' || g.isCFPQuarterfinal) &&
              Number(g.year) === Number(currentYear))
            .map(g => {
              // Handle unified format with tids
              const teams = currentDynasty?.teams || TEAMS
              const t1Info = g.team1Tid ? getGameTeamInfo(teams, g.team1Tid) : null
              const t2Info = g.team2Tid ? getGameTeamInfo(teams, g.team2Tid) : null
              return {
                bowl: g.bowlName,
                team1: g.team1 || t1Info?.abbr,
                team2: g.team2 || t2Info?.abbr,
                score1: g.team1Score,
                score2: g.team2Score,
                winner: g.winner || (g.winnerTid ? getGameTeamInfo(teams, g.winnerTid)?.abbr : null)
              }
            })

          // Get CFP bowl config for this year (determines which NY6 bowls host QF games)
          const cfpBowlConfig = currentDynasty?.cfpBowlConfigByYear?.[currentYear] || null

          const sheetInfo = await createBowlWeek2Sheet(
            currentDynasty?.teamName || 'Dynasty',
            currentYear,
            cfpSeeds,
            firstRoundResults,
            excludeGames,
            existingBowlWeek2,
            existingCFPQuarterfinals,
            currentDynasty?.teams || currentDynasty?.customTeams,
            cfpBowlConfig
          )
          setSheetId(sheetInfo.spreadsheetId)
        } catch (error) {
          console.error('Failed to create bowl Week 2 sheet:', error)
        } finally {
          setCreatingSheet(false)
          creatingSheetRef.current = false
        }
      }
    }

    createSheet()
  }, [isOpen, user, sheetId, creatingSheet, currentDynasty?.id, auth.retryCount, showDeletedNote])

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShowDeletedNote(false)
      creatingSheetRef.current = false
      setSheetId(null)
    }
  }, [isOpen])

  const handleSyncFromSheet = async () => {
    if (!sheetId) return

    setSyncing(true)
    try {
      await persistSfBowlConfig()
      const bowlGames = await readBowlWeek2GamesFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(bowlGames)
      onClose()
    } catch (error) {
      if (error?.message === 'duplicate SF bowl') { setSyncing(false); return }
      console.error(error)
      if (!auth.handleError(error)) {
        toast.error('Failed to sync from Google Sheets. Make sure data is properly formatted.')
      }
    } finally {
      setSyncing(false)
    }
  }

  const handleSyncAndDelete = async () => {
    if (!sheetId) return

    setDeletingSheet(true)
    try {
      await persistSfBowlConfig()
      const bowlGames = await readBowlWeek2GamesFromSheet(sheetId, (currentDynasty?.teams || currentDynasty?.customTeams))
      await onSave(bowlGames)

      // Move sheet to trash (keep sheet ID stored so user can restore if needed)
      await deleteGoogleSheet(sheetId)

      setSheetId(null)
      setShowDeletedNote(true)
      setTimeout(() => {
        onClose()
      }, 2500)
    } catch (error) {
      if (error?.message === 'duplicate SF bowl') { setDeletingSheet(false); return }
      console.error(error)
      if (!auth.handleError(error)) {
        toast.error('Failed to sync from Google Sheets.')
      }
    } finally {
      setDeletingSheet(false)
    }
  }

  const handleRegenerateSheet = async () => {
    if (!sheetId) return

    const confirmed = await confirm({
      title: 'Regenerate sheet?',
      message: "This will delete your current sheet and create a fresh one. Any unsaved data will be lost.",
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

  const handleClose = () => {
    onClose()
  }

  if (!isOpen) return null

  const embedUrl = sheetId ? getSheetEmbedUrl(sheetId, 'Bowl Games') : null
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
        <div className="h-[3px] w-full" style={{ backgroundColor: 'var(--text-primary)' }} aria-hidden="true" />
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-surface-4">
          <h2 className="text-2xl font-bold text-txt-primary">
            Bowl Week 2 Results
          </h2>
          <button aria-label="Close"
            onClick={handleClose}
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
                style={{
                  borderColor: 'var(--text-primary)',
                  borderTopColor: 'transparent'
                }}
              />
              <p className="text-lg font-semibold text-txt-primary">
                Creating Bowl Week 2 Sheet...
              </p>
              <p className="text-sm mt-2 text-txt-tertiary">
                Setting up 12 bowl games
              </p>
              <SheetLoadingHint active={isLoading} />
            </div>
          </div>
        ) : showDeletedNote ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="card p-8 border-l-[3px] text-center max-w-sm" style={{ borderLeftColor: 'var(--surface-5)' }}>
              <p className="label-xs text-txt-tertiary mb-2">Status</p>
              <p className="text-xl font-bold text-txt-primary mb-2">Saved &amp; Moved to Trash</p>
              <p className="text-sm text-txt-secondary">
                Bowl Week 2 data saved to your dynasty.
              </p>
            </div>
          </div>
        ) : sheetId ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Semifinal bowl host assignment — must be entered now because
                EA CFB reveals these hosts at Bowl Week 3, not Week 1. */}
            <div
              className="mb-3 p-3 rounded-lg border flex-shrink-0"
              style={{ borderColor: modalColors.border, backgroundColor: modalColors.headerBg }}
            >
              <h4
                className="text-xs font-bold uppercase mb-1.5"
                style={{ color: 'var(--text-primary)', letterSpacing: '1.5px' }}
              >
                Semifinal Host Bowls
              </h4>
              {(() => {
                // The 2 bowls available as SF hosts are whichever NY6 bowls
                // were NOT picked as QF hosts at Week 1. Derived per-year so
                // it reflects whatever the user assigned that specific season.
                const savedConfig = currentDynasty?.cfpBowlConfigByYear?.[currentYear] || {}
                const qfBowls = new Set(
                  ['seed1', 'seed2', 'seed3', 'seed4']
                    .map(k => savedConfig[k])
                    .filter(Boolean)
                )
                const sfOptions = CFP_NY6_BOWLS.filter(b => !qfBowls.has(b))
                // Fallback: if QF config is missing (older dynasty), show all 6
                // to avoid an empty dropdown.
                const bowlChoices = sfOptions.length > 0 ? sfOptions : CFP_NY6_BOWLS
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { key: 'sf1', label: 'Semifinal 1 host (1/4-seed bracket)' },
                      { key: 'sf2', label: 'Semifinal 2 host (2/3-seed bracket)' },
                    ].map(({ key, label }) => {
                      // Make sure the currently-selected value is in the
                      // options list (else the select renders blank).
                      const current = sfBowlConfig[key]
                      const optionsForThisSelect = bowlChoices.includes(current)
                        ? bowlChoices
                        : [current, ...bowlChoices]
                      return (
                        <div key={key}>
                          <label className="text-[10px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                            {label}
                          </label>
                          <select
                            value={current}
                            onChange={(e) => setSfBowlConfig(prev => ({ ...prev, [key]: e.target.value }))}
                            className="w-full px-2 py-1 rounded text-xs border"
                            style={{
                              borderColor: modalColors.inputBorder,
                              backgroundColor: modalColors.inputBg,
                              color: 'var(--text-primary)',
                            }}
                          >
                            {optionsForThisSelect.map(bowl => (
                              <option key={bowl} value={bowl}>{bowl}</option>
                            ))}
                          </select>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
              {sfBowlConfig.sf1 === sfBowlConfig.sf2 && (
                <p className="text-[11px] mt-1.5 text-red-400 font-medium">
                  Each semifinal needs a different host bowl.
                </p>
              )}
            </div>

            {/* Action Buttons - only show at top for embedded view */}
            {!isMobile && useEmbedded && (
              <div className="mb-3">
                <div className="flex gap-3 flex-wrap items-center">
                  <button
                    onClick={handleSyncAndDelete}
                    disabled={syncing || deletingSheet}
                    className={`px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-all text-sm ${highlightSave ? 'animate-pulse ring-4 ring-offset-2 scale-105' : ''}`}
                    style={{
                      backgroundColor: 'var(--text-primary)',
                      color: 'var(--surface-1)'
                    }}
                  >
                    {deletingSheet ? 'Saving...' : 'Save & Move to Trash'}
                  </button>
                  <button
                    onClick={handleSyncFromSheet}
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
                    style={{
                      backgroundColor: 'transparent',
                      borderColor: '#EF4444',
                      color: '#EF4444'
                    }}
                  >
                    {regenerating ? 'Regenerating...' : 'Regenerate sheet'}
                  </button>
                  {highlightSave && (
                    <span className="text-xs font-medium animate-bounce" style={{ color: 'var(--text-primary)' }}>

                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Toggle between embedded and new tab */}
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
                <div className="text-left mb-6 max-w-sm w-full card p-4 border-l-[3px]" style={{ borderLeftColor: 'var(--surface-5)' }}>
                  <p className="label-xs text-txt-tertiary mb-3">Instructions</p>
                  <ol className="text-sm space-y-2 text-txt-secondary">
                    <li className="flex gap-3"><span className="font-bold text-txt-primary tabular-nums">1.</span><span>Tap the button below to open Google Sheets</span></li>
                    <li className="flex gap-3"><span className="font-bold text-txt-primary tabular-nums">2.</span><span>Enter Bowl Week 2 results</span></li>
                    <li className="flex gap-3"><span className="font-bold text-txt-primary tabular-nums">3.</span><span>Return to this app when done</span></li>
                    <li className="flex gap-3"><span className="font-bold text-txt-primary tabular-nums">4.</span><span>Tap "Save" below to sync results</span></li>
                  </ol>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-3 mb-6">
                  <a href={`https://docs.google.com/spreadsheets/d/${sheetId}/edit`} target="_blank" rel="noopener noreferrer" className="px-6 py-3 rounded-lg font-bold text-lg hover:opacity-90 transition-colors flex items-center gap-2" style={{ backgroundColor: '#0F9D58', color: '#FFFFFF' }}>
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/><path d="M7 7h2v2H7zm0 4h2v2H7zm0 4h2v2H7zm4-8h6v2h-6zm0 4h6v2h-6zm0 4h6v2h-6z"/></svg>
                    Open Google Sheets
                  </a>
                  <button
                    onClick={() => setShowAIPrompt(true)}
                    className="px-4 py-2 rounded-lg text-sm font-medium border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent"
                  >
                    AI Prompt
                  </button>
                </div>

                {/* Centered Save Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 items-center justify-center mb-4">
                  <button
                    onClick={handleSyncAndDelete}
                    disabled={syncing || deletingSheet}
                    className={`px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-all text-sm ${highlightSave ? 'animate-pulse ring-4 ring-offset-2 scale-105' : ''}`}
                    style={{
                      backgroundColor: 'var(--text-primary)',
                      color: 'var(--surface-1)'
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
                {/* Start Over Button */}
                <button
                  onClick={handleRegenerateSheet}
                  disabled={syncing || deletingSheet || regenerating}
                  className="text-xs px-4 py-2 rounded-lg font-medium hover:opacity-90 transition-colors border mb-4"
                  style={{
                    backgroundColor: 'transparent',
                    borderColor: '#EF4444',
                    color: '#EF4444'
                  }}
                >
                  {regenerating ? 'Regenerating...' : 'Messed up? Regenerate sheet'}
                </button>
                {highlightSave && (
                  <span className="text-sm font-medium animate-bounce mb-4" style={{ color: 'var(--text-primary)' }}>

                  </span>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
        </div>
      </div>

      {/* Auth Error Modal */}
      <AuthErrorModal
        isOpen={auth.showAuthError}
        onClose={auth.closeAuthError}
        onRefresh={auth.retry}
        teamColors={teamColors}
      />

      <AIPromptModal
        isOpen={showAIPrompt}
        onClose={() => setShowAIPrompt(false)}
        title={`${currentYear} Bowl Week 2 Results`}
        prompt={aiPrompt}
        pasteTarget={`Cell B2 of the "Bowl Games" tab`}
      />
    </div>,
    document.body,
  )
}
