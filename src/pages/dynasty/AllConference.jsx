import { useState, useMemo } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useDynasty, getCurrentCustomConferences, getCustomConferencesForYear, getTeamConferenceForDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { getContrastTextColor } from '../../utils/colorUtils'
import { teamAbbreviations } from '../../data/teamAbbreviations'
import { getTeamLogo, getMascotName as getMascotNameFromTeams } from '../../data/teams'
import { TEAMS, resolveTid, getCurrentTeamAbbr, getAbbrFromTeamName } from '../../data/teamRegistry'
import { getTeamConference, conferenceTeams, getAllConferences } from '../../data/conferenceTeams'
import AllAmericansModal from '../../components/AllAmericansModal'
import { useTeamColors } from '../../hooks/useTeamColors'

// Map abbreviation to mascot name for logo lookup
const getMascotName = (abbr, teamsData = null) => {
  // Try tid-based lookup first if teams data provided
  if (teamsData) {
    const result = getMascotNameFromTeams(abbr, teamsData)
    if (result) return result
  }
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
    'FCSE': 'FCS East Judicials', 'FCSM': 'FCS Midwest Rebels',
    'FCSN': 'FCS Northwest Stallions', 'FCSW': 'FCS West Titans'
  }
  return mascotMap[abbr] || null
}

// Helper function to normalize player names for URL
const normalizePlayerName = (name) => {
  if (!name) return ''
  return name.trim().toLowerCase()
}

// Helper function to clean player names by removing prefix symbols (stars, bullets, etc.)
const cleanPlayerName = (name) => {
  if (!name) return ''
  // Remove common prefix symbols: ★ ⭐ ✦ • * · ● ◆ ♦ ▪ ■ etc.
  return name.replace(/^[\s★⭐✦•*·●◆♦▪■\-–—]+/, '').trim()
}

export default function AllConference() {
  const { id, year: urlYear, conference: urlConference } = useParams()
  const navigate = useNavigate()
  const { currentDynasty, updateDynasty, isViewOnly, processHonorPlayers } = useDynasty()
  const pathPrefix = usePathPrefix()
  const [filter, setFilter] = useState('all') // 'all', 'first', 'second', 'freshman'
  const [showEditModal, setShowEditModal] = useState(false)
  const teamColors = useTeamColors(currentDynasty?.teamName, currentDynasty?.teams || currentDynasty?.customTeams)

  if (!currentDynasty) return null

  // Get all years from dynasty start to current year (most recent first)
  const allAmericansByYear = currentDynasty.allAmericansByYear || {}
  const startYear = currentDynasty.startYear || currentDynasty.currentYear
  const availableYears = []
  for (let year = currentDynasty.currentYear; year >= startYear; year--) {
    availableYears.push(year)
  }

  // Use URL year if provided, otherwise most recent (current year)
  const displayYear = urlYear ? parseInt(urlYear) : currentDynasty.currentYear
  const yearData = allAmericansByYear[displayYear] || {}

  // Get the user's team abbreviation
  const userTeamAbbr = getCurrentTeamAbbr(currentDynasty)

  // Get custom conferences for the DISPLAY YEAR (not current year) - this handles conference realignment
  const customConferencesForYear = getCustomConferencesForYear(currentDynasty, displayYear)

  // Get the user's conference for the display year (handles realignment)
  const userConference = getTeamConferenceForDynasty(currentDynasty, userTeamAbbr, displayYear) || 'SEC'

  // Get list of available conferences for display year - use custom conferences if available, otherwise defaults
  const availableConferences = useMemo(() => {
    if (customConferencesForYear && Object.keys(customConferencesForYear).length > 0) {
      return Object.keys(customConferencesForYear).sort()
    }
    return getAllConferences().sort()
  }, [customConferencesForYear])

  // Get the conference teams for the display year
  const getConferenceTeams = (conf) => {
    if (customConferencesForYear && customConferencesForYear[conf]) {
      return customConferencesForYear[conf]
    }
    return conferenceTeams[conf] || []
  }

  // Decode URL conference - try direct match first, then try with hyphens as spaces
  const decodeConference = (urlConf) => {
    if (!urlConf) return null
    const decoded = decodeURIComponent(urlConf)
    // First try direct match (handles "Pac-12" which has hyphen in name)
    let match = availableConferences.find(c => c.toLowerCase() === decoded.toLowerCase())
    if (match) return match
    // Try replacing hyphens with spaces (handles "Big-Ten" -> "Big Ten")
    const withSpaces = decoded.replace(/-/g, ' ')
    match = availableConferences.find(c => c.toLowerCase() === withSpaces.toLowerCase())
    return match
  }

  // Encode conference for URL (replace spaces with hyphens)
  const encodeConference = (conf) => {
    return encodeURIComponent(conf.replace(/\s+/g, '-'))
  }

  // Use URL conference if provided and valid, otherwise user's conference
  const displayConference = decodeConference(urlConference) || userConference

  // Get all-conference data for the selected conference
  // First try the new structure (allConferenceByConference), then fall back to filtering the old structure
  const allConference = useMemo(() => {
    // Try new structure first
    if (yearData.allConferenceByConference && yearData.allConferenceByConference[displayConference]) {
      return yearData.allConferenceByConference[displayConference]
    }

    // Fall back to old structure - filter by schools in the selected conference
    const allConferenceRaw = yearData.allConference || []
    if (allConferenceRaw.length === 0) return []

    const conferenceTeamsList = getConferenceTeams(displayConference)
    return allConferenceRaw.filter(player => {
      if (!player.school) return false
      return conferenceTeamsList.includes(player.school.toUpperCase()) || conferenceTeamsList.includes(player.school)
    })
  }, [yearData, displayConference])

  // Navigate when dropdowns change
  const handleYearChange = (year) => {
    navigate(`${pathPrefix}/all-conference/${year}/${encodeConference(displayConference)}`)
  }

  const handleConferenceChange = (conf) => {
    navigate(`${pathPrefix}/all-conference/${displayYear}/${encodeConference(conf)}`)
  }

  // Handle save from modal - transforms and saves all-conference data grouped by conference
  const handleAllAmericansSave = async (data) => {
    const year = displayYear

    // Process All-Conference entries for player matching
    if (data.allConference && data.allConference.length > 0) {
      const acEntries = data.allConference.map(entry => ({
        ...entry,
        name: entry.player,
        honorCategory: 'allConference'
      }))

      await processHonorPlayers(
        currentDynasty.id,
        'allConference',
        acEntries,
        year,
        []
      )
    }

    // Transform allConference to be grouped by conference
    const transformedData = { ...data }
    if (data.allConference && data.allConference.length > 0) {
      const existingByConf = currentDynasty.allAmericansByYear?.[year]?.allConferenceByConference || {}
      const newByConf = { ...existingByConf }

      data.allConference.forEach(entry => {
        const conference = getTeamConferenceForDynasty(currentDynasty, entry.school, year) || 'Unknown'
        if (!newByConf[conference]) {
          newByConf[conference] = []
        }
        // Check for duplicates before adding
        const isDupe = newByConf[conference].some(existing =>
          existing.player === entry.player &&
          existing.school === entry.school &&
          existing.designation === entry.designation
        )
        if (!isDupe) {
          newByConf[conference].push(entry)
        }
      })
      transformedData.allConferenceByConference = newByConf
    }

    const existingByYear = currentDynasty.allAmericansByYear || {}
    const existingYearData = existingByYear[year] || {}
    await updateDynasty(currentDynasty.id, {
      allAmericansByYear: {
        ...existingByYear,
        [year]: {
          ...existingYearData,
          ...transformedData
        }
      }
    })
  }

  // Filter all-conference players
  const filteredPlayers = filter === 'all'
    ? allConference
    : allConference.filter(p => p.designation === filter)

  // Group by designation for display
  const groupedByDesignation = {
    first: filteredPlayers.filter(p => p.designation === 'first'),
    second: filteredPlayers.filter(p => p.designation === 'second'),
    freshman: filteredPlayers.filter(p => p.designation === 'freshman')
  }

  // Helper function to find player by name and optionally school
  const findPlayerByNameAndSchool = (playerName, school) => {
    if (!playerName || !currentDynasty.players) return null
    const normalizedName = normalizePlayerName(playerName)
    const normalizedSchool = school?.toUpperCase()

    // First try exact match by name
    let match = currentDynasty.players.find(p =>
      normalizePlayerName(p.name) === normalizedName
    )

    // If multiple matches or no match, try to match by name + allConference school
    if (!match) {
      match = currentDynasty.players.find(p => {
        if (normalizePlayerName(p.name) !== normalizedName) return false
        // Check if player has allConference entry with matching school
        if (p.allConference && normalizedSchool) {
          return p.allConference.some(ac => ac.school?.toUpperCase() === normalizedSchool)
        }
        // Check player's team
        if (p.team && normalizedSchool) {
          return p.team.toUpperCase() === normalizedSchool
        }
        return false
      })
    }

    return match
  }

  // Render player card
  const PlayerCard = ({ player }) => {
    const teamInfo = teamAbbreviations[player.school] || {}
    const mascotName = getMascotName(player.school, currentDynasty?.teams || currentDynasty?.customTeams)
    const teamLogo = mascotName ? getTeamLogo(mascotName) : null
    const bgColor = teamInfo.backgroundColor || '#6B7280'
    const textColor = getContrastTextColor(bgColor)
    const matchingPlayer = findPlayerByNameAndSchool(player.player, player.school)
    const hasPlayerPage = !!matchingPlayer

    return (
      <div
        className="flex items-center gap-3 p-3 rounded-lg"
        style={{
          backgroundColor: bgColor,
          border: `2px solid ${teamInfo.textColor || '#374151'}`
        }}
      >
        {/* Team Logo */}
        {teamLogo && (
          <Link
            to={`${pathPrefix}/team/${resolveTid(player.school, currentDynasty?.teams || TEAMS)}`}
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 hover:scale-105 transition-transform"
            style={{ backgroundColor: '#FFFFFF', padding: '2px' }}
          >
            <img
              src={teamLogo}
              alt={`${player.school} logo`}
              className="w-full h-full object-contain"
            />
          </Link>
        )}

        {/* Player Info */}
        <div className="flex-1 min-w-0">
          {hasPlayerPage ? (
            <Link
              to={`${pathPrefix}/player/${matchingPlayer.pid}`}
              className="font-bold truncate block hover:underline"
              style={{ color: textColor }}
            >
              {cleanPlayerName(player.player)}
            </Link>
          ) : (
            <div className="font-bold truncate" style={{ color: textColor }}>
              {cleanPlayerName(player.player)}
            </div>
          )}
          <div className="text-sm" style={{ color: textColor, opacity: 0.8 }}>
            {player.position} • {player.class}
          </div>
        </div>

        {/* Position Badge */}
        <div
          className="px-2 py-1 rounded text-xs font-bold flex-shrink-0"
          style={{
            backgroundColor: `${textColor}20`,
            color: textColor
          }}
        >
          {player.position}
        </div>
      </div>
    )
  }

  // Render section
  const TeamSection = ({ title, players, badgeColor }) => {
    if (players.length === 0) return null

    return (
      <div className="rounded-lg shadow-lg overflow-hidden bg-gray-800 border-2 border-gray-600">
        <div
          className="px-4 py-3 flex items-center gap-3"
          style={{ backgroundColor: badgeColor }}
        >
          <svg className="w-6 h-6" fill="none" stroke="#FFFFFF" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
          </svg>
          <h2 className="text-lg font-bold text-white">
            {title}
          </h2>
          <span className="ml-auto text-sm text-white opacity-80">
            {players.length} selections
          </span>
        </div>

        <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {players.map((player, idx) => (
            <PlayerCard key={`${player.position}-${player.player}-${idx}`} player={player} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with Year Selector, Conference Selector, and Filter */}
      <div className="rounded-lg shadow-lg p-4 bg-gray-800 border-2 border-gray-600">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-white">
            All-{displayConference}
          </h1>

          <div className="flex flex-wrap items-center justify-center gap-3">
            {/* Filter Buttons */}
            <div className="flex rounded-lg overflow-hidden border border-blue-600">
              {[
                { key: 'all', label: 'All' },
                { key: 'first', label: '1st' },
                { key: 'second', label: '2nd' },
                { key: 'freshman', label: 'Fr' }
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`px-3 py-1 text-sm font-semibold transition-colors ${
                    filter === key ? 'bg-blue-600 text-white' : 'bg-transparent text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Conference Selector */}
            <select
              value={displayConference}
              onChange={(e) => handleConferenceChange(e.target.value)}
              className="px-4 py-2 rounded-lg font-semibold cursor-pointer focus:outline-none focus:ring-2 bg-gray-700 text-white border-2 border-gray-500"
            >
              {availableConferences.map((conf) => (
                <option key={conf} value={conf}>
                  {conf}
                </option>
              ))}
            </select>

            {/* Year Selector */}
            <select
              value={displayYear}
              onChange={(e) => handleYearChange(parseInt(e.target.value))}
              className="px-4 py-2 rounded-lg font-semibold cursor-pointer focus:outline-none focus:ring-2 bg-gray-700 text-white border-2 border-gray-500"
            >
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>

            {/* Edit Button */}
            {!isViewOnly && (
              <button
                onClick={() => setShowEditModal(true)}
                className="px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-colors flex items-center gap-2"
                style={{ backgroundColor: teamColors.primary, color: getContrastTextColor(teamColors.primary) }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </button>
            )}
          </div>
        </div>
      </div>

      {/* All-Conference Teams */}
      {filter === 'all' ? (
        <>
          <TeamSection
            title={`First-Team All-${displayConference}`}
            players={groupedByDesignation.first}
            badgeColor="#3B82F6"
          />
          <TeamSection
            title={`Second-Team All-${displayConference}`}
            players={groupedByDesignation.second}
            badgeColor="#6B7280"
          />
          <TeamSection
            title={`Freshman All-${displayConference}`}
            players={groupedByDesignation.freshman}
            badgeColor="#3B82F6"
          />
        </>
      ) : (
        <TeamSection
          title={
            filter === 'first' ? `First-Team All-${displayConference}` :
            filter === 'second' ? `Second-Team All-${displayConference}` :
            `Freshman All-${displayConference}`
          }
          players={filteredPlayers}
          badgeColor={
            filter === 'first' ? '#3B82F6' :
            filter === 'second' ? '#6B7280' :
            '#3B82F6'
          }
        />
      )}

      {/* Empty State for Filter */}
      {filteredPlayers.length === 0 && (
        <div className="rounded-lg shadow-lg p-8 text-center bg-gray-800 border-2 border-gray-600">
          <p className="text-lg text-gray-300 opacity-70">
            No {filter === 'all' ? '' : filter === 'first' ? 'First-Team ' : filter === 'second' ? 'Second-Team ' : 'Freshman '}All-{displayConference} players for {displayYear}.
          </p>
        </div>
      )}

      {/* All-Americans/All-Conference Modal */}
      <AllAmericansModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSave={handleAllAmericansSave}
        currentYear={displayYear}
        teamColors={teamColors}
      />
    </div>
  )
}
