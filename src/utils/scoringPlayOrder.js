// Sort scoring plays into the order they happened in-game.
// Quarter counts up (1, 2, 3, 4, 5=OT, 6=2OT, ...); time-left counts DOWN
// within a quarter, so a play with more time remaining happened earlier.

function parseTimeLeft(t) {
  if (t == null) return 0
  const parts = String(t).split(':')
  const mins = parseInt(parts[0], 10) || 0
  const secs = parseInt(parts[1], 10) || 0
  return mins * 60 + secs
}

// Map a raw quarter value (numeric, "1"-"4", "OT", "2OT", "3OT", etc.) into
// a comparable rank. Previously `Number("OT")` returned NaN and fell back
// to 0, which sorted every overtime play *before* Q1 and ruined running
// scores throughout the UI. OT → 5, 2OT → 6, and so on.
export function quarterRank(q) {
  if (q == null) return 0
  if (typeof q === 'number' && Number.isFinite(q)) return q
  const s = String(q).trim().toUpperCase()
  if (!s) return 0
  // Pure number like "1", "2", "3", "4"
  if (/^\d+$/.test(s)) return parseInt(s, 10)
  // OT variants: "OT", "1OT", "2OT", ...
  const otMatch = s.match(/^(\d*)OT$/)
  if (otMatch) {
    const n = otMatch[1] ? parseInt(otMatch[1], 10) : 1
    return 4 + n
  }
  return 0
}

export function compareByGameTime(a, b) {
  const qa = quarterRank(a?.quarter)
  const qb = quarterRank(b?.quarter)
  if (qa !== qb) return qa - qb
  return parseTimeLeft(b?.timeLeft) - parseTimeLeft(a?.timeLeft)
}

export function sortPlaysChronologically(plays) {
  return [...(plays || [])].sort(compareByGameTime)
}
