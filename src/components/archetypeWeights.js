// Archetype-specific attribute weights, keyed by "POS_Archetype Name".
// Weights sum to 1.0 per archetype. Used as the primary scoring foundation.
// Zero-weight entries are included for reference; they contribute nothing to score.

export const ARCHETYPE_WEIGHTS = {
  // ── QB ──────────────────────────────────────────────────────────────────────
  'QB_Pocket Passer': { Awareness:0.15, 'Throw Power':0.20, 'Short Accuracy':0.15, 'Medium Accuracy':0.15, 'Deep Accuracy':0.15, 'Throw On Run':0.05, 'Under Pressure':0.10, 'Break Sack':0.05, Speed:0.00, Acceleration:0.00 },
  'QB_Dual Threat':   { Awareness:0.05, 'Throw Power':0.15, 'Short Accuracy':0.10, 'Medium Accuracy':0.10, 'Deep Accuracy':0.05, 'Throw On Run':0.15, 'Under Pressure':0.00, 'Break Sack':0.05, Speed:0.20, Acceleration:0.15 },
  'QB_Backfield Creator': { Awareness:0.10, 'Throw Power':0.15, 'Short Accuracy':0.15, 'Medium Accuracy':0.10, 'Deep Accuracy':0.00, 'Throw On Run':0.20, 'Under Pressure':0.05, 'Break Sack':0.15, Speed:0.05, Acceleration:0.05 },
  'QB_Pure Runner':   { Awareness:0.05, 'Throw Power':0.10, 'Short Accuracy':0.10, 'Medium Accuracy':0.05, 'Deep Accuracy':0.00, 'Throw On Run':0.10, 'Under Pressure':0.00, 'Break Sack':0.15, Speed:0.25, Acceleration:0.20 },

  // ── HB ──────────────────────────────────────────────────────────────────────
  'HB_Elusive Bruiser':       { Awareness:0.05, Speed:0.15, Acceleration:0.15, Carrying:0.10, 'Break Tackle':0.20, 'Change of Direction':0.10, 'Juke Move':0.15, 'Spin Move':0.05, 'BC Vision':0.05, Catching:0.00 },
  'HB_East/West Playmaker':   { Awareness:0.05, Speed:0.20, Acceleration:0.20, Carrying:0.05, 'Break Tackle':0.00, 'Change of Direction':0.15, 'Juke Move':0.15, 'Spin Move':0.10, 'BC Vision':0.10, Catching:0.00 },
  'HB_Contact Seeker':        { Awareness:0.10, Speed:0.10, Acceleration:0.10, Carrying:0.20, 'Break Tackle':0.25, 'Change of Direction':0.05, 'Juke Move':0.05, 'Spin Move':0.00, 'BC Vision':0.15, Catching:0.00 },
  'HB_Backfield Threat':      { Awareness:0.05, Speed:0.15, Acceleration:0.15, Carrying:0.05, 'Break Tackle':0.05, 'Change of Direction':0.10, 'Juke Move':0.10, 'Spin Move':0.00, 'BC Vision':0.10, Catching:0.25 },
  'HB_North/South Receiver':  { Awareness:0.05, Speed:0.20, Acceleration:0.15, Carrying:0.10, 'Break Tackle':0.10, 'Change of Direction':0.05, 'Juke Move':0.00, 'Spin Move':0.00, 'BC Vision':0.15, Catching:0.20 },
  'HB_North/South Blocker':   { Awareness:0.15, Speed:0.10, Acceleration:0.10, Carrying:0.25, 'Break Tackle':0.20, 'Change of Direction':0.00, 'Juke Move':0.00, 'Spin Move':0.00, 'BC Vision':0.15, Catching:0.05 },

  // ── WR ──────────────────────────────────────────────────────────────────────
  'WR_Speedster':             { Awareness:0.05, Speed:0.25, Acceleration:0.20, Catching:0.10, 'Catch In Traffic':0.05, 'Spectacular Catch':0.10, 'Short Route':0.05, 'Medium Route':0.05, 'Deep Route':0.15, Agility:0.00 },
  'WR_Route Artist':          { Awareness:0.05, Speed:0.05, Acceleration:0.05, Catching:0.15, 'Catch In Traffic':0.05, 'Spectacular Catch':0.00, 'Short Route':0.20, 'Medium Route':0.20, 'Deep Route':0.15, Agility:0.10 },
  'WR_Elusive Route Runner':  { Awareness:0.05, Speed:0.15, Acceleration:0.10, Catching:0.10, 'Catch In Traffic':0.00, 'Spectacular Catch':0.00, 'Short Route':0.20, 'Medium Route':0.15, 'Deep Route':0.05, Agility:0.20 },
  'WR_Physical Route Runner': { Awareness:0.10, Speed:0.05, Acceleration:0.05, Catching:0.15, 'Catch In Traffic':0.20, 'Spectacular Catch':0.15, 'Short Route':0.05, 'Medium Route':0.20, 'Deep Route':0.05, Agility:0.00 },
  'WR_Gritty Possession':     { Awareness:0.10, Speed:0.05, Acceleration:0.00, Catching:0.20, 'Catch In Traffic':0.25, 'Spectacular Catch':0.05, 'Short Route':0.20, 'Medium Route':0.15, 'Deep Route':0.00, Agility:0.00 },
  'WR_Contested Specialist':  { Awareness:0.10, Speed:0.05, Acceleration:0.00, Catching:0.15, 'Catch In Traffic':0.25, 'Spectacular Catch':0.25, 'Short Route':0.00, 'Medium Route':0.05, 'Deep Route':0.15, Agility:0.00 },
  'WR_Gadget':                { Awareness:0.05, Speed:0.20, Acceleration:0.20, Catching:0.15, 'Catch In Traffic':0.05, 'Spectacular Catch':0.00, 'Short Route':0.10, 'Medium Route':0.05, 'Deep Route':0.00, Agility:0.20 },

  // ── TE ──────────────────────────────────────────────────────────────────────
  'TE_Vertical Threat':       { Awareness:0.05, Speed:0.25, Strength:0.05, Acceleration:0.20, 'Run Block':0.00, 'Pass Block':0.00, Catching:0.15, 'Catch In Traffic':0.10, 'Short Route':0.05, 'Medium Route':0.15 },
  'TE_Pure Possession':       { Awareness:0.10, Speed:0.05, Strength:0.05, Acceleration:0.00, 'Run Block':0.00, 'Pass Block':0.00, Catching:0.25, 'Catch In Traffic':0.20, 'Short Route':0.20, 'Medium Route':0.15 },
  'TE_Gritty Possession':     { Awareness:0.05, Speed:0.00, Strength:0.15, Acceleration:0.00, 'Run Block':0.15, 'Pass Block':0.05, Catching:0.10, 'Catch In Traffic':0.25, 'Short Route':0.20, 'Medium Route':0.05 },
  'TE_Physical Route Runner': { Awareness:0.05, Speed:0.05, Strength:0.15, Acceleration:0.05, 'Run Block':0.00, 'Pass Block':0.00, Catching:0.15, 'Catch In Traffic':0.20, 'Short Route':0.10, 'Medium Route':0.25 },
  'TE_Pure Blocker':          { Awareness:0.10, Speed:0.00, Strength:0.20, Acceleration:0.00, 'Run Block':0.30, 'Pass Block':0.20, Catching:0.05, 'Catch In Traffic':0.10, 'Short Route':0.05, 'Medium Route':0.00 },

  // ── OT ──────────────────────────────────────────────────────────────────────
  'OT_Well Rounded':    { Awareness:0.10, 'Run Block':0.20, 'Run Block Power':0.10, 'Run Block Finesse':0.05, 'Pass Block':0.20, 'Pass Block Power':0.10, 'Pass Block Finesse':0.05, 'Impact Blocking':0.10, Agility:0.05, Acceleration:0.05 },
  'OT_Pass Protector':  { Awareness:0.10, 'Run Block':0.05, 'Run Block Power':0.05, 'Run Block Finesse':0.05, 'Pass Block':0.25, 'Pass Block Power':0.20, 'Pass Block Finesse':0.20, 'Impact Blocking':0.05, Agility:0.05, Acceleration:0.00 },
  'OT_Agile':           { Awareness:0.10, 'Run Block':0.10, 'Run Block Power':0.00, 'Run Block Finesse':0.20, 'Pass Block':0.10, 'Pass Block Power':0.00, 'Pass Block Finesse':0.20, 'Impact Blocking':0.05, Agility:0.15, Acceleration:0.10 },
  'OT_Raw Strength':    { Awareness:0.05, 'Run Block':0.10, 'Run Block Power':0.25, 'Run Block Finesse':0.00, 'Pass Block':0.10, 'Pass Block Power':0.25, 'Pass Block Finesse':0.00, 'Impact Blocking':0.15, Agility:0.05, Acceleration:0.05 },

  // ── OG ──────────────────────────────────────────────────────────────────────
  'OG_Well Rounded':    { Awareness:0.10, 'Run Block':0.20, 'Run Block Power':0.10, 'Run Block Finesse':0.05, 'Pass Block':0.20, 'Pass Block Power':0.10, 'Pass Block Finesse':0.05, 'Impact Blocking':0.10, Agility:0.05, Acceleration:0.05 },
  'OG_Pass Protector':  { Awareness:0.10, 'Run Block':0.05, 'Run Block Power':0.05, 'Run Block Finesse':0.05, 'Pass Block':0.25, 'Pass Block Power':0.20, 'Pass Block Finesse':0.20, 'Impact Blocking':0.05, Agility:0.05, Acceleration:0.00 },
  'OG_Agile':           { Awareness:0.10, 'Run Block':0.10, 'Run Block Power':0.00, 'Run Block Finesse':0.20, 'Pass Block':0.10, 'Pass Block Power':0.00, 'Pass Block Finesse':0.20, 'Impact Blocking':0.05, Agility:0.15, Acceleration:0.10 },
  'OG_Raw Strength':    { Awareness:0.05, 'Run Block':0.10, 'Run Block Power':0.25, 'Run Block Finesse':0.00, 'Pass Block':0.10, 'Pass Block Power':0.25, 'Pass Block Finesse':0.00, 'Impact Blocking':0.15, Agility:0.05, Acceleration:0.05 },

  // ── C ───────────────────────────────────────────────────────────────────────
  'C_Well Rounded':     { Awareness:0.10, 'Run Block':0.20, 'Run Block Power':0.10, 'Run Block Finesse':0.05, 'Pass Block':0.20, 'Pass Block Power':0.10, 'Pass Block Finesse':0.05, 'Impact Blocking':0.10, Agility:0.05, Acceleration:0.05 },
  'C_Pass Protector':   { Awareness:0.10, 'Run Block':0.05, 'Run Block Power':0.05, 'Run Block Finesse':0.05, 'Pass Block':0.25, 'Pass Block Power':0.20, 'Pass Block Finesse':0.20, 'Impact Blocking':0.05, Agility:0.05, Acceleration:0.00 },
  'C_Agile':            { Awareness:0.10, 'Run Block':0.10, 'Run Block Power':0.00, 'Run Block Finesse':0.20, 'Pass Block':0.10, 'Pass Block Power':0.00, 'Pass Block Finesse':0.20, 'Impact Blocking':0.05, Agility:0.15, Acceleration:0.10 },
  'C_Raw Strength':     { Awareness:0.05, 'Run Block':0.10, 'Run Block Power':0.25, 'Run Block Finesse':0.00, 'Pass Block':0.10, 'Pass Block Power':0.25, 'Pass Block Finesse':0.00, 'Impact Blocking':0.15, Agility:0.05, Acceleration:0.05 },

  // ── DE ──────────────────────────────────────────────────────────────────────
  'DE_Speed Rusher':  { Awareness:0.05, Strength:0.05, Acceleration:0.20, 'Block Shedding':0.05, Tackle:0.05, 'Hit Power':0.05, 'Power Moves':0.00, 'Finesse Moves':0.25, Speed:0.20, Pursuit:0.10 },
  'DE_Power Rusher':  { Awareness:0.05, Strength:0.20, Acceleration:0.05, 'Block Shedding':0.15, Tackle:0.10, 'Hit Power':0.10, 'Power Moves':0.25, 'Finesse Moves':0.00, Speed:0.05, Pursuit:0.05 },
  'DE_Edge Setter':   { Awareness:0.10, Strength:0.15, Acceleration:0.00, 'Block Shedding':0.25, Tackle:0.20, 'Hit Power':0.15, 'Power Moves':0.05, 'Finesse Moves':0.05, Speed:0.00, Pursuit:0.05 },
  'DE_Pure Power':    { Awareness:0.05, Strength:0.25, Acceleration:0.00, 'Block Shedding':0.20, Tackle:0.10, 'Hit Power':0.10, 'Power Moves':0.30, 'Finesse Moves':0.00, Speed:0.00, Pursuit:0.00 },

  // ── DT ──────────────────────────────────────────────────────────────────────
  'DT_Speed Rusher':  { Awareness:0.05, Strength:0.05, Acceleration:0.20, 'Block Shedding':0.05, Tackle:0.05, 'Hit Power':0.05, 'Power Moves':0.00, 'Finesse Moves':0.25, Speed:0.20, Pursuit:0.10 },
  'DT_Power Rusher':  { Awareness:0.05, Strength:0.20, Acceleration:0.05, 'Block Shedding':0.15, Tackle:0.10, 'Hit Power':0.10, 'Power Moves':0.25, 'Finesse Moves':0.00, Speed:0.05, Pursuit:0.05 },
  'DT_Edge Setter':   { Awareness:0.10, Strength:0.15, Acceleration:0.00, 'Block Shedding':0.25, Tackle:0.20, 'Hit Power':0.15, 'Power Moves':0.05, 'Finesse Moves':0.05, Speed:0.00, Pursuit:0.05 },
  'DT_Pure Power':    { Awareness:0.05, Strength:0.25, Acceleration:0.00, 'Block Shedding':0.20, Tackle:0.10, 'Hit Power':0.10, 'Power Moves':0.30, 'Finesse Moves':0.00, Speed:0.00, Pursuit:0.00 },
  'DT_Gap Specialist':{ Awareness:0.10, Strength:0.20, Acceleration:0.00, 'Block Shedding':0.25, Tackle:0.20, 'Hit Power':0.15, 'Power Moves':0.05, 'Finesse Moves':0.05, Speed:0.00, Pursuit:0.00 },

  // ── OLB ─────────────────────────────────────────────────────────────────────
  'OLB_Thumper':       { Awareness:0.05, Speed:0.05, Acceleration:0.05, Strength:0.20, 'Play Recognition':0.10, Tackle:0.25, 'Hit Power':0.20, Pursuit:0.10, 'Man Coverage':0.00, 'Zone Coverage':0.00 },
  'OLB_Signal Caller': { Awareness:0.20, Speed:0.05, Acceleration:0.05, Strength:0.00, 'Play Recognition':0.25, Tackle:0.15, 'Hit Power':0.05, Pursuit:0.15, 'Man Coverage':0.00, 'Zone Coverage':0.10 },
  'OLB_Lurker':        { Awareness:0.10, Speed:0.20, Acceleration:0.15, Strength:0.00, 'Play Recognition':0.15, Tackle:0.05, 'Hit Power':0.00, Pursuit:0.05, 'Man Coverage':0.05, 'Zone Coverage':0.25 },

  // ── MIKE ────────────────────────────────────────────────────────────────────
  'MIKE_Thumper':       { Awareness:0.05, Speed:0.05, Acceleration:0.05, Strength:0.20, 'Play Recognition':0.10, Tackle:0.25, 'Hit Power':0.20, Pursuit:0.10, 'Man Coverage':0.00, 'Zone Coverage':0.00 },
  'MIKE_Signal Caller': { Awareness:0.20, Speed:0.05, Acceleration:0.05, Strength:0.00, 'Play Recognition':0.25, Tackle:0.15, 'Hit Power':0.05, Pursuit:0.15, 'Man Coverage':0.00, 'Zone Coverage':0.10 },
  'MIKE_Lurker':        { Awareness:0.10, Speed:0.20, Acceleration:0.15, Strength:0.00, 'Play Recognition':0.15, Tackle:0.05, 'Hit Power':0.00, Pursuit:0.05, 'Man Coverage':0.05, 'Zone Coverage':0.25 },

  // ── CB ──────────────────────────────────────────────────────────────────────
  'CB_Field':        { Awareness:0.05, Speed:0.15, Acceleration:0.15, 'Change of Direction':0.10, Agility:0.10, 'Man Coverage':0.20, 'Zone Coverage':0.20, Press:0.00, Catching:0.05, Tackle:0.00 },
  'CB_Bump and Run': { Awareness:0.05, Speed:0.15, Acceleration:0.10, 'Change of Direction':0.10, Agility:0.10, 'Man Coverage':0.20, 'Zone Coverage':0.00, Press:0.25, Catching:0.05, Tackle:0.00 },
  'CB_Boundary':     { Awareness:0.05, Speed:0.15, Acceleration:0.10, 'Change of Direction':0.10, Agility:0.10, 'Man Coverage':0.25, 'Zone Coverage':0.00, Press:0.20, Catching:0.05, Tackle:0.00 },
  'CB_Zone':         { Awareness:0.10, Speed:0.15, Acceleration:0.15, 'Change of Direction':0.10, Agility:0.10, 'Man Coverage':0.00, 'Zone Coverage':0.25, Press:0.00, Catching:0.10, Tackle:0.05 },

  // ── FS ──────────────────────────────────────────────────────────────────────
  'FS_Hybrid':              { Awareness:0.05, Speed:0.15, Acceleration:0.15, 'Change of Direction':0.10, Agility:0.10, 'Man Coverage':0.05, 'Zone Coverage':0.20, Press:0.00, Catching:0.05, Tackle:0.15 },
  'FS_Coverage Specialist': { Awareness:0.10, Speed:0.20, Acceleration:0.15, 'Change of Direction':0.10, Agility:0.10, 'Man Coverage':0.05, 'Zone Coverage':0.25, Press:0.00, Catching:0.05, Tackle:0.00 },
  'FS_Box Specialist':      { Awareness:0.15, Speed:0.15, Acceleration:0.15, 'Change of Direction':0.10, Agility:0.10, 'Man Coverage':0.00, 'Zone Coverage':0.05, Press:0.00, Catching:0.00, Tackle:0.30 },

  // ── SS ──────────────────────────────────────────────────────────────────────
  'SS_Hybrid':              { Awareness:0.05, Speed:0.15, Acceleration:0.15, 'Change of Direction':0.10, Agility:0.10, 'Man Coverage':0.05, 'Zone Coverage':0.20, Press:0.00, Catching:0.05, Tackle:0.15 },
  'SS_Coverage Specialist': { Awareness:0.10, Speed:0.20, Acceleration:0.15, 'Change of Direction':0.10, Agility:0.10, 'Man Coverage':0.05, 'Zone Coverage':0.25, Press:0.00, Catching:0.05, Tackle:0.00 },
  'SS_Box Specialist':      { Awareness:0.15, Speed:0.15, Acceleration:0.15, 'Change of Direction':0.10, Agility:0.10, 'Man Coverage':0.00, 'Zone Coverage':0.05, Press:0.00, Catching:0.00, Tackle:0.30 },

  // ── ATH ─────────────────────────────────────────────────────────────────────
  'ATH_Pure Runner':          { Awareness:0.05, Speed:0.30, Acceleration:0.25, 'Break Sack':0.05, 'Short Accuracy':0.10, 'Throw On Run':0.15, 'Under Pressure':0.05, 'Throw Power':0.05, 'Medium Accuracy':0.00, 'Deep Accuracy':0.00 },
  'ATH_Physical Route Runner':{ Awareness:0.05, Speed:0.20, Strength:0.10, Acceleration:0.10, 'Run Block':0.00, 'Pass Block':0.00, Catching:0.10, 'Catch In Traffic':0.15, 'Short Route':0.10, 'Medium Route':0.20 },
  'ATH_Agile':                { Awareness:0.10, 'Run Block':0.10, Speed:0.10, 'Run Block Finesse':0.10, 'Pass Block':0.10, 'Pass Block Power':0.00, 'Pass Block Finesse':0.10, 'Impact Blocking':0.05, Agility:0.20, Acceleration:0.15 },
  'ATH_Speed Rusher':         { Awareness:0.05, Strength:0.05, Acceleration:0.25, 'Block Shedding':0.05, Tackle:0.05, 'Hit Power':0.05, 'Power Moves':0.00, 'Finesse Moves':0.20, Speed:0.25, Pursuit:0.05 },
  'ATH_Contested Specialist': { Awareness:0.10, Speed:0.05, Acceleration:0.00, Catching:0.15, 'Catch In Traffic':0.25, 'Spectacular Catch':0.25, 'Short Route':0.00, 'Medium Route':0.05, 'Deep Route':0.15, Release:0.00 },
  'ATH_Lurker':               { Awareness:0.10, Speed:0.20, Acceleration:0.15, Strength:0.00, 'Play Recognition':0.15, Tackle:0.05, 'Hit Power':0.00, Pursuit:0.05, 'Man Coverage':0.05, 'Zone Coverage':0.25 },
};

// Normalize stored archetype name → ARCHETYPE_WEIGHTS key suffix.
// "Raw Strength (OT)" → "Raw Strength", "ATH - Thumper" → "Thumper"
export function normalizeArch(arch = '') {
  return arch.replace(/^ATH\s*-\s*/i, '').replace(/\s*\([A-Z]+\)\s*$/, '').trim();
}

// ── Full scoring engine (shared by all scout pages) ──────────────────────────
const DEV_BONUS  = { Elite: 20, Star: 10, Impact: 5, Normal: -10 };
const STAR_BONUS = { '5': 3, '4': 2, '3': 1, '2': 0, '1': -1 };
const PHYS_ATTRS = ['Speed', 'Acceleration', 'Strength', 'Agility', 'Change of Direction'];

function isHiddenDev(d) { return !d || d === 'Hidden' || d === 'hidden' || d === ''; }

function physOutlierBonus(player) {
  let b = 0;
  PHYS_ATTRS.forEach(k => {
    const v = player.attributes?.[k] ?? 0;
    if      (v >= 96) b += 5;
    else if (v >= 92) b += 2;
    else if (v >= 88) b += 0.5;
  });
  return b;
}

function estimateHiddenDev(player) {
  const stars   = parseInt(player.stars) || 3;
  const physMax = Math.max(0, ...PHYS_ATTRS.map(k => player.attributes?.[k] ?? 0));
  const base    = { 5: 13, 4: 7, 3: 3, 2: 0, 1: -3 }[stars] ?? 3;
  return base + (physMax >= 96 ? 3 : physMax >= 92 ? 1 : 0);
}

export function computeScore(player) {
  const devBonus = isHiddenDev(player.devTrait)
    ? estimateHiddenDev(player)
    : (DEV_BONUS[player.devTrait] ?? 0);
  const archBase = archetypeBaseScore(player);
  const vals     = Object.values(player.attributes ?? {}).filter(v => typeof v === 'number');
  const fallback = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 75;
  return (archBase ?? fallback) + devBonus + (STAR_BONUS[String(player.stars)] ?? 0) + physOutlierBonus(player);
}

// ATH archetypes not explicitly defined borrow weights from the matching
// non-ATH position that uses the same attribute set.
const ATH_FALLBACK_POS = {
  'Power Rusher':        'DE',
  'East/West Playmaker': 'HB',
  'Dual Threat':         'QB',
  'Contact Seeker':      'HB',
  'Thumper':             'OLB',
  'Backfield Threat':    'HB',
  'Pure Possession':     'TE',
};

function resolveWeights(position, arch) {
  const key = `${position}_${arch}`;
  if (ARCHETYPE_WEIGHTS[key]) return ARCHETYPE_WEIGHTS[key];
  if (position === 'ATH') {
    const fallback = ATH_FALLBACK_POS[arch];
    if (fallback) return ARCHETYPE_WEIGHTS[`${fallback}_${arch}`] ?? null;
  }
  return null;
}

// Compute archetype-specific weighted base score (0–99 range, weighted avg of attrs).
// Returns null if no weights are registered for this player's archetype.
export function archetypeBaseScore(player) {
  const arch    = normalizeArch(player.archetype || '');
  const weights = resolveWeights(player.position, arch);
  if (!weights) return null;
  let sum = 0;
  Object.entries(weights).forEach(([attr, w]) => {
    if (w > 0) sum += (player.attributes?.[attr] ?? 0) * w;
  });
  return sum;
}

// Returns the top-weighted attribute names for display (sorted by weight desc, non-zero only).
export function topAttrs(pos, arch, n = 3) {
  const normalized = normalizeArch(arch);
  const weights    = resolveWeights(pos, normalized);
  if (!weights) return [];
  return Object.entries(weights)
    .filter(([, w]) => w > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([attr, w]) => ({ attr, pct: Math.round(w * 100) }));
}
