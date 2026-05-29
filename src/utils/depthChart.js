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
// season) is a portal-flight cue. Threshold tunable.
const PORTAL_RISK_SNAP_THRESHOLD = 150
export function isPortalRisk(player, lastYear, projectedClass) {
  if (!player || projectedClass === 'Sr' || projectedClass === 'RS Sr') return false
  const s = player.statsByYear || {}
  const yr = s[lastYear] || s[String(lastYear)]
  const snaps = yr?.snapsPlayed
  if (snaps == null) return false
  return snaps < PORTAL_RISK_SNAP_THRESHOLD
}

// Order a pool: manual pids first (in that order), then the rest by OVR desc
// (nulls last). manualPids is an array of pids for this position.
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
// projected: ProjectedPlayer[] (from projectRoster).
// manualOrder: { [posKey]: [pid…] } — posKey is the slot's `pos`.
export function buildDepthChart(projected, { formation, manualOrder = {}, lastYear = null }) {
  // Bucket players by exact position.
  const byPos = {}
  for (const p of projected) {
    const pos = (p.position || '').toUpperCase()
    ;(byPos[pos] ||= []).push(p)
  }
  // Group formation slots that share a `pos` so we can round-robin the pool.
  const slotsByPos = {}
  for (const s of formation) (slotsByPos[s.pos] ||= []).push(s)

  // Assign each position's ordered pool round-robin across its slots.
  const assignment = {} // slotId -> ordered players[]
  for (const [pos, slots] of Object.entries(slotsByPos)) {
    const ordered = orderPool(byPos[pos] || [], manualOrder[pos] || [])
    const buckets = slots.map(() => [])
    ordered.forEach((p, i) => buckets[i % slots.length].push(p))
    slots.forEach((s, i) => { assignment[s.id] = buckets[i] })
  }

  return formation.map(s => {
    const players = assignment[s.id] || []
    const starter = players[0] || null
    const backups = players.slice(1)
    const topDev = starter?.devTrait || 'Normal'
    return {
      id: s.id,
      label: s.label,
      pos: s.pos,
      group: s.group,
      starter,
      backups,
      isHole: !starter,
      grade: gradeForOvr(starter?.projectedOvr ?? null, { depth: players.length, topDev }),
      risk: backups.concat(starter ? [starter] : []).reduce((acc, p) => {
        if (p && !p.isIncoming && p.player && isPortalRisk(p.player, lastYear, p.projectedClass)) acc[p.pid] = true
        return acc
      }, {}),
    }
  })
}
