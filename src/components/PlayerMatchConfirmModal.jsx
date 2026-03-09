import { Link } from 'react-router-dom'
import { getContrastTextColor } from '../utils/colorUtils'
import { teamAbbreviations } from '../data/teamAbbreviations'
import { getTeamLogo, getMascotName as getMascotNameFromTeams } from '../data/teams'
import { useDynasty } from '../context/DynastyContext'

// Award display names for proper formatting
const AWARD_DISPLAY = {
  heisman: 'Heisman Trophy',
  maxwell: 'Maxwell Award',
  walterCamp: 'Walter Camp Award',
  daveyOBrien: "Davey O'Brien Award",
  doak: 'Doak Walker Award',
  biletnikoff: 'Biletnikoff Award',
  mackey: 'John Mackey Award',
  outland: 'Outland Trophy',
  lombardi: 'Lombardi Award',
  rimington: 'Rimington Trophy',
  dickButkus: 'Dick Butkus Award',
  bronkoNagurski: 'Bronko Nagurski Award',
  bednarik: 'Chuck Bednarik Award',
  jimThorpe: 'Jim Thorpe Award',
  tedHendricks: 'Ted Hendricks Award',
  rayGuy: 'Ray Guy Award',
  louGroza: 'Lou Groza Award',
  paulHornung: 'Paul Hornung Award',
  returnerOfTheYear: 'Returner of the Year'
}

// Format honor type for display
const formatHonorType = (honorType) => {
  if (!honorType) return 'New Honor'
  // Check award display map first
  if (AWARD_DISPLAY[honorType]) return AWARD_DISPLAY[honorType]
  // Handle "winner" suffix variants (e.g., "rayGuy winner" -> "Ray Guy Award")
  const baseType = honorType.replace(/ winner$/i, '')
  if (AWARD_DISPLAY[baseType]) return `${AWARD_DISPLAY[baseType]} winner`
  // If already formatted (contains spaces and doesn't look like camelCase), return as-is
  // This handles pre-formatted strings like "1st Team All-Conference" or "2nd Team All-American"
  if (honorType.includes(' ') && !/^[a-z]+[A-Z]/.test(honorType)) {
    return honorType
  }
  // Convert camelCase to Title Case as fallback
  return honorType
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim()
}

// Map abbreviation to mascot name for logo lookup
const getMascotName = (abbr, teamsData = null) => {
  // Try tid-based lookup first if teams data provided
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
    'CONN': 'Connecticut Huskies', 'CSU': 'Colorado State Rams', 'DUKE': 'Duke Blue Devils',
    'ECU': 'East Carolina Pirates', 'EMU': 'Eastern Michigan Eagles', 'FAU': 'Florida Atlantic Owls',
    'FIU': 'Florida International Panthers', 'FLA': 'Florida Gators', 'FRES': 'Fresno State Bulldogs',
    'FSU': 'Florida State Seminoles', 'GASO': 'Georgia Southern Eagles', 'GSU': 'Georgia State Panthers',
    'GT': 'Georgia Tech Yellow Jackets', 'HAW': 'Hawaii Rainbow Warriors', 'HOU': 'Houston Cougars',
    'ILL': 'Illinois Fighting Illini', 'IU': 'Indiana Hoosiers', 'IOWA': 'Iowa Hawkeyes',
    'ISU': 'Iowa State Cyclones', 'JKST': 'Jacksonville State Gamecocks', 'JMU': 'James Madison Dukes',
    'KENN': 'Kennesaw State Owls', 'KENT': 'Kent State Golden Flashes', 'KSU': 'Kansas State Wildcats',
    'KU': 'Kansas Jayhawks', 'LIB': 'Liberty Flames', 'LOU': 'Louisville Cardinals',
    'LSU': 'LSU Tigers', 'LT': 'Louisiana Tech Bulldogs', 'M-OH': 'Miami Redhawks',
    'MASS': 'Massachusetts Minutemen', 'MEM': 'Memphis Tigers', 'MIA': 'Miami Hurricanes',
    'MICH': 'Michigan Wolverines', 'MINN': 'Minnesota Golden Gophers', 'MISS': 'Ole Miss Rebels',
    'MIZ': 'Missouri Tigers', 'MRSH': 'Marshall Thundering Herd', 'MRYD': 'Maryland Terrapins',
    'MSST': 'Mississippi State Bulldogs', 'MSU': 'Michigan State Spartans',
    'MTSU': 'Middle Tennessee State Blue Raiders', 'NAVY': 'Navy Midshipmen',
    'NCST': 'North Carolina State Wolfpack', 'ND': 'Notre Dame Fighting Irish',
    'NEB': 'Nebraska Cornhuskers', 'NEV': 'Nevada Wolf Pack', 'NIU': 'Northern Illinois Huskies',
    'NMSU': 'New Mexico State Aggies', 'NU': 'Northwestern Wildcats', 'ODU': 'Old Dominion Monarchs',
    'OHIO': 'Ohio Bobcats', 'OSU': 'Ohio State Buckeyes', 'OKST': 'Oklahoma State Cowboys',
    'ORE': 'Oregon Ducks', 'ORST': 'Oregon State Beavers', 'OU': 'Oklahoma Sooners',
    'PITT': 'Pittsburgh Panthers', 'PSU': 'Penn State Nittany Lions', 'PUR': 'Purdue Boilermakers',
    'RICE': 'Rice Owls', 'RUTG': 'Rutgers Scarlet Knights', 'SCAR': 'South Carolina Gamecocks',
    'SDSU': 'San Diego State Aztecs', 'SHSU': 'Sam Houston State Bearkats', 'SJSU': 'San Jose State Spartans',
    'SMU': 'SMU Mustangs', 'STAN': 'Stanford Cardinal', 'SYR': 'Syracuse Orange',
    'TAMU': 'Texas A&M Aggies', 'TCU': 'TCU Horned Frogs', 'TEM': 'Temple Owls',
    'TENN': 'Tennessee Volunteers', 'TEX': 'Texas Longhorns', 'TLNE': 'Tulane Green Wave',
    'TLSA': 'Tulsa Golden Hurricane', 'TOL': 'Toledo Rockets', 'TROY': 'Troy Trojans',
    'TTU': 'Texas Tech Red Raiders', 'TXST': 'Texas State Bobcats', 'UAB': 'UAB Blazers',
    'UCF': 'UCF Knights', 'UCLA': 'UCLA Bruins', 'UGA': 'Georgia Bulldogs',
    'UK': 'Kentucky Wildcats', 'ULL': 'Lafayette Ragin\' Cajuns', 'ULM': 'Monroe Warhawks',
    'UNC': 'North Carolina Tar Heels', 'UNLV': 'UNLV Rebels', 'UNM': 'New Mexico Lobos',
    'UNT': 'North Texas Mean Green', 'USA': 'South Alabama Jaguars', 'USC': 'USC Trojans',
    'USF': 'South Florida Bulls', 'USM': 'Southern Mississippi Golden Eagles',
    'USU': 'Utah State Aggies', 'UTAH': 'Utah Utes', 'UTEP': 'UTEP Miners',
    'UTSA': 'UTSA Roadrunners', 'UVA': 'Virginia Cavaliers', 'VAND': 'Vanderbilt Commodores',
    'VT': 'Virginia Tech Hokies', 'WAKE': 'Wake Forest Demon Deacons', 'WASH': 'Washington Huskies',
    'WIS': 'Wisconsin Badgers', 'WKU': 'Western Kentucky Hilltoppers', 'WMU': 'Western Michigan Broncos',
    'WSU': 'Washington State Cougars', 'WVU': 'West Virginia Mountaineers', 'WYO': 'Wyoming Cowboys',
    'DEL': 'Delaware Fightin\' Blue Hens', 'GAST': 'Georgia State Panthers', 'MZST': 'Missouri State Bears',
    'OKLA': 'Oklahoma Sooners', 'RUT': 'Rutgers Scarlet Knights', 'SAM': 'Sam Houston State Bearkats',
    'TUL': 'Tulane Green Wave', 'TULN': 'Tulane Green Wave', 'TXAM': 'Texas A&M Aggies',
    'TXTECH': 'Texas Tech Red Raiders', 'UC': 'Cincinnati Bearcats', 'UF': 'Florida Gators',
    'UH': 'Houston Cougars', 'UL': 'Lafayette Ragin\' Cajuns', 'UM': 'Miami Hurricanes',
    'UMD': 'Maryland Terrapins', 'UT': 'Tennessee Volunteers', 'VAN': 'Vanderbilt Commodores',
    // FCS teams
    'FCSE': 'FCS East Judicials', 'FCSM': 'FCS Midwest Rebels',
    'FCSN': 'FCS Northwest Stallions', 'FCSW': 'FCS West Titans'
  }
  return mascotMap[abbr] || null
}

/**
 * Modal to confirm if a player with a different team is the same player (transfer)
 *
 * Props:
 * - isOpen: boolean
 * - confirmation: { entry, player, existingTeams, existingYears, lastHonor }
 * - dynastyId: string
 * - teamColors: { primary, secondary }
 * - onConfirm: (isTransfer: boolean) => void  // true = same player (link), false = different player (create new)
 * - onCancel: () => void
 */
export default function PlayerMatchConfirmModal({
  isOpen,
  confirmation,
  dynastyId,
  teamColors,
  onConfirm,
  onCancel
}) {
  const { currentDynasty } = useDynasty()
  const teamsData = currentDynasty?.teams || null

  if (!isOpen || !confirmation) return null

  const { entry, player, existingTeams, existingYears, lastHonor } = confirmation
  const primaryText = getContrastTextColor(teamColors.primary)
  const secondaryText = getContrastTextColor(teamColors.secondary)

  // Get team info for display
  // For allConference/allAmericans, 'school' is the team abbr; 'team' might be a category label
  // Check if entry.team looks like a valid team abbreviation (2-4 uppercase letters) vs a category label
  const isValidTeamAbbr = (str) => str && /^[A-Z0-9-]{2,5}$/.test(str) && teamAbbreviations[str]
  const newTeamAbbr = isValidTeamAbbr(entry.team) ? entry.team : (entry.school || entry.team || '')
  const newTeamInfo = teamAbbreviations[newTeamAbbr] || {}
  const newMascotName = getMascotName(newTeamAbbr, teamsData)
  const newTeamLogo = newMascotName ? getTeamLogo(newMascotName, teamsData) : null

  const oldTeamAbbr = existingTeams[existingTeams.length - 1] // Most recent team
  const oldTeamInfo = teamAbbreviations[oldTeamAbbr] || {}
  const oldMascotName = getMascotName(oldTeamAbbr, teamsData)
  const oldTeamLogo = oldMascotName ? getTeamLogo(oldMascotName, teamsData) : null

  // Get player position from various sources
  const playerPosition = entry.position || player.position || ''

  // Get additional details
  const newEntryClass = entry.class || ''
  const existingPlayerPosition = player.position || ''

  // Check if teams are actually different (for determining if this is really a transfer)
  const teamsAreDifferent = newTeamAbbr && oldTeamAbbr && newTeamAbbr !== oldTeamAbbr

  return (
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000] py-8 px-4 sm:p-4"
      style={{ margin: 0 }}
      onMouseDown={onCancel}
    >
      <div
        className="rounded-xl shadow-xl max-w-lg w-full max-h-[calc(100vh-4rem)] sm:max-h-none overflow-y-auto"
        style={{ backgroundColor: teamColors.secondary, border: `2px solid ${teamColors.primary}` }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="p-4 sm:p-5"
          style={{ backgroundColor: teamColors.primary }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${primaryText}20` }}
            >
              <svg className="w-6 h-6" fill="none" stroke={primaryText} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold" style={{ color: primaryText }}>
                Possible Transfer Detected
              </h2>
              <p className="text-sm mt-0.5" style={{ color: primaryText, opacity: 0.9 }}>
                Is this the same <strong>{player.name}</strong>?
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {/* Player Info Banner */}
          <div
            className="rounded-lg p-3 mb-4 flex items-center gap-3"
            style={{ backgroundColor: `${teamColors.primary}15`, border: `1px solid ${teamColors.primary}30` }}
          >
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0"
              style={{ backgroundColor: teamColors.primary, color: primaryText }}
            >
              {player.name?.charAt(0) || '?'}
            </div>
            <div>
              <div className="font-bold text-base" style={{ color: secondaryText }}>{player.name}</div>
              <div className="text-sm" style={{ color: secondaryText, opacity: 0.8 }}>
                {existingPlayerPosition && <span className="font-semibold">{existingPlayerPosition}</span>}
                {existingPlayerPosition && existingYears?.length > 0 && ' • '}
                {existingYears?.length > 0 && (
                  <span>Active {existingYears[0]}{existingYears.length > 1 ? `-${existingYears[existingYears.length - 1]}` : ''}</span>
                )}
              </div>
            </div>
          </div>

          {/* Comparison Cards */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            {/* Previous Record */}
            <div className="rounded-lg overflow-hidden" style={{ border: `2px solid ${oldTeamInfo.backgroundColor || '#6B7280'}` }}>
              <div
                className="px-3 py-2 text-xs font-bold uppercase tracking-wide"
                style={{ backgroundColor: oldTeamInfo.backgroundColor || '#6B7280', color: getContrastTextColor(oldTeamInfo.backgroundColor || '#6B7280') }}
              >
                Previous Record
              </div>
              <div className="p-3" style={{ backgroundColor: `${oldTeamInfo.backgroundColor || '#6B7280'}15` }}>
                <div className="flex items-center gap-2 mb-2">
                  {oldTeamLogo && (
                    <div className="w-8 h-8 rounded-full bg-white p-1 flex-shrink-0 shadow-sm">
                      <img src={oldTeamLogo} alt="" className="w-full h-full object-contain" />
                    </div>
                  )}
                  <span className="font-bold text-sm" style={{ color: secondaryText }}>
                    {oldTeamInfo.name || oldMascotName || oldTeamAbbr}
                  </span>
                </div>
                {lastHonor && (
                  <div
                    className="text-xs rounded px-2 py-1.5 mt-2"
                    style={{ backgroundColor: `${oldTeamInfo.backgroundColor || '#6B7280'}20`, color: secondaryText }}
                  >
                    <div className="font-semibold">{lastHonor.year}</div>
                    <div style={{ opacity: 0.9 }}>{lastHonor.description}</div>
                  </div>
                )}
              </div>
            </div>

            {/* New Record */}
            <div className="rounded-lg overflow-hidden" style={{ border: `2px solid ${newTeamInfo.backgroundColor || '#6B7280'}` }}>
              <div
                className="px-3 py-2 text-xs font-bold uppercase tracking-wide"
                style={{ backgroundColor: newTeamInfo.backgroundColor || '#6B7280', color: getContrastTextColor(newTeamInfo.backgroundColor || '#6B7280') }}
              >
                New Entry
              </div>
              <div className="p-3" style={{ backgroundColor: `${newTeamInfo.backgroundColor || '#6B7280'}15` }}>
                <div className="flex items-center gap-2 mb-2">
                  {newTeamLogo && (
                    <div className="w-8 h-8 rounded-full bg-white p-1 flex-shrink-0 shadow-sm">
                      <img src={newTeamLogo} alt="" className="w-full h-full object-contain" />
                    </div>
                  )}
                  <span className="font-bold text-sm" style={{ color: secondaryText }}>
                    {newTeamInfo.name || newMascotName || newTeamAbbr || 'Unknown Team'}
                  </span>
                </div>
                <div
                  className="text-xs rounded px-2 py-1.5 mt-2"
                  style={{ backgroundColor: `${newTeamInfo.backgroundColor || '#6B7280'}20`, color: secondaryText }}
                >
                  <div className="font-semibold">{entry.year}{newEntryClass ? ` (${newEntryClass})` : ''}</div>
                  <div style={{ opacity: 0.9 }}>{formatHonorType(entry.honorType)}</div>
                  {playerPosition && <div style={{ opacity: 0.7 }}>Position: {playerPosition}</div>}
                </div>
              </div>
            </div>
          </div>

          {/* Transfer indicator */}
          {teamsAreDifferent && (
            <div
              className="flex items-center justify-center gap-2 py-2 mb-4 rounded-lg text-sm"
              style={{ backgroundColor: `${teamColors.primary}10`, color: teamColors.primary }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              <span className="font-medium">Different teams detected</span>
            </div>
          )}

          {/* View Player Link */}
          {player.pid && (
            <div className="mb-4">
              <Link
                to={`/dynasty/${dynastyId}/player/${player.pid}`}
                target="_blank"
                className="text-sm font-medium flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                style={{ color: teamColors.primary }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                View existing player page
              </Link>
            </div>
          )}

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => onConfirm(true)}
              className="flex-1 px-4 py-3 rounded-lg font-semibold transition-opacity hover:opacity-90"
              style={{ backgroundColor: teamColors.primary, color: primaryText }}
            >
              Yes, Same Player
            </button>
            <button
              onClick={() => onConfirm(false)}
              className="flex-1 px-4 py-3 rounded-lg font-semibold border-2 transition-opacity hover:opacity-80"
              style={{ borderColor: teamColors.primary, color: teamColors.primary, backgroundColor: 'transparent' }}
            >
              No, Different Player
            </button>
          </div>

          {/* Help text */}
          <p className="text-xs text-center mt-3" style={{ color: secondaryText, opacity: 0.6 }}>
            Choose "Same Player" if this player transferred between schools
          </p>
        </div>
      </div>
    </div>
  )
}
