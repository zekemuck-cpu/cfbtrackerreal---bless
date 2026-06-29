import React, { useState, useEffect, useMemo } from 'react';
import { getStaffData, saveStaffData } from './staffDB';
import { PROFILES, POSITIONS } from './ThresholdLookup';
import { archetypeBaseScore, normalizeArch } from './archetypeWeights';
import { isPlayerOnRoster } from '../context/DynastyContext';

// ── ATH archetype → default position mapping ─────────────────────────────────
const ATH_ARCH_TO_POS = {
  'Dual Threat':           'QB',
  'Pure Runner':           'QB',
  'East/West Playmaker':   'HB',
  'Backfield Threat':      'HB',
  'Contact Seeker':        'HB',
  'Agile':                 'C',   // default; OT or OG via Configure override
  'Contested Specialist':  'WR',
  'Physical Route Runner': 'TE',
  'Pure Possession':       'TE',
  'Power Rusher':          'DE',
  'Thumper':               'OLB', // default; MIKE via Configure override
  'Lurker':                'OLB', // default; MIKE via Configure override
};

// ── Roster-depth constants ────────────────────────────────────────────────────
const POS_TO_POSITIONS = {
  QB: ['QB'], HB: ['HB', 'FB', 'RB'], WR: ['WR'], TE: ['TE'],
  OT: ['LT', 'RT', 'OT'], OG: ['LG', 'RG', 'OG'], C: ['C'],
  DE: ['DE', 'LEDG', 'REDG', 'EDGE', 'LE', 'RE'],
  DT: ['DT', 'NT', 'DL'],
  OLB: ['SAM', 'WILL', 'OLB', 'LOLB', 'ROLB'],
  MIKE: ['MIKE', 'MLB', 'ILB', 'LB'],
  CB: ['CB', 'DB'], FS: ['FS'], SS: ['SS'], ATH: ['ATH'],
};
// Sub-position pairs that need independent tracking (left vs right side)
// minDepth = target roster size per side; minStarter = starters needed per side
const POS_SUBGROUPS = {
  OT:  [{ label: 'LT', specific: new Set(['LT']),              minDepth: 3, minStarter: 1 },
        { label: 'RT', specific: new Set(['RT']),              minDepth: 3, minStarter: 1 }],
  OG:  [{ label: 'LG', specific: new Set(['LG']),              minDepth: 3, minStarter: 1 },
        { label: 'RG', specific: new Set(['RG']),              minDepth: 3, minStarter: 1 }],
  DE:  [{ label: 'LE', specific: new Set(['LE','LEDG','EDGE']),minDepth: 3, minStarter: 1 },
        { label: 'RE', specific: new Set(['RE','REDG']),       minDepth: 3, minStarter: 1 }],
  OLB: [{ label: 'SAM',  specific: new Set(['SAM','LOLB']),   minDepth: 3, minStarter: 1 },
        { label: 'WILL', specific: new Set(['WILL','ROLB']),  minDepth: 3, minStarter: 1 }],
};

const POS_MIN_DEPTH = { QB:3, HB:4, WR:7, TE:3, OT:6, OG:6, C:3, DE:6, DT:4, OLB:6, MIKE:3, CB:5, FS:3, SS:3, ATH:0 };
const POS_STARTERS  = { QB:1, HB:2, WR:3, TE:1, OT:2, OG:2, C:1, DE:2, DT:2, OLB:2, MIKE:1, CB:3, FS:1, SS:1, ATH:0 };

// Schematic tendency for each archetype (used for play-style fit)
const ARCH_TENDENCY = {
  'Pocket Passer':'pass','Dual Threat':'balanced','Backfield Creator':'balanced','Pure Runner':'run',
  'Elusive Bruiser':'balanced','East/West Playmaker':'run','Contact Seeker':'run',
  'Backfield Threat':'pass','North/South Receiver':'pass','North/South Blocker':'run',
  'Speedster':'pass','Route Artist':'pass','Elusive Route Runner':'pass',
  'Physical Route Runner':'pass','Gritty Possession':'pass','Contested Specialist':'pass','Gadget':'pass',
  'Vertical Threat':'pass','Pure Possession':'pass','Pure Blocker':'run',
  'Well Rounded':'balanced','Pass Protector':'pass','Agile':'balanced',
  'Raw Strength (OT)':'run','Raw Strength (OG)':'run','Raw Strength (C)':'run',
  'Edge Setter':'run','Power Rusher':'run','Speed Rusher':'pass','Pure Power':'run',
  'Gap Specialist':'run',
  'Thumper':'run','Signal Caller':'pass','Lurker':'pass',
  'Field':'pass','Bump and Run':'pass','Boundary':'balanced','Zone':'pass',
  'Hybrid':'balanced','Coverage Specialist':'pass','Box Specialist':'run',
};

// Returns how many seasons a player has remaining AFTER this year (0 = departing)
function yearsLeft(cls) {
  const n = (cls || '').toLowerCase().replace(/\s+/g, '');
  if (n === 'sr'  || n === 'rssr') return 0;
  if (n === 'jr'  || n === 'rsjr') return 1;
  if (n === 'so'  || n === 'rsso') return 2;
  if (n === 'fr'  || n === 'rsfr') return 3;
  return 2; // unknown — assume mid-career
}

// ── Scoring engine ────────────────────────────────────────────────────────────
const DEV_BONUS  = { Elite: 20, Star: 10, Impact: 5, Normal: -10 };
const STAR_BONUS = { '5': 3, '4': 2, '3': 1, '2': 0, '1': -1 };
const PHYSICAL_ATTRS_ARR = ['Speed', 'Acceleration', 'Strength', 'Agility', 'Change of Direction'];

function isHiddenDev(d) { return !d || d === 'Hidden' || d === 'hidden' || d === ''; }
function getDevBonus(d)  { return isHiddenDev(d) ? 0 : (DEV_BONUS[d] ?? 0); }

function physOutlierBonus(player) {
  let bonus = 0;
  PHYSICAL_ATTRS_ARR.forEach(k => {
    const v = player.attributes?.[k] ?? 0;
    if      (v >= 96) bonus += 5;
    else if (v >= 92) bonus += 2;
    else if (v >= 88) bonus += 0.5;
  });
  return bonus;
}

function estimateHiddenDev(player) {
  const stars   = parseInt(player.stars) || 3;
  const physMax = Math.max(0, ...PHYSICAL_ATTRS_ARR.map(k => player.attributes?.[k] ?? 0));
  const base    = { 5: 13, 4: 7, 3: 3, 2: 0, 1: -3 }[stars] ?? 3;
  return base + (physMax >= 96 ? 3 : physMax >= 92 ? 1 : 0);
}

function computeScore(player) {
  const devBonus = isHiddenDev(player.devTrait) ? estimateHiddenDev(player) : getDevBonus(player.devTrait);
  const archBase = archetypeBaseScore(player);
  // Fallback: simple unweighted average of all attributes
  const fallback = (() => {
    const vals = Object.values(player.attributes ?? {}).filter(v => typeof v === 'number');
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 75;
  })();
  return (archBase ?? fallback) + devBonus + (STAR_BONUS[String(player.stars)] ?? 0) + physOutlierBonus(player);
}

function getGrade(score) {
  if (score >= 95) return { grade: 'A+', cls: 'text-emerald-300 bg-emerald-950 border-emerald-600' };
  if (score >= 90) return { grade: 'A',  cls: 'text-emerald-300 bg-emerald-950 border-emerald-700' };
  if (score >= 86) return { grade: 'A-', cls: 'text-emerald-400 bg-emerald-950/70 border-emerald-800' };
  if (score >= 82) return { grade: 'B+', cls: 'text-sky-200 bg-sky-950 border-sky-600' };
  if (score >= 78) return { grade: 'B',  cls: 'text-sky-300 bg-sky-950 border-sky-700' };
  if (score >= 74) return { grade: 'B-', cls: 'text-sky-400 bg-sky-950/70 border-sky-800' };
  if (score >= 70) return { grade: 'C+', cls: 'text-yellow-300 bg-yellow-950 border-yellow-700' };
  if (score >= 66) return { grade: 'C',  cls: 'text-amber-300 bg-amber-950 border-amber-700' };
  if (score >= 62) return { grade: 'C-', cls: 'text-amber-400 bg-amber-950/70 border-amber-800' };
  return { grade: 'D',  cls: 'text-orange-400 bg-orange-950 border-orange-700' };
}

function getTier(score) {
  if (score >= 88) return 0;
  if (score >= 82) return 1;
  if (score >= 76) return 2;
  return 3;
}

// ── Tier UI config ────────────────────────────────────────────────────────────
const TIER_UI = [
  { label: 'T1', full: 'Tier 1 · Elite',    dot: 'bg-emerald-500', bar: 'bg-emerald-500', text: 'text-emerald-400', ring: 'border-emerald-700' },
  { label: 'T2', full: 'Tier 2 · Premium',  dot: 'bg-sky-500',     bar: 'bg-sky-500',     text: 'text-sky-400',     ring: 'border-sky-700' },
  { label: 'T3', full: 'Tier 3 · Core',     dot: 'bg-amber-500',   bar: 'bg-amber-500',   text: 'text-amber-400',   ring: 'border-amber-700' },
  { label: 'T4', full: 'Tier 4 · Depth',    dot: 'bg-red-600',     bar: 'bg-red-600',     text: 'text-red-400',     ring: 'border-red-800' },
];

const URGENCY_UI = {
  high:   { label: 'Priority',   cls: 'bg-red-950 border border-red-700 text-red-400' },
  medium: { label: 'Needed',     cls: 'bg-amber-950 border border-amber-700 text-amber-400' },
  low:    { label: 'Deep',       cls: 'bg-emerald-950 border border-emerald-700 text-emerald-400' },
  empty:  { label: 'Untracked',  cls: 'bg-slate-800 border border-slate-700 text-slate-400' },
};

// ── Recommendation engine ─────────────────────────────────────────────────────
function buildRec(pos, arch, matchingPlayers) {
  const profile = PROFILES[pos]?.[arch];
  const t1Data  = profile?.tiers[0];
  const t2Data  = profile?.tiers[1];

  if (!profile) {
    return {
      type: 'unknown', urgency: 'empty',
      headline: `${arch} at ${pos}`,
      paragraphs: ['Threshold data for this archetype is not yet configured. Evaluate prospects manually against position-level benchmarks.'],
      target: null,
    };
  }

  const scored = matchingPlayers.map(p => {
    const s = computeScore(p);
    return { ...p, score: s, tier: getTier(s) };
  }).sort((a, b) => b.score - a.score);

  const t1 = scored.filter(s => s.tier === 0);
  const t2 = scored.filter(s => s.tier === 1);
  const t3 = scored.filter(s => s.tier === 2);
  const t4 = scored.filter(s => s.tier === 3);

  const names = (arr, max = 2) => arr.slice(0, max).map(p => p.name).join(' and ');
  const firstSentence = (str) => str ? str.split('.')[0] + '.' : '';

  if (matchingPlayers.length === 0) {
    return {
      type: 'empty', urgency: 'empty',
      headline: `No ${arch} ${pos}s on the board yet`,
      paragraphs: [
        `Nothing filed at this archetype. Here's what the model is looking for to hit elite range:`,
        t1Data?.cond ?? `Target prospects with the defining attributes for the ${arch} archetype.`,
        t2Data ? `If a true Tier 1 isn't available, a Tier 2 target needs: ${t2Data.k1}.` : null,
      ].filter(Boolean),
      target: t1Data ? `T1 benchmark: ${t1Data.k1}` : null,
      scored,
    };
  }

  if (t1.length >= 2) {
    const extra = t2.length > 0 ? ` ${names(t2)} give solid Tier 2 depth behind them.` : ' No Tier 2 depth yet but that\'s a secondary concern.';
    return {
      type: 'elite', urgency: 'low',
      headline: `Elite depth — ${arch} is locked in`,
      paragraphs: [
        `${names(t1, 3)} ${t1.length > 1 ? 'are both' : 'is'} Tier 1 caliber at ${arch}. That's a rare pipeline — close either one and this position group is built for multiple seasons.`,
        `${extra} Shift recruiting bandwidth to positions that need it more. This unit doesn't.`,
      ],
      target: null,
      scored,
    };
  }

  if (t1.length === 1) {
    const hasDepth = t2.length > 0;
    return {
      type: 'good', urgency: 'low',
      headline: `Elite target on board — protect the commitment`,
      paragraphs: [
        `${t1[0].name} is a Tier 1 ${arch} and your anchor for this position. Closing that commitment is the top priority here.`,
        hasDepth
          ? `${names(t2)} provide Tier 2 depth — the pipeline is in solid shape. One more insurance option would make this airtight.`
          : `No Tier 2 depth behind ${t1[0].name} yet. Add at least one backup who hits: ${t2Data?.k1}.`,
      ],
      target: !hasDepth ? `T2 fallback: ${t2Data?.k1}` : null,
      scored,
    };
  }

  if (t2.length >= 2) {
    return {
      type: 'ok', urgency: 'medium',
      headline: `Solid Tier 2 base — no elite target yet`,
      paragraphs: [
        `${names(t2, 3)} ${t2.length > 1 ? 'give you' : 'gives you'} a reliable foundation at ${arch}. These are legitimate contributors, but this class is missing a true separator.`,
        `To push into Tier 1 you need: ${t1Data?.k1}. ${firstSentence(t1Data?.cond)}`,
      ],
      target: `T1 push: ${t1Data?.k1}`,
      scored,
    };
  }

  if (t2.length === 1) {
    return {
      type: 'needs-work', urgency: 'high',
      headline: `Thin at ${arch} — one player isn't depth`,
      paragraphs: [
        `${t2[0].name} is a solid Tier 2 ${arch} but that's all you have. One player at a position group is never enough — injuries, decommits, and competition for reps all demand a deeper board.`,
        `Target at least one more this cycle. If you can find Tier 1: ${t1Data?.k1}. At minimum, another Tier 2: ${t2Data?.k1}.`,
      ],
      target: `T1 target: ${t1Data?.k1}`,
      scored,
    };
  }

  // All T3/T4
  const names34 = names(scored, 3);
  return {
    type: 'weak', urgency: 'high',
    headline: `Below standard at ${arch} — upgrade required`,
    paragraphs: [
      `${scored.length > 0 ? `${names34} ${scored.length > 1 ? 'don\'t' : 'doesn\'t'} hit the benchmarks needed to contribute at a high level in this archetype.` : 'No meaningful prospects at this archetype.'} Current ceiling is Tier 3 depth.`,
      `Reallocate recruiting effort here immediately. Elite ${arch} target: ${t1Data?.k1}. ${firstSentence(t1Data?.cond)}`,
    ],
    target: `T1 target: ${t1Data?.k1}`,
    scored,
  };
}

// ── Global header quote ───────────────────────────────────────────────────────
function globalQuote(players) {
  if (!players.length) return "Board is empty — give me some data and I'll tell you exactly where the gaps are.";

  const posGroups = {};
  players.forEach(p => {
    posGroups[p.position] = posGroups[p.position] || [];
    posGroups[p.position].push(p);
  });

  const t1Count = players.filter(p => getTier(computeScore(p)) === 0).length;
  const weakPos = Object.entries(posGroups)
    .filter(([, arr]) => arr.every(p => getTier(computeScore(p)) >= 2))
    .map(([pos]) => pos);

  if (t1Count === 0) return `${players.length} prospects on the board and not one hits Tier 1 thresholds yet. Need to move on higher-rated targets.`;
  if (weakPos.length > 2) return `${t1Count} Tier 1 targets tracked but ${weakPos.slice(0,2).join(', ')} and others are running below standard. Spread isn't balanced.`;
  if (t1Count >= 5) return `Strong board — ${t1Count} Tier 1 targets across the class. Depth at the premium tiers is where this class separates itself.`;
  return `${t1Count} Tier 1 targets in the pipeline. Pick a position below to see where you need to push harder.`;
}

// ── Verdict style map ─────────────────────────────────────────────────────────
const VERDICT_STYLES = {
  critical:        { border: 'border-red-900/50 bg-red-950/10',        head: 'text-red-400',     badge: 'bg-red-950 border border-red-700 text-red-400' },
  'keep-search':   { border: 'border-amber-900/50 bg-amber-950/10',    head: 'text-amber-300',   badge: 'bg-amber-950 border border-amber-700 text-amber-400' },
  'close-target':  { border: 'border-emerald-800/40 bg-emerald-950/10', head: 'text-emerald-300', badge: 'bg-emerald-950 border border-emerald-700 text-emerald-400' },
  monitor:         { border: 'border-sky-900/40 bg-sky-950/10',         head: 'text-sky-300',     badge: 'bg-sky-950 border border-sky-700 text-sky-400' },
  covered:         { border: 'border-emerald-800/40 bg-emerald-950/10', head: 'text-emerald-300', badge: 'bg-emerald-950 border border-emerald-700 text-emerald-400' },
  'no-board':      { border: 'border-slate-800 bg-slate-900/30',         head: 'text-slate-400',   badge: 'bg-slate-800 border border-slate-600 text-slate-400' },
  'depth-needed':  { border: 'border-amber-900/50 bg-amber-950/10',    head: 'text-amber-300',   badge: 'bg-amber-950 border border-amber-700 text-amber-400' },
  'no-investment': { border: 'border-emerald-800/40 bg-emerald-950/10', head: 'text-emerald-300', badge: 'bg-emerald-950 border border-emerald-700 text-emerald-400' },
};

// ── Position hub builder ──────────────────────────────────────────────────────
function buildPositionHub(pos, posPlayers, archList, rosterCtx, availableSpots, recruitStrategy, extraTargets) {
  const archStats = archList.map(arch => {
    const matches = posPlayers.filter(pl => normalizeArch(pl.archetype) === arch);
    if (!matches.length) return { arch, count: 0, bestScore: null, bestTier: null, urgency: 'empty', scored: [], t1c: 0, t2c: 0 };
    const scored = matches.map(p => { const s = computeScore(p); return { ...p, score: s, tier: getTier(s) }; }).sort((a, b) => b.score - a.score);
    const best = scored[0].score;
    const t1c = scored.filter(s => s.tier === 0).length;
    const t2c = scored.filter(s => s.tier === 1).length;
    const urgency = t1c >= 1 || t2c >= 2 ? 'low' : t2c === 1 ? 'medium' : 'high';
    return { arch, count: matches.length, scored, bestScore: best, bestTier: getTier(best), urgency, t1c, t2c };
  });

  const t1Archs   = archStats.filter(a => a.bestTier === 0);
  const t2Archs   = archStats.filter(a => a.bestTier === 1);
  const emptyArchs = archStats.filter(a => a.count === 0);

  const topTargets = posPlayers
    .map(p => { const s = computeScore(p); return { ...p, score: s, tier: getTier(s) }; })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const rc            = rosterCtx;
  const immediateNeed = rc?.needsPortal  ?? false;  // starter gap arrives NEXT year
  const pipelineNeed  = (rc?.needsRecruit && !immediateNeed) ?? false; // gap in 2–3 yr window
  const rosterNeed    = immediateNeed || pipelineNeed;
  const hasT1        = t1Archs.length > 0;
  const hasT2        = t2Archs.length > 0;
  const hasBoard     = posPlayers.length > 0;
  const rosterDesc   = rc ? (rc.count === 0 ? `No ${pos}s on the current roster` : `${rc.count} ${pos}${rc.count !== 1 ? 's' : ''} on roster${rc.starterCount > 0 ? `, ${rc.starterCount} starter-caliber` : ', none starter-caliber'}`) : null;
  const t1Names      = t1Archs.flatMap(a => a.scored.filter(s => s.tier === 0)).sort((a, b) => b.score - a.score).slice(0, 2).map(s => s.name);
  const t2Names      = t2Archs.flatMap(a => a.scored.filter(s => s.tier === 1)).sort((a, b) => b.score - a.score).slice(0, 1).map(s => s.name);

  // Critical = hole next year only. Depth Needed = 2-3 year window only. No Investment = set.
  let verdictKey;
  if (immediateNeed && !hasBoard)    verdictKey = 'critical';
  else if (immediateNeed && hasT1)   verdictKey = 'close-target';
  else if (immediateNeed && hasT2)   verdictKey = 'keep-search';
  else if (immediateNeed)            verdictKey = 'critical';
  else if (pipelineNeed && hasT1)    verdictKey = 'covered';
  else if (pipelineNeed)             verdictKey = 'depth-needed';
  else if (hasT1)                    verdictKey = 'covered';
  else if (hasT2)                    verdictKey = 'monitor';
  else                               verdictKey = 'no-investment';

  const VERDICT_LABELS = {
    critical: 'Critical Need', 'keep-search': 'Keep Searching',
    'close-target': 'Close the Target', monitor: 'Monitor', covered: 'Board Set', 'no-board': 'No Board Data',
    'depth-needed': 'Depth Needed', 'no-investment': 'No Investment',
  };
  const verdict = { key: verdictKey, label: VERDICT_LABELS[verdictKey], ...VERDICT_STYLES[verdictKey] };

  // ── Player-name narrative helpers ─────────────────────────────────────────
  const allP     = rc?.allPlayers ?? [];
  const lastName = n => n.split(' ').slice(1).join(' ') || n;
  const nameList = arr => {
    const ns = arr.map(p => lastName(p.name));
    if (!ns.length) return null;
    if (ns.length === 1) return ns[0];
    if (ns.length === 2) return `${ns[0]} and ${ns[1]}`;
    return `${ns.slice(0, -1).join(', ')}, and ${ns[ns.length - 1]}`;
  };
  const allDeps   = allP.filter(p => p.isLeaving && !p.isIncoming);
  const retStarts = allP.filter(p => p.quality === 'starter'    && p.yearsLeft >= 1 && !p.isLeaving && !p.isIncoming);
  const commits   = allP.filter(p => p.isIncoming);
  // Sort developing players by projection year (yr1 first) then OVR desc — mention everyone
  const devsSorted = [...allP.filter(p => p.quality === 'developing' && p.yearsLeft >= 1 && !p.isLeaving && !p.isIncoming)]
    .sort((a, b) => {
      const ap = a.effectiveProj ?? 4;
      const bp = b.effectiveProj ?? 4;
      return ap !== bp ? ap - bp : b.ovr - a.ovr;
    });
  const devYr1    = devsSorted.filter(p => p.effectiveProj === 1);
  const devYr2    = devsSorted.filter(p => p.effectiveProj === 2);
  const devYr3    = devsSorted.filter(p => p.effectiveProj === 3);
  const devNoProj = devsSorted.filter(p => !p.effectiveProj || p.effectiveProj === 0);

  const depStr = nameList(allDeps);
  const retStr = nameList(retStarts);
  const comStr = nameList(commits);

  // Build a full projection-aware narrative for developing players
  const devNarrative = (() => {
    const parts = [];
    if (devYr1.length > 0) {
      const n = nameList(devYr1);
      parts.push(`${n} ${devYr1.length === 1 ? 'projects' : 'project'} to be ready to contribute next year`);
    }
    if (devYr2.length > 0) {
      const n = nameList(devYr2);
      parts.push(`${n} ${devYr2.length === 1 ? 'is' : 'are'} on track to develop in year 2`);
    }
    if (devYr3.length > 0) {
      const n = nameList(devYr3);
      parts.push(`${n} ${devYr3.length === 1 ? 'is' : 'are'} a year 3 piece`);
    }
    if (devNoProj.length > 0) {
      const n = nameList(devNoProj);
      parts.push(`${n} ${devNoProj.length === 1 ? 'adds raw depth' : 'add raw depth'} to the room`);
    }
    if (!parts.length) return null;
    if (parts.length === 1) return parts[0] + '.';
    return parts.slice(0, -1).join(', ') + ', and ' + parts[parts.length - 1] + '.';
  })();

  let headline, paragraphs;
  if (verdictKey === 'critical' && !hasBoard) {
    headline = `${pos} is exposed — starter gap next year with nothing on the board`;
    const p1 = depStr
      ? `With ${depStr} leaving, we have no starter returning next year — this is a real gap, not a depth concern.`
      : rosterDesc ? `${rosterDesc} — this is a real gap, not a depth concern.`
      : `No ${pos} recruits on file and no starter returning next year.`;
    const devComParts = [];
    if (devNarrative) devComParts.push(devNarrative);
    if (comStr) devComParts.push(`${comStr} ${commits.length === 1 ? 'looks like an exciting prospect' : 'look like exciting prospects'}, but we don't want to rely on a true freshman next year if we don't have to.`);
    const p2 = devComParts.length
      ? devComParts.join(' ') + ' The transfer portal has to be the primary solution.'
      : `The transfer portal has to be the primary solution here. A true freshman starter is the exception, not the plan — it would take a genuinely special prospect to justify relying on one.`;
    paragraphs = [p1, p2];
  } else if (verdictKey === 'critical') {
    headline = `${pos} needs a starter next year — board isn't answering it`;
    const p1 = depStr
      ? `With ${depStr} leaving, the position needs a starter next year. Nothing on the current board clears the benchmark to address this gap.`
      : rosterDesc ? `${rosterDesc}. Nothing on the current board clears the benchmark needed to address this gap.`
      : `No Tier 1 or Tier 2 targets on the ${pos} board.`;
    const p2 = devNarrative
      ? `The portal is the stronger play for immediate help. ${devNarrative} Keep the board active in parallel.`
      : `The portal is the stronger play for an immediate starter. What's on file isn't ready for that role — keep the board active in parallel.`;
    paragraphs = [p1, p2];
  } else if (verdictKey === 'depth-needed') {
    headline = !hasBoard
      ? `${pos} depth needed in 2–3 years — nothing filed yet`
      : `${pos} depth needed in 2–3 years — board has options to track`;
    let p1;
    if (retStr) {
      p1 = `${retStr} anchor ${pos} for now, but the 2–3 year window thins out behind them.`
        + (devNarrative ? ` ${devNarrative}` : '');
    } else {
      p1 = rosterDesc
        ? `${rosterDesc}. Position is covered next year but depth thins in the 2–3 season window.`
          + (devNarrative ? ` ${devNarrative}` : '')
        : `No immediate gap at ${pos} — the concern arrives in 2–3 years.`;
    }
    const p2 = !hasBoard
      ? `File reports now and build the board before this window closes. One quality recruit this class answers it before it becomes urgent.`
      : `Board has some options. Not an emergency, but stay active — close the right recruit and this window is covered.`;
    paragraphs = [p1, p2];
  } else if (verdictKey === 'no-investment') {
    headline = `${pos} is covered — no investment needed this class`;
    const p1Parts = [];
    if (retStr) p1Parts.push(`${retStr} give us what we need at ${pos}.`);
    if (devNarrative) p1Parts.push(devNarrative);
    if (comStr) p1Parts.push(`${comStr} coming in adds to the long-term depth.`);
    const p1 = p1Parts.length
      ? p1Parts.join(' ') + ' We are in good shape through the 2–3 year window.'
      : rosterDesc ? `${rosterDesc}. We are in good shape through the 2–3 year window.`
      : `${pos} position group is set — we are in good shape through the 2–3 year window.`;
    paragraphs = [p1, `Spend recruiting bandwidth on positions with actual gaps. No action needed here.`];
  } else if (verdictKey === 'close-target') {
    headline = immediateNeed
      ? `${pos} need is urgent — elite target on the board may be able to contribute immediately`
      : `${pos} pipeline need covered — elite target already on the board`;
    const t1Str = t1Names.length > 0 ? t1Names.join(' and ') : 'A Tier 1 target';
    const closeBase = retStr
      ? `${retStr} anchor the position and ${t1Str} on the board directly addresses the gap ahead.`
      : rosterDesc ? `${rosterDesc}. ${t1Str} is in the pipeline and directly addresses the gap.`
      : `${t1Str} is on the board at ${pos}.`;
    const p1 = devNarrative ? `${closeBase} ${devNarrative}` : closeBase;
    const p2 = immediateNeed
      ? `A true freshman starter is rare — but this is the kind of elite talent where it's possible. Commit and monitor closely. Also evaluate the portal for a bridge option in case the timeline doesn't hold.`
      : `The 2–3 year window is covered. Priority now is commitment management, not more searching — lock this in and shift bandwidth elsewhere.`;
    paragraphs = [p1, p2];
  } else if (verdictKey === 'keep-search') {
    headline = `${pos} needs a starter next year — only Tier 2 options on the board`;
    const t2Str = t2Names.length > 0 ? `${t2Names[0]} is a Tier 2 option` : 'Tier 2 depth exists on the board';
    const p1 = depStr
      ? `With ${depStr} leaving, ${pos} needs a starter next year. ${t2Str}, but no Tier 1 answer has surfaced.`
      : rosterDesc ? `${rosterDesc}. ${t2Str} but no Tier 1 answer has surfaced.`
      : `Board has Tier 2 depth at ${pos} — no Tier 1 target yet.`;
    paragraphs = [p1, `Tier 2 alone won't solve a next-year starter need. The portal is the better path for immediate help — keep recruiting simultaneously for the long-term pipeline.`];
  } else if (verdictKey === 'covered') {
    headline = `${pos} is in good shape — close, don't keep searching`;
    const t1Str = t1Names.length > 0 ? t1Names.join(' and ') + (t1Names.length > 1 ? ' are elite targets' : ' is an elite target') : 'Elite board targets';
    const covBase = retStr
      ? `${retStr} anchor the position and ${t1Str} build on that foundation — this is a position of strength.`
      : rosterDesc ? `${rosterDesc}. ${t1Str} build on that foundation — this is a position of strength.`
      : `Elite ${pos} targets on the board. Position group is well set.`;
    const p1 = devNarrative ? `${covBase} ${devNarrative}` : covBase;
    paragraphs = [p1, t1Archs.length > 1 ? `Tier 1 options across ${t1Archs.length} archetypes. Close whichever fits best and redirect bandwidth to positions that actually need work.` : `Close the Tier 1 target and move bandwidth to positions that need it more.`];
  } else if (verdictKey === 'monitor') {
    headline = `${pos} is stable — solid board depth, no elite target yet`;
    const monitorParts = [];
    if (retStr) monitorParts.push(`${retStr} anchor ${pos}.`);
    if (devNarrative) monitorParts.push(devNarrative);
    if (comStr) monitorParts.push(`${comStr} coming in adds future depth.`);
    const p1 = monitorParts.length
      ? monitorParts.join(' ') + ' Board adds Tier 2 depth to work with. Nothing here is urgent.'
      : rosterDesc ? `${rosterDesc}. Board adds Tier 2 options to work with. Nothing here is urgent.`
      : `Tier 2 board depth at ${pos}. No Tier 1 target yet.`;
    paragraphs = [p1, `Stay alert for an elite upgrade if one surfaces. Otherwise, primary recruiting focus belongs at positions with actual gaps.`];
  } else {
    headline = `${pos} is covered — no investment needed this class`;
    const p1Parts = [];
    if (retStr) p1Parts.push(`${retStr} give us what we need at ${pos}.`);
    if (devNarrative) p1Parts.push(devNarrative);
    if (comStr) p1Parts.push(`${comStr} coming in adds to the long-term depth.`);
    const p1 = p1Parts.length
      ? p1Parts.join(' ') + ' We are in good shape.'
      : rosterDesc ? `${rosterDesc}. We are in good shape through the 2–3 year window.`
      : `${pos} position group is set — we are in good shape through the 2–3 year window.`;
    paragraphs = [p1, `Spend recruiting bandwidth on positions with actual gaps. No action needed here.`];
  }

  // ── Recruit target count ─────────────────────────────────────────────────────
  const minDepth_    = POS_MIN_DEPTH[pos]  ?? 2;
  const minStarter_  = POS_STARTERS[pos]   ?? 1;
  const spots        = availableSpots ?? 20;
  const alreadyCommitted = rc?.committedCount ?? 0;
  const depthGap     = Math.max(0, minDepth_   - (rc?.returningCount ?? 0) - alreadyCommitted);
  const starterGap   = Math.max(0, minStarter_ - (rc?.nextYearStarters ?? 0));
  const pipelineAdd  = rc?.needsRecruit ? 1 : 0;
  // Base: fill the depth gap + pipeline slot, add 1 for competition when filling a gap
  let rtMin = Math.max(depthGap, starterGap > 0 && !immediateNeed ? 1 : depthGap);
  let rtMax = rtMin + pipelineAdd + (depthGap > 0 ? 1 : 0);
  // Tighten when roster is nearly full — only affect HS recruit count, not portal need
  const hasHsNeed = depthGap > 0 || (pipelineAdd > 0 && !immediateNeed);
  if (spots <= 5)  { rtMin = hasHsNeed ? 1 : 0; rtMax = hasHsNeed ? 1 : 0; }
  else if (spots <= 10) { rtMax = Math.min(rtMax, hasHsNeed ? 2 : (depthGap > 0 ? 1 : 0)); }
  rtMin = Math.max(0, rtMin);
  rtMax = Math.max(rtMin, Math.min(rtMax, 5));

  // ── Split: portal (immediate starter gap) vs HS recruit (depth/pipeline) ─
  const autoPortalMin = immediateNeed ? 1 : 0;
  const autoPortalMax = immediateNeed ? 1 : 0;
  const autoHsMin = rtMin;
  const autoHsMax = rtMax;

  // Strategy is now { hs: bool, portal: bool } — both can be true simultaneously
  const stratPortal = recruitStrategy?.portal ?? false;
  const stratHs     = recruitStrategy?.hs     ?? false;
  const anyManual   = stratPortal || stratHs;

  let portalMin, portalMax, hsMin, hsMax;
  if (anyManual) {
    if (stratPortal && !stratHs) {
      // Portal only — consolidate all need into portal bucket
      const need = Math.max(autoPortalMin + autoHsMin, rosterNeed ? 1 : 0);
      portalMin = need; portalMax = Math.max(need, autoPortalMax + autoHsMax);
      hsMin = 0; hsMax = 0;
    } else if (stratHs && !stratPortal) {
      // HS only — consolidate all need into HS bucket
      portalMin = 0; portalMax = 0;
      hsMin = Math.max(autoPortalMin + autoHsMin, rosterNeed ? 1 : 0);
      hsMax = Math.max(autoPortalMax + autoHsMax, rosterNeed ? 1 : 0);
    } else {
      // Both selected — firm 1 of each, no ranges
      portalMin = Math.max(autoPortalMin, rosterNeed ? 1 : 0);
      portalMax = portalMin;
      hsMin     = Math.max(autoHsMin,     rosterNeed ? 1 : 0);
      hsMax     = hsMin;
    }
  } else {
    portalMin = autoPortalMin; portalMax = autoPortalMax;
    hsMin = autoHsMin;        hsMax = autoHsMax;
  }

  // Apply user-requested extra targets independently per bucket
  const extraHs     = extraTargets?.hs     ?? 0;
  const extraPortal = extraTargets?.portal ?? 0;
  const extra       = extraHs + extraPortal;
  portalMin += extraPortal; portalMax += extraPortal;
  hsMin     += extraHs;     hsMax     += extraHs;

  const portalLabel = portalMin > 0
    ? `${portalMin} portal target${portalMax !== 1 ? 's' : ''}`
    : null;
  const hsLabel = hsMin === 0 && hsMax === 0 ? null
    : hsMin === hsMax ? `${hsMin} recruit${hsMin !== 1 ? 's' : ''} this class`
    : `${hsMin}–${hsMax} recruits this class`;
  const combinedLabel = [portalLabel, hsLabel].filter(Boolean).join(' + ')
    || (rosterNeed ? 'Investment needed' : 'No investment needed');

  // Add quantitative recommendation as final paragraph
  if (spots <= 5 && rtMin === 0 && !immediateNeed) {
    paragraphs.push(`Roster spots are nearly maxed out — hold off at ${pos} unless it's an exceptional opportunity that falls in your lap.`);
  } else if (spots <= 10 && rosterNeed) {
    const targetType = stratPortal && !stratHs ? 'portal target' : stratHs && !stratPortal ? 'recruit' : immediateNeed ? 'portal target' : 'spot';
    paragraphs.push(`Roster space is tight overall. Budget 1 ${targetType} for ${pos} — prioritize your highest-need positions with the remaining room.`);
  } else if (!immediateNeed && rtMin === 0 && rtMax === 0 && extra === 0 && verdictKey !== 'no-investment') {
    paragraphs.push(`No roster investment needed at ${pos} this class. We are in good shape — spend those spots elsewhere.`);
  } else if (!immediateNeed && rtMin === 0 && rtMax === 0 && extra === 0) {
    // no-investment verdict already says this — skip
  } else if (!immediateNeed && rtMin === 0 && rtMax === 0 && extra > 0) {
    const parts = [];
    if (extraPortal > 0) parts.push(`${extraPortal} portal target${extraPortal !== 1 ? 's' : ''}`);
    if (extraHs > 0)     parts.push(`${extraHs} HS recruit${extraHs !== 1 ? 's' : ''}`);
    paragraphs.push(`Position is in good shape, but you want to add ${parts.join(' and ')} at ${pos}. Extra investment now builds depth and competition for the 2–3 year window.`);
  } else if (immediateNeed && stratHs && stratPortal) {
    paragraphs.push(`Targeting both the portal and a HS recruit at ${pos}. Hit the portal first for an immediate starter, then bring in a freshman to build long-term depth.`);
  } else if (immediateNeed && !stratHs) {
    const hsRec = hsMax > 0 ? ` Also target ${hsMin === hsMax ? hsMin : `${hsMin}–${hsMax}`} recruit${hsMax !== 1 ? 's' : ''} for future depth.` : '';
    paragraphs.push(`Hit the portal for 1 immediate starter at ${pos}.${hsRec}`);
  } else if (immediateNeed && stratHs) {
    paragraphs.push(`Targeting a high school recruit at ${pos}. Keep in mind there is a starter gap next year — a high-impact recruit or a player ready to contribute immediately is the priority.`);
  } else if (stratPortal && stratHs) {
    paragraphs.push(`Targeting both a portal addition and a HS recruit at ${pos} to accelerate the timeline and add long-term depth.`);
  } else if (stratPortal) {
    paragraphs.push(`Targeting the transfer portal at ${pos} to accelerate the timeline. A young portal addition bridges the gap faster than waiting on a freshman to develop.`);
  } else {
    paragraphs.push(
      rtMin === rtMax
        ? `Recommendation: target ${rtMin} recruit${rtMin !== 1 ? 's' : ''} at ${pos} this class to hit the right depth.`
        : `Recommendation: budget ${rtMin}–${rtMax} spots for ${pos} this class — the low end covers the gap, the high end adds depth and competition.`
    );
  }

  // Over-budget warning — user targeting more than system recommends
  const autoTotal = autoPortalMin + autoHsMin;
  const userTotal = portalMin + hsMin;
  if (userTotal > autoTotal && autoTotal > 0) {
    const buckets = [];
    if (portalMin > 0) buckets.push(`${portalMin} portal target${portalMin !== 1 ? 's' : ''}`);
    if (hsMin > 0)     buckets.push(`${hsMin} HS recruit${hsMin !== 1 ? 's' : ''}`);
    paragraphs.push(`We can bring in ${buckets.join(' and ')} here, but really only need ${autoTotal}. Bringing in ${userTotal} could take a spot away from somewhere else we could really use it — but I trust you, boss.`);
  }

  // Sub-position specific callout (OT/OG/DE/OLB with LT/RT etc.)
  const subPositions = rc?.subPositions;
  if (subPositions && subPositions.length >= 2) {
    const needPortalSubs  = subPositions.filter(sg => sg.needsPortal);
    const coveredSubs     = subPositions.filter(sg => !sg.needsPortal);
    if (needPortalSubs.length > 0 && needPortalSubs.length < subPositions.length) {
      // Mixed: some sides need help, others are fine
      const needLabels    = needPortalSubs.map(sg => sg.label).join(' and ');
      const coveredLabels = coveredSubs.map(sg => sg.label).join(' and ');
      paragraphs.push(`${coveredLabels} is covered — focus the portal need specifically on ${needLabels}.`);
    } else if (needPortalSubs.length === subPositions.length) {
      const allLabels = subPositions.map(sg => sg.label).join(' and ');
      paragraphs.push(`Both ${allLabels} need a starter next year — address each side independently.`);
    }
    // Surface which sub-positions have specific departures
    const leavingSubs = subPositions.filter(sg => sg.players.some(p => p.isLeaving));
    if (leavingSubs.length > 0 && needPortalSubs.length === 0) {
      const leaveLabels = leavingSubs.map(sg => sg.label).join(' and ');
      paragraphs.push(`${leaveLabels} is losing depth this cycle — keep an eye on that side specifically.`);
    }
  }

  // Surface sub-position info for UI rendering
  const subPositionSummary = subPositions?.map(sg => ({
    label: sg.label, count: sg.count, returningCount: sg.returningCount,
    nextYearStarters: sg.nextYearStarters, needsPortal: sg.needsPortal, isThin: sg.isThin,
  })) ?? null;

  const recruitTarget = {
    min: portalMin + hsMin, max: portalMax + hsMax,
    portalMin, portalMax, hsMin, hsMax,
    hasPortal: portalMin > 0, hasRecruit: hsMax > 0,
    label: combinedLabel, portalLabel, hsLabel,
    tight: spots < 10,
  };

  const autoStrategy = { portal: immediateNeed, hs: rosterNeed && !immediateNeed };
  return { headline, paragraphs, archStats, topTargets, verdict, recruitTarget, autoStrategy, subPositionSummary };
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ScoutAnalysis({ players = [], teamColors, teamLogo, dynasty, committedRecruits = [], onBack, onOutlookReady }) {
  const p = teamColors?.primary || '#374151';
  const onOutlookReadyRef = React.useRef(onOutlookReady);
  useEffect(() => { onOutlookReadyRef.current = onOutlookReady; });
  const [activePos, setActivePos]   = useState('QB');
  const [activeArch, setActiveArch] = useState(null); // null = hub view
  const [isOverview, setIsOverview] = useState(true);  // start on the overview
  const [analystImg, setAnalystImg]     = useState('');
  const [analystName, setAnalystName]   = useState('Data Analyst');
  const [starterOvr, setStarterOvr]     = useState({}); // pos → OVR threshold (default 80)
  const [preferredArchs, setPreferredArchs] = useState({}); // pos → arch[]
  const [leavingFlags, setLeavingFlags]         = useState({}); // pid → 'draft' | 'transfer'
  const [starterProjections, setStarterProjections] = useState({}); // pid → 0|1|2|3 (0=not a starter)
  const [athPositions, setAthPositions]         = useState({}); // pid → pos override for ATH players
  const [posRecruitStrategy, setPosRecruitStrategy] = useState({}); // pos → 'hs' | 'portal'
  const [posExtraTargets, setPosExtraTargets]     = useState({}); // pos → extra count beyond system rec
  const [showConfig, setShowConfig]             = useState(false);

  useEffect(() => {
    async function load() {
      const img   = await getStaffData('analyst_img');
      const name  = await getStaffData('analyst_name');
      const ovr   = await getStaffData('analysis_starter_ovr');
      const archs = await getStaffData('analysis_preferred_archs');
      const flags = await getStaffData('analysis_leaving_flags');
      if (img)   setAnalystImg(img);
      if (name)  setAnalystName(name);
      if (ovr)   try { setStarterOvr(JSON.parse(ovr)); } catch {}
      if (archs) try { setPreferredArchs(JSON.parse(archs)); } catch {}
      if (flags) try { setLeavingFlags(JSON.parse(flags)); } catch {}
      const projs = await getStaffData('analysis_starter_projections');
      if (projs) try { setStarterProjections(JSON.parse(projs)); } catch {}
      const athPos = await getStaffData('analysis_ath_positions');
      if (athPos) try { setAthPositions(JSON.parse(athPos)); } catch {}
      const strategy = await getStaffData('analysis_recruit_strategy');
      if (strategy) try { setPosRecruitStrategy(JSON.parse(strategy)); } catch {}
      const extras = await getStaffData('analysis_extra_targets');
      if (extras) try { setPosExtraTargets(JSON.parse(extras)); } catch {}
    }
    load();
  }, []);

  const toggleRecruitStrategy = async (pos, type) => {
    const cur = posRecruitStrategy[pos] ?? {};
    const next = { ...cur, [type]: !cur[type] };
    const updated = { ...posRecruitStrategy };
    if (!next.hs && !next.portal) delete updated[pos]; // both off → back to auto
    else updated[pos] = next;
    setPosRecruitStrategy(updated);
    await saveStaffData('analysis_recruit_strategy', JSON.stringify(updated));
  };

  const adjustExtraTargets = async (pos, type, delta) => {
    const cur = posExtraTargets[pos] ?? { hs: 0, portal: 0 };
    const next = { ...cur, [type]: Math.max(0, Math.min(5, (cur[type] ?? 0) + delta)) };
    const updated = { ...posExtraTargets, [pos]: next };
    if (next.hs === 0 && next.portal === 0) delete updated[pos];
    setPosExtraTargets(updated);
    await saveStaffData('analysis_extra_targets', JSON.stringify(updated));
  };

  const handleOvrChange = async (pos, val) => {
    const n = Math.max(60, Math.min(99, Number(val) || 80));
    const updated = { ...starterOvr, [pos]: n };
    setStarterOvr(updated);
    await saveStaffData('analysis_starter_ovr', JSON.stringify(updated));
  };

  const bulkSetOvr = async (val) => {
    const updated = Object.fromEntries(POSITIONS.filter(p => p !== 'ATH').map(p => [p, val]));
    setStarterOvr(updated);
    await saveStaffData('analysis_starter_ovr', JSON.stringify(updated));
  };

  const toggleArch = async (pos, arch) => {
    const cur = preferredArchs[pos] ?? [];
    const updated = { ...preferredArchs, [pos]: cur.includes(arch) ? cur.filter(a => a !== arch) : [...cur, arch] };
    setPreferredArchs(updated);
    await saveStaffData('analysis_preferred_archs', JSON.stringify(updated));
  };

  const cycleProjection = async pid => {
    const cur = starterProjections[pid];
    const updated = { ...starterProjections };
    if (cur === undefined)   updated[pid] = 1;
    else if (cur === 1)      updated[pid] = 2;
    else if (cur === 2)      updated[pid] = 3;
    else if (cur === 3)      updated[pid] = 0;
    else                     delete updated[pid]; // cur === 0 → back to default
    setStarterProjections(updated);
    await saveStaffData('analysis_starter_projections', JSON.stringify(updated));
  };

  const setAthPosition = async (pid, pos) => {
    const updated = { ...athPositions, [pid]: pos };
    setAthPositions(updated);
    await saveStaffData('analysis_ath_positions', JSON.stringify(updated));
  };

  const cycleLeaving = async pid => {
    const cur = leavingFlags[pid];
    let updated;
    if (!cur)                   updated = { ...leavingFlags, [pid]: 'draft' };
    else if (cur === 'draft')   updated = { ...leavingFlags, [pid]: 'transfer' };
    else if (cur === 'transfer') updated = { ...leavingFlags, [pid]: 'cut' };
    else { updated = { ...leavingFlags }; delete updated[pid]; }
    setLeavingFlags(updated);
    await saveStaffData('analysis_leaving_flags', JSON.stringify(updated));
  };

  // Build a per-position roster summary from the live dynasty data
  const rosterContext = useMemo(() => {
    if (!dynasty?.players || !dynasty?.currentTid) return {};
    const tid  = dynasty.currentTid;
    const year = Number(dynasty.currentYear);
    const onRoster = (dynasty.players || []).filter(p => !p.isHonorOnly && isPlayerOnRoster(p, tid, year));

    const STAR_OVR = { 5: 78, 4: 73, 3: 68, 2: 63, 1: 58 };

    const makePlayerEntry = (pl, ovr, cls, ovrThreshold, isIncoming = false) => {
      const naturalYl  = isIncoming ? 4 : yearsLeft(cls);
      const isSenior   = !isIncoming && naturalYl === 0;
      const leavingType = isIncoming ? null : (leavingFlags[pl.pid] || null);
      const yl = (isSenior || leavingType) ? 0 : naturalYl;
      const quality = ovr >= ovrThreshold ? 'starter' : ovr >= 70 ? 'developing' : 'raw';
      const manualProj = starterProjections[pl.pid || pl.name];
      // Auto-project based on OVR gap + dev trait growth rate
      const devGrowthRate = { Elite: 7, Star: 5, Impact: 3, Normal: 2 }[pl.devTrait || ''] ?? 2;
      const ovrGap = ovrThreshold - ovr;
      const autoProj = (!isIncoming && quality !== 'starter' && ovrGap > 0)
        ? (yr => {
            // Elite and Star always become starters — cap at 2 years max
            const devTrait = pl.devTrait || '';
            if (devTrait === 'Elite' || devTrait === 'Star') return Math.min(yr, 2);
            return yr <= 3 ? yr : 0;
          })(Math.ceil(ovrGap / devGrowthRate))
        : null;
      const effectiveProj = isIncoming ? null
        : quality === 'starter' ? 1
        : manualProj !== undefined ? manualProj
        : autoProj;
      const rawPos = isIncoming ? (pl.position || '').toUpperCase()
        : (pl.positionByYear?.[year] ?? pl.positionByYear?.[String(year)] ?? pl.position ?? '').toUpperCase();
      return {
        pid: pl.pid || pl.name,
        name: pl.name, ovr, cls: isIncoming ? 'Commit' : cls,
        yearsLeft: yl, isSenior, isLeaving: yl === 0, leavingType,
        isATH: rawPos === 'ATH',
        isIncoming,
        archetype: pl.archetype || '',
        devTrait: pl.devTrait || '',
        quality, effectiveProj,
        isManualProj: manualProj !== undefined,
        pos: rawPos,
      };
    };

    const result = {};
    POSITIONS.forEach(pos => {
      if (pos === 'ATH') return;
      const validPos = new Set(POS_TO_POSITIONS[pos] || [pos]);
      // Current roster players at this position
      const group = onRoster.filter(pl => {
        const pp = (pl.positionByYear?.[year] ?? pl.positionByYear?.[String(year)] ?? pl.position ?? '').toUpperCase();
        return validPos.has(pp);
      });
      // ATH roster players whose archetype (or manual override) maps to this position
      const athInPos = onRoster.filter(pl => {
        const pp = (pl.positionByYear?.[year] ?? pl.positionByYear?.[String(year)] ?? pl.position ?? '').toUpperCase();
        if (pp !== 'ATH') return false;
        const override = athPositions[pl.pid];
        return override ? override === pos : ATH_ARCH_TO_POS[pl.archetype || ''] === pos;
      });
      const combinedGroup = [...group, ...athInPos];
      const toOvr = pl => Number(pl.overallByYear?.[year] ?? pl.overallByYear?.[String(year)] ?? pl.overall ?? 0);
      const sorted = [...combinedGroup].sort((a, b) => toOvr(b) - toOvr(a));
      const minDepth    = POS_MIN_DEPTH[pos] ?? 2;
      const minStarter  = POS_STARTERS[pos] ?? 1;
      const ovrThreshold = starterOvr[pos] ?? 80;
      const starterCount    = combinedGroup.filter(pl => toOvr(pl) >= ovrThreshold).length;
      const developingCount = combinedGroup.filter(pl => { const o = toOvr(pl); return o >= 70 && o < ovrThreshold; }).length;
      // Roster players
      const rosterPlayers = sorted.map(pl => {
        const cls = pl.classByYear?.[year] ?? pl.classByYear?.[String(year)] ?? pl.class ?? '?';
        return makePlayerEntry(pl, toOvr(pl), cls, ovrThreshold, false);
      });
      // Committed incoming freshmen (add to pipeline projections)
      const incomingPlayers = (committedRecruits || [])
        .filter(cr => {
          const crPos = (cr.position || '').toUpperCase();
          if (validPos.has(crPos)) return true;
          if (crPos === 'ATH') {
            const override = athPositions[cr.pid || cr.name];
            return override ? override === pos : ATH_ARCH_TO_POS[cr.archetype || ''] === pos;
          }
          return false;
        })
        .map(cr => makePlayerEntry(cr, STAR_OVR[Number(cr.stars)] ?? 68, 'Commit', ovrThreshold, true));
      const allPlayers = [...rosterPlayers, ...incomingPlayers];
      const seniorCount    = allPlayers.filter(p => p.isLeaving).length;
      const returningCount = rosterPlayers.length - allPlayers.filter(p => !p.isIncoming && p.isLeaving).length;
      // projByYr(p, yr): player is projected to be starter-caliber by year yr
      const projByYr = (p, yr) => p.effectiveProj !== null && p.effectiveProj > 0 && p.effectiveProj <= yr;
      const nextYearStarters = allPlayers.filter(p => p.yearsLeft >= 1 && (p.quality === 'starter' || projByYr(p, 1))).length;
      const yr2Starters      = allPlayers.filter(p => p.yearsLeft >= 2 && (p.quality === 'starter' || projByYr(p, 2))).length;
      // Committed incoming recruits count as pipeline depth for yr3 window
      const yr3Starters      = allPlayers.filter(p => p.yearsLeft >= 3 && (p.quality === 'starter' || projByYr(p, 3) || p.isIncoming)).length;
      const nextYearCount    = allPlayers.filter(p => p.yearsLeft >= 1).length;
      const needsPortal      = nextYearStarters < minStarter;
      const needsRecruit     = yr2Starters < minStarter || yr3Starters < minStarter;
      // Sub-position breakdown for positions with left/right sides
      const subgroupDef = POS_SUBGROUPS[pos];
      let subPositions = null;
      if (subgroupDef) {
        const built = subgroupDef.map(({ label, specific, minDepth: subMin, minStarter: subStart }) => {
          const subP = allPlayers.filter(p => specific.has(p.pos));
          if (!subP.length) return null;
          const subNextYr    = subP.filter(p => p.yearsLeft >= 1 && (p.quality === 'starter' || projByYr(p, 1))).length;
          const subReturning = subP.filter(p => !p.isIncoming && !p.isLeaving).length;
          const isThin       = subP.filter(p => !p.isLeaving).length < subMin;
          return { label, count: subP.length, returningCount: subReturning, nextYearStarters: subNextYr,
                   needsPortal: subNextYr < subStart, isThin, players: subP };
        }).filter(Boolean);
        if (built.length >= 2) subPositions = built;
      }

      result[pos] = {
        count: combinedGroup.length,
        starterCount,
        developingCount,
        rawCount: group.length - starterCount - developingCount,
        isThin: group.length < minDepth,
        lacksStarter: starterCount < minStarter,
        allPlayers,
        seniorCount,
        returningCount,
        committedCount: incomingPlayers.length,
        nextYearStarters,
        yr2Starters,
        yr3Starters,
        nextYearCount,
        needsPortal,
        needsRecruit,
        subPositions,
      };
    });

    // Derive team play style from passing vs. rushing yards in most recent season with stats
    const statsYear = [year - 1, year].find(y =>
      onRoster.some(pl => pl.statsByYear?.[y]?.passing?.yds || pl.statsByYear?.[y]?.rushing?.yds)
    ) ?? year;
    const passYds = onRoster.reduce((s, pl) => s + (pl.statsByYear?.[statsYear]?.passing?.yds ?? 0), 0);
    const rushYds = onRoster.reduce((s, pl) => s + (pl.statsByYear?.[statsYear]?.rushing?.yds ?? 0), 0);
    const totalOff = passYds + rushYds;
    result._playStyle = totalOff > 0
      ? (passYds / totalOff > 0.58 ? 'pass-heavy' : rushYds / totalOff > 0.48 ? 'run-heavy' : 'balanced')
      : 'balanced';

    return result;
  }, [dynasty, starterOvr, leavingFlags, starterProjections, committedRecruits, athPositions]);

  const handlePosChange = pos => {
    setActivePos(pos);
    setActiveArch(null);
    setIsOverview(false);
  };

  // Total roster capacity across all positions
  const rosterCapacity = useMemo(() => {
    let total = 0, leaving = 0, committed = 0;
    POSITIONS.forEach(pos => {
      if (pos === 'ATH') return;
      const rc = rosterContext[pos];
      if (!rc) return;
      total     += rc.count;
      leaving   += rc.seniorCount;
      committed += rc.committedCount ?? 0;
    });
    const returning  = total - leaving;
    const available  = Math.max(0, 85 - returning - committed);
    const pct        = Math.min(100, Math.round(((returning + committed) / 85) * 100));
    return { total, leaving, returning, committed, available, pct };
  }, [rosterContext]);

  // Count committed recruits per position group (for Overview grid)
  const committedByPos = useMemo(() => {
    const counts = {};
    POSITIONS.forEach(pos => { counts[pos] = 0; });
    (committedRecruits || []).forEach(r => {
      const rp = (r.position || '').toUpperCase();
      const match = POSITIONS.find(pos => (POS_TO_POSITIONS[pos] || [pos]).includes(rp));
      if (match) counts[match] = (counts[match] || 0) + 1;
    });
    return counts;
  }, [committedRecruits]);

  // Pre-compute hubs for every position (used by the Overview panel)
  const allHubs = useMemo(() => {
    const result = {};
    POSITIONS.forEach(pos => {
      if (pos === 'ATH') return;
      const prof = PROFILES[pos];
      if (!prof) return;
      result[pos] = buildPositionHub(
        pos,
        players.filter(pl => pl.position === pos),
        prof.archetypes,
        rosterContext[pos],
        rosterCapacity.available,
        posRecruitStrategy[pos] ?? null,
        posExtraTargets[pos] ?? 0,
      );
    });
    return result;
  }, [players, rosterContext, rosterCapacity, posRecruitStrategy, posExtraTargets]);

  // Save compact summary whenever allHubs updates so Daily Brief can read it
  useEffect(() => {
    const summary = {};
    POSITIONS.forEach(pos => {
      if (pos === 'ATH') return;
      const hub = allHubs[pos];
      if (!hub) return;
      summary[pos] = {
        verdictKey: hub.verdict?.key,
        label: hub.recruitTarget?.label || null,
        hasPortal: hub.recruitTarget?.hasPortal ?? false,
        hasRecruit: hub.recruitTarget?.hasRecruit ?? false,
        portalMin: hub.recruitTarget?.portalMin ?? 0,
        hsMin: hub.recruitTarget?.hsMin ?? 0,
        subPositionSummary: hub.subPositionSummary ?? null,
      };
    });
    saveStaffData('analysis_outlook_summary', JSON.stringify(summary));
    if (onOutlookReadyRef.current) onOutlookReadyRef.current(summary);
  }, [allHubs]);

  const profile = PROFILES[activePos];
  const archList = profile.archetypes;
  const posPlayers = players.filter(pl => {
    if (pl.position === activePos) return true;
    if (pl.position === 'ATH') {
      const override = athPositions[pl.pid || pl.name];
      return override ? override === activePos : ATH_ARCH_TO_POS[pl.archetype || ''] === activePos;
    }
    return false;
  });

  // Hub data (always computed)
  const hub = buildPositionHub(activePos, posPlayers, archList, rosterContext[activePos], rosterCapacity.available, posRecruitStrategy[activePos] ?? null, posExtraTargets[activePos] ?? 0);

  // Archetype-specific data (only when an arch is selected)
  const matching = activeArch
    ? players.filter(pl => pl.position === activePos && normalizeArch(pl.archetype) === activeArch)
    : [];
  const rec = activeArch ? buildRec(activePos, activeArch, matching) : null;
  const urgencyBadge = rec ? URGENCY_UI[rec.urgency] : null;
  const tierCounts = rec ? [0,1,2,3].map(ti => rec.scored?.filter(s => s.tier === ti).length ?? 0) : [];

  return (
    <div className="max-w-4xl mx-auto space-y-4">

      {/* Header strip */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-surface-2 border border-surface-4">
        <p className="text-sm font-display font-bold uppercase text-txt-primary">Program Outlook</p>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setShowConfig(c => !c)}
            className={`text-xs font-display font-bold uppercase px-3 py-1.5 rounded-lg border transition ${
              showConfig
                ? 'bg-emerald-700 text-white border-emerald-600'
                : 'text-txt-secondary hover:text-txt-primary border-surface-4 hover:bg-surface-3'
            }`}
          >
            Configure
          </button>
          {onBack && (
            <button onClick={onBack} className="text-xs font-display font-bold uppercase text-txt-secondary hover:text-txt-primary transition px-3 py-1.5 rounded-lg border border-surface-4 hover:bg-surface-3">
              ← Main Hub
            </button>
          )}
        </div>
      </div>

      {/* Portrait + Info row */}
      <div className="flex flex-col sm:flex-row gap-4 items-stretch">
        {/* Analyst portrait card */}
        <div className="relative rounded-xl overflow-hidden w-full h-40 sm:w-[110px] sm:h-[280px] sm:flex-shrink-0">
          {analystImg
            ? <img src={analystImg} alt="" className="absolute inset-0 w-full h-full object-cover object-top" />
            : <div className="absolute inset-0 bg-surface-3" />
          }
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.82) 68%, rgba(0,0,0,0.92) 100%)' }} />
          <div className="absolute inset-0 pointer-events-none" style={{ background: `linear-gradient(to bottom, transparent 45%, ${p}55 100%)` }} />
          <div className="absolute bottom-0 left-0 right-0 p-2.5 pointer-events-none">
            <div className="w-6 h-0.5 mb-1 rounded-full" style={{ background: p }} />
            {(() => {
              const parts = analystName.trim().split(/\s+/);
              const fn = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
              const ln = parts[parts.length - 1];
              return <>
                {fn && <p className="text-[0.7rem] font-semibold leading-none" style={{ color: 'rgba(255,255,255,0.75)', textShadow: '0 1px 8px rgba(0,0,0,1)' }}>{fn}</p>}
                <p className="text-xl font-bold leading-tight" style={{ color: 'white', textShadow: '0 1px 8px rgba(0,0,0,1)' }}>{ln}</p>
                <p className="text-[0.6rem] font-semibold tracking-wider leading-snug" style={{ color: p, textShadow: '0 1px 8px rgba(0,0,0,1)' }}>DATA ANALYST</p>
              </>;
            })()}
          </div>
        </div>

        {/* Info card */}
        <div className="flex-1 rounded-xl p-4 flex flex-col gap-2 bg-surface-2 border border-surface-4">
          <p className="text-base font-semibold text-txt-primary">Recruiting Analysis</p>
          <p className="text-xs text-txt-tertiary leading-snug">Roster depth analysis with recruiting recommendations based on current squad composition. Benchmarks update as more players are scouted.</p>
          <p className="text-xs text-txt-secondary italic leading-snug mt-auto">{globalQuote(players)}</p>
        </div>
      </div>

      {/* ── Roster Capacity ── */}
      {rosterCapacity.total > 0 && (() => {
        const { total, leaving, returning, committed, available, pct } = rosterCapacity;
        const spotColor = available >= 15 ? 'text-emerald-400' : available >= 8 ? 'text-amber-400' : 'text-red-400';
        const barColor  = pct >= 95 ? '#ef4444' : pct >= 85 ? '#f59e0b' : '#10b981';
        const badgeCls  = available >= 15 ? 'bg-emerald-950 border border-emerald-700 text-emerald-400'
                        : available >= 8  ? 'bg-amber-950 border border-amber-700 text-amber-400'
                        : 'bg-red-950 border border-red-700 text-red-400';
        return (
          <div className="rounded-xl overflow-hidden bg-surface-2 border border-surface-4">
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-surface-4">
              <p className="text-[8px] font-display font-black uppercase tracking-[0.12em] text-txt-tertiary">Roster Capacity</p>
              <span className={`text-[8px] font-display font-black uppercase px-2 py-0.5 rounded shrink-0 ${badgeCls}`}>
                {available} spot{available !== 1 ? 's' : ''} available
              </span>
            </div>
            <div className="px-4 py-3 space-y-2.5">
            {/* Fill bar */}
            <div className="w-full bg-surface-4 rounded-full h-2 overflow-hidden">
              <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
            </div>
            {/* Stat row */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
              <span className="font-display font-bold text-txt-primary">{returning} / 85 returning</span>
              {leaving > 0 && <span className="font-display font-semibold text-amber-400"><span className="text-txt-tertiary mr-1.5">·</span>{leaving} graduating this year</span>}
              {committed > 0 && <span className="font-display font-semibold text-sky-400"><span className="text-txt-tertiary mr-1.5">·</span>{committed} committed</span>}
              <span className={`font-display font-bold ${spotColor}`}><span className="text-txt-tertiary mr-1.5">·</span>{available} open {available === 1 ? 'spot' : 'spots'} to fill ({returning + committed}/85)</span>
            </div>
            </div>
          </div>
        );
      })()}

      {/* Main panel */}
      <div className="rounded-xl overflow-hidden flex flex-col md:flex-row min-h-[560px] bg-surface-2 border border-surface-4">

        {/* Position nav */}
        <div className="w-full md:w-28 bg-surface-3 border-b md:border-b-0 md:border-r border-surface-4 p-2 flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-x-visible scrollbar-none shrink-0">
          <button
            onClick={() => { setIsOverview(true); setActiveArch(null); }}
            className={`text-[11px] font-display font-black uppercase tracking-wide px-2 py-2 rounded-lg transition shrink-0 text-center ${
              isOverview
                ? 'bg-sky-600 text-white'
                : 'text-txt-tertiary hover:bg-surface-4 hover:text-txt-primary'
            }`}
          >
            Overview
          </button>
          <div className="w-full h-px bg-surface-4 shrink-0 md:block hidden" />
          {POSITIONS.map(pos => {
            const posCount = players.filter(pl => pl.position === pos).length;
            const hasT1    = players.some(pl => pl.position === pos && getTier(computeScore(pl)) === 0);
            const posHub   = allHubs[pos];
            const isCritical    = posHub?.verdict?.key === 'critical';
            const isDepthNeeded = posHub?.verdict?.key === 'depth-needed';
            return (
              <button
                key={pos}
                onClick={() => handlePosChange(pos)}
                className={`relative text-[11px] font-display font-black uppercase tracking-wide px-2 py-2 rounded-lg transition shrink-0 text-center ${
                  !isOverview && activePos === pos
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-txt-tertiary hover:bg-surface-4 hover:text-txt-primary'
                }`}
              >
                {pos}
                {isCritical && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500" />
                )}
                {!isCritical && isDepthNeeded && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400" />
                )}
                {!isCritical && !isDepthNeeded && posCount > 0 && (
                  <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${hasT1 ? 'bg-emerald-400' : 'bg-amber-500'}`} />
                )}
              </button>
            );
          })}
        </div>

        {/* Right panel */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* ── CONFIGURE PANEL ── */}
          {showConfig && (
            <div className="p-4 space-y-5 flex-1 overflow-y-auto">
              <p className="text-[8px] font-display font-black uppercase tracking-[0.12em] text-txt-tertiary">Analysis Configuration</p>

              {/* Starter OVR Thresholds */}
              <div className="rounded-xl border border-surface-4 bg-surface-3 p-4 space-y-3">
                <div>
                  <p className="text-[9px] font-display font-black uppercase tracking-[0.12em] text-txt-secondary">Starter OVR Threshold</p>
                  <p className="text-[9px] text-txt-tertiary mt-0.5 leading-snug">Players at or above this OVR are counted as starter-caliber when calculating position need. Default is 80.</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {POSITIONS.filter(p => p !== 'ATH').map(pos => (
                    <div key={pos} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-2 border border-surface-4">
                      <span className="text-[10px] font-black uppercase text-txt-secondary w-8 shrink-0">{pos}</span>
                      <input
                        type="number"
                        min="60" max="99"
                        value={starterOvr[pos] ?? 80}
                        onChange={e => handleOvrChange(pos, e.target.value)}
                        className="w-12 bg-surface-4 border border-slate-700 text-[11px] font-bold text-txt-primary text-center rounded px-1 py-0.5 focus:outline-none focus:border-emerald-600"
                      />
                      <span className="text-[8px] text-txt-tertiary">OVR</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={() => bulkSetOvr(85)}
                    className="text-[9px] font-bold px-2.5 py-1 rounded-md bg-surface-4 border border-slate-700 text-txt-secondary hover:text-txt-primary hover:border-slate-500 transition"
                  >
                    Set All 85
                  </button>
                  <button
                    onClick={() => bulkSetOvr(90)}
                    className="text-[9px] font-bold px-2.5 py-1 rounded-md bg-surface-4 border border-slate-700 text-txt-secondary hover:text-txt-primary hover:border-slate-500 transition"
                  >
                    Set All 90
                  </button>
                  <button
                    onClick={async () => { setStarterOvr({}); await saveStaffData('analysis_starter_ovr', '{}'); }}
                    className="text-[9px] text-txt-tertiary hover:text-txt-secondary transition underline"
                  >
                    Reset all to 80
                  </button>
                </div>
              </div>

              {/* Preferred Archetypes */}
              <div className="rounded-xl border border-surface-4 bg-surface-3 p-4 space-y-3">
                <div>
                  <p className="text-[9px] font-display font-black uppercase tracking-[0.12em] text-txt-secondary">Preferred Archetypes</p>
                  <p className="text-[9px] text-txt-tertiary mt-0.5 leading-snug">Mark archetypes you actively want to target. Highlighted with a Preferred tag across the analysis view.</p>
                </div>
                <div className="space-y-4">
                  {POSITIONS.filter(p => p !== 'ATH').map(pos => {
                    const archs = PROFILES[pos]?.archetypes ?? [];
                    const pref  = preferredArchs[pos] ?? [];
                    if (!archs.length) return null;
                    return (
                      <div key={pos}>
                        <p className="text-[9px] font-black uppercase tracking-wider text-txt-secondary mb-1.5">{pos}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {archs.map(arch => {
                            const on = pref.includes(arch);
                            return (
                              <button
                                key={arch}
                                onClick={() => toggleArch(pos, arch)}
                                className={`text-[9px] font-semibold px-2.5 py-1 rounded-full border transition ${
                                  on
                                    ? 'bg-emerald-950 border-emerald-600 text-emerald-300'
                                    : 'bg-surface-2 border-surface-4 text-txt-tertiary hover:text-txt-secondary hover:border-slate-600'
                                }`}
                              >
                                {arch}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={async () => { setPreferredArchs({}); await saveStaffData('analysis_preferred_archs', '{}'); }}
                  className="text-[9px] text-txt-tertiary hover:text-txt-secondary transition underline"
                >
                  Clear all preferences
                </button>
              </div>

              {/* ATH Position Assignments */}
              {(() => {
                if (!dynasty?.players || !dynasty?.currentTid) return null;
                const tid = dynasty.currentTid;
                const year = Number(dynasty.currentYear);
                const athPlayers = (dynasty.players || []).filter(p => {
                  if (p.isHonorOnly || !isPlayerOnRoster(p, tid, year)) return false;
                  const pp = (p.positionByYear?.[year] ?? p.positionByYear?.[String(year)] ?? p.position ?? '').toUpperCase();
                  return pp === 'ATH';
                });
                if (!athPlayers.length) return null;
                const NON_ATH = POSITIONS.filter(p => p !== 'ATH');
                return (
                  <div className="rounded-xl border border-surface-4 bg-surface-3 p-4 space-y-3">
                    <div>
                      <p className="text-[9px] font-display font-black uppercase tracking-[0.12em] text-txt-secondary">ATH Position Assignments</p>
                      <p className="text-[9px] text-txt-tertiary mt-0.5 leading-snug">Athletes are auto-assigned to positions based on archetype. Override here to move them to a different position group.</p>
                    </div>
                    <div className="space-y-2">
                      {athPlayers.map(pl => {
                        const arch = pl.archetype || '';
                        const defaultPos = ATH_ARCH_TO_POS[arch] || '—';
                        const currentPos = athPositions[pl.pid] || defaultPos;
                        return (
                          <div key={pl.pid} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-2 border border-surface-4">
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-bold text-txt-secondary truncate">{pl.name}</p>
                              <p className="text-[8px] text-txt-tertiary">{arch || 'No archetype'}</p>
                            </div>
                            {athPositions[pl.pid] && (
                              <span className="text-[7px] text-txt-tertiary">override</span>
                            )}
                            <select
                              value={athPositions[pl.pid] || defaultPos}
                              onChange={e => setAthPosition(pl.pid, e.target.value)}
                              className="bg-surface-4 border border-slate-700 text-[10px] font-bold text-txt-primary rounded px-1.5 py-0.5 focus:outline-none focus:border-emerald-600 cursor-pointer"
                            >
                              {NON_ATH.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── OVERVIEW PANEL ── */}
          {!showConfig && isOverview && (() => {
            const positions = POSITIONS.filter(p => p !== 'ATH');
            const criticals    = positions.filter(p => allHubs[p]?.verdict?.key === 'critical');
            const depthNeeded  = positions.filter(p => allHubs[p]?.verdict?.key === 'depth-needed');
            const searching    = positions.filter(p => allHubs[p]?.verdict?.key === 'keep-search' && rosterContext[p]?.needsPortal);
            const portals      = positions.filter(p => rosterContext[p]?.needsPortal);
            const totalPortalMin = positions.reduce((s, p) => s + (allHubs[p]?.recruitTarget?.portalMin ?? 0), 0);
            const totalPortalMax = positions.reduce((s, p) => s + (allHubs[p]?.recruitTarget?.portalMax ?? 0), 0);
            const totalHsMin     = positions.reduce((s, p) => s + (allHubs[p]?.recruitTarget?.hsMin ?? 0), 0);
            const totalHsMax     = positions.reduce((s, p) => s + (allHubs[p]?.recruitTarget?.hsMax ?? 0), 0);
            const totalMin = totalPortalMin + totalHsMin;
            const totalMax = totalPortalMax + totalHsMax;
            const { available, returning, leaving } = rosterCapacity;

            return (
              <div className="flex-1 overflow-y-auto divide-y divide-surface-4">

                {/* Class size summary strip */}
                <div className="px-5 py-3 flex items-center justify-between gap-4 flex-wrap bg-surface-3">
                  <div className="flex items-center gap-5 flex-wrap text-[11px]">
                    {criticals.length > 0 && <span className="font-display font-bold text-red-400">{criticals.length} critical</span>}
                    {depthNeeded.length > 0 && <span className="font-display font-bold text-amber-400">{depthNeeded.length} depth needed</span>}
                    {portals.length > 0 && <span className="font-display font-bold text-sky-400">{portals.length} portal</span>}
                    {criticals.length === 0 && depthNeeded.length === 0 && portals.length === 0 && (
                      <span className="font-display font-bold text-emerald-400">All positions covered</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {totalPortalMax > 0 && (
                      <span className="text-[10px] font-display font-bold text-sky-400">
                        {totalPortalMin === totalPortalMax ? totalPortalMin : `${totalPortalMin}–${totalPortalMax}`} portal
                      </span>
                    )}
                    {totalPortalMax > 0 && totalHsMax > 0 && <span className="text-txt-tertiary text-[10px]">+</span>}
                    {totalHsMax > 0 && (
                      <span className="text-[10px] font-display font-bold text-txt-secondary">
                        {totalHsMin === totalHsMax ? totalHsMin : `${totalHsMin}–${totalHsMax}`} recruits
                      </span>
                    )}
                    {totalPortalMax === 0 && totalHsMax === 0 && (
                      <span className="text-[10px] font-display text-txt-tertiary">No investment needed</span>
                    )}
                  </div>
                </div>

                <div className="p-4 space-y-5">

                {/* Critical needs */}
                {criticals.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[8px] font-display font-black uppercase tracking-[0.12em] text-red-500">Critical Needs</p>
                    {criticals.map(pos => {
                      const h  = allHubs[pos];
                      const rc = rosterContext[pos];
                      return (
                        <button key={pos} onClick={() => handlePosChange(pos)}
                          className="w-full text-left rounded-xl border border-red-900/50 bg-red-950/10 overflow-hidden hover:bg-red-950/20 transition">
                          <div className="px-4 py-2.5 border-b border-red-900/30 flex items-center justify-between gap-3">
                            <span className="text-sm font-display font-black uppercase text-red-400">{pos}</span>
                            <div className="flex items-center gap-1.5">
                              {rc?.needsPortal && <span className="text-[8px] font-display font-black uppercase px-1.5 py-0.5 rounded bg-sky-950 border border-sky-700 text-sky-400">Portal</span>}
                              {h.recruitTarget?.max > 0 && <span className="text-[8px] font-display font-black uppercase px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600 text-slate-300">{h.recruitTarget.label}</span>}
                            </div>
                          </div>
                          <div className="px-4 py-3 space-y-1.5">
                            <p className="text-xs font-display font-bold text-txt-primary leading-snug">{h.headline}</p>
                            <p className="text-[11px] text-txt-secondary leading-relaxed">{h.paragraphs[0]}</p>
                            {h.topTargets.length > 0 && (
                              <p className="text-[10px] font-display font-semibold text-emerald-400 mt-0.5">Board: {h.topTargets[0].name} · {normalizeArch(h.topTargets[0].archetype) || '?'}</p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Depth Needed */}
                {depthNeeded.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[8px] font-display font-black uppercase tracking-[0.12em] text-amber-400">Depth Needed · 2–3 Years</p>
                    {depthNeeded.map(pos => {
                      const h = allHubs[pos];
                      return (
                        <button key={pos} onClick={() => handlePosChange(pos)}
                          className="w-full text-left rounded-xl border border-amber-900/40 bg-amber-950/10 overflow-hidden hover:bg-amber-950/20 transition">
                          <div className="px-4 py-2.5 border-b border-amber-900/25 flex items-center justify-between gap-3">
                            <span className="text-sm font-display font-black uppercase text-amber-300">{pos}</span>
                            {h.recruitTarget?.max > 0 && <span className="text-[8px] font-display font-black uppercase px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600 text-slate-300">{h.recruitTarget.label}</span>}
                          </div>
                          <div className="px-4 py-3">
                            <p className="text-xs font-display font-bold text-txt-primary leading-snug">{h.headline}</p>
                            <p className="text-[11px] text-txt-secondary leading-relaxed mt-1">{h.paragraphs[0]}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Portal Priority */}
                {searching.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[8px] font-display font-black uppercase tracking-[0.12em] text-sky-400">Portal Priority</p>
                    {searching.map(pos => {
                      const h = allHubs[pos];
                      return (
                        <button key={pos} onClick={() => handlePosChange(pos)}
                          className="w-full text-left rounded-xl border border-sky-900/40 bg-sky-950/10 overflow-hidden hover:bg-sky-950/20 transition">
                          <div className="px-4 py-2.5 border-b border-sky-900/25 flex items-center justify-between gap-3">
                            <span className="text-sm font-display font-black uppercase text-sky-300">{pos}</span>
                            {h.recruitTarget?.max > 0 && <span className="text-[8px] font-display font-black uppercase px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600 text-slate-300">{h.recruitTarget.label}</span>}
                          </div>
                          <div className="px-4 py-3">
                            <p className="text-xs font-display font-bold text-txt-primary leading-snug">{h.headline}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* All Positions */}
                <div className="space-y-2">
                  <p className="text-[8px] font-display font-black uppercase tracking-[0.12em] text-txt-tertiary">All Positions</p>
                  <div className="rounded-xl border border-surface-4 overflow-hidden divide-y divide-surface-4">
                    {positions.map(pos => {
                      const h  = allHubs[pos];
                      const rc = rosterContext[pos];
                      if (!h) return null;
                      const vk = h.verdict.key;
                      const posColor = vk === 'critical' ? 'text-red-400'
                        : (vk === 'keep-search' || vk === 'depth-needed') ? 'text-amber-300'
                        : (vk === 'covered' || vk === 'close-target' || vk === 'no-investment') ? 'text-emerald-400'
                        : 'text-txt-tertiary';
                      return (
                        <button key={pos} onClick={() => handlePosChange(pos)}
                          className="w-full flex items-center gap-4 px-4 py-2.5 hover:bg-surface-3 transition text-left">
                          <span className={`text-xs font-display font-black uppercase w-9 shrink-0 ${posColor}`}>{pos}</span>
                          <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                            <span className={`text-[8px] font-display font-black uppercase px-1.5 py-0.5 rounded ${h.verdict.badge}`}>{h.verdict.label}</span>
                            {rc?.needsPortal && <span className="text-[8px] font-display font-black uppercase px-1 py-0.5 rounded bg-sky-950 border border-sky-800 text-sky-400">Portal</span>}
                            <span className="text-[10px] text-txt-tertiary">
                              {rc?.returningCount ?? 0} ret
                              {(rc?.seniorCount ?? 0) > 0 && <span className="text-amber-500"> · {rc.seniorCount} out</span>}
                              {(committedByPos[pos] ?? 0) > 0 && <span className="text-emerald-400"> · {committedByPos[pos]} committed</span>}
                            </span>
                          </div>
                          <span className={`text-[10px] font-display font-bold shrink-0 ${
                            h.recruitTarget?.min === 0 && h.recruitTarget?.max === 0 ? 'text-txt-tertiary' : 'text-txt-secondary'
                          }`}>
                            {h.recruitTarget?.label ?? '—'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                </div>
              </div>
            );
          })()}

          {/* Position-specific views (hidden in overview or configure mode) */}
          {!showConfig && !isOverview && (<>


          {/* ── HUB VIEW ── */}
          <div className="p-4 space-y-3 flex-1 overflow-y-auto">

              {/* ── Situation Card: verdict + roster + analyst read ── */}
              <div className={`rounded-xl border p-4 space-y-3 ${hub.verdict.border}`}>

                {/* Header row */}
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <p className="text-[8px] font-display font-black uppercase tracking-[0.12em] text-txt-tertiary">{activePos} · Position Overview</p>
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                    {hub.recruitTarget && (hub.verdict.key !== 'no-investment' || hub.recruitTarget.min > 0) && (
                      <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${
                        hub.recruitTarget.min === 0 && hub.recruitTarget.max === 0
                          ? 'bg-slate-800 border border-slate-600 text-slate-500'
                          : hub.recruitTarget.tight
                          ? 'bg-red-950 border border-red-800 text-red-400'
                          : 'bg-slate-800 border border-slate-600 text-slate-300'
                      }`}>
                        {hub.recruitTarget.label}
                      </span>
                    )}
                    <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${hub.verdict.badge}`}>
                      {hub.verdict.label}
                    </span>
                  </div>
                </div>

                {/* Roster summary line */}
                {rosterContext[activePos] && (() => {
                  const rc = rosterContext[activePos];
                  return (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 border-y border-slate-800/60 text-xs">
                      <span className={`font-display font-bold ${rc.isThin ? 'text-red-400' : rc.lacksStarter ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {rc.count === 0 ? 'No players on roster' : `${rc.count} on roster`}
                      </span>
                      {rc.starterCount > 0 && <span className="font-display text-slate-400"><span className="text-slate-600 mr-1">·</span>{rc.starterCount} starter-caliber</span>}
                      {rc.seniorCount > 0 && <span className="font-display text-amber-500"><span className="text-slate-600 mr-1">·</span>{rc.seniorCount} leaving after this year</span>}
                      <span className={`font-display ${rc.needsPortal ? 'text-red-400 font-bold' : 'text-slate-500'}`}>
                        <span className="text-slate-600 mr-1">·</span>
                        {rc.nextYearStarters ?? 0} starter{(rc.nextYearStarters ?? 0) !== 1 ? 's' : ''} next year
                      </span>
                      {rc.yr2Starters !== undefined && rc.yr2Starters !== rc.nextYearStarters && (
                        <span className={`font-display ${rc.yr2Starters < (rc.nextYearStarters ?? 0) ? 'text-amber-500' : 'text-slate-500'}`}>
                          <span className="text-slate-600 mr-1">·</span>{rc.yr2Starters} yr 2
                        </span>
                      )}
                    </div>
                  );
                })()}

                {/* Sub-position breakdown (OT/OG/DE/OLB) */}
                {hub.subPositionSummary && hub.subPositionSummary.length >= 2 && (
                  <div className="flex gap-2 flex-wrap">
                    {hub.subPositionSummary.map(sg => (
                      <div key={sg.label} className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[8px] font-display font-black uppercase tracking-wide ${
                        sg.needsPortal
                          ? 'bg-red-950/30 border-red-800/50 text-red-400'
                          : sg.isThin
                          ? 'bg-amber-950/30 border-amber-800/50 text-amber-400'
                          : 'bg-slate-900 border-slate-700 text-slate-400'
                      }`}>
                        <span>{sg.label}</span>
                        <span className="opacity-60">·</span>
                        <span>{sg.nextYearStarters} starter{sg.nextYearStarters !== 1 ? 's' : ''} next yr</span>
                        {sg.needsPortal && <span className="text-red-500 ml-0.5">⚠</span>}
                        {!sg.needsPortal && sg.isThin && <span className="text-amber-500 ml-0.5">thin</span>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Analyst read */}
                <h4 className={`text-xs font-display font-black uppercase tracking-wide ${hub.verdict.head}`}>{hub.headline}</h4>
                {hub.paragraphs.map((para, i) => (
                  <p key={i} className="text-xs text-slate-300 leading-relaxed">{para}</p>
                ))}

                {/* ── Recruit strategy toggle ── */}
                {(
                  <div className="pt-1">
                    <p className="text-[8px] font-display font-black uppercase tracking-[0.12em] text-slate-500 mb-1.5">Targeting Strategy</p>
                    <div className="flex gap-2 items-center flex-wrap">
                      {[
                        { key: 'hs',     label: 'HS Recruit',   activeClass: 'bg-emerald-950 border-emerald-700 text-emerald-300', autoClass: 'bg-emerald-950/50 border-emerald-800 text-emerald-400 opacity-75' },
                        { key: 'portal', label: 'Portal Target', activeClass: 'bg-purple-950 border-purple-700 text-purple-300',   autoClass: 'bg-purple-950/50 border-purple-800 text-purple-400 opacity-75'   },
                      ].map(({ key, label, activeClass, autoClass }) => {
                        const manualStrat = posRecruitStrategy[activePos];
                        const hasManual   = manualStrat && (manualStrat.hs || manualStrat.portal);
                        const isActive    = hasManual ? (manualStrat[key] ?? false) : (hub.autoStrategy[key] ?? false);
                        const isManual    = hasManual && (manualStrat[key] ?? false);
                        return (
                          <button
                            key={key}
                            onClick={() => toggleRecruitStrategy(activePos, key)}
                            className={`text-[9px] font-display font-black uppercase tracking-wide px-3 py-1.5 rounded border transition-all ${
                              isActive
                                ? isManual ? activeClass : autoClass
                                : 'bg-slate-900 border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-400'
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                      {posRecruitStrategy[activePos]
                        ? <span className="text-[8px] text-slate-600">· click active to deselect</span>
                        : (hub.autoStrategy.hs || hub.autoStrategy.portal) && <span className="text-[8px] text-slate-600">· system suggestion</span>
                      }
                    </div>

                    {/* Extra targets — independent HS and portal counters */}
                    <div className="mt-2 space-y-1.5">
                      <p className="text-[8px] font-display font-black uppercase tracking-[0.12em] text-slate-500">Additional Targets</p>
                      {[
                        { type: 'hs',     label: 'HS Recruit',    color: 'text-emerald-400' },
                        { type: 'portal', label: 'Portal Target',  color: 'text-purple-400'  },
                      ].map(({ type, label, color }) => {
                        const val = posExtraTargets[activePos]?.[type] ?? 0;
                        return (
                          <div key={type} className="flex items-center gap-2">
                            <span className={`text-[8px] font-display font-black uppercase tracking-wide w-20 ${color}`}>{label}</span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => adjustExtraTargets(activePos, type, -1)}
                                disabled={val === 0}
                                className="w-5 h-5 flex items-center justify-center rounded border border-slate-700 text-slate-400 text-xs font-black hover:border-slate-500 disabled:opacity-30 disabled:cursor-not-allowed transition"
                              >−</button>
                              <span className="text-[10px] font-display font-black text-slate-300 w-4 text-center tabular-nums">{val}</span>
                              <button
                                onClick={() => adjustExtraTargets(activePos, type, 1)}
                                disabled={val >= 5}
                                className="w-5 h-5 flex items-center justify-center rounded border border-slate-700 text-slate-400 text-xs font-black hover:border-slate-500 disabled:opacity-30 disabled:cursor-not-allowed transition"
                              >+</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Current Roster ── */}
              {rosterContext[activePos] && (() => {
                const rc = rosterContext[activePos];
                const QUALITY_CFG = {
                  starter:    { dot: 'bg-emerald-500', text: 'text-emerald-300', bg: 'bg-emerald-950/30 border-emerald-800/40' },
                  developing: { dot: 'bg-amber-500',   text: 'text-amber-300',   bg: 'bg-amber-950/30 border-amber-800/40' },
                  raw:        { dot: 'bg-slate-600',   text: 'text-slate-400',   bg: 'bg-slate-900/60 border-slate-700/40' },
                };
                return (
                  <div className="bg-slate-950/30 border border-slate-800 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[8px] font-display font-black uppercase tracking-[0.12em] text-slate-500">
                        Current Roster · {activePos}
                      </p>
                      <div className="flex items-center gap-3 flex-wrap justify-end">
                        {rc.seniorCount > 0 && (
                          <span className="text-[8px] text-amber-500 font-display font-bold uppercase tracking-wide">
                            {rc.returningCount} returning after {rc.seniorCount} departure{rc.seniorCount !== 1 ? 's' : ''}
                          </span>
                        )}
                        {rc.committedCount > 0 && (
                          <span className="text-[8px] text-sky-400 font-display font-bold uppercase tracking-wide">
                            {rc.committedCount} incoming
                          </span>
                        )}
                      </div>
                    </div>
                    {rc.allPlayers.length === 0 ? (
                      <p className="text-[10px] text-slate-600 italic">No {activePos} players on roster.</p>
                    ) : (
                      <div className="space-y-1">
                        {rc.allPlayers.map((pl, i) => {
                          const q = QUALITY_CFG[pl.quality];
                          return (
                            <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${pl.isLeaving ? 'opacity-60' : ''} ${pl.isIncoming ? 'border-sky-900/40 bg-sky-950/10' : q.bg}`}>
                              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${pl.isIncoming ? 'bg-sky-500' : q.dot}`} />
                              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                <span className={`text-[10px] font-bold min-w-0 truncate ${pl.isIncoming ? 'text-sky-300' : q.text}`}>{pl.name}</span>
                                {pl.pos && <span className="text-[8px] font-display font-black text-slate-600 shrink-0">{pl.pos}</span>}
                              </div>
                              {pl.isATH && <span className="text-[7px] font-black uppercase px-1 py-0.5 rounded bg-purple-950 border border-purple-800 text-purple-400 shrink-0">ATH</span>}
                              {pl.isIncoming && <span className="text-[7px] font-black uppercase px-1.5 py-0.5 rounded bg-sky-950 border border-sky-700 text-sky-400 shrink-0">Incoming</span>}
                              <span className="text-[9px] text-slate-500 tabular-nums shrink-0">{pl.ovr > 0 ? pl.ovr : '—'} OVR</span>
                              <span className="text-[9px] text-slate-500 tabular-nums shrink-0 w-8 text-right">{pl.isIncoming ? `${pl.devTrait || pl.cls}` : pl.cls}</span>
                              {/* Starter projection button — developing/raw players (not incoming commits) */}
                              {(pl.quality === 'developing' || pl.quality === 'raw') && !pl.isIncoming && (() => {
                                const ep = pl.effectiveProj;
                                const manual = pl.isManualProj;
                                const projCfg =
                                  ep === 1 ? { text: '1YR', cls: manual ? 'bg-emerald-950 border-emerald-700 text-emerald-400' : 'bg-slate-800 border-slate-600 text-slate-400 opacity-70' }
                                : ep === 2 ? { text: '2YR', cls: manual ? 'bg-sky-950 border-sky-700 text-sky-400'             : 'bg-slate-800 border-slate-600 text-slate-400 opacity-70' }
                                : ep === 3 ? { text: '3YR', cls: manual ? 'bg-amber-950 border-amber-700 text-amber-400'       : 'bg-slate-800 border-slate-600 text-slate-500 opacity-70' }
                                : ep === 0 ? { text: 'No Start', cls: 'bg-red-950 border-red-900 text-red-600 opacity-70' }
                                :            { text: '—', cls: 'bg-slate-900 border-slate-800 text-slate-700' };
                                return (
                                  <button
                                    onClick={e => { e.stopPropagation(); cycleProjection(pl.pid); }}
                                    title="Projected starter timeline — click to cycle: 1YR → 2YR → 3YR → No Start → default"
                                    className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded border shrink-0 transition hover:opacity-75 ${projCfg.cls}`}
                                  >
                                    {projCfg.text}
                                  </button>
                                );
                              })()}
                              {pl.isSenior && !pl.leavingType && !pl.isIncoming && (
                                <span className="text-[7px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-950 border border-amber-700 text-amber-400 shrink-0">Leaving</span>
                              )}
                              {!pl.isSenior && !pl.isIncoming && (
                                <button
                                  onClick={e => { e.stopPropagation(); cycleLeaving(pl.pid); }}
                                  title="Departure risk — click to cycle: Draft Risk → Transfer Risk → Cut → clear"
                                  className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded border shrink-0 transition ${
                                    pl.leavingType === 'draft'
                                      ? 'bg-orange-950 border-orange-700 text-orange-400 hover:opacity-75'
                                      : pl.leavingType === 'transfer'
                                      ? 'bg-purple-950 border-purple-700 text-purple-400 hover:opacity-75'
                                      : pl.leavingType === 'cut'
                                      ? 'bg-red-950 border-red-700 text-red-400 hover:opacity-75'
                                      : 'bg-slate-900 border-slate-700 text-slate-700 hover:text-slate-400 hover:border-slate-500'
                                  }`}
                                >
                                  {pl.leavingType === 'draft' ? 'Draft Risk' : pl.leavingType === 'transfer' ? 'Transfer Risk' : pl.leavingType === 'cut' ? 'Cut' : 'Leaving'}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── Best Targets on Board ── */}
              {hub.topTargets.length > 0 && (
                <div className="bg-slate-950/30 border border-slate-800 rounded-xl p-4 space-y-2">
                  <p className="text-[8px] font-display font-black uppercase tracking-[0.12em] text-slate-500">
                    Best Targets on Board · {posPlayers.length} prospect{posPlayers.length !== 1 ? 's' : ''}
                  </p>
                  <div className="space-y-1">
                    {hub.topTargets.map((pl, i) => {
                      const t = TIER_UI[pl.tier];
                      const g = getGrade(pl.score);
                      const archName = normalizeArch(pl.archetype ?? '');
                      return (
                        <button
                          key={i}
                          onClick={() => setActiveArch(archName || archList[0])}
                          className="w-full flex items-center gap-3 text-left px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-600 hover:bg-slate-800/60 transition"
                        >
                          <div className={`w-2 h-2 rounded-full shrink-0 ${t.dot}`} />
                          <span className="text-[11px] font-bold text-white flex-1 min-w-0 truncate">{pl.name}</span>
                          <span className="text-[9px] text-slate-500 shrink-0 truncate max-w-[90px]">{archName || '—'}</span>
                          <span className="text-[9px] text-slate-500">{pl.stars}★</span>
                          <span className={`text-[9px] tabular-nums ${t.text}`}>{pl.score.toFixed(0)}</span>
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${g.cls}`}>{g.grade}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Archetype recommendations removed per user request */}
              {false && (() => {
                const rc = rosterContext[activePos];
                const playStyle = rosterContext._playStyle || 'balanced';
                const STYLE_UI = {
                  'pass-heavy': { label: 'Pass-Heavy Scheme', cls: 'bg-sky-950 border border-sky-700 text-sky-400' },
                  'run-heavy':  { label: 'Run-Heavy Scheme',  cls: 'bg-amber-950 border border-amber-700 text-amber-400' },
                  'balanced':   { label: 'Balanced Scheme',   cls: 'bg-slate-800 border border-slate-600 text-slate-400' },
                };
                const styleUi = STYLE_UI[playStyle];

                // Per-archetype depth analysis against current returning roster
                const archRecs = archList.map(arch => {
                  const archNorm = arch.toLowerCase().replace(/\s+/g, '').replace(/[()]/g, '');
                  const players = (rc?.allPlayers || []).filter(pl => {
                    const pn = (pl.archetype || '').toLowerCase().replace(/\s+/g, '').replace(/[()]/g, '');
                    return pn === archNorm || pn.startsWith(archNorm.replace(/ot$|og$|c$/, ''));
                  });
                  const returning = players.filter(p => !p.isSenior);
                  const leaving   = players.filter(p => p.isSenior);
                  const tendency  = ARCH_TENDENCY[arch] || 'balanced';
                  const fits = tendency === playStyle || tendency === 'balanced' || playStyle === 'balanced';
                  const boardArch = hub.archStats.find(a => a.arch === arch);
                  const boardT1 = boardArch?.t1c ?? 0;
                  const boardT2 = boardArch?.t2c ?? 0;

                  let status, reason;
                  if (returning.length === 0 && leaving.length > 0) {
                    status = 'target';
                    reason = `${leaving.length} departing — no replacement on roster`;
                  } else if (returning.length === 0) {
                    status = 'target';
                    reason = 'No current players at this archetype';
                  } else if (returning.length === 1) {
                    status = 'consider';
                    reason = `1 returning — thin on depth`;
                  } else {
                    status = 'covered';
                    reason = `${returning.length} returning`;
                  }

                  return { arch, status, reason, returning: returning.length, leaving: leaving.length, fits, tendency, boardT1, boardT2 };
                });

                const targeted  = archRecs.filter(a => a.status === 'target').length;
                const considers = archRecs.filter(a => a.status === 'consider').length;

                return (
                  <div className="bg-slate-950/30 border border-slate-800 rounded-xl p-4 space-y-3">
                    {/* Header */}
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[8px] font-display font-black uppercase tracking-[0.12em] text-slate-500">
                        Archetype Recommendations
                        {targeted > 0 && <span className="ml-2 text-red-400">{targeted} needed</span>}
                        {targeted === 0 && considers > 0 && <span className="ml-2 text-amber-400">{considers} thin</span>}
                      </p>
                      <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded shrink-0 ${styleUi.cls}`}>
                        {styleUi.label}
                      </span>
                    </div>
                    <p className="text-[9px] text-slate-600 leading-snug">
                      Depth analysis per archetype based on returning roster.{' '}
                      {playStyle !== 'balanced' ? `Team tendency favors ${playStyle === 'pass-heavy' ? 'passing archetypes' : 'run archetypes'} — scheme fits noted.` : 'Balanced scheme — no strong tendency.'}
                    </p>

                    {/* Archetype rows */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                      {archRecs.map(({ arch, status, reason, returning: ret, leaving: lv, fits, boardT1, boardT2 }) => {
                        const isPref = (preferredArchs[activePos] ?? []).includes(arch);
                        const STATUS_CFG = {
                          target:  { dot: 'bg-red-500',     badge: 'bg-red-950 border border-red-700 text-red-400',       label: 'Target'  },
                          consider:{ dot: 'bg-amber-500',   badge: 'bg-amber-950 border border-amber-700 text-amber-400', label: 'Thin'    },
                          covered: { dot: 'bg-emerald-500', badge: 'bg-emerald-950 border border-emerald-700 text-emerald-400', label: 'Covered' },
                        };
                        const cfg = STATUS_CFG[status];
                        return (
                          <button
                            key={arch}
                            onClick={() => setActiveArch(arch)}
                            className="flex items-start gap-2.5 text-left px-3 py-2.5 rounded-lg hover:bg-slate-800/60 transition group"
                          >
                            <div className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1 ${cfg.dot}`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] font-bold text-slate-300 group-hover:text-white transition truncate">{arch}</span>
                                {fits && playStyle !== 'balanced' && (
                                  <span className="text-[7px] font-black uppercase px-1 py-0 rounded bg-sky-950 border border-sky-800 text-sky-500 shrink-0">Fits</span>
                                )}
                                {isPref && (
                                  <span className="text-[7px] font-black uppercase px-1 py-0 rounded bg-emerald-950 border border-emerald-700 text-emerald-400 shrink-0">Preferred</span>
                                )}
                              </div>
                              <p className="text-[8px] text-slate-600 mt-0.5 leading-tight">{reason}</p>
                              {(boardT1 > 0 || boardT2 > 0) && (
                                <div className="flex gap-1 mt-0.5">
                                  {boardT1 > 0 && <span className={`text-[7px] font-black px-1 py-0 rounded ${TIER_UI[0].text}`}>T1×{boardT1} on board</span>}
                                  {boardT2 > 0 && <span className={`text-[7px] font-black px-1 py-0 rounded ${TIER_UI[1].text}`}>T2×{boardT2} on board</span>}
                                </div>
                              )}
                            </div>
                            <span className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${cfg.badge}`}>{cfg.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

            </div>
          </>)}

        </div>
      </div>
    </div>
  );
}
