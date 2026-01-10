import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useTeamColors } from '../../hooks/useTeamColors'
import { teamAbbreviations } from '../../data/teamAbbreviations'
import { getTeamLogo } from '../../data/teams'
import { getTeamColors } from '../../data/teamColors'
import { getConferenceLogo } from '../../data/conferenceLogos'
import ConferencesModal from '../../components/ConferencesModal'
import { TEAMS, resolveTid } from '../../data/teamRegistry'

// Map abbreviation to mascot name for logo lookup
const getMascotName = (abbr) => {
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

// Conference order for display
const CONFERENCE_ORDER = [
  'ACC',
  'American',
  'Big 12',
  'Big Ten',
  'Conference USA',
  'Independent',
  'MAC',
  'Mountain West',
  'Pac-12',
  'SEC',
  'Sun Belt'
]

// Map alternate conference names to canonical names (for data lookup)
const CONFERENCE_ALIASES = {
  'Mountain West': ['Mountain West', 'MWC'],
  'ACC': ['ACC'],
  'American': ['American', 'AAC'],
  'Big 12': ['Big 12', 'Big XII'],
  'Big Ten': ['Big Ten', 'B1G'],
  'Conference USA': ['Conference USA', 'CUSA', 'C-USA'],
  'Independent': ['Independent', 'Ind', 'IND'],
  'MAC': ['MAC'],
  'Pac-12': ['Pac-12', 'Pac 12'],
  'SEC': ['SEC'],
  'Sun Belt': ['Sun Belt']
}

// Get conference data checking all possible aliases
const getConferenceData = (yearStandings, conferenceName) => {
  const aliases = CONFERENCE_ALIASES[conferenceName] || [conferenceName]
  for (const alias of aliases) {
    if (yearStandings[alias] && yearStandings[alias].length > 0) {
      return yearStandings[alias]
    }
  }
  return []
}

export default function ConferenceStandings() {
  const { id, year: urlYear } = useParams()
  const navigate = useNavigate()
  const { currentDynasty, updateDynasty, isViewOnly } = useDynasty()
  const pathPrefix = usePathPrefix()
  const teamColors = useTeamColors(currentDynasty?.teamName, currentDynasty?.customTeams)
  const [expandedConference, setExpandedConference] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showConferencesModal, setShowConferencesModal] = useState(false)

  if (!currentDynasty) return null

  // Get available years from standings data (most recent first)
  const standingsByYear = currentDynasty.conferenceStandingsByYear || {}
  const yearsWithData = Object.keys(standingsByYear).map(y => parseInt(y))

  // Always include current year so user can view/enter current season's data
  if (!yearsWithData.includes(currentDynasty.currentYear)) {
    yearsWithData.push(currentDynasty.currentYear)
  }

  const availableYears = yearsWithData.sort((a, b) => b - a)

  // Use URL year if provided, otherwise most recent, otherwise current year
  const displayYear = urlYear ? parseInt(urlYear) : (availableYears[0] || currentDynasty.currentYear)

  // Navigate to year when dropdown changes
  const handleYearChange = (year) => {
    navigate(`${pathPrefix}/conference-standings/${year}`)
  }

  // Get standings for selected year
  const yearStandings = standingsByYear[displayYear] || {}

  // Filter conferences by search
  const filteredConferences = CONFERENCE_ORDER.filter(conf => {
    if (searchQuery === '') return true
    return conf.toLowerCase().includes(searchQuery.toLowerCase())
  })

  // Get total teams with standings
  const getTotalTeams = () => {
    let total = 0
    Object.values(yearStandings).forEach(teams => {
      if (Array.isArray(teams)) {
        total += teams.length
      }
    })
    return total
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg shadow-lg p-6 bg-gray-800 border-2 border-gray-600">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">
              Conference Standings
            </h1>
          </div>

          {/* Year Selector and Edit Button */}
          <div className="flex items-center gap-3">
            {availableYears.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="font-semibold text-sm text-white">
                  Year:
                </label>
                <select
                  value={displayYear}
                  onChange={(e) => handleYearChange(parseInt(e.target.value))}
                  className="px-4 py-2 rounded-lg font-bold text-lg border-2 bg-gray-700 text-white border-gray-500"
                >
                  {availableYears.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
            )}
            {!isViewOnly && (
              <button
                onClick={() => setShowConferencesModal(true)}
                className="px-4 py-2 rounded-lg font-semibold text-sm hover:opacity-90 transition-colors flex items-center gap-2"
                style={{ backgroundColor: teamColors.primary, color: teamColors.secondary }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit Conferences
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="rounded-lg shadow-lg p-4 bg-gray-800 border-2 border-gray-600">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
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
            className="w-full pl-10 pr-4 py-3 rounded-lg border-2 border-gray-300 font-semibold text-lg bg-white"
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
      </div>

      {/* Conference Standings List */}
      {Object.keys(yearStandings).length > 0 ? (
        <div className="rounded-lg shadow-lg overflow-hidden bg-gray-800 border-2 border-gray-600">
          <div className="divide-y divide-gray-600">
            {filteredConferences.map(conferenceName => {
              const teams = getConferenceData(yearStandings, conferenceName)
              const isExpanded = expandedConference === conferenceName
              const hasData = teams.length > 0

              if (!hasData && searchQuery) return null

              return (
                <div key={conferenceName}>
                  {/* Conference Header */}
                  <button
                    onClick={() => setExpandedConference(isExpanded ? null : conferenceName)}
                    className="w-full flex items-center gap-4 p-4 hover:bg-gray-700 transition-colors"
                  >
                    {/* Conference Logo */}
                    <div className="w-14 h-14 rounded-lg flex-shrink-0 flex items-center justify-center bg-white border-2 border-gray-500 p-1">
                      {getConferenceLogo(conferenceName) ? (
                        <img
                          src={getConferenceLogo(conferenceName)}
                          alt={`${conferenceName} logo`}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <span className="text-2xl font-bold text-gray-600">
                          {conferenceName.charAt(0)}
                        </span>
                      )}
                    </div>

                    {/* Conference Name and Stats */}
                    <div className="flex-1 text-left">
                      <div className="font-bold text-lg text-white">
                        {conferenceName}
                      </div>
                      <div className="text-sm text-gray-400">
                        {hasData ? `${teams.length} teams` : 'No standings data'}
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

                  {/* Expanded Standings Table */}
                  {isExpanded && hasData && (
                    <div className="px-4 pb-4 bg-gray-700">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs uppercase tracking-wider text-gray-300">
                            <th className="py-2 px-1 text-left w-8">#</th>
                            <th className="py-2 px-1 text-left">Team</th>
                            <th className="py-2 px-1 text-center w-8">W</th>
                            <th className="py-2 px-1 text-center w-8">L</th>
                            <th className="py-2 px-1 text-center w-10">PF</th>
                            <th className="py-2 px-1 text-center w-10">PA</th>
                            <th className="py-2 px-1 text-center w-12">+/-</th>
                          </tr>
                        </thead>
                        <tbody>
                          {teams
                            .sort((a, b) => (a.rank || 0) - (b.rank || 0))
                            .map((team, idx) => {
                              const teamAbbr = team.team
                              const mascotName = getMascotName(teamAbbr)
                              const logo = mascotName ? getTeamLogo(mascotName) : null
                              const colors = mascotName ? getTeamColors(mascotName) : { primary: '#666', secondary: '#fff' }
                              const pointDiff = (team.pointsFor || 0) - (team.pointsAgainst || 0)

                              return (
                                <tr
                                  key={teamAbbr || idx}
                                  className="bg-white border-b border-gray-200 last:border-b-0 hover:bg-gray-50"
                                >
                                  <td className="py-2 px-1">
                                    <span className="font-bold text-gray-700">
                                      {team.rank || idx + 1}
                                    </span>
                                  </td>
                                  <td className="py-2 px-1">
                                    <Link
                                      to={`${pathPrefix}/team/${resolveTid(teamAbbr, currentDynasty?.teams || TEAMS)}/${displayYear}`}
                                      className="flex items-center gap-1 sm:gap-2 hover:opacity-80"
                                    >
                                      {logo && (
                                        <img src={logo} alt="" className="w-5 h-5 sm:w-6 sm:h-6 object-contain flex-shrink-0" />
                                      )}
                                      <span
                                        className="font-semibold truncate text-xs sm:text-sm"
                                        style={{ color: colors.primary }}
                                      >
                                        {teamAbbr}
                                      </span>
                                    </Link>
                                  </td>
                                  <td className="py-2 px-1 text-center font-bold text-gray-700">
                                    {team.wins || 0}
                                  </td>
                                  <td className="py-2 px-1 text-center font-bold text-gray-700">
                                    {team.losses || 0}
                                  </td>
                                  <td className="py-2 px-1 text-center font-medium text-gray-600">
                                    {team.pointsFor || 0}
                                  </td>
                                  <td className="py-2 px-1 text-center font-medium text-gray-600">
                                    {team.pointsAgainst || 0}
                                  </td>
                                  <td
                                    className="py-2 px-1 text-center font-bold"
                                    style={{
                                      color: pointDiff > 0 ? '#16a34a' : pointDiff < 0 ? '#dc2626' : '#6b7280'
                                    }}
                                  >
                                    {pointDiff > 0 ? '+' : ''}{pointDiff}
                                  </td>
                                </tr>
                              )
                            })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* No data message */}
                  {isExpanded && !hasData && (
                    <div className="px-4 pb-4 text-center py-6 bg-gray-700">
                      <p className="text-gray-400">
                        No standings data for this conference in {displayYear}.
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-lg shadow-lg p-8 text-center bg-gray-800 border-2 border-gray-600">
          <svg
            className="w-16 h-16 mx-auto mb-4 opacity-50 text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-lg font-semibold mb-2 text-white">
            No Conference Standings Data
          </p>
          <p className="text-gray-400">
            Conference standings will appear here after you enter them during the End of Season Recap.
          </p>
        </div>
      )}

      {filteredConferences.length === 0 && searchQuery && (
        <div className="rounded-lg shadow-lg p-8 text-center bg-gray-800 border-2 border-gray-600">
          <p className="text-gray-400">
            No conferences found matching "{searchQuery}"
          </p>
        </div>
      )}

      {/* Conferences Modal */}
      <ConferencesModal
        isOpen={showConferencesModal}
        onClose={() => setShowConferencesModal(false)}
        onSave={async (data) => {
          // Data can be either:
          // - conferencesByYear object: { 2025: {...}, 2026: {...} } (new multi-tab format)
          // - single conferences object: { ACC: [...], ... } (legacy format)
          const isMultiYear = Object.keys(data).every(key => /^\d{4}$/.test(key))

          if (isMultiYear) {
            // Multi-year format - save all years
            const existingByYear = currentDynasty.customConferencesByYear || {}
            const newByYear = { ...existingByYear, ...data }
            await updateDynasty(currentDynasty.id, {
              customConferencesByYear: newByYear,
              // Also update current customConferences if current year is included
              ...(data[currentDynasty.currentYear] ? { customConferences: data[currentDynasty.currentYear] } : {})
            })
          } else {
            // Legacy single-year format - save for current year
            const existingByYear = currentDynasty.customConferencesByYear || {}
            await updateDynasty(currentDynasty.id, {
              customConferencesByYear: {
                ...existingByYear,
                [currentDynasty.currentYear]: data
              },
              customConferences: data
            })
          }
        }}
        teamColors={teamColors}
      />
    </div>
  )
}
