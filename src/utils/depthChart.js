import { groupForPosition } from '../data/positionGroups'

// OVR → letter grade. Starting bands from the spec (tunable).
export function gradeForOvr(ovr, { depth = 2, topDev = 'Normal' } = {}) {
  if (ovr == null) return 'F'
  const bands = [[90, 'A+'], [87, 'A'], [84, 'A-'], [81, 'B+'], [78, 'B'], [75, 'B-'], [70, 'C'], [0, 'D']]
  let letter = 'D'
  for (const [min, g] of bands) { if (ovr >= min) { letter = g; break } }
  // ±1 step adjustments
  const SCALE = ['F', 'D', 'C', 'B-', 'B', 'B+', 'A-', 'A', 'A+']
  let idx = SCALE.indexOf(letter)
  if (depth <= 1) idx = Math.max(0, idx - 1)
  if (topDev === 'Elite' || topDev === 'Star') idx = Math.min(SCALE.length - 1, idx + 1)
  return SCALE[idx]
}

// A returning, non-senior buried on the depth chart (very low snaps last
// season) is a portal-flight cue. Threshold tunable. `snaps` is a legacy alias.
const PORTAL_RISK_SNAP_THRESHOLD = 150
export function isPortalRisk(player, lastYear, projectedClass) {
  if (!player || projectedClass === 'Sr' || projectedClass === 'RS Sr') return false
  const s = player.statsByYear || {}
  const yr = s[lastYear] || s[String(lastYear)]
  const snaps = yr?.snapsPlayed ?? yr?.snaps
  if (snaps == null) return false
  return snaps < PORTAL_RISK_SNAP_THRESHOLD
}

// Order a pool: manual pids first (in that order), then the rest by OVR desc
// (nulls last). manualPids is an array of pids for this group.
function orderPool(pool, manualPids = []) {
  const byOvr = [...pool].sort((a, b) => (b.projectedOvr ?? -1) - (a.projectedOvr ?? -1))
  if (!manualPids.length) return byOvr
  const rank = new Map(manualPids.map((pid, i) => [pid, i]))
  return byOvr.sort((a, b) => {
    const ra = rank.has(a.pid) ? rank.get(a.pid) : Infinity
    const rb = rank.has(b.pid) ? rank.get(b.pid) : Infinity
    if (ra !== rb) return ra - rb
    return (b.projectedOvr ?? -1) - (a.projectedOvr ?? -1)
  })
}

// Build the per-slot depth chart for one tab's formation.
// - Players are bucketed by POSITION GROUP (so a player coded with a generic
//   group code like 'OT'/'EDGE'/'RB'/'LB' still lands in the right pool and
//   never vanishes or creates a false hole).
// - Within a group, the ordered pool (manual order then OVR) fills the group's
//   slots: the top N become starters (one per slot, in order), the remaining
//   bench is distributed round-robin so every card shows some depth.
// projected: ProjectedPlayer[] (from projectRoster).
// manualOrder: { [group]: [pid…] } — manual depth order, keyed by GROUP.
export function buildDepthChart(projected, { formation, manualOrder = {}, lastYear = null }) {
  // Bucket players by group.
  const byGroup = {}
  for (const p of projected) {
    const g = groupForPosition(p.position)
    if (!g) continue
    ;(byGroup[g] ||= []).push(p)
  }
  // Group the formation's slots by their group.
  const slotsByGroup = {}
  for (const s of formation) (slotsByGroup[s.group] ||= []).push(s)

  // Assign each group's ordered pool to its slots.
  const assignment = {}  // slotId -> { starter, backups }
  const groupPoolPids = {} // group -> ordered pid list (reorderable players only)
  for (const [group, slots] of Object.entries(slotsByGroup)) {
    const pool = orderPool(byGroup[group] || [], manualOrder[group] || [])
    groupPoolPids[group] = pool.map(p => p.pid).filter(Boolean)
    const G = slots.length
    const starters = pool.slice(0, G)
    const bench = pool.slice(G)
    const benchBuckets = slots.map(() => [])
    bench.forEach((p, i) => benchBuckets[i % G].push(p))
    slots.forEach((s, i) => { assignment[s.id] = { starter: starters[i] || null, backups: benchBuckets[i] } })
  }

  return formation.map(s => {
    const { starter = null, backups = [] } = assignment[s.id] || {}
    const topDev = starter?.devTrait || 'Normal'
    const depthCount = (starter ? 1 : 0) + backups.length
    return {
      id: s.id,
      label: s.label,
      pos: s.pos,
      group: s.group,
      groupPool: groupPoolPids[s.group] || [], // full ordered pids for reorder
      starter,
      backups,
      isHole: !starter,
      grade: gradeForOvr(starter?.projectedOvr ?? null, { depth: depthCount, topDev }),
      risk: backups.concat(starter ? [starter] : []).reduce((acc, p) => {
        if (p && !p.isIncoming && p.player && isPortalRisk(p.player, lastYear, p.projectedClass)) acc[p.pid] = true
        return acc
      }, {}),
    }
  })
}
