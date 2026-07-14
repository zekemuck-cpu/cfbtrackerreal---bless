// Archetype -> scheme fit weights, keyed by each real in-game player
// archetype (player.archetype) against the canonical CFB27 scheme list.
// This is deliberately separate from schemes.js's SCHEME_ATTRS (an
// attribute-weighting table used only by PositionBattles) — Scheme Builder
// scores fit by play-style archetype, not raw ratings.
//
// Scale: 0-3 per archetype per position ("3" = ideal fit, "0" = poor fit).
// Archetypes not listed for a given scheme/position default to a neutral 1
// at lookup time (see getArchetypeWeight) — only standout fits/misses need
// an entry.
//
// Offense has 11 flat schemes, hand-authored directly. Defense has 30 named
// schemes that are mostly Man/Zone/Pressure/Shell/etc. variants of 7
// structural fronts, so it's built as BASE_FRONT_FIT + small additive
// COVERAGE_MODIFIERS composed per scheme (mirrors the base+extends merge
// pattern already used in src/editions/index.js) instead of 30 hand-typed
// tables.

export const OFFENSE_SCHEMES = [
  'Air Raid', 'Go Go', 'Multiple', 'Option', 'Pistol', 'Power Spread',
  'Pro Style', 'Run & Shoot', 'Spread', 'Spread Option', 'Veer & Shoot',
]

export const DEFENSE_SCHEMES = [
  '3-2-6',
  '3-3-5', '3-3-5 Man', '3-3-5 Man Pressure', '3-3-5 Shell', '3-3-5 Three High', '3-3-5 Tite', '3-3-5 Zone', '3-3-5 Zone Pressure',
  '3-4', '3-4 Man', '3-4 Man Pressure', '3-4 Multiple', '3-4 Shell', '3-4 Zone', '3-4 Zone Pressure',
  '4-2-5', '4-2-5 Man', '4-2-5 Man Pressure', '4-2-5 Shell', '4-2-5 Zone', '4-2-5 Zone Pressure',
  '4-3', '4-3 Man', '4-3 Man Pressure', '4-3 Multiple', '4-3 Press Quarters', '4-3 Shell', '4-3 Zone', '4-3 Zone Pressure',
  'Multiple', 'Multiple D',
]

// ── Offense (hand-authored, one table per scheme) ───────────────────────────
export const OFFENSE_ARCHETYPE_FIT = {
  // Real playbookgamer.com tendency data: 74% pass, 19% run, 2% option, 1%
  // qbRun, 0% motion, 0.4 avg TE bodies (lowest of all 11), 3.4 avg WR
  // (2nd-highest) — a true pocket-passer system with almost no designed QB
  // run or TE usage, not a "mobile QB with some run game" hybrid.
  'Air Raid': {
    // 0% motion, 1% qbRun, 2% option — a designed-run QB's whole value
    // proposition (his legs) goes essentially unused here.
    QB: { 'Pocket Passer': 3, 'Pure Runner': 0 },
    HB: { 'North/South Receiver': 3 },
    WR: { 'Route Artist': 3, Speedster: 3, 'Elusive Route Runner': 2 },
    TE: { 'Vertical Threat': 2 },
    OL: { 'Pass Protector': 3 },
  },
  'Go Go': {
    QB: { 'Dual Threat': 3, 'Pocket Passer': 2 },
    HB: { 'East/West Playmaker': 3, 'North/South Receiver': 2 },
    WR: { Speedster: 3, 'Route Artist': 2 },
    TE: { 'Vertical Threat': 2 },
    OL: { Agile: 3, 'Pass Protector': 2 },
  },
  // Real tendency data corrects my first pass at this (which leaned too far
  // toward "run-pass balanced, mobile QB"): Multiple is actually pass-
  // leaning (62%, 3rd-highest of 11 schemes) with almost no designed QB run
  // (qbRun/option both bottom-3) and the 2nd-highest TE usage of any
  // scheme (1.1 avg TE bodies) — closer to "a complete, multi-TE passing
  // attack" than "balanced run/pass with a running QB." Still distinct from
  // Pro Style: less run-committed (31% vs Pro Style's 37%), more balanced
  // backfield/WR usage rather than Pro Style's FB/2-back identity.
  Multiple: {
    QB: { 'Pocket Passer': 3, 'Dual Threat': 2 },
    HB: { 'Backfield Threat': 3, 'North/South Receiver': 2 },
    FB: { Utility: 3 },
    WR: { 'Physical Route Runner': 3, 'Contested Specialist': 2 },
    TE: { 'Physical Route Runner': 3, 'Pure Possession': 2 },
    OL: { 'Pass Protector': 3, 'Well Rounded': 2 },
  },
  Option: {
    // Lowest pass% of all 11 schemes (41%) and highest run/option/qbRun —
    // a QB who can't threaten defenses with his legs can't actually run
    // this playbook's core reads (dive/keep/pitch).
    QB: { 'Pure Runner': 3, 'Dual Threat': 3, 'Pocket Passer': 0 },
    HB: { 'East/West Playmaker': 2, 'Contact Seeker': 2 },
    FB: { Blocking: 3 },
    TE: { 'Pure Blocker': 3 },
    OL: { Agile: 3, 'Raw Strength': 2 },
    WR: { 'Physical Route Runner': 2 },
  },
  // Despite the name's real-world association with mobile QBs, the real
  // data shows Pistol here has the LOWEST qbRun of all 11 schemes and only
  // mid-pack option usage — it's a power-run, TE-heavy (3rd-highest TE
  // usage) scheme with a QB who doesn't need to be a runner, not a
  // read-option system. But 46% run still means a lot of busted protection
  // and broken pockets, so this is Backfield Creator's real home — a QB who
  // isn't a designed runner but has to extend plays and create off-schedule
  // — rather than a true Pocket Passer or Dual Threat.
  Pistol: {
    QB: { 'Backfield Creator': 3, 'Pocket Passer': 2 },
    HB: { 'Elusive Bruiser': 3 },
    TE: { 'Pure Blocker': 2, 'Physical Route Runner': 2 },
    OL: { 'Raw Strength': 3, Agile: 2 },
    WR: { 'Physical Route Runner': 2 },
  },
  // 2nd-highest TE usage of all 11 schemes (right behind Pro Style) — the
  // real data supports a stronger blocking-TE reward than "good" (2).
  'Power Spread': {
    QB: { 'Dual Threat': 2, 'Pocket Passer': 2 },
    HB: { 'Elusive Bruiser': 3, 'Contact Seeker': 2 },
    FB: { Blocking: 2 },
    TE: { 'Pure Blocker': 3, 'Physical Route Runner': 2 },
    OL: { 'Raw Strength': 3, Agile: 2 },
    WR: { 'Physical Route Runner': 2 },
  },
  // Highest TE usage AND highest motion of all 11 schemes — the real
  // multi-formation, multi-TE pro-style identity. That supports two ideal
  // TE roles at once (in-line blocker + tougher in-line receiving
  // complement), which real pro-style offenses genuinely deploy together
  // rather than picking one.
  'Pro Style': {
    // 0% qbRun (lowest of all 11) and 1% option — a run-first QB archetype
    // has no real outlet here; this is a drop-back, under-center system.
    QB: { 'Pocket Passer': 3, 'Pure Runner': 0 },
    HB: { 'Contact Seeker': 3, 'Elusive Bruiser': 2 },
    FB: { Blocking: 3 },
    TE: { 'Pure Blocker': 3, 'Gritty Possession': 3 },
    OL: { 'Raw Strength': 3, 'Pass Protector': 2 },
    WR: { 'Contested Specialist': 3, 'Physical Route Runner': 2 },
  },
  'Run & Shoot': {
    QB: { 'Pocket Passer': 2, 'Dual Threat': 2 },
    WR: { 'Route Artist': 3, 'Elusive Route Runner': 3, Speedster: 2 },
    // Highest pass% (75%) and lowest RB/TE usage of any scheme — there's
    // barely a between-the-tackles run game for a pure banger to plug into.
    HB: { 'North/South Receiver': 3, 'Contact Seeker': 0 },
    OL: { 'Pass Protector': 3 },
  },
  Spread: {
    QB: { 'Dual Threat': 3 },
    HB: { 'East/West Playmaker': 3 },
    WR: { Speedster: 2, 'Route Artist': 2 },
    TE: { 'Physical Route Runner': 2 },
    OL: { Agile: 3 },
  },
  'Spread Option': {
    QB: { 'Dual Threat': 3, 'Pure Runner': 2 },
    HB: { 'East/West Playmaker': 3 },
    WR: { Speedster: 2, 'Physical Route Runner': 2 },
    TE: { 'Physical Route Runner': 2 },
    OL: { Agile: 3 },
  },
  // 3rd-highest WR volume + 2nd-highest RPO rate of all 11 schemes — the
  // "Shoot" half genuinely needs a big-play seam/mismatch TE, not just a
  // "good" one, since the passing game leans on it more than a run-first
  // option scheme would.
  'Veer & Shoot': {
    QB: { 'Dual Threat': 3 },
    HB: { 'East/West Playmaker': 2, 'Contact Seeker': 2 },
    WR: { Speedster: 3, 'Contested Specialist': 2 },
    TE: { 'Vertical Threat': 3 },
    OL: { Agile: 2, 'Raw Strength': 2 },
  },
}

// ── Defense: 7 structural base fronts ────────────────────────────────────
const BASE_FRONT_FIT = {
  '3-2-6': {
    LEDG: { 'Speed Rusher': 3, 'Edge Setter': 1 },
    REDG: { 'Speed Rusher': 3, 'Edge Setter': 1 },
    DT: { 'Gap Specialist': 2, 'Speed Rusher': 2 },
    SAM: { Lurker: 3, 'Signal Caller': 2 },
    MIKE: { Lurker: 3, 'Signal Caller': 2 },
    WILL: { Lurker: 3, 'Signal Caller': 2 },
    CB: { Zone: 2, Field: 2 },
    FS: { 'Coverage Specialist': 3, Hybrid: 2 },
    SS: { 'Coverage Specialist': 3, Hybrid: 2 },
  },
  '3-3-5': {
    LEDG: { 'Speed Rusher': 2, 'Power Rusher': 2 },
    REDG: { 'Speed Rusher': 2, 'Power Rusher': 2 },
    DT: { 'Gap Specialist': 3 },
    SAM: { Lurker: 2, Thumper: 2, 'Signal Caller': 2 },
    MIKE: { Lurker: 2, Thumper: 2, 'Signal Caller': 2 },
    WILL: { Lurker: 2, Thumper: 2, 'Signal Caller': 2 },
    CB: { Zone: 2, Boundary: 2 },
    FS: { Hybrid: 3, 'Box Specialist': 2 },
    SS: { Hybrid: 3, 'Box Specialist': 2 },
  },
  // Classic power-run-stopping front — the boundary corner has to hold up
  // in run support more than a field corner would, so Boundary is this
  // front's ideal CB fit, not just a good one.
  '3-4': {
    LEDG: { 'Power Rusher': 2, 'Edge Setter': 3 },
    REDG: { 'Power Rusher': 2, 'Edge Setter': 3 },
    DT: { 'Gap Specialist': 3, 'Pure Power': 2 },
    SAM: { Thumper: 2, 'Signal Caller': 2 },
    MIKE: { Thumper: 2, 'Signal Caller': 2 },
    WILL: { Thumper: 2, 'Signal Caller': 2 },
    CB: { Boundary: 3, 'Bump and Run': 2 },
    FS: { 'Box Specialist': 2, Hybrid: 2 },
    SS: { 'Box Specialist': 2, Hybrid: 2 },
  },
  // A true nickel front built for speed over size at every level — the
  // interior rush threat here should be a quick, penetrating DT, not just a
  // good fit for it.
  '4-2-5': {
    LEDG: { 'Speed Rusher': 3 },
    REDG: { 'Speed Rusher': 3 },
    DT: { 'Speed Rusher': 3, 'Gap Specialist': 2 },
    SAM: { 'Signal Caller': 2, Lurker: 2 },
    MIKE: { 'Signal Caller': 2, Lurker: 2 },
    WILL: { 'Signal Caller': 2, Lurker: 2 },
    CB: { Zone: 2, Field: 2 },
    FS: { 'Coverage Specialist': 2, Hybrid: 2 },
    SS: { 'Coverage Specialist': 2, Hybrid: 2 },
  },
  '4-3': {
    LEDG: { 'Power Rusher': 2, 'Edge Setter': 2 },
    REDG: { 'Power Rusher': 2, 'Edge Setter': 2 },
    DT: { 'Pure Power': 3, 'Gap Specialist': 2 },
    SAM: { Thumper: 2 },
    MIKE: { Thumper: 3, 'Signal Caller': 2 },
    WILL: { Lurker: 2 },
    CB: { 'Bump and Run': 2, Boundary: 2 },
    FS: { 'Box Specialist': 2, Hybrid: 2 },
    SS: { 'Box Specialist': 2, Hybrid: 2 },
  },
  // Same identity shift as offense's Multiple: a defense that shows
  // several fronts/coverages needs adaptable, cerebral personnel rather
  // than pure specialists — signal-caller linebackers who can make the
  // checks, hybrid safeties comfortable in multiple roles, and edge
  // rushers who aren't locked into one rush style.
  Multiple: {
    LEDG: { 'Speed Rusher': 2, 'Power Rusher': 2 },
    REDG: { 'Speed Rusher': 2, 'Power Rusher': 2 },
    DT: { 'Gap Specialist': 3 },
    SAM: { 'Signal Caller': 3, Lurker: 2 },
    MIKE: { 'Signal Caller': 3, Lurker: 2 },
    WILL: { 'Signal Caller': 3, Lurker: 2 },
    CB: { Zone: 2, Boundary: 2 },
    FS: { Hybrid: 3 },
    SS: { Hybrid: 3 },
  },
  'Multiple D': {
    LEDG: { 'Speed Rusher': 2, 'Power Rusher': 1 },
    REDG: { 'Speed Rusher': 2, 'Power Rusher': 1 },
    DT: { 'Gap Specialist': 2 },
    SAM: { Lurker: 2, 'Signal Caller': 2 },
    MIKE: { Lurker: 2, 'Signal Caller': 2 },
    WILL: { Lurker: 2, 'Signal Caller': 2 },
    CB: { Zone: 2, 'Bump and Run': 1 },
    FS: { Hybrid: 3 },
    SS: { Hybrid: 3 },
  },
}

// ── Additive coverage/pressure-style deltas layered onto a base front ──────
const LB = ['SAM', 'MIKE', 'WILL']
const EDGE = ['LEDG', 'REDG']
const SAFETY = ['FS', 'SS']

// Re-derived from real playbookgamer.com per-scheme zone/man/blitz/match
// splits: for every front that has both a plain and a styled variant (e.g.
// "3-4" vs "3-4 Man"), diffed the styled variant against its own plain
// front, then averaged that delta across all fronts sharing the style.
// Two real findings changed what was here before:
//   - The 5 base fronts (3-2-6/3-3-5/3-4/4-2-5/4-3) turned out to be very
//     similar in zone/man/blitz/match mix on their own (22-27% zone, 11-14%
//     man, 41-46% blitz, 17-23% match) — coverage IDENTITY lives almost
//     entirely in the style modifier, not the front, which is exactly the
//     base+modifier split this file already uses. Good.
//   - "Zone Pressure" is actually the single MOST blitz-heavy style in the
//     real data (+11.3 blitz vs its base front, higher even than "Man
//     Pressure"'s +9.6) while its own zone rate goes DOWN vs base (-5.3).
//     The old table rewarded Zone CB here, which the data flatly
//     contradicts — it should reward pass rush, not zone coverage.
const COVERAGE_MODIFIERS = {
  // zone -8.0, man +11.7 (strongest man signal of any style, and the
  // single most lopsided delta in the whole dataset), blitz -1.7 — a pure
  // zone-read CB is a genuine scheme mismatch here, not just a non-fit.
  Man: { CB: { 'Bump and Run': 2, Zone: 0 }, SAFETY: { 'Box Specialist': 1 } },
  // zone -6.9, man +2.6, blitz +9.6 — pressure is the bigger signal than man
  ManPressure: {
    CB: { 'Bump and Run': 1 }, SAFETY: { 'Box Specialist': 1 },
    EDGE: { 'Speed Rusher': 2, 'Power Rusher': 1 }, LB: { 'Signal Caller': 2 },
  },
  // zone +3.7, man/blitz/match all roughly flat — the "purest" zone style
  Zone: { CB: { Zone: 2, Field: 1 }, SAFETY: { 'Coverage Specialist': 1 } },
  // zone -5.3, man -2.5, blitz +11.3 (highest blitz delta of any style),
  // match -3.4 — despite the name, this is the most blitz-heavy style, not
  // a zone-coverage one. The highest blitz signal of any style deserves
  // interior pass-rush reward too, not just off the edge.
  ZonePressure: {
    EDGE: { 'Speed Rusher': 2, 'Power Rusher': 2 }, DT: { 'Power Rusher': 2 },
    LB: { 'Signal Caller': 2, Lurker: 1 }, CB: { Zone: 1 },
  },
  // zone -4.6, man +2.6, blitz -3.2, match +5.1 (dominant signal) — a true
  // coverage shell, closer to pattern-match/hybrid safety play than pure
  // deep-zone.
  Shell: { SAFETY: { Hybrid: 2, 'Coverage Specialist': 2 }, CB: { Zone: 1 } },
  // zone +5.6 (2nd-highest zone delta of any style), blitz -7.7 (heavy
  // pull-back-and-cover, minimal pressure) — genuinely the deepest/safest
  // zone look, matching "three deep safeties."
  ThreeHigh: { SAFETY: { 'Coverage Specialist': 2 }, CB: { Zone: 2, Field: 1 } },
  // zone -4.1, man +7.0, blitz -8.0 (biggest pressure drop of any style),
  // match +5.1 — the front controls gaps with size, so the back end sits
  // in man/match rather than blitzing to create pressure.
  Tite: {
    DT: { 'Pure Power': 2, 'Gap Specialist': 1 }, EDGE: { 'Pure Power': 3, 'Power Rusher': 1 }, LB: { Thumper: 1 },
    CB: { 'Bump and Run': 1 }, SAFETY: { Hybrid: 1 },
  },
  // zone -5.2, man +1.1, blitz -2.8, match +6.9 (dominant signal) — true
  // pattern-match quarters coverage, closer to Hybrid than pure zone.
  PressQuarters: { CB: { 'Bump and Run': 2 }, SAFETY: { Hybrid: 2, 'Coverage Specialist': 1 } },
  // All four deltas negligible (|delta| < 2) — "Multiple" as a coverage
  // modifier is about disguise/pre-snap looks, not a real shift in the
  // zone/man/blitz mix, so it stays close to neutral.
  Multiple: { LB: { 'Signal Caller': 1 }, CB: { Zone: 1 } },
}

// scheme name -> [base front, modifier key | null]
const DEFENSE_COMPOSITION = {
  '3-2-6': ['3-2-6', null],
  '3-3-5': ['3-3-5', null],
  '3-3-5 Man': ['3-3-5', 'Man'],
  '3-3-5 Man Pressure': ['3-3-5', 'ManPressure'],
  '3-3-5 Shell': ['3-3-5', 'Shell'],
  '3-3-5 Three High': ['3-3-5', 'ThreeHigh'],
  '3-3-5 Tite': ['3-3-5', 'Tite'],
  '3-3-5 Zone': ['3-3-5', 'Zone'],
  '3-3-5 Zone Pressure': ['3-3-5', 'ZonePressure'],
  '3-4': ['3-4', null],
  '3-4 Man': ['3-4', 'Man'],
  '3-4 Man Pressure': ['3-4', 'ManPressure'],
  '3-4 Multiple': ['3-4', 'Multiple'],
  '3-4 Shell': ['3-4', 'Shell'],
  '3-4 Zone': ['3-4', 'Zone'],
  '3-4 Zone Pressure': ['3-4', 'ZonePressure'],
  '4-2-5': ['4-2-5', null],
  '4-2-5 Man': ['4-2-5', 'Man'],
  '4-2-5 Man Pressure': ['4-2-5', 'ManPressure'],
  '4-2-5 Shell': ['4-2-5', 'Shell'],
  '4-2-5 Zone': ['4-2-5', 'Zone'],
  '4-2-5 Zone Pressure': ['4-2-5', 'ZonePressure'],
  '4-3': ['4-3', null],
  '4-3 Man': ['4-3', 'Man'],
  '4-3 Man Pressure': ['4-3', 'ManPressure'],
  '4-3 Multiple': ['4-3', 'Multiple'],
  '4-3 Press Quarters': ['4-3', 'PressQuarters'],
  '4-3 Shell': ['4-3', 'Shell'],
  '4-3 Zone': ['4-3', 'Zone'],
  '4-3 Zone Pressure': ['4-3', 'ZonePressure'],
  Multiple: ['Multiple', null],
  'Multiple D': ['Multiple D', null],
}

function applyModifierGroup(table, group, positions, deltas) {
  if (!deltas) return
  for (const pos of positions) {
    table[pos] = table[pos] || {}
    for (const [archetype, delta] of Object.entries(deltas)) {
      table[pos][archetype] = (table[pos][archetype] || 0) + delta
    }
  }
}

function composeDefenseFit(baseKey, modifierKey) {
  const base = BASE_FRONT_FIT[baseKey]
  const table = {}
  for (const [pos, weights] of Object.entries(base)) table[pos] = { ...weights }
  const mod = modifierKey ? COVERAGE_MODIFIERS[modifierKey] : null
  if (mod) {
    if (mod.CB) applyModifierGroup(table, 'CB', ['CB'], mod.CB)
    if (mod.SAFETY) applyModifierGroup(table, 'SAFETY', SAFETY, mod.SAFETY)
    if (mod.EDGE) applyModifierGroup(table, 'EDGE', EDGE, mod.EDGE)
    if (mod.LB) applyModifierGroup(table, 'LB', LB, mod.LB)
    if (mod.DT) applyModifierGroup(table, 'DT', ['DT'], mod.DT)
  }
  return table
}

export const DEFENSE_ARCHETYPE_FIT = Object.fromEntries(
  DEFENSE_SCHEMES.map((scheme) => {
    const [baseKey, modifierKey] = DEFENSE_COMPOSITION[scheme]
    return [scheme, composeDefenseFit(baseKey, modifierKey)]
  }),
)

const NEUTRAL_WEIGHT = 1

// Positions LT/LG/C/RG/RT all share the offense fit table's generic 'OL' entry.
const OL_POSITIONS = new Set(['LT', 'LG', 'C', 'RG', 'RT'])
// Extra depth-chart slots (both sides) share their base position's fit
// table — without this, setting an archetype on e.g. WR2/TE2/HB2 (which
// scoreSchemeFit's SCHEME_FIT_SLOTS and scoreFormationFit's
// offenseSlotWeights both read) silently never mattered: OFFENSE_ARCHETYPE_FIT
// only has entries keyed 'WR'/'TE'/'HB', so an unaliased 'WR2' lookup always
// missed the table and fell through to NEUTRAL_WEIGHT regardless of archetype.
const POSITION_ALIAS = {
  DT2: 'DT', DT3: 'DT', CB2: 'CB', NB: 'CB', S3: 'FS',
  WR2: 'WR', WR3: 'WR', SLWR: 'WR', TE2: 'TE', HB2: 'HB',
}

export function getArchetypeWeight(side, scheme, position, archetype) {
  if (!archetype) return NEUTRAL_WEIGHT
  const table = side === 'offense' ? OFFENSE_ARCHETYPE_FIT[scheme] : DEFENSE_ARCHETYPE_FIT[scheme]
  if (!table) return NEUTRAL_WEIGHT
  const pos = side === 'offense' && OL_POSITIONS.has(position) ? 'OL' : (POSITION_ALIAS[position] || position)
  const weights = table[pos]
  if (!weights) return NEUTRAL_WEIGHT
  return weights[archetype] ?? NEUTRAL_WEIGHT
}

// The real in-game archetype options per position (confirmed from
// src/data/defaultRosters/*.json — the game's own per-position archetype
// taxonomy), used to power an in-tool archetype editor. OL positions and the
// extra depth-chart slots share their base position's list, same as above.
const ARCHETYPES_BY_BASE_POSITION = {
  QB: ['Pocket Passer', 'Dual Threat', 'Backfield Creator', 'Pure Runner'],
  HB: ['East/West Playmaker', 'Elusive Bruiser', 'North/South Receiver', 'Backfield Threat', 'Contact Seeker'],
  FB: ['Blocking', 'Utility'],
  WR: ['Route Artist', 'Elusive Route Runner', 'Speedster', 'Physical Route Runner', 'Contested Specialist'],
  TE: ['Physical Route Runner', 'Gritty Possession', 'Vertical Threat', 'Pure Blocker', 'Pure Possession'],
  OL: ['Pass Protector', 'Raw Strength', 'Agile', 'Well Rounded'],
  LEDG: ['Speed Rusher', 'Power Rusher', 'Pure Power', 'Edge Setter'],
  REDG: ['Speed Rusher', 'Power Rusher', 'Pure Power', 'Edge Setter'],
  DT: ['Gap Specialist', 'Pure Power', 'Speed Rusher', 'Power Rusher'],
  SAM: ['Signal Caller', 'Lurker', 'Thumper'],
  MIKE: ['Signal Caller', 'Lurker', 'Thumper'],
  WILL: ['Signal Caller', 'Lurker', 'Thumper'],
  CB: ['Zone', 'Boundary', 'Bump and Run', 'Field'],
  FS: ['Box Specialist', 'Hybrid', 'Coverage Specialist'],
  SS: ['Box Specialist', 'Hybrid', 'Coverage Specialist'],
  K: ['Power', 'Accurate'],
  P: ['Power', 'Accurate'],
}

export function archetypesForPosition(position) {
  const pos = OL_POSITIONS.has(position) ? 'OL' : (POSITION_ALIAS[position] || position)
  return ARCHETYPES_BY_BASE_POSITION[pos] || []
}
