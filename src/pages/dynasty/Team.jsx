import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useDynasty, detectGameType, GAME_TYPES, getTeamConferenceForDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { getContrastTextColor } from '../../utils/colorUtils'
import { teamAbbreviations, getAbbreviationFromDisplayName } from '../../data/teamAbbreviations'
import { getTeamConference } from '../../data/conferenceTeams'
import { getConferenceLogo } from '../../data/conferenceLogos'
import { getTeamLogo } from '../../data/teams'

// Map abbreviation to mascot name for logo lookup
const getMascotName = (abbr) => {
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
  const actualAbbr = getAbbreviationFromDisplayName(abbr)
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
  const { id, teamAbbr } = useParams()
  const navigate = useNavigate()
  const { currentDynasty } = useDynasty()
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

  // Scroll to top when navigating to this page
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [teamAbbr])

  if (!currentDynasty) return null

  // Get all teams sorted alphabetically by mascot name
  const allTeams = Object.entries(teamAbbreviations)
    .map(([abbr, info]) => {
      const fullName = getMascotName(abbr) || info.name
      return {
        abbr,
        name: fullName,
        shortName: getSchoolName(fullName),
        sortName: fullName.toLowerCase()
      }
    })
    .sort((a, b) => a.sortName.localeCompare(b.sortName))

  // Get team info
  const teamInfo = teamAbbreviations[teamAbbr]
  if (!teamInfo) {
    return (
      <div className="space-y-6">
        <div
          className="rounded-lg shadow-lg p-6 bg-gray-100 border-2 border-gray-400"
        >
          <h1 className="text-2xl font-bold text-gray-700">
            Team Not Found
          </h1>
          <p className="mt-2 text-gray-600">
            The team "{teamAbbr}" was not found.
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

  const conference = getTeamConferenceForDynasty(currentDynasty, teamAbbr)
  const conferenceLogo = conference ? getConferenceLogo(conference) : null
  const mascotName = getMascotName(teamAbbr)
  const teamLogo = mascotName ? getTeamLogo(mascotName) : null
  const teamBgText = getContrastTextColor(teamInfo.backgroundColor)
  const teamPrimaryText = getContrastTextColor(teamInfo.textColor)

  // Get user's team abbreviation
  const userTeamAbbr = getAbbreviationFromDisplayName(currentDynasty.teamName)

  // Get all games against this team (user's games across all teams they've coached)
  const gamesAgainst = (currentDynasty.games || [])
    .filter(g => {
      // Exclude CPU vs CPU games (have team1/team2 but no userTeam)
      if (!g.userTeam && g.team1 && g.team2) return false

      // Must be against the team we're viewing
      if (g.opponent !== teamAbbr) return false

      // Include all user games regardless of which team they were coaching
      return true
    })

  // Calculate all-time record vs this team (handle both W/L and win/loss formats)
  const allTimeWins = gamesAgainst.filter(g => g.result === 'W' || g.result === 'win').length
  const allTimeLosses = gamesAgainst.filter(g => g.result === 'L' || g.result === 'loss').length
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

    // 1. Check unified games[] array for bowl games where this team played
    const allGames = currentDynasty.games || []
    allGames.forEach(game => {
      // Check for bowl games in the unified system
      const gameType = detectGameType(game)
      if (gameType !== GAME_TYPES.BOWL) return

      // Check if this team played in this game
      const isUserTeam = game.userTeam === teamAbbr
      // CPU games have no opponent AND no userTeam (just team1/team2)
      const isCpuGame = !game.opponent && !game.userTeam && game.team1 && game.team2
      const isCpuTeam1 = isCpuGame && game.team1 === teamAbbr
      const isCpuTeam2 = isCpuGame && game.team2 === teamAbbr

      if (!isUserTeam && !isCpuTeam1 && !isCpuTeam2) return

      const gameKey = `${game.year}-${game.bowlName || game.week}`
      if (seenGames.has(gameKey)) return
      seenGames.add(gameKey)

      if (isUserTeam) {
        // User game
        const isWin = game.result === 'W' || game.result === 'win'
        bowlGames.push({
          year: parseInt(game.year),
          bowlName: game.bowlName || 'Bowl Game',
          opponent: game.opponent,
          teamScore: game.teamScore,
          opponentScore: game.opponentScore,
          won: isWin,
          hasScore: game.teamScore !== null && game.opponentScore !== null
        })
      } else {
        // CPU game where this team participated
        const isTeam1 = game.team1 === teamAbbr
        const hasScore = game.team1Score !== null && game.team2Score !== null
        const teamWon = hasScore && (
          (isTeam1 && game.team1Score > game.team2Score) ||
          (!isTeam1 && game.team2Score > game.team1Score)
        )
        bowlGames.push({
          year: parseInt(game.year),
          bowlName: game.bowlName || 'Bowl Game',
          opponent: isTeam1 ? game.team2 : game.team1,
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
  const getGamesAsTeam = () => {
    const games = currentDynasty.games || []
    return games.filter(g => {
      // Skip CPU games (have team1/team2 but no userTeam)
      if (!g.userTeam && g.team1 && g.team2) return false
      // Check if this game was played by the team we're viewing
      if (g.userTeam === teamAbbr) return true
      // Legacy fallback: if no userTeam and this is the current user's team
      if (!g.userTeam && teamAbbr === userTeamAbbr) return true
      return false
    })
  }

  const gamesAsTeam = getGamesAsTeam()
  const gamesAsWins = gamesAsTeam.filter(g => g.result === 'W' || g.result === 'win').length
  const gamesAsLosses = gamesAsTeam.filter(g => g.result === 'L' || g.result === 'loss').length
  const winPctAs = gamesAsTeam.length > 0
    ? ((gamesAsWins / gamesAsTeam.length) * 100).toFixed(1)
    : null

  // Calculate seasons coached as this team
  const seasonsAsTeam = [...new Set(gamesAsTeam.map(g => g.year))].length

  // Calculate current streak vs this team
  const getStreakVsTeam = () => {
    if (gamesAgainst.length === 0) return null
    // Sort by year descending, then by week descending to get most recent first
    const sortedGames = [...gamesAgainst].sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year
      return (b.week || 0) - (a.week || 0)
    })

    // Normalize result to W or L
    const normalizeResult = (result) => {
      if (result === 'W' || result === 'win') return 'W'
      if (result === 'L' || result === 'loss') return 'L'
      return null
    }

    const firstResult = normalizeResult(sortedGames[0]?.result)
    if (!firstResult) return null

    let streak = 0
    for (const game of sortedGames) {
      if (normalizeResult(game.result) === firstResult) {
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
    const appearances = []

    Object.entries(cfpSeeds).forEach(([year, yearSeeds]) => {
      if (!Array.isArray(yearSeeds)) return
      const teamSeed = yearSeeds.find(s => s.team === teamAbbr)
      if (!teamSeed) return

      const yearResults = cfpResults[year] || {}
      const games = []

      // Check first round games
      const firstRound = yearResults.firstRound || []
      firstRound.forEach(g => {
        if (g && (g.team1 === teamAbbr || g.team2 === teamAbbr)) {
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

      // Check quarterfinals
      const quarterfinals = yearResults.quarterfinals || []
      quarterfinals.forEach(g => {
        if (g && (g.team1 === teamAbbr || g.team2 === teamAbbr)) {
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

      // Check semifinals
      const semifinals = yearResults.semifinals || []
      semifinals.forEach(g => {
        if (g && (g.team1 === teamAbbr || g.team2 === teamAbbr)) {
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

      // Check championship
      const championship = yearResults.championship?.[0]
      if (championship && (championship.team1 === teamAbbr || championship.team2 === teamAbbr)) {
        const isTeam1 = championship.team1 === teamAbbr
        games.push({
          round: 'Championship',
          opponent: isTeam1 ? championship.team2 : championship.team1,
          teamScore: isTeam1 ? championship.team1Score : championship.team2Score,
          opponentScore: isTeam1 ? championship.team2Score : championship.team1Score,
          won: championship.winner === teamAbbr
        })
      }

      appearances.push({
        year: parseInt(year),
        seed: teamSeed.seed,
        games,
        result: games.length > 0 && games[games.length - 1].won && games[games.length - 1].round === 'Championship'
          ? 'Champion'
          : games.length > 0 && !games[games.length - 1].won
            ? `Lost ${games[games.length - 1].round}`
            : 'Pending'
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
        if (game?.winner === teamAbbr) {
          const isTeam1 = game.team1 === teamAbbr
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
      const belongsToTeam = player.teamsByYear
        ? Object.values(player.teamsByYear).includes(teamAbbr)
        : (player.team === teamAbbr || player.teams?.includes(teamAbbr))
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
  const getTeamRecordFromGames = (year) => {
    const games = currentDynasty.games || []
    // Filter games where user played AS this team in this year
    const teamGames = games.filter(g => {
      // Skip CPU games (have team1/team2 but no userTeam)
      if (!g.userTeam && g.team1 && g.team2) return false
      // Compare as numbers to handle string/number mismatch
      if (Number(g.year) !== Number(year)) return false
      // Check if this game was played by the team we're viewing
      if (g.userTeam === teamAbbr) return true
      // Legacy fallback
      if (!g.userTeam && teamAbbr === userTeamAbbr) return true
      return false
    })

    if (teamGames.length === 0) return null

    const wins = teamGames.filter(g => g.result === 'win' || g.result === 'W').length
    const losses = teamGames.filter(g => g.result === 'loss' || g.result === 'L').length

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
  const vsUserYearRecords = years.map(year => {
    const yearGames = gamesAgainst.filter(g => g.year === year)
    const wins = yearGames.filter(g => g.result === 'W').length
    const losses = yearGames.filter(g => g.result === 'L').length
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
          value={teamAbbr}
          onChange={(e) => navigate(`${pathPrefix}/team/${e.target.value}`)}
          className="px-3 py-2 rounded-lg font-semibold cursor-pointer focus:outline-none focus:ring-2 ml-auto"
          style={{
            backgroundColor: teamInfo.backgroundColor,
            color: teamBgText,
            border: `2px solid ${teamBgText}40`
          }}
        >
          {allTeams.map((team) => (
            <option key={team.abbr} value={team.abbr}>
              {team.shortName}
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
            <h1 className="text-2xl font-bold" style={{ color: teamBgText }}>
              {finalRanking && (
                <span className="text-yellow-400 mr-2">#{finalRanking.rank}</span>
              )}
              {mascotName || teamInfo.name}
            </h1>
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
                to={`${pathPrefix}/team/${teamAbbr}/${yr.year}`}
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
                    const isWin = game.result === 'W' || game.result === 'win'
                    // Get user's team for this game (they may have coached different teams)
                    const userTeamForGame = game.userTeam || userTeamAbbr
                    const userTeamInfo = teamAbbreviations[userTeamForGame] || {}
                    const userTeamBgColor = userTeamInfo.backgroundColor || '#4B5563'
                    const userTeamTextColor = getContrastTextColor(userTeamBgColor)
                    const userTeamMascotName = getMascotName(userTeamForGame)
                    const userTeamLogo = userTeamMascotName ? getTeamLogo(userTeamMascotName) : null

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
                              style={{ backgroundColor: '#FFFFFF', border: `2px solid ${userTeamInfo.textColor || '#FFFFFF'}`, padding: '2px' }}
                            >
                              <img src={userTeamLogo} alt={userTeamForGame} className="w-full h-full object-contain" />
                            </div>
                          )}
                          <div>
                            <div className="font-semibold" style={{ color: userTeamTextColor }}>
                              {game.year} {game.week ? `Week ${game.week}` : game.bowlName || ''}
                            </div>
                            <div className="text-sm" style={{ color: userTeamTextColor, opacity: 0.8 }}>
                              {game.location === 'home' ? 'vs' : game.location === 'away' ? '@' : 'vs'} {teamAbbr}
                              {userTeamForGame !== userTeamAbbr && (
                                <span className="ml-1 opacity-70">(as {userTeamForGame})</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-lg" style={{ color: userTeamTextColor }}>
                            {Math.max(game.teamScore, game.opponentScore)}-{Math.min(game.teamScore, game.opponentScore)}
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
                              const isWin = game.result === 'W' || game.result === 'win'
                              const oppAbbr = teamAbbreviations[game.opponent] ? game.opponent : getAbbreviationFromDisplayName(game.opponent)
                              const oppInfo = teamAbbreviations[oppAbbr] || {}
                              const oppBgColor = oppInfo.backgroundColor || '#4B5563'
                              const oppTextColor = getContrastTextColor(oppBgColor)
                              const oppMascotName = getMascotName(game.opponent)
                              const oppLogo = oppMascotName ? getTeamLogo(oppMascotName) : null

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
                                        style={{ backgroundColor: '#FFFFFF', border: `2px solid ${oppInfo.textColor || '#FFFFFF'}`, padding: '2px' }}
                                      >
                                        <img src={oppLogo} alt={game.opponent} className="w-full h-full object-contain" />
                                      </div>
                                    )}
                                    <div>
                                      <div className="font-semibold" style={{ color: oppTextColor }}>
                                        {game.week ? `Week ${game.week}` : game.bowlName || 'Game'}
                                      </div>
                                      <div className="text-sm" style={{ color: oppTextColor, opacity: 0.8 }}>
                                        {game.location === 'home' ? 'vs' : game.location === 'away' ? '@' : 'vs'} {getSchoolName(oppMascotName) || getSchoolName(game.opponent) || game.opponent}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="font-bold text-lg" style={{ color: oppTextColor }}>
                                      {Math.max(game.teamScore, game.opponentScore)}-{Math.min(game.teamScore, game.opponentScore)}
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
                    to={`${pathPrefix}/team/${teamAbbr}/${finish.year}`}
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
                  const oppAbbr = teamAbbreviations[title.opponent] ? title.opponent : getAbbreviationFromDisplayName(title.opponent)
                  const oppInfo = teamAbbreviations[oppAbbr] || {}
                  const oppBgColor = oppInfo.backgroundColor || '#4B5563'
                  const oppTextColor = getContrastTextColor(oppBgColor)
                  const oppMascotName = getMascotName(title.opponent)
                  const oppLogo = oppMascotName ? getTeamLogo(oppMascotName) : null

                  return (
                  <Link
                    key={idx}
                    to={`${pathPrefix}/team/${teamAbbr}/${title.year}`}
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
                          <span>vs {getSchoolName(oppMascotName) || getSchoolName(title.opponent) || title.opponent}</span>
                        </div>
                      </div>
                      {title.teamScore !== null && (
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
                  const oppAbbr = teamAbbreviations[game.opponent] ? game.opponent : getAbbreviationFromDisplayName(game.opponent)
                  const oppInfo = teamAbbreviations[oppAbbr] || teamAbbreviations[game.opponent] || {}
                  const oppBgColor = oppInfo.backgroundColor || '#4B5563'
                  const oppTextColor = getContrastTextColor(oppBgColor)
                  // Try mascot name from abbreviation first, then from full name, then use opponent as-is
                  const oppMascotName = getMascotName(oppAbbr) || getMascotName(game.opponent) || (game.opponent?.includes(' ') ? game.opponent : null)
                  const oppLogo = oppMascotName ? getTeamLogo(oppMascotName) : null

                  return (
                  <Link
                    key={idx}
                    to={`${pathPrefix}/team/${teamAbbr}/${game.year}`}
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
                          <span>vs {getSchoolName(oppMascotName) || getSchoolName(game.opponent) || game.opponent}</span>
                        </div>
                      </div>
                      {game.hasScore && (
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
                      to={`${pathPrefix}/team/${teamAbbr}/${app.year}`}
                      className="flex items-center justify-between p-3 hover:bg-black/5 transition-colors"
                      onClick={() => setShowCfpAppsModal(false)}
                    >
                      <div className="font-semibold" style={{ color: teamBgText }}>{app.year} - #{app.seed} Seed</div>
                      <div
                        className="text-sm font-semibold px-2 py-1 rounded"
                        style={{
                          backgroundColor: app.result === 'Champion' ? '#16a34a' : app.result.includes('Lost') ? '#dc2626' : `${teamBgText}30`,
                          color: app.result === 'Champion' || app.result.includes('Lost') ? '#FFFFFF' : teamBgText
                        }}
                      >
                        {app.result}
                      </div>
                    </Link>
                    {app.games.length > 0 && (
                      <div className="px-3 pb-3 space-y-2">
                        {app.games.map((game, gIdx) => {
                          const oppAbbr = teamAbbreviations[game.opponent] ? game.opponent : getAbbreviationFromDisplayName(game.opponent)
                          const oppInfo = teamAbbreviations[oppAbbr] || {}
                          const oppBgColor = oppInfo.backgroundColor || '#4B5563'
                          const oppTextColor = getContrastTextColor(oppBgColor)
                          const oppMascotName = getMascotName(game.opponent)
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
                              <span className="text-sm" style={{ color: oppTextColor, opacity: 0.8 }}> vs {getSchoolName(oppMascotName) || getSchoolName(game.opponent) || game.opponent}</span>
                            </div>
                            <div className="font-semibold text-sm" style={{ color: oppTextColor }}>
                              {game.teamScore !== null ? `${Math.max(game.teamScore, game.opponentScore)}-${Math.min(game.teamScore, game.opponentScore)}` : '-'}
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
                  const oppAbbr = teamAbbreviations[title.opponent] ? title.opponent : getAbbreviationFromDisplayName(title.opponent)
                  const oppInfo = teamAbbreviations[oppAbbr] || {}
                  const oppBgColor = oppInfo.backgroundColor || '#4B5563'
                  const oppTextColor = getContrastTextColor(oppBgColor)
                  const oppMascotName = getMascotName(title.opponent)
                  const oppLogo = oppMascotName ? getTeamLogo(oppMascotName) : null

                  return (
                  <Link
                    key={idx}
                    to={`${pathPrefix}/team/${teamAbbr}/${title.year}`}
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
                        <div className="text-sm" style={{ color: oppTextColor, opacity: 0.8 }}>vs {getSchoolName(oppMascotName) || getSchoolName(title.opponent) || title.opponent}</div>
                      </div>
                    <div className="text-xl font-bold flex-shrink-0" style={{ color: oppTextColor }}>{Math.max(title.teamScore, title.opponentScore)}-{Math.min(title.teamScore, title.opponentScore)}</div>
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
                        backgroundColor: aa.team.includes('1st') || aa.team.includes('First') ? '#fbbf24' : `${teamBgText}20`,
                        color: aa.team.includes('1st') || aa.team.includes('First') ? '#000000' : teamBgText
                      }}
                    >
                      {aa.team}
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
                    const isWin = game.result === 'W' || game.result === 'win'
                    const oppAbbr = teamAbbreviations[game.opponent] ? game.opponent : getAbbreviationFromDisplayName(game.opponent)
                    const oppInfo = teamAbbreviations[oppAbbr] || {}
                    const oppBgColor = oppInfo.backgroundColor || '#4B5563'
                    const oppTextColor = getContrastTextColor(oppBgColor)
                    const oppMascotName = getMascotName(game.opponent)
                    const oppLogo = oppMascotName ? getTeamLogo(oppMascotName) : null

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
                              style={{ backgroundColor: '#FFFFFF', border: `2px solid ${oppInfo.textColor || '#FFFFFF'}`, padding: '2px' }}
                            >
                              <img src={oppLogo} alt={game.opponent} className="w-full h-full object-contain" />
                            </div>
                          )}
                          <div>
                            <div className="font-semibold" style={{ color: oppTextColor }}>
                              {game.year} {game.week ? `Week ${game.week}` : game.bowlName || ''}
                            </div>
                            <div className="text-sm" style={{ color: oppTextColor, opacity: 0.8 }}>
                              {game.location === 'home' ? 'vs' : game.location === 'away' ? '@' : 'vs'} {getSchoolName(oppMascotName) || getSchoolName(game.opponent) || game.opponent}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-lg" style={{ color: oppTextColor }}>
                            {Math.max(game.teamScore, game.opponentScore)}-{Math.min(game.teamScore, game.opponentScore)}
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

    </div>
  )
}
