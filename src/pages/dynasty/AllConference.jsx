import { useState, useMemo } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useDynasty, getCustomConferencesForYear, getTeamConferenceForDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { getContrastTextColor } from '../../utils/colorUtils'
import { getTeamLogo, getMascotName as getMascotNameFromTeams } from '../../data/teams'
import { getTeamColors } from '../../data/teamColors'
import { TEAMS, resolveTid, getCurrentTeamAbbr } from '../../data/teamRegistry'
import { conferenceTeams, getAllConferences } from '../../data/conferenceTeams'
import AllConferenceModal from '../../components/AllConferenceModal'
import { normalizePlayerName } from '../../utils/playerMatching'
import { useTeamColors } from '../../hooks/useTeamColors'

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

// Extract school name from mascot
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

// Helper function to clean player names
const cleanPlayerName = (name) => {
  if (!name) return ''
  return name.replace(/^[\s★⭐✦•*·●◆♦▪■\-–—]+/, '').trim()
}

// Conference-specific color themes
const CONFERENCE_THEMES = {
  'SEC': { primary: '#ffc72c', secondary: '#1c3761', accent: '#ffc72c' },
  'Big Ten': { primary: '#0088ce', secondary: '#fff', accent: '#0088ce' },
  'Big 12': { primary: '#ef4135', secondary: '#002a5c', accent: '#ef4135' },
  'ACC': { primary: '#013ca6', secondary: '#a0b3d6', accent: '#013ca6' },
  'Pac-12': { primary: '#004c91', secondary: '#b6985a', accent: '#004c91' },
  'Big East': { primary: '#e41c38', secondary: '#0c2340', accent: '#e41c38' },
  'AAC': { primary: '#e31837', secondary: '#fff', accent: '#e31837' },
  'Mountain West': { primary: '#003da5', secondary: '#b3a369', accent: '#003da5' },
  'Sun Belt': { primary: '#00205b', secondary: '#9d2235', accent: '#9d2235' },
  'MAC': { primary: '#6a3a78', secondary: '#fff', accent: '#6a3a78' },
  'C-USA': { primary: '#002f6c', secondary: '#a5a5a5', accent: '#002f6c' },
  'Independent': { primary: '#0c2340', secondary: '#c5b358', accent: '#c5b358' }
}

// Designation config
const DESIGNATION_CONFIG = {
  first: {
    label: 'First Team',
    gradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
    textColor: '#fff',
    accentColor: '#3b82f6'
  },
  second: {
    label: 'Second Team',
    gradient: 'linear-gradient(135deg, #64748b 0%, #475569 100%)',
    textColor: '#fff',
    accentColor: '#64748b'
  },
  freshman: {
    label: 'Freshman',
    gradient: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
    textColor: '#fff',
    accentColor: '#8b5cf6'
  }
}

export default function AllConference() {
  const { year: urlYear, conference: urlConference } = useParams()
  const navigate = useNavigate()
  const { currentDynasty, updateDynasty, isViewOnly, processHonorPlayers } = useDynasty()
  const pathPrefix = usePathPrefix()
  const [filter, setFilter] = useState('all')
  const [showEditModal, setShowEditModal] = useState(false)
  const teamColors = useTeamColors(currentDynasty?.teamName, currentDynasty?.teams || currentDynasty?.customTeams)

  if (!currentDynasty) return null

  const allAmericansByYear = currentDynasty.allAmericansByYear || {}
  const startYear = currentDynasty.startYear || currentDynasty.currentYear
  const availableYears = []
  for (let year = currentDynasty.currentYear; year >= startYear; year--) {
    availableYears.push(year)
  }

  const displayYear = urlYear ? parseInt(urlYear) : currentDynasty.currentYear - 1
  const yearData = allAmericansByYear[displayYear] || {}

  const userTeamAbbrForYear = useMemo(() => {
    const coachRecord = currentDynasty.coachTeamByYear?.[displayYear] ||
                        currentDynasty.coachTeamByYear?.[String(displayYear)]
    if (coachRecord?.team) {
      return coachRecord.team
    }
    return getCurrentTeamAbbr(currentDynasty)
  }, [currentDynasty, displayYear])

  const customConferencesForYear = getCustomConferencesForYear(currentDynasty, displayYear)
  const userConference = getTeamConferenceForDynasty(currentDynasty, userTeamAbbrForYear, displayYear) || 'SEC'

  const availableConferences = useMemo(() => {
    if (customConferencesForYear && Object.keys(customConferencesForYear).length > 0) {
      return Object.keys(customConferencesForYear).sort()
    }
    return getAllConferences().sort()
  }, [customConferencesForYear])

  const getConferenceTeams = (conf) => {
    if (customConferencesForYear && customConferencesForYear[conf]) {
      return customConferencesForYear[conf]
    }
    return conferenceTeams[conf] || []
  }

  const decodeConference = (urlConf) => {
    if (!urlConf) return null
    const decoded = decodeURIComponent(urlConf)
    let match = availableConferences.find(c => c.toLowerCase() === decoded.toLowerCase())
    if (match) return match
    const withSpaces = decoded.replace(/-/g, ' ')
    match = availableConferences.find(c => c.toLowerCase() === withSpaces.toLowerCase())
    return match
  }

  const encodeConference = (conf) => {
    return encodeURIComponent(conf.replace(/\s+/g, '-'))
  }

  const displayConference = decodeConference(urlConference) || userConference
  const confTheme = CONFERENCE_THEMES[displayConference] || { primary: '#3b82f6', secondary: '#fff', accent: '#3b82f6' }

  const allConference = useMemo(() => {
    if (yearData.allConferenceByConference && yearData.allConferenceByConference[displayConference]) {
      return yearData.allConferenceByConference[displayConference]
    }
    const allConferenceRaw = yearData.allConference || []
    if (allConferenceRaw.length === 0) return []
    const conferenceTeamsList = getConferenceTeams(displayConference)
    return allConferenceRaw.filter(player => {
      if (!player.school) return false
      return conferenceTeamsList.includes(player.school.toUpperCase()) || conferenceTeamsList.includes(player.school)
    })
  }, [yearData, displayConference])

  const handleYearChange = (year) => {
    navigate(`${pathPrefix}/all-conference/${year}/${encodeConference(displayConference)}`)
  }

  const handleConferenceChange = (conf) => {
    navigate(`${pathPrefix}/all-conference/${displayYear}/${encodeConference(conf)}`)
  }

  const handleAllConferenceSave = async (data) => {
    const year = displayYear

    if (data.allConference && data.allConference.length > 0) {
      const acEntries = data.allConference.map(entry => ({
        ...entry,
        name: entry.player,
        honorCategory: 'allConference'
      }))

      let result = await processHonorPlayers(
        currentDynasty.id,
        'allConference',
        acEntries,
        year,
        []
      )

      if (result.needsConfirmation && result.confirmations?.length > 0) {
        const autoDecisions = result.confirmations.map(conf => ({
          entryIndex: conf.entryIndex,
          isSamePlayer: false
        }))

        await processHonorPlayers(
          currentDynasty.id,
          'allConference',
          acEntries,
          year,
          autoDecisions
        )
      }
    }

    const existingByYear = currentDynasty.allAmericansByYear || {}
    const existingYearData = existingByYear[year] || {}
    await updateDynasty(currentDynasty.id, {
      allAmericansByYear: {
        ...existingByYear,
        [year]: {
          ...existingYearData,
          allConference: data.allConference || [],
          allConferenceByConference: data.allConferenceByConference || {}
        }
      }
    })
  }

  const filteredPlayers = filter === 'all'
    ? allConference
    : allConference.filter(p => p.designation === filter)

  const groupedByDesignation = {
    first: allConference.filter(p => p.designation === 'first'),
    second: allConference.filter(p => p.designation === 'second'),
    freshman: allConference.filter(p => p.designation === 'freshman')
  }

  const findPlayerByNameAndSchool = (playerName, school) => {
    if (!playerName || !currentDynasty.players) return null
    const normalizedName = normalizePlayerName(cleanPlayerName(playerName))
    const normalizedSchool = school?.toUpperCase()

    const playerMatchesSchool = (p) => {
      if (!normalizedSchool) return false
      if (p.allConference?.length > 0) {
        if (p.allConference.some(ac => ac.school?.toUpperCase() === normalizedSchool)) {
          return true
        }
      }
      if (p.allAmericans?.length > 0) {
        if (p.allAmericans.some(aa => aa.school?.toUpperCase() === normalizedSchool)) {
          return true
        }
      }
      if (p.team) {
        const playerTeamAbbr = typeof p.team === 'number'
          ? TEAMS[p.team]?.abbr?.toUpperCase()
          : p.team.toUpperCase()
        if (playerTeamAbbr === normalizedSchool) return true
      }
      if (p.teamsByYear) {
        for (const tid of Object.values(p.teamsByYear)) {
          if (typeof tid === 'number' && TEAMS[tid]?.abbr?.toUpperCase() === normalizedSchool) {
            return true
          }
          if (typeof tid === 'string' && tid.toUpperCase() === normalizedSchool) {
            return true
          }
        }
      }
      return false
    }

    const nameMatches = currentDynasty.players.filter(p =>
      normalizePlayerName(p.name) === normalizedName
    )

    if (nameMatches.length === 0) return null
    if (nameMatches.length === 1) return nameMatches[0]

    const schoolMatch = nameMatches.find(p => playerMatchesSchool(p))
    if (schoolMatch) return schoolMatch

    return nameMatches[0]
  }

  // Featured player card - compact on mobile
  const FeaturedPlayerCard = ({ player, designation }) => {
    const config = DESIGNATION_CONFIG[designation]
    const mascotName = getMascotName(player.school, currentDynasty?.teams || currentDynasty?.customTeams)
    const teamLogo = mascotName ? getTeamLogo(mascotName, currentDynasty?.teams || currentDynasty?.customTeams) : null
    const colors = mascotName ? getTeamColors(mascotName, currentDynasty?.teams || currentDynasty?.customTeams) : { primary: confTheme.primary, secondary: '#fff' }
    const matchingPlayer = findPlayerByNameAndSchool(player.player, player.school)
    const schoolName = getSchoolName(mascotName) || player.school

    return (
      <div
        className="group relative overflow-hidden rounded-lg sm:rounded-xl transition-all duration-300 hover:scale-[1.02]"
        style={{
          background: `linear-gradient(135deg, ${colors.primary}20 0%, rgba(15,23,42,0.95) 100%)`,
          border: `1px solid ${colors.primary}40`
        }}
      >
        <div
          className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-2xl opacity-20 group-hover:opacity-40 transition-opacity hidden sm:block"
          style={{ backgroundColor: colors.primary }}
        />

        <div className="relative p-2 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-4">
            {teamLogo && (
              <Link
                to={`${pathPrefix}/team/${resolveTid(player.school, currentDynasty?.teams || TEAMS)}/${displayYear}`}
                className="w-8 h-8 sm:w-14 sm:h-14 rounded-full bg-white p-0.5 sm:p-1 shadow-lg flex-shrink-0 hover:scale-110 transition-transform"
              >
                <img src={teamLogo} alt="" className="w-full h-full object-contain" />
              </Link>
            )}

            <div className="flex-1 min-w-0">
              {matchingPlayer ? (
                <Link
                  to={`${pathPrefix}/player/${matchingPlayer.pid}`}
                  className="font-bold text-white text-sm sm:text-lg hover:text-slate-200 transition-colors truncate block"
                >
                  {cleanPlayerName(player.player)}
                </Link>
              ) : (
                <span className="font-bold text-white text-sm sm:text-lg truncate block">
                  {cleanPlayerName(player.player)}
                </span>
              )}
              <div className="flex items-center gap-1 sm:gap-x-2 mt-0.5">
                <span
                  className="px-1 sm:px-2 py-0.5 rounded text-[8px] sm:text-xs font-bold"
                  style={{ backgroundColor: `${colors.primary}30`, color: colors.primary }}
                >
                  {player.position}
                </span>
                <span className="text-slate-400 text-[10px] sm:text-sm">{player.class}</span>
                <span className="text-slate-600 hidden sm:inline">|</span>
                <span className="text-slate-500 text-[10px] sm:hidden truncate">{schoolName}</span>
                <Link
                  to={`${pathPrefix}/team/${resolveTid(player.school, currentDynasty?.teams || TEAMS)}/${displayYear}`}
                  className="text-slate-400 text-sm hover:text-slate-300 transition-colors truncate hidden sm:inline"
                >
                  {schoolName}
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="h-0.5" style={{ backgroundColor: colors.primary }} />
      </div>
    )
  }

  // Compact player row - even more compact on mobile
  const PlayerRow = ({ player }) => {
    const mascotName = getMascotName(player.school, currentDynasty?.teams || currentDynasty?.customTeams)
    const teamLogo = mascotName ? getTeamLogo(mascotName, currentDynasty?.teams || currentDynasty?.customTeams) : null
    const colors = mascotName ? getTeamColors(mascotName, currentDynasty?.teams || currentDynasty?.customTeams) : { primary: '#64748b', secondary: '#fff' }
    const matchingPlayer = findPlayerByNameAndSchool(player.player, player.school)
    const schoolName = getSchoolName(mascotName) || player.school

    return (
      <div className="group flex items-center gap-1.5 sm:gap-3 py-1.5 sm:py-2.5 px-2 sm:px-3 hover:bg-white/5 rounded-lg transition-all">
        {teamLogo && (
          <Link
            to={`${pathPrefix}/team/${resolveTid(player.school, currentDynasty?.teams || TEAMS)}/${displayYear}`}
            className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-white p-0.5 flex-shrink-0 shadow-sm hover:scale-110 transition-transform"
          >
            <img src={teamLogo} alt="" className="w-full h-full object-contain" />
          </Link>
        )}

        <div className="flex-1 min-w-0">
          {matchingPlayer ? (
            <Link
              to={`${pathPrefix}/player/${matchingPlayer.pid}`}
              className="font-medium text-white text-[11px] sm:text-sm hover:text-slate-300 transition-colors truncate block"
            >
              {cleanPlayerName(player.player)}
            </Link>
          ) : (
            <span className="font-medium text-white text-[11px] sm:text-sm truncate block">
              {cleanPlayerName(player.player)}
            </span>
          )}
          <span className="text-[9px] sm:text-xs text-slate-500 truncate block">{schoolName}</span>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          <span className="text-[10px] sm:text-xs text-slate-500 hidden sm:inline">{player.class}</span>
          <span
            className="px-1 py-0.5 rounded text-[8px] sm:text-[10px] font-bold"
            style={{ backgroundColor: `${colors.primary}25`, color: colors.primary }}
          >
            {player.position}
          </span>
        </div>
      </div>
    )
  }

  // Team section - compact on mobile
  const TeamSection = ({ designation, players }) => {
    if (players.length === 0) return null
    const config = DESIGNATION_CONFIG[designation]

    const featured = players.slice(0, 3)
    const rest = players.slice(3)

    return (
      <div className="space-y-2 sm:space-y-4">
        <div className="flex items-center gap-2 sm:gap-4">
          <div
            className="px-2 sm:px-4 py-1 sm:py-2 rounded-md sm:rounded-lg font-bold text-[10px] sm:text-sm whitespace-nowrap"
            style={{ background: config.gradient, color: config.textColor }}
          >
            {config.label} All-{displayConference}
          </div>
          <div className="flex-1 h-px bg-gradient-to-r from-slate-700 to-transparent" />
          <span className="text-[9px] sm:text-xs text-slate-500 whitespace-nowrap">
            {players.length}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 sm:gap-3">
          {featured.map((player, idx) => (
            <FeaturedPlayerCard
              key={`featured-${player.position}-${player.player}-${idx}`}
              player={player}
              designation={designation}
            />
          ))}
        </div>

        {rest.length > 0 && (
          <div className="rounded-lg sm:rounded-xl overflow-hidden bg-slate-800/30 border border-slate-700/50">
            {rest.map((player, idx) => (
              <PlayerRow
                key={`row-${player.position}-${player.player}-${idx}`}
                player={player}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  const hasAnyPlayers = allConference.length > 0

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Compact Hero Header with conference branding */}
      <div className="relative overflow-hidden rounded-xl sm:rounded-2xl">
        {/* Background */}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, ${confTheme.primary}15 0%, #0f172a 40%, #020617 100%)`
          }}
        />

        {/* Conference accent pattern - hidden on mobile */}
        <div
          className="absolute inset-0 opacity-[0.03] hidden sm:block"
          style={{
            backgroundImage: `repeating-linear-gradient(
              45deg,
              ${confTheme.primary} 0px,
              ${confTheme.primary} 1px,
              transparent 1px,
              transparent 20px
            )`
          }}
        />

        {/* Conference color glow - hidden on mobile */}
        <div
          className="absolute -top-20 -right-20 w-72 h-72 rounded-full blur-3xl opacity-20 hidden sm:block"
          style={{ backgroundColor: confTheme.primary }}
        />

        <div className="relative px-3 py-3 sm:px-8 sm:py-8">
          <div className="flex flex-col gap-2 sm:gap-6">
            {/* Title row - compact on mobile */}
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-2">
                  <div
                    className="w-1 sm:w-1.5 h-4 sm:h-6 rounded-full"
                    style={{ background: `linear-gradient(to bottom, ${confTheme.primary}, ${confTheme.accent})` }}
                  />
                  <span
                    className="text-[8px] sm:text-[10px] font-bold uppercase tracking-[0.15em] sm:tracking-[0.2em]"
                    style={{ color: `${confTheme.primary}cc` }}
                  >
                    {displayYear} Season
                  </span>
                </div>
                <h1 className="text-lg sm:text-3xl md:text-4xl font-black text-white tracking-tight">
                  All-{displayConference}
                </h1>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-3">
                {/* Conference selector */}
                <div className="relative">
                  <select
                    value={displayConference}
                    onChange={(e) => handleConferenceChange(e.target.value)}
                    className="appearance-none pl-2 sm:pl-4 pr-6 sm:pr-10 py-1.5 sm:py-2.5 rounded-lg sm:rounded-xl text-[10px] sm:text-base font-semibold bg-slate-800/80 text-white border border-slate-600/50 focus:outline-none focus:ring-2 cursor-pointer hover:bg-slate-700/80 transition-colors"
                    style={{ borderColor: `${confTheme.primary}40`, '--tw-ring-color': `${confTheme.primary}80` }}
                  >
                    {availableConferences.map((conf) => (
                      <option key={conf} value={conf}>{conf}</option>
                    ))}
                  </select>
                  <svg className="absolute right-1.5 sm:right-3 top-1/2 -translate-y-1/2 w-3 h-3 sm:w-5 sm:h-5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {/* Year selector */}
                <div className="relative">
                  <select
                    value={displayYear}
                    onChange={(e) => handleYearChange(parseInt(e.target.value))}
                    className="appearance-none pl-2.5 pr-7 py-1.5 sm:pl-4 sm:pr-10 sm:py-2.5 rounded-lg sm:rounded-xl font-bold text-sm sm:text-xl bg-slate-800/80 text-white border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 cursor-pointer hover:bg-slate-700/80 transition-colors"
                  >
                    {availableYears.map((year) => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                  <svg className="absolute right-1.5 sm:right-3 top-1/2 -translate-y-1/2 w-4 sm:w-5 h-4 sm:h-5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {!isViewOnly && (
                  <button
                    onClick={() => setShowEditModal(true)}
                    className="p-1.5 sm:px-4 sm:py-2.5 rounded-lg sm:rounded-xl font-semibold hover:opacity-90 transition-all flex items-center gap-2 shadow-lg"
                    style={{
                      background: `linear-gradient(135deg, ${teamColors.primary} 0%, ${teamColors.primary}dd 100%)`,
                      color: getContrastTextColor(teamColors.primary)
                    }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    <span className="hidden sm:inline">Edit</span>
                  </button>
                )}
              </div>
            </div>

            {/* Filter tabs - compact scrollable on mobile */}
            {hasAnyPlayers && (
              <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-max sm:min-w-0 sm:flex-wrap">
                  {[
                    { key: 'all', label: 'All', mobileLabel: 'All', count: allConference.length },
                    { key: 'first', label: '1st Team', mobileLabel: '1st', count: groupedByDesignation.first.length },
                    { key: 'second', label: '2nd Team', mobileLabel: '2nd', count: groupedByDesignation.second.length },
                    { key: 'freshman', label: 'Freshman', mobileLabel: 'Fr', count: groupedByDesignation.freshman.length }
                  ].map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setFilter(tab.key)}
                      className="px-2 sm:px-4 py-1.5 sm:py-2 rounded-md sm:rounded-lg text-[10px] sm:text-sm font-semibold transition-all whitespace-nowrap"
                      style={{
                        backgroundColor: filter === tab.key ? `${confTheme.primary}20` : 'rgba(51, 65, 85, 0.3)',
                        color: filter === tab.key ? confTheme.primary : '#94a3b8',
                        border: filter === tab.key ? `1px solid ${confTheme.primary}40` : '1px solid transparent'
                      }}
                    >
                      <span className="sm:hidden">{tab.mobileLabel}</span>
                      <span className="hidden sm:inline">{tab.label}</span>
                      {tab.count > 0 && (
                        <span className="ml-1 text-[9px] sm:text-xs opacity-70">({tab.count})</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      {!hasAnyPlayers ? (
        /* Empty State */
        <div className="min-h-[40vh] flex items-center justify-center">
          <div className="text-center max-w-md mx-auto px-6">
            <div
              className="w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${confTheme.primary}30 0%, ${confTheme.primary}10 100%)` }}
            >
              <svg
                className="w-10 h-10"
                style={{ color: `${confTheme.primary}80` }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-3">No All-{displayConference} Yet</h2>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              All-Conference selections for the {displayYear} {displayConference} season haven't been recorded yet.
            </p>
            {!isViewOnly && (
              <button
                onClick={() => setShowEditModal(true)}
                className="px-5 py-2.5 rounded-xl font-semibold transition-all"
                style={{
                  background: `linear-gradient(135deg, ${teamColors.primary} 0%, ${teamColors.primary}dd 100%)`,
                  color: getContrastTextColor(teamColors.primary)
                }}
              >
                Add All-Conference
              </button>
            )}
          </div>
        </div>
      ) : filter === 'all' ? (
        <div className="space-y-4 sm:space-y-8">
          <TeamSection designation="first" players={groupedByDesignation.first} />
          <TeamSection designation="second" players={groupedByDesignation.second} />
          <TeamSection designation="freshman" players={groupedByDesignation.freshman} />
        </div>
      ) : (
        <TeamSection
          designation={filter}
          players={filteredPlayers}
        />
      )}

      {/* All-Conference Modal */}
      <AllConferenceModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSave={handleAllConferenceSave}
        currentYear={displayYear}
        teamColors={teamColors}
      />
    </div>
  )
}
