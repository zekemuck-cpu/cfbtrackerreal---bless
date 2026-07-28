import { useState, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { isOpenTarget } from '../../utils/recruitingTargets'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { getTeamLogo, getMascotName as getMascotNameFromTeams, stripMascotFromName } from '../../data/teams'
import { getTeamColors } from '../../data/teamColors'
import { TEAMS, resolveTid } from '../../data/teamRegistry'
import AllAmericansModal from '../../components/AllAmericansModal'
import { HonorPlayerTile, SchoolLeaderboard } from '../../components/HonorsUI'
import { normalizePlayerName } from '../../utils/playerMatching'
import { useTeamColors } from '../../hooks/useTeamColors'
import {
  PageHero,
  Card,
  Button,
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
    'FCSE': 'FCS East Patriots', 'FCSM': 'FCS Midwest Thunderbirds',
    'FCSN': 'FCS Northwest Grizzlies', 'FCSW': 'FCS West Toads'
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
  const [filter, setFilter] = useState('first')
  const [showEditModal, setShowEditModal] = useState(false)
  // Explicit Final/Preseason selection — null means "no explicit choice
  // yet, use the automatic default" (see defaultView below). Resets on
  // year change so switching years doesn't carry over a stale choice.
  const [explicitView, setExplicitView] = useState(null)
  const teamColors = useTeamColors(currentDynasty?.teamName, currentDynasty?.teams || currentDynasty?.customTeams)
  useEffect(() => { setExplicitView(null) }, [urlYear])

  if (!currentDynasty) return null

  const allAmericansByYear = currentDynasty.allAmericansByYear || {}
  const startYear = currentDynasty.startYear || currentDynasty.currentYear
  const availableYears = []
  for (let year = currentDynasty.currentYear; year >= startYear; year--) {
    availableYears.push(year)
  }

  // Default to the most recent season that actually has All-Americans entered
  // (newest-first scan), falling back to current/last year when none exist.
  // An explicit URL year always wins.
  const yearHasData = (y) => {
    const d = allAmericansByYear[y] || allAmericansByYear[String(y)]
    if (!d) return false
    if (Array.isArray(d.allAmericans) && d.allAmericans.length > 0) return true
    return Array.isArray(d.allAmericansPreseason) && d.allAmericansPreseason.length > 0
  }
  const mostRecentYearWithData = availableYears.find(yearHasData) || null
  const isFirstSeason = Number(currentDynasty.currentYear) <= Number(currentDynasty.startYear)
  const displayYear = urlYear
    ? parseInt(urlYear)
    : (mostRecentYearWithData
        ?? (isFirstSeason ? currentDynasty.currentYear : currentDynasty.currentYear - 1))
  const yearData = allAmericansByYear[displayYear] || {}
  const finalAllAmericans = yearData.allAmericans || []
  // Preseason 1st/2nd Team predictions (synced the same way as final
  // honors, see cfb27SaveSync.js). Final honors always take precedence —
  // shown automatically the moment they exist for this year — but the
  // preseason picks stay available behind an explicit toggle so they can
  // still be compared against the real end-of-season teams afterward.
  const preseasonAllAmericans = yearData.allAmericansPreseason || []
  const hasFinalAllAmericans = finalAllAmericans.length > 0
  const hasPreseasonAllAmericans = preseasonAllAmericans.length > 0
  // Default view: Preseason until the season's real Final honors are
  // announced, then Final becomes the default automatically — every new
  // season repeats the same process since that year's own finalAllAmericans
  // starts out empty again until its season actually ends. An explicit tab
  // click always wins over this default, including clicking "Final" before
  // it exists (shows a blank/empty state rather than silently falling back
  // to Preseason) — the user needs to be able to SEE that it isn't out yet.
  const defaultView = hasFinalAllAmericans ? 'final' : 'preseason'
  const activeView = explicitView || defaultView
  const isPreseasonView = activeView === 'preseason'
  const allAmericans = isPreseasonView ? preseasonAllAmericans : finalAllAmericans

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

  // Tally per school for the leaderboard strip. Weighted score
  // (1st = 3, 2nd = 2, freshman = 1) breaks ties so a school with three
  // 1st-team picks edges one with three freshman picks.
  const schoolTally = (() => {
    const byKey = new Map()
    allAmericans.forEach(p => {
      const key = (p.school || '').toUpperCase()
      if (!key) return
      if (!byKey.has(key)) byKey.set(key, { school: key, first: 0, second: 0, freshman: 0, total: 0, score: 0 })
      const entry = byKey.get(key)
      entry[p.designation] = (entry[p.designation] || 0) + 1
      entry.total += 1
      entry.score += p.designation === 'first' ? 3 : p.designation === 'second' ? 2 : 1
    })
    return Array.from(byKey.values()).sort((a, b) => b.score - a.score || b.total - a.total)
  })()
  const leaderboardEntries = schoolTally.slice(0, 10).map((e, idx) => {
    const mascotName = getMascotName(e.school, currentDynasty?.teams || currentDynasty?.customTeams)
    const tid = resolveTid(e.school, currentDynasty?.teams || TEAMS)
    const colors = mascotName ? getTeamColors(mascotName, currentDynasty?.teams || currentDynasty?.customTeams) : null
    return {
      key: e.school,
      rank: idx + 1,
      name: getSchoolName(mascotName) || e.school,
      logo: mascotName ? getTeamLogo(mascotName, currentDynasty?.teams || currentDynasty?.customTeams) : null,
      primary: colors?.primary || '#64748b',
      first: e.first, second: e.second, freshman: e.freshman, total: e.total,
      link: tid ? `${pathPrefix}/team/${tid}/${displayYear}` : '#',
    }
  })

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
      !isOpenTarget(p) && normalizePlayerName(p.name) === normalizedName
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

  // Placeholder images: imported rosters often set every player's pictureUrl to
  // the team logo. A real photo is unique, so anything shared by 3+ players is
  // treated as a placeholder and the tile shows a monogram instead — EXCEPT a
  // CFB27 generic portrait (/cfb27-portraits/generic/), which legitimately
  // draws from a shared pool of ~5,040 template faces by the game's own
  // design (see TeamYear.jsx's own fix for this exact bug, confirmed against
  // a real save) — many players genuinely looking identical there is not a
  // mistake this heuristic should "fix", and treating it as one silently
  // hides real, correctly-synced portraits (confirmed: Brady Bradshaw, a
  // generic-portrait punter, lost his real photo this way).
  const placeholderImages = (() => {
    const counts = new Map()
    for (const p of (currentDynasty.players || [])) {
      const u = p.pictureUrl
      if (u && !u.includes('/cfb27-portraits/')) counts.set(u, (counts.get(u) || 0) + 1)
    }
    return new Set([...counts].filter(([, n]) => n >= 3).map(([u]) => u))
  })()
  const realPhoto = (url) => (url && !placeholderImages.has(url) ? url : null)

  const PlayerRow = ({ player }) => {
    const mascotName = getMascotName(player.school, currentDynasty?.teams || currentDynasty?.customTeams)
    const teamLogo = mascotName ? getTeamLogo(mascotName, currentDynasty?.teams || currentDynasty?.customTeams) : null
    const colors = mascotName ? getTeamColors(mascotName, currentDynasty?.teams || currentDynasty?.customTeams) : null
    const primary = colors?.primary || '#64748b'
    const matchingPlayer = findPlayerByNameAndSchool(player.player, player.school, player.schoolTid)
    const schoolName = getSchoolName(mascotName) || player.school
    return (
      <HonorPlayerTile
        position={player.position}
        name={cleanPlayerName(player.player)}
        klass={player.class}
        schoolName={schoolName}
        schoolAbbr={player.school}
        teamLogo={teamLogo}
        primary={primary}
        photoUrl={realPhoto(matchingPlayer?.pictureUrl)}
        to={matchingPlayer ? `${pathPrefix}/player/${matchingPlayer.pid}` : null}
      />
    )
  }

  // Editorial section header — big tracked-uppercase team designation
  // ("FIRST TEAM ALL-AMERICANS") that scans like a magazine spread
  // rather than a generic "Section Title" label.
  const TeamSection = ({ designation, players }) => {
    if (players.length === 0) return null

    return (
      <section className="space-y-3">
        <header className="flex items-end gap-4 pb-1">
          <div className="flex-shrink-0">
            <div
              className="font-display font-black text-txt-primary leading-none"
              style={{
                fontSize: '32px',
                letterSpacing: '-0.02em',
                lineHeight: 1,
              }}
            >
              {DESIGNATION_LABEL[designation].split(' ')[0]}
            </div>
            <div
              className="label-xs text-txt-tertiary mt-1"
              style={{ letterSpacing: '2.5px', fontSize: '10px' }}
            >
              {designation === 'first' && 'TEAM ALL-AMERICAN'}
              {designation === 'second' && 'TEAM ALL-AMERICAN'}
              {designation === 'freshman' && 'ALL-AMERICAN'}
            </div>
          </div>
          <div className="flex-1 h-px bg-surface-4 mb-2" />
          <span
            className="label-xs tabular text-txt-tertiary mb-1"
            style={{ letterSpacing: '1.5px', fontSize: '10px' }}
          >
            {players.length} {players.length === 1 ? 'PLAYER' : 'PLAYERS'}
          </span>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-5 gap-2">
          {players.map((player, idx) => (
            <PlayerRow
              key={`${designation}-${player.position}-${player.player}-${idx}`}
              player={player}
            />
          ))}
        </div>
      </section>
    )
  }

  const hasAnyPlayers = allAmericans.length > 0

  const heroActions = !isViewOnly ? (
    <Button variant="secondary" size="sm" onClick={() => setShowEditModal(true)}>
      Edit
    </Button>
  ) : null

  return (
    <div className="space-y-6">
      <PageHero
        title={
          <span className="inline-flex items-center gap-2" style={{ fontSize: 'var(--text-display-lg)' }}>
            <img src="/badges/all-american.png" alt="" className="w-auto shrink-0" style={{ height: '1em' }} />
            <TitleWithYear
              year={displayYear}
              years={availableYears}
              onChange={handleYearChange}
              label="All-Americans"
            />
          </span>
        }
        actions={heroActions}
        tabs={hasAnyPlayers ? [
          { key: 'first', label: '1st Team' },
          { key: 'second', label: '2nd Team' },
          { key: 'freshman', label: 'Freshman' },
        ] : undefined}
        activeTab={filter}
        onTabChange={setFilter}
      />

      {(hasFinalAllAmericans || hasPreseasonAllAmericans) && (
        <div className="inline-flex items-center gap-1 p-1 rounded-lg" style={{ backgroundColor: 'var(--surface-2)' }}>
          {[{ key: 'final', label: 'Final' }, { key: 'preseason', label: 'Preseason' }].map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setExplicitView(v.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wide transition-colors ${
                activeView === v.key ? 'bg-surface-4 text-txt-primary' : 'text-txt-tertiary hover:text-txt-primary'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}

      {!hasAnyPlayers ? (
        <Card>
          <EmptyState
            title={activeView === 'final' ? "Final All-Americans Not Announced Yet" : "No Preseason All-Americans Yet"}
            message={activeView === 'final' ? "Check back once the season's final honors are announced." : undefined}
            action={!isViewOnly && (
              <Button variant="secondary" onClick={() => setShowEditModal(true)}>
                Add All-Americans
              </Button>
            )}
          />
        </Card>
      ) : (
        <TeamSection designation={filter} players={filteredPlayers} />
      )}

      {hasAnyPlayers && leaderboardEntries.length > 0 && (
        <SchoolLeaderboard entries={leaderboardEntries} totalSchools={schoolTally.length} />
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
