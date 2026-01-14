import { useState, useEffect, useMemo, useRef } from 'react'
import { Link, useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { getTeamLogo, getMascotName as getMascotNameFromTeams } from '../../data/teams'
import { teamAbbreviations } from '../../data/teamAbbreviations'
import { TEAMS, resolveTid, getCurrentTeamAbbr, getGameTeamInfo, getAbbrFromTeamName, getTidFromAbbr, getOriginalTeamAbbr } from '../../data/teamRegistry'
import { getTeamColors } from '../../data/teamColors'
import { getContrastTextColor } from '../../utils/colorUtils'
import { useDynasty, GAME_TYPES, getCurrentCustomConferences, buildRecordUpdatePayload, calculateTeamRecordFromGames } from '../../context/DynastyContext'
import { useAuth } from '../../context/AuthContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { generateGameRecap, getCustomRecapInstructions, getAiConfig } from '../../services/geminiService'
import { getBowlLogo } from '../../data/bowlLogos'
import { getConferenceLogo } from '../../data/conferenceLogos'
import { getTeamConference } from '../../data/conferenceTeams'
import BoxScoreSheetModal from '../../components/BoxScoreSheetModal'
import { parseCFPGameId, getCFPRoundInfo, getCFPSlotDisplayName } from '../../data/cfpConstants'

// Map abbreviations to mascot names for logo lookup
function getMascotName(abbr, teamsData = null) {
  if (teamsData) {
    const result = getMascotNameFromTeams(abbr, teamsData)
    if (result) return result
  }
  const mascotMap = {
    'AFA': 'Air Force Falcons', 'AKR': 'Akron Zips', 'BAMA': 'Alabama Crimson Tide',
    'APP': 'Appalachian State Mountaineers', 'ARIZ': 'Arizona Wildcats',
    'ARK': 'Arkansas Razorbacks', 'ARMY': 'Army Black Knights',
    'ARST': 'Arkansas State Red Wolves', 'ASU': 'Arizona State Sun Devils',
    'AUB': 'Auburn Tigers', 'BALL': 'Ball State Cardinals', 'BC': 'Boston College Eagles',
    'BGSU': 'Bowling Green Falcons', 'BOIS': 'Boise State Broncos',
    'BU': 'Baylor Bears', 'BUFF': 'Buffalo Bulls', 'BYU': 'Brigham Young Cougars',
    'CAL': 'California Golden Bears', 'CCU': 'Coastal Carolina Chanticleers',
    'CHAR': 'Charlotte 49ers', 'CLEM': 'Clemson Tigers', 'CMU': 'Central Michigan Chippewas',
    'COLO': 'Colorado Buffaloes', 'CONN': 'Connecticut Huskies', 'CSU': 'Colorado State Rams',
    'DEL': 'Delaware Fightin\' Blue Hens', 'DUKE': 'Duke Blue Devils',
    'ECU': 'East Carolina Pirates', 'EMU': 'Eastern Michigan Eagles',
    'FIU': 'Florida International Panthers', 'FSU': 'Florida State Seminoles',
    'FAU': 'Florida Atlantic Owls', 'FRES': 'Fresno State Bulldogs', 'FLA': 'Florida Gators',
    'GASO': 'Georgia Southern Eagles', 'GSU': 'Georgia State Panthers',
    'GT': 'Georgia Tech Yellow Jackets', 'UGA': 'Georgia Bulldogs',
    'HAW': 'Hawaii Rainbow Warriors', 'HOU': 'Houston Cougars',
    'ILL': 'Illinois Fighting Illini', 'IU': 'Indiana Hoosiers',
    'IOWA': 'Iowa Hawkeyes', 'ISU': 'Iowa State Cyclones',
    'JKST': 'Jacksonville State Gamecocks', 'JMU': 'James Madison Dukes',
    'KENN': 'Kennesaw State Owls', 'KENT': 'Kent State Golden Flashes',
    'KU': 'Kansas Jayhawks', 'KSU': 'Kansas State Wildcats', 'UK': 'Kentucky Wildcats',
    'LIB': 'Liberty Flames', 'LOU': 'Louisville Cardinals', 'LSU': 'LSU Tigers',
    'LT': 'Louisiana Tech Bulldogs', 'MIA': 'Miami Hurricanes', 'M-OH': 'Miami Redhawks',
    'UMD': 'Maryland Terrapins', 'MASS': 'Massachusetts Minutemen', 'MEM': 'Memphis Tigers',
    'MICH': 'Michigan Wolverines', 'MSU': 'Michigan State Spartans',
    'MTSU': 'Middle Tennessee State Blue Raiders', 'MINN': 'Minnesota Golden Gophers',
    'MISS': 'Ole Miss Rebels', 'MSST': 'Mississippi State Bulldogs', 'MIZ': 'Missouri Tigers',
    'MRSH': 'Marshall Thundering Herd', 'NAVY': 'Navy Midshipmen',
    'NEB': 'Nebraska Cornhuskers', 'NEV': 'Nevada Wolf Pack',
    'UNM': 'New Mexico Lobos', 'NMSU': 'New Mexico State Aggies',
    'UNC': 'North Carolina Tar Heels', 'NCST': 'North Carolina State Wolfpack',
    'UNT': 'North Texas Mean Green', 'NU': 'Northwestern Wildcats',
    'ND': 'Notre Dame Fighting Irish', 'NIU': 'Northern Illinois Huskies',
    'OHIO': 'Ohio Bobcats', 'OSU': 'Ohio State Buckeyes',
    'OKLA': 'Oklahoma Sooners', 'OU': 'Oklahoma Sooners',
    'OKST': 'Oklahoma State Cowboys', 'ODU': 'Old Dominion Monarchs',
    'ORE': 'Oregon Ducks', 'ORST': 'Oregon State Beavers',
    'PSU': 'Penn State Nittany Lions', 'PITT': 'Pittsburgh Panthers',
    'PUR': 'Purdue Boilermakers', 'RICE': 'Rice Owls', 'RUT': 'Rutgers Scarlet Knights',
    'SDSU': 'San Diego State Aztecs', 'SJSU': 'San Jose State Spartans',
    'SAM': 'Sam Houston State Bearkats', 'USF': 'South Florida Bulls',
    'SMU': 'SMU Mustangs', 'USC': 'USC Trojans', 'SCAR': 'South Carolina Gamecocks',
    'STAN': 'Stanford Cardinal', 'SYR': 'Syracuse Orange', 'TCU': 'TCU Horned Frogs',
    'TEM': 'Temple Owls', 'TENN': 'Tennessee Volunteers', 'TEX': 'Texas Longhorns',
    'TXAM': 'Texas A&M Aggies', 'TXST': 'Texas State Bobcats', 'TTU': 'Texas Tech Red Raiders',
    'TOL': 'Toledo Rockets', 'TROY': 'Troy Trojans', 'TUL': 'Tulane Green Wave',
    'TLSA': 'Tulsa Golden Hurricane', 'UAB': 'UAB Blazers', 'UCF': 'UCF Knights',
    'UCLA': 'UCLA Bruins', 'UNLV': 'UNLV Rebels', 'UTEP': 'UTEP Miners',
    'USA': 'South Alabama Jaguars', 'USM': 'Southern Mississippi Golden Eagles',
    'USU': 'Utah State Aggies', 'UTAH': 'Utah Utes', 'UTSA': 'UTSA Roadrunners',
    'VAN': 'Vanderbilt Commodores', 'UVA': 'Virginia Cavaliers',
    'VT': 'Virginia Tech Hokies', 'WAKE': 'Wake Forest Demon Deacons',
    'WASH': 'Washington Huskies', 'WSU': 'Washington State Cougars',
    'WVU': 'West Virginia Mountaineers', 'WMU': 'Western Michigan Broncos',
    'WKU': 'Western Kentucky Hilltoppers', 'WIS': 'Wisconsin Badgers', 'WYO': 'Wyoming Cowboys',
    'FCSE': 'FCS East Judicials', 'FCSM': 'FCS Midwest Rebels',
    'FCSN': 'FCS Northwest Stallions', 'FCSW': 'FCS West Titans'
  }
  return mascotMap[abbr] || null
}

// Robust logo lookup
function getTeamLogoRobust(teamInput, teamsData = null) {
  if (!teamInput) return null
  if (teamsData) {
    const logo = getTeamLogo(teamInput, teamsData)
    if (logo) return logo
  }
  let logo = getTeamLogo(teamInput)
  if (logo) return logo
  const mascotName = getMascotName(teamInput, teamsData)
  if (mascotName) {
    logo = getTeamLogo(mascotName, teamsData)
    if (logo) return logo
  }
  return null
}

// Default neutral colors
const defaultColors = {
  primary: '#1f2937',
  secondary: '#f3f4f6'
}

// Helper to get ordinal suffix (1st, 2nd, 3rd, 4th, etc.)
const getOrdinalSuffix = (num) => {
  if (!num || isNaN(num)) return ''
  const n = parseInt(num)
  if (n >= 11 && n <= 13) return 'th'
  switch (n % 10) {
    case 1: return 'st'
    case 2: return 'nd'
    case 3: return 'rd'
    default: return 'th'
  }
}

export default function GameEdit() {
  const { id, gameId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { currentDynasty, updateDynasty, addGame, isViewOnly } = useDynasty()
  const pathPrefix = usePathPrefix()
  const { user } = useAuth()
  const teamColors = defaultColors

  // Check if this is a new game from URL
  const isNewGameFromUrl = !gameId || gameId === 'new'

  // Track the actual game ID (may be generated for new games)
  const [currentGameId, setCurrentGameId] = useState(isNewGameFromUrl ? null : gameId)
  const [gameCreated, setGameCreated] = useState(!isNewGameFromUrl)

  // CRITICAL: Use ref to prevent race condition in game creation
  // State updates are async and can cause duplicate game creation if effect runs twice quickly
  const gameCreationInProgressRef = useRef(false)

  // isNewGame means we haven't created a game record yet
  const isNewGame = !gameCreated

  // Get query params for new game
  const queryWeek = searchParams.get('week')
  const queryYear = searchParams.get('year')
  const queryTeam1Tid = searchParams.get('team1Tid')
  const queryTeam2Tid = searchParams.get('team2Tid')
  const queryGameType = searchParams.get('gameType')
  const queryBowlName = searchParams.get('bowlName')
  const queryLocation = searchParams.get('location')

  // Toast state
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState('')

  // Box score sheet modal state
  const [showBoxScoreModal, setShowBoxScoreModal] = useState(false)
  const [boxScoreModalType, setBoxScoreModalType] = useState(null) // 'home', 'away', 'scoring', 'teamStats'

  // AI Recap state
  const [isGeneratingRecap, setIsGeneratingRecap] = useState(false)
  const [recapError, setRecapError] = useState(null)
  const [streamingRecap, setStreamingRecap] = useState('')

  // Form state
  const [formData, setFormData] = useState({
    team1Score: '',
    team2Score: '',
    quarters: {
      team1: { Q1: '', Q2: '', Q3: '', Q4: '' },
      team2: { Q1: '', Q2: '', Q3: '', Q4: '' }
    },
    overtimes: [],
    team1Rank: '',
    team2Rank: '',
    team1Overall: '',
    team1Offense: '',
    team1Defense: '',
    team2Overall: '',
    team2Offense: '',
    team2Defense: '',
    team1Record: '',
    team2Record: '',
    team1ConfRecord: '',
    team2ConfRecord: '',
    location: queryLocation || 'home', // home, away, neutral
    aiRecap: '',
    isConferenceGame: false,
    links: [''] // Array of media links (YouTube, images, etc.) - always has at least one empty entry for input
  })

  // Find existing game or set up new game data
  const existingGame = useMemo(() => {
    if (!currentDynasty?.games) return null

    // Direct ID lookup - try currentGameId first (for newly created games), then gameId from URL
    const lookupId = currentGameId || gameId
    if (!lookupId || lookupId === 'new') return null

    let found = currentDynasty.games.find(g => g.id === lookupId)
    if (found) return found

    // CFP Slot ID pattern lookup
    const cfpParsed = parseCFPGameId(gameId)
    if (cfpParsed) {
      const { slotId, year } = cfpParsed
      const qfBowlNames = { cfpqf1: 'Sugar Bowl', cfpqf2: 'Orange Bowl', cfpqf3: 'Rose Bowl', cfpqf4: 'Cotton Bowl' }
      const sfBowlNames = { cfpsf1: 'Peach Bowl', cfpsf2: 'Fiesta Bowl' }
      const frSeedMatchups = { cfpfr1: [5, 12], cfpfr2: [8, 9], cfpfr3: [6, 11], cfpfr4: [7, 10] }

      if (slotId.startsWith('cfpfr')) {
        const [seed1, seed2] = frSeedMatchups[slotId] || []
        found = currentDynasty.games.find(g =>
          g.isCFPFirstRound && Number(g.year) === year &&
          ((g.seed1 === seed1 && g.seed2 === seed2) || (g.seed1 === seed2 && g.seed2 === seed1))
        )
      } else if (slotId.startsWith('cfpqf')) {
        found = currentDynasty.games.find(g =>
          g.isCFPQuarterfinal && Number(g.year) === year && g.bowlName === qfBowlNames[slotId]
        )
      } else if (slotId.startsWith('cfpsf')) {
        found = currentDynasty.games.find(g =>
          g.isCFPSemifinal && Number(g.year) === year && g.bowlName === sfBowlNames[slotId]
        )
      } else if (slotId === 'cfpnc') {
        found = currentDynasty.games.find(g => g.isCFPChampionship && Number(g.year) === year)
      }
    }
    return found || null
  }, [currentDynasty?.games, gameId, currentGameId])

  // Derive team data - merge dynasty.teams WITH TEAMS to preserve static team properties
  // dynasty.teams may have partial data (byYear, userId) that would overwrite complete team info
  const teamsSource = useMemo(() => {
    const merged = { ...TEAMS }
    if (currentDynasty?.teams) {
      Object.entries(currentDynasty.teams).forEach(([key, dynastyTeamData]) => {
        const staticTeam = TEAMS[key]
        if (staticTeam) {
          // Merge: keep static properties, add dynasty-specific data
          merged[key] = { ...staticTeam, ...dynastyTeamData }
          // Ensure critical properties come from static TEAMS if missing
          if (!dynastyTeamData.tid) merged[key].tid = staticTeam.tid
          if (!dynastyTeamData.abbr) merged[key].abbr = staticTeam.abbr
          if (!dynastyTeamData.name) merged[key].name = staticTeam.name
          if (!dynastyTeamData.primaryColor) merged[key].primaryColor = staticTeam.primaryColor
          if (!dynastyTeamData.secondaryColor) merged[key].secondaryColor = staticTeam.secondaryColor
        } else {
          // Teambuilder team - use as-is
          merged[key] = dynastyTeamData
        }
      })
    }
    return merged
  }, [currentDynasty?.teams])

  // Handle multiple game formats: unified (team1Tid/team2Tid), user game (userTid/opponentTid), legacy (userTeam/opponent)
  const resolveTeam1Tid = () => {
    if (existingGame?.team1Tid) return existingGame.team1Tid
    if (existingGame?.userTid) return existingGame.userTid
    if (existingGame?.userTeam) return getTidFromAbbr(existingGame.userTeam)
    if (queryTeam1Tid) return parseInt(queryTeam1Tid)
    return null
  }
  const resolveTeam2Tid = () => {
    if (existingGame?.team2Tid) return existingGame.team2Tid
    if (existingGame?.opponentTid) return existingGame.opponentTid
    if (existingGame?.opponent) return getTidFromAbbr(existingGame.opponent)
    if (queryTeam2Tid) return parseInt(queryTeam2Tid)
    return null
  }

  const team1Tid = resolveTeam1Tid()
  const team2Tid = resolveTeam2Tid()

  const team1Data = team1Tid ? teamsSource[team1Tid] : null
  const team2Data = team2Tid ? teamsSource[team2Tid] : null

  const team1Abbr = team1Data?.abbr || existingGame?.team1 || existingGame?.userTeam || ''
  const team2Abbr = team2Data?.abbr || existingGame?.team2 || existingGame?.opponent || ''

  const team1Name = team1Data?.name || getMascotName(team1Abbr, teamsSource) || team1Abbr
  const team2Name = team2Data?.name || getMascotName(team2Abbr, teamsSource) || team2Abbr

  const team1Logo = getTeamLogoRobust(team1Name, teamsSource) || getTeamLogoRobust(team1Abbr, teamsSource)
  const team2Logo = getTeamLogoRobust(team2Name, teamsSource) || getTeamLogoRobust(team2Abbr, teamsSource)

  const team1Colors = team1Data ? { primary: team1Data.primaryColor, secondary: team1Data.secondaryColor } :
    getTeamColors(team1Name) || defaultColors
  const team2Colors = team2Data ? { primary: team2Data.primaryColor, secondary: team2Data.secondaryColor } :
    getTeamColors(team2Name) || defaultColors

  // Game metadata
  const gameYear = existingGame?.year || (queryYear ? parseInt(queryYear) : currentDynasty?.currentYear)
  const gameWeek = existingGame?.week || queryWeek || ''
  const gameType = existingGame?.gameType || queryGameType || 'regular'
  const bowlName = existingGame?.bowlName || queryBowlName || ''

  // Determine game title
  const getGameTitle = () => {
    if (existingGame?.isCFPChampionship) return 'National Championship'
    if (existingGame?.isCFPSemifinal) return existingGame?.bowlName || 'CFP Semifinal'
    if (existingGame?.isCFPQuarterfinal) return existingGame?.bowlName || 'CFP Quarterfinal'
    if (existingGame?.isCFPFirstRound) return 'CFP First Round'
    if (existingGame?.isConferenceChampionship) return `${existingGame?.conference || ''} Championship`
    if (existingGame?.isBowlGame || bowlName) return bowlName || 'Bowl Game'
    return `Week ${gameWeek}`
  }

  const gameTitle = getGameTitle()
  const gameSubtitle = `${gameYear} ${existingGame?.isConferenceChampionship || existingGame?.isBowlGame || existingGame?.isCFPFirstRound || existingGame?.isCFPQuarterfinal || existingGame?.isCFPSemifinal || existingGame?.isCFPChampionship ? 'Postseason' : 'Regular Season'}`

  // Detect if either team is the user's team FOR THIS GAME'S YEAR
  // Uses coachTeamByYear to handle job changes - check what team user coached in the game's year
  const getUserTidForYear = (year) => {
    if (!year) return currentDynasty?.currentTid
    const yearNum = Number(year)
    const yearStr = String(year)
    // Check coachTeamByYear first (handles historical games correctly)
    const coachEntry = currentDynasty?.coachTeamByYear?.[yearNum] || currentDynasty?.coachTeamByYear?.[yearStr]
    if (coachEntry?.tid) return coachEntry.tid
    // Fallback to current tid for current year games
    if (yearNum === Number(currentDynasty?.currentYear)) return currentDynasty?.currentTid
    return null
  }
  const userTidForGame = getUserTidForYear(gameYear)
  const isTeam1UserTeam = team1Tid === userTidForGame
  const isTeam2UserTeam = team2Tid === userTidForGame

  // Auto-detect conference game
  const customConferences = getCurrentCustomConferences(currentDynasty)
  const team1Conference = getTeamConference(team1Abbr, customConferences)
  const team2Conference = getTeamConference(team2Abbr, customConferences)
  const isConferenceGame = team1Conference && team2Conference &&
    team1Conference === team2Conference && team1Conference !== 'Independent'

  // Display order: Away team on left/top, Home team on right/bottom
  // location 'home' = team1 is home, 'away' = team2 is home, 'neutral' = keep order
  const isTeam1Home = formData.location === 'home'
  const isTeam2Home = formData.location === 'away'

  // Display variables - swap order so away is always first (left/top) and home is always second (right/bottom)
  const displayLeftTeam = isTeam1Home ? 'team2' : 'team1'
  const displayRightTeam = isTeam1Home ? 'team1' : 'team2'

  const leftTeamTid = isTeam1Home ? team2Tid : team1Tid
  const rightTeamTid = isTeam1Home ? team1Tid : team2Tid
  const leftTeamName = isTeam1Home ? team2Name : team1Name
  const rightTeamName = isTeam1Home ? team1Name : team2Name
  const leftTeamAbbr = isTeam1Home ? team2Abbr : team1Abbr
  const rightTeamAbbr = isTeam1Home ? team1Abbr : team2Abbr
  const leftTeamLogo = isTeam1Home ? team2Logo : team1Logo
  const rightTeamLogo = isTeam1Home ? team1Logo : team2Logo
  const leftTeamColors = isTeam1Home ? team2Colors : team1Colors
  const rightTeamColors = isTeam1Home ? team1Colors : team2Colors

  // Calculate team records - uses centralized function, excludes current game being edited
  const calculateTeamRecord = (tid, year) => {
    if (!currentDynasty?.games || !tid) return ''

    // Use centralized calculation, excluding the current game
    const record = calculateTeamRecordFromGames(currentDynasty, tid, year, {
      upToGameId: existingGame?.id // Exclude current game from calculation
    })

    // Return empty string if no games found - don't auto-fill "0-0"
    if (record.wins === 0 && record.losses === 0) return ''

    return `${record.wins}-${record.losses}`
  }

  // Get team ratings from dynasty data - checks multiple possible storage locations
  const getTeamRatings = (tid, year) => {
    if (!tid) return { overall: '', offense: '', defense: '' }
    const abbr = teamsSource[tid]?.abbr

    // Try multiple storage locations for ratings
    // 1. New tid-based byYear structure
    let ratings = currentDynasty?.teams?.[tid]?.byYear?.[year]?.ratings

    // 2. teamRatingsByYear[abbr][year] structure
    if (!ratings) {
      ratings = currentDynasty?.teamRatingsByYear?.[abbr]?.[year]
    }

    // 3. If this is the current user team and current year, check teamRatings
    const currentUserTid = currentDynasty?.currentTid
    const currentYear = currentDynasty?.currentYear
    if (!ratings && tid === currentUserTid && Number(year) === Number(currentYear)) {
      ratings = currentDynasty?.teamRatings
    }

    return {
      overall: ratings?.overall?.toString() || '',
      offense: ratings?.offense?.toString() || '',
      defense: ratings?.defense?.toString() || ''
    }
  }

  // Create game record immediately when opening a new game
  useEffect(() => {
    const createInitialGame = async () => {
      // Guard 1: Basic state checks
      if (!isNewGameFromUrl || gameCreated || !currentDynasty?.id) return
      if (!team1Tid && !team2Tid) return // Wait for team data

      // Guard 2: CRITICAL - Use ref to prevent race condition
      // React state updates are async, so if this effect runs twice quickly,
      // both calls could pass the state check above before setGameCreated takes effect
      if (gameCreationInProgressRef.current) {
        console.log('[GameEdit] Game creation already in progress, skipping duplicate attempt')
        return
      }
      gameCreationInProgressRef.current = true

      const targetWeek = queryWeek ? parseInt(queryWeek) : null
      const targetYear = queryYear ? parseInt(queryYear) : currentDynasty.currentYear
      const targetGameType = queryGameType || 'regular'

      // Guard 3: Check if a game already exists for this week/year/gameType
      // This prevents duplicates even if the ref guard somehow fails
      const existingGames = currentDynasty.games || []
      const duplicateGame = existingGames.find(g =>
        Number(g.week) === targetWeek &&
        Number(g.year) === targetYear &&
        g.gameType === targetGameType &&
        (g.team1Tid === team1Tid || g.team2Tid === team1Tid || g.userTid === team1Tid)
      )

      if (duplicateGame) {
        console.log('[GameEdit] Game already exists for this week/year/gameType, using existing:', duplicateGame.id)
        setCurrentGameId(duplicateGame.id)
        setGameCreated(true)
        gameCreationInProgressRef.current = false
        navigate(`${pathPrefix}/game/${duplicateGame.id}/edit`, { replace: true, state: location.state })
        return
      }

      const newGameId = `game-${Date.now()}`
      const initialGameData = {
        id: newGameId,
        week: targetWeek ?? '',
        year: targetYear,
        gameType: targetGameType,
        team1Tid: team1Tid || null,
        team2Tid: team2Tid || null,
        team1Score: 0,
        team2Score: 0,
        ...(queryBowlName && { bowlName: queryBowlName, isBowlGame: true }),
        ...(queryGameType === 'conference_championship' && { isConferenceChampionship: true }),
        ...(queryGameType === 'cfp_first_round' && { isCFPFirstRound: true }),
        ...(queryGameType === 'cfp_quarterfinal' && { isCFPQuarterfinal: true }),
        ...(queryGameType === 'cfp_semifinal' && { isCFPSemifinal: true }),
        ...(queryGameType === 'cfp_championship' && { isCFPChampionship: true })
      }

      try {
        const games = currentDynasty.games || []
        await updateDynasty(currentDynasty.id, { games: [...games, initialGameData] })
        setCurrentGameId(newGameId)
        setGameCreated(true)
        // Update URL to reflect the new game ID without adding to history
        navigate(`${pathPrefix}/game/${newGameId}/edit`, { replace: true, state: location.state })
      } catch (error) {
        console.error('Error creating initial game:', error)
      } finally {
        gameCreationInProgressRef.current = false
      }
    }

    createInitialGame()
  }, [isNewGameFromUrl, gameCreated, currentDynasty?.id, team1Tid, team2Tid])

  // Initialize form data from existing game or query params
  useEffect(() => {
    if (existingGame) {
      // Use resolved team tids (handles legacy formats)
      const resolvedTeam1Tid = existingGame.team1Tid || existingGame.userTid || (existingGame.userTeam ? getTidFromAbbr(existingGame.userTeam) : null)
      const resolvedTeam2Tid = existingGame.team2Tid || existingGame.opponentTid || (existingGame.opponent ? getTidFromAbbr(existingGame.opponent) : null)

      const team1Ratings = getTeamRatings(resolvedTeam1Tid, existingGame.year)
      const team2Ratings = getTeamRatings(resolvedTeam2Tid, existingGame.year)
      const team1Rec = calculateTeamRecord(resolvedTeam1Tid, existingGame.year)
      const team2Rec = calculateTeamRecord(resolvedTeam2Tid, existingGame.year)

      // Resolve scores - handle both unified (team1Score/team2Score) and legacy (teamScore/opponentScore) formats
      const score1 = existingGame.team1Score ?? existingGame.teamScore
      const score2 = existingGame.team2Score ?? existingGame.opponentScore

      // Resolve location
      let locationValue = 'neutral'
      if (existingGame.homeTeamTid) {
        locationValue = existingGame.homeTeamTid === resolvedTeam1Tid ? 'home' :
          existingGame.homeTeamTid === resolvedTeam2Tid ? 'away' : 'neutral'
      } else if (existingGame.location) {
        locationValue = existingGame.location
      }

      setFormData({
        team1Score: score1?.toString() || '',
        team2Score: score2?.toString() || '',
        quarters: existingGame.quarters || {
          team1: { Q1: '', Q2: '', Q3: '', Q4: '' },
          team2: { Q1: '', Q2: '', Q3: '', Q4: '' }
        },
        overtimes: existingGame.overtimes || [],
        team1Rank: existingGame.team1Rank?.toString() || existingGame.userRank?.toString() || '',
        team2Rank: existingGame.team2Rank?.toString() || existingGame.opponentRank?.toString() || '',
        team1Overall: existingGame.team1Overall?.toString() || team1Ratings.overall,
        team1Offense: existingGame.team1Offense?.toString() || team1Ratings.offense,
        team1Defense: existingGame.team1Defense?.toString() || team1Ratings.defense,
        team2Overall: existingGame.team2Overall?.toString() || team2Ratings.overall,
        team2Offense: existingGame.team2Offense?.toString() || team2Ratings.offense,
        team2Defense: existingGame.team2Defense?.toString() || team2Ratings.defense,
        team1Record: existingGame.team1Record || team1Rec,
        team2Record: existingGame.team2Record || team2Rec,
        team1ConfRecord: existingGame.team1ConfRecord || '',
        team2ConfRecord: existingGame.team2ConfRecord || '',
        location: locationValue,
        aiRecap: existingGame.aiRecap || existingGame.gameNote || '',
        isConferenceGame: existingGame.isConferenceGame || isConferenceGame,
        // Handle both old format (comma-separated string) and new format (array)
        links: Array.isArray(existingGame.links)
          ? [...existingGame.links.filter(l => l.trim()), ''] // Existing array + empty input
          : existingGame.links
            ? [...existingGame.links.split(',').map(l => l.trim()).filter(l => l), ''] // Convert string to array
            : [''] // Default empty input
      })
    } else if (isNewGame && team1Tid && team2Tid) {
      // New game - fetch ratings and calculate records
      const team1Ratings = getTeamRatings(team1Tid, gameYear)
      const team2Ratings = getTeamRatings(team2Tid, gameYear)
      const team1Rec = calculateTeamRecord(team1Tid, gameYear)
      const team2Rec = calculateTeamRecord(team2Tid, gameYear)

      setFormData(prev => ({
        ...prev,
        team1Overall: team1Ratings.overall,
        team1Offense: team1Ratings.offense,
        team1Defense: team1Ratings.defense,
        team2Overall: team2Ratings.overall,
        team2Offense: team2Ratings.offense,
        team2Defense: team2Ratings.defense,
        team1Record: team1Rec,
        team2Record: team2Rec,
        location: queryLocation || prev.location,
        isConferenceGame
      }))
    }
  }, [existingGame, isNewGame, team1Tid, team2Tid, gameYear, queryLocation])

  // Quarter score helpers
  const hasQuarterScores = () => {
    const quarters = formData.quarters
    if (!quarters?.team1 || !quarters?.team2) return false
    return Object.values(quarters.team1).some(v => v !== '') || Object.values(quarters.team2).some(v => v !== '')
  }

  const calculateTotalFromQuarters = (teamKey, quarters = formData.quarters, overtimes = formData.overtimes) => {
    let total = 0
    if (quarters?.[teamKey]) {
      Object.values(quarters[teamKey]).forEach(score => {
        if (score !== '') total += parseInt(score) || 0
      })
    }
    if (overtimes) {
      overtimes.forEach(ot => {
        const otScore = ot?.[teamKey]
        if (otScore !== '' && otScore != null) total += parseInt(otScore) || 0
      })
    }
    return total
  }

  const handleQuarterChange = (teamKey, quarter, value) => {
    const defaultQuarters = { Q1: '', Q2: '', Q3: '', Q4: '' }
    const currentQuarters = formData.quarters || { team1: defaultQuarters, team2: defaultQuarters }
    const newQuarters = {
      ...currentQuarters,
      [teamKey]: {
        ...(currentQuarters[teamKey] || defaultQuarters),
        [quarter]: value
      }
    }

    const newFormData = { ...formData, quarters: newQuarters }

    // Auto-calculate totals if quarters are being used
    if (hasQuarterScores() || value !== '') {
      newFormData.team1Score = calculateTotalFromQuarters('team1', newQuarters, formData.overtimes).toString()
      newFormData.team2Score = calculateTotalFromQuarters('team2', newQuarters, formData.overtimes).toString()
    }

    // Check if all quarters are filled and regulation is tied
    const allQuartersFilled =
      newQuarters.team1?.Q1 !== '' && newQuarters.team1?.Q2 !== '' &&
      newQuarters.team1?.Q3 !== '' && newQuarters.team1?.Q4 !== '' &&
      newQuarters.team2?.Q1 !== '' && newQuarters.team2?.Q2 !== '' &&
      newQuarters.team2?.Q3 !== '' && newQuarters.team2?.Q4 !== ''

    if (allQuartersFilled) {
      const team1Regulation = calculateTotalFromQuarters('team1', newQuarters, [])
      const team2Regulation = calculateTotalFromQuarters('team2', newQuarters, [])

      if (team1Regulation === team2Regulation) {
        if (formData.overtimes.length === 0) {
          newFormData.overtimes = [{ team1: '', team2: '' }]
        }
      } else {
        newFormData.overtimes = []
      }
    } else if (formData.overtimes.length > 0) {
      newFormData.overtimes = []
    }

    setFormData(newFormData)
  }

  const handleOvertimeChange = (index, teamKey, value) => {
    const newOvertimes = [...formData.overtimes]
    newOvertimes[index] = { ...newOvertimes[index], [teamKey]: value }

    const newFormData = { ...formData, overtimes: newOvertimes }
    newFormData.team1Score = calculateTotalFromQuarters('team1', formData.quarters, newOvertimes).toString()
    newFormData.team2Score = calculateTotalFromQuarters('team2', formData.quarters, newOvertimes).toString()

    // Check if tied after this OT, add another if needed
    const team1Total = calculateTotalFromQuarters('team1', formData.quarters, newOvertimes)
    const team2Total = calculateTotalFromQuarters('team2', formData.quarters, newOvertimes)
    const lastOT = newOvertimes[newOvertimes.length - 1]
    if (lastOT?.team1 !== '' && lastOT?.team2 !== '' && team1Total === team2Total) {
      newFormData.overtimes = [...newOvertimes, { team1: '', team2: '' }]
    }

    setFormData(newFormData)
  }

  // Handle save
  const handleSave = async () => {
    try {
      // Determine homeTeamTid
      let homeTeamTid = null
      const isNeutralGame = gameType !== 'regular'
      if (!isNeutralGame) {
        if (formData.location === 'home') homeTeamTid = team1Tid
        else if (formData.location === 'away') homeTeamTid = team2Tid
      }

      const gameData = {
        id: currentGameId || existingGame?.id || `game-${Date.now()}`,
        week: gameWeek,
        year: gameYear,
        gameType: existingGame?.gameType || gameType,
        team1Tid,
        team2Tid,
        team1Score: parseInt(formData.team1Score) || 0,
        team2Score: parseInt(formData.team2Score) || 0,
        quarters: formData.quarters,
        overtimes: formData.overtimes,
        team1Rank: formData.team1Rank ? parseInt(formData.team1Rank) : null,
        team2Rank: formData.team2Rank ? parseInt(formData.team2Rank) : null,
        team1Overall: formData.team1Overall ? parseInt(formData.team1Overall) : null,
        team1Offense: formData.team1Offense ? parseInt(formData.team1Offense) : null,
        team1Defense: formData.team1Defense ? parseInt(formData.team1Defense) : null,
        team2Overall: formData.team2Overall ? parseInt(formData.team2Overall) : null,
        team2Offense: formData.team2Offense ? parseInt(formData.team2Offense) : null,
        team2Defense: formData.team2Defense ? parseInt(formData.team2Defense) : null,
        team1Record: formData.team1Record,
        team2Record: formData.team2Record,
        team1ConfRecord: formData.team1ConfRecord,
        team2ConfRecord: formData.team2ConfRecord,
        homeTeamTid,
        isConferenceGame: formData.isConferenceGame || isConferenceGame,
        aiRecap: formData.aiRecap,
        userTid: existingGame?.userTid || team1Tid,
        // Set game type flags from existingGame or gameType query param for new games
        ...(existingGame?.isBowlGame && { isBowlGame: true, bowlName: existingGame.bowlName }),
        ...(!existingGame && gameType === 'bowl' && { isBowlGame: true, bowlName }),
        ...(existingGame?.isConferenceChampionship && { isConferenceChampionship: true, conference: existingGame.conference }),
        ...(!existingGame && gameType === 'conference_championship' && { isConferenceChampionship: true }),
        ...(existingGame?.isCFPFirstRound && { isCFPFirstRound: true }),
        ...(!existingGame && gameType === 'cfp_first_round' && { isCFPFirstRound: true }),
        ...(existingGame?.isCFPQuarterfinal && { isCFPQuarterfinal: true }),
        ...(!existingGame && gameType === 'cfp_quarterfinal' && { isCFPQuarterfinal: true, bowlName }),
        ...(existingGame?.isCFPSemifinal && { isCFPSemifinal: true }),
        ...(!existingGame && gameType === 'cfp_semifinal' && { isCFPSemifinal: true, bowlName }),
        ...(existingGame?.isCFPChampionship && { isCFPChampionship: true }),
        ...(!existingGame && gameType === 'cfp_championship' && { isCFPChampionship: true }),
        ...(existingGame?.boxScore && { boxScore: existingGame.boxScore }),
        // Save links as array (filter out empty entries)
        ...(() => {
          const validLinks = formData.links.filter(l => l.trim())
          return validLinks.length > 0 ? { links: validLinks } : {}
        })()
      }

      // Update or add game
      const games = currentDynasty.games || []
      const existingIndex = games.findIndex(g => g.id === gameData.id)

      let updatedGames
      if (existingIndex >= 0) {
        updatedGames = [...games]
        updatedGames[existingIndex] = { ...games[existingIndex], ...gameData }
      } else {
        updatedGames = [...games, gameData]
      }

      // Build record updates for both teams involved
      const dynastyWithUpdatedGames = { ...currentDynasty, games: updatedGames }
      let recordUpdates = {}
      if (team1Tid) {
        Object.assign(recordUpdates, buildRecordUpdatePayload(dynastyWithUpdatedGames, team1Tid, gameYear))
      }
      if (team2Tid && team2Tid !== team1Tid) {
        Object.assign(recordUpdates, buildRecordUpdatePayload(dynastyWithUpdatedGames, team2Tid, gameYear))
      }

      await updateDynasty(currentDynasty.id, { games: updatedGames, ...recordUpdates })

      setToastMessage('Game saved successfully!')
      setShowToast(true)
      setTimeout(() => setShowToast(false), 3000)

      // Navigate to the game page
      navigate(`${pathPrefix}/game/${gameData.id}`)
    } catch (error) {
      console.error('Error saving game:', error)
      setToastMessage('Error saving game')
      setShowToast(true)
      setTimeout(() => setShowToast(false), 3000)
    }
  }

  // Handle cancel
  const handleCancel = () => {
    if (location.state?.from) {
      navigate(location.state.from)
    } else if (currentGameId || existingGame) {
      navigate(`${pathPrefix}/game/${currentGameId || gameId}`)
    } else {
      navigate(-1)
    }
  }

  // Save game data silently (without navigation or toast) - used for auto-save
  const saveGameDataSilently = async () => {
    if (!currentDynasty?.id) return false

    try {
      // Determine homeTeamTid
      let homeTeamTid = null
      const isNeutralGame = gameType !== 'regular'
      if (!isNeutralGame) {
        if (formData.location === 'home') homeTeamTid = team1Tid
        else if (formData.location === 'away') homeTeamTid = team2Tid
      }

      const gameData = {
        id: currentGameId || existingGame?.id || `game-${Date.now()}`,
        week: gameWeek,
        year: gameYear,
        gameType: existingGame?.gameType || gameType,
        team1Tid,
        team2Tid,
        team1Score: parseInt(formData.team1Score) || 0,
        team2Score: parseInt(formData.team2Score) || 0,
        quarters: formData.quarters,
        overtimes: formData.overtimes,
        team1Rank: formData.team1Rank ? parseInt(formData.team1Rank) : null,
        team2Rank: formData.team2Rank ? parseInt(formData.team2Rank) : null,
        team1Overall: formData.team1Overall ? parseInt(formData.team1Overall) : null,
        team1Offense: formData.team1Offense ? parseInt(formData.team1Offense) : null,
        team1Defense: formData.team1Defense ? parseInt(formData.team1Defense) : null,
        team2Overall: formData.team2Overall ? parseInt(formData.team2Overall) : null,
        team2Offense: formData.team2Offense ? parseInt(formData.team2Offense) : null,
        team2Defense: formData.team2Defense ? parseInt(formData.team2Defense) : null,
        team1Record: formData.team1Record,
        team2Record: formData.team2Record,
        team1ConfRecord: formData.team1ConfRecord,
        team2ConfRecord: formData.team2ConfRecord,
        homeTeamTid,
        isConferenceGame: formData.isConferenceGame || isConferenceGame,
        aiRecap: formData.aiRecap,
        userTid: existingGame?.userTid || team1Tid,
        // Preserve game type flags
        ...(existingGame?.isBowlGame && { isBowlGame: true, bowlName: existingGame.bowlName }),
        ...(!existingGame && gameType === 'bowl' && { isBowlGame: true, bowlName }),
        ...(existingGame?.isConferenceChampionship && { isConferenceChampionship: true, conference: existingGame.conference }),
        ...(!existingGame && gameType === 'conference_championship' && { isConferenceChampionship: true }),
        ...(existingGame?.isCFPFirstRound && { isCFPFirstRound: true }),
        ...(!existingGame && gameType === 'cfp_first_round' && { isCFPFirstRound: true }),
        ...(existingGame?.isCFPQuarterfinal && { isCFPQuarterfinal: true }),
        ...(!existingGame && gameType === 'cfp_quarterfinal' && { isCFPQuarterfinal: true, bowlName }),
        ...(existingGame?.isCFPSemifinal && { isCFPSemifinal: true }),
        ...(!existingGame && gameType === 'cfp_semifinal' && { isCFPSemifinal: true, bowlName }),
        ...(existingGame?.isCFPChampionship && { isCFPChampionship: true }),
        ...(!existingGame && gameType === 'cfp_championship' && { isCFPChampionship: true }),
        ...(existingGame?.boxScore && { boxScore: existingGame.boxScore }),
        // Save links as array (filter out empty entries)
        ...(() => {
          const validLinks = formData.links.filter(l => l.trim())
          return validLinks.length > 0 ? { links: validLinks } : {}
        })()
      }

      // Update or add game
      const games = currentDynasty.games || []
      const existingIndex = games.findIndex(g => g.id === gameData.id)

      let updatedGames
      if (existingIndex >= 0) {
        updatedGames = [...games]
        updatedGames[existingIndex] = { ...games[existingIndex], ...gameData }
      } else {
        updatedGames = [...games, gameData]
      }

      // Build record updates for both teams involved
      const dynastyWithUpdatedGames = { ...currentDynasty, games: updatedGames }
      let recordUpdates = {}
      if (team1Tid) {
        Object.assign(recordUpdates, buildRecordUpdatePayload(dynastyWithUpdatedGames, team1Tid, gameYear))
      }
      if (team2Tid && team2Tid !== team1Tid) {
        Object.assign(recordUpdates, buildRecordUpdatePayload(dynastyWithUpdatedGames, team2Tid, gameYear))
      }

      await updateDynasty(currentDynasty.id, { games: updatedGames, ...recordUpdates })
      return true
    } catch (error) {
      console.error('Error auto-saving game:', error)
      return false
    }
  }

  // Open box score modal - auto-saves game data first to prevent data loss
  const openBoxScoreModal = async (type) => {
    // Auto-save current form data before opening modal
    await saveGameDataSilently()
    setBoxScoreModalType(type)
    setShowBoxScoreModal(true)
  }

  // Handle box score save from modal
  const handleBoxScoreSave = async (data) => {
    if (!currentGameId || !currentDynasty?.id) return

    try {
      const games = currentDynasty.games || []
      const existingGame = games.find(g => g.id === currentGameId)

      if (existingGame) {
        const updatedGame = { ...existingGame }

        // Ensure boxScore object exists
        if (!updatedGame.boxScore) {
          updatedGame.boxScore = {}
        }

        // Update game with box score data based on sheet type
        // All data goes under game.boxScore to match Game.jsx expectations
        if (boxScoreModalType === 'teamStats') {
          updatedGame.boxScore.teamStats = data
        } else if (boxScoreModalType === 'scoring') {
          updatedGame.boxScore.scoringSummary = data
        } else if (boxScoreModalType === 'home') {
          updatedGame.boxScore.home = data
        } else if (boxScoreModalType === 'away') {
          updatedGame.boxScore.away = data
        }

        // Use addGame to ensure delta tracking is applied for player stats
        // This prevents double-counting when editing a game multiple times
        await addGame(currentDynasty.id, updatedGame)
      }
    } catch (error) {
      console.error('Error saving box score data:', error)
    }
  }

  // Generate AI recap
  const handleGenerateRecap = async () => {
    if (!user?.uid) return

    setIsGeneratingRecap(true)
    setRecapError(null)
    setStreamingRecap('')

    try {
      // Get user's AI configuration (provider, model, API keys)
      const aiConfig = await getAiConfig(user.uid)
      const provider = aiConfig?.provider || 'gemini'
      const apiKey = aiConfig?.apiKeys?.[provider]

      if (!apiKey) {
        setRecapError(`No API key configured. Add your ${provider === 'gemini' ? 'Gemini' : provider} API key in AI Settings.`)
        return
      }

      // Fetch custom instructions
      const customInstructions = await getCustomRecapInstructions(user.uid)
      const model = aiConfig?.model || 'gemini-2.5-flash'

      // Build game object for recap generation
      const gameForRecap = {
        ...gameData,
        team1: team1Name,
        team2: team2Name,
        team1Score: formData.team1Score,
        team2Score: formData.team2Score,
        quarters: formData.quarters,
        gameType,
        bowlName,
        year: gameYear
      }

      // Use streaming to show progress (pass provider as last parameter)
      const result = await generateGameRecap(currentDynasty, gameForRecap, apiKey, (partialText) => {
        setStreamingRecap(partialText)
      }, customInstructions, user.uid, model, provider)

      setFormData(prev => ({ ...prev, aiRecap: result.text }))
      setStreamingRecap('')
    } catch (error) {
      setRecapError(error.message)
    } finally {
      setIsGeneratingRecap(false)
    }
  }

  // View-only check
  if (isViewOnly) {
    return (
      <div className="p-4 text-center">
        <p className="text-gray-600">Editing is not available in view-only mode.</p>
        <button onClick={() => navigate(-1)} className="mt-4 px-4 py-2 bg-gray-800 text-white rounded-lg">
          Go Back
        </button>
      </div>
    )
  }

  // Loading state
  if (!isNewGame && !existingGame) {
    return (
      <div className="p-4 text-center">
        <p className="text-gray-600">Game not found.</p>
        <button onClick={() => navigate(-1)} className="mt-4 px-4 py-2 bg-gray-800 text-white rounded-lg">
          Go Back
        </button>
      </div>
    )
  }

  // Header gradient - uses display order (away on left, home on right)
  const headerGradient = `linear-gradient(135deg, ${leftTeamColors.primary} 0%, ${leftTeamColors.primary} 50%, ${rightTeamColors.primary} 50%, ${rightTeamColors.primary} 100%)`

  return (
    <div className="space-y-4">
      {/* Toast notification */}
      {showToast && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg">
          {toastMessage}
        </div>
      )}

      {/* Header */}
      <div className="bg-gray-900 rounded-xl overflow-hidden shadow-lg">
        <div className="px-3 py-2 sm:px-4 sm:py-2.5 flex items-center justify-between" style={{ background: headerGradient }}>
          <button
            onClick={handleCancel}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium text-xs sm:text-sm bg-black/20 text-white hover:bg-black/30 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="hidden sm:inline">Cancel</span>
          </button>

          <div className="text-white text-center">
            <div className="text-sm sm:text-base font-bold">{isNewGame ? 'New Game' : `Edit: ${gameTitle}`}</div>
            <div className="text-[10px] sm:text-xs opacity-80">{gameSubtitle}</div>
          </div>

          <button
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium text-xs sm:text-sm bg-green-600 text-white hover:bg-green-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="hidden sm:inline">Save</span>
          </button>
        </div>

        {/* Scoreboard - Away team on left, Home team on right */}
        <div className="px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex items-center justify-center gap-4 sm:gap-8">
            {/* Left Team (Away) */}
            <div className="flex-1 text-center">
              <div className="flex flex-col items-center gap-2">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white p-2 shadow-lg">
                  {leftTeamLogo && <img src={leftTeamLogo} alt={leftTeamName} className="w-full h-full object-contain" />}
                </div>
                <div className="text-white text-xs sm:text-sm font-medium truncate max-w-[120px] sm:max-w-[160px]">
                  {leftTeamName}
                </div>
                {formData[`${displayLeftTeam}Rank`] && (
                  <div className="text-yellow-400 text-xs">#{formData[`${displayLeftTeam}Rank`]}</div>
                )}
              </div>
            </div>

            {/* Score */}
            <div className="flex items-center gap-3 sm:gap-4">
              <input
                type="number"
                value={formData[`${displayLeftTeam}Score`]}
                onChange={(e) => !hasQuarterScores() && setFormData({ ...formData, [`${displayLeftTeam}Score`]: e.target.value })}
                className={`w-16 sm:w-20 text-2xl sm:text-4xl font-bold text-center bg-gray-800 border-2 rounded-lg py-2 ${hasQuarterScores() ? 'text-gray-400 cursor-not-allowed' : 'text-white'}`}
                style={{ borderColor: leftTeamColors.primary }}
                disabled={hasQuarterScores()}
                min="0"
              />
              <span className="text-white text-xl sm:text-2xl font-bold">-</span>
              <input
                type="number"
                value={formData[`${displayRightTeam}Score`]}
                onChange={(e) => !hasQuarterScores() && setFormData({ ...formData, [`${displayRightTeam}Score`]: e.target.value })}
                className={`w-16 sm:w-20 text-2xl sm:text-4xl font-bold text-center bg-gray-800 border-2 rounded-lg py-2 ${hasQuarterScores() ? 'text-gray-400 cursor-not-allowed' : 'text-white'}`}
                style={{ borderColor: rightTeamColors.primary }}
                disabled={hasQuarterScores()}
                min="0"
              />
            </div>

            {/* Right Team (Home) */}
            <div className="flex-1 text-center">
              <div className="flex flex-col items-center gap-2">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white p-2 shadow-lg">
                  {rightTeamLogo && <img src={rightTeamLogo} alt={rightTeamName} className="w-full h-full object-contain" />}
                </div>
                <div className="text-white text-xs sm:text-sm font-medium truncate max-w-[120px] sm:max-w-[160px]">
                  {rightTeamName}
                </div>
                {formData[`${displayRightTeam}Rank`] && (
                  <div className="text-yellow-400 text-xs">#{formData[`${displayRightTeam}Rank`]}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quarter-by-Quarter Scoring */}
      <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">Quarter-by-Quarter Scoring</h3>
        <p className="text-xs text-gray-500 mb-4">Enter quarter scores to auto-calculate total, or enter total directly above.</p>

        <div className="overflow-x-auto">
          <div className="min-w-[400px]">
            {/* Headers - dynamic columns for Q1-Q4 + OT columns + Total */}
            <div className="grid gap-2 items-center mb-2" style={{ gridTemplateColumns: `1fr repeat(${4 + formData.overtimes.length}, 50px) 60px` }}>
              <div className="text-xs font-semibold text-gray-600">Team</div>
              <div className="text-xs font-semibold text-gray-600 text-center">Q1</div>
              <div className="text-xs font-semibold text-gray-600 text-center">Q2</div>
              <div className="text-xs font-semibold text-gray-600 text-center">Q3</div>
              <div className="text-xs font-semibold text-gray-600 text-center">Q4</div>
              {formData.overtimes.map((_, idx) => (
                <div key={`ot-header-${idx}`} className="text-xs font-semibold text-gray-600 text-center">OT{idx + 1}</div>
              ))}
              <div className="text-xs font-semibold text-gray-600 text-center">Total</div>
            </div>

            {/* Away Team Row (left/top) */}
            <div className="grid gap-2 items-center mb-2" style={{ gridTemplateColumns: `1fr repeat(${4 + formData.overtimes.length}, 50px) 60px` }}>
              <div className="flex items-center gap-2">
                {leftTeamLogo && <img src={leftTeamLogo} alt="" className="w-6 h-6 object-contain" />}
                <span className="text-sm font-medium truncate">{leftTeamAbbr}</span>
              </div>
              {['Q1', 'Q2', 'Q3', 'Q4'].map((q) => (
                <input
                  key={q}
                  type="number"
                  value={formData.quarters?.[displayLeftTeam]?.[q] ?? ''}
                  onChange={(e) => handleQuarterChange(displayLeftTeam, q, e.target.value)}
                  onBlur={(e) => {
                    if (e.target.value === '') handleQuarterChange(displayLeftTeam, q, '0')
                  }}
                  className="w-full px-2 py-1 border-2 rounded text-center text-sm"
                  style={{ borderColor: leftTeamColors.primary }}
                  min="0"
                  placeholder="0"
                />
              ))}
              {formData.overtimes.map((ot, idx) => (
                <input
                  key={`ot-left-${idx}`}
                  type="number"
                  value={ot[displayLeftTeam] ?? ''}
                  onChange={(e) => handleOvertimeChange(idx, displayLeftTeam, e.target.value)}
                  onBlur={(e) => {
                    if (e.target.value === '') handleOvertimeChange(idx, displayLeftTeam, '0')
                  }}
                  className="w-full px-2 py-1 border-2 rounded text-center text-sm"
                  style={{ borderColor: leftTeamColors.primary }}
                  min="0"
                  placeholder="0"
                />
              ))}
              <div className="text-center font-bold text-lg" style={{ color: leftTeamColors.primary }}>
                {formData[`${displayLeftTeam}Score`] || '0'}
              </div>
            </div>

            {/* Home Team Row (right/bottom) */}
            <div className="grid gap-2 items-center mb-2" style={{ gridTemplateColumns: `1fr repeat(${4 + formData.overtimes.length}, 50px) 60px` }}>
              <div className="flex items-center gap-2">
                {rightTeamLogo && <img src={rightTeamLogo} alt="" className="w-6 h-6 object-contain" />}
                <span className="text-sm font-medium truncate">{rightTeamAbbr}</span>
              </div>
              {['Q1', 'Q2', 'Q3', 'Q4'].map((q) => (
                <input
                  key={q}
                  type="number"
                  value={formData.quarters?.[displayRightTeam]?.[q] ?? ''}
                  onChange={(e) => handleQuarterChange(displayRightTeam, q, e.target.value)}
                  onBlur={(e) => {
                    if (e.target.value === '') handleQuarterChange(displayRightTeam, q, '0')
                  }}
                  className="w-full px-2 py-1 border-2 rounded text-center text-sm"
                  style={{ borderColor: rightTeamColors.primary }}
                  min="0"
                  placeholder="0"
                />
              ))}
              {formData.overtimes.map((ot, idx) => (
                <input
                  key={`ot-right-${idx}`}
                  type="number"
                  value={ot[displayRightTeam] ?? ''}
                  onChange={(e) => handleOvertimeChange(idx, displayRightTeam, e.target.value)}
                  onBlur={(e) => {
                    if (e.target.value === '') handleOvertimeChange(idx, displayRightTeam, '0')
                  }}
                  className="w-full px-2 py-1 border-2 rounded text-center text-sm"
                  style={{ borderColor: rightTeamColors.primary }}
                  min="0"
                  placeholder="0"
                />
              ))}
              <div className="text-center font-bold text-lg" style={{ color: rightTeamColors.primary }}>
                {formData[`${displayRightTeam}Score`] || '0'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Team Details - Side by Side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Team 1 Details */}
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6" style={{ borderTop: `4px solid ${team1Colors.primary}` }}>
          <div className="flex items-center gap-3 mb-4">
            {team1Logo && <img src={team1Logo} alt="" className="w-10 h-10 object-contain" />}
            <h3 className="text-lg font-bold" style={{ color: team1Colors.primary }}>{team1Name}</h3>
          </div>

          {/* Rankings */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 mb-1">National Rank</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={formData.team1Rank}
                onChange={(e) => setFormData({ ...formData, team1Rank: e.target.value })}
                className="w-16 px-2 py-2 border-2 rounded-lg text-center"
                style={{ borderColor: `${team1Colors.primary}40` }}
                min="1" max="133" placeholder="#"
              />
              {formData.team1Rank && (
                <span className="text-lg font-semibold text-gray-600">{getOrdinalSuffix(formData.team1Rank)}</span>
              )}
              {!formData.team1Rank && (
                <span className="text-sm text-gray-400">Unranked</span>
              )}
            </div>
          </div>

          {/* Ratings - hidden for user team */}
          {!isTeam1UserTeam && (
            <div className="mb-4">
              <label className="text-sm font-semibold text-gray-700 block mb-2">Team Ratings</label>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Overall</label>
                  <input
                    type="number"
                    value={formData.team1Overall}
                    onChange={(e) => setFormData({ ...formData, team1Overall: e.target.value })}
                    className="w-full px-2 py-1 border rounded text-center"
                    min="0" max="99"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Offense</label>
                  <input
                    type="number"
                    value={formData.team1Offense}
                    onChange={(e) => setFormData({ ...formData, team1Offense: e.target.value })}
                    className="w-full px-2 py-1 border rounded text-center"
                    min="0" max="99"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Defense</label>
                  <input
                    type="number"
                    value={formData.team1Defense}
                    onChange={(e) => setFormData({ ...formData, team1Defense: e.target.value })}
                    className="w-full px-2 py-1 border rounded text-center"
                    min="0" max="99"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Record - hidden for user team */}
          {!isTeam1UserTeam && (
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-2">Season Record <span className="font-normal text-gray-500">(after game)</span></label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Overall</label>
                  <input
                    type="text"
                    value={formData.team1Record}
                    onChange={(e) => setFormData({ ...formData, team1Record: e.target.value })}
                    className="w-full px-2 py-1 border rounded text-center"
                    placeholder="0-0"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Conference</label>
                  <input
                    type="text"
                    value={formData.team1ConfRecord}
                    onChange={(e) => setFormData({ ...formData, team1ConfRecord: e.target.value })}
                    className="w-full px-2 py-1 border rounded text-center"
                    placeholder="0-0"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Team 2 Details */}
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6" style={{ borderTop: `4px solid ${team2Colors.primary}` }}>
          <div className="flex items-center gap-3 mb-4">
            {team2Logo && <img src={team2Logo} alt="" className="w-10 h-10 object-contain" />}
            <h3 className="text-lg font-bold" style={{ color: team2Colors.primary }}>{team2Name}</h3>
          </div>

          {/* Rankings */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 mb-1">National Rank</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={formData.team2Rank}
                onChange={(e) => setFormData({ ...formData, team2Rank: e.target.value })}
                className="w-16 px-2 py-2 border-2 rounded-lg text-center"
                style={{ borderColor: `${team2Colors.primary}40` }}
                min="1" max="133" placeholder="#"
              />
              {formData.team2Rank && (
                <span className="text-lg font-semibold text-gray-600">{getOrdinalSuffix(formData.team2Rank)}</span>
              )}
              {!formData.team2Rank && (
                <span className="text-sm text-gray-400">Unranked</span>
              )}
            </div>
          </div>

          {/* Ratings - hidden for user team */}
          {!isTeam2UserTeam && (
            <div className="mb-4">
              <label className="text-sm font-semibold text-gray-700 block mb-2">Team Ratings</label>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Overall</label>
                  <input
                    type="number"
                    value={formData.team2Overall}
                    onChange={(e) => setFormData({ ...formData, team2Overall: e.target.value })}
                    className="w-full px-2 py-1 border rounded text-center"
                    min="0" max="99"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Offense</label>
                  <input
                    type="number"
                    value={formData.team2Offense}
                    onChange={(e) => setFormData({ ...formData, team2Offense: e.target.value })}
                    className="w-full px-2 py-1 border rounded text-center"
                    min="0" max="99"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Defense</label>
                  <input
                    type="number"
                    value={formData.team2Defense}
                    onChange={(e) => setFormData({ ...formData, team2Defense: e.target.value })}
                    className="w-full px-2 py-1 border rounded text-center"
                    min="0" max="99"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Record - hidden for user team */}
          {!isTeam2UserTeam && (
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-2">Season Record <span className="font-normal text-gray-500">(after game)</span></label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Overall</label>
                  <input
                    type="text"
                    value={formData.team2Record}
                    onChange={(e) => setFormData({ ...formData, team2Record: e.target.value })}
                    className="w-full px-2 py-1 border rounded text-center"
                    placeholder="0-0"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Conference</label>
                  <input
                    type="text"
                    value={formData.team2ConfRecord}
                    onChange={(e) => setFormData({ ...formData, team2ConfRecord: e.target.value })}
                    className="w-full px-2 py-1 border rounded text-center"
                    placeholder="0-0"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Box Score / Stats Sections */}
      <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">Box Score & Stats</h3>
        {isNewGame ? (
          <p className="text-sm text-gray-500">Save the game first to connect Google Sheets for detailed stats.</p>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-4">Connect Google Sheets to track detailed stats for this game.</p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <button
                onClick={() => openBoxScoreModal('teamStats')}
                className="p-4 border-2 border-dashed border-gray-300 rounded-xl hover:border-green-500 hover:bg-green-50 transition-all text-center"
              >
                <div className="text-2xl mb-2">📊</div>
                <div className="text-sm font-medium text-gray-700">Team Stats</div>
                {existingGame?.teamStatsSheetId && (
                  <div className="text-xs text-green-600 mt-1">Connected</div>
                )}
              </button>

              <button
                onClick={() => openBoxScoreModal('home')}
                className="p-4 border-2 border-dashed border-gray-300 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all text-center"
              >
                <div className="text-2xl mb-2">👥</div>
                <div className="text-sm font-medium text-gray-700">{team1Abbr} Stats</div>
                {existingGame?.homeStatsSheetId && (
                  <div className="text-xs text-green-600 mt-1">Connected</div>
                )}
              </button>

              <button
                onClick={() => openBoxScoreModal('away')}
                className="p-4 border-2 border-dashed border-gray-300 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all text-center"
              >
                <div className="text-2xl mb-2">👥</div>
                <div className="text-sm font-medium text-gray-700">{team2Abbr} Stats</div>
                {existingGame?.awayStatsSheetId && (
                  <div className="text-xs text-green-600 mt-1">Connected</div>
                )}
              </button>

              <button
                onClick={() => openBoxScoreModal('scoring')}
                className="p-4 border-2 border-dashed border-gray-300 rounded-xl hover:border-purple-500 hover:bg-purple-50 transition-all text-center"
              >
                <div className="text-2xl mb-2">🏈</div>
                <div className="text-sm font-medium text-gray-700">Scoring Summary</div>
                {existingGame?.scoringSummarySheetId && (
                  <div className="text-xs text-green-600 mt-1">Connected</div>
                )}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Game Recap */}
      <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-bold text-gray-800">Game Recap</h3>
          <button
            onClick={handleGenerateRecap}
            disabled={isGeneratingRecap || !formData.team1Score || !formData.team2Score}
            className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            {isGeneratingRecap ? 'Generating...' : 'Generate with AI'}
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-3">Tip: Enter all game info (scores, quarters, stats) before generating for the best AI recap.</p>
        {recapError && (
          <p className="text-sm text-red-600 mb-2">{recapError}</p>
        )}
        <textarea
          value={formData.aiRecap}
          onChange={(e) => setFormData({ ...formData, aiRecap: e.target.value })}
          className="w-full px-3 py-2 border-2 rounded-lg resize-none"
          rows={8}
          placeholder="Write a game recap or use AI to generate one..."
        />
      </div>

      {/* Media Links */}
      <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-gray-800">Media Links</h3>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <span>YouTube videos will embed automatically</span>
          </div>
        </div>
        <p className="text-xs text-gray-500 mb-3">Add links to highlight videos, images, or related content.</p>
        <div className="space-y-2">
          {formData.links.map((link, index) => (
            <div key={index} className="flex gap-2">
              <input
                type="url"
                value={link}
                onChange={(e) => {
                  const newLinks = [...formData.links]
                  newLinks[index] = e.target.value
                  // Add new empty input if typing in last box and it now has content
                  if (index === formData.links.length - 1 && e.target.value.trim()) {
                    newLinks.push('')
                  }
                  setFormData({ ...formData, links: newLinks })
                }}
                className="flex-1 px-3 py-2 border-2 rounded-lg font-mono text-sm"
                placeholder="https://youtube.com/watch?v=..."
              />
              {/* Show remove button only for filled entries (not the empty input box) */}
              {link.trim() && (
                <button
                  type="button"
                  onClick={() => {
                    const newLinks = formData.links.filter((_, i) => i !== index)
                    // Ensure there's always at least one empty input
                    if (newLinks.length === 0 || newLinks.every(l => l.trim())) {
                      newLinks.push('')
                    }
                    setFormData({ ...formData, links: newLinks })
                  }}
                  className="px-3 py-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="Remove link"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
        {formData.links.filter(l => l.trim()).length > 0 && (
          <div className="mt-3 text-xs text-gray-500">
            {formData.links.filter(l => l.trim()).length} link(s) added
          </div>
        )}
      </div>

      {/* Game Settings */}
      <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">Game Settings</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Location */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Game Location</label>
            <select
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              className="w-full px-3 py-2 border-2 rounded-lg"
            >
              <option value="home">{team1Name} Home</option>
              <option value="away">{team2Name} Home</option>
              <option value="neutral">Neutral Site</option>
            </select>
          </div>

          {/* Conference Game */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Conference Game</label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isConferenceGame}
                  onChange={(e) => setFormData({ ...formData, isConferenceGame: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-sm text-gray-700">Yes</span>
              </label>
              {isConferenceGame && (
                <span className="text-xs text-green-600">(Auto-detected: {team1Conference})</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Save/Cancel Buttons */}
      <div className="flex justify-end gap-3 pb-8">
        <button
          onClick={handleCancel}
          className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          Save
        </button>
      </div>

      {/* Box Score Sheet Modal */}
      {showBoxScoreModal && currentGameId && (
        <BoxScoreSheetModal
          isOpen={showBoxScoreModal}
          onClose={() => setShowBoxScoreModal(false)}
          onSave={handleBoxScoreSave}
          sheetType={boxScoreModalType}
          game={existingGame || {
            id: currentGameId,
            team1Tid,
            team2Tid,
            team1: team1Abbr || getOriginalTeamAbbr(team1Tid) || 'Team 1',
            team2: team2Abbr || getOriginalTeamAbbr(team2Tid) || 'Team 2',
            year: gameYear,
            week: gameWeek,
            location: formData.location
          }}
          teamColors={team1Colors}
        />
      )}
    </div>
  )
}
