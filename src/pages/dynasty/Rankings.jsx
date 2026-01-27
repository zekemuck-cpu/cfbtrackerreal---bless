import { useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useTeamColors } from '../../hooks/useTeamColors'
import { getTeamLogo, getMascotName as getMascotNameFromTeams } from '../../data/teams'
import { getTeamColors } from '../../data/teamColors'
import { TEAMS, resolveTid } from '../../data/teamRegistry'

// Extract school name from full mascot name
const getSchoolName = (mascotName) => {
  if (!mascotName) return null
  const specialMascots = [
    'Crimson Tide', 'Blue Hens', 'Fightin\' Blue Hens', 'Golden Flashes', 'Mean Green',
    'Ragin\' Cajuns', 'Thundering Herd', 'Golden Hurricane', 'Fighting Irish',
    'Demon Deacons', 'Yellow Jackets', 'Horned Frogs', 'Scarlet Knights',
    'Blue Raiders', 'Red Raiders', 'Golden Bears', 'Nittany Lions', 'Green Wave',
    'Sun Devils', 'Wolf Pack', 'Black Knights', 'Tar Heels', 'Red Storm'
  ]
  for (const mascot of specialMascots) {
    if (mascotName.endsWith(mascot)) {
      return mascotName.slice(0, -mascot.length).trim()
    }
  }
  const parts = mascotName.split(' ')
  if (parts.length > 1) {
    return parts.slice(0, -1).join(' ')
  }
  return mascotName
}

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

export default function Rankings() {
  const { id, year: urlYear } = useParams()
  const navigate = useNavigate()
  const { currentDynasty } = useDynasty()
  const pathPrefix = usePathPrefix()
  const teamColors = useTeamColors(currentDynasty?.teamName, currentDynasty?.teams || currentDynasty?.customTeams)
  const [activeTab, setActiveTab] = useState('both') // 'both', 'media', 'coaches'

  if (!currentDynasty) return null

  // Get available years with final polls (most recent first)
  const finalPolls = currentDynasty.finalPollsByYear || {}
  const yearsWithData = Object.keys(finalPolls).map(y => parseInt(y))

  // Always include current year so user can view/enter current season's data
  if (!yearsWithData.includes(currentDynasty.currentYear)) {
    yearsWithData.push(currentDynasty.currentYear)
  }

  const availableYears = yearsWithData.sort((a, b) => b - a)

  // Use URL year if provided, otherwise previous season
  const displayYear = urlYear ? parseInt(urlYear) : currentDynasty.currentYear - 1
  const yearPolls = finalPolls[displayYear] || {}
  const mediaPoll = yearPolls.media || []
  const coachesPoll = yearPolls.coaches || []

  // Build a lookup map for team records from conference standings
  const standingsByYear = currentDynasty.conferenceStandingsByYear || {}
  const yearStandings = standingsByYear[displayYear] || {}
  const teamRecords = {}
  Object.values(yearStandings).forEach(conferenceTeams => {
    if (Array.isArray(conferenceTeams)) {
      conferenceTeams.forEach(team => {
        if (team.team) {
          teamRecords[team.team] = {
            wins: team.wins || 0,
            losses: team.losses || 0
          }
        }
      })
    }
  })

  // Navigate to year when dropdown changes
  const handleYearChange = (year) => {
    navigate(`${pathPrefix}/rankings/${year}`)
  }

  // No polls yet
  if (availableYears.length === 0) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg shadow-lg p-8 text-center bg-gray-800 border-2 border-gray-600">
          <svg
            className="w-16 h-16 mx-auto mb-4 opacity-50 text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
          </svg>
          <h1 className="text-2xl font-bold mb-2 text-white">
            Final Top 25
          </h1>
          <p className="text-gray-400">
            No final polls recorded yet. Complete a season and enter final polls to see rankings.
          </p>
        </div>
      </div>
    )
  }

  // Render a single ranking row - compact table style
  const RankingRow = ({ rank, teamAbbr, year, isEven }) => {
    const mascotName = getMascotName(teamAbbr, currentDynasty?.teams || currentDynasty?.customTeams)
    const teamLogo = mascotName ? getTeamLogo(mascotName) : null
    const colors = mascotName ? getTeamColors(mascotName) : { primary: '#666', secondary: '#fff' }
    const isCFP = rank <= 4
    const isTop12 = rank <= 12
    const record = teamRecords[teamAbbr]

    return (
      <Link
        to={`${pathPrefix}/team/${resolveTid(teamAbbr, currentDynasty?.teams || TEAMS)}/${year}`}
        className="flex items-center gap-3 py-2.5 px-3 transition-colors hover:bg-gray-700/50"
        style={{
          backgroundColor: isEven ? 'rgba(55, 65, 81, 0.3)' : 'transparent',
          borderLeft: isCFP ? `3px solid ${teamColors.primary}` : '3px solid transparent'
        }}
      >
        {/* Rank */}
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm flex-shrink-0"
          style={{
            backgroundColor: isCFP ? teamColors.primary : isTop12 ? 'rgba(156, 163, 175, 0.3)' : 'rgba(75, 85, 99, 0.3)',
            color: isCFP ? teamColors.secondary : '#fff'
          }}
        >
          {rank}
        </div>

        {/* Logo */}
        {teamLogo && (
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-white p-0.5"
            style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }}
          >
            <img
              src={teamLogo}
              alt=""
              className="w-full h-full object-contain"
            />
          </div>
        )}

        {/* Team Name */}
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-sm text-white truncate block">
            {getSchoolName(mascotName) || teamAbbr}
          </span>
        </div>

        {/* Record or team color indicator */}
        {record ? (
          <span className="text-sm font-medium text-gray-300 flex-shrink-0 tabular-nums">
            {record.wins}-{record.losses}
          </span>
        ) : (
          <div
            className="w-1 h-6 rounded-full flex-shrink-0"
            style={{ backgroundColor: colors.primary }}
          />
        )}
      </Link>
    )
  }

  // Poll column component
  const PollColumn = ({ title, data, pollType }) => (
    <div className="rounded-lg shadow-lg overflow-hidden bg-gray-800 border border-gray-700">
      {/* Poll Header */}
      <div
        className="px-4 py-3 border-b border-gray-700"
        style={{ backgroundColor: 'rgba(55, 65, 81, 0.5)' }}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-white">{title}</h2>
          <span className="text-xs text-gray-400 font-medium">
            {data.length} teams
          </span>
        </div>
      </div>

      {/* Poll Content */}
      <div className="divide-y divide-gray-700/50">
        {data.length > 0 ? (
          data
            .sort((a, b) => a.rank - b.rank)
            .map((entry, idx) => (
              <RankingRow
                key={`${pollType}-${entry.rank}`}
                rank={entry.rank}
                teamAbbr={entry.team}
                year={displayYear}
                isEven={idx % 2 === 0}
              />
            ))
        ) : (
          <div className="p-8 text-center">
            <p className="text-gray-400 text-sm">
              No {title.toLowerCase()} data for {displayYear}
            </p>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg shadow-lg p-6 bg-gray-800 border border-gray-700">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">
              Final Top 25
            </h1>
            <p className="text-sm text-gray-400 mt-1">
              End of season poll rankings
            </p>
          </div>

          {/* Year Selector */}
          <div className="flex items-center gap-3">
            <label className="font-semibold text-sm text-white">
              Year:
            </label>
            <select
              value={displayYear}
              onChange={(e) => handleYearChange(parseInt(e.target.value))}
              className="px-4 py-2 rounded-lg font-bold text-lg border bg-gray-700 text-white border-gray-600 focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': teamColors.primary }}
            >
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Mobile Tab Switcher */}
        <div className="mt-4 lg:hidden">
          <div className="flex rounded-lg overflow-hidden border border-gray-600">
            {[
              { key: 'both', label: 'Both' },
              { key: 'media', label: 'Media' },
              { key: 'coaches', label: 'Coaches' }
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="flex-1 py-2 text-sm font-semibold transition-colors"
                style={{
                  backgroundColor: activeTab === tab.key ? teamColors.primary : 'transparent',
                  color: activeTab === tab.key ? teamColors.secondary : '#9CA3AF'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* CFP Indicator Legend */}
      {(mediaPoll.length > 0 || coachesPoll.length > 0) && (
        <div className="flex items-center gap-4 text-xs text-gray-400 px-1">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded"
              style={{ backgroundColor: teamColors.primary }}
            />
            <span>CFP Playoff (1-4)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-gray-500/30" />
            <span>CFP Bye (5-12)</span>
          </div>
        </div>
      )}

      {/* Polls Container */}
      <div className={`grid gap-6 ${activeTab === 'both' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 max-w-2xl'}`}>
        {/* Media Poll */}
        {(activeTab === 'both' || activeTab === 'media') && (
          <PollColumn title="Media Poll" data={mediaPoll} pollType="media" />
        )}

        {/* Coaches Poll */}
        {(activeTab === 'both' || activeTab === 'coaches') && (
          <PollColumn title="Coaches Poll" data={coachesPoll} pollType="coaches" />
        )}
      </div>
    </div>
  )
}
