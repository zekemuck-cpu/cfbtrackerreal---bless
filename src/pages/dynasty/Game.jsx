import { useState, useMemo, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { getTeamLogo } from '../../data/teams'
import { teamAbbreviations, getAbbreviationFromDisplayName } from '../../data/teamAbbreviations'
import { getTeamColors } from '../../data/teamColors'
import { getContrastTextColor } from '../../utils/colorUtils'
import { useDynasty } from '../../context/DynastyContext'
import { useAuth } from '../../context/AuthContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { generateGameRecap, getGeminiApiKey, getCustomRecapInstructions } from '../../services/geminiService'
// useTeamColors not needed - using neutral colors for game recap
import { getBowlLogo } from '../../data/bowlLogos'
import { getConferenceLogo } from '../../data/conferenceLogos'
import { getTeamConference } from '../../data/conferenceTeams'
import GameEntryModal from '../../components/GameEntryModal'
import { parseCFPGameId, getCFPRoundInfo, getCFPSlotDisplayName } from '../../data/cfpConstants'
import { STAT_TABS, STAT_TAB_ORDER } from '../../data/boxScoreConstants'

// Map abbreviations to mascot names for logo lookup
function getMascotName(abbr) {
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
    'DUKE': 'Duke Blue Devils', 'ECU': 'East Carolina Pirates', 'EMU': 'Eastern Michigan Eagles',
    'FIU': 'Florida International Panthers', 'FSU': 'Florida State Seminoles',
    'FAU': 'Florida Atlantic Owls', 'FRES': 'Fresno State Bulldogs',
    'UF': 'Florida Gators', 'GASO': 'Georgia Southern Eagles', 'GAST': 'Georgia State Panthers',
    'GT': 'Georgia Tech Yellow Jackets', 'UGA': 'Georgia Bulldogs',
    'HAW': 'Hawaii Rainbow Warriors', 'HOU': 'Houston Cougars',
    'ILL': 'Illinois Fighting Illini', 'IU': 'Indiana Hoosiers',
    'IOWA': 'Iowa Hawkeyes', 'ISU': 'Iowa State Cyclones',
    'JKST': 'Jacksonville State Gamecocks', 'JMU': 'James Madison Dukes',
    'KU': 'Kansas Jayhawks', 'KSU': 'Kansas State Wildcats',
    'KENT': 'Kent State Golden Flashes', 'UK': 'Kentucky Wildcats',
    'LIB': 'Liberty Flames', 'ULL': 'Lafayette Ragin\' Cajuns',
    'LT': 'Louisiana Tech Bulldogs', 'LOU': 'Louisville Cardinals',
    'LSU': 'LSU Tigers', 'UM': 'Miami Hurricanes', 'M-OH': 'Miami Redhawks',
    'UMD': 'Maryland Terrapins', 'MASS': 'Massachusetts Minutemen',
    'MEM': 'Memphis Tigers', 'MICH': 'Michigan Wolverines',
    'MSU': 'Michigan State Spartans', 'MTSU': 'Middle Tennessee State Blue Raiders',
    'MINN': 'Minnesota Golden Gophers', 'MISS': 'Ole Miss Rebels',
    'MSST': 'Mississippi State Bulldogs', 'MZST': 'Missouri State Bears',
    'MRSH': 'Marshall Thundering Herd', 'NAVY': 'Navy Midshipmen',
    'NEB': 'Nebraska Cornhuskers', 'NEV': 'Nevada Wolf Pack',
    'UNM': 'New Mexico Lobos', 'NMSU': 'New Mexico State Aggies',
    'UNC': 'North Carolina Tar Heels', 'NCST': 'North Carolina State Wolfpack',
    'UNT': 'North Texas Mean Green', 'NU': 'Northwestern Wildcats',
    'ND': 'Notre Dame Fighting Irish', 'NIU': 'Northern Illinois Huskies',
    'OHIO': 'Ohio Bobcats', 'OSU': 'Ohio State Buckeyes',
    'OKLA': 'Oklahoma Sooners', 'OKST': 'Oklahoma State Cowboys',
    'ODU': 'Old Dominion Monarchs', 'ORE': 'Oregon Ducks',
    'ORST': 'Oregon State Beavers', 'PSU': 'Penn State Nittany Lions',
    'PITT': 'Pittsburgh Panthers', 'PUR': 'Purdue Boilermakers',
    'RICE': 'Rice Owls', 'RUT': 'Rutgers Scarlet Knights',
    'SDSU': 'San Diego State Aztecs', 'SJSU': 'San Jose State Spartans',
    'SAM': 'Sam Houston State Bearkats', 'USF': 'South Florida Bulls',
    'SMU': 'SMU Mustangs', 'USC': 'USC Trojans',
    'SCAR': 'South Carolina Gamecocks', 'STAN': 'Stanford Cardinal',
    'SYR': 'Syracuse Orange', 'TCU': 'TCU Horned Frogs',
    'TEM': 'Temple Owls', 'TENN': 'Tennessee Volunteers',
    'TEX': 'Texas Longhorns', 'TXAM': 'Texas A&M Aggies',
    'TXST': 'Texas State Bobcats', 'TXTECH': 'Texas Tech Red Raiders',
    'TOL': 'Toledo Rockets', 'TROY': 'Troy Trojans',
    'TUL': 'Tulane Green Wave', 'TLSA': 'Tulsa Golden Hurricane',
    'UAB': 'UAB Blazers', 'UCF': 'UCF Knights', 'UCLA': 'UCLA Bruins',
    'UNLV': 'UNLV Rebels', 'UTEP': 'UTEP Miners',
    'USA': 'South Alabama Jaguars', 'USM': 'Southern Mississippi Golden Eagles', 'USU': 'Utah State Aggies',
    'UTAH': 'Utah Utes', 'UTSA': 'UTSA Roadrunners',
    'VAN': 'Vanderbilt Commodores', 'UVA': 'Virginia Cavaliers',
    'VT': 'Virginia Tech Hokies', 'WAKE': 'Wake Forest Demon Deacons',
    'WASH': 'Washington Huskies', 'WSU': 'Washington State Cougars',
    'WVU': 'West Virginia Mountaineers', 'WMU': 'Western Michigan Broncos',
    'WKU': 'Western Kentucky Hilltoppers', 'WIS': 'Wisconsin Badgers',
    'WYO': 'Wyoming Cowboys',
    'DEL': 'Delaware Fightin\' Blue Hens', 'FLA': 'Florida Gators',
    'KENN': 'Kennesaw State Owls', 'ULM': 'Monroe Warhawks',
    'UC': 'Cincinnati Bearcats', 'RUTG': 'Rutgers Scarlet Knights',
    'SHSU': 'Sam Houston State Bearkats', 'TAMU': 'Texas A&M Aggies',
    'TTU': 'Texas Tech Red Raiders', 'TULN': 'Tulane Green Wave',
    'UH': 'Houston Cougars', 'UL': 'Lafayette Ragin\' Cajuns',
    'UT': 'Tennessee Volunteers', 'MIA': 'Miami Hurricanes',
    'MIZ': 'Missouri Tigers', 'OU': 'Oklahoma Sooners',
    'GSU': 'Georgia State Panthers',
    // FCS teams
    'FCSE': 'FCS East Judicials', 'FCSM': 'FCS Midwest Rebels',
    'FCSN': 'FCS Northwest Stallions', 'FCSW': 'FCS West Titans'
  }
  return mascotMap[abbr] || null
}

// Robust logo lookup that tries multiple methods
function getTeamLogoRobust(teamInput) {
  if (!teamInput) return null

  // 1. Try direct lookup (if teamInput is already a full mascot name)
  let logo = getTeamLogo(teamInput)
  if (logo) return logo

  // 2. Try as abbreviation via getMascotName
  const mascotName = getMascotName(teamInput)
  if (mascotName) {
    logo = getTeamLogo(mascotName)
    if (logo) return logo
  }

  // 3. Try uppercase abbreviation (handle case sensitivity)
  const upperInput = teamInput.toUpperCase()
  if (upperInput !== teamInput) {
    const mascotNameUpper = getMascotName(upperInput)
    if (mascotNameUpper) {
      logo = getTeamLogo(mascotNameUpper)
      if (logo) return logo
    }
  }

  // 4. Try looking up in teamAbbreviations map directly
  const teamData = teamAbbreviations[teamInput] || teamAbbreviations[upperInput]
  if (teamData?.name) {
    logo = getTeamLogo(teamData.name)
    if (logo) return logo
  }

  return null
}

// Robust color lookup that tries multiple methods
// Note: getTeamColors returns a default orange (#ea580c) for unknown teams,
// so we need to check if the result is actually a known team's colors
function getTeamColorsRobust(teamInput) {
  if (!teamInput) return null

  // Helper to check if colors are the default fallback (orange)
  const isDefaultColors = (colors) => colors?.primary === '#ea580c'

  // 1. Try direct lookup (if teamInput is already a full mascot name)
  let colors = getTeamColors(teamInput)
  if (colors && !isDefaultColors(colors)) return colors

  // 2. Try as abbreviation via getMascotName
  const mascotName = getMascotName(teamInput)
  if (mascotName) {
    colors = getTeamColors(mascotName)
    if (colors && !isDefaultColors(colors)) return colors
  }

  // 3. Try uppercase abbreviation (handle case sensitivity)
  const upperInput = teamInput.toUpperCase()
  if (upperInput !== teamInput) {
    const mascotNameUpper = getMascotName(upperInput)
    if (mascotNameUpper) {
      colors = getTeamColors(mascotNameUpper)
      if (colors && !isDefaultColors(colors)) return colors
    }
  }

  // 4. Try looking up in teamAbbreviations map directly
  const teamData = teamAbbreviations[teamInput] || teamAbbreviations[upperInput]
  if (teamData?.name) {
    colors = getTeamColors(teamData.name)
    if (colors && !isDefaultColors(colors)) return colors
  }

  return null
}

// Default neutral colors for game recap pages
const defaultColors = {
  primary: '#1f2937',    // Gray-800
  secondary: '#f3f4f6'   // Gray-100
}

export default function Game() {
  const { id, gameId } = useParams()
  const navigate = useNavigate()
  const { currentDynasty, updateDynasty, addGame, isViewOnly } = useDynasty()
  const pathPrefix = usePathPrefix()
  // Use neutral colors for game recap pages instead of user's team colors
  const teamColors = defaultColors

  const [showEditModal, setShowEditModal] = useState(false)
  const [activeStatTab, setActiveStatTab] = useState('passing')
  // Box score sort state: { column: string | null, direction: 'asc' | 'desc' | null }
  const [homeSortConfig, setHomeSortConfig] = useState({ column: null, direction: null })
  const [awaySortConfig, setAwaySortConfig] = useState({ column: null, direction: null })

  // AI Recap state
  const { user } = useAuth()
  const [isGeneratingRecap, setIsGeneratingRecap] = useState(false)
  const [recapError, setRecapError] = useState(null)
  const [streamingRecap, setStreamingRecap] = useState('')
  const [tokenUsage, setTokenUsage] = useState(null)

  // Reset sort when changing stat tabs
  useEffect(() => {
    setHomeSortConfig({ column: null, direction: null })
    setAwaySortConfig({ column: null, direction: null })
  }, [activeStatTab])

  // Handle column header click for sorting
  const handleSort = (team, columnKey) => {
    const setSortConfig = team === 'home' ? setHomeSortConfig : setAwaySortConfig
    const currentConfig = team === 'home' ? homeSortConfig : awaySortConfig

    if (currentConfig.column !== columnKey) {
      // New column: start with descending (highest first for stats)
      // For playerName, start with ascending (A-Z)
      setSortConfig({ column: columnKey, direction: columnKey === 'playerName' ? 'asc' : 'desc' })
    } else if (currentConfig.direction === 'desc') {
      // Second click: switch to ascending
      setSortConfig({ column: columnKey, direction: 'asc' })
    } else if (currentConfig.direction === 'asc') {
      // Third click: reset to default (no sort)
      setSortConfig({ column: null, direction: null })
    }
  }

  // Sort data based on sort config
  const sortBoxScoreData = (data, sortConfig) => {
    if (!data || !sortConfig.column || !sortConfig.direction) {
      return data // Return original order
    }

    return [...data].sort((a, b) => {
      let aVal = a[sortConfig.column]
      let bVal = b[sortConfig.column]

      // Handle special computed fields
      if (activeStatTab === 'defense' && sortConfig.column === 'total') {
        aVal = (parseFloat(a.solo) || 0) + (parseFloat(a.assists) || 0)
        bVal = (parseFloat(b.solo) || 0) + (parseFloat(b.assists) || 0)
      }

      // For player name, do alphabetical sort
      if (sortConfig.column === 'playerName') {
        const aStr = (aVal || '').toString().toLowerCase()
        const bStr = (bVal || '').toString().toLowerCase()
        if (sortConfig.direction === 'asc') {
          return aStr.localeCompare(bStr)
        } else {
          return bStr.localeCompare(aStr)
        }
      }

      // For numeric values
      const aNum = parseFloat(aVal) || 0
      const bNum = parseFloat(bVal) || 0

      if (sortConfig.direction === 'asc') {
        return aNum - bNum
      } else {
        return bNum - aNum
      }
    })
  }

  // Get display headers for a stat tab - adds computed "Total" column for defense
  const getDisplayHeaders = (tabKey) => {
    const baseHeaders = STAT_TABS[tabKey].headers
    if (tabKey === 'defense') {
      // Insert "Total" after "Assists" (index 2)
      const headers = [...baseHeaders]
      headers.splice(3, 0, 'Total')
      return headers
    }
    return baseHeaders
  }

  // Scroll to top when page loads
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  // Find the game by ID in the games[] array
  // Supports direct ID lookup and pattern-based fallbacks
  const findGame = () => {
    if (!currentDynasty?.games) return null

    // 1. Direct ID lookup - this is the primary method
    // Works for regular games and CFP games with new slot IDs (cfpfr1-2025, cfpqf1-2025, etc.)
    let found = currentDynasty.games.find(g => g.id === gameId)
    if (found) return found

    // 2. NEW: CFP Slot ID pattern (cfpfr1-2025, cfpqf2-2025, cfpsf1-2025, cfpnc-2025)
    const cfpParsed = parseCFPGameId(gameId)
    if (cfpParsed) {
      const { slotId, year } = cfpParsed
      const roundInfo = getCFPRoundInfo(slotId)
      const displayName = getCFPSlotDisplayName(slotId)

      // Define bowl name mappings
      const qfBowlNames = {
        cfpqf1: 'Sugar Bowl',
        cfpqf2: 'Orange Bowl',
        cfpqf3: 'Rose Bowl',
        cfpqf4: 'Cotton Bowl'
      }
      const sfBowlNames = {
        cfpsf1: 'Peach Bowl',
        cfpsf2: 'Fiesta Bowl'
      }
      const frSeedMatchups = {
        cfpfr1: [5, 12],
        cfpfr2: [8, 9],
        cfpfr3: [6, 11],
        cfpfr4: [7, 10]
      }

      // FIRST: Check games[] array for user's game with matching CFP properties
      // User's CFP games are stored with unique IDs but have isCFPQuarterfinal, bowlName, etc.
      if (slotId.startsWith('cfpfr')) {
        const [seed1, seed2] = frSeedMatchups[slotId] || []
        found = currentDynasty.games.find(g =>
          g.isCFPFirstRound && Number(g.year) === year &&
          ((g.seed1 === seed1 && g.seed2 === seed2) || (g.seed1 === seed2 && g.seed2 === seed1))
        )
        if (found) return found
      } else if (slotId.startsWith('cfpqf')) {
        const targetBowl = qfBowlNames[slotId]
        found = currentDynasty.games.find(g =>
          g.isCFPQuarterfinal && Number(g.year) === year && g.bowlName === targetBowl
        )
        if (found) return found
      } else if (slotId.startsWith('cfpsf')) {
        const targetBowl = sfBowlNames[slotId]
        found = currentDynasty.games.find(g =>
          g.isCFPSemifinal && Number(g.year) === year && g.bowlName === targetBowl
        )
        if (found) return found
      } else if (slotId === 'cfpnc') {
        found = currentDynasty.games.find(g =>
          g.isCFPChampionship && Number(g.year) === year
        )
        if (found) return found
      }

      // FALLBACK: Check cfpResultsByYear for CPU vs CPU games
      const cfpResults = currentDynasty.cfpResultsByYear?.[year] || {}
      let cfpGame = null

      if (slotId.startsWith('cfpfr')) {
        const [seed1, seed2] = frSeedMatchups[slotId] || []
        const frGames = cfpResults.firstRound || []
        cfpGame = frGames.find(g => g && (
          (g.seed1 === seed1 && g.seed2 === seed2) ||
          (g.seed1 === seed2 && g.seed2 === seed1)
        ))
      } else if (slotId.startsWith('cfpqf')) {
        const targetBowl = qfBowlNames[slotId]
        const qfGames = cfpResults.quarterfinals || []
        cfpGame = qfGames.find(g => g && g.bowlName === targetBowl)
      } else if (slotId.startsWith('cfpsf')) {
        const targetBowl = sfBowlNames[slotId]
        const sfGames = cfpResults.semifinals || []
        cfpGame = sfGames.find(g => g && g.bowlName === targetBowl)
      } else if (slotId === 'cfpnc') {
        const champArray = cfpResults.championship || []
        cfpGame = Array.isArray(champArray) ? champArray[0] : champArray
      }

      if (cfpGame) {
        const userTeamAbbr = getAbbreviationFromDisplayName(currentDynasty.teamName)
        const isUserGame = cfpGame.team1 === userTeamAbbr || cfpGame.team2 === userTeamAbbr
        return {
          ...cfpGame,
          id: gameId,
          year,
          isPlayoff: true,
          // userTeam field indicates user involvement (no field = CPU game)
          ...(isUserGame && { userTeam: userTeamAbbr }),
          gameTitle: displayName,
          bowlName: displayName,
          ...roundInfo
        }
      }
    }

    // 3. Conference championship patterns
    // cc-{year} pattern for user's team conference championship
    const ccMatch = gameId.match(/^cc-(\d+)$/)
    if (ccMatch) {
      const year = parseInt(ccMatch[1])
      found = currentDynasty.games.find(g => g.isConferenceChampionship && Number(g.year) === year)
      if (found) return found
    }

    // cc-{year}-{conference-slug} pattern for any conference championship
    const ccConfMatch = gameId.match(/^cc-(\d+)-(.+)$/)
    if (ccConfMatch) {
      const year = parseInt(ccConfMatch[1])
      const confSlug = ccConfMatch[2]
      found = currentDynasty.games.find(g =>
        g.isConferenceChampionship && Number(g.year) === year &&
        g.conference?.toLowerCase().replace(/\s+/g, '-') === confSlug
      )
      if (found) return found
      const ccByYear = currentDynasty.conferenceChampionshipsByYear?.[year] || []
      const ccGame = ccByYear.find(g =>
        g.conference?.toLowerCase().replace(/\s+/g, '-') === confSlug
      )
      if (ccGame) {
        return {
          ...ccGame,
          id: gameId,
          year: year,
          isConferenceChampionship: true,
          // No userTeam field = CPU game (legacy CC from conferenceChampionshipsByYear)
          gameTitle: `${ccGame.conference} Championship`
        }
      }
    }

    // 4. bowl-{year}-{name} pattern for non-CFP bowl games
    const bowlMatch = gameId.match(/^bowl-(\d+)-(.+)$/)
    if (bowlMatch) {
      const year = parseInt(bowlMatch[1])
      const bowlSlug = bowlMatch[2]
      found = currentDynasty.games.find(g =>
        g.isBowlGame && Number(g.year) === year &&
        g.bowlName?.replace(/\s+/g, '-').toLowerCase() === bowlSlug
      )
      if (found) return found

      // Fallback: Check bowlGamesByYear for legacy data
      const bowlGamesByYear = currentDynasty.bowlGamesByYear || {}
      const yearData = bowlGamesByYear[year]
      if (yearData) {
        const allWeekGames = [...(yearData.week1 || []), ...(yearData.week2 || []), ...(yearData.week3 || [])]
        const bowlGame = allWeekGames.find(g =>
          g.bowlName?.replace(/\s+/g, '-').toLowerCase() === bowlSlug &&
          g.team1 && g.team2 && g.team1Score != null
        )
        if (bowlGame) {
          const winner = bowlGame.team1Score > bowlGame.team2Score ? bowlGame.team1 : bowlGame.team2
          return {
            ...bowlGame,
            id: gameId,
            year: year,
            isBowlGame: true,
            // No userTeam field = CPU game (legacy bowl from bowlGamesByYear)
            viewingTeamAbbr: winner,
            gameTitle: bowlGame.bowlName
          }
        }
      }
    }

    return null
  }

  const game = findGame()

  if (!currentDynasty) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-gray-500">Loading dynasty...</div>
      </div>
    )
  }

  if (!game) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-opacity"
          style={{ backgroundColor: teamColors.primary, color: getContrastTextColor(teamColors.primary) }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <div className="text-center py-12">
          <div className="text-xl font-bold text-gray-600">Game not found</div>
          <div className="text-gray-500 mt-2">Game ID: {gameId}</div>
        </div>
      </div>
    )
  }

  const userTeam = currentDynasty.teamName
  const userTeamAbbr = getAbbreviationFromDisplayName(userTeam)

  // Check if this is a CPU vs CPU game (no userTeam field = CPU game)
  const isCPUGame = !game.userTeam && game.team1 && game.team2 && game.team1 !== userTeamAbbr && game.team2 !== userTeamAbbr

  // For CPU games, determine viewing perspective
  let displayTeam, displayTeamAbbr, opponent, opponentAbbr
  if (isCPUGame) {
    displayTeamAbbr = game.viewingTeamAbbr || game.team1
    displayTeam = getMascotName(displayTeamAbbr) || displayTeamAbbr
    opponentAbbr = displayTeamAbbr === game.team1 ? game.team2 : game.team1
    opponent = getMascotName(opponentAbbr) || opponentAbbr
  } else {
    displayTeam = userTeam
    displayTeamAbbr = userTeamAbbr
    // Convert opponent to abbreviation if it's a full name
    opponentAbbr = getAbbreviationFromDisplayName(game.opponent) || game.opponent
    opponent = getMascotName(opponentAbbr) || game.opponent
  }

  // Get team info for display - use robust lookups to handle various team name formats
  const displayTeamLogo = getTeamLogoRobust(displayTeam) || getTeamLogoRobust(displayTeamAbbr)
  const displayTeamColors = getTeamColorsRobust(displayTeam) || getTeamColorsRobust(displayTeamAbbr) || { primary: '#666', secondary: '#fff' }

  const opponentLogo = getTeamLogoRobust(opponent) || getTeamLogoRobust(opponentAbbr)
  const opponentColors = getTeamColorsRobust(opponent) || getTeamColorsRobust(opponentAbbr) || { primary: '#666', secondary: '#fff' }

  // Determine scores
  let userScore, opponentScore, userWon
  if (isCPUGame) {
    const isTeam1Display = displayTeamAbbr === game.team1
    userScore = isTeam1Display ? game.team1Score : game.team2Score
    opponentScore = isTeam1Display ? game.team2Score : game.team1Score
    userWon = userScore > opponentScore
  } else {
    userScore = game.teamScore
    opponentScore = game.opponentScore
    userWon = game.result === 'win' || game.result === 'W'
  }

  // Helper function to get player PID by name
  const getPlayerPID = (playerName) => {
    const player = currentDynasty?.players?.find(p => p.name === playerName)
    return player?.pid
  }

  // Calculate user's record up to and including this game
  const calculateUserRecord = () => {
    if (isCPUGame) return null

    const allGames = currentDynasty?.games || []
    // Filter for user games (games with userTeam set, or legacy games with userTeam/opponent fields)
    const yearGames = allGames.filter(g => Number(g.year) === Number(game.year) && (g.userTeam || (!g.team1 && g.opponent)))

    const getGameOrder = (g) => {
      if (typeof g.week === 'number' && g.week >= 1 && g.week <= 14 &&
          !g.isConferenceChampionship && !g.isBowlGame &&
          !g.isCFPFirstRound && !g.isCFPQuarterfinal && !g.isCFPSemifinal && !g.isCFPChampionship) {
        return g.week
      }
      if (g.isConferenceChampionship) return 15
      if (g.isBowlGame && !g.isCFPFirstRound && !g.isCFPQuarterfinal && !g.isCFPSemifinal && !g.isCFPChampionship) {
        return 16 + (parseInt(String(g.bowlWeek).replace('week', '') || '0'))
      }
      if (g.isCFPFirstRound) return 20
      if (g.isCFPQuarterfinal) return 21
      if (g.isCFPSemifinal) return 22
      if (g.isCFPChampionship) return 23
      return g.week || 0
    }

    const currentGameOrder = getGameOrder(game)
    const gamesUpToThis = yearGames.filter(g => getGameOrder(g) <= currentGameOrder)

    const wins = gamesUpToThis.filter(g => g.result === 'win' || g.result === 'W').length
    const losses = gamesUpToThis.filter(g => g.result === 'loss' || g.result === 'L').length

    const confGames = gamesUpToThis.filter(g => g.isConferenceGame && !g.isConferenceChampionship)
    const confWins = confGames.filter(g => g.result === 'win' || g.result === 'W').length
    const confLosses = confGames.filter(g => g.result === 'loss' || g.result === 'L').length

    return {
      overall: `${wins}-${losses}`,
      conference: `${confWins}-${confLosses}`
    }
  }

  const userRecord = calculateUserRecord()

  // Parse links
  const parseLinks = (linksString) => {
    if (!linksString) return []
    return linksString.split(',').map(link => link.trim()).filter(link => link)
  }
  const links = parseLinks(game.links)

  const isYouTubeLink = (url) => url.includes('youtube.com') || url.includes('youtu.be')
  const getYouTubeEmbedUrl = (url) => {
    const videoIdMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/)
    return videoIdMatch ? `https://www.youtube.com/embed/${videoIdMatch[1]}` : null
  }
  const isImageLink = (url) => /\.(jpg|jpeg|png|gif|webp)$/i.test(url) || url.includes('imgur.com')

  // Determine team positions (away vs home)
  const location = game.location || 'neutral'
  const leftTeam = location === 'home' ? 'opponent' : 'user'
  const rightTeam = location === 'home' ? 'user' : 'opponent'

  // Handle game save from modal
  const handleGameSave = async (gameData) => {
    try {
      const existingGames = currentDynasty.games || []
      const gameIndex = existingGames.findIndex(g => g.id === gameId)

      // Use the game from games[] if found, otherwise use the constructed game object
      // This handles games loaded from cfpResultsByYear, bowlGamesByYear, etc.
      const originalGame = gameIndex >= 0 ? existingGames[gameIndex] : game
      const isNewGame = gameIndex < 0

      let updatedGame
      if (isCPUGame) {
        const incomingTeam1 = gameData.team1
        const incomingTeam1Score = parseInt(gameData.team1Score)
        const incomingTeam2Score = parseInt(gameData.team2Score)

        const team1MatchesOriginal = incomingTeam1 === originalGame.team1

        let finalTeam1Score, finalTeam2Score
        if (team1MatchesOriginal) {
          finalTeam1Score = incomingTeam1Score
          finalTeam2Score = incomingTeam2Score
        } else {
          finalTeam1Score = incomingTeam2Score
          finalTeam2Score = incomingTeam1Score
        }

        const winner = finalTeam1Score > finalTeam2Score ? originalGame.team1 : originalGame.team2
        const winnerIsTeam1 = winner === originalGame.team1

        updatedGame = {
          ...originalGame,
          id: gameId,  // Ensure ID is set
          team1Score: finalTeam1Score,
          team2Score: finalTeam2Score,
          winner: winner,
          // Preserve original viewingTeamAbbr or default to team1 to prevent display flip
          viewingTeamAbbr: originalGame.viewingTeamAbbr || originalGame.team1,
          gameNote: gameData.gameNote || '',
          links: gameData.links || '',
          quarters: gameData.quarters,
          overtimes: gameData.overtimes,
          // Include rankings for CPU games
          userRank: gameData.userRank,
          opponentRank: gameData.opponentRank,
          updatedAt: new Date().toISOString()
        }
      } else {
        updatedGame = {
          ...originalGame,
          ...gameData,
          id: gameId,  // Ensure ID is set
          updatedAt: new Date().toISOString()
        }
      }

      if (isCPUGame) {
        // CPU games - no box score delta tracking needed, update directly
        let updatedGames
        if (isNewGame) {
          updatedGames = [...existingGames, updatedGame]
        } else {
          updatedGames = [...existingGames]
          updatedGames[gameIndex] = updatedGame
        }
        await updateDynasty(currentDynasty.id, { games: updatedGames })
      } else {
        // User games - use addGame for proper box score delta tracking
        await addGame(currentDynasty.id, updatedGame)
      }

      setShowEditModal(false)
    } catch (error) {
      console.error('Error saving game:', error)
    }
  }

  // Generate AI recap for this game
  const handleGenerateRecap = async () => {
    if (!user?.uid || isGeneratingRecap) return

    // Confirm before overwriting existing recap
    if (game.aiRecap && !window.confirm('This will erase the existing recap. Continue?')) {
      return
    }

    setIsGeneratingRecap(true)
    setRecapError(null)
    setStreamingRecap('') // Clear for fresh streaming
    setTokenUsage(null)

    try {
      // Get the user's API key
      const apiKey = await getGeminiApiKey(user.uid)
      if (!apiKey) {
        setRecapError('No API key found. Please add your Gemini API key in AI Settings.')
        setIsGeneratingRecap(false)
        return
      }

      // Fetch custom instructions if user has them
      const customInstructions = await getCustomRecapInstructions(user.uid)

      // Generate the recap with streaming - returns { text, usage }
      const result = await generateGameRecap(currentDynasty, game, apiKey, (partialText) => {
        setStreamingRecap(partialText)
      }, customInstructions)

      // Capture token usage
      if (result.usage) {
        setTokenUsage(result.usage)
      }

      // Save the final recap to the game
      const existingGames = currentDynasty.games || []
      const gameIndex = existingGames.findIndex(g => g.id === gameId)

      if (gameIndex >= 0) {
        const updatedGames = [...existingGames]
        updatedGames[gameIndex] = {
          ...updatedGames[gameIndex],
          aiRecap: result.text,
          aiRecapGeneratedAt: new Date().toISOString()
        }
        await updateDynasty(currentDynasty.id, { games: updatedGames })
      }

      setStreamingRecap('') // Clear streaming state after save
    } catch (error) {
      console.error('Error generating recap:', error)
      setRecapError(error.message || 'Failed to generate recap')
    }

    setIsGeneratingRecap(false)
  }

  // Get game title
  let gameTitle = ''
  let gameSubtitle = ''
  if (game.isConferenceChampionship) {
    gameTitle = `${game.conference || ''} Championship`
    gameSubtitle = `${game.year} Conference Championship Game`
  } else if (game.isCFPChampionship) {
    gameTitle = 'National Championship'
    gameSubtitle = `${game.year} College Football Playoff`
  } else if (game.isCFPSemifinal) {
    gameTitle = game.bowlName || 'CFP Semifinal'
    gameSubtitle = `${game.year} College Football Playoff Semifinal`
  } else if (game.isCFPQuarterfinal) {
    gameTitle = game.bowlName || 'CFP Quarterfinal'
    gameSubtitle = `${game.year} College Football Playoff Quarterfinal`
  } else if (game.isCFPFirstRound) {
    gameTitle = 'CFP First Round'
    gameSubtitle = `${game.year} College Football Playoff`
  } else if (game.bowlName) {
    gameTitle = game.bowlName
    gameSubtitle = `${game.year} Bowl Season`
  } else {
    gameTitle = typeof game.week === 'number' ? `Week ${game.week}` : (game.week || 'Game')
    gameSubtitle = `${game.year} Regular Season`
  }

  // Get logos
  const confName = game.conference || currentDynasty?.conference || (userTeamAbbr ? getTeamConference(userTeamAbbr) : null)
  const bowlLogo = game.bowlName ? getBowlLogo(game.bowlName) : null
  const confLogo = game.isConferenceChampionship && confName ? getConferenceLogo(confName) : null
  const eventLogo = bowlLogo || confLogo

  // Get rankings - for CPU games use team1Rank/team2Rank, for user games use userRank/opponentRank
  let leftRank, rightRank
  if (isCPUGame) {
    // For CPU games, displayTeamAbbr is team1 by default
    const isLeftTeam1 = displayTeamAbbr === game.team1
    leftRank = isLeftTeam1 ? game.team1Rank : game.team2Rank
    rightRank = isLeftTeam1 ? game.team2Rank : game.team1Rank
  } else {
    leftRank = leftTeam === 'user' ? game.userRank : game.opponentRank
    rightRank = rightTeam === 'user' ? game.userRank : game.opponentRank
  }

  // Team data for rendering
  const getTeamData = (side) => {
    const isDisplayTeam = side === 'user'

    // For CPU games, get record and rating from team1/team2 fields
    let record = null
    let overall = null
    let offense = null
    let defense = null

    if (isCPUGame) {
      // Determine if this side corresponds to team1 or team2
      const isTeam1 = isDisplayTeam ? (displayTeamAbbr === game.team1) : (opponentAbbr === game.team1)
      record = isTeam1 ? game.team1Record : game.team2Record
      overall = isTeam1 ? game.team1Overall : game.team2Overall
      offense = isTeam1 ? game.team1Offense : game.team2Offense
      defense = isTeam1 ? game.team1Defense : game.team2Defense
    } else {
      // User game - user team uses dynasty record, opponent uses opponentRecord
      record = isDisplayTeam && userRecord ? `${userRecord.overall} (${userRecord.conference})` : game.opponentRecord
      overall = isDisplayTeam ? null : game.opponentOverall
      offense = isDisplayTeam ? null : game.opponentOffense
      defense = isDisplayTeam ? null : game.opponentDefense
    }

    return {
      name: isDisplayTeam ? displayTeam : opponent,
      abbr: isDisplayTeam ? displayTeamAbbr : opponentAbbr,
      logo: isDisplayTeam ? displayTeamLogo : opponentLogo,
      colors: isDisplayTeam ? displayTeamColors : opponentColors,
      score: isDisplayTeam ? userScore : opponentScore,
      isWinner: isDisplayTeam ? userWon : !userWon,
      rank: side === leftTeam ? leftRank : rightRank,
      record: record,
      overall: overall,
      offense: offense,
      defense: defense
    }
  }

  const leftData = getTeamData(leftTeam)
  const rightData = getTeamData(rightTeam)

  // Determine which team is "home" in the boxScore sense (matching BoxScoreSheetModal logic)
  // For home/neutral games: user is home in boxScore, opponent is away
  // For away games: opponent is home in boxScore, user is away
  // This is DIFFERENT from visual layout (left/right) which is based on scoreboard convention
  const boxScoreHomeIsUser = location === 'home' || location === 'neutral'
  const boxScoreHomeTeamData = boxScoreHomeIsUser ? getTeamData('user') : getTeamData('opponent')
  const boxScoreAwayTeamData = boxScoreHomeIsUser ? getTeamData('opponent') : getTeamData('user')

  // Winner takes more of the gradient with smooth blend - winner gets 70%, blend zone in middle
  const leftWon = leftData.isWinner
  const headerGradient = leftWon
    ? `linear-gradient(90deg, ${leftData.colors.primary} 0%, ${leftData.colors.primary} 55%, ${rightData.colors.primary} 85%, ${rightData.colors.primary} 100%)`
    : `linear-gradient(90deg, ${leftData.colors.primary} 0%, ${leftData.colors.primary} 15%, ${rightData.colors.primary} 45%, ${rightData.colors.primary} 100%)`

  return (
    <div className="space-y-4">
      {/* Compact Header Bar */}
      <div className="bg-gray-900 rounded-xl overflow-hidden shadow-lg">
        {/* Top bar with game info and navigation */}
        <div
          className="px-3 py-2 sm:px-4 sm:py-2.5 flex items-center justify-between"
          style={{ background: headerGradient }}
        >
          {/* Invisible placeholder to balance Edit button on right */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 invisible">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <span className="hidden sm:inline">Edit</span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {eventLogo && (
              <div className="w-6 h-6 sm:w-8 sm:h-8 bg-white rounded p-0.5 shadow">
                <img src={eventLogo} alt="Event" className="w-full h-full object-contain" />
              </div>
            )}
            {/* CFP games link to CFP Bracket page */}
            {(game.isCFPFirstRound || game.isCFPQuarterfinal || game.isCFPSemifinal || game.isCFPChampionship) ? (
              <Link
                to={`${pathPrefix}/cfp-bracket/${game.year}`}
                className="text-white text-center hover:underline"
              >
                <div className="text-sm sm:text-base font-bold">{gameTitle}</div>
                <div className="text-[10px] sm:text-xs opacity-80">{gameSubtitle}</div>
              </Link>
            ) : game.isConferenceChampionship ? (
              <Link
                to={`${pathPrefix}/conference-championship-history/${game.year}`}
                className="text-white text-center hover:underline"
              >
                <div className="text-sm sm:text-base font-bold">{gameTitle}</div>
                <div className="text-[10px] sm:text-xs opacity-80">{gameSubtitle}</div>
              </Link>
            ) : (
              <div className="text-white text-center">
                <div className="text-sm sm:text-base font-bold">{gameTitle}</div>
                <div className="text-[10px] sm:text-xs opacity-80">{gameSubtitle}</div>
              </div>
            )}
          </div>

          {!isViewOnly ? (
            <button
              onClick={() => setShowEditModal(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium text-xs sm:text-sm bg-black/20 text-white hover:bg-black/30 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <span className="hidden sm:inline">Edit</span>
            </button>
          ) : (
            /* Invisible placeholder to keep title centered in view-only mode */
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 invisible">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </div>
          )}
        </div>

        {/* Compact Scoreboard */}
        <div className="px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex items-center justify-center gap-4 sm:gap-8">
            {/* Left Team */}
            <Link to={`${pathPrefix}/team/${leftData.abbr}/${game.year}`} className="group flex-1">
              <div className="flex items-center gap-2 sm:gap-3">
                <div
                  className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center p-1.5 sm:p-2 group-hover:scale-105 transition-transform shadow-lg flex-shrink-0 bg-white"
                >
                  {leftData.logo && (
                    <img src={leftData.logo} alt={leftData.name} className="w-full h-full object-contain" />
                  )}
                </div>
                <div>
                  <div className="text-white font-bold text-xs sm:text-sm md:text-base group-hover:underline">
                    <span className="sm:hidden">{leftData.rank ? `#${leftData.rank} ` : ''}{leftData.abbr}</span>
                    <span className="hidden sm:inline">{leftData.rank ? `#${leftData.rank} ` : ''}{leftData.name}</span>
                  </div>
                  {leftData.record && (
                    <div className="text-gray-400 text-[10px] sm:text-xs">{leftData.record}</div>
                  )}
                </div>
              </div>
            </Link>

            {/* Scores */}
            <div className="flex items-center gap-3 sm:gap-5">
              <div className="text-center">
                <div className={`text-3xl sm:text-4xl md:text-5xl font-black tabular-nums ${leftData.isWinner ? 'text-white' : 'text-gray-500'}`}>
                  {leftData.score}
                </div>
              </div>

              <div className="flex flex-col items-center gap-1">
                <span className="text-gray-500 text-xs font-medium">FINAL</span>
                {game.overtimes && game.overtimes.length > 0 && (
                  <span className="text-gray-400 text-[10px] font-bold">
                    {game.overtimes.length > 1 ? `${game.overtimes.length}OT` : 'OT'}
                  </span>
                )}
              </div>

              <div className="text-center">
                <div className={`text-3xl sm:text-4xl md:text-5xl font-black tabular-nums ${rightData.isWinner ? 'text-white' : 'text-gray-500'}`}>
                  {rightData.score}
                </div>
              </div>
            </div>

            {/* Right Team */}
            <Link to={`${pathPrefix}/team/${rightData.abbr}/${game.year}`} className="group flex-1">
              <div className="flex items-center justify-end gap-2 sm:gap-3">
                <div className="text-right">
                  <div className="text-white font-bold text-xs sm:text-sm md:text-base group-hover:underline">
                    <span className="sm:hidden">{rightData.rank ? `#${rightData.rank} ` : ''}{rightData.abbr}</span>
                    <span className="hidden sm:inline">{rightData.rank ? `#${rightData.rank} ` : ''}{rightData.name}</span>
                  </div>
                  {rightData.record && (
                    <div className="text-gray-400 text-[10px] sm:text-xs">{rightData.record}</div>
                  )}
                </div>
                <div
                  className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center p-1.5 sm:p-2 group-hover:scale-105 transition-transform shadow-lg flex-shrink-0 bg-white"
                >
                  {rightData.logo && (
                    <img src={rightData.logo} alt={rightData.name} className="w-full h-full object-contain" />
                  )}
                </div>
              </div>
            </Link>
          </div>
        </div>
      </div>

      {/* Scoring Summary - Dark theme continuation */}
      {game.quarters && (() => {
        const t = game.quarters.team || {}
        const o = game.quarters.opponent || {}
        const hasData = [t.Q1, t.Q2, t.Q3, t.Q4, o.Q1, o.Q2, o.Q3, o.Q4].some(
          v => v !== undefined && v !== '' && v !== null
        )
        return hasData
      })() && (
        <div className="bg-gray-800 rounded-xl overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wider border-b border-gray-700">
                  <th className="text-left py-3 px-3 sm:px-4 font-semibold">Team</th>
                  <th className="text-center py-3 px-2 sm:px-3 font-semibold">1st</th>
                  <th className="text-center py-3 px-2 sm:px-3 font-semibold">2nd</th>
                  <th className="text-center py-3 px-2 sm:px-3 font-semibold">3rd</th>
                  <th className="text-center py-3 px-2 sm:px-3 font-semibold">4th</th>
                  {game.overtimes?.map((_, i) => (
                    <th key={i} className="text-center py-3 px-2 sm:px-3 font-semibold">OT{i > 0 ? i + 1 : ''}</th>
                  ))}
                  <th className="text-center py-3 px-3 sm:px-4 font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {[leftData, rightData].map((team, idx) => {
                  const quarterKey = (idx === 0 ? leftTeam : rightTeam) === 'user' ? 'team' : 'opponent'
                  return (
                    <tr key={idx} className={idx === 0 ? 'border-b border-gray-700' : ''}>
                      <td className="py-3 px-3 sm:px-4">
                        <Link to={`${pathPrefix}/team/${team.abbr}/${game.year}`} className="group">
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div
                              className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center p-1 flex-shrink-0 bg-white group-hover:scale-105 transition-transform"
                            >
                              {team.logo && <img src={team.logo} alt="" className="w-full h-full object-contain" />}
                            </div>
                            <span className={`font-bold group-hover:underline ${team.isWinner ? 'text-white' : 'text-gray-400'}`}>
                              <span className="sm:hidden">{team.abbr}</span>
                              <span className="hidden sm:inline">{team.name}</span>
                            </span>
                          </div>
                        </Link>
                      </td>
                      {['Q1', 'Q2', 'Q3', 'Q4'].map(q => {
                        const val = game.quarters[quarterKey]?.[q]
                        return (
                          <td key={q} className="text-center py-3 px-2 sm:px-3 text-gray-300 font-medium">
                            {val === '' || val === null || val === undefined ? 0 : val}
                          </td>
                        )
                      })}
                      {game.overtimes?.map((ot, i) => (
                        <td key={i} className="text-center py-3 px-2 sm:px-3 text-gray-300 font-medium">{ot[quarterKey] ?? '-'}</td>
                      ))}
                      <td className={`text-center py-3 px-3 sm:px-4 font-black text-lg sm:text-xl ${team.isWinner ? 'text-white' : 'text-gray-500'}`}>
                        {team.score}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Game Recap Section */}
      {!isViewOnly && (
        <div className="rounded-xl overflow-hidden shadow-lg bg-gray-900">
          <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
            <h3 className="font-bold text-white text-sm uppercase tracking-wide">
              Game Recap
            </h3>
            {game.aiRecap && (
              <button
                onClick={handleGenerateRecap}
                disabled={isGeneratingRecap}
                className="text-xs text-gray-400 hover:text-white flex items-center gap-1 transition-colors disabled:opacity-50"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                AI Regenerate
              </button>
            )}
          </div>
          <div className="p-4">
            {/* Show streaming text while generating */}
            {isGeneratingRecap && streamingRecap ? (
              <div className="space-y-4">
                <div className="text-gray-200 text-sm leading-relaxed whitespace-pre-line">
                  {streamingRecap}
                  <span className="inline-block w-2 h-4 bg-yellow-500 ml-1 animate-pulse" />
                </div>
                <div className="text-xs text-yellow-500 flex items-center gap-2">
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Generating recap...
                </div>
              </div>
            ) : game.aiRecap ? (
              <div className="text-gray-200 text-sm leading-relaxed whitespace-pre-line">
                {game.aiRecap}
              </div>
            ) : (
              <div className="text-center py-6">
                <p className="text-gray-400 text-sm mb-4">
                  Generate an AI-written game recap based on the stats and context of this game.
                </p>
                <button
                  onClick={handleGenerateRecap}
                  disabled={isGeneratingRecap}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-all disabled:opacity-50 bg-gradient-to-r from-yellow-500 to-orange-500 text-white hover:from-yellow-400 hover:to-orange-400"
                >
                  {isGeneratingRecap ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Starting...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                      AI Generate
                    </>
                  )}
                </button>
                {recapError && (
                  <p className="text-red-400 text-sm mt-3">{recapError}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Box Score Section */}
      {game.boxScore && (
        <div className="space-y-6">
          {/* Box Score Stats */}
          <div className="rounded-xl overflow-hidden shadow-lg bg-gray-900">
            <div className="px-4 py-3 border-b border-gray-700">
              <h3 className="font-bold text-white text-sm uppercase tracking-wide">
                Box Score
              </h3>
            </div>

            {/* Stat Category Tabs */}
            <div className="flex border-b border-gray-700 overflow-x-auto">
              {STAT_TAB_ORDER.map(key => {
                const tab = STAT_TABS[key]
                const hasData = (game.boxScore.home?.[key]?.length > 0) || (game.boxScore.away?.[key]?.length > 0)
                if (!hasData) return null
                return (
                  <button
                    key={key}
                    onClick={() => setActiveStatTab(key)}
                    className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                      activeStatTab === key
                        ? 'text-white border-b-2 border-white bg-gray-800'
                        : 'text-gray-400 hover:text-white hover:bg-gray-800'
                    }`}
                  >
                    {tab.title}
                  </button>
                )
              })}
            </div>

            {/* Stats Table */}
            <div className="p-4">
              {STAT_TABS[activeStatTab] && (
                <div className="space-y-6">
                  {/* Home Team Stats - uses boxScoreHomeTeamData (matches BoxScoreSheetModal logic) */}
                  {game.boxScore.home?.[activeStatTab]?.length > 0 && (
                    <div>
                      {/* Team Header - Fixed, doesn't scroll */}
                      <Link to={`${pathPrefix}/team/${boxScoreHomeTeamData.abbr}/${game.year}`} className="group flex items-center gap-2 mb-2 px-2">
                        <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center flex-shrink-0 p-1 group-hover:scale-105 transition-transform">
                          <img
                            src={getTeamLogo(getMascotName(boxScoreHomeTeamData.abbr) || boxScoreHomeTeamData.abbr)}
                            alt={boxScoreHomeTeamData.name}
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <span className="text-white font-semibold group-hover:underline">{boxScoreHomeTeamData.name}</span>
                      </Link>
                      {/* Scrollable table container */}
                      <div className="overflow-x-auto">
                        <table className="text-sm border-collapse">
                          <thead>
                            <tr className="text-gray-400 text-left">
                              {getDisplayHeaders(activeStatTab).map((header, idx) => {
                                const columnKey = idx === 0 ? 'playerName' : header.replace(/\s+/g, '').replace(/^./, c => c.toLowerCase())
                                const isSorted = homeSortConfig.column === columnKey
                                const sortArrow = isSorted ? (homeSortConfig.direction === 'asc' ? ' ▲' : ' ▼') : ''
                                return (
                                  <th
                                    key={idx}
                                    onClick={() => handleSort('home', columnKey)}
                                    className={`py-2 px-3 font-medium whitespace-nowrap cursor-pointer hover:text-white select-none ${idx === 0 ? 'sticky left-0 bg-gray-900 z-10 min-w-[150px]' : 'text-center min-w-[50px]'} ${isSorted ? 'text-white' : ''}`}
                                  >
                                    {header}{sortArrow}
                                  </th>
                                )
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            {sortBoxScoreData(game.boxScore.home[activeStatTab], homeSortConfig).map((row, rowIdx) => (
                              <tr key={rowIdx} className="border-t border-gray-800">
                                {getDisplayHeaders(activeStatTab).map((header, colIdx) => {
                                  const key = colIdx === 0 ? 'playerName' : header.replace(/\s+/g, '').replace(/^./, c => c.toLowerCase())
                                  let rawValue = row[key]
                                  // Compute total tackles for defense (solo + assists)
                                  if (activeStatTab === 'defense' && key === 'total') {
                                    rawValue = (parseFloat(row.solo) || 0) + (parseFloat(row.assists) || 0)
                                  }
                                  // For stat columns (not player name), treat blank/null/undefined as 0
                                  let value = colIdx === 0
                                    ? (rawValue ?? '-')
                                    : (rawValue === '' || rawValue === null || rawValue === undefined ? 0 : rawValue)
                                  // Format QB Rating to always show 1 decimal place
                                  if (key === 'qBRating' && value !== 0 && value !== '') {
                                    value = Number(value).toFixed(1)
                                  }
                                  const playerPID = colIdx === 0 ? getPlayerPID(value) : null
                                  return (
                                    <td
                                      key={colIdx}
                                      className={`py-2 px-3 text-white whitespace-nowrap ${colIdx === 0 ? 'sticky left-0 bg-gray-900 z-10 min-w-[150px]' : 'text-center min-w-[50px]'}`}
                                    >
                                      {colIdx === 0 && playerPID ? (
                                        <Link to={`${pathPrefix}/player/${playerPID}`} className="hover:underline hover:text-blue-300">
                                          {value}
                                        </Link>
                                      ) : value}
                                    </td>
                                  )
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Away Team Stats - uses boxScoreAwayTeamData (matches BoxScoreSheetModal logic) */}
                  {game.boxScore.away?.[activeStatTab]?.length > 0 && (
                    <div>
                      {/* Team Header - Fixed, doesn't scroll */}
                      <Link to={`${pathPrefix}/team/${boxScoreAwayTeamData.abbr}/${game.year}`} className="group flex items-center gap-2 mb-2 px-2">
                        <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center flex-shrink-0 p-1 group-hover:scale-105 transition-transform">
                          <img
                            src={getTeamLogo(getMascotName(boxScoreAwayTeamData.abbr) || boxScoreAwayTeamData.abbr)}
                            alt={boxScoreAwayTeamData.name}
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <span className="text-white font-semibold group-hover:underline">{boxScoreAwayTeamData.name}</span>
                      </Link>
                      {/* Scrollable table container */}
                      <div className="overflow-x-auto">
                        <table className="text-sm border-collapse">
                          <thead>
                            <tr className="text-gray-400 text-left">
                              {getDisplayHeaders(activeStatTab).map((header, idx) => {
                                const columnKey = idx === 0 ? 'playerName' : header.replace(/\s+/g, '').replace(/^./, c => c.toLowerCase())
                                const isSorted = awaySortConfig.column === columnKey
                                const sortArrow = isSorted ? (awaySortConfig.direction === 'asc' ? ' ▲' : ' ▼') : ''
                                return (
                                  <th
                                    key={idx}
                                    onClick={() => handleSort('away', columnKey)}
                                    className={`py-2 px-3 font-medium whitespace-nowrap cursor-pointer hover:text-white select-none ${idx === 0 ? 'sticky left-0 bg-gray-900 z-10 min-w-[150px]' : 'text-center min-w-[50px]'} ${isSorted ? 'text-white' : ''}`}
                                  >
                                    {header}{sortArrow}
                                  </th>
                                )
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            {sortBoxScoreData(game.boxScore.away[activeStatTab], awaySortConfig).map((row, rowIdx) => (
                              <tr key={rowIdx} className="border-t border-gray-800">
                                {getDisplayHeaders(activeStatTab).map((header, colIdx) => {
                                  const key = colIdx === 0 ? 'playerName' : header.replace(/\s+/g, '').replace(/^./, c => c.toLowerCase())
                                  let rawValue = row[key]
                                  // Compute total tackles for defense (solo + assists)
                                  if (activeStatTab === 'defense' && key === 'total') {
                                    rawValue = (parseFloat(row.solo) || 0) + (parseFloat(row.assists) || 0)
                                  }
                                  // For stat columns (not player name), treat blank/null/undefined as 0
                                  let value = colIdx === 0
                                    ? (rawValue ?? '-')
                                    : (rawValue === '' || rawValue === null || rawValue === undefined ? 0 : rawValue)
                                  // Format QB Rating to always show 1 decimal place
                                  if (key === 'qBRating' && value !== 0 && value !== '') {
                                    value = Number(value).toFixed(1)
                                  }
                                  const playerPID = colIdx === 0 ? getPlayerPID(value) : null
                                  return (
                                    <td
                                      key={colIdx}
                                      className={`py-2 px-3 text-white whitespace-nowrap ${colIdx === 0 ? 'sticky left-0 bg-gray-900 z-10 min-w-[150px]' : 'text-center min-w-[50px]'}`}
                                    >
                                      {colIdx === 0 && playerPID ? (
                                        <Link to={`${pathPrefix}/player/${playerPID}`} className="hover:underline hover:text-blue-300">
                                          {value}
                                        </Link>
                                      ) : value}
                                    </td>
                                  )
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Scoring Summary */}
          {game.boxScore.scoringSummary?.length > 0 && (() => {
            // Check if play is a standalone 2PT attempt (no scorer, 2PT mentioned in scoreType or patResult)
            const is2PTAttempt = (play) => {
              if (play.scorer) return false
              const scoreType = play.scoreType || ''
              const patResult = play.patResult || ''
              return scoreType.includes('2PT') || patResult.includes('2PT')
            }

            // Check if 2PT was converted (check both fields)
            const is2PTConverted = (play) => {
              const scoreType = play.scoreType || ''
              const patResult = play.patResult || ''
              return scoreType.includes('Converted') || patResult.includes('Converted')
            }

            // Calculate points for a play
            const getPlayPoints = (play) => {
              const scoreType = play.scoreType || ''
              const patResult = play.patResult || ''

              // TD-based plays (but not standalone 2PT which might have "2PT" in scoreType)
              if (scoreType.includes('TD') && !scoreType.includes('2PT')) {
                let points = 6
                if (patResult.includes('Made XP')) points += 1
                else if (patResult.includes('Converted 2PT')) points += 2
                return points
              }
              // Field goal
              if (scoreType === 'Field Goal') return 3
              // Safety
              if (scoreType === 'Safety') return 2
              // Standalone 2PT conversion (no scorer, 2PT in either field)
              if (is2PTAttempt(play)) {
                return is2PTConverted(play) ? 2 : 0
              }

              return 0
            }

            // Calculate running scores
            let leftScore = 0
            let rightScore = 0
            const playsWithScores = game.boxScore.scoringSummary.map((play) => {
              const points = getPlayPoints(play)
              const isLeftTeam = play.team?.toUpperCase() === leftData.abbr?.toUpperCase()
              if (isLeftTeam) {
                leftScore += points
              } else {
                rightScore += points
              }
              return { ...play, runningLeftScore: leftScore, runningRightScore: rightScore }
            })

            return (
              <div className="rounded-xl overflow-hidden shadow-lg bg-gray-900">
                <div className="px-4 py-3 border-b border-gray-700">
                  <h3 className="font-bold text-white text-sm uppercase tracking-wide">
                    Scoring Plays
                  </h3>
                </div>
                <div className="divide-y divide-gray-800/50">
                  {playsWithScores.map((play, idx) => {
                    const playTeamColors = getTeamColorsRobust(play.team) || { primary: '#666', secondary: '#333' }
                    const scorerPID = getPlayerPID(play.scorer)
                    const passerPID = play.passer ? getPlayerPID(play.passer) : null
                    const contrastColor = getContrastTextColor(playTeamColors.primary)
                    const isLeftTeam = play.team?.toUpperCase() === leftData.abbr?.toUpperCase()
                    return (
                      <div
                        key={idx}
                        className="flex items-stretch"
                      >
                        {/* Team color bar on left */}
                        <div
                          className="w-1.5 flex-shrink-0"
                          style={{ backgroundColor: playTeamColors.primary }}
                        />
                        {/* Main content with team-colored background */}
                        <div
                          className="flex-1 flex items-center gap-3 px-3 py-3"
                          style={{
                            background: `linear-gradient(90deg, ${playTeamColors.primary}25 0%, ${playTeamColors.primary}08 50%, transparent 100%)`
                          }}
                        >
                          {/* Quarter and time - moved to left */}
                          <div className="text-center flex-shrink-0 w-12">
                            <div
                              className="text-xs font-bold px-2 py-0.5 rounded"
                              style={{ backgroundColor: playTeamColors.primary + '40', color: 'white' }}
                            >
                              {['1', '2', '3', '4', 1, 2, 3, 4].includes(play.quarter) ? `Q${play.quarter}` : 'OT'}
                            </div>
                            <div className="text-gray-400 text-xs mt-1 font-mono">{play.timeLeft}</div>
                          </div>
                          {/* Running Score - moved to left */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <span className={`text-lg font-black tabular-nums ${isLeftTeam ? 'text-white' : 'text-gray-400'}`}>
                              {play.runningLeftScore}
                            </span>
                            <span className="text-gray-500 text-sm">-</span>
                            <span className={`text-lg font-black tabular-nums ${!isLeftTeam ? 'text-white' : 'text-gray-400'}`}>
                              {play.runningRightScore}
                            </span>
                          </div>
                          {/* Team logo */}
                          <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-gray-800/50">
                            <img
                              src={getTeamLogo(getMascotName(play.team) || play.team)}
                              alt={play.team}
                              className="w-7 h-7 object-contain"
                            />
                          </div>
                          {/* Play details */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Link
                                to={`${pathPrefix}/team/${play.team}/${game.year}`}
                                className="font-bold text-sm text-white hover:underline"
                              >
                                {getMascotName(play.team) || play.team}
                              </Link>
                              <span className="text-gray-400 text-sm">
                                {is2PTAttempt(play) ? '2PT Conversion' : play.scoreType}
                                {play.yards && ` (${play.yards} yds)`}
                              </span>
                              {play.patResult && !is2PTAttempt(play) && (
                                <span className={`text-xs px-1.5 py-0.5 rounded ${
                                  play.patResult.includes('Made') || play.patResult.includes('Converted')
                                    ? 'bg-green-500/30 text-green-300'
                                    : 'bg-red-500/30 text-red-300'
                                }`}>
                                  {play.patResult}
                                </span>
                              )}
                              {is2PTAttempt(play) && (
                                <span className={`text-xs px-1.5 py-0.5 rounded ${
                                  is2PTConverted(play)
                                    ? 'bg-green-500/30 text-green-300'
                                    : 'bg-red-500/30 text-red-300'
                                }`}>
                                  {is2PTConverted(play) ? 'Good' : 'Failed'}
                                </span>
                              )}
                            </div>
                            <div className="text-gray-300 text-xs mt-1">
                              {is2PTAttempt(play) ? (
                                <span className="font-medium text-gray-400">
                                  {play.patNotes || (is2PTConverted(play) ? 'Successful conversion' : 'Conversion failed')}
                                </span>
                              ) : (
                                <>
                                  {scorerPID ? (
                                    <Link to={`${pathPrefix}/player/${scorerPID}`} className="font-medium hover:underline hover:text-blue-300">
                                      {play.scorer}
                                    </Link>
                                  ) : <span className="font-medium">{play.scorer}</span>}
                                  {play.passer && (
                                    <>
                                      {' from '}
                                      {passerPID ? (
                                        <Link to={`${pathPrefix}/player/${passerPID}`} className="font-medium hover:underline hover:text-blue-300">
                                          {play.passer}
                                        </Link>
                                      ) : <span className="font-medium">{play.passer}</span>}
                                    </>
                                  )}
                                  {play.patNotes && (
                                    <span className="text-gray-400 ml-2">({play.patNotes})</span>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        {/* Video Link Button */}
                        {play.videoLink && (
                          <a
                            href={play.videoLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-shrink-0 p-2 rounded-lg hover:bg-white/10 transition-colors"
                            title="Watch video clip"
                          >
                            <svg className="w-5 h-5 text-blue-400 hover:text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </a>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* Team Stats Section */}
      {game.boxScore?.teamStats && (game.boxScore.teamStats.home || game.boxScore.teamStats.away) && (() => {
        const homeStats = game.boxScore.teamStats.home || {}
        const awayStats = game.boxScore.teamStats.away || {}
        // Convert team names to abbreviations for links (might be full names like "Sam Houston State Bearkats")
        const homeTeamAbbrForLink = getAbbreviationFromDisplayName(homeStats.teamAbbr) || homeStats.teamAbbr
        const awayTeamAbbrForLink = getAbbreviationFromDisplayName(awayStats.teamAbbr) || awayStats.teamAbbr

        // Helper to format percentage
        const pct = (made, att) => {
          if (!att || att === 0) return '-'
          return `${Math.round((made / att) * 100)}%`
        }

        // Helper to format possession time
        const formatPoss = (mins, secs) => {
          if (mins == null && secs == null) return '-'
          const m = mins || 0
          const s = secs || 0
          return `${m}:${s.toString().padStart(2, '0')}`
        }

        // Helper to get value or dash
        const val = (v) => v != null ? v : '-'

        // Helper to format combined stats like "3-5" (made-attempts)
        // Returns "-" if both values are missing, otherwise shows the combined format
        const combo = (made, att) => {
          if (made == null && att == null) return '-'
          return `${made ?? 0}-${att ?? 0}`
        }

        // Stat rows configuration - label, home value, away value
        const statRows = [
          { label: 'First Downs', home: val(homeStats.firstDowns), away: val(awayStats.firstDowns) },
          { label: 'Total Offense', home: val(homeStats.totalOffense), away: val(awayStats.totalOffense), bold: true },
          { label: 'Total Plays', home: val(homeStats.totalPlays), away: val(awayStats.totalPlays) },
          { label: 'Rushing', home: combo(homeStats.rushAttempts, homeStats.rushYards), away: combo(awayStats.rushAttempts, awayStats.rushYards), sub: 'ATT-YDS' },
          { label: 'Rush TDs', home: val(homeStats.rushTds), away: val(awayStats.rushTds) },
          { label: 'Passing', home: combo(homeStats.completions, homeStats.passAttempts), away: combo(awayStats.completions, awayStats.passAttempts), sub: 'CMP-ATT' },
          { label: 'Comp %', home: pct(homeStats.completions, homeStats.passAttempts), away: pct(awayStats.completions, awayStats.passAttempts), calculated: true },
          { label: 'Pass Yards', home: val(homeStats.passYards), away: val(awayStats.passYards) },
          { label: 'Pass TDs', home: val(homeStats.passTds), away: val(awayStats.passTds) },
          { label: '3rd Down', home: combo(homeStats['3rdDownConv'], homeStats['3rdDownAtt']), away: combo(awayStats['3rdDownConv'], awayStats['3rdDownAtt']) },
          { label: '3rd Down %', home: pct(homeStats['3rdDownConv'], homeStats['3rdDownAtt']), away: pct(awayStats['3rdDownConv'], awayStats['3rdDownAtt']), calculated: true },
          { label: '4th Down', home: combo(homeStats['4thDownConv'], homeStats['4thDownAtt']), away: combo(awayStats['4thDownConv'], awayStats['4thDownAtt']) },
          { label: '4th Down %', home: pct(homeStats['4thDownConv'], homeStats['4thDownAtt']), away: pct(awayStats['4thDownConv'], awayStats['4thDownAtt']), calculated: true },
          { label: '2PT Conv', home: combo(homeStats['2ptConv'], homeStats['2ptAtt']), away: combo(awayStats['2ptConv'], awayStats['2ptAtt']) },
          { label: 'Red Zone', home: `${(homeStats.redZoneTd || 0) + (homeStats.redZoneFg || 0)}`, away: `${(awayStats.redZoneTd || 0) + (awayStats.redZoneFg || 0)}`, sub: 'TD+FG' },
          { label: 'Red Zone TD', home: val(homeStats.redZoneTd), away: val(awayStats.redZoneTd) },
          { label: 'Red Zone FG', home: val(homeStats.redZoneFg), away: val(awayStats.redZoneFg) },
          { label: 'Red Zone %', home: homeStats.redZonePct != null ? `${homeStats.redZonePct}%` : '-', away: awayStats.redZonePct != null ? `${awayStats.redZonePct}%` : '-' },
          { label: 'Turnovers', home: val(homeStats.turnovers), away: val(awayStats.turnovers), bold: true },
          { label: 'Fumbles Lost', home: val(homeStats.fumblesLost), away: val(awayStats.fumblesLost) },
          { label: 'Interceptions', home: val(homeStats.interceptions), away: val(awayStats.interceptions) },
          { label: 'Punt Ret Yds', home: val(homeStats.puntRetYards), away: val(awayStats.puntRetYards) },
          { label: 'Kick Ret Yds', home: val(homeStats.kickRetYards), away: val(awayStats.kickRetYards) },
          { label: 'Total Yards', home: val(homeStats.totalYards), away: val(awayStats.totalYards), bold: true },
          { label: 'Punts', home: val(homeStats.punts), away: val(awayStats.punts) },
          { label: 'Penalties', home: val(homeStats.penalties), away: val(awayStats.penalties) },
          { label: 'Possession', home: formatPoss(homeStats.possMinutes, homeStats.possSeconds), away: formatPoss(awayStats.possMinutes, awayStats.possSeconds), bold: true }
        ]

        // Helper to check if a value is empty (dash, 0, or combinations like "-" or "0-0")
        const isEmpty = (v) => {
          if (v == null || v === '' || v === '-') return true
          const str = String(v).replace(/[-0\s]/g, '')
          return str === ''
        }

        // Filter out rows where both teams have no data
        const filteredStatRows = statRows.filter(row => !isEmpty(row.home) || !isEmpty(row.away))

        return (
          <div className="rounded-xl overflow-hidden shadow-lg bg-gray-900">
            <div className="px-4 py-3 border-b border-gray-700">
              <h3 className="font-bold text-white text-sm uppercase tracking-wide">
                Team Stats
              </h3>
            </div>
            {/* Team headers - Left = away team, Right = home team */}
            <div className="flex items-center border-b border-gray-800 bg-gray-800/50">
              <Link to={`${pathPrefix}/team/${awayTeamAbbrForLink}/${game.year}`} className="group flex-1 flex items-center justify-center gap-2 py-3 px-2 hover:bg-gray-700/50 transition-colors">
                {getTeamLogoRobust(awayTeamAbbrForLink) && (
                  <img src={getTeamLogoRobust(awayTeamAbbrForLink)} alt="" className="w-6 h-6 object-contain group-hover:scale-105 transition-transform" />
                )}
                <span className="font-bold text-sm text-white group-hover:underline">
                  <span className="hidden sm:inline">{getMascotName(awayTeamAbbrForLink) || awayTeamAbbrForLink}</span>
                  <span className="sm:hidden">{awayTeamAbbrForLink}</span>
                </span>
              </Link>
              <div className="w-28 text-center text-xs font-bold text-gray-400 uppercase">Stat</div>
              <Link to={`${pathPrefix}/team/${homeTeamAbbrForLink}/${game.year}`} className="group flex-1 flex items-center justify-center gap-2 py-3 px-2 hover:bg-gray-700/50 transition-colors">
                <span className="font-bold text-sm text-white group-hover:underline">
                  <span className="hidden sm:inline">{getMascotName(homeTeamAbbrForLink) || homeTeamAbbrForLink}</span>
                  <span className="sm:hidden">{homeTeamAbbrForLink}</span>
                </span>
                {getTeamLogoRobust(homeTeamAbbrForLink) && (
                  <img src={getTeamLogoRobust(homeTeamAbbrForLink)} alt="" className="w-6 h-6 object-contain group-hover:scale-105 transition-transform" />
                )}
              </Link>
            </div>
            {/* Stats rows */}
            <div className="divide-y divide-gray-800/50">
              {filteredStatRows.map((row, idx) => {
                return (
                  <div key={idx} className={`flex items-center ${idx % 2 === 0 ? 'bg-gray-900' : 'bg-gray-800/30'}`}>
                    <div className="flex-1 text-center py-2 px-2 font-bold text-white">
                      {row.away}
                    </div>
                    <div className="w-28 text-center py-2 px-1">
                      <span className="text-xs font-bold text-gray-300">{row.label}</span>
                      {row.sub && <span className="block text-[10px] text-gray-500 font-bold">{row.sub}</span>}
                    </div>
                    <div className="flex-1 text-center py-2 px-2 font-bold text-white">
                      {row.home}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Game Details Section */}
      {(!isCPUGame && (game.opponentOverall || game.opponentOffense || game.opponentDefense || game.conferencePOW || game.confDefensePOW || game.nationalPOW || game.natlDefensePOW)) || game.gameNote ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

          {/* Team Matchup Card */}
          {!isCPUGame && (game.opponentOverall || game.opponentOffense || game.opponentDefense) && (() => {
            // Get user's team ratings for this specific game's year
            // Look up from teamRatingsByTeamYear using the game's userTeam and year
            const gameUserTeam = game.userTeam
            const gameYear = game.year
            const userTeamRatings = currentDynasty?.teamRatingsByTeamYear?.[gameUserTeam]?.[gameYear] || {}

            // Get ratings for both teams to compare
            const leftIsOpponent = leftTeam !== 'user'
            const rightIsOpponent = rightTeam !== 'user'
            const leftRatings = leftIsOpponent
              ? { ovr: game.opponentOverall, off: game.opponentOffense, def: game.opponentDefense }
              : { ovr: userTeamRatings?.overall, off: userTeamRatings?.offense, def: userTeamRatings?.defense }
            const rightRatings = rightIsOpponent
              ? { ovr: game.opponentOverall, off: game.opponentOffense, def: game.opponentDefense }
              : { ovr: userTeamRatings?.overall, off: userTeamRatings?.offense, def: userTeamRatings?.defense }

            // Determine which team has better ratings
            const leftOvrBetter = (leftRatings.ovr || 0) > (rightRatings.ovr || 0)
            const rightOvrBetter = (rightRatings.ovr || 0) > (leftRatings.ovr || 0)
            const leftOffBetter = (leftRatings.off || 0) > (rightRatings.off || 0)
            const rightOffBetter = (rightRatings.off || 0) > (leftRatings.off || 0)
            const leftDefBetter = (leftRatings.def || 0) > (rightRatings.def || 0)
            const rightDefBetter = (rightRatings.def || 0) > (leftRatings.def || 0)

            return (
              <div className="lg:col-span-5 rounded-xl overflow-hidden shadow-lg bg-gray-800">
                <div className="px-4 py-3 border-b border-gray-700">
                  <h3 className="font-bold text-white text-sm uppercase tracking-wide">
                    Team Ratings
                  </h3>
                </div>
                <div className="p-4 space-y-4">
                  {[leftData, rightData].map((team, idx) => {
                    const ratings = idx === 0 ? leftRatings : rightRatings
                    const ovrBetter = idx === 0 ? leftOvrBetter : rightOvrBetter
                    const offBetter = idx === 0 ? leftOffBetter : rightOffBetter
                    const defBetter = idx === 0 ? leftDefBetter : rightDefBetter

                    if (!ratings.ovr && !ratings.off && !ratings.def) return null

                    return (
                      <Link key={idx} to={`${pathPrefix}/team/${team.abbr}/${game.year}`} className="group flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center p-1.5 shadow-md flex-shrink-0 bg-white group-hover:scale-105 transition-transform"
                        >
                          {team.logo && <img src={team.logo} alt="" className="w-full h-full object-contain" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-white text-sm truncate group-hover:underline">{team.name}</div>
                          <div className="flex gap-3 mt-1">
                            {ratings.ovr && (
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-gray-400 font-medium">OVR</span>
                                <span className={`text-white ${ovrBetter ? 'font-black' : 'font-normal'}`}>{ratings.ovr}</span>
                              </div>
                            )}
                            {ratings.off && (
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-gray-400 font-medium">OFF</span>
                                <span className={`text-white ${offBetter ? 'font-black' : 'font-normal'}`}>{ratings.off}</span>
                              </div>
                            )}
                            {ratings.def && (
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-gray-400 font-medium">DEF</span>
                                <span className={`text-white ${defBetter ? 'font-black' : 'font-normal'}`}>{ratings.def}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Player of the Week */}
          {!isCPUGame && (game.conferencePOW || game.confDefensePOW || game.nationalPOW || game.natlDefensePOW) && (
            <div className="lg:col-span-4 rounded-xl overflow-hidden shadow-lg bg-gradient-to-br from-gray-900 to-gray-800">
              <div className="px-4 py-3 border-b border-gray-700">
                <h3 className="font-bold text-white text-sm uppercase tracking-wide">
                  Player of the Week
                </h3>
              </div>
              <div className="p-4 space-y-3">
                {/* Conference POW Section */}
                {(game.conferencePOW || game.confDefensePOW) && (
                  <div
                    className="p-3 rounded-lg"
                    style={{ background: `linear-gradient(135deg, ${teamColors.primary}40 0%, ${teamColors.primary}20 100%)` }}
                  >
                    <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-2">Conference</div>
                    <div className="space-y-2">
                      {game.conferencePOW && (
                        <div>
                          <div className="text-[9px] text-gray-500 uppercase">Offensive</div>
                          {getPlayerPID(game.conferencePOW) ? (
                            <Link
                              to={`${pathPrefix}/player/${getPlayerPID(game.conferencePOW)}`}
                              className="font-bold text-white text-sm hover:underline truncate block"
                            >
                              {game.conferencePOW}
                            </Link>
                          ) : (
                            <div className="font-bold text-white text-sm truncate">{game.conferencePOW}</div>
                          )}
                        </div>
                      )}
                      {game.confDefensePOW && (
                        <div>
                          <div className="text-[9px] text-gray-500 uppercase">Defensive</div>
                          {getPlayerPID(game.confDefensePOW) ? (
                            <Link
                              to={`${pathPrefix}/player/${getPlayerPID(game.confDefensePOW)}`}
                              className="font-bold text-white text-sm hover:underline truncate block"
                            >
                              {game.confDefensePOW}
                            </Link>
                          ) : (
                            <div className="font-bold text-white text-sm truncate">{game.confDefensePOW}</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {/* National POW Section */}
                {(game.nationalPOW || game.natlDefensePOW) && (
                  <div className="p-3 rounded-lg bg-gradient-to-r from-yellow-500/30 to-yellow-400/20 border border-yellow-500/30">
                    <div className="text-[10px] text-yellow-300 uppercase font-bold tracking-wider mb-2">National</div>
                    <div className="space-y-2">
                      {game.nationalPOW && (
                        <div>
                          <div className="text-[9px] text-yellow-400/70 uppercase">Offensive</div>
                          {getPlayerPID(game.nationalPOW) ? (
                            <Link
                              to={`${pathPrefix}/player/${getPlayerPID(game.nationalPOW)}`}
                              className="font-bold text-yellow-300 text-sm hover:underline truncate block"
                            >
                              {game.nationalPOW}
                            </Link>
                          ) : (
                            <div className="font-bold text-yellow-300 text-sm truncate">{game.nationalPOW}</div>
                          )}
                        </div>
                      )}
                      {game.natlDefensePOW && (
                        <div>
                          <div className="text-[9px] text-yellow-400/70 uppercase">Defensive</div>
                          {getPlayerPID(game.natlDefensePOW) ? (
                            <Link
                              to={`${pathPrefix}/player/${getPlayerPID(game.natlDefensePOW)}`}
                              className="font-bold text-yellow-300 text-sm hover:underline truncate block"
                            >
                              {game.natlDefensePOW}
                            </Link>
                          ) : (
                            <div className="font-bold text-yellow-300 text-sm truncate">{game.natlDefensePOW}</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Game Notes */}
          {game.gameNote && (
            <div
              className={`rounded-xl overflow-hidden shadow-lg ${
                (!isCPUGame && (game.opponentOverall || game.conferencePOW || game.confDefensePOW || game.nationalPOW || game.natlDefensePOW))
                  ? 'lg:col-span-3'
                  : 'lg:col-span-12'
              }`}
              style={{ backgroundColor: displayTeamColors.primary }}
            >
              <div className="px-4 py-3 border-b" style={{ borderColor: `${getContrastTextColor(displayTeamColors.primary)}20` }}>
                <h3 className="font-bold text-sm uppercase tracking-wide" style={{ color: getContrastTextColor(displayTeamColors.primary) }}>
                  Game Notes
                </h3>
              </div>
              <div className="p-4">
                <p
                  className="text-sm whitespace-pre-wrap leading-relaxed"
                  style={{ color: getContrastTextColor(displayTeamColors.primary), opacity: 0.9 }}
                >
                  {game.gameNote}
                </p>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* Media Section */}
      {links.length > 0 && (
        <div className="rounded-xl overflow-hidden shadow-lg bg-gray-900">
          <div className="px-4 py-3 border-b border-gray-700">
            <h3 className="font-bold text-white text-sm uppercase tracking-wide">
              Media
            </h3>
          </div>
          <div className="p-4 space-y-4">
            {links.map((link, index) => {
              const youtubeEmbedUrl = isYouTubeLink(link) ? getYouTubeEmbedUrl(link) : null

              if (youtubeEmbedUrl) {
                return (
                  <div key={index} className="rounded-xl overflow-hidden shadow-lg aspect-video ring-1 ring-gray-700">
                    <iframe
                      width="100%"
                      height="100%"
                      src={youtubeEmbedUrl}
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="w-full h-full"
                    ></iframe>
                  </div>
                )
              } else if (isImageLink(link)) {
                return (
                  <div key={index} className="rounded-xl overflow-hidden shadow-lg ring-1 ring-gray-700">
                    <img src={link} alt={`Game media ${index + 1}`} className="w-full h-auto" />
                  </div>
                )
              } else {
                return (
                  <a
                    key={index}
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 bg-gray-800 rounded-xl hover:bg-gray-750 transition-colors group ring-1 ring-gray-700"
                  >
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: teamColors.primary }}
                    >
                      <svg className="w-5 h-5" fill="none" stroke={getContrastTextColor(teamColors.primary)} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </div>
                    <span className="text-sm text-gray-300 group-hover:text-white break-all flex-1 transition-colors">{link}</span>
                    <svg className="w-5 h-5 text-gray-500 group-hover:text-white transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </a>
                )
              }
            })}
          </div>
        </div>
      )}

      {/* Edit Modal */}
      <GameEntryModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSave={handleGameSave}
        teamColors={teamColors}
        existingGame={game}
      />
    </div>
  )
}
