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
    // Sync keys these by the save's raw continuous CurrentWeek counter,
    // which runs past 20 for a deep CFP run rather than landing in a
    // fixed 17-20/101-105 slot scheme (see Rankings.jsx's matching fix) —
    // skip only the one known-bogus legacy sentinel ("100").
    if (wk < 0 || wk === 100) continue
    const primary = wk >= 10 ? cfp : media
    const fallback = wk >= 10 ? media : cfp
    let v = primary[k]
    if (typeof v !== 'number' || v < 1 || v > 25) v = fallback[k]
    if (typeof v !== 'number' || v < 1 || v > 25) continue
    if (wk > bestWeek) { bestWeek = wk; best = v }
  }
  return best
}
