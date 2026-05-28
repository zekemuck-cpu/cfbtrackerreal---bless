// Filter + rank players for the photo-tag search. Matches on name OR
// jersey number, and ranks the matches so the most relevant float up:
//   0 — jersey is an EXACT match (typing "3" → #3 first)
//   1 — jersey starts with the query ("3" → #30, #31)
//   2 — name starts with the query ("dor" → Dorial)
//   3 — jersey merely contains the query ("3" → #13, #23)
//   4 — name merely contains the query
// Ties break alphabetically by name. An empty query returns the input
// unchanged (callers pass an already name-sorted list).
export function matchAndRankPlayers(players, query) {
  const list = Array.isArray(players) ? players : []
  const q = (query || '').trim().toLowerCase()
  if (!q) return list

  const scored = []
  for (const p of list) {
    const name = (p?.name || '').toLowerCase()
    const jersey = (p?.jerseyNumber != null && p.jerseyNumber !== '') ? String(p.jerseyNumber).toLowerCase() : ''
    let rank = Infinity
    if (jersey && jersey === q) rank = 0
    else if (jersey && jersey.startsWith(q)) rank = 1
    else if (name.startsWith(q)) rank = 2
    else if (jersey && jersey.includes(q)) rank = 3
    else if (name.includes(q)) rank = 4
    if (rank !== Infinity) scored.push({ p, rank })
  }

  scored.sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : (a.p.name || '').localeCompare(b.p.name || '')))
  return scored.map(s => s.p)
}
