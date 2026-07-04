// The core computation the whole redesigned scoring/prediction engine is built
// on, used four separate ways (see devPrediction.js): deriving attribute
// weights, predicting a hidden dev trait's floor/ceiling, reading how strong an
// example of their own tier a known-dev player is, and folding a prediction's
// confidence into one composite-score number.
//
// This file is intentionally dependency-free — it knows nothing about players,
// positions, archetypes, or pools. A "range" is always the caller's problem to
// produce from real getTierProfile stats; this file only ever sees plain
// { min, max } numbers. That keeps it trivial to reason about and test in
// isolation with hand-picked numbers, independent of how the bucket data was
// gathered.

// Separation clarity never drops all the way to 0 — an attribute with heavy
// tier overlap is discounted heavily, not fully excluded. A real counterexample
// (one recruit whose attribute value contradicts the "trend") should shrink
// that attribute's influence, not erase it, since the overall pattern across
// many attributes can still be real even when a few are individually noisy.
export const MIN_CLARITY = 0.05;

// How cleanly a lower tier's observed range and an upper tier's observed range
// split apart. gap = upperRange.min - lowerRange.max:
//   - big positive gap (clean split, no overlap)  -> clarity near 1
//   - gap == 0 (ranges just touch)                -> clarity ~0.5
//   - negative gap (ranges overlap)                -> clarity pulled down
//     toward MIN_CLARITY as the overlap deepens, never reaching exactly 0
// Normalized by the combined spread of both ranges so attributes on very
// different scales (a 2-point gap vs. a 20-point gap) produce comparable
// clarity values instead of raw gap size dominating the comparison.
export function computeSeparationClarity(lowerRange, upperRange) {
  const gap = upperRange.min - lowerRange.max;
  const combinedSpread = Math.max(1, upperRange.max - lowerRange.min);
  const normalized = gap / combinedSpread; // roughly -1..1 in practice
  const scaled = 0.5 + normalized * 0.5;   // touching (gap=0) -> 0.5, full-spread gap -> ~1
  return Math.max(MIN_CLARITY, Math.min(1, scaled));
}

// Where a specific value falls on the axis between the two ranges — 0 = fully
// lower-tier-like, 1 = fully upper-tier-like. The "ambiguous zone" to
// interpolate across is normally the gap [lowerRange.max, upperRange.min]; when
// the ranges overlap instead, it's the overlap region itself — either way the
// axis direction is preserved (a higher value always leans more upper), so
// this stays well-defined under overlap rather than treating it as an error.
export function computeLean(value, lowerRange, upperRange) {
  const zoneLow = Math.min(lowerRange.max, upperRange.min);
  const zoneHigh = Math.max(lowerRange.max, upperRange.min);
  if (value <= zoneLow) return 0;
  if (value >= zoneHigh) return 1;
  if (zoneHigh === zoneLow) return 0.5;
  return (value - zoneLow) / (zoneHigh - zoneLow);
}

// Method 1 (confirmed over raw vote-counting): weighted average of every
// attribute's lean, weight = that attribute's separation clarity. A handful of
// noisy, heavily-overlapping attributes can never outvote one genuinely clean,
// decisive one, since their contribution is scaled down by clarity rather than
// counted as a full vote regardless of how weak the lean actually was.
//
// Doubles as attribute-weight derivation: the same clarity values, normalized
// to sum to 1, ARE the attribute weights for this boundary — an attribute that
// clearly separates two tiers is, by definition, one that matters for grading.
export function aggregateLeans(entries) {
  // entries: [{ attr, lean, clarity }]
  if (!entries.length) return { confidence: null, weights: {} };
  const totalClarity = entries.reduce((sum, e) => sum + e.clarity, 0);
  if (totalClarity <= 0) return { confidence: null, weights: {} };
  const confidence = entries.reduce((sum, e) => sum + e.lean * e.clarity, 0) / totalClarity;
  const weights = {};
  entries.forEach(e => { weights[e.attr] = e.clarity / totalClarity; });
  return { confidence, weights };
}
