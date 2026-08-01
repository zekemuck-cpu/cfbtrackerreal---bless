// Roster paste self-heal — CONSERVATIVE, Height-anchored structural insert.
//
// The roster grid columns are:
//   [First(0), Last(1), Position(2), Class(3), Dev(4), Jersey#(5), Archetype(6),
//    Overall(7), Height(8), Weight(9), Hometown(10), State(11), Image(12),
//    NIL(13)]  (+ optional Attributes(14) when player attributes are enabled)
//
// Unlike the recruiting sheet, this row is DENSE with numeric columns that
// collide by content (Jersey#, Overall, Weight, NIL are all bare integers), so
// we can NOT sort the tail back into place by content the way realignTail does
// in recruitSheetParse.js. Reordering numerics by content would corrupt good
// rows. Instead we heal ONLY the one clean, unambiguous shape and BAIL on
// everything else:
//
//   A dropped EMPTY categorical cell (most commonly a blank Dev Trait — hidden
//   until signing day — or a blank Archetype) makes every later column slide one
//   position LEFT, so Height (the one column with a UNIQUE signature, X'Y") lands
//   left of its home index 8. We detect that by Height's position and, if there
//   is EXACTLY ONE way to re-insert the missing blank(s) that makes the
//   categorical spine (Position, Class, Dev, Overall, Height) all validate, we
//   apply it. Zero or more-than-one valid reconstruction => BAIL (return the row
//   unchanged). A right-slide (Height past index 8) would require REMOVING cells
//   by content — too risky — so that also bails.
//
// This mirrors the Height-anchored structural fix in recruitSheetParse.js
// (fixMisalignedRow) but is deliberately stricter: it prefers false negatives
// (leave a row alone) over any chance of corrupting a well-formed paste. It is
// idempotent (a no-op once Height sits at 8), so it is safe to run at paste time
// via LocalDataEntry's normalizeRows hook.

import { POSITIONS, CLASSES, DEV_TRAITS } from '../data/rosterOptions'

const HEIGHT_COL = 8

const trim = (v) => (v == null ? '' : String(v).trim())
const isBlank = (v) => trim(v) === ''

// Height is the only column with a unique, unmistakable signature: 6'2", 5'11.5".
// A plain integer (Jersey/Overall/Weight/NIL) never matches, so it is a reliable
// structural anchor.
const HEIGHT_RE = /^\d+'\d+(?:\.\d+)?"/
const isHeight = (v) => HEIGHT_RE.test(trim(v))

// Closed enums (case-insensitive membership). Built from rosterOptions.js so the
// predicates stay in lockstep with the grid dropdowns.
const norm = (v) => trim(v).toLowerCase()
const POSITION_SET = new Set(POSITIONS.map(norm))
const CLASS_SET = new Set(CLASSES.map(norm))
// Dev Trait is hidden until signing day, so it is the categorical most often
// left blank — the primary drop we heal. Allow "Hidden" defensively in case a
// paste carries it even though it is not an in-app dropdown value.
const DEV_SET = new Set([...DEV_TRAITS, 'Hidden'].map(norm))

const isPosition = (v) => POSITION_SET.has(norm(v))
const isClass = (v) => CLASS_SET.has(norm(v))
const isDev = (v) => DEV_SET.has(norm(v))
// Overall is a bare integer 40-99. Requiring it present-and-in-range is a strong
// disambiguator that pins the single valid re-insertion in the healable case.
const isOverall = (v) => /^\d+$/.test(trim(v)) && Number(trim(v)) >= 40 && Number(trim(v)) <= 99

// The categorical spine validates when Position and Class carry recognized
// (non-blank) values, Overall is a real 40-99, Height sits at 8, and Dev is
// EITHER blank (the dropped-empty case) OR a recognized trait. Only Dev may be
// blank — that asymmetry is what restricts healing to the clean single-block
// slide and lets an archetype/other-slot drop stay ambiguous (=> bail).
function spineValidates(cells) {
  return (
    isPosition(cells[2]) &&
    isClass(cells[3]) &&
    (isBlank(cells[4]) || isDev(cells[4])) &&
    isOverall(cells[7]) &&
    isHeight(cells[HEIGHT_COL])
  )
}

// Insert `count` blank cells at index `at`, shifting the tail right. Preserves
// the optional trailing Attributes column (it just rides along in the tail).
function insertBlanks(cells, at, count) {
  const blanks = Array(count).fill('')
  return [...cells.slice(0, at), ...blanks, ...cells.slice(at)]
}

export function normalizeRosterRow(row) {
  if (!Array.isArray(row)) return row

  // Locate Height. Exactly one Height-like cell is required as the anchor;
  // zero (nothing to key off) or two+ (ambiguous) => bail.
  let heightIdx = -1
  let heightCount = 0
  for (let i = 0; i < row.length; i++) {
    if (isHeight(row[i])) {
      heightCount++
      heightIdx = i
    }
  }
  if (heightCount !== 1) return row

  // Already aligned (idempotent no-op), or a right-slide we refuse to heal by
  // removing cells (too risky) => return unchanged.
  if (heightIdx >= HEIGHT_COL) return row

  const missing = HEIGHT_COL - heightIdx

  // Try inserting the missing blank(s) as one contiguous block at each position
  // from 0..heightIdx (any of these moves Height to index 8). Heal ONLY if
  // exactly one insertion point makes the spine validate.
  let healed = null
  let validCount = 0
  for (let at = 0; at <= heightIdx; at++) {
    const candidate = insertBlanks(row, at, missing)
    if (spineValidates(candidate)) {
      validCount++
      healed = candidate
      if (validCount > 1) return row // ambiguous — bail
    }
  }

  return validCount === 1 ? healed : row
}

export function normalizeRosterRows(rows) {
  return Array.isArray(rows) ? rows.map(normalizeRosterRow) : rows
}
