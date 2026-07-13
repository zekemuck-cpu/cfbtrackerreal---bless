// Pure scoring helpers for Scheme Builder. Two jobs:
//   1. scoreSchemeFit    — rank the canonical scheme list against the
//      team's actual starters' play-style archetypes.
//   2. scoreFormationFit — given a chosen scheme, score how well the roster
//      (starters + 2-deep) supports a specific real formation's personnel
//      need, inferred from its name (no site provides explicit personnel
//      groupings, so this is a heuristic — see parseFormationPersonnel).
//
// Both operate on the depth-chart `board` shape produced by
// src/utils/outlookBoard.js's buildBoard() — the same object TeamOutlook.jsx
// already builds from projectRoster(), so callers just pass it through.

import { getArchetypeWeight, OFFENSE_SCHEMES, DEFENSE_SCHEMES } from '../data/archetypeSchemeFit'

// Slot ids (from outlookBoard.js's catalogs) that count toward scheme-fit
// scoring — the base starters plus the same "necessary extra" roles the
// Archetypes editor surfaces by default (WR2/HB2/TE2/Slot WR, DT2/CB2/
// Nickel). Every starter's contribution is already OVR-weighted (see
// scoreSchemeFit below), so including bench-level extras doesn't let them
// outweigh actual starters — it just means archetypes set on those rows
// actually move the recommendation, matching what the editor implies.
const SCHEME_FIT_SLOTS = {
  offense: ['LT', 'LG', 'C', 'RG', 'RT', 'QB', 'HB', 'HB2', 'FB', 'WR', 'WR2', 'SLWR', 'TE', 'TE2'],
  defense: ['LEDG', 'DT', 'DT2', 'REDG', 'SAM', 'MIKE', 'WILL', 'CB', 'CB2', 'NB', 'FS', 'SS'],
}

function starterArchetype(slot) {
  const tile = slot.starter
  return tile?.player?.archetype || tile?.archetype || null
}

function starterOvr(slot) {
  const ovr = Number(slot.starter?.projectedOvr)
  return Number.isFinite(ovr) ? ovr : null
}

// A starter with no known OVR still counts, just at a neutral (average)
// weight rather than being dropped or given outsized influence.
const FALLBACK_OVR = 65

// Ranks the full canonical scheme list (OFFENSE_SCHEMES / DEFENSE_SCHEMES)
// against the board's current starters. Returns highest-score first.
// score is 0-100 (0 = every starter is a poor archetype fit, 100 = every
// starter is an ideal fit); sampleSize is how many starters had an archetype
// set at all (missing archetypes are skipped, not penalized). Each starter's
// contribution is weighted by their OVR, so your stars' archetype fit (or
// mismatch) drives the score more than a bench-level starter's.
export function scoreSchemeFit(board, side) {
  const schemeList = side === 'offense' ? OFFENSE_SCHEMES : DEFENSE_SCHEMES
  const slotIds = new Set(SCHEME_FIT_SLOTS[side] || [])
  const starters = (board?.slots || [])
    .filter((sl) => slotIds.has(sl.id))
    .map((sl) => ({ position: sl.id, archetype: starterArchetype(sl), ovr: starterOvr(sl) }))
    .filter((s) => s.archetype)

  if (!starters.length) {
    return schemeList.map((scheme) => ({ scheme, score: 0, sampleSize: 0, rationale: '' }))
  }

  return schemeList
    .map((scheme) => {
      const weighted = starters.map((s) => ({
        ...s,
        weight: getArchetypeWeight(side, scheme, s.position, s.archetype),
      }))
      const totalOvr = weighted.reduce((sum, s) => sum + (s.ovr ?? FALLBACK_OVR), 0)
      const avg = weighted.reduce((sum, s) => sum + s.weight * (s.ovr ?? FALLBACK_OVR), 0) / totalOvr
      const score = Math.round(Math.max(0, Math.min(100, (avg / 3) * 100)))
      // Best fits, best players first — a 3-weight match from your 95 OVR
      // starter is more worth calling out than the same match from a backup.
      // Ideal (weight 3) matches lead; good (weight 2) matches fill out the
      // list when there aren't enough ideal ones, so the rationale reflects
      // more of what's actually driving the score, not just the top 2.
      const byOvrDesc = (a, b) => (b.ovr ?? FALLBACK_OVR) - (a.ovr ?? FALLBACK_OVR)
      const ideal = weighted.filter((s) => s.weight >= 3).sort(byOvrDesc)
      const good = weighted.filter((s) => s.weight === 2).sort(byOvrDesc)
      const strong = [...ideal, ...good]
      const rationale = strong.length
        ? strong.slice(0, 4).map((s) => `${s.position} is ${s.archetype}${s.ovr != null ? ` (${s.ovr} OVR)` : ''}`).join(', ')
        : ''
      return { scheme, score, sampleSize: weighted.length, rationale }
    })
    .sort((a, b) => b.score - a.score)
}

// ── Formation personnel ─────────────────────────────────────────────────────
// civil.gg's formation catalog carries a real `personnel` string for ~half of
// offense formations (e.g. "2 WR / 2 TE / 1 HB", "5 WR (Empty)") — parse that
// directly when present. Defense formations and the other half of offense
// formations don't have it, so fall back to a naming-convention heuristic.

function parseRealPersonnelString(str) {
  if (!str) return null
  const get = (re) => { const m = str.match(re); return m ? parseInt(m[1], 10) : 0 }
  const wr = get(/(\d+)\s*WR/i)
  const te = get(/(\d+)\s*TE/i)
  const hb = get(/(\d+)\s*HB/i)
  const fb = get(/(\d+)\s*FB/i)
  return { wr, te, rb: hb + fb, needsFb: fb > 0 }
}

const HEAVY_SET_NAMES = new Set(['I Form', 'Strong I', 'Power I', 'Maryland I', 'Full House', 'Wishbone', 'Wingbone', 'Flexbone', 'Split Backs', 'Strong', 'Weak'])

function heuristicFormationPersonnel(formation) {
  const name = `${formation?.formation_name || ''}`
  const set = `${formation?.set_name || ''}`
  const n = name.toLowerCase()

  let wr = 1
  const digitMatch = n.match(/(\d)\s*wr/)
  if (digitMatch) wr = parseInt(digitMatch[1], 10)
  else if (/empty/.test(n)) wr = 5
  else if (/trips|trio|treys?/.test(n)) wr = 3
  else if (/doubles|spread|split/.test(n)) wr = 2
  else if (/twins|flex/.test(n)) wr = 2

  let te = /2te|dbl te|double tight/.test(n) ? 2 : (/tight|wing|y off/.test(n) ? 1 : (HEAVY_SET_NAMES.has(set) ? 1 : 0))
  if (/empty/.test(n)) te = Math.min(te, 1)

  let rb = /empty/.test(n) ? 0 : (/split backs|full house/.test(set.toLowerCase()) ? 2 : 1)
  const needsFb = HEAVY_SET_NAMES.has(set) && !/empty/.test(n)

  return { wr: Math.max(0, Math.min(5, wr)), te: Math.max(0, te), rb: Math.max(0, rb), needsFb }
}

// Deliberately approximate when falling back to the heuristic — used to flag
// "does the roster support this formation," not as a precise personnel label.
export function parseFormationPersonnel(formation) {
  return parseRealPersonnelString(formation?.personnel) || heuristicFormationPersonnel(formation)
}

// Depth-chart slot ids that can fill each personnel need, in priority order
// (starter slot first, then 2-deep/extra slots).
const PERSONNEL_SLOTS = {
  wr: ['WR', 'WR2', 'WR3', 'SLWR'],
  te: ['TE', 'TE2'],
  rb: ['HB', 'HB2'],
  fb: ['FB'],
}

// Scores a single real formation against the roster's current depth (starter
// + 2-deep). Returns { score (0-100), missingRoles, avgOvr } where
// missingRoles lists personnel needs the roster doesn't have enough real
// bodies to fill, and avgOvr is the average rating of the players who'd
// actually fill it (null if none had a rating) — a formation with full body
// coverage but replacement-level talent shouldn't score as high as one
// backed by real starters.
export function scoreFormationFit(board, formation, offenseScheme) {
  const need = parseFormationPersonnel(formation)
  const slotById = new Map((board?.slots || []).map((sl) => [sl.id, sl]))

  const bodiesFor = (slotIds) => slotIds.flatMap((id) => slotById.get(id)?.tiles || [])

  const missingRoles = []
  let filled = 0
  let needed = 0
  const usedOvrs = []

  const checkGroup = (label, count, slotIds) => {
    if (count <= 0) return
    needed += count
    const bodies = bodiesFor(slotIds)
    const have = Math.min(count, bodies.length)
    filled += have
    for (let i = 0; i < have; i++) {
      const ovr = Number(bodies[i]?.projectedOvr)
      if (Number.isFinite(ovr)) usedOvrs.push(ovr)
    }
    if (have < count) missingRoles.push(label)
  }

  checkGroup('WR', need.wr, PERSONNEL_SLOTS.wr)
  checkGroup('TE', need.te, PERSONNEL_SLOTS.te)
  checkGroup('HB', need.rb, PERSONNEL_SLOTS.rb)
  if (need.needsFb) checkGroup('FB', 1, PERSONNEL_SLOTS.fb)

  if (!needed) return { score: 50, missingRoles: [], avgOvr: null }

  const coverageScore = (filled / needed) * 100
  const avgOvr = usedOvrs.length ? usedOvrs.reduce((a, b) => a + b, 0) / usedOvrs.length : null
  // Blend body-count coverage with the actual talent filling those bodies —
  // OVR is already ~0-99, so it doubles as a 0-100ish quality score with no
  // rescaling needed. Falls back to coverage alone when no OVR is known.
  let score = avgOvr != null ? coverageScore * 0.5 + avgOvr * 0.5 : coverageScore

  // Archetype quality of whoever fills the WR slots nudges it further when a
  // scheme is already chosen.
  if (offenseScheme) {
    const wrTiles = bodiesFor(PERSONNEL_SLOTS.wr).slice(0, need.wr)
    const archetypeWeights = wrTiles
      .map((t) => t?.player?.archetype || t?.archetype)
      .filter(Boolean)
      .map((a) => getArchetypeWeight('offense', offenseScheme, 'WR', a))
    if (archetypeWeights.length) {
      const avg = archetypeWeights.reduce((a, b) => a + b, 0) / archetypeWeights.length
      score = score * 0.7 + ((avg / 3) * 100) * 0.3
    }
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    missingRoles,
    avgOvr: avgOvr != null ? Math.round(avgOvr) : null,
  }
}
