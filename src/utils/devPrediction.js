// Orchestrates separationClarity.js's math over the real bucket shape
// (position+archetype+star -> dev-trait tier -> revealed comps) to produce:
//   1. attribute weights for the "attribute quality" score component
//   2. hidden dev trait floor/ceiling + confidence prediction
//   3. a known-dev player's "how strong an example of their own tier" read
//   4. the expected-value blend that folds a prediction into one score number
//
// Every one of these ONLY ever compares within the exact position+archetype+
// star bucket — never broadened to other stars/archetypes/positions. When a
// bucket doesn't have enough real data, the honest answer is "not enough data
// yet," never a fabricated fallback.
//
// Circular import with archetypeWeights.js (it imports predictHiddenDevBonus/
// buildAttributeQualityMap/computeKnownTierStrength from here; this file
// imports normalizeArch from there) — safe for the same reason already
// documented between archetypeWeights.js and devTraitLearning.js: both sides
// only touch the other's export from inside a function body, never at
// module-evaluation time.
import { normalizeArch } from '../components/archetypeWeights';
import { getAllTierProfiles, getFormAttrs } from './devTraitLearning';
import { computeSeparationClarity, computeLean, aggregateLeans } from './separationClarity';
import { positionBucket } from './recruitAttributes';

// Low -> high canonical order. A player's actual possible outcomes may be a
// restricted subset of this (see restrictLadder) — everything below walks
// whatever ladder it's given, never assumes the full 4 tiers.
const FULL_LADDER = ['Normal', 'Impact', 'Star', 'Elite'];

// Confidence needed to call a tier boundary "cleared." Placeholder — tune once
// real dynasty data is available to see how these numbers actually distribute.
export const CLEARED_THRESHOLD = 0.5;

// Deliberately modest — a single comp is barely evidence at all, so even a
// clean "beats the lone comp on every recorded attribute" read stays well
// short of the confidence a real multi-comp boundary can earn.
export const SINGLE_COMP_CONFIDENCE = 0.58;

// A Gem can never reveal as Normal; a Bust can never reveal as Elite. Removing
// the tier from the ladder BEFORE any walking happens means the excluded tier
// structurally can never become a floor/ceiling candidate — no separate
// clamping step needed anywhere else in this file.
export function restrictLadder(gemBust) {
  if (gemBust === 'Gem') return FULL_LADDER.filter(t => t !== 'Normal');
  if (gemBust === 'Bust') return FULL_LADDER.filter(t => t !== 'Elite');
  return FULL_LADDER;
}

function adjacentPairs(ladder) {
  const pairs = [];
  for (let i = 0; i < ladder.length - 1; i++) pairs.push([ladder[i], ladder[i + 1]]);
  return pairs;
}

// Pull a { min, max } range for one attribute out of getTierProfile's stats.
function attrRange(profile, attr) {
  const s = profile?.stats?.[attr];
  if (!s) return null;
  return { min: s.min, max: s.max };
}

// Pseudo-star key used only for the archetype-wide widening below — never a
// real recruit's star rating, so it can't collide with an actual '1'-'5' key.
export const ANY_STAR = '__any__';

// Merges every real star bucket for one archKey into a single ANY_STAR bucket
// (same {devTrait: [players...]} shape resolveDevTraitSamples/getTierProfile
// already expect), so the exact same separation-clarity machinery can walk it
// unmodified — this widens WHICH ATTRIBUTES MATTER for an archetype across
// star levels, it never touches a player's own attribute values or the
// Star Rating Bonus, both of which are what actually keep a 1★ grading lower
// than a 4★ at the same archetype.
function widenPoolAcrossStars(pool, archKey) {
  const merged = {};
  Object.values(pool[archKey] || {}).forEach(devTraitBuckets => {
    Object.entries(devTraitBuckets).forEach(([devTrait, samples]) => {
      merged[devTrait] = (merged[devTrait] || []).concat(samples);
    });
  });
  return { [archKey]: { [ANY_STAR]: merged } };
}

// ── Use #1: attribute weights ────────────────────────────────────────────────
// NOT gem/bust-scoped — "which attributes matter for this archetype" is a
// property of the bucket, not of any one player's scouting read. Always walks
// the FULL ladder regardless of which player eventually consumes the weights.
export function computeAttributeQuality(pool, position, archetype, star, formAttrs) {
  const profiles = getAllTierProfiles(pool, position, archetype, star, formAttrs);
  const pairs = adjacentPairs(FULL_LADDER);
  const perAttrClaritySum = {};
  formAttrs.forEach(attr => { perAttrClaritySum[attr] = 0; });
  let boundariesUsed = 0;

  pairs.forEach(([lower, upper]) => {
    const lowerProfile = profiles[lower];
    const upperProfile = profiles[upper];
    if (!lowerProfile || !upperProfile) return; // need real 2-sided data, never broaden
    boundariesUsed++;
    formAttrs.forEach(attr => {
      const lr = attrRange(lowerProfile, attr);
      const ur = attrRange(upperProfile, attr);
      if (!lr || !ur) return;
      perAttrClaritySum[attr] += computeSeparationClarity(lr, ur);
    });
  });

  if (boundariesUsed === 0) return { weights: null, boundariesUsed: 0 };
  const totalClarity = Object.values(perAttrClaritySum).reduce((a, b) => a + b, 0);
  if (totalClarity <= 0) return { weights: null, boundariesUsed };
  const weights = {};
  formAttrs.forEach(attr => { weights[attr] = perAttrClaritySum[attr] / totalClarity; });
  return { weights, boundariesUsed };
}

// Same outer cache shape as the old buildWeightsMap ({archKey: {star: {...}}})
// so callers' useMemo patterns don't change, only what's inside each entry.
// Also computes one ANY_STAR entry per archKey — the widened, any-star
// fallback archetypeBaseScore reaches for when the exact star bucket has zero
// comps (see widenPoolAcrossStars above for why this is still fair).
export function buildAttributeQualityMap(pool, players) {
  const map = {};
  const seen = new Set();
  const anyStarDone = new Set();
  (players || []).forEach(p => {
    if (!p.position || !p.archetype) return;
    const arch = normalizeArch(p.archetype);
    // Bucketed position, not raw — must match buildRevealedPool's own
    // bucketed archKey (the `pool` this reads from) and archetypeWeights.js's
    // archetypeBaseScore/getScoreConfidence (the readers of THIS map's
    // output). Raw p.position ("LT"/"SAM"/"NT"/etc.) never found a match in
    // either direction for any multi-alias position.
    const pos = positionBucket(p.position);
    const archKey = `${pos}_${arch}`;
    const star = String(p.stars ?? '');
    if (!star) return;
    const cacheKey = `${archKey}::${star}`;
    if (!seen.has(cacheKey)) {
      seen.add(cacheKey);
      const formAttrs = getFormAttrs(pos, arch);
      const { weights, boundariesUsed } = computeAttributeQuality(pool, pos, arch, star, formAttrs);
      map[archKey] ??= {};
      map[archKey][star] = { weights, boundariesUsed };
    }

    if (!anyStarDone.has(archKey)) {
      anyStarDone.add(archKey);
      const formAttrs = getFormAttrs(pos, arch);
      const widened = widenPoolAcrossStars(pool, archKey);
      const { weights, boundariesUsed } = computeAttributeQuality(widened, pos, arch, ANY_STAR, formAttrs);
      map[archKey] ??= {};
      map[archKey][ANY_STAR] = { weights, boundariesUsed };
    }
  });
  return map;
}

// ── Use #2: hidden dev trait floor/ceiling prediction ────────────────────────

// Weak, conservative single-comp read: naive direct comparison against the one
// known player in this bucket (not the full separation-clarity machinery,
// which needs 2 comps at different tiers to compute a gap at all).
function singleCompRead(compTier, compProfile, player, formAttrs, ladder) {
  const comp = compProfile.samples[0];
  let better = 0, worse = 0, total = 0;
  formAttrs.forEach(attr => {
    const compVal = comp.attributes?.[attr];
    const playerVal = player.attributes?.[attr];
    if (compVal == null || playerVal == null) return;
    total++;
    if (playerVal > compVal) better++;
    else if (playerVal < compVal) worse++;
  });
  if (total === 0) {
    return { status: 'no-data', floorTier: null, floorConfidence: null, ceilingTier: null, ceilingUndifferentiated: false, perBoundary: [], source: null };
  }

  const ladderIdx = ladder.indexOf(compTier);
  const beatsComp = better >= worse;
  if (beatsComp) {
    return {
      status: 'single-comp',
      floorTier: compTier,
      floorConfidence: SINGLE_COMP_CONFIDENCE,
      ceilingTier: null, // open — nothing above this bucket's one comp to compare against
      ceilingUndifferentiated: ladderIdx < ladder.length - 2, // more than one tier open above
      perBoundary: [],
      source: 'single-comp',
    };
  }
  return {
    status: 'single-comp',
    floorTier: ladder[0],
    floorConfidence: null,
    ceilingTier: compTier,
    ceilingUndifferentiated: false,
    perBoundary: [],
    source: 'single-comp',
  };
}

// The full mechanism. Never broadens beyond this exact position+archetype+star
// bucket — a thin bucket just produces a thin/absent prediction, honestly.
export function predictFloorCeiling(pool, position, archetype, star, player, formAttrs) {
  const ladder = restrictLadder(player.gemBust);
  const profiles = getAllTierProfiles(pool, position, archetype, star, formAttrs);
  const populated = ladder.filter(t => profiles[t] && profiles[t].n > 0);

  if (populated.length === 0) {
    return { status: 'no-data', floorTier: null, floorConfidence: null, ceilingTier: null, ceilingUndifferentiated: false, perBoundary: [], source: null };
  }

  const totalComps = populated.reduce((sum, t) => sum + profiles[t].n, 0);
  if (totalComps === 1) {
    return singleCompRead(populated[0], profiles[populated[0]], player, formAttrs, ladder);
  }

  // Walk every ADJACENT pair in the restricted ladder that has real 2-sided
  // data. A gap in the middle (e.g. Normal and Star both populated but not
  // Impact) correctly produces no usable boundary — that's "same-tier-only"
  // territory, not a license to compare non-adjacent tiers directly.
  const perBoundary = [];
  adjacentPairs(ladder).forEach(([lower, upper]) => {
    const lp = profiles[lower], up = profiles[upper];
    if (!lp || !up) return;
    const entries = formAttrs
      .map(attr => {
        const lr = attrRange(lp, attr), ur = attrRange(up, attr);
        if (!lr || !ur) return null;
        const clarity = computeSeparationClarity(lr, ur);
        const value = player.attributes?.[attr] ?? 0;
        return { attr, lean: computeLean(value, lr, ur), clarity };
      })
      .filter(Boolean);
    if (!entries.length) return;
    const { confidence } = aggregateLeans(entries);
    if (confidence == null) return;
    perBoundary.push({ lower, upper, confidence, n_lower: lp.n, n_upper: up.n });
  });

  if (perBoundary.length === 0) {
    return { status: 'same-tier-only', floorTier: null, floorConfidence: null, ceilingTier: null, ceilingUndifferentiated: false, perBoundary: [], source: null };
  }

  // Floor = highest boundary confidently cleared; ceiling = the first boundary
  // NOT cleared above that (open if every boundary with data is cleared).
  let floorTier = ladder[0];
  let floorConfidence = null;
  let ceilingTier = null;
  for (const b of perBoundary) {
    if (b.confidence >= CLEARED_THRESHOLD) {
      floorTier = b.upper;
      floorConfidence = b.confidence;
    } else {
      ceilingTier = b.upper;
      break;
    }
  }

  return { status: 'resolved', floorTier, floorConfidence, ceilingTier, ceilingUndifferentiated: false, perBoundary, source: 'boundary-walk' };
}

// Two-pill display shape for predictFloorCeiling's output — e.g.
// { floorLabel: 'Impact', floorPct: 66, ceilingLabel: 'Star/Elite', ceilingPct: 34 }.
// Purely a display split of the same confidence number; the Composite Score
// no longer folds dev trait in at all (see archetypeWeights.computeScore), so
// this has no arithmetic relationship to the grade — it's shown for context
// only. Returns null when there isn't a real confidence number to split
// (no-data/same-tier-only, or a single-comp bucket with nothing to compare).
export function describeFloorCeilingPills(result, gemBust) {
  const { status, floorTier, floorConfidence, ceilingTier } = result;
  if (status !== 'resolved' && status !== 'single-comp') return null;

  // Fell short of the lone comp in the bucket — singleCompRead has no real
  // confidence number for this case (nothing to compute a gap from yet), so
  // this mirrors blendDevBonus's own even-split treatment of the same case.
  if (status === 'single-comp' && floorConfidence == null) {
    if (floorTier == null || ceilingTier == null) return null;
    return { floorLabel: floorTier, floorPct: 50, ceilingLabel: ceilingTier, ceilingPct: 50 };
  }

  if (floorConfidence == null) return null;
  const floorPct = Math.round(floorConfidence * 100);
  const ceilingPct = 100 - floorPct;

  let ceilingLabel = ceilingTier;
  if (!ceilingLabel) {
    const ladder = restrictLadder(gemBust);
    const above = ladder.slice(ladder.indexOf(floorTier) + 1);
    if (!above.length) return null; // floor is already the top of the ladder — nothing to show as a ceiling
    ceilingLabel = above.join('/');
  }

  return { floorLabel: floorTier, floorPct, ceilingLabel, ceilingPct };
}

// ── Use #3: known-dev "strength within tier" ─────────────────────────────────
export function computeKnownTierStrength(pool, position, archetype, star, player, formAttrs) {
  const tier = player.devTrait;
  const idx = FULL_LADDER.indexOf(tier);
  if (idx === -1) return { tier, leanToUpper: null, leanToLower: null, label: tier };

  const profiles = getAllTierProfiles(pool, position, archetype, star, formAttrs);
  const ownProfile = profiles[tier];
  let leanToUpper = null, leanToLower = null;

  const upperTier = FULL_LADDER[idx + 1];
  if (upperTier && ownProfile && profiles[upperTier]) {
    const entries = formAttrs
      .map(attr => {
        const lr = attrRange(ownProfile, attr), ur = attrRange(profiles[upperTier], attr);
        if (!lr || !ur) return null;
        const clarity = computeSeparationClarity(lr, ur);
        const value = player.attributes?.[attr] ?? 0;
        return { attr, lean: computeLean(value, lr, ur), clarity };
      })
      .filter(Boolean);
    if (entries.length) leanToUpper = aggregateLeans(entries).confidence;
  }

  const lowerTier = FULL_LADDER[idx - 1];
  if (lowerTier && ownProfile && profiles[lowerTier]) {
    const entries = formAttrs
      .map(attr => {
        const lr = attrRange(profiles[lowerTier], attr), ur = attrRange(ownProfile, attr);
        if (!lr || !ur) return null;
        const clarity = computeSeparationClarity(lr, ur);
        const value = player.attributes?.[attr] ?? 0;
        return { attr, lean: computeLean(value, lr, ur), clarity };
      })
      .filter(Boolean);
    if (entries.length) leanToLower = aggregateLeans(entries).confidence;
  }

  let label = tier;
  if (leanToUpper != null && leanToUpper >= 0.6) label = `${tier} — leaning ${upperTier}-caliber attributes`;
  else if (leanToLower != null && leanToLower <= 0.4) label = `${tier} — borderline with ${lowerTier}`;

  return { tier, leanToUpper, leanToLower, label };
}

// ── Use #4: fold a prediction into one composite-score number ───────────────
// Expected-value blend (confirmed "Option 2"): each candidate tier's bonus
// weighted by its confidence, summed — confidence directly shapes the score,
// not just a caption next to it.
export function blendDevBonus(floorCeilingResult, devBonusTable) {
  const { status, floorTier, floorConfidence, ceilingTier, perBoundary } = floorCeilingResult;

  if (status === 'no-data' || status === 'same-tier-only') return 0;

  if (status === 'single-comp') {
    if (floorTier == null) return 0;
    if (ceilingTier != null) {
      // Fell short of the lone comp — split evenly between the ladder floor
      // and the comp's own tier; no data at all to weight this more precisely.
      const lowBonus = devBonusTable[floorTier] ?? 0;
      const highBonus = devBonusTable[ceilingTier] ?? 0;
      return (lowBonus + highBonus) / 2;
    }
    // Beat the comp — blend the modest single-comp confidence toward floorTier,
    // remaining mass toward the next tier up as a stand-in for the open ceiling.
    const nextIdx = FULL_LADDER.indexOf(floorTier) + 1;
    const nextTier = FULL_LADDER[nextIdx] ?? floorTier;
    const floorBonus = devBonusTable[floorTier] ?? 0;
    const nextBonus = devBonusTable[nextTier] ?? floorBonus;
    return floorConfidence * floorBonus + (1 - floorConfidence) * nextBonus;
  }

  // 'resolved': distribute confidence mass across every candidate tier in the
  // chain. P(bottom tier) = 1 - conf(boundary_0); P(tier_i) = cleared everything
  // below it * (1 - conf(boundary_i)); P(top tier) = cleared every boundary.
  if (!perBoundary.length) return devBonusTable[floorTier] ?? 0;

  const tiers = [perBoundary[0].lower, ...perBoundary.map(b => b.upper)];
  const confidences = perBoundary.map(b => b.confidence);
  const probs = [];
  let clearedSoFar = 1;
  for (let i = 0; i < confidences.length; i++) {
    probs.push(clearedSoFar * (1 - confidences[i]));
    clearedSoFar *= confidences[i];
  }
  probs.push(clearedSoFar);

  let expected = 0;
  tiers.forEach((tier, i) => {
    expected += (probs[i] ?? 0) * (devBonusTable[tier] ?? 0);
  });
  return expected;
}

// Single entry point archetypeWeights.js's predictHiddenDev wraps — resolves
// archetype/formAttrs internally so the caller only has to pass the raw player.
export function predictHiddenDevBonus(player, weightsMap, pool, devBonusTable) {
  if (!pool) {
    return { trait: null, bonus: 0, source: 'no-data', floorTier: null, floorConfidence: null, ceilingTier: null, ceilingUndifferentiated: false, perBoundary: [], n: 0 };
  }
  const arch = normalizeArch(player.archetype || '');
  // Bucketed, not raw — see buildAttributeQualityMap's comment above for why.
  const pos = positionBucket(player.position);
  const formAttrs = getFormAttrs(pos, arch);
  const result = predictFloorCeiling(pool, pos, arch, String(player.stars ?? ''), player, formAttrs);
  const bonus = blendDevBonus(result, devBonusTable);
  const lastBoundary = result.perBoundary?.[result.perBoundary.length - 1];
  return {
    trait: result.floorTier,
    bonus,
    source: result.status,
    floorTier: result.floorTier,
    floorConfidence: result.floorConfidence,
    ceilingTier: result.ceilingTier,
    ceilingUndifferentiated: result.ceilingUndifferentiated,
    perBoundary: result.perBoundary,
    n: lastBoundary ? lastBoundary.n_upper : 0,
  };
}
