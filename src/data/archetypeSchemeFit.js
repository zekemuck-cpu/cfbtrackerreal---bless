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
  'Air Raid': {
    QB: { 'Pocket Passer': 3, 'Dual Threat': 2 },
    HB: { 'North/South Receiver': 3, 'East/West Playmaker': 2 },
    WR: { 'Route Artist': 3, Speedster: 3, 'Elusive Route Runner': 2 },
    TE: { 'Vertical Threat': 2, 'Physical Route Runner': 2 },
    FB: { Utility: 1 },
    OL: { 'Pass Protector': 3, Agile: 2 },
  },
  'Go Go': {
    QB: { 'Dual Threat': 3, 'Pocket Passer': 2 },
    HB: { 'East/West Playmaker': 3, 'North/South Receiver': 2 },
    WR: { Speedster: 3, 'Route Artist': 2 },
    TE: { 'Vertical Threat': 2 },
    OL: { Agile: 3, 'Pass Protector': 2 },
  },
  Multiple: {
    QB: { 'Pocket Passer': 2, 'Dual Threat': 2 },
    HB: { 'Backfield Threat': 2 },
    WR: { 'Physical Route Runner': 2, 'Route Artist': 2 },
    TE: { 'Pure Possession': 2, 'Physical Route Runner': 2 },
    OL: { 'Well Rounded': 3 },
  },
  Option: {
    QB: { 'Pure Runner': 3, 'Dual Threat': 3 },
    HB: { 'East/West Playmaker': 2, 'Contact Seeker': 2 },
    FB: { Blocking: 3 },
    TE: { 'Pure Blocker': 3 },
    OL: { Agile: 3, 'Raw Strength': 2 },
    WR: { 'Physical Route Runner': 2 },
  },
  Pistol: {
    QB: { 'Dual Threat': 3 },
    HB: { 'Elusive Bruiser': 3, 'East/West Playmaker': 2 },
    TE: { 'Pure Blocker': 2, 'Physical Route Runner': 2 },
    OL: { 'Raw Strength': 2, Agile: 2 },
    WR: { 'Physical Route Runner': 2 },
  },
  'Power Spread': {
    QB: { 'Dual Threat': 2, 'Pocket Passer': 2 },
    HB: { 'Elusive Bruiser': 3, 'Contact Seeker': 2 },
    FB: { Blocking: 2 },
    TE: { 'Pure Blocker': 2 },
    OL: { 'Raw Strength': 3, Agile: 2 },
    WR: { 'Physical Route Runner': 2 },
  },
  'Pro Style': {
    QB: { 'Pocket Passer': 3 },
    HB: { 'Elusive Bruiser': 2, 'Contact Seeker': 2 },
    FB: { Blocking: 3 },
    TE: { 'Pure Blocker': 3, 'Gritty Possession': 2 },
    OL: { 'Raw Strength': 3, 'Pass Protector': 2 },
    WR: { 'Contested Specialist': 2, 'Physical Route Runner': 2 },
  },
  'Run & Shoot': {
    QB: { 'Pocket Passer': 2, 'Dual Threat': 2 },
    WR: { 'Route Artist': 3, 'Elusive Route Runner': 3, Speedster: 2 },
    HB: { 'North/South Receiver': 3 },
    TE: { 'Vertical Threat': 1 },
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
  'Veer & Shoot': {
    QB: { 'Dual Threat': 3 },
    HB: { 'East/West Playmaker': 2, 'Contact Seeker': 2 },
    WR: { Speedster: 3, 'Contested Specialist': 2 },
    TE: { 'Vertical Threat': 2 },
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
  '3-4': {
    LEDG: { 'Power Rusher': 2, 'Edge Setter': 3 },
    REDG: { 'Power Rusher': 2, 'Edge Setter': 3 },
    DT: { 'Gap Specialist': 3, 'Pure Power': 2 },
    SAM: { Thumper: 2, 'Signal Caller': 2 },
    MIKE: { Thumper: 2, 'Signal Caller': 2 },
    WILL: { Thumper: 2, 'Signal Caller': 2 },
    CB: { Boundary: 2, 'Bump and Run': 2 },
    FS: { 'Box Specialist': 2, Hybrid: 2 },
    SS: { 'Box Specialist': 2, Hybrid: 2 },
  },
  '4-2-5': {
    LEDG: { 'Speed Rusher': 3 },
    REDG: { 'Speed Rusher': 3 },
    DT: { 'Speed Rusher': 2, 'Gap Specialist': 2 },
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
  Multiple: {
    LEDG: { 'Power Rusher': 1, 'Speed Rusher': 1 },
    REDG: { 'Power Rusher': 1, 'Speed Rusher': 1 },
    DT: { 'Gap Specialist': 2 },
    SAM: { 'Signal Caller': 2 },
    MIKE: { 'Signal Caller': 2 },
    WILL: { 'Signal Caller': 2 },
    CB: { Zone: 1, Boundary: 1 },
    FS: { Hybrid: 2 },
    SS: { Hybrid: 2 },
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

const COVERAGE_MODIFIERS = {
  Man: { CB: { 'Bump and Run': 2 }, SAFETY: { 'Box Specialist': 1 } },
  ManPressure: {
    CB: { 'Bump and Run': 2 }, SAFETY: { 'Box Specialist': 1 },
    EDGE: { 'Speed Rusher': 1, 'Power Rusher': 1 }, LB: { 'Signal Caller': 1 },
  },
  Zone: { CB: { Zone: 2, Field: 1 }, SAFETY: { 'Coverage Specialist': 1 } },
  ZonePressure: {
    CB: { Zone: 2, Field: 1 }, SAFETY: { 'Coverage Specialist': 1 },
    EDGE: { 'Speed Rusher': 1, 'Power Rusher': 1 }, LB: { Lurker: 1 },
  },
  Shell: { SAFETY: { 'Coverage Specialist': 2, Hybrid: 1 }, CB: { Zone: 1 } },
  ThreeHigh: { SAFETY: { 'Coverage Specialist': 2 }, CB: { Field: 1 } },
  Tite: { DT: { 'Pure Power': 2, 'Gap Specialist': 1 }, EDGE: { 'Pure Power': 2, 'Power Rusher': 1 }, LB: { Thumper: 1 } },
  PressQuarters: { CB: { 'Bump and Run': 2 }, SAFETY: { 'Coverage Specialist': 2 } },
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
// DT2/CB2/NB/S3 (extra depth-chart slots) share their base position's fit table.
const POSITION_ALIAS = { DT2: 'DT', CB2: 'CB', NB: 'CB', S3: 'FS' }

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
