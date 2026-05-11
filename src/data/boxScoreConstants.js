// Box Score Stats Tab Configurations
import { TEAMS, getTidFromAbbr } from './teamRegistry'

export const STAT_TABS = {
  passing: {
    key: 'passing',
    title: 'Passing',
    headers: ['Player Name', 'Rtg', 'Comp', 'Att', 'Yards', 'TD', 'INT', 'Long'],
    rowCount: 8
  },
  rushing: {
    key: 'rushing',
    title: 'Rushing',
    headers: ['Player Name', 'Carries', 'Yards', 'TD', 'Fumbles', 'BT', 'YAC', '20+', 'Long'],
    rowCount: 20
  },
  receiving: {
    key: 'receiving',
    title: 'Receiving',
    headers: ['Player Name', 'Receptions', 'Yards', 'TD', 'RAC', 'Drops', 'Long'],
    rowCount: 25
  },
  blocking: {
    key: 'blocking',
    title: 'Blocking',
    headers: ['Player Name', 'Pancakes', 'Sacks Allowed'],
    rowCount: 20
  },
  defense: {
    key: 'defense',
    title: 'Defense',
    headers: ['Player Name', 'Solo', 'Assists', 'TFL', 'Sack', 'INT', 'INT Yards', 'INT Long', 'Deflections', 'FF', 'FR', 'Fumble Yards', 'Blocks', 'Safeties', 'TD'],
    rowCount: 40
  },
  kicking: {
    key: 'kicking',
    title: 'Kicking',
    headers: ['Player Name', 'FGM', 'FGA', 'FG Long', 'FG Block', 'XPM', 'XPA', 'XPB', 'FGA 29', 'FGM 29', 'FGA 39', 'FGM 39', 'FGA 49', 'FGM 49', 'FGA 50+', 'FGM 50+', 'Kickoffs', 'Touchbacks'],
    rowCount: 5
  },
  punting: {
    key: 'punting',
    title: 'Punting',
    headers: ['Player Name', 'Punts', 'Yards', 'Net Yards', 'Block', 'In20', 'TB', 'Long'],
    rowCount: 5
  },
  kickReturn: {
    key: 'kickReturn',
    title: 'Kick Return',
    headers: ['Player Name', 'KR', 'Yards', 'Long', 'TD'],
    rowCount: 10
  },
  puntReturn: {
    key: 'puntReturn',
    title: 'Punt Return',
    headers: ['Player Name', 'PR', 'Yards', 'Long', 'TD'],
    rowCount: 10
  }
}

// Order of tabs in the sheet
export const STAT_TAB_ORDER = [
  'passing',
  'rushing',
  'receiving',
  'blocking',
  'defense',
  'kicking',
  'punting',
  'kickReturn',
  'puntReturn'
]

// AI All-In-One tab — appended after the 9 individual tabs.
// One paste fills the whole tab (banners + headers + data) at A1.
export const AI_UNIFIED_TAB = { key: 'aiAllInOne', title: 'AI All-In-One' }

// Compute the unified-tab layout: per-section banner row, header row, and
// inclusive 1-indexed data row range, plus the total row count and the max
// column width across all sections.
//
// Returns:
//   { sections: [{ key, title, headers, rowCount, bannerRow, headerRow, dataStart, dataEnd }],
//     totalRows: <int>,
//     maxCols:   <int> }
export function computeUnifiedTabLayout() {
  const sections = []
  let row = 1
  STAT_TAB_ORDER.forEach((key, idx) => {
    const tab = STAT_TABS[key]
    const bannerRow = row
    const headerRow = row + 1
    const dataStart = row + 2
    const dataEnd = dataStart + tab.rowCount - 1
    sections.push({
      key,
      title: tab.title,
      headers: tab.headers,
      rowCount: tab.rowCount,
      bannerRow,
      headerRow,
      dataStart,
      dataEnd,
    })
    row = dataEnd + 1
    if (idx < STAT_TAB_ORDER.length - 1) row += 1 // separator blank row
  })
  const maxCols = Math.max(...STAT_TAB_ORDER.map(k => STAT_TABS[k].headers.length))
  return { sections, totalRows: row - 1, maxCols }
}

// Scoring Summary / Plays Entry configuration.
//
// One sheet serves both use cases:
//   • Scoring-only entry — user fills only cols A-I, the legacy 9-col
//     shape. Existing dynasties' sheets work unchanged with this subset.
//   • Full play-by-play entry — user (or the all-plays AI prompt) fills
//     all 15 cols across up to 300 rows.
//
// The backend stores whatever the user filled per row. There is no
// "mode" — the display layer filters by which columns are populated
// to decide what to show ("Scores Only" checkbox vs. full PBP view).
//
// Cols J-O are the play-by-play extension. They're empty for users
// who only enter scoring data; the existing display code reads cols
// A-I and ignores the rest.
export const SCORING_SUMMARY = {
  title: 'Scoring Summary',
  headers: [
    // Cols A-I — legacy 9-col scoring summary shape. KEEP THESE
    // INDICES STABLE. Existing dynasties' data and the existing
    // display code in Game.jsx assume these positions.
    'Team',         // A
    'Scorer',       // B
    'Passer',       // C
    'Yards',        // D
    'Score Type',   // E
    'PAT Result',   // F
    'Quarter',      // G
    'Time Left',    // H
    'Video Link',   // I
    // Cols J-O — play-by-play extension. Optional. Filled by the
    // all-plays AI prompt; left blank by scoring-only users.
    'Down',         // J — 1 / 2 / 3 / 4 (blank for kickoffs, PATs)
    'Distance',     // K — yards-to-go, or "G" for goal
    'Field Pos',    // L — e.g. "LOU 7" or "UK 39" (descriptive yard line)
    'Play Type',    // M — Rush / Pass Comp / Pass Inc / etc.
    'Outcome',      // N — TD / 1st Down / Turnover / Incomplete / etc.
    'Notes',        // O — freeform
  ],
  rowCount: 300,
}

// Score type dropdown options (col E)
export const SCORE_TYPES = [
  'Rushing TD',
  'Passing TD',
  'Field Goal',
  'Safety',
  'Kick Return TD',
  'Punt Return TD',
  'INT Return TD',
  'Fumble Return TD',
  'Blocked Punt/FG TD'
]

// PAT Result dropdown options (col F — for after touchdowns)
export const PAT_RESULTS = [
  '',  // Empty option for non-TD plays (FG, Safety)
  'Made XP',
  'Missed XP',
  'Blocked XP',
  'Converted 2PT',
  'Failed 2PT'
]

// Quarter dropdown options (col G)
export const QUARTERS = ['1', '2', '3', '4', 'OT', '2OT', '3OT', '4OT']

// Down dropdown options (col J — for play-by-play rows). Empty
// string is the default for plays where down doesn't apply (PATs,
// kickoffs).
export const DOWNS = ['', '1', '2', '3', '4']

// Play Type dropdown options (col M — for play-by-play rows).
// Empty default lets scoring-only rows leave it blank.
export const PLAY_TYPES = [
  '',
  'Rush',
  'Pass Complete',
  'Pass Incomplete',
  'Pass Sack',
  'Punt',
  'Field Goal',
  'Kickoff',
  'PAT',
  'Penalty',
  'Other',
]

// Outcome dropdown options (col N — for play-by-play rows). Empty
// default lets scoring-only rows leave it blank.
export const OUTCOMES = [
  '',
  'TD',
  'FG Made',
  'FG Missed',
  '1st Down',
  'Turnover',
  'INT',
  'Fumble Lost',
  'Sack',
  'Incomplete',
  'No Gain',
  'Out of Bounds',
  'Touchback',
  'Penalty',
  'Safety',
]

// Helper to get all stat tabs as array
export const getStatTabsArray = () => STAT_TAB_ORDER.map(key => STAT_TABS[key])

// Position groupings for stat generation
const POSITION_GROUPS = {
  qb: ['QB'],
  rb: ['RB', 'FB'],
  wr: ['WR'],
  te: ['TE'],
  ol: ['LT', 'LG', 'C', 'RG', 'RT', 'OL'],
  dl: ['LE', 'RE', 'DT', 'DE', 'DL'],
  lb: ['LOLB', 'MLB', 'ROLB', 'LB'],
  db: ['CB', 'FS', 'SS', 'DB', 'S'],
  k: ['K'],
  p: ['P']
}

// Helper to check if player matches position group
const matchesPosition = (playerPos, group) => {
  if (!playerPos) return false
  const pos = playerPos.toUpperCase()
  return POSITION_GROUPS[group]?.some(p => pos === p || pos.includes(p))
}

// Get players by position group
const getPlayersByPosition = (players, group) => {
  return players.filter(p => matchesPosition(p.position, group))
}

// Random number helper
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

// Generate random player stats based on position and game context
// Note: year parameter is optional for backwards compatibility, but recommended for proper team filtering.
// dynastyTeams (dynasty.teams) lets a teambuilder team's renamed abbr resolve
// to the correct tid — without it the user's TB roster won't be found because
// getTidFromAbbr only checks the static FBS map.
export const generateRandomBoxScore = (players, teamScore, opponentScore, userTeamAbbr, opponentAbbr, year, dynastyTeams = null) => {
  if (!players || players.length === 0) {
    return { home: {}, away: {}, scoringSummary: [] }
  }

  // Convert userTeamAbbr to tid for comparison (handles both tid and abbr input)
  const userTeamTid = typeof userTeamAbbr === 'number' ? userTeamAbbr : getTidFromAbbr(userTeamAbbr, dynastyTeams)

  // Helper to check if a team value matches user team (handles both tid and abbr)
  const matchesUserTeam = (teamValue) => {
    if (!teamValue) return false
    if (typeof teamValue === 'number') return teamValue === userTeamTid
    // String comparison - check both as abbr match and by converting to tid
    if (teamValue === userTeamAbbr) return true
    const valueTid = getTidFromAbbr(teamValue, dynastyTeams)
    return valueTid && valueTid === userTeamTid
  }

  // Filter active players using teamsByYear (preferred) or legacy team field
  const activePlayers = players.filter(p => {
    if (p.isHonorOnly) return false
    // Use teamsByYear if year is provided (preferred)
    if (year && p.teamsByYear) {
      return matchesUserTeam(p.teamsByYear[year])
    }
    // Fallback: use team field for legacy data
    return matchesUserTeam(p.team)
  })

  // Get players by position
  const qbs = getPlayersByPosition(activePlayers, 'qb')
  const rbs = getPlayersByPosition(activePlayers, 'rb')
  const wrs = getPlayersByPosition(activePlayers, 'wr')
  const tes = getPlayersByPosition(activePlayers, 'te')
  const ols = getPlayersByPosition(activePlayers, 'ol')
  const dls = getPlayersByPosition(activePlayers, 'dl')
  const lbs = getPlayersByPosition(activePlayers, 'lb')
  const dbs = getPlayersByPosition(activePlayers, 'db')
  const ks = getPlayersByPosition(activePlayers, 'k')
  const ps = getPlayersByPosition(activePlayers, 'p')

  // Calculate game context (higher scoring = more yards)
  const totalPoints = teamScore + opponentScore
  const yardMultiplier = Math.max(0.7, Math.min(1.5, totalPoints / 50))

  // Generate passing stats
  const passing = []
  if (qbs.length > 0) {
    const mainQB = qbs[0]
    const passingYards = Math.round(rand(180, 350) * yardMultiplier)
    const completions = rand(15, 30)
    const attempts = completions + rand(5, 15)
    const passingTDs = Math.floor(teamScore / 10) + rand(0, 2)
    const ints = rand(0, 2)
    const longPass = rand(25, 65)
    const sacks = rand(0, 4)
    const qbRating = Math.round((completions / attempts * 100 + passingTDs * 20 - ints * 25 + passingYards / 10) / 2)

    passing.push({
      playerName: mainQB.name,
      qBRating: Math.min(158.3, Math.max(0, qbRating)).toFixed(1),
      yards: passingYards,
      tD: passingTDs,
      iNT: ints,
      long: longPass,
      sacks: sacks,
      comp: completions,
      attempts: attempts
    })
  }

  // Generate rushing stats
  const rushing = []
  const rushingCandidates = [...rbs, ...qbs.slice(0, 1), ...wrs.slice(0, 1)].filter(Boolean)
  let remainingRushYards = Math.round(rand(100, 200) * yardMultiplier)
  const rushingTDs = Math.max(0, Math.floor(teamScore / 14) - (passing[0]?.tD || 0) + rand(-1, 1))

  rushingCandidates.slice(0, 4).forEach((player, idx) => {
    const isMainBack = idx === 0
    const carries = isMainBack ? rand(15, 25) : rand(3, 10)
    const yards = isMainBack ? Math.round(remainingRushYards * 0.6) : Math.round(remainingRushYards * rand(10, 25) / 100)
    remainingRushYards -= yards
    const tds = isMainBack && rushingTDs > 0 ? rand(0, Math.min(2, rushingTDs)) : 0

    rushing.push({
      playerName: player.name,
      carries: carries,
      yards: Math.max(yards, -5),
      tD: tds,
      fumbles: rand(0, 1) === 1 && Math.random() > 0.8 ? 1 : 0,
      brokenTackles: rand(0, 5),
      yAC: rand(10, 40),
      long: rand(5, Math.max(10, yards / 2)),
      '20+': yards > 60 ? rand(1, 2) : 0
    })
  })

  // Generate receiving stats
  const receiving = []
  const receivers = [...wrs, ...tes, ...rbs.slice(0, 1)].filter(Boolean)
  let remainingRecYards = passing[0]?.yards || rand(150, 280)
  const passAttempts = passing[0]?.comp || rand(18, 28)
  let remainingReceptions = passAttempts

  receivers.slice(0, 6).forEach((player, idx) => {
    const isPrimary = idx < 2
    const receptions = isPrimary ? rand(4, 8) : rand(1, 4)
    if (remainingReceptions <= 0) return
    const actualReceptions = Math.min(receptions, remainingReceptions)
    remainingReceptions -= actualReceptions

    const yards = isPrimary ? Math.round(remainingRecYards * rand(25, 40) / 100) : Math.round(remainingRecYards * rand(8, 20) / 100)
    remainingRecYards = Math.max(0, remainingRecYards - yards)

    receiving.push({
      playerName: player.name,
      receptions: actualReceptions,
      yards: yards,
      tD: isPrimary && Math.random() > 0.5 ? rand(0, 2) : 0,
      rAC: rand(10, 50),
      long: rand(10, Math.max(15, yards / 2)),
      drops: rand(0, 1)
    })
  })

  // Generate blocking stats
  const blocking = []
  ols.slice(0, 5).forEach(player => {
    blocking.push({
      playerName: player.name,
      sacksAllowed: rand(0, 2),
      pancakes: rand(0, 4)
    })
  })

  // Generate defense stats
  const defense = []
  const defenders = [...lbs, ...dls, ...dbs].filter(Boolean)
  defenders.slice(0, 11).forEach((player, idx) => {
    const isLB = matchesPosition(player.position, 'lb')
    const isDL = matchesPosition(player.position, 'dl')
    const isDB = matchesPosition(player.position, 'db')

    defense.push({
      playerName: player.name,
      solo: isLB ? rand(4, 10) : isDL ? rand(2, 6) : rand(2, 5),
      assists: rand(1, 5),
      tFL: isDL || isLB ? rand(0, 3) : 0,
      sack: isDL ? rand(0, 2) : isLB ? rand(0, 1) : 0,
      iNT: isDB && Math.random() > 0.8 ? 1 : 0,
      iNTYards: 0,
      iNTLong: 0,
      deflections: isDB ? rand(0, 3) : rand(0, 1),
      fF: rand(0, 1) === 1 && Math.random() > 0.85 ? 1 : 0,
      fR: rand(0, 1) === 1 && Math.random() > 0.9 ? 1 : 0,
      fumbleYards: 0,
      blocks: 0,
      safeties: 0,
      tD: 0
    })
  })

  // Generate kicking stats
  const kicking = []
  if (ks.length > 0) {
    const fgAttempts = rand(1, 4)
    const fgMade = rand(0, fgAttempts)
    const xpAttempts = Math.floor(teamScore / 7)
    const xpMade = Math.max(0, xpAttempts - rand(0, 1))

    kicking.push({
      playerName: ks[0].name,
      fGM: fgMade,
      fGA: fgAttempts,
      fGLong: fgMade > 0 ? rand(25, 52) : 0,
      fGBlock: 0,
      xPM: xpMade,
      xPA: xpAttempts,
      xPB: 0,
      fGM29: 0, fGA29: 0, fGM39: 0, fGA39: 0, fGM49: 0, fGA49: 0, 'fGM50+': 0, 'fGA50+': 0,
      kickoffs: Math.ceil(teamScore / 7) + 1,
      touchbacks: rand(2, 6)
    })
  }

  // Generate punting stats
  const punting = []
  if (ps.length > 0) {
    const puntCount = rand(2, 6)
    const totalYards = puntCount * rand(38, 48)

    punting.push({
      playerName: ps[0].name,
      punts: puntCount,
      yards: totalYards,
      netYards: totalYards - rand(20, 60),
      block: 0,
      in20: rand(0, 3),
      tB: rand(0, 1),
      long: rand(45, 62)
    })
  }

  // Generate kick return stats
  const kickReturn = []
  const returners = [...wrs.slice(0, 1), ...dbs.slice(0, 1), ...rbs.slice(0, 1)].filter(Boolean)
  returners.slice(0, 2).forEach(player => {
    const returns = rand(1, 3)
    kickReturn.push({
      playerName: player.name,
      kR: returns,
      yards: returns * rand(18, 28),
      tD: 0,
      long: rand(20, 45)
    })
  })

  // Generate punt return stats
  const puntReturn = []
  const puntReturners = [...wrs.slice(0, 1), ...dbs.slice(0, 1)].filter(Boolean)
  puntReturners.slice(0, 2).forEach(player => {
    const returns = rand(1, 4)
    puntReturn.push({
      playerName: player.name,
      pR: returns,
      yards: returns * rand(5, 15),
      tD: 0,
      long: rand(8, 25)
    })
  })

  // Generate scoring summary that matches the actual score
  const scoringSummary = generateScoringSummary(
    teamScore,
    opponentScore,
    userTeamAbbr,
    opponentAbbr,
    { passing, rushing, receiving, kicking }
  )

  return {
    home: {
      passing,
      rushing,
      receiving,
      blocking,
      defense,
      kicking,
      punting,
      kickReturn,
      puntReturn
    },
    away: {}, // Opponent stats left empty (user can fill in if desired)
    scoringSummary
  }
}

// Generate scoring plays that add up to the actual score
const generateScoringSummary = (teamScore, opponentScore, userTeamAbbr, opponentAbbr, stats) => {
  const plays = []
  let remainingTeamScore = teamScore
  let remainingOppScore = opponentScore

  const quarters = ['1', '2', '3', '4']
  const generateTime = () => `${rand(0, 14)}:${rand(10, 59).toString().padStart(2, '0')}`

  // Get player names from stats for realistic scorers
  const passers = stats.passing?.map(p => p.playerName) || ['QB']
  const rushers = stats.rushing?.map(p => p.playerName) || ['RB']
  const receivers = stats.receiving?.map(p => p.playerName) || ['WR']
  const kickers = stats.kicking?.map(p => p.playerName) || ['K']

  // Generate team scoring plays
  while (remainingTeamScore > 0) {
    const quarter = quarters[rand(0, 3)]

    if (remainingTeamScore >= 7 && Math.random() > 0.3) {
      // Touchdown + XP (7 points)
      const isTDPass = Math.random() > 0.4
      const tdYards = isTDPass ? rand(10, 65) : rand(1, 45)
      plays.push({
        team: userTeamAbbr,
        scorer: isTDPass ? receivers[rand(0, Math.min(2, receivers.length - 1))] : rushers[rand(0, Math.min(1, rushers.length - 1))],
        passer: isTDPass ? passers[0] : '',
        yards: tdYards,
        scoreType: isTDPass ? 'Passing TD' : 'Rushing TD',
        patResult: 'Made XP',
        quarter,
        timeLeft: generateTime()
      })
      remainingTeamScore -= 7
    } else if (remainingTeamScore >= 8 && Math.random() > 0.8) {
      // Touchdown + 2PT conversion (8 points)
      const isTDPass = Math.random() > 0.4
      const tdYards = isTDPass ? rand(10, 65) : rand(1, 45)
      plays.push({
        team: userTeamAbbr,
        scorer: isTDPass ? receivers[rand(0, Math.min(2, receivers.length - 1))] : rushers[rand(0, Math.min(1, rushers.length - 1))],
        passer: isTDPass ? passers[0] : '',
        yards: tdYards,
        scoreType: isTDPass ? 'Passing TD' : 'Rushing TD',
        patResult: 'Converted 2PT',
        quarter,
        timeLeft: generateTime()
      })
      remainingTeamScore -= 8
    } else if (remainingTeamScore >= 6) {
      // TD no XP (missed or failed 2PT)
      const isTDPass = Math.random() > 0.5
      const tdYards = isTDPass ? rand(10, 65) : rand(1, 45)
      const patFailed = Math.random() > 0.5 ? 'Missed XP' : 'Failed 2PT'
      plays.push({
        team: userTeamAbbr,
        scorer: isTDPass ? receivers[rand(0, Math.min(2, receivers.length - 1))] : rushers[rand(0, Math.min(1, rushers.length - 1))],
        passer: isTDPass ? passers[0] : '',
        yards: tdYards,
        scoreType: isTDPass ? 'Passing TD' : 'Rushing TD',
        patResult: patFailed,
        quarter,
        timeLeft: generateTime()
      })
      remainingTeamScore -= 6
    } else if (remainingTeamScore >= 3) {
      // Field goal
      plays.push({
        team: userTeamAbbr,
        scorer: kickers[0] || 'K',
        passer: '',
        yards: rand(22, 52),
        scoreType: 'Field Goal',
        patResult: '',
        quarter,
        timeLeft: generateTime()
      })
      remainingTeamScore -= 3
    } else if (remainingTeamScore === 2) {
      // Safety
      plays.push({
        team: userTeamAbbr,
        scorer: 'Defense',
        passer: '',
        yards: '',
        scoreType: 'Safety',
        patResult: '',
        quarter,
        timeLeft: generateTime()
      })
      remainingTeamScore -= 2
    } else {
      break
    }
  }

  // Generate opponent scoring plays (generic names)
  while (remainingOppScore > 0) {
    const quarter = quarters[rand(0, 3)]

    if (remainingOppScore >= 7 && Math.random() > 0.3) {
      plays.push({
        team: opponentAbbr,
        scorer: 'Opponent WR',
        passer: 'Opponent QB',
        yards: rand(10, 65),
        scoreType: 'Passing TD',
        patResult: 'Made XP',
        quarter,
        timeLeft: generateTime()
      })
      remainingOppScore -= 7
    } else if (remainingOppScore >= 6) {
      plays.push({
        team: opponentAbbr,
        scorer: 'Opponent RB',
        passer: '',
        yards: rand(1, 40),
        scoreType: 'Rushing TD',
        patResult: 'Missed XP',
        quarter,
        timeLeft: generateTime()
      })
      remainingOppScore -= 6
    } else if (remainingOppScore >= 3) {
      plays.push({
        team: opponentAbbr,
        scorer: 'Opponent K',
        passer: '',
        yards: rand(22, 52),
        scoreType: 'Field Goal',
        patResult: '',
        quarter,
        timeLeft: generateTime()
      })
      remainingOppScore -= 3
    } else if (remainingOppScore === 2) {
      plays.push({
        team: opponentAbbr,
        scorer: 'Defense',
        passer: '',
        yards: '',
        scoreType: 'Safety',
        patResult: '',
        quarter,
        timeLeft: generateTime()
      })
      remainingOppScore -= 2
    } else {
      break
    }
  }

  // Sort by quarter and time (roughly)
  plays.sort((a, b) => {
    const qA = parseInt(a.quarter) || 5
    const qB = parseInt(b.quarter) || 5
    return qA - qB
  })

  return plays
}
