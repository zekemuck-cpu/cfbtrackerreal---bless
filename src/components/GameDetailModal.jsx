import { Link } from 'react-router-dom'
import { getTeamLogo, getMascotName as getMascotNameFromTeams } from '../data/teams'
import { teamAbbreviations } from '../data/teamAbbreviations'
import { getTeamColors } from '../data/teamColors'
import { getContrastTextColor } from '../utils/colorUtils'
import { useDynasty, getUserGamePerspective, getRecordAsOfGame } from '../context/DynastyContext'
import { TEAMS, resolveTid, getGameTeamInfo, getAbbrFromTeamName } from '../data/teamRegistry'
import { getBowlLogo } from '../data/bowlLogos'
import { getConferenceLogo } from '../data/conferenceLogos'
import { getTeamConference } from '../data/conferenceTeams'

export default function GameDetailModal({ isOpen, onClose, game, userTeam, teamColors, onEdit }) {
  const { currentDynasty } = useDynasty()

  if (!isOpen || !game) return null

  // Get teams reference for tid lookups
  const teams = currentDynasty?.teams || TEAMS

  // Get perspective for this game (if user was coaching)
  const perspective = getUserGamePerspective(game, currentDynasty)

  // Helper to get team info from tid or abbr
  const getTeamInfoFromGame = () => {
    // Check for unified format first
    if (game.team1Tid && game.team2Tid) {
      const t1Info = getGameTeamInfo(teams, game.team1Tid)
      const t2Info = getGameTeamInfo(teams, game.team2Tid)
      return {
        team1Abbr: t1Info?.abbr || game.team1,
        team2Abbr: t2Info?.abbr || game.team2,
        team1Score: game.team1Score,
        team2Score: game.team2Score,
        team1Name: t1Info?.name,
        team2Name: t2Info?.name
      }
    }
    return null
  }

  const unifiedInfo = getTeamInfoFromGame()

  // Check if this is a CPU vs CPU game
  // CPU games are identified by having team1/team2 but no perspective (user wasn't coaching either team)
  const hasUnifiedFormat = game.team1Tid && game.team2Tid
  const isCPUGame = !!game.viewingTeam || (!perspective && (hasUnifiedFormat || (!game.userTeam && game.team1 && game.team2)))
  const displayTeam = isCPUGame ? game.viewingTeam : userTeam
  const displayTeamAbbr = isCPUGame ? game.viewingTeamAbbr : getAbbrFromTeamName(userTeam)

  // Get the user's team conference - fallback computation if not stored in game
  const userTeamAbbr = getAbbrFromTeamName(userTeam)
  const computedConference = userTeamAbbr ? getTeamConference(userTeamAbbr) : null

  // Helper to find player PID by name
  const getPlayerPID = (playerName) => {
    const player = currentDynasty?.players?.find(p => p.name === playerName)
    return player?.pid
  }

  // Get opponent info using perspective or fallback to old fields
  const getOpponentAbbr = () => {
    if (perspective?.opponentTid) {
      const oppInfo = getGameTeamInfo(teams, perspective.opponentTid)
      return oppInfo?.abbr || game.opponent
    }
    if (unifiedInfo) {
      // For unified format without perspective, use team2 as default opponent
      return unifiedInfo.team2Abbr
    }
    return game.opponent
  }

  const opponentAbbrResolved = getOpponentAbbr()
  const opponentTeamInfo = teamAbbreviations[opponentAbbrResolved]
  // First try to get mascot from abbreviation, if that fails check if opponent IS a mascot name
  let opponentMascot = getMascotName(opponentAbbrResolved)
  let opponentLogo = opponentMascot ? getTeamLogo(opponentMascot) : null

  // If no mascot found by abbreviation, try using opponent directly as mascot name
  if (!opponentLogo) {
    opponentLogo = getTeamLogo(opponentAbbrResolved)
    if (opponentLogo) {
      opponentMascot = opponentAbbrResolved
    }
  }

  // Also try getting abbreviation from display name for colors
  const opponentAbbr = opponentMascot ? getAbbrFromTeamName(opponentMascot) : opponentAbbrResolved
  const opponentColors = opponentMascot ? getTeamColors(opponentMascot) : { primary: '#666', secondary: '#fff' }

  // Get display team info (user's team or viewing team for CPU games)
  const displayTeamLogo = getTeamLogo(displayTeam)
  const displayTeamColors = isCPUGame
    ? (getMascotName(displayTeamAbbr) ? getTeamColors(getMascotName(displayTeamAbbr)) : teamColors)
    : teamColors

  // Get user team ratings
  const userRatings = currentDynasty?.teamRatings || {}

  // Get user's record as of this game using centralized single-source-of-truth
  const userRecord = (() => {
    if (isCPUGame || !perspective) return { overall: '', conference: '' }
    return getRecordAsOfGame(currentDynasty, game, perspective.userTid)
  })()

  // Calculate opponent's record after this game
  const calculateOpponentRecord = () => {
    if (!game.opponentRecord) return null

    // Parse the opponent's record: "5-2 (3-1)" format
    const recordMatch = game.opponentRecord.match(/(\d+)-(\d+)\s*(?:\((\d+)-(\d+)\))?/)
    if (!recordMatch) return game.opponentRecord

    let overallWins = parseInt(recordMatch[1])
    let overallLosses = parseInt(recordMatch[2])
    let confWins = recordMatch[3] ? parseInt(recordMatch[3]) : null
    let confLosses = recordMatch[4] ? parseInt(recordMatch[4]) : null

    // Update record based on game result - use perspective if available
    const userWonThisGame = perspective?.userWon ?? (game.result === 'win')
    if (userWonThisGame) {
      // User won, so opponent lost
      overallLosses += 1
      if (game.isConferenceGame && confLosses !== null) {
        confLosses += 1
      }
    } else {
      // User lost, so opponent won
      overallWins += 1
      if (game.isConferenceGame && confWins !== null) {
        confWins += 1
      }
    }

    // Format the updated record
    let updatedRecord = `${overallWins}-${overallLosses}`
    if (confWins !== null && confLosses !== null) {
      updatedRecord += ` (${confWins}-${confLosses})`
    }

    return updatedRecord
  }

  const opponentRecord = calculateOpponentRecord()

  // Check if this is a scheduled (not yet played) game
  const isScheduledGame = game.scheduled === true

  // Determine winner/loser styling - use perspective if available
  const userWon = perspective?.userWon ?? (game.result === 'win')
  const userScore = perspective?.userScore ?? game.teamScore ?? (unifiedInfo?.team1Score)
  const opponentScore = perspective?.opponentScore ?? game.opponentScore ?? (unifiedInfo?.team2Score)

  // Determine which team goes on which side
  const leftTeam = game.location === 'home' ? 'opponent' : 'user'
  const rightTeam = game.location === 'home' ? 'user' : 'opponent'

  // Helper function to render a team
  const renderTeam = (side) => {
    const isDisplayTeam = side === 'user'
    const teamName = isDisplayTeam ? displayTeam : (opponentMascot || game.opponent)
    const logo = isDisplayTeam ? displayTeamLogo : opponentLogo
    const colors = isDisplayTeam ? displayTeamColors : opponentColors
    const rank = isDisplayTeam ? game.userRank : game.opponentRank
    const score = isDisplayTeam ? userScore : opponentScore
    const isWinner = isDisplayTeam ? userWon : !userWon

    // Get team abbreviation for linking
    const teamAbbr = isDisplayTeam ? displayTeamAbbr : game.opponent
    const teamLink = `/dynasty/${currentDynasty?.id}/team/${resolveTid(teamAbbr, currentDynasty?.teams || TEAMS)}/${game.year}`

    // For user's team, show record. For CPU games, don't show record
    let recordDisplay = null
    if (isDisplayTeam && !isCPUGame && userRecord.overall) {
      recordDisplay = `${userRecord.overall} (${userRecord.conference})`
    } else if (!isDisplayTeam && opponentRecord) {
      recordDisplay = opponentRecord
    }

    return (
      <div className="flex-1 text-center min-w-0">
        <Link
          to={teamLink}
          onClick={onClose}
          className="w-16 h-16 sm:w-24 sm:h-24 md:w-32 md:h-32 mx-auto flex items-center justify-center mb-2 sm:mb-4 hover:scale-105 transition-transform"
        >
          {logo && (
            <img
              src={logo}
              alt={`${teamName} logo`}
              className="w-full h-full object-contain"
            />
          )}
        </Link>
        <Link
          to={teamLink}
          onClick={onClose}
          className="text-sm sm:text-lg md:text-2xl font-bold mb-1 sm:mb-2 hover:underline block truncate px-1"
          style={{ color: colors.primary }}
        >
          {teamName}
        </Link>
        {rank && (
          <div className="text-xs sm:text-sm font-semibold text-gray-600 mb-1 sm:mb-2">
            #{rank}
          </div>
        )}
        {recordDisplay && (
          <div className="text-xs sm:text-sm font-medium text-gray-500 mb-1 sm:mb-2">
            {recordDisplay}
          </div>
        )}
        {isScheduledGame ? (
          <div className="text-3xl sm:text-4xl md:text-6xl font-bold text-gray-300">
            -
          </div>
        ) : (
          <div
            className={`text-3xl sm:text-4xl md:text-6xl font-bold ${isWinner ? 'text-green-600' : 'text-gray-400'}`}
          >
            {score}
          </div>
        )}
      </div>
    )
  }

  // Parse links
  const parseLinks = (linksString) => {
    if (!linksString) return []
    return linksString.split(',').map(link => link.trim()).filter(link => link)
  }

  const links = parseLinks(game.links)

  // Check if link is YouTube
  const isYouTubeLink = (url) => {
    return url.includes('youtube.com') || url.includes('youtu.be')
  }

  // Get YouTube embed URL
  const getYouTubeEmbedUrl = (url) => {
    const videoIdMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/)
    if (videoIdMatch) {
      return `https://www.youtube.com/embed/${videoIdMatch[1]}`
    }
    return null
  }

  // Check if link is an image
  const isImageLink = (url) => {
    return /\.(jpg|jpeg|png|gif|webp)$/i.test(url) || url.includes('imgur.com')
  }

  // Map abbreviations to mascot names for logo lookup
  function getMascotName(abbr) {
    // Try tid-based lookup first
    const result = getMascotNameFromTeams(abbr, teams)
    if (result) return result
    const mascotMap = {
      'AFA': 'Air Force Falcons', 'AKR': 'Akron Zips', 'BAMA': 'Alabama Crimson Tide',
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
      'GSU': 'Georgia State Panthers', 'USM': 'Southern Mississippi Golden Eagles',
      // FCS teams
      'FCSE': 'FCS East Judicials', 'FCSM': 'FCS Midwest Rebels',
      'FCSN': 'FCS Northwest Stallions', 'FCSW': 'FCS West Titans'
    }
    return mascotMap[abbr] || null
  }

  return (
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4"
      style={{ margin: 0 }}
      onMouseDown={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[calc(100vh-4rem)] sm:max-h-[90vh] overflow-y-auto relative"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="sticky top-0 z-10 p-3 sm:p-6 rounded-t-xl"
          style={{
            backgroundColor: displayTeamColors.primary
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
              {/* Bowl Logo - check both gameTitle and bowlName */}
              {(() => {
                const bowlNameForLogo = game.bowlName || game.gameTitle
                const bowlLogo = bowlNameForLogo ? getBowlLogo(bowlNameForLogo) : null
                return bowlLogo ? (
                  <div className="w-10 h-10 sm:w-16 sm:h-16 flex-shrink-0 bg-white rounded-lg p-1 flex items-center justify-center">
                    <img
                      src={bowlLogo}
                      alt={`${bowlNameForLogo} logo`}
                      className="w-full h-full object-contain"
                    />
                  </div>
                ) : null
              })()}
              {/* Conference Logo for Championship Games */}
              {game.isConferenceChampionship && (() => {
                const confName = game.conference || currentDynasty?.conference || computedConference
                const confLogo = confName ? getConferenceLogo(confName) : null
                return confLogo ? (
                  <div className="w-10 h-10 sm:w-16 sm:h-16 flex-shrink-0 bg-white rounded-lg p-1 flex items-center justify-center">
                    <img
                      src={confLogo}
                      alt={`${confName} logo`}
                      className="w-full h-full object-contain"
                    />
                  </div>
                ) : null
              })()}
              <div className="text-white min-w-0">
                {game.isConferenceChampionship || game.isBowlGame || game.isPlayoff ? (
                  <div className="text-base sm:text-2xl font-bold truncate">
                    {game.year} {game.isConferenceChampionship
                      ? `${game.conference || currentDynasty?.conference || computedConference || ''} Championship Game`
                      : (game.bowlName || game.gameTitle || '')}
                  </div>
                ) : (
                  <>
                    <div className="text-xs sm:text-sm font-medium opacity-90">
                      {game.year} • {typeof game.week === 'number' ? `Week ${game.week}` : game.week}
                    </div>
                    <div className="text-base sm:text-2xl font-bold mt-0.5 sm:mt-1">
                      {isScheduledGame ? 'Scheduled Game' : (game.gameTitle || 'Game Recap')}
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              {onEdit && (
                <button
                  onClick={() => onEdit(game)}
                  className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-1.5 sm:p-2 transition-colors"
                  title="Edit Game"
                >
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              )}
              <button
                onClick={onClose}
                className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-1.5 sm:p-2 transition-colors"
                title="Close"
              >
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="p-4 sm:p-8">
          {/* Teams and Score */}
          <div className="flex items-center justify-between gap-2 sm:gap-8">
            {/* Left Team (Away) */}
            {renderTeam(leftTeam)}

            {/* VS Divider */}
            <div className="text-lg sm:text-2xl font-bold text-gray-400 flex-shrink-0">
              VS
            </div>

            {/* Right Team (Home) */}
            {renderTeam(rightTeam)}
          </div>

          {/* Quarter by Quarter Scores */}
          {game.quarters && (
            <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-gray-200">
              <h4 className="text-base sm:text-lg font-bold text-gray-800 mb-3 sm:mb-4">Scoring Summary</h4>
              <div className="bg-gray-50 rounded-lg p-2 sm:p-4 overflow-x-auto">
                <div className="min-w-[300px]">
                  {/* Header Row */}
                  <div className="grid gap-1 sm:gap-2" style={{ gridTemplateColumns: `minmax(60px, 100px) repeat(${4 + (game.overtimes?.length || 0)}, minmax(28px, 1fr)) minmax(40px, 60px)` }}>
                    <div className="text-xs sm:text-sm font-semibold text-gray-600"></div>
                    <div className="text-xs sm:text-sm font-semibold text-gray-600 text-center">Q1</div>
                    <div className="text-xs sm:text-sm font-semibold text-gray-600 text-center">Q2</div>
                    <div className="text-xs sm:text-sm font-semibold text-gray-600 text-center">Q3</div>
                    <div className="text-xs sm:text-sm font-semibold text-gray-600 text-center">Q4</div>
                    {game.overtimes?.map((_, i) => (
                      <div key={i} className="text-xs sm:text-sm font-semibold text-gray-600 text-center">
                        OT{i + 1}
                      </div>
                    ))}
                    <div className="text-xs sm:text-sm font-semibold text-gray-600 text-center">Final</div>
                  </div>

                  {/* Away Team Row (top) */}
                  {game.location === 'home' ? (
                    // User is home, so opponent (away) is on top
                    <div className="grid gap-1 sm:gap-2 mt-2" style={{ gridTemplateColumns: `minmax(60px, 100px) repeat(${4 + (game.overtimes?.length || 0)}, minmax(28px, 1fr)) minmax(40px, 60px)` }}>
                      <div className="text-xs sm:text-sm font-semibold truncate" style={{ color: opponentColors.primary }}>
                        {opponentMascot || game.opponent}
                      </div>
                      {['Q1', 'Q2', 'Q3', 'Q4'].map(q => (
                        <div key={q} className="text-xs sm:text-sm text-center font-medium text-gray-700 bg-white rounded px-1 sm:px-2 py-1">
                          {game.quarters.opponent[q] === '' || game.quarters.opponent[q] === null || game.quarters.opponent[q] === undefined ? '0' : game.quarters.opponent[q]}
                        </div>
                      ))}
                      {game.overtimes?.map((ot, i) => (
                        <div key={i} className="text-xs sm:text-sm text-center font-medium text-gray-700 bg-white rounded px-1 sm:px-2 py-1">
                          {ot.opponent === '' || ot.opponent === null || ot.opponent === undefined ? '0' : ot.opponent}
                        </div>
                      ))}
                      <div className="text-sm sm:text-lg text-center font-bold rounded px-1 sm:px-2 py-1" style={{
                        backgroundColor: !userWon ? '#22c55e20' : 'white',
                        color: !userWon ? '#22c55e' : '#6b7280'
                      }}>
                        {opponentScore}
                      </div>
                    </div>
                  ) : (
                    // User is away, so user is on top
                    <div className="grid gap-1 sm:gap-2 mt-2" style={{ gridTemplateColumns: `minmax(60px, 100px) repeat(${4 + (game.overtimes?.length || 0)}, minmax(28px, 1fr)) minmax(40px, 60px)` }}>
                      <div className="text-xs sm:text-sm font-semibold truncate" style={{ color: teamColors.primary }}>
                        {userTeam}
                      </div>
                      {['Q1', 'Q2', 'Q3', 'Q4'].map(q => (
                        <div key={q} className="text-xs sm:text-sm text-center font-medium text-gray-700 bg-white rounded px-1 sm:px-2 py-1">
                          {game.quarters.team[q] === '' || game.quarters.team[q] === null || game.quarters.team[q] === undefined ? '0' : game.quarters.team[q]}
                        </div>
                      ))}
                      {game.overtimes?.map((ot, i) => (
                        <div key={i} className="text-xs sm:text-sm text-center font-medium text-gray-700 bg-white rounded px-1 sm:px-2 py-1">
                          {ot.team === '' || ot.team === null || ot.team === undefined ? '0' : ot.team}
                        </div>
                      ))}
                      <div className="text-sm sm:text-lg text-center font-bold rounded px-1 sm:px-2 py-1" style={{
                        backgroundColor: userWon ? '#22c55e20' : 'white',
                        color: userWon ? '#22c55e' : '#6b7280'
                      }}>
                        {userScore}
                      </div>
                    </div>
                  )}

                  {/* Home Team Row (bottom) */}
                  {game.location === 'home' ? (
                    // User is home, so user is on bottom
                    <div className="grid gap-1 sm:gap-2 mt-2" style={{ gridTemplateColumns: `minmax(60px, 100px) repeat(${4 + (game.overtimes?.length || 0)}, minmax(28px, 1fr)) minmax(40px, 60px)` }}>
                      <div className="text-xs sm:text-sm font-semibold truncate" style={{ color: teamColors.primary }}>
                        {userTeam}
                      </div>
                      {['Q1', 'Q2', 'Q3', 'Q4'].map(q => (
                        <div key={q} className="text-xs sm:text-sm text-center font-medium text-gray-700 bg-white rounded px-1 sm:px-2 py-1">
                          {game.quarters.team[q] === '' || game.quarters.team[q] === null || game.quarters.team[q] === undefined ? '0' : game.quarters.team[q]}
                        </div>
                      ))}
                      {game.overtimes?.map((ot, i) => (
                        <div key={i} className="text-xs sm:text-sm text-center font-medium text-gray-700 bg-white rounded px-1 sm:px-2 py-1">
                          {ot.team === '' || ot.team === null || ot.team === undefined ? '0' : ot.team}
                        </div>
                      ))}
                      <div className="text-sm sm:text-lg text-center font-bold rounded px-1 sm:px-2 py-1" style={{
                        backgroundColor: userWon ? '#22c55e20' : 'white',
                        color: userWon ? '#22c55e' : '#6b7280'
                      }}>
                        {userScore}
                      </div>
                    </div>
                  ) : (
                    // User is away, so opponent (home) is on bottom
                    <div className="grid gap-1 sm:gap-2 mt-2" style={{ gridTemplateColumns: `minmax(60px, 100px) repeat(${4 + (game.overtimes?.length || 0)}, minmax(28px, 1fr)) minmax(40px, 60px)` }}>
                      <div className="text-xs sm:text-sm font-semibold truncate" style={{ color: opponentColors.primary }}>
                        {opponentMascot || game.opponent}
                      </div>
                      {['Q1', 'Q2', 'Q3', 'Q4'].map(q => (
                        <div key={q} className="text-xs sm:text-sm text-center font-medium text-gray-700 bg-white rounded px-1 sm:px-2 py-1">
                          {game.quarters.opponent[q] === '' || game.quarters.opponent[q] === null || game.quarters.opponent[q] === undefined ? '0' : game.quarters.opponent[q]}
                        </div>
                      ))}
                      {game.overtimes?.map((ot, i) => (
                        <div key={i} className="text-xs sm:text-sm text-center font-medium text-gray-700 bg-white rounded px-1 sm:px-2 py-1">
                          {ot.opponent === '' || ot.opponent === null || ot.opponent === undefined ? '0' : ot.opponent}
                        </div>
                      ))}
                      <div className="text-sm sm:text-lg text-center font-bold rounded px-1 sm:px-2 py-1" style={{
                        backgroundColor: !userWon ? '#22c55e20' : 'white',
                        color: !userWon ? '#22c55e' : '#6b7280'
                      }}>
                        {opponentScore}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Team Ratings Comparison - only for user's games, not CPU vs CPU */}
          {!isCPUGame && (userRatings.overall || game.opponentOverall) && (
            <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-gray-200">
              <h4 className="text-base sm:text-lg font-bold text-gray-800 mb-3 sm:mb-4">Team Ratings</h4>
              <div className="grid grid-cols-2 gap-2 sm:gap-6">
                {/* Left Team (Away) Ratings */}
                {leftTeam === 'user' ? (
                  <div className="bg-gray-50 rounded-lg p-2 sm:p-4">
                    <div className="text-xs sm:text-sm font-semibold text-gray-600 mb-2 sm:mb-3 text-center truncate">
                      {displayTeam}
                    </div>
                    <div className="space-y-1 sm:space-y-2">
                      {userRatings.overall && (
                        <div className="flex justify-between items-center">
                          <span className="text-xs sm:text-sm text-gray-600">Overall</span>
                          <span className="font-bold text-sm sm:text-lg" style={{ color: displayTeamColors.primary }}>
                            {userRatings.overall}
                          </span>
                        </div>
                      )}
                      {userRatings.offense && (
                        <div className="flex justify-between items-center">
                          <span className="text-xs sm:text-sm text-gray-600">Offense</span>
                          <span className="font-bold text-sm sm:text-lg" style={{ color: displayTeamColors.primary }}>
                            {userRatings.offense}
                          </span>
                        </div>
                      )}
                      {userRatings.defense && (
                        <div className="flex justify-between items-center">
                          <span className="text-xs sm:text-sm text-gray-600">Defense</span>
                          <span className="font-bold text-sm sm:text-lg" style={{ color: displayTeamColors.primary }}>
                            {userRatings.defense}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-lg p-2 sm:p-4">
                    <div className="text-xs sm:text-sm font-semibold text-gray-600 mb-2 sm:mb-3 text-center truncate">
                      {opponentMascot || game.opponent}
                    </div>
                    <div className="space-y-1 sm:space-y-2">
                      {game.opponentOverall && (
                        <div className="flex justify-between items-center">
                          <span className="text-xs sm:text-sm text-gray-600">Overall</span>
                          <span className="font-bold text-sm sm:text-lg" style={{ color: opponentColors.primary }}>
                            {game.opponentOverall}
                          </span>
                        </div>
                      )}
                      {game.opponentOffense && (
                        <div className="flex justify-between items-center">
                          <span className="text-xs sm:text-sm text-gray-600">Offense</span>
                          <span className="font-bold text-sm sm:text-lg" style={{ color: opponentColors.primary }}>
                            {game.opponentOffense}
                          </span>
                        </div>
                      )}
                      {game.opponentDefense && (
                        <div className="flex justify-between items-center">
                          <span className="text-xs sm:text-sm text-gray-600">Defense</span>
                          <span className="font-bold text-sm sm:text-lg" style={{ color: opponentColors.primary }}>
                            {game.opponentDefense}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Right Team (Home) Ratings */}
                {rightTeam === 'user' ? (
                  <div className="bg-gray-50 rounded-lg p-2 sm:p-4">
                    <div className="text-xs sm:text-sm font-semibold text-gray-600 mb-2 sm:mb-3 text-center truncate">
                      {displayTeam}
                    </div>
                    <div className="space-y-1 sm:space-y-2">
                      {userRatings.overall && (
                        <div className="flex justify-between items-center">
                          <span className="text-xs sm:text-sm text-gray-600">Overall</span>
                          <span className="font-bold text-sm sm:text-lg" style={{ color: displayTeamColors.primary }}>
                            {userRatings.overall}
                          </span>
                        </div>
                      )}
                      {userRatings.offense && (
                        <div className="flex justify-between items-center">
                          <span className="text-xs sm:text-sm text-gray-600">Offense</span>
                          <span className="font-bold text-sm sm:text-lg" style={{ color: displayTeamColors.primary }}>
                            {userRatings.offense}
                          </span>
                        </div>
                      )}
                      {userRatings.defense && (
                        <div className="flex justify-between items-center">
                          <span className="text-xs sm:text-sm text-gray-600">Defense</span>
                          <span className="font-bold text-sm sm:text-lg" style={{ color: displayTeamColors.primary }}>
                            {userRatings.defense}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-lg p-2 sm:p-4">
                    <div className="text-xs sm:text-sm font-semibold text-gray-600 mb-2 sm:mb-3 text-center truncate">
                      {opponentMascot || game.opponent}
                    </div>
                    <div className="space-y-1 sm:space-y-2">
                      {game.opponentOverall && (
                        <div className="flex justify-between items-center">
                          <span className="text-xs sm:text-sm text-gray-600">Overall</span>
                          <span className="font-bold text-sm sm:text-lg" style={{ color: opponentColors.primary }}>
                            {game.opponentOverall}
                          </span>
                        </div>
                      )}
                      {game.opponentOffense && (
                        <div className="flex justify-between items-center">
                          <span className="text-xs sm:text-sm text-gray-600">Offense</span>
                          <span className="font-bold text-sm sm:text-lg" style={{ color: opponentColors.primary }}>
                            {game.opponentOffense}
                          </span>
                        </div>
                      )}
                      {game.opponentDefense && (
                        <div className="flex justify-between items-center">
                          <span className="text-xs sm:text-sm text-gray-600">Defense</span>
                          <span className="font-bold text-sm sm:text-lg" style={{ color: opponentColors.primary }}>
                            {game.opponentDefense}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Player of the Week Honors */}
          {(game.conferencePOW || game.confDefensePOW || game.nationalPOW || game.natlDefensePOW) && (
            <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-gray-200">
              <h4 className="text-base sm:text-lg font-bold text-gray-800 mb-3 sm:mb-4">Player of the Week Honors</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
                {/* Conference POW Section */}
                {(game.conferencePOW || game.confDefensePOW) && (
                  <div
                    className="rounded-lg p-3 sm:p-4 border-2"
                    style={{
                      backgroundColor: `${teamColors.primary}10`,
                      borderColor: teamColors.primary
                    }}
                  >
                    <div className="text-xs sm:text-sm font-semibold text-gray-600 mb-2">
                      Conference Player of the Week
                    </div>
                    <div className="space-y-2">
                      {game.conferencePOW && (
                        <div>
                          <div className="text-[10px] text-gray-500 uppercase">Offensive</div>
                          {getPlayerPID(game.conferencePOW) ? (
                            <Link
                              to={`/dynasty/${currentDynasty.id}/player/${getPlayerPID(game.conferencePOW)}`}
                              className="text-sm sm:text-base font-bold hover:underline truncate block"
                              style={{ color: teamColors.primary }}
                            >
                              {game.conferencePOW}
                            </Link>
                          ) : (
                            <div className="text-sm sm:text-base font-bold truncate" style={{ color: teamColors.primary }}>
                              {game.conferencePOW}
                            </div>
                          )}
                        </div>
                      )}
                      {game.confDefensePOW && (
                        <div>
                          <div className="text-[10px] text-gray-500 uppercase">Defensive</div>
                          {getPlayerPID(game.confDefensePOW) ? (
                            <Link
                              to={`/dynasty/${currentDynasty.id}/player/${getPlayerPID(game.confDefensePOW)}`}
                              className="text-sm sm:text-base font-bold hover:underline truncate block"
                              style={{ color: teamColors.secondary }}
                            >
                              {game.confDefensePOW}
                            </Link>
                          ) : (
                            <div className="text-sm sm:text-base font-bold truncate" style={{ color: teamColors.secondary }}>
                              {game.confDefensePOW}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {/* National POW Section */}
                {(game.nationalPOW || game.natlDefensePOW) && (
                  <div
                    className="rounded-lg p-3 sm:p-4 border-2"
                    style={{
                      backgroundColor: '#fef3c710',
                      borderColor: '#fbbf24'
                    }}
                  >
                    <div className="text-xs sm:text-sm font-semibold text-gray-600 mb-2">
                      National Player of the Week
                    </div>
                    <div className="space-y-2">
                      {game.nationalPOW && (
                        <div>
                          <div className="text-[10px] text-gray-500 uppercase">Offensive</div>
                          {getPlayerPID(game.nationalPOW) ? (
                            <Link
                              to={`/dynasty/${currentDynasty.id}/player/${getPlayerPID(game.nationalPOW)}`}
                              className="text-sm sm:text-base font-bold hover:underline truncate block"
                              style={{ color: '#d97706' }}
                            >
                              {game.nationalPOW}
                            </Link>
                          ) : (
                            <div className="text-sm sm:text-base font-bold truncate" style={{ color: '#d97706' }}>
                              {game.nationalPOW}
                            </div>
                          )}
                        </div>
                      )}
                      {game.natlDefensePOW && (
                        <div>
                          <div className="text-[10px] text-gray-500 uppercase">Defensive</div>
                          {getPlayerPID(game.natlDefensePOW) ? (
                            <Link
                              to={`/dynasty/${currentDynasty.id}/player/${getPlayerPID(game.natlDefensePOW)}`}
                              className="text-sm sm:text-base font-bold hover:underline truncate block"
                              style={{ color: '#b45309' }}
                            >
                              {game.natlDefensePOW}
                            </Link>
                          ) : (
                            <div className="text-sm sm:text-base font-bold truncate" style={{ color: '#b45309' }}>
                              {game.natlDefensePOW}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Media Links */}
          {links.length > 0 && (
            <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-gray-200">
              <h4 className="text-base sm:text-lg font-bold text-gray-800 mb-3 sm:mb-4">Media & Links</h4>
              <div className="space-y-3 sm:space-y-4">
                {links.map((link, index) => {
                  const youtubeEmbedUrl = isYouTubeLink(link) ? getYouTubeEmbedUrl(link) : null

                  if (youtubeEmbedUrl) {
                    return (
                      <div key={index} className="rounded-lg overflow-hidden shadow-md aspect-video">
                        <iframe
                          width="100%"
                          height="100%"
                          src={youtubeEmbedUrl}
                          frameBorder="0"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          className="w-full h-full"
                        ></iframe>
                      </div>
                    )
                  } else if (isImageLink(link)) {
                    return (
                      <div key={index} className="rounded-lg overflow-hidden shadow-md">
                        <img
                          src={link}
                          alt={`Game media ${index + 1}`}
                          className="w-full h-auto rounded-lg"
                        />
                      </div>
                    )
                  } else {
                    return (
                      <a
                        key={index}
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-2 sm:p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        <span className="text-sm sm:text-base text-blue-600 hover:underline break-all">{link}</span>
                      </a>
                    )
                  }
                })}
              </div>
            </div>
          )}

          {/* Game Notes */}
          {game.gameNote && (
            <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-gray-200">
              <h4 className="text-base sm:text-lg font-bold text-gray-800 mb-2 sm:mb-3">Game Notes</h4>
              <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
                <p className="text-sm sm:text-base text-gray-700 whitespace-pre-wrap">{game.gameNote}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
