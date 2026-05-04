/**
 * Format a final score with the higher value first regardless of which
 * side it belongs to ("L 13-10", never "L 10-13"). Returns '' when
 * either value is missing or non-numeric so callers can fall back to a
 * placeholder ("—") on unplayed games.
 */
export function formatScoreHighLow(a, b, sep = '-') {
  if (a == null || b == null) return ''
  const x = Number(a), y = Number(b)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return ''
  return `${Math.max(x, y)}${sep}${Math.min(x, y)}`
}
