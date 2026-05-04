import { useState, useEffect, useMemo } from 'react'
import { useDynasty, getGamesByType, GAME_TYPES, detectGameType, getUserGamePerspective } from '../../context/DynastyContext'
import { buildCFPProjection } from '../../utils/cfpProjection'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useTeamColors } from '../../hooks/useTeamColors'
import { getContrastTextColor } from '../../utils/colorUtils'
import { getTeamLogo } from '../../data/teams'
import { teamAbbreviations } from '../../data/teamAbbreviations'
import { TEAMS, resolveTid, getCurrentTeamAbbr, getGameTeamInfo } from '../../data/teamRegistry'
import { getBowlLogo } from '../../data/bowlGames'
import { getCFPGameId, DEFAULT_BOWL_CONFIG, getBowlForSlot, getBowlForSeed } from '../../data/cfpConstants'
import { PageHero, TitleWithYear } from '../../components/ui'
import GameEntryModal from '../../components/GameEntryModal'

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
  'USM': 'Southern Mississippi Golden Eagles', 'RUTG': 'Rutgers Scarlet Knights', 'SHSU': 'Sam Houston State Bearkats',
  'TTU': 'Texas Tech Red Raiders', 'TULN': 'Tulane Green Wave', 'UH': 'Houston Cougars',
  'UL': 'Lafayette Ragin\' Cajuns', 'UT': 'Tennessee Volunteers',
  // FCS teams
  'FCSE': 'FCS East Judicials', 'FCSM': 'FCS Midwest Rebels',
  'FCSN': 'FCS Northwest Stallions', 'FCSW': 'FCS West Titans'
}

// Map abbreviations to short team names (without mascot)
const shortNameMap = {
  'AFA': 'Air Force', 'AKR': 'Akron', 'APP': 'App State', 'ARIZ': 'Arizona',
  'ARK': 'Arkansas', 'ARMY': 'Army', 'ARST': 'Arkansas State', 'ASU': 'Arizona State',
  'AUB': 'Auburn', 'BALL': 'Ball State', 'BAMA': 'Alabama', 'BC': 'Boston College',
  'BGSU': 'Bowling Green', 'BOIS': 'Boise State', 'BU': 'Baylor', 'BUFF': 'Buffalo',
  'BYU': 'BYU', 'CAL': 'Cal', 'CCU': 'Coastal Carolina', 'CHAR': 'Charlotte',
  'CLEM': 'Clemson', 'CMU': 'Central Michigan', 'COLO': 'Colorado', 'CONN': 'UConn',
  'CSU': 'Colorado State', 'DEL': 'Delaware', 'DUKE': 'Duke', 'ECU': 'East Carolina',
  'EMU': 'Eastern Michigan', 'FAU': 'FAU', 'FIU': 'FIU', 'FLA': 'Florida',
  'FRES': 'Fresno State', 'FSU': 'Florida State', 'GASO': 'Georgia Southern',
  'GSU': 'Georgia State', 'GT': 'Georgia Tech', 'HAW': 'Hawaii', 'ILL': 'Illinois',
  'IOWA': 'Iowa', 'ISU': 'Iowa State', 'IU': 'Indiana', 'JKST': 'Jacksonville State',
  'JMU': 'James Madison', 'KENN': 'Kennesaw State', 'KENT': 'Kent State',
  'KSU': 'Kansas State', 'KU': 'Kansas', 'LIB': 'Liberty', 'LOU': 'Louisville',
  'LSU': 'LSU', 'LT': 'Louisiana Tech', 'M-OH': 'Miami (OH)', 'MASS': 'UMass',
  'MEM': 'Memphis', 'MIA': 'Miami', 'MICH': 'Michigan', 'MINN': 'Minnesota',
  'MISS': 'Ole Miss', 'MIZ': 'Missouri', 'MRSH': 'Marshall', 'MSST': 'Mississippi State',
  'MSU': 'Michigan State', 'MTSU': 'Middle Tennessee', 'MZST': 'Missouri State',
  'NAVY': 'Navy', 'NCST': 'NC State', 'ND': 'Notre Dame', 'NEB': 'Nebraska',
  'NEV': 'Nevada', 'NIU': 'NIU', 'NMSU': 'New Mexico State', 'NU': 'Northwestern',
  'ODU': 'Old Dominion', 'OHIO': 'Ohio', 'OKST': 'Oklahoma State', 'ORE': 'Oregon',
  'ORST': 'Oregon State', 'OSU': 'Ohio State', 'OU': 'Oklahoma', 'PITT': 'Pitt',
  'PSU': 'Penn State', 'PUR': 'Purdue', 'RICE': 'Rice', 'RUTG': 'Rutgers',
  'SCAR': 'South Carolina', 'SDSU': 'San Diego State', 'SHSU': 'Sam Houston',
  'SJSU': 'San Jose State', 'SMU': 'SMU', 'STAN': 'Stanford', 'SYR': 'Syracuse',
  'TAMU': 'Texas A&M', 'TCU': 'TCU', 'TEM': 'Temple', 'TEX': 'Texas',
  'TLSA': 'Tulsa', 'TOL': 'Toledo', 'TROY': 'Troy', 'TTU': 'Texas Tech',
  'TULN': 'Tulane', 'TXST': 'Texas State', 'UAB': 'UAB', 'UC': 'Cincinnati',
  'UCF': 'UCF', 'UCLA': 'UCLA', 'UGA': 'Georgia', 'UH': 'Houston',
  'UK': 'Kentucky', 'UL': 'Louisiana', 'ULM': 'UL Monroe', 'UMD': 'Maryland',
  'UNC': 'North Carolina', 'UNLV': 'UNLV', 'UNM': 'New Mexico', 'UNT': 'North Texas',
  'USA': 'South Alabama', 'USC': 'USC', 'USF': 'South Florida', 'USM': 'Southern Miss',
  'USU': 'Utah State', 'UT': 'Tennessee', 'UTAH': 'Utah', 'UTEP': 'UTEP',
  'UTSA': 'UTSA', 'UVA': 'Virginia', 'VAN': 'Vanderbilt', 'VT': 'Virginia Tech',
  'WAKE': 'Wake Forest', 'WASH': 'Washington', 'WIS': 'Wisconsin', 'WKU': 'WKU',
  'WMU': 'Western Michigan', 'WSU': 'Washington State', 'WVU': 'West Virginia',
  'WYO': 'Wyoming'
}

const getShortName = (abbr) => {
  if (!abbr) return 'TBD'
  return shortNameMap[abbr] || abbr
}

export default function CFPBracket() {
  const { id, year: urlYear } = useParams()
  const navigate = useNavigate()
  const { currentDynasty, updateDynasty, addGame, isViewOnly } = useDynasty()
  const pathPrefix = usePathPrefix()
  const teamColors = useTeamColors(currentDynasty?.teamName, currentDynasty?.teams || currentDynasty?.customTeams)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingGameData, setEditingGameData] = useState(null)
  const [bracketScale, setBracketScale] = useState(0.7)

  // Scale bracket based on screen size
  useEffect(() => {
    const updateScale = () => {
      const width = window.innerWidth
      if (width < 400) {
        setBracketScale(0.35) // Very small mobile
      } else if (width < 640) {
        setBracketScale(0.42) // Mobile
      } else if (width < 1024) {
        setBracketScale(0.65)  // Tablet
      } else {
        setBracketScale(0.8)  // Desktop
      }
    }
    updateScale()
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  }, [])

  if (!currentDynasty) {
    return <div className="p-6">Loading...</div>
  }

  // Get available years that have CFP seeds data (most recent first)
  // Always include current year so user can view/enter current season's bracket
  const yearsWithData = Object.keys(currentDynasty.cfpSeedsByYear || {})
    .map(y => parseInt(y))

  // Add current year if not already in the list
  if (!yearsWithData.includes(currentDynasty.currentYear)) {
    yearsWithData.push(currentDynasty.currentYear)
  }

  // Sort descending (most recent first)
  const availableYears = yearsWithData.sort((a, b) => b - a)

  // Use URL year if provided, otherwise most recent available, otherwise current year
  const displayYear = urlYear ? parseInt(urlYear) : (availableYears.length > 0 ? availableYears[0] : currentDynasty.currentYear)

  // Navigate to year when dropdown changes
  const handleYearChange = (year) => {
    navigate(`${pathPrefix}/cfp-bracket/${year}`)
  }
  const cfpSeeds = currentDynasty.cfpSeedsByYear?.[displayYear] || []
  const bowlConfig = currentDynasty.cfpBowlConfigByYear?.[displayYear] || DEFAULT_BOWL_CONFIG
  const textColor = getContrastTextColor(teamColors.primary)

  // CFP projection — read-only snapshot of where the field would
  // land based on the current rankings + conference assignments. We
  // ONLY surface this panel when the actual bracket hasn't been
  // entered yet (cfpSeeds empty). Existing brackets are untouched —
  // this just fills the empty state with a useful preview.
  const projection = useMemo(
    () => buildCFPProjection(currentDynasty, displayYear),
    [currentDynasty, displayYear]
  )
  const showProjection = cfpSeeds.length === 0 && projection.available

  // Effective seed list — when the user hasn't entered the actual
  // bracket yet, fall through to the live projection so the bracket
  // slots fill in directly instead of sitting empty.
  const effectiveSeeds = showProjection ? (projection.seeds || []) : cfpSeeds

  // Get tid for a seed, then look up team info
  const getTidBySeed = (seed) => effectiveSeeds.find(s => s.seed === seed)?.tid || null
  const getTeamBySeed = (seed) => {
    const seedEntry = effectiveSeeds.find(s => s.seed === seed)
    if (!seedEntry) return null

    // New tid-based format
    if (seedEntry.tid) {
      const teamInfo = getGameTeamInfo(teams, seedEntry.tid)
      return teamInfo?.abbr || seedEntry.team || null
    }

    // Legacy format - just has team abbreviation
    return seedEntry.team || null
  }

  // Get bowl name for a bye seed from config (for QF games)
  const getQFBowlName = (byeSeed) => getBowlForSeed(byeSeed, bowlConfig)

  // Get bowl name for semifinals from config
  const getSFBowlName = (sfNum) => bowlConfig?.[`sf${sfNum}`] || DEFAULT_BOWL_CONFIG[`sf${sfNum}`]

  // UNIFIED: Get CFP results from games[] array with gameType filter
  const userTeamAbbr = getCurrentTeamAbbr(currentDynasty)
  const teams = currentDynasty?.teams || TEAMS

  // Helper to normalize a game from games[] to bracket display format
  const normalizeGame = (game) => {
    if (!game) return null

    // Get user perspective if this is a user game
    const perspective = getUserGamePerspective(game, currentDynasty)

    // Get team abbreviations - prefer tid-based lookup for unified format
    let team1, team2
    if (game.team1Tid) {
      const team1Info = getGameTeamInfo(teams, game.team1Tid)
      team1 = team1Info?.abbr || game.team1
    } else {
      team1 = game.team1 || game.userTeam
    }
    if (game.team2Tid) {
      const team2Info = getGameTeamInfo(teams, game.team2Tid)
      team2 = team2Info?.abbr || game.team2
    } else {
      team2 = game.team2 || game.opponent
    }

    let team1Score, team2Score, winner

    // Prefer unified format scores - ALWAYS compute winner from scores (most reliable)
    if (game.team1Score !== undefined && game.team1Score !== null) {
      team1Score = game.team1Score
      team2Score = game.team2Score
      // Always compute winner from scores - this is the source of truth
      winner = team1Score > team2Score ? team1 : team2Score > team1Score ? team2 : null
    } else if (perspective) {
      // Use perspective for user games with unified format
      const userTeamInfo = getGameTeamInfo(teams, perspective.userTid)
      const userAbbr = userTeamInfo?.abbr || game.userTeam
      if (userAbbr === team1) {
        team1Score = perspective.userScore
        team2Score = perspective.opponentScore
      } else {
        team1Score = perspective.opponentScore
        team2Score = perspective.userScore
      }
      // Compute winner from scores if available
      if (team1Score !== undefined && team2Score !== undefined) {
        winner = team1Score > team2Score ? team1 : team2Score > team1Score ? team2 : null
      } else {
        winner = perspective.userWon ? userAbbr : (team1 === userAbbr ? team2 : team1)
      }
    } else if (game.teamScore !== undefined) {
      // Legacy user game format
      const userWon = game.result === 'W' || game.result === 'win'
      if (game.userTeam === team1) {
        team1Score = parseInt(game.teamScore)
        team2Score = parseInt(game.opponentScore)
        winner = userWon ? team1 : team2
      } else {
        team1Score = parseInt(game.opponentScore)
        team2Score = parseInt(game.teamScore)
        winner = userWon ? team2 : team1
      }
    } else {
      // No scores available - fall back to winnerTid or winner field
      if (game.winnerTid) {
        const winnerInfo = getGameTeamInfo(teams, game.winnerTid)
        winner = winnerInfo?.abbr || game.winner
      } else {
        winner = game.winner
      }
    }

    // Calculate seeds if not stored - for user CFP First Round games
    let seed1 = game.cfpSeed1 || game.seed1
    let seed2 = game.cfpSeed2 || game.seed2

    // If seeds are missing, try to calculate them from CFP seeds data
    if (!seed1 || !seed2) {
      const gameYear = game.year || displayYear
      const yearCfpSeeds = currentDynasty.cfpSeedsByYear?.[gameYear] || []

      // For user games, find their seed by tid
      const userTidForSeeds = perspective?.userTid || game.team1Tid
      if (userTidForSeeds || game.isCFPFirstRound) {
        const userSeedEntry = yearCfpSeeds.find(s => s.tid === userTidForSeeds)
        if (userSeedEntry) {
          const userSeed = userSeedEntry.seed
          const oppSeed = 17 - userSeed // CFP First Round matchups: 5v12, 6v11, 7v10, 8v9
          seed1 = userSeed
          seed2 = oppSeed
        }
      }

      // For CPU games, look up both teams by tid
      if ((!seed1 || !seed2) && (game.team1Tid || game.team2Tid)) {
        const team1Entry = yearCfpSeeds.find(s => s.tid === game.team1Tid)
        const team2Entry = yearCfpSeeds.find(s => s.tid === game.team2Tid)
        if (team1Entry) seed1 = team1Entry.seed
        if (team2Entry) seed2 = team2Entry.seed
      }
    }

    // Compute winnerTid from scores (most reliable) or use stored value
    let winnerTid = game.winnerTid
    if (!winnerTid && team1Score !== null && team2Score !== null && team1Score !== team2Score) {
      winnerTid = team1Score > team2Score ? game.team1Tid : game.team2Tid
    }

    return {
      ...game,
      team1,
      team2,
      team1Tid: game.team1Tid,
      team2Tid: game.team2Tid,
      team1Score,
      team2Score,
      winner,
      winnerTid,
      seed1,
      seed2
    }
  }

  // Get CFP games from unified games[] array by game type
  const firstRoundResults = getGamesByType(currentDynasty, GAME_TYPES.CFP_FIRST_ROUND, displayYear).map(normalizeGame)
  const quarterfinalsResults = getGamesByType(currentDynasty, GAME_TYPES.CFP_QUARTERFINAL, displayYear).map(normalizeGame)
  const semifinalsResults = getGamesByType(currentDynasty, GAME_TYPES.CFP_SEMIFINAL, displayYear).map(normalizeGame)
  const championshipResults = getGamesByType(currentDynasty, GAME_TYPES.CFP_CHAMPIONSHIP, displayYear).map(normalizeGame)

  // Simple lookup helpers - just find games by their stored properties
  const getFirstRoundGame = (seed1, seed2) => {
    return firstRoundResults.find(g =>
      (g.seed1 === seed1 && g.seed2 === seed2) || (g.seed1 === seed2 && g.seed2 === seed1)
    ) || null
  }

  const getFirstRoundWinner = (seed1, seed2) => {
    const game = getFirstRoundGame(seed1, seed2)
    if (!game) return null

    // Get winner abbreviation - prefer computing from winnerTid for teambuilder support
    if (game.winnerTid) {
      const winnerInfo = getGameTeamInfo(teams, game.winnerTid)
      return winnerInfo?.abbr || game.winner || null
    }
    return game.winner || null
  }

  const getFirstRoundWinnerTid = (seed1, seed2) => {
    const game = getFirstRoundGame(seed1, seed2)
    return game?.winnerTid || null
  }

  const getWinnerSeed = (seed1, seed2) => {
    const game = getFirstRoundGame(seed1, seed2)
    if (!game) return null

    // Prefer tid-based comparison (works with teambuilder)
    if (game.winnerTid) {
      if (game.team1Tid === game.winnerTid) return game.seed1
      if (game.team2Tid === game.winnerTid) return game.seed2
    }

    // Fallback to abbr comparison for legacy data
    if (game.winner) {
      if (game.team1 === game.winner) return game.seed1
      if (game.team2 === game.winner) return game.seed2
    }

    return null
  }

  // Get QF game by slot ID
  // BULLETPROOF: Only use cfpSlot for lookup - bowl names are for DISPLAY only
  const getQFGameBySlot = (slotId) => {
    // PRIMARY: Find by cfpSlot - this is the ONLY reliable identifier
    const bySlot = quarterfinalsResults.find(g => g && g.cfpSlot === slotId)
    if (bySlot) {
      console.log(`[getQFGameBySlot] ${slotId}: Found by cfpSlot`, { id: bySlot.id, winner: bySlot.winner })
      return bySlot
    }

    // SECONDARY: Find by game ID pattern (e.g., cfpqf1-2029)
    const expectedGameId = getCFPGameId(slotId, displayYear)
    const byId = quarterfinalsResults.find(g => g && g.id === expectedGameId)
    if (byId) {
      console.log(`[getQFGameBySlot] ${slotId}: Found by game ID ${expectedGameId}`, { winner: byId.winner })
      return byId
    }

    // TERTIARY: Find by bye seed team (fallback for legacy data without cfpSlot)
    const slotToBySeed = { cfpqf1: 1, cfpqf2: 4, cfpqf3: 3, cfpqf4: 2 }
    const byeSeed = slotToBySeed[slotId]
    if (byeSeed) {
      const byeSeedEntry = cfpSeeds.find(s => s.seed === byeSeed)
      const byeSeedTid = byeSeedEntry?.tid
      const byeSeedTeam = byeSeedEntry?.team

      if (byeSeedTid || byeSeedTeam) {
        const byByeSeed = quarterfinalsResults.find(g => {
          if (!g) return false
          // Only match if bye seed team is in position (team1Tid = bye seed in QF)
          if (byeSeedTid && g.team1Tid === byeSeedTid) return true
          if (byeSeedTeam && g.team1 === byeSeedTeam) return true
          return false
        })
        if (byByeSeed) {
          console.log(`[getQFGameBySlot] ${slotId}: Found by bye seed ${byeSeed}`, { id: byByeSeed.id, winner: byByeSeed.winner })
          return byByeSeed
        }
      }
    }

    // NO bowl name fallback - bowl names are configurable and cause confusion
    console.log(`[getQFGameBySlot] ${slotId}: No game found!`)
    return null
  }

  const getQFWinnerBySlot = (slotId) => {
    const game = getQFGameBySlot(slotId)
    return game?.winner || null
  }

  // Get winner tid for seed lookup
  const getQFWinnerTidBySlot = (slotId) => {
    const game = getQFGameBySlot(slotId)
    return game?.winnerTid || null
  }

  // Get SF game by slot ID
  // BULLETPROOF: Only use cfpSlot for lookup - bowl names are for DISPLAY only
  const getSFGameBySlot = (slotId) => {
    // PRIMARY: Find by cfpSlot - this is the ONLY reliable identifier
    const bySlot = semifinalsResults.find(g => g && g.cfpSlot === slotId)
    if (bySlot) {
      console.log(`[getSFGameBySlot] ${slotId}: Found by cfpSlot`, { id: bySlot.id, winner: bySlot.winner })
      return bySlot
    }

    // SECONDARY: Find by game ID pattern (e.g., cfpsf1-2029)
    const expectedGameId = getCFPGameId(slotId, displayYear)
    const byId = semifinalsResults.find(g => g && g.id === expectedGameId)
    if (byId) {
      console.log(`[getSFGameBySlot] ${slotId}: Found by game ID ${expectedGameId}`, { winner: byId.winner })
      return byId
    }

    // TERTIARY: For legacy data, try to match by QF winner teams
    // SF1 gets winners from cfpqf1 (seed 1) and cfpqf2 (seed 4)
    // SF2 gets winners from cfpqf3 (seed 3) and cfpqf4 (seed 2)
    const qfSlots = slotId === 'cfpsf1' ? ['cfpqf1', 'cfpqf2'] : ['cfpqf3', 'cfpqf4']
    const qfWinner1Tid = getQFWinnerTidBySlot(qfSlots[0])
    const qfWinner2Tid = getQFWinnerTidBySlot(qfSlots[1])

    if (qfWinner1Tid || qfWinner2Tid) {
      const byTeams = semifinalsResults.find(g => {
        if (!g) return false
        // Check if SF has the expected QF winners
        const hasWinner1 = qfWinner1Tid && (g.team1Tid === qfWinner1Tid || g.team2Tid === qfWinner1Tid)
        const hasWinner2 = qfWinner2Tid && (g.team1Tid === qfWinner2Tid || g.team2Tid === qfWinner2Tid)
        return hasWinner1 || hasWinner2
      })
      if (byTeams) {
        console.log(`[getSFGameBySlot] ${slotId}: Found by QF winner teams`, { id: byTeams.id, winner: byTeams.winner })
        return byTeams
      }
    }

    // NO bowl name fallback - bowl names are configurable and cause confusion
    console.log(`[getSFGameBySlot] ${slotId}: No game found!`)
    return null
  }

  const getSFWinnerBySlot = (slotId) => {
    const game = getSFGameBySlot(slotId)
    return game?.winner || null
  }

  // Get winner tid for seed lookup
  const getSFWinnerTidBySlot = (slotId) => {
    const game = getSFGameBySlot(slotId)
    return game?.winnerTid || null
  }

  const getChampGame = () => {
    return championshipResults.find(g => g) || null
  }

  const getSeedByTid = (tid) => {
    if (!tid) return null
    const seedEntry = cfpSeeds.find(s => s && s.tid === tid)
    return seedEntry?.seed || null
  }

  // Get seed by team abbreviation (for legacy data without tid)
  const getSeedByTeam = (teamAbbr) => {
    if (!teamAbbr) return null
    const seedEntry = cfpSeeds.find(s => s && s.team === teamAbbr)
    return seedEntry?.seed || null
  }

  // Get seed from either tid or abbr
  const getSeedForWinner = (winnerTid, winnerAbbr) => {
    if (winnerTid) {
      const seed = getSeedByTid(winnerTid)
      if (seed) return seed
    }
    if (winnerAbbr) {
      return getSeedByTeam(winnerAbbr)
    }
    return null
  }

  // Sizing constants (scaled up for larger bracket)
  const SLOT_HEIGHT = 70
  const SLOT_GAP = 12
  const MATCHUP_HEIGHT = SLOT_HEIGHT * 2 + SLOT_GAP // 152px
  const SLOT_WIDTH = 300
  const CONNECTOR_GAP = 60 // Gap between columns for connector lines

  // Team slot component
  // TeamSlot now accepts isParentClickable to avoid nested anchors. Tid
  // input wins for registry lookup (logo/colors) — survives teambuilder
  // rename. Abbr is the display fallback.
  const TeamSlot = ({ team, teamTid, seed, score, isWinner, isParentClickable }) => {
    const dynastyTeams = currentDynasty?.teams || currentDynasty?.customTeams
    const customEntry = (teamTid != null && dynastyTeams?.[teamTid])
      || (dynastyTeams && team ? Object.values(dynastyTeams).find(t => t.abbr === team || t.name === team) : null)
    const resolvedAbbr = customEntry?.abbr || team
    const teamData = resolvedAbbr ? teamAbbreviations[resolvedAbbr] : null
    const bgColor = customEntry?.primaryColor || teamData?.backgroundColor || '#4B5563'
    const txtColor = customEntry?.secondaryColor || teamData?.textColor || '#D1D5DB'
    const mascotName = customEntry?.name || (resolvedAbbr ? mascotMap[resolvedAbbr] : null)
    const logo = customEntry?.logo || (mascotName ? getTeamLogo(mascotName, dynastyTeams) : null)
    const isLoser = score !== undefined && !isWinner

    // When parent is clickable (a Link), use span to avoid nested anchors
    // When parent is not clickable, use Link to allow team navigation.
    // Use the tid input directly when present so the link is stable across
    // teambuilder renames; fall back to abbr-resolution.
    const linkTid = teamTid != null ? Number(teamTid) : (resolvedAbbr ? resolveTid(resolvedAbbr, dynastyTeams || TEAMS) : null)
    const TeamName = () => {
      if (!resolvedAbbr) {
        return (
          <span className="text-xl font-semibold" style={{ color: txtColor }}>
            TBD
          </span>
        )
      }

      if (isParentClickable) {
        return (
          <span className="text-xl font-semibold" style={{ color: txtColor }}>
            {getShortName(resolvedAbbr)}
          </span>
        )
      }

      return (
        <Link
          to={`${pathPrefix}/team/${linkTid}/${displayYear}`}
          onClick={(e) => e.stopPropagation()}
          className="text-xl font-semibold hover:underline"
          style={{ color: txtColor }}
        >
          {getShortName(resolvedAbbr)}
        </Link>
      )
    }

    return (
      <div
        className="flex items-center gap-3 px-4 rounded border"
        style={{
          backgroundColor: bgColor,
          width: `${SLOT_WIDTH}px`,
          height: `${SLOT_HEIGHT}px`,
          borderColor: team ? 'transparent' : '#6B7280',
          opacity: isLoser ? 0.85 : 1,
          filter: isLoser ? 'grayscale(30%)' : 'none'
        }}
      >
        <span className="text-lg font-bold w-8 opacity-70" style={{ color: txtColor }}>
          {seed || ''}
        </span>
        {logo && (
          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center flex-shrink-0">
            <img src={logo} alt="" className="w-7 h-7 object-contain" />
          </div>
        )}
        <div className="flex-1 truncate">
          <TeamName />
        </div>
        {score !== undefined && (
          <span className="text-xl font-bold ml-auto" style={{ color: txtColor }}>
            {score}
          </span>
        )}
      </div>
    )
  }

  // Matchup component - two team slots stacked
  // Now uses Link to game page instead of onClick modal
  // slotId is the CFP slot ID (e.g., cfpfr1, cfpqf1, cfpsf1, cfpnc)
  const Matchup = ({ team1, team2, seed1, seed2, style, round, bowl, gameData, slotId }) => {
    // Map scores AND tids correctly. gameData stores team1/team2 in
    // entry order, which may not match the visual top/bottom slots
    // we render here — so we have to detect a swap and pivot every
    // gameData-derived field together (score + tid) so they stay
    // attached to the same physical team.
    let score1, score2, tid1, tid2
    if (gameData) {
      if (gameData.team1 === team1) {
        score1 = gameData.team1Score
        score2 = gameData.team2Score
        tid1 = gameData.team1Tid
        tid2 = gameData.team2Tid
      } else if (gameData.team2 === team1) {
        // Visual order is the opposite of storage order — swap tids
        // alongside scores so TeamSlot's tid-driven registry lookup
        // (logo, colors, abbr) lands on the right team.
        score1 = gameData.team2Score
        score2 = gameData.team1Score
        tid1 = gameData.team2Tid
        tid2 = gameData.team1Tid
      } else {
        // Couldn't match either side by abbr — fall back to default order.
        score1 = gameData.team1Score
        score2 = gameData.team2Score
        tid1 = gameData.team1Tid
        tid2 = gameData.team2Tid
      }
    }
    const winner = gameData?.winner
    const hasResult = !!winner

    // Generate game ID using the slot ID system
    // Each CFP game has a fixed slot ID: cfpfr1-4, cfpqf1-4, cfpsf1-2, cfpnc
    const gameId = slotId ? getCFPGameId(slotId, displayYear) : null

    // Game is clickable if:
    // 1. There's a result (game has been played), OR
    // 2. There's a game shell (created when seeds were entered), OR
    // 3. Both teams are known (we can at least view the matchup)
    const hasGameShell = gameData?.id
    const hasTeams = team1 && team2
    const isClickable = (hasResult || hasGameShell || hasTeams) && gameId

    // Pass tid through when available so TeamSlot can resolve registry
    // data without depending on the (possibly stale) abbr string.
    const matchupContent = (
      <>
        <TeamSlot team={team1} teamTid={tid1} seed={seed1} score={score1} isWinner={winner === team1} isParentClickable={isClickable} />
        <TeamSlot team={team2} teamTid={tid2} seed={seed2} score={score2} isWinner={winner === team2} isParentClickable={isClickable} />
      </>
    )

    // If clickable, render as Link to game page
    if (isClickable) {
      return (
        <Link
          to={`${pathPrefix}/game/${gameId}`}
          className="absolute flex flex-col cursor-pointer hover:opacity-90 transition-opacity"
          style={{ gap: `${SLOT_GAP}px`, ...style }}
        >
          {matchupContent}
        </Link>
      )
    }

    // Not clickable yet (TBD matchups)
    return (
      <div
        className="absolute flex flex-col"
        style={{ gap: `${SLOT_GAP}px`, ...style }}
      >
        {matchupContent}
      </div>
    )
  }

  // Horizontal line
  const HLine = ({ top, left, width }) => (
    <div
      className="absolute"
      style={{
        top: `${top}px`,
        left: `${left}px`,
        width: `${width}px`,
        height: '2px',
        backgroundColor: 'var(--surface-4)'
      }}
    />
  )

  // Vertical line
  const VLine = ({ top, left, height }) => (
    <div
      className="absolute"
      style={{
        top: `${top}px`,
        left: `${left}px`,
        width: '2px',
        height: `${height}px`,
        backgroundColor: 'var(--surface-4)'
      }}
    />
  )

  // Get all seeds (will be null/TBD if not entered yet)
  const s1 = getTeamBySeed(1), s2 = getTeamBySeed(2), s3 = getTeamBySeed(3), s4 = getTeamBySeed(4)
  const s5 = getTeamBySeed(5), s6 = getTeamBySeed(6), s7 = getTeamBySeed(7), s8 = getTeamBySeed(8)
  const s9 = getTeamBySeed(9), s10 = getTeamBySeed(10), s11 = getTeamBySeed(11), s12 = getTeamBySeed(12)

  // Column positions (left edge of each column)
  const COL1 = 0 // First Round matchups
  const COL2 = SLOT_WIDTH + CONNECTOR_GAP // Quarterfinals
  const COL3 = COL2 + SLOT_WIDTH + CONNECTOR_GAP // Semifinals
  const COL4 = COL3 + SLOT_WIDTH + CONNECTOR_GAP // Championship

  // Vertical positions - work backwards from championship
  // We want even spacing that creates a clean bracket look

  // First Round spacing
  const R1_GAP = 36 // Gap between First Round matchups
  const R1_START = 50 // Top of first matchup

  // First Round matchup positions (4 matchups)
  const R1_M1 = R1_START
  const R1_M2 = R1_M1 + MATCHUP_HEIGHT + R1_GAP
  const R1_M3 = R1_M2 + MATCHUP_HEIGHT + R1_GAP
  const R1_M4 = R1_M3 + MATCHUP_HEIGHT + R1_GAP

  // First Round centers (output lines come from center of each matchup)
  const R1_M1_CENTER = R1_M1 + MATCHUP_HEIGHT / 2
  const R1_M2_CENTER = R1_M2 + MATCHUP_HEIGHT / 2
  const R1_M3_CENTER = R1_M3 + MATCHUP_HEIGHT / 2
  const R1_M4_CENTER = R1_M4 + MATCHUP_HEIGHT / 2

  // Quarterfinals - position each QF so its top slot center aligns with corresponding FR output
  // QF top slot center = QF_TOP + SLOT_HEIGHT/2
  // We want QF top slot center = R1 center, so QF_TOP = R1_CENTER - SLOT_HEIGHT/2
  const QF_M1 = R1_M1_CENTER - SLOT_HEIGHT / 2
  const QF_M2 = R1_M2_CENTER - SLOT_HEIGHT / 2
  const QF_M3 = R1_M3_CENTER - SLOT_HEIGHT / 2
  const QF_M4 = R1_M4_CENTER - SLOT_HEIGHT / 2

  // QF centers
  const QF_M1_CENTER = QF_M1 + MATCHUP_HEIGHT / 2
  const QF_M2_CENTER = QF_M2 + MATCHUP_HEIGHT / 2
  const QF_M3_CENTER = QF_M3 + MATCHUP_HEIGHT / 2
  const QF_M4_CENTER = QF_M4 + MATCHUP_HEIGHT / 2

  // Semifinals - centered between their two feeding QF matchups
  const SF_M1 = (QF_M1_CENTER + QF_M2_CENTER) / 2 - MATCHUP_HEIGHT / 2
  const SF_M2 = (QF_M3_CENTER + QF_M4_CENTER) / 2 - MATCHUP_HEIGHT / 2

  // SF centers
  const SF_M1_CENTER = SF_M1 + MATCHUP_HEIGHT / 2
  const SF_M2_CENTER = SF_M2 + MATCHUP_HEIGHT / 2

  // Championship - centered between the two semifinals
  const CHAMP = (SF_M1_CENTER + SF_M2_CENTER) / 2 - MATCHUP_HEIGHT / 2
  const CHAMP_CENTER = CHAMP + MATCHUP_HEIGHT / 2

  // Connector X positions
  const CONN_X1 = SLOT_WIDTH // End of First Round slots, start of connectors
  const CONN_X2 = COL2 + SLOT_WIDTH // End of QF slots
  const CONN_X3 = COL3 + SLOT_WIDTH // End of SF slots

  // Vertical connector X positions (midway in the gap)
  const VCONN_X2 = CONN_X2 + CONNECTOR_GAP / 2 // Between QF and SF
  const VCONN_X3 = CONN_X3 + CONNECTOR_GAP / 2 // Between SF and CHAMP

  const BRACKET_HEIGHT = R1_M4 + MATCHUP_HEIGHT + 160
  const BRACKET_WIDTH = COL4 + SLOT_WIDTH + 40

  // handleMatchupClick removed - now using Links to game pages instead

  // Handle edit game click - opens GameEntryModal (kept for editing from game pages)
  const handleEditGame = (game) => {
    const isUserGame = !game.viewingTeam // If no viewingTeam, it's a user game

    if (isUserGame) {
      // User's game - pass the FULL game so all fields can be edited (notes, quarters, etc.)
      // The game object passed here already contains all the data from the games array
      setEditingGameData({
        opponent: game.opponent,
        bowlName: game.bowlName || game.gameTitle,
        existingGame: game, // Pass the full game for editing
        round: game.round,
        isUserGame: true
      })
    } else {
      // CPU vs CPU game - FETCH FRESH DATA from cfpResultsByYear
      // This ensures we always edit the latest saved data, not stale references
      const round = game.round
      const roundKey = (round === 'First Round') ? 'firstRound'
        : (round === 'Quarterfinal' || round === 'Quarterfinals') ? 'quarterfinals'
        : (round === 'Semifinal' || round === 'Semifinals') ? 'semifinals'
        : 'championship'

      const cfpData = currentDynasty.cfpResultsByYear?.[displayYear] || {}
      const roundData = cfpData[roundKey] || []

      // Find the fresh game data by seeds (First Round) or bowlName (other rounds)
      let freshGame = null
      const origRef = game.originalGameData

      if (origRef?.seed1 !== undefined) {
        // First Round - find by seeds
        freshGame = roundData.find(g =>
          g.seed1 === origRef.seed1 && g.seed2 === origRef.seed2
        )
      } else if (game.bowlName) {
        // Other rounds - find by bowlName
        freshGame = roundData.find(g => g.bowlName === game.bowlName)
      }

      // Use fresh data if found, otherwise fall back to original reference
      const gameToEdit = freshGame || origRef

      if (gameToEdit) {
        setEditingGameData({
          team1: gameToEdit.team1,
          team2: gameToEdit.team2,
          bowlName: game.bowlName || game.gameTitle,
          round: game.round,
          isUserGame: false,
          existingTeam1Score: gameToEdit.team1Score,
          existingTeam2Score: gameToEdit.team2Score,
          existingGameNote: gameToEdit.gameNote || '',
          existingLinks: gameToEdit.links || '',
          originalGameData: gameToEdit
        })
      } else {
        // Fallback if no data found (shouldn't happen)
        setEditingGameData({
          team1: game.viewingTeamAbbr,
          team2: game.opponent,
          bowlName: game.bowlName || game.gameTitle,
          round: game.round,
          isUserGame: false,
          existingTeam1Score: game.teamScore,
          existingTeam2Score: game.opponentScore,
          existingGameNote: game.gameNote || '',
          existingLinks: game.links || '',
          originalGameData: null
        })
      }
    }

    setShowEditModal(true)
  }

  // Handle game save from GameEntryModal
  const handleGameSave = async (gameData) => {
    try {
      // Map round names to gameType
      const round = editingGameData.round
      const gameType = (round === 'First Round') ? GAME_TYPES.CFP_FIRST_ROUND
        : (round === 'Quarterfinal' || round === 'Quarterfinals') ? GAME_TYPES.CFP_QUARTERFINAL
        : (round === 'Semifinal' || round === 'Semifinals') ? GAME_TYPES.CFP_SEMIFINAL
        : GAME_TYPES.CFP_CHAMPIONSHIP

      // Get legacy flag for backwards compatibility
      const cfpFlag = (round === 'First Round') ? 'isCFPFirstRound'
        : (round === 'Quarterfinal' || round === 'Quarterfinals') ? 'isCFPQuarterfinal'
        : (round === 'Semifinal' || round === 'Semifinals') ? 'isCFPSemifinal'
        : 'isCFPChampionship'

      const team1Score = parseInt(gameData.team1Score)
      const team2Score = parseInt(gameData.team2Score)
      const winner = team1Score > team2Score ? gameData.team1 : gameData.team2

      // Find existing game in games[] array
      const existingGames = currentDynasty.games || []
      const originalGame = editingGameData.originalGameData
      const gameIndex = existingGames.findIndex(g => {
        if (detectGameType(g) !== gameType) return false
        if (Number(g.year) !== Number(displayYear)) return false
        // Match by seeds for First Round
        if (originalGame?.seed1 !== undefined && g.cfpSeed1 !== undefined) {
          return g.cfpSeed1 === originalGame.seed1 && g.cfpSeed2 === originalGame.seed2
        }
        // Match by bowlName for other rounds
        if (originalGame?.bowlName && g.bowlName) {
          return g.bowlName === originalGame.bowlName
        }
        // Fallback: exact team match
        const gTeam1 = g.team1 || g.userTeam
        const gTeam2 = g.team2 || g.opponent
        return (gTeam1 === gameData.team1 && gTeam2 === gameData.team2) ||
               (gTeam1 === gameData.team2 && gTeam2 === gameData.team1)
      })

      // Build the updated game
      // Note: CPU games are identified by having team1/team2 but no userTeam - no isCPUGame flag needed
      const updatedGame = {
        ...(gameIndex >= 0 ? existingGames[gameIndex] : {}),
        ...(originalGame || {}),
        id: gameIndex >= 0 ? existingGames[gameIndex].id : `cfp-${displayYear}-${gameType}-${Date.now()}`,
        year: displayYear,
        gameType,
        team1: gameData.team1,
        team2: gameData.team2,
        team1Score,
        team2Score,
        winner,
        bowlName: editingGameData.bowlName,
        cfpSeed1: originalGame?.seed1 || editingGameData.seed1,
        cfpSeed2: originalGame?.seed2 || editingGameData.seed2,
        gameNote: gameData.gameNote || '',
        links: gameData.links || '',
        [cfpFlag]: true, // Legacy flag
        // Preserve userTeam if set (for user's CFP games)
        ...(gameData.userTeam && { userTeam: gameData.userTeam })
      }

      // Update games array
      const newGames = [...existingGames]
      if (gameIndex >= 0) {
        newGames[gameIndex] = updatedGame
      } else {
        newGames.push(updatedGame)
      }

      // Also update legacy cfpResultsByYear for backwards compatibility
      const roundKey = (round === 'First Round') ? 'firstRound'
        : (round === 'Quarterfinal' || round === 'Quarterfinals') ? 'quarterfinals'
        : (round === 'Semifinal' || round === 'Semifinals') ? 'semifinals'
        : 'championship'

      const existingCFP = currentDynasty.cfpResultsByYear || {}
      const existingYear = existingCFP[displayYear] || {}
      const existingRound = existingYear[roundKey] || []

      const legacyGame = {
        team1: gameData.team1,
        team2: gameData.team2,
        team1Score,
        team2Score,
        winner,
        bowlName: editingGameData.bowlName,
        seed1: originalGame?.seed1 || editingGameData.seed1,
        seed2: originalGame?.seed2 || editingGameData.seed2,
        gameNote: gameData.gameNote || '',
        links: gameData.links || ''
      }

      const legacyIndex = existingRound.findIndex(g => {
        if (originalGame?.seed1 !== undefined && g.seed1 !== undefined) {
          return g.seed1 === originalGame.seed1 && g.seed2 === originalGame.seed2
        }
        if (originalGame?.bowlName && g.bowlName) {
          return g.bowlName === originalGame.bowlName
        }
        return g.team1 === gameData.team1 && g.team2 === gameData.team2
      })

      const newRound = [...existingRound]
      if (legacyIndex >= 0) {
        newRound[legacyIndex] = legacyGame
      } else {
        newRound.push(legacyGame)
      }

      await updateDynasty(currentDynasty.id, {
        games: newGames,
        cfpResultsByYear: {
          ...existingCFP,
          [displayYear]: {
            ...existingYear,
            [roundKey]: newRound
          }
        }
      })

      setShowEditModal(false)
      setEditingGameData(null)
    } catch (error) {
      console.error('Error saving game:', error)
    }
  }

  const titleNode = (
    <TitleWithYear
      year={displayYear}
      years={availableYears}
      onChange={handleYearChange}
      label={showProjection ? 'Projection' : 'Bracket'}
    />
  )

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <img src="https://i.imgur.com/ZKD9dQJ.png" alt="" className="h-4 opacity-80" />
            College Football Playoff
          </span>
        }
        title={titleNode}
      />

      {/* When the actual bracket for this year hasn't been entered,
          the projection seeds fall straight into the bracket slots
          (see effectiveSeeds above). A small inline note tells users
          this is a snapshot, not a finalized bracket. */}
      {showProjection && (
        <div
          className="rounded-lg px-4 py-2.5 text-[11px] leading-snug text-txt-tertiary flex flex-wrap items-center gap-x-3 gap-y-1"
          style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--surface-4)' }}
        >
          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-black tracking-[0.22em] flex-shrink-0"
            style={{
              backgroundColor: 'rgba(59, 130, 246, 0.18)',
              color: '#93c5fd',
              border: '1px solid rgba(59, 130, 246, 0.35)',
            }}
          >
            PROJECTION
          </span>
          <span>
            Snapshot of where the field would land if the season ended today
            {projection.week ? ` (through ${typeof projection.week === 'number' ? `Week ${projection.week}` : projection.week})` : ''}.
            Updates as weekly scores come in.
          </span>
          {projection.notes && <span className="text-amber-400">{projection.notes}</span>}
        </div>
      )}

      {/* Mobile scroll hint */}
      <div className="sm:hidden text-center label-xs text-txt-tertiary">
        Scroll right to view full bracket
      </div>

      {/* Bracket Container - scrollable on mobile, centered on larger screens */}
      <div
        className="overflow-x-auto overflow-y-visible pb-4"
        style={{
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'thin'
        }}
      >
        {/* Wrapper reserves correct visual space for scaled content */}
        {/* On mobile: no centering, start from left edge with padding */}
        {/* On sm+: center the bracket */}
        <div
          className="sm:mx-auto"
          style={{
            width: `${BRACKET_WIDTH * bracketScale + 32}px`,
            minWidth: `${BRACKET_WIDTH * bracketScale + 32}px`,
            height: `${(BRACKET_HEIGHT + 250) * bracketScale}px`,
            paddingLeft: '16px',
            paddingRight: '16px'
          }}
        >
          {/* Scaled bracket content */}
          <div
            style={{
              width: `${BRACKET_WIDTH}px`,
              transform: `scale(${bracketScale})`,
              transformOrigin: 'top left'
            }}
          >
          {/* Round Labels */}
          <div className="flex mb-6 label-xs text-txt-tertiary" style={{ fontSize: '16px', letterSpacing: '0.22em', fontWeight: 600 }}>
            <div style={{ width: `${SLOT_WIDTH}px`, marginLeft: `${COL1}px` }} className="text-center pb-2 border-b border-surface-4">FIRST ROUND</div>
            <div style={{ width: `${SLOT_WIDTH}px`, marginLeft: `${CONNECTOR_GAP}px` }} className="text-center pb-2 border-b border-surface-4">QUARTERFINALS</div>
            <div style={{ width: `${SLOT_WIDTH}px`, marginLeft: `${CONNECTOR_GAP}px` }} className="text-center pb-2 border-b border-surface-4">SEMIFINALS</div>
            <div style={{ width: `${SLOT_WIDTH}px`, marginLeft: `${CONNECTOR_GAP}px` }} className="text-center pb-2 border-b border-surface-4">CHAMPIONSHIP</div>
          </div>

          {/* Bracket Area */}
          <div className="relative" style={{ height: `${BRACKET_HEIGHT}px`, width: `${BRACKET_WIDTH}px` }}>

            {/* ===== FIRST ROUND ===== */}
            <Matchup team1={s12} team2={s5} seed1={12} seed2={5} style={{ top: R1_M1, left: COL1 }} round="First Round" gameData={getFirstRoundGame(5, 12)} slotId="cfpfr1" />
            <Matchup team1={s9} team2={s8} seed1={9} seed2={8} style={{ top: R1_M2, left: COL1 }} round="First Round" gameData={getFirstRoundGame(8, 9)} slotId="cfpfr2" />
            <Matchup team1={s11} team2={s6} seed1={11} seed2={6} style={{ top: R1_M3, left: COL1 }} round="First Round" gameData={getFirstRoundGame(6, 11)} slotId="cfpfr3" />
            <Matchup team1={s10} team2={s7} seed1={10} seed2={7} style={{ top: R1_M4, left: COL1 }} round="First Round" gameData={getFirstRoundGame(7, 10)} slotId="cfpfr4" />

            {/* First Round → QF connectors (bracket from 2 teams to 1 output) */}
            {/* R1_M1: 12 vs 5 → QF top slot */}
            <HLine top={R1_M1 + SLOT_HEIGHT / 2} left={CONN_X1} width={CONNECTOR_GAP / 2} />
            <HLine top={R1_M1 + SLOT_HEIGHT + SLOT_GAP + SLOT_HEIGHT / 2} left={CONN_X1} width={CONNECTOR_GAP / 2} />
            <VLine top={R1_M1 + SLOT_HEIGHT / 2} left={CONN_X1 + CONNECTOR_GAP / 2} height={SLOT_HEIGHT + SLOT_GAP} />
            <HLine top={R1_M1_CENTER} left={CONN_X1 + CONNECTOR_GAP / 2} width={CONNECTOR_GAP / 2} />

            {/* R1_M2: 9 vs 8 → QF top slot */}
            <HLine top={R1_M2 + SLOT_HEIGHT / 2} left={CONN_X1} width={CONNECTOR_GAP / 2} />
            <HLine top={R1_M2 + SLOT_HEIGHT + SLOT_GAP + SLOT_HEIGHT / 2} left={CONN_X1} width={CONNECTOR_GAP / 2} />
            <VLine top={R1_M2 + SLOT_HEIGHT / 2} left={CONN_X1 + CONNECTOR_GAP / 2} height={SLOT_HEIGHT + SLOT_GAP} />
            <HLine top={R1_M2_CENTER} left={CONN_X1 + CONNECTOR_GAP / 2} width={CONNECTOR_GAP / 2} />

            {/* R1_M3: 11 vs 6 → QF top slot */}
            <HLine top={R1_M3 + SLOT_HEIGHT / 2} left={CONN_X1} width={CONNECTOR_GAP / 2} />
            <HLine top={R1_M3 + SLOT_HEIGHT + SLOT_GAP + SLOT_HEIGHT / 2} left={CONN_X1} width={CONNECTOR_GAP / 2} />
            <VLine top={R1_M3 + SLOT_HEIGHT / 2} left={CONN_X1 + CONNECTOR_GAP / 2} height={SLOT_HEIGHT + SLOT_GAP} />
            <HLine top={R1_M3_CENTER} left={CONN_X1 + CONNECTOR_GAP / 2} width={CONNECTOR_GAP / 2} />

            {/* R1_M4: 10 vs 7 → QF top slot */}
            <HLine top={R1_M4 + SLOT_HEIGHT / 2} left={CONN_X1} width={CONNECTOR_GAP / 2} />
            <HLine top={R1_M4 + SLOT_HEIGHT + SLOT_GAP + SLOT_HEIGHT / 2} left={CONN_X1} width={CONNECTOR_GAP / 2} />
            <VLine top={R1_M4 + SLOT_HEIGHT / 2} left={CONN_X1 + CONNECTOR_GAP / 2} height={SLOT_HEIGHT + SLOT_GAP} />
            <HLine top={R1_M4_CENTER} left={CONN_X1 + CONNECTOR_GAP / 2} width={CONNECTOR_GAP / 2} />

            {/* ===== QUARTERFINALS ===== */}
            {/* Position 1: #4 seed vs 5/12 winner */}
            <Matchup team1={getFirstRoundWinner(5, 12)} team2={s4} seed1={getWinnerSeed(5, 12)} seed2={4} style={{ top: QF_M1, left: COL2 }} round="Quarterfinal" bowl={getQFBowlName(4)} gameData={getQFGameBySlot('cfpqf2')} slotId="cfpqf2" />
            {/* Position 2: #1 seed vs 8/9 winner */}
            <Matchup team1={getFirstRoundWinner(8, 9)} team2={s1} seed1={getWinnerSeed(8, 9)} seed2={1} style={{ top: QF_M2, left: COL2 }} round="Quarterfinal" bowl={getQFBowlName(1)} gameData={getQFGameBySlot('cfpqf1')} slotId="cfpqf1" />
            {/* Position 3: #3 seed vs 6/11 winner */}
            <Matchup team1={getFirstRoundWinner(6, 11)} team2={s3} seed1={getWinnerSeed(6, 11)} seed2={3} style={{ top: QF_M3, left: COL2 }} round="Quarterfinal" bowl={getQFBowlName(3)} gameData={getQFGameBySlot('cfpqf3')} slotId="cfpqf3" />
            {/* Position 4: #2 seed vs 7/10 winner */}
            <Matchup team1={getFirstRoundWinner(7, 10)} team2={s2} seed1={getWinnerSeed(7, 10)} seed2={2} style={{ top: QF_M4, left: COL2 }} round="Quarterfinal" bowl={getQFBowlName(2)} gameData={getQFGameBySlot('cfpqf4')} slotId="cfpqf4" />

            {/* QF Bowl Logos - positioned on right side, centered between both team slots */}
            <img
              src={getBowlLogo(getQFBowlName(4))}
              alt={getQFBowlName(4)}
              className="absolute w-14 h-14 object-contain z-10"
              style={{ top: QF_M1 + MATCHUP_HEIGHT / 2 - 28, left: COL2 + SLOT_WIDTH - 10 }}
            />
            <img
              src={getBowlLogo(getQFBowlName(1))}
              alt={getQFBowlName(1)}
              className="absolute w-14 h-14 object-contain z-10"
              style={{ top: QF_M2 + MATCHUP_HEIGHT / 2 - 28, left: COL2 + SLOT_WIDTH - 10 }}
            />
            <img
              src={getBowlLogo(getQFBowlName(3))}
              alt={getQFBowlName(3)}
              className="absolute w-14 h-14 object-contain z-10"
              style={{ top: QF_M3 + MATCHUP_HEIGHT / 2 - 28, left: COL2 + SLOT_WIDTH - 10 }}
            />
            <img
              src={getBowlLogo(getQFBowlName(2))}
              alt={getQFBowlName(2)}
              className="absolute w-14 h-14 object-contain z-10"
              style={{ top: QF_M4 + MATCHUP_HEIGHT / 2 - 28, left: COL2 + SLOT_WIDTH - 10 }}
            />

            {/* QF → SF connectors */}
            {/* QF1 + QF2 feed into SF1 */}
            <HLine top={QF_M1_CENTER} left={CONN_X2} width={VCONN_X2 - CONN_X2} />
            <HLine top={QF_M2_CENTER} left={CONN_X2} width={VCONN_X2 - CONN_X2} />
            <VLine top={QF_M1_CENTER} left={VCONN_X2} height={QF_M2_CENTER - QF_M1_CENTER} />
            <HLine top={SF_M1_CENTER} left={VCONN_X2} width={COL3 - VCONN_X2} />

            {/* QF3 + QF4 feed into SF2 */}
            <HLine top={QF_M3_CENTER} left={CONN_X2} width={VCONN_X2 - CONN_X2} />
            <HLine top={QF_M4_CENTER} left={CONN_X2} width={VCONN_X2 - CONN_X2} />
            <VLine top={QF_M3_CENTER} left={VCONN_X2} height={QF_M4_CENTER - QF_M3_CENTER} />
            <HLine top={SF_M2_CENTER} left={VCONN_X2} width={COL3 - VCONN_X2} />

            {/* ===== SEMIFINALS ===== */}
            {/* SF1: 4/1 bracket winners (cfpqf2 winner vs cfpqf1 winner) */}
            <Matchup
              team1={getQFWinnerBySlot('cfpqf2')}
              team2={getQFWinnerBySlot('cfpqf1')}
              seed1={getSeedForWinner(getQFWinnerTidBySlot('cfpqf2'), getQFWinnerBySlot('cfpqf2'))}
              seed2={getSeedForWinner(getQFWinnerTidBySlot('cfpqf1'), getQFWinnerBySlot('cfpqf1'))}
              style={{ top: SF_M1, left: COL3 }}
              round="Semifinal"
              bowl={getSFBowlName(1)}
              gameData={getSFGameBySlot('cfpsf1')}
              slotId="cfpsf1"
            />
            {/* SF2: 3/2 bracket winners (cfpqf3 winner vs cfpqf4 winner) */}
            <Matchup
              team1={getQFWinnerBySlot('cfpqf3')}
              team2={getQFWinnerBySlot('cfpqf4')}
              seed1={getSeedForWinner(getQFWinnerTidBySlot('cfpqf3'), getQFWinnerBySlot('cfpqf3'))}
              seed2={getSeedForWinner(getQFWinnerTidBySlot('cfpqf4'), getQFWinnerBySlot('cfpqf4'))}
              style={{ top: SF_M2, left: COL3 }}
              round="Semifinal"
              bowl={getSFBowlName(2)}
              gameData={getSFGameBySlot('cfpsf2')}
              slotId="cfpsf2"
            />

            {/* SF Bowl Logos */}
            <img
              src={getBowlLogo(getSFBowlName(1))}
              alt={getSFBowlName(1)}
              className="absolute w-14 h-14 object-contain z-10"
              style={{ top: SF_M1 + MATCHUP_HEIGHT / 2 - 28, left: COL3 + SLOT_WIDTH - 10 }}
            />
            <img
              src={getBowlLogo(getSFBowlName(2))}
              alt={getSFBowlName(2)}
              className="absolute w-14 h-14 object-contain z-10"
              style={{ top: SF_M2 + MATCHUP_HEIGHT / 2 - 28, left: COL3 + SLOT_WIDTH - 10 }}
            />

            {/* SF → Championship connectors */}
            <HLine top={SF_M1_CENTER} left={CONN_X3} width={VCONN_X3 - CONN_X3} />
            <HLine top={SF_M2_CENTER} left={CONN_X3} width={VCONN_X3 - CONN_X3} />
            <VLine top={SF_M1_CENTER} left={VCONN_X3} height={SF_M2_CENTER - SF_M1_CENTER} />
            <HLine top={CHAMP_CENTER} left={VCONN_X3} width={COL4 - VCONN_X3} />

            {/* ===== CHAMPIONSHIP ===== */}
            <Matchup
              team1={getSFWinnerBySlot('cfpsf1')}
              team2={getSFWinnerBySlot('cfpsf2')}
              seed1={getSeedForWinner(getSFWinnerTidBySlot('cfpsf1'), getSFWinnerBySlot('cfpsf1'))}
              seed2={getSeedForWinner(getSFWinnerTidBySlot('cfpsf2'), getSFWinnerBySlot('cfpsf2'))}
              style={{ top: CHAMP, left: COL4 }}
              round="Championship"
              bowl="National Championship"
              gameData={getChampGame()}
              slotId="cfpnc"
            />

            {/* Trophy */}
            <div className="absolute text-center" style={{ top: CHAMP + MATCHUP_HEIGHT + 30, left: COL4, width: `${SLOT_WIDTH}px` }}>
              <img src="https://i.imgur.com/3goz1NK.png" alt="CFP Trophy" className="h-32 mx-auto mb-3" />
              <div className="label-xs text-txt-secondary" style={{ fontSize: '16px', letterSpacing: '0.2em' }}>NATIONAL CHAMPION</div>
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* GameDetailModal removed - now using game pages instead */}

      {/* Game Entry Modal (for editing/entering games - both user and CPU) */}
      {showEditModal && editingGameData && (
        <GameEntryModal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false)
            setEditingGameData(null)
          }}
          onSave={handleGameSave}
          weekNumber={currentDynasty.currentPhase === 'postseason' ? currentDynasty.currentWeek : 1}
          currentYear={displayYear}
          teamColors={teamColors}
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
    </div>
  )
}

