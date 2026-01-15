import { useState, useEffect } from 'react'
import { useDynasty, getGamesByType, GAME_TYPES, detectGameType, getUserGamePerspective } from '../../context/DynastyContext'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useTeamColors } from '../../hooks/useTeamColors'
import { getContrastTextColor } from '../../utils/colorUtils'
import { getTeamLogo } from '../../data/teams'
import { teamAbbreviations } from '../../data/teamAbbreviations'
import { TEAMS, resolveTid, getCurrentTeamAbbr, getGameTeamInfo } from '../../data/teamRegistry'
import { getBowlLogo } from '../../data/bowlGames'
import { getCFPGameId } from '../../data/cfpConstants'
// GameDetailModal removed - now using game pages instead
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
      if (width < 640) {
        setBracketScale(0.45) // Mobile - zoom out more
      } else if (width < 1024) {
        setBracketScale(0.7)  // Tablet
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
  const textColor = getContrastTextColor(teamColors.primary)

  const getTeamBySeed = (seed) => cfpSeeds.find(s => s.seed === seed)?.team || null

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

    // Derive winner from winnerTid if available (for unified format)
    if (game.winnerTid) {
      const winnerInfo = getGameTeamInfo(teams, game.winnerTid)
      winner = winnerInfo?.abbr || game.winner
    } else {
      winner = game.winner
    }

    // Prefer unified format scores
    if (game.team1Score !== undefined) {
      team1Score = game.team1Score
      team2Score = game.team2Score
      // Only compute winner from scores if not already set
      if (!winner) {
        winner = team1Score > team2Score ? team1 : team2Score > team1Score ? team2 : null
      }
    } else if (perspective) {
      // Use perspective for user games with unified format
      // Determine which team is team1 based on perspective
      const userTeamInfo = getGameTeamInfo(teams, perspective.userTid)
      const userAbbr = userTeamInfo?.abbr || game.userTeam
      if (userAbbr === team1) {
        team1Score = perspective.userScore
        team2Score = perspective.opponentScore
      } else {
        team1Score = perspective.opponentScore
        team2Score = perspective.userScore
      }
      // Only set winner if not already derived from winnerTid
      if (!winner) {
        winner = perspective.userWon ? userAbbr : (team1 === userAbbr ? team2 : team1)
      }
    } else if (game.teamScore !== undefined) {
      // Legacy user game format
      const userWon = game.result === 'W' || game.result === 'win'
      if (game.userTeam === team1) {
        team1Score = parseInt(game.teamScore)
        team2Score = parseInt(game.opponentScore)
        if (!winner) winner = userWon ? team1 : team2
      } else {
        team1Score = parseInt(game.opponentScore)
        team2Score = parseInt(game.teamScore)
        if (!winner) winner = userWon ? team2 : team1
      }
    }

    // Calculate seeds if not stored - for user CFP First Round games
    let seed1 = game.cfpSeed1 || game.seed1
    let seed2 = game.cfpSeed2 || game.seed2

    // If seeds are missing, try to calculate them from CFP seeds data
    if (!seed1 || !seed2) {
      const gameYear = game.year || displayYear
      const yearCfpSeeds = currentDynasty.cfpSeedsByYear?.[gameYear] || []

      // For user games, find their seed
      const userTeamForSeeds = perspective
        ? getGameTeamInfo(teams, perspective.userTid)?.abbr
        : (game.userTeam || team1)
      if (userTeamForSeeds || game.isCFPFirstRound) {
        const userSeedEntry = yearCfpSeeds.find(s => s.team === userTeamForSeeds)
        if (userSeedEntry) {
          const userSeed = userSeedEntry.seed
          const oppSeed = 17 - userSeed // CFP First Round matchups: 5v12, 6v11, 7v10, 8v9
          seed1 = userSeed
          seed2 = oppSeed
        }
      }

      // For CPU games, look up both teams
      if ((!seed1 || !seed2) && team1 && team2) {
        const team1Entry = yearCfpSeeds.find(s => s.team === team1)
        const team2Entry = yearCfpSeeds.find(s => s.team === team2)
        if (team1Entry) seed1 = team1Entry.seed
        if (team2Entry) seed2 = team2Entry.seed
      }
    }

    return {
      ...game,
      team1,
      team2,
      team1Score,
      team2Score,
      winner,
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
    return game?.winner || null
  }

  const getWinnerSeed = (seed1, seed2) => {
    const game = getFirstRoundGame(seed1, seed2)
    if (!game?.winner) return null
    if (game.team1 === game.winner) return game.seed1
    if (game.team2 === game.winner) return game.seed2
    return null
  }

  const getQFGame = (bowlName) => {
    return quarterfinalsResults.find(g => g && g.bowlName === bowlName) || null
  }

  const getQFWinner = (bowlName) => {
    const game = getQFGame(bowlName)
    return game?.winner || null
  }

  const getSFGame = (bowlName) => {
    return semifinalsResults.find(g => g && g.bowlName === bowlName) || null
  }

  const getSFWinner = (bowlName) => {
    const game = getSFGame(bowlName)
    return game?.winner || null
  }

  const getChampGame = () => {
    return championshipResults.find(g => g) || null
  }

  const getSeedByTeam = (team) => {
    if (!team) return null
    const seedEntry = cfpSeeds.find(s => s && s.team === team)
    return seedEntry?.seed || null
  }

  // Sizing constants (scaled up for larger bracket)
  const SLOT_HEIGHT = 70
  const SLOT_GAP = 12
  const MATCHUP_HEIGHT = SLOT_HEIGHT * 2 + SLOT_GAP // 152px
  const SLOT_WIDTH = 300
  const CONNECTOR_GAP = 60 // Gap between columns for connector lines

  // Team slot component
  const TeamSlot = ({ team, seed, score, isWinner }) => {
    const teamData = team ? teamAbbreviations[team] : null
    const bgColor = teamData?.backgroundColor || '#4B5563'
    const txtColor = teamData?.textColor || '#D1D5DB'
    const mascotName = team ? mascotMap[team] : null
    const logo = mascotName ? getTeamLogo(mascotName) : null
    const isLoser = score !== undefined && !isWinner

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
          {team ? (
            <Link
              to={`${pathPrefix}/team/${resolveTid(team, currentDynasty?.teams || TEAMS)}/${displayYear}`}
              onClick={(e) => e.stopPropagation()}
              className="text-xl font-semibold hover:underline"
              style={{ color: txtColor }}
            >
              {getShortName(team)}
            </Link>
          ) : (
            <span className="text-xl font-semibold" style={{ color: txtColor }}>
              TBD
            </span>
          )}
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
    // Map scores correctly based on which team is which
    // gameData has team1/team2 which may be in different order than visual display
    let score1, score2
    if (gameData) {
      // Find which gameData team matches the visual team1/team2
      if (gameData.team1 === team1) {
        score1 = gameData.team1Score
        score2 = gameData.team2Score
      } else if (gameData.team2 === team1) {
        score1 = gameData.team2Score
        score2 = gameData.team1Score
      } else {
        // Fallback to default order
        score1 = gameData.team1Score
        score2 = gameData.team2Score
      }
    }
    const winner = gameData?.winner
    const hasResult = !!winner

    // Generate game ID using the slot ID system
    // Each CFP game has a fixed slot ID: cfpfr1-4, cfpqf1-4, cfpsf1-2, cfpnc
    const gameId = hasResult && slotId ? getCFPGameId(slotId, displayYear) : null

    const matchupContent = (
      <>
        <TeamSlot team={team1} seed={seed1} score={score1} isWinner={winner === team1} />
        <TeamSlot team={team2} seed={seed2} score={score2} isWinner={winner === team2} />
      </>
    )

    // If there's a result, render as Link to game page
    if (hasResult && gameId) {
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

    // No result yet - just render as div (not clickable to game page)
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
        backgroundColor: `${teamColors.secondary}60`
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
        backgroundColor: `${teamColors.secondary}60`
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

  return (
    <div
      className="rounded-lg p-4"
      style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' }}
    >
      <div className="flex items-center justify-center gap-3 md:gap-6 mb-6 md:mb-10">
        <img src="https://i.imgur.com/ZKD9dQJ.png" alt="CFP Logo" className="h-10 md:h-20" />
        <h1 className="text-xl md:text-4xl font-bold text-white">
          <select
            value={displayYear}
            onChange={(e) => handleYearChange(parseInt(e.target.value))}
            className="bg-transparent font-bold cursor-pointer hover:opacity-80 transition-opacity appearance-none pr-1"
            style={{
              color: '#fff',
              outline: 'none',
              borderBottom: '2px solid rgba(255,255,255,0.4)'
            }}
          >
            {availableYears.map(year => (
              <option key={year} value={year} style={{ color: '#000' }}>{year}</option>
            ))}
          </select>
          {' '}College Football Playoff
        </h1>
      </div>

      {/* Bracket Container - scaled down, single scroll context */}
      <div className="overflow-x-auto">
        {/* Wrapper reserves correct visual space for scaled content */}
        <div
          style={{
            width: `${BRACKET_WIDTH * bracketScale}px`,
            height: `${(BRACKET_HEIGHT + 250) * bracketScale}px`
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
          <div className="flex mb-6 text-xl font-bold text-white">
            <div style={{ width: `${SLOT_WIDTH}px`, marginLeft: `${COL1}px` }} className="text-center">First Round</div>
            <div style={{ width: `${SLOT_WIDTH}px`, marginLeft: `${CONNECTOR_GAP}px` }} className="text-center">Quarterfinals</div>
            <div style={{ width: `${SLOT_WIDTH}px`, marginLeft: `${CONNECTOR_GAP}px` }} className="text-center">Semifinals</div>
            <div style={{ width: `${SLOT_WIDTH}px`, marginLeft: `${CONNECTOR_GAP}px` }} className="text-center">Championship</div>
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
            {/* 5 vs 12 winner plays #4 seed */}
            <Matchup team1={getFirstRoundWinner(5, 12)} team2={s4} seed1={getWinnerSeed(5, 12)} seed2={4} style={{ top: QF_M1, left: COL2 }} round="Quarterfinal" bowl="Sugar Bowl" gameData={getQFGame('Sugar Bowl')} slotId="cfpqf1" />
            {/* 8 vs 9 winner plays #1 seed */}
            <Matchup team1={getFirstRoundWinner(8, 9)} team2={s1} seed1={getWinnerSeed(8, 9)} seed2={1} style={{ top: QF_M2, left: COL2 }} round="Quarterfinal" bowl="Orange Bowl" gameData={getQFGame('Orange Bowl')} slotId="cfpqf2" />
            {/* 6 vs 11 winner plays #3 seed */}
            <Matchup team1={getFirstRoundWinner(6, 11)} team2={s3} seed1={getWinnerSeed(6, 11)} seed2={3} style={{ top: QF_M3, left: COL2 }} round="Quarterfinal" bowl="Rose Bowl" gameData={getQFGame('Rose Bowl')} slotId="cfpqf3" />
            {/* 7 vs 10 winner plays #2 seed */}
            <Matchup team1={getFirstRoundWinner(7, 10)} team2={s2} seed1={getWinnerSeed(7, 10)} seed2={2} style={{ top: QF_M4, left: COL2 }} round="Quarterfinal" bowl="Cotton Bowl" gameData={getQFGame('Cotton Bowl')} slotId="cfpqf4" />

            {/* QF Bowl Logos - positioned on right side, centered between both team slots */}
            <img
              src={getBowlLogo('Sugar Bowl')}
              alt="Sugar Bowl"
              className="absolute w-14 h-14 object-contain z-10"
              style={{ top: QF_M1 + MATCHUP_HEIGHT / 2 - 28, left: COL2 + SLOT_WIDTH - 10 }}
            />
            <img
              src={getBowlLogo('Orange Bowl')}
              alt="Orange Bowl"
              className="absolute w-14 h-14 object-contain z-10"
              style={{ top: QF_M2 + MATCHUP_HEIGHT / 2 - 28, left: COL2 + SLOT_WIDTH - 10 }}
            />
            <img
              src={getBowlLogo('Rose Bowl')}
              alt="Rose Bowl"
              className="absolute w-14 h-14 object-contain z-10"
              style={{ top: QF_M3 + MATCHUP_HEIGHT / 2 - 28, left: COL2 + SLOT_WIDTH - 10 }}
            />
            <img
              src={getBowlLogo('Cotton Bowl')}
              alt="Cotton Bowl"
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
            {/* Peach Bowl: Sugar Bowl winner vs Orange Bowl winner */}
            <Matchup
              team1={getQFWinner('Sugar Bowl')}
              team2={getQFWinner('Orange Bowl')}
              seed1={getSeedByTeam(getQFWinner('Sugar Bowl'))}
              seed2={getSeedByTeam(getQFWinner('Orange Bowl'))}
              style={{ top: SF_M1, left: COL3 }}
              round="Semifinal"
              bowl="Peach Bowl"
              gameData={getSFGame('Peach Bowl')}
              slotId="cfpsf1"
            />
            {/* Fiesta Bowl: Rose Bowl winner vs Cotton Bowl winner */}
            <Matchup
              team1={getQFWinner('Rose Bowl')}
              team2={getQFWinner('Cotton Bowl')}
              seed1={getSeedByTeam(getQFWinner('Rose Bowl'))}
              seed2={getSeedByTeam(getQFWinner('Cotton Bowl'))}
              style={{ top: SF_M2, left: COL3 }}
              round="Semifinal"
              bowl="Fiesta Bowl"
              gameData={getSFGame('Fiesta Bowl')}
              slotId="cfpsf2"
            />

            {/* SF Bowl Logos */}
            <img
              src={getBowlLogo('Peach Bowl')}
              alt="Peach Bowl"
              className="absolute w-14 h-14 object-contain z-10"
              style={{ top: SF_M1 + MATCHUP_HEIGHT / 2 - 28, left: COL3 + SLOT_WIDTH - 10 }}
            />
            <img
              src={getBowlLogo('Fiesta Bowl')}
              alt="Fiesta Bowl"
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
              team1={getSFWinner('Peach Bowl')}
              team2={getSFWinner('Fiesta Bowl')}
              seed1={getSeedByTeam(getSFWinner('Peach Bowl'))}
              seed2={getSeedByTeam(getSFWinner('Fiesta Bowl'))}
              style={{ top: CHAMP, left: COL4 }}
              round="Championship"
              bowl="National Championship"
              gameData={getChampGame()}
              slotId="cfpnc"
            />

            {/* Trophy */}
            <div className="absolute text-center" style={{ top: CHAMP + MATCHUP_HEIGHT + 30, left: COL4, width: `${SLOT_WIDTH}px` }}>
              <img src="https://i.imgur.com/3goz1NK.png" alt="CFP Trophy" className="h-32 mx-auto mb-3" />
              <div className="text-lg font-bold text-white">National Champion</div>
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
