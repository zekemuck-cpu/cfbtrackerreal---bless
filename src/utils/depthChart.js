// Shared depth-chart helpers. Pure + unit-tested.
// (The old formation-based `buildDepthChart` was never wired to any UI and has
// been removed; the Outlook board builder lives in ./outlookBoard.js.)

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
