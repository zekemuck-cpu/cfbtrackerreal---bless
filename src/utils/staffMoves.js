// Staff Moves (coaching carousel) — shared prompt, known-coach list, and the
// TSV row parser used by BOTH the local-paste path and the Google Sheets read.
//
// The user enters the end-of-season "Staff Moves" board (College Football 26)
// during the National Championship phase. Each row is one coach who changed
// jobs (or left coaching). We deliberately DROP the on-screen "Pres" prestige
// grade — coaches carry no prestige field. Columns mirror the in-game board,
// minus prestige:
//
//   Name | Prev Pos | Prev School | New Pos | New School | Reason
//
// The parsed rows feed two things: the season's Coach Carousel display list and
// the real coach-entity model (see applyStaffMovesToCoaches in coachModel.js).

import { getTidFromAbbr, getTeam, getTeamNameLabel } from '../data/teamRegistry'
import { buildAIPrompt } from './aiPrompt'

// Grid/column order. This is the positional contract the parser reads by index
// and the order the AI prompt emits — keep the three in lockstep.
export const STAFF_MOVE_COLUMNS = ['Name', 'Prev Pos', 'Prev School', 'New Pos', 'New School', 'Reason']

export const STAFF_MOVE_ROLES = ['HC', 'OC', 'DC']

// The canonical reason strings the in-game board shows. Kept for the editable
// grid dropdown; the parser still accepts any free-text reason verbatim.
export const STAFF_MOVE_REASONS = [
  'Hired by Another Team',
  'Went to the NFL',
  'Retired',
  'Fired',
]

const normName = (n) => (n || '').trim().toLowerCase()

// The most recent season on a coach's byYear map (for annotating the known list).
function latestSeason(coach) {
  const years = Object.keys(coach?.byYear || {}).map(Number).filter(Number.isFinite)
  if (!years.length) return null
  const y = Math.max(...years)
  return { year: y, ...(coach.byYear[String(y)] || {}) }
}

/**
 * Every coach name already known in this dynasty, so the AI can expand an
 * abbreviated "L. Riley" on the board into the full "Lincoln Riley". Pulls from
 * BOTH the cid coach entities and the legacy teams[tid].byYear[year].coaching
 * Staff.{hcName,ocName,dcName} names, deduped by normalized name, annotated with
 * each coach's most-recent team + role for disambiguation.
 *
 * @returns {Array<{name, teamAbbr, role, year}>}
 */
export function buildKnownCoachesList(dynasty) {
  const teams = dynasty?.teams || {}
  const out = []
  const seen = new Set()
  const push = (name, teamTid, role, year) => {
    const clean = (name || '').trim()
    if (!clean) return
    const key = normName(clean)
    if (seen.has(key)) return
    seen.add(key)
    const abbr = teamTid != null ? (getTeam(teams, teamTid)?.abbr || '') : ''
    out.push({ name: clean, teamAbbr: abbr, role: role || '', year: Number.isFinite(year) ? year : null })
  }
  for (const coach of Object.values(dynasty?.coaches || {})) {
    if (!coach?.name) continue
    const s = latestSeason(coach)
    push(coach.name, s?.teamTid, s?.role, s?.year)
  }
  const roleFields = [['HC', 'hcName'], ['OC', 'ocName'], ['DC', 'dcName']]
  for (const [tid, team] of Object.entries(teams)) {
    const byYear = team?.byYear || {}
    for (const [year, yd] of Object.entries(byYear)) {
      const cs = yd?.coachingStaff
      if (!cs) continue
      for (const [role, field] of roleFields) {
        if (cs[field]) push(cs[field], Number(tid), role, Number(year))
      }
    }
  }
  // Sort by last name so the AI can scan alphabetically (matches how the board
  // shows abbreviated "F. Last" names).
  out.sort((a, b) => {
    const la = (a.name.split(/\s+/).slice(-1)[0] || a.name).toLowerCase()
    const lb = (b.name.split(/\s+/).slice(-1)[0] || b.name).toLowerCase()
    return la.localeCompare(lb)
  })
  return out
}

// Render the known-coach list as a prompt block.
function knownCoachesBlock(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return 'KNOWN COACHES: (none tracked yet — output every name exactly as shown on the board).'
  }
  const lines = list.map((c) => {
    const where = c.teamAbbr ? ` — ${c.teamAbbr}${c.role ? ' ' + c.role : ''}${c.year ? ` (${c.year})` : ''}` : ''
    return `${c.name}${where}`
  })
  return [
    'KNOWN COACHES (full names already tracked in this dynasty).',
    'PURPOSE: expand ABBREVIATED board names into full names.',
    '',
    'When the board shows an abbreviated form ("L. Riley", "S. Abell"), match it',
    'to the list below by LAST name + first initial and output the FULL name',
    '("L. Riley" -> "Lincoln Riley"). If two entries share a last initial, use',
    'the team/role annotation to disambiguate.',
    '',
    'If a board name does NOT match anyone below, output the abbreviated name',
    'EXACTLY as shown ("S. Abell"). NEVER invent a full name you cannot see.',
    'If the board already shows a full name, copy it verbatim.',
    '',
    ...lines,
  ].join('\n')
}

/**
 * Build the AI prompt for the Staff Moves board. Includes the team abbreviation
 * map (so schools resolve) and the known-coach list (so abbreviated names expand).
 */
export function buildStaffMovesPrompt({ year, dynasty }) {
  const structure = `
This screen is the end-of-season "Staff Moves" / coaching carousel board from
College Football 26 (${year} offseason). Each visible row is ONE coach who changed
jobs or left coaching. Read EVERY row top to bottom.

Output ONE TSV row per coach, columns in THIS EXACT order (6 columns, 5 tabs each row):

  Name<TAB>Prev Pos<TAB>Prev School<TAB>New Pos<TAB>New School<TAB>Reason

COLUMN RULES:
1. Name — the coach's name (the "NAME" column). See the KNOWN COACHES block below:
   expand abbreviated board names ("L. Riley") to full names when they match a
   known coach, otherwise output the abbreviated name exactly as shown.
2. Prev Pos — the coach's PREVIOUS position (the "PREV. POS" column). Output HC, OC, or DC.
3. Prev School — the PREVIOUS school (the "PREV. SCHOOL" column). Output the TEAM
   NAME from the TEAM NAMES list below. The board may prefix a poll rank
   ("7 Alabama", "12 Rice") — IGNORE the rank number, output only the team name
   ("Alabama", "Rice").
4. New Pos — the NEW position (the "POS" column). Output HC, OC, or DC.
5. New School — the NEW school (the "NEW SCHOOL" column). Output the TEAM
   NAME. If the cell shows "---" (no new school, e.g. retired or left for
   the NFL), leave this field BLANK.
6. Reason — copy the reason text EXACTLY as shown (the "REASON" column). It is one
   of: "Hired by Another Team", "Went to the NFL", "Retired", "Fired".

ROW ORDER: exactly as displayed, one row per coach. Do not merge, skip, or reorder.
`
  return buildAIPrompt({
    title: `${year} Staff Moves`,
    structure,
    includeTeamMap: true,
    dynastyTeams: dynasty?.teams,
    notes: knownCoachesBlock(buildKnownCoachesList(dynasty)),
  })
}

// Strip a leading poll-rank prefix ("7 Alabama" / "12 RICE") the board sometimes
// shows, leaving just the team token.
function stripRank(s) {
  return String(s || '').replace(/^\s*\d+\s+/, '').trim()
}

function normRole(v) {
  const u = (v || '').trim().toUpperCase()
  return STAFF_MOVE_ROLES.includes(u) ? u : ''
}

/**
 * Parse pre-split TSV rows (string[][]) into structured staff-move objects.
 * Shared by the local-paste path (splitTsv output) and the Google Sheets read
 * (API data.values). Resolves each school to a tid via the dynasty team map so
 * teambuilder teams resolve correctly.
 *
 * Skips rows with no move signal (blank rows and the AI's stray "Paste this TSV
 * into cell ..." label line, which survives splitTsv but has no role/reason/school).
 *
 * @param {string[][]} rows
 * @param {object} dynasty  dynasty object (or a teams map) for tid resolution
 * @returns {Array<object>} moves
 */
export function parseStaffMovesRows(rows, dynasty) {
  const teams = dynasty?.teams || dynasty || {}
  const resolveSchool = (v) => {
    const s = stripRank(v)
    if (!s || s === '---' || s === '—' || s === '–') return { tid: null, abbr: '' }
    const tid = getTidFromAbbr(s, dynasty)
    // Store the team NAME label for display (falls back to the raw input).
    const abbr = tid != null ? (getTeamNameLabel(teams, tid) || s) : s
    return { tid, abbr }
  }
  const out = []
  for (const row of rows || []) {
    if (!Array.isArray(row)) continue
    const name = (row[0] || '').trim()
    const prevRole = normRole(row[1])
    const prev = resolveSchool(row[2])
    const newRole = normRole(row[3])
    const next = resolveSchool(row[4])
    const reason = (row[5] || '').trim()
    const hasSignal = prevRole || newRole || reason || prev.tid != null || next.tid != null
    if (!name || !hasSignal) continue
    out.push({
      name,
      prevRole,
      prevTeamAbbr: prev.abbr,
      prevTeamTid: prev.tid,
      newRole,
      newTeamAbbr: next.abbr,
      newTeamTid: next.tid,
      reason,
    })
  }
  return out
}

// Serialize moves back to TSV (grid prefill + Google Sheets write).
export function staffMovesToTsv(moves) {
  return (moves || [])
    .map((m) => [
      m.name || '',
      m.prevRole || '',
      m.prevTeamAbbr || '',
      m.newRole || '',
      m.newTeamAbbr || '',
      m.reason || '',
    ].join('\t'))
    .join('\n')
}

// True for reasons that mean the coach left coaching entirely (no new school).
export function isDepartureReason(reason) {
  const r = (reason || '').toLowerCase()
  return r.includes('nfl') || r.includes('retire')
}
