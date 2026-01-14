import { useState, useEffect, useMemo } from 'react'
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom'
import { useDynasty, getCurrentSchedule, getScheduleWithGameData, getCurrentRoster, getCurrentPreseasonSetup, getCurrentTeamRatings, getCurrentCoachingStaff, getCurrentGoogleSheet, findCurrentTeamGame, getCurrentTeamGames, GAME_TYPES, getGamesByType, getCurrentCustomConferences, MOVEMENT_TYPES, createMovement, getUserGamePerspective, isTeamInGame, getTeamGamePerspective, isFirstYearOnTeam, getCurrentTeamRecord } from '../../context/DynastyContext'
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
import PlayerMatchConfirmModal from '../../components/PlayerMatchConfirmModal'
import ReturningPlayerConfirmModal from '../../components/ReturningPlayerConfirmModal'
import NewJobEditModal from '../../components/NewJobEditModal'
import PlayersLeavingModal from '../../components/PlayersLeavingModal'
import DraftResultsModal from '../../components/DraftResultsModal'
import TransferDestinationsModal from '../../components/TransferDestinationsModal'
import RecruitingCommitmentsModal from '../../components/RecruitingCommitmentsModal'
import PositionChangesModal from '../../components/PositionChangesModal'
import RecruitingClassRankModal from '../../components/RecruitingClassRankModal'
import TrainingResultsModal from '../../components/TrainingResultsModal'
import EncourageTransfersModal from '../../components/EncourageTransfersModal'
import RecruitOverallsModal from '../../components/RecruitOverallsModal'
import PortalTransferClassModal from '../../components/PortalTransferClassModal'
import FringeCaseClassModal from '../../components/FringeCaseClassModal'
import { getAllBowlGamesList, isBowlInWeek1, isBowlInWeek2 } from '../../services/sheetsService'
import { isSameYear } from '../../utils/compareUtils'

// Helper function to normalize player names for consistent lookup
const normalizePlayerName = (name) => {
  if (!name) return ''
  return name.trim().toLowerCase()
}

export default function Dashboard() {
  const { currentDynasty, saveSchedule, saveRoster, saveTeamRatings, saveCoachingStaff, saveConferences, addGame, saveCPUBowlGames, saveCFPGames, saveCPUConferenceChampionships, updateDynasty, processHonorPlayers, isViewOnly } = useDynasty()
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
          totalOffense += parseFloat(ourTeamStats.totalOffense) || 0
          rushAttempts += parseFloat(ourTeamStats.rushAttempts) || 0
          rushYards += parseFloat(ourTeamStats.rushYards) || 0
          rushTds += parseFloat(ourTeamStats.rushTds) || 0
          passAttempts += parseFloat(ourTeamStats.passAttempts) || 0
          passYards += parseFloat(ourTeamStats.passYards) || 0
          passTds += parseFloat(ourTeamStats.passTds) || 0
          firstDowns += parseFloat(ourTeamStats.firstDowns) || 0
        }

        // Opponent's offense = our defense allowed
        if (oppTeamStats) {
          defTotalYards += parseFloat(oppTeamStats.totalOffense) || 0
          defPassYards += parseFloat(oppTeamStats.passYards) || 0
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
  const [showCoachingStaffPopup, setShowCoachingStaffPopup] = useState(false)
  const [suppressPopupHover, setSuppressPopupHover] = useState(false) // Prevents hover popup after layout shifts
  const [showNewJobEditModal, setShowNewJobEditModal] = useState(false)
  const [showPlayersLeavingModal, setShowPlayersLeavingModal] = useState(false)
  const [showDraftResultsModal, setShowDraftResultsModal] = useState(false)
  const [showTransferDestinationsModal, setShowTransferDestinationsModal] = useState(false)
  const [showRecruitingModal, setShowRecruitingModal] = useState(false)
  const [showPositionChangesModal, setShowPositionChangesModal] = useState(false)
  const [showRecruitingClassRankModal, setShowRecruitingClassRankModal] = useState(false)
  const [showTrainingResultsModal, setShowTrainingResultsModal] = useState(false)
  const [showEncourageTransfersModal, setShowEncourageTransfersModal] = useState(false)
  const [showOffseasonConferencesModal, setShowOffseasonConferencesModal] = useState(false)
  const [showRecruitOverallsModal, setShowRecruitOverallsModal] = useState(false)
  const [showPortalTransferClassModal, setShowPortalTransferClassModal] = useState(false)
  const [showFringeCaseClassModal, setShowFringeCaseClassModal] = useState(false)

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
  // Checks team-centric structure first, then falls back to year-only structure
  useEffect(() => {
    const year = currentDynasty?.currentYear
    const teamAbbr = getCurrentTeamAbbr(currentDynasty) || currentDynasty?.teamName

    // Try team-centric structure first
    let ccData = currentDynasty?.conferenceChampionshipDataByTeamYear?.[teamAbbr]?.[year]

    // Fall back to year-only structure for backward compatibility
    if (!ccData) {
      ccData = currentDynasty?.conferenceChampionshipDataByYear?.[year]
    }

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
  }, [currentDynasty?.id, currentDynasty?.currentYear, currentDynasty?.conferenceChampionshipDataByYear, currentDynasty?.conferenceChampionshipDataByTeamYear, currentDynasty?.teamName])

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

  // Handle all-americans/all-conference data save with player matching
  const handleAllAmericansSave = async (data) => {
    const year = currentDynasty.currentYear

    // Combine all entries for processing
    const allEntries = []

    // All-Americans
    if (data.allAmericans) {
      data.allAmericans.forEach(entry => {
        allEntries.push({
          ...entry,
          name: entry.player,
          honorCategory: 'allAmericans'
        })
      })
    }

    // All-Conference
    if (data.allConference) {
      data.allConference.forEach(entry => {
        allEntries.push({
          ...entry,
          name: entry.player,
          honorCategory: 'allConference'
        })
      })
    }

    // Process All-Americans first
    const aaEntries = allEntries.filter(e => e.honorCategory === 'allAmericans')
    const acEntries = allEntries.filter(e => e.honorCategory === 'allConference')

    // Start with All-Americans
    if (aaEntries.length > 0) {
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
          transferDecisions: [],
          // Track remaining to process
          remainingAC: acEntries
        })
        setCurrentConfirmIndex(0)
        setPlayerMatchConfirmation(result.confirmations[0])
        setShowPlayerMatchConfirm(true)
        return
      }
    }

    // Process All-Conference
    if (acEntries.length > 0) {
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

    // No confirmations needed - save the data
    // Transform allConference to be grouped by conference
    const transformedData = { ...data }
    if (data.allConference && data.allConference.length > 0) {
      const allConferenceByConference = {}
      data.allConference.forEach(entry => {
        // Determine conference from the player's school (using custom conferences)
        const conference = getTeamConference(entry.school, customConferences) || 'Unknown'
        if (!allConferenceByConference[conference]) {
          allConferenceByConference[conference] = []
        }
        allConferenceByConference[conference].push(entry)
      })
      transformedData.allConferenceByConference = allConferenceByConference
      // Keep original allConference for backwards compatibility
    }

    const existingByYear = currentDynasty.allAmericansByYear || {}
    await updateDynasty(currentDynasty.id, {
      allAmericansByYear: {
        ...existingByYear,
        [year]: transformedData
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

    const teamAbbr = getCurrentTeamAbbr(currentDynasty) || currentDynasty.teamName

    // Get previous list to detect removals
    const previousLeavingPids = new Set(
      (currentDynasty.playersLeavingByYear?.[year] || [])
        .map(p => p.pid)
        .filter(Boolean)
    )

    const updatedPlayers = (currentDynasty.players || []).map(player => {
      if (leavingPids.has(player.pid)) {
        const reason = reasonByPid[player.pid] || 'Unknown'
        const isTransfer = reason === 'Transfer' || reason === 'Encouraged Transfer'
        const isDeparture = reason === 'Graduating' || reason === 'Pro Draft'
        const playerTeam = player.team || teamAbbr

        // Check if player was already marked as leaving (don't duplicate movement)
        const alreadyHasMovement = (player.movements || []).some(m =>
          m.year === Number(year) && (m.type === 'entered_portal' || m.type === 'departure')
        )

        if (alreadyHasMovement) {
          return player // Already processed
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
            : player.movements
        }
      } else if (previousLeavingPids.has(player.pid)) {
        // Player was previously marked as leaving this year but is no longer in the list
        // Remove any entered_portal or departure movement for this year
        const filteredMovements = (player.movements || []).filter(m =>
          !(m.year === Number(year) && (m.type === 'entered_portal' || m.type === 'departure'))
        )
        return {
          ...player,
          movements: filteredMovements
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

    const updates = {
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
    const teamAbbr = getCurrentTeamAbbr(currentDynasty) || currentDynasty.teamName
    const teamTid = getTidFromAbbr(teamAbbr)
    // ALWAYS use tid for team storage - tid is the single source of truth
    const existingByTeamYear = currentDynasty.transferDestinationsByTeamYear || {}

    // Update player records with their new team
    const updatedPlayers = [...(currentDynasty.players || [])]

    destinations.forEach(dest => {
      const playerIndex = updatedPlayers.findIndex(p =>
        p.name?.toLowerCase().trim() === dest.playerName?.toLowerCase().trim()
      )
      if (playerIndex !== -1 && dest.newTeam) {
        const player = updatedPlayers[playerIndex]
        const oldTeam = player.team || teamAbbr

        // Check if this is a RECOMMIT (destination = their current team)
        const isRecommit = dest.newTeam === oldTeam || dest.newTeam === teamAbbr

        if (isRecommit) {
          // Player recommitted - they're staying on the team!
          const recommitMovement = {
            year: Number(year),
            type: 'recommit',
            from: null,
            to: oldTeam,
            reason: 'Recommitted after entering portal',
            timestamp: Date.now()
          }

          // Remove entered_portal movement for this year (they're not leaving anymore)
          const filteredMovements = (player.movements || []).filter(m =>
            !(m.year === Number(year) && m.type === 'entered_portal')
          )

          // ALWAYS use tid for teamsByYear storage
          const oldTeamTid = typeof oldTeam === 'number' ? oldTeam : getTidFromAbbr(oldTeam)
          const teamsByYearValue = oldTeamTid || teamTid || oldTeam

          updatedPlayers[playerIndex] = {
            ...player,
            movements: [...filteredMovements, recommitMovement],
            // Keep them on roster for next year
            teamsByYear: {
              ...(player.teamsByYear || {}),
              [String(nextYear)]: teamsByYearValue
            }
          }
        } else {
          // Normal transfer to another team
          // Add transfer movement (for display/history)
          const transferMovement = {
            year: Number(year),
            type: 'transfer',
            from: oldTeam,
            to: dest.newTeam,
            timestamp: Date.now()
          }

          // ALWAYS use tid for teamsByYear storage
          const newTeamTid = getTidFromAbbr(dest.newTeam)
          const teamsByYearValue = newTeamTid || dest.newTeam

          // Update teamsByYear to new team, update current team with tid
          updatedPlayers[playerIndex] = {
            ...player,
            team: newTeamTid || dest.newTeam, // Use tid for current team
            movements: [...(player.movements || []), transferMovement],
            teamsByYear: {
              ...(player.teamsByYear || {}),
              [String(nextYear)]: teamsByYearValue
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
    const teamAbbr = getCurrentTeamAbbr(currentDynasty) || currentDynasty.teamName

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
      team: teamAbbr
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

    results.forEach(result => {
      // Find player by name (case-insensitive match)
      const playerIndex = updatedPlayers.findIndex(p =>
        normalizePlayerName(p.name) === normalizePlayerName(result.playerName)
      )
      if (playerIndex !== -1 && result.newOverall) {
        updatedPlayers[playerIndex] = {
          ...updatedPlayers[playerIndex],
          overall: result.newOverall
        }
        updatedCount++
      }
    })

    // Store training results for history
    const existingResults = currentDynasty.trainingResultsByYear || {}

    await updateDynasty(currentDynasty.id, {
      players: updatedPlayers,
      trainingResultsByYear: {
        ...existingResults,
        [year]: results
      }
    })

  }

  // Handle recruiting class overalls save
  const handleRecruitOverallsSave = async (results) => {
    // On Training Camp (week 7), the year has flipped, but recruits have recruitYear from before the flip
    const isAfterYearFlip = currentDynasty.currentPhase === 'offseason' && currentDynasty.currentWeek >= 6
    const year = isAfterYearFlip ? currentDynasty.currentYear - 1 : currentDynasty.currentYear

    // Update recruit overalls and jersey numbers in the players array
    const updatedPlayers = [...(currentDynasty.players || [])]
    let updatedCount = 0

    results.forEach(result => {
      // Find player by name (case-insensitive match) among recruits
      const playerIndex = updatedPlayers.findIndex(p =>
        p.isRecruit &&
        p.recruitYear === year &&
        normalizePlayerName(p.name) === normalizePlayerName(result.name)
      )
      if (playerIndex !== -1 && result.overall) {
        updatedPlayers[playerIndex] = {
          ...updatedPlayers[playerIndex],
          overall: result.overall,
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
        updatedPlayers[playerIndex] = {
          ...updatedPlayers[playerIndex],
          year: selection.selectedClass
        }
        updatedCount++
      }
    })

    // Store selections for tracking (in case we need to regenerate)
    const existingSelections = currentDynasty.portalTransferClassByYear || {}

    await updateDynasty(currentDynasty.id, {
      players: updatedPlayers,
      portalTransferClassByYear: {
        ...existingSelections,
        [year]: classSelections
      },
      [`portalTransferClassSheetId_${year}`]: null // Clear year-specific sheet ID since task is complete
    })

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
        updatedPlayers[playerIndex] = {
          ...updatedPlayers[playerIndex],
          year: selection.selectedClass
        }
        updatedCount++
      }
    })

    // Store selections for tracking
    const existingSelections = currentDynasty.fringeCaseClassByYear || {}

    await updateDynasty(currentDynasty.id, {
      players: updatedPlayers,
      fringeCaseClassByYear: {
        ...existingSelections,
        [year]: classSelections
      },
      fringeCaseClassSheetId: null // Clear sheet ID since task is complete
    })

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
  // This function detects potential returning players and shows confirmation modal if needed
  const handleRecruitingCommitmentsSave = async (recruits) => {
    // On Signing Day (week 6), year has already flipped, so use previous year for recruiting data
    const isAfterYearFlip = currentDynasty.currentPhase === 'offseason' && currentDynasty.currentWeek >= 6
    const year = isAfterYearFlip ? currentDynasty.currentYear - 1 : currentDynasty.currentYear
    const commitmentKey = getCommitmentKey()
    if (!commitmentKey) return

    const teamAbbr = getCurrentTeamAbbr(currentDynasty) || currentDynasty.teamName
    const existingPlayers = currentDynasty.players || []

    // Track players who left (leftTeam: true) OR are pending departure
    const leftPlayersMap = new Map()
    const pendingDepartureMap = new Map()
    // Get players leaving this year (from playersLeavingByYear)
    const playersLeavingThisYear = currentDynasty.playersLeavingByYear?.[year] || []
    const leavingPids = new Set(playersLeavingThisYear.map(p => p.pid).filter(Boolean))

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
        if (leavingPids.has(p.pid)) {
          pendingDepartureMap.set(nameLower, p)
        }
      }
    })

    // Find recruits that are POTENTIAL returning players
    const potentialReturning = recruits.filter(r => {
      if (!r.name) return false
      const nameLower = r.name.toLowerCase().trim()
      return leftPlayersMap.has(nameLower) || pendingDepartureMap.has(nameLower)
    }).map(recruit => {
      const nameLower = recruit.name.toLowerCase().trim()
      const existingPlayer = pendingDepartureMap.get(nameLower) || leftPlayersMap.get(nameLower)
      // Get departure info from movements
      const departureMovement = (existingPlayer?.movements || [])
        .filter(m => m.type === 'departure' || m.type === 'transfer')
        .sort((a, b) => (b.year || 0) - (a.year || 0))[0]
      const departureReason = departureMovement?.reason || 'Transfer'
      const departureYear = departureMovement?.year || year
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
    const teamAbbr = getCurrentTeamAbbr(currentDynasty) || currentDynasty.teamName
    const teamTid = getTidFromAbbr(teamAbbr)
    // ALWAYS use tid for teamsByYear storage - tid is the single source of truth
    const teamsByYearValue = teamTid || teamAbbr // Fallback to abbr only if tid lookup fails

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
    const commitmentsForTeamYear = currentDynasty.recruitingCommitmentsByTeamYear?.[teamAbbr]?.[year] || {}
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

      // For portal players, ensure previousTeam is set (required for filtering)
      // If not provided, use "Transfer Portal" as a placeholder
      const previousTeam = recruit.previousTeam || (isPortalPlayer ? 'Transfer Portal' : '')

      // Create movement for this recruit - use tid for team references
      const movementType = isPortalPlayer ? MOVEMENT_TYPES.PORTAL_IN : MOVEMENT_TYPES.RECRUITED
      const fromTeam = isPortalPlayer ? (recruit.previousTeam || null) : null
      const recruitMovement = createMovement(year, movementType, fromTeam, teamTid || teamAbbr)

      return {
        pid,
        id: `player-${pid}`,
        name: recruit.name,
        position: recruit.position || '',
        year: classToYear[recruit.class] || 'Fr',
        jerseyNumber: '',
        devTrait: recruit.devTrait || 'Normal',
        archetype: recruit.archetype || '',
        overall: null, // Recruits don't have OVR until they enroll
        height: recruit.height || '',
        weight: recruit.weight || 0,
        hometown: recruit.hometown || '',
        state: recruit.state || '',
        team: teamTid || teamAbbr, // Tag player with team tid
        isRecruit: true,
        recruitYear: year, // The recruiting class year (they play NEXT year)
        // IMMUTABLE roster history - recruits will be on team starting NEXT year
        teamsByYear: { [year + 1]: teamsByYearValue },
        stars: recruit.stars || 0,
        nationalRank: recruit.nationalRank || null,
        stateRank: recruit.stateRank || null,
        positionRank: recruit.positionRank || null,
        gemBust: recruit.gemBust || '',
        previousTeam: previousTeam,
        isPortal: isPortalPlayer,
        // NEW: Add movements array with recruit movement
        movements: [recruitMovement],
        pendingDeparture: null
      }
    })

    // Update returning players - players who left OR are pending departure but coming back
    // This clears their pendingDeparture and adds a RECOMMIT movement
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

          // Create a RECOMMIT movement to track they came back - use tid
          const recommitMovement = createMovement(
            year,
            MOVEMENT_TYPES.RECOMMIT,
            teamTid || teamAbbr, // from (they were on this team)
            teamTid || teamAbbr, // to (they're staying on this team)
            'Returned from portal'
          )

          // Preserve existing movements and add the recommit
          const existingMovements = p.movements || []

          // CRITICAL: Preserve all existing player data, only update specific fields
          const updatedPlayer = {
            ...p, // Preserve everything: pid, name, statsByYear, classByYear, overall, etc.
            // Clear pendingDeparture - they're staying!
            pendingDeparture: null,
            // Add recommit movement
            movements: [...existingMovements, recommitMovement],
            // Clear ALL legacy departure flags - they're staying/coming back!
            leftTeam: false,
            leftYear: null,
            leftReason: null,
            leavingYear: null,
            leavingReason: null,
            transferredTo: null,
            transferredFrom: null,
            // Update team assignment with tid
            team: teamTid || teamAbbr,
            teamsByYear: {
              ...p.teamsByYear,
              [year + 1]: teamsByYearValue // Add them to next year's roster
            },
            // Mark as returning recruit for this year
            isRecruit: true,
            recruitYear: year,
            isPortal: true, // Returning players are portal transfers
            // Only update position if explicitly provided and different
            ...(recruitData?.position && recruitData.position !== p.position && { position: recruitData.position })
          }

          // Update ranks from the sheet data (these are new for this recruiting cycle)
          if (recruitData?.stars) updatedPlayer.stars = recruitData.stars
          if (recruitData?.nationalRank) updatedPlayer.nationalRank = recruitData.nationalRank
          if (recruitData?.stateRank) updatedPlayer.stateRank = recruitData.stateRank
          if (recruitData?.positionRank) updatedPlayer.positionRank = recruitData.positionRank
          if (recruitData?.devTrait) updatedPlayer.devTrait = recruitData.devTrait
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

  // Get all previous commitments for the current team/year (to pre-populate sheet) - TEAM-CENTRIC
  const getAllPreviousCommitments = () => {
    const year = currentDynasty.currentYear
    const teamAbbr = getCurrentTeamAbbr(currentDynasty) || currentDynasty.teamName

    // Use TEAM-CENTRIC structure
    const commitmentsForTeamYear = currentDynasty.recruitingCommitmentsByTeamYear?.[teamAbbr]?.[year] || {}
    const allCommitments = []

    // Collect all commitments from all weeks/phases
    Object.values(commitmentsForTeamYear).forEach(weekCommitments => {
      if (Array.isArray(weekCommitments)) {
        allCommitments.push(...weekCommitments)
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
    const { honorType, entries, year, confirmations, transferDecisions, rawData, remainingAC } = pendingHonorData
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
        // If this was allAmericans and we have remaining allConference to process
        if (honorType === 'allAmericans' && remainingAC && remainingAC.length > 0) {
          const acResult = await processHonorPlayers(
            currentDynasty.id,
            'allConference',
            remainingAC,
            year,
            []
          )

          if (acResult.needsConfirmation) {
            setPendingHonorData({
              honorType: 'allConference',
              entries: remainingAC,
              year,
              rawData,
              confirmations: acResult.confirmations,
              transferDecisions: []
            })
            setCurrentConfirmIndex(0)
            setPlayerMatchConfirmation(acResult.confirmations[0])
            setShowPlayerMatchConfirm(true)
            return
          }
        }

        // All done - save the raw data to the appropriate year structure
        if (honorType === 'awards') {
          const existingByYear = currentDynasty.awardsByYear || {}
          await updateDynasty(currentDynasty.id, {
            awardsByYear: {
              ...existingByYear,
              [year]: rawData
            }
          })
        } else {
          // Transform allConference to be grouped by conference
          const transformedData = { ...rawData }
          if (rawData.allConference && rawData.allConference.length > 0) {
            const allConferenceByConference = {}
            rawData.allConference.forEach(entry => {
              const conference = getTeamConference(entry.school, customConferences) || 'Unknown'
              if (!allConferenceByConference[conference]) {
                allConferenceByConference[conference] = []
              }
              allConferenceByConference[conference].push(entry)
            })
            transformedData.allConferenceByConference = allConferenceByConference
          }

          const existingByYear = currentDynasty.allAmericansByYear || {}
          await updateDynasty(currentDynasty.id, {
            allAmericansByYear: {
              ...existingByYear,
              [year]: transformedData
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
    <div className="space-y-6">
      {/* Note: Google Sheets are now created lazily when user opens entry modals */}

      {/* New Job Banner - show when user is taking a new job */}
      {takingNewJob === true && newJobTeam && newJobPosition && (() => {
        // newJobTeam is already the full display name (e.g., "Delaware Fightin' Blue Hens")
        const newTeamLogo = getTeamLogo(newJobTeam)
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

        // Get rank from the most recent game (if unranked, userRank will be null/undefined)
        const lastGame = currentYearGames.length > 0 ? currentYearGames[currentYearGames.length - 1] : null
        const currentRank = lastGame?.perspective?.userRank

        return (
          <div
            className="rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
            style={{
              backgroundColor: teamColors.primary,
              boxShadow: '0 4px 20px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.1)'
            }}
          >
            <Link
              to={`${pathPrefix}/team/${userTeamTid}/${currentDynasty.currentYear}`}
              className="flex items-center gap-4 hover:opacity-90 transition-all min-w-0"
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
                    className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{
                      backgroundColor: '#FFFFFF',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                      padding: '4px'
                    }}
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
                <h2 className="text-lg sm:text-2xl font-bold truncate tracking-tight" style={{ color: primaryBgText }}>
                  {currentRank && <span className="mr-1.5 sm:mr-2 opacity-90">#{currentRank}</span>}
                  {userTeamName}
                </h2>
                <p className="text-sm sm:text-base font-medium mt-0.5 flex items-center gap-1.5" style={{ color: primaryBgText, opacity: 0.85 }}>
                  <span>{headerWins}-{headerLosses}</span>
                  {currentDynasty.currentPhase !== 'preseason' && userTeamConference && (
                    <>
                      <span>•</span>
                      <span>{userTeamConference}</span>
                      {getConferenceLogo(userTeamConference) && (
                        <img
                          src={getConferenceLogo(userTeamConference)}
                          alt={userTeamConference}
                          className="h-4 sm:h-5 w-auto object-contain"
                        />
                      )}
                    </>
                  )}
                </p>
              </div>
            </Link>
            {teamRatings && (
              <div className="flex items-center gap-2 sm:gap-3 justify-end sm:justify-start">
                <div className="text-center px-3 sm:px-4 py-2 rounded-lg" style={{ backgroundColor: teamColors.secondary, boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }}>
                  <div className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider" style={{ color: secondaryBgText, opacity: 0.6 }}>OVR</div>
                  <div className="text-lg sm:text-xl font-bold" style={{ color: secondaryBgText }}>{teamRatings.overall}</div>
                </div>
                <div className="text-center px-3 sm:px-4 py-2 rounded-lg" style={{ backgroundColor: teamColors.secondary, boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }}>
                  <div className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider" style={{ color: secondaryBgText, opacity: 0.6 }}>OFF</div>
                  <div className="text-lg sm:text-xl font-bold" style={{ color: secondaryBgText }}>{teamRatings.offense}</div>
                </div>
                <div className="text-center px-3 sm:px-4 py-2 rounded-lg" style={{ backgroundColor: teamColors.secondary, boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }}>
                  <div className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider" style={{ color: secondaryBgText, opacity: 0.6 }}>DEF</div>
                  <div className="text-lg sm:text-xl font-bold" style={{ color: secondaryBgText }}>{teamRatings.defense}</div>
                </div>
                {!isViewOnly && (
                  <button
                    onClick={() => setShowTeamRatingsModal(true)}
                    className="p-2 rounded-lg hover:opacity-70 transition-opacity"
                    style={{ color: primaryBgText }}
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
                      onClick={() => setShowCoachingStaffPopup(!showCoachingStaffPopup)}
                      onMouseEnter={() => !suppressPopupHover && setShowCoachingStaffPopup(true)}
                      className="p-2 rounded-lg hover:opacity-70 transition-opacity"
                      style={{ color: primaryBgText }}
                      title="Coaching Staff"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </button>

                    {showCoachingStaffPopup && (
                      <>
                        {/* Backdrop for mobile click-away */}
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setShowCoachingStaffPopup(false)}
                        />
                        <div
                          className="absolute right-0 top-full mt-2 z-50 w-64 rounded-xl shadow-xl overflow-hidden"
                          style={{ backgroundColor: teamColors.secondary, border: `2px solid ${teamColors.primary}` }}
                          onMouseEnter={() => !suppressPopupHover && setShowCoachingStaffPopup(true)}
                          onMouseLeave={() => setShowCoachingStaffPopup(false)}
                        >
                          <div className="px-4 py-3 border-b" style={{ borderColor: `${secondaryBgText}20`, backgroundColor: teamColors.primary }}>
                            <div className="flex items-center justify-between">
                              <h4 className="font-bold text-sm uppercase tracking-wide" style={{ color: primaryBgText }}>
                                Coaching Staff
                              </h4>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setShowCoachingStaffPopup(false)
                                  setShowCoachingStaffModal(true)
                                }}
                                className="p-1 rounded hover:opacity-70 transition-opacity"
                                style={{ color: primaryBgText }}
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
                                    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                                    style={{ backgroundColor: isFired ? '#ef444420' : `${secondaryBgText}15` }}
                                  >
                                    <span className="text-xs font-bold" style={{ color: isFired ? '#ef4444' : secondaryBgText }}>OC</span>
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="text-[10px] uppercase font-medium" style={{ color: secondaryBgText, opacity: 0.6 }}>
                                      Offensive Coordinator
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className={`font-bold truncate ${isFired ? 'line-through opacity-60' : ''}`} style={{ color: secondaryBgText }}>
                                        {displayName}
                                      </span>
                                      {isFired && (
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-600">
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
                                    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                                    style={{ backgroundColor: isFired ? '#ef444420' : `${secondaryBgText}15` }}
                                  >
                                    <span className="text-xs font-bold" style={{ color: isFired ? '#ef4444' : secondaryBgText }}>DC</span>
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="text-[10px] uppercase font-medium" style={{ color: secondaryBgText, opacity: 0.6 }}>
                                      Defensive Coordinator
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className={`font-bold truncate ${isFired ? 'line-through opacity-60' : ''}`} style={{ color: secondaryBgText }}>
                                        {displayName}
                                      </span>
                                      {isFired && (
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-600">
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
                              <div className="text-center py-2 text-sm" style={{ color: secondaryBgText, opacity: 0.6 }}>
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
        )
      })()}

      {/* Phase-Specific Content */}
      {currentDynasty.currentPhase === 'preseason' ? (
        <div
          className="rounded-lg shadow-lg p-4 sm:p-6"
          style={{
            backgroundColor: teamColors.secondary,
            border: `3px solid ${teamColors.primary}`
          }}
        >
          <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4" style={{ color: secondaryBgText }}>
            Pre-Season Setup
          </h3>
          <div className="space-y-2 sm:space-y-3">
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
              // Optional: Recruiting Commitments - TEAM-CENTRIC
              (() => {
                const teamAbbr = getCurrentTeamAbbr(currentDynasty) || currentDynasty.teamName
                const preseasonCommitments = currentDynasty.recruitingCommitmentsByTeamYear?.[teamAbbr]?.[currentDynasty.currentYear]?.['preseason']
                const isNewTeam = isFirstYearOnTeam(currentDynasty)
                // Calculate task number
                let num = 2 // After schedule
                if (isNewTeam) num++ // After roster
                num++ // After team ratings
                // Only add coordinator increment if coordinators task is shown (HC + first year on team)
                if (currentDynasty.coachPosition === 'HC' && isNewTeam) num++ // After coordinators
                return {
                  num,
                  title: 'Any commitments this week?',
                  isRecruiting: true,
                  done: preseasonCommitments !== undefined,
                  commitmentsCount: preseasonCommitments?.length || 0,
                  action: () => setShowRecruitingModal(true),
                  actionText: preseasonCommitments !== undefined ? 'Edit' : 'Yes',
                  optional: true
                }
              })()
            ].map(item => {
              return (
              <div
                key={item.num}
                className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg border-2 gap-2 sm:gap-0 ${
                  item.done ? 'border-green-200 bg-green-50' : ''
                }`}
                style={!item.done ? {
                  borderColor: `${teamColors.primary}30`,
                  backgroundColor: teamColors.secondary
                } : {}}
              >
                <div className="flex items-center gap-2 sm:gap-3">
                  <div
                    className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                      item.done ? 'bg-green-500 text-white' : ''
                    }`}
                    style={!item.done ? {
                      backgroundColor: `${teamColors.primary}20`,
                      color: teamColors.primary
                    } : {}}
                  >
                    {item.done ? (
                      <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span className="font-bold text-sm sm:text-lg">{item.num}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      className="font-semibold text-sm sm:text-base"
                      style={{ color: item.done ? '#16a34a' : secondaryBgText }}
                    >
                      {item.title}
                    </div>
                    {item.scheduleCount !== undefined && (
                      <div
                        className="text-xs sm:text-sm mt-0.5 sm:mt-1 font-medium"
                        style={{
                          color: item.done ? '#16a34a' : secondaryBgText,
                          opacity: item.done ? 1 : 0.7
                        }}
                      >
                        {item.scheduleCount}/12 games
                        {item.done && <span className="ml-1 sm:ml-2">✓ Ready</span>}
                      </div>
                    )}
                    {item.playerCount !== undefined && (
                      <div
                        className="text-xs sm:text-sm mt-0.5 sm:mt-1 font-medium"
                        style={{
                          color: item.done ? '#16a34a' : secondaryBgText,
                          opacity: item.done ? 1 : 0.7
                        }}
                      >
                        {item.playerCount}/85 players
                        {item.done && <span className="ml-1 sm:ml-2">✓ Ready</span>}
                      </div>
                    )}
                    {item.teamRatings && (
                      <div
                        className="text-xs sm:text-sm mt-0.5 sm:mt-1 font-medium"
                        style={{
                          color: item.done ? '#16a34a' : secondaryBgText,
                          opacity: item.done ? 1 : 0.7
                        }}
                      >
                        {item.teamRatings.overall ? `${item.teamRatings.overall} OVR • ${item.teamRatings.offense} OFF • ${item.teamRatings.defense} DEF` : 'Not entered'}
                        {item.done && <span className="ml-1 sm:ml-2">✓ Ready</span>}
                      </div>
                    )}
                    {item.coachingStaff !== undefined && (
                      <div
                        className="text-xs sm:text-sm mt-0.5 sm:mt-1 font-medium truncate"
                        style={{
                          color: item.done ? '#16a34a' : secondaryBgText,
                          opacity: item.done ? 1 : 0.7
                        }}
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
                        style={{
                          color: item.done ? '#16a34a' : secondaryBgText,
                          opacity: item.done ? 1 : 0.7
                        }}
                      >
                        {item.conferences
                          ? `${Object.keys(item.conferences).length} conferences configured`
                          : 'Default EA CFB 26 alignment'}
                        {item.done && <span className="ml-1 sm:ml-2">✓ Ready</span>}
                      </div>
                    )}
                    {item.isRecruiting && (
                      <div
                        className="text-xs sm:text-sm mt-0.5 sm:mt-1 font-medium"
                        style={{
                          color: item.done ? '#16a34a' : secondaryBgText,
                          opacity: item.done ? 1 : 0.7
                        }}
                      >
                        {item.done
                          ? item.commitmentsCount > 0
                            ? `✓ ${item.commitmentsCount} commitment${item.commitmentsCount !== 1 ? 's' : ''} recorded`
                            : '✓ No commitments this week'
                          : 'Record any early recruiting commitments'}
                      </div>
                    )}
                  </div>
                </div>
                {isViewOnly ? <ViewOnlyBadge /> : (
                  item.isRecruiting && !item.done ? (
                    <div className="flex gap-2 w-full sm:w-auto">
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
                      className="w-full sm:w-auto px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-colors text-sm"
                      style={item.optional && !item.done ? {
                        backgroundColor: `${secondaryBgText}20`,
                        color: secondaryBgText
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
            <div
              className="mt-6 p-4 rounded-lg border-2"
              style={{
                backgroundColor: `${teamColors.primary}10`,
                borderColor: teamColors.primary
              }}
            >
              <p className="text-sm font-medium" style={{ color: teamColors.primary }}>
                ✓ Pre-season setup complete! Click "Advance Week" in the header to start the season.
              </p>
            </div>
          )}
        </div>
      ) : currentDynasty.currentPhase === 'regular_season' ? (
        <div
          className="rounded-lg shadow-lg p-6"
          style={{
            backgroundColor: teamColors.secondary,
            border: `3px solid ${teamColors.primary}`
          }}
        >
          <h3 className="text-lg font-semibold mb-4" style={{ color: secondaryBgText }}>
            {currentDynasty.currentYear} Regular Season - Week {currentDynasty.currentWeek}
          </h3>
          <div className="space-y-3">
            {(() => {
              const scheduledGame = teamSchedule?.find(g => Number(g.week) === Number(currentDynasty.currentWeek))
              const playedGame = findCurrentTeamGame(currentDynasty,
                g => Number(g.week) === Number(currentDynasty.currentWeek) && Number(g.year) === Number(currentDynasty.currentYear)
              )
              const mascotName = scheduledGame ? getMascotName(scheduledGame.opponent) : null
              const opponentName = mascotName || (scheduledGame ? getTeamNameFromAbbr(scheduledGame.opponent) : 'TBD')

              // Check for recruiting commitments this week - TEAM-CENTRIC
              const commitmentKey = `regular_${currentDynasty.currentWeek}`
              const teamAbbrForCommitments = getCurrentTeamAbbr(currentDynasty) || currentDynasty.teamName
              const commitmentsForTeamYear = currentDynasty.recruitingCommitmentsByTeamYear?.[teamAbbrForCommitments]?.[currentDynasty.currentYear] || {}
              const commitmentsForWeek = commitmentsForTeamYear[commitmentKey]
              const hasCommitmentsData = commitmentsForWeek !== undefined
              const commitmentsCount = commitmentsForWeek?.length || 0

              return (
                <>
                  {/* Task 1: Game Entry */}
                  <div
                    className={`flex items-center justify-between p-4 rounded-lg border-2 ${
                      playedGame ? 'border-green-200 bg-green-50' : ''
                    }`}
                    style={!playedGame ? {
                      borderColor: `${teamColors.primary}30`,
                      backgroundColor: teamColors.secondary
                    } : {}}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          playedGame ? 'bg-green-500 text-white' : ''
                        }`}
                        style={!playedGame ? {
                          backgroundColor: `${teamColors.primary}20`,
                          color: teamColors.primary
                        } : {}}
                      >
                        {playedGame ? (
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <span className="font-bold text-lg">1</span>
                        )}
                      </div>
                      <div>
                        <div
                          className="font-semibold"
                          style={{ color: playedGame ? '#16a34a' : secondaryBgText }}
                        >
                          Week {currentDynasty.currentWeek} {scheduledGame ? (scheduledGame.location === 'away' ? '@' : 'vs') : ''} {opponentName}
                        </div>
                        {playedGame && (
                          <div
                            className="text-sm mt-1 font-medium"
                            style={{ color: '#16a34a' }}
                          >
                            {playedGame.perspective?.userWon ? 'W' : 'L'} {Math.max(playedGame.perspective?.userScore || 0, playedGame.perspective?.opponentScore || 0)}-{Math.min(playedGame.perspective?.userScore || 0, playedGame.perspective?.opponentScore || 0)}
                            <span className="ml-2">✓ Complete</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {isViewOnly ? <ViewOnlyBadge /> : (
                      <button
                        onClick={() => {
                          if (playedGame) {
                            navigate(`${pathPrefix}/game/${playedGame.id}/edit`, { state: { from: location.pathname } })
                          } else {
                            // New game - navigate with query params
                            // team1 = home team, team2 = away team (for neutral, user team is team1)
                            const opponentTid = scheduledGame?.opponent ? getTidFromAbbr(scheduledGame.opponent) : null
                            const scheduleLocation = scheduledGame?.location?.toLowerCase() || 'home'
                            const isAway = scheduleLocation === 'away'
                            const isNeutral = scheduleLocation === 'neutral'
                            // For neutral games, user team is team1; for home/away, determine by location
                            const team1 = isAway ? opponentTid : userTeamTid
                            const team2 = isAway ? userTeamTid : opponentTid
                            const params = new URLSearchParams({
                              week: currentDynasty.currentWeek?.toString() || '',
                              year: currentDynasty.currentYear?.toString() || '',
                              gameType: 'regular',
                              ...(team1 && { team1Tid: team1.toString() }),
                              ...(team2 && { team2Tid: team2.toString() }),
                              location: isNeutral ? 'neutral' : (isAway ? 'away' : 'home')
                            })
                            navigate(`${pathPrefix}/game/new?${params.toString()}`, { state: { from: location.pathname } })
                          }
                        }}
                        className="px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-colors text-sm"
                        style={{
                          backgroundColor: teamColors.primary,
                          color: primaryBgText
                        }}
                      >
                        {playedGame ? 'Edit' : 'Enter Game'}
                      </button>
                    )}
                  </div>

                  {/* Task 2: Recruiting Commitments */}
                  <div
                    className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg border-2 gap-3 sm:gap-0 ${
                      hasCommitmentsData ? 'border-green-200 bg-green-50' : ''
                    }`}
                    style={!hasCommitmentsData ? { borderColor: `${teamColors.primary}30` } : {}}
                  >
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div
                        className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                          hasCommitmentsData ? 'bg-green-500 text-white' : ''
                        }`}
                        style={!hasCommitmentsData ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                      >
                        {hasCommitmentsData ? (
                          <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : <span className="font-bold text-sm sm:text-base">2</span>}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm sm:text-base font-semibold" style={{ color: hasCommitmentsData ? '#16a34a' : secondaryBgText }}>
                          {hasCommitmentsData ? 'Recruiting Commitments' : 'Any commitments this week?'}
                        </div>
                        <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: hasCommitmentsData ? '#16a34a' : secondaryBgText, opacity: 0.7 }}>
                          {hasCommitmentsData
                            ? commitmentsCount > 0
                              ? `✓ ${commitmentsCount} commitment${commitmentsCount !== 1 ? 's' : ''} recorded`
                              : '✓ No commitments this week'
                            : 'Record any recruiting commitments for this week'}
                        </div>
                      </div>
                    </div>
                    {isViewOnly ? <ViewOnlyBadge /> : (
                      !hasCommitmentsData ? (
                        <div className="flex gap-2 self-end sm:self-auto">
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
                </>
              )
            })()}
          </div>
        </div>
      ) : currentDynasty.currentPhase === 'conference_championship' ? (
        <div
          className="rounded-lg shadow-lg p-4 sm:p-6"
          style={{
            backgroundColor: teamColors.secondary,
            border: `3px solid ${teamColors.primary}`
          }}
        >
          <h3 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4" style={{ color: secondaryBgText }}>
            Conference Championship Week
          </h3>

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
              <div className="space-y-3 sm:space-y-4">
                {/* Task 1: Made Conference Championship? */}
                <div
                  className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg border-2 gap-3 sm:gap-0 ${
                    ccQuestionComplete ? 'border-green-200 bg-green-50' : ''
                  }`}
                  style={!ccQuestionComplete ? { borderColor: `${teamColors.primary}30` } : {}}
                >
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div
                      className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold ${
                        ccQuestionComplete ? 'bg-green-500 text-white' : ''
                      }`}
                      style={!ccQuestionComplete ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                    >
                      {ccQuestionComplete ? (
                        <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (taskNum)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm sm:text-base font-semibold" style={{ color: ccQuestionComplete ? '#16a34a' : secondaryBgText }}>
                        Made {userTeamConference} Championship?
                      </div>
                      <div className="text-xs sm:text-sm mt-0.5" style={{ color: ccQuestionComplete ? '#16a34a' : secondaryBgText, opacity: ccQuestionComplete ? 1 : 0.7 }}>
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
                      className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg border-2 gap-3 sm:gap-0 ${
                        ccGameComplete ? 'border-green-200 bg-green-50' : ''
                      }`}
                      style={!ccGameComplete ? { borderColor: `${teamColors.primary}30` } : {}}
                    >
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div
                          className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold ${
                            ccGameComplete ? 'bg-green-500 text-white' : ''
                          }`}
                          style={!ccGameComplete ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                        >
                          {ccGameComplete ? (
                            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (taskNum)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm sm:text-base font-semibold" style={{ color: ccGameComplete ? '#16a34a' : secondaryBgText }}>
                            {userTeamConference} Championship
                          </div>
                          <div className="text-xs sm:text-sm mt-0.5" style={{ color: ccGameComplete ? '#16a34a' : secondaryBgText, opacity: ccGameComplete ? 1 : 0.7 }}>
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
                                  gameType: 'conference_championship'
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
                    className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg border-2 gap-3 sm:gap-0 ${
                      coordinatorTaskComplete ? 'border-green-200 bg-green-50' : ''
                    }`}
                    style={!coordinatorTaskComplete ? { borderColor: `${teamColors.primary}30` } : {}}
                  >
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div
                        className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold ${
                          coordinatorTaskComplete ? 'bg-green-500 text-white' : ''
                        }`}
                        style={!coordinatorTaskComplete ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                      >
                        {coordinatorTaskComplete ? (
                          <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (taskNum)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm sm:text-base font-semibold" style={{ color: coordinatorTaskComplete ? '#16a34a' : secondaryBgText }}>
                          Coordinator Changes
                        </div>
                        <div className="text-xs sm:text-sm mt-0.5" style={{ color: coordinatorTaskComplete ? '#16a34a' : secondaryBgText, opacity: coordinatorTaskComplete ? 1 : 0.7 }}>
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
                  const teamAbbr = getCurrentTeamAbbr(currentDynasty) || currentDynasty.teamName
                  const ccCommitments = currentDynasty.recruitingCommitmentsByTeamYear?.[teamAbbr]?.[currentDynasty.currentYear]?.[commitmentKey]
                  const hasCommitmentsData = ccCommitments !== undefined
                  const commitmentsCount = ccCommitments?.length || 0

                  return (
                    <div
                      className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg border-2 gap-3 sm:gap-0 ${
                        hasCommitmentsData ? 'border-green-200 bg-green-50' : ''
                      }`}
                      style={!hasCommitmentsData ? { borderColor: `${teamColors.primary}30` } : {}}
                    >
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div
                          className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold ${
                            hasCommitmentsData ? 'bg-green-500 text-white' : ''
                          }`}
                          style={!hasCommitmentsData ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                        >
                          {hasCommitmentsData ? (
                            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (taskNum)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm sm:text-base font-semibold" style={{ color: hasCommitmentsData ? '#16a34a' : secondaryBgText }}>
                            {hasCommitmentsData ? 'Recruiting Commitments' : 'Any commitments this week?'}
                          </div>
                          <div className="text-xs sm:text-sm mt-0.5" style={{ color: hasCommitmentsData ? '#16a34a' : secondaryBgText, opacity: 0.7 }}>
                            {hasCommitmentsData
                              ? commitmentsCount > 0
                                ? `✓ ${commitmentsCount} commitment${commitmentsCount !== 1 ? 's' : ''} recorded`
                                : '✓ No commitments this week'
                              : 'Record any recruiting commitments'}
                          </div>
                        </div>
                      </div>
                      {isViewOnly ? <ViewOnlyBadge /> : (
                        !hasCommitmentsData ? (
                          <div className="flex gap-2 self-end sm:self-auto">
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
      ) : currentDynasty.currentPhase === 'postseason' ? (
        // Postseason / Bowl Weeks
        <div
          className="rounded-lg shadow-lg p-4 sm:p-6"
          style={{
            backgroundColor: teamColors.secondary,
            border: `3px solid ${teamColors.primary}`
          }}
        >
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
            const totalEnteredWeek1 = enteredBowlWeek1 + enteredCFPFirstRound

            // CFP Quarterfinals - check games[] then fallback to legacy
            const cfpQuarterfinalsFromGames = allGames.filter(g => g && (g.isCFPQuarterfinal || g.gameType === GAME_TYPES.CFP_QUARTERFINAL) && Number(g.year) === Number(year))
            const cfpQuarterfinalsLegacy = currentDynasty.cfpResultsByYear?.[year]?.quarterfinals || []

            // Count entered games for Week 2 (8 regular bowls + 4 CFP Quarterfinals = 12 total)
            const bowlWeek2Games = bowlWeek2FromGames.length > 0 ? bowlWeek2FromGames : bowlWeek2Legacy
            const cfpQuarterfinalGames = cfpQuarterfinalsFromGames.length > 0 ? cfpQuarterfinalsFromGames : cfpQuarterfinalsLegacy
            const enteredBowlWeek2 = bowlWeek2Games.filter(g => g && g.team1Score !== undefined && g.team1Score !== null && g.team2Score !== undefined && g.team2Score !== null).length
            const enteredCFPQuarterfinals = cfpQuarterfinalGames.filter(g => g && g.team1Score !== undefined && g.team1Score !== null && g.team2Score !== undefined && g.team2Score !== null).length
            const totalEnteredWeek2 = enteredBowlWeek2 + enteredCFPQuarterfinals
            const userBowlGame = findCurrentTeamGame(currentDynasty, g => g.isBowlGame && isSameYear(g.year, currentDynasty.currentYear))
            const userCFPFirstRoundGame = findCurrentTeamGame(currentDynasty, g => (g.isCFPFirstRound || g.gameType === GAME_TYPES.CFP_FIRST_ROUND) && isSameYear(g.year, currentDynasty.currentYear))
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

            // Check if user's team is in the CFP
            const userTeamAbbr = getCurrentTeamAbbr(currentDynasty)
            const cfpSeeds = currentDynasty.cfpSeedsByYear?.[currentDynasty.currentYear] || []
            const userCFPSeed = cfpSeeds.find(s => s.team === userTeamAbbr)?.seed || null

            // Calculate CFP first round opponent (5v12, 6v11, 7v10, 8v9)
            const getCFPFirstRoundOpponent = (seed) => {
              if (!seed || seed < 5 || seed > 12) return null
              const opponentSeed = 17 - seed // 5->12, 6->11, 7->10, 8->9
              return cfpSeeds.find(s => s.seed === opponentSeed)?.team || null
            }

            const userCFPOpponent = getCFPFirstRoundOpponent(userCFPSeed)
            const userHasCFPBye = userCFPSeed && userCFPSeed <= 4
            const userInCFPFirstRound = userCFPSeed && userCFPSeed >= 5 && userCFPSeed <= 12

            // CFP Quarterfinals tracking
            const userCFPQuarterfinalGame = findCurrentTeamGame(currentDynasty, g => (g.isCFPQuarterfinal || g.gameType === GAME_TYPES.CFP_QUARTERFINAL) && isSameYear(g.year, currentDynasty.currentYear))
            const firstRoundResults = currentDynasty.cfpResultsByYear?.[currentDynasty.currentYear]?.firstRound || []

            // User is in QF if they have a bye (seed 1-4) OR won their First Round game (seed 5-12)
            // Uses unified format: check perspective for win
            const userWonFirstRound = userCFPFirstRoundGame?.perspective?.userWon
            const userInCFPQuarterfinal = userHasCFPBye || (userInCFPFirstRound && userWonFirstRound)

            // Calculate QF opponent based on bracket matchups
            // Sugar Bowl: #4 vs 5/12 winner, Orange Bowl: #1 vs 8/9 winner
            // Rose Bowl: #3 vs 6/11 winner, Cotton Bowl: #2 vs 7/10 winner
            const getCFPQuarterfinalOpponent = () => {
              if (!userInCFPQuarterfinal) return null

              // QF matchup structure
              const qfMatchups = {
                1: { opponentSeeds: [8, 9] },   // #1 vs 8/9 winner (Orange Bowl)
                2: { opponentSeeds: [7, 10] },  // #2 vs 7/10 winner (Cotton Bowl)
                3: { opponentSeeds: [6, 11] },  // #3 vs 6/11 winner (Rose Bowl)
                4: { opponentSeeds: [5, 12] },  // #4 vs 5/12 winner (Sugar Bowl)
                5: { hostSeed: 4 }, 12: { hostSeed: 4 },  // 5/12 winner plays #4
                6: { hostSeed: 3 }, 11: { hostSeed: 3 },  // 6/11 winner plays #3
                7: { hostSeed: 2 }, 10: { hostSeed: 2 },  // 7/10 winner plays #2
                8: { hostSeed: 1 }, 9: { hostSeed: 1 }    // 8/9 winner plays #1
              }

              if (userHasCFPBye) {
                // Seeds 1-4: opponent is the First Round winner
                const matchup = qfMatchups[userCFPSeed]
                const [seedA, seedB] = matchup.opponentSeeds
                const firstRoundGame = firstRoundResults.find(g =>
                  (g.seed1 === seedA && g.seed2 === seedB) || (g.seed1 === seedB && g.seed2 === seedA)
                )
                return firstRoundGame?.winner || null
              } else if (userWonFirstRound) {
                // Seeds 5-12 who won: opponent is the bye team (host seed)
                const hostSeed = qfMatchups[userCFPSeed]?.hostSeed
                return hostSeed ? cfpSeeds.find(s => s.seed === hostSeed)?.team : null
              }
              return null
            }

            const userQFOpponent = getCFPQuarterfinalOpponent()

            // Get the bowl name for user's QF game
            const getUserQFBowlName = () => {
              if (!userInCFPQuarterfinal) return null
              const bowlBySeed = {
                1: 'Orange Bowl', 8: 'Orange Bowl', 9: 'Orange Bowl',
                2: 'Cotton Bowl', 7: 'Cotton Bowl', 10: 'Cotton Bowl',
                3: 'Rose Bowl', 6: 'Rose Bowl', 11: 'Rose Bowl',
                4: 'Sugar Bowl', 5: 'Sugar Bowl', 12: 'Sugar Bowl'
              }
              return bowlBySeed[userCFPSeed] || null
            }

            const userQFBowlName = getUserQFBowlName()

            // CFP Semifinals tracking
            const userCFPSemifinalGame = findCurrentTeamGame(currentDynasty, g => g.isCFPSemifinal && isSameYear(g.year, currentDynasty.currentYear))
            // Uses unified format: check perspective for win
            const userWonQuarterfinal = userCFPQuarterfinalGame?.perspective?.userWon
            const userInCFPSemifinal = userInCFPQuarterfinal && userWonQuarterfinal

            // Get quarterfinal results to calculate SF opponent
            const quarterfinalResults = currentDynasty.cfpResultsByYear?.[currentDynasty.currentYear]?.quarterfinals || []

            // Calculate SF opponent based on QF results
            // Peach Bowl: Orange Bowl winner (1/8/9) vs Sugar Bowl winner (4/5/12)
            // Fiesta Bowl: Cotton Bowl winner (2/7/10) vs Rose Bowl winner (3/6/11)
            const getCFPSemifinalOpponent = () => {
              if (!userInCFPSemifinal) return null

              // Determine which SF the user is in based on their seed
              // Seeds 1,8,9 play in Orange Bowl -> Peach Bowl SF
              // Seeds 4,5,12 play in Sugar Bowl -> Peach Bowl SF
              // Seeds 2,7,10 play in Cotton Bowl -> Fiesta Bowl SF
              // Seeds 3,6,11 play in Rose Bowl -> Fiesta Bowl SF
              const peachBowlSeeds = [1, 8, 9, 4, 5, 12]
              const fiestaBowlSeeds = [2, 7, 10, 3, 6, 11]

              const userInPeachBowl = peachBowlSeeds.includes(userCFPSeed)

              if (userInPeachBowl) {
                // User's opponent is the winner from the other QF in Peach Bowl
                // If user was in Orange (1/8/9), opponent is Sugar winner (4/5/12)
                // If user was in Sugar (4/5/12), opponent is Orange winner (1/8/9)
                const orangeSeeds = [1, 8, 9]
                const sugarSeeds = [4, 5, 12]
                const opponentBowlSeeds = orangeSeeds.includes(userCFPSeed) ? sugarSeeds : orangeSeeds
                const opponentQFGame = quarterfinalResults.find(g => {
                  const team1Seed = cfpSeeds.find(s => s.team === g.team1)?.seed
                  const team2Seed = cfpSeeds.find(s => s.team === g.team2)?.seed
                  return opponentBowlSeeds.includes(team1Seed) || opponentBowlSeeds.includes(team2Seed)
                })
                return opponentQFGame?.winner || null
              } else {
                // User's opponent is the winner from the other QF in Fiesta Bowl
                // If user was in Cotton (2/7/10), opponent is Rose winner (3/6/11)
                // If user was in Rose (3/6/11), opponent is Cotton winner (2/7/10)
                const cottonSeeds = [2, 7, 10]
                const roseSeeds = [3, 6, 11]
                const opponentBowlSeeds = cottonSeeds.includes(userCFPSeed) ? roseSeeds : cottonSeeds
                const opponentQFGame = quarterfinalResults.find(g => {
                  const team1Seed = cfpSeeds.find(s => s.team === g.team1)?.seed
                  const team2Seed = cfpSeeds.find(s => s.team === g.team2)?.seed
                  return opponentBowlSeeds.includes(team1Seed) || opponentBowlSeeds.includes(team2Seed)
                })
                return opponentQFGame?.winner || null
              }
            }

            const userSFOpponent = getCFPSemifinalOpponent()

            // Get the bowl name for user's SF game
            const getUserSFBowlName = () => {
              if (!userInCFPSemifinal) return null
              const peachBowlSeeds = [1, 8, 9, 4, 5, 12]
              return peachBowlSeeds.includes(userCFPSeed) ? 'Peach Bowl' : 'Fiesta Bowl'
            }

            const userSFBowlName = getUserSFBowlName()

            // CFP Championship tracking
            const userCFPChampionshipGame = findCurrentTeamGame(currentDynasty, g => g.isCFPChampionship && isSameYear(g.year, currentDynasty.currentYear))
            // Uses unified format: check perspective for win
            const userWonSemifinal = userCFPSemifinalGame?.perspective?.userWon
            const userInCFPChampionship = userInCFPSemifinal && userWonSemifinal

            // Get semifinal results to calculate Championship opponent
            // Use unified games[] array (source of truth) with fallback to legacy cfpResultsByYear
            const unifiedSemifinalResults = getGamesByType(currentDynasty, GAME_TYPES.CFP_SEMIFINAL, currentDynasty.currentYear)
            const legacySemifinalResults = currentDynasty.cfpResultsByYear?.[currentDynasty.currentYear]?.semifinals || []
            const semifinalResults = unifiedSemifinalResults.length > 0 ? unifiedSemifinalResults : legacySemifinalResults

            // Calculate Championship opponent from SF results
            const getCFPChampionshipOpponent = () => {
              if (!userInCFPChampionship) return null

              // User's opponent is the winner of the other semifinal
              const peachBowlSeeds = [1, 8, 9, 4, 5, 12]
              const userInPeachBowl = peachBowlSeeds.includes(userCFPSeed)

              // Find the SF game the user was NOT in
              const opponentSF = semifinalResults.find(g => {
                const team1Seed = cfpSeeds.find(s => s.team === g.team1)?.seed
                const team2Seed = cfpSeeds.find(s => s.team === g.team2)?.seed
                const gameInPeachBowl = peachBowlSeeds.includes(team1Seed) || peachBowlSeeds.includes(team2Seed)
                // If user was in Peach, opponent is from Fiesta (not in Peach)
                return userInPeachBowl ? !gameInPeachBowl : gameInPeachBowl
              })
              return opponentSF?.winner || null
            }

            const userChampOpponent = getCFPChampionshipOpponent()

            // Week 1: CC data, bowl eligibility question, then bowl results
            if (week === 1) {
              return (
                <>
                  <h3 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4" style={{ color: secondaryBgText }}>
                    Bowl Week 1
                  </h3>
                  <div className="space-y-3 sm:space-y-4">
                    {/* Task 1: CC Results */}
                    <div
                      className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg border-2 gap-3 sm:gap-0 ${
                        hasCCData ? 'border-green-200 bg-green-50' : ''
                      }`}
                      style={!hasCCData ? { borderColor: `${teamColors.primary}30` } : {}}
                    >
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div
                          className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                            hasCCData ? 'bg-green-500 text-white' : ''
                          }`}
                          style={!hasCCData ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                        >
                          {hasCCData ? (
                            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : <span className="font-bold text-sm sm:text-base">1</span>}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-semibold" style={{ color: hasCCData ? '#16a34a' : secondaryBgText }}>
                            Conference Championship Results
                          </div>
                          <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: hasCCData ? '#16a34a' : secondaryBgText, opacity: 0.7 }}>
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
                      className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg border-2 gap-3 sm:gap-0 ${
                        hasCFPSeedsData ? 'border-green-200 bg-green-50' : ''
                      }`}
                      style={!hasCFPSeedsData ? { borderColor: `${teamColors.primary}30` } : {}}
                    >
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div
                          className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                            hasCFPSeedsData ? 'bg-green-500 text-white' : ''
                          }`}
                          style={!hasCFPSeedsData ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                        >
                          {hasCFPSeedsData ? (
                            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : <span className="font-bold text-sm sm:text-base">2</span>}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-semibold" style={{ color: hasCFPSeedsData ? '#16a34a' : secondaryBgText }}>
                            CFP Seeds (1-12)
                          </div>
                          <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: hasCFPSeedsData ? '#16a34a' : secondaryBgText, opacity: 0.7 }}>
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
                          className={`p-3 sm:p-4 rounded-lg border-2 ${bowlTaskComplete ? 'border-green-200 bg-green-50' : ''}`}
                          style={!bowlTaskComplete ? { borderColor: `${teamColors.primary}30` } : {}}
                        >
                          <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 ${!bowlTaskComplete || (!hasCFPSeedsData || bowlEligible === null || (!userCFPSeed && bowlEligible && (!selectedBowl || !bowlOpponent))) ? 'mb-3' : ''}`}>
                            <div className="flex items-center gap-2 sm:gap-3">
                              <div
                                className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${bowlTaskComplete ? 'bg-green-500 text-white' : ''}`}
                                style={!bowlTaskComplete ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                              >
                                {bowlTaskComplete ? (
                                  <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                ) : <span className="font-bold text-sm sm:text-base">3</span>}
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm sm:text-base font-semibold" style={{ color: bowlTaskComplete ? '#16a34a' : secondaryBgText }}>
                                  {userCFPSeed ? 'Your CFP Game' : 'Your Bowl Game'}
                                </div>
                                {/* Show status text inline when complete */}
                                {userHasCFPBye && (
                                  <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: '#16a34a', opacity: 0.9 }}>
                                    ✓ #{userCFPSeed} Seed - Bye to Quarterfinals (Week 2)
                                  </div>
                                )}
                                {userInCFPFirstRound && (
                                  <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: '#16a34a', opacity: 0.9 }}>
                                    ✓ #{userCFPSeed} Seed vs #{17 - userCFPSeed} {getMascotName(userCFPOpponent)}
                                  </div>
                                )}
                                {hasCFPSeedsData && !userCFPSeed && bowlEligible === false && (
                                  <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: '#16a34a', opacity: 0.9 }}>
                                    ✓ Not bowl eligible this year
                                  </div>
                                )}
                                {hasCFPSeedsData && !userCFPSeed && bowlEligible && selectedBowl && bowlOpponent && (
                                  <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: '#16a34a', opacity: 0.9 }}>
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
                              <p className="text-sm" style={{ color: secondaryBgText, opacity: 0.7 }}>
                                Enter CFP Seeds first
                              </p>
                            </div>
                          )}
                          {hasCFPSeedsData && !userCFPSeed && bowlEligible === null && (
                            <div className="ml-13 pl-10">
                              <p className="mb-3" style={{ color: secondaryBgText, opacity: 0.8 }}>Did you make a bowl game?</p>
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
                              <p className="mb-2" style={{ color: secondaryBgText, opacity: 0.8 }}>Which bowl game?</p>
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
                              <p className="mb-2" style={{ color: secondaryBgText, opacity: 0.8 }}>Playing in: <strong>{selectedBowl}</strong></p>
                              <p className="mb-2" style={{ color: secondaryBgText, opacity: 0.8 }}>Who is your opponent?</p>
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
                        className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg border-2 gap-3 sm:gap-0 ${
                          userCFPFirstRoundGame ? 'border-green-200 bg-green-50' : ''
                        }`}
                        style={!userCFPFirstRoundGame ? { borderColor: `${teamColors.primary}30` } : {}}
                      >
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div
                            className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                              userCFPFirstRoundGame ? 'bg-green-500 text-white' : ''
                            }`}
                            style={!userCFPFirstRoundGame ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                          >
                            {userCFPFirstRoundGame ? (
                              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : <span className="font-bold text-sm sm:text-base">4</span>}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm sm:text-base font-semibold" style={{ color: userCFPFirstRoundGame ? '#16a34a' : secondaryBgText }}>
                              Enter Your CFP First Round Game
                            </div>
                            <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: userCFPFirstRoundGame ? '#16a34a' : secondaryBgText, opacity: 0.7 }}>
                              {userCFPFirstRoundGame ? `✓ ${userCFPFirstRoundGame.perspective?.userWon ? 'Won' : 'Lost'} ${Math.max(userCFPFirstRoundGame.perspective?.userScore || 0, userCFPFirstRoundGame.perspective?.opponentScore || 0)}-${Math.min(userCFPFirstRoundGame.perspective?.userScore || 0, userCFPFirstRoundGame.perspective?.opponentScore || 0)}` : `#${userCFPSeed} vs #${17 - userCFPSeed} ${getMascotName(userCFPOpponent)}`}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            if (userCFPFirstRoundGame) {
                              navigate(`${pathPrefix}/game/${userCFPFirstRoundGame.id}/edit`, { state: { from: location.pathname } })
                            } else {
                              const opponentTid = getTidFromAbbr(userCFPOpponent)
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
                          {userCFPFirstRoundGame ? 'Edit' : 'Enter'}
                        </button>
                      </div>
                    )}

                    {/* Task 4b: Enter YOUR Bowl Game (if Week 1 bowl, non-CFP team) */}
                    {hasCFPSeedsData && !userCFPSeed && bowlEligible && selectedBowl && bowlOpponent && userBowlIsWeek1 && (
                      <div
                        className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg border-2 gap-3 sm:gap-0 ${
                          userBowlGame ? 'border-green-200 bg-green-50' : ''
                        }`}
                        style={!userBowlGame ? { borderColor: `${teamColors.primary}30` } : {}}
                      >
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div
                            className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                              userBowlGame ? 'bg-green-500 text-white' : ''
                            }`}
                            style={!userBowlGame ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                          >
                            {userBowlGame ? (
                              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : <span className="font-bold text-sm sm:text-base">4</span>}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm sm:text-base font-semibold" style={{ color: userBowlGame ? '#16a34a' : secondaryBgText }}>
                              Enter Your {selectedBowl} Game
                            </div>
                            <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: userBowlGame ? '#16a34a' : secondaryBgText, opacity: 0.7 }}>
                              {userBowlGame ? `✓ ${userBowlGame.perspective?.userWon ? 'Won' : 'Lost'} ${Math.max(userBowlGame.perspective?.userScore || 0, userBowlGame.perspective?.opponentScore || 0)}-${Math.min(userBowlGame.perspective?.userScore || 0, userBowlGame.perspective?.opponentScore || 0)}` : `vs ${bowlOpponent}`}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            if (userBowlGame) {
                              navigate(`${pathPrefix}/game/${userBowlGame.id}/edit`, { state: { from: location.pathname } })
                            } else {
                              const opponentTid = getTidFromAbbr(bowlOpponent)
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
                      className={`p-3 sm:p-4 rounded-lg border-2 ${
                        takingNewJob !== null ? 'border-green-200 bg-green-50' : ''
                      }`}
                      style={takingNewJob === null ? { borderColor: `${teamColors.primary}30` } : {}}
                    >
                      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 ${takingNewJob === null || (takingNewJob === true && (!newJobTeam || !newJobPosition)) ? 'mb-3' : ''}`}>
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div
                            className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                              takingNewJob !== null ? 'bg-green-500 text-white' : ''
                            }`}
                            style={takingNewJob === null ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                          >
                            {takingNewJob !== null ? (
                              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : <span className="font-bold text-sm sm:text-base">5</span>}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm sm:text-base font-semibold" style={{ color: takingNewJob !== null ? '#16a34a' : secondaryBgText }}>
                              Taking a New Job? (Bowl Week 1)
                            </div>
                            {takingNewJob === true && newJobTeam && newJobPosition && (
                              <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: '#16a34a', opacity: 0.9 }}>
                                ✓ {newJobPosition} at {getTeamNameFromAbbr(newJobTeam)}
                              </div>
                            )}
                            {takingNewJob === false && (
                              <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: '#16a34a', opacity: 0.9 }}>
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
                          <p className="mb-2" style={{ color: secondaryBgText, opacity: 0.8 }}>Which team?</p>
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
                            />
                          </div>
                        </div>
                      )}
                      {takingNewJob === true && newJobTeam && !newJobPosition && (
                        <div className="ml-13 pl-10">
                          <p className="mb-2" style={{ color: secondaryBgText, opacity: 0.8 }}>
                            New team: <strong>{getTeamNameFromAbbr(newJobTeam)}</strong>
                          </p>
                          <p className="mb-2" style={{ color: secondaryBgText, opacity: 0.8 }}>What position?</p>
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
                      const teamAbbr = getCurrentTeamAbbr(currentDynasty) || currentDynasty.teamName
                      const weekCommitments = currentDynasty.recruitingCommitmentsByTeamYear?.[teamAbbr]?.[currentDynasty.currentYear]?.[commitmentKey]
                      const hasCommitmentsData = weekCommitments !== undefined
                      const commitmentsCount = weekCommitments?.length || 0
                      // Task number: after Taking a New Job (which is task 5)
                      const taskNum = 6

                      return (
                        <div
                          className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl gap-3 sm:gap-0 transition-all ${
                            hasCommitmentsData ? 'bg-green-50' : ''
                          }`}
                          style={!hasCommitmentsData ? { backgroundColor: `${teamColors.primary}08`, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } : { boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
                        >
                          <div className="flex items-center gap-3 sm:gap-4">
                            <div
                              className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full flex items-center justify-center flex-shrink-0 font-bold ${
                                hasCommitmentsData ? 'bg-green-500 text-white' : ''
                              }`}
                              style={!hasCommitmentsData ? { backgroundColor: `${teamColors.primary}15`, color: teamColors.primary, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' } : { boxShadow: '0 2px 4px rgba(0,0,0,0.15)' }}
                            >
                              {hasCommitmentsData ? (
                                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : taskNum}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm sm:text-base font-semibold" style={{ color: hasCommitmentsData ? '#16a34a' : secondaryBgText }}>
                                {hasCommitmentsData ? 'Recruiting Commitments' : 'Any commitments this week?'}
                              </div>
                              <div className="text-xs sm:text-sm mt-0.5" style={{ color: hasCommitmentsData ? '#16a34a' : secondaryBgText, opacity: 0.65 }}>
                                {hasCommitmentsData
                                  ? commitmentsCount > 0
                                    ? `✓ ${commitmentsCount} commitment${commitmentsCount !== 1 ? 's' : ''} recorded`
                                    : '✓ No commitments this week'
                                  : 'Record any recruiting commitments'}
                              </div>
                            </div>
                          </div>
                          {!hasCommitmentsData ? (
                            <div className="flex gap-2 self-end sm:self-auto">
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
                  <h3 className="text-lg sm:text-xl font-bold mb-4 sm:mb-5" style={{ color: secondaryBgText }}>
                    Bowl Week 2
                  </h3>
                  <div className="space-y-3">
                    {/* Task 1: Enter Week 1 Bowl Results (includes CFP First Round) */}
                    <div
                      className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl gap-3 sm:gap-0 transition-all ${
                        hasBowlWeek1Data ? 'bg-green-50' : ''
                      }`}
                      style={!hasBowlWeek1Data ? { backgroundColor: `${teamColors.primary}08`, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } : { boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
                    >
                      <div className="flex items-center gap-3 sm:gap-4">
                        <div
                          className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full flex items-center justify-center flex-shrink-0 ${
                            hasBowlWeek1Data ? 'bg-green-500 text-white' : ''
                          }`}
                          style={!hasBowlWeek1Data ? { backgroundColor: `${teamColors.primary}15`, color: teamColors.primary, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' } : { boxShadow: '0 2px 4px rgba(0,0,0,0.15)' }}
                        >
                          {hasBowlWeek1Data ? (
                            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : <span className="font-bold text-sm sm:text-base">1</span>}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-semibold" style={{ color: hasBowlWeek1Data ? '#16a34a' : secondaryBgText }}>
                            Week 1 Bowl Results
                          </div>
                          <div className="text-xs sm:text-sm mt-0.5" style={{ color: hasBowlWeek1Data ? '#16a34a' : secondaryBgText, opacity: 0.65 }}>
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
                        className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl gap-3 sm:gap-0 transition-all ${
                          userBowlGame ? 'bg-green-50' : ''
                        }`}
                        style={!userBowlGame ? { backgroundColor: `${teamColors.primary}08`, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } : { boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
                      >
                        <div className="flex items-center gap-3 sm:gap-4">
                          <div
                            className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full flex items-center justify-center flex-shrink-0 ${
                              userBowlGame ? 'bg-green-500 text-white' : ''
                            }`}
                            style={!userBowlGame ? { backgroundColor: `${teamColors.primary}15`, color: teamColors.primary, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' } : { boxShadow: '0 2px 4px rgba(0,0,0,0.15)' }}
                          >
                            {userBowlGame ? (
                              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : <span className="font-bold text-sm sm:text-base">2</span>}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm sm:text-base font-semibold" style={{ color: userBowlGame ? '#16a34a' : secondaryBgText }}>
                              Enter Your {selectedBowl} Game
                            </div>
                            <div className="text-xs sm:text-sm mt-0.5" style={{ color: userBowlGame ? '#16a34a' : secondaryBgText, opacity: 0.65 }}>
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
                                const opponentTid = getTidFromAbbr(bowlOpponent)
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
                    {/* userWonFirstRound bypasses hasBowlWeek1Data check since First Round winners already played their "week 1" game */}
                    {userInCFPQuarterfinal && (userWonFirstRound || hasBowlWeek1Data) && (
                      <div
                        className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl gap-3 sm:gap-0 transition-all ${
                          userCFPQuarterfinalGame ? 'bg-green-50' : ''
                        }`}
                        style={!userCFPQuarterfinalGame ? { backgroundColor: `${teamColors.primary}08`, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } : { boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
                      >
                        <div className="flex items-center gap-3 sm:gap-4">
                          <div
                            className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full flex items-center justify-center flex-shrink-0 ${
                              userCFPQuarterfinalGame ? 'bg-green-500 text-white' : ''
                            }`}
                            style={!userCFPQuarterfinalGame ? { backgroundColor: `${teamColors.primary}15`, color: teamColors.primary, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' } : { boxShadow: '0 2px 4px rgba(0,0,0,0.15)' }}
                          >
                            {userCFPQuarterfinalGame ? (
                              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : <span className="font-bold text-sm sm:text-base">{(bowlEligible && selectedBowl && bowlOpponent && userBowlIsWeek2) ? 3 : 2}</span>}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm sm:text-base font-semibold" style={{ color: userCFPQuarterfinalGame ? '#16a34a' : secondaryBgText }}>
                              Enter Your {userQFBowlName} Game (CFP QF)
                            </div>
                            <div className="text-xs sm:text-sm mt-0.5" style={{ color: userCFPQuarterfinalGame ? '#16a34a' : secondaryBgText, opacity: 0.65 }}>
                              {userCFPQuarterfinalGame
                                ? `✓ ${userCFPQuarterfinalGame.perspective?.userWon ? 'Won' : 'Lost'} ${Math.max(userCFPQuarterfinalGame.perspective?.userScore || 0, userCFPQuarterfinalGame.perspective?.opponentScore || 0)}-${Math.min(userCFPQuarterfinalGame.perspective?.userScore || 0, userCFPQuarterfinalGame.perspective?.opponentScore || 0)}`
                                : `#${userCFPSeed} vs ${userQFOpponent ? getMascotName(userQFOpponent) : 'TBD'}`}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            if (userCFPQuarterfinalGame) {
                              navigate(`${pathPrefix}/game/${userCFPQuarterfinalGame.id}/edit`, { state: { from: location.pathname } })
                            } else {
                              const opponentTid = getTidFromAbbr(userQFOpponent)
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
                          {userCFPQuarterfinalGame ? 'Edit' : 'Enter'}
                        </button>
                      </div>
                    )}

                    {/* Task: Taking a New Job? (appears every bowl week until accepted) */}
                    {(() => {
                      // Task number depends on how many tasks are showing above
                      let newJobTaskNum = 2
                      if (bowlEligible && selectedBowl && bowlOpponent && userBowlIsWeek2) newJobTaskNum++
                      if (userInCFPQuarterfinal && (userWonFirstRound || hasBowlWeek1Data)) newJobTaskNum++
                      return (
                    <div
                      className={`p-4 rounded-xl transition-all ${
                        takingNewJob !== null ? 'bg-green-50' : ''
                      }`}
                      style={takingNewJob === null ? { backgroundColor: `${teamColors.primary}08`, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } : { boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
                    >
                      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 ${takingNewJob === null || (takingNewJob === true && (!newJobTeam || !newJobPosition)) ? 'mb-3' : ''}`}>
                        <div className="flex items-center gap-3 sm:gap-4">
                          <div
                            className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full flex items-center justify-center flex-shrink-0 ${
                              takingNewJob !== null ? 'bg-green-500 text-white' : ''
                            }`}
                            style={takingNewJob === null ? { backgroundColor: `${teamColors.primary}15`, color: teamColors.primary, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' } : { boxShadow: '0 2px 4px rgba(0,0,0,0.15)' }}
                          >
                            {takingNewJob !== null ? (
                              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : <span className="font-bold text-sm sm:text-base">{newJobTaskNum}</span>}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm sm:text-base font-semibold" style={{ color: takingNewJob !== null ? '#16a34a' : secondaryBgText }}>
                              Taking a New Job? (Bowl Week 2)
                            </div>
                            {takingNewJob === true && newJobTeam && newJobPosition && (
                              <div className="text-xs sm:text-sm mt-0.5" style={{ color: '#16a34a', opacity: 0.85 }}>
                                ✓ {newJobPosition} at {getTeamNameFromAbbr(newJobTeam)}
                              </div>
                            )}
                            {takingNewJob === false && (
                              <div className="text-xs sm:text-sm mt-0.5" style={{ color: '#16a34a', opacity: 0.85 }}>
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
                          <p className="mb-2" style={{ color: secondaryBgText, opacity: 0.8 }}>Which team?</p>
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
                            />
                          </div>
                        </div>
                      )}
                      {takingNewJob === true && newJobTeam && !newJobPosition && (
                        <div className="ml-13 pl-10">
                          <p className="mb-2" style={{ color: secondaryBgText, opacity: 0.8 }}>
                            New team: <strong>{getTeamNameFromAbbr(newJobTeam)}</strong>
                          </p>
                          <p className="mb-2" style={{ color: secondaryBgText, opacity: 0.8 }}>What position?</p>
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
                          className="p-3 sm:p-4 rounded-lg border-2"
                          style={{ borderColor: `${teamColors.primary}30` }}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
                            <div className="flex items-center gap-2 sm:gap-3">
                              <div
                                className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{ backgroundColor: `${teamColors.primary}20`, color: teamColors.primary }}
                              >
                                <span className="font-bold text-sm sm:text-base">{taskNum}</span>
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm sm:text-base font-semibold" style={{ color: secondaryBgText }}>
                                  Fill Coordinator {firedOC && firedDC ? 'Vacancies' : 'Vacancy'}
                                </div>
                                {/* Show status if user answered but vacancy not filled */}
                                {allAnswered && !allFilled && (
                                  <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: secondaryBgText, opacity: 0.7 }}>
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
                              <p className="mb-2 font-medium" style={{ color: secondaryBgText }}>
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
                              <p className="mb-2 font-medium" style={{ color: secondaryBgText }}>
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
                              <p className="mb-2 font-medium" style={{ color: secondaryBgText }}>
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
                              <p className="mb-2 font-medium" style={{ color: secondaryBgText }}>
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
                      const teamAbbr = getCurrentTeamAbbr(currentDynasty) || currentDynasty.teamName
                      const weekCommitments = currentDynasty.recruitingCommitmentsByTeamYear?.[teamAbbr]?.[currentDynasty.currentYear]?.[commitmentKey]
                      const hasCommitmentsData = weekCommitments !== undefined
                      const commitmentsCount = weekCommitments?.length || 0
                      // Task number: starts at base, increments based on visible tasks
                      let taskNum = 2
                      if (bowlEligible && selectedBowl && bowlOpponent && userBowlIsWeek2) taskNum++
                      if (userInCFPQuarterfinal && (userWonFirstRound || hasBowlWeek1Data)) taskNum++
                      taskNum++ // After "Taking a New Job" task
                      const ccDataForTaskNum = currentDynasty.conferenceChampionshipDataByYear?.[currentDynasty.currentYear] || {}
                      if (currentDynasty.coachPosition === 'HC' && (ccDataForTaskNum.firedOCName || ccDataForTaskNum.firedDCName)) taskNum++ // After coordinator hire task

                      return (
                        <div
                          className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl gap-3 sm:gap-0 transition-all ${
                            hasCommitmentsData ? 'bg-green-50' : ''
                          }`}
                          style={!hasCommitmentsData ? { backgroundColor: `${teamColors.primary}08`, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } : { boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
                        >
                          <div className="flex items-center gap-3 sm:gap-4">
                            <div
                              className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full flex items-center justify-center flex-shrink-0 font-bold ${
                                hasCommitmentsData ? 'bg-green-500 text-white' : ''
                              }`}
                              style={!hasCommitmentsData ? { backgroundColor: `${teamColors.primary}15`, color: teamColors.primary, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' } : { boxShadow: '0 2px 4px rgba(0,0,0,0.15)' }}
                            >
                              {hasCommitmentsData ? (
                                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : taskNum}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm sm:text-base font-semibold" style={{ color: hasCommitmentsData ? '#16a34a' : secondaryBgText }}>
                                {hasCommitmentsData ? 'Recruiting Commitments' : 'Any commitments this week?'}
                              </div>
                              <div className="text-xs sm:text-sm mt-0.5" style={{ color: hasCommitmentsData ? '#16a34a' : secondaryBgText, opacity: 0.65 }}>
                                {hasCommitmentsData
                                  ? commitmentsCount > 0
                                    ? `✓ ${commitmentsCount} commitment${commitmentsCount !== 1 ? 's' : ''} recorded`
                                    : '✓ No commitments this week'
                                  : 'Record any recruiting commitments'}
                              </div>
                            </div>
                          </div>
                          {!hasCommitmentsData ? (
                            <div className="flex gap-2 self-end sm:self-auto">
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
              const hasChampData = champData.length > 0

              return (
                <>
                  <h3 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4" style={{ color: secondaryBgText }}>
                    End of Season Recap
                  </h3>
                  <div className="space-y-3 sm:space-y-4">
                    {/* Task: Enter National Championship Result (only if user was NOT in championship) */}
                    {!userInCFPChampionship && (
                      <div
                        className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg border-2 gap-3 sm:gap-0 ${
                          hasChampData ? 'border-green-200 bg-green-50' : ''
                        }`}
                        style={!hasChampData ? { borderColor: `${teamColors.primary}30` } : {}}
                      >
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div
                            className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                              hasChampData ? 'bg-green-500 text-white' : ''
                            }`}
                            style={!hasChampData ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                          >
                            {hasChampData ? (
                              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : <span className="font-bold text-sm sm:text-base">1</span>}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm sm:text-base font-semibold" style={{ color: hasChampData ? '#16a34a' : secondaryBgText }}>
                              National Championship Result
                            </div>
                            <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: hasChampData ? '#16a34a' : secondaryBgText, opacity: 0.7 }}>
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
                      // Check if user has actually saved GP/Snaps for this year (not just inferred from box scores)
                      const year = currentDynasty.currentYear
                      const isCompleted = currentDynasty?.gpSnapsCompletedByYear?.[year] || currentDynasty?.gpSnapsCompletedByYear?.[String(year)]
                      const playerCount = currentDynasty?.players?.filter(p => {
                        const yearStats = p.statsByYear?.[year] || p.statsByYear?.[String(year)]
                        return yearStats && (yearStats.gamesPlayed || yearStats.snapsPlayed)
                      }).length || 0
                      const taskNumber = !userInCFPChampionship ? 2 : 1

                      return (
                        <div
                          className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg border-2 gap-3 sm:gap-0 ${
                            isCompleted ? 'border-green-200 bg-green-50' : ''
                          }`}
                          style={!isCompleted ? { borderColor: `${teamColors.primary}30` } : {}}
                        >
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div
                              className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                                isCompleted ? 'bg-green-500 text-white' : ''
                              }`}
                              style={!isCompleted ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                            >
                              {isCompleted ? (
                                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : <span className="font-bold text-sm sm:text-base">{taskNumber}</span>}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm sm:text-base font-semibold" style={{ color: isCompleted ? '#16a34a' : secondaryBgText }}>
                                GP/Snaps Entry
                              </div>
                              {isCompleted && (
                                <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: '#16a34a', opacity: 0.7 }}>
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
                      const isCompleted = currentDynasty?.detailedStatsCompletedByYear?.[year] || currentDynasty?.detailedStatsCompletedByYear?.[String(year)]
                      const taskNumber = !userInCFPChampionship ? 3 : 2
                      const isLocked = !gpSnapsCompleted

                      return (
                        <div
                          className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg border-2 gap-3 sm:gap-0 ${
                            isCompleted ? 'border-green-200 bg-green-50' : ''
                          } ${isLocked ? 'opacity-50' : ''}`}
                          style={!isCompleted ? { borderColor: `${teamColors.primary}30` } : {}}
                        >
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div
                              className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                                isCompleted ? 'bg-green-500 text-white' : ''
                              }`}
                              style={!isCompleted ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                            >
                              {isCompleted ? (
                                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : isLocked ? (
                                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                              ) : <span className="font-bold text-sm sm:text-base">{taskNumber}</span>}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm sm:text-base font-semibold" style={{ color: isCompleted ? '#16a34a' : secondaryBgText }}>
                                Detailed Stats Entry
                              </div>
                              {(isCompleted || isLocked) && (
                                <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: isCompleted ? '#16a34a' : secondaryBgText, opacity: 0.7 }}>
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
                          className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg border-2 gap-3 sm:gap-0 ${
                            hasStandingsData ? 'border-green-200 bg-green-50' : ''
                          }`}
                          style={!hasStandingsData ? { borderColor: `${teamColors.primary}30` } : {}}
                        >
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div
                              className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                                hasStandingsData ? 'bg-green-500 text-white' : ''
                              }`}
                              style={!hasStandingsData ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                            >
                              {hasStandingsData ? (
                                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : <span className="font-bold text-sm sm:text-base">{taskNumber}</span>}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm sm:text-base font-semibold" style={{ color: hasStandingsData ? '#16a34a' : secondaryBgText }}>
                                Conference Standings
                              </div>
                              {hasStandingsData && (
                                <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: '#16a34a', opacity: 0.7 }}>
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
                          className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg border-2 gap-3 sm:gap-0 ${
                            hasPollsData ? 'border-green-200 bg-green-50' : ''
                          }`}
                          style={!hasPollsData ? { borderColor: `${teamColors.primary}30` } : {}}
                        >
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div
                              className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                                hasPollsData ? 'bg-green-500 text-white' : ''
                              }`}
                              style={!hasPollsData ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                            >
                              {hasPollsData ? (
                                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : <span className="font-bold text-sm sm:text-base">{taskNumber}</span>}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm sm:text-base font-semibold" style={{ color: hasPollsData ? '#16a34a' : secondaryBgText }}>
                                Final Top 25 Polls
                              </div>
                              {hasPollsData && (
                                <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: '#16a34a', opacity: 0.7 }}>
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
                          className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg border-2 gap-3 sm:gap-0 ${
                            hasTeamStats ? 'border-green-200 bg-green-50' : ''
                          }`}
                          style={!hasTeamStats ? { borderColor: `${teamColors.primary}30` } : {}}
                        >
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div
                              className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                                hasTeamStats ? 'bg-green-500 text-white' : ''
                              }`}
                              style={!hasTeamStats ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                            >
                              {hasTeamStats ? (
                                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : <span className="font-bold text-sm sm:text-base">{taskNumber}</span>}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm sm:text-base font-semibold" style={{ color: hasTeamStats ? '#16a34a' : secondaryBgText }}>
                                Team Statistics
                              </div>
                              {hasTeamStats && (
                                <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: '#16a34a', opacity: 0.7 }}>
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
                          className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg border-2 gap-3 sm:gap-0 ${
                            hasAwards ? 'border-green-200 bg-green-50' : ''
                          }`}
                          style={!hasAwards ? { borderColor: `${teamColors.primary}30` } : {}}
                        >
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div
                              className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                                hasAwards ? 'bg-green-500 text-white' : ''
                              }`}
                              style={!hasAwards ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                            >
                              {hasAwards ? (
                                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : <span className="font-bold text-sm sm:text-base">{taskNumber}</span>}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm sm:text-base font-semibold" style={{ color: hasAwards ? '#16a34a' : secondaryBgText }}>
                                Season Awards
                              </div>
                              {hasAwards && (
                                <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: '#16a34a', opacity: 0.7 }}>
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

                    {/* Task: All-Americans & All-Conference Entry */}
                    {(() => {
                      const hasAllAmericans = currentDynasty?.allAmericansByYear?.[currentDynasty.currentYear] &&
                        ((currentDynasty.allAmericansByYear[currentDynasty.currentYear].allAmericans?.length > 0) ||
                         (currentDynasty.allAmericansByYear[currentDynasty.currentYear].allConference?.length > 0))
                      const taskNumber = !userInCFPChampionship ? 8 : 7

                      return (
                        <div
                          className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg border-2 gap-3 sm:gap-0 ${
                            hasAllAmericans ? 'border-green-200 bg-green-50' : ''
                          }`}
                          style={!hasAllAmericans ? { borderColor: `${teamColors.primary}30` } : {}}
                        >
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div
                              className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                                hasAllAmericans ? 'bg-green-500 text-white' : ''
                              }`}
                              style={!hasAllAmericans ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                            >
                              {hasAllAmericans ? (
                                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : <span className="font-bold text-sm sm:text-base">{taskNumber}</span>}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm sm:text-base font-semibold" style={{ color: hasAllAmericans ? '#16a34a' : secondaryBgText }}>
                                All-Americans & All-Conference
                              </div>
                              {hasAllAmericans && (
                                <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: '#16a34a', opacity: 0.7 }}>
                                  ✓ All-Americans and All-Conference selections entered
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

                  </div>
                </>
              )
            }

            // Weeks 3-4: CFP rounds (Semifinals, Championship)
            // Note: CFP Semifinals CPU games are only entered in Week 4 (Championship week)
            // User's own SF game is entered in Week 3 via the dedicated task

            return (
              <>
                <h3 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4" style={{ color: secondaryBgText }}>
                  {week === 5 ? 'End of Season Recap' : week === 4 ? 'National Championship' : `Bowl Week ${week}`}
                </h3>
                <div className="space-y-3 sm:space-y-4">
                  {/* Week 2 Bowl Results - only show in Week 3 */}
                  {week === 3 && (
                    <div
                      className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg border-2 gap-3 sm:gap-0 ${
                        hasBowlWeek2Data ? 'border-green-200 bg-green-50' : ''
                      }`}
                      style={!hasBowlWeek2Data ? { borderColor: `${teamColors.primary}30` } : {}}
                    >
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div
                          className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                            hasBowlWeek2Data ? 'bg-green-500 text-white' : ''
                          }`}
                          style={!hasBowlWeek2Data ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                        >
                          {hasBowlWeek2Data ? (
                            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : <span className="font-bold text-sm sm:text-base">1</span>}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-semibold" style={{ color: hasBowlWeek2Data ? '#16a34a' : secondaryBgText }}>
                            Week 2 Bowl Results
                          </div>
                          <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: hasBowlWeek2Data ? '#16a34a' : secondaryBgText, opacity: 0.7 }}>
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
                      className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg border-2 gap-3 sm:gap-0 ${
                        userCFPSemifinalGame ? 'border-green-200 bg-green-50' : ''
                      }`}
                      style={!userCFPSemifinalGame ? { borderColor: `${teamColors.primary}30` } : {}}
                    >
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div
                          className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                            userCFPSemifinalGame ? 'bg-green-500 text-white' : ''
                          }`}
                          style={!userCFPSemifinalGame ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                        >
                          {userCFPSemifinalGame ? (
                            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : <span className="font-bold text-sm sm:text-base">1</span>}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-semibold" style={{ color: userCFPSemifinalGame ? '#16a34a' : secondaryBgText }}>
                            Enter Your CFP Semifinal Game
                          </div>
                          <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: userCFPSemifinalGame ? '#16a34a' : secondaryBgText, opacity: 0.7 }}>
                            {userCFPSemifinalGame
                              ? `✓ ${userCFPSemifinalGame.perspective?.userWon ? 'Won' : 'Lost'} ${Math.max(userCFPSemifinalGame.perspective?.userScore || 0, userCFPSemifinalGame.perspective?.opponentScore || 0)}-${Math.min(userCFPSemifinalGame.perspective?.userScore || 0, userCFPSemifinalGame.perspective?.opponentScore || 0)}`
                              : `${userSFBowlName || 'CFP Semifinal'} vs ${userSFOpponent ? getMascotName(userSFOpponent) || userSFOpponent : 'TBD'}`}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          if (userCFPSemifinalGame) {
                            navigate(`${pathPrefix}/game/${userCFPSemifinalGame.id}/edit`, { state: { from: location.pathname } })
                          } else {
                            const opponentTid = getTidFromAbbr(userSFOpponent)
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
                        {userCFPSemifinalGame ? 'Edit' : 'Enter'}
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
                      className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg border-2 gap-3 sm:gap-0 ${
                        allSFComplete ? 'border-green-200 bg-green-50' : ''
                      }`}
                      style={!allSFComplete ? { borderColor: `${teamColors.primary}30` } : {}}
                    >
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div
                          className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                            allSFComplete ? 'bg-green-500 text-white' : ''
                          }`}
                          style={!allSFComplete ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                        >
                          {allSFComplete ? (
                            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : <span className="font-bold text-sm sm:text-base">1</span>}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-semibold" style={{ color: allSFComplete ? '#16a34a' : secondaryBgText }}>
                            CFP Semifinal Results
                          </div>
                          <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: allSFComplete ? '#16a34a' : secondaryBgText, opacity: 0.7 }}>
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

                    return (
                    <div
                      className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg border-2 gap-3 sm:gap-0 ${
                        userCFPChampionshipGame ? 'border-green-200 bg-green-50' : ''
                      }`}
                      style={!userCFPChampionshipGame ? { borderColor: `${teamColors.primary}30` } : {}}
                    >
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div
                          className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                            userCFPChampionshipGame ? 'bg-green-500 text-white' : ''
                          }`}
                          style={!userCFPChampionshipGame ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                        >
                          {userCFPChampionshipGame ? (
                            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : <span className="font-bold text-sm sm:text-base">2</span>}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-semibold" style={{ color: userCFPChampionshipGame ? '#16a34a' : secondaryBgText }}>
                            Enter Your National Championship Game
                          </div>
                          <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: userCFPChampionshipGame ? '#16a34a' : secondaryBgText, opacity: 0.7 }}>
                            {userCFPChampionshipGame
                              ? `✓ ${userCFPChampionshipGame.perspective?.userWon ? 'Won' : 'Lost'} ${Math.max(userCFPChampionshipGame.perspective?.userScore || 0, userCFPChampionshipGame.perspective?.opponentScore || 0)}-${Math.min(userCFPChampionshipGame.perspective?.userScore || 0, userCFPChampionshipGame.perspective?.opponentScore || 0)}`
                              : allSFComplete
                                ? `National Championship vs ${userChampOpponent ? getMascotName(userChampOpponent) || userChampOpponent : 'TBD'}`
                                : 'Enter SF results first to determine opponent'}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          if (userCFPChampionshipGame) {
                            navigate(`${pathPrefix}/game/${userCFPChampionshipGame.id}/edit`, { state: { from: location.pathname } })
                          } else {
                            const opponentTid = getTidFromAbbr(userChampOpponent)
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
                        {userCFPChampionshipGame ? 'Edit' : 'Enter'}
                      </button>
                    </div>
                    )
                  })()}

                  {/* CFP Championship - REMOVED FROM WEEK 4 for non-championship users */}
                  {/* Users who are NOT in the championship will enter this result in Week 5 (End of Season Recap) */}

                  {/* Task: Taking a New Job? (appears in bowl weeks 1-3, not in week 4/championship) */}
                  {week !== 4 && (
                  <div
                    className={`p-3 sm:p-4 rounded-lg border-2 ${
                      takingNewJob !== null ? 'border-green-200 bg-green-50' : ''
                    }`}
                    style={takingNewJob === null ? { borderColor: `${teamColors.primary}30` } : {}}
                  >
                    <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 ${takingNewJob === null || (takingNewJob === true && (!newJobTeam || !newJobPosition)) ? 'mb-3' : ''}`}>
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div
                          className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                            takingNewJob !== null ? 'bg-green-500 text-white' : ''
                          }`}
                          style={takingNewJob === null ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                        >
                          {takingNewJob !== null ? (
                            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : <span className="font-bold text-sm sm:text-base">2</span>}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-semibold" style={{ color: takingNewJob !== null ? '#16a34a' : secondaryBgText }}>
                            Taking a New Job? (Bowl Week {week})
                          </div>
                          {takingNewJob === true && newJobTeam && newJobPosition && (
                            <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: '#16a34a', opacity: 0.9 }}>
                              ✓ {newJobPosition} at {getTeamNameFromAbbr(newJobTeam)}
                            </div>
                          )}
                          {takingNewJob === false && (
                            <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: '#16a34a', opacity: 0.9 }}>
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
                        <p className="mb-2" style={{ color: secondaryBgText, opacity: 0.8 }}>Which team?</p>
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
                          />
                        </div>
                      </div>
                    )}
                    {takingNewJob === true && newJobTeam && !newJobPosition && (
                      <div className="ml-13 pl-10">
                        <p className="mb-2" style={{ color: secondaryBgText, opacity: 0.8 }}>
                          New team: <strong>{getTeamNameFromAbbr(newJobTeam)}</strong>
                        </p>
                        <p className="mb-2" style={{ color: secondaryBgText, opacity: 0.8 }}>What position?</p>
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
                        className="p-3 sm:p-4 rounded-lg border-2"
                        style={{ borderColor: `${teamColors.primary}30` }}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div
                              className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: `${teamColors.primary}20`, color: teamColors.primary }}
                            >
                              <span className="font-bold text-sm sm:text-base">3</span>
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm sm:text-base font-semibold" style={{ color: secondaryBgText }}>
                                Fill Coordinator {firedOC && firedDC ? 'Vacancies' : 'Vacancy'}
                              </div>
                              {/* Show status if user answered but vacancy not filled */}
                              {allAnswered && !allFilled && (
                                <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: secondaryBgText, opacity: 0.7 }}>
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
                            <p className="mb-2 font-medium" style={{ color: secondaryBgText }}>
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
                            <p className="mb-2 font-medium" style={{ color: secondaryBgText }}>
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
                            <p className="mb-2 font-medium" style={{ color: secondaryBgText }}>
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
                            <p className="mb-2 font-medium" style={{ color: secondaryBgText }}>
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
                    const teamAbbr = getCurrentTeamAbbr(currentDynasty) || currentDynasty.teamName
                    const weekCommitments = currentDynasty.recruitingCommitmentsByTeamYear?.[teamAbbr]?.[currentDynasty.currentYear]?.[commitmentKey]
                    const hasCommitmentsData = weekCommitments !== undefined
                    const commitmentsCount = weekCommitments?.length || 0
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
                        className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg border-2 gap-3 sm:gap-0 ${
                          hasCommitmentsData ? 'border-green-200 bg-green-50' : ''
                        }`}
                        style={!hasCommitmentsData ? { borderColor: `${teamColors.primary}30` } : {}}
                      >
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div
                            className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold ${
                              hasCommitmentsData ? 'bg-green-500 text-white' : ''
                            }`}
                            style={!hasCommitmentsData ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                          >
                            {hasCommitmentsData ? (
                              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : taskNum}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm sm:text-base font-semibold" style={{ color: hasCommitmentsData ? '#16a34a' : secondaryBgText }}>
                              {hasCommitmentsData ? 'Recruiting Commitments' : 'Any commitments this week?'}
                            </div>
                            <div className="text-xs sm:text-sm mt-0.5" style={{ color: hasCommitmentsData ? '#16a34a' : secondaryBgText, opacity: 0.7 }}>
                              {hasCommitmentsData
                                ? commitmentsCount > 0
                                  ? `✓ ${commitmentsCount} commitment${commitmentsCount !== 1 ? 's' : ''} recorded`
                                  : '✓ No commitments this week'
                                : 'Record any recruiting commitments'}
                            </div>
                          </div>
                        </div>
                        {!hasCommitmentsData ? (
                          <div className="flex gap-2 self-end sm:self-auto">
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
      ) : currentDynasty.currentPhase === 'offseason' ? (
        <div
          className="rounded-lg shadow-lg p-4 sm:p-6"
          style={{
            backgroundColor: teamColors.secondary,
            border: `3px solid ${teamColors.primary}`
          }}
        >
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
                    <h3 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4" style={{ color: secondaryBgText }}>
                      New Team - No Players Leaving
                    </h3>
                    <div className="space-y-3 sm:space-y-4">
                      <div
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg border-2 gap-3 sm:gap-0 border-green-200 bg-green-50"
                      >
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-green-500 text-white">
                            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm sm:text-base font-semibold" style={{ color: '#16a34a' }}>
                              Skipped - New Team
                            </div>
                            <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: '#16a34a', opacity: 0.7 }}>
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
                  <h3 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4" style={{ color: secondaryBgText }}>
                    Players Leaving
                  </h3>
                  <div className="space-y-3 sm:space-y-4">
                    {/* Task: Enter Players Leaving */}
                    <div
                      className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg border-2 gap-3 sm:gap-0 ${
                        hasPlayersLeavingData ? 'border-green-200 bg-green-50' : ''
                      }`}
                      style={!hasPlayersLeavingData ? { borderColor: `${teamColors.primary}30` } : {}}
                    >
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div
                          className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                            hasPlayersLeavingData ? 'bg-green-500 text-white' : ''
                          }`}
                          style={!hasPlayersLeavingData ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                        >
                          {hasPlayersLeavingData ? (
                            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : <span className="font-bold text-sm sm:text-base">1</span>}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-semibold" style={{ color: hasPlayersLeavingData ? '#16a34a' : secondaryBgText }}>
                            Players Leaving
                          </div>
                          <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: hasPlayersLeavingData ? '#16a34a' : secondaryBgText, opacity: 0.7 }}>
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
              const hasDraftResultsData = currentDynasty?.draftResultsByYear?.[offseasonDataYear]?.length > 0
              const draftResultsCount = currentDynasty?.draftResultsByYear?.[offseasonDataYear]?.length || 0

              // Check recruiting commitments for this week - TEAM-CENTRIC with signing_ key
              const teamAbbrForCommitments = getCurrentTeamAbbr(currentDynasty) || currentDynasty.teamName
              const recruitingCommitmentsForTeamYear = currentDynasty?.recruitingCommitmentsByTeamYear?.[teamAbbrForCommitments]?.[offseasonDataYear] || {}
              const commitmentsForWeek = recruitingCommitmentsForTeamYear[`signing_${recruitingWeekNum}`]
              const hasCommitmentsData = commitmentsForWeek !== undefined // undefined = not answered, [] = no commitments, array with items = has commitments
              const commitmentsCount = commitmentsForWeek?.length || 0

              return (
                <>
                  <h3 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4" style={{ color: secondaryBgText }}>
                    {recruitingWeekNum === 5 ? 'National Signing Day' : `Recruiting Week ${recruitingWeekNum} of 4`}
                  </h3>
                  <div className="space-y-3 sm:space-y-4">
                    {/* Task 1: Recruiting Commitments */}
                    <div
                      className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg border-2 gap-3 sm:gap-0 ${
                        hasCommitmentsData ? 'border-green-200 bg-green-50' : ''
                      }`}
                      style={!hasCommitmentsData ? { borderColor: `${teamColors.primary}30` } : {}}
                    >
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div
                          className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                            hasCommitmentsData ? 'bg-green-500 text-white' : ''
                          }`}
                          style={!hasCommitmentsData ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                        >
                          {hasCommitmentsData ? (
                            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : <span className="font-bold text-sm sm:text-base">1</span>}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-semibold" style={{ color: hasCommitmentsData ? '#16a34a' : secondaryBgText }}>
                            {hasCommitmentsData
                              ? (recruitingWeekNum === 5 ? 'Signing Day' : 'Recruiting Commitments')
                              : (recruitingWeekNum === 5 ? 'Signing Day' : 'Any commitments this week?')}
                          </div>
                          <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: hasCommitmentsData ? '#16a34a' : secondaryBgText, opacity: 0.7 }}>
                            {hasCommitmentsData
                              ? commitmentsCount > 0
                                ? `✓ ${commitmentsCount} commitment${commitmentsCount !== 1 ? 's' : ''} recorded`
                                : '✓ No commitments this week'
                              : (recruitingWeekNum === 5 ? 'Enter your final recruiting class' : 'Record any recruiting commitments for this week')}
                          </div>
                        </div>
                      </div>
                      {!hasCommitmentsData ? (
                        recruitingWeekNum === 5 ? (
                          <button
                            onClick={() => setShowRecruitingModal(true)}
                            className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold hover:opacity-90 text-sm self-end sm:self-auto"
                            style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                          >
                            Open
                          </button>
                        ) : (
                          <div className="flex gap-2 self-end sm:self-auto">
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
                        className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg border-2 gap-3 sm:gap-0 ${
                          hasDraftResultsData || !hasDraftDeclarees ? 'border-green-200 bg-green-50' : ''
                        }`}
                        style={!(hasDraftResultsData || !hasDraftDeclarees) ? { borderColor: `${teamColors.primary}30` } : {}}
                      >
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div
                            className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                              hasDraftResultsData || !hasDraftDeclarees ? 'bg-green-500 text-white' : ''
                            }`}
                            style={!(hasDraftResultsData || !hasDraftDeclarees) ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                          >
                            {hasDraftResultsData || !hasDraftDeclarees ? (
                              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : <span className="font-bold text-sm sm:text-base">2</span>}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm sm:text-base font-semibold" style={{ color: hasDraftResultsData || !hasDraftDeclarees ? '#16a34a' : secondaryBgText }}>
                              Draft Results
                            </div>
                            <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: hasDraftResultsData || !hasDraftDeclarees ? '#16a34a' : secondaryBgText, opacity: 0.7 }}>
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
                          className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg border-2 gap-3 sm:gap-0 ${
                            hasTransferDestinationsData || !hasTransfers ? 'border-green-200 bg-green-50' : ''
                          }`}
                          style={!(hasTransferDestinationsData || !hasTransfers) ? { borderColor: `${teamColors.primary}30` } : {}}
                        >
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div
                              className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                                hasTransferDestinationsData || !hasTransfers ? 'bg-green-500 text-white' : ''
                              }`}
                              style={!(hasTransferDestinationsData || !hasTransfers) ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                            >
                              {hasTransferDestinationsData || !hasTransfers ? (
                                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : <span className="font-bold text-sm sm:text-base">3</span>}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm sm:text-base font-semibold" style={{ color: hasTransferDestinationsData || !hasTransfers ? '#16a34a' : secondaryBgText }}>
                                Transfer Destinations
                              </div>
                              <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: hasTransferDestinationsData || !hasTransfers ? '#16a34a' : secondaryBgText, opacity: 0.7 }}>
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
                          className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg border-2 gap-3 sm:gap-0 ${
                            hasClassRank ? 'border-green-200 bg-green-50' : ''
                          }`}
                          style={!hasClassRank ? { borderColor: `${teamColors.primary}30` } : {}}
                        >
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div
                              className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                                hasClassRank ? 'bg-green-500 text-white' : ''
                              }`}
                              style={!hasClassRank ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                            >
                              {hasClassRank ? (
                                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : <span className="font-bold text-sm sm:text-base">2</span>}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm sm:text-base font-semibold" style={{ color: hasClassRank ? '#16a34a' : secondaryBgText }}>
                                Recruiting Class Rank
                              </div>
                              <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: hasClassRank ? '#16a34a' : secondaryBgText, opacity: 0.7 }}>
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
                          className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg border-2 gap-3 sm:gap-0 ${
                            hasPositionChanges ? 'border-green-200 bg-green-50' : ''
                          }`}
                          style={!hasPositionChanges ? { borderColor: `${teamColors.primary}30` } : {}}
                        >
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div
                              className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                                hasPositionChanges ? 'bg-green-500 text-white' : ''
                              }`}
                              style={!hasPositionChanges ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                            >
                              {hasPositionChanges ? (
                                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : <span className="font-bold text-sm sm:text-base">4</span>}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm sm:text-base font-semibold" style={{ color: hasPositionChanges ? '#16a34a' : secondaryBgText }}>
                                Position Changes
                              </div>
                              <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: hasPositionChanges ? '#16a34a' : secondaryBgText, opacity: 0.7 }}>
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
                      const teamAbbr = getCurrentTeamAbbr(currentDynasty)
                      const recruitingCommitmentsAll = currentDynasty?.recruitingCommitmentsByTeamYear?.[teamAbbr]?.[offseasonDataYear] || {}
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
                          className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg border-2 gap-3 sm:gap-0 ${
                            isComplete ? 'border-green-200 bg-green-50' : isBlocked ? 'opacity-50' : ''
                          }`}
                          style={!isComplete && !isBlocked ? { borderColor: `${teamColors.primary}30` } : isBlocked && !isComplete ? { borderColor: '#9ca3af' } : {}}
                        >
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div
                              className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                                isComplete ? 'bg-green-500 text-white' : ''
                              }`}
                              style={!isComplete ? { backgroundColor: isBlocked ? '#d1d5db' : `${teamColors.primary}20`, color: isBlocked ? '#6b7280' : teamColors.primary } : {}}
                            >
                              {isComplete ? (
                                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : <span className="font-bold text-sm sm:text-base">5</span>}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm sm:text-base font-semibold" style={{ color: isComplete ? '#16a34a' : isBlocked ? '#6b7280' : secondaryBgText }}>
                                Portal Transfer Class Assignment
                              </div>
                              <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: isComplete ? '#16a34a' : isBlocked ? '#6b7280' : secondaryBgText, opacity: 0.7 }}>
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
                                backgroundColor: (isBlocked || !hasPortalTransfers) ? '#9ca3af' : teamColors.primary,
                                color: (isBlocked || !hasPortalTransfers) ? '#ffffff' : primaryBgText
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
                      const teamAbbr = getCurrentTeamAbbr(currentDynasty)
                      const year = offseasonDataYear

                      // Get all players and filter for fringe cases
                      const allPlayers = currentDynasty?.players || []
                      const fringeCasePlayers = allPlayers.filter(player => {
                        // Must have been on the team for this year
                        const playerTeamThisYear = player.teamsByYear?.[year] || player.team
                        if (playerTeamThisYear !== teamAbbr) return false

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
                          className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg border-2 gap-3 sm:gap-0 ${
                            isComplete ? 'border-green-200 bg-green-50' : isBlocked ? 'opacity-50' : ''
                          }`}
                          style={!isComplete && !isBlocked ? { borderColor: `${teamColors.primary}30` } : isBlocked && !isComplete ? { borderColor: '#9ca3af' } : {}}
                        >
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div
                              className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                                isComplete ? 'bg-green-500 text-white' : ''
                              }`}
                              style={!isComplete ? { backgroundColor: isBlocked ? '#d1d5db' : `${teamColors.primary}20`, color: isBlocked ? '#6b7280' : teamColors.primary } : {}}
                            >
                              {isComplete ? (
                                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : <span className="font-bold text-sm sm:text-base">6</span>}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm sm:text-base font-semibold" style={{ color: isComplete ? '#16a34a' : isBlocked ? '#6b7280' : secondaryBgText }}>
                                Fringe Case Class Assignment
                              </div>
                              <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: isComplete ? '#16a34a' : isBlocked ? '#6b7280' : secondaryBgText, opacity: 0.7 }}>
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
                                backgroundColor: (isBlocked || !hasFringeCases) ? '#9ca3af' : teamColors.primary,
                                color: (isBlocked || !hasFringeCases) ? '#ffffff' : primaryBgText
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
                    <h3 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4" style={{ color: secondaryBgText }}>
                      Training Camp
                    </h3>
                    <div className="space-y-3 sm:space-y-4">
                      <div
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg border-2 gap-3 sm:gap-0 border-green-200 bg-green-50"
                      >
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-green-500 text-white">
                            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm sm:text-base font-semibold" style={{ color: '#16a34a' }}>
                              Training Results - Skipped
                            </div>
                            <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: '#16a34a', opacity: 0.7 }}>
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
              const returningPlayers = allPlayers.filter(p => {
                if (leavingPids.has(p.pid)) return false
                if (p.isRecruit) return false
                if (p.isHonorOnly) return false
                const wasOnTeamLastYear = matchesTeam(p.teamsByYear?.[offseasonDataYear])
                const isOnTeamThisYear = matchesTeam(p.teamsByYear?.[currentYear])
                return wasOnTeamLastYear && isOnTeamThisYear
              })

              // Get PORTAL TRANSFERS who joined this offseason (need training results too)
              const portalTransfers = allPlayers.filter(p => {
                if (leavingPids.has(p.pid)) return false
                if (p.isHonorOnly) return false
                // Portal transfer = has previousTeam or isPortal flag, recruited this cycle
                const isPortalTransfer = (p.isPortal || p.previousTeam) && p.recruitYear === offseasonDataYear
                if (!isPortalTransfer) return false
                // Must be on the team this year
                const isOnTeamThisYear = matchesTeam(p.teamsByYear?.[currentYear])
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
                  <h3 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4" style={{ color: secondaryBgText }}>
                    Training Camp
                  </h3>
                  <div className="space-y-3 sm:space-y-4">
                    {/* Task 1: Training Results */}
                    <div
                      className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg border-2 gap-3 sm:gap-0 ${
                        hasTrainingResultsData ? 'border-green-200 bg-green-50' : ''
                      }`}
                      style={!hasTrainingResultsData ? { borderColor: `${teamColors.primary}30` } : {}}
                    >
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div
                          className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                            hasTrainingResultsData ? 'bg-green-500 text-white' : ''
                          }`}
                          style={!hasTrainingResultsData ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                        >
                          {hasTrainingResultsData ? (
                            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : <span className="font-bold text-sm sm:text-base">1</span>}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-semibold" style={{ color: hasTrainingResultsData ? '#16a34a' : secondaryBgText }}>
                            Training Results
                          </div>
                          <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: hasTrainingResultsData ? '#16a34a' : secondaryBgText, opacity: 0.7 }}>
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
                        className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg border-2 gap-3 sm:gap-0 ${
                          hasRecruitOverallsData ? 'border-green-200 bg-green-50' : ''
                        }`}
                        style={!hasRecruitOverallsData ? { borderColor: `${teamColors.primary}30` } : {}}
                      >
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div
                            className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                              hasRecruitOverallsData ? 'bg-green-500 text-white' : ''
                            }`}
                            style={!hasRecruitOverallsData ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                          >
                            {hasRecruitOverallsData ? (
                              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : <span className="font-bold text-sm sm:text-base">2</span>}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm sm:text-base font-semibold" style={{ color: hasRecruitOverallsData ? '#16a34a' : secondaryBgText }}>
                              Recruiting Class Overalls
                            </div>
                            <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: hasRecruitOverallsData ? '#16a34a' : secondaryBgText, opacity: 0.7 }}>
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
              const teamAbbr = getCurrentTeamAbbr(currentDynasty)
              // Year already flipped at Signing Day (Week 6), so currentYear IS the upcoming season
              const upcomingSeasonYear = currentDynasty.currentYear

              // Check if conferences have been set for the upcoming season
              const hasConferencesSet = currentDynasty?.customConferencesByYear?.[upcomingSeasonYear] != null

              // Check if encourage transfers has been completed
              const hasEncourageTransfers = currentDynasty?.encourageTransfersByTeamYear?.[teamAbbr]?.[currentDynasty.currentYear] != null
              const encourageTransfersCount = currentDynasty?.encourageTransfersByTeamYear?.[teamAbbr]?.[currentDynasty.currentYear]?.length || 0

              return (
                <>
                  <h3 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4" style={{ color: secondaryBgText }}>
                    Offseason
                  </h3>
                  <div className="space-y-3 sm:space-y-4">
                    {/* Task 1: Custom Conferences */}
                    <div
                      className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg border-2 gap-3 sm:gap-0 ${
                        hasConferencesSet ? 'border-green-200 bg-green-50' : ''
                      }`}
                      style={!hasConferencesSet ? { borderColor: `${teamColors.primary}30` } : {}}
                    >
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div
                          className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                            hasConferencesSet ? 'bg-green-500 text-white' : ''
                          }`}
                          style={!hasConferencesSet ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                        >
                          {hasConferencesSet ? (
                            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : <span className="font-bold text-sm sm:text-base">1</span>}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-semibold" style={{ color: hasConferencesSet ? '#16a34a' : secondaryBgText }}>
                            Custom Conferences
                          </div>
                          <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: hasConferencesSet ? '#16a34a' : secondaryBgText, opacity: 0.7 }}>
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
                      className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg border-2 gap-3 sm:gap-0 ${
                        hasEncourageTransfers ? 'border-green-200 bg-green-50' : ''
                      }`}
                      style={!hasEncourageTransfers ? { borderColor: `${teamColors.primary}30` } : {}}
                    >
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div
                          className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                            hasEncourageTransfers ? 'bg-green-500 text-white' : ''
                          }`}
                          style={!hasEncourageTransfers ? { backgroundColor: `${teamColors.primary}20`, color: teamColors.primary } : {}}
                        >
                          {hasEncourageTransfers ? (
                            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : <span className="font-bold text-sm sm:text-base">2</span>}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-semibold" style={{ color: hasEncourageTransfers ? '#16a34a' : secondaryBgText }}>
                            Encourage Transfers
                          </div>
                          <div className="text-xs sm:text-sm mt-0.5 sm:mt-1" style={{ color: hasEncourageTransfers ? '#16a34a' : secondaryBgText, opacity: 0.7 }}>
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
                <h3 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4" style={{ color: secondaryBgText }}>
                  Off-Season Week {week}
                </h3>
                <p className="text-sm" style={{ color: secondaryBgText, opacity: 0.7 }}>
                  Click "Advance Week" to continue to the next season.
                </p>
              </>
            )
          })()}
        </div>
      ) : (
        <div
          className="rounded-lg shadow-lg p-6"
          style={{
            backgroundColor: teamColors.secondary,
            border: `3px solid ${teamColors.primary}`
          }}
        >
          <h3 className="text-lg font-semibold mb-4" style={{ color: secondaryBgText }}>
            Current Phase: {getPhaseDisplay(currentDynasty.currentPhase, currentDynasty.currentWeek)}
          </h3>
          <p style={{ color: secondaryBgText, opacity: 0.8 }}>
            Click "Advance Week" in the header to progress through your dynasty.
          </p>
        </div>
      )}

      {/* Schedule Section */}
      <div className="rounded-2xl overflow-hidden" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.12)' }}>
        {/* Schedule Header */}
        <div
          className="px-5 py-4 sm:px-6 sm:py-5"
          style={{ backgroundColor: teamColors.primary }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-white">
                  {currentDynasty.currentYear} Schedule
                </h2>
                <p className="text-xs sm:text-sm text-white/70">
                  {wins}-{losses} Record
                </p>
              </div>
            </div>
            {!isViewOnly && (
              <button
                onClick={() => setShowScheduleModal(true)}
                className="p-2 sm:p-2.5 rounded-lg bg-white/10 hover:bg-white/20 transition-all"
                title="Edit Schedule"
              >
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Schedule Body */}
        <div className="p-3 sm:p-4" style={{ backgroundColor: teamColors.secondary }}>
          {teamSchedule && teamSchedule.length > 0 ? (
            <div className="space-y-2">
              {teamSchedule.map((entry, index) => {
                // Handle BYE weeks
                if (entry.isBye || entry.opponent?.toUpperCase() === 'BYE') {
                  return (
                    <div
                      key={index}
                      className="rounded-xl overflow-hidden"
                      style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                    >
                      <div className="flex items-center w-full overflow-hidden">
                        <div
                          className="w-10 sm:w-14 flex-shrink-0 text-center py-2 sm:py-3 rounded-l-xl font-bold text-[10px] sm:text-sm"
                          style={{ backgroundColor: `${secondaryBgText}15`, color: secondaryBgText }}
                        >
                          Wk {entry.week}
                        </div>
                        <div
                          className="flex-1 flex items-center justify-center py-2 sm:py-3 px-2 sm:px-4 rounded-r-xl"
                          style={{ backgroundColor: '#f5f5f5' }}
                        >
                          <span className="text-sm sm:text-base font-semibold text-gray-500">BYE WEEK</span>
                        </div>
                      </div>
                    </div>
                  )
                }

                // Use merged game data from getScheduleWithGameData
                const playedGame = entry.game
                const opponentColors = getOpponentColors(entry.opponent)
                const mascotName = getMascotName(entry.opponent)
                const opponentName = mascotName || getTeamNameFromAbbr(entry.opponent)
                const opponentLogo = mascotName ? getTeamLogo(mascotName) : null
                const isCurrentWeek = currentDynasty.currentPhase === 'regular_season' &&
                  Number(entry.week) === Number(currentDynasty.currentWeek) && !entry.isPlayed
                const isWin = entry.perspective?.userWon
                const isLoss = entry.perspective && !entry.perspective.userWon
                const teamPageUrl = `${pathPrefix}/team/${resolveTid(entry.opponent, currentDynasty?.teams || TEAMS)}/${currentDynasty.currentYear}`

                // Render clickable element - use div with onClick when inside Link (played games), use Link when standalone
                const TeamLogoClickable = ({ isInsideLink, children }) => {
                  if (isInsideLink) {
                    return (
                      <div
                        className="w-7 h-7 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 hover:scale-110 transition-transform bg-white cursor-pointer"
                        style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.1)', padding: '3px' }}
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(teamPageUrl) }}
                      >
                        {children}
                      </div>
                    )
                  }
                  return (
                    <Link
                      to={teamPageUrl}
                      className="w-7 h-7 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 hover:scale-110 transition-transform bg-white"
                      style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.1)', padding: '3px' }}
                    >
                      {children}
                    </Link>
                  )
                }

                const TeamNameClickable = ({ isInsideLink }) => {
                  if (isInsideLink) {
                    return (
                      <span
                        className="text-xs sm:text-base font-semibold truncate hover:underline cursor-pointer"
                        style={{ color: opponentColors.textColor }}
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(teamPageUrl) }}
                      >
                        {opponentName}
                      </span>
                    )
                  }
                  return (
                    <Link
                      to={teamPageUrl}
                      className="text-xs sm:text-base font-semibold truncate hover:underline"
                      style={{ color: opponentColors.textColor }}
                    >
                      {opponentName}
                    </Link>
                  )
                }

                const renderGameContent = (isInsideLink) => (
                  <div className="flex items-center w-full overflow-hidden">
                    {/* Week Badge */}
                    <div
                      className="w-10 sm:w-14 flex-shrink-0 text-center py-2 sm:py-3 rounded-l-xl font-bold text-[10px] sm:text-sm"
                      style={{
                        backgroundColor: entry.isPlayed
                          ? (isWin ? '#22c55e' : '#ef4444')
                          : isCurrentWeek
                            ? teamColors.primary
                            : `${secondaryBgText}15`,
                        color: entry.isPlayed || isCurrentWeek ? '#fff' : secondaryBgText
                      }}
                    >
                      {entry.isPlayed ? (isWin ? 'W' : 'L') : isCurrentWeek ? 'NEXT' : `Wk ${entry.week}`}
                    </div>

                    {/* Game Info */}
                    <div
                      className="flex-1 flex items-center justify-between py-2 sm:py-3 px-2 sm:px-4 rounded-r-xl min-w-0"
                      style={{ backgroundColor: opponentColors.backgroundColor }}
                    >
                      <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 flex-1">
                        {/* Location Badge */}
                        <span
                          className="w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[9px] sm:text-xs font-bold flex-shrink-0"
                          style={{
                            backgroundColor: `${opponentColors.textColor}15`,
                            color: opponentColors.textColor
                          }}
                        >
                          {entry.location === 'away' ? '@' : 'vs'}
                        </span>

                        {/* Team Logo */}
                        {opponentLogo && (
                          <TeamLogoClickable isInsideLink={isInsideLink}>
                            <img
                              src={opponentLogo}
                              alt={`${opponentName} logo`}
                              className="w-full h-full object-contain"
                            />
                          </TeamLogoClickable>
                        )}

                        {/* Team Name */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            {entry.perspective?.opponentRank && (
                              <span className="text-[9px] sm:text-xs font-bold px-1 sm:px-1.5 py-0.5 rounded flex-shrink-0" style={{ backgroundColor: `${opponentColors.textColor}15`, color: opponentColors.textColor }}>
                                #{entry.perspective.opponentRank}
                              </span>
                            )}
                            <TeamNameClickable isInsideLink={isInsideLink} />
                          </div>
                        </div>
                      </div>

                      {/* Score / Status */}
                      <div className="flex-shrink-0 text-right ml-1">
                        {entry.isPlayed ? (
                          <div className="text-sm sm:text-lg font-bold tabular-nums" style={{ color: opponentColors.textColor }}>
                            {Math.max(entry.perspective?.userScore || 0, entry.perspective?.opponentScore || 0)}-{Math.min(entry.perspective?.userScore || 0, entry.perspective?.opponentScore || 0)}
                            {playedGame?.overtimes && playedGame.overtimes.length > 0 && (
                              <span className="ml-0.5 text-[8px] sm:text-xs font-medium opacity-60">
                                {playedGame.overtimes.length > 1 ? `${playedGame.overtimes.length}OT` : 'OT'}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs sm:text-sm font-medium" style={{ color: opponentColors.textColor, opacity: 0.5 }}>
                            —
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )

                if (playedGame?.id) {
                  return (
                    <Link
                      key={index}
                      to={`${pathPrefix}/game/${playedGame.id}`}
                      className="block rounded-xl overflow-hidden hover:scale-[1.01] hover:shadow-lg transition-all duration-200"
                      style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                    >
                      {renderGameContent(true)}
                    </Link>
                  )
                }

                return (
                  <div
                    key={index}
                    className={`rounded-xl overflow-hidden ${isCurrentWeek ? 'animate-pulse-subtle' : ''}`}
                    style={{
                      boxShadow: isCurrentWeek
                        ? `0 2px 12px ${teamColors.primary}40`
                        : '0 2px 8px rgba(0,0,0,0.06)'
                    }}
                  >
                    {renderGameContent(false)}
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
              // Get opponent abbr from perspective (unified format) or fall back to state/saved data
              const ccOpponentInfo = ccGame?.perspective?.opponentTid ? getGameTeamInfo(currentDynasty?.teams || TEAMS, ccGame.perspective.opponentTid) : null
              const ccOpponentAbbr = ccOpponentInfo?.abbr || ccOpponent || ccDataForYear.opponent
              const hasOpponent = !!ccOpponentAbbr
              const ccOpponentColors = hasOpponent ? getOpponentColors(ccOpponentAbbr) : { backgroundColor: '#6b7280', textColor: '#ffffff' }
              const ccMascotFromAbbr = hasOpponent ? getMascotName(ccOpponentAbbr) : null
              const ccMascotName = ccMascotFromAbbr || (hasOpponent && getTeamLogo(ccOpponentAbbr) ? ccOpponentAbbr : null)
              const ccOpponentName = ccMascotName || (hasOpponent ? getTeamNameFromAbbr(ccOpponentAbbr) : 'Opponent Unknown')
              const ccOpponentLogo = ccMascotName ? getTeamLogo(ccMascotName) : null
              const isCurrentCCWeek = currentDynasty.currentPhase === 'conference_championship' && !ccGame
              const isWin = ccGame?.perspective?.userWon
              const isLoss = ccGame?.perspective && !ccGame.perspective.userWon

              const ccContent = (
                <div className="flex items-center w-full overflow-hidden">
                  {/* Week Badge */}
                  <div
                    className="w-10 sm:w-14 flex-shrink-0 text-center py-2 sm:py-3 rounded-l-xl font-bold text-[10px] sm:text-sm"
                    style={{
                      backgroundColor: ccGame
                        ? (isWin ? '#22c55e' : '#ef4444')
                        : isCurrentCCWeek
                          ? teamColors.primary
                          : `${secondaryBgText}15`,
                      color: ccGame || isCurrentCCWeek ? '#fff' : secondaryBgText
                    }}
                  >
                    {ccGame ? (isWin ? 'W' : 'L') : isCurrentCCWeek ? 'NEXT' : 'CC'}
                  </div>

                  {/* Game Info */}
                  <div
                    className="flex-1 flex items-center justify-between py-2 sm:py-3 px-2 sm:px-4 rounded-r-xl min-w-0"
                    style={{ backgroundColor: hasOpponent ? ccOpponentColors.backgroundColor : '#6b7280' }}
                  >
                    <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 flex-1">
                      {/* Location Badge */}
                      <span
                        className="w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[9px] sm:text-xs font-bold flex-shrink-0"
                        style={{
                          backgroundColor: `${hasOpponent ? ccOpponentColors.textColor : '#fff'}15`,
                          color: hasOpponent ? ccOpponentColors.textColor : '#fff'
                        }}
                      >
                        vs
                      </span>

                      {/* Team Logo */}
                      {ccOpponentLogo && (
                        <div
                          className="w-7 h-7 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-white"
                          style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.1)', padding: '3px' }}
                        >
                          <img
                            src={ccOpponentLogo}
                            alt={`${ccOpponentName} logo`}
                            className="w-full h-full object-contain"
                          />
                        </div>
                      )}

                      {/* Team Name */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          {ccGame?.opponentRank && (
                            <span className="text-[9px] sm:text-xs font-bold px-1 sm:px-1.5 py-0.5 rounded flex-shrink-0" style={{ backgroundColor: `${ccOpponentColors.textColor}15`, color: ccOpponentColors.textColor }}>
                              #{ccGame.opponentRank}
                            </span>
                          )}
                          <span className="text-xs sm:text-base font-semibold truncate" style={{ color: hasOpponent ? ccOpponentColors.textColor : '#fff' }}>
                            {ccOpponentName}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Score / Status */}
                    <div className="flex-shrink-0 text-right ml-1">
                      {ccGame ? (() => {
                        // Get scores from perspective (unified) or legacy fields
                        const userScore = ccGame.perspective?.userScore ?? ccGame.teamScore
                        const opponentScore = ccGame.perspective?.opponentScore ?? ccGame.opponentScore
                        const hasScores = userScore != null && opponentScore != null
                        return hasScores ? (
                          <div className="text-sm sm:text-lg font-bold tabular-nums" style={{ color: ccOpponentColors.textColor }}>
                            {Math.max(userScore, opponentScore)}-{Math.min(userScore, opponentScore)}
                            {ccGame.overtimes && ccGame.overtimes.length > 0 && (
                              <span className="ml-0.5 text-[8px] sm:text-xs font-medium opacity-60">
                                {ccGame.overtimes.length > 1 ? `${ccGame.overtimes.length}OT` : 'OT'}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs sm:text-sm font-medium" style={{ color: ccOpponentColors.textColor, opacity: 0.5 }}>—</span>
                        )
                      })() : (
                        <span className="text-xs sm:text-sm font-medium" style={{ color: hasOpponent ? ccOpponentColors.textColor : '#fff', opacity: 0.5 }}>
                          —
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )

              if (ccGame?.id) {
                return (
                  <Link
                    to={`${pathPrefix}/game/${ccGame.id}`}
                    className="block rounded-xl overflow-hidden hover:scale-[1.01] hover:shadow-lg transition-all duration-200"
                    style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                  >
                    {ccContent}
                  </Link>
                )
              }

              return (
                <div
                  className={`rounded-xl overflow-hidden ${isCurrentCCWeek ? 'animate-pulse-subtle' : ''}`}
                  style={{
                    boxShadow: isCurrentCCWeek
                      ? `0 2px 12px ${teamColors.primary}40`
                      : '0 2px 8px rgba(0,0,0,0.06)'
                  }}
                >
                  {ccContent}
                </div>
              )
            })()}

            {/* Bowl Game - shows when user has a bowl game (NOT CFP teams) */}
            {(() => {
              // Don't show Bowl section if user has a CFP First Round game (CFP IS their bowl)
              const userCFPFirstRoundGame = findCurrentTeamGame(currentDynasty, g => (g.isCFPFirstRound || g.gameType === GAME_TYPES.CFP_FIRST_ROUND) && isSameYear(g.year, currentDynasty.currentYear))
              if (userCFPFirstRoundGame) return null

              const userBowlGameData = findCurrentTeamGame(currentDynasty, g => g.isBowlGame && isSameYear(g.year, currentDynasty.currentYear))
              const bowlData = currentDynasty.bowlEligibilityData
              const hasBowlEligibility = bowlData?.eligible === true && bowlData?.bowlGame && bowlData?.opponent

              // Also skip if bowl eligibility data points to a CFP game
              if (hasBowlEligibility && bowlData?.bowlGame?.startsWith('CFP')) return null

              // Only show if user has a bowl game (either played or scheduled via eligibility)
              if (!userBowlGameData && !hasBowlEligibility) return null

              // Get opponent abbr from perspective (unified format) or fall back to bowl data
              const bowlOpponentInfo = userBowlGameData?.perspective?.opponentTid ? getGameTeamInfo(currentDynasty?.teams || TEAMS, userBowlGameData.perspective.opponentTid) : null
              const bowlOpponentAbbr = bowlOpponentInfo?.abbr || bowlData?.opponent
              const bowlGameName = userBowlGameData?.bowlName || bowlData?.bowlGame
              const hasOpponent = !!bowlOpponentAbbr
              const bowlOpponentColors = hasOpponent ? getOpponentColors(bowlOpponentAbbr) : { backgroundColor: '#6b7280', textColor: '#ffffff' }
              const mascotFromAbbr = hasOpponent ? getMascotName(bowlOpponentAbbr) : null
              const bowlMascotName = mascotFromAbbr || (hasOpponent && getTeamLogo(bowlOpponentAbbr) ? bowlOpponentAbbr : null)
              const bowlOpponentName = bowlMascotName || (hasOpponent ? getTeamNameFromAbbr(bowlOpponentAbbr) : 'Opponent Unknown')
              const bowlOpponentLogo = bowlMascotName ? getTeamLogo(bowlMascotName) : null
              const isWin = userBowlGameData?.perspective?.userWon

              const bowlContent = (
                <div className="flex items-center w-full overflow-hidden">
                  {/* Week Badge */}
                  <div
                    className="w-10 sm:w-14 flex-shrink-0 text-center py-2 sm:py-3 rounded-l-xl font-bold text-[10px] sm:text-sm"
                    style={{
                      backgroundColor: userBowlGameData
                        ? (isWin ? '#22c55e' : '#ef4444')
                        : `${secondaryBgText}15`,
                      color: userBowlGameData ? '#fff' : secondaryBgText
                    }}
                  >
                    {userBowlGameData ? (isWin ? 'W' : 'L') : 'Bowl'}
                  </div>

                  {/* Game Info */}
                  <div
                    className="flex-1 flex items-center justify-between py-2 sm:py-3 px-2 sm:px-4 rounded-r-xl min-w-0"
                    style={{ backgroundColor: hasOpponent ? bowlOpponentColors.backgroundColor : '#6b7280' }}
                  >
                    <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 flex-1">
                      {/* Location Badge */}
                      <span
                        className="w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[9px] sm:text-xs font-bold flex-shrink-0"
                        style={{
                          backgroundColor: `${hasOpponent ? bowlOpponentColors.textColor : '#fff'}15`,
                          color: hasOpponent ? bowlOpponentColors.textColor : '#fff'
                        }}
                      >
                        vs
                      </span>

                      {/* Team Logo */}
                      {bowlOpponentLogo && (
                        <div
                          className="w-7 h-7 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-white"
                          style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.1)', padding: '3px' }}
                        >
                          <img
                            src={bowlOpponentLogo}
                            alt={`${bowlOpponentName} logo`}
                            className="w-full h-full object-contain"
                          />
                        </div>
                      )}

                      {/* Team Name */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          {userBowlGameData?.opponentRank && (
                            <span className="text-[9px] sm:text-xs font-bold px-1 sm:px-1.5 py-0.5 rounded flex-shrink-0" style={{ backgroundColor: `${bowlOpponentColors.textColor}15`, color: bowlOpponentColors.textColor }}>
                              #{userBowlGameData.opponentRank}
                            </span>
                          )}
                          <span className="text-xs sm:text-base font-semibold truncate" style={{ color: hasOpponent ? bowlOpponentColors.textColor : '#fff' }}>
                            {bowlOpponentName}
                          </span>
                        </div>
                        <span className="text-[9px] sm:text-xs opacity-70 truncate block" style={{ color: hasOpponent ? bowlOpponentColors.textColor : '#fff' }}>
                          {bowlGameName}
                        </span>
                      </div>
                    </div>

                    {/* Score / Status */}
                    <div className="flex-shrink-0 text-right ml-1">
                      {userBowlGameData ? (() => {
                        // Get scores from perspective (unified) or legacy fields
                        const userScore = userBowlGameData.perspective?.userScore ?? userBowlGameData.teamScore
                        const opponentScore = userBowlGameData.perspective?.opponentScore ?? userBowlGameData.opponentScore
                        const hasScores = userScore != null && opponentScore != null
                        return hasScores ? (
                          <div className="text-sm sm:text-lg font-bold tabular-nums" style={{ color: bowlOpponentColors.textColor }}>
                            {Math.max(userScore, opponentScore)}-{Math.min(userScore, opponentScore)}
                            {userBowlGameData.overtimes && userBowlGameData.overtimes.length > 0 && (
                              <span className="ml-0.5 text-[8px] sm:text-xs font-medium opacity-60">
                                {userBowlGameData.overtimes.length > 1 ? `${userBowlGameData.overtimes.length}OT` : 'OT'}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs sm:text-sm font-medium" style={{ color: bowlOpponentColors.textColor, opacity: 0.5 }}>—</span>
                        )
                      })() : (
                        <span className="text-xs sm:text-sm font-medium" style={{ color: hasOpponent ? bowlOpponentColors.textColor : '#fff', opacity: 0.5 }}>
                          —
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )

              if (userBowlGameData?.id) {
                return (
                  <Link
                    to={`${pathPrefix}/game/${userBowlGameData.id}`}
                    className="block rounded-xl overflow-hidden hover:scale-[1.01] hover:shadow-lg transition-all duration-200"
                    style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                  >
                    {bowlContent}
                  </Link>
                )
              }

              return (
                <div
                  className="rounded-xl overflow-hidden"
                  style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                >
                  {bowlContent}
                </div>
              )
            })()}

            {/* CFP First Round Game - shows when user played in First Round */}
            {(() => {
              const cfpFirstRoundGame = findCurrentTeamGame(currentDynasty, g => (g.isCFPFirstRound || g.gameType === GAME_TYPES.CFP_FIRST_ROUND) && isSameYear(g.year, currentDynasty.currentYear))
              if (!cfpFirstRoundGame) return null

              // Get opponent abbr from perspective (unified format)
              const cfpOpponentInfo = cfpFirstRoundGame.perspective?.opponentTid ? getGameTeamInfo(currentDynasty?.teams || TEAMS, cfpFirstRoundGame.perspective.opponentTid) : null
              const cfpOpponentAbbr = cfpOpponentInfo?.abbr
              const hasOpponent = !!cfpOpponentAbbr
              const cfpOpponentColors = hasOpponent ? getOpponentColors(cfpOpponentAbbr) : { backgroundColor: '#6b7280', textColor: '#ffffff' }
              const mascotFromAbbr = hasOpponent ? getMascotName(cfpOpponentAbbr) : null
              const cfpMascotName = mascotFromAbbr || (hasOpponent && getTeamLogo(cfpOpponentAbbr) ? cfpOpponentAbbr : null)
              const cfpOpponentName = cfpMascotName || (hasOpponent ? getTeamNameFromAbbr(cfpOpponentAbbr) : 'Opponent Unknown')
              const cfpOpponentLogo = cfpMascotName ? getTeamLogo(cfpMascotName) : null
              const isWin = cfpFirstRoundGame.perspective?.userWon

              const cfpContent = (
                <div className="flex items-center w-full overflow-hidden">
                  {/* Week Badge */}
                  <div
                    className="w-10 sm:w-14 flex-shrink-0 text-center py-2 sm:py-3 rounded-l-xl font-bold text-[10px] sm:text-sm"
                    style={{
                      backgroundColor: isWin ? '#22c55e' : '#ef4444',
                      color: '#fff'
                    }}
                  >
                    {isWin ? 'W' : 'L'}
                  </div>

                  {/* Game Info */}
                  <div
                    className="flex-1 flex items-center justify-between py-2 sm:py-3 px-2 sm:px-4 rounded-r-xl min-w-0"
                    style={{ backgroundColor: hasOpponent ? cfpOpponentColors.backgroundColor : '#6b7280' }}
                  >
                    <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 flex-1">
                      {/* Location Badge */}
                      <span
                        className="w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[9px] sm:text-xs font-bold flex-shrink-0"
                        style={{
                          backgroundColor: `${hasOpponent ? cfpOpponentColors.textColor : '#fff'}15`,
                          color: hasOpponent ? cfpOpponentColors.textColor : '#fff'
                        }}
                      >
                        vs
                      </span>

                      {/* Team Logo */}
                      {cfpOpponentLogo && (
                        <div
                          className="w-7 h-7 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-white"
                          style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.1)', padding: '3px' }}
                        >
                          <img
                            src={cfpOpponentLogo}
                            alt={`${cfpOpponentName} logo`}
                            className="w-full h-full object-contain"
                          />
                        </div>
                      )}

                      {/* Team Name */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs sm:text-base font-semibold truncate" style={{ color: hasOpponent ? cfpOpponentColors.textColor : '#fff' }}>
                            {cfpOpponentName}
                          </span>
                        </div>
                        <span className="text-[9px] sm:text-xs opacity-70 truncate block" style={{ color: hasOpponent ? cfpOpponentColors.textColor : '#fff' }}>
                          CFP First Round
                        </span>
                      </div>
                    </div>

                    {/* Score */}
                    <div className="flex-shrink-0 text-right ml-1">
                      {(() => {
                        // Get scores from perspective (unified) or legacy fields
                        const userScore = cfpFirstRoundGame.perspective?.userScore ?? cfpFirstRoundGame.teamScore
                        const opponentScore = cfpFirstRoundGame.perspective?.opponentScore ?? cfpFirstRoundGame.opponentScore
                        const hasScores = userScore != null && opponentScore != null
                        return hasScores ? (
                          <div className="text-sm sm:text-lg font-bold tabular-nums" style={{ color: cfpOpponentColors.textColor }}>
                            {Math.max(userScore, opponentScore)}-{Math.min(userScore, opponentScore)}
                          </div>
                        ) : (
                          <span className="text-xs sm:text-sm font-medium" style={{ color: cfpOpponentColors.textColor, opacity: 0.5 }}>—</span>
                        )
                      })()}
                    </div>
                  </div>
                </div>
              )

              return (
                <Link
                  to={`${pathPrefix}/game/${cfpFirstRoundGame.id}`}
                  className="block rounded-xl overflow-hidden hover:scale-[1.01] hover:shadow-lg transition-all duration-200"
                  style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                >
                  {cfpContent}
                </Link>
              )
            })()}

            {/* CFP Quarterfinal Game - shows when user played in Quarterfinal */}
            {(() => {
              const cfpQFGame = findCurrentTeamGame(currentDynasty, g => (g.isCFPQuarterfinal || g.gameType === GAME_TYPES.CFP_QUARTERFINAL) && isSameYear(g.year, currentDynasty.currentYear))
              if (!cfpQFGame) return null

              // Get opponent abbr from perspective (unified format)
              const cfpOpponentInfo = cfpQFGame.perspective?.opponentTid ? getGameTeamInfo(currentDynasty?.teams || TEAMS, cfpQFGame.perspective.opponentTid) : null
              const cfpOpponentAbbr = cfpOpponentInfo?.abbr
              const hasOpponent = !!cfpOpponentAbbr
              const cfpOpponentColors = hasOpponent ? getOpponentColors(cfpOpponentAbbr) : { backgroundColor: '#6b7280', textColor: '#ffffff' }
              const mascotFromAbbr = hasOpponent ? getMascotName(cfpOpponentAbbr) : null
              const cfpMascotName = mascotFromAbbr || (hasOpponent && getTeamLogo(cfpOpponentAbbr) ? cfpOpponentAbbr : null)
              const cfpOpponentName = cfpMascotName || (hasOpponent ? getTeamNameFromAbbr(cfpOpponentAbbr) : 'Opponent Unknown')
              const cfpOpponentLogo = cfpMascotName ? getTeamLogo(cfpMascotName) : null
              const bowlName = cfpQFGame.bowlName || 'CFP Quarterfinal'
              const isWin = cfpQFGame.perspective?.userWon

              const cfpContent = (
                <div className="flex items-center w-full overflow-hidden">
                  <div
                    className="w-10 sm:w-14 flex-shrink-0 text-center py-2 sm:py-3 rounded-l-xl font-bold text-[10px] sm:text-sm"
                    style={{ backgroundColor: isWin ? '#22c55e' : '#ef4444', color: '#fff' }}
                  >
                    {isWin ? 'W' : 'L'}
                  </div>
                  <div
                    className="flex-1 flex items-center justify-between py-2 sm:py-3 px-2 sm:px-4 rounded-r-xl min-w-0"
                    style={{ backgroundColor: hasOpponent ? cfpOpponentColors.backgroundColor : '#6b7280' }}
                  >
                    <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 flex-1">
                      <span className="w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[9px] sm:text-xs font-bold flex-shrink-0" style={{ backgroundColor: `${hasOpponent ? cfpOpponentColors.textColor : '#fff'}15`, color: hasOpponent ? cfpOpponentColors.textColor : '#fff' }}>vs</span>
                      {cfpOpponentLogo && (
                        <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-white" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.1)', padding: '3px' }}>
                          <img src={cfpOpponentLogo} alt={`${cfpOpponentName} logo`} className="w-full h-full object-contain" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <span className="text-xs sm:text-base font-semibold truncate block" style={{ color: hasOpponent ? cfpOpponentColors.textColor : '#fff' }}>{cfpOpponentName}</span>
                        <span className="text-[9px] sm:text-xs opacity-70 truncate block" style={{ color: hasOpponent ? cfpOpponentColors.textColor : '#fff' }}>{bowlName}</span>
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right ml-1">
                      {(() => {
                        const userScore = cfpQFGame.perspective?.userScore ?? cfpQFGame.teamScore
                        const opponentScore = cfpQFGame.perspective?.opponentScore ?? cfpQFGame.opponentScore
                        const hasScores = userScore != null && opponentScore != null
                        return hasScores ? (
                          <div className="text-sm sm:text-lg font-bold tabular-nums" style={{ color: cfpOpponentColors.textColor }}>{Math.max(userScore, opponentScore)}-{Math.min(userScore, opponentScore)}</div>
                        ) : (
                          <span className="text-xs sm:text-sm font-medium" style={{ color: cfpOpponentColors.textColor, opacity: 0.5 }}>—</span>
                        )
                      })()}
                    </div>
                  </div>
                </div>
              )

              return (
                <Link to={`${pathPrefix}/game/${cfpQFGame.id}`} className="block rounded-xl overflow-hidden hover:scale-[1.01] hover:shadow-lg transition-all duration-200" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  {cfpContent}
                </Link>
              )
            })()}

            {/* CFP Semifinal Game - shows when user played in Semifinal */}
            {(() => {
              const cfpSFGame = findCurrentTeamGame(currentDynasty, g => g.isCFPSemifinal && isSameYear(g.year, currentDynasty.currentYear))
              if (!cfpSFGame) return null

              // Get opponent abbr from perspective (unified format)
              const cfpOpponentInfo = cfpSFGame.perspective?.opponentTid ? getGameTeamInfo(currentDynasty?.teams || TEAMS, cfpSFGame.perspective.opponentTid) : null
              const cfpOpponentAbbr = cfpOpponentInfo?.abbr
              const hasOpponent = !!cfpOpponentAbbr
              const cfpOpponentColors = hasOpponent ? getOpponentColors(cfpOpponentAbbr) : { backgroundColor: '#6b7280', textColor: '#ffffff' }
              const mascotFromAbbr = hasOpponent ? getMascotName(cfpOpponentAbbr) : null
              const cfpMascotName = mascotFromAbbr || (hasOpponent && getTeamLogo(cfpOpponentAbbr) ? cfpOpponentAbbr : null)
              const cfpOpponentName = cfpMascotName || (hasOpponent ? getTeamNameFromAbbr(cfpOpponentAbbr) : 'Opponent Unknown')
              const cfpOpponentLogo = cfpMascotName ? getTeamLogo(cfpMascotName) : null
              const bowlName = cfpSFGame.bowlName || 'CFP Semifinal'
              const isWin = cfpSFGame.perspective?.userWon

              const cfpContent = (
                <div className="flex items-center w-full overflow-hidden">
                  <div
                    className="w-10 sm:w-14 flex-shrink-0 text-center py-2 sm:py-3 rounded-l-xl font-bold text-[10px] sm:text-sm"
                    style={{ backgroundColor: isWin ? '#22c55e' : '#ef4444', color: '#fff' }}
                  >
                    {isWin ? 'W' : 'L'}
                  </div>
                  <div
                    className="flex-1 flex items-center justify-between py-2 sm:py-3 px-2 sm:px-4 rounded-r-xl min-w-0"
                    style={{ backgroundColor: hasOpponent ? cfpOpponentColors.backgroundColor : '#6b7280' }}
                  >
                    <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 flex-1">
                      <span className="w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[9px] sm:text-xs font-bold flex-shrink-0" style={{ backgroundColor: `${hasOpponent ? cfpOpponentColors.textColor : '#fff'}15`, color: hasOpponent ? cfpOpponentColors.textColor : '#fff' }}>vs</span>
                      {cfpOpponentLogo && (
                        <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-white" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.1)', padding: '3px' }}>
                          <img src={cfpOpponentLogo} alt={`${cfpOpponentName} logo`} className="w-full h-full object-contain" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <span className="text-xs sm:text-base font-semibold truncate block" style={{ color: hasOpponent ? cfpOpponentColors.textColor : '#fff' }}>{cfpOpponentName}</span>
                        <span className="text-[9px] sm:text-xs opacity-70 truncate block" style={{ color: hasOpponent ? cfpOpponentColors.textColor : '#fff' }}>{bowlName}</span>
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right ml-1">
                      {(() => {
                        const userScore = cfpSFGame.perspective?.userScore ?? cfpSFGame.teamScore
                        const opponentScore = cfpSFGame.perspective?.opponentScore ?? cfpSFGame.opponentScore
                        const hasScores = userScore != null && opponentScore != null
                        return hasScores ? (
                          <div className="text-sm sm:text-lg font-bold tabular-nums" style={{ color: cfpOpponentColors.textColor }}>{Math.max(userScore, opponentScore)}-{Math.min(userScore, opponentScore)}</div>
                        ) : (
                          <span className="text-xs sm:text-sm font-medium" style={{ color: cfpOpponentColors.textColor, opacity: 0.5 }}>—</span>
                        )
                      })()}
                    </div>
                  </div>
                </div>
              )

              return (
                <Link to={`${pathPrefix}/game/${cfpSFGame.id}`} className="block rounded-xl overflow-hidden hover:scale-[1.01] hover:shadow-lg transition-all duration-200" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  {cfpContent}
                </Link>
              )
            })()}

            {/* CFP Championship Game - shows when user played in Championship */}
            {(() => {
              const cfpChampGame = findCurrentTeamGame(currentDynasty, g => g.isCFPChampionship && isSameYear(g.year, currentDynasty.currentYear))
              if (!cfpChampGame) return null

              // Get opponent abbr from perspective (unified format)
              const cfpOpponentInfo = cfpChampGame.perspective?.opponentTid ? getGameTeamInfo(currentDynasty?.teams || TEAMS, cfpChampGame.perspective.opponentTid) : null
              const cfpOpponentAbbr = cfpOpponentInfo?.abbr
              const hasOpponent = !!cfpOpponentAbbr
              const cfpOpponentColors = hasOpponent ? getOpponentColors(cfpOpponentAbbr) : { backgroundColor: '#6b7280', textColor: '#ffffff' }
              const mascotFromAbbr = hasOpponent ? getMascotName(cfpOpponentAbbr) : null
              const cfpMascotName = mascotFromAbbr || (hasOpponent && getTeamLogo(cfpOpponentAbbr) ? cfpOpponentAbbr : null)
              const cfpOpponentName = cfpMascotName || (hasOpponent ? getTeamNameFromAbbr(cfpOpponentAbbr) : 'Opponent Unknown')
              const cfpOpponentLogo = cfpMascotName ? getTeamLogo(cfpMascotName) : null
              const isWin = cfpChampGame.perspective?.userWon

              const cfpContent = (
                <div className="flex items-center w-full overflow-hidden">
                  <div
                    className="w-10 sm:w-14 flex-shrink-0 text-center py-2 sm:py-3 rounded-l-xl font-bold text-[10px] sm:text-sm"
                    style={{ backgroundColor: isWin ? '#22c55e' : '#ef4444', color: '#fff' }}
                  >
                    {isWin ? 'W' : 'L'}
                  </div>
                  <div
                    className="flex-1 flex items-center justify-between py-2 sm:py-3 px-2 sm:px-4 rounded-r-xl min-w-0"
                    style={{ backgroundColor: hasOpponent ? cfpOpponentColors.backgroundColor : '#6b7280' }}
                  >
                    <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 flex-1">
                      <span className="w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[9px] sm:text-xs font-bold flex-shrink-0" style={{ backgroundColor: `${hasOpponent ? cfpOpponentColors.textColor : '#fff'}15`, color: hasOpponent ? cfpOpponentColors.textColor : '#fff' }}>vs</span>
                      {cfpOpponentLogo && (
                        <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-white" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.1)', padding: '3px' }}>
                          <img src={cfpOpponentLogo} alt={`${cfpOpponentName} logo`} className="w-full h-full object-contain" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <span className="text-xs sm:text-base font-semibold truncate block" style={{ color: hasOpponent ? cfpOpponentColors.textColor : '#fff' }}>{cfpOpponentName}</span>
                        <span className="text-[9px] sm:text-xs opacity-70 truncate block" style={{ color: hasOpponent ? cfpOpponentColors.textColor : '#fff' }}>National Championship</span>
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right ml-1">
                      {(() => {
                        const userScore = cfpChampGame.perspective?.userScore ?? cfpChampGame.teamScore
                        const opponentScore = cfpChampGame.perspective?.opponentScore ?? cfpChampGame.opponentScore
                        const hasScores = userScore != null && opponentScore != null
                        return hasScores ? (
                          <div className="text-sm sm:text-lg font-bold tabular-nums" style={{ color: cfpOpponentColors.textColor }}>{Math.max(userScore, opponentScore)}-{Math.min(userScore, opponentScore)}</div>
                        ) : (
                          <span className="text-xs sm:text-sm font-medium" style={{ color: cfpOpponentColors.textColor, opacity: 0.5 }}>—</span>
                        )
                      })()}
                    </div>
                  </div>
                </div>
              )

              return (
                <Link to={`${pathPrefix}/game/${cfpChampGame.id}`} className="block rounded-xl overflow-hidden hover:scale-[1.01] hover:shadow-lg transition-all duration-200" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  {cfpContent}
                </Link>
              )
            })()}
          </div>
        ) : (
          <div className="text-center py-12">
            <div style={{ color: secondaryBgText, opacity: 0.5 }} className="mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium mb-2" style={{ color: secondaryBgText }}>
              No Schedule Yet
            </h3>
            <p style={{ color: secondaryBgText, opacity: 0.8 }}>
              Add your season schedule to get started.
            </p>
          </div>
        )}
        </div>
      </div>

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

            // UNIFIED STORAGE: Save bowl games to games[] array only
            // saveCPUBowlGames handles user game preservation internally
            await saveCPUBowlGames(currentDynasty.id, sanitizedBowlGames, year, 'week1')

            // UNIFIED STORAGE: Save CFP First Round games to games[] array only
            // saveCFPGames handles user game preservation internally
            if (cfpFirstRound.length > 0) {
              await saveCFPGames(currentDynasty.id, cfpFirstRound, year, GAME_TYPES.CFP_FIRST_ROUND)
            }
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
            const cfpQuarterfinals = cfpQuarterfinalGames.map(game => {
              const sanitized = sanitizeGame(game)
              // Extract bowl name (e.g., "Cotton Bowl" from "Cotton Bowl (CFP QF)")
              const bowlMatch = game.bowlName?.match(/^(.+?)\s*\(CFP/)
              const bowlName = bowlMatch ? bowlMatch[1].trim() : sanitized.bowlName
              return {
                bowlName,
                team1: sanitized.team1,
                team2: sanitized.team2,
                team1Score: sanitized.team1Score,
                team2Score: sanitized.team2Score,
                winner: sanitized.winner
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
        onSave={async (seeds) => {
          const year = currentDynasty.currentYear
          const existingByYear = currentDynasty.cfpSeedsByYear || {}
          await updateDynasty(currentDynasty.id, {
            cfpSeedsByYear: {
              ...existingByYear,
              [year]: seeds
            }
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
          const year = Number(currentDynasty.currentYear)

          // Update each player's statsByYear with gamesPlayed/snapsPlayed
          const updatedPlayers = (currentDynasty.players || []).map(player => {
            // Find this player's stats in the returned array
            const playerStats = stats.find(s =>
              s.pid === player.pid ||
              (s.name && player.name && s.name.toLowerCase().trim() === player.name.toLowerCase().trim())
            )

            if (!playerStats) return player

            const existingStatsByYear = { ...(player.statsByYear || {}) }
            existingStatsByYear[year] = {
              ...(existingStatsByYear[year] || {}),
              gamesPlayed: playerStats.gamesPlayed,
              snapsPlayed: playerStats.snapsPlayed
            }

            return { ...player, statsByYear: existingStatsByYear }
          })

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
              'XP Made': 'xpm', 'XP Attempted': 'xpa', Kickoffs: 'kickoffs', Touchbacks: 'touchbacks'
            },
            punting: {
              Punts: 'punts', 'Punting Yards': 'yds', 'Net Punting Yards': 'netYds',
              'Punts Inside 20': 'in20', 'Punt Long': 'lng', Touchbacks: 'tb'
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
            const existingYearStats = existingStatsByYear[year] || existingStatsByYear[Number(year)] || {}

            // Deep merge: preserve gamesPlayed, snapsPlayed, and merge each category
            const mergedYearStats = { ...existingYearStats }
            Object.entries(detailedPlayerStats).forEach(([category, newCategoryStats]) => {
              const existingCategoryStats = existingYearStats[category] || {}
              mergedYearStats[category] = {
                ...existingCategoryStats,
                ...newCategoryStats
              }
            })

            return {
              ...player,
              statsByYear: {
                ...existingStatsByYear,
                [year]: mergedYearStats
              }
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
          await updateDynasty(currentDynasty.id, {
            conferenceStandingsByYear: {
              ...existingByYear,
              [year]: standings
            }
          })
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

      {/* All-Americans & All-Conference Entry Modal (End of Season Recap) */}
      <AllAmericansModal
        isOpen={showAllAmericansModal}
        onClose={() => setShowAllAmericansModal(false)}
        onSave={handleAllAmericansSave}
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
          const returningPlayers = allPlayers.filter(p => {
            if (leavingPids.has(p.pid)) return false
            if (p.isRecruit) return false
            if (p.isHonorOnly) return false
            const wasOnTeamLastYear = matchesTeam(p.teamsByYear?.[offseasonDataYear] ?? p.teamsByYear?.[String(offseasonDataYear)])
            const isOnTeamThisYear = matchesTeam(p.teamsByYear?.[currentYear] ?? p.teamsByYear?.[String(currentYear)])
            return wasOnTeamLastYear && isOnTeamThisYear
          })

          // Get PORTAL TRANSFERS who joined this offseason
          const portalTransfers = allPlayers.filter(p => {
            if (leavingPids.has(p.pid)) return false
            if (p.isHonorOnly) return false
            const isPortalTransfer = (p.isPortal || p.previousTeam) && p.recruitYear === offseasonDataYear
            if (!isPortalTransfer) return false
            const isOnTeamThisYear = matchesTeam(p.teamsByYear?.[currentYear] ?? p.teamsByYear?.[String(currentYear)])
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
          const teamAbbr = getCurrentTeamAbbr(currentDynasty)
          const recruitingCommitmentsAll = currentDynasty?.recruitingCommitmentsByTeamYear?.[teamAbbr]?.[offseasonDataYear] || {}
          const transfers = []
          Object.values(recruitingCommitmentsAll).forEach(weekCommitments => {
            if (Array.isArray(weekCommitments)) {
              weekCommitments.forEach(c => {
                // Check isPortal flag and class field (commitments use 'class', not 'year')
                const playerClass = c.class || c.year
                if (c.isPortal && playerClass) {
                  // Only include Fr, So, Jr (not Sr) as they need class assignment
                  const baseClass = playerClass.replace('RS ', '')
                  if (['Fr', 'So', 'Jr'].includes(baseClass)) {
                    transfers.push({
                      name: c.name,
                      position: c.position,
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
          const teamAbbr = getCurrentTeamAbbr(currentDynasty)
          const year = offseasonDataYear

          // Get all players and filter for fringe cases
          const allPlayers = currentDynasty?.players || []
          return allPlayers.filter(player => {
            // Must have been on the team for this year
            const playerTeamThisYear = player.teamsByYear?.[year] || player.team
            if (playerTeamThisYear !== teamAbbr) return false

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
          const teamAbbr = getCurrentTeamAbbr(currentDynasty)
          const teamTid = getTidFromAbbr(teamAbbr)
          // ALWAYS use tid for teamsByYear storage - tid is the single source of truth
          const teamsByYearValue = teamTid || teamAbbr // Fallback to abbr only if tid lookup fails
          const year = currentDynasty?.currentYear
          const isDev = import.meta.env.VITE_DEV_MODE === 'true'

          // Get previously encouraged transfers (to restore them first if user is editing)
          const previouslyEncouraged = currentDynasty?.encourageTransfersByTeamYear?.[teamAbbr]?.[year] || []
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
                [year]: teamsByYearValue
              }
              return {
                ...player,
                teamsByYear: restoredTeamsByYear
              }
            }

            // Case 2: Is NOW encouraged - REMOVE from roster (delete teamsByYear entry)
            if (isNowEncouraged) {
              const updatedTeamsByYear = { ...(player.teamsByYear || {}) }
              delete updatedTeamsByYear[year]
              delete updatedTeamsByYear[String(year)]
              return {
                ...player,
                teamsByYear: updatedTeamsByYear
              }
            }

            // Case 3: Not involved - return unchanged
            return player
          })

          if (isDev || !user) {
            // Dev mode - store encouraged transfers using team-centric pattern
            const existingByTeamYear = currentDynasty?.encourageTransfersByTeamYear || {}
            const teamTransfers = existingByTeamYear[teamAbbr] || {}
            await updateDynasty(currentDynasty.id, {
              encourageTransfersByTeamYear: {
                ...existingByTeamYear,
                [teamAbbr]: {
                  ...teamTransfers,
                  [year]: transferPlayers
                }
              },
              players: updatedPlayers
            })
          } else {
            // Production mode - use dot notation for Firestore
            await updateDynasty(currentDynasty.id, {
              [`encourageTransfersByTeamYear.${teamAbbr}.${year}`]: transferPlayers,
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
          const recruitingCommitments = currentDynasty?.recruitingCommitmentsByTeamYear?.[teamAbbr]?.[currentDynasty?.currentYear] || {}
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
