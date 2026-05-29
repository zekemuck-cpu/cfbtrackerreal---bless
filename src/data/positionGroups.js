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
