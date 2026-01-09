import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useDynasty, detectGameType, GAME_TYPES } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useTeamColors } from '../../hooks/useTeamColors'
import { getContrastTextColor } from '../../utils/colorUtils'
import { teamAbbreviations, getAbbreviationFromDisplayName } from '../../data/teamAbbreviations'
import { getTeamLogo } from '../../data/teams'
import { getTeamColors } from '../../data/teamColors'

// Map abbreviations to mascot names for logo lookup
const mascotMap = {
  'AFA': 'Air Force Falcons', 'AKR': 'Akron Zips', 'APP': 'Appalachian State Mountaineers',
  'ARIZ': 'Arizona Wildcats', 'ARK': 'Arkansas Razorbacks', 'ARMY': 'Army Black Knights',
  'ARST': 'Arkansas State Red Wolves', 'ASU': 'Arizona State Sun Devils', 'AUB': 'Auburn Tigers',
  'BALL': 'Ball State Cardinals', 'BAMA': 'Alabama Crimson Tide', 'BC': 'Boston College Eagles',
  'BGSU': 'Bowling Green Falcons', 'BOIS': 'Boise State Broncos', 'BU': 'Baylor Bears',
  'BUFF': 'Buffalo Bulls', 'BYU': 'Brigham Young Cougars', 'CAL': 'California Golden Bears',
  'CCU': 'Coastal Carolina Chanticleers', 'CHAR': 'Charlotte 49ers', 'CLEM': 'Clemson Tigers',
  'CMU': 'Central Michigan Chippewas', 'COLO': 'Colorado Buffaloes', 'CONN': 'Connecticut Huskies',
  'CSU': 'Colorado State Rams', 'DUKE': 'Duke Blue Devils', 'ECU': 'East Carolina Pirates',
  'EMU': 'Eastern Michigan Eagles', 'FIU': 'Florida International Panthers', 'FSU': 'Florida State Seminoles',
  'FAU': 'Florida Atlantic Owls', 'FRES': 'Fresno State Bulldogs', 'UF': 'Florida Gators',
  'GASO': 'Georgia Southern Eagles', 'GAST': 'Georgia State Panthers', 'GT': 'Georgia Tech Yellow Jackets',
  'UGA': 'Georgia Bulldogs', 'HAW': 'Hawaii Rainbow Warriors', 'HOU': 'Houston Cougars',
  'ILL': 'Illinois Fighting Illini', 'IU': 'Indiana Hoosiers', 'IOWA': 'Iowa Hawkeyes',
  'ISU': 'Iowa State Cyclones', 'JKST': 'Jacksonville State Gamecocks', 'JMU': 'James Madison Dukes',
  'KU': 'Kansas Jayhawks', 'KSU': 'Kansas State Wildcats', 'KENT': 'Kent State Golden Flashes',
  'UK': 'Kentucky Wildcats', 'LIB': 'Liberty Flames', 'ULL': 'Lafayette Ragin\' Cajuns',
  'LT': 'Louisiana Tech Bulldogs', 'LOU': 'Louisville Cardinals', 'LSU': 'LSU Tigers',
  'UM': 'Miami Hurricanes', 'M-OH': 'Miami Redhawks', 'UMD': 'Maryland Terrapins',
  'MASS': 'Massachusetts Minutemen', 'MEM': 'Memphis Tigers', 'MICH': 'Michigan Wolverines',
  'MSU': 'Michigan State Spartans', 'MTSU': 'Middle Tennessee State Blue Raiders',
  'MINN': 'Minnesota Golden Gophers', 'MISS': 'Ole Miss Rebels', 'MSST': 'Mississippi State Bulldogs',
  'MZST': 'Missouri State Bears', 'MRSH': 'Marshall Thundering Herd', 'NAVY': 'Navy Midshipmen',
  'NEB': 'Nebraska Cornhuskers', 'NEV': 'Nevada Wolf Pack', 'UNM': 'New Mexico Lobos',
  'NMSU': 'New Mexico State Aggies', 'UNC': 'North Carolina Tar Heels', 'NCST': 'North Carolina State Wolfpack',
  'UNT': 'North Texas Mean Green', 'NU': 'Northwestern Wildcats', 'ND': 'Notre Dame Fighting Irish',
  'NIU': 'Northern Illinois Huskies', 'OHIO': 'Ohio Bobcats', 'OSU': 'Ohio State Buckeyes',
  'OKLA': 'Oklahoma Sooners', 'OKST': 'Oklahoma State Cowboys', 'ODU': 'Old Dominion Monarchs',
  'ORE': 'Oregon Ducks', 'ORST': 'Oregon State Beavers', 'PSU': 'Penn State Nittany Lions',
  'PITT': 'Pittsburgh Panthers', 'PUR': 'Purdue Boilermakers', 'RICE': 'Rice Owls',
  'RUT': 'Rutgers Scarlet Knights', 'SDSU': 'San Diego State Aztecs', 'SJSU': 'San Jose State Spartans',
  'SAM': 'Sam Houston State Bearkats', 'USF': 'South Florida Bulls', 'SMU': 'SMU Mustangs',
  'USC': 'USC Trojans', 'SCAR': 'South Carolina Gamecocks', 'STAN': 'Stanford Cardinal',
  'SYR': 'Syracuse Orange', 'TCU': 'TCU Horned Frogs', 'TEM': 'Temple Owls',
  'TENN': 'Tennessee Volunteers', 'TEX': 'Texas Longhorns', 'TXAM': 'Texas A&M Aggies', 'TAMU': 'Texas A&M Aggies',
  'TXST': 'Texas State Bobcats', 'TXTECH': 'Texas Tech Red Raiders', 'TOL': 'Toledo Rockets',
  'TROY': 'Troy Trojans', 'TUL': 'Tulane Green Wave', 'TLSA': 'Tulsa Golden Hurricane',
  'UAB': 'UAB Blazers', 'UCF': 'UCF Knights', 'UCLA': 'UCLA Bruins', 'UNLV': 'UNLV Rebels',
  'UTEP': 'UTEP Miners', 'USA': 'South Alabama Jaguars', 'USU': 'Utah State Aggies',
  'UTAH': 'Utah Utes', 'UTSA': 'UTSA Roadrunners', 'VAN': 'Vanderbilt Commodores',
  'UVA': 'Virginia Cavaliers', 'VT': 'Virginia Tech Hokies', 'WAKE': 'Wake Forest Demon Deacons',
  'WASH': 'Washington Huskies', 'WSU': 'Washington State Cougars', 'WVU': 'West Virginia Mountaineers',
  'WMU': 'Western Michigan Broncos', 'WKU': 'Western Kentucky Hilltoppers', 'WIS': 'Wisconsin Badgers',
  'WYO': 'Wyoming Cowboys', 'DEL': 'Delaware Fightin\' Blue Hens', 'FLA': 'Florida Gators',
  'KENN': 'Kennesaw State Owls', 'ULM': 'Monroe Warhawks', 'UC': 'Cincinnati Bearcats',
  'MIA': 'Miami Hurricanes', 'MIZ': 'Missouri Tigers', 'OU': 'Oklahoma Sooners', 'GSU': 'Georgia State Panthers',
  'USM': 'Southern Mississippi Golden Eagles',
  'RUTG': 'Rutgers Scarlet Knights', 'SHSU': 'Sam Houston State Bearkats', 'TTU': 'Texas Tech Red Raiders',
  'TULN': 'Tulane Green Wave', 'UH': 'Houston Cougars', 'UL': 'Lafayette Ragin\' Cajuns', 'UT': 'Tennessee Volunteers',
  // FCS teams
  'FCSE': 'FCS East Judicials', 'FCSM': 'FCS Midwest Rebels',
  'FCSN': 'FCS Northwest Stallions', 'FCSW': 'FCS West Titans'
}

const getMascotName = (opponent) => {
  // Try direct lookup first (for abbreviations)
  if (mascotMap[opponent]) return mascotMap[opponent]
  // If opponent is already a full name, return it if it exists in reverse lookup
  const abbr = getAbbreviationFromDisplayName(opponent)
  if (abbr) return mascotMap[abbr] || opponent
  return null
}

const getOpponentColors = (opponent) => {
  // Try direct lookup first (for abbreviations)
  let team = teamAbbreviations[opponent]
  // If not found, try to get abbreviation from display name
  if (!team) {
    const abbr = getAbbreviationFromDisplayName(opponent)
    if (abbr) {
      team = teamAbbreviations[abbr]
    }
  }
  return {
    backgroundColor: team?.backgroundColor || '#4B5563',
    textColor: team?.textColor || '#FFFFFF'
  }
}

// Get team colors from team name
const getTeamColorsFromName = (teamName) => {
  if (!teamName) return { primary: '#4B5563', secondary: '#FFFFFF' }
  try {
    const colors = getTeamColors(teamName)
    if (colors) return colors
    // Try to find via abbreviation
    const abbr = getAbbreviationFromDisplayName(teamName)
    if (abbr && teamAbbreviations[abbr]) {
      return {
        primary: teamAbbreviations[abbr].backgroundColor || '#4B5563',
        secondary: teamAbbreviations[abbr].textColor || '#FFFFFF'
      }
    }
  } catch (e) {
    console.error('Error getting team colors:', e)
  }
  return { primary: '#4B5563', secondary: '#FFFFFF' }
}

export default function CoachCareer() {
  const { id } = useParams()
  const { currentDynasty } = useDynasty()
  const pathPrefix = usePathPrefix()
  const [showFavoriteTooltip, setShowFavoriteTooltip] = useState(false)
  const [showGamesModal, setShowGamesModal] = useState(false)
  const [gamesModalType, setGamesModalType] = useState(null) // 'favorite' or 'underdog'
  const [selectedTeamForModal, setSelectedTeamForModal] = useState(null)

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (showGamesModal) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [showGamesModal])

  if (!currentDynasty) return null

  // Get current team abbreviation
  const currentTeamAbbr = getAbbreviationFromDisplayName(currentDynasty.teamName, currentDynasty.customTeams)

  // Helper to check for win (handles both 'win' and 'W' formats)
  const isWin = (g) => g.result === 'win' || g.result === 'W'
  const isLoss = (g) => g.result === 'loss' || g.result === 'L'

  // Calculate stats for a specific team stint (either from history or current team)
  const calculateStintStats = (teamName, startYear, endYear, isCurrentTeam = false) => {
    const teamAbbr = getAbbreviationFromDisplayName(teamName)

    // Filter games for this team during this period
    const games = (currentDynasty.games || []).filter(g => {
      // Skip CPU games (have team1/team2 but no userTeam)
      if (!g.userTeam && g.team1 && g.team2) return false
      const gameYear = Number(g.year)

      // Determine which team this game belongs to
      let gameTeam = g.userTeam
      if (!gameTeam) {
        // Look up which team the coach was coaching in that year
        const coachTeamEntry = currentDynasty.coachTeamByYear?.[gameYear]
        gameTeam = coachTeamEntry?.team
      }

      const matchesTeam = gameTeam === teamAbbr || gameTeam === teamName
      if (!matchesTeam) return false
      // Check year range
      return gameYear >= startYear && gameYear <= endYear
    })

    const wins = games.filter(isWin).length
    const losses = games.filter(isLoss).length
    const overallRecord = `${wins}-${losses}`

    // Calculate favorite/underdog records
    const favoriteGames = games.filter(g => g.favoriteStatus === 'favorite')
    const favoriteWins = favoriteGames.filter(isWin).length
    const favoriteLosses = favoriteGames.filter(isLoss).length
    const favoriteRecord = `${favoriteWins}-${favoriteLosses}`

    const underdogGames = games.filter(g => g.favoriteStatus === 'underdog')
    const underdogWins = underdogGames.filter(isWin).length
    const underdogLosses = underdogGames.filter(isLoss).length
    const underdogRecord = `${underdogWins}-${underdogLosses}`

    return {
      wins,
      losses,
      overallRecord,
      favoriteRecord,
      underdogRecord,
      favoriteGames,
      underdogGames,
      confChampionships: 0, // TODO: Calculate from conferenceChampionshipsByYear
      playoffAppearances: 0, // TODO: Calculate from cfpSeedsByYear
      nationalChampionships: 0 // TODO: Calculate from cfpResultsByYear
    }
  }

  // Build the complete coaching history from game data
  // This is more reliable than coachingHistory array since games have userTeam field
  const buildCoachingHistory = () => {
    const history = []
    // Filter for user games (have userTeam set, not CPU games)
    const userGames = (currentDynasty.games || []).filter(g => g.userTeam || (!g.team1 && !g.team2))

    // Group games by team to identify all teams coached
    const gamesByTeam = {}
    userGames.forEach(game => {
      // Determine team: first check userTeam field, then fall back to coachTeamByYear for that year
      let teamKey = game.userTeam
      if (!teamKey) {
        const gameYear = Number(game.year)
        // Look up which team the coach was coaching in that year
        const coachTeamEntry = currentDynasty.coachTeamByYear?.[gameYear]
        teamKey = coachTeamEntry?.team || currentTeamAbbr
      }
      if (!gamesByTeam[teamKey]) {
        gamesByTeam[teamKey] = []
      }
      gamesByTeam[teamKey].push(game)
    })

    // Get team full names from abbreviations
    const getTeamFullName = (abbr) => {
      const mascot = getMascotName(abbr)
      if (mascot) return mascot
      // Check teamAbbreviations for the name
      if (teamAbbreviations[abbr]?.name) return teamAbbreviations[abbr].name
      return abbr
    }

    // Build stints from game data, sorted by earliest year
    const teamStints = Object.entries(gamesByTeam).map(([teamAbbr, games]) => {
      const years = games.map(g => Number(g.year)).filter(y => !isNaN(y) && y > 1900 && y < 3000)
      const startYear = years.length > 0 ? Math.min(...years) : (currentDynasty.startYear || 2024)
      const endYear = years.length > 0 ? Math.max(...years) : (currentDynasty.currentYear || 2024)
      const wins = games.filter(isWin).length
      const losses = games.filter(isLoss).length

      // Get favorite/underdog games
      const favoriteGames = games.filter(g => g.favoriteStatus === 'favorite')
      const favoriteWins = favoriteGames.filter(isWin).length
      const favoriteLosses = favoriteGames.filter(isLoss).length
      const underdogGames = games.filter(g => g.favoriteStatus === 'underdog')
      const underdogWins = underdogGames.filter(isWin).length
      const underdogLosses = underdogGames.filter(isLoss).length

      // Bowl games (regular bowls only, not CFP) - use gameType for cleaner filtering
      const bowlGames = games.filter(g => {
        const gameType = detectGameType(g)
        return gameType === GAME_TYPES.BOWL
      })
      const bowlWins = bowlGames.filter(isWin).length
      const bowlLosses = bowlGames.filter(isLoss).length

      // CFP games - all CFP rounds
      const cfpGames = games.filter(g => {
        const gameType = detectGameType(g)
        return gameType === GAME_TYPES.CFP_FIRST_ROUND ||
               gameType === GAME_TYPES.CFP_QUARTERFINAL ||
               gameType === GAME_TYPES.CFP_SEMIFINAL ||
               gameType === GAME_TYPES.CFP_CHAMPIONSHIP
      })
      const cfpWins = cfpGames.filter(isWin).length
      const cfpLosses = cfpGames.filter(isLoss).length

      // Conference championship games
      const confChampGames = games.filter(g => detectGameType(g) === GAME_TYPES.CONFERENCE_CHAMPIONSHIP)
      const confChampWins = confChampGames.filter(isWin).length

      // Count unique CFP years (playoff appearances)
      const cfpYears = new Set(cfpGames.map(g => g.year)).size

      return {
        teamAbbr,
        teamName: getTeamFullName(teamAbbr),
        startYear,
        endYear,
        wins,
        losses,
        overallRecord: `${wins}-${losses}`,
        favoriteRecord: `${favoriteWins}-${favoriteLosses}`,
        underdogRecord: `${underdogWins}-${underdogLosses}`,
        bowlRecord: `${bowlWins}-${bowlLosses}`,
        cfpRecord: `${cfpWins}-${cfpLosses}`,
        favoriteGames,
        underdogGames,
        bowlGames,
        cfpGames,
        confChampGames,
        confChampionships: confChampWins,
        playoffAppearances: cfpYears,
        games
      }
    }).sort((a, b) => a.startYear - b.startYear)

    // Mark which stint is current (matches current team)
    const currentTeamFullName = currentDynasty.teamName
    teamStints.forEach(stint => {
      const isCurrentTeam = stint.teamAbbr === currentTeamAbbr ||
                           stint.teamName === currentTeamFullName
      stint.isCurrent = isCurrentTeam
      stint.isPast = !isCurrentTeam
      stint.position = currentDynasty.coachPosition || 'HC'
      stint.conference = isCurrentTeam ? currentDynasty.conference : ''
      // confChampionships and playoffAppearances are already calculated above
      // Calculate national championships from CFP championship wins
      stint.nationalChampionships = (stint.cfpGames || []).filter(g => detectGameType(g) === GAME_TYPES.CFP_CHAMPIONSHIP && isWin(g)).length
    })

    // If current team has no games yet (just switched), add it
    const hasCurrentTeam = teamStints.some(s => s.isCurrent)
    if (!hasCurrentTeam) {
      // Get the end year of the last stint to determine when current stint starts
      const lastStint = teamStints[teamStints.length - 1]
      // If we switched teams during offseason, the new team starts NEXT year
      // Check if we're in offseason - if so, new team starts in currentYear + 1
      const isInOffseason = currentDynasty.currentPhase === 'offseason'
      const currentStartYear = lastStint
        ? lastStint.endYear + 1
        : (isInOffseason ? currentDynasty.currentYear + 1 : currentDynasty.startYear)
      // End year should be at least the start year (for display purposes)
      // If in preseason or later of that year, use currentYear; if in offseason before season starts, use startYear
      const currentEndYear = Math.max(currentStartYear, currentDynasty.currentYear)

      history.push(...teamStints.map(s => ({ ...s, isPast: true, isCurrent: false })))
      history.push({
        teamAbbr: currentTeamAbbr,
        teamName: currentTeamFullName,
        conference: currentDynasty.conference,
        position: currentDynasty.coachPosition || 'HC',
        startYear: currentStartYear,
        endYear: currentEndYear,
        wins: 0,
        losses: 0,
        overallRecord: '0-0',
        favoriteRecord: '0-0',
        underdogRecord: '0-0',
        bowlRecord: '0-0',
        cfpRecord: '0-0',
        favoriteGames: [],
        underdogGames: [],
        bowlGames: [],
        cfpGames: [],
        confChampGames: [],
        games: [],
        confChampionships: 0,
        playoffAppearances: 0,
        nationalChampionships: 0,
        isCurrent: true,
        isPast: false
      })
    } else {
      history.push(...teamStints)
    }

    return history
  }

  const coachingHistory = buildCoachingHistory()

  // Calculate overall career totals
  const careerTotals = coachingHistory.reduce((totals, stint) => {
    return {
      wins: totals.wins + stint.wins,
      losses: totals.losses + stint.losses,
      teams: totals.teams + 1
    }
  }, { wins: 0, losses: 0, teams: 0 })

  // Get team colors for current team (used for header)
  const teamColors = useTeamColors(currentDynasty?.teamName, currentDynasty?.customTeams)
  const primaryText = getContrastTextColor(teamColors?.primary || '#4B5563')
  const secondaryText = getContrastTextColor(teamColors?.secondary || '#FFFFFF')

  // Get games for the modal
  const getGamesForModal = () => {
    if (!selectedTeamForModal) return []
    const stint = coachingHistory.find(s => s.teamName === selectedTeamForModal)
    if (!stint) return []
    if (gamesModalType === 'favorite') {
      return stint.favoriteGames || []
    } else if (gamesModalType === 'underdog') {
      return stint.underdogGames || []
    } else if (gamesModalType === 'all') {
      return stint.games || []
    } else if (gamesModalType === 'bowl') {
      return stint.bowlGames || []
    } else if (gamesModalType === 'confChamp') {
      return stint.confChampGames || []
    } else if (gamesModalType === 'cfp') {
      return stint.cfpGames || []
    }
    return []
  }

  // Sort games by year (descending) then week (descending - most recent first)
  const sortedGames = getGamesForModal().sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year
    return (b.week || 0) - (a.week || 0)
  })

  // Group games by year for display
  const gamesByYear = sortedGames.reduce((acc, game) => {
    const year = game.year || 'Unknown'
    if (!acc[year]) acc[year] = []
    acc[year].push(game)
    return acc
  }, {})

  const openGamesModal = (type, teamName) => {
    setGamesModalType(type)
    setSelectedTeamForModal(teamName)
    setShowGamesModal(true)
  }

  const getPositionLabel = (position) => {
    if (position === 'HC') return 'Head Coach'
    if (position === 'OC') return 'Offensive Coordinator'
    if (position === 'DC') return 'Defensive Coordinator'
    return 'Head Coach'
  }

  return (
    <div className="space-y-6">
      {/* Page Header with Career Summary */}
      <div
        className="rounded-lg shadow-lg p-6"
        style={{
          backgroundColor: teamColors.primary,
          border: `3px solid ${teamColors.secondary}`
        }}
      >
        <h2 className="text-2xl font-bold" style={{ color: primaryText }}>
          {currentDynasty.coachName} - Career Overview
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-sm" style={{ color: primaryText, opacity: 0.9 }}>
          <span className="font-semibold">Career Record: {careerTotals.wins}-{careerTotals.losses}</span>
          <span>|</span>
          <span>{coachingHistory.length} Team{coachingHistory.length !== 1 ? 's' : ''}</span>
          <span>|</span>
          <span>{currentDynasty.startYear} - Present</span>
        </div>
      </div>

      {/* Coaching Stints - reverse order so current team is first */}
      {(Array.isArray(coachingHistory) ? [...coachingHistory].reverse() : []).map((stint, index) => {
        if (!stint) return null
        const stintColors = getTeamColorsFromName(stint.teamName)
        const stintPrimaryText = getContrastTextColor(stintColors?.primary || '#4B5563')
        const stintSecondaryText = getContrastTextColor(stintColors?.secondary || '#FFFFFF')
        const stintLogo = getTeamLogo(stint.teamName)
        // For current team, show "Present" instead of end year
        const yearRange = stint.isCurrent
          ? (stint.startYear === stint.endYear ? `${stint.startYear}` : `${stint.startYear} - Present`)
          : (stint.startYear === stint.endYear ? `${stint.startYear}` : `${stint.startYear}-${stint.endYear}`)

        return (
          <div
            key={`${stint.teamName}-${stint.startYear}`}
            className="rounded-lg shadow-lg p-6"
            style={{
              backgroundColor: stintColors.primary,
              border: `3px solid ${stintColors.secondary}`
            }}
          >
            {/* Team Header */}
            <div className="flex items-center gap-4 mb-6">
              {stintLogo && (
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: `3px solid ${stintColors.secondary}`,
                    padding: '4px'
                  }}
                >
                  <img
                    src={stintLogo}
                    alt={stint.teamName}
                    className="w-full h-full object-contain"
                  />
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <Link
                    to={`${pathPrefix}/team/${stint.teamAbbr}`}
                    className="text-2xl font-bold hover:underline"
                    style={{ color: stintPrimaryText }}
                  >
                    {stint.teamName}
                  </Link>
                  {stint.isCurrent && (
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded"
                      style={{ backgroundColor: stintColors.secondary, color: stintSecondaryText }}
                    >
                      CURRENT
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm mt-1" style={{ color: stintPrimaryText, opacity: 0.8 }}>
                  <span className="font-semibold">{getPositionLabel(stint.position)}</span>
                  <span>|</span>
                  <span>{yearRange}</span>
                  {stint.conference && (
                    <>
                      <span>|</span>
                      <span>{stint.conference}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {/* Overall Record - Clickable */}
              <div
                className="text-center p-4 rounded-lg border-2 cursor-pointer hover:scale-105 transition-transform"
                style={{
                  backgroundColor: stintColors.secondary,
                  borderColor: stintPrimaryText
                }}
                onClick={() => openGamesModal('all', stint.teamName)}
              >
                <div className="text-xs font-semibold mb-1" style={{ color: stintSecondaryText, opacity: 0.7 }}>
                  Overall Record
                </div>
                <div className="text-2xl font-bold" style={{ color: stintSecondaryText }}>
                  {stint.overallRecord}
                </div>
                <div className="text-xs mt-1 opacity-60" style={{ color: stintSecondaryText }}>
                  Click to view games
                </div>
              </div>

              {/* As Favorite - Clickable for all teams */}
              <div
                className="text-center p-4 rounded-lg border-2 relative cursor-pointer hover:scale-105 transition-transform"
                style={{
                  backgroundColor: stintColors.secondary,
                  borderColor: stintPrimaryText
                }}
                onClick={() => openGamesModal('favorite', stint.teamName)}
              >
                <div className="text-xs font-semibold mb-1 flex items-center justify-center gap-1" style={{ color: stintSecondaryText, opacity: 0.7 }}>
                  As Favorite
                  {stint.isCurrent && (
                    <button
                      className="w-4 h-4 rounded-full text-xs font-bold flex items-center justify-center hover:opacity-80 cursor-help"
                      style={{ backgroundColor: stintPrimaryText, color: stintColors.primary }}
                      onMouseEnter={(e) => { e.stopPropagation(); setShowFavoriteTooltip(true) }}
                      onMouseLeave={(e) => { e.stopPropagation(); setShowFavoriteTooltip(false) }}
                      onClick={(e) => { e.stopPropagation(); setShowFavoriteTooltip(!showFavoriteTooltip) }}
                    >
                      ?
                    </button>
                  )}
                </div>
                <div className="text-2xl font-bold" style={{ color: stintSecondaryText }}>
                  {stint.favoriteRecord}
                </div>
                <div className="text-xs mt-1 opacity-60" style={{ color: stintSecondaryText }}>
                  Click to view games
                </div>
                {/* Tooltip - only show for current team */}
                {stint.isCurrent && showFavoriteTooltip && (
                  <div
                    className="absolute z-50 p-3 rounded-lg shadow-lg text-left text-xs w-64 -translate-x-1/2 left-1/2"
                    style={{
                      backgroundColor: stintColors.primary,
                      color: stintPrimaryText,
                      top: '100%',
                      marginTop: '8px'
                    }}
                  >
                    <div className="font-bold mb-1">How is this calculated?</div>
                    <ul className="space-y-1 list-disc list-inside">
                      <li>Ranked vs unranked: ranked team is favorite</li>
                      <li>Both ranked: lower rank is favorite</li>
                      <li>Both unranked: higher overall rating is favorite</li>
                      <li>Home team gets +5 ranking or +3 overall boost</li>
                    </ul>
                  </div>
                )}
              </div>

              {/* As Underdog - Clickable for all teams */}
              <div
                className="text-center p-4 rounded-lg border-2 cursor-pointer hover:scale-105 transition-transform"
                style={{
                  backgroundColor: stintColors.secondary,
                  borderColor: stintPrimaryText
                }}
                onClick={() => openGamesModal('underdog', stint.teamName)}
              >
                <div className="text-xs font-semibold mb-1" style={{ color: stintSecondaryText, opacity: 0.7 }}>
                  As Underdog
                </div>
                <div className="text-2xl font-bold" style={{ color: stintSecondaryText }}>
                  {stint.underdogRecord}
                </div>
                <div className="text-xs mt-1 opacity-60" style={{ color: stintSecondaryText }}>
                  Click to view games
                </div>
              </div>

              {/* Bowl Record - Clickable */}
              <div
                className="text-center p-4 rounded-lg border-2 cursor-pointer hover:scale-105 transition-transform"
                style={{
                  backgroundColor: stintColors.secondary,
                  borderColor: stintPrimaryText
                }}
                onClick={() => openGamesModal('bowl', stint.teamName)}
              >
                <div className="text-xs font-semibold mb-1" style={{ color: stintSecondaryText, opacity: 0.7 }}>
                  Bowl Record
                </div>
                <div className="text-2xl font-bold" style={{ color: stintSecondaryText }}>
                  {stint.bowlRecord || '0-0'}
                </div>
                <div className="text-xs mt-1 opacity-60" style={{ color: stintSecondaryText }}>
                  Click to view games
                </div>
              </div>

              {/* Conference Championships - Clickable */}
              <div
                className="text-center p-4 rounded-lg border-2 cursor-pointer hover:scale-105 transition-transform"
                style={{
                  backgroundColor: stintColors.secondary,
                  borderColor: stintPrimaryText
                }}
                onClick={() => openGamesModal('confChamp', stint.teamName)}
              >
                <div className="text-xs font-semibold mb-1" style={{ color: stintSecondaryText, opacity: 0.7 }}>
                  Conf. Championships
                </div>
                <div className="text-2xl font-bold" style={{ color: stintSecondaryText }}>
                  {stint.confChampionships || 0}
                </div>
                <div className="text-xs mt-1 opacity-60" style={{ color: stintSecondaryText }}>
                  Click to view games
                </div>
              </div>

              {/* CFP Appearances - Clickable */}
              <div
                className="text-center p-4 rounded-lg border-2 cursor-pointer hover:scale-105 transition-transform"
                style={{
                  backgroundColor: stintColors.secondary,
                  borderColor: stintPrimaryText
                }}
                onClick={() => openGamesModal('cfp', stint.teamName)}
              >
                <div className="text-xs font-semibold mb-1" style={{ color: stintSecondaryText, opacity: 0.7 }}>
                  CFP Appearances
                </div>
                <div className="text-2xl font-bold" style={{ color: stintSecondaryText }}>
                  {stint.playoffAppearances || 0}
                </div>
                <div className="text-xs mt-1 opacity-60" style={{ color: stintSecondaryText }}>
                  Click to view games
                </div>
              </div>
            </div>

            {/* Season-by-Season History */}
            {(() => {
              // Build year-by-year data for this stint
              const years = []
              const startYear = parseInt(stint.startYear) || currentDynasty.startYear
              const endYear = parseInt(stint.endYear) || currentDynasty.currentYear
              // Safety check to prevent infinite loops
              if (isNaN(startYear) || isNaN(endYear) || endYear < startYear || endYear - startYear > 50) {
                return null
              }
              for (let year = startYear; year <= endYear; year++) {
                const yearGames = stint.games?.filter(g => Number(g.year) === year) || []
                const wins = yearGames.filter(g => g.result === 'win' || g.result === 'W').length
                const losses = yearGames.filter(g => g.result === 'loss' || g.result === 'L').length
                const hasRecord = yearGames.length > 0

                // Check for conference championship
                const ccWins = currentDynasty.conferenceChampionshipsByYear?.[year] || []
                const wonCC = ccWins.some(cc => cc.winner === stint.teamAbbr)

                // Check for CFP result
                const cfpResults = currentDynasty.cfpResultsByYear?.[year]
                let cfpResult = null
                if (cfpResults) {
                  // Check each round
                  const rounds = ['firstRound', 'quarterfinals', 'semifinals', 'championship']
                  const roundLabels = { firstRound: 'First Round', quarterfinals: 'Quarterfinals', semifinals: 'Semifinals', championship: 'Championship' }
                  for (const round of rounds) {
                    const roundGames = cfpResults[round] || []
                    for (const game of roundGames) {
                      if (!game) continue // Skip null/undefined entries
                      if (game.team1 === stint.teamAbbr || game.team2 === stint.teamAbbr) {
                        if (game.winner === stint.teamAbbr) {
                          if (round === 'championship') {
                            cfpResult = { type: 'champion' }
                          }
                        } else if (game.winner) {
                          cfpResult = { type: 'lost', round: roundLabels[round] }
                        }
                      }
                    }
                  }
                }
                const isNationalChamp = cfpResult?.type === 'champion'

                // Check for bowl result (only if not in CFP)
                let bowlResult = null
                if (!cfpResult) {
                  const bowlGamesData = currentDynasty.bowlGamesByYear?.[year]
                  const bowlGames = Array.isArray(bowlGamesData) ? bowlGamesData : []
                  const teamBowl = bowlGames.find(b =>
                    b && (b.team1 === stint.teamAbbr || b.team2 === stint.teamAbbr)
                  )
                  if (teamBowl && teamBowl.winner) {
                    bowlResult = {
                      bowlName: teamBowl.bowlName?.replace(' Bowl', '') || 'Bowl',
                      won: teamBowl.winner === stint.teamAbbr
                    }
                  }
                }

                years.push({ year, wins, losses, hasRecord, wonCC, cfpResult, bowlResult, isNationalChamp })
              }

              if (years.length === 0) return null

              return (
                <div className="mt-4 pt-4 border-t-2" style={{ borderColor: `${stintPrimaryText}30` }}>
                  <div className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: stintPrimaryText, opacity: 0.7 }}>
                    Season-by-Season
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                    {[...years].reverse().map((yr) => {
                      const hasAchievement = yr.wonCC || yr.isNationalChamp

                      return (
                        <Link
                          key={yr.year}
                          to={`${pathPrefix}/team/${stint.teamAbbr}/${yr.year}`}
                          className="p-3 rounded-lg text-center transition-transform hover:scale-[1.02]"
                          style={{
                            backgroundColor: yr.isNationalChamp
                              ? '#fbbf2420'
                              : hasAchievement
                                ? `${stintColors.secondary}40`
                                : yr.hasRecord
                                  ? `${stintColors.secondary}25`
                                  : `${stintColors.secondary}10`,
                            border: yr.isNationalChamp
                              ? '2px solid #fbbf24'
                              : hasAchievement
                                ? `2px solid ${stintColors.secondary}`
                                : `2px solid ${yr.hasRecord ? `${stintPrimaryText}30` : `${stintPrimaryText}15`}`
                          }}
                        >
                          {/* Year */}
                          <div className="text-sm font-bold" style={{ color: stintPrimaryText }}>
                            {yr.year}
                          </div>

                          {/* Record */}
                          <div
                            className="text-lg font-bold mt-0.5"
                            style={{ color: yr.hasRecord ? stintPrimaryText : `${stintPrimaryText}50` }}
                          >
                            {yr.hasRecord ? `${yr.wins}-${yr.losses}` : '--'}
                          </div>

                          {/* Achievements */}
                          <div className="mt-1 space-y-0.5">
                            {yr.isNationalChamp && (
                              <div
                                className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                style={{ backgroundColor: '#fbbf24', color: '#78350f' }}
                              >
                                Natl Champ
                              </div>
                            )}
                            {yr.wonCC && !yr.isNationalChamp && (
                              <div
                                className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                                style={{ backgroundColor: stintColors.secondary, color: stintSecondaryText }}
                              >
                                Conf Champ
                              </div>
                            )}
                            {yr.cfpResult && yr.cfpResult.type === 'lost' && (
                              <div
                                className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                                style={{ backgroundColor: '#3b82f6', color: '#ffffff' }}
                              >
                                CFP {yr.cfpResult.round}
                              </div>
                            )}
                            {yr.bowlResult && !yr.cfpResult && (
                              <div
                                className="text-[10px] font-semibold px-1.5 py-0.5 rounded truncate"
                                style={{
                                  backgroundColor: yr.bowlResult.won ? '#16a34a' : '#6b728080',
                                  color: '#FFFFFF'
                                }}
                                title={yr.bowlResult.bowlName}
                              >
                                {yr.bowlResult.bowlName}
                              </div>
                            )}
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )
            })()}
          </div>
        )
      })}

      {/* Games Modal */}
      {showGamesModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4"
          style={{ margin: 0 }}
          onClick={() => setShowGamesModal(false)}
        >
          <div
            className="rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
            style={{ backgroundColor: teamColors.secondary }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              className="px-6 py-4 flex items-center justify-between flex-shrink-0"
              style={{ backgroundColor: teamColors.primary }}
            >
              <div>
                <h3 className="text-xl font-bold" style={{ color: primaryText }}>
                  {gamesModalType === 'favorite' ? 'Games as Favorite' :
                   gamesModalType === 'underdog' ? 'Games as Underdog' :
                   gamesModalType === 'all' ? 'All Games' :
                   gamesModalType === 'bowl' ? 'Bowl Games' :
                   gamesModalType === 'confChamp' ? 'Conference Championship Games' :
                   gamesModalType === 'cfp' ? 'CFP Games' : 'Games'}
                </h3>
                <p className="text-sm mt-0.5 opacity-80" style={{ color: primaryText }}>
                  {sortedGames.length} game{sortedGames.length !== 1 ? 's' : ''}
                </p>
              </div>
              <button
                onClick={() => setShowGamesModal(false)}
                className="p-2 rounded-full hover:bg-white/20 transition-colors"
                style={{ color: primaryText }}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {sortedGames.length === 0 ? (
                <div className="text-center py-12 opacity-60" style={{ color: secondaryText }}>
                  <svg className="w-16 h-16 mx-auto mb-4 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M12 20a8 8 0 100-16 8 8 0 000 16z" />
                  </svg>
                  <p className="text-lg font-semibold">No games yet</p>
                  <p className="text-sm mt-1">Games will appear here as you play them</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(gamesByYear).sort((a, b) => Number(b[0]) - Number(a[0])).map(([year, yearGames]) => (
                    <div key={year}>
                      {/* Year Header - scrolls with content */}
                      <div
                        className="px-3 py-2 rounded-lg mb-2 font-bold text-sm"
                        style={{ backgroundColor: teamColors.primary, color: primaryText }}
                      >
                        {year} Season
                      </div>

                      {/* Games for this year */}
                      <div className="space-y-2">
                        {yearGames.map((game, index) => {
                          const opponentColors = getOpponentColors(game.opponent)
                          const mascotName = getMascotName(game.opponent)
                          const opponentName = mascotName || teamAbbreviations[game.opponent]?.name || game.opponent
                          const opponentLogo = mascotName ? getTeamLogo(mascotName) : null
                          const gameIsWin = isWin(game)

                          return (
                            <Link
                              key={`${year}-${game.week}-${index}`}
                              to={`${pathPrefix}/game/${game.id}`}
                              className="flex items-center justify-between p-3 rounded-lg border-2 hover:opacity-90 transition-opacity"
                              style={{
                                backgroundColor: opponentColors.backgroundColor,
                                borderColor: gameIsWin ? '#86efac' : '#fca5a5'
                              }}
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                {/* Week */}
                                <div
                                  className="text-xs font-medium w-14 flex-shrink-0 opacity-80"
                                  style={{ color: opponentColors.textColor }}
                                >
                                  {(() => {
                                    const gameType = detectGameType(game)
                                    if (gameType === GAME_TYPES.CONFERENCE_CHAMPIONSHIP) return 'CC'
                                    if (gameType === GAME_TYPES.BOWL) return 'Bowl'
                                    if (gameType.startsWith('cfp_')) return 'CFP'
                                    return `Wk ${game.week}`
                                  })()}
                                </div>

                                {/* Location Badge */}
                                <span
                                  className="text-xs font-bold px-2 py-0.5 rounded flex-shrink-0"
                                  style={{
                                    backgroundColor: opponentColors.textColor,
                                    color: opponentColors.backgroundColor
                                  }}
                                >
                                  {game.location === 'away' ? '@' : 'vs'}
                                </span>

                                {/* Team Logo */}
                                {opponentLogo && (
                                  <div
                                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                                    style={{
                                      backgroundColor: '#FFFFFF',
                                      border: `2px solid ${opponentColors.textColor}`,
                                      padding: '2px'
                                    }}
                                  >
                                    <img
                                      src={opponentLogo}
                                      alt={opponentName}
                                      className="w-full h-full object-contain"
                                    />
                                  </div>
                                )}

                                {/* Opponent Info */}
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  {game.opponentRank && (
                                    <span
                                      className="text-xs font-bold opacity-70 flex-shrink-0"
                                      style={{ color: opponentColors.textColor }}
                                    >
                                      #{game.opponentRank}
                                    </span>
                                  )}
                                  <span
                                    className="font-semibold truncate"
                                    style={{ color: opponentColors.textColor }}
                                  >
                                    {opponentName}
                                  </span>
                                </div>
                              </div>

                              {/* Result */}
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span
                                  className="text-xs font-bold px-2 py-1 rounded"
                                  style={{
                                    backgroundColor: gameIsWin ? '#16a34a' : '#dc2626',
                                    color: '#FFFFFF'
                                  }}
                                >
                                  {gameIsWin ? 'W' : 'L'}
                                </span>
                                <span
                                  className="font-bold text-sm"
                                  style={{ color: opponentColors.textColor }}
                                >
                                  {Math.max(game.teamScore, game.opponentScore)}-{Math.min(game.teamScore, game.opponentScore)}
                                </span>
                              </div>
                            </Link>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
