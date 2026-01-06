import { useState, useMemo, useCallback } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useTeamColors } from '../../hooks/useTeamColors'
import { getContrastTextColor } from '../../utils/colorUtils'
import { teamAbbreviations, getAbbreviationFromDisplayName } from '../../data/teamAbbreviations'
import { getTeamLogo } from '../../data/teams'
import TeamStatsModal from '../../components/TeamStatsModal'
import StatsEntryModal from '../../components/StatsEntryModal'
import DetailedStatsEntryModal from '../../components/DetailedStatsEntryModal'
// Stats are read directly from player.statsByYear (single source of truth)

// Mapping from internal format (player.statsByYear) to box score display format
const INTERNAL_TO_BOXSCORE = {
  passing: {
    cmp: 'comp', att: 'attempts', yds: 'yards', td: 'tD', int: 'iNT', lng: 'long', sacks: 'sacks'
  },
  rushing: {
    car: 'carries', yds: 'yards', td: 'tD', lng: 'long', fum: 'fumbles', bt: 'brokenTackles'
  },
  receiving: {
    rec: 'receptions', yds: 'yards', td: 'tD', lng: 'long', drops: 'drops'
  },
  blocking: {
    sacksAllowed: 'sacksAllowed', pancakes: 'pancakes'
  },
  defense: {
    soloTkl: 'solo', astTkl: 'assists', tfl: 'tFL', sacks: 'sack', int: 'iNT',
    intYds: 'iNTYards', pd: 'deflections', ff: 'fF', fr: 'fR', td: 'tD'
  },
  kicking: {
    fgm: 'fGM', fga: 'fGA', xpm: 'xPM', xpa: 'xPA', lng: 'fGLong'
  },
  punting: {
    punts: 'punts', yds: 'yards', lng: 'long', in20: 'in20', tb: 'tB'
  },
  kickReturn: {
    ret: 'kR', yds: 'yards', td: 'tD', lng: 'long'
  },
  puntReturn: {
    ret: 'pR', yds: 'yards', td: 'tD', lng: 'long'
  }
}

// Reverse mapping: box score format (from sheet) to internal format (player.statsByYear)
const BOXSCORE_TO_INTERNAL = {
  passing: {
    comp: 'cmp', Completions: 'cmp',
    attempts: 'att', Attempts: 'att',
    yards: 'yds', Yards: 'yds',
    tD: 'td', Touchdowns: 'td',
    iNT: 'int', Interceptions: 'int',
    long: 'lng', 'Passing Long': 'lng',
    sacks: 'sacks', 'Sacks Taken': 'sacks'
  },
  rushing: {
    carries: 'car', Carries: 'car',
    yards: 'yds', Yards: 'yds',
    tD: 'td', Touchdowns: 'td',
    long: 'lng', 'Rushing Long': 'lng',
    fumbles: 'fum', Fumbles: 'fum',
    brokenTackles: 'bt', 'Broken Tackles': 'bt',
    yAC: 'yac', 'Yards After Contact': 'yac'
  },
  receiving: {
    receptions: 'rec', Receptions: 'rec',
    yards: 'yds', Yards: 'yds',
    tD: 'td', Touchdowns: 'td',
    long: 'lng', 'Receiving Long': 'lng',
    drops: 'drops', Drops: 'drops',
    rAC: 'rac', 'Yards After Catch': 'rac', 'Run After Catch': 'rac'
  },
  blocking: {
    sacksAllowed: 'sacksAllowed', 'Sacks Allowed': 'sacksAllowed',
    pancakes: 'pancakes', Pancakes: 'pancakes'
  },
  defense: {
    solo: 'soloTkl', 'Solo Tackles': 'soloTkl',
    assists: 'astTkl', 'Assisted Tackles': 'astTkl',
    tFL: 'tfl', 'Tackles for Loss': 'tfl',
    sack: 'sacks', Sacks: 'sacks',
    iNT: 'int', Interceptions: 'int',
    iNTYards: 'intYds', 'INT Return Yards': 'intYds',
    deflections: 'pd', Deflections: 'pd',
    fF: 'ff', 'Forced Fumbles': 'ff',
    fR: 'fr', 'Fumble Recoveries': 'fr',
    tD: 'td', 'Defensive TDs': 'td'
  },
  kicking: {
    fGM: 'fgm', 'FG Made': 'fgm',
    fGA: 'fga', 'FG Attempted': 'fga',
    fGLong: 'lng', 'FG Long': 'lng',
    xPM: 'xpm', 'XP Made': 'xpm',
    xPA: 'xpa', 'XP Attempted': 'xpa',
    kickoffs: 'kickoffs', Kickoffs: 'kickoffs',
    touchbacks: 'touchbacks', Touchbacks: 'touchbacks'
  },
  punting: {
    punts: 'punts', Punts: 'punts',
    yards: 'yds', 'Punting Yards': 'yds',
    netYards: 'netYds', 'Net Punting Yards': 'netYds',
    long: 'lng', 'Punt Long': 'lng',
    in20: 'in20', 'Punts Inside 20': 'in20',
    tB: 'tb', Touchbacks: 'tb'
  },
  kickReturn: {
    kR: 'ret', 'Kickoff Returns': 'ret',
    yards: 'yds', 'KR Yardage': 'yds',
    tD: 'td', 'KR TDs': 'td',
    long: 'lng', 'KR Long': 'lng'
  },
  puntReturn: {
    pR: 'ret', 'Punt Returns': 'ret',
    yards: 'yds', 'PR Yardage': 'yds',
    tD: 'td', 'PR TDs': 'td',
    long: 'lng', 'PR Long': 'lng'
  }
}

// Convert box score format stats to internal format for saving to player.statsByYear
const convertBoxScoreToInternal = (stats, categoryName) => {
  const mapping = BOXSCORE_TO_INTERNAL[categoryName] || {}
  const converted = {}
  Object.entries(stats).forEach(([key, value]) => {
    const internalKey = mapping[key] || key
    // Skip null/undefined values - these are empty cells in the sheet and should NOT overwrite existing stats
    if (value === null || value === undefined) {
      return
    }
    // Parse numeric values
    const numValue = typeof value === 'string' ? parseFloat(value) : value
    if (!isNaN(numValue)) {
      converted[internalKey] = numValue
    }
  })
  return converted
}

// Map abbreviation to mascot name for logo lookup
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
  'FCSE': 'FCS East Judicials', 'FCSM': 'FCS Midwest Rebels', 'FCSN': 'FCS Northwest Stallions', 'FCSW': 'FCS West Titans',
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
  'USM': 'Southern Mississippi Golden Eagles', 'RUTG': 'Rutgers Scarlet Knights', 'SHSU': 'Sam Houston State Bearkats',
  'TTU': 'Texas Tech Red Raiders', 'TULN': 'Tulane Green Wave', 'UH': 'Houston Cougars',
  'UL': 'Lafayette Ragin\' Cajuns', 'UT': 'Tennessee Volunteers'
}

const getMascotName = (abbr) => mascotMap[abbr] || null

const getTeamColorsFromAbbr = (abbr) => {
  const team = teamAbbreviations[abbr]
  return {
    primary: team?.backgroundColor || '#4B5563',
    secondary: team?.textColor || '#FFFFFF'
  }
}

export default function TeamStats() {
  const { team: urlTeam, year: urlYear } = useParams()
  const navigate = useNavigate()
  const { currentDynasty, updateDynasty, isViewOnly } = useDynasty()
  const pathPrefix = usePathPrefix()

  // Modal state
  const [modalData, setModalData] = useState(null)
  const [showStatsModal, setShowStatsModal] = useState(false)
  const [showPlayerStatsModal, setShowPlayerStatsModal] = useState(false)
  const [showDetailedStatsModal, setShowDetailedStatsModal] = useState(false)

  // Sort state for player stats tables - with sensible defaults
  const [sortConfig, setSortConfig] = useState({
    passing: { column: 'yards', direction: 'desc' },
    rushing: { column: 'yards', direction: 'desc' },
    receiving: { column: 'yards', direction: 'desc' },
    blocking: { column: 'pancakes', direction: 'desc' },
    defense: { column: 'totalTackles', direction: 'desc' },
    kicking: { column: 'fGM', direction: 'desc' },
    punting: { column: 'punts', direction: 'desc' },
    kickReturn: { column: 'yards', direction: 'desc' },
    puntReturn: { column: 'yards', direction: 'desc' }
  })

  // Get current team abbreviation
  const currentTeamAbbr = getAbbreviationFromDisplayName(currentDynasty?.teamName)

  // Use URL params or defaults
  const selectedTeam = urlTeam || currentTeamAbbr
  const selectedYear = urlYear ? parseInt(urlYear) : currentDynasty?.currentYear

  // Get team colors for selected team
  const teamColors = getTeamColorsFromAbbr(selectedTeam)
  const primaryText = getContrastTextColor(teamColors.primary)
  const secondaryText = getContrastTextColor(teamColors.secondary)

  // Get team logo and name
  const teamMascot = getMascotName(selectedTeam)
  const teamLogo = teamMascot ? getTeamLogo(teamMascot) : null
  const teamFullName = teamMascot || teamAbbreviations[selectedTeam]?.name || selectedTeam

  if (!currentDynasty) {
    return <div className="p-6">Loading...</div>
  }

  // Get all years with data
  const availableYears = useMemo(() => {
    const years = new Set()
    ;(currentDynasty.games || []).forEach(g => {
      if (g.year) years.add(parseInt(g.year))
    })
    if (currentDynasty.currentYear) years.add(parseInt(currentDynasty.currentYear))
    if (currentDynasty.startYear) years.add(parseInt(currentDynasty.startYear))
    return Array.from(years).sort((a, b) => b - a)
  }, [currentDynasty])

  // Get all teams that have games
  const availableTeams = useMemo(() => {
    const teams = new Set()
    teams.add(currentTeamAbbr)
    ;(currentDynasty.games || []).forEach(g => {
      if (g.userTeam) teams.add(g.userTeam)
      if (g.opponent) teams.add(g.opponent)
    })
    return Array.from(teams).sort((a, b) => {
      const nameA = getMascotName(a) || a
      const nameB = getMascotName(b) || b
      return nameA.localeCompare(nameB)
    })
  }, [currentDynasty, currentTeamAbbr])

  // Helper functions
  const isWin = (g) => g.result === 'win' || g.result === 'W'
  const isLoss = (g) => g.result === 'loss' || g.result === 'L'

  const isPostseasonGame = (g) => {
    return g.isConferenceChampionship || g.bowlName || g.isCFPFirstRound ||
           g.isCFPQuarterfinal || g.isCFPSemifinal || g.isCFPChampionship
  }

  // Calculate stats for selected team and year
  const stats = useMemo(() => {
    const games = (currentDynasty.games || []).filter(g => {
      // Skip CPU games (have team1/team2 but no userTeam)
      if (!g.userTeam && g.team1 && g.team2) return false
      const gameYear = parseInt(g.year)
      if (gameYear !== selectedYear) return false
      return g.userTeam === selectedTeam
    })

    const wins = games.filter(isWin).length
    const losses = games.filter(isLoss).length

    const favoriteGames = games.filter(g => g.favoriteStatus === 'favorite')
    const favoriteWins = favoriteGames.filter(isWin).length
    const favoriteLosses = favoriteGames.filter(isLoss).length

    const underdogGames = games.filter(g => g.favoriteStatus === 'underdog')
    const underdogWins = underdogGames.filter(isWin).length
    const underdogLosses = underdogGames.filter(isLoss).length

    const postseasonGames = games.filter(isPostseasonGame)
    const postseasonWins = postseasonGames.filter(isWin).length
    const postseasonLosses = postseasonGames.filter(isLoss).length

    const conferenceGames = games.filter(g => g.isConferenceGame)
    const confWins = conferenceGames.filter(isWin).length
    const confLosses = conferenceGames.filter(isLoss).length

    const homeGames = games.filter(g => g.location === 'Home' || g.location === 'home')
    const homeWins = homeGames.filter(isWin).length
    const homeLosses = homeGames.filter(isLoss).length

    const awayGames = games.filter(g => g.location === 'Road' || g.location === 'Away' || g.location === 'road' || g.location === 'away')
    const awayWins = awayGames.filter(isWin).length
    const awayLosses = awayGames.filter(isLoss).length

    const neutralGames = games.filter(g => g.location === 'Neutral' || g.location === 'neutral')
    const neutralWins = neutralGames.filter(isWin).length
    const neutralLosses = neutralGames.filter(isLoss).length

    return {
      games,
      overall: { wins, losses, record: `${wins}-${losses}` },
      favorite: { wins: favoriteWins, losses: favoriteLosses, record: `${favoriteWins}-${favoriteLosses}`, games: favoriteGames },
      underdog: { wins: underdogWins, losses: underdogLosses, record: `${underdogWins}-${underdogLosses}`, games: underdogGames },
      postseason: { wins: postseasonWins, losses: postseasonLosses, record: `${postseasonWins}-${postseasonLosses}`, games: postseasonGames },
      conference: { wins: confWins, losses: confLosses, record: `${confWins}-${confLosses}`, games: conferenceGames },
      home: { wins: homeWins, losses: homeLosses, record: `${homeWins}-${homeLosses}`, games: homeGames },
      away: { wins: awayWins, losses: awayLosses, record: `${awayWins}-${awayLosses}`, games: awayGames },
      neutral: { wins: neutralWins, losses: neutralLosses, record: `${neutralWins}-${neutralLosses}`, games: neutralGames }
    }
  }, [currentDynasty, selectedTeam, selectedYear])

  // Aggregate team stats from box scores
  const teamStats = useMemo(() => {
    let pointsFor = 0, totalOffense = 0, rushAttempts = 0, rushYards = 0, rushTds = 0
    let passAttempts = 0, passYards = 0, passTds = 0, firstDowns = 0
    let pointsAgainst = 0, defTotalYards = 0, defPassYards = 0, defRushYards = 0
    let defSacks = 0, forcedFumbles = 0, defInterceptions = 0
    let gamesWithStats = 0

    stats.games.forEach(game => {
      pointsFor += game.teamScore || 0
      pointsAgainst += game.opponentScore || 0

      if (!game.boxScore) return

      const isHome = game.location === 'home' || game.location === 'Home'
      const ourPlayerBoxScore = isHome ? game.boxScore.home : game.boxScore.away

      if (game.boxScore.teamStats) {
        const homeAbbr = game.boxScore.teamStats.home?.teamAbbr?.toUpperCase()
        const awayAbbr = game.boxScore.teamStats.away?.teamAbbr?.toUpperCase()

        let ourTeamStats = null, oppTeamStats = null

        if (homeAbbr === selectedTeam) {
          ourTeamStats = game.boxScore.teamStats.home
          oppTeamStats = game.boxScore.teamStats.away
        } else if (awayAbbr === selectedTeam) {
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

        if (oppTeamStats) {
          defTotalYards += parseFloat(oppTeamStats.totalOffense) || 0
          defPassYards += parseFloat(oppTeamStats.passYards) || 0
          defRushYards += parseFloat(oppTeamStats.rushYards) || 0
        }
      }

      if (ourPlayerBoxScore?.defense && Array.isArray(ourPlayerBoxScore.defense)) {
        ourPlayerBoxScore.defense.forEach(player => {
          defSacks += parseFloat(player.sack) || 0
          forcedFumbles += parseFloat(player.fF) || 0
          defInterceptions += parseFloat(player.iNT) || 0
        })
      }
    })

    const totalGamesPlayed = stats.games.length
    const totalPlays = rushAttempts + passAttempts
    const yardsPerPlay = totalPlays > 0 ? totalOffense / totalPlays : 0
    const passYardsPerGame = totalGamesPlayed > 0 ? passYards / totalGamesPlayed : 0
    const rushYardsPerCarry = rushAttempts > 0 ? rushYards / rushAttempts : 0

    const aggregated = {
      gamesWithStats, pointsFor, totalOffense, yardsPerPlay, passYards,
      passYardsPerGame, passTds, rushYards, rushYardsPerCarry, rushTds, firstDowns,
      pointsAgainst, defTotalYards, defPassYards, defRushYards,
      defSacks, forcedFumbles, defInterceptions
    }

    const manualStats = currentDynasty.teamStatsByYear?.[selectedYear]
    if (manualStats) {
      const overrideFields = [
        'pointsFor', 'totalOffense', 'yardsPerPlay', 'passYards',
        'passTds', 'rushYards', 'rushTds', 'firstDowns',
        'pointsAgainst', 'defTotalYards', 'defPassYards', 'defRushYards',
        'defSacks', 'forcedFumbles', 'defInterceptions'
      ]
      overrideFields.forEach(field => {
        if (manualStats[field] !== null && manualStats[field] !== undefined) {
          aggregated[field] = manualStats[field]
          aggregated.hasManualOverrides = true
        }
      })
    }

    return aggregated
  }, [currentDynasty, selectedTeam, selectedYear, stats.games])

  // Read player stats from player.statsByYear (primary for games/snaps) and box scores (for detailed stats)
  const playerStats = useMemo(() => {
    const allPlayers = currentDynasty?.players || []
    const userTeamAbbr = getAbbreviationFromDisplayName(currentDynasty?.teamName)
    const yearKey = String(selectedYear)
    const numKey = Number(selectedYear)

    // Helper to get player's year stats with consistent key handling
    const getPlayerYearStats = (player) => {
      return player.statsByYear?.[yearKey]
        ?? player.statsByYear?.[numKey]
        ?? player.statsByYear?.[selectedYear]
    }

    // Helper to convert internal format to box score format for display
    const convertInternalToBoxScore = (playerName, categoryStats, categoryName, gamesPlayed) => {
      const result = { playerName, games: gamesPlayed }
      const mapping = INTERNAL_TO_BOXSCORE[categoryName] || {}
      Object.entries(categoryStats || {}).forEach(([key, value]) => {
        if (key === 'gamesPlayed' || key === 'snapsPlayed') return
        const boxScoreKey = mapping[key] || key
        result[boxScoreKey] = parseFloat(value) || 0
      })
      return result
    }

    // Process category - read all stats from player.statsByYear (single source of truth)
    const processCategory = (internalCatName) => {
      const playerStatsMap = new Map() // Use Map to deduplicate by normalized name

      allPlayers.forEach(player => {
        if (!player.name) return
        const normalizedName = player.name.toLowerCase().trim()
        if (playerStatsMap.has(normalizedName)) return

        // Get stats from player.statsByYear (SINGLE SOURCE OF TRUTH)
        const yearStats = getPlayerYearStats(player)
        if (!yearStats) return

        const gamesPlayed = yearStats.gamesPlayed || 0
        const categoryStats = yearStats[internalCatName]

        // Only include if has meaningful stats in this category
        if (categoryStats) {
          const stats = convertInternalToBoxScore(player.name, categoryStats, internalCatName, gamesPlayed)
          const statKeys = Object.keys(stats).filter(k => k !== 'playerName' && k !== 'games')
          if (statKeys.some(k => stats[k] > 0)) {
            playerStatsMap.set(normalizedName, stats)
          }
        }
      })

      return Array.from(playerStatsMap.values())
    }

    // Get raw data from each category
    const rawPassing = processCategory('passing')
    const rawRushing = processCategory('rushing')
    const rawReceiving = processCategory('receiving')
    const rawBlocking = processCategory('blocking')
    const rawDefense = processCategory('defense')
    const rawKicking = processCategory('kicking')
    const rawPunting = processCategory('punting')
    const rawKickReturn = processCategory('kickReturn')
    const rawPuntReturn = processCategory('puntReturn')

    // Compute derived stats for each category and filter to only players with stats
    const passing = rawPassing.map(p => ({
      ...p,
      comp: p.comp || 0,
      attempts: p.attempts || 0,
      yards: p.yards || 0,
      tD: p.tD || 0,
      iNT: p.iNT || 0,
      long: p.long || 0,
      sacks: p.sacks || 0,
      compPct: p.attempts > 0 ? ((p.comp / p.attempts) * 100).toFixed(1) : '0.0',
      yardsPerGame: p.games > 0 ? (p.yards / p.games).toFixed(1) : '0.0',
      tdPct: p.attempts > 0 ? ((p.tD / p.attempts) * 100).toFixed(1) : '0.0',
      intPct: p.attempts > 0 ? ((p.iNT / p.attempts) * 100).toFixed(1) : '0.0',
      tdIntRatio: p.iNT > 0 ? (p.tD / p.iNT).toFixed(2).replace('.', ':') : (p.tD > 0 ? '∞' : '0:00')
    })).filter(p => p.comp > 0 || p.attempts > 0)

    const rushing = rawRushing.map(p => ({
      ...p,
      carries: p.carries || 0,
      yards: p.yards || 0,
      tD: p.tD || 0,
      fumbles: p.fumbles || 0,
      long: p.long || 0,
      '20+': p['20+'] || 0,
      yAC: p.yAC || 0,
      ypc: p.carries > 0 ? (p.yards / p.carries).toFixed(1) : '0.0',
      yardsPerGame: p.games > 0 ? (p.yards / p.games).toFixed(1) : '0.0',
      yacAvg: p.carries > 0 ? ((p.yAC || 0) / p.carries).toFixed(1) : '0.0'
    })).filter(p => p.carries > 0)

    const receiving = rawReceiving.map(p => ({
      ...p,
      receptions: p.receptions || 0,
      yards: p.yards || 0,
      tD: p.tD || 0,
      rAC: p.rAC || 0,
      drops: p.drops || 0,
      long: p.long || 0,
      ypr: p.receptions > 0 ? (p.yards / p.receptions).toFixed(1) : '0.0',
      yardsPerGame: p.games > 0 ? (p.yards / p.games).toFixed(1) : '0.0',
      racAvg: p.receptions > 0 ? ((p.rAC || 0) / p.receptions).toFixed(1) : '0.0'
    })).filter(p => p.receptions > 0)

    const blocking = rawBlocking.map(p => ({
      ...p,
      pancakes: p.pancakes || 0,
      sacksAllowed: p.sacksAllowed || 0
    })).filter(p => p.pancakes > 0 || p.sacksAllowed > 0)

    const defense = rawDefense.map(p => ({
      ...p,
      solo: p.solo || 0,
      assists: p.assists || 0,
      tFL: p.tFL || 0,
      sack: p.sack || 0,
      iNT: p.iNT || 0,
      iNTYards: p.iNTYards || 0,
      deflections: p.deflections || 0,
      fF: p.fF || 0,
      fR: p.fR || 0,
      tD: p.tD || 0,
      totalTackles: (p.solo || 0) + (p.assists || 0)
    })).filter(p => p.solo > 0 || p.assists > 0 || p.sack > 0 || p.iNT > 0 || p.tFL > 0 || p.deflections > 0 || p.fF > 0 || p.fR > 0 || p.tD > 0)

    const kicking = rawKicking.map(p => ({
      ...p,
      fGM: p.fGM || 0,
      fGA: p.fGA || 0,
      xPM: p.xPM || 0,
      xPA: p.xPA || 0,
      kickoffs: p.kickoffs || 0,
      touchbacks: p.touchbacks || 0,
      fgPct: p.fGA > 0 ? ((p.fGM / p.fGA) * 100).toFixed(1) : '0.0'
    })).filter(p => p.fGM > 0 || p.fGA > 0 || p.xPM > 0 || p.xPA > 0 || p.kickoffs > 0)

    const punting = rawPunting.map(p => ({
      ...p,
      punts: p.punts || 0,
      yards: p.yards || 0,
      netYards: p.netYards || 0,
      in20: p.in20 || 0,
      long: p.long || 0,
      avg: p.punts > 0 ? (p.yards / p.punts).toFixed(1) : '0.0'
    })).filter(p => p.punts > 0)

    const kickReturn = rawKickReturn.map(p => ({
      ...p,
      kR: p.kR || 0,
      yards: p.yards || 0,
      tD: p.tD || 0,
      long: p.long || 0,
      avg: p.kR > 0 ? (p.yards / p.kR).toFixed(1) : '0.0'
    })).filter(p => p.kR > 0)

    const puntReturn = rawPuntReturn.map(p => ({
      ...p,
      pR: p.pR || 0,
      yards: p.yards || 0,
      tD: p.tD || 0,
      long: p.long || 0,
      avg: p.pR > 0 ? (p.yards / p.pR).toFixed(1) : '0.0'
    })).filter(p => p.pR > 0)

    return {
      passing,
      rushing,
      receiving,
      blocking,
      defense,
      kicking,
      punting,
      kickReturn,
      puntReturn
    }
  }, [currentDynasty?.players, currentDynasty?.games, currentDynasty?.teamName, selectedYear])

  // Helper to find player PID by name
  const getPlayerPID = useCallback((playerName) => {
    if (!playerName || !currentDynasty?.players) return null
    const normalizedName = playerName.toLowerCase().trim()
    const player = currentDynasty.players.find(p =>
      p.name?.toLowerCase().trim() === normalizedName
    )
    return player?.pid || null
  }, [currentDynasty?.players])

  // Sort handler
  const handleSort = useCallback((category, column) => {
    setSortConfig(prev => {
      const currentSort = prev[category]
      if (currentSort?.column === column) {
        return {
          ...prev,
          [category]: { column, direction: currentSort.direction === 'desc' ? 'asc' : 'desc' }
        }
      }
      return { ...prev, [category]: { column, direction: 'desc' } }
    })
  }, [])

  // Get sorted data for a category
  const getSortedData = useCallback((category, data) => {
    const config = sortConfig[category]
    if (!config) return data

    return [...data].sort((a, b) => {
      let aVal = a[config.column]
      let bVal = b[config.column]

      // Handle numeric strings
      if (typeof aVal === 'string' && !isNaN(parseFloat(aVal))) aVal = parseFloat(aVal)
      if (typeof bVal === 'string' && !isNaN(parseFloat(bVal))) bVal = parseFloat(bVal)

      // Handle string comparison
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return config.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }

      // Numeric comparison
      if (config.direction === 'asc') {
        return (aVal || 0) - (bVal || 0)
      }
      return (bVal || 0) - (aVal || 0)
    })
  }, [sortConfig])

  const handleTeamChange = (newTeam) => {
    navigate(`${pathPrefix}/team-stats/${newTeam}/${selectedYear}`)
  }

  const handleYearChange = (newYear) => {
    navigate(`${pathPrefix}/team-stats/${selectedTeam}/${newYear}`)
  }

  const handleSaveStats = async (stats) => {
    if (!currentDynasty?.id) return
    const existingStats = currentDynasty.teamStatsByYear || {}
    await updateDynasty(currentDynasty.id, {
      teamStatsByYear: {
        ...existingStats,
        [selectedYear]: stats
      }
    })
  }

  // Handler for saving player stats (games/snaps)
  // Saves to each player's statsByYear field
  const handleSavePlayerStats = async (stats) => {
    if (!currentDynasty?.id) return

    // Normalize year key to string for consistent storage
    const yearKey = String(selectedYear)

    // Update each player's statsByYear field with their games/snaps
    const updatedPlayers = (currentDynasty.players || []).map(player => {
      const playerStat = stats.find(s =>
        s.pid === player.pid || s.name?.toLowerCase().trim() === player.name?.toLowerCase().trim()
      )
      if (playerStat) {
        const existingStatsByYear = player.statsByYear || {}
        // Check both string and number keys for existing stats
        const existingYearStats = existingStatsByYear[yearKey] || existingStatsByYear[Number(yearKey)] || {}

        // Use nullish coalescing (??) instead of || to properly handle 0 as a valid value
        const newGamesPlayed = playerStat.gamesPlayed ?? existingYearStats.gamesPlayed ?? 0
        const newSnapsPlayed = playerStat.snapsPlayed ?? existingYearStats.snapsPlayed ?? 0

        return {
          ...player,
          statsByYear: {
            ...existingStatsByYear,
            [yearKey]: {
              ...existingYearStats,
              gamesPlayed: newGamesPlayed,
              snapsPlayed: newSnapsPlayed
            }
          }
        }
      }
      return player
    })

    // Only update players - stats now stored in player.statsByYear only
    await updateDynasty(currentDynasty.id, {
      players: updatedPlayers
    })
  }

  // Handler for saving detailed stats (passing, rushing, etc.)
  // Saves to each player's statsByYear field
  const handleSaveDetailedStats = async (detailedStats) => {
    if (!currentDynasty?.id) return

    // Build detailed stats map by player name for easy lookup
    const detailedStatsMap = new Map()
    const categoryMapping = {
      'Passing': 'passing',
      'Rushing': 'rushing',
      'Receiving': 'receiving',
      'Blocking': 'blocking',
      'Defensive': 'defense',
      'Kicking': 'kicking',
      'Punting': 'punting',
      'Kick Return': 'kickReturn',
      'Punt Return': 'puntReturn'
    }

    Object.entries(detailedStats).forEach(([categoryName, players]) => {
      const internalCat = categoryMapping[categoryName] || categoryName.toLowerCase()
      if (Array.isArray(players)) {
        players.forEach(player => {
          if (!player.name) return
          const key = player.name.toLowerCase().trim()
          if (!detailedStatsMap.has(key)) {
            detailedStatsMap.set(key, {})
          }
          const playerStatsObj = detailedStatsMap.get(key)
          // Copy all stats except name/pid
          const statsOnly = { ...player }
          delete statsOnly.name
          delete statsOnly.pid
          // Convert from box score format (from sheet) to internal format for player.statsByYear
          const convertedStats = convertBoxScoreToInternal(statsOnly, internalCat)
          // Only add if there are actual stats (not all null/empty)
          if (Object.keys(convertedStats).length > 0) {
            playerStatsObj[internalCat] = convertedStats
          }
        })
      }
    })

    // Update each player's statsByYear field with detailed stats (preserve games/snaps)
    // Normalize year key to string for consistent storage
    const yearKey = String(selectedYear)

    const updatedPlayers = (currentDynasty.players || []).map(player => {
      const playerNameLower = player.name?.toLowerCase().trim()
      const detailedPlayerStats = detailedStatsMap.get(playerNameLower) || {}

      // Only update if player has new detailed stats
      if (Object.keys(detailedPlayerStats).length > 0) {
        const existingStatsByYear = player.statsByYear || {}
        // Check both string and number keys for existing stats (consistent with handleSavePlayerStats)
        const existingYearStats = existingStatsByYear[yearKey] || existingStatsByYear[Number(yearKey)] || {}

        // Deep merge: for each category in detailedPlayerStats, merge with existing category stats
        // This preserves any existing stats not included in the sheet update
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
            [yearKey]: mergedYearStats
          }
        }
      }
      return player
    })

    // Only update players - stats now stored in player.statsByYear only
    await updateDynasty(currentDynasty.id, {
      players: updatedPlayers
    })
  }

  const openModal = (title, games) => {
    if (games && games.length > 0) {
      // Sort newest to oldest (descending by week)
      setModalData({ title, games: games.sort((a, b) => (b.week || 0) - (a.week || 0)) })
    }
  }

  const getGameWeekLabel = (game) => {
    if (game.isCFPChampionship) return 'NCG'
    if (game.isCFPSemifinal) return 'CFP Semi'
    if (game.isCFPQuarterfinal) return 'CFP QF'
    if (game.isCFPFirstRound) return 'CFP R1'
    if (game.bowlName) return 'Bowl'
    if (game.isConferenceChampionship) return 'CCG'
    return `Wk ${game.week}`
  }

  const gamesPlayed = stats.games.length || 1

  // Stat row component for clean table-like display
  const StatRow = ({ label, total, perGame }) => (
    <div className="flex items-center justify-between py-2 border-b border-white/10 last:border-0">
      <span className="text-sm" style={{ color: primaryText, opacity: 0.9 }}>{label}</span>
      <div className="flex items-center gap-6">
        <span className="text-lg font-bold w-20 text-right" style={{ color: primaryText }}>
          {typeof total === 'number' ? total.toLocaleString() : total}
        </span>
        <span className="text-sm w-16 text-right" style={{ color: primaryText, opacity: 0.6 }}>
          {perGame !== undefined ? `${perGame}/G` : ''}
        </span>
      </div>
    </div>
  )

  // Record item for the compact record display
  const RecordItem = ({ label, record, games, clickable }) => (
    <div
      className={`flex items-center justify-between py-2 px-3 rounded-lg ${clickable && games?.length > 0 ? 'cursor-pointer hover:bg-white/10 transition-colors' : ''}`}
      onClick={() => clickable && games?.length > 0 && openModal(label, games)}
    >
      <span className="text-sm" style={{ color: primaryText, opacity: 0.8 }}>{label}</span>
      <span className="font-bold" style={{ color: primaryText }}>{record}</span>
    </div>
  )

  // Sortable table header component
  const SortableHeader = ({ category, column, label, align = 'right' }) => {
    const config = sortConfig[category]
    const isActive = config?.column === column
    const direction = isActive ? config.direction : null

    return (
      <th
        className={`px-2 py-2 text-xs font-semibold uppercase cursor-pointer hover:bg-white/10 transition-colors ${align === 'left' ? 'text-left' : 'text-right'}`}
        style={{ color: primaryText, opacity: isActive ? 1 : 0.7 }}
        onClick={() => handleSort(category, column)}
      >
        <span className="inline-flex items-center gap-1">
          {align === 'right' && direction && (
            <span className="text-[10px]">{direction === 'desc' ? '▼' : '▲'}</span>
          )}
          {label}
          {align === 'left' && direction && (
            <span className="text-[10px]">{direction === 'desc' ? '▼' : '▲'}</span>
          )}
        </span>
      </th>
    )
  }

  // Format number with commas for thousands
  const formatStatValue = (value, colKey) => {
    // Don't format percentages, averages, or ratios (they contain decimals or colons)
    if (typeof value === 'string' && (value.includes('%') || value.includes(':') || value.includes('.'))) {
      return value
    }
    // Format integers >= 100 with commas
    if (typeof value === 'number' && Number.isInteger(value) && Math.abs(value) >= 100) {
      return value.toLocaleString()
    }
    return value
  }

  // Player stats table component
  const PlayerStatsTable = ({ category, title, columns, data }) => {
    if (!data || data.length === 0) return null

    const sortedData = getSortedData(category, data)

    return (
      <div
        className="rounded-xl shadow-lg overflow-hidden"
        style={{ backgroundColor: teamColors.primary }}
      >
        <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: 'rgba(0,0,0,0.15)' }}>
          <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: primaryText }}>
            {title}
          </h3>
          <span className="text-xs px-2 py-1 rounded-full bg-white/10" style={{ color: primaryText, opacity: 0.6 }}>
            {data.length} {data.length === 1 ? 'Player' : 'Players'}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-max">
            <thead>
              <tr style={{ backgroundColor: 'rgba(0,0,0,0.1)' }}>
                {columns.map((col, idx) => (
                  <SortableHeader
                    key={col.key}
                    category={category}
                    column={col.key}
                    label={col.label}
                    align={idx === 0 ? 'left' : 'right'}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedData.map((player, idx) => {
                const playerPID = getPlayerPID(player.playerName)
                return (
                  <tr
                    key={player.playerName}
                    className="border-t border-white/10 hover:bg-white/5 transition-colors"
                  >
                    {columns.map((col, colIdx) => {
                      const rawValue = player[col.key]
                      const formattedValue = col.format ? col.format(rawValue) : formatStatValue(rawValue, col.key)
                      return (
                        <td
                          key={col.key}
                          className={`px-2 py-2 text-sm ${colIdx === 0 ? 'text-left font-medium' : 'text-right'}`}
                          style={{ color: primaryText, opacity: colIdx === 0 ? 1 : 0.9 }}
                        >
                          {colIdx === 0 && playerPID ? (
                            <Link
                              to={`${pathPrefix}/player/${playerPID}`}
                              className="hover:underline"
                              style={{ color: primaryText }}
                            >
                              {rawValue}
                            </Link>
                          ) : formattedValue}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // Define column configurations for each stat category
  const statColumns = {
    passing: [
      { key: 'playerName', label: 'Player' },
      { key: 'games', label: 'G' },
      { key: 'comp', label: 'CMP' },
      { key: 'attempts', label: 'ATT' },
      { key: 'compPct', label: 'CMP%' },
      { key: 'yards', label: 'YDS' },
      { key: 'yardsPerGame', label: 'YDS/G' },
      { key: 'tD', label: 'TD' },
      { key: 'tdPct', label: 'TD%' },
      { key: 'iNT', label: 'INT' },
      { key: 'intPct', label: 'INT%' },
      { key: 'tdIntRatio', label: 'TD:INT' },
      { key: 'sacks', label: 'SCK' }
    ],
    rushing: [
      { key: 'playerName', label: 'Player' },
      { key: 'games', label: 'G' },
      { key: 'carries', label: 'CAR' },
      { key: 'yards', label: 'YDS' },
      { key: 'ypc', label: 'AVG' },
      { key: 'tD', label: 'TD' },
      { key: 'yardsPerGame', label: 'YDS/G' },
      { key: 'yAC', label: 'YAC' },
      { key: 'yacAvg', label: 'YAC AVG' },
      { key: 'fumbles', label: 'FUM' },
      { key: '20+', label: '20+' },
      { key: 'long', label: 'LNG' }
    ],
    receiving: [
      { key: 'playerName', label: 'Player' },
      { key: 'games', label: 'G' },
      { key: 'receptions', label: 'REC' },
      { key: 'yards', label: 'YDS' },
      { key: 'ypr', label: 'AVG' },
      { key: 'tD', label: 'TD' },
      { key: 'yardsPerGame', label: 'YDS/G' },
      { key: 'rAC', label: 'RAC' },
      { key: 'racAvg', label: 'RAC AVG' },
      { key: 'drops', label: 'DROP' },
      { key: 'long', label: 'LNG' }
    ],
    blocking: [
      { key: 'playerName', label: 'Player' },
      { key: 'games', label: 'G' },
      { key: 'pancakes', label: 'PANC' },
      { key: 'sacksAllowed', label: 'SCK ALW' }
    ],
    defense: [
      { key: 'playerName', label: 'Player' },
      { key: 'games', label: 'G' },
      { key: 'solo', label: 'SOLO' },
      { key: 'assists', label: 'AST' },
      { key: 'totalTackles', label: 'TOT' },
      { key: 'tFL', label: 'TFL' },
      { key: 'sack', label: 'SCK' },
      { key: 'iNT', label: 'INT' },
      { key: 'deflections', label: 'PD' },
      { key: 'fF', label: 'FF' },
      { key: 'fR', label: 'FR' },
      { key: 'tD', label: 'TD' }
    ],
    kicking: [
      { key: 'playerName', label: 'Player' },
      { key: 'games', label: 'G' },
      { key: 'fGM', label: 'FGM' },
      { key: 'fGA', label: 'FGA' },
      { key: 'fgPct', label: 'FG%' },
      { key: 'xPM', label: 'XPM' },
      { key: 'xPA', label: 'XPA' },
      { key: 'kickoffs', label: 'KO' },
      { key: 'touchbacks', label: 'TB' }
    ],
    punting: [
      { key: 'playerName', label: 'Player' },
      { key: 'games', label: 'G' },
      { key: 'punts', label: 'PUNTS' },
      { key: 'yards', label: 'YDS' },
      { key: 'avg', label: 'AVG' },
      { key: 'netYards', label: 'NET' },
      { key: 'in20', label: 'IN20' },
      { key: 'tB', label: 'TB' },
      { key: 'long', label: 'LNG' }
    ],
    kickReturn: [
      { key: 'playerName', label: 'Player' },
      { key: 'games', label: 'G' },
      { key: 'kR', label: 'RET' },
      { key: 'yards', label: 'YDS' },
      { key: 'avg', label: 'AVG' },
      { key: 'tD', label: 'TD' },
      { key: 'long', label: 'LNG' }
    ],
    puntReturn: [
      { key: 'playerName', label: 'Player' },
      { key: 'games', label: 'G' },
      { key: 'pR', label: 'RET' },
      { key: 'yards', label: 'YDS' },
      { key: 'avg', label: 'AVG' },
      { key: 'tD', label: 'TD' },
      { key: 'long', label: 'LNG' }
    ]
  }

  // Check if we have any player stats to show
  const hasPlayerStats = Object.values(playerStats).some(arr => arr.length > 0)

  return (
    <div className="space-y-4">
      {/* Header with Team Info and Dropdowns */}
      <div
        className="rounded-xl shadow-lg overflow-hidden"
        style={{ backgroundColor: teamColors.primary }}
      >
        {/* Mobile Layout */}
        <div className="sm:hidden p-4">
          {/* Row 1: Logo + Team Name */}
          <div className="flex items-center gap-3 mb-3">
            {teamLogo && (
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 shadow"
                style={{ backgroundColor: '#FFFFFF', padding: '4px' }}
              >
                <img src={teamLogo} alt={teamFullName} className="w-full h-full object-contain" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <Link
                to={`${pathPrefix}/team/${selectedTeam}/${selectedYear}`}
                className="text-lg font-bold truncate hover:underline block"
                style={{ color: primaryText }}
              >
                {teamFullName}
              </Link>
              <p className="text-xs" style={{ color: primaryText, opacity: 0.7 }}>
                {selectedYear} Season Stats
              </p>
            </div>
          </div>
          {/* Row 2: Dropdowns + Edit */}
          <div className="flex items-center gap-2">
            <select
              value={selectedTeam}
              onChange={(e) => handleTeamChange(e.target.value)}
              className="flex-1 px-2 py-1.5 rounded-lg text-sm font-medium cursor-pointer bg-white/20 border-0 focus:ring-2 focus:ring-white/50"
              style={{ color: primaryText }}
            >
              {availableTeams.map(team => (
                <option key={team} value={team} className="text-gray-900">
                  {getMascotName(team) || team}
                </option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => handleYearChange(e.target.value)}
              className="px-2 py-1.5 rounded-lg text-sm font-medium cursor-pointer bg-white/20 border-0 focus:ring-2 focus:ring-white/50"
              style={{ color: primaryText }}
            >
              {availableYears.map(year => (
                <option key={year} value={year} className="text-gray-900">{year}</option>
              ))}
            </select>
            {!isViewOnly && (
              <button
                onClick={() => setShowStatsModal(true)}
                className="p-1.5 rounded-lg hover:bg-white/20 transition-colors flex-shrink-0"
                style={{ color: primaryText }}
                title="Edit Stats"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Desktop Layout */}
        <div className="hidden sm:block p-5">
          <div className="flex items-center gap-4">
            {/* Team Logo */}
            {teamLogo && (
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg"
                style={{ backgroundColor: '#FFFFFF', padding: '6px' }}
              >
                <img src={teamLogo} alt={teamFullName} className="w-full h-full object-contain" />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <Link
                to={`${pathPrefix}/team/${selectedTeam}/${selectedYear}`}
                className="text-2xl font-bold truncate hover:underline block"
                style={{ color: primaryText }}
              >
                {teamFullName}
              </Link>
              <p className="text-sm mt-1" style={{ color: primaryText, opacity: 0.7 }}>
                {selectedYear} Season Stats
              </p>
            </div>

            {/* Edit Button and Dropdowns */}
            <div className="flex gap-2 items-center">
              {!isViewOnly && (
                <button
                  onClick={() => setShowStatsModal(true)}
                  className="p-2 rounded-lg hover:bg-white/20 transition-colors"
                  style={{ color: primaryText }}
                  title="Edit Stats"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              )}
              <select
                value={selectedTeam}
                onChange={(e) => handleTeamChange(e.target.value)}
                className="px-3 py-2 rounded-lg text-sm font-medium cursor-pointer bg-white/20 border-0 focus:ring-2 focus:ring-white/50"
                style={{ color: primaryText }}
              >
                {availableTeams.map(team => (
                  <option key={team} value={team} className="text-gray-900">
                    {getMascotName(team) || team}
                  </option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => handleYearChange(e.target.value)}
                className="px-3 py-2 rounded-lg text-sm font-medium cursor-pointer bg-white/20 border-0 focus:ring-2 focus:ring-white/50"
                style={{ color: primaryText }}
              >
                {availableYears.map(year => (
                  <option key={year} value={year} className="text-gray-900">{year}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Overall Record Banner */}
        <div
          className="px-5 py-4 flex items-center justify-center gap-8"
          style={{ backgroundColor: 'rgba(0,0,0,0.15)' }}
        >
          <div className="text-center">
            <div className="text-5xl font-black tracking-tight" style={{ color: primaryText }}>
              {stats.overall.record}
            </div>
            <div className="text-xs uppercase tracking-wider mt-1" style={{ color: primaryText, opacity: 0.6 }}>
              Overall Record
            </div>
          </div>
        </div>
      </div>

      {/* Records Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Record Breakdown */}
        <div
          className="rounded-xl shadow-lg p-5"
          style={{ backgroundColor: teamColors.primary }}
        >
          <h3 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: primaryText, opacity: 0.6 }}>
            Record Breakdown
          </h3>
          <div className="space-y-1">
            <RecordItem label="Conference" record={stats.conference.record} games={stats.conference.games} clickable />
            <RecordItem label="Home" record={stats.home.record} games={stats.home.games} clickable />
            <RecordItem label="Away" record={stats.away.record} games={stats.away.games} clickable />
            <RecordItem label="Neutral" record={stats.neutral.record} games={stats.neutral.games} clickable />
          </div>
        </div>

        {/* Situational Records */}
        <div
          className="rounded-xl shadow-lg p-5"
          style={{ backgroundColor: teamColors.primary }}
        >
          <h3 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: primaryText, opacity: 0.6 }}>
            Situational
          </h3>
          <div className="space-y-1">
            <RecordItem label="As Favorite" record={stats.favorite.record} games={stats.favorite.games} clickable />
            <RecordItem label="As Underdog" record={stats.underdog.record} games={stats.underdog.games} clickable />
            <RecordItem label="Postseason" record={stats.postseason.record} games={stats.postseason.games} clickable />
          </div>
        </div>
      </div>

      {/* Player Stats Sections */}
      {hasPlayerStats && (
        <div className="space-y-4">
          {/* Player Stats Header with Edit Buttons */}
          <div
            className="rounded-xl shadow-lg p-4"
            style={{ backgroundColor: teamColors.primary }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-lg font-bold" style={{ color: primaryText }}>
                Player Statistics
              </h3>
              {!isViewOnly && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowPlayerStatsModal(true)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium hover:opacity-90 transition-colors flex items-center gap-1.5 bg-white/20"
                    style={{ color: primaryText }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Games/Snaps
                  </button>
                  <button
                    onClick={() => setShowDetailedStatsModal(true)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium hover:opacity-90 transition-colors flex items-center gap-1.5 bg-white/20"
                    style={{ color: primaryText }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Detailed Stats
                  </button>
                </div>
              )}
            </div>
          </div>

          <PlayerStatsTable
            category="passing"
            title="Passing"
            columns={statColumns.passing}
            data={playerStats.passing}
          />
          <PlayerStatsTable
            category="rushing"
            title="Rushing"
            columns={statColumns.rushing}
            data={playerStats.rushing}
          />
          <PlayerStatsTable
            category="receiving"
            title="Receiving"
            columns={statColumns.receiving}
            data={playerStats.receiving}
          />
          <PlayerStatsTable
            category="blocking"
            title="Blocking"
            columns={statColumns.blocking}
            data={playerStats.blocking}
          />
          <PlayerStatsTable
            category="defense"
            title="Defense"
            columns={statColumns.defense}
            data={playerStats.defense}
          />
          <PlayerStatsTable
            category="kicking"
            title="Kicking"
            columns={statColumns.kicking}
            data={playerStats.kicking}
          />
          <PlayerStatsTable
            category="punting"
            title="Punting"
            columns={statColumns.punting}
            data={playerStats.punting}
          />
          <PlayerStatsTable
            category="kickReturn"
            title="Kick Returns"
            columns={statColumns.kickReturn}
            data={playerStats.kickReturn}
          />
          <PlayerStatsTable
            category="puntReturn"
            title="Punt Returns"
            columns={statColumns.puntReturn}
            data={playerStats.puntReturn}
          />
        </div>
      )}

      {/* Team Statistics */}
      {(teamStats.gamesWithStats > 0 || stats.games.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Offense */}
          <div
            className="rounded-xl shadow-lg p-5"
            style={{ backgroundColor: teamColors.primary }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: primaryText, opacity: 0.6 }}>
                Offense
              </h3>
              <span className="text-xs px-2 py-1 rounded-full bg-white/10" style={{ color: primaryText, opacity: 0.6 }}>
                {gamesPlayed} GP
              </span>
            </div>
            <div className="space-y-0">
              <StatRow
                label="Points"
                total={teamStats.pointsFor}
                perGame={(teamStats.pointsFor / gamesPlayed).toFixed(1)}
              />
              <StatRow
                label="Total Yards"
                total={teamStats.totalOffense}
                perGame={(teamStats.totalOffense / gamesPlayed).toFixed(1)}
              />
              <StatRow
                label="Yards/Play"
                total={teamStats.yardsPerPlay.toFixed(1)}
              />
              <StatRow
                label="Passing Yards"
                total={teamStats.passYards}
                perGame={(teamStats.passYards / gamesPlayed).toFixed(1)}
              />
              <StatRow
                label="Passing TDs"
                total={teamStats.passTds}
                perGame={(teamStats.passTds / gamesPlayed).toFixed(1)}
              />
              <StatRow
                label="Rushing Yards"
                total={teamStats.rushYards}
                perGame={(teamStats.rushYards / gamesPlayed).toFixed(1)}
              />
              <StatRow
                label="Rushing TDs"
                total={teamStats.rushTds}
                perGame={(teamStats.rushTds / gamesPlayed).toFixed(1)}
              />
              <StatRow
                label="First Downs"
                total={teamStats.firstDowns}
                perGame={(teamStats.firstDowns / gamesPlayed).toFixed(1)}
              />
            </div>
          </div>

          {/* Defense */}
          <div
            className="rounded-xl shadow-lg p-5"
            style={{ backgroundColor: teamColors.primary }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: primaryText, opacity: 0.6 }}>
                Defense
              </h3>
              {teamStats.hasManualOverrides && (
                <span className="text-xs px-2 py-1 rounded-full bg-white/10" style={{ color: primaryText, opacity: 0.6 }}>
                  Manual
                </span>
              )}
            </div>
            <div className="space-y-0">
              <StatRow
                label="Points Allowed"
                total={teamStats.pointsAgainst}
                perGame={(teamStats.pointsAgainst / gamesPlayed).toFixed(1)}
              />
              <StatRow
                label="Total Yards Allowed"
                total={teamStats.defTotalYards}
                perGame={(teamStats.defTotalYards / gamesPlayed).toFixed(1)}
              />
              <StatRow
                label="Pass Yards Allowed"
                total={teamStats.defPassYards}
                perGame={(teamStats.defPassYards / gamesPlayed).toFixed(1)}
              />
              <StatRow
                label="Rush Yards Allowed"
                total={teamStats.defRushYards}
                perGame={(teamStats.defRushYards / gamesPlayed).toFixed(1)}
              />
              <StatRow
                label="Sacks"
                total={teamStats.defSacks}
                perGame={(teamStats.defSacks / gamesPlayed).toFixed(1)}
              />
              <StatRow
                label="Forced Fumbles"
                total={teamStats.forcedFumbles}
                perGame={(teamStats.forcedFumbles / gamesPlayed).toFixed(1)}
              />
              <StatRow
                label="Interceptions"
                total={teamStats.defInterceptions}
                perGame={(teamStats.defInterceptions / gamesPlayed).toFixed(1)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Game Log Modal */}
      {modalData && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
          style={{ margin: 0 }}
          onClick={() => setModalData(null)}
        >
          <div
            className="rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col"
            style={{ backgroundColor: '#1f2937' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              className="px-5 py-4 flex items-center justify-between flex-shrink-0"
              style={{ backgroundColor: teamColors.primary }}
            >
              <div className="flex items-center gap-3">
                {teamLogo && (
                  <div className="w-10 h-10 rounded-full flex items-center justify-center bg-white p-1.5 shadow">
                    <img src={teamLogo} alt={teamFullName} className="w-full h-full object-contain" />
                  </div>
                )}
                <div>
                  <h3 className="text-lg font-bold" style={{ color: primaryText }}>
                    {modalData.title}
                  </h3>
                  <p className="text-xs" style={{ color: primaryText, opacity: 0.7 }}>
                    {modalData.games.length} {modalData.games.length === 1 ? 'Game' : 'Games'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModalData(null)}
                className="p-2 rounded-full hover:bg-white/20 transition-colors"
                style={{ color: primaryText }}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-3">
              <div className="space-y-2">
                {modalData.games.map((game, idx) => {
                  const oppMascot = getMascotName(game.opponent)
                  const oppLogo = oppMascot ? getTeamLogo(oppMascot) : null
                  const won = isWin(game)
                  const lost = isLoss(game)
                  const oppColors = getTeamColorsFromAbbr(game.opponent)
                  const oppPrimaryText = getContrastTextColor(oppColors.primary)

                  return (
                    <Link
                      key={game.id || idx}
                      to={`${pathPrefix}/game/${game.id}`}
                      className="flex items-center gap-3 p-3 rounded-lg hover:opacity-90 transition-opacity"
                      style={{ backgroundColor: oppColors.primary }}
                      onClick={() => setModalData(null)}
                    >
                      <div className="w-12 text-center">
                        <div className="text-xs font-medium" style={{ color: oppPrimaryText, opacity: 0.7 }}>
                          {getGameWeekLabel(game)}
                        </div>
                      </div>

                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0"
                        style={{
                          backgroundColor: won ? '#16a34a' : lost ? '#dc2626' : '#6b7280',
                          color: '#FFFFFF'
                        }}
                      >
                        {won ? 'W' : lost ? 'L' : '-'}
                      </div>

                      <div className="w-6 text-center text-xs font-medium" style={{ color: oppPrimaryText, opacity: 0.7 }}>
                        {game.location === 'Home' || game.location === 'home' ? 'vs' : '@'}
                      </div>

                      {oppLogo && (
                        <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 bg-white p-0.5">
                          <img src={oppLogo} alt="" className="w-full h-full object-contain" />
                        </div>
                      )}

                      <div className="flex-1 font-medium text-sm truncate" style={{ color: oppPrimaryText }}>
                        {oppMascot || game.opponent}
                      </div>

                      <div className="font-bold text-sm" style={{ color: oppPrimaryText }}>
                        {Math.max(game.teamScore, game.opponentScore)}-{Math.min(game.teamScore, game.opponentScore)}
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Team Stats Edit Modal */}
      <TeamStatsModal
        isOpen={showStatsModal}
        onClose={() => setShowStatsModal(false)}
        onSave={handleSaveStats}
        currentYear={selectedYear}
        teamName={teamFullName}
        teamColors={teamColors}
        aggregatedStats={teamStats}
      />

      {/* GP/Snaps Entry Modal */}
      <StatsEntryModal
        isOpen={showPlayerStatsModal}
        onClose={() => setShowPlayerStatsModal(false)}
        onSave={handleSavePlayerStats}
        currentYear={selectedYear}
        teamColors={teamColors}
        teamAbbr={selectedTeam}
        teamName={teamFullName}
      />

      {/* Detailed Stats Entry Modal (Passing, Rushing, etc.) */}
      <DetailedStatsEntryModal
        isOpen={showDetailedStatsModal}
        onClose={() => setShowDetailedStatsModal(false)}
        onSave={handleSaveDetailedStats}
        currentYear={selectedYear}
        teamColors={teamColors}
        teamAbbr={selectedTeam}
        teamName={teamFullName}
      />
    </div>
  )
}
