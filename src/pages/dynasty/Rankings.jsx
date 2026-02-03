import { useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
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
  if (teamsData) {
    const result = getMascotNameFromTeams(abbr, teamsData)
    if (result) return result
  }
  const mascotMap = {
    'BAMA': 'Alabama Crimson Tide', 'AFA': 'Air Force Falcons', 'AKR': 'Akron Zips',
    'APP': 'Appalachian State Mountaineers', 'ARIZ': 'Arizona Wildcats', 'ARK': 'Arkansas Razorbacks',
    'ARMY': 'Army Black Knights', 'ARST': 'Arkansas State Red Wolves', 'ASU': 'Arizona State Sun Devils',
    'AUB': 'Auburn Tigers', 'BALL': 'Ball State Cardinals', 'BC': 'Boston College Eagles',
    'BGSU': 'Bowling Green Falcons', 'BOIS': 'Boise State Broncos', 'BU': 'Baylor Bears',
    'BUFF': 'Buffalo Bulls', 'BYU': 'Brigham Young Cougars', 'CAL': 'California Golden Bears',
    'CCU': 'Coastal Carolina Chanticleers', 'CHAR': 'Charlotte 49ers', 'CINN': 'Cincinnati Bearcats',
    'CLEM': 'Clemson Tigers', 'CMU': 'Central Michigan Chippewas', 'COLO': 'Colorado Buffaloes',
    'CONN': 'Connecticut Huskies', 'CSU': 'Colorado State Rams', 'DEL': 'Delaware Fightin\' Blue Hens',
    'DUKE': 'Duke Blue Devils', 'ECU': 'East Carolina Pirates', 'EMU': 'Eastern Michigan Eagles',
    'FAU': 'Florida Atlantic Owls', 'FIU': 'Florida International Panthers', 'FLA': 'Florida Gators',
    'FRES': 'Fresno State Bulldogs', 'FSU': 'Florida State Seminoles', 'GASO': 'Georgia Southern Eagles',
    'GSU': 'Georgia State Panthers', 'GT': 'Georgia Tech Yellow Jackets', 'HAW': 'Hawaii Rainbow Warriors',
    'HOU': 'Houston Cougars', 'ILL': 'Illinois Fighting Illini', 'IU': 'Indiana Hoosiers',
    'IOWA': 'Iowa Hawkeyes', 'ISU': 'Iowa State Cyclones', 'JKST': 'Jacksonville State Gamecocks',
    'JMU': 'James Madison Dukes', 'KENN': 'Kennesaw State Owls', 'KENT': 'Kent State Golden Flashes',
    'KSU': 'Kansas State Wildcats', 'KU': 'Kansas Jayhawks', 'LIB': 'Liberty Flames',
    'LOU': 'Louisville Cardinals', 'LSU': 'LSU Tigers', 'LT': 'Louisiana Tech Bulldogs',
    'M-OH': 'Miami Redhawks', 'MASS': 'Massachusetts Minutemen', 'MEM': 'Memphis Tigers',
    'MIA': 'Miami Hurricanes', 'MICH': 'Michigan Wolverines', 'MINN': 'Minnesota Golden Gophers',
    'MISS': 'Ole Miss Rebels', 'MIZ': 'Missouri Tigers', 'MRSH': 'Marshall Thundering Herd',
    'MRYD': 'Maryland Terrapins', 'MSST': 'Mississippi State Bulldogs', 'MSU': 'Michigan State Spartans',
    'MTSU': 'Middle Tennessee State Blue Raiders', 'MZST': 'Missouri State Bears', 'NAVY': 'Navy Midshipmen',
    'NCST': 'North Carolina State Wolfpack', 'ND': 'Notre Dame Fighting Irish', 'NEB': 'Nebraska Cornhuskers',
    'NEV': 'Nevada Wolf Pack', 'NIU': 'Northern Illinois Huskies', 'NMSU': 'New Mexico State Aggies',
    'NU': 'Northwestern Wildcats', 'ODU': 'Old Dominion Monarchs', 'OHIO': 'Ohio Bobcats',
    'OHIO ST': 'Ohio State Buckeyes', 'OKST': 'Oklahoma State Cowboys', 'ORE': 'Oregon Ducks',
    'ORST': 'Oregon State Beavers', 'OSU': 'Ohio State Buckeyes', 'OU': 'Oklahoma Sooners',
    'PITT': 'Pittsburgh Panthers', 'PSU': 'Penn State Nittany Lions', 'PUR': 'Purdue Boilermakers',
    'RICE': 'Rice Owls', 'RUTG': 'Rutgers Scarlet Knights', 'SCAR': 'South Carolina Gamecocks',
    'SDSU': 'San Diego State Aztecs', 'SHSU': 'Sam Houston State Bearkats', 'SJSU': 'San Jose State Spartans',
    'SMU': 'SMU Mustangs', 'STAN': 'Stanford Cardinal', 'SYR': 'Syracuse Orange',
    'TAMU': 'Texas A&M Aggies', 'TCU': 'TCU Horned Frogs', 'TEM': 'Temple Owls',
    'TENN': 'Tennessee Volunteers', 'TEX': 'Texas Longhorns', 'TLNE': 'Tulane Green Wave',
    'TLSA': 'Tulsa Golden Hurricane', 'TOL': 'Toledo Rockets', 'TROY': 'Troy Trojans',
    'TTU': 'Texas Tech Red Raiders', 'TULN': 'Tulane Green Wave', 'TXAM': 'Texas A&M Aggies',
    'TXST': 'Texas State Bobcats', 'UAB': 'UAB Blazers', 'UC': 'Cincinnati Bearcats',
    'UCF': 'UCF Knights', 'UCLA': 'UCLA Bruins', 'UGA': 'Georgia Bulldogs', 'UH': 'Houston Cougars',
    'UK': 'Kentucky Wildcats', 'UL': 'Lafayette Ragin\' Cajuns', 'ULL': 'Lafayette Ragin\' Cajuns',
    'ULM': 'Monroe Warhawks', 'UMD': 'Maryland Terrapins', 'UNC': 'North Carolina Tar Heels',
    'UNLV': 'UNLV Rebels', 'UNM': 'New Mexico Lobos', 'UNT': 'North Texas Mean Green',
    'USA': 'South Alabama Jaguars', 'USC': 'USC Trojans', 'USF': 'South Florida Bulls',
    'USM': 'Southern Mississippi Golden Eagles', 'USU': 'Utah State Aggies', 'UT': 'Tennessee Volunteers',
    'UTAH': 'Utah Utes', 'UTEP': 'UTEP Miners', 'UTSA': 'UTSA Roadrunners', 'UVA': 'Virginia Cavaliers',
    'VAN': 'Vanderbilt Commodores', 'VAND': 'Vanderbilt Commodores', 'VT': 'Virginia Tech Hokies',
    'WAKE': 'Wake Forest Demon Deacons', 'WASH': 'Washington Huskies', 'WIS': 'Wisconsin Badgers',
    'WISC': 'Wisconsin Badgers', 'WKU': 'Western Kentucky Hilltoppers', 'WMU': 'Western Michigan Broncos',
    'WSU': 'Washington State Cougars', 'WVU': 'West Virginia Mountaineers', 'WYO': 'Wyoming Cowboys',
    'GAST': 'Georgia State Panthers', 'OKLA': 'Oklahoma Sooners', 'RUT': 'Rutgers Scarlet Knights',
    'SAM': 'Sam Houston State Bearkats', 'TUL': 'Tulane Green Wave', 'TXTECH': 'Texas Tech Red Raiders',
    'UF': 'Florida Gators', 'UM': 'Miami Hurricanes',
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
  const [activeTab, setActiveTab] = useState('both')

  if (!currentDynasty) return null

  const finalPolls = currentDynasty.finalPollsByYear || {}
  const yearsWithData = Object.keys(finalPolls).map(y => parseInt(y))

  if (!yearsWithData.includes(currentDynasty.currentYear)) {
    yearsWithData.push(currentDynasty.currentYear)
  }

  const availableYears = yearsWithData.sort((a, b) => b - a)
  const displayYear = urlYear ? parseInt(urlYear) : currentDynasty.currentYear - 1
  const yearPolls = finalPolls[displayYear] || {}
  const mediaPoll = yearPolls.media || []
  const coachesPoll = yearPolls.coaches || []

  // Build team records lookup
  const standingsByYear = currentDynasty.conferenceStandingsByYear || {}
  const yearStandings = standingsByYear[displayYear] || {}
  const teamRecords = {}
  Object.values(yearStandings).forEach(conferenceTeams => {
    if (Array.isArray(conferenceTeams)) {
      conferenceTeams.forEach(team => {
        if (team.team) {
          teamRecords[team.team] = { wins: team.wins || 0, losses: team.losses || 0 }
        }
      })
    }
  })

  const handleYearChange = (year) => navigate(`${pathPrefix}/rankings/${year}`)

  // Empty state
  if (availableYears.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-6">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 flex items-center justify-center">
            <svg className="w-10 h-10 text-amber-500/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">Final Top 25</h1>
          <p className="text-gray-400 text-sm leading-relaxed">
            No final polls recorded yet. Complete a season and enter final rankings to see the championship standings.
          </p>
        </div>
      </div>
    )
  }

  // CFP Playoff Team Card (Top 4)
  const PlayoffTeamCard = ({ rank, teamAbbr, year, isFirst }) => {
    const mascotName = getMascotName(teamAbbr, currentDynasty?.teams || currentDynasty?.customTeams)
    const teamLogo = mascotName ? getTeamLogo(mascotName) : null
    const colors = mascotName ? getTeamColors(mascotName) : { primary: '#d97706', secondary: '#fff' }
    const record = teamRecords[teamAbbr]
    const schoolName = getSchoolName(mascotName) || teamAbbr

    return (
      <Link
        to={`${pathPrefix}/team/${resolveTid(teamAbbr, currentDynasty?.teams || TEAMS)}/${year}`}
        className="group relative overflow-hidden rounded-xl transition-all duration-300 hover:scale-[1.02] hover:shadow-xl"
        style={{
          background: `linear-gradient(135deg, ${colors.primary}15 0%, ${colors.primary}05 100%)`,
          border: `1px solid ${colors.primary}30`
        }}
      >
        {/* Rank Badge */}
        <div
          className="absolute top-3 left-3 w-9 h-9 rounded-lg flex items-center justify-center font-black text-lg shadow-lg"
          style={{
            background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primary}dd 100%)`,
            color: colors.secondary
          }}
        >
          {rank}
        </div>

        {/* Content */}
        <div className="pt-14 pb-4 px-4 text-center">
          {/* Logo */}
          <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-white p-1 shadow-lg group-hover:shadow-xl transition-shadow">
            {teamLogo ? (
              <img src={teamLogo} alt="" className="w-full h-full object-contain" />
            ) : (
              <div className="w-full h-full rounded-full flex items-center justify-center" style={{ backgroundColor: colors.primary }}>
                <span className="text-xl font-bold" style={{ color: colors.secondary }}>{teamAbbr.charAt(0)}</span>
              </div>
            )}
          </div>

          {/* Team Name */}
          <h3 className="font-bold text-white text-sm mb-1 truncate">{schoolName}</h3>

          {/* Record */}
          {record && (
            <span className="text-xs font-semibold tabular-nums" style={{ color: colors.primary }}>
              {record.wins}-{record.losses}
            </span>
          )}
        </div>

        {/* Bottom accent */}
        <div className="h-1" style={{ background: `linear-gradient(90deg, ${colors.primary} 0%, ${colors.primary}60 100%)` }} />
      </Link>
    )
  }

  // Standard ranking row
  const RankingRow = ({ rank, teamAbbr, year }) => {
    const mascotName = getMascotName(teamAbbr, currentDynasty?.teams || currentDynasty?.customTeams)
    const teamLogo = mascotName ? getTeamLogo(mascotName) : null
    const colors = mascotName ? getTeamColors(mascotName) : { primary: '#666', secondary: '#fff' }
    const record = teamRecords[teamAbbr]

    return (
      <Link
        to={`${pathPrefix}/team/${resolveTid(teamAbbr, currentDynasty?.teams || TEAMS)}/${year}`}
        className="group flex items-center gap-3 py-2.5 px-3 transition-all duration-200 hover:bg-white/5 rounded-lg mx-1"
      >
        {/* Rank Badge */}
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center font-bold text-xs flex-shrink-0 transition-transform group-hover:scale-110"
          style={{
            backgroundColor: 'rgba(71, 85, 105, 0.3)',
            color: '#94a3b8'
          }}
        >
          {rank}
        </div>

        {/* Logo */}
        <div className="w-7 h-7 rounded-full bg-white p-0.5 flex-shrink-0 shadow-sm group-hover:shadow transition-shadow">
          {teamLogo ? (
            <img src={teamLogo} alt="" className="w-full h-full object-contain" />
          ) : (
            <div className="w-full h-full rounded-full flex items-center justify-center" style={{ backgroundColor: colors.primary }}>
              <span className="text-xs font-bold" style={{ color: colors.secondary }}>{teamAbbr.charAt(0)}</span>
            </div>
          )}
        </div>

        {/* Team Name */}
        <span className="flex-1 font-medium text-sm text-gray-200 truncate group-hover:text-white transition-colors">
          {getSchoolName(mascotName) || teamAbbr}
        </span>

        {/* Record */}
        {record && (
          <span className="text-xs font-medium text-gray-500 tabular-nums flex-shrink-0">
            {record.wins}-{record.losses}
          </span>
        )}

        {/* Team color accent */}
        <div
          className="w-1 h-5 rounded-full flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity"
          style={{ backgroundColor: colors.primary }}
        />
      </Link>
    )
  }

  // Poll column
  const PollColumn = ({ title, data, pollType }) => {
    const top4 = data.filter(e => e.rank <= 4).sort((a, b) => a.rank - b.rank)
    const rest = data.filter(e => e.rank > 4).sort((a, b) => a.rank - b.rank)

    return (
      <div className="space-y-4">
        {/* Poll Header */}
        <div className="flex items-center justify-between px-1">
          <h2 className="text-lg font-bold text-white tracking-tight">{title}</h2>
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            {data.length} teams
          </span>
        </div>

        {data.length > 0 ? (
          <>
            {/* Top 4 Featured Cards */}
            {top4.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                {top4.map((entry, idx) => (
                  <PlayoffTeamCard
                    key={`${pollType}-top-${entry.rank}`}
                    rank={entry.rank}
                    teamAbbr={entry.team}
                    year={displayYear}
                    isFirst={idx === 0}
                  />
                ))}
              </div>
            )}

            {/* Rest of Rankings (5-25) */}
            {rest.length > 0 && (
              <div className="rounded-xl overflow-hidden bg-slate-800/30 border border-slate-700/50">
                {rest.map((entry) => (
                  <RankingRow
                    key={`${pollType}-${entry.rank}`}
                    rank={entry.rank}
                    teamAbbr={entry.team}
                    year={displayYear}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="rounded-xl bg-slate-800/30 border border-slate-700/30 p-12 text-center">
            <p className="text-gray-500 text-sm">No {title.toLowerCase()} data for {displayYear}</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl">
        {/* Background gradient */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 50%, #020617 100%)'
          }}
        />
        {/* Subtle pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
        {/* Accent glow */}
        <div
          className="absolute -top-20 -right-20 w-60 h-60 rounded-full blur-3xl opacity-20"
          style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' }}
        />

        <div className="relative px-6 py-8 sm:px-8 sm:py-10">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
            {/* Title Section */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1.5 h-6 rounded-full bg-gradient-to-b from-amber-400 to-amber-600" />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-500/80">
                  Final Rankings
                </span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                Top 25
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                End of season poll standings
              </p>
            </div>

            {/* Year Selector */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Season</span>
              <div className="relative">
                <select
                  value={displayYear}
                  onChange={(e) => handleYearChange(parseInt(e.target.value))}
                  className="appearance-none pl-4 pr-10 py-2.5 rounded-xl font-bold text-xl bg-slate-800/80 text-white border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-amber-500/50 cursor-pointer hover:bg-slate-700/80 transition-colors"
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
          </div>

          {/* Mobile Tab Switcher */}
          <div className="mt-6 lg:hidden">
            <div className="inline-flex rounded-lg p-1 bg-slate-800/60 border border-slate-700/50">
              {[
                { key: 'both', label: 'Both Polls' },
                { key: 'media', label: 'AP Poll' },
                { key: 'coaches', label: 'Coaches' }
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className="px-4 py-2 text-xs font-semibold rounded-md transition-all"
                  style={{
                    backgroundColor: activeTab === tab.key ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
                    color: activeTab === tab.key ? '#f59e0b' : '#64748b'
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Polls Grid */}
      <div className={`grid gap-8 ${activeTab === 'both' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 max-w-2xl mx-auto'}`}>
        {(activeTab === 'both' || activeTab === 'media') && (
          <PollColumn title="Media Poll" data={mediaPoll} pollType="media" />
        )}
        {(activeTab === 'both' || activeTab === 'coaches') && (
          <PollColumn title="Coaches Poll" data={coachesPoll} pollType="coaches" />
        )}
      </div>
    </div>
  )
}
