// Weekly-score paste self-heal.
//
// Weekly-score rows arrive column-shifted from AI pastes more often than not,
// and the shift shape varies: an extra blank between a team's Rank and Score,
// or — the common one users hit — a RANKED team whose rank value pushes that
// team's score one column right, so an away score lands in the Neutral column.
// Rather than chase each shape positionally, REBUILD each game row from content:
// the two team NAMES are anchors; the numbers BETWEEN them are the home
// Rank/Score; the numbers AFTER the away team are its Rank/Score plus an
// optional Y/N neutral flag. Schema order is always Team -> Rank -> Score, and a
// rank is always 1-25, so a two-number side is unambiguously (rank, score).
//
// This is a no-op on already-canonical rows (idempotent — safe to run at paste
// time via LocalDataEntry AND again inside the parser) and BAILS to the original
// row whenever the content is ambiguous, so it can never corrupt a well-formed
// paste. Only game rows (exactly two team anchors) are rebuilt; bye-rank rows,
// the section banner, and prose pass through untouched. Mirrors the recruit
// realignTail strategy (src/utils/recruitSheetParse.js).

const _wsNum = (v) => v != null && /^\d+$/.test(String(v).trim())
const _wsNeutralFlag = (v) => /^(Y|N|YES|NO|TRUE|FALSE)$/i.test(String(v == null ? '' : v).trim())
const _wsTeamText = (v) => {
  const s = String(v == null ? '' : v).trim()
  return s !== '' && !_wsNum(s) && !_wsNeutralFlag(s)
}

// Collapse a team's collected numbers into { rank, score }. 1 number = score
// only (unranked); 2 numbers = Rank (1-25, first) then Score. Returns null for
// an un-healable count (a 2-number pair whose first isn't a valid rank, or 3+
// numbers) so the caller keeps the original row rather than guessing.
const _wsSide = (nums) => {
  if (nums.length === 0) return { rank: '', score: '' }
  if (nums.length === 1) return { rank: '', score: nums[0] }
  if (nums.length === 2) {
    const r = parseInt(nums[0], 10)
    if (r >= 1 && r <= 25) return { rank: nums[0], score: nums[1] }
    return null
  }
  return null
}

export function normalizeWeeklyScoreRow(row) {
  if (!Array.isArray(row)) return row
  const cells = row.map((c) => (c == null ? '' : String(c)))
  // Team-name anchors. Only rebuild clear GAME rows (exactly two).
  const teamIdx = []
  for (let i = 0; i < cells.length; i++) if (_wsTeamText(cells[i])) teamIdx.push(i)
  if (teamIdx.length !== 2) return row
  const [hi, ai] = teamIdx
  // Non-blank junk before the home team means an unexpected shape — bail.
  for (let i = 0; i < hi; i++) if (cells[i].trim() !== '') return row
  const between = []
  for (let i = hi + 1; i < ai; i++) if (_wsNum(cells[i])) between.push(cells[i].trim())
  const afterNums = []
  let neutral = ''
  for (let i = ai + 1; i < cells.length; i++) {
    const v = cells[i].trim()
    if (v === '') continue
    if (_wsNeutralFlag(v)) { if (!neutral) neutral = v; continue }
    if (_wsNum(v)) { afterNums.push(v); continue }
    return row // non-numeric, non-neutral junk after the away team — too ambiguous
  }
  const home = _wsSide(between)
  const away = _wsSide(afterNums)
  if (!home || !away) return row
  return [cells[hi].trim(), home.rank, home.score, cells[ai].trim(), away.rank, away.score, neutral]
}

export function normalizeWeeklyScoreRows(rows) {
  return Array.isArray(rows) ? rows.map(normalizeWeeklyScoreRow) : rows
}
