// Canonical attribute ordering per position / archetype.
//
// Ported verbatim from the Scout Staff scouting-form config (BASE_POSITION_CONFIG
// + RECRUIT_FORM_OVERRIDES) so that attribute values captured via the Targets
// sheet line up 1:1 with the grading engine's expectations (archetypeWeights).
// The Targets sheet lays out its 10 attribute columns in exactly this order for
// each row's position/archetype, and the reader maps them back to names here.

export const BASE_POSITION_CONFIG = {
  QB: ['Awareness', 'Throw Power', 'Short Accuracy', 'Medium Accuracy', 'Deep Accuracy', 'Throw On Run', 'Under Pressure', 'Break Sack', 'Speed', 'Acceleration'],
  HB: ['Awareness', 'Speed', 'Acceleration', 'Carrying', 'Break Tackle', 'Change of Direction', 'Juke Move', 'Spin Move', 'BC Vision', 'Catching'],
  WR: ['Awareness', 'Speed', 'Acceleration', 'Catching', 'Catch In Traffic', 'Spectacular Catch', 'Short Route', 'Medium Route', 'Deep Route', 'Release'],
  TE: ['Awareness', 'Speed', 'Strength', 'Acceleration', 'Run Block', 'Pass Block', 'Catching', 'Catch In Traffic', 'Short Route', 'Medium Route'],
  OT: ['Awareness', 'Run Block', 'Run Block Power', 'Run Block Finesse', 'Pass Block', 'Pass Block Power', 'Pass Block Finesse', 'Impact Blocking', 'Agility', 'Acceleration'],
  OG: ['Awareness', 'Run Block', 'Run Block Power', 'Run Block Finesse', 'Pass Block', 'Pass Block Power', 'Pass Block Finesse', 'Impact Blocking', 'Agility', 'Acceleration'],
  C:  ['Awareness', 'Run Block', 'Run Block Power', 'Run Block Finesse', 'Pass Block', 'Pass Block Power', 'Pass Block Finesse', 'Impact Blocking', 'Agility', 'Acceleration'],
  DE: ['Awareness', 'Strength', 'Acceleration', 'Block Shedding', 'Tackle', 'Hit Power', 'Power Moves', 'Finesse Moves', 'Speed', 'Pursuit'],
  DT: ['Awareness', 'Strength', 'Acceleration', 'Block Shedding', 'Tackle', 'Hit Power', 'Power Moves', 'Finesse Moves', 'Speed', 'Pursuit'],
  OLB: ['Awareness', 'Speed', 'Acceleration', 'Strength', 'Play Recognition', 'Tackle', 'Hit Power', 'Pursuit', 'Man Coverage', 'Zone Coverage'],
  MIKE: ['Awareness', 'Speed', 'Acceleration', 'Strength', 'Play Recognition', 'Tackle', 'Hit Power', 'Pursuit', 'Man Coverage', 'Zone Coverage'],
  CB: ['Awareness', 'Speed', 'Acceleration', 'Change of Direction', 'Agility', 'Man Coverage', 'Zone Coverage', 'Press', 'Catching', 'Tackle'],
  FS: ['Awareness', 'Speed', 'Acceleration', 'Change of Direction', 'Agility', 'Man Coverage', 'Zone Coverage', 'Press', 'Catching', 'Tackle'],
  SS: ['Awareness', 'Speed', 'Acceleration', 'Change of Direction', 'Agility', 'Man Coverage', 'Zone Coverage', 'Press', 'Catching', 'Tackle'],
  ATH: ['Awareness', 'Speed', 'Acceleration', 'Strength', 'Agility', 'Change of Direction', 'Catching', 'Tackle', 'Zone Coverage', 'Man Coverage'],
}

export const RECRUIT_FORM_OVERRIDES = {
  Speedster: ['Awareness', 'Speed', 'Acceleration', 'Catching', 'Catch In Traffic', 'Spectacular Catch', 'Short Route', 'Medium Route', 'Deep Route', 'Release'],
  'Route Artist': ['Awareness', 'Speed', 'Acceleration', 'Catching', 'Catch In Traffic', 'Spectacular Catch', 'Short Route', 'Medium Route', 'Deep Route', 'Agility'],
  'Elusive Route Runner': ['Awareness', 'Speed', 'Acceleration', 'Catching', 'Catch In Traffic', 'Spectacular Catch', 'Short Route', 'Medium Route', 'Deep Route', 'Agility'],
  'Physical Route Runner': ['Awareness', 'Speed', 'Acceleration', 'Catching', 'Catch In Traffic', 'Spectacular Catch', 'Short Route', 'Medium Route', 'Deep Route', 'Release'],
  'Gritty Possession': ['Awareness', 'Speed', 'Acceleration', 'Catching', 'Catch In Traffic', 'Spectacular Catch', 'Short Route', 'Medium Route', 'Deep Route', 'Run Block'],
  'Contested Specialist': ['Awareness', 'Speed', 'Acceleration', 'Catching', 'Catch In Traffic', 'Spectacular Catch', 'Short Route', 'Medium Route', 'Deep Route', 'Release'],
  Gadget: ['Awareness', 'Speed', 'Acceleration', 'Catching', 'Catch In Traffic', 'Spectacular Catch', 'Short Route', 'Medium Route', 'Deep Route', 'Throw Power'],
  'Vertical Threat': ['Awareness', 'Speed', 'Strength', 'Acceleration', 'Run Block', 'Pass Block', 'Catching', 'Catch In Traffic', 'Medium Route', 'Deep Route'],
  'Raw Strength (OT)': ['Awareness', 'Run Block', 'Run Block Power', 'Run Block Finesse', 'Pass Block', 'Pass Block Power', 'Pass Block Finesse', 'Impact Blocking', 'Agility', 'Strength'],
  'Raw Strength (OG)': ['Awareness', 'Run Block', 'Run Block Power', 'Run Block Finesse', 'Pass Block', 'Pass Block Power', 'Pass Block Finesse', 'Impact Blocking', 'Agility', 'Strength'],
  'Raw Strength (C)': ['Awareness', 'Run Block', 'Run Block Power', 'Run Block Finesse', 'Pass Block', 'Pass Block Power', 'Pass Block Finesse', 'Impact Blocking', 'Agility', 'Strength'],
  'ATH - Power Rusher': ['Awareness', 'Strength', 'Acceleration', 'Block Shedding', 'Tackle', 'Hit Power', 'Power Moves', 'Finesse Moves', 'Speed', 'Pursuit'],
  'ATH - East/West Playmaker': ['Awareness', 'Speed', 'Acceleration', 'Carrying', 'Break Tackle', 'Change of Direction', 'Juke Move', 'Spin Move', 'BC Vision', 'Catching'],
  'ATH - Contested Specialist': ['Awareness', 'Speed', 'Acceleration', 'Catching', 'Catch In Traffic', 'Spectacular Catch', 'Short Route', 'Medium Route', 'Deep Route', 'Release'],
  'ATH - Agile': ['Awareness', 'Run Block', 'Run Block Power', 'Run Block Finesse', 'Pass Block', 'Pass Block Power', 'Pass Block Finesse', 'Impact Blocking', 'Agility', 'Acceleration'],
  'ATH - Pure Runner': ['Awareness', 'Throw Power', 'Short Accuracy', 'Medium Accuracy', 'Deep Accuracy', 'Throw On Run', 'Under Pressure', 'Break Sack', 'Speed', 'Acceleration'],
  'ATH - Dual Threat': ['Awareness', 'Throw Power', 'Short Accuracy', 'Medium Accuracy', 'Deep Accuracy', 'Throw On Run', 'Under Pressure', 'Break Sack', 'Speed', 'Acceleration'],
  'ATH - Contact Seeker': ['Awareness', 'Speed', 'Acceleration', 'Carrying', 'Break Tackle', 'Change of Direction', 'Juke Move', 'Spin Move', 'BC Vision', 'Catching'],
  'ATH - Lurker': ['Awareness', 'Speed', 'Acceleration', 'Strength', 'Play Recognition', 'Tackle', 'Hit Power', 'Pursuit', 'Man Coverage', 'Zone Coverage'],
  'ATH - Pure Possession': ['Awareness', 'Speed', 'Strength', 'Acceleration', 'Run Block', 'Pass Block', 'Catching', 'Catch In Traffic', 'Short Route', 'Medium Route'],
  'ATH - Thumper': ['Awareness', 'Speed', 'Acceleration', 'Strength', 'Play Recognition', 'Tackle', 'Hit Power', 'Pursuit', 'Man Coverage', 'Zone Coverage'],
  'ATH - Backfield Threat': ['Awareness', 'Speed', 'Acceleration', 'Carrying', 'Break Tackle', 'Change of Direction', 'Juke Move', 'Spin Move', 'BC Vision', 'Catching'],
  'ATH - Physical Route Runner': ['Awareness', 'Speed', 'Strength', 'Acceleration', 'Run Block', 'Pass Block', 'Catching', 'Catch In Traffic', 'Short Route', 'Medium Route'],
}

// The complete set of distinct attributes (the union across every position /
// archetype), verified against the authoritative Scout Staff config workbook
// (Scout Staff.xlsx). One sheet column per attribute, in this fixed order — a
// player fills only the ~10 relevant to their position and leaves the rest
// blank, so every column is an unambiguous named attribute (not a position-
// relative slot). The Scout Staff system does NOT cover K/P or hidden physical
// ratings, so they're intentionally absent.
export const ATTRIBUTE_COLUMNS = [
  // Universal / physical
  'Awareness', 'Speed', 'Acceleration', 'Strength', 'Agility', 'Change of Direction',
  // Passing
  'Throw Power', 'Short Accuracy', 'Medium Accuracy', 'Deep Accuracy', 'Throw On Run', 'Under Pressure', 'Break Sack',
  // Ball carrier
  'Carrying', 'Break Tackle', 'Juke Move', 'Spin Move', 'BC Vision',
  // Receiving
  'Catching', 'Catch In Traffic', 'Spectacular Catch', 'Short Route', 'Medium Route', 'Deep Route', 'Release',
  // Blocking
  'Run Block', 'Run Block Power', 'Run Block Finesse', 'Pass Block', 'Pass Block Power', 'Pass Block Finesse', 'Impact Blocking',
  // Front seven
  'Block Shedding', 'Tackle', 'Hit Power', 'Power Moves', 'Finesse Moves', 'Pursuit', 'Play Recognition',
  // Coverage
  'Man Coverage', 'Zone Coverage', 'Press',
  // Special teams (added beyond the Scout Staff config — not graded yet, but
  // recordable for K/P recruits)
  'Kick Power', 'Kick Accuracy', 'Punt Power', 'Punt Accuracy',
]

// Game positions → the position bucket used by BASE_POSITION_CONFIG.
const POS_ALIAS = {
  QB: 'QB', HB: 'HB', RB: 'HB', FB: 'HB', WR: 'WR', TE: 'TE',
  LT: 'OT', RT: 'OT', OT: 'OT', LG: 'OG', RG: 'OG', OG: 'OG', C: 'C', OL: 'OT',
  DE: 'DE', LE: 'DE', RE: 'DE', LEDG: 'DE', REDG: 'DE', EDGE: 'DE',
  DT: 'DT', NT: 'DT', DL: 'DT',
  SAM: 'OLB', WILL: 'OLB', OLB: 'OLB', LOLB: 'OLB', ROLB: 'OLB',
  MIKE: 'MIKE', MLB: 'MIKE', ILB: 'MIKE', LB: 'OLB',
  CB: 'CB', FS: 'FS', SS: 'SS', S: 'FS', DB: 'CB', ATH: 'ATH',
}

// Game position → the position bucket the Scout Staff grading engine expects.
// Unknown positions (e.g. K/P) pass through unchanged.
export function positionBucket(position) {
  const up = (position || '').toUpperCase()
  return POS_ALIAS[up] || up
}

// The ordered list of 10 attribute names for a position+archetype, matching the
// scouting form: exact archetype override → "Archetype (POS)" (OL raw strength)
// → "ATH - Archetype" → position base. Returns null for positions with no
// scouting profile (e.g. K/P) — those simply aren't graded.
export function attributeNamesFor(position, archetype) {
  const pos = POS_ALIAS[(position || '').toUpperCase()] || (position || '').toUpperCase()
  const arch = (archetype || '').trim()
  if (arch && RECRUIT_FORM_OVERRIDES[arch]) return RECRUIT_FORM_OVERRIDES[arch]
  const withSuffix = `${arch} (${pos})`
  if (RECRUIT_FORM_OVERRIDES[withSuffix]) return RECRUIT_FORM_OVERRIDES[withSuffix]
  const withAth = `ATH - ${arch}`
  if (RECRUIT_FORM_OVERRIDES[withAth]) return RECRUIT_FORM_OVERRIDES[withAth]
  return BASE_POSITION_CONFIG[pos] || null
}

// Normalize a stored archetype to its base name: "Raw Strength (OT)" → "Raw
// Strength", "ATH - Thumper" → "Thumper".
export function normalizeArch(archetype = '') {
  return String(archetype).replace(/^ATH\s*-\s*/i, '').replace(/\s*\([A-Z]+\)\s*$/, '').trim()
}

// Canonical "<bucket>_<archetype>" key (e.g. "OT_Pass Protector") for grading
// lookups — same position bucket + archetype the scouting form uses.
export function archetypeKey(position, archetype) {
  const pos = POS_ALIAS[(position || '').toUpperCase()] || (position || '').toUpperCase()
  return `${pos}_${normalizeArch(archetype)}`
}

// Map up to 10 raw attribute-column values to a { attrName: number } map using
// the canonical order for the row's position/archetype. Blank/non-numeric cells
// are skipped. Returns null when nothing usable is present — an ungraded target
// is perfectly valid (you don't always have points to scout).
export function mapAttributeColumns(values, position, archetype) {
  const names = attributeNamesFor(position, archetype)
  if (!names) return null
  const out = {}
  for (let i = 0; i < names.length; i++) {
    const raw = values?.[i]
    if (raw == null || String(raw).trim() === '') continue
    const n = Number(String(raw).trim())
    if (Number.isFinite(n)) out[names[i]] = n
  }
  return Object.keys(out).length ? out : null
}

// Short, CFB-standard abbreviations for the sheet column headers (the named
// attribute columns are narrow; full names truncate). Display-only — the reader
// maps attribute columns by POSITION in ATTRIBUTE_COLUMNS, not by header text,
// so these never affect parsing. Full name rides along as a header cell note.
export const ATTRIBUTE_ABBR = {
  'Awareness': 'AWR', 'Speed': 'SPD', 'Acceleration': 'ACC', 'Strength': 'STR',
  'Agility': 'AGI', 'Change of Direction': 'COD',
  'Throw Power': 'THP', 'Short Accuracy': 'SAC', 'Medium Accuracy': 'MAC',
  'Deep Accuracy': 'DAC', 'Throw On Run': 'TOR', 'Under Pressure': 'TUP', 'Break Sack': 'BSK',
  'Carrying': 'CAR', 'Break Tackle': 'BTK', 'Juke Move': 'JKM', 'Spin Move': 'SPM', 'BC Vision': 'BCV',
  'Catching': 'CTH', 'Catch In Traffic': 'CIT', 'Spectacular Catch': 'SPC',
  'Short Route': 'SRR', 'Medium Route': 'MRR', 'Deep Route': 'DRR', 'Release': 'RLS',
  'Run Block': 'RBK', 'Run Block Power': 'RBP', 'Run Block Finesse': 'RBF',
  'Pass Block': 'PBK', 'Pass Block Power': 'PBP', 'Pass Block Finesse': 'PBF', 'Impact Blocking': 'IBL',
  'Block Shedding': 'BSH', 'Tackle': 'TAK', 'Hit Power': 'POW', 'Power Moves': 'PMV',
  'Finesse Moves': 'FMV', 'Pursuit': 'PUR', 'Play Recognition': 'PRC',
  'Man Coverage': 'MCV', 'Zone Coverage': 'ZCV', 'Press': 'PRS',
  'Kick Power': 'KPW', 'Kick Accuracy': 'KAC', 'Punt Power': 'PPW', 'Punt Accuracy': 'PAC',
}
