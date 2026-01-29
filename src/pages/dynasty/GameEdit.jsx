import { useState, useEffect, useMemo, useRef } from 'react'
import { Link, useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { getTeamLogo, getMascotName as getMascotNameFromTeams } from '../../data/teams'
import { teamAbbreviations } from '../../data/teamAbbreviations'
import { TEAMS, resolveTid, getCurrentTeamAbbr, getGameTeamInfo, getAbbrFromTeamName, getTidFromAbbr, getOriginalTeamAbbr } from '../../data/teamRegistry'
import { getTeamColors } from '../../data/teamColors'
import { getContrastTextColor } from '../../utils/colorUtils'
import { useDynasty, GAME_TYPES, getCurrentCustomConferences, buildRecordUpdatePayload, calculateTeamRecordFromGames, propagateCFPWinner, isPlayerOnRoster } from '../../context/DynastyContext'
import { useAuth } from '../../context/AuthContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { generateGameRecap, getCustomRecapInstructions, getAiConfig, getFullRecapPrompt } from '../../services/geminiService'
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
  const { currentDynasty, updateDynasty, updateGame, addGame, isViewOnly } = useDynasty()
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
  const queryConference = searchParams.get('conference')

  // Toast state
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState('')

  // Box score sheet modal state
  const [showBoxScoreModal, setShowBoxScoreModal] = useState(false)
  const [boxScoreModalType, setBoxScoreModalType] = useState(null) // 'homeStats', 'awayStats', 'scoring', 'teamStats'

  // AI Recap state
  const [isGeneratingRecap, setIsGeneratingRecap] = useState(false)
  const [recapError, setRecapError] = useState(null)
  const [streamingRecap, setStreamingRecap] = useState('')
  const [promptCopied, setPromptCopied] = useState(false)

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
    links: [''], // Array of media links (YouTube, images, etc.) - always has at least one empty entry for input
    // Player of the Week fields (store player names)
    conferencePOW: '',      // Conference Offensive Player of the Week
    confDefensePOW: '',     // Conference Defensive Player of the Week
    nationalPOW: '',        // National Offensive Player of the Week
    natlDefensePOW: ''      // National Defensive Player of the Week
  })

  // Find existing game or set up new game data
  const existingGame = useMemo(() => {
    if (!currentDynasty?.games) return null

    // Direct ID lookup - try currentGameId first (for newly created games), then gameId from URL
    const lookupId = currentGameId || gameId
    if (!lookupId || lookupId === 'new') return null

    let found = currentDynasty.games.find(g => g.id === lookupId)
    if (found) {
      return found
    }

    // CFP Slot ID pattern lookup
    const cfpParsed = parseCFPGameId(gameId)
    if (cfpParsed) {
      const { slotId, year } = cfpParsed

      // Get user's bowl config for this year
      const bowlConfig = currentDynasty.cfpBowlConfigByYear?.[year] || {}
      const cfpSeeds = currentDynasty.cfpSeedsByYear?.[year] || []

      // Map slot to bye seed for reliable lookup
      const slotToByeSeed = { cfpqf1: 1, cfpqf2: 4, cfpqf3: 3, cfpqf4: 2 }
      const frSeedMatchups = { cfpfr1: [5, 12], cfpfr2: [8, 9], cfpfr3: [6, 11], cfpfr4: [7, 10] }

      if (slotId.startsWith('cfpfr')) {
        const [seed1, seed2] = frSeedMatchups[slotId] || []
        found = currentDynasty.games.find(g =>
          g.isCFPFirstRound && Number(g.year) === year &&
          ((g.seed1 === seed1 && g.seed2 === seed2) || (g.seed1 === seed2 && g.seed2 === seed1))
        )
      } else if (slotId.startsWith('cfpqf')) {
        // Find QF game by bye seed (most reliable method)
        const byeSeed = slotToByeSeed[slotId]
        const byeSeedEntry = cfpSeeds.find(s => s.seed === byeSeed)
        if (byeSeedEntry) {
          found = currentDynasty.games.find(g => {
            if (!g.isCFPQuarterfinal || Number(g.year) !== year) return false
            // Check if bye seed team is in this game
            if (byeSeedEntry.tid && (g.team1Tid === byeSeedEntry.tid || g.team2Tid === byeSeedEntry.tid)) return true
            if (byeSeedEntry.team && (g.team1 === byeSeedEntry.team || g.team2 === byeSeedEntry.team)) return true
            return false
          })
        }

        // Fallback to cfpSlot match
        if (!found) {
          found = currentDynasty.games.find(g =>
            g.isCFPQuarterfinal && Number(g.year) === year && g.cfpSlot === slotId
          )
        }
      } else if (slotId.startsWith('cfpsf')) {
        // Find SF game by cfpSlot first, then bowlName from config
        found = currentDynasty.games.find(g =>
          g.isCFPSemifinal && Number(g.year) === year && g.cfpSlot === slotId
        )
        if (!found) {
          const sfBowl = slotId === 'cfpsf1' ? (bowlConfig.sf1 || 'Peach Bowl') : (bowlConfig.sf2 || 'Fiesta Bowl')
          found = currentDynasty.games.find(g =>
            g.isCFPSemifinal && Number(g.year) === year && g.bowlName === sfBowl
          )
        }
      } else if (slotId === 'cfpnc') {
        found = currentDynasty.games.find(g => g.isCFPChampionship && Number(g.year) === year)
      }

    }
    return found || null
  }, [currentDynasty?.games, gameId, currentGameId, currentDynasty?.cfpBowlConfigByYear, currentDynasty?.cfpSeedsByYear])

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

  // Get players from both teams' rosters for POW dropdown
  const availablePlayers = useMemo(() => {
    const allPlayers = currentDynasty?.players || []
    const yearToCheck = gameYear || currentDynasty?.currentYear
    if (!yearToCheck) return []

    // Get players from both teams' rosters
    const playersFromBothTeams = allPlayers.filter(player => {
      if (team1Tid && isPlayerOnRoster(player, team1Tid, yearToCheck)) return true
      if (team2Tid && isPlayerOnRoster(player, team2Tid, yearToCheck)) return true
      return false
    })

    // Sort by team (team1 first, then team2), then alphabetically by name
    return playersFromBothTeams.sort((a, b) => {
      const aTeam1 = team1Tid && isPlayerOnRoster(a, team1Tid, yearToCheck)
      const bTeam1 = team1Tid && isPlayerOnRoster(b, team1Tid, yearToCheck)
      if (aTeam1 && !bTeam1) return -1
      if (!aTeam1 && bTeam1) return 1
      return (a.name || '').localeCompare(b.name || '')
    })
  }, [currentDynasty?.players, team1Tid, team2Tid, gameYear, currentDynasty?.currentYear])

  // Display order: Away team on left/top, Home team on right/bottom
  // For CFP games: Lower seed (better, e.g. #1) on left/top, Higher seed (worse, e.g. #12) on right/bottom
  // location 'home' = team1 is home, 'away' = team2 is home, 'neutral' = keep order
  const isTeam1Home = formData.location === 'home'
  const isTeam2Home = formData.location === 'away'

  // Check if this is a CFP game and get seeds
  const isCFPGame = existingGame?.isCFPFirstRound || existingGame?.isCFPQuarterfinal ||
                    existingGame?.isCFPSemifinal || existingGame?.isCFPChampionship ||
                    gameType?.startsWith('cfp_')

  // Get CFP seeds for each team by tid
  const getCFPSeedForTid = (tid) => {
    if (!tid || !currentDynasty?.cfpSeedsByYear) return null
    const cfpSeeds = currentDynasty.cfpSeedsByYear[gameYear] || currentDynasty.cfpSeedsByYear[String(gameYear)]
    if (!cfpSeeds) return null
    const seedEntry = cfpSeeds.find(s => s.tid === tid)
    return seedEntry?.seed || null
  }

  // Get seeds from game data or calculate from cfpSeedsByYear
  const team1Seed = existingGame?.seed1 || existingGame?.cfpSeed1 || getCFPSeedForTid(team1Tid)
  const team2Seed = existingGame?.seed2 || existingGame?.cfpSeed2 || getCFPSeedForTid(team2Tid)

  // For CFP games: better seed (lower number like #1) goes on right/bottom
  // Lower seed number = better team (e.g., #1 is better than #12)
  const shouldSwapForCFP = isCFPGame && team1Seed && team2Seed && team1Seed < team2Seed

  // Display variables - swap order based on home/away OR CFP seeding
  let displayLeftTeam, displayRightTeam
  if (isCFPGame && team1Seed && team2Seed) {
    // CFP games: higher seed number (worse team) on left, lower seed number (better team) on right
    displayLeftTeam = team1Seed > team2Seed ? 'team1' : 'team2'
    displayRightTeam = team1Seed > team2Seed ? 'team2' : 'team1'
  } else {
    // Regular games: away on left, home on right
    displayLeftTeam = isTeam1Home ? 'team2' : 'team1'
    displayRightTeam = isTeam1Home ? 'team1' : 'team2'
  }

  const leftTeamTid = displayLeftTeam === 'team1' ? team1Tid : team2Tid
  const rightTeamTid = displayRightTeam === 'team1' ? team1Tid : team2Tid
  const leftTeamName = displayLeftTeam === 'team1' ? team1Name : team2Name
  const rightTeamName = displayRightTeam === 'team1' ? team1Name : team2Name
  const leftTeamAbbr = displayLeftTeam === 'team1' ? team1Abbr : team2Abbr
  const rightTeamAbbr = displayRightTeam === 'team1' ? team1Abbr : team2Abbr
  const leftTeamLogo = displayLeftTeam === 'team1' ? team1Logo : team2Logo
  const rightTeamLogo = displayRightTeam === 'team1' ? team1Logo : team2Logo
  const leftTeamColors = displayLeftTeam === 'team1' ? team1Colors : team2Colors
  const rightTeamColors = displayRightTeam === 'team1' ? team1Colors : team2Colors

  // For Team Details section: determine which team to show first (left/top) and second (right/bottom)
  const isLeftTeam1 = displayLeftTeam === 'team1'
  const isLeftUserTeam = leftTeamTid === userTidForGame
  const isRightUserTeam = rightTeamTid === userTidForGame

  // Compute actual homeTeamTid based on current location setting (for modal sheet type mapping)
  // This is used to correctly map team buttons to 'homeStats' or 'awayStats'
  const gameHomeTeamTid = formData.location === 'home' ? team1Tid :
                          formData.location === 'away' ? team2Tid : null

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
    const yearNum = Number(year)
    const currentUserTid = currentDynasty?.currentTid
    const currentYear = Number(currentDynasty?.currentYear)

    let ratings = null

    // PRIORITY 1: For current user team and current year, use dynasty.teamRatings
    // This ensures we always get the LATEST ratings if user updates them mid-season
    if (tid === currentUserTid && yearNum === currentYear && currentDynasty?.teamRatings) {
      const tr = currentDynasty.teamRatings
      if (tr.overall || tr.offense || tr.defense) {
        ratings = tr
      }
    }

    // PRIORITY 2: New tid-based byYear structure (for past years or other teams)
    if (!ratings) {
      ratings = currentDynasty?.teams?.[tid]?.byYear?.[yearNum]?.teamRatings ||
                currentDynasty?.teams?.[tid]?.byYear?.[String(yearNum)]?.teamRatings
    }

    // PRIORITY 3: teamRatingsByTeamYear[abbr][year] structure (legacy)
    if (!ratings && abbr) {
      ratings = currentDynasty?.teamRatingsByTeamYear?.[abbr]?.[yearNum] ||
                currentDynasty?.teamRatingsByTeamYear?.[abbr]?.[String(yearNum)]
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

      // Determine homeTeamTid at creation time based on queryLocation
      // This ensures home/away display is correct from the start
      let initialHomeTeamTid = null
      const isNeutralGameType = targetGameType !== 'regular'
      if (!isNeutralGameType) {
        if (queryLocation === 'home') initialHomeTeamTid = team1Tid
        else if (queryLocation === 'away') initialHomeTeamTid = team2Tid
        // For neutral or unspecified, leave as null
      }

      const initialGameData = {
        id: newGameId,
        week: targetWeek ?? '',
        year: targetYear,
        gameType: targetGameType,
        team1Tid: team1Tid || null,
        team2Tid: team2Tid || null,
        team1Score: 0,
        team2Score: 0,
        homeTeamTid: initialHomeTeamTid,
        location: queryLocation || 'home', // Store location for fallback
        ...(queryBowlName && { bowlName: queryBowlName, isBowlGame: true }),
        ...(queryGameType === 'conference_championship' && { isConferenceChampionship: true, conference: queryConference || currentDynasty?.conference }),
        ...(queryGameType === 'cfp_first_round' && { isCFPFirstRound: true }),
        ...(queryGameType === 'cfp_quarterfinal' && { isCFPQuarterfinal: true }),
        ...(queryGameType === 'cfp_semifinal' && { isCFPSemifinal: true }),
        ...(queryGameType === 'cfp_championship' && { isCFPChampionship: true })
      }

      try {
        // OPTIMIZED: Use addGame for efficient single-doc saves to cloud
        await addGame(currentDynasty.id, initialGameData)
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

      // Resolve location - PRIORITY ORDER:
      // 1. homeTeamTid (most reliable, computed field) - handles both user and CPU games
      // 2. existingGame.location (direct storage)
      // 3. Schedule entry location (for games created from schedule)
      // 4. Default to 'home' for user games, 'neutral' for CPU games
      let locationValue = 'home' // Default: team1 is home

      if (existingGame.homeTeamTid !== undefined) {
        // homeTeamTid is explicitly set (could be a tid number or null for neutral site)
        if (existingGame.homeTeamTid === null) {
          // Neutral site game (bowls, CFP, conference championships)
          locationValue = 'neutral'
        } else if (existingGame.homeTeamTid === resolvedTeam1Tid) {
          locationValue = 'home' // team1 is home
        } else if (existingGame.homeTeamTid === resolvedTeam2Tid) {
          locationValue = 'away' // team2 is home
        } else {
          locationValue = 'neutral' // homeTeamTid doesn't match either team
        }
      } else if (existingGame.location) {
        locationValue = existingGame.location
      } else {
        // Check schedule entry for location (fallback for older games)
        const scheduleEntries = currentDynasty?.schedule || []
        const scheduleEntry = scheduleEntries.find(s =>
          s.gameId === existingGame.id ||
          (Number(s.week) === Number(existingGame.week) && s.opponentTid === existingGame.team2Tid)
        )
        if (scheduleEntry?.location) {
          locationValue = scheduleEntry.location
        }
      }

      // For CFP games, auto-fill ranks with seeds if not already set
      const isCFP = existingGame.isCFPFirstRound || existingGame.isCFPQuarterfinal ||
                    existingGame.isCFPSemifinal || existingGame.isCFPChampionship
      const cfpSeeds = currentDynasty?.cfpSeedsByYear?.[gameYear] || currentDynasty?.cfpSeedsByYear?.[String(gameYear)] || []

      // Look up CFP seed by tid only
      const getCFPSeedForTidInit = (tid) => {
        if (!tid || !cfpSeeds.length) return null
        const entry = cfpSeeds.find(s => s.tid === tid)
        return entry?.seed || null
      }

      // Get ranks - prefer existing ranks, fall back to CFP seeds for CFP games
      let rank1 = existingGame.team1Rank?.toString() || existingGame.userRank?.toString() || ''
      let rank2 = existingGame.team2Rank?.toString() || existingGame.opponentRank?.toString() || ''

      if (isCFP && !rank1) {
        const seed = getCFPSeedForTidInit(existingGame.team1Tid)
        if (seed) rank1 = seed.toString()
      }
      if (isCFP && !rank2) {
        const seed = getCFPSeedForTidInit(existingGame.team2Tid)
        if (seed) rank2 = seed.toString()
      }

      setFormData({
        team1Score: score1?.toString() || '',
        team2Score: score2?.toString() || '',
        quarters: existingGame.quarters || {
          team1: { Q1: '', Q2: '', Q3: '', Q4: '' },
          team2: { Q1: '', Q2: '', Q3: '', Q4: '' }
        },
        overtimes: existingGame.overtimes || [],
        team1Rank: rank1,
        team2Rank: rank2,
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
        // Player of the Week fields
        conferencePOW: existingGame.conferencePOW || '',
        confDefensePOW: existingGame.confDefensePOW || '',
        nationalPOW: existingGame.nationalPOW || '',
        natlDefensePOW: existingGame.natlDefensePOW || '',
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

      // For CFP games, auto-fill ranks with seeds
      const isCFPGameType = gameType?.startsWith('cfp_')
      const cfpSeeds = currentDynasty?.cfpSeedsByYear?.[gameYear] || currentDynasty?.cfpSeedsByYear?.[String(gameYear)] || []
      let rank1 = ''
      let rank2 = ''

      if (isCFPGameType && cfpSeeds.length) {
        // Look up by tid only
        const seed1Entry = cfpSeeds.find(s => s.tid === team1Tid)
        const seed2Entry = cfpSeeds.find(s => s.tid === team2Tid)
        if (seed1Entry?.seed) rank1 = seed1Entry.seed.toString()
        if (seed2Entry?.seed) rank2 = seed2Entry.seed.toString()
      }

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
        team1Rank: rank1 || prev.team1Rank,
        team2Rank: rank2 || prev.team2Rank,
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
    // Parse as integer to handle cases like "07" → "7"
    // Keep empty string as empty (for placeholder display)
    const parsedValue = value === '' ? '' : String(parseInt(value, 10) || 0)

    const defaultQuarters = { Q1: '', Q2: '', Q3: '', Q4: '' }
    const currentQuarters = formData.quarters || { team1: defaultQuarters, team2: defaultQuarters }
    const newQuarters = {
      ...currentQuarters,
      [teamKey]: {
        ...(currentQuarters[teamKey] || defaultQuarters),
        [quarter]: parsedValue
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
    // Parse as integer to handle cases like "07" → "7"
    const parsedValue = value === '' ? '' : String(parseInt(value, 10) || 0)

    const newOvertimes = [...formData.overtimes]
    newOvertimes[index] = { ...newOvertimes[index], [teamKey]: parsedValue }

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
        // Player of the Week fields
        ...(formData.conferencePOW && { conferencePOW: formData.conferencePOW }),
        ...(formData.confDefensePOW && { confDefensePOW: formData.confDefensePOW }),
        ...(formData.nationalPOW && { nationalPOW: formData.nationalPOW }),
        ...(formData.natlDefensePOW && { natlDefensePOW: formData.natlDefensePOW }),
        // NOTE: No userTid - games are team-centric (team1Tid/team2Tid), not user-centric
        // Set game type flags from existingGame or gameType query param for new games
        ...(existingGame?.isBowlGame && { isBowlGame: true, bowlName: existingGame.bowlName }),
        ...(!existingGame && gameType === 'bowl' && { isBowlGame: true, bowlName }),
        ...(existingGame?.isConferenceChampionship && { isConferenceChampionship: true, conference: existingGame.conference }),
        ...(!existingGame && gameType === 'conference_championship' && { isConferenceChampionship: true, conference: queryConference || currentDynasty?.conference }),
        ...(existingGame?.isCFPFirstRound && { isCFPFirstRound: true }),
        ...(!existingGame && gameType === 'cfp_first_round' && { isCFPFirstRound: true }),
        ...(existingGame?.isCFPQuarterfinal && { isCFPQuarterfinal: true }),
        ...(!existingGame && gameType === 'cfp_quarterfinal' && { isCFPQuarterfinal: true, bowlName }),
        ...(existingGame?.isCFPSemifinal && { isCFPSemifinal: true }),
        ...(!existingGame && gameType === 'cfp_semifinal' && { isCFPSemifinal: true, bowlName }),
        ...(existingGame?.isCFPChampionship && { isCFPChampionship: true }),
        ...(!existingGame && gameType === 'cfp_championship' && { isCFPChampionship: true }),
        ...(existingGame?.boxScore && { boxScore: existingGame.boxScore }),
        // Preserve cfpSlot for CFP games (critical for winner propagation)
        ...(existingGame?.cfpSlot && { cfpSlot: existingGame.cfpSlot }),
        ...(existingGame?.cfpRound && { cfpRound: existingGame.cfpRound }),
        ...(existingGame?.bowlName && { bowlName: existingGame.bowlName }),
        // Save links as array (filter out empty entries)
        ...(() => {
          const validLinks = formData.links.filter(l => l.trim())
          return validLinks.length > 0 ? { links: validLinks } : {}
        })()
      }

      // Update or add game - build updated games array for CFP propagation and record calc
      const games = currentDynasty.games || []
      const existingIndex = games.findIndex(g => g.id === gameData.id)

      let updatedGames
      if (existingIndex >= 0) {
        updatedGames = [...games]
        updatedGames[existingIndex] = { ...games[existingIndex], ...gameData }
      } else {
        updatedGames = [...games, gameData]
      }

      // Track CFP propagation - identify which games get modified
      let cfpGamesToPropagate = []
      const savedGame = existingIndex >= 0 ? updatedGames[existingIndex] : updatedGames[updatedGames.length - 1]
      if (savedGame.cfpSlot && savedGame.team1Score != null && savedGame.team2Score != null) {
        // Snapshot games before propagation to detect changes
        const gamesBeforeProp = updatedGames.map(g => ({ id: g.id, team1Tid: g.team1Tid, team2Tid: g.team2Tid }))
        updatedGames = propagateCFPWinner(updatedGames, savedGame)

        // Find games that were modified by propagation (not the main game)
        for (const game of updatedGames) {
          if (game.id === savedGame.id) continue // Skip main game
          const before = gamesBeforeProp.find(g => g.id === game.id)
          if (before && (before.team1Tid !== game.team1Tid || before.team2Tid !== game.team2Tid)) {
            cfpGamesToPropagate.push(game)
          }
        }
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

      // OPTIMIZED: Use updateGame for efficient single-doc saves to cloud
      await updateGame(currentDynasty.id, savedGame, { recordUpdates, cfpGamesToPropagate })

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
        // Player of the Week fields
        ...(formData.conferencePOW && { conferencePOW: formData.conferencePOW }),
        ...(formData.confDefensePOW && { confDefensePOW: formData.confDefensePOW }),
        ...(formData.nationalPOW && { nationalPOW: formData.nationalPOW }),
        ...(formData.natlDefensePOW && { natlDefensePOW: formData.natlDefensePOW }),
        // NOTE: No userTid - games are team-centric (team1Tid/team2Tid), not user-centric
        // Preserve game type flags
        ...(existingGame?.isBowlGame && { isBowlGame: true, bowlName: existingGame.bowlName }),
        ...(!existingGame && gameType === 'bowl' && { isBowlGame: true, bowlName }),
        ...(existingGame?.isConferenceChampionship && { isConferenceChampionship: true, conference: existingGame.conference }),
        ...(!existingGame && gameType === 'conference_championship' && { isConferenceChampionship: true, conference: queryConference || currentDynasty?.conference }),
        ...(existingGame?.isCFPFirstRound && { isCFPFirstRound: true }),
        ...(!existingGame && gameType === 'cfp_first_round' && { isCFPFirstRound: true }),
        ...(existingGame?.isCFPQuarterfinal && { isCFPQuarterfinal: true }),
        ...(!existingGame && gameType === 'cfp_quarterfinal' && { isCFPQuarterfinal: true, bowlName }),
        ...(existingGame?.isCFPSemifinal && { isCFPSemifinal: true }),
        ...(!existingGame && gameType === 'cfp_semifinal' && { isCFPSemifinal: true, bowlName }),
        ...(existingGame?.isCFPChampionship && { isCFPChampionship: true }),
        ...(!existingGame && gameType === 'cfp_championship' && { isCFPChampionship: true }),
        ...(existingGame?.boxScore && { boxScore: existingGame.boxScore }),
        // Preserve cfpSlot for CFP games (critical for winner propagation)
        ...(existingGame?.cfpSlot && { cfpSlot: existingGame.cfpSlot }),
        ...(existingGame?.cfpRound && { cfpRound: existingGame.cfpRound }),
        ...(existingGame?.bowlName && { bowlName: existingGame.bowlName }),
        // Save links as array (filter out empty entries)
        ...(() => {
          const validLinks = formData.links.filter(l => l.trim())
          return validLinks.length > 0 ? { links: validLinks } : {}
        })()
      }

      // Update or add game - build updated games array for CFP propagation and record calc
      const games = currentDynasty.games || []
      const existingIndex = games.findIndex(g => g.id === gameData.id)

      let updatedGames
      if (existingIndex >= 0) {
        updatedGames = [...games]
        updatedGames[existingIndex] = { ...games[existingIndex], ...gameData }
      } else {
        updatedGames = [...games, gameData]
      }

      // Track CFP propagation - identify which games get modified
      let cfpGamesToPropagate = []
      const savedGame = existingIndex >= 0 ? updatedGames[existingIndex] : updatedGames[updatedGames.length - 1]
      if (savedGame.cfpSlot && savedGame.team1Score != null && savedGame.team2Score != null) {
        // Snapshot games before propagation to detect changes
        const gamesBeforeProp = updatedGames.map(g => ({ id: g.id, team1Tid: g.team1Tid, team2Tid: g.team2Tid }))
        updatedGames = propagateCFPWinner(updatedGames, savedGame)

        // Find games that were modified by propagation (not the main game)
        for (const game of updatedGames) {
          if (game.id === savedGame.id) continue // Skip main game
          const before = gamesBeforeProp.find(g => g.id === game.id)
          if (before && (before.team1Tid !== game.team1Tid || before.team2Tid !== game.team2Tid)) {
            cfpGamesToPropagate.push(game)
          }
        }
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

      // OPTIMIZED: Use updateGame for efficient single-doc saves to cloud
      await updateGame(currentDynasty.id, savedGame, { recordUpdates, cfpGamesToPropagate })
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
        } else if (boxScoreModalType === 'homeStats') {
          updatedGame.boxScore.home = data
        } else if (boxScoreModalType === 'awayStats') {
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

  // Handle sheet creation - save sheet ID to game so it can be reused
  const handleSheetCreated = async (sheetId) => {
    if (!currentGameId || !currentDynasty?.id || !sheetId) return

    try {
      const games = currentDynasty.games || []
      const existingGame = games.find(g => g.id === currentGameId)

      if (existingGame) {
        const updatedGame = { ...existingGame }

        // Save sheet ID based on modal type
        if (boxScoreModalType === 'teamStats') {
          updatedGame.teamStatsSheetId = sheetId
        } else if (boxScoreModalType === 'scoring') {
          updatedGame.scoringSummarySheetId = sheetId
        } else if (boxScoreModalType === 'homeStats') {
          updatedGame.homeStatsSheetId = sheetId
        } else if (boxScoreModalType === 'awayStats') {
          updatedGame.awayStatsSheetId = sheetId
        }

        await addGame(currentDynasty.id, updatedGame)
      }
    } catch (error) {
      console.error('Error saving sheet ID:', error)
    }
  }

  // Get existing sheet ID based on modal type
  const getExistingSheetId = () => {
    if (!existingGame) return null
    switch (boxScoreModalType) {
      case 'teamStats': return existingGame.teamStatsSheetId
      case 'scoring': return existingGame.scoringSummarySheetId
      case 'homeStats': return existingGame.homeStatsSheetId
      case 'awayStats': return existingGame.awayStatsSheetId
      default: return null
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
      // IMPORTANT: Parse scores as integers - string comparison fails ("24" > "3" is false alphabetically)
      const gameForRecap = {
        ...existingGame,
        team1: team1Name,
        team2: team2Name,
        team1Score: parseInt(formData.team1Score) || 0,
        team2Score: parseInt(formData.team2Score) || 0,
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

  // Copy full prompt to clipboard for use in external AI
  const handleCopyPrompt = async () => {
    try {
      // Fetch custom instructions if user is logged in
      const customInstructions = user?.uid ? await getCustomRecapInstructions(user.uid) : null

      // Build game object for prompt generation
      // IMPORTANT: Parse scores as integers - string comparison fails ("24" > "3" is false alphabetically)
      const gameForRecap = {
        ...existingGame,
        team1: team1Name,
        team2: team2Name,
        team1Score: parseInt(formData.team1Score) || 0,
        team2Score: parseInt(formData.team2Score) || 0,
        quarters: formData.quarters,
        gameType,
        bowlName,
        year: gameYear
      }

      const fullPrompt = getFullRecapPrompt(currentDynasty, gameForRecap, customInstructions)

      // Try modern clipboard API first, fall back to legacy method
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(fullPrompt)
      } else {
        // Fallback for non-secure contexts or older browsers
        const textArea = document.createElement('textarea')
        textArea.value = fullPrompt
        textArea.style.position = 'fixed'
        textArea.style.left = '-999999px'
        textArea.style.top = '-999999px'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        document.execCommand('copy')
        textArea.remove()
      }

      setPromptCopied(true)
      setTimeout(() => setPromptCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy prompt:', error)
      setRecapError('Failed to copy prompt to clipboard: ' + error.message)
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
      <div className="bg-gray-800 rounded-xl shadow-lg p-4 sm:p-6 border border-gray-700">
        <h3 className="text-lg font-bold text-white mb-4">Quarter-by-Quarter Scoring</h3>
        <p className="text-xs text-gray-400 mb-4">Enter quarter scores to auto-calculate total, or enter total directly above.</p>

        <div className="overflow-x-auto">
          <div className="min-w-[400px]">
            {/* Headers - dynamic columns for Q1-Q4 + OT columns + Total */}
            <div className="grid gap-2 items-center mb-2" style={{ gridTemplateColumns: `1fr repeat(${4 + formData.overtimes.length}, 50px) 60px` }}>
              <div className="text-xs font-semibold text-gray-400">Team</div>
              <div className="text-xs font-semibold text-gray-400 text-center">Q1</div>
              <div className="text-xs font-semibold text-gray-400 text-center">Q2</div>
              <div className="text-xs font-semibold text-gray-400 text-center">Q3</div>
              <div className="text-xs font-semibold text-gray-400 text-center">Q4</div>
              {formData.overtimes.map((_, idx) => (
                <div key={`ot-header-${idx}`} className="text-xs font-semibold text-gray-400 text-center">OT{idx + 1}</div>
              ))}
              <div className="text-xs font-semibold text-gray-400 text-center">Total</div>
            </div>

            {/* Away Team Row (left/top) */}
            <div className="grid gap-2 items-center mb-2" style={{ gridTemplateColumns: `1fr repeat(${4 + formData.overtimes.length}, 50px) 60px` }}>
              <div className="flex items-center gap-2">
                {leftTeamLogo && <img src={leftTeamLogo} alt="" className="w-6 h-6 object-contain" />}
                <span className="text-sm font-medium truncate text-white">{leftTeamAbbr}</span>
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
                  className="w-full px-2 py-1 border-2 rounded text-center text-sm bg-gray-700 text-white"
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
                  className="w-full px-2 py-1 border-2 rounded text-center text-sm bg-gray-700 text-white"
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
                <span className="text-sm font-medium truncate text-white">{rightTeamAbbr}</span>
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
                  className="w-full px-2 py-1 border-2 rounded text-center text-sm bg-gray-700 text-white"
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
                  className="w-full px-2 py-1 border-2 rounded text-center text-sm bg-gray-700 text-white"
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

      {/* Team Details - Side by Side (display-ordered: left team first, right team second) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left Team Details (higher seed number/worse team for CFP, away for regular) */}
        <div className="bg-gray-800 rounded-xl shadow-lg p-4 sm:p-6 border border-gray-700" style={{ borderTop: `4px solid ${leftTeamColors.primary}` }}>
          <div className="flex items-center gap-3 mb-4">
            {leftTeamLogo && <img src={leftTeamLogo} alt="" className="w-10 h-10 object-contain" />}
            <h3 className="text-lg font-bold" style={{ color: leftTeamColors.primary }}>{leftTeamName}</h3>
          </div>

          {/* Rankings */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-300 mb-1">National Rank</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={formData[`${displayLeftTeam}Rank`]}
                onChange={(e) => setFormData({ ...formData, [`${displayLeftTeam}Rank`]: e.target.value })}
                className="w-16 px-2 py-2 border-2 rounded-lg text-center bg-gray-700 text-white"
                style={{ borderColor: `${leftTeamColors.primary}40` }}
                min="1" max="133" placeholder="#"
              />
              {formData[`${displayLeftTeam}Rank`] && (
                <span className="text-lg font-semibold text-gray-400">{getOrdinalSuffix(formData[`${displayLeftTeam}Rank`])}</span>
              )}
              {!formData[`${displayLeftTeam}Rank`] && (
                <span className="text-sm text-gray-500">Unranked</span>
              )}
            </div>
          </div>

          {/* Ratings - show for all teams, auto-filled from preseason for user team */}
          <div className="mb-4">
            <label className="text-sm font-semibold text-gray-300 block mb-2">
              Team Ratings
              {isLeftUserTeam && formData[`${displayLeftTeam}Overall`] && (
                <span className="font-normal text-xs text-green-400 ml-2">(auto-filled)</span>
              )}
            </label>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Overall</label>
                <input
                  type="number"
                  value={formData[`${displayLeftTeam}Overall`]}
                  onChange={(e) => setFormData({ ...formData, [`${displayLeftTeam}Overall`]: e.target.value })}
                  className="w-full px-2 py-1 border border-gray-600 rounded text-center bg-gray-700 text-white"
                  min="0" max="99"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Offense</label>
                <input
                  type="number"
                  value={formData[`${displayLeftTeam}Offense`]}
                  onChange={(e) => setFormData({ ...formData, [`${displayLeftTeam}Offense`]: e.target.value })}
                  className="w-full px-2 py-1 border border-gray-600 rounded text-center bg-gray-700 text-white"
                  min="0" max="99"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Defense</label>
                <input
                  type="number"
                  value={formData[`${displayLeftTeam}Defense`]}
                  onChange={(e) => setFormData({ ...formData, [`${displayLeftTeam}Defense`]: e.target.value })}
                  className="w-full px-2 py-1 border border-gray-600 rounded text-center bg-gray-700 text-white"
                  min="0" max="99"
                />
              </div>
            </div>
          </div>

          {/* Record - hidden for user team */}
          {!isLeftUserTeam && (
            <div>
              <label className="text-sm font-semibold text-gray-300 block mb-2">Season Record <span className="font-normal text-gray-500">(after game)</span></label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Overall</label>
                  <input
                    type="text"
                    value={formData[`${displayLeftTeam}Record`]}
                    onChange={(e) => setFormData({ ...formData, [`${displayLeftTeam}Record`]: e.target.value })}
                    className="w-full px-2 py-1 border border-gray-600 rounded text-center bg-gray-700 text-white"
                    placeholder="0-0"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Conference</label>
                  <input
                    type="text"
                    value={formData[`${displayLeftTeam}ConfRecord`]}
                    onChange={(e) => setFormData({ ...formData, [`${displayLeftTeam}ConfRecord`]: e.target.value })}
                    className="w-full px-2 py-1 border border-gray-600 rounded text-center bg-gray-700 text-white"
                    placeholder="0-0"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Team Details (lower seed number/better team for CFP, home for regular) */}
        <div className="bg-gray-800 rounded-xl shadow-lg p-4 sm:p-6 border border-gray-700" style={{ borderTop: `4px solid ${rightTeamColors.primary}` }}>
          <div className="flex items-center gap-3 mb-4">
            {rightTeamLogo && <img src={rightTeamLogo} alt="" className="w-10 h-10 object-contain" />}
            <h3 className="text-lg font-bold" style={{ color: rightTeamColors.primary }}>{rightTeamName}</h3>
          </div>

          {/* Rankings */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-300 mb-1">National Rank</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={formData[`${displayRightTeam}Rank`]}
                onChange={(e) => setFormData({ ...formData, [`${displayRightTeam}Rank`]: e.target.value })}
                className="w-16 px-2 py-2 border-2 rounded-lg text-center bg-gray-700 text-white"
                style={{ borderColor: `${rightTeamColors.primary}40` }}
                min="1" max="133" placeholder="#"
              />
              {formData[`${displayRightTeam}Rank`] && (
                <span className="text-lg font-semibold text-gray-400">{getOrdinalSuffix(formData[`${displayRightTeam}Rank`])}</span>
              )}
              {!formData[`${displayRightTeam}Rank`] && (
                <span className="text-sm text-gray-500">Unranked</span>
              )}
            </div>
          </div>

          {/* Ratings - show for all teams, auto-filled from preseason for user team */}
          <div className="mb-4">
            <label className="text-sm font-semibold text-gray-300 block mb-2">
              Team Ratings
              {isRightUserTeam && formData[`${displayRightTeam}Overall`] && (
                <span className="font-normal text-xs text-green-400 ml-2">(auto-filled)</span>
              )}
            </label>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Overall</label>
                <input
                  type="number"
                  value={formData[`${displayRightTeam}Overall`]}
                  onChange={(e) => setFormData({ ...formData, [`${displayRightTeam}Overall`]: e.target.value })}
                  className="w-full px-2 py-1 border border-gray-600 rounded text-center bg-gray-700 text-white"
                  min="0" max="99"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Offense</label>
                <input
                  type="number"
                  value={formData[`${displayRightTeam}Offense`]}
                  onChange={(e) => setFormData({ ...formData, [`${displayRightTeam}Offense`]: e.target.value })}
                  className="w-full px-2 py-1 border border-gray-600 rounded text-center bg-gray-700 text-white"
                  min="0" max="99"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Defense</label>
                <input
                  type="number"
                  value={formData[`${displayRightTeam}Defense`]}
                  onChange={(e) => setFormData({ ...formData, [`${displayRightTeam}Defense`]: e.target.value })}
                  className="w-full px-2 py-1 border border-gray-600 rounded text-center bg-gray-700 text-white"
                  min="0" max="99"
                />
              </div>
            </div>
          </div>

          {/* Record - hidden for user team */}
          {!isRightUserTeam && (
            <div>
              <label className="text-sm font-semibold text-gray-300 block mb-2">Season Record <span className="font-normal text-gray-500">(after game)</span></label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Overall</label>
                  <input
                    type="text"
                    value={formData[`${displayRightTeam}Record`]}
                    onChange={(e) => setFormData({ ...formData, [`${displayRightTeam}Record`]: e.target.value })}
                    className="w-full px-2 py-1 border border-gray-600 rounded text-center bg-gray-700 text-white"
                    placeholder="0-0"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Conference</label>
                  <input
                    type="text"
                    value={formData[`${displayRightTeam}ConfRecord`]}
                    onChange={(e) => setFormData({ ...formData, [`${displayRightTeam}ConfRecord`]: e.target.value })}
                    className="w-full px-2 py-1 border border-gray-600 rounded text-center bg-gray-700 text-white"
                    placeholder="0-0"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Box Score / Stats Sections */}
      <div className="bg-gray-800 rounded-xl shadow-lg p-4 sm:p-6 border border-gray-700">
        <h3 className="text-lg font-bold text-white mb-4">Box Score & Stats</h3>
        {isNewGame ? (
          <p className="text-sm text-gray-400">Save the game first to connect Google Sheets for detailed stats.</p>
        ) : (
          <>
            <p className="text-sm text-gray-400 mb-4">Connect Google Sheets to track detailed stats for this game.</p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <button
                onClick={() => openBoxScoreModal('teamStats')}
                className="p-4 border-2 border-dashed border-gray-600 rounded-xl hover:border-green-500 hover:bg-green-900/20 transition-all text-center"
              >
                <div className="text-2xl mb-2">📊</div>
                <div className="text-sm font-medium text-gray-300">Team Stats</div>
                {existingGame?.teamStatsSheetId && (
                  <div className="text-xs text-green-400 mt-1">Connected</div>
                )}
              </button>

              <button
                onClick={() => openBoxScoreModal(
                  gameHomeTeamTid === null
                    ? (displayLeftTeam === 'team1' ? 'homeStats' : 'awayStats')
                    : (leftTeamTid === gameHomeTeamTid ? 'homeStats' : 'awayStats')
                )}
                className="p-4 border-2 border-dashed border-gray-600 rounded-xl hover:border-blue-500 hover:bg-blue-900/20 transition-all text-center"
              >
                <div className="h-8 w-8 mx-auto mb-2 flex items-center justify-center">
                  {leftTeamLogo ? (
                    <img src={leftTeamLogo} alt={leftTeamAbbr} className="h-8 w-8 object-contain" />
                  ) : (
                    <span className="text-2xl">👥</span>
                  )}
                </div>
                <div className="text-sm font-medium text-gray-300">{leftTeamAbbr} Stats</div>
                {(gameHomeTeamTid === null
                  ? (displayLeftTeam === 'team1' ? existingGame?.homeStatsSheetId : existingGame?.awayStatsSheetId)
                  : (leftTeamTid === gameHomeTeamTid ? existingGame?.homeStatsSheetId : existingGame?.awayStatsSheetId)
                ) && (
                  <div className="text-xs text-green-400 mt-1">Connected</div>
                )}
              </button>

              <button
                onClick={() => openBoxScoreModal(
                  gameHomeTeamTid === null
                    ? (displayRightTeam === 'team1' ? 'homeStats' : 'awayStats')
                    : (rightTeamTid === gameHomeTeamTid ? 'homeStats' : 'awayStats')
                )}
                className="p-4 border-2 border-dashed border-gray-600 rounded-xl hover:border-blue-500 hover:bg-blue-900/20 transition-all text-center"
              >
                <div className="h-8 w-8 mx-auto mb-2 flex items-center justify-center">
                  {rightTeamLogo ? (
                    <img src={rightTeamLogo} alt={rightTeamAbbr} className="h-8 w-8 object-contain" />
                  ) : (
                    <span className="text-2xl">👥</span>
                  )}
                </div>
                <div className="text-sm font-medium text-gray-300">{rightTeamAbbr} Stats</div>
                {(gameHomeTeamTid === null
                  ? (displayRightTeam === 'team1' ? existingGame?.homeStatsSheetId : existingGame?.awayStatsSheetId)
                  : (rightTeamTid === gameHomeTeamTid ? existingGame?.homeStatsSheetId : existingGame?.awayStatsSheetId)
                ) && (
                  <div className="text-xs text-green-400 mt-1">Connected</div>
                )}
              </button>

              <button
                onClick={() => openBoxScoreModal('scoring')}
                className="p-4 border-2 border-dashed border-gray-600 rounded-xl hover:border-purple-500 hover:bg-purple-900/20 transition-all text-center"
              >
                <div className="text-2xl mb-2">🏈</div>
                <div className="text-sm font-medium text-gray-300">Scoring Summary</div>
                {existingGame?.scoringSummarySheetId && (
                  <div className="text-xs text-green-400 mt-1">Connected</div>
                )}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Game Recap */}
      <div className="bg-gray-800 rounded-xl shadow-lg p-4 sm:p-6 border border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-bold text-white">Game Recap</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyPrompt}
              disabled={!formData.team1Score || !formData.team2Score}
              className="px-3 py-1.5 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              title="Copy the full prompt to paste into ChatGPT, Claude, or another AI"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              {promptCopied ? 'Copied!' : 'Copy Prompt'}
            </button>
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
        </div>
        <p className="text-xs text-gray-400 mb-3">Tip: Enter all game info (scores, quarters, stats) before generating for the best AI recap. Use "Copy Prompt" to paste into ChatGPT or another AI.</p>
        {recapError && (
          <p className="text-sm text-red-400 mb-2">{recapError}</p>
        )}
        <textarea
          value={formData.aiRecap}
          onChange={(e) => setFormData({ ...formData, aiRecap: e.target.value })}
          className="w-full px-3 py-2 border border-gray-600 rounded-lg resize-none bg-gray-700 text-white placeholder-gray-500"
          rows={8}
          placeholder="Write a game recap or use AI to generate one..."
        />
      </div>

      {/* Media Links */}
      <div className="bg-gray-800 rounded-xl shadow-lg p-4 sm:p-6 border border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-white">Media Links</h3>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <span>YouTube videos will embed automatically</span>
          </div>
        </div>
        <p className="text-xs text-gray-400 mb-3">Add links to highlight videos, images, or related content.</p>
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
                className="flex-1 px-3 py-2 border border-gray-600 rounded-lg font-mono text-sm bg-gray-700 text-white placeholder-gray-500"
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
                  className="px-3 py-2 text-red-400 hover:bg-red-900/30 rounded-lg transition-colors"
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
          <div className="mt-3 text-xs text-gray-400">
            {formData.links.filter(l => l.trim()).length} link(s) added
          </div>
        )}
      </div>

      {/* Game Settings */}
      <div className="bg-gray-800 rounded-xl shadow-lg p-4 sm:p-6 border border-gray-700">
        <h3 className="text-lg font-bold text-white mb-4">Game Settings</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Location */}
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">Game Location</label>
            <select
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              className="w-full px-3 py-2 border border-gray-600 rounded-lg bg-gray-700 text-white"
            >
              <option value="home">{team1Name} Home</option>
              <option value="away">{team2Name} Home</option>
              <option value="neutral">Neutral Site</option>
            </select>
          </div>

          {/* Conference Game */}
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">Conference Game</label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isConferenceGame}
                  onChange={(e) => setFormData({ ...formData, isConferenceGame: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded bg-gray-700 border-gray-600"
                />
                <span className="text-sm text-gray-300">Yes</span>
              </label>
              {isConferenceGame && (
                <span className="text-xs text-green-400">(Auto-detected: {team1Conference})</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Player of the Week */}
      <div className="bg-gray-800 rounded-xl shadow-lg p-4 sm:p-6 border border-gray-700">
        <h3 className="text-lg font-bold text-white mb-4">Player of the Week</h3>
        <p className="text-xs text-gray-400 mb-4">Select players who earned conference or national Player of the Week honors for this game.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Conference POW */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-gray-300">Conference</h4>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Offensive POW</label>
              <select
                value={formData.conferencePOW}
                onChange={(e) => setFormData({ ...formData, conferencePOW: e.target.value })}
                className="w-full px-3 py-2 border border-gray-600 rounded-lg bg-gray-700 text-white text-sm"
              >
                <option value="">None</option>
                {availablePlayers.map(player => (
                  <option key={player.id} value={player.name}>
                    {player.name} ({player.position || 'N/A'}) - {
                      team1Tid && isPlayerOnRoster(player, team1Tid, gameYear) ? team1Abbr :
                      team2Tid && isPlayerOnRoster(player, team2Tid, gameYear) ? team2Abbr : '?'
                    }
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Defensive POW</label>
              <select
                value={formData.confDefensePOW}
                onChange={(e) => setFormData({ ...formData, confDefensePOW: e.target.value })}
                className="w-full px-3 py-2 border border-gray-600 rounded-lg bg-gray-700 text-white text-sm"
              >
                <option value="">None</option>
                {availablePlayers.map(player => (
                  <option key={player.id} value={player.name}>
                    {player.name} ({player.position || 'N/A'}) - {
                      team1Tid && isPlayerOnRoster(player, team1Tid, gameYear) ? team1Abbr :
                      team2Tid && isPlayerOnRoster(player, team2Tid, gameYear) ? team2Abbr : '?'
                    }
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* National POW */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-gray-300">National</h4>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Offensive POW</label>
              <select
                value={formData.nationalPOW}
                onChange={(e) => setFormData({ ...formData, nationalPOW: e.target.value })}
                className="w-full px-3 py-2 border border-gray-600 rounded-lg bg-gray-700 text-white text-sm"
              >
                <option value="">None</option>
                {availablePlayers.map(player => (
                  <option key={player.id} value={player.name}>
                    {player.name} ({player.position || 'N/A'}) - {
                      team1Tid && isPlayerOnRoster(player, team1Tid, gameYear) ? team1Abbr :
                      team2Tid && isPlayerOnRoster(player, team2Tid, gameYear) ? team2Abbr : '?'
                    }
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Defensive POW</label>
              <select
                value={formData.natlDefensePOW}
                onChange={(e) => setFormData({ ...formData, natlDefensePOW: e.target.value })}
                className="w-full px-3 py-2 border border-gray-600 rounded-lg bg-gray-700 text-white text-sm"
              >
                <option value="">None</option>
                {availablePlayers.map(player => (
                  <option key={player.id} value={player.name}>
                    {player.name} ({player.position || 'N/A'}) - {
                      team1Tid && isPlayerOnRoster(player, team1Tid, gameYear) ? team1Abbr :
                      team2Tid && isPlayerOnRoster(player, team2Tid, gameYear) ? team2Abbr : '?'
                    }
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {availablePlayers.length === 0 && (
          <p className="text-xs text-yellow-400 mt-3">No players found on either team's roster for this year. Add players to see them here.</p>
        )}
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
          onSheetCreated={handleSheetCreated}
          existingSheetId={getExistingSheetId()}
          sheetType={boxScoreModalType}
          game={existingGame ? {
            ...existingGame,
            // Override homeTeamTid with current form state if changed
            homeTeamTid: formData.location === 'home' ? team1Tid :
                         formData.location === 'away' ? team2Tid : null
          } : {
            id: currentGameId,
            team1Tid,
            team2Tid,
            team1: team1Abbr || getOriginalTeamAbbr(team1Tid) || 'Team 1',
            team2: team2Abbr || getOriginalTeamAbbr(team2Tid) || 'Team 2',
            year: gameYear,
            week: gameWeek,
            location: formData.location,
            homeTeamTid: formData.location === 'home' ? team1Tid :
                         formData.location === 'away' ? team2Tid : null
          }}
          teamColors={team1Colors}
        />
      )}
    </div>
  )
}
