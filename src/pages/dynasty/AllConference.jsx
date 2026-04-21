import { useState, useMemo } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useDynasty, getCustomConferencesForYear, getTeamConferenceForDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { getTeamLogo, getMascotName as getMascotNameFromTeams } from '../../data/teams'
import { getTeamColors } from '../../data/teamColors'
import { TEAMS, resolveTid, getCurrentTeamAbbr } from '../../data/teamRegistry'
import { conferenceTeams, getAllConferences } from '../../data/conferenceTeams'
import AllConferenceModal from '../../components/AllConferenceModal'
import { normalizePlayerName } from '../../utils/playerMatching'
import { useTeamColors } from '../../hooks/useTeamColors'
import {
  PageHero,
  Card,
  Button,
  Badge,
  EmptyState,
  Select,
  Tabs,
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

const cleanPlayerName = (name) => {
  if (!name) return ''
  return name.replace(/^[\s★⭐✦•*·●◆♦▪■\-–—]+/, '').trim()
}

const DESIGNATION_LABEL = {
  first: 'First Team',
  second: 'Second Team',
  freshman: 'Freshman',
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

  const PlayerRow = ({ player }) => {
    const mascotName = getMascotName(player.school, currentDynasty?.teams || currentDynasty?.customTeams)
    const teamLogo = mascotName ? getTeamLogo(mascotName, currentDynasty?.teams || currentDynasty?.customTeams) : null
    const colors = mascotName ? getTeamColors(mascotName, currentDynasty?.teams || currentDynasty?.customTeams) : { primary: '#64748b', secondary: '#fff' }
    const matchingPlayer = findPlayerByNameAndSchool(player.player, player.school)
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
              className="font-medium text-sm text-txt-primary hover:text-[color:var(--team-primary)] transition-colors truncate block"
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
          <h2 className="label-xs text-txt-secondary">
            {DESIGNATION_LABEL[designation]} All-{displayConference}
          </h2>
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

  const hasAnyPlayers = allConference.length > 0

  const heroActions = (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={displayConference}
        onChange={(e) => handleConferenceChange(e.target.value)}
        size="sm"
      >
        {availableConferences.map((conf) => (
          <option key={conf} value={conf}>{conf}</option>
        ))}
      </Select>
      <Select
        value={displayYear}
        onChange={(e) => handleYearChange(parseInt(e.target.value))}
        size="sm"
      >
        {availableYears.map((year) => (
          <option key={year} value={year}>{year}</option>
        ))}
      </Select>
      {!isViewOnly && (
        <Button variant="primary" size="sm" onClick={() => setShowEditModal(true)}>
          Edit
        </Button>
      )}
    </div>
  )

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow={`${displayYear} Season`}
        title={`All-${displayConference}`}
        meta={<span>Conference team honors</span>}
        actions={heroActions}
      />

      {hasAnyPlayers && (
        <Tabs
          variant="pill"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `All (${allConference.length})` },
            { value: 'first', label: `1st Team (${groupedByDesignation.first.length})` },
            { value: 'second', label: `2nd Team (${groupedByDesignation.second.length})` },
            { value: 'freshman', label: `Freshman (${groupedByDesignation.freshman.length})` },
          ]}
        />
      )}

      {!hasAnyPlayers ? (
        <Card>
          <EmptyState
            title={`No All-${displayConference} Yet`}
            message={`All-Conference selections for the ${displayYear} ${displayConference} season haven't been recorded yet.`}
            action={!isViewOnly && (
              <Button variant="primary" onClick={() => setShowEditModal(true)}>
                Add All-Conference
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
