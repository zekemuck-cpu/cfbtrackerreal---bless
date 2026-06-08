import { useState, useEffect, useMemo, useRef } from 'react'
import { proxyImageUrl } from '../../utils/imageProxy'
import { saveWeeklyGamesChanges } from '../../services/dynastyService'
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom'
import { useDynasty, getCurrentSchedule, getScheduleWithGameData, getCurrentRoster, getCurrentPreseasonSetup, getCurrentTeamRatings, getCurrentCoachingStaff, getCurrentGoogleSheet, findCurrentTeamGame, getCurrentTeamGames, GAME_TYPES, getGamesByType, getCurrentCustomConferences, MOVEMENT_TYPES, createMovement, getUserGamePerspective, isTeamInGame, getTeamGamePerspective, isFirstYearOnTeam, getCurrentTeamRecord, getCurrentTeamRanking, getEncourageTransfers, getRecruitingCommitments, getConferenceChampionshipData, createOrUpdateCFPGameShells, createOrUpdateBowlGameShell, getUserCFPGameStatus, getCFPRoundDisplayName, propagateCFPWinner, findUserCFPGameShell, isPlayerOnRoster, getPlayerClassForYear, lookupByTeamYear, getTeamConferenceForDynasty, CLASS_PROGRESSION } from '../../context/DynastyContext'
import { useAuth } from '../../context/AuthContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useTeamColors } from '../../hooks/useTeamColors'
import { getContrastTextColor } from '../../utils/colorUtils'
import { StatRings } from '../../components/CfbUI'
import { getPlayerStatsForTid, getTeamStatsForTid, hasAnyPlayerStats, hasAnyTeamStats } from '../../utils/boxScoreHelpers'
import { teamAbbreviations } from '../../data/teamAbbreviations'
import { TEAMS, resolveTid, getTeamByAbbr, getTidFromAbbr, getTidFromTeamName, setTeamYearField, getCurrentTeamTid, getCurrentTeamAbbr, getOriginalTeamAbbr, getGameTeamInfo, getGameOpponentInfo, getAbbrFromTeamName, getNameByAbbr, setPendingUserTeam, clearPendingUserTeam, getPendingUserTeamTid, getUserTeamTid } from '../../data/teamRegistry'
import { getTeamLogo, teams } from '../../data/teams'
import { getTeamColors } from '../../data/teamColors'
import { getTeamConference } from '../../data/conferenceTeams'
import { getConferenceLogo } from '../../data/conferenceLogos'
import SearchableSelect from '../../components/SearchableSelect'
import DropdownSelect from '../../components/DropdownSelect'
import ScheduleEntryModal from '../../components/ScheduleEntryModal'
import RosterEntryModal from '../../components/RosterEntryModal'
import TeamRatingsModal from '../../components/TeamRatingsModal'
// GameEntryModal and GameDetailModal removed - now using game pages instead
import ConferenceChampionshipModal from '../../components/ConferenceChampionshipModal'
import CoachingStaffModal from '../../components/CoachingStaffModal'
import BowlWeek1Modal from '../../components/BowlWeek1Modal'
import BowlWeek2Modal from '../../components/BowlWeek2Modal'
import WeeklyScoresModal from '../../components/WeeklyScoresModal'
import CFPSeedsModal from '../../components/CFPSeedsModal'
import CFPFirstRoundModal from '../../components/CFPFirstRoundModal'
import CFPQuarterfinalsModal from '../../components/CFPQuarterfinalsModal'
import CFPSemifinalsModal from '../../components/CFPSemifinalsModal'
import CFPChampionshipModal from '../../components/CFPChampionshipModal'
import ConferencesModal from '../../components/ConferencesModal'
import StatsEntryModal from '../../components/StatsEntryModal'
import DetailedStatsEntryModal from '../../components/DetailedStatsEntryModal'
import ConferenceStandingsModal from '../../components/ConferenceStandingsModal'
import FinalPollsModal from '../../components/FinalPollsModal'
import TeamStatsModal from '../../components/TeamStatsModal'
import AwardsModal from '../../components/AwardsModal'
import AllAmericansModal from '../../components/AllAmericansModal'
import AllConferenceModal from '../../components/AllConferenceModal'
import PlayerMatchConfirmModal from '../../components/PlayerMatchConfirmModal'
import ReturningPlayerConfirmModal from '../../components/ReturningPlayerConfirmModal'
import NewJobEditModal from '../../components/NewJobEditModal'
import PlayersLeavingModal from '../../components/PlayersLeavingModal'
import DraftResultsModal from '../../components/DraftResultsModal'
import TransferDestinationsModal from '../../components/TransferDestinationsModal'
import RecruitingCommitmentsModal from '../../components/RecruitingCommitmentsModal'
import RecruitingInsightLink from '../../components/ui/RecruitingInsightLink'
import SellVsSendCalculator, { SellVsSendButton } from '../../components/SellVsSendCalculator'
import PositionChangesModal from '../../components/PositionChangesModal'
import RecruitingClassRankModal from '../../components/RecruitingClassRankModal'
import TrainingResultsModal from '../../components/TrainingResultsModal'
import WeekRecapModal from '../../components/WeekRecapModal'
import FormattedRecap from '../../components/FormattedRecap'
import buildRecapLinks from '../../utils/buildRecapLinks'
import PreseasonTop25Modal from '../../components/PreseasonTop25Modal'
import EncourageTransfersModal from '../../components/EncourageTransfersModal'
import RecruitOverallsModal from '../../components/RecruitOverallsModal'
import PortalTransferClassModal from '../../components/PortalTransferClassModal'
import FringeCaseClassModal from '../../components/FringeCaseClassModal'
import { isBowlInWeek1, isBowlInWeek2 } from '../../services/sheetsService'
import { isSameYear } from '../../utils/compareUtils'
import { calculateRecruitingClassScore, formatRecruitingClassScore, flattenClassCommitments } from '../../utils/recruitingScore'

// Helper function to normalize player names for consistent lookup
const normalizePlayerName = (name) => {
  if (!name) return ''
  return name.trim().toLowerCase()
}

// Shared todo-row renderer used by both the in-season weekly todo
// block and the bowl-week branches. Each item in `todos`:
//   { key, done, title, subtitle?, viewTo?, onAction?, actionLabel?,
//     extraTools?, extraLeading?, inlineAction? }
// - done: bool → green vs red status dot
// - viewTo: nav target for the "View" link (or omitted to suppress)
// - actionLabel + onAction: primary action button text + handler
// - extraTools / extraLeading: optional adornments (e.g. recruiting-row
//   icons, status text below the title)
function renderTodoList({ todos, isViewOnly }) {
  if (!todos || todos.length === 0) return null
  return (
    <div className="media-card overflow-hidden">
      {todos.map((todo, idx) => (
        <div
          key={todo.key}
          style={idx > 0 ? { borderTop: '1px solid var(--surface-4)' } : undefined}
        >
          <div className="px-3 py-2.5 sm:px-5 sm:py-4 flex items-center gap-2 sm:gap-4">
            <div className="flex-1 min-w-0 flex items-center gap-2 sm:gap-3">
              <span
                aria-hidden="true"
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{
                  backgroundColor: todo.done
                    ? 'var(--accent-success)'
                    : 'var(--accent-error)',
                }}
              />
              {todo.extraLeading}
              <div className="min-w-0">
                <div
                  className="font-display font-bold leading-tight text-txt-primary break-words"
                  style={{ fontSize: 'clamp(0.875rem, 1.4vw, 1.0625rem)', letterSpacing: '-0.015em' }}
                >
                  {todo.title}
                </div>
                {todo.inlineAction && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); todo.inlineAction.onClick() }}
                    className="mt-1 text-[11px] uppercase font-bold text-txt-tertiary hover:text-txt-secondary underline underline-offset-2 transition-colors"
                    style={{ letterSpacing: '1.2px' }}
                  >
                    {todo.inlineAction.label}
                  </button>
                )}
              </div>
            </div>
            {!isViewOnly && todo.actionLabel && (
              <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 [&_.btn-refined]:min-w-[4.5rem]">
                {todo.extraTools}
                {todo.viewTo && (
                  <Link to={todo.viewTo} className="btn-refined text-center">
                    View
                  </Link>
                )}
                <button
                  onClick={todo.onAction}
                  className="btn-refined btn-refined--solid text-center"
                >
                  {todo.actionLabel}
                </button>
              </div>
            )}
          </div>
          {todo.belowContent && (
            <div className="px-3 pb-3 sm:px-5 sm:pb-4">
              {todo.belowContent}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const { currentDynasty, loadingDynastyId, saveSchedule, saveRoster, saveTeamRatings, saveCoachingStaff, saveConferences, saveConferenceAlignment, addGame, saveCPUBowlGames, saveCFPGames, saveCPUConferenceChampionships, updateDynasty, updatePlayer, processHonorPlayers, isViewOnly, exportDynasty } = useDynasty()

  // Check if dynasty data is being lazily loaded
  const isLoadingDynastyData = loadingDynastyId === currentDynasty?.id
  const { user } = useAuth()
  const { id: dynastyId, shareCode } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  // NEW: Get user team info from the team with userId: 'currentUser' (single source of truth)
  const userTeamTid = getUserTeamTid(currentDynasty)
  const userTeamData = userTeamTid && currentDynasty?.teams?.[userTeamTid]
  const userTeamName = userTeamData?.name || currentDynasty?.teamName

  const teamColors = useTeamColors(userTeamName, currentDynasty?.teams || currentDynasty?.customTeams)
  // Team primary as a hex (alpha suffixes need hex) for the CFB-27 team-color
  // treatment on the dashboard.
  const teamAccent = teamColors?.primary || '#374151'
  const teamBgText = getContrastTextColor(teamAccent)
  // CFB-27 broadcast section labels: the title sits in a SOLID team-color
  // block (contrast text + subtle top sheen) — a proper broadcast bug, not a
  // faint wash. The header row itself stays a clean dark strip so any controls
  // beside the label keep their contrast.
  const sectionStripStyle = { borderBottom: '1px solid var(--surface-4)' }
  const teamLabelStyle = {
    backgroundColor: teamAccent,
    color: teamBgText,
    backgroundImage:
      'linear-gradient(120deg, rgba(255,255,255,0.20) 0%, rgba(255,255,255,0) 58%), linear-gradient(180deg, rgba(255,255,255,0.10) 0%, transparent 45%, rgba(0,0,0,0.18) 100%)',
  }

  // Build path prefix from the actual route — `/view/:shareCode` for
  // public viewers, `/dynasty/:id` for everyone else (owners + shared
  // editors, premium or not). isViewOnly is unrelated to routing: a
  // non-premium shared editor still navigates the regular `/dynasty/`
  // path; their writes are blocked separately by the rules + UI gates.
  const pathPrefix = usePathPrefix()
  const secondaryBgText = 'var(--surface-1)'
  const primaryBgText = 'var(--surface-1)'

  // Helper to check if a game has actually been played (has scores)
  // Games are created when schedule is saved, but aren't "played" until scores are entered
  const isGameActuallyPlayed = (game) => {
    if (!game) return false
    if (game.isPlayed) return true
    const team1Score = game.team1Score ?? game.teamScore ?? 0
    const team2Score = game.team2Score ?? game.opponentScore ?? 0
    return team1Score > 0 || team2Score > 0
  }

  // Use team-centric helper functions for all team-specific data
  // getScheduleWithGameData merges game records into schedule entries
  const teamSchedule = useMemo(() => getScheduleWithGameData(currentDynasty), [currentDynasty])
  const teamRoster = getCurrentRoster(currentDynasty)
  const teamPreseasonSetup = getCurrentPreseasonSetup(currentDynasty)
  const teamRatings = getCurrentTeamRatings(currentDynasty)
  // Recap link patterns are derived from dynasty.games + dynasty.teams +
  // the year. Hundreds of patterns get built; the work is real, so we
  // only do it when a recap is actually going to be rendered (the
  // Dashboard's recap card only shows in regular_season after week 1).
  // Without this guard the build fired on every Dashboard render —
  // dynasty.games is a fresh array reference after any Firestore write,
  // which busted the memo even when the user wasn't on a screen that
  // shows the recap.
  const recapLinks = useMemo(() => {
    if (currentDynasty?.currentPhase !== 'regular_season') return null
    const cw = Number(currentDynasty?.currentWeek)
    if (!Number.isFinite(cw) || cw < 2) return null
    const yr = Number(currentDynasty?.currentYear)
    const lastWeekText = currentDynasty?.weekRecapsByYear?.[yr]?.[cw - 1]?.text
    if (!lastWeekText) return null
    return buildRecapLinks(currentDynasty, yr, pathPrefix, lastWeekText)
  }, [
    currentDynasty?.id,
    currentDynasty?.currentYear,
    currentDynasty?.currentWeek,
    currentDynasty?.currentPhase,
    currentDynasty?.games,
    currentDynasty?.teams,
    currentDynasty?.weekRecapsByYear,
    pathPrefix,
  ])
  // Pass uid so a member's per-uid override (Members page → Your Coaching
  // Staff) wins over the legacy single-staff field. Multi-coach dynasties
  // depend on this so each user sees their own coordinators in the
  // dashboard panels.
  const teamCoachingStaff = getCurrentCoachingStaff(currentDynasty, user?.uid)
  const teamGoogleSheet = getCurrentGoogleSheet(currentDynasty)

  // Get user games for the current year (for schedule display)
  // Uses unified game format: games have team1Tid/team2Tid, user perspective derived from coachTeamByYear
  const userGamesThisYear = useMemo(() => {
    return (currentDynasty?.games || [])
      .filter(g => Number(g.year) === Number(currentDynasty?.currentYear))
      .map(g => {
        const perspective = getUserGamePerspective(g, currentDynasty)
        return perspective ? { ...g, perspective } : null
      })
      .filter(Boolean)
  }, [currentDynasty?.games, currentDynasty?.currentYear, currentDynasty?.coachTeamByYear])

  // Around-the-conference scoreboard data. Shows other conference games
  // from the most recent week with multiple played non-user games — the
  // dashboard widget pictured in the redesign mockup. Filters to the
  // user's conference when available, falls back to "all played games"
  // otherwise so a non-FBS / Independent dynasty still gets a view.
  const scoreboardData = useMemo(() => {
    const games = currentDynasty?.games || []
    const yr = Number(currentDynasty?.currentYear)
    if (!Number.isFinite(yr)) return { week: null, games: [] }

    const userTid = currentDynasty?.currentTid != null ? Number(currentDynasty.currentTid) : null
    // Find the latest week where there are at least 2 non-user played games.
    let chosenWeek = -1
    const weekBuckets = new Map()
    for (const g of games) {
      if (!g || Number(g.year) !== yr) continue
      if (typeof g.team1Score !== 'number' || typeof g.team2Score !== 'number') continue
      const wk = typeof g.week === 'number' ? g.week : parseInt(g.week, 10)
      if (!Number.isFinite(wk)) continue
      const t1 = Number(g.team1Tid)
      const t2 = Number(g.team2Tid)
      if (userTid != null && (t1 === userTid || t2 === userTid)) continue
      if (!weekBuckets.has(wk)) weekBuckets.set(wk, [])
      weekBuckets.get(wk).push(g)
    }
    for (const [wk, list] of weekBuckets.entries()) {
      if (list.length >= 2 && wk > chosenWeek) chosenWeek = wk
    }
    if (chosenWeek < 0) return { week: null, games: [] }

    const teamsSrc = currentDynasty?.teams || currentDynasty?.customTeams
    const userConference = (() => {
      if (!userTid) return null
      const userAbbr = teamsSrc?.[userTid]?.abbr
      if (!userAbbr) return null
      const customConfs = getCurrentCustomConferences(currentDynasty)
      return getTeamConferenceForDynasty(currentDynasty, userAbbr, yr) ||
             getTeamConference(userAbbr, customConfs, teamsSrc) ||
             null
    })()

    let pool = weekBuckets.get(chosenWeek)
    if (userConference) {
      const customConfs = getCurrentCustomConferences(currentDynasty)
      const inConf = (tid) => {
        if (tid == null) return false
        const abbr = teamsSrc?.[Number(tid)]?.abbr
        if (!abbr) return false
        const conf = getTeamConferenceForDynasty(currentDynasty, abbr, yr) ||
                     getTeamConference(abbr, customConfs, teamsSrc)
        return conf === userConference
      }
      const confGames = pool.filter(g => inConf(g.team1Tid) || inConf(g.team2Tid))
      if (confGames.length > 0) pool = confGames
    }

    // Sort by tid pair so the order is stable across renders.
    const sorted = [...pool].sort((a, b) => {
      const aKey = `${Math.min(Number(a.team1Tid) || 0, Number(a.team2Tid) || 0)}-${Math.max(Number(a.team1Tid) || 0, Number(a.team2Tid) || 0)}`
      const bKey = `${Math.min(Number(b.team1Tid) || 0, Number(b.team2Tid) || 0)}-${Math.max(Number(b.team1Tid) || 0, Number(b.team2Tid) || 0)}`
      return aKey.localeCompare(bKey)
    })

    return { week: chosenWeek, games: sorted, conference: userConference }
  }, [currentDynasty?.games, currentDynasty?.currentYear, currentDynasty?.currentTid, currentDynasty?.teams, currentDynasty?.customConferencesByYear])

  // Use centralized single-source-of-truth record (used in schedule section)
  const scheduleRecord = getCurrentTeamRecord(currentDynasty)
  const wins = scheduleRecord?.wins || 0
  const losses = scheduleRecord?.losses || 0
  const confWins = scheduleRecord?.confWins || 0
  const confLosses = scheduleRecord?.confLosses || 0

  // IMPORTANT: On Signing Day (week 6) and Training Camp (week 7), the year has already flipped.
  // Use offseasonDataYear for data that was entered during weeks 1-5 (playersLeaving, recruiting, etc.)
  const isAfterYearFlip = currentDynasty?.currentPhase === 'offseason' && currentDynasty?.currentWeek >= 6
  const offseasonDataYear = isAfterYearFlip
    ? currentDynasty?.currentYear - 1
    : currentDynasty?.currentYear

  // Aggregate team stats from box scores for pre-filling the Team Stats sheet
  const aggregatedTeamStats = useMemo(() => {
    if (!currentDynasty?.games) return {}

    const currentTeamAbbr = getCurrentTeamAbbr(currentDynasty)
    const year = currentDynasty.currentYear

    // Offense stats
    let pointsFor = 0
    let totalOffense = 0
    let rushAttempts = 0
    let rushYards = 0
    let rushTds = 0
    let passAttempts = 0
    let passYards = 0
    let passTds = 0
    let firstDowns = 0

    // Defense stats
    let pointsAgainst = 0
    let defTotalYards = 0
    let defPassYards = 0
    let defRushYards = 0
    let defSacks = 0
    let forcedFumbles = 0
    let defInterceptions = 0

    let gamesWithStats = 0

    currentDynasty.games.forEach(game => {
      if (parseInt(game.year) !== year) return

      // Use unified game perspective to determine if user's team is in this game
      const perspective = getUserGamePerspective(game, currentDynasty)
      if (!perspective) return // Not a user game

      // Always count points from game scores
      pointsFor += perspective.userScore || 0
      pointsAgainst += perspective.opponentScore || 0

      if (!game.boxScore) return

      // All box-score lookups go through the tid-keyed helpers so a
      // teambuilder team renamed mid-dynasty still aggregates pre-rename
      // games, and legacy {home, away} games still resolve correctly.
      const userTid = perspective.userTid
      const teamsForResolve = currentDynasty?.teams
      const ourPlayerBoxScore = getPlayerStatsForTid(game, userTid, teamsForResolve)
      const oppTid = (game.team1Tid === userTid) ? game.team2Tid : game.team1Tid
      const ourTeamStats = getTeamStatsForTid(game, userTid, teamsForResolve)
      const oppTeamStats = oppTid != null ? getTeamStatsForTid(game, oppTid, teamsForResolve) : null

      // Aggregate offense from team stats.
      if (ourTeamStats) {
        gamesWithStats++
        // Box score team stats reach us under two key schemas depending on
        // path: the Team Stats sheet round-trip camelCases labels ("Total
        // Yards" → totalYards, "Passing Yards" → passingYards), while some
        // older/AI paths write "totalOffense"/"passYards" directly. Read
        // both so aggregation doesn't silently drop values.
        totalOffense += parseFloat(ourTeamStats.totalOffense ?? ourTeamStats.totalYards) || 0
        rushAttempts += parseFloat(ourTeamStats.rushAttempts) || 0
        rushYards += parseFloat(ourTeamStats.rushYards) || 0
        rushTds += parseFloat(ourTeamStats.rushTds) || 0
        passAttempts += parseFloat(ourTeamStats.passAttempts) || 0
        passYards += parseFloat(ourTeamStats.passYards ?? ourTeamStats.passingYards) || 0
        passTds += parseFloat(ourTeamStats.passTds) || 0
        firstDowns += parseFloat(ourTeamStats.firstDowns) || 0
      }

      // Opponent's offense = our defense allowed
      if (oppTeamStats) {
        defTotalYards += parseFloat(oppTeamStats.totalOffense ?? oppTeamStats.totalYards) || 0
        defPassYards += parseFloat(oppTeamStats.passYards ?? oppTeamStats.passingYards) || 0
        defRushYards += parseFloat(oppTeamStats.rushYards) || 0
      }

      // Aggregate defensive player stats (sacks, forced fumbles, interceptions)
      if (ourPlayerBoxScore?.defense && Array.isArray(ourPlayerBoxScore.defense)) {
        ourPlayerBoxScore.defense.forEach(player => {
          defSacks += parseFloat(player.sack) || 0
          forcedFumbles += parseFloat(player.fF) || 0
          defInterceptions += parseFloat(player.iNT) || 0
        })
      }
    })

    // Count total games played (for per-game calculations)
    // Uses unified format: check if user's team is in the game via perspective
    const totalGamesPlayed = currentDynasty.games.filter(game =>
      parseInt(game.year) === year &&
      getUserGamePerspective(game, currentDynasty) !== null
    ).length

    if (totalGamesPlayed === 0) return {}

    // Calculate rate stats using total games played
    const totalPlays = rushAttempts + passAttempts
    const yardsPerPlay = totalPlays > 0 ? totalOffense / totalPlays : 0
    const passYardsPerGame = totalGamesPlayed > 0 ? passYards / totalGamesPlayed : 0
    const rushYardsPerCarry = rushAttempts > 0 ? rushYards / rushAttempts : 0

    return {
      // Offense
      pointsFor,
      totalOffense,
      yardsPerPlay,
      passYards,
      passYardsPerGame,
      passTds,
      rushYards,
      rushYardsPerCarry,
      rushTds,
      firstDowns,
      // Defense
      pointsAgainst,
      defTotalYards,
      defPassYards,
      defRushYards,
      defSacks,
      forcedFumbles,
      defInterceptions,
      // Meta
      gamesWithStats
    }
  }, [currentDynasty?.games, currentDynasty?.teamName, currentDynasty?.currentYear])

  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [showRosterModal, setShowRosterModal] = useState(false)
  const [showTeamRatingsModal, setShowTeamRatingsModal] = useState(false)
  const [showCoachingStaffModal, setShowCoachingStaffModal] = useState(false)
  // showGameModal and showGameDetailModal removed - now using game pages instead
  const [showCCModal, setShowCCModal] = useState(false)
  const [showBowlWeek1Modal, setShowBowlWeek1Modal] = useState(false)
  const [showBowlWeek2Modal, setShowBowlWeek2Modal] = useState(false)
  const [weeklyScoresModalWeek, setWeeklyScoresModalWeek] = useState(null)
  // showBowlGameModal removed - now using game pages instead
  const [showCFPSeedsModal, setShowCFPSeedsModal] = useState(false)
  const [showCFPFirstRoundModal, setShowCFPFirstRoundModal] = useState(false)
  const [showCFPQuarterfinalsModal, setShowCFPQuarterfinalsModal] = useState(false)
  const [showCFPSemifinalsModal, setShowCFPSemifinalsModal] = useState(false)
  const [showCFPChampionshipModal, setShowCFPChampionshipModal] = useState(false)
  const [showStatsEntryModal, setShowStatsEntryModal] = useState(false)
  const [showDetailedStatsModal, setShowDetailedStatsModal] = useState(false)
  const [showConferenceStandingsModal, setShowConferenceStandingsModal] = useState(false)
  const [showFinalPollsModal, setShowFinalPollsModal] = useState(false)
  const [showTeamStatsModal, setShowTeamStatsModal] = useState(false)
  const [showAwardsModal, setShowAwardsModal] = useState(false)
  const [showAllAmericansModal, setShowAllAmericansModal] = useState(false)
  const [showAllConferenceModal, setShowAllConferenceModal] = useState(false)
  const [showCoachingStaffPopup, setShowCoachingStaffPopup] = useState(false)
  const coachingStaffButtonRef = useRef(null)
  const [coachingStaffPopupPosition, setCoachingStaffPopupPosition] = useState({ top: 0, right: 0 })
  const [showNewJobEditModal, setShowNewJobEditModal] = useState(false)
  const [showPlayersLeavingModal, setShowPlayersLeavingModal] = useState(false)
  const [showDraftResultsModal, setShowDraftResultsModal] = useState(false)
  const [showTransferDestinationsModal, setShowTransferDestinationsModal] = useState(false)
  const [showRecruitingModal, setShowRecruitingModal] = useState(false)
  const [showSellCalc, setShowSellCalc] = useState(false)

  // Shared trailing-tools JSX for the recruiting to-do rows. Lives at the
  // recruiting card on Dashboard's main view (not a one-off elsewhere) —
  // referenced from all three phase-specific recruiting to-dos (preseason,
  // regular season, CCG) so the buttons stay consistent across the year.
  // Hidden in view-only mode and on small screens to keep mobile rows from
  // wrapping (the calculator icon + external-link icon would push the
  // primary action button off the row width on phones).
  const recruitingExtraTools = !isViewOnly ? (
    <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
      <SellVsSendButton onClick={() => setShowSellCalc(true)} />
      <a
        href="https://collegefootball.gg/recruiting-insight-engine/"
        target="_blank"
        rel="noopener noreferrer"
        title="Recruiting Insight Engine (external)"
        aria-label="Open Recruiting Insight Engine"
        className="inline-flex items-center justify-center h-8 sm:h-9 w-8 sm:w-9 rounded-md bg-surface-2 border border-surface-4 text-txt-secondary hover:bg-surface-3 hover:text-txt-primary transition-colors flex-shrink-0"
      >
        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true" strokeWidth="1.75">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="3" />
          <path strokeLinecap="round" d="M12 1.5v3M12 19.5v3M22.5 12h-3M4.5 12h-3" />
        </svg>
      </a>
    </div>
  ) : null
  const [showPositionChangesModal, setShowPositionChangesModal] = useState(false)
  const [showRecruitingClassRankModal, setShowRecruitingClassRankModal] = useState(false)
  const [showTrainingResultsModal, setShowTrainingResultsModal] = useState(false)
  const [showEncourageTransfersModal, setShowEncourageTransfersModal] = useState(false)
  const [showOffseasonConferencesModal, setShowOffseasonConferencesModal] = useState(false)
  const [showRecruitOverallsModal, setShowRecruitOverallsModal] = useState(false)
  const [showPortalTransferClassModal, setShowPortalTransferClassModal] = useState(false)
  const [showFringeCaseClassModal, setShowFringeCaseClassModal] = useState(false)
  // Week Recap modal context: { year, week } when open, null when closed.
  // Lets the same modal serve both preseason (week 0) and in-season recaps
  // without juggling two state booleans.
  const [recapModalContext, setRecapModalContext] = useState(null)
  // Preseason Top 25 entry modal — opens for a specific year
  const [preseasonTop25Year, setPreseasonTop25Year] = useState(null)

  // Read-only banner: collapses to a single-row pill. Persists user
  // choice across sessions so they don't keep having to dismiss it.
  const [readOnlyBannerExpanded, setReadOnlyBannerExpanded] = useState(() => {
    try {
      return localStorage.getItem('cloud-readonly-banner-collapsed') !== 'true'
    } catch { return true }
  })
  const toggleReadOnlyBanner = () => {
    setReadOnlyBannerExpanded(prev => {
      const next = !prev
      try {
        if (next) localStorage.removeItem('cloud-readonly-banner-collapsed')
        else localStorage.setItem('cloud-readonly-banner-collapsed', 'true')
      } catch {}
      return next
    })
  }

  // Roster sorting state
  const [rosterSort, setRosterSort] = useState('overall') // 'position', 'jerseyNumber', 'name', 'class', 'overall'
  const [rosterSortDir, setRosterSortDir] = useState('asc')
  const [mobileTab, setMobileTab] = useState('schedule') // 'schedule' or 'roster' - for mobile view

  // Sync roster scroll-body height to match the schedule column so the roster
  // doesn't extend past the schedule on desktop.
  const scheduleColumnRef = useRef(null)
  const rosterBodyRef = useRef(null)
  const [rosterMaxHeight, setRosterMaxHeight] = useState(null)
  useEffect(() => {
    const schedEl = scheduleColumnRef.current
    const rosterEl = rosterBodyRef.current
    if (!schedEl || !rosterEl) return
    const update = () => {
      const schedBottom = schedEl.getBoundingClientRect().bottom
      const rosterTop = rosterEl.getBoundingClientRect().top
      const available = schedBottom - rosterTop
      if (available > 0) setRosterMaxHeight(available)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(schedEl)
    ro.observe(rosterEl)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [teamRoster?.length, teamSchedule?.length])

  // Roster sort handler
  const handleRosterSort = (column) => {
    if (rosterSort === column) {
      setRosterSortDir(rosterSortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setRosterSort(column)
      setRosterSortDir('asc')
    }
  }

  // Roster sorting function - comprehensive position order matching TeamYear (QB -> P)
  const posOrder = [
    'QB', 'HB', 'RB', 'FB', 'WR', 'TE',
    'LT', 'LG', 'C', 'RG', 'RT', 'OT', 'OG',
    'LE', 'RE', 'LEDG', 'REDG', 'EDGE', 'DT',
    'LOLB', 'MLB', 'ROLB', 'SAM', 'MIKE', 'WILL', 'OLB', 'LB',
    'CB', 'FS', 'SS', 'S', 'K', 'P'
  ]
  const classOrder = ['FR', 'SO', 'JR', 'SR']

  const sortRoster = (roster) => {
    return [...roster].sort((a, b) => {
      let comparison = 0
      switch (rosterSort) {
        case 'jerseyNumber':
          comparison = (a.jerseyNumber || 999) - (b.jerseyNumber || 999)
          break
        case 'name':
          comparison = (a.name || '').localeCompare(b.name || '')
          break
        case 'position':
          const posA = posOrder.indexOf(a.position)
          const posB = posOrder.indexOf(b.position)
          comparison = (posA === -1 ? 999 : posA) - (posB === -1 ? 999 : posB)
          if (comparison === 0) comparison = (b.overall || 0) - (a.overall || 0)
          break
        case 'class':
          const classA = classOrder.indexOf(a.year)
          const classB = classOrder.indexOf(b.year)
          comparison = (classA === -1 ? 999 : classA) - (classB === -1 ? 999 : classB)
          break
        case 'overall':
          comparison = (b.overall || 0) - (a.overall || 0) // Default descending (highest first)
          break
        default:
          comparison = 0
      }
      return rosterSortDir === 'asc' ? comparison : -comparison
    })
  }

  // Player match confirmation states
  const [showPlayerMatchConfirm, setShowPlayerMatchConfirm] = useState(false)
  const [playerMatchConfirmation, setPlayerMatchConfirmation] = useState(null)
  const [pendingHonorData, setPendingHonorData] = useState(null) // { honorType, entries, year, confirmations, transferDecisions }
  const [currentConfirmIndex, setCurrentConfirmIndex] = useState(0)

  // Returning player confirmation states (for recruiting)
  const [showReturningPlayerConfirm, setShowReturningPlayerConfirm] = useState(false)
  const [returningPlayerConfirmation, setReturningPlayerConfirmation] = useState(null)
  const [pendingRecruitingData, setPendingRecruitingData] = useState(null) // { recruits, week, potentialReturning, confirmedReturning, confirmedNew, currentIndex }

  // Bowl eligibility states
  const [selectedBowl, setSelectedBowl] = useState('')
  const [showBowlOpponentDropdown, setShowBowlOpponentDropdown] = useState(false)
  // editingWeek/Year/Opponent/Game/BowlName and selectedGame removed - now using game pages instead

  // Conference Championship states
  const [ccMadeChampionship, setCCMadeChampionship] = useState(null) // null = not answered, true/false = answered
  const [ccOpponent, setCCOpponent] = useState('')
  const [ccOpponentSearch, setCCOpponentSearch] = useState('')
  const [showCCOpponentDropdown, setShowCCOpponentDropdown] = useState(false)
  // showCCGameModal removed - now using game pages instead

  // Coordinator firing states (for HC only during CC week)
  const [firingCoordinators, setFiringCoordinators] = useState(null) // null = not asked, false = no, true = yes
  const [coordinatorToFire, setCoordinatorToFire] = useState('') // 'oc', 'dc', or 'both'

  // New job states (for Bowl Week 1)
  const [takingNewJob, setTakingNewJob] = useState(null) // null = not answered, true/false = answered
  const [newJobTeam, setNewJobTeam] = useState('')
  const [newJobPosition, setNewJobPosition] = useState('')
  const [newJobTeamSearch, setNewJobTeamSearch] = useState('')
  const [showNewJobTeamDropdown, setShowNewJobTeamDropdown] = useState(false)

  // Coordinator hiring states (for Bowl Week 2+ after firing)
  const [filledOCVacancy, setFilledOCVacancy] = useState(null) // null = not asked, true/false = answered
  const [filledDCVacancy, setFilledDCVacancy] = useState(null) // null = not asked, true/false = answered
  const [newOCName, setNewOCName] = useState('')
  const [newDCName, setNewDCName] = useState('')

  // View-only badge component for showing when editing is disabled
  const ViewOnlyBadge = () => (
    <span
      className="px-3 py-1.5 rounded-lg text-xs font-medium"
      style={{ backgroundColor: `${secondaryBgText}15`, color: secondaryBgText, opacity: 0.7 }}
    >
      View Only
    </span>
  )

  // Restore CC state from saved dynasty data (year-specific)
  // Checks tid-based structure first, then falls back to legacy structures
  useEffect(() => {
    const year = currentDynasty?.currentYear
    const userTid = getUserTeamTid(currentDynasty)

    // Use tid-based getter (handles all fallbacks)
    const ccData = getConferenceChampionshipData(currentDynasty, userTid, year)

    if (ccData) {
      setCCMadeChampionship(ccData.madeChampionship ?? null)
      setCCOpponent(ccData.opponent || '')
      // Restore pending firing selection
      const pending = ccData.pendingFiring
      if (pending !== undefined) {
        setCoordinatorToFire(pending)
        setFiringCoordinators(pending !== 'none' && pending !== '')
      } else {
        setFiringCoordinators(null)
        setCoordinatorToFire('')
      }
    } else {
      // Reset when no data for this year
      setCCMadeChampionship(null)
      setCCOpponent('')
      setFiringCoordinators(null)
      setCoordinatorToFire('')
    }
  }, [currentDynasty?.id, currentDynasty?.currentYear, currentDynasty?.teams, currentDynasty?.conferenceChampionshipDataByYear, currentDynasty?.conferenceChampionshipDataByTeamYear, currentDynasty?.teamName])

  // Restore bowl eligibility state from saved dynasty data (year-specific)
  useEffect(() => {
    const year = currentDynasty?.currentYear
    const bowlData = currentDynasty?.bowlEligibilityDataByYear?.[year]
    if (bowlData) {
      setSelectedBowl(bowlData.bowlGame || '')
    } else {
      setSelectedBowl('')
    }
  }, [currentDynasty?.id, currentDynasty?.currentYear, currentDynasty?.bowlEligibilityDataByYear])

  // One-time migration: back-fill missing bowl game shells from
  // bowlEligibilityDataByYear. Detection of "user has a bowl game" now
  // reads games[] as the single source of truth (matches CFP's pattern);
  // without this back-fill, existing dynasties whose wizard completed
  // under the old flow — no shell auto-created — would silently lose
  // their Bowl Game tile after the refactor.
  //
  // Deps deliberately exclude `currentDynasty.games`: an earlier draft
  // included it and the effect re-ran on every game add/edit/delete,
  // walking games[] once per bowl-year on each render. With ~1000
  // games × ~10 years, that's a measurable per-interaction lag spike.
  // The migration only needs to react to bowl-wizard data changes;
  // the ref guard ensures it runs at most once per dynasty session.
  const bowlMigrationDoneRef = useRef(new Set())
  useEffect(() => {
    if (!currentDynasty?.id) return
    if (isViewOnly) return
    const byYear = currentDynasty.bowlEligibilityDataByYear
    // Don't mark done until data is actually present — lazy-loaded dynasties
    // would otherwise get blocked on the first (empty) run and never retry.
    if (!byYear || typeof byYear !== 'object' || Object.keys(byYear).length === 0) return
    if (bowlMigrationDoneRef.current.has(currentDynasty.id)) return
    const games = currentDynasty.games || []
    const userTid = getUserTeamTid(currentDynasty)
    if (!userTid) return

    let mutated = games
    let touched = false
    for (const [yearStr, data] of Object.entries(byYear)) {
      if (!data || !data.eligible || !data.bowlGame || !data.opponent) continue
      const year = Number(yearStr)
      if (!Number.isFinite(year)) continue
      // Only skip if a shell already exists AND has bowlWeek set correctly.
      // Shells missing bowlWeek (created before the field was added) still
      // need to be updated so the "Enter your bowl game" tile can appear.
      const existingShell = mutated.find(g =>
        g && g.isBowlGame && Number(g.year) === year &&
        (g.team1Tid === userTid || g.team2Tid === userTid)
      )
      if (existingShell?.bowlWeek) continue
      const opponentTid = getTidFromTeamName(data.opponent, currentDynasty?.teams)
      if (!opponentTid) continue
      mutated = createOrUpdateBowlGameShell(mutated, {
        bowlName: data.bowlGame,
        year,
        userTid,
        opponentTid,
        isWeek1: isBowlInWeek1(data.bowlGame),
      })
      touched = true
    }
    bowlMigrationDoneRef.current.add(currentDynasty.id)
    if (touched) {
      updateDynasty(currentDynasty.id, { games: mutated })
    }
  }, [currentDynasty?.id, currentDynasty?.bowlEligibilityDataByYear, currentDynasty?.teams, isViewOnly, updateDynasty])

  // Restore new job state from saved dynasty data
  // If user declined in a previous week, reset so they can be asked again
  useEffect(() => {
    if (currentDynasty?.newJobData) {
      const jobData = currentDynasty.newJobData

      // If user declined but in a different week, reset the question
      if (jobData.takingNewJob === false && jobData.declinedInWeek !== currentDynasty.currentWeek) {
        setTakingNewJob(null)
        setNewJobTeam('')
        setNewJobPosition('')
      } else {
        setTakingNewJob(jobData.takingNewJob ?? null)
        setNewJobTeam(jobData.team || '')
        setNewJobPosition(jobData.position || '')
      }
    } else {
      // Reset when no data
      setTakingNewJob(null)
      setNewJobTeam('')
      setNewJobPosition('')
    }
  }, [currentDynasty?.id, currentDynasty?.newJobData, currentDynasty?.currentWeek])

  // Restore coordinator hiring state from saved dynasty data
  useEffect(() => {
    if (currentDynasty?.pendingCoordinatorHires) {
      const hireData = currentDynasty.pendingCoordinatorHires
      setFilledOCVacancy(hireData.filledOC ?? null)
      setFilledDCVacancy(hireData.filledDC ?? null)
      setNewOCName(hireData.newOCName || '')
      setNewDCName(hireData.newDCName || '')
    } else {
      setFilledOCVacancy(null)
      setFilledDCVacancy(null)
      setNewOCName('')
      setNewDCName('')
    }
  }, [currentDynasty?.id, currentDynasty?.pendingCoordinatorHires])

  // Track when we last ran CFP shell creation to prevent race conditions
  const cfpShellProcessedRef = useRef({ year: null, gamesLength: null, timestamp: 0 })

  // Auto-create CFP game shells if seeds exist but shells are missing
  // This handles dynasties where seeds were saved before the shell system was implemented
  useEffect(() => {
    if (!currentDynasty?.id || isViewOnly) return

    // CRITICAL: Wait until dynasty data is fully loaded from subcollections
    // Without this guard, games array may be empty during lazy loading,
    // causing orphan cleanup to DELETE all existing games
    if (isLoadingDynastyData) return

    // CRITICAL: Only run during postseason phase when CFP is active
    // This prevents race conditions during phase changes
    const phase = currentDynasty.currentPhase
    if (phase !== 'postseason' && phase !== 'conference_championship') return

    const year = currentDynasty.currentYear
    const seeds = currentDynasty.cfpSeedsByYear?.[year] || []
    if (seeds.length < 12) return // Need all 12 seeds

    const gamesLength = currentDynasty.games?.length || 0

    // Debounce: Don't run if we just processed this exact state within 2 seconds
    const now = Date.now()
    const lastProcessed = cfpShellProcessedRef.current
    if (
      lastProcessed.year === year &&
      lastProcessed.gamesLength === gamesLength &&
      now - lastProcessed.timestamp < 2000
    ) {
      return
    }

    // Check if shells already exist with VALID tids (numbers, not objects)
    const existingShells = (currentDynasty.games || []).filter(g =>
      g.cfpSlot && Number(g.year) === Number(year)
    )

    // Also check that tids are numbers, not objects (bug fix for bad shells)
    const hasValidTids = existingShells.every(g =>
      (g.team1Tid === null || typeof g.team1Tid === 'number') &&
      (g.team2Tid === null || typeof g.team2Tid === 'number')
    )

    // Check if QF opponents need to be populated from first round winners
    const firstRoundGames = existingShells.filter(g => g.cfpRound === 'first_round')
    const qfGames = existingShells.filter(g => g.cfpRound === 'quarterfinal')
    const hasCompletedFirstRound = firstRoundGames.some(g => g.team1Score !== null && g.team2Score !== null)
    const qfNeedsOpponents = qfGames.some(g => g.team1Tid !== null && g.team2Tid === null)
    const needsWinnerPropagation = hasCompletedFirstRound && qfNeedsOpponents

    if (existingShells.length >= 11 && hasValidTids && !needsWinnerPropagation) return // Valid shells already exist

    // Mark that we're processing to prevent race conditions
    cfpShellProcessedRef.current = { year, gamesLength, timestamp: now }

    // Convert seeds array to tid-based format: { 1: tid, 2: tid, ... }
    const seedsWithTid = {}
    for (const entry of seeds) {
      if (entry.seed && (entry.tid || entry.team)) {
        const tid = entry.tid || getTidFromAbbr(entry.team, currentDynasty)
        if (tid) {
          seedsWithTid[entry.seed] = tid
        }
      }
    }

    // Create shells with bowl configuration (if available)
    const bowlConfig = currentDynasty.cfpBowlConfigByYear?.[year] || null
    const existingGames = currentDynasty.games || []
    let updatedGames = createOrUpdateCFPGameShells(existingGames, seedsWithTid, year, bowlConfig)

    // Re-propagate first round winners to QF shells (in case FR was saved before shells existed)
    const frGamesToPropagate = updatedGames.filter(g => g.cfpRound === 'first_round' && Number(g.year) === Number(year))
    for (const frGame of frGamesToPropagate) {
      if (frGame.team1Score !== null && frGame.team2Score !== null && frGame.cfpSlot) {
        updatedGames = propagateCFPWinner(updatedGames, frGame)
      }
    }

    // GUARD: only persist if the CFP shells' meaningful data (tids +
    // scores + slot) actually changed. createOrUpdateCFPGameShells and
    // propagateCFPWinner are pure functions that return new arrays of
    // new objects even when there's nothing to propagate — without
    // this guard the effect re-fires on every Firestore snapshot and
    // queues a no-op write, exhausting Firebase's write queue after a
    // few minutes ("Write stream exhausted maximum allowed queued
    // writes") and turning the dashboard laggy. The specific trigger:
    // user is in postseason with one FR game un-entered, which leaves
    // a QF shell with null team2Tid, which keeps needsWinnerPropagation
    // pinned to true even though there's nothing actually to propagate.
    // Report from 2026-05-11.
    const cfpFingerprint = (games) => {
      const shells = (games || []).filter(g => g?.cfpSlot && Number(g.year) === Number(year))
      return shells
        .map(g => `${g.cfpSlot}|${g.team1Tid ?? ''}|${g.team2Tid ?? ''}|${g.team1Score ?? ''}|${g.team2Score ?? ''}`)
        .sort()
        .join(';')
    }
    if (cfpFingerprint(updatedGames) === cfpFingerprint(existingGames)) {
      return
    }

    console.log('[Dashboard CFP Shell Effect] Saving shells for year', year, '- games count:', updatedGames.length)
    updateDynasty(currentDynasty.id, { games: updatedGames })
  }, [currentDynasty?.id, currentDynasty?.currentYear, currentDynasty?.currentPhase, currentDynasty?.cfpSeedsByYear, currentDynasty?.games?.length, isViewOnly, isLoadingDynastyData])

  if (!currentDynasty) return null

  // Last-week recap detector — only meaningful in regular_season at week >= 2
  // (week 1 has no preceding regular-season game to recap). Drives the
  // dashboard layout shuffle below: when a recap exists for the prior week,
  // Roster + Schedule fold into one tabbed section (matching the mobile
  // pattern) and the recap card sits where Schedule used to be.
  const lastWeekRecap = (() => {
    if (currentDynasty.currentPhase !== 'regular_season') return null
    const cw = Number(currentDynasty.currentWeek)
    if (!Number.isFinite(cw) || cw < 2) return null
    const yr = Number(currentDynasty.currentYear)
    return currentDynasty.weekRecapsByYear?.[yr]?.[cw - 1] || null
  })()
  const lastWeekRecapExists = !!lastWeekRecap?.text

  // Get the user's team conference (from custom conferences or default)
  const customConferences = getCurrentCustomConferences(currentDynasty)

  const getUserTeamConference = () => {
    // Use userTeamTid from the team with userId: 'currentUser' (single source of truth)
    if (!userTeamTid) return null

    // Resolve via tid against dynasty.teams so realignment overrides (which
    // are keyed by the dynasty's CURRENT abbr — i.e. a TB team's new abbr)
    // are honored. Looking up by static TEAMS[tid].abbr misses TB overrides
    // and falls through to the stale default conference.
    return getTeamConference(userTeamTid, customConferences, currentDynasty.teams)
  }

  const userTeamConference = getUserTeamConference()

  // Get team name from tid or abbreviation using tid-based lookup
  const getTeamNameFromAbbr = (tidOrAbbr) => {
    const teamsSource = currentDynasty?.teams || TEAMS
    const teamInfo = getGameTeamInfo(teamsSource, tidOrAbbr)
    if (teamInfo) return teamInfo.name
    // Fallback to static lookup using getNameByAbbr
    return getNameByAbbr(teamsSource, tidOrAbbr) || tidOrAbbr
  }

  // Get team mascot name (full team name) for logo lookup using tid-based lookup
  const getMascotName = (tidOrAbbr) => {
    const teamsSource = currentDynasty?.teams || TEAMS
    const teamInfo = getGameTeamInfo(teamsSource, tidOrAbbr)
    if (teamInfo) return teamInfo.name
    return null
  }

  const getOpponentColors = (tidOrAbbr) => {
    // Use tid-based lookup from dynasty.teams (supports teambuilder teams)
    const teamsSource = currentDynasty?.teams || TEAMS
    const teamInfo = getGameTeamInfo(teamsSource, tidOrAbbr)

    if (teamInfo) {
      return {
        backgroundColor: teamInfo.primaryColor,
        textColor: teamInfo.secondaryColor,
        secondaryColor: teamInfo.secondaryColor
      }
    }

    // Final fallback
    return {
      backgroundColor: '#ffffff',
      textColor: '#1f2937',
      secondaryColor: '#1f2937'
    }
  }

  const handleScheduleSave = async (schedule) => {
    await saveSchedule(currentDynasty.id, schedule)
  }

  const handleRosterSave = async (players) => {
    await saveRoster(currentDynasty.id, players)
  }

  const handleTeamRatingsSave = async (ratings) => {
    await saveTeamRatings(currentDynasty.id, ratings)
  }

  const handleCoachingStaffSave = async (staff) => {
    await saveCoachingStaff(currentDynasty.id, staff)
  }

  const handleNewJobSave = async (jobData) => {
    // Update local state
    setTakingNewJob(jobData.takingNewJob)
    setNewJobTeam(jobData.team || '')
    setNewJobPosition(jobData.position || '')

    // Save to dynasty
    if (jobData.takingNewJob === false) {
      // Clear pendingUserId from any team
      const updatedTeams = clearPendingUserTeam(currentDynasty.teams)
      await updateDynasty(currentDynasty.id, {
        newJobData: {
          takingNewJob: false,
          team: null,
          position: null,
          declinedInWeek: currentDynasty.currentWeek
        },
        teams: updatedTeams
      })
    } else {
      // Set pendingUserId on the target team
      const newTeamTid = getTidFromTeamName(jobData.team, currentDynasty.teams)
      const updatedTeams = newTeamTid
        ? setPendingUserTeam(currentDynasty.teams, newTeamTid, jobData.position)
        : currentDynasty.teams
      await updateDynasty(currentDynasty.id, {
        newJobData: {
          takingNewJob: true,
          team: jobData.team,
          position: jobData.position
        },
        teams: updatedTeams
      })
    }
  }

  // handleGameSave removed - now using game pages instead

  // Handle CC championship answer - team-centric
  const handleCCAnswer = async (madeChampionship) => {
    setCCMadeChampionship(madeChampionship)
    const year = currentDynasty.currentYear
    const teamAbbr = getCurrentTeamAbbr(currentDynasty) || currentDynasty.teamName
    const existingByTeamYear = currentDynasty.conferenceChampionshipDataByTeamYear || {}
    const existingForTeam = existingByTeamYear[teamAbbr] || {}
    const tid = getTidFromAbbr(teamAbbr, currentDynasty)
    const ccData = { ...(existingForTeam[year] || {}), madeChampionship }

    // Also get existing year-only structure for backward compatibility
    const existingByYear = currentDynasty.conferenceChampionshipDataByYear || {}

    const updates = {
      // Write to team-centric structure — dual-keyed (rename-safe)
      conferenceChampionshipDataByTeamYear: {
        ...existingByTeamYear,
        [teamAbbr]: {
          ...(existingByTeamYear[teamAbbr] || {}),
          [year]: ccData
        },
        ...(tid ? { [tid]: { ...(existingByTeamYear[tid] || {}), [year]: ccData } } : {})
      },
      // Also write to year-only structure for backward compatibility with restore useEffect
      conferenceChampionshipDataByYear: {
        ...existingByYear,
        [year]: ccData
      }
    }

    // Also write to NEW tid-based byYear structure
    if (tid && currentDynasty.teams) {
      const existingTeams = currentDynasty.teams
      const existingTeamData = existingTeams[tid] || {}
      const existingByYearTid = existingTeamData.byYear || {}
      const existingYearData = existingByYearTid[year] || {}

      updates.teams = {
        ...existingTeams,
        [tid]: {
          ...existingTeamData,
          byYear: {
            ...existingByYearTid,
            [year]: {
              ...existingYearData,
              conferenceChampionshipData: ccData
            }
          }
        }
      }
    }

    await updateDynasty(currentDynasty.id, updates)
  }

  // Handle CC opponent selection - team-centric
  const handleCCOpponentSelect = async (opponent) => {
    setCCOpponent(opponent)
    setCCOpponentSearch('')
    setShowCCOpponentDropdown(false)
    const year = currentDynasty.currentYear
    const teamAbbr = getCurrentTeamAbbr(currentDynasty) || currentDynasty.teamName
    const existingByTeamYear = currentDynasty.conferenceChampionshipDataByTeamYear || {}
    const existingForTeam = existingByTeamYear[teamAbbr] || {}
    const tid = getTidFromAbbr(teamAbbr, currentDynasty)
    const ccData = { ...(existingForTeam[year] || {}), opponent }

    // Also get existing year-only structure for backward compatibility
    const existingByYearOnly = currentDynasty.conferenceChampionshipDataByYear || {}

    const updates = {
      // Write to team-centric structure — dual-keyed (rename-safe)
      conferenceChampionshipDataByTeamYear: {
        ...existingByTeamYear,
        [teamAbbr]: {
          ...(existingByTeamYear[teamAbbr] || {}),
          [year]: ccData
        },
        ...(tid ? { [tid]: { ...(existingByTeamYear[tid] || {}), [year]: ccData } } : {})
      },
      // Also write to year-only structure for backward compatibility
      conferenceChampionshipDataByYear: {
        ...existingByYearOnly,
        [year]: ccData
      }
    }

    // Also write to NEW tid-based byYear structure
    if (tid && currentDynasty.teams) {
      const existingTeams = currentDynasty.teams
      const existingTeamData = existingTeams[tid] || {}
      const existingByYear = existingTeamData.byYear || {}
      const existingYearData = existingByYear[year] || {}

      updates.teams = {
        ...existingTeams,
        [tid]: {
          ...existingTeamData,
          byYear: {
            ...existingByYear,
            [year]: {
              ...existingYearData,
              conferenceChampionshipData: ccData
            }
          }
        }
      }
    }

    await updateDynasty(currentDynasty.id, updates)
  }

  // handleCCGameSave and handleBowlGameSave removed - now using game pages instead

  // Check if user can advance from CC week
  const canAdvanceFromCC = () => {
    // First check CC game/championship status
    let ccComplete = false
    if (ccMadeChampionship === false) {
      ccComplete = true
    } else if (ccMadeChampionship === true) {
      const ccGame = findCurrentTeamGame(currentDynasty,
        g => (g.isConferenceChampionship || g.gameType === GAME_TYPES.CONFERENCE_CHAMPIONSHIP) && isSameYear(g.year, currentDynasty.currentYear)
      )
      ccComplete = !!ccGame
    }

    if (!ccComplete) return false

    // If HC with at least one coordinator, must make firing selection
    const hasCoordinators = currentDynasty.coachPosition === 'HC' &&
      (teamCoachingStaff?.ocName || teamCoachingStaff?.dcName)
    if (hasCoordinators) {
      // Must have made a selection (including 'none')
      return coordinatorToFire !== ''
    }

    return true
  }

  // Handle coordinator firing dropdown selection
  // Only saves to pendingFiring - actual firing happens on advance - team-centric
  const handleFiringSelection = async (selection) => {
    setCoordinatorToFire(selection)
    setFiringCoordinators(selection !== 'none')

    const year = currentDynasty.currentYear
    const teamAbbr = getCurrentTeamAbbr(currentDynasty) || currentDynasty.teamName
    const existingByTeamYear = currentDynasty.conferenceChampionshipDataByTeamYear || {}
    const existingForTeam = existingByTeamYear[teamAbbr] || {}
    const tid = getTidFromAbbr(teamAbbr, currentDynasty)
    const ccData = { ...(existingForTeam[year] || {}), pendingFiring: selection }

    // Also get existing year-only structure for backward compatibility
    const existingByYearOnly = currentDynasty.conferenceChampionshipDataByYear || {}

    const updates = {
      // Write to team-centric structure — dual-keyed (rename-safe)
      conferenceChampionshipDataByTeamYear: {
        ...existingByTeamYear,
        [teamAbbr]: {
          ...(existingByTeamYear[teamAbbr] || {}),
          [year]: ccData
        },
        ...(tid ? { [tid]: { ...(existingByTeamYear[tid] || {}), [year]: ccData } } : {})
      },
      // Also write to year-only structure for backward compatibility
      conferenceChampionshipDataByYear: {
        ...existingByYearOnly,
        [year]: ccData
      }
    }

    // Also write to NEW tid-based byYear structure
    if (tid && currentDynasty.teams) {
      const existingTeams = currentDynasty.teams
      const existingTeamData = existingTeams[tid] || {}
      const existingByYear = existingTeamData.byYear || {}
      const existingYearData = existingByYear[year] || {}

      updates.teams = {
        ...existingTeams,
        [tid]: {
          ...existingTeamData,
          byYear: {
            ...existingByYear,
            [year]: {
              ...existingYearData,
              conferenceChampionshipData: ccData
            }
          }
        }
      }
    }

    await updateDynasty(currentDynasty.id, updates)
  }

  // Handle awards data save with player matching
  const handleAwardsSave = async (awards) => {
    const year = currentDynasty.currentYear

    // Convert awards object to array format for processing
    const entries = Object.entries(awards).map(([awardKey, data]) => ({
      ...data,
      award: awardKey,
      name: data.player
    })).filter(e => e.player) // Only entries with a player name

    // Process honors - this will find/create players
    const result = await processHonorPlayers(
      currentDynasty.id,
      'awards',
      entries,
      year,
      [] // No transfer decisions yet
    )

    if (result.needsConfirmation) {
      // Store pending data and show first confirmation
      setPendingHonorData({
        honorType: 'awards',
        entries,
        year,
        rawData: awards, // Keep original for awardsByYear
        confirmations: result.confirmations,
        transferDecisions: []
      })
      setCurrentConfirmIndex(0)
      setPlayerMatchConfirmation(result.confirmations[0])
      setShowPlayerMatchConfirm(true)
    } else {
      // No confirmations needed - just save the awards data
      const existingByYear = currentDynasty.awardsByYear || {}
      await updateDynasty(currentDynasty.id, {
        awardsByYear: {
          ...existingByYear,
          [year]: awards
        }
      })
    }
  }

  // Handle All-Americans data save with player matching
  const handleAllAmericansSave = async (data) => {
    const year = currentDynasty.currentYear

    // Process All-Americans entries
    if (data.allAmericans && data.allAmericans.length > 0) {
      const aaEntries = data.allAmericans.map(entry => ({
        ...entry,
        name: entry.player,
        honorCategory: 'allAmericans'
      }))

      const result = await processHonorPlayers(
        currentDynasty.id,
        'allAmericans',
        aaEntries,
        year,
        []
      )

      // processHonorPlayers now applies exact-matches and brand-new
      // entries immediately — only genuine same-name-different-team
      // transfers come back as confirmations. Show the modal for
      // those so the user can decide same-person vs new-record.
      if (result.needsConfirmation && result.confirmations?.length > 0) {
        setPendingHonorData({
          honorType: 'allAmericans',
          entries: aaEntries,
          year,
          rawData: data,
          confirmations: result.confirmations,
          transferDecisions: []
        })
        setCurrentConfirmIndex(0)
        setPlayerMatchConfirmation(result.confirmations[0])
        setShowPlayerMatchConfirm(true)
        return
      }
    }

    // No confirmations needed - save the All-Americans data
    const existingByYear = currentDynasty.allAmericansByYear || {}
    const existingYearData = existingByYear[year] || {}
    await updateDynasty(currentDynasty.id, {
      allAmericansByYear: {
        ...existingByYear,
        [year]: {
          ...existingYearData,
          allAmericans: data.allAmericans || []
        }
      }
    })
  }

  // Handle All-Conference data save with player matching
  const handleAllConferenceSave = async (data) => {
    const year = currentDynasty.currentYear

    // Process All-Conference entries
    if (data.allConference && data.allConference.length > 0) {
      const acEntries = data.allConference.map(entry => ({
        ...entry,
        name: entry.player,
        honorCategory: 'allConference'
      }))

      const result = await processHonorPlayers(
        currentDynasty.id,
        'allConference',
        acEntries,
        year,
        []
      )

      // Exact-matches and clear new-player creates already landed inside
      // processHonorPlayers. Only same-name-different-team transfers are
      // returned as confirmations; pop the modal for those.
      if (result.needsConfirmation && result.confirmations?.length > 0) {
        setPendingHonorData({
          honorType: 'allConference',
          entries: acEntries,
          year,
          rawData: data,
          confirmations: result.confirmations,
          transferDecisions: []
        })
        setCurrentConfirmIndex(0)
        setPlayerMatchConfirmation(result.confirmations[0])
        setShowPlayerMatchConfirm(true)
        return
      }
    }

    // No confirmations needed - save the All-Conference data (already grouped by conference)
    const existingByYear = currentDynasty.allAmericansByYear || {}
    const existingYearData = existingByYear[year] || {}
    await updateDynasty(currentDynasty.id, {
      allAmericansByYear: {
        ...existingByYear,
        [year]: {
          ...existingYearData,
          allConference: data.allConference || [],
          allConferenceByConference: data.allConferenceByConference || {}
        }
      }
    })
  }

  // Handle players leaving data save (Offseason)
  // CLEAN SYSTEM: Only uses playersLeavingByYear and movements - no player-level departure fields
  const handlePlayersLeavingSave = async (playersLeaving) => {
    const year = currentDynasty.currentYear

    // Map player names to PIDs for tracking
    const playersWithPids = playersLeaving.map(entry => {
      const player = currentDynasty.players?.find(p => p.name === entry.playerName)
      return {
        playerName: entry.playerName,
        pid: player?.pid || null,
        reason: entry.reason
      }
    })

    // Track which players are now leaving vs were previously leaving
    const leavingPids = new Set(playersWithPids.map(p => p.pid).filter(Boolean))
    const reasonByPid = {}
    playersWithPids.forEach(p => {
      if (p.pid) reasonByPid[p.pid] = p.reason
    })

    // CRITICAL: Get tid directly - tid is the ONLY source of truth
    const teamTid = getCurrentTeamTid(currentDynasty)
    const teamAbbr = getCurrentTeamAbbr(currentDynasty) || currentDynasty.teamName // For display only

    // Get previous list to detect removals
    const previousLeavingPids = new Set(
      (currentDynasty.playersLeavingByYear?.[year] || [])
        .map(p => p.pid)
        .filter(Boolean)
    )

    const updatedPlayers = (currentDynasty.players || []).map(player => {
      if (leavingPids.has(player.pid)) {
        const reason = reasonByPid[player.pid] || 'Unknown'
        // ANY reason that isn't a permanent departure (Graduating / Pro
        // Draft) is a transfer-portal reason. The 14 sheet reasons
        // (Playing Time, Playing Style, Proximity to Home, etc.) all
        // mean "entered the portal", so all of them get
        // `transferred_out` with a null destination until Transfer
        // Destinations populates it. Legacy 'Transfer' / 'Encouraged
        // Transfer' strings remain valid.
        const isDeparture = reason === 'Graduating' || reason === 'Pro Draft'
        const isTransfer = !isDeparture
        // Get player's team as tid - ALWAYS use tid for movement data
        let playerTeamTid = player.team
        if (typeof playerTeamTid === 'string') {
          playerTeamTid = getTidFromAbbr(playerTeamTid, currentDynasty) || teamTid
        }
        const playerTeam = playerTeamTid || teamTid

        // v2 canonical write: only movementByYear. The legacy movements[]
        // array is stripped by syncDerivedFieldsFromV2 on every write, so
        // touching it here is dead code. The helper variables above
        // (playerTeam, isTransfer, isDeparture) are kept only in case
        // future code needs them.
        // eslint-disable-next-line no-unused-vars
        void playerTeam; void isTransfer; void isDeparture

        // Build canonical v2 movementByYear entry based on reason. The
        // previous version emitted legacy types (declared_for_draft,
        // graduated, transferred_out) and relied on syncDerivedFieldsFromV2
        // to convert on every save — that round-trip was implicated in
        // post-draft transfer-history corruption. Write canonical directly.
        const movementByYearEntry = (() => {
          if (reason === 'Pro Draft') {
            return { type: 'departure', departure: 'pro_draft' }
          } else if (reason === 'Graduating') {
            return { type: 'departure', departure: 'graduated' }
          }
          // Every other reason = entered the transfer portal, destination
          // unknown until Transfer Destinations is filled in on Signing Day.
          return { type: 'departure', departure: 'transfer_out', toTid: null, reason }
        })()

        // CRITICAL: Preserve specific recorded outcomes. The leaving
        // sheet captures the user's INTENT ("this player is leaving for
        // X reason"); the actual outcome (drafted / graduated) is
        // recorded separately by handleDraftResultsSave or auto-grad.
        // If a more-specific outcome already exists for this year,
        // don't clobber it with the generic transfer_out path —
        // re-saving the leaving sheet was overwriting drafted players
        // back into "in the portal", which is the user-reported bug.
        const existingMovement = player.movementByYear?.[Number(year)]
          ?? player.movementByYear?.[String(year)]
        const isMoreSpecific = existingMovement
          && existingMovement.type === 'departure'
          && (existingMovement.departure === 'pro_draft'
              || existingMovement.departure === 'graduated')
        const isWritingGenericTransferOut = movementByYearEntry.departure === 'transfer_out'
          && movementByYearEntry.toTid == null
        if (isMoreSpecific && isWritingGenericTransferOut) {
          // Keep the existing specific outcome; nothing to update.
          return player
        }

        return {
          ...player,
          movementByYear: {
            ...(player.movementByYear || {}),
            [Number(year)]: movementByYearEntry,
          },
        }
      } else if (previousLeavingPids.has(player.pid)) {
        // Player was previously marked as leaving this year but isn't now.
        // Clear the movementByYear entry for this year. (Legacy movements[]
        // is stripped by syncDerivedFieldsFromV2 on write.)
        const updatedMovementByYear = { ...(player.movementByYear || {}) }
        delete updatedMovementByYear[Number(year)]
        delete updatedMovementByYear[String(year)]

        return {
          ...player,
          movementByYear: updatedMovementByYear,
        }
      }
      return player
    })

    // playersLeavingByTeamYear is the source of truth for who is leaving (team-centric)
    // teamAbbr already defined above
    const existingByTeamYear = currentDynasty.playersLeavingByTeamYear || {}
    const existingByYear = currentDynasty.playersLeavingByYear || {}
    const tid = getTidFromAbbr(teamAbbr, currentDynasty)

    // Build updates object
    const updates = {
      // Legacy format for backwards compatibility and simpler lookups
      playersLeavingByYear: {
        ...existingByYear,
        [year]: playersWithPids
      },
      // Team-centric format — dual-keyed (rename-safe)
      playersLeavingByTeamYear: {
        ...existingByTeamYear,
        [teamAbbr]: {
          ...(existingByTeamYear[teamAbbr] || {}),
          [year]: playersWithPids
        },
        ...(tid ? { [tid]: { ...(existingByTeamYear[tid] || {}), [year]: playersWithPids } } : {})
      },
      players: updatedPlayers
    }

    // Also write to NEW tid-based byYear structure
    if (tid && currentDynasty.teams) {
      const existingTeams = currentDynasty.teams
      const existingTeamData = existingTeams[tid] || {}
      const existingByYear = existingTeamData.byYear || {}
      const existingYearData = existingByYear[year] || {}

      updates.teams = {
        ...existingTeams,
        [tid]: {
          ...existingTeamData,
          byYear: {
            ...existingByYear,
            [year]: {
              ...existingYearData,
              playersLeaving: playersWithPids
            }
          }
        }
      }
    }

    await updateDynasty(currentDynasty.id, updates)
  }

  // Handle draft results save (Offseason - Recruiting Week 1) - team-centric
  const handleDraftResultsSave = async (draftResults) => {
    const year = currentDynasty.currentYear
    const teamAbbr = getCurrentTeamAbbr(currentDynasty) || currentDynasty.teamName
    const existingByTeamYear = currentDynasty.draftResultsByTeamYear || {}
    const tid = getTidFromAbbr(teamAbbr, currentDynasty)

    // Map player names to PIDs and store draft info
    const resultsWithPids = draftResults.map(entry => {
      const player = currentDynasty.players?.find(p => p.name === entry.playerName)
      return {
        playerName: entry.playerName,
        pid: player?.pid || null,
        position: entry.position,
        overall: entry.overall,
        draftRound: entry.draftRound
      }
    })

    // Update player records with draft information
    const updatedPlayers = [...(currentDynasty.players || [])]
    draftResults.forEach(entry => {
      const playerIndex = updatedPlayers.findIndex(p =>
        p.name?.toLowerCase().trim() === entry.playerName?.toLowerCase().trim()
      )
      if (playerIndex !== -1) {
        const player = updatedPlayers[playerIndex]
        const existingMovements = player.movements || []

        // Check if draft movement already exists for this year
        const hasDraftMovement = existingMovements.some(m =>
          m.year === year && m.type === 'departure' && m.reason === 'Pro Draft'
        )

        // Determine the player's actual last team (not necessarily user's team)
        const playerTeamsByYear = player.teamsByYear || {}
        const playerYears = Object.keys(playerTeamsByYear).map(Number).sort((a, b) => b - a)
        const playerLastTeam = playerYears.length > 0 ? playerTeamsByYear[playerYears[0]] : (player.team || tid)
        // Convert to tid if it's an abbreviation
        const playerLastTeamTid = typeof playerLastTeam === 'number' ? playerLastTeam : (getTidFromAbbr(playerLastTeam, currentDynasty) || tid)

        // Build canonical v2 movement entry for draft. The previous
        // shape ({ type: 'declared_for_draft' }) was a legacy type that
        // syncDerivedFieldsFromV2 had to convert on every save —
        // round-tripping through the converter is fragile and was
        // implicated in transfer-history corruption after the draft.
        // Write the canonical shape directly. playerLastTeamTid stays
        // computed for future shape changes; the canonical pro_draft
        // departure does not carry a fromTid.
        void playerLastTeamTid
        const draftMovementByYear = {
          type: 'departure',
          departure: 'pro_draft',
          draftRound: entry.draftRound || null,
        }

        // Same canonical shape whether this is the first draft entry or
        // an update — movementByYear is authoritative, v2 sync strips
        // any legacy movements[] on write.
        updatedPlayers[playerIndex] = {
          ...player,
          draftYear: year,
          draftRound: entry.draftRound,
          movementByYear: {
            ...(player.movementByYear || {}),
            [year]: draftMovementByYear,
          },
        }
      }
    })

    const updates = {
      players: updatedPlayers,
      // dual-keyed (rename-safe)
      draftResultsByTeamYear: {
        ...existingByTeamYear,
        [teamAbbr]: {
          ...(existingByTeamYear[teamAbbr] || {}),
          [year]: resultsWithPids
        },
        ...(tid ? { [tid]: { ...(existingByTeamYear[tid] || {}), [year]: resultsWithPids } } : {})
      }
    }

    // Also write to NEW tid-based byYear structure
    if (tid && currentDynasty.teams) {
      const existingTeams = currentDynasty.teams
      const existingTeamData = existingTeams[tid] || {}
      const existingByYear = existingTeamData.byYear || {}
      const existingYearData = existingByYear[year] || {}

      updates.teams = {
        ...existingTeams,
        [tid]: {
          ...existingTeamData,
          byYear: {
            ...existingByYear,
            [year]: {
              ...existingYearData,
              draftResults: resultsWithPids
            }
          }
        }
      }
    }

    await updateDynasty(currentDynasty.id, updates)
  }

  // Handle transfer destinations save (Offseason - National Signing Day)
  // CLEAN SYSTEM: Only updates teamsByYear and movements - no legacy departure fields
  const handleTransferDestinationsSave = async (destinations) => {
    // On Signing Day (week 6) or Training Camp (week 7), year has already flipped, so use previous year
    const isAfterYearFlip = currentDynasty.currentPhase === 'offseason' && currentDynasty.currentWeek >= 6
    const year = isAfterYearFlip ? currentDynasty.currentYear - 1 : currentDynasty.currentYear
    const nextYear = year + 1
    // CRITICAL: Get tid directly - tid is the ONLY source of truth
    const teamTid = getCurrentTeamTid(currentDynasty)
    const teamAbbr = getCurrentTeamAbbr(currentDynasty) || currentDynasty.teamName // For display only
    const existingByTeamYear = currentDynasty.transferDestinationsByTeamYear || {}

    // Update player records with their new team
    const updatedPlayers = [...(currentDynasty.players || [])]

    destinations.forEach(dest => {
      const playerIndex = updatedPlayers.findIndex(p =>
        p.name?.toLowerCase().trim() === dest.playerName?.toLowerCase().trim()
      )
      if (playerIndex !== -1 && dest.newTeam) {
        const player = updatedPlayers[playerIndex]
        // Get old team as tid - ALWAYS use tid
        let oldTeamTid = player.team
        if (typeof oldTeamTid === 'string') {
          oldTeamTid = getTidFromAbbr(oldTeamTid, currentDynasty) || teamTid
        }
        if (!oldTeamTid) oldTeamTid = teamTid

        // Get newTeam as tid (dest.newTeam could be abbr from sheet)
        let newTeamTid = dest.newTeam
        if (typeof newTeamTid === 'string') {
          newTeamTid = getTidFromAbbr(newTeamTid, currentDynasty)
        }

        // Check if this is a RECOMMIT (destination = their current team)
        const isRecommit = newTeamTid === oldTeamTid || newTeamTid === teamTid

        // Advance the player's per-year fields into the arrival year exactly
        // like the normal season rollover does for returners. Previously only
        // teamsByYear[nextYear] was written, so class/OVR/dev were blank for the
        // transfer year (the "skipped year" bug). Age the class one step and
        // carry OVR/dev forward.
        const priorClass = getPlayerClassForYear(player, Number(year)) || player.year
        const advancedClass = CLASS_PROGRESSION[priorClass] || priorClass
        const carriedOverall = player.overallByYear?.[String(year)] ?? player.overallByYear?.[Number(year)] ?? player.overall
        const carriedDev = player.devTraitByYear?.[String(year)] ?? player.devTraitByYear?.[Number(year)] ?? player.devTrait
        const advanceByYear = {
          ...(advancedClass ? { classByYear: { ...(player.classByYear || {}), [String(nextYear)]: advancedClass } } : {}),
          ...(carriedOverall != null ? { overallByYear: { ...(player.overallByYear || {}), [String(nextYear)]: carriedOverall } } : {}),
          ...(carriedDev ? { devTraitByYear: { ...(player.devTraitByYear || {}), [String(nextYear)]: carriedDev } } : {}),
        }

        if (isRecommit) {
          // Player recommitted — they're staying on the team. Canonical
          // v2 type; legacy 'recommitted' was being healed on save anyway.
          const updatedMovementByYear = { ...(player.movementByYear || {}) }
          updatedMovementByYear[Number(year)] = { type: 'recommit' }

          updatedPlayers[playerIndex] = {
            ...player,
            movementByYear: updatedMovementByYear,
            // Keep them on roster for next year (tid-only)
            teamsByYear: {
              ...(player.teamsByYear || {}),
              [String(nextYear)]: oldTeamTid,
            },
            ...advanceByYear,
          }
        } else {
          // Normal transfer to another team. Canonical v2 departure —
          // legacy 'transferred_out' was being converted on save.
          updatedPlayers[playerIndex] = {
            ...player,
            team: newTeamTid, // derived mirror; sync will re-derive on write too
            movementByYear: {
              ...(player.movementByYear || {}),
              [Number(year)]: { type: 'departure', departure: 'transfer_out', toTid: newTeamTid },
            },
            teamsByYear: {
              ...(player.teamsByYear || {}),
              [String(nextYear)]: newTeamTid,
            },
            ...advanceByYear,
          }
        }
      }
    })

    const tid = getTidFromAbbr(teamAbbr, currentDynasty)

    const updates = {
      // dual-keyed (rename-safe)
      transferDestinationsByTeamYear: {
        ...existingByTeamYear,
        [teamAbbr]: {
          ...(existingByTeamYear[teamAbbr] || {}),
          [year]: destinations
        },
        ...(tid ? { [tid]: { ...(existingByTeamYear[tid] || {}), [year]: destinations } } : {})
      },
      players: updatedPlayers
    }

    // Also write to NEW tid-based byYear structure
    if (tid && currentDynasty.teams) {
      const existingTeams = currentDynasty.teams
      const existingTeamData = existingTeams[tid] || {}
      const existingByYear = existingTeamData.byYear || {}
      const existingYearData = existingByYear[year] || {}

      updates.teams = {
        ...existingTeams,
        [tid]: {
          ...existingTeamData,
          byYear: {
            ...existingByYear,
            [year]: {
              ...existingYearData,
              transferDestinations: destinations
            }
          }
        }
      }
    }

    await updateDynasty(currentDynasty.id, updates)
  }

  // Handle recruiting class rank save (National Signing Day)
  const handleRecruitingClassRankSave = async (rank) => {
    // On Signing Day (week 6) or Training Camp (week 7), year has already flipped, so use previous year
    const isAfterYearFlip = currentDynasty.currentPhase === 'offseason' && currentDynasty.currentWeek >= 6
    const year = isAfterYearFlip ? currentDynasty.currentYear - 1 : currentDynasty.currentYear
    const teamAbbr = getCurrentTeamAbbr(currentDynasty) || currentDynasty.teamName
    const existingRanks = currentDynasty.recruitingClassRankByTeamYear || {}
    const tid = getTidFromAbbr(teamAbbr, currentDynasty)

    const updates = {
      // dual-keyed (rename-safe)
      recruitingClassRankByTeamYear: {
        ...existingRanks,
        [teamAbbr]: {
          ...(existingRanks[teamAbbr] || {}),
          [year]: rank
        },
        ...(tid ? { [tid]: { ...(existingRanks[tid] || {}), [year]: rank } } : {})
      }
    }

    // Also write to NEW tid-based byYear structure
    if (tid && currentDynasty.teams) {
      const existingTeams = currentDynasty.teams
      const existingTeamData = existingTeams[tid] || {}
      const existingByYear = existingTeamData.byYear || {}
      const existingYearData = existingByYear[year] || {}

      updates.teams = {
        ...existingTeams,
        [tid]: {
          ...existingTeamData,
          byYear: {
            ...existingByYear,
            [year]: {
              ...existingYearData,
              recruitingClassRank: rank
            }
          }
        }
      }
    }

    await updateDynasty(currentDynasty.id, updates)
  }

  // Handle position changes save (National Signing Day)
  const handlePositionChangesSave = async (changes) => {
    // On Signing Day (week 6) or Training Camp (week 7), year has already flipped, so use previous year
    const isAfterYearFlip = currentDynasty.currentPhase === 'offseason' && currentDynasty.currentWeek >= 6
    const year = isAfterYearFlip ? currentDynasty.currentYear - 1 : currentDynasty.currentYear
    const existingChangesAll = currentDynasty.positionChangesByYear || {}
    const teamTid = getCurrentTeamTid(currentDynasty)

    const changesRecord = changes.map(c => ({
      pid: c.playerId,
      playerName: c.playerName,
      oldPosition: c.oldPosition,
      newPosition: c.newPosition,
      team: teamTid
    }))

    const updatedPositionChanges = { ...existingChangesAll, [year]: changesRecord }

    // Cloud: write each changed player individually (1 Firestore doc per player)
    // instead of rewriting every player in the subcollection. For local storage
    // (IndexedDB) the full write is fast enough — keep it simple there.
    const isCloud = typeof currentDynasty.id === 'string' && currentDynasty.id.length >= 20

    if (isCloud) {
      const playerUpdates = changes
        .map(c => {
          const p = (currentDynasty.players || []).find(pl => pl.pid === c.playerId)
          if (!p || p.position === c.newPosition) return null
          return { ...p, position: c.newPosition, archetype: '' }
        })
        .filter(Boolean)

      await Promise.all(playerUpdates.map(p => updatePlayer(currentDynasty.id, p)))
      await updateDynasty(currentDynasty.id, { positionChangesByYear: updatedPositionChanges })
    } else {
      const updatedPlayers = (currentDynasty.players || []).map(p => {
        const change = changes.find(c => c.playerId === p.pid)
        if (!change || p.position === change.newPosition) return p
        return { ...p, position: change.newPosition, archetype: '' }
      })
      await updateDynasty(currentDynasty.id, {
        players: updatedPlayers,
        positionChangesByYear: updatedPositionChanges
      })
    }
  }

  // Handle training results save (Offseason Week 6)
  const handleTrainingResultsSave = async (results) => {
    const year = currentDynasty.currentYear

    // Update player overalls in the players array
    const updatedPlayers = [...(currentDynasty.players || [])]
    let updatedCount = 0

    const prevYear = year - 1
    results.forEach(result => {
      // Find player by name (case-insensitive match)
      const playerIndex = updatedPlayers.findIndex(p =>
        normalizePlayerName(p.name) === normalizePlayerName(result.playerName)
      )
      if (playerIndex === -1) return
      if (!result.newOverall && result.pastOverall == null) return

      const player = updatedPlayers[playerIndex]
      const nextOverallByYear = { ...(player.overallByYear || {}) }

      if (result.newOverall) {
        nextOverallByYear[year] = result.newOverall
      }
      // Back-fill pastOverall into prev-year slot only if we don't already
      // have a value there. Keeps legitimate prior-year data intact and
      // fills gaps for transfer-portal arrivals whose old-team OVR was
      // never recorded in this dynasty.
      if (
        result.pastOverall != null &&
        nextOverallByYear[prevYear] == null &&
        nextOverallByYear[String(prevYear)] == null
      ) {
        nextOverallByYear[prevYear] = result.pastOverall
      }

      updatedPlayers[playerIndex] = {
        ...player,
        ...(result.newOverall ? { overall: result.newOverall } : {}),
        overallByYear: nextOverallByYear,
      }
      updatedCount++
    })

    // Store training results for history
    const existingResults = currentDynasty.trainingResultsByYear || {}
    const userTid = getUserTeamTid(currentDynasty)

    // Build update payload with both year-only and tid-based structures
    const updates = {
      players: updatedPlayers,
      trainingResultsByYear: {
        ...existingResults,
        [year]: results
      }
    }

    // Also write to tid-based structure
    if (userTid && currentDynasty.teams) {
      const existingTeams = currentDynasty.teams
      const existingTeamData = existingTeams[userTid] || {}
      const existingByYear = existingTeamData.byYear || {}
      const existingYearData = existingByYear[year] || {}

      updates.teams = {
        ...existingTeams,
        [userTid]: {
          ...existingTeamData,
          byYear: {
            ...existingByYear,
            [year]: {
              ...existingYearData,
              trainingResults: results
            }
          }
        }
      }
    }

    await updateDynasty(currentDynasty.id, updates)
  }

  // Handle recruiting class overalls save
  const handleRecruitOverallsSave = async (results) => {
    // On Training Camp (week 7), the year has flipped, but recruits have recruitYear from before the flip
    const isAfterYearFlip = currentDynasty.currentPhase === 'offseason' && currentDynasty.currentWeek >= 6
    const year = isAfterYearFlip ? currentDynasty.currentYear - 1 : currentDynasty.currentYear

    // Update recruit overalls and jersey numbers in the players array
    const updatedPlayers = [...(currentDynasty.players || [])]
    let updatedCount = 0

    // Recruits join in the year AFTER recruitment (freshman year)
    const freshmanYear = isAfterYearFlip ? currentDynasty.currentYear : year + 1

    results.forEach(result => {
      // Find player by name (case-insensitive match) among recruits
      const playerIndex = updatedPlayers.findIndex(p =>
        p.isRecruit &&
        p.recruitYear === year &&
        normalizePlayerName(p.name) === normalizePlayerName(result.name)
      )
      if (playerIndex !== -1 && result.overall) {
        const existingOverallByYear = updatedPlayers[playerIndex].overallByYear || {}
        updatedPlayers[playerIndex] = {
          ...updatedPlayers[playerIndex],
          overall: result.overall,
          // Also update overallByYear for their freshman year
          overallByYear: {
            ...existingOverallByYear,
            [freshmanYear]: result.overall
          },
          ...(result.jerseyNumber && { jerseyNumber: result.jerseyNumber })
        }
        updatedCount++
      }
    })

    // Store recruit overalls for history
    const existingResults = currentDynasty.recruitOverallsByYear || {}

    await updateDynasty(currentDynasty.id, {
      players: updatedPlayers,
      recruitOverallsByYear: {
        ...existingResults,
        [year]: results
      }
    })

  }

  // Handle portal transfer class assignment save
  const handlePortalTransferClassSave = async (classSelections) => {
    // On Signing Day (week 6), the year has already flipped
    const isAfterYearFlip = currentDynasty.currentPhase === 'offseason' && currentDynasty.currentWeek >= 6
    const year = isAfterYearFlip ? currentDynasty.currentYear - 1 : currentDynasty.currentYear
    // Portal transfers join in the year AFTER recruitment
    const joiningYear = isAfterYearFlip ? currentDynasty.currentYear : year + 1

    // Update player classes in the players array
    const updatedPlayers = [...(currentDynasty.players || [])]
    let updatedCount = 0

    classSelections.forEach(selection => {
      // Find player by name (case-insensitive match) among portal transfers
      const playerIndex = updatedPlayers.findIndex(p =>
        p.isPortal &&
        p.recruitYear === year &&
        normalizePlayerName(p.name) === normalizePlayerName(selection.playerName)
      )
      if (playerIndex !== -1 && selection.selectedClass) {
        const existingClassByYear = updatedPlayers[playerIndex].classByYear || {}
        const next = {
          ...updatedPlayers[playerIndex],
          year: selection.selectedClass,
          // Also update classByYear for the new system
          classByYear: {
            ...existingClassByYear,
            [joiningYear]: selection.selectedClass
          }
        }
        // Jersey # from the sheet — only overwrite when the AI extracted
        // one. A blank cell means "unknown, leave the existing value
        // alone." A valid integer 0-99 replaces whatever was there.
        const j = selection.jerseyNumber
        if (j != null && j !== '' && Number.isFinite(Number(j))) {
          next.jerseyNumber = String(Number(j))
        }
        updatedPlayers[playerIndex] = next
        updatedCount++
      }
    })

    // Store selections for tracking (in case we need to regenerate)
    const existingSelections = currentDynasty.portalTransferClassByYear || {}
    const userTid = getUserTeamTid(currentDynasty)

    const updates = {
      players: updatedPlayers,
      portalTransferClassByYear: {
        ...existingSelections,
        [year]: classSelections
      },
      [`portalTransferClassSheetId_${year}`]: null // Clear year-specific sheet ID since task is complete
    }

    // Also write to tid-based structure
    if (userTid && currentDynasty.teams) {
      const existingTeams = currentDynasty.teams
      const existingTeamData = existingTeams[userTid] || {}
      const existingByYear = existingTeamData.byYear || {}
      const existingYearData = existingByYear[year] || {}

      updates.teams = {
        ...existingTeams,
        [userTid]: {
          ...existingTeamData,
          byYear: {
            ...existingByYear,
            [year]: {
              ...existingYearData,
              portalTransferClass: classSelections
            }
          }
        }
      }
    }

    await updateDynasty(currentDynasty.id, updates)

  }

  // Handle fringe case class assignment save
  const handleFringeCaseClassSave = async (classSelections) => {
    // On Signing Day (week 6), the year has already flipped
    const isAfterYearFlip = currentDynasty.currentPhase === 'offseason' && currentDynasty.currentWeek >= 6
    const year = isAfterYearFlip ? currentDynasty.currentYear - 1 : currentDynasty.currentYear

    // Update player classes in the players array
    const updatedPlayers = [...(currentDynasty.players || [])]
    let updatedCount = 0

    classSelections.forEach(selection => {
      // Find player by name (case-insensitive match)
      const playerIndex = updatedPlayers.findIndex(p =>
        normalizePlayerName(p.name) === normalizePlayerName(selection.playerName)
      )
      if (playerIndex !== -1 && selection.selectedClass) {
        // Fringe case class is for the NEXT year (year player will play)
        const joiningYear = isAfterYearFlip ? currentDynasty.currentYear : year + 1
        const existingClassByYear = updatedPlayers[playerIndex].classByYear || {}
        updatedPlayers[playerIndex] = {
          ...updatedPlayers[playerIndex],
          year: selection.selectedClass,
          classByYear: {
            ...existingClassByYear,
            [joiningYear]: selection.selectedClass
          }
        }
        updatedCount++
      }
    })

    // Store selections for tracking
    const existingSelections = currentDynasty.fringeCaseClassByYear || {}
    const userTid = getUserTeamTid(currentDynasty)

    const updates = {
      players: updatedPlayers,
      fringeCaseClassByYear: {
        ...existingSelections,
        [year]: classSelections
      },
      fringeCaseClassSheetId: null // Clear sheet ID since task is complete
    }

    // Also write to tid-based structure
    if (userTid && currentDynasty.teams) {
      const existingTeams = currentDynasty.teams
      const existingTeamData = existingTeams[userTid] || {}
      const existingByYear = existingTeamData.byYear || {}
      const existingYearData = existingByYear[year] || {}

      updates.teams = {
        ...existingTeams,
        [userTid]: {
          ...existingTeamData,
          byYear: {
            ...existingByYear,
            [year]: {
              ...existingYearData,
              fringeCaseClass: classSelections
            }
          }
        }
      }
    }

    await updateDynasty(currentDynasty.id, updates)

  }

  // Get the commitment key based on phase and week
  const getCommitmentKey = () => {
    const phase = currentDynasty.currentPhase
    const week = currentDynasty.currentWeek

    if (phase === 'preseason') {
      return 'preseason'
    } else if (phase === 'regular_season') {
      return `regular_${week}`
    } else if (phase === 'conference_championship') {
      return 'conf_champ'
    } else if (phase === 'postseason') {
      // Postseason weeks 1-4 = Bowl weeks 1-4
      return `bowl_${week}`
    } else if (phase === 'offseason' && week >= 2 && week <= 6) {
      return `signing_${week - 1}` // Week 2 = Recruiting Week 1, Week 6 = Signing Day
    }
    return null
  }

  // Handle recruiting commitments save - TEAM-CENTRIC
  // This function detects potential returning players AND players from other teams who might be transferring
  const handleRecruitingCommitmentsSave = async (recruits) => {
    // On Signing Day (week 6), year has already flipped, so use previous year for recruiting data
    const isAfterYearFlip = currentDynasty.currentPhase === 'offseason' && currentDynasty.currentWeek >= 6
    const year = isAfterYearFlip ? currentDynasty.currentYear - 1 : currentDynasty.currentYear
    const commitmentKey = getCommitmentKey()
    if (!commitmentKey) return

    const teamAbbr = getCurrentTeamAbbr(currentDynasty) || currentDynasty.teamName
    const teamTid = getCurrentTeamTid(currentDynasty)
    const existingPlayers = currentDynasty.players || []

    // Track players who left (leftTeam: true) OR are pending departure
    const leftPlayersMap = new Map()
    const pendingDepartureMap = new Map()
    // Track ALL existing players by name (for detecting transfers from other teams)
    const allPlayersMap = new Map()

    // Get players leaving this year (from playersLeavingByYear)
    const playersLeavingThisYear = currentDynasty.playersLeavingByYear?.[year] || []
    const leavingPids = new Set(playersLeavingThisYear.map(p => p.pid).filter(Boolean))

    existingPlayers.forEach(p => {
      if (p.name) {
        const nameLower = p.name.toLowerCase().trim()

        // Track ALL players for potential transfer matching
        allPlayersMap.set(nameLower, p)

        // Check if player has a departure movement (left the team).
        // Reads BOTH legacy movements[] AND v2 movementByYear — after the
        // v2 migration, movements[] is stripped on every save, so checking
        // only the legacy array missed every departed player and they
        // never showed up as "returning" in the recruiting flow.
        const v2DepartureTypes = new Set(['departure', 'transfer', 'entered_portal', 'transferred_out', 'graduated', 'declared_for_draft', 'encouraged_to_transfer'])
        const v2DepartureShapes = new Set(['transfer_out', 'graduated', 'pro_draft'])
        const hasLegacyDeparture = (p.movements || []).some(m =>
          m.type === 'departure' || m.type === 'transfer'
        )
        const hasV2Departure = Object.values(p.movementByYear || {}).some(m =>
          m && (v2DepartureTypes.has(m.type) || v2DepartureShapes.has(m.departure))
        )
        if (hasLegacyDeparture || hasV2Departure) {
          leftPlayersMap.set(nameLower, p)
        }
        // Check if player is pending departure (in playersLeavingByYear)
        if (leavingPids.has(p.pid)) {
          pendingDepartureMap.set(nameLower, p)
        }
      }
    })

    // Find recruits that are POTENTIAL returning players OR transfers from other teams
    const potentialReturning = recruits.filter(r => {
      if (!r.name) return false
      const nameLower = r.name.toLowerCase().trim()

      // Case 1: Player left this team and might be returning
      if (leftPlayersMap.has(nameLower) || pendingDepartureMap.has(nameLower)) {
        return true
      }

      // Case 2: Player exists in dynasty but was on a DIFFERENT team (transfer following coach)
      const existingPlayer = allPlayersMap.get(nameLower)
      if (existingPlayer) {
        // Check if they were ever on a different team (not the current team)
        const playerTeams = existingPlayer.teamsByYear ? Object.values(existingPlayer.teamsByYear) : []
        const wasOnDifferentTeam = playerTeams.length > 0 && !playerTeams.includes(teamTid)
        // Also check the team field and movements for team info
        const playerTeamTid = existingPlayer.team
        const isDifferentTeam = playerTeamTid && playerTeamTid !== teamTid

        if (wasOnDifferentTeam || isDifferentTeam) {
          return true
        }
      }

      return false
    }).map(recruit => {
      const nameLower = recruit.name.toLowerCase().trim()
      const existingPlayer = pendingDepartureMap.get(nameLower) || leftPlayersMap.get(nameLower) || allPlayersMap.get(nameLower)

      // Get departure info from movements (if any)
      const departureMovement = (existingPlayer?.movements || [])
        .filter(m => m.type === 'departure' || m.type === 'transfer')
        .sort((a, b) => (b.year || 0) - (a.year || 0))[0]

      // Determine reason - if transferring from another team, it's a portal transfer
      let departureReason = departureMovement?.reason || 'Transfer'
      let departureYear = departureMovement?.year || year

      // If player was on a different team (not a departure from current team), it's a transfer
      if (!leftPlayersMap.has(nameLower) && !pendingDepartureMap.has(nameLower)) {
        departureReason = 'Transfer from ' + (getOriginalTeamAbbr(existingPlayer?.team) || 'another team')
        // Find the most recent year they were on a team
        const recentYears = Object.keys(existingPlayer?.teamsByYear || {}).map(Number).filter(y => !isNaN(y))
        departureYear = recentYears.length > 0 ? Math.max(...recentYears) : year
      }

      return { recruit, existingPlayer, departureReason, departureYear, currentTeamAbbr: teamAbbr }
    })

    // If there are potential returning players, show confirmation modal
    if (potentialReturning.length > 0) {
      setPendingRecruitingData({
        recruits,
        year,
        commitmentKey,
        potentialReturning,
        confirmedReturning: [],
        confirmedNew: [],
        currentIndex: 0
      })
      setReturningPlayerConfirmation(potentialReturning[0])
      setShowReturningPlayerConfirm(true)
      return // Don't save yet - wait for confirmations
    }

    // No potential returning players - process directly
    await processRecruitingCommitmentsSave(recruits, year, commitmentKey, [], [])
  }

  // Process recruiting save after all confirmations are complete
  const processRecruitingCommitmentsSave = async (recruits, year, commitmentKey, confirmedReturning, confirmedNew) => {
    // CRITICAL: Get tid directly - tid is the ONLY source of truth
    const teamTid = getCurrentTeamTid(currentDynasty)
    const teamAbbr = getCurrentTeamAbbr(currentDynasty) || currentDynasty.teamName // For display/key lookups only
    // teamsByYear MUST store tid (number), never abbreviation
    const teamsByYearValue = teamTid

    // Use TEAM-CENTRIC structure: recruitingCommitmentsByTeamYear[teamAbbr][year][commitmentKey]
    const existingByTeamYear = currentDynasty.recruitingCommitmentsByTeamYear || {}
    const existingForTeam = existingByTeamYear[teamAbbr] || {}
    const existingForYear = existingForTeam[year] || {}

    // Get existing players and recruits to find max PID
    const existingPlayers = currentDynasty.players || []
    const maxExistingPID = existingPlayers.reduce((max, p) => Math.max(max, p.pid || 0), 0)
    let nextPID = Math.max(maxExistingPID + 1, currentDynasty.nextPID || 1)

    // BULLETPROOF: Collect ALL existing player names (not just recruits) to prevent ANY duplicates
    const existingPlayerNames = new Set()
    existingPlayers.forEach(p => {
      if (p.name) existingPlayerNames.add(p.name.toLowerCase().trim())
    })

    // Track players who left (have departure movement) OR are pending departure
    // Both can "return" via recruiting/signing day
    const leftPlayersMap = new Map()
    const pendingDepartureMap = new Map()
    // Get players leaving this year (from playersLeavingByYear)
    const playersLeavingList = currentDynasty.playersLeavingByYear?.[year] || []
    const leavingPlayerPids = new Set(playersLeavingList.map(p => p.pid).filter(Boolean))

    existingPlayers.forEach(p => {
      if (p.name) {
        const nameLower = p.name.toLowerCase().trim()
        // Check if player has a departure movement (left the team).
        // Reads BOTH legacy movements[] AND v2 movementByYear — see the
        // matching block in updateExistingRosterPlayers above.
        const v2DepartureTypes = new Set(['departure', 'transfer', 'entered_portal', 'transferred_out', 'graduated', 'declared_for_draft', 'encouraged_to_transfer'])
        const v2DepartureShapes = new Set(['transfer_out', 'graduated', 'pro_draft'])
        const hasLegacyDeparture = (p.movements || []).some(m =>
          m.type === 'departure' || m.type === 'transfer'
        )
        const hasV2Departure = Object.values(p.movementByYear || {}).some(m =>
          m && (v2DepartureTypes.has(m.type) || v2DepartureShapes.has(m.departure))
        )
        if (hasLegacyDeparture || hasV2Departure) {
          leftPlayersMap.set(nameLower, p)
        }
        // Check if player is pending departure (in playersLeavingByYear)
        if (leavingPlayerPids.has(p.pid)) {
          pendingDepartureMap.set(nameLower, p)
        }
      }
    })

    // Get existing recruits from OTHER weeks (not the current commitment key) to avoid duplicating
    const commitmentsForTeamYear = getRecruitingCommitments(currentDynasty, teamTid, year)
    const existingRecruitNames = new Set()

    // Only collect names from OTHER commitment keys (not the current one being saved)
    Object.entries(commitmentsForTeamYear).forEach(([key, weekCommitments]) => {
      if (key !== commitmentKey && Array.isArray(weekCommitments)) {
        weekCommitments.forEach(r => {
          if (r.name) existingRecruitNames.add(r.name.toLowerCase().trim())
        })
      }
    })

    // Use confirmed returning players list (user confirmed these are the same players)
    const confirmedReturningNames = new Set(confirmedReturning.map(r => r.name.toLowerCase().trim()))
    // These were confirmed as DIFFERENT players - treat as new
    const confirmedNewNames = new Set(confirmedNew.map(r => r.name.toLowerCase().trim()))

    // Find returning player recruits (user confirmed same player)
    const returningPlayerRecruits = recruits.filter(r => {
      if (!r.name) return false
      const nameLower = r.name.toLowerCase().trim()
      return confirmedReturningNames.has(nameLower)
    })

    // Find NEW recruits - MUST pass ALL checks:
    // 1. Not already in the players array (prevents duplicating existing roster) - UNLESS user confirmed different player
    // 2. Not already in OTHER weeks' commitments (prevents cross-week duplicates)
    const newRecruits = recruits.filter(r => {
      if (!r.name) return false
      const nameLower = r.name.toLowerCase().trim()
      // Skip if this is a confirmed returning player (handled separately)
      if (confirmedReturningNames.has(nameLower)) return false
      // If user confirmed this is a DIFFERENT player (same name but new person), allow creation
      if (confirmedNewNames.has(nameLower)) return true
      // Otherwise, reject if already exists as an ACTIVE player
      if (existingPlayerNames.has(nameLower)) return false
      // Reject if already in other weeks' commitments
      if (existingRecruitNames.has(nameLower)) return false
      return true
    })

    // Create player entries for new recruits
    const newPlayers = newRecruits.map(recruit => {
      const pid = nextPID++

      // Convert recruit class to player year (they'll be this class when they enroll)
      const classToYear = {
        'HS': 'Fr',
        'JUCO Fr': 'So',      // JUCO freshmen enter as sophomores
        'JUCO So': 'Jr',      // JUCO sophomores enter as juniors
        'JUCO Jr': 'Sr',      // JUCO juniors enter as seniors
        'Fr': 'Fr',
        'RS Fr': 'RS Fr',
        'So': 'So',
        'RS So': 'RS So',
        'Jr': 'Jr',
        'RS Jr': 'RS Jr',
        'Sr': 'Sr',
        'RS Sr': 'RS Sr'
      }

      // Auto-detect transfer portal players based on class
      // Portal players are Fr, So, Jr, Sr (or RS versions) - NOT HS or JUCO
      const portalClasses = ['Fr', 'RS Fr', 'So', 'RS So', 'Jr', 'RS Jr', 'Sr', 'RS Sr']
      const recruitClass = (recruit.class || '').trim()
      const isPortalPlayer = recruit.isPortal || portalClasses.some(pc => pc.toLowerCase() === recruitClass.toLowerCase())

      // For portal players, resolve previousTeam to a tid if possible
      // Try multiple resolution methods: tid lookup by name, abbreviation, or team name
      let previousTeamTid = null
      if (recruit.previousTeam && isPortalPlayer) {
        const prevTeamText = recruit.previousTeam.trim()
        // Try to resolve as tid from team name or abbreviation
        previousTeamTid = getTidFromTeamName(prevTeamText, currentDynasty?.teams) ||
                          getTidFromAbbr(prevTeamText, currentDynasty) ||
                          resolveTid(prevTeamText, currentDynasty?.teams || TEAMS)
        // If resolution failed but we have text, it might be an FCS/non-FBS team - keep as null
      }

      // Store previousTeam as tid if resolved, otherwise keep original text for display fallback
      const previousTeam = previousTeamTid || recruit.previousTeam || (isPortalPlayer ? null : '')

      const enrollmentYear = year + 1 // Year they will be on the roster
      const enrollmentClass = classToYear[recruit.class] || 'Fr'
      const fromTeamTid = isPortalPlayer ? previousTeamTid : null

      return {
        pid,
        id: `player-${pid}`,
        name: recruit.name,
        position: recruit.position || '',
        year: enrollmentClass,
        jerseyNumber: '',
        devTrait: recruit.devTrait || 'Normal',
        archetype: recruit.archetype || '',
        overall: null, // Recruits don't have OVR until they enroll
        height: recruit.height || '',
        weight: recruit.weight || 0,
        hometown: recruit.hometown || '',
        state: recruit.state || '',
        team: teamTid, // derived mirror; sync re-derives on every write
        isRecruit: true,
        recruitYear: year, // The recruiting class year (they play NEXT year)
        // Canonical v2: per-year maps only — legacy movements[] is NOT
        // written here (syncDerivedFieldsFromV2 would strip it anyway).
        teamsByYear: { [enrollmentYear]: teamsByYearValue },
        classByYear: { [enrollmentYear]: enrollmentClass },
        devTraitByYear: { [enrollmentYear]: recruit.devTrait || 'Normal' },
        movementByYear: {
          [year]: isPortalPlayer
            ? { type: 'arrival', arrival: 'transfer_in', fromTid: fromTeamTid }
            : { type: 'arrival', arrival: 'recruit' },
        },
        // Recruiting info
        stars: recruit.stars || 0,
        nationalRank: recruit.nationalRank || null,
        stateRank: recruit.stateRank || null,
        positionRank: recruit.positionRank || null,
        gemBust: recruit.gemBust || '',
        previousTeam: previousTeam,
        isPortal: isPortalPlayer,
      }
    })

    // Update returning players - players who left OR are pending departure but coming back
    // OR players transferring from another team (following the coach)
    // IMPORTANT: Preserve all existing player data (stats, history, etc.)
    let playersWithReturning = existingPlayers
    if (returningPlayerRecruits.length > 0) {
      const returningNames = new Set(returningPlayerRecruits.map(r => r.name.toLowerCase().trim()))
      playersWithReturning = existingPlayers.map(p => {
        if (p.name && returningNames.has(p.name.toLowerCase().trim())) {
          // Find the matching recruit data to get updated info
          const recruitData = returningPlayerRecruits.find(
            r => r.name.toLowerCase().trim() === p.name.toLowerCase().trim()
          )

          // Determine if this is a same-team return or a transfer from another team
          const playerPreviousTeamTid = p.team
          const playerTeamsByYear = p.teamsByYear || {}
          const mostRecentTeamTid = Object.entries(playerTeamsByYear)
            .sort(([a], [b]) => Number(b) - Number(a))[0]?.[1] || playerPreviousTeamTid
          const isFromDifferentTeam = mostRecentTeamTid && mostRecentTeamTid !== teamTid

          // Create appropriate movement based on whether same-team or different-team transfer
          let newMovement
          if (isFromDifferentTeam) {
            // Player is transferring FROM another team TO current team
            newMovement = createMovement(
              year,
              MOVEMENT_TYPES.PORTAL_IN,
              mostRecentTeamTid, // from their previous team
              teamTid, // to current team
              'Transfer'
            )
          } else {
            // Player is returning to the same team
            newMovement = createMovement(
              year,
              MOVEMENT_TYPES.RECOMMIT,
              teamTid, // from (they were on this team)
              teamTid, // to (they're staying on this team)
              'Returned from portal'
            )
          }

          // CRITICAL: Preserve all existing player data, only update
          // specific fields. v2 canonical writes only — the sync layer
          // strips legacy movements[] / leftTeam / leavingYear / etc.
          void newMovement // computed above for readability; not persisted
          const updatedPlayer = {
            ...p, // Preserve everything: pid, name, statsByYear, classByYear, overall, etc.
            movementByYear: {
              ...(p.movementByYear || {}),
              [Number(year)]: isFromDifferentTeam
                ? { type: 'departure', departure: 'transfer_out', toTid: teamTid }
                : { type: 'recommit' }
            },
            team: teamTid, // derived mirror
            teamsByYear: {
              ...p.teamsByYear,
              [year + 1]: teamsByYearValue // Add them to next year's roster
            },
            // Entry reason for the new system
            entryReason: isFromDifferentTeam ? 'transfer_in' : (p.entryReason || 'recruited'),
            // Mark as returning recruit for this year
            isRecruit: true,
            recruitYear: year,
            isPortal: true, // Returning players are portal transfers
            // Set previousTeam for portal filtering - use the team they came from
            previousTeam: isFromDifferentTeam ? getOriginalTeamAbbr(mostRecentTeamTid) : (p.previousTeam || null),
            // Only update position if explicitly provided and different
            ...(recruitData?.position && recruitData.position !== p.position && { position: recruitData.position })
          }

          // Update ranks from the sheet data (these are new for this recruiting cycle)
          if (recruitData?.stars) updatedPlayer.stars = recruitData.stars
          if (recruitData?.nationalRank) updatedPlayer.nationalRank = recruitData.nationalRank
          if (recruitData?.stateRank) updatedPlayer.stateRank = recruitData.stateRank
          if (recruitData?.positionRank) updatedPlayer.positionRank = recruitData.positionRank
          if (recruitData?.devTrait) {
            updatedPlayer.devTrait = recruitData.devTrait
            const enrollYear = year + 1
            updatedPlayer.devTraitByYear = {
              ...(updatedPlayer.devTraitByYear || {}),
              [enrollYear]: recruitData.devTrait
            }
          }
          if (recruitData?.gemBust) updatedPlayer.gemBust = recruitData.gemBust

          // Explicitly ensure critical data is preserved (defensive)
          if (p.statsByYear) updatedPlayer.statsByYear = p.statsByYear
          if (p.classByYear) updatedPlayer.classByYear = p.classByYear
          if (p.overall) updatedPlayer.overall = p.overall
          if (p.archetype) updatedPlayer.archetype = p.archetype
          if (p.jerseyNumber) updatedPlayer.jerseyNumber = p.jerseyNumber

          return updatedPlayer
        }
        return p
      })
    }

    // Also track players from sheet who are already on active roster (not leaving)
    // These don't need processing but should be acknowledged in commitments
    const alreadyOnRosterRecruits = recruits.filter(r => {
      if (!r.name) return false
      const nameLower = r.name.toLowerCase().trim()
      // Already on roster AND not a returning player (flags already cleared in previous save)
      const isOnActiveRoster = existingPlayerNames.has(nameLower)
      const isReturning = leftPlayersMap.has(nameLower) || pendingDepartureMap.has(nameLower)
      return isOnActiveRoster && !isReturning
    })

    // For players already on roster, sync any recruit fields that the
    // user updated in the sheet — most importantly devTrait, which the
    // user typically enters at Signing Day on recruits already added in
    // earlier recruiting weeks. Previous version only patched portal
    // status; updates to dev trait / archetype / stars / ranks / etc.
    // were silently dropped because alreadyOnRosterRecruits aren't
    // surfaced through the newPlayers / returningPlayers paths.
    const portalClasses = ['Fr', 'RS Fr', 'So', 'RS So', 'Jr', 'RS Jr', 'Sr', 'RS Sr']
    const alreadyOnRosterNames = new Set(
      alreadyOnRosterRecruits.map(r => r.name.toLowerCase().trim())
    )
    const playersWithPortalFix = playersWithReturning.map(p => {
      if (!p.name || !alreadyOnRosterNames.has(p.name.toLowerCase().trim())) {
        return p
      }
      const recruitData = alreadyOnRosterRecruits.find(
        r => r.name.toLowerCase().trim() === p.name.toLowerCase().trim()
      )
      if (!recruitData) return p

      const recruitClass = (recruitData.class || '').trim()
      const isPortalPlayer = recruitData.isPortal || portalClasses.some(pc => pc.toLowerCase() === recruitClass.toLowerCase())

      // Resolve the year this recruit lands in. recruitYear is the
      // recruiting class year; they enroll in year+1. For an existing
      // player, fall back to their existing recruitYear or the current
      // recruiting year.
      const recruitYr = Number(p.recruitYear ?? year)
      const enrollYr = Number.isFinite(recruitYr) ? recruitYr + 1 : null

      const updated = { ...p }

      // Dev trait — only overwrite when the sheet has a non-Normal pick
      // OR the player has no dev trait at all. "Normal" is the default
      // sheet value; a user who left it as Normal means "keep as-is."
      // Stamp devTraitByYear[enrollYr] too so the player profile shows
      // the right trait for the year they enroll.
      const sheetTrait = (recruitData.devTrait || '').trim()
      const isMeaningfulTrait = sheetTrait && sheetTrait !== 'Normal'
      if (isMeaningfulTrait || (sheetTrait && !p.devTrait)) {
        updated.devTrait = sheetTrait
        if (enrollYr != null) {
          updated.devTraitByYear = {
            ...(p.devTraitByYear || {}),
            [enrollYr]: sheetTrait,
          }
        }
      }

      // Sync the rest of the recruit's editable scouting fields — same
      // semantics: only overwrite when the sheet has a real value.
      if (recruitData.archetype && !p.archetype) updated.archetype = recruitData.archetype
      if (recruitData.stars != null && (p.stars == null || p.stars === 0)) updated.stars = recruitData.stars
      if (recruitData.nationalRank != null && p.nationalRank == null) updated.nationalRank = recruitData.nationalRank
      if (recruitData.stateRank != null && p.stateRank == null) updated.stateRank = recruitData.stateRank
      if (recruitData.positionRank != null && p.positionRank == null) updated.positionRank = recruitData.positionRank
      if (recruitData.gemBust && !p.gemBust) updated.gemBust = recruitData.gemBust
      if (recruitData.height && !p.height) updated.height = recruitData.height
      if (recruitData.weight && !p.weight) updated.weight = recruitData.weight
      if (recruitData.hometown && !p.hometown) updated.hometown = recruitData.hometown
      if (recruitData.state && !p.state) updated.state = recruitData.state

      // Portal status — always mark as portal, always apply a real team name
      // from the sheet so re-submitting with a correction actually takes effect.
      // Only fall back to 'Transfer Portal' when the sheet has no team and the
      // player record has no existing value.
      if (isPortalPlayer) {
        updated.isPortal = true
        const sheetPrevTeam = (recruitData.previousTeam || '').trim()
        if (sheetPrevTeam && sheetPrevTeam !== 'Transfer Portal') {
          // Real team provided — always overwrite (this is the correction path)
          updated.previousTeam = sheetPrevTeam
        } else if (!p.previousTeam) {
          updated.previousTeam = sheetPrevTeam || 'Transfer Portal'
        }
        // If sheet has no real team but player already has one, keep existing value
      }

      return updated
    })

    // Store recruits for this phase/week AND add new players
    const updatedPlayers = [...playersWithPortalFix, ...newPlayers]

    // All commits: new recruits + returning players + already-on-roster (re-saves)
    // Enrich commitment data with portal detection (previousTeam required for filtering)
    // portalClasses already declared above
    const enrichCommitment = (recruit) => {
      // Normalize class for comparison (case-insensitive, trimmed)
      const recruitClass = (recruit.class || '').trim()
      const isPortalPlayer = recruit.isPortal || portalClasses.some(pc => pc.toLowerCase() === recruitClass.toLowerCase())
      const previousTeam = recruit.previousTeam || (isPortalPlayer ? 'Transfer Portal' : '')
      return {
        ...recruit,
        isPortal: isPortalPlayer,
        previousTeam: previousTeam
      }
    }

    const allCommittedRecruits = [
      ...newRecruits.map(enrichCommitment),
      ...returningPlayerRecruits.map(enrichCommitment),
      ...alreadyOnRosterRecruits.map(enrichCommitment)
    ]

    // Save if there are any recruits to record OR if player data changed
    const hasPlayerChanges = returningPlayerRecruits.length > 0 || newPlayers.length > 0
    if (allCommittedRecruits.length > 0 || hasPlayerChanges) {
      const tid = getTidFromAbbr(teamAbbr, currentDynasty)
      const commitmentData = {
        ...existingForYear,
        [commitmentKey]: allCommittedRecruits
      }

      // Store in TEAM-CENTRIC structure - store all commits for this commitment key
      const updates = {
        // dual-keyed (rename-safe)
        recruitingCommitmentsByTeamYear: {
          ...existingByTeamYear,
          [teamAbbr]: {
            ...(existingByTeamYear[teamAbbr] || {}),
            [year]: commitmentData
          },
          ...(tid ? { [tid]: { ...(existingByTeamYear[tid] || {}), [year]: commitmentData } } : {})
        },
        players: updatedPlayers,
        nextPID: nextPID
      }

      // Also write to NEW tid-based byYear structure
      if (tid && currentDynasty.teams) {
        const existingTeams = currentDynasty.teams
        const existingTeamData = existingTeams[tid] || {}
        const existingByYear = existingTeamData.byYear || {}
        const existingYearData = existingByYear[year] || {}

        updates.teams = {
          ...existingTeams,
          [tid]: {
            ...existingTeamData,
            byYear: {
              ...existingByYear,
              [year]: {
                ...existingYearData,
                recruitingCommitments: commitmentData
              }
            }
          }
        }
      }

      await updateDynasty(currentDynasty.id, updates)
    }
  }

  // Handle returning player confirmation response
  const handleReturningPlayerConfirm = async (isSamePlayer) => {
    if (!pendingRecruitingData) return

    const {
      recruits,
      year,
      commitmentKey,
      potentialReturning,
      confirmedReturning,
      confirmedNew,
      currentIndex
    } = pendingRecruitingData

    const currentMatch = potentialReturning[currentIndex]

    // Add to appropriate list based on user's decision
    const newConfirmedReturning = isSamePlayer
      ? [...confirmedReturning, currentMatch.recruit]
      : confirmedReturning
    const newConfirmedNew = !isSamePlayer
      ? [...confirmedNew, currentMatch.recruit]
      : confirmedNew

    // Check if there are more confirmations
    if (currentIndex < potentialReturning.length - 1) {
      // Show next confirmation
      const nextIndex = currentIndex + 1
      setPendingRecruitingData({
        ...pendingRecruitingData,
        confirmedReturning: newConfirmedReturning,
        confirmedNew: newConfirmedNew,
        currentIndex: nextIndex
      })
      setReturningPlayerConfirmation(potentialReturning[nextIndex])
    } else {
      // All confirmations done - process the save
      setShowReturningPlayerConfirm(false)
      setReturningPlayerConfirmation(null)
      setPendingRecruitingData(null)

      await processRecruitingCommitmentsSave(
        recruits,
        year,
        commitmentKey,
        newConfirmedReturning,
        newConfirmedNew
      )
    }
  }

  // Handle canceling returning player confirmation
  const handleReturningPlayerCancel = () => {
    setShowReturningPlayerConfirm(false)
    setReturningPlayerConfirmation(null)
    setPendingRecruitingData(null)
  }

  // Handle marking no commitments for the week - TEAM-CENTRIC
  const handleNoCommitments = async () => {
    const year = offseasonDataYear
    const commitmentKey = getCommitmentKey()
    if (!commitmentKey) return

    const teamAbbr = getCurrentTeamAbbr(currentDynasty) || currentDynasty.teamName
    const tid = getTidFromAbbr(teamAbbr, currentDynasty)

    // Use TEAM-CENTRIC structure
    const existingByTeamYear = currentDynasty.recruitingCommitmentsByTeamYear || {}
    const existingForTeam = existingByTeamYear[teamAbbr] || {}
    const existingForYear = existingForTeam[year] || {}

    const commitmentData = {
      ...existingForYear,
      [commitmentKey]: []
    }

    // Store empty array to mark as completed — dual-keyed (rename-safe)
    const updates = {
      recruitingCommitmentsByTeamYear: {
        ...existingByTeamYear,
        [teamAbbr]: {
          ...(existingByTeamYear[teamAbbr] || {}),
          [year]: commitmentData
        },
        ...(tid ? { [tid]: { ...(existingByTeamYear[tid] || {}), [year]: commitmentData } } : {})
      }
    }

    // Also write to NEW tid-based byYear structure
    if (tid && currentDynasty.teams) {
      const existingTeams = currentDynasty.teams
      const existingTeamData = existingTeams[tid] || {}
      const existingByYear = existingTeamData.byYear || {}
      const existingYearData = existingByYear[year] || {}

      updates.teams = {
        ...existingTeams,
        [tid]: {
          ...existingTeamData,
          byYear: {
            ...existingByYear,
            [year]: {
              ...existingYearData,
              recruitingCommitments: commitmentData
            }
          }
        }
      }
    }

    await updateDynasty(currentDynasty.id, updates)
  }

  // Get all previous commitments for the current team/year (to pre-populate sheet) - TID-BASED
  const getAllPreviousCommitments = () => {
    // Use offseasonDataYear to handle year flip on Signing Day (week 6)
    // Commitments from weeks 1-5 are stored under the old year
    const year = offseasonDataYear
    const userTid = getUserTeamTid(currentDynasty)

    // Use TID-BASED getter
    const commitmentsForTeamYear = getRecruitingCommitments(currentDynasty, userTid, year)
    const allCommitments = []
    const seenNames = new Set()

    // Collect all commitments from all weeks/phases, de-duplicating by name
    Object.values(commitmentsForTeamYear).forEach(weekCommitments => {
      if (Array.isArray(weekCommitments)) {
        weekCommitments.forEach(commit => {
          const nameLower = (commit.name || '').toLowerCase().trim()
          if (nameLower && !seenNames.has(nameLower)) {
            seenNames.add(nameLower)
            allCommitments.push(commit)
          }
        })
      }
    })

    return allCommitments
  }

  // Get the display label for recruiting modal
  const getRecruitingLabel = () => {
    const phase = currentDynasty.currentPhase
    const week = currentDynasty.currentWeek

    if (phase === 'preseason') {
      return 'Preseason'
    } else if (phase === 'regular_season') {
      return `Week ${week}`
    } else if (phase === 'conference_championship') {
      return 'Conference Championship Week'
    } else if (phase === 'postseason') {
      if (week === 4) return 'National Championship Week'
      if (week === 5) return 'End of Season'
      return `Bowl Week ${week}`
    } else if (phase === 'offseason' && week >= 2 && week <= 6) {
      if (week === 6) return 'National Signing Day'
      return `Recruiting Week ${week - 1}`
    }
    return 'Recruiting'
  }

  // Handle player match confirmation response
  const handlePlayerMatchConfirm = async (isSamePlayer) => {
    const { honorType, entries, year, confirmations, transferDecisions, rawData } = pendingHonorData
    const currentConfirm = confirmations[currentConfirmIndex]

    // Add this decision
    const newDecisions = [
      ...transferDecisions,
      { entryIndex: currentConfirm.entryIndex, isSamePlayer }
    ]

    // Check if there are more confirmations for this batch
    if (currentConfirmIndex < confirmations.length - 1) {
      // Show next confirmation
      const nextIndex = currentConfirmIndex + 1
      setCurrentConfirmIndex(nextIndex)
      setPlayerMatchConfirmation(confirmations[nextIndex])
      setPendingHonorData({ ...pendingHonorData, transferDecisions: newDecisions })
    } else {
      // All confirmations done for this batch - process with decisions
      setShowPlayerMatchConfirm(false)

      const result = await processHonorPlayers(
        currentDynasty.id,
        honorType,
        entries,
        year,
        newDecisions
      )

      if (result.success) {
        // All done - save the raw data to the appropriate year structure
        if (honorType === 'awards') {
          const existingByYear = currentDynasty.awardsByYear || {}
          await updateDynasty(currentDynasty.id, {
            awardsByYear: {
              ...existingByYear,
              [year]: rawData
            }
          })
        } else if (honorType === 'allAmericans') {
          // Save All-Americans data
          const existingByYear = currentDynasty.allAmericansByYear || {}
          const existingYearData = existingByYear[year] || {}
          await updateDynasty(currentDynasty.id, {
            allAmericansByYear: {
              ...existingByYear,
              [year]: {
                ...existingYearData,
                allAmericans: rawData.allAmericans || []
              }
            }
          })
        } else if (honorType === 'allConference') {
          // Save All-Conference data (already grouped by conference from rawData)
          const existingByYear = currentDynasty.allAmericansByYear || {}
          const existingYearData = existingByYear[year] || {}
          await updateDynasty(currentDynasty.id, {
            allAmericansByYear: {
              ...existingByYear,
              [year]: {
                ...existingYearData,
                allConference: rawData.allConference || [],
                allConferenceByConference: rawData.allConferenceByConference || {}
              }
            }
          })
        }
      }

      // Reset state
      setPendingHonorData(null)
      setCurrentConfirmIndex(0)
      setPlayerMatchConfirmation(null)
    }
  }

  // Cancel player match confirmation - cancel the whole save operation
  const handlePlayerMatchCancel = () => {
    setShowPlayerMatchConfirm(false)
    setPendingHonorData(null)
    setCurrentConfirmIndex(0)
    setPlayerMatchConfirmation(null)
  }

  // Get CC game if played
  const getCCGame = () => {
    return findCurrentTeamGame(currentDynasty,
      g => (g.isConferenceChampionship || g.gameType === GAME_TYPES.CONFERENCE_CHAMPIONSHIP) && isSameYear(g.year, currentDynasty.currentYear)
    )
  }

  // Filter teams for CC opponent dropdown
  const getFilteredTeams = () => {
    const search = ccOpponentSearch.toLowerCase()
    const allTeams = Object.entries(teamAbbreviations)

    if (!search) {
      // Show all teams sorted alphabetically by name when no search
      return allTeams.sort((a, b) => a[1].name.localeCompare(b[1].name))
    }

    return allTeams
      .filter(([abbr, team]) =>
        abbr.toLowerCase().includes(search) ||
        team.name.toLowerCase().includes(search)
      )
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
  }

  const canAdvanceFromPreseason = () => {
    // Note: conferencesEntered is NOT required - default conferences are always valid
    // The task shows as optional/incomplete until user customizes, but doesn't block advancement
    // Use team-centric preseason setup
    const baseRequirements =
      teamPreseasonSetup?.scheduleEntered &&
      teamPreseasonSetup?.rosterEntered &&
      teamPreseasonSetup?.teamRatingsEntered

    // Coaching staff only required in first year of dynasty or first year on new team
    // After that, coordinators are managed through offseason firing/hiring flow
    if (currentDynasty.coachPosition === 'HC' && isFirstYearOnTeam(currentDynasty)) {
      return baseRequirements && teamPreseasonSetup?.coachingStaffEntered
    }

    return baseRequirements
  }

  const getPhaseDisplay = (phase, week) => {
    if (phase === 'postseason') {
      if (week === 5) return 'End of Season Recap'
      return week === 4 ? 'National Championship' : `Bowl Week ${week}`
    }
    if (phase === 'offseason') {
      if (week === 1) return 'Players Leaving'
      if (week === 6) return 'National Signing Day'
      if (week === 7) return 'Training Camp'
      if (week === 8) return 'Offseason'
      if (week >= 2 && week <= 5) return `Recruiting Week ${week - 1} of 4`
      return 'Off-Season'
    }
    const phases = {
      preseason: 'Pre-Season',
      regular_season: 'Regular Season',
      offseason: 'Off-Season'
    }
    return phases[phase] || phase
  }

  // Get user games for current year with perspective (unified game format)
  const currentYearGames = useMemo(() => {
    return (currentDynasty?.games || [])
      .filter(g => Number(g.year) === Number(currentDynasty?.currentYear))
      .map(g => {
        const perspective = getUserGamePerspective(g, currentDynasty)
        return perspective ? { ...g, perspective } : null
      })
      .filter(Boolean)
      .sort((a, b) => a.week - b.week)
  }, [currentDynasty?.games, currentDynasty?.currentYear, currentDynasty?.coachTeamByYear])

  return (
    <div className="atmosphere relative space-y-3 sm:space-y-6 max-w-7xl mx-auto">
      {/* Read-only banner — collapses to a single pill via the chevron.
          Visible whenever the user lacks write access on a cloud dynasty
          (non-premium owner OR non-premium shared editor), but not on
          public-share routes (where shareCode is set). */}
      {isViewOnly && currentDynasty?.storageType === 'cloud' && !shareCode && (
        <div
          className="rounded-lg bg-surface-2 border border-surface-4 overflow-hidden"
          style={{ boxShadow: 'inset 3px 0 0 0 var(--accent-warning)' }}
        >
          <button
            type="button"
            onClick={toggleReadOnlyBanner}
            className="w-full flex items-center justify-between gap-3 px-3 py-2 hover:bg-surface-3 transition-colors group"
            aria-expanded={readOnlyBannerExpanded}
          >
            <div className="flex items-center gap-2 text-sm min-w-0">
              <svg className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent-warning)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="font-semibold text-txt-primary">Read-only</span>
              <span className="text-txt-tertiary truncate hidden sm:inline">Premium required to edit</span>
            </div>
            <svg
              className={`w-4 h-4 flex-shrink-0 text-txt-tertiary group-hover:text-txt-secondary transition-transform ${readOnlyBannerExpanded ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {readOnlyBannerExpanded && (
            <div className="px-4 py-3 border-t border-surface-4">
              <p className="text-sm text-txt-secondary">
                Premium is required to edit this dynasty. Download a backup and import it as a local dynasty to keep editing offline, or upgrade to Premium.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => exportDynasty(currentDynasty.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-surface-4 bg-surface-3 text-txt-primary hover:bg-surface-4 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download Backup
                </button>
                <Link
                  to="/account"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md text-white transition-colors"
                  style={{ backgroundColor: 'var(--accent-premium, #8b5cf6)' }}
                  onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.08)'}
                  onMouseLeave={e => e.currentTarget.style.filter = 'none'}
                >
                  Upgrade to Premium
                </Link>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Note: Google Sheets are now created lazily when user opens entry modals */}

      {/* New Job Banner - show when user is taking a new job */}
      {takingNewJob === true && newJobTeam && newJobPosition && (() => {
        // newJobTeam is already the full display name (e.g., "Delaware Fightin' Blue Hens")
        const newTeamLogo = getTeamLogo(newJobTeam, currentDynasty?.teams || currentDynasty?.customTeams)
        const newTeamColors = getTeamColors(newJobTeam, currentDynasty?.teams || currentDynasty?.customTeams) || { primary: '#333', secondary: '#fff' }
        const newTeamPrimaryText = 'var(--surface-1)'

        return (
          <div
            className="rounded-lg shadow-lg p-4 flex items-center gap-4"
            style={{
              backgroundColor: 'var(--text-primary)',
              border: `3px solid ${newTeamColors.secondary}`
            }}
          >
            {newTeamLogo && (
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                style={{
                  backgroundColor: '#FFFFFF',
                  border: `2px solid ${newTeamColors.secondary}`,
                  padding: '3px'
                }}
              >
                <img
                  src={newTeamLogo}
                  alt="New team logo"
                  className="w-full h-full object-contain"
                />
              </div>
            )}
            <div className="flex-1">
              <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: newTeamPrimaryText, opacity: 0.7 }}>
                Taking New Job
              </div>
              <div className="text-lg font-bold" style={{ color: newTeamPrimaryText }}>
                {newJobPosition === 'HC' ? 'Head Coach' : newJobPosition === 'OC' ? 'Offensive Coordinator' : 'Defensive Coordinator'} - {getTeamNameFromAbbr(newJobTeam)}
              </div>
            </div>
            {!isViewOnly && (
              <button
                onClick={() => setShowNewJobEditModal(true)}
                className="p-2 rounded-lg hover:opacity-80 transition-opacity flex-shrink-0"
                style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)' }}
                title="Edit new job selection"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            )}
          </div>
        )
      })()}

      {/* Team Info Header */}
      {(() => {
        // Use centralized single-source-of-truth record calculation
        const teamRecord = getCurrentTeamRecord(currentDynasty)
        const headerWins = teamRecord?.wins || 0
        const headerLosses = teamRecord?.losses || 0
        const headerConfWins = teamRecord?.confWins || 0
        const headerConfLosses = teamRecord?.confLosses || 0

        // UNIFIED RANKING: Use centralized helper (prioritizes final poll, falls back to most recent game)
        const rankingData = getCurrentTeamRanking(currentDynasty)
        const currentRank = rankingData?.rank

        // CFB-27 broadcast banner: wash the header in the user's primary
        // color and pick a contrast text color so the identity reads on any
        // team. Mirrors the team page (TeamYear) hero exactly.
        const heroBg = teamColors?.primary || '#1f2937'
        const heroText = getContrastTextColor(heroBg)
        const ratingItems = teamRatings
          ? [
              { label: 'OVR', value: teamRatings.overall },
              { label: 'OFF', value: teamRatings.offense },
              { label: 'DEF', value: teamRatings.defense },
            ]
          : null

        return (
          <div
            className="card overflow-hidden mb-4 sm:mb-6 relative z-10 reveal"
            style={{
              backgroundColor: heroBg,
              backgroundImage:
                'linear-gradient(120deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 44%), linear-gradient(180deg, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.44) 100%)',
            }}
          >
            <div className="relative p-4 sm:p-6 flex flex-row items-center justify-between gap-2.5 sm:gap-4">
              <Link
                to={`${pathPrefix}/team/${userTeamTid}/${currentDynasty.currentYear}`}
                className="flex items-center gap-3 sm:gap-5 hover:opacity-90 transition-opacity min-w-0 flex-1 group"
              >
                {(() => {
                  // Get logo from user's current team (using userId as source of truth)
                  let logoUrl = null
                  if (userTeamData) {
                    logoUrl = userTeamData.logo || userTeamData.logoUrl
                  }
                  if (!logoUrl) logoUrl = getTeamLogo(userTeamName, currentDynasty.teams)
                  return logoUrl ? (
                    <div
                      className="w-14 h-14 sm:w-20 sm:h-20 rounded-full flex items-center justify-center flex-shrink-0 bg-white overflow-hidden"
                      style={{ border: `2px solid ${heroBg}`, padding: '8px' }}
                    >
                      <img
                        src={logoUrl}
                        alt={`${userTeamName} logo`}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ) : null
                })()}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {currentRank && (
                      <span
                        className="shrink-0 px-2 py-0.5 rounded-md text-sm font-bold tabular-nums"
                        style={{ backgroundColor: 'rgba(0,0,0,0.28)', color: heroText }}
                      >
                        #{currentRank}
                      </span>
                    )}
                    <h2
                      className="font-display font-extrabold uppercase tracking-tight leading-none truncate"
                      style={{ color: heroText, fontSize: 'clamp(1.05rem, 2.6vw, 2.125rem)' }}
                    >
                      {userTeamName}
                    </h2>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 flex-wrap" style={{ color: heroText }}>
                    <span className="font-display font-bold text-lg tabular" style={{ opacity: 0.95 }}>
                      {headerWins}-{headerLosses}
                      {(headerConfWins > 0 || headerConfLosses > 0) && (
                        <span style={{ opacity: 0.7 }}> ({headerConfWins}-{headerConfLosses})</span>
                      )}
                    </span>
                    {userTeamConference && (
                      <>
                        <span style={{ opacity: 0.5 }}>•</span>
                        <span className="font-semibold" style={{ opacity: 0.9 }}>{userTeamConference}</span>
                        {getConferenceLogo(userTeamConference) && (
                          <div className="h-6 w-6 sm:h-7 sm:w-7 rounded-full flex items-center justify-center flex-shrink-0 bg-white/90" style={{ padding: '3px' }}>
                            <img
                              src={getConferenceLogo(userTeamConference)}
                              alt={userTeamConference}
                              className="h-full w-full object-contain"
                            />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </Link>
              {teamRatings && (
                <div className="flex items-center gap-1 sm:gap-3 self-center flex-shrink-0">
                  {/* Compact rings on mobile so OVR/OFF/DEF fit inline beside
                      the identity instead of wrapping to their own row. */}
                  <div className="sm:hidden">
                    <StatRings items={ratingItems} ringColor={heroText} textColor={heroText} size="xs" />
                  </div>
                  <div className="hidden sm:block">
                    <StatRings items={ratingItems} ringColor={heroText} textColor={heroText} size="md" />
                  </div>
                  {!isViewOnly && (
                    <button
                      onClick={() => setShowTeamRatingsModal(true)}
                      className="p-1.5 sm:p-2 rounded-lg hover:bg-black/20 transition-colors"
                      style={{ color: heroText }}
                      title="Edit Team Ratings"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* Main Content Grid - Two columns on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Phase-Specific Tasks */}
        <div className="space-y-6 lg:flex lg:flex-col lg:h-full">
          {/* Phase-Specific Content */}
          {currentDynasty.currentPhase === 'preseason' ? (
        <div className="space-y-3">
          <h3 className="w-fit font-display font-black uppercase leading-none rounded-md px-3 py-2 mb-3 sm:mb-4" style={{ fontSize: 'clamp(1.0625rem, 1.6vw, 1.375rem)', letterSpacing: '0.04em', ...teamLabelStyle }}>
            Pre-Season Setup
          </h3>
          {(() => {
            // Pre-season tasks rendered using the SAME unified to-do row
            // pattern as the regular-season block (status dot, title,
            // optional subtitle, fixed-width Action column). Mirrors
            // what shipped for the regular-season dashboard so every
            // calendar phase reads the same — no more numbered ovals
            // and per-row card chrome that made preseason feel like a
            // different app.
            const todos = []

            const preseasonUserTid = getUserTeamTid(currentDynasty)
            const preseasonYear = Number(currentDynasty.currentYear)

            // Schedule
            const scheduledGameCount = (teamSchedule || []).filter(g =>
              !g.isBye && g.opponent?.toUpperCase() !== 'BYE'
            ).length
            todos.push({
              key: 'schedule',
              done: !!teamPreseasonSetup?.scheduleEntered,
              title: 'Enter Schedule',
              subtitle: `${scheduledGameCount}/12 games`,
              viewTo: teamPreseasonSetup?.scheduleEntered
                ? `${pathPrefix}/team/${preseasonUserTid}/${preseasonYear}?tab=schedule`
                : null,
              onAction: () => setShowScheduleModal(true),
              actionLabel: teamPreseasonSetup?.scheduleEntered ? 'Edit' : 'Enter',
            })

            // Roster (only first year on this team)
            if (isFirstYearOnTeam(currentDynasty)) {
              todos.push({
                key: 'roster',
                done: !!teamPreseasonSetup?.rosterEntered,
                title: 'Enter Roster',
                subtitle: `${teamRoster.length}/85 players`,
                viewTo: teamPreseasonSetup?.rosterEntered
                  ? `${pathPrefix}/team/${preseasonUserTid}/${preseasonYear}?tab=roster`
                  : null,
                onAction: () => setShowRosterModal(true),
                actionLabel: teamPreseasonSetup?.rosterEntered ? 'Edit' : 'Enter',
              })
            }

            // Team Ratings
            todos.push({
              key: 'team-ratings',
              done: !!teamPreseasonSetup?.teamRatingsEntered,
              title: 'Enter Team Ratings',
              subtitle: teamRatings?.overall
                ? `${teamRatings.overall} OVR ${teamRatings.offense} OFF ${teamRatings.defense} DEF`
                : 'Not entered',
              viewTo: teamPreseasonSetup?.teamRatingsEntered
                ? `${pathPrefix}/team/${preseasonUserTid}/${preseasonYear}`
                : null,
              onAction: () => setShowTeamRatingsModal(true),
              actionLabel: teamPreseasonSetup?.teamRatingsEntered ? 'Edit' : 'Add',
            })

            // Coordinators (HC, first year only)
            if (currentDynasty.coachPosition === 'HC' && isFirstYearOnTeam(currentDynasty)) {
              todos.push({
                key: 'coordinators',
                done: !!teamPreseasonSetup?.coachingStaffEntered,
                title: 'Enter Coordinators',
                subtitle: teamCoachingStaff?.ocName && teamCoachingStaff?.dcName
                  ? `OC: ${teamCoachingStaff.ocName} DC: ${teamCoachingStaff.dcName}`
                  : 'Not entered',
                onAction: () => setShowCoachingStaffModal(true),
                actionLabel: teamPreseasonSetup?.coachingStaffEntered ? 'Edit' : 'Add',
              })
            }

            // Recruiting commitments — same Yes / No-commits split as the
            // regular-season recruiting row.
            {
              const userTid = getUserTeamTid(currentDynasty)
              const recruitingCommits = getRecruitingCommitments(currentDynasty, userTid, currentDynasty.currentYear)
              const preseasonCommitments = recruitingCommits?.['preseason']
              const recruitingDone = preseasonCommitments !== undefined
              const cnt = preseasonCommitments?.length || 0
              const cs = calculateRecruitingClassScore(flattenClassCommitments(recruitingCommits))
              todos.push({
                key: 'preseason-recruiting',
                done: recruitingDone,
                title: 'Any commitments this week?',
                subtitle: recruitingDone
                  ? (cnt > 0
                      ? `${cnt} commit${cnt === 1 ? '' : 's'} recorded${cs > 0 ? ` ${currentDynasty.currentYear} class score: ${formatRecruitingClassScore(cs)}` : ''}`
                      : 'No commitments this week')
                  : 'Record any early recruiting commitments',
                viewTo: cs > 0 ? `${pathPrefix}/recruiting/${userTid}/${currentDynasty.currentYear}` : null,
                onAction: () => setShowRecruitingModal(true),
                actionLabel: recruitingDone ? 'Edit' : 'Yes',
                extraTools: recruitingExtraTools,
                inlineAction: !recruitingDone && !isViewOnly ? {
                  label: 'No commits',
                  onClick: handleNoCommitments,
                } : null,
              })
            }

            // Preseason Top 25
            {
              const yearNum = Number(currentDynasty.currentYear)
              const saved = currentDynasty.preseasonRankingsByYear?.[yearNum]
              const t25Done = Array.isArray(saved) && saved.length > 0
              todos.push({
                key: 'preseason-top25',
                done: t25Done,
                title: 'Enter Preseason Top 25',
                subtitle: t25Done
                  ? `${saved.length} team${saved.length === 1 ? '' : 's'} ranked`
                  : 'Saved per-year; powers the preseason recap',
                viewTo: t25Done ? `${pathPrefix}/rankings/${yearNum}?week=0` : null,
                onAction: () => setPreseasonTop25Year(yearNum),
                actionLabel: t25Done ? 'Edit' : 'Enter',
              })
            }

            // Preseason CFB Recap
            {
              const yearNum = Number(currentDynasty.currentYear)
              const recap = currentDynasty.weekRecapsByYear?.[yearNum]?.[-1]
              const recapDone = !!recap?.text
              todos.push({
                key: 'preseason-recap',
                done: recapDone,
                title: 'Generate Preseason CFB Recap',
                subtitle: recapDone
                  ? 'Saved — view it on the Weekly Recap page'
                  : 'AI-written season preview based on past dynasty data',
                viewTo: recapDone ? `${pathPrefix}/weekly-scores/${yearNum}/-1?tab=recap` : null,
                onAction: () => setRecapModalContext({ year: yearNum, week: -1 }),
                actionLabel: recapDone ? 'Edit' : 'Generate',
              })
            }

            return (
              <div className="media-card overflow-hidden">
                {todos.map((todo, idx) => (
                  <div
                    key={todo.key}
                    className="px-3 py-2.5 sm:px-5 sm:py-4 flex items-center gap-2 sm:gap-4"
                    style={idx > 0 ? { borderTop: '1px solid var(--surface-4)' } : undefined}
                  >
                    <div className="flex-1 min-w-0 flex items-center gap-2 sm:gap-3">
                      <span
                        aria-hidden="true"
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{
                          backgroundColor: todo.done
                            ? 'var(--accent-success)'
                            : 'var(--accent-error)',
                        }}
                      />
                      <div className="min-w-0">
                        <div
                          className="font-display font-bold leading-tight text-txt-primary break-words"
                          style={{ fontSize: 'clamp(0.875rem, 1.4vw, 1.0625rem)', letterSpacing: '-0.015em' }}
                        >
                          {todo.title}
                        </div>
                        {todo.subtitle && (
                          <div className="hidden sm:block text-xs sm:text-[13px] mt-0.5 text-txt-tertiary">
                            {todo.subtitle}
                          </div>
                        )}
                        {todo.inlineAction && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); todo.inlineAction.onClick() }}
                            className="mt-1 text-[11px] uppercase font-bold text-txt-tertiary hover:text-txt-secondary underline underline-offset-2 transition-colors"
                            style={{ letterSpacing: '1.2px' }}
                          >
                            {todo.inlineAction.label}
                          </button>
                        )}
                      </div>
                    </div>
                    {!isViewOnly && todo.actionLabel && (
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 [&_.btn-refined]:min-w-[4.5rem]">
                        {todo.extraTools}
                        {todo.viewTo && (
                          <Link to={todo.viewTo} className="btn-refined text-center">
                            View
                          </Link>
                        )}
                        <button
                          onClick={todo.onAction}
                          className="btn-refined btn-refined--solid text-center"
                        >
                          {todo.actionLabel}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          })()}

        </div>
      ) : currentDynasty.currentPhase === 'regular_season' ? (
        <div>
          <div className="space-y-3">
            {(() => {
              const scheduledGame = teamSchedule?.find(g => Number(g.week) === Number(currentDynasty.currentWeek))
              const gameRecord = findCurrentTeamGame(currentDynasty,
                g => Number(g.week) === Number(currentDynasty.currentWeek) && Number(g.year) === Number(currentDynasty.currentYear)
              )
              // Only consider a game "played" if it has actual scores
              const playedGame = isGameActuallyPlayed(gameRecord) ? gameRecord : null
              const mascotName = scheduledGame ? getMascotName(scheduledGame.opponent) : null
              const opponentName = mascotName || (scheduledGame ? getTeamNameFromAbbr(scheduledGame.opponent) : 'TBD')

              // Check if this week is a bye week (explicit BYE or empty/missing schedule entry)
              const isByeWeek = scheduledGame?.isBye ||
                scheduledGame?.opponent?.toUpperCase() === 'BYE' ||
                (scheduledGame && !scheduledGame.opponent) ||
                (!scheduledGame && teamSchedule?.length > 0) // Has schedule but no entry for this week = bye

              // Check for recruiting commitments this week - TID-BASED
              const commitmentKey = `regular_${currentDynasty.currentWeek}`
              const userTidForCommitments = getUserTeamTid(currentDynasty)
              const commitmentsForTeamYear = getRecruitingCommitments(currentDynasty, userTidForCommitments, currentDynasty.currentYear)
              const commitmentsForWeek = commitmentsForTeamYear[commitmentKey]
              const hasCommitmentsData = commitmentsForWeek !== undefined
              const commitmentsCount = commitmentsForWeek?.length || 0
              const classScore = calculateRecruitingClassScore(flattenClassCommitments(commitmentsForTeamYear))

              // Logo + mascot lookups for scorebug
              const userLogoUrl = getTeamLogo(userTeamName, currentDynasty?.teams || currentDynasty?.customTeams)
              const userAbbr = getCurrentTeamAbbr(currentDynasty) || ''
              const oppAbbr = scheduledGame?.opponent || ''
              const oppLogoUrl = mascotName
                ? getTeamLogo(mascotName, currentDynasty?.teams || currentDynasty?.customTeams)
                : null
              const gameLocation = scheduledGame?.location?.toLowerCase() || 'home'
              const isNeutral = gameLocation === 'neutral'
              const userIsAway = gameLocation === 'away'
              const atSymbol = isNeutral ? 'vs' : (userIsAway ? '@' : 'vs')
              const handleEnterGame = () => {
                if (gameRecord) {
                  navigate(`${pathPrefix}/game/${gameRecord.id}/edit`, { state: { from: location.pathname } })
                } else {
                  const opponentTid = scheduledGame?.opponent ? getTidFromAbbr(scheduledGame.opponent, currentDynasty) : null
                  const team1 = userTeamTid
                  const team2 = opponentTid
                  const params = new URLSearchParams({
                    week: currentDynasty.currentWeek?.toString() || '',
                    year: currentDynasty.currentYear?.toString() || '',
                    gameType: 'regular',
                    ...(team1 && { team1Tid: team1.toString() }),
                    ...(team2 && { team2Tid: team2.toString() }),
                    location: isNeutral ? 'neutral' : gameLocation
                  })
                  navigate(`${pathPrefix}/game/new?${params.toString()}`, { state: { from: location.pathname } })
                }
              }

              return (
                <>
                  {/* Matchup card removed — the unified to-do block below
                      now owns the game-entry presentation (status dot,
                      logo-vs-logo visual, and Enter/Edit action). On bye
                      weeks the to-do block adds an informational row
                      instead of dedicating a whole card to the message. */}

                  {/* Weekly to-do block — Recruiting + Last Week's Scores +
                      Week Recap unified into a single media-card with
                      hairline dividers between rows. Reads as one task list
                      rather than three disjoint cards stacked on top of
                      each other. Shares scope with the matchup IIFE so the
                      recruiting row reuses hasCommitmentsData / classScore /
                      etc. without re-deriving them. */}
                  {(() => {
                    const yearNum = Number(currentDynasty.currentYear)
                    const curWeek = Number(currentDynasty.currentWeek)
                    // Week 0 IS a real regular-season week — some teams play
                    // an early-September Week 0 opener in EA CFB. The previous
                    // hasCurWeek guard required curWeek >= 1, which silently
                    // suppressed the game-entry todo (and therefore the
                    // "Enter Game" button) for users with a Week 0 game on
                    // their schedule. Reported by Jay (2026-05-13): Week 0
                    // game against CU, no Enter Game button visible.
                    // Split into two guards: hasCurWeek includes Week 0
                    // (drives game-entry / bye / recruiting rows), hasPrevWeek
                    // keeps the >=1 requirement (drives "Last Week's Scores"
                    // which needs a real prior week to exist).
                    const hasCurWeek = Number.isFinite(curWeek) && curWeek >= 0
                    const hasPrevWeek = Number.isFinite(curWeek) && curWeek >= 1
                    const prevWeek = hasPrevWeek ? curWeek - 1 : null

                    const todos = []

              // Row 1: Game entry — the now-deleted matchup card's only
              // remaining presence. Title is a logo-vs-logo composition
              // (away team on the left, home team on the right per user
              // request) so the row still reads as the matchup at a
              // glance. For neutral-site games we default to user-on-
              // right since this is the user's dashboard.
              if (!isByeWeek && hasCurWeek && scheduledGame) {
                const gameDone = !!playedGame
                const userIsAway = gameLocation === 'away'
                const oppTid = scheduledGame?.opponent ? getTidFromAbbr(scheduledGame.opponent, currentDynasty) : null
                const leftLogo = userIsAway ? userLogoUrl : oppLogoUrl
                const rightLogo = userIsAway ? oppLogoUrl : userLogoUrl
                const leftAbbr = userIsAway ? userAbbr : oppAbbr
                const rightAbbr = userIsAway ? oppAbbr : userAbbr
                const leftTid = userIsAway ? userTeamTid : oppTid
                const rightTid = userIsAway ? oppTid : userTeamTid
                const centerLabel = isNeutral ? 'vs' : (userIsAway ? '@' : 'vs')
                // Each logo links to that team's page. The to-do row itself is a
                // div (not a link), so these inner links don't nest.
                const gameYear = currentDynasty.currentYear
                const renderLogo = (url, abbr, key, tid) => {
                  const inner = url
                    ? <img src={url} alt={abbr || ''} className="w-7 h-7 sm:w-8 sm:h-8 object-contain flex-shrink-0" />
                    : <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 border-dashed border-surface-4 flex items-center justify-center text-[9px] font-bold text-txt-secondary flex-shrink-0">{abbr ? abbr.charAt(0) : 'TBD'}</div>
                  return tid
                    ? <Link key={key} to={`${pathPrefix}/team/${tid}/${gameYear}`} title={abbr || ''} onClick={(e) => e.stopPropagation()} className="flex-shrink-0 hover:opacity-80 transition-opacity">{inner}</Link>
                    : <span key={key} className="flex-shrink-0">{inner}</span>
                }
                // Score + result subtitle removed per user request — the
                // logos + VS line tells the matchup, score belongs on the
                // game page, not the dashboard row.
                let gameSubtitle = null
                todos.push({
                  key: 'game-entry',
                  done: gameDone,
                  title: (
                    <div className="flex items-center gap-2 sm:gap-3">
                      {renderLogo(leftLogo, leftAbbr, 'L', leftTid)}
                      <span
                        className="text-[11px] sm:text-xs font-bold uppercase tabular-nums text-txt-tertiary"
                        style={{ letterSpacing: '1.5px' }}
                      >
                        {centerLabel}
                      </span>
                      {renderLogo(rightLogo, rightAbbr, 'R', rightTid)}
                    </div>
                  ),
                  subtitle: gameSubtitle,
                  viewTo: gameDone ? `${pathPrefix}/game/${playedGame.id}` : null,
                  onAction: handleEnterGame,
                  actionLabel: gameDone ? 'Edit' : 'Enter',
                })
              }
              // Bye weeks for the user's team are no longer surfaced as a
              // to-do row — if there's no game to enter, the list just
              // doesn't show one. (Removing the informational "Week N Bye"
              // row was a deliberate de-clutter; non-game weeks already
              // show plenty of context elsewhere on the dashboard.)

              // Row 2: Recruiting — owns the "this week's commits"
              // decision the user makes most often.
              {
                let title, subtitle
                if (hasCommitmentsData) {
                  title = commitmentsCount > 0
                    ? `${commitmentsCount} Commit${commitmentsCount === 1 ? '' : 's'} Logged`
                    : `Recruiting Week ${currentDynasty.currentWeek} Complete`
                  subtitle = classScore > 0
                    ? `${currentDynasty.currentYear} class score: ${formatRecruitingClassScore(classScore)}`
                    : `${currentDynasty.currentYear} class`
                } else if (classScore > 0) {
                  title = `${currentDynasty.currentYear} Class Score: ${formatRecruitingClassScore(classScore)}`
                  subtitle = hasCurWeek ? `Recruiting Week ${currentDynasty.currentWeek}` : `${currentDynasty.currentYear} class`
                } else {
                  title = hasCurWeek ? `Week ${currentDynasty.currentWeek} Commits` : 'Commits'
                  subtitle = null
                }
                todos.push({
                  key: 'recruiting',
                  done: hasCommitmentsData,
                  title,
                  subtitle,
                  viewTo: `${pathPrefix}/recruiting/${userTidForCommitments}/${currentDynasty.currentYear}`,
                  onAction: () => setShowRecruitingModal(true),
                  actionLabel: hasCommitmentsData ? 'Edit' : 'Log',
                  extraTools: recruitingExtraTools,
                  // "Mark None" gives the user a one-tap way to flip the
                  // dot green when there were genuinely no commits this
                  // week — the modal-driven Log path saves an empty
                  // array, which is the same end state, but this avoids
                  // a useless trip through the modal. Only offered when
                  // the row is still red (nothing logged yet).
                  inlineAction: !hasCommitmentsData && !isViewOnly ? {
                    label: 'No commits',
                    onClick: handleNoCommitments,
                  } : null,
                })
              }

              // Row 2: Last Week's Scores — needs a real previous week to
              // exist, so this gates on hasPrevWeek (curWeek >= 1). Week 0
              // has no Week -1 to "log scores for," so this row is skipped.
              if (hasPrevWeek) {
                const weeklyEntered = currentDynasty.weeklyScoresEntered?.[yearNum]?.[prevWeek]
                const savedCount = (currentDynasty.games || []).filter(g =>
                  g && Number(g.year) === yearNum && Number(g.week) === prevWeek
                  && g.gameType === 'regular' && g.source === 'weekly-scores'
                ).length
                const done = !!weeklyEntered || savedCount > 0
                todos.push({
                  key: 'weekly-scores',
                  done,
                  title: done
                    ? `${savedCount} Game${savedCount === 1 ? '' : 's'} Logged`
                    : `Enter Week ${prevWeek} Scores`,
                  subtitle: done
                    ? 'Across-the-country results saved'
                    : 'Log results to update records & rankings',
                  viewTo: `${pathPrefix}/weekly-scores/${yearNum}/${prevWeek}`,
                  onAction: () => setWeeklyScoresModalWeek(prevWeek),
                  actionLabel: done ? 'Edit' : 'Enter',
                })
              }

              // Row 3: Week Recap — for the previous week (the one just completed).
              // Only show when prevWeek is a valid number (not null, which happens at Week 0).
              if (hasPrevWeek) {
                const recap = currentDynasty.weekRecapsByYear?.[yearNum]?.[prevWeek]
                const done = !!recap?.text
                todos.push({
                  key: 'week-recap',
                  done,
                  title: done ? `Week ${prevWeek} Recap Saved` : `Generate Week ${prevWeek} Recap`,
                  subtitle: done
                    ? 'Narrative recap stored for this week'
                    : "Summarize the week's biggest results",
                  viewTo: `${pathPrefix}/weekly-scores/${yearNum}/${prevWeek}?tab=recap`,
                  onAction: () => setRecapModalContext({ year: yearNum, week: prevWeek }),
                  actionLabel: done ? 'Edit' : 'Generate',
                })
              }

              if (todos.length === 0) return null

              return (
                <div className="media-card overflow-hidden">
                  {todos.map((todo, idx) => (
                    <div
                      key={todo.key}
                      className="px-3 py-2.5 sm:px-5 sm:py-4 flex items-center gap-2 sm:gap-4"
                      style={idx > 0 ? { borderTop: '1px solid var(--surface-4)' } : undefined}
                    >
                      <div className="flex-1 min-w-0 flex items-center gap-2 sm:gap-3">
                        {/* Status dot — green when complete, red when
                            still pending. Always rendered so the rows
                            line up vertically and the user gets an
                            at-a-glance read on what's still owed. */}
                        <span
                          aria-hidden="true"
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor: todo.done
                              ? 'var(--accent-success)'
                              : 'var(--accent-error)',
                          }}
                        />
                        {todo.extraLeading}
                        <div className="min-w-0">
                          <div
                            className="font-display font-bold leading-tight text-txt-primary break-words"
                            style={{ fontSize: 'clamp(0.875rem, 1.4vw, 1.0625rem)', letterSpacing: '-0.015em' }}
                          >
                            {todo.title}
                          </div>
                          {todo.subtitle && (
                            <div className="hidden sm:block text-xs sm:text-[13px] mt-0.5 text-txt-tertiary">
                              {todo.subtitle}
                            </div>
                          )}
                          {todo.inlineAction && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); todo.inlineAction.onClick() }}
                              className="mt-1 text-[11px] uppercase font-bold text-txt-tertiary hover:text-txt-secondary underline underline-offset-2 transition-colors"
                              style={{ letterSpacing: '1.2px' }}
                            >
                              {todo.inlineAction.label}
                            </button>
                          )}
                        </div>
                      </div>
                      {!isViewOnly && todo.actionLabel && (
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 [&_.btn-refined]:min-w-[4.5rem]">
                          {todo.extraTools}
                          {todo.viewTo && (
                            <Link to={todo.viewTo} className="btn-refined text-center">
                              View
                            </Link>
                          )}
                          <button
                            onClick={todo.onAction}
                            className="btn-refined btn-refined--solid text-center"
                          >
                            {todo.actionLabel}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            })()}
                </>
              )
            })()}
          </div>
        </div>
      ) : currentDynasty.currentPhase === 'conference_championship' ? (
        <div className="space-y-3">
          <h3 className="w-fit font-display font-black uppercase leading-none rounded-md px-3 py-2 mb-3 sm:mb-4" style={{ fontSize: 'clamp(1.0625rem, 1.6vw, 1.375rem)', letterSpacing: '0.04em', ...teamLabelStyle }}>
            Conference Championship Week
          </h3>
          {(() => {
            // Conference Championship phase tasks rendered using the SAME
            // unified to-do row pattern as preseason / regular season.
            // Custom action shapes (Yes/No, opponent picker, fire-coord
            // dropdown) live in the `customActions` slot so the row
            // skeleton stays identical across phases.
            const ccGame = getCCGame()
            const ccQuestionDone = ccMadeChampionship !== null
            const showGameEntry = ccMadeChampionship === true
            const ccGameDone = !!ccGame
            const hasCoordinators = currentDynasty.coachPosition === 'HC' &&
              (teamCoachingStaff?.ocName || teamCoachingStaff?.dcName)
            const coordinatorTaskComplete = coordinatorToFire !== ''

            const todos = []

            // Task 1: Made conference championship?
            todos.push({
              key: 'cc-made',
              done: ccQuestionDone,
              title: `Made ${userTeamConference} Championship?`,
              subtitle: ccMadeChampionship === null
                ? 'Did you make the championship game?'
                : ccMadeChampionship === false
                  ? 'Did not make championship'
                  : 'Made the championship game',
              customActions: ccMadeChampionship === null && !isViewOnly ? (
                <div className="flex gap-1.5 sm:gap-2 flex-shrink-0 items-center [&_.btn-refined]:min-w-[4.5rem]">
                  <button
                    onClick={() => handleCCAnswer(false)}
                    className="btn-refined text-center"
                  >
                    No
                  </button>
                  <button
                    onClick={() => handleCCAnswer(true)}
                    className="btn-refined btn-refined--solid text-center"
                  >
                    Yes
                  </button>
                </div>
              ) : null,
              onAction: ccQuestionDone && !isViewOnly ? async () => {
                setCCMadeChampionship(null)
                setCCOpponent('')
                const year = currentDynasty.currentYear
                const existingByYear = currentDynasty.conferenceChampionshipDataByYear || {}
                const currentCCData = existingByYear[year] || {}
                await updateDynasty(currentDynasty.id, {
                  conferenceChampionshipDataByYear: {
                    ...existingByYear,
                    [year]: { ...currentCCData, madeChampionship: null, opponent: null }
                  }
                })
              } : null,
              actionLabel: ccQuestionDone ? 'Edit' : null,
            })

            // Task 2: Enter CC Game (only when madeChampionship = true)
            if (showGameEntry) {
              const oppInfo = ccGame
                ? getGameTeamInfo(currentDynasty?.teams || TEAMS, ccGame.perspective?.opponentTid)
                : null
              const oppName = oppInfo
                ? (getMascotName(oppInfo?.abbr) || oppInfo?.name || 'Unknown')
                : (ccOpponent ? (getMascotName(ccOpponent) || ccOpponent) : null)
              const ccSubtitle = ccGame
                ? `${ccGame.perspective?.userWon ? 'W' : 'L'} ${Math.max(ccGame.perspective?.userScore || 0, ccGame.perspective?.opponentScore || 0)}–${Math.min(ccGame.perspective?.userScore || 0, ccGame.perspective?.opponentScore || 0)} vs ${oppName}`
                : (ccOpponent ? `vs ${oppName}` : 'Select opponent and enter result')
              todos.push({
                key: 'cc-game',
                done: ccGameDone,
                title: `${userTeamConference} Championship`,
                subtitle: ccSubtitle,
                customActions: !ccOpponent && !ccGame && !isViewOnly ? (
                  <div className="flex-shrink-0 w-44 sm:w-48">
                    <SearchableSelect
                      options={teams}
                      value=""
                      onChange={(teamName) => {
                        const abbr = getAbbrFromTeamName(teamName, currentDynasty?.teams)
                        if (abbr) handleCCOpponentSelect(abbr)
                      }}
                      placeholder="Select opponent..."
                      teamColors={teamColors}
                      dynastyTeams={currentDynasty?.teams}
                    />
                  </div>
                ) : null,
                onAction: !isViewOnly && (ccOpponent || ccGame) ? () => {
                  if (ccGame) {
                    navigate(`${pathPrefix}/game/${ccGame.id}/edit`, { state: { from: location.pathname } })
                  } else {
                    // Resolve the opponent abbr → tid by walking
                    // dynasty.teams so a teambuilder team that
                    // overrode an FBS abbr wins over the static
                    // registry. getTidFromAbbr collapses to the
                    // static TEAMS map for unknown dynasties and
                    // silently misroutes to the wrong (real) team
                    // for that abbr — that's the bug we're avoiding.
                    const opponentTid = (() => {
                      const teamsMap = currentDynasty?.teams
                      if (!teamsMap || !ccOpponent) return null
                      const upper = ccOpponent.toUpperCase()
                      for (const [tid, team] of Object.entries(teamsMap)) {
                        if (team?.abbr?.toUpperCase() === upper) return Number(tid)
                      }
                      return null
                    })()
                    const params = new URLSearchParams({
                      week: 'CCG',
                      year: currentDynasty.currentYear?.toString() || '',
                      team1Tid: userTeamTid?.toString() || '',
                      team2Tid: opponentTid?.toString() || '',
                      gameType: 'conference_championship',
                      conference: userTeamConference || ''
                    })
                    navigate(`${pathPrefix}/game/new?${params.toString()}`, { state: { from: location.pathname } })
                  }
                } : null,
                actionLabel: (ccOpponent || ccGame) ? (ccGame ? 'Edit' : 'Enter') : null,
              })
            }

            // Task: Coordinator Changes (HC with coordinators)
            if (hasCoordinators) {
              const coordSubtitle = coordinatorTaskComplete
                ? (coordinatorToFire === 'none' ? 'Keeping both coordinators' :
                   coordinatorToFire === 'oc' ? `Firing ${teamCoachingStaff?.ocName} (OC)` :
                   coordinatorToFire === 'dc' ? `Firing ${teamCoachingStaff?.dcName} (DC)` :
                   coordinatorToFire === 'both' ? 'Firing both coordinators' : '')
                : 'Fire any coordinators?'
              todos.push({
                key: 'cc-coords',
                done: coordinatorTaskComplete,
                title: 'Coordinator Changes',
                subtitle: coordSubtitle,
                customActions: !isViewOnly ? (
                  <select
                    value={coordinatorToFire}
                    onChange={(e) => handleFiringSelection(e.target.value)}
                    className="btn-refined btn-refined--solid text-center cursor-pointer flex-shrink-0"
                    style={{ minWidth: '11.5rem' }}
                  >
                    <option value="">Select...</option>
                    <option value="none">Keep both</option>
                    {teamCoachingStaff?.ocName && (
                      <option value="oc">Fire {teamCoachingStaff.ocName} (OC)</option>
                    )}
                    {teamCoachingStaff?.dcName && (
                      <option value="dc">Fire {teamCoachingStaff.dcName} (DC)</option>
                    )}
                    {teamCoachingStaff?.ocName && teamCoachingStaff?.dcName && (
                      <option value="both">Fire Both</option>
                    )}
                  </select>
                ) : null,
              })
            }

            // Task: Recruiting Commitments
            {
              const commitmentKey = getCommitmentKey()
              const userTidForCommits = getUserTeamTid(currentDynasty)
              const ccCommitmentsForYear = getRecruitingCommitments(currentDynasty, userTidForCommits, currentDynasty.currentYear)
              const ccCommitments = ccCommitmentsForYear?.[commitmentKey]
              const recruitingDone = ccCommitments !== undefined
              const cnt = ccCommitments?.length || 0
              const cs = calculateRecruitingClassScore(flattenClassCommitments(ccCommitmentsForYear))
              todos.push({
                key: 'cc-recruiting',
                done: recruitingDone,
                title: 'Any commitments this week?',
                subtitle: recruitingDone
                  ? (cnt > 0
                      ? `${cnt} commit${cnt === 1 ? '' : 's'} recorded${cs > 0 ? ` ${currentDynasty.currentYear} class score: ${formatRecruitingClassScore(cs)}` : ''}`
                      : 'No commitments this week')
                  : 'Record any recruiting commitments',
                viewTo: cs > 0 ? `${pathPrefix}/recruiting/${userTidForCommits}/${currentDynasty.currentYear}` : null,
                onAction: () => setShowRecruitingModal(true),
                actionLabel: recruitingDone ? 'Edit' : 'Yes',
                extraTools: recruitingExtraTools,
                inlineAction: !recruitingDone && !isViewOnly ? {
                  label: 'No commits',
                  onClick: handleNoCommitments,
                } : null,
              })
            }

            // Task: Enter Week 14 Scores. CCG week always follows Week 14
            // (the last regular-season week), so the lookback target is
            // hard-coded to 14 — same pattern the regular-season block
            // uses for prev-week scores, just with a fixed week number
            // since CCG week itself is unnumbered.
            {
              const yearNum = Number(currentDynasty.currentYear)
              const prevWeek = 14
              const weeklyEntered = currentDynasty.weeklyScoresEntered?.[yearNum]?.[prevWeek]
              const savedCount = (currentDynasty.games || []).filter(g =>
                g && Number(g.year) === yearNum && Number(g.week) === prevWeek
                && g.gameType === 'regular' && g.source === 'weekly-scores'
              ).length
              const done = !!weeklyEntered || savedCount > 0
              todos.push({
                key: 'cc-week14-scores',
                done,
                title: done
                  ? `${savedCount} Week ${prevWeek} Game${savedCount === 1 ? '' : 's'} Logged`
                  : `Enter Week ${prevWeek} Scores`,
                subtitle: done
                  ? 'Across-the-country Week 14 results saved'
                  : 'Log results to update records & rankings',
                viewTo: `${pathPrefix}/weekly-scores/${yearNum}/${prevWeek}`,
                onAction: () => setWeeklyScoresModalWeek(prevWeek),
                actionLabel: done ? 'Edit' : 'Enter',
              })
            }

            // Task: Generate Week 14 Recap.
            {
              const yearNum = Number(currentDynasty.currentYear)
              const prevWeek = 14
              const recap = currentDynasty.weekRecapsByYear?.[yearNum]?.[prevWeek]
              const done = !!recap?.text
              todos.push({
                key: 'cc-week14-recap',
                done,
                title: done ? `Week ${prevWeek} Recap Saved` : `Generate Week ${prevWeek} Recap`,
                subtitle: done
                  ? 'Narrative recap stored for this week'
                  : 'Generate the AI recap of Week 14',
                viewTo: `${pathPrefix}/weekly-scores/${yearNum}/${prevWeek}?tab=recap`,
                onAction: () => setRecapModalContext({ year: yearNum, week: prevWeek }),
                actionLabel: done ? 'Edit' : 'Generate',
              })
            }

            return (
              <div className="media-card overflow-hidden">
                {todos.map((todo, idx) => (
                  <div
                    key={todo.key}
                    className="px-3 py-2.5 sm:px-5 sm:py-4 flex items-center gap-2 sm:gap-4"
                    style={idx > 0 ? { borderTop: '1px solid var(--surface-4)' } : undefined}
                  >
                    <div className="flex-1 min-w-0 flex items-center gap-2 sm:gap-3">
                      <span
                        aria-hidden="true"
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{
                          backgroundColor: todo.done
                            ? 'var(--accent-success)'
                            : 'var(--accent-error)',
                        }}
                      />
                      <div className="min-w-0">
                        <div
                          className="font-display font-bold leading-tight text-txt-primary break-words"
                          style={{ fontSize: 'clamp(0.875rem, 1.4vw, 1.0625rem)', letterSpacing: '-0.015em' }}
                        >
                          {todo.title}
                        </div>
                        {todo.subtitle && (
                          <div className="hidden sm:block text-xs sm:text-[13px] mt-0.5 text-txt-tertiary">
                            {todo.subtitle}
                          </div>
                        )}
                        {todo.inlineAction && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); todo.inlineAction.onClick() }}
                            className="mt-1 text-[11px] uppercase font-bold text-txt-tertiary hover:text-txt-secondary underline underline-offset-2 transition-colors"
                            style={{ letterSpacing: '1.2px' }}
                          >
                            {todo.inlineAction.label}
                          </button>
                        )}
                      </div>
                    </div>
                    {todo.customActions ?? (!isViewOnly && todo.actionLabel ? (
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 [&_.btn-refined]:min-w-[4.5rem]">
                        {todo.extraTools}
                        {todo.viewTo && (
                          <Link to={todo.viewTo} className="btn-refined text-center">
                            View
                          </Link>
                        )}
                        <button
                          onClick={todo.onAction}
                          className="btn-refined btn-refined--solid text-center"
                        >
                          {todo.actionLabel}
                        </button>
                      </div>
                    ) : null)}
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      ) : currentDynasty.currentPhase === 'postseason' ? (
        // Postseason / Bowl Weeks
        <div className="media-card overflow-hidden">
          <div className="px-4 pt-3 pb-4 sm:px-6 sm:pt-3 sm:pb-6">
          {(() => {
            const week = currentDynasty.currentWeek
            const currentYear = currentDynasty.currentYear
            // Read CC games from UNIFIED games[] array (preferred) with fallback to legacy storage
            const allGamesForCC = currentDynasty.games || []
            const ccGamesFromUnified = allGamesForCC.filter(g =>
              g && g.isConferenceChampionship && Number(g.year) === Number(currentYear)
            )
            const ccGamesFromLegacy = currentDynasty.conferenceChampionshipsByYear?.[currentYear] || []
            // Prefer unified storage, fallback to legacy
            const ccGames = ccGamesFromUnified.length > 0 ? ccGamesFromUnified : ccGamesFromLegacy
            const hasCCData = ccGames.length > 0
            // Count entered CC games (games with both scores)
            const ccGamesWithScores = ccGames.filter(g => {
              if (!g) return false
              // Check both formats: unified uses team1Score/team2Score, legacy might too
              const hasTeamScores = g.team1Score !== undefined && g.team1Score !== null && g.team2Score !== undefined && g.team2Score !== null
              // Also check teamScore/opponentScore format used in some game entries
              const hasGameScores = g.teamScore !== undefined && g.teamScore !== null && g.opponentScore !== undefined && g.opponentScore !== null
              return hasTeamScores || hasGameScores
            }).length
            // Read conference championship data from year-specific storage
            const ccData = currentDynasty.conferenceChampionshipDataByYear?.[currentYear] || {}
            // Always show /10 since unified games[] includes user's CC game too
            const totalCCGames = 10

            const hasCFPSeedsData = currentDynasty.cfpSeedsByYear?.[currentDynasty.currentYear]?.length > 0

            // UNIFIED STORAGE: Read from games[] array with fallback to legacy structures
            const allGames = currentDynasty.games || []
            const year = currentDynasty.currentYear

            // CFP First Round - check games[] then fallback to legacy cfpResultsByYear
            const cfpFirstRoundFromGames = allGames.filter(g => g && (g.isCFPFirstRound || g.gameType === GAME_TYPES.CFP_FIRST_ROUND) && Number(g.year) === Number(year))
            const cfpFirstRoundLegacy = currentDynasty.cfpResultsByYear?.[year]?.firstRound || []
            const hasCFPFirstRoundData = cfpFirstRoundFromGames.length > 0 || cfpFirstRoundLegacy.length > 0

            // Bowl Week 1 - check games[] then fallback to legacy bowlGamesByYear
            // Include bowl games missing bowlWeek if their name is classified as week1
            const bowlWeek1FromGames = allGames.filter(g => g && g.isBowlGame && Number(g.year) === Number(year) &&
              (g.bowlWeek === 'week1' || (!g.bowlWeek && isBowlInWeek1(g.bowlName || ''))))
            const bowlWeek1Legacy = currentDynasty.bowlGamesByYear?.[year]?.week1 || []
            const hasBowlWeek1Data = bowlWeek1FromGames.length > 0 || bowlWeek1Legacy.length > 0

            // Bowl Week 2 - check games[] then fallback to legacy bowlGamesByYear
            const bowlWeek2FromGames = allGames.filter(g => g && g.isBowlGame && g.bowlWeek === 'week2' && Number(g.year) === Number(year))
            const bowlWeek2Legacy = currentDynasty.bowlGamesByYear?.[year]?.week2 || []
            const hasBowlWeek2Data = bowlWeek2FromGames.length > 0 || bowlWeek2Legacy.length > 0

            // Count entered games for Week 1 (25 regular bowls + 4 CFP First Round = 29 total)
            // Use games[] as primary source, fallback to legacy for older data
            const bowlWeek1Games = bowlWeek1FromGames.length > 0 ? bowlWeek1FromGames : bowlWeek1Legacy
            const cfpFirstRoundGames = cfpFirstRoundFromGames.length > 0 ? cfpFirstRoundFromGames : cfpFirstRoundLegacy
            const enteredBowlWeek1 = bowlWeek1Games.filter(g => g && g.team1Score !== undefined && g.team1Score !== null && g.team2Score !== undefined && g.team2Score !== null).length
            const enteredCFPFirstRound = cfpFirstRoundGames.filter(g => g && g.team1Score !== undefined && g.team1Score !== null && g.team2Score !== undefined && g.team2Score !== null).length

            // Check if user's bowl game is entered but not counted in bowlWeek1Games
            // (User's game may not have bowlWeek:'week1' set if entered via game entry flow)
            const userBowlGameTemp = findCurrentTeamGame(currentDynasty, g => g.isBowlGame && isSameYear(g.year, currentDynasty.currentYear))
            const userBowlHasScores = userBowlGameTemp && userBowlGameTemp.team1Score !== undefined && userBowlGameTemp.team1Score !== null
            const userBowlIsInWeek1List = userBowlGameTemp && bowlWeek1Games.some(g => g.id === userBowlGameTemp.id)
            const userBowlBowlName = userBowlGameTemp?.bowlName || selectedBowl
            const userBowlIsWeek1Temp = !!userBowlBowlName && (userBowlGameTemp?.bowlWeek === 'week1' || isBowlInWeek1(userBowlBowlName))
            const userBowlWeek1NotCounted = userBowlHasScores && userBowlIsWeek1Temp && !userBowlIsInWeek1List

            // Similarly check for CFP First Round
            const userCFPR1GameTemp = findCurrentTeamGame(currentDynasty, g => (g.isCFPFirstRound || g.gameType === GAME_TYPES.CFP_FIRST_ROUND) && isSameYear(g.year, currentDynasty.currentYear))
            const userCFPR1HasScores = userCFPR1GameTemp && userCFPR1GameTemp.team1Score !== undefined && userCFPR1GameTemp.team1Score !== null
            const userCFPR1IsInList = userCFPR1GameTemp && cfpFirstRoundGames.some(g => g.id === userCFPR1GameTemp.id || (g.cfpSlot && g.cfpSlot === userCFPR1GameTemp.cfpSlot))
            const userCFPR1NotCounted = userCFPR1HasScores && !userCFPR1IsInList

            const totalEnteredWeek1 = enteredBowlWeek1 + enteredCFPFirstRound + (userBowlWeek1NotCounted ? 1 : 0) + (userCFPR1NotCounted ? 1 : 0)

            // CFP Quarterfinals - check games[] then fallback to legacy
            const cfpQuarterfinalsFromGames = allGames.filter(g => g && (g.isCFPQuarterfinal || g.gameType === GAME_TYPES.CFP_QUARTERFINAL) && Number(g.year) === Number(year))
            const cfpQuarterfinalsLegacy = currentDynasty.cfpResultsByYear?.[year]?.quarterfinals || []

            // Count entered games for Week 2 (8 regular bowls + 4 CFP Quarterfinals = 12 total)
            const bowlWeek2Games = bowlWeek2FromGames.length > 0 ? bowlWeek2FromGames : bowlWeek2Legacy
            const cfpQuarterfinalGames = cfpQuarterfinalsFromGames.length > 0 ? cfpQuarterfinalsFromGames : cfpQuarterfinalsLegacy
            const enteredBowlWeek2 = bowlWeek2Games.filter(g => g && g.team1Score !== undefined && g.team1Score !== null && g.team2Score !== undefined && g.team2Score !== null).length
            const enteredCFPQuarterfinals = cfpQuarterfinalGames.filter(g => g && g.team1Score !== undefined && g.team1Score !== null && g.team2Score !== undefined && g.team2Score !== null).length

            // Check if user's Week 2 bowl/CFP QF is entered but not counted
            const userBowlIsWeek2Temp = !!userBowlBowlName && (userBowlGameTemp?.bowlWeek === 'week2' || isBowlInWeek2(userBowlBowlName))
            const userBowlWeek2NotCounted = userBowlHasScores && userBowlIsWeek2Temp && !bowlWeek2Games.some(g => g.id === userBowlGameTemp?.id)
            const userCFPQFGameTemp = findCurrentTeamGame(currentDynasty, g => (g.isCFPQuarterfinal || g.gameType === GAME_TYPES.CFP_QUARTERFINAL) && isSameYear(g.year, currentDynasty.currentYear))
            const userCFPQFHasScores = userCFPQFGameTemp && userCFPQFGameTemp.team1Score !== undefined && userCFPQFGameTemp.team1Score !== null
            const userCFPQFIsInList = userCFPQFGameTemp && cfpQuarterfinalGames.some(g => g.id === userCFPQFGameTemp.id || (g.cfpSlot && g.cfpSlot === userCFPQFGameTemp.cfpSlot))
            const userCFPQFNotCounted = userCFPQFHasScores && !userCFPQFIsInList

            const totalEnteredWeek2 = enteredBowlWeek2 + enteredCFPQuarterfinals + (userBowlWeek2NotCounted ? 1 : 0) + (userCFPQFNotCounted ? 1 : 0)
            const userBowlGame = findCurrentTeamGame(currentDynasty, g => g.isBowlGame && isSameYear(g.year, currentDynasty.currentYear))
            const userCFPFirstRoundGame = findCurrentTeamGame(currentDynasty, g => (g.isCFPFirstRound || g.gameType === GAME_TYPES.CFP_FIRST_ROUND) && isSameYear(g.year, currentDynasty.currentYear))
            const userCFPFirstRoundShell = findUserCFPGameShell(currentDynasty, 'first_round', currentDynasty.currentYear)
            // Hoisted from their original position further down in this IIFE
            // (was ~line 4254) so the Has*/ScoresEntered booleans below can
            // reference them without hitting a temporal-dead-zone error.
            const userCFPQuarterfinalGame = findCurrentTeamGame(currentDynasty, g => (g.isCFPQuarterfinal || g.gameType === GAME_TYPES.CFP_QUARTERFINAL) && isSameYear(g.year, currentDynasty.currentYear))
            const userCFPQuarterfinalShell = findUserCFPGameShell(currentDynasty, 'quarterfinal', currentDynasty.currentYear)
            // CFP seed entry creates a SHELL for each CFP game with both
            // scores set to null. So `userCFPFirstRoundGame` is truthy as
            // soon as the user enters their seed, before they've actually
            // played the game. Same trap for `userBowlGame` if a shell got
            // created upstream. Using the shell's existence as the "this
            // task is done" signal made the dashboard tile flip to a green
            // ✓ "Edit" state the moment seeds were entered — Jay saw that
            // and assumed the entry was done, so the "Enter your CFP game"
            // to-do never read as actionable. Switch the completion check
            // to whether SCORES are actually populated.
            const hasGameScores = (g) => !!g && g.team1Score != null && g.team2Score != null
            const userCFPFirstRoundScoresEntered = hasGameScores(userCFPFirstRoundGame)
            const userBowlGameScoresEntered = hasGameScores(userBowlGame)
            const userCFPQuarterfinalScoresEntered = hasGameScores(userCFPQuarterfinalGame)

            // Single source of truth for each game-entry to-do tile:
            // does the user have a game shell of this type in games[]?
            // No seed math, no wizard-state flags, no bowl-eligibility
            // gates. CFP shells get auto-created when seeds are entered;
            // bowl shells get auto-created when the bowl wizard completes
            // (see the createOrUpdateBowlGameShell call above + the
            // legacy back-fill useEffect). After that, "user has a CFP
            // first round game" is one games[] lookup.
            //
            // The tile stays visible AFTER scores are entered (shows as
            // green ✓ "Edit" via the *ScoresEntered booleans) so the user
            // can still re-edit. The shell-existence check is the gate;
            // the scores check is the completion styling.
            const userHasCFPFirstRoundGame = !!userCFPFirstRoundGame
            const userHasCFPQuarterfinalGame = !!userCFPQuarterfinalGame
            // Derive bowl week from the shell's bowlWeek field, falling back
            // to the bowl name lookup (handles shells missing bowlWeek), and
            // further falling back to the wizard's selectedBowl state for the
            // case where the shell hasn't been created yet (e.g. opponentTid
            // lookup failed or migration hasn't run yet this session).
            const userHasBowlWeek1Game = !!userBowlGame && (userBowlGame.bowlWeek === 'week1' || isBowlInWeek1(userBowlGame.bowlName || ''))
            const userHasBowlWeek2Game = !!userBowlGame && (userBowlGame.bowlWeek === 'week2' || isBowlInWeek2(userBowlGame.bowlName || ''))
            // SF + NC equivalents defined later in this IIFE, after the
            // SF/NC game variables are introduced (~line 4326, ~4413).

            // Check if user's team is in the CFP - prefer tid lookup
            const userTeamAbbr = getCurrentTeamAbbr(currentDynasty)
            const cfpSeeds = currentDynasty.cfpSeedsByYear?.[currentDynasty.currentYear] || []
            // Tid match with Number coercion (some legacy entries store tid
            // as a string), then fall back to abbr for entries written under
            // the older schema that didn't carry a tid. Without this fallback
            // a user whose seed was saved as `{seed, team}` instead of
            // `{seed, tid}` would never resolve here — the Enter CFP First
            // Round tile would silently not render even though they ARE in
            // the bracket. Reported by Jay (2026-05-11): "in bowl week 1,
            // first round of CFP, but no 'enter game' button."
            const userCFPSeed = cfpSeeds.find(s => {
              if (!s) return false
              if (s.tid != null && userTeamTid != null && Number(s.tid) === Number(userTeamTid)) return true
              if (s.team && userTeamAbbr && String(s.team).toUpperCase() === String(userTeamAbbr).toUpperCase()) return true
              return false
            })?.seed || null

            // Calculate CFP first round opponent (5v12, 6v11, 7v10, 8v9) - returns tid
            const getCFPFirstRoundOpponent = (seed) => {
              if (!seed || seed < 5 || seed > 12) return null
              const opponentSeed = 17 - seed // 5->12, 6->11, 7->10, 8->9
              const opponentEntry = cfpSeeds.find(s => s.seed === opponentSeed)
              // Return tid if available, otherwise abbr for backward compatibility
              return opponentEntry?.tid || opponentEntry?.team || null
            }

            const userCFPOpponent = getCFPFirstRoundOpponent(userCFPSeed)
            const userHasCFPBye = userCFPSeed && userCFPSeed <= 4
            const userInCFPFirstRound = userCFPSeed && userCFPSeed >= 5 && userCFPSeed <= 12

            // CFP Quarterfinals — game + shell hoisted above. Just the
            // legacy results list here for QF opponent calculation below.
            const firstRoundResults = currentDynasty.cfpResultsByYear?.[currentDynasty.currentYear]?.firstRound || []

            // User is in QF if they have a bye (seed 1-4) OR won their First Round game (seed 5-12)
            // Uses unified format: check perspective for win
            const userWonFirstRound = userCFPFirstRoundGame?.perspective?.userWon
            const userInCFPQuarterfinal = userHasCFPBye || (userInCFPFirstRound && userWonFirstRound)

            // Get QF opponent - prioritize shell's team2Tid, fallback to legacy lookup
            const getCFPQuarterfinalOpponent = () => {
              if (!userInCFPQuarterfinal) return null

              // First check if the QF shell has the opponent tid set
              const qfShell = userCFPQuarterfinalShell || userCFPQuarterfinalGame
              if (qfShell) {
                // Get opponent tid from shell (user could be team1 or team2)
                const userTid = currentDynasty.currentTid
                const opponentTid = qfShell.team1Tid === userTid ? qfShell.team2Tid : qfShell.team1Tid
                if (opponentTid) return opponentTid // Return tid directly
              }

              // Fallback: calculate from bracket matchups (legacy)
              const qfMatchups = {
                1: { opponentSeeds: [8, 9] },
                2: { opponentSeeds: [7, 10] },
                3: { opponentSeeds: [6, 11] },
                4: { opponentSeeds: [5, 12] },
                5: { hostSeed: 4 }, 12: { hostSeed: 4 },
                6: { hostSeed: 3 }, 11: { hostSeed: 3 },
                7: { hostSeed: 2 }, 10: { hostSeed: 2 },
                8: { hostSeed: 1 }, 9: { hostSeed: 1 }
              }

              if (userHasCFPBye) {
                const matchup = qfMatchups[userCFPSeed]
                const [seedA, seedB] = matchup.opponentSeeds
                const firstRoundGame = firstRoundResults.find(g =>
                  (g.seed1 === seedA && g.seed2 === seedB) || (g.seed1 === seedB && g.seed2 === seedA)
                )
                // Return winnerTid if available, otherwise winner abbr
                return firstRoundGame?.winnerTid || firstRoundGame?.winner || null
              } else if (userWonFirstRound) {
                const hostSeed = qfMatchups[userCFPSeed]?.hostSeed
                const hostEntry = hostSeed ? cfpSeeds.find(s => s.seed === hostSeed) : null
                // Return tid if available, otherwise abbr
                return hostEntry?.tid || hostEntry?.team || null
              }
              return null
            }

            const userQFOpponent = getCFPQuarterfinalOpponent()

            // Get the bowl name for user's QF game (from shell first, fallback to config-based lookup)
            const getUserQFBowlName = () => {
              if (!userInCFPQuarterfinal) return null

              // First priority: get bowl name from the game shell
              const qfShell = userCFPQuarterfinalShell || userCFPQuarterfinalGame
              if (qfShell?.bowlName) return qfShell.bowlName

              // Fallback: use hardcoded defaults (for backward compatibility with old data)
              const bowlBySeed = {
                1: 'Sugar Bowl', 8: 'Sugar Bowl', 9: 'Sugar Bowl',
                2: 'Cotton Bowl', 7: 'Cotton Bowl', 10: 'Cotton Bowl',
                3: 'Rose Bowl', 6: 'Rose Bowl', 11: 'Rose Bowl',
                4: 'Orange Bowl', 5: 'Orange Bowl', 12: 'Orange Bowl'
              }
              return bowlBySeed[userCFPSeed] || null
            }

            const userQFBowlName = getUserQFBowlName()

            // CFP Semifinals tracking
            const userCFPSemifinalGame = findCurrentTeamGame(currentDynasty, g => g.isCFPSemifinal && isSameYear(g.year, currentDynasty.currentYear))
            const userCFPSemifinalShell = findUserCFPGameShell(currentDynasty, 'semifinal', currentDynasty.currentYear)
            // Game-entry gate counterpart to userHasCFPFirstRoundGame etc.
            // — single rule: does the user have a SF game shell in games[]?
            const userHasCFPSemifinalGame = !!userCFPSemifinalGame
            // Uses unified format: check perspective for win
            const userWonQuarterfinal = userCFPQuarterfinalGame?.perspective?.userWon
            const userInCFPSemifinal = userInCFPQuarterfinal && userWonQuarterfinal

            // Get quarterfinal results to calculate SF opponent
            const quarterfinalResults = currentDynasty.cfpResultsByYear?.[currentDynasty.currentYear]?.quarterfinals || []

            // Calculate SF opponent - prioritize shell's team2Tid, fallback to legacy lookup
            // Peach Bowl: Orange Bowl winner (1/8/9) vs Sugar Bowl winner (4/5/12)
            // Fiesta Bowl: Cotton Bowl winner (2/7/10) vs Rose Bowl winner (3/6/11)
            const getCFPSemifinalOpponent = () => {
              if (!userInCFPSemifinal) return null

              // First check if the SF shell has the opponent tid set
              const sfShell = userCFPSemifinalShell || userCFPSemifinalGame
              if (sfShell) {
                // Get opponent tid from shell (user could be team1 or team2)
                const userTid = currentDynasty.currentTid
                const opponentTid = sfShell.team1Tid === userTid ? sfShell.team2Tid : sfShell.team1Tid
                if (opponentTid) return opponentTid // Return tid directly
              }

              // Fallback: calculate from bracket matchups (legacy)
              // Determine which SF the user is in based on their seed
              // Seeds 1,8,9 play in Orange Bowl -> Peach Bowl SF
              // Seeds 4,5,12 play in Sugar Bowl -> Peach Bowl SF
              // Seeds 2,7,10 play in Cotton Bowl -> Fiesta Bowl SF
              // Seeds 3,6,11 play in Rose Bowl -> Fiesta Bowl SF
              const peachBowlSeeds = [1, 8, 9, 4, 5, 12]

              const userInPeachBowl = peachBowlSeeds.includes(userCFPSeed)

              if (userInPeachBowl) {
                // User's opponent is the winner from the other QF in Peach Bowl
                // If user was in Orange (1/8/9), opponent is Sugar winner (4/5/12)
                // If user was in Sugar (4/5/12), opponent is Orange winner (1/8/9)
                const orangeSeeds = [1, 8, 9]
                const sugarSeeds = [4, 5, 12]
                const opponentBowlSeeds = orangeSeeds.includes(userCFPSeed) ? sugarSeeds : orangeSeeds
                const opponentQFGame = quarterfinalResults.find(g => {
                  // Check tid first, then fallback to abbr
                  const team1Seed = cfpSeeds.find(s => s.tid === g.team1Tid)?.seed
                  const team2Seed = cfpSeeds.find(s => s.tid === g.team2Tid)?.seed
                  return opponentBowlSeeds.includes(team1Seed) || opponentBowlSeeds.includes(team2Seed)
                })
                // Return winnerTid if available, otherwise fall back to winner abbr
                return opponentQFGame?.winnerTid || opponentQFGame?.winner || null
              } else {
                // User's opponent is the winner from the other QF in Fiesta Bowl
                // If user was in Cotton (2/7/10), opponent is Rose winner (3/6/11)
                // If user was in Rose (3/6/11), opponent is Cotton winner (2/7/10)
                const cottonSeeds = [2, 7, 10]
                const roseSeeds = [3, 6, 11]
                const opponentBowlSeeds = cottonSeeds.includes(userCFPSeed) ? roseSeeds : cottonSeeds
                const opponentQFGame = quarterfinalResults.find(g => {
                  // Check tid first, then fallback to abbr
                  const team1Seed = cfpSeeds.find(s => s.tid === g.team1Tid)?.seed
                  const team2Seed = cfpSeeds.find(s => s.tid === g.team2Tid)?.seed
                  return opponentBowlSeeds.includes(team1Seed) || opponentBowlSeeds.includes(team2Seed)
                })
                // Return winnerTid if available, otherwise fall back to winner abbr
                return opponentQFGame?.winnerTid || opponentQFGame?.winner || null
              }
            }

            const userSFOpponent = getCFPSemifinalOpponent()

            // Get the bowl name for user's SF game (from shell first, fallback to bracket-based lookup)
            const getUserSFBowlName = () => {
              if (!userInCFPSemifinal) return null

              // First priority: get bowl name from the game shell
              const sfShell = userCFPSemifinalShell || userCFPSemifinalGame
              if (sfShell?.bowlName) return sfShell.bowlName

              // Fallback: use hardcoded defaults based on bracket structure
              // Seeds 1,8,9,4,5,12 feed into SF1 (default: Peach Bowl)
              // Seeds 2,7,10,3,6,11 feed into SF2 (default: Fiesta Bowl)
              const sf1Seeds = [1, 8, 9, 4, 5, 12]
              return sf1Seeds.includes(userCFPSeed) ? 'Peach Bowl' : 'Fiesta Bowl'
            }

            const userSFBowlName = getUserSFBowlName()

            // CFP Championship tracking
            const userCFPChampionshipGame = findCurrentTeamGame(currentDynasty, g => g.isCFPChampionship && isSameYear(g.year, currentDynasty.currentYear))
            const userCFPChampionshipShell = findUserCFPGameShell(currentDynasty, 'championship', currentDynasty.currentYear)
            // Game-entry gate counterpart — single rule, same shape as the
            // other Has* booleans.
            const userHasCFPChampionshipGame = !!userCFPChampionshipGame
            // Uses unified format: check perspective for win
            const userWonSemifinal = userCFPSemifinalGame?.perspective?.userWon
            const userInCFPChampionship = userInCFPSemifinal && userWonSemifinal

            // Get semifinal results to calculate Championship opponent
            // Use unified games[] array (source of truth) with fallback to legacy cfpResultsByYear
            const unifiedSemifinalResults = getGamesByType(currentDynasty, GAME_TYPES.CFP_SEMIFINAL, currentDynasty.currentYear)
            const legacySemifinalResults = currentDynasty.cfpResultsByYear?.[currentDynasty.currentYear]?.semifinals || []
            const semifinalResults = unifiedSemifinalResults.length > 0 ? unifiedSemifinalResults : legacySemifinalResults

            // Calculate Championship opponent - prioritize shell's team2Tid, fallback to legacy lookup
            const getCFPChampionshipOpponent = () => {
              if (!userInCFPChampionship) return null

              // First check if the NC shell has the opponent tid set
              const ncShell = userCFPChampionshipShell || userCFPChampionshipGame
              if (ncShell) {
                // Get opponent tid from shell (user could be team1 or team2)
                const userTid = currentDynasty.currentTid
                const opponentTid = ncShell.team1Tid === userTid ? ncShell.team2Tid : ncShell.team1Tid
                if (opponentTid) return opponentTid // Return tid directly
              }

              // Fallback: calculate from SF results (legacy)
              // User's opponent is the winner of the other semifinal
              const peachBowlSeeds = [1, 8, 9, 4, 5, 12]
              const userInPeachBowl = peachBowlSeeds.includes(userCFPSeed)

              // Find the SF game the user was NOT in
              const opponentSF = semifinalResults.find(g => {
                // Check tid first, then fallback to abbr
                const team1Seed = cfpSeeds.find(s => s.tid === g.team1Tid)?.seed
                const team2Seed = cfpSeeds.find(s => s.tid === g.team2Tid)?.seed
                const gameInPeachBowl = peachBowlSeeds.includes(team1Seed) || peachBowlSeeds.includes(team2Seed)
                // If user was in Peach, opponent is from Fiesta (not in Peach)
                return userInPeachBowl ? !gameInPeachBowl : gameInPeachBowl
              })
              // Return winnerTid if available, otherwise fall back to winner abbr
              return opponentSF?.winnerTid || opponentSF?.winner || null
            }

            const userChampOpponent = getCFPChampionshipOpponent()

            // Week 1: CC + CFP seeds + bowl/CFP status (wizard) + user's bowl/CFP
            // game + new-job wizard + recruiting. Unified with the in-season todo
            // design via renderTodoList. Multi-step wizards (Bowl Status, Taking a
            // New Job) appear as rows in the list with their interactive UI rendered
            // as separate panels below when mid-flow — same shape as Bowl Week 2.
            if (week === 1) {
              const bw1Todos = []

              bw1Todos.push({
                key: 'cc-results',
                done: hasCCData,
                title: 'Conference Championship Results',
                subtitle: ccGamesWithScores === totalCCGames
                  ? `All ${totalCCGames} games entered`
                  : `${ccGamesWithScores}/${totalCCGames} games entered`,
                onAction: () => setShowCCModal(true),
                actionLabel: hasCCData ? 'Edit' : 'Enter',
              })

              bw1Todos.push({
                key: 'cfp-seeds',
                done: hasCFPSeedsData,
                title: 'CFP Seeds (1-12)',
                subtitle: hasCFPSeedsData ? 'Seeds entered' : '12 playoff teams',
                onAction: () => setShowCFPSeedsModal(true),
                actionLabel: hasCFPSeedsData ? 'Edit' : 'Enter',
              })


              if (userHasCFPFirstRoundGame) {
                bw1Todos.push({
                  key: 'cfp-fr-game',
                  done: userCFPFirstRoundScoresEntered,
                  title: 'Enter Your CFP First Round Game',
                  subtitle: userCFPFirstRoundScoresEntered
                    ? `${userCFPFirstRoundGame.perspective?.userWon ? 'Won' : 'Lost'} ${Math.max(userCFPFirstRoundGame.perspective?.userScore || 0, userCFPFirstRoundGame.perspective?.opponentScore || 0)}-${Math.min(userCFPFirstRoundGame.perspective?.userScore || 0, userCFPFirstRoundGame.perspective?.opponentScore || 0)}`
                    : `#${userCFPSeed} vs #${17 - userCFPSeed} ${getMascotName(userCFPOpponent)}`,
                  onAction: () => {
                    const gameToEdit = userCFPFirstRoundGame || userCFPFirstRoundShell
                    if (gameToEdit) {
                      navigate(`${pathPrefix}/game/${gameToEdit.id}/edit`, { state: { from: location.pathname } })
                    } else {
                      const opponentTid = typeof userCFPOpponent === 'number' ? userCFPOpponent : getTidFromAbbr(userCFPOpponent, currentDynasty)
                      const params = new URLSearchParams({
                        week: 'CFP First Round',
                        year: currentDynasty.currentYear?.toString() || '',
                        team1Tid: userTeamTid?.toString() || '',
                        team2Tid: opponentTid?.toString() || '',
                        gameType: 'cfp_first_round',
                      })
                      navigate(`${pathPrefix}/game/new?${params.toString()}`, { state: { from: location.pathname } })
                    }
                  },
                  actionLabel: userCFPFirstRoundScoresEntered ? 'Edit' : 'Enter',
                })
              }

              if (userHasBowlWeek1Game) {
                const bw1BowlOpponentTid = Number(userBowlGame.team1Tid) === Number(userTeamTid)
                  ? userBowlGame.team2Tid
                  : userBowlGame.team1Tid
                bw1Todos.push({
                  key: 'bowl-week1-game',
                  done: userBowlGameScoresEntered,
                  title: `Enter Your ${userBowlGame.bowlName || 'Bowl Game'} Game`,
                  subtitle: userBowlGameScoresEntered
                    ? `${userBowlGame.perspective?.userWon ? 'Won' : 'Lost'} ${Math.max(userBowlGame.perspective?.userScore || 0, userBowlGame.perspective?.opponentScore || 0)}-${Math.min(userBowlGame.perspective?.userScore || 0, userBowlGame.perspective?.opponentScore || 0)}`
                    : `vs ${getMascotName(bw1BowlOpponentTid, currentDynasty.teams)}`,
                  onAction: () => {
                    navigate(`${pathPrefix}/game/${userBowlGame.id}/edit`, { state: { from: location.pathname } })
                  },
                  actionLabel: userBowlGameScoresEntered ? 'Edit' : 'Enter',
                })
              }

              // Bye weeks (no CFP First Round game AND no Bowl Week 1
              // game for the user's team) are no longer surfaced as a
              // to-do row — see the regular-season note above for the
              // same de-cluttering rationale.

              const newJobDone = takingNewJob !== null && (takingNewJob === false || (newJobTeam && newJobPosition))
              const askingNewJobBW1 = takingNewJob === null
              bw1Todos.push({
                key: 'new-job-bw1',
                done: newJobDone,
                title: 'Taking a New Job? (Bowl Week 1)',
                subtitle: newJobDone
                  ? takingNewJob === true
                    ? `${newJobPosition} at ${getTeamNameFromAbbr(newJobTeam)}`
                    : 'Staying with current team'
                  : 'Yes or no?',
                onAction: askingNewJobBW1 ? async () => {
                  setTakingNewJob(true)
                  await updateDynasty(currentDynasty.id, {
                    newJobData: { takingNewJob: true, team: '', position: '' },
                  })
                } : newJobDone ? async () => {
                  setTakingNewJob(null)
                  setNewJobTeam('')
                  setNewJobPosition('')
                  const updatedTeams = clearPendingUserTeam(currentDynasty.teams)
                  await updateDynasty(currentDynasty.id, {
                    newJobData: null,
                    teams: updatedTeams,
                  })
                } : undefined,
                actionLabel: askingNewJobBW1 ? 'Yes' : newJobDone ? 'Edit' : undefined,
                extraTools: askingNewJobBW1 ? (
                  <button
                    onClick={async () => {
                      setTakingNewJob(false)
                      await updateDynasty(currentDynasty.id, {
                        newJobData: { takingNewJob: false, team: null, position: null, declinedInWeek: currentDynasty.currentWeek },
                      })
                    }}
                    className="btn-refined text-center"
                  >
                    No
                  </button>
                ) : null,
              })

              const bw1CommitmentKey = getCommitmentKey()
              const bw1UserTidForCommits = getUserTeamTid(currentDynasty)
              const bw1CommitmentsForYear = getRecruitingCommitments(currentDynasty, bw1UserTidForCommits, currentDynasty.currentYear)
              const bw1WeekCommitments = bw1CommitmentsForYear?.[bw1CommitmentKey]
              const bw1HasCommitmentsData = bw1WeekCommitments !== undefined
              const bw1CommitmentsCount = bw1WeekCommitments?.length || 0
              const bw1ClassScore = calculateRecruitingClassScore(flattenClassCommitments(bw1CommitmentsForYear))

              bw1Todos.push({
                key: 'recruiting-bw1',
                done: bw1HasCommitmentsData,
                title: bw1HasCommitmentsData ? 'Recruiting Commitments' : 'Any commitments this week?',
                subtitle: bw1HasCommitmentsData
                  ? bw1CommitmentsCount > 0
                    ? `${bw1CommitmentsCount} commitment${bw1CommitmentsCount !== 1 ? 's' : ''} recorded`
                    : 'No commitments this week'
                  : 'Record any recruiting commitments',
                onAction: () => setShowRecruitingModal(true),
                actionLabel: bw1HasCommitmentsData ? 'Edit' : 'Yes',
                extraTools: recruitingExtraTools,
                inlineAction: !bw1HasCommitmentsData && !isViewOnly ? {
                  label: 'No commits',
                  onClick: handleNoCommitments,
                } : bw1HasCommitmentsData && bw1ClassScore > 0 ? {
                  label: `Class Score ${formatRecruitingClassScore(bw1ClassScore)}`,
                  onClick: () => navigate(`${pathPrefix}/recruiting/${bw1UserTidForCommits}/${currentDynasty.currentYear}`),
                } : null,
              })

              return (
                <>
                  <h3 className="w-fit font-display font-black uppercase leading-none rounded-md px-3 py-2 mb-3 sm:mb-4" style={{ fontSize: 'clamp(1.0625rem, 1.6vw, 1.375rem)', letterSpacing: '0.04em', ...teamLabelStyle }}>
                    Bowl Week 1
                  </h3>
                  {renderTodoList({ todos: bw1Todos, isViewOnly })}

                  {/* Taking a New Job wizard panels — initial Yes/No now
                      lives inline on the new-job-bw1 row; follow-up team /
                      position pickers still render below. */}
                  {takingNewJob === true && !newJobTeam && (
                    <div className="media-card mt-3 px-3 py-3 sm:px-5 sm:py-4">
                      <p className="mb-2 text-xs sm:text-sm text-txt-secondary">Which team?</p>
                      <div className="max-w-xs">
                        <SearchableSelect
                          options={teams}
                          value={newJobTeam}
                          onChange={async (value) => {
                            setNewJobTeam(value)
                            await updateDynasty(currentDynasty.id, {
                              newJobData: { ...currentDynasty.newJobData, takingNewJob: true, team: value },
                            })
                          }}
                          placeholder="Search for team..."
                          teamColors={teamColors}
                          dynastyTeams={currentDynasty?.teams}
                        />
                      </div>
                    </div>
                  )}
                  {takingNewJob === true && newJobTeam && !newJobPosition && (
                    <div className="media-card mt-3 px-3 py-3 sm:px-5 sm:py-4">
                      <p className="mb-2 text-xs sm:text-sm text-txt-secondary">
                        New team: <strong className="text-txt-primary">{getTeamNameFromAbbr(newJobTeam)}</strong>
                      </p>
                      <p className="mb-2 text-xs sm:text-sm text-txt-secondary">What position?</p>
                      <div className="flex gap-2 flex-wrap">
                        {['HC', 'OC', 'DC'].map(pos => (
                          <button
                            key={pos}
                            onClick={async () => {
                              setNewJobPosition(pos)
                              const newTeamTid = getTidFromTeamName(currentDynasty.newJobData?.team, currentDynasty.teams)
                              const updatedTeams = newTeamTid
                                ? setPendingUserTeam(currentDynasty.teams, newTeamTid, pos)
                                : currentDynasty.teams
                              await updateDynasty(currentDynasty.id, {
                                newJobData: { ...currentDynasty.newJobData, takingNewJob: true, position: pos },
                                teams: updatedTeams,
                              })
                            }}
                            className="btn-refined btn-refined--solid"
                          >
                            {pos === 'HC' ? 'Head Coach' : pos === 'OC' ? 'Offensive Coordinator' : 'Defensive Coordinator'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )
            }

            // Week 2: Week 1 Bowl Results (incl. CFP First Round) + User's bowl game (if Week 2 bowl) + Week 2 bowl results.
            // Unified with the in-season todo design via renderTodoList. Each tile is one
            // entry in the `todos` array; multi-step wizards (Taking a New Job,
            // Coordinator Vacancy) appear as completed-state rows in the list with
            // their interactive UI rendered as separate panels below when mid-flow.
            if (week === 2) {
              const bw2Todos = []

              bw2Todos.push({
                key: 'bw1-results',
                done: totalEnteredWeek1 >= 29,
                title: 'Week 1 Bowl Results',
                subtitle: totalEnteredWeek1 === 29
                  ? 'All 29 games entered'
                  : `${totalEnteredWeek1}/29 games entered (incl. CFP First Round)`,
                onAction: () => setShowBowlWeek1Modal(true),
                actionLabel: hasBowlWeek1Data ? 'Edit' : 'Enter',
                viewTo: hasBowlWeek1Data ? `${pathPrefix}/weekly-scores/${year}/16` : null,
              })

              if (userHasBowlWeek1Game && !userBowlGameScoresEntered) {
                const bw1CarryoverOpponentTid = Number(userBowlGame.team1Tid) === Number(userTeamTid)
                  ? userBowlGame.team2Tid
                  : userBowlGame.team1Tid
                bw2Todos.push({
                  key: 'bowl-week1-carryover',
                  done: false,
                  title: `Enter Your ${userBowlGame.bowlName || 'Bowl Game'} Game`,
                  subtitle: `Missed from Week 1 — vs ${getMascotName(bw1CarryoverOpponentTid, currentDynasty.teams)}`,
                  onAction: () => {
                    navigate(`${pathPrefix}/game/${userBowlGame.id}/edit`, { state: { from: location.pathname } })
                  },
                  actionLabel: 'Enter',
                })
              }

              if (userHasCFPFirstRoundGame && !userCFPFirstRoundScoresEntered) {
                bw2Todos.push({
                  key: 'cfp-fr-carryover',
                  done: false,
                  title: 'Enter Your CFP First Round Game',
                  subtitle: `Missed from Week 1 — #${userCFPSeed} vs #${17 - userCFPSeed} ${getMascotName(userCFPOpponent)}`,
                  onAction: () => {
                    const gameToEdit = userCFPFirstRoundGame || userCFPFirstRoundShell
                    if (gameToEdit) {
                      navigate(`${pathPrefix}/game/${gameToEdit.id}/edit`, { state: { from: location.pathname } })
                    } else {
                      const opponentTid = typeof userCFPOpponent === 'number' ? userCFPOpponent : getTidFromAbbr(userCFPOpponent, currentDynasty)
                      const params = new URLSearchParams({
                        week: 'CFP First Round',
                        year: currentDynasty.currentYear?.toString() || '',
                        team1Tid: userTeamTid?.toString() || '',
                        team2Tid: opponentTid?.toString() || '',
                        gameType: 'cfp_first_round',
                      })
                      navigate(`${pathPrefix}/game/new?${params.toString()}`, { state: { from: location.pathname } })
                    }
                  },
                  actionLabel: 'Enter',
                })
              }

              if (userHasBowlWeek2Game) {
                const bw2BowlOpponentTid = Number(userBowlGame.team1Tid) === Number(userTeamTid)
                  ? userBowlGame.team2Tid
                  : userBowlGame.team1Tid
                bw2Todos.push({
                  key: 'bowl-week2',
                  done: userBowlGameScoresEntered,
                  title: `Enter Your ${userBowlGame.bowlName || 'Bowl Game'} Game`,
                  subtitle: userBowlGameScoresEntered
                    ? `${userBowlGame.perspective?.userWon ? 'Won' : 'Lost'} ${Math.max(userBowlGame.perspective?.userScore || 0, userBowlGame.perspective?.opponentScore || 0)}-${Math.min(userBowlGame.perspective?.userScore || 0, userBowlGame.perspective?.opponentScore || 0)}`
                    : `vs ${getMascotName(bw2BowlOpponentTid, currentDynasty.teams)}`,
                  onAction: () => {
                    navigate(`${pathPrefix}/game/${userBowlGame.id}/edit`, { state: { from: location.pathname } })
                  },
                  actionLabel: userBowlGameScoresEntered ? 'Edit' : 'Enter',
                })
              }

              // Bye weeks (no Bowl Week 2 game AND no CFP Quarterfinal
              // for the user's team) are no longer surfaced as a to-do
              // row — see the regular-season note above for the same
              // de-cluttering rationale.

              if (userHasCFPQuarterfinalGame) {
                const qfDone = userCFPQuarterfinalScoresEntered
                bw2Todos.push({
                  key: 'cfp-qf',
                  done: qfDone,
                  title: `Enter Your ${userQFBowlName} Game (CFP QF)`,
                  subtitle: qfDone
                    ? `${userCFPQuarterfinalGame.perspective?.userWon ? 'Won' : 'Lost'} ${Math.max(userCFPQuarterfinalGame.perspective?.userScore || 0, userCFPQuarterfinalGame.perspective?.opponentScore || 0)}-${Math.min(userCFPQuarterfinalGame.perspective?.userScore || 0, userCFPQuarterfinalGame.perspective?.opponentScore || 0)}`
                    : `#${userCFPSeed} vs ${userQFOpponent ? getMascotName(userQFOpponent) : 'TBD'}`,
                  onAction: () => {
                    const gameToEdit = userCFPQuarterfinalGame || userCFPQuarterfinalShell
                    if (gameToEdit) {
                      navigate(`${pathPrefix}/game/${gameToEdit.id}/edit`, { state: { from: location.pathname } })
                    } else {
                      const opponentTid = typeof userQFOpponent === 'number' ? userQFOpponent : getTidFromAbbr(userQFOpponent, currentDynasty)
                      const params = new URLSearchParams({
                        week: 'CFP Quarterfinal',
                        year: currentDynasty.currentYear?.toString() || '',
                        team1Tid: userTeamTid?.toString() || '',
                        team2Tid: opponentTid?.toString() || '',
                        gameType: 'cfp_quarterfinal',
                        bowlName: userQFBowlName || '',
                      })
                      navigate(`${pathPrefix}/game/new?${params.toString()}`, { state: { from: location.pathname } })
                    }
                  },
                  actionLabel: qfDone ? 'Edit' : 'Enter',
                })
              }

              // Taking a New Job — initial Yes/No on the row itself; the
              // team / position pickers render as panels below when the
              // wizard is mid-flow.
              const newJobDone = takingNewJob !== null && (takingNewJob === false || (newJobTeam && newJobPosition))
              const askingNewJobBW2 = takingNewJob === null
              bw2Todos.push({
                key: 'new-job-bw2',
                done: newJobDone,
                title: 'Taking a New Job? (Bowl Week 2)',
                subtitle: newJobDone
                  ? takingNewJob === true
                    ? `${newJobPosition} at ${getTeamNameFromAbbr(newJobTeam)}`
                    : 'Staying with current team'
                  : 'Yes or no?',
                onAction: askingNewJobBW2 ? async () => {
                  setTakingNewJob(true)
                  await updateDynasty(currentDynasty.id, {
                    newJobData: { takingNewJob: true, team: '', position: '' },
                  })
                } : newJobDone ? async () => {
                  setTakingNewJob(null)
                  setNewJobTeam('')
                  setNewJobPosition('')
                  const updatedTeams = clearPendingUserTeam(currentDynasty.teams)
                  await updateDynasty(currentDynasty.id, {
                    newJobData: null,
                    teams: updatedTeams,
                  })
                } : undefined,
                actionLabel: askingNewJobBW2 ? 'Yes' : newJobDone ? 'Edit' : undefined,
                extraTools: askingNewJobBW2 ? (
                  <button
                    onClick={async () => {
                      setTakingNewJob(false)
                      await updateDynasty(currentDynasty.id, {
                        newJobData: { takingNewJob: false, team: null, position: null, declinedInWeek: currentDynasty.currentWeek },
                      })
                    }}
                    className="btn-refined text-center"
                  >
                    No
                  </button>
                ) : null,
              })

              // Coordinator Vacancy — only render when applicable. The
              // initial Yes/Not Yet for each pending position lives
              // inline on this row (one position at a time — OC first,
              // then DC). The "Enter new OC/DC name" text inputs still
              // render as panels below when the wizard is mid-flow.
              const ccDataForYear = currentDynasty.conferenceChampionshipDataByYear?.[currentDynasty.currentYear] || {}
              const firedOC = ccDataForYear.firedOCName
              const firedDC = ccDataForYear.firedDCName
              const showCoordinator = currentDynasty.coachPosition === 'HC' && (firedOC || firedDC)
              let coordOcFilled, coordDcFilled, coordAllFilled, coordOcAnswered, coordDcAnswered, coordAllAnswered
              if (showCoordinator) {
                coordOcFilled = !firedOC || (filledOCVacancy === true && newOCName)
                coordDcFilled = !firedDC || (filledDCVacancy === true && newDCName)
                coordAllFilled = coordOcFilled && coordDcFilled
                coordOcAnswered = !firedOC || filledOCVacancy !== null
                coordDcAnswered = !firedDC || filledDCVacancy !== null
                coordAllAnswered = coordOcAnswered && coordDcAnswered
                if (!coordAllFilled) {
                  // Which position is currently waiting on the Yes/Not Yet
                  // answer? OC first if fired and unanswered; then DC.
                  const askingOC = !!firedOC && filledOCVacancy === null
                  const askingDC = !!firedDC && coordOcAnswered && filledDCVacancy === null
                  const askingPos = askingOC ? 'OC' : askingDC ? 'DC' : null
                  const askingFiredName = askingOC ? firedOC : askingDC ? firedDC : null
                  bw2Todos.push({
                    key: 'coord-vacancy',
                    done: false,
                    title: `Fill Coordinator ${firedOC && firedDC ? 'Vacancies' : 'Vacancy'}`,
                    subtitle: askingPos
                      ? `Has the ${askingPos} vacancy been filled? (Fired ${askingFiredName})`
                      : coordAllAnswered
                        ? `${firedOC ? (coordOcFilled ? `OC: ${newOCName}` : 'OC: Not filled yet') : ''}${firedOC && firedDC ? ' • ' : ''}${firedDC ? (coordDcFilled ? `DC: ${newDCName}` : 'DC: Not filled yet') : ''}`
                        : 'Has the vacancy been filled?',
                    onAction: askingOC
                      ? () => setFilledOCVacancy(true)
                      : askingDC
                        ? () => setFilledDCVacancy(true)
                        : coordAllAnswered
                          ? async () => {
                              setFilledOCVacancy(null)
                              setFilledDCVacancy(null)
                              setNewOCName('')
                              setNewDCName('')
                              await updateDynasty(currentDynasty.id, { pendingCoordinatorHires: null })
                            }
                          : undefined,
                    actionLabel: askingPos ? 'Yes' : coordAllAnswered ? 'Edit' : undefined,
                    extraTools: askingPos ? (
                      <button
                        onClick={async () => {
                          if (askingOC) {
                            setFilledOCVacancy(false)
                            await updateDynasty(currentDynasty.id, {
                              pendingCoordinatorHires: {
                                ...currentDynasty.pendingCoordinatorHires,
                                filledOC: false,
                                newOCName: null,
                              },
                            })
                          } else {
                            setFilledDCVacancy(false)
                            await updateDynasty(currentDynasty.id, {
                              pendingCoordinatorHires: {
                                ...currentDynasty.pendingCoordinatorHires,
                                filledDC: false,
                                newDCName: null,
                              },
                            })
                          }
                        }}
                        className="btn-refined text-center"
                      >
                        Not Yet
                      </button>
                    ) : null,
                  })
                }
              }

              // Recruiting Commitments
              const bw2CommitmentKey = getCommitmentKey()
              const bw2UserTidForCommits = getUserTeamTid(currentDynasty)
              const bw2CommitmentsForYear = getRecruitingCommitments(currentDynasty, bw2UserTidForCommits, currentDynasty.currentYear)
              const bw2WeekCommitments = bw2CommitmentsForYear?.[bw2CommitmentKey]
              const bw2HasCommitmentsData = bw2WeekCommitments !== undefined
              const bw2CommitmentsCount = bw2WeekCommitments?.length || 0
              const bw2ClassScore = calculateRecruitingClassScore(flattenClassCommitments(bw2CommitmentsForYear))

              bw2Todos.push({
                key: 'recruiting-bw2',
                done: bw2HasCommitmentsData,
                title: bw2HasCommitmentsData ? 'Recruiting Commitments' : 'Any commitments this week?',
                subtitle: bw2HasCommitmentsData
                  ? bw2CommitmentsCount > 0
                    ? `${bw2CommitmentsCount} commitment${bw2CommitmentsCount !== 1 ? 's' : ''} recorded`
                    : 'No commitments this week'
                  : 'Record any recruiting commitments',
                onAction: () => setShowRecruitingModal(true),
                actionLabel: bw2HasCommitmentsData ? 'Edit' : 'Yes',
                extraTools: recruitingExtraTools,
                inlineAction: !bw2HasCommitmentsData && !isViewOnly ? {
                  label: 'No commits',
                  onClick: handleNoCommitments,
                } : bw2HasCommitmentsData && bw2ClassScore > 0 ? {
                  label: `Class Score ${formatRecruitingClassScore(bw2ClassScore)}`,
                  onClick: () => navigate(`${pathPrefix}/recruiting/${bw2UserTidForCommits}/${currentDynasty.currentYear}`),
                } : null,
              })

              return (
                <>
                  <h3 className="w-fit font-display font-black uppercase leading-none rounded-md px-3 py-2 mb-3 sm:mb-4" style={{ fontSize: 'clamp(1.0625rem, 1.6vw, 1.375rem)', letterSpacing: '0.04em', ...teamLabelStyle }}>
                    Bowl Week 2
                  </h3>
                  {renderTodoList({ todos: bw2Todos, isViewOnly })}

                  {/* Mid-flow wizard panels — initial Yes/No prompts now
                      live inline on their to-do rows, but follow-up
                      selectors (team / position / coordinator name) still
                      need real UI space and render here. */}
                  {takingNewJob === true && !newJobTeam && (
                    <div className="media-card mt-3 px-3 py-3 sm:px-5 sm:py-4">
                      <p className="mb-2 text-xs sm:text-sm text-txt-secondary">Which team?</p>
                      <div className="max-w-xs">
                        <SearchableSelect
                          options={teams}
                          value={newJobTeam}
                          onChange={async (value) => {
                            setNewJobTeam(value)
                            await updateDynasty(currentDynasty.id, {
                              newJobData: { ...currentDynasty.newJobData, takingNewJob: true, team: value },
                            })
                          }}
                          placeholder="Search for team..."
                          teamColors={teamColors}
                          dynastyTeams={currentDynasty?.teams}
                        />
                      </div>
                    </div>
                  )}
                  {takingNewJob === true && newJobTeam && !newJobPosition && (
                    <div className="media-card mt-3 px-3 py-3 sm:px-5 sm:py-4">
                      <p className="mb-2 text-xs sm:text-sm text-txt-secondary">
                        New team: <strong className="text-txt-primary">{getTeamNameFromAbbr(newJobTeam)}</strong>
                      </p>
                      <p className="mb-2 text-xs sm:text-sm text-txt-secondary">What position?</p>
                      <div className="flex gap-2 flex-wrap">
                        {['HC', 'OC', 'DC'].map(pos => (
                          <button
                            key={pos}
                            onClick={async () => {
                              setNewJobPosition(pos)
                              const newTeamTid = getTidFromTeamName(currentDynasty.newJobData?.team, currentDynasty.teams)
                              const updatedTeams = newTeamTid
                                ? setPendingUserTeam(currentDynasty.teams, newTeamTid, pos)
                                : currentDynasty.teams
                              await updateDynasty(currentDynasty.id, {
                                newJobData: { ...currentDynasty.newJobData, takingNewJob: true, position: pos },
                                teams: updatedTeams,
                              })
                            }}
                            className="btn-refined btn-refined--solid"
                          >
                            {pos === 'HC' ? 'Head Coach' : pos === 'OC' ? 'Offensive Coordinator' : 'Defensive Coordinator'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Coordinator vacancy mid-flow panels — initial
                      Yes/Not Yet for each pending position lives inline
                      on the coord-vacancy row; only the new-name input
                      step renders here. */}
                  {showCoordinator && firedOC && filledOCVacancy === true && !newOCName && (
                    <div className="media-card mt-3 px-3 py-3 sm:px-5 sm:py-4">
                      <p className="mb-2 text-xs sm:text-sm text-txt-secondary">Enter new OC name:</p>
                      <div className="flex gap-2 max-w-sm">
                        <input
                          type="text"
                          id="new-oc-name"
                          className="flex-1 px-3 py-2 border-2 rounded-lg focus:outline-none"
                          style={{ borderColor: 'var(--text-primary)' }}
                          placeholder="New OC name..."
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter' && e.target.value.trim()) {
                              const name = e.target.value.trim()
                              setNewOCName(name)
                              await updateDynasty(currentDynasty.id, {
                                pendingCoordinatorHires: {
                                  ...currentDynasty.pendingCoordinatorHires,
                                  filledOC: true,
                                  newOCName: name,
                                },
                              })
                            }
                          }}
                        />
                        <button
                          onClick={async () => {
                            const input = document.getElementById('new-oc-name')
                            if (input?.value.trim()) {
                              const name = input.value.trim()
                              setNewOCName(name)
                              await updateDynasty(currentDynasty.id, {
                                pendingCoordinatorHires: {
                                  ...currentDynasty.pendingCoordinatorHires,
                                  filledOC: true,
                                  newOCName: name,
                                },
                              })
                            }
                          }}
                          className="btn-refined btn-refined--solid"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  )}
                  {showCoordinator && firedDC && coordOcAnswered && filledDCVacancy === true && !newDCName && (
                    <div className="media-card mt-3 px-3 py-3 sm:px-5 sm:py-4">
                      <p className="mb-2 text-xs sm:text-sm text-txt-secondary">Enter new DC name:</p>
                      <div className="flex gap-2 max-w-sm">
                        <input
                          type="text"
                          id="new-dc-name"
                          className="flex-1 px-3 py-2 border-2 rounded-lg focus:outline-none"
                          style={{ borderColor: 'var(--text-primary)' }}
                          placeholder="New DC name..."
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter' && e.target.value.trim()) {
                              const name = e.target.value.trim()
                              setNewDCName(name)
                              await updateDynasty(currentDynasty.id, {
                                pendingCoordinatorHires: {
                                  ...currentDynasty.pendingCoordinatorHires,
                                  filledDC: true,
                                  newDCName: name,
                                },
                              })
                            }
                          }}
                        />
                        <button
                          onClick={async () => {
                            const input = document.getElementById('new-dc-name')
                            if (input?.value.trim()) {
                              const name = input.value.trim()
                              setNewDCName(name)
                              await updateDynasty(currentDynasty.id, {
                                pendingCoordinatorHires: {
                                  ...currentDynasty.pendingCoordinatorHires,
                                  filledDC: true,
                                  newDCName: name,
                                },
                              })
                            }
                          }}
                          className="btn-refined btn-refined--solid"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )
            }


            // Week 5: End of Season Recap. Unified with in-season todo design
            // via renderTodoList — same row chrome, no numbered squares.
            if (week === 5) {
              const yearForW5 = currentDynasty.currentYear
              const unifiedChampGames = getGamesByType(currentDynasty, GAME_TYPES.CFP_CHAMPIONSHIP, yearForW5)
              const legacyChampData = currentDynasty.cfpResultsByYear?.[yearForW5]?.championship || currentDynasty.cfpResultsByYear?.[String(yearForW5)]?.championship || []
              const champData = unifiedChampGames.length > 0 ? unifiedChampGames : legacyChampData
              const hasChampData = champData.length > 0 && champData[0]?.team1Score !== null && champData[0]?.team1Score !== undefined

              const gpSnapsCompleted = currentDynasty?.gpSnapsCompletedByYear?.[yearForW5] || currentDynasty?.gpSnapsCompletedByYear?.[String(yearForW5)]
              const gpSnapsPlayerCount = currentDynasty?.players?.filter(p => {
                const yearStats = p.statsByYear?.[yearForW5] || p.statsByYear?.[String(yearForW5)]
                return yearStats && (yearStats.gamesPlayed || yearStats.snapsPlayed)
              }).length || 0

              const yearGamesW5 = (currentDynasty?.games || []).filter(g => Number(g.year) === Number(yearForW5))
              const hasBoxScoreData = yearGamesW5.some(g => g.boxScore && hasAnyPlayerStats(g, currentDynasty?.teams))
              const detailedStatsCompleted = currentDynasty?.detailedStatsCompletedByYear?.[yearForW5] || currentDynasty?.detailedStatsCompletedByYear?.[String(yearForW5)]
              const detailedStatsLocked = !gpSnapsCompleted && !hasBoxScoreData

              const standingsForYear = currentDynasty?.conferenceStandingsByYear?.[yearForW5] || currentDynasty?.conferenceStandingsByYear?.[String(yearForW5)]
              const hasStandingsData = !!standingsForYear && Object.keys(standingsForYear).length > 0
              const standingsCount = hasStandingsData ? Object.keys(standingsForYear).length : 0

              const hasPollsData = (currentDynasty?.finalPollsByYear?.[yearForW5]?.media?.length > 0) || (currentDynasty?.finalPollsByYear?.[String(yearForW5)]?.media?.length > 0)

              const teamStatsForYear = currentDynasty?.teamStatsByYear?.[yearForW5] || currentDynasty?.teamStatsByYear?.[String(yearForW5)]
              const hasTeamStats = !!teamStatsForYear && Object.keys(teamStatsForYear).length > 0

              // Auto-detect "done" from game-by-game entry. Each end-of-season
              // catch-up sheet has an alternative data path that fills the same
              // store via normal in-season activity:
              //   • Detailed Stats     ← box scores aggregate into player.statsByYear
              //   • Team Stats         ← box scores aggregate into teamStatsByYear
              //   • Conference Standings ← scored games derive standings
              // If every game this year is scored AND carries box-score data,
              // surface the corresponding tile as done even if the user never
              // opened the catch-up sheet — they did the work the long way.
              const playedGamesW5 = yearGamesW5.filter(g =>
                typeof g.team1Score === 'number' && typeof g.team2Score === 'number'
              )
              const allYearGamesAreScored = yearGamesW5.length > 0 && playedGamesW5.length === yearGamesW5.length
              const allGamesHavePlayerBoxScores = playedGamesW5.length > 0 && playedGamesW5.every(g =>
                g.boxScore && hasAnyPlayerStats(g, currentDynasty?.teams)
              )
              const allGamesHaveTeamBoxScores = playedGamesW5.length > 0 && playedGamesW5.every(g =>
                g.boxScore && hasAnyTeamStats(g, currentDynasty?.teams)
              )
              // Effective "done" for each tile = explicit catch-up sheet save
              // OR the in-season game-by-game equivalent was filled in.
              const detailedStatsEffectivelyDone = !!detailedStatsCompleted || allGamesHavePlayerBoxScores
              const teamStatsEffectivelyDone = hasTeamStats || allGamesHaveTeamBoxScores
              const standingsEffectivelyDone = hasStandingsData || allYearGamesAreScored

              const awardsForYear = currentDynasty?.awardsByYear?.[yearForW5] || currentDynasty?.awardsByYear?.[String(yearForW5)]
              const hasAwards = !!awardsForYear && Object.keys(awardsForYear).length > 0
              const awardsCount = hasAwards ? Object.keys(awardsForYear).length : 0

              const allAmericansForYear = currentDynasty?.allAmericansByYear?.[yearForW5] || currentDynasty?.allAmericansByYear?.[String(yearForW5)]
              const hasAllAmericans = allAmericansForYear?.allAmericans?.length > 0
              const hasAllConference = allAmericansForYear?.allConference?.length > 0

              const w5Todos = []

              if (userInCFPChampionship) {
                // User played in the NC — link to their game record
                const userChampHasScoresW5 = userCFPChampionshipGame &&
                  userCFPChampionshipGame.team1Score !== null &&
                  userCFPChampionshipGame.team1Score !== undefined
                w5Todos.push({
                  key: 'champ-result',
                  done: !!userChampHasScoresW5,
                  title: 'National Championship Result',
                  subtitle: userChampHasScoresW5
                    ? `${userCFPChampionshipGame.perspective?.userWon ? 'Won' : 'Lost'} ${Math.max(userCFPChampionshipGame.perspective?.userScore || 0, userCFPChampionshipGame.perspective?.opponentScore || 0)}-${Math.min(userCFPChampionshipGame.perspective?.userScore || 0, userCFPChampionshipGame.perspective?.opponentScore || 0)}`
                    : 'Enter your national championship game result',
                  onAction: userCFPChampionshipGame
                    ? () => navigate(`${pathPrefix}/game/${userCFPChampionshipGame.id}/edit`, { state: { from: location.pathname } })
                    : () => setShowCFPChampionshipModal(true),
                  actionLabel: userChampHasScoresW5 ? 'Edit' : 'Enter',
                })
              } else {
                w5Todos.push({
                  key: 'champ-result',
                  done: hasChampData,
                  title: 'National Championship Result',
                  subtitle: hasChampData
                    ? (champData[0]?.winner || 'Result entered')
                    : 'Enter the championship game result',
                  onAction: () => setShowCFPChampionshipModal(true),
                  actionLabel: hasChampData ? 'Edit' : 'Enter',
                })
              }

              w5Todos.push({
                key: 'gp-snaps',
                done: !!gpSnapsCompleted,
                title: 'GP/Snaps Entry',
                subtitle: gpSnapsCompleted
                  ? `Stats entered for ${gpSnapsPlayerCount} players`
                  : 'Enter games played and snaps for each player',
                onAction: () => setShowStatsEntryModal(true),
                actionLabel: gpSnapsCompleted ? 'Edit' : 'Enter',
              })

              w5Todos.push({
                key: 'detailed-stats',
                done: detailedStatsEffectivelyDone,
                title: 'Detailed Stats Entry',
                subtitle: detailedStatsCompleted
                  ? 'Detailed stats entered across all categories'
                  : (allGamesHavePlayerBoxScores && !detailedStatsCompleted)
                    ? 'Captured from game-by-game box scores'
                    : detailedStatsLocked
                      ? 'Complete GP/Snaps Entry first'
                      : 'Enter detailed stats by category',
                onAction: detailedStatsLocked ? undefined : () => setShowDetailedStatsModal(true),
                actionLabel: detailedStatsLocked ? undefined : (detailedStatsEffectivelyDone ? 'Edit' : 'Enter'),
              })

              w5Todos.push({
                key: 'conference-standings',
                done: standingsEffectivelyDone,
                title: 'Conference Standings',
                subtitle: hasStandingsData
                  ? `Standings entered for ${standingsCount} conferences`
                  : (allYearGamesAreScored && !hasStandingsData)
                    ? 'Derived from your weekly game results'
                    : 'Enter final conference standings',
                onAction: () => setShowConferenceStandingsModal(true),
                actionLabel: standingsEffectivelyDone ? 'Edit' : 'Enter',
              })

              w5Todos.push({
                key: 'final-top25',
                done: !!hasPollsData,
                title: 'Final Top 25',
                subtitle: hasPollsData ? 'Final Top 25 entered' : 'Enter the final media poll',
                onAction: () => setShowFinalPollsModal(true),
                actionLabel: hasPollsData ? 'Edit' : 'Enter',
              })

              w5Todos.push({
                key: 'team-stats',
                done: teamStatsEffectivelyDone,
                title: 'Team Statistics',
                subtitle: hasTeamStats
                  ? 'Team statistics entered'
                  : (allGamesHaveTeamBoxScores && !hasTeamStats)
                    ? 'Captured from game-by-game box scores'
                    : 'Enter team statistical leaders',
                onAction: () => setShowTeamStatsModal(true),
                actionLabel: teamStatsEffectivelyDone ? 'Edit' : 'Enter',
              })

              w5Todos.push({
                key: 'season-awards',
                done: !!hasAwards,
                title: 'Season Awards',
                subtitle: hasAwards ? `${awardsCount} awards entered` : 'Enter major award winners',
                onAction: () => setShowAwardsModal(true),
                actionLabel: hasAwards ? 'Edit' : 'Enter',
              })

              w5Todos.push({
                key: 'all-americans',
                done: !!hasAllAmericans,
                title: 'All-Americans',
                subtitle: hasAllAmericans ? 'All-Americans selections entered' : 'Enter All-America selections',
                onAction: () => setShowAllAmericansModal(true),
                actionLabel: hasAllAmericans ? 'Edit' : 'Enter',
              })

              w5Todos.push({
                key: 'all-conference',
                done: !!hasAllConference,
                title: 'All-Conference',
                subtitle: hasAllConference ? 'All-Conference selections entered' : 'Enter All-Conference selections',
                onAction: () => setShowAllConferenceModal(true),
                actionLabel: hasAllConference ? 'Edit' : 'Enter',
              })

              return (
                <>
                  <h3 className="w-fit font-display font-black uppercase leading-none rounded-md px-3 py-2 mb-3 sm:mb-4" style={{ fontSize: 'clamp(1.0625rem, 1.6vw, 1.375rem)', letterSpacing: '0.04em', ...teamLabelStyle }}>
                    End of Season Recap
                  </h3>
                  {renderTodoList({ todos: w5Todos, isViewOnly })}
                </>
              )
            }

            // Weeks 3-4 fallthrough (Bowl Week 3, National Championship).
            // Unified with the in-season todo design via renderTodoList. Multi-step
            // wizards (Taking a New Job, Fill Coordinator Vacancy) render as status
            // rows in the list with their interactive UI in `media-card` panels below.
            const w34Todos = []

            if (week === 3) {
              w34Todos.push({
                key: 'bw2-results',
                done: totalEnteredWeek2 >= 13,
                title: 'Week 2 Bowl Results',
                subtitle: totalEnteredWeek2 === 13
                  ? 'All 13 games entered'
                  : `${totalEnteredWeek2}/13 games entered (incl. CFP Quarterfinals)`,
                onAction: () => setShowBowlWeek2Modal(true),
                actionLabel: hasBowlWeek2Data ? 'Edit' : 'Enter',
                viewTo: hasBowlWeek2Data ? `${pathPrefix}/weekly-scores/${year}/17` : null,
              })
            }

            // CFP Semifinal bye (user's team didn't advance) — no to-do row,
            // matching the general "no game = no row" convention.

            if (week === 3 && userHasCFPSemifinalGame) {
              const sfDone = !!userCFPSemifinalGame && userCFPSemifinalGame.team1Score != null
              w34Todos.push({
                key: 'cfp-sf-game',
                done: sfDone,
                title: 'Enter Your CFP Semifinal Game',
                subtitle: sfDone
                  ? `${userCFPSemifinalGame.perspective?.userWon ? 'Won' : 'Lost'} ${Math.max(userCFPSemifinalGame.perspective?.userScore || 0, userCFPSemifinalGame.perspective?.opponentScore || 0)}-${Math.min(userCFPSemifinalGame.perspective?.userScore || 0, userCFPSemifinalGame.perspective?.opponentScore || 0)}`
                  : `${userSFBowlName || 'CFP Semifinal'} vs ${userSFOpponent ? getMascotName(userSFOpponent) || userSFOpponent : 'TBD'}`,
                onAction: () => {
                  const gameToEdit = userCFPSemifinalGame || userCFPSemifinalShell
                  if (gameToEdit) {
                    navigate(`${pathPrefix}/game/${gameToEdit.id}/edit`, { state: { from: location.pathname } })
                  } else {
                    const opponentTid = typeof userSFOpponent === 'number' ? userSFOpponent : getTidFromAbbr(userSFOpponent, currentDynasty)
                    const params = new URLSearchParams({
                      week: 'CFP Semifinal',
                      year: currentDynasty.currentYear?.toString() || '',
                      team1Tid: userTeamTid?.toString() || '',
                      team2Tid: opponentTid?.toString() || '',
                      gameType: 'cfp_semifinal',
                      bowlName: userSFBowlName || 'CFP Semifinal',
                    })
                    navigate(`${pathPrefix}/game/new?${params.toString()}`, { state: { from: location.pathname } })
                  }
                },
                actionLabel: sfDone ? 'Edit' : 'Enter',
              })
            }

            let w4AllSFComplete = false
            if (week === 4) {
              const unifiedSFData = getGamesByType(currentDynasty, GAME_TYPES.CFP_SEMIFINAL, currentDynasty.currentYear)
              const legacySFData = currentDynasty.cfpResultsByYear?.[currentDynasty.currentYear]?.semifinals || []
              const sfData = unifiedSFData.length > 0 ? unifiedSFData : legacySFData
              const sfGamesWithScores = sfData.filter(g => g && g.team1Score !== undefined && g.team1Score !== null && g.team2Score !== undefined && g.team2Score !== null).length
              w4AllSFComplete = sfGamesWithScores >= 2

              w34Todos.push({
                key: 'cfp-sf-results',
                done: w4AllSFComplete,
                title: 'CFP Semifinal Results',
                subtitle: w4AllSFComplete ? 'All 2 games entered' : `${sfGamesWithScores}/2 games entered`,
                onAction: () => setShowCFPSemifinalsModal(true),
                actionLabel: w4AllSFComplete ? 'Edit' : 'Enter',
              })
            }

            // National Championship bye (user's team didn't advance) — no
            // to-do row, matching the general "no game = no row" convention.

            if (week === 4 && userHasCFPChampionshipGame) {
              const userChampHasScores = userCFPChampionshipGame &&
                userCFPChampionshipGame.team1Score !== null &&
                userCFPChampionshipGame.team1Score !== undefined
              w34Todos.push({
                key: 'cfp-champ-game',
                done: !!userChampHasScores,
                title: 'Enter Your National Championship Game',
                subtitle: userChampHasScores
                  ? `${userCFPChampionshipGame.perspective?.userWon ? 'Won' : 'Lost'} ${Math.max(userCFPChampionshipGame.perspective?.userScore || 0, userCFPChampionshipGame.perspective?.opponentScore || 0)}-${Math.min(userCFPChampionshipGame.perspective?.userScore || 0, userCFPChampionshipGame.perspective?.opponentScore || 0)}`
                  : w4AllSFComplete
                    ? `National Championship vs ${userChampOpponent ? getMascotName(userChampOpponent) || userChampOpponent : 'TBD'}`
                    : 'Enter SF results first to determine opponent',
                onAction: () => {
                  const gameToEdit = userCFPChampionshipGame || userCFPChampionshipShell
                  if (gameToEdit) {
                    navigate(`${pathPrefix}/game/${gameToEdit.id}/edit`, { state: { from: location.pathname } })
                  } else {
                    const opponentTid = typeof userChampOpponent === 'number' ? userChampOpponent : getTidFromAbbr(userChampOpponent, currentDynasty)
                    const params = new URLSearchParams({
                      week: 'CFP Championship',
                      year: currentDynasty.currentYear?.toString() || '',
                      team1Tid: userTeamTid?.toString() || '',
                      team2Tid: opponentTid?.toString() || '',
                      gameType: 'cfp_championship',
                      bowlName: 'National Championship',
                    })
                    navigate(`${pathPrefix}/game/new?${params.toString()}`, { state: { from: location.pathname } })
                  }
                },
                actionLabel: userChampHasScores ? 'Edit' : 'Enter',
              })
            }

            const w34NewJobDone = takingNewJob !== null && (takingNewJob === false || (newJobTeam && newJobPosition))
            const askingNewJobBW34 = week !== 4 && takingNewJob === null
            if (week !== 4) {
              w34Todos.push({
                key: 'new-job-bw34',
                done: w34NewJobDone,
                title: `Taking a New Job? (Bowl Week ${week})`,
                subtitle: w34NewJobDone
                  ? takingNewJob === true
                    ? `${newJobPosition} at ${getTeamNameFromAbbr(newJobTeam)}`
                    : 'Staying with current team'
                  : 'Yes or no?',
                onAction: askingNewJobBW34 ? async () => {
                  setTakingNewJob(true)
                  await updateDynasty(currentDynasty.id, {
                    newJobData: { takingNewJob: true, team: '', position: '' },
                  })
                } : w34NewJobDone ? async () => {
                  setTakingNewJob(null)
                  setNewJobTeam('')
                  setNewJobPosition('')
                  const updatedTeams = clearPendingUserTeam(currentDynasty.teams)
                  await updateDynasty(currentDynasty.id, {
                    newJobData: null,
                    teams: updatedTeams,
                  })
                } : undefined,
                actionLabel: askingNewJobBW34 ? 'Yes' : w34NewJobDone ? 'Edit' : undefined,
                extraTools: askingNewJobBW34 ? (
                  <button
                    onClick={async () => {
                      setTakingNewJob(false)
                      await updateDynasty(currentDynasty.id, {
                        newJobData: { takingNewJob: false, team: null, position: null, declinedInWeek: currentDynasty.currentWeek },
                      })
                    }}
                    className="btn-refined text-center"
                  >
                    No
                  </button>
                ) : null,
              })
            }

            const w34CcDataForYear = currentDynasty.conferenceChampionshipDataByYear?.[currentDynasty.currentYear] || {}
            const w34FiredOC = w34CcDataForYear.firedOCName
            const w34FiredDC = w34CcDataForYear.firedDCName
            const w34ShowCoordinator = currentDynasty.coachPosition === 'HC' && (w34FiredOC || w34FiredDC)
            let w34CoordAllFilled = true
            let w34CoordAllAnswered = true
            let w34CoordOcFilled = true
            let w34CoordDcFilled = true
            if (w34ShowCoordinator) {
              w34CoordOcFilled = !w34FiredOC || (filledOCVacancy === true && newOCName)
              w34CoordDcFilled = !w34FiredDC || (filledDCVacancy === true && newDCName)
              w34CoordAllFilled = w34CoordOcFilled && w34CoordDcFilled
              const w34OcAnswered = !w34FiredOC || filledOCVacancy !== null
              const w34DcAnswered = !w34FiredDC || filledDCVacancy !== null
              w34CoordAllAnswered = w34OcAnswered && w34DcAnswered
              if (!w34CoordAllFilled) {
                // Inline Yes/Not Yet for whichever position is pending —
                // OC first, then DC (mirrors BW2's coord-vacancy row).
                const w34AskingOC = !!w34FiredOC && filledOCVacancy === null
                const w34AskingDC = !!w34FiredDC && w34OcAnswered && filledDCVacancy === null
                const w34AskingPos = w34AskingOC ? 'OC' : w34AskingDC ? 'DC' : null
                const w34AskingFiredName = w34AskingOC ? w34FiredOC : w34AskingDC ? w34FiredDC : null
                w34Todos.push({
                  key: 'coord-vacancy-bw34',
                  done: false,
                  title: `Fill Coordinator ${w34FiredOC && w34FiredDC ? 'Vacancies' : 'Vacancy'}`,
                  subtitle: w34AskingPos
                    ? `Has the ${w34AskingPos} vacancy been filled? (Fired ${w34AskingFiredName})`
                    : w34CoordAllAnswered
                      ? `${w34FiredOC ? (w34CoordOcFilled ? `OC: ${newOCName}` : 'OC: Not filled yet') : ''}${w34FiredOC && w34FiredDC ? ' • ' : ''}${w34FiredDC ? (w34CoordDcFilled ? `DC: ${newDCName}` : 'DC: Not filled yet') : ''}`
                      : 'Has the vacancy been filled?',
                  onAction: w34AskingOC
                    ? () => setFilledOCVacancy(true)
                    : w34AskingDC
                      ? () => setFilledDCVacancy(true)
                      : w34CoordAllAnswered
                        ? async () => {
                            setFilledOCVacancy(null)
                            setFilledDCVacancy(null)
                            setNewOCName('')
                            setNewDCName('')
                            await updateDynasty(currentDynasty.id, { pendingCoordinatorHires: null })
                          }
                        : undefined,
                  actionLabel: w34AskingPos ? 'Yes' : w34CoordAllAnswered ? 'Edit' : undefined,
                  extraTools: w34AskingPos ? (
                    <button
                      onClick={async () => {
                        if (w34AskingOC) {
                          setFilledOCVacancy(false)
                          await updateDynasty(currentDynasty.id, {
                            pendingCoordinatorHires: {
                              ...currentDynasty.pendingCoordinatorHires,
                              filledOC: false,
                              newOCName: null,
                            },
                          })
                        } else {
                          setFilledDCVacancy(false)
                          await updateDynasty(currentDynasty.id, {
                            pendingCoordinatorHires: {
                              ...currentDynasty.pendingCoordinatorHires,
                              filledDC: false,
                              newDCName: null,
                            },
                          })
                        }
                      }}
                      className="btn-refined text-center"
                    >
                      Not Yet
                    </button>
                  ) : null,
                })
              }
            }

            const w34CommitmentKey = getCommitmentKey()
            const w34UserTidForCommits = getUserTeamTid(currentDynasty)
            const w34CommitmentsForYear = getRecruitingCommitments(currentDynasty, w34UserTidForCommits, currentDynasty.currentYear)
            const w34WeekCommitments = w34CommitmentsForYear?.[w34CommitmentKey]
            const w34HasCommitmentsData = w34WeekCommitments !== undefined
            const w34CommitmentsCount = w34WeekCommitments?.length || 0
            const w34ClassScore = calculateRecruitingClassScore(flattenClassCommitments(w34CommitmentsForYear))

            w34Todos.push({
              key: 'recruiting-bw34',
              done: w34HasCommitmentsData,
              title: w34HasCommitmentsData ? 'Recruiting Commitments' : 'Any commitments this week?',
              subtitle: w34HasCommitmentsData
                ? w34CommitmentsCount > 0
                  ? `${w34CommitmentsCount} commitment${w34CommitmentsCount !== 1 ? 's' : ''} recorded`
                  : 'No commitments this week'
                : 'Record any recruiting commitments',
              onAction: () => setShowRecruitingModal(true),
              actionLabel: w34HasCommitmentsData ? 'Edit' : 'Yes',
              extraTools: recruitingExtraTools,
              inlineAction: !w34HasCommitmentsData && !isViewOnly ? {
                label: 'No commits',
                onClick: handleNoCommitments,
              } : w34HasCommitmentsData && w34ClassScore > 0 ? {
                label: `Class Score ${formatRecruitingClassScore(w34ClassScore)}`,
                onClick: () => navigate(`${pathPrefix}/recruiting/${w34UserTidForCommits}/${currentDynasty.currentYear}`),
              } : null,
            })

            return (
              <>
                <h3 className="w-fit font-display font-black uppercase leading-none rounded-md px-3 py-2 mb-3 sm:mb-4" style={{ fontSize: 'clamp(1.0625rem, 1.6vw, 1.375rem)', letterSpacing: '0.04em', ...teamLabelStyle }}>
                  {week === 4 ? 'National Championship' : `Bowl Week ${week}`}
                </h3>
                {renderTodoList({ todos: w34Todos, isViewOnly })}

                {/* New Job wizard panels — initial Yes/No now lives
                    inline on the new-job-bw34 row; only the team /
                    position pickers render below. (week 4 hides this
                    task entirely.) */}
                {week !== 4 && takingNewJob === true && !newJobTeam && (
                  <div className="media-card mt-3 px-3 py-3 sm:px-5 sm:py-4">
                    <p className="mb-2 text-xs sm:text-sm text-txt-secondary">Which team?</p>
                    <div className="max-w-xs">
                      <SearchableSelect
                        options={teams}
                        value={newJobTeam}
                        onChange={async (value) => {
                          setNewJobTeam(value)
                          await updateDynasty(currentDynasty.id, {
                            newJobData: { ...currentDynasty.newJobData, takingNewJob: true, team: value },
                          })
                        }}
                        placeholder="Search for team..."
                        teamColors={teamColors}
                        dynastyTeams={currentDynasty?.teams}
                      />
                    </div>
                  </div>
                )}
                {week !== 4 && takingNewJob === true && newJobTeam && !newJobPosition && (
                  <div className="media-card mt-3 px-3 py-3 sm:px-5 sm:py-4">
                    <p className="mb-2 text-xs sm:text-sm text-txt-secondary">
                      New team: <strong className="text-txt-primary">{getTeamNameFromAbbr(newJobTeam)}</strong>
                    </p>
                    <p className="mb-2 text-xs sm:text-sm text-txt-secondary">What position?</p>
                    <div className="flex gap-2 flex-wrap">
                      {['HC', 'OC', 'DC'].map(pos => (
                        <button
                          key={pos}
                          onClick={async () => {
                            setNewJobPosition(pos)
                            const newTeamTid = getTidFromTeamName(currentDynasty.newJobData?.team, currentDynasty.teams)
                            const updatedTeams = newTeamTid
                              ? setPendingUserTeam(currentDynasty.teams, newTeamTid, pos)
                              : currentDynasty.teams
                            await updateDynasty(currentDynasty.id, {
                              newJobData: { ...currentDynasty.newJobData, takingNewJob: true, position: pos },
                              teams: updatedTeams,
                            })
                          }}
                          className="btn-refined btn-refined--solid"
                        >
                          {pos === 'HC' ? 'Head Coach' : pos === 'OC' ? 'Offensive Coordinator' : 'Defensive Coordinator'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Coordinator vacancy mid-flow panels — initial
                    Yes/Not Yet for each pending position lives inline on
                    the coord-vacancy-bw34 row; only the new-name input
                    step renders here. */}
                {w34ShowCoordinator && w34FiredOC && filledOCVacancy === true && !newOCName && (
                  <div className="media-card mt-3 px-3 py-3 sm:px-5 sm:py-4">
                    <p className="mb-2 text-xs sm:text-sm text-txt-secondary">Enter new OC name:</p>
                    <div className="flex gap-2 max-w-sm">
                      <input
                        type="text"
                        id="new-oc-name-week34"
                        className="flex-1 px-3 py-2 border-2 rounded-lg focus:outline-none"
                        style={{ borderColor: 'var(--text-primary)' }}
                        placeholder="New OC name..."
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter' && e.target.value.trim()) {
                            const name = e.target.value.trim()
                            setNewOCName(name)
                            await updateDynasty(currentDynasty.id, {
                              pendingCoordinatorHires: {
                                ...currentDynasty.pendingCoordinatorHires,
                                filledOC: true,
                                newOCName: name,
                              },
                            })
                          }
                        }}
                      />
                      <button
                        onClick={async () => {
                          const input = document.getElementById('new-oc-name-week34')
                          if (input?.value.trim()) {
                            const name = input.value.trim()
                            setNewOCName(name)
                            await updateDynasty(currentDynasty.id, {
                              pendingCoordinatorHires: {
                                ...currentDynasty.pendingCoordinatorHires,
                                filledOC: true,
                                newOCName: name,
                              },
                            })
                          }
                        }}
                        className="btn-refined btn-refined--solid"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                )}
                {w34ShowCoordinator && w34FiredDC && (!w34FiredOC || filledOCVacancy !== null) && filledDCVacancy === true && !newDCName && (
                  <div className="media-card mt-3 px-3 py-3 sm:px-5 sm:py-4">
                    <p className="mb-2 text-xs sm:text-sm text-txt-secondary">Enter new DC name:</p>
                    <div className="flex gap-2 max-w-sm">
                      <input
                        type="text"
                        id="new-dc-name-week34"
                        className="flex-1 px-3 py-2 border-2 rounded-lg focus:outline-none"
                        style={{ borderColor: 'var(--text-primary)' }}
                        placeholder="New DC name..."
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter' && e.target.value.trim()) {
                            const name = e.target.value.trim()
                            setNewDCName(name)
                            await updateDynasty(currentDynasty.id, {
                              pendingCoordinatorHires: {
                                ...currentDynasty.pendingCoordinatorHires,
                                filledDC: true,
                                newDCName: name,
                              },
                            })
                          }
                        }}
                      />
                      <button
                        onClick={async () => {
                          const input = document.getElementById('new-dc-name-week34')
                          if (input?.value.trim()) {
                            const name = input.value.trim()
                            setNewDCName(name)
                            await updateDynasty(currentDynasty.id, {
                              pendingCoordinatorHires: {
                                ...currentDynasty.pendingCoordinatorHires,
                                filledDC: true,
                                newDCName: name,
                              },
                            })
                          }
                        }}
                        className="btn-refined btn-refined--solid"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                )}
              </>
            )
          })()}
          </div>
        </div>
      ) : currentDynasty.currentPhase === 'offseason' ? (
        <div className="media-card overflow-hidden">
          <div className="px-4 pt-3 pb-4 sm:px-6 sm:pt-3 sm:pb-6">
          {(() => {
            const week = currentDynasty.currentWeek

            // Offseason Week 1: Players Leaving. Unified via renderTodoList.
            if (week === 1) {
              const previousTeamAbbr = currentDynasty.coachTeamByYear?.[currentDynasty.currentYear]?.team
              const currentTeamAbbr = getCurrentTeamAbbr(currentDynasty)
              const switchedTeams = previousTeamAbbr && currentTeamAbbr && previousTeamAbbr !== currentTeamAbbr

              const hasPlayersLeavingData = currentDynasty?.playersLeavingByYear?.[currentDynasty.currentYear]?.length > 0
              const playersLeavingCount = currentDynasty?.playersLeavingByYear?.[currentDynasty.currentYear]?.length || 0

              if (switchedTeams) {
                const skippedTodos = [{
                  key: 'players-leaving-skipped',
                  done: true,
                  title: 'Skipped - New Team',
                  subtitle: 'You switched teams, so there are no departing players to track',
                }]
                return (
                  <>
                    <h3 className="w-fit font-display font-black uppercase leading-none rounded-md px-3 py-2 mb-3 sm:mb-4" style={{ fontSize: 'clamp(1.0625rem, 1.6vw, 1.375rem)', letterSpacing: '0.04em', ...teamLabelStyle }}>
                      New Team — No Players Leaving
                    </h3>
                    {renderTodoList({ todos: skippedTodos, isViewOnly })}
                  </>
                )
              }

              const ow1Todos = [{
                key: 'players-leaving',
                done: hasPlayersLeavingData,
                title: 'Players Leaving',
                subtitle: hasPlayersLeavingData
                  ? `${playersLeavingCount} player${playersLeavingCount !== 1 ? 's' : ''} leaving`
                  : 'Graduating seniors, transfers, early declarations',
                onAction: () => setShowPlayersLeavingModal(true),
                actionLabel: hasPlayersLeavingData ? 'Edit' : 'Enter',
              }]

              return (
                <>
                  <h3 className="w-fit font-display font-black uppercase leading-none rounded-md px-3 py-2 mb-3 sm:mb-4" style={{ fontSize: 'clamp(1.0625rem, 1.6vw, 1.375rem)', letterSpacing: '0.04em', ...teamLabelStyle }}>
                    Players Leaving
                  </h3>
                  {renderTodoList({ todos: ow1Todos, isViewOnly })}
                </>
              )
            }

            // Offseason Weeks 2-6: Recruiting Weeks (Week 6 = National Signing
            // Day). Unified via renderTodoList — same row chrome as in-season.
            if (week >= 2 && week <= 6) {
              const recruitingWeekNum = week - 1

              const offseasonDataYear = week === 6 ? currentDynasty.currentYear - 1 : currentDynasty.currentYear

              const playersLeavingThisYear = currentDynasty?.playersLeavingByYear?.[offseasonDataYear] || []
              const draftDeclarees = playersLeavingThisYear.filter(p => p.reason === 'Pro Draft')
              const hasDraftDeclarees = draftDeclarees.length > 0

              const userTidForDraft = getUserTeamTid(currentDynasty)
              const userAbbrForDraft = getCurrentTeamAbbr(currentDynasty)
              const draftResultsFromTid = currentDynasty?.teams?.[userTidForDraft]?.byYear?.[offseasonDataYear]?.draftResults
              const draftResultsFromLegacy = currentDynasty?.draftResultsByTeamYear?.[userAbbrForDraft]?.[offseasonDataYear]
              const draftResultsData = draftResultsFromTid || draftResultsFromLegacy || []
              const hasDraftResultsData = draftResultsData.length > 0
              const draftResultsCount = draftResultsData.length

              const userTidForCommits = getUserTeamTid(currentDynasty)
              const recruitingCommitmentsForTeamYear = getRecruitingCommitments(currentDynasty, userTidForCommits, offseasonDataYear)
              const commitmentsForWeek = recruitingCommitmentsForTeamYear[`signing_${recruitingWeekNum}`]
              const hasCommitmentsData = commitmentsForWeek !== undefined
              const commitmentsCount = commitmentsForWeek?.length || 0

              const o26Todos = []

              // Task 1: Recruiting Commitments (every recruiting week)
              if (recruitingWeekNum === 5) {
                // Signing Day variant — single "Open" button, no Yes/No
                o26Todos.push({
                  key: 'recruiting-signing-day',
                  done: hasCommitmentsData,
                  title: 'Signing Day',
                  subtitle: hasCommitmentsData
                    ? commitmentsCount > 0
                      ? `${commitmentsCount} commitment${commitmentsCount !== 1 ? 's' : ''} recorded`
                      : 'No commitments this week'
                    : 'Enter your final recruiting class',
                  onAction: () => setShowRecruitingModal(true),
                  actionLabel: hasCommitmentsData ? 'Edit' : 'Open',
                  extraTools: !hasCommitmentsData ? <SellVsSendButton onClick={() => setShowSellCalc(true)} /> : null,
                })
              } else {
                o26Todos.push({
                  key: 'recruiting-week',
                  done: hasCommitmentsData,
                  title: hasCommitmentsData ? 'Recruiting Commitments' : 'Any commitments this week?',
                  subtitle: hasCommitmentsData
                    ? commitmentsCount > 0
                      ? `${commitmentsCount} commitment${commitmentsCount !== 1 ? 's' : ''} recorded`
                      : 'No commitments this week'
                    : 'Record any recruiting commitments for this week',
                  onAction: () => setShowRecruitingModal(true),
                  actionLabel: hasCommitmentsData ? 'Edit' : 'Yes',
                  extraTools: recruitingExtraTools,
                  inlineAction: !hasCommitmentsData && !isViewOnly ? {
                    label: 'No commits',
                    onClick: handleNoCommitments,
                  } : null,
                })
              }

              // Task 2: Draft Results (Recruiting Week 1 only)
              if (recruitingWeekNum === 1) {
                const draftDone = hasDraftResultsData || !hasDraftDeclarees
                o26Todos.push({
                  key: 'draft-results',
                  done: draftDone,
                  title: 'Draft Results',
                  subtitle: !hasDraftDeclarees
                    ? 'No players declared for the draft'
                    : hasDraftResultsData
                      ? `${draftResultsCount} player${draftResultsCount !== 1 ? 's' : ''} drafted`
                      : `${draftDeclarees.length} player${draftDeclarees.length !== 1 ? 's' : ''} declared for the draft`,
                  onAction: hasDraftDeclarees ? () => setShowDraftResultsModal(true) : undefined,
                  actionLabel: hasDraftDeclarees ? (hasDraftResultsData ? 'Edit' : 'Enter') : undefined,
                })
              }

              // Signing Day–only tasks (3–7)
              if (recruitingWeekNum === 5) {
                // Transfer Destinations
                const nonTransferReasons = ['Graduating', 'Pro Draft']
                const transfersFromList = playersLeavingThisYear.filter(p =>
                  p.reason && !nonTransferReasons.includes(p.reason)
                ).map(p => ({ name: p.playerName }))
                const transfersFromPlayerRecord = (currentDynasty?.players || [])
                  .filter(p =>
                    p.leavingYear === offseasonDataYear &&
                    p.leavingReason &&
                    !nonTransferReasons.includes(p.leavingReason)
                  )
                  .map(p => ({ name: p.name }))
                const allTransfers = [...transfersFromList, ...transfersFromPlayerRecord]
                const seenNames = new Set()
                const transfers = allTransfers.filter(p => {
                  if (seenNames.has(p.name)) return false
                  seenNames.add(p.name)
                  return true
                })
                const hasTransfers = transfers.length > 0
                const transferDestinationsData = lookupByTeamYear(
                  currentDynasty?.transferDestinationsByTeamYear,
                  currentDynasty,
                  getCurrentTeamTid(currentDynasty),
                  offseasonDataYear
                )
                const hasTransferDestinationsData = Array.isArray(transferDestinationsData) && transferDestinationsData.length > 0
                const transferDestinationsCount = transferDestinationsData?.length || 0
                const transferTaskDone = hasTransferDestinationsData || !hasTransfers
                o26Todos.push({
                  key: 'transfer-destinations',
                  done: transferTaskDone,
                  title: 'Transfer Destinations',
                  subtitle: !hasTransfers
                    ? 'No outgoing transfers'
                    : hasTransferDestinationsData
                      ? `${transferDestinationsCount} transfer${transferDestinationsCount !== 1 ? 's' : ''} tracked`
                      : `Track where ${transfers.length} transfer${transfers.length !== 1 ? 's' : ''} committed`,
                  onAction: hasTransfers ? () => setShowTransferDestinationsModal(true) : undefined,
                  actionLabel: hasTransfers ? (hasTransferDestinationsData ? 'Edit' : 'Enter') : undefined,
                })

                // Recruiting Class Rank
                const classRank = lookupByTeamYear(
                  currentDynasty.recruitingClassRankByTeamYear,
                  currentDynasty,
                  getCurrentTeamTid(currentDynasty),
                  offseasonDataYear
                )
                const hasClassRank = !!classRank
                o26Todos.push({
                  key: 'class-rank',
                  done: hasClassRank,
                  title: 'Recruiting Class Rank',
                  subtitle: hasClassRank
                    ? `Ranked #${classRank} nationally`
                    : 'Enter national recruiting class ranking',
                  onAction: () => setShowRecruitingClassRankModal(true),
                  actionLabel: hasClassRank ? 'Edit' : 'Enter',
                })

                // Position Changes
                const positionChangesThisYear = currentDynasty.positionChangesByYear?.[offseasonDataYear] || []
                const hasPositionChanges = positionChangesThisYear.length > 0
                o26Todos.push({
                  key: 'position-changes',
                  done: hasPositionChanges,
                  title: 'Position Changes',
                  subtitle: hasPositionChanges
                    ? `${positionChangesThisYear.length} position change${positionChangesThisYear.length !== 1 ? 's' : ''} recorded`
                    : 'Update player positions',
                  onAction: () => setShowPositionChangesModal(true),
                  actionLabel: hasPositionChanges ? 'Edit' : 'Open',
                })

                // Recruiting Class Overalls
                const recruitTeamTid = getUserTeamTid(currentDynasty)
                const recruitingClassPlayers = (currentDynasty?.players || []).filter(p => {
                  if (!p.isRecruit || p.isPortal || p.previousTeam) return false
                  if (p.recruitYear !== offseasonDataYear) return false
                  if (!p.team) return true
                  const v = p.team
                  if (typeof v === 'number' || /^\d+$/.test(String(v))) return Number(v) === Number(recruitTeamTid)
                  const tid = getTidFromAbbr(v, currentDynasty)
                  return tid != null && Number(tid) === Number(recruitTeamTid)
                })
                const hasRecruitOverallsData = currentDynasty?.recruitOverallsByYear?.[offseasonDataYear]?.length > 0
                const recruitOverallsCount = currentDynasty?.recruitOverallsByYear?.[offseasonDataYear]?.length || 0
                if (recruitingClassPlayers.length > 0) {
                  o26Todos.push({
                    key: 'recruit-overalls',
                    done: hasRecruitOverallsData,
                    title: 'Recruiting Class Overalls',
                    subtitle: hasRecruitOverallsData
                      ? `${recruitOverallsCount} recruit overall${recruitOverallsCount !== 1 ? 's' : ''} entered`
                      : `Enter overalls for ${recruitingClassPlayers.length} recruit${recruitingClassPlayers.length !== 1 ? 's' : ''}`,
                    onAction: () => setShowRecruitOverallsModal(true),
                    actionLabel: hasRecruitOverallsData ? 'Edit' : 'Enter',
                  })
                }

                // Portal Transfer Class Assignment
                const userTidForPortal = getUserTeamTid(currentDynasty)
                const recruitingCommitmentsAll = getRecruitingCommitments(currentDynasty, userTidForPortal, offseasonDataYear)
                const portalTransfersForClass = []
                Object.values(recruitingCommitmentsAll).forEach(weekCommitments => {
                  if (Array.isArray(weekCommitments)) {
                    weekCommitments.forEach(c => {
                      const playerClass = c.class || c.year
                      if (c.isPortal && playerClass) {
                        const baseClass = playerClass.replace('RS ', '')
                        if (['Fr', 'So', 'Jr'].includes(baseClass)) {
                          portalTransfersForClass.push({ name: c.name, position: c.position, incomingClass: playerClass })
                        }
                      }
                    })
                  }
                })
                const hasPortalTransfers = portalTransfersForClass.length > 0
                const hasPortalTransferClassData = currentDynasty?.portalTransferClassByYear?.[offseasonDataYear]?.length > 0
                const portalBlocked = !hasCommitmentsData
                const portalComplete = (!hasPortalTransfers && hasCommitmentsData) || hasPortalTransferClassData
                o26Todos.push({
                  key: 'portal-transfer-class',
                  done: portalComplete,
                  title: 'Portal Transfer Class Assignment',
                  subtitle: portalBlocked
                    ? 'Complete Signing Day first'
                    : !hasPortalTransfers
                      ? 'No portal transfers to assign'
                      : hasPortalTransferClassData
                        ? `${portalTransfersForClass.length} transfer class${portalTransfersForClass.length !== 1 ? 'es' : ''} assigned`
                        : `Assign classes for ${portalTransfersForClass.length} transfer${portalTransfersForClass.length !== 1 ? 's' : ''}`,
                  onAction: !hasPortalTransfers ? undefined : () => setShowPortalTransferClassModal(true),
                  actionLabel: !hasPortalTransfers ? undefined : (portalComplete ? 'Done' : 'Open'),
                })

                // Fringe Case Class Assignment
                const teamTidF = getUserTeamTid(currentDynasty)
                const allPlayersF = currentDynasty?.players || []
                const fringeCasePlayers = allPlayersF.filter(player => {
                  if (!isPlayerOnRoster(player, teamTidF, offseasonDataYear, currentDynasty)) return false
                  const preProgressionClass = player.classByYear?.[offseasonDataYear] || player.year
                  if (!['Fr', 'So', 'Jr'].includes(preProgressionClass)) return false
                  const gamesPlayed = player.statsByYear?.[offseasonDataYear]?.gamesPlayed || 0
                  return gamesPlayed >= 5 && gamesPlayed <= 9
                })
                const hasFringeCases = fringeCasePlayers.length > 0
                const hasFringeCaseClassData = currentDynasty?.fringeCaseClassByYear?.[offseasonDataYear]?.length > 0
                const fringeBlocked = !hasCommitmentsData
                const fringeComplete = (!hasFringeCases && hasCommitmentsData) || hasFringeCaseClassData
                o26Todos.push({
                  key: 'fringe-case-class',
                  done: fringeComplete,
                  title: 'Fringe Case Class Assignment',
                  subtitle: fringeBlocked
                    ? 'Complete Signing Day first'
                    : !hasFringeCases
                      ? 'No fringe cases to resolve'
                      : hasFringeCaseClassData
                        ? `${fringeCasePlayers.length} player${fringeCasePlayers.length !== 1 ? 's' : ''} resolved`
                        : `${fringeCasePlayers.length} player${fringeCasePlayers.length !== 1 ? 's' : ''} with 5-9 games`,
                  onAction: !hasFringeCases ? undefined : () => setShowFringeCaseClassModal(true),
                  actionLabel: !hasFringeCases ? undefined : (fringeComplete ? 'Done' : 'Open'),
                })
              }

              return (
                <>
                  <h3 className="w-fit font-display font-black uppercase leading-none rounded-md px-3 py-2 mb-3 sm:mb-4" style={{ fontSize: 'clamp(1.0625rem, 1.6vw, 1.375rem)', letterSpacing: '0.04em', ...teamLabelStyle }}>
                    {recruitingWeekNum === 5 ? 'National Signing Day' : `Recruiting Week ${recruitingWeekNum} of 4`}
                  </h3>
                  {renderTodoList({ todos: o26Todos, isViewOnly })}
                </>
              )
            }

            // Offseason Week 7: Training Camp. Unified via renderTodoList.
            if (week === 7) {
              const offseasonDataYear = currentDynasty.currentYear - 1
              const previousTeamAbbr = currentDynasty.coachTeamByYear?.[offseasonDataYear]?.team
              const currentTeamAbbr = getCurrentTeamAbbr(currentDynasty)
              const switchedTeams = previousTeamAbbr && currentTeamAbbr && previousTeamAbbr !== currentTeamAbbr

              if (switchedTeams) {
                const skippedTodos = [{
                  key: 'training-skipped',
                  done: true,
                  title: 'Training Results - Skipped',
                  subtitle: 'Will enter new roster during preseason',
                }]
                return (
                  <>
                    <h3 className="w-fit font-display font-black uppercase leading-none rounded-md px-3 py-2 mb-3 sm:mb-4" style={{ fontSize: 'clamp(1.0625rem, 1.6vw, 1.375rem)', letterSpacing: '0.04em', ...teamLabelStyle }}>
                      Training Camp
                    </h3>
                    {renderTodoList({ todos: skippedTodos, isViewOnly })}
                  </>
                )
              }

              const teamAbbr = getCurrentTeamAbbr(currentDynasty)
              const teamTid = getTidFromAbbr(teamAbbr, currentDynasty)
              const playersLeavingThisYear = currentDynasty?.playersLeavingByYear?.[offseasonDataYear] || []
              const leavingPids = new Set(playersLeavingThisYear.map(p => p.pid))
              const allPlayers = currentDynasty?.players || []
              const currentYearW7 = currentDynasty.currentYear

              const matchesTeam = (value) => {
                if (value == null) return false
                if (typeof value === 'number' || /^\d+$/.test(String(value))) {
                  return Number(value) === Number(teamTid)
                }
                if (typeof value === 'string') {
                  if (value.toUpperCase() === String(teamAbbr).toUpperCase()) return true
                  const tid = getTidFromAbbr(value, currentDynasty)
                  return tid != null && Number(tid) === Number(teamTid)
                }
                return false
              }

              const returningPlayers = allPlayers.filter(p => {
                if (leavingPids.has(p.pid)) return false
                if (p.isRecruit) return false
                if (p.isHonorOnly) return false
                const wasOnTeamLastYear = isPlayerOnRoster(p, teamTid || teamAbbr, offseasonDataYear, currentDynasty)
                const isOnTeamThisYear = isPlayerOnRoster(p, teamTid || teamAbbr, currentYearW7, currentDynasty)
                return wasOnTeamLastYear && isOnTeamThisYear
              })
              const portalTransfers = allPlayers.filter(p => {
                if (leavingPids.has(p.pid)) return false
                if (p.isHonorOnly) return false
                const isPortalTransfer = (p.isPortal || p.previousTeam) && p.recruitYear === offseasonDataYear
                if (!isPortalTransfer) return false
                return isPlayerOnRoster(p, teamTid || teamAbbr, currentYearW7, currentDynasty)
              })
              const trainingPlayers = [...returningPlayers, ...portalTransfers]
              const hasTrainingResultsData = currentDynasty?.trainingResultsByYear?.[currentYearW7]?.length > 0
              const trainingResultsCount = currentDynasty?.trainingResultsByYear?.[currentYearW7]?.length || 0

              const recruitingClassPlayersW7 = allPlayers.filter(p => {
                if (!p.isRecruit || p.isPortal || p.previousTeam) return false
                if (p.recruitYear !== offseasonDataYear) return false
                if (!p.team) return true
                const v = p.team
                if (typeof v === 'number' || /^\d+$/.test(String(v))) return Number(v) === Number(teamTid)
                const tid = getTidFromAbbr(v, currentDynasty)
                return tid != null && Number(tid) === Number(teamTid)
              })
              const hasRecruitOverallsDataW7 = currentDynasty?.recruitOverallsByYear?.[offseasonDataYear]?.length > 0
              const recruitOverallsCountW7 = currentDynasty?.recruitOverallsByYear?.[offseasonDataYear]?.length || 0

              const w7Todos = [{
                key: 'training-results',
                done: hasTrainingResultsData,
                title: 'Training Results',
                subtitle: hasTrainingResultsData
                  ? `${trainingResultsCount} player overall${trainingResultsCount !== 1 ? 's' : ''} updated`
                  : `Enter new overalls for ${trainingPlayers.length} players`,
                onAction: () => setShowTrainingResultsModal(true),
                actionLabel: hasTrainingResultsData ? 'Edit' : 'Enter',
              }]

              if (recruitingClassPlayersW7.length > 0) {
                w7Todos.push({
                  key: 'recruit-overalls',
                  done: hasRecruitOverallsDataW7,
                  title: 'Recruiting Class Overalls',
                  subtitle: hasRecruitOverallsDataW7
                    ? `${recruitOverallsCountW7} recruit overall${recruitOverallsCountW7 !== 1 ? 's' : ''} entered`
                    : `Enter overalls for ${recruitingClassPlayersW7.length} recruit${recruitingClassPlayersW7.length !== 1 ? 's' : ''}`,
                  onAction: () => setShowRecruitOverallsModal(true),
                  actionLabel: hasRecruitOverallsDataW7 ? 'Edit' : 'Enter',
                })
              }

              return (
                <>
                  <h3 className="w-fit font-display font-black uppercase leading-none rounded-md px-3 py-2 mb-3 sm:mb-4" style={{ fontSize: 'clamp(1.0625rem, 1.6vw, 1.375rem)', letterSpacing: '0.04em', ...teamLabelStyle }}>
                    Training Camp
                  </h3>
                  {renderTodoList({ todos: w7Todos, isViewOnly })}
                </>
              )
            }

            // Offseason Week 8: Custom Conferences & Encourage Transfers. Unified via renderTodoList.
            if (week === 8) {
              const userTid = getUserTeamTid(currentDynasty)
              const upcomingSeasonYear = currentDynasty.currentYear
              const hasConferencesSet = currentDynasty?.customConferencesByYear?.[upcomingSeasonYear] != null
              const encourageTransfersList = getEncourageTransfers(currentDynasty, userTid, currentDynasty.currentYear)
              const hasEncourageTransfers = encourageTransfersList.length > 0 || currentDynasty?.teams?.[userTid]?.byYear?.[currentDynasty.currentYear]?.encourageTransfers != null
              const encourageTransfersCount = encourageTransfersList.length

              const w8Todos = [
                {
                  key: 'custom-conferences',
                  done: hasConferencesSet,
                  title: 'Custom Conferences',
                  subtitle: hasConferencesSet
                    ? `Conference alignment set for ${upcomingSeasonYear}`
                    : `Set conference alignment for ${upcomingSeasonYear} season`,
                  onAction: () => setShowOffseasonConferencesModal(true),
                  actionLabel: hasConferencesSet ? 'Edit' : 'Set',
                },
                {
                  key: 'encourage-transfers',
                  done: hasEncourageTransfers,
                  title: 'Encourage Transfers',
                  subtitle: hasEncourageTransfers
                    ? `${encourageTransfersCount} player${encourageTransfersCount !== 1 ? 's' : ''} encouraged to transfer`
                    : 'Mark players to encourage to transfer',
                  onAction: () => setShowEncourageTransfersModal(true),
                  actionLabel: hasEncourageTransfers ? 'Edit' : 'Enter',
                },
              ]

              return (
                <>
                  <h3 className="w-fit font-display font-black uppercase leading-none rounded-md px-3 py-2 mb-3 sm:mb-4" style={{ fontSize: 'clamp(1.0625rem, 1.6vw, 1.375rem)', letterSpacing: '0.04em', ...teamLabelStyle }}>
                    Offseason
                  </h3>
                  {renderTodoList({ todos: w8Todos, isViewOnly })}
                </>
              )
            }

            // Fallback for any other weeks
            return (
              <>
                <div className="flex items-center gap-3 mb-3 sm:mb-4">
                  <h3 className="font-display font-bold leading-none text-txt-primary" style={{ fontSize: 'clamp(1.0625rem, 1.6vw, 1.375rem)', letterSpacing: '-0.02em' }}>
                    Off-Season Week {week}
                  </h3>
                </div>
                <p className="text-sm text-txt-secondary">
                  Click "Advance Week" to continue to the next season.
                </p>
              </>
            )
          })()}
          </div>
        </div>
      ) : (
        <div
          className="card p-6 border-l-[3px]"
          style={{ borderLeftColor: 'var(--text-primary)' }}
        >
          <h3 className="text-lg font-semibold mb-4 text-txt-primary">
            Current Phase: {getPhaseDisplay(currentDynasty.currentPhase, currentDynasty.currentWeek)}
          </h3>
          <p className="text-txt-secondary">
            Click "Advance Week" in the header to progress through your dynasty.
          </p>
        </div>
      )}

          {/* Roster Section - Desktop Only (below tasks). Hidden when last
              week's recap exists; in that case Roster + Schedule fold into
              the tabbed mobile-style section below (full width, both cols). */}
          <div className={lastWeekRecapExists ? 'hidden' : 'hidden lg:flex lg:flex-col lg:flex-1 lg:min-h-0'}>
            <div className="flex flex-col flex-1 min-h-0">
              <div className="py-3 pl-3 pr-1 flex items-center justify-between flex-shrink-0" style={sectionStripStyle}>
                <div className="flex items-center gap-3">
                  <div
                    className="w-fit font-display font-black uppercase leading-none rounded-md px-3 py-1.5"
                    style={{
                      fontSize: 'clamp(1.0625rem, 1.6vw, 1.375rem)',
                      letterSpacing: '0.04em',
                      ...teamLabelStyle,
                    }}
                  >
                    <span className="tabular-nums">{currentDynasty.currentYear}</span>
                    <span className="ml-2">Roster</span>
                  </div>
                  {teamRoster.length > 0 && (
                    <span className="text-xs font-semibold uppercase tracking-wider text-txt-tertiary tabular-nums">
                      {teamRoster.length} Players
                    </span>
                  )}
                  <Link
                    to={`${pathPrefix}/team/${userTeamTid}/${currentDynasty.currentYear}?tab=roster`}
                    className="p-1.5 rounded-lg text-txt-tertiary hover:text-txt-secondary hover:bg-surface-3 transition-colors"
                    title="View full roster on team page"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </Link>
                </div>
                {/* Sort controls */}
                <div className="flex items-center gap-1">
                  {[
                    { key: 'position', label: 'POS' },
                    { key: 'overall', label: 'OVR' }
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => handleRosterSort(key)}
                      className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                        rosterSort === key
                          ? 'bg-surface-4 text-white'
                          : 'text-txt-tertiary hover:text-txt-secondary hover:bg-surface-3'
                      }`}
                    >
                      {label}
                      {rosterSort === key && (
                        <span className="ml-0.5">{rosterSortDir === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
              <div
                ref={rosterBodyRef}
                className="flex-1 min-h-[420px] overflow-y-auto"
                style={rosterMaxHeight ? { maxHeight: `${rosterMaxHeight}px` } : undefined}
              >
                {teamRoster.length > 0 ? (
                  <div className="divide-y divide-surface-4">
                    {sortRoster(teamRoster).map((player) => (
                      <div
                        key={player.pid}
                        onClick={() => navigate(`${pathPrefix}/player/${player.pid}`)}
                        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-all hover:bg-surface-3 group"
                      >
                        {/* Jersey Number */}
                        <span className="text-sm font-bold text-txt-secondary w-6 text-right">{player.jerseyNumber || '--'}</span>

                        {/* Player Image */}
                        <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-surface-4 group-hover:ring-surface-5 transition-all" style={{ backgroundColor: 'var(--surface-4)' }}>
                          {player.pictureUrl ? (
                            <img src={proxyImageUrl(player.pictureUrl, 300)} alt={player.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <svg className="w-5 h-5 text-txt-muted" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                              </svg>
                            </div>
                          )}
                        </div>

                        {/* Name & Position */}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-txt-primary truncate group-hover:text-txt-primary transition-colors">
                            {player.name}
                          </div>
                          <div className="text-xs text-txt-tertiary mt-0.5">
                            <span className="font-medium text-txt-secondary">{player.position}</span>
                            {' '}
                            <span>{player.year || '-'}</span>
                          </div>
                        </div>

                        {/* Overall Rating */}
                        <div className="text-lg font-bold text-txt-primary">{player.overall || '--'}</div>
                      </div>
                    ))}
                  </div>
                ) : isLoadingDynastyData ? (
                  <div className="text-center py-8">
                    <div className="inline-block w-6 h-6 border-2 border-surface-5 border-t-text-primary rounded-full animate-spin mb-2" />
                    <p className="text-sm text-txt-tertiary">Loading roster...</p>
                  </div>
                ) : (
                  <p className="text-sm text-txt-tertiary text-center py-8">
                    No players on roster yet
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
        {/* End Left Column */}

        {/* Right Column: Recap card when a recap exists for last week.
            Sits in the slot that Schedule normally occupies and spans
            both grid rows on desktop, so the Roster/Schedule tabs sit
            in the LEFT column below the to-dos rather than full-width
            below both columns. */}
        {lastWeekRecapExists && (
          <div className="lg:block lg:row-span-2">
            <div
              className="media-card overflow-hidden"
            >
              {/* No title bar — the recap text starts with its own H1
                  ("# 2034 Week 10 Recap") so a header here would just
                  duplicate it. The external-link affordance floats at the
                  top-right of the body, out of the way. */}
              <div className="relative px-5 py-4 max-h-[640px] overflow-y-auto">
                <Link
                  to={`${pathPrefix}/weekly-scores/${Number(currentDynasty.currentYear)}/${Number(currentDynasty.currentWeek) - 1}?tab=recap`}
                  className="absolute top-3 right-3 z-10 p-1.5 rounded-lg text-txt-tertiary hover:text-txt-secondary hover:bg-surface-3 transition-colors"
                  title="Open recap on Weekly Recap page"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </Link>
                <FormattedRecap
                  text={lastWeekRecap.text}
                  playerLinks={recapLinks}
                />
              </div>
            </div>
          </div>
        )}

        {/* Right Column: Schedule - Desktop Only — hidden when recap card replaces it */}
        <div ref={scheduleColumnRef} className={lastWeekRecapExists ? 'hidden' : 'hidden lg:block'}>
          {/* Schedule Section - Clean Redesign */}
      <div>
        {/* Schedule Header */}
        <div className="py-3 pl-3 pr-1 flex items-center justify-between" style={sectionStripStyle}>
          <div className="flex items-center gap-3">
            <div
              className="w-fit font-display font-black uppercase leading-none rounded-md px-3 py-1.5"
              style={{
                fontSize: 'clamp(1.0625rem, 1.6vw, 1.375rem)',
                letterSpacing: '0.04em',
                ...teamLabelStyle,
              }}
            >
              <span className="tabular-nums">{currentDynasty.currentYear}</span>
              <span className="ml-2">Schedule</span>
            </div>
            <Link
              to={`${pathPrefix}/team/${userTeamTid}/${currentDynasty.currentYear}?tab=schedule`}
              className="p-1.5 rounded-lg text-txt-tertiary hover:text-txt-secondary hover:bg-surface-3 transition-colors"
              title="View full schedule on team page"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </Link>
          </div>
          {!isViewOnly && (
            <button
              onClick={() => setShowScheduleModal(true)}
              className="p-2.5 rounded-xl bg-surface-3 hover:bg-surface-4/50 transition-colors text-txt-secondary hover:text-txt-primary"
              title="Edit Schedule"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          )}
        </div>

        {/* Schedule Body */}
        <div className="divide-y divide-surface-4 stagger-reveal">
          {teamSchedule && teamSchedule.length > 0 ? (
            <>
              {/* Render all weeks 0-14 (15 regular-season weeks), showing
                  bye weeks for missing entries. Conference championships
                  live in their own phase, not in the regular schedule. */}
              {Array.from({ length: 15 }, (_, weekNum) => {
                const entry = teamSchedule.find(e => Number(e.week) === weekNum)

                // Handle BYE weeks - explicit bye, missing entry, or no opponent
                const isByeWeek = !entry || entry.isBye || entry.opponent?.toUpperCase() === 'BYE' || !entry.opponent

                if (isByeWeek) {
                  return (
                    <div
                      key={weekNum}
                      className="flex items-center px-5 py-3"
                    >
                      <span className="w-8 text-xs font-medium text-txt-muted">{weekNum}</span>
                      <span className="flex-1 text-sm text-txt-muted italic">Bye Week</span>
                    </div>
                  )
                }

                // Use merged game data from getScheduleWithGameData
                const playedGame = entry.game
                const opponentColors = getOpponentColors(entry.opponent)
                const mascotName = getMascotName(entry.opponent)
                const opponentName = mascotName || getTeamNameFromAbbr(entry.opponent)
                const opponentLogo = mascotName ? getTeamLogo(mascotName, currentDynasty?.teams || currentDynasty?.customTeams) : null
                const isCurrentWeek = currentDynasty.currentPhase === 'regular_season' &&
                  weekNum === Number(currentDynasty.currentWeek) && !entry.isPlayed
                const isWin = entry.perspective?.userWon
                const isLoss = entry.perspective && !entry.perspective.userWon
                const teamPageUrl = `${pathPrefix}/team/${resolveTid(entry.opponent, currentDynasty?.teams || TEAMS)}/${currentDynasty.currentYear}`

                const renderGameRow = (isLink) => (
                  <div
                    className={`relative flex items-center py-2.5 px-4 gap-3 transition-all ${isLink ? 'hover:brightness-110' : ''}`}
                    style={{
                      borderBottom: '1px solid var(--surface-4)',
                      // Opponent-color wash — same treatment the CC + bowl rows
                      // already use, so the whole schedule reads consistently.
                      background: `linear-gradient(to right, transparent 0%, ${opponentColors.backgroundColor}99 100%)`,
                      ...(isCurrentWeek ? { boxShadow: 'inset 2px 0 0 0 var(--text-primary)' } : {})
                    }}
                  >
                    {/* Week Number — current-week marker uses an inset rail
                        on the row instead of a filled circle, so the row's
                        identity remains the opponent, not the week chip. */}
                    <span className={`w-7 text-xs font-semibold tabular-nums ${isCurrentWeek ? 'text-txt-primary' : 'text-txt-tertiary'}`}>
                      {weekNum}
                    </span>

                    {/* Team Logo — white container for contrast against
                        team-color logos (Florida orange on dark looks bad
                        without a white plate). */}
                    <div
                      className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity bg-white"
                      style={{ padding: '5px' }}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(teamPageUrl) }}
                    >
                      {opponentLogo ? (
                        <img src={opponentLogo} alt={opponentName} className="w-full h-full object-contain" />
                      ) : (
                        <span className="text-xs font-bold text-txt-primary">
                          {entry.opponent?.slice(0, 3)}
                        </span>
                      )}
                    </div>

                    {/* Opponent Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {entry.perspective?.opponentRank && (
                          <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--accent-warning)' }}>
                            #{entry.perspective.opponentRank}
                          </span>
                        )}
                        <span className="text-sm font-semibold text-txt-primary truncate">
                          {opponentName}
                        </span>
                      </div>
                      <span className="text-[10px] text-txt-tertiary">
                        {entry.location === 'away' ? 'Away' : entry.location === 'neutral' ? 'Neutral' : 'Home'}
                      </span>
                    </div>

                    {/* Score with W/L indicator */}
                    <div className="flex items-center gap-2">
                      {entry.isPlayed && (
                        <span
                          className="text-xs font-bold tabular-nums"
                          style={{ color: isWin ? 'var(--accent-success)' : 'var(--accent-error)' }}
                        >
                          {isWin ? 'W' : 'L'}
                        </span>
                      )}
                      <div className="w-14 text-right">
                        {entry.isPlayed ? (
                          <div className="flex flex-col items-end">
                            <span className="text-base font-bold tabular-nums text-txt-primary">
                              {Math.max(entry.perspective?.userScore || 0, entry.perspective?.opponentScore || 0)}-{Math.min(entry.perspective?.userScore || 0, entry.perspective?.opponentScore || 0)}
                            </span>
                            {playedGame?.overtimes && playedGame.overtimes.length > 0 && (
                              <span className="text-[10px] text-txt-tertiary">
                                {playedGame.overtimes.length > 1 ? `${playedGame.overtimes.length}OT` : 'OT'}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-txt-muted">—</span>
                        )}
                      </div>
                    </div>
                  </div>
                )

                if (playedGame?.id) {
                  return (
                    <Link
                      key={weekNum}
                      to={`${pathPrefix}/game/${playedGame.id}`}
                      className="block"
                    >
                      {renderGameRow(true)}
                    </Link>
                  )
                }

                return (
                  <div key={weekNum}>
                    {renderGameRow(false)}
                  </div>
                )
              })}

            {/* Conference Championship Game - shows when user made the championship */}
            {(() => {
              const ccDataForYear = currentDynasty.conferenceChampionshipDataByYear?.[currentDynasty.currentYear] || {}
              return ccMadeChampionship === true || ccDataForYear.madeChampionship === true
            })() && (() => {
              const ccGame = getCCGame()
              const ccDataForYear = currentDynasty.conferenceChampionshipDataByYear?.[currentDynasty.currentYear] || {}
              const ccOpponentInfo = ccGame?.perspective?.opponentTid ? getGameTeamInfo(currentDynasty?.teams || TEAMS, ccGame.perspective.opponentTid) : null
              const ccOpponentAbbr = ccOpponentInfo?.abbr || ccOpponent || ccDataForYear.opponent
              const hasOpponent = !!ccOpponentAbbr
              const ccOpponentColors = hasOpponent ? getOpponentColors(ccOpponentAbbr) : { backgroundColor: '#6b7280', textColor: '#ffffff' }
              const ccMascotFromAbbr = hasOpponent ? getMascotName(ccOpponentAbbr) : null
              const ccMascotName = ccMascotFromAbbr || (hasOpponent && getTeamLogo(ccOpponentAbbr, currentDynasty?.teams || currentDynasty?.customTeams) ? ccOpponentAbbr : null)
              const ccOpponentName = ccMascotName || (hasOpponent ? getTeamNameFromAbbr(ccOpponentAbbr) : 'TBD')
              const ccOpponentLogo = ccMascotName ? getTeamLogo(ccMascotName, currentDynasty?.teams || currentDynasty?.customTeams) : null
              const isCurrentCCWeek = currentDynasty.currentPhase === 'conference_championship' && !ccGame
              const isWin = ccGame?.perspective?.userWon
              const userScore = ccGame?.perspective?.userScore ?? ccGame?.teamScore
              const opponentScore = ccGame?.perspective?.opponentScore ?? ccGame?.opponentScore

              const ccRow = (isLink) => (
                <div
                  className={`relative flex items-center py-2.5 gap-3 transition-all duration-200 ${isLink ? 'hover:bg-surface-3 hover:z-10' : ''} ${isCurrentCCWeek ? 'ring-1 ring-inset' : ''}`}
                  style={{
                    background: `linear-gradient(to right, transparent 0%, ${ccOpponentColors.backgroundColor}99 100%)`,
                    paddingLeft: '1rem',
                    paddingRight: '1rem',
                    ...(isCurrentCCWeek ? { ringColor: 'var(--text-primary)' } : {})
                  }}
                >
                  <span className={`w-7 text-xs font-medium ${isCurrentCCWeek ? 'text-white' : 'text-txt-tertiary'}`}>
                    {isCurrentCCWeek ? (
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold" style={{ backgroundColor: 'var(--text-primary)' }}>CC</span>
                    ) : 'CC'}
                  </span>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-white shadow-sm" style={{ padding: '5px' }}>
                    {ccOpponentLogo ? <img src={ccOpponentLogo} alt={ccOpponentName} className="w-full h-full object-contain" /> : <span className="text-xs font-bold" style={{ color: ccOpponentColors.backgroundColor }}>{ccOpponentAbbr?.slice(0, 3) || '?'}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {ccGame?.opponentRank && <span className="text-xs font-bold text-amber-400">#{ccGame.opponentRank}</span>}
                      <span className="text-sm font-semibold text-txt-primary truncate">{ccOpponentName}</span>
                    </div>
                    <span className="text-[10px] text-txt-tertiary">Conf Championship</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {ccGame && (
                      <span className={`text-sm font-bold ${isWin ? 'text-emerald-400' : 'text-red-400'}`}>{isWin ? 'W' : 'L'}</span>
                    )}
                    <div className="w-14 text-right">
                      {ccGame && userScore != null ? (
                        <span className="text-base font-bold tabular-nums text-white">{Math.max(userScore || 0, opponentScore || 0)}-{Math.min(userScore || 0, opponentScore || 0)}</span>
                      ) : <span className="text-sm text-txt-muted">—</span>}
                    </div>
                  </div>
                </div>
              )

              return ccGame?.id ? (
                <Link to={`${pathPrefix}/game/${ccGame.id}`} className="block">{ccRow(true)}</Link>
              ) : <div>{ccRow(false)}</div>
            })()}

            {/* Bowl Game - shows when user has a bowl game (NOT CFP teams) */}
            {(() => {
              const userCFPFirstRoundGame = findCurrentTeamGame(currentDynasty, g => (g.isCFPFirstRound || g.gameType === GAME_TYPES.CFP_FIRST_ROUND) && isSameYear(g.year, currentDynasty.currentYear))
              if (userCFPFirstRoundGame) return null
              const userBowlGameData = findCurrentTeamGame(currentDynasty, g => g.isBowlGame && isSameYear(g.year, currentDynasty.currentYear))
              const bowlData = currentDynasty.bowlEligibilityData
              const hasBowlEligibility = bowlData?.eligible === true && bowlData?.bowlGame && bowlData?.opponent
              if (hasBowlEligibility && bowlData?.bowlGame?.startsWith('CFP')) return null
              if (!userBowlGameData && !hasBowlEligibility) return null

              const bowlOpponentInfo = userBowlGameData?.perspective?.opponentTid ? getGameTeamInfo(currentDynasty?.teams || TEAMS, userBowlGameData.perspective.opponentTid) : null
              const bowlOpponentAbbr = bowlOpponentInfo?.abbr || bowlData?.opponent
              const bowlGameName = userBowlGameData?.bowlName || bowlData?.bowlGame
              const hasOpponent = !!bowlOpponentAbbr
              const bowlOpponentColors = hasOpponent ? getOpponentColors(bowlOpponentAbbr) : { backgroundColor: '#6b7280', textColor: '#ffffff' }
              const mascotFromAbbr = hasOpponent ? getMascotName(bowlOpponentAbbr) : null
              const bowlMascotName = mascotFromAbbr || (hasOpponent && getTeamLogo(bowlOpponentAbbr, currentDynasty?.teams || currentDynasty?.customTeams) ? bowlOpponentAbbr : null)
              const bowlOpponentName = bowlMascotName || (hasOpponent ? getTeamNameFromAbbr(bowlOpponentAbbr) : 'TBD')
              const bowlOpponentLogo = bowlMascotName ? getTeamLogo(bowlMascotName, currentDynasty?.teams || currentDynasty?.customTeams) : null
              const isWin = userBowlGameData?.perspective?.userWon
              const userScore = userBowlGameData?.perspective?.userScore ?? userBowlGameData?.teamScore
              const opponentScore = userBowlGameData?.perspective?.opponentScore ?? userBowlGameData?.opponentScore

              const bowlRow = (isLink) => (
                <div
                  className={`relative flex items-center py-2.5 gap-3 transition-all duration-200 ${isLink ? 'hover:bg-surface-3 hover:z-10' : ''}`}
                  style={{
                    background: `linear-gradient(to right, transparent 0%, ${bowlOpponentColors.backgroundColor}99 100%)`,
                    paddingLeft: '1rem',
                    paddingRight: '1rem'
                  }}
                >
                  <span className="w-7 text-xs font-medium text-txt-tertiary">Bowl</span>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-white shadow-sm" style={{ padding: '5px' }}>
                    {bowlOpponentLogo ? <img src={bowlOpponentLogo} alt={bowlOpponentName} className="w-full h-full object-contain" /> : <span className="text-xs font-bold" style={{ color: bowlOpponentColors.backgroundColor }}>{bowlOpponentAbbr?.slice(0, 3) || '?'}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {userBowlGameData?.opponentRank && <span className="text-xs font-bold text-amber-400">#{userBowlGameData.opponentRank}</span>}
                      <span className="text-sm font-semibold text-txt-primary truncate">{bowlOpponentName}</span>
                    </div>
                    <span className="text-[10px] text-txt-tertiary truncate block">{bowlGameName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {userBowlGameData && (
                      <span className={`text-sm font-bold ${isWin ? 'text-emerald-400' : 'text-red-400'}`}>{isWin ? 'W' : 'L'}</span>
                    )}
                    <div className="w-14 text-right">
                      {userBowlGameData && userScore != null ? (
                        <span className="text-base font-bold tabular-nums text-white">{Math.max(userScore || 0, opponentScore || 0)}-{Math.min(userScore || 0, opponentScore || 0)}</span>
                      ) : <span className="text-sm text-txt-muted">—</span>}
                    </div>
                  </div>
                </div>
              )

              return userBowlGameData?.id ? (
                <Link to={`${pathPrefix}/game/${userBowlGameData.id}`} className="block">{bowlRow(true)}</Link>
              ) : <div>{bowlRow(false)}</div>
            })()}

            {/* CFP First Round Game */}
            {(() => {
              const cfpGame = findCurrentTeamGame(currentDynasty, g => (g.isCFPFirstRound || g.gameType === GAME_TYPES.CFP_FIRST_ROUND) && isSameYear(g.year, currentDynasty.currentYear))
              if (!cfpGame) return null
              const oppInfo = cfpGame.perspective?.opponentTid ? getGameTeamInfo(currentDynasty?.teams || TEAMS, cfpGame.perspective.opponentTid) : null
              const oppAbbr = oppInfo?.abbr
              const oppColors = oppAbbr ? getOpponentColors(oppAbbr) : { backgroundColor: '#6b7280', textColor: '#fff' }
              const oppMascot = oppAbbr ? getMascotName(oppAbbr) : null
              const oppName = oppMascot || (oppAbbr ? getTeamNameFromAbbr(oppAbbr) : 'TBD')
              const oppLogo = oppMascot ? getTeamLogo(oppMascot, currentDynasty?.teams || currentDynasty?.customTeams) : null
              const isWin = cfpGame.perspective?.userWon
              const userScore = cfpGame.perspective?.userScore ?? cfpGame.teamScore
              const oppScore = cfpGame.perspective?.opponentScore ?? cfpGame.opponentScore

              return (
                <Link to={`${pathPrefix}/game/${cfpGame.id}`} className="block">
                  <div
                    className="relative flex items-center py-2.5 gap-3 hover:bg-surface-3 hover:z-10 transition-all duration-200"
                    style={{
                      background: `linear-gradient(to right, transparent 0%, ${oppColors.backgroundColor}99 100%)`,
                      paddingLeft: '1rem',
                      paddingRight: '1rem'
                    }}
                  >
                    <span className="w-7 text-xs font-medium text-txt-tertiary">R1</span>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-white shadow-sm" style={{ padding: '5px' }}>
                      {oppLogo ? <img src={oppLogo} alt={oppName} className="w-full h-full object-contain" /> : <span className="text-xs font-bold" style={{ color: oppColors.backgroundColor }}>{oppAbbr?.slice(0, 3) || '?'}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-txt-primary truncate block">{oppName}</span>
                      <span className="text-[10px] text-txt-tertiary">CFP First Round</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${isWin ? 'text-emerald-400' : 'text-red-400'}`}>{isWin ? 'W' : 'L'}</span>
                      <span className="w-14 text-right text-base font-bold tabular-nums text-white">{Math.max(userScore || 0, oppScore || 0)}-{Math.min(userScore || 0, oppScore || 0)}</span>
                    </div>
                  </div>
                </Link>
              )
            })()}

            {/* CFP Quarterfinal Game */}
            {(() => {
              const cfpGame = findCurrentTeamGame(currentDynasty, g => (g.isCFPQuarterfinal || g.gameType === GAME_TYPES.CFP_QUARTERFINAL) && isSameYear(g.year, currentDynasty.currentYear))
              if (!cfpGame) return null
              const oppInfo = cfpGame.perspective?.opponentTid ? getGameTeamInfo(currentDynasty?.teams || TEAMS, cfpGame.perspective.opponentTid) : null
              const oppAbbr = oppInfo?.abbr
              const oppColors = oppAbbr ? getOpponentColors(oppAbbr) : { backgroundColor: '#6b7280', textColor: '#fff' }
              const oppMascot = oppAbbr ? getMascotName(oppAbbr) : null
              const oppName = oppMascot || (oppAbbr ? getTeamNameFromAbbr(oppAbbr) : 'TBD')
              const oppLogo = oppMascot ? getTeamLogo(oppMascot, currentDynasty?.teams || currentDynasty?.customTeams) : null
              const bowlName = cfpGame.bowlName || 'CFP Quarterfinal'
              const isWin = cfpGame.perspective?.userWon
              const userScore = cfpGame.perspective?.userScore ?? cfpGame.teamScore
              const oppScore = cfpGame.perspective?.opponentScore ?? cfpGame.opponentScore

              return (
                <Link to={`${pathPrefix}/game/${cfpGame.id}`} className="block">
                  <div
                    className="relative flex items-center py-2.5 gap-3 hover:bg-surface-3 hover:z-10 transition-all duration-200"
                    style={{
                      background: `linear-gradient(to right, transparent 0%, ${oppColors.backgroundColor}99 100%)`,
                      paddingLeft: '1rem',
                      paddingRight: '1rem'
                    }}
                  >
                    <span className="w-7 text-xs font-medium text-txt-tertiary">QF</span>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-white shadow-sm" style={{ padding: '5px' }}>
                      {oppLogo ? <img src={oppLogo} alt={oppName} className="w-full h-full object-contain" /> : <span className="text-xs font-bold" style={{ color: oppColors.backgroundColor }}>{oppAbbr?.slice(0, 3) || '?'}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-txt-primary truncate block">{oppName}</span>
                      <span className="text-[10px] text-txt-tertiary truncate block">{bowlName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${isWin ? 'text-emerald-400' : 'text-red-400'}`}>{isWin ? 'W' : 'L'}</span>
                      <span className="w-14 text-right text-base font-bold tabular-nums text-white">{Math.max(userScore || 0, oppScore || 0)}-{Math.min(userScore || 0, oppScore || 0)}</span>
                    </div>
                  </div>
                </Link>
              )
            })()}

            {/* CFP Semifinal Game */}
            {(() => {
              const cfpGame = findCurrentTeamGame(currentDynasty, g => g.isCFPSemifinal && isSameYear(g.year, currentDynasty.currentYear))
              if (!cfpGame) return null
              const oppInfo = cfpGame.perspective?.opponentTid ? getGameTeamInfo(currentDynasty?.teams || TEAMS, cfpGame.perspective.opponentTid) : null
              const oppAbbr = oppInfo?.abbr
              const oppColors = oppAbbr ? getOpponentColors(oppAbbr) : { backgroundColor: '#6b7280', textColor: '#fff' }
              const oppMascot = oppAbbr ? getMascotName(oppAbbr) : null
              const oppName = oppMascot || (oppAbbr ? getTeamNameFromAbbr(oppAbbr) : 'TBD')
              const oppLogo = oppMascot ? getTeamLogo(oppMascot, currentDynasty?.teams || currentDynasty?.customTeams) : null
              const bowlName = cfpGame.bowlName || 'CFP Semifinal'
              const isWin = cfpGame.perspective?.userWon
              const userScore = cfpGame.perspective?.userScore ?? cfpGame.teamScore
              const oppScore = cfpGame.perspective?.opponentScore ?? cfpGame.opponentScore

              return (
                <Link to={`${pathPrefix}/game/${cfpGame.id}`} className="block">
                  <div
                    className="relative flex items-center py-2.5 gap-3 hover:bg-surface-3 hover:z-10 transition-all duration-200"
                    style={{
                      background: `linear-gradient(to right, transparent 0%, ${oppColors.backgroundColor}99 100%)`,
                      paddingLeft: '1rem',
                      paddingRight: '1rem'
                    }}
                  >
                    <span className="w-7 text-xs font-medium text-txt-tertiary">SF</span>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-white shadow-sm" style={{ padding: '5px' }}>
                      {oppLogo ? <img src={oppLogo} alt={oppName} className="w-full h-full object-contain" /> : <span className="text-xs font-bold" style={{ color: oppColors.backgroundColor }}>{oppAbbr?.slice(0, 3) || '?'}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-txt-primary truncate block">{oppName}</span>
                      <span className="text-[10px] text-txt-tertiary truncate block">{bowlName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${isWin ? 'text-emerald-400' : 'text-red-400'}`}>{isWin ? 'W' : 'L'}</span>
                      <span className="w-14 text-right text-base font-bold tabular-nums text-white">{Math.max(userScore || 0, oppScore || 0)}-{Math.min(userScore || 0, oppScore || 0)}</span>
                    </div>
                  </div>
                </Link>
              )
            })()}

            {/* CFP Championship Game */}
            {(() => {
              const cfpGame = findCurrentTeamGame(currentDynasty, g => g.isCFPChampionship && isSameYear(g.year, currentDynasty.currentYear))
              if (!cfpGame) return null
              const oppInfo = cfpGame.perspective?.opponentTid ? getGameTeamInfo(currentDynasty?.teams || TEAMS, cfpGame.perspective.opponentTid) : null
              const oppAbbr = oppInfo?.abbr
              const oppColors = oppAbbr ? getOpponentColors(oppAbbr) : { backgroundColor: '#6b7280', textColor: '#fff' }
              const oppMascot = oppAbbr ? getMascotName(oppAbbr) : null
              const oppName = oppMascot || (oppAbbr ? getTeamNameFromAbbr(oppAbbr) : 'TBD')
              const oppLogo = oppMascot ? getTeamLogo(oppMascot, currentDynasty?.teams || currentDynasty?.customTeams) : null
              const isWin = cfpGame.perspective?.userWon
              const userScore = cfpGame.perspective?.userScore ?? cfpGame.teamScore
              const oppScore = cfpGame.perspective?.opponentScore ?? cfpGame.opponentScore

              return (
                <Link to={`${pathPrefix}/game/${cfpGame.id}`} className="block">
                  <div
                    className="relative flex items-center py-2.5 gap-3 hover:bg-surface-3 hover:z-10 transition-all duration-200"
                    style={{
                      background: `linear-gradient(to right, transparent 0%, ${oppColors.backgroundColor}99 100%)`,
                      paddingLeft: '1rem',
                      paddingRight: '1rem'
                    }}
                  >
                    <span className="w-7 text-xs font-bold text-amber-400">NC</span>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-white shadow-sm" style={{ padding: '5px' }}>
                      {oppLogo ? <img src={oppLogo} alt={oppName} className="w-full h-full object-contain" /> : <span className="text-xs font-bold" style={{ color: oppColors.backgroundColor }}>{oppAbbr?.slice(0, 3) || '?'}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-txt-primary truncate block">{oppName}</span>
                      <span className="text-[10px] text-txt-tertiary">National Championship</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${isWin ? 'text-emerald-400' : 'text-red-400'}`}>{isWin ? 'W' : 'L'}</span>
                      <span className="w-14 text-right text-base font-bold tabular-nums text-white">{Math.max(userScore || 0, oppScore || 0)}-{Math.min(userScore || 0, oppScore || 0)}</span>
                    </div>
                  </div>
                </Link>
              )
            })()}
            </>
          ) : isLoadingDynastyData ? (
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-2 border-surface-5 border-t-text-primary rounded-full animate-spin mb-4" />
            <h3 className="font-display text-lg font-medium mb-2 text-txt-primary">
              Loading Schedule...
            </h3>
          </div>
          ) : (
          <div className="text-center py-12">
            <div className="text-txt-muted mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="font-display text-lg font-medium mb-2 text-txt-primary">
              No Schedule Yet
            </h3>
            <p className="text-txt-tertiary">
              Add your season schedule to get started.
            </p>
          </div>
        )}
        </div>
      </div>

      {/* Around the Conference / Scoreboard widget. Sits below the
          schedule and surfaces other played games from the most recent
          week — feature parity with the dashboard mockup the user
          shared. Hidden when there's no week with at least 2 played
          non-user games yet. */}
      {scoreboardData.week != null && scoreboardData.games.length > 0 && (
        <div className="mt-8">
          <div className="py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--surface-4)' }}>
            <div className="flex items-center gap-3 min-w-0">
              <div className="min-w-0">
                <div className="label-xs text-txt-tertiary uppercase tracking-wider">
                  Wk {scoreboardData.week} Around the {scoreboardData.conference || 'Country'}
                </div>
                <div
                  className="font-display font-black leading-none mt-1"
                  style={{
                    fontSize: 'clamp(1.5rem, 1.9vw, 2rem)',
                    color: 'var(--text-primary)',
                    letterSpacing: '-0.01em'
                  }}
                >
                  Scoreboard
                </div>
              </div>
            </div>
            <Link
              to={`${pathPrefix}/weekly-scores?year=${currentDynasty.currentYear}&week=${scoreboardData.week}`}
              className="p-1.5 rounded-lg text-txt-tertiary hover:text-txt-secondary hover:bg-surface-3 transition-colors"
              title="View all weekly scores"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
            {scoreboardData.games.slice(0, 12).map((g) => {
              const teamsSrc = currentDynasty?.teams || currentDynasty?.customTeams || {}
              const homeTid = g.homeTeamTid != null ? Number(g.homeTeamTid) : null
              const isNeutral = g.homeTeamTid == null
              const t1 = Number(g.team1Tid)
              const t2 = Number(g.team2Tid)
              // Away on top, home on bottom (matches the WeeklyScores card convention).
              const topTid = isNeutral ? t1 : (homeTid === t1 ? t2 : t1)
              const bottomTid = isNeutral ? t2 : homeTid
              const topScore = topTid === t1 ? g.team1Score : g.team2Score
              const bottomScore = bottomTid === t1 ? g.team1Score : g.team2Score
              const topAbbr = teamsSrc[topTid]?.abbr || ''
              const bottomAbbr = teamsSrc[bottomTid]?.abbr || ''
              const topName = teamsSrc[topTid]?.name || ''
              const bottomName = teamsSrc[bottomTid]?.name || ''
              const topLogo = topName ? getTeamLogo(topName, teamsSrc) : null
              const bottomLogo = bottomName ? getTeamLogo(bottomName, teamsSrc) : null
              const topWon = topScore > bottomScore
              const bottomWon = bottomScore > topScore
              return (
                <Link
                  key={g.id}
                  to={`${pathPrefix}/game/${g.id}`}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-surface-2 hover:bg-surface-3 transition-colors border border-surface-4"
                >
                  <div className="flex flex-col gap-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-5 h-5 rounded bg-white p-0.5 flex-shrink-0">
                        {topLogo ? (
                          <img src={topLogo} alt="" className="w-full h-full object-contain" />
                        ) : null}
                      </div>
                      <span className={`text-xs font-semibold truncate ${topWon ? 'text-txt-primary' : 'text-txt-secondary'}`}>
                        {topAbbr}
                      </span>
                      <span className={`ml-auto text-sm font-bold tabular-nums ${topWon ? 'text-txt-primary' : 'text-txt-tertiary'}`}>
                        {topScore}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-5 h-5 rounded bg-white p-0.5 flex-shrink-0">
                        {bottomLogo ? (
                          <img src={bottomLogo} alt="" className="w-full h-full object-contain" />
                        ) : null}
                      </div>
                      <span className={`text-xs font-semibold truncate ${bottomWon ? 'text-txt-primary' : 'text-txt-secondary'}`}>
                        {bottomAbbr}
                      </span>
                      <span className={`ml-auto text-sm font-bold tabular-nums ${bottomWon ? 'text-txt-primary' : 'text-txt-tertiary'}`}>
                        {bottomScore}
                      </span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
          {scoreboardData.games.length > 12 && (
            <div className="mt-2 text-center">
              <Link
                to={`${pathPrefix}/weekly-scores?year=${currentDynasty.currentYear}&week=${scoreboardData.week}`}
                className="text-xs text-txt-tertiary hover:text-txt-secondary transition-colors"
              >
                View all {scoreboardData.games.length} games →
              </Link>
            </div>
          )}
        </div>
      )}
        </div>
        {/* End Right Column */}

        {/* Mobile Tabbed Section - Schedule/Roster Tabs.
            When last week's recap exists, this section ALSO renders on
            desktop (full-width across both columns), since Roster and
            Schedule have been hidden above. Matches the user's spec:
            "schedule should then group with roster in a tabbed section
            just like it automatically does on mobile". */}
        <div className={lastWeekRecapExists ? 'lg:mt-2' : 'lg:hidden'}>
          {/* Tab Buttons */}
          <div className="flex mb-4 rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--surface-4)' }}>
            <button
              onClick={() => setMobileTab('schedule')}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                mobileTab === 'schedule'
                  ? 'text-white'
                  : 'text-txt-tertiary hover:text-txt-secondary'
              }`}
              style={mobileTab === 'schedule' ? { backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' } : {}}
            >
              Schedule
            </button>
            <button
              onClick={() => setMobileTab('roster')}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                mobileTab === 'roster'
                  ? 'text-white'
                  : 'text-txt-tertiary hover:text-txt-secondary'
              }`}
              style={mobileTab === 'roster' ? { backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' } : {}}
            >
              Roster
            </button>
          </div>

          {/* Schedule Tab Content */}
          {mobileTab === 'schedule' && (
            <div className="media-card overflow-hidden">
              {/* Schedule Header */}
              <div className="px-5 py-4 flex items-center justify-between" style={sectionStripStyle}>
                <div className="flex items-center gap-3">
                  <div>
                    <h2 className="w-fit font-display font-black uppercase leading-none rounded-md px-3 py-1.5" style={{ fontSize: 'clamp(1rem, 1.6vw, 1.125rem)', letterSpacing: '0.04em', ...teamLabelStyle }}>
                      <span className="tabular-nums">{currentDynasty.currentYear}</span>
                      <span className="ml-2">Schedule</span>
                    </h2>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm font-semibold tabular-nums text-txt-primary">{wins}-{losses}</span>
                      {(confWins > 0 || confLosses > 0) && (
                        <span className="text-sm text-txt-tertiary tabular-nums">({confWins}-{confLosses} conf)</span>
                      )}
                    </div>
                  </div>
                  <Link
                    to={`${pathPrefix}/team/${userTeamTid}/${currentDynasty.currentYear}?tab=schedule`}
                    className="p-1.5 rounded-lg text-txt-tertiary hover:text-txt-secondary hover:bg-surface-3 transition-colors"
                    title="View full schedule on team page"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </Link>
                </div>
                {!isViewOnly && (
                  <button
                    onClick={() => setShowScheduleModal(true)}
                    className="p-2.5 rounded-xl bg-surface-3 hover:bg-surface-4/50 transition-colors text-txt-secondary hover:text-txt-primary"
                    title="Edit Schedule"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Schedule Games - Reuse same rendering logic */}
              <div className="divide-y divide-surface-4/30">
                {teamSchedule.length > 0 ? (
                  <>
                    {teamSchedule.map((entry, index) => {
                      const weekNum = entry.week
                      if (entry.isBye) {
                        return (
                          <div key={weekNum} className="flex items-center py-2.5 gap-3 px-4">
                            <span className="w-7 text-xs font-medium text-txt-muted">{weekNum}</span>
                            <span className="text-sm text-txt-muted italic">Bye Week</span>
                          </div>
                        )
                      }

                      const opponentColors = getOpponentColors(entry.opponent)
                      const mascotFromAbbr = getMascotName(entry.opponent)
                      const opponentName = mascotFromAbbr || getTeamNameFromAbbr(entry.opponent)
                      const opponentLogo = mascotFromAbbr ? getTeamLogo(mascotFromAbbr, currentDynasty?.teams || currentDynasty?.customTeams) : getTeamLogo(entry.opponent, currentDynasty?.teams || currentDynasty?.customTeams)
                      const playedGame = (currentDynasty.games || []).find(g => {
                        if (!isSameYear(g.year, currentDynasty.currentYear)) return false
                        if (g.week !== entry.week) return false
                        const isRegular = !g.isBowlGame && !g.isConferenceChampionship && !g.isCFPFirstRound && !g.isCFPQuarterfinal && !g.isCFPSemifinal && !g.isCFPChampionship
                        return isRegular
                      })
                      const isCurrentWeek = currentDynasty.currentWeek === entry.week && currentDynasty.currentPhase === 'regular_season'
                      const isWin = entry.perspective?.userWon
                      const teamPageUrl = `${pathPrefix}/team/${resolveTid(entry.opponent, currentDynasty?.teams || TEAMS)}/${currentDynasty.currentYear}`

                      const renderMobileGameRow = (isLink) => (
                        <div
                          className={`relative flex items-center py-2.5 px-4 gap-3 transition-all ${isLink ? 'hover:brightness-110' : ''}`}
                          style={{
                            background: `linear-gradient(to right, transparent 0%, ${opponentColors.backgroundColor}99 100%)`,
                            ...(isCurrentWeek ? { boxShadow: 'inset 2px 0 0 0 var(--text-primary)' } : {}),
                          }}
                        >
                          <span className={`w-7 text-xs font-semibold tabular-nums ${isCurrentWeek ? 'text-txt-primary' : 'text-txt-tertiary'}`}>
                            {weekNum}
                          </span>
                          <div
                            className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity bg-white"
                            style={{ padding: '5px' }}
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(teamPageUrl) }}
                          >
                            {opponentLogo ? (
                              <img src={opponentLogo} alt={opponentName} className="w-full h-full object-contain" />
                            ) : (
                              <span className="text-xs font-bold text-txt-primary">
                                {entry.opponent?.slice(0, 3)}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              {entry.perspective?.opponentRank && (
                                <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--accent-warning)' }}>
                                  #{entry.perspective.opponentRank}
                                </span>
                              )}
                              <span className="text-sm font-semibold text-txt-primary truncate">
                                {opponentName}
                              </span>
                            </div>
                            <span className="text-[10px] text-txt-tertiary">
                              {entry.location === 'away' ? 'Away' : entry.location === 'neutral' ? 'Neutral' : 'Home'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {entry.isPlayed && (
                              <span
                                className="text-xs font-bold tabular-nums"
                                style={{ color: isWin ? 'var(--accent-success)' : 'var(--accent-error)' }}
                              >
                                {isWin ? 'W' : 'L'}
                              </span>
                            )}
                            <div className="w-14 text-right">
                              {entry.isPlayed ? (
                                <span className="text-base font-bold tabular-nums text-txt-primary">
                                  {Math.max(entry.perspective?.userScore || 0, entry.perspective?.opponentScore || 0)}-{Math.min(entry.perspective?.userScore || 0, entry.perspective?.opponentScore || 0)}
                                </span>
                              ) : (
                                <span className="text-sm text-txt-muted">—</span>
                              )}
                            </div>
                          </div>
                        </div>
                      )

                      if (playedGame?.id) {
                        return (
                          <Link key={weekNum} to={`${pathPrefix}/game/${playedGame.id}`} className="block">
                            {renderMobileGameRow(true)}
                          </Link>
                        )
                      }
                      return <div key={weekNum}>{renderMobileGameRow(false)}</div>
                    })}

                    {/* Conference Championship row */}
                    {(() => {
                      const ccGame = getCCGame()
                      if (!ccGame) return null
                      const ccPerspective = getUserGamePerspective(ccGame, currentDynasty)
                      const ccOppTid = ccPerspective?.opponentTid ?? (Number(ccGame.team1Tid) === userTeamTid ? ccGame.team2Tid : ccGame.team1Tid)
                      const ccOppName = getMascotName(ccOppTid) || getTeamNameFromAbbr(ccOppTid) || 'TBD'
                      const ccOppLogo = ccOppName ? getTeamLogo(ccOppName, currentDynasty?.teams || currentDynasty?.customTeams) : null
                      const ccUserScore = ccPerspective?.userScore
                      const ccOppScore = ccPerspective?.opponentScore
                      const ccIsPlayed = ccGame.isPlayed || (ccGame.team1Score != null && ccGame.team2Score != null)
                      const ccIsWin = ccPerspective?.userWon
                      const ccRow = (isLink) => (
                        <div className={`relative flex items-center py-2.5 px-4 gap-3 transition-colors ${isLink ? 'hover:bg-surface-3' : ''}`}>
                          <span className="w-7 text-xs font-semibold text-txt-tertiary">CC</span>
                          <div className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 bg-white" style={{ padding: '5px' }}>
                            {ccOppLogo ? <img src={ccOppLogo} alt={ccOppName} className="w-full h-full object-contain" /> : <span className="text-xs font-bold text-txt-primary">{String(ccOppTid)?.slice(0, 3)}</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-semibold text-txt-primary truncate block">{ccOppName}</span>
                            <span className="text-[10px] text-txt-tertiary">Conf Championship</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {ccIsPlayed && <span className="text-xs font-bold tabular-nums" style={{ color: ccIsWin ? 'var(--accent-success)' : 'var(--accent-error)' }}>{ccIsWin ? 'W' : 'L'}</span>}
                            <div className="w-14 text-right">
                              {ccIsPlayed && ccUserScore != null ? (
                                <span className="text-base font-bold tabular-nums text-txt-primary">{Math.max(ccUserScore, ccOppScore || 0)}-{Math.min(ccUserScore, ccOppScore || 0)}</span>
                              ) : <span className="text-sm text-txt-muted">—</span>}
                            </div>
                          </div>
                        </div>
                      )
                      return ccGame.id
                        ? <Link key="ccg" to={`${pathPrefix}/game/${ccGame.id}`} className="block">{ccRow(true)}</Link>
                        : <div key="ccg">{ccRow(false)}</div>
                    })()}

                    {/* Bowl Game row */}
                    {(() => {
                      const cfpR1Game = findCurrentTeamGame(currentDynasty, g => (g.isCFPFirstRound || g.gameType === GAME_TYPES.CFP_FIRST_ROUND) && isSameYear(g.year, currentDynasty.currentYear))
                      if (cfpR1Game) return null
                      const bowlGame = findCurrentTeamGame(currentDynasty, g => g.isBowlGame && isSameYear(g.year, currentDynasty.currentYear))
                      if (!bowlGame) return null
                      const bowlPerspective = getUserGamePerspective(bowlGame, currentDynasty)
                      const bowlOppTid = bowlPerspective?.opponentTid ?? (Number(bowlGame.team1Tid) === userTeamTid ? bowlGame.team2Tid : bowlGame.team1Tid)
                      const bowlOppName = getMascotName(bowlOppTid) || getTeamNameFromAbbr(bowlOppTid) || 'TBD'
                      const bowlOppLogo = bowlOppName ? getTeamLogo(bowlOppName, currentDynasty?.teams || currentDynasty?.customTeams) : null
                      const bowlUserScore = bowlPerspective?.userScore
                      const bowlOppScore = bowlPerspective?.opponentScore
                      const bowlIsPlayed = bowlGame.isPlayed || (bowlGame.team1Score != null && bowlGame.team2Score != null)
                      const bowlIsWin = bowlPerspective?.userWon
                      const bowlRow = (isLink) => (
                        <div className={`relative flex items-center py-2.5 px-4 gap-3 transition-colors ${isLink ? 'hover:bg-surface-3' : ''}`}>
                          <span className="w-7 text-xs font-semibold text-txt-tertiary">Bowl</span>
                          <div className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 bg-white" style={{ padding: '5px' }}>
                            {bowlOppLogo ? <img src={bowlOppLogo} alt={bowlOppName} className="w-full h-full object-contain" /> : <span className="text-xs font-bold text-txt-primary">{String(bowlOppTid)?.slice(0, 3)}</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-semibold text-txt-primary truncate block">{bowlOppName}</span>
                            <span className="text-[10px] text-txt-tertiary">{bowlGame.bowlName || 'Bowl Game'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {bowlIsPlayed && <span className="text-xs font-bold tabular-nums" style={{ color: bowlIsWin ? 'var(--accent-success)' : 'var(--accent-error)' }}>{bowlIsWin ? 'W' : 'L'}</span>}
                            <div className="w-14 text-right">
                              {bowlIsPlayed && bowlUserScore != null ? (
                                <span className="text-base font-bold tabular-nums text-txt-primary">{Math.max(bowlUserScore, bowlOppScore || 0)}-{Math.min(bowlUserScore, bowlOppScore || 0)}</span>
                              ) : <span className="text-sm text-txt-muted">—</span>}
                            </div>
                          </div>
                        </div>
                      )
                      return bowlGame.id
                        ? <Link key="bowl" to={`${pathPrefix}/game/${bowlGame.id}`} className="block">{bowlRow(true)}</Link>
                        : <div key="bowl">{bowlRow(false)}</div>
                    })()}
                  </>
                ) : isLoadingDynastyData ? (
                  <div className="text-center py-12">
                    <div className="inline-block w-6 h-6 border-2 border-surface-5 border-t-text-primary rounded-full animate-spin mb-2" />
                    <p className="text-txt-tertiary">Loading schedule...</p>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-txt-tertiary">No schedule entered yet.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Roster Tab Content */}
          {mobileTab === 'roster' && (
          <div className="media-card overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--surface-4)' }}>
              <div className="flex items-center gap-3">
                <div>
                  <h2 className="w-fit font-display font-black uppercase leading-none rounded-md px-3 py-1.5" style={{ fontSize: 'clamp(1rem, 1.6vw, 1.125rem)', letterSpacing: '0.04em', ...teamLabelStyle }}>
                    <span className="tabular-nums">{currentDynasty.currentYear}</span>
                    <span className="ml-2">Roster</span>
                  </h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-semibold uppercase tracking-wider text-txt-tertiary tabular-nums">{teamRoster.length} Players</span>
                  </div>
                </div>
                <Link
                  to={`${pathPrefix}/team/${userTeamTid}/${currentDynasty.currentYear}?tab=roster`}
                  className="p-1.5 rounded-lg text-txt-tertiary hover:text-txt-secondary hover:bg-surface-3 transition-colors"
                  title="View full roster on team page"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </Link>
              </div>
              {/* Sort controls */}
              <div className="flex items-center gap-1">
                {[
                  { key: 'position', label: 'POS' },
                  { key: 'overall', label: 'OVR' }
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => handleRosterSort(key)}
                    className={`px-2 py-1 text-[10px] font-semibold uppercase tracking-wider rounded transition-colors tabular-nums ${
                      rosterSort === key
                        ? 'bg-surface-4 text-txt-primary'
                        : 'text-txt-tertiary hover:text-txt-secondary'
                    }`}
                  >
                    {label}
                    {rosterSort === key && (
                      <span className="ml-0.5">{rosterSortDir === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div className="max-h-[350px] overflow-y-auto">
              {teamRoster.length > 0 ? (
                <div className="divide-y divide-surface-4">
                  {sortRoster(teamRoster).map((player) => (
                    <div
                      key={player.pid}
                      onClick={() => navigate(`${pathPrefix}/player/${player.pid}`)}
                      className="flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-all active:bg-surface-3"
                    >
                      {/* Jersey Number */}
                      <span className="text-sm font-bold text-txt-secondary w-6 text-right">{player.jerseyNumber || '--'}</span>

                      {/* Player Image */}
                      <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-surface-4" style={{ backgroundColor: 'var(--surface-4)' }}>
                        {player.pictureUrl ? (
                          <img src={proxyImageUrl(player.pictureUrl, 300)} alt={player.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <svg className="w-4 h-4 text-txt-muted" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                            </svg>
                          </div>
                        )}
                      </div>

                      {/* Name & Position */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-txt-primary truncate">{player.name}</div>
                        <div className="text-[10px] text-txt-tertiary mt-0.5">
                          <span className="font-medium text-txt-secondary">{player.position}</span>
                          {' '}
                          <span>{player.year || '-'}</span>
                        </div>
                      </div>

                      {/* Overall Rating */}
                      <div className="text-base font-bold text-txt-primary">{player.overall || '--'}</div>
                    </div>
                  ))}
                </div>
              ) : isLoadingDynastyData ? (
                <div className="text-center py-8">
                  <div className="inline-block w-6 h-6 border-2 border-surface-5 border-t-text-primary rounded-full animate-spin mb-2" />
                  <p className="text-sm text-txt-tertiary">Loading roster...</p>
                </div>
              ) : (
                <p className="text-sm text-txt-tertiary text-center py-8">
                  No players on roster yet
                </p>
              )}
            </div>
          </div>
          )}
        </div>
      </div>
      {/* End Main Content Grid */}

      {/* Modals */}
      <ScheduleEntryModal
        isOpen={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        onSave={handleScheduleSave}
        currentYear={currentDynasty.currentYear}
        teamColors={teamColors}
      />

      <RosterEntryModal
        isOpen={showRosterModal}
        onClose={() => setShowRosterModal(false)}
        onSave={handleRosterSave}
        currentYear={currentDynasty.currentYear}
        teamColors={teamColors}
      />

      <TeamRatingsModal
        isOpen={showTeamRatingsModal}
        onClose={() => setShowTeamRatingsModal(false)}
        onSave={handleTeamRatingsSave}
        teamColors={teamColors}
        currentRatings={teamRatings}
      />

      <CoachingStaffModal
        isOpen={showCoachingStaffModal}
        onClose={() => setShowCoachingStaffModal(false)}
        onSave={handleCoachingStaffSave}
        teamColors={teamColors}
        currentStaff={teamCoachingStaff}
      />

      <NewJobEditModal
        isOpen={showNewJobEditModal}
        onClose={() => setShowNewJobEditModal(false)}
        onSave={handleNewJobSave}
        teamColors={teamColors}
        currentJobData={currentDynasty.newJobData}
      />

      {/* GameEntryModal removed - now using game pages instead */}

      <ConferenceChampionshipModal
        isOpen={showCCModal}
        onClose={() => setShowCCModal(false)}
        onSave={async (championships) => {
          console.log('[CC Sheet] onSave called with championships:', championships)
          // Store championships by year to preserve history
          const year = currentDynasty.currentYear
          console.log('[CC Sheet] Current year:', year)
          const existingByYear = currentDynasty.conferenceChampionshipsByYear || {}
          console.log('[CC Sheet] Existing by year:', existingByYear)
          console.log('[CC Sheet] Calling updateDynasty...')
          await updateDynasty(currentDynasty.id, {
            conferenceChampionships: championships, // Keep current year for display
            conferenceChampionshipsByYear: {
              ...existingByYear,
              [year]: championships
            }
          })
          console.log('[CC Sheet] updateDynasty complete, calling saveCPUConferenceChampionships...')
          // UNIFIED: Also save CPU CC games to games[] array for consistent game recap experience
          await saveCPUConferenceChampionships(currentDynasty.id, championships, year)
          console.log('[CC Sheet] saveCPUConferenceChampionships complete')
        }}
        currentYear={currentDynasty.currentYear}
        teamColors={teamColors}
      />

      {/* CC and Bowl GameEntryModals removed - now using game pages instead */}

      {/* Weekly Scores Modal — across-the-country results entry */}
      {weeklyScoresModalWeek != null && (
        <WeeklyScoresModal
          isOpen={weeklyScoresModalWeek != null}
          onClose={() => setWeeklyScoresModalWeek(null)}
          year={Number(currentDynasty.currentYear)}
          week={weeklyScoresModalWeek}
          teamColors={teamColors}
        />
      )}

      {/* Week Recap Modal — generates and saves the AI-narrated week-in-review.
          Same component handles both preseason (week 0) and in-season recaps. */}
      {recapModalContext && (
        <WeekRecapModal
          isOpen={!!recapModalContext}
          onClose={() => setRecapModalContext(null)}
          year={recapModalContext.year}
          week={recapModalContext.week}
        />
      )}

      {/* Preseason Top 25 Modal — saves to dynasty.preseasonRankingsByYear */}
      {preseasonTop25Year != null && (
        <PreseasonTop25Modal
          isOpen={preseasonTop25Year != null}
          onClose={() => setPreseasonTop25Year(null)}
          year={preseasonTop25Year}
          teamColors={teamColors}
        />
      )}

      {/* Bowl Week 1 Modal */}
      <BowlWeek1Modal
        isOpen={showBowlWeek1Modal}
        onClose={() => setShowBowlWeek1Modal(false)}
        onSave={async (bowlGames) => {
          try {
            const year = currentDynasty.currentYear
            const userTeamAbbr = getCurrentTeamAbbr(currentDynasty)

            console.log('[BowlWeek1 onSave] Received', bowlGames.length, 'bowl games from sheet')
            console.log('[BowlWeek1 onSave] Sample games:', bowlGames.slice(0, 5).map(g => ({
              bowl: g.bowlName,
              team1: g.team1,
              team2: g.team2,
              score1: g.team1Score,
              score2: g.team2Score,
              score1Type: typeof g.team1Score,
              score2Type: typeof g.team2Score
            })))

            // Helper to sanitize game data for Firestore (replace null/undefined with valid defaults)
            const sanitizeGame = (game) => ({
              bowlName: game.bowlName || '',
              team1: game.team1 || '',
              team2: game.team2 || '',
              team1Score: typeof game.team1Score === 'number' ? game.team1Score : null,
              team2Score: typeof game.team2Score === 'number' ? game.team2Score : null,
              winner: game.winner || null
            })

            // Filter games that have at least one score entered (games that were played)
            const gamesWithScores = bowlGames.filter(g =>
              g.team1Score !== null && g.team1Score !== undefined &&
              g.team2Score !== null && g.team2Score !== undefined
            )

            console.log('[BowlWeek1 onSave] Games with scores:', gamesWithScores.length)
            if (gamesWithScores.length < bowlGames.length) {
              const gamesWithoutScores = bowlGames.filter(g =>
                g.team1Score === null || g.team1Score === undefined ||
                g.team2Score === null || g.team2Score === undefined
              )
              console.log('[BowlWeek1 onSave] Games WITHOUT scores (excluded):', gamesWithoutScores.length, gamesWithoutScores.slice(0, 3).map(g => ({ bowl: g.bowlName, score1: g.team1Score, score2: g.team2Score })))
            }

            // Separate CFP First Round games from regular bowl games
            const cfpFirstRoundGames = gamesWithScores.filter(g => g.bowlName?.startsWith('CFP First Round'))
            const regularBowlGames = gamesWithScores.filter(g => !g.bowlName?.startsWith('CFP First Round'))

            // Transform CFP First Round games to unified format
            const cfpFirstRound = cfpFirstRoundGames.map(game => {
              const sanitized = sanitizeGame(game)
              // Extract seed numbers from bowl name like "CFP First Round (#5 vs #12)"
              const seedMatch = game.bowlName?.match(/#(\d+) vs #(\d+)/)
              const seed1 = seedMatch ? parseInt(seedMatch[1]) : null
              const seed2 = seedMatch ? parseInt(seedMatch[2]) : null
              return {
                seed1,
                seed2,
                team1: sanitized.team1,
                team2: sanitized.team2,
                team1Score: sanitized.team1Score,
                team2Score: sanitized.team2Score,
                winner: sanitized.winner
              }
            })

            // Sanitize regular bowl games
            const sanitizedBowlGames = regularBowlGames.map(sanitizeGame)

            console.log('[BowlWeek1 onSave] Regular bowl games to save:', sanitizedBowlGames.length)
            console.log('[BowlWeek1 onSave] CFP First Round games to save:', cfpFirstRound.length)

            // UNIFIED STORAGE: Save bowl games to games[] array only
            // saveCPUBowlGames handles user game preservation internally
            await saveCPUBowlGames(currentDynasty.id, sanitizedBowlGames, year, 'week1')

            // UNIFIED STORAGE: Save CFP First Round games to games[] array only
            // saveCFPGames handles user game preservation internally
            if (cfpFirstRound.length > 0) {
              await saveCFPGames(currentDynasty.id, cfpFirstRound, year, GAME_TYPES.CFP_FIRST_ROUND)
            }

            console.log('[BowlWeek1 onSave] Save complete')
          } catch (error) {
            console.error('Bowl Week 1 - Save failed:', error)
            throw error
          }
        }}
        currentYear={currentDynasty.currentYear}
        teamColors={teamColors}
      />

      {/* Bowl Week 2 Modal */}
      <BowlWeek2Modal
        isOpen={showBowlWeek2Modal}
        onClose={() => setShowBowlWeek2Modal(false)}
        onSave={async (bowlGames) => {
          try {
            const year = currentDynasty.currentYear
            const userTeamAbbr = getCurrentTeamAbbr(currentDynasty)

            // Helper to sanitize game data for Firestore (replace null/undefined with valid defaults)
            const sanitizeGame = (game) => ({
              bowlName: game.bowlName || '',
              team1: game.team1 || '',
              team2: game.team2 || '',
              team1Score: typeof game.team1Score === 'number' ? game.team1Score : null,
              team2Score: typeof game.team2Score === 'number' ? game.team2Score : null,
              winner: game.winner || null
            })

            // Filter games that have scores entered (games that were played)
            const gamesWithScores = bowlGames.filter(g =>
              g.team1Score !== null && g.team1Score !== undefined &&
              g.team2Score !== null && g.team2Score !== undefined
            )


            // Separate CFP Quarterfinal games from regular bowl games
            const cfpQuarterfinalGames = gamesWithScores.filter(game =>
              game.bowlName?.includes('CFP QF') || game.bowlName?.includes('CFP Quarterfinal')
            )
            const regularBowlGames = gamesWithScores.filter(game =>
              !game.bowlName?.includes('CFP QF') && !game.bowlName?.includes('CFP Quarterfinal')
            )

            // Map CFP Quarterfinal games to structured format with bowl info.
            //
            // Slot identification used to derive the bye seed by looking up
            // whatever team the AI put in column D against cfpSeedsByYear —
            // which silently broke whenever the AI hallucinated a wrong team
            // (the saved score then created a stray QF game with a fake slot
            // ID instead of updating the right shell). The bowl name in
            // column A is PROTECTED and is the only field we can trust to
            // identify the QF slot, so we use the dynasty's cfpBowlConfig
            // (which maps each bye seed 1..4 to a bowl) as the authoritative
            // bowl→bye-seed map. team1/team2 are still passed through, but
            // the bye-seed-derived slot is what saveCFPGames uses to find
            // the existing shell.
            const cfpSeeds = currentDynasty.cfpSeedsByYear?.[year] || []
            const cfpBowlCfg = currentDynasty.cfpBowlConfigByYear?.[year] || {}
            const bowlNameToByeSeed = {}
            for (const seed of [1, 2, 3, 4]) {
              const bowlForSeed = cfpBowlCfg[`seed${seed}`]
              if (bowlForSeed) bowlNameToByeSeed[bowlForSeed.toLowerCase()] = seed
            }

            const cfpQuarterfinals = cfpQuarterfinalGames.map(game => {
              const sanitized = sanitizeGame(game)
              // Extract bowl name (e.g., "Cotton Bowl" from "Cotton Bowl (CFP QF)")
              const bowlMatch = game.bowlName?.match(/^(.+?)\s*\(CFP/)
              const bowlName = bowlMatch ? bowlMatch[1].trim() : sanitized.bowlName

              // PRIMARY: bowl name → bye seed via dynasty's cfpBowlConfig.
              // Works regardless of what teams the AI wrote into B/D.
              let byeSeed = bowlName ? bowlNameToByeSeed[bowlName.toLowerCase()] : undefined

              // FALLBACK: if bowl config doesn't have this bowl, fall back to
              // the old team2 lookup. Handles dynasties where cfpBowlConfig
              // wasn't set before the QF round.
              if (!byeSeed) {
                const team2Tid = getTidFromAbbr(sanitized.team2, currentDynasty)
                const team2SeedEntry = cfpSeeds.find(s =>
                  s.tid === team2Tid || s.team === sanitized.team2
                )
                byeSeed = team2SeedEntry?.seed
              }

              return {
                bowlName,
                team1: sanitized.team1,
                team2: sanitized.team2,
                team1Score: sanitized.team1Score,
                team2Score: sanitized.team2Score,
                winner: sanitized.winner,
                seed1: byeSeed  // The bye seed (1-4) for slot identification
              }
            })

            // Sanitize regular bowl games
            const sanitizedBowlGames = regularBowlGames.map(sanitizeGame)

            // UNIFIED STORAGE: Read user's existing games from games[] array
            const existingGames = currentDynasty.games || []
            const userTeamTid = getCurrentTeamTid(currentDynasty)

            // Find user's existing Week 2 bowl game (if any) from games[]
            // Uses unified format: check if user's team is in the game via perspective
            const userExistingBowlGame = existingGames.find(g =>
              g && g.isBowlGame && g.bowlWeek === 'week2' && Number(g.year) === Number(year) &&
              (isTeamInGame(g, userTeamTid) || g.team1 === userTeamAbbr || g.team2 === userTeamAbbr)
            )
            // Check if user's game is already in the new data from the sheet.
            // Tid-first match — sheet rows now carry tids (pass 2 fix);
            // abbr fallback only for legacy sheets.
            const userIsInSheetGame = (g) => {
              if (!g) return false
              if (userTeamTid != null && (Number(g.team1Tid) === Number(userTeamTid) || Number(g.team2Tid) === Number(userTeamTid))) return true
              return g.team1 === userTeamAbbr || g.team2 === userTeamAbbr
            }
            const userGameInSheet = sanitizedBowlGames.some(userIsInSheetGame)
            // Merge: keep user's game if it exists and wasn't in the sheet
            const mergedBowlGames = userExistingBowlGame && !userGameInSheet
              ? [...sanitizedBowlGames, userExistingBowlGame]
              : sanitizedBowlGames

            // Find user's existing CFP Quarterfinal game (if any) from games[]
            // Uses unified format: check if user's team is in the game via perspective
            const userExistingCFPGame = existingGames.find(g =>
              g && (g.gameType === GAME_TYPES.CFP_QUARTERFINAL || g.isCFPQuarterfinal) &&
              Number(g.year) === Number(year) &&
              (isTeamInGame(g, userTeamTid) || g.team1 === userTeamAbbr || g.team2 === userTeamAbbr)
            )
            // Same tid-first pattern for CFP quarterfinal sheet matching.
            const userCFPGameInSheet = cfpQuarterfinals.some(userIsInSheetGame)
            // Merge: keep user's CFP game if it exists and wasn't in the sheet
            const mergedCFPQuarterfinals = userExistingCFPGame && !userCFPGameInSheet
              ? [...cfpQuarterfinals, userExistingCFPGame]
              : cfpQuarterfinals

            // UNIFIED STORAGE: Save bowl games to games[] array only
            await saveCPUBowlGames(currentDynasty.id, mergedBowlGames, year, 'week2')

            // UNIFIED STORAGE: Save CFP Quarterfinal games to games[] array only
            if (mergedCFPQuarterfinals.length > 0) {
              await saveCFPGames(currentDynasty.id, mergedCFPQuarterfinals, year, GAME_TYPES.CFP_QUARTERFINAL)
            }
          } catch (error) {
            console.error('Bowl Week 2 - Save failed:', error)
            throw error
          }
        }}
        currentYear={currentDynasty.currentYear}
        teamColors={teamColors}
      />

      {/* CFP Seeds Modal */}
      <CFPSeedsModal
        isOpen={showCFPSeedsModal}
        onClose={() => setShowCFPSeedsModal(false)}
        onSave={async (seeds, bowlConfig) => {
          const year = currentDynasty.currentYear
          const existingByYear = currentDynasty.cfpSeedsByYear || {}

          // Convert seeds array to tid-based format: { 1: tid, 2: tid, ... }
          // seeds comes in as: [{ seed: 1, team: 'OSU' }, { seed: 2, team: 'MICH' }, ...]
          const seedsWithTid = {}
          for (const entry of seeds) {
            if (entry.seed && entry.team) {
              const tid = getTidFromAbbr(entry.team, currentDynasty)
              if (tid) {
                seedsWithTid[entry.seed] = tid
              }
            }
          }

          // Create/update all 11 CFP game shells with bowl configuration
          const existingGames = currentDynasty.games || []
          const updatedGames = createOrUpdateCFPGameShells(existingGames, seedsWithTid, year, bowlConfig)

          // Convert to tid-only format (no abbreviations stored)
          const seedsTidOnly = seeds.map(s => ({
            seed: s.seed,
            tid: s.tid || getTidFromAbbr(s.team, currentDynasty) // Prefer existing tid, fallback for legacy data
          })).filter(s => s.tid) // Only include if tid resolved

          const metadataUpdates = {
            cfpSeedsByYear: {
              ...existingByYear,
              [year]: seedsTidOnly // tid-only format for teambuilder support
            },
            cfpSeedsByYearTid: {
              ...(currentDynasty.cfpSeedsByYearTid || {}),
              [year]: seedsWithTid // New tid-based format
            },
            cfpBowlConfigByYear: {
              ...(currentDynasty.cfpBowlConfigByYear || {}),
              [year]: bowlConfig // Store bowl configuration per year
            },
          }

          // Cloud-storage fast path. Saving the FULL games array via
          // updateDynasty routes through saveGamesToSubcollection with
          // deleteOrphans=true — that does a full read of every game doc
          // plus a re-write of every game in the dynasty (1000+ writes
          // on long-running dynasties). Reported by ALABAMA PRINCE
          // (2026-05-13): "Taking forever to save and the webpage is
          // not responding... fail to set the seeding."
          //
          // Same shape as the saveWeeklyScores fast path: write only the
          // ~11 CFP shells via saveWeeklyGamesChanges, then send the
          // metadata + local-state-sync via updateDynasty with
          // skipGamesSubcollection so the slow full-rewrite doesn't fire.
          // The shells we save are filtered out of updatedGames by their
          // cfpSlot field (set by createOrUpdateCFPGameShells).
          if (currentDynasty.storageType === 'cloud') {
            try {
              const cfpShells = updatedGames.filter(g => g?.cfpSlot && Number(g.year) === Number(year))
              await saveWeeklyGamesChanges(currentDynasty.id, cfpShells, [])
              await updateDynasty(currentDynasty.id, {
                ...metadataUpdates,
                games: updatedGames, // local-state sync only — won't re-write Firestore
              }, { skipGamesSubcollection: true })
              return
            } catch (err) {
              console.error('[CFP seeds] fast-path save failed, falling back to full updateDynasty:', err)
              // Fall through to legacy path below.
            }
          }

          // Legacy path — local storage, OR fast-path failure on cloud.
          await updateDynasty(currentDynasty.id, {
            ...metadataUpdates,
            games: updatedGames
          })
        }}
        currentYear={currentDynasty.currentYear}
        teamColors={teamColors}
      />

      {/* CFP First Round Modal */}
      <CFPFirstRoundModal
        isOpen={showCFPFirstRoundModal}
        onClose={() => setShowCFPFirstRoundModal(false)}
        onSave={async (games) => {
          const year = currentDynasty.currentYear

          // Transform games from sheet format to unified format
          // Sheet has: game, higherSeed, lowerSeed, higherSeedScore, lowerSeedScore
          // We need: seed1, seed2, team1, team2, team1Score, team2Score, winner
          // Higher seed (lower number) = home team (team1), Lower seed = away team (team2)
          const transformedGames = games.map(game => {
            // Extract seed numbers from game name like "Game 1 (5 vs 12)"
            const seedMatch = game.game?.match(/\((\d+) vs (\d+)\)/)
            const seed1 = seedMatch ? parseInt(seedMatch[1]) : null
            const seed2 = seedMatch ? parseInt(seedMatch[2]) : null
            const team1Score = game.higherSeedScore ?? game.team1Score ?? null
            const team2Score = game.lowerSeedScore ?? game.team2Score ?? null
            const team1 = game.higherSeed || game.team1 || ''
            const team2 = game.lowerSeed || game.team2 || ''
            return {
              seed1,
              seed2,
              team1,
              team2,
              team1Score,
              team2Score,
              winner: game.winner || (team1Score !== null && team2Score !== null
                ? (parseInt(team1Score) > parseInt(team2Score) ? team1 : team2)
                : null)
            }
          }).filter(g => g.team1 && g.team2) // Only include games with teams

          // Use unified saveCFPGames - it handles user game preservation internally
          await saveCFPGames(currentDynasty.id, transformedGames, year, GAME_TYPES.CFP_FIRST_ROUND)
        }}
        currentYear={currentDynasty.currentYear}
        teamColors={teamColors}
      />

      {/* CFP Quarterfinals Modal (Week 3) */}
      <CFPQuarterfinalsModal
        isOpen={showCFPQuarterfinalsModal}
        onClose={() => setShowCFPQuarterfinalsModal(false)}
        onSave={async (cfpGames) => {
          const year = currentDynasty.currentYear

          // Transform games to unified format with bowlName
          const transformedGames = cfpGames.map(game => ({
            team1: game.team1,
            team2: game.team2,
            team1Score: game.team1Score,
            team2Score: game.team2Score,
            winner: game.winner || (game.team1Score !== null && game.team2Score !== null
              ? (parseInt(game.team1Score) > parseInt(game.team2Score) ? game.team1 : game.team2)
              : null),
            bowlName: game.bowlName || game.bowl
          })).filter(g => g.team1 && g.team2)

          // Use unified saveCFPGames - it handles user game preservation internally
          await saveCFPGames(currentDynasty.id, transformedGames, year, GAME_TYPES.CFP_QUARTERFINAL)
        }}
        currentYear={currentDynasty.currentYear}
        teamColors={teamColors}
      />

      {/* CFP Semifinals Modal (Week 4) */}
      <CFPSemifinalsModal
        isOpen={showCFPSemifinalsModal}
        onClose={() => setShowCFPSemifinalsModal(false)}
        userTeamAbbr={getCurrentTeamAbbr(currentDynasty)}
        onSave={async (cfpGames) => {
          const year = currentDynasty.currentYear

          // Transform games to unified format with bowlName
          const transformedGames = cfpGames.map(game => ({
            team1: game.team1,
            team2: game.team2,
            team1Score: game.team1Score,
            team2Score: game.team2Score,
            winner: game.winner || (game.team1Score !== null && game.team2Score !== null
              ? (parseInt(game.team1Score) > parseInt(game.team2Score) ? game.team1 : game.team2)
              : null),
            bowlName: game.bowlName || game.bowl
          })).filter(g => g.team1 && g.team2)

          // Use unified saveCFPGames - it handles user game preservation internally
          await saveCFPGames(currentDynasty.id, transformedGames, year, GAME_TYPES.CFP_SEMIFINAL)
        }}
        currentYear={currentDynasty.currentYear}
        teamColors={teamColors}
      />

      {/* CFP Championship Modal (Week 5) */}
      <CFPChampionshipModal
        isOpen={showCFPChampionshipModal}
        onClose={() => setShowCFPChampionshipModal(false)}
        onSave={async (cfpGames) => {
          const year = currentDynasty.currentYear

          // Transform games to unified format
          const transformedGames = cfpGames.map(game => ({
            team1: game.team1,
            team2: game.team2,
            team1Score: game.team1Score,
            team2Score: game.team2Score,
            winner: game.winner || (game.team1Score !== null && game.team2Score !== null
              ? (parseInt(game.team1Score) > parseInt(game.team2Score) ? game.team1 : game.team2)
              : null),
            bowlName: game.bowlName || 'National Championship'
          })).filter(g => g.team1 && g.team2)

          // Use unified saveCFPGames - it handles user game preservation internally
          await saveCFPGames(currentDynasty.id, transformedGames, year, GAME_TYPES.CFP_CHAMPIONSHIP)
        }}
        currentYear={currentDynasty.currentYear}
        teamColors={teamColors}
      />

      {/* Stats Entry Modal (End of Season Recap) */}
      <StatsEntryModal
        isOpen={showStatsEntryModal}
        onClose={() => setShowStatsEntryModal(false)}
        onSave={async (stats) => {
          // Use String year key for consistency with DetailedStatsEntryModal
          const year = String(currentDynasty.currentYear)
          console.log('[StatsEntryModal onSave] Saving stats for year:', year)
          console.log('[StatsEntryModal onSave] Stats from sheet:', stats.length, 'entries')

          let matchedCount = 0
          let unmatchedCount = 0

          // Update each player's statsByYear with gamesPlayed/snapsPlayed
          const updatedPlayers = (currentDynasty.players || []).map(player => {
            // Find this player's stats in the returned array
            // Use Number() for PID comparison to handle type differences (string vs number)
            const playerStats = stats.find(s =>
              (s.pid && player.pid && Number(s.pid) === Number(player.pid)) ||
              (s.name && player.name && s.name.toLowerCase().trim() === player.name.toLowerCase().trim())
            )

            if (!playerStats) {
              unmatchedCount++
              return player
            }

            matchedCount++
            const existingStatsByYear = { ...(player.statsByYear || {}) }
            // Check both string and number keys for existing stats
            const existingYearStats = existingStatsByYear[year] || existingStatsByYear[Number(year)] || {}
            // Per readStatsFromSheet: gamesPlayed / snapsPlayed are
            // `null` when the sheet row was BLANK (user didn't fill
            // that cell). Treat blank as "preserve existing" instead
            // of "wipe to 0" — round-trips that don't touch a row
            // shouldn't destroy the saved value, and not every category
            // screenshot the AI receives has both columns visible.
            existingStatsByYear[year] = {
              ...existingYearStats,
              gamesPlayed: playerStats.gamesPlayed != null
                ? playerStats.gamesPlayed
                : existingYearStats.gamesPlayed,
              snapsPlayed: playerStats.snapsPlayed != null
                ? playerStats.snapsPlayed
                : existingYearStats.snapsPlayed,
            }

            return { ...player, statsByYear: existingStatsByYear }
          })

          console.log('[StatsEntryModal onSave] Matched:', matchedCount, 'Unmatched:', unmatchedCount)

          // Mark GP/Snaps as completed for this year
          const existingGpSnapsCompleted = currentDynasty.gpSnapsCompletedByYear || {}
          await updateDynasty(currentDynasty.id, {
            players: updatedPlayers,
            gpSnapsCompletedByYear: {
              ...existingGpSnapsCompleted,
              [year]: true
            }
          })
        }}
        currentYear={currentDynasty.currentYear}
        teamColors={teamColors}
      />

      {/* Detailed Stats Entry Modal (End of Season Recap) */}
      <DetailedStatsEntryModal
        isOpen={showDetailedStatsModal}
        onClose={() => setShowDetailedStatsModal(false)}
        onSave={async (detailedStats) => {
          const year = String(currentDynasty.currentYear)

          // Category mapping from sheet names to internal names
          const categoryMapping = {
            'Passing': 'passing', 'Rushing': 'rushing', 'Receiving': 'receiving',
            'Blocking': 'blocking', 'Defensive': 'defense', 'Kicking': 'kicking',
            'Punting': 'punting', 'Kick Return': 'kickReturn', 'Punt Return': 'puntReturn'
          }

          // Mapping from sheet column names to internal stat keys.
          // Every column in DETAILED_STATS_TABS (sheetsService.js) MUST
          // appear here, otherwise convertToInternal falls back to the
          // literal column-name string as the key — silently storing
          // user-entered data under a key the app never reads.
          const SHEET_TO_INTERNAL = {
            passing: {
              Completions: 'cmp', Attempts: 'att', Yards: 'yds', Touchdowns: 'td',
              Interceptions: 'int', 'Passing Long': 'lng', 'Sacks Taken': 'sacks',
              'Net Yards/Attempt': 'nyPerAtt', 'Adjusted Net Yards/Attempt': 'adjNyPerAtt'
            },
            rushing: {
              Carries: 'car', Yards: 'yds', Touchdowns: 'td', 'Rushing Long': 'lng',
              Fumbles: 'fum', 'Broken Tackles': 'bt', 'Yards After Contact': 'yac',
              '20+ Yard Runs': 'twentyPlus'
            },
            receiving: {
              Receptions: 'rec', Yards: 'yds', Touchdowns: 'td', 'Receiving Long': 'lng',
              Drops: 'drops', 'Yards After Catch': 'rac'
            },
            blocking: {
              'Sacks Allowed': 'sacksAllowed', Pancakes: 'pancakes'
            },
            defense: {
              'Solo Tackles': 'soloTkl', 'Assisted Tackles': 'astTkl', 'Tackles for Loss': 'tfl',
              Sacks: 'sacks', Interceptions: 'int', 'INT Return Yards': 'intYds',
              'INT Long': 'intLng',
              Deflections: 'pd', 'Catches Allowed': 'catchesAllowed',
              'Forced Fumbles': 'ff', 'Fumble Recoveries': 'fr',
              'Fumble Return Yards': 'fumbleYds',
              Blocks: 'blocks', Safeties: 'safeties',
              'Defensive TDs': 'td'
            },
            kicking: {
              'FG Made': 'fgm', 'FG Attempted': 'fga', 'FG Long': 'lng',
              'XP Made': 'xpm', 'XP Attempted': 'xpa', Kickoffs: 'kickoffs', Touchbacks: 'touchbacks',
              'FG Blocked': 'fgb', 'XP Blocked': 'xpb',
              'FG Made (0-29)': 'fgm29', 'FG Att (0-29)': 'fga29',
              'FG Made (30-39)': 'fgm39', 'FG Att (30-39)': 'fga39',
              'FG Made (40-49)': 'fgm49', 'FG Att (40-49)': 'fga49',
              'FG Made (50+)': 'fgm50', 'FG Att (50+)': 'fga50'
            },
            punting: {
              Punts: 'punts', 'Punting Yards': 'yds', 'Net Punting Yards': 'netYds',
              'Punts Inside 20': 'in20', 'Punt Long': 'lng', Touchbacks: 'tb',
              'Punts Blocked': 'block'
            },
            kickReturn: {
              'Kickoff Returns': 'ret', 'KR Yardage': 'yds', 'KR Touchdowns': 'td', 'KR Long': 'lng'
            },
            puntReturn: {
              'Punt Returns': 'ret', 'PR Yardage': 'yds', 'PR Touchdowns': 'td', 'PR Long': 'lng'
            }
          }

          // Convert sheet format to internal format, skipping null values
          const convertToInternal = (statsOnly, categoryName) => {
            const mapping = SHEET_TO_INTERNAL[categoryName] || {}
            const converted = {}
            Object.entries(statsOnly).forEach(([key, value]) => {
              // Skip null/undefined - don't overwrite existing stats
              if (value === null || value === undefined) return
              const internalKey = mapping[key] || key
              const numValue = typeof value === 'string' ? parseFloat(value) : value
              if (!isNaN(numValue)) {
                converted[internalKey] = numValue
              }
            })
            return converted
          }

          // Build a map of player stats by name
          const playerStatsMap = new Map()
          Object.entries(detailedStats).forEach(([categoryName, players]) => {
            const internalCat = categoryMapping[categoryName] || categoryName.toLowerCase()
            if (Array.isArray(players)) {
              players.forEach(playerData => {
                if (!playerData.name) return
                const key = playerData.name.toLowerCase().trim()
                if (!playerStatsMap.has(key)) {
                  playerStatsMap.set(key, {})
                }
                // Copy stats without name/pid and convert to internal format
                const statsOnly = { ...playerData }
                delete statsOnly.name
                delete statsOnly.pid
                const convertedStats = convertToInternal(statsOnly, internalCat)
                // Only add if there are actual stats (not all null/empty)
                if (Object.keys(convertedStats).length > 0) {
                  playerStatsMap.get(key)[internalCat] = convertedStats
                }
              })
            }
          })

          // Update each player's statsByYear with DEEP merge.
          // Inverted from the previous .map(allPlayers): on big rosters
          // (5000+ records, only ~100 in the sheet) we were paying for
          // thousands of no-op iterations + the full array reallocation.
          // Now: build a name→index lookup once, shallow-clone the array,
          // and walk only the sheet entries to mutate the matched
          // indexes in place. O(N + sheetPlayers) vs the old
          // O(N) iteration cost per click.
          const sourcePlayers = currentDynasty.players || []
          const indexByName = new Map()
          for (let i = 0; i < sourcePlayers.length; i++) {
            const k = sourcePlayers[i].name?.toLowerCase().trim()
            if (k && !indexByName.has(k)) indexByName.set(k, i)
          }
          const updatedPlayers = sourcePlayers.slice()
          for (const [playerNameKey, detailedPlayerStats] of playerStatsMap) {
            if (!detailedPlayerStats || Object.keys(detailedPlayerStats).length === 0) continue
            const idx = indexByName.get(playerNameKey)
            if (idx == null) continue
            const player = updatedPlayers[idx]
            const existingStatsByYear = player.statsByYear || {}
            // Read under either key shape, but write only the string form so we
            // don't leave stale numeric-keyed entries behind.
            const existingYearStats = existingStatsByYear[year] || existingStatsByYear[Number(year)] || {}

            const mergedYearStats = { ...existingYearStats }
            Object.entries(detailedPlayerStats).forEach(([category, newCategoryStats]) => {
              const existingCategoryStats = existingYearStats[category] || {}
              mergedYearStats[category] = {
                ...existingCategoryStats,
                ...newCategoryStats
              }
            })

            const nextStatsByYear = { ...existingStatsByYear }
            // Remove any numeric-keyed duplicate for this season before writing the string key
            if (Number(year) !== year && nextStatsByYear[Number(year)] !== undefined) {
              delete nextStatsByYear[Number(year)]
            }
            if (String(year) !== year && nextStatsByYear[String(year)] !== undefined) {
              delete nextStatsByYear[String(year)]
            }
            nextStatsByYear[year] = mergedYearStats

            updatedPlayers[idx] = {
              ...player,
              statsByYear: nextStatsByYear
            }
          }

          // Mark Detailed Stats as completed for this year
          const existingDetailedStatsCompleted = currentDynasty.detailedStatsCompletedByYear || {}
          await updateDynasty(currentDynasty.id, {
            players: updatedPlayers,
            detailedStatsCompletedByYear: {
              ...existingDetailedStatsCompleted,
              [year]: true
            }
          })
        }}
        currentYear={currentDynasty.currentYear}
        teamColors={teamColors}
      />

      {/* Conference Standings Entry Modal (End of Season Recap) */}
      <ConferenceStandingsModal
        isOpen={showConferenceStandingsModal}
        onClose={() => setShowConferenceStandingsModal(false)}
        onSave={async (standings) => {
          const year = currentDynasty.currentYear
          const existingByYear = currentDynasty.conferenceStandingsByYear || {}

          // Debug log incoming standings
          console.log('[ConferenceStandings] Saving standings for year:', year)
          console.log('[ConferenceStandings] Conferences:', Object.keys(standings))
          console.log('[ConferenceStandings] Total teams:', Object.values(standings).flat().length)

          // Build team record updates from standings
          // This ensures all teams have their records stored for the year
          const teamRecordUpdates = {}
          const teamsUpdates = {}

          Object.entries(standings).forEach(([conference, teams]) => {
            teams.forEach(teamData => {
              const abbr = teamData.team
              const tid = getTidFromAbbr(abbr, currentDynasty)
              const record = { wins: teamData.wins, losses: teamData.losses }

              // Update legacy structure
              if (!teamRecordUpdates[abbr]) {
                teamRecordUpdates[abbr] = {}
              }
              teamRecordUpdates[abbr][year] = record

              // Update tid-based structure if tid found
              if (tid) {
                if (!teamsUpdates[tid]) {
                  teamsUpdates[tid] = { byYear: {} }
                }
                teamsUpdates[tid].byYear[year] = { record }
              }

              console.log(`[ConferenceStandings] ${abbr} (tid:${tid}): ${record.wins}-${record.losses}`)
            })
          })

          // Merge with existing team records
          const existingTeamRecords = currentDynasty.teamRecordsByTeamYear || {}
          const mergedTeamRecords = { ...existingTeamRecords }
          Object.entries(teamRecordUpdates).forEach(([abbr, yearRecords]) => {
            mergedTeamRecords[abbr] = { ...(mergedTeamRecords[abbr] || {}), ...yearRecords }
          })

          // Merge with existing teams data
          const existingTeams = currentDynasty.teams || {}
          const mergedTeams = { ...existingTeams }
          Object.entries(teamsUpdates).forEach(([tid, data]) => {
            if (!mergedTeams[tid]) mergedTeams[tid] = {}
            if (!mergedTeams[tid].byYear) mergedTeams[tid].byYear = {}
            mergedTeams[tid].byYear[year] = {
              ...(mergedTeams[tid].byYear[year] || {}),
              ...data.byYear[year]
            }
          })

          console.log('[ConferenceStandings] Saving to Firestore with team records')

          await updateDynasty(currentDynasty.id, {
            conferenceStandingsByYear: {
              ...existingByYear,
              [year]: standings
            },
            teamRecordsByTeamYear: mergedTeamRecords,
            teams: mergedTeams
          })

          console.log('[ConferenceStandings] Save complete')
        }}
        currentYear={currentDynasty.currentYear}
        teamColors={teamColors}
      />

      {/* Final Polls Entry Modal (End of Season Recap) */}
      <FinalPollsModal
        isOpen={showFinalPollsModal}
        onClose={() => setShowFinalPollsModal(false)}
        onSave={async (polls) => {
          const year = currentDynasty.currentYear
          const yearKey = String(year)
          const existingByYear = currentDynasty.finalPollsByYear || {}

          // Mirror the saved media poll into each ranked team's
          // rankByWeek[105] entry — that's the per-team-per-week
          // store the Top 25 page + Edit-Rankings sheet read from.
          // Clearing semantics: any team that USED to be in the
          // prior media poll but isn't anymore gets its
          // rankByWeek[105] entry removed too, so removing a team
          // from the poll also drops them out of the Final column
          // on the rankings sheet.
          const oldMedia = existingByYear[year]?.media
            || existingByYear[yearKey]?.media
            || []
          const oldTids = new Set(
            (Array.isArray(oldMedia) ? oldMedia : [])
              .map(e => e?.tid != null ? Number(e.tid) : null)
              .filter(t => t != null)
          )
          const newTids = new Set()
          const teamsCopy = { ...(currentDynasty.teams || {}) }
          const writeRank = (tid, rank) => {
            if (tid == null) return
            const tidKey = String(tid)
            const team = teamsCopy[tidKey] || teamsCopy[tid] || {}
            const byYear = { ...(team.byYear || {}) }
            const yearEntry = { ...(byYear[yearKey] || byYear[year] || {}) }
            const rankByWeek = { ...(yearEntry.rankByWeek || {}) }
            if (rank == null) {
              delete rankByWeek[105]
              delete rankByWeek['105']
            } else {
              rankByWeek[105] = rank
            }
            yearEntry.rankByWeek = rankByWeek
            byYear[yearKey] = yearEntry
            teamsCopy[tidKey] = { ...team, byYear }
          }
          const newMedia = polls?.media
          if (Array.isArray(newMedia)) {
            for (const e of newMedia) {
              if (!e || typeof e.rank !== 'number') continue
              if (e.tid == null) continue
              const tidNum = Number(e.tid)
              writeRank(tidNum, e.rank)
              newTids.add(tidNum)
            }
          }
          // Clear rankByWeek[105] for any tid that was in the OLD
          // media poll but isn't in the new one.
          for (const oldTid of oldTids) {
            if (!newTids.has(oldTid)) writeRank(oldTid, null)
          }

          await updateDynasty(currentDynasty.id, {
            finalPollsByYear: {
              ...existingByYear,
              [year]: polls
            },
            teams: teamsCopy,
          })
        }}
        currentYear={currentDynasty.currentYear}
        teamColors={teamColors}
      />

      {/* Team Stats Entry Modal (End of Season Recap) */}
      <TeamStatsModal
        isOpen={showTeamStatsModal}
        onClose={() => setShowTeamStatsModal(false)}
        onSave={async (stats) => {
          const year = currentDynasty.currentYear
          const existingByYear = currentDynasty.teamStatsByYear || {}
          await updateDynasty(currentDynasty.id, {
            teamStatsByYear: {
              ...existingByYear,
              [year]: stats
            }
          })
        }}
        currentYear={currentDynasty.currentYear}
        teamName={currentDynasty.teamName}
        teamColors={teamColors}
        aggregatedStats={aggregatedTeamStats}
      />

      {/* Awards Entry Modal (End of Season Recap) */}
      <AwardsModal
        isOpen={showAwardsModal}
        onClose={() => setShowAwardsModal(false)}
        onSave={handleAwardsSave}
        currentYear={currentDynasty.currentYear}
        teamColors={teamColors}
      />

      {/* All-Americans Entry Modal (End of Season Recap) */}
      <AllAmericansModal
        isOpen={showAllAmericansModal}
        onClose={() => setShowAllAmericansModal(false)}
        onSave={handleAllAmericansSave}
        currentYear={currentDynasty.currentYear}
        teamColors={teamColors}
      />

      {/* All-Conference Entry Modal (End of Season Recap) */}
      <AllConferenceModal
        isOpen={showAllConferenceModal}
        onClose={() => setShowAllConferenceModal(false)}
        onSave={handleAllConferenceSave}
        currentYear={currentDynasty.currentYear}
        teamColors={teamColors}
      />

      {/* Player Match Confirmation Modal (for potential transfers) */}
      <PlayerMatchConfirmModal
        isOpen={showPlayerMatchConfirm}
        confirmation={playerMatchConfirmation}
        dynastyId={currentDynasty?.id}
        teamColors={teamColors}
        onConfirm={handlePlayerMatchConfirm}
        onCancel={handlePlayerMatchCancel}
      />

      {/* Returning Player Confirmation Modal (for recruiting) */}
      <ReturningPlayerConfirmModal
        isOpen={showReturningPlayerConfirm}
        confirmation={returningPlayerConfirmation}
        dynastyId={currentDynasty?.id}
        teamColors={teamColors}
        onConfirm={handleReturningPlayerConfirm}
        onCancel={handleReturningPlayerCancel}
      />

      {/* Players Leaving Modal (Offseason Week 1) */}
      <PlayersLeavingModal
        isOpen={showPlayersLeavingModal}
        onClose={() => setShowPlayersLeavingModal(false)}
        onSave={handlePlayersLeavingSave}
        currentYear={currentDynasty.currentYear}
        teamColors={teamColors}
      />

      {/* Draft Results Modal (Recruiting Week 1) */}
      <DraftResultsModal
        isOpen={showDraftResultsModal}
        onClose={() => setShowDraftResultsModal(false)}
        onSave={handleDraftResultsSave}
        currentYear={offseasonDataYear}
        teamColors={teamColors}
      />

      {/* Transfer Destinations Modal (National Signing Day) */}
      <TransferDestinationsModal
        isOpen={showTransferDestinationsModal}
        onClose={() => setShowTransferDestinationsModal(false)}
        onSave={handleTransferDestinationsSave}
        currentYear={offseasonDataYear}
        teamColors={teamColors}
      />

      {/* Recruiting Commitments Modal (All phases) */}
      <RecruitingCommitmentsModal
        isOpen={showRecruitingModal}
        onClose={() => setShowRecruitingModal(false)}
        onSave={handleRecruitingCommitmentsSave}
        currentYear={offseasonDataYear}
        currentPhase={currentDynasty.currentPhase}
        currentWeek={currentDynasty.currentWeek}
        commitmentKey={getCommitmentKey()}
        recruitingLabel={getRecruitingLabel()}
        existingCommitments={getAllPreviousCommitments()}
        teamColors={teamColors}
      />

      {/* Sell vs Send Calculator */}
      <SellVsSendCalculator
        isOpen={showSellCalc}
        onClose={() => setShowSellCalc(false)}
        accentColor={'var(--text-primary)'}
      />

      {/* Position Changes Modal (National Signing Day) */}
      <PositionChangesModal
        isOpen={showPositionChangesModal}
        onClose={() => setShowPositionChangesModal(false)}
        onSave={handlePositionChangesSave}
        players={(currentDynasty?.players || []).filter(p =>
          isPlayerOnRoster(p, getCurrentTeamTid(currentDynasty), currentDynasty.currentYear, currentDynasty)
        )}
        existingChanges={currentDynasty?.positionChangesByYear?.[offseasonDataYear] || []}
        teamColors={teamColors}
      />

      {/* Recruiting Class Rank Modal (National Signing Day) */}
      <RecruitingClassRankModal
        isOpen={showRecruitingClassRankModal}
        onClose={() => setShowRecruitingClassRankModal(false)}
        onSave={handleRecruitingClassRankSave}
        currentRank={lookupByTeamYear(currentDynasty?.recruitingClassRankByTeamYear, currentDynasty, getCurrentTeamTid(currentDynasty), offseasonDataYear)}
        teamColors={teamColors}
      />

      {/* Training Results Modal (Training Camp - Offseason Week 7) */}
      <TrainingResultsModal
        isOpen={showTrainingResultsModal}
        onClose={() => setShowTrainingResultsModal(false)}
        onSave={handleTrainingResultsSave}
        currentYear={currentDynasty?.currentYear}
        teamColors={teamColors}
        players={(() => {
          // Returning players + portal transfers (NOT HS/JUCO recruits)
          const teamAbbr = getCurrentTeamAbbr(currentDynasty)
          const teamTid = getTidFromAbbr(teamAbbr, currentDynasty)
          const playersLeavingThisYear = currentDynasty?.playersLeavingByYear?.[offseasonDataYear] || []
          const leavingPids = new Set(playersLeavingThisYear.map(p => p.pid))
          const currentYear = currentDynasty?.currentYear

          // Helper to check if player's team matches (handles tid and abbr)
          const matchesTeam = (teamValue) => {
            if (teamValue === undefined || teamValue === null) return false
            if (typeof teamValue === 'number') return teamValue === teamTid
            return teamValue === teamAbbr || teamValue?.toUpperCase() === teamAbbr?.toUpperCase()
          }

          const allPlayers = currentDynasty?.players || []

          // Get RETURNING players (was on team last year, still on team this year)
          // Uses isPlayerOnRoster which handles both stint-based and legacy players
          const returningPlayers = allPlayers.filter(p => {
            if (leavingPids.has(p.pid)) return false
            if (p.isRecruit) return false
            if (p.isHonorOnly) return false
            const wasOnTeamLastYear = isPlayerOnRoster(p, teamTid || teamAbbr, offseasonDataYear, currentDynasty)
            const isOnTeamThisYear = isPlayerOnRoster(p, teamTid || teamAbbr, currentYear, currentDynasty)
            return wasOnTeamLastYear && isOnTeamThisYear
          })

          // Get PORTAL TRANSFERS who joined this offseason
          const portalTransfers = allPlayers.filter(p => {
            if (leavingPids.has(p.pid)) return false
            if (p.isHonorOnly) return false
            const isPortalTransfer = (p.isPortal || p.previousTeam) && p.recruitYear === offseasonDataYear
            if (!isPortalTransfer) return false
            const isOnTeamThisYear = isPlayerOnRoster(p, teamTid || teamAbbr, currentYear, currentDynasty)
            return isOnTeamThisYear
          })

          return [...returningPlayers, ...portalTransfers]
        })()}
      />

      {/* Recruit Overalls Modal (National Signing Day - Offseason Week 6) */}
      <RecruitOverallsModal
        isOpen={showRecruitOverallsModal}
        onClose={() => setShowRecruitOverallsModal(false)}
        onSave={handleRecruitOverallsSave}
        currentYear={offseasonDataYear}
        teamColors={teamColors}
        recruits={(() => {
          // Get recruits from this recruiting cycle (HS and JUCO only - exclude transfer portal)
          // Recruits have recruitYear from when they committed (before year flip)
          const teamAbbr = getCurrentTeamAbbr(currentDynasty)
          const teamTid = getTidFromAbbr(teamAbbr, currentDynasty)
          const allPlayers = currentDynasty?.players || []
          return allPlayers.filter(p =>
            p.isRecruit &&
            p.recruitYear === offseasonDataYear &&
            (!p.team || p.team === teamAbbr || p.team === teamTid) &&
            !p.isPortal && !p.previousTeam // Exclude transfer portal players
          )
        })()}
      />

      {/* Portal Transfer Class Modal (National Signing Day - Offseason Week 6) */}
      <PortalTransferClassModal
        isOpen={showPortalTransferClassModal}
        onClose={() => setShowPortalTransferClassModal(false)}
        onSave={handlePortalTransferClassSave}
        currentYear={offseasonDataYear}
        teamColors={teamColors}
        portalTransfers={(() => {
          // Get portal transfers from recruiting commitments for this year
          const userTidForPortal = getUserTeamTid(currentDynasty)
          const recruitingCommitmentsAll = getRecruitingCommitments(currentDynasty, userTidForPortal, offseasonDataYear)
          const rosterPlayers = currentDynasty?.players || []
          const transfers = []
          const seenNames = new Set() // Deduplicate by name
          Object.values(recruitingCommitmentsAll).forEach(weekCommitments => {
            if (Array.isArray(weekCommitments)) {
              weekCommitments.forEach(c => {
                // Check isPortal flag and class field (commitments use 'class', not 'year')
                const playerClass = c.class || c.year
                if (c.isPortal && playerClass && c.name) {
                  // Skip duplicates
                  const nameLower = c.name.toLowerCase().trim()
                  if (seenNames.has(nameLower)) return
                  seenNames.add(nameLower)
                  // Only include Fr, So, Jr (not Sr) as they need class assignment
                  const baseClass = playerClass.replace('RS ', '')
                  if (['Fr', 'So', 'Jr'].includes(baseClass)) {
                    // Look up player in roster for current position (in case of position changes)
                    // The roster is the source of truth for player positions
                    const rosterPlayer = rosterPlayers.find(p =>
                      p.name?.toLowerCase().trim() === nameLower
                    )
                    transfers.push({
                      name: c.name,
                      position: rosterPlayer?.position || c.position, // Use roster position if found
                      incomingClass: playerClass,
                      // Pre-fill the jersey from the roster record so the
                      // user only has to type it for transfers who don't
                      // have one yet. Blank when the player is new to the
                      // roster (typical for true incoming transfers).
                      jerseyNumber: rosterPlayer?.jerseyNumber ?? null
                    })
                  }
                }
              })
            }
          })
          return transfers
        })()}
      />

      {/* Fringe Case Class Modal (National Signing Day - Offseason Week 6) */}
      <FringeCaseClassModal
        isOpen={showFringeCaseClassModal}
        onClose={() => setShowFringeCaseClassModal(false)}
        onSave={handleFringeCaseClassSave}
        currentYear={offseasonDataYear}
        teamColors={teamColors}
        fringeCasePlayers={(() => {
          // Get players with 5-9 games who might be fringe cases for redshirting
          // ONLY non-redshirt classes (Fr, So, Jr) who played 5-9 games
          const teamTid = getUserTeamTid(currentDynasty)
          const year = offseasonDataYear

          // Get all players and filter for fringe cases
          const allPlayers = currentDynasty?.players || []
          return allPlayers.filter(player => {
            // Must have been on the team for this year (use isPlayerOnRoster for stint support)
            if (!isPlayerOnRoster(player, teamTid, year, currentDynasty)) return false

            // Use classByYear to get the PRE-progression class (what they were during the season)
            // On Signing Day, player.year is POST-progression, so we need the previous class
            const preProgressionClass = player.classByYear?.[year] || player.year

            // ONLY non-redshirt underclassmen (Fr, So, Jr) - NOT RS classes or seniors
            const validClasses = ['Fr', 'So', 'Jr']
            if (!validClasses.includes(preProgressionClass)) return false

            // Get games from player.statsByYear (the correct source)
            const gamesPlayed = player.statsByYear?.[year]?.gamesPlayed || 0

            // Fringe case: 5-9 games (might have used redshirt if ≤4 reg season games)
            return gamesPlayed >= 5 && gamesPlayed <= 9
          }).map(player => {
            const gamesPlayed = player.statsByYear?.[year]?.gamesPlayed || 0
            // Use classByYear to get the PRE-progression class
            const preProgressionClass = player.classByYear?.[year] || player.year
            return {
              name: player.name,
              position: player.position,
              currentClass: preProgressionClass,
              gameCount: gamesPlayed
            }
          })
        })()}
      />

      {/* Encourage Transfers Modal (Offseason Week 8) */}
      <EncourageTransfersModal
        isOpen={showEncourageTransfersModal}
        onClose={() => setShowEncourageTransfersModal(false)}
        onSave={async (transferPlayers) => {
          const userTid = getUserTeamTid(currentDynasty)
          const year = currentDynasty?.currentYear
          const isDev = import.meta.env.VITE_DEV_MODE === 'true'
          const allPlayers = currentDynasty?.players || []

          // ──────────────────────────────────────────────────────────
          // RESOLVE TRANSFERS TO PIDs — the robust fix
          // ──────────────────────────────────────────────────────────
          // The sheet only carries { name, position, overall } per row —
          // no pid — so an earlier version of this handler matched by
          // lowercased name alone. That match failed silently whenever
          // the player's stored name had any normalization drift the
          // sheet didn't (extra whitespace, accents, "Jr." vs "Jr",
          // duplicate names from non-roster records, etc.), and the
          // "save said it registered them but they're still on roster"
          // bug the user reported was the result.
          //
          // New approach: walk dynasty.players that are CURRENTLY on
          // the user's roster for `year` and build a lookup keyed on
          // multiple shapes (pid is also captured for use during the
          // map below). Only roster-members are eligible, so honor-
          // only / off-team duplicates with the same name don't get
          // pulled in. Match by (name+position) primarily, name alone
          // as fallback — both case-insensitive and trimmed.
          const norm = (s) => (s ?? '').toString().toLowerCase().trim()
          const rosterByNamePosition = new Map() // "name|pos" → pid
          const rosterByName = new Map()         // "name" → pid (fallback when position not on the sheet row)
          for (const p of allPlayers) {
            if (!p?.pid) continue
            if (!isPlayerOnRoster(p, userTid, year, currentDynasty)) continue
            const nameKey = norm(p.name)
            if (!nameKey) continue
            const posKey = `${nameKey}|${norm(p.position)}`
            if (!rosterByNamePosition.has(posKey)) rosterByNamePosition.set(posKey, p.pid)
            // Only set name-only map when unique. If two roster players
            // share a name, fall back to name+position matching only
            // (don't let an ambiguous fallback hit one arbitrarily).
            if (rosterByName.has(nameKey)) rosterByName.set(nameKey, null)
            else rosterByName.set(nameKey, p.pid)
          }

          const encouragedPids = new Set()
          const unresolvedTransfers = []
          for (const t of transferPlayers) {
            const nameKey = norm(t.name)
            if (!nameKey) continue
            const posKey = `${nameKey}|${norm(t.position)}`
            const pid = rosterByNamePosition.get(posKey) || rosterByName.get(nameKey) || null
            if (pid) encouragedPids.add(pid)
            else unresolvedTransfers.push(t.name)
          }
          if (unresolvedTransfers.length > 0) {
            console.warn('[encourageTransfers] Could not resolve these names to roster pids — they will not be removed:', unresolvedTransfers)
          }
          console.log(`[encourageTransfers] Resolved ${encouragedPids.size} of ${transferPlayers.length} transfers to pids`)

          // Previously-encouraged pids — same resolution for restoration.
          const previouslyEncouraged = getEncourageTransfers(currentDynasty, userTid, year)
          const previousPids = new Set()
          for (const p of previouslyEncouraged) {
            const nameKey = norm(p.name)
            if (!nameKey) continue
            const posKey = `${nameKey}|${norm(p.position)}`
            const pid = rosterByNamePosition.get(posKey) || rosterByName.get(nameKey) || null
            // Also look at players whose movementByYear[year] is the
            // encouraged-transfer marker we wrote — they're not on the
            // roster anymore so the rosterByName map won't have them.
            // Find them directly.
            if (pid) previousPids.add(pid)
          }
          // Pick up off-roster previously-encouraged players (their
          // teamsByYear[year] was deleted earlier, so they're not in
          // rosterByName). Match against the saved encourageTransfers
          // list, not the roster.
          const previousNamesLower = new Set(previouslyEncouraged.map(p => norm(p.name)).filter(Boolean))
          const offRosterPreviouslyEncouraged = new Set()
          for (const p of allPlayers) {
            if (!p?.pid) continue
            if (previousPids.has(p.pid)) continue // already accounted for via roster
            if (!previousNamesLower.has(norm(p.name))) continue
            // Confirm via movementByYear breadcrumb so we don't restore
            // someone with a coincidentally-matching name.
            const mv = p.movementByYear?.[year] || p.movementByYear?.[String(year)]
            const wasEncouraged = mv?.departure === 'transfer_out' && mv?.reason === 'Encouraged Transfer'
            if (wasEncouraged) offRosterPreviouslyEncouraged.add(p.pid)
          }
          for (const pid of offRosterPreviouslyEncouraged) previousPids.add(pid)

          // ──────────────────────────────────────────────────────────
          // BUILD updatedPlayers — match by pid, not by name
          // ──────────────────────────────────────────────────────────
          let removedCount = 0
          let restoredCount = 0
          const updatedPlayers = allPlayers.map(player => {
            if (!player?.pid) return player
            const wasPreviouslyEncouraged = previousPids.has(player.pid)
            const isNowEncouraged = encouragedPids.has(player.pid)

            // Case 1: was encouraged, now not — RESTORE to roster for year
            if (wasPreviouslyEncouraged && !isNowEncouraged) {
              const restoredTeamsByYear = {
                ...(player.teamsByYear || {}),
                [year]: userTid
              }
              const updatedMovementByYear = { ...(player.movementByYear || {}) }
              delete updatedMovementByYear[year]
              delete updatedMovementByYear[String(year)]
              restoredCount++
              return {
                ...player,
                teamsByYear: restoredTeamsByYear,
                movementByYear: updatedMovementByYear
              }
            }

            // Case 2: encouraged now — REMOVE from roster + write canonical
            // v2 departure movement (matches advanceToNewSeason's shape so
            // the heal layer won't rewrite it).
            if (isNowEncouraged) {
              const updatedTeamsByYear = { ...(player.teamsByYear || {}) }
              delete updatedTeamsByYear[year]
              delete updatedTeamsByYear[String(year)]
              removedCount++
              return {
                ...player,
                teamsByYear: updatedTeamsByYear,
                movementByYear: {
                  ...(player.movementByYear || {}),
                  [year]: {
                    type: 'departure',
                    departure: 'transfer_out',
                    toTid: null,
                    reason: 'Encouraged Transfer',
                  }
                }
              }
            }

            return player
          })

          console.log(`[encourageTransfers] removed ${removedCount} from roster, restored ${restoredCount}`)

          // updateDynasty handles listener-skip protection internally
          // when it sees `players` in the updates payload — see the
          // skipListenerUpdatesCountRef + lastPlayersUpdateTimestampRef
          // branch inside updateDynasty in DynastyContext.

          if (isDev || !user) {
            const existingTeams = currentDynasty?.teams || {}
            const existingTeamData = existingTeams[userTid] || {}
            const existingByYear = existingTeamData.byYear || {}
            const existingYearData = existingByYear[year] || {}
            await updateDynasty(currentDynasty.id, {
              teams: {
                ...existingTeams,
                [userTid]: {
                  ...existingTeamData,
                  byYear: {
                    ...existingByYear,
                    [year]: {
                      ...existingYearData,
                      encourageTransfers: transferPlayers
                    }
                  }
                }
              },
              players: updatedPlayers
            })
          } else {
            await updateDynasty(currentDynasty.id, {
              [`teams.${userTid}.byYear.${year}.encourageTransfers`]: transferPlayers,
              players: updatedPlayers
            })
          }
        }}
        currentYear={currentDynasty?.currentYear}
        teamColors={teamColors}
        players={(() => {
          // Players for encourage transfers: current roster after training results
          const teamAbbr = getCurrentTeamAbbr(currentDynasty)
          const playersLeavingThisYear = currentDynasty?.playersLeavingByYear?.[currentDynasty?.currentYear] || []
          const leavingPids = new Set(playersLeavingThisYear.map(p => p.pid))

          // Get returning players (not leaving)
          const returningPlayers = teamRoster.filter(p => !leavingPids.has(p.pid))

          // Get portal transfers from recruiting commitments
          const userTidForPortal = getUserTeamTid(currentDynasty)
          const recruitingCommitments = getRecruitingCommitments(currentDynasty, userTidForPortal, currentDynasty?.currentYear)
          const portalTransfers = []
          Object.values(recruitingCommitments).forEach(weekCommitments => {
            if (Array.isArray(weekCommitments)) {
              weekCommitments.forEach(c => {
                if (c.isPortal) {
                  portalTransfers.push({
                    name: c.name,
                    position: c.position,
                    overall: c.overall || 0,
                    pid: c.pid || `portal-${c.name}`
                  })
                }
              })
            }
          })

          return [...returningPlayers, ...portalTransfers]
        })()}
      />

      {/* Offseason Conferences Modal (Offseason Week 8) - year already flipped, so currentYear IS the upcoming season */}
      <ConferencesModal
        isOpen={showOffseasonConferencesModal}
        onClose={() => setShowOffseasonConferencesModal(false)}
        onSave={async (data) => {
          // Year already flipped at Signing Day (Week 6), so currentYear IS the upcoming season
          const upcomingSeasonYear = currentDynasty.currentYear
          // Check if data is multi-year format (keys are years like "2025", "2026")
          const isMultiYear = Object.keys(data).every(key => /^\d{4}$/.test(key))

          // saveConferenceAlignment fans the bulk map out to each
          // team's per-year `byYear[year].conference` field AND
          // continues writing the legacy stores. Routes through the
          // dynasty's storageType automatically — no dev-mode /
          // prod-mode branch needed here.
          if (isMultiYear) {
            for (const [yearKey, mapForYear] of Object.entries(data)) {
              await saveConferenceAlignment(currentDynasty.id, Number(yearKey), mapForYear)
            }
          } else {
            await saveConferenceAlignment(currentDynasty.id, upcomingSeasonYear, data)
          }
        }}
        teamColors={teamColors}
      />
    </div>
  )
}
