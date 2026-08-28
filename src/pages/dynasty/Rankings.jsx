import { useState, useMemo } from 'react'
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useDynasty, calculateTeamRecordFromGames, getTeamRecord } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { getTeamLogo, getMascotName as getMascotNameFromTeams, stripMascotFromName } from '../../data/teams'
import { getTeamColors } from '../../data/teamColors'
import { getContrastTextColor } from '../../utils/colorUtils'
import { TEAMS, resolveTid } from '../../data/teamRegistry'
import { PageHero, Card, EmptyState, TitleWithYear, Button } from '../../components/ui'
import Top25SheetModal from '../../components/Top25SheetModal'
import Top25MovementChart from '../../components/Top25MovementChart'
import { isPcAutoDynasty } from '../../editions'
import { APP_PRESEASON_WEEK } from '../../data/cfb27SaveImport'

const getSchoolName = stripMascotFromName

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
    'UK': 'Kentucky Wildcats', 'UL': 'Louisiana Ragin\' Cajuns', 'ULL': 'Louisiana Ragin\' Cajuns',
    'ULM': 'UL Monroe Warhawks', 'UMD': 'Maryland Terrapins', 'UNC': 'North Carolina Tar Heels',
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
    'FCSE': 'FCS East Sentinels', 'FCSM': 'FCS Midwest Thunderbirds',
    'FCSN': 'FCS Northwest Kodiaks', 'FCSW': 'FCS West Rivertoads'
  }
  return mascotMap[abbr] || null
}

export default function Rankings() {
  const { year: urlYear } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { currentDynasty, isViewOnly } = useDynasty()
  const pathPrefix = usePathPrefix()
  const [showEditSheet, setShowEditSheet] = useState(false)

  if (!currentDynasty) return null

  // Year selector: include any year with a saved final poll, any year with
  // games entered, plus the current dynasty year so an empty current
  // season still shows up. The page itself derives a live Top 25 from
  // games when no final poll has been saved.
  const finalPolls = currentDynasty.finalPollsByYear || {}
  const yearsWithFinalPolls = Object.keys(finalPolls).map(y => parseInt(y))
  const yearsWithGames = new Set(
    (currentDynasty.games || [])
      .map(g => Number(g?.year))
      .filter(y => Number.isFinite(y))
  )
  const yearsCombined = new Set([...yearsWithFinalPolls, ...yearsWithGames])
  if (currentDynasty.currentYear) yearsCombined.add(Number(currentDynasty.currentYear))

  const availableYears = Array.from(yearsCombined).sort((a, b) => b - a)
  // Default to the dynasty's CURRENT year — the page derives a live
  // Top 25 from games so the in-season view always has data, and the
  // saved final poll seeds it once the season ends.
  const displayYear = urlYear ? parseInt(urlYear) : Number(currentDynasty.currentYear)

  // Available weeks for the displayed year — any week where any team
  // has a rankByWeek entry. This is the canonical store for entering-
  // week ranks (= the rank each team was during that week's games).
  const yearPolls = finalPolls[displayYear] || {}
  const savedMedia = Array.isArray(yearPolls.media) ? yearPolls.media : []
  // Track per-week populated counts so we can default the view to a
  // FULLY-POPULATED week. A sparse week (only bye teams populated, no
  // game block saved yet) is technically a valid Top 25 snapshot but
  // a confusing default — the user lands on Wk N+1 right after saving
  // Wk N and sees just the bye teams.
  // Poll source per week mirrors CFB27's own in-game Rankings screen: Media
  // poll for weeks 1-9, then the CFP Committee poll starting week 10
  // (confirmed against real save screenshots) — falls back to the other
  // poll when the primary one is missing that week's entry (dynasties
  // synced before cfpRankByWeek existed only ever populate rankByWeek).
  const weekCounts = (() => {
    const counts = new Map()
    const teams = currentDynasty.teams || {}
    for (const team of Object.values(teams)) {
      const byYear = team?.byYear?.[displayYear] ?? team?.byYear?.[String(displayYear)]
      if (!byYear) continue
      const media = byYear.rankByWeek || {}
      const cfp = byYear.cfpRankByWeek || {}
      const weekKeys = new Set([...Object.keys(media), ...Object.keys(cfp)])
      for (const k of weekKeys) {
        const wk = Number(k)
        if (!Number.isFinite(wk)) continue
        // Sync writes rankByWeek/cfpRankByWeek keyed by the save's raw
        // CurrentWeek counter, which runs continuously through the whole
        // postseason (CCG, every bowl round, every CFP round) rather than
        // landing neatly in the app's old 17–20/101–105 slot scheme — a
        // save with a deep CFP run legitimately produces raw weeks beyond
        // 20, and a narrow whitelist here silently dropped those synced
        // weeks from the picker entirely. Only skip the one known-bogus
        // legacy sentinel ("100", a deprecated shared CCG/bowl key) —
        // every other non-negative week is a real synced snapshot.
        // Bounded rather than fully open. The whitelist this replaces existed to
        // keep orphan/garbage keys out of the picker, and dropping it entirely
        // would let ANY stray key surface as a real poll week. The save's raw
        // counter is continuous and has been seen past 20 on a deep CFP run, so
        // 0-40 covers every legitimate raw week with room to spare, alongside the
        // app's own canonical 101-105 postseason slots. 100 stays excluded — it's
        // the deprecated shared CCG/bowl sentinel.
        const isRealPollWeek = wk === APP_PRESEASON_WEEK || (wk >= 0 && wk <= 40) || (wk >= 101 && wk <= 105)
        if (!isRealPollWeek || wk === 100) continue
        let v = wk >= 10 ? cfp[k] : media[k]
        if (typeof v !== 'number' || v < 1 || v > 25) v = wk >= 10 ? media[k] : cfp[k]
        if (typeof v !== 'number' || v < 1 || v > 25) continue
        counts.set(wk, (counts.get(wk) || 0) + 1)
      }
    }
    return counts
  })()
  const availableWeeks = Array.from(weekCounts.keys()).sort((a, b) => a - b)
  // For default selection: prefer the latest week that has a fairly
  // complete Top 25 (≥10 entries). Sparse weeks remain selectable via
  // the URL ?week= param but won't be the auto-default.
  const POPULATED_THRESHOLD = 10
  const populatedWeeks = availableWeeks.filter(w => (weekCounts.get(w) || 0) >= POPULATED_THRESHOLD)
  const defaultWeek = populatedWeeks.length > 0
    ? populatedWeeks[populatedWeeks.length - 1]
    : (availableWeeks.length > 0 ? availableWeeks[availableWeeks.length - 1] : null)
  // latestWeek retained for the URL/clean-default check below.
  const latestWeek = defaultWeek
  const hasSavedFinal = savedMedia.length > 0

  // Selection: 'final' (only when a saved final poll exists), or a
  // specific week number. URL-driven via ?week= so the snapshot is
  // shareable. Default = final poll if saved, otherwise latest fully
  // populated week.
  const urlWeek = searchParams.get('week')
  const parsedUrlWeek = urlWeek != null ? parseInt(urlWeek, 10) : NaN
  const selectedWeek =
    urlWeek === 'final' && hasSavedFinal ? 'final'
    : Number.isFinite(parsedUrlWeek) && availableWeeks.includes(parsedUrlWeek) ? parsedUrlWeek
    : (hasSavedFinal ? 'final' : defaultWeek)

  const setSelectedWeek = (next) => {
    const params = new URLSearchParams(searchParams)
    // Strip the param when the user picks the natural default to keep
    // the URL clean ("rankings/2034" instead of "rankings/2034?week=final").
    const isDefault =
      (hasSavedFinal && next === 'final') ||
      (!hasSavedFinal && next === latestWeek)
    if (isDefault) params.delete('week')
    else params.set('week', String(next))
    setSearchParams(params, { replace: true })
  }

  // Build the Top 25 for the selected snapshot. 'final' uses the saved
  // poll. Otherwise, walk every team's rankByWeek[selectedWeek] —
  // that's the rank each team was DURING the selected week. First
  // team to claim each rank slot 1-25 wins (defends against any
  // accidental duplicates).
  let top25 = []
  if (selectedWeek === 'final') {
    top25 = savedMedia
  } else if (selectedWeek != null) {
    // Primary source: rankByWeek/cfpRankByWeek[selectedWeek] across every
    // team — CFP poll for week 10+, falling back to the other poll when
    // the primary is missing this week's entry (see weekCounts above).
    const slotMap = new Map()
    const claimedTids = new Set()
    const teams = currentDynasty.teams || {}
    for (const [tidKey, team] of Object.entries(teams)) {
      const byYear = team?.byYear?.[displayYear] ?? team?.byYear?.[String(displayYear)]
      if (!byYear) continue
      const media = byYear.rankByWeek || {}
      const cfp = byYear.cfpRankByWeek || {}
      const usesCfp = Number(selectedWeek) >= 10
      let v = usesCfp ? (cfp[selectedWeek] ?? cfp[String(selectedWeek)]) : (media[selectedWeek] ?? media[String(selectedWeek)])
      if (typeof v !== 'number' || v < 1 || v > 25) {
        v = usesCfp ? (media[selectedWeek] ?? media[String(selectedWeek)]) : (cfp[selectedWeek] ?? cfp[String(selectedWeek)])
      }
      if (typeof v !== 'number' || v < 1 || v > 25) continue
      if (slotMap.has(v)) continue
      slotMap.set(v, {
        rank: v,
        tid: Number(tidKey),
        team: team.abbr,
      })
      claimedTids.add(Number(tidKey))
    }

    // Game-record fallback. ONLY fires when rankByWeek[selectedWeek]
    // is essentially empty across the entire dynasty (< 5 teams) —
    // i.e., the picture for this week hasn't been saved yet, so the
    // user gets at least a partial Top 25 from game records instead
    // of nothing.
    //
    // CRITICAL: this guard prevents the fallback from "resurrecting"
    // a team the user explicitly removed from the poll. Scenario:
    // user saves Wk 4 with team A at #25, then edits the Top 25
    // sheet to remove team A from Wk 4 entirely (rankByWeek[4][A]
    // cleared). The team A's Wk 4 game record still has team1Rank=25
    // — without this guard, the fallback would re-add them. Now we
    // only run the fallback when the rankByWeek[selectedWeek] picture
    // is sparse enough to be considered "not yet entered" (< 5 entries).
    const RBW_FALLBACK_THRESHOLD = 5
    if (slotMap.size < RBW_FALLBACK_THRESHOLD) {
      const games = currentDynasty.games || []
      for (const g of games) {
        if (!g) continue
        if (Number(g.year) !== Number(displayYear)) continue
        if (Number(g.week) !== Number(selectedWeek)) continue
        const sides = [
          { tid: g.team1Tid, rank: g.team1Rank, abbr: g.team1 },
          { tid: g.team2Tid, rank: g.team2Rank, abbr: g.team2 },
        ]
        for (const s of sides) {
          if (typeof s.rank !== 'number' || s.rank < 1 || s.rank > 25) continue
          const tid = s.tid != null ? Number(s.tid) : null
          if (tid != null && claimedTids.has(tid)) continue
          if (slotMap.has(s.rank)) continue
          const team = tid != null ? teams[String(tid)] || teams[tid] : null
          slotMap.set(s.rank, {
            rank: s.rank,
            tid,
            team: team?.abbr || s.abbr || null,
          })
          if (tid != null) claimedTids.add(tid)
        }
      }
    }
    top25 = [...slotMap.values()].sort((a, b) => a.rank - b.rank)
  }
  const usingLive = selectedWeek !== 'final'

  // Saved conference standings give us a quick W-L lookup; calculated
  // record (from games[]) is more authoritative when it differs.
  const standingsByYear = currentDynasty.conferenceStandingsByYear || {}
  const yearStandings = standingsByYear[displayYear] || {}
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
  // Record source — different rules for the "as of week N" case vs
  // the "current / final poll" case:
  //
  //   - As-of-week-N (user is browsing a specific past week): calc
  //     from games is the ONLY source that can produce a partial
  //     record at that point in time. Stored records are end-of-
  //     season totals. So for this case we still use calc-with-
  //     upToWeek, falling back to the standings row only when calc
  //     turned up nothing (e.g. season hasn't started yet).
  //
  //   - Final poll / current state (no week filter): use the
  //     coverage-aware getTeamRecord helper. This is the same fix as
  //     the conference standings page — for non-user teams, calc-
  //     from-games[] is sparse (only user-vs-them games) and would
  //     show "1-0" for a team whose stored full season is 16-0. The
  //     helper picks whichever stored source covers the most games.
  const isAsOfWeek = usingLive && selectedWeek != null
  const recordOpts = isAsOfWeek ? { upToWeek: selectedWeek } : {}
  // Lazy per-tid cache so the same team rendering twice (e.g. in two
  // RankingRows during a re-render or across the brief reconciliation
  // window) doesn't re-iterate dynasty.games. The Map's identity is
  // tied to the relevant deps so it resets when any of them change.
  const recordLookupCache = useMemo(
    () => new Map(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentDynasty, displayYear, isAsOfWeek, selectedWeek]
  )
  const lookupRecord = (abbr, tid) => {
    const cacheKey = tid != null ? `tid:${Number(tid)}` : `abbr:${abbr || ''}`
    if (recordLookupCache.has(cacheKey)) return recordLookupCache.get(cacheKey)

    let result = null
    if (tid != null) {
      if (isAsOfWeek) {
        const calc = calculateTeamRecordFromGames(currentDynasty, Number(tid), displayYear, recordOpts)
        if (calc && (calc.wins > 0 || calc.losses > 0)) {
          result = { wins: calc.wins, losses: calc.losses }
        }
      } else {
        const helperRec = getTeamRecord(currentDynasty, Number(tid), displayYear)
        if (helperRec && (helperRec.wins > 0 || helperRec.losses > 0)) {
          result = { wins: helperRec.wins, losses: helperRec.losses }
        }
      }
    }
    if (!result && tid != null && teamRecordsByTid[Number(tid)]) result = teamRecordsByTid[Number(tid)]
    if (!result) result = teamRecords[abbr] || null

    recordLookupCache.set(cacheKey, result)
    return result
  }

  const handleYearChange = (year) => navigate(`${pathPrefix}/rankings/${year}`)

  if (availableYears.length === 0) {
    return (
      <div className="space-y-6">
        <PageHero eyebrow="Top 25" title="Rankings" />
        <Card>
          <EmptyState
            title="No Rankings Yet"
            message="Enter weekly scores with team rankings, or enter the final poll at season's end, to populate the Top 25."
          />
        </Card>
      </div>
    )
  }


  // One uniform rank row — every team reads at the same weight so the poll is a
  // clean ladder, not an escalating hero. The team's own primary color IS the row
  // (broadcast box-score treatment).
  const RankingRow = ({ rank, teamAbbr, teamTid, year, last }) => {
    const teamsSource = currentDynasty?.teams || currentDynasty?.customTeams
    const teamFromTid = teamTid != null ? teamsSource?.[teamTid] : null
    const resolvedAbbr = teamFromTid?.abbr || teamAbbr
    const mascotName = teamFromTid?.name || getMascotName(resolvedAbbr, teamsSource)
    const teamLogo = mascotName ? getTeamLogo(mascotName, teamsSource) : null
    const colors = mascotName ? getTeamColors(mascotName, teamsSource) : { primary: '#6e6e78', secondary: '#fff' }
    const record = lookupRecord(resolvedAbbr, teamTid)
    const linkTid = teamTid != null ? Number(teamTid) : resolveTid(resolvedAbbr, teamsSource || TEAMS)

    const primary = colors.primary || '#3a3d47'
    const txt = getContrastTextColor(primary)

    return (
      <Link
        to={`${pathPrefix}/team/${linkTid}/${year}`}
        className="ranking-row group relative flex items-center gap-3 pl-3 pr-4 py-2 cfb-texture overflow-hidden transition-all duration-150 hover:brightness-[1.12]"
        style={{
          borderBottom: last ? 'none' : '1px solid rgba(0,0,0,0.28)',
          backgroundColor: primary,
          backgroundImage: 'linear-gradient(120deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 44%), linear-gradient(180deg, rgba(0,0,0,0.03) 0%, rgba(0,0,0,0.30) 100%)',
        }}
      >
        <span
          className="w-6 text-center font-display font-black tabular leading-none flex-shrink-0"
          style={{ fontSize: '15px', color: txt, opacity: 0.82, letterSpacing: '-0.02em', textShadow: '0 1px 2px rgba(0,0,0,0.35)' }}
        >
          {rank}
        </span>
        <div
          className="rounded-full bg-white flex items-center justify-center p-1 flex-shrink-0 shadow-sm transition-transform duration-200 group-hover:scale-105"
          style={{ width: 34, height: 34 }}
        >
          {teamLogo ? (
            <img src={teamLogo} alt="" className="w-full h-full object-contain" />
          ) : (
            <span className="font-display font-black" style={{ color: primary }}>{(resolvedAbbr || '').charAt(0)}</span>
          )}
        </div>
        <span
          className="flex-1 truncate font-display font-bold uppercase leading-none"
          style={{ fontSize: '0.95rem', letterSpacing: '0.015em', color: txt, textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
        >
          {getSchoolName(mascotName) || resolvedAbbr}
        </span>
        {record && (
          <span
            className="tabular-nums flex-shrink-0 font-display font-bold"
            style={{ fontSize: '13px', color: txt, opacity: 0.9, textShadow: '0 1px 2px rgba(0,0,0,0.35)' }}
          >
            {record.wins}-{record.losses}
          </span>
        )}
      </Link>
    )
  }

  // One combined poll — a single card that splits into two balanced columns on
  // wide screens so the whole Top 25 is visible at once, and collapses to one
  // column on small screens. A hairline divider between the columns keeps it
  // reading as a single section, not two separate boxes. Rows are uniform.
  const PollColumn = ({ data, pollType }) => {
    const sorted = [...data].sort((a, b) => a.rank - b.rank)

    if (sorted.length === 0) {
      return (
        <Card>
          <EmptyState
            variant="compact"
            title="No rankings yet"
            message={`Enter weekly scores with team ranks, or save a final poll, for ${displayYear}.`}
          />
        </Card>
      )
    }

    const twoCol = sorted.length >= 14
    const mid = twoCol ? Math.ceil(sorted.length / 2) : sorted.length
    const columns = twoCol ? [sorted.slice(0, mid), sorted.slice(mid)] : [sorted]

    const renderColumn = (rows) =>
      rows.map((entry, i) => (
        <RankingRow
          key={`${pollType}-${entry.rank}`}
          rank={entry.rank}
          teamAbbr={entry.team}
          teamTid={entry.tid}
          year={displayYear}
          last={i === rows.length - 1}
        />
      ))

    return (
      <Card padding="none" className="overflow-hidden reveal">
        <div className={`grid grid-cols-1 ${twoCol ? 'lg:grid-cols-2 lg:divide-x-2 lg:divide-black' : ''}`}>
          {columns.map((col, ci) => (
            <div key={ci} className="flex flex-col">{renderColumn(col)}</div>
          ))}
        </div>
      </Card>
    )
  }

  // Options for the inline week selector — labels drive the eyebrow
  // text. The new rank semantics are entering-week ranks (= the rank
  // each team was DURING that week's games), so plain "Week N" reads
  // correctly. Special week keys map to postseason labels.
  // Manual/console dynasties never write a -1 (APP_PRESEASON_WEEK) entry —
  // for them week 0 IS the preseason poll (PreseasonTop25Modal writes it
  // there directly, and WeeklyScoresModal's prevWeekTop25Block treats it as
  // the poll entering Week 0's games — one poll, one slot, by design). Only
  // a PC-synced dynasty that has actually split the two gets a real -1
  // entry, so gate the "Week 0" vs "Preseason Rankings" label on whether
  // this year's data shows that split, instead of hardcoding one meaning
  // for week 0 and breaking the other dynasty type's label.
  const hasSplitPreseasonWeek = availableWeeks.includes(APP_PRESEASON_WEEK)
  const weekLabel = (w) => {
    if (w === APP_PRESEASON_WEEK) return 'Preseason Rankings'
    if (w === 0) return hasSplitPreseasonWeek ? 'Week 0' : 'Preseason Rankings'
    if (w === 16) return 'Conf Champ Week'  // post-Week-15 / pre-CCG poll slot
    if (w === 17) return 'Bowl Week 1'
    if (w === 18) return 'Bowl Week 2'
    if (w === 19) return 'Bowl Week 3'
    if (w === 20) return 'National Championship'
    if (w === 101) return 'CFP First Round'
    if (w === 102) return 'CFP Quarterfinals'
    if (w === 103) return 'CFP Semifinals'
    if (w === 104) return 'National Championship'
    if (w === 105) return 'Final Poll'
    return `Week ${w}`
  }
  // When rankByWeek already has a Final Poll entry (week 105 — seeded
  // by the migration / FinalPollsModal save flow from finalPollsByYear),
  // the legacy `final` selector that reads finalPollsByYear directly
  // is redundant — week 105 is the same data sourced from rankByWeek.
  // Suppress the duplicate to keep the dropdown clean.
  const hasFinalInRankByWeek = availableWeeks.includes(105)
  const weekOptions = [
    ...(hasSavedFinal && !hasFinalInRankByWeek ? [{ value: 'final', label: 'Final Poll' }] : []),
    ...[...availableWeeks].reverse().map(w => ({ value: w, label: weekLabel(w) })),
  ]
  const selectedLabel =
    selectedWeek === 'final' ? 'Final Poll'
    : selectedWeek != null ? weekLabel(selectedWeek)
    : null

  // Only render the selector when the user has more than one option;
  // a single-option year falls back to a plain eyebrow label.
  const showWeekSelector = weekOptions.length > 1

  return (
    <div className="space-y-6 page-enter">
      <PageHero
        eyebrow={
          showWeekSelector && selectedLabel ? (
            <span className="inline-flex items-center gap-2">
              <InlineWeekSelect
                value={selectedWeek}
                label={selectedLabel}
                options={weekOptions}
                onChange={setSelectedWeek}
              />
              {typeof selectedWeek === 'number' && (
                <span
                  className="text-[10px] font-black tracking-[0.15em] px-1.5 py-0.5 rounded flex-shrink-0"
                  style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-tertiary)', border: '1px solid var(--surface-5)' }}
                >
                  {selectedWeek >= 10 ? 'CFP' : 'MEDIA'}
                </span>
              )}
            </span>
          ) : (
            selectedLabel
          )
        }
        title={
          <TitleWithYear
            year={displayYear}
            years={availableYears}
            onChange={handleYearChange}
            label="Top 25"
          />
        }
        actions={!isViewOnly && !isPcAutoDynasty(currentDynasty) ? (
          <Button variant="outline" size="sm" onClick={() => setShowEditSheet(true)}>
            Edit Rankings
          </Button>
        ) : null}
      />

      <div className="max-w-6xl mx-auto">
        <PollColumn data={top25} pollType="media" />
      </div>

      {/* Season-long rank movement. Needs at least two polls to plot a line —
          a single snapshot is what the table above already is. */}
      {availableWeeks.length >= 2 && (
        <div className="max-w-6xl mx-auto">
          <Card>
            <h2 className="text-sm font-black uppercase tracking-[0.12em] text-txt-secondary mb-3">
              Rank Movement
            </h2>
            <Top25MovementChart
              dynasty={currentDynasty}
              year={displayYear}
              weeks={availableWeeks}
              weekLabel={weekLabel}
            />
          </Card>
        </div>
      )}

      {!isPcAutoDynasty(currentDynasty) && (
        <Top25SheetModal isOpen={showEditSheet} onClose={() => setShowEditSheet(false)} />
      )}

      <style>{`
        .ranking-row:hover {
          background-color: var(--surface-3);
        }
      `}</style>
    </div>
  )
}

/**
 * Inline week selector — same baseline-aligned, headline-styled chevron
 * pattern as InlineYearSelect, but supports a non-numeric "Final" value
 * alongside week numbers. Native <select> sits invisibly on top so the
 * picker stays keyboard- and screen-reader-accessible.
 */
function InlineWeekSelect({ value, label, options, onChange }) {
  return (
    <span className="relative inline-flex items-baseline group">
      <span aria-hidden="true">{label}</span>
      <svg
        className="ml-1 self-center w-[0.5em] h-[0.5em] opacity-60 transition-opacity group-hover:opacity-100"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
          clipRule="evenodd"
        />
      </svg>
      <select
        value={String(value)}
        onChange={(e) => {
          const v = e.target.value
          onChange?.(v === 'final' ? 'final' : parseInt(v, 10))
        }}
        aria-label="Select week"
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none"
      >
        {options.map((opt) => (
          <option key={String(opt.value)} value={String(opt.value)}>
            {opt.label}
          </option>
        ))}
      </select>
    </span>
  )
}
