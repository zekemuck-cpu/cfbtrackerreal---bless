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

// Merge standalone PAT rows' patResult onto the preceding TD row.
//
// The All Plays AI prompt emits PATs as their own rows (scoreType="PAT",
// patResult="Made XP"). The Scoring Summary prompt collapses PAT into the
// TD row's column F. Both shapes can land in the same scoringSummary
// array depending on which entry path the user took. Downstream code
// (running score, recap math) only reads patResult off the TD row, so
// the standalone-row shape silently costs the team its 1-pt XP every
// time — visible as a "Made XP" chip that doesn't bump the score.
//
// Normalizer: for each standalone PAT row, walk backward to the most
// recent preceding scoring row. If that row is a TD from the same team
// with empty patResult, copy this PAT row's patResult onto it. The PAT
// row stays in place — it's still useful for PBP display (kicker name,
// time, etc.) and its getPlayPoints() yields 0 so there's no double-
// count.
//
// Returns a new array; only rows whose patResult was filled get cloned.
export function collapsePatRowsIntoTDs(plays) {
  if (!Array.isArray(plays) || plays.length === 0) return plays || []
  const chrono = sortPlaysChronologically(plays)
  const overrides = new Map()
  for (let i = 0; i < chrono.length; i++) {
    const p = chrono[i]
    const st = (p?.scoreType || '').trim()
    if (st !== 'PAT') continue
    if (!p.patResult) continue
    const team = (p.team || '').toUpperCase()
    for (let j = i - 1; j >= 0; j--) {
      const prev = chrono[j]
      const prevSt = (prev?.scoreType || '').trim()
      if (!prevSt) continue
      if (!/TD/.test(prevSt)) break
      if ((prev.team || '').toUpperCase() !== team) break
      if (prev.patResult) break
      overrides.set(prev, { ...prev, patResult: p.patResult })
      break
    }
  }
  if (overrides.size === 0) return plays
  return plays.map((p) => overrides.get(p) || p)
}
