// Pure parser for one recruiting-sheet row → recruit object.
//
// Extracted from readRecruitingFromSheet so the column layout is unit-testable
// without the Google Sheets API. Columns A–O (0–14) are the EXISTING commitment
// fields and are parsed identically to the legacy reader — a legacy commitments
// sheet (no P+) round-trips byte-for-byte. The Targets feature appends:
//   P  (15)                 Commitment  — '' = your team, 'Uncommitted' = open, team = there
//   Q.. (16 … 16+N-1)       one column per NAMED attribute (ATTRIBUTE_COLUMNS order)
//   next col                pid         — hidden, for stable pid-first reconciliation
//
// Each attribute is its own named column (not a position-relative slot), so the
// reader maps column → attribute by fixed position in ATTRIBUTE_COLUMNS. A
// blank/absent column (legacy sheet) yields commitment:'' (→ committed to you),
// attributes:null, pid:undefined.

import { ATTRIBUTE_COLUMNS, ATTRIBUTE_ABBR } from './recruitAttributes'

export const COMMITMENT_COL = 15
// Attributes are now a SINGLE labeled cell at ATTR_COL_START (the AI fills it
// with "<code> <rating>" pairs, e.g. "AWR 76, SPD 67, TAK 80"). The remaining
// legacy attribute-column slots stay blank so pid/NIL keep their positions and
// existing sheets round-trip structurally.
export const ATTR_CELL_COL = 16
export const ATTR_COL_START = 16
export const ATTR_COL_END = ATTR_COL_START + ATTRIBUTE_COLUMNS.length // exclusive
export const PID_COL = ATTR_COL_END
// NIL (CFB 27+) sits AFTER the hidden pid column so PID_COL never shifts — a
// pre-NIL sheet still round-trips its pid byte-for-byte (the parser just reads
// nil:null). It's a visible trailing column the user fills with the offer.
export const NIL_COL = PID_COL + 1
// Last-edited timestamp (epoch ms) — appended AFTER NIL for the same
// round-tripping reason NIL was appended after the hidden pid column: a
// pre-Updated sheet still parses fine (updatedAt:null), and this is what lets
// the Recruiting Database's Google Sheet sync do most-recent-wins conflict
// resolution per recruit.
export const UPDATED_AT_COL = NIL_COL + 1
// Total column count A..Updated (used to size the sheet grid).
export const TOTAL_COLS = UPDATED_AT_COL + 1

// Convert a 0-based column index to an A1 letter (0→A, 26→AA, 58→BG).
function colLetter(idx) {
  let s = ''
  for (let n = idx + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  }
  return s
}

// Read range wide enough for A..Updated and tall enough for a full season of targets.
export const RECRUITING_READ_RANGE = `Commitments!A2:${colLetter(UPDATED_AT_COL)}600`
export { colLetter }

const NON_PORTAL_CLASSES = ['HS', 'JUCO Fr', 'JUCO So', 'JUCO Jr']

// Accept every star notation users actually paste: the app's own sheets
// write outline stars ("☆☆☆☆"), but external tools and hand-typed cells use
// filled stars ("★★★★") or the mixed ratings format ("★★★★☆" = 4 of 5).
// Counting only ☆ made a filled-stars 4-star parse as 0 and the mixed format
// parse as 1 — the "all my recruits show 1 star or no stars" bug. Filled
// stars win when present (in the mixed format ☆ is the EMPTY remainder);
// plain numbers ("4") work too.
const starsSymbolToNumber = (s) => {
  if (!s) return 0
  const str = String(s)
  const filled = (str.match(/★/g) || []).length
  if (filled > 0) return Math.min(filled, 5)
  const outline = (str.match(/☆/g) || []).length
  if (outline > 0) return Math.min(outline, 5)
  const n = parseInt(str, 10)
  return Number.isFinite(n) ? Math.max(0, Math.min(n, 5)) : 0
}
const trim = (v) => (v != null ? String(v).trim() : '')
const intOrNull = (v) => (v ? parseInt(v, 10) : null)

// Map a normalized label (the short code OR the full attribute name) to its
// canonical attribute name. Built once from ATTRIBUTE_COLUMNS + ATTRIBUTE_ABBR.
const normLabel = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '')
const ATTR_BY_LABEL = (() => {
  const m = {}
  for (const name of ATTRIBUTE_COLUMNS) {
    m[normLabel(name)] = name
    const abbr = ATTRIBUTE_ABBR[name]
    if (abbr) m[normLabel(abbr)] = name
  }
  return m
})()

// Parse the single "Attributes" cell — a list of "<label> <rating>" pairs the
// AI fills by reading each attribute off the player's Attributes tab (e.g.
// "AWR 76, SPD 67, TAK 80"). Labels may be the 3-letter code or the full name;
// separators (comma / semicolon / newline / space) don't matter. A legacy cell
// holding a bare number (old per-named-column layout) has no label and yields
// no attributes.
export function parseAttributes(cell) {
  if (cell == null) return null
  const text = String(cell).trim()
  if (!text) return null
  const out = {}
  // Each pair = a letter-led label immediately followed by a 1–3 digit rating.
  const re = /([A-Za-z][A-Za-z .'/&-]*?)\s*[:=]?\s*(\d{1,3})/g
  let match
  while ((match = re.exec(text)) !== null) {
    const value = Number(match[2])
    if (!Number.isFinite(value) || value < 0 || value > 99) continue
    const name = ATTR_BY_LABEL[normLabel(match[1])]
    if (name && out[name] == null) out[name] = value
  }
  return Object.keys(out).length ? out : null
}

// The five tail fields (M–Q: Gem/Bust, Dev Trait, Prev Team, Commitment,
// Attributes) each have a near-disjoint content signature, which is what lets
// realignTail below re-place them by CONTENT instead of by position. Matched
// case-INSENSITIVELY and canonicalized on the way out, so a pasted "gem",
// "HIDDEN", etc. is recognized (not dropped as unknown) and normalized.
const GEM_BUST_CANON = { gem: 'Gem', bust: 'Bust' }
const DEV_TRAIT_CANON = { elite: 'Elite', star: 'Star', impact: 'Impact', normal: 'Normal', hidden: 'Hidden' }
const hasLetter = (s) => /[A-Za-z]/.test(s)
const isUncommitted = (s) => /^uncommitted$/i.test(s)
// An Attributes cell holds recognized "<name> <rating>" pairs — parseAttributes
// only returns non-null for real attribute vocabulary, so a team name / dev
// trait / "Uncommitted" (no digit-bearing recognized attr) never matches.
const isAttributeCell = (s) => parseAttributes(s) != null

// Height always looks like  5'9"  or  6'4"  — never a plain integer.
const HEIGHT_RE = /^\d+'\d+(?:\.\d+)?"/

// Deterministically rebuild the tail (M–Q: indices 12–16 = Gem/Bust, Dev Trait,
// Prev Team, Commitment, Attributes) from whatever non-empty values currently
// sit in 12–16, re-placing each by its CONTENT rather than its position.
//
// This is the durable recovery for the #1 AI-paste failure: when the AI drops
// an EMPTY cell (a blank Gem/Bust, Dev Trait, or Prev Team — common on HS
// recruits) every field after it slides one column LEFT, so Commitment and the
// Attributes string land in the wrong columns and the import is corrupted. The
// positional parser can't catch a single-cell slide when the vacated slot 13
// stays blank-but-valid. Because the five tail fields have near-disjoint content
// signatures, we can sort them back into place with no reliance on the AI
// formatting correctly.
//
// It is a NO-OP on an already-aligned row (a reliable Google-Sheet read
// reproduces its own values), so it is safe to run on every row. Only indices
// 12–16 are touched; the wider sheet columns (legacy attr slots, pid, NIL,
// updatedAt) are preserved untouched.
function realignTail(r, isPortal) {
  const vals = []
  for (let i = 12; i <= 16; i++) {
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
    // Collect EVERY attribute-looking cell, not just the first — a stray tab
    // can split one recruit's attributes across cells; merge them back into the
    // single Attributes slot so the fragments don't get mistaken for teams.
    if (isAttributeCell(v)) { attrParts.push(v); continue }
    rest.push(v)
  }
  const attrs = attrParts.join(', ')

  // What remains is the team-ish tail: Prev Team (an abbr) and/or Commitment
  // (a team name or "Uncommitted"). Drop any bare number — that's a legacy
  // per-column attribute artifact, never a team.
  const teams = rest.filter(hasLetter)
  let prevTeam = ''
  let commit = ''
  const uncIdx = teams.findIndex(isUncommitted)
  if (uncIdx !== -1) {
    commit = teams[uncIdx]
    const others = teams.filter((_, i) => i !== uncIdx)
    if (others.length) prevTeam = others[others.length - 1]
  } else if (teams.length >= 2) {
    // Schema order is Prev Team then Commitment.
    prevTeam = teams[0]
    commit = teams[teams.length - 1]
  } else if (teams.length === 1) {
    // A single team-ish cell is ambiguous. On a transfer it's the Prev Team
    // (a transfer always has one; Commitment may be blank); on an HS/JUCO
    // recruit Prev Team is always blank, so it must be the Commitment.
    if (isPortal) prevTeam = teams[0]
    else commit = teams[0]
  }

  const out = r.slice()
  out[12] = gemBust
  out[13] = dev
  out[14] = prevTeam
  out[15] = commit
  out[16] = attrs
  return out
}

// Detect and correct common AI TSV misalignments before positional parsing.
//
// Two failure modes, fixed in order:
//  1. State Rank and/or Pos Rank omitted when blank → Height ends up in the
//     wrong slot. Symptom: a height-like value appears at slot 6 or 7. Fixed
//     first so the tail indices line up before realignTail runs.
//  2. Any blank Gem/Bust / Dev Trait / Prev Team dropped → Commitment +
//     Attributes slide left. Fixed by realignTail (content-based).
function fixMisalignedRow(row) {
  let r = row

  // Fix #1: State Rank and/or Pos Rank dropped — detected by Height ending up
  // at the wrong index. Height (X'Y") should be at index 8.
  for (let i = 6; i <= 7; i++) {
    if (HEIGHT_RE.test(trim(r[i]))) {
      // Height is at index i; it should be at index 8. Insert (8 - i) blank slots
      // starting at index 6 (before State Rank) to push everything right.
      const missing = 8 - i
      r = [...r.slice(0, 6), ...Array(missing).fill(''), ...r.slice(6)]
      break
    }
  }

  // Fix #2: rebuild the M–Q tail by content (handles dropped empty cells that
  // slid Commitment + Attributes into the wrong columns).
  const recruitClass = trim(r[1]) || 'HS'
  const isPortal = !NON_PORTAL_CLASSES.includes(recruitClass)
  r = realignTail(r, isPortal)

  return r
}

export function parseRecruitingRow(row) {
  if (!row || !trim(row[0])) return null
  const r = fixMisalignedRow(row)
  const recruitClass = trim(r[1]) || 'HS'
  const pidRaw = r[PID_COL]
  return {
    // ── existing A–O fields (parsed exactly as the legacy reader) ──
    name: trim(r[0]),
    class: recruitClass,
    position: trim(r[2]),
    archetype: trim(r[3]),
    stars: starsSymbolToNumber(r[4]),
    nationalRank: intOrNull(r[5]),
    stateRank: intOrNull(r[6]),
    positionRank: intOrNull(r[7]),
    height: trim(r[8]),
    weight: intOrNull(r[9]),
    hometown: trim(r[10]),
    state: trim(r[11]),
    gemBust: trim(r[12]),
    devTrait: trim(r[13]), // blank stays blank — dev traits are hidden until signing day
    previousTeam: trim(r[14]),
    isPortal: !NON_PORTAL_CLASSES.includes(recruitClass),
    // ── Targets extension (harmless on a legacy sheet) ──
    commitment: trim(r[COMMITMENT_COL]),
    attributes: parseAttributes(r[ATTR_CELL_COL]),
    pid: trim(pidRaw) !== '' ? Number(trim(pidRaw)) : undefined,
    nil: intOrNull(r[NIL_COL]), // recruiting NIL offer (CFB 27+); null on a legacy sheet
    updatedAt: intOrNull(r[UPDATED_AT_COL]), // epoch ms; null on a sheet with no Updated column yet
  }
}

// Normalize a grid of raw pasted recruit rows for DISPLAY — the hook the
// LocalDataEntry grid calls (its `normalizeRows` prop) the moment a paste lands,
// BEFORE rendering. Without this the grid shows the raw tab-split rows
// positionally, so a shifted paste (dropped empty Gem/Bust / Dev / Prev Team)
// visibly puts "Uncommitted" in Prev Team and the attributes in Commit — even
// though import would fix it. Running the SAME realignment here means the grid
// shows the corrected columns immediately, and the serialized import matches
// what the user sees. Idempotent (realignTail is a no-op on aligned rows), so
// parseRecruitingRow re-running it at import is harmless.
export function normalizeRecruitRows(rows) {
  if (!Array.isArray(rows)) return rows
  return rows.map((row) => (Array.isArray(row) && trim(row[0]) ? fixMisalignedRow(row) : row))
}

export function parseRecruitingRows(rows) {
  return (rows || []).map(parseRecruitingRow).filter(Boolean)
}
