// This file used to also own a ~75-archetype hand-authored ARCHETYPE_WEIGHTS
// table, used as a static scoring fallback whenever no learned data existed
// yet. Removed — no hand-authored fallback, ever; a brand-new archetype/
// position/star combo with zero scouted history now grades on calcWeightedAvg
// (below) until real comps accumulate. Attribute weights are now derived
// entirely from devPrediction.js's separation-clarity computation.
//
// Circular import with devPrediction.js — this file imports
// predictHiddenDevBonus from there, and devPrediction.js imports normalizeArch
// from here. Safe because both sides only touch the other's export from
// inside a function body, never at module-evaluation time. (Other callers
// needing devPrediction.js's buildAttributeQualityMap/computeKnownTierStrength
// import them directly from '../utils/devPrediction', not through here.)
import { predictHiddenDevBonus } from '../utils/devPrediction';

// Normalize stored archetype name → a stable archetype key suffix.
// "Raw Strength (OT)" → "Raw Strength", "ATH - Thumper" → "Thumper"
export function normalizeArch(arch = '') {
  return arch.replace(/^ATH\s*-\s*/i, '').replace(/\s*\([A-Z]+\)\s*$/, '').trim();
}

// ── Full scoring engine (single shared copy — every page that shows a Scout
// Staff grade/composite score, from the Targets row badge to the Recruiting
// Database report to Program Outlook's roster tiers, calls this same
// function, so a given player always grades identically everywhere). ───────
export const DEV_BONUS  = { Elite: 20, Star: 10, Impact: 5, Normal: -10 };
export const STAR_BONUS = { '5': 3, '4': 2, '3': 1, '2': 0, '1': -1 };
// A Gem develops beyond what his attributes/dev trait alone suggest; a Bust
// develops below it. Sized like one strong physical-outlier attribute — a
// real, visible swing, but not enough on its own to flip a grade tier.
export const GEM_BUST_BONUS = { Gem: 5, Bust: -5 };
const PHYS_ATTRS = ['Speed', 'Acceleration', 'Strength', 'Agility', 'Change of Direction'];

// Top 5 most critical attributes per position (weighted 2× vs the rest) —
// used by calcWeightedAvg, the fallback base score when no archetype weight
// profile is registered for this player's position+archetype.
const PRIORITY_ATTRS = {
  QB:   ['Throw Power', 'Short Accuracy', 'Medium Accuracy', 'Deep Accuracy', 'Under Pressure'],
  HB:   ['Speed', 'Carrying', 'Juke Move', 'Break Tackle', 'BC Vision'],
  WR:   ['Speed', 'Catching', 'Catch In Traffic', 'Short Route', 'Medium Route'],
  TE:   ['Catching', 'Catch In Traffic', 'Run Block', 'Pass Block', 'Speed'],
  OT:   ['Pass Block', 'Run Block', 'Pass Block Power', 'Run Block Power', 'Pass Block Finesse'],
  OG:   ['Run Block', 'Pass Block', 'Run Block Power', 'Run Block Finesse', 'Pass Block Finesse'],
  C:    ['Run Block', 'Pass Block', 'Run Block Power', 'Pass Block Finesse', 'Awareness'],
  DE:   ['Block Shedding', 'Power Moves', 'Finesse Moves', 'Speed', 'Pursuit'],
  DT:   ['Block Shedding', 'Power Moves', 'Strength', 'Tackle', 'Pursuit'],
  OLB:  ['Play Recognition', 'Tackle', 'Man Coverage', 'Zone Coverage', 'Pursuit'],
  MIKE: ['Play Recognition', 'Tackle', 'Hit Power', 'Zone Coverage', 'Strength'],
  CB:   ['Man Coverage', 'Zone Coverage', 'Speed', 'Press', 'Change of Direction'],
  FS:   ['Zone Coverage', 'Man Coverage', 'Speed', 'Play Recognition', 'Catching'],
  SS:   ['Man Coverage', 'Tackle', 'Hit Power', 'Zone Coverage', 'Speed'],
  ATH:  ['Speed', 'Acceleration', 'Agility', 'Catching', 'Tackle'],
  FB:   ['Lead Block', 'Run Block', 'Trucking', 'Break Tackle', 'Carrying'],
  K:    ['Kick Power', 'Kick Accuracy', 'Awareness'],
  P:    ['Kick Power', 'Kick Accuracy', 'Awareness'],
};

export function isHiddenDev(d) { return !d || d === 'Hidden' || d === 'hidden' || d === ''; }

// Fallback base score when no archetype weight profile exists — every
// entered attribute counted once, doubled for this position's 5 most
// critical attributes, plus a small extra weight for the 5 uncoachable
// physical attributes.
export function calcWeightedAvg(player) {
  const attrs = player.attributes ?? {};
  const priority = PRIORITY_ATTRS[player.position] ?? [];
  let sum = 0, weight = 0;
  Object.entries(attrs).forEach(([k, v]) => {
    const posW = priority.includes(k) ? 2 : 1;
    const w = PHYS_ATTRS.includes(k) ? posW + 0.5 : posW;
    sum += v * w;
    weight += w;
  });
  return weight ? sum / weight : 0;
}

export function physOutlierBonus(player) {
  let b = 0;
  PHYS_ATTRS.forEach(k => {
    const v = player.attributes?.[k] ?? 0;
    if      (v >= 96) b += 5;
    else if (v >= 92) b += 2;
    else if (v >= 88) b += 0.5;
  });
  return b;
}

// A hidden dev trait is scored by PREDICTING a floor/ceiling range against
// Threshold Lookup's own revealed-recruit pool — walking tier boundaries
// within this exact position+archetype+star bucket only, never broadened —
// and folding the resulting confidence into one expected-value bonus (see
// devPrediction.js's predictFloorCeiling/blendDevBonus for the real
// mechanism). When there isn't a single comparable revealed recruit in this
// exact bucket, there's honestly nothing to predict from — trait stays null,
// bonus 0, rather than guessing from star rating/physical traits alone.
export function predictHiddenDev(player, weightsMap = null, pool = null) {
  return predictHiddenDevBonus(player, weightsMap, pool, DEV_BONUS);
}

// A Gem/Bust scouting read is a direct, deliberate signal about how the
// player will develop relative to what his attributes/dev trait alone
// predict — so it applies regardless of dev trait, hidden or revealed.
export function gemBustBonus(player) {
  return GEM_BUST_BONUS[player?.gemBust] ?? 0;
}

// weightsMap (optional): devPrediction.buildAttributeQualityMap(...) result —
// pass it through when the caller has a pool of revealed-dev-trait recruits,
// omit to always fall back to calcWeightedAvg's plain attribute average.
// pool (optional): devTraitLearning.buildRevealedPool(...) result — powers
// the Threshold-comparison hidden-dev prediction above; omit to always treat
// hidden-dev players as unpredictable (bonus 0).
export function computeScore(player, weightsMap = null, pool = null) {
  const devResult = isHiddenDev(player.devTrait)
    ? predictHiddenDev(player, weightsMap, pool)
    : { bonus: DEV_BONUS[player.devTrait] ?? 0 };
  const archBase = archetypeBaseScore(player, weightsMap);
  const base = archBase ?? calcWeightedAvg(player);
  return base + devResult.bonus + (STAR_BONUS[String(player.stars)] ?? 0) + physOutlierBonus(player) + gemBustBonus(player);
}

// Compute archetype-specific weighted base score using dynamically-learned
// attribute weights (devPrediction.buildAttributeQualityMap's output) —
// returns null when no learned weights exist yet for this exact
// position+archetype+star bucket (no more hand-authored static fallback);
// callers fall through to calcWeightedAvg in that case.
export function archetypeBaseScore(player, weightsMap = null) {
  const arch    = normalizeArch(player.archetype || '');
  const archKey = `${player.position}_${arch}`;
  const star    = String(player.stars ?? '');
  const weights = weightsMap?.[archKey]?.[star]?.weights;
  if (!weights) return null;
  let sum = 0;
  Object.entries(weights).forEach(([attr, w]) => {
    if (w > 0) sum += (player.attributes?.[attr] ?? 0) * w;
  });
  return sum;
}
