import React, { useEffect, useState, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useDynasty, getEncourageTransfers, getRecruitingCommitments } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useTeamColors } from '../../hooks/useTeamColors'
import { getContrastTextColor } from '../../utils/colorUtils'
import { getTeamLogo, getMascotName as getMascotNameFromTeams, getSchoolName as getSchoolNameFromTeams } from '../../data/teams'
import { teamAbbreviations } from '../../data/teamAbbreviations'
import { TEAMS, resolveTid, getCurrentTeamAbbr, getAbbrFromTeamName, getOriginalTeamAbbr, getTidFromAbbr } from '../../data/teamRegistry'
import { getTeamColors } from '../../data/teamColors'
import PlayerEditModal from '../../components/PlayerEditModal'
import OverallProgressionModal from '../../components/OverallProgressionModal'
import { getPlayerGameLog } from '../../utils/boxScoreAggregator'

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

// Get just the school name (without mascot) for cleaner display in timeline
const getSchoolName = (abbrOrTid, teamsData = null) => {
  // Try tid-based lookup first if teams data provided
  if (teamsData) {
    const result = getSchoolNameFromTeams(abbrOrTid, teamsData)
    if (result) return result
  }
  // Fall back to extracting from mascot name
  const fullName = getMascotName(abbrOrTid, teamsData)
  if (!fullName) return null

  // Split and remove mascot (last word or known two-word mascots)
  const parts = fullName.split(' ')
  if (parts.length <= 1) return fullName

  const twoWordMascots = [
    'Sun Devils', 'Golden Bears', 'Golden Gophers', 'Golden Eagles', 'Golden Flashes',
    'Black Knights', 'Yellow Jackets', 'Blue Devils', 'Blue Raiders', 'Blue Hens',
    'Red Raiders', 'Red Wolves', 'Mean Green', 'Green Wave', 'Horned Frogs',
    'Nittany Lions', 'Scarlet Knights', 'Fighting Irish', 'Demon Deacons',
    'Crimson Tide', 'Golden Hurricane', 'Thundering Herd', 'Tar Heels',
    'Ragin\' Cajuns', 'Wolf Pack', 'Fighting Illini'
  ]

  if (parts.length >= 3) {
    const lastTwo = `${parts[parts.length - 2]} ${parts[parts.length - 1]}`
    if (twoWordMascots.some(m => m.toLowerCase() === lastTwo.toLowerCase())) {
      return parts.slice(0, -2).join(' ')
    }
  }

  return parts.slice(0, -1).join(' ')
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
  const { dynasties, currentDynasty, updatePlayer, deletePlayer, syncAllPlayersStats, isViewOnly } = useDynasty()
  const pathPrefix = usePathPrefix()
  const navigate = useNavigate()
  const [showEditModal, setShowEditModal] = useState(false)
  const [showAccoladeModal, setShowAccoladeModal] = useState(false)
  const [accoladeType, setAccoladeType] = useState(null)
  const [showOverallProgressionModal, setShowOverallProgressionModal] = useState(false)
  const [showGameLogModal, setShowGameLogModal] = useState(false)
  const [expandedGameLogYear, setExpandedGameLogYear] = useState(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

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
        style={{ color: secondaryText, opacity: isActive ? 1 : 0.8 }}
        onClick={() => handleStatSort(category, column)}
        title={`Sort by ${label}`}
      >
        <span className="inline-flex items-center gap-0.5 justify-end">
          {label}
          {isActive && (
            <span style={{ color: secondaryText }}>
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

  // Get departure/transfer info from movements[] array
  // Find the most recent departure or transfer movement
  const departureMovement = (player?.movements || [])
    .filter(m => m.type === 'departure' || m.type === 'transfer')
    .sort((a, b) => (b.year || 0) - (a.year || 0))[0]

  // Determine if player has transferred out (to another team)
  const hasTransferredOut = departureMovement?.type === 'transfer' && departureMovement?.to

  // Determine the player's team - use teamsByYear[currentYear] as source of truth (reflects transfers)
  // Fall back to player.team if no teamsByYear entry for current year
  const currentYear = dynasty?.currentYear
  const playerTeamAbbr = (currentYear && player?.teamsByYear?.[currentYear])
    || (currentYear && player?.teamsByYear?.[String(currentYear)])
    || player?.team
    || player?.teams?.[0]
    || getCurrentTeamAbbr(dynasty)
    || ''

  // For outgoing transfers, get the team they transferred FROM
  const transferredFromTeam = hasTransferredOut
    ? departureMovement?.from
    : null

  // Get the full team name from the abbreviation (pass teams for tid-based lookup)
  const playerTeamName = getMascotName(playerTeamAbbr, dynasty?.teams || dynasty?.customTeams)
    || dynasty?.teamName
    || ''

  // IMPORTANT: All hooks must be called before any early returns
  const teamColors = useTeamColors(playerTeamName, dynasty?.teams || dynasty?.customTeams)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pid])

  // Early returns AFTER all hooks
  if (!dynasty) {
    return <div className="text-center py-12"><p style={{ color: 'var(--text-secondary)' }}>Dynasty not found</p></div>
  }

  if (!player) {
    return <div className="text-center py-12"><p style={{ color: 'var(--text-secondary)' }}>Player not found</p></div>
  }
  const primaryText = getContrastTextColor(teamColors.primary)
  const secondaryText = getContrastTextColor(teamColors.secondary)
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
    let confOffPOW = 0, confDefPOW = 0, nationalOffPOW = 0, nationalDefPOW = 0
    const confOffPOWGames = [], confDefPOWGames = [], nationalOffPOWGames = [], nationalDefPOWGames = []

    games.forEach(game => {
      if (game.conferencePOW === player.name) { confOffPOW++; confOffPOWGames.push(game) }
      if (game.confDefensePOW === player.name) { confDefPOW++; confDefPOWGames.push(game) }
      if (game.nationalPOW === player.name) { nationalOffPOW++; nationalOffPOWGames.push(game) }
      if (game.natlDefensePOW === player.name) { nationalDefPOW++; nationalDefPOWGames.push(game) }
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

  // Get all games where this player has box score stats
  // Simple: if the player is in a box score, include the game
  const getAllPlayerGameLogs = () => {
    const games = dynasty.games || []
    const playerName = player.name
    const gameLog = []

    // Helper to normalize names for comparison (handles case, extra whitespace)
    const normalizeName = (name) => name ? name.toLowerCase().trim().replace(/\s+/g, ' ') : ''
    const normalizedPlayerName = normalizeName(playerName)

    games.forEach(game => {
      // Skip games without box scores
      if (!game.boxScore) return

      // Check both home and away box scores for this player
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
        // Derive scores based on game format and which side the player was on
        let playerTeamScore, opponentTeamScore, opponentAbbr
        const teams = dynasty?.teams || {}

        if (game.team1Tid && game.team2Tid) {
          // Unified format with tid
          // Must use homeTeamTid to determine which team is in boxScore.home vs boxScore.away
          const team1Info = teams[game.team1Tid] || {}
          const team2Info = teams[game.team2Tid] || {}

          // Determine which team corresponds to boxScore.home
          // If homeTeamTid === team1Tid, then home=team1, away=team2
          // If homeTeamTid === team2Tid, then home=team2, away=team1
          // If neutral (homeTeamTid is null), assume team1 is in home boxScore
          const isTeam1Home = game.homeTeamTid === game.team1Tid || game.homeTeamTid == null

          let playerTeamTid, opponentTeamTid
          if (foundInTeam === 'home') {
            playerTeamTid = isTeam1Home ? game.team1Tid : game.team2Tid
            opponentTeamTid = isTeam1Home ? game.team2Tid : game.team1Tid
            playerTeamScore = isTeam1Home ? game.team1Score : game.team2Score
            opponentTeamScore = isTeam1Home ? game.team2Score : game.team1Score
          } else {
            playerTeamTid = isTeam1Home ? game.team2Tid : game.team1Tid
            opponentTeamTid = isTeam1Home ? game.team1Tid : game.team2Tid
            playerTeamScore = isTeam1Home ? game.team2Score : game.team1Score
            opponentTeamScore = isTeam1Home ? game.team1Score : game.team2Score
          }

          const opponentInfo = teams[opponentTeamTid] || {}
          opponentAbbr = opponentInfo.abbr || (opponentTeamTid === game.team1Tid ? game.team1 : game.team2)
        } else if (game.opponent) {
          // Legacy user game format
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
        } else if (game.team1 && game.team2) {
          // CPU game format
          if (foundInTeam === 'home') {
            playerTeamScore = game.team1Score
            opponentTeamScore = game.team2Score
            opponentAbbr = game.team2
          } else {
            playerTeamScore = game.team2Score
            opponentTeamScore = game.team1Score
            opponentAbbr = game.team1
          }
        }

        const result = playerTeamScore != null && opponentTeamScore != null
          ? (Number(playerTeamScore) > Number(opponentTeamScore) ? 'W' : 'L')
          : null

        // Determine location from player's perspective
        // foundInTeam tells us if player was in home or away boxScore
        // Neutral site (homeTeamTid is null) should show "vs"
        const isNeutralSite = game.homeTeamTid === null || game.location === 'neutral'
        const playerLocation = isNeutralSite ? 'neutral' : (foundInTeam === 'home' ? 'home' : 'away')

        gameLog.push({
          game: {
            ...game,
            // Add derived fields for display
            teamScore: playerTeamScore,
            opponentScore: opponentTeamScore,
            opponent: opponentAbbr || game.opponent,
            result: result || game.result,
            location: playerLocation
          },
          stats: playerStats,
          team: foundInTeam
        })
      }
    })

    // Sort by year desc, then game order desc (postseason at top, then regular season weeks desc)
    const getGameOrder = (g) => {
      // Conference Championship
      if (g.isConferenceChampionship || g.gameType === 'conference_championship') return 100
      // CFP/Bowl games - come after regular season
      if (g.isCFPFirstRound || g.gameType === 'cfp_first_round') return 101
      if (g.isCFPQuarterfinal || g.gameType === 'cfp_quarterfinal') return 102
      if (g.isCFPSemifinal || g.gameType === 'cfp_semifinal') return 103
      if (g.isCFPChampionship || g.gameType === 'cfp_championship') return 104
      if (g.isBowlGame || g.gameType === 'bowl') return 100 + (parseInt(g.week) || 1)
      // Regular season - use week number
      return parseInt(g.week) || 0
    }
    gameLog.sort((a, b) => {
      if (b.game.year !== a.game.year) return b.game.year - a.game.year
      // Within same year, higher game order first (postseason before regular season)
      return getGameOrder(b.game) - getGameOrder(a.game)
    })

    return gameLog
  }

  const playerGameLog = useMemo(() => getAllPlayerGameLogs(), [dynasty.games, player.name])

  const handlePlayerSave = async (updatedPlayer, yearStats) => {
    // Use dynastyId from URL params, or fall back to currentDynasty.id
    const targetDynastyId = dynastyId || dynasty?.id
    await updatePlayer(targetDynastyId, updatedPlayer, yearStats)
    setShowEditModal(false)
  }

  // Get year-by-year stats for this player
  // ONLY reads from player.statsByYear (single source of truth)
  const yearByYearStats = useMemo(() => {
    const playerOwnStats = player.statsByYear || {}

    // Get all years that have stats
    const allYears = new Set(Object.keys(playerOwnStats))

    const years = []

    // Sort years by most recent first
    const sortedYears = Array.from(allYears).sort((a, b) => parseInt(b) - parseInt(a))

    sortedYears.forEach(yearStr => {
      const year = parseInt(yearStr)

      // Get stats from player.statsByYear (the only source of truth)
      const ownYearStats = playerOwnStats[yearStr] || playerOwnStats[year]
      if (!ownYearStats) return

      // Get category stats from player.statsByYear (internal format)
      const passing = ownYearStats?.passing
      const rushing = ownYearStats?.rushing
      const receiving = ownYearStats?.receiving
      const blocking = ownYearStats?.blocking
      const defensive = ownYearStats?.defense
      const kicking = ownYearStats?.kicking
      const punting = ownYearStats?.punting
      const kickReturn = ownYearStats?.kickReturn
      const puntReturn = ownYearStats?.puntReturn

      // Determine player's class for this year from classByYear or calculate
      let playerClass = player.classByYear?.[year] || player.classByYear?.[String(year)] || '-'
      if (playerClass === '-' && player.year) {
        // If this is the current dynasty year, use current class
        if (year === dynasty.currentYear) {
          playerClass = player.year
        } else {
          // For past years, calculate backwards from current class
          const classIndex = CLASS_ORDER.indexOf(player.year)
          const yearDiff = dynasty.currentYear - year
          if (classIndex >= 0 && classIndex - yearDiff >= 0) {
            playerClass = CLASS_ORDER[classIndex - yearDiff]
          }
        }
      }

      // Determine the team for this specific year
      // Priority: teamsByYear[year] > player.team > dynasty team
      const yearTeam = player.teamsByYear?.[year]
        || player.teamsByYear?.[String(year)]
        || player.team
        || getCurrentTeamAbbr(dynasty)
        || ''

      // Build year stats object from player.statsByYear (single source of truth)
      const yearData = {
        year,
        team: yearTeam,
        class: playerClass,
        gamesPlayed: ownYearStats?.gamesPlayed || 0,
        snapsPlayed: ownYearStats?.snapsPlayed || 0,
        // Passing
        passing: passing ? {
          cmp: passing.cmp || 0,
          att: passing.att || 0,
          yds: passing.yds || 0,
          td: passing.td || 0,
          int: passing.int || 0,
          lng: passing.lng || 0,
          sacks: passing.sacks || 0
        } : null,
        // Rushing
        rushing: rushing ? {
          car: rushing.car || 0,
          yds: rushing.yds || 0,
          td: rushing.td || 0,
          lng: rushing.lng || 0,
          fum: rushing.fum || 0,
          bt: rushing.bt || 0
        } : null,
        // Receiving
        receiving: receiving ? {
          rec: receiving.rec || 0,
          yds: receiving.yds || 0,
          td: receiving.td || 0,
          lng: receiving.lng || 0,
          drops: receiving.drops || 0
        } : null,
        // Blocking
        blocking: blocking ? {
          sacksAllowed: blocking.sacksAllowed || 0,
          pancakes: blocking.pancakes || 0
        } : null,
        // Defensive (map internal to display format)
        defensive: defensive ? {
          solo: defensive.soloTkl || 0,
          ast: defensive.astTkl || 0,
          tfl: defensive.tfl || 0,
          sacks: defensive.sacks || 0,
          int: defensive.int || 0,
          intYds: defensive.intYds || 0,
          intTd: defensive.td || 0,
          pdef: defensive.pd || 0,
          ff: defensive.ff || 0,
          fr: defensive.fr || 0
        } : null,
        // Kicking
        kicking: kicking ? {
          fgm: kicking.fgm || 0,
          fga: kicking.fga || 0,
          lng: kicking.lng || 0,
          xpm: kicking.xpm || 0,
          xpa: kicking.xpa || 0
        } : null,
        // Punting
        punting: punting ? {
          punts: punting.punts || 0,
          yds: punting.yds || 0,
          lng: punting.lng || 0,
          in20: punting.in20 || 0,
          tb: punting.tb || 0
        } : null,
        // Kick Return
        kickReturn: kickReturn ? {
          ret: kickReturn.ret || 0,
          yds: kickReturn.yds || 0,
          td: kickReturn.td || 0,
          lng: kickReturn.lng || 0
        } : null,
        // Punt Return
        puntReturn: puntReturn ? {
          ret: puntReturn.ret || 0,
          yds: puntReturn.yds || 0,
          td: puntReturn.td || 0,
          lng: puntReturn.lng || 0
        } : null
      }

      years.push(yearData)
    })

    return years
  }, [dynasty, player])

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
  const gameLog = useMemo(() => {
    if (!expandedGameLogYear || !player?.name) return []
    return getPlayerGameLog(dynasty, player.name, expandedGameLogYear, teamAbbr)
  }, [expandedGameLogYear, dynasty, player?.name, teamAbbr])

  // Helper to toggle game log
  const toggleGameLog = (year) => {
    setExpandedGameLogYear(expandedGameLogYear === year ? null : year)
  }

  // Game log row component - renders a table matching the stat type columns
  const renderGameLogRow = (year, colSpan, statType) => {
    if (expandedGameLogYear !== year) return null

    // Define columns for each stat type
    const getStatColumns = () => {
      switch (statType) {
        case 'passing':
          return [
            { key: 'completions', label: 'Cmp', getter: g => g.passing?.completions || 0 },
            { key: 'attempts', label: 'Att', getter: g => g.passing?.attempts || 0 },
            { key: 'yards', label: 'Yds', getter: g => g.passing?.yards || 0, bold: true },
            { key: 'avg', label: 'AVG', getter: g => g.passing?.attempts ? (g.passing.yards / g.passing.attempts).toFixed(1) : '0.0' },
            { key: 'td', label: 'TD', getter: g => g.passing?.touchdowns || 0, bold: true },
            { key: 'int', label: 'INT', getter: g => g.passing?.interceptions || 0 },
            { key: 'lng', label: 'Lng', getter: g => g.passing?.longest || 0 },
            { key: 'sacks', label: 'Sck', getter: g => g.passing?.sacks || 0 },
          ]
        case 'rushing':
          return [
            { key: 'car', label: 'Car', getter: g => g.rushing?.carries || 0 },
            { key: 'yds', label: 'Yds', getter: g => g.rushing?.yards || 0, bold: true },
            { key: 'avg', label: 'AVG', getter: g => g.rushing?.carries ? (g.rushing.yards / g.rushing.carries).toFixed(1) : '0.0' },
            { key: 'td', label: 'TD', getter: g => g.rushing?.touchdowns || 0, bold: true },
            { key: 'lng', label: 'Lng', getter: g => g.rushing?.longest || 0 },
            { key: 'fum', label: 'Fum', getter: g => g.rushing?.fumbles || 0 },
            { key: 'bt', label: 'BTkl', getter: g => g.rushing?.brokenTackles || 0 },
          ]
        case 'receiving':
          return [
            { key: 'rec', label: 'Rec', getter: g => g.receiving?.receptions || 0 },
            { key: 'yds', label: 'Yds', getter: g => g.receiving?.yards || 0, bold: true },
            { key: 'avg', label: 'AVG', getter: g => g.receiving?.receptions ? (g.receiving.yards / g.receiving.receptions).toFixed(1) : '0.0' },
            { key: 'td', label: 'TD', getter: g => g.receiving?.touchdowns || 0, bold: true },
            { key: 'lng', label: 'Lng', getter: g => g.receiving?.longest || 0 },
            { key: 'drops', label: 'Drp', getter: g => g.receiving?.drops || 0 },
          ]
        case 'defense':
          return [
            { key: 'solo', label: 'Solo', getter: g => g.defense?.solo || 0 },
            { key: 'ast', label: 'Ast', getter: g => g.defense?.assists || 0 },
            { key: 'tot', label: 'Tot', getter: g => (g.defense?.solo || 0) + (g.defense?.assists || 0), bold: true },
            { key: 'tfl', label: 'TFL', getter: g => g.defense?.tacklesForLoss || 0 },
            { key: 'sacks', label: 'Sck', getter: g => g.defense?.sacks || 0 },
            { key: 'int', label: 'INT', getter: g => g.defense?.interceptions || 0 },
            { key: 'pdef', label: 'PD', getter: g => g.defense?.passDeflections || 0 },
            { key: 'ff', label: 'FF', getter: g => g.defense?.forcedFumbles || 0 },
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
            { key: 'lng', label: 'Lng', getter: g => g.punting?.longest || 0 },
            { key: 'in20', label: 'In20', getter: g => g.punting?.inside20 || 0 },
            { key: 'tb', label: 'TB', getter: g => g.punting?.touchbacks || 0 },
          ]
        case 'kickReturn':
          return [
            { key: 'ret', label: 'Ret', getter: g => g.kickReturn?.returns || 0 },
            { key: 'yds', label: 'Yds', getter: g => g.kickReturn?.yards || 0, bold: true },
            { key: 'avg', label: 'AVG', getter: g => g.kickReturn?.returns ? (g.kickReturn.yards / g.kickReturn.returns).toFixed(1) : '0.0' },
            { key: 'td', label: 'TD', getter: g => g.kickReturn?.touchdowns || 0 },
            { key: 'lng', label: 'Lng', getter: g => g.kickReturn?.longest || 0 },
          ]
        case 'puntReturn':
          return [
            { key: 'ret', label: 'Ret', getter: g => g.puntReturn?.returns || 0 },
            { key: 'yds', label: 'Yds', getter: g => g.puntReturn?.yards || 0, bold: true },
            { key: 'avg', label: 'AVG', getter: g => g.puntReturn?.returns ? (g.puntReturn.yards / g.puntReturn.returns).toFixed(1) : '0.0' },
            { key: 'td', label: 'TD', getter: g => g.puntReturn?.touchdowns || 0 },
            { key: 'lng', label: 'Lng', getter: g => g.puntReturn?.longest || 0 },
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
          <div className="p-3" style={{ backgroundColor: `${teamColors.primary}15`, borderTop: `1px solid ${teamColors.primary}30`, borderBottom: `1px solid ${teamColors.primary}30` }}>
            <div className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: teamColors.primary }}>Game Log - {year}</div>
            {gameLog.length === 0 ? (
              <div className="text-xs italic" style={{ color: secondaryText, opacity: 0.6 }}>No game data available</div>
            ) : (
              <div className="overflow-x-auto rounded-lg" style={{ backgroundColor: teamColors.secondary, border: `1px solid ${teamColors.primary}40` }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ backgroundColor: teamColors.primary }}>
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
                      const oppLogo = oppMascot ? getTeamLogo(oppMascot) : null
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
                            <td key={col.key} className="px-2 py-2 text-right" style={{ color: secondaryText, fontWeight: col.bold ? 600 : 400, opacity: col.bold ? 1 : 0.8 }}>
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

  return (
    <div className="space-y-6">
      {/* Player Header - Mobile Layout */}
      <div
        className="sm:hidden rounded-xl shadow-lg overflow-hidden"
        style={{ backgroundColor: teamColors.primary, border: `2px solid ${teamColors.secondary}` }}
      >
        {/* Top row: Photo, Name, Overall */}
        <div className="p-4 flex items-center gap-3">
          {player.pictureUrl && (
            <img
              src={player.pictureUrl}
              alt={player.name}
              className="w-16 h-16 object-cover rounded-lg border-2 flex-shrink-0"
              style={{ borderColor: teamColors.secondary }}
              onError={(e) => { e.target.style.display = 'none' }}
            />
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold leading-tight" style={{ color: primaryText }}>
              {player.name}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm font-semibold" style={{ color: primaryText, opacity: 0.9 }}>
                {player.jerseyNumber != null && player.jerseyNumber !== '' && `#${player.jerseyNumber} • `}{player.position}
              </span>
              {player.devTrait && player.devTrait !== 'Normal' && (
                <span
                  className="px-1.5 py-0.5 rounded text-xs font-bold"
                  style={{
                    backgroundColor: player.devTrait === 'Elite' ? '#fbbf24' :
                                   player.devTrait === 'Star' ? '#8b5cf6' :
                                   player.devTrait === 'Impact' ? '#3b82f6' : '#9ca3af',
                    color: player.devTrait === 'Elite' ? '#78350f' : '#ffffff'
                  }}
                >
                  {player.devTrait}
                </span>
              )}
            </div>
          </div>
          {/* Overall Rating */}
          <div className="text-center flex-shrink-0">
            {player.overall ? (
              <button
                onClick={() => setShowOverallProgressionModal(true)}
                className="hover:opacity-80 transition-opacity"
                title="View overall progression"
              >
                <div className="text-3xl font-black" style={{ color: primaryText }}>{player.overall}</div>
                <div className="text-[10px] font-semibold" style={{ color: primaryText, opacity: 0.6 }}>OVR</div>
              </button>
            ) : (
              <div>
                <div className="text-3xl font-black" style={{ color: primaryText, opacity: 0.3 }}>—</div>
                <div className="text-[10px] font-semibold" style={{ color: primaryText, opacity: 0.6 }}>OVR</div>
              </div>
            )}
          </div>
        </div>

        {/* Info rows */}
        <div className="px-4 pb-3 space-y-2" style={{ color: primaryText }}>
          {/* Team and Class */}
          <div className="flex items-center justify-between">
            <Link
              to={`${pathPrefix}/team/${resolveTid(teamAbbr, currentDynasty?.teams || TEAMS)}`}
              className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
              style={{ color: primaryText, opacity: 0.9 }}
            >
              {getTeamLogo(playerTeamName) && (
                <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.95)', boxShadow: '0 0 0 1px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.2)', padding: '2px' }}>
                  <img src={getTeamLogo(playerTeamName)} alt="" className="w-full h-full object-contain" />
                </div>
              )}
              <span className="truncate max-w-[140px]">{playerTeamName}</span>
            </Link>
            <span className="text-sm font-medium" style={{ opacity: 0.85 }}>{player.classByYear?.[dynasty?.currentYear] || player.year}</span>
          </div>

          {/* Archetype and Physical */}
          {(player.archetype || player.height || player.weight) && (
            <div className="flex items-center justify-between text-xs" style={{ opacity: 0.8 }}>
              {player.archetype && <span>{player.archetype}</span>}
              {(player.height || player.weight) && (
                <span>{player.height}{player.height && player.weight && ', '}{player.weight ? `${player.weight} lbs` : ''}</span>
              )}
            </div>
          )}

          {/* Hometown */}
          {(player.hometown || player.state) && (
            <div className="text-xs" style={{ opacity: 0.7 }}>
              {player.hometown}{player.hometown && player.state && ', '}{player.state}
            </div>
          )}

          {/* Status badges */}
          <div className="flex flex-wrap items-center gap-2">
            {player.isRecruit && (
              <span
                className="px-2 py-0.5 rounded-full text-xs font-bold"
                style={{ backgroundColor: `${teamColors.primary}25`, color: teamColors.primary, border: `1px solid ${teamColors.primary}50` }}
              >
                Commitment
              </span>
            )}
            {/* Departure badge - show based on movements[] */}
            {departureMovement && departureMovement.type === 'departure' && (() => {
              const reason = departureMovement.reason
              const year = departureMovement.year
              const draftRound = departureMovement.extra?.draftRound || player.draftRound
              return (
                <span
                  className="px-2 py-0.5 rounded-full text-xs font-bold"
                  style={{ backgroundColor: '#6b7280', color: '#ffffff' }}
                >
                  {reason === 'Pro Draft' && draftRound
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
                    : `Left Team (${year})`}
                </span>
              )
            })()}
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
                  to={`${pathPrefix}/team/${resolveTid(transferredFromTeam, currentDynasty?.teams || TEAMS)}`}
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
        </div>

        {/* Action buttons row */}
        <div
          className="flex items-center justify-end gap-1 px-3 py-2"
          style={{ backgroundColor: `${teamColors.secondary}30` }}
        >
          {playerGameLog.length > 0 && (
            <button
              onClick={() => setShowGameLogModal(true)}
              className="px-3 py-1.5 rounded-lg hover:opacity-80 transition-opacity flex items-center gap-1.5 text-sm font-medium"
              style={{ backgroundColor: teamColors.primary, color: getContrastTextColor(teamColors.primary) }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Game Log ({playerGameLog.length})
            </button>
          )}
          {!isViewOnly && (
            <button
              onClick={() => navigate(`${pathPrefix}/player/${pid}/edit`)}
              className="p-2 rounded-lg hover:opacity-70 transition-opacity"
              style={{ color: primaryText }}
              title="Edit Player"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}
          {!isViewOnly && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-2 rounded-lg hover:opacity-70 transition-opacity"
              style={{ color: '#EF4444' }}
              title="Delete Player"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Player Header - Desktop Layout */}
      <div
        className="hidden sm:block rounded-lg shadow-lg p-6"
        style={{ backgroundColor: teamColors.primary, border: `3px solid ${teamColors.secondary}` }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4 flex-1">
            {player.pictureUrl && (
              <img
                src={player.pictureUrl}
                alt={player.name}
                className="w-24 h-24 object-cover rounded-lg border-2 flex-shrink-0"
                style={{ borderColor: teamColors.secondary }}
                onError={(e) => { e.target.style.display = 'none' }}
              />
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl md:text-3xl font-bold" style={{ color: primaryText }}>
                  {player.name}
                </h1>
                {playerGameLog.length > 0 && (
                  <button
                    onClick={() => setShowGameLogModal(true)}
                    className="px-2.5 py-1 rounded-lg hover:opacity-80 transition-opacity flex items-center gap-1.5 text-xs font-medium flex-shrink-0"
                    style={{ backgroundColor: teamColors.primary, color: getContrastTextColor(teamColors.primary) }}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    Game Log ({playerGameLog.length})
                  </button>
                )}
                {!isViewOnly && (
                  <button
                    onClick={() => navigate(`${pathPrefix}/player/${pid}/edit`)}
                    className="p-1.5 rounded-lg hover:opacity-70 transition-opacity flex-shrink-0"
                    style={{ color: primaryText }}
                    title="Edit Player"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                )}
                {!isViewOnly && (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="p-1.5 rounded-lg hover:opacity-70 transition-opacity flex-shrink-0"
                    style={{ color: '#EF4444' }}
                    title="Delete Player"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 mb-2">
                <Link
                  to={`${pathPrefix}/team/${resolveTid(teamAbbr, currentDynasty?.teams || TEAMS)}`}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
                  style={{ color: primaryText, opacity: 0.9 }}
                >
                  {getTeamLogo(playerTeamName) && (
                    <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.95)', boxShadow: '0 0 0 1px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.2)', padding: '3px' }}>
                      <img src={getTeamLogo(playerTeamName)} alt="" className="w-full h-full object-contain" />
                    </div>
                  )}
                  {playerTeamName}
                </Link>
                {player.isRecruit && (
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-bold"
                    style={{ backgroundColor: `${teamColors.primary}25`, color: teamColors.primary, border: `1px solid ${teamColors.primary}50` }}
                  >
                    Commitment
                  </span>
                )}
                {/* Departure badge - show based on movements[] */}
                {departureMovement && departureMovement.type === 'departure' && (() => {
                  const reason = departureMovement.reason
                  const year = departureMovement.year
                  const draftRound = departureMovement.extra?.draftRound || player.draftRound
                  return (
                    <span
                      className="px-2 py-0.5 rounded-full text-xs font-bold"
                      style={{ backgroundColor: '#6b7280', color: '#ffffff' }}
                    >
                      {reason === 'Pro Draft' && draftRound
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
                        : `Left Team (${year})`}
                    </span>
                  )
                })()}
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
                      to={`${pathPrefix}/team/${resolveTid(transferredFromTeam, currentDynasty?.teams || TEAMS)}`}
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

              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" style={{ color: primaryText, opacity: 0.85 }}>
                {player.jerseyNumber != null && player.jerseyNumber !== '' && <span className="font-bold">#{player.jerseyNumber}</span>}
                {player.jerseyNumber != null && player.jerseyNumber !== '' && <span className="opacity-50">|</span>}
                <span className="font-semibold">{player.position}</span>
                {player.archetype && <><span className="opacity-50">|</span><span>{player.archetype}</span></>}
                <span className="opacity-50">|</span>
                <span>{player.classByYear?.[dynasty?.currentYear] || player.year}</span>
                {player.devTrait && <><span className="opacity-50">|</span><span>{player.devTrait}</span></>}
                {(player.height || player.weight) && (
                  <><span className="opacity-50">|</span><span>{player.height}{player.height && player.weight && ', '}{player.weight ? `${player.weight} lbs` : ''}</span></>
                )}
                {(player.hometown || player.state) && (
                  <><span className="opacity-50">|</span><span>{player.hometown}{player.hometown && player.state && ', '}{player.state}</span></>
                )}
              </div>
            </div>
          </div>

          {/* Overall Rating */}
          {player.overall ? (
            <div className="text-center flex-shrink-0">
              <div className="text-xs mb-1" style={{ color: primaryText, opacity: 0.7 }}>OVR</div>
              <button
                onClick={() => setShowOverallProgressionModal(true)}
                className="text-5xl md:text-6xl font-bold hover:opacity-80 transition-opacity cursor-pointer"
                style={{ color: primaryText }}
                title="View overall progression"
              >
                {player.overall}
              </button>
            </div>
          ) : (
            <div className="text-center flex-shrink-0">
              <div className="text-xs mb-1" style={{ color: primaryText, opacity: 0.7 }}>OVR</div>
              <div
                className="text-5xl md:text-6xl font-bold"
                style={{ color: primaryText, opacity: 0.3 }}
              >
                —
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Career Timeline - Built from teamsByYear (source of truth) with movements for context */}
      {(() => {
        // Build timeline from teamsByYear as source of truth
        const teamsByYear = player.teamsByYear || {}
        const years = Object.keys(teamsByYear).map(Number).sort((a, b) => a - b)
        if (years.length === 0) return null

        // Get movements for additional context (entered_portal, recommit, departure, etc.)
        const movements = player.movements || []
        const movementsByYear = {}
        movements.forEach(m => {
          if (!movementsByYear[m.year]) movementsByYear[m.year] = []
          movementsByYear[m.year].push(m)
        })

        // Build timeline entries
        const timelineEntries = []
        let prevTeam = null

        years.forEach((year, idx) => {
          const team = teamsByYear[year]
          const yearMovements = movementsByYear[year] || []

          // First year on record - show how they joined
          if (idx === 0) {
            // Check if there's a recruited/portal_in/added movement for this year
            const joinMovement = yearMovements.find(m =>
              m.type === 'recruited' || m.type === 'portal_in' || m.type === 'added'
            )
            if (joinMovement) {
              // Check if joinMovement has a from team, or look in teamHistory
              let fromTeam = joinMovement.from || null
              if (!fromTeam && player.teamHistory) {
                const stint = player.teamHistory.find(s => s.fromYear === year && s.teamTid === team)
                if (stint?.transferFromTid) {
                  fromTeam = stint.transferFromTid
                }
              }
              timelineEntries.push({ ...joinMovement, team, from: fromTeam })
            } else {
              // No join movement - determine type from player data
              let joinType = 'started'
              let fromTeam = null

              // First check teamHistory for this year's stint
              if (player.teamHistory) {
                const stint = player.teamHistory.find(s => s.fromYear === year && s.teamTid === team)
                if (stint) {
                  // Use stint's reason if available
                  if (stint.reason === 'portal_in' || stint.entryType === 'portal_in') {
                    joinType = 'portal_in'
                    fromTeam = stint.transferFromTid || null
                  } else if (stint.reason === 'juco_in' || stint.entryType === 'juco_in') {
                    joinType = 'juco_in'
                    fromTeam = stint.transferFromTid || null
                  } else if (stint.reason === 'transfer' || stint.entryType === 'transfer') {
                    joinType = 'transfer'
                    fromTeam = stint.transferFromTid || null
                  } else if (stint.reason === 'recruited' || stint.entryType === 'recruited') {
                    joinType = 'recruited'
                  } else if (stint.reason === 'added' || stint.entryType === 'added') {
                    joinType = 'added'
                  }
                }
              }

              // Fall back to player-level flags if no stint info
              if (joinType === 'started') {
                // Check if player was a portal transfer
                if (player.isPortal) {
                  joinType = 'portal_in'
                  // previousTeam could be tid (number) or text - handle both
                  fromTeam = player.previousTeam || null
                }
                // Check if player was a JUCO transfer (class starts with JUCO)
                else if (player.year?.startsWith('JUCO') || player.classByYear?.[year]?.startsWith('JUCO')) {
                  joinType = 'juco_in'
                }
                // Check if player has recruit data (was recruited from HS)
                else if (player.stars || player.nationalRank || player.recruitYear) {
                  joinType = 'recruited'
                }
              }

              timelineEntries.push({ year, type: joinType, team, to: team, from: fromTeam })
            }
          } else if (team !== prevTeam && prevTeam) {
            // Team changed - show transfer
            const transferMovement = yearMovements.find(m => m.type === 'transfer' || m.type === 'portal_in')
            if (transferMovement) {
              // Check if movement has from, or look in teamHistory
              let fromTeam = transferMovement.from || prevTeam
              if (!transferMovement.from && player.teamHistory) {
                const stint = player.teamHistory.find(s => s.fromYear === year && s.teamTid === team)
                if (stint?.transferFromTid) {
                  fromTeam = stint.transferFromTid
                }
              }
              timelineEntries.push({ ...transferMovement, team, from: fromTeam })
            } else {
              // Check teamHistory for transferFromTid
              let fromTeam = prevTeam
              if (player.teamHistory) {
                const stint = player.teamHistory.find(s => s.fromYear === year && s.teamTid === team)
                if (stint?.transferFromTid) {
                  fromTeam = stint.transferFromTid
                }
              }
              timelineEntries.push({ year, type: 'transfer', from: fromTeam, to: team, team })
            }
          }

          // Add any special movements for this year (entered_portal, recommit, departure)
          yearMovements.forEach(m => {
            if (m.type === 'entered_portal' || m.type === 'recommit' || m.type === 'departure') {
              // Only add if not already in timeline
              if (!timelineEntries.some(e => e.year === m.year && e.type === m.type)) {
                timelineEntries.push({ ...m, team })
              }
            }
          })

          prevTeam = team
        })

        // Check for departure movement after last year in teamsByYear
        const lastYear = years[years.length - 1]
        const lastTeam = teamsByYear[lastYear]
        const afterLastYearMovements = movements.filter(m =>
          m.year > lastYear && (m.type === 'departure' || m.type === 'transfer')
        )
        afterLastYearMovements.forEach(m => timelineEntries.push(m))

        // Check if player was an encouraged transfer (check encourageTransfers)
        // This is the source of truth - not the movements array
        // Note: Encourage transfers data is stored under the NEW season year (after year flip)
        // So if player's last year on team was 2026, check 2027 for encouraged transfer data
        const nextYear = lastYear + 1
        // lastTeam could be tid (number) or abbr (string) - getter handles both
        const encouragedTransfers = getEncourageTransfers(dynasty, lastTeam, nextYear)
        const wasEncouragedTransfer = encouragedTransfers.some(t =>
          t.name?.toLowerCase().trim() === player.name?.toLowerCase().trim()
        )
        if (wasEncouragedTransfer) {
          // Add encouraged transfer entry if not already present
          const hasEncouragedEntry = timelineEntries.some(e =>
            e.type === 'encouraged_transfer' && e.year === lastYear
          )
          if (!hasEncouragedEntry) {
            timelineEntries.push({
              year: lastYear,
              type: 'encouraged_transfer',
              from: lastTeam
            })
          }
        }

        if (timelineEntries.length === 0) return null

        // Sort by year
        timelineEntries.sort((a, b) => a.year - b.year)

        // Detect recommit scenarios: portal_in to a team the player was previously on
        // This happens when a player enters portal, then returns to the same team
        const teamsData = dynasty?.teams || dynasty?.customTeams
        const teamsSeenBefore = new Set()
        timelineEntries.forEach((entry, idx) => {
          // Track teams from previous entries
          if (idx > 0) {
            const prevEntries = timelineEntries.slice(0, idx)
            prevEntries.forEach(prev => {
              if (prev.team) teamsSeenBefore.add(prev.team)
              if (prev.to) teamsSeenBefore.add(prev.to)
            })
          }
          // Check if this portal_in is to a team we've seen before (recommit)
          if (entry.type === 'portal_in' && entry.to) {
            const toTid = typeof entry.to === 'number' ? entry.to : getTidFromAbbr(entry.to)
            const wasOnTeamBefore = Array.from(teamsSeenBefore).some(t => {
              const tid = typeof t === 'number' ? t : getTidFromAbbr(t)
              return tid === toTid
            })
            if (wasOnTeamBefore) {
              entry.isRecommit = true
            }
          }
        })

        const getMovementLabel = (m) => {
          // Special case: portal_in that's actually a recommit
          if (m.type === 'portal_in' && m.isRecommit) {
            return 'Recommitted'
          }
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

        // Build overall history from teamsByYear (years player was on roster)
        const overallHistory = years.map(year => ({
          year,
          team: teamsByYear[year],
          playerClass: player.classByYear?.[year] || player.classByYear?.[String(year)] || player.year || '—',
          overall: player.overallByYear?.[year] || player.overallByYear?.[String(year)] || (year === years[years.length - 1] ? player.overall : null)
        }))

        const getOverallColor = (ovr) => {
          if (!ovr) return '#9ca3af'
          if (ovr >= 85) return '#22c55e'
          if (ovr >= 75) return '#3b82f6'
          if (ovr >= 65) return '#f59e0b'
          return '#ef4444'
        }

        return (
          <div
            className="rounded-xl p-4"
            style={{ backgroundColor: teamColors.secondary, border: `2px solid ${teamColors.primary}` }}
          >
            <h3 className="text-sm font-bold mb-3 uppercase tracking-wide" style={{ color: secondaryText, opacity: 0.7 }}>
              Career Timeline
            </h3>
            <div className="flex flex-wrap gap-2 mb-4">
              {timelineEntries.map((entry, idx) => {
                const teamsData = dynasty?.teams || dynasty?.customTeams
                // Use school names (without mascot) for cleaner display
                const toTeamName = entry.to ? getSchoolName(entry.to, teamsData) : null
                const fromTeamName = entry.from ? getSchoolName(entry.from, teamsData) : null
                const teamName = entry.team ? getSchoolName(entry.team, teamsData) : null
                const displayTeamName = toTeamName || fromTeamName || teamName
                // But use full mascot name for logo lookup
                const fullTeamName = entry.team ? getMascotName(entry.team, teamsData) : null
                const logo = fullTeamName ? getTeamLogo(fullTeamName) : null

                // Build team display string based on movement type
                let teamDisplay = ''
                if (entry.type === 'portal_in' || entry.type === 'juco_in' || entry.type === 'transfer') {
                  // Show "From Team -> to New Team" for transfers
                  if (fromTeamName && toTeamName) {
                    teamDisplay = ` from ${fromTeamName} to ${toTeamName}`
                  } else if (fromTeamName) {
                    teamDisplay = ` from ${fromTeamName}`
                  } else if (toTeamName) {
                    teamDisplay = ` to ${toTeamName}`
                  }
                } else if (entry.type === 'recruited' || entry.type === 'added') {
                  teamDisplay = toTeamName ? ` to ${toTeamName}` : ''
                } else if (entry.type === 'encouraged_transfer') {
                  teamDisplay = toTeamName ? ` to ${toTeamName}` : ''
                } else if (entry.type === 'entered_portal' || entry.type === 'departure') {
                  teamDisplay = fromTeamName ? ` from ${fromTeamName}` : ''
                } else if (entry.type === 'recommit') {
                  teamDisplay = toTeamName ? ` to ${toTeamName}` : ''
                }

                return (
                  <div
                    key={idx}
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-xs"
                    style={{ backgroundColor: teamColors.primary, border: `1px solid ${teamColors.secondary}` }}
                  >
                    {logo && <img src={logo} alt="" className="w-3.5 h-3.5 object-contain" />}
                    <span style={{ color: primaryText }}>
                      {getMovementLabel(entry)}{teamDisplay}
                      {entry.draftRound && ` (Rd ${entry.draftRound})`}
                    </span>
                    <span style={{ color: primaryText, opacity: 0.6 }}>·</span>
                    <span style={{ color: primaryText, opacity: 0.8 }}>{entry.year}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Recruitment Information - Show for any player with recruitment data */}
      {recruitmentInfo && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ backgroundColor: teamColors.secondary, border: `2px solid ${teamColors.primary}` }}
        >
          <div className="px-4 py-2 flex items-center gap-2" style={{ backgroundColor: teamColors.primary }}>
            <span className="text-sm font-bold" style={{ color: primaryText }}>
              {recruitmentInfo.isPortal || player.isPortal ? 'Transfer Portal' : 'Recruitment'}
            </span>
            {(player.recruitYear || player.yearStarted) && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: `${primaryText}20`, color: primaryText }}>
                Class of {player.recruitYear || player.yearStarted}
              </span>
            )}
          </div>
          <div className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {/* Stars */}
              {Number(recruitmentInfo.stars) > 0 && (
                <div className="flex items-center gap-1">
                  <div className="flex gap-0.5">
                    {[...Array(5)].map((_, i) => (
                      <svg key={i} className="w-4 h-4" fill={i < Number(recruitmentInfo.stars) ? '#FFD700' : `${secondaryText}30`} viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                  <span className="text-xs font-medium" style={{ color: secondaryText }}>
                    {recruitmentInfo.stars}-Star
                  </span>
                </div>
              )}
              {/* Rankings - Use Number() > 0 directly to avoid React rendering 0 */}
              {Number(recruitmentInfo.nationalRank) > 0 && (
                <div className="text-sm" style={{ color: secondaryText }}>
                  <span className="font-bold" style={{ color: secondaryText }}>#{recruitmentInfo.nationalRank}</span>
                  <span style={{ color: secondaryText, opacity: 0.7 }}> National</span>
                </div>
              )}
              {Number(recruitmentInfo.positionRank) > 0 && (
                <div className="text-sm" style={{ color: secondaryText }}>
                  <span className="font-bold" style={{ color: secondaryText }}>#{recruitmentInfo.positionRank}</span>
                  <span style={{ color: secondaryText, opacity: 0.7 }}> {player.position}</span>
                </div>
              )}
              {Number(recruitmentInfo.stateRank) > 0 && (
                <div className="text-sm" style={{ color: secondaryText }}>
                  <span className="font-bold" style={{ color: secondaryText }}>#{recruitmentInfo.stateRank}</span>
                  <span style={{ color: secondaryText, opacity: 0.7 }}> {recruitmentInfo.state || player.state}</span>
                </div>
              )}
              {/* Previous Team for transfers */}
              {recruitmentInfo.previousTeam && (() => {
                const teamsData = dynasty?.teams || dynasty?.customTeams
                // previousTeam could be a tid (number) or team name/abbr (string)
                const prevTeamTid = typeof recruitmentInfo.previousTeam === 'number'
                  ? recruitmentInfo.previousTeam
                  : resolveTid(recruitmentInfo.previousTeam, teamsData || TEAMS)
                // The year they transferred is their recruit/start year
                const transferYear = player.recruitYear || player.yearStarted || dynasty?.currentYear
                const prevTeamFullName = getMascotName(recruitmentInfo.previousTeam, teamsData)
                const prevTeamLogo = prevTeamFullName ? getTeamLogo(prevTeamFullName, teamsData) : null

                return (
                  <div className="text-sm flex items-center gap-1.5" style={{ color: secondaryText }}>
                    <span style={{ color: secondaryText, opacity: 0.7 }}>from</span>
                    <Link
                      to={`${pathPrefix}/team/${prevTeamTid}/${transferYear}`}
                      className="font-semibold hover:underline flex items-center gap-1.5"
                      style={{ color: teamColors.primary }}
                    >
                      {prevTeamLogo && (
                        <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.95)', boxShadow: '0 0 0 1px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.2)', padding: '2px' }}>
                          <img src={prevTeamLogo} alt="" className="w-full h-full object-contain" />
                        </div>
                      )}
                    </Link>
                  </div>
                )
              })()}
              {/* Gem/Bust tag */}
              {recruitmentInfo.gemBust && (
                <span
                  className="px-2 py-0.5 rounded-full text-xs font-bold"
                  style={{
                    backgroundColor: recruitmentInfo.gemBust.toLowerCase() === 'gem' ? '#10B981' : '#EF4444',
                    color: 'white'
                  }}
                >
                  {recruitmentInfo.gemBust.toLowerCase() === 'gem' ? '💎 Gem' : '💥 Bust'}
                </span>
              )}
            </div>
          </div>
          {/* Link to recruiting class if applicable - use original recruiting team, not current team */}
          {player.recruitYear && (
            <Link
              to={`${pathPrefix}/recruiting/${resolveTid(player.teamsByYear?.[player.recruitYear] || playerTeamAbbr, currentDynasty?.teams || TEAMS)}/${player.recruitYear}`}
              className="block px-4 py-2 text-sm font-medium hover:opacity-80 transition-opacity text-center"
              style={{ backgroundColor: teamColors.primary, color: primaryText }}
            >
              View Recruiting Class →
            </Link>
          )}
        </div>
      )}

      {/* Career Statistics - Premium Dark Theme */}
      {hasMeaningfulStats && (() => {
        const primaryStat = getPrimaryStatCategory(player.position)
        return (
        <div className="space-y-6">
          {/* Passing Table */}
          {hasStats.passing && (
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: teamColors.secondary, border: `2px solid ${teamColors.primary}` }}>
              <div className="px-4 py-3" style={{ backgroundColor: teamColors.primary }}>
                <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: primaryText }}>Passing</h3>
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
                        <tr style={{ backgroundColor: teamColors.secondary, borderBottom: `2px solid ${teamColors.primary}` }}>
                          {renderSortableHeader('passing', 'year', 'Year', 'left', colWidths.year)}
                          {renderSortableHeader('passing', 'class', 'Class', 'left', colWidths.class)}
                          <th className={`px-1.5 py-2.5 text-xs font-semibold uppercase text-center ${colWidths.team}`} style={{ color: secondaryText, opacity: 0.8 }}>Team</th>
                          {primaryStat === 'passing' && renderSortableHeader('passing', 'gamesPlayed', 'G', 'right', colWidths.statNarrow)}
                          {renderSortableHeader('passing', 'cmp', 'Cmp', 'right', colWidths.statMedium)}
                          {renderSortableHeader('passing', 'att', 'Att', 'right', colWidths.statMedium)}
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
                      <tbody style={{ borderTop: `1px solid ${teamColors.primary}30` }}>
                        {passingYears.map((y, idx) => {
                          const rowTeam = y.team || teamAbbr
                          const mascot = getMascotName(rowTeam, dynasty?.teams || dynasty?.customTeams)
                          const logo = mascot ? getTeamLogo(mascot) : null
                          const colSpan = 15 + (primaryStat === 'passing' ? 1 : 0) + (showSnapsCol ? 1 : 0)
                          return (
                            <React.Fragment key={y.year}>
                              <tr className="transition-opacity hover:opacity-80" style={{ backgroundColor: expandedGameLogYear === y.year ? `${teamColors.primary}20` : idx % 2 === 1 ? `${teamColors.primary}08` : teamColors.secondary, borderBottom: `1px solid ${teamColors.primary}20` }}>
                                <td
                                  className="px-1.5 py-2 font-medium cursor-pointer hover:underline truncate"
                                  style={{ color: teamColors.primary }}
                                  onClick={() => toggleGameLog(y.year)}
                                  title="Click to view game log"
                                >
                                  {y.year}
                                  {expandedGameLogYear === y.year && <span className="ml-0.5 text-xs">▼</span>}
                                </td>
                                <td className="px-1.5 py-2 truncate" style={{ color: secondaryText, opacity: 0.8 }}>{y.class}</td>
                                <td className="px-1.5 py-2 text-center">
                                  <Link to={`${pathPrefix}/team/${resolveTid(rowTeam, currentDynasty?.teams || TEAMS)}/${y.year}`} className="hover:opacity-70 transition-opacity">
                                    {logo ? <img src={logo} alt={rowTeam} className="w-5 h-5 object-contain inline-block" /> : rowTeam}
                                  </Link>
                                </td>
                                {primaryStat === 'passing' && <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: secondaryText }}>{y.gamesPlayed}</td>}
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: secondaryText }}>{y.passing.cmp}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: secondaryText, opacity: 0.8 }}>{y.passing.att}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: secondaryText, opacity: 0.8 }}>{calcPct(y.passing.cmp, y.passing.att)}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums font-semibold" style={{ color: secondaryText }}>{y.passing.yds.toLocaleString()}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: secondaryText, opacity: 0.8 }}>{calcAvg(y.passing.yds, y.passing.att)}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums font-semibold" style={{ color: secondaryText }}>{y.passing.td}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: secondaryText, opacity: 0.8 }}>{calcPct(y.passing.td, y.passing.att)}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: secondaryText, opacity: 0.8 }}>{y.passing.int}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: secondaryText, opacity: 0.8 }}>{calcPct(y.passing.int, y.passing.att)}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: secondaryText, opacity: 0.8 }}>{y.passing.int > 0 ? `${(y.passing.td / y.passing.int).toFixed(1)}:1` : (y.passing.td > 0 ? '∞' : '-')}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: secondaryText, opacity: 0.8 }}>{y.passing.lng}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: secondaryText, opacity: 0.8 }}>{y.passing.sacks}</td>
                                {showSnapsCol && <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: secondaryText, opacity: 0.8 }}>{y.snapsPlayed.toLocaleString()}</td>}
                              </tr>
                              {renderGameLogRow(y.year, colSpan, 'passing')}
                            </React.Fragment>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ backgroundColor: teamColors.primary }}>
                          <td className="px-1.5 py-2 font-bold" style={{ color: primaryText }}>Career</td>
                          <td className="px-1.5 py-2"></td>
                          <td className="px-1.5 py-2"></td>
                          {primaryStat === 'passing' && <td className="px-1.5 py-2 text-right tabular-nums font-semibold" style={{ color: primaryText }}>{careerGames}</td>}
                          <td className="px-1.5 py-2 text-right tabular-nums font-semibold" style={{ color: primaryText }}>{careerPassing.cmp.toLocaleString()}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: primaryText, opacity: 0.9 }}>{careerPassing.att.toLocaleString()}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: primaryText, opacity: 0.9 }}>{calcPct(careerPassing.cmp, careerPassing.att)}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums font-bold" style={{ color: primaryText }}>{careerPassing.yds.toLocaleString()}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: primaryText, opacity: 0.9 }}>{calcAvg(careerPassing.yds, careerPassing.att)}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums font-bold" style={{ color: primaryText }}>{careerPassing.td}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: primaryText, opacity: 0.9 }}>{calcPct(careerPassing.td, careerPassing.att)}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: primaryText, opacity: 0.9 }}>{careerPassing.int}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: primaryText, opacity: 0.9 }}>{calcPct(careerPassing.int, careerPassing.att)}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: primaryText, opacity: 0.9 }}>{careerPassing.int > 0 ? `${(careerPassing.td / careerPassing.int).toFixed(1)}:1` : (careerPassing.td > 0 ? '∞' : '-')}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: primaryText, opacity: 0.9 }}>{careerPassing.lng}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: primaryText, opacity: 0.9 }}>{careerPassing.sacks}</td>
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
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: teamColors.secondary, border: `2px solid ${teamColors.primary}` }}>
              <div className="px-4 py-3" style={{ backgroundColor: teamColors.primary }}>
                <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: primaryText }}>Rushing</h3>
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
                        <tr style={{ backgroundColor: teamColors.secondary, borderBottom: `2px solid ${teamColors.primary}` }}>
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
                      <tbody style={{ borderTop: `1px solid ${teamColors.primary}30` }}>
                        {rushingYears.map((y, idx) => {
                          const rowTeam = y.team || teamAbbr
                          const mascot = getMascotName(rowTeam, dynasty?.teams || dynasty?.customTeams)
                          const logo = mascot ? getTeamLogo(mascot) : null
                          const colSpan = 13 + (primaryStat === 'rushing' ? 1 : 0) + (showSnapsCol ? 1 : 0)
                          return (
                            <React.Fragment key={y.year}>
                              <tr className="transition-opacity hover:opacity-80" style={{ backgroundColor: expandedGameLogYear === y.year ? `${teamColors.primary}20` : idx % 2 === 1 ? `${teamColors.primary}08` : teamColors.secondary, borderBottom: `1px solid ${teamColors.primary}20` }}>
                                <td
                                  className="px-1.5 py-2 font-medium cursor-pointer hover:underline truncate"
                                  style={{ color: teamColors.primary }}
                                  onClick={() => toggleGameLog(y.year)}
                                  title="Click to view game log"
                                >
                                  {y.year}
                                  {expandedGameLogYear === y.year && <span className="ml-0.5 text-xs">▼</span>}
                                </td>
                                <td className="px-1.5 py-2 truncate" style={{ color: secondaryText, opacity: 0.8 }}>{y.class}</td>
                                <td className="px-1.5 py-2 text-center">
                                  <Link to={`${pathPrefix}/team/${resolveTid(rowTeam, currentDynasty?.teams || TEAMS)}/${y.year}`} className="hover:opacity-70 transition-opacity">
                                    {logo ? <img src={logo} alt={rowTeam} className="w-5 h-5 object-contain inline-block" /> : rowTeam}
                                  </Link>
                                </td>
                                {primaryStat === 'rushing' && <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: secondaryText }}>{y.gamesPlayed}</td>}
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: secondaryText }}>{y.rushing.car}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums font-semibold" style={{ color: secondaryText }}>{y.rushing.yds.toLocaleString()}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: secondaryText, opacity: 0.8 }}>{calcAvg(y.rushing.yds, y.rushing.car)}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums font-semibold" style={{ color: secondaryText }}>{y.rushing.td}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: secondaryText, opacity: 0.8 }}>{y.gamesPlayed > 0 ? calcAvg(y.rushing.yds, y.gamesPlayed) : '0.0'}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: secondaryText, opacity: 0.8 }}>{y.rushing.yac || 0}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: secondaryText, opacity: 0.8 }}>{y.rushing.twentyPlus || 0}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: secondaryText, opacity: 0.8 }}>{y.rushing.lng}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: secondaryText, opacity: 0.8 }}>{y.rushing.fum}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: secondaryText, opacity: 0.8 }}>{y.rushing.bt}</td>
                                {showSnapsCol && <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: secondaryText, opacity: 0.8 }}>{y.snapsPlayed.toLocaleString()}</td>}
                              </tr>
                              {renderGameLogRow(y.year, colSpan, 'rushing')}
                            </React.Fragment>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ backgroundColor: teamColors.primary }}>
                          <td className="px-1.5 py-2 font-bold" style={{ color: primaryText }}>Career</td>
                          <td className="px-1.5 py-2"></td>
                          <td className="px-1.5 py-2"></td>
                          {primaryStat === 'rushing' && <td className="px-1.5 py-2 text-right tabular-nums font-semibold" style={{ color: primaryText }}>{careerGames}</td>}
                          <td className="px-1.5 py-2 text-right tabular-nums font-semibold" style={{ color: primaryText }}>{careerRushing.car.toLocaleString()}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums font-bold" style={{ color: primaryText }}>{careerRushing.yds.toLocaleString()}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: primaryText, opacity: 0.9 }}>{calcAvg(careerRushing.yds, careerRushing.car)}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums font-bold" style={{ color: primaryText }}>{careerRushing.td}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: primaryText, opacity: 0.9 }}>{careerGames > 0 ? calcAvg(careerRushing.yds, careerGames) : '0.0'}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: primaryText, opacity: 0.9 }}>{careerRushing.yac || 0}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: primaryText, opacity: 0.9 }}>{careerRushing.twentyPlus || 0}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: primaryText, opacity: 0.9 }}>{careerRushing.lng}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: primaryText, opacity: 0.9 }}>{careerRushing.fum}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: primaryText, opacity: 0.9 }}>{careerRushing.bt}</td>
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
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: teamColors.secondary, border: `2px solid ${teamColors.primary}` }}>
              <div className="px-4 py-3" style={{ backgroundColor: teamColors.primary }}>
                <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: primaryText }}>Receiving</h3>
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
                        <tr style={{ backgroundColor: teamColors.secondary, borderBottom: `2px solid ${teamColors.primary}` }}>
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
                      <tbody style={{ borderTop: `1px solid ${teamColors.primary}30` }}>
                        {receivingYears.map((y, idx) => {
                          const rowTeam = y.team || teamAbbr
                          const mascot = getMascotName(rowTeam, dynasty?.teams || dynasty?.customTeams)
                          const logo = mascot ? getTeamLogo(mascot) : null
                          const colSpan = 11 + (primaryStat === 'receiving' ? 1 : 0) + (showSnapsCol ? 1 : 0)
                          return (
                            <React.Fragment key={y.year}>
                              <tr className="transition-opacity hover:opacity-80" style={{ backgroundColor: expandedGameLogYear === y.year ? `${teamColors.primary}20` : idx % 2 === 1 ? `${teamColors.primary}08` : teamColors.secondary, borderBottom: `1px solid ${teamColors.primary}20` }}>
                                <td
                                  className="px-1.5 py-2 font-medium cursor-pointer hover:underline truncate"
                                  style={{ color: teamColors.primary }}
                                  onClick={() => toggleGameLog(y.year)}
                                  title="Click to view game log"
                                >
                                  {y.year}
                                  {expandedGameLogYear === y.year && <span className="ml-0.5 text-xs">▼</span>}
                                </td>
                                <td className="px-1.5 py-2 truncate" style={{ color: secondaryText, opacity: 0.8 }}>{y.class}</td>
                                <td className="px-1.5 py-2 text-center">
                                  <Link to={`${pathPrefix}/team/${resolveTid(rowTeam, currentDynasty?.teams || TEAMS)}/${y.year}`} className="hover:opacity-70 transition-opacity">
                                    {logo ? <img src={logo} alt={rowTeam} className="w-5 h-5 object-contain inline-block" /> : rowTeam}
                                  </Link>
                                </td>
                                {primaryStat === 'receiving' && <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: secondaryText }}>{y.gamesPlayed}</td>}
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: secondaryText }}>{y.receiving.rec}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums font-semibold" style={{ color: secondaryText }}>{y.receiving.yds.toLocaleString()}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: secondaryText, opacity: 0.8 }}>{calcAvg(y.receiving.yds, y.receiving.rec)}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums font-semibold" style={{ color: secondaryText }}>{y.receiving.td}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: secondaryText, opacity: 0.8 }}>{y.gamesPlayed > 0 ? calcAvg(y.receiving.yds, y.gamesPlayed) : '0.0'}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: secondaryText, opacity: 0.8 }}>{y.receiving.rac || 0}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: secondaryText, opacity: 0.8 }}>{y.receiving.lng}</td>
                                <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: secondaryText, opacity: 0.8 }}>{y.receiving.drops}</td>
                                {showSnapsCol && <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: secondaryText, opacity: 0.8 }}>{y.snapsPlayed.toLocaleString()}</td>}
                              </tr>
                              {renderGameLogRow(y.year, colSpan, 'receiving')}
                            </React.Fragment>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ backgroundColor: teamColors.primary }}>
                          <td className="px-1.5 py-2 font-bold" style={{ color: primaryText }}>Career</td>
                          <td className="px-1.5 py-2"></td>
                          <td className="px-1.5 py-2"></td>
                          {primaryStat === 'receiving' && <td className="px-1.5 py-2 text-right tabular-nums font-semibold" style={{ color: primaryText }}>{careerGames}</td>}
                          <td className="px-1.5 py-2 text-right tabular-nums font-semibold" style={{ color: primaryText }}>{careerReceiving.rec.toLocaleString()}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums font-bold" style={{ color: primaryText }}>{careerReceiving.yds.toLocaleString()}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: primaryText, opacity: 0.9 }}>{calcAvg(careerReceiving.yds, careerReceiving.rec)}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums font-bold" style={{ color: primaryText }}>{careerReceiving.td}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: primaryText, opacity: 0.9 }}>{careerGames > 0 ? calcAvg(careerReceiving.yds, careerGames) : '0.0'}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: primaryText, opacity: 0.9 }}>{careerReceiving.rac || 0}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: primaryText, opacity: 0.9 }}>{careerReceiving.lng}</td>
                          <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: primaryText, opacity: 0.9 }}>{careerReceiving.drops}</td>
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
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: teamColors.secondary, border: `2px solid ${teamColors.primary}` }}>
              <div className="px-4 py-3" style={{ backgroundColor: teamColors.primary }}>
                <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: primaryText }}>Blocking</h3>
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
                        <tr style={{ backgroundColor: teamColors.secondary, borderBottom: `2px solid ${teamColors.primary}` }}>
                          {renderSortableHeader('blocking', 'year', 'Year', 'left', 'w-14')}
                          {renderSortableHeader('blocking', 'class', 'Class', 'left', 'w-16')}
                          <th className="px-2 py-2.5 text-xs font-semibold uppercase text-center w-12" style={{ color: secondaryText, opacity: 0.8 }}>Team</th>
                          {primaryStat === 'blocking' && renderSortableHeader('blocking', 'gamesPlayed', 'G', 'right')}
                          {renderSortableHeader('blocking', 'sacksAllowed', 'Sacks Allowed', 'right')}
                          {showSnapsCol && renderSortableHeader('blocking', 'snapsPlayed', 'Snaps', 'right')}
                        </tr>
                      </thead>
                      <tbody style={{ borderTop: `1px solid ${teamColors.primary}30` }}>
                        {blockingYears.map((y, idx) => {
                          const rowTeam = y.team || teamAbbr
                          const mascot = getMascotName(rowTeam, dynasty?.teams || dynasty?.customTeams)
                          const logo = mascot ? getTeamLogo(mascot) : null
                          const colSpan = 4 + (primaryStat === 'blocking' ? 1 : 0) + (showSnapsCol ? 1 : 0)
                          return (
                            <React.Fragment key={y.year}>
                              <tr className="transition-opacity hover:opacity-80" style={{ backgroundColor: expandedGameLogYear === y.year ? `${teamColors.primary}20` : idx % 2 === 1 ? `${teamColors.primary}08` : teamColors.secondary, borderBottom: `1px solid ${teamColors.primary}20` }}>
                                <td
                                  className="px-2 py-2.5 font-medium w-14 cursor-pointer hover:underline"
                                  style={{ color: teamColors.primary }}
                                  onClick={() => toggleGameLog(y.year)}
                                  title="Click to view game log"
                                >
                                  {y.year}
                                  {expandedGameLogYear === y.year && <span className="ml-1 text-xs">▼</span>}
                                </td>
                                <td className="px-2 py-2.5 w-16" style={{ color: secondaryText, opacity: 0.8 }}>{y.class}</td>
                                <td className="px-2 py-2 text-center w-12">
                                  <Link to={`${pathPrefix}/team/${resolveTid(rowTeam, currentDynasty?.teams || TEAMS)}/${y.year}`} className="hover:opacity-70 transition-opacity">
                                    {logo ? <img src={logo} alt={rowTeam} className="w-5 h-5 object-contain inline-block" /> : rowTeam}
                                  </Link>
                                </td>
                                {primaryStat === 'blocking' && <td className="px-2 py-2 text-right" style={{ color: secondaryText }}>{y.gamesPlayed || 0}</td>}
                                <td className="px-2 py-2 text-right font-semibold" style={{ color: secondaryText }}>{y.blocking.sacksAllowed}</td>
                                {showSnapsCol && <td className="px-2 py-2 text-right" style={{ color: secondaryText, opacity: 0.8 }}>{(y.snapsPlayed || 0).toLocaleString()}</td>}
                              </tr>
                              {renderGameLogRow(y.year, colSpan, 'blocking')}
                            </React.Fragment>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ backgroundColor: teamColors.primary }}>
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
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: teamColors.secondary, border: `2px solid ${teamColors.primary}` }}>
              <div className="px-4 py-3" style={{ backgroundColor: teamColors.primary }}>
                <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: primaryText }}>Defense</h3>
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
                        <tr style={{ backgroundColor: teamColors.secondary, borderBottom: `2px solid ${teamColors.primary}` }}>
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
                      <tbody style={{ borderTop: `1px solid ${teamColors.primary}30` }}>
                        {defenseYears.map((y, idx) => {
                          const rowTeam = y.team || teamAbbr
                          const mascot = getMascotName(rowTeam, dynasty?.teams || dynasty?.customTeams)
                          const logo = mascot ? getTeamLogo(mascot) : null
                          const colSpan = 14 + (primaryStat === 'defense' ? 1 : 0) + (showSnapsCol ? 1 : 0)
                          return (
                            <React.Fragment key={y.year}>
                              <tr className="transition-opacity hover:opacity-80" style={{ backgroundColor: expandedGameLogYear === y.year ? `${teamColors.primary}20` : idx % 2 === 1 ? `${teamColors.primary}08` : teamColors.secondary, borderBottom: `1px solid ${teamColors.primary}20` }}>
                                <td
                                  className="px-2 py-2.5 font-medium w-14 cursor-pointer hover:underline"
                                  style={{ color: teamColors.primary }}
                                  onClick={() => toggleGameLog(y.year)}
                                  title="Click to view game log"
                                >
                                  {y.year}
                                  {expandedGameLogYear === y.year && <span className="ml-1 text-xs">▼</span>}
                                </td>
                                <td className="px-2 py-2.5 w-16" style={{ color: secondaryText, opacity: 0.8 }}>{y.class}</td>
                                <td className="px-2 py-2 text-center w-12">
                                  <Link to={`${pathPrefix}/team/${resolveTid(rowTeam, currentDynasty?.teams || TEAMS)}/${y.year}`} className="hover:opacity-70 transition-opacity">
                                    {logo ? <img src={logo} alt={rowTeam} className="w-5 h-5 object-contain inline-block" /> : rowTeam}
                                  </Link>
                                </td>
                                {primaryStat === 'defense' && <td className="px-2 py-2 text-right" style={{ color: secondaryText }}>{y.gamesPlayed}</td>}
                                <td className="px-2 py-2 text-right" style={{ color: secondaryText, opacity: 0.8 }}>{y.defensive.solo}</td>
                                <td className="px-2 py-2 text-right" style={{ color: secondaryText, opacity: 0.8 }}>{y.defensive.ast}</td>
                                <td className="px-2 py-2 text-right font-semibold" style={{ color: secondaryText }}>{y.defensive.solo + y.defensive.ast}</td>
                                <td className="px-2 py-2 text-right" style={{ color: secondaryText }}>{y.defensive.tfl}</td>
                                <td className="px-2 py-2 text-right font-semibold" style={{ color: secondaryText }}>{y.defensive.sacks}</td>
                                <td className="px-2 py-2 text-right" style={{ color: secondaryText }}>{y.defensive.int}</td>
                                <td className="px-2 py-2 text-right" style={{ color: secondaryText, opacity: 0.8 }}>{y.defensive.intYds}</td>
                                <td className="px-2 py-2 text-right" style={{ color: secondaryText }}>{y.defensive.intTd}</td>
                                <td className="px-2 py-2 text-right" style={{ color: secondaryText, opacity: 0.8 }}>{y.defensive.pdef}</td>
                                <td className="px-2 py-2 text-right" style={{ color: secondaryText, opacity: 0.8 }}>{y.defensive.ff}</td>
                                <td className="px-2 py-2 text-right" style={{ color: secondaryText, opacity: 0.8 }}>{y.defensive.fr}</td>
                                {showSnapsCol && <td className="px-2 py-2 text-right" style={{ color: secondaryText, opacity: 0.8 }}>{y.snapsPlayed.toLocaleString()}</td>}
                              </tr>
                              {renderGameLogRow(y.year, colSpan, 'defense')}
                            </React.Fragment>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ backgroundColor: teamColors.primary }}>
                          <td className="px-2 py-2.5 font-bold w-14" style={{ color: primaryText }}>Career</td>
                          <td className="px-2 py-2 w-16"></td>
                          <td className="px-2 py-2 w-12"></td>
                          {primaryStat === 'defense' && <td className="px-2 py-2 text-right font-semibold" style={{ color: primaryText }}>{careerGames}</td>}
                          <td className="px-2 py-2 text-right" style={{ color: primaryText, opacity: 0.9 }}>{careerDefensive.solo}</td>
                          <td className="px-2 py-2 text-right" style={{ color: primaryText, opacity: 0.9 }}>{careerDefensive.ast}</td>
                          <td className="px-2 py-2 text-right font-bold" style={{ color: primaryText }}>{careerDefensive.solo + careerDefensive.ast}</td>
                          <td className="px-2 py-2 text-right font-semibold" style={{ color: primaryText }}>{careerDefensive.tfl}</td>
                          <td className="px-2 py-2 text-right font-bold" style={{ color: primaryText }}>{careerDefensive.sacks}</td>
                          <td className="px-2 py-2 text-right font-semibold" style={{ color: primaryText }}>{careerDefensive.int}</td>
                          <td className="px-2 py-2 text-right" style={{ color: primaryText, opacity: 0.9 }}>{careerDefensive.intYds}</td>
                          <td className="px-2 py-2 text-right font-semibold" style={{ color: primaryText }}>{careerDefensive.intTd}</td>
                          <td className="px-2 py-2 text-right" style={{ color: primaryText, opacity: 0.9 }}>{careerDefensive.pdef}</td>
                          <td className="px-2 py-2 text-right" style={{ color: primaryText, opacity: 0.9 }}>{careerDefensive.ff}</td>
                          <td className="px-2 py-2 text-right" style={{ color: primaryText, opacity: 0.9 }}>{careerDefensive.fr}</td>
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
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: teamColors.secondary, border: `2px solid ${teamColors.primary}` }}>
              <div className="px-4 py-3" style={{ backgroundColor: teamColors.primary }}>
                <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: primaryText }}>Kicking</h3>
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
                        <tr style={{ backgroundColor: teamColors.secondary, borderBottom: `2px solid ${teamColors.primary}` }}>
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
                      <tbody style={{ borderTop: `1px solid ${teamColors.primary}30` }}>
                        {kickingYears.map((y, idx) => {
                          const rowTeam = y.team || teamAbbr
                          const mascot = getMascotName(rowTeam, dynasty?.teams || dynasty?.customTeams)
                          const logo = mascot ? getTeamLogo(mascot) : null
                          const colSpan = 10 + (primaryStat === 'kicking' ? 1 : 0) + (showSnapsCol ? 1 : 0)
                          return (
                            <React.Fragment key={y.year}>
                              <tr className="transition-opacity hover:opacity-80" style={{ backgroundColor: expandedGameLogYear === y.year ? `${teamColors.primary}20` : idx % 2 === 1 ? `${teamColors.primary}08` : teamColors.secondary, borderBottom: `1px solid ${teamColors.primary}20` }}>
                                <td
                                  className="px-2 py-2.5 font-medium w-14 cursor-pointer hover:underline"
                                  style={{ color: teamColors.primary }}
                                  onClick={() => toggleGameLog(y.year)}
                                  title="Click to view game log"
                                >
                                  {y.year}
                                  {expandedGameLogYear === y.year && <span className="ml-1 text-xs">▼</span>}
                                </td>
                                <td className="px-2 py-2.5 w-16" style={{ color: secondaryText, opacity: 0.8 }}>{y.class}</td>
                                <td className="px-2 py-2 text-center w-12">
                                  <Link to={`${pathPrefix}/team/${resolveTid(rowTeam, currentDynasty?.teams || TEAMS)}/${y.year}`} className="hover:opacity-70 transition-opacity">
                                    {logo ? <img src={logo} alt={rowTeam} className="w-5 h-5 object-contain inline-block" /> : rowTeam}
                                  </Link>
                                </td>
                                {primaryStat === 'kicking' && <td className="px-2 py-2 text-right" style={{ color: secondaryText }}>{y.gamesPlayed}</td>}
                                <td className="px-2 py-2 text-right font-semibold" style={{ color: secondaryText }}>{y.kicking.fgm}</td>
                                <td className="px-2 py-2 text-right" style={{ color: secondaryText, opacity: 0.8 }}>{y.kicking.fga}</td>
                                <td className="px-2 py-2 text-right" style={{ color: secondaryText }}>{calcPct(y.kicking.fgm, y.kicking.fga)}</td>
                                <td className="px-2 py-2 text-right" style={{ color: secondaryText, opacity: 0.8 }}>{y.kicking.lng}</td>
                                <td className="px-2 py-2 text-right font-semibold" style={{ color: secondaryText }}>{y.kicking.xpm}</td>
                                <td className="px-2 py-2 text-right" style={{ color: secondaryText, opacity: 0.8 }}>{y.kicking.xpa}</td>
                                <td className="px-2 py-2 text-right" style={{ color: secondaryText }}>{calcPct(y.kicking.xpm, y.kicking.xpa)}</td>
                                {showSnapsCol && <td className="px-2 py-2 text-right" style={{ color: secondaryText, opacity: 0.8 }}>{y.snapsPlayed.toLocaleString()}</td>}
                              </tr>
                              {renderGameLogRow(y.year, colSpan, 'kicking')}
                            </React.Fragment>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ backgroundColor: teamColors.primary }}>
                          <td className="px-2 py-2.5 font-bold w-14" style={{ color: primaryText }}>Career</td>
                          <td className="px-2 py-2 w-16"></td>
                          <td className="px-2 py-2 w-12"></td>
                          {primaryStat === 'kicking' && <td className="px-2 py-2 text-right font-semibold" style={{ color: primaryText }}>{careerGames}</td>}
                          <td className="px-2 py-2 text-right font-bold" style={{ color: primaryText }}>{careerKicking.fgm}</td>
                          <td className="px-2 py-2 text-right" style={{ color: primaryText, opacity: 0.9 }}>{careerKicking.fga}</td>
                          <td className="px-2 py-2 text-right font-semibold" style={{ color: primaryText }}>{calcPct(careerKicking.fgm, careerKicking.fga)}</td>
                          <td className="px-2 py-2 text-right" style={{ color: primaryText, opacity: 0.9 }}>{careerKicking.lng}</td>
                          <td className="px-2 py-2 text-right font-bold" style={{ color: primaryText }}>{careerKicking.xpm}</td>
                          <td className="px-2 py-2 text-right" style={{ color: primaryText, opacity: 0.9 }}>{careerKicking.xpa}</td>
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
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: teamColors.secondary, border: `2px solid ${teamColors.primary}` }}>
              <div className="px-4 py-3" style={{ backgroundColor: teamColors.primary }}>
                <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: primaryText }}>Punting</h3>
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
                        <tr style={{ backgroundColor: teamColors.secondary, borderBottom: `2px solid ${teamColors.primary}` }}>
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
                      <tbody style={{ borderTop: `1px solid ${teamColors.primary}30` }}>
                        {puntingYears.map((y, idx) => {
                          const rowTeam = y.team || teamAbbr
                          const mascot = getMascotName(rowTeam, dynasty?.teams || dynasty?.customTeams)
                          const logo = mascot ? getTeamLogo(mascot) : null
                          const colSpan = 9 + (primaryStat === 'punting' ? 1 : 0) + (showSnapsCol ? 1 : 0)
                          return (
                            <React.Fragment key={y.year}>
                              <tr className="transition-opacity hover:opacity-80" style={{ backgroundColor: expandedGameLogYear === y.year ? `${teamColors.primary}20` : idx % 2 === 1 ? `${teamColors.primary}08` : teamColors.secondary, borderBottom: `1px solid ${teamColors.primary}20` }}>
                                <td
                                  className="px-2 py-2.5 font-medium w-14 cursor-pointer hover:underline"
                                  style={{ color: teamColors.primary }}
                                  onClick={() => toggleGameLog(y.year)}
                                  title="Click to view game log"
                                >
                                  {y.year}
                                  {expandedGameLogYear === y.year && <span className="ml-1 text-xs">▼</span>}
                                </td>
                                <td className="px-2 py-2.5 w-16" style={{ color: secondaryText, opacity: 0.8 }}>{y.class}</td>
                                <td className="px-2 py-2 text-center w-12">
                                  <Link to={`${pathPrefix}/team/${resolveTid(rowTeam, currentDynasty?.teams || TEAMS)}/${y.year}`} className="hover:opacity-70 transition-opacity">
                                    {logo ? <img src={logo} alt={rowTeam} className="w-5 h-5 object-contain inline-block" /> : rowTeam}
                                  </Link>
                                </td>
                                {primaryStat === 'punting' && <td className="px-2 py-2 text-right" style={{ color: secondaryText }}>{y.gamesPlayed}</td>}
                                <td className="px-2 py-2 text-right" style={{ color: secondaryText }}>{y.punting.punts}</td>
                                <td className="px-2 py-2 text-right font-semibold" style={{ color: secondaryText }}>{y.punting.yds.toLocaleString()}</td>
                                <td className="px-2 py-2 text-right font-semibold" style={{ color: secondaryText }}>{calcAvg(y.punting.yds, y.punting.punts)}</td>
                                <td className="px-2 py-2 text-right" style={{ color: secondaryText, opacity: 0.8 }}>{y.punting.lng}</td>
                                <td className="px-2 py-2 text-right" style={{ color: secondaryText }}>{y.punting.in20}</td>
                                <td className="px-2 py-2 text-right" style={{ color: secondaryText, opacity: 0.8 }}>{y.punting.tb}</td>
                                {showSnapsCol && <td className="px-2 py-2 text-right" style={{ color: secondaryText, opacity: 0.8 }}>{y.snapsPlayed.toLocaleString()}</td>}
                              </tr>
                              {renderGameLogRow(y.year, colSpan, 'punting')}
                            </React.Fragment>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ backgroundColor: teamColors.primary }}>
                          <td className="px-2 py-2.5 font-bold w-14" style={{ color: primaryText }}>Career</td>
                          <td className="px-2 py-2 w-16"></td>
                          <td className="px-2 py-2 w-12"></td>
                          {primaryStat === 'punting' && <td className="px-2 py-2 text-right font-semibold" style={{ color: primaryText }}>{careerGames}</td>}
                          <td className="px-2 py-2 text-right font-semibold" style={{ color: primaryText }}>{careerPunting.punts}</td>
                          <td className="px-2 py-2 text-right font-bold" style={{ color: primaryText }}>{careerPunting.yds.toLocaleString()}</td>
                          <td className="px-2 py-2 text-right font-bold" style={{ color: primaryText }}>{calcAvg(careerPunting.yds, careerPunting.punts)}</td>
                          <td className="px-2 py-2 text-right" style={{ color: primaryText, opacity: 0.9 }}>{careerPunting.lng}</td>
                          <td className="px-2 py-2 text-right font-semibold" style={{ color: primaryText }}>{careerPunting.in20}</td>
                          <td className="px-2 py-2 text-right" style={{ color: primaryText, opacity: 0.9 }}>{careerPunting.tb}</td>
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
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: teamColors.secondary, border: `2px solid ${teamColors.primary}` }}>
              <div className="px-4 py-3" style={{ backgroundColor: teamColors.primary }}>
                <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: primaryText }}>Kick Returns</h3>
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
                    <tr style={{ backgroundColor: teamColors.secondary, borderBottom: `2px solid ${teamColors.primary}` }}>
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
                      const logo = mascot ? getTeamLogo(mascot) : null
                      const colSpan = 8
                      return (
                        <React.Fragment key={y.year}>
                          <tr className="transition-opacity hover:opacity-80" style={{ backgroundColor: expandedGameLogYear === y.year ? `${teamColors.primary}20` : idx % 2 === 1 ? `${teamColors.primary}08` : teamColors.secondary, borderBottom: `1px solid ${teamColors.primary}20` }}>
                            <td
                              className="px-2 py-2.5 font-medium w-14 cursor-pointer hover:underline"
                                  style={{ color: teamColors.primary }}
                              onClick={() => toggleGameLog(y.year)}
                              title="Click to view game log"
                            >
                              {y.year}
                              {expandedGameLogYear === y.year && <span className="ml-1 text-xs">▼</span>}
                            </td>
                            <td className="px-2 py-2.5 w-16" style={{ color: secondaryText, opacity: 0.8 }}>{y.class}</td>
                            <td className="px-2 py-2 text-center w-12">
                                  <Link to={`${pathPrefix}/team/${resolveTid(rowTeam, currentDynasty?.teams || TEAMS)}/${y.year}`} className="hover:opacity-70 transition-opacity">
                                    {logo ? <img src={logo} alt={rowTeam} className="w-5 h-5 object-contain inline-block" /> : rowTeam}
                                  </Link>
                                </td>
                            <td className="px-2 py-2 text-right" style={{ color: secondaryText }}>{y.kickReturn.ret}</td>
                            <td className="px-2 py-2 text-right font-semibold" style={{ color: secondaryText }}>{y.kickReturn.yds}</td>
                            <td className="px-2 py-2 text-right" style={{ color: secondaryText, opacity: 0.8 }}>{calcAvg(y.kickReturn.yds, y.kickReturn.ret)}</td>
                            <td className="px-2 py-2 text-right font-semibold" style={{ color: secondaryText }}>{y.kickReturn.td}</td>
                            <td className="px-2 py-2 text-right" style={{ color: secondaryText, opacity: 0.8 }}>{y.kickReturn.lng}</td>
                          </tr>
                          {renderGameLogRow(y.year, colSpan, 'kickReturn')}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ backgroundColor: teamColors.primary }}>
                      <td className="px-2 py-2.5 font-bold w-14" style={{ color: primaryText }}>Career</td>
                      <td className="px-2 py-2 w-16"></td>
                      <td className="px-2 py-2 w-12"></td>
                      <td className="px-2 py-2 text-right font-semibold" style={{ color: primaryText }}>{careerKickReturn.ret}</td>
                      <td className="px-2 py-2 text-right font-bold" style={{ color: primaryText }}>{careerKickReturn.yds.toLocaleString()}</td>
                      <td className="px-2 py-2 text-right" style={{ color: primaryText, opacity: 0.9 }}>{calcAvg(careerKickReturn.yds, careerKickReturn.ret)}</td>
                      <td className="px-2 py-2 text-right font-bold" style={{ color: primaryText }}>{careerKickReturn.td}</td>
                      <td className="px-2 py-2 text-right" style={{ color: primaryText, opacity: 0.9 }}>{careerKickReturn.lng}</td>
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
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: teamColors.secondary, border: `2px solid ${teamColors.primary}` }}>
              <div className="px-4 py-3" style={{ backgroundColor: teamColors.primary }}>
                <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: primaryText }}>Punt Returns</h3>
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
                    <tr style={{ backgroundColor: teamColors.secondary, borderBottom: `2px solid ${teamColors.primary}` }}>
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
                      const logo = mascot ? getTeamLogo(mascot) : null
                      const colSpan = 8
                      return (
                        <React.Fragment key={y.year}>
                          <tr className="transition-opacity hover:opacity-80" style={{ backgroundColor: expandedGameLogYear === y.year ? `${teamColors.primary}20` : idx % 2 === 1 ? `${teamColors.primary}08` : teamColors.secondary, borderBottom: `1px solid ${teamColors.primary}20` }}>
                            <td
                              className="px-2 py-2.5 font-medium w-14 cursor-pointer hover:underline"
                                  style={{ color: teamColors.primary }}
                              onClick={() => toggleGameLog(y.year)}
                              title="Click to view game log"
                            >
                              {y.year}
                              {expandedGameLogYear === y.year && <span className="ml-1 text-xs">▼</span>}
                            </td>
                            <td className="px-2 py-2.5 w-16" style={{ color: secondaryText, opacity: 0.8 }}>{y.class}</td>
                            <td className="px-2 py-2 text-center w-12">
                                  <Link to={`${pathPrefix}/team/${resolveTid(rowTeam, currentDynasty?.teams || TEAMS)}/${y.year}`} className="hover:opacity-70 transition-opacity">
                                    {logo ? <img src={logo} alt={rowTeam} className="w-5 h-5 object-contain inline-block" /> : rowTeam}
                                  </Link>
                                </td>
                            <td className="px-2 py-2 text-right" style={{ color: secondaryText }}>{y.puntReturn.ret}</td>
                            <td className="px-2 py-2 text-right font-semibold" style={{ color: secondaryText }}>{y.puntReturn.yds}</td>
                            <td className="px-2 py-2 text-right" style={{ color: secondaryText, opacity: 0.8 }}>{calcAvg(y.puntReturn.yds, y.puntReturn.ret)}</td>
                            <td className="px-2 py-2 text-right font-semibold" style={{ color: secondaryText }}>{y.puntReturn.td}</td>
                            <td className="px-2 py-2 text-right" style={{ color: secondaryText, opacity: 0.8 }}>{y.puntReturn.lng}</td>
                          </tr>
                          {renderGameLogRow(y.year, colSpan, 'puntReturn')}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ backgroundColor: teamColors.primary }}>
                      <td className="px-2 py-2.5 font-bold w-14" style={{ color: primaryText }}>Career</td>
                      <td className="px-2 py-2 w-16"></td>
                      <td className="px-2 py-2 w-12"></td>
                      <td className="px-2 py-2 text-right font-semibold" style={{ color: primaryText }}>{careerPuntReturn.ret}</td>
                      <td className="px-2 py-2 text-right font-bold" style={{ color: primaryText }}>{careerPuntReturn.yds.toLocaleString()}</td>
                      <td className="px-2 py-2 text-right" style={{ color: primaryText, opacity: 0.9 }}>{calcAvg(careerPuntReturn.yds, careerPuntReturn.ret)}</td>
                      <td className="px-2 py-2 text-right font-bold" style={{ color: primaryText }}>{careerPuntReturn.td}</td>
                      <td className="px-2 py-2 text-right" style={{ color: primaryText, opacity: 0.9 }}>{careerPuntReturn.lng}</td>
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
      {(() => {
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
            className="rounded-xl p-4 sm:p-6"
            style={{ backgroundColor: teamColors.secondary, border: `2px solid ${teamColors.primary}` }}
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
              {/* Accolades from player.accolades array (excluding POW which comes from game data) */}
              {Object.entries(accoladesByType)
                .filter(([award]) => award !== 'confPOW' && award !== 'nationalPOW')
                .map(([award, years]) => {
                  const label = formatAwardName(award)
                  const sortedYears = [...years].sort((a, b) => b - a)
                  return (
                    <div key={award}>
                      <span className="font-semibold" style={{ color: secondaryText }}>{label}</span>
                      <span style={{ color: secondaryText, opacity: 0.7 }}> ({sortedYears.join(', ')})</span>
                    </div>
                  )
                })}
              {/* All-Americans */}
              {Object.entries(allAmericansByDesignation).map(([designation, years]) => {
                const label = designation === 'first' ? 'All-American (1st Team)' :
                              designation === 'second' ? 'All-American (2nd Team)' :
                              designation === 'freshman' ? 'Freshman All-American' :
                              `All-American (${designation})`
                const sortedYears = [...years].sort((a, b) => b - a)
                return (
                  <div key={`aa-${designation}`}>
                    <span className="font-semibold" style={{ color: secondaryText }}>{label}</span>
                    <span style={{ color: secondaryText, opacity: 0.7 }}> ({sortedYears.join(', ')})</span>
                  </div>
                )
              })}
              {/* All-Conference */}
              {Object.entries(allConferenceByDesignation).map(([designation, years]) => {
                const label = designation === 'first' ? 'All-Conference (1st Team)' :
                              designation === 'second' ? 'All-Conference (2nd Team)' :
                              designation === 'freshman' ? 'Freshman All-Conference' :
                              `All-Conference (${designation})`
                const sortedYears = [...years].sort((a, b) => b - a)
                return (
                  <div key={`ac-${designation}`}>
                    <span className="font-semibold" style={{ color: secondaryText }}>{label}</span>
                    <span style={{ color: secondaryText, opacity: 0.7 }}> ({sortedYears.join(', ')})</span>
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
          className="rounded-xl p-4 sm:p-6"
          style={{ backgroundColor: teamColors.secondary, border: `2px solid ${teamColors.primary}` }}
        >
          <h2 className="text-xl font-bold mb-4" style={{ color: secondaryText }}>Notes & Media</h2>
          {player.notes && (
            <div className="mb-4">
              <div className="p-4 rounded-lg whitespace-pre-wrap" style={{ backgroundColor: teamColors.primary, color: primaryText }}>
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
                  if (url.includes('youtube.com/watch')) {
                    const urlParams = new URLSearchParams(url.split('?')[1])
                    videoId = urlParams.get('v')
                  } else if (url.includes('youtu.be/')) {
                    videoId = url.split('youtu.be/')[1]?.split('?')[0]
                  } else if (url.includes('youtube.com/embed/')) {
                    videoId = url.split('youtube.com/embed/')[1]?.split('?')[0]
                  }

                  if (!videoId) return null

                  return (
                    <div key={index} className="rounded-lg overflow-hidden">
                      {link.title && (
                        <div className="px-3 py-2 text-sm font-semibold" style={{ backgroundColor: teamColors.primary, color: primaryText }}>
                          {link.title}
                        </div>
                      )}
                      <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                        <iframe
                          className="absolute top-0 left-0 w-full h-full"
                          src={`https://www.youtube.com/embed/${videoId}`}
                          title={link.title || 'YouTube video'}
                          frameBorder="0"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
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
                        <div className="px-3 py-2 text-sm font-semibold" style={{ backgroundColor: teamColors.primary, color: primaryText }}>
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
                          <div className="px-3 py-2 text-sm font-semibold" style={{ backgroundColor: teamColors.primary, color: primaryText }}>
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
                          <div className="px-3 py-2 text-sm font-semibold" style={{ backgroundColor: teamColors.primary, color: primaryText }}>
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
                        <div className="px-3 py-2 text-sm font-semibold" style={{ backgroundColor: teamColors.primary, color: primaryText }}>
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
                        <div className="px-3 py-2 text-sm font-semibold" style={{ backgroundColor: teamColors.primary, color: primaryText }}>
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
                        <div className="px-3 py-2 text-sm font-semibold" style={{ backgroundColor: teamColors.primary, color: primaryText }}>
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
                    style={{ backgroundColor: teamColors.primary, color: primaryText }}
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

      {/* Edit Modal */}
      <PlayerEditModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        player={player}
        teamColors={teamColors}
        onSave={handlePlayerSave}
        onSyncAllPlayers={(year) => syncAllPlayersStats(dynasty.id, year)}
        defaultSchool={dynasty.teamName}
        dynasty={dynasty}
      />

      {/* Accolade Games Modal */}
      {showAccoladeModal && (
        <div
          className="fixed top-0 left-0 right-0 bottom-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4"
          style={{ margin: 0 }}
          onClick={() => setShowAccoladeModal(false)}
        >
          <div
            className="rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto"
            style={{ backgroundColor: teamColors.secondary, border: `2px solid ${teamColors.primary}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="p-4 border-b sticky top-0"
              style={{ backgroundColor: teamColors.primary, borderColor: teamColors.primary }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg sm:text-xl font-bold" style={{ color: primaryText }}>
                    {accoladeType === 'confPOW' ? 'Conference Player of the Week' : 'National Player of the Week'}
                  </h3>
                  <p className="text-sm font-semibold mt-0.5" style={{ color: primaryText, opacity: 0.9 }}>{player.name}</p>
                </div>
                <button onClick={() => setShowAccoladeModal(false)} className="hover:opacity-70" style={{ color: primaryText }}>
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

      {/* Game Log Modal */}
      {showGameLogModal && (
        <div
          className="fixed top-0 left-0 right-0 bottom-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4"
          style={{ margin: 0 }}
          onClick={() => setShowGameLogModal(false)}
        >
          <div
            className="rounded-xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col"
            style={{ backgroundColor: teamColors.secondary, border: `2px solid ${teamColors.primary}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="p-4 border-b flex-shrink-0"
              style={{ backgroundColor: teamColors.primary, borderColor: teamColors.primary }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg sm:text-xl font-bold" style={{ color: primaryText }}>
                    Game Log
                  </h3>
                  <p className="text-sm font-semibold mt-0.5" style={{ color: primaryText, opacity: 0.9 }}>
                    {player.name} - {playerGameLog.length} {playerGameLog.length === 1 ? 'Game' : 'Games'}
                  </p>
                </div>
                <button onClick={() => setShowGameLogModal(false)} className="hover:opacity-70" style={{ color: primaryText }}>
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
                    return `${num(stats.comp)}/${num(stats.attempts)}, ${num(stats.yards)} YDS, ${num(stats.tD)} TD, ${num(stats.iNT)} INT`
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

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4"
          style={{ margin: 0 }}
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className="rounded-xl shadow-xl max-w-md w-full p-6"
            style={{ backgroundColor: teamColors.secondary, border: `2px solid ${teamColors.primary}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)' }}>
                <svg className="w-6 h-6" fill="none" stroke="#ef4444" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold" style={{ color: secondaryText }}>Delete Player?</h3>
                <p className="text-sm" style={{ color: secondaryText, opacity: 0.7 }}>This action cannot be undone</p>
              </div>
            </div>

            <p className="mb-6" style={{ color: secondaryText, opacity: 0.9 }}>
              Are you sure you want to delete <strong style={{ color: secondaryText }}>{player.name}</strong>? All stats and data for this player will be permanently removed.
            </p>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 rounded-lg font-semibold transition-opacity hover:opacity-80"
                style={{ border: `1px solid ${teamColors.primary}`, color: teamColors.primary, backgroundColor: 'transparent' }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setIsDeleting(true)
                  try {
                    await deletePlayer(dynasty.id, player.pid)
                    navigate(`${pathPrefix}/roster`)
                  } catch (error) {
                    console.error('Failed to delete player:', error)
                    alert('Failed to delete player. Please try again.')
                  } finally {
                    setIsDeleting(false)
                    setShowDeleteConfirm(false)
                  }
                }}
                disabled={isDeleting}
                className="px-4 py-2 rounded-lg font-semibold transition-opacity"
                style={{ backgroundColor: '#EF4444', color: '#FFFFFF', opacity: isDeleting ? 0.7 : 1 }}
              >
                {isDeleting ? 'Deleting...' : 'Delete Player'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
