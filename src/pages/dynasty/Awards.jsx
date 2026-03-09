import { useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useTeamColors } from '../../hooks/useTeamColors'
import { getContrastTextColor } from '../../utils/colorUtils'
import { teamAbbreviations } from '../../data/teamAbbreviations'
import { getTeamLogo, getMascotName as getMascotNameFromTeams } from '../../data/teams'
import { getTeamColors } from '../../data/teamColors'
import { TEAMS, resolveTid, getCurrentTeamAbbr, getTidFromAbbr } from '../../data/teamRegistry'
import AwardsModal from '../../components/AwardsModal'
import { normalizePlayerName as normalizePlayerNameUtil } from '../../utils/playerMatching'

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

// Award display names and categories
const AWARD_DISPLAY = {
  heisman: { name: 'Heisman Trophy', category: 'player', prestige: 'legendary' },
  maxwell: { name: 'Maxwell Award', category: 'player', prestige: 'elite' },
  walterCamp: { name: 'Walter Camp Award', category: 'player', prestige: 'elite' },
  bearBryantCoachOfTheYear: { name: 'Bear Bryant Coach of the Year', category: 'coach', prestige: 'elite' },
  daveyObrien: { name: 'Davey O\'Brien Award', category: 'offense', prestige: 'position' },
  chuckBednarik: { name: 'Chuck Bednarik Award', category: 'defense', prestige: 'elite' },
  broncoNagurski: { name: 'Bronco Nagurski Trophy', category: 'defense', prestige: 'elite' },
  jimThorpe: { name: 'Jim Thorpe Award', category: 'defense', prestige: 'position' },
  doakWalker: { name: 'Doak Walker Award', category: 'offense', prestige: 'position' },
  fredBiletnikoff: { name: 'Fred Biletnikoff Award', category: 'offense', prestige: 'position' },
  lombardi: { name: 'Lombardi Award', category: 'lineman', prestige: 'elite' },
  unitasGoldenArm: { name: 'Unitas Golden Arm Award', category: 'offense', prestige: 'position' },
  edgeRusherOfTheYear: { name: 'Edge Rusher of the Year', category: 'defense', prestige: 'position' },
  outland: { name: 'Outland Trophy', category: 'lineman', prestige: 'elite' },
  johnMackey: { name: 'John Mackey Award', category: 'offense', prestige: 'position' },
  broyles: { name: 'Broyles Award', category: 'coach', prestige: 'position' },
  dickButkus: { name: 'Dick Butkus Award', category: 'defense', prestige: 'position' },
  rimington: { name: 'Rimington Trophy', category: 'lineman', prestige: 'position' },
  louGroza: { name: 'Lou Groza Award', category: 'special', prestige: 'position' },
  rayGuy: { name: 'Ray Guy Award', category: 'special', prestige: 'position' },
  returnerOfTheYear: { name: 'Returner of the Year', category: 'special', prestige: 'position' }
}

// Order of awards for display
const AWARD_ORDER = [
  'heisman', 'maxwell', 'walterCamp', 'daveyObrien', 'doakWalker',
  'fredBiletnikoff', 'johnMackey', 'unitasGoldenArm',
  'chuckBednarik', 'broncoNagurski', 'jimThorpe', 'dickButkus', 'edgeRusherOfTheYear',
  'outland', 'lombardi', 'rimington',
  'louGroza', 'rayGuy', 'returnerOfTheYear',
  'bearBryantCoachOfTheYear', 'broyles'
]

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

export default function Awards() {
  const { id, year: urlYear } = useParams()
  const navigate = useNavigate()
  const { currentDynasty, updateDynasty, isViewOnly, processHonorPlayers } = useDynasty()
  const pathPrefix = usePathPrefix()
  const [showAwardsModal, setShowAwardsModal] = useState(false)

  const teamAbbr = getCurrentTeamAbbr(currentDynasty) || ''
  const teamColors = useTeamColors(currentDynasty?.teamName, currentDynasty?.teams || currentDynasty?.customTeams)

  if (!currentDynasty) return null

  const awardsByYear = currentDynasty.awardsByYear || {}
  const startYear = currentDynasty.startYear || currentDynasty.currentYear
  const availableYears = []
  for (let year = currentDynasty.currentYear; year >= startYear; year--) {
    availableYears.push(year)
  }

  const displayYear = urlYear ? parseInt(urlYear) : currentDynasty.currentYear - 1
  const yearAwards = awardsByYear[displayYear] || {}

  const handleYearChange = (year) => {
    navigate(`${pathPrefix}/awards/${year}`)
  }

  const handleAwardsSave = async (awards) => {
    const year = displayYear
    const entries = Object.entries(awards).map(([awardKey, data]) => ({
      ...data,
      award: awardKey,
      name: data.player
    })).filter(e => e.player)

    let result = await processHonorPlayers(
      currentDynasty.id,
      'awards',
      entries,
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
        'awards',
        entries,
        year,
        autoDecisions
      )
    }

    const existingByYear = currentDynasty.awardsByYear || {}
    await updateDynasty(currentDynasty.id, {
      awardsByYear: {
        ...existingByYear,
        [year]: awards
      }
    })

    setShowAwardsModal(false)
  }

  const findPlayerByName = (playerName, teamAbbrVal = null, awardYear = null) => {
    if (!playerName || !currentDynasty.players) return null
    const normalizedName = normalizePlayerNameUtil(playerName)
    const teamTid = teamAbbrVal ? getTidFromAbbr(teamAbbrVal) : null

    if (teamAbbrVal) {
      const exactMatch = currentDynasty.players.find(p => {
        if (normalizePlayerNameUtil(p.name) !== normalizedName) return false
        if (teamTid && p.teamsByYear) {
          const playerTeams = Object.values(p.teamsByYear)
          if (playerTeams.includes(teamTid) || playerTeams.includes(teamAbbrVal)) return true
        }
        if (p.team === teamTid || p.team === teamAbbrVal) return true
        if (p.teams?.includes(teamAbbrVal)) return true
        return false
      })
      if (exactMatch) return exactMatch
    }

    if (awardYear) {
      const accoladeMatch = currentDynasty.players.find(p => {
        if (normalizePlayerNameUtil(p.name) !== normalizedName) return false
        if (p.accolades?.some(a => a.year === awardYear)) return true
        return false
      })
      if (accoladeMatch) return accoladeMatch
    }

    return currentDynasty.players.find(p =>
      normalizePlayerNameUtil(p.name) === normalizedName
    )
  }

  // Heisman Trophy - The crown jewel (compact on mobile)
  const HeismanCard = ({ awardData }) => {
    const mascotName = getMascotName(awardData.team, currentDynasty?.teams || currentDynasty?.customTeams)
    const teamLogo = mascotName ? getTeamLogo(mascotName, currentDynasty?.teams || currentDynasty?.customTeams) : null
    const colors = mascotName ? getTeamColors(mascotName, currentDynasty?.teams || currentDynasty?.customTeams) : { primary: '#b8860b', secondary: '#fff' }
    const matchingPlayer = findPlayerByName(awardData.player, awardData.team, displayYear)
    const schoolName = getSchoolName(mascotName) || awardData.team

    return (
      <div className="relative overflow-hidden rounded-xl sm:rounded-2xl">
        {/* Dramatic gradient background */}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, #1a1510 0%, #0d0b08 50%, #000000 100%)`
          }}
        />

        {/* Gold particle overlay - simplified on mobile */}
        <div
          className="absolute inset-0 opacity-20 sm:opacity-30"
          style={{
            backgroundImage: `radial-gradient(circle at 20% 30%, #d4af37 1px, transparent 1px),
                              radial-gradient(circle at 80% 70%, #d4af37 1px, transparent 1px)`,
            backgroundSize: '60px 60px, 80px 80px'
          }}
        />

        {/* Spotlight glow - hidden on mobile */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-48 blur-3xl opacity-40 hidden sm:block"
          style={{ background: 'radial-gradient(ellipse, #d4af37 0%, transparent 70%)' }}
        />

        <div className="relative px-3 py-3 sm:px-10 sm:py-10">
          {/* Mobile: Horizontal compact layout */}
          <div className="flex items-center gap-3 sm:hidden">
            {/* Team logo - small */}
            <Link
              to={`${pathPrefix}/team/${resolveTid(awardData.team, currentDynasty?.teams || TEAMS)}/${displayYear}`}
              className="w-12 h-12 rounded-full bg-white p-1 shadow-lg flex-shrink-0 ring-2 ring-amber-500/30"
            >
              {teamLogo ? (
                <img src={teamLogo} alt="" className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full rounded-full flex items-center justify-center" style={{ backgroundColor: colors.primary }}>
                  <span className="text-lg font-bold" style={{ color: colors.secondary }}>{awardData.team?.charAt(0)}</span>
                </div>
              )}
            </Link>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="text-[9px] font-bold uppercase tracking-wider text-amber-500/70 mb-0.5">
                Heisman Trophy
              </div>
              {matchingPlayer ? (
                <Link
                  to={`${pathPrefix}/player/${matchingPlayer.pid}`}
                  className="text-base font-black text-white hover:text-amber-300 transition-colors block truncate"
                >
                  {awardData.player}
                </Link>
              ) : (
                <span className="text-base font-black text-white block truncate">
                  {awardData.player}
                </span>
              )}
              <div className="flex items-center gap-1.5 text-[10px] text-amber-200/60">
                <span className="text-amber-400 font-semibold">{awardData.position}</span>
                <span className="text-amber-600/40">•</span>
                <span>{awardData.class}</span>
                <span className="text-amber-600/40">•</span>
                <span className="truncate">{schoolName}</span>
              </div>
            </div>
          </div>

          {/* Desktop: Original elaborate layout */}
          <div className="hidden sm:flex flex-col lg:flex-row items-center gap-6 lg:gap-10">
            {/* Trophy side */}
            <div className="text-center lg:text-left flex-shrink-0">
              <div className="inline-flex items-center gap-2 mb-3">
                <div className="w-1 h-6 rounded-full bg-gradient-to-b from-amber-400 to-amber-600" />
                <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-500/80">
                  {displayYear} Winner
                </span>
              </div>
              <h2 className="text-3xl md:text-4xl font-black tracking-tight bg-gradient-to-r from-amber-200 via-yellow-400 to-amber-200 bg-clip-text text-transparent">
                Heisman Trophy
              </h2>
              <p className="text-amber-600/60 text-xs mt-1 tracking-wide">
                Most Outstanding Player in College Football
              </p>
            </div>

            {/* Winner info */}
            <div className="flex flex-row items-center gap-5 bg-black/30 rounded-xl px-6 py-4 border border-amber-900/30">
              {/* Team logo */}
              <Link
                to={`${pathPrefix}/team/${resolveTid(awardData.team, currentDynasty?.teams || TEAMS)}/${displayYear}`}
                className="w-20 h-20 rounded-full bg-white p-1.5 shadow-xl flex-shrink-0 hover:scale-105 transition-transform ring-2 ring-amber-500/30"
              >
                {teamLogo ? (
                  <img src={teamLogo} alt="" className="w-full h-full object-contain" />
                ) : (
                  <div className="w-full h-full rounded-full flex items-center justify-center" style={{ backgroundColor: colors.primary }}>
                    <span className="text-2xl font-bold" style={{ color: colors.secondary }}>{awardData.team?.charAt(0)}</span>
                  </div>
                )}
              </Link>

              {/* Player details */}
              <div className="text-left min-w-0">
                {matchingPlayer ? (
                  <Link
                    to={`${pathPrefix}/player/${matchingPlayer.pid}`}
                    className="text-2xl md:text-3xl font-black text-white hover:text-amber-300 transition-colors block truncate"
                  >
                    {awardData.player}
                  </Link>
                ) : (
                  <span className="text-2xl md:text-3xl font-black text-white block truncate">
                    {awardData.player}
                  </span>
                )}
                <div className="flex items-center gap-x-3 mt-1">
                  <span className="text-amber-400 font-bold text-sm">{awardData.position}</span>
                  <span className="text-amber-600/50">|</span>
                  <span className="text-amber-200/70 text-sm">{awardData.class}</span>
                  <span className="text-amber-600/50">|</span>
                  <Link
                    to={`${pathPrefix}/team/${resolveTid(awardData.team, currentDynasty?.teams || TEAMS)}/${displayYear}`}
                    className="text-amber-200/70 text-sm hover:text-amber-300 transition-colors"
                  >
                    {schoolName}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom gold line - thinner on mobile */}
        <div className="h-0.5 sm:h-1 bg-gradient-to-r from-transparent via-amber-500 to-transparent" />
      </div>
    )
  }

  // Elite award card (Maxwell, Walter Camp, etc.) - compact on mobile
  const EliteAwardCard = ({ awardKey, awardData }) => {
    const display = AWARD_DISPLAY[awardKey]
    const mascotName = getMascotName(awardData.team, currentDynasty?.teams || currentDynasty?.customTeams)
    const teamLogo = mascotName ? getTeamLogo(mascotName, currentDynasty?.teams || currentDynasty?.customTeams) : null
    const colors = mascotName ? getTeamColors(mascotName, currentDynasty?.teams || currentDynasty?.customTeams) : { primary: '#6366f1', secondary: '#fff' }
    const matchingPlayer = findPlayerByName(awardData.player, awardData.team, displayYear)
    const isCoachAward = display.category === 'coach'
    const schoolName = getSchoolName(mascotName) || awardData.team

    return (
      <div
        className="group relative overflow-hidden rounded-lg sm:rounded-xl transition-all duration-300 hover:scale-[1.02]"
        style={{
          background: `linear-gradient(135deg, ${colors.primary}15 0%, rgba(15,23,42,0.95) 100%)`,
          border: `1px solid ${colors.primary}30`
        }}
      >
        {/* Accent glow on hover - desktop only */}
        <div
          className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-2xl opacity-0 group-hover:opacity-30 transition-opacity duration-300 hidden sm:block"
          style={{ backgroundColor: colors.primary }}
        />

        <div className="relative p-2.5 sm:p-5">
          {/* Compact layout for mobile */}
          <div className="flex items-center gap-2 sm:hidden">
            {/* Team logo small */}
            {teamLogo && (
              <Link
                to={`${pathPrefix}/team/${resolveTid(awardData.team, currentDynasty?.teams || TEAMS)}/${displayYear}`}
                className="w-8 h-8 rounded-full bg-white p-0.5 flex-shrink-0"
              >
                <img src={teamLogo} alt="" className="w-full h-full object-contain" />
              </Link>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 truncate">
                {display.name}
              </div>
              {matchingPlayer && !isCoachAward ? (
                <Link
                  to={`${pathPrefix}/player/${matchingPlayer.pid}`}
                  className="font-bold text-white text-sm hover:text-slate-300 transition-colors truncate block"
                >
                  {awardData.player}
                </Link>
              ) : (
                <span className="font-bold text-white text-sm truncate block">{awardData.player}</span>
              )}
              <div className="flex items-center gap-1 text-[10px] text-slate-400">
                <span style={{ color: colors.primary }} className="font-semibold">{awardData.position || (isCoachAward ? 'HC' : '')}</span>
                {!isCoachAward && awardData.class && (
                  <>
                    <span className="text-slate-600">•</span>
                    <span>{awardData.class}</span>
                  </>
                )}
                <span className="text-slate-600">•</span>
                <span className="truncate">{schoolName}</span>
              </div>
            </div>
          </div>

          {/* Desktop layout */}
          <div className="hidden sm:block">
            {/* Award name */}
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-white text-lg leading-tight truncate">{display.name}</h3>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {display.category === 'coach' ? 'Coaching Excellence' :
                   display.category === 'defense' ? 'Defensive' :
                   display.category === 'offense' ? 'Offensive' :
                   display.category === 'lineman' ? 'Lineman' : 'Special Teams'}
                </span>
              </div>
              {/* Team logo badge */}
              {teamLogo && (
                <Link
                  to={`${pathPrefix}/team/${resolveTid(awardData.team, currentDynasty?.teams || TEAMS)}/${displayYear}`}
                  className="w-12 h-12 rounded-full bg-white p-1 shadow-lg flex-shrink-0 hover:scale-110 transition-transform"
                >
                  <img src={teamLogo} alt="" className="w-full h-full object-contain" />
                </Link>
              )}
            </div>

            {/* Winner */}
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${colors.primary}25` }}
              >
                <span className="text-sm font-bold" style={{ color: colors.primary }}>
                  {awardData.position || (isCoachAward ? 'HC' : '?')}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                {matchingPlayer && !isCoachAward ? (
                  <Link
                    to={`${pathPrefix}/player/${matchingPlayer.pid}`}
                    className="font-bold text-white hover:text-slate-300 transition-colors truncate block"
                  >
                    {awardData.player}
                  </Link>
                ) : (
                  <span className="font-bold text-white truncate block">{awardData.player}</span>
                )}
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  {!isCoachAward && awardData.class && <span>{awardData.class}</span>}
                  {!isCoachAward && awardData.class && <span className="text-slate-600">|</span>}
                  <span className="truncate">{schoolName}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom team color accent */}
        <div className="h-0.5" style={{ backgroundColor: colors.primary }} />
      </div>
    )
  }

  // Position award card (smaller, more compact)
  const PositionAwardCard = ({ awardKey, awardData }) => {
    const display = AWARD_DISPLAY[awardKey]
    const mascotName = getMascotName(awardData.team, currentDynasty?.teams || currentDynasty?.customTeams)
    const teamLogo = mascotName ? getTeamLogo(mascotName, currentDynasty?.teams || currentDynasty?.customTeams) : null
    const colors = mascotName ? getTeamColors(mascotName, currentDynasty?.teams || currentDynasty?.customTeams) : { primary: '#64748b', secondary: '#fff' }
    const matchingPlayer = findPlayerByName(awardData.player, awardData.team, displayYear)
    const isCoachAward = display.category === 'coach'
    const schoolName = getSchoolName(mascotName) || awardData.team

    return (
      <Link
        to={matchingPlayer && !isCoachAward ? `${pathPrefix}/player/${matchingPlayer.pid}` : `${pathPrefix}/team/${resolveTid(awardData.team, currentDynasty?.teams || TEAMS)}/${displayYear}`}
        className="group flex items-center gap-2 p-2 sm:p-3 rounded-lg bg-slate-800/40 border border-slate-700/50 hover:bg-slate-800/60 hover:border-slate-600/50 transition-all"
      >
        {/* Team logo */}
        {teamLogo && (
          <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-white p-0.5 flex-shrink-0 shadow-sm">
            <img src={teamLogo} alt="" className="w-full h-full object-contain" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-white text-[11px] sm:text-sm truncate group-hover:text-slate-200 transition-colors">
              {awardData.player}
            </span>
            {!isCoachAward && awardData.position && (
              <span
                className="px-1 py-0.5 rounded text-[8px] sm:text-[10px] font-bold flex-shrink-0"
                style={{ backgroundColor: `${colors.primary}30`, color: colors.primary }}
              >
                {awardData.position}
              </span>
            )}
          </div>
          <div className="text-[9px] sm:text-[11px] text-slate-500 truncate">
            {display.name} | {schoolName}
          </div>
        </div>

        <svg className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors flex-shrink-0 hidden sm:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    )
  }

  // Group awards
  const heismanData = yearAwards.heisman
  const eliteAwards = []
  const positionAwards = []

  AWARD_ORDER.forEach(key => {
    if (key === 'heisman') return
    if (yearAwards[key]) {
      const display = AWARD_DISPLAY[key]
      if (display?.prestige === 'elite') {
        eliteAwards.push({ key, data: yearAwards[key] })
      } else {
        positionAwards.push({ key, data: yearAwards[key] })
      }
    }
  })

  const hasAnyAwards = heismanData || eliteAwards.length > 0 || positionAwards.length > 0

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
        {/* Subtle pattern */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d4af37' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
        {/* Gold accent glow - hidden on mobile */}
        <div
          className="absolute -top-20 -right-20 w-60 h-60 rounded-full blur-3xl opacity-15 hidden sm:block"
          style={{ background: 'linear-gradient(135deg, #d4af37 0%, #b8860b 100%)' }}
        />

        <div className="relative px-3 py-3 sm:px-8 sm:py-8">
          <div className="flex items-center justify-between gap-3">
            {/* Title - compact on mobile */}
            <div>
              <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-2">
                <div className="w-1 sm:w-1.5 h-4 sm:h-6 rounded-full bg-gradient-to-b from-amber-400 to-amber-600" />
                <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-[0.15em] sm:tracking-[0.2em] text-amber-500/80">
                  {displayYear} Season
                </span>
              </div>
              <h1 className="text-lg sm:text-3xl md:text-4xl font-black text-white tracking-tight">
                Awards
              </h1>
            </div>

            {/* Controls - compact */}
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
                  onClick={() => setShowAwardsModal(true)}
                  className="p-1.5 sm:px-4 sm:py-2.5 rounded-lg sm:rounded-xl font-semibold hover:opacity-90 transition-all flex items-center gap-2 shadow-lg"
                  style={{
                    background: `linear-gradient(135deg, ${teamColors.primary} 0%, ${teamColors.primary}dd 100%)`,
                    color: teamColors.secondary
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
        </div>
      </div>

      {!hasAnyAwards ? (
        /* Empty State */
        <div className="min-h-[40vh] flex items-center justify-center">
          <div className="text-center max-w-md mx-auto px-6">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 flex items-center justify-center">
              <svg className="w-10 h-10 text-amber-500/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-3">No Awards Yet</h2>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              Award winners for the {displayYear} season haven't been recorded yet.
            </p>
            {!isViewOnly && (
              <button
                onClick={() => setShowAwardsModal(true)}
                className="px-5 py-2.5 rounded-xl font-semibold transition-all"
                style={{
                  background: `linear-gradient(135deg, ${teamColors.primary} 0%, ${teamColors.primary}dd 100%)`,
                  color: teamColors.secondary
                }}
              >
                Add Awards
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Heisman Trophy - Featured */}
          {heismanData && (
            <HeismanCard awardData={heismanData} />
          )}

          {/* Elite Awards Grid */}
          {eliteAwards.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2 sm:mb-4 px-1">
                <h2 className="text-sm sm:text-lg font-bold text-white tracking-tight whitespace-nowrap">Major Awards</h2>
                <div className="flex-1 h-px bg-gradient-to-r from-slate-700 to-transparent" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
                {eliteAwards.map(({ key, data }) => (
                  <EliteAwardCard key={key} awardKey={key} awardData={data} />
                ))}
              </div>
            </div>
          )}

          {/* Position Awards */}
          {positionAwards.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2 sm:mb-4 px-1">
                <h2 className="text-sm sm:text-lg font-bold text-white tracking-tight whitespace-nowrap">Position Awards</h2>
                <div className="flex-1 h-px bg-gradient-to-r from-slate-700 to-transparent" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 sm:gap-2">
                {positionAwards.map(({ key, data }) => (
                  <PositionAwardCard key={key} awardKey={key} awardData={data} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Awards Modal */}
      <AwardsModal
        isOpen={showAwardsModal}
        onClose={() => setShowAwardsModal(false)}
        onSave={handleAwardsSave}
        currentYear={displayYear}
        teamColors={teamColors}
      />
    </div>
  )
}
