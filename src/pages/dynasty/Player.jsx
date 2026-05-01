import React, { useEffect, useState, useMemo } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useDynasty, getEncourageTransfers, getRecruitingCommitments } from '../../context/DynastyContext'
import PlayerCardFlip from '../../components/PlayerCardFlip'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useTeamColors } from '../../hooks/useTeamColors'
import { getContrastTextColor } from '../../utils/colorUtils'
import { getTeamLogo, getTeamLogoByTid, getMascotName as getMascotNameFromTeams, getSchoolName as getSchoolNameFromTeams, stripMascotFromName } from '../../data/teams'
import { teamAbbreviations } from '../../data/teamAbbreviations'
import { TEAMS, resolveTid, getCurrentTeamAbbr, getAbbrFromTeamName, getOriginalTeamAbbr, getTidFromAbbr } from '../../data/teamRegistry'
import { getTeamColors } from '../../data/teamColors'
import OverallProgressionModal from '../../components/OverallProgressionModal'
import ScoringHighlightsModal from '../../components/ScoringHighlightsModal'
import InlineScoringHighlights from '../../components/InlineScoringHighlights'
import { getPlayerGameLog } from '../../utils/boxScoreAggregator'
import { sortPlaysChronologically } from '../../utils/scoringPlayOrder'
import { buildTimelineEvents, eventsForYear, labelForEventKind } from '../../utils/playerTimeline'

// Load premium fonts
const FONT_LINK = document.createElement('link')
FONT_LINK.href = 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow:wght@500;600;700;800&family=Barlow+Condensed:wght@500;600;700;800&display=swap'
FONT_LINK.rel = 'stylesheet'
if (!document.querySelector(`link[href="${FONT_LINK.href}"]`)) {
  document.head.appendChild(FONT_LINK)
}

// Map abbreviation to mascot name for logo lookup
const getMascotName = (abbr, teamsData = null) => {
  // Try tid-based lookup first if teams data provided
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
    'CONN': 'Connecticut Huskies', 'CSU': 'Colorado State Rams', 'DUKE': 'Duke Blue Devils',
    'ECU': 'East Carolina Pirates', 'EMU': 'Eastern Michigan Eagles', 'FAU': 'Florida Atlantic Owls',
    'FIU': 'Florida International Panthers', 'FLA': 'Florida Gators', 'FRES': 'Fresno State Bulldogs',
    'FSU': 'Florida State Seminoles', 'GASO': 'Georgia Southern Eagles', 'GSU': 'Georgia State Panthers',
    'GT': 'Georgia Tech Yellow Jackets', 'HAW': 'Hawaii Rainbow Warriors', 'HOU': 'Houston Cougars',
    'ILL': 'Illinois Fighting Illini', 'IU': 'Indiana Hoosiers', 'IOWA': 'Iowa Hawkeyes',
    'ISU': 'Iowa State Cyclones', 'JKST': 'Jacksonville State Gamecocks', 'JMU': 'James Madison Dukes',
    'KENN': 'Kennesaw State Owls', 'KENT': 'Kent State Golden Flashes', 'KSU': 'Kansas State Wildcats',
    'KU': 'Kansas Jayhawks', 'LIB': 'Liberty Flames', 'LOU': 'Louisville Cardinals',
    'LSU': 'LSU Tigers', 'LT': 'Louisiana Tech Bulldogs', 'M-OH': 'Miami Redhawks',
    'MASS': 'Massachusetts Minutemen', 'MEM': 'Memphis Tigers', 'MIA': 'Miami Hurricanes',
    'MICH': 'Michigan Wolverines', 'MINN': 'Minnesota Golden Gophers', 'MISS': 'Ole Miss Rebels',
    'MIZ': 'Missouri Tigers', 'MRSH': 'Marshall Thundering Herd', 'MRYD': 'Maryland Terrapins',
    'MSST': 'Mississippi State Bulldogs', 'MSU': 'Michigan State Spartans',
    'MTSU': 'Middle Tennessee State Blue Raiders', 'NAVY': 'Navy Midshipmen',
    'NCST': 'North Carolina State Wolfpack', 'ND': 'Notre Dame Fighting Irish',
    'NEB': 'Nebraska Cornhuskers', 'NEV': 'Nevada Wolf Pack', 'NIU': 'Northern Illinois Huskies',
    'NMSU': 'New Mexico State Aggies', 'NU': 'Northwestern Wildcats', 'ODU': 'Old Dominion Monarchs',
    'OHIO': 'Ohio Bobcats', 'OSU': 'Ohio State Buckeyes', 'OKST': 'Oklahoma State Cowboys',
    'ORE': 'Oregon Ducks', 'ORST': 'Oregon State Beavers', 'OU': 'Oklahoma Sooners',
    'PITT': 'Pittsburgh Panthers', 'PSU': 'Penn State Nittany Lions', 'PUR': 'Purdue Boilermakers',
    'RICE': 'Rice Owls', 'RUTG': 'Rutgers Scarlet Knights', 'SCAR': 'South Carolina Gamecocks',
    'SDSU': 'San Diego State Aztecs', 'SHSU': 'Sam Houston State Bearkats', 'SJSU': 'San Jose State Spartans',
    'SMU': 'SMU Mustangs', 'STAN': 'Stanford Cardinal', 'SYR': 'Syracuse Orange',
    'TAMU': 'Texas A&M Aggies', 'TCU': 'TCU Horned Frogs', 'TEM': 'Temple Owls',
    'TENN': 'Tennessee Volunteers', 'TEX': 'Texas Longhorns', 'TLNE': 'Tulane Green Wave',
    'TLSA': 'Tulsa Golden Hurricane', 'TOL': 'Toledo Rockets', 'TROY': 'Troy Trojans',
    'TTU': 'Texas Tech Red Raiders', 'TXST': 'Texas State Bobcats', 'UAB': 'UAB Blazers',
    'UC': 'Cincinnati Bearcats', 'UCF': 'UCF Knights', 'UCLA': 'UCLA Bruins', 'UGA': 'Georgia Bulldogs',
    'UK': 'Kentucky Wildcats', 'ULL': 'Lafayette Ragin\' Cajuns', 'ULM': 'Monroe Warhawks',
    'UNC': 'North Carolina Tar Heels', 'UNLV': 'UNLV Rebels', 'UNM': 'New Mexico Lobos',
    'UNT': 'North Texas Mean Green', 'USA': 'South Alabama Jaguars', 'USC': 'USC Trojans',
    'USF': 'South Florida Bulls', 'USM': 'Southern Mississippi Golden Eagles',
    'USU': 'Utah State Aggies', 'UTAH': 'Utah Utes', 'UTEP': 'UTEP Miners',
    'UTSA': 'UTSA Roadrunners', 'UVA': 'Virginia Cavaliers', 'VAND': 'Vanderbilt Commodores',
    'VT': 'Virginia Tech Hokies', 'WAKE': 'Wake Forest Demon Deacons', 'WASH': 'Washington Huskies',
    'WIS': 'Wisconsin Badgers', 'WKU': 'Western Kentucky Hilltoppers', 'WMU': 'Western Michigan Broncos',
    'WSU': 'Washington State Cougars', 'WVU': 'West Virginia Mountaineers', 'WYO': 'Wyoming Cowboys',
    'DEL': 'Delaware Fightin\' Blue Hens', 'GAST': 'Georgia State Panthers', 'MZST': 'Missouri State Bears',
    'OKLA': 'Oklahoma Sooners', 'RUT': 'Rutgers Scarlet Knights', 'TUL': 'Tulane Green Wave',
    'TULN': 'Tulane Green Wave', 'TXAM': 'Texas A&M Aggies', 'TXTECH': 'Texas Tech Red Raiders',
    'UF': 'Florida Gators', 'UH': 'Houston Cougars', 'UL': 'Lafayette Ragin\' Cajuns',
    'UM': 'Miami Hurricanes', 'UMD': 'Maryland Terrapins', 'UT': 'Tennessee Volunteers',
    'VAN': 'Vanderbilt Commodores',
    // FCS teams
    'FCSE': 'FCS East Judicials', 'FCSM': 'FCS Midwest Rebels',
    'FCSN': 'FCS Northwest Stallions', 'FCSW': 'FCS West Titans'
  }
  return mascotMap[abbr] || null
}

// Get just the school name (without mascot) for cleaner display in timeline.
// Tid/abbr lookup goes through the canonical helper first; if that returns
// null (e.g. raw mascot string passed in), we fall back to the local
// `getMascotName` then strip via the shared helper so the mascot list
// stays in one place.
const getSchoolName = (abbrOrTid, teamsData = null) => {
  if (teamsData) {
    const result = getSchoolNameFromTeams(abbrOrTid, teamsData)
    if (result) return result
  }
  const fullName = getMascotName(abbrOrTid, teamsData)
  return stripMascotFromName(fullName)
}

// Class progression order
const CLASS_ORDER = ['Fr', 'RS Fr', 'So', 'RS So', 'Jr', 'RS Jr', 'Sr', 'RS Sr']

// Determine primary stat category for a position (where G/Snaps should appear)
const getPrimaryStatCategory = (position) => {
  const positionMap = {
    'QB': 'passing',
    'HB': 'rushing', 'FB': 'rushing',
    'WR': 'receiving', 'TE': 'receiving',
    'LT': 'blocking', 'LG': 'blocking', 'C': 'blocking', 'RG': 'blocking', 'RT': 'blocking',
    'LEDG': 'defense', 'REDG': 'defense', 'DT': 'defense',
    'SAM': 'defense', 'MIKE': 'defense', 'WILL': 'defense',
    'CB': 'defense', 'FS': 'defense', 'SS': 'defense',
    'K': 'kicking',
    'P': 'punting'
  }
  return positionMap[position] || 'passing'
}

export default function Player() {
  const { id: dynastyId, pid } = useParams()
  const { dynasties, currentDynasty, updatePlayer, syncAllPlayersStats, isViewOnly } = useDynasty()
  const pathPrefix = usePathPrefix()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // Explicit tab param — if set, it wins. If not set, derive from the
  // player's record below: awards → stats → timeline (first match wins).
  const explicitTab = searchParams.get('tab')
  const setActiveTab = (tab) => {
    setSearchParams({ tab })
  }
  const [showAccoladeModal, setShowAccoladeModal] = useState(false)
  const [accoladeType, setAccoladeType] = useState(null)
  const [overviewStatTab, setOverviewStatTab] = useState(null)
  const [showOverallProgressionModal, setShowOverallProgressionModal] = useState(false)
  const [showGameLogModal, setShowGameLogModal] = useState(false)
  const [expandedGameLog, setExpandedGameLog] = useState(null) // { year, statType }
  const [showScoringHighlightsModal, setShowScoringHighlightsModal] = useState(false)
  const [selectedGameScoringPlays, setSelectedGameScoringPlays] = useState(null)

  // Sort preferences for stat tables (persisted in localStorage)
  const [statSortPrefs, setStatSortPrefs] = useState(() => {
    try {
      const saved = localStorage.getItem('playerStatsSortPrefs')
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })

  // Handle stat table column sort
  const handleStatSort = (category, column) => {
    const currentSort = statSortPrefs[category]
    let newSort
    if (currentSort?.column === column) {
      // Toggle direction: desc -> asc -> clear
      if (currentSort.direction === 'desc') {
        newSort = { column, direction: 'asc' }
      } else {
        newSort = null // Clear sort, return to default (year ascending)
      }
    } else {
      // New column, start with descending (highest first)
      newSort = { column, direction: 'desc' }
    }

    const newPrefs = { ...statSortPrefs }
    if (newSort) {
      newPrefs[category] = newSort
    } else {
      delete newPrefs[category]
    }
    setStatSortPrefs(newPrefs)
    localStorage.setItem('playerStatsSortPrefs', JSON.stringify(newPrefs))
  }

  // Sort stat years by the selected column
  const sortStatYears = (years, category, getStatValue) => {
    const sortPref = statSortPrefs[category]
    if (!sortPref) return years // Default: keep original order (by year ascending)

    const { column, direction } = sortPref
    return [...years].sort((a, b) => {
      let aVal, bVal

      // Handle special columns
      if (column === 'year') {
        aVal = a.year
        bVal = b.year
      } else if (column === 'class') {
        aVal = CLASS_ORDER.indexOf(a.class)
        bVal = CLASS_ORDER.indexOf(b.class)
      } else if (column === 'gamesPlayed') {
        aVal = a.gamesPlayed || 0
        bVal = b.gamesPlayed || 0
      } else if (column === 'snapsPlayed') {
        aVal = a.snapsPlayed || 0
        bVal = b.snapsPlayed || 0
      } else {
        // Use the provided accessor for stat-specific columns
        aVal = getStatValue(a, column)
        bVal = getStatValue(b, column)
      }

      // Handle null/undefined
      if (aVal == null) aVal = -Infinity
      if (bVal == null) bVal = -Infinity

      const result = aVal > bVal ? 1 : aVal < bVal ? -1 : 0
      return direction === 'desc' ? -result : result
    })
  }

  // Standard column widths for consistent table layout
  const colWidths = {
    year: 'w-[52px]',      // Year column
    class: 'w-[56px]',     // Class column
    team: 'w-[44px]',      // Team logo column
    statNarrow: 'w-[40px]', // Single digit stats (G, TD, Int, etc.)
    statMedium: 'w-[52px]', // Medium stats (Yds, Rec, Car, etc.)
    statWide: 'w-[60px]',   // Wide stats (TD:INT, YDS/G, etc.)
    statPct: 'w-[48px]',    // Percentage stats
  }

  // Render a sortable table header
  const renderSortableHeader = (category, column, label, align = 'right', widthClass = '') => {
    const sortPref = statSortPrefs[category]
    const isActive = sortPref?.column === column
    const direction = isActive ? sortPref.direction : null

    return (
      <th
        key={column}
        className={`px-1.5 py-2.5 text-xs font-semibold uppercase cursor-pointer select-none transition-opacity hover:opacity-70 ${widthClass} text-${align}`}
        style={{ color: '#6b7280', opacity: isActive ? 1 : 0.7 }}
        onClick={() => handleStatSort(category, column)}
        title={`Sort by ${label}`}
      >
        <span className="inline-flex items-center gap-0.5 justify-end">
          {label}
          {isActive && (
            <span style={{ color: 'var(--text-primary)' }}>
              {direction === 'desc' ? '▼' : '▲'}
            </span>
          )}
        </span>
      </th>
    )
  }

  // In view mode, dynastyId is undefined - just use currentDynasty directly
  const dynasty = dynastyId
    ? (currentDynasty?.id === dynastyId ? currentDynasty : dynasties.find(d => d.id === dynastyId))
    : currentDynasty
  const player = dynasty?.players?.find(p => p.pid === parseInt(pid))

// True only while the player is a committed recruit who hasn't yet
  // joined the roster. Once they have a teamsByYear entry for the
  // current year (or any past year), they've enrolled — hide the
  // "Commitment" badge regardless of the stale isRecruit flag.
  const isUnenrolledRecruit = (() => {
    if (!player?.isRecruit) return false
    const tby = player.teamsByYear || {}
    const currentYr = Number(dynasty?.currentYear)
    if (!Number.isFinite(currentYr)) return true
    // If they have a team entry for the current year or any earlier
    // year, they've officially joined the roster.
    for (const k of Object.keys(tby)) {
      const y = Number(k)
      if (Number.isFinite(y) && y <= currentYr && tby[k] != null && tby[k] !== '') {
        return false
      }
    }
    return true
  })()

  // Get departure/transfer info - check movementByYear (source of truth from career editor) first,
  // then fall back to legacy movements[] array.
  // Preserves the user-supplied `reason` (portal reason) so it can be shown
  // as a tag on the player page.
  const departureMovement = (() => {
    const mby = player?.movementByYear
    if (mby) {
      const years = Object.keys(mby).map(Number).filter(y => !isNaN(y)).sort((a, b) => b - a)
      for (const y of years) {
        const m = mby[y] || mby[String(y)]
        if (!m?.type) continue
        if (m.type === 'declared_for_draft') {
          return { type: 'departure', reason: 'Pro Draft', year: y, extra: { draftRound: player.draftRound } }
        }
        if (m.type === 'graduated') {
          return { type: 'departure', reason: 'Graduating', year: y }
        }
        if (m.type === 'transferred_out') {
          return {
            type: 'transfer',
            to: m.toTeamTid ?? null,
            from: player?.teamsByYear?.[y] ?? player?.teamsByYear?.[String(y)] ?? null,
            year: y,
            reason: m.reason || null,
          }
        }
        if (m.type === 'encouraged_to_transfer') {
          return {
            type: 'departure',
            reason: 'Encouraged Transfer',
            portalReason: m.reason || null,
            year: y,
          }
        }
        // 'recommitted' means player entered portal but came back - no departure badge
        if (m.type === 'recommitted') {
          return null
        }
        // Unified 'entered_portal' — infer destination from next recorded
        // year's team in teamsByYear (more robust than scanning movementByYear,
        // since the next year may have only roster data without a movement).
        if (m.type === 'entered_portal') {
          const thisTeam = player?.teamsByYear?.[y] ?? player?.teamsByYear?.[String(y)] ?? null
          const tby = player?.teamsByYear || {}
          const laterTeamYears = Object.keys(tby)
            .map(Number)
            .filter(yr => Number.isFinite(yr) && yr > y)
            .sort((a, b) => a - b)
          const nextYr = laterTeamYears[0]
          const nextTeam = nextYr != null ? (tby[nextYr] ?? tby[String(nextYr)]) : null
          if (nextTeam != null && thisTeam != null && Number(nextTeam) === Number(thisTeam)) return null // recommit
          if (nextTeam != null) {
            return { type: 'transfer', to: nextTeam, from: thisTeam, year: y, reason: m.reason || null }
          }
          // Currently in portal, no destination yet
          return { type: 'transfer', to: null, from: thisTeam, year: y, reason: m.reason || null }
        }
      }
    }
    // Fall back to legacy movements[] array
    return (player?.movements || [])
      .filter(m => m.type === 'departure' || m.type === 'transfer')
      .sort((a, b) => (b.year || 0) - (a.year || 0))[0] || null
  })()

  // Determine if player has transferred out (to another team)
  const hasTransferredOut = departureMovement?.type === 'transfer' && departureMovement?.to

  // Determine the player's team - use the most recent year in teamsByYear
  // as source of truth. Value can be a tid (number, modern) or an abbr
  // (string, legacy) depending on when the entry was written.
  const currentYear = dynasty?.currentYear
  const playerTeamRaw = (() => {
    const tby = player?.teamsByYear
    if (tby) {
      const currentYearTeam = tby[currentYear] || tby[String(currentYear)]
      if (currentYearTeam) return currentYearTeam
      const years = Object.keys(tby).map(Number).filter(y => !isNaN(y)).sort((a, b) => b - a)
      if (years.length > 0) return tby[years[0]] || tby[String(years[0])]
    }
    return player?.team || getCurrentTeamAbbr(dynasty) || ''
  })()

  // Resolve to the registry team object via tid first (drift-safe). For
  // legacy abbr-string values, do a current-abbr scan then fall back to
  // searching dynasty.teams by abbr at all. The resolved abbr from the
  // registry is the AUTHORITATIVE current abbr — use it for downstream
  // logo / color / name lookups so a renamed teambuilder team renders.
  const playerTeam = (() => {
    if (playerTeamRaw == null || playerTeamRaw === '') return null
    if (typeof playerTeamRaw === 'number') {
      return dynasty?.teams?.[playerTeamRaw] || null
    }
    if (typeof playerTeamRaw === 'string' && /^\d+$/.test(playerTeamRaw)) {
      return dynasty?.teams?.[Number(playerTeamRaw)] || dynasty?.teams?.[playerTeamRaw] || null
    }
    if (dynasty?.teams) {
      return Object.values(dynasty.teams).find(t => t.abbr === playerTeamRaw) || null
    }
    return null
  })()

  // Effective abbr for legacy display lookups: prefer the registry's
  // current value over any drifted snapshot.
  const playerTeamAbbr = playerTeam?.abbr || (typeof playerTeamRaw === 'string' ? playerTeamRaw : '')

  // For outgoing transfers, get the team they transferred FROM
  const transferredFromTeam = hasTransferredOut
    ? departureMovement?.from
    : null

  // Get the full team name (prefer the registry team's name; fall back to
  // mascot resolution from the resolved abbr).
  const playerTeamName = playerTeam?.name
    || getMascotName(playerTeamAbbr, dynasty?.teams || dynasty?.customTeams)
    || dynasty?.teamName
    || ''

  // IMPORTANT: All hooks must be called before any early returns
  const teamColors = useTeamColors(playerTeamName, dynasty?.teams || dynasty?.customTeams)

  const teamInfo = playerTeam ? {
    name: playerTeam.name,
    backgroundColor: playerTeam.primaryColor || teamColors.primary || '#1f2937',
    textColor: playerTeam.secondaryColor || teamColors.secondary || '#f3f4f6',
    isTeambuilder: playerTeam.isCustom || false
  } : {
    name: playerTeamName,
    backgroundColor: teamColors.primary || '#1f2937',
    textColor: teamColors.secondary || '#f3f4f6',
    isTeambuilder: false
  }

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pid])

  // These useMemo hooks MUST be before early returns to maintain consistent hook order
  const playerGameLog = useMemo(() => {
    if (!dynasty?.games || !player?.name) return []

    const games = dynasty.games || []
    const playerName = player.name
    const gameLog = []
    const teams = dynasty?.teams || {}

    // Helper to normalize names for comparison
    const normalizeName = (name) => name ? name.toLowerCase().trim().replace(/\s+/g, ' ') : ''
    const normalizedPlayerName = normalizeName(playerName)

    games.forEach(game => {
      if (!game.boxScore) return
      const statCategories = ['passing', 'rushing', 'receiving', 'defense', 'kicking', 'blocking', 'punting', 'kickReturn', 'puntReturn']
      let playerStats = null
      let foundInTeam = null

      for (const side of ['home', 'away']) {
        if (!game.boxScore[side]) continue
        for (const category of statCategories) {
          const categoryStats = game.boxScore[side][category] || []
          const found = categoryStats.find(s => normalizeName(s.playerName) === normalizedPlayerName)
          if (found) {
            playerStats = { ...found, category }
            foundInTeam = side
            break
          }
        }
        if (playerStats) break
      }

      if (playerStats) {
        let playerTeamScore, opponentTeamScore, opponentAbbr, opponentTid

        if (game.team1Tid && game.team2Tid) {
          const team1Info = teams[game.team1Tid] || {}
          const team2Info = teams[game.team2Tid] || {}
          const isTeam1Home = game.homeTeamTid === game.team1Tid || game.homeTeamTid == null

          if (foundInTeam === 'home') {
            playerTeamScore = isTeam1Home ? game.team1Score : game.team2Score
            opponentTeamScore = isTeam1Home ? game.team2Score : game.team1Score
            opponentTid = isTeam1Home ? game.team2Tid : game.team1Tid
            const opponentInfo = teams[opponentTid] || {}
            opponentAbbr = opponentInfo.abbr || (isTeam1Home ? game.team2 : game.team1)
          } else {
            playerTeamScore = isTeam1Home ? game.team2Score : game.team1Score
            opponentTeamScore = isTeam1Home ? game.team1Score : game.team2Score
            opponentTid = isTeam1Home ? game.team1Tid : game.team2Tid
            const opponentInfo = teams[opponentTid] || {}
            opponentAbbr = opponentInfo.abbr || (isTeam1Home ? game.team1 : game.team2)
          }
        } else if (game.opponent) {
          const isUserHome = game.location === 'home' || game.location === 'neutral'
          if (foundInTeam === 'home') {
            playerTeamScore = isUserHome ? game.teamScore : game.opponentScore
            opponentTeamScore = isUserHome ? game.opponentScore : game.teamScore
            opponentAbbr = isUserHome ? game.opponent : game.userTeam
          } else {
            playerTeamScore = isUserHome ? game.opponentScore : game.teamScore
            opponentTeamScore = isUserHome ? game.teamScore : game.opponentScore
            opponentAbbr = isUserHome ? game.userTeam : game.opponent
          }
          // Try to get tid from abbr
          opponentTid = getTidFromAbbr(opponentAbbr)
        } else if (game.team1 && game.team2) {
          if (foundInTeam === 'home') {
            playerTeamScore = game.team1Score
            opponentTeamScore = game.team2Score
            opponentAbbr = game.team2
          } else {
            playerTeamScore = game.team2Score
            opponentTeamScore = game.team1Score
            opponentAbbr = game.team1
          }
          // Try to get tid from abbr
          opponentTid = getTidFromAbbr(opponentAbbr)
        }

        const result = playerTeamScore != null && opponentTeamScore != null
          ? (Number(playerTeamScore) > Number(opponentTeamScore) ? 'W' : 'L')
          : null
        const isNeutralSite = game.homeTeamTid === null || game.location === 'neutral'
        const playerLocation = isNeutralSite ? 'neutral' : (foundInTeam === 'home' ? 'home' : 'away')

        gameLog.push({
          game: { ...game, teamScore: playerTeamScore, opponentScore: opponentTeamScore, opponent: opponentAbbr || game.opponent, opponentTid, result: result || game.result, location: playerLocation },
          stats: playerStats,
          team: foundInTeam
        })
      }
    })

    // Sort by year desc, then game order
    const getGameOrder = (g) => {
      if (g.isConferenceChampionship || g.gameType === 'conference_championship') return 100
      if (g.isCFPFirstRound || g.gameType === 'cfp_first_round') return 101
      if (g.isCFPQuarterfinal || g.gameType === 'cfp_quarterfinal') return 102
      if (g.isCFPSemifinal || g.gameType === 'cfp_semifinal') return 103
      if (g.isCFPChampionship || g.gameType === 'cfp_championship') return 104
      if (g.isBowlGame || g.gameType === 'bowl') return 100 + (parseInt(g.week) || 1)
      return parseInt(g.week) || 0
    }
    gameLog.sort((a, b) => {
      if (b.game.year !== a.game.year) return b.game.year - a.game.year
      return getGameOrder(b.game) - getGameOrder(a.game)
    })

    return gameLog
  }, [dynasty?.games, dynasty?.teams, player?.name])

  const yearByYearStats = useMemo(() => {
    if (!player?.statsByYear) return []
    const playerOwnStats = player.statsByYear || {}
    const allYears = new Set(Object.keys(playerOwnStats))
    const years = []
    const sortedYears = Array.from(allYears).sort((a, b) => parseInt(b) - parseInt(a))
    sortedYears.forEach(yearStr => {
      const year = parseInt(yearStr)
      const ownYearStats = playerOwnStats[yearStr] || playerOwnStats[year]
      if (!ownYearStats) return
      const passing = ownYearStats?.passing
      const rushing = ownYearStats?.rushing
      const receiving = ownYearStats?.receiving
      const blocking = ownYearStats?.blocking
      const defensive = ownYearStats?.defense
      const kicking = ownYearStats?.kicking
      const punting = ownYearStats?.punting
      const kickReturn = ownYearStats?.kickReturn
      const puntReturn = ownYearStats?.puntReturn
      const playerClass = player?.classByYear?.[year] || player?.classByYear?.[yearStr] || player?.year
      // Use teamsByYear as source of truth for which team the player was on this year
      const yearTeam = player?.teamsByYear?.[year] || player?.teamsByYear?.[yearStr] || null
      years.push({
        year,
        team: yearTeam,
        class: playerClass,
        gamesPlayed: ownYearStats?.gamesPlayed || 0,
        snapsPlayed: ownYearStats?.snapsPlayed || 0,
        passing: passing ? {
          cmp: passing.cmp ?? passing.comp ?? 0,
          att: passing.att ?? passing.attempts ?? 0,
          yds: passing.yds ?? passing.yards ?? 0,
          td: passing.td ?? passing.touchdowns ?? 0,
          int: passing.int ?? passing.interceptions ?? 0,
          lng: passing.lng ?? passing.long ?? 0,
          sacks: passing.sacks ?? 0
        } : null,
        rushing: rushing ? {
          car: rushing.car ?? rushing.carries ?? 0,
          yds: rushing.yds ?? rushing.yards ?? 0,
          td: rushing.td ?? rushing.touchdowns ?? 0,
          lng: rushing.lng ?? rushing.long ?? 0,
          fum: rushing.fum ?? rushing.fumbles ?? 0,
          bt: rushing.bt ?? rushing.brokenTackles ?? 0,
          yac: rushing.yac ?? rushing.yAC ?? 0,
          twentyPlus: rushing.twentyPlus ?? rushing['20+'] ?? 0
        } : null,
        receiving: receiving ? {
          rec: receiving.rec ?? receiving.receptions ?? 0,
          yds: receiving.yds ?? receiving.yards ?? 0,
          td: receiving.td ?? receiving.touchdowns ?? 0,
          lng: receiving.lng ?? receiving.long ?? 0,
          drops: receiving.drops ?? 0
        } : null,
        blocking: blocking ? {
          pancakes: blocking.pancakes ?? 0,
          sacksAllowed: blocking.sacksAllowed ?? 0
        } : null,
        defensive: defensive ? {
          solo: defensive.soloTkl ?? defensive.solo ?? 0,
          ast: defensive.astTkl ?? defensive.ast ?? defensive.assists ?? 0,
          tfl: defensive.tfl ?? 0,
          sacks: defensive.sacks ?? 0,
          int: defensive.int ?? 0,
          intYds: defensive.intYds ?? 0,
          intTd: defensive.intTd ?? 0,
          pdef: defensive.pd ?? defensive.pdef ?? defensive.deflections ?? 0,
          ff: defensive.ff ?? 0,
          fr: defensive.fr ?? 0,
          td: defensive.td ?? 0
        } : null,
        kicking: kicking ? {
          fgm: kicking.fgm ?? 0,
          fga: kicking.fga ?? 0,
          fgPct: kicking.fga > 0 ? ((kicking.fgm / kicking.fga) * 100).toFixed(1) : '-',
          xpm: kicking.xpm ?? 0,
          xpa: kicking.xpa ?? 0,
          lng: kicking.lng ?? 0,
          kickoffs: kicking.kickoffs ?? 0,
          touchbacks: kicking.touchbacks ?? 0,
          fgb: kicking.fgb ?? 0,
          xpb: kicking.xpb ?? 0,
          fgm29: kicking.fgm29 ?? 0,
          fga29: kicking.fga29 ?? 0,
          fgm39: kicking.fgm39 ?? 0,
          fga39: kicking.fga39 ?? 0,
          fgm49: kicking.fgm49 ?? 0,
          fga49: kicking.fga49 ?? 0,
          fgm50: kicking.fgm50 ?? 0,
          fga50: kicking.fga50 ?? 0
        } : null,
        punting: punting ? {
          punts: punting.punts ?? 0,
          yds: punting.yds ?? 0,
          avg: punting.punts > 0 ? (punting.yds / punting.punts).toFixed(1) : '-',
          lng: punting.lng ?? 0,
          in20: punting.in20 ?? 0,
          tb: punting.tb ?? 0,
          netYds: punting.netYds ?? 0,
          block: punting.block ?? 0
        } : null,
        kickReturn: kickReturn ? {
          ret: kickReturn.ret ?? 0,
          yds: kickReturn.yds ?? 0,
          avg: kickReturn.ret > 0 ? (kickReturn.yds / kickReturn.ret).toFixed(1) : '-',
          td: kickReturn.td ?? 0,
          lng: kickReturn.lng ?? 0
        } : null,
        puntReturn: puntReturn ? {
          ret: puntReturn.ret ?? 0,
          yds: puntReturn.yds ?? 0,
          avg: puntReturn.ret > 0 ? (puntReturn.yds / puntReturn.ret).toFixed(1) : '-',
          td: puntReturn.td ?? 0,
          lng: puntReturn.lng ?? 0
        } : null
      })
    })
    return years
  }, [player?.statsByYear, player?.classByYear, player?.year, player?.teamsByYear])

  const gameLog = useMemo(() => {
    if (!expandedGameLog?.year || !player?.name || !dynasty) return []
    return getPlayerGameLog(dynasty, player.name, expandedGameLog.year, playerTeamAbbr)
  }, [expandedGameLog, dynasty, player?.name, playerTeamAbbr])

  // Flat list of this player's scoring plays with video, across all games,
  // in chronological order. Used by the Overview tab's inline highlight widget.
  const allPlayerScoringPlays = useMemo(() => {
    if (!player?.name || !playerGameLog?.length) return []
    const normalizeName = (name) => name?.toLowerCase().trim() || ''
    const playerNameNorm = normalizeName(player.name)
    const getPlayPoints = (play) => {
      const scoreType = play.scoreType || ''
      const patResult = play.patResult || ''
      if (scoreType.includes('TD') && !scoreType.includes('2PT')) {
        let pts = 6
        if (patResult.includes('Made XP')) pts += 1
        else if (patResult.includes('Converted 2PT')) pts += 2
        return pts
      }
      if (scoreType === 'Field Goal') return 3
      if (scoreType === 'Safety') return 2
      return 0
    }
    return [...playerGameLog]
      .sort((a, b) =>
        (a.game.year - b.game.year) ||
        ((a.game.week ?? 0) - (b.game.week ?? 0))
      )
      .flatMap(entry => {
        const game = entry.game
        const scoringSummary = sortPlaysChronologically(game.boxScore?.scoringSummary)
        // Running scores MUST be computed per-game, otherwise opening the
        // modal shows a nonsensical cross-career running total (e.g. "70-0"
        // for the 10th TD). Walk the full scoring summary for this game,
        // track both sides' running totals, then emit the player's plays
        // with the correct per-play running score attached.
        // Player-team-for-this-game — must be derived per game.year, not
        // currentYear, so transferred players show the correct team logo
        // and score attribution for prior-year highlights.
        //
        // tid is the source of truth, not abbr. play.team is stored as a
        // string abbr (legacy data shape we can't change without a
        // migration), so we resolve play.team → tid via the game's two
        // teams, then compare tids. This survives teambuilder teams whose
        // abbr was renamed after the game was recorded.
        const t1Tid = game.team1Tid != null ? Number(game.team1Tid) : null
        const t2Tid = game.team2Tid != null ? Number(game.team2Tid) : null
        const t1Abbr = t1Tid != null ? dynasty.teams?.[t1Tid]?.abbr?.toUpperCase() : null
        const t2Abbr = t2Tid != null ? dynasty.teams?.[t2Tid]?.abbr?.toUpperCase() : null

        const playerTeamTid = player.teamsByYear?.[game.year] != null
          ? Number(player.teamsByYear[game.year])
          : null
        // Prefer the matching game-side's current abbr so a renamed
        // teambuilder team still surfaces with its current display.
        const playerTeamAbbr = (
          playerTeamTid != null && playerTeamTid === t1Tid ? t1Abbr :
          playerTeamTid != null && playerTeamTid === t2Tid ? t2Abbr :
          (dynasty.teams?.[playerTeamTid]?.abbr || getCurrentTeamAbbr(dynasty))?.toUpperCase()
        )
        const playerTeamLogo = playerTeamTid != null
          ? getTeamLogoByTid(playerTeamTid, dynasty.teams)
          : null
        const opponentLogo = game.opponentTid
          ? getTeamLogoByTid(game.opponentTid, dynasty.teams)
          : null

        // Resolve a play's team-string to a tid via the game's two teams.
        // Returns null for legacy games missing tids or for plays whose
        // abbr matches neither side (abbr drift / bad data).
        const resolvePlayTid = (playTeamStr) => {
          const u = playTeamStr?.toUpperCase()
          if (!u) return null
          if (t1Abbr && u === t1Abbr) return t1Tid
          if (t2Abbr && u === t2Abbr) return t2Tid
          return null
        }

        let playerTeamScore = 0
        let opponentScore = 0
        const enriched = scoringSummary.map(play => {
          const pts = getPlayPoints(play)
          const playTid = resolvePlayTid(play.team)
          const isPlayerTeam = playTid != null && playerTeamTid != null
            ? playTid === playerTeamTid
            : play.team?.toUpperCase() === playerTeamAbbr
          if (isPlayerTeam) playerTeamScore += pts
          else opponentScore += pts
          return { ...play, runningPlayerScore: playerTeamScore, runningOpponentScore: opponentScore }
        })
        return enriched
          .filter(play => {
            if (!play.videoLink) return false
            if (normalizeName(play.scorer) === playerNameNorm) return true
            if (play.scoreType?.includes('TD') && play.passer && normalizeName(play.passer) === playerNameNorm) return true
            return false
          })
          .map(play => ({
            ...play,
            gameInfo: {
              gameId: game.gameId || game.gid || game.id,
              week: game.week,
              year: game.year,
              opponent: game.opponent,
              opponentTid: game.opponentTid,
              opponentLogo,
              playerTeamTid,
              playerTeamAbbr,
              playerTeamLogo,
              result: game.result,
            }
          }))
      })
  }, [player?.name, playerGameLog, dynasty])

  // Pick a random starting index once per player page visit so the widget
  // opens somewhere in the middle of the career rather than always at play 1.
  const randomScoringStartIndex = useMemo(() => {
    if (!allPlayerScoringPlays?.length) return 0
    return Math.floor(Math.random() * allPlayerScoringPlays.length)
  }, [allPlayerScoringPlays?.length])

  // Default tab: overview if any games are entered, otherwise stats if any
  // stats exist, otherwise timeline. Explicit ?tab= in the URL overrides.
  const defaultTab = (() => {
    const hasGames = (playerGameLog?.length || 0) > 0
    if (hasGames) return 'overview'
    // "has stats" = at least one category has non-zero data, not just the
    // presence of a year key (empty `{}` shells shouldn't default to Stats).
    const statsByYear = player?.statsByYear || {}
    const hasAnyStats = Object.values(statsByYear).some(year => {
      if (!year || typeof year !== 'object') return false
      return Object.values(year).some(cat => {
        if (cat == null || typeof cat !== 'object') return false
        return Object.values(cat).some(v => typeof v === 'number' && v > 0)
      })
    })
    if (hasAnyStats) return 'stats'
    return 'timeline'
  })()
  const activeTab = explicitTab || defaultTab

  // Early returns AFTER all hooks
  if (!dynasty) {
    return <div className="text-center py-12"><p style={{ color: 'var(--text-secondary)' }}>Dynasty not found</p></div>
  }

  if (!player) {
    return <div className="text-center py-12"><p style={{ color: 'var(--text-secondary)' }}>Player not found</p></div>
  }
  // Cards now use neutral dark surfaces — text uses semantic tokens
  // (team color is reserved for accent stripes / borders; body text stays neutral).
  // Concrete hex values so `${primaryText}...` hex-alpha concatenations stay valid.
  const teamBgText = getContrastTextColor(teamInfo.backgroundColor)
  const primaryText = '#f5f5f7'      // var(--text-primary)
  const secondaryText = '#a8a8b0'    // var(--text-secondary)
  const teamAbbr = playerTeamAbbr

  // Check if player was drafted
  const getDraftInfo = () => {
    const draftResultsByYear = dynasty.draftResultsByYear || {}
    for (const [year, results] of Object.entries(draftResultsByYear)) {
      if (!results) continue
      const draftResult = results.find(r => r.pid === player.pid || r.playerName === player.name)
      if (draftResult) {
        return { year: parseInt(year), ...draftResult }
      }
    }
    return null
  }
  const draftInfo = getDraftInfo()

  // Calculate POW honors
  const calculatePOWHonors = () => {
    const games = dynasty.games || []
    const teams = dynasty.teams || dynasty.customTeams || {}
    let confOffPOW = 0, confDefPOW = 0, nationalOffPOW = 0, nationalDefPOW = 0
    const confOffPOWGames = [], confDefPOWGames = [], nationalOffPOWGames = [], nationalDefPOWGames = []

    // Derive player-perspective fields (opponent, teamScore, opponentScore,
    // location, result) from a raw game. The accolade modal renders these
    // fields — without this transform, opponent is blank and the score is "-".
    const toPlayerPerspective = (game) => {
      const gameYear = game.year ?? game.season
      const playerTid =
        player?.teamsByYear?.[gameYear] ??
        player?.teamsByYear?.[String(gameYear)] ??
        player?.team ??
        null

      let teamScore = null, opponentScore = null, opponentAbbr = null, opponentTid = null, location = 'home'
      if (game.team1Tid != null && game.team2Tid != null) {
        const playerIsTeam1 = game.team1Tid === playerTid
        const playerIsTeam2 = game.team2Tid === playerTid
        // If we can't match the player to either side (missing teamsByYear),
        // fall back to team1 perspective so at least something renders.
        const onTeam1 = playerIsTeam1 || (!playerIsTeam1 && !playerIsTeam2)
        teamScore = onTeam1 ? game.team1Score : game.team2Score
        opponentScore = onTeam1 ? game.team2Score : game.team1Score
        opponentTid = onTeam1 ? game.team2Tid : game.team1Tid
        opponentAbbr = teams[opponentTid]?.abbr || (onTeam1 ? game.team2 : game.team1) || ''
        const isNeutral = game.homeTeamTid == null || game.homeTeamTid === undefined
        location = isNeutral ? 'neutral' : (game.homeTeamTid === (onTeam1 ? game.team1Tid : game.team2Tid) ? 'home' : 'away')
      } else if (game.opponent != null) {
        teamScore = game.teamScore
        opponentScore = game.opponentScore
        opponentAbbr = game.opponent
        opponentTid = getTidFromAbbr(game.opponent)
        location = game.location || 'home'
      }

      const result = (teamScore != null && opponentScore != null)
        ? (Number(teamScore) > Number(opponentScore) ? 'W' : 'L')
        : (game.result || null)

      return {
        ...game,
        teamScore,
        opponentScore,
        opponent: opponentAbbr,
        opponentTid,
        location,
        result,
      }
    }

    games.forEach(rawGame => {
      const isConfOff = rawGame.conferencePOW === player.name
      const isConfDef = rawGame.confDefensePOW === player.name
      const isNatOff = rawGame.nationalPOW === player.name
      const isNatDef = rawGame.natlDefensePOW === player.name
      if (!isConfOff && !isConfDef && !isNatOff && !isNatDef) return
      const game = toPlayerPerspective(rawGame)
      if (isConfOff) { confOffPOW++; confOffPOWGames.push(game) }
      if (isConfDef) { confDefPOW++; confDefPOWGames.push(game) }
      if (isNatOff) { nationalOffPOW++; nationalOffPOWGames.push(game) }
      if (isNatDef) { nationalDefPOW++; nationalDefPOWGames.push(game) }
    })

    // Total counts for backward compatibility
    const confPOW = confOffPOW + confDefPOW
    const nationalPOW = nationalOffPOW + nationalDefPOW
    const confPOWGames = [...confOffPOWGames, ...confDefPOWGames]
    const nationalPOWGames = [...nationalOffPOWGames, ...nationalDefPOWGames]

    return {
      confPOW, nationalPOW, confPOWGames, nationalPOWGames,
      confOffPOW, confDefPOW, nationalOffPOW, nationalDefPOW,
      confOffPOWGames, confDefPOWGames, nationalOffPOWGames, nationalDefPOWGames
    }
  }

  const powHonors = calculatePOWHonors()

  const handleAccoladeClick = (type) => {
    setAccoladeType(type)
    setShowAccoladeModal(true)
  }

  const getTeamNameFromAbbr = (abbr) => getMascotName(abbr, dynasty?.teams || dynasty?.customTeams) || abbr

  // Calculate career totals
  const calculateCareerTotals = (years, statKey, fields) => {
    const totals = {}
    fields.forEach(field => {
      if (field === 'lng') {
        // Take max for long fields
        totals[field] = Math.max(...years.filter(y => y[statKey]).map(y => y[statKey][field] || 0), 0)
      } else {
        // Sum everything else
        totals[field] = years.filter(y => y[statKey]).reduce((sum, y) => sum + (y[statKey][field] || 0), 0)
      }
    })
    return totals
  }

  // Helper to check if a stat object has any meaningful (non-zero) values
  const hasNonZeroStats = (statObj, keys) => {
    if (!statObj) return false
    return keys.some(key => (statObj[key] || 0) > 0)
  }

  // Check which stat categories this player has actual recorded stats for
  const hasStats = {
    passing: yearByYearStats.some(y => y.passing && hasNonZeroStats(y.passing, ['att', 'cmp', 'yds', 'td'])),
    rushing: yearByYearStats.some(y => y.rushing && hasNonZeroStats(y.rushing, ['car', 'yds', 'td'])),
    receiving: yearByYearStats.some(y => y.receiving && hasNonZeroStats(y.receiving, ['rec', 'yds', 'td'])),
    blocking: yearByYearStats.some(y => y.blocking && hasNonZeroStats(y.blocking, ['sacksAllowed', 'pancakes'])),
    defensive: yearByYearStats.some(y => y.defensive && hasNonZeroStats(y.defensive, ['solo', 'ast', 'tfl', 'sacks', 'int', 'pdef', 'ff', 'fr'])),
    kicking: yearByYearStats.some(y => y.kicking && hasNonZeroStats(y.kicking, ['fgm', 'fga', 'xpm', 'xpa'])),
    punting: yearByYearStats.some(y => y.punting && hasNonZeroStats(y.punting, ['punts', 'yds'])),
    kickReturn: yearByYearStats.some(y => y.kickReturn && hasNonZeroStats(y.kickReturn, ['ret', 'yds', 'td'])),
    puntReturn: yearByYearStats.some(y => y.puntReturn && hasNonZeroStats(y.puntReturn, ['ret', 'yds', 'td']))
  }

  // Calculate averages
  const calcPct = (a, b) => b > 0 ? (a / b * 100).toFixed(1) : '0.0'
  const calcAvg = (a, b) => b > 0 ? (a / b).toFixed(1) : '0.0'

  // Career totals for each stat category
  const careerPassing = hasStats.passing ? calculateCareerTotals(yearByYearStats, 'passing', ['cmp', 'att', 'yds', 'td', 'int', 'lng', 'sacks']) : null
  const careerRushing = hasStats.rushing ? calculateCareerTotals(yearByYearStats, 'rushing', ['car', 'yds', 'td', 'lng', 'fum', 'bt', 'yac', 'twentyPlus']) : null
  const careerReceiving = hasStats.receiving ? calculateCareerTotals(yearByYearStats, 'receiving', ['rec', 'yds', 'td', 'lng', 'drops', 'rac']) : null
  const careerBlocking = hasStats.blocking ? calculateCareerTotals(yearByYearStats, 'blocking', ['sacksAllowed']) : null
  const careerDefensive = hasStats.defensive ? calculateCareerTotals(yearByYearStats, 'defensive', ['solo', 'ast', 'tfl', 'sacks', 'int', 'intYds', 'intTd', 'pdef', 'ff', 'fr']) : null
  const careerKicking = hasStats.kicking ? calculateCareerTotals(yearByYearStats, 'kicking', ['fgm', 'fga', 'lng', 'xpm', 'xpa']) : null
  const careerPunting = hasStats.punting ? calculateCareerTotals(yearByYearStats, 'punting', ['punts', 'yds', 'lng', 'in20', 'tb']) : null
  const careerKickReturn = hasStats.kickReturn ? calculateCareerTotals(yearByYearStats, 'kickReturn', ['ret', 'yds', 'td', 'lng']) : null
  const careerPuntReturn = hasStats.puntReturn ? calculateCareerTotals(yearByYearStats, 'puntReturn', ['ret', 'yds', 'td', 'lng']) : null

  // Total games and snaps
  const careerGames = yearByYearStats.reduce((sum, y) => sum + (y.gamesPlayed || 0), 0)
  const careerSnaps = yearByYearStats.reduce((sum, y) => sum + (y.snapsPlayed || 0), 0)

  // Get game log for the expanded year
  // Helper to toggle game log - now tracks both year AND stat type
  const toggleGameLog = (year, statType) => {
    const isCurrentlyExpanded = expandedGameLog?.year === year && expandedGameLog?.statType === statType
    setExpandedGameLog(isCurrentlyExpanded ? null : { year, statType })
  }

  // Check if a specific game log is expanded
  const isGameLogExpanded = (year, statType) => {
    return expandedGameLog?.year === year && expandedGameLog?.statType === statType
  }

  // Game log row component - renders a table matching the stat type columns
  const renderGameLogRow = (year, colSpan, statType) => {
    if (!isGameLogExpanded(year, statType)) return null

    // Define columns for each stat type
    // Property names match box score headers from boxScoreConstants.js (camelCase converted)
    const getStatColumns = () => {
      switch (statType) {
        case 'passing':
          return [
            { key: 'cmp', label: 'Cmp', getter: g => g.passing?.comp || 0 },
            { key: 'att', label: 'Att', getter: g => g.passing?.att || 0 },
            { key: 'yds', label: 'Yds', getter: g => g.passing?.yards || 0, bold: true },
            { key: 'avg', label: 'AVG', getter: g => g.passing?.att ? (g.passing.yards / g.passing.att).toFixed(1) : '0.0' },
            { key: 'td', label: 'TD', getter: g => g.passing?.tD || 0, bold: true },
            { key: 'int', label: 'INT', getter: g => g.passing?.iNT || 0 },
            { key: 'lng', label: 'Lng', getter: g => g.passing?.long || 0 },
          ]
        case 'rushing':
          return [
            { key: 'car', label: 'Car', getter: g => g.rushing?.carries || 0 },
            { key: 'yds', label: 'Yds', getter: g => g.rushing?.yards || 0, bold: true },
            { key: 'avg', label: 'AVG', getter: g => g.rushing?.carries ? (g.rushing.yards / g.rushing.carries).toFixed(1) : '0.0' },
            { key: 'td', label: 'TD', getter: g => g.rushing?.tD || 0, bold: true },
            { key: 'lng', label: 'Lng', getter: g => g.rushing?.long || 0 },
            { key: 'fum', label: 'Fum', getter: g => g.rushing?.fumbles || 0 },
            { key: 'bt', label: 'BTkl', getter: g => g.rushing?.bT || 0 },
          ]
        case 'receiving':
          return [
            { key: 'rec', label: 'Rec', getter: g => g.receiving?.receptions || 0 },
            { key: 'yds', label: 'Yds', getter: g => g.receiving?.yards || 0, bold: true },
            { key: 'avg', label: 'AVG', getter: g => g.receiving?.receptions ? (g.receiving.yards / g.receiving.receptions).toFixed(1) : '0.0' },
            { key: 'td', label: 'TD', getter: g => g.receiving?.tD || 0, bold: true },
            { key: 'lng', label: 'Lng', getter: g => g.receiving?.long || 0 },
            { key: 'drops', label: 'Drp', getter: g => g.receiving?.drops || 0 },
          ]
        case 'defense':
          return [
            { key: 'solo', label: 'Solo', getter: g => g.defense?.solo || 0 },
            { key: 'ast', label: 'Ast', getter: g => g.defense?.assists || 0 },
            { key: 'tot', label: 'Tot', getter: g => (g.defense?.solo || 0) + (g.defense?.assists || 0), bold: true },
            { key: 'tfl', label: 'TFL', getter: g => g.defense?.tFL || 0 },
            { key: 'sacks', label: 'Sck', getter: g => g.defense?.sack || 0 },
            { key: 'int', label: 'INT', getter: g => g.defense?.iNT || 0 },
            { key: 'pdef', label: 'PD', getter: g => g.defense?.deflections || 0 },
            { key: 'ff', label: 'FF', getter: g => g.defense?.fF || 0 },
          ]
        case 'kicking':
          return [
            { key: 'fgm', label: 'FGM', getter: g => g.kicking?.fGM || 0 },
            { key: 'fga', label: 'FGA', getter: g => g.kicking?.fGA || 0 },
            { key: 'fgpct', label: 'FG%', getter: g => g.kicking?.fGA ? ((g.kicking.fGM / g.kicking.fGA) * 100).toFixed(0) : '0' },
            { key: 'lng', label: 'Lng', getter: g => g.kicking?.fGLong || 0 },
            { key: 'xpm', label: 'XPM', getter: g => g.kicking?.xPM || 0 },
            { key: 'xpa', label: 'XPA', getter: g => g.kicking?.xPA || 0 },
          ]
        case 'punting':
          return [
            { key: 'punts', label: 'Punts', getter: g => g.punting?.punts || 0 },
            { key: 'yds', label: 'Yds', getter: g => g.punting?.yards || 0 },
            { key: 'avg', label: 'AVG', getter: g => g.punting?.punts ? (g.punting.yards / g.punting.punts).toFixed(1) : '0.0' },
            { key: 'lng', label: 'Lng', getter: g => g.punting?.long || 0 },
            { key: 'in20', label: 'In20', getter: g => g.punting?.in20 || 0 },
            { key: 'tb', label: 'TB', getter: g => g.punting?.tB || 0 },
          ]
        case 'kickReturn':
          return [
            { key: 'ret', label: 'Ret', getter: g => g.kickReturn?.kR || 0 },
            { key: 'yds', label: 'Yds', getter: g => g.kickReturn?.yards || 0, bold: true },
            { key: 'avg', label: 'AVG', getter: g => g.kickReturn?.kR ? (g.kickReturn.yards / g.kickReturn.kR).toFixed(1) : '0.0' },
            { key: 'td', label: 'TD', getter: g => g.kickReturn?.tD || 0 },
            { key: 'lng', label: 'Lng', getter: g => g.kickReturn?.long || 0 },
          ]
        case 'puntReturn':
          return [
            { key: 'ret', label: 'Ret', getter: g => g.puntReturn?.pR || 0 },
            { key: 'yds', label: 'Yds', getter: g => g.puntReturn?.yards || 0, bold: true },
            { key: 'avg', label: 'AVG', getter: g => g.puntReturn?.pR ? (g.puntReturn.yards / g.puntReturn.pR).toFixed(1) : '0.0' },
            { key: 'td', label: 'TD', getter: g => g.puntReturn?.tD || 0 },
            { key: 'lng', label: 'Lng', getter: g => g.puntReturn?.long || 0 },
          ]
        case 'blocking':
          return [
            { key: 'sacksAllowed', label: 'Sck Allow', getter: g => g.blocking?.sacksAllowed || 0 },
          ]
        default:
          return []
      }
    }

    const columns = getStatColumns()

    return (
      <tr>
        <td colSpan={colSpan} className="p-0">
          <div className="p-3" style={{ backgroundColor: `${teamInfo.backgroundColor}15`, borderTop: `1px solid ${teamInfo.backgroundColor}30`, borderBottom: `1px solid ${teamInfo.backgroundColor}30` }}>
            <div className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--text-primary)' }}>Game Log - {year}</div>
            {gameLog.length === 0 ? (
              <div className="text-xs italic" style={{ color: secondaryText, opacity: 0.6 }}>No game data available</div>
            ) : (
              <div className="overflow-x-auto rounded-lg bg-surface-2" style={{ border: `1px solid ${teamInfo.backgroundColor}40` }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-surface-3 border-b-2" style={{ borderBottomColor: teamInfo.backgroundColor }}>
                      <th className="px-2 py-2 text-left font-semibold w-12" style={{ color: primaryText }}>Wk</th>
                      <th className="px-2 py-2 text-center font-semibold w-8" style={{ color: primaryText }}></th>
                      <th className="px-2 py-2 text-left font-semibold" style={{ color: primaryText }}>Opponent</th>
                      {columns.map(col => (
                        <th key={col.key} className="px-2 py-2 text-right font-semibold" style={{ color: primaryText }}>{col.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {gameLog.map((game, idx) => {
                      const oppMascot = getMascotName(game.opponent, dynasty?.teams || dynasty?.customTeams)
                      const oppLogo = oppMascot ? getTeamLogo(oppMascot, dynasty?.teams || dynasty?.customTeams) : null
                      const isWin = game.result === 'win' || game.result === 'W'
                      return (
                        <tr
                          key={idx}
                          className="cursor-pointer transition-opacity hover:opacity-80"
                          style={{
                            backgroundColor: idx % 2 === 0 ? teamColors.secondary : `${teamColors.primary}10`,
                            borderBottom: `1px solid ${teamColors.primary}20`
                          }}
                          onClick={() => navigate(`${pathPrefix}/game/${game.gameId}`)}
                        >
                          <td className="px-2 py-2" style={{ color: secondaryText, opacity: 0.8 }}>{game.week || '-'}</td>
                          <td className="px-2 py-2 text-center">
                            <span
                              className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold"
                              style={{
                                backgroundColor: isWin ? '#22c55e' : '#ef4444',
                                color: '#fff'
                              }}
                            >
                              {isWin ? 'W' : 'L'}
                            </span>
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-1.5">
                              {oppLogo && <img src={oppLogo} alt="" className="w-4 h-4 object-contain" />}
                              <span className="font-medium truncate max-w-[120px]" style={{ color: secondaryText }}>{oppMascot || game.opponent}</span>
                              <span className="text-[10px]" style={{ color: secondaryText, opacity: 0.6 }}>{game.teamScore != null && game.opponentScore != null ? `${game.teamScore}-${game.opponentScore}` : '-'}</span>
                            </div>
                          </td>
                          {columns.map(col => (
                            <td key={col.key} className="px-2 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)', fontWeight: col.bold ? 600 : 400 }}>
                              {col.getter(game)}
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </td>
      </tr>
    )
  }

  // Check if player has any meaningful stats (non-zero games or any stat category with data)
  // Stats display is purely based on whether data exists in statsByYear - no other checks
  const hasMeaningfulStats = careerGames > 0 || careerSnaps > 0 || Object.values(hasStats).some(v => v)

  // Get recruitment info - check player object first, then recruiting commitments
  const getRecruitmentInfo = () => {
    // First check if player has recruitment data directly on the object
    const hasPlayerRecruitData = player.stars || player.nationalRank || player.stateRank ||
                                  player.positionRank || player.previousTeam || player.gemBust

    if (hasPlayerRecruitData) {
      return {
        stars: player.stars,
        nationalRank: player.nationalRank,
        stateRank: player.stateRank,
        positionRank: player.positionRank,
        previousTeam: player.previousTeam,
        gemBust: player.gemBust,
        state: player.state,
        isPortal: player.isPortal
      }
    }

    // Fall back to checking recruiting commitments data
    if (!player.isRecruit) return null
    const recruitYear = player.recruitYear || dynasty.currentYear
    // playerTeamAbbr could be tid (number) or abbr (string) - getter handles both
    const commitments = getRecruitingCommitments(dynasty, playerTeamAbbr, recruitYear)

    // Search through all commitment weeks for this player
    for (const [, weekCommits] of Object.entries(commitments)) {
      if (Array.isArray(weekCommits)) {
        const found = weekCommits.find(c => c.name?.toLowerCase().trim() === player.name?.toLowerCase().trim())
        if (found) return found
      }
    }
    return null
  }
  const recruitmentInfo = getRecruitmentInfo()

  // Compact recruitment strip — shown inline in the player header so the info
  // is always visible, not hidden inside the Timeline tab.
  const recruitmentStrip = recruitmentInfo ? (() => {
    const teamsData = dynasty?.teams || dynasty?.customTeams
    const starCount = Number(recruitmentInfo.stars) || 0
    const isPortalEntry = recruitmentInfo.isPortal || player.isPortal
    const classYear = player.recruitYear || player.yearStarted
    const recruitingClassTid = player.recruitYear
      ? resolveTid(player.teamsByYear?.[player.recruitYear] || playerTeamAbbr, currentDynasty?.teams || TEAMS)
      : null

    const prevTeamNode = recruitmentInfo.previousTeam ? (() => {
      const prevFullName = getMascotName(recruitmentInfo.previousTeam, teamsData)
      const prevLogo = prevFullName ? getTeamLogo(prevFullName, teamsData) : null
      const prevSchool = getSchoolName(recruitmentInfo.previousTeam, teamsData)
      const prevTid = typeof recruitmentInfo.previousTeam === 'number'
        ? recruitmentInfo.previousTeam
        : resolveTid(recruitmentInfo.previousTeam, teamsData || TEAMS)
      const transferYear = classYear || dynasty?.currentYear
      return (
        <Link
          to={`${pathPrefix}/team/${prevTid}/${transferYear}`}
          className="inline-flex items-center gap-1.5 hover:text-txt-primary transition-colors text-sm text-txt-secondary"
        >
          <span className="text-[10px] uppercase tracking-widest text-txt-tertiary">from</span>
          {prevLogo && <img src={prevLogo} alt="" className="w-4 h-4 object-contain" />}
          <span className="font-semibold">{prevSchool}</span>
        </Link>
      )
    })() : null

    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-3 mt-3 border-t border-surface-4">
        <span
          className="text-[10px] font-bold uppercase tracking-widest text-txt-tertiary"
          style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '1.5px' }}
        >
          {isPortalEntry ? 'Transfer Portal' : 'Recruitment'}
        </span>

        {starCount > 0 && (
          <div className="flex items-center gap-0.5" aria-label={`${starCount} star recruit`}>
            {[...Array(5)].map((_, i) => (
              <svg key={i} className="w-3.5 h-3.5" fill={i < starCount ? '#FFD700' : 'rgba(255,255,255,0.18)'} viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            ))}
          </div>
        )}

        {Number(recruitmentInfo.nationalRank) > 0 && (
          <span className="text-sm text-txt-primary">
            <span className="font-bold tabular">#{recruitmentInfo.nationalRank}</span>
            <span className="text-[10px] ml-1 uppercase tracking-widest text-txt-tertiary">Natl</span>
          </span>
        )}
        {Number(recruitmentInfo.positionRank) > 0 && (
          <span className="text-sm text-txt-primary">
            <span className="font-bold tabular">#{recruitmentInfo.positionRank}</span>
            <span className="text-[10px] ml-1 uppercase tracking-widest text-txt-tertiary">{player.position}</span>
          </span>
        )}
        {Number(recruitmentInfo.stateRank) > 0 && (
          <span className="text-sm text-txt-primary">
            <span className="font-bold tabular">#{recruitmentInfo.stateRank}</span>
            <span className="text-[10px] ml-1 uppercase tracking-widest text-txt-tertiary">{recruitmentInfo.state || player.state}</span>
          </span>
        )}

        {prevTeamNode}

        {recruitmentInfo.gemBust && (
          <span
            className="text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: recruitmentInfo.gemBust.toLowerCase() === 'gem' ? '#10B981' : '#EF4444',
              color: 'white',
              letterSpacing: '1.5px'
            }}
          >
            {recruitmentInfo.gemBust.toLowerCase() === 'gem' ? 'Gem' : 'Bust'}
          </span>
        )}

        <span className="ml-auto flex items-center gap-3">
          {classYear && (
            <span className="text-[10px] font-bold uppercase tracking-widest text-txt-tertiary" style={{ letterSpacing: '1.5px' }}>
              Class of <span className="tabular text-txt-secondary">{classYear}</span>
            </span>
          )}
          {recruitingClassTid && player.recruitYear && (
            <Link
              to={`${pathPrefix}/recruiting/${recruitingClassTid}/${player.recruitYear}`}
              className="text-[10px] font-bold uppercase tracking-widest text-txt-secondary hover:text-txt-primary transition-colors"
              style={{ letterSpacing: '1.5px' }}
            >
              View Class →
            </Link>
          )}
        </span>
      </div>
    )
  })() : null

  // Award plates — aggregated career honors rendered as compact pills in the hero.
  // Inspired by basketball-gm: "3x MVP", "7x Champion" — quick-scan career summary.
  const awardPlates = (() => {
    const accolades = player?.accolades || []
    const allAmericans = player?.allAmericans || []
    const allConference = player?.allConference || []

    // Tier 1 — gold/highlighted (most prestigious)
    const heismanAwardKeys = new Set(['heisman', 'heismanTrophy'])
    const heismanCount = accolades.filter(a => heismanAwardKeys.has(a.award)).length

    // Tier 2 — major named awards (aggregate by award key, sort by count desc)
    const majorAwardLabels = {
      maxwellAward: 'Maxwell',
      walterCampAward: 'Walter Camp',
      daveyObrienAward: "Davey O'Brien",
      chuckBednarikAward: 'Bednarik',
      bronkoNagurskiTrophy: 'Nagurski',
      butkusAward: 'Butkus',
      lombardiAward: 'Lombardi',
      outlandTrophy: 'Outland',
      jimThorpeAward: 'Thorpe',
      tedHendricksAward: 'Hendricks',
      biletnikoffAward: 'Biletnikoff',
      johnMackeyAward: 'Mackey',
      rimingtonTrophy: 'Rimington',
      rayGuyAward: 'Ray Guy',
      louGrozaAward: 'Lou Groza',
      doakWalkerAward: 'Doak Walker',
      paulHornungAward: 'Paul Hornung',
      bowlMVP: 'Bowl MVP',
      cfpChampMVP: 'CFP Title MVP',
    }
    const majorCounts = {}
    accolades.forEach(a => {
      if (majorAwardLabels[a.award]) {
        majorCounts[a.award] = (majorCounts[a.award] || 0) + 1
      }
    })

    // Tier 3 — honors teams (aggregate by designation)
    const aaFirst = allAmericans.filter(a => (a.designation || 'first') === 'first').length
    const aaSecond = allAmericans.filter(a => a.designation === 'second').length
    const aaFreshman = allAmericans.filter(a => a.designation === 'freshman').length
    const acFirst = allConference.filter(a => (a.designation || 'first') === 'first').length
    const acSecond = allConference.filter(a => a.designation === 'second').length
    const acFreshman = allConference.filter(a => a.designation === 'freshman').length

    // Tier 4 — conference POYs
    const confPOY = accolades.filter(a => ['confPOY', 'confOPOY', 'confDPOY'].includes(a.award)).length
    const confFrosh = accolades.filter(a => a.award === 'confFreshmanOY').length

    // Tier 5 — player of the week (from game data via memoized powHonors)
    const confPOW = powHonors?.confPOW || 0
    const nationalPOW = powHonors?.nationalPOW || 0

    const fmt = (count, label) => count > 1 ? `${count}x ${label}` : label

    const tiers = []

    // Prestige tier — gold
    if (heismanCount > 0) {
      tiers.push({ label: fmt(heismanCount, 'Heisman'), variant: 'gold' })
    }

    // Major-award tier — subtle team-accent outline
    Object.entries(majorCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([key, n]) => {
        tiers.push({ label: fmt(n, majorAwardLabels[key]), variant: 'accent' })
      })

    // Honors-team tier — neutral
    if (aaFirst > 0) tiers.push({ label: fmt(aaFirst, '1st-Team All-American'), variant: 'accent' })
    if (aaSecond > 0) tiers.push({ label: fmt(aaSecond, '2nd-Team All-American'), variant: 'neutral' })
    if (aaFreshman > 0) tiers.push({ label: fmt(aaFreshman, 'Freshman All-American'), variant: 'neutral' })
    if (acFirst > 0) tiers.push({ label: fmt(acFirst, '1st-Team All-Conf'), variant: 'neutral' })
    if (acSecond > 0) tiers.push({ label: fmt(acSecond, '2nd-Team All-Conf'), variant: 'neutral' })
    if (acFreshman > 0) tiers.push({ label: fmt(acFreshman, 'Freshman All-Conf'), variant: 'neutral' })

    if (confPOY > 0) tiers.push({ label: fmt(confPOY, 'Conf POY'), variant: 'neutral' })
    if (confFrosh > 0) tiers.push({ label: fmt(confFrosh, 'Conf Frosh of the Year'), variant: 'neutral' })
    if (nationalPOW > 0) tiers.push({ label: fmt(nationalPOW, 'National POW'), variant: 'neutral' })
    if (confPOW > 0) tiers.push({ label: fmt(confPOW, 'Conf POW'), variant: 'neutral' })

    return tiers
  })()

  return (
    <div
      className="space-y-4 sm:space-y-6 max-w-6xl mx-auto -mt-4 sm:-mt-6 px-4 sm:px-6 lg:px-8 pt-2 sm:pt-3 pb-4 sm:pb-6"
    >
      {/* Player Header - Mobile Layout */}
      <div className="sm:hidden card overflow-hidden">
        <div className="h-[3px] w-full" style={{ backgroundColor: teamInfo.backgroundColor }} aria-hidden="true" />
        {/* Top row: Photo, Name, Overall */}
        <div className="p-4 flex items-center gap-3">
          {player.pictureUrl && (
            <img
              src={player.pictureUrl}
              alt={player.name}
              className="w-20 h-20 object-cover rounded-lg flex-shrink-0"
              style={{ border: `2px solid ${teamInfo.backgroundColor}` }}
              onError={(e) => { e.target.style.display = 'none' }}
            />
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black uppercase leading-none tracking-wide text-txt-primary" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
              {player.name}
            </h1>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-xs font-bold uppercase tracking-widest text-txt-secondary" style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '1.5px' }}>
                {player.jerseyNumber != null && player.jerseyNumber !== '' && `#${player.jerseyNumber} • `}{player.position}
              </span>
              {(() => {
                const currentDevTrait = player.devTraitByYear?.[currentYear] || player.devTraitByYear?.[String(currentYear)] || player.devTrait
                return currentDevTrait && currentDevTrait !== 'Normal' ? (
                  <span
                    className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                    style={{
                      backgroundColor: currentDevTrait === 'Elite' ? '#fbbf24' :
                                     currentDevTrait === 'Star' ? '#8b5cf6' :
                                     currentDevTrait === 'Impact' ? '#3b82f6' : '#9ca3af',
                      color: currentDevTrait === 'Elite' ? '#78350f' : '#ffffff',
                      fontFamily: "'Bebas Neue', sans-serif"
                    }}
                  >
                    {currentDevTrait}
                  </span>
                ) : null
              })()}
            </div>
          </div>
          {/* Overall Rating */}
          <div className="text-center flex-shrink-0">
            {(() => {
              const currentOvr = player.overallByYear?.[currentYear] || player.overallByYear?.[String(currentYear)] || player.overall
              return currentOvr ? (
                <button
                  onClick={() => setShowOverallProgressionModal(true)}
                  className="hover:opacity-80 transition-opacity"
                  title="View overall progression"
                >
                  <div className="text-4xl font-black text-txt-primary tabular" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>{currentOvr}</div>
                  <div className="text-[9px] font-bold uppercase tracking-widest text-txt-tertiary" style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '1.5px' }}>OVR</div>
                </button>
              ) : (
                <div>
                  <div className="text-4xl font-black text-txt-muted" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>—</div>
                  <div className="text-[9px] font-bold uppercase tracking-widest text-txt-tertiary" style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '1.5px' }}>OVR</div>
                </div>
              )
            })()}
          </div>
        </div>

        {/* Info rows */}
        <div className="px-4 pb-3 space-y-2 text-txt-secondary">
          {/* Team and Class */}
          <div className="flex items-center justify-between">
            <Link
              to={`${pathPrefix}/team/${resolveTid(teamAbbr, currentDynasty?.teams || TEAMS)}/${currentYear}?tab=roster`}
              className="inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider hover:underline text-txt-primary"
              style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '1.2px' }}
            >
              {getTeamLogo(playerTeamName, dynasty?.teams || dynasty?.customTeams) && (
                <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 bg-surface-3" style={{ padding: '2px' }}>
                  <img src={getTeamLogo(playerTeamName, dynasty?.teams || dynasty?.customTeams)} alt="" className="w-full h-full object-contain" />
                </div>
              )}
              <span className="truncate max-w-[140px]">{playerTeamName}</span>
            </Link>
            <span className="text-sm font-bold uppercase tracking-wider text-txt-secondary" style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '1.2px' }}>{player.classByYear?.[dynasty?.currentYear] || player.year}</span>
          </div>

          {/* Archetype and Physical */}
          {(player.archetype || player.height || player.weight) && (
            <div className="flex items-center justify-between text-xs text-txt-tertiary">
              {player.archetype && <span>{player.archetype}</span>}
              {(player.height || player.weight) && (
                <span>{player.height}{player.height && player.weight && ', '}{player.weight ? `${player.weight} lbs` : ''}</span>
              )}
            </div>
          )}

          {/* Hometown */}
          {(player.hometown || player.state) && player.state && (
            <Link
              to={`${pathPrefix}/players/state/${player.state}`}
              className="text-xs hover:underline text-txt-tertiary transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              {player.hometown}{player.hometown && player.state && ', '}{player.state}
            </Link>
          )}

          {/* Status badges */}
          <div className="flex flex-wrap items-center gap-2">
            {isUnenrolledRecruit && (
              <span
                className="px-2 py-0.5 rounded-full text-xs font-bold"
                style={{ backgroundColor: `${teamInfo.backgroundColor}25`, color: teamInfo.backgroundColor, border: `1px solid ${teamInfo.backgroundColor}50` }}
              >
                Commitment
              </span>
            )}
            {/* In-Portal badge — entered portal via Players Leaving, no
                destination yet (Transfer Destinations not filled). Appears
                between offseason Week 1 and National Signing Day. */}
            {departureMovement && departureMovement.type === 'transfer' && !departureMovement.to && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold uppercase"
                style={{
                  backgroundColor: 'rgba(245, 158, 11, 0.15)',
                  color: '#fbbf24',
                  border: '1px solid rgba(245, 158, 11, 0.5)',
                  letterSpacing: '1px',
                }}
                title={`In transfer portal${departureMovement.year ? ` since ${departureMovement.year}` : ''}${departureMovement.reason ? ` — ${departureMovement.reason}` : ''}`}
              >
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#fbbf24' }} aria-hidden="true" />
                In Portal
                {departureMovement.reason && (
                  <span className="font-semibold normal-case opacity-90 tracking-normal">· {departureMovement.reason}</span>
                )}
              </span>
            )}
            {/* Departure badge - show based on movements[] */}
            {departureMovement && departureMovement.type === 'departure' && (() => {
              const reason = departureMovement.reason
              const portalReason = departureMovement.portalReason
              const year = departureMovement.year
              const draftRound = departureMovement.extra?.draftRound || player.draftRound
              const label = reason === 'Pro Draft' && draftRound
                ? `${year} NFL Draft - Round ${draftRound}`
                : reason === 'Pro Draft'
                ? `${year} NFL Draft`
                : reason === 'Graduating'
                ? `Graduated (${year})`
                : reason === 'Encouraged Transfer'
                ? `Transferred (${year})`
                : ['Playing Style', 'Proximity to Home', 'Championship Contender', 'Program Tradition',
                   'Campus Lifestyle', 'Stadium Atmosphere', 'Pro Potential', 'Brand Exposure',
                   'Academic Prestige', 'Conference Prestige', 'Coach Stability', 'Coach Prestige',
                   'Athletic Facilities'].includes(reason)
                ? `Transfer: ${reason} (${year})`
                : reason
                ? `${reason} (${year})`
                : `Left Team (${year})`
              return (
                <span
                  className="px-2 py-0.5 rounded-full text-xs font-bold"
                  style={{ backgroundColor: '#6b7280', color: '#ffffff' }}
                  title={portalReason ? `Reason: ${portalReason}` : undefined}
                >
                  {label}
                  {portalReason && reason === 'Encouraged Transfer' && (
                    <span className="font-semibold opacity-90"> · {portalReason}</span>
                  )}
                </span>
              )
            })()}
            {/* Finalized transfer (destination set) — reason chip alongside ← PREV */}
            {departureMovement && departureMovement.type === 'transfer' && departureMovement.to && departureMovement.reason && (
              <span
                className="px-2 py-0.5 rounded-full text-xs font-bold"
                style={{
                  backgroundColor: 'rgba(59, 130, 246, 0.15)',
                  color: '#60a5fa',
                  border: '1px solid rgba(59, 130, 246, 0.5)',
                }}
                title={`Transferred for: ${departureMovement.reason}`}
              >
                Transfer: {departureMovement.reason}
              </span>
            )}
            {/* Transfer badge - show where player transferred FROM */}
            {transferredFromTeam && (() => {
              // Show where the player transferred FROM (not previousTeam which is portal recruit origin)
              const teamsData = dynasty?.teams || dynasty?.customTeams
              const prevTeamName = getMascotName(transferredFromTeam, teamsData) || transferredFromTeam
              const prevTeamColors = getTeamColors(prevTeamName, teamsData) || { primary: '#4b5563', secondary: '#6b7280' }
              const prevTeamTextColor = getContrastTextColor(prevTeamColors.primary)
              // Get abbreviation from tid if needed
              const prevTeamAbbr = typeof transferredFromTeam === 'number'
                ? (teamsData?.[transferredFromTeam]?.abbr || getOriginalTeamAbbr(transferredFromTeam) || transferredFromTeam)
                : transferredFromTeam
              return (
                <Link
                  to={`${pathPrefix}/team/${resolveTid(transferredFromTeam, currentDynasty?.teams || TEAMS)}/${currentYear - 1}`}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold hover:opacity-80 transition-opacity"
                  style={{ backgroundColor: prevTeamColors.primary, color: prevTeamTextColor }}
                >
                  <span>←</span>
                  {getTeamLogo(prevTeamName, teamsData) && (
                    <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.95)', boxShadow: '0 0 0 1px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.2)', padding: '2px' }}>
                      <img src={getTeamLogo(prevTeamName, teamsData)} alt="" className="w-full h-full object-contain" />
                    </div>
                  )}
                  <span>{prevTeamAbbr}</span>
                </Link>
              )
            })()}
          </div>

          {recruitmentStrip}
        </div>

        {/* Action buttons row */}
        <div
          className="flex items-center justify-end gap-1 px-3 py-2 bg-surface-3"
        >
          {!isViewOnly && (
            <button
              onClick={() => navigate(`${pathPrefix}/player/${pid}/edit`)}
              className="p-2 rounded-lg hover:bg-surface-4 transition-colors text-txt-secondary"
              title="Edit Player"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Player Header - Desktop Layout */}
      <div className="hidden sm:block card overflow-hidden">
        <div className="h-[3px] w-full" style={{ backgroundColor: teamInfo.backgroundColor }} aria-hidden="true" />
        <div className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4 flex-1">
            {player.pictureUrl && (
              <img
                src={player.pictureUrl}
                alt={player.name}
                className="w-28 h-28 object-cover rounded-lg flex-shrink-0"
                style={{ border: `2px solid ${teamInfo.backgroundColor}` }}
                onError={(e) => { e.target.style.display = 'none' }}
              />
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <h1 className="text-3xl md:text-4xl font-black uppercase tracking-wide text-txt-primary" style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '2px' }}>
                  {player.name}
                </h1>
                {!isViewOnly && (
                  <button
                    onClick={() => navigate(`${pathPrefix}/player/${pid}/edit`)}
                    className="p-1.5 rounded-lg hover:bg-surface-4 transition-colors flex-shrink-0 text-txt-secondary"
                    title="Edit Player"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 mb-2">
                <Link
                  to={`${pathPrefix}/team/${resolveTid(teamAbbr, currentDynasty?.teams || TEAMS)}/${currentYear}`}
                  className="inline-flex items-center gap-2 text-base font-bold uppercase tracking-wider hover:underline text-txt-secondary"
                  style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '1.5px' }}
                >
                  {getTeamLogo(playerTeamName, dynasty?.teams || dynasty?.customTeams) && (
                    <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.95)', boxShadow: '0 0 0 1px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.2)', padding: '3px' }}>
                      <img src={getTeamLogo(playerTeamName, dynasty?.teams || dynasty?.customTeams)} alt="" className="w-full h-full object-contain" />
                    </div>
                  )}
                  {playerTeamName}
                </Link>
                {isUnenrolledRecruit && (
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-bold"
                    style={{ backgroundColor: `${teamInfo.backgroundColor}25`, color: teamInfo.backgroundColor, border: `1px solid ${teamInfo.backgroundColor}50` }}
                  >
                    Commitment
                  </span>
                )}
                {/* In-Portal badge — entered portal via Players Leaving, no
                    destination yet. Appears between offseason Week 1 and NSD. */}
                {departureMovement && departureMovement.type === 'transfer' && !departureMovement.to && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold uppercase"
                    style={{
                      backgroundColor: 'rgba(245, 158, 11, 0.15)',
                      color: '#fbbf24',
                      border: '1px solid rgba(245, 158, 11, 0.5)',
                      letterSpacing: '1px',
                    }}
                    title={`In transfer portal${departureMovement.year ? ` since ${departureMovement.year}` : ''}${departureMovement.reason ? ` — ${departureMovement.reason}` : ''}`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#fbbf24' }} aria-hidden="true" />
                    In Portal
                    {departureMovement.reason && (
                      <span className="font-semibold normal-case opacity-90 tracking-normal">· {departureMovement.reason}</span>
                    )}
                  </span>
                )}
                {/* Departure badge - show based on movements[] */}
                {departureMovement && departureMovement.type === 'departure' && (() => {
                  const reason = departureMovement.reason
                  const portalReason = departureMovement.portalReason
                  const year = departureMovement.year
                  const draftRound = departureMovement.extra?.draftRound || player.draftRound
                  const label = reason === 'Pro Draft' && draftRound
                    ? `${year} NFL Draft - Round ${draftRound}`
                    : reason === 'Pro Draft'
                    ? `${year} NFL Draft`
                    : reason === 'Graduating'
                    ? `Graduated (${year})`
                    : reason === 'Encouraged Transfer'
                    ? `Transferred (${year})`
                    : ['Playing Style', 'Proximity to Home', 'Championship Contender', 'Program Tradition',
                       'Campus Lifestyle', 'Stadium Atmosphere', 'Pro Potential', 'Brand Exposure',
                       'Academic Prestige', 'Conference Prestige', 'Coach Stability', 'Coach Prestige',
                       'Athletic Facilities'].includes(reason)
                    ? `Transfer: ${reason} (${year})`
                    : reason
                    ? `${reason} (${year})`
                    : `Left Team (${year})`
                  return (
                    <span
                      className="px-2 py-0.5 rounded-full text-xs font-bold"
                      style={{ backgroundColor: '#6b7280', color: '#ffffff' }}
                      title={portalReason ? `Reason: ${portalReason}` : undefined}
                    >
                      {label}
                      {portalReason && reason === 'Encouraged Transfer' && (
                        <span className="font-semibold opacity-90"> · {portalReason}</span>
                      )}
                    </span>
                  )
                })()}
                {/* Finalized transfer (destination set) — reason chip alongside ← PREV */}
                {departureMovement && departureMovement.type === 'transfer' && departureMovement.to && departureMovement.reason && (
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-bold"
                    style={{
                      backgroundColor: 'rgba(59, 130, 246, 0.15)',
                      color: '#60a5fa',
                      border: '1px solid rgba(59, 130, 246, 0.5)',
                    }}
                    title={`Transferred for: ${departureMovement.reason}`}
                  >
                    Transfer: {departureMovement.reason}
                  </span>
                )}
                {/* Transfer badge - show where player transferred FROM */}
                {transferredFromTeam && (() => {
                  // Show where the player transferred FROM (not previousTeam which is portal recruit origin)
                  const teamsData = dynasty?.teams || dynasty?.customTeams
                  const prevTeamName = getMascotName(transferredFromTeam, teamsData) || transferredFromTeam
                  const prevTeamColors = getTeamColors(prevTeamName, teamsData) || { primary: '#4b5563', secondary: '#6b7280' }
                  const prevTeamTextColor = getContrastTextColor(prevTeamColors.primary)
                  // Get abbreviation from tid if needed
                  const prevTeamAbbr = typeof transferredFromTeam === 'number'
                    ? (teamsData?.[transferredFromTeam]?.abbr || getOriginalTeamAbbr(transferredFromTeam) || transferredFromTeam)
                    : transferredFromTeam
                  return (
                    <Link
                      to={`${pathPrefix}/team/${resolveTid(transferredFromTeam, currentDynasty?.teams || TEAMS)}/${currentYear - 1}`}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold hover:opacity-80 transition-opacity"
                      style={{ backgroundColor: prevTeamColors.primary, color: prevTeamTextColor }}
                    >
                      <span>←</span>
                      {getTeamLogo(prevTeamName, teamsData) && (
                        <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.95)', boxShadow: '0 0 0 1px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.2)', padding: '2px' }}>
                          <img src={getTeamLogo(prevTeamName, teamsData)} alt="" className="w-full h-full object-contain" />
                        </div>
                      )}
                      <span>{prevTeamAbbr}</span>
                    </Link>
                  )
                })()}
              </div>

              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold uppercase tracking-widest text-txt-secondary" style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '1.5px' }}>
                {player.jerseyNumber != null && player.jerseyNumber !== '' && <span>#{player.jerseyNumber}</span>}
                {player.jerseyNumber != null && player.jerseyNumber !== '' && <span className="text-txt-muted">•</span>}
                <span>{player.position}</span>
                {player.archetype && <><span className="text-txt-muted">•</span><span className="normal-case">{player.archetype}</span></>}
                <span className="text-txt-muted">•</span>
                <span>{player.classByYear?.[dynasty?.currentYear] || player.year}</span>
                {(() => {
                  const dt = player.devTraitByYear?.[currentYear] || player.devTraitByYear?.[String(currentYear)] || player.devTrait
                  return dt ? <><span className="text-txt-muted">•</span><span>{dt}</span></> : null
                })()}
                {(player.height || player.weight) && (
                  <><span className="text-txt-muted">•</span><span className="normal-case">{player.height}{player.height && player.weight && ', '}{player.weight ? `${player.weight} lbs` : ''}</span></>
                )}
                {(player.hometown || player.state) && player.state && (
                  <>
                    <span className="text-txt-muted">•</span>
                    <Link
                      to={`${pathPrefix}/players/state/${player.state}`}
                      className="normal-case hover:underline text-txt-secondary"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {player.hometown}{player.hometown && player.state && ', '}{player.state}
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Overall Rating */}
          {(() => {
            const desktopOvr = player.overallByYear?.[currentYear] || player.overallByYear?.[String(currentYear)] || player.overall
            return desktopOvr ? (
              <div className="text-center flex-shrink-0">
                <div className="text-xs font-bold uppercase tracking-widest mb-1 text-txt-tertiary" style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '2px' }}>Overall</div>
                <button
                  onClick={() => setShowOverallProgressionModal(true)}
                  className="text-6xl md:text-7xl font-black hover:opacity-80 transition-opacity cursor-pointer text-txt-primary tabular"
                  style={{ fontFamily: "'Bebas Neue', sans-serif" }}
                  title="View overall progression"
                >
                  {desktopOvr}
                </button>
              </div>
            ) : (
              <div className="text-center flex-shrink-0">
                <div className="text-xs font-bold uppercase tracking-widest mb-1 text-txt-tertiary" style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '2px' }}>Overall</div>
                <div
                  className="text-6xl md:text-7xl font-black text-txt-muted"
                  style={{ fontFamily: "'Bebas Neue', sans-serif" }}
                >
                  —
                </div>
              </div>
            )
          })()}
        </div>
        {recruitmentStrip}
        </div>
      </div>

      {/* Award Plates — career honors summary (only render when the player has any) */}
      {awardPlates.length > 0 && (
        <div
          onClick={() => setActiveTab('awards')}
          className="flex flex-wrap gap-2 items-center cursor-pointer -mt-1 sm:-mt-2"
          title="View all awards"
        >
          {awardPlates.map((p, i) => {
            if (p.variant === 'gold') {
              return (
                <span
                  key={i}
                  className="px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider"
                  style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    letterSpacing: '1px',
                    backgroundColor: '#fbbf24',
                    color: '#78350f',
                    boxShadow: '0 0 0 1px rgba(251, 191, 36, 0.4), 0 2px 6px rgba(251, 191, 36, 0.25)',
                  }}
                >
                  {p.label}
                </span>
              )
            }
            if (p.variant === 'accent') {
              return (
                <span
                  key={i}
                  className="px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider text-txt-primary"
                  style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    letterSpacing: '1px',
                    backgroundColor: 'var(--surface-2)',
                    border: `1px solid ${teamInfo.backgroundColor}`,
                  }}
                >
                  {p.label}
                </span>
              )
            }
            return (
              <span
                key={i}
                className="px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider text-txt-secondary"
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  letterSpacing: '1px',
                  backgroundColor: 'var(--surface-2)',
                  border: '1px solid var(--surface-4)',
                }}
              >
                {p.label}
              </span>
            )
          })}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-6 border-b border-surface-4 overflow-x-auto">
        {[
          { key: 'overview', label: 'Overview' },
          { key: 'stats', label: 'Stats' },
          { key: 'gamelog', label: 'Game Log' },
          { key: 'timeline', label: 'Timeline' },
          { key: 'awards', label: 'Awards' },
          // The Card tab only appears once a front-of-card image has
          // been uploaded — most players won't have one, so we hide
          // the tab to avoid an empty placeholder.
          ...(player?.cardFront || player?.cardBack ? [{ key: 'card', label: 'Card' }] : []),
        ].map(tab => {
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="pb-3 pt-2 font-black uppercase tracking-wider transition-colors"
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                letterSpacing: '1px',
                fontSize: '0.85rem',
                color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
                borderBottom: isActive ? `2px solid ${teamInfo.backgroundColor}` : '2px solid transparent',
                marginBottom: '-1px',
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Overview - 3-column summary with inline scoring highlights */}
      {activeTab === 'overview' && (() => {
        const teamsByYear = player.teamsByYear || {}
        const timelineYears = Object.keys(teamsByYear).map(Number).sort((a, b) => b - a)
        const teamsData = dynasty?.teams || dynasty?.customTeams
        const recentGames = (playerGameLog || []).slice(0, 10)

        // Career totals across relevant categories
        const totals = yearByYearStats.reduce((acc, y) => {
          if (y.passing) {
            acc.passing.cmp += y.passing.cmp || 0
            acc.passing.att += y.passing.att || 0
            acc.passing.yds += y.passing.yds || 0
            acc.passing.td += y.passing.td || 0
            acc.passing.int += y.passing.int || 0
            acc.hasPassing = acc.hasPassing || y.passing.att > 0
          }
          if (y.rushing) {
            acc.rushing.car += y.rushing.car || 0
            acc.rushing.yds += y.rushing.yds || 0
            acc.rushing.td += y.rushing.td || 0
            acc.hasRushing = acc.hasRushing || y.rushing.car > 0
          }
          if (y.receiving) {
            acc.receiving.rec += y.receiving.rec || 0
            acc.receiving.yds += y.receiving.yds || 0
            acc.receiving.td += y.receiving.td || 0
            acc.hasReceiving = acc.hasReceiving || y.receiving.rec > 0
          }
          if (y.defensive) {
            acc.defense.tkl += (y.defensive.solo || 0) + (y.defensive.ast || 0)
            acc.defense.tfl += y.defensive.tfl || 0
            acc.defense.sacks += y.defensive.sacks || 0
            acc.defense.int += y.defensive.int || 0
            acc.defense.ff += y.defensive.ff || 0
            acc.hasDefense = acc.hasDefense || ((y.defensive.solo || 0) + (y.defensive.ast || 0)) > 0
          }
          if (y.kicking) {
            acc.kicking.fgm += y.kicking.fgm || 0
            acc.kicking.fga += y.kicking.fga || 0
            acc.kicking.xpm += y.kicking.xpm || 0
            acc.kicking.xpa += y.kicking.xpa || 0
            acc.hasKicking = acc.hasKicking || (y.kicking.fga > 0 || y.kicking.xpa > 0)
          }
          return acc
        }, {
          passing: { cmp: 0, att: 0, yds: 0, td: 0, int: 0 },
          rushing: { car: 0, yds: 0, td: 0 },
          receiving: { rec: 0, yds: 0, td: 0 },
          defense: { tkl: 0, tfl: 0, sacks: 0, int: 0, ff: 0 },
          kicking: { fgm: 0, fga: 0, xpm: 0, xpa: 0 },
          hasPassing: false, hasRushing: false, hasReceiving: false, hasDefense: false, hasKicking: false,
        })

        const sectionHeader = (label) => (
          <div className="px-4 py-2.5 bg-surface-2 border-b border-surface-4 border-l-[3px]" style={{ borderLeftColor: teamInfo.backgroundColor }}>
            <h3 className="text-sm font-black uppercase tracking-widest" style={{ color: 'var(--text-primary)', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '2px' }}>{label}</h3>
          </div>
        )

        const statRow = (label, value) => (
          <div className="flex items-baseline justify-between px-4 py-1.5 text-sm">
            <span style={{ color: secondaryText }} className="uppercase text-xs tracking-wider">{label}</span>
            <span className="font-bold tabular-nums" style={{ color: primaryText }}>{value}</span>
          </div>
        )

        return (
          <div className="flex flex-col gap-6">
            {/* 3-column layout: timeline | stats + video | game log.
                Flex lets each column size to its own content — no phantom
                row stretching when the game log is much taller than the
                other columns. Middle column uses display:contents on mobile
                so Stats / Video can be reordered individually relative to
                the other top-level items; on lg it becomes a proper flex
                column that keeps the video directly below stats. */}
            <div className="flex flex-col lg:flex-row lg:items-start gap-6 lg:gap-6 xl:gap-8">
              {/* LEFT — Timeline (condensed, with connecting line) */}
              <div className="card overflow-hidden order-4 lg:order-none w-full lg:w-[280px] lg:flex-shrink-0">
                {sectionHeader('Timeline')}
                {timelineYears.length === 0 ? (
                  <div className="px-4 py-4 text-sm" style={{ color: secondaryText }}>No timeline data</div>
                ) : (() => {
                  // Canonical timeline events — same derivation the full
                  // Timeline tab uses so labels/placement never diverge.
                  const timeline = buildTimelineEvents(player, {
                    resolveTid: (v) => resolveTid(v, teamsData || TEAMS),
                  })
                  const transitionForYear = (yr) => {
                    const e = eventsForYear(timeline, yr, 'before')[0]
                    return e ? labelForEventKind(e.kind) : null
                  }
                  const inYearEvent = (yr) => {
                    const e = eventsForYear(timeline, yr, 'after')[0]
                    return e ? labelForEventKind(e.kind) : null
                  }

                  // Newest first for the sidebar
                  const yearsDesc = [...timelineYears]
                  return (
                    <div className="px-4 py-3">
                      <ul className="space-y-3">
                        {yearsDesc.map(year => {
                          const tid = teamsByYear[year]
                          const teamData = teamsData?.[tid] || {}
                          const abbr = teamData.abbr || ''
                          const mascot = getMascotName(abbr, teamsData)
                          const logo = getTeamLogoByTid(tid, teamsData)
                          const cls = player.classByYear?.[year]
                          const ovr = player.overallByYear?.[year]
                          const pos = player.positionByYear?.[year] || player.position
                          const transition = transitionForYear(year)
                          const inYear = inYearEvent(year)
                          return (
                            <li key={year}>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold tabular-nums" style={{ color: primaryText }}>{year}</span>
                                {logo && <img src={logo} alt="" className="w-4 h-4 object-contain" />}
                                <span className="text-[11px] font-semibold truncate flex-1 min-w-0" style={{ color: primaryText }}>{abbr || mascot || '—'}</span>
                                {ovr != null && (
                                  <span className="text-[11px] font-bold tabular-nums flex-shrink-0" style={{ color: primaryText }}>{ovr}</span>
                                )}
                              </div>
                              <div className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: secondaryText }}>
                                {[cls, pos].filter(Boolean).join(' · ') || '—'}
                              </div>
                              {inYear && (
                                <div className="mt-1 inline-block text-[9px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded" style={{ color: secondaryText, backgroundColor: 'var(--bg-surface-3, #1c1c22)' }}>
                                  {inYear}
                                </div>
                              )}
                              {/* Transition event for this year (placement
                                  'before' = happened at end of the previous
                                  season / start of this one). In a desc list
                                  rendering it at the BOTTOM of this row puts
                                  it visually between this year and the year
                                  below — i.e. between the two seasons it
                                  actually happened between. */}
                              {transition && (
                                <div className="mt-2 inline-block text-[9px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded" style={{ color: secondaryText, backgroundColor: 'var(--bg-surface-3, #1c1c22)' }}>
                                  {transition}
                                </div>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )
                })()}
                <button
                  onClick={() => setActiveTab('timeline')}
                  className="w-full px-4 py-2.5 text-[11px] uppercase tracking-widest font-bold border-t border-surface-4 hover:bg-surface-3 transition-colors"
                  style={{ color: secondaryText, fontFamily: "'Bebas Neue', sans-serif" }}
                >
                  Full Timeline →
                </button>
              </div>

              {/* MIDDLE (col 2 on lg) — Career Stats + Video stacked via
                  flex column on desktop; on mobile they split out via the
                  `contents` trick so order classes on each child control
                  their individual position in the mobile stack. */}
              <div className="contents lg:flex lg:flex-col lg:flex-1 lg:min-w-0 lg:gap-6 lg:order-none">
              {/* Career Stats */}
              <div className="card overflow-hidden min-w-0 order-1 lg:order-none">
                {(() => {
                  const categories = [
                    { key: 'passing', label: 'Passing', has: totals.hasPassing,
                      columns: [
                        { k: 'cmpatt', label: 'CMP/ATT', get: y => `${y.passing?.cmp ?? 0}/${y.passing?.att ?? 0}` },
                        { k: 'yds', label: 'YDS', get: y => y.passing?.yds ?? 0, format: v => v.toLocaleString() },
                        { k: 'td', label: 'TD', get: y => y.passing?.td ?? 0 },
                        { k: 'int', label: 'INT', get: y => y.passing?.int ?? 0 },
                        { k: 'pct', label: 'PCT', get: y => y.passing?.att ? ((y.passing.cmp / y.passing.att) * 100).toFixed(1) : '-' },
                      ],
                      totalRow: [`${totals.passing.cmp}/${totals.passing.att}`, totals.passing.yds.toLocaleString(), totals.passing.td, totals.passing.int, totals.passing.att ? ((totals.passing.cmp / totals.passing.att) * 100).toFixed(1) : '-']
                    },
                    { key: 'rushing', label: 'Rushing', has: totals.hasRushing,
                      columns: [
                        { k: 'car', label: 'CAR', get: y => y.rushing?.car ?? 0 },
                        { k: 'yds', label: 'YDS', get: y => y.rushing?.yds ?? 0, format: v => v.toLocaleString() },
                        { k: 'avg', label: 'AVG', get: y => y.rushing?.car ? (y.rushing.yds / y.rushing.car).toFixed(1) : '-' },
                        { k: 'td', label: 'TD', get: y => y.rushing?.td ?? 0 },
                        { k: 'lng', label: 'LNG', get: y => y.rushing?.lng ?? 0 },
                      ],
                      totalRow: [totals.rushing.car, totals.rushing.yds.toLocaleString(), totals.rushing.car ? (totals.rushing.yds / totals.rushing.car).toFixed(1) : '-', totals.rushing.td, '-']
                    },
                    { key: 'receiving', label: 'Receiving', has: totals.hasReceiving,
                      columns: [
                        { k: 'rec', label: 'REC', get: y => y.receiving?.rec ?? 0 },
                        { k: 'yds', label: 'YDS', get: y => y.receiving?.yds ?? 0, format: v => v.toLocaleString() },
                        { k: 'avg', label: 'AVG', get: y => y.receiving?.rec ? (y.receiving.yds / y.receiving.rec).toFixed(1) : '-' },
                        { k: 'td', label: 'TD', get: y => y.receiving?.td ?? 0 },
                        { k: 'lng', label: 'LNG', get: y => y.receiving?.lng ?? 0 },
                      ],
                      totalRow: [totals.receiving.rec, totals.receiving.yds.toLocaleString(), totals.receiving.rec ? (totals.receiving.yds / totals.receiving.rec).toFixed(1) : '-', totals.receiving.td, '-']
                    },
                    { key: 'defense', label: 'Defense', has: totals.hasDefense,
                      columns: [
                        { k: 'tkl', label: 'TKL', get: y => (y.defensive?.solo ?? 0) + (y.defensive?.ast ?? 0) },
                        { k: 'tfl', label: 'TFL', get: y => y.defensive?.tfl ?? 0 },
                        { k: 'sck', label: 'SCK', get: y => y.defensive?.sacks ?? 0 },
                        { k: 'int', label: 'INT', get: y => y.defensive?.int ?? 0 },
                        { k: 'ff', label: 'FF', get: y => y.defensive?.ff ?? 0 },
                        { k: 'td', label: 'TD', get: y => y.defensive?.td ?? 0 },
                      ],
                      totalRow: [totals.defense.tkl, totals.defense.tfl, totals.defense.sacks, totals.defense.int, totals.defense.ff, '-']
                    },
                    { key: 'kicking', label: 'Kicking', has: totals.hasKicking,
                      columns: [
                        { k: 'fgm', label: 'FGM', get: y => y.kicking?.fgm ?? 0 },
                        { k: 'fga', label: 'FGA', get: y => y.kicking?.fga ?? 0 },
                        { k: 'fgpct', label: 'FG%', get: y => y.kicking?.fga ? ((y.kicking.fgm / y.kicking.fga) * 100).toFixed(1) : '-' },
                        { k: 'xpm', label: 'XPM', get: y => y.kicking?.xpm ?? 0 },
                        { k: 'xpa', label: 'XPA', get: y => y.kicking?.xpa ?? 0 },
                        { k: 'lng', label: 'LNG', get: y => y.kicking?.lng ?? 0 },
                      ],
                      totalRow: [totals.kicking.fgm, totals.kicking.fga, totals.kicking.fga ? ((totals.kicking.fgm / totals.kicking.fga) * 100).toFixed(1) : '-', totals.kicking.xpm, totals.kicking.xpa, '-']
                    },
                  ].filter(c => c.has)

                  // Sort the visible category tabs so the player's
                  // primary role appears first (a WR opens to
                  // Receiving, a QB to Passing, an EDGE to Defense,
                  // a kicker to Kicking, etc.). Categories not in
                  // the position's priority list keep their existing
                  // order at the end.
                  const POSITION_TAB_ORDER = {
                    QB:   ['passing', 'rushing', 'receiving', 'defense', 'kicking'],
                    HB:   ['rushing', 'receiving', 'passing', 'defense', 'kicking'],
                    FB:   ['rushing', 'receiving', 'passing', 'defense', 'kicking'],
                    RB:   ['rushing', 'receiving', 'passing', 'defense', 'kicking'],
                    WR:   ['receiving', 'rushing', 'passing', 'defense', 'kicking'],
                    TE:   ['receiving', 'rushing', 'passing', 'defense', 'kicking'],
                  }
                  const DEFENSIVE_POSITIONS = new Set([
                    'LEDG','REDG','DT','DE','DL','NT',
                    'SAM','MIKE','WILL','OLB','MLB','ILB','LB',
                    'CB','FS','SS','S','DB',
                  ])
                  const KICK_POSITIONS = new Set(['K', 'P'])
                  const playerPos = (player?.position || '').toUpperCase()
                  const tabOrder =
                    POSITION_TAB_ORDER[playerPos]
                    || (DEFENSIVE_POSITIONS.has(playerPos) ? ['defense', 'rushing', 'receiving', 'passing', 'kicking'] : null)
                    || (KICK_POSITIONS.has(playerPos) ? ['kicking', 'passing', 'rushing', 'receiving', 'defense'] : null)
                    || ['passing', 'rushing', 'receiving', 'defense', 'kicking']

                  categories.sort((a, b) => {
                    const ai = tabOrder.indexOf(a.key)
                    const bi = tabOrder.indexOf(b.key)
                    if (ai === -1 && bi === -1) return 0
                    if (ai === -1) return 1
                    if (bi === -1) return -1
                    return ai - bi
                  })

                  if (categories.length === 0) {
                    return (
                      <>
                        {sectionHeader('Career Stats')}
                        <div className="px-4 py-6 text-sm text-center" style={{ color: secondaryText }}>No recorded stats</div>
                      </>
                    )
                  }

                  const activeKey = categories.find(c => c.key === overviewStatTab)?.key || categories[0].key
                  const active = categories.find(c => c.key === activeKey)
                  const rowsForCategory = yearByYearStats.filter(y => {
                    if (active.key === 'passing') return y.passing && y.passing.att > 0
                    if (active.key === 'rushing') return y.rushing && y.rushing.car > 0
                    if (active.key === 'receiving') return y.receiving && y.receiving.rec > 0
                    if (active.key === 'defense') return y.defensive && ((y.defensive.solo || 0) + (y.defensive.ast || 0)) > 0
                    if (active.key === 'kicking') return y.kicking && (y.kicking.fga > 0 || y.kicking.xpa > 0)
                    return false
                  })

                  return (
                    <>
                      {sectionHeader('Career Stats')}
                      <div className="flex border-b border-surface-4 overflow-x-auto">
                        {categories.map(cat => {
                          const isActive = cat.key === activeKey
                          return (
                            <button
                              key={cat.key}
                              onClick={() => setOverviewStatTab(cat.key)}
                              className="px-4 py-2 text-[11px] uppercase tracking-widest font-bold transition-colors flex-shrink-0"
                              style={{
                                fontFamily: "'Bebas Neue', sans-serif",
                                letterSpacing: '1.5px',
                                color: isActive ? primaryText : secondaryText,
                                borderBottom: isActive ? `2px solid ${teamInfo.backgroundColor}` : '2px solid transparent',
                                marginBottom: '-1px',
                              }}
                            >
                              {cat.label}
                            </button>
                          )
                        })}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-surface-3">
                              <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider" style={{ color: secondaryText, opacity: 0.8 }}>Year</th>
                              {active.columns.map(col => (
                                <th key={col.k} className="px-2 py-2 text-right font-semibold uppercase tracking-wider" style={{ color: secondaryText, opacity: 0.8 }}>{col.label}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {rowsForCategory.map((y, idx) => (
                              <tr key={y.year} className={idx % 2 ? '' : 'bg-surface-2/40'}>
                                <td className="px-3 py-2 font-bold tabular-nums" style={{ color: primaryText }}>{y.year}</td>
                                {active.columns.map(col => {
                                  const v = col.get(y)
                                  return (
                                    <td key={col.k} className="px-2 py-2 text-right tabular-nums" style={{ color: primaryText }}>
                                      {col.format ? col.format(v) : v}
                                    </td>
                                  )
                                })}
                              </tr>
                            ))}
                            {rowsForCategory.length > 1 && (
                              <tr className="bg-surface-3 border-t-2" style={{ borderTopColor: teamInfo.backgroundColor }}>
                                <td className="px-3 py-2 font-black uppercase text-[11px] tracking-wider" style={{ color: primaryText, fontFamily: "'Bebas Neue', sans-serif" }}>Career</td>
                                {active.totalRow.map((v, i) => (
                                  <td key={i} className="px-2 py-2 text-right font-bold tabular-nums" style={{ color: primaryText }}>{v}</td>
                                ))}
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )
                })()}
                <button
                  onClick={() => setActiveTab('stats')}
                  className="w-full px-4 py-2.5 text-[11px] uppercase tracking-widest font-bold border-t border-surface-4 hover:bg-surface-3 transition-colors"
                  style={{ color: secondaryText, fontFamily: "'Bebas Neue', sans-serif" }}
                >
                  Full Stats →
                </button>
              </div>

              {/* Scoring highlights. Expand opens the full modal seeked
                  forward by the seconds elapsed in the inline clip so
                  playback "resumes" instead of restarting. */}
              {allPlayerScoringPlays.length > 0 && (
                <div className="min-w-0 order-3 lg:order-none">
                  <InlineScoringHighlights
                    scoringPlays={allPlayerScoringPlays}
                    startIndex={randomScoringStartIndex}
                    onExpand={(idx, elapsed) => {
                      setSelectedGameScoringPlays({
                        plays: allPlayerScoringPlays,
                        opponent: 'All Games',
                        startIndex: idx,
                        resumeOffsetSec: elapsed,
                      })
                      setShowScoringHighlightsModal(true)
                    }}
                  />
                </div>
              )}
              </div>

              {/* RIGHT — Recent Game Log */}
              <div className="card overflow-hidden order-2 lg:order-none w-full lg:w-[340px] lg:flex-shrink-0">
                {sectionHeader('Recent Games')}
                {recentGames.length === 0 ? (
                  <div className="px-4 py-4 text-sm" style={{ color: secondaryText }}>No game log data</div>
                ) : (
                  <div className="divide-y divide-surface-4">
                    {recentGames.map((entry, idx) => {
                      const { game, stats } = entry
                      const gameId = game.gameId || game.gid || game.id
                      const locationPrefix = game.location === 'neutral' ? 'vs' : (game.location === 'home' ? 'vs' : '@')
                      const isWin = game.result === 'W'
                      const isLoss = game.result === 'L'
                      const resultBg = isWin ? 'rgba(16, 185, 129, 0.12)' : isLoss ? 'rgba(239, 68, 68, 0.12)' : 'transparent'
                      const resultColor = isWin ? '#10b981' : isLoss ? '#ef4444' : secondaryText
                      const oppLogo = game.opponentTid ? getTeamLogoByTid(game.opponentTid, dynasty.teams) : null
                      let statDisplay = ''
                      if (stats?.category === 'passing') {
                        const c = stats.comp ?? stats.cmp ?? stats.completions ?? 0
                        const a = stats.att ?? stats.attempts ?? stats.passAttempts ?? 0
                        const yds = stats.yards ?? stats.yds ?? stats.passYards ?? 0
                        const td = stats.tD ?? stats.td ?? stats.passTD ?? 0
                        statDisplay = `${c}/${a}, ${yds} yds, ${td} TD`
                      } else if (stats?.category === 'rushing') {
                        statDisplay = `${stats.carries ?? stats.car ?? 0} car, ${stats.yards ?? stats.yds ?? 0} yds, ${stats.tD ?? stats.td ?? 0} TD`
                      } else if (stats?.category === 'receiving') {
                        statDisplay = `${stats.receptions ?? stats.rec ?? 0} rec, ${stats.yards ?? stats.yds ?? 0} yds, ${stats.tD ?? stats.td ?? 0} TD`
                      } else if (stats?.category === 'defense') {
                        const tkl = (stats.solo ?? 0) + (stats.assists ?? 0)
                        const parts = []
                        if (tkl > 0) parts.push(`${tkl} tkl`)
                        if ((stats.sack ?? 0) > 0) parts.push(`${stats.sack} sck`)
                        if ((stats.iNT ?? 0) > 0) parts.push(`${stats.iNT} INT`)
                        statDisplay = parts.join(', ')
                      } else if (stats?.category === 'kicking') {
                        statDisplay = `${stats.fGM ?? 0}/${stats.fGA ?? 0} FG, ${stats.xPM ?? 0}/${stats.xPA ?? 0} XP`
                      }
                      const RowWrap = gameId ? Link : 'div'
                      const rowProps = gameId ? { to: `${pathPrefix}/game/${gameId}` } : {}
                      return (
                        <RowWrap key={idx} {...rowProps} className="block px-4 py-3 hover:bg-surface-2/60 transition-colors cursor-pointer">
                          <div className="flex items-center gap-3">
                            {/* Date / week column */}
                            <div className="flex-shrink-0 w-12 text-center">
                              <div className="text-[11px] font-bold tabular-nums" style={{ color: primaryText }}>{game.year}</div>
                              <div className="text-[10px] uppercase tracking-wider tabular-nums" style={{ color: secondaryText }}>W{game.week ?? '-'}</div>
                            </div>
                            {/* Opponent */}
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              {oppLogo && <img src={oppLogo} alt="" className="w-6 h-6 object-contain flex-shrink-0" />}
                              <div className="min-w-0">
                                <div className="text-[11px] uppercase tracking-wider" style={{ color: secondaryText }}>{locationPrefix}</div>
                                <div className="text-sm font-bold truncate" style={{ color: primaryText }}>{game.opponent || '—'}</div>
                              </div>
                            </div>
                            {/* Result pill */}
                            <div className="flex-shrink-0 flex items-center gap-2">
                              <div className="text-right">
                                <div className="text-xs font-bold tabular-nums" style={{ color: resultColor }}>
                                  {game.result || '—'} {game.teamScore != null && game.opponentScore != null ? `${game.teamScore}-${game.opponentScore}` : ''}
                                </div>
                              </div>
                            </div>
                          </div>
                          {statDisplay && (
                            <div
                              className="text-[11px] mt-2 px-2 py-1 rounded"
                              style={{ color: primaryText, backgroundColor: resultBg }}
                            >
                              {statDisplay}
                            </div>
                          )}
                        </RowWrap>
                      )
                    })}
                  </div>
                )}
                <button
                  onClick={() => setActiveTab('gamelog')}
                  className="w-full px-4 py-2.5 text-[11px] uppercase tracking-widest font-bold border-t border-surface-4 hover:bg-surface-3 transition-colors"
                  style={{ color: secondaryText, fontFamily: "'Bebas Neue', sans-serif" }}
                >
                  Full Game Log →
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Career Timeline - Built from teamsByYear (source of truth) with movements for context */}
      {activeTab === 'timeline' && (() => {
        // Build timeline from teamsByYear as source of truth
        const teamsByYear = player.teamsByYear || {}
        const years = Object.keys(teamsByYear).map(Number).sort((a, b) => a - b)
        if (years.length === 0) return null

        const teamsData = dynasty?.teams || dynasty?.customTeams

        // Get movements for additional context - merge legacy movements[] with movementByYear
        const movements = player.movements || []
        const movementsByYear = {}
        movements.forEach(m => {
          if (!movementsByYear[m.year]) movementsByYear[m.year] = []
          movementsByYear[m.year].push(m)
        })

        // Also inject events from movementByYear (source of truth) if not already present
        const mby = player.movementByYear || {}
        // Helper: find the next recorded year after yr, to infer portal outcome (same team = recommit, different = transfer out)
        const findNextYear = (yr) => {
          const laterYears = years.filter(y => y > yr).sort((a, b) => a - b)
          return laterYears[0] ?? null
        }
        Object.entries(mby).forEach(([y, m]) => {
          if (!m?.type) return
          const yr = Number(y)
          if (isNaN(yr)) return
          if (!movementsByYear[yr]) movementsByYear[yr] = []
          // Unified 'entered_portal' — infer recommit vs transfer from the next year's team
          if (m.type === 'entered_portal') {
            const thisTeam = teamsByYear[yr]
            const nextYr = findNextYear(yr)
            const nextTeam = nextYr != null ? teamsByYear[nextYr] : null
            const recommitted = nextTeam != null && Number(nextTeam) === Number(thisTeam)
            if (!movementsByYear[yr].some(e => e.type === 'entered_portal')) {
              movementsByYear[yr].push({ year: yr, type: 'entered_portal', from: thisTeam, reason: m.reason })
            }
            if (recommitted && !movementsByYear[yr].some(e => e.type === 'recommit')) {
              movementsByYear[yr].push({ year: yr, type: 'recommit', to: thisTeam, reason: m.reason })
            }
          } else if (m.type === 'recommitted') {
            // Legacy: entered portal but came back
            if (!movementsByYear[yr].some(e => e.type === 'entered_portal')) {
              movementsByYear[yr].push({ year: yr, type: 'entered_portal', from: teamsByYear[yr], reason: m.reason })
            }
            if (!movementsByYear[yr].some(e => e.type === 'recommit')) {
              movementsByYear[yr].push({ year: yr, type: 'recommit', to: teamsByYear[yr], reason: m.reason })
            }
          } else if (m.type === 'transferred_out') {
            // Legacy: transferred out via portal
            if (!movementsByYear[yr].some(e => e.type === 'entered_portal' || e.type === 'transfer' || e.type === 'departure')) {
              movementsByYear[yr].push({ year: yr, type: 'entered_portal', from: teamsByYear[yr], reason: m.reason })
            }
          } else if (m.type === 'encouraged_to_transfer') {
            if (!movementsByYear[yr].some(e => e.type === 'encouraged_transfer')) {
              movementsByYear[yr].push({ year: yr, type: 'encouraged_transfer', from: teamsByYear[yr], reason: m.reason })
            }
          } else if (m.type === 'graduated') {
            if (!movementsByYear[yr].some(e => e.type === 'departure' && e.reason === 'Graduated')) {
              movementsByYear[yr].push({ year: yr, type: 'departure', reason: 'Graduated' })
            }
          } else if (m.type === 'declared_for_draft') {
            if (!movementsByYear[yr].some(e => e.type === 'departure' && e.reason?.includes('Draft'))) {
              movementsByYear[yr].push({ year: yr, type: 'departure', reason: 'Pro Draft' })
            }
          }
        })

        // Build a standalone recruitment node when we have class-ranking data.
        // Before: recruitment was folded into the FR year as a sub-tag.
        // Now: it's its own row on the timeline, sitting above the FR year.
        // Only show a "Committed" recruitment node when the recruit year actually
        // precedes (or matches) the player's first recorded season. If the stored
        // recruitYear lands AFTER the first teamsByYear entry, the player was
        // already on the roster before their "commitment" — that's stale/bogus
        // data (e.g., player was on the team before the dynasty began) and the
        // node would just confuse the timeline.
        const earliestRosterYear = years[0]
        const recruitYearValid = (() => {
          const ry = Number(player.recruitYear)
          if (!Number.isFinite(ry)) return true
          if (!Number.isFinite(earliestRosterYear)) return true
          return ry <= earliestRosterYear
        })()
        const hasRecruitNodeData = !!(recruitmentInfo || player.recruitYear) && recruitYearValid
        const recruitmentNode = hasRecruitNodeData ? (() => {
          const rYear = Number(player.recruitYear) || years[0]
          const rTeam = player.teamsByYear?.[rYear] || teamsByYear[years[0]]
          const rTeamName = getMascotName(rTeam, teamsData)
          const rSchool = getSchoolName(rTeam, teamsData)
          const rLogo = rTeamName ? getTeamLogo(rTeamName, teamsData) : null
          const rColors = rTeamName ? getTeamColors(rTeamName, teamsData) : null
          const rTid = resolveTid(rTeam, teamsData || TEAMS)
          return {
            year: rYear,
            team: rTeam,
            teamName: rTeamName,
            school: rSchool,
            logo: rLogo,
            color: rColors?.primary || teamInfo.backgroundColor,
            tid: rTid,
            stars: Number(recruitmentInfo?.stars) || 0,
            nationalRank: Number(recruitmentInfo?.nationalRank) || 0,
            positionRank: Number(recruitmentInfo?.positionRank) || 0,
            stateRank: Number(recruitmentInfo?.stateRank) || 0,
            state: recruitmentInfo?.state || player.state,
            hometown: player.hometown,
            // The recruit node represents the player's FIRST stint — we label it "Portal Entry"
            // only when the prior team (`previousTeam`) is a school the player never had a
            // season at. If `previousTeam` is already in teamsByYear, it refers to a later
            // portal move (e.g. Wisconsin → Kentucky) and must not retroactively relabel the
            // HS signing to Wisconsin.
            isPortal: (() => {
              const prev = recruitmentInfo?.previousTeam
              if (!prev) return false
              const prevTid = resolveTid(prev, teamsData || TEAMS)
              if (prevTid == null) return false
              const historyTids = Object.values(teamsByYear)
                .map(t => resolveTid(t, teamsData || TEAMS))
                .filter(t => t != null)
                .map(Number)
              return !historyTids.includes(Number(prevTid))
            })(),
            gemBust: recruitmentInfo?.gemBust,
            previousTeam: recruitmentInfo?.previousTeam
          }
        })() : null

        // Build timeline entries (same logic as before)
        const timelineEntries = []
        let prevTeam = null

        years.forEach((year, idx) => {
          const team = teamsByYear[year]
          const yearMovements = movementsByYear[year] || []

          if (idx === 0) {
            const joinMovement = yearMovements.find(m =>
              m.type === 'recruited' || m.type === 'portal_in' || m.type === 'added'
            )
            if (joinMovement) {
              // Skip the join movement when the standalone recruitment node already represents
              // the entry — prevents "PORTAL ENTRY → KENTUCKY" node plus a duplicate
              // "PORTAL TRANSFER Washington State → Kentucky" chip on the first season row.
              if (!recruitmentNode) {
                const fromTeam = joinMovement.from || null
                timelineEntries.push({ ...joinMovement, team, from: fromTeam })
              }
            } else {
              let joinType = null
              let fromTeam = null
              // The global `player.isPortal` flag can get dirtied by a LATER
              // portal event (recommit or transfer after the player's first
              // season). Before trusting it as a year-0 join indicator, check
              // that (a) no movementByYear entries exist at a later year
              // referencing portal activity, AND (b) the stored previousTeam
              // actually differs from the first-season team.
              if (player.isPortal) {
                const fromRef = player.previousTeam || null
                const fromTid = fromRef ? resolveTid(fromRef, teamsData || TEAMS) : null
                const teamTid = resolveTid(team, teamsData || TEAMS)
                const isSameAsFirstTeam = fromTid != null && teamTid != null && Number(fromTid) === Number(teamTid)
                const hasLaterPortalEvent = Object.entries(player.movementByYear || {}).some(([yStr, m]) => {
                  const yr = Number(yStr)
                  if (!Number.isFinite(yr) || yr <= year) return false
                  const t = m?.type
                  return t === 'entered_portal' || t === 'transferred_out' || t === 'transfer' || t === 'recommitted' || t === 'recommit'
                })
                if (!isSameAsFirstTeam && !hasLaterPortalEvent) {
                  joinType = 'portal_in'
                  fromTeam = fromRef
                }
              }
              if (!joinType && (player.year?.startsWith('JUCO') || player.classByYear?.[year]?.startsWith('JUCO'))) { joinType = 'juco_in' }
              // Only emit a "recruited" join tag when the editor's entryReason
              // says so. A player marked "Created" (or "Walk-On"/"Transferred
              // In") shouldn't show a green RECRUITED dot on their first
              // season just because they have stars in their profile.
              else if (!joinType && !recruitmentNode && player.entryReason === 'recruited' && (player.stars || player.nationalRank || player.recruitYear)) { joinType = 'recruited' }
              // Explicit "transfer_in" entryReason produces a portal_in row
              // (unless we already have richer movement data).
              else if (!joinType && player.entryReason === 'transfer_in' && player.previousTeam) { joinType = 'portal_in'; fromTeam = player.previousTeam }
              else if (!joinType && player.entryReason === 'juco_in') { joinType = 'juco_in' }
              if (joinType && !recruitmentNode) {
                timelineEntries.push({ year, type: joinType, team, to: team, from: fromTeam })
              }
            }
          } else if (team !== prevTeam && prevTeam) {
            const transferMovement = yearMovements.find(m => m.type === 'transfer' || m.type === 'portal_in')
            if (transferMovement) {
              const fromTeam = transferMovement.from || prevTeam
              timelineEntries.push({ ...transferMovement, team, from: fromTeam })
            } else {
              timelineEntries.push({ year, type: 'transfer', from: prevTeam, to: team, team })
            }
          }

          yearMovements.forEach(m => {
            if (m.type === 'entered_portal' || m.type === 'recommit' || m.type === 'departure') {
              if (!timelineEntries.some(e => e.year === m.year && e.type === m.type)) {
                timelineEntries.push({ ...m, team })
              }
            }
          })

          prevTeam = team
        })

        // After-last-year movements
        const lastYear = years[years.length - 1]
        const lastTeam = teamsByYear[lastYear]
        movements.filter(m => m.year > lastYear && (m.type === 'departure' || m.type === 'transfer'))
          .forEach(m => timelineEntries.push(m))

        // Check encouraged transfers
        const nextYear = lastYear + 1
        const encouragedTransfers = getEncourageTransfers(dynasty, lastTeam, nextYear)
        const wasEncouragedTransfer = encouragedTransfers.some(t =>
          t.name?.toLowerCase().trim() === player.name?.toLowerCase().trim()
        )
        if (wasEncouragedTransfer && !timelineEntries.some(e => e.type === 'encouraged_transfer' && e.year === lastYear)) {
          timelineEntries.push({ year: lastYear, type: 'encouraged_transfer', from: lastTeam })
        }

        timelineEntries.sort((a, b) => a.year - b.year)

        // Detect recommit scenarios
        const teamsSeenBefore = new Set()
        timelineEntries.forEach((entry, idx) => {
          if (idx > 0) {
            timelineEntries.slice(0, idx).forEach(prev => {
              if (prev.team) teamsSeenBefore.add(prev.team)
              if (prev.to) teamsSeenBefore.add(prev.to)
            })
          }
          if (entry.type === 'portal_in' && entry.to) {
            const toTid = typeof entry.to === 'number' ? entry.to : getTidFromAbbr(entry.to, dynasty)
            if (Array.from(teamsSeenBefore).some(t => (typeof t === 'number' ? t : getTidFromAbbr(t, dynasty)) === toTid)) {
              entry.isRecommit = true
            }
          }
        })

        const getMovementLabel = (m) => {
          if (m.type === 'portal_in' && m.isRecommit) return 'Recommitted'
          switch (m.type) {
            case 'recruited': return 'Recruited'
            case 'portal_in': return 'Portal Transfer'
            case 'juco_in': return 'JUCO Transfer'
            case 'entered_portal': return 'Entered Portal'
            case 'transfer': return 'Transferred'
            case 'encouraged_transfer': return 'Encouraged Transfer'
            case 'departure': return m.reason || 'Left Team'
            case 'recommit': return 'Recommitted'
            case 'added': return 'Added'
            case 'removed': return 'Removed'
            case 'started': return 'Started'
            default: return m.type
          }
        }

        const getMovementColor = (type) => {
          switch (type) {
            case 'recruited': case 'added': case 'started': return '#22c55e'
            case 'portal_in': case 'juco_in': case 'transfer': return '#3b82f6'
            case 'entered_portal': case 'encouraged_transfer': return '#f59e0b'
            case 'departure': case 'removed': return '#ef4444'
            case 'recommit': return '#8b5cf6'
            default: return '#6b7280'
          }
        }

        // Build year-by-year data. Do NOT fall back to player.year / player.overall
        // / player.devTrait for historical years — those are "current year"
        // values and using them here would stamp every unspecified prior year
        // with the current-year snapshot. That caused the timeline to label
        // 2030 as "Senior" (current class = Sr) when the editor had it blank.
        // Current year is a special case handled separately below.
        const currentYearVal = dynasty?.currentYear
        const yearData = years.map(year => {
          const isCurrentYr = Number(year) === Number(currentYearVal)
          return {
            year,
            team: teamsByYear[year],
            playerClass: player.classByYear?.[year] || player.classByYear?.[String(year)]
              || (isCurrentYr ? player.year : null),
            overall: player.overallByYear?.[year] || player.overallByYear?.[String(year)]
              || (isCurrentYr ? player.overall : null),
            devTrait: player.devTraitByYear?.[year] || player.devTraitByYear?.[String(year)]
              || (isCurrentYr ? player.devTrait : null),
            stats: player.statsByYear?.[year] || player.statsByYear?.[String(year)] || null,
            movements: timelineEntries.filter(e => e.year === year),
          }
        })

        const getOverallColor = (ovr) => {
          if (!ovr) return '#9ca3af'
          if (ovr >= 85) return '#22c55e'
          if (ovr >= 75) return '#3b82f6'
          if (ovr >= 65) return '#f59e0b'
          return '#ef4444'
        }

        // Helper: quick-hitter stat chips for a year — games played + position-relevant highlights.
        // Uses the real statsByYear shape: { gamesPlayed, passing:{...}, rushing:{...}, receiving:{...}, defense:{...}, kicking:{...}, punting:{...} }
        const fmtNum = (n) => {
          const v = Number(n) || 0
          return v >= 1000 ? v.toLocaleString() : String(v)
        }
        const getQuickStatChips = (stats, position) => {
          if (!stats) return []
          const chips = []
          const gp = Number(stats.gamesPlayed) || 0
          if (gp > 0) chips.push({ value: gp, label: 'G' })

          const hasPassingRecord = stats.passing && (stats.passing.yds || stats.passing.td || stats.passing.att)
          const hasRushingRecord = stats.rushing && (stats.rushing.yds || stats.rushing.td || stats.rushing.car)
          const hasReceivingRecord = stats.receiving && (stats.receiving.yds || stats.receiving.td || stats.receiving.rec)
          const hasDefenseRecord = stats.defense && (stats.defense.tkl || stats.defense.tackles || stats.defense.sacks || stats.defense.int || stats.defense.ints)
          const hasKickingRecord = stats.kicking && (stats.kicking.fga || stats.kicking.fgm)
          const hasPuntingRecord = stats.punting && (stats.punting.punts || stats.punting.yds)

          const primary = getPrimaryStatCategory(position)
          const addPassing = () => {
            const p = stats.passing || {}
            chips.push({ value: fmtNum(p.yds), label: 'PASS YDS' })
            chips.push({ value: Number(p.td) || 0, label: 'PASS TD' })
            if (p.int) chips.push({ value: p.int, label: 'INT' })
          }
          const addRushing = () => {
            const r = stats.rushing || {}
            chips.push({ value: fmtNum(r.yds), label: 'RUSH YDS' })
            chips.push({ value: Number(r.td) || 0, label: 'RUSH TD' })
          }
          const addReceiving = () => {
            const r = stats.receiving || {}
            chips.push({ value: Number(r.rec) || 0, label: 'REC' })
            chips.push({ value: fmtNum(r.yds), label: 'REC YDS' })
            chips.push({ value: Number(r.td) || 0, label: 'REC TD' })
          }
          const addDefense = () => {
            const d = stats.defense || {}
            const tkl = Number(d.tkl ?? d.tackles) || 0
            if (tkl) chips.push({ value: tkl, label: 'TKL' })
            if (d.sacks) chips.push({ value: d.sacks, label: 'SACK' })
            const ints = Number(d.int ?? d.ints) || 0
            if (ints) chips.push({ value: ints, label: 'INT' })
            if (d.ff) chips.push({ value: d.ff, label: 'FF' })
          }
          const addKicking = () => {
            const k = stats.kicking || {}
            if (k.fga || k.fgm) chips.push({ value: `${k.fgm || 0}/${k.fga || 0}`, label: 'FG' })
            if (k.long || k.lng) chips.push({ value: k.long || k.lng, label: 'LNG' })
          }
          const addPunting = () => {
            const p = stats.punting || {}
            if (p.punts) chips.push({ value: p.punts, label: 'PUNTS' })
            const avg = p.avg || (p.punts ? Math.round((p.yds || 0) / p.punts * 10) / 10 : null)
            if (avg) chips.push({ value: avg, label: 'AVG' })
          }

          if (primary === 'passing' && hasPassingRecord) addPassing()
          else if (primary === 'rushing' && hasRushingRecord) addRushing()
          else if (primary === 'receiving' && hasReceivingRecord) addReceiving()
          else if (primary === 'defense' && hasDefenseRecord) addDefense()
          else if (primary === 'kicking' && hasKickingRecord) addKicking()
          else if (primary === 'punting' && hasPuntingRecord) addPunting()
          else {
            // Fallback: show whichever category has a record
            if (hasPassingRecord) addPassing()
            else if (hasRushingRecord) addRushing()
            else if (hasReceivingRecord) addReceiving()
            else if (hasDefenseRecord) addDefense()
            else if (hasKickingRecord) addKicking()
            else if (hasPuntingRecord) addPunting()
          }

          // Dual-threat: QB who rushed for 300+ or RB who caught for 200+
          if (primary === 'passing' && hasRushingRecord && (Number(stats.rushing?.yds) || 0) >= 200) {
            chips.push({ value: fmtNum(stats.rushing.yds), label: 'RUSH YDS' })
            if (stats.rushing.td) chips.push({ value: stats.rushing.td, label: 'RUSH TD' })
          }
          if (primary === 'rushing' && hasReceivingRecord && (Number(stats.receiving?.yds) || 0) >= 150) {
            chips.push({ value: Number(stats.receiving.rec) || 0, label: 'REC' })
            chips.push({ value: fmtNum(stats.receiving.yds), label: 'REC YDS' })
          }

          return chips
        }

        const sameTid = (a, b) => {
          if (a == null || b == null) return false
          const ta = typeof a === 'number' ? a : resolveTid(a, teamsData || TEAMS)
          const tb = typeof b === 'number' ? b : resolveTid(b, teamsData || TEAMS)
          return ta != null && tb != null && Number(ta) === Number(tb)
        }

        const renderMovementDetail = (m, rowTeam, label) => {
          const fromName = m.from ? getSchoolName(m.from, teamsData) : null
          const toName = m.to ? getSchoolName(m.to, teamsData) : null
          const fromLogo = m.from ? (() => { const fn = getMascotName(m.from, teamsData); return fn ? getTeamLogo(fn, teamsData) : null })() : null
          const toLogo = m.to ? (() => { const fn = getMascotName(m.to, teamsData); return fn ? getTeamLogo(fn, teamsData) : null })() : null

          // Hide team references already implicit from the row context (row team = dest team / from team)
          const hideTo = sameTid(m.to, rowTeam)
          const hideFrom = sameTid(m.from, rowTeam)

          // Deduplicate the italic reason when it already matches the big label (e.g. "GRADUATING · Graduating")
          const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z]/g, '')
          const labelNorm = normalize(label)
          const reasonNorm = normalize(m.reason)
          const showReason = m.reason &&
            (m.type === 'entered_portal' || m.type === 'encouraged_transfer' || m.type === 'recommit' || m.type === 'departure') &&
            reasonNorm && reasonNorm !== labelNorm &&
            !labelNorm.includes(reasonNorm) && !reasonNorm.includes(labelNorm)

          return (
            <span className="flex flex-wrap items-center gap-1 text-txt-secondary">
              {(m.type === 'portal_in' || m.type === 'juco_in' || m.type === 'transfer') && fromName && toName && !hideTo && (
                <>
                  {fromLogo && <img src={fromLogo} alt="" className="w-3.5 h-3.5 object-contain" />}
                  <span>{fromName}</span>
                  <span className="text-txt-muted">→</span>
                  {toLogo && <img src={toLogo} alt="" className="w-3.5 h-3.5 object-contain" />}
                  <span>{toName}</span>
                </>
              )}
              {(m.type === 'portal_in' || m.type === 'juco_in' || m.type === 'transfer') && fromName && (hideTo || !toName) && (
                <>
                  <span>from</span>
                  {fromLogo && <img src={fromLogo} alt="" className="w-3.5 h-3.5 object-contain" />}
                  <span>{fromName}</span>
                </>
              )}
              {(m.type === 'recruited' || m.type === 'added' || m.type === 'recommit') && toName && !hideTo && (
                <>
                  {toLogo && <img src={toLogo} alt="" className="w-3.5 h-3.5 object-contain" />}
                  <span>{toName}</span>
                </>
              )}
              {/* Intentionally omit "from X" for departure/entered_portal/encouraged_transfer:
                  the row already sits on the team being left, so restating it is noise
                  (and stale m.from data can make it outright wrong — e.g., "GRADUATING from Wisconsin"
                  when the player actually graduated from Kentucky). */}
              {showReason && (
                <span className="italic text-txt-tertiary">· {m.reason}</span>
              )}
              {m.draftRound && <span className="text-txt-tertiary">· Rd {m.draftRound}</span>}
            </span>
          )
        }

        // Friendly long-form class label for the headline (247-style)
        const classHeadlineMap = {
          'FR': 'Freshman', 'SO': 'Sophomore', 'JR': 'Junior', 'SR': 'Senior',
          'RS FR': 'RS Freshman', 'RS SO': 'RS Sophomore', 'RS JR': 'RS Junior', 'RS SR': 'RS Senior',
          'JUCO': 'JUCO'
        }
        const getClassHeadline = (cls) => {
          if (!cls) return null
          const key = cls.toUpperCase().trim()
          return classHeadlineMap[key] || cls
        }

        // Node renderer: year-gutter on far left, rail + avatar dot in the middle, content on the right.
        const renderTimelineNode = ({ key, logo, color, eyebrow, headline, headlineLink, metaRow, rightSlot, sub, movements, rowTeam, yearMarker, isFirst, isLast }) => (
          <div key={key} className="relative flex items-stretch gap-3 sm:gap-4">
            {/* Year gutter — only shown when this row introduces a new year */}
            <div className="w-10 sm:w-14 flex-shrink-0 pt-6 text-right">
              {yearMarker && (
                <div
                  className="font-black tabular text-txt-primary leading-none"
                  style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.35rem', letterSpacing: '0.5px' }}
                >
                  {yearMarker}
                </div>
              )}
            </div>

            {/* Rail + avatar column — the rail fills the full column height
                (top:0 → avatar, avatar → bottom:0). No row padding here means
                adjacent rows' rails meet directly with no visible gap. */}
            <div className="relative flex-shrink-0 flex flex-col items-center w-11 sm:w-12 py-5">
              {/* Continuous rail spanning the entire row height. Painted first
                  so the avatar draws on top. First row hides the portion above
                  the avatar; last row hides below. */}
              {!isFirst && (
                <div
                  className="absolute left-1/2 -translate-x-1/2 top-0 w-[2px] bg-surface-4"
                  style={{ height: 'calc(1.25rem + 1.375rem)' }}
                  aria-hidden="true"
                />
              )}
              {!isLast && (
                <div
                  className="absolute left-1/2 -translate-x-1/2 bottom-0 w-[2px] bg-surface-4"
                  style={{ top: 'calc(1.25rem + 1.375rem + 2px)' }}
                  aria-hidden="true"
                />
              )}
              <div
                className="relative w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center bg-surface-1 flex-shrink-0 z-[1]"
                style={{ boxShadow: `inset 0 0 0 2px ${color}` }}
              >
                {logo
                  ? <img src={logo} alt="" className="w-7 h-7 sm:w-8 sm:h-8 object-contain" />
                  : <div className="w-4 h-4 rounded-full" style={{ backgroundColor: color }} />
                }
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 py-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  {eyebrow && (
                    <div
                      className="text-[10px] font-bold uppercase tracking-widest text-txt-tertiary"
                      style={{ letterSpacing: '1.8px' }}
                    >
                      {eyebrow}
                    </div>
                  )}
                  <div
                    className="font-display font-black text-xl sm:text-2xl leading-tight text-txt-primary"
                    style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.5px' }}
                  >
                    {headlineLink
                      ? <Link to={headlineLink} className="hover:text-team-primary transition-colors">{headline}</Link>
                      : headline
                    }
                  </div>
                  {metaRow && (
                    <div className="mt-1 text-[12px] leading-relaxed text-txt-tertiary flex flex-wrap items-center gap-x-2 gap-y-1">
                      {metaRow}
                    </div>
                  )}
                </div>
                {rightSlot && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {rightSlot}
                  </div>
                )}
              </div>

              {sub && <div className="mt-1.5">{sub}</div>}

              {movements && movements.length > 0 && (
                <div className="mt-2 space-y-1">
                  {movements.map((m, mIdx) => {
                    const movementColor = getMovementColor(m.type)
                    const label = getMovementLabel(m)
                    return (
                      <div key={mIdx} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                        <span
                          className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: movementColor }}
                          aria-hidden="true"
                        />
                        <span
                          className="font-black uppercase tracking-widest text-[10px]"
                          style={{ color: movementColor, letterSpacing: '1.5px' }}
                        >
                          {label}
                        </span>
                        {renderMovementDetail(m, rowTeam, label)}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )

        const postCareerEntries = timelineEntries.filter(e => e.year > lastYear)

        // If the recruitment node and the first season share a year + team, fold the recruit
        // into that season row so we don't show two near-identical "Kentucky" cards back to back.
        const firstSeason = yearData[0]
        const mergeRecruitIntoFirstSeason = !!(
          recruitmentNode && firstSeason &&
          Number(recruitmentNode.year) === Number(firstSeason.year) &&
          sameTid(recruitmentNode.team, firstSeason.team)
        )
        const showRecruitRow = !!recruitmentNode && !mergeRecruitIntoFirstSeason

        const totalRows = (showRecruitRow ? 1 : 0) + yearData.length + postCareerEntries.length

        return (
          <div className="max-w-3xl mx-auto">

            {(() => {
              // Build a flat list of rows so we can assign a single year-gutter marker
              // per unique year (shown only on the first row of each year group).
              const rows = []

              // Helper: build the recruitment meta block (stars / ranks / class / hometown)
              const buildRecruitMeta = (rn) => {
                const stars = rn.stars
                const classLabel = player.recruitYear ? `Class of ${Number(player.recruitYear)}` : null
                const rankBits = []
                if (rn.nationalRank > 0) rankBits.push({ value: `#${rn.nationalRank}`, label: 'Natl' })
                if (rn.positionRank > 0) rankBits.push({ value: `#${rn.positionRank}`, label: player.position })
                if (rn.stateRank > 0) rankBits.push({ value: `#${rn.stateRank}`, label: rn.state || player.state })

                const starsNode = stars > 0 ? (
                  <span className="flex items-center gap-0.5" aria-label={`${stars} star recruit`}>
                    {[...Array(5)].map((_, i) => (
                      <svg key={i} className="w-3.5 h-3.5" fill={i < stars ? '#FFD700' : 'rgba(255,255,255,0.18)'} viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </span>
                ) : null

                return (
                  <>
                    {starsNode}
                    {starsNode && (rankBits.length > 0 || classLabel) && <span className="text-txt-muted">·</span>}
                    {rankBits.map((rb, i) => (
                      <span key={i} className="flex items-baseline gap-1">
                        <span className="font-bold tabular text-txt-primary">{rb.value}</span>
                        <span className="text-[10px] uppercase tracking-widest text-txt-tertiary">{rb.label}</span>
                        {i < rankBits.length - 1 && <span className="text-txt-muted ml-1">·</span>}
                      </span>
                    ))}
                    {classLabel && (
                      <>
                        {(starsNode || rankBits.length > 0) && <span className="text-txt-muted">·</span>}
                        <span className="uppercase tracking-wider text-[11px] font-semibold text-txt-secondary" style={{ letterSpacing: '1px' }}>{classLabel}</span>
                      </>
                    )}
                  </>
                )
              }

              // Standalone recruit row
              if (showRecruitRow) {
                const rn = recruitmentNode
                const rightSlot = rn.gemBust ? (
                  <span
                    className="text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: rn.gemBust.toLowerCase() === 'gem' ? '#10B981' : '#EF4444',
                      color: 'white',
                      letterSpacing: '1.5px'
                    }}
                  >
                    {rn.gemBust}
                  </span>
                ) : null
                rows.push({
                  key: `recruit-${rn.year}`,
                  year: rn.year,
                  node: {
                    key: `recruit-${rn.year}`,
                    logo: rn.logo,
                    color: rn.color,
                    eyebrow: rn.isPortal ? 'Portal Entry' : 'Committed',
                    headline: rn.school || 'Committed',
                    headlineLink: rn.tid
                      ? (rn.isPortal
                          ? `${pathPrefix}/recruiting/portal/${rn.tid}/${rn.year}`
                          : `${pathPrefix}/recruiting/${rn.tid}/${rn.year}`)
                      : null,
                    metaRow: buildRecruitMeta(rn),
                    rightSlot
                  }
                })
              }

              // Season rows
              yearData.forEach((yd, idx) => {
                const teamName = getMascotName(yd.team, teamsData)
                const schoolName = getSchoolName(yd.team, teamsData)
                const logo = teamName ? getTeamLogo(teamName, teamsData) : null
                const isCurrentYear = yd.year === currentYear
                const prevOverall = idx > 0 ? yearData[idx - 1].overall : null
                const ovrChange = (yd.overall && prevOverall) ? yd.overall - prevOverall : null
                const quickStats = getQuickStatChips(yd.stats, player.position)
                const teamTid = resolveTid(yd.team, teamsData || TEAMS)
                const ydTeamColors = teamName ? getTeamColors(teamName, teamsData) : null
                const seasonColor = ydTeamColors?.primary || teamInfo.backgroundColor

                // Peel transfer-in events (portal_in, juco_in, transfer) into their own standalone
                // timeline row that sits just above the new season. This makes a mid-career move
                // like "Wisconsin → Kentucky" visually obvious instead of hiding it as a chip on
                // the destination season. We also remove it from the season's movements list so
                // it doesn't double up. Works for any number of transfers — each team change in
                // teamsByYear produces its own row (A → B → C → back to A all get separate rows).
                const prevTeamRef = idx > 0 ? yearData[idx - 1]?.team : null
                // Safety net: only treat this as a transfer row when the team actually changed
                // from the previous season. timelineEntries already enforces this, but guard
                // against degenerate data (e.g., a stray portal_in entry on the same team).
                const teamActuallyChanged = idx > 0 && !sameTid(prevTeamRef, yd.team)
                const transferIdx = teamActuallyChanged
                  ? yd.movements.findIndex(m => m.type === 'portal_in' || m.type === 'juco_in' || m.type === 'transfer')
                  : -1
                const transferMovement = transferIdx >= 0 ? yd.movements[transferIdx] : null
                const seasonMovements = transferIdx >= 0
                  ? yd.movements.filter((_, i) => i !== transferIdx)
                  : yd.movements

                if (transferMovement) {
                  // teamsByYear is the source of truth — prefer the previous season's team
                  // over the movement's stored `from` (which can be stale or missing after
                  // multi-hop transfers like A → B → C where legacy data may still point at A).
                  const fromRef = prevTeamRef || transferMovement.from
                  const fromName = fromRef ? getMascotName(fromRef, teamsData) : null
                  const toName = teamName
                  const fromSchool = fromRef ? getSchoolName(fromRef, teamsData) : null
                  const toSchool = schoolName
                  const fromLogo = fromName ? getTeamLogo(fromName, teamsData) : null
                  const toLogo = logo
                  const transferColor = getMovementColor(transferMovement.type)
                  const transferLabel = transferMovement.isRecommit
                    ? 'Recommitted'
                    : transferMovement.type === 'juco_in'
                      ? 'JUCO Transfer'
                      : transferMovement.type === 'portal_in'
                        ? 'Portal Transfer'
                        : 'Transferred'

                  // Avatar (destination) sits on the far left, so put the destination name
                  // next to it and point back to the origin: "KENTUCKY ← Wisconsin".
                  const transferHeadline = (
                    <span className="flex items-center gap-2 flex-wrap">
                      <span>{toSchool || 'New Team'}</span>
                      <span className="text-txt-muted" style={{ fontWeight: 400 }}>←</span>
                      {fromLogo && <img src={fromLogo} alt="" className="w-6 h-6 sm:w-7 sm:h-7 object-contain" />}
                      <span>{fromSchool || 'Previous'}</span>
                    </span>
                  )

                  // Show the same recruit-style meta (stars / rank / class / hometown) on the
                  // transfer row so a mid-career portal move gets the same context treatment
                  // as an HS signing. Stars and ranks persist on the player object and apply
                  // to the portal event as well.
                  const transferMeta = (
                    <>
                      {recruitmentNode && buildRecruitMeta(recruitmentNode)}
                      {transferMovement.reason && (
                        <>
                          {recruitmentNode && <span className="text-txt-muted">·</span>}
                          <span className="italic text-txt-tertiary">{transferMovement.reason}</span>
                        </>
                      )}
                    </>
                  )

                  rows.push({
                    key: `transfer-${yd.year}`,
                    year: yd.year,
                    node: {
                      key: `transfer-${yd.year}`,
                      logo: toLogo,
                      color: transferColor,
                      eyebrow: transferLabel,
                      headline: transferHeadline,
                      metaRow: transferMeta
                    }
                  })
                }

                const classHeadline = getClassHeadline(yd.playerClass)
                // Headline is the eligibility phase (Freshman/Sophomore/etc.)
                // Eyebrow carries school + status flags. Year lives in the gutter now.
                const eyebrowParts = []
                if (schoolName) eyebrowParts.push(schoolName)
                if (isCurrentYear) eyebrowParts.push('Current Season')
                const eyebrow = eyebrowParts.join(' · ')
                const headline = classHeadline || 'Season'

                // If we're merging the recruit node into this first season, prepend
                // the stars/ranks/hometown and the entry tag to the meta row.
                const isMergedFirstSeason = idx === 0 && mergeRecruitIntoFirstSeason
                const mergedEyebrow = isMergedFirstSeason
                  ? [recruitmentNode.isPortal ? 'Portal Entry' : 'Committed', ...eyebrowParts].join(' · ')
                  : eyebrow

                const devChip = yd.devTrait ? (
                  <span
                    className="inline-block text-[10px] font-semibold uppercase text-txt-secondary"
                    style={{ letterSpacing: '1px' }}
                  >
                    {yd.devTrait}
                  </span>
                ) : null

                const metaRow = isMergedFirstSeason ? (
                  <>
                    {buildRecruitMeta(recruitmentNode)}
                    {devChip && (
                      <>
                        <span className="text-txt-muted">·</span>
                        {devChip}
                      </>
                    )}
                  </>
                ) : devChip

                const rightSlot = yd.overall ? (
                  <>
                    <span
                      className="text-xl sm:text-2xl font-black tabular leading-none text-txt-primary"
                      style={{ fontFamily: "'Bebas Neue', sans-serif" }}
                    >
                      {yd.overall}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-txt-muted" style={{ letterSpacing: '1.5px' }}>OVR</span>
                    {ovrChange !== null && ovrChange !== 0 && (
                      <span className="text-xs font-bold tabular" style={{ color: ovrChange > 0 ? '#22c55e' : '#ef4444' }}>
                        {ovrChange > 0 ? '+' : ''}{ovrChange}
                      </span>
                    )}
                  </>
                ) : null

                const sub = quickStats.length > 0 ? (
                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mt-1">
                    {quickStats.map((qs, i) => (
                      <div key={i} className="flex items-baseline gap-1.5">
                        <span
                          className="text-base sm:text-lg font-black leading-none tabular text-txt-primary"
                          style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.5px' }}
                        >
                          {qs.value}
                        </span>
                        <span
                          className="text-[10px] font-bold uppercase tracking-widest text-txt-tertiary"
                          style={{ letterSpacing: '1.5px' }}
                        >
                          {qs.label}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null

                rows.push({
                  key: `season-${yd.year}`,
                  year: yd.year,
                  node: {
                    key: `season-${yd.year}`,
                    logo,
                    color: seasonColor,
                    eyebrow: mergedEyebrow,
                    headline,
                    headlineLink: teamTid ? `${pathPrefix}/team/${teamTid}/${yd.year}` : null,
                    metaRow,
                    rightSlot,
                    sub,
                    movements: seasonMovements,
                    rowTeam: yd.team
                  }
                })
              })

              // Post-career rows
              postCareerEntries.forEach((entry, idx) => {
                const movementColor = getMovementColor(entry.type)
                const fromTeam = entry.from
                const fromName = fromTeam ? getMascotName(fromTeam, teamsData) : null
                const fromLogo = fromName ? getTeamLogo(fromName, teamsData) : null
                const fromSchool = fromTeam ? getSchoolName(fromTeam, teamsData) : null
                const fromTid = fromTeam ? resolveTid(fromTeam, teamsData || TEAMS) : null

                const metaRow = fromSchool ? (
                  <span className="flex items-center gap-1 text-txt-secondary">
                    <span>from</span>
                    {fromLogo && <img src={fromLogo} alt="" className="w-3.5 h-3.5 object-contain" />}
                    <span>{fromSchool}</span>
                    {entry.reason && <span className="italic text-txt-tertiary">· {entry.reason}</span>}
                  </span>
                ) : (entry.reason ? <span className="italic text-txt-tertiary">{entry.reason}</span> : null)

                rows.push({
                  key: `post-${idx}`,
                  year: entry.year,
                  node: {
                    key: `post-${idx}`,
                    logo: fromLogo,
                    color: movementColor,
                    eyebrow: getMovementLabel(entry),
                    headline: fromSchool || getMovementLabel(entry),
                    headlineLink: fromTid ? `${pathPrefix}/team/${fromTid}/${entry.year}` : null,
                    metaRow
                  }
                })
              })

              // Year gutter: show the year only when it changes
              let prevYear = null
              rows.forEach(r => {
                r.yearMarker = r.year !== prevYear ? r.year : null
                prevYear = r.year
              })

              return rows.map((r, i) => renderTimelineNode({
                ...r.node,
                yearMarker: r.yearMarker,
                isFirst: i === 0,
                isLast: i === rows.length - 1
              }))
            })()}
          </div>
        )
      })()}

      {/* Career Statistics - Premium Dark Theme */}
      {activeTab === 'stats' && hasMeaningfulStats && (() => {
        const primaryStat = getPrimaryStatCategory(player.position)
        // CSS `order`-based reshuffle so the JSX can stay in canonical category
        // order but each position surfaces its relevant tables first. Tables
        // without an explicit order would default to 0 and leak above the
        // primary tables (e.g. Defense on an HB profile) — so EVERY table
        // below passes through getStatOrder().
        const getStatOrder = (() => {
          const offensiveSkill = ['passing', 'rushing', 'receiving', 'blocking', 'kickReturn', 'puntReturn', 'defense', 'kicking', 'punting']
          const receiver      = ['receiving', 'rushing', 'passing', 'blocking', 'kickReturn', 'puntReturn', 'defense', 'kicking', 'punting']
          const oLine          = ['blocking', 'rushing', 'receiving', 'passing', 'kickReturn', 'puntReturn', 'defense', 'kicking', 'punting']
          const defender      = ['defense', 'kickReturn', 'puntReturn', 'rushing', 'receiving', 'blocking', 'passing', 'kicking', 'punting']
          const kicker         = ['kicking', 'punting', 'kickReturn', 'puntReturn', 'defense', 'rushing', 'receiving', 'blocking', 'passing']
          const punter         = ['punting', 'kicking', 'kickReturn', 'puntReturn', 'defense', 'rushing', 'receiving', 'blocking', 'passing']

          const p = (player.position || '').toUpperCase()
          let ordering
          if (['LT', 'LG', 'C', 'RG', 'RT', 'OL', 'OG', 'OT'].includes(p)) ordering = oLine
          else if (['LEDG', 'REDG', 'DE', 'DT', 'SAM', 'MIKE', 'WILL', 'LB', 'OLB', 'MLB', 'ILB', 'ROLB', 'LOLB', 'CB', 'FS', 'SS', 'S'].includes(p)) ordering = defender
          else if (p === 'K') ordering = kicker
          else if (p === 'P') ordering = punter
          else if (['WR', 'TE'].includes(p) || primaryStat === 'receiving') ordering = receiver
          else ordering = offensiveSkill

          return (category) => {
            const idx = ordering.indexOf(category)
            return idx === -1 ? 99 : idx + 1
          }
        })()
        return (
        <div className="flex flex-col gap-6">
          {/* Passing Table */}
          {hasStats.passing && (
            <div className="card overflow-hidden" style={{ order: getStatOrder('passing') }}>
              <div className="px-5 py-3.5 bg-surface-2 border-b border-surface-4 border-l-[3px]" style={{ borderLeftColor: teamInfo.backgroundColor }}>
                <h3 className="text-lg font-black uppercase tracking-widest" style={{ color: 'var(--text-primary)', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '2px' }}>Passing</h3>
              </div>
              {(() => {
                const passingYearsUnsorted = yearByYearStats.filter(y => y.passing && hasNonZeroStats(y.passing, ['att', 'cmp', 'yds', 'td']))
                const hasAnySnaps = passingYearsUnsorted.some(y => y.snapsPlayed > 0)
                const showSnapsCol = primaryStat === 'passing' && hasAnySnaps

                // Sort by selected column
                const passingYears = sortStatYears(passingYearsUnsorted, 'passing', (y, col) => {
                  const statMap = { cmp: y.passing?.cmp, att: y.passing?.att, yds: y.passing?.yds, td: y.passing?.td, int: y.passing?.int, lng: y.passing?.lng, sck: y.passing?.sacks }
                  if (col === 'pct') return y.passing?.att ? (y.passing.cmp / y.passing.att) * 100 : 0
                  if (col === 'ypa') return y.passing?.att ? y.passing.yds / y.passing.att : 0
                  if (col === 'tdPct') return y.passing?.att ? (y.passing.td / y.passing.att) * 100 : 0
                  if (col === 'intPct') return y.passing?.att ? (y.passing.int / y.passing.att) * 100 : 0
                  if (col === 'tdInt') return y.passing?.int ? y.passing.td / y.passing.int : (y.passing?.td || 0)
                  return statMap[col] ?? 0
                })

                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm table-fixed">
                      <thead>
                        <tr className="bg-surface-3" style={{ borderBottom: `2px solid ${teamColors.primary}` }}>
                          {renderSortableHeader('passing', 'year', 'Year', 'left', colWidths.year)}
                          {renderSortableHeader('passing', 'class', 'Class', 'left', colWidths.class)}
                          <th className={`px-1.5 py-2.5 text-xs font-semibold uppercase text-center ${colWidths.team}`} style={{ color: secondaryText, opacity: 0.8 }}>Team</th>
                          {primaryStat === 'passing' && renderSortableHeader('passing', 'gamesPlayed', 'G', 'right', colWidths.statNarrow)}
                          {renderSortableHeader('passing', 'att', 'Cmp/Att', 'right', 'w-[88px]')}
                          {renderSortableHeader('passing', 'pct', 'Pct', 'right', colWidths.statPct)}
                          {renderSortableHeader('passing', 'yds', 'Yds', 'right', colWidths.statMedium)}
                          {renderSortableHeader('passing', 'ypa', 'Y/A', 'right', colWidths.statPct)}
                          {renderSortableHeader('passing', 'td', 'TD', 'right', colWidths.statNarrow)}
                          {renderSortableHeader('passing', 'tdPct', 'TD%', 'right', colWidths.statPct)}
                          {renderSortableHeader('passing', 'int', 'Int', 'right', colWidths.statNarrow)}
                          {renderSortableHeader('passing', 'intPct', 'INT%', 'right', colWidths.statPct)}
                          {renderSortableHeader('passing', 'tdInt', 'TD:INT', 'right', colWidths.statWide)}
                          {renderSortableHeader('passing', 'lng', 'Lng', 'right', colWidths.statNarrow)}
                          {renderSortableHeader('passing', 'sck', 'Sck', 'right', colWidths.statNarrow)}
                          {showSnapsCol && renderSortableHeader('passing', 'snapsPlayed', 'Snaps', 'right', colWidths.statMedium)}
                        </tr>
                      </thead>
                      <tbody style={{ borderTop: `1px solid ${teamInfo.backgroundColor}20` }}>
                        {passingYears.map((y, idx) => {
                          const rowTeam = y.team || teamAbbr
                          const mascot = getMascotName(rowTeam, dynasty?.teams || dynasty?.customTeams)
                          const logo = mascot ? getTeamLogo(mascot, dynasty?.teams || dynasty?.customTeams) : null
                          const colSpan = 14 + (primaryStat === 'passing' ? 1 : 0) + (showSnapsCol ? 1 : 0)
                          return (
                            <React.Fragment key={y.year}>
                              <tr className="transition-opacity hover:opacity-80" style={{ backgroundColor: isGameLogExpanded(y.year, 'passing') ? `${teamInfo.backgroundColor}15` : idx % 2 === 1 ? 'var(--surface-2)' : 'var(--surface-1)', borderBottom: `1px solid ${teamInfo.backgroundColor}25` }}>
                                <td
                                  className="px-1.5 py-2 font-medium cursor-pointer hover:underline truncate"
                                  style={{ color: 'var(--text-primary)' }}
                                  onClick={() => toggleGameLog(y.year, 'passing')}
                                  title="Click to view game log"
                                >
                                  {y.year}
                                  {isGameLogExpanded(y.year, 'passing') && <span className="ml-0.5 text-xs">▼</span>}
                                </td>
                                <td className="px-1.5 py-2 truncate" style={{ color: 'var(--text-secondary)' }}>{y.class}</td>
                                <td className="px-1.5 py-2 text-center">
                                  <Link to={`${pathPrefix}/team/${resolveTid(rowTeam, currentDynasty?.teams || TEAMS)}/${y.year}`} className="hover:opacity-70 transition-opacity">
                                    {logo ? <img src={logo} alt={rowTeam} className="w-5 h-5 object-contain inline-block" /> : rowTeam}
                                  </Link>
                                </td>
                                {primaryStat === 'passing' && <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.gamesPlayed}</td>}
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.passing.cmp}/{y.passing.att}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{calcPct(y.passing.cmp, y.passing.att)}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums font-semibold" style={{ color: 'var(--text-primary)' }}>{y.passing.yds.toLocaleString()}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{calcAvg(y.passing.yds, y.passing.att)}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums font-semibold" style={{ color: 'var(--text-primary)' }}>{y.passing.td}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{calcPct(y.passing.td, y.passing.att)}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.passing.int}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{calcPct(y.passing.int, y.passing.att)}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.passing.int > 0 ? `${(y.passing.td / y.passing.int).toFixed(1)}:1` : (y.passing.td > 0 ? '∞' : '-')}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.passing.lng}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.passing.sacks}</td>
                                {showSnapsCol && <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.snapsPlayed.toLocaleString()}</td>}
                              </tr>
                              {renderGameLogRow(y.year, colSpan, 'passing')}
                            </React.Fragment>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-surface-3 border-b-2" style={{ borderBottomColor: teamInfo.backgroundColor }}>
                          <td className="px-1.5 py-2 font-bold" style={{ color: primaryText }}>Career</td>
                          <td className="px-1.5 py-2"></td>
                          <td className="px-1.5 py-2"></td>
                          {primaryStat === 'passing' && <td className="px-1.5 py-2 text-right tabular-nums font-semibold" style={{ color: primaryText }}>{careerGames}</td>}
                          <td className="px-1.5 py-2 text-right tabular-nums font-semibold" style={{ color: primaryText }}>{careerPassing.cmp.toLocaleString()}/{careerPassing.att.toLocaleString()}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: primaryText }}>{calcPct(careerPassing.cmp, careerPassing.att)}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums font-bold" style={{ color: primaryText }}>{careerPassing.yds.toLocaleString()}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: primaryText }}>{calcAvg(careerPassing.yds, careerPassing.att)}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums font-bold" style={{ color: primaryText }}>{careerPassing.td}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: primaryText }}>{calcPct(careerPassing.td, careerPassing.att)}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: primaryText }}>{careerPassing.int}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: primaryText }}>{calcPct(careerPassing.int, careerPassing.att)}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: primaryText }}>{careerPassing.int > 0 ? `${(careerPassing.td / careerPassing.int).toFixed(1)}:1` : (careerPassing.td > 0 ? '∞' : '-')}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: primaryText }}>{careerPassing.lng}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: primaryText }}>{careerPassing.sacks}</td>
                          {showSnapsCol && <td className="px-1.5 py-2 text-right tabular-nums font-semibold" style={{ color: primaryText }}>{careerSnaps.toLocaleString()}</td>}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )
              })()}
            </div>
          )}

          {/* Rushing Table */}
          {hasStats.rushing && (
            <div className="card overflow-hidden" style={{ order: getStatOrder('rushing') }}>
              <div className="px-5 py-3.5 bg-surface-2 border-b border-surface-4 border-l-[3px]" style={{ borderLeftColor: teamInfo.backgroundColor }}>
                <h3 className="text-lg font-black uppercase tracking-widest" style={{ color: 'var(--text-primary)', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '2px' }}>Rushing</h3>
              </div>
              {(() => {
                const rushingYearsUnsorted = yearByYearStats.filter(y => y.rushing && hasNonZeroStats(y.rushing, ['car', 'yds', 'td']))
                const hasAnySnaps = rushingYearsUnsorted.some(y => y.snapsPlayed > 0)
                const showSnapsCol = primaryStat === 'rushing' && hasAnySnaps

                // Sort by selected column
                const rushingYears = sortStatYears(rushingYearsUnsorted, 'rushing', (y, col) => {
                  const statMap = { car: y.rushing?.car, yds: y.rushing?.yds, td: y.rushing?.td, lng: y.rushing?.lng, fum: y.rushing?.fum, bt: y.rushing?.bt, yac: y.rushing?.yac, twentyPlus: y.rushing?.twentyPlus }
                  if (col === 'ypc') return y.rushing?.car ? y.rushing.yds / y.rushing.car : 0
                  if (col === 'ypg') return y.gamesPlayed ? y.rushing?.yds / y.gamesPlayed : 0
                  return statMap[col] ?? 0
                })

                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm table-fixed">
                      <thead>
                        <tr className="bg-surface-3" style={{ borderBottom: `2px solid ${teamColors.primary}` }}>
                          {renderSortableHeader('rushing', 'year', 'Year', 'left', colWidths.year)}
                          {renderSortableHeader('rushing', 'class', 'Class', 'left', colWidths.class)}
                          <th className={`px-1.5 py-2.5 text-xs font-semibold uppercase text-center ${colWidths.team}`} style={{ color: secondaryText, opacity: 0.8 }}>Team</th>
                          {primaryStat === 'rushing' && renderSortableHeader('rushing', 'gamesPlayed', 'G', 'right', colWidths.statNarrow)}
                          {renderSortableHeader('rushing', 'car', 'Car', 'right', colWidths.statMedium)}
                          {renderSortableHeader('rushing', 'yds', 'Yds', 'right', colWidths.statMedium)}
                          {renderSortableHeader('rushing', 'ypc', 'AVG', 'right', colWidths.statPct)}
                          {renderSortableHeader('rushing', 'td', 'TD', 'right', colWidths.statNarrow)}
                          {renderSortableHeader('rushing', 'ypg', 'YDS/G', 'right', colWidths.statWide)}
                          {renderSortableHeader('rushing', 'yac', 'YAC', 'right', colWidths.statMedium)}
                          {renderSortableHeader('rushing', 'twentyPlus', '20+', 'right', colWidths.statNarrow)}
                          {renderSortableHeader('rushing', 'lng', 'Lng', 'right', colWidths.statNarrow)}
                          {renderSortableHeader('rushing', 'fum', 'Fum', 'right', colWidths.statNarrow)}
                          {renderSortableHeader('rushing', 'bt', 'BTkl', 'right', colWidths.statNarrow)}
                          {showSnapsCol && renderSortableHeader('rushing', 'snapsPlayed', 'Snaps', 'right', colWidths.statMedium)}
                        </tr>
                      </thead>
                      <tbody style={{ borderTop: `1px solid ${teamInfo.backgroundColor}20` }}>
                        {rushingYears.map((y, idx) => {
                          const rowTeam = y.team || teamAbbr
                          const mascot = getMascotName(rowTeam, dynasty?.teams || dynasty?.customTeams)
                          const logo = mascot ? getTeamLogo(mascot, dynasty?.teams || dynasty?.customTeams) : null
                          const colSpan = 13 + (primaryStat === 'rushing' ? 1 : 0) + (showSnapsCol ? 1 : 0)
                          return (
                            <React.Fragment key={y.year}>
                              <tr className="transition-opacity hover:opacity-80" style={{ backgroundColor: isGameLogExpanded(y.year, 'rushing') ? `${teamInfo.backgroundColor}15` : idx % 2 === 1 ? 'var(--surface-2)' : 'var(--surface-1)', borderBottom: `1px solid ${teamInfo.backgroundColor}25` }}>
                                <td
                                  className="px-1.5 py-2 font-medium cursor-pointer hover:underline truncate"
                                  style={{ color: 'var(--text-primary)' }}
                                  onClick={() => toggleGameLog(y.year, 'rushing')}
                                  title="Click to view game log"
                                >
                                  {y.year}
                                  {isGameLogExpanded(y.year, 'rushing') && <span className="ml-0.5 text-xs">▼</span>}
                                </td>
                                <td className="px-1.5 py-2 truncate" style={{ color: 'var(--text-secondary)' }}>{y.class}</td>
                                <td className="px-1.5 py-2 text-center">
                                  <Link to={`${pathPrefix}/team/${resolveTid(rowTeam, currentDynasty?.teams || TEAMS)}/${y.year}`} className="hover:opacity-70 transition-opacity">
                                    {logo ? <img src={logo} alt={rowTeam} className="w-5 h-5 object-contain inline-block" /> : rowTeam}
                                  </Link>
                                </td>
                                {primaryStat === 'rushing' && <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.gamesPlayed}</td>}
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.rushing.car}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums font-semibold" style={{ color: 'var(--text-primary)' }}>{y.rushing.yds.toLocaleString()}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{calcAvg(y.rushing.yds, y.rushing.car)}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums font-semibold" style={{ color: 'var(--text-primary)' }}>{y.rushing.td}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.gamesPlayed > 0 ? calcAvg(y.rushing.yds, y.gamesPlayed) : '0.0'}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.rushing.yac || 0}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.rushing.twentyPlus || 0}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.rushing.lng}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.rushing.fum}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.rushing.bt}</td>
                                {showSnapsCol && <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.snapsPlayed.toLocaleString()}</td>}
                              </tr>
                              {renderGameLogRow(y.year, colSpan, 'rushing')}
                            </React.Fragment>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-surface-3 border-b-2" style={{ borderBottomColor: teamInfo.backgroundColor }}>
                          <td className="px-1.5 py-2 font-bold" style={{ color: primaryText }}>Career</td>
                          <td className="px-1.5 py-2"></td>
                          <td className="px-1.5 py-2"></td>
                          {primaryStat === 'rushing' && <td className="px-1.5 py-2 text-right tabular-nums font-semibold" style={{ color: primaryText }}>{careerGames}</td>}
                          <td className="px-1.5 py-2 text-right tabular-nums font-semibold" style={{ color: primaryText }}>{careerRushing.car.toLocaleString()}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums font-bold" style={{ color: primaryText }}>{careerRushing.yds.toLocaleString()}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: primaryText }}>{calcAvg(careerRushing.yds, careerRushing.car)}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums font-bold" style={{ color: primaryText }}>{careerRushing.td}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: primaryText }}>{careerGames > 0 ? calcAvg(careerRushing.yds, careerGames) : '0.0'}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: primaryText }}>{careerRushing.yac || 0}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: primaryText }}>{careerRushing.twentyPlus || 0}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: primaryText }}>{careerRushing.lng}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: primaryText }}>{careerRushing.fum}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: primaryText }}>{careerRushing.bt}</td>
                          {showSnapsCol && <td className="px-1.5 py-2 text-right tabular-nums font-semibold" style={{ color: primaryText }}>{careerSnaps.toLocaleString()}</td>}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )
              })()}
            </div>
          )}

          {/* Receiving Table */}
          {hasStats.receiving && (
            <div className="card overflow-hidden" style={{ order: getStatOrder('receiving') }}>
              <div className="px-5 py-3.5 bg-surface-2 border-b border-surface-4 border-l-[3px]" style={{ borderLeftColor: teamInfo.backgroundColor }}>
                <h3 className="text-lg font-black uppercase tracking-widest" style={{ color: 'var(--text-primary)', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '2px' }}>Receiving</h3>
              </div>
              {(() => {
                // Check if any receiving year has non-zero snaps
                const receivingYearsUnsorted = yearByYearStats.filter(y => y.receiving && hasNonZeroStats(y.receiving, ['rec', 'yds', 'td']))
                const hasAnySnaps = receivingYearsUnsorted.some(y => y.snapsPlayed > 0)
                const showSnapsCol = primaryStat === 'receiving' && hasAnySnaps

                // Sort by selected column
                const receivingYears = sortStatYears(receivingYearsUnsorted, 'receiving', (y, col) => {
                  const statMap = { rec: y.receiving?.rec, yds: y.receiving?.yds, td: y.receiving?.td, lng: y.receiving?.lng, drops: y.receiving?.drops, rac: y.receiving?.rac }
                  if (col === 'ypr') return y.receiving?.rec ? y.receiving.yds / y.receiving.rec : 0
                  if (col === 'ypg') return y.gamesPlayed ? y.receiving?.yds / y.gamesPlayed : 0
                  return statMap[col] ?? 0
                })

                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm table-fixed">
                      <thead>
                        <tr className="bg-surface-3" style={{ borderBottom: `2px solid ${teamColors.primary}` }}>
                          {renderSortableHeader('receiving', 'year', 'Year', 'left', colWidths.year)}
                          {renderSortableHeader('receiving', 'class', 'Class', 'left', colWidths.class)}
                          <th className={`px-1.5 py-2.5 text-xs font-semibold uppercase text-center ${colWidths.team}`} style={{ color: secondaryText, opacity: 0.8 }}>Team</th>
                          {primaryStat === 'receiving' && renderSortableHeader('receiving', 'gamesPlayed', 'G', 'right', colWidths.statNarrow)}
                          {renderSortableHeader('receiving', 'rec', 'Rec', 'right', colWidths.statMedium)}
                          {renderSortableHeader('receiving', 'yds', 'Yds', 'right', colWidths.statMedium)}
                          {renderSortableHeader('receiving', 'ypr', 'AVG', 'right', colWidths.statPct)}
                          {renderSortableHeader('receiving', 'td', 'TD', 'right', colWidths.statNarrow)}
                          {renderSortableHeader('receiving', 'ypg', 'YDS/G', 'right', colWidths.statWide)}
                          {renderSortableHeader('receiving', 'rac', 'RAC', 'right', colWidths.statMedium)}
                          {renderSortableHeader('receiving', 'lng', 'Lng', 'right', colWidths.statNarrow)}
                          {renderSortableHeader('receiving', 'drops', 'Drops', 'right', colWidths.statMedium)}
                          {showSnapsCol && renderSortableHeader('receiving', 'snapsPlayed', 'Snaps', 'right', colWidths.statMedium)}
                        </tr>
                      </thead>
                      <tbody style={{ borderTop: `1px solid ${teamInfo.backgroundColor}20` }}>
                        {receivingYears.map((y, idx) => {
                          const rowTeam = y.team || teamAbbr
                          const mascot = getMascotName(rowTeam, dynasty?.teams || dynasty?.customTeams)
                          const logo = mascot ? getTeamLogo(mascot, dynasty?.teams || dynasty?.customTeams) : null
                          const colSpan = 11 + (primaryStat === 'receiving' ? 1 : 0) + (showSnapsCol ? 1 : 0)
                          return (
                            <React.Fragment key={y.year}>
                              <tr className="transition-opacity hover:opacity-80" style={{ backgroundColor: isGameLogExpanded(y.year, 'receiving') ? `${teamInfo.backgroundColor}15` : idx % 2 === 1 ? 'var(--surface-2)' : 'var(--surface-1)', borderBottom: `1px solid ${teamInfo.backgroundColor}25` }}>
                                <td
                                  className="px-1.5 py-2 font-medium cursor-pointer hover:underline truncate"
                                  style={{ color: 'var(--text-primary)' }}
                                  onClick={() => toggleGameLog(y.year, 'receiving')}
                                  title="Click to view game log"
                                >
                                  {y.year}
                                  {isGameLogExpanded(y.year, 'receiving') && <span className="ml-0.5 text-xs">▼</span>}
                                </td>
                                <td className="px-1.5 py-2 truncate" style={{ color: 'var(--text-secondary)' }}>{y.class}</td>
                                <td className="px-1.5 py-2 text-center">
                                  <Link to={`${pathPrefix}/team/${resolveTid(rowTeam, currentDynasty?.teams || TEAMS)}/${y.year}`} className="hover:opacity-70 transition-opacity">
                                    {logo ? <img src={logo} alt={rowTeam} className="w-5 h-5 object-contain inline-block" /> : rowTeam}
                                  </Link>
                                </td>
                                {primaryStat === 'receiving' && <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.gamesPlayed}</td>}
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.receiving.rec}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums font-semibold" style={{ color: 'var(--text-primary)' }}>{y.receiving.yds.toLocaleString()}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{calcAvg(y.receiving.yds, y.receiving.rec)}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums font-semibold" style={{ color: 'var(--text-primary)' }}>{y.receiving.td}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.gamesPlayed > 0 ? calcAvg(y.receiving.yds, y.gamesPlayed) : '0.0'}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.receiving.rac || 0}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.receiving.lng}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.receiving.drops}</td>
                                {showSnapsCol && <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.snapsPlayed.toLocaleString()}</td>}
                              </tr>
                              {renderGameLogRow(y.year, colSpan, 'receiving')}
                            </React.Fragment>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-surface-3 border-b-2" style={{ borderBottomColor: teamInfo.backgroundColor }}>
                          <td className="px-1.5 py-2 font-bold" style={{ color: primaryText }}>Career</td>
                          <td className="px-1.5 py-2"></td>
                          <td className="px-1.5 py-2"></td>
                          {primaryStat === 'receiving' && <td className="px-1.5 py-2 text-right tabular-nums font-semibold" style={{ color: primaryText }}>{careerGames}</td>}
                          <td className="px-1.5 py-2 text-right tabular-nums font-semibold" style={{ color: primaryText }}>{careerReceiving.rec.toLocaleString()}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums font-bold" style={{ color: primaryText }}>{careerReceiving.yds.toLocaleString()}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: primaryText }}>{calcAvg(careerReceiving.yds, careerReceiving.rec)}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums font-bold" style={{ color: primaryText }}>{careerReceiving.td}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: primaryText }}>{careerGames > 0 ? calcAvg(careerReceiving.yds, careerGames) : '0.0'}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: primaryText }}>{careerReceiving.rac || 0}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: primaryText }}>{careerReceiving.lng}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: primaryText }}>{careerReceiving.drops}</td>
                          {showSnapsCol && <td className="px-1.5 py-2 text-right tabular-nums font-semibold" style={{ color: primaryText }}>{careerSnaps.toLocaleString()}</td>}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )
              })()}
            </div>
          )}

          {/* Blocking Table - Only show for TE and OL positions */}
          {hasStats.blocking && ['TE', 'LT', 'LG', 'C', 'RG', 'RT'].includes(player.position?.toUpperCase()) && (
            <div className="card overflow-hidden" style={{ order: getStatOrder('blocking') }}>
              <div className="px-4 py-3 bg-surface-2 border-b border-surface-4 border-l-[3px]" style={{ borderLeftColor: teamInfo.backgroundColor }}>
                <h3 className="text-lg font-black uppercase tracking-widest" style={{ color: 'var(--text-primary)', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '2px' }}>Blocking</h3>
              </div>
              {(() => {
                const blockingYearsUnsorted = yearByYearStats.filter(y => y.blocking && hasNonZeroStats(y.blocking, ['sacksAllowed', 'pancakes']))
                const hasAnySnaps = blockingYearsUnsorted.some(y => (y.snapsPlayed || 0) > 0)
                const showSnapsCol = primaryStat === 'blocking' && hasAnySnaps

                // Sort by selected column
                const blockingYears = sortStatYears(blockingYearsUnsorted, 'blocking', (y, col) => {
                  const statMap = { sacksAllowed: y.blocking?.sacksAllowed }
                  return statMap[col] ?? 0
                })

                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-surface-3" style={{ borderBottom: `2px solid ${teamColors.primary}` }}>
                          {renderSortableHeader('blocking', 'year', 'Year', 'left', 'w-14')}
                          {renderSortableHeader('blocking', 'class', 'Class', 'left', 'w-16')}
                          <th className="px-2 py-2.5 text-xs font-semibold uppercase text-center w-12" style={{ color: secondaryText, opacity: 0.8 }}>Team</th>
                          {primaryStat === 'blocking' && renderSortableHeader('blocking', 'gamesPlayed', 'G', 'right')}
                          {renderSortableHeader('blocking', 'sacksAllowed', 'Sacks Allowed', 'right')}
                          {showSnapsCol && renderSortableHeader('blocking', 'snapsPlayed', 'Snaps', 'right')}
                        </tr>
                      </thead>
                      <tbody style={{ borderTop: `1px solid ${teamInfo.backgroundColor}20` }}>
                        {blockingYears.map((y, idx) => {
                          const rowTeam = y.team || teamAbbr
                          const mascot = getMascotName(rowTeam, dynasty?.teams || dynasty?.customTeams)
                          const logo = mascot ? getTeamLogo(mascot, dynasty?.teams || dynasty?.customTeams) : null
                          const colSpan = 4 + (primaryStat === 'blocking' ? 1 : 0) + (showSnapsCol ? 1 : 0)
                          return (
                            <React.Fragment key={y.year}>
                              <tr className="transition-opacity hover:opacity-80" style={{ backgroundColor: isGameLogExpanded(y.year, 'blocking') ? `${teamInfo.backgroundColor}15` : idx % 2 === 1 ? 'var(--surface-2)' : 'var(--surface-1)', borderBottom: `1px solid ${teamInfo.backgroundColor}25` }}>
                                <td
                                  className="px-2 py-2.5 font-medium w-14 cursor-pointer hover:underline"
                                  style={{ color: 'var(--text-primary)' }}
                                  onClick={() => toggleGameLog(y.year, 'blocking')}
                                  title="Click to view game log"
                                >
                                  {y.year}
                                  {isGameLogExpanded(y.year, 'blocking') && <span className="ml-1 text-xs">▼</span>}
                                </td>
                                <td className="px-2 py-2.5 w-16" style={{ color: secondaryText, opacity: 0.8 }}>{y.class}</td>
                                <td className="px-2 py-2 text-center w-12">
                                  <Link to={`${pathPrefix}/team/${resolveTid(rowTeam, currentDynasty?.teams || TEAMS)}/${y.year}`} className="hover:opacity-70 transition-opacity">
                                    {logo ? <img src={logo} alt={rowTeam} className="w-5 h-5 object-contain inline-block" /> : rowTeam}
                                  </Link>
                                </td>
                                {primaryStat === 'blocking' && <td className="px-2 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.gamesPlayed || 0}</td>}
                                <td className="px-2 py-2 text-right font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.blocking.sacksAllowed}</td>
                                {showSnapsCol && <td className="px-2 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{(y.snapsPlayed || 0).toLocaleString()}</td>}
                              </tr>
                              {renderGameLogRow(y.year, colSpan, 'blocking')}
                            </React.Fragment>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-surface-3 border-b-2" style={{ borderBottomColor: teamInfo.backgroundColor }}>
                          <td className="px-2 py-2.5 font-bold w-14" style={{ color: primaryText }}>Career</td>
                          <td className="px-2 py-2 w-16"></td>
                          <td className="px-2 py-2 w-12"></td>
                          {primaryStat === 'blocking' && <td className="px-2 py-2 text-right font-semibold" style={{ color: primaryText }}>{careerGames}</td>}
                          <td className="px-2 py-2 text-right font-bold" style={{ color: primaryText }}>{careerBlocking.sacksAllowed}</td>
                          {showSnapsCol && <td className="px-2 py-2 text-right font-semibold" style={{ color: primaryText }}>{careerSnaps.toLocaleString()}</td>}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )
              })()}
            </div>
          )}

          {/* Defense Table */}
          {hasStats.defensive && (
            <div className="card overflow-hidden" style={{ order: getStatOrder('defense') }}>
              <div className="px-5 py-3.5 bg-surface-2 border-b border-surface-4 border-l-[3px]" style={{ borderLeftColor: teamInfo.backgroundColor }}>
                <h3 className="text-lg font-black uppercase tracking-widest" style={{ color: 'var(--text-primary)', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '2px' }}>Defense</h3>
              </div>
              {(() => {
                const defenseYearsUnsorted = yearByYearStats.filter(y => y.defensive && hasNonZeroStats(y.defensive, ['solo', 'ast', 'tfl', 'sacks', 'int', 'pdef', 'ff', 'fr']))
                const hasAnySnaps = defenseYearsUnsorted.some(y => y.snapsPlayed > 0)
                const showSnapsCol = primaryStat === 'defense' && hasAnySnaps

                // Sort by selected column
                const defenseYears = sortStatYears(defenseYearsUnsorted, 'defense', (y, col) => {
                  const d = y.defensive
                  const statMap = { solo: d?.solo, ast: d?.ast, tfl: d?.tfl, sck: d?.sacks, int: d?.int, intYd: d?.intYds, td: d?.intTd, pd: d?.pdef, ff: d?.ff, fr: d?.fr }
                  if (col === 'tot') return (d?.solo || 0) + (d?.ast || 0)
                  return statMap[col] ?? 0
                })

                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-surface-3" style={{ borderBottom: `2px solid ${teamColors.primary}` }}>
                          {renderSortableHeader('defense', 'year', 'Year', 'left', 'w-14')}
                          {renderSortableHeader('defense', 'class', 'Class', 'left', 'w-16')}
                          <th className="px-2 py-2.5 text-xs font-semibold uppercase text-center w-12" style={{ color: secondaryText, opacity: 0.8 }}>Team</th>
                          {primaryStat === 'defense' && renderSortableHeader('defense', 'gamesPlayed', 'G', 'right')}
                          {renderSortableHeader('defense', 'solo', 'Solo', 'right')}
                          {renderSortableHeader('defense', 'ast', 'Ast', 'right')}
                          {renderSortableHeader('defense', 'tot', 'Tot', 'right')}
                          {renderSortableHeader('defense', 'tfl', 'TFL', 'right')}
                          {renderSortableHeader('defense', 'sck', 'Sck', 'right')}
                          {renderSortableHeader('defense', 'int', 'Int', 'right')}
                          {renderSortableHeader('defense', 'intYd', 'IntYd', 'right')}
                          {renderSortableHeader('defense', 'td', 'TD', 'right')}
                          {renderSortableHeader('defense', 'pd', 'PD', 'right')}
                          {renderSortableHeader('defense', 'ff', 'FF', 'right')}
                          {renderSortableHeader('defense', 'fr', 'FR', 'right')}
                          {showSnapsCol && renderSortableHeader('defense', 'snapsPlayed', 'Snaps', 'right')}
                        </tr>
                      </thead>
                      <tbody style={{ borderTop: `1px solid ${teamInfo.backgroundColor}20` }}>
                        {defenseYears.map((y, idx) => {
                          const rowTeam = y.team || teamAbbr
                          const mascot = getMascotName(rowTeam, dynasty?.teams || dynasty?.customTeams)
                          const logo = mascot ? getTeamLogo(mascot, dynasty?.teams || dynasty?.customTeams) : null
                          const colSpan = 14 + (primaryStat === 'defense' ? 1 : 0) + (showSnapsCol ? 1 : 0)
                          return (
                            <React.Fragment key={y.year}>
                              <tr className="transition-opacity hover:opacity-80" style={{ backgroundColor: isGameLogExpanded(y.year, 'defense') ? `${teamInfo.backgroundColor}15` : idx % 2 === 1 ? 'var(--surface-2)' : 'var(--surface-1)', borderBottom: `1px solid ${teamInfo.backgroundColor}25` }}>
                                <td
                                  className="px-2 py-2.5 font-medium w-14 cursor-pointer hover:underline"
                                  style={{ color: 'var(--text-primary)' }}
                                  onClick={() => toggleGameLog(y.year, 'defense')}
                                  title="Click to view game log"
                                >
                                  {y.year}
                                  {isGameLogExpanded(y.year, 'defense') && <span className="ml-1 text-xs">▼</span>}
                                </td>
                                <td className="px-2 py-2.5 w-16" style={{ color: secondaryText, opacity: 0.8 }}>{y.class}</td>
                                <td className="px-2 py-2 text-center w-12">
                                  <Link to={`${pathPrefix}/team/${resolveTid(rowTeam, currentDynasty?.teams || TEAMS)}/${y.year}`} className="hover:opacity-70 transition-opacity">
                                    {logo ? <img src={logo} alt={rowTeam} className="w-5 h-5 object-contain inline-block" /> : rowTeam}
                                  </Link>
                                </td>
                                {primaryStat === 'defense' && <td className="px-2 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.gamesPlayed}</td>}
                                <td className="px-2 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.defensive.solo}</td>
                                <td className="px-2 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.defensive.ast}</td>
                                <td className="px-2 py-2 text-right font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.defensive.solo + y.defensive.ast}</td>
                                <td className="px-2 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.defensive.tfl}</td>
                                <td className="px-2 py-2 text-right font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.defensive.sacks}</td>
                                <td className="px-2 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.defensive.int}</td>
                                <td className="px-2 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.defensive.intYds}</td>
                                <td className="px-2 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.defensive.intTd}</td>
                                <td className="px-2 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.defensive.pdef}</td>
                                <td className="px-2 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.defensive.ff}</td>
                                <td className="px-2 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.defensive.fr}</td>
                                {showSnapsCol && <td className="px-2 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.snapsPlayed.toLocaleString()}</td>}
                              </tr>
                              {renderGameLogRow(y.year, colSpan, 'defense')}
                            </React.Fragment>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-surface-3 border-b-2" style={{ borderBottomColor: teamInfo.backgroundColor }}>
                          <td className="px-2 py-2.5 font-bold w-14" style={{ color: primaryText }}>Career</td>
                          <td className="px-2 py-2 w-16"></td>
                          <td className="px-2 py-2 w-12"></td>
                          {primaryStat === 'defense' && <td className="px-2 py-2 text-right font-semibold" style={{ color: primaryText }}>{careerGames}</td>}
                          <td className="px-2 py-2 text-right tabular-nums" style={{ color: primaryText }}>{careerDefensive.solo}</td>
                          <td className="px-2 py-2 text-right tabular-nums" style={{ color: primaryText }}>{careerDefensive.ast}</td>
                          <td className="px-2 py-2 text-right font-bold" style={{ color: primaryText }}>{careerDefensive.solo + careerDefensive.ast}</td>
                          <td className="px-2 py-2 text-right font-semibold" style={{ color: primaryText }}>{careerDefensive.tfl}</td>
                          <td className="px-2 py-2 text-right font-bold" style={{ color: primaryText }}>{careerDefensive.sacks}</td>
                          <td className="px-2 py-2 text-right font-semibold" style={{ color: primaryText }}>{careerDefensive.int}</td>
                          <td className="px-2 py-2 text-right tabular-nums" style={{ color: primaryText }}>{careerDefensive.intYds}</td>
                          <td className="px-2 py-2 text-right font-semibold" style={{ color: primaryText }}>{careerDefensive.intTd}</td>
                          <td className="px-2 py-2 text-right tabular-nums" style={{ color: primaryText }}>{careerDefensive.pdef}</td>
                          <td className="px-2 py-2 text-right tabular-nums" style={{ color: primaryText }}>{careerDefensive.ff}</td>
                          <td className="px-2 py-2 text-right tabular-nums" style={{ color: primaryText }}>{careerDefensive.fr}</td>
                          {showSnapsCol && <td className="px-2 py-2 text-right font-semibold" style={{ color: primaryText }}>{careerSnaps.toLocaleString()}</td>}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )
              })()}
            </div>
          )}

          {/* Kicking Table */}
          {hasStats.kicking && (
            <div className="card overflow-hidden" style={{ order: getStatOrder('kicking') }}>
              <div className="px-5 py-3.5 bg-surface-2 border-b border-surface-4 border-l-[3px]" style={{ borderLeftColor: teamInfo.backgroundColor }}>
                <h3 className="text-lg font-black uppercase tracking-widest" style={{ color: 'var(--text-primary)', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '2px' }}>Kicking</h3>
              </div>
              {(() => {
                const kickingYearsUnsorted = yearByYearStats.filter(y => y.kicking && hasNonZeroStats(y.kicking, ['fgm', 'fga', 'xpm', 'xpa']))
                const hasAnySnaps = kickingYearsUnsorted.some(y => y.snapsPlayed > 0)
                const showSnapsCol = primaryStat === 'kicking' && hasAnySnaps

                // Sort by selected column
                const kickingYears = sortStatYears(kickingYearsUnsorted, 'kicking', (y, col) => {
                  const k = y.kicking
                  const statMap = { fgm: k?.fgm, fga: k?.fga, lng: k?.lng, xpm: k?.xpm, xpa: k?.xpa }
                  if (col === 'fgPct') return k?.fga ? (k.fgm / k.fga) * 100 : 0
                  if (col === 'xpPct') return k?.xpa ? (k.xpm / k.xpa) * 100 : 0
                  return statMap[col] ?? 0
                })

                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-surface-3" style={{ borderBottom: `2px solid ${teamColors.primary}` }}>
                          {renderSortableHeader('kicking', 'year', 'Year', 'left', 'w-14')}
                          {renderSortableHeader('kicking', 'class', 'Class', 'left', 'w-16')}
                          <th className="px-2 py-2.5 text-xs font-semibold uppercase text-center w-12" style={{ color: secondaryText, opacity: 0.8 }}>Team</th>
                          {primaryStat === 'kicking' && renderSortableHeader('kicking', 'gamesPlayed', 'G', 'right')}
                          {renderSortableHeader('kicking', 'fgm', 'FGM', 'right')}
                          {renderSortableHeader('kicking', 'fga', 'FGA', 'right')}
                          {renderSortableHeader('kicking', 'fgPct', 'FG%', 'right')}
                          {renderSortableHeader('kicking', 'lng', 'Lng', 'right')}
                          {renderSortableHeader('kicking', 'xpm', 'XPM', 'right')}
                          {renderSortableHeader('kicking', 'xpa', 'XPA', 'right')}
                          {renderSortableHeader('kicking', 'xpPct', 'XP%', 'right')}
                          {showSnapsCol && renderSortableHeader('kicking', 'snapsPlayed', 'Snaps', 'right')}
                        </tr>
                      </thead>
                      <tbody style={{ borderTop: `1px solid ${teamInfo.backgroundColor}20` }}>
                        {kickingYears.map((y, idx) => {
                          const rowTeam = y.team || teamAbbr
                          const mascot = getMascotName(rowTeam, dynasty?.teams || dynasty?.customTeams)
                          const logo = mascot ? getTeamLogo(mascot, dynasty?.teams || dynasty?.customTeams) : null
                          const colSpan = 10 + (primaryStat === 'kicking' ? 1 : 0) + (showSnapsCol ? 1 : 0)
                          return (
                            <React.Fragment key={y.year}>
                              <tr className="transition-opacity hover:opacity-80" style={{ backgroundColor: isGameLogExpanded(y.year, 'kicking') ? `${teamInfo.backgroundColor}15` : idx % 2 === 1 ? 'var(--surface-2)' : 'var(--surface-1)', borderBottom: `1px solid ${teamInfo.backgroundColor}25` }}>
                                <td
                                  className="px-2 py-2.5 font-medium w-14 cursor-pointer hover:underline"
                                  style={{ color: 'var(--text-primary)' }}
                                  onClick={() => toggleGameLog(y.year, 'kicking')}
                                  title="Click to view game log"
                                >
                                  {y.year}
                                  {isGameLogExpanded(y.year, 'kicking') && <span className="ml-1 text-xs">▼</span>}
                                </td>
                                <td className="px-2 py-2.5 w-16" style={{ color: secondaryText, opacity: 0.8 }}>{y.class}</td>
                                <td className="px-2 py-2 text-center w-12">
                                  <Link to={`${pathPrefix}/team/${resolveTid(rowTeam, currentDynasty?.teams || TEAMS)}/${y.year}`} className="hover:opacity-70 transition-opacity">
                                    {logo ? <img src={logo} alt={rowTeam} className="w-5 h-5 object-contain inline-block" /> : rowTeam}
                                  </Link>
                                </td>
                                {primaryStat === 'kicking' && <td className="px-2 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.gamesPlayed}</td>}
                                <td className="px-2 py-2 text-right font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.kicking.fgm}</td>
                                <td className="px-2 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.kicking.fga}</td>
                                <td className="px-2 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{calcPct(y.kicking.fgm, y.kicking.fga)}</td>
                                <td className="px-2 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.kicking.lng}</td>
                                <td className="px-2 py-2 text-right font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.kicking.xpm}</td>
                                <td className="px-2 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.kicking.xpa}</td>
                                <td className="px-2 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{calcPct(y.kicking.xpm, y.kicking.xpa)}</td>
                                {showSnapsCol && <td className="px-2 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.snapsPlayed.toLocaleString()}</td>}
                              </tr>
                              {renderGameLogRow(y.year, colSpan, 'kicking')}
                            </React.Fragment>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-surface-3 border-b-2" style={{ borderBottomColor: teamInfo.backgroundColor }}>
                          <td className="px-2 py-2.5 font-bold w-14" style={{ color: primaryText }}>Career</td>
                          <td className="px-2 py-2 w-16"></td>
                          <td className="px-2 py-2 w-12"></td>
                          {primaryStat === 'kicking' && <td className="px-2 py-2 text-right font-semibold" style={{ color: primaryText }}>{careerGames}</td>}
                          <td className="px-2 py-2 text-right font-bold" style={{ color: primaryText }}>{careerKicking.fgm}</td>
                          <td className="px-2 py-2 text-right tabular-nums" style={{ color: primaryText }}>{careerKicking.fga}</td>
                          <td className="px-2 py-2 text-right font-semibold" style={{ color: primaryText }}>{calcPct(careerKicking.fgm, careerKicking.fga)}</td>
                          <td className="px-2 py-2 text-right tabular-nums" style={{ color: primaryText }}>{careerKicking.lng}</td>
                          <td className="px-2 py-2 text-right font-bold" style={{ color: primaryText }}>{careerKicking.xpm}</td>
                          <td className="px-2 py-2 text-right tabular-nums" style={{ color: primaryText }}>{careerKicking.xpa}</td>
                          <td className="px-2 py-2 text-right font-semibold" style={{ color: primaryText }}>{calcPct(careerKicking.xpm, careerKicking.xpa)}</td>
                          {showSnapsCol && <td className="px-2 py-2 text-right font-semibold" style={{ color: primaryText }}>{careerSnaps.toLocaleString()}</td>}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )
              })()}
            </div>
          )}

          {/* Punting Table */}
          {hasStats.punting && (
            <div className="card overflow-hidden" style={{ order: getStatOrder('punting') }}>
              <div className="px-5 py-3.5 bg-surface-2 border-b border-surface-4 border-l-[3px]" style={{ borderLeftColor: teamInfo.backgroundColor }}>
                <h3 className="text-lg font-black uppercase tracking-widest" style={{ color: 'var(--text-primary)', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '2px' }}>Punting</h3>
              </div>
              {(() => {
                const puntingYearsUnsorted = yearByYearStats.filter(y => y.punting && hasNonZeroStats(y.punting, ['punts', 'yds']))
                const hasAnySnaps = puntingYearsUnsorted.some(y => y.snapsPlayed > 0)
                const showSnapsCol = primaryStat === 'punting' && hasAnySnaps

                // Sort by selected column
                const puntingYears = sortStatYears(puntingYearsUnsorted, 'punting', (y, col) => {
                  const p = y.punting
                  const statMap = { punts: p?.punts, yds: p?.yds, lng: p?.lng, in20: p?.in20, tb: p?.tb }
                  if (col === 'avg') return p?.punts ? p.yds / p.punts : 0
                  return statMap[col] ?? 0
                })

                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-surface-3" style={{ borderBottom: `2px solid ${teamColors.primary}` }}>
                          {renderSortableHeader('punting', 'year', 'Year', 'left', 'w-14')}
                          {renderSortableHeader('punting', 'class', 'Class', 'left', 'w-16')}
                          <th className="px-2 py-2.5 text-xs font-semibold uppercase text-center w-12" style={{ color: secondaryText, opacity: 0.8 }}>Team</th>
                          {primaryStat === 'punting' && renderSortableHeader('punting', 'gamesPlayed', 'G', 'right')}
                          {renderSortableHeader('punting', 'punts', 'Punts', 'right')}
                          {renderSortableHeader('punting', 'yds', 'Yds', 'right')}
                          {renderSortableHeader('punting', 'avg', 'Avg', 'right')}
                          {renderSortableHeader('punting', 'lng', 'Lng', 'right')}
                          {renderSortableHeader('punting', 'in20', 'In20', 'right')}
                          {renderSortableHeader('punting', 'tb', 'TB', 'right')}
                          {showSnapsCol && renderSortableHeader('punting', 'snapsPlayed', 'Snaps', 'right')}
                        </tr>
                      </thead>
                      <tbody style={{ borderTop: `1px solid ${teamInfo.backgroundColor}20` }}>
                        {puntingYears.map((y, idx) => {
                          const rowTeam = y.team || teamAbbr
                          const mascot = getMascotName(rowTeam, dynasty?.teams || dynasty?.customTeams)
                          const logo = mascot ? getTeamLogo(mascot, dynasty?.teams || dynasty?.customTeams) : null
                          const colSpan = 9 + (primaryStat === 'punting' ? 1 : 0) + (showSnapsCol ? 1 : 0)
                          return (
                            <React.Fragment key={y.year}>
                              <tr className="transition-opacity hover:opacity-80" style={{ backgroundColor: isGameLogExpanded(y.year, 'punting') ? `${teamInfo.backgroundColor}15` : idx % 2 === 1 ? 'var(--surface-2)' : 'var(--surface-1)', borderBottom: `1px solid ${teamInfo.backgroundColor}25` }}>
                                <td
                                  className="px-2 py-2.5 font-medium w-14 cursor-pointer hover:underline"
                                  style={{ color: 'var(--text-primary)' }}
                                  onClick={() => toggleGameLog(y.year, 'punting')}
                                  title="Click to view game log"
                                >
                                  {y.year}
                                  {isGameLogExpanded(y.year, 'punting') && <span className="ml-1 text-xs">▼</span>}
                                </td>
                                <td className="px-2 py-2.5 w-16" style={{ color: secondaryText, opacity: 0.8 }}>{y.class}</td>
                                <td className="px-2 py-2 text-center w-12">
                                  <Link to={`${pathPrefix}/team/${resolveTid(rowTeam, currentDynasty?.teams || TEAMS)}/${y.year}`} className="hover:opacity-70 transition-opacity">
                                    {logo ? <img src={logo} alt={rowTeam} className="w-5 h-5 object-contain inline-block" /> : rowTeam}
                                  </Link>
                                </td>
                                {primaryStat === 'punting' && <td className="px-2 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.gamesPlayed}</td>}
                                <td className="px-2 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.punting.punts}</td>
                                <td className="px-2 py-2 text-right font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.punting.yds.toLocaleString()}</td>
                                <td className="px-2 py-2 text-right font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{calcAvg(y.punting.yds, y.punting.punts)}</td>
                                <td className="px-2 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.punting.lng}</td>
                                <td className="px-2 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.punting.in20}</td>
                                <td className="px-2 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.punting.tb}</td>
                                {showSnapsCol && <td className="px-2 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.snapsPlayed.toLocaleString()}</td>}
                              </tr>
                              {renderGameLogRow(y.year, colSpan, 'punting')}
                            </React.Fragment>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-surface-3 border-b-2" style={{ borderBottomColor: teamInfo.backgroundColor }}>
                          <td className="px-2 py-2.5 font-bold w-14" style={{ color: primaryText }}>Career</td>
                          <td className="px-2 py-2 w-16"></td>
                          <td className="px-2 py-2 w-12"></td>
                          {primaryStat === 'punting' && <td className="px-2 py-2 text-right font-semibold" style={{ color: primaryText }}>{careerGames}</td>}
                          <td className="px-2 py-2 text-right font-semibold" style={{ color: primaryText }}>{careerPunting.punts}</td>
                          <td className="px-2 py-2 text-right font-bold" style={{ color: primaryText }}>{careerPunting.yds.toLocaleString()}</td>
                          <td className="px-2 py-2 text-right font-bold" style={{ color: primaryText }}>{calcAvg(careerPunting.yds, careerPunting.punts)}</td>
                          <td className="px-2 py-2 text-right tabular-nums" style={{ color: primaryText }}>{careerPunting.lng}</td>
                          <td className="px-2 py-2 text-right font-semibold" style={{ color: primaryText }}>{careerPunting.in20}</td>
                          <td className="px-2 py-2 text-right tabular-nums" style={{ color: primaryText }}>{careerPunting.tb}</td>
                          {showSnapsCol && <td className="px-2 py-2 text-right font-semibold" style={{ color: primaryText }}>{careerSnaps.toLocaleString()}</td>}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )
              })()}
            </div>
          )}

          {/* Kick Returns Table */}
          {hasStats.kickReturn && (
            <div className="card overflow-hidden" style={{ order: getStatOrder('kickReturn') }}>
              <div className="px-5 py-3.5 bg-surface-2 border-b border-surface-4 border-l-[3px]" style={{ borderLeftColor: teamInfo.backgroundColor }}>
                <h3 className="text-lg font-black uppercase tracking-widest" style={{ color: 'var(--text-primary)', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '2px' }}>Kick Returns</h3>
              </div>
              {(() => {
                const kickReturnYearsUnsorted = yearByYearStats.filter(y => y.kickReturn && hasNonZeroStats(y.kickReturn, ['ret', 'yds', 'td']))

                // Sort by selected column
                const kickReturnYears = sortStatYears(kickReturnYearsUnsorted, 'kickReturn', (y, col) => {
                  const kr = y.kickReturn
                  const statMap = { ret: kr?.ret, yds: kr?.yds, td: kr?.td, lng: kr?.lng }
                  if (col === 'avg') return kr?.ret ? kr.yds / kr.ret : 0
                  return statMap[col] ?? 0
                })

                return (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface-3" style={{ borderBottom: `2px solid ${teamColors.primary}` }}>
                      {renderSortableHeader('kickReturn', 'year', 'Year', 'left', 'w-14')}
                      {renderSortableHeader('kickReturn', 'class', 'Class', 'left', 'w-16')}
                      <th className="px-2 py-2.5 text-xs font-semibold uppercase text-center w-12" style={{ color: secondaryText, opacity: 0.8 }}>Team</th>
                      {renderSortableHeader('kickReturn', 'ret', 'Ret', 'right')}
                      {renderSortableHeader('kickReturn', 'yds', 'Yds', 'right')}
                      {renderSortableHeader('kickReturn', 'avg', 'Avg', 'right')}
                      {renderSortableHeader('kickReturn', 'td', 'TD', 'right')}
                      {renderSortableHeader('kickReturn', 'lng', 'Lng', 'right')}
                    </tr>
                  </thead>
                  <tbody style={{ borderTop: `1px solid ${teamColors.primary}30` }}>
                    {kickReturnYears.map((y, idx) => {
                      const rowTeam = y.team || teamAbbr
                          const mascot = getMascotName(rowTeam, dynasty?.teams || dynasty?.customTeams)
                      const logo = mascot ? getTeamLogo(mascot, dynasty?.teams || dynasty?.customTeams) : null
                      const colSpan = 8
                      return (
                        <React.Fragment key={y.year}>
                          <tr className="transition-opacity hover:opacity-80" style={{ backgroundColor: isGameLogExpanded(y.year, 'kickReturn') ? `${teamColors.primary}20` : idx % 2 === 1 ? 'var(--surface-2)' : 'var(--surface-1)', borderBottom: `1px solid ${teamColors.primary}25` }}>
                            <td
                              className="px-2 py-2.5 font-medium w-14 cursor-pointer hover:underline"
                                  style={{ color: 'var(--text-primary)' }}
                              onClick={() => toggleGameLog(y.year, 'kickReturn')}
                              title="Click to view game log"
                            >
                              {y.year}
                              {isGameLogExpanded(y.year, 'kickReturn') && <span className="ml-1 text-xs">▼</span>}
                            </td>
                            <td className="px-2 py-2.5 w-16" style={{ color: secondaryText, opacity: 0.8 }}>{y.class}</td>
                            <td className="px-2 py-2 text-center w-12">
                                  <Link to={`${pathPrefix}/team/${resolveTid(rowTeam, currentDynasty?.teams || TEAMS)}/${y.year}`} className="hover:opacity-70 transition-opacity">
                                    {logo ? <img src={logo} alt={rowTeam} className="w-5 h-5 object-contain inline-block" /> : rowTeam}
                                  </Link>
                                </td>
                            <td className="px-2 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.kickReturn.ret}</td>
                            <td className="px-2 py-2 text-right font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.kickReturn.yds}</td>
                            <td className="px-2 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{calcAvg(y.kickReturn.yds, y.kickReturn.ret)}</td>
                            <td className="px-2 py-2 text-right font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.kickReturn.td}</td>
                            <td className="px-2 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.kickReturn.lng}</td>
                          </tr>
                          {renderGameLogRow(y.year, colSpan, 'kickReturn')}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-surface-3 border-t-2" style={{ borderTopColor: teamColors.primary }}>
                      <td className="px-2 py-2.5 font-bold w-14 text-txt-primary">Career</td>
                      <td className="px-2 py-2 w-16"></td>
                      <td className="px-2 py-2 w-12"></td>
                      <td className="px-2 py-2 text-right font-semibold text-txt-primary">{careerKickReturn.ret}</td>
                      <td className="px-2 py-2 text-right font-bold text-txt-primary">{careerKickReturn.yds.toLocaleString()}</td>
                      <td className="px-2 py-2 text-right text-txt-secondary">{calcAvg(careerKickReturn.yds, careerKickReturn.ret)}</td>
                      <td className="px-2 py-2 text-right font-bold text-txt-primary">{careerKickReturn.td}</td>
                      <td className="px-2 py-2 text-right text-txt-secondary">{careerKickReturn.lng}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
                )
              })()}
            </div>
          )}

          {/* Punt Returns Table */}
          {hasStats.puntReturn && (
            <div className="card overflow-hidden" style={{ order: getStatOrder('puntReturn') }}>
              <div className="px-5 py-3.5 bg-surface-2 border-b border-surface-4 border-l-[3px]" style={{ borderLeftColor: teamInfo.backgroundColor }}>
                <h3 className="text-lg font-black uppercase tracking-widest" style={{ color: 'var(--text-primary)', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '2px' }}>Punt Returns</h3>
              </div>
              {(() => {
                const puntReturnYearsUnsorted = yearByYearStats.filter(y => y.puntReturn && hasNonZeroStats(y.puntReturn, ['ret', 'yds', 'td']))

                // Sort by selected column
                const puntReturnYears = sortStatYears(puntReturnYearsUnsorted, 'puntReturn', (y, col) => {
                  const pr = y.puntReturn
                  const statMap = { ret: pr?.ret, yds: pr?.yds, td: pr?.td, lng: pr?.lng }
                  if (col === 'avg') return pr?.ret ? pr.yds / pr.ret : 0
                  return statMap[col] ?? 0
                })

                return (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface-3" style={{ borderBottom: `2px solid ${teamColors.primary}` }}>
                      {renderSortableHeader('puntReturn', 'year', 'Year', 'left', 'w-14')}
                      {renderSortableHeader('puntReturn', 'class', 'Class', 'left', 'w-16')}
                      <th className="px-2 py-2.5 text-xs font-semibold uppercase text-center w-12" style={{ color: secondaryText, opacity: 0.8 }}>Team</th>
                      {renderSortableHeader('puntReturn', 'ret', 'Ret', 'right')}
                      {renderSortableHeader('puntReturn', 'yds', 'Yds', 'right')}
                      {renderSortableHeader('puntReturn', 'avg', 'Avg', 'right')}
                      {renderSortableHeader('puntReturn', 'td', 'TD', 'right')}
                      {renderSortableHeader('puntReturn', 'lng', 'Lng', 'right')}
                    </tr>
                  </thead>
                  <tbody style={{ borderTop: `1px solid ${teamColors.primary}30` }}>
                    {puntReturnYears.map((y, idx) => {
                      const rowTeam = y.team || teamAbbr
                          const mascot = getMascotName(rowTeam, dynasty?.teams || dynasty?.customTeams)
                      const logo = mascot ? getTeamLogo(mascot, dynasty?.teams || dynasty?.customTeams) : null
                      const colSpan = 8
                      return (
                        <React.Fragment key={y.year}>
                          <tr className="transition-opacity hover:opacity-80" style={{ backgroundColor: isGameLogExpanded(y.year, 'puntReturn') ? `${teamColors.primary}20` : idx % 2 === 1 ? 'var(--surface-2)' : 'var(--surface-1)', borderBottom: `1px solid ${teamColors.primary}25` }}>
                            <td
                              className="px-2 py-2.5 font-medium w-14 cursor-pointer hover:underline"
                                  style={{ color: 'var(--text-primary)' }}
                              onClick={() => toggleGameLog(y.year, 'puntReturn')}
                              title="Click to view game log"
                            >
                              {y.year}
                              {isGameLogExpanded(y.year, 'puntReturn') && <span className="ml-1 text-xs">▼</span>}
                            </td>
                            <td className="px-2 py-2.5 w-16" style={{ color: secondaryText, opacity: 0.8 }}>{y.class}</td>
                            <td className="px-2 py-2 text-center w-12">
                                  <Link to={`${pathPrefix}/team/${resolveTid(rowTeam, currentDynasty?.teams || TEAMS)}/${y.year}`} className="hover:opacity-70 transition-opacity">
                                    {logo ? <img src={logo} alt={rowTeam} className="w-5 h-5 object-contain inline-block" /> : rowTeam}
                                  </Link>
                                </td>
                            <td className="px-2 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.puntReturn.ret}</td>
                            <td className="px-2 py-2 text-right font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.puntReturn.yds}</td>
                            <td className="px-2 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{calcAvg(y.puntReturn.yds, y.puntReturn.ret)}</td>
                            <td className="px-2 py-2 text-right font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.puntReturn.td}</td>
                            <td className="px-2 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{y.puntReturn.lng}</td>
                          </tr>
                          {renderGameLogRow(y.year, colSpan, 'puntReturn')}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-surface-3 border-t-2" style={{ borderTopColor: teamColors.primary }}>
                      <td className="px-2 py-2.5 font-bold w-14 text-txt-primary">Career</td>
                      <td className="px-2 py-2 w-16"></td>
                      <td className="px-2 py-2 w-12"></td>
                      <td className="px-2 py-2 text-right font-semibold text-txt-primary">{careerPuntReturn.ret}</td>
                      <td className="px-2 py-2 text-right font-bold text-txt-primary">{careerPuntReturn.yds.toLocaleString()}</td>
                      <td className="px-2 py-2 text-right text-txt-secondary">{calcAvg(careerPuntReturn.yds, careerPuntReturn.ret)}</td>
                      <td className="px-2 py-2 text-right font-bold text-txt-primary">{careerPuntReturn.td}</td>
                      <td className="px-2 py-2 text-right text-txt-secondary">{careerPuntReturn.lng}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
                )
              })()}
            </div>
          )}
        </div>
        )
      })()}

      {/* Awards Section - all honors in one place */}
      {activeTab === 'awards' && (() => {
        // Award display name mapping
        const awardLabels = {
          heisman: 'Heisman Trophy',
          heismanTrophy: 'Heisman Trophy',
          heismanFinalist: 'Heisman Finalist',
          allAm1st: 'All-American 1st Team',
          allAm2nd: 'All-American 2nd Team',
          allAmFr: 'Freshman All-American',
          allConf1st: 'All-Conference 1st Team',
          allConf2nd: 'All-Conference 2nd Team',
          allConfFr: 'Freshman All-Conference',
          confPOW: 'Conference Player of the Week',
          nationalPOW: 'National Player of the Week',
          confPOY: 'Conference Player of the Year',
          confOPOY: 'Conference Offensive POY',
          confDPOY: 'Conference Defensive POY',
          confFreshmanOY: 'Conference Freshman of the Year',
          bowlMVP: 'Bowl Game MVP',
          cfpChampMVP: 'CFP Championship MVP',
          // Major awards from sheets
          doakWalkerAward: 'Doak Walker Award',
          daveyObrienAward: "Davey O'Brien Award",
          maxwellAward: 'Maxwell Award',
          walterCampAward: 'Walter Camp Award',
          chuckBednarikAward: 'Chuck Bednarik Award',
          bronkoNagurskiTrophy: 'Bronko Nagurski Trophy',
          butkusAward: 'Butkus Award',
          lombardiAward: 'Lombardi Award',
          outlandTrophy: 'Outland Trophy',
          jimThorpeAward: 'Jim Thorpe Award',
          tedHendricksAward: 'Ted Hendricks Award',
          biletnikoffAward: 'Biletnikoff Award',
          johnMackeyAward: 'John Mackey Award',
          rimingtonTrophy: 'Rimington Trophy',
          rayGuyAward: 'Ray Guy Award',
          louGrozaAward: 'Lou Groza Award',
          paulHornungAward: 'Paul Hornung Award',
        }

        // Fallback: format unknown awards properly (capitalize each word)
        const formatAwardName = (award) => {
          if (awardLabels[award]) return awardLabels[award]
          // Convert camelCase to Title Case if needed
          return award
            .replace(/([A-Z])/g, ' $1')
            .trim()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ')
        }

        // Get accolades from new format
        const accolades = player.accolades || []
        const allAmericans = player.allAmericans || []
        const allConference = player.allConference || []

        // Check if we have any awards to show
        const hasAwards = powHonors.confPOW > 0 || powHonors.nationalPOW > 0 ||
          accolades.length > 0 || allAmericans.length > 0 || allConference.length > 0

        if (!hasAwards) return null

        // Group accolades by award type for counting multiples
        const accoladesByType = accolades.reduce((acc, a) => {
          if (!acc[a.award]) acc[a.award] = []
          acc[a.award].push(a.year)
          return acc
        }, {})

        // Group All-Americans by designation for display
        const allAmericansByDesignation = allAmericans.reduce((acc, a) => {
          const key = a.designation || 'first'
          if (!acc[key]) acc[key] = []
          acc[key].push(a.year)
          return acc
        }, {})

        // Group All-Conference by designation for display
        const allConferenceByDesignation = allConference.reduce((acc, a) => {
          const key = a.designation || 'first'
          if (!acc[key]) acc[key] = []
          acc[key].push(a.year)
          return acc
        }, {})

        return (
          <div
            className="card p-4 sm:p-6 border-l-[3px]"
            style={{ borderLeftColor: teamColors.primary }}
          >
            <h2 className="text-xl font-bold mb-4" style={{ color: secondaryText }}>Awards</h2>
            <div className="space-y-1">
              {/* POW honors from game data */}
              {powHonors.confPOW > 0 && (
                <button
                  onClick={() => handleAccoladeClick('confPOW')}
                  className="block text-left hover:opacity-70 transition-opacity"
                >
                  <span className="font-semibold" style={{ color: secondaryText }}>Conference Player of the Week</span>
                  <span style={{ color: secondaryText, opacity: 0.7 }}> ({powHonors.confPOW}x)</span>
                </button>
              )}
              {powHonors.nationalPOW > 0 && (
                <button
                  onClick={() => handleAccoladeClick('nationalPOW')}
                  className="block text-left hover:opacity-70 transition-opacity"
                >
                  <span className="font-semibold" style={{ color: secondaryText }}>National Player of the Week</span>
                  <span style={{ color: secondaryText, opacity: 0.7 }}> ({powHonors.nationalPOW}x)</span>
                </button>
              )}
              {/* Render per-year year-chips that link to the respective
                  honor page for that year. Clicking the label links to the
                  most recent year's page. POW awards above stay as modals. */}
              {Object.entries(accoladesByType)
                .filter(([award]) => award !== 'confPOW' && award !== 'nationalPOW')
                .map(([award, years]) => {
                  const label = formatAwardName(award)
                  const sortedYears = [...years].sort((a, b) => b - a)
                  return (
                    <div key={award} className="flex flex-wrap items-baseline gap-x-1">
                      <Link
                        to={`${pathPrefix}/awards/${sortedYears[0]}`}
                        className="font-semibold hover:underline transition-colors"
                        style={{ color: secondaryText }}
                      >
                        {label}
                      </Link>
                      <span style={{ color: secondaryText, opacity: 0.7 }}>(</span>
                      {sortedYears.map((yr, i) => (
                        <span key={yr} style={{ color: secondaryText, opacity: 0.7 }}>
                          <Link
                            to={`${pathPrefix}/awards/${yr}`}
                            className="hover:underline"
                            style={{ color: secondaryText }}
                          >
                            {yr}
                          </Link>
                          {i < sortedYears.length - 1 ? ', ' : ''}
                        </span>
                      ))}
                      <span style={{ color: secondaryText, opacity: 0.7 }}>)</span>
                    </div>
                  )
                })}
              {/* All-Americans — per-year links to /all-americans/:year */}
              {Object.entries(allAmericansByDesignation).map(([designation, years]) => {
                const label = designation === 'first' ? 'All-American (1st Team)' :
                              designation === 'second' ? 'All-American (2nd Team)' :
                              designation === 'freshman' ? 'Freshman All-American' :
                              `All-American (${designation})`
                const sortedYears = [...years].sort((a, b) => b - a)
                return (
                  <div key={`aa-${designation}`} className="flex flex-wrap items-baseline gap-x-1">
                    <Link
                      to={`${pathPrefix}/all-americans/${sortedYears[0]}`}
                      className="font-semibold hover:underline transition-colors"
                      style={{ color: secondaryText }}
                    >
                      {label}
                    </Link>
                    <span style={{ color: secondaryText, opacity: 0.7 }}>(</span>
                    {sortedYears.map((yr, i) => (
                      <span key={yr} style={{ color: secondaryText, opacity: 0.7 }}>
                        <Link
                          to={`${pathPrefix}/all-americans/${yr}`}
                          className="hover:underline"
                          style={{ color: secondaryText }}
                        >
                          {yr}
                        </Link>
                        {i < sortedYears.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                    <span style={{ color: secondaryText, opacity: 0.7 }}>)</span>
                  </div>
                )
              })}
              {/* All-Conference — per-year links to /all-conference/:year */}
              {Object.entries(allConferenceByDesignation).map(([designation, years]) => {
                const label = designation === 'first' ? 'All-Conference (1st Team)' :
                              designation === 'second' ? 'All-Conference (2nd Team)' :
                              designation === 'freshman' ? 'Freshman All-Conference' :
                              `All-Conference (${designation})`
                const sortedYears = [...years].sort((a, b) => b - a)
                return (
                  <div key={`ac-${designation}`} className="flex flex-wrap items-baseline gap-x-1">
                    <Link
                      to={`${pathPrefix}/all-conference/${sortedYears[0]}`}
                      className="font-semibold hover:underline transition-colors"
                      style={{ color: secondaryText }}
                    >
                      {label}
                    </Link>
                    <span style={{ color: secondaryText, opacity: 0.7 }}>(</span>
                    {sortedYears.map((yr, i) => (
                      <span key={yr} style={{ color: secondaryText, opacity: 0.7 }}>
                        <Link
                          to={`${pathPrefix}/all-conference/${yr}`}
                          className="hover:underline"
                          style={{ color: secondaryText }}
                        >
                          {yr}
                        </Link>
                        {i < sortedYears.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                    <span style={{ color: secondaryText, opacity: 0.7 }}>)</span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Notes & Media */}
      {(player.notes || (player.links && player.links.length > 0)) && (
        <div
          className="card p-4 sm:p-6 border-l-[3px]"
          style={{ borderLeftColor: teamColors.primary }}
        >
          <h2 className="text-xl font-bold mb-4" style={{ color: secondaryText }}>Notes & Media</h2>
          {player.notes && (
            <div className="mb-4">
              <div className="p-4 rounded-lg whitespace-pre-wrap bg-surface-2 text-txt-primary">
                {player.notes}
              </div>
            </div>
          )}
          {player.links && player.links.length > 0 && (
            <div className="space-y-4">
              {/* Embeddable Media */}
              {player.links.filter(link => link.url).map((link, index) => {
                const url = link.url

                // YouTube embed
                if (url.includes('youtube.com/watch') || url.includes('youtu.be/') || url.includes('youtube.com/embed')) {
                  let videoId = null
                  let startTime = null

                  if (url.includes('youtube.com/watch')) {
                    const urlParams = new URLSearchParams(url.split('?')[1])
                    videoId = urlParams.get('v')
                    startTime = urlParams.get('t')
                  } else if (url.includes('youtu.be/')) {
                    const parts = url.split('youtu.be/')[1]
                    videoId = parts?.split('?')[0]?.split('&')[0]
                    // Extract timestamp from youtu.be URLs (format: ?t=477)
                    if (parts?.includes('?')) {
                      const urlParams = new URLSearchParams(parts.split('?')[1])
                      startTime = urlParams.get('t')
                    }
                  } else if (url.includes('youtube.com/embed/')) {
                    const parts = url.split('youtube.com/embed/')[1]
                    videoId = parts?.split('?')[0]?.split('&')[0]
                    if (parts?.includes('?')) {
                      const urlParams = new URLSearchParams(parts.split('?')[1])
                      startTime = urlParams.get('start') || urlParams.get('t')
                    }
                  }

                  if (!videoId) return null

                  // Build embed URL with timestamp if present
                  let embedUrl = `https://www.youtube.com/embed/${videoId}`
                  const embedParams = []
                  if (startTime) {
                    embedParams.push(`start=${startTime}`)
                  }
                  // Add parameters to help with embedding
                  embedParams.push('rel=0')
                  embedParams.push('modestbranding=1')

                  if (embedParams.length > 0) {
                    embedUrl += `?${embedParams.join('&')}`
                  }

                  // Build watch URL for fallback link
                  let watchUrl = `https://www.youtube.com/watch?v=${videoId}`
                  if (startTime) {
                    watchUrl += `&t=${startTime}`
                  }

                  return (
                    <div key={index} className="rounded-lg overflow-hidden">
                      {link.title && (
                        <div className="px-3 py-2 text-sm font-semibold bg-surface-3 text-txt-primary border-l-[3px]" style={{ borderLeftColor: teamColors.primary }}>
                          {link.title}
                        </div>
                      )}
                      <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                        <iframe
                          className="absolute top-0 left-0 w-full h-full"
                          src={embedUrl}
                          title={link.title || 'YouTube video'}
                          frameBorder="0"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      </div>
                      {/* Fallback link if embed is blocked */}
                      <div className="px-3 py-2 text-center bg-surface-3">
                        <a
                          href={watchUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-semibold hover:underline text-txt-primary"
                        >
                          Watch on YouTube →
                        </a>
                      </div>
                    </div>
                  )
                }

                // Streamable embed
                if (url.includes('streamable.com/')) {
                  const videoId = url.split('streamable.com/')[1]?.split('?')[0]
                  if (!videoId) return null

                  return (
                    <div key={index} className="rounded-lg overflow-hidden">
                      {link.title && (
                        <div className="px-3 py-2 text-sm font-semibold bg-surface-3 text-txt-primary border-l-[3px]" style={{ borderLeftColor: teamColors.primary }}>
                          {link.title}
                        </div>
                      )}
                      <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                        <iframe
                          className="absolute top-0 left-0 w-full h-full"
                          src={`https://streamable.com/e/${videoId}`}
                          title={link.title || 'Streamable video'}
                          frameBorder="0"
                          allowFullScreen
                        />
                      </div>
                    </div>
                  )
                }

                // Imgur image/video embed (supports .mp4, .gifv, .gif, direct images)
                if (url.includes('imgur.com') || url.includes('i.imgur.com')) {
                  // Direct image links
                  if (url.match(/\.(jpg|jpeg|png|gif|webp)$/i) || url.includes('i.imgur.com')) {
                    // Convert gifv to mp4
                    const displayUrl = url.replace('.gifv', '.mp4')
                    const isVideo = displayUrl.endsWith('.mp4') || displayUrl.endsWith('.gifv')

                    return (
                      <div key={index} className="rounded-lg overflow-hidden">
                        {link.title && (
                          <div className="px-3 py-2 text-sm font-semibold bg-surface-3 text-txt-primary border-l-[3px]" style={{ borderLeftColor: teamColors.primary }}>
                            {link.title}
                          </div>
                        )}
                        {isVideo ? (
                          <video
                            className="w-full max-h-[500px] object-contain bg-black"
                            src={displayUrl}
                            controls
                            loop
                            muted
                            playsInline
                          />
                        ) : (
                          <img
                            src={displayUrl}
                            alt={link.title || 'Imgur image'}
                            className="w-full max-h-[500px] object-contain"
                          />
                        )}
                      </div>
                    )
                  }

                  // Imgur album or post page - extract ID and use embed
                  const imgurMatch = url.match(/imgur\.com\/(?:a\/|gallery\/)?([a-zA-Z0-9]+)/)
                  if (imgurMatch) {
                    const imgurId = imgurMatch[1]
                    return (
                      <div key={index} className="rounded-lg overflow-hidden">
                        {link.title && (
                          <div className="px-3 py-2 text-sm font-semibold bg-surface-3 text-txt-primary border-l-[3px]" style={{ borderLeftColor: teamColors.primary }}>
                            {link.title}
                          </div>
                        )}
                        <blockquote className="imgur-embed-pub" lang="en" data-id={imgurId}>
                          <a href={url} target="_blank" rel="noopener noreferrer">View on Imgur</a>
                        </blockquote>
                        <img
                          src={`https://i.imgur.com/${imgurId}.jpg`}
                          alt={link.title || 'Imgur image'}
                          className="w-full max-h-[500px] object-contain"
                          onError={(e) => {
                            // Try .png if .jpg fails
                            if (e.target.src.endsWith('.jpg')) {
                              e.target.src = `https://i.imgur.com/${imgurId}.png`
                            }
                          }}
                        />
                      </div>
                    )
                  }
                }

                // Twitter/X embed (video clips)
                if (url.includes('twitter.com') || url.includes('x.com')) {
                  return (
                    <div key={index} className="rounded-lg overflow-hidden">
                      {link.title && (
                        <div className="px-3 py-2 text-sm font-semibold bg-surface-3 text-txt-primary border-l-[3px]" style={{ borderLeftColor: teamColors.primary }}>
                          {link.title}
                        </div>
                      )}
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block px-4 py-3 hover:opacity-80 transition-opacity flex items-center gap-2"
                        style={{ backgroundColor: `${teamColors.primary}15`, color: secondaryText }}
                      >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                        </svg>
                        <span className="font-medium">{link.title || 'View on X/Twitter'}</span>
                      </a>
                    </div>
                  )
                }

                // Direct image URLs (jpg, png, gif, webp)
                if (url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
                  return (
                    <div key={index} className="rounded-lg overflow-hidden">
                      {link.title && (
                        <div className="px-3 py-2 text-sm font-semibold bg-surface-3 text-txt-primary border-l-[3px]" style={{ borderLeftColor: teamColors.primary }}>
                          {link.title}
                        </div>
                      )}
                      <img
                        src={url}
                        alt={link.title || 'Image'}
                        className="w-full max-h-[500px] object-contain"
                      />
                    </div>
                  )
                }

                // Direct video URLs (mp4, webm)
                if (url.match(/\.(mp4|webm)$/i)) {
                  return (
                    <div key={index} className="rounded-lg overflow-hidden">
                      {link.title && (
                        <div className="px-3 py-2 text-sm font-semibold bg-surface-3 text-txt-primary border-l-[3px]" style={{ borderLeftColor: teamColors.primary }}>
                          {link.title}
                        </div>
                      )}
                      <video
                        className="w-full max-h-[500px] object-contain bg-black"
                        src={url}
                        controls
                        playsInline
                      />
                    </div>
                  )
                }

                // Default: Regular link button
                return (
                  <a
                    key={index}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex px-4 py-2 rounded-lg font-semibold text-sm hover:opacity-80 transition-opacity items-center gap-2"
                    style={{ backgroundColor: teamColors.primary, color: getContrastTextColor(teamColors.primary) }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    {link.title || url}
                  </a>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Game Log Tab */}
      {activeTab === 'gamelog' && (() => {
        if (playerGameLog.length === 0) {
          return (
            <div className="text-center py-8" style={{ color: secondaryText }}>
              <p>No game log data available</p>
            </div>
          )
        }

        // Group games by year
        const gamesByYear = {}
        playerGameLog.forEach(entry => {
          const year = entry.game.year
          if (!gamesByYear[year]) gamesByYear[year] = []
          gamesByYear[year].push(entry)
        })

        // Collect all scoring plays across all games for this player
        const normalizeName = (name) => name?.toLowerCase().trim() || ''
        const playerNameNorm = normalizeName(player.name)

        // Order games oldest → newest, then within each game sort plays into
        // chronological order (Q1 → OT, higher timeLeft first). This keeps
        // running scores accurate and prevents the modal from showing a
        // late-game TD before an earlier one from the same game.
        const allPlayerScoringPlays = [...playerGameLog]
          .sort((a, b) =>
            (a.game.year - b.game.year) ||
            ((a.game.week ?? 0) - (b.game.week ?? 0))
          )
          .flatMap(entry => {
            const game = entry.game
            const scoringSummary = sortPlaysChronologically(game.boxScore?.scoringSummary)

            // Calculate running score for all plays in this game
            const getPlayPoints = (play) => {
              const scoreType = play.scoreType || ''
              const patResult = play.patResult || ''

              if (scoreType.includes('TD') && !scoreType.includes('2PT')) {
                let points = 6
                if (patResult.includes('Made XP')) points += 1
                else if (patResult.includes('Converted 2PT')) points += 2
                return points
              }
              if (scoreType === 'Field Goal') return 3
              if (scoreType === 'Safety') return 2
              return 0
            }

            // Tid-based "is this play from the player's team?" — same
            // pattern as allPlayerScoringPlays (above) and the per-game
            // path. Falls back to abbr compare for legacy games without
            // team1Tid/team2Tid.
            const inT1Tid = game.team1Tid != null ? Number(game.team1Tid) : null
            const inT2Tid = game.team2Tid != null ? Number(game.team2Tid) : null
            const inT1Abbr = inT1Tid != null ? dynasty.teams?.[inT1Tid]?.abbr?.toUpperCase() : null
            const inT2Abbr = inT2Tid != null ? dynasty.teams?.[inT2Tid]?.abbr?.toUpperCase() : null
            const inPlayerTid = player.teamsByYear?.[game.year] != null
              ? Number(player.teamsByYear[game.year])
              : null
            const inPlayerAbbr = (
              inPlayerTid != null && inPlayerTid === inT1Tid ? inT1Abbr :
              inPlayerTid != null && inPlayerTid === inT2Tid ? inT2Abbr :
              (dynasty.teams?.[inPlayerTid]?.abbr || getCurrentTeamAbbr(dynasty))?.toUpperCase()
            )

            // Calculate running scores for all plays
            let playerTeamScore = 0
            let opponentScore = 0
            const playsWithRunningScore = scoringSummary.map(play => {
              const points = getPlayPoints(play)
              const playU = play.team?.toUpperCase()
              let isPlayerTeam
              if (inT1Tid != null && inT2Tid != null && inPlayerTid != null && inT1Abbr && inT2Abbr) {
                const playTid = playU === inT1Abbr ? inT1Tid : (playU === inT2Abbr ? inT2Tid : null)
                isPlayerTeam = playTid != null ? playTid === inPlayerTid : (playU === inPlayerAbbr)
              } else {
                isPlayerTeam = playU === inPlayerAbbr
              }

              if (isPlayerTeam) {
                playerTeamScore += points
              } else {
                opponentScore += points
              }

              return {
                ...play,
                runningPlayerScore: playerTeamScore,
                runningOpponentScore: opponentScore
              }
            })

            // Filter to only player's scoring plays
            return playsWithRunningScore
              .filter(play => {
                if (!play.videoLink) return false

                // Include if player is the scorer
                if (normalizeName(play.scorer) === playerNameNorm) return true

                // Include passing TDs if player is the passer (QB)
                if (play.scoreType?.includes('TD') && play.passer && normalizeName(play.passer) === playerNameNorm) return true

                return false
              })
              .map(play => ({
                ...play,
                gameInfo: {
                  gameId: game.gameId || game.gid || game.id,
                  week: game.week,
                  year: game.year,
                  opponent: game.opponent,
                  opponentTid: game.opponentTid,
                  opponentLogo: game.opponentTid ? getTeamLogoByTid(game.opponentTid, dynasty.teams) : null,
                  result: game.result
                }
              }))
          })

        return (
          <div className="space-y-6">
            {allPlayerScoringPlays.length > 0 && (
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    setSelectedGameScoringPlays({
                      plays: allPlayerScoringPlays,
                      opponent: 'All Games'
                    })
                    setShowScoringHighlightsModal(true)
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all shadow-lg hover:shadow-xl"
                  style={{
                    backgroundColor: teamInfo.backgroundColor,
                    color: primaryText
                  }}
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  <span className="font-bold text-sm uppercase tracking-wider" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                    Watch All Scores ({allPlayerScoringPlays.length})
                  </span>
                </button>
              </div>
            )}

            {Object.entries(gamesByYear).sort(([a], [b]) => b - a).map(([year, games]) => (
              <div key={year} className="card overflow-hidden">
                <div className="px-4 py-3 bg-surface-2 border-b border-surface-4 border-l-[3px]" style={{ borderLeftColor: teamInfo.backgroundColor }}>
                  <h3 className="text-lg font-black uppercase tracking-widest" style={{ color: 'var(--text-primary)', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '2px' }}>
                    {year} Season
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-surface-3" style={{ borderBottom: `2px solid ${teamColors.primary}` }}>
                        <th className="px-2 py-2.5 text-xs font-semibold uppercase text-left" style={{ color: secondaryText, opacity: 0.8 }}>Week</th>
                        <th className="px-2 py-2.5 text-xs font-semibold uppercase text-left" style={{ color: secondaryText, opacity: 0.8 }}>Opponent</th>
                        <th className="px-2 py-2.5 text-xs font-semibold uppercase text-center" style={{ color: secondaryText, opacity: 0.8 }}>Result</th>
                        <th className="px-2 py-2.5 text-xs font-semibold uppercase text-center" style={{ color: secondaryText, opacity: 0.8 }}>Score</th>
                        <th className="px-2 py-2.5 text-xs font-semibold uppercase text-left" style={{ color: secondaryText, opacity: 0.8 }}>Stats</th>
                        <th className="px-2 py-2.5 text-xs font-semibold uppercase text-center" style={{ color: secondaryText, opacity: 0.8 }}>Scoring Plays</th>
                      </tr>
                    </thead>
                    <tbody>
                      {games.map((entry, idx) => {
                        const { game, stats } = entry
                        const location = game.location === 'neutral' ? 'vs' : (game.location === 'home' ? 'vs' : '@')
                        const resultColor = game.result === 'W' ? '#10b981' : '#ef4444'

                        // Format stats based on category
                        let statDisplay = ''
                        if (stats.category === 'passing') {
                          const completions = stats.comp ?? stats.cmp ?? stats.completions ?? 0
                          const attempts = stats.att ?? stats.attempts ?? stats.passAttempts ?? 0
                          const yards = stats.yards ?? stats.yds ?? stats.passYards ?? 0
                          const touchdowns = stats.tD ?? stats.td ?? stats.passTD ?? 0
                          const interceptions = stats.iNT ?? stats.int ?? stats.interceptions ?? 0
                          statDisplay = `${completions}/${attempts}, ${yards} yds, ${touchdowns} TD${interceptions > 0 ? `, ${interceptions} INT` : ''}`
                        } else if (stats.category === 'rushing') {
                          const carries = stats.carries ?? stats.car ?? stats.rushAttempts ?? 0
                          const yards = stats.yards ?? stats.yds ?? stats.rushYards ?? 0
                          const touchdowns = stats.tD ?? stats.td ?? stats.rushTD ?? 0
                          statDisplay = `${carries} car, ${yards} yds, ${touchdowns} TD`
                        } else if (stats.category === 'receiving') {
                          const receptions = stats.receptions ?? stats.rec ?? stats.catches ?? 0
                          const yards = stats.yards ?? stats.yds ?? stats.recYards ?? 0
                          const touchdowns = stats.tD ?? stats.td ?? stats.recTD ?? 0
                          statDisplay = `${receptions} rec, ${yards} yds, ${touchdowns} TD`
                        } else if (stats.category === 'defense') {
                          const tackles = (stats.solo ?? 0) + (stats.assists ?? 0)
                          const parts = []
                          if (tackles > 0) parts.push(`${tackles} tkl`)
                          if ((stats.tFL ?? 0) > 0) parts.push(`${stats.tFL} TFL`)
                          if ((stats.sack ?? 0) > 0) parts.push(`${stats.sack} sck`)
                          if ((stats.iNT ?? 0) > 0) parts.push(`${stats.iNT} INT`)
                          if ((stats.deflections ?? 0) > 0) parts.push(`${stats.deflections} PD`)
                          if ((stats.fF ?? 0) > 0) parts.push(`${stats.fF} FF`)
                          statDisplay = parts.join(', ') ?? 'No stats'
                        } else if (stats.category === 'kicking') {
                          const fgDisplay = `${stats.fGM ?? 0}/${stats.fGA ?? 0} FG`
                          const xpDisplay = `${stats.xPM ?? 0}/${stats.xPA ?? 0} XP`
                          statDisplay = `${fgDisplay}, ${xpDisplay}`
                        } else if (stats.category === 'punting') {
                          const punts = stats.punts ?? 0
                          const yards = stats.yards ?? 0
                          const avg = punts > 0 ? (yards / punts).toFixed(1) : '0.0'
                          statDisplay = `${punts} punts, ${yards} yds, ${avg} avg`
                        } else if (stats.category === 'kickReturn') {
                          statDisplay = `${stats.kR ?? 0} ret, ${stats.yards ?? 0} yds, ${stats.tD ?? 0} TD`
                        } else if (stats.category === 'puntReturn') {
                          statDisplay = `${stats.pR ?? 0} ret, ${stats.yards ?? 0} yds, ${stats.tD ?? 0} TD`
                        }

                        // Filter scoring plays for this player with running scores
                        const normalizeName = (name) => name?.toLowerCase().trim() || ''
                        const playerNameNorm = normalizeName(player.name)

                        // Sort plays chronologically so running scores accumulate
                        // in real game order and the per-game modal lists them Q1 → OT.
                        const scoringSummary = sortPlaysChronologically(game.boxScore?.scoringSummary)

                        // Calculate running score for all plays in this game
                        const getPlayPoints = (play) => {
                          const scoreType = play.scoreType || ''
                          const patResult = play.patResult || ''

                          if (scoreType.includes('TD') && !scoreType.includes('2PT')) {
                            let points = 6
                            if (patResult.includes('Made XP')) points += 1
                            else if (patResult.includes('Converted 2PT')) points += 2
                            return points
                          }
                          if (scoreType === 'Field Goal') return 3
                          if (scoreType === 'Safety') return 2
                          return 0
                        }

                        // Per-game player team — derive from teamsByYear so
                        // prior-year highlights credit the correct side and
                        // show the correct logo even after a transfer.
                        // Tid-based resolution; see allPlayerScoringPlays
                        // for the full rationale (abbr drift on teambuilder
                        // teams).
                        const gT1Tid = game.team1Tid != null ? Number(game.team1Tid) : null
                        const gT2Tid = game.team2Tid != null ? Number(game.team2Tid) : null
                        const gT1Abbr = gT1Tid != null ? dynasty.teams?.[gT1Tid]?.abbr?.toUpperCase() : null
                        const gT2Abbr = gT2Tid != null ? dynasty.teams?.[gT2Tid]?.abbr?.toUpperCase() : null
                        const gamePlayerTeamTid = player.teamsByYear?.[game.year] != null
                          ? Number(player.teamsByYear[game.year])
                          : null
                        const gamePlayerTeamAbbr = (
                          gamePlayerTeamTid != null && gamePlayerTeamTid === gT1Tid ? gT1Abbr :
                          gamePlayerTeamTid != null && gamePlayerTeamTid === gT2Tid ? gT2Abbr :
                          (dynasty.teams?.[gamePlayerTeamTid]?.abbr || getCurrentTeamAbbr(dynasty))?.toUpperCase()
                        )
                        const gamePlayerTeamLogo = gamePlayerTeamTid != null
                          ? getTeamLogoByTid(gamePlayerTeamTid, dynasty.teams)
                          : null

                        const resolveGamePlayTid = (playTeamStr) => {
                          const u = playTeamStr?.toUpperCase()
                          if (!u) return null
                          if (gT1Abbr && u === gT1Abbr) return gT1Tid
                          if (gT2Abbr && u === gT2Abbr) return gT2Tid
                          return null
                        }

                        let playerTeamScore = 0
                        let opponentScore = 0
                        const playsWithRunningScore = scoringSummary.map(play => {
                          const points = getPlayPoints(play)
                          const playTid = resolveGamePlayTid(play.team)
                          const isPlayerTeam = playTid != null && gamePlayerTeamTid != null
                            ? playTid === gamePlayerTeamTid
                            : play.team?.toUpperCase() === gamePlayerTeamAbbr

                          if (isPlayerTeam) {
                            playerTeamScore += points
                          } else {
                            opponentScore += points
                          }

                          return {
                            ...play,
                            runningPlayerScore: playerTeamScore,
                            runningOpponentScore: opponentScore,
                            gameInfo: {
                              gameId: game.gameId || game.gid || game.id,
                              week: game.week,
                              year: game.year,
                              opponent: game.opponent,
                              opponentTid: game.opponentTid,
                              opponentLogo: game.opponentTid ? getTeamLogoByTid(game.opponentTid, dynasty.teams) : null,
                              playerTeamTid: gamePlayerTeamTid,
                              playerTeamAbbr: gamePlayerTeamAbbr,
                              playerTeamLogo: gamePlayerTeamLogo,
                              result: game.result
                            }
                          }
                        })

                        // Filter to only player's scoring plays
                        const playerScoringPlays = playsWithRunningScore.filter(play => {
                          if (!play.videoLink) return false

                          // Include if player is the scorer
                          if (normalizeName(play.scorer) === playerNameNorm) return true

                          // Include passing TDs if player is the passer (QB)
                          if (play.scoreType?.includes('TD') && play.passer && normalizeName(play.passer) === playerNameNorm) return true

                          return false
                        })

                        return (
                          <tr
                            key={idx}
                            onClick={() => navigate(`${pathPrefix}/game/${game.gameId || game.gid || game.id}`)}
                            className="transition-opacity hover:opacity-80 cursor-pointer"
                            style={{
                              backgroundColor: idx % 2 === 1 ? 'var(--surface-2)' : 'var(--surface-1)',
                              borderBottom: `1px solid ${teamInfo.backgroundColor}25`
                            }}
                          >
                            <td className="px-2 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>
                              {game.week ? `Week ${game.week}` :
                               game.isConferenceChampionship || game.gameType === 'conference_championship' ? 'Conf Champ' :
                               game.isCFPFirstRound || game.gameType === 'cfp_first_round' ? 'CFP R1' :
                               game.isCFPQuarterfinal || game.gameType === 'cfp_quarterfinal' ? 'CFP QF' :
                               game.isCFPSemifinal || game.gameType === 'cfp_semifinal' ? 'CFP SF' :
                               game.isCFPChampionship || game.gameType === 'cfp_championship' ? 'CFP Champ' :
                               game.isBowlGame || game.gameType === 'bowl' ? 'Bowl' : 'N/A'}
                            </td>
                            <td className="px-2 py-2">
                              <div className="flex items-center gap-2">
                                <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>{location}</span>
                                {game.opponentTid ? (
                                  <>
                                    <img
                                      src={getTeamLogoByTid(game.opponentTid, dynasty.teams)}
                                      alt={game.opponent}
                                      className="w-6 h-6 object-contain flex-shrink-0"
                                      onError={(e) => { e.target.style.display = 'none' }}
                                    />
                                    <span className="hidden md:inline font-medium" style={{ color: 'var(--text-primary)' }}>
                                      {dynasty.teams?.[game.opponentTid]?.schoolName || game.opponent}
                                    </span>
                                    <span className="md:hidden font-medium" style={{ color: 'var(--text-primary)' }}>
                                      {game.opponent}
                                    </span>
                                  </>
                                ) : (
                                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{game.opponent}</span>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-2 text-center font-bold" style={{ color: resultColor }}>
                              {game.result || '-'}
                            </td>
                            <td className="px-2 py-2 text-center tabular-nums" style={{ color: 'var(--text-primary)' }}>
                              {game.teamScore != null && game.opponentScore != null ? `${game.teamScore}-${game.opponentScore}` : '-'}
                            </td>
                            <td className="px-2 py-2 text-sm" style={{ color: 'var(--text-primary)' }}>
                              {statDisplay}
                            </td>
                            <td
                              className="px-2 py-2 text-center"
                              onClick={(e) => {
                                if (playerScoringPlays.length > 0) {
                                  e.stopPropagation() // Prevent row click
                                  setSelectedGameScoringPlays({
                                    plays: playerScoringPlays,
                                    game: game,
                                    opponent: game.opponent
                                  })
                                  setShowScoringHighlightsModal(true)
                                }
                              }}
                            >
                              {playerScoringPlays.length > 0 && (
                                <button
                                  className="flex items-center justify-center w-8 h-8 rounded-full transition-colors mx-auto"
                                  style={{
                                    backgroundColor: teamInfo.backgroundColor,
                                    color: primaryText
                                  }}
                                  title={`${playerScoringPlays.length} scoring ${playerScoringPlays.length === 1 ? 'play' : 'plays'}`}
                                >
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M8 5v14l11-7z" />
                                  </svg>
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )
      })()}

      {/* Card Tab — flip view of the player's saved trading card */}
      {activeTab === 'card' && (player?.cardFront || player?.cardBack) && (() => {
        // If the card was tagged to a specific game, surface a link
        // to that game page below the flip.
        const linkedGame = player?.cardGameId
          ? (currentDynasty?.games || []).find(g => String(g.id) === String(player.cardGameId))
          : null
        let gameLinkLabel = ''
        if (linkedGame) {
          const t1 = currentDynasty?.teams?.[Number(linkedGame.team1Tid)]?.abbr || ''
          const t2 = currentDynasty?.teams?.[Number(linkedGame.team2Tid)]?.abbr || ''
          gameLinkLabel = `Wk ${linkedGame.week ?? '?'} ${t1} vs ${t2}`
        }
        return (
          <div className="card overflow-hidden">
            <div className="h-[3px] w-full" style={{ backgroundColor: teamInfo.backgroundColor }} aria-hidden="true" />
            <div className="p-5">
              <PlayerCardFlip
                frontUrl={player.cardFront || ''}
                backUrl={player.cardBack || ''}
                accentColor={teamInfo.backgroundColor}
              />
              <div className="flex flex-col items-center gap-2 mt-4">
                {linkedGame && (
                  <Link
                    to={`${pathPrefix}/game/${linkedGame.id}`}
                    className="px-3 py-1.5 rounded-md text-xs font-semibold border border-surface-4 text-txt-secondary hover:bg-surface-3 transition-colors"
                  >
                    View game · {gameLinkLabel} →
                  </Link>
                )}
                {!isViewOnly && (
                  <button
                    onClick={() => navigate(`${pathPrefix}/player/${pid}/edit?tab=card`)}
                    className="text-xs text-txt-tertiary hover:text-txt-secondary transition-colors"
                  >
                    Edit card →
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Accolade Games Modal */}
      {showAccoladeModal && (
        <div
          className="fixed top-0 left-0 right-0 bottom-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4"
          style={{ margin: 0 }}
          onClick={() => setShowAccoladeModal(false)}
        >
          <div
            className="card rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-[3px] w-full flex-shrink-0" style={{ backgroundColor: teamColors.primary }} aria-hidden="true" />
            <div className="p-4 border-b border-surface-4 sticky top-0 bg-surface-2 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-txt-primary">
                    {accoladeType === 'confPOW' ? 'Conference Player of the Week' : 'National Player of the Week'}
                  </h3>
                  <p className="text-sm font-semibold mt-0.5 text-txt-secondary">{player.name}</p>
                </div>
                <button aria-label="Close" onClick={() => setShowAccoladeModal(false)} className="hover:opacity-70 text-txt-secondary">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-4 space-y-2">
              {(accoladeType === 'confPOW' ? powHonors.confPOWGames : powHonors.nationalPOWGames).map((game, index) => {
                const teamsData = dynasty?.teams || dynasty?.customTeams
                const opponentName = getMascotName(game.opponent, teamsData) || game.opponent
                const opponentLogo = getTeamLogo(opponentName, teamsData)
                const opponentColors = getTeamColors(opponentName, teamsData) || { primary: '#333', secondary: '#fff' }
                const opponentBgColor = opponentColors.primary || '#333'
                const opponentTextColor = getContrastTextColor(opponentBgColor)
                const isWin = game.result === 'win' || game.result === 'W'

                return (
                  <Link
                    key={game.id || index}
                    to={`${pathPrefix}/game/${game.id}`}
                    className="w-full flex flex-col sm:flex-row sm:items-center justify-between p-2 sm:p-3 rounded-lg border-2 gap-2 sm:gap-0 hover:opacity-90 transition-opacity text-left"
                    style={{ backgroundColor: opponentBgColor, borderColor: isWin ? '#86efac' : '#fca5a5' }}
                  >
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="text-xs font-medium w-16 sm:w-20 flex-shrink-0" style={{ color: opponentTextColor, opacity: 0.9 }}>
                        {game.year} Wk {game.week}
                      </div>
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-xs font-bold px-1.5 py-0.5 rounded flex-shrink-0" style={{ backgroundColor: opponentTextColor, color: opponentBgColor }}>
                          {game.location === 'away' ? '@' : 'vs'}
                        </span>
                        {opponentLogo && (
                          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.95)', boxShadow: '0 0 0 1px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.2)', border: `2px solid ${opponentTextColor}`, padding: '2px' }}>
                            <img src={opponentLogo} alt="" className="w-full h-full object-contain" />
                          </div>
                        )}
                        <div className="flex items-center gap-1 min-w-0">
                          {game.opponentRank && <span className="text-xs font-bold flex-shrink-0" style={{ color: opponentTextColor, opacity: 0.7 }}>#{game.opponentRank}</span>}
                          <span className="text-sm font-semibold truncate" style={{ color: opponentTextColor }}>{opponentName}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 justify-end sm:justify-start">
                      <div className="text-sm font-bold px-2 py-0.5 rounded" style={{ backgroundColor: isWin ? '#22c55e' : '#ef4444', color: '#ffffff' }}>
                        {isWin ? 'W' : 'L'}
                      </div>
                      <div className="text-sm font-bold" style={{ color: opponentTextColor }}>{game.teamScore != null && game.opponentScore != null ? `${Math.max(game.teamScore, game.opponentScore)}-${Math.min(game.teamScore, game.opponentScore)}` : '-'}</div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Overall Progression Modal */}
      <OverallProgressionModal
        isOpen={showOverallProgressionModal}
        onClose={() => setShowOverallProgressionModal(false)}
        player={player}
        teamColors={teamColors}
        currentYear={currentDynasty?.currentYear}
        onSave={!isViewOnly ? async (playerToUpdate, updates) => {
          const targetDynastyId = dynastyId || dynasty?.id
          // Merge the updates into the player object for the full update
          const updatedPlayer = { ...playerToUpdate, ...updates }
          await updatePlayer(targetDynastyId, updatedPlayer)
        } : null}
      />

      {/* Scoring Highlights Modal */}
      {showScoringHighlightsModal && selectedGameScoringPlays && (
        <ScoringHighlightsModal
          isOpen={showScoringHighlightsModal}
          onClose={() => {
            setShowScoringHighlightsModal(false)
            setSelectedGameScoringPlays(null)
          }}
          scoringPlays={selectedGameScoringPlays.plays}
          team1Abbr={dynasty.teams?.[player.teamsByYear?.[currentYear]]?.abbr || getCurrentTeamAbbr(dynasty)}
          team2Abbr={selectedGameScoringPlays.opponent === 'All Games' ? null : selectedGameScoringPlays.opponent}
          team1Tid={player.teamsByYear?.[currentYear] != null ? Number(player.teamsByYear[currentYear]) : null}
          team2Tid={selectedGameScoringPlays.game?.opponentTid != null ? Number(selectedGameScoringPlays.game.opponentTid) : null}
          team1Logo={getTeamLogoByTid(player.teamsByYear?.[currentYear], dynasty.teams)}
          team2Logo={selectedGameScoringPlays.game?.opponentTid ? getTeamLogoByTid(selectedGameScoringPlays.game.opponentTid, dynasty.teams) : null}
          players={dynasty.players || []}
          getTeamLogo={getTeamLogo}
          getMascotName={getMascotName}
          teamsData={dynasty.teams}
          customTitle={selectedGameScoringPlays.opponent === 'All Games' ? `${player.name} - All Scoring Plays` : `${player.name} Scores vs ${selectedGameScoringPlays.opponent}`}
          pathPrefix={pathPrefix}
          startIndex={selectedGameScoringPlays.startIndex || 0}
          resumeOffsetSec={selectedGameScoringPlays.resumeOffsetSec || 0}
        />
      )}

      {/* Game Log Modal */}
      {showGameLogModal && (
        <div
          className="fixed top-0 left-0 right-0 bottom-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4"
          style={{ margin: 0 }}
          onClick={() => setShowGameLogModal(false)}
        >
          <div
            className="card rounded-xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-[3px] w-full flex-shrink-0" style={{ backgroundColor: teamColors.primary }} aria-hidden="true" />
            <div className="p-4 border-b border-surface-4 flex-shrink-0 bg-surface-2">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-txt-primary">
                    Game Log
                  </h3>
                  <p className="text-sm font-semibold mt-0.5 text-txt-secondary">
                    {player.name} - {playerGameLog.length} {playerGameLog.length === 1 ? 'Game' : 'Games'}
                  </p>
                </div>
                <button aria-label="Close" onClick={() => setShowGameLogModal(false)} className="hover:opacity-70 text-txt-secondary">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-4 space-y-2 overflow-y-auto flex-1">
              {playerGameLog.map(({ game, stats }, index) => {
                const teamsData = dynasty?.teams || dynasty?.customTeams
                const opponentName = getMascotName(game.opponent, teamsData) || game.opponent
                const opponentLogo = getTeamLogo(opponentName, teamsData)
                const opponentColors = getTeamColors(opponentName, teamsData) || { primary: '#333', secondary: '#fff' }
                const opponentBgColor = opponentColors.primary || '#333'
                const opponentTextColor = getContrastTextColor(opponentBgColor)
                const isWin = game.result === 'win' || game.result === 'W'

                // Format stats based on category
                // Keys match camelCase conversion from Google Sheets headers in boxScoreConstants.js
                const formatStats = () => {
                  const { category } = stats
                  // Helper to safely get numeric value from stats (handles strings and empty values)
                  const num = (val) => Number(val) || 0

                  if (category === 'passing') {
                    return `${num(stats.comp)}/${num(stats.att)}, ${num(stats.yards)} YDS, ${num(stats.tD)} TD, ${num(stats.iNT)} INT`
                  } else if (category === 'rushing') {
                    return `${num(stats.carries)} CAR, ${num(stats.yards)} YDS, ${num(stats.tD)} TD`
                  } else if (category === 'receiving') {
                    return `${num(stats.receptions)} REC, ${num(stats.yards)} YDS, ${num(stats.tD)} TD`
                  } else if (category === 'defense') {
                    // Keys: solo, assists, tFL, sack, iNT, deflections, fF, fR
                    const tackles = num(stats.solo) + num(stats.assists)
                    return `${tackles} TKL, ${num(stats.sack)} SACK, ${num(stats.iNT)} INT`
                  } else if (category === 'kicking') {
                    // Keys: fGM, fGA, xPM, xPA
                    return `${num(stats.fGM)}/${num(stats.fGA)} FG, ${num(stats.xPM)}/${num(stats.xPA)} XP`
                  } else if (category === 'blocking') {
                    return `${num(stats.pancakes)} Pancakes, ${num(stats.sacksAllowed)} Sacks Allowed`
                  } else if (category === 'punting') {
                    return `${num(stats.punts)} Punts, ${num(stats.yards)} YDS, ${num(stats.in20)} In20`
                  } else if (category === 'kickReturn') {
                    // Keys: kR, yards, tD
                    return `${num(stats.kR)} KR, ${num(stats.yards)} YDS, ${num(stats.tD)} TD`
                  } else if (category === 'puntReturn') {
                    // Keys: pR, yards, tD
                    return `${num(stats.pR)} PR, ${num(stats.yards)} YDS, ${num(stats.tD)} TD`
                  }
                  return ''
                }

                return (
                  <Link
                    key={game.id || index}
                    to={`${pathPrefix}/game/${game.id}`}
                    className="block p-3 rounded-lg border-2 hover:opacity-90 transition-opacity"
                    style={{ backgroundColor: opponentBgColor, borderColor: isWin ? '#86efac' : '#fca5a5' }}
                    onClick={() => setShowGameLogModal(false)}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="text-xs font-medium w-16 flex-shrink-0" style={{ color: opponentTextColor, opacity: 0.9 }}>
                          {game.year} Wk {game.week}
                        </div>
                        <span className="text-xs font-bold px-1.5 py-0.5 rounded flex-shrink-0" style={{ backgroundColor: opponentTextColor, color: opponentBgColor }}>
                          {game.location === 'away' ? '@' : 'vs'}
                        </span>
                        {opponentLogo && (
                          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.95)', boxShadow: '0 0 0 1px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.2)', border: `2px solid ${opponentTextColor}`, padding: '2px' }}>
                            <img src={opponentLogo} alt="" className="w-full h-full object-contain" />
                          </div>
                        )}
                        <div className="flex items-center gap-1 min-w-0">
                          {game.opponentRank && <span className="text-xs font-bold flex-shrink-0" style={{ color: opponentTextColor, opacity: 0.7 }}>#{game.opponentRank}</span>}
                          <span className="text-sm font-semibold truncate" style={{ color: opponentTextColor }}>{opponentName}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor: isWin ? '#22c55e' : '#ef4444', color: '#ffffff' }}>
                          {isWin ? 'W' : 'L'}
                        </div>
                        <div className="text-sm font-bold" style={{ color: opponentTextColor }}>{game.teamScore != null && game.opponentScore != null ? `${Math.max(game.teamScore, game.opponentScore)}-${Math.min(game.teamScore, game.opponentScore)}` : '-'}</div>
                      </div>
                    </div>
                    <div className="mt-2 text-xs font-medium px-2 py-1 rounded" style={{ backgroundColor: `${opponentTextColor}20`, color: opponentTextColor }}>
                      {formatStats()}
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
