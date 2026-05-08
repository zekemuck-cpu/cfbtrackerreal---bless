import { useState, useMemo } from 'react'
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useDynasty, calculateTeamRecordFromGames, getTeamRecord } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { getTeamLogo, getMascotName as getMascotNameFromTeams, stripMascotFromName } from '../../data/teams'
import { getTeamColors } from '../../data/teamColors'
import { TEAMS, resolveTid } from '../../data/teamRegistry'
import { PageHero, Card, EmptyState, TitleWithYear, Button } from '../../components/ui'
import Top25SheetModal from '../../components/Top25SheetModal'

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
  const availableWeeks = (() => {
    const weeksSet = new Set()
    const teams = currentDynasty.teams || {}
    for (const team of Object.values(teams)) {
      const rbw = team?.byYear?.[displayYear]?.rankByWeek
        ?? team?.byYear?.[String(displayYear)]?.rankByWeek
      if (!rbw) continue
      for (const k of Object.keys(rbw)) {
        const wk = Number(k)
        if (!Number.isFinite(wk)) continue
        const v = rbw[k]
        if (typeof v === 'number' && v >= 1 && v <= 25) weeksSet.add(wk)
      }
    }
    return Array.from(weeksSet).sort((a, b) => a - b)
  })()
  const latestWeek = availableWeeks.length > 0 ? availableWeeks[availableWeeks.length - 1] : null
  const hasSavedFinal = savedMedia.length > 0

  // Selection: 'final' (only when a saved final poll exists), or a
  // specific week number. URL-driven via ?week= so the snapshot is
  // shareable. Default = final poll if saved, otherwise latest week.
  const urlWeek = searchParams.get('week')
  const parsedUrlWeek = urlWeek != null ? parseInt(urlWeek, 10) : NaN
  const selectedWeek =
    urlWeek === 'final' && hasSavedFinal ? 'final'
    : Number.isFinite(parsedUrlWeek) && availableWeeks.includes(parsedUrlWeek) ? parsedUrlWeek
    : (hasSavedFinal ? 'final' : latestWeek)

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
    const slotMap = new Map()
    const teams = currentDynasty.teams || {}
    for (const [tidKey, team] of Object.entries(teams)) {
      const rbw = team?.byYear?.[displayYear]?.rankByWeek
        ?? team?.byYear?.[String(displayYear)]?.rankByWeek
      if (!rbw) continue
      const v = rbw[selectedWeek] ?? rbw[String(selectedWeek)]
      if (typeof v !== 'number' || v < 1 || v > 25) continue
      if (slotMap.has(v)) continue
      slotMap.set(v, {
        rank: v,
        tid: Number(tidKey),
        team: team.abbr,
      })
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


  const RankingRow = ({ rank, teamAbbr, teamTid, year }) => {
    const teamsSource = currentDynasty?.teams || currentDynasty?.customTeams
    const teamFromTid = teamTid != null ? teamsSource?.[teamTid] : null
    const resolvedAbbr = teamFromTid?.abbr || teamAbbr
    const mascotName = teamFromTid?.name || getMascotName(resolvedAbbr, teamsSource)
    const teamLogo = mascotName ? getTeamLogo(mascotName, teamsSource) : null
    const colors = mascotName ? getTeamColors(mascotName, teamsSource) : { primary: '#6e6e78', secondary: '#fff' }
    const record = lookupRecord(resolvedAbbr, teamTid)
    const linkTid = teamTid != null ? Number(teamTid) : resolveTid(resolvedAbbr, teamsSource || TEAMS)
    const isLeader = rank === 1
    const isTopFive = rank <= 5

    return (
      <Link
        to={`${pathPrefix}/team/${linkTid}/${year}`}
        className="ranking-row group relative flex items-center gap-3 px-3 transition-all duration-150"
        style={{
          borderBottom: '1px solid var(--surface-4)',
          paddingTop: isLeader ? '12px' : '10px',
          paddingBottom: isLeader ? '12px' : '10px',
          backgroundColor: isLeader ? 'color-mix(in srgb, var(--surface-3) 50%, transparent)' : 'transparent',
        }}
      >
        <span
          className="text-right font-display font-black tabular leading-none flex-shrink-0"
          style={{
            width: isLeader ? '40px' : '32px',
            fontSize: isLeader ? '24px' : isTopFive ? '17px' : '14px',
            color: isLeader ? 'var(--text-primary)' : isTopFive ? 'var(--text-secondary)' : 'var(--text-tertiary)',
            letterSpacing: '-0.02em',
          }}
        >
          {rank}
        </span>
        <div
          className={`logo-container ${isLeader ? 'logo-container-lg' : 'logo-container-md'} flex-shrink-0 transition-transform duration-200 group-hover:scale-110`}
        >
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
        <span
          className="flex-1 truncate transition-colors group-hover:text-txt-primary"
          style={{
            color: 'var(--text-primary)',
            fontSize: isLeader ? '17px' : '14px',
            fontWeight: isLeader ? 700 : isTopFive ? 600 : 500,
            letterSpacing: isLeader ? '-0.01em' : 0,
          }}
        >
          {getSchoolName(mascotName) || resolvedAbbr}
        </span>
        {record && (
          <span
            className="tabular flex-shrink-0"
            style={{
              fontSize: isLeader ? '14px' : '12px',
              color: isLeader ? 'var(--text-secondary)' : 'var(--text-tertiary)',
              fontWeight: isLeader ? 600 : 500,
            }}
          >
            {record.wins}-{record.losses}
          </span>
        )}
      </Link>
    )
  }

  // Single clean Top 25 list — no playoff split, no two-column carving.
  // Just a column of rows where #1 reads loudest and the rest cascade
  // down. Broadcast weight comes from the rank typography, not layout.
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

    return (
      <Card padding="none" className="overflow-hidden reveal">
        {sorted.map((entry) => (
          <RankingRow
            key={`${pollType}-${entry.rank}`}
            rank={entry.rank}
            teamAbbr={entry.team}
            teamTid={entry.tid}
            year={displayYear}
          />
        ))}
      </Card>
    )
  }

  // Options for the inline week selector — labels drive the eyebrow
  // text. The new rank semantics are entering-week ranks (= the rank
  // each team was DURING that week's games), so plain "Week N" reads
  // correctly. Special week keys map to postseason labels.
  const weekLabel = (w) => {
    if (w === 0) return 'Preseason Rankings'
    if (w === 100) return 'Conference Championships'
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
            <InlineWeekSelect
              value={selectedWeek}
              label={selectedLabel}
              options={weekOptions}
              onChange={setSelectedWeek}
            />
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
        actions={!isViewOnly ? (
          <Button variant="outline" size="sm" onClick={() => setShowEditSheet(true)}>
            Edit Rankings
          </Button>
        ) : null}
      />

      <div className="max-w-2xl mx-auto">
        <PollColumn data={top25} pollType="media" />
      </div>

      <Top25SheetModal isOpen={showEditSheet} onClose={() => setShowEditSheet(false)} />

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
