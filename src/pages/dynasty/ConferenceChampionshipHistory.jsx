import { useState, useEffect, useRef } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { useDynasty, GAME_TYPES, detectGameType } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { getTeamLogo, getMascotName as getMascotNameFromTeams, getSchoolName } from '../../data/teams'
import { getConferenceLogo } from '../../data/conferenceLogos'
import { TEAMS, getGameTeamInfo } from '../../data/teamRegistry'
import { getTeamConference } from '../../data/conferenceTeams'
import { PageHero, Card, EmptyState, Input } from '../../components/ui'

const getMascotName = (abbr, teamsData = null) => {
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
    'FCSE': 'FCS East Judicials', 'FCSM': 'FCS Midwest Rebels',
    'FCSN': 'FCS Northwest Stallions', 'FCSW': 'FCS West Titans'
  }
  return mascotMap[abbr] || null
}

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

  useEffect(() => {
    const conferenceFromUrl = searchParams.get('conference')
    if (conferenceFromUrl) {
      setExpandedConference(conferenceFromUrl)
      setTimeout(() => {
        const element = conferenceRefs.current[conferenceFromUrl]
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }, 100)
    }
  }, [searchParams])

  if (!currentDynasty) return null

  const filteredConferences = CONFERENCES.filter(conf => {
    if (searchQuery === '') return true
    return conf.toLowerCase().includes(searchQuery.toLowerCase())
  })

  const getConferenceResults = (conferenceName) => {
    const games = currentDynasty.games || []
    const teams = currentDynasty?.teams || TEAMS

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

    const ccGames = games.filter(g => {
      const gameType = detectGameType(g)
      const team1 = getTeamAbbr(g, true)
      const team2 = getTeamAbbr(g, false)
      if (gameType !== GAME_TYPES.CONFERENCE_CHAMPIONSHIP || !team1 || !team2) return false

      if (g.conference) {
        return g.conference === conferenceName
      }

      const customConferences = currentDynasty?.conferencesByYear?.[currentDynasty?.currentYear]
      const team1Conf = getTeamConference(team1, customConferences, currentDynasty?.teams)
      const team2Conf = getTeamConference(team2, customConferences, currentDynasty?.teams)
      return team1Conf === conferenceName || team2Conf === conferenceName
    })

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

    return results.sort((a, b) => b.year - a.year)
  }

  const getTotalCCGames = () => {
    const games = currentDynasty.games || []
    return games.filter(g => {
      const gameType = detectGameType(g)
      const hasTeam1 = g.team1Tid || g.team1 || g.userTeam
      const hasTeam2 = g.team2Tid || g.team2 || g.opponent
      return gameType === GAME_TYPES.CONFERENCE_CHAMPIONSHIP && hasTeam1 && hasTeam2
    }).length
  }

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

  const getWinner = (game) => {
    if (game.winner) return game.winner
    if (!game.team1Score && game.team1Score !== 0) return null
    if (!game.team2Score && game.team2Score !== 0) return null
    return game.team1Score > game.team2Score ? game.team1 : game.team2
  }

  const totalCCGames = getTotalCCGames()
  const seasonCount = getSeasonCount()

  return (
    <div className="space-y-4 page-enter">
      <PageHero
        eyebrow="Postseason"
        title="Conference Championships"
        meta={
          <>
            <span className="tabular">{totalCCGames}</span>
            <span>game{totalCCGames !== 1 ? 's' : ''} across</span>
            <span className="tabular">{seasonCount}</span>
            <span>season{seasonCount !== 1 ? 's' : ''}</span>
          </>
        }
      >
        <div className="max-w-md">
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conferences..."
          />
          {searchQuery && (
            <div
              className="mt-2 label-xs text-txt-tertiary"
              style={{ letterSpacing: '1.5px', fontSize: '10px' }}
            >
              {filteredConferences.length} CONFERENCE{filteredConferences.length !== 1 ? 'S' : ''} FOUND
            </div>
          )}
        </div>
      </PageHero>

      <div className="space-y-2">
        {filteredConferences.map(conferenceName => {
          const results = getConferenceResults(conferenceName)
          const isExpanded = expandedConference === conferenceName
          const confLogo = getConferenceLogo(conferenceName)
          const hasGames = results.length > 0

          return (
            <div
              key={conferenceName}
              ref={el => (conferenceRefs.current[conferenceName] = el)}
              style={{ scrollMarginTop: '100px' }}
            >
              <Card
                padding="none"
                className={`cc-card relative overflow-hidden transition-all duration-200 ${
                  isExpanded ? 'cc-card-expanded' : ''
                }`}
              >
                {isExpanded && (
                  <span
                    aria-hidden="true"
                    className="absolute top-0 left-0 right-0 h-[2px] z-10"
                    style={{ backgroundColor: 'var(--surface-5)' }}
                  />
                )}
                <button
                  onClick={() => setExpandedConference(isExpanded ? null : conferenceName)}
                  className="group w-full flex items-center gap-3 px-4 py-3.5 hover:bg-surface-3 transition-colors text-left"
                >
                  <div
                    className="w-11 h-11 rounded-md flex-shrink-0 flex items-center justify-center bg-white p-1 transition-transform duration-200 group-hover:scale-105"
                    style={{
                      boxShadow: isExpanded
                        ? '0 0 0 2px var(--surface-5)'
                        : 'none',
                    }}
                  >
                    {confLogo ? (
                      <img src={confLogo} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-lg font-bold text-txt-tertiary">
                        {conferenceName.charAt(0)}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div
                      className="label-xs text-txt-tertiary mb-0.5"
                      style={{ letterSpacing: '1.5px', fontSize: '9px' }}
                    >
                      {conferenceName.toUpperCase()}
                    </div>
                    <div className="font-display font-bold text-txt-primary truncate text-base leading-tight">
                      Championship
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div
                      className="flex items-baseline gap-1.5 px-2.5 py-1 rounded"
                      style={{
                        backgroundColor: hasGames ? 'var(--surface-3)' : 'transparent',
                        border: hasGames ? 'none' : '1px dashed var(--surface-4)',
                      }}
                    >
                      <span
                        className="font-display font-black tabular text-sm leading-none"
                        style={{
                          color: hasGames ? 'var(--text-primary)' : 'var(--text-tertiary)',
                        }}
                      >
                        {results.length}
                      </span>
                      <span
                        className="label-xs text-txt-tertiary"
                        style={{ letterSpacing: '1.5px', fontSize: '9px' }}
                      >
                        {results.length === 1 ? 'GAME' : 'GAMES'}
                      </span>
                    </div>

                    <svg
                      className="w-4 h-4 transition-transform duration-300"
                      style={{
                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                        color: isExpanded ? 'var(--text-primary)' : 'var(--text-tertiary)',
                      }}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {isExpanded && hasGames && (
                  <div
                    className="px-3 pb-3 pt-2 space-y-1 expand-body"
                    style={{ borderTop: '1px solid var(--rule-soft, var(--surface-4))' }}
                  >
                    {results.map((game, idx) => {
                      const winner = getWinner(game)
                      const team1Mascot = getMascotName(game.team1, currentDynasty?.teams || currentDynasty?.customTeams)
                      const team2Mascot = getMascotName(game.team2, currentDynasty?.teams || currentDynasty?.customTeams)
                      const team1Logo = team1Mascot ? getTeamLogo(team1Mascot, currentDynasty?.teams || currentDynasty?.customTeams) : null
                      const team2Logo = team2Mascot ? getTeamLogo(team2Mascot, currentDynasty?.teams || currentDynasty?.customTeams) : null

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
                          className="score-row group flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 rounded-md bg-surface-2 transition-all duration-150"
                          style={{ border: '1px solid transparent' }}
                        >
                          <div
                            className="w-11 sm:w-14 text-center tabular font-display font-black text-sm leading-none flex-shrink-0"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {game.year}
                          </div>

                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            {team1Logo && (
                              <div className="w-6 h-6 rounded-full bg-white p-0.5 flex-shrink-0 transition-transform duration-150 group-hover:scale-110">
                                <img src={team1Logo} alt="" className="w-full h-full object-contain" />
                              </div>
                            )}
                            <span
                              className={`text-xs sm:text-sm font-semibold truncate ${
                                winner === game.team1 ? 'text-txt-primary' : 'text-txt-tertiary'
                              }`}
                            >
                              {getSchoolName(game.team1, currentDynasty?.teams) || game.team1}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 tabular font-display font-black text-sm sm:text-base flex-shrink-0">
                            <span style={winner === game.team1 ? { color: 'var(--text-primary)' } : { color: 'var(--text-tertiary)' }}>
                              {game.team1Score}
                            </span>
                            <span className="text-txt-tertiary font-normal text-xs">–</span>
                            <span style={winner === game.team2 ? { color: 'var(--text-primary)' } : { color: 'var(--text-tertiary)' }}>
                              {game.team2Score}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
                            <span
                              className={`text-xs sm:text-sm font-semibold truncate ${
                                winner === game.team2 ? 'text-txt-primary' : 'text-txt-tertiary'
                              }`}
                            >
                              {getSchoolName(game.team2, currentDynasty?.teams) || game.team2}
                            </span>
                            {team2Logo && (
                              <div className="w-6 h-6 rounded-full bg-white p-0.5 flex-shrink-0 transition-transform duration-150 group-hover:scale-110">
                                <img src={team2Logo} alt="" className="w-full h-full object-contain" />
                              </div>
                            )}
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                )}

                {isExpanded && !hasGames && (
                  <div
                    className="px-3 py-6 text-center expand-body"
                    style={{ borderTop: '1px solid var(--rule-soft, var(--surface-4))' }}
                  >
                    <p
                      className="label-xs text-txt-tertiary"
                      style={{ letterSpacing: '1.5px', fontSize: '10px' }}
                    >
                      NO CHAMPIONSHIP GAMES PLAYED IN THIS CONFERENCE
                    </p>
                  </div>
                )}
              </Card>
            </div>
          )
        })}
      </div>

      {filteredConferences.length === 0 && (
        <Card>
          <EmptyState
            title="No conferences found"
            message={searchQuery ? `No conferences match "${searchQuery}"` : 'No conferences available.'}
          />
        </Card>
      )}

      <style>{`
        @keyframes expand-in {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .expand-body {
          animation: expand-in 250ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .score-row:hover {
          background-color: var(--surface-3);
          border-color: var(--surface-5);
          transform: translateX(2px);
        }
        .cc-card-expanded {
          border-color: var(--surface-5);
        }
        @media (prefers-reduced-motion: reduce) {
          .expand-body { animation: none; }
        }
      `}</style>
    </div>
  )
}
