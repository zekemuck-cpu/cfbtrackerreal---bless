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

export function parseRecruitingRow(row) {
  if (!row || !trim(row[0])) return null
  const recruitClass = trim(row[1]) || 'HS'
  const pidRaw = row[PID_COL]
  return {
    // ── existing A–O fields (parsed exactly as the legacy reader) ──
    name: trim(row[0]),
    class: recruitClass,
    position: trim(row[2]),
    archetype: trim(row[3]),
    stars: starsSymbolToNumber(row[4]),
    nationalRank: intOrNull(row[5]),
    stateRank: intOrNull(row[6]),
    positionRank: intOrNull(row[7]),
    height: trim(row[8]),
    weight: intOrNull(row[9]),
    hometown: trim(row[10]),
    state: trim(row[11]),
    gemBust: trim(row[12]),
    devTrait: trim(row[13]), // blank stays blank — dev traits are hidden until signing day
    previousTeam: trim(row[14]),
    isPortal: !NON_PORTAL_CLASSES.includes(recruitClass),
    // ── Targets extension (harmless on a legacy sheet) ──
    commitment: trim(row[COMMITMENT_COL]),
    attributes: parseAttributes(row[ATTR_CELL_COL]),
    pid: trim(pidRaw) !== '' ? Number(trim(pidRaw)) : undefined,
    nil: intOrNull(row[NIL_COL]), // recruiting NIL offer (CFB 27+); null on a legacy sheet
  }
}

export function parseRecruitingRows(rows) {
  return (rows || []).map(parseRecruitingRow).filter(Boolean)
}
