// Pure column layout + row <-> recruit object mapping for the Recruiting
// Database's own Google Sheet. Deliberately independent of
// src/utils/recruitSheetParse.js (the Targets tab's Commitments-sheet
// format) — no Commitment/NIL columns, no commitment classification, and
// every attribute the recruit has is preserved (not just the position's
// typical subset), so a save/import round trip never silently drops data.

import { ATTRIBUTE_COLUMNS, ATTRIBUTE_ABBR, serializeAttributes, positionBucket } from './recruitAttributes'
import { resolveRecruitGroup } from './recruitGroup'

export const RECRUITING_DATABASE_SHEET_TAB = 'Recruiting Database'

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
export const PREVIOUS_TEAM_COL = 14
export const ATTRIBUTES_COL = 15
export const PID_COL = 16
export const UPDATED_AT_COL = 17
// Stamped once, the moment a recruit first enters the database (whether
// scouted as a real Target or added here via the AI/Sheets import) — unlike
// Updated (which changes on every edit), this never changes again, so it's
// what "recent number" ordering (recentRank) is permanently anchored to. A
// blank cell here (pre-existing rows synced before this column existed) gets
// backfilled with a fresh timestamp on the next sync — see
// recruitingDatabaseSync.js.
export const SCOUTED_AT_COL = 18
export const TOTAL_COLS = SCOUTED_AT_COL + 1

export const HEADERS = [
  'Name', 'Class', 'Position', 'Archetype', 'Stars', 'National Rank', 'State Rank',
  'Position Rank', 'Height', 'Weight', 'Hometown', 'State', 'Gem/Bust', 'Dev Trait',
  'Previous Team', 'Attributes', 'pid', 'Updated', 'Scouted At',
]

function colLetter(idx) {
  let s = ''
  for (let n = idx + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  }
  return s
}

export const READ_RANGE = `${RECRUITING_DATABASE_SHEET_TAB}!A2:${colLetter(SCOUTED_AT_COL)}600`

const NON_PORTAL_CLASSES = ['HS', 'JUCO Fr', 'JUCO So', 'JUCO Jr']
const starsSymbolToNumber = (s) => (s ? (String(s).match(/☆/g) || []).length : 0)
const starsNumberToSymbol = (n) => '☆'.repeat(Math.max(0, Math.min(5, Number(n) || 0)))
const trim = (v) => (v != null ? String(v).trim() : '')
const intOrNull = (v) => (v !== '' && v != null ? parseInt(v, 10) : null)
const str = (v) => (v == null ? '' : String(v))

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

// Parses the single "Attributes" cell (e.g. "AWR 72, SPD 84, ACC 86") back
// into a full attribute map. Every attribute the recruit has is written here
// (see serializeAttributes), so nothing is scoped to a position's subset.
function parseAttributesCell(cell) {
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
    previousTeam: trim(row[PREVIOUS_TEAM_COL]),
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

export function serializeRecruitingDatabaseRow(recruit) {
  const r = []
  r[NAME_COL] = str(recruit.name)
  r[CLASS_COL] = str(recruit.class || 'HS')
  r[POSITION_COL] = str(recruit.rawPosition ?? recruit.position)
  r[ARCHETYPE_COL] = str(recruit.archetype)
  r[STARS_COL] = starsNumberToSymbol(recruit.stars)
  r[NATIONAL_RANK_COL] = recruit.nationalRank ?? ''
  r[STATE_RANK_COL] = recruit.stateRank ?? ''
  r[POSITION_RANK_COL] = recruit.positionRank ?? ''
  r[HEIGHT_COL] = str(recruit.height)
  r[WEIGHT_COL] = recruit.weight ?? ''
  r[HOMETOWN_COL] = str(recruit.hometown)
  r[STATE_COL] = str(recruit.state)
  r[GEM_BUST_COL] = str(recruit.gemBust)
  r[DEV_TRAIT_COL] = str(recruit.devTrait)
  r[PREVIOUS_TEAM_COL] = str(recruit.previousTeam)
  r[ATTRIBUTES_COL] = serializeAttributes(recruit.attributes)
  r[PID_COL] = recruit.pid ?? ''
  r[UPDATED_AT_COL] = recruit.updatedAt ?? ''
  r[SCOUTED_AT_COL] = recruit.scoutedAt ?? ''
  return r
}
