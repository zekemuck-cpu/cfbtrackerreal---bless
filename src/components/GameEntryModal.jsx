import { useState, useEffect, useRef, useMemo } from 'react'
import { useDynasty, getCurrentTeamRatings, getCurrentRoster, GAME_TYPES, getCurrentCustomConferences, getCurrentSchedule } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { getTeamLogo, getMascotName } from '../data/teams'
import { getModalColors } from '../utils/colorUtils'
import { teamAbbreviations } from '../data/teamAbbreviations'
import { getCurrentTeamAbbr, getCurrentTeamTid, getTidFromAbbr, getGameTeamInfo, TEAMS, getAbbrFromTeamName } from '../data/teamRegistry'
import { getTeamConference } from '../data/conferenceTeams'
import { generateRandomBoxScore } from '../data/boxScoreConstants'
import { getFullRecapPrompt } from '../services/geminiService'
import { isSameWeek } from '../utils/compareUtils'
import BoxScoreSheetModal from './BoxScoreSheetModal'
import { useToast } from './ui/Toast'
import { useConfirm } from './ui/ConfirmDialog'

export default function GameEntryModal({
  isOpen,
  onClose,
  onSave,
  weekNumber,
  currentYear,
  teamColors,
  opponent: passedOpponent,
  isConferenceChampionship,
  existingGame,
  bowlName,
  minimalMode,
  // Backward compatibility props (used by TeamYear, CFPBracket)
  team1: passedTeam1,
  team2: passedTeam2,
  existingTeam1Score,
  existingTeam2Score,
  existingGameNote,
  existingLinks,
  // Team context override - when editing from a team page, use this instead of user's current team
  viewingTeamTid,
  viewingTeamAbbr
}) {
  const { currentDynasty, addGame } = useDynasty()
  const { user } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  // Get team-centric team ratings
  const teamRatings = getCurrentTeamRatings(currentDynasty)
  const modalColors = useMemo(() => getModalColors(teamColors), [teamColors])

  // Determine effective team context - use viewing team if provided, otherwise user's current team
  // This allows editing games from any team's page without defaulting to user's current team
  const effectiveTeamTid = viewingTeamTid ?? getCurrentTeamTid(currentDynasty)
  const effectiveTeamAbbr = viewingTeamAbbr ?? getCurrentTeamAbbr(currentDynasty)
  const teamsSource = currentDynasty?.teams || TEAMS
  const effectiveTeamData = teamsSource[effectiveTeamTid]
  const effectiveTeamName = effectiveTeamData?.name || currentDynasty?.teamName || ''

  // Recap state — copy-prompt only, no live AI calls.
  const [recapError, setRecapError] = useState(null)
  const [promptCopied, setPromptCopied] = useState(false)

  // Detect if this is a CPU vs CPU game from existingGame or passed props
  // In unified model: CPU games have team1/team2 or team1Tid/team2Tid but NO userTeam AND NO opponent
  // User games always have opponent field (even CFP/bowl games with team1/team2 for unified format)
  const isCPUGame =
    (!existingGame?.userTeam && !existingGame?.opponent && (existingGame?.team1 && existingGame?.team2 || existingGame?.team1Tid && existingGame?.team2Tid)) || // Has team1/team2 or tid but no userTeam/opponent
    (passedTeam1 && passedTeam2 && !existingGame?.userTeam && !existingGame?.opponent) // Passed as CPU game via props

  // Merge existingGame with backward compat props (existingGame takes priority)
  // Note: No isCPUGame flag needed - CPU games are identified by absence of userTeam
  const effectiveGame = existingGame ? existingGame : (passedTeam1 && passedTeam2 ? {
    team1: passedTeam1,
    team2: passedTeam2,
    team1Score: existingTeam1Score,
    team2Score: existingTeam2Score,
    gameNote: existingGameNote,
    links: existingLinks
  } : null)

  // Use existing game's week if available, otherwise use passed weekNumber
  const actualWeekNumber = existingGame?.week ?? (isConferenceChampionship ? 'CC' : (currentDynasty?.currentPhase === 'regular_season' && weekNumber === 0 ? 1 : weekNumber))
  const actualYear = existingGame?.year ?? currentYear ?? currentDynasty?.currentYear

  // Helper to get the latest game data from dynasty (for box score syncing)
  // This ensures we don't lose previously synced data when syncing another part
  const getLatestGameData = () => {
    if (!existingGame?.id) return existingGame
    const games = currentDynasty?.games || []
    const latestGame = games.find(g => g.id === existingGame.id)
    return latestGame || existingGame
  }

  // Helper to update box score data directly without closing the modal
  // Used by nested BoxScoreSheetModals to save their data
  const updateBoxScoreDirectly = async (updatedGame) => {
    if (!currentDynasty?.id) return
    await addGame(currentDynasty.id, updatedGame)
  }

  // Auto-save form before opening stats modals (for existing games only)
  // This saves user's work-in-progress so they don't lose changes
  const autoSaveAndOpenModal = async (openModalFn) => {
    // For existing games with valid scores, save current form state first
    if (existingGame && gameData.teamScore && gameData.opponentScore) {
      const teamScore = parseInt(gameData.teamScore)
      const opponentScore = parseInt(gameData.opponentScore)

      if (!isNaN(teamScore) && !isNaN(opponentScore)) {
        const latestGame = getLatestGameData()
        const result = teamScore > opponentScore ? 'win' : 'loss'

        // Build minimal update with current form values
        const updatedGame = {
          ...latestGame,
          teamScore,
          opponentScore,
          result,
          userRank: gameData.userRank ? parseInt(gameData.userRank) : latestGame.userRank,
          opponentRank: gameData.opponentRank ? parseInt(gameData.opponentRank) : latestGame.opponentRank,
          opponentOverall: gameData.opponentOverall ? parseInt(gameData.opponentOverall) : latestGame.opponentOverall,
          opponentOffense: gameData.opponentOffense ? parseInt(gameData.opponentOffense) : latestGame.opponentOffense,
          opponentDefense: gameData.opponentDefense ? parseInt(gameData.opponentDefense) : latestGame.opponentDefense,
          gameNote: gameData.gameNote || latestGame.gameNote,
          aiRecap: gameData.aiRecap || latestGame.aiRecap,
        }

        try {
          await addGame(currentDynasty.id, updatedGame)
        } catch (error) {
          console.error('Auto-save failed:', error)
          // Continue anyway - don't block opening the modal
        }
      }
    }

    // Open the requested modal
    openModalFn(true)
  }

  // Find the scheduled game for this week (not for CC games)
  // Use getCurrentSchedule to get the team-centric schedule, not legacy dynasty.schedule
  const currentSchedule = getCurrentSchedule(currentDynasty)
  const scheduledGame = isConferenceChampionship ? null : currentSchedule?.find(g => isSameWeek(g.week, actualWeekNumber))

  // Get team mascot name (full team name) for logo lookup using tid-based lookup
  const getMascotName = (tidOrAbbr) => {
    const teamsSource = currentDynasty?.teams || TEAMS
    const teamInfo = getGameTeamInfo(teamsSource, tidOrAbbr)
    if (teamInfo) return teamInfo.name
    return null
  }

  // Get opponent team name from tid or abbreviation
  const getOpponentTeamName = (tidOrAbbr) => {
    const teamsSource = currentDynasty?.teams || TEAMS
    const teamInfo = getGameTeamInfo(teamsSource, tidOrAbbr)
    if (teamInfo) return teamInfo.name
    // Fallback to old lookup
    return teamAbbreviations[tidOrAbbr]?.name || tidOrAbbr
  }

  const [gameData, setGameData] = useState({
    opponent: scheduledGame?.opponent || '',
    location: scheduledGame?.location || 'home',
    teamScore: '',
    opponentScore: '',
    isConferenceGame: false,
    userRank: '',
    opponentRank: '',
    opponentOverall: '',
    opponentOffense: '',
    opponentDefense: '',
    overallRecord: '',
    conferenceRecord: '',
    gameNote: '',
    aiRecap: '',
    week: actualWeekNumber,
    year: currentYear,
    quarters: {
      team: { Q1: '', Q2: '', Q3: '', Q4: '' },
      opponent: { Q1: '', Q2: '', Q3: '', Q4: '' }
    },
    overtimes: [],
    // CPU game-specific fields
    team1Overall: '',
    team1Offense: '',
    team1Defense: '',
    team1Record: '',
    team2Overall: '',
    team2Offense: '',
    team2Defense: '',
    team2Record: '',
    team1Rank: '',
    team2Rank: ''
  })

  const [links, setLinks] = useState(['']) // Array of link strings
  const [showHomeStatsModal, setShowHomeStatsModal] = useState(false)
  const [showAwayStatsModal, setShowAwayStatsModal] = useState(false)
  const [showScoringModal, setShowScoringModal] = useState(false)
  const [showTeamStatsModal, setShowTeamStatsModal] = useState(false)
  const [tempGameId, setTempGameId] = useState(null) // Pre-generated ID for new games
  const [pendingHomeStats, setPendingHomeStats] = useState(null) // Home team stats for new games
  const [pendingAwayStats, setPendingAwayStats] = useState(null) // Away team stats for new games
  const [pendingScoringSummary, setPendingScoringSummary] = useState(null) // Scoring summary for new games
  const [pendingTeamStats, setPendingTeamStats] = useState(null) // Team stats for new games
  const [pendingSheetIds, setPendingSheetIds] = useState({}) // Sheet IDs for new games
  const [conferencePOW, setConferencePOW] = useState('') // Player name for conference offensive POW
  const [confDefensePOW, setConfDefensePOW] = useState('') // Player name for conference defensive POW
  const [nationalPOW, setNationalPOW] = useState('') // Player name for national offensive POW
  const [natlDefensePOW, setNatlDefensePOW] = useState('') // Player name for national defensive POW
  const [confPOWSearch, setConfPOWSearch] = useState('')
  const [confDefPOWSearch, setConfDefPOWSearch] = useState('')
  const [natlPOWSearch, setNatlPOWSearch] = useState('')
  const [natlDefPOWSearch, setNatlDefPOWSearch] = useState('')
  const [confPOWOpen, setConfPOWOpen] = useState(false)
  const [confDefPOWOpen, setConfDefPOWOpen] = useState(false)
  const [natlPOWOpen, setNatlPOWOpen] = useState(false)
  const [natlDefPOWOpen, setNatlDefPOWOpen] = useState(false)
  const [confPOWHighlight, setConfPOWHighlight] = useState(0)
  const [confDefPOWHighlight, setConfDefPOWHighlight] = useState(0)
  const [natlPOWHighlight, setNatlPOWHighlight] = useState(0)
  const [natlDefPOWHighlight, setNatlDefPOWHighlight] = useState(0)
  const [confPOWDropUp, setConfPOWDropUp] = useState(false)
  const [confDefPOWDropUp, setConfDefPOWDropUp] = useState(false)
  const [natlPOWDropUp, setNatlPOWDropUp] = useState(false)
  const [natlDefPOWDropUp, setNatlDefPOWDropUp] = useState(false)

  const confPOWRef = useRef(null)
  const confDefPOWRef = useRef(null)
  const natlPOWRef = useRef(null)
  const natlDefPOWRef = useRef(null)
  const confPOWDropdownRef = useRef(null)
  const confDefPOWDropdownRef = useRef(null)
  const natlPOWDropdownRef = useRef(null)
  const natlDefPOWDropdownRef = useRef(null)
  const formRef = useRef(null)

  // Determine if scores should be locked
  // Only allow editing if current phase/week is the same as the game OR one week after
  const isScoreLocked = (() => {
    // CPU games from CFP bracket are never locked (they can be edited anytime)
    if (isCPUGame) return false

    // Helper to get a numeric order for any phase/week combination
    const getOrder = (phase, week, gameFlags = {}) => {
      if (phase === 'preseason') return 0
      if (phase === 'regular_season') return week // 1-14
      if (phase === 'postseason') {
        // Postseason weeks 1-4 map to orders 15-18
        return 14 + week
      }
      if (phase === 'offseason') return 100
      return 0
    }

    // Get current dynasty position
    const currentPhase = currentDynasty?.currentPhase
    const currentWeek = currentDynasty?.currentWeek || 1
    const currentOrder = getOrder(currentPhase, currentWeek)

    // Determine this game's phase and week
    let gamePhase = 'regular_season'
    let gameWeek = actualWeekNumber

    if (isConferenceChampionship || bowlName ||
        weekNumber === 'CFP First Round' || weekNumber === 'CFP Quarterfinal' ||
        weekNumber === 'CFP Semifinal' || weekNumber === 'CFP Championship') {
      gamePhase = 'postseason'
      // Map CFP rounds to postseason weeks
      if (isConferenceChampionship || weekNumber === 'CFP First Round') {
        gameWeek = 1
      } else if (weekNumber === 'CFP Quarterfinal') {
        gameWeek = 2
      } else if (weekNumber === 'CFP Semifinal') {
        gameWeek = 3
      } else if (weekNumber === 'CFP Championship') {
        gameWeek = 4
      } else if (bowlName) {
        // Bowl games - try to get from passed existing game or default to week 1
        gameWeek = existingGame?.week || 1
      }
    }

    // Check if passed existing game has postseason flags
    if (existingGame) {
      if (existingGame.isConferenceChampionship || existingGame.isBowlGame ||
          existingGame.isCFPFirstRound || existingGame.isCFPQuarterfinal ||
          existingGame.isCFPSemifinal || existingGame.isCFPChampionship) {
        gamePhase = 'postseason'
        if (existingGame.isCFPFirstRound || existingGame.isConferenceChampionship) gameWeek = 1
        else if (existingGame.isCFPQuarterfinal) gameWeek = 2
        else if (existingGame.isCFPSemifinal) gameWeek = 3
        else if (existingGame.isCFPChampionship) gameWeek = 4
        else if (existingGame.isBowlGame) gameWeek = existingGame.week || 1
      }
    }

    const gameOrder = getOrder(gamePhase, gameWeek)

    // Allow editing only if current is same week or 1 week ahead (just advanced)
    // Locked if current is more than 1 week ahead of the game
    return currentOrder > gameOrder + 1
  })()

  // Get list of player names for selection (current roster only)
  const playerNames = getCurrentRoster(currentDynasty)
    .map(p => p.name)
    .sort()

  // Filter players based on search
  const filteredConfPlayers = playerNames.filter(name =>
    name.toLowerCase().includes(confPOWSearch.toLowerCase())
  )
  const filteredConfDefPlayers = playerNames.filter(name =>
    name.toLowerCase().includes(confDefPOWSearch.toLowerCase())
  )
  const filteredNatlPlayers = playerNames.filter(name =>
    name.toLowerCase().includes(natlPOWSearch.toLowerCase())
  )
  const filteredNatlDefPlayers = playerNames.filter(name =>
    name.toLowerCase().includes(natlDefPOWSearch.toLowerCase())
  )

  // Reset sheet modal states when main modal opens/closes to prevent flash on reopen
  useEffect(() => {
    if (!isOpen) {
      setShowHomeStatsModal(false)
      setShowAwayStatsModal(false)
      setShowScoringModal(false)
      setShowTeamStatsModal(false)
    }
  }, [isOpen])

  // Handle click outside for dropdowns
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (confPOWDropdownRef.current && !confPOWDropdownRef.current.contains(event.target)) {
        setConfPOWOpen(false)
      }
      if (confDefPOWDropdownRef.current && !confDefPOWDropdownRef.current.contains(event.target)) {
        setConfDefPOWOpen(false)
      }
      if (natlPOWDropdownRef.current && !natlPOWDropdownRef.current.contains(event.target)) {
        setNatlPOWOpen(false)
      }
      if (natlDefPOWDropdownRef.current && !natlDefPOWDropdownRef.current.contains(event.target)) {
        setNatlDefPOWOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Reset highlight when search changes
  useEffect(() => {
    setConfPOWHighlight(0)
  }, [confPOWSearch])

  useEffect(() => {
    setConfDefPOWHighlight(0)
  }, [confDefPOWSearch])

  useEffect(() => {
    setNatlPOWHighlight(0)
  }, [natlPOWSearch])

  useEffect(() => {
    setNatlDefPOWHighlight(0)
  }, [natlDefPOWSearch])

  // Check if dropdown should open upward
  const checkDropdownPosition = (inputRef, setDropUp) => {
    if (!inputRef.current) return

    const inputRect = inputRef.current.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const spaceBelow = viewportHeight - inputRect.bottom
    const spaceAbove = inputRect.top
    const dropdownHeight = 240 // max-h-60 = 15rem = 240px

    // If not enough space below but more space above, drop up
    if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
      setDropUp(true)
    } else {
      setDropUp(false)
    }
  }

  // Player selection handlers
  const handleConfPOWSelect = (playerName) => {
    setConferencePOW(playerName)
    setConfPOWSearch('')
    setConfPOWOpen(false)
  }

  const handleNatlPOWSelect = (playerName) => {
    setNationalPOW(playerName)
    setNatlPOWSearch('')
    setNatlPOWOpen(false)
  }

  const handleConfPOWKeyDown = (e) => {
    if (!confPOWOpen && (e.key === 'Enter' || e.key === 'ArrowDown')) {
      e.preventDefault()
      setConfPOWOpen(true)
      return
    }

    if (!confPOWOpen) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        e.stopPropagation()
        setConfPOWHighlight(prev =>
          prev < filteredConfPlayers.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        e.stopPropagation()
        setConfPOWHighlight(prev => prev > 0 ? prev - 1 : 0)
        break
      case 'Enter':
        e.preventDefault()
        e.stopPropagation()
        if (filteredConfPlayers[confPOWHighlight]) {
          handleConfPOWSelect(filteredConfPlayers[confPOWHighlight])
        }
        break
      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        setConfPOWOpen(false)
        setConfPOWSearch('')
        break
      case 'Tab':
        // Allow Tab to work normally but close the dropdown
        setConfPOWOpen(false)
        break
      default:
        break
    }
  }

  const handleNatlPOWKeyDown = (e) => {
    if (!natlPOWOpen && (e.key === 'Enter' || e.key === 'ArrowDown')) {
      e.preventDefault()
      setNatlPOWOpen(true)
      return
    }

    if (!natlPOWOpen) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        e.stopPropagation()
        setNatlPOWHighlight(prev =>
          prev < filteredNatlPlayers.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        e.stopPropagation()
        setNatlPOWHighlight(prev => prev > 0 ? prev - 1 : 0)
        break
      case 'Enter':
        e.preventDefault()
        e.stopPropagation()
        if (filteredNatlPlayers[natlPOWHighlight]) {
          handleNatlPOWSelect(filteredNatlPlayers[natlPOWHighlight])
        }
        break
      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        setNatlPOWOpen(false)
        setNatlPOWSearch('')
        break
      case 'Tab':
        // Allow Tab to work normally but close the dropdown
        setNatlPOWOpen(false)
        break
      default:
        break
    }
  }

  // Defensive POW handlers
  const handleConfDefPOWSelect = (playerName) => {
    setConfDefensePOW(playerName)
    setConfDefPOWSearch('')
    setConfDefPOWOpen(false)
  }

  const handleNatlDefPOWSelect = (playerName) => {
    setNatlDefensePOW(playerName)
    setNatlDefPOWSearch('')
    setNatlDefPOWOpen(false)
  }

  const handleConfDefPOWKeyDown = (e) => {
    if (!confDefPOWOpen && (e.key === 'Enter' || e.key === 'ArrowDown')) {
      e.preventDefault()
      setConfDefPOWOpen(true)
      return
    }

    if (!confDefPOWOpen) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        e.stopPropagation()
        setConfDefPOWHighlight(prev =>
          prev < filteredConfDefPlayers.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        e.stopPropagation()
        setConfDefPOWHighlight(prev => prev > 0 ? prev - 1 : 0)
        break
      case 'Enter':
        e.preventDefault()
        e.stopPropagation()
        if (filteredConfDefPlayers[confDefPOWHighlight]) {
          handleConfDefPOWSelect(filteredConfDefPlayers[confDefPOWHighlight])
        }
        break
      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        setConfDefPOWOpen(false)
        setConfDefPOWSearch('')
        break
      case 'Tab':
        setConfDefPOWOpen(false)
        break
      default:
        break
    }
  }

  const handleNatlDefPOWKeyDown = (e) => {
    if (!natlDefPOWOpen && (e.key === 'Enter' || e.key === 'ArrowDown')) {
      e.preventDefault()
      setNatlDefPOWOpen(true)
      return
    }

    if (!natlDefPOWOpen) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        e.stopPropagation()
        setNatlDefPOWHighlight(prev =>
          prev < filteredNatlDefPlayers.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        e.stopPropagation()
        setNatlDefPOWHighlight(prev => prev > 0 ? prev - 1 : 0)
        break
      case 'Enter':
        e.preventDefault()
        e.stopPropagation()
        if (filteredNatlDefPlayers[natlDefPOWHighlight]) {
          handleNatlDefPOWSelect(filteredNatlDefPlayers[natlDefPOWHighlight])
        }
        break
      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        setNatlDefPOWOpen(false)
        setNatlDefPOWSearch('')
        break
      case 'Tab':
        setNatlDefPOWOpen(false)
        break
      default:
        break
    }
  }

  // Check if any quarter has been filled
  const hasQuarterScores = () => {
    const { team, opponent } = gameData.quarters
    return Object.values(team).some(v => v !== '') || Object.values(opponent).some(v => v !== '')
  }

  // Auto-sum quarter scores
  const calculateTotalFromQuarters = (side, quarters = gameData.quarters, overtimes = gameData.overtimes) => {
    let total = 0
    Object.values(quarters[side]).forEach(score => {
      if (score !== '') total += parseInt(score) || 0
    })

    // Add overtime scores for this side
    overtimes.forEach(ot => {
      const score = ot[side]
      if (score !== '') total += parseInt(score) || 0
    })

    return total
  }

  // Check if all quarters are filled and regulation is tied - returns OT array if needed
  const getOvertimesForQuarters = (quarters, existingOvertimes) => {
    const allQuartersFilled =
      quarters.team.Q1 !== '' && quarters.team.Q2 !== '' &&
      quarters.team.Q3 !== '' && quarters.team.Q4 !== '' &&
      quarters.opponent.Q1 !== '' && quarters.opponent.Q2 !== '' &&
      quarters.opponent.Q3 !== '' && quarters.opponent.Q4 !== ''

    if (!allQuartersFilled) return existingOvertimes

    // Calculate regulation totals (without OT)
    let teamTotal = 0
    let opponentTotal = 0
    Object.values(quarters.team).forEach(score => {
      if (score !== '') teamTotal += parseInt(score) || 0
    })
    Object.values(quarters.opponent).forEach(score => {
      if (score !== '') opponentTotal += parseInt(score) || 0
    })

    if (teamTotal === opponentTotal) {
      // Tied - need OT
      if (!existingOvertimes || existingOvertimes.length === 0) {
        return [{ team: '', opponent: '' }]
      }
      return existingOvertimes
    }
    // Not tied - no OT needed
    return []
  }

  // Handle quarter score change
  const handleQuarterChange = (side, quarter, value) => {
    const newQuarters = {
      ...gameData.quarters,
      [side]: {
        ...gameData.quarters[side],
        [quarter]: value
      }
    }

    const newGameData = {
      ...gameData,
      quarters: newQuarters
    }

    // Auto-calculate totals if quarters are being used
    if (hasQuarterScores() || value !== '') {
      newGameData.teamScore = calculateTotalFromQuarters('team', newQuarters, gameData.overtimes).toString()
      newGameData.opponentScore = calculateTotalFromQuarters('opponent', newQuarters, gameData.overtimes).toString()
    }

    // Check if all quarters are filled
    const allQuartersFilled =
      newQuarters.team.Q1 !== '' && newQuarters.team.Q2 !== '' &&
      newQuarters.team.Q3 !== '' && newQuarters.team.Q4 !== '' &&
      newQuarters.opponent.Q1 !== '' && newQuarters.opponent.Q2 !== '' &&
      newQuarters.opponent.Q3 !== '' && newQuarters.opponent.Q4 !== ''

    if (allQuartersFilled) {
      // Calculate regulation-only totals (no OT)
      const teamRegulation = calculateTotalFromQuarters('team', newQuarters, [])
      const opponentRegulation = calculateTotalFromQuarters('opponent', newQuarters, [])

      if (teamRegulation === opponentRegulation) {
        // Regulation is tied - add OT1 if none exists
        if (gameData.overtimes.length === 0) {
          newGameData.overtimes = [{ team: '', opponent: '' }]
        }
      } else {
        // Regulation is NOT tied - clear any OT data
        newGameData.overtimes = []
        // Recalculate totals without OT
        newGameData.teamScore = teamRegulation.toString()
        newGameData.opponentScore = opponentRegulation.toString()
      }
    } else {
      // Not all quarters filled yet - clear OT
      if (gameData.overtimes.length > 0) {
        newGameData.overtimes = []
      }
    }

    setGameData(newGameData)
  }

  // Handle overtime score change
  const handleOvertimeChange = (index, side, value) => {
    const newOvertimes = [...gameData.overtimes]
    newOvertimes[index] = {
      ...newOvertimes[index],
      [side]: value
    }

    const newGameData = {
      ...gameData,
      overtimes: newOvertimes
    }

    // Auto-calculate totals
    newGameData.teamScore = calculateTotalFromQuarters('team', gameData.quarters, newOvertimes).toString()
    newGameData.opponentScore = calculateTotalFromQuarters('opponent', gameData.quarters, newOvertimes).toString()

    setGameData(newGameData)

    // Auto-add next OT if this OT is filled and scores are still tied
    const currentOT = newOvertimes[index]
    if (currentOT.team !== '' && currentOT.opponent !== '') {
      const teamTotal = calculateTotalFromQuarters('team', gameData.quarters, newOvertimes)
      const opponentTotal = calculateTotalFromQuarters('opponent', gameData.quarters, newOvertimes)

      if (teamTotal === opponentTotal && index === newOvertimes.length - 1) {
        setTimeout(() => {
          setGameData(prev => ({
            ...prev,
            overtimes: [...prev.overtimes, { team: '', opponent: '' }]
          }))
        }, 100)
      }
    }
  }


  // Load existing game data or scheduled game data when modal opens
  useEffect(() => {
    if (isOpen) {
      // SIMPLE APPROACH: If existingGame or effectiveGame is provided, use it directly
      const gameToLoad = effectiveGame
      if (gameToLoad) {
        // Get teams source for tid lookups
        const teamsSource = currentDynasty?.teams || TEAMS

        // CPU games (!userTeam AND !opponent with team1/team2 or team1Tid/team2Tid) use team1Score/team2Score; user games use teamScore/opponentScore
        const isCPUGameData = !gameToLoad.userTeam && !gameToLoad.opponent &&
          ((gameToLoad.team1 && gameToLoad.team2) || (gameToLoad.team1Tid && gameToLoad.team2Tid))
        const teamScore = isCPUGameData ? gameToLoad.team1Score : gameToLoad.teamScore
        const oppScore = isCPUGameData ? gameToLoad.team2Score : gameToLoad.opponentScore

        // Derive team abbreviations from tids if needed (for unified format games)
        const team1FromTid = gameToLoad.team1Tid ? getGameTeamInfo(teamsSource, gameToLoad.team1Tid)?.abbr : null
        const team2FromTid = gameToLoad.team2Tid ? getGameTeamInfo(teamsSource, gameToLoad.team2Tid)?.abbr : null
        const derivedTeam1 = gameToLoad.team1 || team1FromTid
        const derivedTeam2 = gameToLoad.team2 || team2FromTid
        const derivedOpponent = gameToLoad.opponent || derivedTeam2 || ''

        // Parse opponent record into parts
        let overallRecord = ''
        let conferenceRecord = ''
        if (gameToLoad.opponentRecord) {
          const overallMatch = gameToLoad.opponentRecord.match(/^(\d+-\d+)/)
          const confMatch = gameToLoad.opponentRecord.match(/\((\d+-\d+)\)/)
          overallRecord = overallMatch ? overallMatch[1] : ''
          conferenceRecord = confMatch ? confMatch[1] : ''
        }

        // For CFP First Round without location, determine from seeds
        // Use effectiveTeamTid (from viewing context) rather than user's current team
        let effectiveLocation = gameToLoad.location || 'neutral'
        if (!gameToLoad.location && (gameToLoad.isCFPFirstRound || gameToLoad.gameType === 'cfp_first_round' || bowlName === 'CFP First Round')) {
          const cfpSeeds = currentDynasty?.cfpSeedsByYear?.[gameToLoad.year || actualYear] || []
          const teamSeed = cfpSeeds.find(s => s.tid === effectiveTeamTid)?.seed
          const opponentTid = gameToLoad.team2Tid || gameToLoad.opponentTid
          const oppSeed = cfpSeeds.find(s => s.tid === opponentTid)?.seed
          if (teamSeed && oppSeed) {
            effectiveLocation = teamSeed < oppSeed ? 'home' : 'away'
          }
        }

        // For unified format, derive location from homeTeamTid if not set
        // Use effectiveTeamTid (from viewing context) rather than user's current team
        const isUnifiedFormat = gameToLoad.team1Tid !== undefined && gameToLoad.team2Tid !== undefined
        if (!gameToLoad.location && isUnifiedFormat && !isCPUGameData) {
          if (gameToLoad.homeTeamTid === null) {
            effectiveLocation = 'neutral'
          } else if (gameToLoad.homeTeamTid === effectiveTeamTid) {
            effectiveLocation = 'home'
          } else {
            effectiveLocation = 'away'
          }
        }

        // For unified format, team1 is user and team2 is opponent (for non-CPU games)
        const userRank = isUnifiedFormat && !isCPUGameData ? gameToLoad.team1Rank : gameToLoad.userRank
        const oppRank = isUnifiedFormat && !isCPUGameData ? gameToLoad.team2Rank : gameToLoad.opponentRank
        const oppOverall = isUnifiedFormat && !isCPUGameData ? gameToLoad.team2Overall : gameToLoad.opponentOverall
        const oppOffense = isUnifiedFormat && !isCPUGameData ? gameToLoad.team2Offense : gameToLoad.opponentOffense
        const oppDefense = isUnifiedFormat && !isCPUGameData ? gameToLoad.team2Defense : gameToLoad.opponentDefense

        setGameData({
          opponent: derivedOpponent,
          location: effectiveLocation,
          teamScore: teamScore?.toString() || '',
          opponentScore: oppScore?.toString() || '',
          isConferenceGame: gameToLoad.isConferenceGame || isConferenceChampionship || false,
          userRank: userRank?.toString() || '',
          opponentRank: oppRank?.toString() || '',
          opponentOverall: oppOverall?.toString() || '',
          opponentOffense: oppOffense?.toString() || '',
          opponentDefense: oppDefense?.toString() || '',
          overallRecord: overallRecord,
          conferenceRecord: conferenceRecord,
          gameNote: gameToLoad.gameNote || '',
          aiRecap: gameToLoad.aiRecap || '',
          week: gameToLoad.week ?? actualWeekNumber,
          year: gameToLoad.year ?? actualYear,
          quarters: gameToLoad.quarters || {
            team: { Q1: '', Q2: '', Q3: '', Q4: '' },
            opponent: { Q1: '', Q2: '', Q3: '', Q4: '' }
          },
          overtimes: getOvertimesForQuarters(
            gameToLoad.quarters || { team: { Q1: '', Q2: '', Q3: '', Q4: '' }, opponent: { Q1: '', Q2: '', Q3: '', Q4: '' } },
            gameToLoad.overtimes || []
          ),
          // CPU game-specific fields
          team1Overall: gameToLoad.team1Overall?.toString() || '',
          team1Offense: gameToLoad.team1Offense?.toString() || '',
          team1Defense: gameToLoad.team1Defense?.toString() || '',
          team1Record: gameToLoad.team1Record || '',
          team2Overall: gameToLoad.team2Overall?.toString() || '',
          team2Offense: gameToLoad.team2Offense?.toString() || '',
          team2Defense: gameToLoad.team2Defense?.toString() || '',
          team2Record: gameToLoad.team2Record || '',
          team1Rank: gameToLoad.team1Rank?.toString() || '',
          team2Rank: gameToLoad.team2Rank?.toString() || ''
        })

        // Load links
        if (gameToLoad.links) {
          const linkArray = gameToLoad.links.split(',').map(link => link.trim()).filter(link => link)
          setLinks(linkArray.length > 0 ? [...linkArray, ''] : [''])
        } else {
          setLinks([''])
        }

        // Load Player of the Week selections
        setConferencePOW(gameToLoad.conferencePOW || '')
        setConfDefensePOW(gameToLoad.confDefensePOW || '')
        setNationalPOW(gameToLoad.nationalPOW || '')
        setNatlDefensePOW(gameToLoad.natlDefensePOW || '')
        setConfPOWSearch('')
        setConfDefPOWSearch('')
        setNatlPOWSearch('')
        setNatlDefPOWSearch('')
        setConfPOWOpen(false)
        setConfDefPOWOpen(false)
        setNatlPOWOpen(false)
        setNatlDefPOWOpen(false)
        return
      }

      // No existingGame - check if we can find one in dynasty's games array
      // Use effectiveTeamTid (from viewing context) for filtering, not user's current team

      const foundGame = minimalMode ? null : (isConferenceChampionship
        ? currentDynasty?.games?.find(g =>
            g.isConferenceChampionship &&
            Number(g.year) === Number(actualYear) &&
            (g.userTid === effectiveTeamTid || g.team1Tid === effectiveTeamTid || g.team2Tid === effectiveTeamTid || g.userTeam === effectiveTeamAbbr))
        : currentDynasty?.games?.find(g =>
            Number(g.week) === Number(actualWeekNumber) &&
            Number(g.year) === Number(actualYear) &&
            (g.userTid === effectiveTeamTid || g.team1Tid === effectiveTeamTid || g.team2Tid === effectiveTeamTid || g.userTeam === effectiveTeamAbbr)))

      if (foundGame) {
        // Handle both unified format (team1Score/team2Score) and legacy format (teamScore/opponentScore)
        const isUnifiedFormat = foundGame.team1Tid !== undefined && foundGame.team2Tid !== undefined

        // For unified format, determine if user is team1 or team2
        // This is critical for CCG games where team order is arbitrary (not user-first)
        const isUserTeam1 = isUnifiedFormat ? foundGame.team1Tid === effectiveTeamTid : true

        // Map scores based on which team the user is
        const teamScore = isUnifiedFormat
          ? (isUserTeam1 ? foundGame.team1Score : foundGame.team2Score)
          : foundGame.teamScore
        const oppScore = isUnifiedFormat
          ? (isUserTeam1 ? foundGame.team2Score : foundGame.team1Score)
          : foundGame.opponentScore

        // Parse opponent record into parts
        let overallRecord = ''
        let conferenceRecord = ''
        const opponentRecord = isUnifiedFormat
          ? (isUserTeam1 ? (foundGame.team2Record || foundGame.opponentRecord) : (foundGame.team1Record || foundGame.opponentRecord))
          : foundGame.opponentRecord
        if (opponentRecord) {
          const overallMatch = opponentRecord.match(/^(\d+-\d+)/)
          const confMatch = opponentRecord.match(/\((\d+-\d+)\)/)
          overallRecord = overallMatch ? overallMatch[1] : ''
          conferenceRecord = confMatch ? confMatch[1] : ''
        }

        // For unified format, derive location from homeTeamTid
        // Use effectiveTeamTid (from viewing context) rather than user's current team
        let effectiveLocation = foundGame.location
        if (!effectiveLocation && isUnifiedFormat) {
          if (foundGame.homeTeamTid === null) {
            effectiveLocation = 'neutral'
          } else if (foundGame.homeTeamTid === effectiveTeamTid) {
            effectiveLocation = 'home'
          } else {
            effectiveLocation = 'away'
          }
        }

        // For unified format, map ranks/ratings based on which team user is
        const userRank = isUnifiedFormat
          ? (isUserTeam1 ? foundGame.team1Rank : foundGame.team2Rank)
          : foundGame.userRank
        const oppRank = isUnifiedFormat
          ? (isUserTeam1 ? foundGame.team2Rank : foundGame.team1Rank)
          : foundGame.opponentRank
        const oppOverall = isUnifiedFormat
          ? (isUserTeam1 ? foundGame.team2Overall : foundGame.team1Overall)
          : foundGame.opponentOverall
        const oppOffense = isUnifiedFormat
          ? (isUserTeam1 ? foundGame.team2Offense : foundGame.team1Offense)
          : foundGame.opponentOffense
        const oppDefense = isUnifiedFormat
          ? (isUserTeam1 ? foundGame.team2Defense : foundGame.team1Defense)
          : foundGame.opponentDefense

        // For unified format, derive opponent name from the other team's tid
        let opponentName = foundGame.opponent
        if (!opponentName && isUnifiedFormat) {
          const opponentTid = isUserTeam1 ? foundGame.team2Tid : foundGame.team1Tid
          if (opponentTid) {
            const oppTeam = currentDynasty?.teams?.[opponentTid]
            opponentName = oppTeam?.name || ''
          }
        }

        // Map quarters based on which team user is
        // quarters.team = team1's quarters, quarters.opponent = team2's quarters (when stored)
        // If user is team2, we need to swap them for display
        let mappedQuarters = foundGame.quarters || {
          team: { Q1: '', Q2: '', Q3: '', Q4: '' },
          opponent: { Q1: '', Q2: '', Q3: '', Q4: '' }
        }
        let mappedOvertimes = foundGame.overtimes || []
        if (isUnifiedFormat && !isUserTeam1 && foundGame.quarters) {
          // User is team2, so quarters.team has team1 (opponent) scores
          // Swap so that quarters.team = user's scores for display
          mappedQuarters = {
            team: foundGame.quarters.opponent || { Q1: '', Q2: '', Q3: '', Q4: '' },
            opponent: foundGame.quarters.team || { Q1: '', Q2: '', Q3: '', Q4: '' }
          }
          if (foundGame.overtimes && foundGame.overtimes.length > 0) {
            mappedOvertimes = foundGame.overtimes.map(ot => ({
              team: ot.opponent,
              opponent: ot.team
            }))
          }
        }

        setGameData({
          opponent: opponentName || '',
          location: effectiveLocation || 'home',
          teamScore: teamScore?.toString() || '',
          opponentScore: oppScore?.toString() || '',
          isConferenceGame: foundGame.isConferenceGame || isConferenceChampionship || false,
          userRank: userRank?.toString() || '',
          opponentRank: oppRank?.toString() || '',
          opponentOverall: oppOverall?.toString() || '',
          opponentOffense: oppOffense?.toString() || '',
          opponentDefense: oppDefense?.toString() || '',
          overallRecord: overallRecord,
          conferenceRecord: conferenceRecord,
          gameNote: foundGame.gameNote || '',
          aiRecap: foundGame.aiRecap || '',
          week: actualWeekNumber,
          year: actualYear,
          quarters: mappedQuarters,
          overtimes: getOvertimesForQuarters(mappedQuarters, mappedOvertimes)
        })

        // Load links
        if (foundGame.links) {
          const linkArray = foundGame.links.split(',').map(link => link.trim()).filter(link => link)
          setLinks(linkArray.length > 0 ? [...linkArray, ''] : [''])
        } else {
          setLinks([''])
        }

        setConferencePOW(foundGame.conferencePOW || '')
        setConfDefensePOW(foundGame.confDefensePOW || '')
        setNationalPOW(foundGame.nationalPOW || '')
        setNatlDefensePOW(foundGame.natlDefensePOW || '')
        setConfPOWSearch('')
        setConfDefPOWSearch('')
        setNatlPOWSearch('')
        setNatlDefPOWSearch('')
        setConfPOWOpen(false)
        setConfDefPOWOpen(false)
        setNatlPOWOpen(false)
        setNatlDefPOWOpen(false)
      } else if (scheduledGame || isConferenceChampionship || bowlName || passedOpponent) {
        // New game - load from schedule, CC opponent, or bowl opponent
        // For CFP First Round, higher seed hosts (lower number = higher seed)
        // Use effectiveTeamTid (from viewing context) rather than user's current team
        let cfpLocation = 'neutral'
        if (bowlName === 'CFP First Round') {
          const cfpSeeds = currentDynasty?.cfpSeedsByYear?.[actualYear] || []
          const teamSeed = cfpSeeds.find(s => s.tid === effectiveTeamTid)?.seed
          const opponentTid = getTidFromAbbr(passedOpponent, currentDynasty)
          const oppSeed = cfpSeeds.find(s => s.tid === opponentTid)?.seed
          if (teamSeed && oppSeed) {
            cfpLocation = teamSeed < oppSeed ? 'home' : 'away'
          }
        }
        setGameData(prev => ({
          ...prev,
          opponent: passedOpponent || scheduledGame?.opponent || '',
          location: isConferenceChampionship ? 'neutral' : (bowlName === 'CFP First Round' ? cfpLocation : (bowlName ? 'neutral' : (scheduledGame?.location || 'home'))),
          teamScore: '',
          opponentScore: '',
          isConferenceGame: isConferenceChampionship || false,
          userRank: '',
          opponentRank: '',
          opponentOverall: '',
          opponentOffense: '',
          opponentDefense: '',
          overallRecord: '',
          conferenceRecord: '',
          gameNote: '',
          aiRecap: '',
          quarters: {
            team: { Q1: '', Q2: '', Q3: '', Q4: '' },
            opponent: { Q1: '', Q2: '', Q3: '', Q4: '' }
          },
          overtimes: []
        }))
        setLinks([''])
        setConferencePOW('')
        setConfDefensePOW('')
        setNationalPOW('')
        setNatlDefensePOW('')
        setConfPOWSearch('')
        setConfDefPOWSearch('')
        setNatlPOWSearch('')
        setNatlDefPOWSearch('')
        setConfPOWOpen(false)
        setConfDefPOWOpen(false)
        setNatlPOWOpen(false)
        setNatlDefPOWOpen(false)
      }
    }
  }, [isOpen, scheduledGame, actualWeekNumber, actualYear, currentDynasty?.games, isConferenceChampionship, passedOpponent, effectiveGame, bowlName, minimalMode])

  // Generate a temporary game ID for new games (so we can create box score sheets before saving)
  useEffect(() => {
    if (isOpen && !effectiveGame && !tempGameId) {
      // Generate a unique ID for this new game
      const newId = `game-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      setTempGameId(newId)
    }
    // Reset all new game state when modal closes
    if (!isOpen) {
      setTempGameId(null)
      setPendingHomeStats(null)
      setPendingAwayStats(null)
      setPendingScoringSummary(null)
      setPendingSheetIds({})
    }
  }, [isOpen, effectiveGame, tempGameId])

  const handleLinkChange = (index, value) => {
    const newLinks = [...links]
    newLinks[index] = value

    // Add a new empty field if this is the last one and has content
    if (index === links.length - 1 && value.trim() !== '') {
      newLinks.push('')
    }

    setLinks(newLinks)
  }

  // Helper to validate record format (e.g., "10-2" or "5-3")
  const isValidRecordFormat = (value) => {
    if (!value || value.trim() === '') return true // Empty is valid
    return /^\d{1,2}-\d{1,2}$/.test(value.trim())
  }

  const handleSubmit = async (e) => {
    e.preventDefault()


    // Validate required fields
    if (!gameData.teamScore || !gameData.opponentScore) {
      toast.error('Please enter both team scores')
      return
    }

    // Convert numeric fields and validate
    const teamScore = parseInt(gameData.teamScore)
    const opponentScore = parseInt(gameData.opponentScore)

    if (isNaN(teamScore) || isNaN(opponentScore)) {
      toast.error('Please enter valid numeric scores')
      return
    }

    // Validate opponent records format
    if (!isValidRecordFormat(gameData.overallRecord)) {
      toast.error('Invalid overall record format. Use format like "10-2" or "5-3"')
      return
    }
    if (!isValidRecordFormat(gameData.conferenceRecord)) {
      toast.error('Invalid conference record format. Use format like "5-3" or "8-1"')
      return
    }

    // Validate conference record doesn't exceed overall
    if (gameData.overallRecord && gameData.conferenceRecord) {
      const overallMatch = gameData.overallRecord.match(/(\d+)-(\d+)/)
      const confMatch = gameData.conferenceRecord.match(/(\d+)-(\d+)/)

      if (overallMatch && confMatch) {
        const overallWins = parseInt(overallMatch[1])
        const overallLosses = parseInt(overallMatch[2])
        const confWins = parseInt(confMatch[1])
        const confLosses = parseInt(confMatch[2])

        const totalGames = overallWins + overallLosses
        const confGames = confWins + confLosses

        if (confGames > totalGames) {
          toast.error('Invalid record: Conference games (' + confGames + ') cannot exceed overall games (' + totalGames + ')')
          return
        }
      }
    }

    // Combine records into opponentRecord format for storage
    let opponentRecord = ''
    if (gameData.overallRecord && gameData.conferenceRecord) {
      opponentRecord = `${gameData.overallRecord} (${gameData.conferenceRecord})`
    } else if (gameData.overallRecord) {
      opponentRecord = gameData.overallRecord
    }

    // Filter out empty links and join them
    const filteredLinks = links.filter(link => link.trim() !== '').join(', ')

    // Auto-calculate result based on scores
    const result = teamScore > opponentScore ? 'win' : 'loss'

    // Auto-calculate favorite/underdog status
    const calculateFavoriteStatus = () => {
      const userRank = gameData.userRank ? parseInt(gameData.userRank) : null
      const opponentRank = gameData.opponentRank ? parseInt(gameData.opponentRank) : null
      const userOverall = teamRatings?.overall ? parseInt(teamRatings.overall) : null
      const opponentOverall = gameData.opponentOverall ? parseInt(gameData.opponentOverall) : null
      const isHomeTeam = gameData.location === 'home'
      const isNeutral = gameData.location === 'neutral'

      // If neutral site, no home advantage
      const homeAdvantageOverall = isNeutral ? 0 : 3
      const homeAdvantageRanking = isNeutral ? 0 : 5

      // Case 1: One ranked, one unranked - ranked team is favorite
      if (userRank && !opponentRank) {
        // User is ranked, opponent is not
        // Apply home advantage to ranking if opponent is home
        const adjustedUserRank = isHomeTeam ? userRank - homeAdvantageRanking : userRank
        return adjustedUserRank <= 25 ? 'favorite' : 'underdog' // If still ranked after adjustment, favorite
      } else if (!userRank && opponentRank) {
        // Opponent is ranked, user is not
        // Apply home advantage to ranking if user is home
        const adjustedOpponentRank = isHomeTeam ? opponentRank + homeAdvantageRanking : opponentRank
        return adjustedOpponentRank > 25 ? 'favorite' : 'underdog' // If opponent falls out of rankings, user is favorite
      }

      // Case 2: Both ranked - use rankings (lower is better)
      if (userRank && opponentRank) {
        const adjustedUserRank = isHomeTeam ? userRank - homeAdvantageRanking : userRank
        const adjustedOpponentRank = isHomeTeam ? opponentRank : opponentRank - homeAdvantageRanking

        if (adjustedUserRank < adjustedOpponentRank) {
          return 'favorite'
        } else if (adjustedUserRank > adjustedOpponentRank) {
          return 'underdog'
        } else {
          // Tie - home team wins
          return isHomeTeam ? 'favorite' : 'underdog'
        }
      }

      // Case 3: Both unranked - use overall ratings
      if (userOverall && opponentOverall) {
        const adjustedUserOverall = isHomeTeam ? userOverall + homeAdvantageOverall : userOverall
        const adjustedOpponentOverall = isHomeTeam ? opponentOverall : opponentOverall + homeAdvantageOverall

        if (adjustedUserOverall > adjustedOpponentOverall) {
          return 'favorite'
        } else if (adjustedUserOverall < adjustedOpponentOverall) {
          return 'underdog'
        } else {
          // Tie - home team wins
          return isHomeTeam ? 'favorite' : 'underdog'
        }
      }

      // Default: if we can't determine, return null
      return null
    }

    const favoriteStatus = calculateFavoriteStatus()

    // Determine if this is a conference game
    // Use effectiveTeamAbbr/Tid for new games; preserve original for existing games
    const teamAbbrForSave = effectiveGame?.team1 || effectiveTeamAbbr
    const teamTidForSave = effectiveGame?.team1Tid || effectiveTeamTid
    const rawOpponent = gameData.opponent || scheduledGame?.opponent
    const opponentAbbr = getAbbrFromTeamName(rawOpponent) || rawOpponent
    const opponentTid = effectiveGame?.team2Tid || getTidFromAbbr(opponentAbbr, currentDynasty)

    // Use custom conferences for auto-detection
    const customConferences = getCurrentCustomConferences(currentDynasty)
    const teamConference = getTeamConference(teamAbbrForSave, customConferences)
    const opponentConference = getTeamConference(opponentAbbr, customConferences)

    // Conference game if both teams are in the same conference (and not independents)
    // Conference Championship games are always conference games
    // Always recalculates based on current custom conferences
    const isConferenceGame = isConferenceChampionship ||
      (teamConference && opponentConference &&
       teamConference === opponentConference &&
       teamConference !== 'Independent')

    // Destructure to exclude overallRecord and conferenceRecord from the spread
    const { overallRecord: _or, conferenceRecord: _cr, ...restGameData } = gameData

    // For unified format games where user is team2, swap quarters back to team1/team2 format for saving
    // This prevents double-swapping on the next load (since load swaps and save would swap again)
    const isUnifiedFormatGame = effectiveGame?.team1Tid !== undefined && effectiveGame?.team2Tid !== undefined
    const isUserTeam1InOriginal = isUnifiedFormatGame ? effectiveGame.team1Tid === effectiveTeamTid : true
    let quartersForSave = gameData.quarters
    let overtimesForSave = gameData.overtimes
    if (isUnifiedFormatGame && !isUserTeam1InOriginal && gameData.quarters) {
      // User was team2 in original game, quarters were swapped on load for display
      // Swap back so quarters.team = team1 (opponent) scores, quarters.opponent = team2 (user) scores
      quartersForSave = {
        team: gameData.quarters.opponent,
        opponent: gameData.quarters.team
      }
      if (gameData.overtimes && gameData.overtimes.length > 0) {
        overtimesForSave = gameData.overtimes.map(ot => ({
          team: ot.opponent,
          opponent: ot.team
        }))
      }
    }

    // Helper to remove undefined values (Firestore doesn't accept undefined)
    const removeUndefined = (obj) => {
      return Object.fromEntries(
        Object.entries(obj).filter(([_, v]) => v !== undefined)
      )
    }

    // Determine gameType
    const gameType = (effectiveGame?.isCFPChampionship || weekNumber === 'CFP Championship') ? GAME_TYPES.CFP_CHAMPIONSHIP
      : (effectiveGame?.isCFPSemifinal || weekNumber === 'CFP Semifinal') ? GAME_TYPES.CFP_SEMIFINAL
      : (effectiveGame?.isCFPQuarterfinal || weekNumber === 'CFP Quarterfinal') ? GAME_TYPES.CFP_QUARTERFINAL
      : (effectiveGame?.isCFPFirstRound || weekNumber === 'CFP First Round') ? GAME_TYPES.CFP_FIRST_ROUND
      : (isConferenceChampionship || effectiveGame?.isConferenceChampionship) ? GAME_TYPES.CONFERENCE_CHAMPIONSHIP
      : (bowlName || effectiveGame?.isBowlGame) ? GAME_TYPES.BOWL
      : GAME_TYPES.REGULAR

    // Determine homeTeamTid based on location (for non-CPU games)
    // Neutral games (CC, bowl, CFP) have homeTeamTid = null
    // Use teamTidForSave (preserves original for existing games) rather than user's current team
    const isNeutralGame = gameType !== GAME_TYPES.REGULAR
    let homeTeamTid = null
    if (!isCPUGame) {
      if (isNeutralGame) {
        homeTeamTid = null
      } else if (gameData.location === 'home') {
        homeTeamTid = teamTidForSave
      } else if (gameData.location === 'away') {
        homeTeamTid = opponentTid
      } else {
        homeTeamTid = null  // neutral regular season game
      }
    }

    // UNIFIED GAME FORMAT: All games use team1Tid/team2Tid
    const processedData = removeUndefined({
      // CRITICAL: Include game ID so we know which game to update
      id: effectiveGame?.id || tempGameId,
      week: effectiveGame?.week ?? actualWeekNumber,
      year: effectiveGame?.year ?? actualYear,
      gameType,

      // UNIFIED TEAM FIELDS (tid only, no abbreviations)
      // Use teamTidForSave which preserves original team1Tid for existing games
      team1Tid: isCPUGame
        ? (effectiveGame?.team1Tid || getTidFromAbbr(effectiveGame?.team1, currentDynasty))
        : teamTidForSave,
      team2Tid: isCPUGame
        ? (effectiveGame?.team2Tid || getTidFromAbbr(effectiveGame?.team2, currentDynasty))
        : opponentTid,
      team1Score: teamScore,
      team2Score: opponentScore,

      // NOTE: No userTid - games are team-centric (team1Tid/team2Tid), not user-centric
      // The user's involvement is determined by checking if their team's tid matches team1Tid or team2Tid

      // Home/Away - who is home? (null = neutral)
      homeTeamTid: isCPUGame ? null : homeTeamTid,

      // Team metadata - stored by team position (team1/team2)
      team1Rank: isCPUGame
        ? (gameData.team1Rank ? parseInt(gameData.team1Rank) : null)
        : (gameData.userRank ? parseInt(gameData.userRank) : null),
      team2Rank: isCPUGame
        ? (gameData.team2Rank ? parseInt(gameData.team2Rank) : null)
        : (gameData.opponentRank ? parseInt(gameData.opponentRank) : null),
      team1Overall: isCPUGame
        ? (gameData.team1Overall ? parseInt(gameData.team1Overall) : null)
        : (teamRatings?.overall || null),
      team2Overall: isCPUGame
        ? (gameData.team2Overall ? parseInt(gameData.team2Overall) : null)
        : (gameData.opponentOverall ? parseInt(gameData.opponentOverall) : null),
      team1Offense: isCPUGame
        ? (gameData.team1Offense ? parseInt(gameData.team1Offense) : null)
        : (teamRatings?.offense || null),
      team2Offense: isCPUGame
        ? (gameData.team2Offense ? parseInt(gameData.team2Offense) : null)
        : (gameData.opponentOffense ? parseInt(gameData.opponentOffense) : null),
      team1Defense: isCPUGame
        ? (gameData.team1Defense ? parseInt(gameData.team1Defense) : null)
        : (teamRatings?.defense || null),
      team2Defense: isCPUGame
        ? (gameData.team2Defense ? parseInt(gameData.team2Defense) : null)
        : (gameData.opponentDefense ? parseInt(gameData.opponentDefense) : null),

      // Records (for CPU games)
      ...(isCPUGame && {
        team1Record: gameData.team1Record || null,
        team2Record: gameData.team2Record || null
      }),
      // For user games, store opponent record on team2
      ...(!isCPUGame && opponentRecord && { team2Record: opponentRecord }),

      // Game metadata
      links: filteredLinks,
      isConferenceGame: isConferenceGame,
      favoriteStatus: favoriteStatus !== undefined ? favoriteStatus : null,
      conferencePOW: conferencePOW || null,
      confDefensePOW: confDefensePOW || null,
      nationalPOW: nationalPOW || null,
      natlDefensePOW: natlDefensePOW || null,

      // Quarter-by-quarter scoring and overtime
      // Use quartersForSave/overtimesForSave which handles swap-back for unified format games
      quarters: quartersForSave,
      overtimes: overtimesForSave?.length > 0 ? overtimesForSave : null,

      // Preserve special game type flags for backward compat
      ...(effectiveGame?.bowlName && { bowlName: effectiveGame.bowlName }),
      ...((effectiveGame?.isConferenceChampionship || isConferenceChampionship) && { isConferenceChampionship: true }),
      ...((effectiveGame?.isCFPFirstRound || weekNumber === 'CFP First Round') && { isCFPFirstRound: true }),
      ...((effectiveGame?.isCFPQuarterfinal || weekNumber === 'CFP Quarterfinal') && { isCFPQuarterfinal: true }),
      ...((effectiveGame?.isCFPSemifinal || weekNumber === 'CFP Semifinal') && { isCFPSemifinal: true }),
      ...((effectiveGame?.isCFPChampionship || weekNumber === 'CFP Championship') && { isCFPChampionship: true }),
      ...((effectiveGame?.isBowlGame || bowlName) && { isBowlGame: true }),
      ...(bowlName && !effectiveGame?.bowlName && { bowlName: bowlName }),

      // Preserve AI recap and game note from restGameData
      ...(restGameData.aiRecap && { aiRecap: restGameData.aiRecap }),
      ...(restGameData.gameNote && { gameNote: restGameData.gameNote }),

      // Box score handling:
      // 1. If we have new pending data, use it
      // 2. If no pending data but existing game has boxScore, preserve it
      // 3. Otherwise, no boxScore
      ...((pendingHomeStats || pendingAwayStats || pendingScoringSummary || pendingTeamStats) ? {
        boxScore: {
          home: pendingHomeStats || {},
          away: pendingAwayStats || {},
          scoringSummary: pendingScoringSummary || [],
          teamStats: pendingTeamStats || null
        }
      } : effectiveGame?.boxScore ? {
        boxScore: effectiveGame.boxScore
      } : {}),
      // Sheet IDs - preserve existing or use new pending
      ...((pendingSheetIds.homeStatsSheetId || effectiveGame?.homeStatsSheetId) && {
        homeStatsSheetId: pendingSheetIds.homeStatsSheetId || effectiveGame.homeStatsSheetId
      }),
      ...((pendingSheetIds.awayStatsSheetId || effectiveGame?.awayStatsSheetId) && {
        awayStatsSheetId: pendingSheetIds.awayStatsSheetId || effectiveGame.awayStatsSheetId
      }),
      ...((pendingSheetIds.scoringSummarySheetId || effectiveGame?.scoringSummarySheetId) && {
        scoringSummarySheetId: pendingSheetIds.scoringSummarySheetId || effectiveGame.scoringSummarySheetId
      }),
      ...((pendingSheetIds.teamStatsSheetId || effectiveGame?.teamStatsSheetId) && {
        teamStatsSheetId: pendingSheetIds.teamStatsSheetId || effectiveGame.teamStatsSheetId
      })
    })


    try {
      await onSave(processedData)

      // Reset form
      setGameData({
        opponent: '',
        location: 'home',
        teamScore: '',
        opponentScore: '',
        isConferenceGame: false,
        userRank: '',
        opponentRank: '',
        opponentOverall: '',
        opponentOffense: '',
        opponentDefense: '',
        overallRecord: '',
        conferenceRecord: '',
        gameNote: '',
        aiRecap: '',
        week: actualWeekNumber,
        year: currentYear,
        quarters: {
          team: { Q1: '', Q2: '', Q3: '', Q4: '' },
          opponent: { Q1: '', Q2: '', Q3: '', Q4: '' }
        },
        overtimes: []
      })
      setLinks([''])
      setConferencePOW('')
      setConfDefensePOW('')
      setNationalPOW('')
      setNatlDefensePOW('')
      setConfPOWSearch('')
      setConfDefPOWSearch('')
      setNatlPOWSearch('')
      setNatlDefPOWSearch('')
      setConfPOWOpen(false)
      setConfDefPOWOpen(false)
      setNatlPOWOpen(false)
      setNatlDefPOWOpen(false)
      // Note: onClose() is called by parent's handleGameSave, don't call here to avoid race conditions
    } catch (error) {
      console.error('Error saving game:', error)
      toast.error('Error saving game. Please try again.')
      return
    }
  }

  // DEV: Random fill function for quick testing
  const handleRandomFill = () => {
    const randomScore = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

    // Generate random quarter scores
    const q1Team = randomScore(0, 14)
    const q2Team = randomScore(0, 21)
    const q3Team = randomScore(0, 14)
    const q4Team = randomScore(0, 21)
    const q1Opp = randomScore(0, 14)
    const q2Opp = randomScore(0, 21)
    const q3Opp = randomScore(0, 14)
    const q4Opp = randomScore(0, 21)

    const teamTotal = q1Team + q2Team + q3Team + q4Team
    const oppTotal = q1Opp + q2Opp + q3Opp + q4Opp

    // Make sure it's not a tie (would require OT handling)
    const finalTeamScore = teamTotal === oppTotal ? teamTotal + 7 : teamTotal

    // Generate random opponent records
    const oppWins = randomScore(0, 11)
    const oppLosses = randomScore(0, 11 - oppWins)
    const confWins = randomScore(0, Math.min(oppWins, 8))
    const confLosses = randomScore(0, Math.min(oppLosses, 8 - confWins))
    const overallRecord = `${oppWins}-${oppLosses}`
    const conferenceRecord = `${confWins}-${confLosses}`

    // Random national rankings (sometimes ranked, sometimes not)
    const userRank = Math.random() > 0.5 ? randomScore(1, 25).toString() : ''
    const oppRank = Math.random() > 0.6 ? randomScore(1, 25).toString() : ''

    setGameData(prev => ({
      ...prev,
      quarters: {
        team: { Q1: q1Team.toString(), Q2: q2Team.toString(), Q3: q3Team.toString(), Q4: q4Team.toString() },
        opponent: { Q1: q1Opp.toString(), Q2: q2Opp.toString(), Q3: q3Opp.toString(), Q4: q4Opp.toString() }
      },
      teamScore: finalTeamScore.toString(),
      opponentScore: oppTotal.toString(),
      userRank: userRank,
      opponentRank: oppRank,
      opponentOverall: randomScore(70, 95).toString(),
      opponentOffense: randomScore(70, 95).toString(),
      opponentDefense: randomScore(70, 95).toString(),
      overallRecord: overallRecord,
      conferenceRecord: conferenceRecord
    }))

    // Random player of the week (50% chance each for offense, 30% for defense)
    if (playerNames.length > 0) {
      const randomPlayer = () => playerNames[randomScore(0, playerNames.length - 1)]
      if (Math.random() > 0.5) {
        setConferencePOW(randomPlayer())
      }
      if (Math.random() > 0.7) { // Defensive is less common
        setConfDefensePOW(randomPlayer())
      }
      if (Math.random() > 0.7) { // National is rarer
        setNationalPOW(randomPlayer())
      }
      if (Math.random() > 0.85) { // National defensive is very rare
        setNatlDefensePOW(randomPlayer())
      }
    }

    // Generate random box score stats based on player positions
    const teamAbbrForBoxScore = effectiveTeamAbbr || effectiveTeamName || ''
    const rawOpp = gameData.opponent || scheduledGame?.opponent || 'OPP'
    const opponentAbbr = getAbbrFromTeamName(rawOpp) || rawOpp

    // Determine home/away based on location
    const isUserHome = gameData.location === 'home' || gameData.location === 'neutral'

    // Generate position-based box score
    const boxScore = generateRandomBoxScore(
      currentDynasty?.players || [],
      finalTeamScore,
      oppTotal,
      teamAbbrForBoxScore,
      opponentAbbr,
      currentDynasty?.currentYear,
      currentDynasty?.teams
    )

    // Adjust home/away based on actual game location
    if (isUserHome) {
      setPendingHomeStats(boxScore.home)
      setPendingAwayStats(boxScore.away)
    } else {
      // User is away team, so swap
      setPendingHomeStats(boxScore.away)
      setPendingAwayStats(boxScore.home)
    }
    setPendingScoringSummary(boxScore.scoringSummary)

    // Auto-submit after state updates
    setTimeout(() => {
      formRef.current?.requestSubmit()
    }, 100)
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-60 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4 backdrop-blur-sm"
      style={{ margin: 0 }}
      onMouseDown={onClose}
    >
      <div
        className="rounded-2xl shadow-2xl w-full max-w-4xl max-h-[calc(100dvh-4rem)] sm:max-h-[95dvh] flex flex-col overflow-hidden border"
        style={{ backgroundColor: 'var(--surface-2)', borderColor: 'var(--surface-4)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between z-10 gap-2"
          style={{
            backgroundColor: 'var(--surface-2)'
          }}
        >
          <div className="min-w-0 flex-1">
            <h2 className="text-base sm:text-2xl font-bold truncate" style={{ color: 'var(--text-primary)' }}>
              {isConferenceChampionship || effectiveGame?.isConferenceChampionship
                ? `${currentDynasty?.conference || effectiveGame?.conference || getTeamConference(effectiveTeamAbbr) || 'Conference'} Championship`
                : effectiveGame?.isCFPChampionship
                  ? 'National Championship'
                  : effectiveGame?.isCFPSemifinal
                    ? effectiveGame?.bowlName || 'CFP Semifinal'
                    : effectiveGame?.isCFPQuarterfinal
                      ? effectiveGame?.bowlName || 'CFP Quarterfinal'
                      : effectiveGame?.isCFPFirstRound
                        ? 'CFP First Round'
                        : bowlName || effectiveGame?.bowlName
                          ? bowlName || effectiveGame?.bowlName
                          : `Week ${actualWeekNumber} Game Entry`}
            </h2>
            {(() => {
              const teamsData = currentDynasty?.teams || currentDynasty?.customTeams
              if (isCPUGame) {
                // CPU vs CPU game - show both teams
                const team1Name = getMascotName(effectiveGame?.team1, teamsData) || getOpponentTeamName(effectiveGame?.team1)
                const team2Name = getMascotName(effectiveGame?.team2, teamsData) || getOpponentTeamName(effectiveGame?.team2)
                return (
                  <p className="text-xs sm:text-sm mt-0.5 sm:mt-1 truncate" style={{ color: 'var(--text-secondary)' }}>
                    {team1Name} vs {team2Name}
                  </p>
                )
              } else if (scheduledGame || isConferenceChampionship || passedOpponent) {
                const rawOppAbbr = passedOpponent || scheduledGame?.opponent
                const opponentAbbr = getAbbrFromTeamName(rawOppAbbr) || rawOppAbbr
                const opponentFullName = opponentAbbr ? (getMascotName(opponentAbbr, teamsData) || getOpponentTeamName(opponentAbbr)) : opponentAbbr
                return (
                  <p className="text-xs sm:text-sm mt-0.5 sm:mt-1 truncate" style={{ color: 'var(--text-secondary)' }}>
                    {isConferenceChampionship ? 'vs' : (scheduledGame?.location === 'away' ? '@' : 'vs')} {opponentFullName}
                  </p>
                )
              }
              return null
            })()}
          </div>
          <div className="flex items-center gap-1 sm:gap-3 flex-shrink-0">
            {/* DEV: Random Fill Button (HIDDEN - kept for future use) */}
            {false && (
              <button
                type="button"
                onClick={handleRandomFill}
                className="px-2 sm:px-3 py-1 rounded text-xs font-semibold hover:opacity-80 transition-opacity"
                style={{
                  backgroundColor: '#f59e0b',
                  color: '#000'
                }}
                title="DEV: Fill with random data"
              >
                <span className="hidden sm:inline">Random Fill</span>
                <span className="sm:hidden">Fill</span>
              </button>
            )}
            <button aria-label="Close"
              onClick={onClose}
              className="hover:opacity-70 p-1.5 rounded-full transition-colors"
              style={{ color: 'var(--text-primary)', backgroundColor: 'var(--surface-3)' }}
            >
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 sm:space-y-6 pb-4">
          {/* Score Section */}
          <div className="rounded-xl p-4 sm:p-5 shadow-sm" style={{ backgroundColor: 'var(--surface-3)', border: `1px solid ${'var(--surface-4)'}` }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base sm:text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                Final Score
              </h3>
              {isScoreLocked && (
                <span className="text-xs sm:text-sm px-2.5 py-1 bg-amber-900/30 text-amber-400 rounded-full flex items-center gap-1 font-medium">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Locked
                </span>
              )}
            </div>

            {/* Quarter by Quarter Scoring */}
            <div className="rounded-xl p-3 sm:p-4" style={{ backgroundColor: `${'var(--surface-2)'}80` }}>
              <h4 className="text-xs sm:text-sm font-semibold mb-2 sm:mb-3" style={{ color: 'var(--text-primary)' }}>
                Quarter by Quarter Scoring (Optional)
              </h4>

              <div className="overflow-x-auto -mx-2 sm:mx-0 px-2 sm:px-0">
                <div className="space-y-2 min-w-[360px]">
                {(() => {
                  // Determine team order based on location
                  // For CPU vs CPU games, use passed team1 and team2 (or derive from tid for unified format)
                  // Use effectiveTeamAbbr (from viewingTeamAbbr prop or user's current team) for non-CPU games
                  const teamsSourceLocal = currentDynasty?.teams || TEAMS
                  const team1AbbrFromTid = effectiveGame?.team1Tid ? getGameTeamInfo(teamsSourceLocal, effectiveGame.team1Tid)?.abbr : null
                  const team1Abbr = isCPUGame ? (effectiveGame?.team1 || team1AbbrFromTid) : effectiveTeamAbbr
                  // Ensure opponent is an abbreviation (convert full name if needed)
                  const team2AbbrFromTid = effectiveGame?.team2Tid ? getGameTeamInfo(teamsSourceLocal, effectiveGame.team2Tid)?.abbr : null
                  const rawOpponent = isCPUGame ? (effectiveGame?.team2 || team2AbbrFromTid) : (gameData.opponent || passedOpponent || scheduledGame?.opponent)
                  const team2Abbr = getAbbrFromTeamName(rawOpponent) || rawOpponent

                  const teamsData = currentDynasty?.teams || currentDynasty?.customTeams
                  const team1MascotName = team1Abbr ? getMascotName(team1Abbr, teamsData) : null
                  const team2MascotName = team2Abbr ? getMascotName(team2Abbr, teamsData) : null
                  const team1DisplayName = team1MascotName || (isCPUGame ? getOpponentTeamName(team1Abbr) : effectiveTeamName) || 'Team 1'
                  const team2DisplayName = team2MascotName || (team2Abbr ? getOpponentTeamName(team2Abbr) : 'Team 2')

                  // Get team logos
                  const team1Logo = team1MascotName ? getTeamLogo(team1MascotName, teamsData) : (isCPUGame ? null : getTeamLogo(effectiveTeamName, teamsData))
                  const team2Logo = team2MascotName ? getTeamLogo(team2MascotName, teamsData) : null

                  // Get team colors (check tid-based teams first)
                  const team1Info = team1Abbr ? getGameTeamInfo(teamsData || TEAMS, team1Abbr) : null
                  const team2Info = team2Abbr ? getGameTeamInfo(teamsData || TEAMS, team2Abbr) : null
                  const team1Colors = isCPUGame
                    ? { primary: team1Info?.primaryColor || teamAbbreviations[team1Abbr]?.backgroundColor || '#666' }
                    : teamColors
                  const team2Colors = { primary: team2Info?.primaryColor || teamAbbreviations[team2Abbr]?.backgroundColor || '#666' }

                  // For CPU games at neutral site, team1 on top, team2 on bottom
                  // For user games: Away team on top, home team on bottom
                  const isUserAway = gameData.location === 'away'
                  const topTeam = (isCPUGame || !isUserAway)
                    ? { name: team2DisplayName, key: 'opponent', colors: team2Colors, logo: team2Logo }
                    : { name: team1DisplayName, key: 'team', colors: team1Colors, logo: team1Logo }
                  const bottomTeam = (isCPUGame || !isUserAway)
                    ? { name: team1DisplayName, key: 'team', colors: team1Colors, logo: team1Logo }
                    : { name: team2DisplayName, key: 'opponent', colors: team2Colors, logo: team2Logo }

                  return (
                    <>
                      {/* Headers */}
                      <div className="grid gap-1 sm:gap-2 items-center" style={{ gridTemplateColumns: `40px repeat(${4 + gameData.overtimes.length}, minmax(40px, 50px)) minmax(50px, 60px)` }}>
                        <div className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}></div>
                        <div className="text-xs font-semibold text-center" style={{ color: 'var(--text-secondary)' }}>Q1</div>
                        <div className="text-xs font-semibold text-center" style={{ color: 'var(--text-secondary)' }}>Q2</div>
                        <div className="text-xs font-semibold text-center" style={{ color: 'var(--text-secondary)' }}>Q3</div>
                        <div className="text-xs font-semibold text-center" style={{ color: 'var(--text-secondary)' }}>Q4</div>
                        {gameData.overtimes.map((_, i) => (
                          <div key={i} className="text-xs font-semibold text-center" style={{ color: 'var(--text-secondary)' }}>
                            OT{i + 1}
                          </div>
                        ))}
                        <div className="text-xs font-semibold text-center" style={{ color: 'var(--text-secondary)' }}>
                          Total <span className="text-red-400">*</span>
                        </div>
                      </div>

                      {/* Quarter Inputs - Alternating between teams */}
                      <div className="grid gap-1 sm:gap-2" style={{ gridTemplateColumns: `40px repeat(${4 + gameData.overtimes.length}, minmax(40px, 50px)) minmax(50px, 60px)` }}>
                        {/* Team Logos Column */}
                        <div className="flex flex-col gap-1 sm:gap-2">
                          <div className="flex items-center justify-center h-[30px] sm:h-[34px]">
                            {topTeam.logo ? (
                              <div
                                className="w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{
                                  backgroundColor: '#FFFFFF',
                                  border: `2px solid ${topTeam.colors.primary}`,
                                  padding: '2px'
                                }}
                              >
                                <img
                                  src={topTeam.logo}
                                  alt={topTeam.name}
                                  className="w-full h-full object-contain"
                                />
                              </div>
                            ) : (
                              <div className="text-xs font-semibold truncate" style={{ color: 'var(--text-secondary)' }}>{topTeam.name}</div>
                            )}
                          </div>
                          <div className="flex items-center justify-center h-[30px] sm:h-[34px]">
                            {bottomTeam.logo ? (
                              <div
                                className="w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{
                                  backgroundColor: '#FFFFFF',
                                  border: `2px solid ${bottomTeam.colors.primary}`,
                                  padding: '2px'
                                }}
                              >
                                <img
                                  src={bottomTeam.logo}
                                  alt={bottomTeam.name}
                                  className="w-full h-full object-contain"
                                />
                              </div>
                            ) : (
                              <div className="text-xs font-semibold truncate" style={{ color: 'var(--text-secondary)' }}>{bottomTeam.name}</div>
                            )}
                          </div>
                        </div>

                        {/* Q1 Column */}
                        <div className="space-y-1 sm:space-y-2">
                          <input
                            type="number"
                            value={gameData.quarters[topTeam.key].Q1}
                            onChange={(e) => !isScoreLocked && handleQuarterChange(topTeam.key, 'Q1', e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Tab' && !e.shiftKey) {
                                e.preventDefault()
                                document.querySelector(`input[data-team="${bottomTeam.key}"][data-quarter="Q1"]`)?.focus()
                              }
                            }}
                            data-team={topTeam.key}
                            data-quarter="Q1"
                            className={`w-full px-1 sm:px-2 py-1 border-2 rounded text-center text-xs sm:text-sm ${isScoreLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                            style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)', borderColor: topTeam.colors.primary }}
                            min="0"
                            placeholder="0"
                            disabled={isScoreLocked}
                            readOnly={isScoreLocked}
                          />
                          <input
                            type="number"
                            value={gameData.quarters[bottomTeam.key].Q1}
                            onChange={(e) => !isScoreLocked && handleQuarterChange(bottomTeam.key, 'Q1', e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Tab' && !e.shiftKey) {
                                e.preventDefault()
                                document.querySelector(`input[data-team="${topTeam.key}"][data-quarter="Q2"]`)?.focus()
                              }
                            }}
                            data-team={bottomTeam.key}
                            data-quarter="Q1"
                            className={`w-full px-1 sm:px-2 py-1 border-2 rounded text-center text-xs sm:text-sm ${isScoreLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                            style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)', borderColor: bottomTeam.colors.primary }}
                            min="0"
                            placeholder="0"
                            disabled={isScoreLocked}
                            readOnly={isScoreLocked}
                          />
                        </div>

                        {/* Q2 Column */}
                        <div className="space-y-1 sm:space-y-2">
                          <input
                            type="number"
                            value={gameData.quarters[topTeam.key].Q2}
                            onChange={(e) => !isScoreLocked && handleQuarterChange(topTeam.key, 'Q2', e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Tab' && !e.shiftKey) {
                                e.preventDefault()
                                document.querySelector(`input[data-team="${bottomTeam.key}"][data-quarter="Q2"]`)?.focus()
                              }
                            }}
                            data-team={topTeam.key}
                            data-quarter="Q2"
                            className={`w-full px-1 sm:px-2 py-1 border-2 rounded text-center text-xs sm:text-sm ${isScoreLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                            style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)', borderColor: topTeam.colors.primary }}
                            min="0"
                            placeholder="0"
                            disabled={isScoreLocked}
                            readOnly={isScoreLocked}
                          />
                          <input
                            type="number"
                            value={gameData.quarters[bottomTeam.key].Q2}
                            onChange={(e) => !isScoreLocked && handleQuarterChange(bottomTeam.key, 'Q2', e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Tab' && !e.shiftKey) {
                                e.preventDefault()
                                document.querySelector(`input[data-team="${topTeam.key}"][data-quarter="Q3"]`)?.focus()
                              }
                            }}
                            data-team={bottomTeam.key}
                            data-quarter="Q2"
                            className={`w-full px-1 sm:px-2 py-1 border-2 rounded text-center text-xs sm:text-sm ${isScoreLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                            style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)', borderColor: bottomTeam.colors.primary }}
                            min="0"
                            placeholder="0"
                            disabled={isScoreLocked}
                            readOnly={isScoreLocked}
                          />
                        </div>

                        {/* Q3 Column */}
                        <div className="space-y-1 sm:space-y-2">
                          <input
                            type="number"
                            value={gameData.quarters[topTeam.key].Q3}
                            onChange={(e) => !isScoreLocked && handleQuarterChange(topTeam.key, 'Q3', e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Tab' && !e.shiftKey) {
                                e.preventDefault()
                                document.querySelector(`input[data-team="${bottomTeam.key}"][data-quarter="Q3"]`)?.focus()
                              }
                            }}
                            data-team={topTeam.key}
                            data-quarter="Q3"
                            className={`w-full px-1 sm:px-2 py-1 border-2 rounded text-center text-xs sm:text-sm ${isScoreLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                            style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)', borderColor: topTeam.colors.primary }}
                            min="0"
                            placeholder="0"
                            disabled={isScoreLocked}
                            readOnly={isScoreLocked}
                          />
                          <input
                            type="number"
                            value={gameData.quarters[bottomTeam.key].Q3}
                            onChange={(e) => !isScoreLocked && handleQuarterChange(bottomTeam.key, 'Q3', e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Tab' && !e.shiftKey) {
                                e.preventDefault()
                                document.querySelector(`input[data-team="${topTeam.key}"][data-quarter="Q4"]`)?.focus()
                              }
                            }}
                            data-team={bottomTeam.key}
                            data-quarter="Q3"
                            className={`w-full px-1 sm:px-2 py-1 border-2 rounded text-center text-xs sm:text-sm ${isScoreLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                            style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)', borderColor: bottomTeam.colors.primary }}
                            min="0"
                            placeholder="0"
                            disabled={isScoreLocked}
                            readOnly={isScoreLocked}
                          />
                        </div>

                        {/* Q4 Column */}
                        <div className="space-y-1 sm:space-y-2">
                          <input
                            type="number"
                            value={gameData.quarters[topTeam.key].Q4}
                            onChange={(e) => !isScoreLocked && handleQuarterChange(topTeam.key, 'Q4', e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Tab' && !e.shiftKey) {
                                e.preventDefault()
                                document.querySelector(`input[data-team="${bottomTeam.key}"][data-quarter="Q4"]`)?.focus()
                              }
                            }}
                            data-team={topTeam.key}
                            data-quarter="Q4"
                            className={`w-full px-1 sm:px-2 py-1 border-2 rounded text-center text-xs sm:text-sm ${isScoreLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                            style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)', borderColor: topTeam.colors.primary }}
                            min="0"
                            placeholder="0"
                            disabled={isScoreLocked}
                            readOnly={isScoreLocked}
                          />
                          <input
                            type="number"
                            value={gameData.quarters[bottomTeam.key].Q4}
                            onChange={(e) => !isScoreLocked && handleQuarterChange(bottomTeam.key, 'Q4', e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Tab' && !e.shiftKey && gameData.overtimes.length > 0) {
                                e.preventDefault()
                                setTimeout(() => {
                                  document.querySelector(`input[data-team="${topTeam.key}"][data-ot="0"]`)?.focus()
                                }, 100)
                              }
                            }}
                            data-team={bottomTeam.key}
                            data-quarter="Q4"
                            className={`w-full px-1 sm:px-2 py-1 border-2 rounded text-center text-xs sm:text-sm ${isScoreLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                            style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)', borderColor: bottomTeam.colors.primary }}
                            min="0"
                            placeholder="0"
                            disabled={isScoreLocked}
                            readOnly={isScoreLocked}
                          />
                        </div>

                        {/* OT Columns */}
                        {gameData.overtimes.map((ot, otIdx) => (
                          <div key={otIdx} className="space-y-1 sm:space-y-2">
                            <input
                              type="number"
                              value={ot[topTeam.key]}
                              onChange={(e) => !isScoreLocked && handleOvertimeChange(otIdx, topTeam.key, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Tab' && !e.shiftKey) {
                                  e.preventDefault()
                                  document.querySelector(`input[data-team="${bottomTeam.key}"][data-ot="${otIdx}"]`)?.focus()
                                }
                              }}
                              data-team={topTeam.key}
                              data-ot={otIdx}
                              className={`w-full px-1 sm:px-2 py-1 border-2 rounded text-center text-xs sm:text-sm ${isScoreLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                              style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)', borderColor: topTeam.colors.primary }}
                              min="0"
                              placeholder="0"
                              disabled={isScoreLocked}
                              readOnly={isScoreLocked}
                            />
                            <input
                              type="number"
                              value={ot[bottomTeam.key]}
                              onChange={(e) => !isScoreLocked && handleOvertimeChange(otIdx, bottomTeam.key, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Tab' && !e.shiftKey && otIdx < gameData.overtimes.length - 1) {
                                  e.preventDefault()
                                  setTimeout(() => {
                                    document.querySelector(`input[data-team="${topTeam.key}"][data-ot="${otIdx + 1}"]`)?.focus()
                                  }, 100)
                                }
                              }}
                              data-team={bottomTeam.key}
                              data-ot={otIdx}
                              className={`w-full px-1 sm:px-2 py-1 border-2 rounded text-center text-xs sm:text-sm ${isScoreLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                              style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)', borderColor: bottomTeam.colors.primary }}
                              min="0"
                              placeholder="0"
                              disabled={isScoreLocked}
                              readOnly={isScoreLocked}
                            />
                          </div>
                        ))}

                        {/* Total Column */}
                        <div className="space-y-1 sm:space-y-2">
                          <input
                            type="number"
                            value={topTeam.key === 'team' ? gameData.teamScore : gameData.opponentScore}
                            onChange={(e) => !hasQuarterScores() && !isScoreLocked && setGameData({
                              ...gameData,
                              [topTeam.key === 'team' ? 'teamScore' : 'opponentScore']: e.target.value
                            })}
                            className={`w-full px-1 sm:px-2 py-1 border-2 rounded text-center text-xs sm:text-sm font-bold ${isScoreLocked || hasQuarterScores() ? 'opacity-50 cursor-not-allowed' : ''}`}
                            style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)', borderColor: topTeam.colors.primary }}
                            min="0"
                            readOnly={hasQuarterScores() || isScoreLocked}
                            disabled={hasQuarterScores() || isScoreLocked}
                            required
                          />
                          <input
                            type="number"
                            value={bottomTeam.key === 'team' ? gameData.teamScore : gameData.opponentScore}
                            onChange={(e) => !hasQuarterScores() && !isScoreLocked && setGameData({
                              ...gameData,
                              [bottomTeam.key === 'team' ? 'teamScore' : 'opponentScore']: e.target.value
                            })}
                            className={`w-full px-1 sm:px-2 py-1 border-2 rounded text-center text-xs sm:text-sm font-bold ${isScoreLocked || hasQuarterScores() ? 'opacity-50 cursor-not-allowed' : ''}`}
                            style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)', borderColor: bottomTeam.colors.primary }}
                            min="0"
                            readOnly={hasQuarterScores() || isScoreLocked}
                            disabled={hasQuarterScores() || isScoreLocked}
                            required
                          />
                        </div>
                      </div>
                    </>
                  )
                })()}
                </div>
              </div>
            </div>
          </div>

          {/* Rankings Section - only show for user games (CPU games have ranks in team cards) */}
          {!isCPUGame && (
          <div className="rounded-xl p-4 sm:p-5 shadow-sm" style={{ backgroundColor: 'var(--surface-3)', border: `1px solid ${'var(--surface-4)'}` }}>
            <div className="mb-4">
              <h3 className="text-base sm:text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                National Rankings
              </h3>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                Leave blank if unranked
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-xs sm:text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                  Your National Rank
                </label>
                <input
                  type="number"
                  value={gameData.userRank}
                  onChange={(e) => setGameData({ ...gameData, userRank: e.target.value })}
                  className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border-2 rounded-xl text-sm sm:text-base focus:ring-2 focus:outline-none transition-all"
                  style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)', borderColor: 'var(--surface-4)' }}
                  min="1"
                  max="133"
                  placeholder="#"
                />
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                  Opponent Rank
                </label>
                <input
                  type="number"
                  value={gameData.opponentRank}
                  onChange={(e) => setGameData({ ...gameData, opponentRank: e.target.value })}
                  className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border-2 rounded-xl text-sm sm:text-base focus:ring-2 focus:outline-none transition-all"
                  style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)', borderColor: 'var(--surface-4)' }}
                  min="1"
                  max="133"
                  placeholder="#"
                />
              </div>
            </div>
          </div>
          )}

          {/* Opponent Team Ratings Section - hide for CPU vs CPU games */}
          {!isCPUGame && (
          <div className="rounded-xl p-4 sm:p-5 shadow-sm" style={{ backgroundColor: 'var(--surface-3)', border: `1px solid ${'var(--surface-4)'}` }}>
            <div className="flex items-center gap-2 sm:gap-3 mb-4">
              {(() => {
                const teamsData = currentDynasty?.teams || currentDynasty?.customTeams
                const rawOppAbbr = gameData.opponent || scheduledGame?.opponent
                const opponentAbbr = getAbbrFromTeamName(rawOppAbbr) || rawOppAbbr
                const opponentMascotName = opponentAbbr ? getMascotName(opponentAbbr, teamsData) : null
                const opponentDisplayName = opponentMascotName || (opponentAbbr ? getOpponentTeamName(opponentAbbr) : 'Opponent')
                const opponentLogo = opponentMascotName ? getTeamLogo(opponentMascotName, teamsData) : null
                const oppTeamInfo = opponentAbbr ? getGameTeamInfo(teamsData || TEAMS, opponentAbbr) : null
                const opponentColors = oppTeamInfo ? { textColor: oppTeamInfo.secondaryColor } : (opponentAbbr ? teamAbbreviations[opponentAbbr] : null)

                return (
                  <>
                    {opponentLogo && (
                      <div
                        className="w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{
                          backgroundColor: '#FFFFFF',
                          border: `2px solid ${opponentColors?.textColor || 'var(--text-primary)'}`,
                          padding: '2px'
                        }}
                      >
                        <img
                          src={opponentLogo}
                          alt={`${opponentDisplayName} logo`}
                          className="w-full h-full object-contain"
                        />
                      </div>
                    )}
                    <h3 className="text-base sm:text-lg font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                      {opponentDisplayName} Team Ratings
                    </h3>
                  </>
                )
              })()}
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              <div>
                <label className="block text-xs sm:text-sm font-semibold mb-1 sm:mb-2" style={{ color: 'var(--text-primary)' }}>
                  Overall
                </label>
                <input
                  type="number"
                  value={gameData.opponentOverall}
                  onChange={(e) => setGameData({ ...gameData, opponentOverall: e.target.value })}
                  className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border-2 rounded-xl text-sm sm:text-base focus:ring-2 focus:outline-none transition-all"
                  style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)', borderColor: 'var(--surface-4)' }}
                  min="0"
                  max="99"
                  placeholder="85"
                />
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-semibold mb-1 sm:mb-2" style={{ color: 'var(--text-primary)' }}>
                  Offense
                </label>
                <input
                  type="number"
                  value={gameData.opponentOffense}
                  onChange={(e) => setGameData({ ...gameData, opponentOffense: e.target.value })}
                  className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border-2 rounded-xl text-sm sm:text-base focus:ring-2 focus:outline-none transition-all"
                  style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)', borderColor: 'var(--surface-4)' }}
                  min="0"
                  max="99"
                  placeholder="87"
                />
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-semibold mb-1 sm:mb-2" style={{ color: 'var(--text-primary)' }}>
                  Defense
                </label>
                <input
                  type="number"
                  value={gameData.opponentDefense}
                  onChange={(e) => setGameData({ ...gameData, opponentDefense: e.target.value })}
                  className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border-2 rounded-xl text-sm sm:text-base focus:ring-2 focus:outline-none transition-all"
                  style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)', borderColor: 'var(--surface-4)' }}
                  min="0"
                  max="99"
                  placeholder="83"
                />
              </div>
            </div>
          </div>
          )}

          {/* Opponent Record Section - hide for CPU vs CPU games */}
          {!isCPUGame && (
          <div className="rounded-xl p-4 sm:p-5 shadow-sm" style={{ backgroundColor: 'var(--surface-3)', border: `1px solid ${'var(--surface-4)'}` }}>
            <h3 className="text-base sm:text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              Opponent Record <span className="text-xs sm:text-sm font-normal opacity-70">(after this game)</span>
            </h3>

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-xs sm:text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                  Overall Record
                </label>
                <input
                  type="text"
                  value={gameData.overallRecord}
                  onChange={(e) => setGameData({ ...gameData, overallRecord: e.target.value })}
                  className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border-2 rounded-xl text-sm sm:text-lg font-mono text-center focus:ring-2 focus:outline-none transition-all"
                  style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)', borderColor: 'var(--surface-4)' }}
                  placeholder="10-2"
                  maxLength="5"
                />
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                  Conference Record
                </label>
                <input
                  type="text"
                  value={gameData.conferenceRecord}
                  onChange={(e) => setGameData({ ...gameData, conferenceRecord: e.target.value })}
                  className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border-2 rounded-xl text-sm sm:text-lg font-mono text-center focus:ring-2 focus:outline-none transition-all"
                  style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)', borderColor: 'var(--surface-4)' }}
                  placeholder="6-2"
                  maxLength="5"
                />
              </div>
            </div>
          </div>
          )}

          {/* Player of the Week Section - hide for CPU vs CPU games */}
          {!isCPUGame && (
          <div className="rounded-xl p-4 sm:p-5 shadow-sm" style={{ backgroundColor: 'var(--surface-3)', border: `1px solid ${'var(--surface-4)'}` }}>
            <h3 className="text-base sm:text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              Player of the Week Honors
            </h3>

            {/* Conference POW Row */}
            <div className="space-y-2 mb-4">
              <h4 className="text-xs sm:text-sm font-medium" style={{ color: 'var(--text-primary)', opacity: 0.8 }}>
                Conference
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {/* Conference Offensive POW */}
                <div className="relative" ref={confPOWDropdownRef}>
                  <label className="block text-xs sm:text-sm font-semibold mb-1 sm:mb-2" style={{ color: 'var(--text-primary)' }}>
                    Offensive
                  </label>
                  <div className="relative">
                    <input
                      ref={confPOWRef}
                      type="text"
                      value={conferencePOW || confPOWSearch}
                      onChange={(e) => {
                        setConfPOWSearch(e.target.value)
                        setConfPOWOpen(true)
                        if (conferencePOW) setConferencePOW('')
                        setTimeout(() => checkDropdownPosition(confPOWRef, setConfPOWDropUp), 0)
                      }}
                      onFocus={() => {
                        setConfPOWOpen(true)
                        setTimeout(() => checkDropdownPosition(confPOWRef, setConfPOWDropUp), 0)
                      }}
                      onBlur={() => {
                        setTimeout(() => setConfPOWOpen(false), 150)
                      }}
                      onKeyDown={handleConfPOWKeyDown}
                      className="w-full px-2 sm:px-4 py-1.5 sm:py-2 border-2 rounded-lg focus:ring-2 focus:outline-none transition-colors text-sm sm:text-base"
                      style={{
                        backgroundColor: 'var(--surface-3)',
                        color: 'var(--text-primary)',
                        borderColor: 'var(--text-primary)',
                        paddingRight: '2.75rem'
                      }}
                      placeholder="Search or select..."
                      autoComplete="off"
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <svg
                        className={`w-5 h-5 transition-transform ${confPOWOpen ? 'rotate-180' : ''}`}
                        style={{ color: 'var(--text-primary)' }}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {confPOWOpen && (filteredConfPlayers.length > 0 || !confPOWSearch) && (
                    <div
                      className={`absolute z-10 w-full border-2 rounded-lg shadow-lg max-h-60 overflow-auto ${
                        confPOWDropUp ? 'bottom-full mb-1' : 'top-full mt-1'
                      }`}
                      style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)', borderColor: 'var(--surface-4)' }}
                    >
                      {!confPOWSearch && (
                        <div
                          onClick={() => handleConfPOWSelect('')}
                          onMouseEnter={() => setConfPOWHighlight(-1)}
                          className="px-4 py-2 cursor-pointer transition-colors border-b italic"
                          style={{
                            backgroundColor: confPOWHighlight === -1 ? 'var(--surface-4)' : 'transparent',
                            color: confPOWHighlight === -1 ? 'var(--text-primary)' : 'var(--text-tertiary)',
                            borderColor: 'var(--surface-4)'
                          }}
                        >
                          (None)
                        </div>
                      )}
                      {filteredConfPlayers.map((name, index) => (
                        <div
                          key={name}
                          onClick={() => handleConfPOWSelect(name)}
                          onMouseEnter={() => setConfPOWHighlight(index)}
                          className="px-4 py-2 cursor-pointer transition-colors"
                          style={{
                            backgroundColor: index === confPOWHighlight ? 'var(--surface-4)' : 'transparent',
                            color: index === confPOWHighlight ? 'var(--text-primary)' : 'var(--text-primary)',
                            fontWeight: conferencePOW === name ? 'bold' : 'normal'
                          }}
                        >
                          {name}
                        </div>
                      ))}
                    </div>
                  )}

                  {confPOWOpen && confPOWSearch && filteredConfPlayers.length === 0 && (
                    <div
                      className={`absolute z-10 w-full border-2 rounded-lg shadow-lg p-4 text-center ${
                        confPOWDropUp ? 'bottom-full mb-1' : 'top-full mt-1'
                      }`}
                      style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)', borderColor: 'var(--surface-4)' }}
                    >
                      No players found matching "{confPOWSearch}"
                    </div>
                  )}
                </div>

                {/* Conference Defensive POW */}
                <div className="relative" ref={confDefPOWDropdownRef}>
                  <label className="block text-xs sm:text-sm font-semibold mb-1 sm:mb-2" style={{ color: 'var(--text-primary)' }}>
                    Defensive
                  </label>
                  <div className="relative">
                    <input
                      ref={confDefPOWRef}
                      type="text"
                      value={confDefensePOW || confDefPOWSearch}
                      onChange={(e) => {
                        setConfDefPOWSearch(e.target.value)
                        setConfDefPOWOpen(true)
                        if (confDefensePOW) setConfDefensePOW('')
                        setTimeout(() => checkDropdownPosition(confDefPOWRef, setConfDefPOWDropUp), 0)
                      }}
                      onFocus={() => {
                        setConfDefPOWOpen(true)
                        setTimeout(() => checkDropdownPosition(confDefPOWRef, setConfDefPOWDropUp), 0)
                      }}
                      onBlur={() => {
                        setTimeout(() => setConfDefPOWOpen(false), 150)
                      }}
                      onKeyDown={handleConfDefPOWKeyDown}
                      className="w-full px-2 sm:px-4 py-1.5 sm:py-2 border-2 rounded-lg focus:ring-2 focus:outline-none transition-colors text-sm sm:text-base"
                      style={{
                        backgroundColor: 'var(--surface-3)',
                        color: 'var(--text-primary)',
                        borderColor: 'var(--text-primary)',
                        paddingRight: '2.75rem'
                      }}
                      placeholder="Search or select..."
                      autoComplete="off"
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <svg
                        className={`w-5 h-5 transition-transform ${confDefPOWOpen ? 'rotate-180' : ''}`}
                        style={{ color: 'var(--text-primary)' }}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {confDefPOWOpen && (filteredConfDefPlayers.length > 0 || !confDefPOWSearch) && (
                    <div
                      className={`absolute z-10 w-full border-2 rounded-lg shadow-lg max-h-60 overflow-auto ${
                        confDefPOWDropUp ? 'bottom-full mb-1' : 'top-full mt-1'
                      }`}
                      style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)', borderColor: 'var(--surface-4)' }}
                    >
                      {!confDefPOWSearch && (
                        <div
                          onClick={() => handleConfDefPOWSelect('')}
                          onMouseEnter={() => setConfDefPOWHighlight(-1)}
                          className="px-4 py-2 cursor-pointer transition-colors border-b italic"
                          style={{
                            backgroundColor: confDefPOWHighlight === -1 ? 'var(--surface-4)' : 'transparent',
                            color: confDefPOWHighlight === -1 ? 'var(--text-primary)' : 'var(--text-tertiary)',
                            borderColor: 'var(--surface-4)'
                          }}
                        >
                          (None)
                        </div>
                      )}
                      {filteredConfDefPlayers.map((name, index) => (
                        <div
                          key={name}
                          onClick={() => handleConfDefPOWSelect(name)}
                          onMouseEnter={() => setConfDefPOWHighlight(index)}
                          className="px-4 py-2 cursor-pointer transition-colors"
                          style={{
                            backgroundColor: index === confDefPOWHighlight ? 'var(--surface-4)' : 'transparent',
                            color: index === confDefPOWHighlight ? 'var(--text-primary)' : 'var(--text-primary)',
                            fontWeight: confDefensePOW === name ? 'bold' : 'normal'
                          }}
                        >
                          {name}
                        </div>
                      ))}
                    </div>
                  )}

                  {confDefPOWOpen && confDefPOWSearch && filteredConfDefPlayers.length === 0 && (
                    <div
                      className={`absolute z-10 w-full border-2 rounded-lg shadow-lg p-4 text-center ${
                        confDefPOWDropUp ? 'bottom-full mb-1' : 'top-full mt-1'
                      }`}
                      style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)', borderColor: 'var(--surface-4)' }}
                    >
                      No players found matching "{confDefPOWSearch}"
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* National POW Row */}
            <div className="space-y-2">
              <h4 className="text-xs sm:text-sm font-medium" style={{ color: 'var(--text-primary)', opacity: 0.8 }}>
                National
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {/* National Offensive POW */}
                <div className="relative" ref={natlPOWDropdownRef}>
                  <label className="block text-xs sm:text-sm font-semibold mb-1 sm:mb-2" style={{ color: 'var(--text-primary)' }}>
                    Offensive
                  </label>
                  <div className="relative">
                    <input
                      ref={natlPOWRef}
                      type="text"
                      value={nationalPOW || natlPOWSearch}
                      onChange={(e) => {
                        setNatlPOWSearch(e.target.value)
                        setNatlPOWOpen(true)
                        if (nationalPOW) setNationalPOW('')
                        setTimeout(() => checkDropdownPosition(natlPOWRef, setNatlPOWDropUp), 0)
                      }}
                      onFocus={() => {
                        setNatlPOWOpen(true)
                        setTimeout(() => checkDropdownPosition(natlPOWRef, setNatlPOWDropUp), 0)
                      }}
                      onBlur={() => {
                        setTimeout(() => setNatlPOWOpen(false), 150)
                      }}
                      onKeyDown={handleNatlPOWKeyDown}
                      className="w-full px-2 sm:px-4 py-1.5 sm:py-2 border-2 rounded-lg focus:ring-2 focus:outline-none transition-colors text-sm sm:text-base"
                      style={{
                        backgroundColor: 'var(--surface-3)',
                        color: 'var(--text-primary)',
                        borderColor: 'var(--text-primary)',
                        paddingRight: '2.75rem'
                      }}
                      placeholder="Search or select..."
                      autoComplete="off"
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <svg
                        className={`w-5 h-5 transition-transform ${natlPOWOpen ? 'rotate-180' : ''}`}
                        style={{ color: 'var(--text-primary)' }}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {natlPOWOpen && (filteredNatlPlayers.length > 0 || !natlPOWSearch) && (
                    <div
                      className={`absolute z-10 w-full border-2 rounded-lg shadow-lg max-h-60 overflow-auto ${
                        natlPOWDropUp ? 'bottom-full mb-1' : 'top-full mt-1'
                      }`}
                      style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)', borderColor: 'var(--surface-4)' }}
                    >
                      {!natlPOWSearch && (
                        <div
                          onClick={() => handleNatlPOWSelect('')}
                          onMouseEnter={() => setNatlPOWHighlight(-1)}
                          className="px-4 py-2 cursor-pointer transition-colors border-b italic"
                          style={{
                            backgroundColor: natlPOWHighlight === -1 ? 'var(--surface-4)' : 'transparent',
                            color: natlPOWHighlight === -1 ? 'var(--text-primary)' : 'var(--text-tertiary)',
                            borderColor: 'var(--surface-4)'
                          }}
                        >
                          (None)
                        </div>
                      )}
                      {filteredNatlPlayers.map((name, index) => (
                        <div
                          key={name}
                          onClick={() => handleNatlPOWSelect(name)}
                          onMouseEnter={() => setNatlPOWHighlight(index)}
                          className="px-4 py-2 cursor-pointer transition-colors"
                          style={{
                            backgroundColor: index === natlPOWHighlight ? 'var(--surface-4)' : 'transparent',
                            color: index === natlPOWHighlight ? 'var(--text-primary)' : 'var(--text-primary)',
                            fontWeight: nationalPOW === name ? 'bold' : 'normal'
                          }}
                        >
                          {name}
                        </div>
                      ))}
                    </div>
                  )}

                  {natlPOWOpen && natlPOWSearch && filteredNatlPlayers.length === 0 && (
                    <div
                      className={`absolute z-10 w-full border-2 rounded-lg shadow-lg p-4 text-center ${
                        natlPOWDropUp ? 'bottom-full mb-1' : 'top-full mt-1'
                      }`}
                      style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)', borderColor: 'var(--surface-4)' }}
                    >
                      No players found matching "{natlPOWSearch}"
                    </div>
                  )}
                </div>

                {/* National Defensive POW */}
                <div className="relative" ref={natlDefPOWDropdownRef}>
                  <label className="block text-xs sm:text-sm font-semibold mb-1 sm:mb-2" style={{ color: 'var(--text-primary)' }}>
                    Defensive
                  </label>
                  <div className="relative">
                    <input
                      ref={natlDefPOWRef}
                      type="text"
                      value={natlDefensePOW || natlDefPOWSearch}
                      onChange={(e) => {
                        setNatlDefPOWSearch(e.target.value)
                        setNatlDefPOWOpen(true)
                        if (natlDefensePOW) setNatlDefensePOW('')
                        setTimeout(() => checkDropdownPosition(natlDefPOWRef, setNatlDefPOWDropUp), 0)
                      }}
                      onFocus={() => {
                        setNatlDefPOWOpen(true)
                        setTimeout(() => checkDropdownPosition(natlDefPOWRef, setNatlDefPOWDropUp), 0)
                      }}
                      onBlur={() => {
                        setTimeout(() => setNatlDefPOWOpen(false), 150)
                      }}
                      onKeyDown={handleNatlDefPOWKeyDown}
                      className="w-full px-2 sm:px-4 py-1.5 sm:py-2 border-2 rounded-lg focus:ring-2 focus:outline-none transition-colors text-sm sm:text-base"
                      style={{
                        backgroundColor: 'var(--surface-3)',
                        color: 'var(--text-primary)',
                        borderColor: 'var(--text-primary)',
                        paddingRight: '2.75rem'
                      }}
                      placeholder="Search or select..."
                      autoComplete="off"
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <svg
                        className={`w-5 h-5 transition-transform ${natlDefPOWOpen ? 'rotate-180' : ''}`}
                        style={{ color: 'var(--text-primary)' }}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {natlDefPOWOpen && (filteredNatlDefPlayers.length > 0 || !natlDefPOWSearch) && (
                    <div
                      className={`absolute z-10 w-full border-2 rounded-lg shadow-lg max-h-60 overflow-auto ${
                        natlDefPOWDropUp ? 'bottom-full mb-1' : 'top-full mt-1'
                      }`}
                      style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)', borderColor: 'var(--surface-4)' }}
                    >
                      {!natlDefPOWSearch && (
                        <div
                          onClick={() => handleNatlDefPOWSelect('')}
                          onMouseEnter={() => setNatlDefPOWHighlight(-1)}
                          className="px-4 py-2 cursor-pointer transition-colors border-b italic"
                          style={{
                            backgroundColor: natlDefPOWHighlight === -1 ? 'var(--surface-4)' : 'transparent',
                            color: natlDefPOWHighlight === -1 ? 'var(--text-primary)' : 'var(--text-tertiary)',
                            borderColor: 'var(--surface-4)'
                          }}
                        >
                          (None)
                        </div>
                      )}
                      {filteredNatlDefPlayers.map((name, index) => (
                        <div
                          key={name}
                          onClick={() => handleNatlDefPOWSelect(name)}
                          onMouseEnter={() => setNatlDefPOWHighlight(index)}
                          className="px-4 py-2 cursor-pointer transition-colors"
                          style={{
                            backgroundColor: index === natlDefPOWHighlight ? 'var(--surface-4)' : 'transparent',
                            color: index === natlDefPOWHighlight ? 'var(--text-primary)' : 'var(--text-primary)',
                            fontWeight: natlDefensePOW === name ? 'bold' : 'normal'
                          }}
                        >
                          {name}
                        </div>
                      ))}
                    </div>
                  )}

                  {natlDefPOWOpen && natlDefPOWSearch && filteredNatlDefPlayers.length === 0 && (
                    <div
                      className={`absolute z-10 w-full border-2 rounded-lg shadow-lg p-4 text-center ${
                        natlDefPOWDropUp ? 'bottom-full mb-1' : 'top-full mt-1'
                      }`}
                      style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)', borderColor: 'var(--surface-4)' }}
                    >
                      No players found matching "{natlDefPOWSearch}"
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          )}

          {/* CPU Game Team Ratings & Records - show only for CPU vs CPU games */}
          {isCPUGame && (
          <>
            {/* Team 1 Section */}
            <div className="rounded-xl p-4 sm:p-5 shadow-sm" style={{ backgroundColor: 'var(--surface-3)', border: `1px solid ${'var(--surface-4)'}` }}>
              <div className="flex items-center gap-2 sm:gap-3 mb-4">
                {(() => {
                  // Derive team abbr from tid for unified format games
                  const teamsSource = currentDynasty?.teams || TEAMS
                  const teamsData = currentDynasty?.teams || currentDynasty?.customTeams
                  const team1AbbrFromTid = effectiveGame?.team1Tid ? getGameTeamInfo(teamsSource, effectiveGame.team1Tid)?.abbr : null
                  const team1Abbr = effectiveGame?.team1 || team1AbbrFromTid || passedTeam1
                  const team1MascotName = team1Abbr ? getMascotName(team1Abbr, teamsData) : null
                  const team1DisplayName = team1MascotName || (team1Abbr ? getOpponentTeamName(team1Abbr) : 'Team 1')
                  const team1Logo = team1MascotName ? getTeamLogo(team1MascotName, teamsData) : null
                  const team1Info = team1Abbr ? getGameTeamInfo(teamsData || TEAMS, team1Abbr) : null
                  const team1Colors = team1Info ? { textColor: team1Info.secondaryColor } : (team1Abbr ? teamAbbreviations[team1Abbr] : null)

                  return (
                    <>
                      {team1Logo && (
                        <div
                          className="w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{
                            backgroundColor: '#FFFFFF',
                            border: `2px solid ${team1Colors?.textColor || 'var(--text-primary)'}`,
                            padding: '2px'
                          }}
                        >
                          <img
                            src={team1Logo}
                            alt={`${team1DisplayName} logo`}
                            className="w-full h-full object-contain"
                          />
                        </div>
                      )}
                      <h3 className="text-base sm:text-lg font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                        {team1DisplayName}
                      </h3>
                    </>
                  )
                })()}
              </div>

              {/* Team 1 Rank and Record */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-4">
                <div>
                  <label className="block text-xs sm:text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                    Ranking
                  </label>
                  <input
                    type="number"
                    value={gameData.team1Rank}
                    onChange={(e) => setGameData({ ...gameData, team1Rank: e.target.value })}
                    className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border-2 rounded-xl text-sm sm:text-base focus:ring-2 focus:outline-none transition-all"
                    style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)', borderColor: 'var(--surface-4)' }}
                    min="1"
                    max="25"
                    placeholder="Unranked"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                    Record
                  </label>
                  <input
                    type="text"
                    value={gameData.team1Record}
                    onChange={(e) => setGameData({ ...gameData, team1Record: e.target.value })}
                    className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border-2 rounded-xl text-sm sm:text-base font-mono text-center focus:ring-2 focus:outline-none transition-all"
                    style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)', borderColor: 'var(--surface-4)' }}
                    placeholder="10-2"
                    maxLength="10"
                  />
                </div>
              </div>

              {/* Team 1 Ratings */}
              <div className="grid grid-cols-3 gap-2 sm:gap-4">
                <div>
                  <label className="block text-xs sm:text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                    Overall
                  </label>
                  <input
                    type="number"
                    value={gameData.team1Overall}
                    onChange={(e) => setGameData({ ...gameData, team1Overall: e.target.value })}
                    className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border-2 rounded-xl text-sm sm:text-base focus:ring-2 focus:outline-none transition-all"
                    style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)', borderColor: 'var(--surface-4)' }}
                    min="0"
                    max="99"
                    placeholder="85"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                    Offense
                  </label>
                  <input
                    type="number"
                    value={gameData.team1Offense}
                    onChange={(e) => setGameData({ ...gameData, team1Offense: e.target.value })}
                    className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border-2 rounded-xl text-sm sm:text-base focus:ring-2 focus:outline-none transition-all"
                    style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)', borderColor: 'var(--surface-4)' }}
                    min="0"
                    max="99"
                    placeholder="87"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                    Defense
                  </label>
                  <input
                    type="number"
                    value={gameData.team1Defense}
                    onChange={(e) => setGameData({ ...gameData, team1Defense: e.target.value })}
                    className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border-2 rounded-xl text-sm sm:text-base focus:ring-2 focus:outline-none transition-all"
                    style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)', borderColor: 'var(--surface-4)' }}
                    min="0"
                    max="99"
                    placeholder="83"
                  />
                </div>
              </div>
            </div>

            {/* Team 2 Section */}
            <div className="rounded-xl p-4 sm:p-5 shadow-sm" style={{ backgroundColor: 'var(--surface-3)', border: `1px solid ${'var(--surface-4)'}` }}>
              <div className="flex items-center gap-2 sm:gap-3 mb-4">
                {(() => {
                  // Derive team abbr from tid for unified format games
                  const teamsSource = currentDynasty?.teams || TEAMS
                  const teamsData = currentDynasty?.teams || currentDynasty?.customTeams
                  const team2AbbrFromTid = effectiveGame?.team2Tid ? getGameTeamInfo(teamsSource, effectiveGame.team2Tid)?.abbr : null
                  const team2Abbr = effectiveGame?.team2 || team2AbbrFromTid || passedTeam2
                  const team2MascotName = team2Abbr ? getMascotName(team2Abbr, teamsData) : null
                  const team2DisplayName = team2MascotName || (team2Abbr ? getOpponentTeamName(team2Abbr) : 'Team 2')
                  const team2Logo = team2MascotName ? getTeamLogo(team2MascotName, teamsData) : null
                  const team2Info = team2Abbr ? getGameTeamInfo(teamsData || TEAMS, team2Abbr) : null
                  const team2Colors = team2Info ? { textColor: team2Info.secondaryColor } : (team2Abbr ? teamAbbreviations[team2Abbr] : null)

                  return (
                    <>
                      {team2Logo && (
                        <div
                          className="w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{
                            backgroundColor: '#FFFFFF',
                            border: `2px solid ${team2Colors?.textColor || 'var(--text-primary)'}`,
                            padding: '2px'
                          }}
                        >
                          <img
                            src={team2Logo}
                            alt={`${team2DisplayName} logo`}
                            className="w-full h-full object-contain"
                          />
                        </div>
                      )}
                      <h3 className="text-base sm:text-lg font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                        {team2DisplayName}
                      </h3>
                    </>
                  )
                })()}
              </div>

              {/* Team 2 Rank and Record */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-4">
                <div>
                  <label className="block text-xs sm:text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                    Ranking
                  </label>
                  <input
                    type="number"
                    value={gameData.team2Rank}
                    onChange={(e) => setGameData({ ...gameData, team2Rank: e.target.value })}
                    className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border-2 rounded-xl text-sm sm:text-base focus:ring-2 focus:outline-none transition-all"
                    style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)', borderColor: 'var(--surface-4)' }}
                    min="1"
                    max="25"
                    placeholder="Unranked"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                    Record
                  </label>
                  <input
                    type="text"
                    value={gameData.team2Record}
                    onChange={(e) => setGameData({ ...gameData, team2Record: e.target.value })}
                    className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border-2 rounded-xl text-sm sm:text-base font-mono text-center focus:ring-2 focus:outline-none transition-all"
                    style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)', borderColor: 'var(--surface-4)' }}
                    placeholder="8-4"
                    maxLength="10"
                  />
                </div>
              </div>

              {/* Team 2 Ratings */}
              <div className="grid grid-cols-3 gap-2 sm:gap-4">
                <div>
                  <label className="block text-xs sm:text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                    Overall
                  </label>
                  <input
                    type="number"
                    value={gameData.team2Overall}
                    onChange={(e) => setGameData({ ...gameData, team2Overall: e.target.value })}
                    className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border-2 rounded-xl text-sm sm:text-base focus:ring-2 focus:outline-none transition-all"
                    style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)', borderColor: 'var(--surface-4)' }}
                    min="0"
                    max="99"
                    placeholder="85"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                    Offense
                  </label>
                  <input
                    type="number"
                    value={gameData.team2Offense}
                    onChange={(e) => setGameData({ ...gameData, team2Offense: e.target.value })}
                    className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border-2 rounded-xl text-sm sm:text-base focus:ring-2 focus:outline-none transition-all"
                    style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)', borderColor: 'var(--surface-4)' }}
                    min="0"
                    max="99"
                    placeholder="87"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                    Defense
                  </label>
                  <input
                    type="number"
                    value={gameData.team2Defense}
                    onChange={(e) => setGameData({ ...gameData, team2Defense: e.target.value })}
                    className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border-2 rounded-xl text-sm sm:text-base focus:ring-2 focus:outline-none transition-all"
                    style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)', borderColor: 'var(--surface-4)' }}
                    min="0"
                    max="99"
                    placeholder="83"
                  />
                </div>
              </div>
            </div>
          </>
          )}

          {/* AI Game Recap Section */}
          <div className="rounded-xl p-4 sm:p-5 shadow-sm" style={{ backgroundColor: 'var(--surface-3)', border: `1px solid ${'var(--surface-4)'}` }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base sm:text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                Game Recap
              </h3>
              <button
                onClick={async () => {
                  setRecapError(null)
                  try {
                    const gameForRecap = {
                      ...existingGame,
                      ...gameData,
                      teamScore: parseInt(gameData.teamScore) || existingGame?.teamScore,
                      opponentScore: parseInt(gameData.opponentScore) || existingGame?.opponentScore,
                      team1Score: parseInt(gameData.team1Score) || existingGame?.team1Score,
                      team2Score: parseInt(gameData.team2Score) || existingGame?.team2Score,
                    }
                    const fullPrompt = getFullRecapPrompt(currentDynasty, gameForRecap)
                    if (navigator.clipboard && window.isSecureContext) {
                      await navigator.clipboard.writeText(fullPrompt)
                    } else {
                      const ta = document.createElement('textarea')
                      ta.value = fullPrompt
                      ta.style.position = 'fixed'
                      ta.style.left = '-9999px'
                      document.body.appendChild(ta)
                      ta.focus()
                      ta.select()
                      document.execCommand('copy')
                      ta.remove()
                    }
                    setPromptCopied(true)
                    setTimeout(() => setPromptCopied(false), 2000)
                  } catch (err) {
                    console.error('Failed to copy prompt:', err)
                    setRecapError('Failed to copy prompt: ' + (err.message || 'unknown error'))
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{
                  backgroundColor: 'var(--surface-3)',
                  color: 'var(--text-primary)',
                  border: `1px solid var(--surface-5)`
                }}
              >
                {promptCopied ? 'Copied!' : 'Copy AI Prompt'}
              </button>
            </div>

            {/* Instructions */}
            <p className="text-xs mb-3 italic" style={{ color: 'var(--text-secondary)' }}>
              Fill in all game data first, then copy the prompt into ChatGPT / Claude / your AI of choice and paste the generated article below.
            </p>

            {recapError && (
              <div className="mb-3 p-2 rounded-lg bg-red-900/30 border border-red-700 text-red-400 text-xs">
                {recapError}
              </div>
            )}

            <div className="mb-4">
              <textarea
                value={gameData.aiRecap}
                onChange={(e) => setGameData({ ...gameData, aiRecap: e.target.value })}
                className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border-2 rounded-xl text-sm focus:ring-2 focus:outline-none transition-all"
                style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)', borderColor: 'var(--surface-4)' }}
                rows="10"
                placeholder="Paste the AI-generated recap here (or write your own)..."
              />
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                Paste the output from your AI, or write your own.
              </p>
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                Links (YouTube, Imgur, etc.)
              </label>
              <div className="space-y-2">
                {links.map((link, index) => (
                  <input
                    key={index}
                    type="text"
                    value={link}
                    onChange={(e) => handleLinkChange(index, e.target.value)}
                    className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border-2 rounded-xl text-sm sm:text-base focus:ring-2 focus:outline-none transition-all"
                    style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)', borderColor: 'var(--surface-4)' }}
                    placeholder={index === 0 ? "Paste link..." : "Add another link..."}
                  />
                ))}
              </div>
            </div>

            {/* Box Score Buttons - available for any game with an ID (existing or new with tempGameId) */}
            {(existingGame?.id || tempGameId) && (() => {
              // Compute home/away teams for button labels
              // For CPU games: team1 = "home", team2 = "away" in box score
              // For user games: based on location (home/neutral = user is home)
              // Resolve home/away ABBR from tids first when present so a
              // teambuilder team renamed since the game was saved shows
              // its CURRENT abbr in the button labels (otherwise we'd
              // surface the stale snapshot).
              let homeAbbr, awayAbbr
              const teamsSrc = currentDynasty?.teams || TEAMS
              const t1FromTid = effectiveGame?.team1Tid != null ? getGameTeamInfo(teamsSrc, effectiveGame.team1Tid)?.abbr : null
              const t2FromTid = effectiveGame?.team2Tid != null ? getGameTeamInfo(teamsSrc, effectiveGame.team2Tid)?.abbr : null
              if (isCPUGame) {
                homeAbbr = t1FromTid || effectiveGame?.team1 || passedTeam1 || 'Team 1'
                awayAbbr = t2FromTid || effectiveGame?.team2 || passedTeam2 || 'Team 2'
              } else {
                const teamAbbr = effectiveTeamAbbr || effectiveTeamName || ''
                const oppFromTid = effectiveGame?.opponentTid != null ? getGameTeamInfo(teamsSrc, effectiveGame.opponentTid)?.abbr : null
                const rawOppAbbr = oppFromTid || gameData.opponent || existingGame?.opponent || ''
                const oppAbbr = getAbbrFromTeamName(rawOppAbbr) || rawOppAbbr
                const isTeamHome = gameData.location === 'home' || gameData.location === 'neutral'
                homeAbbr = isTeamHome ? teamAbbr : oppAbbr
                awayAbbr = isTeamHome ? oppAbbr : teamAbbr
              }

              // Check if stats already entered (via data or sheet creation)
              const hasHomeStats = existingGame?.boxScore?.home && Object.keys(existingGame.boxScore.home).length > 0
              const hasAwayStats = existingGame?.boxScore?.away && Object.keys(existingGame.boxScore.away).length > 0
              const hasScoring = existingGame?.boxScore?.scoringSummary?.length > 0
              const hasTeamStats = existingGame?.boxScore?.teamStats && (existingGame.boxScore.teamStats.home || existingGame.boxScore.teamStats.away)

              // Also check if sheets have been created (even if data not synced yet)
              const hasHomeSheet = existingGame?.homeStatsSheetId || pendingSheetIds.homeStatsSheetId
              const hasAwaySheet = existingGame?.awayStatsSheetId || pendingSheetIds.awayStatsSheetId
              const hasScoringSheet = existingGame?.scoringSummarySheetId || pendingSheetIds.scoringSummarySheetId
              const hasTeamStatsSheet = existingGame?.teamStatsSheetId || pendingSheetIds.teamStatsSheetId

              // Combine checks - completed if has data OR has sheet
              const homeCompleted = hasHomeStats || pendingHomeStats || hasHomeSheet
              const awayCompleted = hasAwayStats || pendingAwayStats || hasAwaySheet
              const scoringCompleted = hasScoring || pendingScoringSummary || hasScoringSheet
              const teamStatsCompleted = hasTeamStats || pendingTeamStats || hasTeamStatsSheet

              return (
                <div className="mt-4 space-y-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => autoSaveAndOpenModal(setShowHomeStatsModal)}
                      className="flex-1 px-3 py-2 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 border-2 hover:opacity-90 transition-colors"
                      style={{
                        backgroundColor: homeCompleted ? 'var(--surface-4)' : 'var(--surface-3)',
                        color: 'var(--text-primary)',
                        borderColor: homeCompleted ? 'var(--text-primary)' : 'var(--surface-5)'
                      }}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      {homeCompleted ? `Edit ${homeAbbr} Stats` : `Enter ${homeAbbr} Stats`}
                    </button>
                    <button
                      type="button"
                      onClick={() => autoSaveAndOpenModal(setShowAwayStatsModal)}
                      className="flex-1 px-3 py-2 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 border-2 hover:opacity-90 transition-colors"
                      style={{
                        backgroundColor: awayCompleted ? 'var(--surface-4)' : 'var(--surface-3)',
                        color: 'var(--text-primary)',
                        borderColor: awayCompleted ? 'var(--text-primary)' : 'var(--surface-5)'
                      }}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      {awayCompleted ? `Edit ${awayAbbr} Stats` : `Enter ${awayAbbr} Stats`}
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => autoSaveAndOpenModal(setShowScoringModal)}
                      className="flex-1 px-3 py-2 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 border-2 hover:opacity-90 transition-colors"
                      style={{
                        backgroundColor: scoringCompleted ? 'var(--surface-4)' : 'var(--surface-3)',
                        color: 'var(--text-primary)',
                        borderColor: scoringCompleted ? 'var(--text-primary)' : 'var(--surface-5)'
                      }}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      {scoringCompleted ? 'Edit Scoring' : 'Scoring Plays'}
                    </button>
                    <button
                      type="button"
                      onClick={() => autoSaveAndOpenModal(setShowTeamStatsModal)}
                      className="flex-1 px-3 py-2 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 border-2 hover:opacity-90 transition-colors"
                      style={{
                        backgroundColor: teamStatsCompleted ? 'var(--surface-4)' : 'var(--surface-3)',
                        color: 'var(--text-primary)',
                        borderColor: teamStatsCompleted ? 'var(--text-primary)' : 'var(--surface-5)'
                      }}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      {teamStatsCompleted ? 'Edit Team Stats' : 'Team Stats'}
                    </button>
                  </div>
                  <p className="text-xs text-center opacity-60" style={{ color: 'var(--text-secondary)' }}>
                    All optional - you will have a chance to enter all player season stats once the season has ended
                  </p>
                </div>
              )
            })()}
          </div>

          </div>

          {/* Buttons - Sticky Footer */}
          <div className="flex-shrink-0 flex gap-3 sm:gap-4 p-4 sm:p-6 border-t" style={{ borderColor: 'var(--surface-4)', backgroundColor: 'var(--surface-2)' }}>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl font-semibold bg-surface-3 hover:bg-surface-4 text-white transition-all text-sm sm:text-base"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl font-semibold hover:opacity-90 transition-all text-sm sm:text-base shadow-md"
              style={{
                backgroundColor: 'var(--text-primary)',
                color: '#ffffff'
              }}
            >
              Save Game
            </button>
          </div>
        </form>

        {/* Home Stats Modal */}
        {showHomeStatsModal && (
          <BoxScoreSheetModal
            isOpen={showHomeStatsModal}
            onClose={() => setShowHomeStatsModal(false)}
            onSave={async (stats) => {
              if (existingGame) {
                // Existing game - update directly without closing GameEntryModal
                const latestGame = getLatestGameData()
                const updatedGame = {
                  ...latestGame,
                  boxScore: {
                    ...latestGame.boxScore,
                    home: stats
                  }
                }
                await updateBoxScoreDirectly(updatedGame)
              } else {
                // New game - store for later
                setPendingHomeStats(stats)
              }
            }}
            onSheetCreated={(sheetId) => {
              if (!existingGame) {
                setPendingSheetIds(prev => ({ ...prev, homeStatsSheetId: sheetId }))
              }
            }}
            sheetType="homeStats"
            existingSheetId={getLatestGameData()?.homeStatsSheetId || pendingSheetIds.homeStatsSheetId}
            game={getLatestGameData() || {
              id: tempGameId,
              week: actualWeekNumber,
              year: actualYear,
              opponent: gameData.opponent,
              location: gameData.location,
              // CPU game: has team1/team2 but no userTeam
              team1: effectiveGame?.team1 || passedTeam1,
              team2: effectiveGame?.team2 || passedTeam2
            }}
            teamColors={teamColors}
          />
        )}

        {/* Away Stats Modal */}
        {showAwayStatsModal && (
          <BoxScoreSheetModal
            isOpen={showAwayStatsModal}
            onClose={() => setShowAwayStatsModal(false)}
            onSave={async (stats) => {
              if (existingGame) {
                // Existing game - update directly without closing GameEntryModal
                const latestGame = getLatestGameData()
                const updatedGame = {
                  ...latestGame,
                  boxScore: {
                    ...latestGame.boxScore,
                    away: stats
                  }
                }
                await updateBoxScoreDirectly(updatedGame)
              } else {
                // New game - store for later
                setPendingAwayStats(stats)
              }
            }}
            onSheetCreated={(sheetId) => {
              if (!existingGame) {
                setPendingSheetIds(prev => ({ ...prev, awayStatsSheetId: sheetId }))
              }
            }}
            sheetType="awayStats"
            existingSheetId={getLatestGameData()?.awayStatsSheetId || pendingSheetIds.awayStatsSheetId}
            game={getLatestGameData() || {
              id: tempGameId,
              week: actualWeekNumber,
              year: actualYear,
              opponent: gameData.opponent,
              location: gameData.location,
              // CPU game: has team1/team2 but no userTeam
              team1: effectiveGame?.team1 || passedTeam1,
              team2: effectiveGame?.team2 || passedTeam2
            }}
            teamColors={teamColors}
          />
        )}

        {/* Scoring Summary Modal */}
        {showScoringModal && (
          <BoxScoreSheetModal
            isOpen={showScoringModal}
            onClose={() => setShowScoringModal(false)}
            onSave={async (scoringSummary) => {
              if (existingGame) {
                // Existing game - update directly without closing GameEntryModal
                const latestGame = getLatestGameData()
                const updatedGame = {
                  ...latestGame,
                  boxScore: {
                    ...latestGame.boxScore,
                    scoringSummary
                  }
                }
                await updateBoxScoreDirectly(updatedGame)
              } else {
                // New game - store for later
                setPendingScoringSummary(scoringSummary)
              }
            }}
            onSheetCreated={(sheetId) => {
              if (!existingGame) {
                setPendingSheetIds(prev => ({ ...prev, scoringSummarySheetId: sheetId }))
              }
            }}
            sheetType="scoring"
            existingSheetId={getLatestGameData()?.scoringSummarySheetId || pendingSheetIds.scoringSummarySheetId}
            game={getLatestGameData() || {
              id: tempGameId,
              week: actualWeekNumber,
              year: actualYear,
              opponent: gameData.opponent,
              location: gameData.location,
              // CPU game: has team1/team2 but no userTeam
              team1: effectiveGame?.team1 || passedTeam1,
              team2: effectiveGame?.team2 || passedTeam2
            }}
            teamColors={teamColors}
          />
        )}

        {/* Team Stats Modal */}
        {showTeamStatsModal && (
          <BoxScoreSheetModal
            isOpen={showTeamStatsModal}
            onClose={() => setShowTeamStatsModal(false)}
            onSave={async (teamStats) => {
              if (existingGame) {
                // Existing game - update directly without closing GameEntryModal
                const latestGame = getLatestGameData()
                const updatedGame = {
                  ...latestGame,
                  boxScore: {
                    ...latestGame.boxScore,
                    teamStats
                  }
                }
                await updateBoxScoreDirectly(updatedGame)
              } else {
                // New game - store for later
                setPendingTeamStats(teamStats)
              }
            }}
            onSheetCreated={(sheetId) => {
              if (!existingGame) {
                setPendingSheetIds(prev => ({ ...prev, teamStatsSheetId: sheetId }))
              }
            }}
            sheetType="teamStats"
            existingSheetId={getLatestGameData()?.teamStatsSheetId || pendingSheetIds.teamStatsSheetId}
            game={getLatestGameData() || {
              id: tempGameId,
              week: actualWeekNumber,
              year: actualYear,
              opponent: gameData.opponent,
              location: gameData.location,
              // CPU game: has team1/team2 but no userTeam
              team1: effectiveGame?.team1 || passedTeam1,
              team2: effectiveGame?.team2 || passedTeam2
            }}
            teamColors={teamColors}
          />
        )}
      </div>
    </div>
  )
}
