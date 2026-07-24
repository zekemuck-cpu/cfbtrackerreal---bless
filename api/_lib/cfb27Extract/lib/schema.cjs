'use strict';
/**
 * CFB 27 schema loader + rating engine.
 *
 * All data in ../schema/ was derived from the CFB27 Recruit Class Generator's
 * engine-data folder. The OVR formula and archetype-selection rule come from
 * archetype_ovr.json's _meta block, which cites the game's own tuning table
 * (ftc_cas_96_0105D309.frtk).
 */

const fs = require('fs');
const path = require('path');

const SCHEMA_DIR = path.join(__dirname, '..', 'schema');

function loadJson(name) {
  return JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, name), 'utf8'));
}

const ratingCalibration = loadJson('rating_calibration.json');
const refdata = loadJson('refdata.json');
const archetypeOvr = loadJson('archetype_ovr.json');
const archetypeNames = loadJson('archetype_names.json');
const abilitiesRaw = loadJson('abilities.json');
const slotMap = loadJson('slot_map.json');

/** The 56 rating field names as they appear in the save's player table. */
const RATING_FIELDS = ratingCalibration.ratings;

/**
 * Archetype weight keys omit the "Rating" suffix and use a few short names.
 * Map weight-key -> save field name.
 */
const WEIGHT_KEY_TO_FIELD = {
  BallCarrierVision: 'BCVisionRating',
  DeepAccuracy: 'ThrowAccuracyDeepRating',
  MediumAccuracy: 'ThrowAccuracyMidRating',
  ShortAccuracy: 'ThrowAccuracyShortRating',
  Juke: 'JukeMoveRating',
  Spin: 'SpinMoveRating',
  Hit: 'HitPowerRating',
  Press: 'PressRating',
  Release: 'ReleaseRating',
};

function weightKeyToField(key) {
  if (WEIGHT_KEY_TO_FIELD[key]) return WEIGHT_KEY_TO_FIELD[key];
  const candidate = `${key}Rating`;
  return RATING_FIELDS.includes(candidate) ? candidate : null;
}

/** playerType (e.g. "WR_Physical") -> archetype definition. */
const ARCHETYPES = new Map();
for (const a of archetypeOvr.archetypes) {
  ARCHETYPES.set(a.playerType, a);
}

/** position -> [archetype, ...] */
const ARCHETYPES_BY_POSITION = new Map();
for (const a of archetypeOvr.archetypes) {
  if (!ARCHETYPES_BY_POSITION.has(a.position)) {
    ARCHETYPES_BY_POSITION.set(a.position, []);
  }
  ARCHETYPES_BY_POSITION.get(a.position).push(a);
}

/**
 * OVR under a single archetype.
 *
 *   norm(r) = ((rating - desiredLow) / (desiredHigh - desiredLow)) * 99
 *   OVR     = min(maxRating, floor(sum(norm * w) / sum(w) + 0.5))
 *
 * Ratings absent from `ratings` are skipped and their weight excluded, so a
 * partial rating set still yields a sensible (if approximate) number.
 */
function computeOvr(archetype, ratings) {
  const { desiredLow: lo, desiredHigh: hi, maxRating: max } = archetype;
  const span = hi - lo;
  if (!span) return null;

  let weighted = 0;
  let totalWeight = 0;

  for (const [key, weight] of Object.entries(archetype.weights)) {
    if (!weight) continue;
    const field = weightKeyToField(key);
    if (!field) continue;
    const value = ratings[field];
    if (value === undefined || value === null) continue;
    weighted += ((value - lo) / span) * 99 * weight;
    totalWeight += weight;
  }

  if (!totalWeight) return null;
  return Math.min(max, Math.floor(weighted / totalWeight + 0.5));
}

/**
 * The save uses side-specific positions (LE/RE, LT/RT, FS/SS, LOLB/ROLB) while
 * the archetype tuning table groups them (DE, OT, S, OLB). Kickers and punters
 * share a single KP group. Map save position -> archetype position group.
 */
const POSITION_GROUP = {
  LE: 'DE', RE: 'DE',
  LT: 'OT', RT: 'OT',
  LG: 'G', RG: 'G',
  FS: 'S', SS: 'S',
  LOLB: 'OLB', ROLB: 'OLB',
  K: 'KP', P: 'KP',
};

function archetypePosition(position) {
  if (!position) return null;
  return POSITION_GROUP[position] || position;
}

/**
 * The game computes OVR under every archetype valid for the player's position
 * and assigns whichever scores highest.
 */
function bestArchetype(position, ratings) {
  const group = archetypePosition(position);
  const candidates = ARCHETYPES_BY_POSITION.get(group) || [];
  let best = null;

  for (const archetype of candidates) {
    const ovr = computeOvr(archetype, ratings);
    if (ovr === null) continue;
    if (!best || ovr > best.ovr) {
      best = { ovr, archetype, playerType: archetype.playerType, name: archetype.name };
    }
  }

  return best;
}

/** Ability slot order for an archetype (5 slots; trailing nulls for K/P). */
function abilitySlots(playerType) {
  return slotMap[playerType] || [];
}

const ABILITIES_BY_NAME = new Map(abilitiesRaw.abilities.map((a) => [a.name, a]));

/** Dev trait code ("College_Elite") -> display label ("Elite"). */
const DEV_TRAIT_LABELS = new Map(refdata.devTraits.map((d) => [d.code, d.label]));

/** Team id -> team name. */
const TEAMS_BY_ID = new Map(refdata.teams.map((t) => [t.id, t]));

module.exports = {
  RATING_FIELDS,
  ARCHETYPES,
  ARCHETYPES_BY_POSITION,
  ABILITIES_BY_NAME,
  DEV_TRAIT_LABELS,
  TEAMS_BY_ID,
  archetypeNames,
  refdata,
  ratingCalibration,
  computeOvr,
  bestArchetype,
  archetypePosition,
  POSITION_GROUP,
  abilitySlots,
  weightKeyToField,
};
