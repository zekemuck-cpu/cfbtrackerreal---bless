import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useDynasty, GAME_TYPES, detectGameType } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useTeamColors } from '../../hooks/useTeamColors'
import { bowlLogos, getAllBowlNames } from '../../data/bowlLogos'
import { teamAbbreviations } from '../../data/teamAbbreviations'
import { getTeamLogo, getMascotName as getMascotNameFromTeams } from '../../data/teams'
import { getTeamColors } from '../../data/teamColors'
import { getSlotIdFromBowlName, getCFPGameId } from '../../data/cfpConstants'
import { getContrastTextColor } from '../../utils/colorUtils'
import { TEAMS, getGameTeamInfo } from '../../data/teamRegistry'
import BowlHistoryEditModal from '../../components/BowlHistoryEditModal'

// Map abbreviation to mascot name for logo lookup
const getMascotName = (abbr, teamsData = null) => {
  // Try tid-based lookup first if teams data provided
  if (teamsData) {
    const result = getMascotNameFromTeams(abbr, teamsData)
    if (result) return result
  }
  const mascotMap = {
    'BAMA': 'Alabama Crimson Tide', 'AFA': 'Air Force Falcons', 'AKR': 'Akron Zips',
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
    'USA': 'South Alabama Jaguars', 'USU': 'Utah State Aggies',
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
    'USM': 'Southern Mississippi Golden Eagles',
    // FCS teams
    'FCSE': 'FCS East Judicials', 'FCSM': 'FCS Midwest Rebels',
    'FCSN': 'FCS Northwest Stallions', 'FCSW': 'FCS West Titans'
  }
  return mascotMap[abbr] || null
}

export default function BowlHistory() {
  const { id } = useParams()
  const { currentDynasty, isViewOnly } = useDynasty()
  const pathPrefix = usePathPrefix()
  const teamColors = useTeamColors(currentDynasty?.teamName, currentDynasty?.teams || currentDynasty?.customTeams)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedBowl, setExpandedBowl] = useState(null)
  const [showEditModal, setShowEditModal] = useState(false)

  if (!currentDynasty) return null

  const primaryText = getContrastTextColor(teamColors?.primary || '#1f2937')

  // Get all bowl names sorted alphabetically
  const allBowls = getAllBowlNames()

  // Filter bowls by search
  const filteredBowls = allBowls.filter(bowl => {
    if (searchQuery === '') return true
    return bowl.toLowerCase().includes(searchQuery.toLowerCase())
  })

  // Get all bowl game results from the dynasty
  // UNIFIED: Read from games[] array using gameType
  const getBowlResults = (bowlName) => {
    const results = []
    const games = currentDynasty.games || []

    // Find bowl games from the unified games[] array using gameType
    // Only include played games (not UPCOMING) - use isPlayed flag or non-zero scores
    const bowlGamesFromArray = games.filter(g => {
      const gameType = detectGameType(g)
      const isBowlType = gameType === GAME_TYPES.BOWL ||
                         gameType === GAME_TYPES.CFP_QUARTERFINAL ||
                         gameType === GAME_TYPES.CFP_SEMIFINAL ||
                         gameType === GAME_TYPES.CFP_CHAMPIONSHIP
      const isPlayed = g.isPlayed || g.team1Score > 0 || g.team2Score > 0
      return isBowlType && g.bowlName === bowlName && isPlayed
    })

    const teams = currentDynasty?.teams || TEAMS
    bowlGamesFromArray.forEach(game => {
      const gameType = detectGameType(game)
      const isCFP = gameType === GAME_TYPES.CFP_QUARTERFINAL ||
                    gameType === GAME_TYPES.CFP_SEMIFINAL ||
                    gameType === GAME_TYPES.CFP_CHAMPIONSHIP
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
      results.push({
        year: game.year,
        bowlName: game.bowlName,
        team1,
        team2,
        team1Score: game.team1Score,
        team2Score: game.team2Score,
        winner: game.winner,
        week: game.bowlWeek || 'week1',
        gameNote: game.gameNote,
        links: game.links,
        isCFP,
        gameType,
        // Include the full game reference for editing
        gameRef: game
      })
    })

    // Fallback: Also check bowlGamesByYear for backward compatibility
    const bowlGamesByYear = currentDynasty.bowlGamesByYear || {}
    Object.entries(bowlGamesByYear).forEach(([year, yearData]) => {
      // Skip if we already have this bowl for this year from games[]
      if (results.some(r => r.year === parseInt(year) && r.bowlName === bowlName)) return

      // Check week 1 bowls
      const week1Games = yearData?.week1 || []
      const week1Match = week1Games.find(g => g && g.bowlName === bowlName)
      if (week1Match && week1Match.team1 && week1Match.team2 && week1Match.team1Score != null) {
        results.push({
          year: parseInt(year),
          ...week1Match,
          week: 'week1'
        })
      }

      // Check week 2 bowls
      const week2Games = yearData?.week2 || []
      const week2Match = week2Games.find(g => g && g.bowlName === bowlName)
      if (week2Match && week2Match.team1 && week2Match.team2 && week2Match.team1Score != null) {
        results.push({
          year: parseInt(year),
          ...week2Match,
          week: 'week2'
        })
      }
    })

    // Check CFP results (quarterfinals, semifinals, championship)
    const cfpResultsByYear = currentDynasty.cfpResultsByYear || {}
    Object.entries(cfpResultsByYear).forEach(([year, yearData]) => {
      // Skip if we already have this bowl for this year
      if (results.some(r => r.year === parseInt(year) && r.bowlName === bowlName)) return

      // CFP Quarterfinals (Rose, Sugar, Orange, Cotton bowls)
      const quarterfinals = yearData?.quarterfinals || []
      const qfMatch = quarterfinals.find(g => g && g.bowlName === bowlName)
      if (qfMatch && qfMatch.team1 && qfMatch.team2 && qfMatch.team1Score != null) {
        results.push({
          year: parseInt(year),
          bowlName: qfMatch.bowlName,
          team1: qfMatch.team1,
          team2: qfMatch.team2,
          team1Score: qfMatch.team1Score,
          team2Score: qfMatch.team2Score,
          winner: qfMatch.winner,
          isCFP: true
        })
      }

      // CFP Semifinals (Peach Bowl, Fiesta Bowl)
      const semifinals = yearData?.semifinals || []
      const sfMatch = semifinals.find(g => g && g.bowlName === bowlName)
      if (sfMatch && sfMatch.team1 && sfMatch.team2 && sfMatch.team1Score != null) {
        results.push({
          year: parseInt(year),
          bowlName: sfMatch.bowlName,
          team1: sfMatch.team1,
          team2: sfMatch.team2,
          team1Score: sfMatch.team1Score,
          team2Score: sfMatch.team2Score,
          winner: sfMatch.winner,
          isCFP: true
        })
      }

      // CFP Championship (National Championship)
      const championship = yearData?.championship
      if (championship && championship.team1 && championship.team2 && championship.team1Score != null) {
        if (bowlName === 'National Championship') {
          results.push({
            year: parseInt(year),
            bowlName: 'National Championship',
            team1: championship.team1,
            team2: championship.team2,
            team1Score: championship.team1Score,
            team2Score: championship.team2Score,
            winner: championship.winner,
            isCFP: true
          })
        }
      }
    })

    // Sort by year descending (most recent first)
    return results.sort((a, b) => b.year - a.year)
  }

  // Count total bowl games played (including CFP bowls)
  const getTotalBowlGames = () => {
    const games = currentDynasty.games || []

    // Count bowl games from games[] array using gameType
    // Only include played games (not UPCOMING) - use isPlayed flag or non-zero scores
    const bowlGamesInArray = games.filter(g => {
      const gameType = detectGameType(g)
      const isBowlType = gameType === GAME_TYPES.BOWL ||
                         gameType === GAME_TYPES.CFP_QUARTERFINAL ||
                         gameType === GAME_TYPES.CFP_SEMIFINAL ||
                         gameType === GAME_TYPES.CFP_CHAMPIONSHIP
      const isPlayed = g.isPlayed || g.team1Score > 0 || g.team2Score > 0
      return isBowlType && isPlayed
    }).length

    // With unified migration, all bowl games are in games[] array
    // No need for legacy fallback counting
    return bowlGamesInArray
  }

  // Legacy counting function (kept for reference, no longer used)
  const getTotalBowlGamesLegacy = () => {
    let total = 0
    const games = currentDynasty.games || []

    // Count bowl games from games[] array
    const bowlGamesInArray = games.filter(g =>
      (g.isBowlGame || g.isCFPQuarterfinal || g.isCFPSemifinal || g.isCFPChampionship) &&
      g.team1Score !== null && g.team1Score !== undefined
    ).length
    total += bowlGamesInArray

    // Also count from bowlGamesByYear (for backward compatibility, avoid double-counting)
    const bowlGamesByYear = currentDynasty.bowlGamesByYear || {}
    Object.entries(bowlGamesByYear).forEach(([year, yearData]) => {
      const week1 = (yearData?.week1 || []).filter(g => {
        // Only count if not already in games[]
        const inGamesArray = games.some(
          ga => ga.bowlName === g.bowlName && ga.year === parseInt(year)
        )
        return g.team1 && g.team2 && g.team1Score != null && !inGamesArray
      }).length
      const week2 = (yearData?.week2 || []).filter(g => {
        const inGamesArray = games.some(
          ga => ga.bowlName === g.bowlName && ga.year === parseInt(year)
        )
        return g.team1 && g.team2 && g.team1Score != null && !inGamesArray
      }).length
      total += week1 + week2
    })

    // Also count CFP games from cfpResultsByYear (avoid double-counting)
    const cfpResultsByYear = currentDynasty.cfpResultsByYear || {}
    Object.entries(cfpResultsByYear).forEach(([year, yearData]) => {
      // Count quarterfinals
      const qf = (yearData?.quarterfinals || []).filter(g => {
        const inGamesArray = games.some(
          ga => ga.bowlName === g.bowlName && ga.year === parseInt(year)
        )
        return g.team1 && g.team2 && g.team1Score != null && !inGamesArray
      }).length
      total += qf

      // Count semifinals
      const sf = (yearData?.semifinals || []).filter(g => {
        const inGamesArray = games.some(
          ga => ga.bowlName === g.bowlName && ga.year === parseInt(year)
        )
        return g.team1 && g.team2 && g.team1Score != null && !inGamesArray
      }).length
      total += sf

      // Count championship
      const champ = yearData?.championship
      if (champ && champ.team1 && champ.team2 && champ.team1Score != null) {
        const inGamesArray = games.some(
          ga => ga.bowlName === 'National Championship' && ga.year === parseInt(year)
        )
        if (!inGamesArray) total += 1
      }
    })

    return total
  }

  // Get winner of a bowl game
  const getWinner = (game) => {
    if (!game.team1Score && game.team1Score !== 0) return null
    if (!game.team2Score && game.team2Score !== 0) return null
    return game.team1Score > game.team2Score ? game.team1 : game.team2
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg shadow-lg p-6 bg-gray-800 border-2 border-gray-600 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">
          Bowl History
        </h1>
        {!isViewOnly && (
          <button
            onClick={() => setShowEditModal(true)}
            className="px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-colors flex items-center gap-2"
            style={{ backgroundColor: teamColors.primary, color: primaryText }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit
          </button>
        )}
      </div>

      {/* Search */}
      <div className="rounded-lg shadow-lg p-4 bg-gray-800 border-2 border-gray-600">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5"
            fill="none"
            stroke="white"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search bowl games..."
            className="w-full pl-10 pr-4 py-3 rounded-lg border-2 font-semibold text-lg"
            style={{
              borderColor: '#4b5563',
              backgroundColor: 'white'
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:opacity-70 text-gray-500"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        {searchQuery && (
          <p className="mt-2 text-sm font-semibold text-gray-400">
            {filteredBowls.length} bowl{filteredBowls.length !== 1 ? 's' : ''} found
          </p>
        )}
      </div>

      {/* Bowl Games List */}
      <div className="rounded-lg shadow-lg overflow-hidden bg-gray-800 border-2 border-gray-600">
        <div className="divide-y divide-gray-700">
          {filteredBowls.map(bowlName => {
            const logo = bowlLogos[bowlName]
            const results = getBowlResults(bowlName)
            const isExpanded = expandedBowl === bowlName

            return (
              <div key={bowlName}>
                {/* Bowl Header */}
                <button
                  onClick={() => setExpandedBowl(isExpanded ? null : bowlName)}
                  className="w-full flex items-center gap-4 p-4 hover:bg-gray-700 transition-colors"
                >
                  {/* Bowl Logo */}
                  <div
                    className="w-14 h-14 rounded-lg flex-shrink-0 flex items-center justify-center bg-white border-2 border-gray-600"
                    style={{ padding: '4px' }}
                  >
                    {logo ? (
                      <img
                        src={logo}
                        alt={`${bowlName} logo`}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <span className="text-2xl">🏈</span>
                    )}
                  </div>

                  {/* Bowl Name and Stats */}
                  <div className="flex-1 text-left">
                    <div className="font-bold text-lg text-white">
                      {bowlName}
                    </div>
                    <div className="text-sm text-gray-400">
                      {results.length === 0 ? 'No games played' : `${results.length} game${results.length !== 1 ? 's' : ''} played`}
                    </div>
                  </div>

                  {/* Expand Icon */}
                  <div className="text-white">
                    <svg
                      className={`w-6 h-6 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* Expanded Results */}
                {isExpanded && results.length > 0 && (
                  <div
                    className="px-4 pb-4 space-y-2"
                    style={{ backgroundColor: 'rgba(55, 65, 81, 0.5)' }}
                  >
                    {results.map((game, idx) => {
                      const winner = getWinner(game)
                      const team1Info = teamAbbreviations[game.team1]
                      const team2Info = teamAbbreviations[game.team2]
                      const team1Mascot = getMascotName(game.team1, currentDynasty?.teams || currentDynasty?.customTeams)
                      const team2Mascot = getMascotName(game.team2, currentDynasty?.teams || currentDynasty?.customTeams)
                      const team1Logo = team1Mascot ? getTeamLogo(team1Mascot) : null
                      const team2Logo = team2Mascot ? getTeamLogo(team2Mascot) : null
                      const team1Colors = team1Mascot ? getTeamColors(team1Mascot) : { primary: '#666', secondary: '#fff' }
                      const team2Colors = team2Mascot ? getTeamColors(team2Mascot) : { primary: '#666', secondary: '#fff' }

                      // Generate game ID for navigation
                      // Prefer actual game ID from gameRef when available (most reliable)
                      // Fall back to generated IDs for legacy data
                      const gameBowlName = game.bowlName || bowlName
                      const bowlSlug = gameBowlName.toLowerCase().replace(/\s+/g, '-')
                      let gameId
                      if (game.gameRef?.id) {
                        // Use actual game ID from database
                        gameId = game.gameRef.id
                      } else if (game.isCFP) {
                        // CFP games use slot IDs (cfpqf1, cfpsf1, cfpnc)
                        const slotId = getSlotIdFromBowlName(gameBowlName)
                        gameId = slotId ? getCFPGameId(slotId, game.year) : `bowl-${game.year}-${bowlSlug}`
                      } else {
                        // Regular bowl games use bowl-{year}-{slug} format as fallback
                        gameId = `bowl-${game.year}-${bowlSlug}`
                      }

                      return (
                        <Link
                          key={`${game.year}-${idx}`}
                          to={`${pathPrefix}/game/${gameId}`}
                          className="flex items-center gap-3 p-3 rounded-lg bg-white hover:scale-[1.01] transition-transform border-2 border-gray-300"
                        >
                          {/* Year */}
                          <div className="w-16 text-center font-bold text-lg text-gray-700">
                            {game.year}
                          </div>

                          {/* Team 1 */}
                          <div className="flex items-center gap-2 flex-1">
                            {team1Logo && (
                              <div
                                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{
                                  backgroundColor: '#FFFFFF',
                                  border: `2px solid ${team1Colors.primary}`,
                                  padding: '2px'
                                }}
                              >
                                <img src={team1Logo} alt="" className="w-full h-full object-contain" />
                              </div>
                            )}
                            <span
                              className={`font-semibold ${winner === game.team1 ? '' : 'opacity-60'}`}
                              style={{ color: team1Info?.backgroundColor || '#333' }}
                            >
                              {team1Mascot || game.team1}
                            </span>
                          </div>

                          {/* Score */}
                          <div className="flex items-center gap-2 font-bold">
                            <span
                              className={winner === game.team1 ? 'text-green-600' : 'text-gray-400'}
                            >
                              {game.team1Score}
                            </span>
                            <span className="text-gray-400">-</span>
                            <span
                              className={winner === game.team2 ? 'text-green-600' : 'text-gray-400'}
                            >
                              {game.team2Score}
                            </span>
                          </div>

                          {/* Team 2 */}
                          <div className="flex items-center gap-2 flex-1 justify-end">
                            <span
                              className={`font-semibold ${winner === game.team2 ? '' : 'opacity-60'}`}
                              style={{ color: team2Info?.backgroundColor || '#333' }}
                            >
                              {team2Mascot || game.team2}
                            </span>
                            {team2Logo && (
                              <div
                                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{
                                  backgroundColor: '#FFFFFF',
                                  border: `2px solid ${team2Colors.primary}`,
                                  padding: '2px'
                                }}
                              >
                                <img src={team2Logo} alt="" className="w-full h-full object-contain" />
                              </div>
                            )}
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                )}

                {/* No results message */}
                {isExpanded && results.length === 0 && (
                  <div
                    className="px-4 pb-4 text-center py-6"
                    style={{ backgroundColor: 'rgba(55, 65, 81, 0.5)' }}
                  >
                    <p className="text-gray-400">
                      No games have been played in this bowl yet.
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {filteredBowls.length === 0 && (
        <div className="rounded-lg shadow-lg p-8 text-center bg-gray-800 border-2 border-gray-600">
          <p className="text-gray-400">
            No bowls found matching "{searchQuery}"
          </p>
        </div>
      )}

      {/* Edit Modal */}
      <BowlHistoryEditModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        teamColors={teamColors}
      />
    </div>
  )
}
