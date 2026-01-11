import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useDynasty, detectGameType, GAME_TYPES, getTeamConferenceForDynasty, getUserGamePerspective } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { getContrastTextColor } from '../../utils/colorUtils'
import { teamAbbreviations } from '../../data/teamAbbreviations'
import { getConferenceLogo } from '../../data/conferenceLogos'
import { TEAMS, resolveTid, getAbbrFromTid, getCurrentTeamAbbr, getGameTeamInfo, getAbbrFromTeamName } from '../../data/teamRegistry'
import { getTeamLogo, getMascotName as getMascotNameFromTeams } from '../../data/teams'
import TeambuilderEditModal from '../../components/TeambuilderEditModal'

// Map abbreviation to mascot name for logo lookup
const getMascotName = (abbr, teamsData = null) => {
  // Try tid-based lookup first if teams data provided
  if (teamsData) {
    const result = getMascotNameFromTeams(abbr, teamsData)
    if (result) return result
  }
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
    'FCSE': 'FCS East Judicials',
    'FCSM': 'FCS Midwest Rebels',
    'FCSN': 'FCS Northwest Stallions',
    'FCSW': 'FCS West Titans'
  }
  // Try direct lookup first (for abbreviations)
  if (mascotMap[abbr]) return mascotMap[abbr]
  // If abbr is already a full name, try to get abbreviation and return the full name
  const actualAbbr = getAbbrFromTeamName(abbr)
  if (actualAbbr) return mascotMap[actualAbbr] || abbr
  return null
}

// Extract just the school name from full mascot name
const getSchoolName = (mascotName) => {
  if (!mascotName) return ''

  // Two-word mascots that need to be removed
  const twoWordMascots = [
    'Crimson Tide', 'Golden Bears', 'Sun Devils', 'Red Wolves', 'Black Knights',
    'Blue Devils', 'Fighting Illini', 'Yellow Jackets', 'Fighting Irish', 'Nittany Lions',
    'Scarlet Knights', 'Golden Eagles', 'Demon Deacons', 'Horned Frogs', 'Green Wave',
    'Golden Hurricane', 'Mean Green', 'Tar Heels', 'Golden Gophers', 'Golden Flashes',
    'Blue Raiders', 'Wolf Pack', "Ragin' Cajuns", 'Rainbow Warriors'
  ]

  for (const mascot of twoWordMascots) {
    if (mascotName.endsWith(mascot)) {
      return mascotName.replace(` ${mascot}`, '')
    }
  }

  // Default: remove last word (single-word mascot)
  const words = mascotName.split(' ')
  if (words.length > 1) {
    return words.slice(0, -1).join(' ')
  }
  return mascotName
}

export default function Team() {
  const { id, tid: tidParam } = useParams()
  const navigate = useNavigate()
  const { currentDynasty, isViewOnly, updateTeambuilderTeam } = useDynasty()
  const pathPrefix = usePathPrefix()
  const [showGamesModal, setShowGamesModal] = useState(false)
  const [showApTop25Modal, setShowApTop25Modal] = useState(false)
  const [showConfTitlesModal, setShowConfTitlesModal] = useState(false)
  const [showBowlGamesModal, setShowBowlGamesModal] = useState(false)
  const [showCfpAppsModal, setShowCfpAppsModal] = useState(false)
  const [showNatlTitlesModal, setShowNatlTitlesModal] = useState(false)
  const [showAllAmericansModal, setShowAllAmericansModal] = useState(false)
  const [showAsTeamModal, setShowAsTeamModal] = useState(false)
  const [showSeasonsModal, setShowSeasonsModal] = useState(false)
  const [showStreakModal, setShowStreakModal] = useState(false)
  const [showAllTimeModal, setShowAllTimeModal] = useState(false)
  const [showTeambuilderEditModal, setShowTeambuilderEditModal] = useState(false)

  // Convert tid param to number
  const tid = parseInt(tidParam, 10)

  // Scroll to top when navigating to this page
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [tid])

  if (!currentDynasty) return null

  // Use dynasty.teams if available, otherwise fall back to TEAMS
  const teamsSource = currentDynasty.teams || TEAMS

  // Get all teams sorted alphabetically by name (for dropdown)
  const allTeams = Object.values(teamsSource)
    .filter(team => !team.isFCS)
    .map(team => ({
      tid: team.tid,
      abbr: team.abbr,
      name: team.name,
      shortName: getSchoolName(team.name)
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  // Get team info from tid
  const team = teamsSource[tid]

  if (!team) {
    return (
      <div className="space-y-6">
        <div
          className="rounded-lg shadow-lg p-6 bg-gray-100 border-2 border-gray-400"
        >
          <h1 className="text-2xl font-bold text-gray-700">
            Team Not Found
          </h1>
          <p className="mt-2 text-gray-600">
            The team with ID "{tidParam}" was not found.
          </p>
          <Link
            to={`${pathPrefix}/teams`}
            className="inline-block mt-4 px-4 py-2 rounded-lg font-semibold bg-gray-700 text-white hover:bg-gray-800"
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

  const conference = getTeamConferenceForDynasty(currentDynasty, teamAbbr)
  const conferenceLogo = conference ? getConferenceLogo(conference) : null
  const mascotName = team.name
  const teamLogo = team.logo
  const teamBgText = getContrastTextColor(teamInfo.backgroundColor)
  const teamPrimaryText = getContrastTextColor(teamInfo.textColor)

  // Get user's team abbreviation and teams reference
  const userTeamAbbr = getCurrentTeamAbbr(currentDynasty)
  const teams = currentDynasty?.teams || TEAMS

  // Get all games against this team (user's games across all teams they've coached)
  // Uses perspective to find games where user played against this team
  const gamesAgainst = (currentDynasty.games || [])
    .map(g => {
      const perspective = getUserGamePerspective(g, currentDynasty)
      return perspective ? { ...g, perspective } : null
    })
    .filter(g => {
      if (!g) return false
      // Check if opponent matches the team we're viewing (by tid or abbr)
      const opponentInfo = g.perspective?.opponentTid
        ? getGameTeamInfo(teams, g.perspective.opponentTid)
        : null
      const opponentAbbr = opponentInfo?.abbr || g.opponent
      return opponentAbbr === teamAbbr
    })

  // Calculate all-time record vs this team using perspective
  const allTimeWins = gamesAgainst.filter(g => g.perspective?.userWon).length
  const allTimeLosses = gamesAgainst.filter(g => g.perspective && !g.perspective.userWon).length
  const winPctVs = gamesAgainst.length > 0
    ? ((allTimeWins / gamesAgainst.length) * 100).toFixed(1)
    : null

  // Calculate conference titles dynamically from conferenceChampionshipsByYear
  const conferenceTitles = Object.values(currentDynasty.conferenceChampionshipsByYear || {})
    .flat()
    .filter(cc => cc.winner === teamAbbr)
    .length

  // Get all dynasty years (defined early for use in getFinalRanking)
  const startYear = currentDynasty.startYear
  const currentYear = currentDynasty.currentYear

  // Get final media poll ranking for this team (most recent completed year)
  const getFinalRanking = () => {
    const finalPolls = currentDynasty.finalPollsByYear || {}
    // Check each year from most recent to oldest
    for (let year = currentYear; year >= startYear; year--) {
      const yearPolls = finalPolls[year]
      if (yearPolls?.media) {
        const teamRanking = yearPolls.media.find(p => p && p.team === teamAbbr)
        if (teamRanking) {
          return { rank: teamRanking.rank, year }
        }
      }
    }
    return null
  }

  const finalRanking = getFinalRanking()

  // Calculate AP Top 25 finishes dynamically from finalPollsByYear
  const getApTop25Finishes = () => {
    const finalPolls = currentDynasty.finalPollsByYear || {}
    const finishes = []
    Object.entries(finalPolls).forEach(([year, yearPolls]) => {
      if (yearPolls?.media) {
        const teamEntry = yearPolls.media.find(p => p.team === teamAbbr)
        if (teamEntry) {
          finishes.push({ year: parseInt(year), rank: teamEntry.rank })
        }
      }
    })
    return finishes.sort((a, b) => b.year - a.year) // Most recent first
  }

  const apTop25Finishes = getApTop25Finishes()

  // Calculate all bowl games for this team from both games[] array and bowlGamesByYear
  const getBowlGamesForTeam = () => {
    const bowlGames = []
    const seenGames = new Set() // Prevent duplicates

    // Helper to get team abbreviation from game (supports tid or legacy fields)
    const getTeamAbbrFromGame = (game, isTeam1) => {
      const tidField = isTeam1 ? 'team1Tid' : 'team2Tid'
      const legacyField = isTeam1 ? 'team1' : 'team2'
      if (game[tidField]) {
        const info = getGameTeamInfo(teams, game[tidField])
        return info?.abbr || game[legacyField]
      }
      return game[legacyField]
    }

    // 1. Check unified games[] array for bowl games where this team played
    const allGames = currentDynasty.games || []
    allGames.forEach(game => {
      // Check for bowl games in the unified system
      const gameType = detectGameType(game)
      if (gameType !== GAME_TYPES.BOWL) return

      // Get perspective to check if user played in this game
      const perspective = getUserGamePerspective(game, currentDynasty)

      // Get team abbreviations from the game (supports both tid and legacy format)
      const team1Abbr = getTeamAbbrFromGame(game, true)
      const team2Abbr = getTeamAbbrFromGame(game, false)

      // Check if user coached the team we're viewing in this game
      const userInfo = perspective?.userTid ? getGameTeamInfo(teams, perspective.userTid) : null
      // Check both tid and abbr for backwards compatibility
      const isUserTeam = perspective?.userTid === tid || userInfo?.abbr === teamAbbr || game.userTeam === teamAbbr || game.userTid === tid

      // Check if team participated (as team1 or team2) - supports both tid and abbr
      const isTeam1 = game.team1Tid === tid || team1Abbr === teamAbbr
      const isTeam2 = game.team2Tid === tid || team2Abbr === teamAbbr

      if (!isUserTeam && !isTeam1 && !isTeam2) return

      const gameKey = `${game.year}-${game.bowlName || game.week}`
      if (seenGames.has(gameKey)) return
      seenGames.add(gameKey)

      if (isUserTeam && perspective) {
        // User game - use perspective for scores
        const oppInfo = getGameTeamInfo(teams, perspective.opponentTid)
        bowlGames.push({
          year: parseInt(game.year),
          bowlName: game.bowlName || 'Bowl Game',
          opponent: oppInfo?.abbr || game.opponent,
          teamScore: perspective.userScore,
          opponentScore: perspective.opponentScore,
          won: perspective.userWon,
          hasScore: perspective.userScore !== null && perspective.opponentScore !== null
        })
      } else {
        // CPU game or team participated but not as user - use team1/team2 format
        const hasScore = game.team1Score !== null && game.team2Score !== null
        const teamWon = hasScore && (
          (isTeam1 && game.team1Score > game.team2Score) ||
          (isTeam2 && game.team2Score > game.team1Score)
        )
        bowlGames.push({
          year: parseInt(game.year),
          bowlName: game.bowlName || 'Bowl Game',
          opponent: isTeam1 ? team2Abbr : team1Abbr,
          teamScore: isTeam1 ? game.team1Score : game.team2Score,
          opponentScore: isTeam1 ? game.team2Score : game.team1Score,
          won: teamWon,
          hasScore
        })
      }
    })

    // 2. Also check legacy bowlGamesByYear for CPU bowl games
    const bowlGamesByYear = currentDynasty.bowlGamesByYear || {}
    Object.entries(bowlGamesByYear).forEach(([year, yearData]) => {
      const allBowls = [...(yearData?.week1 || []), ...(yearData?.week2 || [])]
      allBowls.forEach(bowl => {
        if (!bowl.team1 || !bowl.team2) return

        const isTeam1 = bowl.team1 === teamAbbr
        const isTeam2 = bowl.team2 === teamAbbr
        if (!isTeam1 && !isTeam2) return

        const gameKey = `${year}-${bowl.bowlName}`
        if (seenGames.has(gameKey)) return
        seenGames.add(gameKey)

        const hasScore = bowl.team1Score !== null && bowl.team2Score !== null
        const teamWon = hasScore && (
          (isTeam1 && bowl.team1Score > bowl.team2Score) ||
          (isTeam2 && bowl.team2Score > bowl.team1Score)
        )

        bowlGames.push({
          year: parseInt(year),
          bowlName: bowl.bowlName,
          opponent: isTeam1 ? bowl.team2 : bowl.team1,
          teamScore: isTeam1 ? bowl.team1Score : bowl.team2Score,
          opponentScore: isTeam1 ? bowl.team2Score : bowl.team1Score,
          won: teamWon,
          hasScore
        })
      })
    })

    return bowlGames.sort((a, b) => b.year - a.year) // Most recent first
  }

  const bowlGames = getBowlGamesForTeam()
  const bowlWins = bowlGames.filter(g => g.won)
  const bowlLosses = bowlGames.filter(g => g.hasScore && !g.won)

  // Calculate "Games As" - games where user played AS this team
  // Uses perspective to find games where user coached this specific team
  const getGamesAsTeam = () => {
    const games = currentDynasty.games || []
    return games
      .map(g => {
        const perspective = getUserGamePerspective(g, currentDynasty)
        return perspective ? { ...g, perspective } : null
      })
      .filter(g => {
        if (!g) return false
        // Check if user was coaching this team in this game's year
        // Direct tid comparison - userTid from perspective (coachTeamByYear) vs teamTid from URL
        return g.perspective?.userTid === teamTid
      })
  }

  const gamesAsTeam = getGamesAsTeam()
  const gamesAsWins = gamesAsTeam.filter(g => g.perspective?.userWon).length
  const gamesAsLosses = gamesAsTeam.filter(g => g.perspective && !g.perspective.userWon).length
  const winPctAs = gamesAsTeam.length > 0
    ? ((gamesAsWins / gamesAsTeam.length) * 100).toFixed(1)
    : null

  // Calculate seasons coached as this team
  const seasonsAsTeam = [...new Set(gamesAsTeam.map(g => g.year))].length

  // Calculate current streak vs this team using perspective
  const getStreakVsTeam = () => {
    if (gamesAgainst.length === 0) return null
    // Sort by year descending, then by week descending to get most recent first
    const sortedGames = [...gamesAgainst].sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year
      return (b.week || 0) - (a.week || 0)
    })

    // Get win/loss from perspective, fallback to result field
    const getResult = (game) => {
      if (game.perspective) {
        return game.perspective.userWon ? 'W' : 'L'
      }
      // Legacy fallback
      if (game.result === 'W' || game.result === 'win') return 'W'
      if (game.result === 'L' || game.result === 'loss') return 'L'
      return null
    }

    const firstResult = getResult(sortedGames[0])
    if (!firstResult) return null

    let streak = 0
    for (const game of sortedGames) {
      if (getResult(game) === firstResult) {
        streak++
      } else {
        break
      }
    }
    return { type: firstResult, count: streak }
  }
  const streakVsTeam = getStreakVsTeam()

  // Calculate CFP Appearances - years where this team was seeded in CFP (with game details)
  const getCFPAppearances = () => {
    const cfpSeeds = currentDynasty.cfpSeedsByYear || {}
    const cfpResults = currentDynasty.cfpResultsByYear || {}
    const allGames = currentDynasty.games || []
    const appearances = []

    // Helper to get CFP game type
    const getCfpRound = (g) => {
      if (g.gameType === 'cfp_first_round' || g.isCFPFirstRound) return 'First Round'
      if (g.gameType === 'cfp_quarterfinal' || g.isCFPQuarterfinal) return 'Quarterfinals'
      if (g.gameType === 'cfp_semifinal' || g.isCFPSemifinal) return 'Semifinals'
      if (g.gameType === 'cfp_championship' || g.isCFPChampionship) return 'Championship'
      return null
    }

    // Round order for sorting
    const roundOrder = { 'First Round': 1, 'Quarterfinals': 2, 'Semifinals': 3, 'Championship': 4 }

    Object.entries(cfpSeeds).forEach(([year, yearSeeds]) => {
      if (!Array.isArray(yearSeeds)) return
      const teamSeed = yearSeeds.find(s => s.team === teamAbbr)
      if (!teamSeed) return

      const yearNum = parseInt(year)
      const yearResults = cfpResults[year] || {}
      const games = []

      // First, check user games from games[] array for this team and year
      // Use perspective to find games where user coached this team
      const userCfpGames = allGames
        .filter(g => g.year === yearNum && getCfpRound(g))
        .map(g => {
          const perspective = getUserGamePerspective(g, currentDynasty)
          return perspective ? { ...g, perspective } : null
        })
        .filter(g => {
          if (!g) return false
          // Check if user was coaching this team in this game
          // Direct tid comparison - userTid from perspective (coachTeamByYear) vs teamTid from URL
          return g.perspective?.userTid === teamTid
        })

      userCfpGames.forEach(g => {
        const round = getCfpRound(g)
        const won = g.perspective?.userWon ?? (g.result === 'W' || g.result === 'win')
        // Get opponent info from perspective or fallback
        const opponentInfo = g.perspective?.opponentTid
          ? getGameTeamInfo(teams, g.perspective.opponentTid)
          : null
        const opponent = opponentInfo?.abbr || g.opponent
        games.push({
          round,
          opponent,
          teamScore: g.perspective?.userScore ?? g.teamScore,
          opponentScore: g.perspective?.opponentScore ?? g.opponentScore,
          won,
          gameId: g.id
        })
      })

      // Also check cfpResultsByYear for CPU games involving this team (when user wasn't coaching this team)
      // Only add if we don't already have a user game for that round
      const existingRounds = new Set(games.map(g => g.round))

      // Check first round games from CPU results
      const firstRound = yearResults.firstRound || []
      firstRound.forEach(g => {
        if (g && (g.team1 === teamAbbr || g.team2 === teamAbbr) && !existingRounds.has('First Round')) {
          const isTeam1 = g.team1 === teamAbbr
          games.push({
            round: 'First Round',
            opponent: isTeam1 ? g.team2 : g.team1,
            teamScore: isTeam1 ? g.team1Score : g.team2Score,
            opponentScore: isTeam1 ? g.team2Score : g.team1Score,
            won: g.winner === teamAbbr
          })
        }
      })

      // Check quarterfinals from CPU results
      const quarterfinals = yearResults.quarterfinals || []
      quarterfinals.forEach(g => {
        if (g && (g.team1 === teamAbbr || g.team2 === teamAbbr) && !existingRounds.has('Quarterfinals')) {
          const isTeam1 = g.team1 === teamAbbr
          games.push({
            round: 'Quarterfinals',
            opponent: isTeam1 ? g.team2 : g.team1,
            teamScore: isTeam1 ? g.team1Score : g.team2Score,
            opponentScore: isTeam1 ? g.team2Score : g.team1Score,
            won: g.winner === teamAbbr
          })
        }
      })

      // Check semifinals from CPU results
      const semifinals = yearResults.semifinals || []
      semifinals.forEach(g => {
        if (g && (g.team1 === teamAbbr || g.team2 === teamAbbr) && !existingRounds.has('Semifinals')) {
          const isTeam1 = g.team1 === teamAbbr
          games.push({
            round: 'Semifinals',
            opponent: isTeam1 ? g.team2 : g.team1,
            teamScore: isTeam1 ? g.team1Score : g.team2Score,
            opponentScore: isTeam1 ? g.team2Score : g.team1Score,
            won: g.winner === teamAbbr
          })
        }
      })

      // Check championship from CPU results
      const championship = yearResults.championship?.[0]
      if (championship && (championship.team1 === teamAbbr || championship.team2 === teamAbbr) && !existingRounds.has('Championship')) {
        const isTeam1 = championship.team1 === teamAbbr
        games.push({
          round: 'Championship',
          opponent: isTeam1 ? championship.team2 : championship.team1,
          teamScore: isTeam1 ? championship.team1Score : championship.team2Score,
          opponentScore: isTeam1 ? championship.team2Score : championship.team1Score,
          won: championship.winner === teamAbbr
        })
      }

      // Sort games by round order
      games.sort((a, b) => (roundOrder[a.round] || 0) - (roundOrder[b.round] || 0))

      // Determine result based on last game played
      let result = 'Pending'
      if (games.length > 0) {
        const lastGame = games[games.length - 1]
        if (lastGame.won && lastGame.round === 'Championship') {
          result = 'Champion'
        } else if (!lastGame.won) {
          result = `Lost ${lastGame.round}`
        }
        // If won but not championship, still pending (more games to play)
      }

      appearances.push({
        year: yearNum,
        seed: teamSeed.seed,
        games,
        result
      })
    })

    return appearances.sort((a, b) => b.year - a.year) // Most recent first
  }

  const cfpAppearances = getCFPAppearances()

  // Calculate National Titles - years where this team won the CFP Championship
  const getNationalTitles = () => {
    const cfpResults = currentDynasty.cfpResultsByYear || {}
    const titles = []
    Object.entries(cfpResults).forEach(([year, yearResults]) => {
      const championship = yearResults?.championship
      if (Array.isArray(championship) && championship.length > 0) {
        const game = championship[0]
        // Check both tid and abbr for team matching
        const teamWon = game?.winner === teamAbbr || game?.winnerTid === tid
        if (teamWon) {
          const isTeam1 = game.team1Tid === tid || game.team1 === teamAbbr
          titles.push({
            year: parseInt(year),
            opponent: isTeam1 ? game.team2 : game.team1,
            teamScore: isTeam1 ? game.team1Score : game.team2Score,
            opponentScore: isTeam1 ? game.team2Score : game.team1Score
          })
        }
      }
    })
    return titles.sort((a, b) => b.year - a.year) // Most recent first
  }

  const nationalTitles = getNationalTitles()

  // Calculate All-Americans - all All-Americans for this team (all teams, not just 1st)
  const getAllAmericans = () => {
    const players = currentDynasty.players || []
    const allAmericans = []

    players.forEach(player => {
      // Check if player belongs to this team via teamsByYear or team field
      // Supports both tid and abbr for backwards compatibility
      const teamsByYearValues = Object.values(player.teamsByYear || {})
      const belongsToTeam = teamsByYearValues.includes(tid) || teamsByYearValues.includes(teamAbbr) ||
        player.team === tid || player.team === teamAbbr || player.teams?.includes(teamAbbr)
      if (!belongsToTeam) return

      const awards = player.allAmericans || []
      awards.forEach(aa => {
        allAmericans.push({
          playerName: player.name,
          playerPID: player.pid,
          position: player.position,
          year: aa.year,
          team: aa.team // 1st Team, 2nd Team, etc.
        })
      })
    })

    return allAmericans.sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year
      // Sort by team (1st, 2nd, 3rd)
      const teamOrder = { '1st Team': 1, 'First Team': 1, '2nd Team': 2, 'Second Team': 2, '3rd Team': 3, 'Third Team': 3 }
      return (teamOrder[a.team] || 4) - (teamOrder[b.team] || 4)
    })
  }

  const allAmericans = getAllAmericans()

  // Get conference titles with details
  const getConferenceTitlesDetails = () => {
    const titles = []
    Object.entries(currentDynasty.conferenceChampionshipsByYear || {}).forEach(([year, yearChamps]) => {
      yearChamps.forEach(cc => {
        if (cc.winner === teamAbbr) {
          titles.push({
            year: parseInt(year),
            conference: cc.conference,
            opponent: cc.team1 === teamAbbr ? cc.team2 : cc.team1,
            teamScore: cc.team1 === teamAbbr ? cc.team1Score : cc.team2Score,
            opponentScore: cc.team1 === teamAbbr ? cc.team2Score : cc.team1Score
          })
        }
      })
    })
    return titles.sort((a, b) => b.year - a.year)
  }

  const conferenceTitlesDetails = getConferenceTitlesDetails()

  // Get bowl result for a specific year (returns { bowlName, won } or null)
  const getBowlResultForYear = (year) => {
    const yearData = currentDynasty.bowlGamesByYear?.[year]
    if (!yearData) return null

    const allBowls = [...(yearData?.week1 || []), ...(yearData?.week2 || [])]
    const teamBowl = allBowls.find(bowl =>
      (bowl.team1 === teamAbbr || bowl.team2 === teamAbbr) &&
      bowl.team1Score !== null && bowl.team2Score !== null
    )

    if (!teamBowl) return null

    const isTeam1 = teamBowl.team1 === teamAbbr
    const won = (isTeam1 && teamBowl.team1Score > teamBowl.team2Score) ||
                (!isTeam1 && teamBowl.team2Score > teamBowl.team1Score)

    return {
      bowlName: teamBowl.bowlName,
      won
    }
  }

  // Build years array
  const years = []
  for (let year = startYear; year <= currentYear; year++) {
    years.push(year)
  }

  // Get team record from conference standings for a specific year
  const getTeamRecordFromStandings = (year) => {
    const standingsByYear = currentDynasty.conferenceStandingsByYear || {}
    const yearStandings = standingsByYear[year] || {}

    for (const confTeams of Object.values(yearStandings)) {
      if (Array.isArray(confTeams)) {
        const teamData = confTeams.find(t => t && t.team === teamAbbr)
        if (teamData) {
          return {
            wins: teamData.wins || 0,
            losses: teamData.losses || 0
          }
        }
      }
    }
    return null
  }

  // Get team record from games played for a specific year (fallback when standings not available)
  // Uses perspective to find games where user coached this team
  const getTeamRecordFromGames = (year) => {
    const games = currentDynasty.games || []
    // Filter games where user played AS this team in this year
    const teamGames = games
      .filter(g => Number(g.year) === Number(year))
      .map(g => {
        const perspective = getUserGamePerspective(g, currentDynasty)
        return perspective ? { ...g, perspective } : null
      })
      .filter(g => {
        if (!g) return false
        // Check if user was coaching this team in this game
        // Direct tid comparison - userTid from perspective (coachTeamByYear) vs teamTid from URL
        return g.perspective?.userTid === teamTid
      })

    if (teamGames.length === 0) return null

    const wins = teamGames.filter(g => g.perspective?.userWon).length
    const losses = teamGames.filter(g => g.perspective && !g.perspective.userWon).length

    return { wins, losses }
  }

  // Check if team won conference championship in a year
  const getConferenceChampionshipForYear = (year) => {
    const yearChampionships = currentDynasty.conferenceChampionshipsByYear?.[year] || []
    const teamCC = yearChampionships.find(cc =>
      cc && (cc.team1 === teamAbbr || cc.team2 === teamAbbr) &&
      cc.winner === teamAbbr
    )
    return teamCC ? teamCC.conference : null
  }

  // Check if team was in CFP this year and where they were eliminated
  const getCFPResultForYear = (year) => {
    const cfpSeeds = currentDynasty.cfpSeedsByYear?.[year] || []
    const teamSeed = cfpSeeds.find(s => s && s.team === teamAbbr)
    if (!teamSeed) return null

    const cfpResults = currentDynasty.cfpResultsByYear?.[year] || {}

    // Check for national championship win
    const championship = cfpResults.championship?.[0]
    if (championship && championship.winner === teamAbbr) {
      return { type: 'champion', seed: teamSeed.seed }
    }

    // Check if lost in championship game
    if (championship && (championship.team1 === teamAbbr || championship.team2 === teamAbbr)) {
      return { type: 'lost', round: 'Champ', seed: teamSeed.seed }
    }

    // Check if lost in semifinals
    const semifinals = cfpResults.semifinals || []
    const sfGame = semifinals.find(g => g && (g.team1 === teamAbbr || g.team2 === teamAbbr))
    if (sfGame && sfGame.winner && sfGame.winner !== teamAbbr) {
      return { type: 'lost', round: 'SF', seed: teamSeed.seed }
    }

    // Check if lost in quarterfinals
    const quarterfinals = cfpResults.quarterfinals || []
    const qfGame = quarterfinals.find(g => g && (g.team1 === teamAbbr || g.team2 === teamAbbr))
    if (qfGame && qfGame.winner && qfGame.winner !== teamAbbr) {
      return { type: 'lost', round: 'QF', seed: teamSeed.seed }
    }

    // Check if lost in first round (seeds 5-12 play first round)
    const firstRound = cfpResults.firstRound || []
    const r1Game = firstRound.find(g => g && (g.team1 === teamAbbr || g.team2 === teamAbbr))
    if (r1Game && r1Game.winner && r1Game.winner !== teamAbbr) {
      return { type: 'lost', round: 'R1', seed: teamSeed.seed }
    }

    // Team is in CFP but results not yet entered
    return { type: 'pending', seed: teamSeed.seed }
  }

  // Get final ranking for a specific year
  const getFinalRankingForYear = (year) => {
    const pollsData = currentDynasty.finalPollsByYear?.[year]
    if (!pollsData?.media) return null
    const teamRank = pollsData.media.find(p => p && p.team === teamAbbr)
    return teamRank?.rank || null
  }

  // Calculate record for each year from conference standings (or games played as fallback)
  const yearRecords = years.map(year => {
    const standingsRecord = getTeamRecordFromStandings(year)
    const gamesRecord = getTeamRecordFromGames(year)
    // Use standings record first, fall back to games record
    const record = standingsRecord || gamesRecord
    const bowlResult = getBowlResultForYear(year)
    const ccWin = getConferenceChampionshipForYear(year)
    const cfpResult = getCFPResultForYear(year)
    const finalRank = getFinalRankingForYear(year)

    return {
      year,
      wins: record?.wins || 0,
      losses: record?.losses || 0,
      hasRecord: !!record,
      bowlResult,
      ccWin,
      cfpResult,
      finalRank
    }
  })

  // Find best and worst years (only years with records)
  const yearsWithRecords = yearRecords.filter(yr => yr.hasRecord)
  let bestYear = null
  let worstYear = null

  if (yearsWithRecords.length > 0) {
    bestYear = yearsWithRecords.reduce((best, curr) => {
      if (curr.wins > best.wins) return curr
      if (curr.wins === best.wins && curr.losses < best.losses) return curr
      return best
    })

    worstYear = yearsWithRecords.reduce((worst, curr) => {
      if (curr.losses > worst.losses) return curr
      if (curr.losses === worst.losses && curr.wins < worst.wins) return curr
      return worst
    })
  }

  // Calculate all-time record
  const allTimeTeamWins = yearsWithRecords.reduce((sum, yr) => sum + yr.wins, 0)
  const allTimeTeamLosses = yearsWithRecords.reduce((sum, yr) => sum + yr.losses, 0)
  const allTimeTeamWinPct = (allTimeTeamWins + allTimeTeamLosses) > 0
    ? ((allTimeTeamWins / (allTimeTeamWins + allTimeTeamLosses)) * 100).toFixed(1)
    : null

  // Calculate vs user record (for Your History section)
  // gamesAgainst already has perspective attached
  const vsUserYearRecords = years.map(year => {
    const yearGames = gamesAgainst.filter(g => g.year === year)
    const wins = yearGames.filter(g => g.perspective?.userWon).length
    const losses = yearGames.filter(g => g.perspective && !g.perspective.userWon).length
    return { year, wins, losses, hasGames: yearGames.length > 0 }
  })
  const vsUserYearsWithGames = vsUserYearRecords.filter(yr => yr.hasGames)

  // Stat cell component
  const StatCell = ({ label, value, subValue }) => (
    <div className="text-center p-3 rounded-lg" style={{ backgroundColor: `${teamBgText}10` }}>
      <div className="text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: teamBgText, opacity: 0.7 }}>
        {label}
      </div>
      <div className="text-xl font-bold" style={{ color: teamBgText }}>
        {value}
      </div>
      {subValue && (
        <div className="text-xs mt-1" style={{ color: teamBgText, opacity: 0.6 }}>
          {subValue}
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Navigation Row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Team Dropdown */}
        <select
          value={tid}
          onChange={(e) => navigate(`${pathPrefix}/team/${e.target.value}`)}
          className="px-3 py-2 rounded-lg font-semibold cursor-pointer focus:outline-none focus:ring-2 ml-auto"
          style={{
            backgroundColor: teamInfo.backgroundColor,
            color: teamBgText,
            border: `2px solid ${teamBgText}40`
          }}
        >
          {allTeams.map((t) => (
            <option key={t.tid} value={t.tid}>
              {t.shortName}
            </option>
          ))}
        </select>
      </div>

      {/* Team Header */}
      <div
        className="rounded-lg shadow-lg p-6"
        style={{
          backgroundColor: teamInfo.backgroundColor,
          border: `3px solid ${teamInfo.textColor}`
        }}
      >
        <div className="flex items-center gap-4">
          {teamLogo && (
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center flex-shrink-0"
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
          <div className="flex-1">
            <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: teamBgText, opacity: 0.7 }}>
              Team History
            </p>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold" style={{ color: teamBgText }}>
                {finalRanking && (
                  <span className="text-yellow-400 mr-2">#{finalRanking.rank}</span>
                )}
                {mascotName || teamInfo.name}
              </h1>
              {/* Edit button for teambuilder teams */}
              {teamInfo.isTeambuilder && !isViewOnly && (
                <button
                  onClick={() => setShowTeambuilderEditModal(true)}
                  className="p-1.5 rounded-lg transition-colors hover:opacity-80"
                  style={{
                    backgroundColor: `${teamBgText}20`,
                    color: teamBgText
                  }}
                  title="Edit teambuilder team"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              )}
            </div>
            {conference && (
              <div className="flex items-center gap-2 mt-2">
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
            {/* Teambuilder badge */}
            {teamInfo.isTeambuilder && (
              <div
                className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded text-xs font-medium"
                style={{
                  backgroundColor: `${teamBgText}20`,
                  color: teamBgText
                }}
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                </svg>
                Teambuilder
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Season-by-Season History - Moved to top */}
      <div
        className="rounded-lg shadow-lg overflow-hidden"
        style={{
          backgroundColor: teamInfo.backgroundColor,
          border: `3px solid ${teamInfo.textColor}`
        }}
      >
        <div
          className="px-4 py-3"
          style={{ backgroundColor: teamInfo.textColor }}
        >
          <h2 className="text-lg font-bold" style={{ color: teamPrimaryText }}>
            Season-by-Season History
          </h2>
        </div>

        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {[...yearRecords].reverse().map((yr) => {
            const isNationalChamp = yr.cfpResult?.type === 'champion'
            const madePlayoff = yr.cfpResult && yr.cfpResult.type !== 'pending'
            const hasAchievement = yr.ccWin || isNationalChamp

            return (
              <Link
                key={yr.year}
                to={`${pathPrefix}/team/${tid}/${yr.year}`}
                className="p-4 rounded-lg text-center transition-transform hover:scale-[1.02]"
                style={{
                  backgroundColor: isNationalChamp
                    ? '#fbbf2420'
                    : hasAchievement
                      ? `${teamInfo.textColor}15`
                      : yr.hasRecord
                        ? `${teamBgText}15`
                        : `${teamBgText}05`,
                  border: isNationalChamp
                    ? '2px solid #fbbf24'
                    : hasAchievement
                      ? `2px solid ${teamInfo.textColor}`
                      : `2px solid ${yr.hasRecord ? `${teamBgText}40` : `${teamBgText}20`}`
                }}
              >
                {/* Year with optional ranking */}
                <div className="text-lg font-bold" style={{ color: teamBgText }}>
                  {yr.finalRank && (
                    <span className="text-yellow-500 mr-1">#{yr.finalRank}</span>
                  )}
                  {yr.year}
                </div>

                {/* Record */}
                <div
                  className="text-2xl font-bold mt-1"
                  style={{ color: yr.hasRecord ? teamBgText : `${teamBgText}50` }}
                >
                  {yr.hasRecord ? `${yr.wins}-${yr.losses}` : '--'}
                </div>

                {/* Achievements */}
                <div className="mt-2 space-y-1">
                  {/* National Champion */}
                  {isNationalChamp && (
                    <div
                      className="text-xs font-bold px-2 py-1 rounded"
                      style={{ backgroundColor: '#fbbf24', color: '#78350f' }}
                    >
                      National Champion
                    </div>
                  )}

                  {/* Conference Champion (not national champ) */}
                  {yr.ccWin && !isNationalChamp && (
                    <div
                      className="text-xs font-semibold px-2 py-1 rounded"
                      style={{ backgroundColor: teamInfo.textColor, color: teamPrimaryText }}
                    >
                      {yr.ccWin} Champs
                    </div>
                  )}

                  {/* CFP Result - show round eliminated (not champion) */}
                  {yr.cfpResult && yr.cfpResult.type === 'lost' && (
                    <div
                      className="text-xs font-semibold px-2 py-1 rounded"
                      style={{ backgroundColor: '#3b82f6', color: '#ffffff' }}
                    >
                      CFP {yr.cfpResult.round}
                    </div>
                  )}

                  {/* Bowl Game - only show if NOT in CFP and played a bowl */}
                  {yr.bowlResult && !madePlayoff && !isNationalChamp && (
                    <div
                      className="text-xs font-semibold px-2 py-1 rounded"
                      style={{
                        backgroundColor: yr.bowlResult.won ? '#16a34a' : '#6b728080',
                        color: '#FFFFFF'
                      }}
                    >
                      {yr.bowlResult.bowlName}
                    </div>
                  )}
                </div>

                {/* No data message */}
                {!yr.hasRecord && !yr.bowlResult && !yr.ccWin && !yr.cfpResult && (
                  <div className="text-xs mt-1" style={{ color: teamBgText, opacity: 0.6 }}>
                    No data
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      </div>

      {/* Team Accomplishments */}
      <div
        className="rounded-lg shadow-lg overflow-hidden"
        style={{
          backgroundColor: teamInfo.backgroundColor,
          border: `3px solid ${teamInfo.textColor}`
        }}
      >
        <div
          className="px-4 py-3"
          style={{ backgroundColor: teamInfo.textColor }}
        >
          <h2 className="text-lg font-bold" style={{ color: teamPrimaryText }}>
            Team Accomplishments
          </h2>
        </div>

        <div className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {/* All-Time Record - Clickable */}
            <button
              onClick={() => setShowAllTimeModal(true)}
              className="text-center p-3 rounded-lg transition-all cursor-pointer hover:scale-[1.02]"
              style={{ backgroundColor: `${teamBgText}10` }}
            >
              <div className="text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: teamBgText, opacity: 0.7 }}>
                All-Time
              </div>
              <div className="text-xl font-bold" style={{ color: teamBgText }}>
                {`${allTimeTeamWins}-${allTimeTeamLosses}`}
              </div>
              <div className="text-xs mt-1" style={{ color: teamBgText, opacity: 0.6 }}>
                {allTimeTeamWinPct ? `${allTimeTeamWinPct}%` : 'Click to view'}
              </div>
            </button>

            {/* AP Top 25 */}
            <button
              onClick={() => setShowApTop25Modal(true)}
              className="text-center p-3 rounded-lg transition-all cursor-pointer hover:scale-[1.02]"
              style={{ backgroundColor: `${teamBgText}10` }}
            >
              <div className="text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: teamBgText, opacity: 0.7 }}>
                AP Top 25
              </div>
              <div className="text-xl font-bold" style={{ color: apTop25Finishes.length > 0 ? teamBgText : `${teamBgText}50` }}>
                {apTop25Finishes.length || 0}
              </div>
              <div className="text-xs mt-1" style={{ color: teamBgText, opacity: 0.6 }}>
                Finishes
              </div>
            </button>

            {/* Conf Titles */}
            <button
              onClick={() => setShowConfTitlesModal(true)}
              className="text-center p-3 rounded-lg transition-all cursor-pointer hover:scale-[1.02]"
              style={{ backgroundColor: `${teamBgText}10` }}
            >
              <div className="text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: teamBgText, opacity: 0.7 }}>
                Conf Titles
              </div>
              <div className="text-xl font-bold" style={{ color: conferenceTitlesDetails.length > 0 ? teamBgText : `${teamBgText}50` }}>
                {conferenceTitlesDetails.length || 0}
              </div>
              <div className="text-xs mt-1" style={{ color: teamBgText, opacity: 0.6 }}>
                Click to view
              </div>
            </button>

            {/* Bowl Games */}
            <button
              onClick={() => setShowBowlGamesModal(true)}
              className="text-center p-3 rounded-lg transition-all cursor-pointer hover:scale-[1.02]"
              style={{ backgroundColor: `${teamBgText}10` }}
            >
              <div className="text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: teamBgText, opacity: 0.7 }}>
                Bowl Games
              </div>
              <div className="text-xl font-bold" style={{ color: bowlGames.length > 0 ? teamBgText : `${teamBgText}50` }}>
                {bowlWins.length}-{bowlLosses.length}
              </div>
              <div className="text-xs mt-1" style={{ color: teamBgText, opacity: 0.6 }}>
                Click to view
              </div>
            </button>

            {/* CFP Apps */}
            <button
              onClick={() => setShowCfpAppsModal(true)}
              className="text-center p-3 rounded-lg transition-all cursor-pointer hover:scale-[1.02]"
              style={{ backgroundColor: `${teamBgText}10` }}
            >
              <div className="text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: teamBgText, opacity: 0.7 }}>
                CFP Apps
              </div>
              <div className="text-xl font-bold" style={{ color: cfpAppearances.length > 0 ? teamBgText : `${teamBgText}50` }}>
                {cfpAppearances.length || 0}
              </div>
              <div className="text-xs mt-1" style={{ color: teamBgText, opacity: 0.6 }}>
                Click to view
              </div>
            </button>

            {/* Natl Titles */}
            <button
              onClick={() => setShowNatlTitlesModal(true)}
              className="text-center p-3 rounded-lg transition-all cursor-pointer hover:scale-[1.02]"
              style={{ backgroundColor: `${teamBgText}10` }}
            >
              <div className="text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: teamBgText, opacity: 0.7 }}>
                Natl Titles
              </div>
              <div className="text-xl font-bold" style={{ color: nationalTitles.length > 0 ? teamBgText : `${teamBgText}50` }}>
                {nationalTitles.length || 0}
              </div>
              <div className="text-xs mt-1" style={{ color: teamBgText, opacity: 0.6 }}>
                Click to view
              </div>
            </button>

            {/* All-Americans */}
            <button
              onClick={() => setShowAllAmericansModal(true)}
              className="text-center p-3 rounded-lg transition-all cursor-pointer hover:scale-[1.02]"
              style={{ backgroundColor: `${teamBgText}10` }}
            >
              <div className="text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: teamBgText, opacity: 0.7 }}>
                All-Americans
              </div>
              <div className="text-xl font-bold" style={{ color: allAmericans.length > 0 ? teamBgText : `${teamBgText}50` }}>
                {allAmericans.length || 0}
              </div>
              <div className="text-xs mt-1" style={{ color: teamBgText, opacity: 0.6 }}>
                Click to view
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* User History with Team */}
      <div
        className="rounded-lg shadow-lg overflow-hidden"
        style={{
          backgroundColor: teamInfo.backgroundColor,
          border: `3px solid ${teamInfo.textColor}`
        }}
      >
        <div
          className="px-4 py-3"
          style={{ backgroundColor: teamInfo.textColor }}
        >
          <h2 className="text-lg font-bold" style={{ color: teamPrimaryText }}>
            Your History
          </h2>
        </div>

        <div className="p-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Record As This Team */}
            <button
              onClick={() => gamesAsTeam.length > 0 && setShowAsTeamModal(true)}
              className={`p-4 rounded-lg text-center transition-all ${gamesAsTeam.length > 0 ? 'cursor-pointer hover:scale-[1.02]' : 'cursor-default'}`}
              style={{ backgroundColor: `${teamBgText}10` }}
              disabled={gamesAsTeam.length === 0}
            >
              <div className="text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: teamBgText, opacity: 0.7 }}>
                As {teamAbbr}
              </div>
              <div className="text-3xl font-bold" style={{ color: gamesAsTeam.length > 0 ? teamBgText : `${teamBgText}50` }}>
                {gamesAsTeam.length > 0 ? `${gamesAsWins}-${gamesAsLosses}` : '--'}
              </div>
              <div className="text-xs mt-1" style={{ color: teamBgText, opacity: 0.6 }}>
                {winPctAs ? `${winPctAs}% • ${seasonsAsTeam} season${seasonsAsTeam !== 1 ? 's' : ''}` : 'No games'}
              </div>
            </button>

            {/* Record Against This Team */}
            <button
              onClick={() => gamesAgainst.length > 0 && setShowGamesModal(true)}
              className={`p-4 rounded-lg text-center transition-all ${gamesAgainst.length > 0 ? 'cursor-pointer hover:scale-[1.02]' : 'cursor-default'}`}
              style={{ backgroundColor: `${teamBgText}10` }}
              disabled={gamesAgainst.length === 0}
            >
              <div className="text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: teamBgText, opacity: 0.7 }}>
                Vs {teamAbbr}
              </div>
              <div className="text-3xl font-bold" style={{ color: gamesAgainst.length > 0 ? teamBgText : `${teamBgText}50` }}>
                {gamesAgainst.length > 0 ? `${allTimeWins}-${allTimeLosses}` : '--'}
              </div>
              <div className="text-xs mt-1" style={{ color: teamBgText, opacity: 0.6 }}>
                {winPctVs ? `${winPctVs}%${streakVsTeam ? ` • ${streakVsTeam.type}${streakVsTeam.count}` : ''}` : 'No games'}
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Games Against Modal */}
      {showGamesModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowGamesModal(false)}
        >
          <div
            className="rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden"
            style={{
              backgroundColor: teamInfo.backgroundColor,
              border: `3px solid ${teamInfo.textColor}`
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              className="px-4 py-3 flex items-center justify-between"
              style={{ backgroundColor: teamInfo.textColor }}
            >
              <div className="flex items-center gap-3">
                {teamLogo && (
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: '#FFFFFF', padding: '2px' }}
                  >
                    <img
                      src={teamLogo}
                      alt={`${teamAbbr} logo`}
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}
                <h2 className="text-lg font-bold" style={{ color: teamPrimaryText }}>
                  User vs {teamAbbr}
                </h2>
              </div>
              <button
                onClick={() => setShowGamesModal(false)}
                className="p-1 rounded hover:bg-black/10 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke={teamPrimaryText} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {/* Record Summary */}
              <div
                className="text-center p-4 rounded-lg mb-4"
                style={{ backgroundColor: `${teamBgText}15` }}
              >
                <div className="text-3xl font-bold" style={{ color: teamBgText }}>
                  {allTimeWins}-{allTimeLosses}
                </div>
                <div className="text-sm" style={{ color: teamBgText, opacity: 0.7 }}>
                  All-Time Record ({winPctVs}%)
                </div>
              </div>

              {/* Games List */}
              <div className="space-y-2">
                {gamesAgainst
                  .sort((a, b) => {
                    // Sort by year desc, then week desc
                    if (b.year !== a.year) return b.year - a.year
                    return (b.week || 0) - (a.week || 0)
                  })
                  .map((game, idx) => {
                    // Use perspective for unified format, fallback to legacy fields
                    const isWin = game.perspective?.userWon ?? (game.result === 'W' || game.result === 'win')
                    // Get user's team for this game (they may have coached different teams)
                    const userTeamInfoFromPerspective = game.perspective?.userTid
                      ? getGameTeamInfo(teams, game.perspective.userTid)
                      : null
                    const userTeamForGame = userTeamInfoFromPerspective?.abbr || game.userTeam || userTeamAbbr
                    const userTeamInfo = teamAbbreviations[userTeamForGame] || {}
                    const userTeamBgColor = userTeamInfoFromPerspective?.primaryColor || userTeamInfo.backgroundColor || '#4B5563'
                    const userTeamTextColor = getContrastTextColor(userTeamBgColor)
                    const userTeamMascotName = getMascotName(userTeamForGame, teamsSource)
                    const userTeamLogo = userTeamMascotName ? getTeamLogo(userTeamMascotName) : null

                    // Get scores from perspective or legacy fields
                    const userScore = game.perspective?.userScore ?? game.teamScore
                    const opponentScore = game.perspective?.opponentScore ?? game.opponentScore
                    const hasScores = userScore != null && opponentScore != null

                    // Get location from perspective or legacy
                    const isHome = game.perspective?.isHome ?? (game.location === 'home')

                    return (
                      <Link
                        key={game.id || idx}
                        to={`${pathPrefix}/game/${game.id}`}
                        className="flex items-center justify-between p-3 rounded-lg hover:scale-[1.01] transition-transform"
                        style={{
                          backgroundColor: userTeamBgColor,
                          border: `3px solid ${isWin ? '#16a34a' : '#dc2626'}`
                        }}
                        onClick={() => setShowGamesModal(false)}
                      >
                        <div className="flex items-center gap-3">
                          {/* W/L Badge */}
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                            style={{
                              backgroundColor: isWin ? '#16a34a' : '#dc2626',
                              color: '#FFFFFF'
                            }}
                          >
                            {isWin ? 'W' : 'L'}
                          </div>
                          {/* User's Team Logo */}
                          {userTeamLogo && (
                            <div
                              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: '#FFFFFF', border: `2px solid ${userTeamInfoFromPerspective?.secondaryColor || userTeamInfo.textColor || '#FFFFFF'}`, padding: '2px' }}
                            >
                              <img src={userTeamLogo} alt={userTeamForGame} className="w-full h-full object-contain" />
                            </div>
                          )}
                          <div>
                            <div className="font-semibold" style={{ color: userTeamTextColor }}>
                              {game.year} {game.week ? `Week ${game.week}` : game.bowlName || ''}
                            </div>
                            <div className="text-sm" style={{ color: userTeamTextColor, opacity: 0.8 }}>
                              {isHome ? 'vs' : '@'} {teamAbbr}
                              {userTeamForGame !== userTeamAbbr && (
                                <span className="ml-1 opacity-70">(as {userTeamForGame})</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-lg" style={{ color: userTeamTextColor }}>
                            {hasScores ? `${Math.max(userScore, opponentScore)}-${Math.min(userScore, opponentScore)}` : '-'}
                          </div>
                        </div>
                      </Link>
                    )
                  })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* All-Time Record Modal */}
      {showAllTimeModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowAllTimeModal(false)}
        >
          <div
            className="rounded-lg shadow-xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col"
            style={{
              backgroundColor: teamInfo.backgroundColor,
              border: `3px solid ${teamInfo.textColor}`
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="px-4 py-3 flex items-center justify-between flex-shrink-0"
              style={{ backgroundColor: teamInfo.textColor }}
            >
              <div className="flex items-center gap-3">
                {teamLogo && (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: '#FFFFFF', padding: '2px' }}>
                    <img src={teamLogo} alt={`${teamAbbr} logo`} className="w-full h-full object-contain" />
                  </div>
                )}
                <div>
                  <h2 className="text-lg font-bold" style={{ color: teamPrimaryText }}>All-Time Record</h2>
                  <p className="text-sm opacity-80" style={{ color: teamPrimaryText }}>
                    {allTimeTeamWins}-{allTimeTeamLosses} ({allTimeTeamWinPct}%)
                  </p>
                </div>
              </div>
              <button onClick={() => setShowAllTimeModal(false)} className="p-1 rounded hover:bg-black/10 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke={teamPrimaryText} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {yearsWithRecords.length === 0 ? (
                <div className="text-center py-12 opacity-60" style={{ color: teamBgText }}>
                  <p className="text-lg font-semibold">No games yet</p>
                  <p className="text-sm mt-1">Games will appear here as you play them</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {[...yearsWithRecords].reverse().map((yr) => {
                    const yearGames = gamesAsTeam.filter(g => Number(g.year) === yr.year)
                    if (yearGames.length === 0) return null

                    return (
                      <div key={yr.year}>
                        <div
                          className="px-3 py-2 rounded-lg mb-2 font-bold text-sm flex items-center justify-between"
                          style={{ backgroundColor: teamInfo.textColor, color: teamPrimaryText }}
                        >
                          <span>{yr.year} Season</span>
                          <span>{yr.wins}-{yr.losses}</span>
                        </div>
                        <div className="space-y-2">
                          {yearGames
                            .sort((a, b) => (b.week || 0) - (a.week || 0))
                            .map((game, idx) => {
                              // Use perspective for unified format, fallback to legacy fields
                              const isWin = game.perspective?.userWon ?? (game.result === 'W' || game.result === 'win')
                              const oppTeamInfo = game.perspective?.opponentTid
                                ? getGameTeamInfo(teams, game.perspective.opponentTid)
                                : null
                              const oppAbbr = oppTeamInfo?.abbr || (teamAbbreviations[game.opponent] ? game.opponent : getAbbrFromTeamName(game.opponent))
                              const oppInfo = teamAbbreviations[oppAbbr] || {}
                              const oppBgColor = oppTeamInfo?.primaryColor || oppInfo.backgroundColor || '#4B5563'
                              const oppTextColor = getContrastTextColor(oppBgColor)
                              const oppMascotName = getMascotName(oppAbbr, teamsSource)
                              const oppLogo = oppMascotName ? getTeamLogo(oppMascotName) : null

                              // Get scores from perspective or legacy fields
                              const userScore = game.perspective?.userScore ?? game.teamScore
                              const opponentScore = game.perspective?.opponentScore ?? game.opponentScore
                              const hasScores = userScore != null && opponentScore != null

                              // Get location from perspective or legacy
                              const isHome = game.perspective?.isHome ?? (game.location === 'home')

                              return (
                                <Link
                                  key={game.id || idx}
                                  to={`${pathPrefix}/game/${game.id}`}
                                  className="flex items-center justify-between p-3 rounded-lg hover:scale-[1.01] transition-transform"
                                  style={{
                                    backgroundColor: oppBgColor,
                                    border: `3px solid ${isWin ? '#16a34a' : '#dc2626'}`
                                  }}
                                  onClick={() => setShowAllTimeModal(false)}
                                >
                                  <div className="flex items-center gap-3">
                                    <div
                                      className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                                      style={{ backgroundColor: isWin ? '#16a34a' : '#dc2626', color: '#FFFFFF' }}
                                    >
                                      {isWin ? 'W' : 'L'}
                                    </div>
                                    {oppLogo && (
                                      <div
                                        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                                        style={{ backgroundColor: '#FFFFFF', border: `2px solid ${oppTeamInfo?.secondaryColor || oppInfo.textColor || '#FFFFFF'}`, padding: '2px' }}
                                      >
                                        <img src={oppLogo} alt={oppAbbr} className="w-full h-full object-contain" />
                                      </div>
                                    )}
                                    <div>
                                      <div className="font-semibold" style={{ color: oppTextColor }}>
                                        {game.week ? `Week ${game.week}` : game.bowlName || 'Game'}
                                      </div>
                                      <div className="text-sm" style={{ color: oppTextColor, opacity: 0.8 }}>
                                        {isHome ? 'vs' : '@'} {getSchoolName(oppMascotName) || oppAbbr}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="font-bold text-lg" style={{ color: oppTextColor }}>
                                      {hasScores ? `${Math.max(userScore, opponentScore)}-${Math.min(userScore, opponentScore)}` : '-'}
                                    </div>
                                  </div>
                                </Link>
                              )
                            })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* AP Top 25 Modal */}
      {showApTop25Modal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowApTop25Modal(false)}
        >
          <div
            className="rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden"
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
                <h2 className="text-lg font-bold" style={{ color: teamPrimaryText }}>AP Top 25 Finishes</h2>
              </div>
              <button onClick={() => setShowApTop25Modal(false)} className="p-1 rounded hover:bg-black/10 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke={teamPrimaryText} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {apTop25Finishes.length === 0 ? (
                <div className="text-center py-12 opacity-60" style={{ color: teamBgText }}>
                  <p className="text-lg font-semibold">No AP Top 25 finishes yet</p>
                </div>
              ) : (
              <div className="space-y-2">
                {apTop25Finishes.map((finish, idx) => (
                  <Link
                    key={idx}
                    to={`${pathPrefix}/team/${tid}/${finish.year}`}
                    className="flex items-center justify-between p-3 rounded-lg hover:scale-[1.01] transition-transform"
                    style={{ backgroundColor: `${teamBgText}10`, border: `2px solid ${teamBgText}20` }}
                    onClick={() => setShowApTop25Modal(false)}
                  >
                    <div className="font-semibold" style={{ color: teamBgText }}>{finish.year}</div>
                    <div className="text-xl font-bold" style={{ color: teamBgText }}>#{finish.rank}</div>
                  </Link>
                ))}
              </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Conference Titles Modal */}
      {showConfTitlesModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowConfTitlesModal(false)}
        >
          <div
            className="rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden"
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
                <h2 className="text-lg font-bold" style={{ color: teamPrimaryText }}>Conference Championships</h2>
              </div>
              <button onClick={() => setShowConfTitlesModal(false)} className="p-1 rounded hover:bg-black/10 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke={teamPrimaryText} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {conferenceTitlesDetails.length === 0 ? (
                <div className="text-center py-12 opacity-60" style={{ color: teamBgText }}>
                  <p className="text-lg font-semibold">No conference championships yet</p>
                </div>
              ) : (
              <div className="space-y-2">
                {conferenceTitlesDetails.map((title, idx) => {
                  const oppAbbr = teamAbbreviations[title.opponent] ? title.opponent : getAbbrFromTeamName(title.opponent)
                  const oppInfo = teamAbbreviations[oppAbbr] || {}
                  const oppBgColor = oppInfo.backgroundColor || '#4B5563'
                  const oppTextColor = getContrastTextColor(oppBgColor)
                  const oppMascotName = getMascotName(title.opponent, teamsSource)
                  const oppLogo = oppMascotName ? getTeamLogo(oppMascotName) : null

                  return (
                  <Link
                    key={idx}
                    to={`${pathPrefix}/team/${tid}/${title.year}`}
                    className="flex items-center gap-3 p-3 rounded-lg hover:scale-[1.01] transition-transform"
                    style={{ backgroundColor: oppBgColor, border: `3px solid #16a34a` }}
                    onClick={() => setShowConfTitlesModal(false)}
                  >
                      {/* W Badge */}
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                        style={{ backgroundColor: '#16a34a', color: '#FFFFFF' }}
                      >
                        W
                      </div>
                      {/* Opponent Logo */}
                      {oppLogo && (
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: '#FFFFFF', border: `2px solid ${oppInfo.textColor || '#FFFFFF'}`, padding: '2px' }}
                        >
                          <img src={oppLogo} alt={title.opponent} className="w-full h-full object-contain" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold truncate" style={{ color: oppTextColor }}>{title.conference} Champions</div>
                        <div className="text-sm flex flex-wrap items-center gap-x-2" style={{ color: oppTextColor, opacity: 0.8 }}>
                          <span>{title.year}</span>
                          <span>vs {getSchoolName(oppMascotName) || oppAbbr}</span>
                        </div>
                      </div>
                      {title.teamScore != null && title.opponentScore != null && (
                        <div className="text-xl font-bold flex-shrink-0" style={{ color: oppTextColor }}>{Math.max(title.teamScore, title.opponentScore)}-{Math.min(title.teamScore, title.opponentScore)}</div>
                      )}
                  </Link>
                  )
                })}
              </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bowl Games Modal */}
      {showBowlGamesModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowBowlGamesModal(false)}
        >
          <div
            className="rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden"
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
                <h2 className="text-lg font-bold" style={{ color: teamPrimaryText }}>Bowl Games ({bowlWins.length}-{bowlLosses.length})</h2>
              </div>
              <button onClick={() => setShowBowlGamesModal(false)} className="p-1 rounded hover:bg-black/10 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke={teamPrimaryText} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {bowlGames.length === 0 ? (
                <div className="text-center py-12 opacity-60" style={{ color: teamBgText }}>
                  <p className="text-lg font-semibold">No bowl games yet</p>
                </div>
              ) : (
              <div className="space-y-2">
                {bowlGames.map((game, idx) => {
                  // Handle both abbreviation and full team name for opponent lookup
                  const oppAbbr = teamAbbreviations[game.opponent] ? game.opponent : getAbbrFromTeamName(game.opponent)
                  const oppInfo = teamAbbreviations[oppAbbr] || teamAbbreviations[game.opponent] || {}
                  const oppBgColor = oppInfo.backgroundColor || '#4B5563'
                  const oppTextColor = getContrastTextColor(oppBgColor)
                  // Try mascot name from abbreviation first, then from full name, then use opponent as-is
                  const oppMascotName = getMascotName(oppAbbr, teamsSource) || getMascotName(game.opponent, teamsSource) || (game.opponent?.includes(' ') ? game.opponent : null)
                  const oppLogo = oppMascotName ? getTeamLogo(oppMascotName) : null

                  return (
                  <Link
                    key={idx}
                    to={`${pathPrefix}/team/${tid}/${game.year}`}
                    className="flex items-center p-3 rounded-lg hover:scale-[1.01] transition-transform gap-3"
                    style={{
                      backgroundColor: oppBgColor,
                      border: `3px solid ${game.won ? '#16a34a' : game.hasScore ? '#dc2626' : `${oppInfo.textColor || '#FFFFFF'}40`}`
                    }}
                    onClick={() => setShowBowlGamesModal(false)}
                  >
                      {game.hasScore && (
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                          style={{ backgroundColor: game.won ? '#16a34a' : '#dc2626', color: '#FFFFFF' }}
                        >
                          {game.won ? 'W' : 'L'}
                        </div>
                      )}
                      {/* Opponent Logo */}
                      {oppLogo && (
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: '#FFFFFF', border: `2px solid ${oppInfo.textColor || '#FFFFFF'}`, padding: '2px' }}
                        >
                          <img src={oppLogo} alt={game.opponent} className="w-full h-full object-contain" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold truncate" style={{ color: oppTextColor }}>{game.bowlName}</div>
                        <div className="text-sm flex flex-wrap items-center gap-x-2" style={{ color: oppTextColor, opacity: 0.8 }}>
                          <span>{game.year}</span>
                          <span>vs {getSchoolName(oppMascotName) || oppAbbr}</span>
                        </div>
                      </div>
                      {game.hasScore && game.teamScore != null && game.opponentScore != null && (
                        <div className="text-xl font-bold flex-shrink-0" style={{ color: oppTextColor }}>{Math.max(game.teamScore, game.opponentScore)}-{Math.min(game.teamScore, game.opponentScore)}</div>
                      )}
                  </Link>
                  )
                })}
              </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CFP Appearances Modal */}
      {showCfpAppsModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowCfpAppsModal(false)}
        >
          <div
            className="rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden"
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
                <h2 className="text-lg font-bold" style={{ color: teamPrimaryText }}>CFP Appearances</h2>
              </div>
              <button onClick={() => setShowCfpAppsModal(false)} className="p-1 rounded hover:bg-black/10 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke={teamPrimaryText} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {cfpAppearances.length === 0 ? (
                <div className="text-center py-12 opacity-60" style={{ color: teamBgText }}>
                  <p className="text-lg font-semibold">No CFP appearances yet</p>
                </div>
              ) : (
              <div className="space-y-4">
                {cfpAppearances.map((app, idx) => (
                  <div key={idx} className="rounded-lg overflow-hidden" style={{ backgroundColor: `${teamBgText}10`, border: `2px solid ${teamBgText}20` }}>
                    <Link
                      to={`${pathPrefix}/team/${tid}/${app.year}`}
                      className="flex items-center justify-between p-3 hover:bg-black/5 transition-colors"
                      onClick={() => setShowCfpAppsModal(false)}
                    >
                      <div className="font-semibold" style={{ color: teamBgText }}>{app.year} - #{app.seed} Seed</div>
                      <div
                        className="text-sm font-semibold px-2 py-1 rounded"
                        style={{
                          backgroundColor: app.result === 'Champion' ? '#16a34a' : app.result?.includes('Lost') ? '#dc2626' : `${teamBgText}30`,
                          color: app.result === 'Champion' || app.result?.includes('Lost') ? '#FFFFFF' : teamBgText
                        }}
                      >
                        {app.result || 'Pending'}
                      </div>
                    </Link>
                    {app.games.length > 0 && (
                      <div className="px-3 pb-3 space-y-2">
                        {app.games.map((game, gIdx) => {
                          const oppAbbr = teamAbbreviations[game.opponent] ? game.opponent : getAbbrFromTeamName(game.opponent)
                          const oppInfo = teamAbbreviations[oppAbbr] || {}
                          const oppBgColor = oppInfo.backgroundColor || '#4B5563'
                          const oppTextColor = getContrastTextColor(oppBgColor)
                          const oppMascotName = getMascotName(game.opponent, teamsSource)
                          const oppLogo = oppMascotName ? getTeamLogo(oppMascotName) : null

                          return (
                          <div
                            key={gIdx}
                            className="flex items-center gap-2 p-2 rounded"
                            style={{ backgroundColor: oppBgColor, border: `2px solid ${game.won ? '#16a34a' : '#dc2626'}` }}
                          >
                            {/* W/L Badge */}
                            <div
                              className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0"
                              style={{ backgroundColor: game.won ? '#16a34a' : '#dc2626', color: '#FFFFFF' }}
                            >
                              {game.won ? 'W' : 'L'}
                            </div>
                            {/* Opponent Logo */}
                            {oppLogo && (
                              <div
                                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{ backgroundColor: '#FFFFFF', border: `2px solid ${oppInfo.textColor || '#FFFFFF'}`, padding: '2px' }}
                              >
                                <img src={oppLogo} alt={game.opponent} className="w-full h-full object-contain" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <span className="font-medium text-sm" style={{ color: oppTextColor }}>{game.round}</span>
                              <span className="text-sm" style={{ color: oppTextColor, opacity: 0.8 }}> vs {getSchoolName(oppMascotName) || oppAbbr}</span>
                            </div>
                            <div className="font-semibold text-sm" style={{ color: oppTextColor }}>
                              {game.teamScore != null && game.opponentScore != null ? `${Math.max(game.teamScore, game.opponentScore)}-${Math.min(game.teamScore, game.opponentScore)}` : '-'}
                            </div>
                          </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* National Titles Modal */}
      {showNatlTitlesModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowNatlTitlesModal(false)}
        >
          <div
            className="rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden"
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
                <h2 className="text-lg font-bold" style={{ color: teamPrimaryText }}>National Championships</h2>
              </div>
              <button onClick={() => setShowNatlTitlesModal(false)} className="p-1 rounded hover:bg-black/10 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke={teamPrimaryText} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {nationalTitles.length === 0 ? (
                <div className="text-center py-12 opacity-60" style={{ color: teamBgText }}>
                  <p className="text-lg font-semibold">No national championships yet</p>
                </div>
              ) : (
              <div className="space-y-2">
                {nationalTitles.map((title, idx) => {
                  const oppAbbr = teamAbbreviations[title.opponent] ? title.opponent : getAbbrFromTeamName(title.opponent)
                  const oppInfo = teamAbbreviations[oppAbbr] || {}
                  const oppBgColor = oppInfo.backgroundColor || '#4B5563'
                  const oppTextColor = getContrastTextColor(oppBgColor)
                  const oppMascotName = getMascotName(title.opponent, teamsSource)
                  const oppLogo = oppMascotName ? getTeamLogo(oppMascotName) : null

                  return (
                  <Link
                    key={idx}
                    to={`${pathPrefix}/team/${tid}/${title.year}`}
                    className="flex items-center gap-3 p-3 rounded-lg hover:scale-[1.01] transition-transform"
                    style={{ backgroundColor: oppBgColor, border: '3px solid #fbbf24' }}
                    onClick={() => setShowNatlTitlesModal(false)}
                  >
                      <div className="text-2xl flex-shrink-0">🏆</div>
                      {/* Opponent Logo */}
                      {oppLogo && (
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: '#FFFFFF', border: `2px solid ${oppInfo.textColor || '#FFFFFF'}`, padding: '2px' }}
                        >
                          <img src={oppLogo} alt={title.opponent} className="w-full h-full object-contain" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold" style={{ color: oppTextColor }}>{title.year} National Champions</div>
                        <div className="text-sm" style={{ color: oppTextColor, opacity: 0.8 }}>vs {getSchoolName(oppMascotName) || oppAbbr}</div>
                      </div>
                    {title.teamScore != null && title.opponentScore != null && (
                      <div className="text-xl font-bold flex-shrink-0" style={{ color: oppTextColor }}>{Math.max(title.teamScore, title.opponentScore)}-{Math.min(title.teamScore, title.opponentScore)}</div>
                    )}
                  </Link>
                  )
                })}
              </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* All-Americans Modal */}
      {showAllAmericansModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowAllAmericansModal(false)}
        >
          <div
            className="rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden"
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
                <h2 className="text-lg font-bold" style={{ color: teamPrimaryText }}>All-Americans ({allAmericans.length})</h2>
              </div>
              <button onClick={() => setShowAllAmericansModal(false)} className="p-1 rounded hover:bg-black/10 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke={teamPrimaryText} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {allAmericans.length === 0 ? (
                <div className="text-center py-12 opacity-60" style={{ color: teamBgText }}>
                  <p className="text-lg font-semibold">No All-Americans yet</p>
                </div>
              ) : (
              <div className="space-y-2">
                {allAmericans.map((aa, idx) => (
                  <Link
                    key={idx}
                    to={aa.playerPID ? `${pathPrefix}/player/${aa.playerPID}` : '#'}
                    className="flex items-center justify-between p-3 rounded-lg hover:scale-[1.01] transition-transform"
                    style={{ backgroundColor: `${teamBgText}10`, border: `2px solid ${teamBgText}20` }}
                    onClick={() => setShowAllAmericansModal(false)}
                  >
                    <div>
                      <div className="font-semibold" style={{ color: teamBgText }}>{aa.playerName}</div>
                      <div className="text-sm" style={{ color: teamBgText, opacity: 0.7 }}>{aa.position} • {aa.year}</div>
                    </div>
                    <div
                      className="text-sm font-semibold px-2 py-1 rounded"
                      style={{
                        backgroundColor: (aa.team?.includes('1st') || aa.team?.includes('First')) ? '#fbbf24' : `${teamBgText}20`,
                        color: (aa.team?.includes('1st') || aa.team?.includes('First')) ? '#000000' : teamBgText
                      }}
                    >
                      {aa.team || 'All-American'}
                    </div>
                  </Link>
                ))}
              </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Games As Team Modal */}
      {showAsTeamModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowAsTeamModal(false)}
        >
          <div
            className="rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden"
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
                <h2 className="text-lg font-bold" style={{ color: teamPrimaryText }}>Games As {teamAbbr}</h2>
              </div>
              <button onClick={() => setShowAsTeamModal(false)} className="p-1 rounded hover:bg-black/10 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke={teamPrimaryText} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {/* Record Summary */}
              <div
                className="text-center p-4 rounded-lg mb-4"
                style={{ backgroundColor: `${teamBgText}15` }}
              >
                <div className="text-3xl font-bold" style={{ color: teamBgText }}>
                  {gamesAsWins}-{gamesAsLosses}
                </div>
                <div className="text-sm" style={{ color: teamBgText, opacity: 0.7 }}>
                  {winPctAs}% • {seasonsAsTeam} season{seasonsAsTeam !== 1 ? 's' : ''}
                </div>
              </div>

              {/* Games List */}
              <div className="space-y-2">
                {gamesAsTeam
                  .sort((a, b) => {
                    if (b.year !== a.year) return b.year - a.year
                    return (b.week || 0) - (a.week || 0)
                  })
                  .map((game, idx) => {
                    // Use perspective for unified format, fallback to legacy fields
                    const isWin = game.perspective?.userWon ?? (game.result === 'W' || game.result === 'win')
                    const oppTeamInfo = game.perspective?.opponentTid
                      ? getGameTeamInfo(teams, game.perspective.opponentTid)
                      : null
                    const oppAbbr = oppTeamInfo?.abbr || (teamAbbreviations[game.opponent] ? game.opponent : getAbbrFromTeamName(game.opponent))
                    const oppInfo = teamAbbreviations[oppAbbr] || {}
                    const oppBgColor = oppTeamInfo?.primaryColor || oppInfo.backgroundColor || '#4B5563'
                    const oppTextColor = getContrastTextColor(oppBgColor)
                    const oppMascotName = getMascotName(oppAbbr, teamsSource)
                    const oppLogo = oppMascotName ? getTeamLogo(oppMascotName) : null

                    // Get scores from perspective or legacy fields
                    const userScore = game.perspective?.userScore ?? game.teamScore
                    const opponentScore = game.perspective?.opponentScore ?? game.opponentScore
                    const hasScores = userScore != null && opponentScore != null

                    // Get location from perspective or legacy
                    const isHome = game.perspective?.isHome ?? (game.location === 'home')

                    return (
                      <Link
                        key={game.id || idx}
                        to={`${pathPrefix}/game/${game.id}`}
                        className="flex items-center justify-between p-3 rounded-lg hover:scale-[1.01] transition-transform"
                        style={{
                          backgroundColor: oppBgColor,
                          border: `3px solid ${isWin ? '#16a34a' : '#dc2626'}`
                        }}
                        onClick={() => setShowAsTeamModal(false)}
                      >
                        <div className="flex items-center gap-3">
                          {/* W/L Badge */}
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                            style={{ backgroundColor: isWin ? '#16a34a' : '#dc2626', color: '#FFFFFF' }}
                          >
                            {isWin ? 'W' : 'L'}
                          </div>
                          {/* Opponent Logo */}
                          {oppLogo && (
                            <div
                              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: '#FFFFFF', border: `2px solid ${oppTeamInfo?.secondaryColor || oppInfo.textColor || '#FFFFFF'}`, padding: '2px' }}
                            >
                              <img src={oppLogo} alt={oppAbbr} className="w-full h-full object-contain" />
                            </div>
                          )}
                          <div>
                            <div className="font-semibold" style={{ color: oppTextColor }}>
                              {game.year} {game.week ? `Week ${game.week}` : game.bowlName || ''}
                            </div>
                            <div className="text-sm" style={{ color: oppTextColor, opacity: 0.8 }}>
                              {isHome ? 'vs' : '@'} {getSchoolName(oppMascotName) || oppAbbr}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-lg" style={{ color: oppTextColor }}>
                            {hasScores ? `${Math.max(userScore, opponentScore)}-${Math.min(userScore, opponentScore)}` : '-'}
                          </div>
                        </div>
                      </Link>
                    )
                  })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Teambuilder Edit Modal */}
      <TeambuilderEditModal
        isOpen={showTeambuilderEditModal}
        onClose={() => setShowTeambuilderEditModal(false)}
        team={team}
        tid={tid}
        onSave={async (updates) => {
          const result = await updateTeambuilderTeam(currentDynasty.id, tid, updates)
          if (!result.success) {
            throw new Error(result.message)
          }
        }}
      />

    </div>
  )
}
