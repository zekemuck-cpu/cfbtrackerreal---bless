import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useTeamColors } from '../../hooks/useTeamColors'
import { getTeamLogo, getMascotName as getMascotNameFromTeams } from '../../data/teams'
import { getTeamColors } from '../../data/teamColors'
import { getConferenceLogo } from '../../data/conferenceLogos'
import ConferencesModal from '../../components/ConferencesModal'
import { TEAMS, resolveTid } from '../../data/teamRegistry'
import {
  PageHero,
  Card,
  Button,
  EmptyState,
  Input,
  Select,
} from '../../components/ui'

// Extract school name from full mascot name
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

// Map abbreviation to mascot name for logo lookup
const getMascotName = (abbr, teamsData = null) => {
  if (teamsData) {
    const result = getMascotNameFromTeams(abbr, teamsData)
    if (result) return result
  }
  const mascotMap = {
    'BAMA': 'Alabama Crimson Tide', 'AFA': 'Air Force Falcons', 'AKR': 'Akron Zips',
    'APP': 'Appalachian State Mountaineers', 'ARIZ': 'Arizona Wildcats',
    'ARK': 'Arkansas Razorbacks', 'ARMY': 'Army Black Knights',
    'ARST': 'Arkansas State Red Wolves', 'ASU': 'Arizona State Sun Devils',
    'AUB': 'Auburn Tigers', 'BALL': 'Ball State Cardinals', 'BC': 'Boston College Eagles',
    'BGSU': 'Bowling Green Falcons', 'BOIS': 'Boise State Broncos',
    'BU': 'Baylor Bears', 'BUFF': 'Buffalo Bulls', 'BYU': 'Brigham Young Cougars',
    'CAL': 'California Golden Bears', 'CCU': 'Coastal Carolina Chanticleers',
    'CHAR': 'Charlotte 49ers', 'CLEM': 'Clemson Tigers', 'CMU': 'Central Michigan Chippewas',
    'COLO': 'Colorado Buffaloes', 'CONN': 'Connecticut Huskies', 'CSU': 'Colorado State Rams',
    'DUKE': 'Duke Blue Devils', 'ECU': 'East Carolina Pirates', 'EMU': 'Eastern Michigan Eagles',
    'FIU': 'Florida International Panthers', 'FSU': 'Florida State Seminoles',
    'FAU': 'Florida Atlantic Owls', 'FRES': 'Fresno State Bulldogs',
    'UF': 'Florida Gators', 'GASO': 'Georgia Southern Eagles', 'GAST': 'Georgia State Panthers',
    'GT': 'Georgia Tech Yellow Jackets', 'UGA': 'Georgia Bulldogs',
    'HAW': 'Hawaii Rainbow Warriors', 'HOU': 'Houston Cougars',
    'ILL': 'Illinois Fighting Illini', 'IU': 'Indiana Hoosiers',
    'IOWA': 'Iowa Hawkeyes', 'ISU': 'Iowa State Cyclones',
    'JKST': 'Jacksonville State Gamecocks', 'JMU': 'James Madison Dukes',
    'KU': 'Kansas Jayhawks', 'KSU': 'Kansas State Wildcats',
    'KENT': 'Kent State Golden Flashes', 'UK': 'Kentucky Wildcats',
    'LIB': 'Liberty Flames', 'ULL': 'Lafayette Ragin\' Cajuns',
    'LT': 'Louisiana Tech Bulldogs', 'LOU': 'Louisville Cardinals',
    'LSU': 'LSU Tigers', 'UM': 'Miami Hurricanes', 'M-OH': 'Miami Redhawks',
    'UMD': 'Maryland Terrapins', 'MASS': 'Massachusetts Minutemen',
    'MEM': 'Memphis Tigers', 'MICH': 'Michigan Wolverines',
    'MSU': 'Michigan State Spartans', 'MTSU': 'Middle Tennessee State Blue Raiders',
    'MINN': 'Minnesota Golden Gophers', 'MISS': 'Ole Miss Rebels',
    'MSST': 'Mississippi State Bulldogs', 'MZST': 'Missouri State Bears',
    'MRSH': 'Marshall Thundering Herd', 'NAVY': 'Navy Midshipmen',
    'NEB': 'Nebraska Cornhuskers', 'NEV': 'Nevada Wolf Pack',
    'UNM': 'New Mexico Lobos', 'NMSU': 'New Mexico State Aggies',
    'UNC': 'North Carolina Tar Heels', 'NCST': 'North Carolina State Wolfpack',
    'UNT': 'North Texas Mean Green', 'NU': 'Northwestern Wildcats',
    'ND': 'Notre Dame Fighting Irish', 'NIU': 'Northern Illinois Huskies',
    'OHIO': 'Ohio Bobcats', 'OSU': 'Ohio State Buckeyes',
    'OKLA': 'Oklahoma Sooners', 'OKST': 'Oklahoma State Cowboys',
    'ODU': 'Old Dominion Monarchs', 'ORE': 'Oregon Ducks',
    'ORST': 'Oregon State Beavers', 'PSU': 'Penn State Nittany Lions',
    'PITT': 'Pittsburgh Panthers', 'PUR': 'Purdue Boilermakers',
    'RICE': 'Rice Owls', 'RUT': 'Rutgers Scarlet Knights',
    'SDSU': 'San Diego State Aztecs', 'SJSU': 'San Jose State Spartans',
    'SAM': 'Sam Houston State Bearkats', 'USF': 'South Florida Bulls',
    'SMU': 'SMU Mustangs', 'USC': 'USC Trojans',
    'SCAR': 'South Carolina Gamecocks', 'STAN': 'Stanford Cardinal',
    'SYR': 'Syracuse Orange', 'TCU': 'TCU Horned Frogs',
    'TEM': 'Temple Owls', 'TENN': 'Tennessee Volunteers',
    'TEX': 'Texas Longhorns', 'TXAM': 'Texas A&M Aggies',
    'TXST': 'Texas State Bobcats', 'TXTECH': 'Texas Tech Red Raiders',
    'TOL': 'Toledo Rockets', 'TROY': 'Troy Trojans',
    'TUL': 'Tulane Green Wave', 'TLSA': 'Tulsa Golden Hurricane',
    'UAB': 'UAB Blazers', 'UCF': 'UCF Knights', 'UCLA': 'UCLA Bruins',
    'UNLV': 'UNLV Rebels', 'UTEP': 'UTEP Miners',
    'USA': 'South Alabama Jaguars', 'USU': 'Utah State Aggies',
    'UTAH': 'Utah Utes', 'UTSA': 'UTSA Roadrunners',
    'VAN': 'Vanderbilt Commodores', 'UVA': 'Virginia Cavaliers',
    'VT': 'Virginia Tech Hokies', 'WAKE': 'Wake Forest Demon Deacons',
    'WASH': 'Washington Huskies', 'WSU': 'Washington State Cougars',
    'WVU': 'West Virginia Mountaineers', 'WMU': 'Western Michigan Broncos',
    'WKU': 'Western Kentucky Hilltoppers', 'WIS': 'Wisconsin Badgers',
    'WYO': 'Wyoming Cowboys',
    'DEL': 'Delaware Fightin\' Blue Hens', 'FLA': 'Florida Gators',
    'KENN': 'Kennesaw State Owls', 'ULM': 'Monroe Warhawks',
    'UC': 'Cincinnati Bearcats', 'RUTG': 'Rutgers Scarlet Knights',
    'SHSU': 'Sam Houston State Bearkats', 'TAMU': 'Texas A&M Aggies',
    'TTU': 'Texas Tech Red Raiders', 'TULN': 'Tulane Green Wave',
    'UH': 'Houston Cougars', 'UL': 'Lafayette Ragin\' Cajuns',
    'UT': 'Tennessee Volunteers', 'MIA': 'Miami Hurricanes',
    'MIZ': 'Missouri Tigers', 'OU': 'Oklahoma Sooners',
    'GSU': 'Georgia State Panthers',
    'USM': 'Southern Mississippi Golden Eagles',
    'FCSE': 'FCS East Judicials', 'FCSM': 'FCS Midwest Rebels',
    'FCSN': 'FCS Northwest Stallions', 'FCSW': 'FCS West Titans'
  }
  return mascotMap[abbr] || null
}

const CONFERENCE_ORDER = [
  'ACC', 'American', 'Big 12', 'Big Ten', 'Conference USA',
  'Independent', 'MAC', 'Mountain West', 'Pac-12', 'SEC', 'Sun Belt'
]

const CONFERENCE_ALIASES = {
  'Mountain West': ['Mountain West', 'MWC'],
  'ACC': ['ACC'],
  'American': ['American', 'AAC'],
  'Big 12': ['Big 12', 'Big XII'],
  'Big Ten': ['Big Ten', 'B1G'],
  'Conference USA': ['Conference USA', 'CUSA', 'C-USA'],
  'Independent': ['Independent', 'Ind', 'IND'],
  'MAC': ['MAC'],
  'Pac-12': ['Pac-12', 'Pac 12'],
  'SEC': ['SEC'],
  'Sun Belt': ['Sun Belt']
}

const getConferenceData = (yearStandings, conferenceName) => {
  const aliases = CONFERENCE_ALIASES[conferenceName] || [conferenceName]
  for (const alias of aliases) {
    if (yearStandings[alias] && yearStandings[alias].length > 0) {
      return yearStandings[alias]
    }
  }
  return []
}

export default function ConferenceStandings() {
  const { year: urlYear } = useParams()
  const navigate = useNavigate()
  const { currentDynasty, updateDynasty, isViewOnly } = useDynasty()
  const pathPrefix = usePathPrefix()
  const teamColors = useTeamColors(currentDynasty?.teamName, currentDynasty?.teams || currentDynasty?.customTeams)
  const [searchQuery, setSearchQuery] = useState('')
  const [showConferencesModal, setShowConferencesModal] = useState(false)

  if (!currentDynasty) return null

  const standingsByYear = currentDynasty.conferenceStandingsByYear || {}
  const yearsWithData = Object.keys(standingsByYear).map(y => parseInt(y))

  if (!yearsWithData.includes(currentDynasty.currentYear)) {
    yearsWithData.push(currentDynasty.currentYear)
  }

  const availableYears = yearsWithData.sort((a, b) => b - a)
  const displayYear = urlYear ? parseInt(urlYear) : currentDynasty.currentYear - 1
  const handleYearChange = (year) => navigate(`${pathPrefix}/conference-standings/${year}`)
  const yearStandings = standingsByYear[displayYear] || {}

  const filteredConferences = CONFERENCE_ORDER.filter(conf => {
    if (searchQuery === '') return true
    return conf.toLowerCase().includes(searchQuery.toLowerCase())
  })

  const heroActions = (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={displayYear}
        onChange={(e) => handleYearChange(parseInt(e.target.value))}
        size="sm"
        disabled={availableYears.length === 0}
      >
        {availableYears.length === 0 ? (
          <option value="">No seasons</option>
        ) : (
          availableYears.map((year) => (
            <option key={year} value={year}>{year}</option>
          ))
        )}
      </Select>
      {!isViewOnly && (
        <Button variant="primary" size="sm" onClick={() => setShowConferencesModal(true)}>
          Edit
        </Button>
      )}
    </div>
  )

  const hero = (
    <PageHero
      eyebrow="Standings"
      title="Conference Standings"
      meta={<span>Season records by conference</span>}
      actions={heroActions}
    />
  )

  // Empty state
  if (availableYears.length === 0 || Object.keys(yearStandings).length === 0) {
    return (
      <div className="space-y-6">
        {hero}
        <Card>
          <EmptyState
            title="No Standings Data"
            message="Conference standings will appear here after you enter them during the End of Season Recap."
          />
        </Card>
        <ConferencesModal
          isOpen={showConferencesModal}
          onClose={() => setShowConferencesModal(false)}
          onSave={async (data) => {
            const isMultiYear = Object.keys(data).every(key => /^\d{4}$/.test(key))
            if (isMultiYear) {
              const existingByYear = currentDynasty.customConferencesByYear || {}
              const newByYear = { ...existingByYear, ...data }
              await updateDynasty(currentDynasty.id, {
                customConferencesByYear: newByYear,
                ...(data[currentDynasty.currentYear] ? { customConferences: data[currentDynasty.currentYear] } : {})
              })
            } else {
              const existingByYear = currentDynasty.customConferencesByYear || {}
              await updateDynasty(currentDynasty.id, {
                customConferencesByYear: { ...existingByYear, [currentDynasty.currentYear]: data },
                customConferences: data
              })
            }
          }}
          teamColors={teamColors}
        />
      </div>
    )
  }

  // Team row component
  const TeamRow = ({ team, rank }) => {
    const teamAbbr = team.team
    const mascotName = getMascotName(teamAbbr, currentDynasty?.teams || currentDynasty?.customTeams)
    const logo = mascotName ? getTeamLogo(mascotName, currentDynasty?.teams || currentDynasty?.customTeams) : null
    const colors = mascotName ? getTeamColors(mascotName, currentDynasty?.teams || currentDynasty?.customTeams) : { primary: '#666', secondary: '#fff' }
    const pointDiff = (team.pointsFor || 0) - (team.pointsAgainst || 0)
    const diffColor = pointDiff > 0 ? 'var(--accent-success)' : pointDiff < 0 ? 'var(--accent-error)' : 'var(--text-muted)'

    return (
      <Link
        to={`${pathPrefix}/team/${resolveTid(teamAbbr, currentDynasty?.teams || TEAMS)}/${displayYear}`}
        className="group flex items-center gap-3 py-2 px-3 transition-colors hover:bg-surface-3"
        style={{ borderTop: '1px solid var(--surface-4)' }}
      >
        <div
          className="w-6 text-right label-xs tabular flex-shrink-0"
          style={{ color: 'var(--text-muted)' }}
        >
          {rank}
        </div>

        <div className="w-6 h-6 rounded-full bg-white p-0.5 flex-shrink-0">
          {logo ? (
            <img src={logo} alt="" className="w-full h-full object-contain" />
          ) : (
            <div className="w-full h-full rounded-full flex items-center justify-center" style={{ backgroundColor: colors.primary }}>
              <span className="text-[10px] font-bold" style={{ color: colors.secondary }}>{teamAbbr?.charAt(0)}</span>
            </div>
          )}
        </div>

        <span className="flex-1 text-sm text-txt-primary truncate group-hover:text-[color:var(--team-primary)] transition-colors">
          {getSchoolName(mascotName) || teamAbbr}
        </span>

        <span className="text-sm font-semibold text-txt-primary tabular flex-shrink-0">
          {team.wins || 0}-{team.losses || 0}
        </span>

        <div className="relative flex-shrink-0 group/diff">
          <span
            className="text-xs font-semibold tabular w-12 text-right block cursor-help"
            style={{ color: diffColor }}
          >
            {pointDiff > 0 ? '+' : ''}{pointDiff}
          </span>
          <div
            className="absolute bottom-full right-0 mb-1.5 px-2 py-1 text-[10px] opacity-0 group-hover/diff:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10"
            style={{ backgroundColor: 'var(--surface-4)', color: 'var(--text-secondary)', borderRadius: '4px' }}
          >
            <span style={{ color: 'var(--accent-success)' }}>{team.pointsFor || 0} PF</span>
            <span className="mx-1" style={{ color: 'var(--text-muted)' }}>|</span>
            <span style={{ color: 'var(--accent-error)' }}>{team.pointsAgainst || 0} PA</span>
          </div>
        </div>
      </Link>
    )
  }

  // Conference card component
  const ConferenceCard = ({ conferenceName }) => {
    const teams = getConferenceData(yearStandings, conferenceName)
    const hasData = teams.length > 0
    const confLogo = getConferenceLogo(conferenceName)

    if (!hasData && searchQuery) return null

    return (
      <Card padding="none">
        <div
          className="flex items-center gap-3 px-4 py-3"
          style={{ borderBottom: '1px solid var(--surface-4)' }}
        >
          <div
            className="w-8 h-8 flex-shrink-0 flex items-center justify-center bg-white/10 p-1"
            style={{ borderRadius: '4px' }}
          >
            {confLogo ? (
              <img src={confLogo} alt="" className="w-full h-full object-contain" />
            ) : (
              <span className="text-sm font-bold text-txt-tertiary">{conferenceName.charAt(0)}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-txt-primary text-sm truncate">{conferenceName}</h3>
          </div>
          <span className="label-xs text-txt-tertiary">{teams.length} teams</span>
        </div>

        {hasData ? (
          <div>
            {teams.sort((a, b) => (a.rank || 0) - (b.rank || 0)).map((team, idx) => (
              <TeamRow key={`${team.team}-${idx}`} team={team} rank={team.rank || idx + 1} />
            ))}
          </div>
        ) : (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-txt-tertiary">No standings data for {displayYear}</p>
          </div>
        )}
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {hero}

      <div className="max-w-md">
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search conferences..."
          size="md"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredConferences.map(conferenceName => (
          <ConferenceCard key={conferenceName} conferenceName={conferenceName} />
        ))}
      </div>

      {filteredConferences.length === 0 && searchQuery && (
        <Card>
          <EmptyState
            compact
            title={`No conferences found matching "${searchQuery}"`}
          />
        </Card>
      )}

      <ConferencesModal
        isOpen={showConferencesModal}
        onClose={() => setShowConferencesModal(false)}
        onSave={async (data) => {
          const isMultiYear = Object.keys(data).every(key => /^\d{4}$/.test(key))
          if (isMultiYear) {
            const existingByYear = currentDynasty.customConferencesByYear || {}
            const newByYear = { ...existingByYear, ...data }
            await updateDynasty(currentDynasty.id, {
              customConferencesByYear: newByYear,
              ...(data[currentDynasty.currentYear] ? { customConferences: data[currentDynasty.currentYear] } : {})
            })
          } else {
            const existingByYear = currentDynasty.customConferencesByYear || {}
            await updateDynasty(currentDynasty.id, {
              customConferencesByYear: { ...existingByYear, [currentDynasty.currentYear]: data },
              customConferences: data
            })
          }
        }}
        teamColors={teamColors}
      />
    </div>
  )
}
