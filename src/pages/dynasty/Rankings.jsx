import { useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { getContrastTextColor } from '../../utils/colorUtils'
import { teamAbbreviations } from '../../data/teamAbbreviations'
import { getTeamLogo, getMascotName as getMascotNameFromTeams } from '../../data/teams'
import { TEAMS, resolveTid } from '../../data/teamRegistry'

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

  if (!currentDynasty) return null

  // Get available years with final polls (most recent first)
  const finalPolls = currentDynasty.finalPollsByYear || {}
  const yearsWithData = Object.keys(finalPolls).map(y => parseInt(y))

  // Always include current year so user can view/enter current season's data
  if (!yearsWithData.includes(currentDynasty.currentYear)) {
    yearsWithData.push(currentDynasty.currentYear)
  }

  const availableYears = yearsWithData.sort((a, b) => b - a)

  // Use URL year if provided, otherwise most recent, otherwise current year
  const displayYear = urlYear ? parseInt(urlYear) : (availableYears.length > 0 ? availableYears[0] : currentDynasty.currentYear)
  const yearPolls = finalPolls[displayYear] || {}
  const mediaPoll = yearPolls.media || []
  const coachesPoll = yearPolls.coaches || []

  // Navigate to year when dropdown changes
  const handleYearChange = (year) => {
    navigate(`${pathPrefix}/rankings/${year}`)
  }

  // No polls yet
  if (availableYears.length === 0) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg shadow-lg p-8 text-center bg-gray-800 border-2 border-gray-600">
          <h1 className="text-2xl font-bold mb-4 text-white">
            Final Top 25
          </h1>
          <p className="text-lg text-gray-400">
            No final polls recorded yet. Complete a season and enter final polls to see rankings.
          </p>
        </div>
      </div>
    )
  }

  // Render a single ranking row
  const RankingRow = ({ rank, teamAbbr, year }) => {
    const teamInfo = teamAbbreviations[teamAbbr] || {}
    const mascotName = getMascotName(teamAbbr, currentDynasty?.teams || currentDynasty?.customTeams)
    const teamLogo = mascotName ? getTeamLogo(mascotName) : null
    const bgColor = teamInfo.backgroundColor || '#6B7280'
    const textColor = getContrastTextColor(bgColor)

    return (
      <Link
        to={`${pathPrefix}/team/${resolveTid(teamAbbr, currentDynasty?.teams || TEAMS)}/${year}`}
        className="flex items-center gap-3 p-3 rounded-lg hover:scale-[1.02] transition-transform"
        style={{
          backgroundColor: bgColor,
          border: `2px solid ${teamInfo.textColor || '#374151'}`
        }}
      >
        {/* Rank */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0"
          style={{
            backgroundColor: rank <= 4 ? '#EAB308' : rank <= 12 ? '#9CA3AF' : `${textColor}20`,
            color: rank <= 4 ? '#000' : rank <= 12 ? '#000' : textColor
          }}
        >
          {rank}
        </div>

        {/* Logo */}
        {teamLogo && (
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'rgba(255,255,255,0.95)', boxShadow: '0 0 0 1px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.2)', padding: '2px' }}
          >
            <img
              src={teamLogo}
              alt={`${teamAbbr} logo`}
              className="w-full h-full object-contain"
            />
          </div>
        )}

        {/* Team Name */}
        <div className="flex-1 min-w-0">
          <div className="font-bold text-lg truncate" style={{ color: textColor }}>
            {mascotName || teamInfo.name || teamAbbr}
          </div>
        </div>
      </Link>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with Year Selector */}
      <div className="rounded-lg shadow-lg p-4 flex flex-col sm:flex-row items-center justify-between gap-4 bg-gray-800 border-2 border-gray-600">
        <h1 className="text-2xl font-bold text-white">
          Final Top 25
        </h1>

        <select
          value={displayYear}
          onChange={(e) => handleYearChange(parseInt(e.target.value))}
          className="px-4 py-2 rounded-lg font-semibold cursor-pointer focus:outline-none focus:ring-2 bg-gray-700 text-white border-2 border-gray-500"
        >
          {availableYears.map((year) => (
            <option key={year} value={year}>
              {year} Season
            </option>
          ))}
        </select>
      </div>

      {/* Polls Container */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Media Poll */}
        <div className="rounded-lg shadow-lg overflow-hidden bg-gray-800 border-2 border-gray-600">
          <div className="px-4 py-3 bg-gray-700">
            <h2 className="text-lg font-bold text-white">
              Media Poll
            </h2>
          </div>

          <div className="p-4 space-y-2">
            {mediaPoll.length > 0 ? (
              mediaPoll
                .sort((a, b) => a.rank - b.rank)
                .map((entry) => (
                  <RankingRow
                    key={`media-${entry.rank}`}
                    rank={entry.rank}
                    teamAbbr={entry.team}
                    year={displayYear}
                  />
                ))
            ) : (
              <p className="text-center py-8 text-gray-400">
                No media poll data for {displayYear}
              </p>
            )}
          </div>
        </div>

        {/* Coaches Poll */}
        <div className="rounded-lg shadow-lg overflow-hidden bg-gray-800 border-2 border-gray-600">
          <div className="px-4 py-3 bg-gray-700">
            <h2 className="text-lg font-bold text-white">
              Coaches Poll
            </h2>
          </div>

          <div className="p-4 space-y-2">
            {coachesPoll.length > 0 ? (
              coachesPoll
                .sort((a, b) => a.rank - b.rank)
                .map((entry) => (
                  <RankingRow
                    key={`coaches-${entry.rank}`}
                    rank={entry.rank}
                    teamAbbr={entry.team}
                    year={displayYear}
                  />
                ))
            ) : (
              <p className="text-center py-8 text-gray-400">
                No coaches poll data for {displayYear}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
