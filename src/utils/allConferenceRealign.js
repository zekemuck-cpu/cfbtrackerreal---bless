// All-Conference paste self-heal.
//
// The All-Conference local-paste grid is SELF-DESCRIBING, one row per honor:
//
//   [Conference(0), Designation(1), Position(2), Player(3), Team(4), Class(5)]
//
// AI pastes occasionally DROP an empty cell, sliding every later cell one column
// left — the classic symptom being a blank Designation dropped so Position lands
// where a Designation belongs and Class lands in the Team column. Rather than
// chase shapes positionally, we REBUILD the row's ENUM SPINE: three of the six
// columns are closed vocabularies (Designation@1, Position@2, Class@5) and pin
// the layout; the other three (Conference, Player, Team) are free-form text.
//
// STRICT CONSERVATIVE CONTRACT (mirrors src/utils/weeklyScoreRealign.js and the
// recruit realignTail in src/utils/recruitSheetParse.js):
//   • IDEMPOTENT — a no-op on already-aligned rows (they carry all six cells).
//   • BAIL-ON-AMBIGUITY — if the dropped blanks can be reinserted in zero or in
//     MORE THAN ONE way that re-validates the enum spine, RETURN THE ROW
//     UNCHANGED. Corrupting a good row is the worst outcome, so we prefer a
//     false-negative every time.
//   • Player(3) and Team(4) are BOTH free-form text and adjacent — they are
//     indistinguishable by content, so we NEVER reorder them relative to each
//     other (or to Conference). We ONLY insert blank cells to restore the enum
//     spine; when a single text value could be either Player or Team, that is
//     ambiguity and we bail.
//   • Enum-anchored ONLY: a row with no recognizable enum value has nothing to
//     pin against, so it passes through untouched.
//
// Pure and self-contained. Vocabularies are hardcoded copies of the parser's
// (parseAllConferenceLocal.normDesignation and ALL_AMERICAN_POSITIONS /
// RECRUIT_POSITIONS in src/services/sheetsService.js) so this util never imports
// from the parser.

const _s = (v) => (v == null ? '' : String(v))
const _t = (v) => _s(v).trim()
const _isBlank = (v) => _t(v) === ''

// ── Designation(1) vocabulary — mirrors parseAllConferenceLocal.normDesignation.
// { first | second | freshman } plus the accepted aliases.
const _isDesignation = (v) => {
  const s = _t(v).toLowerCase()
  if (s === '') return false
  if (s.startsWith('first') || s === '1' || s === '1st') return true
  if (s.startsWith('second') || s === '2' || s === '2nd') return true
  if (s.startsWith('fresh') || s === 'fr') return true
  return false
}

// ── Position(2) vocabulary — union of ALL_AMERICAN_POSITIONS and
// RECRUIT_POSITIONS (the latter is a superset). Closed set.
const _POSITIONS = new Set([
  'QB', 'HB', 'FB', 'WR', 'TE',
  'LT', 'LG', 'C', 'RG', 'RT',
  'LEDG', 'REDG', 'DT',
  'SAM', 'MIKE', 'WILL',
  'CB', 'FS', 'SS',
  'K', 'P', 'ATH',
])
const _isPosition = (v) => _POSITIONS.has(_t(v).toUpperCase())

// ── Class(5) vocabulary — { Fr, RS Fr, So, RS So, Jr, RS Jr, Sr, RS Sr }.
// Case-insensitive; internal whitespace collapsed so "rs fr" / "RS  Fr" match.
const _CLASSES = new Set([
  'FR', 'RS FR', 'SO', 'RS SO', 'JR', 'RS JR', 'SR', 'RS SR',
])
const _isClass = (v) => _CLASSES.has(_t(v).toUpperCase().replace(/\s+/g, ' '))

// Enumerate all ways to choose `k` blank-slot positions among `n` output slots.
function _combinations(n, k) {
  const out = []
  const pick = (start, chosen) => {
    if (chosen.length === k) { out.push(chosen.slice()); return }
    for (let i = start; i < n; i++) {
      chosen.push(i)
      pick(i + 1, chosen)
      chosen.pop()
    }
  }
  pick(0, [])
  return out
}

// Place the observed cells (in order) into the six output slots, leaving the
// chosen `blankSlots` empty.
function _arrange(cells, blankSlots) {
  const blank = new Set(blankSlots)
  const out = new Array(6).fill('')
  let ci = 0
  for (let i = 0; i < 6; i++) {
    if (blank.has(i)) continue
    out[i] = cells[ci++]
  }
  return out
}

// A candidate arrangement is valid iff the enum spine holds:
//   • idx1 is blank OR a Designation
//   • idx2 is blank OR a Position
//   • idx5 is blank OR a Class
// AND every observed value that is UNAMBIGUOUSLY one enum category sits in that
// category's slot (an unambiguous Position must be at idx2, Class at idx5,
// Designation at idx1). The unambiguity guard skips cross-vocab collisions
// (notably "Fr", which is both a Designation alias and a Class) so those never
// force a placement — the uniqueness check decides them or we bail.
function _isValidCanonical(out) {
  if (!(_isBlank(out[1]) || _isDesignation(out[1]))) return false
  if (!(_isBlank(out[2]) || _isPosition(out[2]))) return false
  if (!(_isBlank(out[5]) || _isClass(out[5]))) return false
  for (let i = 0; i < 6; i++) {
    if (_isBlank(out[i])) continue
    const d = _isDesignation(out[i])
    const p = _isPosition(out[i])
    const c = _isClass(out[i])
    if (p && !d && !c && i !== 2) return false
    if (c && !p && !d && i !== 5) return false
    if (d && !p && !c && i !== 1) return false
  }
  return true
}

// Self-heal one All-Conference paste row. Returns the six-cell canonical row on a
// confident single-solution repair, otherwise the ORIGINAL row unchanged.
export function normalizeAllConferenceRow(row) {
  if (!Array.isArray(row)) return row
  const cells = row.map(_s)

  // Only DROPPED-blank left-slides are healable, and they shorten the row below
  // six. A full (>=6) row is treated as canonical/already-healed — idempotent
  // no-op. Rows with fewer than four cells have too little enum spine left to
  // anchor a confident reconstruction, so they pass through.
  if (cells.length >= 6 || cells.length < 4) return row

  // Enum-anchored ONLY: nothing recognizable to pin against → leave untouched.
  const hasEnum = cells.some((c) => _isDesignation(c) || _isPosition(c) || _isClass(c))
  if (!hasEnum) return row

  const k = 6 - cells.length // blanks to reinsert
  const candidates = []
  for (const blankSlots of _combinations(6, k)) {
    const out = _arrange(cells, blankSlots)
    if (_isValidCanonical(out)) candidates.push(out)
  }

  // Exactly one valid reconstruction → heal. Zero or many → bail unchanged.
  if (candidates.length !== 1) return row
  return candidates[0]
}

export function normalizeAllConferenceRows(rows) {
  return Array.isArray(rows) ? rows.map(normalizeAllConferenceRow) : rows
}
