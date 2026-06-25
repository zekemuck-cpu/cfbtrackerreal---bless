import { useState, useMemo } from 'react'
import { getTeamConference } from '../data/conferenceTeams'
import { isFCSPlaceholderAbbr } from '../data/teamRegistry'
import { getCustomConferencesForYear } from '../context/DynastyContext'

// ─── Rounding ─────────────────────────────────────────────────────────────────

function roundToNearest5(n) {
  return Math.round(n / 5) * 5
}

// Sportsbook-clean futures rounding:
// <1000 → nearest 50 | 1000-5000 → nearest 100 | >5000 → nearest 500
function roundOddsToBook(ml) {
  if (ml >= 100000) return 100000
  const sign = ml < 0 ? -1 : 1
  const abs  = Math.abs(ml)
  let rounded
  if (abs < 1000)       rounded = Math.round(abs / 50)  * 50
  else if (abs <= 5000) rounded = Math.round(abs / 100) * 100
  else                  rounded = Math.round(abs / 500) * 500
  rounded = Math.max(110, rounded)
  return sign * rounded
}

// ─── Team data helpers ────────────────────────────────────────────────────────

function getTeamAbbr(dynasty, tid) {
  if (!tid) return 'TBD'
  const t = dynasty.teams?.[tid] || dynasty.teams?.[String(tid)]
  return t?.abbr || `T${tid}`
}

function isFCSTeam(dynasty, tid) {
  if (!tid) return false
  const abbr = getTeamAbbr(dynasty, tid)
  return isFCSPlaceholderAbbr(abbr)
}

function getTeamOverall(dynasty, tid, year) {
  if (!tid) return null
  const t = dynasty.teams?.[tid] || dynasty.teams?.[String(tid)]
  const byYear = t?.byYear
  if (!byYear) return null
  const yr = byYear[Number(year)] || byYear[String(year)]
  return yr?.teamRatings?.overall || null
}

function calcTeamStats(dynasty, tid, year, upToWeek = 99) {
  const tidNum = Number(tid)
  const abbr   = getTeamAbbr(dynasty, tid)

  // Gather games that involve this team, supporting both the modern
  // tid-keyed format and the legacy user-game format (userTid / teamScore).
  const seenKey = new Set()
  const games = (dynasty.games || []).filter(g => {
    if (Number(g.year) !== Number(year)) return false
    if (!g.isPlayed) return false

    const hasScores =
      (g.team1Score !== undefined && g.team2Score !== undefined) ||
      (g.teamScore !== undefined && g.opponentScore !== undefined)
    if (!hasScores) return false

    const inGame =
      Number(g.team1Tid) === tidNum ||
      Number(g.team2Tid) === tidNum ||
      Number(g.userTid) === tidNum ||
      Number(g.opponentTid) === tidNum ||
      g.userTeam === abbr ||
      g.opponent === abbr ||
      g.team1 === abbr ||
      g.team2 === abbr
    if (!inGame) return false

    if (g.week != null && Number(g.week) >= Number(upToWeek)) return false

    // Deduplicate by week+gameType (same slot played twice in data)
    const key = `${g.week ?? 'post'}-${g.gameType || 'regular'}`
    if (seenKey.has(key)) return false
    seenKey.add(key)
    return true
  })

  let wins = 0, losses = 0, ptsFor = 0, ptsAgainst = 0
  for (const g of games) {
    let myScore, theirScore

    if (Number(g.team1Tid) === tidNum) {
      myScore    = Number(g.team1Score) || 0
      theirScore = Number(g.team2Score) || 0
    } else if (Number(g.team2Tid) === tidNum) {
      myScore    = Number(g.team2Score) || 0
      theirScore = Number(g.team1Score) || 0
    } else if (Number(g.userTid) === tidNum || g.userTeam === abbr) {
      myScore    = Number(g.teamScore)     || 0
      theirScore = Number(g.opponentScore) || 0
    } else if (Number(g.opponentTid) === tidNum || g.opponent === abbr) {
      myScore    = Number(g.opponentScore) || 0
      theirScore = Number(g.teamScore)     || 0
    } else {
      continue
    }

    if (myScore > theirScore) wins++
    else losses++
    ptsFor     += myScore
    ptsAgainst += theirScore
  }

  const total = wins + losses
  return {
    wins,
    losses,
    winPct:      total > 0 ? wins / total : 0.5,
    avgFor:      total > 0 ? ptsFor / total : 24,
    avgAgainst:  total > 0 ? ptsAgainst / total : 24,
    avgDiff:     total > 0 ? (ptsFor - ptsAgainst) / total : 0,
    gamesPlayed: total,
  }
}

// Power score = (winPct × 40) + (avgPointDiff × 3), blended with team rating
// for early-season accuracy when few games have been played.
function calcPowerScore(dynasty, tid, year, upToWeek = 99) {
  const stats = calcTeamStats(dynasty, tid, year, upToWeek)
  const overall = getTeamOverall(dynasty, tid, year)

  let score = (stats.winPct * 40) + (stats.avgDiff * 3)

  if (stats.gamesPlayed < 3 && overall) {
    const ratingBonus = (overall - 75) * 0.4
    score = stats.gamesPlayed === 0
      ? ratingBonus
      : score * (stats.gamesPlayed / 3) + ratingBonus * (1 - stats.gamesPlayed / 3)
  }

  return score
}

// Conference games only — same logic as calcTeamStats but filtered to isConferenceGame.
function calcConfStats(dynasty, tid, year, upToWeek = 99) {
  const tidNum = Number(tid)
  const abbr   = getTeamAbbr(dynasty, tid)
  const seenKey = new Set()

  const games = (dynasty.games || []).filter(g => {
    if (Number(g.year) !== Number(year)) return false
    if (!g.isPlayed) return false
    if (!g.isConferenceGame) return false
    const hasScores =
      (g.team1Score !== undefined && g.team2Score !== undefined) ||
      (g.teamScore !== undefined && g.opponentScore !== undefined)
    if (!hasScores) return false
    const inGame =
      Number(g.team1Tid) === tidNum || Number(g.team2Tid) === tidNum ||
      Number(g.userTid) === tidNum  || Number(g.opponentTid) === tidNum ||
      g.userTeam === abbr || g.opponent === abbr ||
      g.team1 === abbr   || g.team2 === abbr
    if (!inGame) return false
    if (g.week != null && Number(g.week) >= Number(upToWeek)) return false
    const key = `${g.week ?? 'post'}-conf`
    if (seenKey.has(key)) return false
    seenKey.add(key)
    return true
  })

  let wins = 0, losses = 0, ptsFor = 0, ptsAgainst = 0
  for (const g of games) {
    let myScore, theirScore
    if      (Number(g.team1Tid) === tidNum) { myScore = Number(g.team1Score)||0; theirScore = Number(g.team2Score)||0 }
    else if (Number(g.team2Tid) === tidNum) { myScore = Number(g.team2Score)||0; theirScore = Number(g.team1Score)||0 }
    else if (Number(g.userTid)  === tidNum || g.userTeam === abbr) { myScore = Number(g.teamScore)||0; theirScore = Number(g.opponentScore)||0 }
    else if (Number(g.opponentTid) === tidNum || g.opponent === abbr) { myScore = Number(g.opponentScore)||0; theirScore = Number(g.teamScore)||0 }
    else continue
    if (myScore > theirScore) wins++; else losses++
    ptsFor += myScore; ptsAgainst += theirScore
  }

  const total = wins + losses
  return {
    wins, losses,
    winPct:      total > 0 ? wins / total : 0.5,
    avgFor:      total > 0 ? ptsFor / total : 24,
    avgAgainst:  total > 0 ? ptsAgainst / total : 24,
    avgDiff:     total > 0 ? (ptsFor - ptsAgainst) / total : 0,
    gamesPlayed: total,
  }
}

// Blended championship score: 60% power + 40% win% (scaled 0-100).
// A 10-0 team will never rank below 8-2 unless power gap is huge.
function calcChampScore(dynasty, tid, year, week) {
  const stats = calcTeamStats(dynasty, tid, year, week ?? 99)
  const ps    = calcPowerScore(dynasty, tid, year, week ?? 99)
  return ps * 0.6 + (stats.winPct * 100) * 0.4
}

// ─── Spread calculation (min-max normalized) ──────────────────────────────────
// Raw power scores can range ±100+, which produces absurd spreads.
// We normalize all team scores to [0,100] first, then divide by 4 to map a
// 20-point normalized gap → 5-point spread, 60-point gap → 15-point spread.
// Home field adds 3. Result is clamped to ±28.

function buildNormSpreadContext(dynasty, year, week) {
  const teams = dynasty?.teams || {}
  const scores = Object.keys(teams)
    .map(Number)
    .filter(tid => {
      if (!teams[tid]?.abbr) return false
      if (isFCSPlaceholderAbbr(teams[tid].abbr)) return false
      return true
    })
    .map(tid => calcPowerScore(dynasty, tid, year, week ?? 99))

  if (scores.length < 2) return { min: 0, max: 100, range: 100 }
  const min   = Math.min(...scores)
  const max   = Math.max(...scores)
  const range = max - min || 1
  return { min, max, range }
}

function normScore(ps, ctx) {
  return ((ps - ctx.min) / ctx.range) * 100
}

// spreadVal > 0 → home favored by that many points. Negative → away favored.
function calcNormalizedSpread(homePS, awayPS, normCtx) {
  const homeNorm = normScore(homePS, normCtx)
  const awayNorm = normScore(awayPS, normCtx)
  const raw      = (homeNorm - awayNorm) / 4 + 3
  const clamped  = Math.max(-28, Math.min(28, raw))
  return Math.round(clamped * 2) / 2
}

// ─── Spread → Moneyline (reference table with linear interpolation) ───────────
// Each entry: [spread, favML, dogML]
const SPREAD_ML_TABLE = [
  [0,    -110,  -110],
  [1.5,  -130,   110],
  [3,    -160,   140],
  [4,    -180,   155],
  [5,    -200,   170],
  [6,    -220,   185],
  [7,    -275,   230],
  [10,   -350,   290],
  [14,   -550,   420],
  [17,   -800,   580],
  [21,  -1200,   750],
]

// absSp = absolute value of the spread (always >= 0)
function spreadToML(absSp) {
  if (absSp < 0.5) return { favML: -110, dogML: -110 }

  for (let i = 0; i < SPREAD_ML_TABLE.length - 1; i++) {
    const [lo, loFav, loDog] = SPREAD_ML_TABLE[i]
    const [hi, hiFav, hiDog] = SPREAD_ML_TABLE[i + 1]
    if (absSp >= lo && absSp <= hi) {
      const t = (absSp - lo) / (hi - lo)
      const rawFav = loFav + t * (hiFav - loFav)
      const rawDog = loDog + t * (hiDog - loDog)
      return {
        favML: Math.min(roundToNearest5(rawFav), -105),
        dogML: Math.max(roundToNearest5(rawDog), 105),
      }
    }
  }

  // Beyond 21+
  return { favML: -1200, dogML: 750 }
}

// ─── Total (Over/Under) ───────────────────────────────────────────────────────
// Books apply ~1.05 inflation factor to raw average combined scoring.
// Round to nearest 0.5. Key round numbers (45, 50, 55…) get shaded -115/-105.
function calcTotal(dynasty, tid1, tid2, year, week) {
  const s1 = calcTeamStats(dynasty, tid1, year, week)
  const s2 = calcTeamStats(dynasty, tid2, year, week)
  const combined = (s1.avgFor + s2.avgFor) * 1.05
  const raw = combined > 20 ? combined : 48
  const total = Math.round(raw * 2) / 2

  const isKeyNum = total % 5 === 0 && total >= 40
  return {
    total,
    overVig: isKeyNum ? -115 : -110,
    underVig: isKeyNum ? -105 : -110,
  }
}

// ─── Probability → American odds ─────────────────────────────────────────────
// Uses sportsbook-clean rounding. Enforces +110 minimum for underdogs.
function probToAmerican(p, opts = {}) {
  const { leaderFloor = -300 } = opts
  if (p < 0.005) return 50000
  if (p < 0.02)  return 10000

  let ml
  if (p > 0.5) {
    ml = -(p / (1 - p)) * 100
    ml = Math.max(roundOddsToBook(ml), leaderFloor) // clamp leader
    return ml
  }
  ml = ((1 - p) / p) * 100
  return Math.max(roundOddsToBook(ml), 110)
}

function fmt(ml) {
  return ml >= 0 ? `+${ml}` : `${ml}`
}

// ─── Futures engine (softmax + sportsbook rounding) ──────────────────────────
const VIG = 1.045

function softmaxOdds(rows, scoreKey, opts = {}) {
  const { topN = Infinity, outsiderOdds = 50000, leaderFloor = -300 } = opts
  if (rows.length === 0) return []

  const expScores = rows.map(r => Math.exp(r[scoreKey] / 10))
  const totalExp  = expScores.reduce((a, b) => a + b, 0)

  const withProb = rows.map((r, i) => ({
    ...r,
    rawProb:  expScores[i] / totalExp,
    vigProb:  (expScores[i] / totalExp) * VIG,
  }))

  // Sort best → worst so topN cut applies correctly
  withProb.sort((a, b) => b.vigProb - a.vigProb)

  const result = withProb.map((r, i) => ({
    ...r,
    odds: i < topN
      ? probToAmerican(r.vigProb, { leaderFloor })
      : outsiderOdds,
  }))

  // Clamp leader floor
  if (result[0] && result[0].odds < leaderFloor) {
    result[0] = { ...result[0], odds: leaderFloor }
  }

  return result
}

// National championship board — blended 60/40 score, top 25 get real odds.
function buildNatlChampBoard(dynasty, year, week) {
  const teams = dynasty.teams || {}
  const tids  = Object.keys(teams).map(Number).filter(tid => {
    if (!teams[tid]?.abbr) return false
    if (isFCSPlaceholderAbbr(teams[tid].abbr)) return false
    return true
  })
  if (tids.length === 0) return []

  const rows = tids.map(tid => {
    const stats = calcTeamStats(dynasty, tid, year, week ?? 99)
    const ps    = calcPowerScore(dynasty, tid, year, week ?? 99)
    const cs    = calcChampScore(dynasty, tid, year, week)
    return { tid, team: teams[tid], stats, ps, cs }
  })

  return softmaxOdds(rows, 'cs', { topN: 25, outsiderOdds: 50000, leaderFloor: -300 })
}

// Conference championship board — conference record weighted, scoped to one conf.
function buildConfChampBoard(dynasty, year, week, confTeamAbbrs) {
  if (!confTeamAbbrs || confTeamAbbrs.length === 0) return []
  const teams  = dynasty.teams || {}
  const abbrSet = new Set(confTeamAbbrs.map(a => a.toUpperCase()))

  const tids = Object.keys(teams).map(Number).filter(tid => {
    if (!teams[tid]?.abbr) return false
    if (isFCSPlaceholderAbbr(teams[tid].abbr)) return false
    return abbrSet.has((teams[tid].abbr || '').toUpperCase())
  })

  if (tids.length === 0) return []

  const rows = tids.map(tid => {
    const overall = calcTeamStats(dynasty, tid, year, week ?? 99)
    const conf    = calcConfStats(dynasty, tid, year, week ?? 99)
    const ps      = calcPowerScore(dynasty, tid, year, week ?? 99)
    // Conf score: 50% conf win%, 30% overall power, 20% conf point diff
    const confScore = (conf.winPct * 50) + (ps * 0.3) + (conf.avgDiff * 2)
    return { tid, team: teams[tid], stats: overall, conf, ps, cs: confScore }
  })

  return softmaxOdds(rows, 'cs', { topN: Infinity, outsiderOdds: 100000, leaderFloor: -300 })
}

// ─── Win totals with pace-based drift ────────────────────────────────────────
const SEASON_GAMES = 12

function calcWinTotal(dynasty, tid, year) {
  const overall   = getTeamOverall(dynasty, tid, year)
  let baseTotal   = overall ? Math.round(((overall - 50) / 50) * 8 + 4) : 7.5
  baseTotal       = Math.max(2, Math.min(12, baseTotal))
  const total     = Math.round(baseTotal * 2) / 2

  const stats = calcTeamStats(dynasty, tid, year)
  let overML = -110, underML = -110

  if (stats.gamesPlayed > 0) {
    const pace = (stats.wins / stats.gamesPlayed) * SEASON_GAMES
    const gap  = pace - total

    if (gap >= 2)      { overML = -160; underML = 135  }
    else if (gap >= 1) { overML = -130; underML = 108  }
    else if (gap <= -2){ underML = -160; overML = 135  }
    else if (gap <= -1){ underML = -130; overML = 108  }
  }

  return {
    total,
    overML,
    underML,
    wins: stats.wins,
    losses: stats.losses,
    gamesPlayed: stats.gamesPlayed,
    overall,
  }
}

// ─── Debug helpers ───────────────────────────────────────────────────────────

function buildDebugReport(dynasty, game) {
  const year = game?.year
  const week = game?.week
  const teams = dynasty?.teams || {}

  const normCtx = buildNormSpreadContext(dynasty, year, week)

  // ── Step 1: team data audit ──────────────────────────────────────────────
  const teamAudit = Object.keys(teams)
    .map(Number)
    .filter(tid => teams[tid]?.abbr && !isFCSPlaceholderAbbr(teams[tid].abbr))
    .map(tid => {
      const abbr    = teams[tid].abbr
      const stats   = calcTeamStats(dynasty, tid, year, week ?? 99)
      const overall = getTeamOverall(dynasty, tid, year)
      const ps      = calcPowerScore(dynasty, tid, year, week ?? 99)

      const issues = []
      if (stats.gamesPlayed === 0)  issues.push('no games found — using rating fallback')
      if (stats.avgFor === 24 && stats.gamesPlayed === 0) issues.push('avgFor is default (no real data)')
      if (overall === null)          issues.push('overall rating missing')

      return { tid, abbr, stats, overall, ps, issues }
    })

  // ── Step 2: matchup step-by-step (first 3 non-FCS games this week) ──────
  const weekGames = (week != null)
    ? (dynasty.games || []).filter(g =>
        Number(g.year) === Number(year) &&
        g.week != null &&
        Number(g.week) === Number(week) &&
        !isFCSTeam(dynasty, g.team1Tid) &&
        !isFCSTeam(dynasty, g.team2Tid)
      ).slice(0, 3)
    : []

  const matchupBreakdowns = weekGames.map(g => {
    const tid1    = Number(g.team1Tid)
    const tid2    = Number(g.team2Tid)
    const homeTid = g.homeTeamTid != null ? Number(g.homeTeamTid) : tid1
    const awayTid = homeTid === tid1 ? tid2 : tid1

    const homeAbbr  = getTeamAbbr(dynasty, homeTid)
    const awayAbbr  = getTeamAbbr(dynasty, awayTid)
    const homeStats = calcTeamStats(dynasty, homeTid, year, week)
    const awayStats = calcTeamStats(dynasty, awayTid, year, week)
    const homeOvr   = getTeamOverall(dynasty, homeTid, year)
    const awayOvr   = getTeamOverall(dynasty, awayTid, year)

    const homeRaw = (homeStats.winPct * 40) + (homeStats.avgDiff * 3)
    const awayRaw = (awayStats.winPct * 40) + (awayStats.avgDiff * 3)
    const homePS  = calcPowerScore(dynasty, homeTid, year, week)
    const awayPS  = calcPowerScore(dynasty, awayTid, year, week)

    const homeNorm    = normScore(homePS, normCtx)
    const awayNorm    = normScore(awayPS, normCtx)
    const rawNormDiff = homeNorm - awayNorm
    const adjSpread   = rawNormDiff / 4 + 3
    const finalSpread = Math.round(Math.max(-28, Math.min(28, adjSpread)) * 2) / 2
    const absSp       = Math.abs(finalSpread)
    const { favML, dogML } = spreadToML(absSp)
    const homeFav     = finalSpread > 0

    const totalData = calcTotal(dynasty, homeTid, awayTid, year, week)

    // Sanity flags
    const flags = []
    if (absSp > 28)                  flags.push('SPREAD > 28 — power rating issue')
    if (Math.abs(homeFav ? favML : dogML) > 900) flags.push('ML shorter than -900 — clamped')
    if (totalData.total < 20)        flags.push('TOTAL < 20 — data issue, do not display')
    if (totalData.total > 80)        flags.push('TOTAL > 80 — data issue, do not display')
    if (homeStats.avgFor === 0 && homeStats.gamesPlayed > 0) flags.push(`${homeAbbr} avgFor = 0 — data missing`)
    if (awayStats.avgFor === 0 && awayStats.gamesPlayed > 0) flags.push(`${awayAbbr} avgFor = 0 — data missing`)

    return {
      label: `${awayAbbr} @ ${homeAbbr}`,
      homeAbbr, awayAbbr,
      homeStats, awayStats,
      homeOvr, awayOvr,
      homeRaw, awayRaw,
      homePS, awayPS,
      homeNorm, awayNorm, rawNormDiff, adjSpread, finalSpread,
      homeFav,
      favML, dogML,
      totalData,
      flags,
    }
  })

  // ── Step 3: global sanity checks ─────────────────────────────────────────
  const globalFlags = []
  globalFlags.push(`Norm context: min=${normCtx.min.toFixed(1)} max=${normCtx.max.toFixed(1)} range=${normCtx.range.toFixed(1)} (${teamAudit.length} non-FCS teams)`)
  const zeroScoringTeams = teamAudit.filter(t => t.stats.avgFor === 0 && t.stats.gamesPlayed > 0)
  if (zeroScoringTeams.length > 0) {
    globalFlags.push(`Teams with 0 avgFor but games played (excluded from odds): ${zeroScoringTeams.map(t => t.abbr).join(', ')}`)
  }
  const noDataTeams = teamAudit.filter(t => t.stats.gamesPlayed === 0 && t.overall === null)
  if (noDataTeams.length > 0) {
    globalFlags.push(`Teams with NO game data AND no rating (using defaults): ${noDataTeams.map(t => t.abbr).join(', ')}`)
  }

  return { teamAudit, matchupBreakdowns, globalFlags }
}

function DebugPanel({ dynasty, game }) {
  const report = useMemo(() => buildDebugReport(dynasty, game), [dynasty, game])
  const { teamAudit, matchupBreakdowns, globalFlags } = report

  const teamsWithIssues = teamAudit.filter(t => t.issues.length > 0)
  const week = game?.week

  return (
    <div className="bg-[#0a0f1a] border border-yellow-600/40 rounded-lg mx-4 my-4 overflow-hidden text-[11px] font-mono">
      <div className="px-3 py-2 bg-yellow-600/20 border-b border-yellow-600/30 text-yellow-400 font-bold uppercase tracking-widest text-[10px]">
        Sportsbook Debug Report — Week {week ?? 'Post'} · {game?.year}
      </div>

      {/* Step 1: Team data audit */}
      <div className="px-3 py-2 border-b border-surface-4">
        <div className="text-yellow-300 font-bold mb-2">STEP 1 — Team Data Audit ({teamAudit.length} teams)</div>

        {teamsWithIssues.length > 0 && (
          <div className="mb-2 text-red-400">
            <div className="font-bold">Teams with issues:</div>
            {teamsWithIssues.map(t => (
              <div key={t.tid} className="pl-2">
                {t.abbr}: {t.issues.join(' | ')}
              </div>
            ))}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-txt-muted border-b border-surface-3">
                <th className="pr-3 pb-1">Team</th>
                <th className="pr-3 pb-1">W-L</th>
                <th className="pr-3 pb-1">Avg PF</th>
                <th className="pr-3 pb-1">Avg PA</th>
                <th className="pr-3 pb-1">OVR</th>
                <th className="pr-3 pb-1">Power</th>
                <th className="pb-1">Source</th>
              </tr>
            </thead>
            <tbody>
              {teamAudit.map(t => (
                <tr key={t.tid} className={`border-b border-surface-3/30 ${t.issues.length > 0 ? 'text-red-400' : 'text-txt-secondary'}`}>
                  <td className="pr-3 py-0.5 font-bold text-txt-primary">{t.abbr}</td>
                  <td className="pr-3">{t.stats.wins}-{t.stats.losses}</td>
                  <td className="pr-3">{t.stats.avgFor.toFixed(1)}</td>
                  <td className="pr-3">{t.stats.avgAgainst.toFixed(1)}</td>
                  <td className="pr-3">{t.overall ?? '—'}</td>
                  <td className="pr-3">{t.ps.toFixed(2)}</td>
                  <td className="text-txt-muted text-[10px]">
                    {t.stats.gamesPlayed === 0
                      ? (t.overall ? 'rating only' : 'default')
                      : t.stats.gamesPlayed < 3 && t.overall ? 'blended' : 'games'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Step 2: Matchup breakdowns */}
      <div className="px-3 py-2 border-b border-surface-4">
        <div className="text-yellow-300 font-bold mb-2">
          STEP 2 — Matchup Math ({matchupBreakdowns.length} sample{matchupBreakdowns.length !== 1 ? 's' : ''})
        </div>
        {matchupBreakdowns.length === 0 ? (
          <div className="text-txt-muted">No regular-season games found for Week {week}.</div>
        ) : (
          matchupBreakdowns.map((m, i) => (
            <div key={i} className={`mb-3 ${i > 0 ? 'border-t border-surface-3 pt-2' : ''}`}>
              <div className="text-txt-primary font-bold mb-1">{m.label}</div>
              <div className="grid grid-cols-2 gap-x-4 text-[10px] text-txt-secondary">
                <div>
                  <div className="text-txt-muted mb-0.5">{m.homeAbbr} (home)</div>
                  <div>WinPct={m.homeStats.winPct.toFixed(3)} × 40 = {(m.homeStats.winPct*40).toFixed(1)}</div>
                  <div>AvgDiff={m.homeStats.avgDiff.toFixed(1)} × 3 = {(m.homeStats.avgDiff*3).toFixed(1)}</div>
                  <div>RawScore = {m.homeRaw.toFixed(2)}{m.homeOvr && m.homeStats.gamesPlayed < 3 ? ` → blended w/ OVR${m.homeOvr}` : ''}</div>
                  <div className="text-txt-primary font-bold">FinalPS = {m.homePS.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-txt-muted mb-0.5">{m.awayAbbr} (away)</div>
                  <div>WinPct={m.awayStats.winPct.toFixed(3)} × 40 = {(m.awayStats.winPct*40).toFixed(1)}</div>
                  <div>AvgDiff={m.awayStats.avgDiff.toFixed(1)} × 3 = {(m.awayStats.avgDiff*3).toFixed(1)}</div>
                  <div>RawScore = {m.awayRaw.toFixed(2)}{m.awayOvr && m.awayStats.gamesPlayed < 3 ? ` → blended w/ OVR${m.awayOvr}` : ''}</div>
                  <div className="text-txt-primary font-bold">FinalPS = {m.awayPS.toFixed(2)}</div>
                </div>
              </div>
              <div className="mt-1.5 text-[10px] space-y-0.5">
                <div>Norm range: min={normCtx.min.toFixed(1)} max={normCtx.max.toFixed(1)} range={normCtx.range.toFixed(1)}</div>
                <div>{m.homeAbbr} norm={m.homeNorm.toFixed(1)}  {m.awayAbbr} norm={m.awayNorm.toFixed(1)}  diff={m.rawNormDiff.toFixed(1)}</div>
                <div>Spread: ({m.rawNormDiff.toFixed(1)} / 4) + 3 = {m.adjSpread.toFixed(2)} → clamped/rounded: <span className="text-txt-primary font-bold">{m.finalSpread > 0 ? `${m.homeAbbr} −${Math.abs(m.finalSpread)}` : m.finalSpread < 0 ? `${m.awayAbbr} −${Math.abs(m.finalSpread)}` : 'PK'}</span></div>
                <div>Spread table lookup (|{Math.abs(m.finalSpread)}|): fav <span className="text-blue-400">{m.favML}</span> / dog <span className="text-blue-400">+{m.dogML}</span></div>
                <div>Total: ({m.homeStats.avgFor.toFixed(1)} + {m.awayStats.avgFor.toFixed(1)}) × 1.05 = <span className="text-txt-primary font-bold">{m.totalData.total}</span> (vig {m.totalData.overVig}/{m.totalData.underVig})</div>
              </div>
              {m.flags.length > 0 && (
                <div className="mt-1 text-red-400 text-[10px]">
                  {m.flags.map((f, fi) => <div key={fi}>⚠ {f}</div>)}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Step 3: Global sanity checks */}
      <div className="px-3 py-2">
        <div className="text-yellow-300 font-bold mb-1">STEP 3 — Sanity Checks</div>
        {globalFlags.length === 0 ? (
          <div className="text-green-400">All checks passed.</div>
        ) : (
          globalFlags.map((f, i) => (
            <div key={i} className="text-red-400">⚠ {f}</div>
          ))
        )}
        {matchupBreakdowns.every(m => m.flags.length === 0) && matchupBreakdowns.length > 0 && (
          <div className="text-green-400 mt-1">All {matchupBreakdowns.length} sampled matchup(s) passed spread/total sanity checks.</div>
        )}
      </div>
    </div>
  )
}

// ─── Sub-panel: Game Lines ────────────────────────────────────────────────────

function GameLinesPanel({ dynasty, game }) {
  const year = game?.year
  const week = game?.week

  const matchups = useMemo(() => {
    if (!dynasty?.games || week == null) return []

    // Build normalization context from all non-FCS team scores this week
    const normCtx = buildNormSpreadContext(dynasty, year, week)

    return dynasty.games
      .filter(g => {
        if (Number(g.year) !== Number(year)) return false
        if (g.week == null || Number(g.week) !== Number(week)) return false
        // Skip games involving FCS placeholders
        if (isFCSTeam(dynasty, g.team1Tid) || isFCSTeam(dynasty, g.team2Tid)) return false
        return true
      })
      .map(g => {
        const tid1    = Number(g.team1Tid)
        const tid2    = Number(g.team2Tid)
        const homeTid = g.homeTeamTid != null ? Number(g.homeTeamTid) : tid1
        const awayTid = homeTid === tid1 ? tid2 : tid1

        const homePower = calcPowerScore(dynasty, homeTid, year, week)
        const awayPower = calcPowerScore(dynasty, awayTid, year, week)
        // Normalized spread: positive = home favored
        const spreadVal = calcNormalizedSpread(homePower, awayPower, normCtx)
        const absSp     = Math.abs(spreadVal)

        const { favML, dogML } = spreadToML(absSp)
        const homeFav = spreadVal > 0

        // Display spreads: favorite shows negative (e.g. -7), dog shows positive (+7)
        const homeSpreadDisplay = spreadVal === 0 ? 'PK'
          : homeFav ? fmt(-absSp) : fmt(absSp)
        const awaySpreadDisplay = spreadVal === 0 ? 'PK'
          : homeFav ? fmt(absSp) : fmt(-absSp)

        const homeML = homeFav ? favML : dogML
        const awayML = homeFav ? dogML : favML

        const totalData = calcTotal(dynasty, homeTid, awayTid, year, week)

        return {
          id: g.id,
          homeTid,
          awayTid,
          homeAbbr: getTeamAbbr(dynasty, homeTid),
          awayAbbr: getTeamAbbr(dynasty, awayTid),
          homeSpreadDisplay,
          awaySpreadDisplay,
          homeFav,
          awayFav: !homeFav && spreadVal !== 0,
          homeML,
          awayML,
          totalData,
          isNeutral: g.homeTeamTid == null,
          isPlayed: g.isPlayed,
          homeScore: homeTid === tid1 ? g.team1Score : g.team2Score,
          awayScore: awayTid === tid1 ? g.team1Score : g.team2Score,
          isThisGame: String(g.id) === String(game.id),
        }
      })
  }, [dynasty, year, week, game?.id])

  if (week == null) {
    return (
      <p className="text-txt-tertiary text-sm px-4 py-6 text-center">
        Game lines are available for regular season games only.
      </p>
    )
  }

  if (matchups.length === 0) {
    return (
      <p className="text-txt-tertiary text-sm px-4 py-6 text-center">
        No matchups found for Week {week}.
      </p>
    )
  }

  return (
    <div className="divide-y divide-surface-3">
      {matchups.map(m => (
        <div
          key={m.id}
          className={`px-4 py-3 ${m.isThisGame ? 'bg-surface-3/40 border-l-2 border-blue-500' : ''}`}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-txt-tertiary uppercase tracking-wide">
              {m.isNeutral ? 'Neutral Site' : `${m.awayAbbr} @ ${m.homeAbbr}`}
              {m.isPlayed && (
                <span className="ml-2 text-green-400">
                  FINAL: {m.awayAbbr} {m.awayScore} – {m.homeAbbr} {m.homeScore}
                </span>
              )}
            </span>
            {m.isThisGame && (
              <span className="text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide">
                This Game
              </span>
            )}
          </div>

          {/* Odds grid */}
          <div className="grid grid-cols-[1fr_80px_80px_80px] gap-x-2 text-xs">
            <div />
            <div className="text-center text-txt-muted font-semibold uppercase tracking-wide pb-1">Spread</div>
            <div className="text-center text-txt-muted font-semibold uppercase tracking-wide pb-1">ML</div>
            <div className="text-center text-txt-muted font-semibold uppercase tracking-wide pb-1">Total</div>

            {/* Away row */}
            <div className="font-semibold text-txt-primary">{m.awayAbbr}</div>
            <div className="text-center">
              <div className={m.awayFav ? 'text-blue-400 font-bold' : 'text-txt-primary'}>{m.awaySpreadDisplay}</div>
              <div className="text-blue-500 text-[10px]">-110</div>
            </div>
            <div className="text-center">
              <div className={m.awayFav ? 'text-blue-400 font-bold' : 'text-txt-primary'}>{fmt(m.awayML)}</div>
              <div className="text-[10px]">&nbsp;</div>
            </div>
            <div className="text-center">
              <div className="text-txt-primary">O {m.totalData.total}</div>
              <div className="text-blue-500 text-[10px]">{fmt(m.totalData.overVig)}</div>
            </div>

            {/* Home row */}
            <div className="font-semibold text-txt-primary mt-1">
              {m.homeAbbr}{!m.isNeutral && <span className="text-txt-muted text-[10px] ml-1">HM</span>}
            </div>
            <div className="text-center mt-1">
              <div className={m.homeFav ? 'text-blue-400 font-bold' : 'text-txt-primary'}>{m.homeSpreadDisplay}</div>
              <div className="text-blue-500 text-[10px]">-110</div>
            </div>
            <div className="text-center mt-1">
              <div className={m.homeFav ? 'text-blue-400 font-bold' : 'text-txt-primary'}>{fmt(m.homeML)}</div>
              <div className="text-[10px]">&nbsp;</div>
            </div>
            <div className="text-center mt-1">
              <div className="text-txt-primary">U {m.totalData.total}</div>
              <div className="text-blue-500 text-[10px]">{fmt(m.totalData.underVig)}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Shared odds row list ─────────────────────────────────────────────────────

function OddsBoard({ title, rows, recordLabel = r => `${r.stats.wins}-${r.stats.losses}` }) {
  if (rows.length === 0) {
    return <p className="text-txt-tertiary text-sm px-4 py-6 text-center">No team data available.</p>
  }
  return (
    <div
      className="border border-blue-600/60 rounded-lg overflow-hidden"
      style={{ background: 'rgba(30,58,138,0.08)' }}
    >
      <div className="px-4 py-2 border-b border-blue-600/40 text-xs font-bold uppercase tracking-widest text-blue-400">
        {title}
      </div>
      <div className="divide-y divide-surface-3">
        {rows.map((r, i) => (
          <div key={r.tid} className="flex items-center justify-between px-4 py-2">
            <div className="flex items-center gap-3">
              <span className="text-txt-muted text-xs w-5 text-right">{i + 1}</span>
              <span className="text-txt-primary text-sm font-semibold">{r.team?.abbr || `T${r.tid}`}</span>
              <span className="text-txt-tertiary text-xs">{recordLabel(r)}</span>
            </div>
            <div className={`text-sm font-bold ${r.odds <= 0 ? 'text-blue-400' : r.odds >= 50000 ? 'text-txt-muted' : 'text-txt-primary'}`}>
              {r.odds >= 100000 ? <span className="text-[11px]">ELIM</span> : fmt(r.odds)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Sub-panel: National Championship ────────────────────────────────────────

function NatlChampPanel({ dynasty, game }) {
  const year = game?.year
  const week = game?.week ?? 17

  const rows = useMemo(
    () => buildNatlChampBoard(dynasty, year, week),
    [dynasty, year, week]
  )

  return (
    <div className="px-4 py-4">
      <OddsBoard
        title={`CFB Playoff — National Championship ${year}`}
        rows={rows}
      />
      <p className="text-txt-muted text-[10px] mt-2 text-center">
        Top 25 priced · Others +50000 · Blends power score + record
      </p>
    </div>
  )
}

// ─── Sub-panel: Conference Championship ──────────────────────────────────────

function ConfChampPanel({ dynasty, game }) {
  const year  = game?.year
  const week  = game?.week ?? 17
  const teams = dynasty?.teams || {}

  // Build conference list from all non-FCS teams
  const customConfs = useMemo(() => {
    try { return getCustomConferencesForYear(dynasty, year) }
    catch { return null }
  }, [dynasty, year])

  const conferences = useMemo(() => {
    const confSet = new Set()
    Object.keys(teams).forEach(tid => {
      const abbr = teams[tid]?.abbr
      if (!abbr || isFCSPlaceholderAbbr(abbr)) return
      const conf = getTeamConference(abbr, customConfs)
      if (conf) confSet.add(conf)
    })
    return Array.from(confSet).sort()
  }, [teams, customConfs])

  const [activeConf, setActiveConf] = useState(() => conferences[0] || '')

  // Keep activeConf valid when conferences load
  const conf = conferences.includes(activeConf) ? activeConf : (conferences[0] || '')

  const confTeams = useMemo(() => {
    if (!conf) return []
    return Object.keys(teams)
      .map(Number)
      .filter(tid => {
        const abbr = teams[tid]?.abbr
        if (!abbr || isFCSPlaceholderAbbr(abbr)) return false
        return getTeamConference(abbr, customConfs) === conf
      })
      .map(tid => teams[tid]?.abbr)
      .filter(Boolean)
  }, [conf, teams, customConfs])

  const rows = useMemo(
    () => buildConfChampBoard(dynasty, year, week, confTeams),
    [dynasty, year, week, confTeams]
  )

  if (conferences.length === 0) {
    return <p className="text-txt-tertiary text-sm px-4 py-6 text-center">No conference data available.</p>
  }

  return (
    <div className="px-4 py-4">
      {/* Conference filter tabs */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {conferences.map(c => (
          <button
            key={c}
            onClick={() => setActiveConf(c)}
            className={`px-3 py-1 rounded-sm text-xs font-semibold uppercase tracking-wider transition-colors ${
              c === conf
                ? 'text-txt-primary bg-surface-3'
                : 'text-txt-tertiary hover:text-txt-primary hover:bg-surface-3'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <OddsBoard
        title={`${conf} Championship ${year}`}
        rows={rows}
        recordLabel={r => `${r.conf?.wins ?? 0}-${r.conf?.losses ?? 0} conf`}
      />
    </div>
  )
}

// ─── Sub-panel: Win Totals ────────────────────────────────────────────────────

function WinTotalsPanel({ dynasty, game }) {
  const year  = game?.year
  const teams = dynasty?.teams || {}
  const [confFilter, setConfFilter] = useState('ALL')

  const allConfs = useMemo(() => {
    const confs = new Set()
    Object.values(teams).forEach(t => {
      try { const c = getTeamConference(t.abbr); if (c) confs.add(c) } catch { /* skip */ }
    })
    return ['ALL', ...Array.from(confs).sort()]
  }, [teams])

  const rows = useMemo(() =>
    Object.keys(teams)
      .map(Number)
      .filter(tid => teams[tid]?.abbr && !isFCSPlaceholderAbbr(teams[tid].abbr))
      .map(tid => ({ tid, ...calcWinTotal(dynasty, tid, year) }))
      .sort((a, b) => b.total - a.total || a.tid - b.tid),
    [dynasty, year, teams]
  )

  return (
    <div className="px-4 py-4">
      {allConfs.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {allConfs.map(c => (
            <button
              key={c}
              onClick={() => setConfFilter(c)}
              className={`px-3 py-1 rounded-sm text-xs font-semibold uppercase tracking-wider transition-colors ${
                confFilter === c
                  ? 'text-txt-primary bg-surface-3'
                  : 'text-txt-tertiary hover:text-txt-primary hover:bg-surface-3'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {rows.map(r => {
          let show = confFilter === 'ALL'
          if (!show) {
            try { show = getTeamConference(teams[r.tid]?.abbr) === confFilter }
            catch { show = true }
          }
          if (!show) return null

          const overFav = r.overML < r.underML
          return (
            <div key={r.tid} className="bg-surface-2 rounded-lg px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <span className="text-txt-primary font-semibold text-sm">{teams[r.tid]?.abbr}</span>
                  {r.overall && (
                    <span className="ml-2 text-txt-muted text-xs">OVR {r.overall}</span>
                  )}
                  <span className="ml-2 text-txt-tertiary text-xs">{r.wins}-{r.losses}</span>
                </div>
                <div className="flex items-center gap-3 text-xs whitespace-nowrap">
                  <span className="text-txt-muted">O/U {r.total}</span>
                  <span className={overFav ? 'text-blue-400 font-bold' : 'text-txt-secondary'}>
                    O {fmt(r.overML)}
                  </span>
                  <span className={!overFav ? 'text-blue-400 font-bold' : 'text-txt-secondary'}>
                    U {fmt(r.underML)}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Root component ───────────────────────────────────────────────────────────

export default function SportsbookPanel({ dynasty, game }) {
  const [sbTab, setSbTab] = useState('lines')
  const [showDebug, setShowDebug] = useState(false)

  if (!dynasty || !game) return null

  const year       = game.year
  const leagueName = dynasty.leagueName || 'CFB'

  const tabs = [
    { value: 'lines',        label: 'Game Lines' },
    { value: 'championship', label: 'Natl Championship' },
    { value: 'cfp',          label: 'Conf. Champ' },
    { value: 'wintotals',    label: 'Win Totals' },
  ]

  return (
    <div className="bg-surface-1 rounded-xl overflow-hidden shadow-lg mt-4">
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between border-b border-surface-4"
        style={{ background: 'linear-gradient(135deg, #1a2744 0%, #111827 100%)' }}
      >
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-blue-400">FanDuel Sportsbook</div>
          <div className="text-txt-muted text-[10px]">
            {leagueName} · {year} Season · Week {game.week ?? 'Post'}
          </div>
        </div>
        <button
          onClick={() => setShowDebug(v => !v)}
          className={`text-[10px] px-2 py-1 rounded border transition-colors ${
            showDebug
              ? 'border-yellow-500/60 text-yellow-400 bg-yellow-900/20'
              : 'border-surface-4 text-txt-muted hover:text-txt-secondary'
          }`}
        >
          {showDebug ? 'Hide Debug' : 'Debug'}
        </button>
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar border-b border-surface-4">
        {tabs.map(tab => (
          <button
            key={tab.value}
            onClick={() => setSbTab(tab.value)}
            className={`flex-1 sm:flex-none px-3 py-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
              sbTab === tab.value
                ? 'text-txt-primary border-b-2 border-blue-500 bg-surface-2'
                : 'text-txt-tertiary hover:text-txt-primary hover:bg-surface-2/50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Debug panel */}
      {showDebug && <DebugPanel dynasty={dynasty} game={game} />}

      {/* Content */}
      {sbTab === 'lines'        && <GameLinesPanel   dynasty={dynasty} game={game} />}
      {sbTab === 'championship' && <NatlChampPanel   dynasty={dynasty} game={game} />}
      {sbTab === 'cfp'          && <ConfChampPanel   dynasty={dynasty} game={game} />}
      {sbTab === 'wintotals'    && <WinTotalsPanel   dynasty={dynasty} game={game} />}

      {/* Footer */}
      <div className="px-4 py-2 border-t border-surface-4 text-[10px] text-txt-muted text-center">
        Simulated odds for entertainment only · Not real wagering
      </div>
    </div>
  )
}
