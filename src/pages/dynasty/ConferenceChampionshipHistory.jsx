import { useState, useEffect, useRef } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { useDynasty, getGamesByType, GAME_TYPES, detectGameType } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { teamAbbreviations } from '../../data/teamAbbreviations'
import { getTeamLogo, getMascotName as getMascotNameFromTeams, getSchoolName } from '../../data/teams'
import { getTeamColors } from '../../data/teamColors'
import { getConferenceLogo } from '../../data/conferenceLogos'
import { TEAMS, getGameTeamInfo } from '../../data/teamRegistry'
import { getTeamConference } from '../../data/conferenceTeams'
// GameDetailModal removed - now using game pages instead

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

// Conferences that have championship games (excluding Independent)
const CONFERENCES = [
  'ACC',
  'American',
  'Big 12',
  'Big Ten',
  'Conference USA',
  'MAC',
  'Mountain West',
  'Pac-12',
  'SEC',
  'Sun Belt'
]

export default function ConferenceChampionshipHistory() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const { currentDynasty } = useDynasty()
  const pathPrefix = usePathPrefix()
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedConference, setExpandedConference] = useState(null)
  const conferenceRefs = useRef({})
  // Modal state removed - now using game pages instead

  // Auto-expand and scroll to conference from URL parameter
  useEffect(() => {
    const conferenceFromUrl = searchParams.get('conference')
    if (conferenceFromUrl) {
      setExpandedConference(conferenceFromUrl)
      // Wait for render then scroll
      setTimeout(() => {
        const element = conferenceRefs.current[conferenceFromUrl]
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }, 100)
    }
  }, [searchParams])

  if (!currentDynasty) return null

  // Filter conferences by search
  const filteredConferences = CONFERENCES.filter(conf => {
    if (searchQuery === '') return true
    return conf.toLowerCase().includes(searchQuery.toLowerCase())
  })

  // Get all conference championship results for a conference
  // UNIFIED: Read from games[] array using gameType
  const getConferenceResults = (conferenceName) => {
    const games = currentDynasty.games || []
    const teams = currentDynasty?.teams || TEAMS

    // Helper to get team abbreviation from tid or fallback
    const getTeamAbbr = (g, isTeam1) => {
      const tidField = isTeam1 ? 'team1Tid' : 'team2Tid'
      const legacyField = isTeam1 ? 'team1' : 'team2'
      const userField = isTeam1 ? 'userTeam' : 'opponent'
      if (g[tidField]) {
        const teamInfo = getGameTeamInfo(teams, g[tidField])
        return teamInfo?.abbr || g[legacyField]
      }
      return g[legacyField] || g[userField]
    }

    // Filter games by gameType and conference
    // If game doesn't have conference field, detect it from the teams
    const ccGames = games.filter(g => {
      const gameType = detectGameType(g)
      const team1 = getTeamAbbr(g, true)
      const team2 = getTeamAbbr(g, false)
      if (gameType !== GAME_TYPES.CONFERENCE_CHAMPIONSHIP || !team1 || !team2) return false

      // Check explicit conference field first
      if (g.conference) {
        return g.conference === conferenceName
      }

      // Fallback: detect conference from either team
      const customConferences = currentDynasty?.conferencesByYear?.[currentDynasty?.currentYear]
      const team1Conf = getTeamConference(team1, customConferences, currentDynasty?.teams)
      const team2Conf = getTeamConference(team2, customConferences, currentDynasty?.teams)
      return team1Conf === conferenceName || team2Conf === conferenceName
    })

    // Map to result format
    const results = ccGames.map(g => ({
      year: g.year,
      conference: g.conference,
      team1: getTeamAbbr(g, true),
      team2: getTeamAbbr(g, false),
      team1Score: g.team1Score,
      team2Score: g.team2Score,
      winner: g.winner,
      gameRef: g
    }))

    // Sort by year descending (most recent first)
    return results.sort((a, b) => b.year - a.year)
  }

  // Count total conference championship games played
  const getTotalCCGames = () => {
    const games = currentDynasty.games || []
    const teams = currentDynasty?.teams || TEAMS

    return games.filter(g => {
      const gameType = detectGameType(g)
      // Check if teams exist using either tid or legacy fields
      const hasTeam1 = g.team1Tid || g.team1 || g.userTeam
      const hasTeam2 = g.team2Tid || g.team2 || g.opponent
      return gameType === GAME_TYPES.CONFERENCE_CHAMPIONSHIP && hasTeam1 && hasTeam2
    }).length
  }

  // Get unique seasons with CC data
  const getSeasonCount = () => {
    const games = currentDynasty.games || []
    const years = new Set()
    games.forEach(g => {
      if (detectGameType(g) === GAME_TYPES.CONFERENCE_CHAMPIONSHIP) {
        years.add(g.year)
      }
    })
    return years.size
  }

  // Get winner of a championship game
  const getWinner = (game) => {
    if (game.winner) return game.winner
    if (!game.team1Score && game.team1Score !== 0) return null
    if (!game.team2Score && game.team2Score !== 0) return null
    return game.team1Score > game.team2Score ? game.team1 : game.team2
  }

  const totalCCGames = getTotalCCGames()
  const seasonCount = getSeasonCount()

  return (
    <div className="space-y-4">
      {/* Hero Header */}
      <div
        className="relative rounded-xl overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 50%, #020617 100%)'
        }}
      >
        {/* Subtle pattern overlay */}
        <div
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
          }}
        />

        <div className="relative px-4 sm:px-6 py-6">
          {/* Title row */}
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-1.5 h-10 rounded-full"
              style={{ background: 'linear-gradient(180deg, #3b82f6 0%, #1d4ed8 100%)' }}
            />
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                Conference Championships
              </h1>
              <p className="text-sm text-slate-400 mt-0.5">
                {totalCCGames} game{totalCCGames !== 1 ? 's' : ''} across {seasonCount} season{seasonCount !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative max-w-md">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conferences..."
              className="w-full pl-9 pr-8 py-2 rounded-lg text-sm bg-slate-800/60 border border-slate-700/50 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          {searchQuery && (
            <p className="mt-2 text-xs text-slate-500">
              {filteredConferences.length} conference{filteredConferences.length !== 1 ? 's' : ''} found
            </p>
          )}
        </div>
      </div>

      {/* Conference Championships List */}
      <div className="space-y-2">
        {filteredConferences.map(conferenceName => {
          const results = getConferenceResults(conferenceName)
          const isExpanded = expandedConference === conferenceName

          return (
            <div
              key={conferenceName}
              ref={el => conferenceRefs.current[conferenceName] = el}
              className="rounded-lg overflow-hidden"
              style={{
                scrollMarginTop: '100px',
                background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                boxShadow: '0 0 0 1px rgba(71, 85, 105, 0.3)'
              }}
            >
              {/* Conference Header */}
              <button
                onClick={() => setExpandedConference(isExpanded ? null : conferenceName)}
                className="w-full flex items-center gap-3 px-3 py-3 hover:bg-white/5 transition-colors"
              >
                {/* Conference Logo */}
                <div className="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center bg-white p-1">
                  {getConferenceLogo(conferenceName) ? (
                    <img
                      src={getConferenceLogo(conferenceName)}
                      alt=""
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <span className="text-lg font-bold text-slate-600">
                      {conferenceName.charAt(0)}
                    </span>
                  )}
                </div>

                {/* Conference Name and Stats */}
                <div className="flex-1 text-left min-w-0">
                  <div className="font-semibold text-white truncate">
                    {conferenceName} Championship
                  </div>
                  <div className="text-xs text-slate-500">
                    {results.length === 0 ? 'No games played' : `${results.length} game${results.length !== 1 ? 's' : ''}`}
                  </div>
                </div>

                {/* Expand Icon */}
                <div className="text-slate-500 flex-shrink-0">
                  <svg
                    className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
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
                <div className="px-3 pb-3 space-y-1.5 border-t border-slate-700/50">
                  <div className="pt-2" />
                  {results.map((game, idx) => {
                    const winner = getWinner(game)
                    const team1Mascot = getMascotName(game.team1, currentDynasty?.teams || currentDynasty?.customTeams)
                    const team2Mascot = getMascotName(game.team2, currentDynasty?.teams || currentDynasty?.customTeams)
                    const team1Logo = team1Mascot ? getTeamLogo(team1Mascot, currentDynasty?.teams || currentDynasty?.customTeams) : null
                    const team2Logo = team2Mascot ? getTeamLogo(team2Mascot, currentDynasty?.teams || currentDynasty?.customTeams) : null

                    // Find the game in games[] array, or use fallback ID
                    const ccGame = currentDynasty.games?.find(g =>
                      g.isConferenceChampionship &&
                      g.year === game.year &&
                      g.conference === conferenceName
                    )
                    const gameId = ccGame?.id || game.gameRef?.id || `cc-${game.year}-${conferenceName.toLowerCase().replace(/\s+/g, '-')}`

                    return (
                      <Link
                        key={`${game.year}-${idx}`}
                        to={`${pathPrefix}/game/${gameId}`}
                        className="flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 transition-colors"
                      >
                        {/* Year */}
                        <div className="w-10 sm:w-12 text-center font-bold text-sm text-blue-400 flex-shrink-0">
                          {game.year}
                        </div>

                        {/* Team 1 */}
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          {team1Logo && (
                            <div className="w-6 h-6 rounded-full bg-white p-0.5 flex-shrink-0">
                              <img src={team1Logo} alt="" className="w-full h-full object-contain" />
                            </div>
                          )}
                          <span
                            className={`text-xs sm:text-sm font-medium truncate ${winner === game.team1 ? 'text-white' : 'text-slate-500'}`}
                          >
                            {getSchoolName(game.team1, currentDynasty?.teams) || game.team1}
                          </span>
                        </div>

                        {/* Score */}
                        <div className="flex items-center gap-1.5 font-bold text-xs sm:text-sm flex-shrink-0">
                          <span className={winner === game.team1 ? 'text-green-400' : 'text-slate-500'}>
                            {game.team1Score}
                          </span>
                          <span className="text-slate-600">-</span>
                          <span className={winner === game.team2 ? 'text-green-400' : 'text-slate-500'}>
                            {game.team2Score}
                          </span>
                        </div>

                        {/* Team 2 */}
                        <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
                          <span
                            className={`text-xs sm:text-sm font-medium truncate ${winner === game.team2 ? 'text-white' : 'text-slate-500'}`}
                          >
                            {getSchoolName(game.team2, currentDynasty?.teams) || game.team2}
                          </span>
                          {team2Logo && (
                            <div className="w-6 h-6 rounded-full bg-white p-0.5 flex-shrink-0">
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
                <div className="px-3 pb-4 pt-2 text-center border-t border-slate-700/50">
                  <p className="text-sm text-slate-500">
                    No championship games have been played in this conference yet.
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {filteredConferences.length === 0 && (
        <div
          className="rounded-lg p-8 text-center"
          style={{
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            boxShadow: '0 0 0 1px rgba(71, 85, 105, 0.3)'
          }}
        >
          <p className="text-slate-500">
            No conferences found matching "{searchQuery}"
          </p>
        </div>
      )}
    </div>
  )
}
