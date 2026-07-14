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
// Archetypes editor surfaces by default (WR2/WR3/HB2/TE2/Slot WR, DT2/DT3/
// CB2/Nickel). Every starter's contribution is already OVR-weighted (see
// scoreSchemeFit below), so including bench-level extras doesn't let them
// outweigh actual starters — it just means archetypes set on those rows
// actually move the recommendation, matching what the editor implies.
// Offense uses one fixed list — the O-line/backfield/receiver counts don't
// vary by scheme identity the way defensive front shape does. Defense's
// list is derived per-scheme instead (see defenseFrontSlots): a 3-3-5 (3
// DL, 3 LB, 5 DB) and a 4-3 (4 DL, 3 LB, 4 DB) genuinely put different
// personnel counts on the field, so judging both against the same fixed
// slot list either drags in a DL body that isn't really there for a 3-man
// front or misses a real DB for a 5-DB front.
const SCHEME_FIT_SLOTS = {
  offense: ['LT', 'LG', 'C', 'RG', 'RT', 'QB', 'HB', 'HB2', 'FB', 'WR', 'WR2', 'WR3', 'SLWR', 'TE', 'TE2'],
}

// Real DL/LB/DB counts genuinely differ by front shape, and defense scheme/
// formation-set names in this game always encode that shape as a prefix
// ("3-3-5 Zone Pressure" is still fundamentally a 3-3-5 front) — so this
// takes either a scheme name or a formation set_name and works for both.
// Counts matched to the name as closely as the depth chart catalog allows:
//   Dime/Nickel     — real situational sub-packages any base defense calls;
//                     the front rotates in from the base group rather than
//                     being scheme-specific starters, so only the extra DB
//                     matters.
//   Goalline/46/5-2/4-4 — heavy/short-yardage: extra beef up front, no DBs.
//   3-2-6   — 3 DL, 2 LB, 5 DB (catalog caps at 5 DB; the 6th is a known
//             approximation).
//   3-3-5   — 3 DL, 3 LB, 5 DB.
//   3-4     — 3 DL, 3 LB (catalog caps at 3; real 3-4 runs 4), 4 DB.
//   4-2-5   — 4 DL, 2 LB, 5 DB (the "5" is the nickel back).
//   4-3 and everything else (Multiple, Multiple D, ...) — 4 DL, 3 LB, 4 DB.
function defenseFrontSlots(name) {
  const n = name || ''
  if (n === 'Dime' || n === 'Nickel') return ['CB', 'CB2', 'NB', 'FS', 'SS']
  if (n === 'Goalline' || n === '46' || n === '5-2' || n === '4-4') {
    return ['LEDG', 'DT', 'DT2', 'DT3', 'REDG', 'SAM', 'MIKE', 'WILL']
  }
  if (n.startsWith('3-2-6')) return ['DT', 'DT2', 'DT3', 'SAM', 'MIKE', 'CB', 'CB2', 'NB', 'FS', 'SS']
  if (n.startsWith('3-3-5')) return ['DT', 'DT2', 'DT3', 'SAM', 'MIKE', 'WILL', 'CB', 'CB2', 'NB', 'FS', 'SS']
  if (n.startsWith('3-4')) return ['DT', 'DT2', 'DT3', 'SAM', 'MIKE', 'WILL', 'CB', 'CB2', 'FS', 'SS']
  if (n.startsWith('4-2-5')) return ['LEDG', 'DT', 'DT2', 'REDG', 'SAM', 'MIKE', 'CB', 'CB2', 'NB', 'FS', 'SS']
  return ['LEDG', 'DT', 'DT2', 'REDG', 'SAM', 'MIKE', 'WILL', 'CB', 'CB2', 'FS', 'SS']
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

const round1 = (n) => Math.round(n * 10) / 10

const describeStarter = (s) => `${s.position} (${s.archetype}${s.ovr != null ? `, ${s.ovr} OVR` : ''})`

// A short "why / why not" explanation instead of a raw list of matches — the
// single best-fitting starter (why this scheme scored the way it did), plus
// the highest-OVR starter whose archetype ISN'T one this scheme specifically
// rewards (why it isn't scoring higher), when that's actually holding the
// score back. Both picks favor higher-OVR starters first, same rationale as
// the OVR-weighted score itself: your stars' fit (or lack of it) matters
// more than a bench-level starter's.
function buildRationale(weighted, score) {
  const byOvrDesc = (a, b) => (b.ovr ?? FALLBACK_OVR) - (a.ovr ?? FALLBACK_OVR)
  const ideal = weighted.filter((s) => s.weight >= 3).sort(byOvrDesc)
  const good = weighted.filter((s) => s.weight === 2).sort(byOvrDesc)
  const neutral = weighted.filter((s) => s.weight === 1).sort(byOvrDesc)
  // Explicit poor fits (weight 0) are a stronger, more confident signal
  // than "just not called out" neutral archetypes — these are cases where
  // the real data makes a clear case the archetype is actively wrong for
  // the scheme (see archetypeSchemeFit.js), not just unrewarded.
  const poor = weighted.filter((s) => s.weight <= 0).sort(byOvrDesc)

  const bestFit = ideal[0] || good[0]
  const sentences = []
  if (bestFit) {
    const tierPhrase = ideal.includes(bestFit) ? 'is an ideal fit for this scheme' : 'fits this scheme well'
    sentences.push(`${describeStarter(bestFit)} ${tierPhrase}.`)
  } else {
    sentences.push(`None of your starters' archetypes stand out for this scheme yet.`)
  }

  // A poor fit is worth calling out regardless of score (it's real,
  // data-backed information); a merely-neutral weak link only matters when
  // the scheme isn't already a near-lock — a 90+ score doesn't need a caveat.
  const poorLink = poor.find((s) => s !== bestFit)
  const weakLink = neutral.find((s) => s !== bestFit)
  if (poorLink) {
    sentences.push(`${describeStarter(poorLink)} is a poor fit for this scheme, which holds it back.`)
  } else if (weakLink && score < 90) {
    sentences.push(`${describeStarter(weakLink)} isn't the archetype this scheme is built around, which caps the ceiling.`)
  }

  return sentences.join(' ')
}

// Shared breakdown shape for every score in Scheme Builder (scheme
// rankings, playbook scores, formation scores) — so the SAME structure
// shows up wherever a score does and two of them can be lined up and
// compared factor-by-factor, not just "68 vs 73." Takes raw
// {position, archetype, ovr, value, weight} rows (value = that slot's 0-100
// quality/fit; weight = how much it counted toward the average — OVR for
// scheme-fit, personnel-usage weight for playbook-fit, 1 for formation-fit)
// and returns them sorted by actual point contribution (weight × value),
// heaviest first, with a comparable weightPct (this slot's share of the
// total weight) alongside each one's own value.
function buildBreakdown(rows) {
  const totalWeight = rows.reduce((sum, r) => sum + (r.weight || 0), 0)
  if (!totalWeight) return []
  return rows
    .map((r) => ({
      position: r.position,
      archetype: r.archetype || null,
      ovr: r.ovr ?? null,
      value: round1(Math.max(0, Math.min(100, r.value))),
      weightPct: round1((r.weight / totalWeight) * 100),
    }))
    .sort((a, b) => (b.value * b.weightPct) - (a.value * a.weightPct))
}

// Ranks the full canonical scheme list (OFFENSE_SCHEMES / DEFENSE_SCHEMES)
// against the board's current starters. Returns highest-score first.
// score is 0-100 (0 = every starter is a poor archetype fit, 100 = every
// starter is an ideal fit); sampleSize is how many starters had an archetype
// set at all (missing archetypes are skipped, not penalized). Each starter's
// contribution is weighted by their OVR, so your stars' archetype fit (or
// mismatch) drives the score more than a bench-level starter's.
export function scoreSchemeFit(board, side) {
  const schemeList = side === 'offense' ? OFFENSE_SCHEMES : DEFENSE_SCHEMES
  const slotById = new Map((board?.slots || []).map((sl) => [sl.id, sl]))

  const startersFor = (slotIds) => slotIds
    .map((id) => slotById.get(id))
    .filter(Boolean)
    .map((sl) => ({ position: sl.id, archetype: starterArchetype(sl), ovr: starterOvr(sl) }))
    .filter((s) => s.archetype)

  // Offense uses one fixed slot list; defense's varies by the scheme's own
  // front shape (see defenseFrontSlots), so its starters are recomputed
  // per scheme rather than once up front.
  const offenseStarters = side === 'offense' ? startersFor(SCHEME_FIT_SLOTS.offense) : null

  if (side === 'offense' && !offenseStarters.length) {
    return schemeList.map((scheme) => ({ scheme, score: 0, sampleSize: 0, rationale: '' }))
  }

  return schemeList
    .map((scheme) => {
      const starters = side === 'offense' ? offenseStarters : startersFor(defenseFrontSlots(scheme))
      if (!starters.length) return { scheme, score: 0, sampleSize: 0, rationale: '', breakdown: [] }

      const weighted = starters.map((s) => ({
        ...s,
        weight: getArchetypeWeight(side, scheme, s.position, s.archetype),
      }))
      const totalOvr = weighted.reduce((sum, s) => sum + (s.ovr ?? FALLBACK_OVR), 0)
      const avg = weighted.reduce((sum, s) => sum + s.weight * (s.ovr ?? FALLBACK_OVR), 0) / totalOvr
      const score = round1(Math.max(0, Math.min(100, (avg / 3) * 100)))
      const rationale = buildRationale(weighted, score)
      const breakdown = buildBreakdown(weighted.map((s) => ({
        position: s.position, archetype: s.archetype, ovr: s.ovr,
        value: (s.weight / 3) * 100, weight: s.ovr ?? FALLBACK_OVR,
      })))
      return { scheme, score, sampleSize: weighted.length, rationale, breakdown }
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

// Keyword -> {wr, te, rb} table, re-derived from the ~273 offense formations
// that DO carry a real personnel string (civil.gg) — averaged real WR/TE/RB
// counts for every formation whose name contains that keyword (and has no
// explicit digit, so the average isn't skewed by formations that didn't
// need this fallback at all). Replaces a hand-guessed table that was
// meaningfully wrong in several places once checked against the real data:
// "Empty" was guessed at 5 WR (real average 3.1 — a TE routinely fills one
// of the "empty" backfield's vacated spots), "Doubles"/"Spread" were
// guessed at 2 WR (real average 3.0-3.3), and "Bunch" (21 real samples,
// as common as "Trips") wasn't recognized at all and fell through to the
// 1-WR default. Checked top-to-bottom, first match wins — ordered roughly
// by real sample size/specificity so a formation matching multiple
// keywords (e.g. "Bunch Spread") gets the more specific one.
const NAME_PERSONNEL_TABLE = [
  // n=21, real 2.95/1.05/1.00
  [/bunch/, { wr: 3, te: 1, rb: 1 }],
  // trips n=43 (3.05/0.88/1.07), trio n=14 (3.00/1.00/1.00), quads n=4 (3.00/1.25/0.75), trey(s) n=6 (3.17/1.00/0.83)
  [/trips|trio|quads|treys?/, { wr: 3, te: 1, rb: 1 }],
  // n=17, real 3.00/1.00/1.00 — was guessed at 2 WR before, a real miss.
  [/doubles/, { wr: 3, te: 1, rb: 1 }],
  // n=18, real 3.06/1.00/0.89 — was guessed at 5 WR before; a TE or single
  // back routinely still occupies one of "empty"'s vacated backfield spots.
  [/empty/, { wr: 3, te: 1, rb: 0 }],
  // spread n=15 (3.33/0.67/1.00), open n=14 (3.21/0.64/1.14), wide n=23
  // (3.22/0.83/0.96) — was guessed at 2 WR before for "spread".
  [/spread|open|wide/, { wr: 3, te: 1, rb: 1 }],
  // flex n=21 (2.67/1.14/1.10), slot n=27 (2.59/1.04/1.30), stack n=11
  // (2.64/1.09/1.18), nasty n=8 (2.50/1.38/1.13), offset n=24 (2.75/1.00/1.21)
  [/flex|slot|stack|nasty|offset/, { wr: 3, te: 1, rb: 1 }],
  // tight n=29, real 1.59/1.79/1.62 — genuinely 2-TE, 2-back leaning.
  [/tight/, { wr: 2, te: 2, rb: 2 }],
  // wing n=42 (1.88/1.93/1.12), ace n=8 (1.75/2.13/1.13), z/u/deuce (~2/~2/1)
  // — "Ace" wasn't recognized at all before and fell through to 1 WR/0 TE.
  [/wing|\bace\b|\bz\b|\bu\b|deuce|pair/, { wr: 2, te: 2, rb: 1 }],
  // twins n=7 (2.00/0.86/2.00), over n=21 (2.19/1.05/1.57), split n=14
  // (2.07/0.86/2.07), pro/normal/go (~2/~1/~2) — 2-back, modest TE.
  [/twins|over|split|\bpro\b|normal|\bgo\b/, { wr: 2, te: 1, rb: 2 }],
  // close n=28, real 2.46/1.14/1.39 — close-behind current default.
  [/close/, { wr: 2, te: 1, rb: 1 }],
]

function heuristicFormationPersonnel(formation) {
  const name = `${formation?.formation_name || ''}`
  const set = `${formation?.set_name || ''}`
  const n = name.toLowerCase()

  const digitMatch = n.match(/(\d)\s*wr/)
  const isEmpty = /empty/.test(n)
  const isHeavySet = HEAVY_SET_NAMES.has(set)

  let wr
  let te
  let rb
  if (digitMatch) {
    wr = parseInt(digitMatch[1], 10)
    // A digit WR count is explicit but doesn't say TE/RB — fall back to
    // whichever named-keyword rule matches (if any), then a typical split.
    const matched = NAME_PERSONNEL_TABLE.find(([re]) => re.test(n))
    te = matched ? matched[1].te : 1
    rb = matched ? matched[1].rb : 1
  } else {
    const matched = NAME_PERSONNEL_TABLE.find(([re]) => re.test(n))
    if (matched) {
      ;({ wr, te, rb } = matched[1])
    } else if (isHeavySet) {
      // No name keyword matched at all — fall back to the SET's own
      // identity (I Form/Full House/etc are all real 2-back, TE-forward
      // looks) rather than a generic guess.
      wr = 2; te = 1; rb = 2
    } else {
      // The most common real split across every keyword bucket sampled
      // (see table above) — a far better default than the old flat 1 WR.
      wr = 2; te = 1; rb = 1
    }
  }
  if (isEmpty) { rb = 0; te = Math.min(te, 1) }

  const needsFb = isHeavySet && !isEmpty

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

// Which players an OFFENSE formation actually puts on the field — used to
// decide WHO to judge, not how many you have (no coverage/shortfall
// concept). parseFormationPersonnel's counts just say how many of each
// SKILL group this look features (e.g. a 5WR Empty formation cares about
// your top 5 WRs; an I-Form look cares about HB/FB/TE) — if the roster has
// fewer than that at a position, we simply judge however many exist.
//
// Deliberately skill-position-only — QB and the O-line don't vary by
// personnel grouping (same starters every snap), so folding them into
// EVERY formation's featured-player list would just add a large constant
// block that dilutes the one thing that's actually supposed to
// differentiate formations/playbooks from each other: which specific
// skill players a given personnel mix puts on the field. QB fit still
// matters for scheme/playbook identity — it's blended in as its own
// explicit component at the playbook level instead (see scorePlaybookFit),
// where it can't wash out the personnel-mix signal.
function offenseFeaturedPlayers(board, formation) {
  const need = parseFormationPersonnel(formation)
  const slotById = new Map((board?.slots || []).map((sl) => [sl.id, sl]))
  const topFrom = (slotIds, count) => slotIds.flatMap((id) => slotById.get(id)?.tiles || []).slice(0, count)

  const players = []
  for (const tile of topFrom(PERSONNEL_SLOTS.wr, need.wr)) players.push({ tile, position: 'WR' })
  for (const tile of topFrom(PERSONNEL_SLOTS.te, need.te)) players.push({ tile, position: 'TE' })
  for (const tile of topFrom(PERSONNEL_SLOTS.rb, need.rb)) players.push({ tile, position: 'HB' })
  if (need.needsFb) for (const tile of topFrom(PERSONNEL_SLOTS.fb, 1)) players.push({ tile, position: 'FB' })
  return players
}

// Defensive "formations" are really front/coverage packages (Base, Nickel,
// Dime, Goalline, ...), not personnel groupings — there's no WR/TE/RB-style
// count to judge. Instead, infer which position group a package emphasizes
// from its base alignment name (see defenseFrontSlots, shared with
// scoreSchemeFit/scorePlaybookFit) and judge talent+style across exactly
// the DL/LB/DB counts that front actually puts on the field.
function defenseFeaturedPlayers(board, formation) {
  const slotById = new Map((board?.slots || []).map((sl) => [sl.id, sl]))
  const slotIds = defenseFrontSlots(formation?.set_name)
  return slotIds
    .map((id) => ({ tile: slotById.get(id)?.starter, position: id }))
    .filter((p) => p.tile)
}

// A starter with no known OVR still counts, at neutral talent rather than
// being dropped or dragging the average down to 0.
const NEUTRAL_TALENT = 65

// Two playbooks in the SAME scheme can have genuinely different real
// run/pass/qbRun/option splits (that's the whole reason Scheme Builder
// tracks tendency per playbook, not just per scheme) — without factoring
// that in, every playbook in a scheme judges QB archetype fit against the
// exact same scheme-level table and scores identically on that axis. This
// derives a small, bounded QB-archetype nudge from ONE playbook's own real
// tendency, so a more pass-heavy team within a scheme actually rewards a
// Pocket Passer more than a more run-heavy team in that same scheme does.
// Normalized against realistic ranges seen across real playbooks (~40-75%
// pass, ~0-25% option+qbRun) rather than fixed per-scheme thresholds.
function qbTendencyBias(tendency) {
  if (!tendency?.total) return null
  const pct = (n) => (100 * n) / tendency.total
  const passBias = Math.max(0, Math.min(1, (pct(tendency.pass) - 50) / 25))
  const runBias = Math.max(0, Math.min(1, (pct(tendency.qbRun) + pct(tendency.option) * 0.5) / 15))
  return { passBias, runBias }
}

// Talent + style-fit blend for one player at one position/scheme. Both are
// 0-100ish scales (OVR already is; archetype weight 0-3 is rescaled ×100/3),
// averaged 50/50 — no coverage/count component anywhere in this. `tendency`
// (optional) is one specific playbook's own real play-type split, used to
// nudge QB archetype fit — see qbTendencyBias.
function playerQuality(tile, position, side, scheme, tendency) {
  const ovr = Number(tile?.projectedOvr)
  const talent = Number.isFinite(ovr) ? ovr : NEUTRAL_TALENT
  const archetype = tile?.player?.archetype || tile?.archetype
  let weight = scheme && archetype ? getArchetypeWeight(side, scheme, position, archetype) : 1
  if (position === 'QB' && archetype && side === 'offense') {
    const bias = qbTendencyBias(tendency)
    if (bias) {
      if (archetype === 'Pocket Passer') weight += bias.passBias * 0.4
      else if (archetype === 'Dual Threat' || archetype === 'Pure Runner') weight += bias.runBias * 0.4
      else if (archetype === 'Backfield Creator') weight += bias.runBias * 0.2
      weight = Math.max(0, Math.min(3, weight))
    }
  }
  const style = (weight / 3) * 100
  return talent * 0.5 + style * 0.5
}

// Scores a single real formation purely on the talent and scheme-style fit
// of the specific players it would actually put on the field — not on
// whether you technically have "enough" bodies (every roster does, that's
// rarely the real question). Returns { score (0-100), avgOvr, breakdown }
// where avgOvr is the average rating of the featured players and breakdown
// is buildBreakdown's shared shape — every featured slot counts equally
// here (weight 1 each), so weightPct is just an even split.
export function scoreFormationFit(board, formation, side, scheme) {
  const featured = side === 'offense' ? offenseFeaturedPlayers(board, formation) : defenseFeaturedPlayers(board, formation)
  if (!featured.length) return { score: 50, avgOvr: null, breakdown: [] }

  const rows = featured.map(({ tile, position }) => ({
    position,
    archetype: tile?.player?.archetype || tile?.archetype || null,
    ovr: Number.isFinite(Number(tile?.projectedOvr)) ? Number(tile.projectedOvr) : null,
    value: playerQuality(tile, position, side, scheme),
    weight: 1,
  }))
  const score = rows.reduce((a, r) => a + r.value, 0) / rows.length

  const ovrs = rows.map((r) => r.ovr).filter(Number.isFinite)
  const avgOvr = ovrs.length ? Math.round(ovrs.reduce((a, b) => a + b, 0) / ovrs.length) : null

  return { score: round1(Math.max(0, Math.min(100, score))), avgOvr, breakdown: buildBreakdown(rows) }
}

// Personnel-usage-weighted roster slots for playbook-level scoring — see
// scorePlaybookFit for why this replaced a per-formation average. Weight
// each slot by how much this SPECIFIC playbook's own real personnel data
// (tendency.personnel: {'00': n, ..., '32': n, var: n}, digit 1 = RB count,
// digit 2 = TE count) actually uses it, so e.g. a playbook that runs 12
// personnel (2 TE) constantly gets TE2's fit counted meaningfully, while
// one that almost never does gets it counted barely at all — driven by
// real usage RATE, not by how many differently-named formations exist for
// a given personnel package.
function offenseSlotWeights(tendency) {
  const base = { QB: 1, LT: 1, LG: 1, C: 1, RG: 1, RT: 1, WR: 1, TE: 0, TE2: 0, HB: 1, HB2: 0, FB: 0 }
  const entries = tendency?.personnel ? Object.entries(tendency.personnel).filter(([code]) => code !== 'var') : []
  const totalCoded = entries.reduce((sum, [, n]) => sum + n, 0)
  if (!totalCoded) {
    // No real personnel breakdown for this playbook — fall back to a
    // generic 11-personnel assumption (1 RB, 1 TE, 3 WR), the most common
    // real-world grouping, rather than treating every slot equally.
    return { ...base, WR2: 1, WR3: 0, SLWR: 1, TE: 1 }
  }
  let rbSum = 0
  let teSum = 0
  for (const [code, n] of entries) {
    rbSum += parseInt(code[0], 10) * n
    teSum += parseInt(code[1], 10) * n
  }
  const avgRb = rbSum / totalCoded
  const avgTe = teSum / totalCoded
  const avgWr = Math.max(0, 5 - avgRb - avgTe)
  const clamp01 = (n) => Math.max(0, Math.min(1, n))
  const secondBack = clamp01(avgRb - 1)
  // Rank order matches PERSONNEL_SLOTS.wr (WR, WR2, WR3, SLWR) — each
  // successive body only weighs in once the playbook's real WR usage
  // actually reaches that many bodies on the field.
  return {
    ...base,
    WR2: clamp01(avgWr - 1), WR3: clamp01(avgWr - 2), SLWR: clamp01(avgWr - 3),
    TE: clamp01(avgTe), TE2: clamp01(avgTe - 1),
    // A 2nd backfield body could be a 2nd HB or an FB depending on the
    // team's own style, and personnel digits alone can't tell us which —
    // split the credit rather than guessing.
    HB2: secondBack * 0.5, FB: secondBack * 0.5,
  }
}

// Playbook-level fit: how well the roster suits THIS SPECIFIC playbook's
// actual personnel usage, not just its generic scheme. Every roster slot
// (QB, each O-line spot, WR/WR2/SLWR, TE/TE2, HB/HB2, FB) is judged EXACTLY
// ONCE — never averaged across a playbook's many formations — weighted by
// how heavily this playbook's own real personnel data uses that slot (see
// offenseSlotWeights). That was a deliberate fix: weighting by play-count
// across formations meant a scheme that only needs ONE thing to be good
// (e.g. Run & Shoot: just needs great WRs, since it barely uses TE/FB at
// all) always beat a scheme that needs several things to be good (Pro
// Style: needs WR AND TE AND FB), for ANY roster — not because the roster
// actually fit better, but because fewer required positions is
// statistically easier to satisfy. Judging each slot once, weighted by
// real usage rate rather than formation repetition, removes that bias.
//
// `tendency` (optional) is this playbook's own real tendency
// (playbookTendencyData[side][teamId]) — drives both the slot weights
// (offense personnel) and the QB archetype nudge (qbTendencyBias).
// Returns { score, breakdown } — see buildBreakdown for the shared shape.
// `null` (not an object) when there's nothing to score, so callers can
// still do a simple `!result` check.
export function scorePlaybookFit(board, side, scheme, tendency) {
  const slotById = new Map((board?.slots || []).map((sl) => [sl.id, sl]))
  // Defense has no per-playbook personnel breakdown (only the 30 scheme
  // templates carry real tendency at all, and even those are just
  // zone/man/blitz/match, not a personnel grouping) — every slot the
  // scheme's own front shape uses counts equally, matching scoreSchemeFit.
  const weights = side === 'offense'
    ? offenseSlotWeights(tendency)
    : Object.fromEntries(defenseFrontSlots(scheme).map((id) => [id, 1]))

  const rows = []
  for (const [slotId, weight] of Object.entries(weights)) {
    if (!weight) continue
    const tile = slotById.get(slotId)?.starter
    if (!tile) continue
    rows.push({
      position: slotId,
      archetype: tile?.player?.archetype || tile?.archetype || null,
      ovr: Number.isFinite(Number(tile?.projectedOvr)) ? Number(tile.projectedOvr) : null,
      value: playerQuality(tile, slotId, side, scheme, tendency),
      weight,
    })
  }
  const totalWeight = rows.reduce((sum, r) => sum + r.weight, 0)
  if (!totalWeight) return null
  const weightedScore = rows.reduce((sum, r) => sum + r.value * r.weight, 0)
  const score = round1(Math.max(0, Math.min(100, weightedScore / totalWeight)))
  return { score, breakdown: buildBreakdown(rows) }
}
