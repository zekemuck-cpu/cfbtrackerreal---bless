// Canonical position → position-group map and the per-tab formation slot
// layouts the Team Future depth chart renders. Single source of truth
// (previously duplicated inline in TeamYear.jsx and boxScoreConstants.js).

export const GROUP_POSITIONS = {
  QB: ['QB'],
  RB: ['HB', 'FB', 'RB'],
  WR: ['WR'],
  TE: ['TE'],
  OL: ['LT', 'LG', 'C', 'RG', 'RT', 'OL', 'OT', 'OG'],
  DL: ['LEDG', 'REDG', 'DE', 'DT', 'DL', 'NT', 'LE', 'RE', 'EDGE'],
  LB: ['SAM', 'MIKE', 'WILL', 'OLB', 'MLB', 'ILB', 'LB', 'LOLB', 'ROLB'],
  DB: ['CB', 'FS', 'SS', 'S', 'DB'],
  K: ['K'],
  P: ['P'],
}

// Display names + which groups belong to each Team Future tab, in render order.
export const GROUP_LABELS = {
  QB: 'Quarterbacks', RB: 'Running Backs', WR: 'Wide Receivers', TE: 'Tight Ends',
  OL: 'Offensive Line', DL: 'Defensive Line', LB: 'Linebackers', DB: 'Defensive Backs',
  K: 'Kicker', P: 'Punter',
}
export const TAB_GROUPS = {
  offense: ['QB', 'RB', 'WR', 'TE', 'OL'],
  defense: ['DL', 'LB', 'DB'],
  st: ['K', 'P'],
}

const _posToGroup = {}
for (const [group, positions] of Object.entries(GROUP_POSITIONS)) {
  for (const p of positions) _posToGroup[p] = group
}

export function groupForPosition(pos) {
  if (!pos) return null
  return _posToGroup[String(pos).toUpperCase()] || null
}

// A formation slot: { id (unique label), label (shown), pos (exact roster
// position the pool is drawn from), group }. Slots sharing a `pos` (WR1/WR2,
// CB1/CB2…) split that position's pool round-robin in the depth-chart builder.
const slot = (id, pos, label = id) => ({ id, label, pos, group: groupForPosition(pos) })

export const OFFENSE_FORMATION = [
  slot('LT', 'LT'), slot('LG', 'LG'), slot('C', 'C'), slot('RG', 'RG'), slot('RT', 'RT'), slot('TE', 'TE'),
  slot('WR1', 'WR', 'WR'), slot('HB', 'HB'), slot('QB', 'QB'), slot('FB', 'FB'), slot('WR2', 'WR', 'WR'),
]

export const DEFENSE_FORMATION = [
  slot('LE', 'LEDG', 'LE'), slot('DT1', 'DT', 'DT'), slot('DT2', 'DT', 'DT'), slot('RE', 'REDG', 'RE'),
  slot('SAM', 'SAM'), slot('MIKE', 'MIKE'), slot('WILL', 'WILL'),
  slot('CB1', 'CB', 'CB'), slot('FS', 'FS'), slot('SS', 'SS'), slot('CB2', 'CB', 'CB'),
]

export const ST_FORMATION = [
  slot('K', 'K'), slot('P', 'P'),
]

export const TAB_FORMATIONS = {
  offense: OFFENSE_FORMATION,
  defense: DEFENSE_FORMATION,
  st: ST_FORMATION,
}

// Generic position codes → the exact slot `pos` values they can fill. Exact
// codes (LT, MIKE, FS…) map to their own slot and are NOT listed here.
export const POSITION_ALIASES = {
  OT: ['LT', 'RT'], OG: ['LG', 'RG'], OL: ['LT', 'LG', 'C', 'RG', 'RT'],
  DE: ['LEDG', 'REDG'], EDGE: ['LEDG', 'REDG'], LE: ['LEDG'], RE: ['REDG'],
  NT: ['DT'], DL: ['LEDG', 'REDG', 'DT'],
  LB: ['SAM', 'MIKE', 'WILL'], OLB: ['SAM', 'WILL'], MLB: ['MIKE'], ILB: ['MIKE'], LOLB: ['WILL'], ROLB: ['SAM'],
  S: ['FS', 'SS'], DB: ['CB', 'FS', 'SS'],
  RB: ['HB', 'FB'],
}

// Slot ids in `formation` a player at `position` can occupy, most-specific
// first: exact `pos` match wins; otherwise the generic alias expansion; final
// fallback is any slot in the player's position group (so nobody vanishes).
export function candidateSlots(formation, position) {
  const pos = (position || '').toUpperCase()
  let ids = formation.filter(s => s.pos === pos).map(s => s.id)
  if (ids.length) return ids
  const aliasPosSet = POSITION_ALIASES[pos]
  if (aliasPosSet) {
    ids = formation.filter(s => aliasPosSet.includes(s.pos)).map(s => s.id)
    if (ids.length) return ids
  }
  const g = groupForPosition(pos)
  return g ? formation.filter(s => s.group === g).map(s => s.id) : []
}
