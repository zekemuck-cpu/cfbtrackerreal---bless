import { candidateSlots } from '../data/positionGroups'

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

const byOvrDesc = (a, b) => (b.projectedOvr ?? -1) - (a.projectedOvr ?? -1)

// Order one slot's players: manual within-slot order (pids) first, then OVR.
function orderWithin(players, manualPids = []) {
  const sorted = [...players].sort(byOvrDesc)
  if (!manualPids.length) return sorted
  const rank = new Map(manualPids.map((pid, i) => [pid, i]))
  return sorted.sort((a, b) => {
    const ra = rank.has(a.pid) ? rank.get(a.pid) : Infinity
    const rb = rank.has(b.pid) ? rank.get(b.pid) : Infinity
    if (ra !== rb) return ra - rb
    return byOvrDesc(a, b)
  })
}

// Build the per-slot depth chart for one tab's formation, keeping every player
// at their natural POSITION:
// - A player is assigned to the formation slot matching their position code
//   (exact pos wins; generic codes like OT/EDGE/LB expand to their role's
//   slots; truly-unknown positions fall back to any slot in their group).
// - Only same-role multi-slot positions (WR1/WR2, DT1/DT2, CB1/CB2) and
//   generic linemen are balanced across slots by OVR; a player coded for a
//   single distinct slot (LT, C, MIKE…) stays there.
// - slotOf[pid] is a manual override (set by dragging a player to another
//   position) and is honored first.
// - order[slotId] is a manual within-slot depth order (▲▼).
//
// projected: ProjectedPlayer[] (from projectRoster).
export function buildDepthChart(projected, { formation, slotOf = {}, order = {}, lastYear = null }) {
  const bySlot = {}
  for (const s of formation) bySlot[s.id] = []

  // 1) Honor manual cross-position overrides first.
  const rest = []
  for (const p of projected) {
    const pinned = p.pid != null ? slotOf[p.pid] : null
    if (pinned && bySlot[pinned]) bySlot[pinned].push(p)
    else rest.push(p)
  }

  // 2) Place players. Single-candidate players (a distinct position like LT,
  //    C, MIKE) are assigned to their only slot first so they OWN it; then
  //    multi-candidate players (same-role WR1/WR2, generic linemen, etc.) fill
  //    the least-occupied eligible slot, OVR desc — so generics back-fill the
  //    spots exact-position players didn't already claim.
  const withCands = rest
    .map(p => ({ p, cands: candidateSlots(formation, p.position) }))
    .filter(x => x.cands.length)
  for (const { p, cands } of withCands) {
    if (cands.length === 1) bySlot[cands[0]].push(p)
  }
  const multis = withCands.filter(x => x.cands.length > 1).sort((a, b) => byOvrDesc(a.p, b.p))
  for (const { p, cands } of multis) {
    let pick = cands[0]
    for (const c of cands) { if (bySlot[c].length < bySlot[pick].length) pick = c }
    bySlot[pick].push(p)
  }

  // 3) Order within each slot and build the slot view.
  return formation.map(s => {
    const players = orderWithin(bySlot[s.id], order[s.id] || [])
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
      slotPids: players.map(p => p.pid).filter(Boolean), // for within-slot ▲▼ reorder
      grade: gradeForOvr(starter?.projectedOvr ?? null, { depth: players.length, topDev }),
      risk: backups.concat(starter ? [starter] : []).reduce((acc, p) => {
        if (p && !p.isIncoming && p.player && isPortalRisk(p.player, lastYear, p.projectedClass)) acc[p.pid] = true
        return acc
      }, {}),
    }
  })
}
