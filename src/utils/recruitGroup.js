// Single shared "which side of the ball" classifier — used to auto-fill the
// Recruiting Database's Group column (Offense/Defense/Special Teams) for
// every recruit, regardless of how it entered (AI/local-paste import, a real
// Target, or a manual edit).
//
// Standard positions classify by position alone. ATH is the interesting
// case: rather than lumping every ATH into one undifferentiated bucket, its
// actual archetype tells you which side it really projects to — e.g. an
// "ATH - Backfield Threat" plays like a HB (Offense), while an "ATH -
// Lurker" plays like an OLB/MIKE (Defense). This is reliable because no
// archetype name in the registry is shared between an offensive and a
// defensive position (verified against the full ARCHETYPE_REGISTRY — every
// archetype maps to exactly one side across every position that uses it),
// so stripping ATH's "ATH - " prefix and looking up the base archetype's
// canonical position always resolves unambiguously.
import { ARCHETYPE_REGISTRY } from '../data/configData';

const OFFENSE_POSITIONS = new Set(['QB', 'HB', 'FB', 'WR', 'TE', 'OT', 'OG', 'C']);
const DEFENSE_POSITIONS = new Set(['DE', 'DT', 'OLB', 'MIKE', 'CB', 'FS', 'SS']);
const SPECIAL_TEAMS_POSITIONS = new Set(['K', 'P']);

// Base archetype name -> the (non-ATH) position that canonically uses it.
// Built once; first position wins if a name were ever repeated (it isn't).
const BASE_ARCHETYPE_TO_POSITION = {};
ARCHETYPE_REGISTRY.forEach(({ position, archetype }) => {
  if (position === 'ATH') return;
  if (!(archetype in BASE_ARCHETYPE_TO_POSITION)) BASE_ARCHETYPE_TO_POSITION[archetype] = position;
});

function sideForPosition(position) {
  if (OFFENSE_POSITIONS.has(position)) return 'Offense';
  if (DEFENSE_POSITIONS.has(position)) return 'Defense';
  if (SPECIAL_TEAMS_POSITIONS.has(position)) return 'Special Teams';
  return null;
}

export function resolveRecruitGroup(position, archetype) {
  if (position === 'ATH') {
    const base = String(archetype || '').replace(/^ATH\s*-\s*/, '').trim();
    const canonicalPos = BASE_ARCHETYPE_TO_POSITION[base];
    const side = canonicalPos ? sideForPosition(canonicalPos) : null;
    // Archetype not recognized/blank — fall back to the old undifferentiated
    // bucket rather than guessing a side.
    return side || 'Athlete Pipeline';
  }
  return sideForPosition(position) || 'Offense';
}
