import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useTeamColors } from '../../hooks/useTeamColors'
import { getTeamLogo, getMascotName as getMascotNameFromTeams } from '../../data/teams'
import { getTeamColors } from '../../data/teamColors'
import { getConferenceLogo } from '../../data/conferenceLogos'
import ConferencesModal from '../../components/ConferencesModal'
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

const CONFERENCE_ORDER = [
  'ACC', 'American', 'Big 12', 'Big Ten', 'Conference USA',
  'Independent', 'MAC', 'Mountain West', 'Pac-12', 'SEC', 'Sun Belt'
]

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
  const { year: urlYear } = useParams()
  const navigate = useNavigate()
  const { currentDynasty, updateDynasty, isViewOnly } = useDynasty()
  const pathPrefix = usePathPrefix()
  const teamColors = useTeamColors(currentDynasty?.teamName, currentDynasty?.teams || currentDynasty?.customTeams)
  const [searchQuery, setSearchQuery] = useState('')
  const [showConferencesModal, setShowConferencesModal] = useState(false)

  if (!currentDynasty) return null

  const standingsByYear = currentDynasty.conferenceStandingsByYear || {}
  const yearsWithData = Object.keys(standingsByYear).map(y => parseInt(y))

  if (!yearsWithData.includes(currentDynasty.currentYear)) {
    yearsWithData.push(currentDynasty.currentYear)
  }

  const availableYears = yearsWithData.sort((a, b) => b - a)
  const displayYear = urlYear ? parseInt(urlYear) : currentDynasty.currentYear - 1
  const handleYearChange = (year) => navigate(`${pathPrefix}/conference-standings/${year}`)
  const yearStandings = standingsByYear[displayYear] || {}

  const filteredConferences = CONFERENCE_ORDER.filter(conf => {
    if (searchQuery === '') return true
    return conf.toLowerCase().includes(searchQuery.toLowerCase())
  })

  // Empty state
  if (availableYears.length === 0 || Object.keys(yearStandings).length === 0) {
    return (
      <div className="space-y-8">
        {/* Hero Header */}
        <div className="relative overflow-hidden rounded-2xl">
          <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 50%, #020617 100%)' }} />
          <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` }} />
          <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full blur-3xl opacity-20" style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)' }} />
          <div className="relative px-6 py-8 sm:px-8 sm:py-10">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1.5 h-6 rounded-full bg-gradient-to-b from-blue-400 to-blue-600" />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-500/80">Standings</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">Conference Standings</h1>
            <p className="text-sm text-slate-400 mt-1">Season records by conference</p>
          </div>
        </div>

        <div className="min-h-[40vh] flex items-center justify-center">
          <div className="text-center max-w-md mx-auto px-6">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-600/10 flex items-center justify-center">
              <svg className="w-10 h-10 text-blue-500/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-3">No Standings Data</h2>
            <p className="text-gray-400 text-sm leading-relaxed">
              Conference standings will appear here after you enter them during the End of Season Recap.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Team row component
  const TeamRow = ({ team, rank, idx }) => {
    const teamAbbr = team.team
    const mascotName = getMascotName(teamAbbr, currentDynasty?.teams || currentDynasty?.customTeams)
    const logo = mascotName ? getTeamLogo(mascotName) : null
    const colors = mascotName ? getTeamColors(mascotName) : { primary: '#666', secondary: '#fff' }
    const pointDiff = (team.pointsFor || 0) - (team.pointsAgainst || 0)

    return (
      <Link
        to={`${pathPrefix}/team/${resolveTid(teamAbbr, currentDynasty?.teams || TEAMS)}/${displayYear}`}
        className="group flex items-center gap-3 py-2 px-3 transition-all duration-200 hover:bg-white/5"
      >
        {/* Rank */}
        <div className="w-6 h-6 rounded flex items-center justify-center font-bold text-xs flex-shrink-0" style={{ backgroundColor: 'rgba(71, 85, 105, 0.3)', color: '#94a3b8' }}>
          {rank}
        </div>

        {/* Logo */}
        <div className="w-6 h-6 rounded-full bg-white p-0.5 flex-shrink-0 shadow-sm">
          {logo ? (
            <img src={logo} alt="" className="w-full h-full object-contain" />
          ) : (
            <div className="w-full h-full rounded-full flex items-center justify-center" style={{ backgroundColor: colors.primary }}>
              <span className="text-[10px] font-bold" style={{ color: colors.secondary }}>{teamAbbr?.charAt(0)}</span>
            </div>
          )}
        </div>

        {/* Team Name */}
        <span className="flex-1 font-medium text-sm text-gray-200 truncate group-hover:text-white transition-colors">
          {getSchoolName(mascotName) || teamAbbr}
        </span>

        {/* Record */}
        <span className="text-xs font-bold text-white tabular-nums flex-shrink-0">
          {team.wins || 0}-{team.losses || 0}
        </span>

        {/* Point Diff with tooltip */}
        <div className="relative flex-shrink-0 group/diff">
          <span
            className="text-[10px] font-semibold tabular-nums w-10 text-right block cursor-help"
            style={{ color: pointDiff > 0 ? '#4ade80' : pointDiff < 0 ? '#f87171' : '#64748b' }}
          >
            {pointDiff > 0 ? '+' : ''}{pointDiff}
          </span>
          {/* Tooltip */}
          <div className="absolute bottom-full right-0 mb-1.5 px-2 py-1 rounded-md bg-slate-900 border border-slate-700 text-[10px] text-slate-300 opacity-0 group-hover/diff:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
            <span className="text-green-400">{team.pointsFor || 0} PF</span>
            <span className="mx-1 text-slate-600">|</span>
            <span className="text-red-400">{team.pointsAgainst || 0} PA</span>
          </div>
        </div>
      </Link>
    )
  }

  // Conference card component
  const ConferenceCard = ({ conferenceName }) => {
    const teams = getConferenceData(yearStandings, conferenceName)
    const hasData = teams.length > 0
    const confLogo = getConferenceLogo(conferenceName)

    if (!hasData && searchQuery) return null

    return (
      <div className="rounded-xl overflow-hidden bg-slate-800/30 border border-slate-700/50">
        {/* Conference Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700/50" style={{ backgroundColor: 'rgba(30, 41, 59, 0.5)' }}>
          <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center bg-white/10 p-1">
            {confLogo ? (
              <img src={confLogo} alt="" className="w-full h-full object-contain" />
            ) : (
              <span className="text-sm font-bold text-slate-400">{conferenceName.charAt(0)}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-white text-sm truncate">{conferenceName}</h3>
          </div>
          <span className="text-xs font-medium text-slate-500">{teams.length} teams</span>
        </div>

        {/* Teams */}
        {hasData ? (
          <div className="divide-y divide-slate-700/30">
            {teams.sort((a, b) => (a.rank || 0) - (b.rank || 0)).map((team, idx) => (
              <TeamRow key={team.team || idx} team={team} rank={team.rank || idx + 1} idx={idx} />
            ))}
          </div>
        ) : (
          <div className="p-8 text-center">
            <p className="text-slate-500 text-sm">No standings data for {displayYear}</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl">
        <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 50%, #020617 100%)' }} />
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` }} />
        <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full blur-3xl opacity-20" style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)' }} />

        <div className="relative px-6 py-8 sm:px-8 sm:py-10">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
            {/* Title */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1.5 h-6 rounded-full bg-gradient-to-b from-blue-400 to-blue-600" />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-500/80">Standings</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">Conference Standings</h1>
              <p className="text-sm text-slate-400 mt-1">Season records by conference</p>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-3">
              {/* Year Selector */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Season</span>
                <div className="relative">
                  <select
                    value={displayYear}
                    onChange={(e) => handleYearChange(parseInt(e.target.value))}
                    className="appearance-none pl-4 pr-10 py-2.5 rounded-xl font-bold text-xl bg-slate-800/80 text-white border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 cursor-pointer hover:bg-slate-700/80 transition-colors"
                  >
                    {availableYears.map((year) => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                  <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* Edit Button */}
              {!isViewOnly && (
                <button
                  onClick={() => setShowConferencesModal(true)}
                  className="px-4 py-2.5 rounded-xl font-semibold text-sm transition-all hover:scale-105 flex items-center gap-2"
                  style={{ backgroundColor: teamColors.primary, color: teamColors.secondary }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit
                </button>
              )}
            </div>
          </div>

          {/* Search */}
          <div className="mt-6 max-w-md">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search conferences..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm bg-slate-800/60 text-white border border-slate-700/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder-slate-500"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Conference Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredConferences.map(conferenceName => (
          <ConferenceCard key={conferenceName} conferenceName={conferenceName} />
        ))}
      </div>

      {filteredConferences.length === 0 && searchQuery && (
        <div className="rounded-xl bg-slate-800/30 border border-slate-700/50 p-12 text-center">
          <p className="text-slate-500">No conferences found matching "{searchQuery}"</p>
        </div>
      )}

      {/* Conferences Modal */}
      <ConferencesModal
        isOpen={showConferencesModal}
        onClose={() => setShowConferencesModal(false)}
        onSave={async (data) => {
          const isMultiYear = Object.keys(data).every(key => /^\d{4}$/.test(key))
          if (isMultiYear) {
            const existingByYear = currentDynasty.customConferencesByYear || {}
            const newByYear = { ...existingByYear, ...data }
            await updateDynasty(currentDynasty.id, {
              customConferencesByYear: newByYear,
              ...(data[currentDynasty.currentYear] ? { customConferences: data[currentDynasty.currentYear] } : {})
            })
          } else {
            const existingByYear = currentDynasty.customConferencesByYear || {}
            await updateDynasty(currentDynasty.id, {
              customConferencesByYear: { ...existingByYear, [currentDynasty.currentYear]: data },
              customConferences: data
            })
          }
        }}
        teamColors={teamColors}
      />
    </div>
  )
}
