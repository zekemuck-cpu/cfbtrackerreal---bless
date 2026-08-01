// Staff Moves (coaching carousel) paste self-heal.
//
// The Staff Moves grid columns are, in order:
//
//   [ Name(0), Prev Pos(1), Prev School(2), New Pos(3), New School(4), Reason(5) ]
//
// The two POSITION columns (Prev Pos at 1, New Pos at 3) are a closed enum
// (HC / OC / DC, see STAFF_MOVE_ROLES in staffMoves.js). Everything else (Name,
// both School columns, Reason) is FREE-FORM TEXT and therefore NOT distinguishable
// from one another by content, so we NEVER reorder those. The role columns are
// the only reliable "spine" anchoring the row.
//
// The #1 AI-paste failure is a dropped EMPTY cell that slides the row LEFT: e.g.
// the AI omits a blank Name, so every value shifts one column down and a role
// value lands at the wrong index. This util reverses ONLY that failure. It
// re-inserts the dropped blank(s) so the two role columns land back at indices 1
// and 3, WITHOUT ever reordering the free-text columns.
//
// Guarantees (mirrors recruitSheetParse.realignTail / weeklyScoreRealign):
//  - IDEMPOTENT / NO-OP on an already-aligned row (roles at 1 and 3).
//  - BAIL-ON-AMBIGUITY: if there is not EXACTLY ONE way to insert dropped blanks
//    that restores both roles to indices 1 and 3, the ORIGINAL row is returned
//    UNCHANGED. Corrupting a good row is worse than missing a shifted one, so we
//    prefer false-negatives over false-positives and never guess or swap.

import { STAFF_MOVE_ROLES } from './staffMoves'

const N_COLS = 6 // canonical column count
const ROLE_IDX = [1, 3] // the two position-enum columns

const ROLE_SET = new Set(STAFF_MOVE_ROLES.map((r) => r.toUpperCase()))
const isRole = (v) => ROLE_SET.has(String(v == null ? '' : v).trim().toUpperCase())

// A canonical row is exactly N_COLS wide with a recognized role at each role index.
const isCanonical = (arr) =>
  Array.isArray(arr) && arr.length === N_COLS && ROLE_IDX.every((i) => isRole(arr[i]))

// All size-k index subsets of {0..N_COLS-1} (the positions to fill with inserted
// blanks). k is small (0..5) so this is cheap.
function blankPositionSets(k) {
  const out = []
  const rec = (start, chosen) => {
    if (chosen.length === k) { out.push(chosen.slice()); return }
    for (let i = start; i < N_COLS; i++) { chosen.push(i); rec(i + 1, chosen); chosen.pop() }
  }
  rec(0, [])
  return out
}

/**
 * Conservatively self-heal one Staff Moves row.
 *
 * Returns the ORIGINAL row reference unchanged when it is already aligned, when
 * no shift is detectable, or whenever the reconstruction is ambiguous. Only when
 * there is EXACTLY ONE way to re-insert dropped blank cell(s) so both role
 * columns validate at indices 1 and 3 do we return the healed (6-wide) row.
 *
 * @param {string[]} row  pre-split TSV cells
 * @returns {string[]} healed row, or the original row unchanged
 */
export function normalizeStaffMoveRow(row) {
  if (!Array.isArray(row)) return row
  const cells = row.map((c) => (c == null ? '' : String(c)))

  // Already aligned: no-op (this is also what makes the util idempotent: a
  // healed row fed back in is canonical and returns unchanged).
  if (isCanonical(cells)) return row

  // We only reverse dropped-cell (left-shift) failures, which make the row too
  // SHORT. A row that already has >= N_COLS cells cannot be fixed by inserting
  // blanks without exceeding the schema, so bail rather than reorder.
  const k = N_COLS - cells.length
  if (k <= 0) return row

  // Enumerate every way to insert exactly k blanks (choose which output columns
  // are the inserted blanks; the original cells fill the rest IN ORDER, so
  // free-text columns are never reordered). Keep only reconstructions whose role
  // spine validates. If exactly one distinct result validates, apply it; if zero
  // or many, bail to the original row.
  let healed = null
  const seen = new Set()
  for (const blanks of blankPositionSets(k)) {
    const blankSet = new Set(blanks)
    const arr = new Array(N_COLS)
    let src = 0
    for (let i = 0; i < N_COLS; i++) arr[i] = blankSet.has(i) ? '' : cells[src++]
    if (!isCanonical(arr)) continue
    // Two blank placements can yield the SAME array when the source already
    // holds an empty cell; dedup by content so that is not miscounted as
    // ambiguity.
    const key = arr.join(' ')
    if (seen.has(key)) continue
    seen.add(key)
    healed = arr
    if (seen.size > 1) return row // more than one distinct reconstruction: never guess
  }
  return seen.size === 1 ? healed : row
}

/**
 * Map normalizeStaffMoveRow over a grid of pasted rows. Non-array input passes
 * through untouched (matches the LocalDataEntry normalizeRows contract).
 *
 * @param {string[][]} rows
 * @returns {string[][]} normalized grid (or the original value if not an array)
 */
export function normalizeStaffMoveRows(rows) {
  return Array.isArray(rows) ? rows.map(normalizeStaffMoveRow) : rows
}
