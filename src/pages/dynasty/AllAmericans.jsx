import { useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { getTeamLogo, getMascotName as getMascotNameFromTeams, stripMascotFromName } from '../../data/teams'
import { getTeamColors } from '../../data/teamColors'
import { TEAMS, resolveTid } from '../../data/teamRegistry'
import AllAmericansModal from '../../components/AllAmericansModal'
import { normalizePlayerName } from '../../utils/playerMatching'
import { useTeamColors } from '../../hooks/useTeamColors'
import {
  PageHero,
  Card,
  Button,
  Badge,
  EmptyState,
  Tabs,
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

// Delegate to the shared mascot-strip helper so the known-mascot list
// stays in one place across the app.
const getSchoolName = stripMascotFromName

const cleanPlayerName = (name) => {
  if (!name) return ''
  return name.replace(/^[\s★⭐✦•*·●◆♦▪■\-–—]+/, '').trim()
}

const DESIGNATION_LABEL = {
  first: 'First Team',
  second: 'Second Team',
  freshman: 'Freshman',
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

  // First-season dynasties have no prior year — default to current
  // year so a 2025-start dynasty doesn't open showing "2024".
  const isFirstSeason = Number(currentDynasty.currentYear) <= Number(currentDynasty.startYear)
  const displayYear = urlYear
    ? parseInt(urlYear)
    : (isFirstSeason ? currentDynasty.currentYear : currentDynasty.currentYear - 1)
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

  const findPlayerByNameAndSchool = (playerName, school, schoolTid = null) => {
    if (!playerName || !currentDynasty.players) return null
    const normalizedName = normalizePlayerName(cleanPlayerName(playerName))
    const normalizedSchool = school?.toUpperCase()
    const tidNum = schoolTid != null ? Number(schoolTid) : null

    // Tid match — survives teambuilder rename. Compares the AA entry's
    // schoolTid (resolved at sheet-read time) to any team identifier the
    // player carries (current p.team if numeric, OR any tid in teamsByYear,
    // OR the tid resolved from any of the player's stored allAmericans/
    // allConference school abbrs against the current registry).
    const playerMatchesTid = (p) => {
      if (tidNum == null) return false
      if (typeof p.team === 'number' && Number(p.team) === tidNum) return true
      if (p.teamsByYear) {
        for (const v of Object.values(p.teamsByYear)) {
          if (v != null && Number(v) === tidNum) return true
        }
      }
      // Honor entries on the player carry tid sometimes (post-pass-2 reads).
      if (p.allAmericans?.some(aa => aa.schoolTid != null && Number(aa.schoolTid) === tidNum)) return true
      if (p.allConference?.some(ac => ac.schoolTid != null && Number(ac.schoolTid) === tidNum)) return true
      return false
    }

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
      // Teambuilder teams live in dynasty.teams / customTeams — those
      // lookups must come BEFORE falling back to the static TEAMS table,
      // otherwise a custom team's players get filtered out.
      const resolveAbbrForTid = (tid) => {
        const t = currentDynasty?.teams?.[tid]
          || currentDynasty?.customTeams?.[tid]
          || TEAMS[tid]
        return t?.abbr?.toUpperCase() || null
      }
      if (p.team) {
        const playerTeamAbbr = typeof p.team === 'number'
          ? resolveAbbrForTid(p.team)
          : p.team.toUpperCase()
        if (playerTeamAbbr === normalizedSchool) return true
      }
      if (p.teamsByYear) {
        for (const tid of Object.values(p.teamsByYear)) {
          if (typeof tid === 'number' && resolveAbbrForTid(tid) === normalizedSchool) {
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

    // Tid disambiguation first; abbr fallback only if tid not provided
    // or didn't disambiguate.
    const tidMatch = nameMatches.find(p => playerMatchesTid(p))
    if (tidMatch) return tidMatch
    const schoolMatch = nameMatches.find(p => playerMatchesSchool(p))
    if (schoolMatch) return schoolMatch

    return nameMatches[0]
  }

  const PlayerRow = ({ player }) => {
    const mascotName = getMascotName(player.school, currentDynasty?.teams || currentDynasty?.customTeams)
    const teamLogo = mascotName ? getTeamLogo(mascotName, currentDynasty?.teams || currentDynasty?.customTeams) : null
    const colors = mascotName ? getTeamColors(mascotName, currentDynasty?.teams || currentDynasty?.customTeams) : { primary: '#64748b', secondary: '#fff' }
    const matchingPlayer = findPlayerByNameAndSchool(player.player, player.school, player.schoolTid)
    const schoolName = getSchoolName(mascotName) || player.school

    return (
      <div
        className="group flex items-center gap-3 px-3 py-2 hover:bg-surface-3 transition-colors"
        style={{ borderBottom: '1px solid var(--surface-4)' }}
      >
        <span className="w-8 text-center label-xs flex-shrink-0 text-txt-secondary">
          {player.position}
        </span>

        {teamLogo ? (
          <Link
            to={`${pathPrefix}/team/${resolveTid(player.school, currentDynasty?.teams || TEAMS)}/${displayYear}`}
            className="w-7 h-7 rounded-full bg-white p-0.5 flex-shrink-0"
          >
            <img src={teamLogo} alt="" className="w-full h-full object-contain" />
          </Link>
        ) : (
          <div className="w-7 h-7 rounded-full bg-surface-4 flex-shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          {matchingPlayer ? (
            <Link
              to={`${pathPrefix}/player/${matchingPlayer.pid}`}
              className="font-medium text-sm text-txt-primary hover:text-white transition-colors truncate block"
            >
              {cleanPlayerName(player.player)}
            </Link>
          ) : (
            <span className="font-medium text-sm text-txt-primary truncate block">
              {cleanPlayerName(player.player)}
            </span>
          )}
          <div className="text-xs text-txt-tertiary truncate">
            {player.class && <>{player.class} · </>}{schoolName}
          </div>
        </div>
      </div>
    )
  }

  const TeamSection = ({ designation, players }) => {
    if (players.length === 0) return null

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <h2 className="label-xs text-txt-secondary">{DESIGNATION_LABEL[designation]}</h2>
          <div className="flex-1 h-px bg-surface-4" />
          <Badge variant="outline" size="sm">{players.length}</Badge>
        </div>

        <Card padding="none">
          {players.map((player, idx) => (
            <PlayerRow
              key={`${designation}-${player.position}-${player.player}-${idx}`}
              player={player}
            />
          ))}
        </Card>
      </div>
    )
  }

  const hasAnyPlayers = allAmericans.length > 0

  const heroActions = !isViewOnly ? (
    <Button variant="primary" size="sm" onClick={() => setShowEditModal(true)}>
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
            label="All-Americans"
          />
        }
        meta={<span>National team honors</span>}
        actions={heroActions}
      />

      {hasAnyPlayers && (
        <Tabs
          variant="pill"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `All (${allAmericans.length})` },
            { value: 'first', label: `1st Team (${groupedByDesignation.first.length})` },
            { value: 'second', label: `2nd Team (${groupedByDesignation.second.length})` },
            { value: 'freshman', label: `Freshman (${groupedByDesignation.freshman.length})` },
          ]}
        />
      )}

      {!hasAnyPlayers ? (
        <Card>
          <EmptyState
            title="No All-Americans Yet"
            message={`All-American selections for the ${displayYear} season haven't been recorded yet.`}
            action={!isViewOnly && (
              <Button variant="primary" onClick={() => setShowEditModal(true)}>
                Add All-Americans
              </Button>
            )}
          />
        </Card>
      ) : filter === 'all' ? (
        <div className="space-y-6">
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
