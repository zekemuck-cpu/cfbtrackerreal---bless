// Sort scoring plays into the order they happened in-game.
// Quarter counts up (1, 2, 3, 4, 5=OT, ...); time-left counts DOWN within
// a quarter, so a play with more time remaining happened earlier.

function parseTimeLeft(t) {
  if (t == null) return 0
  const parts = String(t).split(':')
  const mins = parseInt(parts[0], 10) || 0
  const secs = parseInt(parts[1], 10) || 0
  return mins * 60 + secs
}

export function compareByGameTime(a, b) {
  const qa = Number(a?.quarter) || 0
  const qb = Number(b?.quarter) || 0
  if (qa !== qb) return qa - qb
  return parseTimeLeft(b?.timeLeft) - parseTimeLeft(a?.timeLeft)
}

export function sortPlaysChronologically(plays) {
  return [...(plays || [])].sort(compareByGameTime)
}
