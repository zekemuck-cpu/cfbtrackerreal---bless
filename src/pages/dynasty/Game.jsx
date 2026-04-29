import { useState, useMemo, useEffect } from 'react'
import { Link, useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { getTeamLogo, getMascotName as getMascotNameFromTeams } from '../../data/teams'
import { teamAbbreviations } from '../../data/teamAbbreviations'
import { TEAMS, resolveTid, getCurrentTeamAbbr, getGameTeamInfo, getAbbrFromTeamName } from '../../data/teamRegistry'
import { getTeamColors } from '../../data/teamColors'
import { getContrastTextColor } from '../../utils/colorUtils'
import { useDynasty, getUserGamePerspective, GAME_TYPES, getRecordAsOfGame, getTeamRatingsForYear } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
// useTeamColors not needed - using neutral colors for game recap
import { getBowlLogo } from '../../data/bowlLogos'
import { getConferenceLogo } from '../../data/conferenceLogos'
import { getTeamConference } from '../../data/conferenceTeams'
import { parseCFPGameId, getCFPRoundInfo, getCFPSlotDisplayName, getBowlForSlot, DEFAULT_BOWL_CONFIG } from '../../data/cfpConstants'
import { STAT_TABS, STAT_TAB_ORDER } from '../../data/boxScoreConstants'
import ScoringHighlightsModal from '../../components/ScoringHighlightsModal'
import InlineScoringHighlights from '../../components/InlineScoringHighlights'
import FormattedRecap from '../../components/FormattedRecap'
import { sortPlaysChronologically } from '../../utils/scoringPlayOrder'
import {
  PageHero,
  Card,
  Button,
  Badge,
  Tabs,
  ScoreRow,
  Stat,
  EmptyState,
  LoadingState,
  SectionHeader,
  DataTable,
  Modal,
  Skeleton,
} from '../../components/ui'

// Map abbreviations to mascot names for logo lookup
// Accepts optional teamsData for tid-based teambuilder support
function getMascotName(abbr, teamsData = null) {
  // Try tid-based lookup first if teams data provided
  if (teamsData) {
    const result = getMascotNameFromTeams(abbr, teamsData)
    if (result) return result
  }
  // Fallback to hardcoded map
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
function getTeamLogoRobust(teamInput, teamsData = null) {
  if (!teamInput) return null

  // 1. Try tid-based lookup first if teams data provided
  if (teamsData) {
    const logo = getTeamLogo(teamInput, teamsData)
    if (logo) return logo
  }

  // 2. Try direct lookup (if teamInput is already a full mascot name)
  let logo = getTeamLogo(teamInput, teamsData)
  if (logo) return logo

  // 3. Try as abbreviation via getMascotName
  const mascotName = getMascotName(teamInput, teamsData)
  if (mascotName) {
    logo = getTeamLogo(mascotName, teamsData)
    if (logo) return logo
  }

  // 4. Try uppercase abbreviation (handle case sensitivity)
  const upperInput = teamInput.toUpperCase()
  if (upperInput !== teamInput) {
    const mascotNameUpper = getMascotName(upperInput, teamsData)
    if (mascotNameUpper) {
      logo = getTeamLogo(mascotNameUpper, teamsData)
      if (logo) return logo
    }
  }

  // 5. Try looking up in teamAbbreviations map directly
  const teamData = teamAbbreviations[teamInput] || teamAbbreviations[upperInput]
  if (teamData?.name) {
    logo = getTeamLogo(teamData.name, teamsData)
    if (logo) return logo
  }

  return null
}

// Robust color lookup that tries multiple methods
// Note: getTeamColors returns a default orange (#ea580c) for unknown teams,
// so we need to check if the result is actually a known team's colors
function getTeamColorsRobust(teamInput, teamsData = null) {
  if (!teamInput) return null

  // Helper to check if colors are the default fallback (orange)
  const isDefaultColors = (colors) => colors?.primary === '#ea580c'

  // 1. Try tid-based lookup first if teams data provided
  if (teamsData) {
    const colors = getTeamColors(teamInput, teamsData)
    if (colors && !isDefaultColors(colors)) return colors
  }

  // 2. Try direct lookup (if teamInput is already a full mascot name)
  let colors = getTeamColors(teamInput, teamsData)
  if (colors && !isDefaultColors(colors)) return colors

  // 3. Try as abbreviation via getMascotName
  const mascotName = getMascotName(teamInput, teamsData)
  if (mascotName) {
    colors = getTeamColors(mascotName, teamsData)
    if (colors && !isDefaultColors(colors)) return colors
  }

  // 4. Try uppercase abbreviation (handle case sensitivity)
  const upperInput = teamInput.toUpperCase()
  if (upperInput !== teamInput) {
    const mascotNameUpper = getMascotName(upperInput, teamsData)
    if (mascotNameUpper) {
      colors = getTeamColors(mascotNameUpper, teamsData)
      if (colors && !isDefaultColors(colors)) return colors
    }
  }

  // 5. Try looking up in teamAbbreviations map directly
  const teamData = teamAbbreviations[teamInput] || teamAbbreviations[upperInput]
  if (teamData?.name) {
    colors = getTeamColors(teamData.name, teamsData)
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
  const routeLocation = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { currentDynasty, loadingDynastyId, updateDynasty, addGame, isViewOnly } = useDynasty()
  const pathPrefix = usePathPrefix()

  // Check if dynasty data is being lazily loaded from Firebase
  const isLoadingDynastyData = loadingDynastyId === currentDynasty?.id

  // Use neutral colors for game recap pages instead of user's team colors
  const teamColors = defaultColors

  const [activeStatTab, setActiveStatTab] = useState('passing')
  // Box score sort state: { column: string | null, direction: 'asc' | 'desc' | null }
  const [homeSortConfig, setHomeSortConfig] = useState({ column: null, direction: null })
  const [awaySortConfig, setAwaySortConfig] = useState({ column: null, direction: null })

  // Main content tab state is persisted in URL params. Resolution of the
  // active tab is deferred until after `game` is resolved so we can pick a
  // smart default: Gamecast when a recap exists, else the historic
  // Box Score default. A per-device preference in localStorage overrides
  // the auto-pick.
  const DEFAULT_GAME_TAB_PREF_KEY = 'cfbtracker:defaultGameTab'
  const [defaultTabPref, setDefaultTabPref] = useState(() => {
    try { return localStorage.getItem(DEFAULT_GAME_TAB_PREF_KEY) || 'auto' } catch { return 'auto' }
  })
  const persistDefaultTabPref = (val) => {
    try {
      if (val === 'auto') localStorage.removeItem(DEFAULT_GAME_TAB_PREF_KEY)
      else localStorage.setItem(DEFAULT_GAME_TAB_PREF_KEY, val)
    } catch { /* storage disabled */ }
    setDefaultTabPref(val)
  }
  const setActiveTab = (tab) => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev)
      newParams.set('tab', tab)
      return newParams
    }, { replace: true })
  }

  // Mobile box score team tab - persisted in URL params
  const boxScoreTeamTab = searchParams.get('team') || 'left'
  const setBoxScoreTeamTab = (team) => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev)
      newParams.set('team', team)
      return newParams
    }, { replace: true })
  }


  // The Game page is read-only for recap text — all copy-prompt and paste-back
  // editing happens in the game editor (GameEdit.jsx).
  const [showHighlightsModal, setShowHighlightsModal] = useState(false)
  const [highlightsStartIndex, setHighlightsStartIndex] = useState(0)

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
  // Also combines Comp/Att into C/Att for passing display and reorders for display
  const getDisplayHeaders = (tabKey) => {
    const baseHeaders = STAT_TABS[tabKey].headers
    if (tabKey === 'defense') {
      // Insert "Total" after "Assists" (index 2)
      const headers = [...baseHeaders]
      headers.splice(3, 0, 'Total')
      return headers
    }
    if (tabKey === 'passing') {
      // Display order: Player Name, Rtg, C/Att, Yards, TD, INT, Long
      // Sheet order is different (Rtg comes before Comp/Att)
      return ['Player Name', 'Rtg', 'C/Att', 'Yards', 'TD', 'INT', 'Long']
    }
    return baseHeaders
  }

  // Check if a stat value is exceptional and return highlight class
  const getStatHighlight = (statTab, key, value) => {
    const numVal = parseFloat(value) || 0
    // Thresholds for exceptional performances
    const thresholds = {
      passing: {
        yards: 300,
        tDs: 3,
        qBRating: 150
      },
      rushing: {
        yards: 100,
        tDs: 2
      },
      receiving: {
        yards: 100,
        tDs: 2
      },
      defense: {
        total: 10,
        sacks: 2,
        iNTs: 1,
        fR: 1
      },
      kicking: {
        fGM: 3,
        points: 10
      },
      punting: {
        avg: 45
      }
    }

    const tabThresholds = thresholds[statTab]
    if (!tabThresholds) return null

    const threshold = tabThresholds[key]
    if (threshold && numVal >= threshold) {
      return 'exceptional'
    }
    return null
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

      // Get bowl name from dynasty's configuration (user picks these in CFPSeedsModal)
      // This is the SINGLE SOURCE OF TRUTH for bowl names
      const bowlConfig = currentDynasty.cfpBowlConfigByYear?.[year] || DEFAULT_BOWL_CONFIG
      const configuredBowlName = getBowlForSlot(slotId, bowlConfig)
      const displayName = configuredBowlName || getCFPSlotDisplayName(slotId)

      const frSeedMatchups = {
        cfpfr1: [5, 12],
        cfpfr2: [8, 9],
        cfpfr3: [6, 11],
        cfpfr4: [7, 10]
      }

      // PRIMARY: Look up by cfpSlot - the definitive identifier for bracket position
      // cfpSlot is set when shells are created and NEVER changes
      found = currentDynasty.games.find(g =>
        g.cfpSlot === slotId && Number(g.year) === year
      )
      if (found) {
        // Update bowlName from config if it differs (ensures single source of truth)
        if (configuredBowlName && found.bowlName !== configuredBowlName) {
          return { ...found, bowlName: configuredBowlName }
        }
        return found
      }

      // SECONDARY: Fallback lookups for legacy data without cfpSlot
      if (slotId.startsWith('cfpfr')) {
        const [seed1, seed2] = frSeedMatchups[slotId] || []
        found = currentDynasty.games.find(g =>
          g.isCFPFirstRound && Number(g.year) === year &&
          ((g.seed1 === seed1 && g.seed2 === seed2) || (g.seed1 === seed2 && g.seed2 === seed1))
        )
        if (found) return found
      } else if (slotId.startsWith('cfpqf')) {
        // Find by round type and year, then verify by bye seed if possible
        found = currentDynasty.games.find(g =>
          g.isCFPQuarterfinal && Number(g.year) === year &&
          (g.cfpSlot === slotId || g.id === `${slotId}-${year}`)
        )
        if (found) return { ...found, bowlName: configuredBowlName || found.bowlName }
      } else if (slotId.startsWith('cfpsf')) {
        found = currentDynasty.games.find(g =>
          g.isCFPSemifinal && Number(g.year) === year &&
          (g.cfpSlot === slotId || g.id === `${slotId}-${year}`)
        )
        if (found) return { ...found, bowlName: configuredBowlName || found.bowlName }
      } else if (slotId === 'cfpnc') {
        found = currentDynasty.games.find(g =>
          g.isCFPChampionship && Number(g.year) === year
        )
        if (found) return found
      }

      // FALLBACK: Check cfpResultsByYear for CPU vs CPU games (legacy data)
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
        // For legacy data, try to match by cfpSlot first, then fall back to any QF game
        const qfGames = cfpResults.quarterfinals || []
        cfpGame = qfGames.find(g => g && g.cfpSlot === slotId) ||
                  qfGames.find(g => g && g.id === `${slotId}-${year}`)
      } else if (slotId.startsWith('cfpsf')) {
        const sfGames = cfpResults.semifinals || []
        cfpGame = sfGames.find(g => g && g.cfpSlot === slotId) ||
                  sfGames.find(g => g && g.id === `${slotId}-${year}`)
      } else if (slotId === 'cfpnc') {
        const champArray = cfpResults.championship || []
        cfpGame = Array.isArray(champArray) ? champArray[0] : champArray
      }

      if (cfpGame) {
        const userTeamAbbr = getCurrentTeamAbbr(currentDynasty)
        // tid-based involvement check; abbr fallback only when tids are
        // missing from either side (legacy CFP entry).
        const userTid = currentDynasty?.currentTid != null ? Number(currentDynasty.currentTid) : null
        const cfpT1Tid = cfpGame.team1Tid != null ? Number(cfpGame.team1Tid) : null
        const cfpT2Tid = cfpGame.team2Tid != null ? Number(cfpGame.team2Tid) : null
        const isUserGame = (userTid != null && (cfpT1Tid === userTid || cfpT2Tid === userTid))
          || (cfpT1Tid == null && cfpT2Tid == null && (cfpGame.team1 === userTeamAbbr || cfpGame.team2 === userTeamAbbr))
        return {
          ...cfpGame,
          id: gameId,
          year,
          isPlayoff: true,
          cfpSlot: slotId,
          // userTeam field indicates user involvement (no field = CPU game)
          ...(isUserGame && { userTeam: userTeamAbbr }),
          gameTitle: displayName,
          bowlName: configuredBowlName || displayName,
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
          // Resolve viewing perspective via tid when possible — abbr stored
          // on a legacy bowl row may have drifted if either team is a
          // teambuilder team that was renamed since the bowl ran.
          const team1Won = bowlGame.team1Score > bowlGame.team2Score
          const winner = team1Won ? bowlGame.team1 : bowlGame.team2
          const winnerTid = bowlGame.winnerTid != null
            ? Number(bowlGame.winnerTid)
            : (team1Won
                ? (bowlGame.team1Tid != null ? Number(bowlGame.team1Tid) : null)
                : (bowlGame.team2Tid != null ? Number(bowlGame.team2Tid) : null))
          return {
            ...bowlGame,
            id: gameId,
            year: year,
            isBowlGame: true,
            // No userTeam field = CPU game (legacy bowl from bowlGamesByYear)
            viewingTeamAbbr: winner,
            viewingTeamTid: winnerTid,
            gameTitle: bowlGame.bowlName
          }
        }
      }
    }

    return null
  }

  const game = findGame()

  if (!currentDynasty) {
    return <LoadingState message="Loading dynasty..." />
  }

  if (isLoadingDynastyData) {
    return <LoadingState message="Loading game data…" />
  }

  if (!game) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
          Back
        </Button>
        <EmptyState
          title="Game not found"
          message={<>Game ID: <span className="tabular">{gameId}</span></>}
        />
      </div>
    )
  }

  // Resolve the active tab now that we know whether a recap exists. URL param
  // wins if present so shared links keep working; otherwise use the per-device
  // preference, and if that's "auto" fall back to Gamecast-when-recap or
  // Box Score otherwise (the historic default).
  const autoDefaultTab = game.aiRecap ? 'gamecast' : 'boxscore'
  const effectiveDefaultTab = defaultTabPref === 'auto' ? autoDefaultTab : defaultTabPref
  const activeTab = searchParams.get('tab') || effectiveDefaultTab

  // Get user perspective for this game (if user's team was in it)
  const perspective = getUserGamePerspective(game, currentDynasty)
  const teams = currentDynasty?.teams || TEAMS

  // Check if this is a CPU vs CPU game (user was not coaching either team)
  const isCPUGame = !perspective

  // For CPU games, determine viewing perspective based on viewingTeamAbbr or team1
  // For user games, use the perspective to show user's team vs opponent
  let displayTeam, displayTeamAbbr, opponent, opponentAbbr
  let displayTeamLogo, displayTeamColors, opponentLogo, opponentColors
  let userScore, opponentScore, userWon

  if (isCPUGame) {
    // CPU game - pick a viewing team (winner or team1). Tid-based identity
    // throughout: a stored viewingTeamAbbr can drift relative to the
    // registry's current abbr after a teambuilder rename, which would
    // mis-classify the side and silently swap opponent/scores in the
    // displayed perspective. Use viewingTeamTid (synthesized at game-find
    // time) when available, fall back to abbr.
    const team1Info = game.team1Tid ? getGameTeamInfo(teams, game.team1Tid) : null
    const team2Info = game.team2Tid ? getGameTeamInfo(teams, game.team2Tid) : null
    const team1Abbr = team1Info?.abbr || game.team1
    const team2Abbr = team2Info?.abbr || game.team2

    const viewingTid = game.viewingTeamTid != null ? Number(game.viewingTeamTid) :
      (game.team1Score > game.team2Score
        ? (game.team1Tid != null ? Number(game.team1Tid) : null)
        : game.team2Score > game.team1Score
          ? (game.team2Tid != null ? Number(game.team2Tid) : null)
          : (game.team1Tid != null ? Number(game.team1Tid) : null))

    let isDisplayTeam1
    if (viewingTid != null && game.team1Tid != null && game.team2Tid != null) {
      isDisplayTeam1 = Number(game.team1Tid) === viewingTid
    } else {
      const viewingAbbr = game.viewingTeamAbbr ||
        (game.team1Score > game.team2Score ? team1Abbr :
         game.team2Score > game.team1Score ? team2Abbr : team1Abbr)
      isDisplayTeam1 = viewingAbbr === team1Abbr
    }

    displayTeamAbbr = isDisplayTeam1 ? team1Abbr : team2Abbr
    displayTeam = getMascotName(displayTeamAbbr, currentDynasty?.teams || currentDynasty?.customTeams) || displayTeamAbbr

    opponentAbbr = isDisplayTeam1 ? team2Abbr : team1Abbr
    opponent = getMascotName(opponentAbbr, currentDynasty?.teams || currentDynasty?.customTeams) || opponentAbbr

    userScore = isDisplayTeam1 ? game.team1Score : game.team2Score
    opponentScore = isDisplayTeam1 ? game.team2Score : game.team1Score
    userWon = userScore > opponentScore

    // Get team visuals
    const cpuTeamsData = currentDynasty?.teams || currentDynasty?.customTeams
    displayTeamLogo = getTeamLogoRobust(displayTeam, cpuTeamsData) || getTeamLogoRobust(displayTeamAbbr, cpuTeamsData)
    displayTeamColors = getTeamColorsRobust(displayTeam, cpuTeamsData) || getTeamColorsRobust(displayTeamAbbr, cpuTeamsData) || { primary: '#666', secondary: '#fff' }
    opponentLogo = getTeamLogoRobust(opponent, cpuTeamsData) || getTeamLogoRobust(opponentAbbr, cpuTeamsData)
    opponentColors = getTeamColorsRobust(opponent, cpuTeamsData) || getTeamColorsRobust(opponentAbbr, cpuTeamsData) || { primary: '#666', secondary: '#fff' }
  } else {
    // User game - use perspective
    const userTeamInfo = getGameTeamInfo(teams, perspective.userTid)
    const oppTeamInfo = getGameTeamInfo(teams, perspective.opponentTid)

    displayTeamAbbr = userTeamInfo?.abbr || getCurrentTeamAbbr(currentDynasty)
    displayTeam = userTeamInfo?.name || getMascotName(displayTeamAbbr, currentDynasty?.teams || currentDynasty?.customTeams) || displayTeamAbbr
    opponentAbbr = oppTeamInfo?.abbr || game.opponent
    opponent = oppTeamInfo?.name || getMascotName(opponentAbbr, currentDynasty?.teams || currentDynasty?.customTeams) || opponentAbbr

    // Get scores from perspective
    userScore = perspective.userScore
    opponentScore = perspective.opponentScore
    userWon = perspective.userWon

    // Get team visuals
    const userTeamsData = currentDynasty?.teams || currentDynasty?.customTeams
    displayTeamLogo = userTeamInfo?.logo || getTeamLogoRobust(displayTeam, userTeamsData) || getTeamLogoRobust(displayTeamAbbr, userTeamsData)
    displayTeamColors = (userTeamInfo?.primaryColor ? { primary: userTeamInfo.primaryColor, secondary: userTeamInfo.secondaryColor } : null)
      || getTeamColorsRobust(displayTeam, userTeamsData) || getTeamColorsRobust(displayTeamAbbr, userTeamsData) || { primary: '#666', secondary: '#fff' }
    opponentLogo = oppTeamInfo?.logo || getTeamLogoRobust(opponent, userTeamsData) || getTeamLogoRobust(opponentAbbr, userTeamsData)
    opponentColors = (oppTeamInfo?.primaryColor ? { primary: oppTeamInfo.primaryColor, secondary: oppTeamInfo.secondaryColor } : null)
      || getTeamColorsRobust(opponent, userTeamsData) || getTeamColorsRobust(opponentAbbr, userTeamsData) || { primary: '#666', secondary: '#fff' }
  }

  // Helper function to get player PID by name
  const getPlayerPID = (playerName) => {
    const player = currentDynasty?.players?.find(p => p.name === playerName)
    return player?.pid
  }

  // Build name → Link patterns for inline recap linking. Every unique full
  // name from the game's box score gets a link. Last-only names also link,
  // but only when unambiguous in this game (two "Johnson"s in one game would
  // be silently skipped rather than pointed at the wrong player).
  const recapPlayerLinks = (() => {
    if (!game?.boxScore) return null
    const sides = [game.boxScore.home, game.boxScore.away].filter(Boolean)
    const categories = ['passing', 'rushing', 'receiving', 'defense', 'kicking']
    const names = new Set()
    for (const side of sides) {
      for (const cat of categories) {
        for (const row of (side[cat] || [])) {
          if (row.playerName) names.add(row.playerName)
        }
      }
    }
    if (!names.size) return null
    const lastCount = new Map()
    for (const name of names) {
      const parts = name.trim().split(/\s+/)
      const last = parts[parts.length - 1]
      lastCount.set(last, (lastCount.get(last) || 0) + 1)
    }
    // Player-name links render as plain body text until hovered. `font-normal`
    // + `no-underline` override any surrounding <strong> so a name inside a
    // **bold** markdown span doesn't read as a double-emphasis link.
    const makeRender = (href) => (matchedText, key) => (
      <Link
        key={key}
        to={href}
        className="font-normal no-underline text-txt-primary hover:text-blue-300 hover:underline underline-offset-[3px] decoration-blue-400 transition-colors"
      >
        {matchedText}
      </Link>
    )
    const links = []
    for (const name of names) {
      const pid = getPlayerPID(name)
      if (!pid) continue
      const render = makeRender(`${pathPrefix}/player/${pid}`)
      links.push({ pattern: name, render })
      const parts = name.trim().split(/\s+/)
      if (parts.length > 1) {
        const last = parts[parts.length - 1]
        if (lastCount.get(last) === 1 && last !== name) {
          links.push({ pattern: last, render })
        }
      }
    }
    return links.length ? links : null
  })()

  // Helper function to get full player object by name
  const getPlayerByName = (playerName) => {
    return currentDynasty?.players?.find(p => p.name === playerName)
  }

  // Helper function to get player stats from box score
  const getPlayerBoxScoreStats = (playerName) => {
    if (!game.boxScore) return null
    const stats = []

    // Search both home and away teams
    const searchTeams = [game.boxScore.home, game.boxScore.away].filter(Boolean)

    for (const teamData of searchTeams) {
      // Check passing
      const passingRow = teamData.passing?.find(r => r.playerName === playerName)
      if (passingRow) {
        const comp = passingRow.comp || 0
        // Support both sheet format (att) and random generator format (attempts)
        const att = passingRow.att ?? passingRow.attempts ?? 0
        const yards = passingRow.yards || 0
        // Support both sheet format (tD) and random generator format (tDs)
        const tds = passingRow.tD ?? passingRow.tDs ?? 0
        const ints = passingRow.iNT || 0
        stats.push(`${comp}/${att}, ${yards} yds, ${tds} TD${ints > 0 ? `, ${ints} INT` : ''}`)
      }

      // Check rushing
      const rushingRow = teamData.rushing?.find(r => r.playerName === playerName)
      if (rushingRow && (rushingRow.carries > 0 || rushingRow.yards > 0)) {
        // Support both sheet format (tD) and random generator format (tDs)
        const rushTds = rushingRow.tD ?? rushingRow.tDs ?? 0
        stats.push(`${rushingRow.carries || 0} car, ${rushingRow.yards || 0} yds${rushTds > 0 ? `, ${rushTds} TD` : ''}`)
      }

      // Check receiving
      const receivingRow = teamData.receiving?.find(r => r.playerName === playerName)
      if (receivingRow && (receivingRow.receptions > 0 || receivingRow.yards > 0)) {
        // Support both sheet format (tD) and random generator format (tDs)
        const recTds = receivingRow.tD ?? receivingRow.tDs ?? 0
        stats.push(`${receivingRow.receptions || 0} rec, ${receivingRow.yards || 0} yds${recTds > 0 ? `, ${recTds} TD` : ''}`)
      }

      // Check defense
      const defenseRow = teamData.defense?.find(r => r.playerName === playerName)
      if (defenseRow) {
        const total = (parseFloat(defenseRow.solo) || 0) + (parseFloat(defenseRow.assists) || 0)
        const parts = []
        if (total > 0) parts.push(`${total} TKL`)
        if (defenseRow.sack > 0) parts.push(`${defenseRow.sack} sack`)
        if (defenseRow.iNT > 0) parts.push(`${defenseRow.iNT} INT`)
        if (defenseRow.tFL > 0) parts.push(`${defenseRow.tFL} TFL`)
        if (defenseRow.fF > 0) parts.push(`${defenseRow.fF} FF`)
        if (defenseRow.fR > 0) parts.push(`${defenseRow.fR} FR`)
        if (parts.length > 0) stats.push(parts.join(', '))
      }

      // Check kicking
      const kickingRow = teamData.kicking?.find(r => r.playerName === playerName)
      if (kickingRow && (kickingRow.fGM > 0 || kickingRow.xPM > 0)) {
        const parts = []
        if (kickingRow.fGM > 0 || kickingRow.fGA > 0) parts.push(`${kickingRow.fGM || 0}/${kickingRow.fGA || 0} FG`)
        if (kickingRow.xPM > 0 || kickingRow.xPA > 0) parts.push(`${kickingRow.xPM || 0}/${kickingRow.xPA || 0} XP`)
        if (parts.length > 0) stats.push(parts.join(', '))
      }
    }

    return stats.length > 0 ? stats.join(' | ') : null
  }

  // Get user's record as of this game using centralized single-source-of-truth
  const userRecord = (() => {
    if (isCPUGame || !perspective) return null
    return getRecordAsOfGame(currentDynasty, game, perspective.userTid)
  })()

  // Parse links - handles both array (new format) and comma-separated string (legacy format)
  const parseLinks = (linksData) => {
    if (!linksData) return []
    if (Array.isArray(linksData)) {
      return linksData.map(link => link.trim()).filter(link => link)
    }
    return linksData.split(',').map(link => link.trim()).filter(link => link)
  }
  const links = parseLinks(game.links)

  const isYouTubeLink = (url) => url.includes('youtube.com') || url.includes('youtu.be')
  const getYouTubeEmbedUrl = (url) => {
    const videoIdMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/)
    return videoIdMatch ? `https://www.youtube.com/embed/${videoIdMatch[1]}` : null
  }

  // Imgur album/gallery links (not direct images)
  const isImgurAlbumLink = (url) => /imgur\.com\/(a|gallery)\//.test(url)

  // Extract Imgur album/gallery ID from URL
  const getImgurAlbumId = (url) => {
    const match = url.match(/imgur\.com\/(?:a|gallery)\/([a-zA-Z0-9]+)/)
    return match ? match[1] : null
  }

  // Imgur single post link (imgur.com/XXX but not album/gallery)
  const isImgurPostLink = (url) => {
    // Match imgur.com/XXX where XXX is an image ID (not a/, gallery/, or already i.imgur.com)
    if (url.includes('i.imgur.com')) return false
    if (isImgurAlbumLink(url)) return false
    return /imgur\.com\/([a-zA-Z0-9]{5,8})(?:\?|$|#)/.test(url) || /imgur\.com\/([a-zA-Z0-9]{5,8})$/.test(url)
  }

  // Convert Imgur post URL to direct image URL
  const getImgurDirectUrl = (url) => {
    const match = url.match(/imgur\.com\/([a-zA-Z0-9]{5,8})/)
    return match ? `https://i.imgur.com/${match[1]}.jpg` : null
  }

  // Direct image links (including i.imgur.com direct images, but NOT album pages)
  const isImageLink = (url) => {
    // Direct image file extensions
    if (/\.(jpg|jpeg|png|gif|webp)$/i.test(url)) return true
    // i.imgur.com direct image links (like i.imgur.com/XXX.jpg or i.imgur.com/XXX without extension)
    if (/i\.imgur\.com\/[a-zA-Z0-9]+/.test(url) && !url.includes('/a/') && !url.includes('/gallery/')) return true
    return false
  }

  // Determine team positions (away vs home)
  // For CFP games: Lower seed (better, e.g. #1) on left, Higher seed (worse, e.g. #12) on right
  // For regular games: Away team on left, Home team on right
  let location
  if (perspective) {
    location = perspective.isHome ? 'home' : perspective.isAway ? 'away' : 'neutral'
  } else {
    // CPU game - fall back to legacy location or derive from homeTeamTid
    if (game.location) {
      location = game.location
    } else if (game.homeTeamTid) {
      // Get displayTeam's tid and check if it matches homeTeamTid
      const displayTid = resolveTid(displayTeamAbbr, teams)
      location = game.homeTeamTid === displayTid ? 'home' : 'away'
    } else {
      location = 'neutral' // Default for postseason
    }
  }

  // Check if this is a CFP game and get seeds
  const isCFPGame = game.isCFPFirstRound || game.isCFPQuarterfinal ||
                    game.isCFPSemifinal || game.isCFPChampionship

  // Get CFP seeds for each team by tid only
  const getCFPSeedForTid = (tid) => {
    if (!tid || !currentDynasty?.cfpSeedsByYear) return null
    const cfpSeeds = currentDynasty.cfpSeedsByYear[game.year] || currentDynasty.cfpSeedsByYear[String(game.year)]
    if (!cfpSeeds) return null
    const seedEntry = cfpSeeds.find(s => s.tid === tid)
    return seedEntry?.seed || null
  }

  // Get user and opponent tids
  const userTid = perspective?.userTid || resolveTid(displayTeamAbbr, teams)
  const oppTid = perspective?.opponentTid || resolveTid(opponentAbbr, teams)

  // Get seeds from game data or calculate from cfpSeedsByYear
  const userSeed = game.seed1 || game.cfpSeed1 || getCFPSeedForTid(userTid)
  const oppSeed = game.seed2 || game.cfpSeed2 || getCFPSeedForTid(oppTid)

  // For CFP games: determine left/right based on seeding (better seed on right)
  let leftTeam, rightTeam
  if (isCFPGame && userSeed && oppSeed) {
    // Lower seed number = better team, goes on right/bottom
    leftTeam = userSeed > oppSeed ? 'user' : 'opponent'
    rightTeam = userSeed > oppSeed ? 'opponent' : 'user'
  } else {
    // Regular games: away on left, home on right
    leftTeam = location === 'home' ? 'opponent' : 'user'
    rightTeam = location === 'home' ? 'user' : 'opponent'
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
    gameTitle = game.week ? `Week ${game.week}` : 'Game'
    gameSubtitle = `${game.year} Regular Season`
  }

  // Get logos
  const confName = game.conference || currentDynasty?.conference || (displayTeamAbbr ? getTeamConference(displayTeamAbbr) : null)
  const bowlLogo = game.bowlName ? getBowlLogo(game.bowlName) : null
  const confLogo = game.isConferenceChampionship && confName ? getConferenceLogo(confName) : null
  const eventLogo = bowlLogo || confLogo

  // Get rankings - for CPU games use team1Rank/team2Rank, for user games use userRank/opponentRank
  let leftRank, rightRank
  if (isCPUGame) {
    // For CPU games, compare displayTeamAbbr with team1 abbreviation
    const team1Info = game.team1Tid ? getGameTeamInfo(teams, game.team1Tid) : null
    const team1Abbr = team1Info?.abbr || game.team1
    const isLeftTeam1 = displayTeamAbbr === team1Abbr
    leftRank = isLeftTeam1 ? game.team1Rank : game.team2Rank
    rightRank = isLeftTeam1 ? game.team2Rank : game.team1Rank
  } else {
    // For user games, use perspective ranks or fallback to game fields
    const userRank = perspective?.userRank ?? game.userRank ?? game.team1Rank
    const oppRank = perspective?.opponentRank ?? game.opponentRank ?? game.team2Rank
    leftRank = leftTeam === 'user' ? userRank : oppRank
    rightRank = rightTeam === 'user' ? userRank : oppRank
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
      const team1Info = game.team1Tid ? getGameTeamInfo(teams, game.team1Tid) : null
      const team1Abbr = team1Info?.abbr || game.team1
      const isTeam1 = isDisplayTeam ? (displayTeamAbbr === team1Abbr) : (opponentAbbr === team1Abbr)
      record = isTeam1 ? game.team1Record : game.team2Record
      overall = isTeam1 ? game.team1Overall : game.team2Overall
      offense = isTeam1 ? game.team1Offense : game.team2Offense
      defense = isTeam1 ? game.team1Defense : game.team2Defense
    } else {
      // User game - for unified format, user is team1, opponent is team2
      // For opponent record: check team2Record (unified) then opponentRecord (legacy)
      const opponentRecordStr = game.team2Record || game.opponentRecord
      const opponentConfStr = game.team2ConfRecord || ''
      record = isDisplayTeam && userRecord
        ? `${userRecord.overall} (${userRecord.conference})`
        : (opponentRecordStr ? `${opponentRecordStr}${opponentConfStr ? ` (${opponentConfStr})` : ''}` : null)
      // For unified format: user ratings in team1*, opponent ratings in team2*
      // For legacy format: opponent ratings in opponent* fields
      overall = isDisplayTeam
        ? (game.team1Overall ?? null)  // User's overall from unified format
        : (game.team2Overall ?? game.opponentOverall ?? null)  // Opponent's overall
      offense = isDisplayTeam
        ? (game.team1Offense ?? null)
        : (game.team2Offense ?? game.opponentOffense ?? null)
      defense = isDisplayTeam
        ? (game.team1Defense ?? null)
        : (game.team2Defense ?? game.opponentDefense ?? null)
    }

    // Resolve tid for this side so downstream comparisons (quarter scores,
    // etc.) can match by tid instead of abbr — the only safe way when two
    // teams in the same dynasty share an abbreviation.
    let tid = null
    if (isCPUGame) {
      const team1Tid = game.team1Tid
      const team2Tid = game.team2Tid
      const team1Info = team1Tid ? getGameTeamInfo(teams, team1Tid) : null
      const team1Abbr = team1Info?.abbr || game.team1
      const isTeam1 = isDisplayTeam ? (displayTeamAbbr === team1Abbr) : (opponentAbbr === team1Abbr)
      tid = isTeam1 ? team1Tid : team2Tid
    } else {
      tid = isDisplayTeam ? (game.team1Tid ?? game.userTid ?? null) : (game.team2Tid ?? game.opponentTid ?? null)
    }

    return {
      name: isDisplayTeam ? displayTeam : opponent,
      abbr: isDisplayTeam ? displayTeamAbbr : opponentAbbr,
      tid,
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

  // Check if game has been played (has scores)
  const gameIsPlayed = game.isPlayed || (game.team1Score > 0 || game.team2Score > 0)

  // Quarter scores are only "entered" if at least one quarter has a positive value.
  // An all-zero quarters object means the user never filled out the breakdown.
  const hasQuarterScores = (() => {
    if (!game.quarters) return false
    const t = game.quarters.team1 || game.quarters.team || {}
    const o = game.quarters.team2 || game.quarters.opponent || {}
    const keys = ['Q1', 'Q2', 'Q3', 'Q4', 'OT', 'OT2', 'OT3', 'OT4']
    const vals = []
    keys.forEach(k => { vals.push(t[k], o[k]) })
    return vals.some(v => {
      if (v === undefined || v === null || v === '') return false
      const n = Number(v)
      return Number.isFinite(n) && n > 0
    })
  })()

  // Determine which team is "home" in the boxScore sense (matching BoxScoreSheetModal logic)
  // For home/neutral games: user is home in boxScore, opponent is away
  // For away games: opponent is home in boxScore, user is away
  // This is DIFFERENT from visual layout (left/right) which is based on scoreboard convention
  const boxScoreHomeIsUser = location === 'home' || location === 'neutral'
  const boxScoreHomeTeamData = boxScoreHomeIsUser ? getTeamData('user') : getTeamData('opponent')
  const boxScoreAwayTeamData = boxScoreHomeIsUser ? getTeamData('opponent') : getTeamData('user')

  // Winner takes more of the gradient with smooth blend - winner gets 70%, blend zone in middle
  // For unplayed games, use 50-50 split
  const leftWon = leftData.isWinner
  const headerGradient = !gameIsPlayed
    ? `linear-gradient(90deg, ${leftData.colors.primary} 0%, ${leftData.colors.primary} 40%, ${rightData.colors.primary} 60%, ${rightData.colors.primary} 100%)`
    : leftWon
      ? `linear-gradient(90deg, ${leftData.colors.primary} 0%, ${leftData.colors.primary} 55%, ${rightData.colors.primary} 85%, ${rightData.colors.primary} 100%)`
      : `linear-gradient(90deg, ${leftData.colors.primary} 0%, ${leftData.colors.primary} 15%, ${rightData.colors.primary} 45%, ${rightData.colors.primary} 100%)`

  return (
    <div className="space-y-4 overflow-x-hidden">
      {/* Hero Scoreboard */}
      <div className="bg-surface-1 rounded-2xl overflow-hidden shadow-2xl">
        {/* Top bar with game info and navigation */}
        <div
          className="px-3 py-2.5 sm:px-4 sm:py-3 flex items-center justify-between"
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
              <div className="w-7 h-7 sm:w-9 sm:h-9 bg-white rounded-lg p-0.5 shadow-lg">
                <img src={eventLogo} alt="Event" className="w-full h-full object-contain" />
              </div>
            )}
            {/* CFP games link to CFP Bracket page */}
            {(game.isCFPFirstRound || game.isCFPQuarterfinal || game.isCFPSemifinal || game.isCFPChampionship ||
              game.gameType === GAME_TYPES.CFP_FIRST_ROUND || game.gameType === GAME_TYPES.CFP_QUARTERFINAL ||
              game.gameType === GAME_TYPES.CFP_SEMIFINAL || game.gameType === GAME_TYPES.CFP_CHAMPIONSHIP) ? (
              <Link
                to={`${pathPrefix}/cfp-bracket/${game.year}`}
                className="text-white text-center hover:underline"
              >
                <div className="text-sm sm:text-lg font-bold drop-shadow-md">{gameTitle}</div>
                <div className="text-[10px] sm:text-xs opacity-90">{gameSubtitle}</div>
              </Link>
            ) : game.isConferenceChampionship ? (
              <Link
                to={`${pathPrefix}/conference-championship-history?conference=${encodeURIComponent(game.conference || '')}`}
                className="text-white text-center hover:underline"
              >
                <div className="text-sm sm:text-lg font-bold drop-shadow-md">{gameTitle}</div>
                <div className="text-[10px] sm:text-xs opacity-90">{gameSubtitle}</div>
              </Link>
            ) : game.isBowlGame ? (
              <Link
                to={`${pathPrefix}/bowl-history?bowl=${encodeURIComponent(game.bowlName || gameTitle)}`}
                className="text-white text-center hover:underline"
              >
                <div className="text-sm sm:text-lg font-bold drop-shadow-md">{gameTitle}</div>
                <div className="text-[10px] sm:text-xs opacity-90">{gameSubtitle}</div>
              </Link>
            ) : (
              <div className="text-white text-center">
                <div className="text-sm sm:text-lg font-bold drop-shadow-md">{gameTitle}</div>
                <div className="text-[10px] sm:text-xs opacity-90">{gameSubtitle}</div>
              </div>
            )}
          </div>

          {!isViewOnly ? (
            <button
              onClick={() => navigate(`${pathPrefix}/game/${gameId}/edit`, { state: { from: routeLocation.pathname } })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium text-xs sm:text-sm bg-white/20 text-white hover:bg-white/30 transition-colors backdrop-blur-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <span className="hidden sm:inline">Edit</span>
            </button>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 invisible">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </div>
          )}
        </div>

        {/* Desktop: ESPN-style integrated layout with quarter table in center */}
        {gameIsPlayed && hasQuarterScores && (
          <div className="hidden lg:block px-8 py-6">
            <div className="flex items-center justify-between">
              {/* Left Team — collapsed to content width so score sits next
                  to the name. justify-between on the row above distributes
                  the open space between this cluster, the quarter table,
                  and the right cluster. */}
              <div className={`flex items-center gap-6 ${!leftData.isWinner ? 'opacity-75' : ''}`}>
                <Link to={`${pathPrefix}/team/${resolveTid(leftData.abbr, currentDynasty?.teams || TEAMS)}/${game.year}`} className="group flex items-center gap-4">
                  <div className="relative flex-shrink-0">
                    <div
                      className="w-16 h-16 rounded-full flex items-center justify-center p-2  shadow-xl bg-white"
                      style={{
                        boxShadow: leftData.isWinner
                          ? `0 0 20px ${leftData.colors.primary}60, 0 4px 16px rgba(0,0,0,0.4)`
                          : '0 4px 16px rgba(0,0,0,0.4)'
                      }}
                    >
                      {leftData.logo && (
                        <img src={leftData.logo} alt={leftData.name} className="w-full h-full object-contain" />
                      )}
                    </div>
                    {isCFPGame && (leftTeam === 'user' ? userSeed : oppSeed) && (
                      <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-amber-500/90 flex items-center justify-center shadow-lg border-2 border-surface-1">
                        <span className="text-[10px] font-black text-txt-primary">{leftTeam === 'user' ? userSeed : oppSeed}</span>
                      </div>
                    )}
                  </div>
                  <div className="text-left">
                    {leftData.rank && !isCFPGame && (
                      <div className="text-amber-400 text-xs font-bold">#{leftData.rank}</div>
                    )}
                    <div className="text-white font-bold text-lg group-hover:underline">{leftData.name}</div>
                    {leftData.record && (
                      <div className="text-txt-tertiary text-sm">{leftData.record}</div>
                    )}
                  </div>
                </Link>
                {/* Score with winner triangle — sits next to the team
                    cluster (no ml-auto) so it doesn't drift toward the
                    quarter table. */}
                <div className="flex items-center gap-2">
                  <div
                    className={`text-6xl font-black tabular-nums ${leftData.isWinner ? 'text-white' : 'text-txt-muted'}`}
                    style={leftData.isWinner ? { textShadow: '0 0 20px rgba(255,255,255,0.3)' } : {}}
                  >
                    {leftData.score}
                  </div>
                  {leftData.isWinner && (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M15 19V5l-7 7 7 7z" />
                    </svg>
                  )}
                </div>
              </div>

              {/* Center: Quarter Scores Table */}
              <div className="flex-shrink-0 mx-4">
                {(() => {
                  const t = game.quarters.team1 || game.quarters.team || {}
                  const o = game.quarters.team2 || game.quarters.opponent || {}
                  const isNewFormat = game.quarters.team1 || game.quarters.team2
                  // Match by tid when both sides are available — abbrs can
                  // collide between teambuilder teams and real FBS teams.
                  // Fall back to abbr only when one side has no tid.
                  const isLeftTeam1 = leftData.tid != null && game.team1Tid != null
                    ? Number(leftData.tid) === Number(game.team1Tid)
                    : leftData.abbr === (game.team1Tid ? (currentDynasty?.teams?.[game.team1Tid]?.abbr || TEAMS[game.team1Tid]?.abbr) : game.team1)
                  const leftQuarterKey = isNewFormat ? (isLeftTeam1 ? 'team1' : 'team2') : (leftTeam === 'user' ? 'team' : 'opponent')
                  const rightQuarterKey = isNewFormat ? (isLeftTeam1 ? 'team2' : 'team1') : (leftTeam === 'user' ? 'opponent' : 'team')
                  const leftQuarters = game.quarters[leftQuarterKey] || {}
                  const rightQuarters = game.quarters[rightQuarterKey] || {}

                  return (
                    <table className="text-center">
                      <thead>
                        <tr className="text-xs text-txt-muted uppercase">
                          <th className="px-2 py-1"></th>
                          <th className="px-3 py-1">1</th>
                          <th className="px-3 py-1">2</th>
                          <th className="px-3 py-1">3</th>
                          <th className="px-3 py-1">4</th>
                          {game.overtimes?.map((_, i) => (
                            <th key={i} className="px-3 py-1">OT{i > 0 ? i + 1 : ''}</th>
                          ))}
                          <th className="px-3 py-1 pl-4 border-l border-surface-4">T</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className={`pr-3 py-1.5 text-left text-sm font-bold ${leftData.isWinner ? 'text-white' : 'text-txt-tertiary'}`}>{leftData.abbr}</td>
                          {['Q1', 'Q2', 'Q3', 'Q4'].map(q => (
                            <td key={q} className="px-3 py-1.5 text-txt-secondary text-sm">
                              {leftQuarters[q] === '' || leftQuarters[q] === null || leftQuarters[q] === undefined ? 0 : leftQuarters[q]}
                            </td>
                          ))}
                          {game.overtimes?.map((ot, i) => (
                            <td key={i} className="px-3 py-1.5 text-txt-secondary text-sm">{ot[leftQuarterKey] ?? '-'}</td>
                          ))}
                          <td className={`px-3 py-1.5 pl-4 border-l border-surface-4 text-xl font-black ${leftData.isWinner ? 'text-white' : 'text-txt-muted'}`}>
                            {leftData.score}
                          </td>
                        </tr>
                        <tr>
                          <td className={`pr-3 py-1.5 text-left text-sm font-bold ${rightData.isWinner ? 'text-white' : 'text-txt-tertiary'}`}>{rightData.abbr}</td>
                          {['Q1', 'Q2', 'Q3', 'Q4'].map(q => (
                            <td key={q} className="px-3 py-1.5 text-txt-secondary text-sm">
                              {rightQuarters[q] === '' || rightQuarters[q] === null || rightQuarters[q] === undefined ? 0 : rightQuarters[q]}
                            </td>
                          ))}
                          {game.overtimes?.map((ot, i) => (
                            <td key={i} className="px-3 py-1.5 text-txt-secondary text-sm">{ot[rightQuarterKey] ?? '-'}</td>
                          ))}
                          <td className={`px-3 py-1.5 pl-4 border-l border-surface-4 text-xl font-black ${rightData.isWinner ? 'text-white' : 'text-txt-muted'}`}>
                            {rightData.score}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  )
                })()}
                <div className="text-center mt-2">
                  <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider" style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }}>
                    Final
                  </span>
                  {game.overtimes && game.overtimes.length > 0 && (
                    <span className="ml-2 text-amber-400 text-xs font-bold">
                      {game.overtimes.length > 1 ? `${game.overtimes.length}OT` : 'OT'}
                    </span>
                  )}
                </div>
              </div>

              {/* Right Team — mirrors the left cluster: collapsed to
                  content, score sits next to the team. */}
              <div className={`flex items-center gap-6 ${!rightData.isWinner ? 'opacity-75' : ''}`}>
                {/* Score with winner triangle */}
                <div className="flex items-center gap-2">
                  {rightData.isWinner && (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 5v14l7-7-7-7z" />
                    </svg>
                  )}
                  <div
                    className={`text-6xl font-black tabular-nums ${rightData.isWinner ? 'text-white' : 'text-txt-muted'}`}
                    style={rightData.isWinner ? { textShadow: '0 0 20px rgba(255,255,255,0.3)' } : {}}
                  >
                    {rightData.score}
                  </div>
                </div>
                <Link to={`${pathPrefix}/team/${resolveTid(rightData.abbr, currentDynasty?.teams || TEAMS)}/${game.year}`} className="group flex items-center gap-4">
                  <div className="text-right">
                    {rightData.rank && !isCFPGame && (
                      <div className="text-amber-400 text-xs font-bold">#{rightData.rank}</div>
                    )}
                    <div className="text-white font-bold text-lg group-hover:underline">{rightData.name}</div>
                    {rightData.record && (
                      <div className="text-txt-tertiary text-sm">{rightData.record}</div>
                    )}
                  </div>
                  <div className="relative flex-shrink-0">
                    <div
                      className="w-16 h-16 rounded-full flex items-center justify-center p-2  shadow-xl bg-white"
                      style={{
                        boxShadow: rightData.isWinner
                          ? `0 0 20px ${rightData.colors.primary}60, 0 4px 16px rgba(0,0,0,0.4)`
                          : '0 4px 16px rgba(0,0,0,0.4)'
                      }}
                    >
                      {rightData.logo && (
                        <img src={rightData.logo} alt={rightData.name} className="w-full h-full object-contain" />
                      )}
                    </div>
                    {isCFPGame && (rightTeam === 'user' ? userSeed : oppSeed) && (
                      <div className="absolute -top-1 -left-1 w-6 h-6 rounded-full bg-amber-500/90 flex items-center justify-center shadow-lg border-2 border-surface-1">
                        <span className="text-[10px] font-black text-txt-primary">{rightTeam === 'user' ? userSeed : oppSeed}</span>
                      </div>
                    )}
                  </div>
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Mobile/Tablet: Stacked layout (also shows for upcoming games on all screens) */}
        <div className={gameIsPlayed && hasQuarterScores ? 'lg:hidden' : ''}>
        {/* Hero Scoreboard Content */}
        <div className="px-1 py-3 sm:px-8 sm:py-8 md:py-10">
          <div className="flex items-center justify-between gap-1 sm:gap-6 md:gap-10 max-w-full">
            {/* Left Team */}
            <Link to={`${pathPrefix}/team/${resolveTid(leftData.abbr, currentDynasty?.teams || TEAMS)}/${game.year}`} className="group flex-1 min-w-0">
              <div className="flex flex-col items-center sm:flex-row sm:items-center gap-1 sm:gap-4">
                {/* Logo - larger for hero effect */}
                <div className="relative flex-shrink-0">
                  <div
                    className="w-10 h-10 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center p-1 sm:p-2.5  shadow-xl bg-white"
                    style={{
                      boxShadow: leftData.isWinner && gameIsPlayed
                        ? `0 0 30px ${leftData.colors.primary}60, 0 8px 32px rgba(0,0,0,0.4)`
                        : '0 8px 32px rgba(0,0,0,0.4)'
                    }}
                  >
                    {leftData.logo && (
                      <img src={leftData.logo} alt={leftData.name} className="w-full h-full object-contain" />
                    )}
                  </div>
                  {/* CFP Seed Badge */}
                  {isCFPGame && (leftTeam === 'user' ? userSeed : oppSeed) && (
                    <div className="absolute -top-0.5 -right-0.5 sm:-top-1 sm:-right-1 w-4 h-4 sm:w-7 sm:h-7 rounded-full bg-amber-500/90 flex items-center justify-center shadow-lg border sm:border-2 border-surface-1">
                      <span className="text-[8px] sm:text-xs font-black text-txt-primary">{leftTeam === 'user' ? userSeed : oppSeed}</span>
                    </div>
                  )}
                </div>
                <div className="text-center sm:text-left min-w-0">
                  {/* Rank badge */}
                  {leftData.rank && !isCFPGame && (
                    <div className="text-amber-400 text-[9px] sm:text-xs font-bold mb-0.5">#{leftData.rank}</div>
                  )}
                  <div className="text-white font-bold text-[8px] sm:text-xs md:text-sm lg:text-xl group-hover:underline leading-tight">
                    {leftData.name}
                  </div>
                  {leftData.record && (
                    <div className="text-txt-tertiary text-[9px] sm:text-xs mt-0.5">{leftData.record}</div>
                  )}
                </div>
              </div>
            </Link>

            {/* Scores - Center */}
            <div className="flex-shrink-0 px-1">
              {gameIsPlayed ? (
                <div className="flex items-center gap-1.5 sm:gap-6">
                  <div className="text-center">
                    <div
                      className={`text-2xl sm:text-5xl md:text-6xl font-black tabular-nums transition-all ${leftData.isWinner ? 'text-white' : 'text-txt-muted'}`}
                      style={leftData.isWinner ? { textShadow: '0 0 20px rgba(255,255,255,0.3)' } : {}}
                    >
                      {leftData.score}
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-0.5">
                    <div
                      className="px-1.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[8px] sm:text-xs font-bold uppercase tracking-wider"
                      style={{
                        backgroundColor: 'rgba(255,255,255,0.1)',
                        color: 'rgba(255,255,255,0.8)'
                      }}
                    >
                      Final
                    </div>
                    {game.overtimes && game.overtimes.length > 0 && (
                      <span className="text-amber-400 text-[8px] sm:text-xs font-bold">
                        {game.overtimes.length > 1 ? `${game.overtimes.length}OT` : 'OT'}
                      </span>
                    )}
                  </div>

                  <div className="text-center">
                    <div
                      className={`text-2xl sm:text-5xl md:text-6xl font-black tabular-nums transition-all ${rightData.isWinner ? 'text-white' : 'text-txt-muted'}`}
                      style={rightData.isWinner ? { textShadow: '0 0 20px rgba(255,255,255,0.3)' } : {}}
                    >
                      {rightData.score}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center py-2 sm:py-4">
                  <div className="px-2 py-1 sm:px-4 sm:py-2 rounded-full bg-yellow-500/20 border border-yellow-500/30">
                    <span className="text-xs sm:text-sm font-bold text-yellow-400">UPCOMING</span>
                  </div>
                </div>
              )}
            </div>

            {/* Right Team */}
            <Link to={`${pathPrefix}/team/${resolveTid(rightData.abbr, currentDynasty?.teams || TEAMS)}/${game.year}`} className="group flex-1 min-w-0">
              <div className="flex flex-col items-center sm:flex-row-reverse sm:items-center gap-1 sm:gap-4">
                {/* Logo - larger for hero effect */}
                <div className="relative flex-shrink-0">
                  <div
                    className="w-10 h-10 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center p-1 sm:p-2.5  shadow-xl bg-white"
                    style={{
                      boxShadow: rightData.isWinner && gameIsPlayed
                        ? `0 0 30px ${rightData.colors.primary}60, 0 8px 32px rgba(0,0,0,0.4)`
                        : '0 8px 32px rgba(0,0,0,0.4)'
                    }}
                  >
                    {rightData.logo && (
                      <img src={rightData.logo} alt={rightData.name} className="w-full h-full object-contain" />
                    )}
                  </div>
                  {/* CFP Seed Badge */}
                  {isCFPGame && (rightTeam === 'user' ? userSeed : oppSeed) && (
                    <div className="absolute -top-0.5 -left-0.5 sm:-top-1 sm:-left-1 w-4 h-4 sm:w-7 sm:h-7 rounded-full bg-amber-500/90 flex items-center justify-center shadow-lg border sm:border-2 border-surface-1">
                      <span className="text-[8px] sm:text-xs font-black text-txt-primary">{rightTeam === 'user' ? userSeed : oppSeed}</span>
                    </div>
                  )}
                </div>
                <div className="text-center sm:text-right min-w-0">
                  {/* Rank badge */}
                  {rightData.rank && !isCFPGame && (
                    <div className="text-amber-400 text-[9px] sm:text-xs font-bold mb-0.5">#{rightData.rank}</div>
                  )}
                  <div className="text-white font-bold text-[8px] sm:text-xs md:text-sm lg:text-xl group-hover:underline leading-tight">
                    {rightData.name}
                  </div>
                  {rightData.record && (
                    <div className="text-txt-tertiary text-[9px] sm:text-xs mt-0.5">{rightData.record}</div>
                  )}
                </div>
              </div>
            </Link>
          </div>

        </div>
        </div>
      </div>

      {/* Scoring Summary - Dark theme continuation (hidden on desktop when integrated).
          Surface matches the hero card above and the tabs card below
          (bg-surface-1) so the table doesn't read as a brighter slab. */}
      {hasQuarterScores && (
        <div className="lg:hidden bg-surface-1 rounded-xl overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-[10px] sm:text-xs text-txt-tertiary uppercase tracking-wider border-b border-surface-4">
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
                  // Support both new format (team1/team2) and legacy format (team/opponent)
                  const isNewFormat = game.quarters.team1 || game.quarters.team2
                  // Match by tid when both sides are available — abbrs can
                  // collide between teambuilder teams and real FBS teams.
                  // Fall back to abbr only when one side has no tid.
                  const isLeftTeam1 = leftData.tid != null && game.team1Tid != null
                    ? Number(leftData.tid) === Number(game.team1Tid)
                    : leftData.abbr === (game.team1Tid ? (currentDynasty?.teams?.[game.team1Tid]?.abbr || TEAMS[game.team1Tid]?.abbr) : game.team1)
                  const quarterKey = isNewFormat
                    ? (idx === 0 ? (isLeftTeam1 ? 'team1' : 'team2') : (isLeftTeam1 ? 'team2' : 'team1'))
                    : ((idx === 0 ? leftTeam : rightTeam) === 'user' ? 'team' : 'opponent')
                  return (
                    <tr key={idx} className={idx === 0 ? 'border-b border-surface-4' : ''}>
                      <td className="py-3 px-3 sm:px-4">
                        <Link to={`${pathPrefix}/team/${resolveTid(team.abbr, currentDynasty?.teams || TEAMS)}/${game.year}`} className="group">
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div
                              className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center p-1 flex-shrink-0 bg-white "
                            >
                              {team.logo && <img src={team.logo} alt="" className="w-full h-full object-contain" />}
                            </div>
                            <span className={`font-bold group-hover:underline ${team.isWinner ? 'text-white' : 'text-txt-tertiary'}`}>
                              <span className="sm:hidden">{team.abbr}</span>
                              <span className="hidden sm:inline">{team.name}</span>
                            </span>
                          </div>
                        </Link>
                      </td>
                      {['Q1', 'Q2', 'Q3', 'Q4'].map(q => {
                        const val = game.quarters[quarterKey]?.[q]
                        return (
                          <td key={q} className="text-center py-3 px-2 sm:px-3 text-txt-secondary font-medium">
                            {val === '' || val === null || val === undefined ? 0 : val}
                          </td>
                        )
                      })}
                      {game.overtimes?.map((ot, i) => (
                        <td key={i} className="text-center py-3 px-2 sm:px-3 text-txt-secondary font-medium">{ot[quarterKey] ?? '-'}</td>
                      ))}
                      <td className={`text-center py-3 px-3 sm:px-4 font-black text-lg sm:text-xl ${team.isWinner ? 'text-white' : 'text-txt-muted'}`}>
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

      {/* ESPN-Style Tab Navigation and Content */}
      {gameIsPlayed && (
        <div className="bg-surface-1 rounded-xl overflow-hidden shadow-lg">
          {/* Tab Bar - always fits screen width */}
          {(() => {
            // Check if box score has any actual player data
            const hasBoxScoreData = game.boxScore && (
              game.boxScore.home && STAT_TAB_ORDER.some(key => game.boxScore.home[key]?.length > 0) ||
              game.boxScore.away && STAT_TAB_ORDER.some(key => game.boxScore.away[key]?.length > 0)
            )
            // Check if recap exists or can be generated
            const hasRecapOrCanGenerate = game.aiRecap || !isViewOnly

            return (
          <div className="flex items-stretch border-b border-surface-4">
            <div className="flex flex-1 min-w-0 overflow-x-auto">
              {[
                { key: 'gamecast', label: 'Gamecast', shortLabel: 'Cast', show: true },
                { key: 'boxscore', label: 'Box Score', shortLabel: 'Box', show: hasBoxScoreData },
                { key: 'scoring', label: 'Scoring', shortLabel: 'Plays', show: game.boxScore?.scoringSummary?.length > 0 },
                { key: 'recap', label: 'Recap', shortLabel: 'Recap', show: hasRecapOrCanGenerate },
                { key: 'stats', label: 'Team Stats', shortLabel: 'Stats', show: game.boxScore?.teamStats && (game.boxScore.teamStats.home || game.boxScore.teamStats.away) },
                { key: 'ratings', label: 'Ratings', shortLabel: 'Rtg', show: !isCPUGame && (game.team1Overall || game.team1Offense || game.team1Defense || game.team2Overall || game.opponentOverall) },
                { key: 'awards', label: 'Awards', shortLabel: 'Awards', show: !isCPUGame && (game.conferencePOW || game.confDefensePOW || game.nationalPOW || game.natlDefensePOW) },
              ].filter(tab => tab.show).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 sm:flex-none px-1 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium transition-colors ${
                    activeTab === tab.key
                      ? 'text-txt-primary border-b-2 border-white bg-surface-2'
                      : 'text-txt-tertiary hover:text-txt-primary hover:bg-surface-2/50'
                  }`}
                >
                  <span className="sm:hidden">{tab.shortLabel}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </div>
            {/* Quiet per-device default-tab preference, aligned to the tab bar */}
            <div className="hidden md:flex items-center gap-1.5 pr-3 pl-2 text-[11px] text-txt-muted whitespace-nowrap">
              <label htmlFor="default-game-tab" className="tracking-wide uppercase">Default</label>
              <select
                id="default-game-tab"
                value={defaultTabPref}
                onChange={(e) => persistDefaultTabPref(e.target.value)}
                title="Default tab for this device"
                className="bg-transparent border border-surface-4 rounded px-1.5 py-0.5 text-[11px] text-txt-secondary hover:text-txt-primary hover:border-surface-5 focus:outline-none focus:border-blue-500 transition-colors"
              >
                <option value="auto">Auto</option>
                <option value="gamecast">Gamecast</option>
                <option value="boxscore">Box Score</option>
                <option value="scoring">Scoring</option>
                <option value="stats">Team Stats</option>
                <option value="recap">Recap</option>
                <option value="ratings">Ratings</option>
                <option value="awards">Awards</option>
              </select>
            </div>
          </div>
            )
          })()}

          {/* Gamecast Tab — leaders · recap · ratings+awards, ESPN-style */}
          {activeTab === 'gamecast' && (() => {
            // ---- Game leaders: top producer per category on each side ----
            const n = (v) => Number(v) || 0
            const getYards = (p) => n(p.yards ?? p.yds)
            const getTackles = (p) => n(p.solo) + n(p.assists) + n(p.tackles)
            const topBy = (rows, scorer) => {
              if (!rows || !rows.length) return null
              let best = null
              let bestScore = -Infinity
              for (const r of rows) {
                const s = scorer(r)
                if (s > bestScore) { best = r; bestScore = s }
              }
              return bestScore > 0 ? best : null
            }
            const fmtPassing = (p) => {
              if (!p) return null
              const cmp = n(p.comp ?? p.cmp)
              const att = n(p.attempts ?? p.att)
              const yds = n(p.yards ?? p.yds)
              const td = n(p.tD ?? p.td)
              const int = n(p.iNT ?? p.int)
              return `${cmp}/${att}, ${yds} yds${td ? `, ${td} TD` : ''}${int ? `, ${int} INT` : ''}`
            }
            const fmtRushing = (p) => {
              if (!p) return null
              const car = n(p.carries ?? p.car)
              const yds = n(p.yards ?? p.yds)
              const td = n(p.tD ?? p.td)
              return `${car} car, ${yds} yds${td ? `, ${td} TD` : ''}`
            }
            const fmtReceiving = (p) => {
              if (!p) return null
              const rec = n(p.receptions ?? p.rec)
              const yds = n(p.yards ?? p.yds)
              const td = n(p.tD ?? p.td)
              return `${rec} rec, ${yds} yds${td ? `, ${td} TD` : ''}`
            }
            const fmtDefense = (p) => {
              if (!p) return null
              const tkl = getTackles(p)
              const sack = n(p.sack)
              const int = n(p.iNT ?? p.int)
              const tfl = n(p.tFL ?? p.tfl)
              const parts = []
              if (tkl) parts.push(`${tkl} tkl`)
              if (tfl) parts.push(`${tfl} TFL`)
              if (sack) parts.push(`${sack} sck`)
              if (int) parts.push(`${int} INT`)
              return parts.join(', ') || null
            }
            const homeBs = game.boxScore?.home
            const awayBs = game.boxScore?.away
            const categories = [
              { key: 'passing',   label: 'Passing',   score: getYards,   fmt: fmtPassing },
              { key: 'rushing',   label: 'Rushing',   score: getYards,   fmt: fmtRushing },
              { key: 'receiving', label: 'Receiving', score: getYards,   fmt: fmtReceiving },
              { key: 'defense',   label: 'Defense',   score: getTackles, fmt: fmtDefense },
            ]
            const hasBoxForLeaders = !!(homeBs || awayBs)

            const LeaderRow = ({ player, statLine, teamData }) => {
              const pid = getPlayerPID(player)
              const content = (
                <>
                  <div className="w-7 h-7 rounded-md flex-shrink-0 flex items-center justify-center bg-surface-3/80 p-1 ring-1 ring-surface-4/70">
                    {teamData?.logo && <img src={teamData.logo} alt="" className="w-full h-full object-contain" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-txt-primary truncate leading-tight">{player}</div>
                    <div className="text-[12px] text-txt-secondary truncate tabular-nums leading-snug mt-0.5">{statLine}</div>
                  </div>
                </>
              )
              return pid ? (
                <Link
                  to={`${pathPrefix}/player/${pid}`}
                  className="flex items-center gap-2.5 min-w-0 py-1 -mx-1 px-1 rounded-md hover:bg-surface-2/60 transition-colors"
                >
                  {content}
                </Link>
              ) : (
                <div className="flex items-center gap-2.5 min-w-0 py-1">{content}</div>
              )
            }

            // Unified section heading — same hierarchy in all three columns
            const SectionHead = ({ children, actions }) => (
              <div className="flex items-center gap-3 pb-2.5 mb-3 border-b border-surface-3/60">
                <h3 className="flex-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-txt-muted">
                  {children}
                </h3>
                {actions}
              </div>
            )

            // Display-only recap. Editing lives in the game editor.
            const canEditInEditor = !isViewOnly && !!gameId
            const editorHref = canEditInEditor ? `${pathPrefix}/game/${gameId}/edit` : null
            const RecapCenter = () => {
              if (game.aiRecap) {
                return (
                  <FormattedRecap
                    text={game.aiRecap}
                    className="text-txt-secondary text-sm leading-relaxed"
                    playerLinks={recapPlayerLinks}
                  />
                )
              }
              return (
                <div className="py-6">
                  <p className="text-[13px] leading-relaxed text-txt-secondary max-w-md">
                    No recap yet for this game.
                    {editorHref && (
                      <>
                        {' '}
                        <Link to={editorHref} className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
                          Add one in the game editor
                        </Link>.
                      </>
                    )}
                  </p>
                </div>
              )
            }

            // ---- Ratings block (compact) ----
            const userTid = game.userTid || resolveTid(displayTeamAbbr, currentDynasty?.teams || TEAMS)
            const storedUserRatings = getTeamRatingsForYear(currentDynasty, userTid, game.year)
            const userRatings = {
              ovr: game.team1Overall ?? storedUserRatings?.overall,
              off: game.team1Offense ?? storedUserRatings?.offense,
              def: game.team1Defense ?? storedUserRatings?.defense,
            }
            const oppRatings = {
              ovr: game.team2Overall ?? game.opponentOverall,
              off: game.team2Offense ?? game.opponentOffense,
              def: game.team2Defense ?? game.opponentDefense,
            }
            const leftIsOpp = leftTeam !== 'user'
            const leftRatings = leftIsOpp ? oppRatings : userRatings
            const rightRatings = !leftIsOpp ? oppRatings : userRatings
            const hasAnyRatings = (rr) => rr.ovr || rr.off || rr.def
            const hasRatings = !isCPUGame && (hasAnyRatings(userRatings) || hasAnyRatings(oppRatings))

            const hasAwards = !isCPUGame && (game.conferencePOW || game.confDefensePOW || game.nationalPOW || game.natlDefensePOW)

            const awardRows = [
              game.conferencePOW && { scope: 'Conference', side: 'Offense', name: game.conferencePOW, national: false },
              game.confDefensePOW && { scope: 'Conference', side: 'Defense', name: game.confDefensePOW, national: false },
              game.nationalPOW && { scope: 'National', side: 'Offense', name: game.nationalPOW, national: true },
              game.natlDefensePOW && { scope: 'National', side: 'Defense', name: game.natlDefensePOW, national: true },
            ].filter(Boolean)

            // Three-column gamecast at lg+. The middle Recap column used
            // to be the only `1fr` track while the sides held their full
            // 300/340px until the middle was squeezed to almost nothing
            // on viewports between lg and xl. Flipped the priority:
            // sides have a 180-280px / 220-320px range and shrink first;
            // the middle has a 360px floor and fills any remaining
            // space. Keeps the recap readable on a 1280px screen with
            // devtools open.
            return (
              <div className="px-5 py-6 sm:px-6 sm:py-7 grid grid-cols-1 lg:grid-cols-[minmax(180px,280px)_minmax(360px,1fr)_minmax(220px,320px)] gap-y-8 lg:gap-x-8 xl:gap-x-12">
                {/* LEFT: Game Leaders — one unified panel, category rows inside */}
                <aside className="order-2 lg:order-1 min-w-0">
                  <SectionHead>Game Leaders</SectionHead>
                  {!hasBoxForLeaders ? (
                    <p className="text-xs text-txt-muted">Box score not entered.</p>
                  ) : (
                    <div>
                      {categories.map((cat, catIdx) => {
                        const homeTop = topBy(homeBs?.[cat.key], cat.score)
                        const awayTop = topBy(awayBs?.[cat.key], cat.score)
                        const homeLine = homeTop && cat.fmt(homeTop)
                        const awayLine = awayTop && cat.fmt(awayTop)
                        if (!homeLine && !awayLine) return null
                        return (
                          <div
                            key={cat.key}
                            className={`py-3 ${catIdx > 0 ? 'border-t border-surface-3/40' : ''}`}
                          >
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-txt-muted mb-2">
                              {cat.label}
                            </div>
                            <div className="space-y-1.5">
                              {homeLine && (
                                <LeaderRow player={homeTop.playerName} statLine={homeLine} teamData={boxScoreHomeTeamData} />
                              )}
                              {awayLine && (
                                <LeaderRow player={awayTop.playerName} statLine={awayLine} teamData={boxScoreAwayTeamData} />
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </aside>

                {/* CENTER: Recap — display only. Edit via the game editor.
                    Long recaps scroll within the panel so they don't blow
                    out the page height. */}
                <section className="order-1 lg:order-2 min-w-0">
                  <SectionHead>Game Recap</SectionHead>
                  <div
                    className="max-w-prose mx-auto overflow-y-auto pr-2 -mr-2"
                    style={{ maxHeight: 'min(70vh, 720px)' }}
                  >
                    <RecapCenter />
                  </div>
                </section>

                {/* RIGHT: Scoring · Ratings · Awards — sibling sections with shared rhythm */}
                <aside className="order-3 min-w-0 space-y-7">
                  {(() => {
                    const playsWithVideo = sortPlaysChronologically(game.boxScore?.scoringSummary)
                      .map(p => ({ ...p, gameInfo: { ...(p.gameInfo || {}), gameId } }))
                      .filter(p => p.videoLink)
                    if (!playsWithVideo.length) return null
                    return (
                      <div>
                        <SectionHead>Scoring</SectionHead>
                        <InlineScoringHighlights
                          scoringPlays={playsWithVideo}
                          team1Abbr={leftData?.abbr}
                          team2Abbr={rightData?.abbr}
                          onExpand={(idx) => {
                            setHighlightsStartIndex(idx)
                            setShowHighlightsModal(true)
                          }}
                        />
                      </div>
                    )
                  })()}

                  {hasRatings && (
                    <div>
                      <SectionHead>Team Ratings</SectionHead>
                      <div className="space-y-2">
                        {[[leftData, leftRatings], [rightData, rightRatings]].map(([team, ratings], idx) => {
                          if (!hasAnyRatings(ratings)) return null
                          const other = idx === 0 ? rightRatings : leftRatings
                          const better = (key) => (ratings[key] || 0) > (other[key] || 0)
                          const cell = (label, val, key) => val == null ? null : (
                            <div className="flex flex-col items-start min-w-0">
                              <span className="text-[9px] uppercase tracking-[0.18em] text-txt-muted">{label}</span>
                              <span className={`text-base tabular-nums leading-none mt-1 text-txt-primary ${better(key) ? 'font-bold' : 'font-medium'}`}>
                                {val}
                              </span>
                            </div>
                          )
                          return (
                            <Link
                              key={idx}
                              to={`${pathPrefix}/team/${resolveTid(team.abbr, currentDynasty?.teams || TEAMS)}/${game.year}`}
                              className="group flex items-center gap-3 rounded-lg py-2 pl-2 pr-3 hover:bg-surface-2/70 transition-colors"
                            >
                              <div className="w-9 h-9 rounded-md flex items-center justify-center p-1 bg-surface-3/80 ring-1 ring-surface-4/70 flex-shrink-0">
                                {team.logo && <img src={team.logo} alt="" className="w-full h-full object-contain" />}
                              </div>
                              <div className="flex-1 min-w-0 flex items-center gap-4">
                                <div className="flex-1 min-w-0 text-[13px] font-semibold text-txt-primary truncate group-hover:underline">
                                  {team.name}
                                </div>
                                <div className="flex items-center gap-3 flex-shrink-0">
                                  {cell('OVR', ratings.ovr, 'ovr')}
                                  {cell('OFF', ratings.off, 'off')}
                                  {cell('DEF', ratings.def, 'def')}
                                </div>
                              </div>
                            </Link>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {awardRows.length > 0 && (
                    <div>
                      <SectionHead>Players of the Week</SectionHead>
                      <ul className="divide-y divide-surface-3/40">
                        {awardRows.map((a, i) => {
                          const pid = getPlayerPID(a.name)
                          const label = (
                            <>
                              <div className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${a.national ? 'text-amber-400' : 'text-txt-muted'}`}>
                                {a.scope} · {a.side}
                              </div>
                              <div className="text-[13px] font-semibold text-txt-primary truncate mt-0.5">
                                {a.name}
                              </div>
                            </>
                          )
                          return (
                            <li key={i} className="first:pt-0 last:pb-0">
                              {pid ? (
                                <Link
                                  to={`${pathPrefix}/player/${pid}`}
                                  className="block py-2.5 -mx-1 px-1 rounded-md hover:bg-surface-2/60 transition-colors"
                                >
                                  {label}
                                </Link>
                              ) : (
                                <div className="py-2.5">{label}</div>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )}

                  {!hasRatings && awardRows.length === 0 && (
                    <p className="text-xs text-txt-muted">No ratings or awards data for this game.</p>
                  )}
                </aside>
              </div>
            )
          })()}

          {/* Scoring Plays Tab */}
          {activeTab === 'scoring' && game.boxScore?.scoringSummary?.length > 0 && (() => {
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

            // Sort plays chronologically (Q1 → OT, time-left descending within a quarter)
            // so running scores accumulate in real game order — and the videoIndex
            // passed to ScoringHighlightsModal matches the modal's own ordering.
            const chronoPlays = sortPlaysChronologically(game.boxScore.scoringSummary)

            // Tid-based "is this play on the left side?" check. Each play's
            // team is stored as an abbr; we resolve via the game's two team
            // tids (and current registry abbrs) and compare tids instead of
            // strings — survives teambuilder abbr drift. Falls back to abbr
            // compare for legacy games missing a tid.
            const lTid = leftData.tid != null ? Number(leftData.tid) : null
            const rTid = rightData.tid != null ? Number(rightData.tid) : null
            const lAbbrU = leftData.abbr?.toUpperCase()
            const rAbbrU = rightData.abbr?.toUpperCase()
            const isPlayOnLeftSide = (play) => {
              const playU = play.team?.toUpperCase()
              if (lTid != null && rTid != null && lAbbrU && rAbbrU) {
                const playTid = playU === lAbbrU ? lTid : (playU === rAbbrU ? rTid : null)
                if (playTid != null) return playTid === lTid
              }
              return playU === lAbbrU
            }

            // Resolve a play's team to current-registry data (abbr, logo, colors).
            // play.team is the abbr stored at game time; if a teambuilder team
            // was renamed since, that stale abbr won't resolve via the registry
            // helpers. Map play.team → tid via the game's two teams, then look
            // up by tid for stable colors / logos.
            const resolvePlayTeamData = (play) => {
              const playU = play.team?.toUpperCase()
              const tid = playU === lAbbrU ? lTid : playU === rAbbrU ? rTid : null
              const sideData = tid === lTid ? leftData : tid === rTid ? rightData : null
              return {
                abbr: sideData?.abbr || play.team,
                logo: sideData?.logo || null,
                colors: sideData?.colors || null,
                name: sideData?.name || null,
              }
            }

            // Calculate running scores
            let leftRunning = 0
            let rightRunning = 0
            const playsWithScores = chronoPlays.map((play) => {
              const points = getPlayPoints(play)
              if (isPlayOnLeftSide(play)) {
                leftRunning += points
              } else {
                rightRunning += points
              }
              return { ...play, runningLeftScore: leftRunning, runningRightScore: rightRunning }
            })

            const hasVideoLinks = playsWithScores.some(p => p.videoLink)

            return (
              <div>
                {/* Watch All Scores button - only show if there are video links */}
                {hasVideoLinks && (
                  <div className="px-4 py-3 border-b border-surface-3/50">
                    <button
                      onClick={() => {
                        setHighlightsStartIndex(0)
                        setShowHighlightsModal(true)
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      Watch All Scores
                    </button>
                  </div>
                )}
                <div className="divide-y divide-surface-3/50">
                {playsWithScores.map((play, idx) => {
                  const resolvedPlayTeam = resolvePlayTeamData(play)
                  const playTeamColors = resolvedPlayTeam.colors
                    || getTeamColorsRobust(resolvedPlayTeam.abbr)
                    || { primary: '#666', secondary: '#333' }
                  const scorerPID = getPlayerPID(play.scorer)
                  const passerPID = play.passer ? getPlayerPID(play.passer) : null
                  const isLeftTeam = isPlayOnLeftSide(play)
                  return (
                    <div key={idx} className="flex items-stretch">
                      {/* Team color bar on left */}
                      <div
                        className="w-1 flex-shrink-0"
                        style={{ backgroundColor: playTeamColors.primary }}
                      />
                      {/* Main content with team-colored background */}
                      <div
                        className="flex-1 flex items-center gap-2 sm:gap-3 px-3 py-2.5 sm:py-3"
                        style={{
                          background: `linear-gradient(90deg, ${playTeamColors.primary}20 0%, ${playTeamColors.primary}05 50%, transparent 100%)`
                        }}
                      >
                        {/* Quarter and time */}
                        <div className="text-center flex-shrink-0 w-10 sm:w-12">
                          <div
                            className="text-[10px] sm:text-xs font-bold px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: playTeamColors.primary + '40', color: 'white' }}
                          >
                            {['1', '2', '3', '4', 1, 2, 3, 4].includes(play.quarter) ? `Q${play.quarter}` : 'OT'}
                          </div>
                          <div className="text-txt-muted text-[10px] sm:text-xs mt-0.5 font-mono">{play.timeLeft}</div>
                        </div>
                        {/* Running Score */}
                        <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0 min-w-[50px] sm:min-w-[60px] justify-center">
                          <span className={`text-sm sm:text-base font-bold tabular-nums ${isLeftTeam ? 'text-white' : 'text-txt-muted'}`}>
                            {play.runningLeftScore}
                          </span>
                          <span className="text-txt-tertiary text-xs">-</span>
                          <span className={`text-sm sm:text-base font-bold tabular-nums ${!isLeftTeam ? 'text-white' : 'text-txt-muted'}`}>
                            {play.runningRightScore}
                          </span>
                        </div>
                        {/* Team logo — uses tid-resolved registry data so a
                            renamed teambuilder team's logo still renders. */}
                        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-surface-2/50 p-1">
                          <img
                            src={resolvedPlayTeam.logo
                              || getTeamLogo(getMascotName(resolvedPlayTeam.abbr, currentDynasty?.teams || currentDynasty?.customTeams) || resolvedPlayTeam.abbr)}
                            alt={resolvedPlayTeam.abbr}
                            className="w-full h-full object-contain"
                          />
                        </div>
                        {/* Play details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                            <span className="text-txt-secondary text-xs sm:text-sm">
                              {is2PTAttempt(play) ? '2PT Conversion' : play.scoreType}
                              {play.yards && <span className="text-txt-muted"> ({play.yards} yds)</span>}
                            </span>
                            {play.patResult && !is2PTAttempt(play) && (
                              <span className={`text-[10px] sm:text-xs px-1.5 py-0.5 rounded ${
                                play.patResult.includes('Made') || play.patResult.includes('Converted')
                                  ? 'bg-green-500/20 text-green-400'
                                  : 'bg-red-500/20 text-red-400'
                              }`}>
                                {play.patResult}
                              </span>
                            )}
                            {is2PTAttempt(play) && (
                              <span className={`text-[10px] sm:text-xs px-1.5 py-0.5 rounded ${
                                is2PTConverted(play)
                                  ? 'bg-green-500/20 text-green-400'
                                  : 'bg-red-500/20 text-red-400'
                              }`}>
                                {is2PTConverted(play) ? 'Good' : 'Failed'}
                              </span>
                            )}
                          </div>
                          <div className="text-txt-tertiary text-[10px] sm:text-xs mt-0.5 truncate">
                            {is2PTAttempt(play) ? (
                              <span>{is2PTConverted(play) ? 'Successful conversion' : 'Conversion failed'}</span>
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
                              </>
                            )}
                          </div>
                        </div>
                        {/* Video Link Button */}
                        {play.videoLink && (
                          <button
                            onClick={() => {
                              // Find this play's index in the filtered list (only plays with videoLinks)
                              const playsWithVideoLinks = playsWithScores.filter(p => p.videoLink)
                              const videoIndex = playsWithVideoLinks.findIndex(p => p === play)
                              setHighlightsStartIndex(videoIndex >= 0 ? videoIndex : 0)
                              setShowHighlightsModal(true)
                            }}
                            className="flex-shrink-0 p-1.5 sm:p-2 rounded-lg hover:bg-white/10 transition-colors"
                            title="Watch video clip"
                          >
                            <svg className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400 hover:text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
                </div>
              </div>
            )
          })()}

          {/* Game Recap Tab — display only. Editing and prompt copying live in
              the game editor so the viewing surface stays clean. */}
          {activeTab === 'recap' && (
            <div className="px-4 py-6 sm:px-6 sm:py-8">
              {game.aiRecap ? (
                <FormattedRecap
                  text={game.aiRecap}
                  className="text-txt-secondary text-[15px] leading-relaxed max-w-3xl mx-auto"
                  playerLinks={recapPlayerLinks}
                />
              ) : (
                <p className="text-sm text-txt-secondary max-w-3xl mx-auto">
                  No recap yet for this game.
                  {!isViewOnly && gameId && (
                    <>
                      {' '}
                      <Link
                        to={`${pathPrefix}/game/${gameId}/edit`}
                        className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
                      >
                        Add one in the game editor
                      </Link>.
                    </>
                  )}
                </p>
              )}
            </div>
          )}

          {/* Box Score Tab - Team tabs on mobile, side-by-side on desktop */}
          {activeTab === 'boxscore' && game.boxScore && (() => {
            // Get team data for box score
            const leftData_bs = boxScoreHomeIsUser ? (leftTeam === 'user' ? game.boxScore.home : game.boxScore.away) : (leftTeam === 'user' ? game.boxScore.away : game.boxScore.home)
            const rightData_bs = boxScoreHomeIsUser ? (leftTeam === 'user' ? game.boxScore.away : game.boxScore.home) : (leftTeam === 'user' ? game.boxScore.home : game.boxScore.away)
            const leftTeamData_bs = boxScoreHomeIsUser ? (leftTeam === 'user' ? boxScoreHomeTeamData : boxScoreAwayTeamData) : (leftTeam === 'user' ? boxScoreAwayTeamData : boxScoreHomeTeamData)
            const rightTeamData_bs = boxScoreHomeIsUser ? (leftTeam === 'user' ? boxScoreAwayTeamData : boxScoreHomeTeamData) : (leftTeam === 'user' ? boxScoreHomeTeamData : boxScoreAwayTeamData)

            // Helper to render a team's stat table for a specific stat category
            const renderTeamStatTable = (teamData, teamInfo, statKey, showTeamHeader = true) => {
              const tab = STAT_TABS[statKey]
              if (!teamData?.[statKey]?.length) {
                return (
                  <div className="py-2 px-2">
                    {showTeamHeader && (
                      <div className="text-txt-tertiary text-sm font-medium mb-2">{tab.title}</div>
                    )}
                    <div className="text-txt-muted text-sm py-2">No {tab.title.toLowerCase()} stats</div>
                  </div>
                )
              }

              return (
                <div className="py-2">
                  {showTeamHeader && (
                    <div className="text-txt-tertiary text-sm font-medium mb-2 px-2">{tab.title}</div>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-txt-tertiary text-left border-b border-surface-4">
                          {getDisplayHeaders(statKey).map((header, idx) => (
                            <th
                              key={idx}
                              className={`py-2 px-2 font-medium whitespace-nowrap text-xs ${idx === 0 ? 'text-left' : 'text-center'}`}
                            >
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {teamData[statKey].map((row, rowIdx) => {
                          const values = getDisplayHeaders(statKey).map((header, colIdx) => {
                            // Handle special combined/renamed columns
                            if (header === 'C/Att') {
                              const comp = row.comp ?? 0
                              // Support both sheet format (att) and random generator format (attempts)
                              const att = row.att ?? row.attempts ?? 0
                              return { value: `${comp}/${att}`, isName: false }
                            }
                            if (header === 'Rtg') {
                              // Support both sheet format (rtg) and random generator format (qBRating)
                              const rating = row.rtg ?? row.qBRating
                              const value = (rating === '' || rating === null || rating === undefined) ? 0 : Number(rating).toFixed(1)
                              return { value, isName: false }
                            }

                            // Map abbreviated headers to their data keys
                            const headerKeyMap = { 'BT': 'brokenTackles' }
                            const key = colIdx === 0 ? 'playerName' : (headerKeyMap[header] || header.replace(/\s+/g, '').replace(/^./, c => c.toLowerCase()))
                            let rawValue = row[key]
                            if (statKey === 'defense' && key === 'total') {
                              rawValue = (parseFloat(row.solo) || 0) + (parseFloat(row.assists) || 0)
                            }
                            let value = colIdx === 0
                              ? (rawValue ?? '-')
                              : (rawValue === '' || rawValue === null || rawValue === undefined ? 0 : rawValue)
                            if (key === 'qBRating' && value !== 0 && value !== '') {
                              value = Number(value).toFixed(1)
                            }
                            return { value, isName: colIdx === 0 }
                          })
                          const playerPID = getPlayerPID(values[0].value)

                          return (
                            <tr key={rowIdx} className="border-b border-surface-3/50 hover:bg-surface-2/30">
                              {values.map((cell, colIdx) => (
                                <td
                                  key={colIdx}
                                  className={`py-1.5 px-2 whitespace-nowrap ${colIdx === 0 ? 'text-left' : 'text-center text-txt-secondary'}`}
                                >
                                  {colIdx === 0 && playerPID ? (
                                    <Link to={`${pathPrefix}/player/${playerPID}`} className="text-white hover:underline hover:text-blue-300">
                                      {cell.value}
                                    </Link>
                                  ) : colIdx === 0 ? (
                                    <span className="text-white">{cell.value}</span>
                                  ) : cell.value}
                                </td>
                              ))}
                            </tr>
                          )
                        })}
                        {/* Totals Row */}
                        <tr className="border-t border-surface-4 bg-surface-2/50 font-semibold">
                          {getDisplayHeaders(statKey).map((header, colIdx) => {
                            if (colIdx === 0) {
                              return (
                                <td key={colIdx} className="py-2 px-2 text-left text-white text-xs uppercase">
                                  Total
                                </td>
                              )
                            }

                            // Handle Long columns - show max value
                            if (header === 'Long' || header === 'FG Long') {
                              const key = header === 'FG Long' ? 'fGLong' : 'long'
                              const longValues = teamData[statKey].map(row => parseFloat(row[key]) || 0)
                              const maxLong = longValues.length > 0 ? Math.max(...longValues) : 0
                              return <td key={colIdx} className="py-2 px-2 text-center text-white">{maxLong || 0}</td>
                            }

                            // Handle QBR - weighted average based on attempts
                            if (header === 'Rtg') {
                              // Support both sheet format (att/rtg) and random generator format (attempts/qBRating)
                              const totalAttempts = teamData[statKey].reduce((sum, row) => sum + (parseFloat(row.att ?? row.attempts) || 0), 0)
                              if (totalAttempts === 0) {
                                return <td key={colIdx} className="py-2 px-2 text-center text-white">0.0</td>
                              }
                              const weightedRtg = teamData[statKey].reduce((sum, row) => {
                                const attempts = parseFloat(row.att ?? row.attempts) || 0
                                const rating = parseFloat(row.rtg ?? row.qBRating) || 0
                                return sum + (attempts / totalAttempts) * rating
                              }, 0)
                              return <td key={colIdx} className="py-2 px-2 text-center text-white">{weightedRtg.toFixed(1)}</td>
                            }

                            // Handle C/Att specially
                            if (header === 'C/Att') {
                              const totalComp = teamData[statKey].reduce((sum, row) => sum + (parseFloat(row.comp) || 0), 0)
                              // Support both sheet format (att) and random generator format (attempts)
                              const totalAtt = teamData[statKey].reduce((sum, row) => sum + (parseFloat(row.att ?? row.attempts) || 0), 0)
                              return <td key={colIdx} className="py-2 px-2 text-center text-white">{totalComp}/{totalAtt}</td>
                            }

                            // Sum numeric columns
                            const headerKeyMap = { 'BT': 'brokenTackles' }
                            const key = headerKeyMap[header] || header.replace(/\s+/g, '').replace(/^./, c => c.toLowerCase())
                            let total = teamData[statKey].reduce((sum, row) => {
                              let val = row[key]
                              // Handle defense total specially
                              if (statKey === 'defense' && key === 'total') {
                                val = (parseFloat(row.solo) || 0) + (parseFloat(row.assists) || 0)
                              }
                              return sum + (parseFloat(val) || 0)
                            }, 0)

                            return (
                              <td key={colIdx} className="py-2 px-2 text-center text-white">
                                {Number.isInteger(total) ? total : total.toFixed(1)}
                              </td>
                            )
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            }

            return (
              <div>
                {/* Mobile: Team tabs */}
                <div className="lg:hidden border-b border-surface-4">
                  <div className="flex">
                    {[
                      { key: 'left', teamData: leftTeamData_bs },
                      { key: 'right', teamData: rightTeamData_bs }
                    ].map(({ key, teamData }) => (
                      <button
                        key={key}
                        onClick={() => setBoxScoreTeamTab(key)}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 text-xs sm:text-sm font-medium transition-colors min-w-0 ${
                          boxScoreTeamTab === key
                            ? 'text-white border-b-2 border-white bg-surface-2'
                            : 'text-txt-tertiary hover:text-white hover:bg-surface-2/50'
                        }`}
                      >
                        <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-white flex items-center justify-center flex-shrink-0 p-0.5">
                          <img
                            src={getTeamLogo(getMascotName(teamData.abbr, currentDynasty?.teams || currentDynasty?.customTeams) || teamData.abbr)}
                            alt={teamData.name}
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <span className="truncate">{teamData.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mobile: Show selected team's stats */}
                <div className="lg:hidden divide-y divide-surface-4">
                  {STAT_TAB_ORDER.map(statKey => {
                    const teamData = boxScoreTeamTab === 'left' ? leftData_bs : rightData_bs
                    const teamInfo = boxScoreTeamTab === 'left' ? leftTeamData_bs : rightTeamData_bs
                    const hasData = teamData?.[statKey]?.length > 0
                    if (!hasData) return null
                    return (
                      <div key={statKey} className="px-2">
                        {renderTeamStatTable(teamData, teamInfo, statKey, true)}
                      </div>
                    )
                  })}
                </div>

                {/* Desktop: Side-by-side layout */}
                <div className="hidden lg:block divide-y divide-surface-4">
                  {STAT_TAB_ORDER.map(statKey => {
                    const tab = STAT_TABS[statKey]
                    const hasLeftData = leftData_bs?.[statKey]?.length > 0
                    const hasRightData = rightData_bs?.[statKey]?.length > 0

                    if (!hasLeftData && !hasRightData) return null

                    return (
                      <div key={statKey} className="py-4 px-4">
                        <div className="grid grid-cols-2 gap-6">
                          {/* Left Team */}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-2 px-2">
                              <Link to={`${pathPrefix}/team/${resolveTid(leftTeamData_bs.abbr, currentDynasty?.teams || TEAMS)}/${game.year}`} className="group flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center flex-shrink-0 p-0.5 ">
                                  <img
                                    src={getTeamLogo(getMascotName(leftTeamData_bs.abbr, currentDynasty?.teams || currentDynasty?.customTeams) || leftTeamData_bs.abbr)}
                                    alt={leftTeamData_bs.name}
                                    className="w-full h-full object-contain"
                                  />
                                </div>
                                <span className="text-white font-semibold text-sm group-hover:underline">{leftTeamData_bs.name}</span>
                              </Link>
                              <span className="text-txt-tertiary text-sm">{tab.title}</span>
                            </div>
                            {hasLeftData ? renderTeamStatTable(leftData_bs, leftTeamData_bs, statKey, false) : (
                              <div className="text-txt-muted text-sm px-2 py-4">No {tab.title.toLowerCase()} stats</div>
                            )}
                          </div>
                          {/* Right Team */}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-2 px-2">
                              <Link to={`${pathPrefix}/team/${resolveTid(rightTeamData_bs.abbr, currentDynasty?.teams || TEAMS)}/${game.year}`} className="group flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center flex-shrink-0 p-0.5 ">
                                  <img
                                    src={getTeamLogo(getMascotName(rightTeamData_bs.abbr, currentDynasty?.teams || currentDynasty?.customTeams) || rightTeamData_bs.abbr)}
                                    alt={rightTeamData_bs.name}
                                    className="w-full h-full object-contain"
                                  />
                                </div>
                                <span className="text-white font-semibold text-sm group-hover:underline">{rightTeamData_bs.name}</span>
                              </Link>
                              <span className="text-txt-tertiary text-sm">{tab.title}</span>
                            </div>
                            {hasRightData ? renderTeamStatTable(rightData_bs, rightTeamData_bs, statKey, false) : (
                              <div className="text-txt-muted text-sm px-2 py-4">No {tab.title.toLowerCase()} stats</div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Team Stats Tab */}
          {activeTab === 'stats' && game.boxScore?.teamStats && (game.boxScore.teamStats.home || game.boxScore.teamStats.away) && (() => {
        const homeStats = game.boxScore.teamStats.home || {}
        const awayStats = game.boxScore.teamStats.away || {}
        const homeTeamAbbrForLink = getAbbrFromTeamName(homeStats.teamAbbr) || homeStats.teamAbbr
        const awayTeamAbbrForLink = getAbbrFromTeamName(awayStats.teamAbbr) || awayStats.teamAbbr

        // Get team colors for display
        const leftIsHome = boxScoreHomeIsUser ? (leftTeam === 'user') : (leftTeam !== 'user')
        const leftTeamAbbr = leftIsHome ? homeTeamAbbrForLink : awayTeamAbbrForLink
        const rightTeamAbbr = leftIsHome ? awayTeamAbbrForLink : homeTeamAbbrForLink
        const leftTeamStats = leftIsHome ? homeStats : awayStats
        const rightTeamStats = leftIsHome ? awayStats : homeStats

        // Get team colors
        const leftTeamColors = getTeamColorsRobust(leftTeamAbbr) || leftData.colors
        const rightTeamColors = getTeamColorsRobust(rightTeamAbbr) || rightData.colors

        // Helper to format possession time
        const formatPossession = (mins, secs) => {
          if (mins == null && secs == null) return null
          const totalMins = (mins || 0)
          const totalSecs = (secs || 0)
          return `${totalMins}:${totalSecs.toString().padStart(2, '0')}`
        }

        // Helper to safely calculate averages
        const calcAvg = (total, attempts) => {
          if (total == null || attempts == null || attempts === 0) return null
          return (total / attempts).toFixed(1)
        }

        // Build all stats in display order with calculated fields
        const allStats = [
          { label: 'First Downs', left: leftTeamStats.firstDowns, right: rightTeamStats.firstDowns },
          { label: 'Total Offense', left: leftTeamStats.totalOffense, right: rightTeamStats.totalOffense, key: true },
          { label: 'Total Plays', left: leftTeamStats.totalPlays, right: rightTeamStats.totalPlays },
          { label: 'Yards Per Play', left: calcAvg(leftTeamStats.totalOffense, leftTeamStats.totalPlays), right: calcAvg(rightTeamStats.totalOffense, rightTeamStats.totalPlays), calculated: true },
          { label: 'Rush Attempts', left: leftTeamStats.rushAttempts, right: rightTeamStats.rushAttempts },
          { label: 'Rush Yards', left: leftTeamStats.rushYards, right: rightTeamStats.rushYards },
          { label: 'Rush TDs', left: leftTeamStats.rushTds, right: rightTeamStats.rushTds },
          { label: 'Yards Per Rush', left: calcAvg(leftTeamStats.rushYards, leftTeamStats.rushAttempts), right: calcAvg(rightTeamStats.rushYards, rightTeamStats.rushAttempts), calculated: true },
          { label: 'Completions', left: leftTeamStats.completions, right: rightTeamStats.completions },
          { label: 'Pass Attempts', left: leftTeamStats.passAttempts, right: rightTeamStats.passAttempts },
          { label: 'Pass TDs', left: leftTeamStats.passTds, right: rightTeamStats.passTds },
          { label: 'Yards Per Pass', left: calcAvg(leftTeamStats.passingYards || leftTeamStats.passYards, leftTeamStats.passAttempts), right: calcAvg(rightTeamStats.passingYards || rightTeamStats.passYards, rightTeamStats.passAttempts), calculated: true },
          { label: 'Passing Yards', left: leftTeamStats.passingYards || leftTeamStats.passYards, right: rightTeamStats.passingYards || rightTeamStats.passYards },
          { label: '3rd Down Conv', left: leftTeamStats['3rdDownConv'], right: rightTeamStats['3rdDownConv'] },
          { label: '3rd Down Att', left: leftTeamStats['3rdDownAtt'], right: rightTeamStats['3rdDownAtt'] },
          { label: '4th Down Conv', left: leftTeamStats['4thDownConv'], right: rightTeamStats['4thDownConv'] },
          { label: '4th Down Att', left: leftTeamStats['4thDownAtt'], right: rightTeamStats['4thDownAtt'] },
          { label: '2-Point Conv', left: leftTeamStats['2ptConv'], right: rightTeamStats['2ptConv'] },
          { label: '2-Point Att', left: leftTeamStats['2ptAtt'], right: rightTeamStats['2ptAtt'] },
          {
            label: 'Red Zone',
            left: `${leftTeamStats.redZoneTd || 0} | ${leftTeamStats.redZoneFg || 0} | ${leftTeamStats.redZonePct || 0}%`,
            right: `${rightTeamStats.redZoneTd || 0} | ${rightTeamStats.redZoneFg || 0} | ${rightTeamStats.redZonePct || 0}%`,
            subLabel: 'TD | FG | %'
          },
          { label: 'Turnovers', left: leftTeamStats.turnovers, right: rightTeamStats.turnovers, inverted: true, key: true },
          { label: 'Fumbles Lost', left: leftTeamStats.fumblesLost, right: rightTeamStats.fumblesLost, inverted: true },
          { label: 'Interceptions', left: leftTeamStats.interceptions, right: rightTeamStats.interceptions, inverted: true },
          { label: 'Punt Ret Yards', left: leftTeamStats.puntRetYards, right: rightTeamStats.puntRetYards },
          { label: 'Kick Ret Yards', left: leftTeamStats.kickRetYards, right: rightTeamStats.kickRetYards },
          { label: 'Total Yards', left: leftTeamStats.totalYards, right: rightTeamStats.totalYards },
          { label: 'Punt Avg', left: leftTeamStats.puntAvg ?? leftTeamStats.punts, right: rightTeamStats.puntAvg ?? rightTeamStats.punts },
          { label: 'Penalties', left: leftTeamStats.penalties, right: rightTeamStats.penalties, inverted: true },
          { label: 'Penalty Yards', left: leftTeamStats.penaltyYards, right: rightTeamStats.penaltyYards, inverted: true },
          { label: 'Time of Possession', left: formatPossession(leftTeamStats.possMinutes, leftTeamStats.possSeconds), right: formatPossession(rightTeamStats.possMinutes, rightTeamStats.possSeconds) },
        ].filter(stat => stat.left != null || stat.right != null)

        // Render a stat comparison row
        const renderStatRow = (stat, idx) => {
          const leftVal = stat.left ?? (stat.calculated ? '-' : 0)
          const rightVal = stat.right ?? (stat.calculated ? '-' : 0)

          // Determine winner (for inverted stats like turnovers, lower is better)
          const leftNum = parseFloat(leftVal) || 0
          const rightNum = parseFloat(rightVal) || 0
          const leftWins = stat.inverted ? leftNum < rightNum : leftNum > rightNum
          const rightWins = stat.inverted ? rightNum < leftNum : rightNum > leftNum
          const tie = leftNum === rightNum

          return (
            <div key={idx} className={`px-3 sm:px-4 py-2 flex items-center ${stat.key ? 'bg-surface-2/40' : ''}`}>
              {/* Left value with team color indicator */}
              <div className="flex-1 flex items-center gap-2">
                <div
                  className="w-1 h-5 rounded-full"
                  style={{ backgroundColor: leftWins && !tie ? leftTeamColors.primary : 'transparent' }}
                />
                <span className={`text-xs sm:text-sm font-bold tabular-nums ${leftWins && !tie ? 'text-white' : 'text-txt-tertiary'} ${stat.calculated ? 'italic' : ''}`}>
                  {leftVal}
                </span>
              </div>

              {/* Stat label */}
              <div className="text-center flex-shrink-0 px-1 sm:px-2">
                <span className="text-[9px] sm:text-xs font-medium uppercase tracking-wide text-txt-secondary">
                  {stat.label}
                </span>
                {stat.subLabel && (
                  <div className="text-[8px] sm:text-[10px] text-txt-tertiary mt-0.5">{stat.subLabel}</div>
                )}
              </div>

              {/* Right value with team color indicator */}
              <div className="flex-1 flex items-center justify-end gap-2">
                <span className={`text-xs sm:text-sm font-bold tabular-nums ${rightWins && !tie ? 'text-white' : 'text-txt-tertiary'} ${stat.calculated ? 'italic' : ''}`}>
                  {rightVal}
                </span>
                <div
                  className="w-1 h-5 rounded-full"
                  style={{ backgroundColor: rightWins && !tie ? rightTeamColors.primary : 'transparent' }}
                />
              </div>
            </div>
          )
        }

        return (
          <>
            {/* Team header with logos */}
            <div className="px-4 py-3 border-b border-surface-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-white p-1">
                  <img src={getTeamLogoRobust(leftTeamAbbr)} alt="" className="w-full h-full object-contain" />
                </div>
                <span className="text-sm font-bold text-white hidden sm:inline">
                  {getMascotName(leftTeamAbbr, currentDynasty?.teams) || leftTeamAbbr}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white hidden sm:inline">
                  {getMascotName(rightTeamAbbr, currentDynasty?.teams) || rightTeamAbbr}
                </span>
                <div className="w-8 h-8 rounded-full bg-white p-1">
                  <img src={getTeamLogoRobust(rightTeamAbbr)} alt="" className="w-full h-full object-contain" />
                </div>
              </div>
            </div>

            {/* All stats in display order */}
            <div className="divide-y divide-surface-3/30">
              {allStats.map((stat, idx) => renderStatRow(stat, idx))}
            </div>
          </>
        )
      })()}

          {/* Ratings Tab */}
          {activeTab === 'ratings' && (() => {
            const userTid = game.userTid || resolveTid(displayTeamAbbr, currentDynasty?.teams || TEAMS)
            const storedUserRatings = getTeamRatingsForYear(currentDynasty, userTid, game.year)
            const userRatings = {
              ovr: game.team1Overall ?? storedUserRatings?.overall,
              off: game.team1Offense ?? storedUserRatings?.offense,
              def: game.team1Defense ?? storedUserRatings?.defense
            }
            const oppRatings = {
              ovr: game.team2Overall ?? game.opponentOverall,
              off: game.team2Offense ?? game.opponentOffense,
              def: game.team2Defense ?? game.opponentDefense
            }
            const leftIsOpponent = leftTeam !== 'user'
            const leftRatings = leftIsOpponent ? oppRatings : userRatings
            const rightRatings = !leftIsOpponent ? oppRatings : userRatings

            return (
              <div className="p-4 space-y-4">
                {[leftData, rightData].map((team, idx) => {
                  const ratings = idx === 0 ? leftRatings : rightRatings
                  if (!ratings.ovr && !ratings.off && !ratings.def) return null

                  const ovrBetter = (ratings.ovr || 0) > ((idx === 0 ? rightRatings : leftRatings).ovr || 0)
                  const offBetter = (ratings.off || 0) > ((idx === 0 ? rightRatings : leftRatings).off || 0)
                  const defBetter = (ratings.def || 0) > ((idx === 0 ? rightRatings : leftRatings).def || 0)

                  return (
                    <Link key={idx} to={`${pathPrefix}/team/${resolveTid(team.abbr, currentDynasty?.teams || TEAMS)}/${game.year}`} className="group flex items-center gap-3 p-3 rounded-xl bg-surface-2/50 hover:bg-surface-2 transition-colors">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center p-1.5 shadow-md flex-shrink-0 bg-white ">
                        {team.logo && <img src={team.logo} alt="" className="w-full h-full object-contain" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-white text-sm truncate group-hover:underline">{team.name}</div>
                        <div className="flex gap-4 mt-1.5">
                          {ratings.ovr && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-txt-muted font-medium uppercase">OVR</span>
                              <span className={`text-lg ${ovrBetter ? 'text-green-400 font-bold' : 'text-txt-secondary'}`}>{ratings.ovr}</span>
                            </div>
                          )}
                          {ratings.off && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-txt-muted font-medium uppercase">OFF</span>
                              <span className={`text-lg ${offBetter ? 'text-green-400 font-bold' : 'text-txt-secondary'}`}>{ratings.off}</span>
                            </div>
                          )}
                          {ratings.def && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-txt-muted font-medium uppercase">DEF</span>
                              <span className={`text-lg ${defBetter ? 'text-green-400 font-bold' : 'text-txt-secondary'}`}>{ratings.def}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )
          })()}

          {/* Awards Tab */}
          {activeTab === 'awards' && (game.conferencePOW || game.confDefensePOW || game.nationalPOW || game.natlDefensePOW) && (() => {
            // Shared honoree row — avatar, OFFENSIVE/DEFENSIVE chip, name, stat
            // line. Accent color is the only thing that changes between the
            // Conference (neutral) and National (gold) panels.
            const HonoreeRow = ({ name, side, accent }) => {
              const player = getPlayerByName(name)
              const stats = getPlayerBoxScoreStats(name)
              const pid = getPlayerPID(name)
              const initials = (name || '?')
                .split(/\s+/)
                .slice(0, 2)
                .map((w) => w[0])
                .join('')
                .toUpperCase()
              return (
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 bg-surface-3"
                    style={{ boxShadow: `0 0 0 2px ${accent}55` }}
                  >
                    {player?.pictureUrl ? (
                      <img src={player.pictureUrl} alt={name} className="w-full h-full object-cover" />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center font-bold text-sm"
                        style={{ color: accent }}
                      >
                        {initials}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span
                      className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest mb-1"
                      style={{
                        color: accent,
                        backgroundColor: `${accent}1a`,
                        border: `1px solid ${accent}40`,
                      }}
                    >
                      {side}
                    </span>
                    {pid ? (
                      <Link
                        to={`${pathPrefix}/player/${pid}`}
                        className="block font-bold text-txt-primary truncate hover:underline"
                      >
                        {name}
                      </Link>
                    ) : (
                      <div className="font-bold text-txt-primary truncate">{name}</div>
                    )}
                    {stats && (
                      <div className="text-xs text-txt-tertiary mt-0.5 tabular-nums">{stats}</div>
                    )}
                  </div>
                </div>
              )
            }

            return (
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Conference Player of the Week — neutral, team-colored accent */}
                {(game.conferencePOW || game.confDefensePOW) && (
                  <div
                    className="rounded-xl overflow-hidden"
                    style={{
                      backgroundColor: 'var(--surface-2)',
                      border: '1px solid var(--rule-soft)',
                    }}
                  >
                    <div
                      className="h-[3px] w-full"
                      style={{ backgroundColor: teamColors.primary }}
                      aria-hidden="true"
                    />
                    <div className="px-5 py-4 space-y-4">
                      <div className="label-xs text-txt-tertiary">Conference Player of the Week</div>
                      {game.conferencePOW && (
                        <HonoreeRow name={game.conferencePOW} side="Offensive" accent={teamColors.primary} />
                      )}
                      {game.confDefensePOW && (
                        <HonoreeRow name={game.confDefensePOW} side="Defensive" accent="#60a5fa" />
                      )}
                    </div>
                  </div>
                )}

                {/* National Player of the Week — gold treatment for prestige */}
                {(game.nationalPOW || game.natlDefensePOW) && (
                  <div
                    className="rounded-xl overflow-hidden relative"
                    style={{
                      background:
                        'linear-gradient(180deg, rgba(251, 191, 36, 0.08) 0%, rgba(251, 191, 36, 0.02) 100%)',
                      border: '1px solid rgba(251, 191, 36, 0.3)',
                      boxShadow: '0 0 0 1px rgba(251, 191, 36, 0.05) inset',
                    }}
                  >
                    <div
                      className="h-[3px] w-full"
                      style={{ backgroundColor: '#fbbf24' }}
                      aria-hidden="true"
                    />
                    <div className="px-5 py-4 space-y-4">
                      <div
                        className="label-xs"
                        style={{ color: '#fbbf24' }}
                      >
                        National Player of the Week
                      </div>
                      {game.nationalPOW && (
                        <HonoreeRow name={game.nationalPOW} side="Offensive" accent="#fbbf24" />
                      )}
                      {game.natlDefensePOW && (
                        <HonoreeRow name={game.natlDefensePOW} side="Defensive" accent="#fbbf24" />
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

        </div>
      )}

      {/* Media Section */}
      {links.length > 0 && (
        <div className="rounded-xl overflow-hidden shadow-lg bg-surface-1">
          <div className="px-4 py-3 border-b border-surface-4">
            <h3 className="font-bold text-white text-sm uppercase tracking-wide">
              Media
            </h3>
          </div>
          <div className="p-4 space-y-4">
            {links.map((link, index) => {
              const youtubeEmbedUrl = isYouTubeLink(link) ? getYouTubeEmbedUrl(link) : null

              if (youtubeEmbedUrl) {
                return (
                  <div key={index} className="rounded-xl overflow-hidden shadow-lg aspect-video ring-1 ring-surface-4">
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
              } else if (isImgurAlbumLink(link)) {
                // Imgur album/gallery - embed using iframe
                const albumId = getImgurAlbumId(link)
                return (
                  <div key={index} className="rounded-xl overflow-hidden shadow-lg ring-1 ring-surface-4 bg-surface-2">
                    {/* Header with link to open in new tab */}
                    <div className="flex items-center justify-between px-4 py-2 border-b border-surface-4">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded bg-[#1BB76E] flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h2v-6h-2v6zm0-8h2V7h-2v2z"/>
                          </svg>
                        </div>
                        <span className="text-sm font-medium text-white">Imgur Album</span>
                      </div>
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-txt-tertiary hover:text-green-400 transition-colors flex items-center gap-1"
                      >
                        Open in Imgur
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </div>
                    {/* Imgur embed iframe */}
                    <div className="relative w-full" style={{ minHeight: '500px' }}>
                      <iframe
                        src={`https://imgur.com/a/${albumId}/embed?pub=true&ref=https://dynastytracker.app&analytics=false`}
                        width="100%"
                        height="500"
                        frameBorder="0"
                        scrolling="no"
                        allowFullScreen
                        className="w-full"
                        style={{ overflow: 'hidden' }}
                      />
                    </div>
                  </div>
                )
              } else if (isImgurPostLink(link)) {
                // Imgur single post - convert to direct image and embed
                const directUrl = getImgurDirectUrl(link)
                return (
                  <div key={index} className="rounded-xl overflow-hidden shadow-lg ring-1 ring-surface-4">
                    <a href={link} target="_blank" rel="noopener noreferrer">
                      <img
                        src={directUrl}
                        alt={`Imgur image ${index + 1}`}
                        className="w-full h-auto"
                        onError={(e) => {
                          // If .jpg fails, try .png
                          if (e.target.src.endsWith('.jpg')) {
                            e.target.src = e.target.src.replace('.jpg', '.png')
                          }
                        }}
                      />
                    </a>
                  </div>
                )
              } else if (isImageLink(link)) {
                return (
                  <div key={index} className="rounded-xl overflow-hidden shadow-lg ring-1 ring-surface-4">
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
                    className="flex items-center gap-3 p-3 bg-surface-2 rounded-xl hover:bg-surface-3 transition-colors group ring-1 ring-surface-4"
                  >
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: teamColors.primary }}
                    >
                      <svg className="w-5 h-5" fill="none" stroke={getContrastTextColor(teamColors.primary)} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </div>
                    <span className="text-sm text-txt-secondary group-hover:text-white break-all flex-1 transition-colors">{link}</span>
                    <svg className="w-5 h-5 text-txt-muted group-hover:text-white transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </a>
                )
              }
            })}
          </div>
        </div>
      )}

      {/* Scoring Highlights Modal */}
      <ScoringHighlightsModal
        isOpen={showHighlightsModal}
        onClose={() => setShowHighlightsModal(false)}
        scoringPlays={sortPlaysChronologically(game.boxScore?.scoringSummary).map(p => ({
          ...p,
          gameInfo: { ...(p.gameInfo || {}), gameId }
        }))}
        team1Abbr={leftData?.abbr}
        team2Abbr={rightData?.abbr}
        team1Tid={leftData?.tid}
        team2Tid={rightData?.tid}
        team1Logo={leftData?.logo}
        team2Logo={rightData?.logo}
        players={currentDynasty?.players || []}
        getTeamLogo={getTeamLogo}
        getMascotName={getMascotName}
        teamsData={currentDynasty?.teams || currentDynasty?.customTeams}
        startIndex={highlightsStartIndex}
        pathPrefix={pathPrefix}
      />
    </div>
  )
}
