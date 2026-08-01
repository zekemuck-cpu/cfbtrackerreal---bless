// Recruiting Database paste self-heal.
//
// The Recruiting Database's local-paste grid uses the RECRUITS schema
// (recruitSheetParse.js) MINUS the Commitment column, and — as of Scout Staff
// v22 — MINUS the Previous Team column (the Database is HS recruits only, so
// it never applies):
//   Name(0) Class(1) Pos(2) Arch(3) Stars(4) Natl Rk(5) St Rk(6) Pos Rk(7)
//   Height(8) Weight(9) Hometown(10) State(11) Gem/Bust(12) Dev(13)
//   Attributes(14)
// (parseRecruitingDatabaseRow appends the hidden pid/Updated/Scouted columns
// past index 14; those are never present in a paste and are left untouched.)
//
// AI TSV pastes shift columns two ways, fixed here in order — mirroring
// recruitSheetParse.js's fixMisalignedRow + realignTail, adapted to the 3-slot
// tail (12–14) with NO Commitment and NO Previous Team column:
//
//  1. STRUCTURAL: State Rank and/or Pos Rank omitted when blank pushes Height
//     out of index 8. Detected by the height signature landing at index 6 or 7;
//     fixed by inserting the missing blanks so the tail lines up before Fix #2.
//  2. CONTENT tail-sort: a dropped blank Gem/Bust / Dev Trait slides Attributes
//     left, or a stray extra cell (an old habit from when Prev Team sat there)
//     pushes it right. Rebuilt by re-placing each tail cell by WHAT IT IS
//     (disjoint content signatures), not its position.
//
// NON-NEGOTIABLE: this is IDEMPOTENT (a no-op on an already-aligned row, stable
// under double-apply) and BAILS to the original row whenever the tail content is
// ambiguous, so it can never corrupt a well-formed paste. Free-form columns
// (0–11) are left positional/untouched.

import { parseAttributes } from './recruitSheetParse'

const trim = (v) => (v != null ? String(v).trim() : '')

// The tail fields Gem/Bust, Dev Trait, Attributes each have a near-disjoint
// content signature — matched case-INSENSITIVELY and canonicalized on the way
// out (a pasted "gem" / "HIDDEN" is recognized and normalized, not dropped as
// unknown). Replicated here (not imported) because recruitSheetParse.js keeps
// them module-private.
const GEM_BUST_CANON = { gem: 'Gem', bust: 'Bust' }
const DEV_TRAIT_CANON = { elite: 'Elite', star: 'Star', impact: 'Impact', normal: 'Normal', hidden: 'Hidden' }
const hasLetter = (s) => /[A-Za-z]/.test(s)
// An Attributes cell holds recognized "<code> <rating>" pairs — parseAttributes
// only returns non-null for real attribute vocabulary, so a team abbr / dev
// trait / gem word never matches.
const isAttributeCell = (s) => parseAttributes(s) != null
// Height always looks like  5'9"  or  6'4"  — never a plain integer.
const HEIGHT_RE = /^\d+'\d+(?:\.\d+)?"/

// Deterministically rebuild the tail (Gem/Bust(12), Dev Trait(13),
// Attributes(14)) from whatever non-empty values currently sit at index 12 and
// beyond, re-placing each by its CONTENT. A raw paste has no hidden columns
// past Attributes, so everything from 12 on is fair game — this also catches an
// Attributes cell a stray blank pushed out to index 15. No-op on an
// already-aligned row. Because the Database has NO Previous Team column, any
// leftover non-attribute, non-Gem/Dev cell is a stray the AI shouldn't have
// emitted: a single one is dropped, two or more is too ambiguous to place → we
// BAIL (return the row unchanged) rather than guess.
function realignTail(r) {
  const vals = []
  for (let i = 12; i < r.length; i++) {
    const v = trim(r[i])
    if (v) vals.push(v)
  }
  if (!vals.length) return r // empty tail — nothing to place

  let gemBust = ''
  let dev = ''
  const attrParts = []
  const rest = []
  for (const v of vals) {
    const low = v.toLowerCase()
    if (!gemBust && GEM_BUST_CANON[low]) { gemBust = GEM_BUST_CANON[low]; continue }
    if (!dev && DEV_TRAIT_CANON[low]) { dev = DEV_TRAIT_CANON[low]; continue }
    // Collect EVERY attribute-looking cell — a stray tab can split one recruit's
    // attributes across cells; merge them back into the single Attributes slot.
    if (isAttributeCell(v)) { attrParts.push(v); continue }
    rest.push(v)
  }

  // Any leftover cell with letters is a stray (no Prev Team slot to hold it).
  // Drop a lone one; bail on two or more.
  const stray = rest.filter(hasLetter)
  if (stray.length > 1) return r

  const out = r.slice(0, 12)
  out[12] = gemBust
  out[13] = dev
  out[14] = attrParts.join(', ')
  return out
}

// Self-heal one raw pasted Recruiting Database row. Returns the row unchanged
// when it's not an array, already aligned, or too ambiguous to reconstruct.
export function normalizeRecruitDatabaseRow(row) {
  if (!Array.isArray(row)) return row
  let r = row

  // Fix #1 (structural): State Rank and/or Pos Rank dropped — detected by Height
  // (X'Y") landing at index 6 or 7 instead of 8. Insert (8 - i) blank slots
  // starting at index 6 (before State Rank) to push the tail right.
  for (let i = 6; i <= 7; i++) {
    if (HEIGHT_RE.test(trim(r[i]))) {
      const missing = 8 - i
      r = [...r.slice(0, 6), ...Array(missing).fill(''), ...r.slice(6)]
      break
    }
  }

  // Fix #2 (content tail-sort): rebuild the 12–15 tail by content.
  return realignTail(r)
}

// Normalize a grid of raw pasted rows for the LocalDataEntry grid's
// `normalizeRows` prop — the moment a paste lands, BEFORE rendering — so the
// grid shows corrected columns immediately and the import matches what the user
// sees. Guards a non-array input, and skips nameless rows (row[0] empty) the
// same way normalizeRecruitRows does. Idempotent, so re-running it is harmless.
export function normalizeRecruitDatabaseRows(rows) {
  if (!Array.isArray(rows)) return rows
  return rows.map((row) => (Array.isArray(row) && trim(row[0]) ? normalizeRecruitDatabaseRow(row) : row))
}
