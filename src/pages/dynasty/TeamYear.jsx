import { useState, useRef } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useDynasty, getLockedCoachingStaff, detectGameType, GAME_TYPES, getCustomConferencesForYear, getGamesByType, isPlayerOnRoster, getUserGamePerspective } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
// Team colors are derived from the viewed team, not the user's team
import { getContrastTextColor } from '../../utils/colorUtils'
import { getConferenceLogo } from '../../data/conferenceLogos'
import { bowlLogos } from '../../data/bowlLogos'
import { getCFPGameId, getSlotIdFromBowlName, getCFPSlotDisplayName, getFirstRoundSlotId } from '../../data/cfpConstants'
// GameDetailModal removed - now using game pages
import GameEntryModal from '../../components/GameEntryModal'
import RosterEditModal from '../../components/RosterEditModal'
import { TEAMS, resolveTid, getTeam, getTeamByAbbr, getCurrentTeamAbbr, getGameTeamInfo, getAbbrFromTeamName } from '../../data/teamRegistry'
import { getTeamLogo, getMascotName as getMascotNameFromTeams } from '../../data/teams'

// Map abbreviation to mascot name for logo lookup
// Accepts optional teamsData for tid-based teambuilder support
const getMascotName = (abbr, teamsData = null) => {
  // Try tid-based lookup first if teams data provided
  if (teamsData) {
    const result = getMascotNameFromTeams(abbr, teamsData)
    if (result) return result
  }
  // Fallback to hardcoded map
  const mascotMap = {
    'BAMA': 'Alabama Crimson Tide',
    'AFA': 'Air Force Falcons',
    'AKR': 'Akron Zips',
    'APP': 'Appalachian State Mountaineers',
    'ARIZ': 'Arizona Wildcats',
    'ARK': 'Arkansas Razorbacks',
    'ARMY': 'Army Black Knights',
    'ARST': 'Arkansas State Red Wolves',
    'ASU': 'Arizona State Sun Devils',
    'AUB': 'Auburn Tigers',
    'BALL': 'Ball State Cardinals',
    'BC': 'Boston College Eagles',
    'BGSU': 'Bowling Green Falcons',
    'BOIS': 'Boise State Broncos',
    'BU': 'Baylor Bears',
    'BUFF': 'Buffalo Bulls',
    'BYU': 'Brigham Young Cougars',
    'CAL': 'California Golden Bears',
    'CCU': 'Coastal Carolina Chanticleers',
    'CHAR': 'Charlotte 49ers',
    'CINN': 'Cincinnati Bearcats',
    'CLEM': 'Clemson Tigers',
    'CMU': 'Central Michigan Chippewas',
    'COLO': 'Colorado Buffaloes',
    'CONN': 'Connecticut Huskies',
    'CSU': 'Colorado State Rams',
    'DEL': 'Delaware Fightin\' Blue Hens',
    'DUKE': 'Duke Blue Devils',
    'ECU': 'East Carolina Pirates',
    'EMU': 'Eastern Michigan Eagles',
    'FAU': 'Florida Atlantic Owls',
    'FIU': 'Florida International Panthers',
    'FLA': 'Florida Gators',
    'FRES': 'Fresno State Bulldogs',
    'FSU': 'Florida State Seminoles',
    'GASO': 'Georgia Southern Eagles',
    'GSU': 'Georgia State Panthers',
    'GT': 'Georgia Tech Yellow Jackets',
    'HAW': 'Hawaii Rainbow Warriors',
    'HOU': 'Houston Cougars',
    'ILL': 'Illinois Fighting Illini',
    'IU': 'Indiana Hoosiers',
    'IOWA': 'Iowa Hawkeyes',
    'ISU': 'Iowa State Cyclones',
    'JKST': 'Jacksonville State Gamecocks',
    'JMU': 'James Madison Dukes',
    'KENN': 'Kennesaw State Owls',
    'KENT': 'Kent State Golden Flashes',
    'KSU': 'Kansas State Wildcats',
    'KU': 'Kansas Jayhawks',
    'LIB': 'Liberty Flames',
    'LOU': 'Louisville Cardinals',
    'LSU': 'LSU Tigers',
    'LT': 'Louisiana Tech Bulldogs',
    'M-OH': 'Miami Redhawks',
    'MASS': 'Massachusetts Minutemen',
    'MEM': 'Memphis Tigers',
    'MIA': 'Miami Hurricanes',
    'MICH': 'Michigan Wolverines',
    'MINN': 'Minnesota Golden Gophers',
    'MISS': 'Ole Miss Rebels',
    'MIZ': 'Missouri Tigers',
    'MRSH': 'Marshall Thundering Herd',
    'MRYD': 'Maryland Terrapins',
    'MSST': 'Mississippi State Bulldogs',
    'MSU': 'Michigan State Spartans',
    'MTSU': 'Middle Tennessee State Blue Raiders',
    'MZST': 'Missouri State Bears',
    'NAVY': 'Navy Midshipmen',
    'NCST': 'North Carolina State Wolfpack',
    'ND': 'Notre Dame Fighting Irish',
    'NEB': 'Nebraska Cornhuskers',
    'NEV': 'Nevada Wolf Pack',
    'NIU': 'Northern Illinois Huskies',
    'NMSU': 'New Mexico State Aggies',
    'NU': 'Northwestern Wildcats',
    'ODU': 'Old Dominion Monarchs',
    'OHIO': 'Ohio Bobcats',
    'OHIO ST': 'Ohio State Buckeyes',
    'OKST': 'Oklahoma State Cowboys',
    'ORE': 'Oregon Ducks',
    'ORST': 'Oregon State Beavers',
    'OSU': 'Ohio State Buckeyes',
    'OU': 'Oklahoma Sooners',
    'PITT': 'Pittsburgh Panthers',
    'PSU': 'Penn State Nittany Lions',
    'PUR': 'Purdue Boilermakers',
    'RICE': 'Rice Owls',
    'RUTG': 'Rutgers Scarlet Knights',
    'SCAR': 'South Carolina Gamecocks',
    'SDSU': 'San Diego State Aztecs',
    'SHSU': 'Sam Houston State Bearkats',
    'SJSU': 'San Jose State Spartans',
    'SMU': 'SMU Mustangs',
    'STAN': 'Stanford Cardinal',
    'SYR': 'Syracuse Orange',
    'TAMU': 'Texas A&M Aggies',
    'TCU': 'TCU Horned Frogs',
    'TEM': 'Temple Owls',
    'TENN': 'Tennessee Volunteers',
    'TEX': 'Texas Longhorns',
    'TLNE': 'Tulane Green Wave',
    'TLSA': 'Tulsa Golden Hurricane',
    'TOL': 'Toledo Rockets',
    'TROY': 'Troy Trojans',
    'TTU': 'Texas Tech Red Raiders',
    'TULN': 'Tulane Green Wave',
    'TXAM': 'Texas A&M Aggies',
    'TXST': 'Texas State Bobcats',
    'UAB': 'UAB Blazers',
    'UC': 'Cincinnati Bearcats',
    'UCF': 'UCF Knights',
    'UCLA': 'UCLA Bruins',
    'UGA': 'Georgia Bulldogs',
    'UH': 'Houston Cougars',
    'UK': 'Kentucky Wildcats',
    'UL': 'Lafayette Ragin\' Cajuns',
    'ULL': 'Lafayette Ragin\' Cajuns',
    'ULM': 'Monroe Warhawks',
    'UMD': 'Maryland Terrapins',
    'UNC': 'North Carolina Tar Heels',
    'UNLV': 'UNLV Rebels',
    'UNM': 'New Mexico Lobos',
    'UNT': 'North Texas Mean Green',
    'USA': 'South Alabama Jaguars',
    'USC': 'USC Trojans',
    'USF': 'South Florida Bulls',
    'USM': 'Southern Mississippi Golden Eagles',
    'USU': 'Utah State Aggies',
    'UT': 'Tennessee Volunteers',
    'UTAH': 'Utah Utes',
    'UTEP': 'UTEP Miners',
    'UTSA': 'UTSA Roadrunners',
    'UVA': 'Virginia Cavaliers',
    'VAN': 'Vanderbilt Commodores',
    'VAND': 'Vanderbilt Commodores',
    'VT': 'Virginia Tech Hokies',
    'WAKE': 'Wake Forest Demon Deacons',
    'WASH': 'Washington Huskies',
    'WIS': 'Wisconsin Badgers',
    'WISC': 'Wisconsin Badgers',
    'WKU': 'Western Kentucky Hilltoppers',
    'WMU': 'Western Michigan Broncos',
    'WSU': 'Washington State Cougars',
    'WVU': 'West Virginia Mountaineers',
    'WYO': 'Wyoming Cowboys',
    'GAST': 'Georgia State Panthers', 'OKLA': 'Oklahoma Sooners', 'RUT': 'Rutgers Scarlet Knights',
    'SAM': 'Sam Houston State Bearkats', 'TUL': 'Tulane Green Wave', 'TXTECH': 'Texas Tech Red Raiders',
    'UF': 'Florida Gators', 'UM': 'Miami Hurricanes',
    // FCS teams
    'FCSE': 'FCS East Judicials', 'FCSM': 'FCS Midwest Rebels',
    'FCSN': 'FCS Northwest Stallions', 'FCSW': 'FCS West Titans'
  }
  return mascotMap[abbr] || null
}

// Award display names
const AWARD_DISPLAY = {
  heisman: 'Heisman Trophy',
  maxwell: 'Maxwell Award',
  walterCamp: 'Walter Camp Award',
  bearBryantCoachOfTheYear: 'Bear Bryant Coach of the Year',
  daveyObrien: 'Davey O\'Brien Award',
  chuckBednarik: 'Chuck Bednarik Award',
  broncoNagurski: 'Bronco Nagurski Trophy',
  jimThorpe: 'Jim Thorpe Award',
  doakWalker: 'Doak Walker Award',
  fredBiletnikoff: 'Fred Biletnikoff Award',
  lombardi: 'Lombardi Award',
  unitasGoldenArm: 'Unitas Golden Arm Award',
  edgeRusherOfTheYear: 'Edge Rusher of the Year',
  outland: 'Outland Trophy',
  johnMackey: 'John Mackey Award',
  broyles: 'Broyles Award',
  dickButkus: 'Dick Butkus Award',
  rimington: 'Rimington Trophy',
  louGroza: 'Lou Groza Award',
  rayGuy: 'Ray Guy Award',
  returnerOfTheYear: 'Returner of the Year'
}

// Award order for display (same as Awards page)
const AWARD_ORDER = [
  'heisman', 'maxwell', 'walterCamp', 'daveyObrien', 'doakWalker',
  'fredBiletnikoff', 'johnMackey', 'unitasGoldenArm',
  'chuckBednarik', 'broncoNagurski', 'jimThorpe', 'dickButkus', 'edgeRusherOfTheYear',
  'outland', 'lombardi', 'rimington',
  'louGroza', 'rayGuy', 'returnerOfTheYear',
  'bearBryantCoachOfTheYear', 'broyles'
]

export default function TeamYear() {
  const { id, tid: tidParam, year } = useParams()
  const navigate = useNavigate()
  const { currentDynasty, updateDynasty, addGame, saveRoster, isViewOnly, saveTeamYearInfo } = useDynasty()
  const pathPrefix = usePathPrefix()
  // Note: We use the viewed team's colors, not the user's team colors
  const selectedYear = parseInt(year)

  // Convert tid param to number
  const tid = parseInt(tidParam, 10)

  // Game state for editing
  const [selectedGame, setSelectedGame] = useState(null)
  const [showCoachingStaffTooltip, setShowCoachingStaffTooltip] = useState(false)

  // Game edit modal state
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingGameData, setEditingGameData] = useState(null)

  // Roster sorting state
  const [rosterSort, setRosterSort] = useState('position') // 'position', 'overall', 'jerseyNumber', 'name'
  const [rosterSortDir, setRosterSortDir] = useState('asc') // 'asc', 'desc'
  const [showRosterModal, setShowRosterModal] = useState(false)
  const [rosterCollapsed, setRosterCollapsed] = useState(false)
  const [scheduleCollapsed, setScheduleCollapsed] = useState(false)
  const [positionFilter, setPositionFilter] = useState('all') // 'all', 'QB', 'RB', 'WR', etc.
  const [showRecordTooltip, setShowRecordTooltip] = useState(false)
  const [showTeamEditModal, setShowTeamEditModal] = useState(false)
  const [editWins, setEditWins] = useState('')
  const [editLosses, setEditLosses] = useState('')
  const [editConference, setEditConference] = useState('')

  // Quick image upload state
  const [quickImagePlayer, setQuickImagePlayer] = useState(null)
  const [imageUploading, setImageUploading] = useState(false)
  const quickImageInputRef = useRef(null)

  // Upload image to ImgBB
  const uploadToImgBB = async (file) => {
    const apiKey = import.meta.env.VITE_IMGBB_API_KEY || '1369fa0365731b13c5330a26fedf569c'
    if (!apiKey) return null

    const formDataUpload = new FormData()
    formDataUpload.append('image', file)
    formDataUpload.append('key', apiKey)

    try {
      setImageUploading(true)
      const response = await fetch('https://api.imgbb.com/1/upload', {
        method: 'POST',
        body: formDataUpload
      })
      const data = await response.json()
      return data.success ? data.data.url : null
    } catch (error) {
      console.error('Upload failed:', error)
      return null
    } finally {
      setImageUploading(false)
    }
  }

  // Handle quick image upload for a player
  const handleQuickImageUpload = async (file) => {
    if (!file || !quickImagePlayer) return

    const url = await uploadToImgBB(file)
    if (url) {
      // Update the player's pictureUrl
      const updatedPlayers = currentDynasty.players.map(p =>
        p.pid === quickImagePlayer.pid ? { ...p, pictureUrl: url } : p
      )
      await updateDynasty(currentDynasty.id, { players: updatedPlayers })
      setQuickImagePlayer(null)
    }
  }

  if (!currentDynasty) return null

  // Use dynasty.teams if available, otherwise fall back to TEAMS
  const teamsSource = currentDynasty.teams || TEAMS

  // Get all FBS teams for dropdown (sorted alphabetically)
  const allTeams = Object.values(teamsSource)
    .filter(team => !team.isFCS)
    .map(team => ({
      tid: team.tid,
      abbr: team.abbr,
      name: team.name
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  // Get available years (most recent first)
  const availableYears = []
  for (let y = currentDynasty.currentYear; y >= currentDynasty.startYear; y--) {
    availableYears.push(y)
  }

  // Get team info from tid
  const team = teamsSource[tid]

  if (!team) {
    return (
      <div className="space-y-6">
        <div
          className="rounded-lg shadow-lg p-6"
          style={{
            backgroundColor: '#f3f4f6',
            border: '3px solid #6b7280'
          }}
        >
          <h1 className="text-2xl font-bold" style={{ color: '#1f2937' }}>
            Team Not Found
          </h1>
          <Link
            to={`${pathPrefix}/teams`}
            className="inline-block mt-4 px-4 py-2 rounded-lg font-semibold"
            style={{
              backgroundColor: '#1f2937',
              color: '#ffffff'
            }}
          >
            Back to Teams
          </Link>
        </div>
      </div>
    )
  }

  // Extract team data - using new tid-based structure
  const teamAbbr = team.abbr  // Keep for backwards compatibility with data lookups
  const teamInfo = {
    name: team.name,
    backgroundColor: team.primaryColor,
    textColor: team.secondaryColor,
    isTeambuilder: team.isCustom || false
  }
  const customTeams = currentDynasty.customTeams  // Still needed for some lookups

  // Use viewed team's colors for the page
  const viewedTeamColors = {
    primary: teamInfo.textColor || '#1f2937',
    secondary: teamInfo.backgroundColor || '#f3f4f6'
  }

  // Conference with custom conferences support (year-specific)
  const customConferences = getCustomConferencesForYear(currentDynasty, selectedYear)
  // Get conference for the team - check manual override first
  const manualConference = currentDynasty.conferenceByTeamYear?.[teamAbbr]?.[selectedYear]
  // Fall back to checking custom conferences
  let baseConference = null
  if (customConferences) {
    for (const [conf, teams] of Object.entries(customConferences)) {
      if (teams.includes(teamAbbr)) {
        baseConference = conf
        break
      }
    }
  }
  const conference = manualConference || baseConference
  const conferenceLogo = conference ? getConferenceLogo(conference) : null
  const mascotName = team.name
  const teamLogo = team.logo
  const teamBgText = getContrastTextColor(teamInfo.backgroundColor)
  const teamPrimaryText = getContrastTextColor(teamInfo.textColor)
  const secondaryBgText = getContrastTextColor(viewedTeamColors.secondary)

  // Check if this is the user's team
  const userTeamAbbr = getCurrentTeamAbbr(currentDynasty)
  const isUserTeam = teamAbbr === userTeamAbbr

  // Get locked coaching staff for this team/year (preserves coordinators even if fired later)
  const teamCoachingStaff = getLockedCoachingStaff(currentDynasty, selectedYear, teamAbbr)

  // Get games against this team for this specific year (user's games vs this opponent)
  // Uses perspective to find games where user's team played against this team
  const teams = currentDynasty?.teams || TEAMS
  const vsUserGames = (currentDynasty.games || [])
    .filter(g => g.year === selectedYear)
    .map(g => {
      const perspective = getUserGamePerspective(g, currentDynasty)
      return perspective ? { ...g, perspective } : null
    })
    .filter(g => {
      if (!g) return false
      // Check if opponent is the team we're viewing (by tid or abbr)
      const opponentInfo = g.perspective?.opponentTid
        ? getGameTeamInfo(teams, g.perspective.opponentTid)
        : null
      const opponentAbbr = opponentInfo?.abbr || g.opponent
      return opponentAbbr === teamAbbr
    })
    .sort((a, b) => a.week - b.week)

  // Get user's team record for this year (if viewing user's team page)
  // Sort by game phase order: regular season (1-14), CC (15), CFP R1 (16), CFP QF (17), CFP SF (18), CFP Champ (19), other bowls (20)
  const getGameSortOrder = (game) => {
    // Regular season games
    if (!game.isConferenceChampionship && !game.isBowlGame && !game.isPlayoff &&
        !game.isCFPFirstRound && !game.isCFPQuarterfinal && !game.isCFPSemifinal && !game.isCFPChampionship) {
      return game.week || 0
    }
    // Conference Championship
    if (game.isConferenceChampionship) return 15
    // CFP games in order
    if (game.isCFPFirstRound) return 16
    if (game.isCFPQuarterfinal) return 17
    if (game.isCFPSemifinal) return 18
    if (game.isCFPChampionship) return 19
    // Other bowl games (non-CFP)
    if (game.isBowlGame) return 20
    // Fallback for other playoff games
    if (game.isPlayoff) return 20 + (game.week || 0)
    return 99
  }
  // Get games for THIS TEAM from games array
  // Includes games where team was involved (as team1 or team2 in unified format)
  // Also handles legacy format (userTeam/opponent) during transition
  const teamGamesFromArray = (() => {
    const games = currentDynasty.games || []
    const result = []

    games.forEach(g => {
      if (Number(g.year) !== Number(selectedYear)) return

      // UNIFIED FORMAT: Check team1Tid/team2Tid
      const hasUnifiedFormat = g.team1Tid && g.team2Tid
      const isTeam1ByTid = g.team1Tid === tid
      const isTeam2ByTid = g.team2Tid === tid
      const isInGameByTid = isTeam1ByTid || isTeam2ByTid

      // LEGACY FORMAT: Check team1/team2 abbreviations or userTeam/opponent
      const opponentAbbr = getAbbrFromTeamName(g.opponent) || g.opponent
      const isTeam1ByAbbr = g.team1 === teamAbbr
      const isTeam2ByAbbr = g.team2 === teamAbbr
      const isInTeam1Team2 = isTeam1ByAbbr || isTeam2ByAbbr

      // Combined check: team is involved in this game
      const isTeam1 = hasUnifiedFormat ? isTeam1ByTid : isTeam1ByAbbr
      const isTeam2 = hasUnifiedFormat ? isTeam2ByTid : isTeam2ByAbbr
      const teamInGame = hasUnifiedFormat ? isInGameByTid : (isInTeam1Team2 || g.userTeam === teamAbbr || opponentAbbr === teamAbbr)

      if (!teamInGame) return

      // Check if this is a postseason game
      const isPostseason = g.isConferenceChampionship || g.isBowlGame || g.isPlayoff ||
                           g.isCFPFirstRound || g.isCFPQuarterfinal || g.isCFPSemifinal || g.isCFPChampionship

      // Detect CPU games:
      // - Unified format: neither team is user's coached team for this year
      // - Legacy format: has team1/team2 but no userTeam
      // Use fallback logic to get userTid for the game year (same as getUserGamePerspective)
      const yearNum = Number(g.year)
      const yearStr = String(g.year)
      let userTidForYear = currentDynasty.coachTeamByYear?.[yearNum]?.tid ?? currentDynasty.coachTeamByYear?.[yearStr]?.tid
      // Fallback 1: Derive tid from coachTeamByYear[year].team abbr
      if (!userTidForYear) {
        const userTeamAbbrForYear = currentDynasty.coachTeamByYear?.[yearNum]?.team ?? currentDynasty.coachTeamByYear?.[yearStr]?.team
        if (userTeamAbbrForYear) {
          userTidForYear = resolveTid(userTeamAbbrForYear, currentDynasty.teams)
        }
      }
      // Fallback 2: If this is the current year, use current team tid
      if (!userTidForYear && yearNum === Number(currentDynasty.currentYear)) {
        userTidForYear = resolveTid(getCurrentTeamAbbr(currentDynasty) || currentDynasty.teamName, currentDynasty.teams)
      }
      // Fallback 3: For dynasties without coachTeamByYear, derive from teamName
      if (!userTidForYear && currentDynasty.teamName) {
        userTidForYear = resolveTid(currentDynasty.teamName, currentDynasty.teams)
      }
      const isCPUGame = hasUnifiedFormat
        ? (g.team1Tid !== userTidForYear && g.team2Tid !== userTidForYear)
        : (!g.userTeam && g.team1 && g.team2)

      // Calculate scores from unified or legacy format
      const team1Score = g.team1Score
      const team2Score = g.team2Score
      const thisTeamScore = isTeam1 ? team1Score : team2Score
      const otherTeamScore = isTeam1 ? team2Score : team1Score

      // Determine winner (unified or legacy format)
      const teamWon = hasUnifiedFormat
        ? (g.winnerTid === tid || thisTeamScore > otherTeamScore)
        : (g.winner === teamAbbr || (g.result === 'win' && g.userTeam === teamAbbr) ||
           (g.result === 'loss' && opponentAbbr === teamAbbr))

      // Get opponent tid/abbr
      const opponentTid = isTeam1 ? g.team2Tid : g.team1Tid
      const opponentAbbrResolved = hasUnifiedFormat
        ? (getTeam(currentDynasty.teams, opponentTid)?.abbr || opponentAbbr)
        : (isTeam1ByAbbr ? g.team2 : (isTeam2ByAbbr ? g.team1 : opponentAbbr))

      if (isCPUGame) {
        // CPU game - convert to display format for this team's perspective
        result.push({
          ...g,
          // For display compatibility with legacy UI code
          userTeam: teamAbbr,
          opponent: opponentAbbrResolved,
          teamScore: thisTeamScore,
          opponentScore: otherTeamScore,
          result: teamWon ? 'win' : 'loss',
          _fromCPUPostseason: true
        })
        return
      }

      // User game - check if this team was the user's team or opponent
      const wasUserTeam = hasUnifiedFormat
        ? (isInGameByTid && (g.team1Tid === userTidForYear || g.team2Tid === userTidForYear) && (isTeam1ByTid === (g.team1Tid === userTidForYear)))
        : (g.userTeam === teamAbbr || (!g.userTeam && isUserTeam))

      if (wasUserTeam) {
        // Game played AS this team - use as-is or convert from unified
        if (hasUnifiedFormat && !g.userTeam) {
          // Convert unified format to display format
          result.push({
            ...g,
            userTeam: teamAbbr,
            opponent: opponentAbbrResolved,
            teamScore: thisTeamScore,
            opponentScore: otherTeamScore,
            result: teamWon ? 'win' : 'loss',
            location: g.homeTeamTid === tid ? 'home' : (g.homeTeamTid === opponentTid ? 'away' : 'neutral')
          })
        } else {
          result.push(g)
        }
        return
      }

      // Game played AGAINST this team - flip perspective
      const flippedResult = teamWon ? 'win' : 'loss'
      const flippedLocation = hasUnifiedFormat
        ? (g.homeTeamTid === tid ? 'home' : (g.homeTeamTid === opponentTid ? 'away' : 'neutral'))
        : (g.location === 'home' ? 'away' : (g.location === 'away' ? 'home' : g.location))

      // Get the other team's info for display
      const otherTeamAbbr = hasUnifiedFormat
        ? (getTeam(currentDynasty.teams, isTeam1 ? g.team2Tid : g.team1Tid)?.abbr || g.userTeam)
        : g.userTeam

      result.push({
        ...g,
        _displayOpponent: otherTeamAbbr,
        _displayResult: flippedResult,
        _displayLocation: flippedLocation,
        _displayTeamScore: thisTeamScore,
        _displayOpponentScore: otherTeamScore,
        _isFlippedPerspective: true
      })
    })

    return result
  })()

  // Also check if there's a bowl game in bowlGamesByYear that should be included
  const yearBowlDataForTeam = currentDynasty.bowlGamesByYear?.[selectedYear] || {}
  const teamBowlFromLegacy = [...(yearBowlDataForTeam.week1 || []), ...(yearBowlDataForTeam.week2 || [])]
    .find(bowl =>
      (bowl.team1 === teamAbbr || bowl.team2 === teamAbbr) &&
      bowl.team1Score !== null && bowl.team2Score !== null &&
      // Don't add if already in games array
      !teamGamesFromArray.some(g => g.isBowlGame && g.bowlName === bowl.bowlName)
    ) || null

  // Convert legacy bowl game to schedule format if found
  const teamBowlGameConverted = teamBowlFromLegacy ? (() => {
    // Only use real IDs that exist in games array
    const hasRealGameEntry = teamBowlFromLegacy.id && (currentDynasty.games || []).some(g => g.id === teamBowlFromLegacy.id)
    return {
      id: hasRealGameEntry ? teamBowlFromLegacy.id : null, // Only use real IDs, not generated ones
      week: 'Bowl',
      year: selectedYear,
      opponent: teamBowlFromLegacy.team1 === teamAbbr ? teamBowlFromLegacy.team2 : teamBowlFromLegacy.team1,
      location: 'neutral',
      result: (teamBowlFromLegacy.team1 === teamAbbr && teamBowlFromLegacy.team1Score > teamBowlFromLegacy.team2Score) ||
              (teamBowlFromLegacy.team2 === teamAbbr && teamBowlFromLegacy.team2Score > teamBowlFromLegacy.team1Score) ? 'win' : 'loss',
      teamScore: teamBowlFromLegacy.team1 === teamAbbr ? teamBowlFromLegacy.team1Score : teamBowlFromLegacy.team2Score,
      opponentScore: teamBowlFromLegacy.team1 === teamAbbr ? teamBowlFromLegacy.team2Score : teamBowlFromLegacy.team1Score,
      isBowlGame: true,
      bowlName: teamBowlFromLegacy.bowlName
    }
  })() : null

  // Also check for conference championship games from conferenceChampionshipsByYear
  const ccGamesFromLegacyStructure = (() => {
    const yearChampionships = currentDynasty.conferenceChampionshipsByYear?.[selectedYear] || []
    return yearChampionships
      .filter(cc =>
        (cc.team1 === teamAbbr || cc.team2 === teamAbbr) &&
        cc.team1Score !== null && cc.team2Score !== null &&
        // Don't add if already in games array
        !teamGamesFromArray.some(g => g.isConferenceChampionship)
      )
      .map(cc => {
        const isTeam1 = cc.team1 === teamAbbr
        const teamWon = cc.winner === teamAbbr
        // Only use real IDs that exist in games array
        const hasRealGameEntry = cc.id && (currentDynasty.games || []).some(g => g.id === cc.id)
        return {
          id: hasRealGameEntry ? cc.id : null, // Only use real IDs, not generated ones
          week: 'CCG',
          year: selectedYear,
          opponent: isTeam1 ? cc.team2 : cc.team1,
          location: 'neutral',
          result: teamWon ? 'win' : 'loss',
          teamScore: isTeam1 ? cc.team1Score : cc.team2Score,
          opponentScore: isTeam1 ? cc.team2Score : cc.team1Score,
          isConferenceChampionship: true,
          conference: cc.conference
        }
      })
  })()

  // Also check for CFP games from cfpResultsByYear that should be included
  const cfpResultsForYear = currentDynasty.cfpResultsByYear?.[selectedYear] || {}
  const teamCFPGamesConverted = (() => {
    const converted = []

    // Helper to convert CFP game to schedule format
    const convertCFPGame = (game, roundName, cfpFlags) => {
      if (!game || game.team1Score === null || game.team2Score === null) return null
      // Check both tid and abbr for backwards compatibility
      const isTeam1 = game.team1Tid === tid || game.team1 === teamAbbr
      const isTeam2 = game.team2Tid === tid || game.team2 === teamAbbr
      if (!isTeam1 && !isTeam2) return null

      const teamWon = game.winner === teamAbbr || game.winnerTid === tid
      // If the game has a real ID that exists in the games array, use it; otherwise mark as non-linkable
      const hasRealGameEntry = game.id && (currentDynasty.games || []).some(g => g.id === game.id)
      return {
        id: hasRealGameEntry ? game.id : null, // Only use real IDs, not generated ones
        week: roundName,
        year: selectedYear,
        opponent: isTeam1 ? game.team2 : game.team1,
        location: 'neutral',
        result: teamWon ? 'win' : 'loss',
        teamScore: isTeam1 ? game.team1Score : game.team2Score,
        opponentScore: isTeam1 ? game.team2Score : game.team1Score,
        bowlName: game.bowlName || roundName,
        _isConvertedFromCFPResults: true, // Mark as converted (for debugging)
        ...cfpFlags
      }
    }

    // Helper to safely get array from cfpResults (handles both array and non-array cases)
    const safeArray = (val) => Array.isArray(val) ? val : []

    // Helper to check if a game already exists (handles abbr vs full name comparison)
    const gameAlreadyExists = (convGame, cfpFlag) => {
      const convOppAbbr = getAbbrFromTeamName(convGame.opponent) || convGame.opponent
      return teamGamesFromArray.some(g => {
        if (!g[cfpFlag]) return false
        const existingOppAbbr = getAbbrFromTeamName(g.opponent) || g.opponent
        return existingOppAbbr === convOppAbbr
      })
    }

    // First Round
    safeArray(cfpResultsForYear.firstRound).forEach(game => {
      const conv = convertCFPGame(game, 'CFP R1', { isCFPFirstRound: true, isPlayoff: true })
      if (conv && !gameAlreadyExists(conv, 'isCFPFirstRound')) {
        converted.push(conv)
      }
    })

    // Quarterfinals
    safeArray(cfpResultsForYear.quarterfinals).forEach(game => {
      const conv = convertCFPGame(game, 'CFP QF', { isCFPQuarterfinal: true, isPlayoff: true })
      if (conv && !gameAlreadyExists(conv, 'isCFPQuarterfinal')) {
        converted.push(conv)
      }
    })

    // Semifinals
    safeArray(cfpResultsForYear.semifinals).forEach(game => {
      const conv = convertCFPGame(game, 'CFP SF', { isCFPSemifinal: true, isPlayoff: true })
      if (conv && !gameAlreadyExists(conv, 'isCFPSemifinal')) {
        converted.push(conv)
      }
    })

    // Championship
    const champGame = Array.isArray(cfpResultsForYear.championship)
      ? cfpResultsForYear.championship[0]
      : cfpResultsForYear.championship
    if (champGame) {
      const conv = convertCFPGame(champGame, 'CFP Champ', { isCFPChampionship: true, isPlayoff: true })
      if (conv && !gameAlreadyExists(conv, 'isCFPChampionship')) {
        converted.push(conv)
      }
    }

    return converted
  })()

  // Combine team's games with legacy bowl game, CC games, and CFP games if applicable
  // Then deduplicate - prefer games from games[] array over converted ones
  const combinedGames = [
    ...teamGamesFromArray,
    ...ccGamesFromLegacyStructure,
    ...(teamBowlGameConverted ? [teamBowlGameConverted] : []),
    ...teamCFPGamesConverted
  ]

  // Deduplicate by game ID - games from games[] array come first, so they take precedence
  const seenIds = new Set()
  const teamYearGames = combinedGames
    .filter(g => {
      if (!g.id) return true // Keep games without IDs
      if (seenIds.has(g.id)) return false // Skip duplicate IDs
      seenIds.add(g.id)
      return true
    })
    .sort((a, b) => getGameSortOrder(a) - getGameSortOrder(b))
  // Check for both 'win'/'loss' and 'W'/'L' formats
  // Use _displayResult for flipped perspective games (opponent team pages)
  const teamWins = teamYearGames.filter(g => {
    const result = g._isFlippedPerspective ? g._displayResult : g.result
    return result === 'win' || result === 'W'
  }).length
  const teamLosses = teamYearGames.filter(g => {
    const result = g._isFlippedPerspective ? g._displayResult : g.result
    return result === 'loss' || result === 'L'
  }).length

  // Get team record from conference standings (for teams without detailed game data)
  const getTeamRecordFromStandings = () => {
    const standingsByYear = currentDynasty.conferenceStandingsByYear || {}
    const yearStandings = standingsByYear[selectedYear] || {}

    // Search all conferences for this team
    for (const confTeams of Object.values(yearStandings)) {
      if (Array.isArray(confTeams)) {
        const teamData = confTeams.find(t => t && t.team === teamAbbr)
        if (teamData) {
          return {
            wins: teamData.wins || 0,
            losses: teamData.losses || 0,
            pointsFor: teamData.pointsFor || 0,
            pointsAgainst: teamData.pointsAgainst || 0
          }
        }
      }
    }
    return null
  }

  const standingsRecord = getTeamRecordFromStandings()

  // Get the last known opponent record from games where this team was the opponent
  // This gives us the most recent record entered by the user during game input
  // Uses perspective to find games where user played against this team
  const getLastKnownOpponentRecord = () => {
    const games = currentDynasty.games || []
    // Find games where this team was the opponent (not the user's team)
    const gamesAsOpponent = games
      .filter(g => Number(g.year) === Number(selectedYear))
      .map(g => {
        const perspective = getUserGamePerspective(g, currentDynasty)
        return perspective ? { ...g, perspective } : null
      })
      .filter(g => {
        if (!g || !g.opponentRecord) return false
        // Check if opponent is the team we're viewing (by tid or abbr)
        const opponentInfo = g.perspective?.opponentTid
          ? getGameTeamInfo(teams, g.perspective.opponentTid)
          : null
        const opponentAbbr = opponentInfo?.abbr || g.opponent
        return opponentAbbr === teamAbbr
      })
      .sort((a, b) => {
        // Sort by week/game order to get the most recent
        const getOrder = (g) => {
          if (g.isConferenceChampionship) return 15
          if (g.isBowlGame) return 16 + (parseInt(String(g.bowlWeek).replace('week', '') || '0'))
          if (g.isCFPFirstRound) return 20
          if (g.isCFPQuarterfinal) return 21
          if (g.isCFPSemifinal) return 22
          if (g.isCFPChampionship) return 23
          return g.week || 0
        }
        return getOrder(b) - getOrder(a) // Descending - most recent first
      })

    if (gamesAsOpponent.length === 0) return null

    const lastRecord = gamesAsOpponent[0].opponentRecord
    // Parse "5-2 (3-1)" format
    const recordMatch = lastRecord.match(/(\d+)-(\d+)\s*(?:\((\d+)-(\d+)\))?/)
    if (!recordMatch) return null

    return {
      wins: parseInt(recordMatch[1]),
      losses: parseInt(recordMatch[2]),
      confWins: recordMatch[3] ? parseInt(recordMatch[3]) : null,
      confLosses: recordMatch[4] ? parseInt(recordMatch[4]) : null,
      rawRecord: lastRecord,
      pointsFor: null,
      pointsAgainst: null
    }
  }

  const lastKnownRecord = getLastKnownOpponentRecord()

  // Aggregate team stats from games for this year where this team has boxScore.teamStats
  const getSeasonTeamStats = () => {
    const games = currentDynasty.games || []
    const stats = {
      gamesWithStats: 0,
      firstDowns: 0,
      totalOffense: 0,
      rushAttempts: 0,
      rushYards: 0,
      rushTds: 0,
      completions: 0,
      passAttempts: 0,
      passTds: 0,
      passYards: 0,
      thirdDownConv: 0,
      thirdDownAtt: 0,
      fourthDownConv: 0,
      fourthDownAtt: 0,
      twoPtConv: 0,
      twoPtAtt: 0,
      redZoneTd: 0,
      redZoneFg: 0,
      turnovers: 0,
      fumblesLost: 0,
      interceptions: 0,
      puntRetYards: 0,
      kickRetYards: 0,
      totalYards: 0,
      punts: 0,
      penalties: 0,
      possMinutes: 0,
      possSeconds: 0
    }

    games.forEach(game => {
      // Only count games from this year
      if (Number(game.year) !== selectedYear) return
      if (!game.boxScore?.teamStats) return

      // Check if this team's stats are in the home or away slot
      const homeAbbr = game.boxScore.teamStats.home?.teamAbbr?.toUpperCase()
      const awayAbbr = game.boxScore.teamStats.away?.teamAbbr?.toUpperCase()
      const targetAbbr = teamAbbr.toUpperCase()

      let teamStats = null
      if (homeAbbr === targetAbbr) {
        teamStats = game.boxScore.teamStats.home
      } else if (awayAbbr === targetAbbr) {
        teamStats = game.boxScore.teamStats.away
      }

      if (!teamStats) return

      stats.gamesWithStats++
      stats.firstDowns += teamStats.firstDowns || 0
      stats.totalOffense += teamStats.totalOffense || 0
      stats.rushAttempts += teamStats.rushAttempts || 0
      stats.rushYards += teamStats.rushYards || 0
      stats.rushTds += teamStats.rushTds || 0
      stats.completions += teamStats.completions || 0
      stats.passAttempts += teamStats.passAttempts || 0
      stats.passTds += teamStats.passTds || 0
      stats.passYards += teamStats.passYards || 0
      stats.thirdDownConv += teamStats['3rdDownConv'] || 0
      stats.thirdDownAtt += teamStats['3rdDownAtt'] || 0
      stats.fourthDownConv += teamStats['4thDownConv'] || 0
      stats.fourthDownAtt += teamStats['4thDownAtt'] || 0
      stats.twoPtConv += teamStats['2ptConv'] || 0
      stats.twoPtAtt += teamStats['2ptAtt'] || 0
      stats.redZoneTd += teamStats.redZoneTd || 0
      stats.redZoneFg += teamStats.redZoneFg || 0
      stats.turnovers += teamStats.turnovers || 0
      stats.fumblesLost += teamStats.fumblesLost || 0
      stats.interceptions += teamStats.interceptions || 0
      stats.puntRetYards += teamStats.puntRetYards || 0
      stats.kickRetYards += teamStats.kickRetYards || 0
      stats.totalYards += teamStats.totalYards || 0
      stats.punts += teamStats.punts || 0
      stats.penalties += teamStats.penalties || 0
      stats.possMinutes += teamStats.possMinutes || 0
      stats.possSeconds += teamStats.possSeconds || 0
    })

    return stats
  }

  const seasonStats = getSeasonTeamStats()

  // Determine which record to display
  // Priority: 1. Manual override, 2. Conference standings (end of year), 3. Calculated from games
  // Note: We NO LONGER use lastKnownRecord as it's misleading (shows record at time of game, not full season)
  const manualRecord = currentDynasty.teamRecordsByTeamYear?.[teamAbbr]?.[selectedYear]
  const displayRecord = (() => {
    // Manual override takes priority
    if (manualRecord) {
      return { wins: manualRecord.wins, losses: manualRecord.losses, pointsFor: null, pointsAgainst: null }
    }
    // Conference standings are the most authoritative (end of year data)
    if (standingsRecord) {
      return standingsRecord
    }
    // Fall back to calculating from games (for user's own team pages)
    if (teamYearGames.length > 0) {
      return { wins: teamWins, losses: teamLosses, pointsFor: null, pointsAgainst: null }
    }
    return null
  })()

  // Get team ratings for this year
  const teamRatings = currentDynasty.teamRatingsByTeamYear?.[teamAbbr]?.[selectedYear] || null

  // Get final poll rankings for this team in this year
  const getFinalPollRankings = () => {
    const pollsData = currentDynasty.finalPollsByYear?.[selectedYear]
    if (!pollsData) return null

    const mediaRank = pollsData.media?.find(p => p && p.team === teamAbbr)?.rank
    const coachesRank = pollsData.coaches?.find(p => p && p.team === teamAbbr)?.rank

    if (!mediaRank && !coachesRank) return null

    return {
      media: mediaRank || null,
      coaches: coachesRank || null
    }
  }

  const finalPollRanking = getFinalPollRankings()

  // Get all games array for unified lookups
  const allGamesArray = currentDynasty.games || []

  // Get conference championship data for this team in this year
  // UNIFIED: First check games[] array, then fallback to conferenceChampionshipsByYear
  const ccGamesFromGames = allGamesArray.filter(g =>
    g.isConferenceChampionship && Number(g.year) === selectedYear &&
    (g.team1 === teamAbbr || g.team2 === teamAbbr) &&
    g.team1Score !== null && g.team1Score !== undefined
  )

  // Fallback: Also check conferenceChampionshipsByYear for backward compatibility
  const yearChampionships = currentDynasty.conferenceChampionshipsByYear?.[selectedYear] || []
  const ccGamesFromLegacy = yearChampionships.filter(cc =>
    (cc.team1 === teamAbbr || cc.team2 === teamAbbr) &&
    cc.team1Score !== null && cc.team2Score !== null &&
    // Avoid duplicates - skip if already in games[]
    !ccGamesFromGames.some(g => g.conference === cc.conference)
  )

  // Use games[] version first, then legacy
  const teamCCGame = ccGamesFromGames[0] || ccGamesFromLegacy[0] || null
  const wonCC = teamCCGame?.winner === teamAbbr

  // Get bowl game for this team in this year
  // UNIFIED: First check games[] array, then fallback to bowlGamesByYear
  // Exclude CFP games - they have their own badges
  const bowlGamesFromGames = allGamesArray.filter(g =>
    g.isBowlGame && g.year === selectedYear &&
    (g.team1 === teamAbbr || g.team2 === teamAbbr) &&
    g.team1Score !== null && g.team1Score !== undefined &&
    !g.isCFPFirstRound && !g.isCFPQuarterfinal && !g.isCFPSemifinal && !g.isCFPChampionship &&
    g.gameType !== GAME_TYPES.CFP_FIRST_ROUND && g.gameType !== GAME_TYPES.CFP_QUARTERFINAL &&
    g.gameType !== GAME_TYPES.CFP_SEMIFINAL && g.gameType !== GAME_TYPES.CFP_CHAMPIONSHIP
  )

  // Fallback: Also check bowlGamesByYear for backward compatibility
  const yearBowlData = currentDynasty.bowlGamesByYear?.[selectedYear] || {}
  const bowlGamesFromLegacy = [...(yearBowlData.week1 || []), ...(yearBowlData.week2 || [])]
    .filter(bowl =>
      (bowl.team1 === teamAbbr || bowl.team2 === teamAbbr) &&
      bowl.team1Score !== null && bowl.team2Score !== null &&
      // Avoid duplicates - skip if already in games[]
      !bowlGamesFromGames.some(g => g.bowlName === bowl.bowlName)
    )

  const bowlGames = [...bowlGamesFromGames, ...bowlGamesFromLegacy]
  const teamBowlGame = bowlGames[0] // Just need the first match for this team

  const wonBowl = teamBowlGame && (
    (teamBowlGame.team1 === teamAbbr && teamBowlGame.team1Score > teamBowlGame.team2Score) ||
    (teamBowlGame.team2 === teamAbbr && teamBowlGame.team2Score > teamBowlGame.team1Score)
  )

  // Get CFP results for this team in this year from cfpResultsByYear
  const cfpResults = currentDynasty.cfpResultsByYear?.[selectedYear] || {}
  // Add round information AND slot ID to each game as we combine them
  // Use actual game data (seeds/bowl names) to determine slot ID, not array index
  const allCFPGames = [
    ...(cfpResults.firstRound || []).filter(g => g != null).map(g => ({
      ...g,
      round: 1,
      slotId: getFirstRoundSlotId(g.seed1, g.seed2) || 'cfpfr1'
    })),
    ...(cfpResults.quarterfinals || []).filter(g => g != null).map(g => ({
      ...g,
      round: 2,
      slotId: getSlotIdFromBowlName(g.bowlName) || 'cfpqf1'
    })),
    ...(cfpResults.semifinals || []).filter(g => g != null).map(g => ({
      ...g,
      round: 3,
      slotId: getSlotIdFromBowlName(g.bowlName) || 'cfpsf1'
    })),
    ...(cfpResults.championship ? [{ ...cfpResults.championship, round: 4, slotId: 'cfpnc' }] : [])
  ]

  // Find all CFP games involving this team - check both tid and abbr
  const teamCFPGamesFromResults = allCFPGames.filter(game =>
    (game.team1Tid === tid || game.team1 === teamAbbr || game.team2Tid === tid || game.team2 === teamAbbr) &&
    game.team1Score !== null && game.team2Score !== null
  ).sort((a, b) => a.round - b.round)

  // Determine CFP result for this team - check unified games[] array first, then legacy cfpResultsByYear
  const getCFPResult = () => {
    // Get CFP games from unified games[] array
    const unifiedChampGames = getGamesByType(currentDynasty, GAME_TYPES.CFP_CHAMPIONSHIP, selectedYear)
    const unifiedSFGames = getGamesByType(currentDynasty, GAME_TYPES.CFP_SEMIFINAL, selectedYear)
    const unifiedQFGames = getGamesByType(currentDynasty, GAME_TYPES.CFP_QUARTERFINAL, selectedYear)
    const unifiedFRGames = getGamesByType(currentDynasty, GAME_TYPES.CFP_FIRST_ROUND, selectedYear)

    // Helper to check if game involves this team (supports both tid and abbr)
    const gameInvolvesTeam = (g) => g && (g.team1Tid === tid || g.team1 === teamAbbr || g.team2Tid === tid || g.team2 === teamAbbr)
    const teamWonGame = (g) => g && (g.winnerTid === tid || g.winner === teamAbbr)

    // Check championship first - unified games array, then legacy
    const champGame = unifiedChampGames.find(gameInvolvesTeam) ||
                      (cfpResults.championship && gameInvolvesTeam(cfpResults.championship) ? cfpResults.championship : null)
    if (champGame) {
      const wonChamp = teamWonGame(champGame)
      return wonChamp ? 'champion' : 'lost-championship'
    }

    // Check semifinals - unified games array, then legacy
    const sfGame = unifiedSFGames.find(gameInvolvesTeam) ||
                   (cfpResults.semifinals || []).find(gameInvolvesTeam)
    if (sfGame) {
      const wonSF = teamWonGame(sfGame)
      if (!wonSF) return 'lost-semifinal'
    }

    // Check quarterfinals - unified games array, then legacy
    const qfGame = unifiedQFGames.find(gameInvolvesTeam) ||
                   (cfpResults.quarterfinals || []).find(gameInvolvesTeam)
    if (qfGame) {
      const wonQF = teamWonGame(qfGame)
      if (!wonQF) return 'lost-quarterfinal'
    }

    // Check first round - unified games array, then legacy
    const frGame = unifiedFRGames.find(gameInvolvesTeam) ||
                   (cfpResults.firstRound || []).find(gameInvolvesTeam)
    if (frGame) {
      const wonFR = teamWonGame(frGame)
      if (!wonFR) return 'lost-first-round'
    }

    // No CFP participation
    if (teamCFPGamesFromResults.length === 0 &&
        unifiedChampGames.length === 0 && unifiedSFGames.length === 0 &&
        unifiedQFGames.length === 0 && unifiedFRGames.length === 0) {
      return null
    }

    return null
  }

  const cfpResult = getCFPResult()

  // Legacy: Get CFP games from cfpGamesByYear (older format)
  const cfpGames = currentDynasty.cfpGamesByYear?.[selectedYear] || []
  const teamCFPGames = cfpGames.filter(game =>
    (game.team1Tid === tid || game.team1 === teamAbbr || game.team2Tid === tid || game.team2 === teamAbbr) && game.team1Score !== null && game.team2Score !== null
  ).sort((a, b) => (a.round || 0) - (b.round || 0))

  // Find players associated with this team for the selected year
  // Uses the unified isPlayerOnRoster() helper - teamsByYear is the source of truth
  const allPlayers = currentDynasty.players || []

  // DEBUG: Log player count and first few players
  if (!window._debuggedTeamYear) {
    window._debuggedTeamYear = true
    console.log(`[TeamYear] Total players in dynasty: ${allPlayers.length}, teamAbbr: ${teamAbbr}, selectedYear: ${selectedYear}`)
    allPlayers.slice(0, 3).forEach((p, i) => {
      console.log(`[TeamYear] Player ${i}: ${p.name}, teamsByYear:`, p.teamsByYear)
    })
  }

  const teamPlayers = allPlayers.filter(p =>
    isPlayerOnRoster(p, teamAbbr, selectedYear)
  )


  // Calculate vs user record
  // Use perspective for win/loss (vsUserGames already has perspective attached)
  const vsUserWins = vsUserGames.filter(g => g.perspective?.userWon).length
  const vsUserLosses = vsUserGames.filter(g => g.perspective && !g.perspective.userWon).length

  // Sort roster based on current sort settings
  const posOrder = [
    'QB', 'HB', 'FB', 'WR', 'TE',
    'LT', 'LG', 'C', 'RG', 'RT', 'OT', 'OG',
    'LE', 'RE', 'LEDG', 'REDG', 'EDGE', 'DT',
    'LOLB', 'MLB', 'ROLB', 'SAM', 'MIKE', 'WILL', 'OLB', 'LB',
    'CB', 'FS', 'SS', 'S', 'K', 'P'
  ]

  // Class order for sorting (RS Sr is highest/most senior)
  const classOrder = {
    'RS Sr': 0, 'Sr': 1, 'RS Jr': 2, 'Jr': 3,
    'RS So': 4, 'So': 5, 'RS Fr': 6, 'Fr': 7
  }

  // Dev trait order for sorting (Elite is best)
  const devTraitOrder = {
    'Elite': 0, 'Star': 1, 'Impact': 2, 'Normal': 3
  }

  const handleRosterSort = (sortKey) => {
    if (rosterSort === sortKey) {
      // Toggle direction if same key
      setRosterSortDir(rosterSortDir === 'asc' ? 'desc' : 'asc')
    } else {
      // New sort key - set appropriate default direction
      setRosterSort(sortKey)
      // Default to desc for overall and devTrait (best first), asc for class (seniors first)
      setRosterSortDir((sortKey === 'overall' || sortKey === 'devTrait') ? 'desc' : 'asc')
    }
  }

  const handleRosterSave = async (players) => {
    await saveRoster(currentDynasty.id, players, { teamAbbr, year: selectedYear })
    setShowRosterModal(false)
  }

  const sortedTeamPlayers = [...teamPlayers].sort((a, b) => {
    let result = 0
    switch (rosterSort) {
      case 'overall':
        result = (b.overall || 0) - (a.overall || 0)
        break
      case 'jerseyNumber':
        const numA = parseInt(a.jerseyNumber) || 999
        const numB = parseInt(b.jerseyNumber) || 999
        result = numA - numB
        break
      case 'name':
        result = (a.name || '').localeCompare(b.name || '')
        break
      case 'class':
        const classA = classOrder[a.year] ?? 99
        const classB = classOrder[b.year] ?? 99
        result = classA - classB
        break
      case 'devTrait':
        const devA = devTraitOrder[a.devTrait] ?? 99
        const devB = devTraitOrder[b.devTrait] ?? 99
        result = devA - devB
        break
      case 'position':
      default:
        const aPos = posOrder.indexOf(a.position)
        const bPos = posOrder.indexOf(b.position)
        if (aPos !== bPos) {
          result = aPos - bPos
        } else {
          result = (b.overall || 0) - (a.overall || 0)
        }
        break
    }
    return rosterSortDir === 'desc' ? -result : result
  })

  // Position groups for filtering (depth chart style)
  const positionGroups = {
    'all': { label: 'All', positions: null },
    'QB': { label: 'QB', positions: ['QB'] },
    'RB': { label: 'RB', positions: ['HB', 'FB'] },
    'WR': { label: 'WR', positions: ['WR'] },
    'TE': { label: 'TE', positions: ['TE'] },
    'OL': { label: 'OL', positions: ['LT', 'LG', 'C', 'RG', 'RT'] },
    'DL': { label: 'DL', positions: ['LE', 'RE', 'DT', 'EDGE', 'LEDG', 'REDG'] },
    'LB': { label: 'LB', positions: ['LOLB', 'MLB', 'ROLB', 'WILL', 'MIKE', 'SAM', 'LB', 'OLB', 'ILB'] },
    'DB': { label: 'DB', positions: ['CB', 'FS', 'SS'] },
    'K/P': { label: 'K/P', positions: ['K', 'P'] },
  }

  // Filter players by position group
  const filteredTeamPlayers = positionFilter === 'all'
    ? sortedTeamPlayers
    : sortedTeamPlayers.filter(p => positionGroups[positionFilter]?.positions?.includes(p.position))

  // Handle edit game click - opens GameEntryModal
  const handleEditGame = (game) => {
    // CPU games are identified by having viewingTeam set, or by having team1/team2 but no userTeam
    const isCPUGame = !!game.viewingTeam || (!game.userTeam && game.team1 && game.team2)

    if (isCPUGame) {
      // CPU vs CPU game - pass both teams and existing data
      setEditingGameData({
        team1: game.viewingTeamAbbr,
        team2: game.opponent,
        bowlName: game.bowlName || game.gameTitle,
        gameType: game.isBowlGame ? 'bowl' : game.isConferenceChampionship ? 'cc' : 'cfp',
        isUserGame: false,
        existingTeam1Score: game.teamScore,
        existingTeam2Score: game.opponentScore,
        existingGameNote: game.gameNote || '',
        existingLinks: game.links || '',
        gameRef: game.gameRef // Reference to the full game object in games[] for updating
      })
    } else {
      // User's game - pass the full game for editing
      setEditingGameData({
        opponent: game.opponent,
        bowlName: game.bowlName || game.gameTitle,
        existingGame: game,
        isUserGame: true
      })
    }

    setShowEditModal(true)
  }

  // Handle game save from GameEntryModal
  const handleGameSave = async (gameData) => {
    try {
      // CPU games are identified by having team1/team2 but no userTeam
      const isCPUGame = gameData.team1 && gameData.team2 && !gameData.userTeam
      if (isCPUGame) {
        // CPU vs CPU game - save to unified games[] array
        const gameType = editingGameData.gameType

        if (gameType === 'bowl') {
          // UNIFIED: Save to games[] array
          const existingGames = currentDynasty.games || []
          const gameRef = editingGameData.gameRef

          // Find the game in games[] by ID or by bowlName + year
          const gameIndex = existingGames.findIndex(g =>
            g.id === gameRef?.id ||
            (g.isBowlGame && g.bowlName === editingGameData.bowlName && g.year === selectedYear)
          )

          if (gameIndex >= 0) {
            const originalGame = existingGames[gameIndex]

            // CRITICAL: Match incoming teams to original team order
            // The editor might show teams in a different order than stored
            const incomingTeam1 = gameData.team1
            const incomingTeam2 = gameData.team2
            const incomingTeam1Score = parseInt(gameData.team1Score)
            const incomingTeam2Score = parseInt(gameData.team2Score)

            // Determine if the incoming team1 matches the original team1 or team2
            const team1MatchesOriginal = incomingTeam1 === originalGame.team1
            const team2MatchesOriginal = incomingTeam2 === originalGame.team1

            // Map scores to original team order
            let originalTeam1Score, originalTeam2Score
            if (team1MatchesOriginal) {
              // Incoming order matches original order
              originalTeam1Score = incomingTeam1Score
              originalTeam2Score = incomingTeam2Score
            } else if (team2MatchesOriginal) {
              // Incoming order is reversed from original
              originalTeam1Score = incomingTeam2Score
              originalTeam2Score = incomingTeam1Score
            } else {
              // Fallback - use incoming order (shouldn't happen)
              originalTeam1Score = incomingTeam1Score
              originalTeam2Score = incomingTeam2Score
            }

            const winner = originalTeam1Score > originalTeam2Score
              ? originalGame.team1 : originalGame.team2
            const winnerIsTeam1 = winner === originalGame.team1

            const updatedGame = {
              ...originalGame,
              team1Score: originalTeam1Score,
              team2Score: originalTeam2Score,
              winner: winner,
              viewingTeamAbbr: winner,
              opponent: winnerIsTeam1 ? originalGame.team2 : originalGame.team1,
              teamScore: winnerIsTeam1 ? originalTeam1Score : originalTeam2Score,
              opponentScore: winnerIsTeam1 ? originalTeam2Score : originalTeam1Score,
              result: 'win',
              gameNote: gameData.gameNote || '',
              links: gameData.links || '',
              updatedAt: new Date().toISOString()
            }

            const updatedGames = [...existingGames]
            updatedGames[gameIndex] = updatedGame
            await updateDynasty(currentDynasty.id, { games: updatedGames })
          }
        } else if (gameType === 'cc') {
          // UNIFIED: Save to games[] array (like bowl games)
          const existingGames = currentDynasty.games || []
          const gameRef = editingGameData.gameRef

          // Find the game in games[] by ID or by conference + year
          const gameIndex = existingGames.findIndex(g =>
            g.id === gameRef?.id ||
            (g.isConferenceChampionship && g.conference === editingGameData.bowlName && Number(g.year) === selectedYear)
          )

          if (gameIndex >= 0) {
            const originalGame = existingGames[gameIndex]

            // CRITICAL: Match incoming teams to original team order
            const incomingTeam1 = gameData.team1
            const incomingTeam2 = gameData.team2
            const incomingTeam1Score = parseInt(gameData.team1Score)
            const incomingTeam2Score = parseInt(gameData.team2Score)

            // Determine if the incoming team1 matches the original team1 or team2
            const team1MatchesOriginal = incomingTeam1 === originalGame.team1
            const team2MatchesOriginal = incomingTeam2 === originalGame.team1

            // Map scores to original team order
            let originalTeam1Score, originalTeam2Score
            if (team1MatchesOriginal) {
              originalTeam1Score = incomingTeam1Score
              originalTeam2Score = incomingTeam2Score
            } else if (team2MatchesOriginal) {
              originalTeam1Score = incomingTeam2Score
              originalTeam2Score = incomingTeam1Score
            } else {
              originalTeam1Score = incomingTeam1Score
              originalTeam2Score = incomingTeam2Score
            }

            const winner = originalTeam1Score > originalTeam2Score
              ? originalGame.team1 : originalGame.team2
            const winnerIsTeam1 = winner === originalGame.team1

            const updatedGame = {
              ...originalGame,
              team1Score: originalTeam1Score,
              team2Score: originalTeam2Score,
              winner: winner,
              viewingTeamAbbr: winner,
              opponent: winnerIsTeam1 ? originalGame.team2 : originalGame.team1,
              teamScore: winnerIsTeam1 ? originalTeam1Score : originalTeam2Score,
              opponentScore: winnerIsTeam1 ? originalTeam2Score : originalTeam1Score,
              result: 'win',
              gameNote: gameData.gameNote || '',
              links: gameData.links || '',
              updatedAt: new Date().toISOString()
            }

            const updatedGames = [...existingGames]
            updatedGames[gameIndex] = updatedGame
            await updateDynasty(currentDynasty.id, { games: updatedGames })
          } else {
            // Fallback: Save to conferenceChampionshipsByYear for legacy data
            const existingByYear = currentDynasty.conferenceChampionshipsByYear || {}
            const existingYear = existingByYear[selectedYear] || []

            const ccIndex = existingYear.findIndex(g =>
              (g.team1 === gameData.team1 && g.team2 === gameData.team2) ||
              (g.team1 === gameData.team2 && g.team2 === gameData.team1)
            )

            const newGame = {
              ...existingYear[ccIndex],
              team1: gameData.team1,
              team2: gameData.team2,
              team1Score: parseInt(gameData.team1Score),
              team2Score: parseInt(gameData.team2Score),
              winner: gameData.winner,
              gameNote: gameData.gameNote || '',
              links: gameData.links || ''
            }

            const newYear = [...existingYear]
            if (ccIndex >= 0) {
              newYear[ccIndex] = newGame
            } else {
              newYear.push(newGame)
            }

            await updateDynasty(currentDynasty.id, {
              conferenceChampionshipsByYear: {
                ...existingByYear,
                [selectedYear]: newYear
              }
            })
          }
        }
        // CFP games would be handled similarly if needed
      } else {
        // User's game - use addGame
        await addGame(currentDynasty.id, {
          ...gameData,
          year: selectedYear
        })
      }

      setShowEditModal(false)
      setEditingGameData(null)
    } catch (error) {
      console.error('Error saving game:', error)
    }
  }

  return (
    <div className="space-y-6">
      {/* Navigation Row */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-3">
        {/* Left side: History and Stats buttons */}
        <div className="flex items-center gap-2">
          {/* History Link */}
          <Link
            to={`${pathPrefix}/team/${tid}`}
            className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-opacity text-sm sm:text-base"
            style={{
              backgroundColor: teamInfo.backgroundColor,
              color: teamBgText,
              border: `2px solid ${teamBgText}40`
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            History
          </Link>

          {/* Stats Button - only show if we have team stats from games for this year */}
          {seasonStats.gamesWithStats > 0 && (
            <Link
              to={`${pathPrefix}/team-stats/${tid}/${selectedYear}`}
              className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-opacity text-sm sm:text-base"
              style={{
                backgroundColor: teamInfo.backgroundColor,
                color: teamBgText,
                border: `2px solid ${teamBgText}40`
              }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Stats
            </Link>
          )}
        </div>

        {/* Right side: Team and Year dropdowns */}
        <div className="flex items-center gap-2 sm:ml-auto">
          {/* Team Dropdown */}
          <select
            value={tid}
            onChange={(e) => navigate(`${pathPrefix}/team/${e.target.value}/${selectedYear}`)}
            className="flex-1 sm:flex-none px-2 sm:px-3 py-2 rounded-lg font-semibold cursor-pointer focus:outline-none focus:ring-2 text-sm sm:text-base"
            style={{
              backgroundColor: teamInfo.backgroundColor,
              color: teamBgText,
              border: `2px solid ${teamBgText}40`
            }}
          >
            {allTeams.map((t) => (
              <option key={t.tid} value={t.tid}>
                {t.name}
              </option>
            ))}
          </select>

          {/* Year Dropdown */}
          <select
            value={selectedYear}
            onChange={(e) => navigate(`${pathPrefix}/team/${tid}/${e.target.value}`)}
            className="px-2 sm:px-3 py-2 rounded-lg font-semibold cursor-pointer focus:outline-none focus:ring-2 text-sm sm:text-base"
            style={{
              backgroundColor: teamInfo.backgroundColor,
              color: teamBgText,
              border: `2px solid ${teamBgText}40`
            }}
          >
            {availableYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          {/* Edit Team Info Button */}
          {!isViewOnly && (
            <button
              onClick={() => {
                setEditWins(displayRecord?.wins?.toString() || '')
                setEditLosses(displayRecord?.losses?.toString() || '')
                setEditConference(currentDynasty.conferenceByTeamYear?.[teamAbbr]?.[selectedYear] || conference || '')
                setShowTeamEditModal(true)
              }}
              className="p-2 rounded-lg transition-colors hover:scale-105"
              style={{
                backgroundColor: teamInfo.backgroundColor,
                color: teamBgText,
                border: `2px solid ${teamBgText}40`
              }}
              title="Edit Team Info"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Team Header */}
      <div
        className="rounded-lg shadow-lg p-4 sm:p-6"
        style={{
          backgroundColor: teamInfo.backgroundColor,
          border: `3px solid ${teamInfo.textColor}`
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          {/* Mobile: Logo + Ratings + Record Row */}
          <div className="flex items-center justify-between sm:hidden">
            {teamLogo && (
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
                style={{
                  backgroundColor: '#FFFFFF',
                  border: `3px solid ${teamInfo.textColor}`,
                  padding: '3px'
                }}
              >
                <img
                  src={teamLogo}
                  alt={`${teamInfo.name} logo`}
                  className="w-full h-full object-contain"
                />
              </div>
            )}
            <div className="flex items-center gap-3">
              {/* Team Ratings (mobile) */}
              {teamRatings && (
                <div className="flex gap-1 bg-black/20 rounded-lg px-2 py-1">
                  <div className="text-center px-2">
                    <div className="text-lg font-bold" style={{ color: teamBgText }}>
                      {teamRatings.overall}
                    </div>
                    <div className="text-[10px] font-semibold uppercase" style={{ color: teamBgText, opacity: 0.7 }}>
                      OVR
                    </div>
                  </div>
                  <div className="text-center px-2 border-l border-white/20">
                    <div className="text-lg font-bold" style={{ color: teamBgText }}>
                      {teamRatings.offense}
                    </div>
                    <div className="text-[10px] font-semibold uppercase" style={{ color: teamBgText, opacity: 0.7 }}>
                      OFF
                    </div>
                  </div>
                  <div className="text-center px-2 border-l border-white/20">
                    <div className="text-lg font-bold" style={{ color: teamBgText }}>
                      {teamRatings.defense}
                    </div>
                    <div className="text-[10px] font-semibold uppercase" style={{ color: teamBgText, opacity: 0.7 }}>
                      DEF
                    </div>
                  </div>
                </div>
              )}
              {/* Season Record (mobile) */}
              {displayRecord && (
                <div
                  className="text-right relative"
                  onMouseEnter={() => setShowRecordTooltip(true)}
                  onMouseLeave={() => setShowRecordTooltip(false)}
                  onClick={() => setShowRecordTooltip(!showRecordTooltip)}
                >
                  <div
                    className="text-2xl font-bold cursor-pointer"
                    style={{ color: teamBgText }}
                  >
                    {displayRecord.wins}-{displayRecord.losses}
                  </div>
                  <div className="text-xs font-semibold" style={{ color: teamBgText, opacity: 0.7 }}>
                    Record
                  </div>
                  {/* Points Tooltip */}
                  {showRecordTooltip && displayRecord.pointsFor !== null && (
                    <div
                      className="absolute right-0 top-full mt-2 p-3 rounded-lg shadow-lg z-50 min-w-36 text-left"
                      style={{
                        backgroundColor: teamInfo.textColor,
                        border: `2px solid ${teamBgText}40`
                      }}
                    >
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between gap-4">
                          <span style={{ color: teamPrimaryText, opacity: 0.7 }}>Points For:</span>
                          <span className="font-bold" style={{ color: teamPrimaryText }}>{displayRecord.pointsFor}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span style={{ color: teamPrimaryText, opacity: 0.7 }}>Points Against:</span>
                          <span className="font-bold" style={{ color: teamPrimaryText }}>{displayRecord.pointsAgainst}</span>
                        </div>
                        <div className="flex justify-between gap-4 pt-1 border-t" style={{ borderColor: `${teamPrimaryText}30` }}>
                          <span style={{ color: teamPrimaryText, opacity: 0.7 }}>Diff:</span>
                          <span
                            className="font-bold"
                            style={{
                              color: displayRecord.pointsFor - displayRecord.pointsAgainst > 0
                                ? '#16a34a'
                                : displayRecord.pointsFor - displayRecord.pointsAgainst < 0
                                  ? '#dc2626'
                                  : teamPrimaryText
                            }}
                          >
                            {displayRecord.pointsFor - displayRecord.pointsAgainst > 0 ? '+' : ''}
                            {displayRecord.pointsFor - displayRecord.pointsAgainst}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Desktop: Logo */}
          {teamLogo && (
            <div
              className="hidden sm:flex w-20 h-20 rounded-full items-center justify-center flex-shrink-0"
              style={{
                backgroundColor: '#FFFFFF',
                border: `3px solid ${teamInfo.textColor}`,
                padding: '4px'
              }}
            >
              <img
                src={teamLogo}
                alt={`${teamInfo.name} logo`}
                className="w-full h-full object-contain"
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs sm:text-sm font-semibold uppercase tracking-wide" style={{ color: teamBgText, opacity: 0.7 }}>
              {selectedYear} Season
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Final Poll Ranking Badge */}
              {finalPollRanking && (
                <div
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-bold"
                  style={{
                    backgroundColor: '#fbbf24',
                    color: '#78350f'
                  }}
                  title={`Final Ranking: ${finalPollRanking.media ? `AP #${finalPollRanking.media}` : ''}${finalPollRanking.media && finalPollRanking.coaches ? ' / ' : ''}${finalPollRanking.coaches ? `Coaches #${finalPollRanking.coaches}` : ''}`}
                >
                  #{finalPollRanking.media || finalPollRanking.coaches}
                </div>
              )}
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold truncate" style={{ color: teamBgText }}>
                {mascotName || teamInfo.name}
              </h1>
              {/* Coaching Staff Info Icon - show for any team/year with coaching staff data */}
              {(teamCoachingStaff?.hcName || teamCoachingStaff?.ocName || teamCoachingStaff?.dcName) && (
                <div className="relative">
                  <button
                    onClick={() => setShowCoachingStaffTooltip(!showCoachingStaffTooltip)}
                    onMouseEnter={() => setShowCoachingStaffTooltip(true)}
                    onMouseLeave={() => setShowCoachingStaffTooltip(false)}
                    className="w-5 h-5 rounded-full flex items-center justify-center hover:opacity-80 transition-opacity"
                    style={{
                      backgroundColor: `${teamBgText}20`,
                      color: teamBgText
                    }}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                  {/* Coaching Staff Tooltip */}
                  {showCoachingStaffTooltip && (
                    <div
                      className="fixed sm:absolute left-4 right-4 sm:left-0 sm:right-auto top-auto sm:top-full mt-2 p-3 rounded-lg shadow-lg z-50 sm:min-w-48 sm:max-w-64"
                      style={{
                        backgroundColor: teamInfo.textColor,
                        border: `2px solid ${teamBgText}40`
                      }}
                      onMouseEnter={() => setShowCoachingStaffTooltip(true)}
                      onMouseLeave={() => setShowCoachingStaffTooltip(false)}
                    >
                      <div className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: teamPrimaryText, opacity: 0.7 }}>
                        {selectedYear} Coaching Staff
                      </div>
                      <div className="space-y-1">
                        {/* Show HC */}
                        {teamCoachingStaff?.hcName && (
                          <div className="text-sm font-semibold truncate" style={{ color: teamPrimaryText }}>
                            HC: {teamCoachingStaff.hcName}
                          </div>
                        )}
                        {/* Show OC */}
                        {teamCoachingStaff?.ocName && (
                          <div className="text-sm font-semibold truncate" style={{ color: teamPrimaryText }}>
                            OC: {teamCoachingStaff.ocName}
                          </div>
                        )}
                        {/* Show DC */}
                        {teamCoachingStaff?.dcName && (
                          <div className="text-sm font-semibold truncate" style={{ color: teamPrimaryText }}>
                            DC: {teamCoachingStaff.dcName}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            {conference && (
              <div className="flex items-center gap-2 mt-1">
                {conferenceLogo && (
                  <img
                    src={conferenceLogo}
                    alt={`${conference} logo`}
                    className="w-5 h-5 object-contain"
                  />
                )}
                <span className="text-sm font-semibold" style={{ color: teamBgText, opacity: 0.8 }}>
                  {conference}
                </span>
              </div>
            )}
            {/* Postseason Result Badge - all CFP badges link to CFP Bracket */}
            {cfpResult === 'champion' && (
              <Link
                to={`${pathPrefix}/cfp-bracket/${selectedYear}`}
                className="inline-flex items-center gap-2 mt-2 px-3 py-1.5 rounded-full text-sm font-bold hover:opacity-90 transition-opacity cursor-pointer"
                style={{
                  background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                  color: '#78350f',
                  boxShadow: '0 2px 8px rgba(251, 191, 36, 0.4)'
                }}
              >
                <img
                  src="https://i.imgur.com/3goz1NK.png"
                  alt="National Champions Trophy"
                  className="w-5 h-5 object-contain"
                />
                National Champions
              </Link>
            )}
            {cfpResult === 'lost-championship' && (
              <Link
                to={`${pathPrefix}/cfp-bracket/${selectedYear}`}
                className="inline-flex items-center gap-1.5 mt-2 px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-bold hover:opacity-90 transition-opacity cursor-pointer"
                style={{ backgroundColor: '#c0c0c0', color: '#1f2937' }}
              >
                🥈 Championship Game
              </Link>
            )}
            {cfpResult === 'lost-semifinal' && (
              <Link
                to={`${pathPrefix}/cfp-bracket/${selectedYear}`}
                className="inline-flex items-center gap-1.5 mt-2 px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-bold hover:opacity-90 transition-opacity cursor-pointer"
                style={{ backgroundColor: '#d1d5db', color: '#374151' }}
              >
                Made CFP Semifinals
              </Link>
            )}
            {cfpResult === 'lost-quarterfinal' && (
              <Link
                to={`${pathPrefix}/cfp-bracket/${selectedYear}`}
                className="inline-flex items-center gap-1.5 mt-2 px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-bold hover:opacity-90 transition-opacity cursor-pointer"
                style={{ backgroundColor: '#e5e7eb', color: '#4b5563' }}
              >
                Made CFP Quarterfinals
              </Link>
            )}
            {cfpResult === 'lost-first-round' && (
              <Link
                to={`${pathPrefix}/cfp-bracket/${selectedYear}`}
                className="inline-flex items-center gap-1.5 mt-2 px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-bold hover:opacity-90 transition-opacity cursor-pointer"
                style={{ backgroundColor: '#f3f4f6', color: '#6b7280' }}
              >
                Made CFP First Round
              </Link>
            )}
            {/* Bowl Game Result (only if not in CFP) - clickable link to game */}
            {!cfpResult && teamBowlGame && (() => {
              const bowlGameId = teamBowlGame.id || `bowl-${selectedYear}-${(teamBowlGame.bowlName || 'bowl').toLowerCase().replace(/\s+/g, '-')}`
              return (
                <Link
                  to={`${pathPrefix}/game/${bowlGameId}`}
                  className="inline-flex items-center gap-1.5 mt-2 px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-bold hover:opacity-90 transition-opacity cursor-pointer"
                  style={{
                    backgroundColor: wonBowl ? '#16a34a' : '#dc2626',
                    color: '#ffffff'
                  }}
                >
                  {bowlLogos[teamBowlGame.bowlName] && (
                    <img
                      src={bowlLogos[teamBowlGame.bowlName]}
                      alt=""
                      className="w-4 h-4 object-contain"
                    />
                  )}
                  {wonBowl ? 'Won' : 'Lost'} {teamBowlGame.bowlName}
                </Link>
              )
            })()}
            {/* Conference Championship Badge - only show for winners, clickable link to game */}
            {teamCCGame && wonCC && (() => {
              const ccGameId = teamCCGame.id || `cc-${selectedYear}-${(teamCCGame.conference || 'cc').toLowerCase().replace(/\s+/g, '-')}`
              return (
                <Link
                  to={`${pathPrefix}/game/${ccGameId}`}
                  className="inline-flex items-center gap-1 sm:gap-2 mt-2 sm:ml-2 px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-bold hover:opacity-90 transition-opacity cursor-pointer"
                  style={{
                    backgroundColor: '#fbbf24',
                    color: '#78350f'
                  }}
                >
                  {getConferenceLogo(teamCCGame.conference) && (
                    <img
                      src={getConferenceLogo(teamCCGame.conference)}
                      alt=""
                      className="w-4 h-4 object-contain"
                    />
                  )}
                  {teamCCGame.conference} Champions
                </Link>
              )
            })()}
            {/* Bowl Game Badge - only show clickable version if in CFP (otherwise shown above) */}
            {cfpResult && teamBowlGame && (() => {
              const bowlGameId = teamBowlGame.id || `bowl-${selectedYear}-${(teamBowlGame.bowlName || 'bowl').toLowerCase().replace(/\s+/g, '-')}`
              return (
                <Link
                  to={`${pathPrefix}/game/${bowlGameId}`}
                  className="inline-flex items-center gap-1 sm:gap-1.5 mt-2 sm:ml-2 px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-bold hover:opacity-90 transition-opacity cursor-pointer"
                  style={{
                    backgroundColor: wonBowl ? '#16a34a' : '#dc2626',
                    color: '#ffffff'
                  }}
                >
                  {bowlLogos[teamBowlGame.bowlName] && (
                    <img
                      src={bowlLogos[teamBowlGame.bowlName]}
                      alt=""
                      className="w-3 h-3 sm:w-4 sm:h-4 object-contain"
                    />
                  )}
                  <span className="truncate max-w-[120px] sm:max-w-none">{teamBowlGame.bowlName || 'Bowl Game'}{wonBowl ? ' Champion' : ''}</span>
                </Link>
              )
            })()}
          </div>

          {/* Ratings and Record Section (desktop only - mobile shown above) */}
          <div className="hidden sm:flex items-center gap-6">
            {/* Team Ratings (desktop) */}
            {teamRatings && (
              <div className="flex bg-black/20 rounded-lg px-3 py-2">
                <div className="text-center px-3">
                  <div className="text-2xl md:text-3xl font-bold" style={{ color: teamBgText }}>
                    {teamRatings.overall}
                  </div>
                  <div className="text-xs font-semibold uppercase" style={{ color: teamBgText, opacity: 0.7 }}>
                    OVR
                  </div>
                </div>
                <div className="text-center px-3 border-l border-white/20">
                  <div className="text-2xl md:text-3xl font-bold" style={{ color: teamBgText }}>
                    {teamRatings.offense}
                  </div>
                  <div className="text-xs font-semibold uppercase" style={{ color: teamBgText, opacity: 0.7 }}>
                    OFF
                  </div>
                </div>
                <div className="text-center px-3 border-l border-white/20">
                  <div className="text-2xl md:text-3xl font-bold" style={{ color: teamBgText }}>
                    {teamRatings.defense}
                  </div>
                  <div className="text-xs font-semibold uppercase" style={{ color: teamBgText, opacity: 0.7 }}>
                    DEF
                  </div>
                </div>
              </div>
            )}
            {/* Season Record (desktop) */}
            {displayRecord && (
              <div
                className="text-right relative"
                onMouseEnter={() => setShowRecordTooltip(true)}
                onMouseLeave={() => setShowRecordTooltip(false)}
              >
                <div
                  className="text-3xl md:text-4xl font-bold cursor-pointer"
                  style={{ color: teamBgText }}
                >
                  {displayRecord.wins}-{displayRecord.losses}
                </div>
                <div className="text-sm font-semibold" style={{ color: teamBgText, opacity: 0.7 }}>
                  Record
                </div>
                {/* Points Tooltip */}
                {showRecordTooltip && displayRecord.pointsFor !== null && (
                  <div
                    className="absolute right-0 top-full mt-2 p-3 rounded-lg shadow-lg z-50 min-w-44 text-left"
                    style={{
                      backgroundColor: teamInfo.textColor,
                      border: `2px solid ${teamBgText}40`
                    }}
                  >
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between gap-6">
                        <span style={{ color: teamPrimaryText, opacity: 0.7 }}>Points For:</span>
                        <span className="font-bold" style={{ color: teamPrimaryText }}>{displayRecord.pointsFor}</span>
                      </div>
                      <div className="flex justify-between gap-6">
                        <span style={{ color: teamPrimaryText, opacity: 0.7 }}>Points Against:</span>
                        <span className="font-bold" style={{ color: teamPrimaryText }}>{displayRecord.pointsAgainst}</span>
                      </div>
                      <div className="flex justify-between gap-6 pt-1.5 border-t" style={{ borderColor: `${teamPrimaryText}30` }}>
                        <span style={{ color: teamPrimaryText, opacity: 0.7 }}>Diff:</span>
                        <span
                          className="font-bold"
                          style={{
                            color: displayRecord.pointsFor - displayRecord.pointsAgainst > 0
                              ? '#16a34a'
                              : displayRecord.pointsFor - displayRecord.pointsAgainst < 0
                                ? '#dc2626'
                                : teamPrimaryText
                          }}
                        >
                          {displayRecord.pointsFor - displayRecord.pointsAgainst > 0 ? '+' : ''}
                          {displayRecord.pointsFor - displayRecord.pointsAgainst}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Award Winners Section */}
      {(() => {
        const yearAwards = currentDynasty.awardsByYear?.[selectedYear] || {}
        const teamAwardWinners = Object.entries(yearAwards)
          .filter(([key, data]) => data.team === teamAbbr)
          .map(([key, data]) => ({
            awardKey: key,
            awardName: AWARD_DISPLAY[key] || key,
            ...data
          }))
          .sort((a, b) => {
            const aIndex = AWARD_ORDER.indexOf(a.awardKey)
            const bIndex = AWARD_ORDER.indexOf(b.awardKey)
            return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex)
          })

        if (teamAwardWinners.length === 0) return null

        return (
          <div
            className="rounded-lg shadow-lg overflow-hidden"
            style={{
              backgroundColor: teamInfo.backgroundColor,
              border: `3px solid ${teamInfo.textColor}`
            }}
          >
            <div
              className="px-3 sm:px-4 py-2 sm:py-3"
              style={{ backgroundColor: teamInfo.textColor }}
            >
              <h2 className="text-sm sm:text-lg font-bold" style={{ color: teamPrimaryText }}>
                {selectedYear} Award Winners
              </h2>
            </div>
            <div className="p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {teamAwardWinners.map((award) => {
                // Find matching player - check pid first (if stored), then match by name AND team
                let matchingPlayer = null
                if (award.pid) {
                  // Direct pid lookup (most reliable)
                  matchingPlayer = currentDynasty.players?.find(p => p.pid === award.pid)
                }
                if (!matchingPlayer) {
                  // Match by name and team (including honor-only players)
                  matchingPlayer = currentDynasty.players?.find(p => {
                    const nameMatch = p.name?.toLowerCase().trim() === award.player?.toLowerCase().trim()
                    if (!nameMatch) return false
                    // Check if player's team matches (could be in teamsPlayed array or current team)
                    // Handles both tid (number) and abbr (string) for p.team
                    const playerTeams = p.teamsPlayed || []
                    const teamMatch = playerTeams.includes(teamAbbr) ||
                                     p.team === teamAbbr ||
                                     p.team === tid ||
                                     p.team === award.team
                    return teamMatch
                  })
                }
                if (!matchingPlayer) {
                  // Fallback: just match by name (for legacy data)
                  matchingPlayer = currentDynasty.players?.find(p =>
                    p.name?.toLowerCase().trim() === award.player?.toLowerCase().trim()
                  )
                }
                const isCoachAward = award.awardKey === 'bearBryantCoachOfTheYear' || award.awardKey === 'broyles'

                return (
                  <div
                    key={award.awardKey}
                    className="p-3 rounded-lg"
                    style={{ backgroundColor: `${teamInfo.textColor}15` }}
                  >
                    <div className="text-xs font-bold mb-1" style={{ color: teamBgText, opacity: 0.7 }}>
                      {award.awardName}
                    </div>
                    {matchingPlayer && !isCoachAward ? (
                      <Link
                        to={`${pathPrefix}/player/${matchingPlayer.pid}`}
                        className="font-bold text-base hover:underline"
                        style={{ color: teamInfo.textColor }}
                      >
                        {award.player}
                      </Link>
                    ) : (
                      <div className="font-bold text-base" style={{ color: teamInfo.textColor }}>
                        {award.player}
                      </div>
                    )}
                    {!isCoachAward && award.position && (
                      <div className="text-xs" style={{ color: teamBgText, opacity: 0.8 }}>
                        {award.position} • {award.class}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Roster Section - User's Team */}
      {isUserTeam && sortedTeamPlayers.length > 0 && (
        <div
          className="rounded-xl shadow-lg overflow-hidden"
          style={{
            backgroundColor: teamInfo.backgroundColor,
            border: `2px solid ${teamInfo.textColor}`
          }}
        >
          <div
            className="px-3 sm:px-4 py-2 sm:py-3 cursor-pointer"
            style={{ backgroundColor: teamInfo.textColor }}
            onClick={() => setRosterCollapsed(!rosterCollapsed)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* Collapse/Expand Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setRosterCollapsed(!rosterCollapsed)
                  }}
                  className="p-1 rounded hover:opacity-70 transition-opacity"
                  style={{ color: teamPrimaryText }}
                >
                  <svg
                    className={`w-5 h-5 transition-transform ${rosterCollapsed ? '' : 'rotate-90'}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                <h2 className="text-sm sm:text-lg font-bold" style={{ color: teamPrimaryText }}>
                  {selectedYear} Roster
                </h2>
                <span
                  className="text-xs sm:text-sm font-semibold px-2 py-0.5 sm:py-1 rounded"
                  style={{
                    backgroundColor: teamInfo.backgroundColor,
                    color: teamBgText
                  }}
                >
                  {positionFilter !== 'all' ? `${filteredTeamPlayers.length}/${sortedTeamPlayers.length}` : sortedTeamPlayers.length} Players
                </span>
              </div>
              {!isViewOnly && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowRosterModal(true)
                  }}
                  className="p-1.5 sm:p-2 rounded-lg hover:opacity-70 transition-opacity"
                  style={{ color: teamPrimaryText }}
                  title="Edit Roster"
                >
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              )}
            </div>
            {/* Position Filter & Sort - Only show when expanded */}
            {!rosterCollapsed && (
              <div className="mt-2 flex flex-col sm:flex-row gap-2" onClick={(e) => e.stopPropagation()}>
                {/* Position Filter */}
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-xs font-medium mr-1" style={{ color: teamPrimaryText, opacity: 0.7 }}>Filter:</span>
                  {Object.keys(positionGroups).map((key) => (
                    <button
                      key={key}
                      onClick={() => setPositionFilter(key)}
                      className="px-2 py-0.5 rounded text-xs font-semibold transition-opacity hover:opacity-80"
                      style={{
                        backgroundColor: positionFilter === key ? teamInfo.backgroundColor : `${teamInfo.backgroundColor}30`,
                        color: positionFilter === key ? teamBgText : teamPrimaryText
                      }}
                    >
                      {positionGroups[key].label}
                    </button>
                  ))}
                </div>
                {/* Sort Controls */}
                <div className="flex items-center gap-1 flex-wrap sm:ml-auto">
                  <span className="text-xs font-medium mr-1" style={{ color: teamPrimaryText, opacity: 0.7 }}>Sort:</span>
                  {[
                    { key: 'position', label: 'Pos' },
                    { key: 'overall', label: 'OVR' },
                    { key: 'class', label: 'Class' },
                    { key: 'devTrait', label: 'Dev' },
                    { key: 'jerseyNumber', label: '#' },
                    { key: 'name', label: 'Name' }
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => handleRosterSort(key)}
                      className="px-2 py-0.5 rounded text-xs font-semibold transition-opacity hover:opacity-80"
                      style={{
                        backgroundColor: rosterSort === key ? teamInfo.backgroundColor : `${teamInfo.backgroundColor}30`,
                        color: rosterSort === key ? teamBgText : teamPrimaryText
                      }}
                    >
                      {label}
                      {rosterSort === key && (
                        <span className="ml-0.5">{rosterSortDir === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {!rosterCollapsed && (
          <div className="p-2 sm:p-4">
            {/* Mobile: Card Layout */}
            <div className="sm:hidden space-y-2">
              {filteredTeamPlayers.map((player) => (
                <Link
                  key={player.pid}
                  to={`${pathPrefix}/player/${player.pid}`}
                  className="block p-3 rounded-lg shadow-sm active:shadow-none transition-shadow"
                  style={{
                    backgroundColor: `${teamInfo.textColor}08`,
                    borderLeft: `3px solid ${teamInfo.textColor}`
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Player Image or Placeholder - Clickable for upload */}
                      {!isViewOnly ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setQuickImagePlayer(player)
                          }}
                          className="relative group flex-shrink-0"
                          title="Click to add/change photo"
                        >
                          {player.pictureUrl ? (
                            <div
                              className="w-11 h-11 rounded-full overflow-hidden group-hover:opacity-80 transition-opacity"
                              style={{ border: `2px solid ${teamInfo.textColor}` }}
                            >
                              <img
                                src={player.pictureUrl}
                                alt={player.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ) : (
                            <div
                              className="w-11 h-11 rounded-full flex items-center justify-center group-hover:opacity-80 transition-opacity"
                              style={{
                                backgroundColor: teamInfo.textColor,
                                color: teamPrimaryText
                              }}
                            >
                              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                              </svg>
                            </div>
                          )}
                          {/* Camera icon overlay - only show when no image */}
                          {!player.pictureUrl && (
                            <div
                              className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
                              style={{ backgroundColor: teamInfo.textColor }}
                            >
                              <svg className="w-2.5 h-2.5" fill="none" stroke={teamPrimaryText} viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                              </svg>
                            </div>
                          )}
                        </button>
                      ) : player.pictureUrl ? (
                        <div
                          className="w-11 h-11 rounded-full flex-shrink-0 overflow-hidden"
                          style={{ border: `2px solid ${teamInfo.textColor}` }}
                        >
                          <img
                            src={player.pictureUrl}
                            alt={player.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div
                          className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{
                            backgroundColor: teamInfo.textColor,
                            color: teamPrimaryText
                          }}
                        >
                          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                          </svg>
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold truncate" style={{ color: teamInfo.textColor }}>
                          {player.jerseyNumber && <span className="mr-1">#{player.jerseyNumber}</span>}
                          {player.name}
                        </div>
                        <div className="text-xs flex items-center gap-2 flex-wrap" style={{ color: teamBgText, opacity: 0.8 }}>
                          <span>{player.position}</span>
                          <span>•</span>
                          <span>{player.classByYear?.[year] || player.year}</span>
                          {player.devTrait && player.devTrait !== 'Normal' && (
                            <>
                              <span>•</span>
                              <span>{player.devTrait}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div
                      className="text-xl font-bold flex-shrink-0 ml-2"
                      style={{ color: teamBgText }}
                    >
                      {player.overall}
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Desktop: Table Layout */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: `2px solid ${teamInfo.textColor}40` }}>
                    <th
                      className="text-center py-2 px-2 font-semibold cursor-pointer hover:opacity-80 w-14"
                      style={{ color: teamBgText }}
                      onClick={() => handleRosterSort('jerseyNumber')}
                    >
                      # {rosterSort === 'jerseyNumber' && (rosterSortDir === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="text-left py-2 px-2 font-semibold cursor-pointer hover:opacity-80"
                      style={{ color: teamBgText }}
                      onClick={() => handleRosterSort('name')}
                    >
                      Player {rosterSort === 'name' && (rosterSortDir === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="text-center py-2 px-2 font-semibold cursor-pointer hover:opacity-80 w-16"
                      style={{ color: teamBgText }}
                      onClick={() => handleRosterSort('position')}
                    >
                      Pos {rosterSort === 'position' && (rosterSortDir === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="text-center py-2 px-2 font-semibold cursor-pointer hover:opacity-80 w-16"
                      style={{ color: teamBgText }}
                      onClick={() => handleRosterSort('class')}
                    >
                      Class {rosterSort === 'class' && (rosterSortDir === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="text-center py-2 px-2 font-semibold cursor-pointer hover:opacity-80 w-16"
                      style={{ color: teamBgText }}
                      onClick={() => handleRosterSort('overall')}
                    >
                      OVR {rosterSort === 'overall' && (rosterSortDir === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="text-center py-2 px-2 font-semibold cursor-pointer hover:opacity-80 hidden md:table-cell w-20"
                      style={{ color: teamBgText }}
                      onClick={() => handleRosterSort('devTrait')}
                    >
                      Dev {rosterSort === 'devTrait' && (rosterSortDir === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="text-left py-2 px-2 font-semibold hidden lg:table-cell" style={{ color: teamBgText }}>Archetype</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTeamPlayers.map((player, idx) => (
                    <tr
                      key={player.pid}
                      className="cursor-pointer transition-all hover:brightness-95"
                      style={{
                        borderBottom: `1px solid ${teamInfo.textColor}15`,
                        backgroundColor: idx % 2 === 1 ? `${teamInfo.textColor}08` : 'transparent'
                      }}
                      onClick={() => navigate(`${pathPrefix}/player/${player.pid}`)}
                    >
                      <td className="py-2 px-2 text-center font-bold" style={{ color: teamBgText }}>
                        {player.jerseyNumber || '-'}
                      </td>
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-2">
                          {/* Player Image or Placeholder - Clickable for upload */}
                          {!isViewOnly ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setQuickImagePlayer(player)
                              }}
                              className="relative group flex-shrink-0"
                              title="Click to add/change photo"
                            >
                              {player.pictureUrl ? (
                                <div
                                  className="w-8 h-8 rounded-full overflow-hidden group-hover:opacity-80 transition-opacity"
                                  style={{ border: `2px solid ${teamInfo.textColor}` }}
                                >
                                  <img
                                    src={player.pictureUrl}
                                    alt={player.name}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              ) : (
                                <div
                                  className="w-8 h-8 rounded-full flex items-center justify-center group-hover:opacity-80 transition-opacity"
                                  style={{
                                    backgroundColor: teamInfo.textColor,
                                    color: teamPrimaryText
                                  }}
                                >
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                                  </svg>
                                </div>
                              )}
                              {/* Camera icon overlay - only show when no image */}
                              {!player.pictureUrl && (
                                <div
                                  className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center"
                                  style={{ backgroundColor: teamInfo.textColor }}
                                >
                                  <svg className="w-2 h-2" fill="none" stroke={teamPrimaryText} viewBox="0 0 24 24" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                                  </svg>
                                </div>
                              )}
                            </button>
                          ) : player.pictureUrl ? (
                            <Link
                              to={`${pathPrefix}/player/${player.pid}`}
                              className="w-8 h-8 rounded-full flex-shrink-0 overflow-hidden block"
                              style={{ border: `2px solid ${teamInfo.textColor}` }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <img
                                src={player.pictureUrl}
                                alt={player.name}
                                className="w-full h-full object-cover"
                              />
                            </Link>
                          ) : (
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                              style={{
                                backgroundColor: teamInfo.textColor,
                                color: teamPrimaryText
                              }}
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                              </svg>
                            </div>
                          )}
                          <Link
                            to={`${pathPrefix}/player/${player.pid}`}
                            className="font-semibold hover:underline"
                            style={{ color: teamBgText }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {player.name}
                          </Link>
                        </div>
                      </td>
                      <td className="py-2 px-2 text-center">
                        <span
                          className="px-2 py-0.5 rounded text-xs font-bold"
                          style={{
                            backgroundColor: `${teamInfo.textColor}20`,
                            color: teamBgText
                          }}
                        >
                          {player.position}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-center" style={{ color: teamBgText, opacity: 0.9 }}>
                        {player.classByYear?.[year] || player.year}
                      </td>
                      <td className="py-2 px-2 text-center font-bold" style={{ color: teamBgText }}>
                        {player.overall}
                      </td>
                      <td className="py-2 px-2 text-center hidden md:table-cell">
                        {player.devTrait ? (
                          <span
                            className="px-2 py-0.5 rounded text-xs font-semibold"
                            style={{
                              backgroundColor: player.devTrait === 'Elite' ? '#fbbf24' :
                                             player.devTrait === 'Star' ? '#8b5cf6' :
                                             player.devTrait === 'Impact' ? '#3b82f6' : '#9ca3af',
                              color: player.devTrait === 'Elite' ? '#78350f' : '#ffffff'
                            }}
                          >
                            {player.devTrait}
                          </span>
                        ) : (
                          <span style={{ color: teamBgText, opacity: 0.3 }}>-</span>
                        )}
                      </td>
                      <td className="py-2 px-2 hidden lg:table-cell" style={{ color: teamBgText, opacity: 0.8 }}>
                        {player.archetype || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          )}
        </div>
      )}

      {/* Add Roster Section for User's Team with No Players for this year */}
      {!isViewOnly && isUserTeam && sortedTeamPlayers.length === 0 && (
        <div
          className="rounded-lg shadow-lg overflow-hidden"
          style={{
            backgroundColor: teamInfo.backgroundColor,
            border: `3px solid ${teamInfo.textColor}`
          }}
        >
          <div
            className="px-3 sm:px-4 py-2 sm:py-3"
            style={{ backgroundColor: teamInfo.textColor }}
          >
            <h2 className="text-sm sm:text-lg font-bold" style={{ color: teamPrimaryText }}>
              {selectedYear} Roster
            </h2>
          </div>
          <div className="p-4 sm:p-6 text-center">
            <p className="text-sm mb-4" style={{ color: teamBgText, opacity: 0.7 }}>
              No roster data for {selectedYear}
            </p>
            <button
              onClick={() => setShowRosterModal(true)}
              className="px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-opacity"
              style={{
                backgroundColor: teamInfo.textColor,
                color: teamPrimaryText
              }}
            >
              Add Roster
            </button>
          </div>
        </div>
      )}

      {/* Schedule - shows games played by this team this year */}
      {teamYearGames.length > 0 && (
        <div
          className="rounded-lg shadow-lg overflow-hidden"
          style={{
            backgroundColor: teamInfo.backgroundColor,
            border: `3px solid ${teamInfo.textColor}`
          }}
        >
          <div
            className="px-3 sm:px-4 py-2 sm:py-3 cursor-pointer"
            style={{ backgroundColor: teamInfo.textColor }}
            onClick={() => setScheduleCollapsed(!scheduleCollapsed)}
          >
            <div className="flex items-center gap-2">
              {/* Collapse/Expand Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setScheduleCollapsed(!scheduleCollapsed)
                }}
                className="p-1 rounded hover:opacity-70 transition-opacity"
                style={{ color: teamPrimaryText }}
              >
                <svg
                  className={`w-5 h-5 transition-transform ${scheduleCollapsed ? '' : 'rotate-90'}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <h2 className="text-sm sm:text-lg font-bold" style={{ color: teamPrimaryText }}>
                {selectedYear} Schedule
              </h2>
              <span
                className="text-xs sm:text-sm font-semibold px-2 py-0.5 sm:py-1 rounded"
                style={{
                  backgroundColor: teamInfo.backgroundColor,
                  color: teamBgText
                }}
              >
                {teamYearGames.length} Games
              </span>
            </div>
          </div>

          {!scheduleCollapsed && (
          <div className="space-y-2 p-2 sm:p-4">
            {teamYearGames.map((game, index) => {
              // Use display values for flipped games, otherwise use original values
              const rawDisplayOpponent = game._isFlippedPerspective ? game._displayOpponent : game.opponent
              // Convert full team name to abbreviation if needed
              const displayOpponent = getAbbrFromTeamName(rawDisplayOpponent) || rawDisplayOpponent
              const displayResult = game._isFlippedPerspective ? game._displayResult : game.result
              const displayLocation = game._isFlippedPerspective ? game._displayLocation : game.location
              const displayTeamScore = game._isFlippedPerspective ? game._displayTeamScore : game.teamScore
              const displayOpponentScore = game._isFlippedPerspective ? game._displayOpponentScore : game.opponentScore

              // Use tid-based lookup for opponent data (supports teambuilder teams)
              const oppTeam = getTeamByAbbr(teamsSource, displayOpponent)
              const oppMascot = oppTeam?.name || getMascotName(displayOpponent, teamsSource)
              const oppLogo = oppTeam?.logo || (oppMascot ? getTeamLogo(oppMascot) : null)
              const oppColors = oppTeam
                ? { backgroundColor: oppTeam.primaryColor, textColor: oppTeam.secondaryColor }
                : { backgroundColor: '#6b7280', textColor: '#ffffff' }
              const isWin = displayResult === 'win' || displayResult === 'W'
              const isLoss = displayResult === 'loss' || displayResult === 'L'
              const hasResult = isWin || isLoss

              // Generate proper game ID for CFP games (don't trust stored id which may be "peach"/"fiesta")
              let properGameId = game.id
              if (game.isCFPSemifinal && game.bowlName) {
                const slotId = getSlotIdFromBowlName(game.bowlName)
                if (slotId) properGameId = getCFPGameId(slotId, selectedYear)
              } else if (game.isCFPQuarterfinal && game.bowlName) {
                const slotId = getSlotIdFromBowlName(game.bowlName)
                if (slotId) properGameId = getCFPGameId(slotId, selectedYear)
              } else if (game.isCFPFirstRound) {
                // For first round, use seeds to determine slot
                const cfpSeeds = currentDynasty.cfpSeedsByYear?.[selectedYear] || []
                const userTeamAbbr = getCurrentTeamAbbr(currentDynasty)
                const userSeed = cfpSeeds.find(s => s && s.team === userTeamAbbr)?.seed
                const oppSeed = userSeed ? 17 - userSeed : null
                const slotId = getFirstRoundSlotId(userSeed, oppSeed)
                if (slotId) properGameId = getCFPGameId(slotId, selectedYear)
              } else if (game.isCFPChampionship) {
                properGameId = getCFPGameId('cfpnc', selectedYear)
              }

              // Get the week/game type label
              const weekLabel = game.isCFPChampionship ? 'Natty' :
                       game.isCFPSemifinal ? 'CFP SF' :
                       game.isCFPQuarterfinal ? 'CFP QF' :
                       game.isCFPFirstRound ? 'CFP R1' :
                       game.isBowlGame ? 'Bowl' :
                       game.isPlayoff ? 'CFP' :
                       game.isConferenceChampionship ? 'CCG' :
                       `Wk ${game.week}`

              // Content for the game display - new design with W/L badge on left
              const gameContent = (
                <div className="flex items-center w-full overflow-hidden">
                  {/* Week/Result Badge */}
                  <div
                    className="w-10 sm:w-14 flex-shrink-0 text-center py-2 sm:py-3 rounded-l-xl font-bold text-[10px] sm:text-sm"
                    style={{
                      backgroundColor: hasResult ? (isWin ? '#22c55e' : '#ef4444') : oppColors.textColor,
                      color: hasResult ? '#fff' : oppColors.backgroundColor
                    }}
                  >
                    {hasResult ? (isWin ? 'W' : 'L') : weekLabel}
                  </div>

                  {/* Game Info */}
                  <div
                    className="flex-1 flex items-center justify-between py-2 sm:py-3 px-2 sm:px-4 rounded-r-xl min-w-0"
                    style={{ backgroundColor: oppColors.backgroundColor }}
                  >
                    <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 flex-1">
                      {/* Location Badge */}
                      <span
                        className="w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[9px] sm:text-xs font-bold flex-shrink-0"
                        style={{
                          backgroundColor: `${oppColors.textColor}15`,
                          color: oppColors.textColor
                        }}
                      >
                        {displayLocation === 'away' ? '@' : 'vs'}
                      </span>

                      {/* Team Logo */}
                      {oppLogo && (
                        <div
                          className="w-7 h-7 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-white"
                          style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.1)', padding: '3px' }}
                        >
                          <img
                            src={oppLogo}
                            alt={`${oppMascot} logo`}
                            className="w-full h-full object-contain"
                          />
                        </div>
                      )}

                      {/* Team Name */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          {game.opponentRank && (
                            <span className="text-[10px] sm:text-xs font-bold flex-shrink-0" style={{ color: oppColors.textColor, opacity: 0.7 }}>
                              #{game.opponentRank}
                            </span>
                          )}
                          <span
                            className="font-semibold text-xs sm:text-base truncate"
                            style={{ color: oppColors.textColor }}
                          >
                            {oppMascot || displayOpponent}
                          </span>
                        </div>
                        {hasResult && (
                          <span className="text-[9px] sm:text-xs opacity-70 truncate block" style={{ color: oppColors.textColor }}>
                            {weekLabel}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Score or Status */}
                    <div className="flex-shrink-0 text-right ml-1">
                      {hasResult ? (
                        <div className="text-sm sm:text-lg font-bold tabular-nums" style={{ color: oppColors.textColor }}>
                          {Math.max(displayTeamScore, displayOpponentScore)}-{Math.min(displayTeamScore, displayOpponentScore)}
                          {game.overtimes && game.overtimes.length > 0 && (
                            <span className="ml-1 text-[9px] sm:text-xs opacity-80">
                              {game.overtimes.length > 1 ? `${game.overtimes.length}OT` : 'OT'}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] sm:text-xs font-medium opacity-70" style={{ color: oppColors.textColor }}>
                          Scheduled
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )

              // Return the wrapped content
              if (properGameId) {
                return (
                  <Link
                    key={index}
                    to={`${pathPrefix}/game/${properGameId}`}
                    className="block rounded-xl overflow-hidden hover:scale-[1.01] hover:shadow-lg transition-all duration-200"
                    style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                  >
                    {gameContent}
                  </Link>
                )
              }

              return (
                <div
                  key={index}
                  className="rounded-xl overflow-hidden"
                  style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                >
                  {gameContent}
                </div>
              )
            })}

            {/* Conference Championship Game - inline in schedule */}
            {(() => {
              // Get the CC game from games array OR from conferenceChampionshipsByYear
              const ccGameFromGames = teamYearGames.find(g => g.isConferenceChampionship)

              // If CC game is already in teamYearGames, skip (it's rendered above)
              if (ccGameFromGames) return null

              // Check if user made the championship from conferenceChampionshipData
              const ccData = currentDynasty.conferenceChampionshipData
              const madeChampionship = ccData?.madeChampionship === true

              // If user didn't make championship or no CC game data, skip
              if (!madeChampionship && !teamCCGame) return null

              // Get opponent from ccData or teamCCGame
              const ccOpponentAbbr = ccData?.opponent || (teamCCGame ? (teamCCGame.team1 === teamAbbr ? teamCCGame.team2 : teamCCGame.team1) : null)
              if (!ccOpponentAbbr) return null

              // Use tid-based lookup for CC opponent data (supports teambuilder teams)
              const ccOppTeam = getTeamByAbbr(teamsSource, ccOpponentAbbr)
              const ccOppLogo = ccOppTeam?.logo || (getMascotName(ccOpponentAbbr, teamsSource) ? getTeamLogo(getMascotName(ccOpponentAbbr, teamsSource)) : null)
              const ccOppColors = ccOppTeam
                ? { backgroundColor: ccOppTeam.primaryColor, textColor: ccOppTeam.secondaryColor }
                : { backgroundColor: '#6b7280', textColor: '#ffffff' }
              const ccOpponentDisplayName = ccOppTeam?.name || getMascotName(ccOpponentAbbr, teamsSource) || ccOpponentAbbr

              // Determine if we have a result
              const hasResult = teamCCGame && teamCCGame.team1Score !== null && teamCCGame.team2Score !== null
              const isWin = hasResult && wonCC
              const isLoss = hasResult && !wonCC

              // Calculate scores from this team's perspective
              const thisTeamScore = teamCCGame ? (teamCCGame.team1 === teamAbbr ? teamCCGame.team1Score : teamCCGame.team2Score) : null
              const oppScore = teamCCGame ? (teamCCGame.team1 === teamAbbr ? teamCCGame.team2Score : teamCCGame.team1Score) : null

              // CC game content with new design
              const ccGameContent = (
                <div className="flex items-center w-full overflow-hidden">
                  {/* Week/Result Badge */}
                  <div
                    className="w-10 sm:w-14 flex-shrink-0 text-center py-2 sm:py-3 rounded-l-xl font-bold text-[10px] sm:text-sm"
                    style={{
                      backgroundColor: hasResult ? (isWin ? '#22c55e' : '#ef4444') : ccOppColors.textColor,
                      color: hasResult ? '#fff' : ccOppColors.backgroundColor
                    }}
                  >
                    {hasResult ? (isWin ? 'W' : 'L') : 'CCG'}
                  </div>

                  {/* Game Info */}
                  <div
                    className="flex-1 flex items-center justify-between py-2 sm:py-3 px-2 sm:px-4 rounded-r-xl min-w-0"
                    style={{ backgroundColor: ccOppColors.backgroundColor }}
                  >
                    <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 flex-1">
                      {/* Location Badge */}
                      <span
                        className="w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[9px] sm:text-xs font-bold flex-shrink-0"
                        style={{
                          backgroundColor: `${ccOppColors.textColor}15`,
                          color: ccOppColors.textColor
                        }}
                      >
                        vs
                      </span>

                      {/* Team Logo */}
                      {ccOppLogo && (
                        <div
                          className="w-7 h-7 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-white"
                          style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.1)', padding: '3px' }}
                        >
                          <img
                            src={ccOppLogo}
                            alt={`${ccOpponentDisplayName} logo`}
                            className="w-full h-full object-contain"
                          />
                        </div>
                      )}

                      {/* Team Name */}
                      <div className="min-w-0 flex-1">
                        <span className="font-semibold text-xs sm:text-base truncate block" style={{ color: ccOppColors.textColor }}>
                          {ccOpponentDisplayName}
                        </span>
                        <span className="text-[9px] sm:text-xs opacity-70 truncate block" style={{ color: ccOppColors.textColor }}>
                          {teamCCGame?.conference ? `${teamCCGame.conference} Championship` : 'Conference Championship'}
                        </span>
                      </div>
                    </div>

                    {/* Score or Status */}
                    <div className="flex-shrink-0 text-right ml-1">
                      {hasResult ? (
                        <div className="text-sm sm:text-lg font-bold tabular-nums" style={{ color: ccOppColors.textColor }}>
                          {Math.max(thisTeamScore, oppScore)}-{Math.min(thisTeamScore, oppScore)}
                        </div>
                      ) : (
                        <span className="text-[10px] sm:text-xs font-medium opacity-70" style={{ color: ccOppColors.textColor }}>
                          Scheduled
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )

              const ccGameId = teamCCGame?.id || `cc-${selectedYear}`

              if (hasResult) {
                return (
                  <Link
                    to={`${pathPrefix}/game/${ccGameId}`}
                    className="block rounded-xl overflow-hidden hover:scale-[1.01] hover:shadow-lg transition-all duration-200"
                    style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                  >
                    {ccGameContent}
                  </Link>
                )
              }

              return (
                <div
                  className="rounded-xl overflow-hidden"
                  style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                >
                  {ccGameContent}
                </div>
              )
            })()}

            {/* Scheduled Bowl Game - show if bowl is scheduled but not played */}
            {(() => {
              const bowlData = currentDynasty.bowlEligibilityData
              const hasBowlScheduled = bowlData?.eligible === true && bowlData?.bowlGame && bowlData?.opponent
              const bowlGamePlayed = teamYearGames.some(g => g.isBowlGame)

              // Only show if bowl is scheduled but not yet played, and viewing current year
              if (!hasBowlScheduled || bowlGamePlayed || selectedYear !== currentDynasty.currentYear) return null

              const bowlOpponentValue = bowlData.opponent
              // Use tid-based lookup for bowl opponent data (supports teambuilder teams)
              const bowlOppTeam = getTeamByAbbr(teamsSource, bowlOpponentValue)
              const oppLogo = bowlOppTeam?.logo || (getMascotName(bowlOpponentValue, teamsSource) ? getTeamLogo(getMascotName(bowlOpponentValue, teamsSource)) : null)
              const oppColors = bowlOppTeam
                ? { backgroundColor: bowlOppTeam.primaryColor, textColor: bowlOppTeam.secondaryColor }
                : { backgroundColor: '#6b7280', textColor: '#ffffff' }
              const opponentDisplayName = bowlOppTeam?.name || getMascotName(bowlOpponentValue, teamsSource) || bowlOpponentValue

              return (
                <div
                  className="rounded-xl overflow-hidden"
                  style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                >
                  <div className="flex items-center w-full overflow-hidden">
                    {/* Week Badge */}
                    <div
                      className="w-10 sm:w-14 flex-shrink-0 text-center py-2 sm:py-3 rounded-l-xl font-bold text-[10px] sm:text-sm"
                      style={{
                        backgroundColor: oppColors.textColor,
                        color: oppColors.backgroundColor
                      }}
                    >
                      Bowl
                    </div>

                    {/* Game Info */}
                    <div
                      className="flex-1 flex items-center justify-between py-2 sm:py-3 px-2 sm:px-4 rounded-r-xl min-w-0"
                      style={{ backgroundColor: oppColors.backgroundColor }}
                    >
                      <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 flex-1">
                        {/* Location Badge */}
                        <span
                          className="w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[9px] sm:text-xs font-bold flex-shrink-0"
                          style={{
                            backgroundColor: `${oppColors.textColor}15`,
                            color: oppColors.textColor
                          }}
                        >
                          vs
                        </span>

                        {/* Team Logo */}
                        {oppLogo && (
                          <div
                            className="w-7 h-7 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-white"
                            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.1)', padding: '3px' }}
                          >
                            <img
                              src={oppLogo}
                              alt={`${opponentDisplayName} logo`}
                              className="w-full h-full object-contain"
                            />
                          </div>
                        )}

                        {/* Team Name */}
                        <div className="min-w-0 flex-1">
                          <span className="font-semibold text-xs sm:text-base truncate block" style={{ color: oppColors.textColor }}>
                            {opponentDisplayName}
                          </span>
                          <span className="text-[9px] sm:text-xs opacity-70 truncate block" style={{ color: oppColors.textColor }}>
                            {bowlData.bowlGame}
                          </span>
                        </div>
                      </div>

                      {/* Status */}
                      <div className="flex-shrink-0 text-right ml-1">
                        <span className="text-[10px] sm:text-xs font-medium opacity-70" style={{ color: oppColors.textColor }}>
                          Scheduled
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
          )}
        </div>
      )}

      {/* CFP Games - only for user's team */}
      {isUserTeam && teamCFPGames.length > 0 && (
        <div
          className="rounded-lg shadow-lg overflow-hidden"
          style={{
            backgroundColor: viewedTeamColors.secondary,
            border: `3px solid ${viewedTeamColors.primary}`
          }}
        >
          <Link
            to={`${pathPrefix}/cfp-bracket/${selectedYear}`}
            className="px-3 sm:px-4 py-2 sm:py-3 block hover:opacity-90 transition-opacity"
            style={{ backgroundColor: viewedTeamColors.primary }}
          >
            <h2 className="text-sm sm:text-lg font-bold hover:underline" style={{ color: getContrastTextColor(viewedTeamColors.primary) }}>
              College Football Playoff
            </h2>
          </Link>

          <div className="divide-y" style={{ borderColor: `${viewedTeamColors.primary}30` }}>
            {teamCFPGames.map((game, index) => {
              // Check both tid and abbr for team matching
              const isTeam1 = game.team1Tid === tid || game.team1 === teamAbbr
              const isTeam2 = game.team2Tid === tid || game.team2 === teamAbbr
              const teamWon = (isTeam1 && game.team1Score > game.team2Score) ||
                             (isTeam2 && game.team2Score > game.team1Score)
              const roundNames = { 1: 'First Round', 2: 'Quarterfinal', 3: 'Semifinal', 4: 'National Championship' }
              const roundNamesShort = { 1: 'R1', 2: 'QF', 3: 'SF', 4: 'Natty' }

              return (
                <div key={index} className="p-3 sm:p-4">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                    <span
                      className="px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-sm font-bold"
                      style={{
                        backgroundColor: teamWon ? '#16a34a' : '#dc2626',
                        color: '#FFFFFF'
                      }}
                    >
                      {teamWon ? 'WIN' : 'LOSS'}
                    </span>
                    <span className="text-lg sm:text-xl font-bold" style={{ color: secondaryBgText }}>
                      {Math.max(game.team1Score, game.team2Score)} - {Math.min(game.team1Score, game.team2Score)}
                    </span>
                    <span className="text-xs sm:text-sm" style={{ color: secondaryBgText, opacity: 0.8 }}>
                      vs {isTeam1 ? game.team2 : game.team1}
                    </span>
                    <span
                      className="text-xs font-semibold px-2 py-0.5 sm:py-1 rounded"
                      style={{ backgroundColor: `${viewedTeamColors.primary}20`, color: viewedTeamColors.primary }}
                    >
                      <span className="hidden sm:inline">{roundNames[game.round] || `Round ${game.round}`}</span>
                      <span className="sm:hidden">{roundNamesShort[game.round] || `R${game.round}`}</span>
                    </span>
                    {game.round === 4 && teamWon && (
                      <span className="text-xs sm:text-sm font-bold text-yellow-600">🏆 CHAMPS</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Players from Other Teams (Transfers) */}
      {!isUserTeam && teamPlayers.length > 0 && (
        <div
          className="rounded-lg shadow-lg overflow-hidden"
          style={{
            backgroundColor: viewedTeamColors.secondary,
            border: `3px solid ${viewedTeamColors.primary}`
          }}
        >
          <div
            className="px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between"
            style={{ backgroundColor: viewedTeamColors.primary }}
          >
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-lg font-bold" style={{ color: getContrastTextColor(viewedTeamColors.primary) }}>
                {selectedYear} {teamAbbr} Roster
              </h2>
              <span
                className="text-xs sm:text-sm font-semibold px-2 py-0.5 sm:py-1 rounded"
                style={{
                  backgroundColor: viewedTeamColors.secondary,
                  color: secondaryBgText
                }}
              >
                {teamPlayers.length} Players
              </span>
              {!isViewOnly && (
                <button
                  onClick={() => setShowRosterModal(true)}
                  className="p-1.5 sm:p-2 rounded-lg hover:opacity-70 transition-opacity"
                  style={{ color: getContrastTextColor(viewedTeamColors.primary) }}
                  title="Edit Roster"
                >
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          <div className="p-2 sm:p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {teamPlayers.map((player) => (
                <Link
                  key={player.pid}
                  to={`${pathPrefix}/player/${player.pid}`}
                  className="flex items-center gap-2 sm:gap-3 p-2 rounded hover:opacity-80 transition-opacity"
                  style={{ backgroundColor: `${viewedTeamColors.primary}10` }}
                >
                  {player.jerseyNumber && (
                    <span
                      className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded text-xs sm:text-sm font-bold flex-shrink-0"
                      style={{ backgroundColor: viewedTeamColors.primary, color: getContrastTextColor(viewedTeamColors.primary) }}
                    >
                      {player.jerseyNumber}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-xs sm:text-sm truncate" style={{ color: secondaryBgText }}>
                      {player.name}
                    </div>
                    <div className="text-xs" style={{ color: secondaryBgText, opacity: 0.7 }}>
                      {player.position} • {player.overall} OVR • Transfer
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add Roster Section for Non-User Teams with No Players */}
      {!isViewOnly && !isUserTeam && teamPlayers.length === 0 && (
        <div
          className="rounded-lg shadow-lg overflow-hidden"
          style={{
            backgroundColor: viewedTeamColors.secondary,
            border: `3px solid ${viewedTeamColors.primary}`
          }}
        >
          <div
            className="px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between"
            style={{ backgroundColor: viewedTeamColors.primary }}
          >
            <h2 className="text-sm sm:text-lg font-bold" style={{ color: getContrastTextColor(viewedTeamColors.primary) }}>
              {selectedYear} {teamAbbr} Roster
            </h2>
          </div>
          <div className="p-4 sm:p-6 text-center">
            <p className="text-sm mb-4" style={{ color: secondaryBgText, opacity: 0.7 }}>
              No roster data for {teamAbbr} in {selectedYear}
            </p>
            <button
              onClick={() => setShowRosterModal(true)}
              className="px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-opacity"
              style={{
                backgroundColor: viewedTeamColors.primary,
                color: getContrastTextColor(viewedTeamColors.primary)
              }}
            >
              Add Roster
            </button>
          </div>
        </div>
      )}

      {/* Game Entry Modal (for editing games) */}
      {showEditModal && editingGameData && (
        <GameEntryModal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false)
            setEditingGameData(null)
          }}
          onSave={handleGameSave}
          weekNumber={selectedGame?.week || 'Bowl'}
          currentYear={selectedYear}
          teamColors={viewedTeamColors}
          opponent={editingGameData.isUserGame ? editingGameData.opponent : undefined}
          bowlName={editingGameData.bowlName}
          existingGame={editingGameData.isUserGame ? editingGameData.existingGame : null}
          team1={editingGameData.isUserGame ? undefined : editingGameData.team1}
          team2={editingGameData.isUserGame ? undefined : editingGameData.team2}
          existingTeam1Score={editingGameData.existingTeam1Score}
          existingTeam2Score={editingGameData.existingTeam2Score}
          existingGameNote={editingGameData.existingGameNote}
          existingLinks={editingGameData.existingLinks}
        />
      )}

      {/* Roster Edit Modal */}
      <RosterEditModal
        isOpen={showRosterModal}
        onClose={() => setShowRosterModal(false)}
        onSave={handleRosterSave}
        currentYear={selectedYear}
        teamColors={viewedTeamColors}
        teamAbbr={teamAbbr}
        teamName={mascotName || teamAbbr}
      />

      {/* Team Edit Modal */}
      {showTeamEditModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowTeamEditModal(false)}
        >
          <div
            className="rounded-lg shadow-xl max-w-md w-full overflow-hidden"
            style={{
              backgroundColor: teamInfo.backgroundColor,
              border: `3px solid ${teamInfo.textColor}`
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="px-4 py-3 flex items-center justify-between"
              style={{ backgroundColor: teamInfo.textColor }}
            >
              <div className="flex items-center gap-3">
                {teamLogo && (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: '#FFFFFF', padding: '2px' }}>
                    <img src={teamLogo} alt={`${teamAbbr} logo`} className="w-full h-full object-contain" />
                  </div>
                )}
                <h2 className="text-lg font-bold" style={{ color: teamPrimaryText }}>Edit Team Info</h2>
              </div>
              <button onClick={() => setShowTeamEditModal(false)} className="p-1 rounded hover:bg-black/10 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke={teamPrimaryText} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="text-center mb-4">
                <div className="text-lg font-bold" style={{ color: teamBgText }}>{mascotName || teamAbbr}</div>
                <div className="text-sm opacity-70" style={{ color: teamBgText }}>{selectedYear} Season</div>
              </div>

              {/* Record Section */}
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: teamBgText }}>
                  Season Record
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={editWins}
                    onChange={(e) => setEditWins(e.target.value)}
                    placeholder="W"
                    className="w-20 px-3 py-2 rounded-lg text-center font-bold text-lg"
                    style={{
                      backgroundColor: '#FFFFFF',
                      color: '#1f2937',
                      border: `2px solid ${teamInfo.textColor}40`
                    }}
                  />
                  <span className="text-2xl font-bold" style={{ color: teamBgText }}>-</span>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={editLosses}
                    onChange={(e) => setEditLosses(e.target.value)}
                    placeholder="L"
                    className="w-20 px-3 py-2 rounded-lg text-center font-bold text-lg"
                    style={{
                      backgroundColor: '#FFFFFF',
                      color: '#1f2937',
                      border: `2px solid ${teamInfo.textColor}40`
                    }}
                  />
                </div>
                <p className="text-xs mt-1 opacity-60" style={{ color: teamBgText }}>
                  Leave blank to use calculated record
                </p>
              </div>

              {/* Conference Section */}
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: teamBgText }}>
                  Conference
                </label>
                <select
                  value={editConference}
                  onChange={(e) => setEditConference(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg font-semibold"
                  style={{
                    backgroundColor: '#FFFFFF',
                    color: '#1f2937',
                    border: `2px solid ${teamInfo.textColor}40`
                  }}
                >
                  <option value="">-- Select Conference --</option>
                  <option value="ACC">ACC</option>
                  <option value="Big Ten">Big Ten</option>
                  <option value="Big 12">Big 12</option>
                  <option value="SEC">SEC</option>
                  <option value="Pac-12">Pac-12</option>
                  <option value="American">American</option>
                  <option value="Conference USA">Conference USA</option>
                  <option value="MAC">MAC</option>
                  <option value="Mountain West">Mountain West</option>
                  <option value="Sun Belt">Sun Belt</option>
                  <option value="Independent">Independent</option>
                </select>
              </div>

              {/* Save Button */}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowTeamEditModal(false)}
                  className="px-4 py-2 rounded-lg font-semibold transition-colors"
                  style={{
                    backgroundColor: `${teamBgText}20`,
                    color: teamBgText
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    const info = {}
                    if (editWins !== '' && editLosses !== '') {
                      info.wins = parseInt(editWins)
                      info.losses = parseInt(editLosses)
                    }
                    if (editConference) {
                      info.conference = editConference
                    }
                    if (Object.keys(info).length > 0) {
                      await saveTeamYearInfo(currentDynasty.id, teamAbbr, selectedYear, info)
                    }
                    setShowTeamEditModal(false)
                  }}
                  className="px-4 py-2 rounded-lg font-semibold transition-colors hover:opacity-90"
                  style={{
                    backgroundColor: teamInfo.textColor,
                    color: teamPrimaryText
                  }}
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Image Upload Modal */}
      {quickImagePlayer && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4"
          style={{ margin: 0 }}
          onClick={() => setQuickImagePlayer(null)}
        >
          <div
            className="rounded-xl max-w-sm w-full overflow-hidden shadow-2xl"
            style={{ backgroundColor: viewedTeamColors.secondary }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4" style={{ backgroundColor: teamInfo.textColor }}>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold" style={{ color: teamPrimaryText }}>
                  {quickImagePlayer.pictureUrl ? 'Change Photo' : 'Add Photo'}
                </h3>
                <button
                  type="button"
                  onClick={() => setQuickImagePlayer(null)}
                  className="p-1 rounded-lg hover:bg-white/10"
                  style={{ color: teamPrimaryText }}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-sm mt-1 opacity-80" style={{ color: teamPrimaryText }}>
                {quickImagePlayer.name}
              </p>
            </div>

            <div className="p-4 space-y-4">
              {/* Current image preview */}
              {quickImagePlayer.pictureUrl && (
                <div className="flex justify-center">
                  <img
                    src={quickImagePlayer.pictureUrl}
                    alt=""
                    className="w-24 h-24 rounded-full object-cover border-4"
                    style={{ borderColor: teamInfo.textColor }}
                  />
                </div>
              )}

              {/* Paste button for mobile */}
              <button
                type="button"
                onClick={async () => {
                  try {
                    const clipboardItems = await navigator.clipboard.read()
                    for (const item of clipboardItems) {
                      const imageType = item.types.find(type => type.startsWith('image/'))
                      if (imageType) {
                        const blob = await item.getType(imageType)
                        const file = new File([blob], 'pasted-image.png', { type: imageType })
                        await handleQuickImageUpload(file)
                        return
                      }
                    }
                    alert('No image found in clipboard')
                  } catch (err) {
                    console.error('Clipboard read failed:', err)
                    alert('Could not read clipboard. Try using the file picker instead.')
                  }
                }}
                disabled={imageUploading}
                className="w-full py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-opacity"
                style={{
                  backgroundColor: teamInfo.textColor,
                  color: teamPrimaryText,
                  opacity: imageUploading ? 0.5 : 1
                }}
              >
                {imageUploading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Uploading...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15m0-3l-3-3m0 0l-3 3m3-3V15" />
                    </svg>
                    Paste from Clipboard
                  </>
                )}
              </button>
              <p className="text-xs text-center" style={{ color: teamBgText, opacity: 0.7 }}>
                Copy an image first, then tap to paste
              </p>

              {/* Or divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px" style={{ backgroundColor: `${teamInfo.textColor}30` }} />
                <span className="text-xs font-medium" style={{ color: teamBgText, opacity: 0.7 }}>or</span>
                <div className="flex-1 h-px" style={{ backgroundColor: `${teamInfo.textColor}30` }} />
              </div>

              {/* File upload button */}
              <input
                type="file"
                ref={quickImageInputRef}
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  if (!file.type.startsWith('image/')) {
                    alert('Please select an image file')
                    return
                  }
                  if (file.size > 32 * 1024 * 1024) {
                    alert('Image must be less than 32MB')
                    return
                  }
                  await handleQuickImageUpload(file)
                  e.target.value = ''
                }}
                accept="image/*"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => quickImageInputRef.current?.click()}
                disabled={imageUploading}
                className="w-full py-3 rounded-lg font-medium text-sm flex items-center justify-center gap-2"
                style={{
                  backgroundColor: teamInfo.textColor,
                  color: teamPrimaryText,
                  opacity: imageUploading ? 0.7 : 1
                }}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Choose from Device
              </button>

              {/* Remove photo button if exists */}
              {quickImagePlayer.pictureUrl && (
                <button
                  type="button"
                  onClick={async () => {
                    const updatedPlayers = currentDynasty.players.map(p =>
                      p.pid === quickImagePlayer.pid ? { ...p, pictureUrl: '' } : p
                    )
                    await updateDynasty(currentDynasty.id, { players: updatedPlayers })
                    setQuickImagePlayer(null)
                  }}
                  className="w-full py-2 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
                >
                  Remove Photo
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
