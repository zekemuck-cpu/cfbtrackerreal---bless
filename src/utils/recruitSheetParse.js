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
// Total column count A..NIL (used to size the sheet grid).
export const TOTAL_COLS = NIL_COL + 1

// Convert a 0-based column index to an A1 letter (0→A, 26→AA, 58→BG).
function colLetter(idx) {
  let s = ''
  for (let n = idx + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  }
  return s
}

// Read range wide enough for A..NIL and tall enough for a full season of targets.
export const RECRUITING_READ_RANGE = `Commitments!A2:${colLetter(NIL_COL)}600`

const NON_PORTAL_CLASSES = ['HS', 'JUCO Fr', 'JUCO So', 'JUCO Jr']

const starsSymbolToNumber = (s) => (s ? (String(s).match(/☆/g) || []).length : 0)
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

// Valid dev trait values — anything else in slot 13 means the row is misaligned.
const VALID_DEV_TRAITS = new Set(['Elite', 'Star', 'Impact', 'Normal', 'Hidden', ''])

// Height always looks like  5'9"  or  6'4"  — never a plain integer.
const HEIGHT_RE = /^\d+'\d+(?:\.\d+)?"/

// Detect and correct common AI TSV misalignments before positional parsing.
//
// Two known failure modes:
//  1. Dev Trait + Prev Team both omitted when blank → row is 2 columns short.
//     Symptom: slot 13 (Dev Trait) holds a commitment value.
//  2. State Rank and/or Pos Rank omitted when blank → Height ends up in the
//     wrong slot. Symptom: a height-like value appears at slot 6, 7 or earlier.
function fixMisalignedRow(row) {
  let r = row

  // Fix #1: Dev Trait / Prev Team dropped
  const devSlot = trim(r[13])
  if (!VALID_DEV_TRAITS.has(devSlot)) {
    r = [...r.slice(0, 13), '', '', ...r.slice(13)]
  }

  // Fix #2: State Rank and/or Pos Rank dropped — detected by Height ending up
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
  }
}

export function parseRecruitingRows(rows) {
  return (rows || []).map(parseRecruitingRow).filter(Boolean)
}
