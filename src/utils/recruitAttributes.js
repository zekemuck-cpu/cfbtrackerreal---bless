// Canonical attribute ordering per position / archetype.
//
// Ported verbatim from the Scout Staff scouting-form config (BASE_POSITION_CONFIG
// + RECRUIT_FORM_OVERRIDES) so that attribute values captured via the Targets
// sheet line up 1:1 with the grading engine's expectations (archetypeWeights).
// The Targets sheet lays out its 10 attribute columns in exactly this order for
// each row's position/archetype, and the reader maps them back to names here.

import { resolveRecruitGroup } from './recruitGroup'

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
  FB: ['Lead Block', 'Awareness', 'Run Block', 'Strength', 'Trucking', 'Impact Blocking', 'Break Tackle', 'Carrying', 'Short Route', 'Run Block Power'],
  K:  ['Awareness', 'Kick Power', 'Kick Accuracy', 'Speed', 'Acceleration', 'Agility', 'Break Tackle', 'Throw Power', 'Throw On Run', 'Short Accuracy'],
  P:  ['Awareness', 'Kick Power', 'Kick Accuracy', 'Speed', 'Acceleration', 'Agility', 'Break Tackle', 'Throw Power', 'Throw On Run', 'Short Accuracy'],
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
  'ATH - Elusive Bruiser': ['Awareness', 'Speed', 'Acceleration', 'Carrying', 'Break Tackle', 'Change of Direction', 'Juke Move', 'Spin Move', 'BC Vision', 'Catching'],
  'ATH - Speed Rusher': ['Awareness', 'Strength', 'Acceleration', 'Block Shedding', 'Tackle', 'Hit Power', 'Power Moves', 'Finesse Moves', 'Speed', 'Pursuit'],
}

// Serialize an attribute map to the compact single-cell sheet format shared with
// the recruit Commitments sheet, e.g. "AWR 88, SPD 90, ACC 91". Emitted in
// ATTRIBUTE_COLUMNS order using the short codes (keeps the cell readable);
// blanks / non-numeric values are skipped. parseAttributes() reads it back.
export function serializeAttributes(attrMap) {
  if (!attrMap || typeof attrMap !== 'object') return ''
  const parts = []
  // Emit in the game's roster-table order so the cell reads like the screen.
  for (const name of GAME_ATTRIBUTE_ORDER) {
    const v = attrMap[name]
    if (v == null || v === '') continue
    const n = Number(v)
    if (!Number.isFinite(n)) continue
    parts.push(`${ATTRIBUTE_ABBR[name] || name} ${Math.round(n)}`)
  }
  return parts.join(', ')
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
  'Awareness', 'Speed', 'Acceleration', 'Strength', 'Agility', 'Change of Direction', 'Jumping',
  // Durability (full CFB 27 backend set — not graded by Scout Staff, but tracked
  // for rostered players imported from the CFB 27 launch ratings)
  'Stamina', 'Toughness', 'Injury',
  // Passing
  'Throw Power', 'Short Accuracy', 'Medium Accuracy', 'Deep Accuracy', 'Throw On Run', 'Under Pressure', 'Break Sack', 'Play Action',
  // Ball carrier
  'Carrying', 'Break Tackle', 'Juke Move', 'Spin Move', 'BC Vision', 'Stiff Arm', 'Trucking',
  // Receiving
  'Catching', 'Catch In Traffic', 'Spectacular Catch', 'Short Route', 'Medium Route', 'Deep Route', 'Release',
  // Blocking
  'Run Block', 'Run Block Power', 'Run Block Finesse', 'Pass Block', 'Pass Block Power', 'Pass Block Finesse', 'Impact Blocking', 'Lead Block',
  // Front seven
  'Block Shedding', 'Tackle', 'Hit Power', 'Power Moves', 'Finesse Moves', 'Pursuit', 'Play Recognition',
  // Coverage
  'Man Coverage', 'Zone Coverage', 'Press',
  // Special teams (added beyond the Scout Staff config — not graded yet, but
  // recordable for K/P/LS recruits and rostered players)
  'Kick Power', 'Kick Accuracy', 'Kick Return', 'Long Snap',
]

// The order CFB 27 lists attributes in on the roster table (left→right), as the
// user reads them off-screen. ATTRIBUTE_COLUMNS is grouped by category (a fixed
// storage/parse order); this is purely a PRESENTATION order for the AI prompt,
// the serialized "CODE value" cell, and the per-player entry grid — so pasted or
// hand-entered ratings line up with what's on screen. Any ATTRIBUTE_COLUMNS name
// not listed here is appended, so a newly added attribute can never silently
// drop out of serialization.
const GAME_ORDER_BASE = [
  'Speed', 'Acceleration', 'Agility', 'Change of Direction', 'Strength', 'Awareness',
  'Carrying', 'BC Vision', 'Break Tackle', 'Trucking', 'Stiff Arm', 'Spin Move', 'Juke Move',
  'Catching', 'Catch In Traffic', 'Spectacular Catch', 'Short Route', 'Medium Route', 'Deep Route', 'Release',
  'Jumping',
  'Throw Power', 'Short Accuracy', 'Medium Accuracy', 'Deep Accuracy', 'Throw On Run', 'Under Pressure', 'Break Sack', 'Play Action',
  'Pass Block', 'Pass Block Power', 'Pass Block Finesse', 'Run Block', 'Run Block Power', 'Run Block Finesse', 'Lead Block', 'Impact Blocking',
  'Play Recognition', 'Tackle', 'Hit Power', 'Block Shedding', 'Finesse Moves', 'Power Moves', 'Pursuit',
  'Man Coverage', 'Zone Coverage', 'Press',
  'Kick Return', 'Kick Power', 'Kick Accuracy',
  'Stamina', 'Toughness', 'Injury', 'Long Snap',
]
export const GAME_ATTRIBUTE_ORDER = [
  ...GAME_ORDER_BASE.filter((n) => ATTRIBUTE_COLUMNS.includes(n)),
  ...ATTRIBUTE_COLUMNS.filter((n) => !GAME_ORDER_BASE.includes(n)),
]

// Game positions → the position bucket used by BASE_POSITION_CONFIG.
const POS_ALIAS = {
  QB: 'QB', HB: 'HB', RB: 'HB', FB: 'FB', WR: 'WR', TE: 'TE',
  LT: 'OT', RT: 'OT', OT: 'OT', LG: 'OG', RG: 'OG', OG: 'OG', C: 'C', OL: 'OT',
  DE: 'DE', LE: 'DE', RE: 'DE', LEDG: 'DE', REDG: 'DE', EDGE: 'DE',
  DT: 'DT', NT: 'DT', DL: 'DT',
  SAM: 'OLB', WILL: 'OLB', OLB: 'OLB', LOLB: 'OLB', ROLB: 'OLB',
  MIKE: 'MIKE', MLB: 'MIKE', ILB: 'MIKE', LB: 'OLB',
  CB: 'CB', FS: 'FS', SS: 'SS', S: 'FS', DB: 'CB',
  K: 'K', P: 'P', ATH: 'ATH',
}

// Game position → the position bucket the Scout Staff grading engine expects
// (QB/HB/WR/TE/OT/OG/C/DE/DT/OLB/MIKE/CB/FS/SS/ATH). Unknown positions (e.g. K/P)
// pass through unchanged. Same alias table the scouting form / attribute reader
// use, so a target's raw position ("RT", "SAM") grades identically to a
// Scout-Staff-entered one.
export function positionBucket(position) {
  const up = (position || '').toUpperCase()
  return POS_ALIAS[up] || up
}

// Display-only rename for the Scout Staff/Recruiting pages (Staff, Targets,
// Commitments, Database, Outlook, Thresholds, Scouting Needs) — the "DE"
// bucket reads as "EDGE" there, matching how the position is actually
// referred to. Deliberately NOT a change to the bucket value itself: every
// stored player/recruit still has position "DE", and every matching/scoring/
// threshold lookup elsewhere in the app keys off "DE" exactly as before —
// this only swaps the label at the point something renders it as text, so
// nothing outside these Recruiting pages (roster views, depth charts, etc.)
// is affected.
export function recruitingPosLabel(position) {
  return position === 'DE' ? 'EDGE' : position
}

// Shapes a raw Target record (a dynasty.players entry with isTarget: true)
// into the same recruit shape recruitingDatabasePlayers/combinedPlayers
// expect (bucketed position, computed group, display fields only — no
// isTarget/teamsByYear/commitmentTid/etc). Mirrors ScoutStaff.jsx's internal
// shapeRecruit, minus board-only fields (addedIndex, boardRemoved) that mean
// nothing once archived. Used to permanently preserve a Target's scouted
// data in the Recruiting Database at the moment it's removed from the
// Targets page (deletePlayer, Clear All) — kept here rather than imported
// from ScoutStaff.jsx to avoid a circular import with DynastyContext.jsx.
export function shapeTargetForDatabase(pl) {
  const position = positionBucket(pl.position)
  return {
    pid: pl.pid,
    rawPosition: pl.position,
    scoutedAt: typeof pl.scoutedAt === 'number' ? pl.scoutedAt : null,
    updatedAt: typeof pl.updatedAt === 'number' ? pl.updatedAt : null,
    name: pl.name,
    position,
    archetype: pl.archetype || '',
    devTrait: pl.devTrait || '',
    gemBust: pl.gemBust || '',
    stars: pl.stars,
    attributes: pl.attributes || {},
    group: resolveRecruitGroup(position, pl.archetype),
    isPortal: pl.isPortal,
    previousTeam: pl.previousTeam,
    nationalRank: pl.nationalRank,
    stateRank: pl.stateRank,
    height: pl.height || '',
    weight: pl.weight || null,
    hometown: pl.hometown || '',
    state: pl.state || '',
    class: pl.class || 'HS',
    positionRank: pl.positionRank,
  }
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
  'Deep Accuracy': 'DAC', 'Throw On Run': 'RUN', 'Under Pressure': 'TUP', 'Break Sack': 'BSK',
  'Carrying': 'CAR', 'Break Tackle': 'BTK', 'Juke Move': 'JKM', 'Spin Move': 'SPM', 'BC Vision': 'BCV',
  'Catching': 'CTH', 'Catch In Traffic': 'CIT', 'Spectacular Catch': 'SPC',
  'Short Route': 'SRR', 'Medium Route': 'MRR', 'Deep Route': 'DRR', 'Release': 'RLS',
  'Run Block': 'RBK', 'Run Block Power': 'RBP', 'Run Block Finesse': 'RBF',
  'Pass Block': 'PBK', 'Pass Block Power': 'PBP', 'Pass Block Finesse': 'PBF', 'Impact Blocking': 'IBL',
  'Block Shedding': 'BSH', 'Tackle': 'TAK', 'Hit Power': 'POW', 'Power Moves': 'PMV',
  'Finesse Moves': 'FMV', 'Pursuit': 'PUR', 'Play Recognition': 'PRC',
  'Man Coverage': 'MCV', 'Zone Coverage': 'ZCV', 'Press': 'PRS',
  'Kick Power': 'KPW', 'Kick Accuracy': 'KAC',
  // Full CFB 27 backend set (rostered players)
  'Jumping': 'JMP', 'Stamina': 'STA', 'Toughness': 'TGH', 'Injury': 'INJ',
  'Play Action': 'PAC', 'Stiff Arm': 'SFA', 'Trucking': 'TRK', 'Lead Block': 'LBK',
  'Kick Return': 'RET', 'Long Snap': 'LSP',
}

// Display grouping for the full attribute set — used by the Player page Attributes
// tab and the Player editor Attributes tab. The union of these groups must cover
// ATTRIBUTE_COLUMNS; any column not listed falls into a generated "Other" group
// (see ratingsGroups()) so a newly added attribute can never silently disappear.
// Groups are ordered to follow the game's roster-table sequence (physical →
// ball carrier → receiving → passing → blocking → front seven → coverage →
// special teams → durability); ratingsGroups() sorts the attrs WITHIN each
// group by that same game order, so the editor reads top-to-bottom like the
// in-game roster while keeping the useful category headers + position accenting.
export const RATINGS_GROUP_DEFS = [
  { label: 'Physical',      attrs: ['Awareness', 'Speed', 'Acceleration', 'Strength', 'Agility', 'Change of Direction', 'Jumping'] },
  { label: 'Ball Carrier',  attrs: ['Carrying', 'Break Tackle', 'Juke Move', 'Spin Move', 'BC Vision', 'Stiff Arm', 'Trucking'] },
  { label: 'Receiving',     attrs: ['Catching', 'Catch In Traffic', 'Spectacular Catch', 'Short Route', 'Medium Route', 'Deep Route', 'Release'] },
  { label: 'Passing',       attrs: ['Throw Power', 'Short Accuracy', 'Medium Accuracy', 'Deep Accuracy', 'Throw On Run', 'Under Pressure', 'Break Sack', 'Play Action'] },
  { label: 'Blocking',      attrs: ['Run Block', 'Run Block Power', 'Run Block Finesse', 'Pass Block', 'Pass Block Power', 'Pass Block Finesse', 'Impact Blocking', 'Lead Block'] },
  { label: 'Front Seven',   attrs: ['Block Shedding', 'Tackle', 'Hit Power', 'Power Moves', 'Finesse Moves', 'Pursuit', 'Play Recognition'] },
  { label: 'Coverage',      attrs: ['Man Coverage', 'Zone Coverage', 'Press'] },
  { label: 'Special Teams', attrs: ['Kick Power', 'Kick Accuracy', 'Kick Return', 'Long Snap'] },
  { label: 'Durability',    attrs: ['Stamina', 'Toughness', 'Injury'] },
]

// RATINGS_GROUP_DEFS plus a generated "Other" bucket for any ATTRIBUTE_COLUMNS
// entry not explicitly grouped — guarantees full coverage of the attribute set.
// Attrs within each group are sorted into the game's roster-table order.
export function ratingsGroups() {
  const gameIdx = (name) => {
    const i = GAME_ATTRIBUTE_ORDER.indexOf(name)
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }
  const sortAttrs = (attrs) => [...attrs].sort((a, b) => gameIdx(a) - gameIdx(b))
  const grouped = new Set(RATINGS_GROUP_DEFS.flatMap(g => g.attrs))
  const leftover = ATTRIBUTE_COLUMNS.filter(a => !grouped.has(a))
  const base = RATINGS_GROUP_DEFS.map(g => ({ ...g, attrs: sortAttrs(g.attrs) }))
  return leftover.length
    ? [...base, { label: 'Other', attrs: sortAttrs(leftover) }]
    : base
}

// In-game display labels for the canonical attribute names — used by the read-only
// Attributes tab so ratings read exactly as they do on the CFB 27 player card
// (e.g. "Throw Accuracy Short", "Change Of Direction"). Only differing names are
// listed; everything else displays under its canonical name.
export const ATTRIBUTE_DISPLAY_LABEL = {
  'Change of Direction': 'Change Of Direction',
  'Short Accuracy': 'Throw Accuracy Short',
  'Medium Accuracy': 'Throw Accuracy Mid',
  'Deep Accuracy': 'Throw Accuracy Deep',
  'Throw On Run': 'Throw on the Run',
  'Under Pressure': 'Throw Under Pressure',
  'Short Route': 'Short Route Running',
  'Medium Route': 'Medium Route Running',
  'Deep Route': 'Deep Route Running',
}

export function displayLabel(name) {
  return ATTRIBUTE_DISPLAY_LABEL[name] || name
}

// Section layout for the read-only Attributes tab, mirroring the in-game player
// card grouping (General / Ballcarrier / Blocking / Passing / Defense /
// Receiving / Kicking). Distinct from RATINGS_GROUP_DEFS (the editor's
// edit-oriented grouping). displayGroups() appends any uncovered attribute to a
// generated "Other" section so nothing can silently disappear.
export const ATTRIBUTE_DISPLAY_GROUP_DEFS = [
  { label: 'General',     attrs: ['Speed', 'Acceleration', 'Strength', 'Agility', 'Awareness', 'Jumping', 'Injury', 'Stamina', 'Toughness'] },
  { label: 'Ballcarrier', attrs: ['Carrying', 'Break Tackle', 'Trucking', 'Change of Direction', 'BC Vision', 'Stiff Arm', 'Spin Move', 'Juke Move', 'Break Sack'] },
  { label: 'Blocking',    attrs: ['Run Block', 'Pass Block', 'Impact Blocking', 'Run Block Power', 'Run Block Finesse', 'Pass Block Power', 'Pass Block Finesse', 'Lead Block'] },
  { label: 'Passing',     attrs: ['Throw Power', 'Under Pressure', 'Short Accuracy', 'Medium Accuracy', 'Deep Accuracy', 'Throw On Run', 'Play Action'] },
  { label: 'Defense',     attrs: ['Tackle', 'Power Moves', 'Finesse Moves', 'Block Shedding', 'Pursuit', 'Play Recognition', 'Hit Power', 'Man Coverage', 'Zone Coverage', 'Press'] },
  { label: 'Receiving',   attrs: ['Catching', 'Spectacular Catch', 'Catch In Traffic', 'Short Route', 'Medium Route', 'Deep Route', 'Release'] },
  { label: 'Kicking',     attrs: ['Kick Power', 'Kick Accuracy', 'Kick Return'] },
]

export function displayGroups() {
  const grouped = new Set(ATTRIBUTE_DISPLAY_GROUP_DEFS.flatMap(g => g.attrs))
  const leftover = ATTRIBUTE_COLUMNS.filter(a => !grouped.has(a))
  return leftover.length
    ? [...ATTRIBUTE_DISPLAY_GROUP_DEFS, { label: 'Other', attrs: leftover }]
    : ATTRIBUTE_DISPLAY_GROUP_DEFS
}

// Maps the CFB 27 launch-ratings spreadsheet column headers to the canonical
// attribute names above. Only entries whose header differs from the canonical
// name are listed; every other header maps to itself. Headers not present here
// and not in ATTRIBUTE_COLUMNS (e.g. "Overall (stat)", "Running Style") are
// intentionally not stored as numeric attributes.
export const SHEET_HEADER_TO_ATTRIBUTE = {
  'Change Of Direction': 'Change of Direction',
  'Deep Route Running': 'Deep Route',
  'Medium Route Running': 'Medium Route',
  'Short Route Running': 'Short Route',
  'Throw Acc Deep': 'Deep Accuracy',
  'Throw Acc Mid': 'Medium Accuracy',
  'Throw Acc Short': 'Short Accuracy',
  'Throw On The Run': 'Throw On Run',
  'Throw Under Pressure': 'Under Pressure',
  // 'RUN' is the canonical short code now (matches the in-game attribute
  // abbreviation) — 'TOR' kept recognized too in case an AI reply or
  // already-exported backup still uses the old code.
  'TOR': 'Throw On Run',
}
