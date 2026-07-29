// A team's current Top 25 rank — the highest canonical poll slot entered
// so far this season, independent of dynasty.currentWeek/currentPhase (both
// proved unreliable against real data — see SportsbookPanel.jsx's history).
// Mirrors Rankings.jsx's own proven-correct logic exactly, so this always
// agrees with what the Top 25 page itself shows.
//
// Poll source per week mirrors CFB27's own in-game Rankings screen: it
// features the Media poll for weeks 1-9, then switches its primary Top 25
// to the CFP Committee poll starting week 10 (confirmed against real save
// screenshots — the two polls can genuinely disagree, e.g. a team ranked
// differently in each). Falls back to the other poll when the primary one
// is missing that specific week's entry (dynasties synced before
// cfpRankByWeek existed only ever populate rankByWeek).
//
// @param {object} dynasty
// @param {number|string} tid
// @param {number|string} year
// @returns {number|null} 1-25, or null if unranked / no poll data yet
export function currentPollRank(dynasty, tid, year) {
  const t = dynasty?.teams?.[tid]
  const byYear = t?.byYear?.[Number(year)] ?? t?.byYear?.[String(year)]
  if (!byYear) return null
  const media = byYear.rankByWeek || {}
  const cfp = byYear.cfpRankByWeek || {}
  let best = null
  let bestWeek = -Infinity
  const weekKeys = new Set([...Object.keys(media), ...Object.keys(cfp)])
  for (const k of weekKeys) {
    const wk = Number(k)
    if (!Number.isFinite(wk)) continue
    // Canonical poll slots only (same set Rankings.jsx recognizes):
    // Preseason(0), Weeks 1-15, Conf Champ(16), Bowl Weeks(17-20), CFP
    // rounds + Final(101-105) — skips legacy/orphan slots like "100".
    const isCanonical = (wk >= 0 && wk <= 20) || (wk >= 101 && wk <= 105)
    if (!isCanonical) continue
    const primary = wk >= 10 ? cfp : media
    const fallback = wk >= 10 ? media : cfp
    let v = primary[k]
    if (typeof v !== 'number' || v < 1 || v > 25) v = fallback[k]
    if (typeof v !== 'number' || v < 1 || v > 25) continue
    if (wk > bestWeek) { bestWeek = wk; best = v }
  }
  return best
}
