/**
 * Approximate Value (AV) — a single per-season production score that
 * spans every position. Modeled on Pro Football Reference's AV
 * (Doug Drinen 2008) but adapted to box-score-only data and the stat
 * fields actually saved in this app's player.statsByYear.
 *
 * KEY DESIGN POINTS:
 *
 * - Pure production. Talent ratings (player.overall) are NOT inputs.
 *   This stat measures what the player did, not how good the game's
 *   attribute system says they could be.
 *
 * - Per-season counting stat. Sum across seasons for career AV. Top
 *   single-season values land in roughly the 15-22 range across all
 *   positions (matching NFL AV's intuitive feel: 15 = great, 22 = HoF
 *   season). Top career values for a 4-year college star land roughly
 *   60-90.
 *
 * - Position-specific. Each position has its own formula keyed on the
 *   stats most associated with their job. QBs are dominated by passing
 *   yards + TD-INT. RBs by rushing volume + scoring. OL by the
 *   pancakes/sacks-allowed counts the box score actually tracks.
 *
 * - Returns are added on top of any position. A WR who also returns
 *   punts gets credit for both. Keeps return-specialist seasons
 *   visible without splitting the player into two records.
 *
 * - Rough calibration was tuned by hand to match NFL AV intuition
 *   (top season ≈ 18, replacement starter ≈ 4-6, end-of-bench ≈ 0-2).
 *   Iterate the per-stat weights if specific positions feel under-
 *   or over-weighted in real dynasty data.
 */

// Position groups — used to dispatch to the right formula.
const QB_POS = new Set(['QB'])
const RB_POS = new Set(['HB', 'FB', 'RB'])
const WR_TE_POS = new Set(['WR', 'TE'])
const OL_POS = new Set(['LT', 'LG', 'C', 'RG', 'RT', 'OL', 'OT', 'OG'])
const DL_POS = new Set(['LEDG', 'REDG', 'DT', 'DE', 'DL', 'NT'])
const LB_POS = new Set(['SAM', 'MIKE', 'WILL', 'OLB', 'MLB', 'ILB', 'LB'])
const DB_POS = new Set(['CB', 'FS', 'SS', 'S', 'DB'])
const K_POS = new Set(['K'])
const P_POS = new Set(['P'])

// ──────────────────────────────────────────────────────────────────
// Position formulas — each takes a player's per-season stats object
// and returns a per-season AV contribution from the position's primary
// role. Calibrated so a top season lands around 15-22.

function qbValue(s) {
  let av = 0
  const p = s.passing
  if (p) {
    av += (p.yds || 0) * 0.0035    // 4000 yds → 14
    av += (p.td  || 0) * 0.4       // 30 TD   → 12
    av -= (p.int || 0) * 0.5       // 10 INT  → -5
    av -= (p.sacks || 0) * 0.1     // sack penalty
  }
  // Dual-threat bonus
  const r = s.rushing
  if (r) {
    av += (r.yds || 0) * 0.005     // 600 rush yds → 3
    av += (r.td  || 0) * 0.5
    av -= (r.fum || 0) * 0.5
  }
  return Math.max(0, av)
}

function rbValue(s) {
  let av = 0
  const r = s.rushing
  if (r) {
    av += (r.yds || 0) * 0.008     // 2000 yds → 16
    av += (r.td  || 0) * 0.5       // 20 TD   → 10
    av -= (r.fum || 0) * 0.5
    // Bonus signals — contact-breaking and explosive runs
    av += (r.bt  || 0) * 0.05
    av += (r.yac || 0) * 0.0015
    av += (r.twentyPlus || 0) * 0.15
  }
  const c = s.receiving
  if (c) {
    av += (c.yds || 0) * 0.008     // dual-threat backs catch on
    av += (c.td  || 0) * 0.5
    av -= (c.drops || 0) * 0.2
  }
  return Math.max(0, av)
}

function wrTeValue(s) {
  let av = 0
  const c = s.receiving
  if (c) {
    av += (c.yds || 0) * 0.009     // 2000 rec yds → 18
    av += (c.td  || 0) * 0.5       // 15 TD       → 7.5
    av += (c.rec || 0) * 0.05      // possession-receiver bonus
    av += (c.rac || 0) * 0.0015
    av -= (c.drops || 0) * 0.25
  }
  // Trick-play / Wildcat / TE rushing
  const r = s.rushing
  if (r) {
    av += (r.yds || 0) * 0.008
    av += (r.td  || 0) * 0.5
  }
  return Math.max(0, av)
}

function olValue(s) {
  let av = 0
  const b = s.blocking
  if (b) {
    av += (b.pancakes || 0) * 0.05      // 100 pancakes → 5
    av -= (b.sacksAllowed || 0) * 0.5    // 5 sacks → -2.5
  }
  return Math.max(0, av)
}

function defenseValue(s, posGroup) {
  const d = s.defense
  if (!d) return 0

  // Stat weights — sacks and INTs are the headline events; tackles
  // are volume; deflections and forced fumbles are difference-makers
  // worth their own line in the formula.
  let av = 0
  av += (d.solo || d.soloTkl || 0) * 0.10
  av += (d.assists || d.astTkl || 0) * 0.05
  av += (d.tfl || 0) * 0.4
  av += (d.sack || d.sacks || 0) * 1.0
  av += (d.int || 0) * 1.5
  av += (d.deflections || d.pd || 0) * 0.3
  av += (d.ff || 0) * 1.0
  av += (d.fr || 0) * 0.7
  av += (d.td || 0) * 2.0       // defensive scores are massive
  av += (d.safeties || 0) * 1.0
  av += (d.blocks  || 0) * 1.0

  // Position-group multiplier. DL stat-lines tend to be sparser per
  // game (a 3-sack game is huge; a 12-tackle game from a LB is
  // expected), so weight DL slightly higher per stat.
  if (posGroup === 'DL') av *= 1.15
  else if (posGroup === 'LB') av *= 1.0
  else if (posGroup === 'DB') av *= 1.0

  return Math.max(0, av)
}

function kValue(s) {
  const k = s.kicking
  if (!k) return 0
  let av = 0
  av += (k.fgm || 0) * 0.3
  av += (k.xpm || 0) * 0.04
  // 50+ yarders are clutch — extra credit
  av += (k.fgm50 || 0) * 0.4
  av += (k.fgm49 || 0) * 0.05  // 40-49 small bonus
  // Misses count against you
  const fgMisses = Math.max(0, (k.fga || 0) - (k.fgm || 0))
  av -= fgMisses * 0.2
  const xpMisses = Math.max(0, (k.xpa || 0) - (k.xpm || 0))
  av -= xpMisses * 0.3
  // Blocked kicks against
  av -= (k.fgb || 0) * 0.3
  av -= (k.xpb || 0) * 0.3
  return Math.max(0, av)
}

function pValue(s) {
  const p = s.punting
  if (!p) return 0
  const punts = p.punts || 0
  if (punts === 0) return 0
  let av = 0
  // Net punting average above replacement (38 yds is league-average).
  // Reward the count of punts beating that line.
  const netAvg = p.netYds ? (p.netYds / punts) : ((p.yds || 0) / punts)
  av += Math.max(0, netAvg - 38) * punts * 0.05
  // Inside-20 punts are field-position gold
  av += (p.in20 || 0) * 0.15
  // Touchbacks (bad for punters) and blocks (terrible)
  av -= (p.tb || 0) * 0.10
  av -= (p.block || 0) * 0.50
  return Math.max(0, av)
}

function returnValue(s) {
  let av = 0
  const kr = s.kickReturn
  if (kr) {
    av += (kr.yds || 0) * 0.005
    av += (kr.td  || 0) * 1.5
  }
  const pr = s.puntReturn
  if (pr) {
    av += (pr.yds || 0) * 0.008  // PR yds harder to come by
    av += (pr.td  || 0) * 1.5
  }
  return Math.max(0, av)
}

// ──────────────────────────────────────────────────────────────────
// Public API

/**
 * Compute Approximate Value for one season.
 *
 * @param {object} yearStats — player.statsByYear[year]
 * @param {string} position — player position for this year
 * @returns {number} — non-negative AV (1 decimal precision)
 */
export function computeSeasonAV(yearStats, position) {
  if (!yearStats) return 0

  const pos = (position || '').toUpperCase()
  let av = 0

  if (QB_POS.has(pos))      av += qbValue(yearStats)
  else if (RB_POS.has(pos))    av += rbValue(yearStats)
  else if (WR_TE_POS.has(pos)) av += wrTeValue(yearStats)
  else if (OL_POS.has(pos))    av += olValue(yearStats)
  else if (DL_POS.has(pos))    av += defenseValue(yearStats, 'DL')
  else if (LB_POS.has(pos))    av += defenseValue(yearStats, 'LB')
  else if (DB_POS.has(pos))    av += defenseValue(yearStats, 'DB')
  else if (K_POS.has(pos))     av += kValue(yearStats)
  else if (P_POS.has(pos))     av += pValue(yearStats)
  // Unknown position — fall back to scanning all categories
  else {
    av += qbValue(yearStats)
    av += rbValue(yearStats)
    av += wrTeValue(yearStats)
    av += olValue(yearStats)
    av += defenseValue(yearStats, 'LB')
    av += kValue(yearStats)
    av += pValue(yearStats)
  }

  // Returns are added on top of the primary-position role so a WR
  // who returns punts gets credit for both.
  av += returnValue(yearStats)

  return Math.round(av * 10) / 10
}

/**
 * Compute career Approximate Value — sum of per-season AVs.
 *
 * @param {object} player — player record with statsByYear
 * @returns {number}
 */
export function computeCareerAV(player) {
  if (!player?.statsByYear) return 0
  let total = 0
  Object.entries(player.statsByYear).forEach(([yearStr, yearStats]) => {
    if (!yearStats) return
    const year = parseInt(yearStr)
    // Position can drift across seasons (rare in CFB, but possible).
    // Prefer positionByYear if maintained, otherwise use the player's
    // current position.
    const positionForYear = player.positionByYear?.[year]
      || player.positionByYear?.[yearStr]
      || player.position
    total += computeSeasonAV(yearStats, positionForYear)
  })
  return Math.round(total * 10) / 10
}
