// Recruiting Targets — pure reconciliation + classification logic.
//
// A "target" is a real player record (lives in dynasty.players / the players
// subcollection) that is being TRACKED but not necessarily committed yet. It is
// the same record type as a commitment, one stage earlier in the funnel:
//
//   SCOUTED/UNSCOUTED TARGET  (isTarget, teamsByYear empty)
//        │  Commitment resolves to a tid (blank = your team)
//        ▼
//   NORMAL RECRUIT at that tid (teamsByYear[year+1]=tid, isRecruit, freshman next season)
//
// This module is intentionally UI-free and side-effect-free so it can be unit
// tested and reused by the sheet reader, the in-app resolution modal, and the
// dashboard. See docs/RECRUITING_TARGETS_SPEC.md (esp. §13) for the design and
// the simulation findings this implementation is built to avoid:
//   B1 — never global-name auto-merge / never auto-transfer a rostered player.
//   B2 — open targets are NOT marked isRecruit / are NOT enrolled.
//   B3 — "commits elsewhere" enrolls at the OTHER tid with no portal/movement.
//   M1 — only committed-TO-YOU records are returned for recruitingCommitments.
//   M3 — the committed school is resolved to a numeric tid once, dynasty-aware.

import { normalizePlayerName } from './playerMatching'
import { getTidFromTeamName, resolveTid } from '../data/teamRegistry'
import { carryRecruitingNilForward } from '../data/playerNilModel'

// Sentinel the Targets sheet/prompt uses in the Commitment column for an
// uncommitted prospect. Blank is reserved for "committed to your team" so the
// commit-only (today's) flow is unchanged.
export const PURSUING = 'Uncommitted'

const CLASS_TO_YEAR = {
  HS: 'Fr', 'JUCO Fr': 'So', 'JUCO So': 'Jr', 'JUCO Jr': 'Sr',
  Fr: 'Fr', 'RS Fr': 'RS Fr', So: 'So', 'RS So': 'RS So',
  Jr: 'Jr', 'RS Jr': 'RS Jr', Sr: 'Sr', 'RS Sr': 'RS Sr',
}

// ── Commitment classification ──────────────────────────────────────────────

// Resolve a Commitment-cell value to a destination tid, dynasty-aware (M3).
// Order: explicit numeric tid → full team name → abbr/tid registry. Returns a
// number or null. Never re-resolve from text on render — call this once at
// entry and persist the numeric tid.
export function resolveCommittedTid(text, dynastyTeams = null) {
  if (text == null) return null
  const s = String(text).trim()
  if (!s) return null
  if (/^-?\d+$/.test(s)) return Number(s)
  const byName = getTidFromTeamName(s, dynastyTeams)
  if (byName != null) return Number(byName)
  const byAbbr = resolveTid(s, dynastyTeams)
  if (byAbbr != null && Number.isFinite(Number(byAbbr))) return Number(byAbbr)
  return null
}

// Classify a Commitment cell into { status, commitmentTid }:
//   ''            → committed to YOU      (back-compat: today's sheet has no col)
//   'Uncommitted' → open target (also accepts legacy 'Pursuing'/'(Pursuing)')
//   team text/tid → committed there (resolved tid)
//   unresolvable  → 'unresolved' (kept open; UI should surface a picker)
export function classifyCommitment(cell, userTid, dynastyTeams = null) {
  const s = (cell == null ? '' : String(cell)).trim()
  if (s === '') return { status: 'committed', commitmentTid: Number(userTid) }
  const low = s.toLowerCase()
  if (low === PURSUING.toLowerCase() || low === 'pursuing' || low === '(pursuing)') {
    return { status: 'open', commitmentTid: null }
  }
  const tid = resolveCommittedTid(s, dynastyTeams)
  if (tid == null) return { status: 'unresolved', commitmentTid: null, raw: s }
  return { status: 'committed', commitmentTid: tid }
}

// ── Target predicates (used by guards in other phases) ─────────────────────

export const isTargetPlayer = (p) => !!p?.isTarget

// An OPEN target — the only kind that must be hidden from generic all-player
// lists. Committed targets (yours or elsewhere) are real freshmen on a roster
// and should appear normally.
export function isOpenTarget(p) {
  if (!p?.isTarget) return false
  if (p.commitmentTid != null) return false
  const tby = p.teamsByYear || {}
  return Object.keys(tby).length === 0
}

export function getTargetStatus(p, userTid) {
  if (!p?.isTarget) return null
  if (p.commitmentTid == null) return 'open'
  return Number(p.commitmentTid) === Number(userTid) ? 'committed_us' : 'committed_elsewhere'
}

// ── Field merge helpers ────────────────────────────────────────────────────

const present = (v) => v !== undefined && v !== null && v !== ''
const pick = (rowVal, baseVal) => (present(rowVal) ? rowVal : baseVal)

function mergeAttributes(baseAttrs, rowAttrs) {
  if (rowAttrs && Object.keys(rowAttrs).length) return { ...(baseAttrs || {}), ...rowAttrs }
  return baseAttrs ?? null
}

// Overlay the standard recruit fields from a parsed sheet row onto a base
// record (existing player or a fresh skeleton). Row wins when it has a value —
// a target sheet is a living board, so the latest paste reflects re-scouting.
function mergeRecruitFields(base, row) {
  return {
    ...base,
    name: row.name || base.name,
    position: pick(row.position, base.position) || '',
    archetype: pick(row.archetype, base.archetype) || '',
    // Dev trait is authoritative from the sheet: a value sets it, a blank
    // CLEARS it (traits are hidden until signing day — never presume Normal).
    // Only fall back to the base record when the row omits the field entirely.
    devTrait: row.devTrait !== undefined ? row.devTrait : (base.devTrait ?? ''),
    height: pick(row.height, base.height) || '',
    weight: pick(row.weight, base.weight) || 0,
    hometown: pick(row.hometown, base.hometown) || '',
    state: pick(row.state, base.state) || '',
    stars: row.stars ?? base.stars ?? 0,
    nationalRank: row.nationalRank ?? base.nationalRank ?? null,
    stateRank: row.stateRank ?? base.stateRank ?? null,
    positionRank: row.positionRank ?? base.positionRank ?? null,
    gemBust: pick(row.gemBust, base.gemBust) || '',
    previousTeam: pick(row.previousTeam, base.previousTeam) || '',
    isPortal: row.isPortal ?? base.isPortal ?? false,
    class: pick(row.class, base.class),
    year: base.year || CLASS_TO_YEAR[row.class] || 'Fr',
    attributes: mergeAttributes(base.attributes, row.attributes),
  }
}

// Apply the funnel status to a record. Committed → enroll at the destination tid
// next season (B2/B3). Open/unresolved → tracked only, never isRecruit, never
// enrolled, team:-1 display sentinel.
function applyStatus(record, { status, commitmentTid, classYear, weekKey }) {
  const r = { ...record, isTarget: true, targetYear: classYear }
  if (status === 'committed') {
    const tid = Number(commitmentTid)
    r.commitmentTid = tid
    r.commitWeekKey = weekKey ?? record.commitWeekKey ?? null
    r.team = tid
    r.teamsByYear = { ...(record.teamsByYear || {}), [classYear + 1]: tid }
    r.isRecruit = true
    r.recruitYear = classYear
    delete r.unresolvedCommitment
  } else {
    r.commitmentTid = null
    r.commitWeekKey = null
    r.team = -1
    const tby = { ...(record.teamsByYear || {}) }
    delete tby[classYear + 1]
    r.teamsByYear = tby
    r.isRecruit = false
    delete r.recruitYear
    if (status === 'unresolved') r.unresolvedCommitment = true
    else delete r.unresolvedCommitment
  }
  return r
}

// Public: apply a resolution to a SINGLE target player record (the in-app
// resolution modal, §5). Mirrors exactly what the reconciler does per row, so
// the two entry paths stay interchangeable. `commitmentTid == null` reopens it.
export function resolveTargetCommitment(player, { commitmentTid, classYear, weekKey = null } = {}) {
  const status = commitmentTid == null ? 'open' : 'committed'
  return applyStatus(player, { status, commitmentTid, classYear: Number(classYear), weekKey })
}

// Public wrapper: the recruitingCommitments record for a committed-to-you target.
export function buildCommitmentRecord(player) {
  return toCommitmentRecord(player)
}

// The shape stored in recruitingCommitments for a committed-to-you record (M1).
function toCommitmentRecord(p) {
  return {
    pid: p.pid, name: p.name, class: p.class, position: p.position,
    archetype: p.archetype, stars: p.stars, devTrait: p.devTrait,
    nationalRank: p.nationalRank, stateRank: p.stateRank, positionRank: p.positionRank,
    height: p.height, weight: p.weight, hometown: p.hometown, state: p.state,
    gemBust: p.gemBust, previousTeam: p.previousTeam, isPortal: p.isPortal,
    // Carry NIL so a committed recruit round-trips its offer back into the sheet.
    ...(p.nilByYear ? { nilByYear: p.nilByYear } : {}),
  }
}

// ── The reconciler ─────────────────────────────────────────────────────────

/**
 * Reconcile parsed recruiting-sheet rows into the players list.
 *
 * Matching is pid-first; the name fallback is scoped ONLY to existing target
 * records in this class year (B1) — it will NEVER match or auto-transfer a
 * rostered player who happens to share a name. Unmatched rows become new
 * records.
 *
 * @param {Object}   args
 * @param {Array}    args.rows         parsed rows: { name, position, archetype, class,
 *                                     stars, devTrait, gemBust, ranks, height, weight,
 *                                     hometown, state, previousTeam, isPortal,
 *                                     pid?, commitment, attributes? }
 * @param {Array}    args.players      current dynasty.players (not mutated)
 * @param {number}   args.userTid      the user's team tid (blank Commitment ⇒ this)
 * @param {Object}   [args.dynastyTeams]
 * @param {number}   args.classYear    the recruiting class year
 * @param {string}   [args.weekKey]    commit-week key stamped on resolutions
 * @param {number}   [args.startPID]
 * @returns {{ players: Array, nextPID: number, committedToUs: Array }}
 */
export function reconcileRecruitingRows({
  rows = [], players = [], userTid, dynastyTeams = null,
  classYear, weekKey = null, startPID,
}) {
  const yearN = Number(classYear)
  const maxPID = players.reduce((m, p) => Math.max(m, p.pid || 0), 0)
  let nextPID = Math.max(Number(startPID) || 0, maxPID + 1)

  const next = players.map((p) => ({ ...p }))
  const byPid = new Map(next.map((p, i) => [p.pid, i]))

  // Name fallback index: ONLY target records in THIS class year. Never global,
  // never rostered players — this is the B1 guard against name-hijack merges.
  const targetNameIndex = new Map()
  next.forEach((p, i) => {
    if (p.isTarget && Number(p.targetYear) === yearN && p.name) {
      targetNameIndex.set(normalizePlayerName(p.name), i)
    }
  })

  const committedToUs = []

  // Counts brand-new records created by this call, so each gets a strictly
  // increasing scoutedAt (see below) instead of colliding on the same
  // millisecond when a whole board is pasted in at once.
  let newRecordCount = 0

  for (const row of rows) {
    if (!row?.name) continue
    const { status, commitmentTid } = classifyCommitment(row.commitment, userTid, dynastyTeams)

    let idx = -1
    if (row.pid != null && byPid.has(row.pid)) idx = byPid.get(row.pid)
    if (idx === -1) {
      const key = normalizePlayerName(row.name)
      if (targetNameIndex.has(key)) idx = targetNameIndex.get(key)
    }

    let record
    if (idx !== -1) {
      record = mergeRecruitFields(next[idx], row)
    } else {
      const pid = nextPID++
      record = mergeRecruitFields(
        // scoutedAt stamps the real wall-clock moment this target was first added —
        // unlike pid (a small per-dynasty counter), it's comparable across dynasties,
        // which is what lets the shared Recruiting Database show true add order.
        // The `+ newRecordCount++` offset (same pattern as the Recruiting
        // Database's own local-paste import — see mergeRecruitingDatabaseRows
        // in recruitingDatabaseSync.js) keeps every row in THIS paste from
        // colliding on the exact same millisecond: a synchronous loop over a
        // whole pasted board runs in well under 1ms, so without the offset
        // most/all new rows would tie on scoutedAt and fall back to a
        // tiebreak that doesn't reliably preserve paste order.
        { pid, id: `player-${pid}`, name: row.name, jerseyNumber: '', overall: null, scoutedAt: Date.now() + newRecordCount++ },
        row,
      )
    }

    record = applyStatus(record, { status, commitmentTid, classYear: yearN, weekKey })

    // This row is landing in the app right now (paste/AI-fill/import), so it's
    // the freshest version of this recruit — same field the Recruiting
    // Database's Google Sheet sync uses for most-recent-wins conflict resolution.
    record.updatedAt = Date.now()

    // Recruiting NIL offer (CFB 27+): stamp this class year's nilByYear from the
    // sheet's NIL column. Absence-safe — a blank cell never creates the map.
    if (row.nil != null && !isNaN(Number(row.nil))) {
      record = { ...record, nilByYear: { ...(record.nilByYear || {}), [yearN]: Number(row.nil) } }
    }
    // Signing with YOU carries the offer forward as next season's roster-NIL floor.
    if (status === 'committed' && Number(commitmentTid) === Number(userTid)) {
      record = carryRecruitingNilForward(record, yearN)
    }

    if (idx !== -1) {
      next[idx] = record
    } else {
      next.push(record)
      byPid.set(record.pid, next.length - 1)
      if (record.isTarget && Number(record.targetYear) === yearN) {
        targetNameIndex.set(normalizePlayerName(record.name), next.length - 1)
      }
    }

    if (status === 'committed' && Number(commitmentTid) === Number(userTid)) {
      committedToUs.push(toCommitmentRecord(record))
    }
  }

  return { players: next, nextPID, committedToUs }
}

/**
 * Split parsed sheet rows into target-concern rows (→ the safe reconciler) and
 * plain commit rows (→ the existing commit logic, which preserves portal /
 * returning-player handling). A row is a target concern when it is:
 *   - Pursuing / unresolved, OR
 *   - committed to a team OTHER than the user (commit-elsewhere), OR
 *   - a match for an existing tracked target (so a target→commit transition
 *     flips the same record instead of being mis-tagged a cross-team transfer).
 *
 * KEY SAFETY PROPERTY: when every row is a blank/your-team commitment and no
 * tracked targets exist, ALL rows go to `commitRows` in order — the commit-only
 * flow is byte-for-byte unchanged.
 */
export function partitionRecruitingRows(rows, { players = [], userTid, classYear, dynastyTeams = null }) {
  const yearN = Number(classYear)
  const targetNames = new Set()
  const targetPids = new Set()
  for (const p of players) {
    if (p.isTarget && Number(p.targetYear) === yearN) {
      if (p.name) targetNames.add(normalizePlayerName(p.name))
      if (p.pid != null) targetPids.add(p.pid)
    }
  }

  const targetRows = []
  const commitRows = []
  for (const row of rows) {
    const { status, commitmentTid } = classifyCommitment(row.commitment, userTid, dynastyTeams)
    const matchesTarget =
      (row.pid != null && targetPids.has(row.pid)) ||
      (row.name && targetNames.has(normalizePlayerName(row.name)))
    const isTargetConcern =
      status === 'open' ||
      status === 'unresolved' ||
      (status === 'committed' && Number(commitmentTid) !== Number(userTid)) ||
      matchesTarget
    ;(isTargetConcern ? targetRows : commitRows).push(row)
  }
  return { targetRows, commitRows }
}
