// Builds the revealed-dev-trait recruit pool and per-tier attribute profiles
// used by devPrediction.js's separation-clarity engine (attribute weights,
// hidden-dev floor/ceiling prediction, known-dev tier-strength, and Threshold
// Lookup's tier cards all read from the same `getAllTierProfiles` output).
//
// Every bucket is scoped to the exact archetype + exact star level — star
// levels are never pooled together (a 4-star recruit never informs the 3-star
// tier and vice versa), and ATH archetypes are never pooled with the position
// they borrow static weights from (the bucket key is the player's own
// position+archetype, so ATH_Contact Seeker and HB_Contact Seeker are
// naturally separate pools). MIN_N = 1: a single scouted player at an
// archetype+star is enough to seed a baseline profile for that dev trait —
// devPrediction.js's own confidence math is what decides how much a thin
// profile should actually be trusted, not a gate here.

import { normalizeArch } from '../components/archetypeWeights';
import { RECRUIT_FORM_OVERRIDES, BASE_POSITION_CONFIG } from '../components/ScoutingReport';

export const DEV_TRAITS = ['Elite', 'Star', 'Impact', 'Normal'];
export const MIN_N = 1;

function isHiddenDevTrait(d) {
  return !d || d === 'Hidden' || d === 'hidden' || d === '';
}

// Resolve the exact attribute list a player at pos/arch actually has stored —
// matching the scouting form's input order. BASE_POSITION_CONFIG covers every
// position, so this always resolves to a real list.
export function getFormAttrs(pos, arch) {
  if (RECRUIT_FORM_OVERRIDES[arch]) return RECRUIT_FORM_OVERRIDES[arch];
  const withSuffix = `${arch} (${pos})`;
  if (RECRUIT_FORM_OVERRIDES[withSuffix]) return RECRUIT_FORM_OVERRIDES[withSuffix];
  const withAth = `ATH - ${arch}`;
  if (RECRUIT_FORM_OVERRIDES[withAth]) return RECRUIT_FORM_OVERRIDES[withAth];
  return BASE_POSITION_CONFIG[pos] ?? [];
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

// Badge/predictor bucket: one specific dev trait group, independent of the
// other three groups — each group qualifies (or doesn't) entirely on its own.
function resolveDevTraitSamples(pool, archKey, star, devTrait) {
  const exact = pool[archKey]?.[star]?.[devTrait] || [];
  return exact.length >= MIN_N ? { samples: exact, level: 'star', n: exact.length } : { samples: [], level: 'none', n: 0 };
}

// ── Tier profiles (feeds devPrediction.js AND Threshold Lookup's tier cards) ─
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

// ── Confidence-gap calculator — shared by Threshold Lookup's "Key" panel and
// History's per-archetype confidence badge ───────────────────────────────────
// A "boundary" is one adjacent pair of dev-trait tiers (Normal|Impact,
// Impact|Star, Star|Elite) where BOTH sides have at least one real revealed
// comp (MIN_N = 1 — a single scouted+revealed recruit is enough to seed a
// tier). "Strong" confidence needs 2 of the 3 boundaries satisfied within the
// exact position+archetype+star bucket.
const CONFIDENCE_LADDER = ['Normal', 'Impact', 'Star', 'Elite'];
const CONFIDENCE_PAIRS = [['Normal', 'Impact'], ['Impact', 'Star'], ['Star', 'Elite']];

export function countBoundaries(populatedSet) {
  return CONFIDENCE_PAIRS.filter(([a, b]) => populatedSet.has(a) && populatedSet.has(b)).length;
}

function kCombinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  return [
    ...kCombinations(rest, k - 1).map(c => [first, ...c]),
    ...kCombinations(rest, k),
  ];
}

// Minimum additional dev-trait tiers (each needing just 1 revealed recruit)
// that would push a bucket from its current tier coverage to "Strong" (2
// boundaries). Returns EVERY minimal-size combo that works, not just the
// first one found — e.g. with Impact+Star already populated (1 boundary),
// adding Normal (completes Normal|Impact) and adding Elite (completes
// Star|Elite) are BOTH independently sufficient. Returns { count: 0, options:
// [] } if already Strong.
export function gapToStrong(populatedTiers) {
  const have = new Set(populatedTiers);
  if (countBoundaries(have) >= 2) return { count: 0, options: [] };
  const missing = CONFIDENCE_LADDER.filter(t => !have.has(t));
  for (let size = 1; size <= missing.length; size++) {
    const options = kCombinations(missing, size).filter(combo => {
      const test = new Set([...have, ...combo]);
      return countBoundaries(test) >= 2;
    });
    if (options.length > 0) return { count: size, options };
  }
  return { count: missing.length, options: [missing] };
}

// Which dev-trait tiers currently have at least one revealed comp for an
// exact position+archetype+star bucket — the input `gapToStrong` needs.
export function populatedTiersFor(pool, position, archetype, star) {
  const archKey = `${position}_${normalizeArch(archetype)}`;
  const byTrait = pool[archKey]?.[star] || {};
  return DEV_TRAITS.filter(dt => (byTrait[dt]?.length || 0) >= MIN_N);
}
