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
// slot: { id, label, group, accepts:[exact position codes], base }
//  - accepts: exact roster codes that auto-seed straight into this slot
//  - group:   fine position group used as the auto-seed fallback + side lookup
//  - base:    true = shown by default; false = an optional "extra" column the
//             user opts into via Positions settings. Extras share their group's
//             accepts (e.g. WR2/WR3/Slot WR all accept WR), so the existing
//             OVR-balancing automatically spreads players across the columns
//             that happen to be enabled — one column = the old single-stack.
// The catalog defines per-column metadata; FORMATION_ROWS (below) owns the
// on-screen ordering and grouping.
const s = (id, label, group, accepts, base = true) => ({ id, label, group, accepts, base })

const OFFENSE_CATALOG = [
  s('LT', 'LT', 'OT', ['LT']),
  s('LG', 'LG', 'OG', ['LG']),
  s('C', 'C', 'C', ['C']),
  s('RG', 'RG', 'OG', ['RG']),
  s('RT', 'RT', 'OT', ['RT']),
  s('WR', 'WR', 'WR', ['WR']),
  s('WR2', 'WR2', 'WR', ['WR'], false),
  s('WR3', 'WR3', 'WR', ['WR'], false),
  s('SLWR', 'Slot WR', 'WR', ['WR'], false),
  s('TE', 'TE', 'TE', ['TE']),
  s('TE2', 'TE2', 'TE', ['TE'], false),
  s('HB', 'HB', 'RB', ['HB', 'RB']),
  s('HB2', 'HB2', 'RB', ['HB', 'RB'], false),
  s('QB', 'QB', 'QB', ['QB']),
  s('FB', 'FB', 'RB', ['FB']),
]

// Edges and outside LBs are split L/R so the front mirrors a real formation.
// Side-specific codes (LEDG/LE, SAM…) pin to their side via an exact match;
// generic codes (EDGE/DE, OLB) appear in BOTH paired slots' accepts, so they
// match two candidates and the builder balances them across the pair by OVR.
const DEFENSE_CATALOG = [
  s('LEDG', 'LE', 'EDGE', ['LEDG', 'LE', 'EDGE', 'DE']),
  s('DT', 'DT', 'DT', ['DT', 'NT']),
  s('DT2', 'DT2', 'DT', ['DT', 'NT'], false),
  s('REDG', 'RE', 'EDGE', ['REDG', 'RE', 'EDGE', 'DE']),
  s('SAM', 'SAM', 'OLB', ['SAM', 'OLB']),
  s('MIKE', 'MIKE', 'MIKE', ['MIKE']),
  s('WILL', 'WILL', 'OLB', ['WILL', 'OLB']),
  s('CB', 'CB', 'CB', ['CB']),
  s('CB2', 'CB2', 'CB', ['CB'], false),
  s('NB', 'Nickel', 'CB', ['CB'], false),
  s('FS', 'FS', 'Safety', ['FS']),
  s('SS', 'SS', 'Safety', ['SS']),
  s('S3', 'Dime', 'Safety', ['FS', 'SS'], false),
]

const ST_CATALOG = [
  s('K', 'K', 'K', ['K']),
  s('P', 'P', 'P', ['P']),
]

// On-screen formation rows (top → bottom); each lists its columns left → right.
// formationFor() filters these to the enabled columns and drops empty rows, so
// the order here is the formation: a line row, then a single skill row with the
// WRs on the LEFT, the backfield (QB centered, HB beside) in the MIDDLE, and the
// TEs on the RIGHT. With only base columns on, that skill row is WR-HB-QB-FB-TE,
// so the default offense is exactly TWO rows.
const OFFENSE_ROWS = [
  ['LT', 'LG', 'C', 'RG', 'RT'],                                       // line
  ['WR', 'WR2', 'WR3', 'SLWR', 'HB2', 'HB', 'QB', 'FB', 'TE', 'TE2'],  // WRs | backfield | TEs
]
const DEFENSE_ROWS = [
  ['LEDG', 'DT', 'DT2', 'REDG'],              // line
  ['SAM', 'MIKE', 'WILL'],                    // linebackers
  ['CB', 'CB2', 'NB', 'FS', 'SS', 'S3'],      // secondary
]
const ST_ROWS = [['K', 'P']]

const CATALOGS = { offense: OFFENSE_CATALOG, defense: DEFENSE_CATALOG, st: ST_CATALOG }
const FORMATION_ROWS = { offense: OFFENSE_ROWS, defense: DEFENSE_ROWS, st: ST_ROWS }

// Every toggleable column per side — drives the Positions settings modal.
export const DEPTH_CHART_CATALOG = CATALOGS

// Default-on column ids per side (everything marked base). Used when a dynasty
// has no saved Positions preference for a side.
export const DEFAULT_DEPTH_POSITIONS = {
  offense: OFFENSE_CATALOG.filter(sl => sl.base).map(sl => sl.id),
  defense: DEFENSE_CATALOG.filter(sl => sl.base).map(sl => sl.id),
  st: ST_CATALOG.filter(sl => sl.base).map(sl => sl.id),
}

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

// Default layout for a side: the base formation rows (extras dropped).
export function defaultLayoutForSide(side) {
  const catalog = CATALOGS[side] || OFFENSE_CATALOG
  const rows = FORMATION_ROWS[side] || OFFENSE_ROWS
  const baseSet = new Set(catalog.filter(sl => sl.base).map(sl => sl.id))
  return rows.map(r => r.filter(id => baseSet.has(id))).filter(r => r.length)
}

// Resolve the rows to render for a side, newest source first: an explicit
// drag-arranged layout, else a legacy enabled-columns set mapped onto the
// default formation rows, else the base default.
export function resolveDepthLayout(side, layoutMap, positionsMap) {
  const saved = layoutMap?.[side]
  if (Array.isArray(saved) && saved.length) {
    // Rows are stored as { cols: [...] } objects (Firestore can't nest arrays),
    // but tolerate a raw array-of-arrays too (local-storage dynasties).
    const rows = saved
      .map(r => (Array.isArray(r) ? r : (r && Array.isArray(r.cols) ? r.cols : [])))
      .filter(r => r.length)
    if (rows.length) return rows
  }
  const pos = positionsMap?.[side]
  if (Array.isArray(pos) && pos.length) {
    const rows = FORMATION_ROWS[side] || OFFENSE_ROWS
    const set = new Set(pos)
    return rows.map(r => r.filter(id => set.has(id))).filter(r => r.length)
  }
  return defaultLayoutForSide(side)
}

// Returns { slots, tiers } for a side from a layout (array of column-id rows).
// Invalid/duplicate ids are dropped and empty rows removed; an empty/missing
// layout falls back to the base default. `slots` stays in catalog order so
// seeding/balancing is deterministic regardless of the on-screen arrangement.
export function formationFor(side, layout = null) {
  const catalog = CATALOGS[side] || OFFENSE_CATALOG
  const valid = new Set(catalog.map(sl => sl.id))
  const seen = new Set()
  let tiers = (Array.isArray(layout) ? layout : [])
    .map(row => (Array.isArray(row) ? row : []).filter(id => valid.has(id) && !seen.has(id) && seen.add(id)))
    .filter(row => row.length)
  if (!tiers.length) tiers = defaultLayoutForSide(side)
  const placed = new Set(tiers.flat())
  const slots = catalog.filter(sl => placed.has(sl.id))
  return { slots, tiers }
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
    nflPids = new Set(), lastYear = null, layoutRows = null,
  } = opts
  const { slots, tiers } = formationFor(side, layoutRows)
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
      id: sl.id, label: sl.label, group: sl.group,
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
