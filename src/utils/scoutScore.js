// ScoutScore integration (MaxPlaysCFB).
//
// Maps a tracked recruit (position, archetype, stars, devTrait, and the
// attribute values entered via the Targets sheet) onto the payload that
// MaxPlaysCFB's ScoutScore percentile API expects, then calls it through our
// own serverless proxy (api/scoutscore-preview.js) so the browser never has to
// deal with cross-origin CORS.
//
// Our attribute abbreviations (ATTRIBUTE_ABBR) and archetype names come from the
// same Scout Staff config ScoutScore uses, so the codes line up 1:1.

import { ATTRIBUTE_ABBR, normalizeArch } from './recruitAttributes'
import { getEditionKey } from '../editions'

// MaxPlaysCFB scores against a per-game cohort selected by the `sourceGame`
// field on the payload ("cfb26" | "cfb27"). The edition keys we already use
// (getEditionKey) are the exact same strings, so a dynasty's edition maps 1:1.
// Default to cfb26 (the legacy set) for any unknown value. The cfb27 cohorts
// are LIVE upstream (as of 2026-07-03 MaxPlays switched their ScoutScore
// display to the cfb27 numbers), so a cfb27 request now returns genuine
// game:cfb27 cohorts — a CFB 27 dynasty is scored against CFB 27 recruits with
// no extra work here. Older/untagged saves stay on cfb26.
const VALID_SOURCE_GAMES = new Set(['cfb26', 'cfb27'])
const normalizeSourceGame = (g) => (VALID_SOURCE_GAMES.has(g) ? g : 'cfb26')

// Our game position → ScoutScore position value.
const POSITION_MAP = {
  QB: 'QB',
  HB: 'HB', RB: 'HB', FB: 'FB',
  WR: 'WR', TE: 'TE',
  LT: 'OT', RT: 'OT', OT: 'OT', OL: 'OT',
  LG: 'OG', RG: 'OG', OG: 'OG', C: 'C',
  DE: 'EDGE', LE: 'EDGE', RE: 'EDGE', LEDG: 'EDGE', REDG: 'EDGE', EDGE: 'EDGE', DL: 'EDGE',
  DT: 'DT', NT: 'DT',
  SAM: 'SAM_WILL', WILL: 'SAM_WILL', OLB: 'SAM_WILL', LOLB: 'SAM_WILL', ROLB: 'SAM_WILL', LB: 'SAM_WILL',
  MIKE: 'MIKE', MLB: 'MIKE', ILB: 'MIKE',
  CB: 'CB', DB: 'CB',
  FS: 'FS', S: 'FS',
  SS: 'SS',
}

// ScoutScore archetype label → value, per ScoutScore position. Labels match our
// archetype names because both derive from the Scout Staff config.
const ARCH_BY_POS = {
  QB: { 'Backfield Creator': 'backfield_creator', 'Dual Threat': 'dual_threat', 'Pocket Passer': 'pocket_passer', 'Pure Runner': 'pure_runner' },
  HB: { 'Backfield Threat': 'backfield_threat', 'Contact Seeker': 'contact_seeker', 'East/West Playmaker': 'east_west_playmaker', 'Elusive Bruiser': 'elusive_bruiser', 'North/South Blocker': 'north_south_blocker', 'North/South Receiver': 'north_south_receiver' },
  FB: { 'Blocking': 'blocking', 'Utility': 'utility' },
  WR: { 'Contested Specialist': 'contested_specialist', 'Elusive Route Runner': 'elusive_route_runner', 'Gadget': 'gadget', 'Gritty Possession': 'gritty_possession', 'Physical Route Runner': 'physical_route_runner', 'Route Artist': 'route_artist', 'Speedster': 'speedster' },
  TE: { 'Gritty Possession': 'gritty_possession', 'Physical Route Runner': 'physical_route_runner', 'Pure Possession': 'possession', 'Pure Blocker': 'pure_blocker', 'Vertical Threat': 'vertical_threat' },
  OT: { 'Agile': 'agile', 'Pass Protector': 'pass_protector', 'Raw Strength': 'raw_strength', 'Well Rounded': 'well_rounded' },
  OG: { 'Agile': 'agile', 'Pass Protector': 'pass_protector', 'Raw Strength': 'raw_strength', 'Well Rounded': 'well_rounded' },
  C: { 'Agile': 'agile', 'Pass Protector': 'pass_protector', 'Raw Strength': 'raw_strength', 'Well Rounded': 'well_rounded' },
  EDGE: { 'Edge Setter': 'edge_setter', 'Pure Power': 'pure_power', 'Power Rusher': 'power_rusher', 'Speed Rusher': 'speed_rusher' },
  DT: { 'Gap Specialist': 'gap_specialist', 'Pure Power': 'pure_power', 'Power Rusher': 'power_rusher', 'Speed Rusher': 'speed_rusher' },
  SAM_WILL: { 'Lurker': 'lurker', 'Signal Caller': 'signal_caller', 'Thumper': 'thumper' },
  MIKE: { 'Lurker': 'lurker', 'Signal Caller': 'signal_caller', 'Thumper': 'thumper' },
  CB: { 'Boundary': 'boundary', 'Bump and Run': 'bump_and_run', 'Field': 'field', 'Zone': 'zone' },
  FS: { 'Box Specialist': 'box_specialist', 'Coverage Specialist': 'coverage_specialist', 'Hybrid': 'hybrid' },
  SS: { 'Box Specialist': 'box_specialist', 'Coverage Specialist': 'coverage_specialist', 'Hybrid': 'hybrid' },
}

const DEV_MAP = { Normal: 'normal', Impact: 'impact', Star: 'star', Elite: 'elite' }

function findArchValue(scoutPos, archetype) {
  const map = ARCH_BY_POS[scoutPos]
  if (!map) return null
  const label = normalizeArch(archetype)
  if (map[label]) return map[label]
  const lower = label.toLowerCase()
  for (const [k, v] of Object.entries(map)) if (k.toLowerCase() === lower) return v
  return null
}

// ── Recruit Overall Predictor (MaxPlaysCFB) ─────────────────────────────────
// Projects a recruit's day-1 (freshman) overall from position + star only.
// Replicated verbatim from MaxPlaysCFB's tool: prediction = 57 + positionMod +
// starMod; low/high = prediction -/+ positionStdError -/+ 1.5. Pure math, no API.
const OVR_BASE = 57
const OVR_STAR_MODIFIERS = { 5: 16.89, 4: 14.15, 3: 6.26, 2: 0.0, 1: -4.0 }
const OVR_POSITION_MODIFIERS = {
  QB: { modifier: 3.72, stdError: 0.62 }, HB: { modifier: 4.05, stdError: 0.58 }, FB: { modifier: 2.14, stdError: 1.03 },
  WR: { modifier: 2.24, stdError: 0.57 }, TE: { modifier: 0.44, stdError: 0.66 },
  OT: { modifier: 2.74, stdError: 0.6 }, OG: { modifier: 3.11, stdError: 0.65 }, C: { modifier: 0.0, stdError: 0.7 },
  DE: { modifier: 2.8, stdError: 0.59 }, DT: { modifier: 2.83, stdError: 0.62 },
  OLB: { modifier: 3.1, stdError: 0.58 }, MIKE: { modifier: 1.85, stdError: 0.65 },
  CB: { modifier: 2.49, stdError: 0.59 }, FS: { modifier: 2.73, stdError: 0.68 }, SS: { modifier: 3.11, stdError: 0.96 },
  K: { modifier: 13.9, stdError: 0.8 }, P: { modifier: 13.9, stdError: 0.8 },
}
// Our positions → the predictor's position keys (note DE/OLB here, not EDGE/SAM_WILL).
const OVR_POSITION_MAP = {
  QB: 'QB', HB: 'HB', RB: 'HB', FB: 'FB', WR: 'WR', TE: 'TE',
  LT: 'OT', RT: 'OT', OT: 'OT', OL: 'OT', LG: 'OG', RG: 'OG', OG: 'OG', C: 'C',
  DE: 'DE', LE: 'DE', RE: 'DE', LEDG: 'DE', REDG: 'DE', EDGE: 'DE', DL: 'DE',
  DT: 'DT', NT: 'DT',
  SAM: 'OLB', WILL: 'OLB', OLB: 'OLB', LOLB: 'OLB', ROLB: 'OLB', LB: 'OLB',
  MIKE: 'MIKE', MLB: 'MIKE', ILB: 'MIKE',
  CB: 'CB', DB: 'CB', FS: 'FS', S: 'FS', SS: 'SS', K: 'K', P: 'P',
}

// MaxPlaysCFB's predictor has no ATH entry of its own (ATH isn't a real
// position in their model) — so an ATH recruit is projected through whichever
// real position their specific archetype plays closest to, same idea as
// ATH_FALLBACK_POS in archetypeWeights.js (which does this for grading
// weights). Covers every archetype in OPTIONS_REGISTRY's ATH list.
const ATH_ARCHETYPE_TO_OVR_POSITION = {
  'Power Rusher': 'DE',
  'East/West Playmaker': 'HB',
  'Contested Specialist': 'WR',
  'Agile': 'OT',
  'Pure Runner': 'QB',
  'Dual Threat': 'QB',
  'Contact Seeker': 'HB',
  'Lurker': 'OLB',
  'Pure Possession': 'TE',
  'Thumper': 'OLB',
  'Backfield Threat': 'HB',
  'Physical Route Runner': 'TE',
  'Elusive Bruiser': 'HB',
  'Speed Rusher': 'DE',
}

// { overall, low, high } projected day-1 overall, or null when not predictable
// (unknown position or missing star).
export function predictRecruitOverall(recruit) {
  const rawPos = (recruit?.position || '').toUpperCase()
  const posKey = rawPos === 'ATH'
    ? ATH_ARCHETYPE_TO_OVR_POSITION[normalizeArch(recruit?.archetype || '')]
    : OVR_POSITION_MAP[rawPos]
  const star = Number(recruit?.stars)
  const pm = posKey && OVR_POSITION_MODIFIERS[posKey]
  const sm = OVR_STAR_MODIFIERS[star]
  if (!pm || typeof sm !== 'number') return null
  const prediction = OVR_BASE + pm.modifier + sm
  const r1 = (v) => Math.round(v * 10) / 10
  return {
    overall: r1(prediction),
    low: r1(prediction - pm.stdError - 1.5),
    high: r1(prediction + pm.stdError + 1.5),
  }
}

// Build the ScoutScore request payload from a recruit, or explain why we can't.
// `sourceGame` selects the game cohort ("cfb26" | "cfb27") — pass the dynasty's
// edition key.
export function buildScoutScorePayload(recruit, sourceGame = 'cfb26') {
  const posRaw = (recruit?.position || '').toUpperCase()
  const scoutPos = POSITION_MAP[posRaw]
  if (!scoutPos) {
    return { ok: false, reason: `ScoutScore doesn't cover ${recruit?.position || 'this position'} yet.` }
  }
  const archetype = findArchValue(scoutPos, recruit?.archetype)
  if (!archetype) {
    return { ok: false, reason: 'Set a recognized archetype on this recruit to run ScoutScore.' }
  }

  const attributes = {}
  for (const [name, val] of Object.entries(recruit?.attributes || {})) {
    const abbr = ATTRIBUTE_ABBR[name]
    const n = Number(val)
    if (abbr && Number.isFinite(n)) attributes[abbr] = n
  }
  if (Object.keys(attributes).length === 0) {
    return { ok: false, reason: 'No attributes entered for this recruit yet. Fill them on the Targets sheet first.' }
  }

  const star = Number(recruit?.stars)
  return {
    ok: true,
    payload: {
      sourceGame: normalizeSourceGame(sourceGame),
      position: scoutPos,
      star: Number.isFinite(star) && star > 0 ? star : null,
      gemStatus: '', // we don't track gem/bust; broad lenses still resolve
      archetype,
      devTrait: DEV_MAP[recruit?.devTrait] || null,
      isAthlete: false,
      attributes,
      // Which game's recruit cohort to benchmark against — MaxPlaysCFB's own
      // ScoutScore page sends this as "sourceGame" (verified directly from
      // their frontend's actual request payload; a plain "game" field, which
      // seemed like the obvious guess, is silently ignored and always falls
      // back to their cfb26 cohort). Callers attach `recruit.sourceGame`
      // themselves (based on the dynasty's actual edition) — this defaults to
      // 'cfb26' so any caller that doesn't set it keeps today's behavior
      // exactly as-is.
      sourceGame: recruit?.sourceGame === 'cfb27' ? 'cfb27' : 'cfb26',
    },
  }
}

// Call the proxy and return { ok, data } or { ok:false, reason }.
//
// Always a relative path: in production the same-origin Vercel function
// (api/scoutscore-preview.js) handles it; in `npm run dev` the Vite dev-server
// proxy forwards it straight to MaxPlaysCFB. The upstream envelope fields are
// included here so the dev path (which talks to the upstream directly, with no
// serverless function to add them) validates.
export async function runScoutScore(payload) {
  let res
  try {
    res = await fetch('/api/scoutscore-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, usedImageUpload: false, confirmedOutlierKeys: [] }),
    })
  } catch {
    return { ok: false, reason: 'Could not reach ScoutScore. Check your connection and try again.' }
  }
  const data = await res.json().catch(() => null)
  if (!res.ok || !data || data.ok === false) {
    const reason = (data && data.message && !data.message.startsWith('HTTP ') ? data.message : null) || `ScoutScore is unavailable right now. Try again later.`
    return { ok: false, reason }
  }
  return { ok: true, data }
}

// ---- Caching + batch scoring ----

function signature(payload) {
  const attrs = Object.entries(payload.attributes)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}:${v}`)
    .join(',')
  return `${payload.sourceGame}|${payload.position}|${payload.star}|${payload.archetype}|${payload.gemStatus}|${payload.devTrait}|${attrs}`
}

// Module-level cache: identical recruit inputs resolve to the same in-flight or
// completed result, so expanding a card / revisiting the board never refetches.
const cache = new Map()

// Fetch (and cache) the ScoutScore result for a recruit. Resolves to
// { ok:true, data } or { ok:false, reason }. Failed requests are dropped from
// the cache so a later attempt can retry.
export function getScoutScore(recruit, sourceGame = 'cfb26') {
  const built = buildScoutScorePayload(recruit, sourceGame)
  if (!built.ok) return Promise.resolve({ ok: false, reason: built.reason })
  const key = signature(built.payload)
  if (cache.has(key)) return cache.get(key)
  const p = runScoutScore(built.payload)
  cache.set(key, p)
  p.then((r) => { if (!r || !r.ok) cache.delete(key) }).catch(() => cache.delete(key))
  return p
}

// The headline percentile a recruit shows: overall percentile against the full
// POSITION POOL (e.g. "all WR recruits") — the broad, default benchmark. Falls
// back to the most specific lens only if the position lens is missing.
export function headlinePercentile(data) {
  if (!data) return null
  const pool = data.overallSummaries?.position
  if (pool && Number.isFinite(pool.percentile)) return pool.percentile
  const lens = data.defaultLens || data.availableLenses?.find((l) => l.eligible)?.key
  const o = lens && data.overallSummaries?.[lens]
  return o && Number.isFinite(o.percentile) ? o.percentile : null
}

// The lens to select by default in the panel: the position pool when available.
export function defaultLensKey(data) {
  if (!data) return null
  if (data.availableLenses?.some((l) => l.key === 'position' && l.eligible)) return 'position'
  return data.defaultLens || data.availableLenses?.find((l) => l.eligible)?.key || null
}

// Background-warm the cache for a dynasty's current-year recruiting targets, so
// the Scout Board renders instantly when the user opens Recruiting. Fire-and-
// forget; results land in the shared cache. Gentle concurrency for background.
export function warmScoutScoresForDynasty(dynasty) {
  const yr = Number(dynasty?.currentYear)
  if (!Number.isFinite(yr)) return
  const targets = (dynasty?.players || []).filter((p) => p?.isTarget && Number(p.targetYear) === yr)
  if (targets.length) getScoutScoresFor(targets, { concurrency: 4, sourceGame: getEditionKey(dynasty) }).catch(() => {})
}

// Score many recruits with a small concurrency cap (be polite to the upstream).
// Returns a Map of pid → result.
export async function getScoutScoresFor(recruits, { concurrency = 6, sourceGame = 'cfb26' } = {}) {
  const out = new Map()
  const queue = [...recruits]
  async function worker() {
    while (queue.length) {
      const r = queue.shift()
      out.set(r.pid, await getScoutScore(r, sourceGame))
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, recruits.length)) }, worker))
  return out
}

// 27.98 → "28th". Handles 11/12/13 correctly.
export function ordinal(pct) {
  if (pct == null || !Number.isFinite(Number(pct))) return null
  const n = Math.round(Number(pct))
  const mod100 = n % 100
  const mod10 = n % 10
  const suffix = mod100 >= 11 && mod100 <= 13 ? 'th' : mod10 === 1 ? 'st' : mod10 === 2 ? 'nd' : mod10 === 3 ? 'rd' : 'th'
  return `${n}${suffix}`
}
