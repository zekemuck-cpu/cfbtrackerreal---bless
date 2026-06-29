// Scout grade — a single 0–99 score + tier for a scouted recruit/target, from
// the attributes captured via the Targets sheet (player.attributes).
//
// Approach (our own implementation): a weighted average of the archetype's
// defining attributes (weights authored here from football logic, not copied),
// plus modest adjustments for dev trait, star rating, and elite physical
// outliers. The score normalizes over whatever attributes were actually scouted,
// so partial scouting still grades fairly. Any archetype with no weight table
// falls back to a flat average of its scouted attributes.

import { attributeNamesFor, archetypeKey } from './recruitAttributes'

// Relative attribute emphasis per "<bucket>_<archetype>" (0–10 scale; only the
// meaningful attributes are listed — the rest contribute 0). The score divides
// by the summed weight of the attributes a player actually has, so these are
// relative, not required to total anything.
export const SCOUT_WEIGHTS = {
  // ── QB ──
  'QB_Pocket Passer':     { 'Throw Power': 7, 'Short Accuracy': 8, 'Medium Accuracy': 8, 'Deep Accuracy': 7, 'Under Pressure': 6, Awareness: 6, 'Throw On Run': 2, 'Break Sack': 2 },
  'QB_Dual Threat':       { 'Throw Power': 6, 'Short Accuracy': 5, 'Medium Accuracy': 5, 'Deep Accuracy': 4, 'Throw On Run': 7, Speed: 8, Acceleration: 7, 'Break Sack': 3, Awareness: 3 },
  'QB_Backfield Creator': { 'Throw Power': 6, 'Short Accuracy': 7, 'Medium Accuracy': 6, 'Throw On Run': 8, 'Break Sack': 6, Awareness: 5, 'Deep Accuracy': 3, Speed: 3 },
  'QB_Pure Runner':       { Speed: 9, Acceleration: 8, 'Throw On Run': 6, 'Break Sack': 6, 'Throw Power': 4, 'Short Accuracy': 4, Awareness: 3, 'Medium Accuracy': 3 },
  // ── HB ──
  'HB_Elusive Bruiser':     { 'Break Tackle': 8, 'Juke Move': 7, Carrying: 6, Speed: 6, Acceleration: 6, 'Change of Direction': 5, 'BC Vision': 5, 'Spin Move': 4, Awareness: 3 },
  'HB_East/West Playmaker': { Speed: 8, Acceleration: 8, 'Change of Direction': 8, 'Juke Move': 7, 'Spin Move': 5, 'BC Vision': 5, Carrying: 4, Awareness: 3 },
  'HB_Contact Seeker':      { 'Break Tackle': 9, Carrying: 7, 'BC Vision': 6, Awareness: 5, Speed: 4, Acceleration: 4, 'Change of Direction': 3, 'Juke Move': 3 },
  'HB_Backfield Threat':    { Catching: 8, Speed: 7, Acceleration: 6, 'Juke Move': 6, 'BC Vision': 5, 'Change of Direction': 5, 'Break Tackle': 4, Carrying: 4 },
  'HB_North/South Receiver':{ Speed: 7, Catching: 7, Acceleration: 6, Carrying: 6, 'BC Vision': 6, 'Break Tackle': 5, Awareness: 4, 'Change of Direction': 4 },
  'HB_North/South Blocker': { Carrying: 8, 'Break Tackle': 7, 'BC Vision': 6, Awareness: 6, Speed: 4, Acceleration: 4, Catching: 3 },
  'HB_Pure Runner':         { 'BC Vision': 7, Carrying: 7, 'Break Tackle': 7, Speed: 7, Acceleration: 6, 'Change of Direction': 5, 'Juke Move': 5, Awareness: 4 },
  // FB (maps to the HB bucket; scouted on ball-carrier attributes).
  'HB_Blocking':            { Carrying: 7, 'Break Tackle': 6, 'BC Vision': 6, Awareness: 5, Speed: 4, Acceleration: 4 },
  'HB_Utility':             { Carrying: 6, Catching: 6, 'BC Vision': 5, 'Break Tackle': 5, Speed: 5, Acceleration: 5, Awareness: 4 },
  // ── WR ──
  'WR_Speedster':            { Speed: 9, Acceleration: 8, 'Deep Route': 7, 'Spectacular Catch': 6, Catching: 6, 'Medium Route': 4, 'Short Route': 3, 'Catch In Traffic': 3 },
  'WR_Route Artist':         { 'Short Route': 8, 'Medium Route': 8, 'Deep Route': 7, Catching: 7, Agility: 6, Awareness: 5, 'Catch In Traffic': 4, Speed: 3 },
  'WR_Elusive Route Runner': { 'Short Route': 8, 'Medium Route': 7, Agility: 8, Speed: 6, Acceleration: 5, Catching: 6, 'Deep Route': 4, Awareness: 4 },
  'WR_Physical Route Runner':{ 'Catch In Traffic': 8, 'Spectacular Catch': 7, Catching: 7, 'Medium Route': 7, 'Short Route': 5, Awareness: 5, 'Deep Route': 4, Speed: 3 },
  'WR_Gritty Possession':    { 'Catch In Traffic': 8, Catching: 8, 'Short Route': 7, 'Medium Route': 6, Awareness: 6, 'Spectacular Catch': 4, Speed: 3 },
  'WR_Contested Specialist': { 'Catch In Traffic': 8, 'Spectacular Catch': 8, Catching: 7, 'Deep Route': 6, Awareness: 5, 'Medium Route': 5, Speed: 3 },
  'WR_Gadget':               { Speed: 8, Acceleration: 7, Agility: 7, Catching: 6, 'Short Route': 5, 'Catch In Traffic': 3, Awareness: 3 },
  // ── TE ──
  'TE_Vertical Threat':      { Speed: 8, Acceleration: 7, 'Deep Route': 7, 'Medium Route': 6, Catching: 7, 'Catch In Traffic': 5, Awareness: 4, Strength: 3 },
  'TE_Pure Possession':      { Catching: 8, 'Catch In Traffic': 8, 'Short Route': 7, 'Medium Route': 6, Awareness: 6, Speed: 3, Strength: 3 },
  'TE_Possession':           { Catching: 8, 'Catch In Traffic': 7, 'Short Route': 6, 'Medium Route': 6, 'Run Block': 4, Awareness: 5, Strength: 4, Speed: 3 },
  'TE_Gritty Possession':    { 'Catch In Traffic': 8, Catching: 6, 'Short Route': 6, Strength: 6, 'Run Block': 5, Awareness: 5, 'Medium Route': 4 },
  'TE_Physical Route Runner':{ 'Catch In Traffic': 8, 'Medium Route': 7, Catching: 7, Strength: 6, 'Short Route': 5, Awareness: 4, Speed: 4 },
  'TE_Pure Blocker':         { 'Run Block': 9, 'Pass Block': 7, Strength: 8, Awareness: 6, Catching: 3, 'Catch In Traffic': 3 },
  // ── OL (OT/OG/C share the profile) ──
  ...['OT', 'OG', 'C'].reduce((o, p) => ({
    ...o,
    [`${p}_Well Rounded`]:  { 'Run Block': 7, 'Pass Block': 7, 'Run Block Power': 5, 'Pass Block Power': 5, 'Run Block Finesse': 4, 'Pass Block Finesse': 4, 'Impact Blocking': 5, Awareness: 6, Agility: 3, Acceleration: 3 },
    [`${p}_Pass Protector`]:{ 'Pass Block': 8, 'Pass Block Power': 7, 'Pass Block Finesse': 7, Awareness: 6, 'Run Block': 4, 'Impact Blocking': 4, Agility: 4 },
    [`${p}_Agile`]:         { 'Run Block Finesse': 8, 'Pass Block Finesse': 8, Agility: 7, Acceleration: 6, 'Run Block': 5, 'Pass Block': 5, Awareness: 5 },
    [`${p}_Raw Strength`]:  { 'Run Block Power': 9, 'Pass Block Power': 8, Strength: 8, 'Impact Blocking': 7, 'Run Block': 5, 'Pass Block': 5, Awareness: 4 },
    [`${p}_Ground and Pound`]: { 'Run Block': 8, 'Run Block Power': 8, 'Impact Blocking': 7, Strength: 7, 'Run Block Finesse': 4, 'Pass Block': 5, 'Pass Block Power': 5, Awareness: 5 },
  }), {}),
  // ── DL (DE/DT share, + DT gap) ──
  ...['DE', 'DT'].reduce((o, p) => ({
    ...o,
    [`${p}_Speed Rusher`]: { 'Finesse Moves': 9, Speed: 8, Acceleration: 8, Pursuit: 6, 'Block Shedding': 4, Tackle: 4, Awareness: 3 },
    [`${p}_Power Rusher`]: { 'Power Moves': 9, Strength: 8, 'Block Shedding': 7, 'Hit Power': 6, Tackle: 5, Pursuit: 3, Awareness: 3 },
    [`${p}_Edge Setter`]:  { 'Block Shedding': 8, Tackle: 8, Strength: 7, 'Hit Power': 6, Awareness: 5, 'Power Moves': 4, Pursuit: 4 },
    [`${p}_Pure Power`]:   { 'Power Moves': 9, Strength: 9, 'Block Shedding': 7, 'Hit Power': 6, Tackle: 4 },
  }), {}),
  'DT_Gap Specialist': { 'Block Shedding': 8, Strength: 8, Tackle: 7, 'Hit Power': 6, Awareness: 5, 'Power Moves': 5, Pursuit: 3 },
  'DE_Gap Specialist': { 'Block Shedding': 8, Strength: 7, Tackle: 8, 'Hit Power': 6, Awareness: 5, 'Power Moves': 5, Pursuit: 4 },
  // ── LB (OLB/MIKE share) ──
  ...['OLB', 'MIKE'].reduce((o, p) => ({
    ...o,
    [`${p}_Thumper`]:       { Tackle: 8, 'Hit Power': 8, Strength: 7, Pursuit: 6, 'Play Recognition': 5, Awareness: 4, Speed: 3 },
    [`${p}_Signal Caller`]: { Awareness: 8, 'Play Recognition': 8, Tackle: 6, Pursuit: 6, 'Zone Coverage': 5, 'Hit Power': 4, Speed: 3 },
    [`${p}_Lurker`]:        { Speed: 7, 'Play Recognition': 7, 'Zone Coverage': 7, Pursuit: 6, Acceleration: 6, Awareness: 5, 'Man Coverage': 4, Tackle: 4 },
  }), {}),
  // ── CB ──
  'CB_Boundary':     { 'Man Coverage': 8, Press: 7, Speed: 8, Acceleration: 7, Agility: 5, 'Change of Direction': 5, Awareness: 4, 'Zone Coverage': 3 },
  'CB_Bump and Run': { Press: 9, 'Man Coverage': 8, Acceleration: 6, Speed: 6, Agility: 5, 'Change of Direction': 4, Awareness: 4, Tackle: 3 },
  'CB_Field':        { Speed: 8, Acceleration: 7, 'Change of Direction': 7, Agility: 6, 'Zone Coverage': 6, 'Man Coverage': 6, Awareness: 5, Press: 3 },
  'CB_Zone':         { 'Zone Coverage': 9, Awareness: 7, Speed: 6, Acceleration: 5, 'Change of Direction': 5, 'Man Coverage': 4, Catching: 4, Tackle: 3 },
  // ── S (FS/SS share) ──
  ...['FS', 'SS'].reduce((o, p) => ({
    ...o,
    [`${p}_Box Specialist`]:      { Tackle: 8, Awareness: 7, Speed: 6, 'Man Coverage': 5, Acceleration: 5, Press: 4, 'Change of Direction': 4 },
    [`${p}_Coverage Specialist`]: { 'Man Coverage': 8, 'Zone Coverage': 8, Speed: 7, Acceleration: 6, Catching: 6, 'Change of Direction': 5, Agility: 5, Awareness: 5 },
    [`${p}_Hybrid`]:              { 'Man Coverage': 6, 'Zone Coverage': 6, Tackle: 6, Speed: 6, Awareness: 6, Acceleration: 5, 'Change of Direction': 4, Press: 4 },
  }), {}),
  // ── K / P (specialists are graded on leg attributes ONLY — speed, throwing,
  // tackling etc. are noise for a kicker/punter and must not drag the score) ──
  ...['K', 'P'].reduce((o, p) => ({
    ...o,
    [`${p}_Accurate`]: { 'Kick Accuracy': 9, 'Kick Power': 6, Awareness: 3 },
    [`${p}_Power`]:    { 'Kick Power': 9, 'Kick Accuracy': 6, Awareness: 3 },
  }), {}),
}

// Leg-only fallback for a K/P recruit whose archetype is blank/unrecognized, so
// the grade still ignores non-kicking attributes instead of flat-averaging them.
const KP_FALLBACK_WEIGHTS = { 'Kick Power': 8, 'Kick Accuracy': 8, Awareness: 3 }
const isKickerPunter = (player) => ['K', 'P'].includes((player?.position || '').toUpperCase())

// Adjustments — our own calibration (kept modest so scouted attributes dominate).
export const DEV_ADJ = { Elite: 10, Star: 5, Impact: 2, Normal: -5 }
const STAR_ADJ = { 5: 2, 4: 1, 3: 0, 2: -1, 1: -2 }
const HIDDEN_DEV_BY_STAR = { 5: 7, 4: 4, 3: 1, 2: -2, 1: -4 }
const PHYS_ATTRS = ['Speed', 'Acceleration', 'Strength', 'Agility', 'Change of Direction']

export const hasAnyAttrs = (p) => p?.attributes && Object.keys(p.attributes).some((k) => p.attributes[k] != null && p.attributes[k] !== '')
// Position bucket (QB / WR / OT …) — the prefix of the archetype key.
export const positionBucket = (player) => archetypeKey(player.position, player.archetype).split('_')[0]

// Weighted base over the player's scouted attributes (0–99), normalized by the
// summed weight of the attributes present. Falls back to a flat average when
// the archetype has no weight table. `weightsOverride` lets the learning model
// supply refined weights for an archetype.
function baseScore(player, weightsOverride) {
  const attrs = player.attributes || {}
  const present = Object.keys(attrs).filter((k) => typeof Number(attrs[k]) === 'number' && Number.isFinite(Number(attrs[k])))
  if (!present.length) return null
  const weights = weightsOverride || SCOUT_WEIGHTS[archetypeKey(player.position, player.archetype)]
    || (isKickerPunter(player) ? KP_FALLBACK_WEIGHTS : null)
  if (!weights) {
    // No profile — flat average of scouted attributes.
    const sum = present.reduce((a, k) => a + Number(attrs[k]), 0)
    return sum / present.length
  }
  let wSum = 0
  let acc = 0
  for (const k of present) {
    const w = weights[k] || 0
    if (w <= 0) continue
    acc += Number(attrs[k]) * w
    wSum += w
  }
  if (wSum === 0) {
    // The archetype's key attributes weren't among those scouted — flat avg.
    const sum = present.reduce((a, k) => a + Number(attrs[k]), 0)
    return sum / present.length
  }
  return acc / wSum
}

function physBonus(player) {
  const attrs = player.attributes || {}
  let b = 0
  for (const k of PHYS_ATTRS) {
    const v = Number(attrs[k]) || 0
    if (v >= 95) b += 2
    else if (v >= 90) b += 1
  }
  return Math.min(b, 6)
}

// When the dev trait is still hidden, a Gem/Bust scouting read is the strongest
// hint we have: a Gem out-develops its stars (project Star, or Elite for a
// blue-chip), a Bust under-develops (project Normal). Returns the projected
// trait label, or null when there's no gem/bust read to go on.
export function gemBustProjectedDev(player) {
  const gb = String(player?.gemBust || '').trim().toLowerCase()
  if (gb === 'gem') return (parseInt(player?.stars, 10) || 3) >= 4 ? 'Elite' : 'Star'
  if (gb === 'bust') return 'Normal'
  return null
}

// Dev-trait adjustment. A known trait wins. Otherwise a Gem/Bust read projects a
// trait; failing that we estimate from stars — the learned per-star prior when
// the model has one, else the static heuristic.
function devAdj(player, devPriors) {
  const d = player.devTrait
  if (d && DEV_ADJ[d] != null) return DEV_ADJ[d]
  const proj = gemBustProjectedDev(player)
  if (proj) return DEV_ADJ[proj]
  const stars = parseInt(player.stars, 10) || 3
  if (devPriors && devPriors[stars] != null) return devPriors[stars]
  return HIDDEN_DEV_BY_STAR[stars] ?? 1
}

// The learned calibration correction (position + archetype offsets) for a
// player, or 0 when the model is inactive/absent.
export function calibrationDelta(player, model) {
  if (!model || !model.active) return 0
  const key = archetypeKey(player.position, player.archetype)
  const bucket = key.split('_')[0]
  return (model.positionOffset?.[bucket] || 0) + (model.archetypeOffset?.[key] || 0)
}

/**
 * Full scout score for a player, or null if they have no scouted attributes.
 * Pass a calibration `model` (from scoutLearning) to apply learned corrections.
 * @returns {number|null} 0–99
 */
export function computeScoutScore(player, model = null) {
  if (!hasAnyAttrs(player)) return null
  const key = archetypeKey(player.position, player.archetype)
  const weights = (model?.active && model.learnedWeights?.[key]) || null
  const base = baseScore(player, weights)
  if (base == null) return null
  const raw = base + devAdj(player, model?.active ? model.devPriors : null)
    + (STAR_ADJ[parseInt(player.stars, 10)] ?? 0) + physBonus(player)
    + calibrationDelta(player, model)
  return Math.max(0, Math.min(99, Math.round(raw)))
}

// Tier bands (our calibration).
export const SCOUT_TIERS = [
  { key: 'elite',   label: 'Elite',   min: 88, color: '#22c55e' },
  { key: 'premium', label: 'Premium', min: 81, color: '#3b82f6' },
  { key: 'core',    label: 'Core',    min: 74, color: '#eab308' },
  { key: 'depth',   label: 'Depth',   min: 0,  color: '#f97316' },
]

export function scoutTier(score) {
  if (score == null) return null
  return SCOUT_TIERS.find((t) => score >= t.min) || SCOUT_TIERS[SCOUT_TIERS.length - 1]
}

// Letter grade — finer-grained label over the same score (A+ … F). Colored by
// the score's tier so it doesn't introduce a new palette.
const LETTER_CUTS = [
  [95, 'A+'], [90, 'A'], [86, 'A-'], [82, 'B+'], [78, 'B'], [74, 'B-'],
  [70, 'C+'], [66, 'C'], [62, 'C-'], [58, 'D+'], [54, 'D'], [50, 'D-'], [0, 'F'],
]
export function scoutLetter(score) {
  if (score == null) return null
  for (const [min, letter] of LETTER_CUTS) if (score >= min) return letter
  return 'F'
}

/**
 * Convenience: { score, tier } for a player (tier is the SCOUT_TIERS entry).
 * Pass a calibration `model` to grade with learned corrections.
 */
export function scoutGrade(player, model = null) {
  const score = computeScoutScore(player, model)
  return { score, tier: scoutTier(score) }
}

// Realistic INCOMING-FRESHMAN overall projection. This is NOT the scout grade
// (a 0–99 prospect grade that runs into the 90s); it's the OVR a recruit would
// actually carry as a true freshman. Anchored on star rating — the strongest
// real-world predictor — within bands observed in CFB 26 (the very best
// freshmen in a class top out around 82–84; typical 5-stars land high-70s/low-
// 80s, 4-stars low-mid 70s, 3-stars high-60s/low-70s), nudged a little by how
// the prospect grades within his star. `model.levelGap`, once the calibration
// model is active, refines the nudge toward this dynasty's observed reality.
const FRESHMAN_OVR_BASE = { 5: 79, 4: 74, 3: 70, 2: 66, 1: 62 }
const FRESHMAN_OVR_BAND = { 5: [76, 84], 4: [71, 79], 3: [66, 74], 2: [61, 70], 1: [57, 66] }
export function projectFreshmanOvr(player, score, model = null) {
  if (score == null) return null
  const stars = Math.max(1, Math.min(5, parseInt(player?.stars, 10) || 3))
  const base = FRESHMAN_OVR_BASE[stars]
  const [lo, hi] = FRESHMAN_OVR_BAND[stars]
  // Within-star nudge from grade (centered on a solid ~80 grade). If the model
  // has learned this dynasty's grade→OVR gap, anchor the nudge on that instead.
  const gap = model?.active && Number.isFinite(model.levelGap) ? model.levelGap : null
  const nudge = gap != null
    ? (score - gap) - base            // model-anchored: how far the calibrated projection sits off the star base
    : (score - 80) * 0.2              // prior: gentle slope, band clamps outliers
  return Math.max(lo, Math.min(hi, Math.round(base + Math.max(-6, Math.min(6, nudge)))))
}

// ── Scheme fit ───────────────────────────────────────────────────────────────
// Offensive archetypes' run/pass lean. Defensive archetypes are omitted — "fit"
// against your OWN offensive identity only makes sense for offensive skill guys.
export const ARCH_TENDENCY = {
  // QB
  'Pocket Passer': 'pass', 'Dual Threat': 'balanced', 'Backfield Creator': 'balanced', 'Pure Runner': 'run',
  // HB
  'Elusive Bruiser': 'run', 'East/West Playmaker': 'run', 'Contact Seeker': 'run',
  'Backfield Threat': 'pass', 'North/South Receiver': 'pass', 'North/South Blocker': 'run',
  'Blocking': 'run', 'Utility': 'balanced',
  // WR
  'Speedster': 'pass', 'Route Artist': 'pass', 'Elusive Route Runner': 'pass',
  'Physical Route Runner': 'pass', 'Gritty Possession': 'pass', 'Contested Specialist': 'pass', 'Gadget': 'balanced',
  // TE
  'Vertical Threat': 'pass', 'Pure Possession': 'pass', 'Possession': 'pass', 'Pure Blocker': 'run',
  // OL
  'Pass Protector': 'pass', 'Raw Strength': 'run', 'Ground and Pound': 'run', 'Agile': 'balanced', 'Well Rounded': 'balanced',
}

export function archetypeTendency(archetype) {
  return ARCH_TENDENCY[(archetype || '').replace(/^ATH\s*-\s*/i, '').replace(/\s*\([A-Z]+\)\s*$/, '').trim()] || null
}

// Infer a team's offensive identity from pass vs rush yards in the latest season
// with stats. Returns 'pass' | 'run' | 'balanced'.
export function inferPlayStyle(players, year) {
  const y = [year - 1, year].reverse().find((yr) =>
    (players || []).some((p) => p.statsByYear?.[yr]?.passing?.yds || p.statsByYear?.[yr]?.rushing?.yds))
  if (y == null) return 'balanced'
  let pass = 0, rush = 0
  for (const p of players || []) {
    pass += p.statsByYear?.[y]?.passing?.yds || 0
    rush += p.statsByYear?.[y]?.rushing?.yds || 0
  }
  const total = pass + rush
  if (!total) return 'balanced'
  if (pass / total > 0.58) return 'pass'
  if (rush / total > 0.48) return 'run'
  return 'balanced'
}

// Does a target's archetype fit the team's identity? null when not applicable
// (no tendency, or balanced scheme — everyone fits).
export function schemeFits(archetype, playStyle) {
  const t = archetypeTendency(archetype)
  if (!t || playStyle === 'balanced') return null
  return t === playStyle || t === 'balanced'
}

// ── Grade breakdown ──────────────────────────────────────────────────────────
// A transparent, recomputed view of how a player's score was reached — the
// weighted base, the attributes that drove it, and each adjustment. Mirrors
// computeScoutScore() exactly so the parts always sum to the published grade.
/**
 * @returns {null | {
 *   score, tier, letter, base, usesWeights, hasDev,
 *   factors:    Array<{ name, value, weight, share }>,   // attributes feeding the base
 *   adjustments: Array<{ label, value, note, kind }>,     // base + each modifier
 * }}
 */
export function gradeBreakdown(player, model = null) {
  if (!hasAnyAttrs(player)) return null
  const attrs = player.attributes || {}
  const present = Object.keys(attrs).filter((k) => Number.isFinite(Number(attrs[k])))
  if (!present.length) return null
  const key = archetypeKey(player.position, player.archetype)
  const learned = (model?.active && model.learnedWeights?.[key]) || null
  const weights = learned || SCOUT_WEIGHTS[key]
    || (isKickerPunter(player) ? KP_FALLBACK_WEIGHTS : null)

  let base, usesWeights = false, factors = []
  const keyed = weights ? present.filter((k) => (weights[k] || 0) > 0) : []
  const totalW = keyed.reduce((a, k) => a + weights[k], 0)
  if (weights && totalW > 0) {
    usesWeights = true
    base = keyed.reduce((a, k) => a + Number(attrs[k]) * weights[k], 0) / totalW
    factors = keyed
      .map((k) => ({ name: k, value: Number(attrs[k]), weight: weights[k], share: weights[k] / totalW }))
      .sort((a, b) => (b.weight - a.weight) || (b.value - a.value))
  } else {
    base = present.reduce((a, k) => a + Number(attrs[k]), 0) / present.length
    factors = present
      .map((k) => ({ name: k, value: Number(attrs[k]), weight: 0, share: 1 / present.length }))
      .sort((a, b) => b.value - a.value)
  }

  const dev = devAdj(player, model?.active ? model.devPriors : null)
  const star = STAR_ADJ[parseInt(player.stars, 10)] ?? 0
  const phys = physBonus(player)
  const cal = calibrationDelta(player, model)
  const score = Math.max(0, Math.min(99, Math.round(base + dev + star + phys + cal)))
  const tier = scoutTier(score)
  const hasDev = !!(player.devTrait && DEV_ADJ[player.devTrait] != null)
  const stars = parseInt(player.stars, 10) || 3

  const adjustments = [
    { kind: 'base', label: usesWeights ? (learned ? 'Learned attribute base' : 'Weighted attribute base') : 'Attribute average', value: Math.round(base),
      note: usesWeights ? `${keyed.length} archetype attribute${keyed.length === 1 ? '' : 's'}${learned ? ', weights tuned from outcomes' : ''}` : 'flat average (no archetype profile)' },
    { kind: 'dev', label: 'Development', value: dev,
      note: hasDev
        ? `${player.devTrait} dev trait`
        : gemBustProjectedDev(player)
          ? `projected ${gemBustProjectedDev(player)} (${cap(String(player.gemBust).toLowerCase())} read, dev trait hidden)`
          : `projected from ${stars}★ (dev trait hidden${model?.active && model.devPriors?.[stars] != null ? ', learned' : ''})` },
    { kind: 'star', label: 'Recruit ranking', value: star, note: `${stars}-star prospect` },
    { kind: 'phys', label: 'Physical tools', value: phys, note: phys > 0 ? 'elite measurables bonus' : 'no elite-tool bonus' },
  ]
  if (Math.round(cal) !== 0) {
    adjustments.push({ kind: 'cal', label: 'Scouting calibration', value: Math.round(cal), note: 'learned from your past classes' })
  }
  return { score, tier, letter: scoutLetter(score), base: Math.round(base), usesWeights, learned: !!learned, hasDev, calibration: Math.round(cal), factors, adjustments }
}

// ── Narrative dossier (templated) ────────────────────────────────────────────
// A full scouting write-up composed at runtime — projection, strengths, gaps,
// physical profile, scheme fit, development outlook, and a bottom line. No
// authored per-archetype prose, so every archetype is covered. scoutReport()
// flattens it to a single string for compact callers.
const TIER_WORD = {
  elite:   'A blue-chip',
  premium: 'A high-major',
  core:    'A solid Power-conference',
  depth:   'A developmental',
}
const DEV_LINE = {
  Elite:  'With an Elite dev trait, he carries program-altering upside and should reach his ceiling quickly.',
  Star:   'A Star dev trait points to a high ceiling and a fast climb up the depth chart.',
  Impact: 'An Impact dev trait gives him better-than-average growth and a quicker path to contributing.',
  Normal: 'A Normal dev trait means steady, rep-driven growth rather than a rapid rise.',
}
// Noun-phrase for each attribute, so the prose reads like a scout, not a stat sheet.
const ATTR_BLURB = {
  Awareness: 'football IQ', Speed: 'top-end speed', Acceleration: 'burst', Strength: 'play strength',
  Agility: 'short-area quickness', 'Change of Direction': 'change-of-direction',
  'Throw Power': 'arm strength', 'Short Accuracy': 'short-area accuracy', 'Medium Accuracy': 'intermediate accuracy',
  'Deep Accuracy': 'deep-ball touch', 'Throw On Run': 'throwing on the move', 'Under Pressure': 'poise under pressure',
  'Break Sack': 'escapability', Carrying: 'ball security', 'Break Tackle': 'contact balance', 'Juke Move': 'open-field juke',
  'Spin Move': 'spin move', 'BC Vision': 'vision as a ball carrier', Catching: 'hands', 'Catch In Traffic': 'catching in traffic',
  'Spectacular Catch': 'highlight ball skills', 'Short Route': 'short-route polish', 'Medium Route': 'intermediate routes',
  'Deep Route': 'vertical route-running', Release: 'release off the line', 'Run Block': 'run blocking',
  'Run Block Power': 'drive-block power', 'Run Block Finesse': 'run-block technique', 'Pass Block': 'pass protection',
  'Pass Block Power': 'anchor in pass pro', 'Pass Block Finesse': 'pass-set technique', 'Impact Blocking': 'finishing blocks',
  'Block Shedding': 'block-shedding', Tackle: 'tackling', 'Hit Power': 'pop on contact', 'Power Moves': 'power rush',
  'Finesse Moves': 'finesse rush', Pursuit: 'pursuit and motor', 'Play Recognition': 'play recognition',
  'Man Coverage': 'man coverage', 'Zone Coverage': 'zone instincts', Press: 'press technique',
  'Kick Power': 'leg strength', 'Kick Accuracy': 'kicking accuracy',
}
const blurb = (name) => ATTR_BLURB[name] || String(name).toLowerCase()
// How a single attribute value reads as a tier word.
const gradeWord = (v) => (v >= 92 ? 'elite' : v >= 86 ? 'plus' : v >= 80 ? 'solid' : v >= 73 ? 'average' : v >= 65 ? 'fringe' : 'poor')
// Role projection from the overall grade — one clean clause, no value judgment
// (the tier word and bottom line carry that, so nothing repeats).
const role = (s) =>
  s >= 90 ? 'an immediate-impact starter'
  : s >= 83 ? 'an early contributor who should compete to start as a freshman'
  : s >= 76 ? 'a rotational piece with starter upside as he develops'
  : s >= 68 ? 'a multi-year developmental project'
  : 'a long-term, traits-based projection'

const lc = (s) => String(s || '').toLowerCase()
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
// "a" / "an" for a letter grade said aloud (A, F start with a vowel sound).
const gradeArticle = (letter) => (/^[AaFf]/.test(letter || '') ? 'an' : 'a')
function listPhrase(xs) {
  if (xs.length <= 1) return xs[0] || ''
  if (xs.length === 2) return `${xs[0]} and ${xs[1]}`
  return `${xs.slice(0, -1).join(', ')}, and ${xs[xs.length - 1]}`
}
// "trait (value)" — the standard way ratings are laid out in the prose.
const rated = (name, value) => `${blurb(name)} (${value})`

const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
// "Name (84 OVR, Jr)" — how a returning roster player is cited in the slotting line.
const roomMember = (x) => `${x.name} (${x.ovr} OVR${x.cls ? `, ${x.cls}` : ''})`

/**
 * A structured scouting dossier — an array of { group, label, body } sentences,
 * or null when the player is unscouted. `group` ('overview' | 'fit' | 'verdict')
 * lets callers fold the sentences into flowing paragraphs.
 * @param {object} player
 * @param {'pass'|'run'|'balanced'} playStyle  the team's offensive identity
 * @param {null | { group?: string, returning: number, rank?: number,
 *          room?: Array<{ name: string, ovr: number|null, cls?: string }>,
 *          projOvr?: number }} depth
 *        next-season depth at the player's position group: returning headcount,
 *        the actual returning ROOM (name/OVR/class, for slotting), and the
 *        recruit's projected freshman OVR. Omit for callers without roster
 *        context (e.g. cards).
 */
export function scoutDossier(player, playStyle = 'balanced', depth = null, model = null) {
  const bd = gradeBreakdown(player, model)
  if (!bd) return null
  const { score, tier, letter, factors, hasDev } = bd
  const attrs = player.attributes || {}
  const arch = (player.archetype || '').replace(/^ATH\s*-\s*/i, '').replace(/\s*\([A-Z]+\)\s*$/, '').trim()
  const posLabel = player.position || 'prospect'
  const archPhrase = arch ? `${lc(arch)} ${posLabel}` : posLabel
  const stars = parseInt(player.stars, 10) || 3
  const out = []
  // Every attribute is named at most once across the whole write-up.
  const used = new Set()

  // ── OVERVIEW ───────────────────────────────────────────────────────────────
  // Projection — identity, role, and the letter grade (no numeric overall).
  out.push({
    group: 'overview', label: 'Projection',
    body: `${TIER_WORD[tier.key]} ${archPhrase} who profiles as ${role(score)}, earning ${gradeArticle(letter)} ${letter} on our board.`,
  })

  // Strengths — lead with the single best trait, then the supporting cast. No
  // attribute is repeated; each is cited once with its rating.
  const strong = factors.filter((f) => f.value >= 80)
  if (strong.length) {
    const best = strong[0]
    used.add(best.name)
    const rest = strong.slice(1, 4).filter((f) => { used.add(f.name); return true })
    const lead = `His calling card is ${gradeWord(best.value)} ${rated(best.name, best.value)}`
    out.push({
      group: 'overview', label: 'Strengths',
      body: rest.length
        ? `${lead}, and he backs it with ${listPhrase(rest.map((f) => rated(f.name, f.value)))}.`
        : `${lead} — the one trait scouts most trust to translate.`,
    })
  } else {
    const top = factors.slice(0, 2)
    top.forEach((f) => used.add(f.name))
    out.push({
      group: 'overview', label: 'Strengths',
      body: top.length
        ? `Nothing grades as a true plus yet; his steadiest marks are ${listPhrase(top.map((f) => rated(f.name, f.value)))}.`
        : 'He has not been scouted enough to flag a standout trait.',
    })
  }

  // Areas to develop — only the archetype-defining attributes that grade low,
  // and only ones not already cited as strengths.
  const gaps = factors
    .filter((f) => f.weight >= 5 && f.value < 73 && !used.has(f.name))
    .sort((a, b) => a.value - b.value).slice(0, 3)
  gaps.forEach((g) => used.add(g.name))
  if (gaps.length) {
    const severe = gaps.some((g) => g.value < 63)
    out.push({
      group: 'overview', label: 'Areas to develop',
      body: `The questions center on ${listPhrase(gaps.map((g) => rated(g.name, g.value)))}${severe ? ' — real holes he must close to reach the projection.' : ', which he will need to firm up to hit his ceiling.'}`,
    })
  } else {
    out.push({
      group: 'overview', label: 'Areas to develop',
      body: 'There is no glaring hole in his game for the position — his defining marks all grade cleanly.',
    })
  }

  // ── FIT ──────────────────────────────────────────────────────────────────
  // Measurables — frame plus any physical tool not already named above.
  const size = [player.height, player.weight ? `${player.weight} lbs` : null].filter(Boolean).join(', ')
  const physBits = ['Speed', 'Acceleration', 'Strength', 'Agility', 'Change of Direction']
    .filter((k) => Number.isFinite(Number(attrs[k])) && !used.has(k))
    .map((k) => { used.add(k); return `${gradeWord(Number(attrs[k]))} ${rated(k, Number(attrs[k]))}` })
  if (size || physBits.length) {
    let body
    if (size && physBits.length) body = `He checks in at ${size}, and the testing profile adds ${listPhrase(physBits)}.`
    else if (size) body = `He checks in at ${size}.`
    else body = `${cap(listPhrase(physBits))} headline${physBits.length === 1 ? 's' : ''} his physical profile.`
    out.push({ group: 'fit', label: 'Measurables', body })
  }

  // Scheme fit — only when his archetype actually leans one way and your offense
  // has an identity (balanced/defensive archetypes contribute nothing here).
  const fit = schemeFits(player.archetype, playStyle)
  const scheme = playStyle === 'pass' ? 'pass-heavy' : 'run-heavy'
  if (fit === true) {
    out.push({ group: 'fit', label: 'Scheme fit', body: `Schematically he is a clean fit — the archetype is exactly what your ${scheme} offense asks for.` })
  } else if (fit === false) {
    out.push({ group: 'fit', label: 'Scheme fit', body: `Schematically he is a stretch for your ${scheme} offense; you would be tailoring usage to his strengths rather than plugging him into a defined role.` })
  }

  // Depth-chart fit — slot his PROJECTED freshman OVR into your ACTUAL returning
  // room at the position, naming the players he would sit behind and ahead of.
  if (depth && Number.isFinite(depth.returning)) {
    const g = depth.group || posLabel
    const room = (depth.room || []).filter((x) => Number.isFinite(x.ovr)).sort((a, b) => b.ovr - a.ovr)
    const proj = Number.isFinite(depth.projOvr) ? depth.projOvr : null
    let body
    if (depth.returning <= 0 || room.length === 0) {
      // Nobody (rated) returns: open competition.
      body = depth.returning <= 0
        ? `With nobody returning at ${g} next season, the job is open — he would have a clear runway to early snaps.`
        : `Your ${depth.returning} returning ${g}${depth.returning === 1 ? '' : 's'} next season ${depth.returning === 1 ? 'is' : 'are'} unrated, but the room is thin enough that he could push for snaps right away.`
    } else if (proj == null) {
      body = `You return ${depth.returning} at ${g} next season; once he is scouted further we can project exactly where he slots.`
    } else {
      const ahead = room.filter((x) => x.ovr > proj)
      const behind = room.filter((x) => x.ovr <= proj)
      const slot = ordinal(ahead.length + 1)
      if (ahead.length === 0) {
        const top = room[0]
        body = `Projecting around ${proj} OVR as a true freshman, he would walk in as your top ${g} from day one — above a returning room led by ${roomMember(top)}.`
      } else {
        const aheadNamed = ahead.slice(0, 3).map(roomMember)
        const aheadPhrase = ahead.length > 3 ? `${listPhrase(aheadNamed)} and ${ahead.length - 3} more` : listPhrase(aheadNamed)
        const tail = behind.length
          ? ` and ahead of ${behind.length === 1 ? roomMember(behind[0]) : `${behind.length} others`}`
          : ''
        const role = ahead.length <= 1 ? 'right into the two-deep' : ahead.length === 2 ? 'into the rotation' : 'a likely redshirt-and-develop year before he factors'
        body = `Projecting around ${proj} OVR as a true freshman, he would slot ${slot} at ${g} next season — behind ${aheadPhrase}${tail} — ${ahead.length <= 2 ? `pushing ${role}` : role}.`
      }
    }
    out.push({ group: 'fit', label: 'Depth-chart fit', body })
  }

  // ── VERDICT ────────────────────────────────────────────────────────────────
  // Development outlook — the dev trait if known, a Gem/Bust-driven projection
  // when scouts have a read, else an honest star-based estimate.
  const projDev = gemBustProjectedDev(player)
  let devBody
  if (hasDev) {
    devBody = DEV_LINE[player.devTrait]
  } else if (projDev === 'Normal') {
    devBody = `Scouts have flagged him a bust, so even with the dev trait still hidden we project ordinary Normal development — temper the upside against his ${stars}-star billing.`
  } else if (projDev) {
    devBody = `Scouts have flagged him a gem, so we project ${projDev}-tier growth before his dev trait is even revealed — he should out-develop his ${stars}-star billing.`
  } else {
    devBody = `His dev trait is not yet visible — typical before signing day — so this grade leans on his ${stars}-star billing and projects his growth conservatively; a hidden Impact-or-better trait would raise it.`
  }
  out.push({ group: 'verdict', label: 'Development outlook', body: devBody })

  // Bottom line — a recruiting recommendation, tied to grade and distinct from
  // the role projection so it never restates it.
  out.push({
    group: 'verdict', label: 'Bottom line',
    body: score >= 88 ? 'Bottom line: a priority target — recruit him like a difference-maker.'
      : score >= 81 ? 'Bottom line: a high-value get worth real resources on the trail.'
      : score >= 74 ? 'Bottom line: a solid addition worth a scholarship if he fits the class plan.'
      : 'Bottom line: a developmental flier — worth a late spot if the board thins.',
  })

  return out
}

// Fold a dossier into flowing paragraphs (one per group, in order).
export function dossierParagraphs(sections) {
  if (!sections) return []
  const order = ['overview', 'fit', 'verdict']
  return order
    .map((g) => sections.filter((s) => s.group === g).map((s) => s.body).join(' '))
    .filter(Boolean)
}

/**
 * The dossier flattened to a single paragraph (for compact callers like cards).
 * @returns {string|null}
 */
export function scoutReport(player, playStyle = 'balanced', depth = null, model = null) {
  const d = scoutDossier(player, playStyle, depth, model)
  return d ? d.map((s) => s.body).join(' ') : null
}

// The player's top scouted attributes by this archetype's emphasis (for display).
export function topScoutedAttrs(player, n = 3) {
  const attrs = player.attributes || {}
  const weights = SCOUT_WEIGHTS[archetypeKey(player.position, player.archetype)] || {}
  const names = attributeNamesFor(player.position, player.archetype) || Object.keys(attrs)
  return names
    .filter((name) => attrs[name] != null && attrs[name] !== '')
    .map((name) => ({ name, value: Number(attrs[name]), weight: weights[name] || 0 }))
    .sort((a, b) => (b.weight - a.weight) || (b.value - a.value))
    .slice(0, n)
}
