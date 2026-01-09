import { useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useTeamColors } from '../../hooks/useTeamColors'
import { getContrastTextColor } from '../../utils/colorUtils'
import { teamAbbreviations, getAbbreviationFromDisplayName } from '../../data/teamAbbreviations'
import { getTeamLogo } from '../../data/teams'
import AwardsModal from '../../components/AwardsModal'

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

// Helper function to normalize player names for URL
const normalizePlayerName = (name) => {
  if (!name) return ''
  return name.trim().toLowerCase()
}

// Award display names and categories
const AWARD_DISPLAY = {
  heisman: { name: 'Heisman Trophy', icon: 'trophy', category: 'player' },
  maxwell: { name: 'Maxwell Award', icon: 'star', category: 'player' },
  walterCamp: { name: 'Walter Camp Award', icon: 'star', category: 'player' },
  bearBryantCoachOfTheYear: { name: 'Bear Bryant Coach of the Year', icon: 'user', category: 'coach' },
  daveyObrien: { name: 'Davey O\'Brien Award', icon: 'football', category: 'offense' },
  chuckBednarik: { name: 'Chuck Bednarik Award', icon: 'shield', category: 'defense' },
  broncoNagurski: { name: 'Bronco Nagurski Trophy', icon: 'shield', category: 'defense' },
  jimThorpe: { name: 'Jim Thorpe Award', icon: 'shield', category: 'defense' },
  doakWalker: { name: 'Doak Walker Award', icon: 'football', category: 'offense' },
  fredBiletnikoff: { name: 'Fred Biletnikoff Award', icon: 'football', category: 'offense' },
  lombardi: { name: 'Lombardi Award', icon: 'star', category: 'lineman' },
  unitasGoldenArm: { name: 'Unitas Golden Arm Award', icon: 'football', category: 'offense' },
  edgeRusherOfTheYear: { name: 'Edge Rusher of the Year', icon: 'shield', category: 'defense' },
  outland: { name: 'Outland Trophy', icon: 'star', category: 'lineman' },
  johnMackey: { name: 'John Mackey Award', icon: 'football', category: 'offense' },
  broyles: { name: 'Broyles Award', icon: 'user', category: 'coach' },
  dickButkus: { name: 'Dick Butkus Award', icon: 'shield', category: 'defense' },
  rimington: { name: 'Rimington Trophy', icon: 'star', category: 'lineman' },
  louGroza: { name: 'Lou Groza Award', icon: 'football', category: 'special' },
  rayGuy: { name: 'Ray Guy Award', icon: 'football', category: 'special' },
  returnerOfTheYear: { name: 'Returner of the Year', icon: 'football', category: 'special' }
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

export default function Awards() {
  const { id, year: urlYear } = useParams()
  const navigate = useNavigate()
  const { currentDynasty, updateDynasty, isViewOnly, processHonorPlayers } = useDynasty()
  const pathPrefix = usePathPrefix()
  const [showAwardsModal, setShowAwardsModal] = useState(false)

  // Get team colors for the modal
  const teamAbbr = getAbbreviationFromDisplayName(currentDynasty?.teamName, currentDynasty?.customTeams) || ''
  const teamColors = useTeamColors(currentDynasty?.teamName, currentDynasty?.customTeams)

  if (!currentDynasty) return null

  // Get all years from dynasty start to current year (most recent first)
  const awardsByYear = currentDynasty.awardsByYear || {}
  const startYear = currentDynasty.startYear || currentDynasty.currentYear
  const availableYears = []
  for (let year = currentDynasty.currentYear; year >= startYear; year--) {
    availableYears.push(year)
  }

  // Use URL year if provided, otherwise most recent (current year)
  const displayYear = urlYear ? parseInt(urlYear) : currentDynasty.currentYear
  const yearAwards = awardsByYear[displayYear] || {}

  // Navigate to year when dropdown changes
  const handleYearChange = (year) => {
    navigate(`${pathPrefix}/awards/${year}`)
  }

  // Handler for saving awards from modal
  const handleAwardsSave = async (awards) => {
    const year = displayYear

    // Convert awards object to array format for processing
    const entries = Object.entries(awards).map(([awardKey, data]) => ({
      ...data,
      award: awardKey,
      name: data.player
    })).filter(e => e.player) // Only entries with a player name

    // Process honors - this will find/create players
    const result = await processHonorPlayers(
      currentDynasty.id,
      'awards',
      entries,
      year,
      [] // No transfer decisions
    )

    if (!result.needsConfirmation) {
      // Save the awards data
      const existingByYear = currentDynasty.awardsByYear || {}
      await updateDynasty(currentDynasty.id, {
        awardsByYear: {
          ...existingByYear,
          [year]: awards
        }
      })
    }

    setShowAwardsModal(false)
  }

  // Helper function to find player by name
  const findPlayerByName = (playerName) => {
    if (!playerName || !currentDynasty.players) return null
    const normalizedName = normalizePlayerName(playerName)
    return currentDynasty.players.find(p =>
      normalizePlayerName(p.name) === normalizedName
    )
  }

  // Render award card
  const AwardCard = ({ awardKey, awardData }) => {
    const display = AWARD_DISPLAY[awardKey] || { name: awardKey, icon: 'star', category: 'player' }
    const teamInfo = teamAbbreviations[awardData.team] || {}
    const mascotName = getMascotName(awardData.team)
    const teamLogo = mascotName ? getTeamLogo(mascotName) : null
    const bgColor = teamInfo.backgroundColor || '#6B7280'
    const textColor = getContrastTextColor(bgColor)
    const isCoachAward = display.category === 'coach'
    const matchingPlayer = !isCoachAward ? findPlayerByName(awardData.player) : null
    const hasPlayerPage = !!matchingPlayer

    return (
      <div
        className="rounded-lg overflow-hidden shadow-md"
        style={{ backgroundColor: bgColor }}
      >
        {/* Award Header */}
        <div
          className="px-4 py-2"
          style={{ backgroundColor: `${textColor}15` }}
        >
          <span className="font-bold text-sm" style={{ color: textColor }}>{display.name}</span>
        </div>

        {/* Winner Info */}
        <div className="p-4 flex items-center gap-3">
          {/* Team Logo */}
          {teamLogo && (
            <Link
              to={`${pathPrefix}/team/${awardData.team}/${displayYear}`}
              className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 hover:scale-105 transition-transform"
              style={{ backgroundColor: '#FFFFFF', padding: '2px' }}
            >
              <img
                src={teamLogo}
                alt={`${awardData.team} logo`}
                className="w-full h-full object-contain"
              />
            </Link>
          )}

          {/* Player/Coach Info */}
          <div className="flex-1 min-w-0">
            {hasPlayerPage ? (
              <Link
                to={`${pathPrefix}/player/${matchingPlayer.pid}`}
                className="font-bold text-lg truncate block hover:underline"
                style={{ color: textColor }}
              >
                {awardData.player}
              </Link>
            ) : (
              <div className="font-bold text-lg truncate" style={{ color: textColor }}>
                {awardData.player}
              </div>
            )}
            {!isCoachAward && awardData.position && (
              <div className="text-sm" style={{ color: textColor, opacity: 0.8 }}>
                {awardData.position} • {awardData.class}
              </div>
            )}
            <Link
              to={`${pathPrefix}/team/${awardData.team}/${displayYear}`}
              className="text-sm hover:underline"
              style={{ color: textColor, opacity: 0.7 }}
            >
              {mascotName || teamInfo.name || awardData.team}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Group awards by category
  const categories = {
    player: { title: 'Player of the Year', awards: [] },
    offense: { title: 'Offensive Awards', awards: [] },
    defense: { title: 'Defensive Awards', awards: [] },
    lineman: { title: 'Lineman Awards', awards: [] },
    special: { title: 'Special Teams', awards: [] },
    coach: { title: 'Coaching Awards', awards: [] }
  }

  AWARD_ORDER.forEach(key => {
    if (yearAwards[key]) {
      const category = AWARD_DISPLAY[key]?.category || 'player'
      if (categories[category]) {
        categories[category].awards.push({ key, data: yearAwards[key] })
      }
    }
  })

  return (
    <div className="space-y-6">
      {/* Header with Year Selector */}
      <div className="rounded-lg shadow-lg p-4 flex flex-col sm:flex-row items-center justify-between gap-4 bg-gray-800 border-2 border-gray-600">
        <h1 className="text-2xl font-bold text-white">
          Season Awards
        </h1>

        <div className="flex items-center gap-3">
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

          {!isViewOnly && (
            <button
              onClick={() => setShowAwardsModal(true)}
              className="px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-colors flex items-center gap-2"
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

      {/* Awards by Category */}
      {Object.entries(categories).map(([categoryKey, category]) => {
        if (category.awards.length === 0) return null

        return (
          <div key={categoryKey}>
            <h2 className="text-xl font-bold mb-4 px-2 text-white">
              {category.title}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {category.awards.map(({ key, data }) => (
                <AwardCard key={key} awardKey={key} awardData={data} />
              ))}
            </div>
          </div>
        )
      })}

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
