import React, { useState, useEffect, useMemo } from 'react';
import { getStaffData } from './staffDB';
import { PROFILES, POSITIONS } from './ThresholdLookup';
import { archetypeBaseScore, normalizeArch } from './archetypeWeights';
import { isPlayerOnRoster } from '../context/DynastyContext';

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
const POS_MIN_DEPTH = { QB:2, HB:3, WR:5, TE:2, OT:4, OG:4, C:2, DE:3, DT:3, OLB:3, MIKE:2, CB:4, FS:2, SS:2, ATH:0 };
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
  critical:       { border: 'border-red-900/50 bg-red-950/10',       head: 'text-red-400',     badge: 'bg-red-950 border border-red-700 text-red-400' },
  'keep-search':  { border: 'border-amber-900/50 bg-amber-950/10',   head: 'text-amber-300',   badge: 'bg-amber-950 border border-amber-700 text-amber-400' },
  'close-target': { border: 'border-emerald-800/40 bg-emerald-950/10', head: 'text-emerald-300', badge: 'bg-emerald-950 border border-emerald-700 text-emerald-400' },
  monitor:        { border: 'border-sky-900/40 bg-sky-950/10',        head: 'text-sky-300',     badge: 'bg-sky-950 border border-sky-700 text-sky-400' },
  covered:        { border: 'border-emerald-800/40 bg-emerald-950/10', head: 'text-emerald-300', badge: 'bg-emerald-950 border border-emerald-700 text-emerald-400' },
  'no-board':     { border: 'border-slate-800 bg-slate-900/30',        head: 'text-slate-400',   badge: 'bg-slate-800 border border-slate-600 text-slate-400' },
};

// ── Position hub builder ──────────────────────────────────────────────────────
function buildPositionHub(pos, posPlayers, archList, rosterCtx, availableSpots) {
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
  const rosterNeed    = (rc?.isThin || rc?.lacksStarter || immediateNeed || pipelineNeed) ?? false;
  const hasT1        = t1Archs.length > 0;
  const hasT2        = t2Archs.length > 0;
  const hasBoard     = posPlayers.length > 0;
  const rosterDesc   = rc ? (rc.count === 0 ? `No ${pos}s on the current roster` : `${rc.count} ${pos}${rc.count !== 1 ? 's' : ''} on roster${rc.starterCount > 0 ? `, ${rc.starterCount} starter-caliber` : ', none starter-caliber'}`) : null;
  const t1Names      = t1Archs.flatMap(a => a.scored.filter(s => s.tier === 0)).sort((a, b) => b.score - a.score).slice(0, 2).map(s => s.name);
  const t2Names      = t2Archs.flatMap(a => a.scored.filter(s => s.tier === 1)).sort((a, b) => b.score - a.score).slice(0, 1).map(s => s.name);

  let verdictKey;
  if (!hasBoard && rosterNeed)      verdictKey = 'critical';
  else if (!hasBoard)                verdictKey = 'no-board';
  else if (rosterNeed && hasT1)     verdictKey = 'close-target';
  else if (rosterNeed && hasT2)     verdictKey = 'keep-search';
  else if (rosterNeed)               verdictKey = 'critical';
  else if (hasT1)                    verdictKey = 'covered';
  else if (hasT2)                    verdictKey = 'monitor';
  else                               verdictKey = 'keep-search';

  const VERDICT_LABELS = {
    critical: 'Critical Need', 'keep-search': 'Keep Searching',
    'close-target': 'Close the Target', monitor: 'Monitor', covered: 'Board Set', 'no-board': 'No Board Data',
  };
  const verdict = { key: verdictKey, label: VERDICT_LABELS[verdictKey], ...VERDICT_STYLES[verdictKey] };

  let headline, paragraphs;
  if (verdictKey === 'critical' && !hasBoard) {
    headline = immediateNeed
      ? `${pos} is exposed — starter leaves next year with nothing on the board`
      : `${pos} pipeline gap — nothing filed and depth is forming a hole`;
    paragraphs = [
      rosterDesc ? `${rosterDesc} — this is a real gap, not a depth concern.` : `No ${pos} recruits on file and roster is thin.`,
      immediateNeed
        ? `The transfer portal has to be the primary solution here. A true freshman starter is the exception, not the plan — it would take a genuinely special prospect to justify relying on one. File reports to start building the long-term pipeline at the same time.`
        : `File reports and build this board now. The right recruit signed this class solves the 2–3 year gap before it turns into an emergency.`,
    ];
  } else if (verdictKey === 'critical') {
    headline = immediateNeed
      ? `${pos} needs a starter next year — board isn't answering it`
      : `${pos} pipeline gap — board below threshold`;
    paragraphs = [
      rosterDesc ? `${rosterDesc}. Nothing on the current board clears the benchmark needed to address this gap.` : `No Tier 1 or Tier 2 targets on the ${pos} board.`,
      immediateNeed
        ? `The portal is the stronger play for an immediate starter. What's on file isn't ready for that role — keep the board active in parallel to build the long-term pipeline.`
        : `Expand the search. What's on file isn't answering the 2–3 year need — higher-caliber targets have to surface before this class closes.`,
    ];
  } else if (verdictKey === 'close-target') {
    headline = immediateNeed
      ? `${pos} need is urgent — elite target on the board may be able to contribute immediately`
      : `${pos} pipeline need covered — elite target already on the board`;
    paragraphs = [
      rosterDesc ? `${rosterDesc}. ${t1Names.length > 0 ? t1Names.join(' and ') : 'A Tier 1 target'} is in the pipeline and directly addresses the gap.` : `${t1Names.length > 0 ? t1Names.join(' and ') : 'A Tier 1 target'} is on the board at ${pos}.`,
      immediateNeed
        ? `A true freshman starter is rare — but this is the kind of elite talent where it's possible. Commit and monitor closely. Also evaluate the portal for a bridge option in case the timeline doesn't hold.`
        : `The 2–3 year window is covered. Priority now is commitment management, not more searching — lock this in and shift bandwidth elsewhere.`,
    ];
  } else if (verdictKey === 'keep-search') {
    headline = immediateNeed
      ? `${pos} needs a starter next year — only Tier 2 options on the board`
      : `${pos} pipeline gap — Tier 2 exists but no elite answer yet`;
    paragraphs = [
      rosterDesc ? `${rosterDesc}. ${t2Names.length > 0 ? t2Names[0] + ' is a Tier 2 option' : 'Tier 2 depth exists on the board'} but no Tier 1 answer has surfaced.` : `Board has Tier 2 depth at ${pos} — no Tier 1 target yet.`,
      immediateNeed
        ? `Tier 2 alone won't solve a next-year starter need. The portal is the better path for immediate help — keep recruiting simultaneously for the long-term pipeline.`
        : `Good start, but not the answer for the pipeline window. Hold out for a higher-caliber recruit before committing to a fallback.`,
    ];
  } else if (verdictKey === 'covered') {
    headline = `${pos} is in good shape — close, don't keep searching`;
    paragraphs = [
      rosterDesc ? `${rosterDesc}. ${t1Names.length > 0 ? t1Names.join(' and ') + (t1Names.length > 1 ? ' are elite targets' : ' is an elite target') : 'Elite board targets'} build on that foundation — this is a position of strength.` : `Elite ${pos} targets on the board. Position group is well set.`,
      t1Archs.length > 1 ? `Tier 1 options across ${t1Archs.length} archetypes. Close whichever fits best and redirect bandwidth to positions that actually need work.` : `Close the Tier 1 target and move bandwidth to positions that need it more.`,
    ];
  } else if (verdictKey === 'monitor') {
    headline = `${pos} is stable — solid board depth, no elite target yet`;
    paragraphs = [
      rosterDesc ? `${rosterDesc}. Board adds Tier 2 options to work with. Nothing here is urgent — this position isn't the fire that needs putting out.` : `Tier 2 board depth at ${pos}. No Tier 1 target yet.`,
      `Stay alert for an elite upgrade if one surfaces. Otherwise, primary recruiting focus belongs at positions with actual gaps.`,
    ];
  } else if (verdictKey === 'no-board') {
    headline = `${pos} — no board data, roster holding for now`;
    paragraphs = [
      rosterDesc ? `${rosterDesc}. Nothing on file at this position yet — but no immediate crisis with the current group.` : `Nothing filed at ${pos} yet.`,
      `Not a priority need right now. If a quality ${pos} surfaces organically, worth a look — but don't spend bandwidth here.`,
    ];
  } else {
    // keep-search verdict, !rosterNeed: board exists but only T3/T4 — roster is fine
    headline = `${pos} board below benchmarks — not an urgent need`;
    paragraphs = [
      rosterDesc ? `${rosterDesc}. Board exists but no prospects have cleared Tier 2 thresholds yet. Roster is holding — not a gap that needs filling right now.` : `${pos} board is below benchmark, but roster is stable.`,
      `Not a priority. Only pursue ${pos} if a genuinely high-caliber prospect surfaces on its own — direct recruiting bandwidth to positions with actual gaps.`,
    ];
  }

  // ── Recruit target count ─────────────────────────────────────────────────────
  const minDepth_    = POS_MIN_DEPTH[pos]  ?? 2;
  const minStarter_  = POS_STARTERS[pos]   ?? 1;
  const spots        = availableSpots ?? 20;
  const depthGap     = Math.max(0, minDepth_   - (rc?.returningCount ?? 0));
  const starterGap   = Math.max(0, minStarter_ - (rc?.nextYearStarters ?? 0));
  const pipelineAdd  = rc?.needsRecruit ? 1 : 0;
  // Base: fill the depth gap + pipeline slot, add 1 for competition when filling a gap
  let rtMin = Math.max(depthGap, starterGap > 0 && !immediateNeed ? 1 : depthGap);
  let rtMax = rtMin + pipelineAdd + (depthGap > 0 ? 1 : 0);
  // Tighten when roster is nearly full
  if (spots <= 5)  { rtMin = rosterNeed ? 1 : 0; rtMax = rosterNeed ? 1 : 0; }
  else if (spots <= 10) { rtMax = Math.min(rtMax, rosterNeed ? 2 : 1); }
  rtMin = Math.max(0, rtMin);
  rtMax = Math.max(rtMin, Math.min(rtMax, 5));

  const recruitLabel = rtMin === 0 && rtMax === 0 ? 'No investment needed'
    : rtMin === rtMax ? `${rtMin} recruit${rtMin !== 1 ? 's' : ''} this class`
    : `${rtMin}–${rtMax} recruits this class`;

  // Add quantitative recommendation as final paragraph
  if (spots <= 5 && rtMin === 0) {
    paragraphs.push(`Roster spots are nearly maxed out — hold off at ${pos} unless it's an exceptional opportunity that falls in your lap.`);
  } else if (spots <= 10 && rosterNeed) {
    paragraphs.push(`Roster space is tight overall. Budget 1 spot for ${pos} — prioritize your highest-need positions with the remaining room.`);
  } else if (rtMin === 0 && rtMax === 0) {
    paragraphs.push(`No roster investment needed at ${pos} this class. Depth and pipeline are covered — spend those spots elsewhere.`);
  } else {
    paragraphs.push(
      rtMin === rtMax
        ? `Recommendation: target ${rtMin} recruit${rtMin !== 1 ? 's' : ''} at ${pos} this class to hit the right depth.`
        : `Recommendation: budget ${rtMin}–${rtMax} spots for ${pos} this class — the low end covers the gap, the high end adds depth and competition.`
    );
  }

  const recruitTarget = { min: rtMin, max: rtMax, label: recruitLabel, tight: spots < 10 };

  return { headline, paragraphs, archStats, topTargets, verdict, recruitTarget };
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ScoutAnalysis({ players = [], teamColors, teamLogo, dynasty, committedRecruits = [] }) {
  const p = teamColors?.primary || '#374151';
  const [activePos, setActivePos]   = useState('QB');
  const [activeArch, setActiveArch] = useState(null); // null = hub view
  const [isOverview, setIsOverview] = useState(true);  // start on the overview
  const [analystImg, setAnalystImg]  = useState('');
  const [analystName, setAnalystName] = useState('Data Analyst');

  useEffect(() => {
    async function load() {
      const img  = await getStaffData('analyst_img');
      const name = await getStaffData('analyst_name');
      if (img)  setAnalystImg(img);
      if (name) setAnalystName(name);
    }
    load();
  }, []);

  // Build a per-position roster summary from the live dynasty data
  const rosterContext = useMemo(() => {
    if (!dynasty?.players || !dynasty?.currentTid) return {};
    const tid  = dynasty.currentTid;
    const year = Number(dynasty.currentYear);
    const onRoster = (dynasty.players || []).filter(p => !p.isHonorOnly && isPlayerOnRoster(p, tid, year));

    const result = {};
    POSITIONS.forEach(pos => {
      if (pos === 'ATH') return;
      const validPos = new Set(POS_TO_POSITIONS[pos] || [pos]);
      const group = onRoster.filter(pl => {
        const pp = (pl.positionByYear?.[year] ?? pl.positionByYear?.[String(year)] ?? pl.position ?? '').toUpperCase();
        return validPos.has(pp);
      });
      const toOvr = pl => Number(pl.overallByYear?.[year] ?? pl.overallByYear?.[String(year)] ?? pl.overall ?? 0);
      const sorted = [...group].sort((a, b) => toOvr(b) - toOvr(a));
      const minDepth   = POS_MIN_DEPTH[pos] ?? 2;
      const minStarter = POS_STARTERS[pos] ?? 1;
      const starterCount    = group.filter(pl => toOvr(pl) >= 80).length;
      const developingCount = group.filter(pl => { const o = toOvr(pl); return o >= 70 && o < 80; }).length;
      const allPlayers = sorted.map(pl => {
        const cls = pl.classByYear?.[year] ?? pl.classByYear?.[String(year)] ?? pl.class ?? '?';
        const ovr = toOvr(pl);
        const yl  = yearsLeft(cls);
        return {
          name: pl.name, ovr, cls, yearsLeft: yl,
          isSenior: yl === 0,
          archetype: pl.archetype || '',
          quality: ovr >= 80 ? 'starter' : ovr >= 70 ? 'developing' : 'raw',
        };
      });
      const seniorCount       = allPlayers.filter(p => p.isSenior).length;
      const returningCount    = allPlayers.length - seniorCount;
      // Projection: starters available in each future window
      const nextYearStarters  = allPlayers.filter(p => p.yearsLeft >= 1 && p.quality === 'starter').length;
      const yr2Starters       = allPlayers.filter(p => p.yearsLeft >= 2 && p.quality === 'starter').length;
      const yr3Starters       = allPlayers.filter(p => p.yearsLeft >= 3 && p.quality === 'starter').length;
      const nextYearCount     = allPlayers.filter(p => p.yearsLeft >= 1).length;
      // needsPortal: starter gap arrives next year — recruiting can't fill it in time
      const needsPortal       = nextYearStarters < minStarter;
      // needsRecruit: pipeline thin in the 2–3 year recruiting window
      const needsRecruit      = yr2Starters < minStarter || yr3Starters < minStarter;
      result[pos] = {
        count: group.length,
        starterCount,
        developingCount,
        rawCount: group.length - starterCount - developingCount,
        isThin: group.length < minDepth,
        lacksStarter: starterCount < minStarter,
        allPlayers,
        seniorCount,
        returningCount,
        nextYearStarters,
        yr2Starters,
        yr3Starters,
        nextYearCount,
        needsPortal,
        needsRecruit,
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
  }, [dynasty]);

  const handlePosChange = pos => {
    setActivePos(pos);
    setActiveArch(null);
    setIsOverview(false);
  };

  // Total roster capacity across all positions
  const rosterCapacity = useMemo(() => {
    let total = 0, leaving = 0;
    POSITIONS.forEach(pos => {
      if (pos === 'ATH') return;
      const rc = rosterContext[pos];
      if (!rc) return;
      total   += rc.count;
      leaving += rc.seniorCount;
    });
    const returning  = total - leaving;
    const available  = Math.max(0, 85 - returning);
    const pct        = Math.min(100, Math.round((returning / 85) * 100));
    return { total, leaving, returning, available, pct };
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
      );
    });
    return result;
  }, [players, rosterContext, rosterCapacity]);

  const profile = PROFILES[activePos];
  const archList = profile.archetypes;
  const posPlayers = players.filter(pl => pl.position === activePos);

  // Hub data (always computed)
  const hub = buildPositionHub(activePos, posPlayers, archList, rosterContext[activePos], rosterCapacity.available);

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
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: '#080c14', border: `1px solid ${p}22` }}>
        {teamLogo && <img src={teamLogo} alt="" className="w-6 h-6 object-contain flex-shrink-0" style={{ opacity: 0.7 }} />}
        <p style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(1.1rem, 3vw, 1.5rem)', color: p, letterSpacing: '0.08em', lineHeight: 1 }}>DATA ANALYSIS</p>
      </div>

      {/* Portrait + Info row */}
      <div className="flex flex-col sm:flex-row gap-4 items-stretch">
        {/* Analyst portrait card */}
        <div className="relative rounded-xl overflow-hidden w-full h-40 sm:w-[110px] sm:h-[280px] sm:flex-shrink-0">
          {analystImg
            ? <img src={analystImg} alt="" className="absolute inset-0 w-full h-full object-cover object-top" />
            : <div className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-500" style={{ background: '#0a0f1a' }}>N/A</div>
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
                {fn && <p style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(0.7rem, 1.5vw, 0.9rem)', color: 'rgba(255,255,255,0.75)', letterSpacing: '0.06em', lineHeight: 1, textShadow: '0 1px 8px rgba(0,0,0,1), 0 2px 16px rgba(0,0,0,1)' }}>{fn}</p>}
                <p style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(1.4rem, 3.5vw, 2rem)', color: 'white', letterSpacing: '0.04em', lineHeight: 1, textShadow: '0 1px 8px rgba(0,0,0,1), 0 2px 16px rgba(0,0,0,1)' }}>{ln}</p>
                <p style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '0.6rem', color: p, letterSpacing: '0.1em', lineHeight: 1.4, textShadow: '0 1px 8px rgba(0,0,0,1)' }}>DATA ANALYST</p>
              </>;
            })()}
          </div>
        </div>

        {/* Info card */}
        <div className="flex-1 relative rounded-xl overflow-hidden p-4 flex flex-col gap-2" style={{ background: '#080c14', border: `1px solid ${p}22` }}>
          {teamLogo && <img src={teamLogo} alt="" className="absolute right-3 top-3 w-16 h-16 object-contain pointer-events-none select-none" style={{ opacity: 0.06 }} />}
          <p style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(1.4rem, 3vw, 2rem)', color: 'white', letterSpacing: '0.06em', lineHeight: 1 }}>RECRUITING ANALYSIS</p>
          <p className="text-[9px] text-slate-500 leading-snug">Roster depth analysis with recruiting recommendations based on current squad composition. Benchmarks update as more players are scouted.</p>
          <p className="text-[10px] text-slate-400 italic leading-snug mt-auto">{globalQuote(players)}</p>
        </div>
      </div>

      {/* ── Roster Capacity ── */}
      {rosterCapacity.total > 0 && (() => {
        const { total, leaving, returning, available, pct } = rosterCapacity;
        const spotColor = available >= 15 ? 'text-emerald-400' : available >= 8 ? 'text-amber-400' : 'text-red-400';
        const barColor  = pct >= 95 ? '#ef4444' : pct >= 85 ? '#f59e0b' : '#10b981';
        const badgeCls  = available >= 15 ? 'bg-emerald-950 border border-emerald-700 text-emerald-400'
                        : available >= 8  ? 'bg-amber-950 border border-amber-700 text-amber-400'
                        : 'bg-red-950 border border-red-700 text-red-400';
        return (
          <div className="rounded-xl p-4 space-y-2.5" style={{ background: '#080c14', border: `1px solid ${p}22` }}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Roster Capacity</p>
              <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded shrink-0 ${badgeCls}`}>
                {available} spot{available !== 1 ? 's' : ''} available
              </span>
            </div>
            {/* Fill bar */}
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
            </div>
            {/* Stat row */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[9px]">
              <span className="font-bold text-white">{returning} / 85 returning</span>
              {leaving > 0 && <span className="text-amber-500"><span className="text-slate-700 mr-1.5">·</span>{leaving} graduating this year</span>}
              <span className={`font-bold ${spotColor}`}><span className="text-slate-700 mr-1.5">·</span>{available} open {available === 1 ? 'spot' : 'spots'} to fill</span>
              {total !== returning + leaving && <span className="text-slate-600"><span className="text-slate-700 mr-1.5">·</span>{total} currently on roster</span>}
            </div>
          </div>
        );
      })()}

      {/* Main panel */}
      <div className="rounded-xl overflow-hidden flex flex-col md:flex-row min-h-[560px]" style={{ background: '#080c14', border: `1px solid ${p}22` }}>

        {/* Position nav */}
        <div className="w-full md:w-28 bg-slate-950/40 border-b md:border-b-0 md:border-r border-slate-800 p-2 flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-x-visible scrollbar-none shrink-0">
          {/* Overview button */}
          <button
            onClick={() => { setIsOverview(true); setActiveArch(null); }}
            className={`text-[10px] font-black uppercase tracking-wider px-2 py-2 rounded-lg transition shrink-0 text-center ${
              isOverview
                ? 'bg-sky-600 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            Overview
          </button>
          <div className="w-full h-px bg-slate-800 shrink-0 md:block hidden" />
          {POSITIONS.map(pos => {
            const posCount = players.filter(pl => pl.position === pos).length;
            const hasT1    = players.some(pl => pl.position === pos && getTier(computeScore(pl)) === 0);
            const posHub   = allHubs[pos];
            const isCritical = posHub?.verdict?.key === 'critical';
            return (
              <button
                key={pos}
                onClick={() => handlePosChange(pos)}
                className={`relative text-[10px] font-black uppercase tracking-wider px-2 py-2 rounded-lg transition shrink-0 text-center ${
                  !isOverview && activePos === pos
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {pos}
                {isCritical && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500" />
                )}
                {!isCritical && posCount > 0 && (
                  <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${hasT1 ? 'bg-emerald-400' : 'bg-amber-500'}`} />
                )}
              </button>
            );
          })}
        </div>

        {/* Right panel */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* ── OVERVIEW PANEL ── */}
          {isOverview && (() => {
            const positions = POSITIONS.filter(p => p !== 'ATH');
            const criticals  = positions.filter(p => allHubs[p]?.verdict?.key === 'critical');
            const searching  = positions.filter(p => allHubs[p]?.verdict?.key === 'keep-search' && rosterContext[p]?.needsPortal);
            const portals    = positions.filter(p => rosterContext[p]?.needsPortal);
            const totalMin   = positions.reduce((s, p) => s + (allHubs[p]?.recruitTarget?.min ?? 0), 0);
            const totalMax   = positions.reduce((s, p) => s + (allHubs[p]?.recruitTarget?.max ?? 0), 0);
            const { available, returning, leaving } = rosterCapacity;

            return (
              <div className="p-4 space-y-4 flex-1 overflow-y-auto">

                {/* Roster capacity banner */}
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-3 py-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-[9px]">
                  <span className="font-bold text-white">{returning} / 85 returning</span>
                  {leaving > 0 && <span className="text-amber-400"><span className="text-slate-700 mr-1">·</span>{leaving} graduating</span>}
                  <span className={`font-bold ${available >= 15 ? 'text-emerald-400' : available >= 8 ? 'text-amber-400' : 'text-red-400'}`}><span className="text-slate-700 mr-1">·</span>{available} open spot{available !== 1 ? 's' : ''}</span>
                  {portals.length > 0 && <span className="text-sky-400"><span className="text-slate-700 mr-1">·</span>{portals.length} position{portals.length !== 1 ? 's' : ''} with portal need</span>}
                  <span className="text-slate-400 ml-auto"><span className="text-slate-700 mr-1">·</span>Recommended class: {totalMin === totalMax ? totalMin : `${totalMin}–${totalMax}`} recruits</span>
                </div>

                {/* Critical needs */}
                {criticals.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[9px] font-black uppercase tracking-widest text-red-500">Critical Needs</p>
                    {criticals.map(pos => {
                      const h = allHubs[pos];
                      const rc = rosterContext[pos];
                      return (
                        <button key={pos} onClick={() => handlePosChange(pos)}
                          className="w-full text-left rounded-xl border border-red-900/50 bg-red-950/10 p-3 hover:bg-red-950/20 transition space-y-1.5">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[11px] font-black uppercase text-red-400">{pos}</span>
                            <div className="flex items-center gap-1.5">
                              {rc?.needsPortal && <span className="text-[7px] font-black uppercase px-1.5 py-0.5 rounded bg-sky-950 border border-sky-700 text-sky-400">Portal</span>}
                              {h.recruitTarget && h.recruitTarget.max > 0 && <span className="text-[7px] font-black uppercase px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600 text-slate-300">{h.recruitTarget.label}</span>}
                            </div>
                          </div>
                          <p className="text-[10px] text-slate-300 leading-snug">{h.headline}</p>
                          <p className="text-[9px] text-slate-500 leading-snug">{h.paragraphs[0]}</p>
                          {h.topTargets.length > 0 && (
                            <p className="text-[8px] text-emerald-400 font-bold">Top board: {h.topTargets[0].name} ({normalizeArch(h.topTargets[0].archetype) || '?'})</p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Portal-priority searching positions */}
                {searching.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[9px] font-black uppercase tracking-widest text-amber-500">Portal Priority</p>
                    {searching.map(pos => {
                      const h = allHubs[pos];
                      return (
                        <button key={pos} onClick={() => handlePosChange(pos)}
                          className="w-full text-left rounded-xl border border-amber-900/50 bg-amber-950/10 p-3 hover:bg-amber-950/20 transition space-y-1">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[11px] font-black uppercase text-amber-300">{pos}</span>
                            {h.recruitTarget?.max > 0 && <span className="text-[7px] font-black uppercase px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600 text-slate-300">{h.recruitTarget.label}</span>}
                          </div>
                          <p className="text-[10px] text-slate-300 leading-snug">{h.headline}</p>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Full position snapshot */}
                <div className="space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">All Positions</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {positions.map(pos => {
                      const h   = allHubs[pos];
                      const rc  = rosterContext[pos];
                      if (!h) return null;
                      const vk  = h.verdict.key;
                      const rowBorder = vk === 'critical' ? 'border-red-900/40' : vk === 'keep-search' ? 'border-amber-900/30' : 'border-slate-800';
                      return (
                        <button key={pos} onClick={() => handlePosChange(pos)}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${rowBorder} hover:bg-slate-800/50 transition text-left`}>
                          <span className={`text-[10px] font-black uppercase w-8 shrink-0 ${
                            vk === 'critical' ? 'text-red-400' : vk === 'keep-search' ? 'text-amber-300' : vk === 'covered' || vk === 'close-target' ? 'text-emerald-400' : 'text-slate-400'
                          }`}>{pos}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${h.verdict.badge}`}>{h.verdict.label}</span>
                              {rc?.needsPortal && <span className="text-[7px] font-black uppercase px-1 py-0.5 rounded bg-sky-950 border border-sky-800 text-sky-400">Portal</span>}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-[8px] text-slate-500">
                              <span>{rc?.returningCount ?? 0} returning</span>
                              {(rc?.seniorCount ?? 0) > 0 && <span className="text-amber-600">{rc.seniorCount} leaving</span>}
                              {(committedByPos[pos] ?? 0) > 0 && <span className="text-emerald-500 font-bold">{committedByPos[pos]} committed</span>}
                            </div>
                          </div>
                          <span className={`text-[8px] font-bold shrink-0 text-right ${
                            h.recruitTarget?.min === 0 && h.recruitTarget?.max === 0 ? 'text-slate-600' : 'text-slate-300'
                          }`}>
                            {h.recruitTarget?.label ?? '—'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Class size summary */}
                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Recommended Class Size</p>
                    <p className="text-lg font-black text-white mt-0.5">
                      {totalMin === totalMax ? totalMin : `${totalMin}–${totalMax}`}
                      <span className="text-sm font-normal text-slate-500 ml-1.5">recruits</span>
                    </p>
                  </div>
                  <div className="text-right space-y-0.5">
                    <p className="text-[8px] text-slate-500">{available} spots available of 85</p>
                    {portals.length > 0 && <p className="text-[8px] text-sky-400 font-bold">{portals.length} position{portals.length !== 1 ? 's' : ''} need portal attention</p>}
                    {criticals.length > 0 && <p className="text-[8px] text-red-400 font-bold">{criticals.length} critical position{criticals.length !== 1 ? 's' : ''}</p>}
                  </div>
                </div>

              </div>
            );
          })()}

          {/* Position-specific views (hidden in overview mode) */}
          {!isOverview && (<>
          <div className="border-b border-slate-800 px-4 py-2 flex flex-wrap gap-1.5">
            <button
              onClick={() => setActiveArch(null)}
              className={`text-[10px] font-bold px-2.5 py-1 rounded-md transition uppercase tracking-wide ${
                activeArch === null
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              Overview
            </button>
            {archList.map(arch => {
              const archPlayers = players.filter(pl =>
                pl.position === activePos && normalizeArch(pl.archetype) === arch
              );
              const archT1  = archPlayers.some(pl => getTier(computeScore(pl)) === 0);
              const archHas = archPlayers.length > 0;
              return (
                <button
                  key={arch}
                  onClick={() => setActiveArch(arch)}
                  className={`relative text-[10px] font-bold px-2.5 py-1 rounded-md transition uppercase tracking-wide ${
                    activeArch === arch
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {arch}
                  {archHas && (
                    <span className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ${archT1 ? 'bg-emerald-400' : 'bg-amber-500'}`} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Sub-header */}
          <div className="px-5 py-2.5 border-b border-slate-800/50 flex items-center justify-between gap-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">
              {activePos}{activeArch ? ` · ${activeArch}` : ' · Position Overview'}
            </p>
            {urgencyBadge && (
              <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${urgencyBadge.cls}`}>
                {urgencyBadge.label}
              </span>
            )}
          </div>

          {/* ── HUB VIEW ── */}
          {activeArch === null && (
            <div className="p-4 space-y-3 flex-1 overflow-y-auto">

              {/* ── Situation Card: verdict + roster + analyst read ── */}
              <div className={`rounded-xl border p-4 space-y-3 ${hub.verdict.border}`}>

                {/* Header row */}
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{activePos} · Position Need</p>
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                    {hub.recruitTarget && (
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
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 border-y border-slate-800/60 text-[9px]">
                      <span className={`font-bold ${rc.isThin ? 'text-red-400' : rc.lacksStarter ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {rc.count === 0 ? 'No players on roster' : `${rc.count} on roster`}
                      </span>
                      {rc.starterCount > 0 && <span className="text-slate-400"><span className="text-slate-600 mr-1">·</span>{rc.starterCount} starter-caliber</span>}
                      {rc.seniorCount > 0 && <span className="text-amber-500"><span className="text-slate-600 mr-1">·</span>{rc.seniorCount} leaving after this year</span>}
                      <span className={`${rc.needsPortal ? 'text-red-400 font-bold' : 'text-slate-500'}`}>
                        <span className="text-slate-600 mr-1">·</span>
                        {rc.nextYearStarters ?? 0} starter{(rc.nextYearStarters ?? 0) !== 1 ? 's' : ''} next year
                      </span>
                      {rc.yr2Starters !== undefined && rc.yr2Starters !== rc.nextYearStarters && (
                        <span className={`${rc.yr2Starters < (rc.nextYearStarters ?? 0) ? 'text-amber-500' : 'text-slate-500'}`}>
                          <span className="text-slate-600 mr-1">·</span>{rc.yr2Starters} yr 2
                        </span>
                      )}
                    </div>
                  );
                })()}

                {/* Analyst read */}
                <h4 className={`text-[11px] font-black uppercase tracking-wide ${hub.verdict.head}`}>{hub.headline}</h4>
                {hub.paragraphs.map((para, i) => (
                  <p key={i} className="text-[11px] text-slate-300 leading-relaxed">{para}</p>
                ))}
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
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                        Current Roster · {activePos}
                      </p>
                      {rc.seniorCount > 0 && (
                        <span className="text-[8px] text-amber-500 font-bold uppercase tracking-wide">
                          {rc.returningCount} returning after {rc.seniorCount} Sr departure{rc.seniorCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    {rc.allPlayers.length === 0 ? (
                      <p className="text-[10px] text-slate-600 italic">No {activePos} players on roster.</p>
                    ) : (
                      <div className="space-y-1">
                        {rc.allPlayers.map((pl, i) => {
                          const q = QUALITY_CFG[pl.quality];
                          return (
                            <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${pl.isSenior ? 'opacity-60' : ''} ${q.bg}`}>
                              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${q.dot}`} />
                              <span className={`text-[10px] font-bold flex-1 min-w-0 truncate ${q.text}`}>{pl.name}</span>
                              <span className="text-[9px] text-slate-500 font-mono shrink-0">{pl.ovr > 0 ? pl.ovr : '—'} OVR</span>
                              <span className="text-[9px] text-slate-500 font-mono shrink-0 w-8 text-right">{pl.cls}</span>
                              {pl.isSenior && (
                                <span className="text-[7px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-950 border border-amber-700 text-amber-400 shrink-0">Leaving</span>
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
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">
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
                          <span className={`text-[9px] font-mono ${t.text}`}>{pl.score.toFixed(0)}</span>
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${g.cls}`}>{g.grade}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Archetype Recommendations ── */}
              {(() => {
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
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">
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
          )}

          {/* ── ARCHETYPE VIEW ── */}
          {activeArch !== null && (
            <div className="p-4 space-y-4 flex-1 overflow-y-auto">

              {/* Recommendation card */}
              <div className={`rounded-xl border p-4 space-y-3 ${
                rec.urgency === 'low'   ? 'border-emerald-800/50 bg-emerald-950/10' :
                rec.urgency === 'high'  ? 'border-red-900/50 bg-red-950/10' :
                rec.urgency === 'empty' ? 'border-slate-800 bg-slate-900/40' :
                'border-amber-900/50 bg-amber-950/10'
              }`}>
                <h4 className={`text-[11px] font-black uppercase tracking-wide ${
                  rec.urgency === 'low'   ? 'text-emerald-300' :
                  rec.urgency === 'high'  ? 'text-red-400' :
                  rec.urgency === 'empty' ? 'text-slate-400' :
                  'text-amber-300'
                }`}>{rec.headline}</h4>
                {rec.paragraphs.map((para, i) => (
                  <p key={i} className="text-[11px] text-slate-300 leading-relaxed">{para}</p>
                ))}
                {rec.target && (
                  <div className="mt-1 inline-block bg-slate-950 border border-slate-700 px-3 py-1.5 rounded-lg text-[9px] font-mono text-slate-300">
                    <span className="text-slate-600 uppercase mr-1.5">Target:</span>{rec.target}
                  </div>
                )}
              </div>

              {/* Tier bar + player list */}
              {matching.length > 0 && (
                <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 space-y-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                    {activeArch} Board · {matching.length} prospect{matching.length !== 1 ? 's' : ''}
                  </p>
                  <div className="flex h-2 rounded-full overflow-hidden gap-px">
                    {TIER_UI.map((t, ti) => {
                      const pct = matching.length ? (tierCounts[ti] / matching.length) * 100 : 0;
                      return pct > 0 ? (
                        <div key={ti} className={`${t.bar} transition-all`} style={{ width: `${pct}%` }} title={`${t.full}: ${tierCounts[ti]}`} />
                      ) : null;
                    })}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {TIER_UI.map((t, ti) => tierCounts[ti] > 0 && (
                      <span key={ti} className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${t.text} ${t.ring} bg-slate-950`}>
                        {t.label} · {tierCounts[ti]}
                      </span>
                    ))}
                  </div>
                  <div className="space-y-1.5 mt-1">
                    {rec.scored?.map((pl, i) => {
                      const g = getGrade(pl.score);
                      const t = TIER_UI[pl.tier];
                      return (
                        <div key={i} className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2">
                          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${t.dot}`} />
                          <span className="text-[11px] font-bold text-white flex-1 min-w-0 truncate">{pl.name}</span>
                          <span className="text-[10px] text-slate-500 font-mono">{pl.stars}★</span>
                          <span className="text-[10px] text-slate-500">{pl.devTrait || 'Hidden'}</span>
                          <span className={`text-[10px] font-mono ${t.text}`}>{pl.score.toFixed(1)}</span>
                          <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${g.cls}`}>{g.grade}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* All-archetypes mini-board */}
              {posPlayers.length > 0 && (
                <div className="bg-slate-950/30 border border-slate-800 rounded-xl p-4 space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                    {activePos} Position Board · All Archetypes
                  </p>
                  <div className="space-y-1">
                    {archList.map(arch => {
                      const archMatches = posPlayers.filter(pl => normalizeArch(pl.archetype) === arch);
                      if (archMatches.length === 0) return null;
                      const bestScore = Math.max(...archMatches.map(computeScore));
                      const bestTier  = getTier(bestScore);
                      const t = TIER_UI[bestTier];
                      const g = getGrade(bestScore);
                      return (
                        <button
                          key={arch}
                          onClick={() => setActiveArch(arch)}
                          className={`w-full flex items-center gap-3 text-left px-3 py-2 rounded-lg transition ${
                            activeArch === arch ? 'bg-slate-800' : 'hover:bg-slate-900'
                          }`}
                        >
                          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${t.dot}`} />
                          <span className="text-[10px] font-bold text-slate-300 flex-1 truncate">{arch}</span>
                          <span className="text-[9px] text-slate-500">{archMatches.length} prospect{archMatches.length !== 1 ? 's' : ''}</span>
                          <span className={`text-[9px] font-mono ${t.text}`}>{bestScore.toFixed(0)}</span>
                          <span className={`text-[9px] font-black px-1 py-0.5 rounded border ${g.cls}`}>{g.grade}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          </>)}

        </div>
      </div>
    </div>
  );
}
