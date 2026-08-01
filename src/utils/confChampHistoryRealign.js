// Conference Championships History paste self-heal.
//
// The local-paste grid for CC History is self-describing per row:
//
//   [ Year(0), Conference(1), Team 1(2), Team 2(3), Team 1 Score(4), Team 2 Score(5) ]
//
// Three of those columns (Conference, Team 1, Team 2) are FREE-FORM TEXT that
// cannot be told apart by content, so — unlike weeklyScoreRealign (which pins on
// two team-name anchors) or recruitSheetParse.realignTail (near-disjoint tail
// signatures) — we can NEVER reorder them relative to each other. The only
// reliable anchors are the Year (a 4-digit int) and the two trailing Scores
// (non-negative ints).
//
// So this heal is deliberately narrow: it corrects EXACTLY the one unambiguous
// shift — a dropped blank cell that slid the row so the three text cells are no
// longer contiguous in slots 1–3 — and BAILS (returns the row unchanged) on
// everything else. Corrupting a good row is the worst outcome, so we strongly
// prefer false-negatives (leave alone) over any false-positive.
//
// It is idempotent (a no-op on an already-canonical row) and safe to run at
// paste time via LocalDataEntry's normalizeRows hook.

const CANON_LEN = 6

// A 4-digit integer in a realistic season range. STRONG anchor.
const _isYear = (v) => {
  const s = String(v == null ? '' : v).trim()
  if (!/^\d{4}$/.test(s)) return false
  const n = parseInt(s, 10)
  return n >= 1900 && n <= 2200
}

// A non-negative integer (scores are 0–99 in practice, but any int qualifies).
const _isInt = (v) => /^\d+$/.test(String(v == null ? '' : v).trim())

const _isBlank = (v) => String(v == null ? '' : v).trim() === ''

// A free-form text cell: non-blank and NOT a bare integer (so it can't be
// confused with a Year or a Score). Conference / Team 1 / Team 2 all match this.
const _isText = (v) => {
  const s = String(v == null ? '' : v).trim()
  return s !== '' && !_isInt(s)
}

// Does `row` already match the canonical shape [year, text, text, text, int, int]?
const _isCanonical = (row) =>
  row.length === CANON_LEN &&
  _isYear(row[0]) &&
  _isText(row[1]) &&
  _isText(row[2]) &&
  _isText(row[3]) &&
  _isInt(row[4]) &&
  _isInt(row[5])

// Normalize ONE row.
//
// Strategy: strip blanks, and if what remains is EXACTLY
// [year, text, text, text, int, int] — a 4-digit year, then three contiguous
// text cells in their original relative order, then the two trailing score ints
// — rebuild the canonical row. This recovers a dropped-blank shift (e.g. a blank
// Conference that slid Team 1/Team 2/Scores left) WITHOUT ever reordering the
// three text cells or swapping the two scores. Any other content shape is
// ambiguous → return the row unchanged.
export function normalizeConfChampHistoryRow(row) {
  if (!Array.isArray(row)) return row

  const cells = row.map((c) => (c == null ? '' : String(c)))

  // Already canonical → no-op (keeps idempotency and never disturbs good rows).
  if (_isCanonical(cells)) return row

  // Collapse out blank cells; the survivors must be, in order:
  //   Year, Text, Text, Text, Int, Int
  const kept = cells.filter((c) => !_isBlank(c)).map((c) => c.trim())

  // Must have exactly the six non-blank canonical values. Fewer means a real
  // value is missing (an empty score, a missing team) — not a pure blank-shift —
  // and more means extra junk we can't place. Either way: bail.
  if (kept.length !== CANON_LEN) return row

  const [c0, c1, c2, c3, c4, c5] = kept

  // Pin the anchors: a 4-digit year first, two trailing ints last, and the three
  // middle cells all free-form text (so none of them is a stray misplaced int).
  const anchored =
    _isYear(c0) &&
    _isText(c1) &&
    _isText(c2) &&
    _isText(c3) &&
    _isInt(c4) &&
    _isInt(c5)

  if (!anchored) return row // anything ambiguous stays untouched

  // Exactly one reconstruction is possible: the canonical row. The three text
  // cells keep their original relative order; the two scores keep theirs.
  return [c0, c1, c2, c3, c4, c5]
}

export function normalizeConfChampHistoryRows(rows) {
  return Array.isArray(rows) ? rows.map(normalizeConfChampHistoryRow) : rows
}
