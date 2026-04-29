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
  TitleWithYear,
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
  // Default to the prior year (most recent completed season) on most
  // visits, but stay on the current year when this IS the first season
  // of the dynasty — there's no prior year to look at, and showing
  // "2024 standings" on a 2025-start dynasty is just confusing.
  const isFirstSeason = Number(currentDynasty.currentYear) <= Number(currentDynasty.startYear)
  const displayYear = urlYear
    ? parseInt(urlYear)
    : (isFirstSeason ? currentDynasty.currentYear : currentDynasty.currentYear - 1)
  const handleYearChange = (year) => navigate(`${pathPrefix}/conference-standings/${year}`)
  const yearStandings = standingsByYear[displayYear] || {}

  const filteredConferences = CONFERENCE_ORDER.filter(conf => {
    if (searchQuery === '') return true
    return conf.toLowerCase().includes(searchQuery.toLowerCase())
  })

  const heroActions = !isViewOnly ? (
    <Button variant="primary" size="sm" onClick={() => setShowConferencesModal(true)}>
      Edit
    </Button>
  ) : null

  const hero = (
    <PageHero
      eyebrow="Standings"
      title={
        availableYears.length > 0 ? (
          <TitleWithYear
            year={displayYear}
            years={availableYears}
            onChange={handleYearChange}
            label="Conference Standings"
          />
        ) : (
          "Conference Standings"
        )
      }
      meta={<span>Season records by conference</span>}
      actions={heroActions}
    />
  )

  const pageWrapperClass = "space-y-6 page-enter"

  // Empty state
  if (availableYears.length === 0 || Object.keys(yearStandings).length === 0) {
    return (
      <div className={pageWrapperClass}>
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

  // Team row component. Tid-first identity so a renamed teambuilder team
  // still resolves to current logo/name/link — `team.team` is the abbr at
  // sheet-write time and may have drifted since.
  const TeamRow = ({ team, rank }) => {
    const teamsSource = currentDynasty?.teams || currentDynasty?.customTeams
    const teamFromTid = team.tid != null ? teamsSource?.[team.tid] : null
    const teamAbbr = teamFromTid?.abbr || team.team
    const mascotName = teamFromTid?.name || getMascotName(teamAbbr, teamsSource)
    const logo = mascotName ? getTeamLogo(mascotName, teamsSource) : null
    const colors = mascotName ? getTeamColors(mascotName, teamsSource) : { primary: '#666', secondary: '#fff' }
    const pointDiff = (team.pointsFor || 0) - (team.pointsAgainst || 0)
    const diffColor = pointDiff !== 0 ? 'var(--text-primary)' : 'var(--text-tertiary)'
    const linkTid = team.tid != null ? Number(team.tid) : resolveTid(teamAbbr, teamsSource || TEAMS)

    return (
      <Link
        to={`${pathPrefix}/team/${linkTid}/${displayYear}`}
        className="standings-row group relative flex items-center gap-3 py-2 px-3 transition-all duration-150"
        style={{ borderTop: '1px solid var(--rule-soft, var(--surface-4))' }}
      >
        <span
          aria-hidden="true"
          className="absolute left-0 top-0 bottom-0 w-0 group-hover:w-[3px] transition-all duration-200"
          style={{ backgroundColor: 'var(--surface-5)' }}
        />
        <div
          className="w-6 text-right font-display font-black tabular text-sm leading-none flex-shrink-0"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {rank}
        </div>

        <div className="w-6 h-6 rounded-full bg-white p-0.5 flex-shrink-0 transition-transform duration-150 group-hover:scale-110">
          {logo ? (
            <img src={logo} alt="" className="w-full h-full object-contain" />
          ) : (
            <div className="w-full h-full rounded-full flex items-center justify-center" style={{ backgroundColor: colors.primary }}>
              <span className="text-[10px] font-bold" style={{ color: colors.secondary }}>{teamAbbr?.charAt(0)}</span>
            </div>
          )}
        </div>

        <span className="flex-1 text-sm font-medium text-txt-primary truncate group-hover:text-white transition-colors">
          {getSchoolName(mascotName) || teamAbbr}
        </span>

        <span className="text-sm font-display font-black text-txt-primary tabular flex-shrink-0">
          {team.wins || 0}<span className="text-txt-tertiary font-normal">–</span>{team.losses || 0}
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
            <span style={{ color: 'var(--text-primary)' }}>{team.pointsFor || 0} PF</span>
            <span className="mx-1" style={{ color: 'var(--text-muted)' }}>|</span>
            <span style={{ color: 'var(--text-tertiary)' }}>{team.pointsAgainst || 0} PA</span>
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
      <Card padding="none" className="standings-card relative overflow-hidden transition-all duration-200">
        <span
          aria-hidden="true"
          className="absolute top-0 left-0 right-0 h-[2px]"
          style={{ backgroundColor: 'var(--surface-5)', opacity: hasData ? 1 : 0.25 }}
        />
        <div
          className="flex items-center gap-3 px-4 py-3"
          style={{ borderBottom: '1px solid var(--rule-soft, var(--surface-4))' }}
        >
          <div
            className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-white p-1 rounded-md"
          >
            {confLogo ? (
              <img src={confLogo} alt="" className="w-full h-full object-contain" />
            ) : (
              <span className="text-base font-bold text-txt-tertiary">{conferenceName.charAt(0)}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div
              className="label-xs text-txt-tertiary"
              style={{ letterSpacing: '1.5px', fontSize: '9px' }}
            >
              CONFERENCE
            </div>
            <h3 className="font-display font-bold text-txt-primary text-base truncate leading-tight">
              {conferenceName}
            </h3>
          </div>
          <div
            className="flex items-baseline gap-1.5 px-2.5 py-1 rounded flex-shrink-0"
            style={{ backgroundColor: hasData ? 'var(--surface-3)' : 'transparent' }}
          >
            <span
              className="font-display font-black tabular text-sm leading-none"
              style={{ color: hasData ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
            >
              {teams.length}
            </span>
            <span
              className="label-xs text-txt-tertiary"
              style={{ letterSpacing: '1.5px', fontSize: '9px' }}
            >
              {teams.length === 1 ? 'TEAM' : 'TEAMS'}
            </span>
          </div>
        </div>

        {hasData ? (
          <div>
            {teams.sort((a, b) => (a.rank || 0) - (b.rank || 0)).map((team, idx) => (
              <TeamRow key={`${team.team}-${idx}`} team={team} rank={team.rank || idx + 1} />
            ))}
          </div>
        ) : (
          <div className="px-4 py-8 text-center">
            <p
              className="label-xs text-txt-tertiary"
              style={{ letterSpacing: '1.5px', fontSize: '10px' }}
            >
              NO STANDINGS DATA FOR {displayYear}
            </p>
          </div>
        )}
      </Card>
    )
  }

  return (
    <div className={pageWrapperClass}>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 stagger-reveal">
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

      <style>{`
        .standings-row:hover {
          background-color: var(--surface-3);
        }
        .standings-card:hover {
          border-color: color-mix(in srgb, var(--surface-5) 50%, transparent);
        }
      `}</style>

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
