// Column layout + row -> recruit object parsing for the Recruiting
// Database's local-paste import (an AI reply or hand-typed/uploaded TSV —
// see RecruitingDatabaseImportModal.jsx). Deliberately independent of
// src/utils/recruitSheetParse.js (the Targets tab's Commitments-sheet
// format) — no Commitment/NIL columns, no commitment classification, and
// every attribute the recruit has is preserved (not just the position's
// typical subset), so an import never silently drops data.
//
// This used to also define the layout of a live, two-way-synced Google Sheet
// (a HEADERS row, a Sheets-API READ_RANGE, a serialize-back-to-a-row
// function) — removed along with the rest of the Sheets integration; see
// RecruitingDatabaseImportModal.jsx's header comment for why. Only the
// column indices and the row -> recruit parse direction survive, since
// they're still what a pasted TSV reply is parsed against.

import { ATTRIBUTE_COLUMNS, ATTRIBUTE_ABBR, SHEET_HEADER_TO_ATTRIBUTE, positionBucket } from './recruitAttributes'
import { resolveRecruitGroup } from './recruitGroup'

// Column order (0-indexed).
export const NAME_COL = 0
export const CLASS_COL = 1
export const POSITION_COL = 2
export const ARCHETYPE_COL = 3
export const STARS_COL = 4
export const NATIONAL_RANK_COL = 5
export const STATE_RANK_COL = 6
export const POSITION_RANK_COL = 7
export const HEIGHT_COL = 8
export const WEIGHT_COL = 9
export const HOMETOWN_COL = 10
export const STATE_COL = 11
export const GEM_BUST_COL = 12
export const DEV_TRAIT_COL = 13
// "Previous Team" (transfers only) used to sit here — removed entirely,
// since the Recruiting Database is HS recruits only and never has one.
export const ATTRIBUTES_COL = 14
export const PID_COL = 15
export const UPDATED_AT_COL = 16
// Stamped once, the moment a recruit first enters the database (whether
// scouted as a real Target or added here via import) — unlike Updated (which
// changes on every edit), this never changes again, so it's what "recent
// number" ordering (recentRank) is permanently anchored to. A blank cell here
// (an older import from before this column existed) gets backfilled with a
// fresh timestamp — see recruitingDatabaseSync.js.
export const SCOUTED_AT_COL = 17

const NON_PORTAL_CLASSES = ['HS', 'JUCO Fr', 'JUCO So', 'JUCO Jr']
// Filled stars (★) win when present — in the mixed "★★★★☆" format the ☆ is
// the EMPTY remainder; counting only ☆ turned pasted 4-stars into 1-stars.
// See the matching parser in recruitSheetParse.js.
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
const intOrNull = (v) => (v !== '' && v != null ? parseInt(v, 10) : null)

const normLabel = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '')
// Also folds in SHEET_HEADER_TO_ATTRIBUTE's alternate in-game labels (e.g.
// "Throw On The Run" -> "Throw On Run", "Throw Under Pressure" -> "Under
// Pressure") — without this, an AI reply using the game's own attribute tab
// wording instead of our short codes silently dropped that value entirely,
// since neither the full canonical name nor its short code matched.
const ATTR_BY_LABEL = (() => {
  const m = {}
  for (const name of ATTRIBUTE_COLUMNS) {
    m[normLabel(name)] = name
    const abbr = ATTRIBUTE_ABBR[name]
    if (abbr) m[normLabel(abbr)] = name
  }
  for (const [alias, name] of Object.entries(SHEET_HEADER_TO_ATTRIBUTE)) {
    m[normLabel(alias)] = name
  }
  return m
})()

// Parses the single "Attributes" cell (e.g. "AWR 72, SPD 84, ACC 86") back
// into a full attribute map. Every attribute the recruit has is written here
// (see serializeAttributes), so nothing is scoped to a position's subset.
// Exported for RecruitingDatabaseBatchEditModal.jsx, which reads/writes this
// same compact-text format directly in an editable cell (no TSV row involved).
export function parseAttributesCell(cell) {
  if (cell == null) return null
  const text = String(cell).trim()
  if (!text) return null
  const out = {}
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

export function parseRecruitingDatabaseRow(row) {
  if (!row || !trim(row[NAME_COL])) return null
  const recruitClass = trim(row[CLASS_COL]) || 'HS'
  const pidRaw = row[PID_COL]
  // The Position cell holds the raw in-game label (LT, RT, SAM, LEDG, ...) —
  // preserved as rawPosition so the Database can display/store it distinctly,
  // while `position` is bucketed to the grading engine's scheme (OT, OLB, DE,
  // ...) so archetype/threshold/composite-score lookups (which key off
  // position+archetype) still resolve correctly regardless of which raw label
  // was entered.
  const rawPosition = trim(row[POSITION_COL])
  const position = positionBucket(rawPosition) || rawPosition
  const archetype = trim(row[ARCHETYPE_COL])
  return {
    name: trim(row[NAME_COL]),
    class: recruitClass,
    position,
    rawPosition,
    archetype,
    // Offense/Defense/Special Teams — auto-derived from position+archetype
    // (see recruitGroup.js) so this is never blank, even for ATH.
    group: resolveRecruitGroup(position, archetype),
    stars: starsSymbolToNumber(row[STARS_COL]),
    nationalRank: intOrNull(row[NATIONAL_RANK_COL]),
    stateRank: intOrNull(row[STATE_RANK_COL]),
    positionRank: intOrNull(row[POSITION_RANK_COL]),
    height: trim(row[HEIGHT_COL]),
    weight: intOrNull(row[WEIGHT_COL]),
    hometown: trim(row[HOMETOWN_COL]),
    state: trim(row[STATE_COL]),
    gemBust: trim(row[GEM_BUST_COL]),
    devTrait: trim(row[DEV_TRAIT_COL]),
    isPortal: !NON_PORTAL_CLASSES.includes(recruitClass),
    attributes: parseAttributesCell(row[ATTRIBUTES_COL]),
    pid: trim(pidRaw) !== '' ? Number(trim(pidRaw)) : undefined,
    updatedAt: intOrNull(row[UPDATED_AT_COL]),
    scoutedAt: intOrNull(row[SCOUTED_AT_COL]),
  }
}

export function parseRecruitingDatabaseRows(rows) {
  return (rows || []).map(parseRecruitingDatabaseRow).filter(Boolean)
}
