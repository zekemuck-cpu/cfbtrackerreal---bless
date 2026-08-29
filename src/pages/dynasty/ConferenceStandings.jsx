import { useState, useEffect, useRef, useMemo, useLayoutEffect } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useDynasty, calculateTeamRecordFromGames, getTeamRecord, getCustomConferencesForYear, getTeamRankForWeek, getConferenceDivisionsForYear, getTeamDivisionForDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useTeamColors } from '../../hooks/useTeamColors'
import { getTeamLogo, getMascotName as getMascotNameFromTeams, stripMascotFromName } from '../../data/teams'
import { getTeamColors } from '../../data/teamColors'
import { getContrastTextColor } from '../../utils/colorUtils'
import { getConferenceLogo } from '../../data/conferenceLogos'
import ConferencesModal from '../../components/ConferencesModal'
import { conferenceTeams as DEFAULT_CONFERENCE_TEAMS } from '../../data/conferenceTeams'
import { isPcAutoDynasty } from '../../editions'
import { getConferenceTrophy } from '../../utils/trophyEngine'
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
    'LIB': 'Liberty Flames', 'ULL': 'Louisiana Ragin\' Cajuns',
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
    'KENN': 'Kennesaw State Owls', 'ULM': 'UL Monroe Warhawks',
    'UC': 'Cincinnati Bearcats', 'RUTG': 'Rutgers Scarlet Knights',
    'SHSU': 'Sam Houston State Bearkats', 'TAMU': 'Texas A&M Aggies',
    'TTU': 'Texas Tech Red Raiders', 'TULN': 'Tulane Green Wave',
    'UH': 'Houston Cougars', 'UL': 'Louisiana Ragin\' Cajuns',
    'UT': 'Tennessee Volunteers', 'MIA': 'Miami Hurricanes',
    'MIZ': 'Missouri Tigers', 'OU': 'Oklahoma Sooners',
    'GSU': 'Georgia State Panthers',
    'USM': 'Southern Mississippi Golden Eagles',
    'FCSE': 'FCS East Sentinels', 'FCSM': 'FCS Midwest Thunderbirds',
    'FCSN': 'FCS Northwest Kodiaks', 'FCSW': 'FCS West Rivertoads'
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

// Smart name span — renders `full` when it fits in the container width,
// swaps to `abbr` when it would overflow. Hidden measurement span carries
// the full text so the comparison is stable regardless of which version
// is currently displayed (no oscillation).
function FittedName({ full, abbr, className, style }) {
  const containerRef = useRef(null)
  const measureRef = useRef(null)
  const [useAbbr, setUseAbbr] = useState(false)

  useLayoutEffect(() => {
    if (!abbr || abbr === full) return undefined
    const c = containerRef.current
    const m = measureRef.current
    if (!c || !m) return undefined
    const recompute = () => {
      const fits = m.scrollWidth <= c.clientWidth
      setUseAbbr(prev => (prev === !fits ? prev : !fits))
    }
    const ro = new ResizeObserver(recompute)
    ro.observe(c)
    recompute()
    return () => ro.disconnect()
  }, [full, abbr])

  return (
    <span
      ref={containerRef}
      className={className}
      style={{ ...(style || {}), position: 'relative', overflow: 'hidden', whiteSpace: 'nowrap' }}
    >
      <span
        ref={measureRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          visibility: 'hidden',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          left: -9999,
          top: 0,
        }}
      >
        {full}
      </span>
      {useAbbr && abbr ? abbr : full}
    </span>
  )
}

export default function ConferenceStandings() {
  const { year: urlYear } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { currentDynasty, updateDynasty, saveConferenceAlignment, isViewOnly } = useDynasty()
  const pathPrefix = usePathPrefix()
  // PC (CFB27) dynasties get conference alignment refreshed from the save's
  // own Conference table on every sync — there's nothing to hand-edit, so
  // the manual realignment editor is never offered, same as isViewOnly.
  const canEdit = !isViewOnly && !isPcAutoDynasty(currentDynasty)
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

  // PC (CFB27 auto-sync) dynasties get standings entirely from the save —
  // conferenceStandingsByYear is a legacy manual-entry snapshot
  // (ConferenceStandingsModal's Google Sheets flow) that the sync pipeline
  // never writes to, so for a PC dynasty it can only ever be stale/partial
  // leftover data (e.g. from before the dynasty switched fully to
  // auto-sync). Treat it as if it doesn't exist rather than letting it
  // shadow the live, save-derived roster/records computed below.
  const standingsByYear = isPcAutoDynasty(currentDynasty) ? {} : (currentDynasty.conferenceStandingsByYear || {})
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

  // The list of conferences to show is derived from the dynasty's ACTUAL
  // alignment (the single source of truth) — not a hardcoded set — so revived
  // / custom conferences like the NCAA 11 Big East and WAC appear, and empty
  // ones (e.g. American after a realignment) drop out. Order: the curated
  // CONFERENCE_ORDER first, then any extras alphabetically. Falls back to the
  // default modern order for a legacy dynasty with no custom alignment.
  const customConfsForYear = getCustomConferencesForYear(currentDynasty, displayYear)
  // A team's presence in dynasty.teams is the source of truth. The conference
  // alignment only positions teams that EXIST — so a team removed from the
  // dynasty (e.g. the non-2010 programs pruned by the NCAA 11 migration) drops
  // out of standings even if a stale alignment entry still lists it, and an
  // all-removed conference disappears entirely. This also sidesteps the fact
  // that customConferencesByYear is a merge-written seasonal field whose stale
  // keys can't be cleared by a normal save.
  const liveTeamAbbrs = useMemo(() => {
    const src = currentDynasty?.teams || currentDynasty?.customTeams || {}
    return new Set(Object.values(src).map(t => t?.abbr).filter(Boolean))
  }, [currentDynasty?.teams, currentDynasty?.customTeams])
  // tid is the stable team identity — a user-edited abbr must not drop a
  // team from its conference card or collide row keys. Membership is decided
  // by tid via this live-tid set. The alignment maps (customConfsForYear /
  // DEFAULT_CONFERENCE_TEAMS) are abbr-keyed, so each alignment abbr is
  // resolved to a tid ONCE against the live teams and compared here; we keep
  // the abbr path only when a tid can't be resolved (unknown team) so a
  // genuinely-unknown alignment entry never silently disappears.
  const liveTeamTids = useMemo(() => {
    const src = currentDynasty?.teams || currentDynasty?.customTeams || {}
    const set = new Set()
    for (const [key, t] of Object.entries(src)) {
      const tid = t?.tid != null ? Number(t.tid) : Number(key)
      if (Number.isFinite(tid)) set.add(tid)
    }
    return set
  }, [currentDynasty?.teams, currentDynasty?.customTeams])
  // Resolve an alignment abbr to a tid STRICTLY from the league file
  // (dynasty.teams). The static team registry only spawns NEW dynasties; once a
  // dynasty exists, its teams map is the sole source of truth. A user-edited
  // abbr must never be re-resolved through the registry, where the same string
  // can point at a different team (e.g. this dynasty's "UL" is Louisville, but
  // the registry's "UL" is Louisiana — that collision was rendering Louisville
  // as the Ragin' Cajuns). tid is the stable identity; abbrs are just labels.
  const abbrToTidLive = useMemo(() => {
    const src = currentDynasty?.teams || currentDynasty?.customTeams || {}
    const map = new Map()
    for (const [key, t] of Object.entries(src)) {
      const tid = t?.tid != null ? Number(t.tid) : Number(key)
      if (!Number.isFinite(tid)) continue
      const abbr = t?.abbr ? String(t.abbr).trim().toUpperCase() : null
      if (abbr && !map.has(abbr)) map.set(abbr, tid)
    }
    return map
  }, [currentDynasty?.teams, currentDynasty?.customTeams])
  const resolveTidLive = (abbr) => {
    if (abbr == null) return null
    const tid = abbrToTidLive.get(String(abbr).trim().toUpperCase())
    return tid != null ? tid : null
  }
  const abbrIsLive = (abbr) => {
    if (abbr == null) return false
    const tid = resolveTidLive(abbr)
    if (tid != null) return liveTeamTids.has(Number(tid))
    // tid unresolvable (unknown team) — keep the abbr path so nothing vanishes
    return liveTeamAbbrs.has(abbr)
  }
  const conferenceHasLiveTeams = (abbrs) =>
    Array.isArray(abbrs) && abbrs.some(a => abbrIsLive(a))

  const orderIndex = (name) => {
    const i = CONFERENCE_ORDER.indexOf(name)
    return i === -1 ? CONFERENCE_ORDER.length : i
  }
  const allConferenceNames = (customConfsForYear
    ? Object.keys(customConfsForYear).filter(c => conferenceHasLiveTeams(customConfsForYear[c]))
    : [...CONFERENCE_ORDER]
  ).sort((a, b) => (orderIndex(a) - orderIndex(b)) || a.localeCompare(b))

  const filteredConferences = allConferenceNames.filter(conf => {
    if (searchQuery === '') return true
    return conf.toLowerCase().includes(searchQuery.toLowerCase())
  })

  const heroActions = canEdit ? (
    <Button variant="secondary" size="sm" onClick={() => setShowConferencesModal(true)}>
      Edit
    </Button>
  ) : null

  const heroSearch = (
    <div className="w-44 sm:w-56">
      <Input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search conferences..."
        size="sm"
      />
    </div>
  )

  const hero = (
    <PageHero
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
      actions={
        <>
          {heroSearch}
          {heroActions}
        </>
      }
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

  // tid → conference-championship trophy, for the team that WON this year's
  // conference title game. Used to badge the champion's row with their trophy.
  const championTrophyByTid = useMemo(() => {
    const map = {}
    for (const g of currentDynasty?.games || []) {
      if (Number(g.year) !== displayYear) continue
      if (!(g.isConferenceChampionship || g.gameType === 'conference_championship')) continue
      const trophy = getConferenceTrophy(g.conference)
      if (!trophy) continue
      let winner = g.winnerTid
      if (winner == null || winner === '') {
        const s1 = Number(g.team1Score), s2 = Number(g.team2Score)
        if (Number.isFinite(s1) && Number.isFinite(s2) && s1 !== s2) winner = s1 > s2 ? g.team1Tid : g.team2Tid
      }
      if (winner != null && winner !== '') map[Number(winner)] = trophy
    }
    return map
  }, [currentDynasty?.games, displayYear])

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
    const linkTid = team.tid != null ? Number(team.tid) : resolveTidLive(teamAbbr)
    // Coverage-aware source-of-truth: pick whichever record covers more
    // games — calc-from-games or the saved standings row. Same rule the
    // team page uses (TeamYear.jsx ~1402). Without this, a single
    // weekly-scores entry against an opponent (e.g. one bowl game vs
    // Duke) would override Duke's saved 9-4 standings row and show 0-1
    // here while the team page still showed 9-4 — exactly the bug the
    // user reported. Ties go to calc since it carries per-game point-diff
    // numbers the saved standings row can't give us.
    // Coverage-aware record: getTeamRecord checks every stored source
    // (teams[tid].byYear[year].record, teamRecordsByTeamYear, the
    // standings row itself) and returns whichever covers the most
    // games, falling back to the live calc when nothing stored does.
    // Without this, a single user-vs-Duke game would show Duke 0-1
    // even when their stored 9-4 lives in `teams[tid].byYear[year]`
    // — exactly the bug reported on the conference standings page.
    // Read from the shared records-by-tid cache. Was running both
    // helper + calc inline per row — multiplied to ~16 conferences
    // × 12 rows × 2 calls per render.
    const cachedRec = getCachedRecord(linkTid)
    const recordFromHelper = cachedRec.helper
    const calc = cachedRec.calc
    const calcGames = calc ? (calc.wins + calc.losses) : 0
    const helperGames = recordFromHelper ? (recordFromHelper.wins + recordFromHelper.losses) : 0
    // The helper already handles the calc-vs-stored coverage decision.
    // Use its result for W-L and conf record; fall back to the inline
    // standings-row values only when the helper turned up nothing
    // (very early-season + no stored record anywhere).
    const liveWins = recordFromHelper ? recordFromHelper.wins : (team.wins || 0)
    const liveLosses = recordFromHelper ? recordFromHelper.losses : (team.losses || 0)
    const liveConfWins = recordFromHelper ? (recordFromHelper.confWins || 0) : (team.confWins || 0)
    const liveConfLosses = recordFromHelper ? (recordFromHelper.confLosses || 0) : (team.confLosses || 0)
    // PF/PA aren't on the helper's return shape — pick them with the
    // same coverage rule: live calc wins when it covers as many
    // games as the helper turned up, else use the standings row.
    const useLivePoints = calcGames > 0 && calcGames >= helperGames
    const livePointsFor = useLivePoints ? (calc.pointsFor || 0) : (team.pointsFor || 0)
    const livePointsAgainst = useLivePoints ? (calc.pointsAgainst || 0) : (team.pointsAgainst || 0)
    const livePointDiff = livePointsFor - livePointsAgainst
    const diffColor = livePointDiff !== 0 ? 'var(--text-primary)' : 'var(--text-tertiary)'
    const isLeader = rank === 1
    const isUserTeam = userTid != null && linkTid != null && Number(linkTid) === userTid

    // True, full team color — the box-score / game-card treatment, not a wash
    // that fades to dark and muddies the color. The user-team highlight becomes
    // a gold ring; the #1 leader is carried by bold + the brighter rank.
    const teamPrimary = colors?.primary || '#3a3d47'
    const txt = getContrastTextColor(teamPrimary)
    return (
      <Link
        to={`${pathPrefix}/team/${linkTid}/${displayYear}`}
        className={`standings-row group relative flex items-center gap-3 py-2 px-3 cfb-texture overflow-hidden transition-all duration-150 hover:brightness-110 ${
          isUserTeam ? 'standings-row--user' : ''
        }`}
        style={{
          borderTop: '1px solid rgba(0,0,0,0.28)',
          backgroundColor: teamPrimary,
          backgroundImage: 'linear-gradient(120deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0) 42%), linear-gradient(180deg, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.32) 100%)',
          ...(isUserTeam ? { boxShadow: 'inset 0 0 0 1.5px rgba(212,164,74,0.7)' } : {}),
        }}
      >
        <div
          className="w-6 text-right font-display font-black tabular leading-none flex-shrink-0"
          style={{
            color: txt,
            opacity: isLeader ? 1 : 0.82,
            fontSize: isLeader ? '15px' : '14px',
            textShadow: '0 1px 2px rgba(0,0,0,0.35)',
          }}
        >
          {rank}
        </div>

        <div className="w-6 h-6 rounded-full bg-white p-0.5 flex-shrink-0 flex items-center justify-center transition-transform duration-150 group-hover:scale-110">
          {logo ? (
            <img src={logo} alt="" className="w-full h-full object-contain" />
          ) : (
            <span className="text-[10px] font-bold" style={{ color: teamPrimary }}>{teamAbbr?.charAt(0)}</span>
          )}
        </div>

        <div className="flex-1 flex items-center gap-1.5 min-w-0">
          <FittedName
            full={getSchoolName(mascotName) || teamAbbr}
            abbr={teamAbbr}
            className="text-sm min-w-0"
            style={{
              fontWeight: isLeader ? 700 : 600,
              color: txt,
              textShadow: '0 1px 2px rgba(0,0,0,0.3)',
            }}
          />
          {championTrophyByTid[linkTid] && (
            <img
              src={championTrophyByTid[linkTid].image}
              alt="Conference champion"
              title={`${championTrophyByTid[linkTid].name} — ${displayYear} champion`}
              className="w-5 h-5 object-contain flex-shrink-0"
              style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.5))' }}
            />
          )}
        </div>

        {/* Combined record cell — overall first, conference in parens
            ("9-1 (6-1)"). Sort is still by CONF record (handled in the
            enriched sort fn below); the conference half just shares the
            cell with overall instead of getting its own column. */}
        <span
          className="text-sm font-display tabular flex-shrink-0 text-right whitespace-nowrap"
          style={{ width: '120px', color: txt, textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
          title={`${liveWins}-${liveLosses} overall ${liveConfWins}-${liveConfLosses} conference`}
        >
          <span className="font-black tabular-nums">
            {liveWins}<span style={{ opacity: 0.55, fontWeight: 400 }}>–</span>{liveLosses}
          </span>
          <span className="font-normal tabular-nums ml-1.5" style={{ opacity: 0.7 }}>
            ({liveConfWins}<span style={{ opacity: 0.6 }}>–</span>{liveConfLosses})
          </span>
        </span>

        <div className="relative flex-shrink-0 group/diff">
          <span
            className="text-xs font-semibold tabular w-12 text-right block cursor-help"
            style={{ color: txt, opacity: livePointDiff !== 0 ? 0.95 : 0.6, textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
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

  // Lazy records-by-tid cache. Without this, EVERY ConferenceCard
  // re-render runs getTeamRecord + calculateTeamRecordFromGames TWICE
  // per team (sort step + row body), with 16+ conferences × ~12 teams
  // each. Each helper iterates dynasty.games, so a 1000-game dynasty
  // was doing hundreds of thousands of game iterations per render.
  //
  // Lazy (vs eager precompute) so we only do the work for teams
  // actually on screen — most of dynasty.teams (FBS + FCS placeholders)
  // never appears here. The Map's identity tracks (currentDynasty,
  // displayYear), so within one render every same-tid call returns
  // the cached result; on the next render with a new currentDynasty
  // the map is fresh.
  const teamRecordsByTid = useMemo(() => new Map(), [currentDynasty, displayYear])
  const getCachedRecord = (tid) => {
    if (tid == null) return { helper: null, calc: null }
    if (teamRecordsByTid.has(tid)) return teamRecordsByTid.get(tid)
    const helper = getTeamRecord(currentDynasty, tid, displayYear)
    const calc = calculateTeamRecordFromGames(currentDynasty, tid, displayYear)
    const rec = { helper, calc }
    teamRecordsByTid.set(tid, rec)
    return rec
  }

  const buildConferenceRoster = (conferenceName) => {
    // Only show teams that exist in the dynasty (source of truth), so removed
    // teams never appear even if saved standings / alignment still reference them.
    // Membership by tid (stable identity). Saved rows carry tid on modern
    // writes — prefer it; fall back to abbr membership only for legacy rows
    // that predate tid stamping (or degenerate null-team rows).
    const saved = getConferenceData(yearStandings, conferenceName)
      .filter(row =>
        row?.tid != null
          ? liveTeamTids.has(Number(row.tid))
          : (row?.team == null || abbrIsLive(row.team))
      )

    const confMap = customConfsForYear || DEFAULT_CONFERENCE_TEAMS
    const aliases = CONFERENCE_ALIASES[conferenceName] || [conferenceName]
    let teamAbbrs = []
    for (const alias of aliases) {
      if (Array.isArray(confMap[alias]) && confMap[alias].length > 0) {
        teamAbbrs = confMap[alias]
        break
      }
    }
    // Resolve each alignment abbr to a tid ONCE and dedup by tid, so a
    // renamed team (or two alignment abbrs collapsing to one tid) yields a
    // single stub row. Unknown teams (tid unresolvable) keep the abbr path
    // so they don't vanish.
    const seenTids = new Set()
    const rows = []
    for (const abbr of teamAbbrs) {
      const rawTid = resolveTidLive(abbr)
      const liveTid = rawTid != null && liveTeamTids.has(Number(rawTid)) ? Number(rawTid) : null
      if (liveTid != null) {
        if (seenTids.has(liveTid)) continue
        seenTids.add(liveTid)
        rows.push({ team: abbr, tid: liveTid, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 })
      } else if (liveTeamAbbrs.has(abbr)) {
        rows.push({ team: abbr, tid: null, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 })
      }
    }

    // `saved` is a legacy/manual-entry snapshot (ConferenceStandingsModal),
    // written independently of the live alignment above and never
    // guaranteed to cover every team currently in the conference (e.g. it
    // predates a realignment, or was only ever entered for a handful of
    // teams). It used to fully REPLACE the live roster whenever it had any
    // rows at all — so a conference whose saved snapshot only listed 3 of
    // 12 teams permanently showed just those 3, even though the accurate,
    // complete roster was sitting right here uncomputed. Overlay saved
    // rows onto the live roster instead (by tid, or by abbr for tid-less
    // legacy rows) so a saved stat line is preserved but can never
    // suppress a team the live alignment says belongs in this conference.
    for (const row of saved) {
      const idx = row.tid != null
        ? rows.findIndex(r => r.tid === Number(row.tid))
        : rows.findIndex(r => r.tid == null && r.team === row.team)
      if (idx >= 0) rows[idx] = { ...rows[idx], ...row }
      else rows.push(row)
    }

    return rows
  }

  // Conference card component
  const ConferenceCard = ({ conferenceName }) => {
    const teams = buildConferenceRoster(conferenceName)
    const hasData = teams.length > 0
    const confLogo = getConferenceLogo(conferenceName)

    if (!hasData) return null

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
              // Find a team's MOST RECENT national rank for the displayed
              // year by walking their rankByWeek and picking the highest
              // week with a valid value. Used as a tiebreaker when two
              // teams have identical records.
              const getLatestNationalRank = (tid) => {
                if (tid == null) return null
                const byYear = currentDynasty?.teams?.[tid]?.byYear
                const entry = byYear?.[displayYear]?.rankByWeek ?? byYear?.[String(displayYear)]?.rankByWeek
                if (entry) {
                  let bestWeek = -Infinity
                  let bestRank = null
                  for (const [wk, val] of Object.entries(entry)) {
                    const wkNum = Number(wk)
                    const rk = Number(val)
                    if (Number.isFinite(wkNum) && rk >= 1 && rk <= 25 && wkNum > bestWeek) {
                      bestWeek = wkNum
                      bestRank = rk
                    }
                  }
                  if (bestRank != null) return bestRank
                }
                // Fall back to preseason poll for early weeks via the
                // shared helper (handles both numeric and string year keys).
                return getTeamRankForWeek(currentDynasty, tid, displayYear, 0)
              }
              const renderRows = (list) => {
              const enriched = list.map(t => {
                const tid = t.tid != null ? Number(t.tid) : resolveTidLive(t.team)
                // Use the same coverage-aware helper as the row render
                // above. Without it the sort would happily reorder a
                // 9-4 stored team behind a 1-0 sparse-calc team, which
                // is precisely how Duke ended up at the bottom of the
                // 2032 ACC despite having a winning season on file.
                // Use the shared records-by-tid cache (lazy-populated
                // at the top of the page) instead of re-running the
                // helpers per team in the sort step. Same data the
                // row render below reads — computed once.
                const cached = getCachedRecord(tid)
                const helperRec = cached.helper
                const calc = cached.calc
                const calcGames = calc ? (calc.wins + calc.losses) : 0
                const helperGames = helperRec ? (helperRec.wins + helperRec.losses) : 0
                // Live calc carries the per-game point-diff numbers the
                // helper doesn't; use it for diff only when it covers
                // as many games as the helper turned up.
                const useLivePoints = calcGames > 0 && calcGames >= helperGames
                const liveDiff = useLivePoints
                  ? (calc.pointsFor || 0) - (calc.pointsAgainst || 0)
                  : (t.pointsFor || 0) - (t.pointsAgainst || 0)
                return {
                  ...t,
                  _liveWins: helperRec ? helperRec.wins : (t.wins || 0),
                  _liveLosses: helperRec ? helperRec.losses : (t.losses || 0),
                  _liveConfWins: helperRec ? (helperRec.confWins || 0) : (t.confWins || 0),
                  _liveConfLosses: helperRec ? (helperRec.confLosses || 0) : (t.confLosses || 0),
                  _liveDiff: liveDiff,
                  _liveNationalRank: getLatestNationalRank(tid), // null = unranked
                  _isLive: !!helperRec,
                }
              })
              const anyLive = enriched.some(t => t._isLive)
              // Sort by conference record first (the primary standings
              // metric in CFB), then overall record. When records are
              // identical we use national ranking as the next tiebreaker
              // (lower number wins; ranked teams beat unranked teams) —
              // this matches how SEC/B1G/etc publish standings when two
              // teams are tied. Point differential is the final fallback.
              const sortFn = anyLive
                ? (a, b) => {
                    if (b._liveConfWins !== a._liveConfWins) return b._liveConfWins - a._liveConfWins
                    if (a._liveConfLosses !== b._liveConfLosses) return a._liveConfLosses - b._liveConfLosses
                    if (b._liveWins !== a._liveWins) return b._liveWins - a._liveWins
                    if (a._liveLosses !== b._liveLosses) return a._liveLosses - b._liveLosses
                    // National-ranking tiebreaker. null = unranked. A
                    // ranked team always beats an unranked team; between
                    // two ranked teams the lower rank number wins.
                    const aRank = a._liveNationalRank
                    const bRank = b._liveNationalRank
                    if (aRank != null && bRank == null) return -1
                    if (aRank == null && bRank != null) return 1
                    if (aRank != null && bRank != null && aRank !== bRank) return aRank - bRank
                    if (b._liveDiff !== a._liveDiff) return b._liveDiff - a._liveDiff
                    return 0
                  }
                : (a, b) => (a.rank || 0) - (b.rank || 0)
              return enriched.sort(sortFn).map((team, idx) => (
                <TeamRow
                  key={team.tid ?? `${team.team}-${idx}`}
                  team={team}
                  rank={anyLive ? idx + 1 : (team.rank || idx + 1)}
                />
              ))
              }

              // If this conference is split into divisions, group the teams under
              // two division sub-headers (still one column). Teams whose stored
              // division matches the SECOND name go to division 2; everyone else
              // (including no/other division) defaults to division 1 — matching
              // how the alignment modal seeds a split.
              const divs = getConferenceDivisionsForYear(currentDynasty, displayYear)?.[conferenceName]
              if (divs && divs.length === 2) {
                const secondName = divs[1]
                return [0, 1].map((idx) => {
                  const list = teams.filter(t => {
                    const d = getTeamDivisionForDynasty(currentDynasty, t.tid != null ? t.tid : t.team, displayYear)
                    return idx === 1 ? d === secondName : d !== secondName
                  })
                  return (
                    <div key={idx}>
                      <div
                        className="flex items-center justify-between px-3 py-1"
                        style={{ backgroundColor: 'var(--surface-2)', borderBottom: '1px solid var(--surface-4)' }}
                      >
                        <span className="label-xs text-txt-secondary font-bold truncate" style={{ letterSpacing: '1px', fontSize: '10px' }}>
                          {divs[idx]}
                        </span>
                        <span className="text-[10px] tabular text-txt-tertiary flex-shrink-0">{list.length}</span>
                      </div>
                      {list.length
                        ? renderRows(list)
                        : <div className="px-3 py-2 text-[11px] text-txt-tertiary text-center">No teams</div>}
                    </div>
                  )
                })
              }
              return renderRows(teams)
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
        onSave={async (data, divData) => {
          const isMultiYear = Object.keys(data).every(key => /^\d{4}$/.test(key))
          // saveConferenceAlignment fans the bulk map out to each team's per-year
          // `byYear[year].conference` (+ `.division`) field. divData is keyed by
          // year: { [year]: { divisions, teamDivisions } }.
          if (isMultiYear) {
            for (const [yearKey, mapForYear] of Object.entries(data)) {
              const opts = divData?.[yearKey] || {}
              await saveConferenceAlignment(currentDynasty.id, Number(yearKey), mapForYear, opts)
            }
          } else {
            const opts = divData?.[currentDynasty.currentYear] || {}
            await saveConferenceAlignment(currentDynasty.id, currentDynasty.currentYear, data, opts)
          }
        }}
        teamColors={teamColors}
      />
    </div>
  )
}
