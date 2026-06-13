import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { proxyImageUrl } from '../../utils/imageProxy'
import { createPortal } from 'react-dom'
import { Link, useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { getTeamLogo, getMascotName as getMascotNameFromTeams } from '../../data/teams'
import { teamAbbreviations } from '../../data/teamAbbreviations'
import { TEAMS, resolveTid, getCurrentTeamAbbr, getGameTeamInfo, getAbbrFromTeamName } from '../../data/teamRegistry'
import { getTeamColors } from '../../data/teamColors'
import { useDynasty, getUserGamePerspective, GAME_TYPES, getRecordAsOfGame, getTeamRatingsForYear, getCustomConferencesForYear, getTeamRankForWeek, isPlayerOnRoster } from '../../context/DynastyContext'
import { saveGamesToSubcollection } from '../../services/dynastyService'
import { matchAndRankPlayers } from '../../utils/playerTagSearch'
import CardComposer from '../../components/CardComposer'
import { getCardsForGame } from '../../utils/playerCards'
import { getTeamLogoRobust } from '../../utils/teamLogo'
import FlippableCard from '../../components/FlippableCard'
import { usePathPrefix } from '../../hooks/usePathPrefix'
// useTeamColors not needed - using neutral colors for game recap
import { getBowlLogo } from '../../data/bowlLogos'
import { getConferenceLogo } from '../../data/conferenceLogos'
import { getTeamConference } from '../../data/conferenceTeams'
import { getContrastTextColor } from '../../utils/colorUtils'
import { parseCFPGameId, getCFPRoundInfo, getCFPSlotDisplayName, getBowlForSlot, DEFAULT_BOWL_CONFIG } from '../../data/cfpConstants'
import { STAT_TABS, STAT_TAB_ORDER } from '../../data/boxScoreConstants'
import { canonicalBoxScore, getPlayerStatsForTid, getTeamStatsForTid, listPlayerStatsTids, hasAnyPlayerStats, hasAnyTeamStats, PLAYER_STAT_KEYS } from '../../utils/boxScoreHelpers'
import ScoringHighlightsModal from '../../components/ScoringHighlightsModal'
import InlineScoringHighlights from '../../components/InlineScoringHighlights'
import FormattedRecap from '../../components/FormattedRecap'
import { sortPlaysChronologically, collapsePatRowsIntoTDs } from '../../utils/scoringPlayOrder'
import { calcDramaScore, getTier, getClassicGames, ESPN_CLASSIC_BADGE_STYLE } from '../../utils/espnClassic'
import {
  PageHero,
  Card,
  Button,
  Badge,
  Tabs,
  ScoreRow,
  Stat,
  EmptyState,
  LoadingState,
  SectionHeader,
  DataTable,
  Modal,
  Skeleton,
} from '../../components/ui'

// Map abbreviations to mascot names for logo lookup
// Accepts optional teamsData for tid-based teambuilder support
function getMascotName(abbr, teamsData = null) {
  // Try tid-based lookup first if teams data provided
  if (teamsData) {
    const result = getMascotNameFromTeams(abbr, teamsData)
    if (result) return result
  }
  // Fallback to hardcoded map
  const mascotMap = {
    'AFA': 'Air Force Falcons', 'AKR': 'Akron Zips', 'BAMA': 'Alabama Crimson Tide',
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
    'USA': 'South Alabama Jaguars', 'USM': 'Southern Mississippi Golden Eagles', 'USU': 'Utah State Aggies',
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
    // FCS teams
    'FCSE': 'FCS East Judicials', 'FCSM': 'FCS Midwest Rebels',
    'FCSN': 'FCS Northwest Stallions', 'FCSW': 'FCS West Titans'
  }
  return mascotMap[abbr] || null
}

// Robust logo lookup that tries multiple methods. Implementation
// extracted to src/utils/teamLogo.js so Game.jsx + GameEdit.jsx
// share a single source of truth.

// Robust color lookup that tries multiple methods
// Note: getTeamColors returns a default orange (#ea580c) for unknown teams,
// so we need to check if the result is actually a known team's colors
function getTeamColorsRobust(teamInput, teamsData = null) {
  if (!teamInput) return null

  // Helper to check if colors are the default fallback (orange)
  const isDefaultColors = (colors) => colors?.primary === '#ea580c'

  // 1. Try tid-based lookup first if teams data provided
  if (teamsData) {
    const colors = getTeamColors(teamInput, teamsData)
    if (colors && !isDefaultColors(colors)) return colors
  }

  // 2. Try direct lookup (if teamInput is already a full mascot name)
  let colors = getTeamColors(teamInput, teamsData)
  if (colors && !isDefaultColors(colors)) return colors

  // 3. Try as abbreviation via getMascotName
  const mascotName = getMascotName(teamInput, teamsData)
  if (mascotName) {
    colors = getTeamColors(mascotName, teamsData)
    if (colors && !isDefaultColors(colors)) return colors
  }

  // 4. Try uppercase abbreviation (handle case sensitivity)
  const upperInput = teamInput.toUpperCase()
  if (upperInput !== teamInput) {
    const mascotNameUpper = getMascotName(upperInput, teamsData)
    if (mascotNameUpper) {
      colors = getTeamColors(mascotNameUpper, teamsData)
      if (colors && !isDefaultColors(colors)) return colors
    }
  }

  // 5. Try looking up in teamAbbreviations map directly
  const teamData = teamAbbreviations[teamInput] || teamAbbreviations[upperInput]
  if (teamData?.name) {
    colors = getTeamColors(teamData.name, teamsData)
    if (colors && !isDefaultColors(colors)) return colors
  }

  return null
}

// Default neutral colors for game recap pages
const defaultColors = {
  primary: '#1f2937',    // Gray-800
  secondary: '#f3f4f6'   // Gray-100
}

// Small uppercase chip describing the play's category. Colored by
// Splits a plain-text PBP sentence at known player name positions and
// wraps each match in a <Link>. playerLinks is [{name, href}] sorted
// longest-first so "John Smith" is found before bare "John" when both
// are in the list. Returns an array of strings + React nodes — React
// renders mixed arrays correctly. Falls through to the raw string when
// there are no players to link.
function linkifyPBPSentence(sentence, playerLinks) {
  if (!sentence) return '—'
  if (!playerLinks?.length) return sentence
  let chunks = [sentence]
  for (const { name, href } of playerLinks) {
    if (!name) continue
    chunks = chunks.flatMap((chunk, ci) => {
      if (typeof chunk !== 'string') return [chunk]
      const idx = chunk.indexOf(name)
      if (idx === -1) return [chunk]
      const result = []
      if (idx > 0) result.push(chunk.slice(0, idx))
      result.push(
        <Link
          key={`pbp-${ci}-${name}`}
          to={href}
          className="font-medium text-txt-primary hover:underline underline-offset-[3px] decoration-surface-5 transition-colors"
        >
          {name}
        </Link>
      )
      if (idx + name.length < chunk.length) result.push(chunk.slice(idx + name.length))
      return result
    })
  }
  return chunks
}

// Reconstruct a natural-language play description from the structured
// atoms produced by the all-plays AI prompt. The granular Play Type
// (Pass Knocked Away / Field Goal Missed / etc.) tells us which
// sentence template to use; player names come from B (scorer) and C
// (passer); yards from D; TD flag from E.
function buildHighlightSentence(play) {
  const primary = (play.scorer || '').trim()
  const passer = (play.passer || '').trim()
  const playType = (play.playType || '').trim()
  const scoreType = (play.scoreType || '').trim()
  const isTD = /TD/i.test(scoreType)
  const rawYards = play.yards
  const yardsStr = rawYards !== undefined && rawYards !== null && rawYards !== '' ? String(rawYards) : ''
  const yardsNum = Number(yardsStr)
  const yardsAbs = Number.isFinite(yardsNum) ? Math.abs(yardsNum) : null
  const yardWord = (n) => Math.abs(Number(n)) === 1 ? 'yard' : 'yards'

  switch (playType) {
    case 'Rush': {
      if (!primary) return ''
      if (isTD) return yardsStr ? `${primary} rush for ${yardsStr} ${yardWord(yardsNum)} for a TD` : `${primary} rush for a TD`
      if (yardsNum < 0) return `${primary} rush for a ${Math.abs(yardsNum)}-yard loss`
      return yardsStr ? `${primary} rush for ${yardsStr} ${yardWord(yardsNum)}` : `${primary} rush`
    }
    case 'Pass':
    case 'Pass Complete': {
      if (!passer && !primary) return ''
      if (!passer) {
        const base = yardsStr ? `Pass to ${primary} for ${yardsStr} ${yardWord(yardsNum)}` : `Pass to ${primary}`
        return isTD ? `${base} for a TD` : base
      }
      if (!primary) {
        const base = yardsStr ? `${passer} pass for ${yardsStr} ${yardWord(yardsNum)}` : `${passer} pass complete`
        return isTD ? `${base} for a TD` : base
      }
      const base = yardsStr ? `${passer} pass to ${primary} for ${yardsStr} ${yardWord(yardsNum)}` : `${passer} pass to ${primary}`
      return isTD ? `${base} for a TD` : base
    }
    case 'Pass Incomplete':
      if (!passer && !primary) return ''
      if (!passer) return `Incomplete pass; intended for ${primary}`
      return primary ? `${passer} incomplete pass; intended for ${primary}` : `${passer} incomplete pass`
    case 'Pass Knocked Away':
      if (!passer && !primary) return ''
      if (!passer) return `Pass knocked away by ${primary}`
      return primary ? `${passer} pass knocked away by ${primary}` : `${passer} pass knocked away`
    case 'Pass Intercepted': {
      const intYards = yardsNum > 0 ? ` for ${yardsStr} ${yardWord(yardsNum)}` : ''
      const intTail = isTD ? ' for a TD' : intYards
      if (!passer) return primary ? `Pass intercepted by ${primary}${intTail}` : `Pass intercepted${intTail}`
      return primary ? `${passer} pass intercepted by ${primary}${intTail}` : `${passer} pass intercepted${intTail}`
    }
    case 'Interception': {
      if (!primary) return ''
      const intYards = yardsNum > 0 ? ` for ${yardsStr} ${yardWord(yardsNum)}` : ''
      const intTail = isTD ? ' for a TD' : intYards
      return `Interception by ${primary}${intTail}`
    }
    case 'Sack':
      if (!passer && !primary) return ''
      if (!passer) return yardsAbs != null ? `${primary} sacked for a ${yardsAbs}-yard loss` : `${primary} sacked`
      return yardsAbs != null ? `${passer} sacked for a ${yardsAbs}-yard loss` : `${passer} sacked`
    case 'Kickoff Return': {
      if (!primary) return ''
      const krBase = yardsStr ? `${primary} returns kick for ${yardsStr} ${yardWord(yardsNum)}` : `${primary} returns kick`
      return isTD ? `${krBase} for a TD` : krBase
    }
    case 'Punt': {
      if (yardsStr && primary) return `${primary} punts ${yardsStr} ${yardWord(yardsNum)}`
      if (yardsStr) return `Punt for ${yardsStr} ${yardWord(yardsNum)}`
      return primary ? `${primary} punt` : 'Punt'
    }
    case 'Punt Return': {
      if (!primary) return ''
      const prBase = yardsStr ? `${primary} punt return for ${yardsStr} ${yardWord(yardsNum)}` : `${primary} punt return`
      return isTD ? `${prBase} for a TD` : prBase
    }
    case 'Field Goal Made':
      if (yardsStr && primary) return `${primary} ${yardsStr}-yard field goal good`
      if (yardsStr) return `${yardsStr}-yard field goal good`
      return primary ? `${primary} field goal good` : 'Field goal good'
    case 'Field Goal Missed':
      if (yardsStr && primary) return `${primary} missed a ${yardsStr}-yard field goal`
      if (yardsStr) return `Missed ${yardsStr}-yard field goal`
      return primary ? `${primary} missed a field goal` : 'Field goal missed'
    case 'PAT': {
      const pat = (play.patResult || '').toLowerCase()
      const result = pat.includes('made') ? 'good'
        : pat.includes('missed') ? 'no good'
        : pat.includes('blocked') ? 'blocked'
        : pat.includes('converted') ? 'converted (2PT)'
        : pat.includes('failed') ? 'failed (2PT)'
        : 'good'
      return primary ? `Extra point ${result} by ${primary}` : `Extra point ${result}`
    }
    case 'Penalty':
      return yardsStr ? `Penalty for ${yardsStr} ${yardWord(yardsNum)}` : 'Penalty'
    case 'Fumble Recovery': {
      if (!primary) return ''
      const fumBase = yardsStr ? `Fumble recovered by ${primary} for ${yardsStr} ${yardWord(yardsNum)}` : `Fumble recovered by ${primary}`
      return isTD ? `${fumBase} for a TD` : fumBase
    }
    case 'Safety':
      return primary ? `Safety on ${primary}` : 'Safety'
    case 'Other':
    case '':
    default: {
      // Build a sentence for unrecognized / "Other" play types.
      // Before commit ba31441 this was parts.join(' · '), but the
      // middot was removed sitewide (UI guideline: no decorative
      // symbols). Instead fold the yards directly into the player
      // string so it reads like a sentence ("Garrett → Queen for
      // 12 yards") rather than leaving "12 yds" dangling after
      // a plain space where it looks like part of the player name.
      const playersStr = (primary && passer)
        ? `${passer} → ${primary}`
        : (primary || '')
      const yardsTail = yardsStr ? ` for ${yardsStr} ${yardWord(yardsNum)}` : ''
      const parts = []
      if (playType && playType !== 'Other') parts.push(playType)
      if (playersStr) parts.push(`${playersStr}${yardsTail}`)
      else if (yardsStr) parts.push(`${yardsStr} ${yardWord(yardsNum)}`)
      return parts.join(' ')
    }
  }
}

export default function Game() {
  const { id, gameId } = useParams()
  const navigate = useNavigate()
  const routeLocation = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { currentDynasty, loadingDynastyId, updateDynasty, addGame, isViewOnly } = useDynasty()
  const pathPrefix = usePathPrefix()

  // Check if dynasty data is being lazily loaded from Firebase
  const isLoadingDynastyData = loadingDynastyId === currentDynasty?.id

  // Use neutral colors for game recap pages instead of user's team colors
  const teamColors = defaultColors

  const [activeStatTab, setActiveStatTab] = useState('passing')
  // Box score sort state: { column: string | null, direction: 'asc' | 'desc' | null }
  const [homeSortConfig, setHomeSortConfig] = useState({ column: null, direction: null })
  const [awaySortConfig, setAwaySortConfig] = useState({ column: null, direction: null })

  // Main content tab state is persisted in URL params. Resolution of the
  // active tab is deferred until after `game` is resolved so we can pick a
  // smart default: Gamecast when a recap exists, else the historic
  // Box Score default. A per-device preference in localStorage overrides
  // the auto-pick.
  const DEFAULT_GAME_TAB_PREF_KEY = 'cfbtracker:defaultGameTab'
  const [defaultTabPref, setDefaultTabPref] = useState(() => {
    try { return localStorage.getItem(DEFAULT_GAME_TAB_PREF_KEY) || 'auto' } catch { return 'auto' }
  })
  const persistDefaultTabPref = (val) => {
    try {
      if (val === 'auto') localStorage.removeItem(DEFAULT_GAME_TAB_PREF_KEY)
      else localStorage.setItem(DEFAULT_GAME_TAB_PREF_KEY, val)
    } catch { /* storage disabled */ }
    setDefaultTabPref(val)
  }
  const setActiveTab = (tab) => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev)
      newParams.set('tab', tab)
      return newParams
    }, { replace: true })
  }

  // Mobile box score team tab - persisted in URL params
  const boxScoreTeamTab = searchParams.get('team') || 'left'
  const setBoxScoreTeamTab = (team) => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev)
      newParams.set('team', team)
      return newParams
    }, { replace: true })
  }


  // The Game page is read-only for recap text — all copy-prompt and paste-back
  // editing happens in the game editor (GameEdit.jsx).
  const [showHighlightsModal, setShowHighlightsModal] = useState(false)
  const [highlightsStartIndex, setHighlightsStartIndex] = useState(0)
  // Scoring tab — "Scores Only" toggle. Default checked: show only
  // scoring plays (today's behavior). Uncheck to show every play the
  // user entered via the All Plays AI prompt. If no PBP data exists,
  // there's nothing to toggle to, so the checkbox is locked checked.
  const [scoresOnly, setScoresOnly] = useState(true)
  // Set of scoring-play indices (in the chronologically-sorted array)
  // that the user has expanded to reveal their drive. Cleared when the
  // game switches.
  const [expandedDrives, setExpandedDrives] = useState(() => new Set())
  // idx → scoring-row DOM element. Used by toggleDriveExpansion to scroll
  // the just-expanded row back into view: when a drive expands ABOVE the
  // row, the row gets pushed down by the drive panel's height. If the
  // user clicked a row low in the viewport, that push can shove the row
  // off-screen entirely. scrollIntoView with block:'nearest' is a no-op
  // when the row is already visible, so it never scrolls unnecessarily.
  const scoringRowRefs = useRef(new Map())

  // Reset sort when changing stat tabs
  useEffect(() => {
    setHomeSortConfig({ column: null, direction: null })
    setAwaySortConfig({ column: null, direction: null })
  }, [activeStatTab])

  // Handle column header click for sorting
  const handleSort = (team, columnKey) => {
    const setSortConfig = team === 'home' ? setHomeSortConfig : setAwaySortConfig
    const currentConfig = team === 'home' ? homeSortConfig : awaySortConfig

    if (currentConfig.column !== columnKey) {
      // New column: start with descending (highest first for stats)
      // For playerName, start with ascending (A-Z)
      setSortConfig({ column: columnKey, direction: columnKey === 'playerName' ? 'asc' : 'desc' })
    } else if (currentConfig.direction === 'desc') {
      // Second click: switch to ascending
      setSortConfig({ column: columnKey, direction: 'asc' })
    } else if (currentConfig.direction === 'asc') {
      // Third click: reset to default (no sort)
      setSortConfig({ column: null, direction: null })
    }
  }

  // Sort data based on sort config
  const sortBoxScoreData = (data, sortConfig) => {
    if (!data || !sortConfig.column || !sortConfig.direction) {
      return data // Return original order
    }

    return [...data].sort((a, b) => {
      let aVal = a[sortConfig.column]
      let bVal = b[sortConfig.column]

      // Handle special computed fields
      if (activeStatTab === 'defense' && sortConfig.column === 'total') {
        aVal = (parseFloat(a.solo) || 0) + (parseFloat(a.assists) || 0)
        bVal = (parseFloat(b.solo) || 0) + (parseFloat(b.assists) || 0)
      }

      // For player name, do alphabetical sort
      if (sortConfig.column === 'playerName') {
        const aStr = (aVal || '').toString().toLowerCase()
        const bStr = (bVal || '').toString().toLowerCase()
        if (sortConfig.direction === 'asc') {
          return aStr.localeCompare(bStr)
        } else {
          return bStr.localeCompare(aStr)
        }
      }

      // For numeric values
      const aNum = parseFloat(aVal) || 0
      const bNum = parseFloat(bVal) || 0

      if (sortConfig.direction === 'asc') {
        return aNum - bNum
      } else {
        return bNum - aNum
      }
    })
  }

  // Get display headers for a stat tab - adds computed "Total" column for defense
  // Also combines Comp/Att into C/Att for passing display and reorders for display
  const getDisplayHeaders = (tabKey) => {
    const baseHeaders = STAT_TABS[tabKey].headers
    if (tabKey === 'defense') {
      // Insert "Total" after "Assists" (index 2)
      const headers = [...baseHeaders]
      headers.splice(3, 0, 'Total')
      return headers
    }
    if (tabKey === 'passing') {
      // Display order: Player Name, Rtg, C/Att, Yards, TD, INT, Long
      // Sheet order is different (Rtg comes before Comp/Att)
      return ['Player Name', 'Rtg', 'C/Att', 'Yards', 'TD', 'INT', 'Long']
    }
    return baseHeaders
  }

  // Check if a stat value is exceptional and return highlight class
  const getStatHighlight = (statTab, key, value) => {
    const numVal = parseFloat(value) || 0
    // Thresholds for exceptional performances
    const thresholds = {
      passing: {
        yards: 300,
        tDs: 3,
        qBRating: 150
      },
      rushing: {
        yards: 100,
        tDs: 2
      },
      receiving: {
        yards: 100,
        tDs: 2
      },
      defense: {
        total: 10,
        sacks: 2,
        iNTs: 1,
        fR: 1
      },
      kicking: {
        fGM: 3,
        points: 10
      },
      punting: {
        avg: 45
      }
    }

    const tabThresholds = thresholds[statTab]
    if (!tabThresholds) return null

    const threshold = tabThresholds[key]
    if (threshold && numVal >= threshold) {
      return 'exceptional'
    }
    return null
  }

  // Scroll to top when page loads
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  // Find the game by ID in the games[] array
  // Supports direct ID lookup and pattern-based fallbacks
  const findGame = () => {
    if (!currentDynasty?.games) return null

    // 1. Direct ID lookup - this is the primary method
    // Works for regular games and CFP games with new slot IDs (cfpfr1-2025, cfpqf1-2025, etc.)
    let found = currentDynasty.games.find(g => g.id === gameId)
    if (found) return found

    // 2. NEW: CFP Slot ID pattern (cfpfr1-2025, cfpqf2-2025, cfpsf1-2025, cfpnc-2025)
    const cfpParsed = parseCFPGameId(gameId)
    if (cfpParsed) {
      const { slotId, year } = cfpParsed
      const roundInfo = getCFPRoundInfo(slotId)

      // Get bowl name from dynasty's configuration (user picks these in CFPSeedsModal)
      // This is the SINGLE SOURCE OF TRUTH for bowl names
      const bowlConfig = currentDynasty.cfpBowlConfigByYear?.[year] || DEFAULT_BOWL_CONFIG
      const configuredBowlName = getBowlForSlot(slotId, bowlConfig)
      const displayName = configuredBowlName || getCFPSlotDisplayName(slotId)

      const frSeedMatchups = {
        cfpfr1: [5, 12],
        cfpfr2: [8, 9],
        cfpfr3: [6, 11],
        cfpfr4: [7, 10]
      }

      // PRIMARY: Look up by cfpSlot - the definitive identifier for bracket position
      // cfpSlot is set when shells are created and NEVER changes
      found = currentDynasty.games.find(g =>
        g.cfpSlot === slotId && Number(g.year) === year
      )
      if (found) {
        // Update bowlName from config if it differs (ensures single source of truth)
        if (configuredBowlName && found.bowlName !== configuredBowlName) {
          return { ...found, bowlName: configuredBowlName }
        }
        return found
      }

      // SECONDARY: Fallback lookups for legacy data without cfpSlot
      if (slotId.startsWith('cfpfr')) {
        const [seed1, seed2] = frSeedMatchups[slotId] || []
        found = currentDynasty.games.find(g =>
          g.isCFPFirstRound && Number(g.year) === year &&
          ((g.seed1 === seed1 && g.seed2 === seed2) || (g.seed1 === seed2 && g.seed2 === seed1))
        )
        if (found) return found
      } else if (slotId.startsWith('cfpqf')) {
        // Find by round type and year, then verify by bye seed if possible
        found = currentDynasty.games.find(g =>
          g.isCFPQuarterfinal && Number(g.year) === year &&
          (g.cfpSlot === slotId || g.id === `${slotId}-${year}`)
        )
        if (found) return { ...found, bowlName: configuredBowlName || found.bowlName }
      } else if (slotId.startsWith('cfpsf')) {
        found = currentDynasty.games.find(g =>
          g.isCFPSemifinal && Number(g.year) === year &&
          (g.cfpSlot === slotId || g.id === `${slotId}-${year}`)
        )
        if (found) return { ...found, bowlName: configuredBowlName || found.bowlName }
      } else if (slotId === 'cfpnc') {
        found = currentDynasty.games.find(g =>
          g.isCFPChampionship && Number(g.year) === year
        )
        if (found) return found
      }

      // FALLBACK: Check cfpResultsByYear for CPU vs CPU games (legacy data)
      const cfpResults = currentDynasty.cfpResultsByYear?.[year] || {}
      let cfpGame = null

      if (slotId.startsWith('cfpfr')) {
        const [seed1, seed2] = frSeedMatchups[slotId] || []
        const frGames = cfpResults.firstRound || []
        cfpGame = frGames.find(g => g && (
          (g.seed1 === seed1 && g.seed2 === seed2) ||
          (g.seed1 === seed2 && g.seed2 === seed1)
        ))
      } else if (slotId.startsWith('cfpqf')) {
        // For legacy data, try to match by cfpSlot first, then fall back to any QF game
        const qfGames = cfpResults.quarterfinals || []
        cfpGame = qfGames.find(g => g && g.cfpSlot === slotId) ||
                  qfGames.find(g => g && g.id === `${slotId}-${year}`)
      } else if (slotId.startsWith('cfpsf')) {
        const sfGames = cfpResults.semifinals || []
        cfpGame = sfGames.find(g => g && g.cfpSlot === slotId) ||
                  sfGames.find(g => g && g.id === `${slotId}-${year}`)
      } else if (slotId === 'cfpnc') {
        const champArray = cfpResults.championship || []
        cfpGame = Array.isArray(champArray) ? champArray[0] : champArray
      }

      if (cfpGame) {
        const userTeamAbbr = getCurrentTeamAbbr(currentDynasty)
        // tid-based involvement check; abbr fallback only when tids are
        // missing from either side (legacy CFP entry).
        const userTid = currentDynasty?.currentTid != null ? Number(currentDynasty.currentTid) : null
        const cfpT1Tid = cfpGame.team1Tid != null ? Number(cfpGame.team1Tid) : null
        const cfpT2Tid = cfpGame.team2Tid != null ? Number(cfpGame.team2Tid) : null
        const isUserGame = (userTid != null && (cfpT1Tid === userTid || cfpT2Tid === userTid))
          || (cfpT1Tid == null && cfpT2Tid == null && (cfpGame.team1 === userTeamAbbr || cfpGame.team2 === userTeamAbbr))
        return {
          ...cfpGame,
          id: gameId,
          year,
          isPlayoff: true,
          cfpSlot: slotId,
          // userTeam field indicates user involvement (no field = CPU game)
          ...(isUserGame && { userTeam: userTeamAbbr }),
          gameTitle: displayName,
          bowlName: configuredBowlName || displayName,
          ...roundInfo
        }
      }
    }

    // 3. Conference championship patterns
    // cc-{year} pattern for user's team conference championship
    const ccMatch = gameId.match(/^cc-(\d+)$/)
    if (ccMatch) {
      const year = parseInt(ccMatch[1])
      found = currentDynasty.games.find(g => g.isConferenceChampionship && Number(g.year) === year)
      if (found) return found
    }

    // cc-{year}-{conference-slug} pattern for any conference championship
    const ccConfMatch = gameId.match(/^cc-(\d+)-(.+)$/)
    if (ccConfMatch) {
      const year = parseInt(ccConfMatch[1])
      const confSlug = ccConfMatch[2]
      found = currentDynasty.games.find(g =>
        g.isConferenceChampionship && Number(g.year) === year &&
        g.conference?.toLowerCase().replace(/\s+/g, '-') === confSlug
      )
      if (found) return found
      const ccByYear = currentDynasty.conferenceChampionshipsByYear?.[year] || []
      const ccGame = ccByYear.find(g =>
        g.conference?.toLowerCase().replace(/\s+/g, '-') === confSlug
      )
      if (ccGame) {
        return {
          ...ccGame,
          id: gameId,
          year: year,
          isConferenceChampionship: true,
          // No userTeam field = CPU game (legacy CC from conferenceChampionshipsByYear)
          gameTitle: `${ccGame.conference} Championship`
        }
      }
    }

    // 4. bowl-{year}-{name} pattern for non-CFP bowl games
    const bowlMatch = gameId.match(/^bowl-(\d+)-(.+)$/)
    if (bowlMatch) {
      const year = parseInt(bowlMatch[1])
      const bowlSlug = bowlMatch[2]
      found = currentDynasty.games.find(g =>
        g.isBowlGame && Number(g.year) === year &&
        g.bowlName?.replace(/\s+/g, '-').toLowerCase() === bowlSlug
      )
      if (found) return found

      // Fallback: Check bowlGamesByYear for legacy data
      const bowlGamesByYear = currentDynasty.bowlGamesByYear || {}
      const yearData = bowlGamesByYear[year]
      if (yearData) {
        const allWeekGames = [...(yearData.week1 || []), ...(yearData.week2 || []), ...(yearData.week3 || [])]
        const bowlGame = allWeekGames.find(g =>
          g.bowlName?.replace(/\s+/g, '-').toLowerCase() === bowlSlug &&
          g.team1 && g.team2 && g.team1Score != null
        )
        if (bowlGame) {
          // Resolve viewing perspective via tid when possible — abbr stored
          // on a legacy bowl row may have drifted if either team is a
          // teambuilder team that was renamed since the bowl ran.
          const team1Won = bowlGame.team1Score > bowlGame.team2Score
          const winner = team1Won ? bowlGame.team1 : bowlGame.team2
          const winnerTid = bowlGame.winnerTid != null
            ? Number(bowlGame.winnerTid)
            : (team1Won
                ? (bowlGame.team1Tid != null ? Number(bowlGame.team1Tid) : null)
                : (bowlGame.team2Tid != null ? Number(bowlGame.team2Tid) : null))
          return {
            ...bowlGame,
            id: gameId,
            year: year,
            isBowlGame: true,
            // No userTeam field = CPU game (legacy bowl from bowlGamesByYear)
            viewingTeamAbbr: winner,
            viewingTeamTid: winnerTid,
            gameTitle: bowlGame.bowlName
          }
        }
      }
    }

    return null
  }

  const game = findGame()

  // IMPORTANT: All hooks must run on every render (Rules of Hooks).
  // The early-return guards below would skip this useMemo on
  // loading/missing-dynasty paths and trigger React error #310
  // ("rendered more hooks than the previous render"). Compute the
  // cards-for-game list here, before any conditional returns. The
  // helper is null-safe so it's fine if game is still undefined.
  // Photo lightbox state — null = closed, otherwise the index into
  // game.photos that's currently shown full-screen.
  const [photoLightboxIdx, setPhotoLightboxIdx] = useState(null)

  // Score-graphic lightbox state — boolean since it's a single image.
  // Triggered by the small thumbnail in the right column / top on mobile.
  const [scoreGraphicLightboxOpen, setScoreGraphicLightboxOpen] = useState(false)

  const cardsForGame = useMemo(() => {
    return getCardsForGame(currentDynasty, game?.id)
  }, [currentDynasty, game?.id])

  // Memoized name → pid map for player-link lookups. MUST be declared
  // before the early returns below so hook order stays stable across
  // renders (React would otherwise throw error #310 — "Rendered more
  // hooks than during the previous render" — once data finishes
  // loading and the function stops bailing out early).
  const playerPidByName = useMemo(() => {
    const map = new Map()
    for (const p of currentDynasty?.players || []) {
      if (p?.name && p?.pid) map.set(p.name, p.pid)
    }
    return map
  }, [currentDynasty?.players])

  // The Photos tab shows the uploaded photos plus the AI score graphic,
  // all taggable. Graphic leads (it's the marquee image). Deduped.
  const photoTabImages = useMemo(() => {
    const list = [
      ...(game?.scoreGraphic ? [game.scoreGraphic] : []),
      ...(Array.isArray(game?.photos) ? game.photos : []),
    ]
    return list.filter((u, i, arr) => u && arr.indexOf(u) === i)
  }, [game?.scoreGraphic, game?.photos])

  // pid → name, for rendering photo-tag chips in the Photos lightbox.
  const playerNameByPid = useMemo(() => {
    const map = new Map()
    for (const p of currentDynasty?.players || []) {
      if (p?.pid != null) map.set(String(p.pid), p.name || `Player ${p.pid}`)
    }
    return map
  }, [currentDynasty?.players])

  // Players taggable in this game's photos — dynasty players (with a pid →
  // a real player page) rostered on either team this game. { pid, name,
  // jerseyNumber, teamAbbr }. Drives the in-lightbox tag search.
  const photoTaggablePlayers = useMemo(() => {
    const players = currentDynasty?.players
    if (!Array.isArray(players) || !game) return []
    const tids = [game.team1Tid, game.team2Tid].filter(t => t != null).map(Number)
    if (tids.length === 0) return []
    const teamsObj = currentDynasty?.teams || {}
    const abbrFor = (tid) => teamsObj[tid]?.abbr || teamsObj[String(tid)]?.abbr || ''
    const yr = game.year
    return players
      .filter(p => p?.pid != null && tids.some(tid => isPlayerOnRoster(p, tid, yr)))
      .map(p => {
        const onTid = tids.find(tid => isPlayerOnRoster(p, tid, yr))
        return { pid: p.pid, name: p.name || `Player ${p.pid}`, jerseyNumber: p.jerseyNumber, teamAbbr: abbrFor(onTid) }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [currentDynasty?.players, currentDynasty?.teams, game])

  // Persist a photo's player tags. Surgical single-game write on cloud
  // dynasties (avoids re-uploading every game in the subcollection);
  // plain full update locally (IndexedDB writes the whole dynasty anyway).
  const savePhotoTags = useCallback(async (url, pids) => {
    if (!currentDynasty || !game || isViewOnly) return
    const tags = { ...(game.photoTags || {}) }
    if (Array.isArray(pids) && pids.length > 0) tags[url] = pids
    else delete tags[url]
    const updatedGame = { ...game, photoTags: tags }
    const updatedGames = (currentDynasty.games || []).map(g => String(g.id) === String(game.id) ? updatedGame : g)
    try {
      if (currentDynasty.storageType === 'cloud') {
        await saveGamesToSubcollection(currentDynasty.id, [updatedGame], { deleteOrphans: false })
        await updateDynasty(currentDynasty.id, { games: updatedGames }, { skipGamesSubcollection: true })
      } else {
        await updateDynasty(currentDynasty.id, { games: updatedGames })
      }
    } catch (e) {
      console.error('Failed to save photo tags:', e)
    }
  }, [currentDynasty, game, isViewOnly, updateDynasty])

  // Recap player-link patterns. Also hoisted above the early returns
  // for hook-order stability. Heavy lifting only happens when the
  // dynasty + box score are both populated; null otherwise.
  //
  // `teams` is resolved inline here from currentDynasty?.teams rather
  // than reading the `teams` const declared further down — that const
  // lives below the early returns, which would put it in the temporal
  // dead zone for this useMemo on first render and crash with
  // "Cannot access 'teams' before initialization." Inline resolution
  // keeps the hook self-contained.
  const recapPlayerLinks = useMemo(() => {
    if (!game?.boxScore) return null
    const teamsForCanon = currentDynasty?.teams || TEAMS
    const canon = canonicalBoxScore(game, teamsForCanon)
    if (!canon) return null
    const sides = Object.values(canon.byTid || {}).filter(Boolean)
    const categories = ['passing', 'rushing', 'receiving', 'defense', 'kicking']
    const names = new Set()
    for (const side of sides) {
      for (const cat of categories) {
        for (const row of (side[cat] || [])) {
          if (row.playerName) names.add(row.playerName)
        }
      }
    }
    if (!names.size) return null
    const lastCount = new Map()
    for (const name of names) {
      const parts = name.trim().split(/\s+/)
      const last = parts[parts.length - 1]
      lastCount.set(last, (lastCount.get(last) || 0) + 1)
    }
    const makeRender = (href) => (matchedText, key) => (
      <Link
        key={key}
        to={href}
        className="font-normal no-underline text-txt-primary hover:text-txt-secondary hover:underline underline-offset-[3px] decoration-surface-5 transition-colors"
      >
        {matchedText}
      </Link>
    )
    const links = []
    for (const name of names) {
      const pid = playerPidByName.get(name)
      if (!pid) continue
      const render = makeRender(`${pathPrefix}/player/${pid}`)
      links.push({ pattern: name, render })
      const parts = name.trim().split(/\s+/)
      if (parts.length > 1) {
        const last = parts[parts.length - 1]
        if (lastCount.get(last) === 1 && last !== name) {
          links.push({ pattern: last, render })
        }
      }
    }
    return links.length ? links : null
  }, [game?.boxScore, playerPidByName, pathPrefix, currentDynasty?.teams])

  if (!currentDynasty) {
    return <LoadingState message="Loading dynasty..." />
  }

  if (isLoadingDynastyData) {
    return <LoadingState message="Loading game data…" />
  }

  if (!game) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
          Back
        </Button>
        <EmptyState
          title="Game not found"
          message={<>Game ID: <span className="tabular">{gameId}</span></>}
        />
      </div>
    )
  }

  // Hoisted above hasBoxForLeaders below — it reads `teams`, and the
  // previous order put the const declaration after that read, which
  // crashed with TDZ ("Cannot access 'teams' before initialization")
  // on every game-page render after the merged tid-keyed box-score PR.
  const teams = currentDynasty?.teams || TEAMS

  // Per-tab data flags. A tab only appears when its underlying data
  // exists — a game with only a Score Graphic should show ONLY the
  // Score Graphic tab. These flags are also re-used in the tab bar
  // render below; computing them once at the component scope keeps
  // the autoDefaultTab logic and the tab bar in sync.
  const hasBoxForLeaders = hasAnyPlayerStats(game, teams)
  const hasScoringSummary = game.boxScore?.scoringSummary?.length > 0
  const hasRecap = !!game.aiRecap
  const hasTeamStatsData = hasAnyTeamStats(game, teams)
  const hasRatingsData = !!(game.team1Overall || game.team1Offense || game.team1Defense || game.team2Overall || game.opponentOverall)
  const hasAwardsData = !!(game.conferencePOW || game.confDefensePOW || game.nationalPOW || game.natlDefensePOW)
  const hasCardsData = cardsForGame.length > 0
  const hasPhotosData = Array.isArray(game.photos) && game.photos.length > 0
  const hasScoreGraphicData = !!game.scoreGraphic

  // Resolve the active tab now that we know which tabs are visible.
  // URL param wins if present (shared-link compatibility); otherwise
  // pick by per-device preference; if that's "auto" pick the first
  // visible tab in priority order. Falling through to a tab whose
  // data flag is false would render a blank page on games that only
  // have e.g. a Score Graphic.
  const autoDefaultTab = (() => {
    // Priority order — Gamecast first (richest summary), then Box,
    // Recap, etc. Score Graphic / Photos / Cards last because they
    // aren't really "the game" — they're media.
    const hasGamecastContent = hasBoxForLeaders || hasRecap || hasRatingsData || hasAwardsData || hasScoringSummary
    if (hasGamecastContent && hasRecap && hasBoxForLeaders) return 'gamecast'
    if (hasRecap && !hasBoxForLeaders) return 'recap'
    if (hasGamecastContent) return 'gamecast'
    if (hasBoxForLeaders) return 'boxscore'
    if (hasScoringSummary) return 'scoring'
    if (hasRecap) return 'recap'
    if (hasTeamStatsData) return 'stats'
    if (hasRatingsData) return 'ratings'
    if (hasAwardsData) return 'awards'
    if (hasCardsData) return 'cards'
    if (hasPhotosData || hasScoreGraphicData) return 'photos'
    return 'gamecast' // empty state — gamecast will render its own placeholder
  })()
  const effectiveDefaultTab = defaultTabPref === 'auto' ? autoDefaultTab : defaultTabPref
  const activeTab = searchParams.get('tab') || effectiveDefaultTab

  // Get user perspective for this game (if user's team was in it)
  const perspective = getUserGamePerspective(game, currentDynasty)

  // Check if this is a CPU vs CPU game (user was not coaching either team)
  const isCPUGame = !perspective

  // For CPU games, determine viewing perspective based on viewingTeamAbbr or team1
  // For user games, use the perspective to show user's team vs opponent
  let displayTeam, displayTeamAbbr, opponent, opponentAbbr
  let displayTeamLogo, displayTeamColors, opponentLogo, opponentColors
  let userScore, opponentScore, userWon

  if (isCPUGame) {
    // CPU game - pick a viewing team (winner or team1). Tid-based identity
    // throughout: a stored viewingTeamAbbr can drift relative to the
    // registry's current abbr after a teambuilder rename, which would
    // mis-classify the side and silently swap opponent/scores in the
    // displayed perspective. Use viewingTeamTid (synthesized at game-find
    // time) when available, fall back to abbr.
    const team1Info = game.team1Tid ? getGameTeamInfo(teams, game.team1Tid) : null
    const team2Info = game.team2Tid ? getGameTeamInfo(teams, game.team2Tid) : null
    const team1Abbr = team1Info?.abbr || game.team1
    const team2Abbr = team2Info?.abbr || game.team2

    // Coerce — legacy rows may store scores as strings, which break lex-compares ("20" > "5" is false).
    const _s1 = Number(game.team1Score)
    const _s2 = Number(game.team2Score)
    const viewingTid = game.viewingTeamTid != null ? Number(game.viewingTeamTid) :
      (_s1 > _s2
        ? (game.team1Tid != null ? Number(game.team1Tid) : null)
        : _s2 > _s1
          ? (game.team2Tid != null ? Number(game.team2Tid) : null)
          : (game.team1Tid != null ? Number(game.team1Tid) : null))

    let isDisplayTeam1
    if (viewingTid != null && game.team1Tid != null && game.team2Tid != null) {
      isDisplayTeam1 = Number(game.team1Tid) === viewingTid
    } else {
      const viewingAbbr = game.viewingTeamAbbr ||
        (_s1 > _s2 ? team1Abbr :
         _s2 > _s1 ? team2Abbr : team1Abbr)
      isDisplayTeam1 = viewingAbbr === team1Abbr
    }

    displayTeamAbbr = isDisplayTeam1 ? team1Abbr : team2Abbr
    displayTeam = getMascotName(displayTeamAbbr, currentDynasty?.teams || currentDynasty?.customTeams) || displayTeamAbbr

    opponentAbbr = isDisplayTeam1 ? team2Abbr : team1Abbr
    opponent = getMascotName(opponentAbbr, currentDynasty?.teams || currentDynasty?.customTeams) || opponentAbbr

    userScore = isDisplayTeam1 ? game.team1Score : game.team2Score
    opponentScore = isDisplayTeam1 ? game.team2Score : game.team1Score
    userWon = userScore > opponentScore

    // Get team visuals
    const cpuTeamsData = currentDynasty?.teams || currentDynasty?.customTeams
    displayTeamLogo = getTeamLogoRobust(displayTeam, cpuTeamsData) || getTeamLogoRobust(displayTeamAbbr, cpuTeamsData)
    displayTeamColors = getTeamColorsRobust(displayTeam, cpuTeamsData) || getTeamColorsRobust(displayTeamAbbr, cpuTeamsData) || { primary: '#666', secondary: '#fff' }
    opponentLogo = getTeamLogoRobust(opponent, cpuTeamsData) || getTeamLogoRobust(opponentAbbr, cpuTeamsData)
    opponentColors = getTeamColorsRobust(opponent, cpuTeamsData) || getTeamColorsRobust(opponentAbbr, cpuTeamsData) || { primary: '#666', secondary: '#fff' }
  } else {
    // User game - use perspective
    const userTeamInfo = getGameTeamInfo(teams, perspective.userTid)
    const oppTeamInfo = getGameTeamInfo(teams, perspective.opponentTid)

    displayTeamAbbr = userTeamInfo?.abbr || getCurrentTeamAbbr(currentDynasty)
    displayTeam = userTeamInfo?.name || getMascotName(displayTeamAbbr, currentDynasty?.teams || currentDynasty?.customTeams) || displayTeamAbbr
    opponentAbbr = oppTeamInfo?.abbr || game.opponent
    opponent = oppTeamInfo?.name || getMascotName(opponentAbbr, currentDynasty?.teams || currentDynasty?.customTeams) || opponentAbbr

    // Get scores from perspective
    userScore = perspective.userScore
    opponentScore = perspective.opponentScore
    userWon = perspective.userWon

    // Get team visuals
    const userTeamsData = currentDynasty?.teams || currentDynasty?.customTeams
    displayTeamLogo = userTeamInfo?.logo || getTeamLogoRobust(displayTeam, userTeamsData) || getTeamLogoRobust(displayTeamAbbr, userTeamsData)
    displayTeamColors = (userTeamInfo?.primaryColor ? { primary: userTeamInfo.primaryColor, secondary: userTeamInfo.secondaryColor } : null)
      || getTeamColorsRobust(displayTeam, userTeamsData) || getTeamColorsRobust(displayTeamAbbr, userTeamsData) || { primary: '#666', secondary: '#fff' }
    opponentLogo = oppTeamInfo?.logo || getTeamLogoRobust(opponent, userTeamsData) || getTeamLogoRobust(opponentAbbr, userTeamsData)
    opponentColors = (oppTeamInfo?.primaryColor ? { primary: oppTeamInfo.primaryColor, secondary: oppTeamInfo.secondaryColor } : null)
      || getTeamColorsRobust(opponent, userTeamsData) || getTeamColorsRobust(opponentAbbr, userTeamsData) || { primary: '#666', secondary: '#fff' }
  }

  // Helper function to get player PID by name
  // playerPidByName + recapPlayerLinks are hoisted above the early
  // returns in this function (see ~line 705) so hook order stays
  // stable. getPlayerPID is just a thin closure over the map.
  const getPlayerPID = (playerName) => playerPidByName.get(playerName)

  // Helper function to get full player object by name
  const getPlayerByName = (playerName) => {
    return currentDynasty?.players?.find(p => p.name === playerName)
  }

  // Helper function to get player stats from box score
  const getPlayerBoxScoreStats = (playerName) => {
    if (!game.boxScore) return null
    const stats = []

    // Search both teams via the canonical tid-keyed store
    const canon = canonicalBoxScore(game, teams)
    const searchTeams = canon ? Object.values(canon.byTid || {}).filter(Boolean) : []

    for (const teamData of searchTeams) {
      // Check passing
      const passingRow = teamData.passing?.find(r => r.playerName === playerName)
      if (passingRow) {
        const comp = passingRow.comp || 0
        // Support both sheet format (att) and random generator format (attempts)
        const att = passingRow.att ?? passingRow.attempts ?? 0
        const yards = passingRow.yards || 0
        // Support both sheet format (tD) and random generator format (tDs)
        const tds = passingRow.tD ?? passingRow.tDs ?? 0
        const ints = passingRow.iNT || 0
        stats.push(`${comp}/${att}, ${yards} yds, ${tds} TD${ints > 0 ? `, ${ints} INT` : ''}`)
      }

      // Check rushing
      const rushingRow = teamData.rushing?.find(r => r.playerName === playerName)
      if (rushingRow && (rushingRow.carries > 0 || rushingRow.yards > 0)) {
        // Support both sheet format (tD) and random generator format (tDs)
        const rushTds = rushingRow.tD ?? rushingRow.tDs ?? 0
        stats.push(`${rushingRow.carries || 0} car, ${rushingRow.yards || 0} yds${rushTds > 0 ? `, ${rushTds} TD` : ''}`)
      }

      // Check receiving
      const receivingRow = teamData.receiving?.find(r => r.playerName === playerName)
      if (receivingRow && (receivingRow.receptions > 0 || receivingRow.yards > 0)) {
        // Support both sheet format (tD) and random generator format (tDs)
        const recTds = receivingRow.tD ?? receivingRow.tDs ?? 0
        stats.push(`${receivingRow.receptions || 0} rec, ${receivingRow.yards || 0} yds${recTds > 0 ? `, ${recTds} TD` : ''}`)
      }

      // Check defense
      const defenseRow = teamData.defense?.find(r => r.playerName === playerName)
      if (defenseRow) {
        const total = (parseFloat(defenseRow.solo) || 0) + (parseFloat(defenseRow.assists) || 0)
        const parts = []
        if (total > 0) parts.push(`${total} TKL`)
        if (defenseRow.sack > 0) parts.push(`${defenseRow.sack} sack`)
        if (defenseRow.iNT > 0) parts.push(`${defenseRow.iNT} INT`)
        if (defenseRow.tFL > 0) parts.push(`${defenseRow.tFL} TFL`)
        if (defenseRow.fF > 0) parts.push(`${defenseRow.fF} FF`)
        if (defenseRow.fR > 0) parts.push(`${defenseRow.fR} FR`)
        if (parts.length > 0) stats.push(parts.join(', '))
      }

      // Check kicking
      const kickingRow = teamData.kicking?.find(r => r.playerName === playerName)
      if (kickingRow && (kickingRow.fGM > 0 || kickingRow.xPM > 0)) {
        const parts = []
        if (kickingRow.fGM > 0 || kickingRow.fGA > 0) parts.push(`${kickingRow.fGM || 0}/${kickingRow.fGA || 0} FG`)
        if (kickingRow.xPM > 0 || kickingRow.xPA > 0) parts.push(`${kickingRow.xPM || 0}/${kickingRow.xPA || 0} XP`)
        if (parts.length > 0) stats.push(parts.join(', '))
      }
    }

    return stats.length > 0 ? stats.join(' | ') : null
  }

  // Get user's record as of this game using centralized single-source-of-truth
  const userRecord = (() => {
    if (isCPUGame || !perspective) return null
    return getRecordAsOfGame(currentDynasty, game, perspective.userTid)
  })()

  // Parse links - handles both array (new format) and comma-separated string (legacy format)
  const parseLinks = (linksData) => {
    if (!linksData) return []
    if (Array.isArray(linksData)) {
      return linksData.map(link => link.trim()).filter(link => link)
    }
    return linksData.split(',').map(link => link.trim()).filter(link => link)
  }
  const links = parseLinks(game.links)

  const isYouTubeLink = (url) => url.includes('youtube.com') || url.includes('youtu.be')
  const getYouTubeEmbedUrl = (url) => {
    const videoIdMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/)
    return videoIdMatch ? `https://www.youtube.com/embed/${videoIdMatch[1]}` : null
  }

  // Imgur album/gallery links (not direct images)
  const isImgurAlbumLink = (url) => /imgur\.com\/(a|gallery)\//.test(url)

  // Extract Imgur album/gallery ID from URL
  const getImgurAlbumId = (url) => {
    const match = url.match(/imgur\.com\/(?:a|gallery)\/([a-zA-Z0-9]+)/)
    return match ? match[1] : null
  }

  // Imgur single post link (imgur.com/XXX but not album/gallery)
  const isImgurPostLink = (url) => {
    // Match imgur.com/XXX where XXX is an image ID (not a/, gallery/, or already i.imgur.com)
    if (url.includes('i.imgur.com')) return false
    if (isImgurAlbumLink(url)) return false
    return /imgur\.com\/([a-zA-Z0-9]{5,8})(?:\?|$|#)/.test(url) || /imgur\.com\/([a-zA-Z0-9]{5,8})$/.test(url)
  }

  // Convert Imgur post URL to direct image URL
  const getImgurDirectUrl = (url) => {
    const match = url.match(/imgur\.com\/([a-zA-Z0-9]{5,8})/)
    return match ? `https://i.imgur.com/${match[1]}.jpg` : null
  }

  // Direct image links (including i.imgur.com direct images, but NOT album pages)
  const isImageLink = (url) => {
    // Direct image file extensions
    if (/\.(jpg|jpeg|png|gif|webp)$/i.test(url)) return true
    // i.imgur.com direct image links (like i.imgur.com/XXX.jpg or i.imgur.com/XXX without extension)
    if (/i\.imgur\.com\/[a-zA-Z0-9]+/.test(url) && !url.includes('/a/') && !url.includes('/gallery/')) return true
    return false
  }

  // Determine team positions (away vs home)
  // For CFP games: Lower seed (better, e.g. #1) on left, Higher seed (worse, e.g. #12) on right
  // For regular games: Away team on left, Home team on right
  let location
  if (perspective) {
    location = perspective.isHome ? 'home' : perspective.isAway ? 'away' : 'neutral'
  } else {
    // CPU game - fall back to legacy location or derive from homeTeamTid
    if (game.location) {
      location = game.location
    } else if (game.homeTeamTid) {
      // Get displayTeam's tid and check if it matches homeTeamTid
      const displayTid = resolveTid(displayTeamAbbr, teams)
      location = game.homeTeamTid === displayTid ? 'home' : 'away'
    } else {
      location = 'neutral' // Default for postseason
    }
  }

  // Check if this is a CFP game and get seeds
  const isCFPGame = game.isCFPFirstRound || game.isCFPQuarterfinal ||
                    game.isCFPSemifinal || game.isCFPChampionship

  // Get CFP seeds for each team by tid only
  const getCFPSeedForTid = (tid) => {
    if (!tid || !currentDynasty?.cfpSeedsByYear) return null
    const cfpSeeds = currentDynasty.cfpSeedsByYear[game.year] || currentDynasty.cfpSeedsByYear[String(game.year)]
    if (!cfpSeeds) return null
    const seedEntry = cfpSeeds.find(s => s.tid === tid)
    return seedEntry?.seed || null
  }

  // Get user and opponent tids
  const userTid = perspective?.userTid || resolveTid(displayTeamAbbr, teams)
  const oppTid = perspective?.opponentTid || resolveTid(opponentAbbr, teams)

  // ESPN Classic rank for this game
  const espnClassicInfo = useMemo(() => {
    if (!game || !userTid || !currentDynasty?.games) return null
    const classics = getClassicGames(currentDynasty.games, userTid, currentDynasty?.teams)
    const entry = classics.find(c => c.game.id === game.id || (c.game === game))
    return entry || null
  }, [game, userTid, currentDynasty])

  // Get seeds for user/opponent. We CANNOT trust game.seed1 → user,
  // game.seed2 → opp, because seed1/seed2 align with team1/team2 in
  // storage order — and team1 may be either side. Map via tid so
  // each seed always sticks to the right team.
  const seedFromGameByTid = (tid) => {
    if (!tid) return null
    if (game.team1Tid === tid) return game.seed1 || game.cfpSeed1 || null
    if (game.team2Tid === tid) return game.seed2 || game.cfpSeed2 || null
    return null
  }
  const userSeed = seedFromGameByTid(userTid) || getCFPSeedForTid(userTid)
  const oppSeed = seedFromGameByTid(oppTid) || getCFPSeedForTid(oppTid)

  // For CFP games: determine left/right based on seeding (better seed on right)
  let leftTeam, rightTeam
  if (isCFPGame && userSeed && oppSeed) {
    // Lower seed number = better team, goes on right/bottom
    leftTeam = userSeed > oppSeed ? 'user' : 'opponent'
    rightTeam = userSeed > oppSeed ? 'opponent' : 'user'
  } else {
    // Regular games: away on left, home on right
    leftTeam = location === 'home' ? 'opponent' : 'user'
    rightTeam = location === 'home' ? 'user' : 'opponent'
  }

  // Get game title
  let gameTitle = ''
  let gameSubtitle = ''
  if (game.isConferenceChampionship) {
    gameTitle = `${game.conference || ''} Championship`
    gameSubtitle = `${game.year} Conference Championship Game`
  } else if (game.isCFPChampionship) {
    gameTitle = 'National Championship'
    gameSubtitle = `${game.year} College Football Playoff`
  } else if (game.isCFPSemifinal) {
    gameTitle = game.bowlName || 'CFP Semifinal'
    gameSubtitle = `${game.year} College Football Playoff Semifinal`
  } else if (game.isCFPQuarterfinal) {
    gameTitle = game.bowlName || 'CFP Quarterfinal'
    gameSubtitle = `${game.year} College Football Playoff Quarterfinal`
  } else if (game.isCFPFirstRound) {
    gameTitle = 'CFP First Round'
    gameSubtitle = `${game.year} College Football Playoff`
  } else if (game.bowlName) {
    gameTitle = game.bowlName
    gameSubtitle = `${game.year} Bowl Season`
  } else {
    gameTitle = game.week ? `Week ${game.week}` : 'Game'
    gameSubtitle = `${game.year} Regular Season`
  }

  // Get logos
  // game.conference is the authoritative value for CCGs (set at save time).
  // currentDynasty?.conference is a stale root-level field — do NOT use it.
  const confName = game.conference || (displayTeamAbbr ? getTeamConference(displayTeamAbbr) : null)
  const bowlLogo = game.bowlName ? getBowlLogo(game.bowlName) : null
  const confLogo = game.isConferenceChampionship && confName ? getConferenceLogo(confName) : null
  // For regular conference matchups (both teams in the same conference), surface
  // the conference logo in the header so it reads like an ESPN scoreboard.
  const customConfs = currentDynasty ? getCustomConferencesForYear(currentDynasty, game.year) : null
  const userConf = displayTeamAbbr ? getTeamConference(displayTeamAbbr, customConfs, currentDynasty?.teams) : null
  const oppConf = opponentAbbr ? getTeamConference(opponentAbbr, customConfs, currentDynasty?.teams) : null
  const isConferenceMatchup = !!(userConf && oppConf && userConf === oppConf) && !game.isConferenceChampionship && !game.bowlName
  const conferenceMatchupLogo = isConferenceMatchup ? getConferenceLogo(userConf) : null
  const eventLogo = bowlLogo || confLogo || conferenceMatchupLogo
  const eventLogoAlt = bowlLogo ? game.bowlName : (confLogo ? `${confName} Championship` : (conferenceMatchupLogo ? `${userConf}` : 'Event'))

  // Rankings — read straight from game.team1Rank / team2Rank. The
  // stored value IS each team's entering rank (rank during the game)
  // — migrated for old dynasties, kept in sync at every save through
  // saveWeeklyScores / addGame / updateGame. No further lookup or
  // derivation needed at read time.
  //
  // Both CPU and user game branches use the same precedence: stored
  // game ranks are authoritative, perspective.{user,opponent}Rank is
  // a legacy fallback only (older user games persisted ranks under
  // those alias fields before tid-based normalization). Keeping the
  // precedence identical avoids the "Game page shows #3 but team
  // page shows #5 for the same matchup" drift we used to hit.
  let leftRank, rightRank
  {
    const team1Info = game.team1Tid ? getGameTeamInfo(teams, game.team1Tid) : null
    const team1Abbr = team1Info?.abbr || game.team1
    // For user games, "user team" maps to whichever side of the
    // stored game has perspective.userTid; for CPU games it maps to
    // displayTeamAbbr (the team the page is being viewed from).
    const userTidForGame = perspective?.userTid ?? null
    const isDisplayTeam1 = userTidForGame != null
      ? Number(game.team1Tid) === Number(userTidForGame)
      : displayTeamAbbr === team1Abbr
    // Stored ranks first; legacy aliases (perspective.userRank /
    // game.userRank / game.opponentRank) only when stored is null.
    // Final fallback: rankByWeek poll data — the same source that
    // GameEdit auto-fills from. This covers games where team1Rank /
    // team2Rank were never written to the record (e.g. entered before
    // the rank-sync feature, or CPU games saved without explicit ranks)
    // so the game detail page and the edit form show consistent data.
    const displayRank = isDisplayTeam1 ? game.team1Rank : game.team2Rank
    const oppRank = isDisplayTeam1 ? game.team2Rank : game.team1Rank
    const displayTid = isDisplayTeam1 ? game.team1Tid : game.team2Tid
    const opponentTid = isDisplayTeam1 ? game.team2Tid : game.team1Tid
    const rankFromPoll = (tid) =>
      tid != null && game.week != null && game.year != null
        ? (getTeamRankForWeek(currentDynasty, tid, game.year, game.week) || null)
        : null
    const userRankFinal = displayRank ?? perspective?.userRank ?? game.userRank ?? rankFromPoll(displayTid) ?? null
    const oppRankFinal = oppRank ?? perspective?.opponentRank ?? game.opponentRank ?? rankFromPoll(opponentTid) ?? null
    leftRank = leftTeam === 'user' ? userRankFinal : oppRankFinal
    rightRank = rightTeam === 'user' ? userRankFinal : oppRankFinal
  }

  // Team data for rendering
  const getTeamData = (side) => {
    const isDisplayTeam = side === 'user'

    let overall = null
    let offense = null
    let defense = null

    if (isCPUGame) {
      // Determine if this side corresponds to team1 or team2
      const team1Info = game.team1Tid ? getGameTeamInfo(teams, game.team1Tid) : null
      const team1Abbr = team1Info?.abbr || game.team1
      const isTeam1 = isDisplayTeam ? (displayTeamAbbr === team1Abbr) : (opponentAbbr === team1Abbr)
      overall = isTeam1 ? game.team1Overall : game.team2Overall
      offense = isTeam1 ? game.team1Offense : game.team2Offense
      defense = isTeam1 ? game.team1Defense : game.team2Defense
    } else {
      // For unified format: user ratings in team1*, opponent ratings in team2*
      // For legacy format: opponent ratings in opponent* fields
      overall = isDisplayTeam
        ? (game.team1Overall ?? null)
        : (game.team2Overall ?? game.opponentOverall ?? null)
      offense = isDisplayTeam
        ? (game.team1Offense ?? null)
        : (game.team2Offense ?? game.opponentOffense ?? null)
      defense = isDisplayTeam
        ? (game.team1Defense ?? null)
        : (game.team2Defense ?? game.opponentDefense ?? null)
    }

    // Resolve tid for this side so downstream comparisons (quarter scores,
    // etc.) can match by tid instead of abbr — the only safe way when two
    // teams in the same dynasty share an abbreviation.
    let tid = null
    if (isCPUGame) {
      const team1Tid = game.team1Tid
      const team2Tid = game.team2Tid
      const team1Info = team1Tid ? getGameTeamInfo(teams, team1Tid) : null
      const team1Abbr = team1Info?.abbr || game.team1
      const isTeam1 = isDisplayTeam ? (displayTeamAbbr === team1Abbr) : (opponentAbbr === team1Abbr)
      tid = isTeam1 ? team1Tid : team2Tid
    } else {
      tid = isDisplayTeam ? (game.team1Tid ?? game.userTid ?? null) : (game.team2Tid ?? game.opponentTid ?? null)
    }

    // Records always come from the single source of truth — the dynasty's
    // games array via getRecordAsOfGame. This guarantees both teams (CPU or
    // user) display identical records to the rest of the app, regardless of
    // whatever stale strings might be saved on the game record itself.
    let record = null
    if (tid != null && currentDynasty) {
      const r = getRecordAsOfGame(currentDynasty, game, tid)
      if (r && (r.wins > 0 || r.losses > 0 || r.confWins > 0 || r.confLosses > 0)) {
        record = `${r.overall} (${r.conference})`
      }
    }
    if (!record) {
      // Fallback when tid is missing or the team has no recorded games yet
      // (e.g. season opener viewed pre-save) — use the saved string fields.
      if (isCPUGame) {
        const team1Info = game.team1Tid ? getGameTeamInfo(teams, game.team1Tid) : null
        const team1Abbr = team1Info?.abbr || game.team1
        const isTeam1 = isDisplayTeam ? (displayTeamAbbr === team1Abbr) : (opponentAbbr === team1Abbr)
        record = isTeam1 ? game.team1Record : game.team2Record
      } else if (isDisplayTeam && userRecord) {
        record = `${userRecord.overall} (${userRecord.conference})`
      } else {
        const oppRec = game.team2Record || game.opponentRecord
        const oppConf = game.team2ConfRecord || ''
        record = oppRec ? `${oppRec}${oppConf ? ` (${oppConf})` : ''}` : null
      }
    }

    return {
      name: isDisplayTeam ? displayTeam : opponent,
      abbr: isDisplayTeam ? displayTeamAbbr : opponentAbbr,
      tid,
      logo: isDisplayTeam ? displayTeamLogo : opponentLogo,
      colors: isDisplayTeam ? displayTeamColors : opponentColors,
      score: isDisplayTeam ? userScore : opponentScore,
      isWinner: isDisplayTeam ? userWon : !userWon,
      rank: side === leftTeam ? leftRank : rightRank,
      record: record,
      overall: overall,
      offense: offense,
      defense: defense
    }
  }

  const leftData = getTeamData(leftTeam)
  const rightData = getTeamData(rightTeam)

  // Check if game has been played (has scores)
  const gameIsPlayed = game.isPlayed || (game.team1Score > 0 || game.team2Score > 0)

  // Quarter scores are only "entered" if at least one quarter has a positive value.
  // An all-zero quarters object means the user never filled out the breakdown.
  const hasQuarterScores = (() => {
    if (!game.quarters) return false
    const t = game.quarters.team1 || game.quarters.team || {}
    const o = game.quarters.team2 || game.quarters.opponent || {}
    const keys = ['Q1', 'Q2', 'Q3', 'Q4', 'OT', 'OT2', 'OT3', 'OT4']
    const vals = []
    keys.forEach(k => { vals.push(t[k], o[k]) })
    return vals.some(v => {
      if (v === undefined || v === null || v === '') return false
      const n = Number(v)
      return Number.isFinite(n) && n > 0
    })
  })()

  // Box-score data is keyed by tid (see canonicalBoxScore in
  // boxScoreHelpers.js). The visual left/right sides are just visual —
  // each side asks for its own tid's slot. No home/away mapping needed.

  // Winner takes more of the gradient with smooth blend - winner gets 70%, blend zone in middle
  // For unplayed games, use 50-50 split
  const leftWon = leftData.isWinner
  const headerGradient = !gameIsPlayed
    ? `linear-gradient(90deg, ${leftData.colors.primary} 0%, ${leftData.colors.primary} 40%, ${rightData.colors.primary} 60%, ${rightData.colors.primary} 100%)`
    : leftWon
      ? `linear-gradient(90deg, ${leftData.colors.primary} 0%, ${leftData.colors.primary} 55%, ${rightData.colors.primary} 85%, ${rightData.colors.primary} 100%)`
      : `linear-gradient(90deg, ${leftData.colors.primary} 0%, ${leftData.colors.primary} 15%, ${rightData.colors.primary} 45%, ${rightData.colors.primary} 100%)`

  // CFB-27 broadcast scorebug: hard 50/50 team-color split with a centered
  // divider + a dark legibility wash (white text reads on any team color).
  // Matches the team page's Previous/Next Game scorebug treatment.
  const splitHeroBg = `linear-gradient(90deg, transparent calc(50% - 1.5px), rgba(0,0,0,0.55) calc(50% - 1.5px), rgba(0,0,0,0.55) calc(50% + 1.5px), transparent calc(50% + 1.5px)), linear-gradient(rgba(0,0,0,0.46), rgba(0,0,0,0.46)), linear-gradient(90deg, ${leftData.colors.primary} 0%, ${leftData.colors.primary} 50%, ${rightData.colors.primary} 50%, ${rightData.colors.primary} 100%)`

  // Title-cluster pieces. For regular-season games we split the
  // wrapping link so the conference logo navigates to standings while
  // the subtitle/title text navigates to that week's Weekly Scores
  // page (with a query param so it auto-scrolls to this game). For
  // championship / bowl / CFP rounds the whole cluster keeps its
  // single navigation target as before.
  const eventLogoBlock = eventLogo ? (
    <div
      className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-md flex items-center justify-center p-1"
      style={{
        backgroundColor: '#fff',
        boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
      }}
    >
      <img src={eventLogo} alt={eventLogoAlt} className="w-full h-full object-contain" />
    </div>
  ) : null
  const titleTextBlock = (
    <div className="text-left min-w-0">
      <div
        className="uppercase truncate"
        style={{
          fontSize: '10px',
          fontWeight: 700,
          letterSpacing: '1.6px',
          color: 'var(--text-tertiary)',
          lineHeight: 1,
        }}
      >
        {gameSubtitle}
      </div>
      <div
        className="truncate"
        style={{
          fontSize: '15px',
          fontWeight: 700,
          letterSpacing: '-0.01em',
          color: 'var(--text-primary)',
          lineHeight: 1.2,
          marginTop: '3px',
        }}
      >
        {gameTitle}
      </div>
    </div>
  )
  const titleCluster = (
    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
      {eventLogoBlock}
      {titleTextBlock}
    </div>
  )

  const isCFPRound = game.isCFPFirstRound || game.isCFPQuarterfinal || game.isCFPSemifinal || game.isCFPChampionship ||
    game.gameType === GAME_TYPES.CFP_FIRST_ROUND || game.gameType === GAME_TYPES.CFP_QUARTERFINAL ||
    game.gameType === GAME_TYPES.CFP_SEMIFINAL || game.gameType === GAME_TYPES.CFP_CHAMPIONSHIP

  // Single-link target — used only for the special game types where
  // the entire cluster (logo + text) navigates to one place.
  const titleLinkTo = isCFPRound
    ? `${pathPrefix}/cfp-bracket/${game.year}`
    : game.isConferenceChampionship
      ? `${pathPrefix}/conference-championship-history?conference=${encodeURIComponent(game.conference || '')}`
      : game.isBowlGame
        ? `${pathPrefix}/bowl-history?bowl=${encodeURIComponent(game.bowlName || gameTitle)}`
        : null

  // Regular-season split-link targets. The title text (e.g. "2034
  // Regular Season / Week 9") jumps to that week's Weekly Scores
  // grid and auto-scrolls to this game; the conference logo (only
  // present for in-conference matchups) jumps to standings.
  const isRegularSeasonGame = !titleLinkTo
  const weeklyScoresLink = isRegularSeasonGame && game.year && game.week != null
    ? `${pathPrefix}/weekly-scores/${game.year}/${game.week}?game=${encodeURIComponent(gameId)}`
    : null
  const conferenceStandingsLink = isRegularSeasonGame && isConferenceMatchup && userConf
    ? `${pathPrefix}/conference-standings/${game.year}?conf=${encodeURIComponent(userConf)}`
    : null

  return (
    <div className="space-y-4 overflow-x-hidden">
      {/* Hero Scoreboard — CFB-27 broadcast scorebug. The card carries the
          team-color split + grain; the header strip below sits opaque on top
          (z-10) so it reads as a clean broadcast bar over the colored body. */}
      <div
        className="relative rounded-2xl overflow-hidden shadow-2xl cfb-texture cfb-texture-strong"
        style={{ backgroundImage: splitHeroBg }}
      >
        {/* Top bar — opaque broadcast header over the colored scorebug. */}
        <div
          className="relative z-10 px-3 sm:px-5 py-2.5 sm:py-3 flex items-center justify-between gap-3"
          style={{
            backgroundColor: 'var(--surface-2)',
            borderBottom: '1px solid var(--surface-4)',
          }}
        >

          {/* Left-aligned title cluster (logo + subtitle/title).
              Special-event games (CFP / Bowl / Conf Champ) keep the
              whole cluster wrapped in one navigation Link. Regular-
              season games split it: conference logo → standings,
              text → that week's Weekly Scores with auto-scroll to
              this game. */}
          {titleLinkTo ? (
            <Link to={titleLinkTo} className="hover:opacity-90 transition-opacity min-w-0">
              {titleCluster}
            </Link>
          ) : (
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              {eventLogoBlock && (
                conferenceStandingsLink ? (
                  <Link
                    to={conferenceStandingsLink}
                    className="hover:opacity-90 transition-opacity"
                    title={`${userConf} Standings`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {eventLogoBlock}
                  </Link>
                ) : (
                  eventLogoBlock
                )
              )}
              {weeklyScoresLink ? (
                <Link
                  to={weeklyScoresLink}
                  className="hover:opacity-90 transition-opacity min-w-0"
                  title={`Week ${game.week} scoreboard`}
                >
                  {titleTextBlock}
                </Link>
              ) : (
                <div className="min-w-0">{titleTextBlock}</div>
              )}
            </div>
          )}

          {/* ESPN Classic badge + rank */}
          {espnClassicInfo && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <div style={{ display: 'inline-flex', alignItems: 'center', userSelect: 'none' }}>
                <div style={ESPN_CLASSIC_BADGE_STYLE.espn}>ESPN</div>
                <div style={ESPN_CLASSIC_BADGE_STYLE.classic}>CLASSIC</div>
              </div>
              <span style={{ fontSize: '12px', fontWeight: 900, color: espnClassicInfo.tier.color, letterSpacing: '0.5px', fontFamily: 'var(--font-display)' }}>
                #{espnClassicInfo.rank}
              </span>
            </div>
          )}

          {/* Right: edit / spacer */}
          {!isViewOnly ? (
            <button
              onClick={() => navigate(`${pathPrefix}/game/${gameId}/edit`, { state: { from: routeLocation.pathname } })}
              className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium text-xs transition-colors"
              style={{
                backgroundColor: 'var(--surface-3)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--surface-4)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--surface-4)'
                e.currentTarget.style.color = 'var(--text-primary)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--surface-3)'
                e.currentTarget.style.color = 'var(--text-secondary)'
              }}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <span className="hidden sm:inline">Edit</span>
            </button>
          ) : null}
        </div>

        {/* Desktop: ESPN-style integrated layout with quarter table in center.
            Gated at xl (not lg): this row is justify-between with non-shrinking
            clusters (big scores, fixed logos, the quarter table), so it needs
            real room. At lg with the sidebar open the content area is only
            ~980px and the row overflowed — the page's overflow-x-hidden then
            clipped the right team off-screen. Below xl we fall back to the
            responsive stacked layout, which shrinks cleanly. */}
        {gameIsPlayed && hasQuarterScores && (
          <div className="hidden xl:block px-8 py-6">
            <div className="flex items-center justify-between">
              {/* Left Team — collapsed to content width so score sits next
                  to the name. justify-between on the row above distributes
                  the open space between this cluster, the quarter table,
                  and the right cluster. */}
              <div className={`flex items-center gap-6 ${!leftData.isWinner ? 'opacity-75' : ''}`}>
                <Link to={`${pathPrefix}/team/${resolveTid(leftData.abbr, currentDynasty?.teams || TEAMS)}/${game.year}`} className="group flex items-center gap-4">
                  <div className="relative flex-shrink-0">
                    <div
                      className="w-16 h-16 rounded-full flex items-center justify-center p-2  shadow-xl bg-white"
                      style={{
                        boxShadow: leftData.isWinner
                          ? `0 0 20px ${leftData.colors.primary}60, 0 4px 16px rgba(0,0,0,0.4)`
                          : '0 4px 16px rgba(0,0,0,0.4)'
                      }}
                    >
                      {leftData.logo && (
                        <img src={leftData.logo} alt={leftData.name} className="w-full h-full object-contain" />
                      )}
                    </div>
                    {isCFPGame && (leftTeam === 'user' ? userSeed : oppSeed) && (
                      <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-amber-500/90 flex items-center justify-center shadow-lg border-2 border-surface-1">
                        <span className="text-[10px] font-black text-txt-primary">{leftTeam === 'user' ? userSeed : oppSeed}</span>
                      </div>
                    )}
                  </div>
                  <div className="text-left">
                    {leftData.rank && !isCFPGame && (
                      <div className="text-amber-400 text-xs font-bold">#{leftData.rank}</div>
                    )}
                    <div className="text-white font-bold text-lg group-hover:underline">{leftData.name}</div>
                    {leftData.record && (
                      <div className="text-sm" style={{ color: 'rgba(255,255,255,0.72)' }}>{leftData.record}</div>
                    )}
                  </div>
                </Link>
                {/* Score with winner triangle — sits next to the team
                    cluster (no ml-auto) so it doesn't drift toward the
                    quarter table. */}
                <div className="flex items-center gap-2">
                  <div
                    className={`text-6xl font-black tabular-nums ${leftData.isWinner ? 'text-white' : 'text-white opacity-60'}`}
                    style={leftData.isWinner ? { textShadow: '0 0 20px rgba(255,255,255,0.3)' } : {}}
                  >
                    {leftData.score}
                  </div>
                  {leftData.isWinner && (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M15 19V5l-7 7 7 7z" />
                    </svg>
                  )}
                </div>
              </div>

              {/* Center: Quarter Scores Table — dark panel keeps the table
                  legible where it sits over the team-color split + divider. */}
              <div className="flex-shrink-0 mx-4 rounded-xl px-4 py-2.5" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
                {(() => {
                  const t = game.quarters.team1 || game.quarters.team || {}
                  const o = game.quarters.team2 || game.quarters.opponent || {}
                  const isNewFormat = game.quarters.team1 || game.quarters.team2
                  // Match by tid when both sides are available — abbrs can
                  // collide between teambuilder teams and real FBS teams.
                  // Fall back to abbr only when one side has no tid.
                  const isLeftTeam1 = leftData.tid != null && game.team1Tid != null
                    ? Number(leftData.tid) === Number(game.team1Tid)
                    : leftData.abbr === (game.team1Tid ? (currentDynasty?.teams?.[game.team1Tid]?.abbr || TEAMS[game.team1Tid]?.abbr) : game.team1)
                  const leftQuarterKey = isNewFormat ? (isLeftTeam1 ? 'team1' : 'team2') : (leftTeam === 'user' ? 'team' : 'opponent')
                  const rightQuarterKey = isNewFormat ? (isLeftTeam1 ? 'team2' : 'team1') : (leftTeam === 'user' ? 'opponent' : 'team')
                  const leftQuarters = game.quarters[leftQuarterKey] || {}
                  const rightQuarters = game.quarters[rightQuarterKey] || {}

                  return (
                    <table className="text-center">
                      <thead>
                        <tr className="text-xs text-txt-muted uppercase">
                          <th className="px-2 py-1"></th>
                          <th className="px-3 py-1">1</th>
                          <th className="px-3 py-1">2</th>
                          <th className="px-3 py-1">3</th>
                          <th className="px-3 py-1">4</th>
                          {game.overtimes?.map((_, i) => (
                            <th key={i} className="px-3 py-1">OT{i > 0 ? i + 1 : ''}</th>
                          ))}
                          <th className="px-3 py-1 pl-4 border-l border-surface-4">T</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className={`pr-3 py-1.5 text-left text-sm font-bold ${leftData.isWinner ? 'text-white' : 'text-txt-tertiary'}`}>{leftData.abbr}</td>
                          {['Q1', 'Q2', 'Q3', 'Q4'].map(q => (
                            <td key={q} className="px-3 py-1.5 text-txt-secondary text-sm">
                              {leftQuarters[q] === '' || leftQuarters[q] === null || leftQuarters[q] === undefined ? 0 : leftQuarters[q]}
                            </td>
                          ))}
                          {game.overtimes?.map((ot, i) => (
                            <td key={i} className="px-3 py-1.5 text-txt-secondary text-sm">{ot[leftQuarterKey] ?? '-'}</td>
                          ))}
                          <td className={`px-3 py-1.5 pl-4 border-l border-surface-4 text-xl font-black ${leftData.isWinner ? 'text-white' : 'text-white opacity-60'}`}>
                            {leftData.score}
                          </td>
                        </tr>
                        <tr>
                          <td className={`pr-3 py-1.5 text-left text-sm font-bold ${rightData.isWinner ? 'text-white' : 'text-txt-tertiary'}`}>{rightData.abbr}</td>
                          {['Q1', 'Q2', 'Q3', 'Q4'].map(q => (
                            <td key={q} className="px-3 py-1.5 text-txt-secondary text-sm">
                              {rightQuarters[q] === '' || rightQuarters[q] === null || rightQuarters[q] === undefined ? 0 : rightQuarters[q]}
                            </td>
                          ))}
                          {game.overtimes?.map((ot, i) => (
                            <td key={i} className="px-3 py-1.5 text-txt-secondary text-sm">{ot[rightQuarterKey] ?? '-'}</td>
                          ))}
                          <td className={`px-3 py-1.5 pl-4 border-l border-surface-4 text-xl font-black ${rightData.isWinner ? 'text-white' : 'text-white opacity-60'}`}>
                            {rightData.score}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  )
                })()}
                <div className="text-center mt-2">
                  <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider" style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }}>
                    Final
                  </span>
                  {game.overtimes && game.overtimes.length > 0 && (
                    <span className="ml-2 text-amber-400 text-xs font-bold">
                      {game.overtimes.length > 1 ? `${game.overtimes.length}OT` : 'OT'}
                    </span>
                  )}
                </div>
              </div>

              {/* Right Team — mirrors the left cluster: collapsed to
                  content, score sits next to the team. */}
              <div className={`flex items-center gap-6 ${!rightData.isWinner ? 'opacity-75' : ''}`}>
                {/* Score with winner triangle */}
                <div className="flex items-center gap-2">
                  {rightData.isWinner && (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 5v14l7-7-7-7z" />
                    </svg>
                  )}
                  <div
                    className={`text-6xl font-black tabular-nums ${rightData.isWinner ? 'text-white' : 'text-white opacity-60'}`}
                    style={rightData.isWinner ? { textShadow: '0 0 20px rgba(255,255,255,0.3)' } : {}}
                  >
                    {rightData.score}
                  </div>
                </div>
                <Link to={`${pathPrefix}/team/${resolveTid(rightData.abbr, currentDynasty?.teams || TEAMS)}/${game.year}`} className="group flex items-center gap-4">
                  <div className="text-right">
                    {rightData.rank && !isCFPGame && (
                      <div className="text-amber-400 text-xs font-bold">#{rightData.rank}</div>
                    )}
                    <div className="text-white font-bold text-lg group-hover:underline">{rightData.name}</div>
                    {rightData.record && (
                      <div className="text-sm" style={{ color: 'rgba(255,255,255,0.72)' }}>{rightData.record}</div>
                    )}
                  </div>
                  <div className="relative flex-shrink-0">
                    <div
                      className="w-16 h-16 rounded-full flex items-center justify-center p-2  shadow-xl bg-white"
                      style={{
                        boxShadow: rightData.isWinner
                          ? `0 0 20px ${rightData.colors.primary}60, 0 4px 16px rgba(0,0,0,0.4)`
                          : '0 4px 16px rgba(0,0,0,0.4)'
                      }}
                    >
                      {rightData.logo && (
                        <img src={rightData.logo} alt={rightData.name} className="w-full h-full object-contain" />
                      )}
                    </div>
                    {isCFPGame && (rightTeam === 'user' ? userSeed : oppSeed) && (
                      <div className="absolute -top-1 -left-1 w-6 h-6 rounded-full bg-amber-500/90 flex items-center justify-center shadow-lg border-2 border-surface-1">
                        <span className="text-[10px] font-black text-txt-primary">{rightTeam === 'user' ? userSeed : oppSeed}</span>
                      </div>
                    )}
                  </div>
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Mobile/Tablet: Stacked layout (also shows for upcoming games on all screens).
            Hidden at xl, where the integrated desktop layout above takes over. */}
        <div className={gameIsPlayed && hasQuarterScores ? 'xl:hidden' : ''}>
        {/* Hero Scoreboard Content */}
        <div className="px-1 py-3 sm:px-8 sm:py-8 md:py-10">
          <div className="flex items-center justify-between gap-1 sm:gap-6 md:gap-10 max-w-full">
            {/* Left Team */}
            <Link to={`${pathPrefix}/team/${resolveTid(leftData.abbr, currentDynasty?.teams || TEAMS)}/${game.year}`} className="group flex-1 min-w-0">
              <div className="flex flex-col items-center sm:flex-row sm:items-center gap-1 sm:gap-4">
                {/* Logo - larger for hero effect */}
                <div className="relative flex-shrink-0">
                  <div
                    className="w-10 h-10 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center p-1 sm:p-2.5  shadow-xl bg-white"
                    style={{
                      boxShadow: leftData.isWinner && gameIsPlayed
                        ? `0 0 30px ${leftData.colors.primary}60, 0 8px 32px rgba(0,0,0,0.4)`
                        : '0 8px 32px rgba(0,0,0,0.4)'
                    }}
                  >
                    {leftData.logo && (
                      <img src={leftData.logo} alt={leftData.name} className="w-full h-full object-contain" />
                    )}
                  </div>
                  {/* CFP Seed Badge */}
                  {isCFPGame && (leftTeam === 'user' ? userSeed : oppSeed) && (
                    <div className="absolute -top-0.5 -right-0.5 sm:-top-1 sm:-right-1 w-4 h-4 sm:w-7 sm:h-7 rounded-full bg-amber-500/90 flex items-center justify-center shadow-lg border sm:border-2 border-surface-1">
                      <span className="text-[8px] sm:text-xs font-black text-txt-primary">{leftTeam === 'user' ? userSeed : oppSeed}</span>
                    </div>
                  )}
                </div>
                <div className="text-center sm:text-left min-w-0">
                  {/* Rank badge */}
                  {leftData.rank && !isCFPGame && (
                    <div className="text-amber-400 text-[9px] sm:text-xs font-bold mb-0.5">#{leftData.rank}</div>
                  )}
                  <div className="text-white font-bold text-[8px] sm:text-xs md:text-sm lg:text-xl group-hover:underline leading-tight">
                    {leftData.name}
                  </div>
                  {leftData.record && (
                    <div className="text-[9px] sm:text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.72)' }}>{leftData.record}</div>
                  )}
                </div>
              </div>
            </Link>

            {/* Scores - Center */}
            <div className="flex-shrink-0 px-1">
              {gameIsPlayed ? (
                <div className="flex items-center gap-1.5 sm:gap-6">
                  <div className="text-center">
                    <div
                      className={`inline-block text-center text-2xl sm:text-5xl md:text-6xl font-black tabular-nums transition-all ${leftData.isWinner ? 'text-white' : 'text-white opacity-60'}`}
                      style={{ minWidth: '1.5em', ...(leftData.isWinner ? { textShadow: '0 0 20px rgba(255,255,255,0.3)' } : {}) }}
                    >
                      {leftData.score}
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-0.5">
                    <div
                      className="px-1.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[8px] sm:text-xs font-bold uppercase tracking-wider"
                      style={{
                        backgroundColor: 'rgba(255,255,255,0.1)',
                        color: 'rgba(255,255,255,0.8)'
                      }}
                    >
                      Final
                    </div>
                    {game.overtimes && game.overtimes.length > 0 && (
                      <span className="text-amber-400 text-[8px] sm:text-xs font-bold">
                        {game.overtimes.length > 1 ? `${game.overtimes.length}OT` : 'OT'}
                      </span>
                    )}
                  </div>

                  <div className="text-center">
                    <div
                      className={`inline-block text-center text-2xl sm:text-5xl md:text-6xl font-black tabular-nums transition-all ${rightData.isWinner ? 'text-white' : 'text-white opacity-60'}`}
                      style={{ minWidth: '1.5em', ...(rightData.isWinner ? { textShadow: '0 0 20px rgba(255,255,255,0.3)' } : {}) }}
                    >
                      {rightData.score}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center py-2 sm:py-4">
                  <div className="px-2 py-1 sm:px-4 sm:py-2 rounded-full bg-yellow-500/20 border border-yellow-500/30">
                    <span className="text-xs sm:text-sm font-bold text-yellow-400">UPCOMING</span>
                  </div>
                </div>
              )}
            </div>

            {/* Right Team */}
            <Link to={`${pathPrefix}/team/${resolveTid(rightData.abbr, currentDynasty?.teams || TEAMS)}/${game.year}`} className="group flex-1 min-w-0">
              <div className="flex flex-col items-center sm:flex-row-reverse sm:items-center gap-1 sm:gap-4">
                {/* Logo - larger for hero effect */}
                <div className="relative flex-shrink-0">
                  <div
                    className="w-10 h-10 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center p-1 sm:p-2.5  shadow-xl bg-white"
                    style={{
                      boxShadow: rightData.isWinner && gameIsPlayed
                        ? `0 0 30px ${rightData.colors.primary}60, 0 8px 32px rgba(0,0,0,0.4)`
                        : '0 8px 32px rgba(0,0,0,0.4)'
                    }}
                  >
                    {rightData.logo && (
                      <img src={rightData.logo} alt={rightData.name} className="w-full h-full object-contain" />
                    )}
                  </div>
                  {/* CFP Seed Badge */}
                  {isCFPGame && (rightTeam === 'user' ? userSeed : oppSeed) && (
                    <div className="absolute -top-0.5 -left-0.5 sm:-top-1 sm:-left-1 w-4 h-4 sm:w-7 sm:h-7 rounded-full bg-amber-500/90 flex items-center justify-center shadow-lg border sm:border-2 border-surface-1">
                      <span className="text-[8px] sm:text-xs font-black text-txt-primary">{rightTeam === 'user' ? userSeed : oppSeed}</span>
                    </div>
                  )}
                </div>
                <div className="text-center sm:text-right min-w-0">
                  {/* Rank badge */}
                  {rightData.rank && !isCFPGame && (
                    <div className="text-amber-400 text-[9px] sm:text-xs font-bold mb-0.5">#{rightData.rank}</div>
                  )}
                  <div className="text-white font-bold text-[8px] sm:text-xs md:text-sm lg:text-xl group-hover:underline leading-tight">
                    {rightData.name}
                  </div>
                  {rightData.record && (
                    <div className="text-[9px] sm:text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.72)' }}>{rightData.record}</div>
                  )}
                </div>
              </div>
            </Link>
          </div>

        </div>
        </div>
      </div>

      {/* Scoring Summary - Dark theme continuation (hidden on desktop when integrated).
          Surface matches the hero card above and the tabs card below
          (bg-surface-1) so the table doesn't read as a brighter slab. */}
      {hasQuarterScores && (
        <div className="xl:hidden bg-surface-1 rounded-xl overflow-hidden shadow-lg cfb-texture cfb-texture-strong">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-[10px] sm:text-xs text-txt-tertiary uppercase tracking-wider border-b border-surface-4">
                  <th className="text-left py-3 px-3 sm:px-4 font-semibold">Team</th>
                  <th className="text-center py-3 px-2 sm:px-3 font-semibold">1st</th>
                  <th className="text-center py-3 px-2 sm:px-3 font-semibold">2nd</th>
                  <th className="text-center py-3 px-2 sm:px-3 font-semibold">3rd</th>
                  <th className="text-center py-3 px-2 sm:px-3 font-semibold">4th</th>
                  {game.overtimes?.map((_, i) => (
                    <th key={i} className="text-center py-3 px-2 sm:px-3 font-semibold">OT{i > 0 ? i + 1 : ''}</th>
                  ))}
                  <th className="text-center py-3 px-3 sm:px-4 font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {[leftData, rightData].map((team, idx) => {
                  // Support both new format (team1/team2) and legacy format (team/opponent)
                  const isNewFormat = game.quarters.team1 || game.quarters.team2
                  // Match by tid when both sides are available — abbrs can
                  // collide between teambuilder teams and real FBS teams.
                  // Fall back to abbr only when one side has no tid.
                  const isLeftTeam1 = leftData.tid != null && game.team1Tid != null
                    ? Number(leftData.tid) === Number(game.team1Tid)
                    : leftData.abbr === (game.team1Tid ? (currentDynasty?.teams?.[game.team1Tid]?.abbr || TEAMS[game.team1Tid]?.abbr) : game.team1)
                  const quarterKey = isNewFormat
                    ? (idx === 0 ? (isLeftTeam1 ? 'team1' : 'team2') : (isLeftTeam1 ? 'team2' : 'team1'))
                    : ((idx === 0 ? leftTeam : rightTeam) === 'user' ? 'team' : 'opponent')
                  return (
                    <tr
                      key={idx}
                      style={{ backgroundColor: team.colors.primary, backgroundImage: 'linear-gradient(rgba(0,0,0,0.40), rgba(0,0,0,0.40))' }}
                    >
                      <td className="py-3 px-3 sm:px-4">
                        <Link to={`${pathPrefix}/team/${resolveTid(team.abbr, currentDynasty?.teams || TEAMS)}/${game.year}`} className="group">
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div
                              className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center p-1 flex-shrink-0 bg-white "
                            >
                              {team.logo && <img src={team.logo} alt="" className="w-full h-full object-contain" />}
                            </div>
                            <span className={`font-bold group-hover:underline ${team.isWinner ? 'text-white' : 'text-white opacity-70'}`}>
                              <span className="sm:hidden">{team.abbr}</span>
                              <span className="hidden sm:inline">{team.name}</span>
                            </span>
                          </div>
                        </Link>
                      </td>
                      {['Q1', 'Q2', 'Q3', 'Q4'].map(q => {
                        const val = game.quarters[quarterKey]?.[q]
                        return (
                          <td key={q} className="text-center py-3 px-2 sm:px-3 text-white font-medium">
                            {val === '' || val === null || val === undefined ? 0 : val}
                          </td>
                        )
                      })}
                      {game.overtimes?.map((ot, i) => (
                        <td key={i} className="text-center py-3 px-2 sm:px-3 text-white font-medium">{ot[quarterKey] ?? '-'}</td>
                      ))}
                      <td className={`text-center py-3 px-3 sm:px-4 font-black text-lg sm:text-xl ${team.isWinner ? 'text-white' : 'text-white opacity-60'}`}>
                        {team.score}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Score Graphic used to live here as a giant full-width visual.
          It's now a small clickable thumbnail inside the Gamecast tab —
          on mobile it sits above the grid; on desktop it lives at the
          top of the right column (above Scoring). Click → full-screen
          lightbox via the existing PhotoLightbox component. */}

      {/* ESPN-Style Tab Navigation and Content */}
      {gameIsPlayed && (
        <div className="bg-surface-1 rounded-xl overflow-hidden shadow-lg">
          {/* Tab Bar - always fits screen width */}
          {(() => {
            // Tab visibility derives from the data flags hoisted to the
            // component scope above (used both here and by autoDefaultTab
            // so the two stay in sync). A tab only shows when its
            // underlying data exists — a game with only a Score Graphic
            // shows only the Score Graphic tab.
            const hasGamecastContent = hasBoxForLeaders || hasRecap || (!isCPUGame && (hasRatingsData || hasAwardsData)) || hasScoringSummary

            return (
          <div className="flex items-stretch border-b border-surface-4">
            {/* Tabs WRAP to a second row rather than scrolling/overflowing, so
                the bar never runs off the right edge at any width or tab count. */}
            <div className="flex flex-wrap flex-1 min-w-0">
              {[
                { key: 'gamecast', label: 'Gamecast', shortLabel: 'Cast', show: hasGamecastContent },
                { key: 'boxscore', label: 'Box Score', shortLabel: 'Box', show: hasBoxForLeaders },
                { key: 'scoring', label: 'Plays', shortLabel: 'Plays', show: hasScoringSummary },
                { key: 'recap', label: 'Recap', shortLabel: 'Recap', show: hasRecap },
                { key: 'stats', label: 'Team Stats', shortLabel: 'Stats', show: hasTeamStatsData },
                { key: 'ratings', label: 'Ratings', shortLabel: 'Rtg', show: !isCPUGame && hasRatingsData },
                { key: 'awards', label: 'Awards', shortLabel: 'Awards', show: !isCPUGame && hasAwardsData },
                { key: 'cards', label: 'Cards', shortLabel: 'Cards', show: hasCardsData },
                { key: 'photos', label: hasPhotosData ? 'Photos' : 'Graphic', shortLabel: hasPhotosData ? 'Photos' : 'Graphic', show: hasPhotosData || hasScoreGraphicData },
              ].filter(tab => tab.show).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 sm:flex-none px-1 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium transition-colors ${
                    activeTab === tab.key
                      ? 'text-txt-primary border-b-2 border-white bg-surface-2'
                      : 'text-txt-tertiary hover:text-txt-primary hover:bg-surface-2/50'
                  }`}
                >
                  <span className="sm:hidden">{tab.shortLabel}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </div>
            {/* Quiet per-device default-tab preference, aligned to the tab bar.
                Shown only at xl: (1280px+). Below that — especially with the
                sidebar open, which leaves the content area well under the
                breakpoint width — the 8-9 tabs need the full row to fit without
                horizontal scroll, and squeezing the Default selector in next to
                them produced the "Photos tab cut off + faint scrollbar" cramped
                look. The selector is a power-user preference; hiding it on
                narrower screens is the right trade. */}
            <div className="hidden xl:flex items-center gap-1.5 pr-3 pl-2 text-[11px] text-txt-muted whitespace-nowrap">
              <label htmlFor="default-game-tab" className="tracking-wide uppercase">Default</label>
              <select
                id="default-game-tab"
                value={defaultTabPref}
                onChange={(e) => persistDefaultTabPref(e.target.value)}
                title="Default tab for this device"
                className="bg-transparent border border-surface-4 rounded px-1.5 py-0.5 text-[11px] text-txt-secondary hover:text-txt-primary hover:border-surface-5 focus:outline-none focus:border-surface-5 transition-colors"
              >
                <option value="auto">Auto</option>
                <option value="gamecast">Gamecast</option>
                <option value="boxscore">Box Score</option>
                <option value="scoring">Scoring</option>
                <option value="stats">Team Stats</option>
                <option value="recap">Recap</option>
                <option value="ratings">Ratings</option>
                <option value="awards">Awards</option>
              </select>
            </div>
          </div>
            )
          })()}

          {/* Gamecast Tab — leaders recap ratings+awards, ESPN-style */}
          {activeTab === 'gamecast' && (() => {
            // ---- Game leaders: top producer per category on each side ----
            const n = (v) => Number(v) || 0
            const getYards = (p) => n(p.yards ?? p.yds)
            const getTackles = (p) => n(p.solo) + n(p.assists) + n(p.tackles)
            const topBy = (rows, scorer) => {
              if (!rows || !rows.length) return null
              let best = null
              let bestScore = -Infinity
              for (const r of rows) {
                const s = scorer(r)
                if (s > bestScore) { best = r; bestScore = s }
              }
              return bestScore > 0 ? best : null
            }
            const fmtPassing = (p) => {
              if (!p) return null
              const cmp = n(p.comp ?? p.cmp)
              const att = n(p.attempts ?? p.att)
              const yds = n(p.yards ?? p.yds)
              const td = n(p.tD ?? p.td)
              const int = n(p.iNT ?? p.int)
              return `${cmp}/${att}, ${yds} yds${td ? `, ${td} TD` : ''}${int ? `, ${int} INT` : ''}`
            }
            const fmtRushing = (p) => {
              if (!p) return null
              const car = n(p.carries ?? p.car)
              const yds = n(p.yards ?? p.yds)
              const td = n(p.tD ?? p.td)
              return `${car} car, ${yds} yds${td ? `, ${td} TD` : ''}`
            }
            const fmtReceiving = (p) => {
              if (!p) return null
              const rec = n(p.receptions ?? p.rec)
              const yds = n(p.yards ?? p.yds)
              const td = n(p.tD ?? p.td)
              return `${rec} rec, ${yds} yds${td ? `, ${td} TD` : ''}`
            }
            const fmtDefense = (p) => {
              if (!p) return null
              const tkl = getTackles(p)
              const sack = n(p.sack)
              const int = n(p.iNT ?? p.int)
              const tfl = n(p.tFL ?? p.tfl)
              const parts = []
              if (tkl) parts.push(`${tkl} tkl`)
              if (tfl) parts.push(`${tfl} TFL`)
              if (sack) parts.push(`${sack} sck`)
              if (int) parts.push(`${int} INT`)
              return parts.join(', ') || null
            }
            // Pull each side's box-score slot by tid so the Game-Leaders
            // panel's rows display the correct team's top performer
            // alongside the correct team logo. leftBs / rightBs follow
            // the visual layout (matches leftData / rightData above) —
            // not the home/away semantic, which doesn't exist anymore.
            const leftBs  = getPlayerStatsForTid(game, leftData.tid,  teams)
            const rightBs = getPlayerStatsForTid(game, rightData.tid, teams)
            const categories = [
              { key: 'passing',   label: 'Passing',   score: getYards,   fmt: fmtPassing },
              { key: 'rushing',   label: 'Rushing',   score: getYards,   fmt: fmtRushing },
              { key: 'receiving', label: 'Receiving', score: getYards,   fmt: fmtReceiving },
              { key: 'defense',   label: 'Defense',   score: getTackles, fmt: fmtDefense },
            ]
            const hasBoxForLeaders = !!(leftBs || rightBs)

            const LeaderRow = ({ player, statLine, teamData }) => {
              const pid = getPlayerPID(player)
              // Each leader sits on their team's color (rename-safe — colors
              // come from teamData), with a contrast-aware text color and the
              // same soft sheen + grain the rest of the app's team cards use.
              const color = teamData?.colors?.primary || '#374151'
              const txt = getContrastTextColor(color)
              const rowStyle = {
                backgroundColor: color,
                backgroundImage: 'linear-gradient(120deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 42%), linear-gradient(180deg, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.34) 100%)',
              }
              const content = (
                <>
                  <div className="w-7 h-7 rounded-md flex-shrink-0 flex items-center justify-center bg-white p-1 shadow-sm">
                    {teamData?.logo && <img src={teamData.logo} alt="" className="w-full h-full object-contain" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold truncate leading-tight" style={{ color: txt }}>{player}</div>
                    <div className="text-[12px] truncate tabular-nums leading-snug mt-0.5" style={{ color: txt, opacity: 0.82 }}>{statLine}</div>
                  </div>
                </>
              )
              return pid ? (
                <Link
                  to={`${pathPrefix}/player/${pid}`}
                  className="cfb-texture flex items-center gap-2.5 min-w-0 py-2.5 px-2.5 hover:brightness-110 transition-all"
                  style={rowStyle}
                >
                  {content}
                </Link>
              ) : (
                <div className="cfb-texture flex items-center gap-2.5 min-w-0 py-2.5 px-2.5" style={rowStyle}>{content}</div>
              )
            }

            // Unified section heading — same hierarchy in all three columns
            const SectionHead = ({ children, actions }) => (
              <div className="flex items-center gap-3 pb-2.5 mb-3 border-b border-surface-3/60">
                <h3 className="flex-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-txt-muted">
                  {children}
                </h3>
                {actions}
              </div>
            )

            // Display-only recap. Editing lives in the game editor.
            const canEditInEditor = !isViewOnly && !!gameId
            const editorHref = canEditInEditor ? `${pathPrefix}/game/${gameId}/edit` : null
            const RecapCenter = () => {
              if (game.aiRecap) {
                return (
                  <FormattedRecap
                    text={game.aiRecap}
                    className="text-txt-secondary text-sm leading-relaxed"
                    playerLinks={recapPlayerLinks}
                  />
                )
              }
              return (
                <div className="py-6">
                  <p className="text-[13px] leading-relaxed text-txt-secondary max-w-md">
                    No recap yet for this game.
                    {editorHref && (
                      <>
                        {' '}
                        <Link to={editorHref} className="text-txt-primary hover:text-txt-secondary underline underline-offset-2">
                          Add one in the game editor
                        </Link>.
                      </>
                    )}
                  </p>
                </div>
              )
            }

            // ---- Ratings block (compact) ----
            const userTid = game.userTid || resolveTid(displayTeamAbbr, currentDynasty?.teams || TEAMS)
            const storedUserRatings = getTeamRatingsForYear(currentDynasty, userTid, game.year)
            const userRatings = {
              ovr: game.team1Overall ?? storedUserRatings?.overall,
              off: game.team1Offense ?? storedUserRatings?.offense,
              def: game.team1Defense ?? storedUserRatings?.defense,
            }
            const oppRatings = {
              ovr: game.team2Overall ?? game.opponentOverall,
              off: game.team2Offense ?? game.opponentOffense,
              def: game.team2Defense ?? game.opponentDefense,
            }
            const leftIsOpp = leftTeam !== 'user'
            const leftRatings = leftIsOpp ? oppRatings : userRatings
            const rightRatings = !leftIsOpp ? oppRatings : userRatings
            const hasAnyRatings = (rr) => rr.ovr || rr.off || rr.def
            const hasRatings = !isCPUGame && (hasAnyRatings(userRatings) || hasAnyRatings(oppRatings))

            const hasAwards = !isCPUGame && (game.conferencePOW || game.confDefensePOW || game.nationalPOW || game.natlDefensePOW)

            const awardRows = [
              game.conferencePOW && { scope: 'Conference', side: 'Offense', name: game.conferencePOW, national: false },
              game.confDefensePOW && { scope: 'Conference', side: 'Defense', name: game.confDefensePOW, national: false },
              game.nationalPOW && { scope: 'National', side: 'Offense', name: game.nationalPOW, national: true },
              game.natlDefensePOW && { scope: 'National', side: 'Defense', name: game.natlDefensePOW, national: true },
            ].filter(Boolean)

            // Three-column gamecast at lg+. The middle Recap column used
            // to be the only `1fr` track while the sides held their full
            // 300/340px until the middle was squeezed to almost nothing
            // on viewports between lg and xl. Flipped the priority:
            // sides have a 180-280px / 220-320px range and shrink first;
            // the middle has a 360px floor and fills any remaining
            // space. Keeps the recap readable on a 1280px screen with
            // devtools open.
            // Small clickable thumbnail for the score graphic. Used in
            // two spots: mobile (above the gamecast grid, lg:hidden) and
            // desktop (top of the right column, hidden lg:block). Click
            // opens the existing PhotoLightbox with the single image.
            const ScoreGraphicThumb = () => (
              <button
                type="button"
                onClick={() => setScoreGraphicLightboxOpen(true)}
                className="block w-full rounded-lg overflow-hidden hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-surface-5 transition-opacity"
                style={{ border: '1px solid var(--surface-4)', backgroundColor: 'var(--surface-1)' }}
                aria-label="Open final score graphic"
              >
                <img
                  src={proxyImageUrl(game.scoreGraphic, 1200)}
                  alt={`${displayTeam} vs ${opponent} final score graphic`}
                  className="w-full h-auto block"
                  onError={(e) => { if (e.target.src !== game.scoreGraphic) { e.target.src = game.scoreGraphic } else { e.target.parentElement.style.display = 'none' } }}
                />
              </button>
            )

            return (
              <div className="px-5 py-6 sm:px-6 sm:py-7 grid grid-cols-1 lg:grid-cols-[minmax(180px,280px)_minmax(360px,1fr)_minmax(220px,320px)] gap-y-8 lg:gap-x-8 xl:gap-x-12">
                {/* Mobile-only score graphic — appears at the top of the
                    gamecast on phones/tablets below lg. Order -1 ensures
                    it sits above the Recap (order-1). Hidden on desktop
                    where the same thumbnail lives in the right column. */}
                {game.scoreGraphic && gameIsPlayed && (
                  <div className="order-[-1] lg:hidden min-w-0">
                    <ScoreGraphicThumb />
                  </div>
                )}

                {/* LEFT: Game Leaders — one unified panel, category rows inside */}
                {hasBoxForLeaders && (
                <aside className="order-2 lg:order-1 min-w-0">
                  <SectionHead>Game Leaders</SectionHead>
                  <div>
                    {categories.map((cat, catIdx) => {
                        const leftTop  = topBy(leftBs?.[cat.key],  cat.score)
                        const rightTop = topBy(rightBs?.[cat.key], cat.score)
                        const leftLine  = leftTop  && cat.fmt(leftTop)
                        const rightLine = rightTop && cat.fmt(rightTop)
                        if (!leftLine && !rightLine) return null
                        return (
                          <div
                            key={cat.key}
                            className={`py-3 ${catIdx > 0 ? 'border-t border-surface-3/40' : ''}`}
                          >
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-txt-muted mb-2">
                              {cat.label}
                            </div>
                            <div className="rounded-lg overflow-hidden">
                              {leftLine && (
                                <LeaderRow player={leftTop.playerName} statLine={leftLine} teamData={leftData} />
                              )}
                              {rightLine && (
                                <LeaderRow player={rightTop.playerName} statLine={rightLine} teamData={rightData} />
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                </aside>
                )}

                {/* CENTER: Recap — display only. Edit via the game editor.
                    Long recaps scroll within the panel so they don't blow
                    out the page height — but ONLY in the lg+ side-by-side
                    layout where each column has its own bounded space.
                    Below lg the page is stacked vertically and the page
                    itself scrolls; having an inner scrollbar there
                    produced a confusing double-scroll where the user had
                    to scroll the page to find the recap, then scroll
                    INSIDE the recap to read the rest. Let the recap flow
                    naturally below lg. */}
                {game.aiRecap && (
                <section className="order-1 lg:order-2 min-w-0">
                  <SectionHead>Game Recap</SectionHead>
                  <div className="max-w-prose lg:overflow-y-auto lg:pr-2 lg:-mr-2 lg:max-h-[min(70vh,720px)]">
                    <RecapCenter />
                  </div>
                </section>
                )}

                {/* RIGHT: Scoring Ratings Awards — sibling sections with shared rhythm */}
                <aside className="order-3 min-w-0 space-y-7">
                  {/* Desktop-only score graphic thumbnail at the top of
                      the right column. Mobile renders the same thumb
                      above the grid via the order-[-1] block. */}
                  {game.scoreGraphic && gameIsPlayed && (
                    <div className="hidden lg:block">
                      <SectionHead>Score Graphic</SectionHead>
                      <ScoreGraphicThumb />
                    </div>
                  )}

                  {(() => {
                    const playsWithVideo = sortPlaysChronologically(collapsePatRowsIntoTDs(game.boxScore?.scoringSummary))
                      .map(p => ({ ...p, gameInfo: { ...(p.gameInfo || {}), gameId } }))
                      .filter(p => p.videoLink)
                    if (!playsWithVideo.length) return null
                    return (
                      <div>
                        <SectionHead>Scoring</SectionHead>
                        <InlineScoringHighlights
                          scoringPlays={playsWithVideo}
                          team1Abbr={leftData?.abbr}
                          team2Abbr={rightData?.abbr}
                          onExpand={(idx) => {
                            setHighlightsStartIndex(idx)
                            setShowHighlightsModal(true)
                          }}
                        />
                      </div>
                    )
                  })()}

                  {hasRatings && (
                    <div>
                      <SectionHead>Team Ratings</SectionHead>
                      <div className="space-y-2">
                        {[[leftData, leftRatings], [rightData, rightRatings]].map(([team, ratings], idx) => {
                          if (!hasAnyRatings(ratings)) return null
                          const other = idx === 0 ? rightRatings : leftRatings
                          const better = (key) => (ratings[key] || 0) > (other[key] || 0)
                          const color = team?.colors?.primary || '#374151'
                          const txt = getContrastTextColor(color)
                          const cell = (label, val, key) => val == null ? null : (
                            <div className="flex flex-col items-start min-w-0">
                              <span className="text-[9px] uppercase tracking-[0.18em]" style={{ color: txt, opacity: 0.65 }}>{label}</span>
                              <span className={`text-base tabular-nums leading-none mt-1 ${better(key) ? 'font-bold' : 'font-medium'}`} style={{ color: txt }}>
                                {val}
                              </span>
                            </div>
                          )
                          return (
                            <Link
                              key={idx}
                              to={`${pathPrefix}/team/${resolveTid(team.abbr, currentDynasty?.teams || TEAMS)}/${game.year}`}
                              className="cfb-texture group flex items-center gap-3 rounded-lg py-2 pl-2 pr-3 overflow-hidden hover:brightness-110 transition-all"
                              style={{ backgroundColor: color, backgroundImage: 'linear-gradient(120deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 42%), linear-gradient(180deg, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.34) 100%)' }}
                            >
                              <div className="w-9 h-9 rounded-md flex items-center justify-center p-1 bg-white shadow-sm flex-shrink-0">
                                {team.logo && <img src={team.logo} alt="" className="w-full h-full object-contain" />}
                              </div>
                              <div className="flex-1 min-w-0 flex items-center gap-4">
                                <div className="flex-1 min-w-0 text-[13px] font-semibold truncate group-hover:underline" style={{ color: txt }}>
                                  {team.name}
                                </div>
                                <div className="flex items-center gap-3 flex-shrink-0">
                                  {cell('OVR', ratings.ovr, 'ovr')}
                                  {cell('OFF', ratings.off, 'off')}
                                  {cell('DEF', ratings.def, 'def')}
                                </div>
                              </div>
                            </Link>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {awardRows.length > 0 && (
                    <div>
                      <SectionHead>Players of the Week</SectionHead>
                      <ul className="divide-y divide-surface-3/40">
                        {awardRows.map((a, i) => {
                          const pid = getPlayerPID(a.name)
                          const label = (
                            <>
                              <div className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${a.national ? 'text-amber-400' : 'text-txt-muted'}`}>
                                {a.scope} {a.side}
                              </div>
                              <div className="text-[13px] font-semibold text-txt-primary truncate mt-0.5">
                                {a.name}
                              </div>
                            </>
                          )
                          return (
                            <li key={i} className="first:pt-0 last:pb-0">
                              {pid ? (
                                <Link
                                  to={`${pathPrefix}/player/${pid}`}
                                  className="block py-2.5 -mx-1 px-1 rounded-md hover:bg-surface-2/60 transition-colors"
                                >
                                  {label}
                                </Link>
                              ) : (
                                <div className="py-2.5">{label}</div>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )}

                </aside>
              </div>
            )
          })()}

          {/* Scoring Plays Tab */}
          {activeTab === 'scoring' && game.boxScore?.scoringSummary?.length > 0 && (() => {
            // Check if play is a standalone 2PT attempt (no scorer, 2PT mentioned in scoreType or patResult)
            const is2PTAttempt = (play) => {
              if (play.scorer) return false
              const scoreType = play.scoreType || ''
              const patResult = play.patResult || ''
              return scoreType.includes('2PT') || patResult.includes('2PT')
            }

            // Check if 2PT was converted (check both fields)
            const is2PTConverted = (play) => {
              const scoreType = play.scoreType || ''
              const patResult = play.patResult || ''
              return scoreType.includes('Converted') || patResult.includes('Converted')
            }

            // Calculate points for a play
            const getPlayPoints = (play) => {
              const scoreType = play.scoreType || ''
              const patResult = play.patResult || ''

              // TD-based plays (but not standalone 2PT which might have "2PT" in scoreType)
              if (scoreType.includes('TD') && !scoreType.includes('2PT')) {
                let points = 6
                if (patResult.includes('Made XP')) points += 1
                else if (patResult.includes('Converted 2PT')) points += 2
                return points
              }
              // Field goal
              if (scoreType === 'Field Goal') return 3
              // Safety
              if (scoreType === 'Safety') return 2
              // Standalone 2PT conversion (no scorer, 2PT in either field)
              if (is2PTAttempt(play)) {
                return is2PTConverted(play) ? 2 : 0
              }

              return 0
            }

            // Sort plays chronologically (Q1 → OT, time-left descending within a quarter)
            // so running scores accumulate in real game order — and the videoIndex
            // passed to ScoringHighlightsModal matches the modal's own ordering.
            // collapsePatRowsIntoTDs: the All Plays AI entry emits PATs as their
            // own rows; merge their patResult onto the preceding TD so XP points
            // count toward the running score regardless of which entry path
            // produced the data.
            const chronoPlays = sortPlaysChronologically(
              collapsePatRowsIntoTDs(game.boxScore.scoringSummary)
            )

            // Tid-based "is this play on the left side?" check. Each play's
            // team is stored as an abbr; we resolve via the game's two team
            // tids (and current registry abbrs) and compare tids instead of
            // strings — survives teambuilder abbr drift. Falls back to abbr
            // compare for legacy games missing a tid.
            const lTid = leftData.tid != null ? Number(leftData.tid) : null
            const rTid = rightData.tid != null ? Number(rightData.tid) : null
            const lAbbrU = leftData.abbr?.toUpperCase()
            const rAbbrU = rightData.abbr?.toUpperCase()
            const isPlayOnLeftSide = (play) => {
              const playU = play.team?.toUpperCase()
              if (lTid != null && rTid != null && lAbbrU && rAbbrU) {
                const playTid = playU === lAbbrU ? lTid : (playU === rAbbrU ? rTid : null)
                if (playTid != null) return playTid === lTid
              }
              return playU === lAbbrU
            }

            // Resolve a play's team to current-registry data (abbr, logo, colors).
            // play.team is the abbr stored at game time; if a teambuilder team
            // was renamed since, that stale abbr won't resolve via the registry
            // helpers. Map play.team → tid via the game's two teams, then look
            // up by tid for stable colors / logos.
            const resolvePlayTeamData = (play) => {
              const playU = play.team?.toUpperCase()
              const tid = playU === lAbbrU ? lTid : playU === rAbbrU ? rTid : null
              const sideData = tid === lTid ? leftData : tid === rTid ? rightData : null
              return {
                abbr: sideData?.abbr || play.team,
                logo: sideData?.logo || null,
                colors: sideData?.colors || null,
                name: sideData?.name || null,
              }
            }

            // Calculate running scores
            let leftRunning = 0
            let rightRunning = 0
            const playsWithScores = chronoPlays.map((play) => {
              const points = getPlayPoints(play)
              if (isPlayOnLeftSide(play)) {
                leftRunning += points
              } else {
                rightRunning += points
              }
              return { ...play, runningLeftScore: leftRunning, runningRightScore: rightRunning }
            })

            const hasVideoLinks = playsWithScores.some(p => p.videoLink)

            // Scoring vs play-by-play classification.
            //
            // A row is a "scoring play" if scoreType is set OR the row
            // is a standalone 2PT attempt (no scorer + 2PT in either
            // field). These render with the full scoring card + running
            // score. All other rows are play-by-play extras — only
            // visible when "Scores Only" is unchecked, and rendered
            // compactly.
            //
            // Exception: standalone PAT rows (extra-point attempts) are
            // NOT promoted to scoring cards. The PAT result is already
            // shown on the parent TD row via the patResult chip, so a
            // separate "PAT — Made XP" card right under the TD is just
            // visual noise. PAT rows still render as PBP rows in the
            // drive expansion when "Scores Only" is off. 2PT conversion
            // rows (where the patResult or scoreType contains "2PT")
            // DO still promote — those are worth 2 points and deserve
            // their own card when they happen standalone.
            // The truthy-only check used to live here would treat ANY
            // non-empty string in column E as a scoring play — including
            // misaligned TSV junk like "2" (a quarter number that
            // shifted left from a Penalty row the AI emitted with too
            // few empty cells). The result was ghost OT-tagged scoring
            // cards at the top of the Plays tab with 0-0 running scores.
            //
            // Tighten by requiring the score type to actually look like
            // one: ends in "TD", is "Field Goal" / "Safety", or contains
            // those words. Catches both the canonical labels and
            // reasonable AI paraphrases like "Interception TD" while
            // still rejecting "2" / "11:40" / pure digits.
            const looksLikeScoreType = (st) => {
              if (!st) return false
              if (/\bTD\b/i.test(st)) return true
              if (/Field Goal/i.test(st)) return true
              if (/Safety/i.test(st)) return true
              return false
            }
            const isScoringPlay = (p) => {
              if (is2PTAttempt(p)) return true
              const st = (p.scoreType || '').trim()
              if (st === 'PAT') return false
              return looksLikeScoreType(st)
            }

            // Detect whether this game has play-by-play data on file.
            // A play-by-play row populates at least one of the PBP-only
            // fields. If no row has any of those, this game was scored-
            // only — the "Scores Only" checkbox is locked checked + no
            // drive expansion is offered.
            const hasPBPData = chronoPlays.some(p =>
              p.down || p.playType || p.fieldPos || p.description ||
              // Legacy 15-col data shape — accept the old field names
              // as PBP signals too so games saved before the schema
              // simplification still render their drive context.
              p.outcome || p.notes
            )

            // Walk backward from a scoring play to find the drive that
            // ended with that play. A drive is a consecutive run of
            // plays by the same team — possession changes break the
            // chain. Returns the plays in chronological order with the
            // scoring play last.
            const findDrive = (idx) => {
              const target = playsWithScores[idx]
              if (!target) return []
              const team = (target.team || '').toUpperCase()
              const drive = [target]
              for (let i = idx - 1; i >= 0; i--) {
                const prev = playsWithScores[i]
                if (!prev) break
                if ((prev.team || '').toUpperCase() !== team) break
                drive.unshift(prev)
              }
              return drive
            }

            // Natural-language play row matching the CFB 26 in-game
            // highlight format: bold situation prefix ("2nd & 10 on
            // LOU 41.") followed by the play sentence ("Edward Reed
            // incomplete pass; intended for Melvin Rugamba.").
            // Time is a fixed left column; sentence flows right.
            const renderPBPRow = (play, key) => {
              const resolved = resolvePlayTeamData(play)
              const colors = resolved.colors
                || getTeamColorsRobust(resolved.abbr)
                || { primary: '#666', secondary: '#333' }

              const dist = (play.distance || '').toString().trim()
              const distLabel = dist === 'G' || /goal/i.test(dist) ? 'Goal' : dist
              // Coerce to string so numeric down values (1, 2, 3, 4) work
              // identically to string values ('1', '2', '3', '4').
              const downStr = String(play.down ?? '').trim()
              const downOrd = downStr === '1' ? '1st' : downStr === '2' ? '2nd' : downStr === '3' ? '3rd' : downStr === '4' ? '4th' : downStr
              const playType = (play.playType || '').trim()

              // Build situation prefix (down & dist on fieldPos).
              // Kickoff/Punt/PAT have no down, just field position.
              let situation = ''
              if (playType === 'Kickoff Return') {
                situation = play.fieldPos ? `Kickoff on ${play.fieldPos}` : 'Kickoff'
              } else if (playType === 'Punt Return') {
                situation = play.fieldPos ? `Punt on ${play.fieldPos}` : 'Punt'
              } else if (playType === 'PAT') {
                situation = play.fieldPos ? `PAT on ${play.fieldPos}` : 'PAT'
              } else {
                const downDist = downStr ? `${downOrd}${distLabel ? ` & ${distLabel}` : ''}` : ''
                if (downDist && play.fieldPos) situation = `${downDist} on ${play.fieldPos}`
                else if (downDist) situation = downDist
                else if (play.fieldPos) situation = play.fieldPos
              }

              const rawSentence = buildHighlightSentence(play)
                || (play.description || '').trim()
                || (play.outcome || '').trim()
                || (play.notes || '').trim()

              // Build player → href links for the two players in this play.
              // Deduplicate by name (same player as both passer and scorer
              // happens with AI mis-fills). Sort longest-first so "John Smith"
              // is found before bare "Smith" if both somehow appear.
              const scorerName = (play.scorer || '').trim()
              const passerName = (play.passer || '').trim()
              const scorerPID = getPlayerPID(scorerName)
              const passerPID = getPlayerPID(passerName)
              const seenNames = new Set()
              const pbpPlayerLinks = [
                scorerName && scorerPID ? { name: scorerName, href: `${pathPrefix}/player/${scorerPID}` } : null,
                passerName && passerPID ? { name: passerName, href: `${pathPrefix}/player/${passerPID}` } : null,
              ].filter(x => x && !seenNames.has(x.name) && seenNames.add(x.name))
               .sort((a, b) => b.name.length - a.name.length)

              const renderedSentence = linkifyPBPSentence(rawSentence, pbpPlayerLinks)

              return (
                <div key={key} className="flex items-stretch text-[11px] sm:text-xs group transition-colors hover:bg-surface-2/60">
                  <div className="w-[3px] flex-shrink-0" style={{ backgroundColor: colors.primary }} />
                  <div className="flex items-start gap-3 sm:gap-4 px-3 sm:px-4 py-2 sm:py-2.5 min-w-0 flex-1">
                    <div className="flex-shrink-0 w-10 sm:w-12 font-display font-semibold text-txt-tertiary tabular-nums pt-px">
                      {play.timeLeft || '—'}
                    </div>
                    <div className="flex-1 min-w-0 text-txt-secondary leading-snug">
                      {situation && (
                        <span className="font-semibold text-txt-primary">{situation}. </span>
                      )}
                      <span>{renderedSentence}</span>
                    </div>
                  </div>
                </div>
              )
            }

            const toggleDriveExpansion = (idx) => {
              // Visual contract: the scoring row the user clicked must NOT
              // appear to move. The drive panel grows above it (on expand)
              // or shrinks above it (on collapse), and the natural result
              // is that the row gets pushed down / pulled up. We compensate
              // with a per-frame scroll that keeps the row pinned at the
              // exact viewport Y position it had when the user clicked.
              //
              // How: capture the row's getBoundingClientRect().top BEFORE
              // toggling state, then on each animation frame for the
              // duration of the 300ms max-height transition, scroll the
              // window by (currentTop - anchorTop). The row stays put;
              // content above the panel shifts up (or back down on
              // collapse) to make/recover room for the drive plays.
              //
              // A previous version used setTimeout + scrollIntoView AFTER
              // the animation, but the row visibly drifted during the
              // 300ms transition, then snapped back at the end — the
              // anchored-from-the-first-frame approach feels stable.
              const rowEl = scoringRowRefs.current.get(idx)
              const anchorTop = rowEl ? rowEl.getBoundingClientRect().top : null

              setExpandedDrives(prev => {
                const next = new Set(prev)
                if (next.has(idx)) next.delete(idx)
                else next.add(idx)
                return next
              })

              if (rowEl && anchorTop != null) {
                const animationMs = 320 // duration-300 + a small buffer
                const start = performance.now()
                const tick = () => {
                  if (!rowEl.isConnected) return
                  const currentTop = rowEl.getBoundingClientRect().top
                  const delta = currentTop - anchorTop
                  // Sub-pixel jitter: don't bother scrolling for movement
                  // under half a pixel. window.scrollBy(0, delta) is
                  // instant — exactly what we want here; smooth would
                  // fight the per-frame correction.
                  if (Math.abs(delta) > 0.5) {
                    window.scrollBy(0, delta)
                  }
                  if (performance.now() - start < animationMs) {
                    requestAnimationFrame(tick)
                  }
                }
                requestAnimationFrame(tick)
              }
            }

            // If no PBP data exists, force scoresOnly to be true
            // (no other content to show; checkbox is purely informational).
            const effectiveScoresOnly = hasPBPData ? scoresOnly : true

            return (
              <div>
                {/* Toolbar: Watch All Scores (when video data exists) + Scores
                    Only toggle. Single row to keep visual density tight.
                    Hint text shifts to the right when the checkbox is on
                    and PBP data exists. */}
                <div className="px-3 sm:px-4 py-2.5 border-b border-surface-3 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 sm:gap-4">
                    {hasVideoLinks && (
                      <button
                        onClick={() => {
                          setHighlightsStartIndex(0)
                          setShowHighlightsModal(true)
                        }}
                        className="inline-flex items-center gap-2 px-3 py-1.5 bg-surface-3 hover:bg-surface-4 text-txt-primary text-xs font-display font-semibold uppercase tracking-[0.08em] rounded-md transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                        Watch all scores
                      </button>
                    )}
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={effectiveScoresOnly}
                        disabled={!hasPBPData}
                        onChange={(e) => setScoresOnly(e.target.checked)}
                        className="w-4 h-4 rounded border-surface-4 bg-surface-2 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed accent-team-primary"
                      />
                      <span className="text-[11px] sm:text-xs font-display font-semibold uppercase tracking-[0.08em] text-txt-secondary">
                        Scores only
                      </span>
                    </label>
                  </div>
                  {hasPBPData && effectiveScoresOnly && (
                    <span className="text-[10px] sm:text-[11px] text-txt-tertiary italic">
                      Tap a play to see its drive
                    </span>
                  )}
                </div>

                <div className="divide-y divide-surface-3">
                {playsWithScores.map((play, idx) => {
                  const isScoring = isScoringPlay(play)

                  // Non-scoring play in Scores Only mode → hidden entirely.
                  if (!isScoring && effectiveScoresOnly) return null

                  // Non-scoring play in All Plays mode → compact PBP row.
                  if (!isScoring) return renderPBPRow(play, idx)

                  // Scoring play — full card. In Scores Only mode AND with
                  // PBP data, the card is expandable to reveal the drive
                  // (consecutive same-team plays leading to this score).
                  const drive = hasPBPData ? findDrive(idx) : [play]
                  const drivePrior = drive.slice(0, -1) // plays before the scoring play
                  const canExpand = effectiveScoresOnly && drivePrior.length > 0
                  const isExpanded = expandedDrives.has(idx)

                  const resolvedPlayTeam = resolvePlayTeamData(play)
                  const playTeamColors = resolvedPlayTeam.colors
                    || getTeamColorsRobust(resolvedPlayTeam.abbr)
                    || { primary: '#666', secondary: '#333' }
                  const scorerPID = getPlayerPID(play.scorer)
                  const passerPID = play.passer ? getPlayerPID(play.passer) : null
                  const isLeftTeam = isPlayOnLeftSide(play)
                  // Scoring card layout — broadcast scorebug aesthetic:
                  //   • 4px team-color left rail (the ONLY team-color fill)
                  //   • Quarter chip in neutral surface-3 with team-color
                  //     left accent (uppercase tracked label)
                  //   • Running score is the visual hero (display-md font,
                  //     tabular-nums). Active team's number sits in
                  //     text-primary; opponent's in text-tertiary so the
                  //     scoring side reads instantly even without color.
                  //   • Score type rendered as all-caps tracked label.
                  //   • PAT chip in semantic success/danger (low alpha).
                  //   • Hover: surface-2/60 base shift, no gradient.
                  const quarterLabel = ['1', '2', '3', '4', 1, 2, 3, 4].includes(play.quarter) ? `Q${play.quarter}` : (play.quarter || 'OT')
                  const scoreTypeLabel = (is2PTAttempt(play) ? '2PT Conversion' : (play.scoreType || '')).toUpperCase()
                  const patIsGood = play.patResult && (play.patResult.includes('Made') || play.patResult.includes('Converted'))
                  const twoPtGood = is2PTAttempt(play) && is2PTConverted(play)
                  return (
                    <div key={idx}>
                    {/* Drive sub-rows render ABOVE the scoring play so the
                        drive reads chronologically top-to-bottom: prior
                        downs leading to the score, then the score itself
                        as the conclusion. The scroll-anchor logic in
                        toggleDriveExpansion keeps the scoring row pinned
                        to the user's click position while the panel
                        unfurls / collapses.
                        ────────────────────────────────────────────────
                        ANIMATION: grid-template-rows 0fr→1fr auto-sizes
                        to content height, so the full 300ms is visible
                        motion. The previous max-height: 0→1500px ran the
                        full 300ms but visible motion stopped once
                        max-height passed the content height (~40ms for a
                        200px drive), leaving 260ms of nothing happening
                        — that's why it felt snappy / cut off.
                        On expand: panel grows (0-300ms) and content fades
                        in slightly delayed (100-300ms) so plays appear
                        IN rather than slide in cold.
                        On collapse: content fades out fast (0-180ms)
                        while panel finishes its shrink — content is
                        already invisible before the panel finishes
                        closing, so there's no "rows fly past" feel. */}
                    {canExpand && (
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateRows: isExpanded ? '1fr' : '0fr',
                          transition: 'grid-template-rows 300ms cubic-bezier(0.4, 0, 0.2, 1)',
                        }}
                      >
                        <div style={{ overflow: 'hidden', minHeight: 0 }}>
                          <div
                            className="bg-surface-0/60 divide-y divide-surface-3/30 border-b border-surface-3"
                            style={{
                              opacity: isExpanded ? 1 : 0,
                              transform: isExpanded ? 'translateY(0)' : 'translateY(-4px)',
                              transition: isExpanded
                                ? 'opacity 200ms ease-out 100ms, transform 200ms ease-out 100ms'
                                : 'opacity 180ms ease-in, transform 180ms ease-in',
                            }}
                          >
                            {drivePrior.map((dp, didx) => renderPBPRow(dp, `drive-${idx}-${didx}`))}
                          </div>
                        </div>
                      </div>
                    )}
                    <div
                      ref={(el) => {
                        // Track the DOM node so toggleDriveExpansion can
                        // scroll this row back into view after the drive
                        // panel unfurls above it. Map cleared on unmount.
                        if (el) scoringRowRefs.current.set(idx, el)
                        else scoringRowRefs.current.delete(idx)
                      }}
                      className={`flex items-stretch transition-colors hover:bg-surface-2/60 ${canExpand ? 'cursor-pointer' : ''}`}
                      onClick={canExpand ? (e) => {
                        // Don't toggle drive expansion when the user
                        // clicks the inline player link or the video
                        // button — those have their own handlers.
                        if (e.target.closest('a, button')) return
                        toggleDriveExpansion(idx)
                      } : undefined}
                    >
                      {/* 4px team-color rail — the only team-color fill on the row */}
                      <div className="w-1 flex-shrink-0" style={{ backgroundColor: playTeamColors.primary }} />
                      <div className="flex-1 flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-3 sm:py-3.5 min-w-0">
                        {/* Quarter chip + time stacked */}
                        <div className="flex-shrink-0 w-11 sm:w-12">
                          <div className="font-display font-bold text-[10px] sm:text-[11px] uppercase tracking-[0.1em] text-txt-secondary bg-surface-3 rounded px-1.5 py-0.5 text-center">
                            {quarterLabel}
                          </div>
                          <div className="text-txt-tertiary text-[10px] sm:text-[11px] font-display tabular-nums text-center mt-1">
                            {play.timeLeft}
                          </div>
                        </div>

                        {/* Team logo + running score (the hero). The scoring
                            team's number reads in text-primary so the side
                            with the score is unmistakable. */}
                        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                          <img
                            src={resolvedPlayTeam.logo
                              || getTeamLogo(getMascotName(resolvedPlayTeam.abbr, currentDynasty?.teams || currentDynasty?.customTeams) || resolvedPlayTeam.abbr)}
                            alt={resolvedPlayTeam.abbr}
                            className="w-7 h-7 sm:w-8 sm:h-8 object-contain flex-shrink-0"
                          />
                          <div className="font-display font-extrabold text-xl sm:text-2xl tabular-nums tracking-tight leading-none flex items-baseline gap-1">
                            <span className={isLeftTeam ? 'text-txt-primary' : 'text-txt-tertiary'}>{play.runningLeftScore}</span>
                            <span className="text-txt-muted text-base font-normal">–</span>
                            <span className={!isLeftTeam ? 'text-txt-primary' : 'text-txt-tertiary'}>{play.runningRightScore}</span>
                          </div>
                        </div>

                        {/* Play details — score type + scorer + PAT chip */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-display font-semibold uppercase tracking-[0.06em] text-txt-primary text-xs sm:text-sm">
                              {scoreTypeLabel}
                            </span>
                            {play.yards != null && play.yards !== '' && (
                              <span className="text-txt-tertiary font-display tabular-nums text-xs sm:text-sm">
                                {play.yards} YD{Math.abs(Number(play.yards)) === 1 ? '' : 'S'}
                              </span>
                            )}
                            {play.patResult && !is2PTAttempt(play) && (
                              <span className={`font-display font-bold uppercase tracking-[0.1em] text-[10px] sm:text-[11px] ${
                                patIsGood ? 'text-txt-tertiary' : 'text-txt-muted line-through decoration-1'
                              }`}>
                                {play.patResult}
                              </span>
                            )}
                            {is2PTAttempt(play) && (
                              <span className={`font-display font-bold uppercase tracking-[0.1em] text-[10px] sm:text-[11px] ${
                                twoPtGood ? 'text-txt-tertiary' : 'text-txt-muted line-through decoration-1'
                              }`}>
                                {twoPtGood ? '2PT Good' : '2PT Failed'}
                              </span>
                            )}
                          </div>
                          <div className="text-txt-secondary text-[11px] sm:text-xs mt-1 truncate">
                            {is2PTAttempt(play) ? (
                              <span className="italic text-txt-tertiary">{twoPtGood ? 'Successful conversion' : 'Conversion failed'}</span>
                            ) : (
                              <>
                                {scorerPID ? (
                                  <Link to={`${pathPrefix}/player/${scorerPID}`} className="font-medium text-txt-secondary hover:text-txt-primary hover:underline underline-offset-2">
                                    {play.scorer}
                                  </Link>
                                ) : <span className="font-medium">{play.scorer}</span>}
                                {play.passer && (
                                  <>
                                    <span className="text-txt-muted"> from </span>
                                    {passerPID ? (
                                      <Link to={`${pathPrefix}/player/${passerPID}`} className="font-medium text-txt-secondary hover:text-txt-primary hover:underline underline-offset-2">
                                        {play.passer}
                                      </Link>
                                    ) : <span className="font-medium">{play.passer}</span>}
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        </div>

                        {/* Video Link Button — load-bearing icon, kept as a
                            tight ghost button with a subtle hover ring. */}
                        {play.videoLink && (
                          <button
                            onClick={() => {
                              const playsWithVideoLinks = playsWithScores.filter(p => p.videoLink)
                              const videoIndex = playsWithVideoLinks.findIndex(p => p === play)
                              setHighlightsStartIndex(videoIndex >= 0 ? videoIndex : 0)
                              setShowHighlightsModal(true)
                            }}
                            className="flex-shrink-0 p-1.5 sm:p-2 rounded-md text-txt-tertiary hover:text-txt-primary hover:bg-surface-3 transition-colors"
                            title="Watch video clip"
                          >
                            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </button>
                        )}
                        {canExpand && (
                          <div
                            className="flex-shrink-0 p-1.5 sm:p-2 transition-transform text-txt-tertiary"
                            style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                            aria-hidden="true"
                          >
                            <svg className="w-4 h-4 sm:w-5 sm:h-5 text-txt-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        )}
                      </div>
                    </div>
                    </div>
                  )
                })}
                </div>
              </div>
            )
          })()}

          {/* Game Recap Tab — display only. Editing and prompt copying live in
              the game editor so the viewing surface stays clean. */}
          {activeTab === 'recap' && (
            <div className="px-4 py-6 sm:px-6 sm:py-8">
              {game.aiRecap ? (
                <FormattedRecap
                  text={game.aiRecap}
                  className="text-txt-secondary text-[15px] leading-relaxed max-w-3xl mx-auto"
                  playerLinks={recapPlayerLinks}
                />
              ) : (
                <p className="text-sm text-txt-secondary max-w-3xl mx-auto">
                  No recap yet for this game.
                  {!isViewOnly && gameId && (
                    <>
                      {' '}
                      <Link
                        to={`${pathPrefix}/game/${gameId}/edit`}
                        className="text-txt-primary hover:text-txt-secondary underline underline-offset-2"
                      >
                        Add one in the game editor
                      </Link>.
                    </>
                  )}
                </p>
              )}
            </div>
          )}

          {/* Box Score Tab - Team tabs on mobile, side-by-side on desktop */}
          {activeTab === 'boxscore' && game.boxScore && (() => {
            // Player-stats data is tid-keyed; look each side up directly.
            // No home/away mapping needed — and no chance of mismatch.
            const leftData_bs  = getPlayerStatsForTid(game, leftData.tid,  teams) || {}
            const rightData_bs = getPlayerStatsForTid(game, rightData.tid, teams) || {}
            const leftTeamData_bs = leftData
            const rightTeamData_bs = rightData

            // Helper to render a team's stat table for a specific stat category
            const renderTeamStatTable = (teamData, teamInfo, statKey, showTeamHeader = true) => {
              const tab = STAT_TABS[statKey]
              if (!teamData?.[statKey]?.length) {
                return (
                  <div className="py-2 px-2">
                    {showTeamHeader && (
                      <div className="text-txt-tertiary text-sm font-medium mb-2">{tab.title}</div>
                    )}
                    <div className="text-txt-muted text-sm py-2">No {tab.title.toLowerCase()} stats</div>
                  </div>
                )
              }

              return (
                <div className="py-2">
                  {showTeamHeader && (
                    <div className="text-txt-tertiary text-sm font-medium mb-2 px-2">{tab.title}</div>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-txt-tertiary text-left border-b border-surface-4">
                          {getDisplayHeaders(statKey).map((header, idx) => (
                            <th
                              key={idx}
                              className={`py-2 px-2 font-medium whitespace-nowrap text-xs ${idx === 0 ? 'text-left' : 'text-center'}`}
                            >
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {teamData[statKey].map((row, rowIdx) => {
                          const values = getDisplayHeaders(statKey).map((header, colIdx) => {
                            // Handle special combined/renamed columns
                            if (header === 'C/Att') {
                              const comp = row.comp ?? 0
                              // Support both sheet format (att) and random generator format (attempts)
                              const att = row.att ?? row.attempts ?? 0
                              return { value: `${comp}/${att}`, isName: false }
                            }
                            if (header === 'Rtg') {
                              // Support both sheet format (rtg) and random generator format (qBRating)
                              const rating = row.rtg ?? row.qBRating
                              const value = (rating === '' || rating === null || rating === undefined) ? 0 : Number(rating).toFixed(1)
                              return { value, isName: false }
                            }

                            // Map abbreviated headers to their data keys
                            const headerKeyMap = { 'BT': 'brokenTackles' }
                            const key = colIdx === 0 ? 'playerName' : (headerKeyMap[header] || header.replace(/\s+/g, '').replace(/^./, c => c.toLowerCase()))
                            let rawValue = row[key]
                            if (statKey === 'defense' && key === 'total') {
                              rawValue = (parseFloat(row.solo) || 0) + (parseFloat(row.assists) || 0)
                            }
                            let value = colIdx === 0
                              ? (rawValue ?? '-')
                              : (rawValue === '' || rawValue === null || rawValue === undefined ? 0 : rawValue)
                            if (key === 'qBRating' && value !== 0 && value !== '') {
                              value = Number(value).toFixed(1)
                            }
                            return { value, isName: colIdx === 0 }
                          })
                          const playerPID = getPlayerPID(values[0].value)

                          return (
                            <tr key={rowIdx} className="border-b border-surface-3/50 hover:bg-surface-2/30">
                              {values.map((cell, colIdx) => (
                                <td
                                  key={colIdx}
                                  className={`py-1.5 px-2 whitespace-nowrap ${colIdx === 0 ? 'text-left' : 'text-center text-txt-secondary'}`}
                                >
                                  {colIdx === 0 && playerPID ? (
                                    <Link to={`${pathPrefix}/player/${playerPID}`} className="text-white hover:underline hover:text-txt-secondary">
                                      {cell.value}
                                    </Link>
                                  ) : colIdx === 0 ? (
                                    <span className="text-white">{cell.value}</span>
                                  ) : cell.value}
                                </td>
                              ))}
                            </tr>
                          )
                        })}
                        {/* Totals Row */}
                        <tr className="border-t border-surface-4 bg-surface-2/50 font-semibold">
                          {getDisplayHeaders(statKey).map((header, colIdx) => {
                            if (colIdx === 0) {
                              return (
                                <td key={colIdx} className="py-2 px-2 text-left text-white text-xs uppercase">
                                  Total
                                </td>
                              )
                            }

                            // Handle Long columns - show max value
                            if (header === 'Long' || header === 'FG Long') {
                              const key = header === 'FG Long' ? 'fGLong' : 'long'
                              const longValues = teamData[statKey].map(row => parseFloat(row[key]) || 0)
                              const maxLong = longValues.length > 0 ? Math.max(...longValues) : 0
                              return <td key={colIdx} className="py-2 px-2 text-center text-white">{maxLong || 0}</td>
                            }

                            // Handle QBR - weighted average based on attempts
                            if (header === 'Rtg') {
                              // Support both sheet format (att/rtg) and random generator format (attempts/qBRating)
                              const totalAttempts = teamData[statKey].reduce((sum, row) => sum + (parseFloat(row.att ?? row.attempts) || 0), 0)
                              if (totalAttempts === 0) {
                                return <td key={colIdx} className="py-2 px-2 text-center text-white">0.0</td>
                              }
                              const weightedRtg = teamData[statKey].reduce((sum, row) => {
                                const attempts = parseFloat(row.att ?? row.attempts) || 0
                                const rating = parseFloat(row.rtg ?? row.qBRating) || 0
                                return sum + (attempts / totalAttempts) * rating
                              }, 0)
                              return <td key={colIdx} className="py-2 px-2 text-center text-white">{weightedRtg.toFixed(1)}</td>
                            }

                            // Handle C/Att specially
                            if (header === 'C/Att') {
                              const totalComp = teamData[statKey].reduce((sum, row) => sum + (parseFloat(row.comp) || 0), 0)
                              // Support both sheet format (att) and random generator format (attempts)
                              const totalAtt = teamData[statKey].reduce((sum, row) => sum + (parseFloat(row.att ?? row.attempts) || 0), 0)
                              return <td key={colIdx} className="py-2 px-2 text-center text-white">{totalComp}/{totalAtt}</td>
                            }

                            // Sum numeric columns
                            const headerKeyMap = { 'BT': 'brokenTackles' }
                            const key = headerKeyMap[header] || header.replace(/\s+/g, '').replace(/^./, c => c.toLowerCase())
                            let total = teamData[statKey].reduce((sum, row) => {
                              let val = row[key]
                              // Handle defense total specially
                              if (statKey === 'defense' && key === 'total') {
                                val = (parseFloat(row.solo) || 0) + (parseFloat(row.assists) || 0)
                              }
                              return sum + (parseFloat(val) || 0)
                            }, 0)

                            return (
                              <td key={colIdx} className="py-2 px-2 text-center text-white">
                                {Number.isInteger(total) ? total : total.toFixed(1)}
                              </td>
                            )
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            }

            return (
              <div>
                {/* Mobile: Team tabs */}
                <div className="lg:hidden border-b border-surface-4">
                  <div className="flex">
                    {[
                      { key: 'left', teamData: leftTeamData_bs },
                      { key: 'right', teamData: rightTeamData_bs }
                    ].map(({ key, teamData }) => (
                      <button
                        key={key}
                        onClick={() => setBoxScoreTeamTab(key)}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 text-xs sm:text-sm font-medium transition-colors min-w-0 ${
                          boxScoreTeamTab === key
                            ? 'text-white border-b-2 border-white bg-surface-2'
                            : 'text-txt-tertiary hover:text-white hover:bg-surface-2/50'
                        }`}
                      >
                        <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-white flex items-center justify-center flex-shrink-0 p-0.5">
                          <img
                            src={getTeamLogo(getMascotName(teamData.abbr, currentDynasty?.teams || currentDynasty?.customTeams) || teamData.abbr)}
                            alt={teamData.name}
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <span className="truncate">{teamData.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mobile: Show selected team's stats */}
                <div className="lg:hidden divide-y divide-surface-4">
                  {STAT_TAB_ORDER.map(statKey => {
                    const teamData = boxScoreTeamTab === 'left' ? leftData_bs : rightData_bs
                    const teamInfo = boxScoreTeamTab === 'left' ? leftTeamData_bs : rightTeamData_bs
                    const hasData = teamData?.[statKey]?.length > 0
                    if (!hasData) return null
                    return (
                      <div key={statKey} className="px-2">
                        {renderTeamStatTable(teamData, teamInfo, statKey, true)}
                      </div>
                    )
                  })}
                </div>

                {/* Desktop: Side-by-side layout */}
                <div className="hidden lg:block divide-y divide-surface-4">
                  {STAT_TAB_ORDER.map(statKey => {
                    const tab = STAT_TABS[statKey]
                    const hasLeftData = leftData_bs?.[statKey]?.length > 0
                    const hasRightData = rightData_bs?.[statKey]?.length > 0

                    if (!hasLeftData && !hasRightData) return null

                    return (
                      <div key={statKey} className="py-4 px-4">
                        <div className="grid grid-cols-2 gap-6">
                          {/* Left Team */}
                          <div className="min-w-0">
                            <div
                              className="cfb-texture flex items-center gap-2 mb-2 px-3 py-2 rounded-lg overflow-hidden"
                              style={{ backgroundColor: leftTeamData_bs.colors.primary, backgroundImage: 'linear-gradient(120deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 42%), linear-gradient(180deg, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.34) 100%)' }}
                            >
                              <Link to={`${pathPrefix}/team/${resolveTid(leftTeamData_bs.abbr, currentDynasty?.teams || TEAMS)}/${game.year}`} className="group flex items-center gap-2 min-w-0">
                                <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center flex-shrink-0 p-0.5 shadow-sm">
                                  <img
                                    src={getTeamLogo(getMascotName(leftTeamData_bs.abbr, currentDynasty?.teams || currentDynasty?.customTeams) || leftTeamData_bs.abbr)}
                                    alt={leftTeamData_bs.name}
                                    className="w-full h-full object-contain"
                                  />
                                </div>
                                <span className="font-semibold text-sm group-hover:underline truncate" style={{ color: getContrastTextColor(leftTeamData_bs.colors.primary) }}>{leftTeamData_bs.name}</span>
                              </Link>
                              <span className="text-sm flex-shrink-0" style={{ color: getContrastTextColor(leftTeamData_bs.colors.primary), opacity: 0.72 }}>{tab.title}</span>
                            </div>
                            {hasLeftData ? renderTeamStatTable(leftData_bs, leftTeamData_bs, statKey, false) : (
                              <div className="text-txt-muted text-sm px-2 py-4">No {tab.title.toLowerCase()} stats</div>
                            )}
                          </div>
                          {/* Right Team */}
                          <div className="min-w-0">
                            <div
                              className="cfb-texture flex items-center gap-2 mb-2 px-3 py-2 rounded-lg overflow-hidden"
                              style={{ backgroundColor: rightTeamData_bs.colors.primary, backgroundImage: 'linear-gradient(120deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 42%), linear-gradient(180deg, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.34) 100%)' }}
                            >
                              <Link to={`${pathPrefix}/team/${resolveTid(rightTeamData_bs.abbr, currentDynasty?.teams || TEAMS)}/${game.year}`} className="group flex items-center gap-2 min-w-0">
                                <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center flex-shrink-0 p-0.5 shadow-sm">
                                  <img
                                    src={getTeamLogo(getMascotName(rightTeamData_bs.abbr, currentDynasty?.teams || currentDynasty?.customTeams) || rightTeamData_bs.abbr)}
                                    alt={rightTeamData_bs.name}
                                    className="w-full h-full object-contain"
                                  />
                                </div>
                                <span className="font-semibold text-sm group-hover:underline truncate" style={{ color: getContrastTextColor(rightTeamData_bs.colors.primary) }}>{rightTeamData_bs.name}</span>
                              </Link>
                              <span className="text-sm flex-shrink-0" style={{ color: getContrastTextColor(rightTeamData_bs.colors.primary), opacity: 0.72 }}>{tab.title}</span>
                            </div>
                            {hasRightData ? renderTeamStatTable(rightData_bs, rightTeamData_bs, statKey, false) : (
                              <div className="text-txt-muted text-sm px-2 py-4">No {tab.title.toLowerCase()} stats</div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Team Stats Tab */}
          {activeTab === 'stats' && hasAnyTeamStats(game, teams) && (() => {
        // Team stats are stored byTid; pull each side's slot directly.
        const leftTeamStats  = getTeamStatsForTid(game, leftData.tid,  teams) || {}
        const rightTeamStats = getTeamStatsForTid(game, rightData.tid, teams) || {}
        const leftTeamAbbr   = getAbbrFromTeamName(leftTeamStats.teamAbbr)  || leftTeamStats.teamAbbr  || leftData.abbr
        const rightTeamAbbr  = getAbbrFromTeamName(rightTeamStats.teamAbbr) || rightTeamStats.teamAbbr || rightData.abbr

        // Get team colors
        const leftTeamColors = getTeamColorsRobust(leftTeamAbbr) || leftData.colors
        const rightTeamColors = getTeamColorsRobust(rightTeamAbbr) || rightData.colors

        // Helper to format possession time
        const formatPossession = (mins, secs) => {
          if (mins == null && secs == null) return null
          const totalMins = (mins || 0)
          const totalSecs = (secs || 0)
          return `${totalMins}:${totalSecs.toString().padStart(2, '0')}`
        }

        // Helper to safely calculate averages
        const calcAvg = (total, attempts) => {
          if (total == null || attempts == null || attempts === 0) return null
          return (total / attempts).toFixed(1)
        }

        // Build all stats in display order with calculated fields
        const allStats = [
          { label: 'First Downs', left: leftTeamStats.firstDowns, right: rightTeamStats.firstDowns },
          { label: 'Total Offense', left: leftTeamStats.totalOffense, right: rightTeamStats.totalOffense, key: true },
          { label: 'Total Plays', left: leftTeamStats.totalPlays, right: rightTeamStats.totalPlays },
          { label: 'Yards Per Play', left: calcAvg(leftTeamStats.totalOffense, leftTeamStats.totalPlays), right: calcAvg(rightTeamStats.totalOffense, rightTeamStats.totalPlays), calculated: true },
          { label: 'Rush Attempts', left: leftTeamStats.rushAttempts, right: rightTeamStats.rushAttempts },
          { label: 'Rush Yards', left: leftTeamStats.rushYards, right: rightTeamStats.rushYards },
          { label: 'Rush TDs', left: leftTeamStats.rushTds, right: rightTeamStats.rushTds },
          { label: 'Yards Per Rush', left: calcAvg(leftTeamStats.rushYards, leftTeamStats.rushAttempts), right: calcAvg(rightTeamStats.rushYards, rightTeamStats.rushAttempts), calculated: true },
          { label: 'Completions', left: leftTeamStats.completions, right: rightTeamStats.completions },
          { label: 'Pass Attempts', left: leftTeamStats.passAttempts, right: rightTeamStats.passAttempts },
          { label: 'Pass TDs', left: leftTeamStats.passTds, right: rightTeamStats.passTds },
          { label: 'Yards Per Pass', left: calcAvg(leftTeamStats.passingYards || leftTeamStats.passYards, leftTeamStats.passAttempts), right: calcAvg(rightTeamStats.passingYards || rightTeamStats.passYards, rightTeamStats.passAttempts), calculated: true },
          { label: 'Passing Yards', left: leftTeamStats.passingYards || leftTeamStats.passYards, right: rightTeamStats.passingYards || rightTeamStats.passYards },
          { label: '3rd Down Conv', left: leftTeamStats['3rdDownConv'], right: rightTeamStats['3rdDownConv'] },
          { label: '3rd Down Att', left: leftTeamStats['3rdDownAtt'], right: rightTeamStats['3rdDownAtt'] },
          { label: '4th Down Conv', left: leftTeamStats['4thDownConv'], right: rightTeamStats['4thDownConv'] },
          { label: '4th Down Att', left: leftTeamStats['4thDownAtt'], right: rightTeamStats['4thDownAtt'] },
          { label: '2-Point Conv', left: leftTeamStats['2ptConv'], right: rightTeamStats['2ptConv'] },
          { label: '2-Point Att', left: leftTeamStats['2ptAtt'], right: rightTeamStats['2ptAtt'] },
          {
            label: 'Red Zone',
            left: `${leftTeamStats.redZoneTd || 0} | ${leftTeamStats.redZoneFg || 0} | ${leftTeamStats.redZonePct || 0}%`,
            right: `${rightTeamStats.redZoneTd || 0} | ${rightTeamStats.redZoneFg || 0} | ${rightTeamStats.redZonePct || 0}%`,
            subLabel: 'TD | FG | %'
          },
          { label: 'Turnovers', left: leftTeamStats.turnovers, right: rightTeamStats.turnovers, inverted: true, key: true },
          { label: 'Fumbles Lost', left: leftTeamStats.fumblesLost, right: rightTeamStats.fumblesLost, inverted: true },
          { label: 'Interceptions', left: leftTeamStats.interceptions, right: rightTeamStats.interceptions, inverted: true },
          { label: 'Punt Ret Yards', left: leftTeamStats.puntRetYards, right: rightTeamStats.puntRetYards },
          { label: 'Kick Ret Yards', left: leftTeamStats.kickRetYards, right: rightTeamStats.kickRetYards },
          { label: 'Total Yards', left: leftTeamStats.totalYards, right: rightTeamStats.totalYards },
          { label: 'Punt Avg', left: leftTeamStats.puntAvg ?? leftTeamStats.punts, right: rightTeamStats.puntAvg ?? rightTeamStats.punts },
          { label: 'Penalties', left: leftTeamStats.penalties, right: rightTeamStats.penalties, inverted: true },
          { label: 'Penalty Yards', left: leftTeamStats.penaltyYards, right: rightTeamStats.penaltyYards, inverted: true },
          { label: 'Time of Possession', left: formatPossession(leftTeamStats.possMinutes, leftTeamStats.possSeconds), right: formatPossession(rightTeamStats.possMinutes, rightTeamStats.possSeconds) },
        ].filter(stat => stat.left != null || stat.right != null)

        // Render a stat comparison row
        const renderStatRow = (stat, idx) => {
          const leftVal = stat.left ?? (stat.calculated ? '-' : 0)
          const rightVal = stat.right ?? (stat.calculated ? '-' : 0)

          // Determine winner (for inverted stats like turnovers, lower is better)
          const leftNum = parseFloat(leftVal) || 0
          const rightNum = parseFloat(rightVal) || 0
          const leftWins = stat.inverted ? leftNum < rightNum : leftNum > rightNum
          const rightWins = stat.inverted ? rightNum < leftNum : rightNum > leftNum
          const tie = leftNum === rightNum

          return (
            <div key={idx} className={`px-3 sm:px-4 py-2 flex items-center ${stat.key ? 'bg-surface-2/40' : ''}`}>
              {/* Left value with team color indicator */}
              <div className="flex-1 flex items-center gap-2">
                <div
                  className="w-1 h-5 rounded-full"
                  style={{ backgroundColor: leftWins && !tie ? leftTeamColors.primary : 'transparent' }}
                />
                <span className={`text-xs sm:text-sm font-bold tabular-nums ${leftWins && !tie ? 'text-white' : 'text-txt-tertiary'} ${stat.calculated ? 'italic' : ''}`}>
                  {leftVal}
                </span>
              </div>

              {/* Stat label */}
              <div className="text-center flex-shrink-0 px-1 sm:px-2">
                <span className="text-[9px] sm:text-xs font-medium uppercase tracking-wide text-txt-secondary">
                  {stat.label}
                </span>
                {stat.subLabel && (
                  <div className="text-[8px] sm:text-[10px] text-txt-tertiary mt-0.5">{stat.subLabel}</div>
                )}
              </div>

              {/* Right value with team color indicator */}
              <div className="flex-1 flex items-center justify-end gap-2">
                <span className={`text-xs sm:text-sm font-bold tabular-nums ${rightWins && !tie ? 'text-white' : 'text-txt-tertiary'} ${stat.calculated ? 'italic' : ''}`}>
                  {rightVal}
                </span>
                <div
                  className="w-1 h-5 rounded-full"
                  style={{ backgroundColor: rightWins && !tie ? rightTeamColors.primary : 'transparent' }}
                />
              </div>
            </div>
          )
        }

        return (
          <>
            {/* Team header with logos — each side washed in its team color. */}
            <div
              className="px-4 py-3 border-b border-surface-4 flex items-center justify-between"
              style={{ backgroundImage: `linear-gradient(90deg, ${leftTeamColors.primary} 0%, ${leftTeamColors.primary}00 38%, ${rightTeamColors.primary}00 62%, ${rightTeamColors.primary} 100%)` }}
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-white p-1 shadow-sm">
                  <img src={getTeamLogoRobust(leftTeamAbbr)} alt="" className="w-full h-full object-contain" />
                </div>
                <span className="text-sm font-bold text-white hidden sm:inline" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
                  {getMascotName(leftTeamAbbr, currentDynasty?.teams) || leftTeamAbbr}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white hidden sm:inline" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
                  {getMascotName(rightTeamAbbr, currentDynasty?.teams) || rightTeamAbbr}
                </span>
                <div className="w-8 h-8 rounded-full bg-white p-1 shadow-sm">
                  <img src={getTeamLogoRobust(rightTeamAbbr)} alt="" className="w-full h-full object-contain" />
                </div>
              </div>
            </div>

            {/* All stats in display order */}
            <div className="divide-y divide-surface-3/30">
              {allStats.map((stat, idx) => renderStatRow(stat, idx))}
            </div>
          </>
        )
      })()}

          {/* Ratings Tab */}
          {activeTab === 'ratings' && (() => {
            const userTid = game.userTid || resolveTid(displayTeamAbbr, currentDynasty?.teams || TEAMS)
            const storedUserRatings = getTeamRatingsForYear(currentDynasty, userTid, game.year)
            const userRatings = {
              ovr: game.team1Overall ?? storedUserRatings?.overall,
              off: game.team1Offense ?? storedUserRatings?.offense,
              def: game.team1Defense ?? storedUserRatings?.defense
            }
            const oppRatings = {
              ovr: game.team2Overall ?? game.opponentOverall,
              off: game.team2Offense ?? game.opponentOffense,
              def: game.team2Defense ?? game.opponentDefense
            }
            const leftIsOpponent = leftTeam !== 'user'
            const leftRatings = leftIsOpponent ? oppRatings : userRatings
            const rightRatings = !leftIsOpponent ? oppRatings : userRatings

            return (
              <div className="p-4 space-y-4">
                {[leftData, rightData].map((team, idx) => {
                  const ratings = idx === 0 ? leftRatings : rightRatings
                  if (!ratings.ovr && !ratings.off && !ratings.def) return null

                  const ovrBetter = (ratings.ovr || 0) > ((idx === 0 ? rightRatings : leftRatings).ovr || 0)
                  const offBetter = (ratings.off || 0) > ((idx === 0 ? rightRatings : leftRatings).off || 0)
                  const defBetter = (ratings.def || 0) > ((idx === 0 ? rightRatings : leftRatings).def || 0)

                  return (
                    <Link key={idx} to={`${pathPrefix}/team/${resolveTid(team.abbr, currentDynasty?.teams || TEAMS)}/${game.year}`} className="group flex items-center gap-3 p-3 rounded-xl bg-surface-2/50 hover:bg-surface-2 transition-colors">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center p-1.5 shadow-md flex-shrink-0 bg-white ">
                        {team.logo && <img src={team.logo} alt="" className="w-full h-full object-contain" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-white text-sm truncate group-hover:underline">{team.name}</div>
                        <div className="flex gap-4 mt-1.5">
                          {ratings.ovr && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-txt-muted font-medium uppercase">OVR</span>
                              <span className={`text-lg ${ovrBetter ? 'text-green-400 font-bold' : 'text-txt-secondary'}`}>{ratings.ovr}</span>
                            </div>
                          )}
                          {ratings.off && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-txt-muted font-medium uppercase">OFF</span>
                              <span className={`text-lg ${offBetter ? 'text-green-400 font-bold' : 'text-txt-secondary'}`}>{ratings.off}</span>
                            </div>
                          )}
                          {ratings.def && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-txt-muted font-medium uppercase">DEF</span>
                              <span className={`text-lg ${defBetter ? 'text-green-400 font-bold' : 'text-txt-secondary'}`}>{ratings.def}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )
          })()}

          {/* Awards Tab */}
          {activeTab === 'awards' && (game.conferencePOW || game.confDefensePOW || game.nationalPOW || game.natlDefensePOW) && (() => {
            const yr = game.year
            // Resolve a POW honoree's team for this game's year, then its
            // conference (year-specific when set) and team color — so the
            // header reads e.g. "SEC Player of the Week" and each honoree is
            // themed in their own team's color.
            const teamTidForName = (name) => {
              const p = getPlayerByName(name)
              if (!p) return null
              return p.teamsByYear?.[yr] ?? p.teamsByYear?.[String(yr)] ?? p.team ?? null
            }
            const confForName = (name) => {
              const tid = teamTidForName(name)
              if (tid == null) return null
              const byYearConf = teams?.[tid]?.byYear?.[yr]?.conference
              if (byYearConf) return byYearConf
              const customConf = currentDynasty?.customConferencesByYear?.[yr] || currentDynasty?.customConferences || null
              return getTeamConference(tid, customConf, teams) || null
            }
            const teamColorForName = (name) => {
              const tid = teamTidForName(name)
              return (tid != null && teams?.[tid]?.primaryColor) || '#64748b'
            }
            const confName = confForName(game.conferencePOW) || confForName(game.confDefensePOW)
            const confLogo = confName ? getConferenceLogo(confName) : null

            // Shared honoree — team-colored avatar ring, solid side chip, name,
            // stat line.
            const HonoreeRow = ({ name, side, accent }) => {
              const player = getPlayerByName(name)
              const stats = getPlayerBoxScoreStats(name)
              const pid = getPlayerPID(name)
              const initials = (name || '?').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
              return (
                <div className="flex items-center gap-3.5">
                  <div className="w-14 h-14 rounded-full overflow-hidden flex-shrink-0 bg-surface-3" style={{ boxShadow: `0 0 0 2px ${accent}` }}>
                    {player?.pictureUrl ? (
                      <img src={proxyImageUrl(player.pictureUrl, 300)} alt={name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-bold text-base" style={{ color: accent }}>{initials}</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span
                      className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider mb-1"
                      style={{ color: getContrastTextColor(accent), backgroundColor: accent }}
                    >
                      {side}
                    </span>
                    {pid ? (
                      <Link to={`${pathPrefix}/player/${pid}`} className="block font-display font-bold text-txt-primary text-base leading-tight truncate hover:underline" style={{ letterSpacing: '-0.01em' }}>
                        {name}
                      </Link>
                    ) : (
                      <div className="font-display font-bold text-txt-primary text-base leading-tight truncate" style={{ letterSpacing: '-0.01em' }}>{name}</div>
                    )}
                    {stats && <div className="text-xs text-txt-tertiary mt-0.5 tabular-nums">{stats}</div>}
                  </div>
                </div>
              )
            }

            const panelCount = ((game.conferencePOW || game.confDefensePOW) ? 1 : 0) + ((game.nationalPOW || game.natlDefensePOW) ? 1 : 0)

            return (
              <div className={`p-4 grid grid-cols-1 gap-3 ${panelCount > 1 ? 'md:grid-cols-2' : 'max-w-xl'}`}>
                {/* Conference Player(s) of the Week — conference-branded header */}
                {(game.conferencePOW || game.confDefensePOW) && (
                  <div className="rounded-xl overflow-hidden bg-surface-2 border border-surface-4">
                    <div className="flex items-center gap-2.5 px-5 py-3 border-b border-surface-4">
                      {confLogo && (
                        <span className="w-7 h-7 rounded-full bg-white p-1 flex items-center justify-center flex-shrink-0">
                          <img src={confLogo} alt="" className="w-full h-full object-contain" />
                        </span>
                      )}
                      <h3 className="font-display font-bold text-txt-primary leading-none" style={{ fontSize: '1.05rem', letterSpacing: '-0.01em' }}>
                        {confName ? `${confName} Player of the Week` : 'Conference Player of the Week'}
                      </h3>
                    </div>
                    <div className="px-5 py-4 space-y-4">
                      {game.conferencePOW && <HonoreeRow name={game.conferencePOW} side="Offensive" accent={teamColorForName(game.conferencePOW)} />}
                      {game.confDefensePOW && <HonoreeRow name={game.confDefensePOW} side="Defensive" accent={teamColorForName(game.confDefensePOW)} />}
                    </div>
                  </div>
                )}

                {/* National Player(s) of the Week — gold treatment for prestige */}
                {(game.nationalPOW || game.natlDefensePOW) && (
                  <div className="rounded-xl overflow-hidden border" style={{ background: 'linear-gradient(180deg, rgba(251,191,36,0.10) 0%, rgba(251,191,36,0.02) 100%)', borderColor: 'rgba(251,191,36,0.35)' }}>
                    <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(251,191,36,0.25)' }}>
                      <h3 className="font-display font-bold leading-none" style={{ fontSize: '1.05rem', letterSpacing: '-0.01em', color: '#fbbf24' }}>
                        National Player of the Week
                      </h3>
                    </div>
                    <div className="px-5 py-4 space-y-4">
                      {game.nationalPOW && <HonoreeRow name={game.nationalPOW} side="Offensive" accent="#fbbf24" />}
                      {game.natlDefensePOW && <HonoreeRow name={game.natlDefensePOW} side="Defensive" accent="#fbbf24" />}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* Cards tab — every card across every player tagged to this
              game (card.gameId === game.id). One player can show up
              multiple times if they have multiple cards from the same
              matchup. */}
          {activeTab === 'cards' && cardsForGame.length > 0 && (
            <div className="px-3 sm:px-5 py-5 sm:py-6">
              <h3 className="text-base font-bold text-txt-primary mb-1">
                Cards from this game
              </h3>
              <p className="text-xs text-txt-tertiary mb-5">
                {cardsForGame.length} card{cardsForGame.length === 1 ? '' : 's'} tagged to this matchup. Click any player name to open their full collection.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {cardsForGame.map(({ player: p, card }) => {
                  // Render path differs by card shape:
                  //   • Legacy template-based → CardComposer overlays the
                  //     player photo onto the PNG template at runtime.
                  //   • Prompt-driven        → just show the saved
                  //     frontImageUrl (the AI-generated card the user
                  //     uploaded back into the editor).
                  const isLegacy = card.styleId === undefined && card.templateId !== undefined
                  return (
                    <div key={`${p.pid}-${card.id}`} className="flex flex-col items-center">
                      <Link
                        to={`${pathPrefix}/player/${p.pid}?tab=card`}
                        className="text-sm font-semibold text-txt-primary hover:underline mb-1"
                      >
                        {p.name}
                        {p.position ? <span className="text-txt-tertiary"> {p.position}</span> : null}
                      </Link>
                      {(card.year || card.label) && (
                        <div className="text-[11px] text-txt-tertiary mb-2">
                          {card.year ? <span className="tabular">{card.year}</span> : null}
                          {card.label}
                        </div>
                      )}
                      <div style={{ width: 'min(280px, 100%)' }}>
                        {isLegacy ? (
                          <CardComposer
                            card={card}
                            player={p}
                            dynasty={currentDynasty}
                            width="100%"
                            className="rounded-xl shadow-2xl overflow-hidden"
                          />
                        ) : (
                          <FlippableCard
                            frontImageUrl={card.frontImageUrl}
                            backImageUrl={card.backImageUrl}
                            styleId={card.styleId}
                          />
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {activeTab === 'photos' && photoTabImages.length > 0 && (
            <div className="px-3 sm:px-5 py-5 sm:py-6">
              {!hasPhotosData && hasScoreGraphicData ? (
                // Graphic-only: the score graphic is the whole point, so show
                // it big rather than buried in the thumbnail grid.
                <button
                  type="button"
                  onClick={() => setPhotoLightboxIdx(0)}
                  className="group relative block w-full max-w-md aspect-square overflow-hidden rounded-xl transition-transform duration-150 hover:-translate-y-0.5"
                  style={{
                    backgroundColor: 'var(--surface-2)',
                    border: '1px solid var(--surface-4)',
                  }}
                >
                  <img
                    src={`https://wsrv.nl/?url=${encodeURIComponent(photoTabImages[0])}&output=webp&q=92`}
                    alt="Score graphic"
                    className="w-full h-full object-cover"
                    loading="lazy"
                    decoding="async"
                    onError={(e) => { const u = photoTabImages[0]; if (e.currentTarget.src !== u) e.currentTarget.src = u }}
                  />
                </button>
              ) : (
              <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-8 xl:grid-cols-10 gap-2">
                {photoTabImages.map((url, idx) => {
                  // Route grid thumbs through wsrv.nl (free image proxy) to
                  // get ~240px webp instead of the full-res ImgBB original.
                  // ~10-30x smaller per tile. The lightbox still loads `url`
                  // directly for full quality. If wsrv ever hiccups on a
                  // single image, onError swaps the tile back to the
                  // original URL so the tab keeps working.
                  const thumbSrc = `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=240&output=webp`
                  return (
                    <button
                      key={`${url}-${idx}`}
                      type="button"
                      onClick={() => setPhotoLightboxIdx(idx)}
                      className="group relative aspect-square overflow-hidden rounded-md transition-transform duration-150 hover:-translate-y-0.5"
                      style={{
                        backgroundColor: 'var(--surface-2)',
                        border: '1px solid var(--surface-4)',
                        contentVisibility: 'auto',
                        containIntrinsicSize: 'auto 160px',
                      }}
                    >
                      <img
                        src={thumbSrc}
                        alt={`Game photo ${idx + 1}`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                        fetchpriority="low"
                        onError={(e) => {
                          // wsrv failed for this image — fall back to original.
                          if (e.currentTarget.src !== url) e.currentTarget.src = url
                        }}
                      />
                    </button>
                  )
                })}
              </div>
              )}
            </div>
          )}

        </div>
      )}

      {/* Media Section */}
      {links.length > 0 && (
        <div className="rounded-xl overflow-hidden shadow-lg bg-surface-1">
          <div className="px-4 py-3 border-b border-surface-4">
            <h3 className="font-bold text-white text-sm uppercase tracking-wide">
              Media
            </h3>
          </div>
          <div className="p-4 space-y-4">
            {links.map((link, index) => {
              const youtubeEmbedUrl = isYouTubeLink(link) ? getYouTubeEmbedUrl(link) : null

              if (youtubeEmbedUrl) {
                return (
                  <div key={index} className="rounded-xl overflow-hidden shadow-lg aspect-video ring-1 ring-surface-4">
                    <iframe
                      width="100%"
                      height="100%"
                      src={youtubeEmbedUrl}
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="w-full h-full"
                    ></iframe>
                  </div>
                )
              } else if (isImgurAlbumLink(link)) {
                // Imgur album/gallery - embed using iframe
                const albumId = getImgurAlbumId(link)
                return (
                  <div key={index} className="rounded-xl overflow-hidden shadow-lg ring-1 ring-surface-4 bg-surface-2">
                    {/* Header with link to open in new tab */}
                    <div className="flex items-center justify-between px-4 py-2 border-b border-surface-4">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded bg-[#1BB76E] flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h2v-6h-2v6zm0-8h2V7h-2v2z"/>
                          </svg>
                        </div>
                        <span className="text-sm font-medium text-white">Imgur Album</span>
                      </div>
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-txt-tertiary hover:text-green-400 transition-colors flex items-center gap-1"
                      >
                        Open in Imgur
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </div>
                    {/* Imgur embed iframe */}
                    <div className="relative w-full" style={{ minHeight: '500px' }}>
                      <iframe
                        src={`https://imgur.com/a/${albumId}/embed?pub=true&ref=https://dynastytracker.app&analytics=false`}
                        width="100%"
                        height="500"
                        frameBorder="0"
                        scrolling="no"
                        allowFullScreen
                        className="w-full"
                        style={{ overflow: 'hidden' }}
                      />
                    </div>
                  </div>
                )
              } else if (isImgurPostLink(link)) {
                // Imgur single post - convert to direct image and embed
                const directUrl = getImgurDirectUrl(link)
                return (
                  <div key={index} className="rounded-xl overflow-hidden shadow-lg ring-1 ring-surface-4">
                    <a href={link} target="_blank" rel="noopener noreferrer">
                      <img
                        src={directUrl}
                        alt={`Imgur image ${index + 1}`}
                        className="w-full h-auto"
                        onError={(e) => {
                          // If .jpg fails, try .png
                          if (e.target.src.endsWith('.jpg')) {
                            e.target.src = e.target.src.replace('.jpg', '.png')
                          }
                        }}
                      />
                    </a>
                  </div>
                )
              } else if (isImageLink(link)) {
                return (
                  <div key={index} className="rounded-xl overflow-hidden shadow-lg ring-1 ring-surface-4">
                    <img src={proxyImageUrl(link, 1600, { animated: true })} alt={`Game media ${index + 1}`} className="w-full h-auto" />
                  </div>
                )
              } else {
                return (
                  <a
                    key={index}
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 bg-surface-2 rounded-xl hover:bg-surface-3 transition-colors group ring-1 ring-surface-4"
                  >
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: 'var(--text-primary)' }}
                    >
                      <svg className="w-5 h-5" fill="none" stroke={'var(--surface-1)'} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </div>
                    <span className="text-sm text-txt-secondary group-hover:text-white break-all flex-1 transition-colors">{link}</span>
                    <svg className="w-5 h-5 text-txt-muted group-hover:text-white transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </a>
                )
              }
            })}
          </div>
        </div>
      )}

      {/* Scoring Highlights Modal */}
      <ScoringHighlightsModal
        isOpen={showHighlightsModal}
        onClose={() => setShowHighlightsModal(false)}
        scoringPlays={sortPlaysChronologically(collapsePatRowsIntoTDs(game.boxScore?.scoringSummary)).map(p => ({
          ...p,
          gameInfo: { ...(p.gameInfo || {}), gameId }
        }))}
        team1Abbr={leftData?.abbr}
        team2Abbr={rightData?.abbr}
        team1Tid={leftData?.tid}
        team2Tid={rightData?.tid}
        team1Logo={leftData?.logo}
        team2Logo={rightData?.logo}
        players={currentDynasty?.players || []}
        getTeamLogo={getTeamLogo}
        getMascotName={getMascotName}
        teamsData={currentDynasty?.teams || currentDynasty?.customTeams}
        startIndex={highlightsStartIndex}
        pathPrefix={pathPrefix}
      />

      {/* Full-screen photo lightbox — opens when a Photos-tab thumb
          is clicked. Esc / clicking the backdrop / × button closes;
          ←/→ arrow keys + on-screen chevrons step through. */}
      {photoLightboxIdx !== null && photoTabImages.length > 0 && (
        <PhotoLightbox
          photos={photoTabImages}
          index={photoLightboxIdx}
          onClose={() => setPhotoLightboxIdx(null)}
          onIndexChange={setPhotoLightboxIdx}
          photoTags={game.photoTags || null}
          resolvePlayerName={(pid) => playerNameByPid.get(String(pid))}
          pathPrefix={pathPrefix}
          gameId={game.id}
          isViewOnly={isViewOnly}
          taggablePlayers={photoTaggablePlayers}
          onSaveTags={savePhotoTags}
        />
      )}

      {/* Full-screen score-graphic lightbox — single image. Re-uses
          PhotoLightbox with a one-element array; the prev/next
          handlers are no-ops at length 1. */}
      {scoreGraphicLightboxOpen && game.scoreGraphic && (
        <PhotoLightbox
          photos={[game.scoreGraphic]}
          index={0}
          onClose={() => setScoreGraphicLightboxOpen(false)}
          onIndexChange={() => {}}
        />
      )}
    </div>
  )
}

/**
 * Full-screen photo lightbox. Lives in the Game page Photos tab.
 *
 * Behavior:
 *   • Click anywhere outside the image (backdrop) → close
 *   • Esc → close
 *   • ← / → arrows OR on-screen chevrons → previous / next
 *   • Body scroll is locked while open
 */
function PhotoLightbox({ photos, index, onClose, onIndexChange, photoTags = null, resolvePlayerName = null, pathPrefix = '', gameId = null, isViewOnly = false, taggablePlayers = [], onSaveTags = null }) {
  const total = photos.length
  const currentUrl = photos[index]
  const tagPids = (photoTags && currentUrl && Array.isArray(photoTags[currentUrl])) ? photoTags[currentUrl] : []
  const canEditTags = !isViewOnly && gameId != null && typeof onSaveTags === 'function'

  // In-lightbox tag editor: opens a search panel right here so the user
  // can tag players without leaving for the editor.
  const [showTagPanel, setShowTagPanel] = useState(false)
  const [tagQuery, setTagQuery] = useState('')

  // Toggle one player's tag on the current photo and persist immediately.
  const toggleTag = (pid) => {
    if (!onSaveTags || !currentUrl) return
    const has = tagPids.some(p => String(p) === String(pid))
    const next = has ? tagPids.filter(p => String(p) !== String(pid)) : [...tagPids, pid]
    onSaveTags(currentUrl, next)
  }

  const goPrev = useCallback(() => {
    if (total <= 1) return
    onIndexChange((index - 1 + total) % total)
  }, [index, total, onIndexChange])

  const goNext = useCallback(() => {
    if (total <= 1) return
    onIndexChange((index + 1) % total)
  }, [index, total, onIndexChange])

  // Close the tag panel whenever we move to a different photo.
  useEffect(() => { setShowTagPanel(false); setTagQuery('') }, [index])

  // Key handlers (body scroll lock is handled globally by Layout). While
  // the tag panel is open, Esc closes the panel (not the lightbox) and
  // arrow keys are left to the search input instead of stepping photos.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (showTagPanel) setShowTagPanel(false)
        else onClose?.()
        return
      }
      if (showTagPanel) return
      if (e.key === 'ArrowLeft') goPrev()
      else if (e.key === 'ArrowRight') goNext()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose, goPrev, goNext, showTagPanel])

  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 z-[9999] flex items-center justify-center"
      style={{ margin: 0, backgroundColor: 'rgba(0, 0, 0, 0.92)' }}
      onClick={onClose}
    >
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-3 right-3 sm:top-4 sm:right-4 flex items-center justify-center rounded-md transition-colors"
        style={{
          width: 40, height: 40,
          backgroundColor: 'rgba(255, 255, 255, 0.08)',
          color: '#fff',
          border: '1px solid rgba(255, 255, 255, 0.18)',
        }}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Counter */}
      {total > 1 && (
        <div
          className="absolute top-3 left-3 sm:top-4 sm:left-4 px-3 py-1.5 rounded-md text-xs font-bold tabular-nums"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
            color: '#fff',
            border: '1px solid rgba(255, 255, 255, 0.18)',
            letterSpacing: '0.05em',
          }}
        >
          {index + 1} / {total}
        </div>
      )}

      {/* Previous chevron */}
      {total > 1 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); goPrev() }}
          aria-label="Previous photo"
          className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full transition-colors"
          style={{
            width: 48, height: 48,
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
            color: '#fff',
            border: '1px solid rgba(255, 255, 255, 0.18)',
          }}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* Next chevron */}
      {total > 1 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); goNext() }}
          aria-label="Next photo"
          className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full transition-colors"
          style={{
            width: 48, height: 48,
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
            color: '#fff',
            border: '1px solid rgba(255, 255, 255, 0.18)',
          }}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* Image + Instagram-style tag bar below it. Clicking inside this
          column does NOT close (only the backdrop does). */}
      <div
        className="flex flex-col items-center gap-3"
        style={{ maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 32px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={`https://wsrv.nl/?url=${encodeURIComponent(currentUrl)}&output=webp&q=92`}
          alt={`Game photo ${index + 1} of ${total}`}
          className="block select-none"
          style={{
            maxWidth: '100%',
            maxHeight: (tagPids.length > 0 || canEditTags) ? 'calc(100vh - 120px)' : 'calc(100vh - 32px)',
            objectFit: 'contain',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.6)',
          }}
          onError={(e) => { if (e.currentTarget.src !== currentUrl) e.currentTarget.src = currentUrl }}
          draggable={false}
        />
        {(tagPids.length > 0 || canEditTags) && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {tagPids.map(pid => (
              <Link
                key={pid}
                to={`${pathPrefix}/player/${pid}`}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors hover:opacity-90"
                style={{ backgroundColor: 'rgba(255, 255, 255, 0.12)', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.25)' }}
              >
                {(resolvePlayerName ? resolvePlayerName(pid) : null) || `Player ${pid}`}
              </Link>
            ))}
            {canEditTags && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowTagPanel(true); setTagQuery('') }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors hover:opacity-90"
                style={{ backgroundColor: 'rgba(255, 255, 255, 0.06)', color: 'rgba(255,255,255,0.85)', border: '1px dashed rgba(255, 255, 255, 0.3)' }}
              >
                {tagPids.length > 0 ? 'Edit tags' : 'Tag players'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* In-lightbox tag panel — search + toggle players, saved immediately */}
      {showTagPanel && canEditTags && (
        <div
          className="absolute inset-0 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { e.stopPropagation(); setShowTagPanel(false) }}
        >
          <div
            className="w-full max-w-md rounded-lg overflow-hidden flex flex-col"
            style={{ backgroundColor: 'var(--surface-1)', border: '1px solid var(--surface-4)', maxHeight: '80vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--surface-4)' }}>
              <span className="text-sm font-bold text-txt-primary">Tag players in this photo</span>
              <button
                type="button"
                onClick={() => setShowTagPanel(false)}
                className="text-txt-tertiary hover:text-txt-primary text-sm font-semibold"
              >
                Done
              </button>
            </div>
            <div className="px-4 py-3">
              {tagPids.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {tagPids.map(pid => (
                    <span
                      key={pid}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
                      style={{ backgroundColor: 'var(--surface-3)', border: '1px solid var(--surface-5)', color: 'var(--text-primary)' }}
                    >
                      {(resolvePlayerName ? resolvePlayerName(pid) : null) || `Player ${pid}`}
                      <button type="button" onClick={() => toggleTag(pid)} className="hover:opacity-70" style={{ color: '#f87171' }} aria-label="Remove tag">×</button>
                    </span>
                  ))}
                </div>
              )}
              <input
                type="text"
                value={tagQuery}
                onChange={(e) => setTagQuery(e.target.value)}
                placeholder="Search players by name or number…"
                autoFocus
                className="w-full px-3 py-2 rounded-md text-sm bg-transparent text-txt-primary focus:outline-none focus:ring-1 focus:ring-white/40"
                style={{ border: '1px solid var(--surface-4)' }}
              />
            </div>
            <div className="overflow-y-auto" style={{ borderTop: '1px solid var(--surface-4)' }}>
              {taggablePlayers.length === 0 ? (
                <p className="text-xs text-txt-tertiary italic p-3 m-0">No dynasty players on either team to tag.</p>
              ) : (
                matchAndRankPlayers(taggablePlayers, tagQuery)
                  .map(pl => {
                    const tagged = tagPids.some(p => String(p) === String(pl.pid))
                    return (
                      <button
                        key={pl.pid}
                        type="button"
                        onClick={() => toggleTag(pl.pid)}
                        className="w-full flex items-center justify-between gap-2 px-4 py-2 text-left transition-colors hover:bg-surface-3"
                        style={{ borderBottom: '1px solid var(--surface-4)', backgroundColor: tagged ? 'var(--surface-3)' : 'transparent' }}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          {(pl.jerseyNumber != null && pl.jerseyNumber !== '') && (
                            <span className="text-xs text-txt-tertiary tabular-nums flex-shrink-0">#{pl.jerseyNumber}</span>
                          )}
                          <span className="text-sm text-txt-primary truncate">{pl.name}</span>
                        </span>
                        <span className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[10px] text-txt-tertiary uppercase tracking-wide">{pl.teamAbbr}</span>
                          {tagged && <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>✓</span>}
                        </span>
                      </button>
                    )
                  })
              )}
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  )
}
