import { Link } from 'react-router-dom'
import { getContrastTextColor } from '../utils/colorUtils'
import { teamAbbreviations } from '../data/teamAbbreviations'
import { getTeamLogo, getMascotName as getMascotNameFromTeams } from '../data/teams'

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
  if (!isOpen || !confirmation) return null

  const { entry, player, existingTeams, existingYears, lastHonor } = confirmation
  const primaryText = getContrastTextColor(teamColors.primary)
  const secondaryText = getContrastTextColor(teamColors.secondary)

  // Get team info for display
  const newTeamAbbr = entry.team || entry.school
  const newTeamInfo = teamAbbreviations[newTeamAbbr] || {}
  const newMascotName = getMascotName(newTeamAbbr)
  const newTeamLogo = newMascotName ? getTeamLogo(newMascotName) : null

  const oldTeamAbbr = existingTeams[existingTeams.length - 1] // Most recent team
  const oldTeamInfo = teamAbbreviations[oldTeamAbbr] || {}
  const oldMascotName = getMascotName(oldTeamAbbr)
  const oldTeamLogo = oldMascotName ? getTeamLogo(oldMascotName) : null

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000] py-8 px-4 sm:p-4"
      style={{ margin: 0 }}
      onMouseDown={onCancel}
    >
      <div
        className="rounded-lg shadow-xl max-w-lg w-full max-h-[calc(100vh-4rem)] sm:max-h-none overflow-y-auto p-4 sm:p-6"
        style={{ backgroundColor: teamColors.secondary }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: teamColors.primary }}
          >
            <svg className="w-6 h-6" fill="none" stroke={primaryText} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold" style={{ color: teamColors.primary }}>
            Possible Transfer Detected
          </h2>
        </div>

        {/* Question */}
        <p className="text-lg mb-4" style={{ color: secondaryText }}>
          Is this the same <strong>{player.name}</strong>?
        </p>

        {/* Comparison Cards */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* Previous Record */}
          <div className="rounded-lg p-4" style={{ backgroundColor: oldTeamInfo.backgroundColor || '#6B7280' }}>
            <div className="text-xs font-semibold mb-2 opacity-70" style={{ color: getContrastTextColor(oldTeamInfo.backgroundColor || '#6B7280') }}>
              PREVIOUS
            </div>
            <div className="flex items-center gap-2 mb-2">
              {oldTeamLogo && (
                <div className="w-8 h-8 rounded-full bg-white p-1 flex-shrink-0">
                  <img src={oldTeamLogo} alt="" className="w-full h-full object-contain" />
                </div>
              )}
              <span className="font-bold" style={{ color: getContrastTextColor(oldTeamInfo.backgroundColor || '#6B7280') }}>
                {oldTeamInfo.name || oldTeamAbbr}
              </span>
            </div>
            {lastHonor && (
              <div className="text-sm" style={{ color: getContrastTextColor(oldTeamInfo.backgroundColor || '#6B7280'), opacity: 0.85 }}>
                {lastHonor.year}: {lastHonor.description}
              </div>
            )}
          </div>

          {/* New Record */}
          <div className="rounded-lg p-4" style={{ backgroundColor: newTeamInfo.backgroundColor || '#6B7280' }}>
            <div className="text-xs font-semibold mb-2 opacity-70" style={{ color: getContrastTextColor(newTeamInfo.backgroundColor || '#6B7280') }}>
              NEW ENTRY
            </div>
            <div className="flex items-center gap-2 mb-2">
              {newTeamLogo && (
                <div className="w-8 h-8 rounded-full bg-white p-1 flex-shrink-0">
                  <img src={newTeamLogo} alt="" className="w-full h-full object-contain" />
                </div>
              )}
              <span className="font-bold" style={{ color: getContrastTextColor(newTeamInfo.backgroundColor || '#6B7280') }}>
                {newTeamInfo.name || newTeamAbbr}
              </span>
            </div>
            <div className="text-sm" style={{ color: getContrastTextColor(newTeamInfo.backgroundColor || '#6B7280'), opacity: 0.85 }}>
              {entry.year}: {entry.honorType || 'New Honor'}
            </div>
          </div>
        </div>

        {/* View Player Link */}
        {player.pid && (
          <div className="mb-4">
            <Link
              to={`/dynasty/${dynastyId}/player/${player.pid}`}
              target="_blank"
              className="text-sm underline flex items-center gap-1"
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
            className="flex-1 px-4 py-3 rounded-lg font-semibold transition-colors"
            style={{ backgroundColor: teamColors.primary, color: primaryText }}
          >
            Yes, Same Player (Transfer)
          </button>
          <button
            onClick={() => onConfirm(false)}
            className="flex-1 px-4 py-3 rounded-lg font-semibold border-2 transition-colors"
            style={{ borderColor: teamColors.primary, color: teamColors.primary, backgroundColor: 'transparent' }}
          >
            No, Different Player
          </button>
        </div>
      </div>
    </div>
  )
}
