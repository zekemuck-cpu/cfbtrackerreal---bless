import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useDynasty, getCurrentCustomConferences } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { teamAbbreviations } from '../../data/teamAbbreviations'
import { getTeamConference } from '../../data/conferenceTeams'
import { getTeamLogo } from '../../data/teams'

// Map abbreviation to mascot name for logo lookup
const getMascotName = (abbr) => {
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

export default function Teams() {
  const { id } = useParams()
  const { currentDynasty } = useDynasty()
  const pathPrefix = usePathPrefix()
  const [searchQuery, setSearchQuery] = useState('')

  if (!currentDynasty) return null

  // Get custom conferences for current year
  const customConferences = getCurrentCustomConferences(currentDynasty)

  // Get teambuilder teams and the teams they replace
  const customTeams = currentDynasty.customTeams || {}
  const replacedTeamAbbrs = new Set(Object.values(customTeams).map(t => t.replacesTeam))

  // Get all FBS teams with their info, sorted alphabetically by mascot name
  // Filter out FCS teams (abbreviations starting with 'FCS')
  // Filter out teams that have been replaced by teambuilder teams
  const fbsTeams = Object.entries(teamAbbreviations)
    .filter(([abbr]) => !abbr.startsWith('FCS'))
    .filter(([abbr]) => !replacedTeamAbbrs.has(abbr))  // Exclude replaced teams
    .map(([abbr, team]) => ({
      abbr,
      name: team.name,
      backgroundColor: team.backgroundColor,
      textColor: team.textColor,
      conference: getTeamConference(abbr, customConferences, customTeams),
      mascotName: getMascotName(abbr)
    }))

  // Add teambuilder teams to the list
  const teambuilderTeamsList = Object.values(customTeams).map(team => ({
    abbr: team.abbreviation,
    name: team.name,
    backgroundColor: team.backgroundColor || team.primaryColor,
    textColor: team.textColor || team.secondaryColor,
    conference: getTeamConference(team.abbreviation, customConferences, customTeams),
    mascotName: team.name,
    logoUrl: team.logoUrl,
    isTeambuilder: true
  }))

  // Combine FBS teams with teambuilder teams and sort alphabetically
  const allTeams = [...fbsTeams, ...teambuilderTeamsList].sort((a, b) => {
    const nameA = a.mascotName || a.name
    const nameB = b.mascotName || b.name
    return nameA.localeCompare(nameB)
  })

  // Filter teams by search
  const filteredTeams = allTeams.filter(team => {
    if (searchQuery === '') return true
    const query = searchQuery.toLowerCase()
    const mascotName = team.mascotName || ''
    return (
      team.name.toLowerCase().includes(query) ||
      team.abbr.toLowerCase().includes(query) ||
      mascotName.toLowerCase().includes(query)
    )
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg shadow-lg p-6 bg-gray-800 border-2 border-gray-600">
        <h1 className="text-2xl font-bold text-white">
          All Teams
        </h1>
        <p className="mt-1 text-gray-300">
          Browse all {allTeams.length} FBS teams
        </p>
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
            placeholder="Search teams by name or abbreviation..."
            className="w-full pl-10 pr-4 py-3 rounded-lg border-2 border-gray-500 bg-white font-semibold text-lg"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:opacity-70 text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        {searchQuery && (
          <p className="mt-2 text-sm font-semibold text-gray-400">
            {filteredTeams.length} team{filteredTeams.length !== 1 ? 's' : ''} found
          </p>
        )}
      </div>

      {/* Teams Grid */}
      <div className="rounded-lg shadow-lg overflow-hidden bg-gray-800 border-2 border-gray-600">
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filteredTeams.map(team => {
            // For teambuilder teams, use logoUrl; otherwise lookup by mascot name
            const logo = team.isTeambuilder ? team.logoUrl : (team.mascotName ? getTeamLogo(team.mascotName) : null)

            return (
              <Link
                key={team.abbr}
                to={`${pathPrefix}/team/${team.abbr}`}
                className="flex items-center gap-3 p-3 rounded-lg hover:scale-[1.02] transition-transform"
                style={{
                  backgroundColor: team.backgroundColor,
                  color: team.textColor
                }}
              >
                {logo && (
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{
                      backgroundColor: '#FFFFFF',
                      border: `2px solid ${team.textColor}`,
                      padding: '2px'
                    }}
                  >
                    <img
                      src={logo}
                      alt={`${team.name} logo`}
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">{team.mascotName || team.abbr}</div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      {filteredTeams.length === 0 && (
        <div className="rounded-lg shadow-lg p-8 text-center bg-gray-800 border-2 border-gray-600">
          <p className="text-gray-400">
            No teams found matching "{searchQuery}"
          </p>
        </div>
      )}
    </div>
  )
}
