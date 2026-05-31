// Canonical position → position-group maps. Single source of truth
// (previously duplicated inline in TeamYear.jsx and boxScoreConstants.js).
//
// The old formation/slot layouts + `candidateSlots` lived here for the unused
// `buildDepthChart` engine and have been removed. The Outlook depth-chart board
// defines its own formations in src/utils/outlookBoard.js.

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

// Finer position groups for the Team Future outlook — OL split into OT/OG/C,
// the front into DT/EDGE, LBs into OLB/MIKE, DBs into CB/Safety. Kept separate
// from the broad GROUP_POSITIONS (used by box scores + the depth-chart builder)
// so those stay untouched. Generic/legacy codes fall back to a sub-group.
const FINE_GROUP_POSITIONS = {
  QB: ['QB'],
  RB: ['HB', 'FB', 'RB'],
  WR: ['WR'],
  TE: ['TE'],
  OT: ['LT', 'RT', 'OT'],
  OG: ['LG', 'RG', 'OG', 'OL'],
  C: ['C'],
  DT: ['DT', 'NT', 'DL'],
  EDGE: ['LEDG', 'REDG', 'EDGE', 'DE', 'LE', 'RE'],
  OLB: ['SAM', 'WILL', 'OLB', 'LOLB', 'ROLB'],
  MIKE: ['MIKE', 'MLB', 'ILB', 'LB'],
  CB: ['CB', 'DB'],
  Safety: ['FS', 'SS', 'S', 'SAF', 'Safety'],
  K: ['K'],
  P: ['P'],
}
const _posToFineGroup = {}
for (const [group, positions] of Object.entries(FINE_GROUP_POSITIONS)) {
  for (const p of positions) _posToFineGroup[p] = group
}
export function finePositionGroup(pos) {
  if (!pos) return null
  return _posToFineGroup[String(pos).toUpperCase()] || null
}

// Display names + which groups belong to each Team Future tab, in render order.
export const GROUP_LABELS = {
  QB: 'Quarterbacks', RB: 'Running Backs', WR: 'Wide Receivers', TE: 'Tight Ends',
  OT: 'Offensive Tackle', OG: 'Offensive Guard', C: 'Center',
  DT: 'Defensive Tackle', EDGE: 'Edge', OLB: 'Outside LB', MIKE: 'Middle LB',
  CB: 'Cornerback', Safety: 'Safety', K: 'Kicker', P: 'Punter',
}
export const TAB_GROUPS = {
  offense: ['QB', 'RB', 'WR', 'TE', 'OT', 'OG', 'C'],
  defense: ['DT', 'EDGE', 'OLB', 'MIKE', 'CB', 'Safety'],
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
