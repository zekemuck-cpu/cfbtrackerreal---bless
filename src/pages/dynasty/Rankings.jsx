import { useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { getTeamLogo, getMascotName as getMascotNameFromTeams } from '../../data/teams'
import { getTeamColors } from '../../data/teamColors'
import { TEAMS, resolveTid } from '../../data/teamRegistry'
import { PageHero, Card, EmptyState, Tabs, TitleWithYear } from '../../components/ui'

const getSchoolName = (mascotName) => {
  if (!mascotName) return null
  // Order matters — longer/more-specific mascots must come first so that
  // "Delaware Fightin' Blue Hens" doesn't match "Blue Hens" first.
  const specialMascots = [
    'Fightin\' Blue Hens', 'Fightin Blue Hens', 'Fighting Blue Hens',
    'Crimson Tide', 'Blue Hens', 'Golden Flashes', 'Mean Green',
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

export default function Rankings() {
  const { year: urlYear } = useParams()
  const navigate = useNavigate()
  const { currentDynasty } = useDynasty()
  const pathPrefix = usePathPrefix()
  const [activeTab, setActiveTab] = useState('both')

  if (!currentDynasty) return null

  const finalPolls = currentDynasty.finalPollsByYear || {}
  const yearsWithData = Object.keys(finalPolls).map(y => parseInt(y))

  if (!yearsWithData.includes(currentDynasty.currentYear)) {
    yearsWithData.push(currentDynasty.currentYear)
  }

  const availableYears = yearsWithData.sort((a, b) => b - a)
  // First-season dynasties have no prior year — default to current
  // year so a 2025-start dynasty doesn't open showing "2024".
  const isFirstSeason = Number(currentDynasty.currentYear) <= Number(currentDynasty.startYear)
  const displayYear = urlYear
    ? parseInt(urlYear)
    : (isFirstSeason ? currentDynasty.currentYear : currentDynasty.currentYear - 1)
  const yearPolls = finalPolls[displayYear] || {}
  const mediaPoll = yearPolls.media || []
  const coachesPoll = yearPolls.coaches || []

  const standingsByYear = currentDynasty.conferenceStandingsByYear || {}
  const yearStandings = standingsByYear[displayYear] || {}
  // Index records by BOTH tid and abbr — abbr lookup is the legacy path,
  // tid lookup survives teambuilder renames. Sheet readers store both
  // (`team` + `tid`) on each row.
  const teamRecords = {}
  const teamRecordsByTid = {}
  Object.values(yearStandings).forEach(conferenceTeams => {
    if (Array.isArray(conferenceTeams)) {
      conferenceTeams.forEach(team => {
        const rec = { wins: team.wins || 0, losses: team.losses || 0 }
        if (team.team) teamRecords[team.team] = rec
        if (team.tid != null) teamRecordsByTid[Number(team.tid)] = rec
      })
    }
  })
  const lookupRecord = (abbr, tid) => {
    if (tid != null && teamRecordsByTid[Number(tid)]) return teamRecordsByTid[Number(tid)]
    return teamRecords[abbr] || null
  }

  const handleYearChange = (year) => navigate(`${pathPrefix}/rankings/${year}`)

  if (availableYears.length === 0) {
    return (
      <div className="space-y-6">
        <PageHero eyebrow="Final Rankings" title="Top 25" />
        <Card>
          <EmptyState
            title="No Rankings Yet"
            message="Complete a season and enter final rankings to see the championship standings."
          />
        </Card>
      </div>
    )
  }

  const PlayoffTeamCard = ({ rank, teamAbbr, teamTid, year }) => {
    const teamsSource = currentDynasty?.teams || currentDynasty?.customTeams
    // Tid-first resolution — survives teambuilder renames since the abbr
    // stored on the poll row may have drifted.
    const teamFromTid = teamTid != null ? teamsSource?.[teamTid] : null
    const resolvedAbbr = teamFromTid?.abbr || teamAbbr
    const mascotName = teamFromTid?.name || getMascotName(resolvedAbbr, teamsSource)
    const teamLogo = mascotName ? getTeamLogo(mascotName, teamsSource) : null
    const colors = mascotName ? getTeamColors(mascotName, teamsSource) : { primary: '#6e6e78', secondary: '#fff' }
    const record = lookupRecord(resolvedAbbr, teamTid)
    const schoolName = getSchoolName(mascotName) || resolvedAbbr

    const linkTid = teamTid != null ? Number(teamTid) : resolveTid(resolvedAbbr, teamsSource || TEAMS)

    return (
      <Link
        to={`${pathPrefix}/team/${linkTid}/${year}`}
        className="playoff-card group relative flex flex-col items-center text-center px-3 pt-5 pb-4 rounded-lg bg-surface-2 transition-all duration-200 overflow-hidden"
        style={{ border: '1px solid var(--rule-soft, var(--surface-4))' }}
      >
        <span
          aria-hidden="true"
          className="absolute top-0 left-0 right-0 h-[3px] transition-all duration-200 group-hover:h-[5px]"
          style={{ backgroundColor: 'var(--surface-5)' }}
        />
        <span
          className="font-display font-black tabular leading-none mb-2"
          style={{
            fontSize: 'clamp(1.75rem, 3.5vw, 2.5rem)',
            color: 'var(--text-primary)',
            letterSpacing: '-0.02em',
          }}
        >
          <span className="text-txt-tertiary">#</span>{rank}
        </span>
        <div className="logo-container logo-container-xl mb-2 transition-transform duration-200 group-hover:scale-110">
          {teamLogo ? (
            <img src={teamLogo} alt="" />
          ) : (
            <div
              className="w-full h-full rounded-full flex items-center justify-center font-bold"
              style={{ backgroundColor: colors.primary, color: colors.secondary }}
            >
              {(resolvedAbbr || '').charAt(0)}
            </div>
          )}
        </div>
        <div className="font-semibold text-sm text-txt-primary truncate w-full transition-colors group-hover:text-white">
          {schoolName}
        </div>
        {record && (
          <div className="text-xs text-txt-tertiary tabular mt-0.5">
            {record.wins}-{record.losses}
          </div>
        )}
      </Link>
    )
  }

  const RankingRow = ({ rank, teamAbbr, teamTid, year }) => {
    const teamsSource = currentDynasty?.teams || currentDynasty?.customTeams
    const teamFromTid = teamTid != null ? teamsSource?.[teamTid] : null
    const resolvedAbbr = teamFromTid?.abbr || teamAbbr
    const mascotName = teamFromTid?.name || getMascotName(resolvedAbbr, teamsSource)
    const teamLogo = mascotName ? getTeamLogo(mascotName, teamsSource) : null
    const colors = mascotName ? getTeamColors(mascotName, teamsSource) : { primary: '#6e6e78', secondary: '#fff' }
    const record = lookupRecord(resolvedAbbr, teamTid)
    const linkTid = teamTid != null ? Number(teamTid) : resolveTid(resolvedAbbr, teamsSource || TEAMS)

    return (
      <Link
        to={`${pathPrefix}/team/${linkTid}/${year}`}
        className="ranking-row group relative flex items-center gap-3 px-3 py-2.5 transition-all duration-150"
        style={{ borderBottom: '1px solid var(--rule-soft, var(--surface-4))' }}
      >
        <span
          aria-hidden="true"
          className="absolute left-0 top-0 bottom-0 w-0 group-hover:w-[3px] transition-all duration-200"
          style={{ backgroundColor: 'var(--surface-5)' }}
        />
        <span
          className="w-8 text-right font-display font-black tabular text-sm"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {rank}
        </span>
        <div className="logo-container logo-container-md flex-shrink-0 transition-transform duration-200 group-hover:scale-110">
          {teamLogo ? (
            <img src={teamLogo} alt="" />
          ) : (
            <div
              className="w-full h-full rounded-full flex items-center justify-center text-xs font-bold"
              style={{ backgroundColor: colors.primary, color: colors.secondary }}
            >
              {(resolvedAbbr || '').charAt(0)}
            </div>
          )}
        </div>
        <span className="flex-1 font-medium text-sm text-txt-primary truncate transition-colors group-hover:text-white">
          {getSchoolName(mascotName) || resolvedAbbr}
        </span>
        {record && (
          <span className="text-xs text-txt-tertiary tabular flex-shrink-0">
            {record.wins}-{record.losses}
          </span>
        )}
      </Link>
    )
  }

  const PollColumn = ({ title, data, pollType }) => {
    const top4 = data.filter(e => e.rank <= 4).sort((a, b) => a.rank - b.rank)
    const rest = data.filter(e => e.rank > 4).sort((a, b) => a.rank - b.rank)

    return (
      <section className="space-y-4 reveal">
        <header className="flex items-end justify-between">
          <div>
            <div
              className="label-xs text-txt-tertiary mb-1"
              style={{ letterSpacing: '2px', fontSize: '10px' }}
            >
              Final Poll
            </div>
            <h2 className="text-display-md text-txt-primary m-0 leading-none">{title}</h2>
          </div>
          <span
            className="label-xs text-txt-tertiary tabular"
            style={{ letterSpacing: '1.5px', fontSize: '10px' }}
          >
            {data.length} TEAMS
          </span>
        </header>

        {data.length > 0 ? (
          <>
            {top4.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 stagger-reveal">
                {top4.map((entry) => (
                  <PlayoffTeamCard
                    key={`${pollType}-top-${entry.rank}`}
                    rank={entry.rank}
                    teamAbbr={entry.team}
                    teamTid={entry.tid}
                    year={displayYear}
                  />
                ))}
              </div>
            )}

            {rest.length > 0 && (
              <Card padding="none" className="overflow-hidden">
                {rest.map((entry) => (
                  <RankingRow
                    key={`${pollType}-${entry.rank}`}
                    rank={entry.rank}
                    teamAbbr={entry.team}
                    teamTid={entry.tid}
                    year={displayYear}
                  />
                ))}
              </Card>
            )}
          </>
        ) : (
          <Card>
            <EmptyState
              variant="compact"
              title="No data"
              message={`No ${title.toLowerCase()} data for ${displayYear}.`}
            />
          </Card>
        )}
      </section>
    )
  }

  return (
    <div className="space-y-6 page-enter">
      <PageHero
        eyebrow="Final Rankings"
        title={
          <TitleWithYear
            year={displayYear}
            years={availableYears}
            onChange={handleYearChange}
            label="Top 25"
          />
        }
        meta={<span>End of season poll standings</span>}
      />

      {/* Mobile poll switcher */}
      <div className="lg:hidden">
        <Tabs
          variant="pill"
          value={activeTab}
          onChange={setActiveTab}
          options={[
            { value: 'both', label: 'Both' },
            { value: 'media', label: 'AP Poll' },
            { value: 'coaches', label: 'Coaches' },
          ]}
        />
      </div>

      <div className={`grid gap-8 ${activeTab === 'both' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 max-w-2xl mx-auto'}`}>
        {(activeTab === 'both' || activeTab === 'media') && (
          <PollColumn title="Media Poll" data={mediaPoll} pollType="media" />
        )}
        {(activeTab === 'both' || activeTab === 'coaches') && (
          <PollColumn title="Coaches Poll" data={coachesPoll} pollType="coaches" />
        )}
      </div>

      <style>{`
        .playoff-card:hover {
          background-color: var(--surface-3);
          transform: translateY(-2px);
          border-color: color-mix(in srgb, var(--surface-5) 60%, transparent);
        }
        .ranking-row:hover {
          background-color: var(--surface-3);
        }
      `}</style>
    </div>
  )
}
