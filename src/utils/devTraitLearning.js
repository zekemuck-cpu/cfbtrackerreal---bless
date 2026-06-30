// Learns from scouted HS recruits whose dev trait has actually been revealed
// (never Hidden/unset, never estimated) to nudge ARCHETYPE_WEIGHTS and to power
// the "Predicted Dev Trait" suggestion on the scouting form.
//
// Every bucket (weights, badges, predictor) is scoped to the exact archetype +
// exact star level (if n >= MIN_N); otherwise it falls back to the static
// default (ARCHETYPE_WEIGHTS / PROFILES text). Star levels are never pooled
// together — a 4-star recruit never informs the 3-star tier and vice versa.
// ATH archetypes are never pooled with the position they borrow static weights
// from — the bucket key is the player's own position+archetype, so ATH_Contact
// Seeker and HB_Contact Seeker are naturally separate pools.
//
// MIN_N = 1: a single scouted player at an archetype+star is enough to seed a
// baseline threshold/centroid for that dev trait. Weight *learning* (which
// attributes separate Elite from Star, etc.) still self-gates on its own —
// computeLearnedWeights bails on zero-variance buckets, so it stays on the
// static defaults until at least two different dev-trait outcomes have been
// scouted for that exact archetype+star. The moment it has that, the learned
// (Pearson-correlation) weights are used at full strength — no blending with
// the static defaults.

import { normalizeArch, resolveWeights } from '../components/archetypeWeights';
import { RECRUIT_FORM_OVERRIDES, BASE_POSITION_CONFIG } from '../components/ScoutingReport';
import { ARCHETYPE_WEIGHTS } from '../components/archetypeWeights';

export const DEV_TRAITS = ['Elite', 'Star', 'Impact', 'Normal'];
const DEV_RANK = { Elite: 4, Star: 3, Impact: 2, Normal: 1 };
export const MIN_N = 1;

function isHiddenDevTrait(d) {
  return !d || d === 'Hidden' || d === 'hidden' || d === '';
}

// Resolve the exact attribute list a player at pos/arch actually has stored —
// matching the scouting form's input order rather than ARCHETYPE_WEIGHTS keys.
export function getFormAttrs(pos, arch) {
  if (RECRUIT_FORM_OVERRIDES[arch]) return RECRUIT_FORM_OVERRIDES[arch];
  const withSuffix = `${arch} (${pos})`;
  if (RECRUIT_FORM_OVERRIDES[withSuffix]) return RECRUIT_FORM_OVERRIDES[withSuffix];
  const withAth = `ATH - ${arch}`;
  if (RECRUIT_FORM_OVERRIDES[withAth]) return RECRUIT_FORM_OVERRIDES[withAth];
  return BASE_POSITION_CONFIG[pos] ?? Object.keys(ARCHETYPE_WEIGHTS[`${pos}_${arch}`] ?? {});
}

// ── Pool construction ─────────────────────────────────────────────────────
// pool[archKey][star][devTrait] = [player, ...]
export function buildRevealedPool(players) {
  const pool = {};
  (players || []).forEach(pl => {
    if (pl.isPortal || pl.previousTeam) return; // HS recruits only
    if (isHiddenDevTrait(pl.devTrait)) return;   // revealed dev trait only
    if (!DEV_TRAITS.includes(pl.devTrait)) return;
    if (!pl.position || !pl.archetype) return;
    const arch = normalizeArch(pl.archetype);
    const archKey = `${pl.position}_${arch}`;
    const star = String(pl.stars ?? '');
    if (!star) return;
    pool[archKey] ??= {};
    pool[archKey][star] ??= {};
    pool[archKey][star][pl.devTrait] ??= [];
    pool[archKey][star][pl.devTrait].push(pl);
  });
  return pool;
}

function flattenStarAllDev(pool, archKey, star) {
  const byDev = pool[archKey]?.[star];
  if (!byDev) return [];
  return Object.values(byDev).flat();
}

// Weight-learning bucket: all revealed dev traits pooled together at a given
// star (the dev trait is the label being correlated against, not a sub-bucket).
function resolveWeightSamples(pool, archKey, star) {
  const exact = flattenStarAllDev(pool, archKey, star);
  return exact.length >= MIN_N ? { samples: exact, level: 'star', n: exact.length } : { samples: [], level: 'none', n: 0 };
}

// Badge/predictor bucket: one specific dev trait group, independent of the
// other three groups — each group qualifies (or doesn't) entirely on its own.
function resolveDevTraitSamples(pool, archKey, star, devTrait) {
  const exact = pool[archKey]?.[star]?.[devTrait] || [];
  return exact.length >= MIN_N ? { samples: exact, level: 'star', n: exact.length } : { samples: [], level: 'none', n: 0 };
}

// ── Weight learning ────────────────────────────────────────────────────────
function pearson(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let cov = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    cov += dx * dy; vx += dx * dx; vy += dy * dy;
  }
  if (vx === 0 || vy === 0) return 0;
  return cov / Math.sqrt(vx * vy);
}

// Any attribute may earn weight from data — not just attributes with a
// nonzero static weight. Returns null (no signal) on a zero-variance label.
function computeLearnedWeights(samples, formAttrs) {
  const ys = samples.map(p => DEV_RANK[p.devTrait]);
  if (new Set(ys).size < 2) return null; // zero-variance guard
  const raw = {};
  let sum = 0;
  formAttrs.forEach(attr => {
    const xs = samples.map(p => p.attributes?.[attr] ?? 0);
    const floored = Math.max(0, pearson(xs, ys));
    raw[attr] = floored;
    sum += floored;
  });
  if (sum <= 0) return null;
  const weights = {};
  formAttrs.forEach(attr => { weights[attr] = raw[attr] / sum; });
  return weights;
}

// Builds { archKey: { star: { weights, n, level } } } for every archKey+star
// pair found among `players` — call once per pool/roster via useMemo, then
// look up per-player in computeScore (cheap, no recomputation).
export function buildWeightsMap(pool, players) {
  const map = {};
  const seen = new Set();
  (players || []).forEach(p => {
    if (!p.position || !p.archetype) return;
    const arch = normalizeArch(p.archetype);
    const archKey = `${p.position}_${arch}`;
    const star = String(p.stars ?? '');
    if (!star) return;
    const cacheKey = `${archKey}::${star}`;
    if (seen.has(cacheKey)) return;
    seen.add(cacheKey);

    const staticWeights = resolveWeights(p.position, arch);
    let entry = { weights: null, n: 0, level: 'none' };
    if (staticWeights) {
      const { samples, level, n } = resolveWeightSamples(pool, archKey, star);
      if (level !== 'none') {
        const formAttrs = getFormAttrs(p.position, arch);
        // Pearson correlation IS the weight once it's computable (>=2 distinct
        // dev-trait outcomes in this exact archetype+star bucket) — no blend
        // with the static defaults. Below that, static is the only option.
        const learned = computeLearnedWeights(samples, formAttrs);
        if (learned) entry = { weights: learned, n, level };
      }
    }
    map[archKey] ??= {};
    map[archKey][star] = entry;
  });
  return map;
}

export function getWeightsInfo(weightsMap, position, archetype, star) {
  const archKey = `${position}_${normalizeArch(archetype)}`;
  const entry = weightsMap?.[archKey]?.[String(star)];
  if (!entry || entry.level === 'none') return { learned: false, n: 0, level: 'static' };
  return { learned: true, n: entry.n, level: entry.level };
}

// On-demand version for browsing UIs (ThresholdLookup) keyed off a selected
// star tab rather than a specific player's own star rating.
export function getLearnedWeightsForDisplay(pool, position, archetype, star) {
  const arch = normalizeArch(archetype);
  const archKey = `${position}_${arch}`;
  const staticWeights = resolveWeights(position, arch);
  if (!staticWeights) return { learned: false, n: 0, level: 'static', weights: null };
  const { samples, level, n } = resolveWeightSamples(pool, archKey, star);
  if (level === 'none') return { learned: false, n: 0, level: 'static', weights: staticWeights };
  const formAttrs = getFormAttrs(position, arch);
  const learned = computeLearnedWeights(samples, formAttrs);
  if (!learned) return { learned: false, n, level: 'static', weights: staticWeights };
  return { learned: true, n, level, weights: learned };
}

// ── Tier profiles (badges + predictor reference data) ────────────────────
function percentile(arr, p) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// One dev-trait group's observed profile for an archetype/star — independent
// of whether the other three groups have any data yet.
export function getTierProfile(pool, position, archetype, star, devTrait, formAttrs) {
  const archKey = `${position}_${normalizeArch(archetype)}`;
  const { samples, level, n } = resolveDevTraitSamples(pool, archKey, star, devTrait);
  if (level === 'none') return null;
  const stats = {};
  const centroid = {};
  formAttrs.forEach(attr => {
    const vals = samples.map(p => p.attributes?.[attr]).filter(v => typeof v === 'number' && v > 0);
    if (vals.length) {
      stats[attr] = { min: Math.min(...vals), avg: vals.reduce((a, b) => a + b, 0) / vals.length, max: Math.max(...vals), p25: percentile(vals, 25) };
      centroid[attr] = stats[attr].avg;
    } else {
      stats[attr] = null;
      centroid[attr] = null;
    }
  });
  return { n, level, stats, centroid, samples };
}

export function getAllTierProfiles(pool, position, archetype, star, formAttrs) {
  const result = {};
  DEV_TRAITS.forEach(dt => {
    result[dt] = getTierProfile(pool, position, archetype, star, dt, formAttrs);
  });
  return result;
}

// ── Predicted Dev Trait (nearest-centroid suggestion for the scouting form) ─
// Shows a suggestion the moment ANY single dev-trait group has enough data —
// groups are independent, never gated on siblings being populated too.
export function predictDevTrait(pool, position, archetype, star, attributes, weightsMap) {
  const arch = normalizeArch(archetype);
  const formAttrs = getFormAttrs(position, arch);
  const profiles = getAllTierProfiles(pool, position, arch, star, formAttrs);
  const available = DEV_TRAITS.filter(dt => profiles[dt]);
  if (available.length === 0) return null;

  const archKey = `${position}_${arch}`;
  const weightEntry = weightsMap?.[archKey]?.[String(star)];
  const weights = weightEntry?.weights || resolveWeights(position, arch) || {};

  let best = null;
  available.forEach(dt => {
    const centroid = profiles[dt].centroid;
    let distSq = 0;
    formAttrs.forEach(attr => {
      const c = centroid[attr];
      if (c == null) return;
      const w = weights[attr] ?? 0;
      const v = attributes?.[attr] ?? 0;
      distSq += w * (v - c) * (v - c);
    });
    const dist = Math.sqrt(distSq);
    if (!best || dist < best.distance) {
      best = { devTrait: dt, distance: dist, n: profiles[dt].n, level: profiles[dt].level };
    }
  });

  return {
    closest: best.devTrait,
    distance: best.distance,
    n: best.n,
    level: best.level,
    availableGroups: available.length,
    groupCounts: Object.fromEntries(available.map(dt => [dt, profiles[dt].n])),
  };
}
