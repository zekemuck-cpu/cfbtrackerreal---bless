// Shared recruit position-filter used by both the Commitments view and the
// Targets (Scout Board) on the recruiting page, so the dropdown options and the
// matching logic stay identical across tabs.

import { sideOfPosition } from './outlookBoard'
import { finePositionGroup } from '../data/positionGroups'

// Side groupings (offense/defense) plus the finer position groups.
export const POSITION_FILTER_OPTIONS = [
  { value: 'all', label: 'All Positions' },
  { value: 'offense', label: 'Offense' },
  { value: 'defense', label: 'Defense' },
  { value: 'QB', label: 'QB' },
  { value: 'RB', label: 'RB' },
  { value: 'WR', label: 'WR' },
  { value: 'TE', label: 'TE' },
  { value: 'OL', label: 'OL' },
  { value: 'EDGE', label: 'EDGE' },
  { value: 'DT', label: 'DT' },
  { value: 'LB', label: 'LB' },
  { value: 'DB', label: 'DB' },
  { value: 'K/P', label: 'K/P' },
]

const OL_GROUPS = new Set(['OT', 'OG', 'C'])
const LB_GROUPS = new Set(['OLB', 'MIKE'])
const DB_GROUPS = new Set(['CB', 'Safety'])

// Decide whether a recruit's position is included by the active filter value.
export function matchesPositionFilter(filter, position) {
  if (filter === 'all') return true
  // ATH (athlete) has no fixed side — surface them under BOTH Offense and Defense.
  const isAth = (position || '').toUpperCase() === 'ATH'
  const side = sideOfPosition(position)
  if (filter === 'offense' || filter === 'defense') return side === filter || isAth
  const g = finePositionGroup(position)
  if (filter === 'OL') return OL_GROUPS.has(g)
  if (filter === 'LB') return LB_GROUPS.has(g)
  if (filter === 'DB') return DB_GROUPS.has(g)
  if (filter === 'K/P') return g === 'K' || g === 'P'
  return g === filter
}
