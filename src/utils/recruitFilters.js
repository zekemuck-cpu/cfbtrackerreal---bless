// Shared recruit position-filter used by both the Commitments view and the
// Targets (Scout Board) on the recruiting page, so the dropdown options and the
// matching logic stay identical across tabs.

import { sideOfPosition } from './outlookBoard'
import { positionBucket } from './recruitAttributes'

// Side groupings (offense/defense) plus every individual position bucket —
// full granularity (HB/FB and FS/SS kept separate, not folded into RB/Safety
// the way the Team Future tab's coarser grouping does), matching the exact
// buckets recruit.position is stored as everywhere else in Recruiting/Scout
// Staff. "EDGE" is the display value here for the "DE" bucket, same as
// recruitingPosLabel elsewhere — DE recruits are filed as EDGE in this menu.
export const POSITION_FILTER_OPTIONS = [
  { value: 'all', label: 'All Positions' },
  { value: 'offense', label: 'Offense' },
  { value: 'defense', label: 'Defense' },
  { value: 'QB', label: 'QB' },
  { value: 'HB', label: 'HB' },
  { value: 'FB', label: 'FB' },
  { value: 'WR', label: 'WR' },
  { value: 'TE', label: 'TE' },
  { value: 'OT', label: 'OT' },
  { value: 'OG', label: 'OG' },
  { value: 'C', label: 'C' },
  { value: 'EDGE', label: 'EDGE' },
  { value: 'DT', label: 'DT' },
  { value: 'OLB', label: 'OLB' },
  { value: 'MIKE', label: 'MIKE' },
  { value: 'CB', label: 'CB' },
  { value: 'FS', label: 'FS' },
  { value: 'SS', label: 'SS' },
  { value: 'K', label: 'K' },
  { value: 'P', label: 'P' },
]

// Decide whether a recruit's position is included by the active filter value.
export function matchesPositionFilter(filter, position) {
  if (filter === 'all') return true
  // ATH (athlete) has no fixed side — surface them under BOTH Offense and Defense.
  const isAth = (position || '').toUpperCase() === 'ATH'
  if (filter === 'offense' || filter === 'defense') return sideOfPosition(position) === filter || isAth
  const bucket = positionBucket(position)
  if (filter === 'EDGE') return bucket === 'DE'
  return bucket === filter
}
