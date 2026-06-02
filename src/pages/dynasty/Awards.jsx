import { useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useTeamColors } from '../../hooks/useTeamColors'
import { getTeamLogo, getMascotName as getMascotNameFromTeams, stripMascotFromName } from '../../data/teams'
import { TEAMS, resolveTid, getCurrentTeamAbbr, getTidFromAbbr } from '../../data/teamRegistry'
import AwardsModal from '../../components/AwardsModal'
import { normalizePlayerName as normalizePlayerNameUtil } from '../../utils/playerMatching'
import { proxyImageUrl } from '../../utils/imageProxy'
import {
  PageHero,
  Card,
  Button,
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

// Trophy artwork per award (keyed to the award keys above).
const AWARD_IMAGES = {
  heisman: 'https://i.imgur.com/QSEqrfZ.png',
  maxwell: 'https://i.imgur.com/PFQjCyy.png',
  walterCamp: 'https://i.imgur.com/VyEXh6I.png',
  chuckBednarik: 'https://i.imgur.com/gDyzPvN.png',
  broncoNagurski: 'https://i.imgur.com/I50KC2g.png',
  outland: 'https://i.imgur.com/QUWsA6c.png',
  lombardi: 'https://i.imgur.com/gfq762C.png',
  bearBryantCoachOfTheYear: 'https://i.imgur.com/oij7wEs.png',
  daveyObrien: 'https://i.imgur.com/Dy3u42Q.png',
  doakWalker: 'https://i.imgur.com/nBM1cVP.png',
  johnMackey: 'https://i.imgur.com/BOitGT8.png',
  fredBiletnikoff: 'https://i.imgur.com/Iasg7ZZ.png',
  jimThorpe: 'https://i.imgur.com/ngipDjp.png',
  unitasGoldenArm: 'https://i.imgur.com/jv5M8NL.png',
  dickButkus: 'https://i.imgur.com/RRWai9B.png',
  edgeRusherOfTheYear: 'https://i.imgur.com/akmqbUw.png', // Ted Hendricks Award
  rimington: 'https://i.imgur.com/IzDtHBk.png',
  louGroza: 'https://i.imgur.com/3x0LhzY.png',
  rayGuy: 'https://i.imgur.com/VfkzgIk.png',
  broyles: 'https://i.imgur.com/WZaJ975.png',
  returnerOfTheYear: 'https://i.imgur.com/CHVXg6r.png', // Jet Award
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

  // Default year picker — prefer the most recent year that actually has
  // awards entered. The old rule was "current year - 1 unless first
  // season," but that landed on 2033 even when the user had already
  // saved 2034 awards (mid- or end-of-season). The new rule walks the
  // year list newest-to-oldest, picks the first year with any awards,
  // and falls back to the current year if none are saved yet. URL year
  // (when explicitly navigated to) always wins.
  const yearHasAwards = (y) => {
    const yearAwardsObj = awardsByYear[y] || awardsByYear[String(y)] || null
    return !!yearAwardsObj && Object.keys(yearAwardsObj).length > 0
  }
  const mostRecentYearWithAwards = availableYears.find(yearHasAwards) || null
  const isFirstSeason = Number(currentDynasty.currentYear) <= Number(currentDynasty.startYear)
  const displayYear = urlYear
    ? parseInt(urlYear)
    : (mostRecentYearWithAwards
        ?? (isFirstSeason ? currentDynasty.currentYear : currentDynasty.currentYear - 1))
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
    const teamTid = teamAbbrVal ? getTidFromAbbr(teamAbbrVal, currentDynasty) : null

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

  // Trophy card — the award's trophy shown large, with the award name above
  // and the winner below. The whole card links to the winner's player page
  // (or the team page for coach awards). The Heisman gets a subtle gold ring.
  const TrophyCard = ({ awardKey, awardData }) => {
    const display = AWARD_DISPLAY[awardKey]
    const img = AWARD_IMAGES[awardKey]
    const mascotName = getMascotName(awardData.team, currentDynasty?.teams || currentDynasty?.customTeams)
    const teamLogo = mascotName ? getTeamLogo(mascotName, currentDynasty?.teams || currentDynasty?.customTeams) : null
    const matchingPlayer = findPlayerByName(awardData.player, awardData.team, displayYear)
    const isCoachAward = display.category === 'coach'
    const schoolName = getSchoolName(mascotName) || awardData.team
    const isHeisman = awardKey === 'heisman'
    const to = (matchingPlayer && !isCoachAward)
      ? `${pathPrefix}/player/${matchingPlayer.pid}`
      : `${pathPrefix}/team/${resolveTid(awardData.team, currentDynasty?.teams || TEAMS)}/${displayYear}`

    return (
      <Link to={to} className="group block h-full">
        <div
          className={`relative h-full rounded-xl bg-surface-2 border p-4 flex flex-col items-center text-center transition-all hover:bg-surface-3 ${isHeisman ? 'border-[#d4af37]/50 ring-1 ring-[#d4af37]/30' : 'border-surface-4 hover:border-surface-5'}`}
        >
          {/* Award name */}
          <div
            className="label-xs text-txt-tertiary mb-3 leading-tight line-clamp-2 w-full"
            style={{ letterSpacing: '1.2px', fontSize: '9px', minHeight: '22px' }}
          >
            {display.name}
          </div>

          {/* Trophy */}
          <div className="h-24 sm:h-28 flex items-center justify-center mb-3">
            {img ? (
              <img
                src={proxyImageUrl(img, 240)}
                alt={display.name}
                className="max-h-full w-auto object-contain transition-transform duration-200 group-hover:scale-105"
                style={{ filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.45))' }}
              />
            ) : (
              <span className="text-txt-tertiary text-xs">—</span>
            )}
          </div>

          {/* Winner */}
          <div className="mt-auto w-full min-w-0">
            <div className="font-semibold text-txt-primary text-sm leading-tight truncate">{awardData.player}</div>
            <div className="mt-1 flex items-center justify-center gap-1.5 text-[11px] text-txt-tertiary min-w-0">
              {teamLogo && <img src={teamLogo} alt="" className="w-4 h-4 object-contain flex-shrink-0" />}
              {!isCoachAward && awardData.position && (
                <span className="font-semibold text-txt-secondary">{awardData.position}</span>
              )}
              <span className="truncate">{schoolName}</span>
            </div>
          </div>
        </div>
      </Link>
    )
  }

  // Awards present this season, in canonical order, for the trophy gallery.
  const presentAwards = AWARD_ORDER
    .filter(key => yearAwards[key])
    .map(key => ({ key, data: yearAwards[key] }))
  const hasAnyAwards = presentAwards.length > 0

  const heroActions = !isViewOnly ? (
    <Button variant="secondary" size="sm" onClick={() => setShowAwardsModal(true)}>
      Edit
    </Button>
  ) : null

  return (
    <div className="space-y-6">
      <PageHero
        title={
          <TitleWithYear
            year={displayYear}
            years={availableYears}
            onChange={handleYearChange}
            label="Awards"
          />
        }
        actions={heroActions}
      />

      {!hasAnyAwards ? (
        <Card>
          <EmptyState
            title="No Awards Yet"
            action={!isViewOnly && (
              <Button variant="secondary" onClick={() => setShowAwardsModal(true)}>
                Add Awards
              </Button>
            )}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {presentAwards.map(({ key, data }) => (
            <TrophyCard key={key} awardKey={key} awardData={data} />
          ))}
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
