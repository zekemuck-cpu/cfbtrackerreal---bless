import { Link } from 'react-router-dom'
import { getContrastTextColor } from '../utils/colorUtils'
import { teamAbbreviations } from '../data/teamAbbreviations'
import { getTeamLogo, getMascotName as getMascotNameFromTeams } from '../data/teams'
import { useDynasty } from '../context/DynastyContext'

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
    'DEL': 'Delaware Fightin\' Blue Hens', 'UT': 'Texas Longhorns'
  }
  return mascotMap[abbr] || null
}

/**
 * Modal to confirm if a recruit is a returning player who previously left
 *
 * Props:
 * - isOpen: boolean
 * - confirmation: { recruit, existingPlayer, departureReason, departureYear }
 * - dynastyId: string
 * - teamColors: { primary, secondary }
 * - onConfirm: (isSamePlayer: boolean) => void
 * - onCancel: () => void
 */
export default function ReturningPlayerConfirmModal({
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

  const { recruit, existingPlayer, departureReason, departureYear, currentTeamAbbr } = confirmation
  const primaryText = getContrastTextColor(teamColors.primary)
  const secondaryText = getContrastTextColor(teamColors.secondary)

  // Get team info for display
  const teamInfo = teamAbbreviations[currentTeamAbbr] || {}
  const mascotName = getMascotName(currentTeamAbbr, teamsData)
  const teamLogo = mascotName ? getTeamLogo(mascotName, teamsData) : null

  // Get player's last known stats
  const classByYearKeys = existingPlayer.classByYear
    ? Object.keys(existingPlayer.classByYear).map(Number).filter(y => !isNaN(y))
    : []
  const lastYear = classByYearKeys.length > 0 ? Math.max(...classByYearKeys) : null
  const lastClass = lastYear !== null ? existingPlayer.classByYear[lastYear] : existingPlayer.year

  return (
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000] py-8 px-4 sm:p-4"
      style={{ margin: 0 }}
      onMouseDown={onCancel}
    >
      <div
        className="card max-w-lg w-full max-h-[calc(100vh-4rem)] sm:max-h-none overflow-y-auto border-l-[3px]"
        style={{ borderLeftColor: teamColors.primary }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-surface-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-surface-3">
              <svg className="w-6 h-6 text-txt-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-txt-primary">
                Returning Player Detected
              </h2>
              <p className="text-sm mt-0.5 text-txt-secondary">
                Is <strong>{recruit.name}</strong> the same player?
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {/* New Recruit Info */}
          <div
            className="rounded-lg p-3 mb-4"
            style={{ backgroundColor: `${teamColors.primary}10`, border: `1px solid ${teamColors.primary}30` }}
          >
            <div className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: teamColors.primary }}>
              New Recruit
            </div>
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                style={{ backgroundColor: teamColors.primary, color: primaryText }}
              >
                {recruit.name?.charAt(0) || '?'}
              </div>
              <div>
                <div className="font-bold text-txt-primary">{recruit.name}</div>
                <div className="text-sm text-txt-secondary">
                  {recruit.position && <span className="font-semibold">{recruit.position}</span>}
                  {recruit.position && recruit.class && ' • '}
                  {recruit.class && <span>{recruit.class}</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Existing Player Card */}
          <div className="rounded-lg overflow-hidden mb-4" style={{ border: `2px solid ${teamInfo.backgroundColor || '#6B7280'}` }}>
            <div
              className="px-3 py-2 text-xs font-bold uppercase tracking-wide"
              style={{ backgroundColor: teamInfo.backgroundColor || '#6B7280', color: getContrastTextColor(teamInfo.backgroundColor || '#6B7280') }}
            >
              Previous Player Record
            </div>
            <div className="p-3" style={{ backgroundColor: `${teamInfo.backgroundColor || '#6B7280'}15` }}>
              <div className="flex items-center gap-3 mb-3">
                {teamLogo && (
                  <div className="w-12 h-12 rounded-full bg-white p-1 flex-shrink-0 shadow-sm">
                    <img src={teamLogo} alt="" className="w-full h-full object-contain" />
                  </div>
                )}
                <div>
                  <div className="font-bold text-base text-txt-primary">
                    {existingPlayer.name}
                  </div>
                  <div className="text-sm text-txt-secondary">
                    {existingPlayer.position && <span className="font-semibold">{existingPlayer.position}</span>}
                    {existingPlayer.position && (lastClass || existingPlayer.year) && ' • '}
                    {(lastClass || existingPlayer.year) && <span>{lastClass || existingPlayer.year}</span>}
                  </div>
                </div>
              </div>

              {/* Departure Info */}
              <div
                className="flex items-center gap-2 text-sm rounded px-2 py-1.5 text-txt-secondary"
                style={{ backgroundColor: `${teamInfo.backgroundColor || '#6B7280'}20` }}
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span>
                  Left in <strong>{departureYear}</strong>: {departureReason || 'Transfer'}
                </span>
              </div>

              {existingPlayer.overall && (
                <div className="mt-2 text-sm px-2 text-txt-secondary">
                  Last Overall: <strong>{existingPlayer.overall}</strong>
                </div>
              )}
            </div>
          </div>

          {/* Info Note */}
          <div
            className="rounded-lg p-3 mb-4"
            style={{ backgroundColor: `${teamColors.primary}08`, border: `1px solid ${teamColors.primary}20` }}
          >
            <div className="flex gap-2">
              <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke={teamColors.primary} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-txt-secondary">
                If this is the same player returning, their stats and history will be preserved.
                Otherwise, a new player record will be created.
              </p>
            </div>
          </div>

          {/* View Player Link */}
          {existingPlayer.pid && (
            <div className="mb-4">
              <Link
                to={`/dynasty/${dynastyId}/player/${existingPlayer.pid}`}
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
            Choose "Same Player" if this player is returning from the portal
          </p>
        </div>
      </div>
    </div>
  )
}
