import { useState, useEffect, useRef } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { useDynasty, GAME_TYPES, detectGameType } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useTeamColors } from '../../hooks/useTeamColors'
import { bowlLogos, getAllBowlNames } from '../../data/bowlLogos'
import { getTeamLogo, getMascotName as getMascotNameFromTeams, getSchoolName } from '../../data/teams'
import { getSlotIdFromBowlName, getCFPGameId } from '../../data/cfpConstants'
import { TEAMS, getGameTeamInfo } from '../../data/teamRegistry'
import BowlHistoryEditModal from '../../components/BowlHistoryEditModal'
import { PageHero, Card, Button, EmptyState, Input } from '../../components/ui'

// Map abbreviation to mascot name for logo lookup
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

export default function BowlHistory() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const { currentDynasty, isViewOnly } = useDynasty()
  const pathPrefix = usePathPrefix()
  const teamColors = useTeamColors(currentDynasty?.teamName, currentDynasty?.teams || currentDynasty?.customTeams)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedBowl, setExpandedBowl] = useState(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const bowlRefs = useRef({})

  useEffect(() => {
    const bowlFromUrl = searchParams.get('bowl')
    if (bowlFromUrl) {
      setExpandedBowl(bowlFromUrl)
      setTimeout(() => {
        const element = bowlRefs.current[bowlFromUrl]
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }, 100)
    }
  }, [searchParams])

  if (!currentDynasty) return null

  const allBowls = getAllBowlNames()

  const filteredBowls = allBowls.filter(bowl => {
    if (searchQuery === '') return true
    return bowl.toLowerCase().includes(searchQuery.toLowerCase())
  })

  // UNIFIED: Read from games[] array using gameType
  const getBowlResults = (bowlName) => {
    const results = []
    const games = currentDynasty.games || []

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
        gameRef: game
      })
    })

    // Legacy fallback sources
    const bowlGamesByYear = currentDynasty.bowlGamesByYear || {}
    Object.entries(bowlGamesByYear).forEach(([year, yearData]) => {
      if (results.some(r => r.year === parseInt(year) && r.bowlName === bowlName)) return

      const week1Games = yearData?.week1 || []
      const week1Match = week1Games.find(g => g && g.bowlName === bowlName)
      if (week1Match && week1Match.team1 && week1Match.team2 && week1Match.team1Score != null) {
        results.push({ year: parseInt(year), ...week1Match, week: 'week1' })
      }

      const week2Games = yearData?.week2 || []
      const week2Match = week2Games.find(g => g && g.bowlName === bowlName)
      if (week2Match && week2Match.team1 && week2Match.team2 && week2Match.team1Score != null) {
        results.push({ year: parseInt(year), ...week2Match, week: 'week2' })
      }
    })

    const cfpResultsByYear = currentDynasty.cfpResultsByYear || {}
    Object.entries(cfpResultsByYear).forEach(([year, yearData]) => {
      if (results.some(r => r.year === parseInt(year) && r.bowlName === bowlName)) return

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

    return results.sort((a, b) => b.year - a.year)
  }

  const getWinner = (game) => {
    if (!game.team1Score && game.team1Score !== 0) return null
    if (!game.team2Score && game.team2Score !== 0) return null
    return game.team1Score > game.team2Score ? game.team1 : game.team2
  }

  // User team identity for highlighting bowl wins. tid is the stable id;
  // we keep abbr around for legacy bowl rows that only carry abbreviations.
  const userTid = currentDynasty.currentTid != null ? Number(currentDynasty.currentTid) : null
  const userTeamData = userTid != null
    ? (currentDynasty?.teams?.[userTid] || currentDynasty?.customTeams?.[userTid] || TEAMS[userTid])
    : null
  const userAbbr = userTeamData?.abbr?.toUpperCase() || null

  const isUserTeamRef = (game, side) => {
    const ref = side === 1 ? game.team1Tid : game.team2Tid
    if (ref != null && userTid != null && Number(ref) === userTid) return true
    const abbr = side === 1 ? game.team1 : game.team2
    if (abbr && userAbbr && abbr.toUpperCase() === userAbbr) return true
    return false
  }

  return (
    <div className="space-y-4 page-enter">
      <PageHero
        title="Bowl History"
        actions={
          !isViewOnly && (
            <Button variant="secondary" size="sm" onClick={() => setShowEditModal(true)}>
              Edit
            </Button>
          )
        }
      >
        <div className="max-w-md">
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search bowl games..."
          />
          {searchQuery && (
            <div
              className="mt-2 label-xs text-txt-tertiary"
              style={{ letterSpacing: '1.5px', fontSize: '10px' }}
            >
              {filteredBowls.length} BOWL{filteredBowls.length !== 1 ? 'S' : ''} FOUND
            </div>
          )}
        </div>
      </PageHero>

      <div className="space-y-2">
        {filteredBowls.map(bowlName => {
          const logo = bowlLogos[bowlName]
          const results = getBowlResults(bowlName)
          const isExpanded = expandedBowl === bowlName
          const hasGames = results.length > 0

          return (
            <div
              key={bowlName}
              ref={el => (bowlRefs.current[bowlName] = el)}
              style={{ scrollMarginTop: '100px' }}
            >
              <Card
                padding="none"
                className={`bowl-card relative overflow-hidden transition-all duration-200 ${
                  isExpanded ? 'bowl-card-expanded' : ''
                }`}
              >
                <button
                  onClick={() => setExpandedBowl(isExpanded ? null : bowlName)}
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
                    {logo && (
                      <img src={logo} alt="" className="w-full h-full object-contain" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div
                      className="label-xs text-txt-tertiary mb-0.5"
                      style={{ letterSpacing: '1.5px', fontSize: '9px' }}
                    >
                      BOWL GAME
                    </div>
                    <div className="font-display font-bold text-txt-primary truncate text-base leading-tight">
                      {bowlName}
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
                    style={{ borderTop: '1px solid var(--surface-4)' }}
                  >
                    {results.map((game, idx) => {
                      const winner = getWinner(game)
                      const team1Mascot = getMascotName(game.team1, currentDynasty?.teams || currentDynasty?.customTeams)
                      const team2Mascot = getMascotName(game.team2, currentDynasty?.teams || currentDynasty?.customTeams)
                      const team1Logo = team1Mascot ? getTeamLogo(team1Mascot, currentDynasty?.teams || currentDynasty?.customTeams) : null
                      const team2Logo = team2Mascot ? getTeamLogo(team2Mascot, currentDynasty?.teams || currentDynasty?.customTeams) : null

                      const userIsTeam1 = isUserTeamRef(game, 1)
                      const userIsTeam2 = isUserTeamRef(game, 2)
                      const userPlayed = userIsTeam1 || userIsTeam2
                      const userWon = userPlayed && (
                        (userIsTeam1 && winner === game.team1) ||
                        (userIsTeam2 && winner === game.team2)
                      )

                      const gameBowlName = game.bowlName || bowlName
                      const bowlSlug = gameBowlName.toLowerCase().replace(/\s+/g, '-')
                      let gameId
                      if (game.gameRef?.id) {
                        gameId = game.gameRef.id
                      } else if (game.cfpSlot) {
                        gameId = getCFPGameId(game.cfpSlot, game.year)
                      } else if (game.isCFP) {
                        const slotId = getSlotIdFromBowlName(gameBowlName)
                        gameId = slotId ? getCFPGameId(slotId, game.year) : `bowl-${game.year}-${bowlSlug}`
                      } else {
                        gameId = `bowl-${game.year}-${bowlSlug}`
                      }

                      return (
                        <Link
                          key={`${game.year}-${idx}`}
                          to={`${pathPrefix}/game/${gameId}`}
                          className={`score-row group flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 rounded-md transition-all duration-150 ${
                            userWon ? 'score-row--gold' : ''
                          }`}
                          style={{
                            border: userWon
                              ? '1px solid color-mix(in srgb, #d4a44a 35%, transparent)'
                              : '1px solid transparent',
                            backgroundColor: userWon
                              ? 'color-mix(in srgb, #d4a44a 7%, var(--surface-2))'
                              : 'var(--surface-2)',
                          }}
                        >
                          <div
                            className="w-11 sm:w-14 text-center tabular font-display font-black text-sm leading-none flex-shrink-0 flex flex-col items-center gap-0.5"
                            style={{ color: userWon ? '#e0b566' : 'var(--text-secondary)' }}
                          >
                            <span>{game.year}</span>
                            {userWon && (
                              <span
                                className="label-xs"
                                style={{
                                  fontSize: '8px',
                                  letterSpacing: '1.5px',
                                  fontWeight: 700,
                                  color: '#d4a44a',
                                }}
                              >
                                WON
                              </span>
                            )}
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
                    style={{ borderTop: '1px solid var(--surface-4)' }}
                  >
                    <p
                      className="label-xs text-txt-tertiary"
                      style={{ letterSpacing: '1.5px', fontSize: '10px' }}
                    >
                      NO GAMES HAVE BEEN PLAYED IN THIS BOWL
                    </p>
                  </div>
                )}
              </Card>
            </div>
          )
        })}
      </div>

      {filteredBowls.length === 0 && (
        <Card>
          <EmptyState
            title="No bowls found"
            message={searchQuery ? `No bowls match "${searchQuery}"` : 'No bowls available.'}
          />
        </Card>
      )}

      <BowlHistoryEditModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        teamColors={teamColors}
      />

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
        .score-row--gold:hover {
          background-color: color-mix(in srgb, #d4a44a 12%, var(--surface-3)) !important;
          border-color: color-mix(in srgb, #d4a44a 55%, transparent) !important;
        }
        .bowl-card-expanded {
          border-color: var(--surface-5);
        }
        @media (prefers-reduced-motion: reduce) {
          .expand-body { animation: none; }
        }
      `}</style>
    </div>
  )
}
