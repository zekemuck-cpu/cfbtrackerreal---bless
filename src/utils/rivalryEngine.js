/**
 * Rivalry Engine
 *
 * Computes dynamic rivalry scores between a user's team and every other
 * team in the dynasty based on shared history. Points accumulate from:
 *   - Same state                              +3  (one-time, static)
 *   - Regular season game played             +1  per game
 *   - Big game (bowl/CCG/CFP)                +4  per game
 *   - Annual matchup streak                  +3  per consecutive-year pair
 *   - Player transferred away            +1 / +3 (80+) / +5 (85+)  (all years)
 *   - Head coach departed to that school      +8  per departure (last 10 yr)
 *
 * Adapted to this app's data model:
 *   - Big games are detected via game.gameType OR the isBowlGame /
 *     isConferenceChampionship / isCFP* flags this app stores.
 *   - Transfers read the canonical movementByYear model (with legacy
 *     movements[] fallback) via rosterModel helpers.
 */

import { getAllMovements, getPlayerTid } from '../data/rosterModel'

// Abbreviation → US state name for all FBS teams in the registry.
// Exported so prompt builders and UI can do state lookups without
// re-importing the full engine computation. Used for the "same state" bonus.
export const TEAM_STATE = {
  // Alabama
  BAMA: 'Alabama', AUB: 'Alabama', UAB: 'Alabama', TROY: 'Alabama', USA: 'Alabama', JKST: 'Alabama',
  // Arizona
  ARIZ: 'Arizona', ASU: 'Arizona',
  // Arkansas
  ARK: 'Arkansas', ARST: 'Arkansas',
  // California
  USC: 'California', UCLA: 'California', CAL: 'California', STAN: 'California',
  SJSU: 'California', SDSU: 'California', FRES: 'California',
  // Colorado
  COLO: 'Colorado', CSU: 'Colorado', AFA: 'Colorado',
  // Connecticut
  CONN: 'Connecticut',
  // Delaware
  DEL: 'Delaware',
  // Florida
  FLA: 'Florida', FSU: 'Florida', MIA: 'Florida', UCF: 'Florida',
  USF: 'Florida', FIU: 'Florida', FAU: 'Florida',
  // Georgia
  UGA: 'Georgia', GT: 'Georgia', GSU: 'Georgia', GASO: 'Georgia', KENN: 'Georgia',
  // Hawaii
  HAW: 'Hawaii',
  // Idaho
  BOIS: 'Idaho',
  // Illinois
  ILL: 'Illinois', NU: 'Illinois', NIU: 'Illinois',
  // Indiana
  IU: 'Indiana', PUR: 'Indiana', ND: 'Indiana', BALL: 'Indiana',
  // Iowa
  IOWA: 'Iowa', ISU: 'Iowa',
  // Kansas
  KU: 'Kansas', KSU: 'Kansas',
  // Kentucky
  UK: 'Kentucky', LOU: 'Kentucky', WKU: 'Kentucky',
  // Louisiana
  LSU: 'Louisiana', TULN: 'Louisiana', UL: 'Louisiana', ULM: 'Louisiana', LT: 'Louisiana',
  // Maryland
  UMD: 'Maryland', NAVY: 'Maryland',
  // Massachusetts
  MASS: 'Massachusetts', BC: 'Massachusetts',
  // Michigan
  MICH: 'Michigan', MSU: 'Michigan', CMU: 'Michigan', EMU: 'Michigan', WMU: 'Michigan',
  // Minnesota
  MINN: 'Minnesota',
  // Mississippi
  MISS: 'Mississippi', MSST: 'Mississippi', USM: 'Mississippi',
  // Missouri
  MIZ: 'Missouri', MZST: 'Missouri',
  // Nebraska
  NEB: 'Nebraska',
  // Nevada
  NEV: 'Nevada', UNLV: 'Nevada',
  // New Mexico
  UNM: 'New Mexico', NMSU: 'New Mexico',
  // New York
  BUFF: 'New York', SYR: 'New York', ARMY: 'New York',
  // North Carolina
  UNC: 'North Carolina', NCST: 'North Carolina', DUKE: 'North Carolina',
  WAKE: 'North Carolina', APP: 'North Carolina', ECU: 'North Carolina', CHAR: 'North Carolina',
  // Ohio
  OSU: 'Ohio', UC: 'Ohio', OHIO: 'Ohio', TOL: 'Ohio',
  BGSU: 'Ohio', AKR: 'Ohio', 'M-OH': 'Ohio', KENT: 'Ohio',
  // Oklahoma
  OU: 'Oklahoma', OKST: 'Oklahoma', TLSA: 'Oklahoma',
  // Oregon
  ORE: 'Oregon', ORST: 'Oregon',
  // Pennsylvania
  PSU: 'Pennsylvania', PITT: 'Pennsylvania', TEM: 'Pennsylvania',
  // South Carolina
  SCAR: 'South Carolina', CCU: 'South Carolina',
  // Tennessee
  UT: 'Tennessee', VAN: 'Tennessee', MEM: 'Tennessee', MTSU: 'Tennessee',
  // Texas
  TEX: 'Texas', TAMU: 'Texas', TCU: 'Texas', BU: 'Texas',
  TTU: 'Texas', SMU: 'Texas', RICE: 'Texas', UTEP: 'Texas',
  UTSA: 'Texas', TXST: 'Texas', UNT: 'Texas', UH: 'Texas', SHSU: 'Texas',
  // Utah
  UTAH: 'Utah', USU: 'Utah',
  // Virginia
  UVA: 'Virginia', VT: 'Virginia', LIB: 'Virginia', ODU: 'Virginia', JMU: 'Virginia',
  // Washington
  WASH: 'Washington', WSU: 'Washington',
  // West Virginia
  WVU: 'West Virginia', MRSH: 'West Virginia',
  // Wisconsin
  WIS: 'Wisconsin',
  // Wyoming
  WYO: 'Wyoming',
}

// Known real-world FBS rivalry pairs.
// [team1Abbr, team2Abbr, rivalryName, trophyName | null]
export const KNOWN_RIVAL_PAIRS = [
  ['BAMA', 'AUB',  'Iron Bowl',                              null],
  ['MISS', 'MSST', 'Egg Bowl',                               'Golden Egg Trophy'],
  ['GT',   'UGA',  'Clean, Old-Fashioned Hate',              null],
  ['CLEM', 'SCAR', 'Palmetto Bowl',                          null],
  ['FLA',  'UGA',  "World's Largest Outdoor Cocktail Party", null],
  ['FLA',  'FSU',  'Florida–Florida State Rivalry',          null],
  ['FSU',  'MIA',  'Florida State–Miami Rivalry',            null],
  ['FLA',  'MIA',  'Florida–Miami Rivalry',                  null],
  ['TEX',  'OU',   'Red River Rivalry',                      'Golden Hat Trophy'],
  ['TEX',  'TAMU', 'Lone Star Showdown',                     null],
  ['OU',   'OKST', 'Bedlam',                                 null],
  ['UT',   'VAN',  'Tennessee–Vanderbilt Rivalry',           null],
  ['UT',   'BAMA', 'Third Saturday in October',              null],
  ['LSU',  'ARK',  'Battle for the Golden Boot',             'Golden Boot Trophy'],
  ['LSU',  'BAMA', 'LSU–Alabama Rivalry',                    null],
  ['UK',   'LOU',  "Governor's Cup",                         "Governor's Cup"],
  ['UK',   'UT',   'Kentucky–Tennessee Rivalry',             null],
  ['MIZ',  'ARK',  'Battle Line Rivalry',                    null],
  ['OSU',  'MICH', 'The Game',                               null],
  ['MICH', 'MSU',  'Paul Bunyan Trophy Game',                'Paul Bunyan Trophy'],
  ['OSU',  'PSU',  'Ohio State–Penn State Rivalry',          null],
  ['NU',   'ILL',  'Land of Lincoln Trophy Game',            'Land of Lincoln Trophy'],
  ['IOWA', 'NEB',  'Heroes Trophy Game',                     'Heroes Trophy'],
  ['IOWA', 'WIS',  'Heartland Trophy Game',                  'Heartland Trophy'],
  ['IOWA', 'MINN', 'Floyd of Rosedale',                      'Floyd of Rosedale'],
  ['MINN', 'WIS',  "Paul Bunyan's Axe",                      "Paul Bunyan's Axe"],
  ['IOWA', 'ISU',  'Cy-Hawk Rivalry',                        'Cy-Hawk Trophy'],
  ['IU',   'PUR',  'Old Oaken Bucket Game',                  'Old Oaken Bucket'],
  ['PSU',  'MSU',  'Land Grant Trophy Game',                 'Land Grant Trophy'],
  ['UNC',  'NCST', 'Tobacco Road Rivalry',                   null],
  ['UNC',  'DUKE', 'UNC–Duke Rivalry',                       null],
  ['NCST', 'WAKE', 'NC State–Wake Forest Rivalry',           null],
  ['UVA',  'VT',   'Commonwealth Cup',                       'Commonwealth Cup'],
  ['STAN', 'CAL',  'Big Game',                               null],
  ['USC',  'UCLA', 'Victory Bell Game',                      'Victory Bell'],
  ['USC',  'ND',   'USC–Notre Dame Rivalry',                  null],
  ['ND',   'NAVY', 'Notre Dame–Navy Rivalry',                null],
  ['ARMY', 'NAVY', 'Army–Navy Game',                         null],
  ['UTAH', 'BYU',  'Holy War',                               null],
  ['ORE',  'ORST', 'Civil War',                              'Platypus Trophy'],
  ['WASH', 'WSU',  'Apple Cup',                              'Apple Cup'],
  ['AFA',  'ARMY', "Commander-in-Chief's Trophy",            "Commander-in-Chief's Trophy"],
  ['AFA',  'NAVY', "Commander-in-Chief's Trophy",            "Commander-in-Chief's Trophy"],
]

/**
 * Returns all known real-world rivals for a given team abbreviation.
 * Each entry is { rivalAbbr, name, trophyName }.
 */
export function getKnownRivalsForAbbr(abbr) {
  if (!abbr) return []
  const upper = abbr.toUpperCase()
  return KNOWN_RIVAL_PAIRS
    .filter(([a, b]) => a === upper || b === upper)
    .map(([a, b, name, trophyName]) => ({ rivalAbbr: a === upper ? b : a, name, trophyName: trophyName || null }))
}

// Points accumulate across the entire dynasty — no rolling cutoff for games.
// Transfers and coach departures use a shorter window since those grudges fade.
export const RIVALRY_FORM_THRESHOLD    = 30  // bar fills at 30 pts (takes many years)
export const RIVALRY_WATCH_THRESHOLD   = 8   // show in watch list at 8 pts
export const RIVALRY_DORMANT_YEARS     = 3   // years without a game → dormant
export const RIVALRY_NAME_YEARS        = 5   // years formed before name unlocks
export const RIVALRY_TROPHY_YEARS      = 10  // years formed before trophy unlocks
export const RIVALRY_TRANSFER_LOOKBACK = 12  // years back to count star transfers
export const RIVALRY_COACH_LOOKBACK    = 10  // years back to count coach departures

// A game is "big" when it's a bowl, conference championship, or playoff game.
// This app marks those with explicit boolean flags and/or a gameType string,
// so check both.
function isBigGame(game) {
  if (!game) return false
  if (game.gameType && game.gameType !== 'regular') return true
  return !!(
    game.isBowlGame || game.bowlName ||
    game.isConferenceChampionship ||
    game.isCFPChampionship || game.isCFPSemifinal ||
    game.isCFPQuarterfinal || game.isCFPFirstRound
  )
}

// A game counts only once it's actually been played. A scheduled/upcoming
// game sits at 0-0 and must not register as a meeting (or a tie).
function isPlayedGame(game) {
  if (!game) return false
  if (game.team1Score == null || game.team2Score == null) return false
  return !!(game.isPlayed || Number(game.team1Score) > 0 || Number(game.team2Score) > 0)
}

/**
 * Compute rivalry point scores for every other team relative to myTid.
 * Points build from the very first year of the dynasty with no rolling cutoff
 * on games — only transfers and coach departures have a lookback window.
 *
 * @param {object} dynasty  Full dynasty object
 * @param {number} myTid    The team we're computing from
 * @returns {{ [rivalTid]: { points: number, events: Array } }}
 */
export function computeRivalryScores(dynasty, myTid) {
  const myTidNum  = Number(myTid)
  const curYear   = dynasty.currentYear || 2025
  const scores    = {}

  function addPoints(rivalTid, pts, event) {
    const tid = Number(rivalTid)
    if (!tid || tid === myTidNum) return
    if (!scores[tid]) scores[tid] = { points: 0, events: [] }
    scores[tid].points += pts
    scores[tid].events.push({ ...event, points: pts })
  }

  const myAbbr  = dynasty.teams?.[myTidNum]?.abbr
  const myState = myAbbr ? TEAM_STATE[myAbbr] : null

  // ── 1. Same state (one-time, +3) ───────────────────────────────────────────
  if (myState) {
    Object.values(dynasty.teams || {}).forEach(team => {
      if (!team || Number(team.tid) === myTidNum) return
      if (TEAM_STATE[team.abbr] === myState) {
        addPoints(team.tid, 3, { type: 'same_state', description: 'Same state' })
      }
    })
  }

  // ── 2. Games played — ALL dynasty games, no time cutoff ───────────────────
  // +1 per regular season game, +4 per big game (bowl/CCG/CFP).
  ;(dynasty.games || []).forEach(game => {
    if (!isPlayedGame(game)) return
    const t1 = Number(game.team1Tid)
    const t2 = Number(game.team2Tid)
    if (t1 !== myTidNum && t2 !== myTidNum) return
    const opponentTid = t1 === myTidNum ? t2 : t1
    if (!opponentTid) return

    const big = isBigGame(game)
    addPoints(opponentTid, big ? 4 : 1, {
      type: big ? 'big_game' : 'played_games',
      year: game.year,
      description: big ? `Big game (${game.year})` : `Played (${game.year})`,
    })
  })

  // ── 3. Annual matchup bonus — +3 per consecutive year pair ──────────────────
  // Teams that play each other every single year earn a stacking bonus on top
  // of the base game point: each pair of back-to-back years awards +3.
  const gameYearsByOpponent = {}
  ;(dynasty.games || []).forEach(game => {
    if (!isPlayedGame(game)) return
    const t1 = Number(game.team1Tid)
    const t2 = Number(game.team2Tid)
    if (t1 !== myTidNum && t2 !== myTidNum) return
    const opponentTid = t1 === myTidNum ? t2 : t1
    if (!opponentTid) return
    if (!gameYearsByOpponent[opponentTid]) gameYearsByOpponent[opponentTid] = new Set()
    gameYearsByOpponent[opponentTid].add(Number(game.year))
  })
  Object.entries(gameYearsByOpponent).forEach(([opponentTid, yearsSet]) => {
    const years = [...yearsSet].sort((a, b) => a - b)
    for (let i = 1; i < years.length; i++) {
      if (years[i] === years[i - 1] + 1) {
        addPoints(Number(opponentTid), 3, {
          type: 'annual_matchup',
          year: years[i],
          description: `Annual matchup streak (${years[i]})`,
        })
      }
    }
  })

  // ── 4. Players transferred away — ALL years; +1, or +3 (80+) / +5 (85+) ──
  // Read the canonical movement model. A player leaves us for a rival when:
  //   • a departure (transfer_out) with a destination tid happens in a year
  //     the player was on our roster, OR
  //   • an arrival (transfer_in) whose fromTid is us — the destination is the
  //     team they landed on that year.
  ;(dynasty.players || []).forEach(player => {
    if (!player) return
    const movements = getAllMovements(player)
    Object.entries(movements).forEach(([yearKey, mv]) => {
      if (!mv) return
      const year = Number(yearKey)
      if (!Number.isFinite(year)) return

      let destTid = null
      if (mv.type === 'departure' && mv.departure === 'transfer_out' && mv.toTid != null) {
        // Player left their current team for mv.toTid. Confirm that team was us.
        const fromTid = Number(getPlayerTid(player, year, { currentYear: curYear }))
        if (fromTid === myTidNum) destTid = Number(mv.toTid)
      } else if (mv.type === 'arrival' && mv.arrival === 'transfer_in' && mv.fromTid != null) {
        // Player arrived FROM us — the destination is wherever they are now.
        if (Number(mv.fromTid) === myTidNum) {
          const landed = Number(getPlayerTid(player, year, { currentYear: curYear }))
          if (landed && landed !== myTidNum) destTid = landed
        }
      }
      if (!destTid || destTid === myTidNum) return

      const ovr = Number(
        player.overallByYear?.[year] ??
        player.overallByYear?.[year - 1] ??
        player.overall ?? 0
      )
      // Tiered: any transfer +1, 80+ +3, 85+ +5.
      const pts = ovr >= 85 ? 5 : ovr >= 80 ? 3 : 1

      addPoints(destTid, pts, {
        type: 'transfer_star',
        year,
        description: `${player.name || 'Player'}${player.position ? ` (${player.position})` : ''} transferred to them`,
      })
    })
  })

  // ── 5. Head coach departed to that school — last 10 yrs, +8 ──────────────
  const coachCutoff  = curYear - RIVALRY_COACH_LOOKBACK
  const coachHistory = dynasty.coachTeamByYear || {}
  Object.keys(coachHistory).map(Number).sort((a, b) => a - b).forEach(year => {
    if (year < coachCutoff) return
    const entry = coachHistory[year]
    if (!entry || Number(entry.tid) !== myTidNum) return
    const nextEntry = coachHistory[year + 1]
    if (!nextEntry) return
    const nextTid = Number(nextEntry.tid)
    if (nextTid !== myTidNum && nextTid > 0) {
      addPoints(nextTid, 8, {
        type: 'coach_departure',
        year: year + 1,
        description: `Head coach left for them (${year + 1})`,
      })
    }
  })

  return scores
}

/**
 * Every player (all years) who transferred from myTid to rivalTid — i.e. the
 * players behind the "transfer_star" rivalry points.
 * Returns [{ pid, name, position, year, ovr, pictureUrl }], newest first.
 */
export function getStarTransfersTo(dynasty, myTid, rivalTid) {
  const myTidNum    = Number(myTid)
  const rivalTidNum = Number(rivalTid)
  const curYear     = dynasty.currentYear || 2025
  const out         = []

  ;(dynasty.players || []).forEach(player => {
    if (!player) return
    const movements = getAllMovements(player)
    Object.entries(movements).forEach(([yearKey, mv]) => {
      if (!mv) return
      const year = Number(yearKey)
      if (!Number.isFinite(year)) return

      let destTid = null
      if (mv.type === 'departure' && mv.departure === 'transfer_out' && mv.toTid != null) {
        const fromTid = Number(getPlayerTid(player, year, { currentYear: curYear }))
        if (fromTid === myTidNum) destTid = Number(mv.toTid)
      } else if (mv.type === 'arrival' && mv.arrival === 'transfer_in' && mv.fromTid != null) {
        if (Number(mv.fromTid) === myTidNum) {
          const landed = Number(getPlayerTid(player, year, { currentYear: curYear }))
          if (landed && landed !== myTidNum) destTid = landed
        }
      }
      if (destTid !== rivalTidNum) return

      const ovr = Number(
        player.overallByYear?.[year] ??
        player.overallByYear?.[year - 1] ??
        player.overall ?? 0
      )

      out.push({
        pid: player.pid,
        name: player.name || 'Unknown player',
        position: player.position || '',
        year,
        ovr,
        pictureUrl: player.pictureUrl || null,
      })
    })
  })

  return out.sort((a, b) => b.year - a.year)
}

/**
 * Compute the all-time head-to-head series record between myTid and rivalTid.
 * Only counts finished games (both scores present).
 */
export function computeSeriesRecord(dynasty, myTid, rivalTid) {
  const myTidNum    = Number(myTid)
  const rivalTidNum = Number(rivalTid)

  const played = (dynasty.games || [])
    .filter(g => {
      if (!isPlayedGame(g)) return false
      const t1 = Number(g.team1Tid)
      const t2 = Number(g.team2Tid)
      return (
        (t1 === myTidNum && t2 === rivalTidNum) ||
        (t1 === rivalTidNum && t2 === myTidNum)
      )
    })
    .sort((a, b) => Number(a.year) - Number(b.year))

  let wins = 0
  let losses = 0
  let streak = 0
  let lastResult = null

  played.forEach(game => {
    const t1 = Number(game.team1Tid)
    const myScore    = t1 === myTidNum ? game.team1Score : game.team2Score
    const theirScore = t1 === myTidNum ? game.team2Score : game.team1Score

    if (Number(myScore) > Number(theirScore)) {
      wins++
      if (lastResult === 'W') streak++
      else { streak = 1; lastResult = 'W' }
    } else if (Number(theirScore) > Number(myScore)) {
      losses++
      if (lastResult === 'L') streak++
      else { streak = 1; lastResult = 'L' }
    }
  })

  const lastGame = played[played.length - 1]
  const lastPlayedYear = lastGame ? Number(lastGame.year) : null

  return { wins, losses, streak, lastResult, lastPlayedYear, gamesPlayed: played.length }
}

/**
 * Returns a human-readable label for a rivalry point event type.
 */
export function rivalryEventLabel(type) {
  switch (type) {
    case 'same_state':     return 'Same state'
    case 'played_games':   return 'Games played'
    case 'annual_matchup': return 'Annual matchup streak'
    case 'big_game':       return 'Big game (bowl/CCG/playoff)'
    case 'transfer_star':  return 'Player transferred away'
    case 'coach_departure':return 'Head coach left for them'
    default:               return type
  }
}

/**
 * Group events by type and sum their points.
 * Returns an array sorted by points descending.
 */
export function groupRivalryEvents(events) {
  const grouped = {}
  ;(events || []).forEach(e => {
    if (!grouped[e.type]) grouped[e.type] = { type: e.type, points: 0, count: 0 }
    grouped[e.type].points += e.points
    grouped[e.type].count  += 1
  })
  return Object.values(grouped).sort((a, b) => b.points - a.points)
}
