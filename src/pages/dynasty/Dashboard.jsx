import { useState, useEffect, useMemo, useRef } from 'react'
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom'
import { useDynasty, getCurrentSchedule, getScheduleWithGameData, getCurrentRoster, getCurrentPreseasonSetup, getCurrentTeamRatings, getCurrentCoachingStaff, getCurrentGoogleSheet, findCurrentTeamGame, getCurrentTeamGames, GAME_TYPES, getGamesByType, getCurrentCustomConferences, MOVEMENT_TYPES, createMovement, getUserGamePerspective, isTeamInGame, getTeamGamePerspective, isFirstYearOnTeam, getCurrentTeamRecord, getCurrentTeamRanking, getEncourageTransfers, getRecruitingCommitments, getConferenceChampionshipData, createOrUpdateCFPGameShells, getUserCFPGameStatus, getCFPRoundDisplayName, propagateCFPWinner, findUserCFPGameShell, isPlayerOnRoster, getPlayerClassForYear } from '../../context/DynastyContext'
import { useAuth } from '../../context/AuthContext'
import { useTeamColors } from '../../hooks/useTeamColors'
import { getContrastTextColor } from '../../utils/colorUtils'
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
import BowlScoreModal from '../../components/BowlScoreModal'
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
import EncourageTransfersModal from '../../components/EncourageTransfersModal'
import RecruitOverallsModal from '../../components/RecruitOverallsModal'
import PortalTransferClassModal from '../../components/PortalTransferClassModal'
import FringeCaseClassModal from '../../components/FringeCaseClassModal'
import { getAllBowlGamesList, isBowlInWeek1, isBowlInWeek2 } from '../../services/sheetsService'
import { isSameYear } from '../../utils/compareUtils'
import { calculateRecruitingClassScore, formatRecruitingClassScore, flattenClassCommitments } from '../../utils/recruitingScore'

// Helper function to normalize player names for consistent lookup
const normalizePlayerName = (name) => {
  if (!name) return ''
  return name.trim().toLowerCase()
}

export default function Dashboard() {
  const { currentDynasty, loadingDynastyId, saveSchedule, saveRoster, saveTeamRatings, saveCoachingStaff, saveConferences, addGame, saveCPUBowlGames, saveCFPGames, saveCPUConferenceChampionships, updateDynasty, processHonorPlayers, isViewOnly, exportDynasty } = useDynasty()

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

  // Build path prefix for links based on view mode
  const pathPrefix = isViewOnly ? `/view/${shareCode}` : `/dynasty/${dynastyId}`
  const secondaryBgText = getContrastTextColor(teamColors.secondary)
  const primaryBgText = getContrastTextColor(teamColors.primary)

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
  const teamCoachingStaff = getCurrentCoachingStaff(currentDynasty)
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

      // Determine which side we are on (home or away) based on homeTeamTid
      const userTid = perspective.userTid
      const isHome = game.homeTeamTid === userTid

      // Get our player box score (for defensive stats like sacks, INTs)
      const ourPlayerBoxScore = isHome ? game.boxScore.home : game.boxScore.away

      // Aggregate offense from team stats
      if (game.boxScore.teamStats) {
        const homeAbbr = game.boxScore.teamStats.home?.teamAbbr?.toUpperCase()
        const awayAbbr = game.boxScore.teamStats.away?.teamAbbr?.toUpperCase()

        let ourTeamStats = null
        let oppTeamStats = null

        if (homeAbbr === currentTeamAbbr) {
          ourTeamStats = game.boxScore.teamStats.home
          oppTeamStats = game.boxScore.teamStats.away
        } else if (awayAbbr === currentTeamAbbr) {
          ourTeamStats = game.boxScore.teamStats.away
          oppTeamStats = game.boxScore.teamStats.home
        }

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
  const [showBowlScoreModal, setShowBowlScoreModal] = useState(false)
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
  const [showPositionChangesModal, setShowPositionChangesModal] = useState(false)
  const [showRecruitingClassRankModal, setShowRecruitingClassRankModal] = useState(false)
  const [showTrainingResultsModal, setShowTrainingResultsModal] = useState(false)
  const [showEncourageTransfersModal, setShowEncourageTransfersModal] = useState(false)
  const [showOffseasonConferencesModal, setShowOffseasonConferencesModal] = useState(false)
  const [showRecruitOverallsModal, setShowRecruitOverallsModal] = useState(false)
  const [showPortalTransferClassModal, setShowPortalTransferClassModal] = useState(false)
  const [showFringeCaseClassModal, setShowFringeCaseClassModal] = useState(false)

  // Roster sorting state
  const [rosterSort, setRosterSort] = useState('position') // 'position', 'jerseyNumber', 'name', 'class'
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
  const [bowlEligible, setBowlEligible] = useState(null) // null = not answered, true/false = answered
  const [selectedBowl, setSelectedBowl] = useState('')
  const [bowlOpponent, setBowlOpponent] = useState('')
  const [bowlOpponentSearch, setBowlOpponentSearch] = useState('')
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
      setBowlEligible(bowlData.eligible ?? null)
      setSelectedBowl(bowlData.bowlGame || '')
      setBowlOpponent(bowlData.opponent || '')
    } else {
      // Reset when no data for this year
      setBowlEligible(null)
      setSelectedBowl('')
      setBowlOpponent('')
    }
  }, [currentDynasty?.id, currentDynasty?.currentYear, currentDynasty?.bowlEligibilityDataByYear])

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
        const tid = entry.tid || getTidFromAbbr(entry.team)
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

    console.log('[Dashboard CFP Shell Effect] Saving shells for year', year, '- games count:', updatedGames.length)

    // Save the shells
    updateDynasty(currentDynasty.id, { games: updatedGames })
  }, [currentDynasty?.id, currentDynasty?.currentYear, currentDynasty?.currentPhase, currentDynasty?.cfpSeedsByYear, currentDynasty?.games?.length, isViewOnly, isLoadingDynastyData])

  if (!currentDynasty) return null

  // Get the user's team conference (from custom conferences or default)
  const customConferences = getCurrentCustomConferences(currentDynasty)

  const getUserTeamConference = () => {
    // Use userTeamTid from the team with userId: 'currentUser' (single source of truth)
    if (!userTeamTid) return null

    // For conference lookup, use the ORIGINAL team's abbreviation (from static TEAMS)
    // This ensures teambuilder teams inherit the replaced team's conference position
    const originalTeamAbbr = TEAMS[userTeamTid]?.abbr
    if (!originalTeamAbbr) return null

    // Use getTeamConference with custom conferences
    return getTeamConference(originalTeamAbbr, customConferences)
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
    const tid = getTidFromAbbr(teamAbbr)
    const ccData = { ...(existingForTeam[year] || {}), madeChampionship }

    // Also get existing year-only structure for backward compatibility
    const existingByYear = currentDynasty.conferenceChampionshipDataByYear || {}

    const updates = {
      // Write to team-centric structure
      conferenceChampionshipDataByTeamYear: {
        ...existingByTeamYear,
        [teamAbbr]: {
          ...existingForTeam,
          [year]: ccData
        }
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
    const tid = getTidFromAbbr(teamAbbr)
    const ccData = { ...(existingForTeam[year] || {}), opponent }

    // Also get existing year-only structure for backward compatibility
    const existingByYearOnly = currentDynasty.conferenceChampionshipDataByYear || {}

    const updates = {
      // Write to team-centric structure
      conferenceChampionshipDataByTeamYear: {
        ...existingByTeamYear,
        [teamAbbr]: {
          ...existingForTeam,
          [year]: ccData
        }
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
    const tid = getTidFromAbbr(teamAbbr)
    const ccData = { ...(existingForTeam[year] || {}), pendingFiring: selection }

    // Also get existing year-only structure for backward compatibility
    const existingByYearOnly = currentDynasty.conferenceChampionshipDataByYear || {}

    const updates = {
      // Write to team-centric structure
      conferenceChampionshipDataByTeamYear: {
        ...existingByTeamYear,
        [teamAbbr]: {
          ...existingForTeam,
          [year]: ccData
        }
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

      if (result.needsConfirmation) {
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

      if (result.needsConfirmation) {
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
          playerTeamTid = getTidFromAbbr(playerTeamTid) || teamTid
        }
        const playerTeam = playerTeamTid || teamTid

        // Check if player already has a movement for this year - if so, UPDATE it with new reason
        const existingMovementIndex = (player.movements || []).findIndex(m =>
          m.year === Number(year) && (m.type === 'entered_portal' || m.type === 'departure')
        )

        // Build movementByYear entry based on reason
        const movementByYearEntry = (() => {
          if (reason === 'Pro Draft') {
            return { type: 'declared_for_draft' }
          } else if (reason === 'Graduating') {
            return { type: 'graduated' }
          }
          // Every other reason = entered the transfer portal, destination
          // unknown until Transfer Destinations is filled in on Signing Day.
          return { type: 'transferred_out', toTeamTid: null, reason }
        })()

        if (existingMovementIndex !== -1) {
          // UPDATE the existing movement with the new reason/type
          const updatedMovements = [...(player.movements || [])]
          const newType = isTransfer ? 'entered_portal' : 'departure'
          updatedMovements[existingMovementIndex] = {
            ...updatedMovements[existingMovementIndex],
            type: newType,
            reason: reason,
            timestamp: Date.now()
          }

          return {
            ...player,
            movements: updatedMovements,
            movementByYear: {
              ...(player.movementByYear || {}),
              [Number(year)]: movementByYearEntry
            }
          }
        }

        // Create movement based on reason (for display/history only)
        let newMovement = null
        if (isTransfer) {
          newMovement = {
            year: Number(year),
            type: 'entered_portal',
            from: playerTeam,
            to: null,
            reason: reason,
            timestamp: Date.now()
          }
        } else if (isDeparture) {
          newMovement = {
            year: Number(year),
            type: 'departure',
            from: playerTeam,
            to: null,
            reason: reason,
            timestamp: Date.now()
          }
        }

        return {
          ...player,
          movements: newMovement
            ? [...(player.movements || []), newMovement]
            : player.movements,
          movementByYear: {
            ...(player.movementByYear || {}),
            [Number(year)]: movementByYearEntry
          }
        }
      } else if (previousLeavingPids.has(player.pid)) {
        // Player was previously marked as leaving this year but is no longer in the list
        // Remove any entered_portal or departure movement for this year
        const filteredMovements = (player.movements || []).filter(m =>
          !(m.year === Number(year) && (m.type === 'entered_portal' || m.type === 'departure'))
        )

        // Also remove movementByYear entry for this year
        const updatedMovementByYear = { ...(player.movementByYear || {}) }
        delete updatedMovementByYear[Number(year)]
        delete updatedMovementByYear[String(year)]

        return {
          ...player,
          movements: filteredMovements,
          movementByYear: updatedMovementByYear
        }
      }
      return player
    })

    // playersLeavingByTeamYear is the source of truth for who is leaving (team-centric)
    // teamAbbr already defined above
    const existingByTeamYear = currentDynasty.playersLeavingByTeamYear || {}
    const existingByYear = currentDynasty.playersLeavingByYear || {}
    const tid = getTidFromAbbr(teamAbbr)

    // Build updates object
    const updates = {
      // Legacy format for backwards compatibility and simpler lookups
      playersLeavingByYear: {
        ...existingByYear,
        [year]: playersWithPids
      },
      // Team-centric format
      playersLeavingByTeamYear: {
        ...existingByTeamYear,
        [teamAbbr]: {
          ...(existingByTeamYear[teamAbbr] || {}),
          [year]: playersWithPids
        }
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
    const tid = getTidFromAbbr(teamAbbr)

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
        const playerLastTeamTid = typeof playerLastTeam === 'number' ? playerLastTeam : (getTidFromAbbr(playerLastTeam) || tid)

        // Build movementByYear entry for draft
        const draftMovementByYear = { type: 'declared_for_draft', draftRound: entry.draftRound || null }

        if (!hasDraftMovement) {
          updatedPlayers[playerIndex] = {
            ...player,
            // Store draft info on player record
            draftYear: year,
            draftRound: entry.draftRound,
            // Add departure movement for draft
            movements: [
              ...existingMovements,
              {
                year,
                type: 'departure',
                reason: 'Pro Draft',
                from: playerLastTeamTid,
                draftRound: entry.draftRound,
                timestamp: Date.now()
              }
            ],
            movementByYear: {
              ...(player.movementByYear || {}),
              [year]: draftMovementByYear
            }
          }
        } else {
          // Update existing draft movement with round info and correct team
          updatedPlayers[playerIndex] = {
            ...player,
            draftYear: year,
            draftRound: entry.draftRound,
            movements: existingMovements.map(m =>
              (m.year === year && m.type === 'departure' && m.reason === 'Pro Draft')
                ? { ...m, draftRound: entry.draftRound, from: playerLastTeamTid }
                : m
            ),
            movementByYear: {
              ...(player.movementByYear || {}),
              [year]: draftMovementByYear
            }
          }
        }
      }
    })

    const updates = {
      players: updatedPlayers,
      draftResultsByTeamYear: {
        ...existingByTeamYear,
        [teamAbbr]: {
          ...(existingByTeamYear[teamAbbr] || {}),
          [year]: resultsWithPids
        }
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
          oldTeamTid = getTidFromAbbr(oldTeamTid) || teamTid
        }
        if (!oldTeamTid) oldTeamTid = teamTid

        // Get newTeam as tid (dest.newTeam could be abbr from sheet)
        let newTeamTid = dest.newTeam
        if (typeof newTeamTid === 'string') {
          newTeamTid = getTidFromAbbr(newTeamTid)
        }

        // Check if this is a RECOMMIT (destination = their current team)
        const isRecommit = newTeamTid === oldTeamTid || newTeamTid === teamTid

        if (isRecommit) {
          // Player recommitted - they're staying on the team!
          const recommitMovement = {
            year: Number(year),
            type: 'recommit',
            from: null,
            to: oldTeamTid,
            reason: 'Recommitted after entering portal',
            timestamp: Date.now()
          }

          // Remove entered_portal movement for this year (they're not leaving anymore)
          const filteredMovements = (player.movements || []).filter(m =>
            !(m.year === Number(year) && m.type === 'entered_portal')
          )

          // Set movementByYear to 'recommitted' - preserves the history that they entered the portal
          const updatedMovementByYear = { ...(player.movementByYear || {}) }
          updatedMovementByYear[Number(year)] = { type: 'recommitted' }

          // ALWAYS use tid for teamsByYear storage
          const teamsByYearValue = oldTeamTid

          updatedPlayers[playerIndex] = {
            ...player,
            movements: [...filteredMovements, recommitMovement],
            movementByYear: updatedMovementByYear,
            // Keep them on roster for next year
            teamsByYear: {
              ...(player.teamsByYear || {}),
              [String(nextYear)]: teamsByYearValue
            }
          }
        } else {
          // Normal transfer to another team
          // Add transfer movement - ALWAYS use tid
          const transferMovement = {
            year: Number(year),
            type: 'transfer',
            from: oldTeamTid,
            to: newTeamTid,
            timestamp: Date.now()
          }

          // Update teamsByYear to new team, update current team with tid
          updatedPlayers[playerIndex] = {
            ...player,
            team: newTeamTid, // Use tid for current team
            movements: [...(player.movements || []), transferMovement],
            movementByYear: {
              ...(player.movementByYear || {}),
              [Number(year)]: { type: 'transferred_out', toTeamTid: newTeamTid }
            },
            teamsByYear: {
              ...(player.teamsByYear || {}),
              [String(nextYear)]: newTeamTid
            }
          }
        }
      }
    })

    const tid = getTidFromAbbr(teamAbbr)

    const updates = {
      transferDestinationsByTeamYear: {
        ...existingByTeamYear,
        [teamAbbr]: {
          ...(existingByTeamYear[teamAbbr] || {}),
          [year]: destinations
        }
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
    const tid = getTidFromAbbr(teamAbbr)

    const updates = {
      recruitingClassRankByTeamYear: {
        ...existingRanks,
        [teamAbbr]: {
          ...(existingRanks[teamAbbr] || {}),
          [year]: rank
        }
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
    // CRITICAL: Get tid directly - tid is the ONLY source of truth
    const teamTid = getCurrentTeamTid(currentDynasty)

    // Update player positions in the players array for any NEW changes
    const updatedPlayers = [...(currentDynasty.players || [])]
    changes.forEach(change => {
      const playerIndex = updatedPlayers.findIndex(p => p.pid === change.playerId)
      if (playerIndex !== -1) {
        // Only update if the position is different from current
        if (updatedPlayers[playerIndex].position !== change.newPosition) {
          updatedPlayers[playerIndex] = {
            ...updatedPlayers[playerIndex],
            position: change.newPosition,
            archetype: '' // Clear archetype since it's position-specific
          }
        }
      }
    })

    // Store the changes for history (replace entire year's changes)
    const changesRecord = changes.map(c => ({
      pid: c.playerId,
      playerName: c.playerName,
      oldPosition: c.oldPosition,
      newPosition: c.newPosition,
      team: teamTid // ALWAYS use tid
    }))

    await updateDynasty(currentDynasty.id, {
      players: updatedPlayers,
      positionChangesByYear: {
        ...existingChangesAll,
        [year]: changesRecord // Replace, don't append
      }
    })
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
        updatedPlayers[playerIndex] = {
          ...updatedPlayers[playerIndex],
          year: selection.selectedClass,
          // Also update classByYear for the new system
          classByYear: {
            ...existingClassByYear,
            [joiningYear]: selection.selectedClass
          }
        }
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

        // Check if player has a departure movement (left the team)
        const hasDepartureMovement = (p.movements || []).some(m =>
          m.type === 'departure' || m.type === 'transfer'
        )
        if (hasDepartureMovement) {
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
        // Check if player has a departure movement (left the team)
        const hasDepartureMovement = (p.movements || []).some(m =>
          m.type === 'departure' || m.type === 'transfer'
        )
        if (hasDepartureMovement) {
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
                          getTidFromAbbr(prevTeamText) ||
                          resolveTid(prevTeamText, currentDynasty?.teams || TEAMS)
        // If resolution failed but we have text, it might be an FCS/non-FBS team - keep as null
      }

      // Store previousTeam as tid if resolved, otherwise keep original text for display fallback
      const previousTeam = previousTeamTid || recruit.previousTeam || (isPortalPlayer ? null : '')

      // Create movement for this recruit - use tid for team references
      const movementType = isPortalPlayer ? MOVEMENT_TYPES.PORTAL_IN : MOVEMENT_TYPES.RECRUITED
      const fromTeamTid = isPortalPlayer ? previousTeamTid : null
      const recruitMovement = createMovement(year, movementType, fromTeamTid, teamTid)

      const enrollmentYear = year + 1 // Year they will be on the roster
      const enrollmentClass = classToYear[recruit.class] || 'Fr'

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
        team: teamTid, // Tag player with team tid
        isRecruit: true,
        recruitYear: year, // The recruiting class year (they play NEXT year)
        // IMMUTABLE roster history - recruits will be on team starting NEXT year
        teamsByYear: { [enrollmentYear]: teamsByYearValue },
        // IMMUTABLE class history - record their class when they enroll
        classByYear: { [enrollmentYear]: enrollmentClass },
        // Entry tracking for the new system
        entryYear: enrollmentYear,
        entryClass: enrollmentClass,
        entryReason: isPortalPlayer ? 'transfer_in' : 'recruited',
        // Dev trait tracking
        devTraitByYear: (recruit.devTrait || 'Normal') ? { [enrollmentYear]: recruit.devTrait || 'Normal' } : {},
        // Recruiting info
        stars: recruit.stars || 0,
        nationalRank: recruit.nationalRank || null,
        stateRank: recruit.stateRank || null,
        positionRank: recruit.positionRank || null,
        gemBust: recruit.gemBust || '',
        previousTeam: previousTeam,
        isPortal: isPortalPlayer,
        // Add movements array with recruit movement
        movements: [recruitMovement],
        pendingDeparture: null
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

          // Preserve existing movements and add the new movement
          const existingMovements = p.movements || []

          // CRITICAL: Preserve all existing player data, only update specific fields
          const updatedPlayer = {
            ...p, // Preserve everything: pid, name, statsByYear, classByYear, overall, etc.
            // Clear pendingDeparture - they're staying!
            pendingDeparture: null,
            // Add movement
            movements: [...existingMovements, newMovement],
            // Set movementByYear - preserves history of what happened
            movementByYear: {
              ...(p.movementByYear || {}),
              [Number(year)]: isFromDifferentTeam
                ? { type: 'transferred_out', toTeamTid: teamTid }
                : { type: 'recommitted' }
            },
            // Clear ALL legacy departure flags - they're staying/coming back!
            leftTeam: false,
            leftYear: null,
            leftReason: null,
            leavingYear: null,
            leavingReason: null,
            transferredTo: null,
            transferredFrom: null,
            // Update team assignment with tid
            team: teamTid,
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

    // For players already on roster, update their portal status if needed
    // This handles the case where players were saved before portal detection was added
    const portalClasses = ['Fr', 'RS Fr', 'So', 'RS So', 'Jr', 'RS Jr', 'Sr', 'RS Sr']
    const alreadyOnRosterNames = new Set(
      alreadyOnRosterRecruits.map(r => r.name.toLowerCase().trim())
    )
    const playersWithPortalFix = playersWithReturning.map(p => {
      if (p.name && alreadyOnRosterNames.has(p.name.toLowerCase().trim())) {
        // Find the recruit data to check class
        const recruitData = alreadyOnRosterRecruits.find(
          r => r.name.toLowerCase().trim() === p.name.toLowerCase().trim()
        )
        if (recruitData) {
          const recruitClass = (recruitData.class || '').trim()
          const isPortalPlayer = recruitData.isPortal || portalClasses.some(pc => pc.toLowerCase() === recruitClass.toLowerCase())
          if (isPortalPlayer && !p.previousTeam) {
            return {
              ...p,
              isPortal: true,
              previousTeam: recruitData.previousTeam || 'Transfer Portal'
            }
          }
        }
      }
      return p
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
      const tid = getTidFromAbbr(teamAbbr)
      const commitmentData = {
        ...existingForYear,
        [commitmentKey]: allCommittedRecruits
      }

      // Store in TEAM-CENTRIC structure - store all commits for this commitment key
      const updates = {
        recruitingCommitmentsByTeamYear: {
          ...existingByTeamYear,
          [teamAbbr]: {
            ...existingForTeam,
            [year]: commitmentData
          }
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
    const year = currentDynasty.currentYear
    const commitmentKey = getCommitmentKey()
    if (!commitmentKey) return

    const teamAbbr = getCurrentTeamAbbr(currentDynasty) || currentDynasty.teamName
    const tid = getTidFromAbbr(teamAbbr)

    // Use TEAM-CENTRIC structure
    const existingByTeamYear = currentDynasty.recruitingCommitmentsByTeamYear || {}
    const existingForTeam = existingByTeamYear[teamAbbr] || {}
    const existingForYear = existingForTeam[year] || {}

    const commitmentData = {
      ...existingForYear,
      [commitmentKey]: []
    }

    // Store empty array to mark as completed
    const updates = {
      recruitingCommitmentsByTeamYear: {
        ...existingByTeamYear,
        [teamAbbr]: {
          ...existingForTeam,
          [year]: commitmentData
        }
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
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Cloud Read-Only Banner - show when user has cloud dynasty but no premium */}
      {isViewOnly && currentDynasty?.storageType === 'cloud' && !shareCode && (
        <div className="rounded-lg shadow-lg p-4 bg-amber-50 border-2 border-amber-300">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-amber-800">Cloud Dynasty - Read Only</h3>
              <p className="text-sm text-amber-700 mt-1">
                This dynasty is stored in the cloud and requires Premium to edit.
                Download a backup and import it as a new local dynasty to continue editing, or upgrade to Premium.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => exportDynasty(currentDynasty.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-amber-600 text-white hover:bg-amber-700 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download Backup
                </button>
                <Link
                  to="/account"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-purple-600 text-white hover:bg-purple-700 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                  Upgrade to Premium
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Note: Google Sheets are now created lazily when user opens entry modals */}

      {/* New Job Banner - show when user is taking a new job */}
      {takingNewJob === true && newJobTeam && newJobPosition && (() => {
        // newJobTeam is already the full display name (e.g., "Delaware Fightin' Blue Hens")
        const newTeamLogo = getTeamLogo(newJobTeam, currentDynasty?.teams || currentDynasty?.customTeams)
        const newTeamColors = getTeamColors(newJobTeam, currentDynasty?.teams || currentDynasty?.customTeams) || { primary: '#333', secondary: '#fff' }
        const newTeamPrimaryText = getContrastTextColor(newTeamColors.primary)

        return (
          <div
            className="rounded-lg shadow-lg p-4 flex items-center gap-4"
            style={{
              backgroundColor: newTeamColors.primary,
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
                style={{ backgroundColor: newTeamColors.secondary, color: getContrastTextColor(newTeamColors.secondary) }}
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

        return (
          <div className="card overflow-hidden mb-6">
            <div className="h-[3px] w-full" style={{ backgroundColor: teamColors.primary }} aria-hidden="true" />
            <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <Link
                to={`${pathPrefix}/team/${userTeamTid}/${currentDynasty.currentYear}`}
                className="flex items-center gap-4 hover:opacity-90 transition-opacity min-w-0 group"
              >
                {(() => {
                  // Get logo from user's current team (using userId as source of truth)
                  let logoUrl = null
                  if (userTeamData) {
                    logoUrl = userTeamData.logo || userTeamData.logoUrl
                  }
                  if (!logoUrl) logoUrl = getTeamLogo(userTeamName, currentDynasty.teams)
                  return logoUrl ? (
                    <div className="w-16 h-16 sm:w-20 sm:h-20 flex-shrink-0 rounded-xl p-2 bg-surface-3">
                      <img
                        src={logoUrl}
                        alt={`${userTeamName} logo`}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ) : null
                })()}
                <div className="min-w-0">
                  <h2 className="font-display text-base xs:text-lg sm:text-2xl md:text-3xl font-extrabold tracking-tight leading-tight text-txt-primary">
                    {currentRank && <span className="mr-2 text-txt-tertiary">#{currentRank}</span>}
                    {userTeamName}
                  </h2>
                  <div className="text-sm sm:text-base mt-1 flex items-center gap-2 text-txt-secondary">
                    <span className="font-display font-bold text-lg tabular">
                      {headerWins}-{headerLosses}
                      {(headerConfWins > 0 || headerConfLosses > 0) && (
                        <span className="text-txt-tertiary"> ({headerConfWins}-{headerConfLosses})</span>
                      )}
                    </span>
                    {currentDynasty.currentPhase !== 'preseason' && userTeamConference && (
                      <>
                        <span className="text-txt-tertiary">•</span>
                        <span className="font-medium">{userTeamConference}</span>
                        {getConferenceLogo(userTeamConference) && (
                          <div className="h-6 w-6 sm:h-7 sm:w-7 rounded-full flex items-center justify-center flex-shrink-0 bg-surface-3" style={{ padding: '3px' }}>
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
                <div className="flex items-center gap-2 sm:gap-3 justify-end sm:justify-start">
                  <div className="text-center px-4 py-2.5 rounded-xl bg-surface-3">
                    <div className="label-xs text-txt-tertiary">OVR</div>
                    <div className="font-display text-xl sm:text-2xl font-extrabold text-txt-primary tabular">{teamRatings.overall}</div>
                  </div>
                  <div className="text-center px-4 py-2.5 rounded-xl bg-surface-3">
                    <div className="label-xs text-txt-tertiary">OFF</div>
                    <div className="font-display text-xl sm:text-2xl font-extrabold text-txt-primary tabular">{teamRatings.offense}</div>
                  </div>
                  <div className="text-center px-4 py-2.5 rounded-xl bg-surface-3">
                    <div className="label-xs text-txt-tertiary">DEF</div>
                    <div className="font-display text-xl sm:text-2xl font-extrabold text-txt-primary tabular">{teamRatings.defense}</div>
                  </div>
                  {!isViewOnly && (
                    <button
                      onClick={() => setShowTeamRatingsModal(true)}
                      className="p-2.5 rounded-xl hover:bg-surface-4 transition-colors text-txt-secondary"
                      title="Edit Team Ratings"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  )}

                  {/* Coaching Staff Popup (HC only) */}
                  {!isViewOnly && currentDynasty.coachPosition === 'HC' && teamCoachingStaff && (
                    <div className="relative">
                      <button
                        ref={coachingStaffButtonRef}
                        onClick={() => {
                          if (!showCoachingStaffPopup && coachingStaffButtonRef.current) {
                            const rect = coachingStaffButtonRef.current.getBoundingClientRect()
                            setCoachingStaffPopupPosition({
                              top: rect.bottom + 8,
                              right: window.innerWidth - rect.right
                            })
                          }
                          setShowCoachingStaffPopup(!showCoachingStaffPopup)
                        }}
                        className="p-2.5 rounded-xl hover:bg-surface-4 transition-colors text-txt-secondary"
                        title="Coaching Staff"
                      >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </button>

                    {showCoachingStaffPopup && (
                      <>
                        {/* Backdrop - click to close */}
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setShowCoachingStaffPopup(false)}
                        />
                        <div
                          className="fixed z-50 w-72 rounded-2xl overflow-hidden card-elevated"
                          style={{
                            top: coachingStaffPopupPosition.top,
                            right: coachingStaffPopupPosition.right
                          }}
                        >
                          <div className="px-4 py-3 bg-surface-2 border-b border-surface-4 border-l-[3px]" style={{ borderLeftColor: teamColors.primary }}>
                            <div className="flex items-center justify-between">
                              <h4 className="font-display font-bold text-sm uppercase tracking-wide text-txt-primary">
                                Coaching Staff
                              </h4>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setShowCoachingStaffPopup(false)
                                  setShowCoachingStaffModal(true)
                                }}
                                className="p-1.5 rounded-lg hover:bg-surface-3 transition-colors text-txt-tertiary hover:text-txt-primary"
                                title="Edit Coaching Staff"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                            </div>
                          </div>
                          <div className="p-4 space-y-3">
                            {/* Offensive Coordinator */}
                            {(() => {
                              const ocName = teamCoachingStaff?.ocName
                              const ccDataForYear = currentDynasty.conferenceChampionshipDataByYear?.[currentDynasty.currentYear] || {}
                              const firedOCName = ccDataForYear.firedOCName
                              const displayName = ocName || firedOCName
                              const isFired = !ocName && firedOCName

                              return displayName ? (
                                <div className="flex items-center gap-3">
                                  <div
                                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                                    style={{ backgroundColor: isFired ? 'rgba(239,68,68,0.15)' : `${teamColors.primary}25` }}
                                  >
                                    <span className="font-display text-xs font-bold" style={{ color: isFired ? '#ef4444' : teamColors.primary }}>OC</span>
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="font-display text-[10px] uppercase font-semibold tracking-wider text-zinc-500">
                                      Offensive Coordinator
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className={`font-semibold truncate text-zinc-100 ${isFired ? 'line-through opacity-60' : ''}`}>
                                        {displayName}
                                      </span>
                                      {isFired && (
                                        <span className="font-display text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
                                          FIRED
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ) : null
                            })()}

                            {/* Defensive Coordinator */}
                            {(() => {
                              const dcName = teamCoachingStaff?.dcName
                              const ccDataForYear = currentDynasty.conferenceChampionshipDataByYear?.[currentDynasty.currentYear] || {}
                              const firedDCName = ccDataForYear.firedDCName
                              const displayName = dcName || firedDCName
                              const isFired = !dcName && firedDCName

                              return displayName ? (
                                <div className="flex items-center gap-3">
                                  <div
                                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                                    style={{ backgroundColor: isFired ? 'rgba(239,68,68,0.15)' : `${teamColors.primary}25` }}
                                  >
                                    <span className="font-display text-xs font-bold" style={{ color: isFired ? '#ef4444' : teamColors.primary }}>DC</span>
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="font-display text-[10px] uppercase font-semibold tracking-wider text-zinc-500">
                                      Defensive Coordinator
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className={`font-semibold truncate text-zinc-100 ${isFired ? 'line-through opacity-60' : ''}`}>
                                        {displayName}
                                      </span>
                                      {isFired && (
                                        <span className="font-display text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
                                          FIRED
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ) : null
                            })()}

                            {/* Show message if no coordinators at all */}
                            {!teamCoachingStaff?.ocName && !teamCoachingStaff?.dcName && (() => {
                              const ccDataForYear = currentDynasty.conferenceChampionshipDataByYear?.[currentDynasty.currentYear] || {}
                              return !ccDataForYear.firedOCName && !ccDataForYear.firedDCName
                            })() && (
                              <div className="text-center py-2 text-sm text-zinc-500">
                                No coordinators entered
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
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
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--rule-soft)' }}>
          <div className="px-4 pt-3 pb-4 sm:px-6 sm:pt-3 sm:pb-6">
          <div className="flex items-center gap-3 mb-3 sm:mb-4">
            <div className="w-1 h-10 sm:h-12 rounded-full flex-shrink-0" style={{ backgroundColor: teamColors.primary }} />
            <h3 className="font-display font-black uppercase leading-none text-txt-primary" style={{ fontSize: 'clamp(1.25rem, 2vw, 1.75rem)', letterSpacing: '-0.01em' }}>
              Pre-Season Setup
            </h3>
          </div>
          <div className="-space-y-px">
            {[
              {
                num: 1,
                title: 'Enter Schedule',
                done: teamPreseasonSetup?.scheduleEntered,
                scheduleCount: teamSchedule?.length || 0,
                action: () => setShowScheduleModal(true),
                actionText: teamPreseasonSetup?.scheduleEntered ? 'Edit' : 'Enter'
              },
              // Only show roster entry in first year of dynasty OR if user switched teams
              ...(isFirstYearOnTeam(currentDynasty) ? [{
                num: 2,
                title: 'Enter Roster',
                done: teamPreseasonSetup?.rosterEntered,
                playerCount: teamRoster.length,
                action: () => setShowRosterModal(true),
                actionText: teamPreseasonSetup?.rosterEntered ? 'Edit' : 'Enter'
              }] : []),
              {
                num: isFirstYearOnTeam(currentDynasty) ? 3 : 2,
                title: 'Enter Team Ratings',
                done: teamPreseasonSetup?.teamRatingsEntered,
                teamRatings: teamRatings,
                action: () => setShowTeamRatingsModal(true),
                actionText: teamPreseasonSetup?.teamRatingsEntered ? 'Edit' : 'Add Ratings'
              },
              // Only show coaching staff task for Head Coaches in first year of dynasty
              // (or first year on a new team). After that, coordinators are managed
              // through offseason firing/hiring flow and carry over automatically.
              ...(() => {
                if (currentDynasty.coachPosition !== 'HC') return []
                const isNewTeam = isFirstYearOnTeam(currentDynasty)
                // Only show in first year of dynasty or first year on a new team
                if (!isNewTeam) return []
                // Calculate task number based on what's shown before it
                let num = 2 // After schedule
                if (isNewTeam) num++ // After roster
                num++ // After team ratings
                return [{
                  num,
                  title: 'Enter Coordinators',
                  done: teamPreseasonSetup?.coachingStaffEntered,
                  coachingStaff: teamCoachingStaff,
                  action: () => setShowCoachingStaffModal(true),
                  actionText: teamPreseasonSetup?.coachingStaffEntered ? 'Edit' : 'Add Staff'
                }]
              })(),
              // Optional: Recruiting Commitments - TID-BASED
              (() => {
                const userTid = getUserTeamTid(currentDynasty)
                const recruitingCommits = getRecruitingCommitments(currentDynasty, userTid, currentDynasty.currentYear)
                const preseasonCommitments = recruitingCommits?.['preseason']
                const isNewTeam = isFirstYearOnTeam(currentDynasty)
                // Calculate task number
                let num = 2 // After schedule
                if (isNewTeam) num++ // After roster
                num++ // After team ratings
                // Only add coordinator increment if coordinators task is shown (HC + first year on team)
                if (currentDynasty.coachPosition === 'HC' && isNewTeam) num++ // After coordinators
                const classScore = calculateRecruitingClassScore(flattenClassCommitments(recruitingCommits))
                return {
                  num,
                  title: 'Any commitments this week?',
                  isRecruiting: true,
                  done: preseasonCommitments !== undefined,
                  commitmentsCount: preseasonCommitments?.length || 0,
                  classScore,
                  recruitingTid: userTid,
                  recruitingYear: currentDynasty.currentYear,
                  action: () => setShowRecruitingModal(true),
                  actionText: preseasonCommitments !== undefined ? 'Edit' : 'Yes',
                  optional: true
                }
              })()
            ].map(item => {
              return (
              <div
                key={item.num}
                className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-2 sm:gap-0 transition-all ${
                  item.done ? '' : 'hover:ring-1'
                }`}
                style={item.done ? {
                  backgroundColor: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid rgba(34, 197, 94, 0.3)'
                } : {
                  backgroundColor: 'var(--surface-3)',
                  border: '1px solid var(--rule-soft)'
                }}
              >
                <div className="flex items-center gap-2 sm:gap-3">
                  <div
                    className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-display`}
                    style={item.done ? {
                      backgroundColor: 'rgba(34, 197, 94, 0.2)',
                      color: '#22c55e'
                    } : {
                      backgroundColor: `${teamColors.primary}25`,
                      color: teamColors.primary
                    }}
                  >
                    {item.done ? (
                      <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span className="font-bold text-sm sm:text-lg">{item.num}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      className="font-semibold text-sm sm:text-base"
                      style={{ color: item.done ? '#22c55e' : '#fafafa' }}
                    >
                      {item.title}
                    </div>
                    {item.scheduleCount !== undefined && (
                      <div
                        className="text-xs sm:text-sm mt-0.5 sm:mt-1 font-medium"
                        style={{ color: item.done ? '#22c55e' : '#a1a1aa' }}
                      >
                        {item.scheduleCount}/12 games
                        {item.done && <span className="ml-1 sm:ml-2">✓ Ready</span>}
                      </div>
                    )}
                    {item.playerCount !== undefined && (
                      <div
                        className="text-xs sm:text-sm mt-0.5 sm:mt-1 font-medium"
                        style={{ color: item.done ? '#22c55e' : '#a1a1aa' }}
                      >
                        {item.playerCount}/85 players
                        {item.done && <span className="ml-1 sm:ml-2">✓ Ready</span>}
                      </div>
                    )}
                    {item.teamRatings && (
                      <div
                        className="text-xs sm:text-sm mt-0.5 sm:mt-1 font-medium"
                        style={{ color: item.done ? '#22c55e' : '#a1a1aa' }}
                      >
                        {item.teamRatings.overall ? `${item.teamRatings.overall} OVR • ${item.teamRatings.offense} OFF • ${item.teamRatings.defense} DEF` : 'Not entered'}
                        {item.done && <span className="ml-1 sm:ml-2">✓ Ready</span>}
                      </div>
                    )}
                    {item.coachingStaff !== undefined && (
                      <div
                        className="text-xs sm:text-sm mt-0.5 sm:mt-1 font-medium truncate"
                        style={{ color: item.done ? '#22c55e' : '#a1a1aa' }}
                      >
                        {item.coachingStaff?.ocName && item.coachingStaff?.dcName
                          ? `OC: ${item.coachingStaff.ocName} • DC: ${item.coachingStaff.dcName}`
                          : 'Not entered'}
                        {item.done && <span className="ml-1 sm:ml-2">✓ Ready</span>}
                      </div>
                    )}
                    {item.conferences !== undefined && (
                      <div
                        className="text-xs sm:text-sm mt-0.5 sm:mt-1 font-medium"
                        style={{ color: item.done ? '#22c55e' : '#a1a1aa' }}
                      >
                        {item.conferences
                          ? `${Object.keys(item.conferences).length} conferences configured`
                          : 'Default EA CFB 26 alignment'}
                        {item.done && <span className="ml-1 sm:ml-2">✓ Ready</span>}
                      </div>
                    )}
                    {item.isRecruiting && (
                      <>
                        <div
                          className="text-xs sm:text-sm mt-0.5 sm:mt-1 font-medium"
                          style={{
                            color: item.done ? '#22c55e' : '#a1a1aa'
                          }}
                        >
                          {item.done
                            ? item.commitmentsCount > 0
                              ? `✓ ${item.commitmentsCount} commitment${item.commitmentsCount !== 1 ? 's' : ''} recorded`
                              : '✓ No commitments this week'
                            : 'Record any early recruiting commitments'}
                        </div>
                        {item.classScore > 0 && (
                          <Link
                            to={`${pathPrefix}/recruiting/${item.recruitingTid}/${item.recruitingYear}`}
                            className="block w-fit text-[10px] sm:text-xs mt-1 font-bold uppercase text-txt-tertiary hover:text-team-primary transition-colors"
                            style={{ letterSpacing: '1.5px' }}
                            title="View recruiting class"
                          >
                            Class Score <span className="tabular text-txt-primary ml-1">{formatRecruitingClassScore(item.classScore)}</span>
                          </Link>
                        )}
                      </>
                    )}
                  </div>
                </div>
                {isViewOnly ? <ViewOnlyBadge /> : (
                  item.isRecruiting && !item.done ? (
                    <div className="flex gap-2 w-full sm:w-auto items-center">
                      <SellVsSendButton onClick={() => setShowSellCalc(true)} />
                      <button
                        onClick={handleNoCommitments}
                        className="flex-1 sm:flex-none px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-colors text-sm"
                        style={{
                          backgroundColor: teamColors.primary,
                          color: primaryBgText
                        }}
                      >
                        No
                      </button>
                      <button
                        onClick={item.action}
                        className="flex-1 sm:flex-none px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-colors text-sm"
                        style={{
                          backgroundColor: teamColors.primary,
                          color: primaryBgText
                        }}
                      >
                        Yes
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={item.action}
                      className="w-full sm:w-auto px-4 py-2 rounded-xl font-display font-semibold hover:opacity-90 transition-colors text-sm"
                      style={item.optional && !item.done ? {
                        backgroundColor: 'var(--surface-4)',
                        color: '#a1a1aa'
                      } : {
                        backgroundColor: teamColors.primary,
                        color: primaryBgText
                      }}
                    >
                      {item.actionText}
                    </button>
                  )
                )}
              </div>
            )
            })}
          </div>

          {canAdvanceFromPreseason() && (
            <div className="mt-4 p-4 rounded-xl" style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
              <p className="text-sm font-medium text-emerald-400">
                ✓ Pre-season setup complete! Click "Advance Week" in the header to start the season.
              </p>
            </div>
          )}
          </div>
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
              const userScore = playedGame?.perspective?.userScore ?? null
              const oppScore = playedGame?.perspective?.opponentScore ?? null
              const userWon = playedGame?.perspective?.userWon

              const handleEnterGame = () => {
                if (gameRecord) {
                  navigate(`${pathPrefix}/game/${gameRecord.id}/edit`, { state: { from: location.pathname } })
                } else {
                  const opponentTid = scheduledGame?.opponent ? getTidFromAbbr(scheduledGame.opponent) : null
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
                  <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-3 stagger-reveal">
                    {isByeWeek ? (
                      /* Bye-week card occupies the left (game) column; recruiting sidebar still renders on the right so commits can be logged. */
                      <div
                        className="relative rounded-xl overflow-hidden flex flex-col justify-center items-center text-center px-6 py-8"
                        style={{ backgroundColor: 'var(--surface-3)', border: '1px solid var(--rule-soft)' }}
                      >
                        <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ backgroundColor: teamColors.primary }} aria-hidden="true" />
                        <div className="font-bold uppercase text-txt-tertiary" style={{ letterSpacing: '3px', fontSize: '10px' }}>
                          Week {currentDynasty.currentWeek} · Off
                        </div>
                        <div
                          className="font-display font-black leading-none mt-2"
                          style={{
                            fontSize: 'clamp(2.5rem, 7vw, 3.5rem)',
                            color: 'var(--text-primary)',
                            letterSpacing: '-0.02em'
                          }}
                        >
                          BYE WEEK
                        </div>
                        <div className="mt-3 text-[11px] uppercase text-txt-tertiary" style={{ letterSpacing: '2px' }}>
                          No game scheduled
                        </div>
                      </div>
                    ) : (
                      /* Scorebug */
                      <div
                        className="rounded-xl p-3 sm:p-5 flex flex-col justify-between"
                        style={playedGame ? {
                          backgroundColor: 'color-mix(in srgb, #22c55e 10%, var(--surface-3))',
                          border: '1px solid rgba(34, 197, 94, 0.35)'
                        } : {
                          backgroundColor: 'var(--surface-3)',
                          border: '1px solid var(--rule-soft)'
                        }}
                      >
                        {/* Matchup row */}
                        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3">
                          {/* Our team */}
                          <div className="flex flex-col items-center min-w-0">
                            <div className="w-12 h-12 sm:w-20 sm:h-20 flex items-center justify-center">
                              {userLogoUrl
                                ? <img src={userLogoUrl} alt={userAbbr} className="w-full h-full object-contain" />
                                : <div className="w-full h-full rounded-full" style={{ backgroundColor: teamColors.primary }} />}
                            </div>
                          </div>
                          {/* Middle: VS/score */}
                          <div className="flex flex-col items-center gap-1 px-1">
                            {playedGame && userScore != null && oppScore != null ? (
                              <>
                                <div className="flex items-baseline gap-1.5 sm:gap-2 font-display font-black tabular-nums leading-none" style={{ color: 'var(--text-primary)' }}>
                                  <span className="text-2xl sm:text-[2rem]">{userScore}</span>
                                  <span className="text-zinc-600 text-lg sm:text-xl">–</span>
                                  <span className="text-2xl sm:text-[2rem]">{oppScore}</span>
                                </div>
                                <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${userWon ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'}`}>
                                  {userWon ? 'W' : 'L'} · Final
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Week {currentDynasty.currentWeek}</span>
                                <span className="font-display font-black text-lg sm:text-xl leading-none" style={{ color: teamColors.primary }}>{atSymbol.toUpperCase()}</span>
                              </>
                            )}
                          </div>
                          {/* Opponent */}
                          <div className="flex flex-col items-center min-w-0">
                            <div className="w-12 h-12 sm:w-20 sm:h-20 flex items-center justify-center">
                              {oppLogoUrl
                                ? <img src={oppLogoUrl} alt={oppAbbr || 'Opponent'} className="w-full h-full object-contain" />
                                : <div className="w-full h-full rounded-full border-2 border-dashed border-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-400">TBD</div>}
                            </div>
                          </div>
                        </div>
                        {/* CTA */}
                        {!isViewOnly && (
                          <button
                            onClick={handleEnterGame}
                            className="mt-3 sm:mt-4 w-full rounded-lg font-display font-black uppercase tracking-widest py-2 sm:py-3 text-xs sm:text-[13px] transition-all hover:opacity-90 active:translate-y-px"
                            style={{
                              backgroundColor: teamColors.primary,
                              color: primaryBgText,
                              letterSpacing: '2px',
                              boxShadow: `0 6px 24px -8px ${teamColors.primary}66`
                            }}
                          >
                            {playedGame ? 'Edit Game' : 'Enter Game'}
                          </button>
                        )}
                        {isViewOnly && <div className="mt-4 flex justify-center"><ViewOnlyBadge /></div>}
                      </div>
                    )}

                    {/* Recruiting sidebar — always rendered, works on bye weeks too */}
                    <div
                      className="relative rounded-xl overflow-hidden flex flex-col"
                      style={hasCommitmentsData ? {
                        backgroundColor: 'color-mix(in srgb, #22c55e 8%, var(--surface-3))',
                        border: '1px solid rgba(34, 197, 94, 0.3)'
                      } : {
                        backgroundColor: 'var(--surface-3)',
                        border: '1px solid var(--rule-soft)'
                      }}
                    >
                      <div
                        className="absolute top-0 left-0 right-0 h-[2px]"
                        style={{ backgroundColor: hasCommitmentsData ? '#22c55e' : teamColors.primary }}
                        aria-hidden="true"
                      />
                      <div className="p-4 flex flex-col flex-1 gap-3">
                        {/* Eyebrow row with inline tool icons */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-bold uppercase text-txt-tertiary" style={{ letterSpacing: '2px', fontSize: '10px' }}>
                            Recruiting · Wk {currentDynasty.currentWeek}
                          </div>
                          {!isViewOnly && (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setShowSellCalc(true)}
                                className="w-7 h-7 rounded-md text-txt-tertiary hover:text-txt-primary hover:bg-surface-2 transition-colors flex items-center justify-center"
                                title="Sell vs Send Calculator"
                                aria-label="Open Sell vs Send Calculator"
                              >
                                <svg className="w-[15px] h-[15px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                  <rect x="5" y="3" width="14" height="18" rx="2" strokeWidth="1.75" />
                                  <rect x="8" y="6" width="8" height="3" rx="0.5" strokeWidth="1.5" />
                                  <circle cx="9" cy="13" r="0.5" fill="currentColor" />
                                  <circle cx="12" cy="13" r="0.5" fill="currentColor" />
                                  <circle cx="15" cy="13" r="0.5" fill="currentColor" />
                                  <circle cx="9" cy="16.5" r="0.5" fill="currentColor" />
                                  <circle cx="12" cy="16.5" r="0.5" fill="currentColor" />
                                  <circle cx="15" cy="16.5" r="0.5" fill="currentColor" />
                                </svg>
                              </button>
                              <a
                                href="https://collegefootball.gg/recruiting-insight-engine/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-7 h-7 rounded-md text-txt-tertiary hover:text-txt-primary hover:bg-surface-2 transition-colors flex items-center justify-center"
                                title="Recruiting Insight Engine (external)"
                                aria-label="Open Recruiting Insight Engine"
                              >
                                <svg className="w-[15px] h-[15px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true" strokeWidth="1.75">
                                  <circle cx="12" cy="12" r="9" />
                                  <circle cx="12" cy="12" r="3" />
                                  <path strokeLinecap="round" d="M12 1.5v3M12 19.5v3M22.5 12h-3M4.5 12h-3" />
                                </svg>
                              </a>
                            </div>
                          )}
                        </div>

                        {/* Primary display: commits logged OR class score */}
                        <div className="flex-1 flex flex-col justify-center">
                          {hasCommitmentsData ? (
                            <>
                              <div className="font-display font-black leading-none text-green-400 tabular-nums" style={{ fontSize: 'clamp(2rem, 4vw, 2.75rem)', letterSpacing: '-0.01em' }}>
                                {commitmentsCount > 0 ? commitmentsCount : '✓'}
                              </div>
                              <div className="mt-1.5 text-[11px] uppercase font-bold text-green-400/80" style={{ letterSpacing: '1.5px' }}>
                                {commitmentsCount > 0
                                  ? `Commit${commitmentsCount !== 1 ? 's' : ''} Logged`
                                  : 'Week Complete'}
                              </div>
                            </>
                          ) : classScore > 0 ? (
                            <Link
                              to={`${pathPrefix}/recruiting/${userTidForCommitments}/${currentDynasty.currentYear}`}
                              className="block group"
                              title="View recruiting class"
                            >
                              <div className="font-display font-black leading-none tabular-nums text-txt-primary group-hover:opacity-80 transition-opacity" style={{ fontSize: 'clamp(2rem, 4vw, 2.75rem)', letterSpacing: '-0.01em' }}>
                                {formatRecruitingClassScore(classScore)}
                              </div>
                              <div className="mt-1.5 text-[11px] uppercase font-bold text-txt-tertiary" style={{ letterSpacing: '1.5px' }}>
                                {currentDynasty.currentYear} Class Score
                              </div>
                            </Link>
                          ) : (
                            <>
                              <div className="font-display font-black leading-none text-txt-primary" style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', letterSpacing: '-0.01em' }}>
                                Log This Week
                              </div>
                              <div className="mt-1.5 text-[11px] uppercase font-bold text-txt-tertiary" style={{ letterSpacing: '1.5px' }}>
                                {currentDynasty.currentYear} Class
                              </div>
                            </>
                          )}
                        </div>

                        {/* Primary CTA */}
                        {!isViewOnly && (
                          <button
                            onClick={() => setShowRecruitingModal(true)}
                            className="w-full py-2.5 rounded-lg font-display font-black uppercase text-xs transition-all hover:opacity-90 active:translate-y-px"
                            style={{
                              backgroundColor: teamColors.primary,
                              color: primaryBgText,
                              letterSpacing: '2px',
                              boxShadow: `0 6px 24px -8px ${teamColors.primary}66`
                            }}
                          >
                            {hasCommitmentsData ? 'Edit Commits' : 'Log Commits'}
                          </button>
                        )}
                        <div className="mt-2 flex justify-center">
                          <RecruitingInsightLink />
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      ) : currentDynasty.currentPhase === 'conference_championship' ? (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--rule-soft)' }}
        >
          <div className="px-4 pt-3 pb-4 sm:px-6 sm:pt-3 sm:pb-6">
          <div className="flex items-center gap-3 mb-3 sm:mb-4">
            <div className="w-1 h-10 sm:h-12 rounded-full flex-shrink-0" style={{ backgroundColor: teamColors.primary }} />
            <h3 className="font-display font-black uppercase leading-none text-txt-primary" style={{ fontSize: 'clamp(1.25rem, 2vw, 1.75rem)', letterSpacing: '-0.01em' }}>
              Conference Championship Week
            </h3>
          </div>

          {(() => {
            const ccGame = getCCGame()
            const hasCoordinators = currentDynasty.coachPosition === 'HC' &&
              (teamCoachingStaff?.ocName || teamCoachingStaff?.dcName)
            const coordinatorTaskComplete = coordinatorToFire !== ''

            // Task 1: Made championship question (answered = complete)
            const ccQuestionComplete = ccMadeChampionship !== null
            // Task 2: Enter game (only when madeChampionship = true, complete when game exists)
            const showGameEntryTask = ccMadeChampionship === true
            const ccGameComplete = !!ccGame

            // Calculate task numbers dynamically
            let taskNum = 1

            return (
              <div className="-space-y-px">
                {/* Task 1: Made Conference Championship? */}
                <div
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-3 sm:gap-0 transition-all"
                  style={ccQuestionComplete ? {
                    backgroundColor: 'rgba(34, 197, 94, 0.1)',
                    border: '1px solid rgba(34, 197, 94, 0.3)'
                  } : {
                    backgroundColor: 'var(--surface-3)',
                    border: '1px solid var(--rule-soft)'
                  }}
                >
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div
                      className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-display font-bold"
                      style={ccQuestionComplete ? {
                        backgroundColor: 'rgba(34, 197, 94, 0.2)',
                        color: '#22c55e'
                      } : {
                        backgroundColor: `${teamColors.primary}25`,
                        color: teamColors.primary
                      }}
                    >
                      {ccQuestionComplete ? (
                        <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (taskNum)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm sm:text-base font-semibold" style={{ color: ccQuestionComplete ? '#22c55e' : '#fafafa' }}>
                        Made {userTeamConference} Championship?
                      </div>
                      <div className="text-xs sm:text-sm mt-0.5" style={{ color: ccQuestionComplete ? '#22c55e' : '#a1a1aa' }}>
                        {ccMadeChampionship === null ? 'Did you make the championship game?' :
                         ccMadeChampionship === false ? 'Did not make championship' :
                         'Made the championship game'}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 self-end sm:self-auto">
                    {ccMadeChampionship === null ? (
                      <>
                        <button
                          onClick={() => handleCCAnswer(true)}
                          className="px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm"
                          style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => handleCCAnswer(false)}
                          className="px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm"
                          style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                        >
                          No
                        </button>
                      </>
                    ) : isViewOnly ? (
                      <ViewOnlyBadge />
                    ) : (
                      <button
                        onClick={async () => {
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
                        }}
                        className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm"
                        style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                      >
                        Edit
                      </button>
                    )}
                  </div>
                </div>

                {/* Task 2: Enter Championship Game (only shown when made championship = true) */}
                {showGameEntryTask && (() => {
                  taskNum++
                  return (
                    <div
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-3 sm:gap-0 transition-all"
                      style={ccGameComplete ? {
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        border: '1px solid rgba(34, 197, 94, 0.3)'
                      } : {
                        backgroundColor: 'var(--surface-3)',
                        border: '1px solid var(--rule-soft)'
                      }}
                    >
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div
                          className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center flex-shrink-0 font-bold ${
                            ccGameComplete ? 'bg-green-500 text-white' : ''
                          }`}
                          style={!ccGameComplete ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                        >
                          {ccGameComplete ? (
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (taskNum)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm sm:text-base font-semibold" style={{ color: ccGameComplete ? '#22c55e' : '#fafafa' }}>
                            {userTeamConference} Championship
                          </div>
                          <div className="text-xs sm:text-sm mt-0.5" style={{ color: ccGameComplete ? '#22c55e' : '#a1a1aa' }}>
                            {ccGame ? `${ccGame.perspective?.userWon ? 'W' : 'L'} ${Math.max(ccGame.perspective?.userScore || 0, ccGame.perspective?.opponentScore || 0)}-${Math.min(ccGame.perspective?.userScore || 0, ccGame.perspective?.opponentScore || 0)} vs ${(() => { const oppInfo = getGameTeamInfo(currentDynasty?.teams || TEAMS, ccGame.perspective?.opponentTid); return getMascotName(oppInfo?.abbr) || oppInfo?.name || 'Unknown' })()}` :
                             ccOpponent ? `vs ${getMascotName(ccOpponent) || ccOpponent}` : 'Select opponent and enter result'}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 self-end sm:self-auto">
                        {!ccOpponent && !ccGame ? (
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
                        ) : isViewOnly ? (
                          <ViewOnlyBadge />
                        ) : (
                          <button
                            onClick={() => {
                              if (ccGame) {
                                navigate(`${pathPrefix}/game/${ccGame.id}/edit`, { state: { from: location.pathname } })
                              } else {
                                const opponentTid = getTidFromAbbr(ccOpponent)
                                const params = new URLSearchParams({
                                  week: 'CC',
                                  year: currentDynasty.currentYear?.toString() || '',
                                  team1Tid: userTeamTid?.toString() || '',
                                  team2Tid: opponentTid?.toString() || '',
                                  gameType: 'conference_championship',
                                  conference: userTeamConference || ''
                                })
                                navigate(`${pathPrefix}/game/new?${params.toString()}`, { state: { from: location.pathname } })
                              }
                            }}
                            className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm"
                            style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                          >
                            {ccGame ? 'Edit' : 'Enter Game'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })()}

                {/* Task: Coordinator Changes (always visible for HC with coordinators) */}
                {hasCoordinators && (() => {
                  taskNum++
                  return (
                  <div
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-3 sm:gap-0 transition-all"
                    style={coordinatorTaskComplete ? {
                      backgroundColor: 'rgba(34, 197, 94, 0.1)',
                      border: '1px solid rgba(34, 197, 94, 0.3)'
                    } : {
                      backgroundColor: 'var(--surface-3)',
                      border: '1px solid var(--rule-soft)'
                    }}
                  >
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div
                        className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center flex-shrink-0 font-bold ${
                          coordinatorTaskComplete ? 'bg-green-500 text-white' : ''
                        }`}
                        style={!coordinatorTaskComplete ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                      >
                        {coordinatorTaskComplete ? (
                          <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (taskNum)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm sm:text-base font-semibold" style={{ color: coordinatorTaskComplete ? '#22c55e' : '#fafafa' }}>
                          Coordinator Changes
                        </div>
                        <div className="text-xs sm:text-sm mt-0.5" style={{ color: coordinatorTaskComplete ? '#22c55e' : '#a1a1aa' }}>
                          {coordinatorTaskComplete ? (
                            coordinatorToFire === 'none' ? 'Keeping both coordinators' :
                            coordinatorToFire === 'oc' ? `Firing ${teamCoachingStaff?.ocName} (OC)` :
                            coordinatorToFire === 'dc' ? `Firing ${teamCoachingStaff?.dcName} (DC)` :
                            coordinatorToFire === 'both' ? 'Firing both coordinators' : ''
                          ) : 'Fire any coordinators?'}
                        </div>
                      </div>
                    </div>
                    <select
                      value={coordinatorToFire}
                      onChange={(e) => handleFiringSelection(e.target.value)}
                      className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold cursor-pointer text-sm self-end sm:self-auto"
                      style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
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
                  </div>
                  )
                })()}

                {/* Task: Recruiting Commitments */}
                {(() => {
                  taskNum++
                  const commitmentKey = getCommitmentKey()
                  const userTidForCommits = getUserTeamTid(currentDynasty)
                  const ccCommitmentsForYear = getRecruitingCommitments(currentDynasty, userTidForCommits, currentDynasty.currentYear)
                  const ccCommitments = ccCommitmentsForYear?.[commitmentKey]
                  const hasCommitmentsData = ccCommitments !== undefined
                  const commitmentsCount = ccCommitments?.length || 0
                  const classScore = calculateRecruitingClassScore(flattenClassCommitments(ccCommitmentsForYear))

                  return (
                    <div
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-3 sm:gap-0 transition-all"
                      style={hasCommitmentsData ? {
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        border: '1px solid rgba(34, 197, 94, 0.3)'
                      } : {
                        backgroundColor: 'var(--surface-3)',
                        border: '1px solid var(--rule-soft)'
                      }}
                    >
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div
                          className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center flex-shrink-0 font-bold ${
                            hasCommitmentsData ? 'bg-green-500 text-white' : ''
                          }`}
                          style={!hasCommitmentsData ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                        >
                          {hasCommitmentsData ? (
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (taskNum)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm sm:text-base font-semibold" style={{ color: hasCommitmentsData ? '#22c55e' : '#fafafa' }}>
                            {hasCommitmentsData ? 'Recruiting Commitments' : 'Any commitments this week?'}
                          </div>
                          <div className="text-xs sm:text-sm mt-0.5" style={{ color: hasCommitmentsData ? '#22c55e' : '#a1a1aa' }}>
                            {hasCommitmentsData
                              ? commitmentsCount > 0
                                ? `✓ ${commitmentsCount} commitment${commitmentsCount !== 1 ? 's' : ''} recorded`
                                : '✓ No commitments this week'
                              : 'Record any recruiting commitments'}
                          </div>
                          {classScore > 0 && (
                            <Link
                              to={`${pathPrefix}/recruiting/${userTidForCommits}/${currentDynasty.currentYear}`}
                              className="block w-fit text-[10px] sm:text-xs mt-1 font-bold uppercase text-txt-tertiary hover:text-team-primary transition-colors"
                              style={{ letterSpacing: '1.5px' }}
                              title="View recruiting class"
                            >
                              Class Score <span className="tabular text-txt-primary ml-1">{formatRecruitingClassScore(classScore)}</span>
                            </Link>
                          )}
                          <RecruitingInsightLink className="mt-1" />
                        </div>
                      </div>
                      {isViewOnly ? <ViewOnlyBadge /> : (
                        !hasCommitmentsData ? (
                          <div className="flex gap-2 self-end sm:self-auto items-center">
                            <SellVsSendButton onClick={() => setShowSellCalc(true)} />
                            <button
                              onClick={handleNoCommitments}
                              className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm"
                              style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                            >
                              No
                            </button>
                            <button
                              onClick={() => setShowRecruitingModal(true)}
                              className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm"
                              style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                            >
                              Yes
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setShowRecruitingModal(true)}
                            className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm self-end sm:self-auto"
                            style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                          >
                            Edit
                          </button>
                        )
                      )}
                    </div>
                  )
                })()}
              </div>
            )
          })()}
          </div>
        </div>
      ) : currentDynasty.currentPhase === 'postseason' ? (
        // Postseason / Bowl Weeks
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--rule-soft)' }}>
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
            const bowlWeek1FromGames = allGames.filter(g => g && g.isBowlGame && g.bowlWeek === 'week1' && Number(g.year) === Number(year))
            const bowlWeek1Legacy = currentDynasty.bowlGamesByYear?.[year]?.week1 || []
            const hasBowlWeek1Data = bowlWeek1FromGames.length > 0 || bowlWeek1Legacy.length > 0

            // Bowl Week 2 - check games[] then fallback to legacy bowlGamesByYear
            const bowlWeek2FromGames = allGames.filter(g => g && g.isBowlGame && g.bowlWeek === 'week2' && Number(g.year) === Number(year))
            const bowlWeek2Legacy = currentDynasty.bowlGamesByYear?.[year]?.week2 || []
            const hasBowlWeek2Data = bowlWeek2FromGames.length > 0 || bowlWeek2Legacy.length > 0

            // Count entered games for Week 1 (26 regular bowls + 4 CFP First Round = 30 total)
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
            const userBowlIsWeek1Temp = selectedBowl && isBowlInWeek1(selectedBowl)
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
            const userBowlIsWeek2Temp = selectedBowl && isBowlInWeek2(selectedBowl)
            const userBowlWeek2NotCounted = userBowlHasScores && userBowlIsWeek2Temp && !bowlWeek2Games.some(g => g.id === userBowlGameTemp?.id)
            const userCFPQFGameTemp = findCurrentTeamGame(currentDynasty, g => (g.isCFPQuarterfinal || g.gameType === GAME_TYPES.CFP_QUARTERFINAL) && isSameYear(g.year, currentDynasty.currentYear))
            const userCFPQFHasScores = userCFPQFGameTemp && userCFPQFGameTemp.team1Score !== undefined && userCFPQFGameTemp.team1Score !== null
            const userCFPQFIsInList = userCFPQFGameTemp && cfpQuarterfinalGames.some(g => g.id === userCFPQFGameTemp.id || (g.cfpSlot && g.cfpSlot === userCFPQFGameTemp.cfpSlot))
            const userCFPQFNotCounted = userCFPQFHasScores && !userCFPQFIsInList

            const totalEnteredWeek2 = enteredBowlWeek2 + enteredCFPQuarterfinals + (userBowlWeek2NotCounted ? 1 : 0) + (userCFPQFNotCounted ? 1 : 0)
            const userBowlGame = findCurrentTeamGame(currentDynasty, g => g.isBowlGame && isSameYear(g.year, currentDynasty.currentYear))
            const userCFPFirstRoundGame = findCurrentTeamGame(currentDynasty, g => (g.isCFPFirstRound || g.gameType === GAME_TYPES.CFP_FIRST_ROUND) && isSameYear(g.year, currentDynasty.currentYear))
            const userCFPFirstRoundShell = findUserCFPGameShell(currentDynasty, 'first_round', currentDynasty.currentYear)
            const userBowlIsWeek1 = selectedBowl && isBowlInWeek1(selectedBowl)
            const userBowlIsWeek2 = selectedBowl && isBowlInWeek2(selectedBowl)

            // Filter team dropdown for bowl opponent
            const filteredBowlTeams = bowlOpponentSearch
              ? Object.entries(teamAbbreviations)
                  .filter(([abbr, data]) =>
                    abbr.toLowerCase().includes(bowlOpponentSearch.toLowerCase()) ||
                    data.name.toLowerCase().includes(bowlOpponentSearch.toLowerCase())
                  )
                  .slice(0, 8)
              : Object.entries(teamAbbreviations).slice(0, 8)

            // All bowl games for dropdown (CFP options removed - handled automatically)
            const allBowlGames = getAllBowlGamesList()

            // Check if user's team is in the CFP - prefer tid lookup
            const userTeamAbbr = getCurrentTeamAbbr(currentDynasty)
            const cfpSeeds = currentDynasty.cfpSeedsByYear?.[currentDynasty.currentYear] || []
            // Check tid first, then abbr for backward compatibility
            const userCFPSeed = cfpSeeds.find(s => s.tid === userTeamTid)?.seed || null

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

            // CFP Quarterfinals tracking
            // Try to find via findCurrentTeamGame (works when both teams have tids set)
            // Also check for shell (works even when team2Tid is null for bye seeds)
            const userCFPQuarterfinalGame = findCurrentTeamGame(currentDynasty, g => (g.isCFPQuarterfinal || g.gameType === GAME_TYPES.CFP_QUARTERFINAL) && isSameYear(g.year, currentDynasty.currentYear))
            const userCFPQuarterfinalShell = findUserCFPGameShell(currentDynasty, 'quarterfinal', currentDynasty.currentYear)
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

            // Week 1: CC data, bowl eligibility question, then bowl results
            if (week === 1) {
              return (
                <>
                  <div className="flex items-center gap-3 mb-3 sm:mb-4">
                    <div className="w-1 h-10 sm:h-12 rounded-full flex-shrink-0" style={{ backgroundColor: teamColors.primary }} />
                    <h3 className="font-display font-black uppercase leading-none text-txt-primary" style={{ fontSize: 'clamp(1.25rem, 2vw, 1.75rem)', letterSpacing: '-0.01em' }}>
                      Bowl Week 1
                    </h3>
                  </div>
                  <div className="-space-y-px">
                    {/* Task 1: CC Results */}
                    <div
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-3 sm:gap-0 transition-all"
                      style={hasCCData ? {
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        border: '1px solid rgba(34, 197, 94, 0.3)'
                      } : {
                        backgroundColor: 'var(--surface-3)',
                        border: '1px solid var(--rule-soft)'
                      }}
                    >
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div
                          className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center flex-shrink-0 ${
                            hasCCData ? 'bg-green-500 text-white' : ''
                          }`}
                          style={!hasCCData ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                        >
                          {hasCCData ? (
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : <span className="font-bold text-sm sm:text-base">1</span>}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-semibold" style={{ color: hasCCData ? '#22c55e' : '#fafafa' }}>
                            Conference Championship Results
                          </div>
                          <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: hasCCData ? '#22c55e' : '#a1a1aa' }}>
                            {ccGamesWithScores === totalCCGames ? `✓ All ${totalCCGames} games entered` : `${ccGamesWithScores}/${totalCCGames} games entered`}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => setShowCCModal(true)}
                        className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm self-end sm:self-auto"
                        style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                      >
                        {hasCCData ? 'Edit' : 'Enter'}
                      </button>
                    </div>

                    {/* Task 2: CFP Seeds */}
                    <div
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-3 sm:gap-0 transition-all"
                      style={hasCFPSeedsData ? {
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        border: '1px solid rgba(34, 197, 94, 0.3)'
                      } : {
                        backgroundColor: 'var(--surface-3)',
                        border: '1px solid var(--rule-soft)'
                      }}
                    >
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div
                          className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center flex-shrink-0 ${
                            hasCFPSeedsData ? 'bg-green-500 text-white' : ''
                          }`}
                          style={!hasCFPSeedsData ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                        >
                          {hasCFPSeedsData ? (
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : <span className="font-bold text-sm sm:text-base">2</span>}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-semibold" style={{ color: hasCFPSeedsData ? '#22c55e' : '#fafafa' }}>
                            CFP Seeds (1-12)
                          </div>
                          <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: hasCFPSeedsData ? '#22c55e' : '#a1a1aa' }}>
                            {hasCFPSeedsData ? '✓ Seeds entered' : '12 playoff teams'}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => setShowCFPSeedsModal(true)}
                        className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm self-end sm:self-auto"
                        style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                      >
                        {hasCFPSeedsData ? 'Edit' : 'Enter'}
                      </button>
                    </div>

                    {/* Task 3: Bowl/CFP Status */}
                    {(() => {
                      const bowlTaskComplete = hasCFPSeedsData && (userHasCFPBye || userInCFPFirstRound || (bowlEligible !== null && (bowlEligible === false || (bowlEligible && selectedBowl && bowlOpponent))))
                      // Edit button only shows when CFP seeds are entered AND bowl eligibility has been answered
                      const showBowlEditButton = hasCFPSeedsData && !userCFPSeed && bowlEligible !== null && (bowlEligible === false || (bowlEligible && selectedBowl && bowlOpponent))

                      return (
                        <div
                          className="p-3 sm:p-4 transition-all"
                          style={bowlTaskComplete ? {
                            backgroundColor: 'rgba(34, 197, 94, 0.1)',
                            border: '1px solid rgba(34, 197, 94, 0.3)'
                          } : {
                            backgroundColor: 'var(--surface-3)',
                            border: '1px solid var(--rule-soft)'
                          }}
                        >
                          <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 ${!bowlTaskComplete || (!hasCFPSeedsData || bowlEligible === null || (!userCFPSeed && bowlEligible && (!selectedBowl || !bowlOpponent))) ? 'mb-3' : ''}`}>
                            <div className="flex items-center gap-2 sm:gap-3">
                              <div
                                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center flex-shrink-0 ${bowlTaskComplete ? 'bg-green-500 text-white' : ''}`}
                                style={!bowlTaskComplete ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                              >
                                {bowlTaskComplete ? (
                                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                ) : <span className="font-bold text-sm sm:text-base">3</span>}
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm sm:text-base font-semibold" style={{ color: bowlTaskComplete ? '#22c55e' : '#fafafa' }}>
                                  {userCFPSeed ? 'Your CFP Game' : 'Your Bowl Game'}
                                </div>
                                {/* Show status text inline when complete */}
                                {userHasCFPBye && (
                                  <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: '#22c55e' }}>
                                    ✓ #{userCFPSeed} Seed - Bye to Quarterfinals (Week 2)
                                  </div>
                                )}
                                {userInCFPFirstRound && (
                                  <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: '#22c55e' }}>
                                    ✓ #{userCFPSeed} Seed vs #{17 - userCFPSeed} {getMascotName(userCFPOpponent)}
                                  </div>
                                )}
                                {hasCFPSeedsData && !userCFPSeed && bowlEligible === false && (
                                  <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: '#22c55e' }}>
                                    ✓ Not bowl eligible this year
                                  </div>
                                )}
                                {hasCFPSeedsData && !userCFPSeed && bowlEligible && selectedBowl && bowlOpponent && (
                                  <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: '#22c55e' }}>
                                    ✓ {selectedBowl} vs {bowlOpponent}
                                    {userBowlIsWeek2 && <span className="ml-2 opacity-70">(plays in Week 2)</span>}
                                  </div>
                                )}
                              </div>
                            </div>
                            {/* Edit button in header when bowl selection is complete */}
                            {showBowlEditButton && (
                              <button
                                onClick={async () => {
                                  setBowlEligible(null)
                                  setSelectedBowl('')
                                  setBowlOpponent('')
                                  // Remove any existing bowl game from games array (team-centric)
                                  // Uses unified format: check if user's team is in the game via perspective
                                  const existingBowlGame = findCurrentTeamGame(currentDynasty, g => g.isBowlGame && isSameYear(g.year, currentDynasty.currentYear))
                                  const updatedGames = existingBowlGame
                                    ? currentDynasty.games.filter(g => !(g.isBowlGame && isSameYear(g.year, currentDynasty.currentYear) && getUserGamePerspective(g, currentDynasty)))
                                    : currentDynasty.games
                                  // Clear year-specific bowl eligibility data
                                  const existingByYear = currentDynasty.bowlEligibilityDataByYear || {}
                                  const { [currentYear]: _, ...restByYear } = existingByYear
                                  await updateDynasty(currentDynasty.id, {
                                    bowlEligibilityDataByYear: restByYear,
                                    games: updatedGames
                                  })
                                }}
                                className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm self-end sm:self-auto"
                                style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                              >
                                Edit
                              </button>
                            )}
                          </div>

                          {/* Content area for incomplete states */}
                          {!hasCFPSeedsData && (
                            <div className="ml-13 pl-10">
                              <p className="text-sm" style={{ color: '#a1a1aa' }}>
                                Enter CFP Seeds first
                              </p>
                            </div>
                          )}
                          {hasCFPSeedsData && !userCFPSeed && bowlEligible === null && (
                            <div className="ml-13 pl-10">
                              <p className="mb-3" style={{ color: '#a1a1aa' }}>Did you make a bowl game?</p>
                              <div className="flex gap-3">
                                <button
                                  onClick={async () => {
                                    setBowlEligible(true)
                                    const existingByYear = currentDynasty.bowlEligibilityDataByYear || {}
                                    await updateDynasty(currentDynasty.id, {
                                      bowlEligibilityDataByYear: {
                                        ...existingByYear,
                                        [currentYear]: { eligible: true, bowlGame: '', opponent: '' }
                                      }
                                    })
                                  }}
                                  className="px-6 py-2 rounded-lg font-semibold hover:opacity-90"
                                  style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                                >
                                  Yes
                                </button>
                                <button
                                  onClick={async () => {
                                    setBowlEligible(false)
                                    const existingByYear = currentDynasty.bowlEligibilityDataByYear || {}
                                    await updateDynasty(currentDynasty.id, {
                                      bowlEligibilityDataByYear: {
                                        ...existingByYear,
                                        [currentYear]: { eligible: false, bowlGame: null, opponent: null }
                                      }
                                    })
                                  }}
                                  className="px-6 py-2 rounded-lg font-semibold hover:opacity-90"
                                  style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                                >
                                  No
                                </button>
                              </div>
                            </div>
                          )}
                          {hasCFPSeedsData && !userCFPSeed && bowlEligible === true && !selectedBowl && (
                            <div className="ml-13 pl-10">
                              <p className="mb-2" style={{ color: '#a1a1aa' }}>Which bowl game?</p>
                              <div className="max-w-xs">
                                <DropdownSelect
                                  options={allBowlGames}
                                  value={selectedBowl}
                                  onChange={async (bowl) => {
                                    setSelectedBowl(bowl)
                                    const existingByYear = currentDynasty.bowlEligibilityDataByYear || {}
                                    const currentBowlData = existingByYear[currentYear] || {}
                                    await updateDynasty(currentDynasty.id, {
                                      bowlEligibilityDataByYear: {
                                        ...existingByYear,
                                        [currentYear]: { ...currentBowlData, eligible: true, bowlGame: bowl }
                                      }
                                    })
                                  }}
                                  placeholder="Search bowls..."
                                  teamColors={teamColors}
                                />
                              </div>
                            </div>
                          )}
                          {hasCFPSeedsData && !userCFPSeed && bowlEligible === true && selectedBowl && !bowlOpponent && (
                            <div className="ml-13 pl-10">
                              <p className="mb-2" style={{ color: '#a1a1aa' }}>Playing in: <strong style={{ color: '#fafafa' }}>{selectedBowl}</strong></p>
                              <p className="mb-2" style={{ color: '#a1a1aa' }}>Who is your opponent?</p>
                              <div className="max-w-xs">
                                <SearchableSelect
                                  options={teams}
                                  value={bowlOpponent}
                                  onChange={async (value) => {
                                    setBowlOpponent(value)
                                    const existingByYear = currentDynasty.bowlEligibilityDataByYear || {}
                                    const currentBowlData = existingByYear[currentYear] || {}
                                    await updateDynasty(currentDynasty.id, {
                                      bowlEligibilityDataByYear: {
                                        ...existingByYear,
                                        [currentYear]: { ...currentBowlData, opponent: value }
                                      }
                                    })
                                  }}
                                  placeholder="Search for opponent..."
                                  teamColors={teamColors}
                                  dynastyTeams={currentDynasty?.teams}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    {/* Task 4: Enter YOUR CFP First Round Game (if seeded 5-12) */}
                    {hasCFPSeedsData && userInCFPFirstRound && (
                      <div
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-3 sm:gap-0 transition-all"
                        style={userCFPFirstRoundGame ? {
                          backgroundColor: 'rgba(34, 197, 94, 0.1)',
                          border: '1px solid rgba(34, 197, 94, 0.3)'
                        } : {
                          backgroundColor: 'var(--surface-3)',
                          border: '1px solid var(--rule-soft)'
                        }}
                      >
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div
                            className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center flex-shrink-0 ${
                              userCFPFirstRoundGame ? 'bg-green-500 text-white' : ''
                            }`}
                            style={!userCFPFirstRoundGame ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                          >
                            {userCFPFirstRoundGame ? (
                              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : <span className="font-bold text-sm sm:text-base">4</span>}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm sm:text-base font-semibold" style={{ color: userCFPFirstRoundGame ? '#22c55e' : '#fafafa' }}>
                              Enter Your CFP First Round Game
                            </div>
                            <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: userCFPFirstRoundGame ? '#22c55e' : '#a1a1aa' }}>
                              {userCFPFirstRoundGame ? `✓ ${userCFPFirstRoundGame.perspective?.userWon ? 'Won' : 'Lost'} ${Math.max(userCFPFirstRoundGame.perspective?.userScore || 0, userCFPFirstRoundGame.perspective?.opponentScore || 0)}-${Math.min(userCFPFirstRoundGame.perspective?.userScore || 0, userCFPFirstRoundGame.perspective?.opponentScore || 0)}` : `#${userCFPSeed} vs #${17 - userCFPSeed} ${getMascotName(userCFPOpponent)}`}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            // Use game with perspective first, then shell, then create new
                            const gameToEdit = userCFPFirstRoundGame || userCFPFirstRoundShell
                            if (gameToEdit) {
                              navigate(`${pathPrefix}/game/${gameToEdit.id}/edit`, { state: { from: location.pathname } })
                            } else {
                              // userCFPOpponent can be tid (number) or abbr (string)
                              const opponentTid = typeof userCFPOpponent === 'number' ? userCFPOpponent : getTidFromAbbr(userCFPOpponent)
                              const params = new URLSearchParams({
                                week: 'CFP First Round',
                                year: currentDynasty.currentYear?.toString() || '',
                                team1Tid: userTeamTid?.toString() || '',
                                team2Tid: opponentTid?.toString() || '',
                                gameType: 'cfp_first_round'
                              })
                              navigate(`${pathPrefix}/game/new?${params.toString()}`, { state: { from: location.pathname } })
                            }
                          }}
                          className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm self-end sm:self-auto"
                          style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                        >
                          {(userCFPFirstRoundGame || (userCFPFirstRoundShell?.team1Score !== null)) ? 'Edit' : 'Enter'}
                        </button>
                      </div>
                    )}

                    {/* Task 4b: Enter YOUR Bowl Game (if Week 1 bowl, non-CFP team) */}
                    {hasCFPSeedsData && !userCFPSeed && bowlEligible && selectedBowl && bowlOpponent && userBowlIsWeek1 && (
                      <div
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-3 sm:gap-0 transition-all"
                        style={userBowlGame ? {
                          backgroundColor: 'rgba(34, 197, 94, 0.1)',
                          border: '1px solid rgba(34, 197, 94, 0.3)'
                        } : {
                          backgroundColor: 'var(--surface-3)',
                          border: '1px solid var(--rule-soft)'
                        }}
                      >
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div
                            className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center flex-shrink-0 ${
                              userBowlGame ? 'bg-green-500 text-white' : ''
                            }`}
                            style={!userBowlGame ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                          >
                            {userBowlGame ? (
                              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : <span className="font-bold text-sm sm:text-base">4</span>}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm sm:text-base font-semibold" style={{ color: userBowlGame ? '#22c55e' : '#fafafa' }}>
                              Enter Your {selectedBowl} Game
                            </div>
                            <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: userBowlGame ? '#22c55e' : '#a1a1aa' }}>
                              {userBowlGame ? `✓ ${userBowlGame.perspective?.userWon ? 'Won' : 'Lost'} ${Math.max(userBowlGame.perspective?.userScore || 0, userBowlGame.perspective?.opponentScore || 0)}-${Math.min(userBowlGame.perspective?.userScore || 0, userBowlGame.perspective?.opponentScore || 0)}` : `vs ${bowlOpponent}`}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            if (userBowlGame) {
                              navigate(`${pathPrefix}/game/${userBowlGame.id}/edit`, { state: { from: location.pathname } })
                            } else {
                              // bowlOpponent is a team name (e.g., "Texas Longhorns"), not abbreviation
                              const opponentTid = getTidFromTeamName(bowlOpponent, currentDynasty?.teams)
                              const params = new URLSearchParams({
                                week: 'Bowl',
                                year: currentDynasty.currentYear?.toString() || '',
                                team1Tid: userTeamTid?.toString() || '',
                                team2Tid: opponentTid?.toString() || '',
                                gameType: 'bowl',
                                bowlName: selectedBowl || ''
                              })
                              navigate(`${pathPrefix}/game/new?${params.toString()}`, { state: { from: location.pathname } })
                            }
                          }}
                          className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm self-end sm:self-auto"
                          style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                        >
                          {userBowlGame ? 'Edit' : 'Enter'}
                        </button>
                      </div>
                    )}

                    {/* Task: Taking a New Job? */}
                    <div
                      className="p-3 sm:p-4 transition-all"
                      style={takingNewJob !== null ? {
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        border: '1px solid rgba(34, 197, 94, 0.3)'
                      } : {
                        backgroundColor: 'var(--surface-3)',
                        border: '1px solid var(--rule-soft)'
                      }}
                    >
                      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 ${takingNewJob === null || (takingNewJob === true && (!newJobTeam || !newJobPosition)) ? 'mb-3' : ''}`}>
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div
                            className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center flex-shrink-0 ${
                              takingNewJob !== null ? 'bg-green-500 text-white' : ''
                            }`}
                            style={takingNewJob === null ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                          >
                            {takingNewJob !== null ? (
                              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : <span className="font-bold text-sm sm:text-base">5</span>}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm sm:text-base font-semibold" style={{ color: takingNewJob !== null ? '#22c55e' : '#fafafa' }}>
                              Taking a New Job? (Bowl Week 1)
                            </div>
                            {takingNewJob === true && newJobTeam && newJobPosition && (
                              <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: '#22c55e' }}>
                                ✓ {newJobPosition} at {getTeamNameFromAbbr(newJobTeam)}
                              </div>
                            )}
                            {takingNewJob === false && (
                              <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: '#22c55e' }}>
                                ✓ Staying with current team
                              </div>
                            )}
                          </div>
                        </div>
                        {/* Edit button in header when complete */}
                        {(takingNewJob === false || (takingNewJob === true && newJobTeam && newJobPosition)) && (
                          <button
                            onClick={async () => {
                              setTakingNewJob(null)
                              setNewJobTeam('')
                              setNewJobPosition('')
                              // Clear pendingUserId from any team
                              const updatedTeams = clearPendingUserTeam(currentDynasty.teams)
                              await updateDynasty(currentDynasty.id, {
                                newJobData: null,
                                teams: updatedTeams
                              })
                            }}
                            className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm self-end sm:self-auto"
                            style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                          >
                            Edit
                          </button>
                        )}
                      </div>

                      {takingNewJob === null && (
                        <div className="ml-13 pl-10">
                          <div className="flex gap-3">
                            <button
                              onClick={async () => {
                                setTakingNewJob(true)
                                await updateDynasty(currentDynasty.id, {
                                  newJobData: { takingNewJob: true, team: '', position: '' }
                                })
                              }}
                              className="px-6 py-2 rounded-lg font-semibold hover:opacity-90"
                              style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                            >
                              Yes
                            </button>
                            <button
                              onClick={async () => {
                                setTakingNewJob(false)
                                await updateDynasty(currentDynasty.id, {
                                  newJobData: { takingNewJob: false, team: null, position: null, declinedInWeek: currentDynasty.currentWeek }
                                })
                              }}
                              className="px-6 py-2 rounded-lg font-semibold hover:opacity-90"
                              style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                            >
                              No
                            </button>
                          </div>
                        </div>
                      )}
                      {takingNewJob === true && !newJobTeam && (
                        <div className="ml-13 pl-10">
                          <p className="mb-2" style={{ color: '#a1a1aa' }}>Which team?</p>
                          <div className="max-w-xs">
                            <SearchableSelect
                              options={teams}
                              value={newJobTeam}
                              onChange={async (value) => {
                                setNewJobTeam(value)
                                // IMPORTANT: Always include takingNewJob: true to prevent state loss
                                const updatePayload = {
                                  newJobData: { ...currentDynasty.newJobData, takingNewJob: true, team: value }
                                }
                                await updateDynasty(currentDynasty.id, updatePayload)
                              }}
                              placeholder="Search for team..."
                              teamColors={teamColors}
                              dynastyTeams={currentDynasty?.teams}
                            />
                          </div>
                        </div>
                      )}
                      {takingNewJob === true && newJobTeam && !newJobPosition && (
                        <div className="ml-13 pl-10">
                          <p className="mb-2" style={{ color: '#a1a1aa' }}>
                            New team: <strong style={{ color: '#fafafa' }}>{getTeamNameFromAbbr(newJobTeam)}</strong>
                          </p>
                          <p className="mb-2" style={{ color: '#a1a1aa' }}>What position?</p>
                          <div className="flex gap-2 flex-wrap">
                            {['HC', 'OC', 'DC'].map(pos => (
                              <button
                                key={pos}
                                onClick={async () => {
                                  setNewJobPosition(pos)
                                  // Get tid of the new team and set pendingUserId
                                  const newTeamTid = getTidFromTeamName(currentDynasty.newJobData?.team, currentDynasty.teams)
                                  const updatedTeams = newTeamTid
                                    ? setPendingUserTeam(currentDynasty.teams, newTeamTid, pos)
                                    : currentDynasty.teams
                                  // IMPORTANT: Always include takingNewJob: true to prevent state loss
                                  const updatePayload = {
                                    newJobData: { ...currentDynasty.newJobData, takingNewJob: true, position: pos },
                                    teams: updatedTeams
                                  }
                                  await updateDynasty(currentDynasty.id, updatePayload)
                                }}
                                className="px-4 py-2 rounded-lg font-semibold hover:opacity-90"
                                style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                              >
                                {pos === 'HC' ? 'Head Coach' : pos === 'OC' ? 'Offensive Coordinator' : 'Defensive Coordinator'}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Task: Recruiting Commitments (Bowl Week 1) */}
                    {(() => {
                      const commitmentKey = getCommitmentKey()
                      const userTidForCommits = getUserTeamTid(currentDynasty)
                      const commitmentsForYear = getRecruitingCommitments(currentDynasty, userTidForCommits, currentDynasty.currentYear)
                      const weekCommitments = commitmentsForYear?.[commitmentKey]
                      const hasCommitmentsData = weekCommitments !== undefined
                      const commitmentsCount = weekCommitments?.length || 0
                      const classScore = calculateRecruitingClassScore(flattenClassCommitments(commitmentsForYear))
                      // Task number: after Taking a New Job (which is task 5)
                      const taskNum = 6

                      return (
                        <div
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl gap-3 sm:gap-0 transition-all"
                          style={hasCommitmentsData ? {
                            backgroundColor: 'rgba(34, 197, 94, 0.1)',
                            border: '1px solid rgba(34, 197, 94, 0.3)'
                          } : {
                            backgroundColor: 'var(--surface-3)',
                            border: '1px solid var(--rule-soft)'
                          }}
                        >
                          <div className="flex items-center gap-3 sm:gap-4">
                            <div
                              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center flex-shrink-0 font-bold ${
                                hasCommitmentsData ? 'bg-green-500 text-white' : ''
                              }`}
                              style={!hasCommitmentsData ? { backgroundColor: `${teamColors.primary}15`, color: teamColors.primary, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' } : { boxShadow: '0 2px 4px rgba(0,0,0,0.15)' }}
                            >
                              {hasCommitmentsData ? (
                                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : taskNum}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm sm:text-base font-semibold" style={{ color: hasCommitmentsData ? '#22c55e' : '#fafafa' }}>
                                {hasCommitmentsData ? 'Recruiting Commitments' : 'Any commitments this week?'}
                              </div>
                              <div className="text-xs sm:text-sm mt-0.5" style={{ color: hasCommitmentsData ? '#22c55e' : '#a1a1aa' }}>
                                {hasCommitmentsData
                                  ? commitmentsCount > 0
                                    ? `✓ ${commitmentsCount} commitment${commitmentsCount !== 1 ? 's' : ''} recorded`
                                    : '✓ No commitments this week'
                                  : 'Record any recruiting commitments'}
                              </div>
                              {classScore > 0 && (
                                <Link
                                  to={`${pathPrefix}/recruiting/${userTidForCommits}/${currentDynasty.currentYear}`}
                                  className="block w-fit text-[10px] sm:text-xs mt-1 font-bold uppercase text-txt-tertiary hover:text-team-primary transition-colors"
                                  style={{ letterSpacing: '1.5px' }}
                                  title="View recruiting class"
                                >
                                  Class Score <span className="tabular text-txt-primary ml-1">{formatRecruitingClassScore(classScore)}</span>
                                </Link>
                              )}
                              <RecruitingInsightLink className="mt-1" />
                            </div>
                          </div>
                          {!hasCommitmentsData ? (
                            <div className="flex gap-2 self-end sm:self-auto items-center">
                              <SellVsSendButton onClick={() => setShowSellCalc(true)} />
                              <button
                                onClick={handleNoCommitments}
                                className="px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg font-semibold text-sm transition-all hover:shadow-md active:scale-[0.98]"
                                style={{ backgroundColor: teamColors.primary, color: primaryBgText, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
                              >
                                No
                              </button>
                              <button
                                onClick={() => setShowRecruitingModal(true)}
                                className="px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg font-semibold text-sm transition-all hover:shadow-md active:scale-[0.98]"
                                style={{ backgroundColor: teamColors.primary, color: primaryBgText, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
                              >
                                Yes
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setShowRecruitingModal(true)}
                              className="px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg font-semibold text-sm self-end sm:self-auto transition-all hover:shadow-md active:scale-[0.98]"
                              style={{ backgroundColor: teamColors.primary, color: primaryBgText, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      )
                    })()}

                  </div>
                </>
              )
            }

            // Week 2: Week 1 Bowl Results (incl. CFP First Round) + User's bowl game (if Week 2 bowl) + Week 2 bowl results
            if (week === 2) {
              return (
                <>
                  <h3 className="text-lg sm:text-xl font-bold mb-4 sm:mb-5 text-zinc-100">
                    Bowl Week 2
                  </h3>
                  <div className="space-y-3">
                    {/* Task 1: Enter Week 1 Bowl Results (includes CFP First Round) */}
                    <div
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl gap-3 sm:gap-0 transition-all"
                      style={hasBowlWeek1Data ? {
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        border: '1px solid rgba(34, 197, 94, 0.3)'
                      } : {
                        backgroundColor: 'var(--surface-3)',
                        border: '1px solid var(--rule-soft)'
                      }}
                    >
                      <div className="flex items-center gap-3 sm:gap-4">
                        <div
                          className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center flex-shrink-0 ${
                            hasBowlWeek1Data ? 'bg-green-500 text-white' : ''
                          }`}
                          style={!hasBowlWeek1Data ? { backgroundColor: `${teamColors.primary}15`, color: teamColors.primary, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' } : { boxShadow: '0 2px 4px rgba(0,0,0,0.15)' }}
                        >
                          {hasBowlWeek1Data ? (
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : <span className="font-bold text-sm sm:text-base">1</span>}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-semibold" style={{ color: hasBowlWeek1Data ? '#22c55e' : '#fafafa' }}>
                            Week 1 Bowl Results
                          </div>
                          <div className="text-xs sm:text-sm mt-0.5" style={{ color: hasBowlWeek1Data ? '#22c55e' : '#a1a1aa' }}>
                            {totalEnteredWeek1 === 30 ? '✓ All 30 games entered' : `${totalEnteredWeek1}/30 games entered (incl. CFP First Round)`}
                          </div>
                        </div>
                      </div>
                      {isViewOnly ? <ViewOnlyBadge /> : (
                        <button
                          onClick={() => setShowBowlWeek1Modal(true)}
                          className="px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg font-semibold text-sm self-end sm:self-auto transition-all hover:shadow-md active:scale-[0.98]"
                          style={{ backgroundColor: teamColors.primary, color: primaryBgText, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
                        >
                          {hasBowlWeek1Data ? 'Edit' : 'Enter'}
                        </button>
                      )}
                    </div>

                    {/* Task 2: Enter YOUR Bowl Game (if Week 2 bowl) */}
                    {bowlEligible && selectedBowl && bowlOpponent && userBowlIsWeek2 && (
                      <div
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl gap-3 sm:gap-0 transition-all"
                        style={userBowlGame ? {
                          backgroundColor: 'rgba(34, 197, 94, 0.1)',
                          border: '1px solid rgba(34, 197, 94, 0.3)'
                        } : {
                          backgroundColor: 'var(--surface-3)',
                          border: '1px solid var(--rule-soft)'
                        }}
                      >
                        <div className="flex items-center gap-3 sm:gap-4">
                          <div
                            className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center flex-shrink-0 ${
                              userBowlGame ? 'bg-green-500 text-white' : ''
                            }`}
                            style={!userBowlGame ? { backgroundColor: `${teamColors.primary}15`, color: teamColors.primary, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' } : { boxShadow: '0 2px 4px rgba(0,0,0,0.15)' }}
                          >
                            {userBowlGame ? (
                              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : <span className="font-bold text-sm sm:text-base">2</span>}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm sm:text-base font-semibold" style={{ color: userBowlGame ? '#22c55e' : '#fafafa' }}>
                              Enter Your {selectedBowl} Game
                            </div>
                            <div className="text-xs sm:text-sm mt-0.5" style={{ color: userBowlGame ? '#22c55e' : '#a1a1aa' }}>
                              {userBowlGame ? `✓ ${userBowlGame.perspective?.userWon ? 'Won' : 'Lost'} ${Math.max(userBowlGame.perspective?.userScore || 0, userBowlGame.perspective?.opponentScore || 0)}-${Math.min(userBowlGame.perspective?.userScore || 0, userBowlGame.perspective?.opponentScore || 0)}` : `vs ${bowlOpponent}`}
                            </div>
                          </div>
                        </div>
                        {isViewOnly ? <ViewOnlyBadge /> : (
                          <button
                            onClick={() => {
                              if (userBowlGame) {
                                navigate(`${pathPrefix}/game/${userBowlGame.id}/edit`, { state: { from: location.pathname } })
                              } else {
                                // bowlOpponent is a team name (e.g., "Texas Longhorns"), not abbreviation
                                const opponentTid = getTidFromTeamName(bowlOpponent, currentDynasty?.teams)
                                const params = new URLSearchParams({
                                  week: 'Bowl',
                                  year: currentDynasty.currentYear?.toString() || '',
                                  team1Tid: userTeamTid?.toString() || '',
                                  team2Tid: opponentTid?.toString() || '',
                                  gameType: 'bowl',
                                  bowlName: selectedBowl || ''
                                })
                                navigate(`${pathPrefix}/game/new?${params.toString()}`, { state: { from: location.pathname } })
                              }
                            }}
                            className="px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg font-semibold text-sm self-end sm:self-auto transition-all hover:shadow-md active:scale-[0.98]"
                            style={{ backgroundColor: teamColors.primary, color: primaryBgText, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
                          >
                            {userBowlGame ? 'Edit' : 'Enter'}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Task: Enter YOUR CFP Quarterfinal Game (if in CFP and advancing to QF) */}
                    {/* Bye teams (seeds 1-4) see this immediately in Bowl Week 2; First Round winners see it after winning */}
                    {userInCFPQuarterfinal && (userHasCFPBye || userWonFirstRound || hasBowlWeek1Data) && (() => {
                      // Check if game has actual scores entered (not just a shell)
                      const qfGamePlayed = userCFPQuarterfinalGame && userCFPQuarterfinalGame.team1Score !== null && userCFPQuarterfinalGame.team2Score !== null
                      return (
                      <div
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl gap-3 sm:gap-0 transition-all"
                        style={qfGamePlayed ? {
                          backgroundColor: 'rgba(34, 197, 94, 0.1)',
                          border: '1px solid rgba(34, 197, 94, 0.3)'
                        } : {
                          backgroundColor: 'var(--surface-3)',
                          border: '1px solid var(--rule-soft)'
                        }}
                      >
                        <div className="flex items-center gap-3 sm:gap-4">
                          <div
                            className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center flex-shrink-0 ${
                              qfGamePlayed ? 'bg-green-500 text-white' : ''
                            }`}
                            style={!qfGamePlayed ? { backgroundColor: `${teamColors.primary}15`, color: teamColors.primary, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' } : { boxShadow: '0 2px 4px rgba(0,0,0,0.15)' }}
                          >
                            {qfGamePlayed ? (
                              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : <span className="font-bold text-sm sm:text-base">{(bowlEligible && selectedBowl && bowlOpponent && userBowlIsWeek2) ? 3 : 2}</span>}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm sm:text-base font-semibold" style={{ color: qfGamePlayed ? '#22c55e' : '#fafafa' }}>
                              Enter Your {userQFBowlName} Game (CFP QF)
                            </div>
                            <div className="text-xs sm:text-sm mt-0.5" style={{ color: qfGamePlayed ? '#22c55e' : '#a1a1aa' }}>
                              {qfGamePlayed
                                ? `✓ ${userCFPQuarterfinalGame.perspective?.userWon ? 'Won' : 'Lost'} ${Math.max(userCFPQuarterfinalGame.perspective?.userScore || 0, userCFPQuarterfinalGame.perspective?.opponentScore || 0)}-${Math.min(userCFPQuarterfinalGame.perspective?.userScore || 0, userCFPQuarterfinalGame.perspective?.opponentScore || 0)}`
                                : `#${userCFPSeed} vs ${userQFOpponent ? getMascotName(userQFOpponent) : 'TBD'}`}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            // Use game with perspective first, then shell, then create new
                            const gameToEdit = userCFPQuarterfinalGame || userCFPQuarterfinalShell
                            if (gameToEdit) {
                              navigate(`${pathPrefix}/game/${gameToEdit.id}/edit`, { state: { from: location.pathname } })
                            } else {
                              // userQFOpponent can be a tid (number) or abbreviation (string)
                              const opponentTid = typeof userQFOpponent === 'number' ? userQFOpponent : getTidFromAbbr(userQFOpponent)
                              const params = new URLSearchParams({
                                week: 'CFP Quarterfinal',
                                year: currentDynasty.currentYear?.toString() || '',
                                team1Tid: userTeamTid?.toString() || '',
                                team2Tid: opponentTid?.toString() || '',
                                gameType: 'cfp_quarterfinal',
                                bowlName: userQFBowlName || ''
                              })
                              navigate(`${pathPrefix}/game/new?${params.toString()}`, { state: { from: location.pathname } })
                            }
                          }}
                          className="px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg font-semibold text-sm self-end sm:self-auto transition-all hover:shadow-md active:scale-[0.98]"
                          style={{ backgroundColor: teamColors.primary, color: primaryBgText, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
                        >
                          {qfGamePlayed ? 'Edit' : 'Enter'}
                        </button>
                      </div>
                      )})()}

                    {/* Task: Taking a New Job? (appears every bowl week until accepted) */}
                    {(() => {
                      // Task number depends on how many tasks are showing above
                      let newJobTaskNum = 2
                      if (bowlEligible && selectedBowl && bowlOpponent && userBowlIsWeek2) newJobTaskNum++
                      if (userInCFPQuarterfinal && (userWonFirstRound || hasBowlWeek1Data)) newJobTaskNum++
                      return (
                    <div
                      className="p-4 rounded-xl transition-all"
                      style={takingNewJob !== null ? {
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        border: '1px solid rgba(34, 197, 94, 0.3)'
                      } : {
                        backgroundColor: 'var(--surface-3)',
                        border: '1px solid var(--rule-soft)'
                      }}
                    >
                      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 ${takingNewJob === null || (takingNewJob === true && (!newJobTeam || !newJobPosition)) ? 'mb-3' : ''}`}>
                        <div className="flex items-center gap-3 sm:gap-4">
                          <div
                            className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center flex-shrink-0 ${
                              takingNewJob !== null ? 'bg-green-500 text-white' : ''
                            }`}
                            style={takingNewJob === null ? { backgroundColor: `${teamColors.primary}15`, color: teamColors.primary, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' } : { boxShadow: '0 2px 4px rgba(0,0,0,0.15)' }}
                          >
                            {takingNewJob !== null ? (
                              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : <span className="font-bold text-sm sm:text-base">{newJobTaskNum}</span>}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm sm:text-base font-semibold" style={{ color: takingNewJob !== null ? '#22c55e' : '#fafafa' }}>
                              Taking a New Job? (Bowl Week 2)
                            </div>
                            {takingNewJob === true && newJobTeam && newJobPosition && (
                              <div className="text-xs sm:text-sm mt-0.5" style={{ color: '#22c55e' }}>
                                ✓ {newJobPosition} at {getTeamNameFromAbbr(newJobTeam)}
                              </div>
                            )}
                            {takingNewJob === false && (
                              <div className="text-xs sm:text-sm mt-0.5" style={{ color: '#22c55e' }}>
                                ✓ Staying with current team
                              </div>
                            )}
                          </div>
                        </div>
                        {(takingNewJob === false || (takingNewJob === true && newJobTeam && newJobPosition)) && (
                          <button
                            onClick={async () => {
                              setTakingNewJob(null)
                              setNewJobTeam('')
                              setNewJobPosition('')
                              // Clear pendingUserId from any team
                              const updatedTeams = clearPendingUserTeam(currentDynasty.teams)
                              await updateDynasty(currentDynasty.id, {
                                newJobData: null,
                                teams: updatedTeams
                              })
                            }}
                            className="px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg font-semibold text-sm self-end sm:self-auto transition-all hover:shadow-md active:scale-[0.98]"
                            style={{ backgroundColor: teamColors.primary, color: primaryBgText, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
                          >
                            Edit
                          </button>
                        )}
                      </div>

                      {takingNewJob === null && (
                        <div className="ml-13 pl-10">
                          <div className="flex gap-3">
                            <button
                              onClick={async () => {
                                setTakingNewJob(true)
                                await updateDynasty(currentDynasty.id, {
                                  newJobData: { takingNewJob: true, team: '', position: '' }
                                })
                              }}
                              className="px-6 py-2.5 rounded-lg font-semibold transition-all hover:shadow-md active:scale-[0.98]"
                              style={{ backgroundColor: teamColors.primary, color: primaryBgText, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
                            >
                              Yes
                            </button>
                            <button
                              onClick={async () => {
                                setTakingNewJob(false)
                                await updateDynasty(currentDynasty.id, {
                                  newJobData: { takingNewJob: false, team: null, position: null, declinedInWeek: currentDynasty.currentWeek }
                                })
                              }}
                              className="px-6 py-2.5 rounded-lg font-semibold transition-all hover:shadow-md active:scale-[0.98]"
                              style={{ backgroundColor: teamColors.primary, color: primaryBgText, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
                            >
                              No
                            </button>
                          </div>
                        </div>
                      )}
                      {takingNewJob === true && !newJobTeam && (
                        <div className="ml-13 pl-10">
                          <p className="mb-2" style={{ color: '#a1a1aa' }}>Which team?</p>
                          <div className="max-w-xs">
                            <SearchableSelect
                              options={teams}
                              value={newJobTeam}
                              onChange={async (value) => {
                                setNewJobTeam(value)
                                // IMPORTANT: Always include takingNewJob: true to prevent state loss
                                await updateDynasty(currentDynasty.id, {
                                  newJobData: { ...currentDynasty.newJobData, takingNewJob: true, team: value }
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
                        <div className="ml-13 pl-10">
                          <p className="mb-2" style={{ color: '#a1a1aa' }}>
                            New team: <strong style={{ color: '#fafafa' }}>{getTeamNameFromAbbr(newJobTeam)}</strong>
                          </p>
                          <p className="mb-2" style={{ color: '#a1a1aa' }}>What position?</p>
                          <div className="flex gap-2 flex-wrap">
                            {['HC', 'OC', 'DC'].map(pos => (
                              <button
                                key={pos}
                                onClick={async () => {
                                  setNewJobPosition(pos)
                                  // Get tid of the new team and set pendingUserId
                                  const newTeamTid = getTidFromTeamName(currentDynasty.newJobData?.team, currentDynasty.teams)
                                  const updatedTeams = newTeamTid
                                    ? setPendingUserTeam(currentDynasty.teams, newTeamTid, pos)
                                    : currentDynasty.teams
                                  // IMPORTANT: Always include takingNewJob: true to prevent state loss
                                  await updateDynasty(currentDynasty.id, {
                                    newJobData: { ...currentDynasty.newJobData, takingNewJob: true, position: pos },
                                    teams: updatedTeams
                                  })
                                }}
                                className="px-4 py-2 rounded-lg font-semibold hover:opacity-90"
                                style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                              >
                                {pos === 'HC' ? 'Head Coach' : pos === 'OC' ? 'Offensive Coordinator' : 'Defensive Coordinator'}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                      )
                    })()}

                    {/* Task: Fill Coordinator Vacancy (appears in Bowl Week 2+ if coordinator was fired) */}
                    {currentDynasty.coachPosition === 'HC' && (() => {
                      const ccDataForYear = currentDynasty.conferenceChampionshipDataByYear?.[currentDynasty.currentYear] || {}
                      return ccDataForYear.firedOCName || ccDataForYear.firedDCName
                    })() &&
                    (() => {
                      const ccDataForYear = currentDynasty.conferenceChampionshipDataByYear?.[currentDynasty.currentYear] || {}
                      const firedOC = ccDataForYear.firedOCName
                      const firedDC = ccDataForYear.firedDCName
                      // Only mark as done if vacancy is actually filled (user said Yes and entered name)
                      const ocFilled = !firedOC || (filledOCVacancy === true && newOCName)
                      const dcFilled = !firedDC || (filledDCVacancy === true && newDCName)
                      const allFilled = ocFilled && dcFilled
                      // Task is "answered" but not filled - user said "Not Yet"
                      const ocAnswered = !firedOC || filledOCVacancy !== null
                      const dcAnswered = !firedDC || filledDCVacancy !== null
                      const allAnswered = ocAnswered && dcAnswered

                      // If all positions are filled, don't show this task at all
                      if (allFilled) return null

                      // Calculate task number
                      let taskNum = 2 // Base: after Week 1 results
                      if (bowlEligible && selectedBowl && bowlOpponent && userBowlIsWeek2) taskNum++ // User bowl game
                      taskNum++ // After "Taking a New Job?"

                      return (
                        <div
                          className="p-3 sm:p-4 transition-all"
                          style={{
                            backgroundColor: 'var(--surface-3)',
                            border: '1px solid var(--rule-soft)'
                          }}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
                            <div className="flex items-center gap-2 sm:gap-3">
                              <div
                                className="w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center flex-shrink-0"
                                style={{ backgroundColor: `${teamColors.primary}20`, color: teamColors.primary }}
                              >
                                <span className="font-bold text-sm sm:text-base">{taskNum}</span>
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm sm:text-base font-semibold" style={{ color: '#fafafa' }}>
                                  Fill Coordinator {firedOC && firedDC ? 'Vacancies' : 'Vacancy'}
                                </div>
                                {/* Show status if user answered but vacancy not filled */}
                                {allAnswered && !allFilled && (
                                  <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: '#a1a1aa' }}>
                                    {firedOC && (ocFilled ? `✓ OC: ${newOCName}` : 'OC: Not filled yet')}
                                    {firedOC && firedDC && ' • '}
                                    {firedDC && (dcFilled ? `✓ DC: ${newDCName}` : 'DC: Not filled yet')}
                                  </div>
                                )}
                              </div>
                            </div>
                            {allAnswered && !allFilled && (
                              <button
                                onClick={async () => {
                                  setFilledOCVacancy(null)
                                  setFilledDCVacancy(null)
                                  setNewOCName('')
                                  setNewDCName('')
                                  await updateDynasty(currentDynasty.id, { pendingCoordinatorHires: null })
                                }}
                                className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm self-end sm:self-auto"
                                style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                              >
                                Edit
                              </button>
                            )}
                          </div>

                          {/* OC Vacancy Questions */}
                          {firedOC && filledOCVacancy === null && (
                            <div className="ml-13 pl-10 mt-3">
                              <p className="mb-2 font-medium" style={{ color: '#a1a1aa' }}>
                                You fired {firedOC} (OC). Has the position been filled?
                              </p>
                              <div className="flex gap-3">
                                <button
                                  onClick={() => setFilledOCVacancy(true)}
                                  className="px-6 py-2 rounded-lg font-semibold hover:opacity-90"
                                  style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                                >
                                  Yes
                                </button>
                                <button
                                  onClick={async () => {
                                    setFilledOCVacancy(false)
                                    await updateDynasty(currentDynasty.id, {
                                      pendingCoordinatorHires: {
                                        ...currentDynasty.pendingCoordinatorHires,
                                        filledOC: false,
                                        newOCName: null
                                      }
                                    })
                                  }}
                                  className="px-6 py-2 rounded-lg font-semibold hover:opacity-90"
                                  style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                                >
                                  Not Yet
                                </button>
                              </div>
                            </div>
                          )}

                          {/* OC Name Input */}
                          {firedOC && filledOCVacancy === true && !newOCName && (
                            <div className="ml-13 pl-10 mt-3">
                              <p className="mb-2 font-medium" style={{ color: '#a1a1aa' }}>
                                Enter new OC name:
                              </p>
                              <div className="flex gap-2 max-w-sm">
                                <input
                                  type="text"
                                  id="new-oc-name"
                                  className="flex-1 px-3 py-2 border-2 rounded-lg focus:outline-none"
                                  style={{ borderColor: teamColors.primary }}
                                  placeholder="New OC name..."
                                  onKeyDown={async (e) => {
                                    if (e.key === 'Enter' && e.target.value.trim()) {
                                      const name = e.target.value.trim()
                                      setNewOCName(name)
                                      await updateDynasty(currentDynasty.id, {
                                        pendingCoordinatorHires: {
                                          ...currentDynasty.pendingCoordinatorHires,
                                          filledOC: true,
                                          newOCName: name
                                        }
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
                                          newOCName: name
                                        }
                                      })
                                    }
                                  }}
                                  className="px-4 py-2 rounded-lg font-semibold hover:opacity-90"
                                  style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                                >
                                  Save
                                </button>
                              </div>
                            </div>
                          )}

                          {/* DC Vacancy Questions (only show after OC is done) */}
                          {firedDC && ocAnswered && filledDCVacancy === null && (
                            <div className="ml-13 pl-10 mt-3">
                              <p className="mb-2 font-medium" style={{ color: '#a1a1aa' }}>
                                You fired {firedDC} (DC). Has the position been filled?
                              </p>
                              <div className="flex gap-3">
                                <button
                                  onClick={() => setFilledDCVacancy(true)}
                                  className="px-6 py-2 rounded-lg font-semibold hover:opacity-90"
                                  style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                                >
                                  Yes
                                </button>
                                <button
                                  onClick={async () => {
                                    setFilledDCVacancy(false)
                                    await updateDynasty(currentDynasty.id, {
                                      pendingCoordinatorHires: {
                                        ...currentDynasty.pendingCoordinatorHires,
                                        filledDC: false,
                                        newDCName: null
                                      }
                                    })
                                  }}
                                  className="px-6 py-2 rounded-lg font-semibold hover:opacity-90"
                                  style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                                >
                                  Not Yet
                                </button>
                              </div>
                            </div>
                          )}

                          {/* DC Name Input */}
                          {firedDC && ocAnswered && filledDCVacancy === true && !newDCName && (
                            <div className="ml-13 pl-10 mt-3">
                              <p className="mb-2 font-medium" style={{ color: '#a1a1aa' }}>
                                Enter new DC name:
                              </p>
                              <div className="flex gap-2 max-w-sm">
                                <input
                                  type="text"
                                  id="new-dc-name"
                                  className="flex-1 px-3 py-2 border-2 rounded-lg focus:outline-none"
                                  style={{ borderColor: teamColors.primary }}
                                  placeholder="New DC name..."
                                  onKeyDown={async (e) => {
                                    if (e.key === 'Enter' && e.target.value.trim()) {
                                      const name = e.target.value.trim()
                                      setNewDCName(name)
                                      await updateDynasty(currentDynasty.id, {
                                        pendingCoordinatorHires: {
                                          ...currentDynasty.pendingCoordinatorHires,
                                          filledDC: true,
                                          newDCName: name
                                        }
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
                                          newDCName: name
                                        }
                                      })
                                    }
                                  }}
                                  className="px-4 py-2 rounded-lg font-semibold hover:opacity-90"
                                  style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                                >
                                  Save
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    {/* Task: Recruiting Commitments (Bowl Week 2) */}
                    {(() => {
                      const commitmentKey = getCommitmentKey()
                      const userTidForCommits = getUserTeamTid(currentDynasty)
                      const commitmentsForYear = getRecruitingCommitments(currentDynasty, userTidForCommits, currentDynasty.currentYear)
                      const weekCommitments = commitmentsForYear?.[commitmentKey]
                      const hasCommitmentsData = weekCommitments !== undefined
                      const commitmentsCount = weekCommitments?.length || 0
                      const classScore = calculateRecruitingClassScore(flattenClassCommitments(commitmentsForYear))
                      // Task number: starts at base, increments based on visible tasks
                      let taskNum = 2
                      if (bowlEligible && selectedBowl && bowlOpponent && userBowlIsWeek2) taskNum++
                      if (userInCFPQuarterfinal && (userWonFirstRound || hasBowlWeek1Data)) taskNum++
                      taskNum++ // After "Taking a New Job" task
                      const ccDataForTaskNum = currentDynasty.conferenceChampionshipDataByYear?.[currentDynasty.currentYear] || {}
                      if (currentDynasty.coachPosition === 'HC' && (ccDataForTaskNum.firedOCName || ccDataForTaskNum.firedDCName)) taskNum++ // After coordinator hire task

                      return (
                        <div
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl gap-3 sm:gap-0 transition-all"
                          style={hasCommitmentsData ? {
                            backgroundColor: 'rgba(34, 197, 94, 0.1)',
                            border: '1px solid rgba(34, 197, 94, 0.3)'
                          } : {
                            backgroundColor: 'var(--surface-3)',
                            border: '1px solid var(--rule-soft)'
                          }}
                        >
                          <div className="flex items-center gap-3 sm:gap-4">
                            <div
                              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center flex-shrink-0 font-bold ${
                                hasCommitmentsData ? 'bg-green-500 text-white' : ''
                              }`}
                              style={!hasCommitmentsData ? { backgroundColor: `${teamColors.primary}15`, color: teamColors.primary, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' } : { boxShadow: '0 2px 4px rgba(0,0,0,0.15)' }}
                            >
                              {hasCommitmentsData ? (
                                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : taskNum}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm sm:text-base font-semibold" style={{ color: hasCommitmentsData ? '#22c55e' : '#fafafa' }}>
                                {hasCommitmentsData ? 'Recruiting Commitments' : 'Any commitments this week?'}
                              </div>
                              <div className="text-xs sm:text-sm mt-0.5" style={{ color: hasCommitmentsData ? '#22c55e' : '#a1a1aa' }}>
                                {hasCommitmentsData
                                  ? commitmentsCount > 0
                                    ? `✓ ${commitmentsCount} commitment${commitmentsCount !== 1 ? 's' : ''} recorded`
                                    : '✓ No commitments this week'
                                  : 'Record any recruiting commitments'}
                              </div>
                              {classScore > 0 && (
                                <Link
                                  to={`${pathPrefix}/recruiting/${userTidForCommits}/${currentDynasty.currentYear}`}
                                  className="block w-fit text-[10px] sm:text-xs mt-1 font-bold uppercase text-txt-tertiary hover:text-team-primary transition-colors"
                                  style={{ letterSpacing: '1.5px' }}
                                  title="View recruiting class"
                                >
                                  Class Score <span className="tabular text-txt-primary ml-1">{formatRecruitingClassScore(classScore)}</span>
                                </Link>
                              )}
                              <RecruitingInsightLink className="mt-1" />
                            </div>
                          </div>
                          {!hasCommitmentsData ? (
                            <div className="flex gap-2 self-end sm:self-auto items-center">
                              <SellVsSendButton onClick={() => setShowSellCalc(true)} />
                              <button
                                onClick={handleNoCommitments}
                                className="px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg font-semibold text-sm transition-all hover:shadow-md active:scale-[0.98]"
                                style={{ backgroundColor: teamColors.primary, color: primaryBgText, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
                              >
                                No
                              </button>
                              <button
                                onClick={() => setShowRecruitingModal(true)}
                                className="px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg font-semibold text-sm transition-all hover:shadow-md active:scale-[0.98]"
                                style={{ backgroundColor: teamColors.primary, color: primaryBgText, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
                              >
                                Yes
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setShowRecruitingModal(true)}
                              className="px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg font-semibold text-sm self-end sm:self-auto transition-all hover:shadow-md active:scale-[0.98]"
                              style={{ backgroundColor: teamColors.primary, color: primaryBgText, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      )
                    })()}

                  </div>
                </>
              )
            }

            // Week 5: End of Season Recap - Enter championship result if user wasn't in it
            if (week === 5) {
              // Check unified games[] array first, then fallback to legacy cfpResultsByYear
              const unifiedChampGames = getGamesByType(currentDynasty, GAME_TYPES.CFP_CHAMPIONSHIP, currentDynasty.currentYear)
              const legacyChampData = currentDynasty.cfpResultsByYear?.[currentDynasty.currentYear]?.championship || []
              const champData = unifiedChampGames.length > 0 ? unifiedChampGames : legacyChampData
              // Check if actual scores are entered, not just that the shell exists
              const hasChampData = champData.length > 0 && champData[0]?.team1Score !== null && champData[0]?.team1Score !== undefined

              return (
                <>
                  <div className="flex items-center gap-3 mb-3 sm:mb-4">
                    <div className="w-1 h-10 sm:h-12 rounded-full flex-shrink-0" style={{ backgroundColor: teamColors.primary }} />
                    <h3 className="font-display font-black uppercase leading-none text-txt-primary" style={{ fontSize: 'clamp(1.25rem, 2vw, 1.75rem)', letterSpacing: '-0.01em' }}>
                      End of Season Recap
                    </h3>
                  </div>
                  <div className="-space-y-px">
                    {/* Task: Enter National Championship Result (only if user was NOT in championship) */}
                    {!userInCFPChampionship && (
                      <div
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-3 sm:gap-0 transition-all"
                        style={hasChampData ? {
                          backgroundColor: 'rgba(34, 197, 94, 0.1)',
                          border: '1px solid rgba(34, 197, 94, 0.3)'
                        } : {
                          backgroundColor: 'var(--surface-3)',
                          border: '1px solid var(--rule-soft)'
                        }}
                      >
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div
                            className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center flex-shrink-0 ${
                              hasChampData ? 'bg-green-500 text-white' : ''
                            }`}
                            style={!hasChampData ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                          >
                            {hasChampData ? (
                              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : <span className="font-bold text-sm sm:text-base">1</span>}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm sm:text-base font-semibold" style={{ color: hasChampData ? '#22c55e' : '#fafafa' }}>
                              National Championship Result
                            </div>
                            <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: hasChampData ? '#22c55e' : '#a1a1aa' }}>
                              {hasChampData
                                ? `✓ ${champData[0]?.winner || 'Result entered'}`
                                : 'Enter the championship game result'}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => setShowCFPChampionshipModal(true)}
                          className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm self-end sm:self-auto"
                          style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                        >
                          {hasChampData ? 'Edit' : 'Enter'}
                        </button>
                      </div>
                    )}

                    {/* Task: GP/Snaps Entry */}
                    {(() => {
                      // Check if user has actually saved GP/Snaps for this year
                      const year = currentDynasty.currentYear
                      const isCompleted = currentDynasty?.gpSnapsCompletedByYear?.[year] || currentDynasty?.gpSnapsCompletedByYear?.[String(year)]

                      const playerCount = currentDynasty?.players?.filter(p => {
                        const yearStats = p.statsByYear?.[year] || p.statsByYear?.[String(year)]
                        return yearStats && (yearStats.gamesPlayed || yearStats.snapsPlayed)
                      }).length || 0

                      const taskNumber = !userInCFPChampionship ? 2 : 1

                      return (
                        <div
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-3 sm:gap-0 transition-all"
                          style={isCompleted ? {
                            backgroundColor: 'rgba(34, 197, 94, 0.1)',
                            border: '1px solid rgba(34, 197, 94, 0.3)'
                          } : {
                            backgroundColor: 'var(--surface-3)',
                            border: '1px solid var(--rule-soft)'
                          }}
                        >
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div
                              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center flex-shrink-0 ${
                                isCompleted ? 'bg-green-500 text-white' : ''
                              }`}
                              style={!isCompleted ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                            >
                              {isCompleted ? (
                                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : <span className="font-bold text-sm sm:text-base">{taskNumber}</span>}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm sm:text-base font-semibold" style={{ color: isCompleted ? '#22c55e' : '#fafafa' }}>
                                GP/Snaps Entry
                              </div>
                              {isCompleted && (
                                <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: '#22c55e' }}>
                                  ✓ Stats entered for {playerCount} players
                                </div>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => setShowStatsEntryModal(true)}
                            className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm self-end sm:self-auto"
                            style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                          >
                            {isCompleted ? 'Edit' : 'Enter'}
                          </button>
                        </div>
                      )
                    })()}

                    {/* Task: Detailed Stats Entry */}
                    {(() => {
                      // Check if user has actually saved Detailed Stats for this year
                      const year = currentDynasty.currentYear
                      const gpSnapsCompleted = currentDynasty?.gpSnapsCompletedByYear?.[year] || currentDynasty?.gpSnapsCompletedByYear?.[String(year)]

                      // Also check for box score data - unlocks this task too
                      const yearGames = (currentDynasty?.games || []).filter(g => Number(g.year) === Number(year))
                      const hasBoxScoreData = yearGames.some(g => g.boxScore && (g.boxScore.home || g.boxScore.away))

                      const isCompleted = currentDynasty?.detailedStatsCompletedByYear?.[year] || currentDynasty?.detailedStatsCompletedByYear?.[String(year)]
                      const taskNumber = !userInCFPChampionship ? 3 : 2
                      // Unlock if GP/Snaps completed OR has box score data
                      const isLocked = !gpSnapsCompleted && !hasBoxScoreData

                      return (
                        <div
                          className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-3 sm:gap-0 transition-all ${isLocked ? 'opacity-50' : ''}`}
                          style={isCompleted ? {
                            backgroundColor: 'rgba(34, 197, 94, 0.1)',
                            border: '1px solid rgba(34, 197, 94, 0.3)'
                          } : {
                            backgroundColor: 'var(--surface-3)',
                            border: '1px solid var(--rule-soft)'
                          }}
                        >
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div
                              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center flex-shrink-0 ${
                                isCompleted ? 'bg-green-500 text-white' : ''
                              }`}
                              style={!isCompleted ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                            >
                              {isCompleted ? (
                                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : isLocked ? (
                                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                              ) : <span className="font-bold text-sm sm:text-base">{taskNumber}</span>}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm sm:text-base font-semibold" style={{ color: isCompleted ? '#22c55e' : '#fafafa' }}>
                                Detailed Stats Entry
                              </div>
                              {(isCompleted || isLocked) && (
                                <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: isCompleted ? '#22c55e' : '#a1a1aa' }}>
                                  {isCompleted
                                    ? '✓ Detailed stats entered across all categories'
                                    : 'Complete GP/Snaps Entry first'}
                                </div>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => !isLocked && setShowDetailedStatsModal(true)}
                            disabled={isLocked}
                            className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold text-sm self-end sm:self-auto ${isLocked ? 'cursor-not-allowed' : 'hover:opacity-90'}`}
                            style={{ backgroundColor: teamColors.primary, color: primaryBgText, opacity: isLocked ? 0.5 : 1 }}
                          >
                            {isCompleted ? 'Edit' : 'Enter'}
                          </button>
                        </div>
                      )
                    })()}

                    {/* Task: Conference Standings Entry */}
                    {(() => {
                      const hasStandingsData = currentDynasty?.conferenceStandingsByYear?.[currentDynasty.currentYear] &&
                        Object.keys(currentDynasty.conferenceStandingsByYear[currentDynasty.currentYear]).length > 0
                      const taskNumber = !userInCFPChampionship ? 4 : 3

                      return (
                        <div
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-3 sm:gap-0 transition-all"
                          style={hasStandingsData ? {
                            backgroundColor: 'rgba(34, 197, 94, 0.1)',
                            border: '1px solid rgba(34, 197, 94, 0.3)'
                          } : {
                            backgroundColor: 'var(--surface-3)',
                            border: '1px solid var(--rule-soft)'
                          }}
                        >
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div
                              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center flex-shrink-0 ${
                                hasStandingsData ? 'bg-green-500 text-white' : ''
                              }`}
                              style={!hasStandingsData ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                            >
                              {hasStandingsData ? (
                                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : <span className="font-bold text-sm sm:text-base">{taskNumber}</span>}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm sm:text-base font-semibold" style={{ color: hasStandingsData ? '#22c55e' : '#fafafa' }}>
                                Conference Standings
                              </div>
                              {hasStandingsData && (
                                <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: '#22c55e' }}>
                                  ✓ Standings entered for {Object.keys(currentDynasty.conferenceStandingsByYear[currentDynasty.currentYear]).length} conferences
                                </div>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => setShowConferenceStandingsModal(true)}
                            className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm self-end sm:self-auto"
                            style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                          >
                            {hasStandingsData ? 'Edit' : 'Enter'}
                          </button>
                        </div>
                      )
                    })()}

                    {/* Task: Final Top 25 Polls Entry */}
                    {(() => {
                      const hasPollsData = currentDynasty?.finalPollsByYear?.[currentDynasty.currentYear] &&
                        (currentDynasty.finalPollsByYear[currentDynasty.currentYear].media?.length > 0 ||
                         currentDynasty.finalPollsByYear[currentDynasty.currentYear].coaches?.length > 0)
                      const taskNumber = !userInCFPChampionship ? 5 : 4

                      return (
                        <div
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-3 sm:gap-0 transition-all"
                          style={hasPollsData ? {
                            backgroundColor: 'rgba(34, 197, 94, 0.1)',
                            border: '1px solid rgba(34, 197, 94, 0.3)'
                          } : {
                            backgroundColor: 'var(--surface-3)',
                            border: '1px solid var(--rule-soft)'
                          }}
                        >
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div
                              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center flex-shrink-0 ${
                                hasPollsData ? 'bg-green-500 text-white' : ''
                              }`}
                              style={!hasPollsData ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                            >
                              {hasPollsData ? (
                                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : <span className="font-bold text-sm sm:text-base">{taskNumber}</span>}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm sm:text-base font-semibold" style={{ color: hasPollsData ? '#22c55e' : '#fafafa' }}>
                                Final Top 25 Polls
                              </div>
                              {hasPollsData && (
                                <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: '#22c55e' }}>
                                  ✓ Final Media and Coaches Poll rankings entered
                                </div>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => setShowFinalPollsModal(true)}
                            className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm self-end sm:self-auto"
                            style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                          >
                            {hasPollsData ? 'Edit' : 'Enter'}
                          </button>
                        </div>
                      )
                    })()}

                    {/* Task: Team Statistics Entry */}
                    {(() => {
                      const hasTeamStats = currentDynasty?.teamStatsByYear?.[currentDynasty.currentYear] &&
                        Object.keys(currentDynasty.teamStatsByYear[currentDynasty.currentYear]).length > 0
                      const taskNumber = !userInCFPChampionship ? 6 : 5

                      return (
                        <div
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-3 sm:gap-0 transition-all"
                          style={hasTeamStats ? {
                            backgroundColor: 'rgba(34, 197, 94, 0.1)',
                            border: '1px solid rgba(34, 197, 94, 0.3)'
                          } : {
                            backgroundColor: 'var(--surface-3)',
                            border: '1px solid var(--rule-soft)'
                          }}
                        >
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div
                              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center flex-shrink-0 ${
                                hasTeamStats ? 'bg-green-500 text-white' : ''
                              }`}
                              style={!hasTeamStats ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                            >
                              {hasTeamStats ? (
                                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : <span className="font-bold text-sm sm:text-base">{taskNumber}</span>}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm sm:text-base font-semibold" style={{ color: hasTeamStats ? '#22c55e' : '#fafafa' }}>
                                Team Statistics
                              </div>
                              {hasTeamStats && (
                                <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: '#22c55e' }}>
                                  ✓ Team statistics entered
                                </div>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => setShowTeamStatsModal(true)}
                            className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm self-end sm:self-auto"
                            style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                          >
                            {hasTeamStats ? 'Edit' : 'Enter'}
                          </button>
                        </div>
                      )
                    })()}

                    {/* Task: Season Awards Entry */}
                    {(() => {
                      const hasAwards = currentDynasty?.awardsByYear?.[currentDynasty.currentYear] &&
                        Object.keys(currentDynasty.awardsByYear[currentDynasty.currentYear]).length > 0
                      const taskNumber = !userInCFPChampionship ? 7 : 6

                      return (
                        <div
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-3 sm:gap-0 transition-all"
                          style={hasAwards ? {
                            backgroundColor: 'rgba(34, 197, 94, 0.1)',
                            border: '1px solid rgba(34, 197, 94, 0.3)'
                          } : {
                            backgroundColor: 'var(--surface-3)',
                            border: '1px solid var(--rule-soft)'
                          }}
                        >
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div
                              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center flex-shrink-0 ${
                                hasAwards ? 'bg-green-500 text-white' : ''
                              }`}
                              style={!hasAwards ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                            >
                              {hasAwards ? (
                                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : <span className="font-bold text-sm sm:text-base">{taskNumber}</span>}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm sm:text-base font-semibold" style={{ color: hasAwards ? '#22c55e' : '#fafafa' }}>
                                Season Awards
                              </div>
                              {hasAwards && (
                                <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: '#22c55e' }}>
                                  ✓ {Object.keys(currentDynasty.awardsByYear[currentDynasty.currentYear]).length} awards entered
                                </div>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => setShowAwardsModal(true)}
                            className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm self-end sm:self-auto"
                            style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                          >
                            {hasAwards ? 'Edit' : 'Enter'}
                          </button>
                        </div>
                      )
                    })()}

                    {/* Task: All-Americans Entry */}
                    {(() => {
                      const hasAllAmericans = currentDynasty?.allAmericansByYear?.[currentDynasty.currentYear]?.allAmericans?.length > 0
                      const taskNumber = !userInCFPChampionship ? 8 : 7

                      return (
                        <div
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-3 sm:gap-0 transition-all"
                          style={hasAllAmericans ? {
                            backgroundColor: 'rgba(34, 197, 94, 0.1)',
                            border: '1px solid rgba(34, 197, 94, 0.3)'
                          } : {
                            backgroundColor: 'var(--surface-3)',
                            border: '1px solid var(--rule-soft)'
                          }}
                        >
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div
                              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center flex-shrink-0 ${
                                hasAllAmericans ? 'bg-green-500 text-white' : ''
                              }`}
                              style={!hasAllAmericans ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                            >
                              {hasAllAmericans ? (
                                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : <span className="font-bold text-sm sm:text-base">{taskNumber}</span>}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm sm:text-base font-semibold" style={{ color: hasAllAmericans ? '#22c55e' : '#fafafa' }}>
                                All-Americans
                              </div>
                              {hasAllAmericans && (
                                <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: '#22c55e' }}>
                                  ✓ All-Americans selections entered
                                </div>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => setShowAllAmericansModal(true)}
                            className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm self-end sm:self-auto"
                            style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                          >
                            {hasAllAmericans ? 'Edit' : 'Enter'}
                          </button>
                        </div>
                      )
                    })()}

                    {/* Task: All-Conference Entry */}
                    {(() => {
                      const hasAllConference = currentDynasty?.allAmericansByYear?.[currentDynasty.currentYear]?.allConference?.length > 0
                      const taskNumber = !userInCFPChampionship ? 9 : 8

                      return (
                        <div
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-3 sm:gap-0 transition-all"
                          style={hasAllConference ? {
                            backgroundColor: 'rgba(34, 197, 94, 0.1)',
                            border: '1px solid rgba(34, 197, 94, 0.3)'
                          } : {
                            backgroundColor: 'var(--surface-3)',
                            border: '1px solid var(--rule-soft)'
                          }}
                        >
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div
                              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center flex-shrink-0 ${
                                hasAllConference ? 'bg-green-500 text-white' : ''
                              }`}
                              style={!hasAllConference ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                            >
                              {hasAllConference ? (
                                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : <span className="font-bold text-sm sm:text-base">{taskNumber}</span>}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm sm:text-base font-semibold" style={{ color: hasAllConference ? '#22c55e' : '#fafafa' }}>
                                All-Conference
                              </div>
                              {hasAllConference && (
                                <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: '#22c55e' }}>
                                  ✓ All-Conference selections entered
                                </div>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => setShowAllConferenceModal(true)}
                            className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm self-end sm:self-auto"
                            style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                          >
                            {hasAllConference ? 'Edit' : 'Enter'}
                          </button>
                        </div>
                      )
                    })()}

                  </div>
                </>
              )
            }

            // Weeks 3-4: CFP rounds (Semifinals, Championship)
            // Note: CFP Semifinals CPU games are only entered in Week 4 (Championship week)
            // User's own SF game is entered in Week 3 via the dedicated task

            return (
              <>
                <div className="flex items-center gap-3 mb-3 sm:mb-4">
                  <div className="w-1 h-10 sm:h-12 rounded-full flex-shrink-0" style={{ backgroundColor: teamColors.primary }} />
                  <h3 className="font-display font-black uppercase leading-none text-txt-primary" style={{ fontSize: 'clamp(1.25rem, 2vw, 1.75rem)', letterSpacing: '-0.01em' }}>
                    {week === 5 ? 'End of Season Recap' : week === 4 ? 'National Championship' : `Bowl Week ${week}`}
                  </h3>
                </div>
                <div className="-space-y-px">
                  {/* Week 2 Bowl Results - only show in Week 3 */}
                  {week === 3 && (
                    <div
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-3 sm:gap-0 transition-all"
                      style={hasBowlWeek2Data ? {
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        border: '1px solid rgba(34, 197, 94, 0.3)'
                      } : {
                        backgroundColor: 'var(--surface-3)',
                        border: '1px solid var(--rule-soft)'
                      }}
                    >
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div
                          className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center flex-shrink-0 ${
                            hasBowlWeek2Data ? 'bg-green-500 text-white' : ''
                          }`}
                          style={!hasBowlWeek2Data ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                        >
                          {hasBowlWeek2Data ? (
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : <span className="font-bold text-sm sm:text-base">1</span>}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-semibold" style={{ color: hasBowlWeek2Data ? '#22c55e' : '#fafafa' }}>
                            Week 2 Bowl Results
                          </div>
                          <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: hasBowlWeek2Data ? '#22c55e' : '#a1a1aa' }}>
                            {totalEnteredWeek2 === 12 ? '✓ All 12 games entered' : `${totalEnteredWeek2}/12 games entered (incl. CFP Quarterfinals)`}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => setShowBowlWeek2Modal(true)}
                        className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm self-end sm:self-auto"
                        style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                      >
                        {hasBowlWeek2Data ? 'Edit' : 'Enter'}
                      </button>
                    </div>
                  )}

                  {/* Task: Enter YOUR CFP Semifinal Game (Week 3 only, if user is in SF AND Bowl Week 2 data entered) */}
                  {week === 3 && userInCFPSemifinal && hasBowlWeek2Data && (
                    <div
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-3 sm:gap-0 transition-all"
                      style={userCFPSemifinalGame ? {
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        border: '1px solid rgba(34, 197, 94, 0.3)'
                      } : {
                        backgroundColor: 'var(--surface-3)',
                        border: '1px solid var(--rule-soft)'
                      }}
                    >
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div
                          className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center flex-shrink-0 ${
                            userCFPSemifinalGame ? 'bg-green-500 text-white' : ''
                          }`}
                          style={!userCFPSemifinalGame ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                        >
                          {userCFPSemifinalGame ? (
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : <span className="font-bold text-sm sm:text-base">1</span>}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-semibold" style={{ color: userCFPSemifinalGame ? '#22c55e' : '#fafafa' }}>
                            Enter Your CFP Semifinal Game
                          </div>
                          <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: userCFPSemifinalGame ? '#22c55e' : '#a1a1aa' }}>
                            {userCFPSemifinalGame
                              ? `✓ ${userCFPSemifinalGame.perspective?.userWon ? 'Won' : 'Lost'} ${Math.max(userCFPSemifinalGame.perspective?.userScore || 0, userCFPSemifinalGame.perspective?.opponentScore || 0)}-${Math.min(userCFPSemifinalGame.perspective?.userScore || 0, userCFPSemifinalGame.perspective?.opponentScore || 0)}`
                              : `${userSFBowlName || 'CFP Semifinal'} vs ${userSFOpponent ? getMascotName(userSFOpponent) || userSFOpponent : 'TBD'}`}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          // Use game with perspective first, then shell, then create new
                          const gameToEdit = userCFPSemifinalGame || userCFPSemifinalShell
                          if (gameToEdit) {
                            navigate(`${pathPrefix}/game/${gameToEdit.id}/edit`, { state: { from: location.pathname } })
                          } else {
                            // userSFOpponent can be tid (number) or abbr (string)
                            const opponentTid = typeof userSFOpponent === 'number' ? userSFOpponent : getTidFromAbbr(userSFOpponent)
                            const params = new URLSearchParams({
                              week: 'CFP Semifinal',
                              year: currentDynasty.currentYear?.toString() || '',
                              team1Tid: userTeamTid?.toString() || '',
                              team2Tid: opponentTid?.toString() || '',
                              gameType: 'cfp_semifinal',
                              bowlName: userSFBowlName || 'CFP Semifinal'
                            })
                            navigate(`${pathPrefix}/game/new?${params.toString()}`, { state: { from: location.pathname } })
                          }
                        }}
                        className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm self-end sm:self-auto"
                        style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                      >
                        {(userCFPSemifinalGame || (userCFPSemifinalShell?.team1Score !== null)) ? 'Edit' : 'Enter'}
                      </button>
                    </div>
                  )}

                  {/* Week 4 (National Championship) Task Order:
                      - If user IS in Championship:
                        1. Enter the OTHER SF game (CPU vs CPU) to determine opponent
                        2. Enter user's Championship game
                      - If user is NOT in Championship:
                        1. Enter both SF games (both CPU vs CPU)
                  */}

                  {/* CFP Semifinals - FIRST task in Week 4 to determine Championship matchup */}
                  {week === 4 && (() => {
                    // Use unified games[] array (source of truth) with fallback to legacy cfpResultsByYear
                    const unifiedSFData = getGamesByType(currentDynasty, GAME_TYPES.CFP_SEMIFINAL, currentDynasty.currentYear)
                    const legacySFData = currentDynasty.cfpResultsByYear?.[currentDynasty.currentYear]?.semifinals || []
                    const sfData = unifiedSFData.length > 0 ? unifiedSFData : legacySFData
                    // Need BOTH SF games (2 total) to determine Championship matchup
                    // Count games that actually have scores entered
                    const sfGamesWithScores = sfData.filter(g => g && g.team1Score !== undefined && g.team1Score !== null && g.team2Score !== undefined && g.team2Score !== null).length
                    const allSFComplete = sfGamesWithScores >= 2

                    return (
                    <div
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-3 sm:gap-0 transition-all"
                      style={allSFComplete ? {
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        border: '1px solid rgba(34, 197, 94, 0.3)'
                      } : {
                        backgroundColor: 'var(--surface-3)',
                        border: '1px solid var(--rule-soft)'
                      }}
                    >
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div
                          className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center flex-shrink-0 ${
                            allSFComplete ? 'bg-green-500 text-white' : ''
                          }`}
                          style={!allSFComplete ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                        >
                          {allSFComplete ? (
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : <span className="font-bold text-sm sm:text-base">1</span>}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-semibold" style={{ color: allSFComplete ? '#22c55e' : '#fafafa' }}>
                            CFP Semifinal Results
                          </div>
                          <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: allSFComplete ? '#22c55e' : '#a1a1aa' }}>
                            {allSFComplete ? '✓ All 2 games entered' : `${sfGamesWithScores}/2 games entered`}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => setShowCFPSemifinalsModal(true)}
                        className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm self-end sm:self-auto"
                        style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                      >
                        {allSFComplete ? 'Edit' : 'Enter'}
                      </button>
                    </div>
                    )
                  })()}

                  {/* Task: Enter YOUR CFP Championship Game (Week 4 only, if user is in Championship) */}
                  {/* This comes AFTER the SF results so we know the opponent */}
                  {week === 4 && userInCFPChampionship && (() => {
                    // Use unified games[] array (source of truth) with fallback to legacy cfpResultsByYear
                    const unifiedSFData = getGamesByType(currentDynasty, GAME_TYPES.CFP_SEMIFINAL, currentDynasty.currentYear)
                    const legacySFData = currentDynasty.cfpResultsByYear?.[currentDynasty.currentYear]?.semifinals || []
                    const sfData = unifiedSFData.length > 0 ? unifiedSFData : legacySFData
                    // Need BOTH SF games with scores to determine Championship opponent
                    const sfGamesWithScores = sfData.filter(g => g && g.team1Score !== undefined && g.team1Score !== null).length
                    const allSFComplete = sfGamesWithScores >= 2

                    // Check if championship game has actual scores (not just shell)
                    const userChampHasScores = userCFPChampionshipGame &&
                      userCFPChampionshipGame.team1Score !== null &&
                      userCFPChampionshipGame.team1Score !== undefined

                    return (
                    <div
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-3 sm:gap-0 transition-all"
                      style={userChampHasScores ? {
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        border: '1px solid rgba(34, 197, 94, 0.3)'
                      } : {
                        backgroundColor: 'var(--surface-3)',
                        border: '1px solid var(--rule-soft)'
                      }}
                    >
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div
                          className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center flex-shrink-0 ${
                            userChampHasScores ? 'bg-green-500 text-white' : ''
                          }`}
                          style={!userChampHasScores ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                        >
                          {userChampHasScores ? (
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : <span className="font-bold text-sm sm:text-base">2</span>}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-semibold" style={{ color: userChampHasScores ? '#22c55e' : '#fafafa' }}>
                            Enter Your National Championship Game
                          </div>
                          <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: userChampHasScores ? '#22c55e' : '#a1a1aa' }}>
                            {userChampHasScores
                              ? `✓ ${userCFPChampionshipGame.perspective?.userWon ? 'Won' : 'Lost'} ${Math.max(userCFPChampionshipGame.perspective?.userScore || 0, userCFPChampionshipGame.perspective?.opponentScore || 0)}-${Math.min(userCFPChampionshipGame.perspective?.userScore || 0, userCFPChampionshipGame.perspective?.opponentScore || 0)}`
                              : allSFComplete
                                ? `National Championship vs ${userChampOpponent ? getMascotName(userChampOpponent) || userChampOpponent : 'TBD'}`
                                : 'Enter SF results first to determine opponent'}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          // Use game with perspective first, then shell, then create new
                          const gameToEdit = userCFPChampionshipGame || userCFPChampionshipShell
                          if (gameToEdit) {
                            navigate(`${pathPrefix}/game/${gameToEdit.id}/edit`, { state: { from: location.pathname } })
                          } else {
                            // userChampOpponent can be tid (number) or abbr (string)
                            const opponentTid = typeof userChampOpponent === 'number' ? userChampOpponent : getTidFromAbbr(userChampOpponent)
                            const params = new URLSearchParams({
                              week: 'CFP Championship',
                              year: currentDynasty.currentYear?.toString() || '',
                              team1Tid: userTeamTid?.toString() || '',
                              team2Tid: opponentTid?.toString() || '',
                              gameType: 'cfp_championship',
                              bowlName: 'National Championship'
                            })
                            navigate(`${pathPrefix}/game/new?${params.toString()}`, { state: { from: location.pathname } })
                          }
                        }}
                        className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm self-end sm:self-auto"
                        style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                      >
                        {userChampHasScores ? 'Edit' : 'Enter'}
                      </button>
                    </div>
                    )
                  })()}

                  {/* CFP Championship - REMOVED FROM WEEK 4 for non-championship users */}
                  {/* Users who are NOT in the championship will enter this result in Week 5 (End of Season Recap) */}

                  {/* Task: Taking a New Job? (appears in bowl weeks 1-3, not in week 4/championship) */}
                  {week !== 4 && (
                  <div
                    className="p-3 sm:p-4 transition-all"
                    style={takingNewJob !== null ? {
                      backgroundColor: 'rgba(34, 197, 94, 0.1)',
                      border: '1px solid rgba(34, 197, 94, 0.3)'
                    } : {
                      backgroundColor: 'var(--surface-3)',
                      border: '1px solid var(--rule-soft)'
                    }}
                  >
                    <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 ${takingNewJob === null || (takingNewJob === true && (!newJobTeam || !newJobPosition)) ? 'mb-3' : ''}`}>
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div
                          className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center flex-shrink-0 ${
                            takingNewJob !== null ? 'bg-green-500 text-white' : ''
                          }`}
                          style={takingNewJob === null ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                        >
                          {takingNewJob !== null ? (
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : <span className="font-bold text-sm sm:text-base">2</span>}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-semibold" style={{ color: takingNewJob !== null ? '#22c55e' : '#fafafa' }}>
                            Taking a New Job? (Bowl Week {week})
                          </div>
                          {takingNewJob === true && newJobTeam && newJobPosition && (
                            <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: '#22c55e' }}>
                              ✓ {newJobPosition} at {getTeamNameFromAbbr(newJobTeam)}
                            </div>
                          )}
                          {takingNewJob === false && (
                            <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: '#22c55e' }}>
                              ✓ Staying with current team
                            </div>
                          )}
                        </div>
                      </div>
                      {(takingNewJob === false || (takingNewJob === true && newJobTeam && newJobPosition)) && (
                        <button
                          onClick={async () => {
                            setTakingNewJob(null)
                            setNewJobTeam('')
                            setNewJobPosition('')
                            // Clear pendingUserId from any team
                            const updatedTeams = clearPendingUserTeam(currentDynasty.teams)
                            await updateDynasty(currentDynasty.id, {
                              newJobData: null,
                              teams: updatedTeams
                            })
                          }}
                          className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm self-end sm:self-auto"
                          style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                        >
                          Edit
                        </button>
                      )}
                    </div>

                    {takingNewJob === null && (
                      <div className="ml-13 pl-10">
                        <div className="flex gap-3">
                          <button
                            onClick={async () => {
                              setTakingNewJob(true)
                              await updateDynasty(currentDynasty.id, {
                                newJobData: { takingNewJob: true, team: '', position: '' }
                              })
                            }}
                            className="px-6 py-2 rounded-lg font-semibold hover:opacity-90"
                            style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                          >
                            Yes
                          </button>
                          <button
                            onClick={async () => {
                              setTakingNewJob(false)
                              await updateDynasty(currentDynasty.id, {
                                newJobData: { takingNewJob: false, team: null, position: null, declinedInWeek: currentDynasty.currentWeek }
                              })
                            }}
                            className="px-6 py-2 rounded-lg font-semibold hover:opacity-90"
                            style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                          >
                            No
                          </button>
                        </div>
                      </div>
                    )}
                    {takingNewJob === true && !newJobTeam && (
                      <div className="ml-13 pl-10">
                        <p className="mb-2" style={{ color: '#a1a1aa' }}>Which team?</p>
                        <div className="max-w-xs">
                          <SearchableSelect
                            options={teams}
                            value={newJobTeam}
                            onChange={async (value) => {
                              setNewJobTeam(value)
                              // IMPORTANT: Always include takingNewJob: true to prevent state loss
                              await updateDynasty(currentDynasty.id, {
                                newJobData: { ...currentDynasty.newJobData, takingNewJob: true, team: value }
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
                      <div className="ml-13 pl-10">
                        <p className="mb-2" style={{ color: '#a1a1aa' }}>
                          New team: <strong style={{ color: '#fafafa' }}>{getTeamNameFromAbbr(newJobTeam)}</strong>
                        </p>
                        <p className="mb-2" style={{ color: '#a1a1aa' }}>What position?</p>
                        <div className="flex gap-2 flex-wrap">
                          {['HC', 'OC', 'DC'].map(pos => (
                            <button
                              key={pos}
                              onClick={async () => {
                                setNewJobPosition(pos)
                                // Get tid of the new team and set pendingUserId
                                const newTeamTid = getTidFromTeamName(currentDynasty.newJobData?.team, currentDynasty.teams)
                                const updatedTeams = newTeamTid
                                  ? setPendingUserTeam(currentDynasty.teams, newTeamTid, pos)
                                  : currentDynasty.teams
                                // IMPORTANT: Always include takingNewJob: true to prevent state loss
                                await updateDynasty(currentDynasty.id, {
                                  newJobData: { ...currentDynasty.newJobData, takingNewJob: true, position: pos },
                                  teams: updatedTeams
                                })
                              }}
                              className="px-4 py-2 rounded-lg font-semibold hover:opacity-90"
                              style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                            >
                              {pos === 'HC' ? 'Head Coach' : pos === 'OC' ? 'Offensive Coordinator' : 'Defensive Coordinator'}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  )}

                  {/* Task: Fill Coordinator Vacancy (appears in Bowl Week 3-5 if coordinator was fired) */}
                  {currentDynasty.coachPosition === 'HC' && (() => {
                    const ccDataForYear = currentDynasty.conferenceChampionshipDataByYear?.[currentDynasty.currentYear] || {}
                    return ccDataForYear.firedOCName || ccDataForYear.firedDCName
                  })() &&
                  (() => {
                    const ccDataForYear = currentDynasty.conferenceChampionshipDataByYear?.[currentDynasty.currentYear] || {}
                    const firedOC = ccDataForYear.firedOCName
                    const firedDC = ccDataForYear.firedDCName
                    // Only mark as done if vacancy is actually filled (user said Yes and entered name)
                    const ocFilled = !firedOC || (filledOCVacancy === true && newOCName)
                    const dcFilled = !firedDC || (filledDCVacancy === true && newDCName)
                    const allFilled = ocFilled && dcFilled
                    // Task is "answered" but not filled - user said "Not Yet"
                    const ocAnswered = !firedOC || filledOCVacancy !== null
                    const dcAnswered = !firedDC || filledDCVacancy !== null
                    const allAnswered = ocAnswered && dcAnswered

                    // If all positions are filled, don't show this task at all
                    if (allFilled) return null

                    return (
                      <div
                        className="p-3 sm:p-4 transition-all"
                        style={{
                          backgroundColor: 'var(--surface-3)',
                          border: '1px solid var(--rule-soft)'
                        }}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div
                              className="w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: `${teamColors.primary}20`, color: teamColors.primary }}
                            >
                              <span className="font-bold text-sm sm:text-base">3</span>
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm sm:text-base font-semibold" style={{ color: '#fafafa' }}>
                                Fill Coordinator {firedOC && firedDC ? 'Vacancies' : 'Vacancy'}
                              </div>
                              {/* Show status if user answered but vacancy not filled */}
                              {allAnswered && !allFilled && (
                                <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: '#a1a1aa' }}>
                                  {firedOC && (ocFilled ? `✓ OC: ${newOCName}` : 'OC: Not filled yet')}
                                  {firedOC && firedDC && ' • '}
                                  {firedDC && (dcFilled ? `✓ DC: ${newDCName}` : 'DC: Not filled yet')}
                                </div>
                              )}
                            </div>
                          </div>
                          {allAnswered && !allFilled && (
                            <button
                              onClick={async () => {
                                setFilledOCVacancy(null)
                                setFilledDCVacancy(null)
                                setNewOCName('')
                                setNewDCName('')
                                await updateDynasty(currentDynasty.id, { pendingCoordinatorHires: null })
                              }}
                              className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm self-end sm:self-auto"
                              style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                            >
                              Edit
                            </button>
                          )}
                        </div>

                        {/* OC Vacancy Questions */}
                        {firedOC && filledOCVacancy === null && (
                          <div className="ml-13 pl-10 mt-3">
                            <p className="mb-2 font-medium" style={{ color: '#a1a1aa' }}>
                              You fired {firedOC} (OC). Has the position been filled?
                            </p>
                            <div className="flex gap-3">
                              <button
                                onClick={() => setFilledOCVacancy(true)}
                                className="px-6 py-2 rounded-lg font-semibold hover:opacity-90"
                                style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                              >
                                Yes
                              </button>
                              <button
                                onClick={async () => {
                                  setFilledOCVacancy(false)
                                  await updateDynasty(currentDynasty.id, {
                                    pendingCoordinatorHires: {
                                      ...currentDynasty.pendingCoordinatorHires,
                                      filledOC: false,
                                      newOCName: null
                                    }
                                  })
                                }}
                                className="px-6 py-2 rounded-lg font-semibold hover:opacity-90"
                                style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                              >
                                Not Yet
                              </button>
                            </div>
                          </div>
                        )}

                        {/* OC Name Input */}
                        {firedOC && filledOCVacancy === true && !newOCName && (
                          <div className="ml-13 pl-10 mt-3">
                            <p className="mb-2 font-medium" style={{ color: '#a1a1aa' }}>
                              Enter new OC name:
                            </p>
                            <div className="flex gap-2 max-w-sm">
                              <input
                                type="text"
                                id="new-oc-name-week35"
                                className="flex-1 px-3 py-2 border-2 rounded-lg focus:outline-none"
                                style={{ borderColor: teamColors.primary }}
                                placeholder="New OC name..."
                                onKeyDown={async (e) => {
                                  if (e.key === 'Enter' && e.target.value.trim()) {
                                    const name = e.target.value.trim()
                                    setNewOCName(name)
                                    await updateDynasty(currentDynasty.id, {
                                      pendingCoordinatorHires: {
                                        ...currentDynasty.pendingCoordinatorHires,
                                        filledOC: true,
                                        newOCName: name
                                      }
                                    })
                                  }
                                }}
                              />
                              <button
                                onClick={async () => {
                                  const input = document.getElementById('new-oc-name-week35')
                                  if (input?.value.trim()) {
                                    const name = input.value.trim()
                                    setNewOCName(name)
                                    await updateDynasty(currentDynasty.id, {
                                      pendingCoordinatorHires: {
                                        ...currentDynasty.pendingCoordinatorHires,
                                        filledOC: true,
                                        newOCName: name
                                      }
                                    })
                                  }
                                }}
                                className="px-4 py-2 rounded-lg font-semibold hover:opacity-90"
                                style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        )}

                        {/* DC Vacancy Questions */}
                        {firedDC && ocAnswered && filledDCVacancy === null && (
                          <div className="ml-13 pl-10 mt-3">
                            <p className="mb-2 font-medium" style={{ color: '#a1a1aa' }}>
                              You fired {firedDC} (DC). Has the position been filled?
                            </p>
                            <div className="flex gap-3">
                              <button
                                onClick={() => setFilledDCVacancy(true)}
                                className="px-6 py-2 rounded-lg font-semibold hover:opacity-90"
                                style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                              >
                                Yes
                              </button>
                              <button
                                onClick={async () => {
                                  setFilledDCVacancy(false)
                                  await updateDynasty(currentDynasty.id, {
                                    pendingCoordinatorHires: {
                                      ...currentDynasty.pendingCoordinatorHires,
                                      filledDC: false,
                                      newDCName: null
                                    }
                                  })
                                }}
                                className="px-6 py-2 rounded-lg font-semibold hover:opacity-90"
                                style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                              >
                                Not Yet
                              </button>
                            </div>
                          </div>
                        )}

                        {/* DC Name Input */}
                        {firedDC && ocAnswered && filledDCVacancy === true && !newDCName && (
                          <div className="ml-13 pl-10 mt-3">
                            <p className="mb-2 font-medium" style={{ color: '#a1a1aa' }}>
                              Enter new DC name:
                            </p>
                            <div className="flex gap-2 max-w-sm">
                              <input
                                type="text"
                                id="new-dc-name-week35"
                                className="flex-1 px-3 py-2 border-2 rounded-lg focus:outline-none"
                                style={{ borderColor: teamColors.primary }}
                                placeholder="New DC name..."
                                onKeyDown={async (e) => {
                                  if (e.key === 'Enter' && e.target.value.trim()) {
                                    const name = e.target.value.trim()
                                    setNewDCName(name)
                                    await updateDynasty(currentDynasty.id, {
                                      pendingCoordinatorHires: {
                                        ...currentDynasty.pendingCoordinatorHires,
                                        filledDC: true,
                                        newDCName: name
                                      }
                                    })
                                  }
                                }}
                              />
                              <button
                                onClick={async () => {
                                  const input = document.getElementById('new-dc-name-week35')
                                  if (input?.value.trim()) {
                                    const name = input.value.trim()
                                    setNewDCName(name)
                                    await updateDynasty(currentDynasty.id, {
                                      pendingCoordinatorHires: {
                                        ...currentDynasty.pendingCoordinatorHires,
                                        filledDC: true,
                                        newDCName: name
                                      }
                                    })
                                  }
                                }}
                                className="px-4 py-2 rounded-lg font-semibold hover:opacity-90"
                                style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {/* Task: Recruiting Commitments (Bowl Weeks 3-4) */}
                  {(() => {
                    const commitmentKey = getCommitmentKey()
                    const userTidForCommits = getUserTeamTid(currentDynasty)
                    const commitmentsForYear = getRecruitingCommitments(currentDynasty, userTidForCommits, currentDynasty.currentYear)
                    const weekCommitments = commitmentsForYear?.[commitmentKey]
                    const hasCommitmentsData = weekCommitments !== undefined
                    const commitmentsCount = weekCommitments?.length || 0
                    const classScore = calculateRecruitingClassScore(flattenClassCommitments(commitmentsForYear))
                    // Task number depends on week and other visible tasks
                    let taskNum = week === 3 ? 2 : 2
                    if (week === 3 && userInCFPSemifinal && hasBowlWeek2Data) taskNum++ // After user SF game
                    if (week === 4) {
                      // After SF results task
                      taskNum++
                      if (userInCFPChampionship) taskNum++ // After user Championship game
                    }
                    taskNum++ // After "Taking a New Job" task
                    const ccDataForTaskNum = currentDynasty.conferenceChampionshipDataByYear?.[currentDynasty.currentYear] || {}
                    if (currentDynasty.coachPosition === 'HC' && (ccDataForTaskNum.firedOCName || ccDataForTaskNum.firedDCName)) taskNum++ // After coordinator hire task

                    return (
                      <div
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-3 sm:gap-0 transition-all"
                        style={hasCommitmentsData ? {
                          backgroundColor: 'rgba(34, 197, 94, 0.1)',
                          border: '1px solid rgba(34, 197, 94, 0.3)'
                        } : {
                          backgroundColor: 'var(--surface-3)',
                          border: '1px solid var(--rule-soft)'
                        }}
                      >
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div
                            className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md flex items-center justify-center flex-shrink-0 font-bold ${
                              hasCommitmentsData ? 'bg-green-500 text-white' : ''
                            }`}
                            style={!hasCommitmentsData ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                          >
                            {hasCommitmentsData ? (
                              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : taskNum}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm sm:text-base font-semibold" style={{ color: hasCommitmentsData ? '#22c55e' : '#fafafa' }}>
                              {hasCommitmentsData ? 'Recruiting Commitments' : 'Any commitments this week?'}
                            </div>
                            <div className="text-xs sm:text-sm mt-0.5" style={{ color: hasCommitmentsData ? '#22c55e' : '#a1a1aa' }}>
                              {hasCommitmentsData
                                ? commitmentsCount > 0
                                  ? `✓ ${commitmentsCount} commitment${commitmentsCount !== 1 ? 's' : ''} recorded`
                                  : '✓ No commitments this week'
                                : 'Record any recruiting commitments'}
                            </div>
                            {classScore > 0 && (
                              <Link
                                to={`${pathPrefix}/recruiting/${userTidForCommits}/${currentDynasty.currentYear}`}
                                className="block w-fit text-[10px] sm:text-xs mt-1 font-bold uppercase text-txt-tertiary hover:text-team-primary transition-colors"
                                style={{ letterSpacing: '1.5px' }}
                                title="View recruiting class"
                              >
                                Class Score <span className="tabular text-txt-primary ml-1">{formatRecruitingClassScore(classScore)}</span>
                              </Link>
                            )}
                            <RecruitingInsightLink className="mt-1" />
                          </div>
                        </div>
                        {!hasCommitmentsData ? (
                          <div className="flex gap-2 self-end sm:self-auto items-center">
                            <SellVsSendButton onClick={() => setShowSellCalc(true)} />
                            <button
                              onClick={handleNoCommitments}
                              className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm"
                              style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                            >
                              No
                            </button>
                            <button
                              onClick={() => setShowRecruitingModal(true)}
                              className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm"
                              style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                            >
                              Yes
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setShowRecruitingModal(true)}
                            className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm self-end sm:self-auto"
                            style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    )
                  })()}
                </div>
              </>
            )
          })()}
          </div>
        </div>
      ) : currentDynasty.currentPhase === 'offseason' ? (
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            backgroundColor: 'var(--surface-2)',
            border: '1px solid var(--rule-soft)'
          }}
        >
          <div className="px-4 pt-3 pb-4 sm:px-6 sm:pt-3 sm:pb-6">
          {(() => {
            const week = currentDynasty.currentWeek

            // Offseason Week 1: Players Leaving
            if (week === 1) {
              // Check if user switched teams - if so, skip Players Leaving
              const previousTeamAbbr = currentDynasty.coachTeamByYear?.[currentDynasty.currentYear]?.team
              const currentTeamAbbr = getCurrentTeamAbbr(currentDynasty)
              const switchedTeams = previousTeamAbbr && currentTeamAbbr && previousTeamAbbr !== currentTeamAbbr

              const hasPlayersLeavingData = currentDynasty?.playersLeavingByYear?.[currentDynasty.currentYear]?.length > 0
              const playersLeavingCount = currentDynasty?.playersLeavingByYear?.[currentDynasty.currentYear]?.length || 0

              // If user switched teams, show a different UI
              if (switchedTeams) {
                return (
                  <>
                    <div className="flex items-center gap-3 mb-3 sm:mb-4">
                      <div className="w-1 h-10 sm:h-12 rounded-full flex-shrink-0" style={{ backgroundColor: teamColors.primary }} />
                      <h3 className="font-display font-black uppercase leading-none text-txt-primary" style={{ fontSize: 'clamp(1.25rem, 2vw, 1.75rem)', letterSpacing: '-0.01em' }}>
                        New Team — No Players Leaving
                      </h3>
                    </div>
                    <div className="-space-y-px">
                      <div
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-2 sm:gap-0"
                        style={{
                          backgroundColor: 'rgba(34, 197, 94, 0.1)',
                          border: '1px solid rgba(34, 197, 94, 0.3)'
                        }}
                      >
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div
                            className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: 'rgba(34, 197, 94, 0.2)', color: '#22c55e' }}
                          >
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-sm sm:text-base" style={{ color: '#22c55e' }}>
                              Skipped - New Team
                            </div>
                            <div className="text-xs sm:text-sm mt-0.5 sm:mt-1 font-medium" style={{ color: '#22c55e' }}>
                              You switched teams, so there are no departing players to track
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )
              }

              return (
                <>
                  <div className="flex items-center gap-3 mb-3 sm:mb-4">
                    <div className="w-1 h-10 sm:h-12 rounded-full flex-shrink-0" style={{ backgroundColor: teamColors.primary }} />
                    <h3 className="font-display font-black uppercase leading-none text-txt-primary" style={{ fontSize: 'clamp(1.25rem, 2vw, 1.75rem)', letterSpacing: '-0.01em' }}>
                      Players Leaving
                    </h3>
                  </div>
                  <div className="-space-y-px">
                    {/* Task: Enter Players Leaving */}
                    <div
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-2 sm:gap-0 transition-all"
                      style={hasPlayersLeavingData ? {
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        border: '1px solid rgba(34, 197, 94, 0.3)'
                      } : {
                        backgroundColor: 'var(--surface-3)',
                        border: '1px solid var(--rule-soft)'
                      }}
                    >
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div
                          className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-display"
                          style={hasPlayersLeavingData ? {
                            backgroundColor: 'rgba(34, 197, 94, 0.2)',
                            color: '#22c55e'
                          } : {
                            backgroundColor: `${teamColors.primary}25`,
                            color: teamColors.primary
                          }}
                        >
                          {hasPlayersLeavingData ? (
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : <span className="font-bold text-sm sm:text-lg">1</span>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm sm:text-base" style={{ color: hasPlayersLeavingData ? '#22c55e' : '#fafafa' }}>
                            Players Leaving
                          </div>
                          <div className="text-xs sm:text-sm mt-0.5 sm:mt-1 font-medium" style={{ color: hasPlayersLeavingData ? '#22c55e' : '#a1a1aa' }}>
                            {hasPlayersLeavingData
                              ? `✓ ${playersLeavingCount} player${playersLeavingCount !== 1 ? 's' : ''} leaving`
                              : 'Graduating seniors, transfers, early declarations'}
                          </div>
                        </div>
                      </div>
                      {!isViewOnly ? (
                        <button
                          onClick={() => setShowPlayersLeavingModal(true)}
                          className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm self-end sm:self-auto"
                          style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                        >
                          {hasPlayersLeavingData ? 'Edit' : 'Enter'}
                        </button>
                      ) : (
                        <ViewOnlyBadge />
                      )}
                    </div>
                  </div>
                </>
              )
            }

            // Offseason Weeks 2-6: Recruiting Weeks (Week 6 = National Signing Day)
            if (week >= 2 && week <= 6) {
              const recruitingWeekNum = week - 1 // Week 2 = Recruiting Week 1, Week 6 = Signing Day (5)

              // IMPORTANT: On week 6 (Signing Day), the year has already flipped (e.g., 2026 → 2027).
              // All data from weeks 1-5 was stored under the old year (2026), so we need to look back.
              const offseasonDataYear = week === 6 ? currentDynasty.currentYear - 1 : currentDynasty.currentYear

              // Check for draft declarees (only relevant in Recruiting Week 1)
              const playersLeavingThisYear = currentDynasty?.playersLeavingByYear?.[offseasonDataYear] || []
              const draftDeclarees = playersLeavingThisYear.filter(p => p.reason === 'Pro Draft')
              const hasDraftDeclarees = draftDeclarees.length > 0

              // Check draft results - tid-based first, then legacy draftResultsByTeamYear
              const userTidForDraft = getUserTeamTid(currentDynasty)
              const userAbbrForDraft = getCurrentTeamAbbr(currentDynasty)
              const draftResultsFromTid = currentDynasty?.teams?.[userTidForDraft]?.byYear?.[offseasonDataYear]?.draftResults
              const draftResultsFromLegacy = currentDynasty?.draftResultsByTeamYear?.[userAbbrForDraft]?.[offseasonDataYear]
              const draftResultsData = draftResultsFromTid || draftResultsFromLegacy || []
              const hasDraftResultsData = draftResultsData.length > 0
              const draftResultsCount = draftResultsData.length

              // Check recruiting commitments for this week - TID-BASED with signing_ key
              const userTidForCommits = getUserTeamTid(currentDynasty)
              const recruitingCommitmentsForTeamYear = getRecruitingCommitments(currentDynasty, userTidForCommits, offseasonDataYear)
              const commitmentsForWeek = recruitingCommitmentsForTeamYear[`signing_${recruitingWeekNum}`]
              const hasCommitmentsData = commitmentsForWeek !== undefined // undefined = not answered, [] = no commitments, array with items = has commitments
              const commitmentsCount = commitmentsForWeek?.length || 0

              return (
                <>
                  <div className="flex items-center gap-3 mb-3 sm:mb-4">
                    <div className="w-1 h-10 sm:h-12 rounded-full flex-shrink-0" style={{ backgroundColor: teamColors.primary }} />
                    <h3 className="font-display font-black uppercase leading-none text-txt-primary" style={{ fontSize: 'clamp(1.25rem, 2vw, 1.75rem)', letterSpacing: '-0.01em' }}>
                      {recruitingWeekNum === 5 ? 'National Signing Day' : `Recruiting Week ${recruitingWeekNum} of 4`}
                    </h3>
                  </div>
                  <div className="-space-y-px">
                    {/* Task 1: Recruiting Commitments */}
                    <div
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-2 sm:gap-0 transition-all"
                      style={hasCommitmentsData ? {
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        border: '1px solid rgba(34, 197, 94, 0.3)'
                      } : {
                        backgroundColor: 'var(--surface-3)',
                        border: '1px solid var(--rule-soft)'
                      }}
                    >
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div
                          className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-display"
                          style={hasCommitmentsData ? {
                            backgroundColor: 'rgba(34, 197, 94, 0.2)',
                            color: '#22c55e'
                          } : {
                            backgroundColor: `${teamColors.primary}25`,
                            color: teamColors.primary
                          }}
                        >
                          {hasCommitmentsData ? (
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : <span className="font-bold text-sm sm:text-lg">1</span>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm sm:text-base" style={{ color: hasCommitmentsData ? '#22c55e' : '#fafafa' }}>
                            {hasCommitmentsData
                              ? (recruitingWeekNum === 5 ? 'Signing Day' : 'Recruiting Commitments')
                              : (recruitingWeekNum === 5 ? 'Signing Day' : 'Any commitments this week?')}
                          </div>
                          <div className="text-xs sm:text-sm mt-0.5 sm:mt-1 font-medium" style={{ color: hasCommitmentsData ? '#22c55e' : '#a1a1aa' }}>
                            {hasCommitmentsData
                              ? commitmentsCount > 0
                                ? `✓ ${commitmentsCount} commitment${commitmentsCount !== 1 ? 's' : ''} recorded`
                                : '✓ No commitments this week'
                              : (recruitingWeekNum === 5 ? 'Enter your final recruiting class' : 'Record any recruiting commitments for this week')}
                          </div>
                          <RecruitingInsightLink className="mt-1" />
                        </div>
                      </div>
                      {!hasCommitmentsData ? (
                        recruitingWeekNum === 5 ? (
                          <div className="flex gap-2 self-end sm:self-auto items-center">
                            <SellVsSendButton onClick={() => setShowSellCalc(true)} />
                            <button
                              onClick={() => setShowRecruitingModal(true)}
                              className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm"
                              style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                            >
                              Open
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-2 self-end sm:self-auto items-center">
                            <SellVsSendButton onClick={() => setShowSellCalc(true)} />
                            <button
                              onClick={handleNoCommitments}
                              className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm"
                              style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                            >
                              No
                            </button>
                            <button
                              onClick={() => setShowRecruitingModal(true)}
                              className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm"
                              style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                            >
                              Yes
                            </button>
                          </div>
                        )
                      ) : (
                        <button
                          onClick={() => setShowRecruitingModal(true)}
                          className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm self-end sm:self-auto"
                          style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                        >
                          Edit
                        </button>
                      )}
                    </div>

                    {/* Task 2: Draft Results (only in Recruiting Week 1) */}
                    {recruitingWeekNum === 1 && (
                      <div
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-2 sm:gap-0 transition-all"
                        style={(hasDraftResultsData || !hasDraftDeclarees) ? {
                          backgroundColor: 'rgba(34, 197, 94, 0.1)',
                          border: '1px solid rgba(34, 197, 94, 0.3)'
                        } : {
                          backgroundColor: 'var(--surface-3)',
                          border: '1px solid var(--rule-soft)'
                        }}
                      >
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div
                            className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-display"
                            style={(hasDraftResultsData || !hasDraftDeclarees) ? {
                              backgroundColor: 'rgba(34, 197, 94, 0.2)',
                              color: '#22c55e'
                            } : {
                              backgroundColor: `${teamColors.primary}25`,
                              color: teamColors.primary
                            }}
                          >
                            {hasDraftResultsData || !hasDraftDeclarees ? (
                              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : <span className="font-bold text-sm sm:text-lg">2</span>}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-sm sm:text-base" style={{ color: (hasDraftResultsData || !hasDraftDeclarees) ? '#22c55e' : '#fafafa' }}>
                              Draft Results
                            </div>
                            <div className="text-xs sm:text-sm mt-0.5 sm:mt-1 font-medium" style={{ color: (hasDraftResultsData || !hasDraftDeclarees) ? '#22c55e' : '#a1a1aa' }}>
                              {!hasDraftDeclarees
                                ? '✓ No players declared for the draft'
                                : hasDraftResultsData
                                  ? `✓ ${draftResultsCount} player${draftResultsCount !== 1 ? 's' : ''} drafted`
                                  : `${draftDeclarees.length} player${draftDeclarees.length !== 1 ? 's' : ''} declared for the draft`}
                            </div>
                          </div>
                        </div>
                        {hasDraftDeclarees && (
                          !isViewOnly ? (
                            <button
                              onClick={() => setShowDraftResultsModal(true)}
                              className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm self-end sm:self-auto"
                              style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                            >
                              {hasDraftResultsData ? 'Edit' : 'Enter'}
                            </button>
                          ) : (
                            <ViewOnlyBadge />
                          )
                        )}
                      </div>
                    )}

                    {/* Task 3: Transfer Destinations (only on National Signing Day) */}
                    {recruitingWeekNum === 5 && (() => {
                      // Get transferring players (NOT graduating or pro draft), deduplicated by name
                      // Source 1: playersLeavingByYear
                      const nonTransferReasons = ['Graduating', 'Pro Draft']
                      const transfersFromList = playersLeavingThisYear.filter(p =>
                        p.reason && !nonTransferReasons.includes(p.reason)
                      ).map(p => ({ name: p.playerName }))

                      // Source 2: Players with leavingYear on their record
                      const transfersFromPlayerRecord = (currentDynasty?.players || [])
                        .filter(p =>
                          p.leavingYear === offseasonDataYear &&
                          p.leavingReason &&
                          !nonTransferReasons.includes(p.leavingReason)
                        )
                        .map(p => ({ name: p.name }))

                      // Combine and deduplicate
                      const allTransfers = [...transfersFromList, ...transfersFromPlayerRecord]
                      const seenNames = new Set()
                      const transfers = allTransfers.filter(p => {
                        if (seenNames.has(p.name)) return false
                        seenNames.add(p.name)
                        return true
                      })
                      const hasTransfers = transfers.length > 0
                      // Check team-centric path (where data is actually saved)
                      const teamAbbr = getCurrentTeamAbbr(currentDynasty) || currentDynasty?.teamName
                      const transferDestinationsData = currentDynasty?.transferDestinationsByTeamYear?.[teamAbbr]?.[offseasonDataYear]
                      const hasTransferDestinationsData = Array.isArray(transferDestinationsData) && transferDestinationsData.length > 0
                      const transferDestinationsCount = transferDestinationsData?.length || 0

                      return (
                        <div
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-2 sm:gap-0 transition-all"
                          style={(hasTransferDestinationsData || !hasTransfers) ? {
                            backgroundColor: 'rgba(34, 197, 94, 0.1)',
                            border: '1px solid rgba(34, 197, 94, 0.3)'
                          } : {
                            backgroundColor: 'var(--surface-3)',
                            border: '1px solid var(--rule-soft)'
                          }}
                        >
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div
                              className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-display"
                              style={(hasTransferDestinationsData || !hasTransfers) ? {
                                backgroundColor: 'rgba(34, 197, 94, 0.2)',
                                color: '#22c55e'
                              } : {
                                backgroundColor: `${teamColors.primary}25`,
                                color: teamColors.primary
                              }}
                            >
                              {hasTransferDestinationsData || !hasTransfers ? (
                                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : <span className="font-bold text-sm sm:text-lg">3</span>}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-sm sm:text-base" style={{ color: (hasTransferDestinationsData || !hasTransfers) ? '#22c55e' : '#fafafa' }}>
                                Transfer Destinations
                              </div>
                              <div className="text-xs sm:text-sm mt-0.5 sm:mt-1 font-medium" style={{ color: (hasTransferDestinationsData || !hasTransfers) ? '#22c55e' : '#a1a1aa' }}>
                                {!hasTransfers
                                  ? '✓ No outgoing transfers'
                                  : hasTransferDestinationsData
                                    ? `✓ ${transferDestinationsCount} transfer${transferDestinationsCount !== 1 ? 's' : ''} tracked`
                                    : `Track where ${transfers.length} transfer${transfers.length !== 1 ? 's' : ''} committed`}
                              </div>
                            </div>
                          </div>
                          {hasTransfers && (
                            !isViewOnly ? (
                              <button
                                onClick={() => setShowTransferDestinationsModal(true)}
                                className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm self-end sm:self-auto"
                                style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                              >
                                {hasTransferDestinationsData ? 'Edit' : 'Enter'}
                              </button>
                            ) : (
                              <ViewOnlyBadge />
                            )
                          )}
                        </div>
                      )
                    })()}

                    {/* Task 2: Recruiting Class Rank (only on National Signing Day) */}
                    {recruitingWeekNum === 5 && (() => {
                      const teamAbbr = getCurrentTeamAbbr(currentDynasty)
                      const classRank = currentDynasty.recruitingClassRankByTeamYear?.[teamAbbr]?.[offseasonDataYear]
                      const hasClassRank = !!classRank

                      return (
                        <div
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-2 sm:gap-0 transition-all"
                          style={hasClassRank ? {
                            backgroundColor: 'rgba(34, 197, 94, 0.1)',
                            border: '1px solid rgba(34, 197, 94, 0.3)'
                          } : {
                            backgroundColor: 'var(--surface-3)',
                            border: '1px solid var(--rule-soft)'
                          }}
                        >
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div
                              className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-display"
                              style={hasClassRank ? {
                                backgroundColor: 'rgba(34, 197, 94, 0.2)',
                                color: '#22c55e'
                              } : {
                                backgroundColor: `${teamColors.primary}25`,
                                color: teamColors.primary
                              }}
                            >
                              {hasClassRank ? (
                                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : <span className="font-bold text-sm sm:text-lg">2</span>}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-sm sm:text-base" style={{ color: hasClassRank ? '#22c55e' : '#fafafa' }}>
                                Recruiting Class Rank
                              </div>
                              <div className="text-xs sm:text-sm mt-0.5 sm:mt-1 font-medium" style={{ color: hasClassRank ? '#22c55e' : '#a1a1aa' }}>
                                {hasClassRank
                                  ? `✓ Ranked #${classRank} nationally`
                                  : 'Enter national recruiting class ranking'}
                              </div>
                            </div>
                          </div>
                          {!isViewOnly ? (
                            <button
                              onClick={() => setShowRecruitingClassRankModal(true)}
                              className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm self-end sm:self-auto"
                              style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                            >
                              {hasClassRank ? 'Edit' : 'Enter'}
                            </button>
                          ) : (
                            <ViewOnlyBadge />
                          )}
                        </div>
                      )
                    })()}

                    {/* Task 4: Position Changes (only on National Signing Day) */}
                    {recruitingWeekNum === 5 && (() => {
                      const positionChangesThisYear = currentDynasty.positionChangesByYear?.[offseasonDataYear] || []
                      const hasPositionChanges = positionChangesThisYear.length > 0

                      return (
                        <div
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-2 sm:gap-0 transition-all"
                          style={hasPositionChanges ? {
                            backgroundColor: 'rgba(34, 197, 94, 0.1)',
                            border: '1px solid rgba(34, 197, 94, 0.3)'
                          } : {
                            backgroundColor: 'var(--surface-3)',
                            border: '1px solid var(--rule-soft)'
                          }}
                        >
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div
                              className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-display"
                              style={hasPositionChanges ? {
                                backgroundColor: 'rgba(34, 197, 94, 0.2)',
                                color: '#22c55e'
                              } : {
                                backgroundColor: `${teamColors.primary}25`,
                                color: teamColors.primary
                              }}
                            >
                              {hasPositionChanges ? (
                                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : <span className="font-bold text-sm sm:text-lg">4</span>}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-sm sm:text-base" style={{ color: hasPositionChanges ? '#22c55e' : '#fafafa' }}>
                                Position Changes
                              </div>
                              <div className="text-xs sm:text-sm mt-0.5 sm:mt-1 font-medium" style={{ color: hasPositionChanges ? '#22c55e' : '#a1a1aa' }}>
                                {hasPositionChanges
                                  ? `✓ ${positionChangesThisYear.length} position change${positionChangesThisYear.length !== 1 ? 's' : ''} recorded`
                                  : 'Update player positions'}
                              </div>
                            </div>
                          </div>
                          {!isViewOnly ? (
                            <button
                              onClick={() => setShowPositionChangesModal(true)}
                              className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm self-end sm:self-auto"
                              style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                            >
                              {hasPositionChanges ? 'Edit' : 'Open'}
                            </button>
                          ) : (
                            <ViewOnlyBadge />
                          )}
                        </div>
                      )
                    })()}

                    {/* Task 5: Portal Transfer Class Assignment (only on National Signing Day) */}
                    {recruitingWeekNum === 5 && (() => {
                      // Get portal transfers from recruiting commitments for this year
                      const userTidForPortal = getUserTeamTid(currentDynasty)
                      const recruitingCommitmentsAll = getRecruitingCommitments(currentDynasty, userTidForPortal, offseasonDataYear)
                      const portalTransfersForClass = []
                      Object.values(recruitingCommitmentsAll).forEach(weekCommitments => {
                        if (Array.isArray(weekCommitments)) {
                          weekCommitments.forEach(c => {
                            // Check isPortal flag and class field (commitments use 'class', not 'year')
                            const playerClass = c.class || c.year
                            if (c.isPortal && playerClass) {
                              // Only include Fr, So, Jr (not Sr) as they need class assignment
                              const baseClass = playerClass.replace('RS ', '')
                              if (['Fr', 'So', 'Jr'].includes(baseClass)) {
                                portalTransfersForClass.push({
                                  name: c.name,
                                  position: c.position,
                                  incomingClass: playerClass
                                })
                              }
                            }
                          })
                        }
                      })
                      const hasPortalTransfers = portalTransfersForClass.length > 0
                      const hasPortalTransferClassData = currentDynasty?.portalTransferClassByYear?.[offseasonDataYear]?.length > 0
                      const isBlocked = !hasCommitmentsData // Blocked until Signing Day (Task 1) is complete
                      // Task is complete if: no portal transfers exist, OR class data has been saved
                      const isComplete = (!hasPortalTransfers && hasCommitmentsData) || hasPortalTransferClassData

                      return (
                        <div
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-2 sm:gap-0 transition-all"
                          style={isComplete ? {
                            backgroundColor: 'rgba(34, 197, 94, 0.1)',
                            border: '1px solid rgba(34, 197, 94, 0.3)'
                          } : isBlocked ? {
                            backgroundColor: 'var(--surface-2)',
                            border: '1px solid var(--rule-soft)',
                            opacity: 0.5
                          } : {
                            backgroundColor: 'var(--surface-3)',
                            border: '1px solid var(--rule-soft)'
                          }}
                        >
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div
                              className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-display"
                              style={isComplete ? {
                                backgroundColor: 'rgba(34, 197, 94, 0.2)',
                                color: '#22c55e'
                              } : isBlocked ? {
                                backgroundColor: 'var(--surface-4)',
                                color: '#6b7280'
                              } : {
                                backgroundColor: `${teamColors.primary}25`,
                                color: teamColors.primary
                              }}
                            >
                              {isComplete ? (
                                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : <span className="font-bold text-sm sm:text-lg">5</span>}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-sm sm:text-base" style={{ color: isComplete ? '#22c55e' : isBlocked ? '#6b7280' : '#fafafa' }}>
                                Portal Transfer Class Assignment
                              </div>
                              <div className="text-xs sm:text-sm mt-0.5 sm:mt-1 font-medium" style={{ color: isComplete ? '#22c55e' : isBlocked ? '#6b7280' : '#a1a1aa' }}>
                                {isBlocked
                                  ? 'Complete Signing Day first'
                                  : !hasPortalTransfers
                                    ? '✓ No portal transfers to assign'
                                    : hasPortalTransferClassData
                                      ? `✓ ${portalTransfersForClass.length} transfer class${portalTransfersForClass.length !== 1 ? 'es' : ''} assigned`
                                      : `Assign classes for ${portalTransfersForClass.length} transfer${portalTransfersForClass.length !== 1 ? 's' : ''}`}
                              </div>
                            </div>
                          </div>
                          {!isViewOnly ? (
                            <button
                              onClick={() => setShowPortalTransferClassModal(true)}
                              disabled={isBlocked || !hasPortalTransfers}
                              className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm self-end sm:self-auto disabled:cursor-not-allowed"
                              style={{
                                backgroundColor: (isBlocked || !hasPortalTransfers) ? '#3f3f46' : teamColors.primary,
                                color: (isBlocked || !hasPortalTransfers) ? '#71717a' : primaryBgText
                              }}
                            >
                              {isComplete ? 'Done' : 'Open'}
                            </button>
                          ) : (
                            <ViewOnlyBadge />
                          )}
                        </div>
                      )
                    })()}

                    {/* Task 6: Fringe Case Class Assignment (only on National Signing Day) */}
                    {recruitingWeekNum === 5 && (() => {
                      // Get players with 5-9 games who might be fringe cases for redshirting
                      // ONLY non-redshirt classes (Fr, So, Jr) who played 5-9 games
                      const teamTid = getUserTeamTid(currentDynasty)
                      const year = offseasonDataYear

                      // Get all players and filter for fringe cases
                      const allPlayers = currentDynasty?.players || []
                      const fringeCasePlayers = allPlayers.filter(player => {
                        // Must have been on the team for this year (use isPlayerOnRoster for stint support)
                        if (!isPlayerOnRoster(player, teamTid, year)) return false

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

                      const hasFringeCases = fringeCasePlayers.length > 0
                      const hasFringeCaseClassData = currentDynasty?.fringeCaseClassByYear?.[offseasonDataYear]?.length > 0
                      const isBlocked = !hasCommitmentsData // Blocked until Signing Day (Task 1) is complete
                      // Task is complete if: no fringe cases exist, OR class data has been saved
                      const isComplete = (!hasFringeCases && hasCommitmentsData) || hasFringeCaseClassData

                      return (
                        <div
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-2 sm:gap-0 transition-all"
                          style={isComplete ? {
                            backgroundColor: 'rgba(34, 197, 94, 0.1)',
                            border: '1px solid rgba(34, 197, 94, 0.3)'
                          } : isBlocked ? {
                            backgroundColor: 'var(--surface-2)',
                            border: '1px solid var(--rule-soft)',
                            opacity: 0.5
                          } : {
                            backgroundColor: 'var(--surface-3)',
                            border: '1px solid var(--rule-soft)'
                          }}
                        >
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div
                              className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-display"
                              style={isComplete ? {
                                backgroundColor: 'rgba(34, 197, 94, 0.2)',
                                color: '#22c55e'
                              } : isBlocked ? {
                                backgroundColor: 'var(--surface-4)',
                                color: '#6b7280'
                              } : {
                                backgroundColor: `${teamColors.primary}25`,
                                color: teamColors.primary
                              }}
                            >
                              {isComplete ? (
                                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : <span className="font-bold text-sm sm:text-lg">6</span>}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-sm sm:text-base" style={{ color: isComplete ? '#22c55e' : isBlocked ? '#6b7280' : '#fafafa' }}>
                                Fringe Case Class Assignment
                              </div>
                              <div className="text-xs sm:text-sm mt-0.5 sm:mt-1 font-medium" style={{ color: isComplete ? '#22c55e' : isBlocked ? '#6b7280' : '#a1a1aa' }}>
                                {isBlocked
                                  ? 'Complete Signing Day first'
                                  : !hasFringeCases
                                    ? '✓ No fringe cases to resolve'
                                    : hasFringeCaseClassData
                                      ? `✓ ${fringeCasePlayers.length} player${fringeCasePlayers.length !== 1 ? 's' : ''} resolved`
                                      : `${fringeCasePlayers.length} player${fringeCasePlayers.length !== 1 ? 's' : ''} with 5-9 games`}
                              </div>
                            </div>
                          </div>
                          {!isViewOnly ? (
                            <button
                              onClick={() => setShowFringeCaseClassModal(true)}
                              disabled={isBlocked || !hasFringeCases}
                              className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm self-end sm:self-auto disabled:cursor-not-allowed"
                              style={{
                                backgroundColor: (isBlocked || !hasFringeCases) ? '#3f3f46' : teamColors.primary,
                                color: (isBlocked || !hasFringeCases) ? '#71717a' : primaryBgText
                              }}
                            >
                              {isComplete ? 'Done' : 'Open'}
                            </button>
                          ) : (
                            <ViewOnlyBadge />
                          )}
                        </div>
                      )
                    })()}

                  </div>
                </>
              )
            }

            // Offseason Week 7: Training Camp
            if (week === 7) {
              // IMPORTANT: Year has already flipped (e.g., 2027). Data from weeks 1-5 was stored under old year (2026).
              // - offseasonDataYear (2026): playersLeaving, recruitingCommitments, recruitYear
              // - currentYear (2027): trainingResults (for the new season)
              const offseasonDataYear = currentDynasty.currentYear - 1

              // Check if user switched teams this offseason
              const previousTeamAbbr = currentDynasty.coachTeamByYear?.[offseasonDataYear]?.team
              const currentTeamAbbr = getCurrentTeamAbbr(currentDynasty)
              const switchedTeams = previousTeamAbbr && currentTeamAbbr && previousTeamAbbr !== currentTeamAbbr

              // If user switched teams, show skipped state
              if (switchedTeams) {
                return (
                  <>
                    <div className="flex items-center gap-3 mb-3 sm:mb-4">
                      <div className="w-1 h-10 sm:h-12 rounded-full flex-shrink-0" style={{ backgroundColor: teamColors.primary }} />
                      <h3 className="font-display font-black uppercase leading-none text-txt-primary" style={{ fontSize: 'clamp(1.25rem, 2vw, 1.75rem)', letterSpacing: '-0.01em' }}>
                        Training Camp
                      </h3>
                    </div>
                    <div className="-space-y-px">
                      <div
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-2 sm:gap-0"
                        style={{
                          backgroundColor: 'rgba(34, 197, 94, 0.1)',
                          border: '1px solid rgba(34, 197, 94, 0.3)'
                        }}
                      >
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div
                            className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: 'rgba(34, 197, 94, 0.2)', color: '#22c55e' }}
                          >
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-sm sm:text-base" style={{ color: '#22c55e' }}>
                              Training Results - Skipped
                            </div>
                            <div className="text-xs sm:text-sm mt-0.5 sm:mt-1 font-medium" style={{ color: '#22c55e' }}>
                              Will enter new roster during preseason
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )
              }

              // Calculate which players should be in training results:
              // - Returning players who were on the roster LAST year and are continuing
              // - PLUS portal transfers who joined this offseason (they need training results too)
              // - NOT HS/JUCO recruits (they go in Recruiting Class Overalls instead)
              const teamAbbr = getCurrentTeamAbbr(currentDynasty)
              const teamTid = getTidFromAbbr(teamAbbr)
              const playersLeavingThisYear = currentDynasty?.playersLeavingByYear?.[offseasonDataYear] || []
              const leavingPids = new Set(playersLeavingThisYear.map(p => p.pid))

              const allPlayers = currentDynasty?.players || []
              const currentYear = currentDynasty.currentYear

              // Helper to check if a teamsByYear value matches our team (handles both tid and abbr)
              const matchesTeam = (value) => value === teamTid || value === teamAbbr

              // Get RETURNING players (was on team last year, still on team this year)
              // Uses isPlayerOnRoster which handles both stint-based and legacy players
              const returningPlayers = allPlayers.filter(p => {
                if (leavingPids.has(p.pid)) return false
                if (p.isRecruit) return false
                if (p.isHonorOnly) return false
                const wasOnTeamLastYear = isPlayerOnRoster(p, teamTid || teamAbbr, offseasonDataYear)
                const isOnTeamThisYear = isPlayerOnRoster(p, teamTid || teamAbbr, currentYear)
                return wasOnTeamLastYear && isOnTeamThisYear
              })

              // Get PORTAL TRANSFERS who joined this offseason (need training results too)
              const portalTransfers = allPlayers.filter(p => {
                if (leavingPids.has(p.pid)) return false
                if (p.isHonorOnly) return false
                // Portal transfer = has previousTeam or isPortal flag, recruited this cycle
                const isPortalTransfer = (p.isPortal || p.previousTeam) && p.recruitYear === offseasonDataYear
                if (!isPortalTransfer) return false
                // Must be on the team this year (uses isPlayerOnRoster for stint-based support)
                const isOnTeamThisYear = isPlayerOnRoster(p, teamTid || teamAbbr, currentYear)
                return isOnTeamThisYear
              })

              // Combine returning players and portal transfers for training results
              const trainingPlayers = [...returningPlayers, ...portalTransfers]

              // Training results are stored under the NEW year (the upcoming season)
              const hasTrainingResultsData = currentDynasty?.trainingResultsByYear?.[currentDynasty.currentYear]?.length > 0
              const trainingResultsCount = currentDynasty?.trainingResultsByYear?.[currentDynasty.currentYear]?.length || 0

              // Get recruits for Recruiting Class Overalls task
              // These are HS and JUCO players from the recruiting cycle (stored under old year)
              const recruitingClassPlayers = allPlayers.filter(p =>
                p.isRecruit &&
                p.recruitYear === offseasonDataYear &&
                (!p.team || matchesTeam(p.team)) &&
                !p.isPortal && !p.previousTeam // Exclude transfer portal players
              )
              // Recruit overalls are stored under the old year (same as recruitYear)
              const hasRecruitOverallsData = currentDynasty?.recruitOverallsByYear?.[offseasonDataYear]?.length > 0
              const recruitOverallsCount = currentDynasty?.recruitOverallsByYear?.[offseasonDataYear]?.length || 0

              return (
                <>
                  <div className="flex items-center gap-3 mb-3 sm:mb-4">
                    <div className="w-1 h-10 sm:h-12 rounded-full flex-shrink-0" style={{ backgroundColor: teamColors.primary }} />
                    <h3 className="font-display font-black uppercase leading-none text-txt-primary" style={{ fontSize: 'clamp(1.25rem, 2vw, 1.75rem)', letterSpacing: '-0.01em' }}>
                      Training Camp
                    </h3>
                  </div>
                  <div className="-space-y-px">
                    {/* Task 1: Training Results */}
                    <div
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-2 sm:gap-0 transition-all"
                      style={hasTrainingResultsData ? {
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        border: '1px solid rgba(34, 197, 94, 0.3)'
                      } : {
                        backgroundColor: 'var(--surface-3)',
                        border: '1px solid var(--rule-soft)'
                      }}
                    >
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div
                          className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-display"
                          style={hasTrainingResultsData ? {
                            backgroundColor: 'rgba(34, 197, 94, 0.2)',
                            color: '#22c55e'
                          } : {
                            backgroundColor: `${teamColors.primary}25`,
                            color: teamColors.primary
                          }}
                        >
                          {hasTrainingResultsData ? (
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : <span className="font-bold text-sm sm:text-lg">1</span>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm sm:text-base" style={{ color: hasTrainingResultsData ? '#22c55e' : '#fafafa' }}>
                            Training Results
                          </div>
                          <div className="text-xs sm:text-sm mt-0.5 sm:mt-1 font-medium" style={{ color: hasTrainingResultsData ? '#22c55e' : '#a1a1aa' }}>
                            {hasTrainingResultsData
                              ? `✓ ${trainingResultsCount} player overall${trainingResultsCount !== 1 ? 's' : ''} updated`
                              : `Enter new overalls for ${trainingPlayers.length} players`}
                          </div>
                        </div>
                      </div>
                      {!isViewOnly ? (
                        <button
                          onClick={() => setShowTrainingResultsModal(true)}
                          className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm self-end sm:self-auto"
                          style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                        >
                          {hasTrainingResultsData ? 'Edit' : 'Enter'}
                        </button>
                      ) : (
                        <ViewOnlyBadge />
                      )}
                    </div>

                    {/* Task 2: Recruiting Class Overalls */}
                    {recruitingClassPlayers.length > 0 && (
                      <div
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-2 sm:gap-0 transition-all"
                        style={hasRecruitOverallsData ? {
                          backgroundColor: 'rgba(34, 197, 94, 0.1)',
                          border: '1px solid rgba(34, 197, 94, 0.3)'
                        } : {
                          backgroundColor: 'var(--surface-3)',
                          border: '1px solid var(--rule-soft)'
                        }}
                      >
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div
                            className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-display"
                            style={hasRecruitOverallsData ? {
                              backgroundColor: 'rgba(34, 197, 94, 0.2)',
                              color: '#22c55e'
                            } : {
                              backgroundColor: `${teamColors.primary}25`,
                              color: teamColors.primary
                            }}
                          >
                            {hasRecruitOverallsData ? (
                              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : <span className="font-bold text-sm sm:text-lg">2</span>}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-sm sm:text-base" style={{ color: hasRecruitOverallsData ? '#22c55e' : '#fafafa' }}>
                              Recruiting Class Overalls
                            </div>
                            <div className="text-xs sm:text-sm mt-0.5 sm:mt-1 font-medium" style={{ color: hasRecruitOverallsData ? '#22c55e' : '#a1a1aa' }}>
                              {hasRecruitOverallsData
                                ? `✓ ${recruitOverallsCount} recruit overall${recruitOverallsCount !== 1 ? 's' : ''} entered`
                                : `Enter overalls for ${recruitingClassPlayers.length} recruit${recruitingClassPlayers.length !== 1 ? 's' : ''}`}
                            </div>
                          </div>
                        </div>
                        {!isViewOnly ? (
                          <button
                            onClick={() => setShowRecruitOverallsModal(true)}
                            className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm self-end sm:self-auto"
                            style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                          >
                            {hasRecruitOverallsData ? 'Edit' : 'Enter'}
                          </button>
                        ) : (
                          <ViewOnlyBadge />
                        )}
                      </div>
                    )}
                  </div>
                </>
              )
            }

            // Offseason Week 8: Offseason (Custom Conferences & Encourage Transfers)
            if (week === 8) {
              const userTid = getUserTeamTid(currentDynasty)
              // Year already flipped at Signing Day (Week 6), so currentYear IS the upcoming season
              const upcomingSeasonYear = currentDynasty.currentYear

              // Check if conferences have been set for the upcoming season
              const hasConferencesSet = currentDynasty?.customConferencesByYear?.[upcomingSeasonYear] != null

              // Check if encourage transfers has been completed (use tid-based getter)
              const encourageTransfersList = getEncourageTransfers(currentDynasty, userTid, currentDynasty.currentYear)
              const hasEncourageTransfers = encourageTransfersList.length > 0 || currentDynasty?.teams?.[userTid]?.byYear?.[currentDynasty.currentYear]?.encourageTransfers != null
              const encourageTransfersCount = encourageTransfersList.length

              return (
                <>
                  <div className="flex items-center gap-3 mb-3 sm:mb-4">
                    <div className="w-1 h-10 sm:h-12 rounded-full flex-shrink-0" style={{ backgroundColor: teamColors.primary }} />
                    <h3 className="font-display font-black uppercase leading-none text-txt-primary" style={{ fontSize: 'clamp(1.25rem, 2vw, 1.75rem)', letterSpacing: '-0.01em' }}>
                      Offseason
                    </h3>
                  </div>
                  <div className="-space-y-px">
                    {/* Task 1: Custom Conferences */}
                    <div
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-2 sm:gap-0 transition-all"
                      style={hasConferencesSet ? {
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        border: '1px solid rgba(34, 197, 94, 0.3)'
                      } : {
                        backgroundColor: 'var(--surface-3)',
                        border: '1px solid var(--rule-soft)'
                      }}
                    >
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div
                          className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-display"
                          style={hasConferencesSet ? {
                            backgroundColor: 'rgba(34, 197, 94, 0.2)',
                            color: '#22c55e'
                          } : {
                            backgroundColor: `${teamColors.primary}25`,
                            color: teamColors.primary
                          }}
                        >
                          {hasConferencesSet ? (
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : <span className="font-bold text-sm sm:text-lg">1</span>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm sm:text-base" style={{ color: hasConferencesSet ? '#22c55e' : '#fafafa' }}>
                            Custom Conferences
                          </div>
                          <div className="text-xs sm:text-sm mt-0.5 sm:mt-1 font-medium" style={{ color: hasConferencesSet ? '#22c55e' : '#a1a1aa' }}>
                            {hasConferencesSet
                              ? `✓ Conference alignment set for ${upcomingSeasonYear}`
                              : `Set conference alignment for ${upcomingSeasonYear} season`}
                          </div>
                        </div>
                      </div>
                      {!isViewOnly ? (
                        <button
                          onClick={() => setShowOffseasonConferencesModal(true)}
                          className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm self-end sm:self-auto"
                          style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                        >
                          {hasConferencesSet ? 'Edit' : 'Set'}
                        </button>
                      ) : (
                        <ViewOnlyBadge />
                      )}
                    </div>

                    {/* Task 2: Encourage Transfers */}
                    <div
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 gap-2 sm:gap-0 transition-all"
                      style={hasEncourageTransfers ? {
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        border: '1px solid rgba(34, 197, 94, 0.3)'
                      } : {
                        backgroundColor: 'var(--surface-3)',
                        border: '1px solid var(--rule-soft)'
                      }}
                    >
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div
                          className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-display"
                          style={hasEncourageTransfers ? {
                            backgroundColor: 'rgba(34, 197, 94, 0.2)',
                            color: '#22c55e'
                          } : {
                            backgroundColor: `${teamColors.primary}25`,
                            color: teamColors.primary
                          }}
                        >
                          {hasEncourageTransfers ? (
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : <span className="font-bold text-sm sm:text-lg">2</span>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm sm:text-base" style={{ color: hasEncourageTransfers ? '#22c55e' : '#fafafa' }}>
                            Encourage Transfers
                          </div>
                          <div className="text-xs sm:text-sm mt-0.5 sm:mt-1 font-medium" style={{ color: hasEncourageTransfers ? '#22c55e' : '#a1a1aa' }}>
                            {hasEncourageTransfers
                              ? `✓ ${encourageTransfersCount} player${encourageTransfersCount !== 1 ? 's' : ''} encouraged to transfer`
                              : 'Mark players to encourage to transfer'}
                          </div>
                        </div>
                      </div>
                      {!isViewOnly ? (
                        <button
                          onClick={() => setShowEncourageTransfersModal(true)}
                          className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm self-end sm:self-auto"
                          style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                        >
                          {hasEncourageTransfers ? 'Edit' : 'Enter'}
                        </button>
                      ) : (
                        <ViewOnlyBadge />
                      )}
                    </div>
                  </div>
                </>
              )
            }

            // Fallback for any other weeks
            return (
              <>
                <div className="flex items-center gap-3 mb-3 sm:mb-4">
                  <div className="w-1 h-10 sm:h-12 rounded-full flex-shrink-0" style={{ backgroundColor: teamColors.primary }} />
                  <h3 className="font-display font-black uppercase leading-none text-txt-primary" style={{ fontSize: 'clamp(1.25rem, 2vw, 1.75rem)', letterSpacing: '-0.01em' }}>
                    Off-Season Week {week}
                  </h3>
                </div>
                <p className="text-sm text-zinc-400">
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
          style={{ borderLeftColor: teamColors.primary }}
        >
          <h3 className="text-lg font-semibold mb-4 text-txt-primary">
            Current Phase: {getPhaseDisplay(currentDynasty.currentPhase, currentDynasty.currentWeek)}
          </h3>
          <p className="text-txt-secondary">
            Click "Advance Week" in the header to progress through your dynasty.
          </p>
        </div>
      )}

          {/* Roster Section - Desktop Only (below tasks) */}
          <div className="hidden lg:flex lg:flex-col lg:flex-1 lg:min-h-0">
            <div className="flex flex-col flex-1 min-h-0">
              <div className="py-3 flex items-center justify-between flex-shrink-0" style={{ borderBottom: '1px solid var(--rule-soft)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-1 h-12 rounded-full" style={{ backgroundColor: teamColors.primary }} />
                  <div
                    className="font-display font-black leading-none"
                    style={{
                      fontSize: 'clamp(1.75rem, 2.2vw, 2.25rem)',
                      color: 'var(--text-primary)',
                      letterSpacing: '-0.01em'
                    }}
                  >
                    <span className="tabular-nums">{currentDynasty.currentYear}</span>
                    <span className="ml-2 uppercase">Roster</span>
                  </div>
                  {teamRoster.length > 0 && (
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 tabular-nums">
                      {teamRoster.length} Players
                    </span>
                  )}
                  <Link
                    to={`${pathPrefix}/team/${userTeamTid}/${currentDynasty.currentYear}?tab=roster`}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
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
                          ? 'bg-zinc-700 text-white'
                          : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
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
                  <div className="divide-y divide-zinc-800/50">
                    {sortRoster(teamRoster).map((player) => (
                      <div
                        key={player.pid}
                        onClick={() => navigate(`${pathPrefix}/player/${player.pid}`)}
                        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-all hover:bg-zinc-800/60 group"
                      >
                        {/* Jersey Number */}
                        <span className="text-sm font-bold text-zinc-400 w-6 text-right">{player.jerseyNumber || '--'}</span>

                        {/* Player Image */}
                        <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-zinc-700 group-hover:ring-zinc-600 transition-all" style={{ backgroundColor: 'var(--surface-4)' }}>
                          {player.pictureUrl ? (
                            <img src={player.pictureUrl} alt={player.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <svg className="w-5 h-5 text-zinc-600" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                              </svg>
                            </div>
                          )}
                        </div>

                        {/* Name & Position */}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-zinc-100 truncate group-hover:text-white transition-colors">
                            {player.name}
                          </div>
                          <div className="text-xs text-zinc-500 mt-0.5">
                            <span className="font-medium text-zinc-400">{player.position}</span>
                            <span className="mx-1.5">·</span>
                            <span>{player.year || '-'}</span>
                          </div>
                        </div>

                        {/* Overall Rating */}
                        <div className="text-lg font-bold text-zinc-100">{player.overall || '--'}</div>
                      </div>
                    ))}
                  </div>
                ) : isLoadingDynastyData ? (
                  <div className="text-center py-8">
                    <div className="inline-block w-6 h-6 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin mb-2" />
                    <p className="text-sm text-zinc-500">Loading roster...</p>
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500 text-center py-8">
                    No players on roster yet
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
        {/* End Left Column */}

        {/* Right Column: Schedule - Desktop Only */}
        <div ref={scheduleColumnRef} className="hidden lg:block">
          {/* Schedule Section - Clean Redesign */}
      <div>
        {/* Schedule Header */}
        <div className="py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--rule-soft)' }}>
          <div className="flex items-center gap-3">
            <div
              className="w-1 h-12 rounded-full"
              style={{ backgroundColor: teamColors.primary }}
            />
            <div
              className="font-display font-black leading-none"
              style={{
                fontSize: 'clamp(1.75rem, 2.2vw, 2.25rem)',
                color: 'var(--text-primary)',
                letterSpacing: '-0.01em'
              }}
            >
              <span className="tabular-nums">{currentDynasty.currentYear}</span>
              <span className="ml-2 uppercase">Schedule</span>
            </div>
            <Link
              to={`${pathPrefix}/team/${userTeamTid}/${currentDynasty.currentYear}?tab=schedule`}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
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
              className="p-2.5 rounded-xl bg-zinc-800/50 hover:bg-zinc-700/50 transition-colors text-zinc-400 hover:text-white"
              title="Edit Schedule"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          )}
        </div>

        {/* Schedule Body */}
        <div className="divide-y divide-zinc-800/50 stagger-reveal">
          {teamSchedule && teamSchedule.length > 0 ? (
            <>
              {/* Render all weeks 0-15, showing bye weeks for missing entries */}
              {Array.from({ length: 16 }, (_, weekNum) => {
                const entry = teamSchedule.find(e => Number(e.week) === weekNum)

                // Handle BYE weeks - explicit bye, missing entry, or no opponent
                const isByeWeek = !entry || entry.isBye || entry.opponent?.toUpperCase() === 'BYE' || !entry.opponent

                if (isByeWeek) {
                  return (
                    <div
                      key={weekNum}
                      className="flex items-center px-5 py-3"
                    >
                      <span className="w-8 text-xs font-medium text-zinc-600">{weekNum}</span>
                      <span className="flex-1 text-sm text-zinc-600 italic">Bye Week</span>
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
                    className={`relative flex items-center py-2.5 gap-3 transition-all duration-200 ${isLink ? 'hover:bg-surface-3 hover:z-10' : ''} ${isCurrentWeek ? 'ring-1 ring-inset' : ''}`}
                    style={{
                      background: `linear-gradient(to right, transparent 0%, ${opponentColors.backgroundColor}99 100%)`,
                      paddingLeft: '1rem',
                      paddingRight: '1rem',
                      ...(isCurrentWeek ? { ringColor: teamColors.primary } : {})
                    }}
                  >
                    {/* Week Number */}
                    <span className={`w-7 text-xs font-medium ${isCurrentWeek ? 'text-white' : 'text-zinc-500'}`}>
                      {isCurrentWeek ? (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold" style={{ backgroundColor: teamColors.primary }}>
                          {weekNum}
                        </span>
                      ) : weekNum}
                    </span>

                    {/* Team Logo - White background for contrast */}
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity bg-white shadow-sm"
                      style={{ padding: '5px' }}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(teamPageUrl) }}
                    >
                      {opponentLogo ? (
                        <img src={opponentLogo} alt={opponentName} className="w-full h-full object-contain" />
                      ) : (
                        <span className="text-xs font-bold" style={{ color: opponentColors.backgroundColor }}>
                          {entry.opponent?.slice(0, 3)}
                        </span>
                      )}
                    </div>

                    {/* Opponent Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {entry.perspective?.opponentRank && (
                          <span className="text-xs font-bold text-amber-400">
                            #{entry.perspective.opponentRank}
                          </span>
                        )}
                        <span className="text-sm font-semibold text-zinc-100 truncate">
                          {opponentName}
                        </span>
                      </div>
                      <span className="text-[10px] text-white/70">
                        {entry.location === 'away' ? 'Away' : 'Home'}
                      </span>
                    </div>

                    {/* Score with W/L indicator */}
                    <div className="flex items-center gap-2">
                      {entry.isPlayed && (
                        <span className={`text-sm font-bold ${isWin ? 'text-emerald-400' : 'text-red-400'}`}>
                          {isWin ? 'W' : 'L'}
                        </span>
                      )}
                      <div className="w-14 text-right">
                        {entry.isPlayed ? (
                          <div className="flex flex-col items-end">
                            <span className="text-base font-bold tabular-nums text-white">
                              {Math.max(entry.perspective?.userScore || 0, entry.perspective?.opponentScore || 0)}-{Math.min(entry.perspective?.userScore || 0, entry.perspective?.opponentScore || 0)}
                            </span>
                            {playedGame?.overtimes && playedGame.overtimes.length > 0 && (
                              <span className="text-[10px] text-zinc-500">
                                {playedGame.overtimes.length > 1 ? `${playedGame.overtimes.length}OT` : 'OT'}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-zinc-600">—</span>
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
                    ...(isCurrentCCWeek ? { ringColor: teamColors.primary } : {})
                  }}
                >
                  <span className={`w-7 text-xs font-medium ${isCurrentCCWeek ? 'text-white' : 'text-zinc-500'}`}>
                    {isCurrentCCWeek ? (
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold" style={{ backgroundColor: teamColors.primary }}>CC</span>
                    ) : 'CC'}
                  </span>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-white shadow-sm" style={{ padding: '5px' }}>
                    {ccOpponentLogo ? <img src={ccOpponentLogo} alt={ccOpponentName} className="w-full h-full object-contain" /> : <span className="text-xs font-bold" style={{ color: ccOpponentColors.backgroundColor }}>{ccOpponentAbbr?.slice(0, 3) || '?'}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {ccGame?.opponentRank && <span className="text-xs font-bold text-amber-400">#{ccGame.opponentRank}</span>}
                      <span className="text-sm font-semibold text-zinc-100 truncate">{ccOpponentName}</span>
                    </div>
                    <span className="text-[10px] text-zinc-500">Conf Championship</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {ccGame && (
                      <span className={`text-sm font-bold ${isWin ? 'text-emerald-400' : 'text-red-400'}`}>{isWin ? 'W' : 'L'}</span>
                    )}
                    <div className="w-14 text-right">
                      {ccGame && userScore != null ? (
                        <span className="text-base font-bold tabular-nums text-white">{Math.max(userScore || 0, opponentScore || 0)}-{Math.min(userScore || 0, opponentScore || 0)}</span>
                      ) : <span className="text-sm text-zinc-600">—</span>}
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
                  <span className="w-7 text-xs font-medium text-zinc-500">Bowl</span>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-white shadow-sm" style={{ padding: '5px' }}>
                    {bowlOpponentLogo ? <img src={bowlOpponentLogo} alt={bowlOpponentName} className="w-full h-full object-contain" /> : <span className="text-xs font-bold" style={{ color: bowlOpponentColors.backgroundColor }}>{bowlOpponentAbbr?.slice(0, 3) || '?'}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {userBowlGameData?.opponentRank && <span className="text-xs font-bold text-amber-400">#{userBowlGameData.opponentRank}</span>}
                      <span className="text-sm font-semibold text-zinc-100 truncate">{bowlOpponentName}</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 truncate block">{bowlGameName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {userBowlGameData && (
                      <span className={`text-sm font-bold ${isWin ? 'text-emerald-400' : 'text-red-400'}`}>{isWin ? 'W' : 'L'}</span>
                    )}
                    <div className="w-14 text-right">
                      {userBowlGameData && userScore != null ? (
                        <span className="text-base font-bold tabular-nums text-white">{Math.max(userScore || 0, opponentScore || 0)}-{Math.min(userScore || 0, opponentScore || 0)}</span>
                      ) : <span className="text-sm text-zinc-600">—</span>}
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
                    <span className="w-7 text-xs font-medium text-zinc-500">R1</span>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-white shadow-sm" style={{ padding: '5px' }}>
                      {oppLogo ? <img src={oppLogo} alt={oppName} className="w-full h-full object-contain" /> : <span className="text-xs font-bold" style={{ color: oppColors.backgroundColor }}>{oppAbbr?.slice(0, 3) || '?'}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-zinc-100 truncate block">{oppName}</span>
                      <span className="text-[10px] text-zinc-500">CFP First Round</span>
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
                    <span className="w-7 text-xs font-medium text-zinc-500">QF</span>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-white shadow-sm" style={{ padding: '5px' }}>
                      {oppLogo ? <img src={oppLogo} alt={oppName} className="w-full h-full object-contain" /> : <span className="text-xs font-bold" style={{ color: oppColors.backgroundColor }}>{oppAbbr?.slice(0, 3) || '?'}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-zinc-100 truncate block">{oppName}</span>
                      <span className="text-[10px] text-zinc-500 truncate block">{bowlName}</span>
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
                    <span className="w-7 text-xs font-medium text-zinc-500">SF</span>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-white shadow-sm" style={{ padding: '5px' }}>
                      {oppLogo ? <img src={oppLogo} alt={oppName} className="w-full h-full object-contain" /> : <span className="text-xs font-bold" style={{ color: oppColors.backgroundColor }}>{oppAbbr?.slice(0, 3) || '?'}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-zinc-100 truncate block">{oppName}</span>
                      <span className="text-[10px] text-zinc-500 truncate block">{bowlName}</span>
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
                      <span className="text-sm font-semibold text-zinc-100 truncate block">{oppName}</span>
                      <span className="text-[10px] text-zinc-500">National Championship</span>
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
            <div className="inline-block w-8 h-8 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin mb-4" />
            <h3 className="font-display text-lg font-medium mb-2 text-zinc-100">
              Loading Schedule...
            </h3>
          </div>
          ) : (
          <div className="text-center py-12">
            <div className="text-zinc-600 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="font-display text-lg font-medium mb-2 text-zinc-100">
              No Schedule Yet
            </h3>
            <p className="text-zinc-500">
              Add your season schedule to get started.
            </p>
          </div>
        )}
        </div>
      </div>
        </div>
        {/* End Right Column */}

        {/* Mobile Tabbed Section - Schedule/Roster Tabs */}
        <div className="lg:hidden">
          {/* Tab Buttons */}
          <div className="flex mb-4 rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--rule-soft)' }}>
            <button
              onClick={() => setMobileTab('schedule')}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                mobileTab === 'schedule'
                  ? 'text-white'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
              style={mobileTab === 'schedule' ? { backgroundColor: teamColors.primary } : {}}
            >
              Schedule
            </button>
            <button
              onClick={() => setMobileTab('roster')}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                mobileTab === 'roster'
                  ? 'text-white'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
              style={mobileTab === 'roster' ? { backgroundColor: teamColors.primary } : {}}
            >
              Roster
            </button>
          </div>

          {/* Schedule Tab Content */}
          {mobileTab === 'schedule' && (
            <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--surface-1)', border: '1px solid var(--rule-soft)' }}>
              {/* Schedule Header */}
              <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--rule-soft)' }}>
                <div className="flex items-center gap-3">
                  <div
                    className="w-1 h-10 rounded-full"
                    style={{ backgroundColor: teamColors.primary }}
                  />
                  <div>
                    <h2 className="text-lg font-bold text-white tracking-tight">
                      {currentDynasty.currentYear} Schedule
                    </h2>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-sm font-semibold text-white">{wins}-{losses}</span>
                      {(confWins > 0 || confLosses > 0) && (
                        <span className="text-sm text-zinc-500">({confWins}-{confLosses} conf)</span>
                      )}
                    </div>
                  </div>
                  <Link
                    to={`${pathPrefix}/team/${userTeamTid}/${currentDynasty.currentYear}?tab=schedule`}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
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
                    className="p-2.5 rounded-xl bg-zinc-800/50 hover:bg-zinc-700/50 transition-colors text-zinc-400 hover:text-white"
                    title="Edit Schedule"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Schedule Games - Reuse same rendering logic */}
              <div className="divide-y divide-zinc-800/30">
                {teamSchedule.length > 0 ? (
                  <>
                    {teamSchedule.map((entry, index) => {
                      const weekNum = entry.week
                      if (entry.isBye) {
                        return (
                          <div key={weekNum} className="flex items-center py-2.5 gap-3 px-4">
                            <span className="w-7 text-xs font-medium text-zinc-600">{weekNum}</span>
                            <span className="text-sm text-zinc-600 italic">Bye Week</span>
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
                          className={`relative flex items-center py-2.5 gap-3 transition-all duration-200 ${isLink ? 'hover:bg-surface-3 hover:z-10' : ''} ${isCurrentWeek ? 'ring-1 ring-inset' : ''}`}
                          style={{
                            background: `linear-gradient(to right, transparent 0%, ${opponentColors.backgroundColor}99 100%)`,
                            paddingLeft: '1rem',
                            paddingRight: '1rem',
                            ...(isCurrentWeek ? { ringColor: teamColors.primary } : {})
                          }}
                        >
                          <span className={`w-7 text-xs font-medium ${isCurrentWeek ? 'text-white' : 'text-zinc-500'}`}>
                            {isCurrentWeek ? (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold" style={{ backgroundColor: teamColors.primary }}>
                                {weekNum}
                              </span>
                            ) : weekNum}
                          </span>
                          <div
                            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity bg-white shadow-sm"
                            style={{ padding: '5px' }}
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(teamPageUrl) }}
                          >
                            {opponentLogo ? (
                              <img src={opponentLogo} alt={opponentName} className="w-full h-full object-contain" />
                            ) : (
                              <span className="text-xs font-bold" style={{ color: opponentColors.backgroundColor }}>
                                {entry.opponent?.slice(0, 3)}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              {entry.perspective?.opponentRank && (
                                <span className="text-xs font-bold text-amber-400">
                                  #{entry.perspective.opponentRank}
                                </span>
                              )}
                              <span className="text-sm font-semibold text-zinc-100 truncate">
                                {opponentName}
                              </span>
                            </div>
                            <span className="text-[10px] text-white/70">
                              {entry.location === 'away' ? 'Away' : 'Home'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {entry.isPlayed && (
                              <span className={`text-sm font-bold ${isWin ? 'text-emerald-400' : 'text-red-400'}`}>
                                {isWin ? 'W' : 'L'}
                              </span>
                            )}
                            <div className="w-14 text-right">
                              {entry.isPlayed ? (
                                <span className="text-base font-bold tabular-nums text-white">
                                  {Math.max(entry.perspective?.userScore || 0, entry.perspective?.opponentScore || 0)}-{Math.min(entry.perspective?.userScore || 0, entry.perspective?.opponentScore || 0)}
                                </span>
                              ) : (
                                <span className="text-sm text-zinc-600">—</span>
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
                  </>
                ) : isLoadingDynastyData ? (
                  <div className="text-center py-12">
                    <div className="inline-block w-6 h-6 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin mb-2" />
                    <p className="text-zinc-500">Loading schedule...</p>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-zinc-500">No schedule entered yet.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Roster Tab Content */}
          {mobileTab === 'roster' && (
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--surface-1)', border: '1px solid var(--rule-soft)' }}>
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--rule-soft)' }}>
              <div className="flex items-center gap-3">
                <div
                  className="w-1 h-10 rounded-full"
                  style={{ backgroundColor: teamColors.primary }}
                />
                <div>
                  <h2 className="text-lg font-bold text-white tracking-tight">
                    {currentDynasty.currentYear} Roster
                  </h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-sm font-semibold text-white">{teamRoster.length} Players</span>
                  </div>
                </div>
                <Link
                  to={`${pathPrefix}/team/${userTeamTid}/${currentDynasty.currentYear}?tab=roster`}
                  className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
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
                    className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
                      rosterSort === key
                        ? 'bg-zinc-700 text-white'
                        : 'text-zinc-500 hover:text-zinc-300'
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
                <div className="divide-y divide-zinc-800/50">
                  {sortRoster(teamRoster).map((player) => (
                    <div
                      key={player.pid}
                      onClick={() => navigate(`${pathPrefix}/player/${player.pid}`)}
                      className="flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-all active:bg-zinc-800/60"
                    >
                      {/* Jersey Number */}
                      <span className="text-sm font-bold text-zinc-400 w-6 text-right">{player.jerseyNumber || '--'}</span>

                      {/* Player Image */}
                      <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-zinc-700" style={{ backgroundColor: 'var(--surface-4)' }}>
                        {player.pictureUrl ? (
                          <img src={player.pictureUrl} alt={player.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <svg className="w-4 h-4 text-zinc-600" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                            </svg>
                          </div>
                        )}
                      </div>

                      {/* Name & Position */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-zinc-100 truncate">{player.name}</div>
                        <div className="text-[10px] text-zinc-500 mt-0.5">
                          <span className="font-medium text-zinc-400">{player.position}</span>
                          <span className="mx-1">·</span>
                          <span>{player.year || '-'}</span>
                        </div>
                      </div>

                      {/* Overall Rating */}
                      <div className="text-base font-bold text-zinc-100">{player.overall || '--'}</div>
                    </div>
                  ))}
                </div>
              ) : isLoadingDynastyData ? (
                <div className="text-center py-8">
                  <div className="inline-block w-6 h-6 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin mb-2" />
                  <p className="text-sm text-zinc-500">Loading roster...</p>
                </div>
              ) : (
                <p className="text-sm text-zinc-500 text-center py-8">
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

            // Map CFP Quarterfinal games to structured format with bowl info
            // Get CFP seeds to determine bye seed from team2 (higher seed is in team2 position)
            const cfpSeeds = currentDynasty.cfpSeedsByYear?.[year] || []

            const cfpQuarterfinals = cfpQuarterfinalGames.map(game => {
              const sanitized = sanitizeGame(game)
              // Extract bowl name (e.g., "Cotton Bowl" from "Cotton Bowl (CFP QF)")
              const bowlMatch = game.bowlName?.match(/^(.+?)\s*\(CFP/)
              const bowlName = bowlMatch ? bowlMatch[1].trim() : sanitized.bowlName

              // Determine bye seed (1-4) from team2 (which is the higher seed in QF games)
              // Look up team2's seed in CFP seeds
              const team2Tid = getTidFromAbbr(sanitized.team2)
              const team2SeedEntry = cfpSeeds.find(s =>
                s.tid === team2Tid || s.team === sanitized.team2
              )
              const byeSeed = team2SeedEntry?.seed

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
            // Check if user's game is already in the new data from the sheet
            const userGameInSheet = sanitizedBowlGames.some(g =>
              g && (g.team1 === userTeamAbbr || g.team2 === userTeamAbbr)
            )
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
            // Check if user's CFP game is already in the new data from the sheet
            const userCFPGameInSheet = cfpQuarterfinals.some(g =>
              g && (g.team1 === userTeamAbbr || g.team2 === userTeamAbbr)
            )
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
              const tid = getTidFromAbbr(entry.team)
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
            tid: s.tid || getTidFromAbbr(s.team) // Prefer existing tid, fallback for legacy data
          })).filter(s => s.tid) // Only include if tid resolved

          await updateDynasty(currentDynasty.id, {
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

      {/* Bowl Score Modal (CFP Weeks 4-5) */}
      <BowlScoreModal
        isOpen={showBowlScoreModal}
        onClose={() => setShowBowlScoreModal(false)}
        onSave={async (cfpGames, week) => {
          const year = currentDynasty.currentYear
          const userTeamAbbr = getCurrentTeamAbbr(currentDynasty)
          const existingByYear = currentDynasty.cfpResultsByYear || {}
          const existingYearData = existingByYear[year] || {}

          // CRITICAL FIX: Preserve user's game that was entered separately
          const weekKey = `week${week}`
          const existingWeekGames = existingYearData[weekKey] || []
          const userExistingGame = existingWeekGames.find(g =>
            g && (g.team1 === userTeamAbbr || g.team2 === userTeamAbbr)
          )
          const userGameInSheet = cfpGames.some(g =>
            g && (g.team1 === userTeamAbbr || g.team2 === userTeamAbbr)
          )
          const mergedCFPGames = userExistingGame && !userGameInSheet
            ? [...cfpGames, userExistingGame]
            : cfpGames

          await updateDynasty(currentDynasty.id, {
            cfpResultsByYear: {
              ...existingByYear,
              [year]: {
                ...existingYearData,
                [weekKey]: mergedCFPGames
              }
            }
          })
        }}
        currentYear={currentDynasty.currentYear}
        currentWeek={currentDynasty.currentWeek}
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
            existingStatsByYear[year] = {
              ...existingYearStats,
              gamesPlayed: playerStats.gamesPlayed,
              snapsPlayed: playerStats.snapsPlayed
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

          // Mapping from sheet column names to internal stat keys
          const SHEET_TO_INTERNAL = {
            passing: {
              Completions: 'cmp', Attempts: 'att', Yards: 'yds', Touchdowns: 'td',
              Interceptions: 'int', 'Passing Long': 'lng', 'Sacks Taken': 'sacks'
            },
            rushing: {
              Carries: 'car', Yards: 'yds', Touchdowns: 'td', 'Rushing Long': 'lng',
              Fumbles: 'fum', 'Broken Tackles': 'bt', 'Yards After Contact': 'yac'
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
              Deflections: 'pd', 'Forced Fumbles': 'ff', 'Fumble Recoveries': 'fr', 'Defensive TDs': 'td'
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

          // Update each player's statsByYear with DEEP merge
          const updatedPlayers = (currentDynasty.players || []).map(player => {
            const playerNameKey = player.name?.toLowerCase().trim()
            const detailedPlayerStats = playerStatsMap.get(playerNameKey)

            if (!detailedPlayerStats || Object.keys(detailedPlayerStats).length === 0) {
              return player
            }

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

            return {
              ...player,
              statsByYear: nextStatsByYear
            }
          })

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
              const tid = getTidFromAbbr(abbr)
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
          const existingByYear = currentDynasty.finalPollsByYear || {}
          await updateDynasty(currentDynasty.id, {
            finalPollsByYear: {
              ...existingByYear,
              [year]: polls
            }
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
        accentColor={teamColors.primary}
      />

      {/* Position Changes Modal (National Signing Day) */}
      <PositionChangesModal
        isOpen={showPositionChangesModal}
        onClose={() => setShowPositionChangesModal(false)}
        onSave={handlePositionChangesSave}
        players={currentDynasty?.players || []}
        existingChanges={currentDynasty?.positionChangesByYear?.[offseasonDataYear] || []}
        teamColors={teamColors}
      />

      {/* Recruiting Class Rank Modal (National Signing Day) */}
      <RecruitingClassRankModal
        isOpen={showRecruitingClassRankModal}
        onClose={() => setShowRecruitingClassRankModal(false)}
        onSave={handleRecruitingClassRankSave}
        currentRank={currentDynasty?.recruitingClassRankByTeamYear?.[getCurrentTeamAbbr(currentDynasty)]?.[offseasonDataYear]}
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
          const teamTid = getTidFromAbbr(teamAbbr)
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
            const wasOnTeamLastYear = isPlayerOnRoster(p, teamTid || teamAbbr, offseasonDataYear)
            const isOnTeamThisYear = isPlayerOnRoster(p, teamTid || teamAbbr, currentYear)
            return wasOnTeamLastYear && isOnTeamThisYear
          })

          // Get PORTAL TRANSFERS who joined this offseason
          const portalTransfers = allPlayers.filter(p => {
            if (leavingPids.has(p.pid)) return false
            if (p.isHonorOnly) return false
            const isPortalTransfer = (p.isPortal || p.previousTeam) && p.recruitYear === offseasonDataYear
            if (!isPortalTransfer) return false
            const isOnTeamThisYear = isPlayerOnRoster(p, teamTid || teamAbbr, currentYear)
            return isOnTeamThisYear
          })

          return [...returningPlayers, ...portalTransfers]
        })()}
      />

      {/* Recruit Overalls Modal (Training Camp - Offseason Week 7) */}
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
          const teamTid = getTidFromAbbr(teamAbbr)
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
                      incomingClass: playerClass
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
            if (!isPlayerOnRoster(player, teamTid, year)) return false

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

          // Get previously encouraged transfers using tid-based getter
          const previouslyEncouraged = getEncourageTransfers(currentDynasty, userTid, year)
          const previousNames = new Set(previouslyEncouraged.map(p => p.name?.toLowerCase().trim()).filter(Boolean))

          // New encouraged transfers
          const newEncouragedNames = new Set(transferPlayers.map(p => p.name?.toLowerCase().trim()).filter(Boolean))

          // Update players:
          // 1. RESTORE players who were previously encouraged but are NOT in the new list (add back teamsByYear)
          // 2. REMOVE players who are in the new encouraged list (remove teamsByYear)
          const updatedPlayers = (currentDynasty?.players || []).map(player => {
            const nameLower = player.name?.toLowerCase().trim()
            const wasPreviouslyEncouraged = previousNames.has(nameLower)
            const isNowEncouraged = newEncouragedNames.has(nameLower)

            // Case 1: Was encouraged before, but NOT anymore - RESTORE them
            if (wasPreviouslyEncouraged && !isNowEncouraged) {
              const restoredTeamsByYear = {
                ...(player.teamsByYear || {}),
                [year]: userTid  // Always use tid
              }
              // Remove movementByYear entry for this year (no longer encouraged)
              const updatedMovementByYear = { ...(player.movementByYear || {}) }
              delete updatedMovementByYear[year]
              delete updatedMovementByYear[String(year)]
              return {
                ...player,
                teamsByYear: restoredTeamsByYear,
                movementByYear: updatedMovementByYear
              }
            }

            // Case 2: Is NOW encouraged - REMOVE from roster (delete teamsByYear entry)
            if (isNowEncouraged) {
              const updatedTeamsByYear = { ...(player.teamsByYear || {}) }
              delete updatedTeamsByYear[year]
              delete updatedTeamsByYear[String(year)]
              return {
                ...player,
                teamsByYear: updatedTeamsByYear,
                movementByYear: {
                  ...(player.movementByYear || {}),
                  [year]: { type: 'encouraged_to_transfer' }
                }
              }
            }

            // Case 3: Not involved - return unchanged
            return player
          })

          // Store using tid-based structure: teams[tid].byYear[year].encourageTransfers
          if (isDev || !user) {
            // Dev mode - ensure teams structure exists
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
            // Production mode - use dot notation for Firestore
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
          const isDev = import.meta.env.VITE_DEV_MODE === 'true'

          // Check if data is multi-year format (keys are years like "2025", "2026")
          const isMultiYear = Object.keys(data).every(key => /^\d{4}$/.test(key))

          if (isDev || !user) {
            // Dev mode - save conferences
            const existingByYear = currentDynasty?.customConferencesByYear || {}
            if (isMultiYear) {
              await updateDynasty(currentDynasty.id, {
                customConferencesByYear: { ...existingByYear, ...data }
              })
            } else {
              await updateDynasty(currentDynasty.id, {
                customConferencesByYear: { ...existingByYear, [upcomingSeasonYear]: data }
              })
            }
          } else {
            // Production mode - use dot notation for Firestore
            if (isMultiYear) {
              const updates = {}
              Object.entries(data).forEach(([y, conferences]) => {
                updates[`customConferencesByYear.${y}`] = conferences
              })
              await updateDynasty(currentDynasty.id, updates)
            } else {
              await updateDynasty(currentDynasty.id, {
                [`customConferencesByYear.${upcomingSeasonYear}`]: data
              })
            }
          }
        }}
        teamColors={teamColors}
      />
    </div>
  )
}
