import { useState, useEffect, useRef } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useDynasty, calculateTeamRecordFromGames, getCustomConferencesForYear } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useTeamColors } from '../../hooks/useTeamColors'
import { getTeamLogo, getMascotName as getMascotNameFromTeams, stripMascotFromName } from '../../data/teams'
import { getTeamColors } from '../../data/teamColors'
import { getConferenceLogo } from '../../data/conferenceLogos'
import ConferencesModal from '../../components/ConferencesModal'
import { TEAMS, resolveTid } from '../../data/teamRegistry'
import { conferenceTeams as DEFAULT_CONFERENCE_TEAMS } from '../../data/conferenceTeams'
import {
  PageHero,
  Card,
  Button,
  EmptyState,
  Input,
  TitleWithYear,
} from '../../components/ui'

// Extract school name from full mascot name. Delegates to the shared
// helper in src/data/teams.js so the known-mascot list lives in one
// place — adding a new two/three-word mascot there fixes every page
// (this one, AllAmericans, Awards, Rankings, Player, etc.) at once.
const getSchoolName = stripMascotFromName

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
  const [searchParams] = useSearchParams()
  const { currentDynasty, updateDynasty, saveConferenceAlignment, isViewOnly } = useDynasty()
  const pathPrefix = usePathPrefix()
  const teamColors = useTeamColors(currentDynasty?.teamName, currentDynasty?.teams || currentDynasty?.customTeams)
  const [searchQuery, setSearchQuery] = useState('')
  const [showConferencesModal, setShowConferencesModal] = useState(false)
  // Track flash highlight for the conference linked from the team page.
  const [highlightConf, setHighlightConf] = useState(null)
  const containerRef = useRef(null)
  // ?conf=<name> tells us to scroll a specific conference into view —
  // used by the conference link on the team page.
  const focusConf = searchParams.get('conf')

  useEffect(() => {
    if (!focusConf || !containerRef.current) return
    // Run after layout so heights are correct.
    const rafId = requestAnimationFrame(() => {
      const el = containerRef.current?.querySelector(
        `[data-conference="${CSS.escape(focusConf)}"]`
      )
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setHighlightConf(focusConf)
        // Drop the highlight after the flash so it doesn't stick on
        // subsequent navigations within the page.
        const t = setTimeout(() => setHighlightConf(null), 2200)
        return () => clearTimeout(t)
      }
    })
    return () => cancelAnimationFrame(rafId)
  }, [focusConf])

  if (!currentDynasty) return null

  const standingsByYear = currentDynasty.conferenceStandingsByYear || {}
  // Year picker shows: any year with saved standings, any year with
  // games entered (so an in-progress season is reachable), and the
  // dynasty's current year as a guaranteed entry.
  const yearsCombined = new Set(
    Object.keys(standingsByYear).map(y => parseInt(y))
  )
  for (const g of (currentDynasty.games || [])) {
    const y = Number(g?.year)
    if (Number.isFinite(y)) yearsCombined.add(y)
  }
  if (currentDynasty.currentYear) yearsCombined.add(Number(currentDynasty.currentYear))

  const availableYears = Array.from(yearsCombined).sort((a, b) => b - a)
  // Default to the dynasty's CURRENT year — the page now derives
  // standings live from games[], so the current season is always
  // populated as soon as any score has been entered.
  const displayYear = urlYear ? parseInt(urlYear) : Number(currentDynasty.currentYear)
  const handleYearChange = (year) => navigate(`${pathPrefix}/conference-standings/${year}`)
  const yearStandings = standingsByYear[displayYear] || {}

  const filteredConferences = CONFERENCE_ORDER.filter(conf => {
    if (searchQuery === '') return true
    return conf.toLowerCase().includes(searchQuery.toLowerCase())
  })

  const heroActions = !isViewOnly ? (
    <Button variant="secondary" size="sm" onClick={() => setShowConferencesModal(true)}>
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

  // No empty state for "no saved standings" anymore — the page derives
  // standings from games[] + the conference alignment, so it always
  // shows something. Saved standings just become the seed when they
  // exist (carrying over rank order + PF/PA tiebreakers from EOS).

  // User's tracked team — used to highlight their row across every
  // conference card so they can scan and immediately find themselves.
  const userTid = currentDynasty.currentTid != null ? Number(currentDynasty.currentTid) : null

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
    const linkTid = team.tid != null ? Number(team.tid) : resolveTid(teamAbbr, teamsSource || TEAMS)
    // Coverage-aware source-of-truth: pick whichever record covers more
    // games — calc-from-games or the saved standings row. Same rule the
    // team page uses (TeamYear.jsx ~1402). Without this, a single
    // weekly-scores entry against an opponent (e.g. one bowl game vs
    // Duke) would override Duke's saved 9-4 standings row and show 0-1
    // here while the team page still showed 9-4 — exactly the bug the
    // user reported. Ties go to calc since it carries per-game point-diff
    // numbers the saved standings row can't give us.
    const calc = linkTid ? calculateTeamRecordFromGames(currentDynasty, linkTid, displayYear) : null
    const calcGames = calc ? (calc.wins + calc.losses) : 0
    const storedGames = (team.wins || 0) + (team.losses || 0)
    const useLive = calcGames > 0 && calcGames >= storedGames
    const liveWins = useLive ? calc.wins : (team.wins || 0)
    const liveLosses = useLive ? calc.losses : (team.losses || 0)
    const liveConfWins = useLive ? (calc.confWins || 0) : (team.confWins || 0)
    const liveConfLosses = useLive ? (calc.confLosses || 0) : (team.confLosses || 0)
    // PF/PA mirror the same coverage rule. When the saved standings row
    // covers more games, its PF/PA wins; calc PF/PA only tracks the
    // recorded subset.
    const livePointsFor = useLive ? (calc.pointsFor || 0) : (team.pointsFor || 0)
    const livePointsAgainst = useLive ? (calc.pointsAgainst || 0) : (team.pointsAgainst || 0)
    const livePointDiff = livePointsFor - livePointsAgainst
    const diffColor = livePointDiff !== 0 ? 'var(--text-primary)' : 'var(--text-tertiary)'
    const isLeader = rank === 1
    const isUserTeam = userTid != null && linkTid != null && Number(linkTid) === userTid

    return (
      <Link
        to={`${pathPrefix}/team/${linkTid}/${displayYear}`}
        className={`standings-row group relative flex items-center gap-3 py-2 px-3 transition-all duration-150 ${
          isUserTeam ? 'standings-row--user' : ''
        }`}
        style={{
          borderTop: '1px solid var(--surface-4)',
          backgroundColor: isUserTeam
            ? 'color-mix(in srgb, #d4a44a 8%, var(--surface-2))'
            : isLeader
              ? 'color-mix(in srgb, var(--surface-3) 60%, transparent)'
              : 'transparent',
        }}
      >
        <div
          className="w-6 text-right font-display font-black tabular leading-none flex-shrink-0"
          style={{
            color: isLeader ? 'var(--text-primary)' : 'var(--text-tertiary)',
            fontSize: isLeader ? '15px' : '14px',
          }}
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

        <span
          className="flex-1 text-sm truncate group-hover:text-txt-primary transition-colors"
          style={{
            fontWeight: isLeader ? 700 : 500,
            color: 'var(--text-primary)',
          }}
        >
          {getSchoolName(mascotName) || teamAbbr}
        </span>

        {/* Combined record cell — overall first, conference in parens
            ("9-1 (6-1)"). Sort is still by CONF record (handled in the
            enriched sort fn below); the conference half just shares the
            cell with overall instead of getting its own column. */}
        <span
          className="text-sm font-display tabular flex-shrink-0 text-right whitespace-nowrap"
          style={{ width: '120px' }}
          title={`${liveWins}-${liveLosses} overall · ${liveConfWins}-${liveConfLosses} conference`}
        >
          <span className="font-black text-txt-primary tabular-nums">
            {liveWins}<span className="text-txt-tertiary font-normal">–</span>{liveLosses}
          </span>
          <span className="text-txt-tertiary font-normal tabular-nums ml-1.5">
            ({liveConfWins}<span className="text-txt-muted">–</span>{liveConfLosses})
          </span>
        </span>

        <div className="relative flex-shrink-0 group/diff">
          <span
            className="text-xs font-semibold tabular w-12 text-right block cursor-help"
            style={{ color: diffColor }}
          >
            {livePointDiff > 0 ? '+' : ''}{livePointDiff}
          </span>
          <div
            className="absolute bottom-full right-0 mb-1.5 px-2 py-1 text-[10px] opacity-0 group-hover/diff:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10"
            style={{ backgroundColor: 'var(--surface-4)', color: 'var(--text-secondary)', borderRadius: '4px' }}
          >
            <span style={{ color: 'var(--text-primary)' }}>{livePointsFor} PF</span>
            <span className="mx-1" style={{ color: 'var(--text-muted)' }}>|</span>
            <span style={{ color: 'var(--text-tertiary)' }}>{livePointsAgainst} PA</span>
          </div>
        </div>
      </Link>
    )
  }

  // Build a roster for this conference — saved standings if they
  // exist, otherwise stub rows from the (custom) conference alignment
  // for the year. Stub rows have wins/losses 0; the live re-rank
  // pass below populates them from games[] so an in-progress season
  // shows real records as soon as scores are entered.
  const teamsSource = currentDynasty?.teams || currentDynasty?.customTeams
  const customConfsForYear = getCustomConferencesForYear(currentDynasty, displayYear)
  const buildConferenceRoster = (conferenceName) => {
    const saved = getConferenceData(yearStandings, conferenceName)
    if (saved.length > 0) return saved

    const confMap = customConfsForYear || DEFAULT_CONFERENCE_TEAMS
    const aliases = CONFERENCE_ALIASES[conferenceName] || [conferenceName]
    let teamAbbrs = []
    for (const alias of aliases) {
      if (Array.isArray(confMap[alias]) && confMap[alias].length > 0) {
        teamAbbrs = confMap[alias]
        break
      }
    }
    return teamAbbrs.map(abbr => {
      const tid = resolveTid(abbr, teamsSource || TEAMS)
      return { team: abbr, tid: tid != null ? Number(tid) : null, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 }
    })
  }

  // Conference card component
  const ConferenceCard = ({ conferenceName }) => {
    const teams = buildConferenceRoster(conferenceName)
    const hasData = teams.length > 0
    const confLogo = getConferenceLogo(conferenceName)

    if (!hasData && searchQuery) return null

    return (
      <Card padding="none" className="standings-card relative overflow-hidden transition-all duration-200">
        <div
          className="flex items-center gap-3 px-4 py-3"
          style={{ borderBottom: '1px solid var(--surface-4)' }}
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
            {/* Column header strip — broadcast lower-third style. The
                record column reads OVR (CONF) on every breakpoint —
                combined into one cell because that's how broadcasts
                show it ("9-1 (6-1)") and it cuts the horizontal noise
                roughly in half. Sort is still by conference record. */}
            <div
              className="flex items-center gap-3 px-3 py-1.5"
              style={{
                borderBottom: '1px solid var(--surface-4)',
                backgroundColor: 'var(--surface-1)',
              }}
            >
              <span style={{ width: '24px' }} />
              <span style={{ width: '24px' }} />
              <span className="flex-1" />
              <span
                className="label-xs text-txt-tertiary text-right flex-shrink-0"
                style={{ width: '120px', letterSpacing: '1.5px', fontSize: '9px' }}
                title="Overall record (Conference record). Sorted by conference record."
              >
                REC (CONF)
              </span>
              <span
                className="label-xs text-txt-tertiary text-right flex-shrink-0"
                style={{ width: '48px', letterSpacing: '1.5px', fontSize: '9px' }}
              >
                DIFF
              </span>
            </div>
            {(() => {
              // Re-sort by live games[]-derived record so the standings
              // reorder as weekly scores come in. Falls back to the saved
              // rank when no team in the conference has any game data
              // for the year (e.g. a future season the user is browsing).
              const teamsSrc = currentDynasty?.teams || currentDynasty?.customTeams
              const enriched = teams.map(t => {
                const tid = t.tid != null ? Number(t.tid) : resolveTid(t.team, teamsSrc || TEAMS)
                const calc = tid ? calculateTeamRecordFromGames(currentDynasty, tid, displayYear) : null
                // Coverage-aware sort: same rule as the row render above.
                // Use calc only when it covers >= the saved standings'
                // games count, so a partial weekly-scores entry can't
                // demote a team whose full season is on file from the
                // standings sheet.
                const calcGames = calc ? (calc.wins + calc.losses) : 0
                const storedGames = (t.wins || 0) + (t.losses || 0)
                const useLive = calcGames > 0 && calcGames >= storedGames
                const liveDiff = useLive
                  ? (calc.pointsFor || 0) - (calc.pointsAgainst || 0)
                  : (t.pointsFor || 0) - (t.pointsAgainst || 0)
                return {
                  ...t,
                  _liveWins: useLive ? calc.wins : (t.wins || 0),
                  _liveLosses: useLive ? calc.losses : (t.losses || 0),
                  _liveConfWins: useLive ? (calc.confWins || 0) : (t.confWins || 0),
                  _liveConfLosses: useLive ? (calc.confLosses || 0) : (t.confLosses || 0),
                  _liveDiff: liveDiff,
                  _isLive: useLive,
                }
              })
              const anyLive = enriched.some(t => t._isLive)
              // Sort by conference record first (the primary standings
              // metric in CFB), with overall record as the next tier of
              // tiebreaker, then point differential. Matches how every
              // real conference publishes its standings.
              const sortFn = anyLive
                ? (a, b) => {
                    if (b._liveConfWins !== a._liveConfWins) return b._liveConfWins - a._liveConfWins
                    if (a._liveConfLosses !== b._liveConfLosses) return a._liveConfLosses - b._liveConfLosses
                    if (b._liveWins !== a._liveWins) return b._liveWins - a._liveWins
                    if (a._liveLosses !== b._liveLosses) return a._liveLosses - b._liveLosses
                    if (b._liveDiff !== a._liveDiff) return b._liveDiff - a._liveDiff
                    return 0
                  }
                : (a, b) => (a.rank || 0) - (b.rank || 0)
              return enriched.sort(sortFn).map((team, idx) => (
                <TeamRow
                  key={`${team.team}-${idx}`}
                  team={team}
                  rank={anyLive ? idx + 1 : (team.rank || idx + 1)}
                />
              ))
            })()}
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

      <div ref={containerRef} className="grid grid-cols-1 lg:grid-cols-2 gap-6 stagger-reveal">
        {filteredConferences.map(conferenceName => (
          <div
            key={conferenceName}
            data-conference={conferenceName}
            className={
              highlightConf === conferenceName
                ? 'rounded-lg ring-2 ring-offset-2 ring-offset-bg-primary transition-shadow duration-300'
                : ''
            }
            style={highlightConf === conferenceName ? { '--tw-ring-color': teamColors?.primary || '#fbbf24' } : undefined}
          >
            <ConferenceCard conferenceName={conferenceName} />
          </div>
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
        .standings-row--user:hover {
          background-color: color-mix(in srgb, #d4a44a 14%, var(--surface-3)) !important;
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
          // saveConferenceAlignment fans the bulk map out to each
          // team's per-year `byYear[year].conference` field, AND
          // continues writing the legacy customConferencesByYear /
          // customConferences stores for backward compat.
          if (isMultiYear) {
            for (const [yearKey, mapForYear] of Object.entries(data)) {
              await saveConferenceAlignment(currentDynasty.id, Number(yearKey), mapForYear)
            }
          } else {
            await saveConferenceAlignment(currentDynasty.id, currentDynasty.currentYear, data)
          }
        }}
        teamColors={teamColors}
      />
    </div>
  )
}
