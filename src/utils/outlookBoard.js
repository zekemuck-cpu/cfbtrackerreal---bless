// Outlook depth-chart board builder. Pure + unit-tested.
//
// Turns a list of projected players (from rosterProjection.projectRoster) into a
// formation depth chart: stacked tiles per slot, plus a holding pen of incoming
// commits the user hasn't placed yet. Placement is keyed by a STABLE tile id
// (entry.key) — `pid:<pid>` for established players, `inc:<recruitYear>:<idx>:…`
// for commits — so a placement made while viewing one year applies to every
// future year automatically (cascade), with no per-year copying that can drift.

import { gradeForOvr, isPortalRisk } from './depthChart'
import { finePositionGroup } from '../data/positionGroups'

// ── Formations ──────────────────────────────────────────────────────────────
// slot: { id, label, group, accepts:[exact position codes], multi }
//  - accepts: exact roster codes that auto-seed straight into this slot
//  - group:   fine position group used as the auto-seed fallback + side lookup
//  - multi:   same-role slots that share a position pool (WR/DT/CB) and get
//             balanced across each other by OVR
const s = (id, label, group, accepts, multi = false) => ({ id, label, group, accepts, multi })

// One column per position group: every player in a group stacks vertically in
// that group's single slot (depth ordered by OVR), like the paper sheet.
const OFFENSE_SLOTS = [
  s('QB', 'QB', 'QB', ['QB']),
  s('HB', 'HB', 'RB', ['HB', 'RB']),
  s('FB', 'FB', 'RB', ['FB']),
  s('WR', 'WR', 'WR', ['WR']),
  s('TE', 'TE', 'TE', ['TE']),
  s('LT', 'LT', 'OT', ['LT']),
  s('LG', 'LG', 'OG', ['LG']),
  s('C', 'C', 'C', ['C']),
  s('RG', 'RG', 'OG', ['RG']),
  s('RT', 'RT', 'OT', ['RT']),
]
// Formation tiers — each tier is a centered row of position columns, stacked
// top→bottom like a formation. Avoids the empty-column gaps a fixed grid leaves
// for uneven groups.
const OFFENSE_TIERS = [
  ['LT', 'LG', 'C', 'RG', 'RT'],   // the line
  ['WR', 'HB', 'QB', 'FB', 'TE'],  // skill players
]

// Edges and outside LBs are split L/R so the front mirrors a real formation:
// LEDG · DT · REDG and SAM · MIKE · WILL. Side-specific codes (LEDG/LE, SAM…)
// pin to their side via an exact accept-match; generic codes (EDGE/DE, OLB)
// appear in BOTH paired slots' accepts, so they match two candidates and the
// builder balances them across the pair by OVR.
const DEFENSE_SLOTS = [
  s('LEDG', 'LE', 'EDGE', ['LEDG', 'LE', 'EDGE', 'DE']),
  s('REDG', 'RE', 'EDGE', ['REDG', 'RE', 'EDGE', 'DE']),
  s('DT', 'DT', 'DT', ['DT', 'NT']),
  s('SAM', 'SAM', 'OLB', ['SAM', 'OLB']),
  s('WILL', 'WILL', 'OLB', ['WILL', 'OLB']),
  s('MIKE', 'MIKE', 'MIKE', ['MIKE']),
  s('CB', 'CB', 'CB', ['CB']),
  s('FS', 'FS', 'Safety', ['FS']),
  s('SS', 'SS', 'Safety', ['SS']),
]
// Front seven on the line, the secondary (CB/FS/SS) in a second row beneath.
const DEFENSE_TIERS = [
  ['LEDG', 'DT', 'REDG', 'SAM', 'MIKE', 'WILL'],
  ['CB', 'FS', 'SS'],
]

const ST_SLOTS = [
  s('K', 'K', 'K', ['K']),
  s('P', 'P', 'P', ['P']),
]
const ST_TIERS = [['K', 'P']]
// No picker-based role slots anymore (KR/PR removed). Kept exported (empty) so
// existing references in the component degrade to no-ops without edits.
export const ST_ROLE_SLOTS = []

// Which fine position group belongs to which side of the ball.
const SIDE_OF_GROUP = {
  QB: 'offense', RB: 'offense', WR: 'offense', TE: 'offense', OT: 'offense', OG: 'offense', C: 'offense',
  DT: 'defense', EDGE: 'defense', OLB: 'defense', MIKE: 'defense', CB: 'defense', Safety: 'defense',
  K: 'st', P: 'st',
}

export function sideOfPosition(position) {
  const g = finePositionGroup(position)
  return g ? (SIDE_OF_GROUP[g] || null) : null
}

export const SIDE_OPTIONS = [
  { value: 'offense', label: 'Offense' },
  { value: 'defense', label: 'Defense' },
  { value: 'st', label: 'Special Teams' },
]

// Returns { slots, tiers } for a side.
export function formationFor(side) {
  if (side === 'defense') return { slots: DEFENSE_SLOTS, tiers: DEFENSE_TIERS }
  if (side === 'st') return { slots: ST_SLOTS, tiers: ST_TIERS }
  return { slots: OFFENSE_SLOTS, tiers: OFFENSE_TIERS }
}

const byOvrDesc = (a, b) => (b.projectedOvr ?? -1) - (a.projectedOvr ?? -1)

// Slot ids a player at `position` can auto-seed into for this formation:
// exact accepts-match first; otherwise any slot whose fine group matches.
function candidateSlotIds(slots, position) {
  const pos = (position || '').toUpperCase()
  const exact = slots.filter(sl => sl.accepts.includes(pos)).map(sl => sl.id)
  if (exact.length) return exact
  const g = finePositionGroup(pos)
  return g ? slots.filter(sl => sl.group === g).map(sl => sl.id) : []
}

// Order one slot's tiles: manual order (tileIds) first, then OVR desc.
function orderTiles(tiles, manualIds = []) {
  const rank = new Map(manualIds.map((id, i) => [id, i]))
  return [...tiles].sort((a, b) => {
    const ra = rank.has(a.key) ? rank.get(a.key) : Infinity
    const rb = rank.has(b.key) ? rank.get(b.key) : Infinity
    if (ra !== rb) return ra - rb
    return byOvrDesc(a, b)
  })
}

/**
 * Build the depth-chart board for one side.
 *
 * @param allPlayers  projected entries (from projectRoster) — every side; ST role
 *                    slots can reference offense/defense players, so we keep them all.
 * @param side        'offense' | 'defense' | 'st'
 * @param opts        { placements, order, notes, stRoles, nflPids, fbEnabled, lastYear }
 * @returns { slots, tiers, summary }
 *   slots: [{ id, label, group, multi, tiles:[tile], starter, isHole, grade }]
 *   tile:  projected entry + { note, isNfl, portalRisk }
 */
export function buildBoard(allPlayers, side, opts = {}) {
  const {
    placements = {}, order = {}, notes = {}, stRoles = {},
    nflPids = new Set(), lastYear = null,
  } = opts
  const { slots, tiers } = formationFor(side)
  const slotIds = new Set(slots.map(sl => sl.id))

  const byKey = new Map((allPlayers || []).map(p => [p.key, p]))
  const decorate = (p) => ({
    ...p,
    note: notes[p.key] || '',
    isNfl: p.pid != null && nflPids.has(p.pid),
    portalRisk: !p.isIncoming && p.player ? isPortalRisk(p.player, lastYear, p.projectedClass) : false,
  })

  const bySlot = {}
  for (const sl of slots) bySlot[sl.id] = []

  if (side === 'st') {
    // K / P auto-seed by position; KR / PR come only from stRoles (any player).
    const sidePlayers = (allPlayers || []).filter(p => sideOfPosition(p.position) === 'st')
    seedSide(sidePlayers, slots, slotIds, placements, bySlot, decorate)
    for (const roleId of ST_ROLE_SLOTS) {
      const ids = stRoles[roleId] || []
      for (const id of ids) {
        const p = byKey.get(id)
        if (p) bySlot[roleId].push(decorate(p))
      }
    }
  } else {
    const sidePlayers = (allPlayers || []).filter(p => sideOfPosition(p.position) === side)
    seedSide(sidePlayers, slots, slotIds, placements, bySlot, decorate)
  }

  // Order + summarize.
  const starterOvrs = []
  let holes = 0
  const outSlots = slots.map(sl => {
    const tiles = orderTiles(bySlot[sl.id], order[sl.id] || [])
    const starter = tiles[0] || null
    const isRole = ST_ROLE_SLOTS.includes(sl.id)
    const isHole = tiles.length === 0
    if (isHole && !isRole) holes++
    if (starter && Number.isFinite(Number(starter.projectedOvr)) && !isRole) {
      starterOvrs.push(Number(starter.projectedOvr))
    }
    return {
      id: sl.id, label: sl.label, group: sl.group, multi: sl.multi,
      tiles, starter, isHole,
      grade: gradeForOvr(starter?.projectedOvr ?? null),
    }
  })

  const unitOvr = starterOvrs.length
    ? Math.round(starterOvrs.reduce((a, b) => a + b, 0) / starterOvrs.length)
    : null

  return {
    slots: outSlots,
    tiers,
    summary: { unitOvr, holes },
  }
}

// Place a side's players into bySlot (mutates). Explicit placements first, then
// auto-seed singles, then distribute multi-slot players. Incoming commits seed
// by their star-implied projected OVR exactly like returning players — no pen.
function seedSide(sidePlayers, slots, slotIds, placements, bySlot, decorate) {
  const auto = []
  for (const p of sidePlayers) {
    const placed = placements[p.key]
    if (placed && slotIds.has(placed)) { bySlot[placed].push(decorate(p)); continue }
    auto.push(p)
  }
  const withCands = auto
    .map(p => ({ p, cands: candidateSlotIds(slots, p.position) }))
    .filter(x => x.cands.length)
  for (const { p, cands } of withCands) {
    if (cands.length === 1) bySlot[cands[0]].push(decorate(p))
  }
  const multis = withCands.filter(x => x.cands.length > 1).sort((a, b) => byOvrDesc(a.p, b.p))
  for (const { p, cands } of multis) {
    let pick = cands[0]
    for (const c of cands) { if (bySlot[c].length < bySlot[pick].length) pick = c }
    bySlot[pick].push(decorate(p))
  }
}
