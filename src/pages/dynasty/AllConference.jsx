import { useState, useMemo, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { isOpenTarget } from '../../utils/recruitingTargets'
import { useDynasty, getCustomConferencesForYear, getTeamConferenceForDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { getTeamLogo, getMascotName as getMascotNameFromTeams, stripMascotFromName } from '../../data/teams'
import { getTeamColors } from '../../data/teamColors'
import { TEAMS, resolveTid, getCurrentTeamAbbr, getGameTeamInfo } from '../../data/teamRegistry'
import { conferenceTeams, getAllConferences } from '../../data/conferenceTeams'
import { getConferenceLogo } from '../../data/conferenceLogos'
import AllConferenceModal from '../../components/AllConferenceModal'
import { HonorPlayerTile, SchoolLeaderboard } from '../../components/HonorsUI'
import { normalizePlayerName } from '../../utils/playerMatching'
import { useTeamColors } from '../../hooks/useTeamColors'
import {
  PageHero,
  Card,
  Button,
  EmptyState,
  Tabs,
  InlineYearSelect,
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

export default function AllConference() {
  const { year: urlYear, conference: urlConference } = useParams()
  const navigate = useNavigate()
  const { currentDynasty, updateDynasty, isViewOnly, processHonorPlayers } = useDynasty()
  const pathPrefix = usePathPrefix()
  const [filter, setFilter] = useState('first')
  const [showEditModal, setShowEditModal] = useState(false)
  // Explicit Final/Preseason selection — null means "no explicit choice
  // yet, use the automatic default" (see defaultView below). Resets on
  // year change so switching years doesn't carry over a stale choice.
  const [explicitView, setExplicitView] = useState(null)
  useEffect(() => { setExplicitView(null) }, [urlYear])
  const teamColors = useTeamColors(currentDynasty?.teamName, currentDynasty?.teams || currentDynasty?.customTeams)

  if (!currentDynasty) return null

  const allAmericansByYear = currentDynasty.allAmericansByYear || {}
  const startYear = currentDynasty.startYear || currentDynasty.currentYear
  const availableYears = []
  for (let year = currentDynasty.currentYear; year >= startYear; year--) {
    availableYears.push(year)
  }

  // Default to the most recent season that actually has NON-EMPTY All-Conference
  // data for the user's own conference (newest-first scan). The conference is
  // resolved against the current year so it doesn't depend on the year we're
  // about to pick. An explicit URL year always wins.
  const defaultUserConf = (() => {
    const cy = Number(currentDynasty.currentYear)
    const coachRecord = currentDynasty.coachTeamByYear?.[cy] || currentDynasty.coachTeamByYear?.[String(cy)]
    const abbr = coachRecord?.team || getCurrentTeamAbbr(currentDynasty)
    return getTeamConferenceForDynasty(currentDynasty, abbr, cy) || 'SEC'
  })()
  const teamsData = currentDynasty?.teams || currentDynasty?.customTeams
  // Resolve an honor entry's team, tid-first (durable) then by name. Returns
  // logo/colors/abbr/schoolName. Mirrors AllAmericans so both pages behave the
  // same for full ALL-CAPS names and teambuilder renames.
  const resolveSchool = (schoolTid, schoolName) => {
    let tid = schoolTid != null ? Number(schoolTid) : null
    if (tid == null && schoolName) tid = resolveTid(schoolName, teamsData || TEAMS) || null
    const abbrFromTid = tid != null ? (getGameTeamInfo(teamsData || TEAMS, tid)?.abbr || null) : null
    const mascotName = getMascotName(abbrFromTid || schoolName, teamsData)
    return {
      tid,
      abbr: abbrFromTid,
      mascotName,
      teamLogo: mascotName ? getTeamLogo(mascotName, teamsData) : null,
      colors: mascotName ? getTeamColors(mascotName, teamsData) : null,
      schoolName: getSchoolName(mascotName) || schoolName,
    }
  }
  // The conference an honor entry belongs to, resolved from its team's tid so
  // membership is robust to full-name schools AND conference renames (uses the
  // same conference resolver as the user's own conference).
  const entryConference = (entry, y) => {
    const { abbr } = resolveSchool(entry?.schoolTid, entry?.school)
    const lookup = abbr || entry?.school || null
    return lookup ? (getTeamConferenceForDynasty(currentDynasty, lookup, y) || null) : null
  }
  const yearHasData = (y) => {
    const d = allAmericansByYear[y] || allAmericansByYear[String(y)]
    if (!d) return false
    const byConf = d.allConferenceByConference?.[defaultUserConf]
    if (Array.isArray(byConf) && byConf.length > 0) return true
    // Same tid-derived membership the filter uses — a name-vs-abbr comparison
    // here would report "no data" for years the page can actually render.
    const matchesConf = (list) => (list || []).some(p => entryConference(p, y) === defaultUserConf)
    if (matchesConf(d.allConference)) return true
    // Preseason 1st/2nd Team predictions — only counts as "has data" as a
    // fallback; a year with real final data always wins above.
    return matchesConf(d.allConferencePreseason)
  }
  const mostRecentYearWithData = availableYears.find(yearHasData) || null
  const isFirstSeason = Number(currentDynasty.currentYear) <= Number(currentDynasty.startYear)
  const displayYear = urlYear
    ? parseInt(urlYear)
    : (mostRecentYearWithData
        ?? (isFirstSeason ? currentDynasty.currentYear : currentDynasty.currentYear - 1))
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
  const displayConferenceLogo = getConferenceLogo(displayConference)

  const filterByConference = (raw) => {
    if (!raw || raw.length === 0) return []
    // Tid-derived membership: group each entry by its team's ACTUAL conference
    // for this year (see entryConference). Robust to full-name schools and
    // conference renames. The previous form compared a full name ("GEORGIA")
    // against an abbr list ("UGA") and silently dropped every standard school —
    // that bug was fixed here once already and must not come back.
    return raw.filter(player => entryConference(player, displayYear) === displayConference)
  }

  // Preseason 1st/2nd Team predictions (synced the same way as final
  // All-Conference teams, see cfb27SaveSync.js). Final honors always take
  // precedence — shown automatically the moment they exist for this
  // year/conference — but the preseason picks stay available behind an
  // explicit toggle so they can still be compared against the real
  // end-of-season teams afterward.
  // Default view: Preseason until the season's real Final honors are
  // announced, then Final becomes the default automatically — every new
  // season repeats the same process since that year/conference's own final
  // list starts out empty again until its season actually ends. An explicit
  // tab click always wins over this default, including clicking "Final"
  // before it exists (shows a blank/empty state rather than silently
  // falling back to Preseason).
  const { allConference, isPreseasonView, hasFinalAllConference, hasPreseasonAllConference, activeView } = useMemo(() => {
    const byConf = yearData.allConferenceByConference?.[displayConference]
    const final = (Array.isArray(byConf) && byConf.length > 0) ? byConf : filterByConference(yearData.allConference || [])
    const preseason = filterByConference(yearData.allConferencePreseason || [])
    const hasFinal = final.length > 0
    const hasPreseason = preseason.length > 0
    const defaultView = hasFinal ? 'final' : 'preseason'
    const view = explicitView || defaultView
    return {
      allConference: view === 'preseason' ? preseason : final,
      isPreseasonView: view === 'preseason',
      hasFinalAllConference: hasFinal,
      hasPreseasonAllConference: hasPreseason,
      activeView: view,
    }
  }, [yearData, displayConference, explicitView])

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

      // processHonorPlayers now applies exact-matches and clear
      // new-player creates immediately, only returning confirmations
      // for genuine "same name, different team, ≤5 seasons apart"
      // transfer cases. We auto-resolve those as new players here
      // (the AllConference page imports a static roster snapshot — no
      // user is sitting at the modal to decide), which preserves the
      // pre-fix behavior on this page while every unambiguous entry
      // already has its player record.
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

  // Same position-order sort as AllAmericans.jsx — see its own comment for
  // why (the Preseason list came through in the save's arbitrary order).
  const POSITION_ORDER = [
    'QB', 'HB', 'FB', 'WR', 'TE',
    'LT', 'LG', 'C', 'RG', 'RT', 'OT', 'OG',
    'LE', 'RE', 'LEDG', 'REDG', 'EDGE', 'DT',
    'LOLB', 'MLB', 'ROLB', 'SAM', 'MIKE', 'WILL', 'OLB', 'LB',
    'CB', 'FS', 'SS', 'S', 'K', 'P',
  ]
  const byPosition = (a, b) => {
    const ai = POSITION_ORDER.indexOf(a.position)
    const bi = POSITION_ORDER.indexOf(b.position)
    if (ai === -1 && bi === -1) return 0
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  }

  const groupedByDesignation = {
    first: allConference.filter(p => p.designation === 'first').sort(byPosition),
    second: allConference.filter(p => p.designation === 'second').sort(byPosition),
    freshman: allConference.filter(p => p.designation === 'freshman').sort(byPosition)
  }

  // School leaderboard strip — same weighted tally (1st = 3, 2nd = 2,
  // freshman = 1) as AllAmericans.jsx. allConference is already scoped to the
  // selected conference, so this naturally ranks only that conference's
  // schools with no extra filtering needed.
  const schoolTally = (() => {
    const byKey = new Map()
    allConference.forEach(p => {
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
      name: stripMascotFromName(mascotName) || e.school,
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
    // Backfill the tid from the school name when the entry has none (legacy
    // data), so tid-based matching still works.
    let tidNum = schoolTid != null ? Number(schoolTid) : null
    if (tidNum == null && school) tidNum = resolveTid(school, teamsData || TEAMS) || null

    // Tid match — drift-safe disambiguation; mirrors AllAmericans.jsx.
    const playerMatchesTid = (p) => {
      if (tidNum == null) return false
      if (typeof p.team === 'number' && Number(p.team) === tidNum) return true
      if (p.teamsByYear) {
        for (const v of Object.values(p.teamsByYear)) {
          if (v != null && Number(v) === tidNum) return true
        }
      }
      if (p.allAmericans?.some(aa => aa.schoolTid != null && Number(aa.schoolTid) === tidNum)) return true
      if (p.allConference?.some(ac => ac.schoolTid != null && Number(ac.schoolTid) === tidNum)) return true
      return false
    }

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
      // Dynasty-local teams (including teambuilder replacements) must be
      // resolved before the static TEAMS table — a TB takeover slot can share
      // an abbr with a real FBS team and we want the dynasty's version to win.
      // Match against the team's abbr AND its full name/teamName, since the
      // entry's `school` may be a full ALL-CAPS name ("GEORGIA"), not "UGA".
      const teamIdsForTid = (tid) => {
        const t = currentDynasty?.teams?.[tid]
          || currentDynasty?.customTeams?.[tid]
          || TEAMS[tid]
        if (!t) return []
        return [t.abbr, t.name, t.teamName].filter(Boolean).map(s => String(s).toUpperCase())
      }
      if (p.team) {
        const ids = typeof p.team === 'number' ? teamIdsForTid(p.team) : [String(p.team).toUpperCase()]
        if (ids.includes(normalizedSchool)) return true
      }
      if (p.teamsByYear) {
        for (const tid of Object.values(p.teamsByYear)) {
          if (typeof tid === 'number' && teamIdsForTid(tid).includes(normalizedSchool)) return true
          if (typeof tid === 'string' && tid.toUpperCase() === normalizedSchool) return true
        }
      }
      return false
    }

    const nameMatches = currentDynasty.players.filter(p =>
      !isOpenTarget(p) && normalizePlayerName(p.name) === normalizedName
    )

    if (nameMatches.length === 0) return null
    if (nameMatches.length === 1) return nameMatches[0]

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
  // hides real, correctly-synced portraits.
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
    const { teamLogo, colors, schoolName, abbr } = resolveSchool(player.schoolTid, player.school)
    const primary = colors?.primary || '#64748b'
    const matchingPlayer = findPlayerByNameAndSchool(player.player, player.school, player.schoolTid)
    return (
      <HonorPlayerTile
        position={player.position}
        name={cleanPlayerName(player.player)}
        klass={player.class}
        schoolName={schoolName}
        schoolAbbr={abbr || player.school}
        teamLogo={teamLogo}
        primary={primary}
        photoUrl={realPhoto(matchingPlayer?.pictureUrl)}
        to={matchingPlayer ? `${pathPrefix}/player/${matchingPlayer.pid}` : null}
      />
    )
  }

  // Editorial section header lockup — mirror of AllAmericans page so the
  // two read like sister pages.
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
              {designation === 'freshman' ? 'ALL-' : 'TEAM ALL-'}{displayConference.toUpperCase()}
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

  const hasAnyPlayers = allConference.length > 0

  const heroActions = !isViewOnly ? (
    <Button variant="secondary" size="sm" onClick={() => setShowEditModal(true)}>
      Edit
    </Button>
  ) : null

  // Custom title: year + "All-" + conference, both dropdowns inlined as
  // part of the headline. Mirrors the InlineYearSelect pattern so the
  // conference picker reads as plain text with a small chevron, not a
  // chrome-y form control.
  const titleNode = (
    <h1 className="group display-lg text-txt-primary leading-none m-0 break-words inline-flex items-baseline flex-wrap gap-x-3">
      <InlineYearSelect
        value={displayYear}
        years={availableYears}
        onChange={handleYearChange}
        ariaLabel="Select year for All-Conference"
      />
      <span className="inline-flex items-baseline">
        <span>All-</span>
        <span className="relative inline-flex items-baseline">
          <span aria-hidden="true">{displayConference}</span>
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
            value={displayConference}
            onChange={(e) => handleConferenceChange(e.target.value)}
            aria-label="Select conference"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none"
          >
            {availableConferences.map((conf) => (
              <option key={conf} value={conf}>{conf}</option>
            ))}
          </select>
        </span>
      </span>
    </h1>
  )

  return (
    <div className="space-y-6">
      <PageHero
        title={
          <span className="inline-flex items-center gap-2" style={{ fontSize: 'var(--text-display-lg)' }}>
            {displayConferenceLogo && <img src={displayConferenceLogo} alt="" className="w-auto shrink-0" style={{ height: '1em' }} />}
            {titleNode}
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

      {(hasFinalAllConference || hasPreseasonAllConference) && (
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
            title={activeView === 'final' ? `Final All-${displayConference} Not Announced Yet` : `No Preseason All-${displayConference} Yet`}
            message={activeView === 'final' ? "Check back once the season's final honors are announced." : undefined}
            action={!isViewOnly && (
              <Button variant="secondary" onClick={() => setShowEditModal(true)}>
                Add All-Conference
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
