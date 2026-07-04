// This file used to also own a ~75-archetype hand-authored ARCHETYPE_WEIGHTS
// table, used as a static scoring fallback whenever no learned data existed
// yet. Removed — no hand-authored fallback, ever. A brand-new archetype/
// position/star combo widens to real comps at any star level within the same
// archetype (see devPrediction.js's ANY_STAR); if even that has zero comps,
// computeScore returns null rather than falling back to any hand-tuned
// formula — "can't grade without real data to compare against."
//
// Circular import with devPrediction.js — this file imports
// predictHiddenDevBonus from there, and devPrediction.js imports normalizeArch
// from here. Safe because both sides only touch the other's export from
// inside a function body, never at module-evaluation time. (Other callers
// needing devPrediction.js's buildAttributeQualityMap/computeKnownTierStrength
// import them directly from '../utils/devPrediction', not through here.)
import { predictHiddenDevBonus, ANY_STAR } from '../utils/devPrediction';

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

// A plain, unweighted-ish attribute average — no longer used as a substitute
// grade (see computeScore below). Kept only as the dimmed "Attr avg (all
// entered)" reference line shown alongside a real Learned Attribute Score,
// for context on how much the learned weighting shifted the number.
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

// weightsMap: devPrediction.buildAttributeQualityMap(...) result. pool:
// devTraitLearning.buildRevealedPool(...) result. Both required for a real
// score — without them there's nothing to compare against.
//
// Dev trait (known or predicted-hidden) deliberately does NOT add/subtract
// points here — folding it in meant a Hidden recruit was structurally scored
// against a partial, confidence-blended guess while a revealed recruit got
// the full flat bonus, which skewed the two groups against each other. Dev
// trait is still surfaced (badge, Floor/Ceiling, tier-strength) as
// informational context — see buildAnalysisText/predictHiddenDev — it just
// no longer moves the Composite Score.
//
// A flat "physical ceiling" bonus for elite Speed/Acceleration/Strength/
// Agility/Change of Direction readings used to live here too — removed. Not
// every position's scouting form even tracks all 5 (a Fullback's form only
// has Strength; a QB's or WR's only has Speed/Acceleration), so the bonus
// gave DBs and ATH recruits several times more ways to earn it than a QB,
// WR, or FB could ever reach, independent of how physically gifted they
// actually were — an unfair structural artifact of the forms, not a real
// signal.
//
// Returns null when the recruit genuinely can't be graded — no comps exist
// for this archetype at any star level, so there's nothing real to compare
// his attributes against. No hand-authored formula steps in for that case
// (the old calcWeightedAvg fallback used to); callers show "-" instead.
export function computeScore(player, weightsMap = null, pool = null) {
  const archBase = archetypeBaseScore(player, weightsMap);
  if (archBase === null) return null;
  return archBase + (STAR_BONUS[String(player.stars)] ?? 0) + gemBustBonus(player);
}

// Compute archetype-specific weighted base score using dynamically-learned
// attribute weights (devPrediction.buildAttributeQualityMap's output).
// Tries the exact position+archetype+star bucket first; if that has zero
// comps, widens to the same archetype across ANY star level (still a fair
// comparison — same attribute list either way, see devPrediction.js's
// widenPoolAcrossStars). Returns null when neither has any real data (no
// peers to compare against) OR when the player himself hasn't actually been
// scouted yet — a missing attribute silently reads as 0 in the weighted sum
// below, which used to score an un-scouted Targets recruit as a flat 0-ish
// composite (an automatic F) instead of "not scored yet." Requiring real
// attributes on file before scoring at all closes that gap.
export function archetypeBaseScore(player, weightsMap = null) {
  if (!player.attributes || Object.keys(player.attributes).length === 0) return null;
  const arch    = normalizeArch(player.archetype || '');
  const archKey = `${player.position}_${arch}`;
  const star    = String(player.stars ?? '');
  const weights = weightsMap?.[archKey]?.[star]?.weights ?? weightsMap?.[archKey]?.[ANY_STAR]?.weights;
  if (!weights) return null;
  let sum = 0;
  Object.entries(weights).forEach(([attr, w]) => {
    if (w > 0) sum += (player.attributes?.[attr] ?? 0) * w;
  });
  return sum;
}

// Visible confidence label for the Learned Attribute Score, separate from
// the number itself — a bucket that JUST barely qualifies for a score (one
// boundary, reached only via the any-star widening) renders identically to
// one built from a well-populated exact-star bucket otherwise. Combines the
// two signals already on hand: how many of the 3 possible tier boundaries
// had real 2-sided data, and whether the exact star bucket sufficed or the
// widened any-star fallback was needed (a softer, less precise match).
// Returns null right alongside computeScore's null — nothing to rate the
// confidence of if there's no score at all.
export function getScoreConfidence(player, weightsMap = null) {
  const arch    = normalizeArch(player.archetype || '');
  const archKey = `${player.position}_${arch}`;
  const star    = String(player.stars ?? '');
  const exact   = weightsMap?.[archKey]?.[star];
  const widened = weightsMap?.[archKey]?.[ANY_STAR];
  const entry   = exact?.weights ? exact : (widened?.weights ? widened : null);
  if (!entry) return null;
  const usedWidening = !exact?.weights;
  const boundariesUsed = entry.boundariesUsed ?? 0;
  const strength = Math.max(0, boundariesUsed - (usedWidening ? 1 : 0));
  const level = strength >= 2 ? 'Strong' : strength === 1 ? 'Limited' : 'Thin';
  return { level, usedWidening, boundariesUsed };
}
