import { useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useTeamColors } from '../../hooks/useTeamColors'
import { getTeamLogo, getMascotName as getMascotNameFromTeams, stripMascotFromName } from '../../data/teams'
import { getTeamColors } from '../../data/teamColors'
import { TEAMS, resolveTid, getCurrentTeamAbbr, getTidFromAbbr } from '../../data/teamRegistry'
import AwardsModal from '../../components/AwardsModal'
import { normalizePlayerName as normalizePlayerNameUtil } from '../../utils/playerMatching'
import {
  PageHero,
  Card,
  Button,
  Badge,
  EmptyState,
  TitleWithYear,
} from '../../components/ui'

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

const AWARD_ORDER = [
  'heisman', 'maxwell', 'walterCamp', 'daveyObrien', 'doakWalker',
  'fredBiletnikoff', 'johnMackey', 'unitasGoldenArm',
  'chuckBednarik', 'broncoNagurski', 'jimThorpe', 'dickButkus', 'edgeRusherOfTheYear',
  'outland', 'lombardi', 'rimington',
  'louGroza', 'rayGuy', 'returnerOfTheYear',
  'bearBryantCoachOfTheYear', 'broyles'
]

const CATEGORY_LABEL = {
  coach: 'Coaching',
  defense: 'Defense',
  offense: 'Offense',
  lineman: 'Lineman',
  special: 'Special Teams',
  player: 'Player'
}

// Delegate to the shared mascot-strip helper.
const getSchoolName = stripMascotFromName

export default function Awards() {
  const { id, year: urlYear } = useParams()
  const navigate = useNavigate()
  const { currentDynasty, updateDynasty, isViewOnly, processHonorPlayers } = useDynasty()
  const pathPrefix = usePathPrefix()
  const [showAwardsModal, setShowAwardsModal] = useState(false)

  const teamColors = useTeamColors(currentDynasty?.teamName, currentDynasty?.teams || currentDynasty?.customTeams)

  if (!currentDynasty) return null

  const awardsByYear = currentDynasty.awardsByYear || {}
  const startYear = currentDynasty.startYear || currentDynasty.currentYear
  const availableYears = []
  for (let year = currentDynasty.currentYear; year >= startYear; year--) {
    availableYears.push(year)
  }

  // First-season dynasties have no prior year — default to current
  // year so a 2025-start dynasty doesn't open showing "2024".
  const isFirstSeason = Number(currentDynasty.currentYear) <= Number(currentDynasty.startYear)
  const displayYear = urlYear
    ? parseInt(urlYear)
    : (isFirstSeason ? currentDynasty.currentYear : currentDynasty.currentYear - 1)
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

  // Heisman Trophy — broadcast-scorebug feature card. Editorial year +
  // award lockup on top, then the winner with logo, name, and meta row.
  // Gold left rail replaces the soft top gradient — it scans cleaner and
  // matches the design language's "team color is an accent, never a fill"
  // rule (gold here is the prestige accent).
  const HeismanCard = ({ awardData }) => {
    const mascotName = getMascotName(awardData.team, currentDynasty?.teams || currentDynasty?.customTeams)
    const teamLogo = mascotName ? getTeamLogo(mascotName, currentDynasty?.teams || currentDynasty?.customTeams) : null
    const colors = mascotName ? getTeamColors(mascotName, currentDynasty?.teams || currentDynasty?.customTeams) : { primary: '#b8860b', secondary: '#fff' }
    const matchingPlayer = findPlayerByName(awardData.player, awardData.team, displayYear)
    const schoolName = getSchoolName(mascotName) || awardData.team

    return (
      <Card padding="none" className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute top-0 bottom-0 left-0 w-[4px]"
          style={{ backgroundColor: '#d4af37' }}
        />
        <div className="px-5 py-5 sm:px-8 sm:py-7 pl-6 sm:pl-10">
          <div className="flex items-baseline gap-3 mb-4">
            <span
              className="font-display font-black tabular leading-none"
              style={{
                fontSize: '14px',
                color: '#d4af37',
                letterSpacing: '0.05em',
              }}
            >
              {displayYear}
            </span>
            <span
              className="label-xs"
              style={{
                color: '#d4af37',
                letterSpacing: '2.5px',
                fontSize: '10px',
              }}
            >
              HEISMAN TROPHY
            </span>
          </div>

          <div className="flex items-center gap-4 sm:gap-6">
            <Link
              to={`${pathPrefix}/team/${resolveTid(awardData.team, currentDynasty?.teams || TEAMS)}/${displayYear}`}
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white p-1.5 flex-shrink-0"
              style={{ border: '1px solid var(--surface-5)' }}
            >
              {teamLogo ? (
                <img src={teamLogo} alt="" className="w-full h-full object-contain" />
              ) : (
                <div
                  className="w-full h-full rounded-full flex items-center justify-center"
                  style={{ backgroundColor: colors.primary }}
                >
                  <span className="text-2xl font-bold" style={{ color: colors.secondary }}>
                    {awardData.team?.charAt(0)}
                  </span>
                </div>
              )}
            </Link>

            <div className="flex-1 min-w-0">
              {matchingPlayer ? (
                <Link
                  to={`${pathPrefix}/player/${matchingPlayer.pid}`}
                  className="display-md text-txt-primary hover:text-white transition-colors truncate block"
                  style={{ letterSpacing: '-0.02em' }}
                >
                  {awardData.player}
                </Link>
              ) : (
                <span
                  className="display-md text-txt-primary truncate block"
                  style={{ letterSpacing: '-0.02em' }}
                >
                  {awardData.player}
                </span>
              )}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-sm">
                {awardData.position && (
                  <span
                    className="font-bold tabular"
                    style={{ color: '#d4af37', letterSpacing: '0.05em' }}
                  >
                    {awardData.position}
                  </span>
                )}
                {awardData.class && (
                  <span className="text-txt-secondary">{awardData.class}</span>
                )}
                <Link
                  to={`${pathPrefix}/team/${resolveTid(awardData.team, currentDynasty?.teams || TEAMS)}/${displayYear}`}
                  className="text-txt-secondary hover:text-txt-primary transition-colors truncate"
                >
                  {schoolName}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </Card>
    )
  }

  // Elite award card — accent left rail
  const EliteAwardCard = ({ awardKey, awardData }) => {
    const display = AWARD_DISPLAY[awardKey]
    const mascotName = getMascotName(awardData.team, currentDynasty?.teams || currentDynasty?.customTeams)
    const teamLogo = mascotName ? getTeamLogo(mascotName, currentDynasty?.teams || currentDynasty?.customTeams) : null
    const matchingPlayer = findPlayerByName(awardData.player, awardData.team, displayYear)
    const isCoachAward = display.category === 'coach'
    const schoolName = getSchoolName(mascotName) || awardData.team

    return (
      <Card padding="md" className="relative overflow-hidden">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <div className="label-xs text-txt-tertiary mb-1">{CATEGORY_LABEL[display.category] || ''}</div>
            <h3 className="font-semibold text-txt-primary text-sm leading-tight">{display.name}</h3>
          </div>
          {teamLogo && (
            <Link
              to={`${pathPrefix}/team/${resolveTid(awardData.team, currentDynasty?.teams || TEAMS)}/${displayYear}`}
              className="w-10 h-10 rounded-full bg-white p-1 flex-shrink-0"
              style={{ border: '1px solid var(--surface-4)' }}
            >
              <img src={teamLogo} alt="" className="w-full h-full object-contain" />
            </Link>
          )}
        </div>

        <div
          className="pt-3 flex items-start gap-2"
          style={{ borderTop: '1px solid var(--surface-4)' }}
        >
          {awardData.position && (
            <Badge variant="accent" size="sm">{awardData.position}</Badge>
          )}
          {isCoachAward && !awardData.position && (
            <Badge variant="accent" size="sm">HC</Badge>
          )}
          <div className="flex-1 min-w-0">
            {matchingPlayer && !isCoachAward ? (
              <Link
                to={`${pathPrefix}/player/${matchingPlayer.pid}`}
                className="font-semibold text-txt-primary hover:text-white transition-colors truncate block"
              >
                {awardData.player}
              </Link>
            ) : (
              <span className="font-semibold text-txt-primary truncate block">{awardData.player}</span>
            )}
            <div className="flex items-center gap-2 text-xs text-txt-tertiary">
              {!isCoachAward && awardData.class && <span>{awardData.class}</span>}
              {!isCoachAward && awardData.class && <span>•</span>}
              <span className="truncate">{schoolName}</span>
            </div>
          </div>
        </div>
      </Card>
    )
  }

  // Position award row — compact
  const PositionAwardRow = ({ awardKey, awardData }) => {
    const display = AWARD_DISPLAY[awardKey]
    const mascotName = getMascotName(awardData.team, currentDynasty?.teams || currentDynasty?.customTeams)
    const teamLogo = mascotName ? getTeamLogo(mascotName, currentDynasty?.teams || currentDynasty?.customTeams) : null
    const matchingPlayer = findPlayerByName(awardData.player, awardData.team, displayYear)
    const isCoachAward = display.category === 'coach'
    const schoolName = getSchoolName(mascotName) || awardData.team

    return (
      <Link
        to={matchingPlayer && !isCoachAward ? `${pathPrefix}/player/${matchingPlayer.pid}` : `${pathPrefix}/team/${resolveTid(awardData.team, currentDynasty?.teams || TEAMS)}/${displayYear}`}
        className="group flex items-center gap-3 px-3 py-2.5 hover:bg-surface-3 transition-colors"
        style={{ borderBottom: '1px solid var(--surface-4)' }}
      >
        {teamLogo ? (
          <div className="w-8 h-8 rounded-full bg-white p-0.5 flex-shrink-0">
            <img src={teamLogo} alt="" className="w-full h-full object-contain" />
          </div>
        ) : (
          <div className="w-8 h-8 rounded-full bg-surface-4 flex-shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-txt-primary text-sm truncate group-hover:text-white transition-colors">
              {awardData.player}
            </span>
            {!isCoachAward && awardData.position && (
              <Badge variant="outline" size="sm">{awardData.position}</Badge>
            )}
          </div>
          <div className="text-xs text-txt-tertiary truncate">
            {display.name} · {schoolName}
          </div>
        </div>
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

  const heroActions = !isViewOnly ? (
    <Button variant="primary" size="sm" onClick={() => setShowAwardsModal(true)}>
      Edit
    </Button>
  ) : null

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow={`${displayYear} Season`}
        title={
          <TitleWithYear
            year={displayYear}
            years={availableYears}
            onChange={handleYearChange}
            label="Awards"
          />
        }
        meta={<span>National individual honors</span>}
        actions={heroActions}
      />

      {!hasAnyAwards ? (
        <Card>
          <EmptyState
            title="No Awards Yet"
            message={`Award winners for the ${displayYear} season haven't been recorded yet.`}
            action={!isViewOnly && (
              <Button variant="primary" onClick={() => setShowAwardsModal(true)}>
                Add Awards
              </Button>
            )}
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {heismanData && <HeismanCard awardData={heismanData} />}

          {eliteAwards.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <h2
                  className="label-xs text-txt-secondary"
                  style={{ letterSpacing: '2.5px', fontSize: '10px' }}
                >
                  Major Awards
                </h2>
                <div className="flex-1 h-px bg-surface-4" />
                <span
                  className="label-xs tabular text-txt-tertiary"
                  style={{ letterSpacing: '1.5px', fontSize: '10px' }}
                >
                  {eliteAwards.length}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {eliteAwards.map(({ key, data }) => (
                  <EliteAwardCard key={key} awardKey={key} awardData={data} />
                ))}
              </div>
            </div>
          )}

          {positionAwards.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <h2
                  className="label-xs text-txt-secondary"
                  style={{ letterSpacing: '2.5px', fontSize: '10px' }}
                >
                  Position Awards
                </h2>
                <div className="flex-1 h-px bg-surface-4" />
                <span
                  className="label-xs tabular text-txt-tertiary"
                  style={{ letterSpacing: '1.5px', fontSize: '10px' }}
                >
                  {positionAwards.length}
                </span>
              </div>
              <Card padding="none">
                {positionAwards.map(({ key, data }) => (
                  <PositionAwardRow key={key} awardKey={key} awardData={data} />
                ))}
              </Card>
            </div>
          )}
        </div>
      )}

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
