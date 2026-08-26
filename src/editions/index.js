// Game-edition registry.
//
// One dynasty belongs to one game edition (CFB 26, CFB 27, …). The
// edition selects a config bundle of feature flags + game-rule constants.
// The shared pages/components read values from that bundle — they never
// branch on the edition key directly — so adding a new edition is a
// data-only change (drop in a new bundle, register it here).
//
// Two distinct "default" concepts, kept separate ON PURPOSE:
//
//   LEGACY_EDITION  — what an UNTAGGED dynasty resolves to. Every dynasty
//                     created before this system shipped has no
//                     `gameEdition` field; they are all CFB 26. This must
//                     NEVER change, or old saves would silently switch
//                     rules under the user.
//
//   DEFAULT_EDITION — what a NEW dynasty is pre-selected to in the Create
//                     form. This is a UI default and may move over time
//                     (e.g. flip to cfb27 once that content is ready).
//
// They answer different questions and are wired to different call sites —
// DEFAULT_EDITION moved to 'cfb27' once PC auto-sync made it the primary
// experience; LEGACY_EDITION stays 'cfb26' forever, independent of that.

import cfb26 from './cfb26'
import cfb27 from './cfb27'

export const LEGACY_EDITION = 'cfb26'
export const DEFAULT_EDITION = 'cfb27'

// Raw edition definitions, keyed by edition key. Each may declare
// `extends` to inherit from another edition (resolved below).
const RAW_EDITIONS = {
  cfb26,
  cfb27,
}

// Deep-merge plain objects (later wins). Arrays and primitives are
// replaced wholesale; nested plain objects are merged key-by-key. This is
// what lets a child edition override one flag without redeclaring the rest.
function deepMerge(base, override) {
  if (!isPlainObject(base) || !isPlainObject(override)) return override
  const out = { ...base }
  for (const key of Object.keys(override)) {
    out[key] = deepMerge(base[key], override[key])
  }
  return out
}

function isPlainObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v)
}

// Resolve an edition's full config by walking its `extends` chain from the
// base down, deep-merging each level. cfb27 (extends cfb26) yields cfb26's
// bundle with cfb27's overrides applied; a future cfb28 (extends cfb27)
// would inherit the whole chain.
function resolveConfig(key, seen = new Set()) {
  const raw = RAW_EDITIONS[key]
  if (!raw) return null
  if (seen.has(key)) {
    // Defensive: a cyclic extends chain would otherwise loop forever.
    console.warn(`[editions] cyclic extends detected at "${key}"`)
    return { ...raw, extends: null }
  }
  seen.add(key)
  if (!raw.extends) return raw
  const parent = resolveConfig(raw.extends, seen)
  return deepMerge(parent, raw)
}

// Fully-resolved config bundles, computed once at module load.
export const EDITION_CONFIGS = Object.fromEntries(
  Object.keys(RAW_EDITIONS).map((key) => [key, resolveConfig(key)])
)

// Editions list for pickers, in release order (oldest first).
export const EDITIONS = Object.values(EDITION_CONFIGS).sort(
  (a, b) => (a.releaseYear || 0) - (b.releaseYear || 0)
)

// Normalize an arbitrary stored value to a known edition key, falling
// back to the legacy edition. Centralizing this means a corrupt/unknown
// `gameEdition` can never crash a screen — it just reads as cfb26.
export function normalizeEditionKey(value) {
  return EDITION_CONFIGS[value] ? value : LEGACY_EDITION
}

// The canonical resolver: given a dynasty (or null), return its edition
// KEY. Absence of `gameEdition` → LEGACY_EDITION. This one line is the
// entire backward-compatibility guarantee for old saves.
export function getEditionKey(dynasty) {
  return normalizeEditionKey(dynasty?.gameEdition)
}

// Is this dynasty a PC (auto-sync) dynasty? A CFB27 dynasty can be played on
// Console OR PC — only PC has an actual save file to sync from, so ALL of the
// "Sync from Save"-derived behavior (auto-filled schedule/ratings/recruiting,
// the Edit-button removals, the Sportsbook/Gameday Picks power model, the
// sync-only nav pages, etc.) must gate on this, never on edition alone.
//
// OPT-IN, NOT OPT-OUT. This requires an explicit `platform: 'pc'`; anything
// else — including a missing `platform` — is treated as console/manual. That
// direction is deliberate and must not be inverted:
//
//   • DEFAULT_EDITION is 'cfb27', so essentially every dynasty in the wild
//     resolves to CFB 27, and none created before the Console/PC selector
//     shipped carries a `platform` field at all.
//   • PC auto-sync has never existed in production, so a dynasty with no
//     `platform` is by definition someone tracking a console dynasty by hand.
//   • If a missing `platform` read as PC, every one of those dynasties would
//     silently flip into auto-sync mode: manual entry to-dos replaced by
//     read-only links, Edit buttons removed, sync-only nav pages appearing —
//     i.e. their existing workflow would break with no action on their part.
//
// `platform: 'pc'` is set at creation (the Console/PC selector, or a CFB27
// save import which dictates its own platform) and re-stamped by every
// Sync from Save, so a genuine PC dynasty is always positively marked.
export function isPcAutoDynasty(dynasty) {
  if (getEditionKey(dynasty) !== 'cfb27') return false
  return dynasty?.platform === 'pc'
}

// Given a dynasty OR an edition key, return the resolved config bundle.
export function getEditionConfig(dynastyOrKey) {
  const key =
    typeof dynastyOrKey === 'string'
      ? normalizeEditionKey(dynastyOrKey)
      : getEditionKey(dynastyOrKey)
  return EDITION_CONFIGS[key]
}

// Convenience for the common "is this subsystem on?" check.
export function editionHasFeature(dynastyOrKey, feature) {
  return Boolean(getEditionConfig(dynastyOrKey)?.features?.[feature])
}

// The ONE gate every Dynasty Blueprint surface must use — nav link, the
// Blueprint panel/tab, the dashboard budget/support-staff/facility/roster-NIL
// to-dos, the budget donut, and the Dynasty Points framing on coach salaries.
// It is true only when BOTH the dynasty's edition enables the Dynasty Points
// economy (CFB 27+) AND the user has not hidden it via the league preference
// (`dynasty.hideDynastyBlueprint`). Requires the full dynasty object (not an
// edition key) so it can read the per-dynasty preference.
//
// Hiding is purely presentational: it never deletes `dynasty.dynastyPoints`,
// support staff, facilities, or coach salaries — flip the preference back and
// everything returns exactly as it was.
//
// PC (Sync from Save) dynasties never see Blueprint at all — removed per the
// user's request (unneeded there). Console CFB27 dynasties are unaffected
// and keep the normal hideDynastyBlueprint-preference behavior.
export function isDynastyBlueprintEnabled(dynasty) {
  if (!editionHasFeature(dynasty, 'dynastyPoints')) return false
  if (isPcAutoDynasty(dynasty)) return false
  return dynasty?.hideDynastyBlueprint !== true
}

// Whether FULL per-player attribute (rating) ENTRY is on: the edition supports
// it AND the user hasn't turned ratings off via the "Hide all ratings" league
// preference (`dynasty.hideAllRatings`). Gate the Training Results / Recruit
// Overalls full-attribute entry sections on this so, when hidden, those flows
// capture Overall only. Displays (the player Attributes tab, Compare Players)
// use areRatingsHiddenForDisplay below instead — they must still show scouted
// data on editions without the full-attribute feature.
//
// PC dynasties can't turn ratings off at all — same reasoning/removal as
// isDynastyBlueprintEnabled above.
export function arePlayerAttributesEnabled(dynasty) {
  if (!editionHasFeature(dynasty, 'attributes')) return false
  if (isPcAutoDynasty(dynasty)) return true
  return dynasty?.hideAllRatings !== true
}

// The raw-flag counterpart arePlayerAttributesEnabled's own comment refers
// to — used by DISPLAY surfaces (the player Attributes tab, Compare Players)
// that must still show scouted/recruit data even on an edition without the
// full-attribute feature, so they can't gate on arePlayerAttributesEnabled
// itself. Same PC override: the preference is gone for PC, so a leftover
// `hideAllRatings: true` on a PC dynasty is ignored here too.
export function areRatingsHiddenForDisplay(dynasty) {
  if (isPcAutoDynasty(dynasty)) return false
  return dynasty?.hideAllRatings === true
}

// True when a dynasty (or edition key) resolves to CFB 27. Gate CFB 27-only
// features on this — e.g. Scout Staff, which doesn't work correctly against
// CFB 26 data — so they never surface on CFB 26 / untagged saves.
export function isCfb27(dynastyOrKey) {
  const key = typeof dynastyOrKey === 'string'
    ? normalizeEditionKey(dynastyOrKey)
    : getEditionKey(dynastyOrKey)
  return key === 'cfb27'
}
