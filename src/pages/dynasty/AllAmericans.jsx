import { useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { getContrastTextColor } from '../../utils/colorUtils'
import { teamAbbreviations } from '../../data/teamAbbreviations'
import { getTeamLogo, getMascotName as getMascotNameFromTeams } from '../../data/teams'
import { getTeamColors } from '../../data/teamColors'
import { TEAMS, resolveTid, getTidFromAbbr } from '../../data/teamRegistry'
import AllAmericansModal from '../../components/AllAmericansModal'
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

// Helper function to clean player names by removing prefix symbols
const cleanPlayerName = (name) => {
  if (!name) return ''
  return name.replace(/^[\s★⭐✦•*·●◆♦▪■\-–—]+/, '').trim()
}

// Designation config
const DESIGNATION_CONFIG = {
  first: {
    label: 'First Team',
    shortLabel: '1st',
    gradient: 'from-amber-500 to-yellow-600',
    bgGradient: 'linear-gradient(135deg, #d4af37 0%, #b8860b 100%)',
    textColor: '#000',
    accentColor: '#d4af37',
    description: 'Elite performers'
  },
  second: {
    label: 'Second Team',
    shortLabel: '2nd',
    gradient: 'from-slate-400 to-slate-500',
    bgGradient: 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)',
    textColor: '#000',
    accentColor: '#94a3b8',
    description: 'Outstanding contributors'
  },
  freshman: {
    label: 'Freshman',
    shortLabel: 'Fr',
    gradient: 'from-blue-500 to-indigo-600',
    bgGradient: 'linear-gradient(135deg, #3b82f6 0%, #4f46e5 100%)',
    textColor: '#fff',
    accentColor: '#3b82f6',
    description: 'Rising stars'
  }
}

export default function AllAmericans() {
  const { year: urlYear } = useParams()
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
  const allAmericans = yearData.allAmericans || []

  const handleYearChange = (year) => {
    navigate(`${pathPrefix}/all-americans/${year}`)
  }

  const handleAllAmericansSave = async (data) => {
    const year = displayYear

    if (data.allAmericans && data.allAmericans.length > 0) {
      const aaEntries = data.allAmericans.map(entry => ({
        ...entry,
        name: entry.player,
        honorCategory: 'allAmericans'
      }))

      let aaResult = await processHonorPlayers(
        currentDynasty.id,
        'allAmericans',
        aaEntries,
        year,
        []
      )

      if (aaResult.needsConfirmation && aaResult.confirmations?.length > 0) {
        const autoDecisions = aaResult.confirmations.map(conf => ({
          entryIndex: conf.entryIndex,
          isSamePlayer: false
        }))

        await processHonorPlayers(
          currentDynasty.id,
          'allAmericans',
          aaEntries,
          year,
          autoDecisions
        )
      }
    }

    if (data.allConference && data.allConference.length > 0) {
      const acEntries = data.allConference.map(entry => ({
        ...entry,
        name: entry.player,
        honorCategory: 'allConference'
      }))

      let acResult = await processHonorPlayers(
        currentDynasty.id,
        'allConference',
        acEntries,
        year,
        []
      )

      if (acResult.needsConfirmation && acResult.confirmations?.length > 0) {
        const autoDecisions = acResult.confirmations.map(conf => ({
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
          ...data
        }
      }
    })
  }

  const filteredPlayers = filter === 'all'
    ? allAmericans
    : allAmericans.filter(p => p.designation === filter)

  const groupedByDesignation = {
    first: allAmericans.filter(p => p.designation === 'first'),
    second: allAmericans.filter(p => p.designation === 'second'),
    freshman: allAmericans.filter(p => p.designation === 'freshman')
  }

  const findPlayerByNameAndSchool = (playerName, school) => {
    if (!playerName || !currentDynasty.players) return null
    const normalizedName = normalizePlayerName(cleanPlayerName(playerName))
    const normalizedSchool = school?.toUpperCase()

    const playerMatchesSchool = (p) => {
      if (!normalizedSchool) return false
      if (p.allAmericans?.length > 0) {
        if (p.allAmericans.some(aa => aa.school?.toUpperCase() === normalizedSchool)) {
          return true
        }
      }
      if (p.allConference?.length > 0) {
        if (p.allConference.some(ac => ac.school?.toUpperCase() === normalizedSchool)) {
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

  // Featured player card for top of section - compact on mobile
  const FeaturedPlayerCard = ({ player, designation }) => {
    const config = DESIGNATION_CONFIG[designation]
    const mascotName = getMascotName(player.school, currentDynasty?.teams || currentDynasty?.customTeams)
    const teamLogo = mascotName ? getTeamLogo(mascotName, currentDynasty?.teams || currentDynasty?.customTeams) : null
    const colors = mascotName ? getTeamColors(mascotName, currentDynasty?.teams || currentDynasty?.customTeams) : { primary: config.accentColor, secondary: '#fff' }
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
        {/* Team color accent glow - desktop only */}
        <div
          className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-2xl opacity-20 group-hover:opacity-40 transition-opacity hidden sm:block"
          style={{ backgroundColor: colors.primary }}
        />

        <div className="relative p-2 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Team logo */}
            {teamLogo && (
              <Link
                to={`${pathPrefix}/team/${resolveTid(player.school, currentDynasty?.teams || TEAMS)}/${displayYear}`}
                className="w-8 h-8 sm:w-14 sm:h-14 rounded-full bg-white p-0.5 sm:p-1 shadow-lg flex-shrink-0 hover:scale-110 transition-transform"
              >
                <img src={teamLogo} alt="" className="w-full h-full object-contain" />
              </Link>
            )}

            {/* Player info */}
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

        {/* Bottom team color bar */}
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
        {/* Team logo */}
        {teamLogo && (
          <Link
            to={`${pathPrefix}/team/${resolveTid(player.school, currentDynasty?.teams || TEAMS)}/${displayYear}`}
            className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-white p-0.5 flex-shrink-0 shadow-sm hover:scale-110 transition-transform"
          >
            <img src={teamLogo} alt="" className="w-full h-full object-contain" />
          </Link>
        )}

        {/* Player name */}
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

        {/* Position + Class */}
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

  // Team section with designation styling - compact on mobile
  const TeamSection = ({ designation, players }) => {
    if (players.length === 0) return null
    const config = DESIGNATION_CONFIG[designation]

    // Split into featured (first 3) and rest
    const featured = players.slice(0, 3)
    const rest = players.slice(3)

    return (
      <div className="space-y-2 sm:space-y-4">
        {/* Section header */}
        <div className="flex items-center gap-2 sm:gap-4">
          <div
            className="px-2 sm:px-4 py-1 sm:py-2 rounded-md sm:rounded-lg font-bold text-[10px] sm:text-sm whitespace-nowrap"
            style={{ background: config.bgGradient, color: config.textColor }}
          >
            {config.label} All-American
          </div>
          <div className="flex-1 h-px bg-gradient-to-r from-slate-700 to-transparent" />
          <span className="text-[9px] sm:text-xs text-slate-500 whitespace-nowrap">
            {players.length}
          </span>
        </div>

        {/* Featured cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 sm:gap-3">
          {featured.map((player, idx) => (
            <FeaturedPlayerCard
              key={`featured-${player.position}-${player.player}-${idx}`}
              player={player}
              designation={designation}
            />
          ))}
        </div>

        {/* Rest of players in compact list */}
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

  const hasAnyPlayers = allAmericans.length > 0

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Compact Hero Header */}
      <div className="relative overflow-hidden rounded-xl sm:rounded-2xl">
        {/* Background */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 50%, #020617 100%)'
          }}
        />

        {/* Stars pattern - hidden on mobile */}
        <div
          className="absolute inset-0 opacity-[0.03] hidden sm:block"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23d4af37' fill-opacity='1'%3E%3Cpath d='M20 5l1.5 4.5H26l-3.5 2.5 1.5 4.5-4-3-4 3 1.5-4.5L14 9.5h4.5z'/%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />

        {/* Gold accent glow - hidden on mobile */}
        <div
          className="absolute -top-20 -right-20 w-60 h-60 rounded-full blur-3xl opacity-15 hidden sm:block"
          style={{ background: 'linear-gradient(135deg, #d4af37 0%, #b8860b 100%)' }}
        />

        <div className="relative px-3 py-3 sm:px-8 sm:py-8">
          <div className="flex flex-col gap-2 sm:gap-6">
            {/* Title and year - compact row on mobile */}
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-2">
                  <div className="w-1 sm:w-1.5 h-4 sm:h-6 rounded-full bg-gradient-to-b from-amber-400 to-amber-600" />
                  <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-[0.15em] sm:tracking-[0.2em] text-amber-500/80">
                    {displayYear} Season
                  </span>
                </div>
                <h1 className="text-lg sm:text-3xl md:text-4xl font-black text-white tracking-tight">
                  All-Americans
                </h1>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <select
                    value={displayYear}
                    onChange={(e) => handleYearChange(parseInt(e.target.value))}
                    className="appearance-none pl-2.5 pr-7 py-1.5 sm:pl-4 sm:pr-10 sm:py-2.5 rounded-lg sm:rounded-xl font-bold text-sm sm:text-xl bg-slate-800/80 text-white border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-amber-500/50 cursor-pointer hover:bg-slate-700/80 transition-colors"
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
                    { key: 'all', label: 'All', mobileLabel: 'All', count: allAmericans.length },
                    { key: 'first', label: '1st Team', mobileLabel: '1st', count: groupedByDesignation.first.length },
                    { key: 'second', label: '2nd Team', mobileLabel: '2nd', count: groupedByDesignation.second.length },
                    { key: 'freshman', label: 'Freshman', mobileLabel: 'Fr', count: groupedByDesignation.freshman.length }
                  ].map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setFilter(tab.key)}
                      className="px-2 sm:px-4 py-1.5 sm:py-2 rounded-md sm:rounded-lg text-[10px] sm:text-sm font-semibold transition-all whitespace-nowrap"
                      style={{
                        backgroundColor: filter === tab.key ? 'rgba(245, 158, 11, 0.15)' : 'rgba(51, 65, 85, 0.3)',
                        color: filter === tab.key ? '#f59e0b' : '#94a3b8',
                        border: filter === tab.key ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid transparent'
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
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 flex items-center justify-center">
              <svg className="w-10 h-10 text-amber-500/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-3">No All-Americans Yet</h2>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              All-American selections for the {displayYear} season haven't been recorded yet.
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
                Add All-Americans
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

      {/* All-Americans Modal */}
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
